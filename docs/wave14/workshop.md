# Physical workshop and shared casino feedback

industry13 installs `installWorkshop14(game, context)` internally. No new game.js hook. The workshop remains anchored to the field broker's existing vendor group; three work bays sit on its existing counter and the scout remains in its existing cradle. No additional NPC or route-obstructing building is added. Interaction positions resolve the vendor world transform live; map builders may hide the parent at y=-260 and move it back after loading, so coordinates are never cached during hidden construction.

New in-game commissions use the same industry13 ledger, costs, 3-bay limit and field-shift deadlines, marked `physical:true`. Completed field shifts make the batch eligible; they do not produce money or instantly free its bay. Return and hold E at the correct physical bay for 2.4 seconds to calibrate its press. The visible control face has a 0.45m aim tolerance with the same 2.6m reach and host range checks. Hover names identify Bay 1–3. The lever pulses; machine lights show empty grey, waiting blue, calibratable amber, ready green. A finished parcel appears when calibrated. E at the parcel collects it into the existing goods ledger and frees the bay; A packed-goods crate beside the press provides a physical E sale shortcut; selling uses the existing broker budget, customs risks and payout. No world scrap item/value is spawned to duplicate ledger income.

Host owns calibration time. Heartbeats contain only job id; no client elapsed time or success claim. Host requires a living/non-downed peer within the existing trader area and 2.8m of that job's current bay. A >0.5s heartbeat gap, walking away, death, phase change or map unload clears progress. Two players cannot duplicate a finished batch. Private core calibrate/pack operations are not accepted by the public industry13 order handler. Pending jobs without the new physical flag keep their original maturation behavior; old commissioned jobs and finished goods remain accessible.

The robot prop visibly occupies its cradle while docked, disappears while its field survey is underway, and returns with an illuminated report parcel when ready. E at the cradle opens dispatch or collects a ready report through the original ledger. It is explicitly a shift-gated route survey, not an autonomous robot navigating a live dungeon. Existing cost, two-shift deadline and bounded 52–68 salvage remain unchanged.

Casino: each gameplay transaction records a finite recent history of at most three host results in the existing casino ledger and broadcasts host-only `c14deal`. Physical table screens show the latest participant, actual reels/wheel/packet result and paid chips; nearby crewmates can observe it. Snapshot history rebuilds screens on late join/map load. Displays cannot award currency or control outcomes. Existing private per-peer result panels and atomic transactions remain authoritative.

Verification:
- `node tools/harness/workshop14.test.mjs`: actual installed host module, hidden-parent-to-visible placement regression, heartbeat interruption, timed calibration, dead/far collection denial, exactly-once parcel, existing payout, disposal.
- `node tools/harness/industry13.test.mjs`: legacy commissions plus delayed/faulted/migrated takeoff regressions.
- `node tools/harness/casino13.test.mjs`: atomic chip ledger checks.
- Edited JS syntax checks.

Browser physical interaction and remote observer presentation await the lead's shared QA pass. Calibration cancellation is intentionally not saved through host migration; the commissioned batch remains and can be recalibrated. Ready parcel collection goes into the goods ledger rather than the player's scrap inventory, so it cannot be sold both through manufacturing and quota scrap.
