# One goal, one line (wave 8 night, REVIEW_W8_NIGHT backlog 2 + clarity items)

Problem: on arrival the HUD asked for "Survive the swarm wave 1/3" + "Take down 2 creatures" + "TUTORIAL 1/7: Move" + the quota line. That is three verbs, and none of them was "stay off the feed". The firstrun budget only covered fresh `staged` profiles, so the owner (old profile) still got all of it.

## What changed

**1. One priority resolver for every profile** (`src/game/onegoal_core.js`, module `onegoal`).
* Every 'objectives' listener is tagged with the module that registered it (`game.useModule` snapshots the listener set; `onegoal.emit` wraps `add` so each line gets `src`). Core lines get `src: 'core'`, bounties `'bounty'`, untagged listeners (public mods) `'mod'`.
* Category per line (`catOf`): any `warn` = survive; explicit `cat`; `first` (firstrun) = loot; else by source (`SRC_CAT`): horde / siege / zones = survive, backrooms / worlds3 pocket exits / TAGGED = escape, core + Hiring Day = loot, facjobs / expeditions / story / voyage / contracts (lore) / cycle / facilitysys / tasks / hull = job, guide tutorial = teach, the rest = other.
* Order: survive/escape > loot > job > teach > other. A done line drops below every open job (the day's scrap target met -> the job takes the slot). Inside a tier `lead` / `first` lines go first (loot in hand, a body to carry, the entrance).
* Standard HUD = the first warning (if any) + ONE goal. Minimal = one line. Full = the old 7-line list in the new order. A budgeted new player gets the Standard pair even in Full (firstrun behaviour kept). The hold-Tab FULL STATUS card lists everything (`objectives.full`, up to 10).
* Core-verb line: while you are TAGGED by a feed camera (`run.fc.p[id][2]`), the goal is "TAGGED: get to the ship (N m) or kill the camera that tagged you" (escape tier).
* The ASSIGNMENT mod (`public/mods/employee-assignments.js`) now adds one `job` line ("Assignment: ...") and its big card only shows at Full density.
* "TUTORIAL 1/7" fix: the move step also completes after 40 m of walking (it used to wait for a crouch forever), Hiring Day credits move / light / scrap (`guide_core.tutCredit`), and the tutorial line is `teach` tier (Tab card unless nothing more urgent is on); the guide still speaks each step.

**2. No waves, no kill counts before quota 3 (every profile)** - `crdirector_core.wavesAllowed(q)` = quotaIndex >= 3 (`WAVE_MIN_Q`), `game.crdirector.wavesOk()`.
* horde `startWaves(reason, zone, force)` refuses before quota 3 (night / alarm / extraction); `force` for harness (`wave1_horde.js` updated).
* siege `eligible()` refuses before quota 3 (terminal risk line: "not before quota 3 is met"). `TUNE.minQuotaIndex` untouched.
* contracts: a non-chain `cleanup` (Delete N entities) is re-picked before quota 3; a chain step of type cleanup waits.
* ASSIGNMENT mod: `hunt` (Take down N creatures) and `carcass` kinds only from quota 3.

**3. Message pacing for every profile** - `game.onboard.fr` delegates to `game.onegoal` once a profile is past the first-run budget:
* `algoOk`: 1 non-priority Algorithm line / 45 s, silent while `director.chaseLevel() > 0.35` or a crdirector peak is on (`crdirector.peakNow()`, clients track the `ph` cue in `S.cph`). Teaching lines pass the gap; deaths always pass (algorithm.js). The budgeted new player also gets the chase / peak silence now.
* `lease`: one card / caption at a time (soul touchdown card, crdirector captions, whatever qafix1 routes through `fr.lease`).
* Settings > HUD > **Chatty Algorithm** (`settings.chattyAlgo`, default off) = the old flood.

Net: no new message types. Strings: EN / TR / RU in `onegoal_i18n.js`.

## Test
`node tools/harness/onegoal.test.mjs` (36 checks: arrival soup -> 1 goal, warning + goal, done -> job, TAGGED, minimal, pacing gates, one-card lease, waves gate, tutorial advance + credit, hook presence). Also run: firstrun, onboard, hudcalm, facjobs, expeditions, crdirector, lcmods, hubgate, guide, wave2_siege_core + `npm run build`.

## Knobs
`OG.TIER`, `OG.SRC_CAT`, `OG.ALGO_GAP` (45), `OG.CHASE_QUIET` (0.35), `crdirector_core.WAVE_MIN_Q` (3), `guide_core.MOVE_FREE` (40 m).

## Not verified / gaps
* No browser run (task rule): the one-line HUD, the TAGGED line and the hidden ASSIGNMENT card are node-checked only.
* Listeners registered lazily (after their module's install) fall back to `mod` -> other; none of the known sources do that today.
* Horde hit squads (faction wars) and zones defence are player-driven and still allowed; crdirector phase captions still show (one card at a time).
* Facility-job side jobs / mapmods affix cards before quota 2 (review section 3) are not changed here; they are just never the one line.
