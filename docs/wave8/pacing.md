# Wave 8 - outdoor pacing ("wide but empty", CRITIQUE_W8 problem 4)

Measured with `node tools/harness/pacing.test.mjs` (real `buildMoonOutdoor`, 3 seeds per moon, stub physics; also the pure mapart / soul / mining planners).
"ship>ent" = distance ship (0,0) -> main-entrance spawn point in metres (min-max over seeds). POI = landmarks + outposts + fire exits + mapart specs + soul beats + mining volumes + 1 entrance.
vis% = share of the entrance colour still visible from the ship through clear-weather exp2 fog (soul palette fog density, capped by `fogCapFor`).

| moon | tier | BEFORE ship>ent | half / play | POI | vis% | AFTER ship>ent | half / play | POI | vis% |
|---|---|---|---|---|---|---|---|---|---|
| hamsi | 1 | 79 (71-89) | 160 / 130 | 31 | 44 | 45 (42-48) | 109 / 88 | 25 | 77 |
| lufer | 1 | 82 (74-93) | 160 / 130 | 33 | 7 | 45 (42-48) | 109 / 88 | 26 | 45 |
| palamut | 2 | 84 (75-95) | 160 / 130 | 34 | 19 | 51 (48-54) | 109 / 88 | 27 | 54 |
| levrek | 2 | 88 (79-99) | 160 / 130 | 35 | 48 | 51 (48-54) | 109 / 88 | 29 | 78 |
| cipura | 3 | 90 (81-102) | 160 / 130 | 38 | 10 | 59 (56-62) | 115 / 94 | 32 | 37 |
| orkinos | 4 | 95 (86-108) | 160 / 130 | 38 | 1 | 65 (62-68) | 122 / 99 | 33 | 30 |
| w2sov | 3 | 90 (81-102) | 160 / 130 | 39 | 0 | 59 (56-62) | 115 / 94 | 30 | 30 |
| w2sun | 2 | 87 (78-99) | 160 / 130 | 35 | 40 | 51 (48-54) | 109 / 88 | 25 | 73 |
| gen (tier 1, mapScale 1.0-1.1) | 1 | 84-95 | 160-174 / 130-142 | 32-36 | 0-7 | 45-47 | 109-119 / 88-96 | 25-28 | 30-45 |
| gen (tier 2-3, mapScale 1.0-1.4) | 2-3 | 90-134 | 160-224 / 130-182 | 36-61 | 0-27 | 51-67 | 109-161 / 88-131 | 25-35 | 30-67 |
| gen3_2 (tier 4, mapScale 1.33) | 4 | 128 (115-144) | 213 / 173 | 60 | 0 | 71 (69-75) | 162 / 131 | 37 | 30 |

Area shrank ~46 % (half-size -32 %), POI count only -15..-25 %, so props per hectare rose about +50 %.

## What changed
- `terrain.js` `mapScaleOf` = moon.mapScale (1..1.6) x per-tier compaction (`COMPACT` 0.68 / 0.72 / 0.76). It is the single "scale" every module already reads (`plan.scale`, `terrain.scale`), so landmarks, ponds, fires, outposts, fauna, mapart, voyage flats, zones, mining and the terrain size all shrink together with no per-module edits (mapart's `Math.max(1, sc)` became `Math.max(0.6, sc)`). Independent of `moon.size`: worlds3 still patches only the facility size class in `loadMapFor`, nothing is scaled twice.
- Entrance distance is now an explicit `PACE` table (spawn side, m): tier 1 40-52, tier 2 46-58, tier 3 54-66, tier 4+ 60-72, big generated moons add up to 8 m more (hard cap 80 to the door). Same seeded RNG stream, so peers agree.
- The ship -> entrance path was per-point +-8 m noise on 24 points (walk = 1.7x the straight line). It is now one smooth bend (walk ~ straight line + 5 %).
- Fog: `env.fogCap = fogCapFor(shipToEntrance)` (game.js, set right after `env.setMoon`); `environment.js` clamps the clear-weather density to it (entrance keeps ~30 % of its colour; weather / night multipliers stay on top). Only moons with denser fog than that are changed (lufer, orkinos, w2sov, generated biomes).
- Soul beats (`BEAT`): first 10, gap 15, end margin 8, ship / entrance clear 12 / 11, flatter spots required; the beat colliders sit on the local ground. Base `avoidBase` keep-out around the ship 26 -> 20 m and around the entrance 20 -> 15 m (the walk is only ~50 m now).
- Denser maps keep things apart: mapart / soul `extraOk` also test `out.solidAt`, the big landmark loop and radio towers keep off rocks / trunks, plant avoid uses the same y as the plan (geomfix flakes).
- Facility interiors, worlds3 size classes, zones / mining / mapart counts and all seeds' determinism are unchanged in structure (layouts differ because the seeded outdoor layout changed).

## Knobs / tests
`COMPACT`, `PACE`, `fogCapFor` in `src/world/terrain.js`; `BEAT` in `src/game/soul_core.js`. Guard: `node tools/harness/pacing.test.mjs` (ship>ent 30-64 on named tier 1-2, <= 78 elsewhere; entrance >= 20 % visible; >= 8 POI). Also run geomfix (0 in every category, verified with 5 seeds), mapart, soul, mining, worlds3, labyrinths, maps2, maps2_rules, zones, voyage, eggs, survival, worlds2, mirror.

Not verified: real-browser look (no headless run: quota), moon-specific fog feel in rain / night, the two zone/siege modules with hard-coded distances only via their node tests.
