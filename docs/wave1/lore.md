# Wave 1: LORE module (The Algorithm, factions, contracts, case files, lore logs)

Story bible: `docs/LORE.md`. This file covers the systems: files, events, numbers, and how to test them.

## Files (all new, owned by this module)
| File | Role |
|---|---|
| `src/game/lore.js` | `installLore(game)` → `game.lore`. Orchestrator: mods-event wiring, day record (host), day-end sequence, net ops, lore log tablets, ship contract board (screen + [E]), terminal commands, public API |
| `src/game/algorithm.js` | The Algorithm: host behaviour tracking, daily FOCUS + mood, line selection with cooldowns, "adaptation" nudges; client intercom (glitch subtitle, typewriter, face, optional speech); `drawAlgoFace()` |
| `src/game/factions.js` | Reputation, SIGN / TRIBUTE, wars, invasion planning + `invade()`, perks, chain info, `findFaction()` |
| `src/game/contracts.js` | Seeded daily offers, accept / abandon, progress, completion, payout / failure, secret objective, objectives lines, HUD dock widget |
| `src/game/casefile.js` | Case record build (host), publish, per-peer storage (`profile.caseFiles`, cap 50), cinematic card, terminal text |
| `src/game/loredata.js` | Content: factions, chapters, chains, secrets, 129 intercom lines (EN+TR), 31 lore logs (EN+TR) |
| `src/ui/panels/contracts.js` | THE ALGORITHM LINK board: CONTRACTS / FACTIONS / CASE FILES / LOGS tabs |
| `src/ui/panels/casefile.js` | Case file card, case list, log list, log reading overlay |
| `tools/harness/wave1_lore.js` | Headless feature test (see below) |

## Shared-file edits
- `src/game/game.js`: only the two placeholder lines (`// [import:lore]` → import, `// [slot:lore]` → `this.useModule('lore', installLore);`).
- No other shared file is edited. Instance-level wraps (restored in `dispose()`): `game.progress.see` (scan
  tracking), the host `'door'` request handler (door counting), `game.shipScreens.drawExtra` (face on the vitals
  monitor while the Algorithm talks). `HOST_ONLY.add('lore')` at import (session.js Set).

## Run state (synced by the generic diff sync, saved with the run; reset when fired)
| Field | Content |
|---|---|
| `run.algo` | `{ focus, mood, lines: [last 3 EN lines], n, day, scores, engagement }` — other modules read `focus` |
| `run.factions` | `{ algorithm, archive, bureau, darkweb }` rep −100..100 (start 10 / 0 / 0 / −10) |
| `run.signed` | `{ f, day }` exclusive partner |
| `run.chains` | `{ faction: completedSteps 0..5 }` |
| `run.contracts` | `{ key, offers: [3 contracts] }` |
| `run.contract` | active contract `{ ...offer, state: active→running→complete, progress, n }` or null |
| `run.contractLog` | last 20 results |
| `run.caseN` | case counter (starts 1000 + hash(runId) % 8000) |

Profile (personal): `profile.caseFiles` (newest first, 50), `profile.loreLogs` `{ id: { at } }`.
Settings: `settings.algoVoice` (terminal `ALGO VOICE ON|OFF`, default off).

## Events
Listens (mods bus): netReady, registerHandlers, hostStart, phase, mapLoaded, daySummary, update, chat, objectives,
interactables, director (blackout), `tfg:facility`, `tfg:extraction`, `tfg:spell`.
- `tfg:facility`: any payload; string values (and keys whose value is `true`) are matched against
  overload / destroy / lockdown / alarm / breach (count as SABOTAGE + case event) and blackout / fire / gas / toxic
  (case event only). Alarm/lockdown → Algorithm line.
- `tfg:extraction`: `{ success: true }` or phase `done|success|complete|extracted|escaped` → extraction done;
  any other phase → "extraction started" line. Fallback without the facility module: securing the Reactor Core.
- `tfg:spell`: counted; 4+ in 20 s → spell-spam line.

Emits: `tfg:algo` `{ focus, mood, kind: 'brief'|'nudge'|'day', scores?, player? }`, `tfg:contract`
`{ id, state: accepted|running|complete|paid|failed|void|abandoned|signed|secret, faction, ... }`,
`tfg:war` `{ faction, on, invasion?, n?, spawned? }`.

