# Verification fixture repairs

Wave36 repairs the two repeatedly recorded Windows full-suite failures. No
runtime gameplay source changes belong to this task. Wave35 was published as
`baab7fc06fa883485476b506bcfcd3307162b00e` before these changes began.

## Carry shutdown

The fresh unmodified `carry2.test.mjs` completed its assertions and printed
`carry2: ok`, then aborted with Windows libuv `UV_HANDLE_CLOSING`, native exit
`3221226505`. An in-memory probe replacing only `process.exit` with
`process.exitCode` completed cleanly under the same Node24.19.0 runtime.

The test now sets `process.exitCode` and allows natural shutdown. Its actual
Session, carry module, item, Rapier world and event fixture release in a
`finally` block; the Session now calls `leave`. Existing carry rules, native
wall/door/LOS and custody assertions remain. A labelled blocked-LOS fixture
still makes the meaningful positive pair assertions fail and returns exit1.
This evidence isolates forced test shutdown as the trigger; it does not identify
the particular native async handle or establish a carry gameplay defect.

## Outdoor independent oracle

The historical Wave30 oracle is retained unchanged. Windows x64 uses three
explicit fingerprints captured from the independent published archive at SHA
`2e50c8b588343769fbc9e10cfada24be62bba189`. That archive was exported during
Wave31; its provenance is recorded in
[baseline-failures.txt](../wave31/baseline-failures.txt). No raw archive enters
the repository and no current builder output is used to mint the new constants.

Validated capture runtime: **Node24.19.0, win32 x64, Three0.186.1,
Rapier0.21.0**, using the archive's unchanged source and the existing shared
dependencies. All three archive fingerprints equal current Windows output.
Native mesh/collider counts also agree with the original Wave30 capture:

| Moon / seed / merge | Meshes | Colliders | Windows archive SHA256 |
| --- | ---: | ---: | --- |
| Hamsi / 660949389 / off | 111 | 394 | `0f331a010288465cba6a29c33d1d6379ef1422100744baca4e38922530d93d19` |
| Lufer / 17 / off | 144 | 365 | `06c5371fbde2e2c5f3d8d6a5dbc34fb3cdb9e060f183d05914726c48d1b69173` |
| Hamsi / 42 / on | 157 | 419 | `eaa8d0adaf2eedcc231fdae78e9a3217069743d2f36eafd7837e1c094f9ba990` |

The test reports the selected archive SHA and validated runtime. Other platforms
retain the original frozen-HEAD fingerprints. Exact synchronous/queued output
equality, native Rapier/LightPool cleanup, detached publication, job order,
partial and late cancellation, once-only cancellation, flush and native fault
assertions remain. Explicit original mesh/collider count assertions were added.

A labelled 25cm static-collider displacement fails the independent archive hash
and exits1, so the Windows table still detects a real geometry change. This is
a fixture fault probe, not gameplay QA. The exact field or numerical operation
behind the historical hash disagreement remains unproven. No claim is made
that Windows, a dependency or the outdoor generator has a gameplay defect.

## Evidence

- [Fresh RED](verify-fixes-red.txt): actual original carry abort and outdoor
  historical mismatch, with exact runtime and native child exits.
- [Independent archive capture](verify-fixes-archive.txt): archive SHA, command,
  all three fingerprints/counts and retained native assertions. Only historical
  digest assertions were bypassed in memory to collect this diagnostic; its
  trailing original PASS line does not certify the unmodified historical oracle.
- [Focused GREEN and negative probes](verify-fixes-green.txt): both repaired
  tests exit0; blocked-LOS carry and collider-drift outdoor probes exit1.

No browser, full suite, build, Git operation or publication was performed by this
task. Root owns combined verification. These checks do not establish playability,
fun, Internet reliability or representative hardware performance.
