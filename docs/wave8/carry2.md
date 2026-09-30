# Carry 2: carry comedy (wave 8)

Module `carry2` (`src/game/carry2.js`, pure rules in `carry2_core.js`). Installed after rewardviz in `game.js` (`// [slot:carry2]`).

## What it does
1. **Heavy loot sways.** A 2-hand item of 25+ lb adds camera roll/pitch sway (via `engine.punch`, honours Reduce Motion) and slows mouse turn (`player.carryTurn`, 0.75-1). Bulky loot sways more and turns at 0.6.
2. **Bumps.** Hard stop (speed >= 3 m/s dropping to < 30 % in one frame, not a mantle) while holding a fragile item: host computes 5-25 % of base value (scaled by speed and `def.fragile`), never below 35 % of base, 1.1 s cooldown per item. Crunch (`glass_break`), stock `-N` float text (via the `val` event), and a `-N` pop for the carrier on hits >= 25. Items in the bag are safe.
3. **Two-person carry.** Bulky items: new `cy_vending`, `cy_rack`, `cy_statue` (2 hands, fragile, rare/epic, in the scrap tables of factory / office / serverfarm / mansion / hospital / mineshaft / sewer / backrooms) plus facjobs' `fj_core` (flagged `bulky` at install). Solo carrier: speed x0.55. A second player near the carrier gets a "Help carry [hold E]" interactable; while E is held the client pings the host (`cy2q grip`, 0.3 s), the host validates (bulky, holder carries it, <= 5.2 m) and broadcasts the helper. Carrier speed then cancels the weight penalty (~0.92 of normal), helper gets 0.92 too; a strap line sags between them. Grip lapses if E is released, they drift apart, or the carrier drops it.
4. **Throw and catch.** Throwing (`dropItem(it, true)`) a fragile hand item registers a host-side throw. Within 3.6 m of the flying item a crewmate gets "Catch [E]" (`pickup`); picked up before landing = no crack, catch toast, highlight `catch`. Landed uncaught (speed < 1.2 m/s after 0.35 s) = crack 12-25 % (same 35 % floor).
5. **Algorithm + highlights.** A break of >= 10 (and >= 15 % of base) on camera (feedcams meter live/tagged/seen) triggers one of 3 lines (`game.lore.say`, so the firstrun gate in `algorithm.show` applies), at most one per 40 s. `feedcams2.record('crack' | 'catch')` feeds `run.fc2.hl` (new kinds `crack` 42+0.25/pt, `catch` 36; texts in `feedcams2_i18n.js`).

## Net
`cy2q` client -> host `{op:'bump', id, s} | {op:'grip', id, on} | {op:'throw', id}`; `cy2fx` host -> all (HOST_ONLY) `{k:'co', l:[[item, helper]]} | {k:'throw', id, by} | {k:'brk', id, by, n, w, p, ln} | {k:'catch', id, by, from}`.

## Shared-file edits
`localplayer.js`: turn scaled by `this.carryTurn`, speed by `this.carryMul` (both default 1). `feedcams2_core.js` / `feedcams2_i18n.js`: two highlight kinds. `game.js`: import + slot.

## Knobs
`FEEL`, `BUMP`, `CO`, `THROW`, `LINE_GAP` in `carry2_core.js`.

## Test
`node tools/harness/carry2.test.mjs` (rules, fake-game host flow, strings), plus repomaps / facjobs / feedcams2 / rewardviz / gameplay2 tests and `npm run build`.

## Known gaps
- Not played: sway strength, the hold-E grip and the 3.6 m catch window need hands-on tuning (2 real players).
- The item stays in the carrier's hands (strap line to the helper) rather than visibly hanging between two avatars; the helper has no carry animation.
- Physics-beam "big" items (vase, statue, server) keep the old grab beam and impact rules; only the held bulky items use the two-person carry.
- Bump detection is a speed-drop heuristic on `player.hSpeed`; a very fast door / ladder stop could count as a bump (cooldown 1.1 s, capped loss).
