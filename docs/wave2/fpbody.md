# Wave 2 - FPBODY (first-person feel) - module `fpbody`

`game.fpbody` = `src/game/fpbody.js` (`this.useModule('fpbody', installFpBody)`), pure maths in `src/game/fpbody_grip.js`.
Edits in shared files are marked `// [fpbody]`: `avatar.js` (arm IK + `export VM_REST`), `actions.js` (3 hooks), `localplayer.js` (3 small fixes), `game.js` (import + slot).
**Status: node-verified only. The headless browser run and the 2 screenshots were cancelled by the lead (overloaded machine): nothing below was looked at in a real renderer.**
`tools/harness/fpbody.js` (browser script, syntax-checked only) is ready for that run. Switches: `game.fpbody.opts.{bubbles, body, fitGrip, vmDepth, smoothDt}`.

## 1. Chat bubbles (asked: text above the speaker's head)
Canvas-textured sprite (VT323 pixel font, notched-corner frame, stepped tail), max 2 lines with word/char wrap and `...`, fade 0.7 s, life 5 s + 0.045 s per char (cap 9 s), max 3 stacked (newest lowest),
grows with distance so it stays readable, hidden > 25 m (fades from 17 m), occlusion ray every 0.3 s (fades behind walls). Sources: `mods 'chat'` (registered after magic.js, so a typed spell arrives as `WORD!` and gets the purple style),
`hud.floatText('✦ ...')` from `magic.js applyFx` (remote incantations are diverted into the bubble instead of a HUD float), remote emote changes (`* Dance *`, names already have Turkish). The chat log is untouched, own messages get no bubble (optional echo skipped).
No new UI strings (only `Chat bubbles` / `First-person body` TR keys registered for a future settings row).
Node smoke (`tools/harness/fpbody_smoke.mjs`, mocked game): stack of 3, 1-2 lines, 80-char word broken, self / `TFG` ignored, spell float -> bubble, emote bubble, 40 m hidden, expiry, dispose.

## 2. First-person body
A second `createAvatar` on its own render layer (2, enabled on the main camera only, so the ship mirror never shows it), positioned 0.14 m behind the camera at `player.pos` (+ `stepOff`, so stair smoothing moves body and eye together),
yaw = view yaw eased ±0.7 rad towards the strafe direction, fed the real `hSpeed / crouch / sprinting / grounded` (walk, run, crouch, jump cycles from the existing avatar animation). After `avatar.update`, `poseFpBody` hides neck+head+hat, backpack and BOTH arms (the view model owns the hands; no doubled hands),
shortens the torso (y 0.72, 0.30 crouched) and clamps its lean so the collar never reaches the lens. Suit / outfit colour follows the wardrobe (`setLook`, polled 2 Hz). Hidden when dead, emoting (third person), seated in the cruiser.
Node (`fpbody_body_offline.mjs`): closest body surface to the camera >= 0.123 m in idle / walk 4.5 / sprint 8 / crouch / crouch-walk / airborne, also with a 6 cm landing dip (near plane 0.05); 80-84 % of the body vertices inside the frustum at pitch -1.0 / -1.35.

