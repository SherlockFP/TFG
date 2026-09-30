# Wave 15 independent browser gauntlet

## Method

Chromium `/usr/bin/chromium`, Playwright, local dev5174,960×540, headless SwiftShader. Serial browser lock `/tmp/tfg-browser.lock`; no competing browser. RAF throttled120ms; paced simulation steps use `kefal.tick(n,1/30,false)`, screenshots explicitly render. This is interaction/correctness evidence, not hardware FPS or unassisted newcomer research.

The first continuous session used actual keyboard/mouse, E interactions and visible menus from a fresh dock. Read-only source/nav coordinates guided travel. No QA teleport, injected money, forced phase completion, artificial tutorial credits or inventory assignment was used. Normal game's facility portal teleport and natural starter grants are gameplay, not QA shortcuts. Actual normal landing/takeoff timers completed.

Artifacts: `/tmp/tfg-qa15/shift-results.json`, `shift.log`; external helper `/workspace/.tfg-tools/qa15-shift.cjs`. A corrected fresh continuous rerun uses `/tmp/tfg-qa15-final/` and `qa15-shift-final.cjs`.

## Initial continuous timeline

| Step | Observed result |
| --- | --- |
| Dock → fleet office | Real movement/E broker, claimed free Courier; wallet60. |
| Physical field broker | Walked around solid pickup pallet; bought flashlight15 via TOOLS; real E pickup, wallet45. |
| Boarding | Real E boarding, selected Courier; dock flag cleared. |
| Route/landing | Real terminal and lever; Hamsi normal timer landing. |
| Outdoor approach/entrance | Followed actual path outside hull, real E entrance, flashlight F. Native first-entry reward raised wallet65. |
| Indoor salvage | Nav-guided real movement; actual E picked `iff` x_wrench34 from factory world seed150006924. |
| Return/deposit | Found strict-LOS portal bug; same session actual mouse horizontal oblique aim + E exited. Walked back and actual selected-slot/G deposited iff inside ship. |
| Takeoff/company routing | Found nonempty terminal command Enter swallowed by visible RouteBoard. Extra unintended ordinary Hamsi landing resulted. Real takeoff, visible HQ card selection, E company landing recovered without QA state mutation. |
| Company approach | Actual ship ramp, left lane at z7.5, drop counter and bell. Same iff delivered at[-.033,-.10,-35.539]; real E bell at86% rate. |
| Ledger | Initial helper closed before native2600ms delayed settlement. Initial run establishes bell invocation, **not completed sale ledger**. Corrected rerun below is required. |

Value34→20 was verified as normal surveillance tax: `run.fcTax=14`; no pricing defect claimed. Added normal grenade filled freed loot slot on second landing; actual G dropped it in ship to free slot before picking cargo back up. No inventory debug mutation.

Initial runtime:0 page errors,0 application console errors,1 warning. Full loop included extra field landing and portal aiming workaround; it is not a clean one-expedition first shift.

## Findings → fixes → verification

- **Portal exit LOS blocker:** center aim lost Exit prompt because portal's own .15m panel was counted as obstruction on angled/float ray. Captured actual collider and seed. Root moved only teleport exit interaction point .22m toward entrance spawn, retaining strict unrelated-wall LOS. Actual Rapier tests:24 approach offsets pass; old point24 fail; unrelated wall still blocks. Fresh continuous centered E exit passed below.
- **Typed route command priority:** actual typed `route hq`/`confirm` were intercepted by RouteBoard's Enter capture. Controls now steps aside for nonempty actual terminal input. Native confirmation remains required. Installed-capture regression145 checks passes; fresh continuous typed route + CONFIRM passed below.
- **Harness-only positioning/precision:** solid pickup pallet needs sidestep; ship path origin is inside hull; company raised road must be crossed at z7.5; a tiny flat wrench needs precise mesh-center aim. Guided paths were corrected; these are not labelled inaccessible product targets.

## Targeted fixture boundaries

