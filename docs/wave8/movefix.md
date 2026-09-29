# Wave 8 - movefix (idle bounce, mantle / vault)

## Root cause (bounce)
`LocalPlayer.update` moves the kinematic body every render frame (`setNextKinematicTranslation` + `setTranslation`), but Rapier
only propagates a body's new pose to its collider inside `world.step()`, which `Physics.step` runs at a fixed 60 Hz. On a frame
without a physics step (2 of 3 frames at 144 Hz, 3 of 4 at 240 Hz, and occasional jitter frames at 60 Hz) the character controller
measured from the STALE collider position, then `np = body.translation() + computedMovement` added its snap-to-ground / depenetration
correction to the FRESH body position: every correction applied twice. Result: +-4.4 cm ping-pong, `grounded` flickering, the gravity
branch re-engaging, the landing dip re-triggering - the player "hops in place". Measured before the fix (idle, 144 Hz, flat floor):
236 mm camera range, 113 ungrounded frames in 2.5 s; at 60 Hz fixed step it never reproduced, which is why earlier fpbody work missed it.
Not the cause (checked, steady to 0.00 mm at 60 Hz): grounded gravity (already fixed in fpbody), autostep, head bob, crouch lerp, stair ramps.

## Fix
`this.physics.world.propagateModifiedBodyPositionsToColliders?.()` right after each `setTranslation` in `update`, `teleport` and the mantle step.
Walk 5.0 / sprint 8.2 unchanged.

## Mantle / vault (`src/entities/mantle.js`, hooked in `localplayer.js`)
Pressing the (remappable, `input.pressed('jump')`) jump key while grounded or within 0.9 s in the air (once per airtime) facing an obstacle:
- `probeLedge` (STATIC rays only): steep face (normal.y <= 0.35) at knee height within 0.55 m (0.9 m sprinting), top surface 0.5-1.6 m, standable depth >= 0.75 m -> **mantle** (pull up first, then forward, 0.4-0.5 s); thin obstacle <= 1.05 m (1.15 sprinting) -> **vault** over it with an arc (0.32-0.38 s). Headroom, landing floor and "nothing above the top" are checked; tall walls, slopes and doors are rejected.
- Sprinting + low (<= 1.15 m): 0.32-0.34 s, exit speed >= 5.5 m/s along the facing (keeps momentum).
- Cost 10 stamina (mantle) / 5 (vault), needs cost+3 and not exhausted. Noise: `player.noise` 0.55 mantle, 0.4-0.6 vault, 0.12 sneaking (the stealth system reads it).
- Blocked (falls back to the normal jump) when two-handed item, carried body, grabbed prop or `weightMul < 0.72`: comic toast "Too heavy to climb!" (EN/TR/RU, once per 3 s) + rustle + small noise.
- Cancelled by stun / freeze / leech latch. Multiplayer: position syncs as usual; remotes see the airborne flag (4) during the move, no new flag or message.

## Knobs
`MANTLE` in mantle.js (minH, maxH, vaultH, reach, needDepth, stamina, vaultStamina, heavyMul), durations in `probeLedge`, `settings.mantle = false` to disable.

## Tests
`node tools/harness/movefix.test.mjs` (22 checks: idle camera range < 5 mm on flat / 25 deg ramp / 0.1 m stairs at 60/144/240 Hz, negative control that reproduces the bounce without the sync,
ledge plans, mantle duration/end pose, stamina + noise, sprint vault momentum, heavy-loot block, exhausted block). Also run: stairs, aimchase, feel, fpbody_stall_offline; `npm run build`.

## Unverified
No browser run (shared lock jammed): real ship deck / terrain trimesh feel, camera pitch kick, view-model during the move, remote player pose, pad users (jump button goes through `pressed('jump')` so it should work),
and whether 0.75 m required depth is too strict for some facility props. Idle probe on a rough trimesh showed 0 mm after the fix; the ship deck itself was not simulated.
