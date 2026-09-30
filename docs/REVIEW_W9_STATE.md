# TFG — State of the Game & Roadmap (W9)

*Scope: code, docs and QA shots only. No human has played the build. Every shot predates tonight's merges (algoctx, heroprops, firstsight lamp, spreadMarkers), so several visible bugs may already be fixed.*

## 1. Score: 5.4 / 10 now (likely 5.6-5.8 once tonight's fixes are reshot). Target 7.

| Area | Score | One-line evidence |
|---|---|---|
| UI / UX | 6 | Route board and report are great (n2_board, n2_day_summary). HUD collisions remain: "75 m102 m" (hud6_standard), and n2_stream shows two viewer counts, 1,470 vs LIVE 120. |
| Core loop | 5.5 | The camera verb reads on screen (n3_cam_cone), but quota is slack: 21.8x / 12.8x / 7.4x sold/quota at q0-q2 (tools/sim/economy.mjs). |
| Meta / progression | 4 | About 9-16k idle credits by q3 against a 700 max price (items.js:265-278). First unlock arrives around 45 min. |
| Feel / identity | 5 | The creature is two orange dots in black (firstsight.jpg). The stream frame disappears after 12 s. |
| Onboarding / friends | 5 | Good solo opening. No join link (main.js:153-155 dev flag only). No PLAY button (crtmenu.js:204-206). |
| Tech | 5 | 158 node tests pass. OOM at the 3rd landing on software GL (qa_night3 §0). 1047 silent catches. No real GPU run yet. |
| Audio | ? | Never heard by anyone. The owner complained about the sounds (conversation_log 19:27). |

## 2. What works (keep, and build on)
- **Route board** (n2_board): card art, danger pips, payout and a hook line. It is the reference grammar for every panel.
- **Performance report** (n2_day_summary): S stamp, MVP chips, income by source. It carries the voice.
- **Stream-open overlay** (n2_stream): LIVE badge, viewer count, fake chat, lower third. The chat copy has real wit ("bet they die on the stairs").
- **Camera verb readability**: soft cone, green blind ring, drone lesson, TAGGED wash (n3_cam_cone, n2_drone, n2_tagged). Tuning comes from a sim (feedcams_sim).
- **HUD rules**: one goal line and a calm HUD (hudcalm.js:22-40, onegoal_core priority escape > loot > job).
- **Solid base systems**: downed + revive (solo self-stand-up), carry comedy, Quick Shift, the staged unlock ladder, the design tokens in theme.css.
- **Tooling**: economy sim, perf5 profiler, landing queue + warmset (404 landing 6.2 s → 1.7 s), netaudit (10 real MP bugs fixed).

## 3. Top 10 problems (ranked by player impact)
1. **No pressure means no decisions for the first ~1.5-2 h.**
   - Evidence: quota 130 (progression.js:69) against 290-650 scrap on site (n2_board); sold/quota 21.8x at q0.
   - Credits have nowhere to go: the catalogue tops out at 700.
   - Quota is judged only on deadline day (host.js:463), so progression is clock-gated.
2. **No creature is ever legible or scary.**
   - The first sighting covers 3.64 % of the frame: two dots plus a "??? UNKNOWN ENTITY" label (firstsight.jpg).
   - No n3 shot contains a creature. This matches the owner's complaint that creatures arrive and they do not understand them (19:21).
3. **A friend cannot join by link.**
   - The code shows in a toast that is hidden during the stream overlay (host.js:59), and the network mode must match by hand.
   - A mismatch fails after 25 s (game.js:643).
4. **The Algorithm, the game's face, reads as generated.**
   - It moves between 3-4 places (algorithm.js:119, docklayout.js:10,62).
   - It shows stale lines: "WASD to walk" outdoors (hud6_standard), "HR: Congratulations… ben\%" (n2_stream).
   - It shows two different viewer counts. Voice is off by default (algorithm.js:258).
5. **The stream identity dies after 12 s.**
   - From then on the top bar reads QUOTA · DAYS · CREDITS · ROUTE, plus terminal, lever and "sell at 37 %". That is the Lethal Company skeleton (REVIEW_W8_MORNING §3.5).
6. **The camera verb is not a trade.**
   - Cameras avoid treasure and vault rooms (feedcams_core.js:124).
   - A junction cut is instant and permanent (feedcams.js:364-365; stateNow only expires BLIND).
   - Careful and sloppy play end with about the same net (feedcams2.md: 967 vs 959).
