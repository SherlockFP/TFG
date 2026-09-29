# Wave 5 - SHIP INTERIOR clean-up (owner: "geminin içini ayarla, çok kötü, buglu görünüyor, bir test et")

Status: browser-verified (headless swiftshader, 1280x720: a 27-shot tour before, the same tour after, and a final 6-shot check),
node-tested (`ship2_overlap` 15/15 with the new checks), `npm run build` clean. Not hand-played with a mouse / two players.

## 1. How it was checked
* `tools/harness/ship_tour.js` (body for `headless_shots.mjs`): 12 interior views in orbit + the same 12 landed + outside with the door open /
  closed + a view from the airlock. It pins its own camera inside `engine.render` (the page's rAF loop otherwise re-renders with the player camera),
  hides the first-person arms / body, dumps every `ship.group` child with its world AABB and runs a **runtime overlap check** on the fixtures that
  are really installed (all modules, after install). NOTE: the worktree lives under `.claude/`, which `vite.config.js` excludes from watching, so a
  running dev server serves stale modules; restart vite after every edit.
* `tools/harness/ship2_overlap.test.mjs` now covers every in-ship fixture of every module (ship props, partitions, survival stove / brewing stand /
  crate / planter, arcade chess table, cycle3 trophy wall, food table, frame console, kiosk, contract board, incubator, decon, workbench, reactor,
  horn / teleporter panels, mirror, planters, crates, the helmet-cam monitor + LED loot board of the built-in mods), plus a **0.9 m walker flood
  fill** from the airlock that must reach the standing spot of 33 interactables / doorways (`shiplayout.ACCESS`), model-dimension checks for the
  module models, a source-wiring check (every module reads its spot from `shiplayout.js`), the open door leaf, and the single floor layer.
* `node tools/harness/ship_suite.mjs [suite ...]` runs the ship-related node suites in one go.

| | overlaps | in wall / ceiling | blocked doorways | signs / windows covered | unreachable (0.9 m) | total |
|---|---|---|---|---|---|---|
| wave 4 as merged (layout + where the modules really put things) | 13 | 1 | 2 | 5 | 7 | **28** |
| wave 5 (`world/shiplayout.js`) | 0 | 0 | 0 | 0 | 0 | **0** |

Runtime (browser, every module installed, orbit + landed): overlapping installed fixtures **8 -> 0**; page errors 0.

## 2. Defects found (before) -> fix
Screenshots: `docs/wave5/ship/before_*.jpg` / `after_*.jpg` (same camera).
1. **Trophy wall** (cycle3) - 12 plaques of 0.94 m on the +z wall: covered the mirror, the store kiosk + contract board, the frame console, the MED /
   STORE signs and all three clerestory windows, and cut through the cockpit bulkhead. ~85 draw calls. -> moved to the hub face of the cockpit bulkhead
   (`SPOTS.trophy`, `trophySlots()`), 0.36 m plaques, a TROPHIES sign above, baked into 3 meshes (frames + emblems / glow parts / one name-plate
   atlas); the E prompt picks the plaque under the crosshair.
2. **Survival stove** stood in the cockpit, in the N1 shipyard doorway (starter food rained onto the cockpit floor); **brewing stand** went through the
   cockpit bulkhead and the charger; **SHIP crate** stood in front of the mirror; **planter** was inside the store kiosk and the incubator. -> fixed
   spots in `shiplayout.SPOTS` (galley counter on the -z wall: stove under the quota screen, brewing stand, coffee, charger; crate on the cargo +x wall;
   planter as a window box under the cockpit window). Saved runs are migrated (a built-in standing elsewhere is moved). Starter food is laid out on the
   mess table.
3. **Arcade chess table** stood inside the workbench and blocked the way into the engine room. -> hub, `SPOTS.chess` (mess area, opposite the food table).
4. **Food table** stood in the middle of the hatch -> airlock path with its stools on the guide line. -> rotated (stools along x), `TABLE_SPOTS[0]`,
   `food.js` now supports a rotation per candidate.
5. **Door leaf** stuck 4 cm into the cabin: the open door showed through the cargo wall behind the bunks. -> the leaf lives inside the hull skin.
6. **Floor**: the room tints were a second coplanar floor over the old one, the door hazard strip was hidden under them, all flat layers were
   PSX-snapped (shimmer). -> one per-room vertex-coloured floor, stripes + hazard strip 6 mm above it, `PSX_NOSNAP` + polygon offsets (homeworld2 style).
7. **Dotted see-through seams** (T-junctions opened by the vertex snap) around the cockpit window, the clerestory windows, the door and the shipyard
   doorways. -> `shipdeco.gridWall()`: every hull wall is a T-junction-free grid (inner and outer walls).
8. **Engine room**: 0.76 m between the workbench and the bulkhead, the orange guide line ran under the bulkhead. -> bulkhead moved to z -1.68
   (`ENGINE_Z`), bench 0.1 m aft, orange line runs on the hub side of the arch.
9. **Cargo**: bunks / cupboard / crates / pot jammed (0.88 m gaps, the R1 doorway approach blocked by the pot). -> cupboard on the south wall,
   SHIP crate on the +x wall, one crate stack in the corner, pot by the arch; every spot reachable by the 0.9 m walker.
10. **Helmet-cam monitor** (mod) hung in front of the cockpit window, rods 0.25 m through the ceiling; **LED loot board** (mod) floated 0.15 m off the
    wall and hid the AIRLOCK sign. -> `shiplayout.MOD_SPOTS` (read through `game.ship.layout.mods`), rods end at the ceiling, board flush; the AIRLOCK sign
    was dropped (the board + hazard strip mark the door).
11. **Outside**: hull number KC-07 hung over the N2 doorway, the -z orange stripe ran across N1 / N2, the shipyard paint stripe / band ran across the
    windows and the door opening (a painted ship looked closed), the polish4 emblem sat on top of KC-07, the nose ring floated around the nose dome
    (a stray orange line under the cockpit window). -> all cut / moved; emblem spot in `SPOTS.emblem`.
12. Pet incubator progress bars were on the wall side of the box. -> front.

## 3. Draw calls (renderer.info, same views)
Orbit: south wall 691 -> 545, hub from cockpit 536 -> 409, tail -> nose 417 -> 313, top-down 508 -> 355, engine 148 -> 78, cockpit 84 -> 72.
Landed: south wall 934 -> 755, outside door open 600 -> 523, cockpit north 249 -> 194; hub-from-cockpit 744 -> 774 and the top-down 1761 -> 1881 (more
terrain / items in frame; not ship geometry). Ship group meshes 367 -> 366. Scene light count unchanged (pooled emitters only).

## 4. Remaining / not done (honest)
* Not hand-played: E prompts at the new spots (chess seats, trophy picking by crosshair, stove / crate / planter) were not pressed in a real session.
* No merge pass for the ship props (terminal, monitors, cupboard...): skipped to save quota; the trophy wall merge was the big win.
* The helmet-cam monitor is a black box hanging from the ceiling (readable from the hub side only).
* `ship2_install` "repair ... Wrench on a dent" is flaky (about 1 in 3 runs, randomness in the hull repair session; not touched here).
* Player-placed polish4 furniture is not checked against the new layout (its placer checks colliders at placement time).
