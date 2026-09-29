# Wave 8 - worlds3: findable Backrooms, alternate worlds, bigger and fuller facilities

Owner (TR): "make the labyrinths / procedural places bigger inside and out, add different worlds like the Backrooms. I asked for Backrooms, you added it, but I NEVER SAW it."
Module `worlds3` (`this.useModule('worlds3', installWorlds3)`), net prefix `w3`. Files: `src/game/worlds3.js` (runtime), `worlds3_core.js` (pure rules + planners), `worlds3_text.js` (TR + RU),
`src/world/worlds3_kit.js` (merged-geometry prop recipes, door frame), `worlds3_tex.js` (canvas skins). `game.backrooms` still owns the pocket lifecycle; worlds3 skins it through the
optional `game.w3` hooks (about 12 tiny lines in `backrooms.js`, all `?.`-guarded and marked `[worlds3]`).

## 1. The wrong door (why you never saw the Backrooms)
Before: a subtle glitch wall on 35 % of days, nothing else. Now:
- **Odds** (`doorChance`): 100 % on day 1 and every 3rd day (day 1, 4, 7 ...), 22 % otherwise = ~48 % overall. `br_level0` keeps its override (always). The door sits on a facility `wallSpot` (>= 2 rooms deep; falls back to any spot so a guaranteed door cannot fail on a tiny map).
- **Look**: a dark wood frame around the glitch rift, a flickering yellow glow bar + strips (emissive, no lights), an additive yellow floor spill, the existing hum (audible 22 m) and pooled yellow lamp. Sealed doors go dark.
- **First sighting** (within 4.5 m, or within 13 m and in front of the camera): HUD caption "THE WRONG DOOR / It was not here a second ago." + an Algorithm intercom line (the first-ever one is fixed, later ones random of 3) + `profile.w3.seen`.
- **Distance hint** (objectives, 5 m steps): after you have seen it, or after 60 s indoors on a guaranteed day / 150 s otherwise.
- Interaction prompt "Open the wrong door [E]" (walking into it still works). Terminal `BACKROOMS` prints the route to `br_level0` (tier 3, 404 credits, already in `MOONS`) and explains the door.
- Exits: EXIT hint objective after 100 s inside, green EXIT world marker after 150 s, void catch (a member outside the pocket volume below its floor is put back on the landing), asylum lock auto-opens after 300 s.

## 2. Worlds behind the door (same maze generator as Level 0, skinned)
`doorTheme(seed, day, moon, tier)`: day 1 is always Level 0; later days are weighted by moon tier (tier 1 never Level Fun / Ward 13). Theme id travels in `run.br.th`.

| id | name | look | signature rule | loot (value x) |
|---|---|---|---|---|
| l0 | Level 0 | unchanged | entities hunt from 4 min, brownouts | unchanged |
| pool | Poolrooms | white/cyan tile, warm water sheet, pale fog, water ambience | **sound carries far over water**: walking/sprinting reports noise pings to the creatures (Alt/crouch silent); 9 deep patches slow + drain stamina | Gilded Pool Float, Lifeguard Whistle + goldbar/trophy/ring... x1.1 |
| data | Data Center | dark navy, LED walls, server racks, cable trays, cold light | **electrified puddles** pulse: 1.5 s spark warning then 14 dmg if you stand in one | Algorithm Core Drive, Cooling Fan Array + gpu/hdd/motherboard... x1.2 |
| hotel | Endless Hotel | red/gold wallpaper, green carpet, numbered doors, sconces, luggage carts | **numbers and the map lie**: door plates re-roll and the EXIT distance hint is off by 20-40 % at every blackout; scheduled blackouts (~55 s, 6.5 s long) bring a Concierge (mannequin, max 2) | Brass Room Key 404, Concierge Ledger + bell/painting/perfume... x1.2 |
| fun | Level Fun | red confetti walls, checker floor, gift stacks, party tables, balloons | **the party starts early**: hunters from 55 s, every 15-26 s, +2 cap, mostly Partygoers | Golden Birthday Cake, Pinata Prize + trophy/airhorn... **x1.6** (econ8: was x2) |
| asylum | Ward 13 | grey-green walls, dirty checker floor, wheelchairs, beds, padded panels, file cabinets, dim green light | **the doors lock behind you**: the EXIT is locked until somebody picks up the Ward Key (hidden in the farthest / darkest loot spot); auto-opens after 300 s | Patient File 13, Restraint Jacket + skull/teeth/flask... x1.15 |

Each keeps: baked light, troffers (recoloured, the EXIT lamp stays green), the green EXIT, backrooms hunts (weights per theme), 1 Almond Water. Skin = wall/floor/ceil map swap + tint, panel/puddle colour, emitter colour, fog/hemi/ambient via `game.w3.look()`; everything is restored when the pocket unloads. Props are one lit + one glow merged mesh (no lights); solid props get static colliders and block the pocket NavGrid; wall-only placement, one prop per cell, never in the landing cell or within 2.4 m of the EXIT.

## 3. Facility size + set dressing
- **Size class** per (run seed, moon): small x0.85 / medium x1 / large x1.3 (tier 1 never large). Applied by patching `game.loadMapFor` (`moon.size` is scaled for the visit and restored in orbit, so the outdoor map scales with it). Skipped for company, custom maps, cycle moons (`layoutOpts`), backrooms interior. Toast "Facility size: X".
- **Dressing** (`planDressing`, ~17 props per layout in the node test): rooms get purposeful vignettes by type - workstations (desk, monitor with glowing screen, chair) in office/security/lab, shelving with stock + crates in storage/maintenance, table sets in breakrooms, benches in lockers, carts, and flush extinguisher / first-aid cabinets in corridors. Placement: closed wall edges only, plain walkable floor (navClear), an aisle in front, 1 m spacing (no 1-cell nooks), never near scrap / doors / interactables / vault / chest / turret spots; colliders + nav blocks for solid props. Skipped: entrance, generator, vault, maze and arena rooms, backrooms/sewer/mineshaft interiors.

## 4. i18n
All strings EN + TR + RU (`worlds3_text.js`, keys = English); items go through the display getters. `tools/i18n_audit.mjs` reports nothing for these files.

## Test / knobs
- `node tools/harness/worlds3.test.mjs` (odds, themes, size classes, 210 facility layouts x dressing incl. nav connectivity, 125 pocket dressings incl. spawn->EXIT reachability, i18n coverage). Also green: `br_pocket.test.mjs`, `br_i18n.test.mjs`, `npm run build`.
- In game: `game.w3.forceTheme('pool'|'data'|'hotel'|'fun'|'asylum')` (host) then `game.backrooms.enter('debug')`; `game.w3.sizeClass()`, `game.w3.dressCount()`, `game.w3.debug` (state).
- Knobs: `DAY_GUARANTEE` / 0.22 in `doorChance`, `SIZE_MUL`, `THEMES.*` (fog, deep*, zap*, blackout*, huntAfter, lockMax, lootMul, dressP), `KINDS` footprints.

## Not verified (browser lock was jammed; no headless run)
Visual look of every skin (texture scale on the pocket UVs, tint vs baked light), the door frame against real wall thickness, prop scale / collision feel, the hotel plate UV re-roll, zap / deep-water pacing, the asylum lock in multiplayer (key pickup detection through `item.state`), size class on the outdoor map (terrain scales with `moon.size`), Algorithm line timing, Level Fun difficulty. Pocket size itself is unchanged (13-15 cells); only facilities scale.
