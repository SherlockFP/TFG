# Wave30 independent review

Opened 2026-10-01. The owner's experience baseline remains **5/10**. This round
addresses explicit player feedback: unreadable moon shorthand, insufficient ship
choice previews, stutter on a new map and failure to find Dead Letter after two
instructions. Wave29's partial expedition and rendered sign fixture remain
historical evidence, not today's acceptance or an increased human score.

review27 owns this document and read-only source/result review only: no production
edits, browser, Git or heavy suite. Root owns integration, source freeze and
publication; other agents own terminal, fleet and facility/outdoor-build changes.

## Initial access findings

1. **Dead Letter has no discoverable menu entry.** Current title/Host/pause UI
   exposes no explicit combat mode choice. Native entry is a host-only point E
   in orbit/company/hub, positioned at the cockpit terminal plus
   `[0.7,0.6,0]`, radius 0.55/reach 2.7, with normal selector range/aim/LOS. Its
   small plaque faces +X. A fresh Fleet session starts at Relay Dock near Z23,
   away from that cockpit plate, and terminal users normally aim at the terminal.
   These are source-level access facts; no physical obstruction or unassisted
   visibility proof is inferred. Repeating location instructions is inadequate
   after the owner's reported failure to find it.

2. **A menu should dispatch the native mode, not manufacture its state.** An
   explicit title/Host choice plus a persistent pause entry can describe card
   waves/bosses/upgrades before starting. Dispatch must invoke the existing
   host checkpoint/start lifecycle after native startSession/hostInit/Fleet
   completion. It must not assign a fake phase, grant cards, write poses or replace
   the campaign slot. If it first requires ship selection/boarding, the button
   and next step must say so, with a visible pending-mode indication and once-only
   start. Peers should see a host restriction rather than silently fail.

3. **Admission must be current at activation.** Queue activity, dock, unsupported
   phases, dead/downed crew and the native 128-item checkpoint cap need specific
   reasons. Drawing a disabled button is not authority. Recheck native admission
   on activation, including actual local dead/downed state, destroyed/disposed Game
   and current host identity. Native aiPlayers is cached by game.time and its
   rows do not expose local downed directly; a cached presentation snapshot cannot
   authorize that edge case. This local-state guard was sent to root for review.

4. **Map staging must keep checkpoint and native publication ordering intact.**
   Game.onPhase applies state before its later non-landing queue flush. Dead Letter
   loadMapFor already calls unloadMap, which clears old queued work before building
   the archive, so no existing stale-job defect is asserted on that entry path.
   A new partial facility builder must dispose/cancel through that same clear,
   including peers still building. Publish world.facility only when complete;
   mapLoaded, warm/prewarm, phase and population consumers must see the complete
   native object. Late join/depth/Dead Letter instant paths must retain their
   synchronous native result.

## Proposed change boundaries

| Area | Acceptance / evidence limit |
| --- | --- |
| Mode access | Explicit ordinary UI entry and informative restrictions; host checkpoint/start called once after native readiness, with no stale panel or duplicate auto-start. Existing physical E remains range/LOS selected. Optional combat is clearly separate from normal salvage. |
| Campaign custody | Real Session self-delivery, entry/return/rejection and mode teardown preserve native item ID/value/holder/bag, wallet/quota, campaign slot and temporary gear ownership. A seeded/pose fixture is labelled; it does not prove ordinary discovery. |
| Moon directory | Full destination names and useful cost/danger/loot detail; numeric/code/name/prefix resolution never silently chooses an ambiguous destination. A displayed number must identify its current directory row. Actual host route cost/admission remains final authority. |
| Fleet previews | Preview corresponds to the actual quoted owned hull/room/paint, visibly identifies selection and retains host purchase/dispatch restrictions. Proposed faceted SVG needs no WebGL renderer, RAF, GPU resources or new timer; closing/replacing the native panel must release its descendants/listeners. |
| Facility staging | Same deterministic final layout/nav/doors/colliders/scene/resources and consumer order, cooperatively budgeted work, cancellation of detached partial resources and once-only cleanup. Atomic decoration/system/merge operations can exceed the budget. Flush completes continuations; clear cancels them. Instant callers remain synchronous. |
| Performance | Compare attributed native work at a matched source/seed/settings boundary. Reduced atomic job size is a technical gain; software timing and partial routes do not establish representative hardware smoothness or resolve all stutter. |
| Experience | Inspect actual visible UI at useful resolutions and record normal input milestones/rejections. Passing checks, render fixtures and more options do not increase the owner's 5/10 or establish blind-player enjoyment/retention. |

