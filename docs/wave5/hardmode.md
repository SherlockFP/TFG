# Wave 5 - HARDMODE (difficulty setting, MASTERPLAN 25.4)

Status: node-tested (`hardmode_rules` 315 checks, `hardmode_install` 63 checks, +7 stove/campfire/stamp checks in `survival_install`, real `shop.stockFor` / `enhance` / `survival_store` / `progression` in the rules test) + `tools/sim/economy.mjs` + `npm run build`.
NOT run in a browser (owner rule for this task), NOT hand-played, NOT tested with 2 players.

## What
ONE lobby setting: **Casual / Standard (default) / Hard**, picked on the Host screen ("Difficulty", remembered in `settings.difficulty`), stored in `game.config.difficulty`
(goes to clients in the `welcome` config, so joiners and a migrated host see the same mode). All numbers live in ONE table, `src/game/difficulty.js` (`TABLE`, frozen):

- **Casual** = the values the game had before wave 5 (nothing changes).
- **Standard** = the MASTERPLAN 25.4 table.
- **Hard** = the same rules one notch harder.
- **Early game stays comfortable in every mode:** all pressure rules only apply from quota INDEX 3 (`FROM_QUOTA`); `eff(q)` returns the Casual rule set for q 0-2.
  The sim proves it: sold/quota at q0-q2 is identical in the three modes.

| 25.4 row | rule | Standard | Hard | hook (all tiny, read `difficulty.js`) |
|---|---|---|---|---|
| Loot value | scrap value curve after quota 3 | x0.8 | x0.7 | `progression.scrapValueMul` (every scrap spawner uses it) |
| Carry | heavier weight penalty | `1 - (w-10)/220`, floor 0.55 | `1 - (w-8)/180`, floor 0.5 | `localplayer.js` weightMul (old: /260, floor 0.6) |
| Quota | growth scaled by performance | growth x1..1.15 (full at +60% surplus), Algorithm says so | x1..1.3 | `host.js hostEvaluateQuota` -> `game.hmGrowth` |
| Ship door | lock warning + late crew stay outside | 90 s (HUD countdown + sys lines at 90/60/30/10 s); late crew survive, lose carried scrap, return at 50% HP next morning, no fine | 120 s, 30% HP | `host.js hostFinishTakeoff` -> `game.hmStrand`; client hovers during takeoff (no void fall) and is put back in the ship + hurt at orbit |
| Death | carried loot stays where they fell | (already true in `actions.js die()`: hotbar + bag + gear drop on the spot) + a notice "X dropped ▮N of loot where they fell" | same | `hardmode.js` wraps `hostOnPlayerDied` |
| Creature AI | some close doors / cut lights after quota 3 | stalker/lurker/mimic/NPC/editor/moderator/support/reply guy close an open door near a player every ~50 s; lurker/stalker/editor cut the facility power ~12 s every ~130 s (secure doors re-closed after) | every ~32 s / ~85 s, 16 s | `hardmode.js` (host tick; never on someone standing in the doorway, 25 s calm after landing, no stacking on a Director blackout) |
| Food | spoils after 3 days | cooked dishes lose 60% of their heal after 3 days; **crates are cold storage** (records do not age) | 75% | `survival.js hostCook` stamps the dish, `hardmode.js` checks every morning |
| Stove | single station | one cook at a time on the ship stove ("The stove is busy.") | + campfires only warm, they no longer cook | `survival.js hostCook` |
| Crates | capacity limits respected | 5 crates per place (was 6); grids unchanged | 4 | `survival_store.placeReject` |
| Traps / turrets | price rises with daily use | each trap/turret kit bought TODAY (any kind) adds +10% to the next one, cap x1.8; one order of n kits is priced step by step | +18%, cap x2.5 | `shop.stockFor` + `hostBuy` (`run.shop.sold`, resets every day) |
| Turrets | consume ammo | ammo turret burns 1.5 ammo per shot (was 1), battery/generator turrets draw x1.25 | x2 / x1.5 | `deployables.js` simTurret |
| Forge | failures drop a level (never break), protection = rare drop | see "Forge note" | drop from +5, Backup Drive cannot be crafted | `enhance.js` (`forgeFailFrom`, `backupCost`), `forge.js hostExchange`, forge panel |

### Forge note (the table did not match the code)
MASTERPLAN 25.4 lists the forge as "flat risk up to +9", but the code already had: a failed attempt at +6 or higher drops ONE level (never breaks), and the **Backup Drive**
(the "protection scroll": craftable at the Shard Exchange for 3 Data Crystals AND a rare creature drop, `creature_tiers.js`) prevents it. `forge_rules.test.mjs` pins that
behaviour, so **Casual keeps it exactly**. Standard: same drop rule, but the drive costs 2x shards to craft (drops unchanged). Hard: the drop starts at +5 and drives can only be
found (rare drops), not built. If you want the literal "drop only above +7" of the table, change `forgeFailFrom` in `difficulty.js` (Standard 8) and the constant in the test.

