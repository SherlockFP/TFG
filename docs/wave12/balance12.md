# Wave 12 - BALANCE12: pacing + economy pass over waves 10-11 (data only, no runtime module)

Brief: balance scored 5/10 ("paper-only"): 12 new threats, 4 crises, 5 gadgets and 2 moons were added with no pacing, quota squeezes nowhere before quota 3, credits with nothing to buy.
Everything below is a data / formula-constant change proven with two sims. No new system, no net message, no new game.js line (both `balance12` placeholders deleted).

Sims (deterministic, same seeds before / after; "before" = `D:\KefalCompany` at 538ce407):
- `node tools/sim/economy.mjs --modes-only --runs 300` (Standard rows quoted). New flags: `--no-moons10` (the wave-9 catalogue), `--no-shop` (crews leave credits idle, the old behaviour), `--moon-table` (haul / danger / route cost per moon).
- `node tools/sim/pacing12.mjs` (new): real `threatpool.poolFor` + `spawnTable` + creature gates + `crdirector_core.capOf` + `events11_core.rollCrisis`, 400 seeded runs per moon per quota.
- Test: `node tools/harness/balance12.test.mjs` (6 groups). Three neighbour tests changed because they pinned the old gates (creatures10 / creatures11 / swarm11: now read `TUNE.minQuota`).

## 1. Threat pacing (wave 10 / 11 creatures)

What was wrong (pacing12, before): at quota index 1 a moon's pool held on average 1.09 of the 9 new "rule" headliners and 29 % of pools held two or more; by quota 2 that was 46 %. Five new creatures (Buffering, Doomscroller, Captcha, Streamer, AutoMod - the last one a 55-damage delete) could be met in the second cycle, AutoMod in the very first cycle after the tutorial.

| change | where | value |
|---|---|---|
| Staggered spawn gates (`TUNE.minQuota`, single source; `threatpool.HEADLINE.minQ` now reads them, so pool and spawner cannot drift) | `creatures10_core`, `creatures11_core`, `swarm11_core`, `threatpool` | Scraper 0 (small colony, no bite) - Streamer 1 (never attacks) - Captcha 1 (a puzzle, 12 dmg burst) - Buffering 1 -> **2** - Doomscroller 1 -> **2** - Ratio 2 -> **3** - AutoMod 1 -> **3** - Shadowban 2 -> **3** - Recommender 2 -> **4** |
| Pool cap on new headliners `threatpool.newCap(q)` | `threatpool.js` (`NEW_IDS`) | 1 per pool before quota 2, 2 at quota 2-3, no cap from quota 4 |
| Pool size `threatpool.poolSize(q)` ("the late game combines them") | `threatpool.js` | 3 residents until quota 4, then 4 |
| Crisis roll (events11) | `events11_core.rollCrisis` | none in the first cycle (was 16 % from day 2), 16 % from day 2 of the second, 34 % from the third (was 34 % from the second) |
| 503 jester weight | `moons10_core` | 18 -> 12 (the highest of any moon; instakill only from quota 4 but it is the most feared hazard) |

pacing12 output (all 8 route moons averaged, 400 seeds each):

| q | new in pool before -> after | P(>=2 new) before -> after | P(3 new) after | new share of the spawn table after | pool new power / director cap (P over cap) | crisis per landing before -> after |
|---|---|---|---|---|---|---|
| 0 | 0.50 -> 0.50 (only the Scraper) | 0 -> 0 | 0 | 0 % | 0.04 (0) | 0.11 -> **0** |
| 1 | 1.09 -> **0.57** | 29 % -> **0 %** | 0 | 1.3 % | 0.12 (0) | 0.34 -> **0.11** |
| 2 | 1.43 -> 0.98 | 46 % -> 24 % | 0 | 2.8 % | 0.26 (0) | 0.34 |
| 3 | 1.35 -> 1.21 | 42 % -> 38 % | 0 | 3.9 % | 0.34 (0) | 0.34 |
| 4 | 1.35 -> **1.79** | 42 % -> **63 %** | 20 % | 5.1 % | 0.47 (3 %) | 0.34 |
| 6 | 1.32 -> 1.78 | 40 % -> 61 % | 21 % | 5.4 % | 0.41 (1 %) | 0.34 |

Reading it: days 1-2 (quota 0) meet only the vanilla roster (plus at most a small Scraper colony); quota 1 adds exactly one gentle rule (Streamer, Captcha, Scraper) per landing; quota 2-3 adds the chase rules one or two at a time; from quota 4 pools of 3 or 4 new rules on one moon are normal (the late-game combination). The director keeps holding: the new pool's total threat is 0.26-0.47 of the peak cap on average and above the cap in only 1-3 % of late pools (the director queues the excess, every new creature is maxAlive 1). Spawn-table weights were left alone: new creatures are only 1-5 % of the table, so exposure comes from pool + gate, not from weights.

## 2. Economy

### 2.1 Quota curve (`progression.js BALANCE`; sim = `nextQuota`, host = the same function)
The wave-9 pass left q0 8-12x and q1 / q2 7-11x: no decision until quota 3. **q0 is kept on purpose** at the owner's 300-350 start (learning cycle, `econ9.test` pins it): the squeeze starts at q1.

