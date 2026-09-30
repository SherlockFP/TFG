# Wave 8 - EXPEDITION MOONS (module `expeditions`, net prefix `ex`)

Owner: "The game does not have to be Lethal Company themed: add other places, the NEEDS and GOALS can differ on other maps." Three hand-designed special moons, each with its own **need** and **goal** (nothing like "loot a facility"), still inside the identity: the Algorithm streams it (Algorithm lines, billboards = its ads, drones = feedcams2 drones).

Files: `src/game/expeditions.js` (module + registration), `expeditions_core.js` (pure rules + seeded layouts), `expeditions_text.js` (TR + RU), `src/world/expeditions_maps.js` (three map builders). Test: `node tools/harness/expeditions.test.mjs` (6993 checks). Shared-file edits are tiny and marked `[expeditions]`.

| moon (id) | tier | NEED (local, tiny HUD bar) | GOAL | hazard | unique loot |
|---|---|---|---|---|---|
| **Sunken Server Barge** `ex_barge` | 3 | **OXYGEN**: 32 s of air while the eyes are under the water sheet; refills at bubble vents (2.1 m) and inside the two roofed cabins; Air Tank item = +26 s; 0 air = 6 dmg/s through `damageLocal` (cause `drown`, downed rules apply); wading is 22 % slower | recover 3 data cores (server deck cabin, hold aisle, bridge cabin) and put them in the ship | hold currents + jets through the bulkhead doors (`player.exPush`), the **Trench Eel** (hunts submerged players who are not at a vent / in a cabin, path over a 0.5 m nav grid of the hull, 0.5 s wind-up lunge, second eel wakes at 2 cores) | Flooded Data Core (goal), Barnacled Server Blade, Air Tank |
| **Dune Relay Caravan** `ex_dune` | 2 | **HEAT** 0-100: rises in the sun (`sunFactor` of the clock), falls in shade (tents, rock outcrops, ship, parked crawler) and with a Canteen (-38); >= 62 slows you, >= 88 burns 3 hp/s (`heat`) | escort + repair the **relay crawler** S0 -> C1 -> C2 -> C3 before the sandstorm peaks (17:00). Repair = stay within 8 m for 11 s; it only drives while somebody is within 36 m (escort) | sandstorm (fog + wind + dust particles from 15:00), **Dune Maws** (the worlds2 burrower, one more per repair, two more at the storm) | Sun-Fused Glass, Relay Capacitor (drops at each checkpoint), Canteen |
| **Rooftop Blackout City** `ex_roof` | 3 | **POWER**: one Power Cell (2 hands, heavy) drains 0.34 %/s while somebody carries it; each billboard costs 24 %, the generator swap gives +46 % (45 s cooldown) | relight 4 billboards (kiosk [E], needs the cell in hand) | **falls**: roofs are 6.7-10.7 m up = the game's 25-damage tier, downed rules, never a kill; stairs on the 4 plaza faces to climb back; **feedcams2 drones** circle the generator building (always night: `biome.minNight`) | Ad Reel Spool, Dead Neon Letter |

## Maps (custom `moon.customMap`, no facility)
- Shared heightfield `Terrain` (barge: seabed basin + dock slope, `hf` in the plan; dune: the **desert dune kit** with flat pads at S0 / C1..C3; roof: flat street, `heightAt` lifted over roofs so the drone searchlight lands on them). Everything else: boxes baked by `voyage_kit.Kit` into 2 merged meshes (lit + emissive), static colliders, pooled emitters (light count constant). No THREE lights are added.
- Barge: hull along x with side / stern / bow walls, breach + door gaps, 2 bulkheads, a **server deck** (slab 3.6 m up, ramp via `world/stairs.js`), roofed cabins (air pockets), container row with an aisle, 6 bubble vents (cyan cap + emitter + rising bubble points), currents, water sheet, dock plate under the ship, core beacons that hide when the core has left its spot.
- Dune: route of 3 legs (~100 m, inside +-92 m), tents, water barrels (2 canteens each), rock outcrops, 3 relay pylons whose lamps turn green, the crawler (own group, lamps show progress, headlamp emitter, chassis collider only while parked), dust points around the camera.
- Roof: 8 buildings around the plaza (ship), planks between equal-height neighbours (gap 8 m), zip-lines between the rest (poles + cable, 12-16 m gaps, height difference >= 1.4 m), 4 stairs, 4 billboards (canvas ad texture, dark until lit), generator, clutter with rejection sampling (edges, stairs, planks, landing pads), skyline towers.
- geomfix coverage extended: 3 kinds x N seeds, every plan spot (`spotsOf`) must stand on real support (terrain or a collider top: deck / roof / plank) and inside the map, NaN / zero scale.

