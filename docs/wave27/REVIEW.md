# Wave27 independent review

Independent source assessment: **8.0/10, unchanged**. This review owns the design
and boundary assessment, not a blind human playthrough. I inspected current source,
native assertions and the agents' focused results; I did not run a browser, heavy
regression or hardware profile. Combined frozen-source verification and actual
two-peer interaction remain pending at this review boundary.

The expansion has one coherent question: can the second crew member make a risky
haul safer? Bracing a released rolling valuable, supporting a rattling Reply Drum,
or operating an optional Dead Link cabinet gives the crew work inside the existing
scavenge/carry/escape loop. Three matte industrial salvage silhouettes retain native
items, value, fragility and extraction. The robust Archive Sorter supplies a calm
alternative alongside more demanding valuables. Familiar E, carrying and trolley
actions avoid another compulsory meter or currency.

The existing physics grab beam, Cargo13 trolley, Carry2 partner carrying and
throw/catch, Cargo20 shove and viral/cold/exhibit salvage already existed. They are
foundations, not newly delivered features. New object counts cannot by themselves
raise the game score.

## Findings and corrections

1. The initial source audit found partner grips admitted through walls using only
   position/type, with a `noLos` prompt. Root reports a failing-before/passing-after
   native wall/door fixture. Current admission and continuing help check living,
   active carried identity, downed/occupied hands, beam ownership, range and
   STATIC/DOOR LOS. A one-hand light is allowed. The drum uses current host
   `helperFor`, including TTL, rather than granting silence from a stale list.
2. The cabinet prototype initially used Descent21's action nonce as floor identity.
   Native CALL changes that nonce on the same floor, hiding the cabinet and leaving
   its reserved cargo inaccessible. Current identity uses landing token, actual
   depth and layout seed; its own revision/nonce/epoch protect requests separately.
   The prototype also sent opening feedback before its new state revision, causing
   replicas to reject legitimate feedback. Current release publishes state first.
   The native cabinet assertions now positively cover a same-floor native CALL
   and opening feedback through two actual Session dispatch paths.
3. Surface facility jobs previously continued downstairs at old coordinates. Loose
   surface core/rescue items become checkpoint rows during descent; their absence
   could fail the job, and an old panel could operate against the new facility.
   Token-aware suspension now preserves jobs while deep. Return reconstruction
   waits for actual checkpoint item delivery. Review caught an additional concrete
   migration error: `ItemManager.all()` returns an iterator, while reconstruction
   expected an array. The corrected spread and actual ItemManager fixture cover
   this. Agent-reported core/rescue, deferred migration, once-only completion,
  stale-token and ordinary-destruction controls pass.
4. Native ordinary map teardown can precede the next job-module update. Review
   requested explicit resource ownership so parent disposal cannot free shared job
   geometry or dispose materials twice. The corrected shared markers, module
   cleanup and idempotent final disposal have a native parent-teardown control.

## Contracts inspected

Bracing validates actual approaching direction, native range/LOS, living/free
hands, custody, token and increasing request nonce. It applies only bounded
opposing horizontal Rapier force and retains gravity, angular motion, ownership
and native impact damage. The haul agent's comparison records shorter travel for
actual vase/server bodies and native value/replica checks; initial rolling velocity
and trajectory setup are fixtures, not human reaction proof.

Reply Drum sounds are host-owned, bounded and emitted through native hearing and
spatial audio. Normal weighted walking, a valid helper and native trolley custody
provide counterplay. The native test uses actual LocalPlayer/RemotePlayer,
ItemManager and CreatureManager; its controlled flat map and recorded audio/net
are explicitly fixtures. Silence applies to extra drum rattling, not every sound
a sprinting crew makes. Fragile objects retain native damage, including possible
destruction from a world impact; Carry2's separate bump floor is not universal
indestructibility.