| index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 10 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| before | 330 | 420 | 526 | 659 | 829 | 1047 | 1323 | 1668 | 2093 | 3224 | 4802 |
| after | 330 | **850** | **1250** | 1310 | 1394 | 1510 | 1664 | 1864 | 2116 | 2806 | 3790 |

(`nextQuota` with rng 0.5. After = ramp `quotaRamp [330, 850, 1250]`, then `quotaGrowth 28 x (1 + q^2 / quotaCurveDiv 8)`; before = growth 85, div 16. The curve is steeper at the start and flatter late: q6 +26 %, q8 equal, q12 -21 %.)

Sim, Standard, 300 runs, same seeds ("after" = shipped defaults incl. the two new moons and the credit-spending model):

| | before | after |
|---|---|---|
| sold/quota q0 q1 q2, 4 average | 8.5x 7.2x 5.1x | 8.5x **3.5x 2.1x** |
| sold/quota q0 q1 q2, 4 competent | 12.3x 11.2x 7.8x | 12.3x **5.2x 3.3x** |
| sold/quota q0 q1 q2, 2 great | 13.0x 9.9x 7.6x | 13.0x **5.0x 3.3x** |
| sold/quota q3 / q6, 4 competent | 4.5x / 2.3x | **2.3x / 1.8x** |
| quota q4 / q6 (sim, with the random growth roll and the surplus multiplier) | 877 / 1439 | 1417 / 1724 |
| quotas met median (mean), 4 average | 6 (5.1) | 4-6 (4.0) |
| quotas met median (mean), 4 competent | 7 (6.7) | 6 (6.0) |
| quotas met median (mean), 2 great | 7 (6.6) | 6 (5.5) |
| fired before q3: 4 average / 4 competent / 2 great | 9.3 % / 6.3 % / 1.3 % | 13.3 % / 6.3 % / 3.0 % |

Honest read: the target "1.3-2.0x" is reached for an average crew from q2 (2.1x) and q3 (1.9x), for a competent crew from q3 on (2.3x -> 1.8x); q1 stays 3.5-5x because a lower ratio makes a single wipe on the last days a run-ender (sweeps, fired before q3 / median quotas met for 4 average and 4 competent: shipped ramp 850-1250 = 13.3 % and 6.3 % / 4 and 6; ramp 1000-1500 = 16 % and 7.3 % / 3 and 6; a flat curve from q0 = 1400 for ~2.0x at q0 = 23 % and 12 % / 3 and 5). The sim crew is optimistic (average crews bring back 52 % of the reachable value; a real first-time crew will be lower), so the real ratios should land below these. q0 8.5-13x is the owner's decision; if the lead wants it tighter, `quotaRamp[0]` / `quotaBase` is the one number and `econ9.test.mjs` must be edited with it.

### 2.2 Route costs (credit sink that scales with depth) and payouts
Moon table (`node tools/sim/economy.mjs --moon-table`: 4 competent, expected 3-day haul, danger ratio r, wipe %):

| moon | tier | cost before -> after | haul q0 | r q0 | wipe% q0 | cost / haul q0 before -> after |
|---|---|---|---|---|---|---|
| 56K-Dialup | 1 | 0 | 2906 | 0.36 | 2.0 | - |
| 12-Forum | 1 | 0 | 3343 | 0.45 | 2.0 | - |
| 33-Guestbook | 2 | 150 -> **220** | 4574 | 0.62 | 2.0 | 3 % -> 5 % |
| 88-Chatroom | 2 | 200 -> **320** | 4545 | 0.80 | 2.5 | 4 % -> 7 % |
| **inf-Feed** (new) | 3 | 380 -> **500**, x1.45 -> **x1.55** | 4933 -> 5263 | 0.94 | 3.7 | 8 % -> 9.5 % |
| 666-Creepypasta | 3 | 450 -> **700** | 5784 | 1.01 | 4.7 | 8 % -> 12 % |
| **503** (new) | 4 | 800 -> **1100** | 6576 | 1.26 | 8.7 | 12 % -> 17 % |
| 404-Not Found | 4 | 900 -> **1500** | 7678 | 1.65 | 11.4 | 12 % -> 20 % |

