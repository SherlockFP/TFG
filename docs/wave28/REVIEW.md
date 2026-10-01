# Wave28 independent review

**Current experience baseline: owner's5/10.** Earlier8.0 assessments were qualified
source/native/guided reviews, not reliable substitutes for the owner's current
experience. They remain archived in the preceding wave reports. This round will
not defend or automatically increase them. No improved human score is assigned
from feature count, test count or a successful software-driven replay.

Review scope: independent read-only criteria and source/evidence audit. I own only
this file, the initial README and the current CRITIQUE entry. I do not run a browser, heavy tests or Git, and
do not edit gameplay source. Root reports baseline `053ed66`, protocol0.12.3,
clean before this round; normal baseline play and stutter diagnosis are pending.

## Initial critical assessment

1. **The main experience gap was never closed by the previous content proofs.**
   Wave27 deliberately used labelled landing, standing, item, velocity and
   recorded-floor fixtures. Its real cabinet/brake/noise/return subgoals support
   those contracts, but do not establish that a newcomer can naturally find the
   fleet office, board, buy usable tools, choose a route, reach salvage and return.
   The helper browser goal also stayed partial. This round must follow the normal
   first-session path before selecting another system to add.
2. **Open access needs prioritization, not restored locks.**
   `onboard_core.decideMode` opens fresh and saved feature access while
   `pacingMode`/`firstrun_core` separately pace teaching and hazards. That honors the
   owner's request. The many installed optional modules are not evidence that
   the first route is readable. Native OneGoal chooses one goal and one warning;
   normal frames must show whether competing panels, world labels, notifications
   and ship stations still obscure the next useful action. Hide or defer irrelevant
   exposure rather than taking away requested access.
3. **Legacy guidance can still contradict the physical shop flow.**
   `Game.tutorialHint` at `src/game/game.js:966` retains STORE/BUY and old Phish Dayı
   fallback text. Active first-run pacing suppresses it, so it is not a proven
   fresh-profile failure. Free-paced returning/unlock-all states remain a concrete
   source concern. Its unowned global `setTimeout` callbacks can also speak after
   the relevant phase/session changes. Reproduce the applicable state and use
   current context-aware guidance before claiming onboarding is fixed.
4. **The stutter complaint needs attribution.**
   `App.loop` advances native simulation and renders; `Game.updateFrame` advances
   physics/items/creatures and emits all update listeners before HUD/objectives.
   Landing queue/prewarm and prior bounded caches reduce known work, but do not
   identify today's repeated hitch. `warmset`'s frame ring samples update timestamps;
   manual ticks or an actively changing setup are not a hardware frame profile.
   Record a real-time route, warm-up, settings, frame tails and the responsible
   component before and after the actual correction. A lower catalogue/light count
   alone does not close this finding.

## Player-facing acceptance rubric

| Area | Observable question | Evidence to retain |
| --- | --- | --- |
| Usability | Can a fresh player find, select and complete the next action through normal controls? | First useful action time; wrong-target/no-response attempts; help needed; real selected E text; menu/focus recovery. |
| Visual coherence | Do dock, workers, ship and salvage belong to the same readable PSX world? | Eye-height rendered views; matte faceted silhouettes/material values; distinction from background; no broad green/glossy toy drift. |
| Readability | Is the current goal, target and danger legible at the same time? | Actual960px frames during travel, interaction and threat; overlaps; stale guidance; competing cards; understandable feedback. |
| Pacing | Does the opening move from choice to exploration without chores or arbitrary punishment? | Time spent walking/waiting/reading; first loot/first threat; repeated tool/tutorial work; optional activity genuinely skippable; cause of death/loss. |
| Stability | Can actions and transitions remain responsive without repeatable hitches or state loss? | Named browser/render setup; p50/p95/p99 and>50ms frames where valid; transition peaks; source digests; errors; attributed cost; custody/lifecycle controls. |
| Cooperation | Does another player create a useful shared decision rather than merely share the lobby? | Actual roles/communication, cargo support/rescue/route decisions and outcomes; helper input completed or explicitly partial; local versus Internet transport disclosed. |

A naturally played agent solo session is useful guided evidence and can reveal
real friction; source knowledge still prevents a blind-human label. Real-time
SwiftShader samples can diagnose local CPU/software-render costs, while broad
hardware performance and NAT reliability need their own evidence. Neither a solo
route nor native helper fixtures establish human crew enjoyment.

## Review decision at round start

