# REVIEW W8 MORNING: creative director, after the night (2026-09-30)

Inputs: `docs/REVIEW_W8_NIGHT.md` (5.0 paper / 4.5 screen), `docs/session/NIGHT_LOG.md` rows 10-26, the tops of 16 `docs/wave8/*.md` (onegoal … perf6), `qa_night2.md` / `qa_night3.md` (5.5, then **6**),
and 24 shots (`n3_*`, `n3fix_*`, `hud6_*`, `glove_torch`, `ex2_roof`, `n2_board|stream|day_summary|highlight_crt|tab_card|mp_revive_host|dim_factory`). I ran no code. All shots are software GL at 1280x720 with no brightness boost.
The big change since last night is that most claims now have a picture behind them. The paper score and the screen score have converged.

## 1. Score: **5.6 / 10 on screen** (night: 4.5 screen; QA night 3 says 6.0. I take 0.4 off for voice and text tells that QA did not score)

| Axis | Night | Now | Evidence (shot / doc) |
|---|---|---|---|
| Core loop | 5.5 | 6 | The verb is on the path. `n3_drone`: the drone cone is visible at ENTRANCE 34 m, and `n2_blind_flank` shows the dark flank. `n2_dim_factory`: "TAGGED: get to the ship (12 m) or kill the camera". Heat pulling the director (`cam90`) and the whole land→tag→escape→sell loop have never been seen in one run. |
| Feel | 4.5 | 5 | Carry covers ~18 % of the frame (`n3_carry`), the glove is small and dark (`glove_torch`), the shovel head is back in frame (`n3fix_shovel`), and 2-tab revive/carry/migration pass 17/17. There is no shot of the solo self-stand-up, the takeoff was never seen on an expedition moon (the software-GL tab died of OOM), and no human has played. |
| Clarity / UX | 4.5 | 6 | Every n3 shot has exactly one goal line and no THREAT box at CALM (`hud6_standard`). Against that, the Algorithm box is on screen in 13 of 13 n3 shots, often with a stale line. "carrying ▮12" repeats the value already on the slot. The Tab card (`n2_tab_card`) still lists 9 objectives, the facility status panel and the patron bar. |
| Visuals | 5.5 | 6 | Metro and influencer read without a torch (`n3_metro`, `n3_influencer`), the barge hull reads (`n3_barge`), and the route board is the best screen in the game (`n2_board`). The roof is still black with floating confetti pixels (`n3fix_roof_a`, `ex2_roof`). On dune and barge the KC-07 ship hull fills half the frame. Blue loot pillars stand through walls (`glove_torch`, `n2_dim_factory`). The vending machine is a red box with a cyan rectangle. |
| Audio (code) | 5.5 | 5.5 | Unchanged, and still never heard. The mix has only been checked in node. |
| Content density | 4.5 | 5 | The entrance is at 34-52 m in the shots (it was 102 m), and there are pools of 3+1 creatures, 8 themed bosses and 12 themed scrap items. The expedition entrances are at 71-140 m. **No creature appears in any n3 shot**: the boss is a far-off "??? UNKNOWN ENTITY", and the boss cards were confirmed only in the DOM. |
| Identity | 5 | 6 | Stream open → route board → TAGGED is the first identity a stranger would recognise (`n2_stream`, `n2_board`), and the boss intros are good jokes. After the 12 s overlay, though, the stream shrinks to a pink box with a fixed "LIVE 120", while the overlay itself said 1,470 watching. |
| Polish | 4 | 5 | 0 game page errors, all regressions green, per-landing GPU leaks fixed, and the tarps, sector card, [E] prompt and fired line are all fixed. New tells are listed in §3.4. |

**Moved:** clarity (one goal line), identity (stream + board), visuals (hero interiors). **Did not move:** audio, feel as played by a human, creatures on screen, and the Algorithm as a character.

