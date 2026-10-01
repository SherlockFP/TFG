# Wave28 — fresh normal campaign baseline

Owner experience baseline remains **5/10**. This guided agent session assigns no replacement score. Earlier source audit scores do not describe the owner's current experience.

## Source and method

- Frozen clean baseline `053ed6655eecabe694075d29f65367027fc88815`, protocol `0.12.3`; root's existing Vite on `5174`.
- `GUIDED_INPUT`, fresh Chromium/SwiftShader context at plain `/`, fresh profile **Intern218**, English/default settings. Real title Enter → lobby browser → Host Game → Advanced → **Local**, Campaign/default Standard, empty slot 1 → Start. Public listing remained the native default. Local selection was a normal form action, not a saved-setting injection.
- One visible page, native application RAF only. No manual tick, RAF throttle, hidden-tab simulation, teleport, readiness/run/item/outcome fixture or seeded deep start. Read-only pose/state snapshots and transparent native update/guard/physics timing wrappers were used; original functions were restored exactly.
- Game loaded `2026-10-01T14:45:50.244Z`; closed `14:54:59.102Z`, **548.858 seconds** after load, within the 600-second cap. Native phase stayed dock/orbit. Native death/downed did not occur.
- Lock `/tmp/tfg-browser.lock` held by this owner; browser/context closed and keys released in cleanup. Root kept source and heavy suites frozen during the baseline.

## Earned result and actual limits

**PARTIAL_NATIVE_FIRST_E_AND_FREE_SHIP_CLAIM.** Real walking reached the fleet counter, real mouse aim selected **Fleet broker**, and actual E opened the catalog. Normal click **Claim free starter** selected **Packet Courier**; credits remained **60**. Reopening the catalog confirmed the owned/selected hull; the objective changed to **Board Packet Courier at the departure kiosk (21 m)**. Dispatch, moon entry, loot pickup and carry were not reached.

First E was at **329.316 seconds** after load; claim was at **377.801 seconds**. These include agent inspection, screenshot/tool delays, a diagnostic pause and driver corrections. They are not human time-to-action measurements. The first counter approach was at 24.818 seconds. Initial walking and the floor arrow/objective were understandable; finding the target from the side was less clear.

Actual [head-facing frame](qa_shots/fleet-head-aim-960.png) had no selected E label. After reading the native broker point `[0, 0.2, 30]` and using genuine mouse motion to aim there, the [selected frame](qa_shots/fleet-anchor-guided-960.png) shows **[E] FLEET BROKER** while the visible CRT clerk is far left and the crosshair faces the aisle beside the counter. This establishes a model/target discoverability concern from that real side pose, not a proven native LOS rejection: E succeeded, and exact ray `along/perp/hit` diagnostics were not captured. The observed grounded pose was `[2.2702, -1.2301, 29.9899]`, yaw `1.5752`, pitch `-0.099` at selection.

The operator then used some absolute Playwright mouse coordinates outside the viewport after panel relock. Several produced no native yaw update; walking continued on the old heading. Source inspection after close found the native input guard rejects movement deltas above 400 pixels (`src/core/input.js:44`), which explains the oversized absolute jumps; a subsequent 400-pixel native step updated yaw. This is a driver issue, not a lost-control product defect. These driver errors are preserved as operator limitations, **not** a failed map route or lost E. The baseline ended bounded and partial without injecting a route bypass. A follow-up driver must record yaw before/after each native mouse step and capture held controls before keyup.

## UI/control observations

| Observation | Evidence and scope |
| --- | --- |
| Fresh dock objective and arrow | [Normal start at 960](qa_shots/normal-new-run-960.png): clear “Claim a free ship…” and large floor arrow; initial host/local-voice toasts cover part of the office sign. |
| Free hull/catalog | [Catalog at 960](qa_shots/fleet-catalog-960.png), [owned hull at 1280](qa_shots/fleet-claimed-catalog-1280.png): real purchase UI, clear free starter and prices. The report does not claim every off-screen catalog control was inspected. |
| Next step | [1280 post-claim view](qa_shots/hub-after-claim-1280.png): actual departure distance and marker; native purchased identity confirmed. |
| Escape | Native idle Escape opened pause; another Escape closed it with pointer/input restored. Claim itself already closes the fleet panel, so the operator's immediately queued Escape correctly opened pause; this was not a menu regression. |
| Tab | Short real Tab did not open a panel. The 1.6-second hold screenshot was taken **after keyup**; it cannot establish whether hold status appeared. Missing held status was initially reported too strongly and corrected. `canShow`, bound menu key and `.hc-tab.on` were not sampled during hold. Preserve this as a grader gap, not a proven Tab defect. |
| Dock marker after pause | Actual pause lasted about 45 seconds (two explicit waits plus operator latency). The left objective remained after close. The ground arrow was absent at the then-current angle; the marker's native lifetime/visibility was not instrumented, so expiry is a source hypothesis rather than browser proof. |
| HP display | Initial HP 100/106 became 96/96 after ordinary dock movement without a hurt message; HP then stayed 96. This is an unattributed max-HP/passive adjustment observation, not established fall/combat damage. |
| Input/carry | Native E opened the selected broker and the real claim succeeded. No native loot pickup/carry evidence was earned in this session. |

## Cheap timing diagnosis

3793 native updates across 548.837 seconds of observation; no hidden-page update sample. Update execution p50 **3.4 ms**, p95 **10.1 ms**, p99 **19.8 ms**, maximum **30.4 ms**; no measured update call exceeded 50 ms. Physics p50 **0.1 ms**, p95 **0.3 ms**, p99 **0.6 ms**, maximum **16.3 ms**. Native update `dt` p50/p95/p99 was **0.1 seconds**, the application clamp. Counts imply about **6.9 updates/second** in this software-rendered capture; the renderer/frame interval itself was not timed, and guard timings omit unguarded phases. No hardware FPS or gameplay-stutter fix is demonstrated. The HUD **LIVE 120/127** number is a viewer counter, not an FPS measurement.

The wrappers add small measurement overhead and include idle/menu waits. Their results can help separate expensive native update work from unmeasured rendering, but must not become hardware performance claims. Raw timing retains units: update/physics/guards are milliseconds; `dt` is seconds.

## Errors, cleanup and next acceptance

No `pageerror`, captured native application/event errors or WebGL feedback error. **18 console errors** were retained: Nostr relay bootstrap retries with proxy tunnel failure, HTTP 503 and HTTP 404, entered before choosing Local through the normal menu. One Canvas2D readback warning was also retained. These are not suppressed and this session makes no Internet reliability claim.

Exact wrapper restoration: update/guard/physics all `true`; final native key set empty; browser closed. [Compact evidence](baseline-evidence.json), [full command/error trace](baseline-native-input.json). Screenshots are actual rendered 960/1280 frames, not injected view replay.

Next bounded guided replay should first fix the driver observations (during-held Tab, viewport-native mouse/yaw receipt), then compare clerk-target selection from ordinary front and side approaches. Preserve normal host/new campaign input and the native cargo/economy lifecycle. Dispatch/entry/pickup acceptance still needs actual input; source fixtures cannot replace the partial normal first session. No fun, retention, blind-human or hardware score follows from these controls.
