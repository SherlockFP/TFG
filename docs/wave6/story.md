# Wave 6 - STORY: choose a side (module `story`; MASTERPLAN §23.7 + §23.9; node-tested + builds, one short headless run at the end)

Identity line (§21): the Company treats you as disposable staff, the Algorithm treats you as content. Now the crew has to pick which one owns it.
Installed with `this.useModule('story', installStory)` (`game.story`), off with `config.story = false`. Net prefix `st` (`streq`, `stx`).

## Files
- `src/game/story_core.js` pure rules (allegiance maths, unlock table, creature rules, zone-attack tweak, acts, endings + finale scripts, job table + offers + judging, tone lines, ISO-week trend). No THREE / DOM.
- `src/game/story.js` module (host runtime, net, wrappers, terminal, objectives). `src/game/story_ui.js` HUD dock chip, finale overlay, case-file card. `src/game/story_i18n.js` EN -> TR / RU rows.
- Shared-file edits (all tagged `[story]` or tiny): `game.js` (import + slot lines), `contracts.js` (patron tag in `CONTRACTS` text), `ui/panels/contracts.js` (patron chip on the ship board card).
- Tests: `node tools/harness/story.test.mjs` (97 checks: maths, thresholds, acts, endings, jobs, tone, trend seed) and `node tools/harness/story_host.test.mjs` (88 checks: mock-game host flows, i18n coverage, dispose). Browser script: `tools/harness/wave6_story.js`.

## 1. Two patrons + the board
- **Every contract offer is tagged by patron**: `offer.patron` = `contractPatron(faction)` (Archive + Bureau -> Company; Feed Corp + Dark Web -> Algorithm). The host tags new offers within 0.5 s of the lore module generating them (`tagContracts`), so `CONTRACTS` shows `<COMPANY>` / `<ALGORITHM>` and the ship board card shows the patron. A paid contract moves the meter (`+6` Company, `+8` Algorithm, `+3` extra for a chain step).
- **Patron jobs** (own board, seeded per `runId:day:quota`): one Company job every day, one Algorithm job from Act II. Terminal `JOBS`, `JOB <n>` (orbit only), `QUITJOB`. One job at a time for the crew; it starts on landing (`active` -> `running`) and is judged when the day ends (wrapper of `hostFinishTakeoff`, after the original + the zones day tick).

| job | patron | needs | judged |
|---|---|---|---|
| Quarterly Targets | Company | any | scrap collected >= quota/3 |
| Zero Incidents | Company | any | nobody died |
| Business Hours | Company | any | back on the ship before 20:00 with scrap >= quota/6 |
| Incident Reports | Company | any | kills >= 2..5 |
| Content Needs Stakes | Algorithm | Act II, crew >= 2 | a crewmate died, but not a wipe ("let a crewmate die") |
| Unassisted Boss Stream | Algorithm | Act II, sector gate open | boss killed and nobody used a heal / food item (client `useItem` -> `streq heal`) |
| Feed the Algorithm | Algorithm | Act II, a zone attack pending | that zone is infected after the day (do not defend it) |
| Go Viral | Algorithm | Act II | algo1 viewer peak >= 40 + 10 x quota index |

Pay: Company `35 + 18 x qi` credits, Algorithm `90 + 45 x qi` (x1.4 / x1.6 for the nastiest), ±8 % seeded; loyalty shift Company 7-10, Algorithm 12-20. Failing or dropping a job = **betrayal** of that patron (counted, and nudges the meter 3 toward the other side); a crew wipe voids the job (nobody blamed).

## 2. Allegiance (`run.st.a`, -100 Company .. +100 Algorithm)
- `applyShift`: moving away from 0 is scaled by `1 - 0.4 x |a|/100` (diminishing returns), moving back is free; clamped, rounded to 0.1. Persisted with the run (`run.st`, synced with `broadcastRun(['st'])`, keyed by `runId`, repaired by `ensureState`) and in the host profile: `profile.story = { jobs, peak, valley, endings, claimed }`.
- **Thresholds** (loyalty = |a| on your side): 25 / 50 / 75.

