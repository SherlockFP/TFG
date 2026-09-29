# Wave 4 - STEALTH: facility variety, sneaking, sound-hunting creatures (module `stealth`)

Owner ask: "improve the labyrinth-like loot-chasing places, more maze styles, light Backrooms-like rooms; bring silent walking; some creatures work by sound and we can
outsmart them tactically". Status: node-tested (three new test files, the old facility / maps2 / cycle tests stay green), builds, one short headless run
(`tools/harness/wave4_stealth.js`). NOT hand-played, NOT tested with 2 real players.

## What the player gets
| Feature | How it feels |
|---|---|
| **Sneak** | Hold **Alt** (rebindable: `keys.sneak`) or crouch-walk: 2.1 m/s (walk 5.0, sprint 8.2, crouch 2.6), body noise 0.02 (walk 0.30, sprint 0.70, crouch 0.04), footsteps almost silent, **stamina regenerates at the full standing rate** while sneaking (walking 0.7x). Sprint is off while sneaking. |
| **Noise meter** | Right dock, under the Threat meter: `NOISE  SILENT / QUIET / STEADY / LOUD`, a bar and "heard within ~N m" (N = level x 16 m, the hearing radius of a typical creature). Off in the ship / HQ. `game.settings.stealthMeter = false` hides it. |
| **Footstep ring** | A faint additive ring on the floor at each footfall (size = how far a listener hears you, 0.8-9 m, green / yellow / red). Noises other people made (thrown items, doors, the Noisemaker) show as a faint amber ring within 40 m. `game.settings.stealthRings = false` turns rings off. |
| **Surfaces** | metal 1.5x, water / wading 1.5x, gravel 1.25x, tile 1.15x, wood 1.1x, concrete 1x, grass 0.75x, carpet 0.6x, snow 0.6x. The cubicle farm (carpet) is a quiet place, the pool room (water) a loud one. |
| **Other noises** | jump 0.5 (0.1 when sneaking), landing (fall speed / 12), doors 0.35 open / 0.65 shut, items landing (impact speed / 14, glass x1.6), the Noisemaker. |
| **Walls muffle sound** | `CreatureManager.hear()` asks `game.stealth.hearDist()`: every wall crossed on the straight line over the nav grid adds 7 m of "distance" (max 5), every closed unlocked door 3.5 m. A walking player next door (2 m + 7 m) is not heard by a Listener (6.6 m radius), in the same room he is. Applies to EVERY creature that uses `M.hear`. |
| **The Listener** (new) | Eyeless, 170 HP, walk 1.5 / run 8.8, dmg 55, spawns from tier 2 moons (weights 3 / 5 / 7 for tiers 2 / 3 / 4, more in mansion / backrooms / hospital), max 2. Roams slowly. Hears you: freezes 0.75 s (clicks, head tilts: the telegraph) -> sprints to the LAST noise position -> re-targets to newer noises -> sniffs a decoy 2.6 s -> searches 8 s -> forgets. Silent players are ignored; a player closer than 1.05 m is bumped. Hearing radius 22 m x noise: walk 6.6 m, sprint 15.4 m, sneak 0.4 m. |
| **Web Crawler** (existing, re-wired) | Same brain (`CRAWLER_CFG`: radius 19 m, ramps its speed 3 -> 11 m/s, poor cornering, 0.35 s alert). It used to SEE you at 20-26 m; now it hears you (early game friendlier: a sneaking player is invisible to it). `game.config.stealth = false` restores the old sight AI. |
| **Noisemaker** | Cheap throwable (22 credits, shop `consumables`, stack 3, in-hand model = tin cans + bell). Lands after a 0.9 s fuse, then clatters loudly (noise 2.4 every 1.25 s) for 9 s. It is a grenade kind (`grenades_core KINDS.noisemaker`) so throw arc / charge / cook / net all work. Beacons (decoy, 45 credits) still play voices. |
| **Maze rooms** (6 styles) | dfs (long twisty), braid (loops, no dead ends), prim / bramble (many nooks), serpentine (one long hall + shortcuts), spiral (snail), ring (hallway loop with repeating alcoves). 0 on tiny moons, 1 from size 0.95, 2 from size 1.4. Old cycle labyrinths (wings / arena moons, `opts.labyrinth`) are unchanged. |
| **Liminal rooms** | 1 (size >= 0.75), 2 (>= 1.2) or 3 (>= 1.8) of: **cubicle farm** (yellow wallpaper, damp office carpet, U-partitions + desks, low 2.95 m ceiling), **pool room** (white tiles, ankle-deep water sheet, pillar grid, cold light; a loud floor), **hall loop** (ring maze style: fluorescent hallway that circles the room, identical alcoves; finite). Off in `backrooms` (already one big liminal maze). |
| **Dead ends with rewards** | Every maze nook is a loot spot; the host also spawns a **guaranteed prize** (table roll, value x1.25-1.5) in the 2-3 deepest nooks (`config.stealthLoot = false` disables). |
| **One-way drops** | Some deep nooks (max 1 / 2) hold a striped **hatch plate**. Sneak over it and nothing happens; step on it noisily (body noise > 0.14 for 0.32 s) and you drop to a corridor cell 8+ cells away and closer to the entrance, with a crash noise (1.2) where you land. The prize lies ON the plate. |
| **Locked shortcuts** | One extra door between two corridors that are 9+ cells apart by walking distance. Locked from the entrance side ("Locked - The latch is on the other side"), a keypad panel sits next to it on the deep side: `Release the latch [E]` opens it for everybody. It is an EXTRA edge: solvability never depends on it (BFS test). |