Dead Link reserves at most two eligible existing ordinary-floor salvage IDs, with
at least six loose candidates before selection. It adds no floor loot, parallel
payout or custom sell path. Quiet operation is E-start then facing/range for four
native seconds, with saved partial progress; loud release is immediate native
noise. This is a convenient optional choice, not a hold-E precision minigame.
Occupied two hands/body and beam ownership are refused; a one-hand light remains
usable. Reserved custody, actual floor/body/drop clearance, native openable route doors,
release once, migration, delayed messages and abandoned-floor cleanup are the
important acceptance boundaries. Calling the lift must retain the same cabinet.

## Remaining experience questions

The source design supports teamwork; human cooperation, reaction timing and desire
to replay remain unmeasured. Guided two-peer checks should exercise real E, real
carried movement and the new feedback on both peers, while disclosing item/body/
velocity setup. They must not stand in for a naturally navigated complete shift.

Cabinet planning initially repeated substantial standing-clearance BFS work per
candidate. Source review requested a shared field; current planning reuses one
lazy reachable flood and clearance cache, with a total twelve-thousand-node cap.
Record actual planning cost and address a reproduced hitch before a performance
claim. The cabinet agent reports one positive actual scheduled depth-2 fixture:
seed 598252011, 226 expanded nodes, 15.4 ms planning and a 72-waypoint native
controller round trip. Depths 4 and 6 safely skipped in its final fixture rather
than proving universal cabinet availability. Those local native timings are not
a hardware frame profile. No added lights or one
merged draw batch establishes representative GPU frame times by itself. The larger
quality gap remains unassisted discovery, understandable losses/escapes and human
crew choices across a complete shift, rather than catalogue size.

Read [README.md](README.md) and the final playtest for frozen-source results and
publication. Root should append the final evidence audit without retroactively
turning this source review into personally observed browser or human evidence.

## Additional current review — Escape and connection settings

The user added an urgent control/connection request during this wave. I independently
read `escape27`, its native event-order assertions, the current App/UI callers,
TURN normalization/transport configuration, Session manual retry and the Network
component with its DOM/RTC fixture. This is a separate read-only source/evidence
review. I ran no browser or heavy suite. The root's full 252-file native regression
was still running at this review boundary; that is not recorded as a passing result.

No remaining release blocker was found in this additional scope. Escape capture
closes the foremost dialog, rebinding, chat or panel, including focused forms.
Native close callbacks can restore a terminal without the same gesture closing it.
Native minigame capture retains responsibility for flushing an earned pending
result or cancelling a live game. Pause is the unhandled bubble fallback. The
source/fixture covers IME, held Escape, wheel/build cancellation, vault-code closure
and the browser unlock-first pause guard. Application routing cannot promise to
prevent a browser's privileged fullscreen/pointer-lock Escape action; the report
keeps that distinction explicit.

TURN parsing accepts bounded legacy object/array/JSON and comma/newline URL inputs,
normalizes valid `turn:`/`turns:` entries and skips malformed optional configuration.
Build-time and browser-local relay entries merge without replacing direct ICE/STUN
defaults. Saved textarea content now uses the actual `.value` property. The Network
UI rejects invalid or silently truncated edits and masks the credential field;
its diagnostics do not print credentials. A relay candidate is reported as a
candidate, not a connected game or universally working relay.

Manual Session retry keeps current players/cargo and refuses an active transport
peer, another retry, initial 35-second startup, 30-second retry cooldown, stopped
session and unsupported Local transport. Its post-await transport/leave check
prevents a stale completion from reporting a current restart. The status explicitly
says signalling restart does not confirm connection. The isolated relay probe has
a 6.5-second budget covering offer/description setup as well as ICE gathering;
panel removal and `finally` close the peer connection, timer and observer. The
retained DOM/RTC assertion covers a stalled setup promise as well as success,
failure and removal. Those fixtures do not establish real TURN credentials,
Internet/NAT compatibility or a two-device peer session.

Two nonblocking details remain. Initial Network-tab `TURN configured` can reflect
saved configuration before the active transport applies it; Check connection uses
the actual transport. A future UI clarification should distinguish saved and active
relay configuration. Snapshot/retry promises may update detached status nodes after
a tab closes; they do not mutate crew state or own a persistent polling loop.