## Current review status

The following are actual source findings, not planned features. Combined checks,
the final source freeze and separately scoped browser evidence remain pending.

### Mode entry and checkpoint boundary

The title's native CRT item opens Host with Dead Letter selected; Host describes
the card mode and keeps Campaign available. The fresh mode supplies slot 0/no
campaign runData, and both native hostSave and the fired-run save path exclude
that session. It still uses ordinary Fleet ship selection/boarding. The pending
mode name remains in the existing dock goal rather than adding another tutorial.
Pause exposes the existing native start with its current restriction reason.

Review found cached crew admission, stale Game/disposal, manual-start auto-repeat
and typing/minigame admission edges. Final source now checks actual local and
remote dead/downed state, destroyed/disposed state and current Game identity;
accepted native start consumes the intent for all entry routes. Automatic entry
also waits for native terminal/minigame/UI contexts. The 128-item advice now says
sell cargo or use a fresh session: unloading alone does not reduce serialized
custody. Menu activation calls the existing native checkpoint/start, with no new
pose, card, wallet or outcome writer. Root's clean focused native mode result
includes fresh reinstallation, deferred auto admission, actual exit/once-only
intent and restored cargo; its earlier incomplete-DOM fixture log is retained.

### Detailed routes and input ownership

The actual Terminal directory displays names, native routing fees, danger,
forecast, interior and qualified scrap estimates. Separate normalized name/ID
keys accept useful shorthand; exact IDs win and ambiguous input lists choices.
The review caught invalid explicit # slots falling through to numbered names:
current source makes every invalid/missing # slot reject. Current-sector indices
carry a displayed sector boundary and generated confirmations carry sectorKey;
directory buttons submit canonical IDs through native confirmation/host routing.

Review also caught native delayed command-input focus stealing directory search,
including legacy BOARD-to-MOONS handoff. Current guards preserve search focus;
the foremost window Escape handler now hides the directory first and closes the
terminal on the next gesture. Existing minigame pending-result capture remains
ahead of directory handling. The focused native harness exercises real Terminal,
Session host/peer route costs and rejection, installed wrappers, deferred focus,
Input/window Escape, invalid slots and sector changes. This is not browser CSS
readability or Internet evidence.

### Fleet illustration and map-build ownership

Read source and inspected the offline fleet contact sheet. The four faceted SVG
illustrations distinguish compact/rear-freight/twin-wing/canopy configurations;
saved quoted room bounds and paint drive each image. Matte ivory/steel/charcoal
with small paint stripes follows the current maintenance-crew direction. These
are exterior illustrations, not renders of all furniture or new playable hulls.
Their ordinary panel descendants own no extra renderer, canvas, RAF, timer,
listener, GPU texture/material, collider or light. Native buy/select/dispatch and
close/replacement handlers retain authority. The recorded native fleet30/fleet13
2/2 result covers actual UI methods/host callbacks with a labelled DOM fixture;
browser sizing and keyboard/gamepad feel remain separate acceptance.

