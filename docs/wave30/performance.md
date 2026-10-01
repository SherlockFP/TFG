# Wave30 — split native facility construction

Status: owned source and focused native checks finished. Root owns combined
Game/mode integration, build, frozen browser replay and publication. No general
stutter, hardware FPS or improved fun rating is claimed here.

## Observed owner and change

Wave29's [final focused replay](../wave29/PLAYTEST.md) records a 329.7 ms native
landing update. Its update-hook callback has the actual source hint
`(dt) => q.tick(dt)` and costs 318.3 ms; the native queue's atomic facility job
costs **301.6 ms**. Outdoor construction 161.9 ms and prewarm 79 ms are separate
remaining owners. Nested measurements are inclusive, not additive. The trace
uses software rendering and diagnostic wrappers; it establishes an expensive
native job rather than representative hardware behavior.

`buildFacility` now drains a shared generator synchronously. Non-instant native
landing uses `queueFacilityBuild30`, which advances that same generator with a
**cooperative 6 ms budget**, inserts its next continuation before later jobs,
and returns from the queue pump after a continuation. This splits actual floor,
wall, room, corridor, door, decoration and merge work. The queue's existing
adaptive budget is retained; reducing it alone would not split the old job.

`GeoBuilder.build` and `mergeStaticMeshes` also drain their shared iterators
synchronously. The facility can yield between level-material meshes and ordered
merge buckets, plus collection batches. Root's other synchronous ship/static
consumers retain their native APIs. RNG calls, loop/bucket order, nav/door rules,
geometry attributes and final output are unchanged in the native comparisons.

The budget is **not a hard duration limit**. An individual model, theme/system
decoration call, material mesh, merge bucket, runtime pause or required flush can
exceed it. No timer preempts JavaScript or changes native simulation time.

## Ownership and lifecycle

- The partial group is detached and never published as `world.facility`.
  Native construction colliders and lights belong to the pending builder.
- A level mesh's temporary group is attached to that detached owned group before
  its first material is built. Completed merge outputs already belong to the
  same parent when their unit yields, so cancellation can release them.
- `LandingQueue.onClear` registers pending-build cancellation and returns an
  unregister function. Clear drops jobs, snapshots/clears those callbacks and
  preserves native `afterPrewarm` cleanup. Cancellation and facility disposal
  are idempotent; native collider/light ownership is released.
- After completion the cancellation callback is removed and the complete
  facility goes to the unchanged Game publication callback. Later mapLoaded,
  phase and warm/prewarm consumers run after all descendant continuation jobs.
- `flush` ignores the optional per-job `yieldFrame` marker and finishes every
  descendant synchronously. Instant loads, depth preflight/rebuild and optional
  mode builders keep synchronous `buildFacility` behavior.
- Native build failure cancels unpublished resources and clears pending map
  jobs; no completion callback publishes a partial facility. The focused fault
  fixture fails after earlier real Rapier colliders have been created.

Integration API:

```js
const context = { physics: game.physics, lightPool: game.lights };
// Inside the existing queued 'facility' job:
queueFacilityBuild30(layout, context, queue, publishCompleteFacility);
// Instant native callers:
publishCompleteFacility(buildFacility(layout, context));
```

The callback retains Game's existing world/depth/generation/fog/scene assignments.
Outside a running queue job the helper is synchronous, matching native addNext
semantics. There is no Promise, delayed publication or new gameplay authority.

## Native equivalence and regression evidence

Before editing, the complete facility module was frozen outside the repository.
Root exported the actual prior-main `1ac10f8` geobuilder source, SHA-256
`888ae76871571a9536c606784dc27268cb91c37a4fc3795c091e5613ff9b6781`.
The final old-source fixture changes only module import resolution and connects
that frozen facility body to that frozen helper. It uses real Three geometry,
Rapier Physics and LightPool; canvas calls are the explicit native Node fixture.

The outside-repo `/tmp/tfg-facility30-audit.mjs` comparison passes for factory
699464887 / .68 atrium, Backrooms 17 / .9 and Thread Archive 42 / 1.1. Both revised
synchronous and queued output match the old implementation's mesh transforms,
attribute/index/instance-buffer hashes, material signatures, collider shapes and
order/tags, door IDs/state, final nav walk/locks and scrap/chest/other spawn arrays.
Its final run is preserved in `/tmp/tfg-facility30-oracle.log` for this session.

The committed `facility30_staged.test.mjs` tests synchronous/staged parity using
the shared new implementation. This is staging parity, separately supported by
the frozen old-source experiment; it is not itself an immutable old-source
oracle. It also proves:

- At most one facility continuation per queue pump, complete publication before
  sibling/mapLoaded/phase/prewarm jobs, and cancellation unregistration on success.
- Mid-build clear drops callbacks and releases real native colliders/lights;
  repeated clear keeps prewarm cleanup once.
- Cancellation after real lights and the first merged output exist releases
  each observed merged geometry once. Cancelled builders cannot publish later.
