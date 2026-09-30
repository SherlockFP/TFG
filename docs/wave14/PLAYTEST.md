# Wave 14 browser gauntlet

Actual Chromium, software WebGL, 960×540, one host and one local peer, serial browser lock. RAF throttled to 120–140 ms to keep the shared test machine usable. This is functional and visual evidence, not hardware FPS, a human audio review or internet multiplayer certification.

## Natural startup

Actual keyboard walking with coordinate feedback, actual mouse movement, E interaction and fleet-panel button purchase. No teleport or direct fleet requests in this flow. Fresh spawn → fleet broker → free Packet Courier → north-facing boarding console → selected ship passed. Final console approach: position [3.898,-1.231,11.006], yaw 0.660, target “Board selected vessel”; after E, fleet.docked=false and ship spawn [-3,.020,.150]. This is guided travel, not a claim that a new player discovered the route without guidance.

Artifacts: `/tmp/tfg-qa14/natural-final-results.json`, `01-hub-entry.png`, `02-fleet-office.png`, `03-boarding-screen-new.png`.

## Feature fixtures

Separate tests use labelled teleports, run-seed fixtures, funding and shift eligibility (world may already have generated from the random landing seed; no deterministic facility replay claim). These do not establish natural mission traversal or combat balance.

* Shared casino: actual cashier Buy25 and Spin5 buttons. Both peers received identical recent deal seq1, name, kind loss, paid0 and reels [0,5,3]. World deal board rendered, not only private panel results.
* Threat readability: synthetic chaseLevel=.8. Reward toast deferred, urgent “Threat approaching” displayed alone, level banner absent. Current shot has unlocked “Click to resume” text; it is not a clean natural chase capture. Tutorial remains substantial top-left. After restoring chase, pending reward appeared.
* Airhorn: normal spawn/pickup selected slot1; real RAF plus explicit rendered frame shows red airhorn and glove at lower-right, active Airhorn hotbar card. Earlier Wave13 stale/inconclusive screenshots remain excluded from visual assurance. This confirms presence, not a comprehensive clipping/pose-quality review.
* Archive fixture: seed4 Hamsi quota2. Physical cell accepted, normal pickup gave actual holder=self; install spawned exact shared guardian c11 and stage guard on both peers. Debug damage99999 killed only that boss; actual cache request moved state claimed with one reward ID. Combat skill, damage balance and natural cell retrieval are unverified.

Artifacts: `/tmp/tfg-qa14/features-rerun-results.json`, `missions-rerun-results.json`, `05-casino-shared.png`, `06-chase-hud.png`, `07-airhorn-real-frame.png`, `09-archive-guard.png`.

## Defects and reruns