## Files
- `src/game/difficulty.js` - the table + pure helpers (`eff`, `lootValueMul`, `weightMul`, `quotaGrowthMul`, `lockWarnSec`, `strandRule`, `creatureTricks`, `spoilDays`, `priceMul`, `trapUnitPrice`, `ammoMul`, `forgeFailFrom`, ...). No imports. Ambient `setMode/setQuota` (kept in sync every frame by the module).
- `src/game/hardmode.js` (+ `hardmode_i18n.js`, EN/TR/RU) - `installHardmode`: config sync, lock warning + HUD, stranded crew, growth + strand hooks for host.js, creature tricks, food spoilage, death notice. `game.hardmode = { stamp, spoilCheck, mode(), set(mode), debug }`.
- Shared-file edits (one line each): `progression.js`, `entities/localplayer.js`, `host.js` (3 spots), `shop.js`, `deployables.js`, `survival.js`, `survival_store.js`, `enhance.js`, `forge.js`, `ui/panels/forge.js`, `ui/ui.js` (host screen select), `game.js` (import + slot).
- Net: ONE new message type `hms` (host -> everyone `{k:'lock'|'strand'|'say'}`). No new requests.

## How to test
```
node tools/harness/hardmode_rules.test.mjs      # table, casual == old numbers, early game untouched, every rule, real shop/forge/crate/quota code
node tools/harness/hardmode_install.test.mjs    # stub game: lock warning, strand, growth, door/light tricks, spoilage, death notice, dispose
node tools/sim/economy.mjs --modes-only --runs 200     # the three modes side by side (below); full report: --mode casual|standard|hard
node tools/harness/forge_rules.test.mjs         # unchanged, still green (Casual/Standard forge = the old rule)
```
Manual (later): Host screen -> Difficulty; `kefal.game.hardmode.set('hard')` in the console; set `run.quotaIndex = 3` and land: rules line in chat, door/light tricks after 25 s, lock countdown 90 s before midnight.

## Economy sim summary (`node tools/sim/economy.mjs --modes-only --runs 200`, seed 1234567, same dice for every mode)
The sim uses the real `scrapValueMul`, `quotaGrowthMul`, `weightMul`; creature tricks / lock pressure / spoiling food are modelled as `sim.threatMul` / `sim.foodCapMul` in the table,
trap-price + ammo upkeep as `sim.upkeep x quota` credits per cycle. Not modelled: forge, stranding.

