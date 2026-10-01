# Dead-Air Replay

An optional, physical distraction on 56K-Dialup deepens the existing Relay Ward power choice. The transmitter (or its reel-house fallback) has a waist-high twin-reel player and amber status strip. One crew-shared recording per landing gives an eight-second silent warning, followed by twelve seconds of broadcasting at that exact ground-level location. Three native sound events may draw nearby listening creatures away from a salvage route. It never spawns creatures, generates loot, changes a wallet or grants a reward.

The broadcast needs the existing powered camera network. Cutting that network cancels the recording and consumes its charge: the crew chooses a sound diversion with surveillance online, or the established privacy/closed-shortcut trade. The main return remains available. Native noise still feeds the existing threat/camera response; this module writes no camera tax or attention ledger. Sound is not guaranteed mind control: actual Hounds hear it, acoustic obstructions still muffle it, and species that track players directly (such as Checksum) need not follow it.

## Integration and authority

Root installs `installReplay19(game)` after broadcast18/feedcams. World exposes immutable `plan.replayControl`, `plan.replayApproach` and `setReplay(stage)`. The control retries safe transmitter/reel-house front positions; unsafe candidates are skipped without weakening ship/fire/pond/main-path exclusions. Static control geometry shares existing material batches, with one additional status mesh and no lights. Lifecycle disposal remains in broadcast18.

The native shared run contains `replay19={token,rev,used,stage,start,pulse}`. Host validates current moon/landing/revision, living outdoor crew, physical reach and ray clearance before consuming a charge. Host time alone advances the recording. Migration retains the run ledger; a cut or expiry never refunds it. The host emits at most one native noise per update, capped to three indexed pulses. Replicas render status and play bounded positional static, never authoritative noise. Native camera clock adjustment shifts the recording start alongside the camera clock.

`game.replay19` exposes `state()`, `plan()`, `hostReq(data,playerId)` and `dispose()`. `r19req` carries `{op:'play',token,rev}`. EN/TR/RU prompts explicitly state warning, duration, location, shared use and cancellation.

## Verification

`node tools/harness/replay19.test.mjs` executes the actual installer, host/replica synchronization, duplicate/stale/dead/distant/wall rejections, silent warning, finite pulses, cancellation, migration, day reset, bounded audio options and no reward requests. It feeds the actual CreatureManager noise queue into the actual Hound behavior, verifying a run toward the recording and native acoustic suppression.

The existing broadcast18 world harness checks eleven actual generated maps, original return/service-route safety, real gate collision/nav behavior, replay interaction rays, a native Rapier player-capsule approach, mesh bounds and disposal. Browser E interaction and two-peer visual/audio feel remain QA responsibilities. Automated perception proves the native behavior contract, not human enjoyment or universal creature distraction.
