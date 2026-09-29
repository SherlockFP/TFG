# Wave 8 - ECON8: economy pass over everything wave 8 added

Owner brief (`docs/session/CONTINUE.md` sec. 4 items 3 + 5): wave 8 added income and costs in a dozen places and nobody ran `economy.mjs`. This pass models them, tunes two knobs, fixes the museum door blocking and lists which rewards the player can actually see.

Run: `node tools/sim/economy.mjs --modes-only --runs 100` (after, wave-8 layer ON), `--pre8` (before: no layer, indoor loot x0.7), `--no-wave8` (only the x0.6 loot change). Tuning knobs for the layer: `--w8 '{"mapBuy":0}'` etc. (see `W8K` in the sim). The layer adds no `rand()` calls when off, so the old numbers are reproducible.

## What the sim models now (`W8K` + `w8Day` / `restoCycle` in `tools/sim/economy.mjs`)
Real constants are imported from the core modules; crew behaviour is an assumption (documented next to each number in `W8K`).

| Source | Model |
|---|---|
| Loot count x0.6 (`BALANCE.lootCountMul`) | already read by `dayValue` |
| mapmods | every landing rolls the real `rollMap` (free affixes: value %, extra scrap, danger, elites); 50 % of crews with >= 520 credits buy a Sector Map on day 1 of a cycle and `ATLAS ADD` |
| lcmonsters | cursed scrap +3 % net value (7 % x 1.6 minus what is left behind), Lantern Keeper 0.35/landing x 40-70 % snatch x 122 credits, +5 % creature pressure |
| feedcams | 8-22 % of carried scrap is ON AIR at the ship (skill), x 25 % tax x 90 % of moons have cams |
| facjobs | 85 % of days have a job; pay `cr x (1 + 0.15 q)` (real `JOBS`), success 55/75/90 %, partial pays 70 % of half, zero progress = -25; side job 55 % x 0.55; crate = 40/90/200 sale value; 8 % of the day's hauling time |
| mining | 25-35 % of days a player digs 3-6 min at 30 ore value/min, real cap 240/day, costs that player's hauling time |
| worlds3 pockets | real `doorChance` (every 3rd day + 22 %), real theme loot tables x `lootMul`, 70 % enter, 18 % of the day, +0.8 % wipe |
| resto | 50 % of runs keep a diner (500 credits setup, half of income re-invested until the 6.5k build is done); 5 min on the homeworld per cycle; real `ECON` (active cap, passive, contract, inspector) |
| arcade2 | 40 Clout/player/UTC day (5 h session), counted as credits for the share |

## Results (Standard, 4 competent, `--runs 150` unless noted)
| | quotas met median / mean | early sold/quota q0 q1 q2 (4 average) |
|---|---|---|
| before wave 8 (`--pre8`) | 8 / 6.8 (100 runs: 7 / 6.6) | 21.9x 12.2x 6.5x |
| loot x0.6 only (`--no-wave8`) | 7 / 6.3 (100 runs) | 20.5x 11.7x 6.1x |
| wave 8 as shipped, untuned (pockets x1.35-2, Sector Map 110) | 7 / 6.5 | 22.2x 13.5x 7.9x |
| **wave 8 tuned (this pass)** | **7 / 6.4** (100 runs: 7 / 6.5) | 21.7x 13.0x 7.5x |