Current source design still supports the qualified **8.0/10** assessment. Final
regression/build, real rendered controls and the guided cooperative salvage result
must remain labelled by their actual source freeze and fixture limits. No score
increase or Internet/performance claim follows from this additional source review.

## Final evidence audit — publication boundary

The earlier pending regression/browser boundary is now resolved by separately
labelled results. I independently read the retained logs, raw browser artifacts
and final method notes, and recomputed the source digests. I did not run these
tests, a browser, a human session or a hardware profile myself. No remaining
release blocker was found in the reviewed source and evidence. The qualified
assessment remains **8.0/10, unchanged**.

The root's final native log records **253/253 files passing in 251 seconds**.
Gameplay/UI JavaScript remains frozen at
`6d2cab553cb78e870b102bd7a888abaa5182d59abd5ba35cca412d41723c28af`.
The content browser sessions used all-source digest
`01dba2b0a9064ac1a6a65e6b263b2f13a34cb1dd0c2361988c5ac50620972e99`.
The subsequent scoped dark textarea CSS changes the final all-source digest to
`44b2091ad59b1205e84ae0b6f5ae68220c00a2b107429c1bbb85c4d2f326c652`;
JavaScript is unchanged. The final publication build passed in 2.80 seconds with
the recorded ineffective-dynamic-import warnings. A separate fresh solo final-CSS
Network visual replay passed in 5.4 seconds at 960 and 1280 pixels; its computed
dark background, ivory text and no 960-pixel horizontal overflow were recorded.
This final visual does not re-earn the salvage interactions.

The durable evidence supports these specific boundaries:

- [Core cabinet attempt](core-cabinet-partial.json) includes genuine local
  two-peer native E travel from depth 0 to 1 to 2, a naturally selected cabinet,
  quiet start, look-away pause, real E resume, identical original ID/value release
  and genuine peer pickup. Its overall status remains `PARTIAL_STOP`: the moving
  brake target decelerated to Push before the proposed E, so the driver stopped.
- [Focused salvage replay](focused-salvage-partial.json) begins from a recorded
  actual depth-2 checkpoint setup. Real immediate Brace E produced a recorded
  native opposing horizontal impulse, with loose custody and value retained.
  Actual drum E pickup, 2.02 metres of quiet normal walking and 3.60 metres of
  rushed movement with an owned native 0.72 noise pulse passed. The helper prompt
  was not selected; its browser acceptance remains partial. Passing native
  helper integration is distinct evidence and does not complete that goal.
- [Focused return](return-evidence.json) uses the same explicitly recorded-floor
  initial setup, actual keyboard boarding on both peers, loose native drum spawn
  and genuine E pickup, then real E return to the surface. Drum `i1pb`, value153,
  retains the exact ID/type/value/state/holder/inventory on both peers. This proves
  that newly picked drum's return, not the earlier recovered motherboard's return
  or one uninterrupted cabinet-to-extraction campaign.
- Real focused Settings/Network and skill-search Escape routing passed in the
  cabinet session; local link diagnostics and invalid TURN validation passed.
  [First](first-selector-failure.json) and
  [second](second-selector-failure.json) exact-role selector stops remain retained;
  native DOM/computed CSS identifies the generated button counters behind them.
  They are driver failures, not evidence of completed gameplay.

The artifacts report zero page errors and zero caught native emitter errors;
public signalling WebSocket failures and browser capability warnings remain in
the raw records. Local same-device peers, controlled native clocks and labelled
standing/item/velocity/checkpoint fixtures do not establish Internet/NAT coverage,
blind exploration, successful browser helper carrying, human fun or hardware
frame times. The cabinet's actual browser planning report also remains a local
cost measurement, not proof that all loading hitches are fixed.

[Listen-host architecture](LISTEN_SERVER.md) accurately states that the existing
Session already puts gameplay authority in the creator's browser. This wave
does not deliver a new central backend or a native incoming-port server; browser
connections still require a usable ICE path or relay. Unassisted complete crew
shifts, understandable loss/recovery, cooperation and replay desire remain the
next evidence gaps before a justified score increase.
