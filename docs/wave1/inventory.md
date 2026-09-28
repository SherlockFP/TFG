# Wave 1 — Inventory, item tiers, bags (module `inventory`)

Diablo-style inventory on **I**: paper-doll equipment (Suit/Armor, Trinket ×2, Bag), a backpack grid whose size comes
from the worn bag, the hotbar, and a character sheet. Every world item can carry a **tier** (Common → Mythic) that
colours it everywhere and multiplies scrap value / weapon damage / gear stats.

## Files
| File | Role |
|---|---|
| `src/game/inventory.js` (new) | `installInventory(game)` → `game.inventory`: client prediction, host `inv` handler, stats hook, tier luck, gear moon loot, reclaim (saves / reconnect), loot feed, world tier beams, `I` key, terminal `INVENTORY` |
| `src/game/inventory_core.js` (new) | pure logic (node-testable): bag grids, item footprints, placement / packing / validation, equipment bonuses, stashed weight, tier roll rules, loot luck |
| `src/ui/inventory_panel.js` (new) | the panel: drag & drop, RMB quick-move, SHIFT+click drop, 1-9 to hotbar, tooltips (`itemTooltipHTML(it, def)` is exported for other panels) |
| `src/ui/inventory_style.js` (new) | injected CSS (panel, tooltip, loot feed, hotbar tier frames, `[I]` bag tag) |
| `src/models/gear.js` (new) | procedural models for the 9 new gear items, registered via `window.__kefalMods.itemModels` (world + icons) |
| `tools/harness/wave1_inventory.js` (new) | headless feature check (see Testing) |
| `tools/harness/inventory_core.test.mjs` (new) | node test of the pure logic |
| `src/game/items.js` (owned) | `RARITY.mythic`, Belt Bag → bag, 9 new gear defs, store stock, `GEAR_IDS` |
| `src/entities/items.js` (owned) | `it.tier` / `it.inv` / `it.reclaim`, tier resolution + value in `hostSpawn`, `opts.tier/inv`, `'inv'` event, `iv` on `held`, serialization, `rarity()` = tier, legacy belt-bag dump |
| `src/game/actions.js` (owned) | full hotbar → pick into bag, bag/equipment never rendered, death spills bag + gear, tier damage, tier scan/prompt labels, reload from bag |
| `src/entities/localplayer.js` (owned) | carry weight includes bag contents (× bag weight multiplier) + worn gear |
| `src/ui/hud.js` (owned) | tier frames on hotbar slots, `[I] BAG used/cap` tag (`hud.setBagTag`) |
| `src/game/game.js` (shared) | only the two placeholder lines |
| `src/game/host.js` (shared) | **2 one-token hooks**: `...this.inventory?.loadFields?.(s)` in the `hostInit` ship-item restore and `...this.inventory?.saveFields?.(it)` in `hostSave` (tier + reclaim info survive saves) |

## Keys / controls
- **I** toggle the panel (Esc / TAB / I close; frees the mouse like other panels; blocked while typing, in minigames, terminal, chat, dead).
- Panel: **drag** between grid / hotbar / equipment slots (drops onto an occupied cell or slot **swap**), **drag outside** the frame = drop to the world,
  **RMB / double-click** = quick-move (gear → equip, equipped → bag, bag → hotbar, hotbar → bag), **SHIFT+click** = drop, **1-9** while hovering = move to that hotbar slot, **Sort** button.
- In the world: **E** with a full hotbar (or both hands busy) puts the item straight into the bag (`→ BAG` shows in the prompt). **LMB** with a bag / armor / trinket in hand equips it.
- Terminal: `INVENTORY` lists hotbar / bag / equipment.