- Early comfort check: OK (sold/quota at q0-2 identical in all modes, and still above the pre-wave-8 numbers).
- Quota count is inside the +-1 band (median 7 vs 8; mean -0.4). The x0.6 loot the owner asked for costs about 0.5 quotas, the layer gives 0.2 back. No further loot was added on purpose ("too much loot" is the owner's own complaint).
- Passive / side income share of run income (4 competent): resto + ore + arcade = **8.9 %** over all runs, **12.6 %** for crews that keep the diner (limit was ~25 %). Including jobs + crates + pockets the whole wave-8 side income is 35 %.

| per run, 4 competent | scrap | ore | crates | pocket | lantern | jobs | diner (diner runs) | arcade |
|---|---|---|---|---|---|---|---|---|
| credits-eq. | 22 100 | 1 150 | 2 350 | 3 540 | 540 | 3 070 | 3 310 | 160 |

Diner gross per cycle for a crew that opens it every cycle: 228 (stars 1-2), 330 (star 2), 755 (star 3 incl. contract), 983 (star 4). Against a cycle sale of ~3 300-3 900 credits at q3-q6 that stays a third of the loop or less, and it needs real time on the homeworld.

## Tuning done
1. **Pocket loot too rich** (`src/game/worlds3_core.js` `lootMul`): a themed pocket held 2 signature + 5 pool items x 1.35-2 = about one full day haul (~1 000 at q0) in a 2-minute detour, the biggest single side income (4 400 credits/run, ~12 %). Now Pool 1.1, Data 1.2, Hotel 1.2, Level Fun 1.6 (was 2), Ward 13 1.15: pockets are 3 540/run (~10 %), Level Fun is still the richest and the one with the early party. Level 0 unchanged.
2. **Sector Map was a no-brainer** (`src/game/mapmods.js`): +105 / +199 / +229 / +245 credits per use at q0 / 3 / 6 / 10 for 110 credits (danger x1.04-1.08 not counted). Price 110 -> **200**: break-even at q0-q2 (do not buy early, correct), ~1.0-1.2x back from q3 with the extra danger as the real price. Sim check: crews that always buy one end at the same mean quotas (6.4) as crews that never do, and hold ~235 fewer credits at q3.

## Shop items check
| Item | Price | Verdict |
|---|---|---|
| Pickaxe / Steel / Drill | 45 / 140 / 380 | A dig day nets +56-66 credits over the hauling it costs (one player 5 min), the 240/day ore cap binds. Pickaxe fine; Steel and Drill are luxuries that only dig faster (Drill pays back in ~4 dig days). Kept: they are for fun, not for credits, and cannot become an exploit thanks to the cap. |
| Support Beam / Torch Block | 12 / 8 | consumable safety, cheap, fine |
| NV Goggles Mk I / II, Cell | 85 / 220 / 30 | analytical (not simulated): darkness costs ~8 % of a day's haul on ~12 % of days (~8 credits/day), Mk I pays back in ~3 cycles, Mk II mostly buys dazzle resistance. Not a no-brainer, not useless. |
| Sector Map | 200 | see above |
| Job crates / lantern (free) | - | 130-325 credits + a crate for ~8 % of the day: intended reward, gated by real tasks |

## Fun check: visible vs invisible rewards
Clear (the player sees a thing): job crate bursting open + the payout toast; ore chunks dropping from the wall; the Lantern Keeper's lantern in your hands (95-150); pocket loot on shelves (Level Fun cake / pinata); diner guests, plates, the register; viewer tax as a floating -N with a sound.
Invisible or easy to miss: map affix value / quantity % (only a `LOOT x` chip and terminal text, no "you earned X more because of it"); the diner till and passive income (you find out at the register); the daily ore cap ("crumbles to dust" with no counter); the -25 no-progress job fee (silent); arcade Clout (a tiny number); cursed scrap being worth 1.6x (only found out when it is sold).
Three suggestions (not built):
1. **Show what the map paid.** In the day summary add `MAP BONUS +N credits` (sum of item value x val% / (1 + val%)) and put a short green chip `+19 % VALUE` on the landing card; today the affix reward is a hidden multiplier, so risk feels bigger than reward.
2. **Split the sale by source.** On the sale / day-summary screen list `SCRAP / CRATES / ORE / JOBS / DINER TILL` as separate lines, and announce a full diner till when the crew is back on the homeworld (`Till: 210 waiting`); it turns the passive numbers into small celebrations and makes side income legible.
3. **Warn before the silent losses.** At the lever show `MAIN JOB NOT STARTED: -25` (or a job-progress chip) before takeoff, and show `ORE 120 / 240` on the pickaxe prompt so the cap reads as a target, not as a sudden dust puff.

## Also in this pass: museum door blocking
`geomfix` reported 2 `blocking doors:museum` (a `sell_counter` in the gift shop wall list stood in the door swing on seeds 1234 / 987). Removed it from the gift_shop `wall_` list in `src/world/interiors/themes_studio.js` (replaced by a `cupboard`); `geomfix` now 0 blocking, `repomaps.test` 28 934 checks OK.

## Not modelled / known gaps
Credits never feed back into crew power in the sim (gear, skills), so job / diner credits show up as income share and routing budget, not as extra quotas. Creature pressure of digging noise, job waves (power job) and pocket hunters is only a flat wipe / danger allowance. Crate contents are estimated at 40 / 90 / 200 sale value, not rolled. Viewer-tax exposure, job completion and mining time are guesses to be replaced by a real 2-4 player playtest; every one is a single number in `W8K`.
