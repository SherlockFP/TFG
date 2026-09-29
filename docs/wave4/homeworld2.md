# HOMEWORLD 2 (module `homeworld2`, wave 4)

Owner (Turkish): "ev gezegenini gelistir, yerdeki texture'lar gidip geliyor (flicker), Satisfactory gibi olsun, hafif Clash of Clans gibi: yaratiklar bir sure sonra gelsin, sonraki dalga,
oradan pasif gelir elde edelim. Sonra insanlar gemileri basabilsin." + lead: plant trees, build extra rooms.

Files: `src/game/homeworld2_core.js` (pure rules, 41 node tests) - `src/game/homeworld2.js` (install: host state, actions, tick, views, placement, HUD, net) -
`src/game/homeworld2_ghost.js` (ghost raids) - `src/models/homeworld2.js` (instanced view + ghosts) - `src/ui/panels/homeworld2.js` (panel) - `src/game/homeworld2_i18n.js` (EN key -> TR / RU) -
`tools/harness/homeworld2.test.mjs`, `tools/harness/wave4_homeworld2.js`.
Shared-file edits (all tiny, all marked `[h2]`): `homeworld_map.js` (flicker fix, `flatLayer`, ghost plateau), `homeworld.js` (`onHome` ignores the ghost map, `forceRaid({power})`, `stop()`, `onRaidDone` hook),
`homeworld_core.js` (`capOf` reads `state.xcap`), `game.js` (import + slot). Nothing else.

## 1. The flicker bug (ground textures "come and go")
Root cause: the global PSX vertex snap (`engine.js patchPSX`) snaps the CLIP-space xy of every vertex to a 200 x 150 grid. The homeworld ground is ONE 132 m quad (4 vertices), the pad a 48-segment fan, the rings
a few big triangles: each far vertex wobbled by a whole pixel at a different phase per frame, so the interpolated depth of ground and pad (only 3 cm apart) crossed = camera-position dependent z-fighting.
Fix (`world/homeworld_map.js`): every flat layer opts out of the snap (`PSX_NOSNAP` define, same trick as `environment.js` / `crtmenu.js`), layers are stacked 6 cm apart (`LAYER`: ground 0 / pad .06 / ring .12 / lamp .16 / grid .20 / decal .24)
and get a per-layer `polygonOffset` (ground pushed back, everything on it pulled forward). The factory's flat decals (node rings, placement plates, grid patch) use the same `flatLayer` helper.
Check: `wave4_homeworld2.js` step `flicker` renders 8 frames per view with the camera moving 0.7 mm and reports the % of ground pixels that flip, with the fix ON and OFF (old behaviour emulated at run time) at 10 / 35 / 80 m, and paints a composite screenshot.

## 2. Factory (Satisfactory-lite) - press `T` on the homeworld
* **Grid**: fine cells of 1.5 m (two per 3 m homeworld cell). Machines are 2x2 fine cells (3 m), belts / poles 1x1. Snap-to-grid ghost (green / red + reason), `R` rotates, hold LMB drags belts / floors / walls / poles,
  `X` / Delete removes, `U` upgrades (Mk1-3), `G` repairs, `Q` select mode, RMB / ESC leaves. Classic 3 m buildings, the pad (16 m) and the resource nodes block the fine cells.
* **Nodes**: 12 seeded deposits (6 scrap, 4 iron ore, 2 data crystal), purity impure / normal / pure = x0.5 / x1 / x1.6, identical on every peer (`genNodes(seed)`, seed stored in the profile). A Miner must sit exactly on a node.
* **Belts**: 1 item per cell, 1 cell/s = exactly 60 items/min per lane; miners / smelters push into the belt in front of them (or straight into an adjacent machine), belts hand over downstream-first, side merges work, a splitter shares 3 ways.
  Blocked outputs stall the chain (nothing is lost). Items are drawn as ONE instanced mesh; belts / machines / lamps / wires are instanced too.
* **Machines** (Mk1 numbers): Miner 30/min, Smelter (2 scrap -> plate 3 s, 2 ore -> ingot 4 s), Assembler (plate + ingot -> part 4 s, 2 ingot + crystal -> circuit core 6 s), Export Dock, Scrap Generator (burns 1 scrap / 10 s = 12 power), Power Pole, Splitter.
  Mk2 / Mk3 = x1.5 / x2.2 speed for x1.9 / x3.6 cost and x1.4 / x2.0 power.
