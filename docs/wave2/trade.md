# Wave 2 - PLAYER TRADING + item icons for every item (module `trade`)

Owner: "can we trade with players? build a detailed trade menu, and let us see the inventory - all items with icons/pictures, generate them of course."
`this.useModule('trade', installTrade)` in game.js (only the two slot lines). Dev port 5268.

## How it plays
- **Ask:** look at a crewmate within 4 m and press **E** (prompt `Trade with <name> [E]`, sub `or press [N]`), or press **N** (nearest crewmate, prefers the one you look at),
  or chat `/trade <name>` (no name = nearest), or ship terminal `TRADE <name>`. N / M are free keys (T is chat, E stays the world interact).
- **Popup (10 s):** the other player gets `TRADE REQUEST - <name> wants to trade` with a shrinking bar: **N** accept, **M** decline (buttons work when the mouse is free). The asker sees `Waiting for <name>...` (M cancels).
- **Window (CRT, same frame / tile language as the I panel):** left = your inventory (hotbar / equipped / backpack, every item with generated icon, tier frame, +N, durability or battery bar, value; blocked items are greyed with a reason),
  middle = YOUR OFFER (3x3 = 9 items + Clout input, LOCK OFFER / ACCEPT / CANCEL, status line + 3 s countdown bar), right = THEIR OFFER live (9 slots, their Clout, lock lamps, give/get summary + "they offer nothing" / "far less" warnings).
  **Drag** an item into your offer box, **double-click / RMB** toggles, click an offered item = take it back. Tooltips everywhere reuse `itemTooltipHTML` (+ Durability row); items of THEIR offer add a comparison block
  `vs your <item>` (equipped armour / trinket / bag, your best weapon, same type): Damage / Cooldown (lower = better) / Damage reduction / luck / crit / stamina / scan / battery / Grid / Value / Weight with green / red deltas.
- **Two-stage confirm:** both press LOCK -> both press ACCEPT (needs both locks) -> 3 s countdown (either can CANCEL) -> swap. **ANY change (items, Clout, lock, unlock) resets every lock + accept and aborts the countdown.**
- **Result:** `TRADE COMPLETE` screen (you gave / you received with icons, +N, tier colour, Clout) + a chat log line `Trade complete with <name>: gave ...; received ...` on both sides.
- **Cancels (both get a toast with the reason):** ESC / closing the window / CANCEL, decline, request timeout (10 s), the other player leaves, either dies, more than 6.5 m apart, phase change (landing / takeoff / orbit), an offered item vanishes
  (removed from the offer + locks reset), not enough room, a Clout debit refused / unconfirmed for 3 s, 5 min idle.

## Rules (`trade_core.js`, `RULES`)
9 items per side; request 10 s; countdown 3 s; start <= 4.6 m (client checks 4.4), keep <= 6.5 m; Clout <= your own balance (client cap) / 1,000,000. Not tradable: soulbound, bodies, big physics items (not bag-able),
hot / cursed / special items, deployed ladders. Equipped gear can be offered; it arrives in the receiver's bag (never auto-equipped). Received items go to the first free BAG spot (big first), else a free hotbar slot; if the giver's bag leaves the swap
their remaining bag items are repacked into the pockets (or the trade is refused with `noroom`).

## Files
| File | Role |
|---|---|
| `src/game/trade_core.js` | PURE rules: `tradeBlock`, `validateOffer`, `planTrade` (atomic swap plan), `TradeSession` (pending -> open <-> countdown -> exec -> done / cancelled), `compareItems`, `comparableFor` |
| `src/game/trade_host.js` | host-authoritative manager (`createTradeHost(game, {now})`): request / respond / offer / lock / accept / cancel / Clout ack, tick (distance, death, leave, phase, vanished items, timeouts), execute + apply. No DOM: node-tested with a mock game |
| `src/game/trade.js` | install: client state, popup, N / M keys, E interactable, `/trade`, terminal `TRADE` + `ICONAUDIT`, net wiring, `game.trade` API |
| `src/ui/panels/trade.js` | the window (drag & drop, tooltips + comparison, done screen) |
| `src/ui/iconatlas.js` | generated glyph icons + `auditItems` (pure) |
| `src/i18n/tr_trade.js`, `ru_trade.js` | Turkish + Russian (listed in `tr.js` / `ru.js`; `node tools/i18n_audit.mjs --file trade` shows 0 missing) |
| `tools/harness/trade.test.mjs`, `tools/harness/wave2_trade.js` | node test (86 checks, PASS) / browser proof (written, NOT run) |

## Net (all prefixed `tr`, one handler each)
client -> host requests (`net.request` / `handle`): `trreq {to}`, `tracc {tid, ok}`, `troff {tid, items, clout, q}`, `trlock {tid, on}`, `trok {tid}`, `trcx {tid}`, `trca {tid, ok}`; every one also carries `bx` / `hs` (extra bag columns + hotbar size, clamped by the host like the `inv` requests).
host -> the two players: `trs` (snapshot `{tid, a, b, st, v, cd, p:{peer:{i, c, l, k, q}}}` after every change), `trm` (`req | sent | open | cancel{why, by} | done{gave, got, cg, cr} | err`), `trc {tid, n}` (debit request). All three are `HOST_ONLY`.
`q` is the client's edit counter: the UI adopts the host's version of your offer only once the host has seen your latest edit.