## Data model & net messages
Bag / equipment items are ordinary world items **held** by the player (`it.holder = peerId`) but not in a hotbar slot:
`it.inv = null` (hotbar) | `{ k:'bag', x, y }` | `{ k:'eq', s:'armor'|'trinket1'|'trinket2'|'bag' }`. They are hidden, never rendered in hand, still weigh.
- request `inv` (client → host):
  - `{ op:'set', mv:[[id, inv|null]...], bx, hs }` — atomic moves of the sender's own items (swaps, equip, sort, repack). `bx` = extra bag columns from the passive tree, `hs` = hotbar size. Host validates the complete resulting inventory (`validateState`: slots, bounds, overlaps, baggable, hotbar count).
  - `{ op:'pick', id, to }` — pick a world item straight into the bag / a slot (same checks as `pick`: distance 7 m, owner, carrier).
  - `{ op:'consume', ty, n, rid }` — host removes n items of a type (bag first, lowest tier / value first) and answers `invr { rid, ok }`.
- host → all on the `it` channel: `{ e:'inv', h, mv:[[id, inv]] }` (accepted moves), `{ e:'held', id, h, iv }` (pick into bag / reclaim), `sp` carries `tr` (tier) and `iv`.
- rejection: host sends the requester `{ e:'inv', h, mv: <all their items>, full:1, why }` (full resync) or `pickfail`; the client reconciles its hotbar.
- Drops use the existing `drop` request (holder check) — the `drop` event clears `it.inv`. Death spills hotbar + bag + equipment around the body; leaving drops everything (existing host code).
- Late join: `items.serialize()` includes `tr`, `iv`, `rc`.
- Saves: `hostSave` stores `tr` + `rc:{ pid, iv }` (owner profile id + location). On `hostStart` (host) / `playerJoin` (clients, +1.5 s) items with a matching `rc.pid` that still lie in the ship go back into the owner's slot / bag / hotbar. A mid-session leaver's dropped items get `rc` too, so reconnecting in the ship gives them back (items left on a moon stay there — no free extraction).
- Old saves: a Belt Bag that still carries legacy `bg` scrap entries is dumped next to its holder by the host (once).

## Soft interfaces (for other modules)
```js
game.inventory.open() / close() / toggle() / isOpen()
game.inventory.bagItems()            // world items in my bag
game.inventory.hasItem(type) / countItem(type)   // hotbar + bag
await game.inventory.consume(type, n = 1)        // host-authoritative, resolves true/false (5 s timeout -> false)
game.inventory.addToBag(itemId)      // world item nearby (pick) or my hotbar item -> first free bag spot; returns bool
game.inventory.equipped('armor'|'trinket1'|'trinket2'|'bag'|'trinket'|'suit')  // world item or null
game.inventory.bagSize()             // { cols, rows } incl. rpg bonus columns
// extras: equip(itemId), quickMove(id), planMove(id, target), doMove(id, target), sortBag(), stashedWeight(), equipBonuses(),
//         hostLootLuck(), hostPlaceFor(holder, def, 'bag'|'eq'|{k,x,y}|{k:'eq',s}), hostReclaim(peer, pid)
game.items.hostSpawn(type, pos, { holder, tier, inv: 'bag'|'eq', rollTier, luck, minTier, maxTier })
```
- `opts.tier` forces a tier (a forced uncommon+ tier on a plain weapon rolls a matching affix; mythic weapons carry a legendary affix).
- `opts.inv` with `holder` spawns straight into that player's bag / equipment (falls back to the hotbar when it does not fit).
- Reads `game.rpg?.bonus?.('bagSlots')` (extra bag columns, clamped 0..4) and `game.balance?.lootLuck?.()` (added to tier luck).
- Stats hook adds to `game.stats`: `armor`, `speedMul`, `crit`, `maxStamina`, `staminaRegen`, `scanRange`, `batteryMul` and a new `lootLuck`.
- Events: `tfg:invChanged (game)`, `tfg:equip (slot, item, game)`. `import { itemTooltipHTML } from 'src/ui/inventory_panel.js'` for shop / crafting tooltips.