7. **The build is unproven on real hardware.**
   - The 3rd landing and the dune takeoff OOM at 7.7 GB on software GL.
   - No real-GPU numbers, no real WebRTC session.
8. **The screen is too full and elements collide.**
   - 37 dock chips held apart by a 4 Hz JS de-collider.
   - n2_stream: "[E] UNLOCKS AT QUOTA 2: PETS" sits mid-screen and chat covers hotbar slots 3-5.
   - The Tab card has 9 lines (n2_tab_card). The inventory lets the HUD bleed through (critique/07_inventory).
9. **The first sale and first unlock are deflating.**
   - The game nudges a sale on day 1 at 30-38 % (onboard.js:619, progression.js:319-324) and never says the deadline day pays 100 %.
   - The number soup: 50 / 44 / 130 / 400 / 37 %.
   - Unlocks are a banner with no gift (onboard.js:120-128). Day 2 is dark with no torch (loaner.js:17).
10. **Audio has never been heard.**
    - 64 procedural recipes were checked in node only (sound2.md).
    - The camera has no sound signature, and voice chat is unreviewed (AUDIO_AUDIT.md bugs deferred).

## 4. UI/UX direction: one frame (the stream), one lane per message, nothing new
**Permanent frame at 1280x720**
- Top-left: a slim **● LIVE 1,470** strip (algo1 viewers, the one number used everywhere). It ticks on events (+300 on TAGGED).
- Under the strip: body icon, HP/STA, one goal line.
- Top-centre: compass and clock. The **Algorithm subtitle** goes under the compass: one slot, 2 lines max, react-only.
  - Do not move it back to the bottom: it covered the "[E] board the ship" prompt there.
- Right column: toasts, at most 2, 4 s, no duplicates. Centre: the interact prompt only. Bottom-right: the hotbar.
- QUOTA / CREDITS / ROUTE leave the top bar and move to the Tab card and the terminal header.

**Per phase**
- **Orbit / ship:** the terminal opens on the route board. Each card adds a **CAMS 3 · covers ~2x** row. The HQ row reads "37 % today · deadline day 100 %". Locked-fixture prompts stay hidden until the player is within 2 m.
- **Landing:** the first frame faces the objective (hull ≤ 20 % of frame). The Algorithm gives one line of context: "3 cameras. The vault is on air."
- **Facility:**
  - Goal line only. Once the day target is met, it becomes the **greed line**: "▮{left} still in here · deep room 40 m · leaves 23:00".
  - While on air, the TAGGED wash and one Algorithm line.
- **Carry:**
  - The carry line shows the price of being on air: "▮251 → ▮188 if tagged". It replaces the duplicate "carrying ▮251" (n3_carry).
  - Hotbar names get 12 characters.
- **Summary:** keep the report. Add the viewer delta, "+N followers", a CLEAN SHIFT line and the highlight clip rendered as footage (walls, silhouettes, "CAM 04 · 14:07 · REC") instead of the debug plot (n2_highlight_crt).

**Cut or restyle**
- Retire the pink top box, the big-face card and the extra lower third.
- Tab card: 5 lines. Drop TUTORIAL and hint lines for veterans; move FACILITY STATUS and PATRON to Full density.
- Terminal: remove the vocabulary dump and the doubled SECTOR MAP (n2_allroutes). Tabs come later.
- Skill tree: drop the purple nebula, which theme.css:3-5 bans. Inventory: make it opaque.
- Host form: fold everything into ADVANCED except max players and START. Public is off by default.
- Verify the VT323 face with `document.fonts.load` before shots. The hud6 shots show a DejaVu-like fallback.

## 5. Core-loop direction: every minute asks "on air or off?"
- **0:00 Ship.** Pick a route by CAMS and quota cover, not only by scrap range.
- **0:30-1:30 Walk.** 34-65 m with the drone lesson. The Algorithm says one rule: "Red light is my camera. Stay out or cut the feed."
- **Facility.** Cameras guard the money (about 60 % of non-tutorial cams in the rooms holding the top loot spots). Every counter costs something:
  - **Spray:** quiet, lasts 40 s.
  - **Junction cut:** silent, needs a 2 s hold inside the blind ring, lasts 90-120 s, then "the Algorithm reroutes".
  - **Smash:** permanent but loud, it draws a creature.
  - **Slip past:** a detour.
- **Co-op comedy.**
  - One player decoys in the cone while the other cuts the box or runs the two-person vending machine through the dark flank.
  - Being downed on camera equals viewers plus a highlight clip. Stakes stay cheap because the owner wants an easy start.
