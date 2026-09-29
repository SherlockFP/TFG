# feedcams (wave 8, module `feedcams`)

Core verb of the game: **the Algorithm films you; dodge the camera or cut the feed.** Files: `src/game/feedcams.js` (runtime), `feedcams_core.js` (pure rules), `feedcams_i18n.js` (EN/TR/RU), `tools/harness/feedcams.test.mjs`. Slot `feedcams` in game.js. Net prefix `fc`.

## What the player sees
- Wall cams (narrow, 13 m) and ceiling domes (wide, 10 m) in facility rooms. Body + REC lamp are instanced meshes; the floor cone is one dynamic merged mesh (additive, no lights), clipped by walls with static rays at build; a faint envelope shows the whole sweep, so gaps in it are the blind spots.
- Lamp: slow red blink = watching, fast flash + brighter cone = locking on you, amber = blinded, dark = dead, green blink = network cut.
- Seen ~3 s (1.6x faster inside 6 m, 0.55x slower + 20 % shorter range when crouched) = **ON AIR**. Edge vignette grows with your lock meter; while live the existing `.algo-live` tag turns red and gets `| ON AIR`. Stays live 8 s after the last exposure. A lock that decays to 0 after passing 50 % is a **juke** (+viewers, +hype through algo1 `escape`, toast; max once per 45 s).
- Density: `camCount` = 1 on day 1 of a run (the tutorial camera: slow sweep, first room from the entrance), 3 on day 2, 4 after that on quota 0, <= 6 on quota 1, then 4-10 by facility size. Four one-time Algorithm one-liners (localStorage `tfg.fc.tips`): first camera nearby, first lock, first ON AIR, blind spot (tutorial cam).

## Rules (all knobs in `FC`, feedcams_core.js)
- Host vision at 10 Hz: cone test (range, sweep angle, inner blind radius `r0`), then one `physics.lineOfSight` (static + doors) per candidate; meters per player.
- **Heat** (per day, run.fc.h): +3/s x sqrt(players live), -1.2/s otherwise, +8 per new live. >= 30: a noise ping at the live player every 20 s (`creatures.noise`); >= 65: the next scheduled creature wave is pulled to <= 4 s (budget-gated, `crdirector.canSpawn('feedcams', pos)` may veto; optional `crdirector.onFeedHeat(heat, positions)` hook).
- **Viewer tax**: scrap held by a live player is marked; when a marked item reaches the ship (carrier inside, or lying inside) its value drops 25 % (min 1, once per item) via the normal `it/val` event (floating -▮ + sound). Totals: toast, sale toast (`run.fcTax`, reset on sale), day summary lines `VIEWER TAX` / `OFF THE FEED` (clean-run praise, no bonus). Chosen over an off-feed bonus: no inflation and it reads in one glance.
- Counter-play: spray paint on the wall / ceiling within 1.7 m of a camera (blind 40 s); melee 2 hits (dead, reach 5 m from feet); any `cb/tr` rifle tracer through it (dead); Zap Gun ray (blind 25 s); loud noise >= 1.5 within 22 m turns a camera toward it for 5 s (wall cams keep to +-72 deg); facjobs `feed` job done = whole network dark 150 s (also clears everyone's meter); mapart pylon cut (`game.mapart.offStream()`) also blinds it.
- Sync: `run.fc` = { ck, c: [[state, until, baitH, baitT0, baitT1, seeing]], p: {id: [meter %, live]}, h, tx, tn, lv, as, off }; broadcast <= 4 Hz on change (5 s clock refresh). Clients derive the servo angle from `ck` offset with the same pure `camYaw`. Nulled on `orbit`.

## Test
`node tools/harness/feedcams.test.mjs` (150 layouts: determinism, counts, mounts inside rooms, one cam per room, tutorial cam near entrance, sweep / cone / blind spot / crouch / bait / 3 s delay / juke / heat / tax / TR+RU strings). In game: land on any regular moon, look for the red lamp near the entrance room; stand 6 m in front of it for 3 s.

## Known gaps
Not browser-run (visual feel, lamp colours, cone alpha unverified). No junction-box cutting (plan already carries `jb` path/position), no outdoor cameras (mapart drones/pylons remain the outdoor layer), no drone cameras. Cone ignores props and open doors (sight uses live rays). Numbers untuned; needs a 2-player pass.