Net: client → host `request('lore', { op: accept|abandon|sign|tribute|log|scan, ... })`;
host → all `broadcast('lore', { k: say|case|secret|contract|war|invade|ending })` (host-only type).

## The Algorithm (numbers)
- Tracks every 0.5 s on the host during a moon day, per player: loud (noise ≥ 0.6 or voice > 0.35), flashlight,
  apart (> 25 m from any living crewmate), in-ship time, max carried value, door opens, backtracking (re-entering a
  6 m cell after 40 s), spells, kills, deaths (+ "alone" if no living crewmate within 30 m → abandoned).
- Focus scores at day end: noise = loud/active ÷ 0.22 · light = flash/active ÷ 0.45 · split = apart/active ÷ 0.35
  (crew ≥ 2) · doors = opens per active minute ÷ 3 · greed = max carry ÷ max(120, quota·0.25) · coward = ship share
  ÷ 0.35 (+0.8 for an early lever takeoff). Highest wins; all < 0.5 → seeded experiment. Day 1: seeded guess.
- Mood from engagement (deaths·25 + kills·6 + loud/8 + spells·2 + events·8 + collected/quota·30):
  bored < 15 < amused < 45 < delighted < 90 < ecstatic (wipe = ecstatic). Colours the face.
- Lines: 129 (41 pools, EN+TR). Global gap 11 s, per-pool cooldowns (death 6 s, orbit chatter 90 s, alone 60 s,
  greed 240 s, spell 120 s, alarm 70 s, firsts once a day), shuffle-bag per pool (no repeats until exhausted).
  Fired on: landing briefing (focus + yesterday's number), first scrap, first kill, death / wipe, 75 s alone indoors,
  carrying ≥ max(▮150, quota·0.3), midnight, alarm / extraction, spell spam, quota met / failed, early takeoff,
  contracts, wars, invasions, secrets, lore logs, orbit chatter (80–150 s).
- Adaptation: ≤ 2 per day, ≥ 150 s apart, after 100 s on the moon, via `game.director.trigger(kind, player)`:
  noise → vent/footsteps, light → flicker, split → shadow figure, doors → door scare, greed → pressure spawn,
  coward → line only. Each comes with a `nudge_<focus>` line.

## Factions (numbers)
SIGN +20 / rival −30 (re-sign +10 / −15; switching partner −20 "betrayal"), once per day, orbit or HQ.
Contract +8 (chain +12) / rival −3; fail −6; abandon −5; TRIBUTE ▮(100 + 25·quotaIndex) → +15. Daily drift 1 toward 0
(not for the signed faction). HOSTILE ≤ −20 (no offers, `discount()` = −0.15 surcharge), WAR < −40.
Tiers 20 / 50 / 80: discount 5 / 10 / 15 %, contract pay +10 / 20 / 30 %; INNER CIRCLE perks: Algorithm +▮25 per
contract, Archive +1 log per facility, Bureau halves Dark Web invasion chance, Dark Web contracts pay Clout (20 %).
Invasion: per warring faction per landing, chance clamp(0.45 + (−40 − rep)/100, 0.45, 0.85) at a random time
120–300 s after landing; squad size 2–5. Position: facility main-door spawn if most of the crew is inside, else
14 m from the outdoor main entrance. Calls `game.horde?.spawnHitSquad?.(factionId, THREE.Vector3, n)`; without the
horde module: "(The X squad lost its signal in the Dead Feed.)".

## Contracts (numbers)
3 offers/day in orbit, seeded by `runId:day:quotaIndex`, from different non-hostile factions (signed faction always
present), weighted by rep + 60. One chain step per day (best-standing faction whose next step is unlocked).
Targets: salvage ▮max(60, quota/3 · 0.45–0.7 · stepMul); retrieval fragile 1–2 / big 1 / noisy 2 / valuable 1 item
≥ ▮(80 + 20q) / artifact (epic+ tier) 1; investigation scan clamp(2 + q/2, 2, 5) types or 1–2 logs; cleanup
clamp(2 + q, 2, 8) kills; sabotage 1 event; extraction 1. Reward ▮ = (60 + 25q) · typeMul (salvage 1, retrieval
1.15, sabotage 1.3, investigation 0.95, cleanup 1.2, extraction 1.6) · 0.9–1.2 (chain ×1.5); XP 80 + 30q (×1.5).
Signed partner +25 % pay. Accepted in orbit, starts on the next moon landing, completes live (banner + lines),
pays at day end unless the whole crew died (void). Not completed → failed (−6).
Secret objective (host-only until done), one per moon day from 11: Pacifist Route, Untouchable, Lights Out,
Whisper Mode, Dragon Hoard, Bookworm, Early Bird, Exterminator, Undertaker, Open Plan, Photo Finish.
Reward ▮(50 + 15q) + (150 + 30q) XP + Clout; big "SECRET OBJECTIVE COMPLETE" reveal.

## Case files
Built by the host at the start of orbit after a moon day, broadcast, stored by every peer, shown as a cinematic
after the performance report (click to file it early). Contents: case #, moon / interior / day / date, entered,
returned, value extracted, kills, artifacts (epic+), facility events, MVP, most valuable item, causes of death,
abandoned teammates, contract + secret result, LAST WORDS (last chat line of the first dead player, before death),
Algorithm verdict (wipe / abandon / death / rich / clean / poor pools) and a stamp.

## Lore logs
Deterministic on every peer (seed + moon): 1–3 tablets (+1 Archive inner circle) on free wall spots ≥ 2 rooms deep
(floor spots as fallback), ≥ 9 m apart, weighted toward the current chapter. [E] opens the reader overlay; first read
goes to `profile.loreLogs` and tells the host (Investigation contracts, Bookworm secret, crew message).

## Terminal
`CONTRACTS`, `ACCEPT <n>`, `ABANDON`, `FACTIONS`, `SIGN <faction>`, `TRIBUTE <faction>`, `CASES`, `CASE <n>`,
`LOGS`, `LOG <n>`, `ALGO` (status), `ALGO VOICE ON|OFF`, `BOARD` (opens the panel). Faction names are fuzzy
(feed/algo, archive/wayback, bureau/mod, darkweb/phish/uncle).

## Public API (`game.lore`)
`say(text, { mood, voice, all })`, `factionRep(id)`, `factions()`, `activeContract()`, `war(id)`, `discount(id)`
(shop: 0..0.15, −0.15 = surcharge when hostile), `focus()`, `caseFiles()`, `openBoard(tab)`, `readLog(id)`, `core`
(internals for tests: `core.factions.invade(id, n)`, `core.algo.hostSay(key, vars, opts)`, `core.logs.placed()`).

## Ship contract board
Wall screen on the +z wall inside the ship at (x −2.2, y 1.75), between the terminal and the door: face + focus +
contract / offers / wars; [E] opens the board panel. While the Algorithm talks, the crew-vitals monitor shows its face.

## Test
```
flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5188 --script tools/harness/smoke_land.js
flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5188 --script tools/harness/wave1_lore.js --shot /tmp/lore.png
```
`wave1_lore.js` result (2026-09-28): offers generated; salvage contract accepted → complete → paid (▮60 → ▮215,
Bureau rep 0 → 28); SIGN bureau → Dark Web −10 → −40, −5 more → WAR (`tfg:war`), invasion planned and `invade()`
reached the stubbed `spawnHitSquad`; brief line on landing, first-scrap, contract, orbit lines; forced line then
immediate repeat blocked by cooldown; day 2: chat "GET THE FUCK OUT" → death → wipe line → CASE with
`lastWords.text = "GET THE FUCK OUT"`, cause lurker, verdict wipe; cinematic queue `[report, casefile]`; `errs: []`.

## Known issues / next
- Invasions need the horde module's `spawnHitSquad`; until then they are announcements only.
- Sabotage relies on `tfg:facility` payload words; with no facility module only crew power cuts count.
- Last words are text chat only (voice chat is not transcribed). Cause-of-death text is English in TR.
- 2+ real players not tested (split / alone / abandoned logic only ran solo in headless).
- Chapter endings grant a title via `achievements.grant` when available; no dedicated ending cinematic yet.
