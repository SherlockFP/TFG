# Wave 8 night - TRIM (REVIEW_W8_NIGHT §3: cut, merge, hide)

Owner default: no new systems. This pass only removes overlap. New files: `src/game/headline.js` (30-line wrapper), `headline_core.js` (pure rules), `headline_i18n.js`; node test `tools/harness/trim.test.mjs` (34 checks). No new net messages (`run.hl` rides the landing phase message next to `dailyEvent` / `mm`).

## 1. Day modifiers: ONE headline per landing
`headline.js` wraps `hostSetPhase('landing')` (installed after mapmods, so it runs first) and stamps `run.hl = { k, n, d }`. Everything that lost is suppressed that day.

Priority (what is known when it is decided): **mapmods affix set > role day > voyage warp > daily event > trend**.
Deviation from the brief (daily > role): a role day is rolled and announced in orbit ("Tomorrow, casting call") before the daily event exists (the daily is rolled at the lever), and every real landing has a daily, so a strict daily > role order would make role days impossible. The announced role day therefore keeps its day; the daily is nulled. Same reason a warp (which fires at the lever, before the daily) beats the daily.

| loser | how it is suppressed |
|---|---|
| daily event | `run.dailyEvent = null` unless it is the headline (hud no longer re-rolls a fallback: `todaysEvent` returns null when `run.hl` exists; no "NORMAL FEED" sys line on other headline days) |
| mapmods affixes | `mapmods.applyLanding` now REPLACES the daily event (name `SECTOR MAP`, desc = affix names); only a weekly challenge stays merged (and then no affixes roll: it is an opt-in mode) |
| role day | not rolled when the coming map has affixes (`roledays.hostRoll`); cancelled at the lever if an affix set appeared after the roll (ATLAS) or the weekly won |
| voyage warp | not rolled on affix / role days (`voyage` lever wrapper) |
| trend creature | `story.trendOn()` (spawns, extra clone, drops, TRENDING intercom line, dock, objective hint) only on a landing whose headline is the trend; the PATRON / TREND terminal text still shows the weekly trend |

Landing card: the briefing box shows only the headline (label `SECTOR MAP` / `DAILY EVENT` / `ROLE DAY` / `VOYAGE WARP` / `TRENDING`). Affix cards + numbers now wait until **quota 2** for a fresh staged profile (was quota 1); veterans, unlock-everything and Quick Shift are unchanged. Tomorrow's affixes are also hidden from the route board / ATLAS readout until then.
Consequence to watch: trend days are now rare (only when no daily exists: expeditions, first-run calm). If the owner wants trend visible, give the daily a "no event" chance instead of letting trend compete.

## 2. Algorithm voices: one gate
Every voice already ended in `algorithm.show` (algo1 / algo2 / lore / story / soul PA / feedcams tips / guide all call `lore.say`); the gaps were:
- **classes** `teach` (d.pri) > `danger` (`opts.cls = 'danger'`) > `flavour` (default), ranked in the queue (`onegoal_core.enqueue`, max 3, the oldest flavour drops first); a teaching / danger line cuts a flavour line short. Danger has its own 8 s gap and is not muted by a chase / peak (it is the reason for it); flavour keeps the 45 s / chase-quiet pacing for every profile.
- **dedupe** near-identical lines (Jaccard >= 0.8 after folding digits / case / punctuation) are dropped for the rest of the day (deaths exempt).
- **crdirector captions** (`TRAFFIC SPIKE`, `PEAK TRAFFIC`, `HEAT`, first-encounter rule line) now go through `lore.say` (danger / teach) instead of their own DOM caption; the DOM caption stays as the fallback when lore is missing.
- story `sys` lines (patron job / allegiance / trend text) are chat-feed system messages, not Algorithm voice; left alone (proposal below).

## 3. Currencies
The wallet is credits + Clout (wallet.js); the HUD already shows credits only (hud6). Audit of where Clout was a spendable parallel wallet in the first hour, now hidden until the store's hub unlock (`hubgate` `shop`, quota 1; `wallet.cloutOpenOf(game)`, veterans / unlock-everything unchanged):
- Company Store panel: Clout balance and Clout-priced cards hidden; terminal STORE list: Clout prices and the Phish Dayı line hidden; hubgate `shopLock` also locks Clout stock host-side.
- Black Market (Phish Dayı): opens with the same lock (`onboard.deny('shop')` toast).
- No other parallel wallets found in the shop / terminal (no tokens, trophies or zone credits are ever priced; forge shards / components are materials, `wallet.MATERIAL_KINDS`).

## 4. One-line hides
- Hub panel lists what is open + only the NEXT unlock step (was: the whole 12-system roadmap). The door line ("N of 12") was already hidden at 0.
- Facility side jobs wait until quota 2 for a fresh staged crew (uses the host-synced `run.hub`, so every peer rolls the same).
- Kill-count assignments before quota 3: already done by onegoal.

## Proposals (bigger than one line; NOT done)
- Wardrobe (Clout cosmetics), Trade panel (Clout field), Record / main-menu Clout lines, Pets (already behind hub q2), skill-tree respec cost (behind hub q1): keep ◈ but give Clout ONE meaning (fans / LIVE score from feedcams) and stop it being spendable pocket money, per REVIEW §3.
- Threat sources: crdirector as the only spawner; cut horde / siege before quota 3 (needs the threatpool decisions).
- Worlds: campaign = 3 hero moons + 1 expedition reward; the rest into Voyage after quota 5 (a route filter in `routeboard` / `moons`).
- Goals: merge quota + one bonus into a single "Shift order" line; move facjob main job into that line (onegoal already shows one goal).
- Story `sys` lines and studio / downed / lcmods quote lines: route through the ticker too (they still use chat).
- Side games (resto / farming / food / pets / forge / arcade / chess / dance / mining / trade / zones): freeze, no new ones.

## Verify
`node tools/harness/trim.test.mjs` plus onegoal, firstrun, hubgate, mapmods (one assertion updated: the affix set replaces the daily event), algo1, algo2, crdirector, roledays, story, story_host, daily_svc, hudcalm; `npm run build`. Not browser-run.