- **Target met → greed line.** Leave now or push deeper with the clock visible. Clock tint at 21:00 and 23:00.
- **Dead time to cut:**
  - The day-1 sell trip at 37 %.
  - The 45 min with nothing new before quota 1.
  - The dark day 2 without a torch.
  - Dead players with nothing to do: give them the ship monitor bank (feedcams views plus a warning ping) instead of a text label (actions.js:1044-1056).
- **Keep:** the 3-day cycle and the boss after it (owner design, L3065). Do not evaluate quota at the sale.

## 6. Meta direction: "my channel grows" is the reason to come back
- **Quota:** a mild squeeze, quotaBase about 300-350 and overtime surplus/10. The start stays generous (owner L3677). Sim target at q0 is 6-12x.
- **Unlock ladder, pulled forward:**
  - Shop and tree at the first sale.
  - Arcade and pets at q1.
  - Homeworld, farm and diner at q2.
  - Forge and zones at q3.
  - Voyage and season at q4.
- **Each unlock hands over a gift:** a coupon, a seed, or a free contract.
- **Clout becomes Followers** (owner decision 3). The report shows "+N followers". The fired screen becomes a season recap with the best clip kept.
- **Tycoon (NIGHT_LOG row 30, owner request)** becomes the **credit sink** and the crew's "studio": a monitor wall showing the best clip, a viewer-count sign, stage lights. Its income stays inside the existing ECON caps.
  - Gate: it is not merged without a browser shot and a 10-min solo play.
- **CLEAN SHIFT:** +10-15 % on the day's sale for a crew never tagged. This finally makes the verb pay.
- **Hide nothing the owner asked for.** Only list opened systems on the Hub. No new side layers (farming, chess, forge, zones, trade stay as they are).

## 7. Consolidation plan (tech and bloat): merge, gate, measure
- **Gate:** `npm test` (a fast tier over all *.test.mjs, under 3 min). merge_agent.sh refuses to push to main when it fails. It adds no new tests.
- **Error budget:** Emitter.emit and useModule count and dedupe throws (events.js:47-59, game.js:1504). Add a ring of the last 20 errors in perfInfo. perf5 fails on storms.
- **Spawners, small fix only:** host.js:632/709 and director.js:569 go through `crdirector.canSpawn`. The big merge waits.
- **Algorithm:** one queue with class, ttl and ctx inside algorithm.js. Providers register lines instead of calling lore.say. The 8-module fold comes later.
- **Load:**
  - The menu opens before the ext-model preload (main.js:118-125).
  - Side games (resto, food, zones, forge, arcade) move into lazymods.
  - Add an fps percentile to perfInfo.
- **Deferred until 7/10:** the dayrules merge and wrapMethod → named hooks. Both are real, but invisible to the player.

## 8. Roadmap
**NOW (8 Sonnet-sized tasks)**
1. **QA night 4, reshoot + grep.**
   - Scope: reshoot firstsight, n3_carry, hud6_standard, n2_stream, the Tab card and spreadMarkers after tonight's merges. Add a grep test for `%#`, "Optional onboarding", "Tester", "[E] X [E]".
   - Files: tools/harness/qa_night4_*.js, docs/wave8/qa_night4.md.
   - Check: the shots exist and the grep test is green.
2. **Join link.**
   - Scope: `?join=CODE&net=X`. "Copy join link" in Pause and in the Quick Shift toast. The code stays visible in the terminal header.
   - Files: main.js:153, host.js:59, hubgate.js:330, ui.js:1079, net/session.js.
   - Check: a two-tab test joins from the URL alone.
3. **PLAY button.**
   - Scope: PLAY is the first entry (private, saved settings). Host fields fold into ADVANCED; Public off. DAILY and HUB are hidden until unlocked.
   - Files: crtmenu.js:204-206, ui.js:469-527.
   - Check: menu to stream in 2 clicks, with a shot.
4. **Economy re-anchor.**
   - Scope: quotaBase about 300-350, overtime surplus/10, day target = cash still needed at today's rate, one quota source for bar and report.
   - Files: progression.js:69, host.js:479-481, objectives.js:53, hud.js.
   - Check: economy.mjs gives q0 6-12x with the median still 6-7 quotas; econ8.md updated; bar and report match in a shot.
