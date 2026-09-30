# gear11 (wave 11) - five new crew gadgets

Module `src/game/gear11.js` (+ `gear11_core.js` pure rules, `gear11_art.js` models/sounds/meshes, `gear11_text.js` TR+RU). Test: `node tools/harness/gear11.test.mjs`.
All five are buyable in the Company Store (registered through `registerItem` + `STORE_ITEMS`, so the data-driven shop, terminal and deals pick them up).
No scene lights anywhere (emissive / unlit materials only).

| Item | Price / tier | Verb (one rule) | Tell + counterplay |
|---|---|---|---|
| Decoy Speaker (grenades kind `speaker`) | 65 uncommon, stack 2 | Throw it: for 12 s it plays the thrower's LAST recorded voice clip (fake robot "Hey, over here!" if none) every 2.4 s; sound-hunting creatures rush to it | Prop with pulsing cone + LED (speech bubble on the fake), amber ring; it does not lure sight-hunters |
| Door Jammer | 55 uncommon, 2 charges | LMB at a plain door: it closes and locks for 40 s for creatures AND crew (nav edge blocked) | Blinking red LED; beeps faster in the last 6 s, then a shriek that makes creature noise; key / lockpick UI is disabled while jammed |
| Scout Drone | 190 rare, battery 30 s | LMB: camera flies out of your body (frozen, still hittable, tether 42 m). LMB = scan (3 s cd, 1.5 s battery): pings items + creatures in LOS for the WHOLE crew (9 s, through walls). E recall | Overlay: battery, link %, distance to body, "HOSTILE NEAR YOUR BODY" warning; a hit on the body cuts the link; a creature touching the drone smashes it (battery 0); its hum is a small lure. Ship charger refills |
| Glow Trail Spray | 35 common, 2 charges | LMB: for 2 min your footsteps leave a glowing chevron every ~3.4 m, pointing back the way you came, coloured per player, crew-shared | Fade over the last 25 s, gone after 3 min; max 320 dots (ONE instanced mesh) |
| Zipline Kit | 140 rare | LMB at a wall/ceiling <= 18 m in line of sight: pole + rope. E on either end slides (Space lets go). One per landing, Crouch+E retracts it (kit drops back at the pole) | Heavy loot / a carried body slow the ride; a 2 s harness brake (fall speed capped) after you let go; hurt = you drop |

## Net (prefix `g11`)
- `g11req` client -> host `{op:'jam'|'trail'|'dot'|'zip'|'zipdel'|'ping'}`, `g11sync` client -> host (late joiners: jams with time left, zipline, trail dots with age, active sprays).
- `g11st` host -> all (HOST_ONLY) `{k:'jam'|'jamend'|'tr'|'dot'|'zip'|'zipdel'|'ping'|'snap'|'msg'}`.
- `g11d` pilot -> everyone (relay type, ~8 Hz): drone pose so the crew sees the drone hover.
- Existing: `door` (lock flag + nav edges), `it`/`itst` (consume charges), `noise` request (drone hum), `grfx` `dz` pulse now carries `o` = thrower id for the speaker.
- Host validates: item held + type, rate limits, door kind / reach, dot spacing + teleport check, zipline range / LOS / one per landing / retract distance.

## Shared-file hooks (minimal)
- `grenades_core.js`: one `KINDS.speaker` line. `grenades.js`: `BLURB.speaker`, host zone `case 'speaker'` (+ `spk`), `dz` pulse `s:4,o`, client `onBoom` `case 'speaker'` and `decoyPulse` `s===4` -> `game.gear11.speakerDeploy/speakerPulse` (falls back to the old beacon sounds if gear11 is absent).
- `game.js`: import + slot line only. Instance-level wraps (restored in dispose): `game.findInteraction` (null while piloting/riding), `game.doorInteraction` (jammed door label), `input.consumeMouse` (look while piloting).

## Extended, not duplicated
`crafting.js` craft_decoy and grenades' Decoy Beacon / Noisemaker already lure by fake sounds: the Speaker rides the SAME grenade zone (throw, arc, fuse, creature noise) and only adds the voice. Doors reuse `door.locked` + nav `blockedEdges`. The drone reuses the item battery + `charge` handler. `voice.clips` (skinwalker recorder) supplies the voice.

## Debug (`kefal.game.gear11.debug`)
`give()` spawn all gadgets in front of you (host) - `jamNearest()` - `speaker()` (visual + voice only) - `trailOn()` - `zip()` (aim at a wall) - `drone()` (hold a scoutdrone) - `ping()`; `kefal.game.gear11.state`.

## Known gaps / not browser-verified
- Drone camera: distance-cull and the LightPool are still centred on the body, so far corners may look dark / pop.
- Fake voice uses the browser speechSynthesis (not spatial, volume by distance); real clips exist only after the voice recorder captured some (mic on).
- Remote riders slide via normal position sync (no seated pose). Jam mesh assumes a door centred on `door.pos`.
