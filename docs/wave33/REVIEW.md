# Wave33 independent review

2026-10-03. Baseline `bf4f577ab2fde624b0cfd02bf5c5cd098353b5df`.
Status: **PASS for the default-off experimental prototype; no outstanding scoped P1/P2.**
Reviewed native-owner source freeze on 2026-10-03. Browser acceptance, the final
full suite, build and publication remain root-owned release evidence.

Scope: the two Wave32 creature contracts, native host damage and admission,
replication/migration, physics and resource ownership. Reviewer edits only this
report; implementation owners receive concrete findings. Root owns browser QA,
the final full native suite, build and publication.

Caller audit confirms that native `hostSpawn` inserts its actor before
synchronous local spawn-event delivery; `M.attack(..., true)` skips the generic
warning gate but still requires explicit creature-specific current validity;
`hostHurtPlayer` applies balance scaling afterward; stun suspends behavior;
migration restores view identity/HP/pose but does not restore behavior data.
The implementation now respects those boundaries.

Completed independent provider check: bundled Node
`C:/Users/Sher/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`
ran `tools/harness/creatures32_model.test.mjs`, exit 0. Both workers measure
18 draws / 4 materials; dormant 528 triangles and ram 564 triangles. The check
covers finite geometry, separate view resources, idempotent disposal, stable
animation resources, original bounded mono buffers and native silent-volume
playback. Source inspection found no new lights or per-frame geometry/material
allocation. The final extended rerun also exercised actual model selection,
native `ensureTell`/pose opt-outs, and WarmSet cleanup: two cached roots / 36
geometries / eight materials reused across landings and disposed once, with
zero retained listeners. Actual first-person appearance is separate evidence.

Initial independent native rerun, before the browser-discovered wrapper issue:
the same bundled Node ran
`tools/harness/creatures32.test.mjs`, exit **0**, with **58 emitted PASS scenarios**.
It uses the real generated factory, Rapier queries and character controller,
CreatureManager, ItemManager, Session local delivery, save helpers and native
ordinary-door animation. The model/presentation command also exited **0** on
the final rerun. The reviewer ran neither the full suite nor a browser.

Fixed findings checked again:

- Ram impact sound now follows attack consumption/rest, so synchronous sound or
  damage callbacks cannot reuse the attack (`creatures32.js:46`, `:93`).
- A successful spawn remains consumed even when its synchronous spawn callback
  removes it; rejected or throwing native spawns roll back only their own
  receipt and release the reservation (`creatures32.js:166`).
- Runtime same-room native chases suppress/cancel a new encounter, beyond the
  placement-time check (`creatures32.js:17`, `:28`).
- First-frame native weapon hits survive behavior initialization and receive a
  full warning. Windup rechecks the physical side exits. Exported browser arena
  setup no longer imports Node-only assertion APIs.

Whole-change review covered the final host damage cap after balance scaling,
scripted/data admission bypasses, first-floor and quota exclusions, finite
receipt capacity, immutable run sync/save identity, fixed-axis swept collision
ordering and floor support, JIP/migration recovery, native cargo ownership,
stun/death behavior, deterministic pool/floor selection and protocol mismatch.
The final cap touches only the two new IDs. No native serializer redesign,
separate AI clock, actor teleport repair or cargo mutation was introduced.

Integration checks: C32 installs before the descent wrapper, so its seeded
admission receives substituted resident requests. Resident selection uses the
same C32 floor choice; the existing descent power correction owns accounting.
Default pool/floor inputs remain unchanged while the optional flag is false.
Model registry, warm ownership, precise state sound routing, readability
opt-outs, existing EN/TR/RU caption paths and initial-sighting exclusion are
consistent with the native view contracts.

The proposed Host Advanced checkbox is unchecked. Its boolean flows through
`app.hostGame` into host config, the existing welcome message and host-migration
config snapshot. The native floor/quota/geometry gates remain mandatory. Root
must retain this experimental opt-in only after its technical warning/dodge
acceptance; this review does not promote natural spawning by default.

Evidence limits: the native arena uses a fixture AI-player array and hit ledger;
view-to-host restoration checks do not equal a real disconnected browser crew.
The narrow real-door scenario calls native Game door handlers, not an entire
normal expedition. Model/audio tests stub platform drawing/WebAudio facilities.
The optional dormant idle loop was omitted, so no persistent loop lifecycle is
claimed. Source and native success do not prove silent/reduced-motion warning
recognition, normal cargo return, Internet reliability or hardware performance.

Verdict: the inspected code is suitable for the default-off prototype release
subject to root's final integration/browser checks and honest recording of
their limits. No ordinary rollout or experience improvement is established by
this review.

Native tests, guided first-person input, human discovery and hardware profiling
remain separate evidence. The current owner experience baseline stays **1/10**.

Browser-fixture preflight addendum: root reports focused 13/13, full 265/267
(the previously reproduced `carry2` Windows libuv abort and `outdoor30_staged`
historical geometry oracle), and build success in 2.10 seconds. These are
root-reported results, not additional reviewer executions.

The new `test/creatures32.html` was reviewed before its first browser run. Its
keys pass through native `Input.virtualKey`; its observation RAF does not
advance simulation. Native state/hurt handlers are preserved. Initial fleet,
map, actor, gear and cargo setup is explicitly synthetic. No post-setup direct
HP/damage injection or alternate simulation pump was found.