- Required flush completes all descendants before native map hooks.
- Instant and queued native failure release prior construction colliders;
  queued failure does not run later map hooks or publish a result.
- Clearing a completed queue leaves the published facility owned by the world.

The first test observer omitted `return yield*` when wrapping a real builder,
producing undefined output; that **fixture error** was corrected. The corrected
native run passes without changing production to accommodate that grader error.

```text
node tools/harness/facility30_staged.test.mjs           PASS
npm test -- -j 2 landingq geomfix perf2 ship2hull      PASS, 3/3, 24 seconds
```

The filename filter found landingq, geomfix and perf2; it did not select a ship2
hull check. Root owns the later ship/static/combined verification. No full suite,
Git or browser was run by this source owner. The component clear fixture does
not establish actual Game or mode switching; the native Game integration proof
below covers ordinary map loading/unloading separately.

## Timing evidence and limits

The first cold native unit probe identified remaining atomic level-mesh work
50.5 ms and whole-prop merge work 87.9 ms. Those measured operations were then
split by material/bucket. The subsequent isolated cold factory probe has **577
units**, largest observed unit **29.43 ms** (set pieces), material mesh 10.81 ms.
This is one Node run, not a p99 or an upper bound.

The corrected committed fixture uses 29/11/8 continuation jobs for its three
themes, with observed maximum batches **19.2 / 22.1 / 17.1 ms**. The independent
final frozen-old → new-sync → new-staged experiment preserves these results:

| Native fixture | Old complete build | New complete sync | Staged continuations / units | Largest staged batch |
| --- | ---: | ---: | ---: | ---: |
| Factory 699464887 / .68 atrium | 483.6 ms | 272.4 ms | 29 / 577 | **70.7 ms** |
| Backrooms 17 / .9 | 206.4 ms | 98.4 ms | 9 / 337 | 21.2 ms |
| Thread Archive 42 / 1.1 | 80.8 ms | 67.7 ms | 8 / 314 | 13.1 ms |

These runs differ in module/cache warming, JIT and allocation history. The table
shows a real build partition and preserves the **70.7 ms outlier**; it is not a
controlled total-speedup comparison. That outlier is not attributed to GC or any
single unit without a correlated trace. Atomic operations still need observation
in the actual frozen browser route. A forced readiness flush can still execute
remaining work synchronously. The separate outdoor change is documented in
[outdoor.md](outdoor.md); prewarm remains a separate timing owner.
The owner's experience baseline remains **5/10**.

## Actual Game integration proof

`tools/harness/maploading30.test.mjs` calls the actual
`Game.prototype.loadMapFor` and `unloadMap` with native Physics, LightPool,
ItemManager, Emitter, `installLandQ` and `installWarmSet`. The constructor is
deliberately bypassed through `Object.create(Game.prototype)`: canvas APIs and
renderer compilation/uploads are recorded Node boundaries, not a browser boot
or a real GPU compile. No map builder, collider, item manager, queue or native
warm-set job is substituted.

The focused Node22 run passes these cases:

- Instant loading completes synchronously; native `mapLoaded` sees published
  outdoor/facility ownership, nav, door metadata and generation/depth metadata.
- Staged loading has **47 queue pumps, 8 outdoor continuations and 29 facility
  continuations** in this one run. Actual sliced mapLoaded handlers, native warm
  jobs and native prewarm execute in that order after complete map publication.
  Final geometry attributes/transforms, native collider shapes/order, nav locks,
  doors and spawn arrays match the instant route. The existing staged outdoor
  slide, weather/terrain/fog assignments and renderer target restoration remain.
- Actual unload during partial outdoor construction clears the detached builder
  after native colliders exist. Actual unload during partial facility construction
  clears it after the completed outdoor has been published. Both drop subsequent
  mapLoaded/warm/prewarm callbacks, unregister cancellation, remove native map
  colliders/lights and remain safe on repeated unload/flush.
- Native world items outside the ship are removed by unload. The same ship item
  and held bag item retain their identity, value and custody; only the ship-item
  collider remains until native item cleanup.
- Instant admission while a landing is partially queued drains real descendants
  before Game's same-map early return. Repeating admission preserves the same
  world objects without repeating callbacks.

The [initial focused run](checks/maploading-native-first-fixture.txt) failed because the test tried to assign Game's getter
properties `isHost`/`selfId`. The fixture was corrected to use the native net
properties; production was not changed for that fixture error. The final run
has no captured queue/build/warm warnings or errors and no new native Emitter
error count. Its actual output is retained in [the corrected focused log](checks/maploading-native.txt).

```text
node tools/harness/maploading30.test.mjs  PASS
```

This establishes ordinary Game map lifecycle with actual staged outdoor/facility
builders. Full boot, installed optional Dead Letter admission, host migration,
browser responsiveness and hardware timings remain separate evidence owned by
root/browser checks. Queue-pump counts above are observations, not fixed budgets
or a guaranteed maximum frame duration.
