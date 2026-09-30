# wave8 perf5 - steady-state per-frame cost of the wave-8 modules (node profiler + fixes)

Owner: "the game stutters". ~25 modules were added tonight; this pass measures the STEADY-STATE cost of every `mods 'update'` handler (not the landing, that is perf3/perf4) and cuts the waste.

## The profiler: `node tools/harness/perf5.test.mjs [--ticks N] [--json] [--errors] [--tonight] [--moon id]`
- Parses `game.js` (imports + `useModule` lines, lazymods included) and installs the REAL modules in game.js order on a stub game: ~105 of 106 install (`guide` needs a real terminal). Systems that are not built (ui, audio, engine...) are inert "ghost" objects; physics is a stub, the facility (`generateLayout` + `buildFacility` on hamsi), 4 players and 6 creatures are real objects.
- Lands the day with the real event sequence (`mapLoaded`, `phase landing/moon`, `moonPopulated`, `netReady`), 240 warm-up ticks (JIT, lazy init), then 600 ticks at 60 Hz through the real `mods.emit('update')`; `creatureRead.apply` is driven per creature per frame like `entities/creatures.js` does.
- Per handler: avg / median / max ms, heap bytes per call, count of ghost reads (a Proxy cost that inflates ms: judge a row by ms AND ghost reads), and per-second counters of DOM writes (`innerHTML`, `textContent`, style writes), `querySelector*`, layout reads (`getBoundingClientRect`, `offset*`), `createElement`, canvas ops, THREE raycasts and physics rays.
- Allocation: a second pass under the V8 sampling heap profiler (`node:inspector`), bytes/tick attributed to the allocating source file and function.
- Also lists SPIKES (> 0.5 ms samples with their tick numbers, to spot periodic work), the probe overhead (an empty handler: 0.0003 ms), and `--errors` prints the exceptions the handlers threw on the stub (a stub gap shows up as a per-frame exception storm, which is very expensive and misleading: fixed by making ghosts return ghosts).
- Budgets (exit 1): sum of medians < 1.2 ms, no handler median > 0.15 ms, DOM churn/s (html, qs, rect, create, text < 120, style < 220), raycasts, and allocation of feedcams / shipyard_core / creature_read.
- Caveats: node + stub, so ms are relative (the browser has the same JS, a real GPU/DOM/physics on top). Heap deltas per call are coarse (allocation-buffer granularity), the sampling-profiler table is the reliable one.

## What it found (before) and what was fixed
| finding | fix | measured (median of 5 runs, before -> after) |
|---|---|---|
| HUD code writing the DOM every frame with unchanged values: stealth meter (5 writes + a `tf()` string fill per frame), night-vision overlay (3 style writes), chase vignette, voyage marker labels (5 writes per marker per frame) | new `src/ui/domdiff.js` (`setText/setStyle/setHTML/setClass`, write-if-changed) used by stealth, nvgear, chase, voyage; stealth compares the rendered text so a language switch still updates | text writes/s 221 -> 41 (-82 %), style writes/s 441 -> 81 (-82 %); stealth handler 0.0141 -> 0.0054 ms |
| `shipyard` `eff()` re-ran `Y.effects(cur)` (walks every socket, ~40 `tierOf` scans) several times a frame | memoised per `cur` object (replaced, never mutated, on every sync) | shipyard_core 5838 -> 0 B/tick, handler 0.0145 -> 0.0032 ms |
| `feedcams` `visuals()` rebuilt every camera's floor cone every frame and created 2 closures per camera per frame | cone + sweep at 30 Hz (a camera turns ~1 rad/s), one shared writer object instead of closures | feedcams 3172 -> 1295 B/tick; 2x fewer cone rebuilds |
| pets: `C.ensurePets(profile)` (re-sanitises every stable pet + skin sets) ran on every `state()` call, several per frame from pets / pets_net / pets_incubator | `pets_core.petStateMemo` (re-normalises at most every 0.25 s of game time, same object in between) | removes the per-frame `newPetsState` + sanitise churn (1.4 KB/tick here with 0 pets; grows with the stable) |
| `anomaly` update copied the buff map and built a literal table of 5 arrays every frame | collect expired only when some expired; table built once | handler 0.064 -> 0.047 ms |
| `combat_kit` / `grenades` update loops created a closure per updater / anim / sub-system per frame (9 in grenades) | `safe1(label, fn, arg)` call form, no closure; grenades skips the anim pass when empty | combat_kit 970 -> 0 B/tick, grenades 0.0067 -> 0.0058 ms |
| `food.sendState` built an object + `JSON.stringify` every frame just to detect change | field-wise compare | food 0.0163 -> 0.0134 ms |
| `creatureRead.apply` allocated 2 pose objects per creature per frame (+ `Math.hypot`) | scratch objects (exported `windupPose/bobPose` unchanged for tests), `Math.sqrt` | same pose maths (creature_read.test 72 types ok) |
| `roulette` animated + re-set text of every table model every frame, also tables 100+ m away | tables beyond 60 m are skipped (they animate from their targets again on return) | 0 B/tick from models/roulette |
| `Emitter.emit` used `fn(...args)` per handler (array iteration per call, ~105 'update' handlers) | fixed-arity calls for 0-3 args | part of the whole-emit median 0.856 -> 0.818 ms |

