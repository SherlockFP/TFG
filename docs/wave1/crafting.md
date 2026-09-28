# Wave 1 - Crafting, components, research (module `crafting`)

Files: `src/game/components.js` (shared contract, tables) - `src/game/recipes.js` (recipes, crafted items, tier odds, weapon upgrades) -
`src/game/research.js` (strange items, analyze, dismantle table, blueprint state) - `src/game/crafting.js` (install: workbench, host
handlers, spawns, drops, crafted-item mechanics, terminal) - `src/ui/panels/crafting.js` (CRT panel) - `src/models/components.js`
(procedural models + the workbench mesh) - `tools/harness/wave1_crafting.js` (headless proof).

## How it works

* **Workbench**: procedural mesh in the ship (`game.ship.group`, -z wall, x 4.05: bench, drawer cabinet, vise, pegboard with tools, shelf,
  gooseneck lamp with emissive bulb + one light-pool emitter, fabricator monitor). Solid colliders; `[E]` = "Use WORKBENCH".
* **Host authoritative**: the client sends `craft {op: make|dismantle|analyze|upgrade}`; the host validates, consumes and spawns. Ingredients =
  items the requester holds (`it.holder === player`, hotbar AND bag) + world items lying on / in front of the bench. Results are spawned on the
  bench top (`hostSpawn(type, pos, { tier })`) and the requester gets a `modmsg {mod: 'crafting', k: 'crafted' | 'err' | ...}`.
* **Tier**: crafted results roll a tier with `tiers.js rollTier(rng, { luck, minTier, maxTier })`. The recipe defines the range, luck comes from
  `game.rpg?.bonus?.('craftLuck')`, `game.balance?.lootLuck?.() * 0.5`, `profile.skills.lck * 1.2%` and +2% per known blueprint (max +120%).
  `it.tier` is passed to `hostSpawn` opts and ALSO broadcast as `modmsg {k: 'tier'}` so every peer sets `it.tier` (until the inventory
  module syncs it itself). Melee damage of tiered weapons is scaled by `TIERS[tier].statMul / TIERS[baseTier].statMul` unless
  `game.inventory|balance|shop.appliesTierDamage` is truthy (then that module owns it).
* **Blueprints**: `profile.blueprints = { bp_id: timestamp }` (personal, permanent). The client includes its list in the request; the host trusts it
  (co-op). Unlocking shows a blue "BLUEPRINT UNLOCKED" banner.
* **Terminal**: `CRAFT` (list, READY / LOCKED) and `RECIPES <name>` (ingredients with have/need, tier odds).

## Soft interfaces (`game.crafting`)

| call | who | notes |
|---|---|---|
| `open(tab)` / `close()` | ui | workbench panel |
| `recipes()` | ui | resolved recipes; ones whose output / input id is not registered are **hidden**; `locked` = blueprint missing |
| `rollChestLoot(tier, rng, {theme}) -> [{type, tier, kind}]` | world agent (chests) | `tier` = chest quality `common..mythic`; deterministic (only `rng.next()`); `kind` = scrap/component/tool/weapon/bag/skillbook/strange |
| `dropComponents(pos, kind, n)` | world agent (trees/rocks), horde agent | HOST only (no-op elsewhere); `kind` = wood/metal/electronic/organic/arcane/random; returns item ids |
| `dismantle(itemId)` / `analyze(itemId)` / `upgrade(itemId)` / `craft(recipeId)` | ui, tests | client -> host requests (player must be within 7 m of the bench) |
| `gasProof()` | facilitysys | also sets `game.player.gasProof` every frame (Gas Mask worn = `on` in a hotbar slot) |
| `have(type)`, `status(recipe)`, `luck()`, `blueprints()`, `on(fn)` | ui | counts fall back to `game.inventory?.countItem(type)` if it exists |

Creature kills are hooked WITHOUT editing host.js: `game.hostOnCreatureKilled` is wrapped on the instance (restored on dispose). Set
`CREATURES[id].compDrop = { kind, chance, n }` to override a creature's drop, or `noCompDrop: true` to opt out (the horde agent's swarm bots
can just call `dropComponents` themselves and set `c.compDropped = true`).

## Components (ids are stable)

| id | name | value | tier | used for |
|---|---|---|---|---|
| comp_scrapmetal | Scrap Metal | 3-6 | common | almost everything (traps, bats, ammo, armor) |
| comp_wood | Wood Planks | 2-4 | common | bolts, tree drops |
| comp_cable | Copper Cable | 4-8 | common | lockpick, fuse, bags, batteries |
| comp_battery | Battery Cell | 6-12 | common | battery pack, floodlight, grenades |
| comp_fuse | Fuse | 5-10 | common | facility fuse boxes (facilitysys), boss drops |
| comp_circuit | Circuit Board | 8-16 | common | grenades, decoy, upgrades |
| comp_sensor | Sensor | 10-20 | common | booster, epic upgrades |
| comp_fuel | Fuel Canister | 8-14 | common | molotov |
| comp_coolant | Coolant | 8-14 | common | cryo grenade |
| comp_chem | Chemicals | 6-12 | common | medkits, glowsticks, ammo |
| comp_cloth | Cloth | 2-4 | common | medkits, bags, armor |
| comp_crystal | Data Crystal | 20-40 | rare | EMP, pro flashlight, epic+ upgrades, skillbooks |
| comp_ecto | Ectoplasm | 25-45 | epic | lantern, skillbooks, legendary+ upgrades |
| comp_accesscard | Access Card | 5 | key item | card copy |