## 2. Backlog check (last night's 12)
| # | Item | Verdict |
|---|---|---|
| 1 | First light | **Done** for metro/influencer/factory and the glove torch. **Weak:** roof, and the levrek 8 AM red cast (`n3_glove`; the fix was never shot). |
| 2 | One goal (Opus) | **Done and seen.** Underneath, the soup is still there (Tab card, 9 lines incl. "TUTORIAL 1/7", "TASKS 0/3"). |
| 3 | Algorithm budget | **Built, weak on screen.** The rate limit exists, but the queue (`onegoal_core.enqueue`) has no expiry and no context, so lines are served late: "The terminal shows today's routes" plays outdoors and in the facility (`n3_drone`, `n3_cam_cone`, `n3_glove`), "HR: Congratulations…" on the roof (`ex2_roof`), and "WASD to walk…" in the facility after the stream already pinned the controls (`glove_torch`, `hud6_standard`). The typewriter glyph noise (`+?`, `\%`, `/>`) is still in every shot. |
| 4 | HUD 6 | **Done and seen.** Leftovers: the SHIP LOOT panel ("sell today @37%") and the "carrying" duplicate. |
| 5 | QA night 2 | **Done** (N2 + N3, ~60 shots). |
| 6 | Two players | **Done in the harness** (2 tabs, 17/17). Never played by two humans or over real WebRTC. |
| 7 | Solo safety net | **Built, unseen.** |
| 8 | Camera in 90 s | **Done and seen** (drone, flank, hint). Heat → earlier peak: node only. |
| 9 | Threat merge | **Built, unseen.** "KNOWN RESIDENTS" and pool creatures have no shot. |
| 10 | Landing hitch | **Done** (404: 6.2 → 1.7 s; warm set 107 ms). The takeoff OOM stays open (software GL). |
| 11 | Polish bundle | **Done.** A new batch of tells took its place (§3.4). |
| 12 | Not-LC first 5 min (Opus) | **Done and seen.** The strongest work of the night. |

## 3. Five things that still read "AI-made / soulless / LC clone"
1. **The Algorithm talks, it does not watch.** A pink box is up almost all the time, playing queued lines that belong to another moment (terminal talk on the moon, a tutorial after the tutorial). It has scrambled-glyph noise, and its viewer count is stuck at 120. A host that never reacts to what is on screen reads as a text generator. This is the single biggest "AI" tell, because the Algorithm *is* the game's personality.
2. **There is no monster on screen.** The QA evidence holds zero creatures. Eye tells, wind-up leans, pools and boss cards are all node-verified or DOM-verified only. What is on screen is a lit walking sim with a HUD. Horror needs one designed, readable first sighting.
3. **Placeholder objects at hero moments.** The carry-comedy vending machine is a flat box. The first melee weapon is a pole. On dune and barge the first frame is our own hull. The roof is black confetti. An ARPG loot pillar stands through a wall in a horror corridor. The "highlight clip" is a vector line plot on a grid (`n2_highlight_crt`): it looks like a debug trace, not a replay.
4. **Dev and test language leaks.** Examples: "Host revived Client." (toast and chat, twice), "Tester", "Optional onboarding started… TUTORIAL SKIP at the…", "sell today @37%: ▮0 · need ▮130", "QUOTA ▮0/▮130" in the top bar against "QUOTA ▮0/▮400" on the report (`n2_day_summary`; rule out harness-forced state first), and "Interior: Data Center" on a card named 56K-Dialup.
5. **After minute 1 the skeleton is Lethal Company again.** The top bar reads "QUOTA · 3 DAYS LEFT · CREDITS · ROUTE", then terminal, lever, walk, loot, "sell at 37 %". The stream frame that opened the game (viewers, chat, lower-thirds) disappears after 12 s. It should *stay* the frame, using what already exists (algo1 viewers, the onboard chat renderer, feedcams moments).