```
== DIFFICULTY MODES (Casual = the old numbers / Standard = MASTERPLAN 25.4 / Hard = one notch harder), runs/crew=200, same seeds per mode ==
rules from quota index 3 on; quota 0-2 use the casual numbers in every mode

q   | loot value x (real scrapValueMul) casual/standard/hard | carry speed x @ load 40 | growth x for +60% surplus
  0 | 1.000 / 1.000 / 1.000 | 0.885 / 0.885 / 0.885 | 1.00 / 1.00 / 1.00
  1 | 1.015 / 1.015 / 1.015 | 0.885 / 0.885 / 0.885 | 1.00 / 1.00 / 1.00
  2 | 1.030 / 1.030 / 1.030 | 0.885 / 0.885 / 0.885 | 1.00 / 1.00 / 1.00
  3 | 1.045 / 0.836 / 0.731 | 0.885 / 0.864 / 0.822 | 1.00 / 1.15 / 1.30
  4 | 1.060 / 0.848 / 0.742 | 0.885 / 0.864 / 0.822 | 1.00 / 1.15 / 1.30
  6 | 1.090 / 0.872 / 0.763 | 0.885 / 0.864 / 0.822 | 1.00 / 1.15 / 1.30
  8 | 1.120 / 0.896 / 0.784 | 0.885 / 0.864 / 0.822 | 1.00 / 1.15 / 1.30
 10 | 1.150 / 0.920 / 0.805 | 0.885 / 0.864 / 0.822 | 1.00 / 1.15 / 1.30
 14 | 1.210 / 0.968 / 0.847 | 0.885 / 0.864 / 0.822 | 1.00 / 1.15 / 1.30

crew        | mode     | quotas met p10 median p90 mean | run h | sold/quota at q0 q1 q2 (early comfort) | sold/quota q3 q6 | quota at q4 q6 | credits q3 q6 | fired before q3
4 average   | casual   |    3      7   8   6.5 |   4.9 |  21.9x  10.7x   6.5x |   4.6x   1.9x |   719  1301 |   9164  12456 | 9.5%
4 average   | standard |    3      6   8   5.8 |   4.5 |  21.9x  10.7x   6.5x |   3.5x   1.5x |   771  1437 |   8551   6295 | 9.5%
4 average   | hard     |    3      5   7   4.9 |   3.9 |  21.9x  10.7x   6.5x |   2.7x   0.9x |   825  1575 |   8146   7007 | 9.5%
4 competent | casual   |    5      9  10   8.1 |   6.0 |  32.5x  19.6x  10.0x |   6.0x   2.6x |   723  1302 |  14722  19321 | 8.0%
4 competent | standard |    4      8   9   7.0 |   5.3 |  32.5x  19.6x  10.0x |   4.6x   1.8x |   778  1445 |  13975  16486 | 8.0%
4 competent | hard     |    4      7   8   6.3 |   4.8 |  32.5x  19.6x  10.0x |   3.7x   1.8x |   832  1589 |  13465  12658 | 8.0%
2 great     | casual   |    7      8   9   8.1 |   6.0 |  33.4x  15.2x   9.3x |   6.7x   2.6x |   717  1292 |  15529  23800 | 3.5%
2 great     | standard |    6      7   9   7.2 |   5.4 |  33.4x  15.2x   9.3x |   5.0x   1.8x |   771  1432 |  14747  19882 | 3.5%
2 great     | hard     |    5      6   8   6.3 |   4.8 |  33.4x  15.2x   9.3x |   3.9x   0.8x |   825  1575 |  14176  12590 | 3.5%

headline (4 competent, vs Casual): standard: median quotas 8 (-1), mean 7.0 (-1.1), run 5.3 h (-0.7 h), quota at q6 1445 (1302 casual) | hard: median quotas 7 (-2), mean 6.3 (-1.8), run 4.8 h (-1.2 h), quota at q6 1589 (1302 casual)
early comfort check (4 average, sold/quota at q0-2 identical in all modes): OK
```

Reading it:
- Quota 0-2 identical in all modes (21x / 10x / 6x the quota for 4 average) - the "early gains are ~30x quota 0" finding from MASTERPLAN 25.4 is NOT touched (owner rule: early game stays comfortable); the pressure starts at quota 3.
- 4 competent crew: median quotas met 9 -> 8 (Standard) -> 7 (Hard), mean 8.1 -> 7.0 -> 6.3, run length -0.7 h / -1.2 h. Credits piled up at q6 drop 19.3k -> 16.5k -> 12.7k.
- The quota itself is a bit higher from quota 3 on (x1.15 / x1.3 growth for crews that overshoot): 4 competent, quota at q6 1302 -> 1445 -> 1589.
- Standard is a "one quota earlier" difficulty, not a wall: the weakest crews (2 average) still reach quota 5-6.

## Knobs
Everything in `TABLE` (`src/game/difficulty.js`): `lootMul`, `carry`, `growthMaxMul`/`growthFullAt`, `lockWarnSec`/`lockRepeatSec`, `strand*`, `doorEveryS`/`lightEveryS`/`lightSec`,
`spoilDays`/`spoilHealMul`, `stoveSingle`, `fireCooks`, `crateMax`, `priceStep`/`priceCap`, `ammoMul`/`drawMul`, `forgeFailFrom`/`forgeDriveCraft`/`forgeDriveMul`, `deathNotice`, `sim.*`. `FROM_QUOTA` moves the whole pressure start.
DOOR_CLOSERS / LIGHT_CUTTERS (creature ids) are exported from `hardmode.js`.

## Known gaps
- Not run in a browser: the HUD countdown, hover-while-stranded and the door/light tricks are only tested against stubs. The stranded player keeps gear but loses sellable scrap; if all crew are outside at midnight they are all stranded (no more "everyone dead -> all scrap lost"; Casual keeps the old rule).
- Death: the "ghost replay" (23.5) is wave 6; the drop itself was already there. A body that falls into the void still drops its loot below the map (not recovered).
- Food: a dish keeps its cook day (and spoiled flag) in the crate record (`sd` / `sp`), so taking it out and putting it back no longer resets the clock. Raw plants and potions never spoil. Saved dishes get their clock at the first morning check.
- Casual on an OLD save behaves exactly as before; Standard is the default for everyone, including existing lobbies (the host picks; joiners follow).
- The lobby browser shows the difficulty (`diff` in `hostAnnounce`).
- Creature tricks use `hostSetDoor` / `hostSetPower` (the cut opens blast doors like every blackout does; they are re-closed after the cut).
