# CAMLOOT (wave 9): cameras guard the money, counters cost something

Source: docs/REVIEW_W9_STATE.md task 7 + section 5. Code: `src/game/feedcams_core.js` (plan + rules), `feedcams.js` (host / client), `routeboard_core.js` + `routeboard.js` (CAMS row), `tools/sim/feedcams_sim.mjs`, test `tools/harness/camloot.test.mjs`.

## What changed
- **planCams(L, { spots })**: after the tutorial camera, `ceil(0.6 * (n-1))` cameras go to the rooms of the top loot spots (deepest 30 % of the non-sealed, non-elevated scrap spots, min 3; treasure and vault rooms are allowed now). A loot room is only guarded when `blindFlank` finds a cell its sweep envelope never covers (behind / beside the mount, under the lens), so there is always a blind way in. The rest of the plan is the wave-8 scoring. Without `spots` the old plan is used.
- **Junction cut = 2 s hold.** `fcreq {op:'cut'}` now STARTS a hold (host `S.cuts`); pressing again, walking more than 3.2 m off, or going down interrupts it (`fcfx cutstop`). Every 0.7 s of it is a noise pulse (0.9) through the existing `creatures.noise` hook. At 2 s the camera goes ST.CUT until `now + 90..120 s` (`FC.reboot`), then the host reboots it (`fcfx reboot`). The lamp stutters amber for the last 6 s (`rebootWarn`, `fcfx rewarn` = spark sound). `stateNow` expires CUT like BLIND; clients read timed states through it.
- **Spray**: unchanged, quiet, 40 s (`FC.blind`). **Smash**: permanent, now loud (`FC.smashLoud` 2.5, was 1.2); a CUT camera can still be smashed to make the cut permanent.
- **Route cards**: a "CAMS n" row (`camsOf` = `camCount(size, day, quotaIndex)`).
- New net message types: none. New `fcreq` ops: none (op `cut` toggles start / cancel). New `fcfx` kinds: `cutstart`, `cutstop`, `rewarn`, `reboot` (`smash` carries `by`).

## Retune (tools/sim/feedcams_sim.mjs 24 seeds x 2 sizes, q2 day 5, 8 cams)
The sim now: places big scrap in the deepest 30 % of cells and hands the loot cells to planCams as spots (`nospots` = old plan); charges each creature wave (heat >= 70, every 60 s) `wavecost` s (default 40) per crewmate; lets careful / showman crews cut the junction box of the room they are about to work in (walk + 2 s hold, reboot 105 s; `nocuts` = off). It prints net (haul minus tax) and the gaps.

| knob | wave 8 | wave 9 |
|---|---|---|
| FC.acquire (stream delay) | 2.5 s | 2.0 s |
| FC.tax | 0.35 | 0.40 |
| sim wave cost | none | 40 s / crewmate / wave |

Result (24 seeds): careful net 839, average 759, sloppy 706, showman 640 per crew-day. **Careful vs sloppy +18.8 %** (wave 8: +0.8 %, 967 vs 959; cameras on loot with the old numbers: -5 %). Sloppy goes live 16x a day and reaches heat 70 on 94 % of days; careful cuts about 1.8 cameras a day and goes live 0.7x. Showman (walks big scrap through a cone on purpose) nets -24 % vs careful in money, in exchange for the sponsor tips / hype tier / highlight clip (not in the sim): a real choice when the quota is safe, a mistake when it is not. Average (crouches, never waits or cuts) sits about 10 % below careful.

Tax alone could not open the gap (careful is 20 % slower): the gap comes from cameras standing where the money is (sloppy crews must loot inside cones, so nearly every trip is TAGGED), a shorter stream delay for people who stand in a cone, and creature waves costing time.

## Known gaps
- Not run in a browser. The hold has no progress bar, only the interactable label percentage and toasts.
- The sim models spray as absent (it is the quiet 40 s option for a room you only pass through) and creature waves as time loss only.
- The "blind route" guarantee is envelope-based (ignores doors / props); the real line of sight can only make more room blind.
- Host migration mid-hold drops the hold (the player presses again). Cut timers are re-based by the existing hostMigrated handler.
