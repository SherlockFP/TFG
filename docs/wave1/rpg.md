# Wave 1 - RPG: roles + passive tree (module `rpg`)

Owner brief: "path of exile deki gibi bi skill agaci ve rpg sistemleri... herkese rol verebiliriz".
Key **K** opens the tree. Roles are picked in the ship (roster locker `[E]`, tree panel `ROLE` button, terminal `ROLE <name>`).

## Files

| File | What |
|---|---|
| `src/game/passivetree.js` | Pure data + logic: bonus `KEYS`, `ROLES`, `KEYSTONES`, the 128-node graph (`NODES`/`EDGES`/`ADJ`), allocation / refund / role-switch planning, `treeBonus`, `treeFlags`, search. No DOM, no game imports. |
| `src/game/rpgctl.js` | Profile-level operations (allocate a whole path, refund, respec, role switch) with pluggable hooks. Same rules in game and from the main menu. |
| `src/game/rpg.js` | `installRpg(game)` -> `game.rpg`: net sync, dynamic keystones, Pack Mule / noise player hook, sale bonus, daily kit, name-tag suffix, K key, ship roster interactable, terminal commands, events. |
| `src/ui/panels/passivetree.js` | Canvas constellation panel + `decorateSkills()` (TAB sheet hook). |
| `src/ui/panels/roles.js` | Roles panel (six big cards). |
| `src/ui/panels/treeicons.js` | Vector icons (roles + keystones), no emoji fonts. |
| `src/game/progression.js` (owned) | `derivedStats` folds `treeBonus` into the shared stat block; rebirth counts the tree; `metaMultipliers` reads XP / Clout gain. |
| `src/game/profile.js` (owned) | `ensureRpgProfile` (migration + validation), legacy `Progress.allocate` refuses. |
| `tools/harness/wave1_tree.mjs` | Node validation (1900+ checks). `tools/harness/wave1_rpg.js` headless feature test. |

Shared-file edits: `src/game/game.js` (only the two `rpg` placeholder lines), `src/ui/ui.js` (2 lines: import + `decorateSkills(skills, p, this)` in `characterPanel`).

## Roles

Not classes: a small always-on passive, a starting kit and the origin of your tree. Chosen while the ship is in **orbit** (or from the main menu).

| Role | Base bonus | Kit (once per day, in your hands after landing) |
|---|---|---|
| Scout | +6% move speed, +4 m scan, -6 lb carry | Walkie-Talkie |
| Enforcer | +10% melee, +6% ranged, +15 HP | Stun Grenade |
| Occultist | +25 mana, +15% mana regen, +10% spell power, -10 HP | Glowstick |
| Field Medic | +30% revive speed, +10 HP, +5% stamina regen | Medkit |
| Technician | +15% interaction speed, +6% minigame ease, +2 m scan | Lockpicker |
| Hauler | +14 lb carry, +8 stamina, +3% scrap value | Belt Bag |

The kit is a client request (`rpgkit`) validated by the host: role known from the synced state, phase `moon`, once per `run.day` per player; spawned with `items.hostSpawn(kit, pos, { holder })`.
Crewmates see your role as a coloured suffix on the name tag (`Lv.7  FIELD MEDIC`, drawn onto the existing tag canvas from the `remoteAvatar` event) and get a chat line when you switch.

## The tree (128 nodes)

* 6 role posts (ring at r=165), one per role, order around the centre: Scout, Enforcer, Occultist, Medic, Technician, Hauler. Your own post is implicit and free; the other five are 1-point connector nodes with a tiny stat.
* 96 small nodes: an inner ring of 12 at r=112 (six single-stat + six hybrids at the borders), per sector 12 (spine / left arm / right arm), and 12 border bridges (`br_k` at r=252, `ob_k` at r=318) with two stats each.
* 18 notables (3 per role: spine, left, right), 1 point, two stats.
* 8 keystones (cost 2 points): six at the end of each role's spine, two on sector borders.
* 3 rare "bag column" nodes (`bagSlots +1`): Medic `medic_l4`, Technician `technician_l4`, Hauler `hauler_l4`.
* Rules: a node is allocatable when connected to your role post through allocated nodes. Clicking an unallocated node allocates the **cheapest whole path** (Dijkstra, keystone = 2). Refund only if the rest stays connected. Points come from the existing level-up skill points (`profile.skillPoints`), rebirth gives the usual 25% + bonus points.
* Refund costs Clout: small 10, notable 25, keystone 60 (per node); nodes allocated in the current page session refund for free (undo). Respec all = 60% of the summed refund costs. Refund / respec only in orbit or at HQ. Right-click asks twice when it costs Clout.
* Role switch (orbit only): nodes that lose their connection to the new post are refunded for their Clout price; the new post's point comes back if you had allocated it. Empty tree = free.
* Panel: drag = pan, wheel / pinch = zoom, hover = tooltip with stats / drawbacks / cost, click = allocate path (path preview is dashed), right-click = refund, search box highlights matches (Enter centres the first), `F` fits, arrows pan, `+`/`-` zoom. Allocated paths glow amber, keystones are big hexagons with an icon.

### Keystones

