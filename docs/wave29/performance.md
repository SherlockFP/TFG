# Wave29 performance diagnosis

Status: bounded native source fix implemented. The new focused harness passes
31 scenario groups; seven existing descent checks pass. A corrected frozen
browser comparison and any claim that general stutter is fixed remain pending.

## What the Wave28 recording can establish

`docs/wave28/final-evidence.json` preserves 2,794 native update samples over
600.7 seconds, with no hidden-page samples: p50 5.6 ms, p95 15.3 ms, p99 23.9 ms,
maximum 428.1 ms, and 11 updates above 50 ms. Physics never exceeds 50 ms and its
maximum is 19.8 ms. The first normal native landing is recorded at 215.368 seconds
after load in `PLAYTEST.md`; the final player remains aboard the ship.

The artifact stores aggregate quantiles, not correlated per-frame phase/job
timestamps. Adding the maximum of every recorded named update guard and physics
gives only 98.0 ms. Therefore at least 330.1 ms of the largest update lies outside
those measured regions. This excludes neither unguarded module hooks nor map
construction, but it cannot assign that sample to one particular owner.

`Game.updateFrame` runs local actions, particles, ship features, doors/map effects,
environment, module update hooks and HUD work outside the recorded named guards.
Normal landing queues atomic layout/facility/module jobs. `LandingQueue.tick`
expands its nominal 8 ms budget to 50 ms when native `dt` is clamped at .1, and a
single atomic job may exceed any queue budget. The recording does not preserve
`landingQ.last` job durations. Reducing the budget alone would not split the large
job and might simply move the stall to the required landing flush.

## Wave29 attribution gained, still bounded

The unchanged-source first corrected driver records 696 native updates in
[first-corrected-driver-evidence.json](first-corrected-driver-evidence.json).
Its worst update is 885.5 ms in moon/lever, containing `mods.emit:update` 876.6 ms;
another landing update is 390.6 ms with that hook 384.7 ms. LandingQueue records
facility 362.5 ms, outdoor 186 ms, outlife:done 119.5 ms and prewarm 91.1 ms jobs.
Nested scopes are inclusive and must not be added together. This narrows owners
but does not identify an individual module, renderer cost or hardware FPS.
The route stops on a delayed-key-release script problem, not proven physical
contact; read [PLAYTEST](PLAYTEST.md) for the preserved native clock and limits.

Neither the 428.1 ms Wave28 tail nor the 885.5 ms Wave29 tail is attributed to
`planDescent21`. The source improvement below removes observed discarded work;
it does not claim to remove those recorded tail events.

## One concrete repeated-work owner

`src/world/descent21_plan.js::planDescent21` derives `discoveryRooms` by calling
the same native A* search separately from the entry to every ordinary room.
Before this change, it used `findPath`, allocating complete smoothed waypoint
paths that were immediately discarded; the caller needs only reachability. Placement and final body-clearance proof are
separate checks and must remain intact.

`src/game/descent21.js::ensure(true)` constructs this lift inside the normal
unguarded module update after a native physics query refresh. Rejected placements
may recurse inside `buildDescent21` and recompute the discovery list. Deep-floor
preflight and certified live rebuild also use this planner. This proves repeated
build work, not attribution of the recorded 428.1 ms sample.

## Native counter before any source edit

`/tmp/tfg-descent29-counter.mjs` imports the real `generateLayout` and `NavGrid`.
A follow-up counter separates actual A* `canStep` work from `gridLOS` smoothing
work. These are generated layout/nav snapshots **before furniture, physics or
door-instance setup**. The recorded seed is reused; its exact runtime generation
options are not assumed. This tiny counter is not a browser performance replay.

| Native snapshot | Rooms | Existing discovery `canStep` | Discarded smoothing `canStep` | Smoothing calls |
| --- | ---: | ---: | ---: | ---: |
| factory / 295221521 / .68 / atrium, roomMul 1.05 | 13 | 265,108 | 36,126 (13.6%) | 1,199 |
| backrooms / 17 / 1.35 | 9 | 457,255 | 30,837 (6.7%) | 1,508 |
| nullreception / 42 / 1.35 | 13 | 440,980 | 36,629 (8.3%) | 1,743 |

Elapsed values from cold Node runs are deliberately not used as hardware FPS,
steady-state browser timings, or a promise that gameplay stutter is fixed.
Work counters are the primary evidence.

