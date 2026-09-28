# Wave 1 - Company Store, weapons, Stacked Deck (module `shop`)

Owner ask: "silah falan shop market sistemi olsun, company mantigi... kart mekanigi, twisted fate gibi kart firlatma itemi".
Everything here is installed by `this.useModule('shop', installShop)` in `game.js` (the only two placeholder lines touched there).

## Files

| File | What |
|---|---|
| `src/game/shop.js` | catalogue (pure functions), seeded DEALS / EMPLOYEE OF THE MONTH / daily stock, host purchase logic, kiosks, `game.shop` |
| `src/game/weapons.js` | item defs + ammo, first-person arcs/recoil, procedural sounds, projectile sim, gun / crowbar / flare logic, shared `createWeaponContext` |
| `src/game/deck.js` | Stacked Deck behaviour (throw fan, Pick a Card, special cards, HUD, glow) |
| `src/models/weapons_wave1.js` | procedural models (knife, bats, crowbar, katana, pistol, nail gun, crossbow, flare gun, 4 ammo boxes, deck) + card mesh |
| `src/ui/panels/shop.js` | the CRT store panel |
| `tools/harness/wave1_shop.js` | headless proof (see "Testing") |
| shared files edited | `src/game/terminal.js` (STORE / BUY / host `cart`, `coinbuy`), `src/ui/ui.js` (`openShop`, panel-close hook), `src/game/game.js` (2 placeholder lines). **No edit to `actions.js`** |

## Company Store

* Open: terminal `STORE` (closes the terminal, returns to it on close), the store kiosk in the ship (E), the mini kiosk on the HQ sell counter (E).
  `STORE LIST` (or `STORE TEXT`) prints the classic text list; `STORE WEAPONS` opens straight on a tab; `BUY <item> [n]` keeps working and now buys
  anything in the catalogue at today's prices; `DEALS` prints the day's specials.
* Tabs: Weapons, Tools, Bags, Consumables, Magic, Components, Suits, Ship (+ any new category another module invents). LB/RB or PageUp/PageDown switch tabs, arrows / D-pad move, Enter / A adds, Esc / B closes.
* Cards: icon, tier colour (tiers.js), stat pills (DMG, DPS, reach, mag, weight), price in ▮ (credits) or ◈ (Clout), deal badge, "N left", SOLD OUT stamp, red price when you cannot afford it, faction lock.
* Right column: TODAY'S DEALS (3), EMPLOYEE OF THE MONTH (1, with a corporate quote), CART with +/-/BUY/CLEAR. Clout items ask for confirmation and buy immediately.
* Trade-in: the Nail Bat card shows `UPGRADE ▮60` when you carry a plain Baseball Bat (the bat is removed by the host).

### Data driven catalogue
A registered item is listed if it has `price` (▮) or `coin` (◈, needs `shop`) **and** either sits in `STORE_ITEMS` or has a `shop` field:

```js
registerItem({ id: 'x', name: 'X', kind: 'tool', price: 80, shop: 'bags', tier: 'rare', blurb: '...' })   // appears in the Bags tab
```
Optional fields: `tier|rarity`, `blurb|tip`, `weight`, `faction` + `minRep` (locked when `game.lore?.factionRep(faction) < minRep`, default -20; absent lore = everything unlocked), `upgradeFrom` + `upgradePrice`, `noShop`.
Category fallback from `kind`: weapon->weapons, tool->tools, consumable->consumables, bag->bags, suit->suits, component->components, skillbook/spell->magic.

### Rotation (seeded, no `Math.random`)
* DEALS: 3 credit items, 15-35 % off, `RNG(hash(run.runId:deals:run.day))`.
* EMPLOYEE OF THE MONTH: 1 uncommon+ item, 12 % off, `RNG(hash(runId:eom:quotaIndex))`, never a deal item.
* Premium items (>= ▮250, >= ◈500 or epic+) have a daily quantity 1-3 (15 % chance of 0 = sold out), `RNG(hash(runId:stock:day))`; sales are kept in `run.shop = { d, sold }` (host-owned, synced through `broadcastRun`).