| loyalty | Company | Algorithm |
|---|---|---|
| 25 | HR-Approved Medkit (heal 100, ▮45) + Company Banner | Prompt Injection Serum (heal 140, ▮120) + emote Praise the Algorithm |
| 50 | Employee Locker Bag (6x4) + Manager's Cape | Infinite Scroll Pack (7x5) + Algorithm Cultist Robe |
| 75 | Compliance Baton (dmg 30, 0.45 s) + Foreman's Halo Hardhat | Deprecated Blade (dmg 44) + Firewall Crown |

  Shop items use the shop's existing soft gate (`item.faction` + `minRep`): `game.lore.factionRep` is wrapped for the pseudo-factions `Company loyalty` / `Algorithm favour`. Cosmetics go through `game.cosm5.reward(key)`, once per profile (`profile.story.claimed`), every peer claims its own. The two medkits are handled by a `useItem` listener (LMB heals instantly; `actions.js` only knows the `medkit` type).
- **Creatures** (from loyalty 50 and quota 2; never in the first quota): Company kin = moderator / support / editor, Algorithm kin = scuttler / yoinker / clickbait / replyguy / mimic. Your patron's kin **stop attacking you** (`hostHurtPlayer` wrapper, senses x0.5); the other patron's kin **hunt you** (senses x1.6, speed x1.08; x2 / x1.15 from 75). Bosses / hazards / instant kills are never touched.
- **Intercom tone**: from |a| >= 15 the Company speaks as "HR / Dispatch" (bureaucratic), the Algorithm as your biggest fan; a line on orbit arrival, landing and day end (60 % of days, deterministic per day), plus tone-shift and job-result lines. Sent as `stx say` and translated on each peer.
- **Zone counter-attacks** (after the zones day tick, quota >= attackMinQuota): Algorithm side >= 50: an extra owned zone is targeted (50 % / 80 % at 75); Company side <= -50: a pending attack is cancelled ("injunction", 50 % / 80 %). Off the Grid: no attacks at all.

## 3. Story beats + endings
- **Acts** follow the cycle: progress = `run.cycle.sector` (quota index if the cycle module is off). Act I (0) hired, Act II (>= 1) the Algorithm's offer, Act III (>= 3) the choice. Each act fires its beat once, in orbit (banner + intercom lines: `hire` / `offer` / `choice`); a save that jumps acts fires every missed beat, oldest first.
- **Act III** terminal `CHOOSE COMPANY | ALGORITHM` (orbit only, any crew member; the host validates). `PATRON` lists what each ending still needs.

| ending | requires | title | cosmetic | finale |
|---|---|---|---|---|
| Employee of the Eternity | Company loyalty >= 40 and >= 4 jobs / paid Company contracts | `Employee of the Eternity` | suit `eoty` | HR renews your contract for the rest of time; Company jobs pay x1.5 afterwards, Company perks pinned (a <= -75) |
| The Algorithm's Avatar | Algorithm loyalty >= 40 and >= 4 jobs | `The Algorithm's Avatar` | suit `glitch` | the Algorithm wears the crew; Algorithm jobs x1.5, Algorithm perks pinned (a >= 75) |
| Off the Grid (secret) | betrayed BOTH patrons at least once, |a| <= 45, and the egg meta-secret (`profile.eggs.meta`, "The Last Appeal") or >= 15 eggs found | `Off the Grid` | back `capevoid` | signal lost; every allegiance effect off, the Algorithm stops attacking your zones |

  It is not listed by `PATRON` / `CHOOSE` until the secret is found (the error for `CHOOSE GRID` reads like an unknown ending).
- **Finale**: a timed script (~20 s, `finaleScript`) broadcast step by step by the host (`stx fin {i}`): fullscreen overlay with title + typed lines (non-blocking, `pointer-events: none`), screen shake, then the reward step: credits + XP (host), title into `profile.titles` (auto-equipped if none), cosm5 cosmetic, and a **case file** `kind: 'story'` (`CASE #80100+`, own card + terminal text via `caseRenderers` / `caseTexts`) on every peer. The save is **not** ended: `afterFinale` starts the Deep Feed (`game.cycle.endless.start`) when the cycle allows it, otherwise the Algorithm reminds you of `ENDLESS`. `run.st.ending` keeps the perks.

