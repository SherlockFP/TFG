# Wave38 — explore, restore power, return and refuel

Start: main 7d4b910, Windows bundled Node24.19. Existing CRLF-only tracked noise and historical untracked artifacts are preserved. Owner baseline remains 1/10.

Owner requests: repair dock departure; retire Zap Gun; physical replaceable ship core; powered fuse repairs; exploration credits and rare salvage; seeded wide/maze depth variety; oxygen/refill supplies; manual ship departure with visible crew countdown; useful starter radio; better lift, broker, witch, hand grips, stair camera and calmer music outside mazes. Mild cyberpunk influence uses original industrial CRT silhouettes and restrained accents.

Bounded design: reuse native fleet dispatch, facility/depth generation, items/custody, credits, power and voice. New run features retain save-compatible state; old saves receive safe bootstrap where required. Reactor exchange consumes the held native core once, returns the spent core to native world custody and uses one flight charge. HQ return remains available. Oxygen applies to occupied normal indoor facilities, refills outside/ship and through physically reached finite supplies. Never create autonomous departure due to low oxygen.

Ownership: root fleet13/dock37, ship core/oxygen/radio, music/grips/stairs and integration/Git; power38 host fuse/power/departure; exploration38 depth survey/population/loot; art38 world lift, field broker, witch. Shared files use named sections. Only root stages/pushes.

Acceptance: dock cockpit native interaction dispatches then normal landing works; host/live/current-map/range/LOS guards reject forged requests. Power visibly restores; surveys pay once and cannot farm revisits; installed fuel cannot duplicate; oxygen supplies cannot refill through walls or repeatedly; manual departure remains visible before flight and interrupted host migration permits a new command. Native tests and guided visual checks have separate evidence. Human enjoyment and Internet voice reliability remain unmeasured.

See [PLAYTEST](PLAYTEST.md), [REVIEW](REVIEW.md) and the module reports for current evidence and bounded omissions. Prior shutdown is completed; no new shutdown is part of this round.

Final source-frozen Windows verification: **290/290 native tests passed in152s (-j4)**; production Vite build **2.38s**, exit0; staged diff whitespace check passed. Vite retains existing dynamic-import and future native-config-loader warnings. Guided silent actual E dock dispatch, normal landing and engine-room core removal/install passed with labelled initial poses/loadout. Final radio join and countdown host migration fixes are covered by real Session regressions. All peers reload for protocol **0.13.0**. Inspect Git/remote for final publication SHA; deployment completion is not inferred from a push.