1. Fresh hub outdoor-chest handler called missing terrain.distToPath on synthetic dock terrain. Reported; root added explicit dock exclusion and actual-module regression. Initial browser warning is retained in baseline log; final fresh natural startup rerun contained no outdoor-chest warning.
2. Workshop cached interaction positions while company group was hidden at y=-260: bay [18.88,-259.75,12.67] despite broker anchor [20,-.15,12.6]. Physical calibration was unreachable. Fixed live world-position getters; fresh browser now bay [18.88,.25,12.67], matching visible machine, and “Hold E: calibrate batch” ray target returned. Final actual E hold with paced simulation ticks passed after settling physics and aiming from the actual eye: tuned=true, target changed to Collect finished parcel, second E cleared jobs and goods.cells=1 on both peers. No duplicate parcel. Timed simulation fixture is distinguished from natural wall-clock human interaction.
3. Escape run-seed fixture Hamsi1235 quota2 produced zero shelters despite later live nav/floor probes passing. Creature agent deferred construction until physics queries are ready. Fresh browser then built three actual alcoves. Actual crosshair “Enter screening alcove” + E entered; W held with ten paced ticks retained position [28,-299.980,-23], actual mouse100 moved yaw0→-.22. Leave cleared hidden state. Warden optional spawn and subsequent search observed; natural chase→break-LOS balance remains unverified.
5. Fresh startup also exposed ShipScreens.drawRadar unconditional outdoor.mainExit.pos on the dock. Root guarded absent exit. Final fresh natural startup rerun had zero pageErrors/runtimeErrors; only unsupported software-browser KHR_parallel_shader_compile warning. Company route extension initially used incorrect ship doorway x0; actual door.x2.6 corrected. Guided keyboard departure and left painted lane to the sale hatch passed, no teleport during traversal, camera turned with actual mouse. Route/landing setup is debug-assisted, separately from physical navigation. Fresh browser page/runtime errors zero.
6. Natural arrival screenshot reveals tutorial2 directs “terminal STORE FLASHLIGHT (15), then press F” despite new NPC-only purchasing gate. Controls updated physical broker/live price/current key copy. Final browser fixture credited movement events explicitly (not natural tutorial achievement), confirmed tutorial2 “Field broker [E] → TOOLS: flashlight ▮15; collect it, then [F]”. Synthetic danger hides tutorial2 and reward; urgent warning remains. Pre-existing touchdown card in this company fixture remained visible, so this does not prove all center cards vanish during natural danger.
4. Harness corrections: seed set before hostLever was overwritten; deterministic seed now assigned after lever. Positive pitch looked upward, corrected negative/downward and then precise aim from actual settled eye. These are test setup errors, separate from confirmed workshop Y bug.

## Runtime and rendering limits

Feature rerun had zero page errors and zero non-network console errors. External relay TLS/proxy errors remain separate. Software WebGL feedback-loop warnings occurred on peer; bounded draw diagnostic (two frames, 208 draws in final hub/orbit) captured no INVALID_OPERATION, so responsible object/material remains unconfirmed. Do not treat this narrow absence as a global fix or GPU performance claim.

Preserved before shots: `before-company.png`, `before-echo.png`, `before-host-menu.png`. Current company fixture angle is not matched to before and has debug HUD clutter, so it cannot substantiate a numerical before/after art score.

Final supplementary evidence: `/tmp/tfg-qa14/workshop-final-results.json`, `escape-physical-results.json`, `natural-company-results.json`. Escape entered through actual E/crosshair; hidden-W and real mouse peek recorded in `escape-physical.log`.

Company physical route proof: `/tmp/tfg-qa14/company-walk-final-results.json`, `09-company-natural-approach.png`, `10-company-sale-natural.png`. Actual sequence ship door x2.6 → outside z8.45 → left lane x-9.66 → hall z-33.57 → counter x.68.

Finite pursuit follow-up: initial unseen search retirement produced one physical85 recording and actual E claim, shared ID i3gh and repeat claim refusal. Root identified a reward exploit: this encounter had never established sight of the player. Agent added actual sight plus continuous unseen search requirement. Final fixture uses nav-safe player teleport4m from actual Warden, actual AI canSee=true and hadSight=true without forcing AI state/LOS/finish; actual E hide, subsequent AI escape, actual E claim one recording i4vp85, repeat refused, same ID/value/stage peer. No natural run/chase balance claim.

Final mirror diagnosis: explicitly framed mirror at ship[-3.2,.02,1.5], yawπ; screenshot11 shows reflection. Fresh bounded two-frame checks inspected every draw:710 orbit and1285 moon, no INVALID_OPERATION and no GL warning. Earlier escape run retained19 host+7 peer feedback-loop warnings. Intermittent responsible material remains unconfirmed; no speculative fix. Diagnostic scripts `/workspace/.tfg-tools/qa14-mirror.cjs` and `qa14-mirror-moon.cjs`.

Final polish fresh browser: `/tmp/tfg-qa14/polish-final-results.json`, `12-tutorial-fixed.png`, `13-chase-fixed.png`, zero page/runtime errors. Actual movement tutorial completion was fixture credited for this copy test. Final legitimate pursuit evidence: `escape-legit-results.json`, c.data.hadSight=true from actual canSee, shared single recording i4vp85.
