# Wave 2 - THE ADMINISTRATOR + THE BOARD (module `boardgame`, dev port 5269)

Files: `src/game/board_rules.js` (pure rules), `src/game/boardgame.js` (install, host + client), `src/models/administrator.js`, `src/models/board.js`, `tools/harness/board.test.mjs`.
Shared-file edits: only the `[boardgame]` import + `useModule` slot in `src/game/game.js`. Net: `bg` (HOST_ONLY: adm | whisper | start | turn | ev | end) and request action `bgreq` (gaze | roll | duel | leave).

## The Administrator (module-managed entity, non-hostile)
Host arms it on every `moon` landing: ~4 % roll, max once per day, never before quota 1 (`shouldAppear`). 40-150 s later it stands 38-70 m away outdoors (or 13-27 m down a sightline indoors), never inside anybody's view.
It faces the nearest player, walks closer at 1.1 m/s ONLY while nobody sees it (never nearer than 22 m outdoors / 11 m indoors), whispers "time... to choose" (subtitle + static) and leaves after 4 min. Model: 3.45 m thin grey suit, tie, briefcase, egg head with a face-screen (canvas, 32x44, pixels sliding in bands ~12 Hz).
Gaze: crosshair within 0.55 m of the head at <= 20 m with line of sight for 2 s (vignette + heartbeat, looking away cancels) -> host validates the aim -> session for the gazer + every living player within 10 m.

## The Board (realm at x/z 6400, y -332 = "indoor" zone, safety floor collider, no new scene lights: Basic materials + 4 pooled emitters)
24-tile ring (7x7 square, START south-west, EXIT next to it), huge die in the middle, the Administrator seated at the head of the table, scoreboard, chips / cards. Players keep their real avatar (stun-locked, free look) and are moved from tile to tile (`[T]` = table view).
Tiles: LOOT (credits / item, banked), TRAP (-15 % HP, never lethal, knocked back 2), CARD (10 cards: forward 2, back 3, lose a turn, roll again, swap with the farthest teammate, steal from a teammate, pay the toll, team spirit = furthest-behind +3, credits, +15 % HP), DUEL (timing bar or reaction test, vs a seeded board score: win +3, lose -10 % HP and back 3), SHORTCUT (4->8, 14->17), REST (+10 % HP), EXIT.
Every unfinished player rolls once per round; everyone must be on EXIT before round 12 ends (overshoot by 1 still finishes, more bounces back). Host rolls a seeded, logged die (`BoardRng`), broadcasts events with fixed presentation times; AFK players are auto-rolled after 30 s.
Balance (autoplay, node test): solo ~90 %, 2p ~80 %, 3p ~70 %, 4p ~62 % team success.

## Outcome
Success: everyone returns to where they stood, banked loot is paid (credits to the ship, items spawn at the return spot) + a reward card (rare item or shards; credits when forge shards are missing).
Fail (turns out) or ship leaves (host aborts at `takeoff`, players are put back on the ship): every player who did NOT reach EXIT loses their single most valuable takeable item (value x tier + enhancement; hotbar / bag / equipment via the host `it rm`; not bags, bodies, soulbound) and their HP is cut to 10 % ("TERMS ENFORCED"); finished players walk out with their loot. Late joiners just stay on the ship.

## Verified / not verified
node --check, `npm run build`, `node tools/harness/board.test.mjs` (rules + a stub-DOM run of the whole host/client flow: gaze -> transfer -> forced turns -> success / fail / ship-left) all pass.
NOT run in a real browser (headless + screenshot were cancelled by the lead: machine overloaded): visuals, the real key handling (`Space` / `T`), fog / far-plane in the realm and multi-peer networking are untested. Debug API: `kefal.game.boardgame` (`spawnAdmin`, `gaze`, `force.rolls / cards / duel`, `tableView`, `state`).
