# wave8 perf4 - landing job queue (module `landQ`) + Nyquist clamp

Task: docs/session/CONTINUE.md 4.1 / docs/wave8/perf3.md "remaining": `hostLever` + `hostFinishLanding` blocked the main thread 3.2-5.0 s (headless, software GL).

## Where the time goes (node, stub physics/lights, ms; single run each, `LANDBENCH=1 node tools/harness/landingq.test.mjs`)
| step | ms |
|---|---|
| `buildMoonOutdoor` (terrain, decor, colliders) | 130-230 |
| `generateLayout` | 20-35 |
| `buildFacility` (geometry, props, doors, set pieces) | 410-425 |
| ~40 `mapLoaded` handlers (worlds3 dress, repomaps, labyrinths, feedcams, facjobs, mining chunks, mapart, soul beats, lcmonsters, crdirector, fauna, secureloot, chests, eggs, horror...) | not measurable in node (need scene/DOM); measured in the browser by the queue itself |
| first draw: shader compile + GPU upload of everything above | the rest of the 3-5 s; software-GL pessimistic |
So the fixed node-side cost is only ~0.6-0.7 s; the rest is handler work + first-frame compile/upload.

## Fix (unverified in a browser)
- `src/game/landingq.js` `LandingQueue` + `installLandQ` (`game.landQ`): jobs run in FIFO order, >= 1 per frame while a per-frame budget lasts (8 ms, grows to 60 ms on slow frames so the queue still ends inside the 9 s descent), 0.35 s start delay so the title card / thrusters render first. `last`/`report()` = per-job ms.
- `game.js loadMapFor(run, instant=false)`: steps `outdoor`, `layout`, `facility` (`company`/`customMap`: one step) then `mods.emitSliced('mapLoaded')` (one job per handler, named after the registering file) then `prewarm` (`renderer.compileAsync(scene, camera)` against the engine render target, once, during the descent). `moon.size` / layout opts are read at call time (worlds3 patches them around the call). Late join / resume (`instant`) is still synchronous.
- Determinism: same jobs, same order, same seeds on every peer; the queue only changes WHEN they run.
- Safety: `onPhase` (any phase but landing), `hostFinishLanding` and instant `loadMapFor` call `landQ.flush()`; `unloadMap` calls `landQ.clear()`; the `phase:landing` mod event is queued after the map so handlers still see a built facility. Nothing populates a half-built map.
- Disposal: unchanged (`facility.dispose`, `outdoor.dispose`, gpusweep); the prewarm only fills the shared program cache (no per-landing growth).
- Kill switch: `kefal.game.landQ.enabled = false` (old behaviour).
- `src/core/events.js`: `Emitter.emitSliced`, and `mapLoaded` handlers are tagged with their file at registration (stack, once per handler).

## Oscillator warning (`frequency.value 21096 / 25087`)
25087 = midiToFreq(127) x 2, 21096 = midiToFreq(124) x 2: the distorted-guitar "feedback" sine in `audio/instruments.js` (`midiToFreq(midi) * 2`) and the other oscillators there run above Nyquist (24000 @ 48 kHz). Clamped at the source with `fq(f) = min(f, sampleRate/2 - 100)` in `instruments.js` (feedback sine, keytar saw/square, FM electric piano, drum sweeps), `score_stems.js osc()` and `ui/menupiano.js`.

## Not done / not verified
- No browser run (QA owns it): before/after landing ms are NOT measured. Expect: the landing frame drops to the outdoor step (~0.15-0.25 s), the rest spreads; check `kefal.game.landQ.report()` for the costliest handler jobs and slice those further.
- One handler = one job: a single 200 ms handler still hitches once. `hostPopulateMoon` (item/creature spawn at touchdown) is not sliced (wrapped by ~6 modules, order-sensitive).
- compileAsync only warms materials present at that moment; creature/item models spawned later still compile on first sight.
- Which caller produced the warning is inferred from the numbers (midi 124/127 x2), not caught live.
- Test: `node tools/harness/landingq.test.mjs` (queue order/budget/flush/clear, emitSliced, clamp presence); perf2, zfixperf, worlds3, labyrinths, repomaps, feedcams, soul, atmos, sfx, mining all pass; `npm run build` ok.
