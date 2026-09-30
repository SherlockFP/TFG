# First 15 minutes (wave 8, "firstrun") - one teacher, one goal, one card at a time

Problem (CRITIQUE_W8 #1, #3, #7): a brand-new player got 4 objective lines, 3 toast stacks (`game.tutorialHint`), a daily-event card, a sector-map card, a facility job, an
outdoor drone, a wrong door, a morning vote and an Algorithm caption every few seconds. Nobody could say what the game is. Owner decisions (CONTINUE.md section 2): core verb =
dodge the camera / cut the feed; gradual unlock through the Hub door; morning vote rare.

Code: `src/game/firstrun_core.js` (pure rules, node-tested) + `game.onboard.fr` (in `onboard.js`, the only stateful part) + one optional-chaining line in each module that speaks.
Test: `node tools/harness/firstrun.test.mjs`.

## Timeline BEFORE (read from code)

| t | Source | What the player saw / was told |
|---|---|---|
| menu | menu* | CRT menu, NEW GAME |
| 0:00 | onboard | Cell 07: sign card (`hud.bigText`), PA lines pa1..pa3 (top bar), Algorithm alg1 (16 s) + alg2 (22 s) |
| 0:00 | game.tutorialHint | 3 toast lines ("Use the TERMINAL...", "Buy tools...", "Pull the LEVER") fired on the first `orbit` phase while the player is still in the wing |
| 0:00 | objectives + guide | Hiring Day lines (`myLines`, 1 main + skip hint); the guide waits (`onboard.active()`) |
| 0:30-4:00 | onboard | corridor: crouch / sprint shutter / locker + flashlight / mug / blackout + figure / lockpick; one Algorithm `say.*` line per step |
| 4:00 | onboard | board the ship; objective terminal -> lever; `say.terminal` |
| 5:00 | orbit + hud | (the MORNING RULES vote is already skipped on day 1-2) `hud` briefing card on `landing` (moon, interior, weather, danger, loot, DAILY EVENT block, facjobs JOB/SIDE/LAYOUT rows, TIP) |
| 5:10 | mapmods | sector-map affix card (top, 9 s) on touchdown, numbers merged into the daily event |
| 5:10 | soul | touchdown title card (4.2 s, 30 % from top) + dust; walk line 22 s later, then every 75 s (its own 45 s gate) |
| 5:10 | onboard | `say.land` (Algorithm) + objective "HIRING DAY GOAL 0/50" |
| 5:10 | guide | tutorial lines for inv / scan (after Hiring Day) + advisor "you have not tried X" tips |
| outdoors | feedcams2 | 1 patrol drone even on the very first landing; crdirector phase captions ("TRAFFIC SPIKE") |
| outdoors | worlds3 | "Facility size: X" toast at landing; wrong door 100 % on day 1 (bigText "THE WRONG DOOR" + Algorithm line + objective "wrong door: about N m") |
| indoors | facjobs | main job (+55 % a side job) as an extra objective, lever fee if you leave with the main job untouched |
| indoors | feedcams | tutorial camera = "nearest room to the entrance, 2+ cells away" (not tied to the loot), tips at 16 m (red light) / 9 m (blind spot) |
| return | onboard | first return: day summary, Algorithm first remark (`rem.*`); guide "sell at HQ" step |
| always | algo1/algo2/lore/soul/downed/feedcams | Algorithm captions (`lore.say` -> `algorithm.show`): no global rate limit for a new player |
| always | daily | "Your daily reward is ready [B]" / season / quest toasts even though the Hub keeps the panel locked until quota 5 |

## Timeline NOW

Budget stage (`fr.stage()`): `hiring` (flow running) -> `first` (Hiring Day done or skipped, nothing sold) -> `early` (first sale, quota 1 not met) -> `free` (quota 1 met, veteran,
"Unlock everything", Quick Shift). Only fresh `staged` profiles are budgeted; every other player sees exactly what they saw before.

| Beat | What shows now | Rule |
|---|---|---|
| Cell 07 -> hangar | Hiring Day (unchanged: move, crouch, sprint, flashlight, first loot, lockpick, board) | its lines are priority Algorithm lines; `tutorialHint` toasts are skipped (marked seen) |
| Ship | one objective: terminal -> lever | `objectives` keeps 1 goal (+1 warning) while budgeted (`fr.only`) |
| Descent | briefing card without daily-event block / facjobs rows | daily modifier + facility job wait for the first sale |
| Touchdown | soul title card; no sector-map card; no drone; no wrong door; no facility-size toast; no crdirector caption on top of the card | mapmods = quota 1, wrong door = day 2 (deterministic `firstDay(run)`), one card lease |
| Outdoors | ONE line: "Find the facility entrance (N m). Goal: 50 scrap." | `first` flag on the entrance / Hiring Day line |
| Indoors, camera within 22 m | ONE line: "Red camera ahead: stay out of its cone, or slip under it (green ring)." + priority hint "That red light is a camera. The cone on the floor is what it sees..." | designed camera moment below |
| Loot | "HIRING DAY GOAL: 12 / 50", then "Goal reached. Pull the lever" | onboard |
| Return | summary + first remark | onboard |
| Orbit with scrap, nothing sold | ONE line: "Sell your N of scrap at the HQ" (instead of "Land on X") | `fr.wantSell` |
| HQ | "Put scrap on the COUNTER, ring the BELL" -> first sale ends `first`; Hub unlock card at quota 1 | existing |
| Whole window | Algorithm: 1 non-priority line per 45 s (`algorithm.show` gate); priority = Hiring Day, tutorial lines, camera tips, deaths | `fr.algoOk(pri)` |
| Whole window | no advisor tips, no daily/season toasts (Hub `season` locked), no pets/arcade prompts (Hub already hides them) | `fr.calm('tips')`, `locked('season')` |

## The first camera is a designed moment (feedcams)

* **Guaranteed and placed.** On the first landing the plan has exactly one camera (the tutorial camera). It now sits in the room BETWEEN the entrance and the nearest loot room
  (`tutorialRoom(L, cand, entRoom, spots, dOf)`: 30-100 % of the walking distance to the loot room, nearest the straight entrance -> loot line, about 70 %). Falls back to the old
  "nearest room" when there are no scrap spots or the loot is right at the door.
* **Hint.** One priority Algorithm line at 16 m, another about the blind spot at 9 m; the objective line switches to the camera while it is within 22 m.
* **Visible blind spot.** A thin green ring on the floor under the tutorial camera (the hole in the cone, radius `r0`), hidden when the camera is dead / blind / the net is off.
* **Reward.** Slipping into the ring after having been inside its range, without going live (or a near miss within range) pays `TUT_PAY` = 20 credits to the crew ONCE per run
  (`run.fcTut`), toast "Clean pass. The Algorithm saw nothing: +20", and ends the camera objective for good (`fr.camDone`, also when you simply go live).

## Knobs / API

`FR.MIN_STAGE` (what waits until when), `FR.ALGO_GAP` (45 s), `FR.CARD_LEASE`, `feedcams_core.TUT_PAY`. Modules call: `game.onboard?.fr?.allow(kind)`, `.calm(kind)`, `.algoOk(pri)`,
`.lease(kind, secs, pri)`, `.only(lines)`, `.wantSell(v)`, `.camDone()`. `lore.say(text, { pri: true })` marks a teaching line.

## Not verified / gaps

* No browser run (per task): the green ring, the objective switching and the reward pay-out are node-checked only (plan placement, rules, hooks); please look at one first landing.
* `distOf` counts BFS cells; the tutorial room heuristic was tuned on generated layouts with fake loot spots, not on the real `scrapSpots` distribution.
* Veterans starting a NEW campaign no longer get a wrong door on day 1 (deterministic per run so all peers plan the same door) and no outdoor drone on day 1.
* The guide tutorial ("TUTORIAL n/7") objective is now hidden by the one-goal filter (its spoken lines remain); it re-appears when nothing else is `main`.
* Guide tutorial lines are priority lines; two step lines can still follow each other closer than 45 s.
* `studio` only fills empty item tips (no runtime messages); `rewardviz` warnings depend on `run.fj`, which is off on the first landing; `downed`/`soul`/`algo1`/`algo2` lines all go
  through `algorithm.show` and are covered by the 45 s gate; `hubgate` cards only appear at quota 1 (after the budget).