The staged facility generator and queue adapter are source-readable. A partial
detached group owns its colliders/lights; clear cancels through registered cleanup.
Continuations insert before sibling map consumers and publish world.facility only
after completion. Instant paths drain the same generator synchronously; flush
finishes queued descendants and clear cancels them. The current native snapshot
test proves synchronous/staged equality of that new generator, cancellation,
resource cleanup, failure isolation and ordering. Separately reviewed the frozen
pre-change facility body plus root-exported prior-main GeoBuilder oracle: revised
synchronous and staged full mesh-buffer/material/collider/nav/door/spawn snapshots
match that old implementation for factory 699464887, Backrooms 17 and Thread
Archive 42. This closes the original-output gap for those fixtures. Actual Game
unload during partial construction is now independently reviewed below. Optional
Dead Letter switching while a peer is still partially building was not executed;
the mode harness's labelled unload fixture alone does not prove that combined path.

The 6 ms budget is cooperative; remaining atomic decoration/system/merge work and
outdoor construction can still hitch. The preserved factory oracle run contains a
70.7 ms continuation outlier. Sequential old/new runs differ in cold/JIT/cache
history and do not prove a total-speedup or hardware FPS improvement. No
whole-session stutter fix is claimed. Independently read the recorded focused
results and confirmed fleet/terminal owner source hashes; no additional suite or
browser was run by this reviewer.

### Added ordinary outdoor boundary

Root subsequently approved staging the other observed atomic owner: ordinary
outdoor generation. Read the actual Terrain/build adapter and Game callback.
The detached builder uses the same continuation/clear/publication contracts;
terrain mesh rows, material buckets, scatter and native sub-build phases yield
without reordering seeded calls. Game's outdoor/terrain/mapGroup/environment/fog/
weather/slide assignments occur only at completion, before layout/facility/map
consumers. Custom-map and Company branches retain their existing synchronous job.
Terrain construction, cold model/texture creation, Rapier trimesh and subsystem
builders remain atomic. The owner's final outdoor check passes three independent
frozen-original golden digests, exact revised sync/queued snapshots, early/late
cancellation, native collider/outpost-light/broadcast cleanup, ordering, flush
and the labelled entrance-collider fault. Source/harness hashes match the owner's
freeze. Observed Node continuations do not establish browser/hardware smoothness.
Actual Game lifecycle is now recorded below; final combined/rendered results
remain separate root boundaries.

Review initially questioned freeTree preceding native subsystem disposal; the
frozen old terrain already used that ordering. It is a pre-existing ownership
detail, not a staging regression or a reason to expand those subsystem sources.
Top-level idempotence is distinct from asserting every legacy subsystem resource
emits one disposal event. No new runtime defect is asserted from that ordering.

### Actual Game integration and production freeze

Read the real `maploading30` harness and corrected receipt. It calls Game's native
loadMapFor/unloadMap on a labelled prototype fixture with actual Physics,
LightPool, ItemManager, Emitter, LandingQueue and WarmSet; no build/queue method is
replaced. Renderer/canvas calls are recorded Node boundaries. Instant and staged
map geometry/nav/doors/colliders/spawns match; actual mapLoaded/warm/prewarm see
fully published scene ownership and correct generation metadata. Native unload
with either partial outdoor or partial facility clears detached builders, drops
future hooks, releases map colliders/lights and retains the same ship/held-bag
item identity/value/custody. Required instant admission drains continuations before
the same-map early return. Zero console warnings/errors and no new errLog are
asserted. Its first fixture getter-assignment failure is preserved separately.

This closes the ordinary Game partial-build lifecycle gap. Full boot, host
migration, an optional-mode switch during a peer's partial build, browser/GPU
compilation and hardware smoothness are outside that focused harness. No defect
in those paths is inferred from missing coverage.

