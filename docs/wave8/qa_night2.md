# Wave 8 QA night 2: first look at everything merged after QA night 1

Build: main at 134b851 + glove / herocontent / shotfix (merged 6dd45d4 before the last runs). Software GL (swiftshader), 1280x720 (MP tabs 1024x576), default brightness (the post pass reads `uGamma` 1.08 out of the box; no x2.8 boost anywhere). Scripts: `tools/harness/qa_night2_lib.js` (shared helpers) + `qa_night2_a|b|c|d|f|g|h.js` (single-player passes, prepend the lib), `tools/harness/qa_night2_mp.mjs` (two tabs: host + client). Shots: `docs/wave8/qa_shots/n2_*.jpg` (16 files, 29-105 KB). Shots marked "before fix" were taken before the small fixes in section 3.

## 0. How the runs went (read this before trusting any "not verified")

I used far more than 4 headless runs (about 11, most of them short or crashed): four of them died because the **renderer process was OOM-killed** (`dmesg`: `headless_shell anon-rss 6.5-8 GB`, memcg out of memory, the victim thread was the audio thread each time). The kill always came right after a burst of synchronous `kefal.tick(n, dt, true)` renders (my `frames()` helper renders 3 frames per call): software GL executes each frame in 2-30 s and the queued GL commands pile up in the renderer. Proof it is the harness, not the game: the same steps (a hound spawned in the dark, `showDaySummary` with a highlight clip, the CRT replay) crashed the tab three times and then ran clean once `renderer.getContext().finish()` was called after every render (now in `qa_night2_lib.js`). `headless_shots.mjs` also learned `p.on('crash')` -> `process.exit(3)`: a crashed renderer used to leave `page.evaluate` hanging **while holding `/tmp/tfg-browser.lock`**, which blocks every other agent.
The two exceptions I could not clear: the **Sunken Server Barge** and **Rooftop Blackout City** landings crashed a fresh tab again (7 GB) even with `finish()`; the barge frames that did come out are a flat pale-green wash. See bug 1 in section 2.

## 1. Check table