## Trust model (atomic swap, no dupes, no loss)
Items are host state. At the end of the countdown the host re-checks that every offered item is still held by its offerer and tradable, plans the WHOLE move (`planTrade`), and only then broadcasts all `held` events (plus repack `inv` events) in one synchronous pass
(one packet per peer): any failure before that point cancels with nothing moved, so a disconnect / death / sale mid-trade can never duplicate or lose an item. Clout lives in each player's local profile (like every reward), so the host cannot debit it:
it sends `trc` to each giver, the client spends the Clout (`progress.spendCoins`) and answers `trca`; only after EVERY debit is confirmed does the host re-plan, move the items and pay the receivers through the normal reward path (`xp` with `coin`, reason `Trade: Clout`,
which profile.js now exempts from the Clout multiplier via `FLAT_REASONS`). A refused / late debit refunds the confirmed ones and cancels. A cheating client can already mint Clout for itself (local profile); trading only lets a liar hurt himself.

## Icons for every item (`icons.js` + `iconatlas.js`)
Existing pipeline kept (one shared offscreen WebGL renderer, idle time-sliced queue, cached data URLs) and hardened:
- **Fallback glyph icons** (`iconatlas.js`): no model registered (would have been the grey "?" box), a render that throws / comes out empty (GLB not loaded yet), or no WebGL -> a generated pictogram (blade, pistol, wrench, vial, chip, gear, vest, gem, bag, book, note, bomb, kit, shard, fish, claw, vase, key, skull, ammo, crate, coin, lamp) by kind / id / flags,
  tier colour, accent hue hashed from the id, two-letter tag from the name. Node-tested: every registered item maps to a shape. The cache can never hold '' any more.
- **Soft cache:** a glyph is replaced by the real model icon when a model shows up later (mod registered late, GLB loaded): `iconURL` retries (<= 3 times, 4 s apart).
- **Blank-icon bugs fixed:** `iconHTML` used to strip characters from the id (`data-icon`) so `notify()` never matched items with unusual ids; a model that threw halfway leaked into the next icon (`wrap.clear()`); WebGL loss disabled every new icon.
- New API: `flushIcons(ms)` (render queued icons synchronously, used when a window opens), `iconState(type)` (`model | glyph | blank | pending | none`), `iconModelSource(type)` (`mod | builtin | null`), `iconsPending()`; `models/items.js` exports `hasItemModel(id)`.
- **Audit:** terminal `ICONAUDIT` / `kefal.game.trade.iconAudit()` (after `await kefal.game.trade.warmIcons()`): total, real-model icons, glyph fallbacks, blank, items without a model (id + kind). Icons are prewarmed 6 s after the session starts (idle slices) so the window opens with everything ready.
  Store, crafting, forge, hotbar, loot feed, tooltips, scan sale list already call `iconHTML` / `iconImg`, so they all get the fixes.

## Marked edits in shared files (`[trade]`)
`game/game.js` (import + useModule slot) - `ui/icons.js` (imports, `soft` cache, `renderQueued`, `flushIcons`, `iconState`, `iconModelSource`, `iconURL` retry, `encodeURIComponent` ids, `wrap.clear()`) - `models/items.js` (`hasItemModel`) -
`ui/inventory_panel.js` (Durability tooltip row: reads `it.dur` as a fraction, or absolute with `it.durMax` / `def.durability`; the durability module is not merged yet, adapt the field names when it is) - `game/profile.js` (`FLAT_REASONS` + `Trade`) - `i18n/tr.js` / `ru.js` (part lists).

## Tests
```
node --check src/game/trade.js src/game/trade_core.js src/game/trade_host.js src/ui/iconatlas.js src/ui/panels/trade.js src/ui/icons.js
node tools/harness/trade.test.mjs        # 86 checks: rules, planner (bag / hotbar / repack / no room), lock -> accept -> countdown machine, reset on change, all cancel paths, host flow with Clout handshake + refunds, glyph coverage of every base item
npm run build
# browser proof, written but NOT run (the browser queue was frozen): tools/harness/wave2_trade.js --shot /tmp/trade.png
```

## NOT verified (no browser run)
- The window itself (layout at 1280x720, drag & drop, tooltips + comparison, done screen), the E interactable prompt, N / M keys and the popup were never seen in a browser; the glyph drawings were never looked at.
- The real 2-player flow over P2P (`held` events landing on a real remote client, the `trc` debit round trip, `onItemHeld` slot handling for the receiver) is only covered by the mock-game node test.
- Icon audit numbers ("items without a model" before / after) were not measured: run `wave2_trade.js` or terminal `ICONAUDIT`. Items whose model is registered by a mod AFTER the first icon request are covered by the soft-cache retry, not tested.
- Music module may also read N / M in instrument play mode (both keys are free in the base game).
