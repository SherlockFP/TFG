# Wave31 independent review

Review scope: root's Dead Letter retirement, fleet/title/Host/pause entry changes,
the commerce agent's broker/cart changes, and the market agent's host purchase
service, UI callback, Game installation/disposal, terminal nonce forwarding and
protocol bump. This reviewer authored the controls changes and did **not** review
their own controls as independent evidence. No application source, tests, browser
state, staging or Git publication was changed during review.

Compared application source with published `origin/main` using
`git -c core.autocrlf=false diff origin/main`. Existing historical files were
preserved. Reviewer fault experiments reuse the real committed-module test
fixtures in memory; they do not write alternative application implementations.

## Findings and remediation

| Priority | Finding | Evidence | Status |
| --- | --- | --- | --- |
| P1 | Cart replay was admitted before its success receipt was recorded. `industry13.hostCart` recorded the order in its completion callback, after native item/run broadcasts. | A real Session `gs` callback repeated the same flashlight order. Credits went from 300 to 270 at price 15, two tools were delivered and the ledger contained the key twice. | Fixed with an in-flight reservation. The identical independent reproduction now leaves 285 credits, one tool and one receipt. |
| P2 | Market replay during delivery could race an `owned` rejection ahead of the original committed approval. | Preserving the native ItemManager `it` callback and replaying the same request after its spawn yielded a failed peer promise, wallet 3000 and no profile ownership, although both native item maps held one machete and the host ledger had spent 350. | Fixed with a per-profile transaction guard. The independent reproduction now approves once, deducts 350 and delivers one item. |
| P2 | An approved market ledger reached migration candidates only at the later generic run sync. | The buyer had paid watermark 350, but promotion from the pre-purchase run replica reconstructed spent 0 and rejected further purchases as `profile`. | Fixed by publishing/flushing approval state before the purchase receipt. Immediate successor purchase now succeeds with the expected balance. This is a Session promotion fixture, not an Internet host-migration playtest. |
| P2 | Failed host-local delivery could leave the already broadcast item on peers. The rollback required both an allocated ID and a still-existing local item. | A deliberate native host-delivery failure fixture removes the local spawned machete before custody validation. The peer receives the spawn: result `delivery`, unchanged wallet 3000, host items 0, peer items 1. | Fixed by broadcasting removal whenever an allocated item ID exists. The identical independent failure injection now leaves wallet 3000, host items 0 and peer items 0. |

One preliminary market experiment replaced the native `it` callback rather than
preserving it, producing an invalid fixture failure. That attempt was discarded;
the replay finding above uses the original callback before injecting the replay.
The rollback experiment is an explicit failure injection and does not claim a
naturally observed gameplay occurrence.

## Reviewed contracts and evidence limits

Dead Letter admission now refuses every new start, including stale direct,
pause and boarding intentions. All four fleet hulls omit the physical entry.
The native mode loader, checkpoint restoration, peer Company geometry/cargo,
duplicate end receipt, wipe and migration behavior remain. An additional
read-only execution of actual `UI.openPause` verifies that inactive sessions and
peers have no return button, an active host button closes the native panel and
dispatches return, and a stale active-state callback does nothing. Its mode API
is a UI wiring fixture; actual return behavior is covered separately by the
native mode integration.

Normal saved campaign loading is untouched. The old native `hostInit` still
loads campaigns in orbit and restores ship items; old native `hostSave` explicitly
skips active Dead Letter. The retirement regression synthesizes an already-active
legacy backup/phase state, then invokes the real loader and return lifecycle.
It does **not** demonstrate disk-saved active mode loading.

The commerce tests exercise real Session callback ordering, native transactions,
ItemManager custody and Rapier delivery. Rejected funds/full tray/full bays/stock
requests preserve balances; broker success is recorded before publication, and
one held trade-in cannot discount two cart lines. Required order IDs are carried
through terminal BUY confirmation into the native cart. Retained receipts are
bounded by a refusal limit, rather than evicting successful replay protection.

The market uses the existing profile wallet and collections, host-owned native
delivery, addressed receipts, request/run identity, saved spent watermarks and
relative debits that preserve local rewards earned while approval is pending.
Current personal reward earning remains peer-owned: this review does not certify
that an arbitrary modified client cannot forge new personal reward snapshots.
The service checks funds, level, range/LOS, Company context, custody/capacity and
existing ownership. Game installs it after the native item handler and disposes
it before world teardown; handler cleanup checks exact ownership. Protocol
0.12.4 gates older peers through the existing discovery/session version checks.

Reviewer fresh bundled Node24.14.0 execution of
`deadletter24_mode`, `deadletter25_entry`, `fleet30` and `commerce31` passed
**4/4 in 3s** before the last market remediation. After the final market source
freeze, three independent in-memory scenarios passed in one focused **0.52s**
execution: preserved native callback replay approved once with wallet 2650 and
one machete on each participant; immediate Session promotion retained that
purchase and approved a further 150-credit purchase with wallet 2500; failed
local delivery kept wallet 3000 and left neither participant with the item.
The pause UI scenario and other review outcomes are recorded above.
Root owns the final combined suite/build and frozen browser evidence. These are
native integration and labelled UI/failure fixtures, not hardware profiling,
Internet reliability, human discovery, a complete menu browser audit or a higher
fun score. No outstanding P1/P2 issue was found in this independent review's
scope after the reported remediations and focused verification.

## Final-suite baseline failure diagnosis

Two final-suite failures were independently reproduced from an isolated
`git archive origin/main` at published SHA
`2e50c8b588343769fbc9e10cfada24be62bba189`, using unchanged shared dependencies
(Three 0.186.1, Rapier 0.21.0) and the final suite's Windows Node24.19.0 runtime.
Exact commands, output and exits are in [baseline-failures.txt](baseline-failures.txt).

- `outdoor30_staged.test.mjs` fails its original line62 oracle with actual
  `0f331a010288465cba6a29c33d1d6379ef1422100744baca4e38922530d93d19`
  versus expected
  `6a935019a6fde094e627bbc03cd832cae8e919735c4bcaabf27d1662eb3a2359`, exit1.
  This is identical to the Wave31 full-suite mismatch. Published source also
  produces that actual hash under Node24.14.0 and Node26.7.0. Relevant outdoor,
  model, render, physics, RNG, moons, package/lock and fixture source has no
  content diff from the publication with `core.autocrlf=false`.
- `carry2.test.mjs` prints `carry2: ok`, then aborts in Windows libuv
  `src\\win\\async.c` line94 on Node24.19.0, native exit3221226505.
  Published and current source both reproduce the same abort under Node24.14.0
  (that runtime reports line76).

These failures exist on the published baseline in the current environment;
they are not Wave31 source regressions. Neither application source nor the test
oracle was changed to obtain a passing result. The exact platform-versus-
dependency reason for the historical outdoor golden mismatch remains unproven;
no Linux comparison was performed. The full suite must retain these failures
in its result rather than being described as completely passing.
