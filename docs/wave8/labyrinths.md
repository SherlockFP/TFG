# Labyrinths (wave 8): new interiors + hero rooms

Owner: "improve the NORMAL labyrinths: variety, content, design. Add extra labyrinths." Time-boxed: 2 of the 4 requested interiors + hero rooms shipped.

## Shipped
| id | name | layout | look | mechanic | moon |
|---|---|---|---|---|---|
| `metro` | The Packet Subway | one straight tunnel from the entrance foyer to a terminus, 1-2 station halls (5-7 cells wide, pillars) on the way, alcoves every 3rd tunnel cell (half of them cross passages to the maintenance hall), two maintenance side halls with the ordinary rooms | rails + sleepers, hazard lines, cable trays, orange emergency strips, tiled stations | GHOST TRAIN: host rolls a gap (55-85 s, first 40-60 s), 7 s warning (red lamps + horn at both ends), then a 24 m train at 30 m/s; 60 dmg + shove once per pass, creatures stunned; alcoves / platforms / hugging the wall are safe. The tunnel is the fast shortcut. | 88-Chatroom (levrek, was mineshaft) |
| `greenhouse` | Link Rot Greenhouse | open organic zones (plan `open`), hydroponic bays with trough rows, a dome hub with a giant tree | glass roof ribs, purple emissive grow lights, leaf walls, hanging vines | VINE WALLS (up to 9 plugs on edges with a detour of >= 10 steps; cut with a melee weapon = shortcut, never the only way) + SPORE VENTS (16 s cycle, backdrop-filter blur + coughing) | 12-Forum (lufer, was factory) |

Both also roll into generated sectors (`labInterior` in `game/labyrinths_core.js`, own hash stream: older sector rolls are untouched).
Terminal moon info has a `Hazard:` line; the landing card gets a `HAZARD` row. facjobs archetypes are skipped on these moons (theme-owned layout).

## Hero rooms (older themes, `world/interiors/heroes.js`)
One set piece per theme, dropped into the best existing room (preferred types, then biggest / deepest), merged geometry + emissive only (no THREE lights), solids only where the nav grid is free:
factory crusher hall, mansion ballroom (checker floor, chandelier ring, pillars, moonlit windows) + portrait hall, mineshaft crystal grotto, office collapsed floor (rubble, hanging tiles, daylight shaft), serverfarm cold aisle, sewer waterfall junction, hospital operating theatre (surgical lamp, gallery steps, glass). Plus a variation pass on other rooms (ceiling beams, floor inlays, wall pilasters). Off switch: `globalThis.__kefalHeroOff`.

## Knobs
`TRAIN`, `SPORE`, `VINE` in `game/labyrinths_core.js`; `planVines(L, rng, max, minDetour)`; metro plan numbers in `planMetro` (station count by size, alcove spacing); hero list `HEROES` in heroes.js.

## Net
`labreq` client -> host {op:'cut', id} | {op:'sync'}; `labfx` host -> all {k:'train', dir} | {k:'cut', id} | {k:'state', cut:[ids]}.

## Tests
`node tools/harness/labyrinths.test.mjs`: 48 builds (2 themes x 6 seeds x 4 sizes): all cells reachable (locked doors closed), fire exit, alcoves / stations, all vine plugs closed at once still connected, nav path entrance -> fire exit after the real build, hero rooms placed, moon mapping, train rules. stealth_maze (10 themes x 200 seeds), facjobs, worlds3 and geomfix (all themes incl. the new ones) stay green.

## NOT built / unverified
- Prison Block (cell tiers + catwalks around a multi-floor atrium via `world/stairs.js`, lockdown alarm closing cell doors for 20 s) and Vertical Tower (3-4 floors around an elevator shaft, richer loot lower): only designed (hub room + tier decks; a well with zig-zag stair flights; host-driven cab ride with teleport-attach). `interiors/lab_kit.js` (LabBuilder: solids, slabs, rails, stair flights on planStairs) is the groundwork for both.
- Never browser-run: train speed / damage / horn timing, vine reach and the swing ray (the wrapped `resolveMelee`), spore blur strength, every look. Death cause 'train' has no message entry. A late joiner sees the vine state only after the `sync` reply.
- Random loop corridors can still pierce the tunnel wall (extra cross passages, harmless).
- Hero rooms are decorations, not layout changes; windows into other rooms and broken walls are not done (only pilasters / inlays / beams).
