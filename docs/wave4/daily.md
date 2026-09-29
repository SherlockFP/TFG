# Wave 4 - DAILY (module `daily`): the retention / reward loop

Owner: "insanlara dopamin vermek icin daily bonus falan koy". Goal: tasteful, never predatory. No real money, no timers that punish,
one gentle streak with a grace day. Everything is a **personal account reward** stored in `profile.daily` (localStorage profile).

## What is in
| Piece | Where | Notes |
|---|---|---|
| 7-day login calendar | main menu **DAILY**, in-game **B** / terminal `DAILY` | coins, crafting components, forge shards, day 7 = cosmetic crate. One grace day, gentle reset, comeback bonus (+50 % day-1 Clout) |
| Daily challenges (3) + weekly (3) | same panel, CHALLENGES tab | seeded by the local date / ISO week, so every player sees the same set. 1 easy + 1 mid + 1 hard; weekly = volume + survival + special. One **reroll** per day (unfinished, same difficulty) |
| Crates | CRATES tab + reveal | earned only: login day 7, all 3 dailies, all 3 weeklies, quota met (1/day), season milestones, level milestones (every 5th level). Reveal = shake, lid, spinning reel, tier-coloured glow + tier sfx. Reward is fixed by a stored seed (no reload rerolls), duplicates turn into Clout |
| Season track | SEASON tab | free, 30 tiers, restarts monthly (`YYYY-MM`). Season XP from challenges, surviving days, quotas, kills (capped), scrap sold (capped), cores, bosses, minigames. Cosmetic season crates at tiers 3/6/12/18/24/30 (fixed tier), titles at 10 / 20 / 30. Unclaimed tiers are auto-collected when the month rolls |
| First win of the day | in game | the first "Survived the day" / "Core extracted" / "Escaped the Backrooms" reward each local date is paid **twice** (XP and Clout) |
| Juice | in game | level-up fanfare (rings, edge glow, confetti, "NEW!" pill, milestone crate), quota celebration + Quota Crate, "NEW!" badges (menu entry on the CRT, tabs, HUD chip `B DAILY NEW!`) |

## Files
- `src/game/daily_core.js` - PURE rules (dates, streak / grace / reset, tamper guard, seeded challenges, crate roll, season maths, stash, badges). Node tested.
- `src/game/daily_svc.js` - glue for one profile (menu without a game, or in a session through `game.progress`).
- `src/game/daily.js` - the in-game module (`this.useModule('daily', installDaily)`): observers, first win, fanfares, delivery, key / dock chip / terminal.
- `src/game/daily_text.js` - EN -> TR / RU strings.
- `src/ui/panels/daily.js` - the DAILY panel (CRT panel look), `src/ui/daily_fx.js` - crate reveal, fanfare, confetti, celebration.
- Shared edits (all tiny): `game.js` (import + slot), `ui.js` (`screen_daily`, label), `crtmenu.js` (DAILY entry + NEW! badge), `profile.js`
  (`FLAT_REASONS` also skips multipliers for `Daily*` / `Season*` reasons), `achievements.js` (the old automatic login bonus stands down when `game.daily` exists;
  `profile.login` is still kept in step so the "Loyal Employee" achievement and hat rules keep working).

## Rules worth knowing
- **Dates** are local calendar dates (`YYYY-MM-DD`). Weekly = ISO week. Season = calendar month.
- **Streak**: gap 1 day = +1, gap 2 days = grace (once; refills after 3 on-time claims or after a reset), gap 3+ = back to day 1 (best streak is kept; comeback bonus if the streak was 3+).
  The calendar wraps after day 7 (each finished week adds +10 % coins, max +50 %).
- **Clock tamper guard**: `profile.daily.hw` is a high-water mark. The effective time never goes back, a date can be claimed once (login, quests, first win, once-a-day caps are all keyed by
  the date), a rewind of more than 3 h is counted (`daily.tamper`) and shown as a note. Hopping the clock forward only borrows from the future (the mark stays ahead, so the real days that follow
  stay locked until the calendar catches up). Offline and local-only, so this is a deterrent, not security.
- **Parts and shards** (components, forge shards) cannot be put into a profile, they are items. They wait in `profile.daily.stash` and are delivered to the ship in **orbit**:
  client `dyclaim {n, items}` (request) -> host validates (whitelist `comp_*` / `shard_*` without key items, <=12 per id, <=30 total, 2.5 s rate limit, orbit only) spawns them next to the player ->
  `dymsg {k:'ok', n, items}` back to that player only (host-only message). The stash is reduced only on that ack.
- Season crates are cosmetic crates of a fixed tier; if you own every cosmetic of that tier the roll walks to the nearest tier that still has one, and if you own everything you get Clout.
- Crate-eligible cosmetics come from `game/cosmetics.js` (`entriesFor` + colour suits), minus `secret` ones and the Symbiote (Venom).

## Net messages added
`dyclaim` (client -> host request), `dymsg` (host -> one client, in `HOST_ONLY`). Nothing else is networked: challenges, streaks, crates and the season are local.

## Test
- `node tools/harness/daily.test.mjs` - 1300 assertions: streak across dates, grace, reset, comeback, no double claim, clock rewinds / hops, seeded set equality (two players, same date / week),
  reroll rules, quest tracking and claiming, crates (deterministic, tier weights, duplicate protection), season maths + rollover, stash delivery caps, badges.
- Browser: `flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port <p> --script tools/harness/wave4_daily.js --shot out.png --wait 4000`.

## Knobs
`LOGIN_REWARDS`, `QUEST_REWARD`, `DAILY_POOL` / `WEEKLY_POOL`, `CRATES` (tier window + cosmetic chance), `CRATE_ITEMS`, `CRATE_COIN`, `SEASON_NEED` (300 + 15 per tier; ~15.5k season XP in total),
`seasonReward`, `SEASON_TITLES` in `daily_core.js`; `KILL_SXP*`, `SELL_SXP_CAP`, `ANOMALY_STAGE`, `DELIVER_EVERY` in `daily.js`.

## Known gaps / ideas
- "Survive an anomaly" = reach STATIC stage GLITCHING (2) during a moon day and survive the day. A cleaner hook would be an explicit `tfg:anomaly` event.
- Challenges count kills through `Progress.kill` (own kills only; pet / deployable / grenade kills do not count). Melee = the held item at the kill moment.
- Season and crates only exist locally, no leaderboard; season rewards do not carry a 3D preview (text card only).
- The XP feed shows the English reason ("Daily challenge") because `Progress.addXp` reasons double as regex keys.
- Not tested with 2 real players (the only net path is `dyclaim` / `dymsg`, host + one client).
