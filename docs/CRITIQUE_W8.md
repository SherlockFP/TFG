# CRITIQUE W8 — Design Director (harsh) — 2026-09-29

Scope: one bounded headless play session (menu, orbit/ship, terminal, 2 moons outdoor+indoor, creature, inventory, passive tree, day summary) + code reading
(`docs/HANDOFF.md`, `MASTERPLAN §21/§28`, `REVIEW_W7`, `RESEARCH_W7`, `LORE`, `src/game/creatures.js`, `balance_core.js`, HUD code). Screenshots: `docs/wave8/critique/*.jpg`.
Caveats (be fair): swiftshader headless = no real "feel", no audio heard (audio = code impression only). In this worktree the condensed UI font 403'd
(node_modules symlink outside the vite allow list) so text fell back to a WIDE monospace; that inflates wrapping in objectives/terminal/Algorithm caption,
but the *panel-on-panel overlaps* (z-order, boxes covering the view) are real. Teleports were used to reach places; creature fight was scripted, not played.

## 1. Score now: 4.5 / 10 (owner says 4 — I agree, +0.5 for the menu and mansion interior)

| Axis | /10 | Why (harsh) |
|---|---|---|
| Core loop | 5 | In→loot→out→sell→quota is Lethal Company's skeleton, and it works. But no verb of its own (REVIEW_W7 says the same). First 10 minutes have no single clear goal (02). |
| Feel | 4 | Unproven. Never played by 2 humans. Creature test: crawler first hit after 1.8 s, 30 dmg, fine on paper; nothing I could verify about hit-stop/telegraph. Instakill table (999 dmg) is a feel-killer, see P6. |
| Clarity / UX | 3 | Worst axis. 18-21 simultaneous HUD regions (04, 05b), a central caption box that covers gameplay, a timed vote modal over the terminal (03), two currencies with no explanation. |
| Visuals | 5 | Peaks: menu room (01, 7/10), factory hazard-tape corridor (05b), mansion wallpaper+chandelier (11, 6.5/10), ship. Troughs: outdoors = grey fog + one pine + poles (04, 10, 3/10), HUD = modern crisp UI on top of PSX world (no coherence). |
| Audio (code only) | 5 | Big procedural synth (`sfxlib` 145 KB, creature voices, dsp) + 477 external audio files, proximity voice exists. Not heard; risk = too many voices/bark lines (Algorithm talks constantly). |
| Content density | 3 | "Wide but hollow": 106 m walk to the entrance in fog with nothing on the way (04); 110 scrap + 12 creatures over a 300+ m facility; 60+ systems but each shallow. |
| Identity / originality | 6 told / 4 shown | Concept (Algorithm streams your panic, dead-web moons) is genuinely original. On screen it is only *text*: captions, "LIVE 138", chat lines. World does not look watched. |
| Polish / bugs | 3.5 | 6 visible defects in 9 shots (see P4, P9, P14). No console errors (0 page errors — good). |

Weighted result 4.4 -> **4.5/10**. The gap to 7 is mostly *subtraction and layout*, not new features.

Screenshot index: `01_menu` main menu · `02_orbit_ship` ship first frame · `03_terminal` MOONS list · `04_moon1_outdoor` 56K-Dialup outdoor ·
`05b_factory_creature` factory + Web Crawler · `07_inventory` · `08_skilltree` · `09_summary_missing` (day summary NOT visible, see P14c) · `10_moon2_outdoor` snow · `11_moon2_inside` mansion.

## 2. Top 15 problems (ranked by impact on the score) + concrete fix

