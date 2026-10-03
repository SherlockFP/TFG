# Wave35 authored world evidence

2026-10-03. Owner: map agent. Shared checkout; root owns Git and assembled Game/browser verification. This report covers the planner, narrow facility seams and `openplaces35_world.test.mjs` only.

## Implemented contract

`src/world/interiors/openplaces35_plan.js:4` accepts a version35 `opts.open35` receipt kind matched to the existing registered theme: factory/courtyard, greenhouse/concourse or backrooms/reception. Direct string kinds are also accepted by the pure planner. Wrong versions/kinds/themes and explicit arena/labyrinth/wings owners retain normal generation. `facility.js:60` admits the plan before random room placement, maze walls, variety and maps2 retyping; markerless generation follows the unchanged body.

Each authored place has fourteen native rooms: one entrance, six connected public zones, four service/shop bays, one generator, one locked vault and one containment core. The public zones share whole plain frontages; they deliberately have no doorway edge metadata that could reinsert narrow frames. Native service doors, primary exit and one/two fire exits retain their original builders. Shared variation uses `RNG`; no new shared `Math.random` draw is introduced.

`openplaces35_plan.js:78` emits serializable `layout.open35={version:35,kind,publicRooms,skyRooms,bayRooms,height:7.2,viewFar:96}`. Public/bay IDs index native `layout.rooms`. The central sky room is the only visual ceiling mask; every cell retains its solid Rapier roof. At tested ordinary sizes, courtyard/reception public floors span80×64m with a64×48m central opening; concourse spans56×72m with a24×56m central opening. Small size.5 shrinks the courtyard/reception width to fit its enclosing grid.

`facility.js:853` consumes the art agent's copied per-layout definition, including fallback factory styles. Floor/furnishing callbacks use that copy; global theme identity stays intact. `facility.js:915` masks visual ceiling only, `:1508` adds the map-owned cloud, and `:1558` publishes actual facility atmosphere/name/view range. Opted plans skip the original theme decoration and hero room redecoration (`:1507`, `:1512`), which otherwise reintroduced a crusher hall or Backrooms partitioning. Native systems, salvage candidates, hazards and lift placement remain existing owners. Zero requested posters remain zero on opted maps (`:1265`).

## Native verification

Command, with bundled Node24.19 explicitly selected:

```powershell
& 'C:/Users/Sher/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' 'tools/harness/openplaces35_world.test.mjs'
```

Final exit0 evidence: [world-green.log](world-green.log). Initial genuine missing-plan RED was captured before implementing the planner: [world-red.log](world-red.log), `undefined !== 35` from actual factory generate/build/Rapier.

The final test proves:

- Four pre-edit SHA256 legacy layout goldens, including an explicit factory atrium option, remain exact. Old/foreign admission and authored encounter negative cases remain unadmitted.
- Eighteen seed/size combinations repeat deterministically, preserve input options, retain service locks and make every ordinary floor cell reachable from the primary entrance.
- Actual factory, greenhouse and Backrooms builds have44/52/44m clear standing Rapier LOS, enclosing wall collision and retained roof collision through the visual sky opening.
- A real `LocalPlayer` standing capsule settles on the native entrance floor, crosses the public hall, follows the actual certified lift entry/cabin route and reaches its call console through ordinary range/LOS. Movement uses the native character controller and one Rapier simulation clock; only the initial entry placement is setup. No traversal teleport, noLos or injected route result is used.
- All four native cabin spawn footprints are clear after query refresh. Each actual lift discovers ten finite ordinary rooms. Generator and containment systems remain installed.
- The existing early-haul planner admits the courtyard. Native `Session` self-delivery and `ItemManager.hostSpawn` consume its owned proposal into the registered Indexed Glass item; its actual model dimensions sweep through a16m cargo lane and its planned approach has normal pickup range/LOS.
- Instant and time-sliced builds match actual mesh geometry/transforms, collision, nav/locks, doors, salvage candidates and emitter metadata. Partial build cancellation is idempotent and removes owned collision; full teardown leaves zero tracked native colliders.
- Registered `worlds3` dressing produces no props for these new public/bay type names; registered horror planning finds no narrow trap run and cannot place its optional outer-wall closet in the central sky room.

| Actual build | Rooms | Colliders | Emitters | Meshes | Triangles | Build ms | Staged micro-units |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Factory courtyard, seed35,size.8 |14|602|46|266|15810|120.62|216|
| Greenhouse concourse, seed413,size1 |14|633|46|304|24900|38.49|219|
| Backrooms reception, seed771,size.9 |14|616|39|222|13590|25.43|206|

Build timing is one local Node run, including the first factory's cold construction. Acceptance totals783/524/493ms also include controller movement, cargo checks and native lift certification. These are observations, not a hardware FPS claim or a budget guarantee. Emitters are LightPool candidates, not new Three.js lights. The art report owns the cloud's one mesh/material/texture and fixed scene light/disposal evidence.

## Stops and review limits

The first expanded integration run queried Rapier before its first fixed step had occurred: `1/60` is slightly below the float32 world timestep. Refreshing through three actual native steps fixed the fixture's false missing-roof result. The root's earlier in-flight focused log retains that stop. The native entry spawn intentionally starts10cm above floor; an immediate grounded tolerance was invalid. The fixture now lands the actual controller before traversal and permits8cm for native floor/doorway thresholds. Missing scene/owned earlyHaul fixture fields and using the outside approach as the inside-console range point were also corrected; none required a production route repair.

Read-only cross-review of root `openplaces35.js`, hostLever, Game layout/camera and descent core/state/runtime found the approved receipt/options flow coherent: admission occurs after weekly seed selection in the phase packet; saved markerless/route26 geometry is preserved; route35 choices retain options through retries, preflight, checkpoint/live/peer rebuild and surface return; current actual facility contains/view metadata owns indoor96m. Protocol0.12.7 rejects pre-wave peers. The unchanged outer-wall horror closets, surface noclip pocket and job/system props remain optional native content. `worlds3` has no dressing kit for new public/bay names; deep Backrooms skips its dressing entirely. Backrooms runtime material bake does not touch the cloud's unlit Basic material; its opted public fog guard is owned/tested by the art agent.

These tests are native integration with initial setup fixtures. They do not prove blind-human navigation, cargo delivery all the way to ship, representative multiplayer Internet reliability, visual quality or fun. Root owns the complete registered Game/browser acceptance, focused neighbors/build/full suite and exact freeze. The owner's experience baseline remains1/10 until observed play supports a change.
