# Wave 4 - ARCADE: chess, dama and the carnival corner (module `arcade`)

Owner ask: "satranç, dama, karnaval oyunları" for downtime with friends. Everything is EN / TR / RU.

Files
- `src/game/chess_rules.js` - pure chess: full legal rules (castling, en passant, promotion with queen default, check / checkmate / stalemate, insufficient material, fifty-move), SAN notation, perft, AI (level 1 = greedy 1-ply + noise, level 2 = 2-ply alpha-beta + capture quiescence, ~30 ms per move).
- `src/game/draughts_rules.js` - pure DAMA (Turkish draughts): 16 men per side on ranks 2-3, men step forward / sideways, flying kings, mandatory captures with the MAJORITY rule, captured pieces removed after the sequence and never jumped twice, a man reaching the last rank mid-capture continues as a man and is crowned at the end, no moves = loss, K vs K and 60 quiet plies = draw. AI: level 1 = 2-ply + noise, level 2 = 4-ply alpha-beta.
- `src/game/arcade_core.js` - table state machine (seats, AI seats, mode toggle, new game with colour swap, resign, repetition draw, snapshots) and the booth economy (fee, payout tables, per-day prize cap, sessions). Pure, node-tested.
- `src/game/arcade.js` - the module: 3D views, interactables, net, panel + booth wiring. `src/game/arcade_booths.js` - client-side booth gameplay. `src/models/arcade.js` - table + pieces + carnival models. `src/ui/panels/arcade.js` - the 2D board overlay (CRT panel look).
- Shared-file edits: only `// [import:arcade]` / `// [slot:arcade]` in `src/game/game.js`.
- Tests: `node tools/harness/arcade.test.mjs`; in-game check `tools/harness/wave4_arcade.js` (see below).

## Where things are
- CHESS / DAMA table (same table, mode toggle in the panel): in the ship (east side, near the cupboard), on the HQ pier (west of the ship door, next to the football pitch) and on the homeworld pad (west of the ship). Each table is its own game (`ship`, `hq`, `home`).
- CARNIVAL corner: HQ pier only, north-east of the pitch (about x 11, z 27): three booths facing the ship: CAN KNOCKDOWN, SHOOTING GALLERY, STRENGTH TESTER.

## Boards
E on the table opens the overlay (also for spectators: everybody sees the same snapshot). Sit White / Black, or take one seat and pick "AI easy / AI normal" for the empty one. Click a piece, green dots show the legal targets (red ring = capture); pawns reaching the last rank open a promotion picker. Dama: click the piece, then the landing squares step by step for multi-jumps. Last move + check are highlighted. Move log on the right. Buttons: switch CHESS / DAMA (only between games), New game (colours swap after a finished game), Resign, Stand up.
The host validates everything (seat, turn, legality, distance <= 12 m to sit); walking away (> 16 m), leaving the game or the map disappearing stands you up; a table with nobody seated resets. Seat / turn / result are shown in the interaction prompt.

## Carnival
Each booth costs 6 credits (taken from the ship credits by the host), a round is played locally and the score is reported; the host clamps and pays.
- Cans: 3 balls (LMB), 6 cans in a pyramid, score = cans off the shelf. Pays 3 -> 4, 4 -> 8, 5 -> 14, 6 -> 24.
- Gallery: 25 s, LMB fires the toy gun (4 shots / s), two rails of moving targets (big yellow 1 pt, small red 3 pt), blue decoys -2. Pays 6 -> 4, 10 -> 9, 15 -> 15, 20 -> 24.
- Strength: LMB starts the meter, LMB stops it, 3 swings (faster each time), best counts, bell at 99+. Pays 40 -> 4, 70 -> 8, 90 -> 14, 99 -> 24.
Balance: the lowest prize is below the fee (mediocre play loses credits, node test checks the expected value of an "average player" stays under the fee), jackpot = 4x fee, and each player can win at most 80 prize credits per game day (`DAILY_CAP`); after the cap the game is still playable for fun (the result says so). A prize also gives 4-5 XP. Anti-cheat: the host ignores results faster than humanly possible (`minSec`), clamps scores, allows one session per player and a 3 s cooldown.