## Files
| File | Role |
|---|---|
| `src/world/maze_styles.js` | pure carvers + `mazeConnected`, `mazeDeadEnds`, `pickMazeStyle` |
| `src/world/facility_variety.js` | `varietyOn`, HOOK A `planVarietyRooms`, HOOK B `planVarietyFeatures`, `shortcutInfo`, `buildVariety` (merged geometry, own RNG fork), `installVarietyStyles`, `LIM_TYPES` |
| `src/world/facility.js` | 9 small hooks (`[stealth]` comments): import, HOOK A after the labyrinth rooms, room target + count, styled maze carve, ceiling height of liminal rooms, HOOK B after the distance BFS, shortcut door info, treasure rooms skip liminal rooms, the locked-door rule never unlocks the shortcut, `layout.variety`, `buildVariety` call, `fac.variety` |
| `src/game/stealth_core.js` | pure noise rules: `NOISE`, `SURFACE`, `stepLoudness`, `wallsBetween` / `effectiveDistance`, `NoiseBatcher`, `sanitizeEvents`, `makeRateLimiter`, `bandOf`, `TIPS` (guide registry) |
| `src/game/stealth_creatures.js` | `soundHunter(cfg)` state machine (Listener + Crawler), defs, spawn weights |
| `src/game/stealth.js` | the module: sneak key, surface multiplier, HUD, rings, 'stn' / 'stv', hearDist, door + item-impact noise wrappers, hatches, latch prompt, nook rewards, Crawler re-wire, content registration |
| `src/models/stealth_models.js` | The Listener model (blank egg head, two funnel ears that twitch and turn) |
| `src/game/stealth_text.js` | TR / RU |
Shared edits: `game.js` (import + slot, `lastStepSurface`), `localplayer.js` (sneak flag, speed, stamina, noise table, jump noise), `creatures.js` (`hear()` uses `stealth.hearDist`),
`actions.js` (latch prompt in `doorInteraction`), `grenades*.js` + `models/grenades.js` (noisemaker kind / model / pulse), `save.js` + `ui.js` (key `sneak`).

## Net (all prefixed `st`)
- `stn` client -> host **request**: `{ e: [[kind, x*10, y*10, z*10, loud*100], ...] }` (ints, <= 6 rows). Client side: token bucket 8 / s, duplicates within 180 ms and 1.5 m merge into the louder one, flush every 120 ms.
  Host side: per-sender bucket 10 / s (burst 12), events must be within 70 m of the sender, loud clamped to 3.0.
