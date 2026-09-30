# ALGOCTX: context-true Algorithm + dev-language sweep (REVIEW_W8_MORNING tasks 1 + 4)

## What
* **Context + expiry per line.** `algorithm.show(d)` computes `ctx = OG.inferCtx(d)` (explicit `d.ctx`, else pool key, else wording: `HR:` -> `orbit`, "terminal" -> `ship/orbit`) and drops the line at once when it does not match `tagsNow()` (phase + inShip / indoor / expedition). Queued items carry `ctx` and `exp = now + ttl` (default `QUEUE_TTL` = 12 s); `clientUpdate` and `startNext` call `OG.prune`. So "The terminal shows today's routes" is gone on a moon, HR lines are orbit only, and a line queued in orbit does not survive the landing.
* Tags: `orbit` (phase orbit, also `ship`), `moon` / `company` (phase) + `ship | facility | outdoor (+ expedition)`; `any` always matches.
* Explicit sources: `lore.say(text, { ctx, ttl })` (also over the `say` broadcast), story beats (`orbit`), onboard `say.terminal / hangar` (`ship, orbit`), `say.land / goal` (`moon`), `TUT_STEPS[].ctx`. Guide: no `move` line when `game.onboard.controlsPinned()` (stream pinned it / Hiring Day done). `TUT_START_SAY` removed.
* Scramble glyphs: 2 frames per line (was the whole typing time).
* **Auto-hide / reactive:** the box already fades out when nothing is queued; with stale lines dropped it is mostly off and speaks on events. The owner question (react-only vs scheduled) defaults to "react": no scripted HR / tutorial lines outside their context. Scheduled orbit chatter (`orbit_idle`, about 1 per 80-150 s) and guide tips remain (they are budgeted).
* **One viewer count:** algo1 owns it. The stream overlay calls `algo1.seedViewers(n)` when it ends (host; floor = 60 % of it, sent in the `view` message as `f`), `driftViewers` keeps it moving, and overlay + LIVE tag share `fmtLive` ("1,470"). API: `game.algo1.viewers()`.

## Dev-language sweep
* "Host revived Client." was `systemMessage` (chat line + toast, the same sentence twice): now a toast only (also for "is down"). Harness names `Host / Client / Tester` (dev URL `?name=`) are aliased to crew handles in `main.js` (`DEV_NAME_ALIAS`).
* "Optional onboarding started ... TUTORIAL SKIP" removed. Loot panel (`public/mods/ship-loot-tracker.js`): "LOOT ABOARD", "The Company pays 37% today: X, N to go"; the quota numbers are only in the top bar. TR / RU in `algoctx_i18n.js`.
* Quota mismatch (top bar 130 vs report 400): production uses `run.quota` for both (host summary `quota: run.quota`); the shot came from `qa_night2_*` scripts that pass `quota: 400` by hand. No code change needed.
* Not done: "Interior: Data Center" on the 56K-Dialup card (moon `interior: 'factory'`, name from `INTERIOR_NAMES`).

## Test / knobs
`node tools/harness/algoctx.test.mjs` (+ onegoal, firstrun, onboard, guide, algo1, algo2, story_host, downed, hudcalm, trim). Knobs: `QUEUE_TTL`, `KEY_CTX` (onegoal_core.js), `VIEW_GAIN` / `seedViewers` floor (algo1_core.js).
Not verified: no browser run (lean mode).
