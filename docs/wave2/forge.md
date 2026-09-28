# Wave 2 - HQ FORGE, ascension, shards, creature tiers (module `forge`)

Design: `docs/MASTERPLAN.md` section 12 / row 24. Module `forge` (`this.useModule('forge', installForge)`), dev port 5257.
Numbers live in ONE pure file, `src/game/enhance.js` (node-tested by `tools/harness/forge_rules.test.mjs`).

## Files (new)
| File | Role |
|---|---|
| `src/game/enhance.js` | pure rules: +1..+9 table, fail rules, Backup Drive, overclocks, ascension odds, shards + exchange, creature tier table / caps / drops, `ForgeRng` (seeded, logged, forceable) |
| `src/game/forge.js` | install: item registration (6 shards + Backup Drive), HQ stations, host handlers, overclock effects, client sequence, translations (EN + TR) |
| `src/game/creature_tiers.js` | host tier roll + drops + damage wrapper, client aura / nameplate / tint |
| `src/models/forge.js` | THE MONETIZER, Ascension Altar, Shard Exchange, shard + Backup Drive models |
| `src/ui/panels/forge.js` | CRT panel: ENHANCE / ASCEND / EXCHANGE tabs |
| `src/render/weaponglow.js` | +3 / +5 / +7 / +9 weapon glow (shell + shared camo shader + sparks / trail), no lights |
| `tools/harness/forge_rules.test.mjs`, `tools/harness/wave2_forge.js` | node rules test / browser proof (feature script written but NOT run: browser budget was cut) |

## How it plays
HQ (0-Algorithm HQ, left of the sell counter): **THE MONETIZER** (E: enhance), **Ascension Altar** (E: tier up), **Shard Exchange** (E: 5 low shards -> 1 higher, or a Backup Drive for 3 Data Crystals).
Pick an item from hotbar / bag in the panel, ENHANCE. The host pays the cost, rolls, and every peer plays the sequence: machine shake, lamp chase, accelerating drum-roll beeps,
The Algorithm line (`game.lore.say`), then jackpot fanfare + sparks (success) or buzz + power-down + shake (fail); big result text for whoever is near.
Names show `+7 Katana ⚡`; the inventory tooltip shows the Forge row and each overclock; the hotbar name too.

| Level | chance | fail | cost | bonus |
|---|---|---|---|---|
| +1 / +2 | 100 % | - | 20 / 35 + 2 / 3 Scrap Shard | +6 / +12 % |
| +3 / +4 | 95 / 85 % | stays | 55 / 80 + 2 / 3 Circuit Core | +18 / +24 % |
| +5 | 70 % | stays | 120 + 2 Data Crystal | +31 % + Overclock socket 1 |
| +6 / +7 | 55 / 40 % | -1 | 170 + 3 Data Crystal / 240 + 2 Ecto Core | +38 / +46 % |
| +8 / +9 | 30 / 20 % | -1 | 330 + 2 Algorithm Fragment / 450 + 1 Source Code | +55 / +65 % (+9: socket 2) |

"Fail -1" applies to a failed attempt AT +6 and above (a failed +6 attempt drops +5 -> +4). Backup Drive: ticked in the panel, consumed only when it actually prevents a drop.
Sockets close again when a level drop goes below +9 / +5. Overclock (weapons only, random, no duplicates): Shock (chain 2 targets x35 %), Burn (30 %/s for 4 s), Freeze (x0.55 speed 3 s),
Void (+25 % true damage ignoring affix armour), Vamp (6 % lifesteal, max 6/hit), Viral (killed enemies burst, 4 m). Armour / trinkets get the same stat multiplier (`equipBonuses`) but no overclocks.
**Ascension**: cost = 3 (Source Code: 2) shards of the TARGET tier + credits (50 / 120 / 300 / 700 / 1600); odds 90 / 75 / 55 / 35 / 15 %, +10 % with a spare of the same item sacrificed; failure keeps the tier.
The workbench tier-up is capped at Rare (`upgradeInfo` returns null above it, `hostUpgrade` explains why, and the swap now keeps +N / overclocks).