Baseline observation is pending. There is no final release verdict, no claimed
fix and no improved player rating yet. Prefer the first few reproducible problems
that obstruct the normal loop. Final review will compare the actual corrected
path/cost, disclose partial goals and preserve the owner's5/10 baseline unless
new direct player feedback supports a different experience assessment.

## Interim baseline and source audit

The [normal baseline](BASELINE.md) now exists at
`053ed6655eecabe694075d29f65367027fc88815`. I read its method, command/result trace
summary and current changed modules; I ran no tests or browser. Genuine walking,
fleet E and free Courier claim succeeded with credits60. Dispatch, landing,
salvage and carry were not reached in the bounded548.9-second attempt. The recorded
first-E/claim times include source inspection, screenshots, waiting and driver
corrections; they are not human discovery measurements. Oversized absolute mouse
movement hit the native400-pixel guard, and the initial held-Tab frame was taken
after release. Those limits cannot be promoted into map/input defects.

The changed code addresses specific player-facing problems:

- The visible production CRT face and old interaction point disagreed. Current
  `HUB13_BROKER` puts one shared E/guidance/host-range point immediately in front
  of the real face. `world15` now contains actual GLB and fallback builds, native
  standing-controller approach, real selector/LOS, an old-anchor miss control,
  intervening-wall rejection and host/dead/downed/free-credit checks. This is
  meaningful native access coverage. A fresh normal front/side browser approach
  remains separate acceptance.
- App now yields the hold-status binding to HUDcalm instead of opening Character
  on a remapped key. Panel Tab remains native focus navigation; a non-Tab remapped
  close consumes its gesture. Disposal clears the root status class. The original
  locked default Tab already worked in the native pipeline; the actual fix is
  remapping/ownership and cleanup. Current controls assertions use real
  Input/App/UI/HUDcalm listeners rather than a selector-only spy.
- The single dock marker now survives reading until its purchase/departure task
  changes. Selection disposes office and creates departure, dispatch removes it,
  and the outdoor ship-entry cue keeps its finite budget. This improves a concrete
  source lifetime problem without another marker layer or new compulsory task.
- Hotbar caching compares final HTML after updating active item references.
  Status/quota screen caching includes displayed rows, locale, font readiness and
  texture-version invalidation. Direct draws and animated radar/arcade/extra
  remain live. Current assertions cover changed values, external redraw, same-looking
  item replacement and lore-face return. Avoided writes/uploads are valid work
  counts; improved real-time smoothness has not yet been established.

Independent review found one concrete remaining context gap in the new fallback
advice: its timer validates immediately before `UI.toast`, but the actual HUD
queues routine info during danger/arrival/cinematics or overflow. Those queues
previously retained only text/kind/duration, so advice admitted in a correct moon
context could become visible later in orbit/company. The initial advice test used
an immediate toast recorder and did not exercise that downstream queue. Native
`applyRunState` also mutates the same run object; base moon/seed/day alone does not
identify a deep facility. Root accepted this finding and is adding a validity
predicate through the actual HUD queues plus facility/depth/revision checks and
native queue integration coverage. Final acceptance remains open until that
correction is read and validated.

The baseline's software-rendered native update cost did not exceed50ms, while
updates averaged only about6.9 per second and native `dt` often hit0.1s. Rendering
and full frame intervals were not attributed. Therefore neither the local native
update sample nor the caching patch proves the owner's stutter complaint solved.
The owner's **5/10** remains current; final corrected normal input and context/
performance evidence are still pending.

## Second source review — context corrections accepted

Root corrected the two advice findings before final freeze. `UI.toast` forwards
the optional validity predicate to actual HUD delivery. Native held/overflow
queues, warning preemption and the visible-to-quiet transition retain it;
`flushPending` expires stale visible and queued advice. Existing generic rewards
and warnings retain their three-field delivery. The phase helper now captures
actual facility/world identity and descent depth/revision as well as run/session/
phase/moon/day/seed. Selected-vessel dock advice says Board, and a purchase during
the delay invalidates obsolete office advice.

I read the expanded `phasehelp28` test rather than running it. Its actual
Game caller/native owned timers and UI/HUD methods cover initially held advice,
overflow, warning preemption, context changes and visible→danger→phase-change→quiet.
For the last case the real HUD update executes through the notification/phase
boundary, then deliberately throws a labelled sentinel before unrelated health/
compass DOM. Controlled timers and DOM are disclosed. Root reports this focused
test passes. This is meaningful downstream integration, not a full HUD/browser
session or human pacing measurement.

