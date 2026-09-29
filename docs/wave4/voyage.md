# Wave 4 - VOYAGE (module `voyage`; node-tested + builds, NOT run in a browser)

Macro adventure layer: random moons, uncharted signals, warp events, 9 mission types, 7 set pieces, 8 new biomes. Installed via `this.useModule('voyage', installVoyage)`; host option `config.voyage = false` disables it.

## What
- **Voyage moons**: id `vy<tier><content>_<seed36>` is a pure function, so every peer rebuilds the moon from `run.moon` (`generateVoyageMoon`, reuses `moongen.generateMoon` through `generateMoonFromKey`). Names like `KX-41 Verdant Hollow`. Registered into `MOONS` (never `MOON_ORDER`) by a wrapper on `game.applyRunState`. After the day the route returns to the last charted moon.
- **Biomes** (`world/voyage_biomes_data.js`, `voyage_decor.js`): Crystal Desert, Fungal Swamp, Sky Shards (gravity x0.5), Acid Sea Shore (wading burns), Storm Plateau, Bone Field, Neon Ruins, Rust City. Voyages also roll the 15 older biomes. Day length x0.9-1.16.
- **Terminal**: `MOON RANDOM` (fee 20-60, always paid), `SIGNALS` / `SIGNALS <n>` / `ROUTE S1..S3` (3 signals, rotate with the in-run day, also appended to `MOONS`), `MISSIONS`, `TAKE <n>`, `DROPJOB`, `WARP ON|OFF|EARLY`, `VOYAGE`.
- **Warp** (lever wrapper): 12 % (20 % after 6 quiet days), never in quota 1-2 unless `WARP EARLY`, never from HQ / homeworld / instances / a voyage / deadline day / within 2 days of the last one / while a job is routed. 40 % navigation glitch (forced, 4 s), 60 % distress signal (crew vote, keys B answer / M ignore, 15 s, tie = ignore).
- **Missions** (`voyage_core.js` pure state machine, `voyage.js` host runtime): rescue (escort NPC), black box, relay tower (3 panels + ambush), marked hunt, cargo drone escort, survey (N anomalies), defend the rig (timer, waves, rig HP), vault heist (hold the door), photograph a rare creature (`vy_specimen`, Instant Camera). Pay = credits + chest loot + components + XP; objective lines + screen markers.
- **Contents** (`world/voyage_sites.js`): derelict ship, abandoned colony, alien temple (relic + ambush), merchant outpost (3 stalls), pirate camp (strongbox), crashed Company freighter, meteor shower field (host meteor director). Merged geometry, light-pool emitters only.
- Terrain hook: `planMoon` gets `plan.flats` (flatten zones), `buildMoonOutdoor` calls `buildVoyageWorld` and exposes `outdoor.voyage`.

## Net (all `vy*`)
`vyreq` (client->host `{op}`: random, signal, board, take, drop, vote, use, warp, photo), `vyx` (host->all/one: banner, prompt, board, mstate, found, meteor...), `vyn` (host->all npc rows, 4 Hz). `vyx` / `vyn` are in `HOST_ONLY`. State: `run.vy` (synced + saved).

## Test
`node tools/harness/voyage.test.mjs [300]` (13.8k checks: determinism + validity, facility + terrain reachability, flats, builders, state machines, board, warp rates, mock-game host flows). `tools/harness/wave4_voyage.js` is a browser script (not run).

## Knobs
`WARP` in voyage_core.js (chance, pity, cooldown, minQuotaIndex, vote seconds); `MISSION_TYPES` pay / xp / weights; `randomFee`; `CONTENT` weights / minTier; `game.config.voyage`.

## Known gaps
Never looked at in a browser (set-piece proportions, decor density, markers, NPC follow: NPCs ignore prop colliders). Acid shore: a fire exit can sit behind acid (the main entrance never). Merchant sells 2 items + a crate only. Voyage biomes are not in `GEN_BIOME_IDS` (charted sectors unchanged). No ship CRT screen for the board (terminal only). Meteor / ambush balance untested. i18n audit lists static def strings (translated at runtime through t()) as false positives.
