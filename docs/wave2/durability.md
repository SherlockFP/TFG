# Wave 2 - ITEM DURABILITY (module `durability`)

Owner: "items should be breakable - I used my weapon a lot and it breaks, like durability in Minecraft."
Module `durability` (`this.useModule('durability', installDurability)`), dev port 5266. All numbers live in ONE pure file, `src/game/durability_core.js`
(node-tested by `tools/harness/durability.test.mjs`). Browser proof: `tools/harness/wave2_durability.js` (run once: 35/35 checks, `errs: []`).

## Files
| File | Role |
|---|---|
| `src/game/durability_core.js` | pure rules: tables, wear amounts, thresholds, break-vs-destroy, repair plans (bench / HQ / kit), ageing |
| `src/game/durability.js` | install: wear tracking, host authority, broken-weapon gate, Repair Kit item + recipe + store entry, HQ mechanic bench, net, translations (EN + TR) |
| `src/ui/durability_style.js` | bar under icons, BROKEN overlay (grey icon + crack), tooltip row / flag; injected CSS |
| `src/ui/panels/repair.js` | REPAIR tab renderer (workbench) + HQ mechanic panel |
| `tools/harness/durability.test.mjs`, `tools/harness/wave2_durability.js` | node rules test / browser proof |

## Which items wear
Weapons: melee (per swing 0.4, +0.6 when the swing connects = 1 per hit, a whiff costs 0.4; crowbar pry 6), ranged (1 per shot; SMG / nail gun burn through theirs). Worn armour: 0.5 per point of raw damage
taken (cap 25 per hit, instakills excluded). Left alone: anything with charges / battery (flashlights, lockpicks), consumables, trinkets, bags, Grav-Tool (`def.noDurability` opts out).

## Table: max durability = base x tier x forge plus x ageing
`max = round(base(item) x TIER_MUL[tier] x (1 + 0.08 x plus) x max(0.6, 1 - 0.05 x repairs))`, tier = `tierOfItem` (rolled tier / affix rarity / def tier).
Tier multipliers: Common 1, Uncommon 1.3, Rare 1.8, Epic 2.6, Legendary 4, Mythic 5.5.

| Class | Base at Common (hits / shots) |
|---|---|
| Melee | pipe 120, shovel 130, stop sign 110, bat 130, nail bat 110, knife 110, crowbar 140, machete 130, sledgehammer 90, katana 150, longsword 140, greatsword 110, twin daggers 100, spear 120, war axe 110, war hammer 90; unknown melee 120 (two-handed 100) |
| Ranged | pistol 160, nail gun 260, crossbow 150, flare gun 160, Stacked Deck 100, Zap Gun 100, harpoon 90, double barrel 100, rocket launcher 70, grenade launcher 80, SMG 250, rifle 200; unknown 150 |
| Armour (damage points) | `250 + armor% x 2500`: Padded Hoodie 400, Riot Vest 550, Kevlar 700 (x tier) |

Examples: common pipe 120, legendary katana 600, rare pistol 288, rare SMG 450, legendary double barrel 400, epic Zap Gun 260, legendary Kevlar 2800.

## At 0
- **Common / Uncommon** (with no forge investment): the item SHATTERS: destroyed (glass-break + particles, toast "Your Lead Pipe broke!"), one Scrap Shard drops at the holder.
- **Rare+**, and any item with a forge `+N` or overclock: BROKEN. Cannot attack or fire (click + toast), greyed icon with a crack, sell value x0.3 (restored x1/0.3 on repair), broken armour gives no bonuses.
- Warnings: 25 % (bar yellow, toast, faint crack sound on hits) and 10 % (bar red pulsing, toast, louder crack sound).

## Repair
| Way | Cost | Result |
|---|---|---|
| Workbench **REPAIR** tab (ship) | melee: scrap metal 2-5 (+cloth when 3/4+ missing); ranged: scrap metal 1-4 + 1-2 circuit boards; armour: cloth 2-5 + scrap metal 1-2; plus credits `12 x (0.3 + 0.7 x missing) x (1 + 0.5 x tierIdx)`; a BROKEN Rare+ item also needs 1 shard of its tier (Data Crystal / Ecto Core / Algorithm Fragment / Source Code) | 100 % of the (aged) max |
| **Repair Kit** (store 45, or craft: 2 scrap metal + cloth + cable) | LMB with the kit in hand repairs the most worn carried item (hotbar, bag, worn armour) | +40 % of max, works on broken items, never ages the item |
| **HQ mechanic** (bench at the Forge area, left of THE MONETIZER; E) | credits only = (bench credits + parts value + shard value) x 1.6 | 100 % |

Ageing: a repair that restores at least 25 % of the max counts as a "full repair": max durability -5 % (floor 60 %). Kit repairs and small repairs never age.

## Sync / traffic (all net types prefixed `du`)
Item fields `it.dur` (null = untouched = full) and `it.dr` (full repairs) ride the `sp` event (`du`, `dr`), `serialize()` (late join) and `saveFields` / `loadFields` (run save), like `it.plus`.
- client -> host requests: `duw {id, w, f}` (accumulated wear: every 5 units, 3.5 s, or on item change), `dukit {kit, id}`, `durep {id, via}`.
- host -> all: `dus {id, d, r, v}` (state, only when the 10 % bucket changes, on repair, at a threshold, at 0, on a forced flush), `dubrk {k:'x'|'b'|'r', id, ty, by, p}` (effects + toasts), `dures` (to the requester).
- The wielder's client predicts (`it.dur` minus its unflushed wear); the host's copy is authoritative. When the host wields it applies directly (no double counting). A whole pipe life is at most 14 `dus`.

## Hooks in shared files (all marked `[durability]`)
`game/game.js` import + slot - `entities/items.js` (`dur` / `dr` fields, `du` / `dr` in the constructor, `hostSpawn` opts, `serialize`) - `game/inventory.js` (`saveFields` / `loadFields`) -
`game/inventory_core.js` (broken armour skipped in `equipBonuses`) - `ui/hud.js` (hotbar bar + `dur-broken` class) - `ui/inventory_panel.js` (grid bar, tooltip row + flag, signature) -
`ui/panels/crafting.js` (REPAIR tab, 2 lines). Instance wrappers (restored in `dispose`): `game.useHeldPress` (broken click), `game.net.request` (melee connect + pry), and `game.nextSwing` becomes a getter/setter
(a held broken weapon is always "on cooldown", which gates stock melee, stock guns, wave-1 guns, combat kit weapons, the deck and hold-to-fire). Attack detection is a rising edge of `game.swingAnim` (every swing / shot sets it).

## Known issues / not done
- Only the host path was exercised in the browser (wear, break, repair, kit, HQ service, armour, DOM); the client prediction + `duw` flush path and the HQ mechanic bench mesh / panel were not run (budget), placement blind (x -14.4, z -36.9).
- A spell cast raises `swingAnim` too, so casting with a weapon in hand costs a "whiff" (0.4). Walls / props hit by a swing count as a whiff only.
- Forge `+N` gains raise the max but not the current durability (repair to use it); a dropped item shows a value up to 10 % stale on other clients until the next `dus`.
- Instruments were skipped (per spec). No terminal command yet.