| # | check | result | note |
|---|---|---|---|
| 1 | Hiring Day opens on the LIVE stream overlay | PASS (fixed) | `n2_stream.jpg`: LIVE badge, 1,470 watching, title plate, Algorithm lower third, MOD-pinned controls in the fake chat, clean frame. **Before fix** the whole Standard HUD (quota banner, HP, goal line, ticker "HR: Congratulations...", `[E] UNLOCKS AT QUOTA 2: PETS` prompt, hotbar, ship-loot card) showed through it. Fixed with `body:has(.ob-st) :is(.hud,.algo-sub,.hud-toasts){visibility:hidden}` (onboard.js). The overlay ends after 12 s and the flow lands on the terminal step. |
| 2 | Route board, 3 cards | PASS | `n2_board.jpg`: Dialup (CURRENT ROUTE, ROUTED. PULL THE LEVER), Chatroom, Estate; art bands + silhouettes, danger pips, scrap range, interior, weather, HQ row, footer "Quota 1 opens: 12-Forum, 33-Guestbook". Readable at 1280x720; the cards have a large empty band between the hook and the stats (wasted space, not a bug). The terminal hint line `[ESC] leave terminal` sits under the hotbar. |
| 3 | ALL ROUTES (TAB) | FIXED | `n2_allroutes.jpg` (before fix) shows the **SECTOR MAP readout twice**. Cause: `voyage` re-enters `terminal.exec('moons')` (passthrough) and the mapmods wrapper printed the readout in the nested and the outer call. Fixed with a re-entrancy guard in `mapmods.js`. |
| 4 | Tarped ship fixtures | PASS with a nit | `n2_tarps.jpg`: the arcade / chess spot is a dark-olive block with the "[E] UNLOCKS AT QUOTA 2: ARCADE & CHESS" prompt. A black lid of the fixture sticks out above the tarp (a child of the fixture at a different position is not hidden). Low. |
| 5 | Path drone + cone outdoors | PASS | `n2_drone.jpg`, `n2_tagged.jpg`: the drone is visible against the sky, the cone is a big flat peach triangle on the hill (reads as a searchlight, also as a pyramid), compass "SHIP 11 m / ENTRANCE 36 m", hint line "Red light = you're LIVE. Heat brings them." once. Entrance was 36 m from the ship on hamsi (pacing works). |
| 6 | Blind flank | PASS | `n2_blind_flank.jpg`: standing `blindOffset` m to the far flank the meter stayed at 0 (`fc.p` never created) while the disc passed the direct line. |
| 7 | TAGGED objective line | PASS (fixed indoors) | `n2_tagged.jpg`: red vignette, `ON AIR`, `TAGGED: get to the ship (11 m) or kill the camera that tagged you` as the one goal line. **Bug:** indoors the line also counted `hypot(x, z)` in the offset facility space ("12 m" when the ship was 100 m away). Now `TAGGED: get out to the ship or kill the camera that tagged you` (`onegoal.js`, EN/TR/RU, node test). |
| 8 | Standard HUD during a normal facility walk | PASS | `n2_hud_walk_torch.jpg` (fresh profile, torch on): 8 DOM regions (`hud-tl, hud-health, kmod-hm, hud-cross, hud-inv, hud-scan, hud-float, objectives`), exactly ONE goal line ("Bring scrap to the ship: 0 / 44 today"), 2 edge markers, ticker one line. `overlaps()` reports 5 small pairs (hud-inv digit over its slot, chat vs left dock 154x18 while the chat is idle, cooldown numerals). |
| 9 | Hold-Tab card | PASS (fixed) | `n2_tab_card.jpg`: OBJECTIVES / RUN / STATUS / CREW, both currencies, threat, facility status, patron bar. **Before fix:** `POWERLOW`, `SECURITYPASSIVE`, `FACILITY STATUSDATA CORE` (copied dock rows lost their flex + gap) and the left goal text bled through the card. Fixed in `hudcalm.js` (`.hc-tab .fh-s` rules, `hc-tab-on` hides the left goal). The ability bar still draws over the card's bottom edge. |
| 10 | Practicals / readable-dim interiors, 3 themes | PARTIAL | Factory (`n2_dim_factory.jpg`): readable (shelves, floor, ceiling lamps, catwalk). Metro (`n2_dim_metro.jpg`): walls, pillars, hazard-striped floor and blue strips read, but the platform is near black; a torch is needed. Influencer (`n2_dim_influencer.jpg`): the corridor corner is a flat olive-yellow wall block; no chandelier, velvet or marble in the frame; a glitch-noise column (Swipe Card marker) is the brightest thing. |
| 11 | Loaner torch in hand | PASS | Fresh profile, real landing on hamsi (21 s): toast, `Company loaner torch` (battery 70) on the ship floor, `g.pickup` + F works, hotbar slot shows the battery bar. The viewmodel is now a dark glove + cuff (glove merge), no white blob. |
| 12 | Highlight replay CRT | PASS | `n2_highlight_crt.jpg` (frozen rAF clock at the beat): REC + LIVE, VIEWERS 3,791, grid map, yellow subject trail with ring + flash, cyan crewmate, two red creature trails, progress bar with the event tick, Algorithm caption, SKIP. Looks like the stream frame it should. |
| 13 | Day summary + income by source | PASS (fixed) | `n2_day_summary.jpg`: S grade, rows, crew badges, CORONER line, INCOME BY SOURCE (Scrap +312, Job pay +240, Diner +90, Casualty fine -30), quota footer. **Bug:** the count-up used `k = (now - t0)/dur` with the rAF stamp, which can precede `t0`: at low fps rows counted to `-3,422`. Clamped (`ui.js` x2, `rewardviz.js`, `soul.js`); verified `312 / 312 / 2 / -30`. The report covers the top quota banner. |
| 14 | carry2 two-person strap | PASS (logic) / no visible strap | See MP table. Solo: `n2_carry_solo` (not committed): the vending machine viewmodel fills about half the frame and the crosshair. Two-person: `n2_mp_carry_client.jpg`; the strap line is not visible in either shot. |
| 15 | Expedition moons (barge / dune / roof) | PARTIAL | Barge and dune load, the need bars show (O2 29 s, CORES 0/3; HEAT 0%, STORM 6:41), `expeditions.state.kind` right. **The frames are a flat pale-green wash** (both ex shots, with the HUD legible on top), so the maps are not seen. Roof: crashed the tab at landing (7 GB). Not verified visually. |
| 16 | Creature eye tells in the dark | PARTIAL | Hound, scuttler, stalker... spawned with `hostSpawn` in a dark storage room: no crash once renders are throttled, but the frame shows an already-present "Internet Troll" and "Spam Bot" as flat bright-green / orange silhouettes with green name tags, and the spawned type is not in shot. The eye tells cannot be judged from these images. |
| 17 | Toast vs Algorithm ticker | FIXED | The `Middle-click or P to PING` tip toast (top right) was drawn under the ticker's right 130 px in `n2_tagged.jpg`. `docklayout.js` now pushes `.hud-toasts` below `.algo-sub` when they overlap horizontally (measured: ticker bottom 185, toast top 193). |
| 18 | Rare item beam "pillar through the wall" (lead's finding) | FIXED | Source is `inventory.js` `updateBeams`: a rare+ world item gets a 2.2 m additive tier column + ring. It is not piercing geometry (depth-tested); at 2-3 m it just fills a third of the frame and slants at the frame edge. Now 1.6 m, fades to black toward the top (vertex colours), thins to 30 % within 6 m of the camera. Not re-shot. |
| 19 | pageerrors | PASS | 0 in every run (only the proxy's nostr WebSockets, a 403 and `KHR_parallel_shader_compile`). |
| 20 | Landing hitch | PASS | hamsi instant landing 1.7-3.2 s, real landing 21 s of which the 9 s timer; no fall (y valid). |

## 2. Two-player scripted session (`qa_night2_mp.mjs`, LocalTransport, 1024x576)

| step | result | numbers |
|---|---|---|
| connect + landing on hamsi | PASS | both peers `phase moon` |
| client DOWN (999 dmg, host alive) | PASS | `hp 1`, not dead, host `isDowned(client)`; `n2_mp_downed_client` (bleeding bar 16 s, red vignette, low camera; not committed) |
| host aims at the body, "HOLD [E] TO REVIVE" | PASS | `interactTarget.action.__dn` found at pitch -0.4 |
| revive ring `.dn-mid` visible on the host | PASS, overlap fixed | `n2_mp_revive_host.jpg` (rect 86x90, "REVIVING Client"). **Bug:** the ring (top 58 %) sat on top of the prompt "HOLD [E] TO REVIVE / Client 13 s". Moved to 42 % (`downed.js`, not re-shot). |
| client up at ~30 % | PASS | 35 / 116 |
| solo carrier of `cy_vending` | PASS | `carryMul 0.55`, `carryTurn 0.6` |
| helper grip (hold E) | PASS | host `co` = [[item, client]], client `carryMul 0.92`, `n2_mp_carry_client.jpg` shows the carried machine on the host avatar. **Low bug:** the host's own `carryMul` reads **1.2** while gripped (faster than unencumbered), expected ~0.92. |
| let go of E | PASS | `co` empty, host back to 0.55 |
| client TAGGED by a drone (host `expose`) | PASS | host `fc.p` [26,1,1] |
| client HUD shows the TAGGED goal line | NOT VERIFIED | my probe read only the `◆` leaf; `n2_mp_tagged_client.jpg` shows "TAGGED: get to the ship (23 m) or kill the camera that tagged you" |
| reaching the ship clears the tag | NOT VERIFIED | after 2.7 s of sim the tag was still there with `live 1`: the host clears it only when `inShip && !(air > now)` (`feedcams.js` line ~315), i.e. after the on-air window ends. Needs a longer wait |
| takeoff to orbit | FAIL (harness) | `hostBeginTakeoff('lever')` left both peers in `moon`; not investigated (the cycle wrapper?) |
| host migration mid-landing | NOT VERIFIED | consequence of the previous row: the host left in phase `moon`, not `landing`. What was verified: `HOST LEFT` dialog offered (`n2_mp_mig_client.jpg`, 6 s countdown), `accept()`, client became host (epoch 1), map kept (terrain + facility + 12 creatures), player valid at (0, 0, 0), no pageerror |

The script did NOT pass twice in a row (I never got the takeoff row to pass), so backlog item 6's check is open.

## 3. Bug list

| sev | bug | status |
|---|---|---|
| high (unconfirmed) | Barge and Roof expedition landings drive the software-GL tab to ~7 GB (OOM-kill) even with throttled renders; the barge / dune frames are a flat pale green (the scene is not drawn, HUD legible on top). Could be swiftshader, could be a real out-of-memory / lost-context on the expedition maps (420 m water sheet, canvas billboards, merged Kit meshes). | OPEN: look at `renderer.info` + `webglcontextlost` on a real GPU; start with `world/expeditions_maps.js` (water plane, billboard canvas) |
| med | Stream overlay had the whole HUD, the ticker and a world prompt under it | FIXED (CSS) |
| med | ALL ROUTES printed the sector-map readout twice | FIXED (`mapmods.js` re-entrancy) |
| med | Day summary rows counted to negative values at low fps (`-3,422`) | FIXED (`ui.js`, `rewardviz.js`, `soul.js`) |
| med | TAGGED line inside a facility gave a meaningless distance | FIXED (`onegoal.js` + node test) |
| med | Revive ring on top of the "HOLD [E] TO REVIVE" prompt | FIXED (`downed.js`, not re-shot) |
| med | Tip toast overlapped the Algorithm ticker | FIXED (`docklayout.js`) |
| med | Tab card: label + value glued, left goal text bleeding through | FIXED (`hudcalm.js`) |
| med | Rare item beam: a 2.2 m light column that fills the view up close | FIXED (`inventory.js`, not re-shot) |
| low | "Watch highlight [L]" pill sat on the SHIP LOOT card + hotbar (bottom right) | FIXED (moved to `top:42%`, not re-shot) |
| low | Host `carryMul` 1.2 while a helper grips (should be ~0.92) | OPEN (`carry2.js` / `carry2_core.js CO`) |
| low | Tarp: black lid of the arcade / chess fixture sticks out | OPEN (`hubgate.js coverTick` only hides roots within 0.06 m) |
| low | Metro platform near black at default brightness; influencer corridor reads as flat olive, no decor | OPEN (art / lights) |
| low | Bulky viewmodel (vending machine) covers about half the screen and the crosshair | OPEN |
| low | Held-item slot duplicated when a script calls `hostSpawn(..., {holder})` and then fills a slot (both slots show the item, `carrying ▮600`) | harness artifact |
| low | Default `uGamma` is 1.08, not 1.0 | note |
| harness | Software-GL OOM from synchronous render bursts; crash used to hold the browser lock | FIXED in `qa_night2_lib.js` / `headless_shots.mjs` |

## 4. Top 5 feel problems as a player

1. **The first thing you see is a good stream overlay, then a ship full of locked-door prompts.** The tarp prompt "UNLOCKS AT QUOTA 2" is the crosshair target in the first frame after the stream. Say less until the lever.
2. **Interiors are still a torch game.** The factory reads in dim light; the metro platform and the influencer mansion do not, and the mansion's corner shot looks like an empty olive box: the theme (chandeliers, velvet, gold) is not what the eye lands on.
3. **The cone reads as a pyramid.** The drone light is a solid peach triangle on the hill; the lesson "red light = live" works only after the hint line, and the direct-line-vs-flank timing is invisible until you are inside the disc.
4. **Carrying a bulky item blinds you.** The vending machine is half the screen, the strap to the helper cannot be seen, and the helper's "Help carry" prompt competes with "Rock-paper-scissors with Host" on the same avatar.
5. **Feedback that arrives half a second late or on top of something else:** the revive ring on its own prompt, a tip toast under the ticker, the report over the quota banner, the highlight pill over the loot card. Small each; together they read unfinished.

## 5. Score: 5.5 / 10 (was 5.0 on paper, 4.5 on screen)

The opening (stream, route board, one goal line, drone with a named lesson, revive / downed / co-carry / migration all working across two real tabs, a highlight CRT and an income report that look like the product) is the first time the game shows its own identity on screen; what holds it back is that three of the six moons I was asked to look at (barge, roof, and the readable-dim of metro / mansion) still cannot be shown to a stranger and the expedition maps may not run at all on weak GPUs.

## 6. Not verified / next

- Expedition maps: look at them on a real GPU first (bug 1), then the need bars in play.
- Two-player: takeoff to orbit in the harness, tag clear after the on-air window, host migration in phase `landing`, the strap line (not visible).
- Fixes that were not re-shot: stream HUD hide, MOONS ALL duplicate, beam, revive ring position, highlight pill, TAGGED indoors.
- Eye tells: spawn a creature in view (freeze at the correct yaw) and shoot it with no torch; the current frames do not show the spawned type.
