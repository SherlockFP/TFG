# coop12: mechanics that force friends to work together (wave 12)

Module `coop12` (`src/game/coop12.js`, pure rules `coop12_core.js`, models `coop12_models.js`, strings `coop12_text.js`). Installed after gear11 (`// [slot:coop12]`). Extends carry2 (helper grip), downed (revive), pings; nothing duplicated.

## What it does
1. **Team lift.** Four GIANT loot props (`cg_rack` Tier-4 Server Rack, `cg_arcade` Arcade Cabinet DOOM SCROLL, `cg_vending` Double-Wide Vending Machine, `cg_like` The Golden Like; value 360-780, weight 100+, rare in the interior scrap tables). They are `bulky`, so carry2's "Help carry [hold E]" grip already pairs a carrier with a helper; coop12 only changes the numbers for `giant` items: carrier alone = drag (speed x0.18, turn x0.55, strong sway); pair = speed lerp(0.3..0.95, SYNC). SYNC (0..1) is computed on both clients from the two players' smoothed horizontal velocities: same direction and speed = 1, crossing / opposite = ~0, one pulling while the other stands = drag (0.35), buddies +0.12. Below 0.5 the camera wobbles and a rope creak plays. A shared bar (bottom dock) shows TEAM LIFT and SYNC / DRIFT / FIGHTING IT plus a hint. A giant that comes to rest after a fall of 0.9 m or more loses 6 % + 7 %/m (cap 50 %, never below 35 % of base), with a `smash` fx and a `crack` highlight (host reads the item's y every 0.1 s; items only count after they were first held, so spawn drops never damage).
2. **Heavy vault doors.** Every cracked (unlocked) `vault` door gets two lever panels (one per face, beside the door, red / green lamp). With 2+ living crew within 30 m of the door, it stays open only while somebody holds the lever (E, keepalive 0.25 s; the host checks distance and that the holder is not in the doorway, so you cannot hold and walk through). Nobody holding = alarm + flashing lever for 1 s, then a fast slam (extra door speed on top of the stock vault speed, on every peer). It never slams while anyone stands in the doorway or a giant carrier is within 5 m (a team lift is never trapped inside a vault). A lone player, or a partner further than 30 m, means the door behaves like before (opens itself). Vault doors are already creature-proof (creatures only open `kind: 'door'`, the `door` request refuses vaults), so "creatures cannot open them" is inherited; a held-open vault is an open corridor for creatures, on purpose. One toast per landing explains it.
3. **Buddy bond.** Host book: two living players within 8 m (dy < 4) for ~40 s fill a bond; it forms at 75 % (~30 s) and breaks under 35 % (about a minute apart; frozen while either is down or dead). One buddy each (strongest wins). Effects: a "BUDDY" tag sprite over the buddy (depthTest off, fades with distance), a HUD chip, reviver time x0.65 (`downed.js` host `hold` multiplies by `game.coop12.bondMul`), +3.5 stamina/s regen while resting within 14 m, and buddy pings get a gold `.c12-bp` marker that lives 4 s longer (via the existing `ping` mods event, no pings.js edit).
4. **High-five.** Face a crewmate within 2.6 m: "High-five [hold E]" prompt (the receiving side sees "X holds out a hand" in the bottom dock). Both must hold E within 2.8 m and face each other (host checks yaw); success = spark + `catch_thump` / `coin_pop`, +25 stamina, MORALE for 45 s (+2.5 stamina/s regen) and +25 % bond progress. 8 s cooldown per pair.

## Net
`c12q` client -> host `{op:'door', id, on} | {op:'hf', to, on}`; `c12fx` host -> all (HOST_ONLY) `{k:'bond', l:[[a,b]]} | {k:'hand', id, to} | {k:'hf', a, b, p} | {k:'warn'|'slam', id} | {k:'first'} | {k:'smash', id, n, h, by, p}`. Late joiners get the bond list on `playerJoin` (and a rebroadcast every 6 s); door state rides the stock `door` broadcast; host migration rebuilds the book from each peer's mirror.

## Shared-file edits
`game.js` (import + slot), `downed.js` (one-line revive multiplier hook).

## Knobs
`LIFT`, `FALL`, `DOOR`, `BOND`, `HF`, `GIANT_LOOT` in `coop12_core.js`.

## Test / see it
`node tools/harness/coop12.test.mjs` (plus carry2 / downed tests, `npx vite build`). Console: `kefal.game.coop12.debug.state()`, `.spawn('cg_like')` (host), `.bond(remoteId)` (host, forces a bond), `.giants()`.

## Known gaps
- Not played with two humans: SYNC thresholds, the 30 m enabling range and lever ergonomics need tuning. Speed is client-side like all movement; sync is computed locally on both peers (near-identical inputs).
- Order dependency: coop12 sets `player.carryMul` after carry2 in the same `update` (installed later); if the order ever flips, giant speeds fall back to carry2's bulky numbers.
- Blast doors are not made heavy (they belong to the lockdown / security system); only vault doors.
- The helper still has no carry animation (carry2 gap); the item stays in the carrier's hands.
- Lever panel geometry assumes the 4 m cell / 2.6 m vault door layout.