5. **First sale + torch.**
   - Scope: no `wantSell` on day 1. HQ row and ship-loot card say "deadline day pays 100 %". The loaner torch lasts until quota 1.
   - Files: onboard.js:619, objectives.js:31-33, routeboard.js, loaner.js:17.
   - Check: a node test covers the fresh-profile day 1-2 goal lines.
6. **Ladder forward + gifts.**
   - Scope: new UNLOCKS table; announceGift hands over one item. The Hub lists only opened systems.
   - Files: onboard_core.js:140-147, hubgate.js, onboard.js:120-128.
   - Check: hubgate.test is green; a fresh profile has the store after the first sale.
7. **Cameras on the loot.**
   - Scope: planCams bias toward loot rooms. ST.CUT expires after 90-120 s and needs a 2 s hold. CAMS row on route cards.
   - Files: feedcams_core.js:124-172 + stateNow, feedcams.js:355-366, routeboard_core.js.
   - Check: feedcams_sim careful-vs-sloppy net gap ≥ 15 %; a test shows ≥ 60 % of cams in loot rooms.
8. **One Algorithm slot + LIVE strip.**
   - Scope: react-only box under the compass. A LIVE strip replaces CREDITS/ROUTE. One viewer number.
   - Files: algorithm.js:119-300, docklayout.js:10,62, algo1.js, hud.js .hud-quota, hudcalm.js.
   - Check: a CALM shot has no Algorithm box; a TAGGED shot has one line; the strip, box and report show the same number.

**NEXT (5)**
1. Three message lanes, a 1280x720 overlap lint test (hud_overlap.test.mjs), the Tab card at 5 lines, and the terminal dump removed.
2. Greed line, tax preview on the carry line, TAGGED goal only when carrying scrap, CLEAN SHIFT line on the report.
3. First sighting as a lit silhouette: 6-10 m, ≥ 8 % of frame, label only after 2 s. Shoot all 4 pool creatures on the 3 hero moons.
4. `npm test` + pre-merge gate + error budget + the canSpawn small fix.
5. Turkish pass:
   - Set `<html lang>` from the setting (index.html:2 is hardcoded "en").
   - Plate text goes through `toLocaleUpperCase('tr')`: 169 toUpperCase calls against 2 locale-aware ones, so "i" does not become "İ".
   - Take the TR shots of menu, HUD, board, report and Tab card.

**LATER (5)**
1. Terminal as a tabbed board (ROUTES | STORE | JOBS | CREW | LOG).
2. One panel material: skill tree, inventory and tycoon panel. Reshoot hub, store, pets, settings and pause.
3. Highlight clip as footage, Followers, fired-screen recap.
4. Palette verification per hero moon, then expedition first frames.
5. Dead-player monitor job, a Comfort block (shake, zoom, flash limiter), colour-blind shots, and adaptive quality in the run.

**Do NOT do**
- New modules or systems.
- Quota evaluation at the sale.
- Hiding pets or the tycoon.
- Dropping loot on down.
- The heat pip strip.
- More creature types.
- The dayrules and hook refactors before 7/10.
- The full spawner merge.
- Moving the Algorithm back to bottom-centre.
- Merging anything that has no browser shot.

## 9. Only the owner can do this (15-minute checklist)
Use a real PC, Chrome, and a friend on a second PC.
- **0-2:** Cold load. Time to the menu. Do the letters look like a CRT font or a plain one?
- **2-4:** Host, then the friend joins by code. Did it work first try? How long did it take?
- **4-7:** Stream to route board to landing, with sound on. Mark any sound that annoys you (footsteps, ambience, camera).
- **7-10:** First camera: was it clear what to do? First creature: did you see a shape? Were you scared?
- **10-12:** Two-person carry plus one revive. Was it funny?
- **12-14:** Three landings in a row. Note any stutter or crash. Type `kefal.game.perfInfo()` in the console after landings 1 and 3.
- **14-15:** Read 10 Algorithm lines in Turkish. Mark the ones that sound translated. Rewrite the worst 5 in your own words.

## 10. Three decisions for the owner
1. **Starting quota:** (A) keep 130, very generous; (B) about 300-350, mild pressure, start stays easy; (C) about 450, tight. **Recommend B.**
2. **Homeworld tycoon:** (A) finish as designed; (B) finish it as the credit sink and a stream "studio", with a shot and a 10-min play before merge; (C) freeze it. **Recommend B.**
3. **Clout:** (A) keep it as a second currency; (B) rename it Followers, earned from viewers, and make the report show how the channel grew; (C) remove it. **Recommend B.**
