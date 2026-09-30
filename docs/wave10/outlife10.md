# Wave 10 - OUTLIFE (module `outlife10`, `src/game/outlife10.js` + `_core.js` + `_art.js`)

Owner complaint: outdoors read as "empty flat hills with a pylon" (soulless). This layer ENRICHES what terrain.js / outdoor_biomes.js / landmarks / mapart / soul already place; it never replaces them.
Local presentation only: no net messages, no host state (`game.outlife10`). Seeded by (moon, seed) so every peer builds the same layout.

## What it adds (every regular outdoor moon, per biome family: hills, swamp, snow, desert, moor, blackforest + datascape / servermarsh / ashfield / crystal)
- **Ground cover** (`PROFILES` in outlife10_core.js): jittered-icosahedron boulders / slabs / standing stones (desert spires, moor stones), snow drifts + dunes (flat mounds), blade / reed / spike / twig tufts in clumps (cross-quad billboards, canvas cut-out), snags (dead trees) and stumps.
- **5 points of interest** (Company debris with a silhouette, a sound and one dark-humour line, shown once per kind when you stand next to it): tyre heap (wind moan), spilled returned crates with a blinking tracker (loose lid rattle), dead CRT monitors, one still watching and facing the ship (static hiss, flickering screens), an office-chair meeting nobody left with a whiteboard (creak), Company cables sinking into the ground from a hatch (mains hum). 4-9 per map, >= 22 m apart, the first two 14-30 m off the walk so they read from the route.
- **Atmosphere**: fog pools = 3 stacked soft cards in the flattest hollows (one InstancedMesh, colour follows scene fog + biome tint + night); ONE pooled Points object per biome: pollen + fireflies (hills), spores + fireflies (swamp), snow, blown dust (desert), wisps (moor), ash + rising embers (blackforest). Generated biomes with `fx` (glitch / ash / spores / sparkle) keep environment.js particles (no duplicate).
- **Horizon**: a second, paler skyline ring BEHIND mapart's (`skylineSpecs`): turbines + transmission line (hills), cypress + stilt tanks (swamp), ice peaks + gondola pylons (snow), mesas + dishes (desert), tors + standing-stone ring (moor), dense conifer treeline + cooling towers (blackforest), monoliths / stacks / spires for the generated biomes. Plus 3 red blinking mast beacons and the Algorithm's watcher tower (a ring with a pupil on a mast, facing the ship) on every horizon.

## Rules kept
Off the ship pad (24 m), the entrance (18 m), fire exits (12 m), ponds / frozen lakes / lava / flood water, outposts, landmark + voyage + mapart + soul footprints, trees, rocks, scrap spots, and the walking lane (rocks 5 m, snags 6, POIs 12, tufts 2.6, collider boulders 18 - soul beats sit <= 17 m from the path, so colliders never depend on soul's build timing).
Colliders: big boulders only (<= 12 per moon). Draw calls: rocks 1, tufts 2, snag 1, stump 1, POI 2, fog 1, skyline 1, beacons 1, particles 1 = 10-11 (budget 25). No THREE lights. Low graphics preset: `thinDecor` halves the non-collider instances, particle count follows `QUALITY.particles`, the skyline radius is clamped inside `QUALITY.far`.
Built as landing jobs (`game.landQ.add('outlife:<step>')`, 8 steps) after mapart + soul placed their props (waits 2-6 ticks); a last job calls `landQ.prewarm()`. Disposed with the map (colliders removed, geometry / textures freed).

## Test / knobs
`node tools/harness/outlife10.test.mjs`: deterministic layout, clearance (ship / entrance / fire / ponds / path / water, ~3000 items over 6 moons x 2 seeds), counts per family, <= 13 draw calls + finite geometry, EN/TR/RU text, install -> landing-queue build -> update -> dispose on a stub game (no module warnings).
Knobs: `PROFILES` (counts, colours, fog, fx), `POI_W` (kind weights), `POI_R`, `FX` in outlife10.js, `AMB` (POI sounds), `skylineSpecs` per family. Console: `kefal.game.outlife10.stats()` / `.pois()` / `.plan()`.

## Not verified / known gaps
- No browser run (lead verifies): silhouettes, tuft texture legibility, fog card edges where a card meets a slope, the monitor / chair / cable geometry orientation, particle sizes and the skyline tint against each palette have only been checked as numbers.
- Snags, stumps and tufts have no colliders (thin, by the "big rocks only" rule): a player can clip through a snag trunk.
- Beacons blink in sync (deliberate: real aircraft lights); skyline colour = fog x 0.72, so at deep night it merges with the sky and only the beacons remain.
- Toast fires once per POI kind per moon (45 s gap, not while chased / dead); it does not share soul's voice gate.
- Not built: night-time POI glow beyond the monitors / tracker / cable band emissive (no lights by rule), per-biome POI variants (kinds are shared, only weights differ).
