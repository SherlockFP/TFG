# Wave 5 - UNIFY (MASTERPLAN §22 rows 2-3, §25.5 #2-#3; node-tested + builds, NOT run in a browser)

Goal: fewer duplicated systems, no behaviour change beyond the listed food numbers. Everything is a library + adapters: no new Game module, no new net messages, no `game.js` edit.

## 1. One defence core - `src/game/defense_core.js`
* **Table `DEFENSE`**: the 14 siege deployables (turret1-3, tesla, barr_wood / barr_metal, spikes, mine, flood, drone, sensor, shield, gen, bank) with kind, hp, footprint (`r hx hz h solid`, flow-field `cost`), range, dmg / rate / cd / chain / fall / dps / slow / blast / pool / regen / heal, power use (`draw`, `drawS`, `burn`), plus meta: `mount` (ship2 roof) and `zone` (`cost` credits, `upkeep` / day, `minQ`, list order `o`). **Not moved** (they are shop / balance knobs the hardmode agent edits): `price`, `weight`, `blurb`, `supply`, `cap`, `ammo` stay in `DEPS` in `deployables.js`.
* **Registry**: `getDef(id)` returns one normalised def for every entity of every system: `{ id, sys, kind, name, hp, range, dps, burst, powerUse, ammo, upkeep, cost, minQ, place, rating, facilityOnly }`. Systems: `siege` (plain ids), `homeworld` (`hw_gun hw_tesla hw_flame hw_cryo hw_sniper hw_wall hw_gate hw_spikes hw_mines`, per-level via `hwDef(type, building, lv)`), `horror` (`trap_laser trap_crusher trap_spikes trap_electric trap_flame`, `facilityOnly: true`).
* **Power calculator**: `ratingOf(def)` (calibrated once against the old hand-written zones table: 12 / 17 / 26 / 21 / 5 / 8 / 4 / 9 / 4 / 14, now 12 / 16 / 27 / 22 / 5 / 8 / 4 / 9 / 4 / 14) and `defencePower(counts, { dry, ups, base })` = (6 + sum rating x n) x (dry ? 0.4 : 1) x (1 + 0.1 x min(6, ups)). `winOdds(def, waveMean, jitter)` is the auto-resolve probability. Knobs: `K` (per kind), `rangeFactor`, the soak / support coefficients in `ratingOf`.
* **Targeting / firing**: `pickTarget(list, from, range, { mode: nearest|strongest, minRange, dy, pred })`, `chainTargets`, `splash`, `shotDamage`, `cooldownOf`, `dpsOf`, `powerPerSec`.

### What reads it now
| System | File | Change |
|---|---|---|
| siege deployables | `deployables.js` | `applyToDeps(DEPS)` after the literal table (combat + footprint fields come from the core; verified numerically identical to the old literals), turret target pick, tesla chain and `creatureTargets` use `pickTarget` / `chainTargets`, shot damage = `shotDamage` |
| ship2 roof turrets | `ship2_core.js` | `MOUNT_TYPES = mountTypes()`, "ammo-fed mount uses no power slot" = `getDef(ty).ammo` |
| zones fortify + auto-resolve | `zones_core.js` | `DEFS = zoneDefs()` (same ids / costs / upkeep / unlock quota / order; `power` = rounded rating), `defencePower` and `winChance` delegate |
| homeworld towers / walls / traps | `homeworld_core.js` | `DC.regHomeworld(BUILDINGS)`, `defenseOf` reads `towerStats`, new `defenseRating(state)` (the same "defence power" number for a base) |
| homeworld raid (live) | `homeworld_raid_core.js` | nearest / strongest raider pick = `pickTarget` |
| homeworld2 ghost raid | `homeworld2_core.js` | `ghostDefense` sentries read `towerStats` |
| horror traps | `horror_core.js` | `regTrap(TRAPS[id])` for every trap; stats stay in `TRAPS`, traps remain facility-only and are never zone defences |

## 2. One maze library - `src/world/mazegen.js`
Re-exports the proven planners unchanged (test asserts identity): maps5_core (`makeGrid carveTree bfs shortestPath reachedAll wallLattice planHedge planStacks planArchive verifyStacks archiveSolve mazeRoute ...`), maze_styles (`carveMaze mazeConnected mazeDeadEnds pickMazeStyle MAZE_STYLES`), backrooms_plan (`generatePocket`), horror_maps (`POCKET_SPECS analyzeSpec reachTiles`). The cycle labyrinth is the facility maze room, i.e. `carveMaze`.
On top: `planMaze(kind, seed, { w, h })` (`tree`, the 6 styles, `hedge`, `stacks`, `archive`, `pocket`), `asciiMaze(spec)`, normalised graphs (`graphFrom{Grid,Edges,Pocket,Ascii}`, `distances`) and **`checkSolvable(plan)`**: every cell reachable from the start, every goal reachable, plus the planner's own proof (hedge flag + paths, stacks every phase + transition, archive 3D search, ASCII `analyzeSpec`).
Callers pointed at it (pure renames): `facility.js`, `facility_variety.js`, `maps5_estate/cold/stacks/hedge/archive.js`, `game/maps5.js`.

