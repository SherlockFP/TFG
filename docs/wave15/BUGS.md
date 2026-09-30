# Wave 15 concrete findings

| Observed issue | Change | Relevant evidence |
| --- | --- | --- |
| Broker Tools opened Weapons by default | Open Tools directly | Actual browser ordering and industry fixture |
| Mixed cart lines reused delivery indices; missing location could fall back to ship | Global slot plan, live pickup tray and floor/capacity preflight before debit | Actual Rapier hidden-parent/occupied-slot fixture; normal E pickup |
| Repeated checkout could debit/deliver twice | Client latch and bounded host order-ID history | Actual wrapped shop request regression |
| Loaded room cargo could disappear when changing to a smaller hull | Move loose old-room cargo to permanent core using native drop/body updates | Actual host/peer ItemManager events and native save/reload |
| Native reload omitted saved collected flag | Forward existing saved `col` into restored items | Native hostSave/loadRun/hostInit regression |
| Pursuit could begin unreachable behind walls | Initial floor/path/body/sight validation, expensive A* after cheap rejection | Real factory/Rapier/nav/host-AI fixture |
| Search ignored visual reacquisition | Return to chase; fresh continuous search after next loss, total35s cap | Actual AI reacquisition and clock-limit regressions |
| Generic nav door opening bypassed Warden's delay; centre-only movement clipped cover edges | Warden-specific forward door handling and swept body-edge checks | Real closed-door delay, actual panel-cover escape fixture |
| Arrival/route cards stayed visible during danger | Suspend active cards and retain unread/context lifetime | Actual sequence lifecycle/readability fixtures |
| Remote/floor lamp events completed local tutorial | Require powered local-hotbar lamp | Actual guide mod-bus regression |
| Facility exit interaction was occluded by its own portal panel at normal standing/crouched aim | Move the exit target 0.22m toward its existing approach spawn, retaining strict wall checks | Real generated portals: 24 approaches pass, old target fails the same 24; unrelated walls still block |
| Orbit cleanup still performed whole-scene/disposal work at once | Budget collection and disposal, cancel on relanding | 2400-geometry/900-live-mesh lifecycle and original residency plateau |

Browser navigation scripts initially crossed real counters, a pickup pallet, the cockpit bulkhead and
ship-internal terrain path points. Those are harness waypoint corrections unless live physics exposes
an unreachable actual interaction or a broken path contract; they must not be reported as product fixes.
See PLAYTEST for any subsequent confirmed navigation defect and its resolution.

Earlier intermittent software-WebGL feedback warnings remain unconfirmed; no rendering path has been
removed or called globally fixed. Human combat/audio, Internet multiplayer and representative hardware
frame times are still distinct validation work.

## Fixed: route board swallowed populated terminal commands

The orbit route board captures keydown on the terminal root before the input submit listener. A pasted or history-restored `route hq` could therefore leave the board visible and Enter would select its preselected Hamsi card. The installed capture listener now hides the board and propagates events unchanged when the actual terminal input contains nonempty text. Empty Enter continues selecting the board route. The existing routeboard harness verifies the installed listener's target, preventDefault/stopPropagation behavior, unchanged command text and empty-input selection (145 checks pass). Fresh browser confirmation is tracked by shared QA; no main input handler ordering changed.