No remaining source blocker was found in the changed interaction, input, cue,
advice-context or presentation-cache scope. Root reports the first combined run
passed255/256, with an old static first-run ownership check expecting an inline
guard in Game. The updated check now follows the new budget owner and actual
Game→helper caller; it passes, while the final combined regression/build is
running. Fresh corrected normal-play acceptance and the owner's stutter/experience
assessment remain open. The current experience baseline stays **5/10**.

## Installed hotbar integration — additional finding open

Root's corrected browser attempt exposed a boundary missed by the component-only
cache review: the default-enabled `hotbar-plus` and `reserved-slots` public mods
wrap `HUD.setInventory` and append decorations on every call. Retaining unchanged
base DOM therefore duplicates their existing labels/value totals. The focused
component assertion did not install these real wrappers. Final cache acceptance
is reopened rather than treating its earlier native pass as a complete game pass.

Independent source review also found both wrappers index `inv.children` even
though native HUD prepends the bag/pockets tag. Decorations can therefore target
the preceding slot/tag. Requested acceptance uses actual `.inv-slot` elements,
idempotent owned decoration updates, removal when enabled/reservation/value
configuration changes, bag-tag preservation and actual installed wrappers in both
orders. Haul is preparing this correction after browser closure; final source
freeze/result/release verdict remain pending. The owner's5/10 is unchanged.

## Installed hotbar correction accepted

The two public decoration blocks now select only actual `.inv-slot` children,
update one owned label/value/total when needed, remove duplicates and clean stale
decoration after config/feature/reservation changes. Their native configure,
pickup and held-item wrappers were not changed. Current source review found no
remaining blocker in this correction.

The expanded `presentation28` fixture uses real ModManager loading, scoped APIs,
configure/attach/boot/netReady and actual public code in both installation orders.
Its controlled DOM parses the native HUD output, including the leading tag;
neighbors used for gameplay callbacks are disclosed fixtures. Haul reports the
unchanged-wrapper control reproduced21 LIGHT labels,42 value labels,21 totals
and300 mutations over20 repeated calls. The corrected source retains1/2/1 and
zero repeated child/attribute/text mutations, with one native HTML assignment.
Value-only changes, filled reserves, host config removal, switches and detach/
new-game transitions have explicit controls. Thirteen component/installed checks
pass; root's presentation/controls/perf5 follow-up passes3/3 in4 seconds. Those
work counts prove bounded presentation, not smoother hardware rendering.

I recomputed the frozen runtime digest over sorted `src` and **all** `public/mods`
files; it matches root's
`4ef501890a25a08f151851fe8022ff77e3e1e2b0685e8c14540e0266cb311ed2`.
Source-only digests cannot represent this public-mod correction. I read the final
core log recording256/256 in249 seconds and the core4.37-second build. That full
run preceded the two public decoration-only changes; it is not relabelled as a
full run after them. Root's follow-up checks, publication build and a fresh final
browser must remain tied to the combined runtime snapshot. Final browser results
are pending; no higher player rating follows. Current owner baseline: **5/10**.

## Title ownership — final boundary still open

The final retry retained another genuine failure before gameplay: Enter after
`app.booted` but before the first RAF can open the lobby, then `MenuRoom.updateBoot`
starts the intro over that lobby. While the intro is already active, its capture
handler skips it without consuming the event, allowing the same Enter to activate
the underlying CRT menu. Independent source reading confirms both ownership gaps.
The [first preload failure](final-preload-driver-failure.json) is retained.

Root reports the fixed-wrapper normal retry has now earned native clerk E, free
claim, held status, persistent departure and kiosk dispatch. Its six-second ship
observation retains one LIGHT and records no hotbar mutations, with unchanged
status/quota texture versions. These remain reported partial milestones until the
final artifact closes. The wrapper follow-up build log passes in 2.80 seconds;
that snapshot precedes the prepared title-only correction. Final review stays
open through title source review, focused checks, publication build and a separate
fresh fast-title retry. Neither this route nor bounded DOM work changes the owner
experience baseline or establishes representative hardware smoothness.

The prepared title changes restrict late intro admission to title mode and consume
the capture skip event. A follow-up review found the held-key boundary still open:
the CRT activation handler accepts `e.repeat`, so a held Enter may skip on its
first keydown and activate the underlying menu on the next repeat before release.
The initial new assertion sends two keydowns without a repeat/release control;
it cannot establish distinct gestures yet. Root was asked for a narrow activation
guard and a repeat-between-skip-and-release assertion before final acceptance.

## Final gameplay replay — changed actions pass, shift remains partial

