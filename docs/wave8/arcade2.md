# Wave 8 - ARCADE2 (module `arcade2`)

Four short arcade games on the ship cabinet, a crew leaderboard and small capped rewards.

## What
- Entry: the existing ship arcade cabinet (`shiplayout` fixture `arcade`, no layout change; ship2_overlap stays 0 problems). Its `[E]` prompt now reads "Play ARCADE" and opens the menu. Terminal: `ARCADE` (menu), `ARCADE FLAPPY|CABLE|STACK|INVADERS` (jump into one), `ARCADE TOP` (crew scores), `ARCADE CLASSIC` (the old Flappy Phish).
- Minigame `arcade2` (`src/minigames/arcade2.js`, registered into `MINIGAMES` by the module): canvas menu + four games, 200x150 PSX/CRT look with the shared bitmap font. Keyboard + mouse. Each attempt is seeded from the UTC day, so the crew shares the same pipes / plugs / pieces / comments.
  - FLAPPY FISH (75 s): SPACE / click / UP, Company pipes; every 8-13 s the Algorithm sends a DONATION (1 s warning) that flips gravity for 5 s.
  - CABLE RUNNER (60 s): snake; plugs +1, gold plug +3 (vanishes); arrows/WASD, click steers toward the click.
  - QUOTA STACK (90 s): scrap tetrominoes; A/D, W rotate, S soft, SPACE drop; mouse: move = column, click = rotate, click the bottom strip = drop. Score = 1 per piece + 8/20/40/70 per 1/2/3/4 lines.
  - VIEWER INVADERS (60 s): 3 lives, waves of hate-comments (L, MID, BOT, COPE, RATIO...), A/D or mouse to move, SPACE / click to fire.
- Rules live in `src/game/arcade2_core.js` (pure, node-tested).

## Rewards / anti-farming
- Leaderboard: per UTC day, per game, one row per player (their best), top 5 synced. Host-authoritative (`ac2req` -> host validates -> `ac2s` broadcast). Host copy persisted in the host profile (`profile.arcade2.hb`).
- Prize: `score / PRIZE_DIV` Clout per play (fish 1, cable 1, stack 4, invaders 5), hard cap `PRIZE_CAP = 40` per player per day over all games. Enforced by the host ledger AND by the receiving client's own profile ledger (`profile.arcade2.paid`, reset each UTC day). Reason string `Daily arcade` is flat (not multiplied by coin boosts). Host also rejects scores above `MAX_SCORE` and plays closer than 12 s apart.
- Cosmetic: hat `arcadecap` ("Arcade Champion") unlocks once when any game's `TARGETS` (25 / 30 / 60 / 90) is beaten; sets `profile.arcade2.champ`, the wardrobe rule `hat:arcadecap` does the actual grant.

## Net
`ac2req` client->host `{op:'score', game, score}` | `{op:'sync'}`; `ac2s` host->everyone `{k:'b', day, b}` (boards) | `{k:'r', to, game, score, best, rank, coins, champ}` (result for one player).

## Knobs
`arcade2_core.js`: `TARGETS`, `MAX_SCORE`, `PRIZE_DIV`, `PRIZE_CAP`, `MIN_PLAY_MS`, `BOARD_SIZE`. `arcade2.js` (minigame): `LIMIT` seconds per game.

## Test
`node tools/harness/arcade2.test.mjs` (29 checks: caps, rate limit, ranking, day reset, scripted play of all four games, seed determinism, fresh q0/lv1 cabinet entry and classic handoff).

## Fresh-game access
The physical cabinet menu now includes original FLAPPY PHISH as its fifth option, alongside the four newer games. Selection closes the menu and calls the original native classic entry, preserving its score/profile handling. The menu has no quota, level or day requirements; central onboarding/fixture gates control access separately. Death and overlapping minigames still prevent entry, and prize limits/cosmetic achievements remain unchanged.

## Known gaps
No browser playtest (shared lock jammed): feel, difficulty and targets untuned. Canvas HUD words are English arcade words (bitmap font has no Cyrillic/Turkish); sentences, statuses, help and toasts are localised EN/TR/RU. Cabinet screen texture still shows the old attract loop.