## Balance numbers
| Item | Grid | Stashed weight | Other | Store | Tier |
|---|---|---|---|---|---|
| (no bag) Pockets | 4×2 | ×1 | | | |
| Belt Bag `beltbag` | 5×3 | ×0.9 | | ▮45 | Common |
| Field Pack `bag_fieldpack` | 6×4 | ×0.85 | footprint 1×2 | ▮180 | Uncommon |
| Hauler Frame `bag_hauler` | 7×5 | ×0.8 | −5% move speed, 2×2 | ▮420 | Rare |
| Void Satchel `bag_void` | 8×6 | ×0.7 | loot only (vault / deep, 2-8% per moon) | — | Mythic |

| Gear | Effect (× tier statMul) | Weight | Store |
|---|---|---|---|
| Padded Hoodie `arm_hoodie` | 6% damage reduction | 4 | ▮60 |
| Riot Vest `arm_riot` | 12% DR, −2% speed | 12 | ▮220 |
| Kevlar Suit `arm_kevlar` | 18% DR, −4% speed | 18 | ▮480 |
| Lucky Dongle `trk_dongle` | +0.06 crew loot luck, +2% crit | 0.5 | ▮150 |
| Energy Drink Charm `trk_charm` | +15 max stamina, +12% regen | 0.5 | ▮90 |
| Signal Amulet `trk_amulet` | +8 m scan range, +10% battery life | 0.5 | ▮120 |
- Total armor still caps at 60% (existing `onHurt`). Store copies are Common; moon loot copies roll a tier (0-3 gear drops per moon on scrap spots, deep rooms first).
- Footprints: 1×1 small, 1×2 when weight ≥ 10 lb, 2×2 two-handed; `def.size` overrides; `kind:'big'`, bodies, `special` (apparatus), hot and cursed items can't be bagged.
- **Tiers** (`src/game/tiers.js`, unchanged): weights 60/25/10/4/0.9/0.1, valueMul 1/1.25/1.6/2.1/2.8/4, statMul 1/1.12/1.25/1.4/1.6/1.85.
  Scrap / drops / big valuables roll on spawn; value × `valueMul × TIER_VALUE_NORM (0.85)` so the average at luck 0 equals the old economy
  (E[valueMul] = 1.186 → ×0.85 ≈ 1.0; luck 0.2 → 1.15, luck 0.5 → 1.39).
- **Luck** = `balance.lootLuck()` + moon `(danger−1)×0.05` (cap 0.35) + crew Lucky Dongles (cap 0.3), total cap 1. Measured (5000 rolls): luck 0 → 59% common, 9.6% rare, 4.3% epic, 1.3% legendary, 0.14% mythic; luck 0.3 → 37% / 18% / 12.6% / 5% / 1%.
- Weapons: tier = affix rarity (existing loot.js rolls), damage × statMul on top of the affix (plain / store weapons are Common ×1).

## Testing
```
node tools/harness/inventory_core.test.mjs          # pure logic: sizes, validation, packing, bonuses, tier rolls
npm run build
flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5181 --script tools/harness/smoke_land.js
flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5181 --script tools/harness/wave1_inventory.js --shot /tmp/inventory.png
```
Last run: smoke `errs: []`; feature script: panel open/close ✓, stash ✓, Field Pack 6×4 ✓, legendary Kevlar armor +0.288 ✓,
two trinkets ✓ (+11.2 m scan on an epic amulet), hot GPU refused ✓, full-hotbar pickup → bag ✓, consume 2→1 ✓, grid move / sort / drop ✓,
tier distribution ✓, 4 world beams ✓, late-join serialization (iv + tr) ✓, save fields + reclaim ✓, death drop 11 held → 0 ✓, tooltip ✓, no page errors.

## Known issues / not done
- Drag & drop was exercised through the same `planMove/doMove` API in the headless test, not with real mouse drags (pointer lock / DOM drags need a hand playtest).
- No 2-real-player test yet (host validation / resync paths were only run on the host).
- Bag items are invisible on avatars (no backpack model on the character yet).
- Yoinker "nest" items stashed in the bag are not reported as carried by the local host player (`game.heldNestIds` only reads hotbar slots).
- Item icons render lazily (idle slices); under the headless software renderer some icons appear only after a few seconds.
- Grid items are not rotatable (1×2 items are always vertical).