## Recipes (30; hidden ones appear when the other modules register the item)

| recipe | cat | ingredients | result | tier range | blueprint |
|---|---|---|---|---|---|
| Medkit | survival | cloth 2, chem 1 | medkit | common-rare | - |
| Trauma Kit | survival | medkit, chem 1, cloth 2 | craft_traumakit (heals 100) | common-epic | - |
| Gas Mask | survival | cloth 2, chem 1, scrap 1 | craft_gasmask (`gasProof`) | common-rare | - |
| Glowstick Bundle | survival | chem 1, cloth 1 | glowstick x3 | - | - |
| Battery Pack | survival | battery 2, cable 1 | craft_batterypack (recharges all carried batteries) | common-rare | - |
| Duct-Tape Armor | gear | cloth 4, scrap 2 | first registered `armor` item | common-epic | - (hidden until armor exists) |
| Stun Grenade | combat | battery 1, circuit 1, scrap 1 | stungrenade | common-rare | - |
| Cryo Grenade | combat | coolant 2, scrap 1 | craft_cryo (freeze 5 m / 5 s) | common-rare | - |
| Molotov | combat | fuel 1, cloth 1 | craft_molotov x2 (fire zone 6 s) | common-rare | - |
| Bear Trap | combat | scrap 4, cable 1 | craft_trap (roots 6 s + 30 dmg) | common-rare | - |
| Noise Decoy | combat | battery 1, circuit 1, scrap 1 | craft_decoy (12 s of noise) | common-rare | - |
| EMP Charge | combat | circuit 2, battery 2, crystal 1 | craft_emp (machines off 20 s) | uncommon-epic | bp_emp |
| Nail Bat | combat | a bat, scrap 2 | nailbat / craft_nailbat | common-epic | - (hidden until a bat exists) |
| Shotgun Shells | combat | scrap 1, chem 1 | shells x3 | - | - |
| Rounds / Nails / Bolts | combat | scrap 1 (+chem / wood) | first registered ammo item x3 | - | - (hidden until registered) |
| Lockpicker | tools | scrap 2, cable 1 | lockpick | common-rare | - |
| Fuse | tools | scrap 1, cable 1 | comp_fuse x2 | - | - |
| Access Card Copy | tools | access card 1, circuit 1 | comp_accesscard x2 | - | bp_cards |
| Portable Floodlight | tools | battery 2, circuit 1, scrap 2 | craft_floodlight | common-rare | - |
| Pro Flashlight | tools | flashlight, circuit 1, battery 1, crystal 1 | proflash | uncommon-epic | - |
| Signal Booster | tools | sensor 1, circuit 1, battery 1 | booster | common-rare | - |
| Adblock Spray | tools | chem 2, cable 1, scrap 1 | adblock | common-rare | - |
| Belt Bag | gear | cloth 3, cable 1, scrap 1 | beltbag | common-epic | - |
| Field Pack | gear | cloth 6, cable 2, scrap 2, ▮30 | first registered "Field Pack" | common-epic | - (hidden until registered) |
| Hauler Frame | gear | cloth 8, scrap 6, circuit 2, ▮120 | first registered "Hauler" bag | uncommon-epic | bp_hauler |
| Ecto Lantern | arcane | ecto 1, crystal 1, cable 1, battery 1 | craft_lantern | rare-legendary | - |
| Skillbook Binding | arcane | crystal 1, ecto 1, cloth 2, ▮60 | random registered `skillbook_*` | rare-legendary | bp_binding |
| **Weapon upgrade** (UPGRADE tab) | - | see below | held weapon +1 tier | - | bp_masterwork for Legendary/Mythic |

Weapon upgrade (target tier -> cost; failure keeps the weapon, loses the parts and half the credits; luck adds up to +12% chance):

| to | parts | credits | success |
|---|---|---|---|
| Uncommon | scrap 2, cable 1 | 40 | 95% |
| Rare | scrap 3, circuit 1, battery 1 | 90 | 85% |
| Epic | circuit 2, sensor 1, crystal 1 | 220 | 65% |
| Legendary | crystal 2, ecto 1, circuit 2 | 520 | 40% (bp_masterwork) |
| Mythic | crystal 3, ecto 3, sensor 2 | 1100 | 20% (bp_masterwork) |

Crafted item mechanics (all in `crafting.js`): Battery Pack (LMB: refills every carried battery item), Trauma Kit (LMB: +100 HP),
Gas Mask (LMB toggles, screen vignette, `player.gasProof`), Molotov / Decoy / EMP / Cryo (LMB throws; the host arms a fuse and detonates),
Bear Trap (LMB sets it; host checks creatures within 1 m every 0.15 s), Floodlight / Ecto Lantern (`def.glow`, existing ItemTools lamp code).

