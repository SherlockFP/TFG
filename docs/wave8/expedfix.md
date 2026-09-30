# Expedition maps: memory + readability pass (wave 8 night)

Bug (docs/wave8/qa_night2.md, high): landing on Sunken Server Barge / Rooftop Blackout City crashed a fresh software-GL tab at ~7 GB, and the barge / dune frames were a flat pale wash.

## 1. What the node measurement showed (seed 4242, `buildExpeditionMap` on stub physics)

| map | meshes | vertices | geometry MB | materials | canvas textures | colliders | emitters | terrain res |
|---|---|---|---|---|---|---|---|---|
| barge | 11 | 64.6k | 2.8 | 11 | 3 (terrain) | 67 | 10 | 100 |
| dune | 14 | 47.7k | 2.1 | 14 | 3 (terrain) | 36 | 1 | 85 |
| roof | 27 | 57.6k | 2.4 | 27 | 2 (terrain) | 183 | 6 | 80 |

The geometry is NOT the problem: the water sheet is one 4-vertex quad (no segments), the Kit bakes everything into two merged meshes, the 420 m plane is 2 triangles. Nothing in the map build itself can reach GBs. In the browser (instant landing, no render, 20 ticks) the barge stays at ~1.8 GB RSS and renders in 12-124 ms; the roof landing is CPU / memory heavy in the tick + prewarm phase (see section 4).

## 2. Leaks / waste removed (`src/world/expeditions_maps.js`)
- Roof billboards: one canvas per BILLBOARD (256x112, non power-of-two, never disposed = leaked per landing). Now one 256x128 texture per ad style (max 4), mipmaps off, disposed with the map (`dispose` hook), LED cube geometry shared.
- Roof plaza lamps: six `Kit`s (12 meshes + 12 materials + 12 geometries) merged into the skyline kit (2 meshes).
- Barge: fog above water thinned (`fogDensity` 0.016 -> 0.0085; underwater `fogSet` still adds +0.034 so the dive closes in), so the hull and wrecks read from the dock instead of vanishing at 60 m.
- Barge: 9 wreck silhouettes (masts with a red lamp, funnels, listing container stacks) poke above the water around the basin (seeded, merged into the existing Kit, 4-vertex-free boxes / cylinders, solid = one box each, never inside the hull / near vents, cores, rocks).

## 3. Test
`node tools/harness/expedfix.test.mjs`: per map and seed vertex / mesh budget, canvases power-of-two <= 512 and drawn once per style, every geometry (and the ad textures) freed on dispose, barge water is one quad, wrecks exist and stay clear of the hull, barge fog thin above / dense under water.

## 4. Headless run
See the numbers table in AGENTS.md section 5 (`ex_*.jpg` in `docs/wave8/qa_shots/`).
