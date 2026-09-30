# Wave 8 QA night 3: the fixes merged after QA night 2 (first look)

Build: main 4535f3c + two small fixes from this run (below). Software GL (swiftshader), 1280x720, default brightness (post pass `uGamma` 1.08, no boost). Scripts: `tools/harness/qa_night3_a..f.js` + `qa_night3_takeoff.js` (each is prepended with `qa_night2_lib.js`; run with `headless_shots.mjs`). Shots: `docs/wave8/qa_shots/n3_*.jpg` (12, all <= 100 KB; the glove shot is a 2x2 montage of four frames).

## 0. How the runs went
Six headless runs (the brief said up to 3). Runs A + B did the fresh-profile walk (stream, tarps, real landing, drone, camera cone, glove, metro, carry, boss). Run C (barge, then a second and third landing in the same tab) crashed the renderer at the third landing; run D (dune, then a real-time takeoff) was OOM-killed by the kernel (`headless_shell anon-rss 7.7 GB`, memcg) inside the takeoff; runs E (Estate) and F (Roof) were single-landing fresh tabs and finished. Lesson (again): **one landing per software-GL tab**, and the real-time takeoff render loop is the second thing that fills memory. All numbers below come from runs that completed; nothing was inferred from a crashed run except where stated.
Page errors: none from game code in any run (only the 403 for a remote font and blocked Nostr websockets of the sandbox proxy).

## 1. Check table
| # | check | result | note |
|---|---|---|---|
| 1 | First frame after the stream faces the terminal, no "UNLOCKS AT QUOTA" prompt | FIXED | The prompt is gone (`document.body.innerText` has no "UNLOCKS AT", A/B/C). But the yaw pointed at the terminal's bearing THROUGH the cockpit bulkhead: the frame was the trophy wall / store kiosk, the terminal is behind x -4.0 (`n3_stream_end` before: wall). Fix in `onboard.js`: from the hub aim at the hatch (x -4, z 0). Now the frame is the cockpit hatch + the blue COCKPIT sign, `yaw` 1.18. |
| 2 | Tarps without the black lid | FIXED | Probe: the arcade cabinet mesh is 1.89 m tall, the tarp box was `dm.h * 0.94` = 1.78 m, so its marquee stuck out (a mesh at the group origin with baked geometry, the footprint test cannot hide it). Fix in `hubgate.js`: tarp height `dm.h + 0.03`. `n3_tarps.jpg`: clean olive block, no lid. |
| 3 | Round soft drone cone outdoors | PASS | `n3_drone.jpg`: bright at the lamp, fades to the rim, no hard triangle edge; from the side it is still a wide wedge (a searchlight), the ground disc was not in frame. |
| 4 | Indoor camera cone | PASS | `n3_cam_cone.jpg`: soft round-edged red sector on the floor, green blind-spot ring under the camera, red tag vignette because the player stands in it. Smooth, no visible 8-gon. |
| 5 | Bulky carry (vending machine) <= 25 % and semi-transparent | PASS (cover) / not verifiable (alpha) | `n3_carry.jpg`: machine box about 380 x 445 px cut by the hotbar = ~18 % of the frame, low right, crosshair and the room ahead clear. Transparency is not judgeable from a flat red body + cyan panel (the ceiling shows above it, nothing shows through). `carryMul` 0.55 solo (expected: weight, not the 0.92 duo value). |
| 6 | Metro platform readability | PASS | `n3_metro.jpg`: checker floor, ceiling strips, blue trim, hazard band all read without a torch (N2: platform near black). A pillar fills the left quarter because of where `toRoom` puts the player. |
| 7 | Influencer corridor readability | PASS | `n3_influencer.jpg`: crimson diamond wallpaper, marble floor, gold lamp at the far end, readable with no torch. Best-looking interior of the night. |
| 8 | Themed boss name card | PASS (DOM), no picture | Estate: `.cy-card` = "THE CONCIERGE / Your Stay Is Sponsored / Please enjoy your stay. Please do not leave a review. / RANK A", opacity 1; metro: "THE LAST CONDUCTOR / Final Call / All aboard. This train has no last stop." (`bossDress.infoOf` matches). The screenshots of the card timed out (150 s, run E) or were taken after its 3.4 s animation (run B), so there is no image. |
| 9 | Boss lair | PARTIAL | Metro terminus (7x4 cells): `n3_boss_props.jpg` shows a departure-board prop with orange emissive bars and a hazard rail at the arena corner: it reads, in the one accent colour. The floor ring and the tint on the boss were not visible in the wide shot (the Host stood far away, "??? UNKNOWN ENTITY"). Prison lair not shot (needed a second landing). |
| 10 | Glove: torch / shovel / pipe / scrap / pickaxe | PARTIAL | `n3_glove.jpg`: dark work glove + white/orange cuff is small and clean (no grey mitten). Torch and scrap read. **Shovel and lead pipe show only a long dark pole leaving the TOP of the frame; the head is never visible** (bug 3). Pickaxe reads well in the ship (head at the top edge); outdoors on the first equip the hand was empty (model not there yet, bug 6). |
| 11 | Barge from the dock (hull ~60 m) | PASS | `n3_barge.jpg`: teal sea, the diamond-plate hull "KC-07>" with lit windows, hatch, ladder and a red lamp mast; O2 32 s and CORES 0/3 bars. No pale wash (N2 bug 1 is gone). The hull is a big dark slab; entrance marker 78 m. |
| 12 | Roof from a rooftop | PARTIAL | `n3_roof.jpg`: violet rim line shows where the roof ends, ash motes, a big dark billboard slab, a red lamp; CELL 100 %, ADS 0 / 4. Otherwise it is black; from the ground the city does not read as a place (bug 2). |
| 13 | Dune checkpoint beam | PARTIAL | `n3_dune.jpg`: the beam is a thin pale line next to the sun on an orange sky, and a green marker; it is 71 m away (`c1d`). Visible but faint; the view is mostly the ship's hull (bug 4). HEAT 0 %, STORM 6:41. |
| 14 | One full takeoff from an expedition moon | PASS (barge, scripted) / FAIL (real time, harness) | Run C, barge: lever -> the ship-fault checklist appears and blocks -> `faults.fixAll()` -> takeoff -> `phase` `orbit`. Expected: the FIRST lever press only creates the checklist. The real-time variant (`qa_night3_takeoff.js`, dune) was OOM-killed at 7.7 GB during the `takeoff` phase render, so the 7 s takeoff cinematic on an expedition moon has not been seen on this box. |
| 15 | warmset after a real landing (hamsi, fresh profile) | PASS | see section 2 |