### Purchase path (host authoritative)
`game.shop.buy(lines)` -> `net.request('term', { cmd: { op: 'cart', lines: [{ id, n, trade? }] } })` -> `Terminal.hostExecute` -> `game.shop.hostCart`: the host reprices every line from the same seeded functions, checks stock / faction / credits, takes the credits once, spawns the items in ship storage with the classic dropship sound (store-bought items are spawned with `value: 0`, so there is no buy-then-sell arbitrage), replies in the terminal and sends a structured `fx {k:'sh', t:'shopres'}` back to the panel. Ship upgrades and the Uplink Van go through their existing logic. Clout items: the client spends the Clout, then `op:'coinbuy'`; the host validates the item and refunds through `shopres` if it refuses (Clout is a personal client-side wallet like the Black Market, so this part trusts the client).

## Weapons (registered at import, ids stable)

| id | name | tier | kind | dmg | cd | reach | dps | notes | price |
|---|---|---|---|---|---|---|---|---|---|
| knife | Kitchen Knife | common | melee | 9 | 0.32 | 1.75 | 28 | fast, quiet | ▮18 |
| bat | Baseball Bat | common | melee | 22 | 0.68 | 2.3 | 32 | knockback 1.6 | ▮45 |
| nailbat | Nail Bat | uncommon | melee | 31 | 0.70 | 2.3 | 44 | trade-in of a Bat: ▮60 | ▮120 |
| crowbar | Crowbar | uncommon | melee | 18 | 0.55 | 2.1 | 33 | pries locked doors / crates (hold E, 5 s) | ▮60 |
| katana | Katana | epic | melee | 30 | 0.42 | 2.35 | 71 | Bureau faction soft-gate | ▮650 |
| pistol | Pistol | rare | ranged | 17 | 0.28 | 45 | 61 | mag 8, `rounds` | ▮240 |
| nailgun | Nail Gun | uncommon | ranged | 5 | 0.11 | 20 | 45 | mag 30, hold to fire, `nails` | ▮190 |
| crossbow | Crossbow | rare | ranged | 58 | 1.35 | 60 | 43 | two-handed, near silent, bolts recoverable | ▮320 |
| flaregun | Flare Gun | uncommon | ranged | 10 | 1.0 | 60 | - | 24 s light (LightPool emitter) + scares weak creatures | ▮85 |
| stackeddeck | Stacked Deck | epic | ranged | 9 x3 | 0.75 | 40 | 36 | see below | ◈900 |

Ammo (`item.charges` = rounds left, R reloads from any box in your slots, partial boxes are kept): `rounds` ▮30 (24), `nails` ▮25 (90), `bolts` ▮26 (8), `flares` ▮22 (4).
Existing weapons now also sold: Machete ▮90, Sledgehammer ▮150, Harpoon ▮600 (they already had prices), Taser ▮400, Pipe ▮10, Shovel ▮30.
Economy check (`node tools/sim/economy.mjs --runs 80`): quota 130 at the start, 682 at quota #4, 946 at #5; a median 4-competent crew banks ~▮3.3k after the first quota and ~▮10k by the third, so store prices (▮10-650, Van ▮350, Jetpack ▮700) sit between a fraction of the first quota (ammo, knife, flare gun) and about one day's surplus in the mid game (Katana / Harpoon / Taser). Deals (-15..35 %) and the Employee of the Month (-12 %) move prices by at most a third. Store-bought items are worth ▮0 at the bell, and the new melee weapons / ammo added to the scrap tables carry values close to the table average (~50), so the sim's per-landing scrap value does not move measurably.
Balance reference (existing): pipe 23 dps, shovel 25, machete 52, sledge 37, harpoon 44, taser (stun). Creature HP for scale: scuttler 30, screamer 90, crawler 160, hound 180, lurker 220.

