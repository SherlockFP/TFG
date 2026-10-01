# Wave21 independent playtest — 2026-10-01

One serialized Chromium/SwiftShader context, host and local peer, 960×540. Native mouse, keyboard and E drove fleet choice and lift controls. This was a bounded setup-labelled integration gauntlet, not a pristine expedition or hardware FPS test. Hamsi seed17, fresh day1/quota0; player-only room-centre positioning exercised ordinary visitation updates. Timing advanced native simulation at 1/60s; no visited list, depth, AI, reward or outcome injection.

## Observed results

- Native free Courier prerequisite succeeded. Fresh level1/zero skill points retained all-access mode; first-run calm/mapmod gating remained active.
- At initial surface arrival, native firstdepth grace was active and no living roaming creature was present. Native turret/mine/nest records remained; this does not mean every hazard was absent. Brief accelerated updates verify initial grace, not a complete 45-second human exploration.
- CALL before discovery was refused. Ten reachable ordinary rooms were available, so the native min(15, available) threshold was10. Position fixtures plus ordinary updates recorded ten visits; actual CALL reached READY after three simulated seconds.
- DESCEND with the peer outside was refused. After both crew entered the actual cabin, E transitioned to depth1. Both peers agreed factory layoutSeed3782706551 and one active facility group.
- Exact cabin cargo survived: held copper i1rz/value30, bag wire i1s7/value20, loose vase i1tk/value100. Held copper used physical pickup and slot selection; bag custody used explicit native spawn/place fixture, not inventory UI pickup. Loose cargo used native world physics. No duplicate of these IDs was observed.
- Deep extraction time stayed522.1333333333487 during four accelerated seconds while native moon time advanced. This holds extraction time, not every game timer.
- Two original return/resume attempts failed before E: the automatic arrival view selected Rock-Paper-Scissors with the nearby peer. These named checks were failures, not successful transfers. Actual keyboard/mouse repositioning within the cabin cleared the panel ray; subsequent return E restored depth0/layoutSeed17 and all33 saved surface item IDs. Subsequent CALL/READY/DESCEND reached depth2/serverfarm/layoutSeed598252011 with exact cabin IDs intact. Both peers retained one active facility group.
- A final replication defect remains: peer alone retained saved surface item i179 (comp_coolant, world/unheld/unowned, value11) at depth2, while host had removed it. It persisted after30 further native updates. This prevents a complete floor-world cleanup pass; no item was manually removed. Root/maps owner received the reproduction.

Runtime page errors, recorded application console errors and feedback-loop warnings were empty in this run. A private read-only diagnostic briefly used the wrong position property; this helper exception was corrected and is not a game runtime error.

## Artifacts and limits

Raw evidence: /tmp/tfg-qa21/results.json and run.log; private helper /workspace/.tfg-tools/qa21.cjs. Screenshots: 01-depth-transit-ready.png, 02-depth1-native-arrival.png, 03-surface-express-return.png, 04-depth2-native-arrival.png. These close cabin views establish rendered context, not full-floor art quality or clear sign readability; the depth2 frame faces the cabin backs and dark wall.

Root reports233/233 native suites passed in389s and build2.54s before the later RPS/bot follow-ups. Native-only evidence covers migration, damage/value bounds, fallback placement and late join. Full interior traversal, natural discovery, all seeds and long-session economy were not browser-tested. The narrow cabin RPS suppression fix requires fresh-source verification. Persistent peer ghost cleanup requires a product fix and targeted rerun.

## Wave22 follow-up: peer ghost fixed

The product boundary now drops delayed abandoned-surface world spawn packets while deep and broadcasts removal of abandoned indoor IDs. Fresh native0→1→0→2 browser evidence removed all31 saved loose surface IDs on both peers atdepth1/2, restored all31 atsurface, and matched the complete depth2 indoor-ID sets. The old persistent i179-style ghost is resolved in this focused reproduction. Initial arrival still exposed optional High-five after RPS was suppressed; subsequent high-five and trade findings led to one shared optional-peer interaction-selection policy, checked separately in Wave22. Historical failures above remain evidence of why these fixes were needed.


The final Wave22 central optionalPeer policy was subsequently browser-verified on an explicit native factory17/.68 atrium generator fixture:11 ordinary native visits, actual CALL/DESCEND, untouched automatic crew arrivals, selected RETURN E, and actual return of both peers tosurface. No optional RPS/High-five/Trade interception remained. See docs/wave22/PLAYTEST.md for the full corrections and limits.
