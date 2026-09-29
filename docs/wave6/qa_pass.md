# Wave 6 browser QA pass (headless swiftshader, 1280x720)

Environment note: this box runs a simulation tick in about 0.3-0.45 s (render off), so one landing costs 55-90 s and long scripts hit the 600 s limit.
Long scripts should return partial results (see the Promise.race wrapper idea in wave6_algo2.js history) or use fewer ticks.

| feature | ran? | errors | visual verdict | fixed (file) | still broken / open |
|---|---|---|---|---|---|
| wave5_lockpick2 | yes | none (xp 43, 2 opened) | Algorithm dial readable | Morning-vote overlay covered it: `src/game/algo1.js` (no vote during Hiring Day / minigame) | - |
| wave5_onboard (?hiringday=1) | yes, 10 shots | none, 17 scene lights, 7 draw calls wing | cell, corridor, blackout, lockers, hangar, ship all render; text on the cell door sign is pixel-garbled at 640 px | `algo1.js` vote popped over the whole tour | Algorithm subtitle box (bottom, `.algo-sub`) covers the "BOARD THE MINI-SKELD [E]" prompt when it wraps to 4 lines at 720p |
| wave5_shipdeck | yes, 6 shots | none | stair well, deck rooms, dome, hull all fine | - | - |
| wave5_chess3d | yes | none | board fills the view, but the bottom HUD panel hides white's home ranks at 720p | script: matrices were stale before projecting squares (`wave5_chess3d.js`) so no click ever hit a square | re-run after the script fix not done; HUD panel vs near ranks is open |
| wave5_zones (hamsi) | yes | none | n/a | script: zone A needs quotaIndex 1 and a 25 s clear timer (`wave5_zones.js`) | re-run after the fix not done |
| wave6_zones2 (orkinos) | yes (6 min) | none | walls/pillars visible, dark red night scene | - | - |
| wave6_story | yes | none | avatar overlay, dock, terminal text OK | - | - |
| wave5_algo1 | yes | none | vote card + viewers OK | vote is resolved after key press (verified in a debug run) | - |
| wave4_maps5 | yes | TypeError was the SCRIPT: it lands twice without a takeoff so the 2nd lever is ignored | n/a | script: takeoff before each landing (`wave4_maps5.js`) | re-run after the fix not done |
| wave4_homeworld2 | no (600 s timeout was the 2400-tick production loop at ~0.4 s/tick) | - | - | - | shorten `tick(2400)` to ~600 to run here |
| wave6_home3 | yes, 9 jpg | none, decor present (735 solids, 83 fence), +22 calls / +17k tris vs bare | Off-Grid Claim reads well: aurora curtains, moon logo, robot billboard, pylon/drone eye, pad rings; ground is very dark | - | ground is nearly black next to the skyline (subjective) |
| wave6_algo2 | partial x3 | none | - | script: wait for orbit after takeoff (`wave6_algo2.js`) | verified: glitches spawn + meshes, hype, glitch use raises patch meter to 30 (punishment), ghost stored (948 chars). NOT verified: sponsor crate payout, ghost replay on 2nd landing (script exceeds time here) |
| wave6_mapart, wave5_zfixperf_plateau, main menu look, HUD declutter, landing fall check | no (stopped by lead for speed) | - | - | - | scripts ready in /tmp/qa (menu_look.mjs, fall.js); not run |
| Soviet stairs (worlds2) | yes x2 | none | - | script: per-flight climb + death hook (on main) | Flight 0 climbed 3.02 m in run 1 (stairs fix confirmed for one storey). In both runs the player was later put back inside the ship (`inShip` true, hp reset): probably a death/void reset, cause not found; flights 1-2 unverified |

Other notes
- `Oscillator.frequency.value 21096 / 25087 outside nominal range` warnings repeat many times during play (audio code sets a note far above nominal). Harmless but noisy.
- A Vite dev server started before a merge keeps 404-ing new `public/mods/*.js` files; restart it after merging.
- Tests run: algo1.test.mjs, algo2.test.mjs pass; `npm run build` OK.
