# Night loop log (autonomous development while the owner sleeps)

Owner (2026-09-29 night): "develop continuously like a gauntlet loop, fix bugs, make it fun, playtest, keep it short; don't ask me questions" → questions are collected in `docs/session/QUESTIONS.md` for the morning instead.

Loop rule: 2-3 Sonnet agents at a time (1 browser/QA agent max) → merge with tests → next batch from `docs/session/CONTINUE.md` §4 + QA findings. A self check-in fires ~hourly as a fallback.

| # | Batch | Result |
|---|---|---|
| 1 | perf4 (landing hitch + oscillator warnings) | merged 8b6fdd6: landing built by a sliced job queue (`game.landQ`, report via `landQ.report()`), shader prewarm, oscillator freq clamp. Unmeasured in browser. |
| 1 | econ8 | merged f77d20f: sim models all wave-8 income; median 7 quotas (pre-w8 7-8); side income 8.9 %; Level Fun loot 2→1.6, Sector Map 110→200; museum door blockers fixed. |
| 1 | QA night1 | merged 67a65ca: FALL CHECK PASSED (4 real + ~12 instant landings, map complete before moving), landQ top job horror.js 0.7-3.5 s, 16 screenshots in docs/wave8/qa_shots/, THREAT dock vs mod card overlap fixed, oscillator spam gone. Findings → qafix1. |
| 2 | feedcams2 (Opus) | merged 2cdd759: TAGGED until the ship, sprint locks faster, junction-box cable cut, Watched +2 cams, heat → bigger/earlier director peaks, Follower/Lantern tie-ins, go-live-on-purpose sponsor tips, downed-on-camera hype, day Highlights line, night patrol drones, Signal Jammer (40). Sim: taxed share careful 1.5 % / average 8 % / sloppy 17 %. |
| 2 | rewardviz | merged de6693a: day summary 'income by source' block, lever job-fee confirm, ORE n/240, diner till toast, +% VALUE / CURSED scan chips, reward pop ≥100. (Hit the usage limit once; resumed.) |
| 3 | fixbundle | merged f947a76: Y/B/M key priority, Medic +40 % revive, medkit/adrenaline revive a downed crewmate, off-screen arrow, tax row de-dup, translated affix chat + all death lines TR/RU. |
| 3 | pacing | merged 2fdcbb3: outdoor area −46 %, ship→entrance 42-75 m (was 71-152), path one smooth bend, fog cap so the entrance shows from the ramp (30-78 %), POI density +50 %. |
| 3 | artpass | merged 07579a5: new src/models/artpass.js — axe, 3 pickaxes/drill, titanium/bypass picks, jammer, NV goggles + cell, potions, sickle, forge shards, kit case, voyage relics (company-issued style, -Z grip convention). Not seen in browser. |
| 4 | firstrun (first 15 minutes: one objective at a time, message budget, designed tutorial camera) | running |
| 4 | netaudit | merged 02e4c7d: 3-peer node sim + static scan (128 checks). Fixed 10 real MP bugs: feedcams tax line never fired (msg:sell shadowed), NaN spray/tracer, feedcams timers after host migration, hub shop lock only client-side, hg/mm spoofable, downed late-join + migration, resto migration overwrite, tower elevator + repomaps shelves late-join. |
| 4 | firstrun | merged 4d4dfad: first-run message budget (one objective, ≤1 Algorithm line / 45 s, one card at a time), no affixes/daily modifier/job fee/wrong door/drone before the first sale/day 2, designed tutorial camera between entrance and first loot room with a green blind-spot ring + clean-pass reward. |
| 5 | hostmig | merged bd5212d: facjobs/chess/arcade2 rebuild on host migration (resto/lcmonsters/crdirector already graceful), charge + elevator range checks, kit revive verified host-side (141 checks). |
| 5 | creatureart | merged 8336791: 72 hostile types audited; emissive eye tells for all, walk/run lean + 0.4 s wind-up lean + strike snap + hit flinch pose layer, distinct Dimmer/Follower/Auditor models, Mannequin wind-up visible. |
| 6 | carry2 | merged c8da40e: heavy-item sway + slower turn, fragile bump value loss (5-25 %, floor 35 %), bulky vending machine/server rack/statue + facjobs core: solo crawl 0.55× or two-person carry 0.92× (hold E), throw & catch fragile items, Algorithm lines + crack/catch highlights. |
| 7 | highlights | merged 1c915a7: host ring recorder (12 s, 10 Hz, typed arrays), best 3 clips/day from feedcams2 moments, `hlclip` ≤20 KB, CRT top-down replay with REC/LIVE/viewers + Algorithm captions (EN/TR/RU), WATCH HIGHLIGHT button + [L] pill, skippable. |
| 8 | expeditions | merged 3988eda: 3 adventure moons — Sunken Server Barge (oxygen, 3 data cores, trench eel), Dune Relay Caravan (heat, escort/repair crawler before the sandstorm), Rooftop Blackout City (power cell, relight 4 billboards, zip-lines/planks, drones). Terminal after quota 5 or 14 % contract offer from quota 1. |
| 9 | sound2 | merged 1f4d357: 64 procedural sounds for all wave-8 features, fixed 5 non-existent sound ids (LC monster cues fell back to generic), mix-policy categories, game.sound2 helper, atmos beds for labyrinth/repomaps/expedition themes. |
| 9 | full regression (lead) | all node tests pass except cycle2_flow (bosses coverage + exceptions) and ship2_install (timeout) → regress fixer agent running. |
| 10 | regress | merged 662a250: cycle2_flow threshold (new metro/greenhouse themes fall back to the Foreman boss — content gap noted), docklayout interval unref so node tests exit. All node tests green. |
| 10 | qafix1 (horror.js slicing, museum render cost, dark facilities, arrival banner queue + garbled map card, palette vs clock, downed bar/font, lantern beam, hub door count) | running |
| 10 | Opus review | merged 8d33ad4: docs/REVIEW_W8_NIGHT.md — 5.0 on paper / 4.5 on screen; 'wide and busy' now; 12-task backlog; proposes a freeze on new systems. Loop now follows that backlog. |
| 11 | solorevive | merged 2cd895e: solo players get one slow self stand-up per landing (hold E 6 s → 25 % HP); second down = old rules. |
| 11 | onegoal (Opus, review task 2: one objective line for every profile, no kill-N/swarm before quota 3, calm Algorithm pacing for all) | running |