An initially proposed single-flood replacement is withdrawn. Native A* uses a
fixed grid-sized heap and may enqueue duplicate nodes; a connectivity proof and
90,000-pop bound alone would not guarantee identical outcomes for every custom
input or heap-capacity boundary. The final proposed fix instead keeps the exact
native search and removes only construction/smoothing of discarded paths.

## Implemented bounded fix

Native `NavGrid.hasPath` is backed by the same `findPath` search and an explicit
final `reachabilityOnly` option. After the existing search finds the goal, it
returns true before waypoint reconstruction and gridLOS smoothing. The start-equals-goal
branch also honors that opt-in. All normal `findPath` callers retain their existing
array/null result, including start-equals-goal and blocked/outside positions.
Discovery uses `hasPath`; physical placement continues to use `findPath`.

This keeps nearest-walkable radius 4, maxIter/heap behavior, stamps, door locks,
final furniture masks, required-gate exclusions, deterministic room order and
complete plan metadata. There is no persistent cache or new world state. Real
capsule/LOS checks, certificates, physical colliders, custody and disposal remain
owned by existing code. The focused counters show exactly the same A* search work; only discarded
output work is removed.

`tools/harness/descent29_plan.test.mjs` freezes both the pre-edit `findPath`
and complete planner as executable oracles. The full old-plan run explicitly
uses the frozen old search, with native counters, rather than calling the revised
search for its comparison. Before the source change it failed on **1,251**
discarded discovery `gridLOS` calls where zero was required. Afterward it passes
**31 scenario groups**, including:

- Complete plan, room order and exact A* search-step equality on six generated
  native snapshots with closed ordinary/required doors and blocked room centers.
- Unchanged physical candidate searches, physical smoothing and callback order.
- Unchanged native nav walk/locks, door object identity/state and fingerprint;
  required-flag mutation/restoration and empty/furniture masks are evaluated afresh.
- Frozen-legacy outcomes for disconnected targets, radius-4 fallback, maxIter
  0/1/3/90000, same-cell and empty-nav array/null results, open ordinary routes,
  a native large grid, constrained heap capacities and stamp rollover.
- One real furnished native facility with unchanged collider/body identities and
  clean native disposal. This is a real furniture/nav snapshot, not a browser
  timing replay or a replacement for capsule certification.

| Final native planning fixture | Existing discovery steps | Removed smoothing steps | Removed LOS / waypoint construction |
| --- | ---: | ---: | ---: |
| factory / 295221521 / .68 atrium / closed-door layout snapshot | 251,843 | 38,568 (15.3%) | 1,251 / 46 |
| actual furnished factory / 17 / .68 ring | 302,079 | 43,829 (14.5%) | 1,478 / 64 |
| native factory / 17 / 2.6 large-grid layout snapshot | 1,189,967 | 111,719 (9.4%) | 5,251 / 362 |

For the actual furnished fixture the **258,250 A* search checks, 41 physical
candidate searches and 5 physical smoothing calls remain exactly the same**.
The native API returns booleans only through `hasPath`; ordinary `findPath`
continues to return the exact legacy waypoint array or null.

Verification after the source change:

```text
node tools/harness/descent29_plan.test.mjs       PASS, 31 scenario groups
npm test -- -j 2 descent21 descent23            PASS, 7/7, 39 seconds
```

The existing focused checks include native capsule/entry routes, certified
rebuilds, depth lifecycle, boundaries, threats and art disposal. No full suite,
browser or Git was run by this owner. Root owns combined build/publication and a
frozen corrected route. Only a matched route with individual-owner traces can
establish whether browser update tails improve; work-count savings do not raise
the owner's **5/10** fun baseline.

## Final trace owner match and remaining transition work

The later normal replay retains 881 native updates, 13 above50 ms and a maximum
329.7 ms. Its inclusive cached callback timing reaches318.3 ms with actual function
source `(dt) => q.tick(dt)`. A read-only search across `src` and `public/mods`
finds this exact registration only in `src/game/landingq.js:50`, the native
LandingQueue update hook. This source match identifies that scoped queue region;
it does not infer an owner from the observer's callback index.

The queue separately records a301.6 ms facility job,161.9 ms outdoor job and79 ms
prewarm job. These are atomic transition costs and the next profiling/splitting
target. No exact per-job correlation beyond the preserved trace, additive total,
matched-seed speedup or hardware smoothness is claimed. This wave's native
hasPath saving does not close the large facility-build stall. Read
[final evidence](final-focused-evidence.json) and [PLAYTEST](PLAYTEST.md).