A fresh debug-seeded quota2 browser fixture was attempted independently. Typed `route hq` reached actual native confirmation text (input priority fixed); helper incorrectly expected an immediate route change before CONFIRM. Its subsequent intake was on the wrong moon. Exit and pursuit labels were visible, but E was not consumed in this helper (likely remaining terminal typing focus); no portal transition, Warden spawn, chase or reward was established. These attempts are **inconclusive**, not passes.

Wave15 pursuit evidence currently includes real factory/Rapier/native HostCreature AI tests for visible reachable activation, navigation/body clearance, reacquisition, unseen continuous search and35s cap; this is Node integration evidence. Wave14 browser actual hiding/mouse peek/physical once-only recording and local peer agreement remain documented separately. No human combat/audio or current natural chase balance claim is made.

Archive matched natural approach screenshot `/tmp/tfg-qa15/09-intake-matched.png` was visually inspected: staffed exchange, hanging receipt ribbon, archive branding/conveyor read from normal sale approach. No clipping/access defect observed at that camera. Initial `10-company-sale.png` precedes delayed ledger; exclude it as settlement proof.

## Corrected fresh continuous rerun

Source refreshed after portal and route capture fixes. Fresh continuous campaign repeated dock/freeCourier/broker flashlight/boarding/Hamsi, with no QA world/state edits. First field seed609439670: nav path toward coolant i1fx snagged at[1.512,-299.98,28.828]; actual sidestep x2.7 passed. Subsequent loot moved to shelf-room cluster; diagnosis/travel consumed the field timer and ordinary automatic departure occurred. This failed expedition is retained in the timeline, not erased.

A short second normal landing seed915705947 found copper i21c near entrance. Actual E pickup succeeded after allowing movement inertia to settle and re-aiming; hotbar was full of repeated starter gadgets, so native inventory put copper in bag. Normal centered E facility exit passed with the fresh portal fix. Actual field return dropped the currently selected flashlight, not bagged copper; this is explicitly not loose salvage-deposit proof. Bag-held copper travelled aboard legitimately; native hostFinishTakeoff includes holder IDs aboard without excluding bag inventory.

Normal physical terminal typed route hq + CONFIRM now correctly routed HQ; real lever and natural timers reached company without RouteBoard card workaround. At company, actual I panel/RMB moved exact copper i21c from bag into hotbar, number key selected it, actual G deposited it inside ship, verified holdernull and inShipItems contains i21c. This physical deposit occurred at company, not before departure; the requested loose-floor deposit before departure variant remains untested. Bag extraction itself is valid native gameplay; current collected flag was not independently read before sale. Real pickup then company lane/drop/bell and ledger settlement passed below. No inventory assignment or debug transaction was used.

### Final transaction proof

Actual physical inventory recovery used I→RMB copper tile→number key. Re-picking the deposited copper put it into bag again because ordinary hotbar slots were full; a second real I/RMB recovery returned it to hand. This friction is preserved, not repaired with QA inventory writes.

Exact ID `i21c` Copper Nugget value30 was held before actual G drop at[-.186,-.060,-35.536]. Real E bell at83% sale rate; condition-based native wall-time wait verified credits65→90, sold0→25, and exact i21c removed. `/tmp/tfg-qa15-final/10-sale-ledger.png` was visually inspected; receipt line Copper Nugget25 agrees with ledger. Initial receipt TOTAL counter shows0 at the first animation frame; no completed-animation defect is claimed. Matched intake camera `/tmp/tfg-qa15-final/09-intake-matched.png` follows actual campaign movement.

**Result:** fresh continuous normal campaign dock→claim→NPC order/pickup→board→field entry→failed first expedition/timeout→short second expedition/real copper pickup→bag aboard extraction→normal takeoff→typed HQ confirmation→natural company landing→physical sale/ledger succeeded. It is not a pristine first expedition and does not prove loose salvage floor-deposit before departure. Every recovery used real input and normal gameplay; no debug money, phase, teleport, item placement or ownership mutation.

Final continuous runtime: **0 page errors,0 application console errors,1 warning**. Warning is not a measured FPS/performance result. Browser closed and shared lock released. Full lifecycle pursuit/cleanup and multiplayer tests are separately labelled Node or earlier-wave browser evidence; current natural Warden chase remains unverified.
