# Wave 8 QA night 1: a headless playtest of the wave 8 build

Build: main 02a18a9 + perf4 (landing queue, merged from `claude/focused-hawking-32j4um`). Software GL (swiftshader, 1280x720), one player, local host. Scripts: `tools/harness/qa_fall.js` (first fall check), `qa_night1_a.js` (orbit + hamsi + levrek), `qa_night1_b.js` (one interior per moon; `window.__qa='cipura,lufer'` picks moons), `headless_shots.mjs` now writes `.jpg` when the shot name ends in `.jpg` and prints `console.log('QA: ...')` lines live. Shots: `docs/wave8/qa_shots/*.jpg` (16 files, 42-121 KB).

Method notes (read before trusting a shot): interiors are pitch black without a torch, so the interior shots were taken with a Flashlight in hand and the post pass brightness x2.8 (`uGamma`), which blows out emissive props (ice columns, glass cases, the cyan blocks). A software-GL frame takes 2-30 s, so each interior step took 80-450 s. No pageerror in any run (only the proxy's nostr WebSocket errors and one `KHR_parallel_shader_compile` warning). The Oscillator 21096/25087 warning spam is gone since perf4 (it was still there in the pre-perf4 run).

## 1. Fall check

| check | result |
|---|---|
| Real landing (`hostLever`, 9 s timer), stand still 10 s in the ship, hamsi + levrek, before and after perf4 | PASS. Player y = 0.02 in all 20 samples (min = max), `inShip` stays true, not dead, phase `moon`. |
| Then 6-10 s outside the ship (teleported to 0, terrain + 1.2 m) | PASS. y settles at -1.23 (terrain -1.25) and stays. |
| Map complete when the player can move (perf4) | PASS. `landQ.pending == 0` at phase `moon`; facility group 913 children / 1359 colliders / 233 scrap spots (hamsi), 699 / 1611 / 245 (levrek, metro). No missing facility, no fall. |
| Root cause of the "fall into the Backrooms" seen once by the declutter agent | NOT reproduced (4 real landings, 12 instant landings). Note: **the facility floor is at y = -300 (`FACILITY_Y`), so an assert `y > -5` is wrong indoors**; the check has to be "y within 1 m of the floor of the current area". |

`landQ.report()` top 5 (one real landing each):

| moon | total | five slowest jobs (ms) |
|---|---|---|
| hamsi (factory) | 1910 | mapLoaded:horror.js 676, facility 539, outdoor 313, prewarm 126, mapLoaded:mapart.js 63 |
| levrek (metro) | 1022 | facility 368, mapLoaded:horror.js 208, outdoor 161, mapLoaded:survival.js 95, prewarm 71 |
| cipura (prison, instant) | n/a | outdoor 514, facility 385, prewarm 64, mapLoaded:mapart.js 47, mapLoaded:horror.js 46 |
| w2sov (tower, instant) | - | mapLoaded:horror.js 2285, facility 861, outdoor 483, prewarm 239, mapLoaded:mapart.js 198 |
| orkinos (museum, instant) | 6197 | mapLoaded:horror.js 3519, facility 1046, outdoor 809, mapLoaded:mining.js 319, prewarm 214 |

`mapLoaded:horror.js` is the worst single job everywhere (0.05-3.5 s, one job = one handler, the queue cannot slice inside it). Software-GL numbers, but the ranking is what matters. The queue never broke a landing.

## 2. Checks (pass / fail / fixed)

| # | check | result | note |
|---|---|---|---|
| 1 | HUD Standard density, docks not overlapping | FIXED | `THREAT / CALM` dock sat on top of the mod `ASSIGNMENT` card at the top right (206x62 px overlap, garbled "ASSIGN\|CALM"). `docklayout.js` did not count `.tfg-asg` / `[data-hud-right]` when it placed the right dock. Now `rTop` includes their bottom. Verified in later shots (greenhouse, academy, museum). Other rects the overlap probe lists (`hud-inv` number over its slot, `chat` / `mg-num`, `cd-cap`, `kmod-hb-total` (the "carrying" line) over the bottom dock by 16 px) are small or invisible; not fixed. |
| 2 | Algorithm ticker | PASS | box under the compass, typing effect (`stre▒▒` glitch chars at the cut), `LIVE 120`, turns `LIVE 165 \| ON AIR` red while filmed. It covers the centre top for a long time (see problems). |
| 3 | Feedcams: camera + cone + ON AIR vignette | PASS | camera housing with red lamp on the wall, orange floor footprint of the sweep, meter 76 %, live in the state, red vignette, `ON AIR - you are live` chip, ticker line "Camera lock. You have three seconds...". `feedcam_onair.jpg`. Junction-box / drones not tested. |
| 4 | Downed pose | PASS (with a stub) | solo players do NOT go down by design (no living crewmate and no medkit: plain death, `TERMINATED` screen). With a stubbed crewmate the local player goes down: `HP 1/106`, `BLEEDING OUT 17 S`, red vignette, eye height 0.45 m (camDy), items hidden. `downed.jpg`. |
| 5 | Revive ring | NOT VERIFIED | faking `S.down` + `S.hold` + `input.isDown` did not paint `.dn-mid` (the update loop resets `S.hold` unless a real `interactTarget.action.__dn` is hit). Needs 2 peers. |
| 6 | Hub door + unlock card | PASS / card by DOM only | door on the cockpit face, prompt `HUB DOOR / 0 of 12 systems open`, red lamp above. `hubgate.card('shop')` returns true and `.hud-big` shows "UNLOCKED: STORE TIERS", but the screenshot caught it at opacity 0 (fade-in under slow frames); the card look itself is not seen. |
| 7 | Quick Shift end card | PASS | `showEnd(...)`: "SHIFT COMPLETE, Scrap aboard 137 / 130 (105 %), Crew back 1 of 1, +120 XP, PLAY AGAIN / START CAMPAIGN / LEAVE". Uses the Arial fallback of `'Bahnschrift'` off Windows (it does not look like the rest of the UI on Linux / Mac). |
| 8 | metro | PASS | tiled tunnel, sleepers / rails orange strips, blue emergency signs, pillars. Very dark: only the torch shows it. `metro.jpg` (platform). The train was not waited for. |
| 9 | greenhouse | PASS | dome hub with the giant tree, leaf walls, glowing fruit. Good. |
| 10 | prison | PASS / hard to read | cellblock hub; a "??? unknown entity" walks in the frame; the railings are white streaks at x2.8. |
| 11 | tower | PASS | ground level with the elevator shaft block + rails, `Calibrate Sensor` marker. The well / lower floors were not visited. |
| 12 | influencer | PASS with doubts | chandeliers, pink / magenta walls, gold ceiling. The floor reads as sand / dirt, not marble or velvet carpet. |
| 13 | academy | PASS with doubts | quad with yellow rail catwalks, green wainscot walls, wood floor. A big cyan / white striped block at the stairs (blown out by the x2.8 brightness; look at it again in normal light). |
| 14 | colddata | PASS | frosted panels, ice columns, ceiling strips; the columns blow out white. |
| 15 | museum | PASS | rotunda, glass case (cyan), stanchion, alarm red because the wave / alarm fired on landing. |
| 16 | 2 lcmonsters (`lcm.debugSpawn`) | PARTIAL | Lantern Keeper: red suit, cage lantern, silhouette reads well. Masked: was not in the frame (creature positions set by hand did not move it into view). The lantern beam is drawn as a solid yellow-brown cone that hides everything behind it. `lcmonsters_keeper_masked.jpg`. |
| 17 | soul palette, 2 moons | PASS with doubts | hamsi: warm amber sunset light while the clock says 8:15 AM (too orange, the soul doc predicted it); orkinos: near black red, only the ship floodlight is readable. |
| 18 | night vision | PASS | goggles in slot, `NV Mk 1 - 86 s - ON`, green amplified look with noise, and `OFF` chip; two goggles appear because the script spawned two. |
| 19 | Pause menu appearing by itself | headless artifact | a `PAUSED` panel popped up mid-run (pointer lock is never granted in headless, `onLockChange(false)` opens the pause). The scripts close it before every shot. Not a game bug as far as seen. |
| 20 | pageerrors | PASS | none in 10 runs. |

## 3. Bugs

| sev | bug | where | suggested fix / status |
|---|---|---|---|
| med | THREAT dock overlaps the ASSIGNMENT card (top right) | `src/ui/docklayout.js` rTop | FIXED (asgB). |
| med | Museum is by far the heaviest scene: ~30 s per software-GL frame (others 2-5 s), `mapLoaded:horror.js` 3.5 s at landing, 6.2 s total | `world/interiors` museum theme, `horror.js` | count draw calls / lights in the museum (glass cases, laser grid, 33 rooms); split `horror.js` handler into several `landQ` jobs. |
| med | `mapLoaded:horror.js` is 0.2-3.5 s on every moon; the queue cannot slice a handler | `src/game/horror.js` | register its work as several jobs (per zone). |
| low | Downed: bleed bar (`BLEEDING OUT 17 S`) overlaps the bottom hint caption ("MASKED - a crewmate ...") by ~10 px | `downed.js` `.dn-bar` vs tip captions | pin the bar above `.hud-dock-bottom` or raise its z-index / bottom offset. |
| low | Quick-end card, downed bar and marks use `'Bahnschrift','Arial Narrow'`: Arial off Windows | `hubgate.js` CSS, `downed.js` CSS | use the game's heading font var. |
| low | Sector-map mod card reads badly: title "HOARDER 404-NOT FOUND OF STATIC", second row starts with "OF STATIC SCANNER RANGE -30%"; the card covers the top centre for seconds on arrival | `mapmods` card | show the suffix as its own name only once; shorten the time. |
| low | Solo players cannot be downed, the flagship wave 8 feature is invisible in solo | `downed.js` `crewAlive()` | by design; maybe let solo bleed for 5 s with a "no crew" line so the pose is at least seen. |
| low | Lantern beam is an opaque cone | `lcmonsters_fx.js` | additive material, opacity 0.25, depthWrite off. |
| info | `CONTINUE.md` §4.2 "assert y > -5" is wrong indoors (facility at y = -300) | docs | checked here; the real check is floor-relative. |

## 4. Top 5 fun / feel problems (as a player)

1. **The facility is black and you have no torch.** Every interior, including the new metro / prison / greenhouse, is unreadable until you buy a flashlight; the hotbar shows an empty `LIGHT` slot. The best new set pieces are invisible on a first run. Give a starter torch (or a dim ambient floor + emissive fill) and let the emissive signs carry the mood.
2. **Arrival is three banners at once.** Algorithm box (120 px, repeats tutorial lines), the Sector Map mod card and the `WAVE 1/3 - PEAK TRAFFIC` chip all land in the first seconds and cover the top half of the screen (404 shot). The screen is still busy at Standard.
3. **Soul palettes disagree with the clock.** Dialup is amber sunset at 8:15 AM; 404 is a red-black soup where only the ship reads. The beats you should walk to are not visible.
4. **Monsters are hard to read.** The Keeper's lantern cone is an opaque wall; the Masked was not where it was supposed to be; unknown entities show a scan prompt instead of a shape in the dark.
5. **Solo play skips the new safety net.** You get one hit and a `TERMINATED` screen; downed, revive and the crew-first design only exist with a second player. The hub door / unlock card show a system count ("0 of 12 systems open") but the first hour has nothing to spend it on.

## 5. Not verified

Revive ring, unlock card look, ghost train hit / horn, vines / spores, lockdown gates, elevator ride, Masked model, feedcam junction box, tower lower floors, Quick Shift menu button, 2-player anything. The x2.8 brightness hides how dark the real interiors are.

## 6. Fixed column (QA fixes pass, branch commit after 67a65ca)

| # | finding | fixed | how |
|---|---|---|---|
| 1 | `mapLoaded:horror.js` one 0.2-3.5 s job | FIXED | `horror.js` build is now one landQ sub-job per closet / pocket / fake closet / trap / host install (`LandingQueue.addNext`: parts run right after the handler, same order, stale ones dropped by a generation counter; instant loads still run synchronously). The first-landing spike itself was the 8 canvas glyph textures of `ChalkView` (a fresh 2D canvas + `getImageData` in the first landing of a session, 0.7-2.8 s on software GL): now built on the first chalk mark and `willReadFrequently`. |
| 2 | museum "~10x slower" | FOUND, part fixed | Static comparison museum vs prison: meshes 4188 / 3898, triangles 243k / 279k, transparent 195 / 174, lights 17 / 17, lasers 5 / 0 (thin boxes). A timed render in the museum sculpture hall (305 calls, 54k tris) is ~50 ms in the same browser, so the 10x is NOT geometry, glass or lasers: what is museum-only is the landing (facility build 0.8-1.7 s at size 1.8 + the horror job above). Hiding the transparent, laser or additive meshes changed the frame time by less than the noise. No draw-call change was made because none is needed; the horror spike is gone (see 1). |
| 3 | pitch-black facilities | FIXED | `environment.js` interior baseline: hemi 0.02 -> 0.16, ambient 0.012 -> 0.045, tinted by the theme haze (per-theme `atmosphere.hemi/ambient` override); new `interiors/practicals.js`: one merged emissive mesh per facility (ceiling strip in every room, dim corridor strips, green exit sign in the entrance + hub), no scene lights. `loaner.js`: first landing of a budgeted profile (firstrun stage != free, day 1, quota 0) puts one weak (70 s) "Company loaner torch" per crew member on the ship floor, removed at takeoff. Flashlights are still bought. |
| 4 | arrival banner pile-up + garbled sector card | FIXED | `firstrun_core.slot / busyMs` + `onboard.fr.slot()`: soul card, sector-map card, horde wave banner and director captions reserve a slot on one card timeline (all stages) and show one after the other; the Algorithm box waits for the timeline (teaching lines still pass). Sector card: title uses the short moon name ("HOARDER 404 OF STATIC"), rows read "Name: description", balanced wrapping, 6 s instead of 9 s. |
| 5 | soul palettes vs clock | FIXED | `palBlend` flag (set by soul on the patched biomes and generated sectors) -> `environment.js` blends sky / fog / sun 45 % palette in the morning to 100 % at dusk (t = 0.62), night capped at 0.82, night colour lifted, hemi floor 0.24. |
| 6 | downed bar overlaps caption; Bahnschrift | FIXED | `.cd-cap` is a `docklayout` bottom banner (stacked above the bottom dock); downed bar / end card use `var(--font2)`. |
| 7 | opaque Keeper beam | FIXED | additive, opacity 0.07, front faces only, vertex-colour fade lantern -> far rim, depthWrite off. |
| 8 | hub door "0 of 12" | FIXED | shows "Opens at quota 1" until the first system is open. |

Not changed: solo players cannot be downed (by design), Masked framing, unknown-entity shapes.
