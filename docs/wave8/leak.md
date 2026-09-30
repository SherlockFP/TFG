# Leak hunt (qa_night3 open bug #1: OOM in the real-time takeoff, crash at the 3rd landing)

## Method
No browser. `tools/harness/leak.test.mjs` builds each map kind with the REAL builders (3 expedition maps, outdoor + facility of `hamsi`, company)
5x on a canvas/physics stub, then calls `dispose()` and checks, per cycle, which geometry / material / texture reachable from the map group never fired
`dispose`. Objects already leaked by an earlier cycle are not counted again, so shared caches (getTexture / getMaterial / levelMaterial: bounded, first use only)
are separated from real per-landing leaks (fresh objects every landing). Geometries must be freed exactly; fresh materials / textures after 3 warm-up landings <= 12 / 3.

## Findings (before -> after)
- outdoor: 17 geometries per landing never freed (instanced trees / rocks / props: `dispose` skipped `InstancedMesh`) -> 0.
- facility: 3-5 geometries per landing (maps2 + variety groups detach themselves before the final traverse) -> 0; ~10-30 fresh per-prop materials (keypad screens, maps2 lights) each landing.
- company: 5 materials + 1 canvas texture per landing (slot-machine / quest-board screens, water) -> 0.
- expedition maps: 3 kit materials per landing (pad / wreck / kiosk, not in the `mats` list) -> 0.
- Modules read and found clean (own dispose on unload): soul beats, mapart(+art), mining chunks, lcmonsters fx, bossdress, feedcams2 drones, warmset (geometry only, materials kept on purpose).

## Fix
`freeTree(root)` in `src/render/textures.js`: frees every geometry (instanced too, `userData.shared` kept) and every material / texture that is not in the shared
getMaterial / getTexture caches. Called FIRST in `dispose()` of terrain outdoor, facility, company and the expedition maps (before sub-systems detach their groups).
`gpusweep.js` was left alone on purpose: disposing materials there would release the programs warmset compiles.

## Takeoff OOM: not found in code
Read: `updateMapAnimation` (only moves `mapGroup.y`, no allocation), `onPhase('takeoff')` (colliders only), env landingT blend (one Color per frame, fog -> 0, stars on),
expeditions (returns early outside `moon`), highlights / soul / static / mirror / cruiser phase hooks (one-shot). Nothing allocates per frame or rebuilds the map in takeoff.
Best explanation: run D held a full dune landing (software GL keeps ~2-4 GB of JIT + textures) and the takeoff render adds the unfogged far terrain + sun halo fill; i.e. the same
"one landing per software-GL tab" ceiling, not a takeoff-specific leak. The per-landing leaks above (a few thousand fresh geometries over 3 landings incl. instanced
tree / rock sets on GPU) do explain part of the 3rd-landing crash.

## Unverified
Real renderer.info counts (needs a browser run: `kefal.game.engine.renderer.info.memory` after 3 landings, expect flat geometries), the takeoff on a real GPU,
per-landing shader recompile cost of disposed shared materials (programs shared with the ship stay alive), lair dressing / practicals / labyrinth kits / creatureRead dots / highlight canvases (not audited).