1. **No single core verb, no obvious first goal.** 02: first frame has a 15 s "MORNING RULES vote 1/2/3" modal, 4 objective lines ("Land on…", "TUTORIAL 1/7", terminal tip, contract tip, patron tip), a patron meter, a live-chat box. A new player cannot say what the game is. *Fix:* MASTERPLAN §28 verb ("stay off the Algorithm's cameras, then extract"); first run shows exactly ONE objective line and zero modals until the first extraction.
2. **HUD overload: 18 regions outdoors, 21 indoors** (04: body icon+HP+STA+weight, event card, 2 objectives, chat/hype, DAILY, HUNGER, clock, compass+2 markers, level bar, 2 currencies, assignment, THREAT, NOISE, PATRON/TRENDING, caption, 2 ability buttons, pockets, 5 hotbar; indoors + FACILITY STATUS + 3 distance markers; 37 files register HUD docks). *Fix:* HUD budget = 6 always-on (HP/STA, hotbar, 1 objective, compass, noise, LIVE badge). Everything else on hold-Tab or context-only (hunger only when <40 %, daily/patron/threat only in ship, chat/hype only on events, abilities only when usable). Delete THREAT text panel (fold into vignette/heartbeat).
3. **The Algorithm caption box sits centre-bottom over the action.** 05b: it covers the creature and its name tag ("UNKNOWN ENTITY" is hidden behind "HR: Take contracts…"), bleeds into hotbar/SHIP LOOT (02). 3-line sentences, constant. *Fix:* one-line ticker top-centre under the clock, max 1 message / 45 s outdoors, never in a chase, priority queue, 2.5 s. Make silence a feature.
4. **Overlapping / stacked UI (real bugs).** 03: Morning-Rules vote is drawn ON TOP of the terminal (title text "MORNING RULES · VOTE WITH 1/2/3" is also clipped by the timer chip). 05b/11: `THREAT` panel collides with a distance marker ("Clean Vent 45 m", "128 m") and with FACILITY STATUS. 07: HUD text bleeds through the inventory panel. *Fix:* one HUD layout manager with named slots + z-order table (modal > terminal > panels > HUD); votes auto-defer while terminal/panel is open; run `textOverlaps` in CI on 4 screens.
5. **Big and empty.** 04/10: 75-106 m of fog to the entrance, one pine and lamp poles; interior: 12 hosted creatures on the whole moon, the nearest at 39-73 m and the zombots ~340 m away, the objective marker 104-128 m. *Fix:* scale moons to 55 % area, one landmark visible from the ship, one "story beat" every 25-30 m (sign, corpse+audio log, camera, dropped loot), fog range up so hills read. Fewer, hand-authored setpieces > procedural sprawl.
6. **Creatures that one-shot.** `creatures.js`: lurker, jester ("Pop-up", run 13.5 m/s > player sprint 8.2), giant, sandkefal, mimicdoor, stalker all `dmg: 999`; `balance_core.js EARLY` removes the hit cap at quota 3 (`hitCap: 0`). Even the starter moon 56K-Dialup spawns lurker (weight 6). *Fix:* no 999 anywhere; max hit 60 % max HP, 0 HP = DOWNED (crawl + revive by crew, 20 s bleed-out) so death is a co-op event; jester/sandkefal telegraph 1.5 s and cannot exceed 1.15x sprint; keep the "instakill" only as an opt-in Hard mode.
7. **Modifier soup before the first step.** Day start stacks: daily event card (CLICKBAIT FRENZY / DEAD LINK / RUSH HOUR each with 2-3 stats), weather forecast line, assignment ("Heavy lift…"), crew tasks, hype vote, patron trend. Nobody reads it; it reads as spam. *Fix:* max ONE modifier per day, shown as a 2-second title card in the ship, not a permanent HUD block. Move the vote to the end-of-day summary ("Tomorrow: pick 1 of 3").
8. **Outdoor art is monochrome and unfinished.** 04/10: everything is grey-blue; hills are visible flat polygons, trees are outline sprites, poles have no tops; weather fog eats all colour. *Fix:* per-moon palette (Dialup = sodium-orange dusk, Guestbook = cold teal + red beacon), fog colour != grey, emissive landmark on the horizon, 3 hero props per biome.
9. **Objects wrongly placed / geometry suspicious** (owner's complaint, partly confirmed): 02 green sign slabs clip diagonally through the pillar and window at top-left; the first interior teleport (shot not kept) landed the player facing a black wall of crates/planks (scrap spot flush with geometry; may be my teleport, verify); 10 lamp/pole rods float with no top or base. *Fix:* a per-moon "prop audit" test: raycast every prop/scrap spot for wall-overlap and player-headroom; visual regression shots for the ship (`shiplayout.js` is the single authority — extend the overlap test to signs/pipes).
10. **Identity told, not shown.** Algorithm = text. No cameras, no drones, no LIVE frame on the world, no "you are being watched" moment. *Fix:* physical Feed: ceiling cams / drones with visible cones + red tally light; when seen the LIVE counter ticks and creatures are drawn to you. This IS the §28 verb; ship it before more lore.
11. **Economy display is unreadable.** `▮60 · ◈50`, "sell today @37 %", "quota ▮0/▮130 · need ▮130", "SHIP LOOT 0 items · quota…" repeated in 3 places; `Lv.1 LURKER (+1)` rank names; two currencies with no legend. *Fix:* one number on the HUD: "QUOTA 0/130". Sell rate only at the sell terminal. Credits vs Clout explained once, in the ship.
12. **Progression bloat at level 1.** 08: 128-node passive tree with 4 roles at Lv.1, 0 points; pets, forge, shipyard, homeworld, farming, chess, arcade, daily, season all reachable. Impressive, wrong moment. *Fix:* tree hidden until first quota met; then 3 roles × 8 nodes. Everything else lives behind a "Hub" door (see §3 CUT).
13. **The terminal is a wall of text.** 03: MOONS prints 14 moons + a "Deep Feed" sector list with stats, wrapped across the screen. Route choice — the most important daily decision — is not a decision. *Fix:* visual route board: 3 cards/day (moon art, danger pips, payout, 1-line hook); full list only via `MOONS ALL`.
14. **Flow bugs seen.** (a) 04: objective "Bring scrap to the ship ▮51 / ▮44 today" is CHECKED at 0 scrap on day 1 (`objectives.js:53`, `dayStats.collected`/`clientCollected` stale?). (b) Credits went 60 -> 51 across one land/takeoff with nothing bought (unexplained fine?). (c) Day summary: after a real takeoff no `.report` was created; when I called `showDaySummary` directly the `.report` node existed in the DOM (text correct: "PERFORMANCE REPORT ... A SOLID CONTENT. ENGAGEMENT UP.") but the screenshot 6.5 s later (09) still shows the ship + Morning-Rules vote and NO report on screen: hidden/queued behind the vote modal or its CSS entrance never ran. The end-of-day payoff, the most rewarding screen, was never seen. *Fix:* assert in `wave4_checkup_02_loop.js` that the summary appears after takeoff.
15. **Nothing is validated with humans.** 0 real 2-player sessions, feel/audio unheard, 60+ systems never hand-played (HANDOFF §7). A 4/10 that is really "untested" will keep failing. *Fix:* Wave 8C ends with a scripted 2-tab session plus a 20-minute owner playtest against the checklist in §4.

## 3. THE DIRECTION

**Pitch.** *You are unpaid "content janitors" sent into dead server-moons (abandoned websites turned into haunted places) to salvage scrap. The Algorithm broadcasts your bodycams live to an audience of bots and feeds on your panic. Its cameras are everywhere; being SEEN raises your LIVE heat, and heat draws creatures. The whole game is one verb: **stay off the feed, or cut it** — sneak between camera cones, blind cams with a thrown chalk/EMP, bait cams with decoys, then haul loot out while the crew shouts over proximity radio. Loot is banked only if it leaves the moon off-feed. Death is a downed teammate you can revive, and every run ends with the Algorithm's edited "Highlights" — a 10 s replay of your best fail.*

**DOUBLE DOWN** (already in code, pays the identity): The Algorithm as physical cameras + LIVE counter · proximity voice + walkie · rule-based creatures (Listener hears you, NPC telegraphs aim, escapable chases) · corporate-CRT UI language (menu 01 is the best screen in the game) · loot-loss fear · dark-comedy captions (but 1/5 as many).
**CUT or HIDE** (behind a "Hub" door that unlocks after quota 1; NOT in HUD, NOT in terminal HELP): chess/dama/carnival/arcade, pets, farming/cooking/hunger bar, forge, homeworld tycoon, zone capture (postpone until the verb exists), voyage random moons, mirror dimension/backrooms, mods, daily login/season banners, morning vote, 128-node tree, most of the 50+ terminal commands, daily-event stat soup.
**Start-of-game content set:** 3 hand-polished moons (1 factory, 1 mansion, 1 outdoor-heavy), 6 creatures, 1 boss, 1 ship. Everything else re-enters in waves after the verb works.

**The core 10-minute loop (beat by beat)**
1. 0:00-0:30 Ship, one line on screen: "Pull the lever." One route card, no vote, no tutorial spam. Algorithm says one sentence.
2. 0:30-1:30 Descent cutscene 6 s; land in sodium dusk; the entrance landmark is visible on the horizon. Compass + LIVE badge only.
3. 1:30-3:00 Walk 40 m outdoors, 2 story beats (dropped crate, warning sign + first camera drone). Tutorial by doing: the first camera teaches "red light = you're live".
4. 3:00-5:00 Enter facility; power low; flashlight battery matters. Rooms are set-piece sized (10-15 m), each with one loot choice (light+small vs heavy+risky). Cameras cover the good rooms.
5. 5:00-7:00 A creature reacts to LIVE heat (Listener / stalker). Counterplay: break line of sight, cut camera, crew distraction. One hit hurts (max 60 %), second downs you.
6. 7:00-8:30 Haul out heavy loot two-person (physics comedy), radio chatter, Algorithm mocks the live count.
7. 8:30-9:30 Sprint back; door closes at the deadline; late crew is left outside (existing rule).
8. 9:30-10:00 Sell terminal: ONE number (quota 130/130 or not); Highlights clip (10 s); pick tomorrow's upgrade (1 of 3). Loop.

## 4. Plan to reach 7/10 in 3 waves

**Wave 8A — "Clear the Screen" (4.5 -> 5.8).** Subtraction only, ~1 week of agent time.
HUD budget of 6 + layout manager + z-order (P2-4); Algorithm ticker (P3); kill the morning vote/modifier soup (P7); one currency on HUD (P11); gate Hub systems and the tree (P12); no 999 damage + downed state (P6); route board instead of terminal wall (P13); fix objective/summary bugs (P14); prop/scrap-spot audit test (P9). Exit test: 5 screenshots, ≤ 7 regions each, 0 overlaps (`textOverlaps`), first 3 minutes readable without text.
Expected gain: clarity 3 -> 6, polish 3.5 -> 5.5, feel 4 -> 5.

**Wave 8B — "Fill the Space, Give It Colour" (5.8 -> 6.6).**
Shrink moons ~45 %, landmarks + story beats every 25-30 m, 3 hero props per biome, per-moon palette and fog, lighting pass (flashlight cones on, ambient not black), boss/creature roster cut to 6 with real telegraphs, first-run scripted 90-second tutorial-by-doing, audio ducking (Algorithm voice vs creatures). Exit test: 3 outdoor + 3 indoor shots per moon that a stranger calls "a place", not "a map".
Expected gain: visuals 5 -> 6.5, density 3 -> 6, identity shown 4 -> 5.

**Wave 8C — "The Verb" (6.6 -> 7.2+).**
Camera/Feed system (cones, tally lights, LIVE heat, blind/bait tools), off-feed extraction rule, Highlights clip, Quick Shift (15 min) as default mode, downed/revive co-op, then a REAL 2-player playtest (scripted 2-tab + owner) and one tuning pass on numbers.
Expected gain: core loop 5 -> 7, identity 4 -> 7, feel 5 -> 6.5. Only after 8C do zone capture/hub toys come back.

## 5. Questions for the owner (only you can decide)

1. **Ana eylem (core verb) hangisi olsun?** (a) "Kameradan kaç / yayını kes" — Algoritma kameraları, LIVE ısısı, görülmemek (§28, benim önerim). (b) LC gibi ama fizikli taşıma komedisi (R.E.P.O. yolu). (c) Bölge ele geçirme/savunma (§26). **Öneri: a** (b'nin taşıma komedisi a'nın içine eklenir; c ertelenir).
2. **Ölüm modeli?** (a) Anlık ölüm yok: 0 HP = yere düşer, ekip 20 sn içinde kaldırır. (b) Sadece boss/özel yaratıklar öldürür. (c) Şimdiki gibi 999 hasar, ama sadece "Zor" modda. **Öneri: a varsayılan + c isteğe bağlı Hard.**
3. **Yan sistemlere ne yapalım (satranç, arcade, pet, çiftlik, forge, homeworld, bölgeler)?** (a) "Hub" kapısının arkasına gizle, ilk kotadan sonra aç. (b) Tamamen kaldır/dondur. (c) Olduğu gibi kalsın. **Öneri: a** (silmeden yükü HUD'dan ve ilk saatten çıkarır).
4. **Görsel çizgi?** (a) Mevcut PSX + CRT/şirket UI'sını sıkılaştır, her gezegene tek renk paleti. (b) Daha temiz, düz renkli stilize low-poly. (c) Gerçekçiye yakın (performans riski). **Öneri: a** (menü zaten en iyi ekran, tarayıcı performansı korunur).
5. **Oturum uzunluğu?** (a) 15 dk "Hızlı Vardiya" varsayılan, kota kampanyası isteğe bağlı. (b) Şimdiki 3 gün/kota. (c) İkisi de menüde eşit. **Öneri: a** (linkle gelen arkadaş için ideal; kampanya ikinci kapı).
6. **Algoritma ne kadar konuşsun?** (a) Az ama keskin: dakikada en çok 1 satır, kovalamaca sırasında sessiz. (b) Şimdiki sıklık. (c) Sadece yayın olaylarında (LIVE eşiği, klip). **Öneri: a** (mizah azalınca daha çok hatırlanır; ekranı da boşaltır).
7. **İlk açılış deneyimi?** (a) 90 sn'lik yönlendirmeli ilk iniş, ekranda tek hedef. (b) "Hiring Day" sahnesi (mevcut onboard) ama sadeleştirilmiş. (c) Tutorial yok, direkt oyun. **Öneri: a** (b'nin sahnesi a'nın içinde 20 sn).
8. **Başlangıçta kaç gezegen?** (a) 3 elle cilalı gezegen + 1 boss, gerisi sonra. (b) Şimdiki 7+ gezegen ve rastgele sektörler. (c) Sadece prosedürel. **Öneri: a** (genişlik > derinlik sorununun doğrudan ilacı).

*Notes for the next agent:* fonts 403 in worktree runs — `server.fs.allow` needs `/home/user/TFG/node_modules` (or use the main checkout) before judging typography. Session cost: ~30 min wall, mostly waiting on the shared browser lock (`/tmp/tfg-browser.lock`); each swiftshader screenshot needs `timeout` > 30 s.