## Flow
- **Unlock**: the moons enter `MOON_ORDER` (terminal `MOONS` / `ROUTE` / `INFO`) once `game.onboard.locked('voyage')` is false (hubgate quota 5; "unlock everything" too), not in Quick Shift. Before that a seeded **expedition contract** (14 % per orbit from quota 1) lists one moon for that day only (`run.exo = {m, d}`, host sys message + Algorithm line).
- **Landing card**: the INTERIOR row becomes EXPEDITION + name, plus NEED and GOAL rows. **Objective line**: `game.expeditions.lines` via the `objectives` hook; `objectives.js` calls `filterLines` so the facility lines vanish. Terminal INFO is replaced (`moonInfo` wrap).
- **Payout** (`payout(kind, quota)`): credits per step + final bonus (0.08-0.3 x quota) and unique scrap whose value is set at spawn (0.04-0.13 x quota), so a full run is about one quota. Credits go to `run.credits` on the host; scrap counts as normal scrap.
- Host-authoritative goal state `run.ex` (barge `{n}`, dune `{cp, rp, w[]}`, roof `{b[], c, g[]}`); needs are local per player. Crawler position streams as `exfx {k:'cw'}` (2.5 Hz while moving), clients extrapolate.

## Net (prefix `ex`)
`exreq` client -> host: `{op:'sync'}` | `{op:'water', i}` | `{op:'relight', i}` | `{op:'charge'}`. `exfx` host -> all (HOST_ONLY): `cw {i,s,m,r,h}`, `pay`, `say`, `banner`, `lit {i}`, `chg`, `no {why}`. Run keys `ex`, `exo`.

## Shared-file edits (all one-liners)
`game.js` (import, slot, death texts `drown` / `heat`), `objectives.js` (`filterLines`), `entities/localplayer.js` (`exMul`, `exPush`), `world/environment.js` (`biome.minNight`), `zones_core.js` / `collection.js` / `voyage.js` / `voyage_core.js` (skip `moon.expedition`), `host.js` (no daily event: a blackout event would dim the pooled emitters), `worlds2.js` (no night prowlers / decay / raids on these moons), `horde.js` (no swarm director). The moons also carry `noExtraSpawns`.

## Knobs
`OXY`, `HEAT`, `CELL`, `ZIP`, `STORM`, `DUNE`, `BARGE`, `payout`, `CONTRACT` in `expeditions_core.js`; plan generators `planBarge / planDune / planRoof`; biome bases `BIOME_BASE` in `expeditions.js`.

## Not verified (no browser run: QA owns it)
Every look (water tint / fog switch, bubbles, dust, billboard texture, crawler model), zip-line ride feel (per-frame `teleport`), plank width vs. the controller, current strength (`exPush` added to the controller movement), eel pacing and the nav grid in play, sandstorm visibility / timing (peak at 17:00 vs. a 12 min day), heat numbers, the landing-card row layout at 1280x720, the mapmods (sector map affixes) interplay on these moons, a real 2-player host / joiner run. Drones on the roof map circle the generator building at night (the disc lands on roofs through `heightAt`). Barge hides `plan.entrance` so feedcams2 spawns no drones underwater. Crawler is not solid while moving.