| id | Effect | Drawback |
|---|---|---|
| `bloodmagic` | +25% spell power; **spells cost Health instead of Mana** (magic module reads `has('bloodmagic')`) | mana bar disabled |
| `packmule` | Carry weight never slows you (`carryRelief` +9999) | cannot sprint (input proxy in `player.update`) |
| `glasscannon` | +40% melee / ranged / spell damage | -30% max HP |
| `ghoststep` | sprint makes no noise, -25% noise | -20 max stamina |
| `scavengersluck` | +25% loot luck | -10% scrap value |
| `ironlungs` | +40 stamina, +50% stamina regen | -12% max HP |
| `adrenalinejunkie` | below 40% HP: +30% move speed, +25% melee, +25% stamina regen (dynamic, 4 Hz check) | -15% max HP |
| `lonewolf` | no crewmate within 30 m: +20% damage, +8% move speed (dynamic) | crewmate within 10 m: -15% damage |

`has(id)` normalises: `'Blood Magic'`, `'blood_magic'`, `'BLOODMAGIC'` all work.

## Bonus keys (`game.rpg.bonus(key)`)

`bonus` = role + allocated nodes + dynamic keystones. **pct keys are fractions** (0.03 = +3%), flat keys are absolute.

| Key | Unit | Notes |
|---|---|---|
| `maxHp` / `maxHpPct` | flat / pct | applied in `derivedStats` |
| `stamina`, `staminaRegen` | flat / pct | applied |
| `carry` | flat lb | `carryRelief` |
| `moveSpeed` | pct | `speedMul` |
| `jump`, `crit`, `armor` | pct | applied |
| `meleeDmg` | pct | `meleeMul` (the shotgun also reads `meleeMul`) |
| `rangedDmg` | pct | `stats.rangedMul` (new; nothing reads it yet - other modules multiply by `1 + bonus('rangedDmg')` or `stats.rangedMul`) |
| `scrapValue` | pct | `valueMul`; **applied on sales**: `hostSell` is instance-wrapped, items are valued with the last holder's synced multiplier |
| `scanRange` | flat m | applied |
| `batteryLife`, `minigameEase` | pct | applied (`batteryMul`, `minigameEase`) |
| `xpGain`, `cloutGain` | pct | applied via `metaMultipliers` |
| `noise` | pct, negative = quieter | applied to `player.noise` (instance wrap of `player.update`) |
| `maxMana`, `manaRegen`, `spellPower`, `cooldown` | flat / pct / pct / pct (positive = shorter) | for the magic module (`stats.tree.*` mirrors them) |
| `bagSlots` | flat (bag columns) | for the inventory module |
| `interactSpeed`, `reviveSpeed`, `craftLuck`, `lootLuck` | pct | for facility / crafting / loot modules |

`game.stats.tree` holds the full static map, `game.stats.noSprint` the Pack Mule flag. The 'stats' mod event still fires, so other modules can layer on top.

## API / events

```js
game.rpg.role() / setRole(idOrName) / bonus(key) / has(keystoneId) / points() / open() / close() / toggle() / openRoles()
game.rpg.roleOf(peerId)               // crewmate role (synced)
game.rpg.allocate(id) / refund(id) / respecAll() / plan(id) / refundInfo(id) / previewRole(id) / trySetRole(id)
game.mods.on('tfg:role', (roleId, game) => ...)    // role changed
game.mods.on('tfg:rpg', (kind, detail, game) => ...) // 'alloc' | 'refund' | 'respec' | 'role'
```
Net: message `rpgst` `{ role, sv }` (relayed by the host, gossip on first contact), request `rpgkit`.
Terminal: `ROLE [name]` (`ROLE X CONFIRM` when a switch refunds nodes), `TREE`, `RESPEC [CONFIRM]`.

## Save / migration

`profile.rpg = { v: 1, role, nodes: [...], kit: {}, migrated: { skills, at, shown } }`. `save.js` keeps unknown profile keys, `ensureRpgProfile` (called from `ensureMetaProfile` and the character sheet) validates it.

* First load of an old save: the six legacy base skills (VIT/END/STR/AGI/LCK/TEC) are **refunded once** into `skillPoints` (`rpg.migrated.skills`, announced by a toast). The tree carries the same effects (Thick Skin, Deep Breath, Strong Back, Quick Feet, Haggler, Long Sight...). Mastery, prestige, gear are untouched.
* The legacy skill rows on the TAB sheet are replaced by the role + `PASSIVE TREE [K]` buttons; `Progress.allocate` refuses (toast).
* Unknown / duplicate / disconnected nodes (tree edits between versions) are dropped and their points refunded on load.
* Rebirth: like base skills, tree nodes are refunded at 25% (the role stays), counted in `rebirthPreview`.

## Known gaps

* Blood Magic / bag columns / mana / spell power / cooldown / craft / loot luck / interact / revive speed are exposed but only enforced by the modules that read them.
* `rangedDmg` has no consumer in the shipped weapon code (ranged weapons use `meleeMul`).
* Free-undo refunds are per page session (not saved).
* Only the local player's `scrapValue` (synced as a multiplier) is trusted by the host; co-op trust model.
