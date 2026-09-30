# Wave 9 - greed line, tax preview, CLEAN SHIFT (REVIEW_W9_STATE section 5, NEXT 2)

**What**
- Greed line (objectives.js, moon phase): once the day target is met (today >= target, or the target is covered by scrap aboard) and world scrap is still lying around, the goal line reads "▮{left} still in here · deep room {m} m · leaves {time}" (deep-room part only indoors with a bigSpot > 5 m; time = ship departure 24:00 via fmtClock). `left` = sum of uncollected, unheld, sellable world items outside the ship (same filter as host leftValue).
- Tax preview (objectives.js + onegoal.js `preview`): while the local player is ON AIR or TAGGED (`run.fc.p[self][1|2]`) and carries scrap, the carry line becomes "▮251 → ▮188 if tagged" (or "(viewer tax)" once tagged). Uses feedcams_core.taxOf per item. Off camera the old "Carrying n items" line stays.
- TAGGED goal (onegoal.js): only emitted when the tagged player carries scrap (`taggedGoalOn`).
- CLEAN SHIFT: feedcams counts fresh tags per day (`F.tg`, synced in the fc fingerprint). host.js at the day summary calls `feedcams.cleanBonus(collected)` = 10 % of the haul (cap 200) when cameras existed, nobody was tagged and there was a haul; adds to credits, `summary.clean`. The report shows a CLEAN SHIFT line (feedcams daySummary hook).

**Pure helpers**: onegoal_core `carryPreview`, `greedOn`, `taggedGoalOn`; feedcams_core `cleanBonus`, `CLEAN`.
**Knobs**: `CLEAN.pct`, `CLEAN.max`.
**Tests**: `node tools/harness/onegoal.test.mjs` (extended, 48 checks), feedcams.test, feedcams2.test, rewardviz.test, `npm run build`.
**Gaps**: no browser run; ship leaves at 24:00 (the mock text said 23:00); client-only late joiners see no CLEAN line until fc syncs (tg is in the fc sync); a player tagged and back home still counts as tagged (strict).
