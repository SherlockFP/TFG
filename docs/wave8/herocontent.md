# Hero content: labyrinth scrap tables + themed sector bosses (wave 8 night)

The campaign starts on 56K-Dialup (factory), 88-Chatroom (metro) and E9-Estate (influencer mansion), and the labyrinth interiors (metro, greenhouse, prison, tower)
had no scrap table of their own: `scrapTableFor()` returned the factory mix, so the route board payout, the loot and the sector cores all looked like a factory.

## 1. Scrap tables (`src/game/herocontent_core.js`, module `herocontent`)
Each theme has 8-10 SIGNATURE entries (new items first, then existing models that fit) plus a FILLER list of general junk, merged by `heroTable(theme)`.
Registered at import (so every module that walks `SCRAP_TABLE`, and the route board, sees them) and again from `installHerocontent` (so names and tips follow the chosen language).

| theme | moon | new items (value) | reused models |
|---|---|---|---|
| metro | 88-Chatroom | Transit Card Reader 28-58, Rail Spike 12-26, Conductor's Lantern 58-108, Lost-and-Found Bag 18-90 | pager, flip phone, headset, stop sign, CD spindle |
| greenhouse | 12-Forum | Grow Lamp 44-92, Seed Vault Canister 78-142, Bonsai 58-116 (fragile) | flask, pot, pickles, bottles, magnifier, perfume, lava lamp |
| prison | 666-Creepypasta | Contraband Phone 34-72, Warden's Keyring 38-78, Riot Shield 82-146 (2 hands, 14 lb) | flip phone, pager, stop sign, skull, teeth, airhorn, chain letter |
| tower | 1991-Panelka | Brass Elevator Dial 72-132, Executive Nameplate 50-104 | trophy, like trophy, gold bar, perfume, register, painting, lamp, bell |

- Models: `src/models/artpass.js` (`hc_*` ids, Kit-merged, base on the floor, no lights, emissive parts are unlit materials). Inventory icons render from them.
- EN/TR/RU names and tips: `herocontent_text.js` (registered at import).
- No network messages, no new light or physics objects.

## 2. Economy (docs/wave8/econ8.md)
Mean item value per table (sim `tableAvg`, factory 47.3): metro 47.0, greenhouse 49.8, prison 47.6, tower 55.6. The tower is a little rich on purpose (unlocks at quota 3,
its elevator already trades depth for noise), the others sit on the factory mix, so the flavour changes and the quota curve does not.
`tools/sim/economy.mjs` used to map every non-listed interior to `factory`; it now lists the four hero themes too (`HERO_THEMES`).
`node tools/sim/economy.mjs --modes-only --runs 60`: 4 competent Standard median 7 quotas, mean 6.5 (unchanged vs. before), early comfort at q0-2 identical, OK.

## 3. Route board payout
`routeboard.js` already read `scrapTableFor(theme)`; it now also imports `herocontent_core.js`, so the estimate uses the new tables even where the module has not installed.
Test: the payout of 88-Chatroom, 12-Forum and 666-Creepypasta differs from the factory fallback.

## 4. Themed sector bosses (`src/game/cycle_core.js`, `BOSS_TABLE` aliases)
No new boss models: every theme without its own boss now points at the most fitting existing one (same id, kit, trophy, HP, names, translations).

| theme | boss | why |
|---|---|---|
| metro | The Host | the station host of a ghost train: blinks behind you the moment you look away |
| greenhouse | The Head Surgeon | the head gardener: elective pruning, drags the weakest patient onto the potting table |
| prison | The Foreman | the warden: "Site Supervisor" with a shift schedule (also the old fallback, now on purpose) |
| tower | Middle Manager | the Synergy Enforcer: mandatory meetings, paper shields |
| influencer (E9-Estate) | The Host | Welcome, Guest |
| academy | Middle Manager | the principal: detention as a meeting |
| museum | The Host | the curator: the exhibits move when nobody looks |
| colddata | The Load Balancer | routes the damage through frozen nodes |

`bossFor(theme)` now returns the real theme (was `'factory'` for unknown themes; unknown/mod themes still fall back to the Foreman).
`cycle2_flow`: the sampled 8 themes give 8 distinct bosses again; the threshold is back to 7 (was lowered to 6 for the wave-8 interiors).

## Tests
`node tools/harness/herocontent.test.mjs` (tables, defs, EN/TR/RU, models, economy band, boss mapping, payout), plus labyrinths, repomaps, routeboard, cycle2_flow, cycle2_bosses,
artpass, cycle2_i18n, cycle2_plan, cycle3, `economy.mjs --modes-only --runs 60`, `npm run build`.

## Known gaps
Not looked at in a browser (no run allowed): model proportions come from bounding boxes only. Mapped bosses keep their own lair mechanics (no per-theme lair dressing, no per-theme name such as "Conductor").
Big physics valuables of the four themes still use the default `BIG_TABLE`.
