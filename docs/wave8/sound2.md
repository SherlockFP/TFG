# Wave 8 - SOUND PASS 2 (module `sound2`, src/game/sound2.js + sound2_core.js, src/audio/sfxlib_w8.js)

Owner ask: after ATMOS (docs/wave8/atmos.md) audit every wave-8 feature for missing / placeholder / generic-fallback sounds. Local only, no net messages, no downloads.

## What the audit found
- Missing ids that silently played nothing: `battery_charge` (expeditions), `bell` (repomaps class bell), `door_knock` / `light_flicker` / `heart_monitor_beep` (lcmonsters candidates fell through).
- Lists whose FIRST entry did not exist, so they always fell back: `whisper`, `glass`, `coin`, `rumble`, `sfx`-style candidates in lcmonsters (witch ritual, keeper chime, treat, masked) and crdirector tells.
- Features that reused one generic sample: camera smash / junction cut = `hit_metal`, ON AIR = `ui_error`, ghost-train horn = `ship_horn`, lockdown = `ship_alarm` / `blast_door`, cave-in = `hit_wall` + `door_creak`, mining = `hit_wall` / `hit_metal` for every material, arcade 2 = the classic arcade blips, restaurant = `ui_confirm` / `ui_error`, downed = `heartbeat` / `heal`.
- Nothing at all: servo, REC lock, jammer, drone, revive progress, carry sway, CRT replay, elevator, spores, underwater, sand wind / storm, generator, hub unlock, reward pop.

## New sounds (64, all procedural, `src/audio/sfxlib_w8.js`, installed from sfxlib.js with its helpers; recipes are short, 0.1-4 s, loops 1.2-6 s)
| feature | ids |
|---|---|
| feedcams / 2 | `cam_servo_loop` (nearest working camera, positional), `rec_lock` (rises in pitch + level with the lock meter), `onair_sting`, `cam_smash` (cameras + downed drones), `cam_spray`, `junction_cut`, `jammer_hum` (loop at the jammer), `drone_rotor` (rotor + searchlight ballast, nearest live drone at night) |
| downed | `down_thud` (you / crewmate positional), `revive_loop` (pulse speeds up with progress), `stand_up` |
| carry2 | `carry_creak` (every few steps under a heavy swaying load), `fragile_crunch` (small loss; big loss keeps `glass_break`), `catch_thump` |
| highlights | `crt_on`, `crt_off`, `chat_blip` (quiet, one voice) |
| labyrinths | `train_horn`, `train_rumble` (loop that follows the train), `lockdown_siren`, `gate_slam`, `elevator_hum` (while moving, silent during a stall), `elevator_stall`, `vine_cut`, `spore_puff` |
| expeditions | `uw_loop` + `sound2.muffle` (1.1 kHz low-pass on the whole mix underwater), `uw_bubbles`, `air_warning` (repeats every 3.5 s while low), `sand_wind` / `sand_storm` (bed switches at storm 0.3), `zip_line`, `generator_loop` (positional at the cell generator), `battery_charge` |
| lcmonsters | `door_knock`, `light_flicker`, `heart_monitor_beep`, `lm_witch_chant`, `lm_cage_chime` (keeper telegraph), `lm_mark_bell` (marked), `lm_giggle`, `lm_treat_jingle`, `lm_mimic_creak`, `lm_mask_laugh`, `lm_mask_weep`, `lm_rift_rumble` (Rift Stalker: `mon_scream` / `lurker_growl` from the pack stay for emerge / attack) |
| crdirector | `cd_dimmer_hum`, `cd_follower_static`, `cd_auditor_stamp` (each creature's tell + run / chase sound) |
| resto | `resto_sizzle` (kitchen, positional), `resto_bell` + `alien_chatter` (pay), `alien_chatter` low = angry guest |
| mining | `mine_pick_stone` / `_ore` / `_crystal`, `mine_drill` (local player's own hits), `cave_creak` (warn + cave-in) |
| arcade2 / hubgate / rewardviz / repomaps | `arcade2_flap` / `_pass` / `_crash` / `_tick`, `hub_unlock`, `coin_pop`, `shift_bell`, `shelf_slide` |

The lcmonsters / crdirector call sites pass candidate lists (first existing id wins); the new id is now first and the old sample stays as the fallback.

## Mix policy (src/audio/mixpolicy.js)
Every new id has a rule with a `cat` field (the test asserts it): `loop` (skips the gate, sits under cues), `sting` (gain 0.8, cooldown 1.2 s, 1 voice; `train_horn` 2 voices), `creature_cue` (gain 0.9, 0.3 s, 2 voices, +-3 % pitch; `lm_rift_rumble` 4 s / 1 voice), `foley` (0.12 s, 3 voices, +-5 % pitch), `mining` (0.08 s, 3 voices, +-7 %), `ui_soft` (gain 0.5-0.6; `chat_blip` 0.35 s, 1 voice, gain 0.5), `minigame` (gain 0.6, 4 voices), `resto` (gain 0.6, 1 voice, `alien_chatter` 2.5 s).

## sound2 helper (`game.sound2`)
`cue(name, pos?, vol, extra)` safe one-shot (ignores unknown ids), `hold(key, name, {pos, vol, pitch, lease, ref, max})` lease loop (call every frame / tick, stops 0.35 s after the last call, so a dead camera, an ended ride or a closed panel never leaves a loop running), `muffle(hz)` lease low-pass between the compressor and the speakers (independent of downed's own tone-stage muffle). Table `SOUND_MAP` (feature -> ids) lives in sound2_core.js.

## Atmos beds (src/game/atmos_core.js; 4 new events `chime`, `ice`, `bubble`, `rumble` in atmos.js)
- Labyrinths: `metro` (sub-bass tunnel, far rumble / drips), `greenhouse` (leaf hiss, pumps, drips, bubbles, insects), `prison` (cold buzz, clangs, doors, relays), `tower` (shaft hum + draft, creaks, groans).
- Repomaps: `academy` (fluorescent buzz, PA chimes, doors), `museum` (near-silent hush, level 0.32, gaps 12-30 s), `influencer` (ring-light buzz, fan, relays, flicker), `colddata` (server fans, cold draft, ice cracks).
- Expedition moons (biome ids `ex_barge` / `ex_dune` / `ex_roof`): drowned hush + bubbles + hull groans / dune wind gusts / dead-city hum + far rumble.
All new beds keep gaps of 7-30 s (25 % chance of x2.5 silence, held back while a creature cue is recent), levels 0.32-0.5.

## Test / knobs
`node tools/harness/sound2.test.mjs`: every id in `SOUND_MAP` and every literal id passed to a play helper in the 19 touched files exists (procedural library or external pack; an array passes when any entry exists), all 64 new ids are registered, do not collide with an external sound, have a policy `cat` and render non-silent, creature tells are distinct, new beds resolve with implemented events. Knobs: `RULES` in mixpolicy.js, `BEDS` / `EX_BEDS` in atmos_core.js, `LEASE` in sound2_core.js, levels via each def's `vol` in sfxlib_w8.js.

## Not verified
No browser / headless run (quota rule): all levels are set from the numeric render only, by ear they are guesses. Unchecked by ear: servo / drone / jammer audibility against the hum, `rec_lock` pitch range under `setPitch`, the underwater muffle stacking with downed's, `mine_drill` only reads for the local player's own hits (the hit message carries no tool id), positional loops update at 2 Hz (drone / jammer) so a fast drone steps in the pan, `train_horn` plays at both tunnel ends (cooldown lets two voices through). maps5 zone maze / archive and the worlds3 pocket themes got no new beds.
