# Wave 8 - REWARDVIZ: rewards you can see

Follows the "fun check" in `econ8.md` (invisible rewards). Module `src/game/rewardviz.js` + pure `rewardviz_core.js`, test `tools/harness/rewardviz.test.mjs`.

## What
1. **Day summary split by source** - one marked block "INCOME BY SOURCE" (own `.rv-sum`, separate from feedcams' Highlights line). Rows with glyphs: scrap, job pay, crate xN, pocket loot, MAP BONUS (collected x val / (100 + val), val from the current sector map), diner, ore, Clout; costs in red: casualty fine, job fee, viewer tax. Only rows with a value show; amounts count up (small rAF helper, the soul sale count-up is embedded in soul.js and untouched). Ledger is fed by the modules' own net messages through additive `net.on('msg:fjfx' | 'msg:rsmsg' | 'msg:ac2s' | 'msg:fcfx')`, so facjobs/resto/arcade2/feedcams are not edited. It is per client (the diner till only counts what you collected, arcade Clout only yours).
2. **Before it hurts** - lever: main facility job with zero progress and credits > 0 shows the prompt sub "Job not started: -25 fee"; the first [E] only arms it (toast + sound), a second [E] within 6 s takes off. Pickaxe prompt on ore: "ORE 120/240 today" (host broadcasts the tally in `mnd` `{k:'ore'}`). Homeworld arrival: toast "The diner made N while you were away" from `run.rs.till`.
3. **Scan chips** - `+19 % VALUE` on every scanned item when the current map has a value affix (via the `scanLabels` hook); cursed scrap shows `CURSED x1.6` (lcmonsters' own scan handler).
4. **Reward pop** - `game.rewardviz.pop(n)` / `reward(src, n)`: >= 100 credits (job pay, till collect) get the coin sound + a fly-up number, smaller stays quiet. Ore, Clout, fees and crates are booked silently.

## Net
`rvpk` host -> everyone `{id}` (HOST_ONLY): a backrooms pocket loot item id, so every client can value the pocket items that reached the ship at summary time. Also `mnd` gained `k:'ore'`.

## Knobs
`POP_MIN` 100, `ORE_CAP` display 240 (mining_core `MN.valueCap` is the real one), `WARN_SECS` 6 (rewardviz_core).

## Known gaps
Not browser-verified (lean mode). Viewer tax also appears in feedcams' own summary line, and scrap / casualty fine repeat the report's top rows on purpose (the block is the complete split). Pocket value counts pocket items held or inside the ship at summary time. Sale screen at the Company is unchanged (soul's count-up).