Fixture findings were repaired and the two dev pages re-read. The separate
`test/creatures32_game.html` imports both the setup helper and main inside the
iframe, sharing its CreatureManager registration and initialized Rapier module.
Root reports the initial parent-Rapier attempt failed before actor publication;
it must remain a failed setup attempt in the playtest record.

Ram acceptance now requires an observed charge, fixed yaw, more than one metre
of actor movement, and either a moved player with zero hurt or exactly one
positive native hurt of at most 35. Dormant acceptance requires at least 0.7 m
of actual retreat and zero hurt. Guided waits stop on death/downed/removal,
setup refuses to run during guided input, and `finally` releases held keys.
No fixture P1/P2 remains from this review. Each scenario should begin with a
fresh Place operation so its trace is isolated. Warning frames need separate
visual capture: state traces or a screenshot after rest do not establish
first-person pose readability. The fixture remains synthetic-input technical
evidence, with cargo spawned into custody explicitly limited to trigger setup.

Actual-Game browser addendum: root observed a successful synthetic-key dodge
(2.48 m, HP 100, fixed-yaw 7.992 m charge) and light-off retreat (2.997 m, zero
hurt), but the standing positive control stopped at the player capsule without
damage. This was a real failed acceptance case that reopened the earlier scoped
code-pass verdict. The old `grenades.js:727` wrapped native `attack` with
only four parameters and dropped the fifth `_late` flag. C32 has already consumed
its warning and entered rest, so the stripped flag incorrectly sends that hit
back into the generic delayed gate; its callback loses the flag again and is
deduplicated away. The original focused arena did not install this wrapper.

The final three-line production repair preserves `_late` and applies the
blackout bonus only on the original attack. Independent source audit found this
was the only production wrapper around `CreatureManager.attack`. The current
explicit `_late` creature callers are not blackout-loving types, so the guard
preserves their intended damage while avoiding duplicate scaling on generic
replay.

Independent final focused rerun: **62 PASS scenarios, exit 0**, using the same
bundled Node command. Four new cases install real grenades and balance rules:
both C32 authored warnings deliver exactly one immediate native Session hurt
without scheduling another warning; an ordinary attack waits for its normal
timer and preserves min-gap deduplication; an actual blackout grenade detonation
turns damage 20 into exactly 25 once. Disposal restores the previous attack
method. The retained [RED record](grenade-red.txt) shows first `0 !== 1` for the
missing C32 hit, then `31 !== 25` for duplicate blackout scaling before its fix.
Scoped whitespace checking also exited 0. No outstanding scoped P1/P2 remains
in this repaired source.

Fresh full suite/build and actual-Game positive-control browser evidence remain
root-owned requirements after this repair. The earlier full-suite/build outputs
are pre-repair evidence and the failed positive control remains in PLAYTEST.

The revised fixture sends bound synthetic repeat KeyboardEvents through native
listeners to avoid iframe pointer-capture churn; it does not establish physical
keyboard or pointer-lock behavior. Its render observer delegates the existing
Engine.render and captures one actual warning frame afterward, without advancing
simulation or altering the controller. Failed setup/movement attempts must stay
in the playtest record alongside successful retries.

## Final frozen-source verdict

The reviewer independently inspected the final three browser JSON records,
console records, menu accessibility snapshot and final focused/full/build logs.
The current creature runtime, model and grenade-wrapper SHA256 values match
the final source fingerprints in [PLAYTEST](PLAYTEST.md). These browser runs
and combined commands were executed by root; the reviewer's own final native
execution remains the 62-scenario run described above.

- [Dormant withdrawal](dormant-guided-final.json): actual retreat
  2.9888267744 m, wake to rest, no hurt, HP 100.
- [Ram dodge](ram-dodge-final.json): actual player displacement 2.4799 m,
  fixed-yaw native charge displacement 7.992 m, rest, no hurt, HP 100.
- [Ram standing control](ram-hit-final.json): c4 warning at 165.3627,
  charge at 166.8250, contact at 167.5618; exactly one native hurt of 18,
  HP 100 to 82, then rest. The record ends at completion; absence of delayed
  replay damage additionally rests on the real grenade/balance/Session tests.

All three records end with a live player, released input, no map queue and
zero recorded runtime errors; [final console](browser-final-console.json)
is empty. The fresh menu [accessibility snapshot](host-advanced-final.txt)
reports the experimental checkbox as 0 (unchecked), with its quota/depth
eligibility text. Its console is also empty.

[Final focused checks](focused-final.txt) passed 6/6 in 11 seconds.
[Final full suite](full-suite-final.txt) passed 265/267 in 129 seconds, retaining
the previously reproduced baseline `carry2` Windows libuv abort and
`outdoor30_staged` historical geometry-oracle failure. This is not an all-green
suite. [Final build](build-final.txt) succeeded in 2.19 seconds with dynamic-import
chunking warnings. No new scoped release blocker was found in this evidence.

Verdict is bounded to the **unchecked experimental opt-in**. The technical
browser evidence is **NATIVE_INTEGRATION + VISUAL_REPLAY**, using synthetic repeat
keys and explicit arena/actor/cargo setup. It does not establish physical-input
or pointer-lock behavior, human warning recognition, natural quota/depth
progression, Internet co-op/NAT reliability, or representative hardware FPS.
Default natural admission stays closed; no promotion or fun-score improvement
is earned. The owner's experience score remains **1/10**. Prior failed attempts
remain part of the playtest record rather than being replaced by these retries.
