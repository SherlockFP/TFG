# Wave28 — first-session UI audit and narrow native fixes

The owner rates the current experience **5/10**. Native test counts and prior
source-review scores do not override that feedback. This began as a read-only source
audit of the current host/new-run → dock → ship → first-shift path. After the
source freeze ended, the owner approved the menu-binding and dock-cue fixes
below. This agent performed native listener/lifecycle checks, without browser,
hardware profiling or a complete shift. Browser QA belongs to the play agent.

## Current access and teaching are separate

`onboard_core.decideMode` makes fresh and saved feature access `all`; it does not
make every introductory message necessary. `pacingMode` still treats a fresh
first shift as staged, including after its first pickup. Keep every side system
accessible while reducing unsolicited exposure.

The ordinary fresh dock path does **not** automatically start the twelve-second
LIVE introduction after boarding. `onboard.decide` sets `S.decided = true` before
returning when `fleet13.docked()` is true (onboard.js206–209). `flowTick` only calls
decide while that flag is false, and no reset/re-decide caller exists. Consequently
normal updates in the dock consume that decision with a null flow. Explicit
`begin`, a forced/nondock start or a session that somehow dispatches before its
first update can take another path. Browser state must confirm actual ordering;
do not "repair" this by adding a compulsory freeze/wing to the new-run path.

The dock-specific objective wrapper already returns exactly one next action and
distance. Ordinary Objectives → OneGoal prioritizes survival/carrying/entrance
over teaching. In particular Guide sets `pin = true`, but OneGoal's rank/resolve
does not inspect pin; a pure selector example with entrance plus pinned flashlight
instruction selects only the entrance. This is a source-level priority observation,
not proof that a player was stuck or that all teaching should override escape.

## 1. Make the documented hold-Tab action reach its actual owner

**Callers:** `main.js App.bindKeys`, `hudcalm.js onDown/canShow/showTab`, and
`a11y_core.js DEFAULT_KEYS.menu/ACTION_NAMES.menu`.

The binding is labelled **Full status (hold)**, and the Gameplay settings promise
hold Tab for status. Input prevents default for locked Tab before App's bubble
listener, so App's `e.defaultPrevented` guard yields the default key to HUDcalm.
A remapped key such as KeyU is not prevented by Input: App opens Character before
HUDcalm runs, and `ui.blocksInput()` then blocks the status card. The original
source-only prediction that locked Tab necessarily opens Character was wrong.

**Evidence:** an outside-repository native fixture executed the unchanged
App.bindKeys method from source, real Input, installHudCalm and UI.closePanel.
Locked Tab showed `.hc-tab.on` during keydown and hid it on release; KeyU opened
Character and failed to show status. A browser screenshot taken after keyup
cannot establish a failed hold gesture; QA is checking while the key stays down.
Existing Escape/native UI tests do not exercise this App/HUDcalm ordering.

**Implemented:** App yields the gameplay menu binding to the existing HUDcalm
status handler. Tab in a panel remains available for native form focus; a remapped
non-Tab menu key closes the panel and consumes the same gesture. Character remains
in the existing pause menu. Composition does not open status, and module disposal
clears the root status class. No additional panel or progression unlock was added.

**Acceptance:** hold exposes the existing status, release hides it, one press does
not open a dense character panel unexpectedly; menus/typing, Escape and remapping
retain their contracts. Actual listener dispatch matters more than a selector spy.

## 2. Keep the dock next-action cue useful while the player reads

**Callers:** `fleet13.js update` and `WorldMarker.update` in `render/br_fx.js`.

Fleet-office/departure markers receive a fourteen-second lifetime. That lifetime
runs during menus/consent because Fleet's update does not pause it for UI. When
the marker expires, the reference becomes null but the unchanged `markerKey`
prevents recreation. A newcomer who spends that time reading can lose the spatial
cue before walking, although the distance objective remains. The fleet office is
behind the initial spawn's facing; the departure target changes after selection.

**Baseline:** spend at least fifteen native seconds in the initial consent or
fleet panel, close it, then record objective, cue and actual route to the target.
The encounters agent's visual/GLB audit separately found the broker anchor
1.70 m from its visible CRT face and reported observed discovery friction. Any
marker must follow the corrected shared HUB13_BROKER constant; a separate marker
coordinate would hide the underlying interaction defect. Keep the existing dock
cue until its particular purchase/departure task completes.

**Implemented:** dock updates spend zero marker lifetime, so the single existing
cue stays useful after reading. Native selection disposes the office cue and
creates departure; dispatch removes that cue. The outdoor entry hint still uses
its finite fourteen-second per-landing budget. The corrected broker constant is
owned separately by the encounters agent.

**Acceptance:** reading does not spend the useful dock navigation window; selection
switches the one cue to departure, dispatch removes it and returning/reloading
does not leak markers. No additional marker layers, lights or required checklist.

## 3. Remove obsolete advice and late advice from a departed context

**Callers:** `game.js tutorialHint` after phase changes; `industry13.js` wrappers
around shop.open/hostCart and terminal.hostExecute; native game-owned timers.

Free/unlockAll/Quick/returning paths can schedule the old "Buy tools with STORE /
BUY" orbit toast and "Phish Dayı" advice. The physical-broker runtime refuses
orders away from its trader; its ship terminal is now a route console. Those
phase hints also use unowned global setTimeout callbacks, so changing phase or
leaving before delivery can display advice for an obsolete context. Fresh staged
campaigns suppress this particular toast source, so this is not claimed as an
observed default-fresh failure.

**Baseline:** check the actual post-dock terminal and broker advice, then an
unlockAll or Quick path; change phase/leave before delayed hints fire. If reproduced,
replace obsolete lines with the existing physical broker → TOOLS → pickup route,
use current display names, and gate delayed teaching against the active session/
phase/mode. Coordinate through existing one-goal/message budget instead of adding
another compulsory tutorial popup. Explicitly preserve all feature access.

**Acceptance:** instructions name an action the player can actually perform there;
old-session/old-phase advice cannot appear after leaving, and normal concise
teaching still reaches its intended context.

## Decision boundary

Broad settings and broker panels also contain many advanced controls, but source
length alone does not establish unreadability. Do not perform an arbitrary global
UI redesign before the fresh screenshots/input baseline. These proposals address
specific native ownership, timing and instruction contracts; they do not establish
an improved fun score or replace an unassisted complete crew shift.

## Focused native verification

`npm test -- -j 4 controls28 controls13 escape27 hudcalm fleet13`: **5/5 pass**.
`git diff --check`: pass. The new controls28 fixture executes the real App.bindKeys
method from source without booting WebGL/fonts, real Input listeners, UI lifecycle
and navigation methods, and installHudCalm rendering. It covers locked Tab and
remapped KeyU/KeyF, native panel-close callbacks, form Tab, typing/composition,
release/blur, hidden HUD and other input owners, and status teardown. Its marker
fixture runs installed Fleet plus real WorldMarker and native host purchase/board
handlers, checking one persistent dock cue, task transitions, finite surface entry,
guest exclusion and disposal. Supplied positions in this fixture do not prove
physical E/range/LOS access; that proof belongs to the separate broker regression.
These checks establish input/lifecycle contracts, without claiming a fun score.
