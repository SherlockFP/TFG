# Wave 9 - ECON9: economy re-anchor (owner: starting quota 300-350)

Source: `docs/REVIEW_W9_STATE.md` problem 1 (NOW tasks 4 + 5). Quota 130 against 290-650 scrap on site meant 20-30x sold/quota at q0, no decisions for the first 1.5-2 h. Sim: `node tools/sim/economy.mjs --modes-only --runs 150` (same seed before and after).

## Numbers (Standard mode)
| | wave 8 (`quotaBase 130`, `quotaGrowth 100`, overtime /5) | wave 9 (`330`, `85`, overtime /10) |
|---|---|---|
| quota q4 / q6 (4 competent) | 782 / 1445 | 882 / 1445 |
| sold/quota q0 q1 q2, 4 average | 21.4x 12.8x 7.4x | **8.4x 7.2x 5.0x** |
| sold/quota q0 q1 q2, 4 competent | 30.8x 19.9x 11.4x | **12.2x 11.0x 7.8x** |
| sold/quota q0 q1 q2, 2 great | 33.8x 17.4x 11.1x | 13.2x 9.9x 7.6x |
| sold/quota q3 / q6, 4 competent | 5.6x / 2.3x | 4.5x / 2.3x |
| quotas met, 4 competent (median / mean) | 7 / 6.5 | **7 / 6.5** |
| quotas met, 4 average (median / mean) | 6 / 5.5 | 6 / 5.3 |
| quotas met, 2 great (median / mean) | 7 / 6.7 | 7 / 6.7 |
| fired before q3 (competent) | 6 % | 7.3 % |
| early comfort check | OK | OK |

- q0 is now 8-12x for average / competent crews (target 6-12x): the first day still holds a comfortable margin, but a bad day 1 (a wipe, a lost bag) now shows.
- The late curve is unchanged on purpose (q6 = 1445 both ways): the higher base is paid back by `quotaGrowth` 100 -> 85, so the median stays 6-7 quotas and only the first three quotas got tighter.
- Overtime bonus is `surplus / BALANCE.overtimeDiv` (10, was 5) in `host.js hostEvaluateQuota` and in the sim. With quotas this small the surplus was a credit faucet.

## One quota source
`quotaState(run, banked)` in `progression.js` returns `{ quota, sold, need, perDay, met, text }`. The top bar (`hud.js`), the Tab card (`hudcalm.js`), the day report footer (`ui.js`) and the day goal (`objectives.js`) all read it, so they cannot drift. The ship-loot card and the HQ row still read `run.sold` / `run.quota` directly (same fields).
Day target (`objectives.js`): `perDay = ceil((need - scrap already aboard from earlier days) / daysLeft)`, i.e. the cash still needed at today's pace; deadline day pays 100 %, so scrap value equals cash. When earlier scrap already covers the quota the line reads "Quota covered by the scrap aboard. More scrap is overtime bonus".

## First sale and torch
- `wantSell` (onboard.js) now needs `firstrun_core.sellWindow(run)`: only when `daysLeft <= 1` (the Company pays 77 % or more). No "sell it" beat on day 1 (30-38 %).
- HQ row of the route board: `buying at 30 % · deadline day pays 100 %` while days remain; the ship-loot card gets a second line `Deadline day pays 100 %` while the rate is below 100 %. EN / TR / RU.
- Loaner torch (`loaner.js`): given at every landing while the firstrun budget is on, i.e. until quota 1 is met (was day 1 only). Still taken back at takeoff.

## Credit sinks (price retune of existing items, no new system)
Credits are not spent on the quota (a sale adds to `run.credits` AND `run.sold`), so a crew accumulates 1 000-4 000 per cycle and the old catalogue topped out at 700. Mid / late sinks that already exist: ship modules 200-480 credits x1 / x1.8 / x3 per Mk (up to 1 440 each), weapons 560-1 200, pets 500-900, turret kit 560, restaurant decor III 1 800, chef / waiter bots 600-700. Retuned so the top end is worth saving for:

| Item | before | after |
|---|---|---|
| Teleporter (ship upgrade) | 375 | 900 |
| Signal Translator | 255 | 400 |
| Brighter Floodlight | 150 | 300 |
| Uplink Van (Cruiser) | 350 | 800 |
| Jetpack | 700 | 1 200 |
| Zap Gun (credit price; Clout 900 unchanged) | 400 | 650 |
| Hauler Frame | 420 | 650 |
| Kevlar Suit | 480 | 750 |

Early buys (flashlight 15, walkie 12, medkit 40, Sector Map 200, Mk I modules) are untouched. The sim does not spend credits (credits never feed back into crew power there), so quota counts are unaffected by these prices.

## Knobs
`BALANCE.quotaBase`, `quotaGrowth`, `overtimeDiv` in `src/game/progression.js` (`--bal '{"quotaBase":300}'` in the sim). Test: `node tools/harness/econ9.test.mjs`.

## Not verified
No browser run: bar / report match is covered by both reading `quotaState`, not by a shot. Real crews may find the first-day 8x too tight or too loose; one number to move (`quotaBase`).
