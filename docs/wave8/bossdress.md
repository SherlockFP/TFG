# Boss dress + themed big valuables (wave 8 night)

Follow-ups from `herocontent.md` "not done". Polish only: no new boss models, no new AI, no new systems.

## 1. Themed sector bosses (`bossdress_core.js`, `bossdress.js`, `bossdress_text.js`)
The eight themes that borrow a boss (`BOSS_TABLE` aliases) now hold a themed COPY (`themed: true`): same `id`, hp, dmg, rank, kit, model, trophy; own name, title, intro, accent, tint.

| theme | base boss | name | title | intro |
|---|---|---|---|---|
| metro | Host | The Last Conductor | Final Call | All aboard. This train has no last stop. |
| greenhouse | Surgeon | The Pruner | Elective Trimming | Everything grows back. Eventually. Mostly you. |
| prison | Foreman | The Warden | Lockdown Protocol | Count off. The count is always one short. |
| tower | Middle Manager | The Chief Synergy Officer | Mandatory All-Hands | Circling back on your performance. Live. |
| influencer | Host | The Concierge | Your Stay Is Sponsored | Please enjoy your stay. Please do not leave a review. |
| museum | Host | The Curator | Do Not Touch the Exhibits | Every exhibit was once a visitor. |
| academy | Middle Manager | The Principal | Detention Is Permanent | Report to the office. There is no office. |
| colddata | Load Balancer | The Cold Balancer | Cold Storage Routing | Your request is queued. Estimated wait: forever. |

- UI: `game.bossDress.infoOf(type)` (only when `type` is the boss of the CURRENT theme, so the legacy bot / key holders / raids stay untouched). `cycle_bossfx.js`: name card shows the themed name + title + a new intro line (`.cy-card-intro`), the HP bar the themed name; `cycle_inst.js` announce uses it too.
- Trophies / roster (`BOSS_NAMES`, `bossBase`, trophy item names) still use the base boss names (`themed` entries are filtered / come later in the table).
- Lair dressing, every peer, no net messages: the arena room is `planContent(layout).bossRoom` (deterministic), the state is `run.cycle.live` (`k` core|gate, `boss`). Four prop sets in the arena corners (facing the centre) + a floor ring, ALL in the one unlit accent colour (MeshBasicMaterial, no THREE light, no physics). Recipes: platform / lounge / gallery / potting / cells / boardroom / classroom / coldrack (6-20 primitives each).
- Boss tint: `model.setTint(accent)` (emissive + eyes) on the boss view; the two kit bosses (Middle Manager, Load Balancer: `setTint` is a no-op) get a 30 % colour lerp on their own materials.

## 2. Themed big valuables (`herocontent_core.js`, models `artpass.js` `hb_*`)
Eight new `kind: 'big'` items (physics grab with LMB, `hands: 0` like vase/server: the grab is already the two-handed slow carry; body sized from the model box). Values sit on the existing scale.

| id | name | value | mass | fragile | tables |
|---|---|---|---|---|---|
| hb_turnstile | Turnstile Gate | 130-210 | 34 | 0.4 | metro |
| hb_ticketkiosk | Ticket Kiosk | 170-270 | 46 | 0.5 | metro |
| hb_planter | Giant Planter | 100-180 | 22 | 0.9 | greenhouse, academy |
| hb_terrarium | Seed Terrarium | 150-250 | 26 | 1.0 | greenhouse, museum |
| hb_locker | Evidence Locker | 170-280 | 52 | 0.3 | prison |
| hb_searchlight | Yard Searchlight | 140-230 | 30 | 0.6 | prison |
| hb_bust | Founder's Bust | 200-320 | 40 | 0.5 | tower, influencer, academy, museum |
| hb_safe | Executive Safe | 190-300 | 60 | 0.25 | tower, colddata |

`BIG_TABLES` now exist for metro, greenhouse, prison, tower and the four boss-alias themes (influencer, academy, museum, colddata). Mean big value per table: metro 174, greenhouse 163, prison 201, tower 189, influencer 182, academy 167, museum 198, colddata 203 (default mix 181, existing themes 163-206).
`node tools/sim/economy.mjs --modes-only --runs 60`: 4 competent Standard median 7 quotas, mean 6.4 (was 6.5), early comfort OK. The sim now also lists the four boss-alias themes (`BIG_THEMES`).
Names / tips EN/TR/RU in `herocontent_text.js`; icons render from the models via the existing `herocontent` item-model hook.

## Tests
`node tools/harness/bossdress.test.mjs` (new), plus herocontent, carry2, artpass, repomaps, labyrinths, routeboard, cycle2_flow, cycle2_bosses, cycle2_i18n, cycle2_plan, cycle3, `npm run build`.

## Known gaps
No browser run (the lead's headless run holds the lock): prop scale / clearance in real arenas (props sit 1.6 m inside the room walls, may clip a pillar), the visual strength of the tint and the size of the eight big models are only checked by bounding boxes.
