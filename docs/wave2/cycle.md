# Sector cycle + endless mode (module `cycle`) - STATUS: pure rules done and tested, game glue NOT wired (off, inert)

Shipped: `src/game/cycle_core.js` (pure state machine, boss table + scaling, endless meter / patch notes / cash out, 14 mutators),
`tools/harness/cycle.test.mjs` (`node tools/harness/cycle.test.mjs`, 60+ checks incl. an exhaustive no-soft-lock search), inert
`src/game/cycle.js` (terminal `CYCLE` says it is off) installed via `useModule('cycle', installCycle)` in game.js (only the two slot lines changed).
NOT done: Sector Core moon/facility plan, boss fights (Load Balancer / Middle Manager / Hydra + elite stubs), boss HP bar / name cards,
host hooks (`hostEvaluateQuota`, `hostLever`, `hostFinishTakeoff`, `onSellResult` instance wrappers), endless glue + HUD, persistence + net (`cy*` types), RU strings.
Planned glue: keep `run.phase = 'moon'` on the core (no new phase), state in `run.cycle` (saved + synced by the generic run sync), core = `MOONS` entry (not `generated`) themed by `dominantInterior`.

## State machine (`step(cy, ev)`)
```
days --quotaMet--> gate --land--> core --coreEnd, boss dead--> days (sector+1, chest, first-kill flag; 3 cores -> PATCH 1.0 offer)
                                  core --coreEnd, no kill, 1st loss--> grace (1 no-quota day) --dayEnd--> gate
                                  core --coreEnd, no kill, 2nd loss--> days (sector+1, no chest, rep -12, SHAMEFUL EXIT)
```
Boss killed then wipe = win. Recall after 1800 s counts as a loss, key/puzzle auto-open after 720 s, a save loaded mid-core resumes at the gate: never a soft-lock.

## Numbers
- Boss HP = base x (1 + 0.35 x sector) x crew (1 / 1.6 / 2.1 / 2.5); 2nd phase from sector index 3; Legacy Bot every 5th sector; key cards 1 (2 from sector 1).
- Endless: meter 70/100, decay 10 + 1.8 x depth^0.9 per day (0 on relief days, every 5), sales fill it (unit = base quota x (1 + 0.09 x depth)), 0 = fired (cash-out halved).
- PATCH NOTES every 3 depths (14 mutators, max 8 active, 25% rollback, loot x1.08 per patch), S-rank gate roll (season finale every 10 depths),
  cash out clout 40 x depth^1.25, prestige star per 15 depths, local top-20 leaderboard.
