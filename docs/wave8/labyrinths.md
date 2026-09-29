# Labyrinths (wave 8): new interiors + hero rooms

Owner: "improve the NORMAL labyrinths: variety, content, design. Add extra labyrinths." All 4 requested interiors + hero rooms shipped (metro + greenhouse first, prison + tower in the follow-up).

## Shipped
| id | name | layout | look | mechanic | moon |
|---|---|---|---|---|---|
| `metro` | The Packet Subway | one straight tunnel from the entrance foyer to a terminus, 1-2 station halls (5-7 cells wide, pillars) on the way, alcoves every 3rd tunnel cell (half of them cross passages to the maintenance hall), two maintenance side halls with the ordinary rooms | rails + sleepers, hazard lines, cable trays, orange emergency strips, tiled stations | GHOST TRAIN: host rolls a gap (55-85 s, first 40-60 s), 7 s warning (red lamps + horn at both ends), then a 24 m train at 30 m/s; 60 dmg + shove once per pass, creatures stunned; alcoves / platforms / hugging the wall are safe. The tunnel is the fast shortcut. | 88-Chatroom (levrek, was mineshaft) |
| `greenhouse` | Link Rot Greenhouse | open organic zones (plan `open`), hydroponic bays with trough rows, a dome hub with a giant tree | glass roof ribs, purple emissive grow lights, leaf walls, hanging vines | VINE WALLS (up to 9 plugs on edges with a detour of >= 10 steps; cut with a melee weapon = shortcut, never the only way) + SPORE VENTS (16 s cycle, backdrop-filter blur + coughing) | 12-Forum (lufer, was factory) |
| `prison` | Banhammer Penitentiary | ordinary room labyrinth + a hub CELLBLOCK (7x6 cells, 11.9 m): 3 tiers (ground, +3.9, +7.8) of cells (2 m modules, 2.6 deep) around an open atrium, catwalk rings with railings, guard posts in the corners, flight 1 ground -> tier 1 (north strip), flight 2 tier 1 -> tier 2 (south strip), both `world/stairs.js` ramps with stringer walls; cells skip wall units that hold a doorway | brick, metal plate, amber emissive strips, red alarm beacons | LOCKDOWN: host gap 70-110 s (first 45-70 s), 3 s siren, then every cell gate (instanced bars + colliders, nav cell closed) shuts for 20 s; loot spots in cells on every tier (upper ones `elevated`) | 666-Creepypasta (cipura, was mansion) |
| `tower` | The Ivory Tower | ordinary room labyrinth + hub TOWER (7x7 cells): a 12 m WELL cut through the floor (facility.js `pit`: no floor tiles, split slab, `contains` extended) with 3 lower floors (ring of blocks + loot: 3 / 5 / 7 spots on floors -1 / -2 / -3), zig-zag stair flights down the well, bridges + rails, a central elevator shaft | marble atrium, carpet floors, cold ceiling strips | ELEVATOR: call panels + 4 floor buttons in the cab; host validates `labreq` {op:'elev'} and broadcasts `labfx` {k:'elev'}; cab animates on every peer, a rider is carried by per-frame teleports, gates close behind / open at the destination; rides of 2+ levels can stall 3 s (power_down + loud noise at the shaft top) | 1991-Runet Panelka (worlds2 fixed moon, was office; the two remaining older moons went to repomaps) |

All four also roll into generated sectors (`labInterior` in `game/labyrinths_core.js`, own hash stream: older sector rolls are untouched).
Terminal moon info has a `Hazard:` line; the landing card gets a `HAZARD` row. facjobs archetypes are skipped on these moons (theme-owned layout).

## Hero rooms (older themes, `world/interiors/heroes.js`)
One set piece per theme, dropped into the best existing room (preferred types, then biggest / deepest), merged geometry + emissive only (no THREE lights), solids only where the nav grid is free:
factory crusher hall, mansion ballroom (checker floor, chandelier ring, pillars, moonlit windows) + portrait hall, mineshaft crystal grotto, office collapsed floor (rubble, hanging tiles, daylight shaft), serverfarm cold aisle, sewer waterfall junction, hospital operating theatre (surgical lamp, gallery steps, glass). Plus a variation pass on other rooms (ceiling beams, floor inlays, wall pilasters). Off switch: `globalThis.__kefalHeroOff`.

## Knobs
`TRAIN`, `SPORE`, `VINE`, `LOCK`, `ELEV` in `game/labyrinths_core.js`; `planVines(L, rng, max, minDetour)`; metro plan numbers in `planMetro` (station count by size, alcove spacing); hero list `HEROES` in heroes.js.

## Net
`labreq` client -> host {op:'cut', id} | {op:'sync'}; `labfx` host -> all {k:'train', dir} | {k:'cut', id} | {k:'state', cut:[ids]} | {k:'lock'} | {k:'elev', from, to, n, dur, stall}; `labreq` also {op:'elev', to}.

## Tests
`node tools/harness/labyrinths.test.mjs`: 96 builds (4 themes x 6 seeds x 4 sizes): all cells reachable (locked doors closed), fire exit, alcoves / stations, all vine plugs closed at once still connected, nav path entrance -> fire exit after the real build, hero rooms placed, moon mapping, train / lockdown / elevator rules, prison gates + flights chain (checkStairs), tower well is open, floors chain L3 -> ground, loot grows with depth, `contains` reaches the lowest floor. stealth_maze (10 themes x 200 seeds), facjobs, worlds3 and geomfix (all themes incl. the new ones) stay green.

## NOT verified
- Never browser-run: train speed / damage / horn timing, vine reach and the swing ray (the wrapped `resolveMelee`), spore blur strength, lockdown gate placement (gate collider skipped where the local player stands, so someone standing in a doorway can stay outside), stair feel on the ramps (slopes are checked with `checkStairs`: <= 47 deg), the elevator ride (per-frame teleport of the rider, gate colliders re-created at runtime), every look.
- Tower: creatures cannot follow onto the lower floors (nav is ground-only); the danger below is the stall noise. The cab state is not replayed for late joiners (cab assumed at ground). Falling into the well from the rim (rails everywhere except lane / bridge gaps) would be ~13 m.
- Prison: tier stairs are optional loot access only. Cells on upper tiers give `elevated` scrap spots.
- Death cause 'train' now has a message (EN / TR / RU).
- Random loop corridors can still pierce the metro tunnel wall (extra cross passages, harmless).
- Hero rooms are decorations, not layout changes; windows into other rooms and broken walls are not done (only pilasters / inlays / beams).
- geomfix reports 2 `blocking doors:museum` (repomaps theme, not part of this work).
