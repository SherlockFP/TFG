# Wave 7 - perf2: quality presets, lazy chunks, ship prop merge, gpusweep check

## 1. Graphics quality (Settings > Video > Graphics quality: Auto / Low / Medium / High)
`src/render/quality.js` (pure tables, node-tested) + live object `QUALITY` read by the hot paths. `settings.quality`, `settings.qualityAuto` (probe result).
| knob | Low | Medium (= old look) | High |
|---|---|---|---|
| render height (written into settings.renderHeight) | 240 | 360 | 480 |
| outlines (written into settings.outlines) / bloom | off / off (shader branch skipped) | on / on | on / on |
| far plane outdoors / fog density x | 230 / 1.5 | 420 / 1 | 420 / 0.9 |
| small-prop distance cull (`render/distcull.js`, outdoors) | 85 m | 170 m | off |
| particles burst x / ring cap | 0.5 / 240 | 1 / 600 | 1.25 / 600 |
| instanced decor kept (outdoor_biomes, home3 cloth+debris, mapart scars) | 50% | 100% | 100% |
| creature LOD: beyond N m animate every k-th frame | 28 m / 3 | 60 m / 2 | off |

No shadow knob: the renderer has no shadow maps. Auto: first boot only, 3 s fps probe on the menu scene (`FpsProbe`): <40 fps Low, >=100 fps High, else Medium (Medium keeps the player's own resolution/outline settings); skipped under webdriver. Decor thinning applies to maps built after the change (next landing).

MEASURED (swiftshader, hamsi, old script, same built map): Low vs Medium calls were 500 vs 503 landed - the far/fog/LOD knobs alone do NOT cut calls on a small moon, and the distance cull had no time to run in that script. The re-land Low vs Medium comparison (tools/harness/wave7_perf2_diag.js) was NOT completed (browser crashed, owner quota stop), so the "Low ~60% of Medium" target is UNVERIFIED and probably not met for draw calls (instanced decor thinning cuts triangles, not calls).

## 2. Bundle / first load (`npm run build`)
Lazy chunks: `src/game/lazymods.js` (dynamic import per module; main.js awaits `preloadLazyModules()` before `new Game`, prefetches 1.2 s after boot, one retry) for arcade (+chess3d, rps ui), boardgame, voyage, homeworld, homeworld2, story, dance, cemotes, backrooms, bosses, mirror, siege, anomaly, horror, pets, survival, shipyard, worlds2, maps5. game.js imports the same `installX` names from lazymods.js, so install order and every hook are unchanged. Sound-pack UI was already lazy.

| | before | after |
|---|---|---|
| total JS | 11646 kB (gz 4268) | 11667 kB (gz 4297) |
| first-load JS (static closure of index.html) | 11153 kB (gz 4114) | 9844 kB (gz 3622) = -11.7% (-12% gz) |
| entry chunk | 11153 kB | 4087 kB |

Rapier wasm (physics chunk, 4.3 MB) is needed at the menu and stays in first load. Evaluation order of the lazy chunks is no longer the static import order (only matters for two modules writing the same translation key).

## 3. Draw calls
- Outdoor prop merge (terrain.js) measured worse (556 -> 573): now OPT-IN (`globalThis.__kefalOutMerge = true`), default off.
- Ship: `world/ship.js` merges the static parts of its furniture (`mergeStaticMeshes`; every `userData.anchors` node - screens, lever handle, doors - is flagged noMerge). Kill switch `__kefalNoShipMerge` or `?nomerge`. Measured orbit: 180 -> 176 calls, ship meshes 331 -> 293 (57 merged); small because module-added ship objects (workbench 33 meshes, arcade table 20, decon shower 18, shipFeatures 17, pet incubator 9) are not merged (they animate; a per-module allowlist is needed). Outdoor landed numbers are noisy (503 vs 465 between runs) and not attributable.

## 4. gpusweep
Node simulation with the real `gpusweep.js` (tools/harness/gpusweep_cycle.test.mjs, 17 checks; residency emulated via 'dispose' events) found a real gap: resources that lived shorter than the 1.5 s scan (killed creatures, thrown items) were never remembered, so geometries/textures grew ~5 per cycle. Fixed: an `Object3D.prototype.onBeforeRender` hook remembers everything actually drawn while a map is up (restored on dispose). Sim: 8 load/unload cycles plateau at 1 resident geometry (was +5/cycle), shared / render-target / keep textures untouched, one sweep per unload, no sweep on same-map reload. Not re-verified in a browser.

## Tests / files
`node tools/harness/perf2.test.mjs` (171 checks: presets, probe, thinning, distcull, lazy loader, wiring), `node tools/harness/gpusweep_cycle.test.mjs`, worlds2.test.mjs updated for the lazymods import. Files: src/render/{quality,quality_i18n,distcull}.js, src/game/lazymods.js, gpusweep.js, engine.js, main.js, ship.js, terrain.js, ui.js and small hooks (particles, creatures, environment, outdoor_biomes, homeworld_decor, mapart_art, game.js).