### Behaviour notes
* Melee uses the stock pipeline (arc + trail per weapon added to `WEAPON_ARCS`, recoil to `WEAPON_RECOIL`). Tier scaling: `meleeSwing` is wrapped on the game instance so `power *= statMul(it.tier) / statMul(def.tier)` (1 when the instance has no tier of its own). Wrappers are put back on dispose.
* Guns: LMB is caught in the `useItem` event (`hk.handled = true`), the client raycasts / simulates the projectile and sends `wshot`; the host recomputes damage (`def.dmg x tier x meleeMul(clamped) x crit x affix`), rate limits per item, checks range and holder, then calls the normal `hit` handler (knockback, aggro, kills). Reload: `R` (the `reload` method is wrapped; the shotgun path is untouched).
* Crowbar: `doorInteraction` is wrapped (locked normal door + crowbar in hand -> "Pry the door open"), supply crates get their prompt replaced through the `interactables` event. Hold E for 5 s (loud, host noise every 0.9 s), then `wpry` (doors) or the existing `opCrate` request with `pry` (crates). Fires `mods.emit('tfg:pry', { kind: 'door'|'crate', id, item, by })` on the prying client when it completes.
* Flare gun: the flare arcs, lands and becomes a burning flare for 24 s. The host makes weak creatures (base hp <= 100, no bosses / hazards) within 9 m flee and stop attacking (all creature movement funnels through `CreatureManager.follow`, wrapped for both this and the slow status).
* Finds: 42 % of landings (seeded by runId + day + moon) put one of Deck / Katana / Crossbow / Pistol / Nail Gun / Flare Gun / Nail Bat / Crowbar in a deep room with a rolled affix (>= uncommon, Deck / Katana >= rare) and ammo next to it. Knife / bat / crowbar / nail bat / ammo also join the scrap tables at low weight.

## Stacked Deck
* **LMB** throws a fan of 3 spinning cards (client-predicted projectiles with particle trails; host damage 9 each).
* **R** = Pick a Card: BLUE -> RED -> GOLD every 0.34 s for up to 3 s (bottom HUD dock + deck aura glow, also visible on other players' decks). R again locks (LMB while cycling locks and throws). Pick cooldown 5 s after a special throw.
* Next throw = ONE special card: **GOLD** stun 2 s (single target, 14 dmg), **RED** 3.4 m splash (10-19 dmg falloff) + 45 % slow for 3 s, **BLUE** 22 dmg and `game.magic?.addMana?.(25)` (host confirms the hit and tells the thrower); without a magic module it refunds the pick cooldown instead.
* Host: `wdeck throw` registers a ticket (3 cards or 1 special, 2.6 s), each `wdeck hit` consumes one; damage / stun / slow are computed by the host. Buyable for ◈900 and a rare/epic find.

## Extension points other modules can use
* `game.shop.stock()` / `deals()` / `employee()` / `priceOf(id)`, `game.shop.open(category?)`, `game.shop.close()`.
* Events: `tfg:pry`. Creature status fields set on host creatures: `slowT` / `slowMul`, `scaredT` / `scareFrom`.
* fx messages use `{ k: 'sh', t: <sub> }` on the existing `fx` channel (so they relay and loop back).

## Testing
```
npx vite --host 127.0.0.1 --port 5186 --strictPort &
flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5186 --script tools/harness/smoke_land.js          # errs: []
flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5186 --script tools/harness/wave1_shop.js --shot /tmp/shop.png
```
`wave1_shop.js` checks: registration, catalogue + seeded deals, purchase (credits taken, items delivered), each new weapon damaging a spawned creature, pistol reload from a box, flare light + scare, crowbar pry prompt, deck fan / gold stun / red splash + slow / blue mana, `STORE LIST`, the panel (tabs, cards, cart) - and leaves the panel open for the screenshot.

## Known issues / not done
* Two real players over the internet were not tested (host path only); everything client -> host is a request, so it should work, but the projectile visuals for remote throwers are visual-only.
* Clout purchases trust the client wallet (like the Black Market).
* Sounds are quick procedural synths (placeholders in quality); melee swings still use the shared `swing_whoosh`.
* No gamepad face-button "add to cart" prompt beyond the standard A = click on the focused card.