## 4. Trend creature (§23.9)
`trendFor(isoWeekKey(now))`: one of 12 creature types per real ISO week (UTC), never the same twice in a row, stored by the host in `run.st.trend` (clients read it, so a clock difference cannot split the crew). While trending: `creatures.hostSpawn` gives that type `+1` level (more HP / damage / XP through the normal level table) and 15-45 % of spawns bring one extra clone (cap 6 per landing); its kills drop 1-2 extra scrap (`hostSpawnRandomScrap`, 90 %). An intercom line at landing, the dock line "TRENDING: <name> #type", the orbit objective hint, terminal `TREND` and the `PATRON` file show it.

## Net / state
`streq` client -> host `{op: job|quit|choose|heal}`; `stx` host -> all (in `HOST_ONLY`) `{k: say|banner|unlock|fin}`. `run.st = { v, k (runId), a, act, beats, done{company,algorithm}, betrayed{...}, offers[], offerKey, job, ending, claimed, stat, trend }`. Event `tfg:story { k: job|beat|ending }` on the mod bus.

## How to test
`node tools/harness/story.test.mjs`, `node tools/harness/story_host.test.mjs`, `npm run build`. In the game: terminal `PATRON`, `JOBS`, `JOB 1`, `TREND`, `CONTRACTS` (patron tags). Fast path to see everything: in the console `kefal.game.story.core.moveState(kefal.game.run.st, 60); kefal.game.broadcastRun(['st'])` (unlocks, dock, creature rules), then set `run.cycle.sector = 3` and `run.st.a = -55; run.st.done.company = 5` and type `CHOOSE COMPANY` in orbit.

## Knobs
`story_core.js`: `AL` (away factor, tiers, lean / creature / zone thresholds, contract shifts), `UNLOCKS`, `KIN`, `huntMul`, `ACT_AT`, `E` (ending requirements), `JOBS` (pay / shift / params), `TONE`, `TREND` (levelBonus, extraChance, extraCap, dropChance), `TREND_POOL`. Perk multipliers live in `story.js finishJob` (x1.5).

## Known gaps
- Never hand-played and never tried with two real players: numbers (job pay, thresholds, how many jobs an ending takes: 5-12) are paper values. The finale overlay, dock chip and case card were only eyeballed in one headless screenshot at best.
- Voyage missions (`MISSIONS` / `TAKE`) are not tagged by patron yet (only contracts and the new patron jobs are). The ship board panel shows the patron chip but not the new patron jobs (terminal only: `JOBS`).
- Heal detection for "boss without healing" only sees consumables used through `useItem` (medkit, food, patron medkits), not campfire / shrine / regen effects.
- "Feed a zone" depends on the zones module's auto-resolve (a crew with strong defences may hold the zone by accident and fail the job); the job is only offered while an attack is pending.
- Intercom tone is added lines, not a rewrite of the existing Algorithm lines (`algorithm.js` has no tone hook). The hub is the HUD dock + terminal (the social hub panel does not show the trend).
- Ending requirements use the host's profile eggs plus whatever the requesting peer sends (`meta` / `eggs` in the request); no cheat protection.
- If the host leaves during the 20 s finale, the remaining reward steps are lost (host timers); `run.st.ending` is already set, so it cannot be replayed.