Independently recomputed [production freeze](checks/source-freeze.json): JS
`98c42810a60e049a75e542973fdd913ab90346775526082699649a8a8477fe31`,
all src `06470904b1e3754a62c84fc484af8da40896f80e1d81c4905884ceee60f2b8b1`,
src plus installed public mods
`8669e33029f0b6165cb0d373c899cb1a4398e653e4b5c42ba11bbe98987fb208`.
The sorted-path/NUL/binary-file-digest method and 902 src/43 mod file counts match root's
record. No new source blocker is identified within the changed contracts. Root's
final [combined suite](checks/full-suite.txt) passes 263/263 in 254 s and the
[production build](checks/build.txt) passes in 2.99 s on that unchanged production
freeze. Existing ineffective dynamic-import warnings are retained; they are not
classified as new staging failures. The declared rendered/input acceptance is
recorded below and remains separate from these native/build results.

## Final scoped release verdict

**No release blocker found within the frozen changed contracts. Browser
acceptance is partial and qualified; the owner's experience baseline stays 5/10.**
Independently read the exported receipts and inspected native fleet/directory
frames at 960/1280 plus the final mode frame. The menus show legible full names,
costs, shorthand and actual vessel silhouettes in the existing CRT direction.
This reviewer ran no browser or additional suite.

| Browser target | Earned boundary |
| --- | --- |
| Title/Host | Actual keyboard selected Dead Letter and Host preselected it. The scenario explicitly switched to Campaign. Fresh Dead Letter auto-boarding is covered by native tests, not that browser replay. |
| Fleet | Four distinct installed SVG cards/bounds, native free Courier claim and native boarding. Body approach fixtures are disclosed; no walked access or blind discovery claim. |
| Moon directory | After labelled native Terminal.open setup, actual typing/search/detail/INFO and confirmation→DENY preserve credits 60/current hamsi. The first physical terminal stance selected Enter Dead Letter; E was declined. Physical terminal access is not established by this functional setup. |
| Landing | Actual lever reaches ordinary native moon/factory with matching generated seed. The later landQ.last contains outlife jobs after its original trace was overwritten: no complete browser staging cost trace or speedup attribution. |
| Moon pause | Native attention receipt shows first Escape dismissing briefing and an already open pause with the takeoff restriction. An extra driver Escape then closes it, causing the retained timeout. This is observed layered ownership, not a demonstrated pause regression or completed invalid-button activation. |
| Orbit mode entry | Final fresh native dev-autohost/local setup, real free claim/boarding to natural orbit, then actual Escape/menu Start enters native Dead Letter at 13.598 s. Final HUD reads Dead Letter / 1 / Archive entry and LMB/R controls. This does not prove a complete combat floor or mode return. |
| Checkpoint | The backup has ten actual unheld zero-value starter world items, with canonical ID/type/value/custody comparison plus credits/quota/sold preserved. The raw EMPTY_CHECKPOINT_ONLY status is a retained mislabel; it is not an empty serialization. No recovered valuable cargo, populated bag or browser return is tested. |

[First native receipt](first-native-menu-evidence.json),
[directory/landing receipt](first-focused-menu-evidence.json),
[attention/driver receipt](final-admission-evidence.json) and
[final orbit receipt](final-orbit-evidence.json) retain these boundaries. The
wrong-server attempt, terminal-aim rejection, briefing/extra-Escape driver errors
and original checkpoint mislabel remain disclosed. Completed contexts are closed,
keys empty, with zero page exceptions/new caught game callbacks. External relay
bootstrap console errors are retained; Local checks do not establish Internet/P2P
connectivity. The one native RAF and SwiftShader setup provide no hardware claim.

These results support more discoverable mode entry, useful route selection,
visible hull choices and partitioned ordinary world construction. They do not
establish whole-session smoothness, blind-player usability, expedition completion,
cooperation, retention or a higher human fun rating. Remaining atomic cold model/
texture/Rapier/sub-builder work and forced flush deserve the next attributed
profile. Read the final frozen [QA report](PLAYTEST.md) and its transparent raw
checkpoint-label correction. This review is frozen for root publication; no
production source changed during the review or browser acceptance.