## Shards
`shard_scrap` (common) / `shard_circuit` / `shard_crystal` (Data Crystal; crafting's `comp_crystal` counts too) / `shard_ecto` / `shard_algo` / `shard_source`, `kind:'component'`, weight 0.3 (1x1 in bags), procedural models + icons, sellable.
Sources: creature kills by tier (cumulative 40 / 30 / 30 / 25 / 30 / 25 %, bosses guarantee 1 of their tier + 3 scrap), chests (`rollChestLoot`: ~28-50 % of chest components are shards, never Source Code),
dismantle (always 1-2 Scrap Shards, a Circuit Core from electronics / valuables), Shard Exchange, Backup Drive from Rare+ kills (4-12 %).

## Creature tiers
Rolled by the host in `CreatureManager.hostSpawn` with `tiers.rollTier` luck = quota x 0.02 + threat x 0.002 + (moon tier - 1) x 0.04 (max 0.5), capped: quota 0-1 Uncommon, 2-3 Rare, 4-5 Legendary, Mythic from sector 6 or Threat >= 75.
Bosses are fixed (Foreman Legendary, Legacy Bot Mythic, no stat change). Only killable living creatures roll (no hazards, unkillables, summons).
No double counting: HP = level stats x `balance.scale.hp` (existing) x tier mul (HostCreature constructor); damage = base x tier mul BEFORE `balance.hitDamage` (sector scale + early hit cap still apply); XP x tier xp mul.
Mul 1 / 1.25 / 1.6 / 2.1 / 2.8 / 4; Epic+ use the existing elite-affix system (1 / 2 / 3 affixes: the primary via `rollAffix`, extras `paywalled` (-30 % damage taken) and `evergreen` (2 %/s regen) from the forge).
Client: tier colour on the scan label, floating nameplate (Uncommon+, HP bar Legendary+), additive floor ring (Rare+), body tint + rising particles (Epic+), Mythic spawn announcement + Algorithm line.
Rare+ creatures' own drop item rolls at least tier-1 (`hostSpawn opts.minTier`), plus a 35 % extra loot piece.

## Net (all prefixed `fg`, one handler each; `fgit` / `fgres` are HOST_ONLY)
client -> host: `fgenh {id, backup}`, `fgasc {id, sac}`, `fgexc {op:'up'|'backup', shard}`. host -> all: `fgit {id, pl, oc, tr}` (item state), `fgres {k:'enh'|'asc'|'exc'|'err'|'heal'|'fx'}`.
Item fields `it.plus` / `it.oc` ride the `sp` event (`pl`, `oc`), `serialize()` (late join) and `saveFields` / `loadFields` (run save). Creature `tr` / `fa` ride `sp` + `serializeFor`.

## Shared-file hooks (all marked `[forge]`)
`game/game.js` (import + useModule slot) - `game/actions.js` (`tierDmg` x plusMul; item / scan names; creature scan label tier colour) - `game/weapons.js` (`relMul` x plusMul: ranged + Stacked Deck) -
`game/inventory.js` (`saveFields` / `loadFields`, feed name) - `game/inventory_core.js` (`equipBonuses` x plusMul) - `game/loot.js` (`affixDisplayName(name, affix, it)`) - `ui/inventory_panel.js` (tooltip) - `ui/hud.js` (hotbar name) -
`entities/items.js` (`pl` / `oc` fields, spawn opts, serialize) - `entities/creatures.js` (constructor tier / HP / XP, hostSpawn roll + `tr` / `fa`, kill() drop floor, CreatureView fields) -
`game/crafting.js` + `game/recipes.js` + `ui/panels/crafting.js` (Rare cap, keep +N on swap, chest shards) - `game/research.js` (dismantle shards).
Wrapped on the instance (restored in `dispose`): `game.hostHurtPlayer`, `game.hostOnCreatureKilled`, `creatures.damage`, the host `'hit'` handler (overclocks; the swung weapon is the holder's held item).

## Test
```
node tools/harness/forge_rules.test.mjs
npm run build
flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5257 --script tools/harness/smoke_land.js
flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5257 --script tools/harness/wave2_forge.js   # not yet run
```
Console: `kefal.game.forge.open('enhance')` (needs the HQ map), `forge.debug.skipNear = true`, `forge.force(0.01, 0.5)` queues the next rolls, `forge.log` = last 120 rolls.

## Known issues / not done
- The browser feature script, the machine sequence and the glow shader were not run (budget cut); only the node rules test, `node --check`, build and one smoke.
- No catalyst items (overclock is random), no Dark Web sale of Backup Drives, SIEGE / raid Source Code sources are not wired (only Mythic kills and world bosses).
- Stations use absolute HQ coordinates next to the sell counter; check clipping with the slot machines by eye.
- Only two extra creature affixes come from the forge (paywalled, evergreen); Mythic = primary + both.
- The +7 / +9 camo replaces the weapon's textures with the shared shader (silhouette stays readable); the first-person viewmodel uses the same object.
