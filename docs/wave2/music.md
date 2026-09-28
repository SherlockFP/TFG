# Wave 2 - Playable instruments (module `music`)

Owner ask: "guitar gibi enstrumanlar, itemleri bulup muzik calabilsinler, tus kombinasyonlari, gercek notalar". Installed with
`this.useModule('music', installMusic)` (game.js slot). Scope after the budget cut: **4 instruments**, play mode, chords / notes,
**4 public-domain songs** with follow-along scoring, network note events, noise, jam sessions. (Bass, violin, harmonica, bongos, kazoo,
theremin, guide-mode scrolling notes, busker hat and creature dancing are NOT built; the data model makes them easy adds.)

## Files
| File | What |
|---|---|
| `src/game/music.js` | installer: items, loot, play mode, key capture, network, noise, jam, songbook state, host rewards |
| `src/audio/instruments.js` | pure WebAudio voices (Karplus-Strong strings, tube-amp distortion, keytar synth / FM e-piano, drum synth) + `renderKS` DSP |
| `src/game/songbook.js` | theory (MIDI, scales, chords, voicings), key layouts, the 4 songs, wire format + `sanitizeEvent`, rate limiter, jam detector |
| `src/models/instruments.js` | procedural models (world item, icon, and the strapped-on copy on avatars) |
| `src/ui/musicpanel.js` | on-screen keyboard / chord grid / drum pads with real note names, songbook strip |
| shared edits | `game.js` (2 slot lines), `core/save.js` (`instrumentVolume: 0.8`), `ui/ui.js` (Instrument volume slider in Settings > Audio) |
| tests | `tools/harness/music.test.mjs` (pure logic + KS pitch within 6 cents), `tools/harness/music.sim.test.mjs` (module vs fake game / DOM / WebAudio) |

## Items (all `kind: 'scrap'`, so a found one can also be sold; Company Store tab **Music**, store copies are worth 0)
| Item | id | Store | Sell value | Voice | Noise |
|---|---|---|---|---|---|
| Acoustic Guitar | `guitar_acoustic` | ▮90 | 40-80 | Karplus-Strong + wooden body EQ | 0.30 |
| Electric Guitar | `guitar_electric` | ▮210 | 90-150 | brighter string -> tanh amp -> cabinet, slow feedback sine on single notes | 0.75 |
| Keytar | `keytar` | ▮235 | 100-170 | detuned saws + filter sweep, or FM electric piano | 0.55 |
| Drum Pad | `drumpad` | ▮65 | 30-60 | kick / snare / hats / toms / crash from oscillators + noise | 0.60 |

Found in scrap tables and chests (weight 1-3 per theme, mansion favours acoustic, office / serverfarm / backrooms keytar, sewer / factory drums).

## Controls
Hold an instrument and press **LMB** = PLAY MODE (third-person emote camera, movement locked, instrument strapped on for everybody, arms animate).
Keys are captured while playing, so drop / flashlight / hotbar / ping / emote wheel never trigger. **ESC** or **Backspace** stops; so do getting hurt,
dying, dropping / swapping the item, opening a panel, landing / takeoff. **V** (voice) and **Enter** (chat) still work.

| Input | Guitars (chord mode, default) | Guitars (LEAD mode, `Q`) | Keytar | Drum Pad |
|---|---|---|---|---|
| `A S D F G H J K L ;` | - | white keys C D E F G A B C D E (octave 3) | white keys from C4 (`A`=C4) | pads: `A` kick `S` snare `D` hat `F` open hat `J` tom `K` mid tom `L` floor tom `;` crash |
| `W E T Y U O P` | - | sharps C# D# F# G# A# C# D# | sharps | - |
| `1`-`8` | chords **C G Am F Dm Em E7 D** (selects + strums) | - | `1`-`7` scale lock: piano (all notes), major, minor, pentatonic, blues, harmonic minor, dorian (home row climbs the scale, top row `W E R T Y U I O P` continues an octave up) | same 8 pads |
| `SHIFT` + `1`-`8` | variants **Cm G7 A7 Fm D7 E Em7 Dm** | accent (louder) | accent | accent |
| `LMB` / `Space` | strum down | strum current chord | - (`Space` = sustain pedal, hold) | LMB snare, `Space` kick |
| `RMB` | strum up | strum up | - | kick |
| Mouse wheel | strum up / down | strum up / down | octave up / down | closed hi-hat |
| `Z` / `X` | chord voicing octave -1 / +1 | octave -/+ | octave -/+ | - |
| `Q` | switch CHORD <-> LEAD | switch | switch synth <-> e-piano | - |
| `0` | songbook follow-along on / off (switches guitars to LEAD) | | | - (no songs) |
| `[` / `]` | previous / next song | | | |