* **Power**: poles link within 12 m, machines need a pole within 7.5 m, a pole network reaches the pad "shore" grid within 30 m (shore power = the classic homeworld's free surplus: supply - demand). Generators feed their own network.
  Per network `ratio = min(1, supply / demand)` scales machine speed (brownout, visible in the HUD `power 14/18` and the machine lamps: green running, amber blocked, red no power / broken).
* **Economy governor** (the "not bigger than a good run" rule): the Export Dock pays into the EXISTING homeworld storage (credits, components: 4 assembled parts = 1 component, every 5th circuit also a Circuit Core shard) and can pay at most
  12 / 18 / 26 credit-equivalents per minute (Mk1 / 2 / 3), two docks max = 52/min at the very top. Measured (test): a lone Mk1 miner + dock = 1.8 credits/min, a developed 2-miner / 2-smelter / assembler Mk2 chain = 18/min (dock limited).
  The store caps (500 credits base, x8 with Warehouses) bound it further: a full store makes the dock refuse items, belts back up, the HUD says STORAGE FULL, COLLECT at the console (classic `H` panel or the new panel).
* **Live vs offline**: the host runs the belt simulation whenever a run is live (any phase, 10 Hz fixed step, ~0.5 ms/step for 460 pieces); clients only get a 4 Hz snapshot (belt items as 3 chars each + machine lamps) while somebody is on the homeworld.
  Offline catch-up (`attach()` on host start): the SAME simulation is measured for a warm-up + window (`measureRates`), then `offlineGain(rates, elapsed)` = capped at 8 h, 10 % of the live rate, negative / NaN clock = 0, then `applyGain` clamps to storage.
  A "WHILE YOU WERE AWAY" toast reports it. Trees grow offline at 50 %.

## 3. Rooms + garden
* **Room pieces** (fine grid): floor / wall / window / doorway / roof + Storage Crate / Workbench / Bed / Planter. Walls auto-connect (post + arms), windows have glass, doorways are frames you walk through. Furniture needs a floor.
  **Room kits** (one click stamps floor + walls + door + roof + furniture): Storage Room (3 crates), Workshop (2 benches), Bedroom (1 bed), Greenhouse (planter).
* **Enclosure detector** (`detectRooms`): a room = connected floor cells; closed when every neighbour is a wall / window / door / same room; roofed when every cell has a roof tile. Effects (`roomEffects`, capped):
  crates in a closed room = storage +20 % each (cap +60 %, through `hw.xcap` -> `capOf`), benches = every machine +6 % speed each (cap +12 %), a bed in a closed roofed room = 0.3 Clout/min (cap 0.6), a planter in a closed roofed room = greenhouse (trees inside grow x2).
* **Trees**: Sapling (credits) -> young (5 min) -> mature (15 min) real time; a mature tree grows a fruit every 200 s (max 3); `E` picks them as **Homegrown Apple** food items (heal 22 HP - healing is food only), felling / selling gives comp_wood (1 / 2 / 4 by stage).
  The growth functions are exported (`api.core.growTrees`) so the survival module can drive its own plants; the homeworld keeps its own simple tree growth (no crop farming, no chests).
* Limits: pieces are not raid targets (raiders walk through room walls), no roof-hiding from above, trees cannot be planted on resource nodes, no "crafted" saplings yet.

## 4. Waves (Clash-of-Clans-lite)
* Gate: the first wave only comes once you own >= 4 real things (machines / towers / trees / furniture) AND the base is worth >= 450 (credits + 4 x components spent). Then a 5 min countdown starts (HUD chip `NEXT WAVE 04:32`, turns red under a minute, banner + siren at 60 / 30 / 10 s).
* The countdown only runs while somebody is ON the homeworld (never while the crew is in a facility). At 0 the host starts the classic on-site raid (`homeworld.forceRaid({power})`): real siege raiders, flow field, real tower fire, your deployables fight too.
  Power `wavePower(value, wavesDone, quotaIndex)` = 0.85 + 0.5 log2(1 + value/700) + 0.04 per wave survived + 0.05 per sector, clamped [0.85, 3]; interval `waveInterval(value)` = 540 s - value/25, min 300 s.
* Result: repelled / held = loot (components, credits, a circuit shard from power 1.4), lost = 1-2 machines BREAK (`br`: they stop, tinted dark; REPAIR costs 30 % of what they cost, nothing is ever deleted) and a 15 min SHIELD (no waves).
  `CALL WAVE EARLY` (+25 % loot) is a button. Classic random raids while the crew is away are unchanged.

## 5. Ghost raids ("gemileri basabilsin")
There is no server, so a base to raid is a GHOST snapshot: the 5 **rival bases** (tier 1-5, generated from the profile seed, always available), **your own base** (practice, 40 % loot) or a **share code** another crew exported
(`TFG-H2:<base64>.<checksum>`, RAID tab: tick the PvP flag "Allow raids on my base", GENERATE CODE, paste it in chat / hub; the other crew IMPORTs it; tampered codes are rejected). Consent = the defender opted in by sharing.
Flow: RAID tab or terminal `GHOST` (list) / `GHOST <n>` (select) / `GHOST GO` in orbit -> lever -> you land on the ghost map (moon `h2raid`, plateau x2.3, ship at the pad, the base ~85 m away).
Its towers are REAL creatures (`h2_sentry`: shootable, meleeable, killable; 0.7 s warning, damage = 20 % of the tower's dps so it is fair), guards (`h2_guard`, chasers) hunt you, walls / drums are colliders.
Hold `E` at the vault (8 s of channel, progress drops when nobody is within 5.5 m) -> loot (credits capped at 900, components, Clout, XP), sentries switch off, leave with the lever. After 7 min reinforcements arrive.
Cooldown 30 min per ghost. No penalty for the "defender" (a raid on a copy). `game.homeworld2.ghost` exposes `headers / findGhost` and the codes are plain strings, so the social hub can publish them without depending on this module.

## Net (all prefixed `h2`)
`h2act` (client -> host): sync, build, belts, kit, up, sell, rot, repair, harvest, call, pvp, gexport, gimport, gtarget, ghostgo, gcrack.
`h2msg` (host -> all / one; `HOST_ONLY`): ops (layout diff, versioned), full (chunks of 90 pieces, sent on `playerJoin` / when a client detects a gap), s (belt items + lamps 4 Hz, only while somebody is home), tg (tree growth), ok / err / code / banner / warn / wdone, gtr / gcr / gwin (ghost).
`run.h2` = small meta (wave clock, power, income, ghost headers). Layout lives in the HOST profile (`profile.homeworld2`).

## Knobs
`homeworld2_core.js`: `DOCK_VALUE`, `IT_VALUE`, `OFFLINE`, `WAVE`, `TREE`, `ROOM`, `GHOST`, `MK_*`, `MINER_RATE`, `GEN`, `PT` (costs / limits).

## Status: NOT run in a browser
The shared browser queue was too long, so `wave4_homeworld2.js` (factory build + run, rooms, tree, wave lost -> repair, ground flicker metric with the fix on / off + composite screenshot, ghost raid) was written but never executed.
What IS verified: 41 rule tests, 14 installer integration tests against a fake game (real three + real rules: host requests, factory paying into the classic store, rooms / trees / harvest, wave clock -> forceRaid -> lost wave -> repair,
offline catch-up cap, ghost route -> spawn -> vault -> loot, a client game mirrored from the host messages, view / colliders / HUD / placement code paths), `npm run build`, food / homeworld / raid tests unchanged.
First job: run the browser script (or play: land HOME, press T) and look at the ground at 10 / 35 / 80 m, belts + items, room walls, the wave HUD chip, and one ghost raid.

## Tests
`node tools/harness/homeworld2_install.test.mjs` (14 integration checks).
`node tools/harness/homeworld2.test.mjs` (41 checks: grid / placement, chains, throughput cap, power, governor, offline cap, storage cap, wave gate / scaling / clock / shield, rooms, trees, ghost codes / fairness / loot cap, wire encodings, sim cost).
Browser: `flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port PORT --script tools/harness/wave4_homeworld2.js --shot out.png --wait 4000` (factory build + run, rooms, tree, wave lost -> repair, flicker metric + composite shot, ghost raid).

## Known gaps
* Live crew-vs-crew PvP is not built (one lobby = one crew, no second host); the opt-in ghost is the async version.
* Raiders do not attack machines / room walls (only the classic buildings); machines break as a consequence of a lost wave.
* Belt visuals are simple (no curves, no slopes); no blueprints / copy-paste, no belt lifts, no fuel other than scrap.
* Hidden-tab clients extrapolate items from the last 4 Hz snapshot only (clamped at the belt end).
* Everything is host-simulated: a client cannot see machine states while the host is away from HOME phase (no snapshots then, the view only exists on the homeworld anyway).
