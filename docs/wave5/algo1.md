# Wave 5 - algo1: the Algorithm learns you, the Morning Vote, LIVE viewers

Module `algo1` (`src/game/algo1.js` glue, `algo1_core.js` pure rules, `algo1_i18n.js` EN/TR/RU). Installed in `game.js` at `[import:algo1]` / `[slot:algo1]` (after maps5). MASTERPLAN §21, §23.2, §23.3, §23.4.

## What it does
1. **Learns you (host).** Every 0.5 s of a facility day it records: time per wing relative to the entrance (`L` / `C` / `R`, +-7 m), moving vs sprinting time, deaths (cause + wing) and "near-death escapes" (hp <= 25, back above 35 six seconds later). When the ship returns to orbit it picks ONE counter for the next landing (`chooseCounter`):
   `mercy` (>= 3 deaths or >= 3 near-deaths: creature budget x0.9 that day) > `cause` (>= 2 deaths to the same creature: +1 of it) > `sprint` (sprint ratio >= 0.42 over >= 40 s moving: +1 `listener`) > `route` (>= 50 % of >= 45 s indoors on one wing: +1 creature on that wing).
   Caps: quota 0 never; ONE extra creature, power <= 2, from the moon's own spawn table (or the listener), placed >= 14 m from every player, >= 12 m from the entrance on the favourite wing, honouring `hostEarlySafeFilter`. One intercom line ~5 s after the moon is populated, only if something was really added. Counter-play: change habits and next landing it reacts to the new ones.
2. **Morning vote.** In orbit, 4 s after the day starts (once per `runId:day`, not for the Company moon), the host offers 3 cards from `RULES` (10 cards; quota 0 offers only the `safe` ones; yesterday's debt is not re-offered). Keys 1/2/3 or click, 15 s, closes early when everyone alive voted or when the lever is pulled. Ties / no votes: the Algorithm picks among the leaders (seeded RNG) with a snarky line. The winner applies to the next landing; the losing card with most votes becomes **debt** (`run.a1.debt`), applied the next day at half strength (multiplicative knobs scale toward 1 by 0.5; `blackout` is skipped at half strength). Real knobs: creature budget + loot value (patched into `run.dailyEvent` during `hostPopulateMoon`), day length (`config.dayLengthSec`, restored in orbit), creature speed (`creatures.speedMul` wrapper), jump + stamina regen (`stats` hook on every peer), blackout (`hostSetPower(false)` after populate).
3. **LIVE viewers.** The existing intercom `.algo-live` label shows `● LIVE  1.2K`. Host events: death, near-death escape, sprinting >= 3 s with a chasing creature within 9 m, boss hp drops, a vote. Each grows the count by a share of itself (min +25); it decays back to 120. Every peer emits `mods.emit('tfg:viewers', { viewers, delta, reason }, game)` on each update. Cosmetic only in v1.

## Net (prefix `a1`)
`a1req` client -> host `{op:'vote', i}`; `a1s` host -> everyone `{k:'open'|'tally'|'result'|'say'|'view', ...}` (lines are sent as English keys + vars, each peer translates). State: `run.a1 = { debt, today }` (host).

## How to test
- `node tools/harness/algo1.test.mjs` (tracker maths, counter priority + caps + quota-0 guard, vote tally / ties / debt / half strength, viewer model, TR + RU coverage).
- `tools/harness/wave5_algo1.js` (headless body: opens the vote, presses `2`, checks the rule, bumps viewers, lands with a pending route counter). Written, NOT run (shared browser lock was busy > 5 min).
- Debug: `game.algo1.debug.openVote()`, `.closeVote()`, `.profile()`, `.pending()`; `game.algo1.bump('escape')`; `game.algo1.fx()`.
- Knobs: `T` and `RULES` in `algo1_core.js`; `game.config.algo1 = false` disables everything.

## Known gaps
- Not hand-played or browser-run; the vote panel is fixed top-centre (`.a1-vote`) and needs a 1280x720 look. In orbit the pointer is usually locked, so keys 1/2/3 are the real input, click works only with a free cursor.
- The active rule lives in `run.a1.today` (broadcast with the run), so late joiners and a migrated host apply jump / stamina / creature knobs from it; `run.a1` is sanitised on read. Host migration still drops `S.pend` / an open vote.
- Rules do not cover fog / weather, shrine counts or elites; "silent but fast creatures" is approximated as fewer + faster creatures.
- Viewers are not saved and do not reward anything yet (listen to `tfg:viewers`).
- The Algorithm only adds creatures; it does not yet pre-place traps or change loot on the favourite route.