- `stv` host -> everyone (`HOST_ONLY`): `{ e: [[x*10, z*10, loud*100, kind]] }` rings for events louder than 0.25 (<= 12 / s).
- Continuous footstep noise still travels in the existing `ps` state (`n` field), nothing new there.

## Tests (node, no browser)
- `node tools/harness/stealth_maze.test.mjs [seeds=200]` - 6 maze styles x 10 shapes connected; **8000 facilities** (8 themes x 5 sizes x 200 seeds): solvable with locked doors as walls,
  exit + fire exits reachable, hatches land on reachable nearer corridor cells, shortcut is an extra edge with the latch on the deep side, determinism, off switches, cycle cores untouched.
- `node tools/harness/stealth_noise.test.mjs` - loudness table, wall / door attenuation on real nav grids, batcher, sanitizer, rate limiter.
- `node tools/harness/stealth_listener.test.mjs` - the real `soundHunter` against a fake manager: silent player ignored (even at 1.4 m), bump = hit, walk 5.5 m heard / 8 m not, sprint 14 m hunted,
  decoy chain `idle > alert > hunt > inspect > search > idle`, re-targeting, hit reaction, crawler ramp.
- Also green: `wave1_facility_paths.mjs`, `maps2*.test.mjs`, `cycle2_plan.test.mjs` (assertion relaxed: variety mazes are flagged `varMaze`), `cycle2_flow.test.mjs`, `grenades.test.mjs`.
- Headless: `flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port PORT --script tools/harness/wave4_stealth.js --shot out.png --wait 4000`.

## Knobs
`game.config.stealth` (false = old sight AI for the Crawler, no wall muffling, no noise events), `game.config.stealthLoot` (false = no extra nook prizes), `game.settings.stealthMeter`, `game.settings.stealthRings`,
`globalThis.__kefalVarietyOff = true` / `generateLayout(..., { variety: false })` (facility exactly as before wave 4), constants in `stealth_core.js` (`NOISE`, `SNEAK`, `SURFACE`, `WALL_COST`, `DOOR_COST`),
`LISTENER_CFG` / `CRAWLER_CFG` / `LISTENER_SPAWN`, `varietyCounts()` (rooms per size), hatch probability 0.45 in `planVarietyFeatures`.

## Guide tips (for the `guide` registry: `game.stealth.tips` / `import { TIPS } from 'src/game/stealth_core.js'`)
`sneak`, `noise_meter`, `listener`, `crawler`, `lure`, `hatch`, `shortcut`: `{ id, title, body }`, English keys with TR / RU in `stealth_text.js`.

## Known gaps / honest critique
- Nothing was hand-played; the numbers (radii, speeds, spawn weights) are design values. The Listener at run 8.8 m/s vs sprint 8.2 m/s is only escapable through doors, corners or the early-sector speed cap (`balance.speedCap`).
- Sound propagation is a straight-line wall count, not real path acoustics: a noise around a corner through an open doorway is attenuated more than real life, and thin doorway edges count as walls when the line misses the door centre.
- The Listener's model / animation was never seen in a browser; the sounds reuse existing samples (`beep_3` click, `hound_growl`, `lurker_snap`) - a dedicated click loop would sell the "eyeless" idea.
- The Crawler is now easier for careful players (it no longer sees you) but a new player who sprints is caught from 13 m away instead of 20+ m: verify the early game feel.
- Hatch fall has no damage and no fall animation (teleport + shake); a chute tunnel / darkening would read better. No hatch on non-factory decor variants.
- The shortcut latch is a keypad prop, not an animated lever; the door prompt tells you which side it is. The interaction only reaches the host through the existing `unlock` request (any peer could unlock any locked door: pre-existing behaviour).
- Pool room water is a visual sheet (no wading zone / splash sound); the noise meter treats the pool room as water. Cubicle partitions are chest-high boxes (no doors), desks / chairs come from the shared prop set.
- Facility lights: liminal rooms use the normal lamp rows (LightPool), pool rooms add 2-4 cold emitters; no runtime light-count changes.
- Noise events from doors are host-side only (creatures open doors silently by design): a client's door noise reaches the host because the host wrapper sees the 'door' request result.
