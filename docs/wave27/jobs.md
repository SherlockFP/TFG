# Surface jobs survive depth travel

The existing surface job catalogue stays attached to its landing. Descending
should not fail a core/rescue contract, move an escort drone through another map,
or present a surface vault panel inside a deep archive.

## Observed failures and change

Native Descent21 correctly removes loose surface items and saves their original
rows in its bounded surface checkpoint. Facjobs retained their runtime IDs but
treated their temporary absence as destruction. The prior `1d5d7db` module,
loaded separately from `/tmp`, reproduces an actual core job changing `st: 0`
to `st: 2` immediately after a native descent and `hostTick`.

A single deep predicate requires both `descent21.depth > 0` and the native
landing token (`moon:seed:day`). It suspends setup before memory reset, requests,
progress/damage, migration rebuild and surface props/objectives while preserving
the existing `run.fj`, progress, payout flags and host memory. A stale prior
landing's depth state cannot suppress a new job setup.

`facilityWillChange` also closes the local vault code entry, removes its keyboard
listener, detaches props and clears local map references. Surface return defers
reconstruction until at least two native updates and delivery of every original
checkpoint item ID. This matters because `facilityChanged` fires **before** the
native surface spawn broadcasts. A host elected while deep has no surface item
runtime to rebuild until that delivery is complete.

The real ItemManager's `all()` returns `Map.values()`, not an array. Migration
now materializes that iterator before filtering job IDs. The actual native
return test exposed the existing assumption; it lost core/rescue IDs and could
fail their contracts.

Drone position packets carry the native landing token. Old landing packets and
packets received during streaming/depth/surface restore cannot reattach the
surface drone to another facility. Current surface packets still animate it.

Attached prop geometries/materials explicitly belong to Facjobs. Parent map
disposal respects their shared owner marker; the module frees prop resources
once and keeps its two shared primitive geometries until module disposal.
Diagnostic scene names identify the actual job prop owners.

## Verification

`NATIVE_INTEGRATION`, **2026-10-01**:

```bash
source /workspace/.tfg-tools/activate.sh
npm test -- -j 1 facjobs
```

The existing harness passed **1/1 in 29.4 seconds**, including its default
12 layout seeds, deterministic rolls/archetypes/path/payout/i18n coverage and
seven additional native lifecycle scenarios. `git diff --check` passed for both
owned source/test files.

- Real rolled core and rescue jobs use actual Descent21/Rapier facilities,
  ItemManager serialization/custody and Session's synchronous local dispatch.
  Native descent checkpoints/removes their original items; deep ticks/setup and
  host migration preserve the contracts and wallet without failure or payment.
- A new host admitted while deep waits through a deliberately delayed native
  surface spawn stream. After native delivery and update it recovers the same
  item ID/type/value/holder/bag descriptor. Native held custody and crew ship
  presence then complete and pay each contract once.
- Feed/vault/drone surface requests, drone movement/damage, prompts and objective
  lines stay inactive at matching deep coordinates. Actual vault action creates
  one keyboard listener; streaming removes it. Surface prop owners detach and
  their materials are released.
- Late drone packets add no deep prop. Surface return rebuilds its prop; a stale
  landing packet is rejected and a current packet positively animates it.
- A previous landing's genuine deep state, replayed after changing the landing
  day, permits ordinary setup. Genuine ordinary surface item destruction still
  fails the core job and does not pay an early reward.
- Actual parent `facility.dispose()` followed by native update releases owned
  materials once; shared primitive geometry survives parent disposal and is
  released once by idempotent module disposal. Event error count stays unchanged.

Focused pre-menu-API source SHA-256: `c92e5a14342c6d13f032a6efac38429ee520492838121b09a1eac65d48854822`
(`src/game/facjobs.js`). Harness SHA-256:
`4a16b949023a1b9ba97502f1142a951a1dae8d0115c7d701b3f680849210ce65`.
Root owns the combined source freeze, broad regression, build and publication.
The later isolated Escape fix adds only the native code-popup open/close API;
final combined Facjobs source SHA-256 is
`ffb028a16c8ec9511ba02d2ac528f6e35e5ea09f75fd86cc160e8b1b342b2122`.
The final broad run validates that combined source, separately from this initial
focused freeze.

## Failure record and limits

The first targeted run reached native return and failed its recovered-ID
assertion, leading to the iterator fix. Fixture API omissions (`heldItem`,
`KefalAPI.THREE`, then `slots`) were corrected separately; an explicit event
error assertion prevented those setup problems from becoming a false pass.
An initial prop selector included ordinary map props; actual owner names and
positive controls corrected it. These runs remain in `/tmp/tfg-wave27-facjobs*`.
The first separate baseline-module attempt could not resolve `three` from
`/tmp`; that setup failure is retained separately. Correcting only its import
path reproduced the native `st: 0 → 2` bug.

This is controlled Node integration with pose/clock and delayed-delivery
fixtures. It does not establish browser discovery, human difficulty/fun,
Internet migration reliability or hardware performance. No browser outcomes,
mission completion fields or wallet totals were injected to claim play success.
