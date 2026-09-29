# Wave 8 - FACJOBS: facility jobs + labyrinth layout archetypes

Modules: `src/game/facjobs.js` (+ `facjobs_core.js` pure rules, `facjobs_i18n.js` EN/TR/RU), `src/world/facility_arch.js` (layout archetypes).
Slot: `this.useModule('facjobs', installFacjobs)`. Net prefix `fj`. Owner ask: more different labyrinths, mechanics, tasks and goals ("do something, earn something").

## 1. Plan: what exists today and why the interior loop is "grab scrap"
- `objectives.compute()` (src/game/objectives.js): the tracker only says land, find the entrance, "bring scrap to the ship: X / Y today", deep-haul / vault hints, carry a body home, sell at the HQ. Every hint is a variant of scrap.
- Patron / faction contracts (`contracts.js`, `story.js`): salvage, retrieval, sabotage, investigation, cleanup, extraction. They are per-run, tracked by counters (kills, logs read, scans), not a place you go and something you do inside the labyrinth.
- Voyage missions (`voyage.js`: survey, defend, heist, ...) and outpost zones (`zones*.js`) are outdoor / route level.
- Result: every facility is the same puzzle (find scrap spots, get out) on the same layout family, so the only variables are creature pressure and loot count.

## 2. What this adds
Each landing on a regular facility moon (`jobMoon`: not company / home / customMap, no cycle `layoutOpts`) rolls ONE main job + 0-1 side job and ONE layout archetype. The roll is a pure function of `(runId, day, moonId)` (`rollJobs`), so it is shown before landing (terminal `JOBS`, orbit objectives line, landing-card rows JOB / SIDE / LAYOUT) and every peer builds the same layout without a message. State lives in `run.fj` (host-authoritative, auto-synced by `broadcastRun`).

| job | what the crew does | preferred layout | full reward (quota 0) |
|---|---|---|---|
| power | find 3 fuses, slot them in the breaker panel. Grid back: +4 scrap around the panel, but a creature wave wakes | atrium | 130 cr, 10 Clout, iron crate |
| core | carry the 38 lb two-hand Server Core to the ship (it also sells) | ring | 170 / 14 / gold |
| feed | camera-room panel: stay within 9 m for 20 s (1.5x faster with 2+ players) | atrium | 120 / 12 / iron |
| drone | Company drone follows the facility path only while a crew member is within 10 m; creatures within 3 m hurt it (100 hp) | ring | 150 / 12 / gold |
| vault | 3 clue notes lie around the maze (one digit each), type the 3-digit code at the vault panel (keyboard overlay) | catacomb | 140 / 11 / gold |
| rescue | carry a stranded contractor (2-hand item) to the ship | catacomb | 110 / 10 / iron |
| sample | 5 glowing samples to the ship (3 as a side job), partial pay per sample | catacomb | 100 / 8 / iron |
| photo | Instant Camera photo of a pedestal anomaly (a camera is left by the door); the camera check is a frustum/distance test | any | 90 / 8 / wood |

Side jobs (vault, rescue, sample, photo) pay 55 % and their crate is one tier lower for gold. Credits scale +15 % per quota index.
Payout: full completion pays at once + spawns a loot crate (`fallbackChestLoot` / `game.crafting.rollChestLoot`) at the job site. Partial work (>= 25 %) pays 70 % of its share at takeoff, no crate. A MAIN job with zero progress at takeoff costs 25 credits (never below 0). Clout + XP are added by each client on the `fjfx` message.

Layout archetypes (`facility_arch.js`, `layoutOpts.arch`, plain-room themes only, mineshaft / wing / open themes ignore it):
- **atrium**: 7x7 hub room on the entrance axis, four spokes each ending in a big room, rooms comb onto the spokes (reuses the 'wings' plan; solvability comes from the existing comb + repair passes).
- **ring**: rectangular ring corridor + two cross chords (shortcuts); rooms inside and outside hang off it.
- **catacomb**: loops 0.04, 6x dead-end closets (stubs up to 6 cells), three plain DFS maze rooms. Measured +84 % dead ends vs classic.
Hooks in `world/facility.js` (small): `planArch` after the entrance room, `O.loops`, `O.deadMul`, `O` is copied so `opts.arch` can be reset. Geometry / lights / merging are untouched (rooms + corridors as before); no runtime light-count change; job props are 3 unlit meshes per job (MeshBasic / Lambert) added to `fac.group`.
`game.js`: only the two placeholders and `moon.layoutOpts || this.facjobs?.layoutOpts?.(moon, run)` in `loadMap`.

## Net
`fjreq` client -> host `{op:'fuse'|'feed'|'code'|'photo'}` (host checks range, holder, job state); `fjfx` host -> all (`pay`, `msg`, `bad`); `fjd` host -> all (drone position, ~3 Hz). `fjfx`/`fjd` are in `HOST_ONLY`. Terminal command: `JOBS`.

## How to test
- `node tools/harness/facjobs.test.mjs [seeds]` (archetype solvability over all themes x sizes, determinism, catacomb dead ends, roll / payout / vault code / drone path, i18n coverage TR+RU). `node tools/harness/stealth_maze.test.mjs 8` still passes; `npm run build` passes.
- In game (not run, see below): in orbit type `jobs`; pull the lever, the landing card shows JOB / LAYOUT rows; inside, the objectives list shows the job line. Debug: `kefal.game.facjobs.roll()`, `kefal.game.run.fj`.

## Knobs (`facjobs_core.js`)
`JOBS[*].cr/cl/tier/n`, `SIDE_MUL`, `PARTIAL_MIN`, `FAIL_FEE`, `FEED_SECONDS`, `DRONE_SPEED/FOLLOW/HP`, `ARCH_CHANCE` (0.85), side-job chance 0.55 in `rollJobs`; archetype numbers in `archOpts`.

## Unverified / known gaps
- NOT run in a browser (the shared browser lock was jammed; the lead asked for node + build only). Panels / notes / drone meshes, the vault keyboard overlay, the landing-card row injection, camera photo frustum feel, crate burst physics are untested visually. Job logic was smoke-tested in node with a mocked game (setup for all 8 jobs, fuse / code requests, a full drone escort, payout).
- Vertical multi-floor / shaft archetype not done (the generator is single-floor); the ring's "shortcuts that open" are always-open chords (the existing stealth locked shortcut still exists separately).
- The drone hovers through doors (ignores closed doors); creature threat = any non-boss creature within 3 m.
- Power job has no real lighting change (constant light count rule): "lights on" is expressed as extra loot + a wave. Feed job "blindness" is flavour + payout only.
- Vault clue notes are readable by anyone (code is in `run.fj`, cheating not a concern for co-op); clue memory is per client and reset per day.
- Job spots reuse `scrapSpots` / `bigSpots`; on a facility with very few big rooms they fall back to floor spots.
