# First sighting as a lit silhouette (wave 9, task 'sighting')

Rework of the wave 8 beat (docs/wave8/firstsight.md). The old shot showed two orange dots (3.6 % of the frame, 15 m, unlit, 3.5x zoom).

## What changed
- **Nearer.** The creature is placed 5.5-10 m ahead in the view cone (was 12-20). Candidates every 5.5 / 6 / 7 / 8 / 9 / 10 m (`FS.dists`), preferred 6 m (`dPref`), distance costs 0.15 per m. `near` abort 3.5 m (was 5).
- **Lit.** `findSpot` scores lamp light (`litBonus` 1.1, about 7 m of distance). If any candidate in the cone is under a lamp (`lit >= litMin` 0.15) the unlit ones are dropped. Emitter reach is 0.7 x its distance (was 0.55).
- **Practical for lamp-less rooms.** Client-side warm emissive lift (`FS.lift`, ramps in over 0.6 s) on the staged body's non-basic materials. It wraps `model.setHitFlash`, is restored on `out` / phase change / dispose. No light is added; damage ends the beat, so the flash colour is not needed while it is on.
- **Label after 2 s.** `firstSight.labelHold(id)` is true for the first `FS.labelAfter` (2 s) of the beat; `identify.js` hides the aim read-out '??? UNKNOWN ENTITY' while it is true (one condition on the hide line).
- **Gentler zoom.** `zoomMax` 1.8 (was 3.6), `zoomCover` 0.08.
- `crdirector.js` is untouched (the stage / teach / cue / dip hooks are enough).

## Measured (hamsi, fresh tab, runId r1, Keeper, 1280x720, one landing)
`docs/wave8/qa_shots/firstsight2.jpg` (48 KB): Keeper at 7.0 m under a ceiling lamp (lit 0.88), zoom 1.78, stare, label shown after 2.2 s (hidden at 1.3 s: verified via the `.g2-aim` element).
- Body meshes alone rendered flat white: **2.02 %** of the frame (pixels); projected vertex bounding box **3.72 %**.
- Readable: lit silhouette, hood, hands and both eye dots, with the label. Before: two dots.

## The 8 % target is not reachable with these constraints
A Keeper is 2.25 m x 0.8 m. 8 % of the frame needs the frame to be about 3.6 m tall, which is 4.5 m away at 1.8x, 7 m at 2.9x, 10 m at 4x. So "6-10 m, <= 1.8x, >= 8 %" cannot hold together for a thin body; the beat would have to become a near encounter (and it would fall inside the abort radius). What was kept: 5.5-10 m, <= 1.8x, lit, label 2 s. Options for the owner: accept about 2-4 % (a lit body, readable), or allow 2.5-3x zoom, or stage at 4-5 m only for wide bodies (Spider, Robot).

## Test
`node tools/harness/firstsight.test.mjs` (34 checks, updated for the new distances, lamp filter, zoom cap, label / lift knobs). Also ran: crdirector, threatmerge, creature_read, lcmonsters, balance_rules, onegoal, `npm run build`.

## Known gaps
- Only the Keeper was shot (hamsi). The other 3 pool creatures and the other hero moons are unshot.
- The warm lift is untested on models whose materials are shared between instances (it would tint the others while the beat runs).
- Outdoors: no lamps, so it relies on the lift alone.
- Headless runs: 3 (the first two were spoiled by my own script letting the beat fire during spot probing; only the third produced numbers).