## 3. View model
**Root cause found (numbers, `fpbody_offline.mjs`, all 101 procedural item models on the shipped placement):** the tool grip offset had the wrong sign (`refreshHeldVisuals` put the model's *far* end at the palm), scrap was centred on the wrist, two-handed items floated 0.6-0.8 m away and the left hand never touched anything.
`fitGrip` (fpbody_grip.js) classifies each item (scrap / tool / melee / long two-hander / two-hand carry / body), takes the grip from the model's own vertices (tools: authored origin; scrap: lower-rear palm point; unknown GLB tools: long axis onto -Z) and pushes it out of the forearm / upper-arm tubes of the rig.
Carries put BOTH hands on the item through a new 2-link arm IK (`vmArmIK`, verified against the real rig: hand within 7 mm, wrist world orientation identity); guns / hammers put the left hand on the fore-end.
The view model is drawn over the world by a per-mesh `gl.depthRange(0, 0.06)` (`onBeforeRender`, main camera only, only while the mesh is still a view-model child) - it can no longer sink into walls; the post-process outline just sees it as very near.

| 101 item models, camera fov 72 | shipped | fitted |
|---|---|---|
| inside the forearm / arm (> 5 mm) | 25 | **0** |
| vertices behind the near plane | 8 (shovel, pipe, machete, stop sign, rod, sledge, harpoon, shotgun) | **0** |
| bounding-box centre off screen | 6 | **0** |
| item box further than 7 cm from the palm / hands | many two-handed (0.5-0.8 m) | 1 (fishing rod: long butt behind the grip, 9 cm) |

Live check through the real view model (smoke test, arms settled 60 frames): mug, register, shovel, shotgun, flashlight, boombox, body bag, bell, axle, rod: penetration 0 cm, 0 % behind the near plane, centres inside the frustum, both hands within 2-7 cm of the register / axle.
Remote avatars: `placeRemoteHeld` fixes the same sign bug and moves scrap in front of the glove.

## 4. Movement stutter
* **Root cause (LocalPlayer):** the constant `vel.y = -1` "stick to ground" push (desired.y = -1.7 cm/frame) made the Rapier character controller cancel its horizontal movement for ~3 frames every ~0.7 s on flat cuboid floors (facility slab, ship). Real `LocalPlayer` + `Physics`, flat floor, 1460 frames at 60 Hz (`fpbody_stall_offline.mjs`):
  shipped **108 stalled frames (7.4 %, 33 events, speed 0.00 m/s)**, fixed **0** (min speed 4.67). Clamping desired.y to -1 / -3 mm still stalls (31 / 41), autostep off, snap off, offset changes do not help: only "no vertical push while grounded" does (snap-to-ground 0.4 m keeps contact, ungrounded frames 0).
* Camera displacement per frame (forward, cm, `fpbody_walk_offline.mjs`, real LocalPlayer + Game.update sub-stepping + physics accumulator, 240 samples):

| frame times | CV shipped -> fixed | frames off > 15 % | physics steps 0/1/2 per frame |
|---|---|---|---|
| fixed 60 Hz | **19.8 % -> 1.0 %** | 21 -> 0 | 0/240/0 -> same |
| +-2.5 ms jitter | **23.9 % -> 3.4 %** | 53 -> 0 | 15/213/12 -> 10/223/7 |
| +-2.5 ms jitter + 2 % 30-42 ms spikes | **27.2 % -> 8.0 %** | 46 -> 17 | 7/222/10 -> 3/229/8 |

* `Game.update` dt smoothing (`makeDtSmoother`, linear low-pass, sum of time preserved, spikes pass through): std of dt 1.47 -> 0.56 ms, drift 0.1 ms per 600 frames.
* Bob phase kept its overshoot at every footfall (`stepDist -= stride`), a one-frame ground flicker no longer drops the bob, per-frame `desired` / `lookDelta` objects reused. Controller runs per render frame (no fixed-step interpolation needed: the camera always uses the frame's own position).
* Checked, **no change**: terrain trimesh internal edges (`FIX_INTERNAL_EDGES` gave bit-identical speeds on a 3.2 m rough heightfield, `fpbody_terrain_offline.mjs`); step smoothing for lips < 4 cm (a slope-vs-step discriminator did not help the 1.5-10 cm ledge test, reverted); the facility floor is one slab (no seams).
  PSX vertex snap (200 x 150 grid) also shimmers while walking: that is the `vertexJitter` setting, untouched.

## Not verified (needs one browser run of `tools/harness/fpbody.js`)
Bubble look / size / font in the PSX pipeline, first-person body look (legs, boots, crouch, layer isolation from the mirror), `renderer.compile` hitch, arm IK look (elbow direction, base slide of the left arm), `depthRange` in a real GPU pass and the post-process outline on view-model edges (SwiftShader may differ),
weapon-glow / trail meshes drawn with the depth range, GLB (ext) item classes, two-player bubbles, real-time frame pacing (all numbers above are simulated frame times).
Known: fishing rod sits 9 cm above the palm; the body has no strafe/back-pedal specific gait; no own-message echo.