## 3. Food rule - `src/game/consumables.js`
* **Packaged food (food module) = a small snack** (<= 24 HP in total, hunger 12; the Pizza Box is the biggest: 24 HP, 24 hunger). Drinks and booze heal nothing (hunger 3). **Cooked meals (survival) = the real healing** (6-100 HP by ingredients x quality; average 2-ingredient meal 37.8, 3-ingredient 60.4, always more than the raw parts). **Herbs / raw meat are food too** (raw bite 3 HP, 5-6 hunger; raw fish is cook-only). **Medicine** (medkit 60, trauma kit 100) is the only non-food heal.
* `consumableTable()` reads every number from where it is authored (food_data, survival_data) into one table; `checkConsumables()` returns contradictions (test = none).
* **Contradictions removed**: Deluxe Ramen 32 HP -> 25 s buff (20 HP); Party Cake regen 0.6 -> 0.2 HP/s (27-45 HP shared); Mystery Meat "Meat Sweats" 0.5 -> 0.3 HP/s (18 HP); the packaged-item hunger (hard-coded 12 / 3 in `survival.js`) is now an explicit `hunger` on every `FOODS` entry (Pizza Box 24) and `survival.js` reads it. EN / TR / RU strings updated.

## 4. Two currencies - `src/game/wallet.js`
Credits ▮ (crew, `run.credits`) + Clout ◈ (personal, `profile.coins`). Shards (`shard_*`, homeworld s1-s4), components (`comp_*`), the homeworld stash (`parts`, `meals`) are **materials**; XP / season XP are progress. `classify(key)`, `materialKind`, `walletRow(credits, clout)` = `"▮ 60 · ◈ 12"`, `walletOf(game)`, `countMaterials`, `materialsRow` ("Materials: Components 3 · Shards 5 ..."). Wired: the HUD top-right element (`hud-coins`) now shows the whole wallet row (credits used to appear only on the ship banner), the homeworld panel header uses the same row and tags material chips (`.hw-chip.mat`, tooltip "Materials: crafting only, not money"). The shop already priced only in credits / clout (test-guarded). ui3 can restyle `.hud-coins` / `.hw-chip.mat`.

## Tests
`node tools/harness/defense_core.test.mjs` (21 groups: every entity of every system resolves; rating within 12 % per entity, whole-zone power within 8 % of the old calculator over 4000 random compositions; pickTarget / chainTargets equal to the loops they replaced), `mazegen.test.mjs` (17 groups: ~30k cells x 11 kinds x seeds solvable, 4 ASCII pockets, sabotage detected, determinism, callers point at the library), `consumables.test.mjs` (8 groups), `wallet.test.mjs` (7 groups). Existing suites re-run green: zones(+host), homeworld(+2, install, raid), ship2 (hull / install / overlap), horror (+install, build), maps5(+install), stealth_maze / install, food(+install), survival(+install), daily(+svc), stairs, br_pocket, wave2_siege_core. `horror_install` (a random sample-case spawn) and `ship2_install` (a repair-ring timing) are flaky in the base tree too: they failed once each in ~4 runs and passed on re-run.

## Not done / follow-ups
* `DEPS` now holds only name / kind / price / weight / blurb / supply / cap / ammo (the stat literals were stripped; values verified identical). Homeworld tower arrays stay in `BUILDINGS` (5-level tables; registered, not moved). ship2's power *slot* budget (`powerSlots`) is still its own rule; `powerPerSec` is available for a per-unit budget.
* The live siege / zone raiders and the homeworld sentry creatures still run their own movement code; only target picking and stats are shared.
* Homeworld Garden output ("meals collected as medkits") is a medicine-from-food bridge that contradicts "medicine is sold / crafted"; left because it is homeworld economy balance.
* Forge / crafting / shop panels still show their own per-panel numbers (only the HUD and the homeworld panel use the wallet row); `materialsRow` is ready for the ui3 pass. Arcade / daily rewards were not changed: they already pay credits / clout / items.
* Nothing here was looked at in a browser.
