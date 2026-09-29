# Wave 8: MAPMODS (Path-of-Exile-style affixes on landings)

Files: `src/game/mapmods_core.js` (pure rules, node-tested), `src/game/mapmods.js` (glue, `this.useModule('mapmods', installMapmods)`),
`src/game/mapmods_i18n.js` (TR + RU), `tools/harness/mapmods.test.mjs`. Net types: `mmq` (client to host request `{op:'reroll'|'add'}`), `mm` (host to client reply `{s, v, err}`).

## What it does
- Every landing on a real moon carries a **map** `{ r: rarity, a: [affix ids] }`: Normal (0 affixes), Magic (1-2), Rare (3). Max 2 prefixes + 2 suffixes, no duplicates.
  Odds by quota index q: Rare = 0 below q2, then `0.06 + 0.035 (q-2)` capped at 35 %; Magic = `0.26 + 0.04 q` capped at 50 %.
- Rolled **when the ship reaches orbit** (`run.mm.nxt`, seeded from runId + day + a counter, so no Math.random) so the crew sees tomorrow's landing on the terminal and can act on it.
  The lever moves it to `run.mm.cur`. Company HQ / homeworld landings keep it for the next real moon. `run.mm` rides broadcastRun, welcome and saves.
- **Affixes** (prefix = danger, suffix = environment; reward = [loot quantity %, scrap value %]; `minQ` = first quota index it can roll):

| Affix | Effect | Reward | minQ |
|---|---|---|---|
| Infested (P) | dangerMul x1.2 (creature budget) | 8 / 12 | 1 |
| Overclocked (P) | creatures +15 % speed (balance speed cap still applies) | 0 / 20 | 2 |
| Volatile (P) | 15 % of dropped scrap beeps, then pops: 22 dmg via `capOne`, radius 3.2, max 6 per day, pick it up in time to defuse | 5 / 15 | 1 |
| Watched (P) | Clout x1.4, danger x1.06 | 0 / 8 | 0 |
| Ruthless (P) | elites +12 % | 0 / 18 | 3 |
| Swarming (P) | +2 bot packs indoors | 6 / 8 | 1 |
| Hoarder (P) | extra scrap (about one more loot room), danger x1.1 | 25 / 0 | 0 |
| of Silence (S) | Listener hearing x1.5 | 0 / 10 | 1 |
| of Darkness (S) | interior starts dark (blackout, fuse box restores) | 5 / 20 | 1 |
| of Echoes (S) | all creatures detect 20 % farther | 5 / 10 | 2 |
| of Draining (S) | batteries drain 33 % faster | 0 / 8 | 0 |
| of Static (S) | scanner range -30 % | 0 / 8 | 0 |
| of Fatigue (S) | stamina regen -30 % | 0 / 6 | 0 |

- Reward maths: quantity adds up to `extraScrap = qty/40` (only when total >= 10 %), value % multiplies `valueMul`. Total dangerMul is capped at 1.5.
- Wiring: numeric effects are merged into `run.dailyEvent` by wrapping `hostSetPhase('landing')` (name / desc of the day event stay, so HUD and EVENTS show the real numbers).
  Flag effects are instance wraps (`CreatureManager.detectMul/speedMul`, `ItemManager.onEvent`), removed on dispose. Balance (wave 8): no affix touches damage numbers,
  the Volatile blast is 22 (inside the 45 % quota 0-1 hit cap), nasty ones are gated by minQ.

## Sector Map (the map device)
Item `sectormap`, 200 credits (110 before the econ8 pass, see econ8.md), store category Consumables (shop data-driven), sits in the ship storage or your hands. On the ship terminal (orbit only, host-authoritative):
- `ATLAS` (or `AFFIX`): readout of tomorrow's map: title (prefixes + moon + suffixes), each affix with its reward, total reward, maps aboard. `MOON` prints it too.
- `ATLAS REROLL`: consumes a map, rerolls the whole set (chaos orb: can get worse).
- `ATLAS ADD`: consumes a map, adds one affix (exalted orb), max 3.
Every use is announced to the crew in chat. Holding the map and pressing use points at the terminal.

## UI
No permanent widget. A compact `tfg-card` (plate + rarity tag, title, one row per affix with its reward, hazard stripe) shows at top centre for 9 s when the ship lands and fades. Nothing shows for a Normal map.

## Test
`node tools/harness/mapmods.test.mjs` (49 checks: determinism, gating, structure, danger cap, i18n coverage, fake-game landing merge, REROLL consumption, orbit-only, HQ keeps the map).

## Knobs
`AFFIXES` table and `rarityOdds()` in `mapmods_core.js`; `DANGER_CAP`; `BOOM_*` constants in `mapmods.js`; Sector Map price in `registerMapItem()`.

## Known gaps
- Not run in a browser (shared browser lock was jammed): landing card layout, two-peer ATLAS flow and the Volatile timing are unchecked.
- Not wired (no clean hook): Flooded (slow water in low rooms), Barricaded (extra locked doors could soft-lock the key route), Watched hype x1.5 / more cameras (algo2 hype has no multiplier knob; Watched pays Clout instead).
- Sector Map is buyable only (no crafting recipe).
- Chat lines (landing announce, reroll notices) show English affix names inside the title; the terminal readout and the landing card are translated.
