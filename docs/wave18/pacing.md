# Wave18 avoidable transit fatigue and early demand cliff

Two concrete sources of friction were addressed; no additional mandatory system was introduced.

Safe city transit used the same stamina/rest loop as an active horror shift. A baseline unloaded sprint lasted 5.56 seconds (100/18), followed by up to 10.03 seconds of moving recovery (1.1-second delay plus 100/(16×0.7)). Native hub shopping/courier walks can cross 60–90m. `LocalPlayer.update` now reduces sprint drain to 35% in the actual docked outdoor hub or outdoor company district, and uses immediate ordinary 1.1× recovery while walking there. That gives an unloaded city sprint 15.87 seconds and a full moving recovery 5.68 seconds. Walking/running speed, weight penalties, jumping and inventory remain unchanged. Indoor, ship, body-carry/downed and every field context retain their original stamina behavior. Empty orbit and generic outdoor maps do not qualify.

The authoritative early quota ramp was 330→850→1250: first success increased demand by 157.6%, while quota-1 scrap value increased only 1.5%. It is now 330→650→1000, still rising by 97.0% and 53.8%. The first learning target, three-day deadline, sale rates, purchases, helper/scout prices, rewards and all threat/unlock/loot growth rules are unchanged. Later quotas still use the same convex growth formula; their absolute starting base is lower by 250. Existing saved current targets are not rewritten; subsequent quota transitions use the new source.

Native quota objectives already read `quotaState` and the host's actual `run.quota`. Unbanked three-day shares are now 110, 217 and 334 credits/day; with 60 banked they are 90, 197 and 314. There is no alternate tutorial target or quota income bypass.

## Validation and before/after evidence

- `node tools/harness/pacing19.test.mjs` executes actual `LocalPlayer.update`, intercepting downstream controller integration only. It confirms reduced safe-city drain and immediate recovery while protecting actual field drain/delay, carry slowdown, body carry, ship/indoor contexts and ordinary outdoor environments.
- `node tools/harness/balance12.test.mjs` passes the authoritative target/objective sequence, late convex rise, threat-pool limits, creature gates, crisis timing/payouts and unchanged route/gear prices.
- Real-data economy comparison: `node tools/sim/economy.mjs --modes-only --runs 120 --seed 1819`, before and after. Logs `/tmp/tfg-pacing19-before.txt` and `/tmp/tfg-pacing19-after.txt`. Identical seed/policy and real formulas were used; city stamina changes are not represented by that economy model.

| Mode / crew | Median quotas before→after | Fired before quota 3 before→after | Sold/quota at q1 before→after |
|---|---:|---:|---:|
| Standard / 4 average | 4→5 | 16.7%→15.8% | 3.4×→4.4× |
| Standard / 4 competent | 7→8 | 2.5%→2.5% | 5.5×→7.1× |
| Standard / 2 great | 6→7 | 5.8%→5.8% | 5.0×→6.5× |
| Hard / 4 competent | 5→6 | 2.5%→2.5% | 5.5×→7.1× |

The model already shows comfortable early hauling for skilled crews; this change smooths the actual first-success demand jump rather than claiming universal quota hardship. Wipes and higher-quota threat still end simulated runs. A separate pre-existing HOMESTEAD simulation gate reports FAIL both before and after; this pass does not change that subsystem or claim the complete economic suite is green. The simulation describes assumed crews, not human satisfaction, actual FPS or native browser performance. Stuttering is owned by the separate performance lane.
