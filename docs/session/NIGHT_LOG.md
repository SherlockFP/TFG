# Night loop log (autonomous development while the owner sleeps)

Owner (2026-09-29 night): "develop continuously like a gauntlet loop, fix bugs, make it fun, playtest, keep it short; don't ask me questions" → questions are collected in `docs/session/QUESTIONS.md` for the morning instead.

Loop rule: 2-3 Sonnet agents at a time (1 browser/QA agent max) → merge with tests → next batch from `docs/session/CONTINUE.md` §4 + QA findings. A self check-in fires ~hourly as a fallback.

| # | Batch | Result |
|---|---|---|
| 1 | perf4 (landing hitch + oscillator warnings) | merged 8b6fdd6: landing built by a sliced job queue (`game.landQ`, report via `landQ.report()`), shader prewarm, oscillator freq clamp. Unmeasured in browser. |
| 1 | econ8 | merged f77d20f: sim models all wave-8 income; median 7 quotas (pre-w8 7-8); side income 8.9 %; Level Fun loot 2→1.6, Sector Map 110→200; museum door blockers fixed. |
| 1 | QA night1 | running |
| 2 | feedcams2 (Opus) | merged 2cdd759: TAGGED until the ship, sprint locks faster, junction-box cable cut, Watched +2 cams, heat → bigger/earlier director peaks, Follower/Lantern tie-ins, go-live-on-purpose sponsor tips, downed-on-camera hype, day Highlights line, night patrol drones, Signal Jammer (40). Sim: taxed share careful 1.5 % / average 8 % / sloppy 17 %. |
| 2 | rewardviz | merged de6693a: day summary 'income by source' block, lever job-fee confirm, ORE n/240, diner till toast, +% VALUE / CURSED scan chips, reward pop ≥100. (Hit the usage limit once; resumed.) |
| 3 | fixbundle | merged f947a76: Y/B/M key priority, Medic +40 % revive, medkit/adrenaline revive a downed crewmate, off-screen arrow, tax row de-dup, translated affix chat + all death lines TR/RU. |
| 3 | pacing (ship→entrance 40-60 m, smaller empty outdoors, landmark visible from the ramp) | running |
| 3 | artpass | merged 07579a5: new src/models/artpass.js — axe, 3 pickaxes/drill, titanium/bypass picks, jammer, NV goggles + cell, potions, sickle, forge shards, kit case, voyage relics (company-issued style, -Z grip convention). Not seen in browser. |
| 4 | firstrun (first 15 minutes: one objective at a time, message budget, designed tutorial camera) | running |
