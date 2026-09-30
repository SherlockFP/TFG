# REVIEW W8 NIGHT: creative director, mid-night (2026-09-30)

Inputs: `docs/session/NIGHT_LOG.md` (batches 1-10), top of every `docs/wave8/*.md`, `docs/CRITIQUE_W8.md` (4.5/10, plan 8A-8C), `docs/wave8/qa_night1.md` + all 16 `qa_shots/*.jpg`.
No code run by me. **Caveat that drives the whole score:** the 16 QA shots were taken at batch 1 (main + perf4). Everything merged after that (feedcams2, rewardviz,
fixbundle, pacing, artpass, firstrun, netaudit, hostmig, creatureart, carry2, highlights, expeditions, sound2) has **never been seen in a browser**, and nothing at all has
been played by two humans. The interior shots use brightness x2.8, so the real interiors are darker than the shots.

## 1. Score now: **5.0 / 10 on paper, 4.5 on screen** (was 4.5; owner 4)

| Axis | W8 | Now | One-line evidence |
|---|---|---|---|
| Core loop | 5 | 5.5 | The camera verb exists and reads (`feedcam_onair`: cone, red lamp, ON AIR vignette), but on arrival at orkinos the screen asks for "Survive the swarm wave 1/3" + "Take down 2 creatures" + "TUTORIAL 1/7: Move". That is three verbs, and none of them is "stay off the feed". |
| Feel | 4 | 4.5 | movefix (root cause of the idle bounce), carry2 sway, creature wind-up lean: all node-only. Solo still gets one hit and then `TERMINATED` (qa #4). The landing hitch was never measured in a browser. |
| Clarity / UX | 3 | 4.5 | The Algorithm box moved to the top and shrank, and a dock layout manager exists. Every shot still shows ~11 always-on regions: body/HP/STA/lb, 2 objectives, a 2-line ticker, ASSIGNMENT, THREAT, a centre ability bar, carrying, pockets + 5 slots, clock/compass, edge markers. There are still two currencies (▮ / ◈). |
| Visuals | 5 | 5.5 | Interiors now have a face: academy catwalks, the greenhouse tree, metro tiles, influencer chandeliers. Against that: pitch black without a torch, the torch viewmodel is a white blob and its beam a grey slab (greenhouse, academy), the lantern cone is opaque, the influencer floor reads as sand, 404 is a red-black soup, and Dialup is amber at 8:15 AM. |
| Audio (code) | 5 | 5.5 | atmos removed the facility "metronome", sound2 added 64 sounds and fixed 5 ids that played nothing. Not heard. The count of voices keeps growing. |
| Content density | 3 | 4.5 | pacing: outdoor area -46 %, entrance 42-75 m, POI +50 % (sim). The QA shot still reads "ENTRANCE 102m" (taken before pacing). Interiors: 233-245 scrap spots, 900+ nodes. Denser on paper, not proven. |
| Identity | 4 shown | 5 | For the first time the Algorithm is *in the world* (cams, drones, highlight CRT replay). But the first 5 minutes (ship, lever, quota, terminal, scrap) are still beat-for-beat Lethal Company, and the new breadth (diner tycoon, Minecraft mining, PoE affixes, arcade, chess) blurs the identity again. |
| Polish | 3.5 | 4 | 0 page errors in 10 runs, 10 real MP bugs fixed (netaudit). Visible defects: the sector card "…DEPARTED OF STATIC / OF STATIC SCANNER", "[E] HUB DOOR [E]", "Assignment failed: Tester is no longer with the company" while still bleeding out, an Arial fallback on the new cards, and the chess table visible in the ship on day 1 although the Hub is locked. |

**Why "on screen" is lower:** the firstrun budget (`firstrun_core.js:30`) only covers a *fresh `staged` profile*, and "every other player sees exactly what they saw before".
The owner, who has an old profile, will still get the soup. The night added ~15 systems and removed almost none (101 `useModule`s, 348 files in `src/game`, ~196k lines).
Wide-but-empty has become wide-and-busy.

## 2. Five reasons a new player quits in the first 20 minutes

1. **"I can't see."** Interiors are black on a first run, the LIGHT slot is empty, and once a torch is held its model and beam cover a third of the frame. The best new set pieces (metro, prison, greenhouse) are invisible.
2. **"What am I supposed to do?"** Up to 4 goals compete at the same moment: quota line, tutorial, assignment (`contracts.js`: "Take down 2 creatures", "Hoarder"), facjob, swarm wave, map affix, plus the Algorithm's commentary. The camera verb shows up around minute 7, indoors, as one mechanic among many.
3. **"It's Lethal Company with more text."** Menu, ship, terminal, lever, quota, scrap: the unique hook (you are being streamed) is not the first thing you *do*. Hiring Day spends ~5 min on move/crouch/sprint before the first landing.
4. **"I died once and it ended."** Most link visitors start solo. Solo has no downed state, so the flagship safety net and co-op drama are invisible, and one mistake means `TERMINATED`.
5. **"It stutters and I walk a lot."** The landing blocks 1-6 s (`mapLoaded:horror.js` alone 0.7-3.5 s), and the museum renders ~6x slower than other themes. The payoff screens (day summary, highlight clip, income by source) come after ~20 minutes and were never seen rendering.

## 3. Conflicts and bloat: cut, merge, hide

| Overlap | Systems fighting | Decision |
|---|---|---|
| **Threat sources** | horde (outdoor zombie groups), siege, swarm waves ("PEAK TRAFFIC 1/3"), crdirector phases, feedcams2 heat peaks, lcmonsters, horror pockets, skeletons, brcreatures, 72 hostile types | **Merge:** crdirector is the only spawner and "LIVE heat" is its main input. **Cut** horde waves and siege from the campaign before quota 3. **Hide** the roster behind a 12-creature "season" pool (3-4 per moon). A stealth verb dies when a wave spawns on arrival. |
| **Goals** | objectives.js quota, onboard tutorial, contracts assignment, facjobs main+side job, mapmods affix card, daily event, roledays, crew tasks, expedition need/goal | **Merge** into ONE "Shift order" line (quota + at most one bonus). **Cut** kill-count assignments (they contradict "stay unseen"). **Hide** facjob side jobs and affix cards until quota 2. |
| **Day modifiers** | daily event, mapmods rarity/affixes, weather, morning vote, roledays, soul title card, hardmode | Max ONE modifier per day, shown once in the ship. Keep mapmods for Quick Shift and post-quota-3 only. |
| **Algorithm voices** | algo1, algo2, lore, soul, story, onboard, guide, studio, feedcams(2), downed, lcmods quotes, crdirector captions | One global rate limit (1 line / 45 s, silent at peak) **for every profile**, not just fresh ones. A one-line ticker. |
| **Currencies / progress** | credits ▮, Clout ◈, XP/level, 128-node tree, forge shards, ore, diner till, arcade Clout, season, cosmetics | The HUD shows only the QUOTA. Clout becomes the *LIVE/fans* score from feedcams (its one meaning). Ore and diner feed credits and never show on the HUD. |
| **Worlds** | backrooms, liminal, brlevels, mirror, worlds2, worlds3, maps2, maps5, voyage, expeditions, repomaps, labyrinths, homeworld, homeworld2 (14 modules, 12+ interior themes) | Campaign start = 3 hero moons (factory / influencer mansion / metro) + 1 expedition as the quota-3 reward. Everything else goes to voyage / "Deep Feed" after quota 5. |
| **Side games** | resto, farming, food, pets, forge, arcade + arcade2, chess/dama, dance, mining, trade, zones | hubgate hides the HUD, but the ship still *shows* the chess table and the door says "0 of 12 systems open" (an advert for missing content). Remove locked fixtures physically; the door shows only what is open. **Freeze** new side games. |
| **HUD calm layers** | hudcalm, declutter, docklayout, polish4, a11y density | One owner (hudcalm `DOCK_RULES`); the Standard default = 6 regions. |

**Rule for the next 2 waves: no new module unless it removes or replaces one.** A system that has not been seen in a browser does not count as shipped.

## 4. Next 12 tasks (ordered by score impact; one Sonnet agent each unless marked)

1. **See the game (first-light pass).** Starter torch in the ship (or a loaner through quota 1), readable-dim interiors (exit signs, strips), fix the torch viewmodel blob, grey beam slab and opaque lantern cone (additive, depthWrite off). Check first what qafix1 already did.
   Files: `src/game/nvgear.js`, items/viewmodel, `src/game/lcmonsters_fx.js`, facility lighting. Check: 4 interiors at gamma 1.0 (no x2.8) show floor, walls, door and loot within 8 m; the torch covers < 15 % of the frame.
2. **One verb, one line (Shift order). [Opus]** A single objective line for every profile: quota + at most one bonus that serves the camera verb ("leave with 0 tags", "cut 1 junction box"). Pull kill-count assignments before quota 3 and turn off swarm waves at landing before quota 3.
   Files: `objectives.js`, `contracts.js`, `firstrun_core.js` (budget for all, not only `staged`), `horde.js`, `crdirector_core.js`. Check: a headless run on hamsi / orkinos shows ≤ 1 goal line + 0 wave chips during the first 3 minutes.
3. **Global Algorithm budget + 1-line ticker.** 1 line / 45 s outdoors, 0 during a director peak or a chase, priority queue, 1 line (≤ 70 chars) with a hard cap, and a fix for the stuck `TUTORIAL 1/7` after teleports.
   Files: the `algorithm.show` owner (algo2 / ui ticker), `onboard.js`. Check: a scripted 5-minute run logs ≤ 7 lines, ticker height ≤ 36 px.
4. **Standard HUD = 6 regions.** HP/STA, hotbar (fold "carrying" + pockets into it), 1 objective, compass/clock, LIVE badge, noise. The ability bar shows only while on cooldown, THREAT only above CALM, weight above 30 lb, ASSIGNMENT on Tab, and one currency.
   Files: `src/game/hudcalm.js` (`DOCK_RULES`), `src/ui/hud.js`, `docklayout.js`. Check: 4 shots with ≤ 7 regions and `textOverlaps` = 0.
5. **QA night 2 (browser).** Screenshot everything merged after batch 1: feedcams2 drone + junction cut, highlight clip, carry2 two-person, the 3 expeditions, firstrun from a fresh profile, pacing outdoors, artpass models, creatureart poses, rewardviz day summary. All at gamma 1.0, with a bug table like qa_night1.
   Files: `tools/harness/qa_night2_*.js`, `docs/wave8/qa_night2.md`. Check: 20+ shots, and every "not verified" item is either verified or filed.
6. **Two-player scripted session.** Two browser tabs over the real Trystero, or the in-memory wire plus 2 pages: downed → revive ring, two-person carry, TAGGED → ship, host migration mid-landing.
   Files: `tools/harness/duo_*.mjs`. Check: the script passes twice in a row, and the revive ring + shared carry show in the shots.
7. **Solo safety net.** Solo: a first lethal hit per landing downs you, then an 8 s self-revive at 20 % HP ("the Algorithm keeps its content alive"). The second one kills. This shows the flagship feature to solo link visitors (see owner Q2 below).
   Files: `src/game/downed.js` (`crewAlive()`), i18n. Check: a node test plus one headless shot of a solo down and get-up.
8. **Camera verb in the first 90 seconds.** Put the tutorial camera or a drone on the path between the ramp and the entrance (pacing already made it 42-75 m), so "red light = you are live, heat = creatures" is learned outdoors before the first door. LIVE heat should visibly pull the next director release.
   Files: `feedcams2.js`, `feedcams_core.js`, `pacing` / `soul` beats. Check: the first cone is visible from ≤ 30 m of the ship on 3 moons; the sim shows heat → earlier peak.
9. **Threat merge.** crdirector is the sole gate for horde, siege, skeletons, brcreatures and lcmonsters in the campaign; each moon draws a 3-4 creature pool from a curated 12; no horde or siege before quota 3.
   Files: `crdirector*.js`, `horde.js`, `siege.js`, moon tables. Check: `crdirector.test` shows p95 bodies ≤ 3 at quota 0 *including* set pieces.
10. **Landing hitch.** Split the `horror.js` `mapLoaded` handler into per-zone `landQ` jobs, and cut the museum's draw calls (glass cases, laser grid, 33 rooms) with instancing or merging.
    Files: `src/game/horror.js`, the museum theme in `world/interiors`. Check: `landQ.report()` has no single job > 400 ms (software GL), and a museum frame is ≤ 2x the other themes.
11. **Polish bundle ("AI tells").** Fix the sector-card name ("OF STATIC" twice), "[E] X [E]", the "Assignment failed …no longer with the company" line while downed, the `Bahnschrift` → heading font var, a hub door with no "0 of 12", locked ship fixtures (chess / arcade / stove) removed until unlocked, and the Dialup palette vs clock plus the 404 fog colour.
    Files: `mapmods.js`, the prompt builder, `contracts.js`, `downed.js`, `hubgate.js`, `shiplayout.js`, `soul_core.js`. Check: a before/after shot per item.
12. **Not-LC first five minutes + route board. [Opus]** Cut Hiring Day to ≤ 90 s, open on the stream: a LIVE overlay, 3 route cards (art, danger pips, payout, hook) instead of the MOONS wall (CRITIQUE P13, still open), with 3 hero moons as the campaign start.
    Files: `onboard*.js`, `ui/ui.js` terminal, `voyage_core.js`, moon tables. Check: from a fresh profile, the time to first landing is < 2:00, and a stranger reading the first 3 shots says "streamed horror", not "LC".

Expected effect if 1-9 land and are *seen*: clarity 6, visuals 6, loop 6.5, identity 6, which puts the game at about 6.3. Items 10-12 plus a real owner playtest are the path to 7.

## 5. Questions for the owner

1. **Yeni sistem dondurma (feature freeze)?** (a) 2 dalga boyunca yeni sistem yok; sadece birleştirme, kesme, görsel/his cilası ve test. (b) Her birleştirme görevinin yanında 1 yeni içerik. (c) Aynı hızla yeni sistem. **Öneri: a.** Oyun geniş-ama-boş değil artık, geniş-ama-kalabalık. 7/10'u yeni sistem değil, görünür ve hissedilir olan getirir.
2. **Kampanya başında kaç gezegen + hangi tehdit modeli?** (a) 3 kahraman gezegen, gezegen başına 3-4 yaratık, dalga/kuşatma kota 3'ten önce yok (gizlilik + kamera odaklı). (b) Tüm gezegenler açık ama dalgalar kısık. (c) Şimdiki gibi. **Öneri: a.** Kameradan kaçma fiili, iniş anında sürü doğunca ölüyor.
3. **Solo oyuncu ve karanlık:** (a) Başlangıç feneri gemide ücretsiz + solo'da iniş başına 1 otomatik kalkış (8 sn). (b) Sadece fener; solo tek vuruşta ölmeye devam. (c) İkisi de yok (satın alma + ekip şart). **Öneri: a.** Linkle gelen ilk oyuncu genelde tek başına; göremeyen ve ilk hatada biten oyuncu 5. dakikada çıkıyor. (Bu soru `QUESTIONS.md` 1-2'yi birleştirir.)
