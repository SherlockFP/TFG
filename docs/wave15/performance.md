# Wave 15 — bounded orbit resource cleanup

The wave13 periodic GPU scanner already spread scene discovery over frames. Automatic post-takeoff
cleanup still walked the entire surviving scene and disposed every removed geometry/texture in one
update after its 2.5-second settle window. Large maps could therefore move the hitch to orbit.

Automatic cleanup now budgets surviving-scene collection and resource disposal separately: at most
128 tree/iterator operations and approximately 1.5 ms of work per update. One individual dispose callback
can exceed that time; the bound is not a guarantee about arbitrary GPU driver calls. Wide-parent iteration
and stack unwinding consume the work budget. Drawn resources during a changing orbit scene join the live
sets. RT/video/cube/compressed/explicitly kept textures and shared geometries retain their protection.

A fresh loaded map cancels a pending cleanup while preserving undisposed remembered resources.
Resources already freed leave the known sets, preventing repeated frees after cancellation. The next
departure completes the remaining sweep. Existing explicit sweepNow stays synchronous for diagnostics;
it cancels a pending job rather than running two cleanups. Disposal detaches hooks and pending work.

The actual installGpuSweep lifecycle test adds 2,400 unique removed geometries and 900 surviving scene
meshes, begins automatic cleanup, relands during resource iteration using a previously cached geometry,
then departs again. It verifies frame-spanning collection/disposal, cancellation, live-resource protection,
exactly-once frees, maximum128 operations/frees per update and eventual completion. Original eight-map
residency/texture plateau and reused-material epochs still pass. One Node run measured maximum0.169 ms
per cleanup slice; this is a fixture timing, not GPU driver time or hardware FPS. Adjacent zfixperf and
perf5 pass (perf5 sum medians0.558 ms over135 handlers in that run).
