# Wave 3 - SHIPYARD (module `shipyard`, design: docs/MASTERPLAN.md section 13)

Status: **built, node-tested, `npm run build` clean, never run in a browser** (wave-3 budget rule: no browser runs). Read the "Unverified" list before trusting the looks.

## What it is
The Starter Pod core (x -7..7, z -3.5..3.5) stays exactly as it was; **twelve modules** (Mk I-III) bolt on outside it. Doorways open in the core walls when a module is installed, and every module has visible geometry, colliders and a real gameplay effect.

| Module | Socket(s) | Mk I / II / III effect (numbers in `shipyard_core.js effects()`) |
|---|---|---|
| Cargo Bay | R1 / R2 | Broker bonus on everything sold at the bell +3 / 6 / 9 % (wraps `hostSell`, same `run.favor` path as the role aptitudes); racks with 12 / 24 / 36 crate slots; wall scanner: item count / value estimate / exact value + quota % (also E = manifest toast) |
| Garage | R1 / R2 | Uplink Van winched aboard from +12 / 24 / 36 m farther (`CRUISER.dockRadius`), van engine +5 / 10 / 20 % (`maxSpeed`, `engineForce`), battery rack (E recharges the held battery item through the existing `charge` request) |
| Engine Room | R1 / R2 | Cancels 25 / 50 / 75 % of the weight penalty and of the landing noise; reactor + coils, live "HULL WEIGHT" screen |
| Hangar | R2 only | Field locker restocks on every landing: 2 glowsticks / + medkit / 3 glowsticks + medkit + walkie |
| Workshop | N2 only | Crafting progress bar time -10 / 20 / 30 % (`game.crafting.timeMul`, one line in `ui/panels/crafting.js`), bench E opens the crafting panel (inside the host's 7 m bench reach) |
| Med Bay | N1-N4 | Treatment bed: E heals 50 / 75 / 100 % max HP, cooldown 90 / 60 / 30 s per player. **Revival Pad**: put a `body` item on the pad, press E: the host revives that crewmate mid-day for 100 / 75 / 50 credits and removes their death from the day's death list (no fine). |
| Lab | N1, N3, N4 | Sample analyzer: hold a strange item / creature sample, E: x1 / 1.5 / 2 components (+1 circuit), the sample's blueprint and +10 / 20 / 35 % chance of a second unknown blueprint |
| Bunk Room | N1-N4 | The dead respawn in the bunks (wraps `game.respawn`), **Rested** buff on every landing (+5/10/15 max HP, +1/2/3 % speed, stamina regen, 180 / 300 / 420 s) through the anomaly buff registry |
| Trophy Hall | N1, N3, N4 | Mounts one head per creature in the LOCAL bestiary (max 6 / 9 / 12, name plates); guestbook E once per game day per player: XP 12 / 20 / 30 + per-species bonus (cap 60 / 100 / 160), Mk III adds a visitor bonus when the crew signs together |
| Lounge | N1-N4 | 2+ crew inside for 20 s: Threat -3 / 5 / 8 (and Static exposure), jam-session XP inside x1.15 / 1.3 / 1.5 (wraps the host's `xp` broadcast), stage lights at Mk III |
| Observation Deck | roof (DECK) | Roof platform with a glass canopy, telescope, star scanner screen (day / threat / weather), reached by the **service lift** (E at the pad on the +z side, E at the roof console). Standing on the roof gives the **Overwatch** buff: scan range x1.25 / 1.4 / 1.6. The roof edge gets invisible safety colliders. |
| Turret Hardpoint | roof (TURRET) | Roof gun, host-simulated: nearest creature within 22 / 26 / 30 m, 6 / 9 / 12 damage per barrel at 2.2 / 2.6 / 3 shots/s, twin barrels at Mk III. Only while landed (`phase === 'moon'`, so also during SIEGE). Head rotates + muzzle flash on every client (`symsg tur`). |

Sockets (`src/world/hardpoints.js`): `R1` (+x wall, chains to `R2`), `N1` / `N2` (-z wall, chain to `N3` / `N4`), `DECK`, `TURRET`. Eight slots for twelve modules on purpose: "build the ship that fits the crew". A chained socket needs the module in front of it; a module with something behind it cannot be sold or moved.

## Weight (the balance lever)
* Route cost **+5 % per installed module** (`routeMul`, Engine Room reduces the penalty). Free travel is on by default, so with it the surcharge is `5 % x modules x max(moon cost, 30)` credits; without free travel the moon cost is multiplied. HQ and HOME are exempt. Hooked in `terminal.js` (two lines, display + charge) through `game.shipyard.routeFee(moon, freeTravel)`.
* Heavy hulls are loud: at touchdown the host adds a Threat spike (`landingThreat`: 0 for < 3 modules, then +2 / +4 / +6, cut by the Engine Room) via `game.balance.model.addSpike`.
* Bigger siege target: `siege_core.HULL` is widened to the module footprint (bounding box), so creatures path to and hit the extended hull; `siegeSurface` (x1 + 3 % per module) is shown in STATUS but not applied to damage.

## How you get modules
1. **Credits**: terminal `SHIPYARD` (status + opens the panel), `SHIPYARD BUY <module> [hardpoint]`, `UPGRADE <module>`, `SELL <module>` (50 % back), `NAME <text>`, `LIST`. Only while the ship is in orbit or docked at HQ, and you must be aboard.
2. **Ship parts** (free): Hull Plate, Bulkhead, Engine Coil, Hardpoint Bracket are ordinary component items (`sy_plate`, `sy_bulk`, `sy_coil`, `sy_brk`; models, icons, sellable). Carry them to the **Frame Console** (core cabin, +z wall at x -4.9) and DEPOSIT; then BUILD / UPGRADE from stock at the console. Every module needs a bracket (two for Mk III).
   Drops (host): chests (6 % wood ... 40 % mythic, `tfg:chestOpened`), every boss (3 parts, first is an Engine Coil), SIEGE HELD (2, flawless 3), extraction success (2, dropped in the ship). Weights plate 40 / bulkhead 32 / coil 18 / bracket 10.
3. The Frame Console screen is a permanent obstacle (an in-ship mesh), so the ship-fault panel placer avoids it.

## Customisation
Hull colours (12 presets, primary + secondary), pattern (solid / stripes / hazard / checker / chevron / dots), interior theme (steel / rust / clean / warm, tints module interiors) and a **name plate** (16 chars, shown on both hull sides). Paint job 25 credits, name plate 15. The core's own orange stripe is overpainted, a pattern band is added low on the hull and the roof gets a pattern; modules take the colours on their exterior walls. With default paint and name nothing extra is built.

## Persistence / networking
* State = `profile.shipyard` on the **host profile** (modules, parts, paint, name, guestbook days). It survives fired runs (fired reset deletes `run.sy`, the `orbit` phase re-attaches it), new runs and new lobbies of the same host. Mirrored into `run.sy`, so the generic run sync + the `welcome` message deliver it to late joiners; every peer polls `run.sy` twice a second and rebuilds only the sockets whose descriptor changed.
* Requests `syact {op}`: `install upgrade sell move deposit paint heal revive analyze guest`; messages `symsg {k}` (host only). Host validates phase, position (aboard / at the console / at the bed, pad, analyzer, book), credits and parts, rate limit 0.2 s per player.
* Colliders are created by every peer for its own physics; `world/ship.js` exports `SHIP_EXTRA` (aboard volumes) which `insideShip()` consults, so "left behind at takeoff", ambience, siege door logic etc. treat the modules and the roof deck as aboard.

## Shared-file edits (all tiny)
* `src/world/ship.js`: doorway gaps in the +x / -z walls + `hardpoints` seals (plain wall blocks; an opened seal turns invisible but stays a mesh so the fault-panel placer still sees the doorway as occupied), `SHIP_EXTRA`, `insideShip`. **No existing prop moved**: the three gaps sit between the cupboard and the suit rack, between the arcade and the workbench, between the monitor bank and the quota screen (checked numerically in `shipyard.test.mjs`).
* `src/game/game.js`: import + `useModule('shipyard', installShipyard)` in the slot.
* `src/game/terminal.js`: route fee (2 lines). `src/ui/panels/crafting.js`: `timeMul` (1 line).
* No light was added to the scene: modules only add pool emitters (`lights.add`, group `ship`); everything else is emissive. The scene light count never changes.

## Tests (all node, no browser)
`node tools/harness/shipyard.test.mjs` (20: rules, costs, sockets, weight, persistence sanitising), `node tools/harness/shipyard_models.test.mjs` (118: every module x tier x socket builds, colliders stay inside the room, the aisle to the next room is never blocked, core doorways are never filled, wall / floor / ceiling normals face the right way), `node tools/harness/shipyard_install.test.mjs` (25: installer against a fake game + the real ship: attach, build, doorways, host actions, revive, heal, lab, guestbook, terminal, turret, drops, fired-run persistence, late join, dispose). `npm run build` passes.

## Unverified (needs eyes)
Never seen in a renderer: module interiors (prop placement, scale of the reactor / shuttle / stage), exterior paint bands and name plate z-fighting with the old decals, the roof deck + lift feel (teleport lift, roof rails), jamb tunnels through the hull, pillar visuals over uneven terrain (the flat zone is 13 m + 16 m falloff; the far rooms reach 17.5 m east / 13.5 m north), turret muzzle flash, HUD text of the interactables, panel layout at 1280x720. Creature AI does not know the modules: creatures can walk through module walls outside the siege flow field (the hull box only widens the siege targeting). Items inside a sold module fall out of the world and are reset to the ship centre by the item manager.

## Not done (honest)
* **-x (nose) hardpoint**: the cockpit window, terminal, lever and monitor bank fill that wall and the chin block sits outside it; no doorway fits without moving props. The roof deck is the "second deck" instead.
* Furniture placement mode (ghost preview / rotate), decals / emblems, faction rewards (Archive -> Lab, Bureau -> Turret), Workshop "Forge-lite" (Epic ascension at the workshop), Workshop craft luck (`effects().craftLuck` exists, nothing reads it), Trophy Hall artifacts / CASE photos, Garage second vehicle slot / van repair (the van has no HP), Hangar drop pods, Music Room instruments (Lounge only has the jukebox visual), siege damage scaling by `siegeSurface`.
* The Trophy Hall shows the local player's bestiary (each client sees their own heads); the guestbook XP uses the host's bestiary size.
* The ux agent plans "health regen only from food"; the Med Bay bed is a deliberate exception (cooldown-gated, needs the module).

## Wave 4 note (ship2)
The core cabin was redesigned as a small Mini-Skeld (docs/wave4/ship2.md): props moved (the "no existing prop moved" claim above is historical) and partitions were added, but the doorway gaps R1 / N1 / N2, `CORE_GAPS`, `SOCKETS`, the seals and `gapWall` are unchanged and the walkway in front of each doorway is enforced by `tools/harness/ship2_overlap.test.mjs` (`shiplayout.AISLES`). Fixture positions now live in `src/world/shiplayout.js`. The roof counts as aboard in `insideShip()`; roof defence mounts + a ladder sit on the tail half of the roof, clear of the DECK / TURRET sockets.
