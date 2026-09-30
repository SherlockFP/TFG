# Relay economy extension

Run the existing simulator in both configurations:

```sh
node tools/sim/economy.mjs --modes-only --runs 200
node tools/sim/economy.mjs --modes-only --runs 200 --relay
```

`--relay` keeps the legacy diner, mining, facility-job, map, pocket-world and homestead model, then adds real industry13 production/scout transactions, field-shift completion, physical batch calibration/packing, budget-limited goods sale and survey rewards. The wishlist includes the actual Hauler price and both arsenal13 prices. Optional field-salvage uses the exported Signal Run value; district restoration uses the actual exported reward constants. Rewards stay separate from quota except physical returned salvage.

Participation defaults to 55% of landings (`--relay-effort 0..1`), with an assumed 3% exploration-time cost on participating shifts. Assumed Signal Run availability is 25% after quota1; this approximates generated vault/mission availability rather than executing every map. Commissioning uses three actual bays and sufficient working capital; robot dispatch costs actual credits and waits two actual ledger shifts. Calibration is treated as successful on a broker visit, not simulated hand input. All-dead completed departures still advance production, as in the real game. The unchanged casino is not treated as a guaranteed income source.

In this environment with 200 runs per crew/difficulty, Standard four-competent crews retained a median6 quotas, mean5.9 and7% termination before quota3 in both baseline and Relay configurations. Median credits at quota3 decreased1031→895 and at quota6 decreased1144→1041 because extra purchases outweighed modeled side income. Mean net Relay credits per whole run were575 for that crew profile. This is a bounded model comparison, not a survival/retention prediction or proof of combat balance. Small participation, routing and loot assumptions can change results.

Legacy side-income percentages in the existing output intentionally retain their original definition; the extra Relay line reports net credits after commissions/scout costs separately. New guardian combat efficiency, weapon power, specialist hull power and new pursuit survival are not modeled. Human campaign observation is required before tuning damage or quotas from these numbers. No blanket price/quota change was made merely to move a score.
