# Wave 7 - SCORE (adaptive procedural music)

No audio files. Everything is synthesised from event lists and rendered ONCE to AudioBuffers with an `OfflineAudioContext` (audio thread, async, one stem at a time, lazily), then looped by `AudioBufferSourceNode`s. A 5 Hz timer only moves GainNodes.

## Files
- `src/audio/score_core.js` pure (node-tested): grid (96 BPM, 8 bars = 20 s loop, every stem the same length so layers stay in phase), `pickScene(ctx)` layer selection, `ScoreState` (attack / hold / release per layer), `nextGrid` / `crossfadePlan` / `equalPower` / `loopOffset`, `duckLevel`, `MOTIFS` + `VARIANTS` + `motifEvents`, `bitcrush` / `stutter`, `stemEvents(key)` (deterministic note + drum lists for all 13 stems).
- `src/audio/score_stems.js` browser: voices (pad, pluck, bell, ep/fm, square, vibes, sub, hum, bass, kick, tom, snare, hat, clang, tick, thump, swell, stab, brass), `renderStem(key)` (22.05 kHz stereo, echo tail folded onto the start = seamless loop, ~3.5 MB each), `renderMotif(id)` (32 kHz one-shot + JS bit-crush / stutter / dropouts).
- `src/audio/score.js` engine `Score`, attached as `audio.score` in `AudioManager.init`. `audio.playMusic('menu_theme')` is claimed by it when Dynamic music is on (otherwise the old sfxlib loop plays).
- `src/game/score.js` `installScore` -> `game.score`: 4 Hz snapshot + event hooks. Tests: `node tools/harness/score.test.mjs`.

## Stems and layers
Beds per biome family (`biomeFamily`): wild (hills swamp moor jungle pier), cold (snow ice), arid (desert lava ...), dark (blackforest datascape backrooms), indoor (any facility). Layers on top in the field scene: `tension`, `chase`, `boss`, `extract`. Exclusive themes: `menu` (D minor pads, the stream jingle buried on an FM piano), `orbit` (calm, also landing / takeoff), `home` (homeworld), `muzak` (Company HQ / shop: bossa Cmaj7 A7 Dm7 G7 with the Company motif on vibes). Max 9 stems cached; a muted layer's source stops after 25 s.

Inputs (`game/score.js`): run phase, `MOONS[moon].biome`, `player.indoor / inShip / dead`, `director.chaseLevel()` (new tiny getter: the per-player heartbeat level the host derives from the nearest chaser distance), aimtell `parseAim(view.extra)` (lock on me = 0.75 chase equivalent, merely aimed at = 0.15), boss engaged flag (`view.extra & 1`, < 70 m), `facilitysys.state.ext` (extraction countdown, layer swells as time runs out), client tension (nearby creatures, low HP, indoors, night, power off). In the ship or spectating only the bed plays.

## Transitions
Layer entries snap to the next beat (chase, tension) or bar (boss, extract, beds); scene changes wait for the next bar line of the running scene and crossfade equal-power over one bar (same tempo everywhere, so bars line up). Chase attacks in ~0.4 s, holds 4 s, releases over ~2 s; boss holds 5 s. Ducking on a dedicated gain: Algorithm speech 0.42, dance music 0.35, a ringing sting 0.6 (two sources stack x0.85), dive 0.12 s / recover 0.9 s.

## Audio identity
The stream jingle (`MOTIFS.algo`): E4 B4 G4 E5 D#5, a half step short of the octave (never resolves). Variants (`VARIANTS`): `intercom` (radio band-pass, first Algorithm line every 30 s), `live` (LIVE event pulling viewers, octave + riser), `vote` (last note rises: a question), `hype1..3` (bell; FM + octave; FM + fifth + octave + arpeggio, resolves), `glitch` (5-bit x4 crush, stutter, dropouts; fired when a glitch is used), `punish` (down a fourth, 4-bit x6, bend; failed extraction). Company motif C5 E5 G5 A5 G5: `co_hq` (entering the Company), `co_shop` (manual: `game.score.sting('co_shop')` or `mods.emit('tfg:score', {k:'shop'})`), `co_pa` (radio chime every 70-120 s at the Company). Stingers play even with Dynamic music off (they only need the music volume).

New event (no net traffic): `mods.emit('tfg:score', { k: 'vote'|'hype'|'glitch'|'punish'|'shop', tier? }, game)`, emitted by algo1 (vote opens) and algo2 (hype tier up, glitch used).

## Settings
`musicVolume` (existing, music bus), `dynamicMusic` (default true; off = old menu loop, no in-game score), `musicIntensity` (default 0.7; scales tension / chase / boss / extract only, k = 0.35 + 0.9 x intensity). Audio tab, EN / TR / RU.

## Knobs / gaps
BPM, family table `BED`, `DYN` timings, `DUCK`, `STEM_GAIN` in `score_core.js`. Not verified in a browser (no run): stem loudness balance, echo tail seam, and real OfflineAudioContext render time are estimates. `co_shop` has no in-game trigger yet; the ship interior has no dedicated theme (bed at 70 %). Multiplayer: every peer scores its own game, nothing is networked.