I read [final-evidence](final-evidence.json) and its native milestone/cleanup
receipts. On the fixed-wrapper runtime, fresh Host/Local/standard campaign input
earned the held status card, visible clerk E, free Courier claim, persistent
departure marker, kiosk dispatch and native landing on 56K-Dialup. The changed
ship/cache goals pass. This is source-guided camera aim and actual physical input,
with one native RAF clock and no pose/readiness/item/outcome fixtures. It does not
establish unassisted discovery or human time to reach these actions.

The run ended at its cap after 600.775 seconds without facility entry, physical
salvage pickup, cargo carry or a return loop. Native starter tools and selecting
the Lead Pipe are not salvage pickup. Contact in an attempted ship-exit lane is
retained as incomplete navigation evidence. The final player X is -0.095 at
Z 2.260, while the native door center X is 2.6; the ray contact X 0.26 is not a
proven doorframe obstruction. This off-center approach does not prove an
impassable exit.
The complete ordinary shift and cooperative decisions remain untested this round.

The idle ship observation now retains one LIGHT, no observed hotbar mutations and
unchanged static texture versions. Broader software diagnostics remain mixed:
2,794 native updates include 11 over 50 ms and a 428.1-ms maximum, while physics
has no samples over 50 ms. This route includes landing and differs from the
dock-only baseline; it is not a controlled smoothness comparison. Root must not
report the owner's stutter fixed from these work counts or SwiftShader timings.

The artifact records no page/caught application errors, empty released keys,
restored diagnostic wrappers and a closed browser. Relay/proxy console failures
remain separately recorded despite the actual Local session. Its field named
`publicModsFreeze` contains the previously reviewed **combined runtime** digest,
covering `src` plus all public mods. Gameplay replay predates the title-only
changes; fresh-title evidence and final build remain separate acceptance.

## Held-key title correction — source accepted

The CRT handler now activates Enter/Space only for a non-repeat keydown. Repeated
arrow navigation retains its existing behavior. The real capture/CRT/UI fixture
now sends skip, three repeat events, keyup and a fresh press for both Enter and
Space; it also checks arrow repeat, pre-RAF navigation, module one-shot state,
motion/auto-session bypass, automatic intro completion and disposed framing.
World/canvas construction is intentionally omitted from these prototype fixtures.
This closes the independently raised held-key finding. No source blocker remains
in the changed title key/admission scope; final focused log, build, runtime digest
and fresh-title browser acceptance are still pending.

## Final release boundary — narrow improvements accepted

I read the final [title native log](checks/title-native.txt): controls28,
presentation28 and escape27 pass 3/3 in 1 second. The final
[production build](checks/title-build.txt) passes in 3.05 seconds with the recorded
existing chunk/config warnings. The earlier 256/256 core suite remains tied to
its earlier snapshot; it predates the bounded public decoration and title
follow-ups. Those follow-ups have their own focused checks and builds, rather
than an invented full-suite rerun.

The final [title browser evidence](final-title-evidence.json) records two fresh
profiles in 16.851 seconds. The earliest trusted Enter arrives after boot but
before intro initialization, opens the browser and Host, and subsequent native
RAFs show no late overlay. The active-intro case records consumed native Enter,
two trusted repeat events while held, retained title, key release and a fresh
Enter/Host action. Both contexts close with empty keys and no page/caught
application errors. Proxy console failures remain recorded. This is actual
keyboard-title acceptance; it does not become another gameplay or co-op shift.

The final source hashes are JS
`400a0d37823b54ee77b84da42043809e873d40e8077dbdb43a4e60b0a699e0ae`,
all `src`
`24a57c23a87714b803f18ae04f9b01993f2d35ab57400ac31c5ed0cba2f04796`,
and combined `src` plus all public mods
`05be26557d600a0985ce388f3ec2540f16d176378feca0b799a1cbfcfbc41b68`.
I independently recomputed the combined digest and it matches. The longer normal
gameplay replay owns the preceding runtime snapshot; only title input/admission
changed afterward.

No release blocker remains in the changed native interaction, status/cue,
notification-context, presentation or keyboard-title scope. The initial queue,
installed-wrapper, slot-index and held-repeat findings were corrected before this
decision. Earlier failures and driver limits remain above. These changes reduce
specific friction and unnecessary presentation work, but the owner experience
baseline remains **5/10**. Full ordinary salvage/return, unassisted discovery,
cooperative enjoyment, representative hardware stutter and replay desire remain
open priorities. Git/publication belongs to root; this independent review used
no browser, Git or heavy test run.