Notes are real: the panel shows `C4, D#4...`; A4 = 440 Hz, `A` key = C of the current octave. Electric guitar voices power-chord style (root, fifth, octave, third one octave up).

## Songbook (follow along)
Ode to Joy, Twinkle Twinkle, Fur Elise (theme), Frere Jacques. The strip shows the next 9 notes with the typing key to press (`Z <` / `> X` when the note
is out of the current octave). Any octave of the right pitch class advances; wrong notes count as misses; finish = accuracy % toast and, at >= 70 %,
a host-validated reward (8-24 XP + 1 Clout, **3 per player per day**).

## Game integration
- **Noise**: playing on a moon outside the ship sends `game.balance.noise` every 1.6 s while notes are played (x0.7 outdoors). The panel shows a red LOUD chip. Ship and HQ are safe stages.
- **AI Slop** is calmed by live music within 14 m (`hostBoomboxNear` wrapper, same rule as the boombox).
- **JAM SESSION**: 2+ players who each played 3+ notes in the last 4 s and stand within 8 m (chains count) get a green HUD chip `JAM SESSION xN` on every client.
  The host pays 6-12 XP per 20 s of jam while in orbit / at HQ, **4 payouts per player per day**.
- Settings > Audio > **Instrument volume** (0-150 %).

## Network
One message type `mu` (relayed by the host to peers without a direct link): `{ e: [[instrument, n, velocity, flags], ...] }`, batched per task, max 16 events.
`n` = MIDI note, chord id (`quality*12 + root + 100*(octave+2)`, flag bit0) or drum pad; flags bit1 = up-strum (guitar) / e-piano (keytar), bit2 = sustain.
Sender limit 16 events/s (burst 28), receiver limit 22/s (burst 40) per peer, every event validated by `sanitizeEvent`. Receivers synthesise at the player's
position (HRTF panner, inverse distance falloff, occlusion lowpass via `audio.occluder`), nothing beyond 62 m. Play mode itself travels as the emote id `x:mu_<gac|gel|key|drm>` in `ps.e`.
Host request `musong { sid, acc }` -> XP. No new light, no world-gen randomness, no host-only state besides the capped rewards.

## Testing
```
node tools/harness/music.test.mjs        # 18 tests: notes, chords, layouts, songs, wire format, rate limiter, jam, KS pitch
node tools/harness/music.sim.test.mjs    # 18 tests: play mode / keys / mouse / songbook / limiter / exits / network / jam / host caps / shop / models
npm run build
flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5259 --script tools/harness/wave2_music.js   # browser feature run
```
Browser: ONE headless run (budget) = `wave2_music.js` + `smoke_land.js` in the same session: `errs: []` for both, all three moons landed. Verified in the real game:
module installed, real AudioContext running, guitar spawned into the hand, LMB hook -> play mode (emote `x:mu_gac`, movement frozen, third-person avatar with the
strapped-on guitar mesh), chord ids / lead notes broadcast as `mu` (C = 200, A7 = 233, up-strum flag, C3 / G3 / F3), a fake remote keytar player (receive path, strapped mesh, hit animation
state), Backspace exit + cleanup, instrument models registered. In that run the synthetic key events were dispatched AT `window`, so Input's own listener saw them too and the guitar got
thrown by `Q` right after; the script now dispatches on `<body>` like a real key press (not re-run), and play mode additionally runs the game's own `localActions` with input disabled.

## Known issues / not done
- Never played by hand: avatar strap poses (guessed offsets), arm animation amplitude, panel layout / CSS and real key-to-sound latency are unverified (no screenshots were taken).
- Two real players over the internet not tested (fake peer only).
- The first chord after entering play mode pre-renders its strings in idle slices (~150 ms of DSP over a few frames); an instant first strum may hitch once.
- Not built: bass, violin, harmonica, bongos, kazoo, theremin, rhythm-game scrolling guide, HQ busker hat, Partygoer / Jester reactions (only AI Slop calm + noise). No Turkish folk song: the notation could not be verified offhand.
- Guitar chord mode captures `1`-`8`, so the hotbar (1-4) is unavailable while playing (on purpose); `C` (magic wheel) is not captured.
