# Wave 8 night - CAMERA VERB IN THE FIRST 90 SECONDS (REVIEW_W8_NIGHT backlog 8)

The ship -> entrance walk is 42-75 m (pacing.md). The core verb ("red light = you are live, heat brings them") is now learned on that walk, before the first door.

## What
- **Outdoor path drone** (`feedcams2_core.planPathDrone`, wired in `feedcams2.ensureDrones`): ONE slow patrol drone with a lit disc (`DRONE.R` 5.5 m) on EVERY landing, day 1 too, day AND night (the night drones by the entrance are unchanged; `d.day` marks the new one). Seeded (`seed ^ day`), centre 42-60 % along the ship -> entrance line, 4.5-7 m to one side, loop 3.6-4.8 m, lap 40-54 s. Spots are rejected (up to 8 tries, side flips) when they are water (`floodY`) or inside a solid (`outdoor.solidAt`). Reuses the drone visuals (instanced body + beam + ground disc, snapped to `heightAt` every frame, so no floating; stronger warm disc by day), LOS ray vs `G.STATIC` (rocks / props / soul beats block it), `fc.expose` (live meter, heat, tag), noise bait, taser zap, rifle tracer, Signal Jammer, mapart pylon / cut-the-feed blackout (`netOff` hides the light).
- **Readable cone + obvious blind route**: the direct line is lit for part of every lap (timing lesson); `blindOffset(d)` (about 9 m) to the flank AWAY from the drone is never lit (node-verified over 40 seeds). Rocks / props also cut the LOS.
- **Expedition moons**: `out.ex` (barge / dune / roof) never gets outdoor drones (`want` is null; barge already hid `plan.entrance`).
- **Hint, once per profile** (`profile.hints.cam90`): "Red light = you're LIVE. Heat brings them." via `lore.say(..., pri: true)` (a teaching line: passes the firstrun / onegoal Algorithm budget) when you are within 32 m of the drone.
- **Heat visibly pulls the director** (`crdirector_core.heatPull`, PULL): a calm with live ON AIR heat >= 35 is cut to 12 more seconds (once per calm; not before 25 s of the calm, the first calm of a landing not before 78 s, so the ~90 s safe window stays). The host sends the existing `cd` `ph` message with `hp:1` (no new net type); every peer shows the caption "HEAT — the stream is calling them in." through `caption()` (arrival card timeline `fr.slot` + `fr.lease`), max 2 per landing, then the normal TRAFFIC SPIKE follows.
- **No double-teaching**: the outdoor drone owns "dodge it": reaching the entrance (14 m) without ever having been live pays TUT_PAY (20) once per run and calls `onboard.fr.camDone()` (ends the field-cam objective). The indoor tutorial camera (day 1, 1 camera) becomes the "cut the feed" lesson: tip 8 is now "Same red light indoors. This time cut the feed: the junction box [E] on the wall, or spray the lens."; its green blind-ring pass pays only when no path drone exists; a junction cut / spray on it pays TUT_CUT (10) once per run (`run.fcTut2`).

## Knobs
`PATHD` (feedcams2_core), `PULL` (crdirector_core), `TUT_CUT` (feedcams_core). Strings EN/TR/RU in `feedcams2_i18n.js`, `crdirector_i18n.js`.

## Tests
`node tools/harness/cam90.test.mjs` (40 seeds: on-path, deterministic, lit direct line, dark flank, predicate, heat-pull floors, day-1 module smoke, expedition none, TR/RU). Also: feedcams, feedcams2, firstrun, onegoal, crdirector, geomfix, pacing, soul, expeditions + `npm run build`.

## Not verified / gaps
No browser run (quota): the day-light look of the disc, real-map rock cover, peers' hint timing. `onboard.js` (routeboard's file) still shows `obj.field_cam` ("stay out of its cone, or slip under it") until camDone fires; it stops once the outdoor pass pays. Suggest routeboard rewrites that objective to the "cut the feed" wording.
