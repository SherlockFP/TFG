// Songbook + music theory for the `music` module (pure data / functions, no DOM, no WebAudio: node-testable).
//   - note maths (MIDI <-> frequency <-> name), scales, chord spelling + guitar voicings
//   - keyboard layouts (piano-style typing keys, scale-lock rows, chord slots, drum pads)
//   - public-domain songs as note data ([midi, beats] pairs)
//   - the per-player rate limiter and the jam-session detector shared by sender and receivers
// Pitch convention: MIDI 60 = C4 (middle C), A4 = 69 = 440 Hz.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const noteName = (m) => `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
export const pitchClass = (m) => ((m % 12) + 12) % 12;
/** 'C#4' / 'Bb3' -> midi (null when malformed) */
export function parseNote(s) {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(String(s));
  if (!m) return null;
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
  return (parseInt(m[3], 10) + 1) * 12 + base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

// ------------------------------------------------------------------ scales
export const SCALES = [
  { id: 'piano', name: 'Piano (chromatic)', steps: null },
  { id: 'major', name: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', name: 'Minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'pent', name: 'Pentatonic', steps: [0, 2, 4, 7, 9] },
  { id: 'blues', name: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
  { id: 'harm', name: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11] },
  { id: 'dorian', name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
];
/** midi of scale degree `degree` (may be negative / > length) above `rootMidi` */
export function scaleNote(steps, degree, rootMidi) {
  const n = steps.length;
  const oct = Math.floor(degree / n);
  return rootMidi + oct * 12 + steps[((degree % n) + n) % n];
}

// ------------------------------------------------------------------ keyboard layouts (KeyboardEvent.code)
// Piano-style typing row (the FL Studio / Ableton layout): white keys on the home row, sharps above.
//   A W S E D F T G Y H U J K O L P ;   =  C C# D D# E F F# G G# A A# B C C# D D# E
export const PIANO_KEYS = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16,
};
export const PIANO_LABEL = { KeyA: 'A', KeyW: 'W', KeyS: 'S', KeyE: 'E', KeyD: 'D', KeyF: 'F', KeyT: 'T', KeyG: 'G', KeyY: 'Y', KeyH: 'H', KeyU: 'U', KeyJ: 'J', KeyK: 'K', KeyO: 'O', KeyL: 'L', KeyP: 'P', Semicolon: ';' };
/** scale-lock modes: the home row climbs the scale, the top row continues one scale-length higher */
export const SCALE_HOME = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'];
export const SCALE_TOP = ['KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'];
export const KEY_LABEL = { ...PIANO_LABEL, KeyR: 'R', KeyI: 'I', Quote: "'", Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8' };

/** midi note for a typing key in a melodic layout (null when the key is not mapped). octave 4 = C4 at KeyA. */
export function keyToMidi(code, octave = 4, scaleIdx = 0) {
  const root = (octave + 1) * 12;
  const sc = SCALES[scaleIdx] || SCALES[0];
  if (!sc.steps) return code in PIANO_KEYS ? root + PIANO_KEYS[code] : null;
  let i = SCALE_HOME.indexOf(code);
  if (i >= 0) return scaleNote(sc.steps, i, root);
  i = SCALE_TOP.indexOf(code);
  if (i >= 0) return scaleNote(sc.steps, sc.steps.length + i, root);
  return null;
}
/** which typing key plays `midi` in the current layout (null when out of reach at this octave) */
export function midiToKey(midi, octave = 4, scaleIdx = 0) {
  const codes = (SCALES[scaleIdx]?.steps ? [...SCALE_HOME, ...SCALE_TOP] : Object.keys(PIANO_KEYS));
  for (const c of codes) if (keyToMidi(c, octave, scaleIdx) === midi) return c;
  return null;
}

// ------------------------------------------------------------------ chords
export const CHORD_QUALITIES = [
  { id: 'maj', name: '', iv: [0, 4, 7] },
  { id: 'min', name: 'm', iv: [0, 3, 7] },
  { id: '7', name: '7', iv: [0, 4, 7, 10] },
  { id: 'm7', name: 'm7', iv: [0, 3, 7, 10] },
  { id: 'maj7', name: 'maj7', iv: [0, 4, 7, 11] },
  { id: 'dim', name: 'dim', iv: [0, 3, 6] },
  { id: 'sus4', name: 'sus4', iv: [0, 5, 7] },
];
const Q = Object.fromEntries(CHORD_QUALITIES.map((q, i) => [q.id, i]));
const pc = (n) => NOTE_NAMES.indexOf(n);
/** number keys 1-8 (key of C by default) and their SHIFT variants (minor / seventh flavours) */
export const CHORD_SLOTS = [
  { key: 'Digit1', root: pc('C'), q: Q.maj }, { key: 'Digit2', root: pc('G'), q: Q.maj }, { key: 'Digit3', root: pc('A'), q: Q.min }, { key: 'Digit4', root: pc('F'), q: Q.maj },
  { key: 'Digit5', root: pc('D'), q: Q.min }, { key: 'Digit6', root: pc('E'), q: Q.min }, { key: 'Digit7', root: pc('E'), q: Q['7'] }, { key: 'Digit8', root: pc('D'), q: Q.maj },
];
export const CHORD_SLOTS_SHIFT = [
  { root: pc('C'), q: Q.min }, { root: pc('G'), q: Q['7'] }, { root: pc('A'), q: Q['7'] }, { root: pc('F'), q: Q.min },
  { root: pc('D'), q: Q['7'] }, { root: pc('E'), q: Q.maj }, { root: pc('E'), q: Q.m7 }, { root: pc('D'), q: Q.min },
];
export const chordName = (root, q) => NOTE_NAMES[((root % 12) + 12) % 12] + (CHORD_QUALITIES[q]?.name ?? '');
/** note names of the chord (root position): ['C', 'E', 'G'] */
export const chordSpelling = (root, q) => (CHORD_QUALITIES[q]?.iv || []).map((i) => NOTE_NAMES[(root + i) % 12]);
/** chord id on the wire: quality * 12 + pitch class, + 100 * (octave shift + 2) */
export const encodeChord = (root, q, oct = 0) => q * 12 + (((root % 12) + 12) % 12) + 100 * (Math.max(-1, Math.min(1, oct)) + 2);
export function decodeChord(n) {
  n = Math.floor(n);
  const o = Math.floor(n / 100) - 2, r = n % 100;
  const q = Math.floor(r / 12);
  if (o < -1 || o > 1 || q < 0 || q >= CHORD_QUALITIES.length) return null;
  return { root: r % 12, q, oct: o };
}
/**
 * Guitar voicing of a chord (low string first). 'acoustic' = 6 strings, 'power' = 5 notes with a low root/fifth stack
 * (the electric guitar: distortion eats a full major/minor stack, so the third only sits an octave up).
 */
export function chordNotes(root, q, oct = 0, voicing = 'acoustic') {
  const iv = CHORD_QUALITIES[q]?.iv;
  if (!iv) return [];
  const R = 40 + ((root - 4 + 12) % 12) + 12 * Math.max(-1, Math.min(1, oct));   // root somewhere in E2..D#3
  const third = iv[1], fifth = iv[2], seventh = iv[3];
  let out;
  if (voicing === 'power') out = [R, R + fifth, R + 12, R + 12 + third, R + 12 + fifth];
  else if (seventh != null) out = [R, R + fifth, R + seventh, R + 12 + third, R + 12 + fifth, R + 24];
  else out = [R, R + fifth, R + 12, R + 12 + third, R + 12 + fifth, R + 24];
  return out.filter((n) => n >= 28 && n <= 96);
}

// ------------------------------------------------------------------ drum pads (item: Drum Pad)
export const DRUM_PADS = [
  { id: 'kick', name: 'Kick' }, { id: 'snare', name: 'Snare' }, { id: 'hat', name: 'Hi-hat' }, { id: 'ohat', name: 'Open hat' },
  { id: 'tom1', name: 'Tom' }, { id: 'tom2', name: 'Mid tom' }, { id: 'tom3', name: 'Floor tom' }, { id: 'crash', name: 'Crash' },
];
/** typing keys -> pad index (home row + number row); LMB = snare, RMB = kick, Space = kick */
export const DRUM_KEYS = { KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyJ: 4, KeyK: 5, KeyL: 6, Semicolon: 7, Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7 };

// ------------------------------------------------------------------ instruments (data; the synth voices live in audio/instruments.js)
//   kind: 'chord' (strummed, has a LEAD mode), 'keys' (typing-piano), 'drums' (pads)
//   noise: creature noise units (game.balance.noise) sent while playing (indoors on a moon only)
export const INSTRUMENTS = [
  { code: 0, id: 'gac', item: 'guitar_acoustic', name: 'Acoustic Guitar', kind: 'chord', voice: 'ks', voicing: 'acoustic', noise: 0.3, range: [40, 88], baseOct: 3 },
  { code: 1, id: 'gel', item: 'guitar_electric', name: 'Electric Guitar', kind: 'chord', voice: 'ksdist', voicing: 'power', noise: 0.75, range: [40, 88], baseOct: 3 },
  { code: 2, id: 'key', item: 'keytar', name: 'Keytar', kind: 'keys', voice: 'synth', noise: 0.55, range: [24, 108], baseOct: 4 },
  { code: 3, id: 'drm', item: 'drumpad', name: 'Drum Pad', kind: 'drums', voice: 'drums', noise: 0.6, range: [0, 7], baseOct: 4 },
];
export const INSTRUMENT_BY_CODE = INSTRUMENTS;
export const INSTRUMENT_BY_ITEM = Object.fromEntries(INSTRUMENTS.map((i) => [i.item, i]));

// ------------------------------------------------------------------ wire format
// One 'mu' message = { e: [[instrCode, n, velocity, flags], ...] } (<= MU_MAX_BATCH events).
//   n: midi note (keys / guitar lead), chord id (flags & F_CHORD, see encodeChord) or drum pad index (drums)
//   flags: bit0 chord, bit1 up-strum (guitars) / e-piano patch (keytar), bit2 sustain pedal
export const F_CHORD = 1, F_UP = 2, F_ALT = 2, F_SUS = 4;
export const MU_MAX_BATCH = 16;
/** validate + normalise one wire event; returns [code, n, vel, flags] or null */
export function sanitizeEvent(ev) {
  if (!Array.isArray(ev) || ev.length < 3) return null;
  const code = ev[0] | 0, n = ev[1], v = ev[2], f = (ev[3] | 0) & 7;
  if (!Number.isInteger(ev[0]) || !Number.isInteger(n) || !Number.isFinite(v)) return null;
  const ins = INSTRUMENTS[code];
  if (!ins) return null;
  const vel = Math.max(1, Math.min(127, Math.round(v)));
  if (ins.kind === 'drums') return n >= 0 && n < DRUM_PADS.length ? [code, n, vel, 0] : null;
  if (f & F_CHORD) return ins.kind === 'chord' && decodeChord(n) ? [code, n, vel, f] : null;
  return n >= ins.range[0] && n <= ins.range[1] ? [code, n, vel, f & ~F_CHORD] : null;
}

/** token bucket: allow() true while under `rate` events/s sustained with `burst` headroom */
export function createRateLimiter({ rate = 14, burst = 24 } = {}) {
  let tokens = burst, last = null;
  return {
    allow(nowMs, cost = 1) {
      if (last == null) last = nowMs;
      tokens = Math.min(burst, tokens + ((nowMs - last) / 1000) * rate);
      last = nowMs;
      if (tokens >= cost) { tokens -= cost; return true; }
      return false;
    },
    reset() { tokens = burst; last = null; },
  };
}

/**
 * Jam session detector. players: [{ id, pos: [x,y,z] | {x,y,z}, t: last note ms, n: notes played in the window }].
 * A jam = 2+ players who each played >= minNotes within `windowMs` and stand within `radius` m of another jammer.
 * Returns the ids of the largest connected cluster (empty when < 2).
 */
export function jamGroup(players, nowMs, { windowMs = 4000, radius = 8, minNotes = 3 } = {}) {
  const act = players.filter((p) => p && nowMs - p.t <= windowMs && (p.n ?? 1) >= minNotes && p.pos);
  const px = (p) => (Array.isArray(p.pos) ? p.pos : [p.pos.x, p.pos.y, p.pos.z]);
  const seen = new Set();
  let best = [];
  for (const a of act) {
    if (seen.has(a.id)) continue;
    const comp = [a]; seen.add(a.id);
    for (let i = 0; i < comp.length; i++) {
      for (const b of act) {
        if (seen.has(b.id)) continue;
        const A = px(comp[i]), B = px(b);
        if (Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) <= radius) { comp.push(b); seen.add(b.id); }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  return best.length >= 2 ? best.map((p) => p.id) : [];
}

// ------------------------------------------------------------------ songbook
// beats: quarter note = 1. Only public-domain works (Beethoven, Mozart-era folk, French / English nursery tunes).
const n = (name, beats) => [parseNote(name), beats];
const seq = (str, dflt = 1) => str.trim().split(/\s+/).map((tok) => { const [nm, b] = tok.split('*'); return n(nm, b ? parseFloat(b) : dflt); });

export const SONGS = [
  {
    id: 'ode', title: 'Ode to Joy', composer: 'Beethoven (1824)', bpm: 108, key: 'C',
    notes: seq(`E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4*1.5 D4*0.5 D4*2
      E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4*1.5 C4*0.5 C4*2
      D4 D4 E4 C4 D4 E4*0.5 F4*0.5 E4 C4 D4 E4*0.5 F4*0.5 E4 D4 C4 D4 G3*2
      E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4*1.5 C4*0.5 C4*2`),
    chords: ['C', 'G', 'C', 'G', 'C', 'G', 'C', 'G', 'C', 'G', 'C', 'G', 'C', 'G', 'C'],
  },
  {
    id: 'twinkle', title: 'Twinkle, Twinkle, Little Star', composer: 'Traditional (Mozart variations, 1785)', bpm: 100, key: 'C',
    notes: seq(`C4 C4 G4 G4 A4 A4 G4*2  F4 F4 E4 E4 D4 D4 C4*2
      G4 G4 F4 F4 E4 E4 D4*2  G4 G4 F4 F4 E4 E4 D4*2
      C4 C4 G4 G4 A4 A4 G4*2  F4 F4 E4 E4 D4 D4 C4*2`),
    chords: ['C', 'F', 'C', 'G', 'C', 'F', 'C', 'G', 'C', 'F', 'C', 'F', 'C', 'G', 'C'],
  },
  {
    id: 'elise', title: 'Für Elise (theme)', composer: 'Beethoven (1810)', bpm: 84, key: 'Am',
    notes: seq(`E5*0.5 D#5*0.5 E5*0.5 D#5*0.5 E5*0.5 B4*0.5 D5*0.5 C5*0.5 A4*1.5
      C4*0.5 E4*0.5 A4*0.5 B4*1.5 E4*0.5 G#4*0.5 B4*0.5 C5*1.5
      E4*0.5 E5*0.5 D#5*0.5 E5*0.5 D#5*0.5 E5*0.5 B4*0.5 D5*0.5 C5*0.5 A4*1.5
      C4*0.5 E4*0.5 A4*0.5 B4*1.5 E4*0.5 C5*0.5 B4*0.5 A4*2`),
    chords: ['Am', 'E', 'Am', 'E', 'Am', 'E', 'Am', 'E', 'Am'],
  },
  {
    id: 'jacques', title: 'Frère Jacques', composer: 'Traditional (France, 18th c.)', bpm: 112, key: 'C',
    notes: seq(`C4 D4 E4 C4  C4 D4 E4 C4  E4 F4 G4*2  E4 F4 G4*2
      G4*0.5 A4*0.5 G4*0.5 F4*0.5 E4 C4  G4*0.5 A4*0.5 G4*0.5 F4*0.5 E4 C4
      C4 G3 C4*2  C4 G3 C4*2`),
    chords: ['C', 'C', 'C', 'C', 'C', 'G', 'C', 'C', 'C'],
  },
];
/** melody range (min, max midi) of a song */
export function songRange(song) { let lo = 127, hi = 0; for (const [m] of song.notes) { lo = Math.min(lo, m); hi = Math.max(hi, m); } return [lo, hi]; }
/** total beats */
export const songBeats = (song) => song.notes.reduce((s, [, b]) => s + b, 0);
/**
 * Follow-along scoring: expected note index `idx`; a played note is a hit when its pitch class matches
 * (any octave counts, exact octave = perfect). Returns { hit, perfect }.
 */
export function judgeNote(song, idx, midi) {
  const want = song.notes[idx]?.[0];
  if (want == null) return { hit: false, perfect: false };
  return { hit: pitchClass(want) === pitchClass(midi), perfect: want === midi };
}
/** accuracy 0..1 = hits / (hits + misses) */
export const accuracy = (hits, misses) => (hits + misses > 0 ? hits / (hits + misses) : 0);
