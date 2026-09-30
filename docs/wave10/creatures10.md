# Wave 10 - CREATURES10 (module `creatures10`, src/game/creatures10*.js, src/models/creatures10_models.js)

Owner complaint: "soulless, AI-made, low budget". Three new internet-horror creatures, each with ONE rule the player can learn, a silhouette that reads in the dark, a sound that says what it is doing, and a telegraph of at least 0.8 s before any damage. No new net messages (everything rides the generic creature channels: `cev sp/snd/hp/die` + the `cs` snapshot rows, where `extra` carries the ring fill / dwell meter / twin mode).

Files: `creatures10.js` (installer, debug), `creatures10_core.js` (TUNE + pure rules, node-testable), `creatures10_ai.js` (DEFS, host AI, registration, spawn gate), `creatures10_sfx.js` (11 procedural sounds), `creatures10_text.js` (TR + RU rows), `models/creatures10_models.js`. Test: `node tools/harness/creatures10.test.mjs` (12 checks).

## The three
| creature (id) | rule (first lore sentence = the first-encounter caption) | states / telegraph | counterplay |
|---|---|---|---|
| **Buffering** `c10_buffering` (max 1, 210 HP, 40 dmg, walk 1.6 / run 4.6) | It only moves while its loading ring spins; every 4-6.5 s it freezes to buffer for 2.6 s. | `walk`/`spin` (ring turns, ticks) -> `buffer` (ring stuck + amber, whir drops, silent: 1.8 s) -> `resume` (0.8 s, whir climbs back = "run") -> `spin`. The ring stutters above 85 % fill (lag before the buffer) and a progress bar under the head fills toward it. Touch: `windup` 0.9 s (ring races red, arms up, buzzer), then the hit. | Pass it in the buffer window (run PAST it). It whiffs if you step out during the wind-up. It never buffers mid wind-up. Killable. |
| **The Doomscroller** `c10_doomscroller` (max 1, 90 HP, 34 dmg) | A chain of glowing phones crawls on the ceiling and drops on anyone who stands still under it. | `roam` (hunts the STILLEST crewmate within 34 m) -> `scroll` (you stand under it, < 2.6 m, moving < 0.7 m/s: the dwell meter fills in 3.6 s; scroll-tick gaps shrink from 0.6 s to 0.1 s with rising pitch and volume, screens scroll faster and warm up) -> `windup` 1.0 s (notification ping, screens flash red, it hovers over the LOCKED spot) -> `drop` (~0.6 s of gravity) -> hits whoever is still within 1.8 m of the lock -> `sprawl` 2.8 s (on the floor, screens glitching: smash it) -> `climb` 2.2 s. | Keep walking (moving drains the meter 3x faster than standing fills it). Step out after the ping and it lands on nothing. |
| **The Ratio** `c10_ratio` (pair, max 4 alive, 140 HP each, 32 dmg, walk 1.2 / run 4.4) | A twin only moves while nobody looks at it, and it RUSHES while you stare at the other one. | The first body spawns its mirrored twin 3.5-9 m away (seed ^ 1 = mirror image, negative model scale). `freeze` (watched, 0.2 s grace) / `creep` (nobody watches either: 1.2 m/s) / `rush` (the OTHER twin is watched: 4.4 m/s, below sprint) / `windup` 0.9 s (counts only while unwatched; looking cancels it) / `attack`; `statue` when nobody is within 45 m. Chest panel + eye slit: cold white = frozen, amber = creeping, red pulse = rushing, white strobe = wind-up. | Two players: one watches each. Alone: back off until both fit on screen (both watched = both frozen). An orphan (twin dead or never spawned) only creeps. |

## Data-driven integration
- `registerCreature` (through `registerC10Content()`), `EXTRA_SPAWNS[id]` = `{zone:'in', w:[0,..]}` (tier 1 = 0: never on the first two moons; weights in `creatures10_core.js` `TUNE.spawn`). `noSpawn` is a getter on the def: the generic spawners only roll them from quota index 1 (Ratio 2, `TUNE.minQuota`); with no run they are blocked. The twin is spawned by the module and ignores the gate.
- Threat pool: three rows appended to `threatpool.js` HEADLINE (`minQ` 1 / 1 / 2, zone in), so they show up as KNOWN RESIDENTS and are rare outside a moon's pool like the other headline creatures.
- crdirector: they count as threat (power 2 / 1.5 / 1.25 per body, dmg > 0). Their states are hunting except `walk` (Buffering patrol), `roam` (Doomscroller) and `statue` (Ratio), which the director treats as calm / asleep.
- `NO_TELL` (creature_read: they carry their own emissive tell), `NO_POSE` for the Doomscroller (the chain owns its transform), IDENT rows, `CREATURE_FLAVOUR`, `FIELD_NOTES` (bestiary), `STATE_SOUNDS`, `LOOPS`, death texts ("was stuck at 99% by Buffering." ...). The names avoid the siege enemies (`Doomscroller`, `Buffering Blob`): ours is `The Doomscroller`.
- Sounds are recipes registered in `mods.soundGens` and rendered into `audio.buffers` by a poll (`ensureC10Sounds`) as soon as an AudioContext exists: `c10_buf_spin|down|up|wind`, `c10_scroll_tick|crawl|drop`, `c10_notif`, `c10_ratio_creak|clack|wind`. STATE_SOUNDS fall back to existing ids (`light_flicker`, `lurker_snap`, `glass_break` ...) until they exist.

## Shared files touched (one-liners)
`src/game/game.js` (the two placeholders), `src/game/threatpool.js` (one HEADLINE line). Everything else is mutated at runtime from the module (EXTRA_SPAWNS, STATE_SOUNDS, LOOPS, IDENT, FIELD_NOTES, NO_TELL / NO_POSE, CREATURE_FLAVOUR).

## Knobs
`TUNE` in `creatures10_core.js` (buffer clock / window / windup, dwell fill / drain / windup / fall, watch distance / cone / grace, min quota, spawn weights); HP / dmg / speeds in `creatures10_ai.js` DEFS.

## How to see it (host, in a facility)
`kefal.game.creatures10.debugSpawn('buffering' | 'doom' | 'ratio')` puts one 8 m ahead (the Ratio makes its twin). `kefal.game.creatures10.state()` lists the live ones. The generic spawner needs quota index >= 1 (Ratio 2) on a tier >= 2 moon.

## Not verified (no browser run)
- Nothing has been seen in the game: the three models (proportions, ring / screen glow, the mirrored twin, the chain trail through corridors and the drop, the floor pose), the feed canvas texture colour space, the sounds (pitch / level) and the real-time feel (Buffering speed vs. chase_tuning fatigue, twin spawn spots on the nav grid) are unverified.
- `M.isLookedAt` uses a 0.8 dot cone and a line-of-sight ray at 60 % of the body height; a remote player's look direction lags by a snapshot, hence the 0.2 s grace.
- Doomscroller ceiling height comes from `layout.heightOf` (capped at 4.6 m); rooms with other geometry (labyrinth mazes, low liminal rooms) use the same table. A dead Doomscroller stays at ceiling height.
- The staged first sighting (firstsight.js) can pick them: the Doomscroller then lies on the floor (any non-hunting state does); the Ratio shows a single frozen mannequin.