- The Feed was dominated (4933 for 380 against levrek 4545 for 200 at lower danger): payout x1.45 -> x1.55 (`moons10.test` caps it at Creepypasta's x1.55).
- Cost / haul now climbs with depth from 5 % (Guestbook) to 20 % (404). Against the extra haul over the free Dialup (q0) a route costs: Guestbook 13 %, Chatroom 20 %, Feed 21 %, Creepypasta 24 %, 503 30 %, 404 31 %.
- At q3+ (Standard nerfs: loot x0.84, heavier carry) tier 3-4 hauls collapse (cipura 3369 with 17 % wipes, 404 4402 with 34 %) and tier 2 wins: that is the existing hardmode structure, not touched here.

### 2.3 Gear11 prices (store)
| item | before -> after | reason |
|---|---|---|
| Glow Trail Spray | 35 -> 40 | consumable |
| Door Jammer | 55 -> 70 | 2 charges, a 40 s sealed door is an escape |
| Decoy Speaker (`grenades_core KINDS.speaker` + `gear11_core SPEAKER`) | 65 -> 90 | 2 charges, a beacon (45) that also speaks |
| Zipline Kit | 140 -> 240 | reusable, changes routes |
| Scout Drone | 190 -> 380 | reusable, whole-crew scan through walls; at 190 it was cheaper than the Sector Map (200) which returns ~100-250 per use |

Tiered consumables < tools < reusable gadgets, so the drone / zipline are a second-cycle purchase (a q0 cycle sells ~2900 credits).

### 2.4 Crisis rewards (`events11_core.payout`)
Lockdown credits 45 + 15q -> **110 + 30q**, Power Reroute 60 + 20q -> **160 + 40q** (time bonus up to x1.5 unchanged; Flood and Viral keep 0 credits: their reward is the floating / x3 loot). At q2 that is 170-260 (lockdown) and 240-360 (power) = 13-28 % of a competent crew's day, for 130-300 s of hacking / breaker puzzles that summon creatures. Effect on a cycle: about +25 credits per landing on average (x0.34 roll x half the rolls are lockdown / power), i.e. +2-3 % of income, not a faucet.

### 2.5 Credit sink (does the pile exist?)
The old sim never spent credits, so 14.8k idle at q3 (competent) looked like a pile. New `wishlist()` model in `economy.mjs` (real prices from `items.js`, `gear11_core`, `shipyard_core`; crews buy in priority order while keeping a route reserve, plus 40 consumables per player per cycle): the whole catalogue is 27 405 credits for 4 players (23 715 for 2): 39 buys = belt / field / hauler / kevlar per player, drone, jammer, zipline, speaker, signal, floodlight, teleporter, zap gun, harpoon, jetpack and 8 ship modules to Mk III (12 modules x 5.8 x base price, socket-limited to 8).

| 4 competent, Standard | credits q3 | credits q6 |
|---|---|---|
| sim without spending (before) | 15 222 | 19 313 |
| with the wishlist (after) | 1 004 | 1 134 |

So the catalogue absorbs income until about quota 6-7 (competent) and the deep-moon route costs above take another 500-1500 per cycle. No new shop tier was added: with the sink model on, the idle pile is gone until the wishlist is bought out (great crews around q7+), and a tier above that would be new content (an item), not tuning. Idea if the lead still sees idle piles in real play: `SHIP_UPGRADES` / module Mk IV (x5 price) in `shipyard_core.creditCost`, one table row, but it needs a Mk IV effect first.

## 3. Numbers that were checked and left alone
- crdirector caps (`capOf` 3.5 + 0.35q + 0.45 tier; body cap; `wavesAllowed` q3): unchanged, the new pools stay inside them (section 1).
- The Loop (loop11): ~600-750 of light scrap for a no-combat puzzle, doorChance tier 2-3 = 1: about one landing day of income for 5-8 minutes; not a faucet, left. Watch it once a human plays.
- New moons' spawn weights other than the 503 jester, Ratio / Doomscroller interior multipliers, scraper colony chance (0.35 base, small colony at quota 0): unchanged.

## 4. Files
`progression.js` (BALANCE: `quotaRamp`, `quotaCurveDiv`, `quotaGrowth`; `nextQuota` reads the ramp), `threatpool.js` (NEW_IDS / newCap / poolSize, HEADLINE minQ from the TUNE gates), `creatures10_core.js` / `creatures11_core.js` / `swarm11_core.js` (minQuota), `events11_core.js` (roll + payout), `moons.js` (palamut / levrek / cipura / 404 costs), `moons10_core.js` (Feed + 503 cost, Feed payout, 503 jester), `gear11_core.js` + `grenades_core.js` (one price line), `tools/sim/economy.mjs` (+flags), `tools/sim/pacing12.mjs`, `tools/harness/balance12.test.mjs`, tests creatures10 / creatures11 / swarm11 (gate assertions read TUNE). `game.js`: two placeholder lines deleted.

## 5. Knobs
`BALANCE.quotaRamp / quotaGrowth / quotaCurveDiv` (sim: `--bal '{"quotaRamp":[330,850,1250]}'`), `TUNE.minQuota` in the three cores, `threatpool.newCap / poolSize`, `ROLL` + `payout` in `events11_core`, `MOONS[..].cost / scrapMul`, `ITEMS11[..].price`.

## 6. Not verified
No browser run and no human play: the sim crews are assumptions (documented at the top of `economy.mjs`), the "credits never feed back into crew power" gap is unchanged, and the pacing sim measures pools and table weights, not what a real host spawner rolls minute to minute. Node tests that fail only inside a git worktree (path-dependent): artpass, followers, hubgate, netaudit_wave8 (they pass in `D:\KefalCompany`). swarm11's scraper alarm test is timing-sensitive when several test runners share the machine (it failed 3 of 9 runs in this worktree under load, passed alone).
