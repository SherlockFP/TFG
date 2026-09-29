# Wave 5 - stairs (MASTERPLAN 25.10, first half)

## Cause
Local player controller (src/physics/physics.js `createController`): autostep 0.42 m / min width 0.16, snap-to-ground 0.4, max climb slope 50 deg, slide from 60 deg, capsule radius 0.34 / height 1.8.
Every stair was a stack of box colliders (0.2-0.3 m risers). On open floor that works, but when the player pushes sideways into a stairwell wall or rail (the normal case in a 1.4 m wide stairwell), Rapier's autostep stalls: `stairs.test.mjs` reproduces it (the old stepped colliders fail 7 of 24 wall-hugging walk runs, the ramp fails 0 of 36).

## Fix: `src/world/stairs.js`
- `planStairs({x, z, y, dir:'x+|x-|z+|z-', width, rise, run, n, baseY, landing, skirt, ...})` returns
  visual `steps` (full-column boxes, no collider), ONE `ramp` (cuboid + quaternion, surface exactly from floor height to top height, so no lip at entry or exit),
  flat landing slabs top and bottom, and coarse `skirt` boxes under the ramp (nobody walks into the hollow below the visual steps).
- `rampWorld(plan, frame)` converts the ramp into a yawed builder frame, `checkStairs(plan)` returns problems (slope <= 47 deg, riser <= 0.8 x stepHeight, width, ramp flush).
- `physics.addStaticBox` accepts a quaternion `{x,y,z,w}` in place of `rotY` (all `addBox` wrappers forward that argument unchanged).
- `Solids.stairs(o)` in worlds2_solids.js and landmarks.js draws the steps and emits the colliders in one call.
- Ladders: `makeLadder` + `ladderStep(L, state, input, speed, dt)` (grab facing the ladder, climb speed, let go at the foot / outside the volume).
- Collider count per flight is no higher than before (ramp + skirts + 2 landings vs one box per step); the visual geometry is unchanged (same step boxes into the same merged meshes).

## Fixed places
| Place | File | Notes |
|---|---|---|
| Soviet (Khrushchyovka) stairwells, every storey of every section | src/world/worlds2_soviet.js | 10 x 0.3 m steps, 43.2 deg |
| Landmark radio / watch towers (3-5 flights, rails kept as boxes) | src/world/landmarks.js `buildTower` | 40.6 deg |
| Ruined 2-3 storey buildings | src/world/landmarks.js `buildRuin` | 43.2 deg |
| Sand crawler rear ramp (twin-sun) | src/world/worlds2_twinsun.js `crawler` | now ends flush with the door sill (was a 0.275 m lip), 31.8 deg |
| Horror mansion grand staircase | src/game/horror_pocket.js | 12 steps, 32 deg |
| Facility catwalk stairs (`stairs_metal`, setpieces) | src/models/props.js, src/world/facility.js, src/world/setpieces.js | prop collider list has one ramp with `q`; facility rotates it with the quarter turn; setpieces reads `userData.stairs` |
| Paper archive ladder (maps5) | src/game/maps5.js | same rules, now `ladderStep` |

Not stairs / left alone: ship2 roof ladder (an interact that teleports, no climbing), voyage stepping-stone chains (low-gravity jumps, not walkable stairs), voyage derelict rear "ramp door" (just a wall gap), setpieces' 1-2 extra 0.2 m top slabs between the stair and the catwalk deck (well under autostep). No stair builders exist in rooms2 / homeworld2 / worldx (worldx towers are `landmarks.js`), grep verified.

## Tests
`node tools/harness/stairs.test.mjs` - runs the real builders (Soviet 3 layouts x 3 seeds, towers 3-5 flights, ruins, crawler, mansion via `buildPocket`, `stairs_metal` prop): 116 flights, asserts slope <= 47 deg, risers <= stepHeight, ramp flush with landings, one ramp collider per flight in the builder output, `rampWorld` vs rotated frames, and a kinematic walk simulation with the real Rapier controller (walk 5 / sprint 8.2 m/s, with and without pushing 0.5 sideways into side walls) that must reach the top platform; plus ladder rules. Also updated `worlds2_decor.test.mjs` (its axis-aligned stair-walkability check skips oriented ramps).

## Known gaps
- No browser run (budget rule); nobody climbed them by hand. The next lead browser batch should climb a Soviet block, a tower and the mansion stairs (script idea: teleport to the flight foot, hold forward + strafe into the wall, expect feetY to reach the top).
- The ramp passes through the rear edge of the visual treads, so feet sink up to ~0.15 m into the treads for other players' avatars (camera not affected).
- Ship upper deck (25.10 second half) is the separate `shipdeck` task.
