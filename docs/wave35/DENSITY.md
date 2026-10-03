# Wave35 ordinary creature density

Status: native implementation and focused verification complete; assembled-game/browser acceptance belongs to root. Owner experience baseline remains **1/10**.

The native `CreatureManager.hostSpawn` now consults `density35.reserve` before construction and releases its ticket in `finally`. The module uses existing `hostData.moonT`, not a second simulation clock. Its small `run.density35` receipt records landing token, depth, arrival and last successful admission; native run replication/save and migration carry it. Same-floor rebuilds retain quiet-time history. A degraded migration with a reset clock clamps future timestamps, avoiding an old absolute timestamp suppressing creatures for an entire previous landing duration.

First campaign surface admits no ordinary roamer before120s and at most one living ordinary roamer. Later surfaces admit after60s, with caps2 at quota0–1,3 at quota2–3 and4 thereafter. Deep admission uses the lower of the native floor and quota caps, with60s arrival quiet or90s for liminal floors. Successful fresh admissions are at least45s apart. Indoor/outdoor, sleeping and far ordinary bodies share the ceiling. This is landing/arrival pacing, not a promise of120s of quiet after the player first enters the building.

Existing actors are not removed by this change. The pending reservation prevents recursive synchronous Session callbacks from admitting another actor, including when the first actor is immediately removed. Failed native admission/construction releases the ticket without spending cooldown. A successful native identity consumes cooldown even if its spawn callback removes it. Native indoor helpers now return whether a body was actually admitted; outdoor failures refund only that attempt's power. An accepted partial pack keeps its native power cost.

The installed creature director previously charged indoor power when it merely queued a request. With density35 controlling the request, enqueue now returns false and spends no power; an accepted native release charges its original creature power once. Fully denied/dropped queued requests spend none. Queue, native power ceiling, phase scheduler and existing threat/crew scaling retain their owners. Director behavior without the density module retains its earlier accounting.

## Encounter and restoration boundaries

Bosses, neutral/harmless actors, existing special moon/active instance modes, siege types and explicit Horde wave members remain outside ordinary admission. Known Horde squad types require a native-shaped squad object: positive integer identity, matching faction and a `Set` of members. General `data`, `scripted`, closet or nest metadata does not exempt an ordinary creature. Mirror-tagged creatures require the live mirror module's nonempty native `hostM` map. The mirror spawn call now supplies its existing marker before native admission.

Three existing boss minion calls now supply `data.owner`. A minion exemption requires that identity to resolve to a real living native boss. Only this bounded validated owner ID is included as optional `bo` in native spawn/serialization, then reconstructed by `creatureOptsFromView`. A focused real `HostMig.becomeHost` test restores a boss, three minions and an ordinary actor, then proves the minions do not incorrectly fill the ordinary cap.

Restoration requires an existing living native view of the same ID and type with no corresponding host actor. An arbitrary new `opts.id`, including first-sighting IDs, does not bypass admission. Restored actors survive even when a snapshot is over the new ceiling; subsequent fresh admissions wait for capacity.

Existing Horde wave/squad and mirror transient encounter owners are not reconstructed by native migration. This change does not invent their missing AI state: restored identities survive, but actors that have lost those owners/markers can conservatively count against the ordinary cap afterward. Full Horde/mirror encounter continuation is not claimed. The mirror positive test supplies the native owner-state shape; it is not a portal combat replay.

## Evidence

`tools/harness/density35.test.mjs`: **27 PASS groups**, bundled Windows Node24.19, about0.4s. Uses native CreatureManager and views, real Session self-delivery/peer receive, original host wave/pack/outdoor helpers, installed creature director, native `newSquad` and soldier models, native run broadcast, hmx reconstruction and actual host promotion. It also covers new-ID rejection, metadata/false-owner negatives, same-floor/deep transition lifecycle, disposal, throwing construction and successful reentrant removal.

`density-red.txt` retains the initial14 behavioral failures plus later genuine director premature-charge, degraded-clock and encounter-ownership REDs. `density-green.txt` records the final focused run. The isolated helper/session fixtures supply layout spots, time and owner setup explicitly; they do not prove physical traversal, human encounter enjoyment, Internet election reliability or representative hardware performance.

Focused neighbors: existing firstdepth21 native harness, crdirector105 checks and hostmig56 checks pass. Root owns the assembled build/full suite and fresh single-clock browser acceptance. No browser, full suite, Git staging or publication was performed by this owner.