## Dismantle / research (Sell / Analyze / Keep)

* **Dismantle** (`research.js dismantleYield`, deterministic): explicit rows (gpu, reactor, cryptocoin, usbidol, chainletter, skull, ...) else by
  family (metal / electronic / chem / cloth / arcane / creature drop): `n = clamp(1 + floor(weight/14) + floor(value/70), 1, 4 (big: 6))`
  entries cycled from the family list, +1 theme component when `n >= 3`, +1 crystal when value >= 150 (electronic / arcane). Not allowed:
  soulbound, bodies, components, fish, key items, strange items.
* **Analyze**: strange items (`def.strange`) and `drop` items. XP + blueprint (first time) or XP x0.6 + 2 crystals + 1 ectoplasm (already known).

| item | XP | blueprint |
|---|---|---|
| Black Box | 180 | bp_emp (EMP Charge) |
| Broken AI Core | 220 | bp_cards (Access Card Copy) |
| Unknown Egg | 200 | bp_binding (Skillbook Binding) |
| The Watch | 260 | bp_hauler (Hauler Frame) |
| Lurker Mask / Influencer Tooth / Foreman's Hard Hat / Legacy Core | 20 + value/2 | bp_masterwork (+ components) |
| other creature drops | 20 + value/2 | components only |

Strange items sell for 6-30 (kind scrap, `strange: true`, tier epic-mythic, odd flags: Black Box pings, Unknown Egg shakes, The Watch is cursed).

## Where components come from

* **Facility** (host, on `moonPopulated`, seeded by `run.seed ^ 0xC4AF7`): 6-12 (x 0.85-1.15 by facility size, max 14) at scrap spots not already
  occupied, weighted by interior theme (`THEME_TABLES`): serverfarm circuits/cables, factory metal/fuel, hospital chem/cloth, mansion wood/cloth,
  mineshaft metal/fuel/wood (+crystal), office cable/circuit/cloth, backrooms cloth/wood/ecto, sewer chem/metal/coolant. Crystal 2-7% and ecto
  4-8% per part depending on theme = roughly one Data Crystal every 2-3 days. + up to 2 wood/metal parts outside.
* **Strange item**: 30% per day (+4% per quota, max 55%) in one of the deepest 25% of scrap spots.
* **Creature kills** (host, wraps `hostOnCreatureKilled`): chance `0.2 + 0.06 * power` (max 0.5), elites x1.8 + 0.1, bosses 100% (4 parts +1 crystal +1
  ecto); 1-3 parts flavoured by creature (`CREATURE_FLAVOUR`: scuttler electronic, lurker/giant arcane, spider/leech organic, jester metal ...).
* **Chests** (`rollChestLoot`): entries per chest 2-3 (common) ... 5-6 (mythic); category weights per chest tier (below); entry tier rolled with
  `luck = idx*0.15` in `[chestTier-2, chestTier+1]`.
* **Trees / rocks**: `dropComponents(pos, 'wood' | 'metal', n)` (world agent).

Chest category weights (%):

| chest | scrap | component | tool | weapon | bag | skillbook | strange |
|---|---|---|---|---|---|---|---|
| common | 40 | 42 | 14 | 2 | 1 | 0.5 | 0.5 |
| uncommon | 36 | 38 | 15 | 5 | 2.5 | 2 | 1.5 |
| rare | 32 | 34 | 14 | 9 | 4 | 4 | 3 |
| epic | 28 | 30 | 12 | 12 | 6 | 7 | 5 |
| legendary | 24 | 28 | 10 | 14 | 8 | 10 | 6 |
| mythic | 20 | 26 | 8 | 16 | 10 | 12 | 8 |

(a category with nothing registered - no skillbook / bag / weapon ids yet - falls back to a component, so the other modules' items simply start
appearing after the merge.)

## Balance notes

* A day yields ~9 facility components + ~1 from kills: enough for 2-4 basic recipes (medkit 3 parts, lockpick 3, molotov 2 ...) every single day.
* Rare parts (crystal / ecto) gate the good gear (EMP, pro flashlight, epic+ upgrades, lantern, skillbooks): ~0.3-0.5 crystals per day from
  the floor, more from dismantling electronics / analysing drops, chests and bosses.
* Crafted goods have no sell value (no craft-and-sell loop); components sell for 2-45.

## Known limitations

* Blueprint ownership is trusted from the requesting client (personal `profile.blueprints`), fine for co-op.
* Traps / fires are host state only: a peer joining mid-fire sees no flames (damage still works); traps are ordinary world items so they sync.
* Ammo / armor / bag / skillbook / bat recipes stay hidden until the owning modules register matching ids (`recipes.js finders`).
* `it.tier` of crafted items is not written into the run save yet (`hostSave` keeps `af/b/c/am/bg` only): the inventory module should persist `tier`.
* Tier-based damage only covers melee; ranged / armor scaling belongs to the inventory / shop modules (`TIERS[tier].statMul`).
