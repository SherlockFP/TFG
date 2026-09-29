# Wave 8 - ATMOS (calmer sound, procedural ambience)

Owner: the game's sounds are a bit annoying / disturbing; improve the atmosphere, especially labyrinths and interiors. Mood target: Lethal Company interiors
(low hum, distant pipes, metal creaks, silence that lets you hear creature footsteps). Local only, no net messages.

## 1. Audit (offline render of all 156 sfxlib sounds at 22 kHz; RMS x meta.vol, HF = high-frequency energy ratio)

| Problem | Where | Fix |
|---|---|---|
| Metronome: `ambience_facility` had a thud + noise burst every 1.5 s (20x per 30 s loop), identical every loop, plus 3 fixed creaks | src/audio/sfxlib.js | 4 irregular knocks at 0.12, creaks 0.35 -> 0.2; random events now come from atmos |
| UI / beeps are 10-15 dB louder than steps: `ui_error` -12.5 dB, `ui_fired` -12, `arcade_score/jump` -11, `keypad_beep_*` / `mine_beep` -15, `ui_confirm` -16 (steps sit at -23..-30) | ui bus, arcade, terminals | UI bus x0.65, category gains 0.5-0.7 (mixpolicy.js) |
| UI blip spam: `ui_hover` fires on every hover / range tick / nav, 2700 Hz + 5200 Hz click (HF 0.36) | ui.js sfx() | cooldown 90 ms, max 2 voices, gain 0.5, +-5 % pitch / +-15 % volume, low-pass 6.5 kHz |
| Harsh high end: `crickets` HF 0.61, `rain` 0.53, `steam_hiss` 0.65, `glass_break` 0.73, `spray_paint` 0.78, `spider_skitter` 0.58, `step_grass_*` 0.6, `coins` 0.68, `spark` 0.64 | loops + one-shots | low-pass 5.5-7.5 kHz per name, master high-shelf -3 dB at 6.5 kHz |
| Loud stingers: `ship_alarm` -8 dB, `jester_pop` -8, `clownhorn` -10, `yoinker_yippee` -10, `screamer_scream` -12, `leech_screech` -12.5 | creatures / ship | gain 0.72-0.8, 250-400 ms cooldown, max 2 voices |
| Repetition: steps, item / door / hit sounds always identical pitch and level | all one-shots | +-5-6 % pitch, +-10-12 % volume (whitelist in mixpolicy.js) |
| Stacking: several loop beds at once (`base` + `buzz` + `sxbed` + `ship` + weather + wind + brlhum) all at 0.3-0.5, `lights_buzz` constant | game.js updateAmbience, sfx.js beds, brlevels, worldx | `audio.ambTrim` per layer (0.4-0.85) while atmos runs, own Ambience bus |
| Ambience tied to the Effects slider (amb = sfx x 0.9) | audio.js | own `ambienceVolume` (default 0.8) |
| Music / UI keep playing at full level over creature growls | score, ui | `audio.duck()` on `sx:cue` (chase / alert / attack: -45 %, 1.6 s; close steps: -25 %) |
| Far sounds were as bright as near ones unless the caller passed `occlude` | audio.play | every positional handle has a distance low-pass (bright < 12 m, 2.5 kHz floor) combined with the occlusion cutoff |
| Not fixed | | `heartbeat` / `death_sting` / `ui_levelup` are fine level-wise; creature voices (creaturevoice.js) untouched (they carry their own reach / cooldown logic); music score untouched |

## 2. What changed

* `src/audio/mixpolicy.js` (pure): `policyFor(name)` -> `{gain, cool, max, vary, lp, key}`, `Gate`, `jitter`, `distanceCutoff`, `BUS_TRIM`.
* `src/audio/audio.js`: policy in `play()` (returns null when gated; loops and `opts.raw` skip it, NaN guards kept), duck stage per bus, `duck(amount, hold, buses)`, master high-shelf, bus trims, `ambTrim` in `setAmbience`, distance low-pass loop in `update()`.
* `src/core/save.js` `ambienceVolume`; `src/ui/ui.js` slider "Ambience volume" (EN / TR / RU registered in atmos.js).
* `src/game/atmos_core.js` (pure): `contextOf(snapshot)`, `BEDS`, `outdoorBed(sub)`, `pickEvent`, `nextGap`, `cueEffect`.
* `src/game/atmos.js` (module `atmos`, `game.atmos`): beds crossfaded over ~3 s, events scheduled 5-26 s apart (25 % chance of x2.5 dead silence, 3-8 s settle after a scene change), held back while a creature cue is recent, bed level x0.6 while quiet.

## 3. Contexts -> beds

ship / orbit; factory (default interior), mansion, mineshaft, office (fluorescent + relays), serverfarm (fans), sewer (water, drips), hospital, maze (theme or `game.worlds3?.pocket?.theme` matching maze / labyrinth / hedge), backrooms (+ pool via `game.brlevels.levelAt`), company, outdoors per moon biome + run weather + night (wind, insects in swamp / hills / moor / blackforest, thunder in storms).

## 4. Test / knobs

`node tools/harness/atmos.test.mjs` (policy, contexts, beds, engine smoke on a fake WebAudio graph, cue ducking, slider 0 teardown). In game: `window.kefal.game.atmos.fire('creak')`, `.state`, `.quietFor(10)`. Knobs: `RULES` in mixpolicy.js, `BEDS` in atmos_core.js, `cueEffect`.

## 5. Not verified

No browser / headless run (shared lock jammed): levels were set from the numeric audit, not by ear; footstep audibility under the hum, CPU cost of ~5 oscillators + 3 noise sources per bed, and Safari `createStereoPanner` fallback (skipped when missing) are untested. maps5 zone maze / archive keep their old loop layer only.