## Rock-Paper-Scissors (social game, anywhere: ship / homeworld / HQ / moons)
Challenge a crewmate within 8 m: look at them and press E ("Rock-Paper-Scissors with NAME [E]", no wager) or type `/rps [wager] [name]` in chat (wager 0-25 Clout, target = the name or the crewmate you look at). The target sees "NAME challenges you ... [Y] Accept [N] Decline" (20 s). Best of 3 (a draw replays the round, max 7 rounds, then the leader wins). Each round: keys 1 / 2 / 3 = rock / paper / scissors within 8 s (a missing pick is random and marked). Both players get a floating hand-sign sprite over their head (question mark -> tick when locked -> fist bobbing on the beats "ROCK - PAPER - SCISSORS - SHOOT!" -> both signs, winner tinted gold, loser grey); spectators see the same sprites + a toast line.
Cheat-proof by construction: a pick goes only to the host (`arreq` rps pk); the host tells the opponent just "X has picked" (no value) and sends one `rpsv` reveal with both picks after the second pick or the timeout. Nobody can see the other pick first.
Wager (Clout, personal currency; the shared ship credits are never touched): both clients check their own balance; the winner is paid by the host through the normal `xp` reward message (reason "Trade - ..." so the multiplier does not apply), capped at 60 Clout of winnings per player per game day; the loser's client deducts exactly what the host paid. A cancelled game (someone leaves, dies, walks > 26 m away, ship changes phase) pays nothing. Rules + host manager: `src/game/arcade_rps.js` (node-tested, incl. leak check of the pick event, timeout, daily cap); client HUD / sprites / keys: `src/game/arcade_rps_ui.js`.

## Net (all prefixed `ar`)
- `ar` (HOST_ONLY, host -> peers): `{k:'t', s: snapshot}` full table state (also sent to late joiners), `{k:'go', booth, sid, fee, left}`, `{k:'res', booth, score, pay, capped, cheat, left}`, RPS: `rpsc` (challenge) `rpsn` (cancelled / declined / expired) `rpsr` (round start) `rpsp` (X locked in, no value) `rpsv` (reveal, all peers) `rpse` (match end + pay).
- `arreq` (request, client -> host): `{op: sit|stand|ai|kind|new|resign|move|sync, id, ...}` booths `{op: play|end|abort, booth, sid, score}` and RPS `{op:'rps', s: ch|ac|no|pk|lv, to, w, mv}` (`s`, because `a` is the request name in the net layer).

## Knobs
`arcade_core.js`: `BOOTHS` (fee / pay tables / minSec), `DAILY_CAP`, `PLAY_COOLDOWN`, `REP_DRAW`. `arcade.js`: `SITES` (table positions), `CARNIVAL_AT`, `SEAT_RANGE`, `PLAY_RANGE`. `models/arcade.js`: `GALLERY` (rows, speeds), `CANS`.

## Verified / not verified
node: perft 8902 (start), kiwipete 97862, position 3 43238, position 4 9467; mate, stalemate, castling rules, en passant (incl. the pinned case), promotion, AI finds mate in one; dama capture rules (mandatory, majority, sideways, no backward capture, flying king, spaced men, last-rank continuation), table state machine, booth economy + daily cap.
In game (headless Chromium, software GL): see the end of this file.

## Known gaps
- Boards only on the ship / HQ pier / homeworld pad; the carnival only on the HQ pier.
- No draw offers, no clocks, no undo. Chess 3-ply AI ("hard") not offered (too slow for a synchronous host move).
- Booth rounds are client-authoritative (the host clamps and caps but cannot see the throws): fine for a co-op game, not competitive-proof.
- Ring toss was not built (cans only); no cosmetic tickets (credits with a daily cap instead).
- Piece glyphs use the system font's chess symbols (forced text presentation); if a system lacks them, the board falls back to a serif.

## In-game check (headless Chromium, software GL, `tools/harness/wave4_arcade.js`)
- `#ship` mode RAN (twice, no page errors): sit White, add the normal AI as Black, an illegal move is refused, e2e4 accepted, the AI answers ~1 s later, 10 plies played through the real host path, the overlay opens with 64 squares + 32 pieces. Screenshot looked right (board, seats, resign / stand up, move log, last-move highlight).
- `#hq` mode (smoke landing on a moon + takeoff, HQ pier, all three carnival booths through the real request path with fees / payouts, RPS client driven by fake host events, screenshot of the carnival) and `#dama` were WRITTEN but NOT RUN: the shared browser queue was too long (the lead batches browser checks). First thing to do after merge: `--url '/?autohost=local&code=T1&name=Tester#hq'` and look at the carnival screenshot (booth placement / scale / sign text are unseen).
- Not tested with two real peers: RPS challenge / accept over the network, table snapshots to a second client, booth `go` / `res` on a client.