## 2. Warm set numbers (run A, real landing, hamsi, 18.3 s wall clock on swiftshader)
`perfInfo()`: programs 109, geometries 297, textures 102; `warm`: 49 models built, 106.7 ms total, programs before the prewarm 60. Landing queue top: `facility` 436 ms, `outdoor` 359, `prewarm` 238, `mapLoaded:mining.js` 74, `mapLoaded:mapart.js` 60, `layout` 47, `phase:landing` 15. `warm:*` jobs: plan 1.4, vfx 5.4, 12 creatures 0.8-12.2 ms each (lurker 12.2, leech 10.6, scuttler 10, spider 8.8, crawler 6.2, robot 5.7, yoinker 4.8, sludge 4, turret 3.6), 26 items 0.1-5.0 ms (vase 5.0, cryptorig 4.7, statue 3.8, cog 3.8, pctower 2.4, amphora 2.3, aquarium 2.3). No single job over 13 ms, so no landing hitch from the warm set; it costs about a quarter of the `facility` job.
`programsAfter` was still `null` right after the landing finished: the cleanup runs when `compileAsync` resolves, and this Chromium has no `KHR_parallel_shader_compile` ("extension not supported" warning), so the resolve comes later. Harmless; the hidden group stays in the scene until then.
Expedition landings: not measured (`land()` in run F did not log `landQ`; run D crashed before its dump).

## 3. Bugs by severity
**Fixed here**
1. (medium) Stream end faced the terminal's bearing through the bulkhead, so the first frame was a wall (`onboard.js`).
2. (low) Arcade tarp showed the cabinet's black marquee (`hubgate.js`, tarp height `dm.h + 0.03`).

**Open**
1. (high, harness or real) Real-time takeoff from the dune moon OOM-killed the tab (7.7 GB); the takeoff phase is the second software-GL memory hog after landings. Needs a run on a real GPU.
2. (medium) Rooftop Blackout City is nearly black from the ground: only the violet rim line and one lamp show. Suggest a dim emissive strip on plank edges and stairs, and the billboard frames lit even before relight.
3. (medium) Shovel / lead pipe (and every melee viewmodel at rest) is a long pole out of the top of the frame; no head, so it does not read as a shovel. Suggest lowering the rest pitch (`fpbody_grip.js` melee `[1.0, -0.12, 0]`) or shortening the visual. `fpbody_offline.mjs` passes because it only checks the box corners against a 90 degree FOV.
4. (low) Dune checkpoint beam is thin and pale on the sunset sky; make it wider / add the same red glow at the base, and start the player looking at it (or add a compass marker).
5. (low) Edge markers collide: "1192 m" (two distance labels stacked) at the bottom right in the camera shot, and a marker over hotbar slot 5 in the metro shots (`n3_cam_cone`, `n3_metro`).
6. (low) `x_pickaxe` first equip outdoors left an empty hand for the 8 frames waited (model async?), it showed up later in the ship.
7. (low) The Concierge / Last Conductor card animation is 3.4 s wall clock: at 5 fps (software GL) it is over before a screenshot; not a game bug.

## 4. Top 3 feel problems
1. Melee tools do not look like tools in first person (bug 3): the item you bought first looks like a stick.
2. The two dark expeditions (roof, and the barge / dune from far away) still ask the player to trust the HUD marker more than the world: only the barge got a landmark you can read.
3. Outdoor levrek at 8:00 is a deep red-brown with a red cast on the whole frame; with the HUD on top it feels like a danger state while nothing is wrong.

## 5. Score: 6 / 10 (N2 was 5.5)
Interiors (metro, influencer) and the barge are now good to look at; the first frame after the stream and the tarps are right; the camera / drone cones are soft. What holds the score down: roof readability, melee viewmodels, two crashed harness runs on expedition moons that still need a real GPU.

## 6. Not verified
Real-time takeoff cinematic on an expedition moon; prison lair; boss tint on the Host; semi-transparency of the bulky carry (no image evidence either way); two-player carry (not run this night); expedition warm times.
