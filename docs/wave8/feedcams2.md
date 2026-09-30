# feedcams2 (wave 8 pass 2, module `feedcams2` + hooks in `feedcams`): the camera verb becomes the heart of the game

Files: `src/game/feedcams2.js` (showcase, drones, jammer, downed/revive, highlights), `feedcams2_core.js` (pure rules), `feedcams2_i18n.js` (EN/TR/RU, also the new feedcams.js strings), hooks in `feedcams.js` / `feedcams_core.js`, `crdirector.js` + `crdirector_core.js`, `crdirector_creatures.js` (Follower), `lcmonsters_ai.js` (Lantern Keeper), `algo2.js` (public `hype`), `mapmods_core.js` + i18n (Watched text). Test: `tools/harness/feedcams2.test.mjs`. Tuning sim: `tools/sim/feedcams_sim.mjs`. Slot `feedcams2` in game.js. Net prefix `fc2`.

## New rules (no new HUD: the existing `LIVE` tag gets `| ON AIR` or `| TAGGED`)
- **TAGGED trip.** Going live tags you until you reach the ship: all scrap you carry (held or in slots) while live OR tagged pays the viewer tax when it reaches the ship. **Clear a tag by killing the camera that tagged you** (smash, rifle, cable cut; a spray / zap only blinds it), by the CUT THE FEED job, or by going down. Drone tags clear when that drone is shot down; Lantern Keeper tags only at the ship. Clip moment: "I'm tagged, kill that cam!".
- **Sprint draws the eye:** moving > 6.5 m/s (host measures speed from positions) locks 1.8x faster. Crouch stays 0.55x (and 80 % range).
- **Junction box cut:** every camera has a grey box + cable (`plan.jb`, one merged static mesh). `[E]` within reach = camera CUT for the day, **silent** (smash is loud). One Algorithm line the first time; one-time tip when you first stand near a box.
- **Go live on purpose (showcase):** scrap worth >= 35 that pays the tax is a showcase: the carrier gets a sponsor tip in Clout = the cut (max 40, max 3 per player per day), algo2 hype `showcase` (14, x0.75 repeats) + viewers +12 %, a toast for the crew, a highlight. One-time Algorithm tip when you first hold big scrap inside. Choice: full value for the quota, or Clout + hype tier (silver = sponsor crate) for the player.
- **Outdoor patrol drones (night, run.time >= 18:00 or eclipse):** 1 drone (2 from quota 2 or on a Watched map) circles the entrance on a seeded ellipse (every peer computes the same position from the host clock). Searchlight = beam cone + ground disc (additive meshes, no lights), radius 5.5 m (crouched 4.4). Seen = same meter / tag / tax through `feedcams.expose`. Counter: trees / walls (static LOS), crouch, loud noise pulls a drone over for 6 s, rifle tracer downs it (crash spot stays), Zap Gun blinds it 25 s, the jammer.
- **Signal Jammer** (shop 40, battery 50 s, nvgear battery rules = drains while on anywhere in your slots, ship charger refills): cameras within 8 m are held BLIND (amber lamp), drones within 8 m stop seeing; hums every 4 s (creature noise 0.7).
- **Watched affix:** +2 cameras (cap 12, never on the tutorial landing), 2 drones; description updated in EN/TR/RU.
- **Feed job:** while someone works the splitter, every camera in earshot turns to the panel every 3 s (+ one line). Done = 150 s blackout + all tags cleared.
- **Director:** `crdirector.onFeedHeat(h)` keeps the highest heat since the last peak: next peak cap x(1 + 0.35 h/100), the calm before it x(1 - 0.5 h/100); heat < 10 = build phase x0.8 (off-feed crews get calmer builds). Heat wave threshold 65 -> 70.
- **Creatures:** The Follower treats a working camera cone as a watcher (it keeps coming while filmed: kill the camera to freeze it). The Lantern Keeper's beam is a mobile camera (`expose`, tag source `k`).
- **Downed on camera** (live / tagged / meter > 20 % / a camera sees you): algo2 hype `downed_live`, viewers +30 %, Algorithm line. Revive while on camera = highlight.
- **Highlights:** host keeps the best moment of the day in `run.fc2.hl` (score table `HL` in feedcams2_core: down 80 > revive 72 > drone 58 > fans 50 > smash 44 > cut 40 > showcase 26+0.4v > juke 18+0.3pk > streak 1.4/s > live 8). The day summary adds one line `HIGHLIGHT The Algorithm's pick: ...` (text only, EN/TR/RU).

## Tuning (sim: `node tools/sim/feedcams_sim.mjs 24`; 48 real factory layouts, size 1.0 / 1.5, day 5 quota 2, 8 cams/day, crew of 2, 540 s in the facility, up to 3 small or 1 big item per trip, 4 s per item in the room)
Changed knobs: acquire 3.0 -> **2.5 s**, decay 0.4 -> **0.3 /s**, hold 8 -> **10 s**, tax 25 % -> **35 %**, new sprintMul **1.8**, heat wave 65 -> **70**, tagged trips.

| policy | haul/day | taxed % of haul | lives/day | s on air/day | heat max | days heat >= 70 | jukes | showcases (cut) |
|---|---|---|---|---|---|---|---|---|
| careful (plans around cones, crouches, waits for sweeps) | 982 | **1.5** | 0.5 | 5 | 16 | 0 % | 3.5 | 0.4 (13) |
| average (shortest path, crouches in camera rooms) | 1033 | **8.3** | 2.7 | 26 | 43 | 10 % | 8.7 | 2.6 (76) |
| sloppy (sprints, never crouches / waits) | 1157 | **17.1** | 9.6 | 85 | 88 | 85 % | 15.5 | 5.8 (170) |
| showman (careful, but walks big scrap into a cone) | 1043 | **22.9** | 9.2 | 76 | 83 | 71 % | 4.4 | 7.7 (222) |

Before (v1 numbers, same sim, no tags): careful 0.8 %, average 1.6 %, sloppy 4.0 % taxed: cameras were toothless for runners. Without tags (current numbers, `notag`): sloppy 14 %, so the tag is worth ~3 points and gives cameras a reason to be killed.
Reading: careful and sloppy end with nearly the same net (967 vs 959): careful pays in time, sloppy pays 17 % + a heat-70 creature wave on most days. Showman gives up ~160 of the quota money per day for ~170 Clout of sponsor tips (crew, capped 3 per player) + a bronze/silver hype tier (silver = sponsor crate) + highlight: worth it when the quota is safe, a mistake when it is not.

## Test
`node tools/harness/feedcams2.test.mjs` (sprint/crouch, Watched count, drones plan/patrol/bait/radius, night gate, jammer, showcase tip, highlight ranking, crdirector multipliers, Follower + camera, module smoke: tax event -> tip + hype + highlight, downed -> highlight, day summary line; TR+RU). Also run feedcams, crdirector, algo1, algo2, lcmonsters, downed, mapmods, facjobs, balance_rules tests.

## Not verified (no browser run this pass)
Drone look (beam alpha / disc on slopes), junction box placement + cable path on real walls, `[E]` reach, TAGGED text in the LIVE tag, toasts, jammer item model (no custom model: default item mesh), store listing, ship charger with the jammer, rifle tracer hitting a drone at 7 m, `fx` event delivery of tracers on the host, real 2-player feel. The sim ignores props / closed doors (LOS through open edges only), creatures, and outdoor drones.