Not a bug, checked and left alone (already throttled / gated / cheap on the stub): feedcams host vision (10 Hz, LOS only inside a cone), feedcams2 (drone tick 10 Hz), highlights (10 Hz sample), carry2, crdirector, onegoal, rewardviz, sound2, expeditions, labyrinths, routeboard, lcmonsters, hudcalm, loaner, threatpool (no update handler), lore ship board (0.4 s, camera gate), hud `layoutRight` (8 Hz), docklayout (4 Hz), magic mana dock (15 Hz). Their medians are all 0.0004 - 0.023 ms per tick on the stub.

## Totals on the stub (median of 5 runs)
| metric | before | after |
|---|---|---|
| sum of handler medians, ms/tick (105 handlers) | 0.570 | 0.532 |
| sum of handler averages, ms/tick | 0.757 | 0.724 |
| whole `emit('update')` median, ms | 0.856 | 0.818 |
| DOM text writes / s | 221 | 41 |
| DOM style writes / s | 441 | 81 |
| attributable allocation, B/tick (top files) | shipyard_core 5.8 K, feedcams 3.2 K, combat_kit 1.0 K, anomaly 0.7 K, roulette model 0.8 K | 0, 1.3 K, 0, 0, 0 |

The JS totals barely move because the stub has no real data (no scrap, HUD, GPU); the meaningful wins are the DOM writes (each unchanged style/text write is a style invalidation in a real browser) and the per-frame garbage.

## Not verified / remaining
- No browser run (QA owns it): stealth / nvgear / voyage / chase HUD look identical by construction (same values, written only when they change) but was not seen.
- The stub cannot show what a real DOM costs (layout after those writes), GPU, Rapier, or the creature manager; the hitches the owner feels are likelier the first-use ones (landing 3-5 s, perf4 queue) than steady cost, as perf3 found.
- Left alone (small on the stub, unverified in a browser): `football.hostBumps` allocates one `{x,z}` per player per frame, `mirror.patchViews`, `horror_closet` (~1 KB/tick each), `facilitysys` / `facsys.refresh` stringify a state array per frame as change detection, `Math.hypot` in ~700 call sites (builtin allocates on the slow path), `(native) next/values` iterator objects from `for..of` over Maps (~16 KB/tick total, spread over all modules).
- `petStateMemo` delays the pets-state clamp (MAX_STABLE, invalid entries) by up to 0.25 s of game time after a direct mutation of `profile.pets`.
- Test: `node tools/harness/perf5.test.mjs` (also `--json`, `--tonight`); perf2, zfixperf, aimchase, anomaly_core, creature_read, feedcams(2), food(_install), grenades, nvgear, pets(_sim), roulette, shipyard(_install), stealth_*, survival(_install), voyage, balance_rules, landingq, downed, crdirector, carry2, highlights, hubgate all pass; `npm run build` ok.