## 4. Next 10 tasks (impact order; no new systems; Sonnet unless marked)
1. **Context-true Algorithm.** Scope: queue items carry `ttl` + `ctx` (phase / ship / moon / expedition) and are dropped when stale. Story HR lines play only in the ship on day 1. Guide move/sprint lines are skipped when the stream pinned the controls. The scramble lasts ≤ 2 frames, ASCII only. Files: `src/game/onegoal_core.js`, `algorithm.js`, `story.js`, `guide_data.js`, `onboard.js`. Check: a node test (a line queued in orbit is gone after landing), and a scripted 5-min run whose log has 0 terminal/HR/WASD lines after `phase:moon`.
2. **First sighting beat [Opus].** On the first landing of each moon, the director stages one pool creature at 12-20 m in a lit spot, facing away, eye tell on, for 3 s, then it leaves (existing crdirector first-encounter + creatureart poses). Files: `crdirector*.js`, `threatpool.js`, first-encounter captions. Check: on hamsi day 1 with a fresh profile, a shot within 4 min has a creature at ≥ 3 % of the frame, and the sim shows no damage from the beat.
3. **Hero prop pass.** Model the vending machine (glass front, coils, logo, bulb), the server rack and the statue (the bulky carry items), plus the lead pipe (fitting + bend). Files: `src/models/artpass.js`, item models. Check: before/after shots at carry distance, and a stranger names each item.
4. **Dev-language sweep.** Default names from the crew name pool instead of Host/Client/Tester; one revive message instead of two; delete the "Optional onboarding" line; rename SHIP LOOT to "Company buys at 37 % today"; one quota source for the top bar and the report; fix the route card interior label. Files: `downed.js`, `guide_data.js`, `routeboard_core.js`, `src/ui/hud.js`, i18n TR/RU. Check: `grep -rn "Client\.\|Tester\|TUTORIAL SKIP"` finds no UI string, plus 3 shots.
5. **Horror-safe loot glint.** Replace the rarity pillar with a floor glint of ≤ 0.6 m plus a slow shimmer, capped under the ceiling and hidden through walls (depthTest on). Files: `src/game/loot.js`. Check: the `glove_torch` spot is reshot with no pillar through a wall.
6. **The stream stays the frame [Opus].** A persistent small LIVE badge fed by the algo1 viewer count, one number everywhere (overlay, box, report). The onboard chat renderer is reused for 1-2 chat lines at 5 existing moments (TAGGED, downed, catch/crack, boss card, clean pass). Files: `algo1.js`, `onboard.js`, `feedcams2.js`, `highlights.js`. Check: in a 5-min run the count changes ≥ 5 times, and a chat line shows on TAGGED.
7. **Expedition first frame.** Face the objective on arrival (billboard / beam / hull ladder) instead of our own ship, and replace the roof confetti with rain streaks or remove it. Files: `expeditions.js`, `expeditions_maps.js`. Check: the first frame on each of the 3 moons shows the goal landmark, and the ship covers ≤ 20 % of it.
8. **Highlight clip reads as footage.** Draw the facility walls (from the plan) behind the tracks, creature silhouettes instead of squares, and a timestamp + caption per event. Files: `highlights.js`. Check: a shot where the room shape and the chase are readable without the caption.
9. **Tab card = 5 lines.** In Standard, the Tab card shows at most 5 objectives with no TUTORIAL line for veterans; FACILITY STATUS and the patron bar move to Full only. Files: `onegoal*.js`, `hudcalm.js`. Check: a `n2_tab_card` reshot with ≤ 5 objectives.
10. **QA night 4 (browser, one landing per tab).** Shoot what is still unseen: solo self-stand-up, the KNOWN RESIDENTS terminal, the heat-pull caption, the levrek morning, the dune beam, marker de-overlap, the boss card (paused), a creature lineup of the 4 pool creatures on 3 hero moons, and tasks 1-9 after they merge. Files: `tools/harness/qa_night4_*.js`, `docs/wave8/qa_night4.md`. Check: every "unseen" row in §2 has a shot or a filed bug.

If 1-6 land and are seen: clarity 6.5, identity 7, visuals 6.5, polish 6, which is about **6.4**. Reaching 7 needs audio heard, creatures that scare, and a human playtest (Q1).

## 5. Questions for the owner
1. **Gerçek oynanış testi (15 dk, kendi ekran kartınla):**
   - (a) Bu akşam arkadaşınla 2 kişi, kontrol listesiyle (ses, kalkış, yaratık, taşıma). 3 not + 3 ekran görüntüsü yeter.
   - (b) Tek başına oyna.
   - (c) Test yapma, headless ile devam.

   **Öneri: a.** Ses hiç duyulmadı, kalkış yazılımsal GL'de çöküyor, iki gerçek insanla hiç oynanmadı. 7/10 bu testi geçmeden onaylanamaz.
2. **Algoritma nasıl konuşsun?**
   - (a) Sadece olaylara tepki versin (işaretlenme, düşme, ganimet, boss, temiz geçiş). Yayın açılışından sonra senaryolu HR/eğitim satırı olmasın, kutu çoğu zaman kapalı kalsın.
   - (b) Şimdiki gibi: zamanlanmış satırlar, hız sınırlı.
   - (c) Daha çok konuşsun (sesli okuma açık).

   **Öneri: a.** Her an konuşan ama ekrana tepki vermeyen bir sunucu "yapay zekâ yazmış" gibi okunuyor. Az konuşup yerinde konuşan bir Algoritma karakteri taşır. Bu karar görev 1 ile 6'nın kapsamını belirliyor.
