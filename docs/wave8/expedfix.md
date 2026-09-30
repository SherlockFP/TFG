# Expedition maps: memory + readability pass (wave 8 night)

Bug (docs/wave8/qa_night2.md, high): landing on Sunken Server Barge / Rooftop Blackout City crashed a fresh software-GL tab at ~7 GB, and the barge / dune frames were a flat pale wash.

## 1. What the node measurement showed (seed 4242, `buildExpeditionMap` on stub physics)

| map | meshes | vertices | geometry MB | materials | canvas textures | colliders | emitters | terrain res |
|---|---|---|---|---|---|---|---|---|
| barge | 11 | 64.6k | 2.8 | 11 | 3 (terrain) | 67 | 10 | 100 |
| dune | 14 | 47.7k | 2.1 | 14 | 3 (terrain) | 36 | 1 | 85 |
| roof | 27 | 57.6k | 2.4 | 27 | 2 (terrain) | 183 | 6 | 80 |

The geometry is NOT the problem: the water sheet is one 4-vertex quad (no segments), the Kit bakes everything into two merged meshes, the 420 m plane is 2 triangles. Nothing in the map build itself can reach GBs. In the browser a fresh-tab landing on each moon stays at ~1.5-1.9 GB RSS and renders a frame in 11-22 ms once the shaders are compiled (section 5).

## 2. Leaks / waste removed (`src/world/expeditions_maps.js`)
- Roof billboards: one canvas per BILLBOARD (256x112, non power-of-two, never disposed = leaked per landing). Now one 256x128 texture per ad style (max 4), mipmaps off, disposed with the map (`dispose` hook), LED cube geometry shared.
- Roof plaza lamps: six `Kit`s (12 meshes + 12 materials + 12 geometries) merged into the skyline kit (2 meshes).

## 3. Why the frames were a wash, and what changed
- `game.js`: the [pacing] fog cap (`fogCapFor`, 0.012 when the first target is 90 m away) also clamped the barge DIVE fog (`fogSet` raises the density to 0.0425 under water), so above and below water looked the same and both were a dense teal wall. Expedition maps (`outdoor.expedition`) now skip the cap. Measured scene fog density above water 0.0188 -> 0.010.
- Barge: base fog 0.016 -> 0.0085, sea sheet darker (0x0f5a72, 0.6), the pale-green additive `spores` motes removed (large pale squares next to the camera were the "green wash"), 9 seeded wreck silhouettes (mast + red lamp, funnel, listing container stack; 6 of them in the cone toward the barge so they show from the dock).
- Roof: a dim violet glow line along every roof rim so the blackout city reads as walkable roofs before the billboards are relit.
- Dune: no change needed (warm sand, crawler + glowing cab, ship in frame).

## 4. Test
`node tools/harness/expedfix.test.mjs`: per map and seed vertex / mesh budget, canvases power-of-two <= 512 and drawn once per style, every geometry (and the ad textures) freed on dispose, barge water is one quad, wrecks exist and stay clear of the hull, barge fog thin above / dense under water. Also run: expeditions, geomfix, pacing, warmset, perf2, `npm run build`.

## 5. Headless (fresh tab per moon, instant landing, 1280x720, swiftshader, `docs/wave8/qa_shots/ex_barge|ex_dune|ex_roof.jpg`)
`kefal.game.perfInfo()` after the first frame (renderer counters vary with what has been drawn, so read geometries as +-100):

| moon | programs | geometries | textures | first render | notes |
|---|---|---|---|---|---|
| hamsi | 109 | 382 | 120 | 2.3 s | landing 2.5 s |
| ex_barge | 87 | 270 | 83 | 14 ms | fog 0.010 above water |
| ex_dune | 81 | 140 | 72 | 11 ms | |
| ex_roof | 81 | 149 | 73 | 22 ms | |

No crash, 0 pageerrors, no `webglcontextlost`. In this environment an expedition landing in a fresh tab peaks near 1.5-1.9 GB RSS (not 7 GB) and takes 20-45 s to reach the first frame (program compile + the game's own rAF loop rendering while the landing queue runs). NOT reproduced: the 7 GB kill. One run that landed hamsi, rendered, took off and landed the barge in the same tab crashed the renderer (OOM under load from ~15 other agents' tabs), so a moon-to-moon transition in one software-GL tab is still the risky case; the map itself is not what fills memory.

Harness note: this sandbox's vite dev server does NOT notice edits made after it started (its watcher is dead); restart it (`kill` your own PID, start again) before a run or the page keeps serving the old code. I lost several runs to this.

## 6. Readability polish 2 (`ex2_barge|ex2_dune|ex2_roof.jpg`, all emissive/merged, no new THREE lights)
- Barge: lighter hull/deck materials; warm rail lamps + portholes above the waterline along the dock-facing wall, cyan lamps on the far rails, a crane (mast, jib, red lamps) on the hull. Fog above water 0.0099 vs 0.0425 under water (unchanged, dense underwater).
- Roof: lighter roof slabs, puddle patches (dim blue emissive), roof-access door + warm lamp per building, 3 status LEDs per AC unit, faint violet/amber glow at the skyline tower feet, lighter violet fog colour (0x2a1a4a). Still night.
- Dune: warmer/denser haze fog (0xdca060, 0.0105), sun 0xfff0c8, an unfogged additive sun disc + halo (billboard at -150,85,-150), checkpoint lamps 1.8x with a 60 m additive beam (red -> green).
- Honest result: from the dock the barge is still ~95 m away, so it reads as a lit band with lamps (crane not clearly visible); the roof shot at plaza level shows the rim glow but roofs stay dark from the ground; the dune sun is not in the framed shot. Not tuned further (one-run budget). A same-tab moon-to-moon takeoff did not complete in 244 s, so the three shots came from three fresh tabs.

## 7. Same-tab takeoff + barge distance (wave 8 follow-up)
- Takeoff: no expedition-specific blocker found. `expeditions.js` wraps neither `hostBeginTakeoff` nor `hostFinishTakeoff`; on `takeoff`/`orbit` it only clears the player state, fog and UI, and `update` returns early when the phase is not `moon`. The probable cause of the 244 s hang is the designed pre-flight fault checklist (`shipfaults.js`: `Takeoff blocked: n faults left`, needs `gameplay2.parts.faults.fixAll()`), and/or the lever being ignored (`hostLever` needs the player inside the ship; after an instant landing the harness player stands on the moon). expeditions test now ticks the module through the `takeoff` phase in the water without throwing. Not reproduced in a browser (one-run budget).
- Barge: hull centre 58-62 m from the dock (was 90-98), so the near wall is ~44-48 m out. Vents: the shallows reach the seabed at r=41, so the first vent sits ~30 m out (0.82 of the breach path) plus one flanking vent at 0.94 (+7 m); wrecks in the view cone now sit 18-44 m out. Swim ~45 m ≈ 13 s of the 32 s air, so the vents still matter once inside the hull. Tests: expeditions (with new hull-distance + takeoff-phase checks), expedfix, geomfix, pacing, build green.
