// SCORE core (wave 7): the pure half of the adaptive music system. No WebAudio, no three, no game imports -> unit-testable in node
// (tools/harness/score.test.mjs). Docs: docs/wave7/score.md.
//
//   pickScene(ctx)      game snapshot -> { scene, stems: { stemKey: 0..1 } }  (which stems should be audible)
//   ScoreState          per-stem attack / hold / release smoothing of those targets (chase lingers, boss fades slowly ...)
//   nextGrid / crossfadePlan / equalPower   beat- and bar-synced transition timing
//   duckLevel           music duck under Algorithm speech / dance music / stingers
//   MOTIFS, motifEvents The Algorithm's "stream jingle" (5 notes) and the Company's muzak motif + their variants
//   stemEvents(key)     deterministic note/drum event lists for every stem (rendered once to buffers by score_stems.js)
//   bitcrush / stutter  pure sample post-processing for the glitched motif variants

// ------------------------------------------------------------------ timing grid (every stem is exactly 8 bars so all layers stay in phase)
export const BPM = 96;
export const BEAT = 60 / BPM;          // 0.625 s
export const BAR = BEAT * 4;           // 2.5 s
export const BARS = 8;
export const LOOP = BAR * BARS;        // 20 s
export const S16 = BEAT / 4;

export const FAMILIES = ['wild', 'cold', 'arid', 'dark', 'indoor'];
export const LAYERS = ['tension', 'chase', 'boss', 'extract'];             // stack on top of the bed in the field scene
export const THEMES = ['menu', 'orbit', 'home', 'muzak', 'survey'];          // exclusive themes (one stem each)
export const STEM_KEYS = [...FAMILIES.map((f) => 'bed_' + f), ...LAYERS, ...THEMES];

/** Per-stem playback gain (stems are peak-normalised when rendered, this is the mix). */
export const STEM_GAIN = { bed_wild: 0.8, bed_cold: 0.8, bed_arid: 0.8, bed_dark: 0.85, bed_indoor: 0.85, tension: 0.7, chase: 0.8, boss: 0.85, extract: 0.75, menu: 0.9, orbit: 0.8, home: 0.8, muzak: 0.7, survey: 0.65 };

/** Attack / release time constants (s) of a stem's gain and hold time (s) after its trigger stops. */
export const DYN = {
  bed: { up: 2.0, down: 2.5, hold: 0 },
  tension: { up: 1.5, down: 3.5, hold: 2 },
  chase: { up: 0.35, down: 1.8, hold: 4 },
  boss: { up: 1.2, down: 4.0, hold: 5 },
  extract: { up: 0.8, down: 1.5, hold: 0 },
  theme: { up: 1.0, down: 1.0, hold: 0 },
};
export const SCENE_FADE = BAR;   // a scene change fades over one bar and starts on a bar line

// ------------------------------------------------------------------ biome family + scene selection
const FAMILY_OF = {
  hills: 'wild', swamp: 'wild', moor: 'wild', jungle: 'wild', pier: 'wild',
  snow: 'cold', ice: 'cold', frozen: 'cold',
  desert: 'arid', lava: 'arid', ashfield: 'arid', twinsun: 'arid', soviet: 'arid',
  blackforest: 'dark', datascape: 'dark', backrooms: 'dark', mirror: 'dark', night: 'dark',
};
/** biome id (+ whether the player is inside a facility) -> bed family. Unknown biomes fall back to 'wild'. */
export function biomeFamily(biome, indoor = false) {
  if (indoor) return 'indoor';
  return FAMILY_OF[String(biome || '').toLowerCase()] || 'wild';
}

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const DEFAULT_CTX = { menu: false, phase: 'orbit', biome: 'hills', indoor: false, inShip: false, home: false, dead: false, chase: 0, tension: 0, locked: 0, boss: false, extract: false, extractFrac: 1, intensity: 0.7 };

/**
 * Which stems should be audible right now. ctx (all optional, see DEFAULT_CTX):
 *   menu, phase ('orbit'|'landing'|'moon'|'company'|'takeoff'|'fired'), biome, indoor, inShip, home, dead,
 *   chase 0..1 (director heartbeat level = nearest chaser distance), tension 0..1, locked 0..1 (aimtell: 1 = locked on me, 0.15 = being aimed at),
 *   boss (a boss is engaged nearby), extract (facility extraction countdown running), extractFrac (time left / total), intensity 0..1 (setting).
 * Returns { scene: 'off'|'menu'|'orbit'|'home'|'muzak'|'field', family, stems: { key: target 0..1 } } (only non-zero stems listed).
 */
export function pickScene(c0) {
  const c = { ...DEFAULT_CTX, ...(c0 || {}) };
  if (c.menu) return { scene: 'menu', family: null, stems: { menu: 1 } };
  if (c.home) return { scene: 'home', family: null, stems: { home: 1 } };
  if (c.phase === 'company') return { scene: 'muzak', family: null, stems: { muzak: 1 } };
  if (c.phase !== 'moon') return { scene: 'orbit', family: null, stems: { orbit: 1 } };   // orbit, landing, takeoff, fired
  // Sparse unresolved machinery in broad places. Danger takes the same
  // adaptive chase/boss path; maze rooms retain their existing horror beds.
  if(c.surface&&!c.dead&&!c.boss&&!c.extract&&(c.chase||0)<.12&&(c.locked||0)<.15&&(c.tension||0)<.45)
    return {scene:'survey',family:null,stems:{survey:1}};
  const family = biomeFamily(c.biome, c.indoor);
  const k = 0.35 + 0.9 * clamp(c.intensity);                                             // intensity scales the reactive layers only
  const stems = {};
  const safe = c.inShip || c.dead;                                                         // ship / spectating: the bed only
  const chase = safe ? 0 : Math.max(clamp(c.chase), clamp(c.locked) * 0.75);
  const boss = !safe && !!c.boss;
  const ext = !safe && !!c.extract;
  const tens = safe ? 0 : clamp((Math.max(c.tension, chase * 0.9) - 0.25) / 0.5);
  stems['bed_' + family] = clamp(1 - 0.45 * chase - 0.5 * (boss ? 1 : 0) - 0.3 * (ext ? 1 : 0), 0.3, 1) * (safe ? 0.7 : 1);
  if (tens > 0.02 && !boss) stems.tension = clamp(tens * k);
  if (chase > 0.12) stems.chase = clamp((0.45 + 0.55 * chase) * k);
  if (boss) stems.boss = clamp(k);
  if (ext) stems.extract = clamp((0.6 + 0.4 * (1 - clamp(c.extractFrac))) * k);
  return { scene: 'field', family, stems };
}

/** Theme / bed / layer -> dynamics class. */
export function dynOf(key) {
  if (key.startsWith('bed_')) return DYN.bed;
  return DYN[key] || DYN.theme;
}

/** Per-stem smoothing: fast attack, hold, slow release. step(dt, targets) mutates .level and returns it. */
export class ScoreState {
  constructor() { this.level = {}; this.hold = {}; }
  step(dt, targets) {
    const keys = new Set([...Object.keys(this.level), ...Object.keys(targets)]);
    for (const key of keys) {
      const d = dynOf(key), want = targets[key] || 0;
      let cur = this.level[key] || 0;
      let tgt = 0;
      if (want > 0) { this.hold[key] = d.hold; tgt = want; }
      else if ((this.hold[key] || 0) > 0) { this.hold[key] -= dt; tgt = cur; }   // trigger gone: linger (a chaser round the corner is still there)
      const tc = tgt > cur ? d.up : d.down;
      cur += (tgt - cur) * (1 - Math.exp(-dt / Math.max(0.01, tc)));
      if (cur < 0.004 && tgt === 0) cur = 0;
      if (cur > 0 || want > 0) this.level[key] = cur; else { delete this.level[key]; delete this.hold[key]; }
    }
    return this.level;
  }
}

// ------------------------------------------------------------------ transitions + ducking
/** First grid line strictly after `now` (grid anchored at t0, spacing `q`), with a small guard so we never schedule in the past. */
export function nextGrid(now, t0, q, guard = 0.03) {
  const n = Math.ceil((now + guard - t0) / q);
  return t0 + Math.max(0, n) * q;
}
/** Which grid step a scene change / layer entry snaps to. */
export const QUANT = { scene: BAR, boss: BAR, extract: BAR, chase: BEAT, tension: BEAT, bed: BAR, theme: BAR, sting: BEAT / 2 };
export const quantOf = (key) => (key.startsWith('bed_') ? QUANT.bed : QUANT[key] || QUANT.theme);
/** A crossfade that begins on the next grid line: { start, end } in audio-context seconds. */
export function crossfadePlan(now, t0, q = QUANT.scene, fade = SCENE_FADE) {
  const start = nextGrid(now, t0, q);
  return { start, end: start + fade };
}
/** Equal-power crossfade gains at progress p (0..1): { out, in }. */
export function equalPower(p) { const x = clamp(p) * Math.PI / 2; return { out: Math.cos(x), in: Math.sin(x) }; }
/** Position inside the shared 8-bar loop for a source started at `when` on a scene whose grid starts at t0. */
export function loopOffset(when, t0) { const o = (when - t0) % LOOP; return o < 0 ? o + LOOP : o; }

export const DUCK = { speech: 0.42, dance: 0.35, sting: 0.6, cinematic: 0.3 };
/** Music gain multiplier while the Algorithm talks / dance music plays / a stinger rings (the strongest duck wins, two stack a bit). */
export function duckLevel(f = {}) {
  const ds = [];
  if (f.speech) ds.push(DUCK.speech);
  if (f.dance) ds.push(DUCK.dance);
  if (f.sting) ds.push(DUCK.sting);
  if (f.cinematic) ds.push(DUCK.cinematic);
  if (!ds.length) return 1;
  ds.sort((a, b) => a - b);
  return clamp(ds[0] * (ds.length > 1 ? 0.85 : 1), 0.15, 1);
}
/** Time constants (s) for the duck: dive fast, recover slowly. */
export const duckTc = (from, to) => (to < from ? 0.12 : 0.9);

// ------------------------------------------------------------------ note helpers
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'D#4' / 'Bb2' -> midi (C4 = 60). */
export function midi(n) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  if (!m) throw new Error('bad note ' + n);
  return NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
}
export const midis = (s) => s.split(/\s+/).filter(Boolean).map(midi);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ------------------------------------------------------------------ motifs
/**
 * The Algorithm's stream jingle: 5 notes, E4 B4 G4 E5 D#5 (fifth up, third down, sixth up, a half step short of the octave: it never
 * resolves, it is always watching). The Company's muzak motif: C5 E5 G5 A5 G5 (a sunny major arpeggio, on hold music).
 * Every variant keeps the interval contour so it stays recognisable; glitch / punish detune + bit-crush it.
 */
export const MOTIFS = {
  algo: { notes: [64, 71, 67, 76, 75], beats: [0.5, 0.5, 0.5, 0.75, 1.75] },
  company: { notes: [72, 76, 79, 81, 79], beats: [0.5, 0.5, 0.5, 0.75, 1.75] },
};
/**
 * variant -> { motif, tempo (x), voice, transpose, layers: [{ dm: semitone offset, vel, delay }], crush: {bits,div}|null, stutter, radio, sweep, lastBump, resolve, flourish, bend }
 * Used by: intercom (Algorithm speech), live (LIVE event), vote (poll opens: ends on a question), hype1..3 (hype tiers), glitch (punishment /
 * glitch triggered), punish (worst case), co_hq / co_shop / co_pa (Company muzak, shop, PA chime).
 */
export const VARIANTS = {
  intercom: { motif: 'algo', tempo: 1, voice: 'bell', vel: 0.5, layers: [{ dm: 0, vel: 1 }], radio: true, crush: { bits: 10, div: 1 } },
  live: { motif: 'algo', tempo: 1.15, voice: 'fm', vel: 0.85, layers: [{ dm: 0, vel: 1 }, { dm: 12, vel: 0.5 }], sweep: true },
  vote: { motif: 'algo', tempo: 1, voice: 'fm', vel: 0.7, layers: [{ dm: 0, vel: 1 }], lastBump: 4 },
  hype1: { motif: 'algo', tempo: 1.1, voice: 'bell', vel: 0.75, layers: [{ dm: 0, vel: 1 }] },
  hype2: { motif: 'algo', tempo: 1.2, voice: 'fm', vel: 0.85, layers: [{ dm: 0, vel: 1 }, { dm: 12, vel: 0.55 }], transpose: 2 },
  hype3: { motif: 'algo', tempo: 1.3, voice: 'fm', vel: 0.95, layers: [{ dm: 0, vel: 1 }, { dm: 7, vel: 0.6 }, { dm: 12, vel: 0.6 }], transpose: 4, resolve: true, flourish: true },
  glitch: { motif: 'algo', tempo: 1, voice: 'square', vel: 0.7, layers: [{ dm: 0, vel: 1 }], crush: { bits: 5, div: 4 }, stutter: true },
  punish: { motif: 'algo', tempo: 0.8, voice: 'square', vel: 0.85, layers: [{ dm: -5, vel: 1 }, { dm: -5.4, vel: 0.7 }], crush: { bits: 4, div: 6 }, stutter: true, bend: -3 },
  co_hq: { motif: 'company', tempo: 0.85, voice: 'vibes', vel: 0.6, layers: [{ dm: 0, vel: 1 }] },
  co_shop: { motif: 'company', tempo: 1.15, voice: 'vibes', vel: 0.65, layers: [{ dm: 0, vel: 1 }, { dm: 12, vel: 0.4 }] },
  co_pa: { motif: 'company', tempo: 1, voice: 'bell', vel: 0.6, layers: [{ dm: 0, vel: 1 }], radio: true },
};
export const VARIANT_IDS = Object.keys(VARIANTS);

/** Note events of one variant: { events: [{ t, dur, midi, vel, voice }], dur, v } - all times in seconds. */
export function motifEvents(id) {
  const v = VARIANTS[id];
  if (!v) return null;
  const m = MOTIFS[v.motif];
  const beat = BEAT / v.tempo;
  const notes = m.notes.slice(), beats = m.beats.slice();
  if (v.lastBump) notes[notes.length - 1] = notes[notes.length - 2] + v.lastBump;    // the question: rises instead of falling
  if (v.resolve) notes[notes.length - 1] = notes[3] - 0;                              // resolves to the octave-tonic instead of D#
  const events = [];
  let t = 0;
  notes.forEach((n, i) => {
    const dur = beats[i] * beat;
    for (const L of v.layers) events.push({ t: t + (L.delay || 0), dur: dur * (i === notes.length - 1 ? 1.6 : 1.05), midi: n + (v.transpose || 0) + L.dm, vel: v.vel * L.vel, voice: v.voice, bend: v.bend && i === notes.length - 1 ? v.bend : 0, n: i, L: v.layers.indexOf(L) });
    t += dur;
  });
  if (v.flourish) {   // hype 3: a quick major arpeggio over the ending
    const base = notes[notes.length - 1] + (v.transpose || 0);
    [0, 4, 7, 12].forEach((d, i) => events.push({ t: t - beats[4] * beat * 0.4 + i * 0.07, dur: 0.5, midi: base + d + 12, vel: v.vel * 0.4, voice: 'bell', bend: 0, n: -1, L: 0 }));
  }
  const dur = Math.max(...events.map((e) => e.t + e.dur)) + 0.6;
  return { events, dur, v };
}
/** The interval contour (semitone steps) of a motif's first layer. */
export function contour(id) {
  const ns = motifEvents(id).events.filter((e) => e.L === 0 && e.n >= 0).sort((a, b) => a.n - b.n).map((e) => e.midi);
  return ns.slice(1).map((n, i) => n - ns[i]);
}

// ------------------------------------------------------------------ pure sample post-processing (glitched variants)
/** Bit-crush + sample-rate reduce in place: quantise to 2^bits levels, hold each sample `div` frames. */
export function bitcrush(data, bits = 8, div = 1) {
  const lv = Math.pow(2, Math.max(1, bits) - 1);
  let held = 0;
  for (let i = 0; i < data.length; i++) {
    if (i % div === 0) held = Math.round(data[i] * lv) / lv;
    data[i] = held;
  }
  return data;
}
/** Stutter the last note: repeat a `slice` seconds slice `n` times starting at `at` seconds (returns a new, longer array). */
export function stutter(data, sr, at, slice = 0.06, n = 3) {
  const a = Math.min(data.length, Math.floor(at * sr)), len = Math.max(1, Math.floor(slice * sr));
  const out = new Float32Array(data.length + len * n);
  out.set(data.subarray(0, a));
  for (let r = 0; r < n; r++) out.set(data.subarray(a, Math.min(data.length, a + len)), a + r * len);
  out.set(data.subarray(a), a + len * n);
  return out;
}

// ------------------------------------------------------------------ stems: deterministic event lists (rendered once by score_stems.js)
function seeded(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const VOICES = ['pad', 'pluck', 'bell', 'ep', 'fm', 'square', 'vibes', 'sub', 'bass', 'kick', 'tom', 'snare', 'hat', 'clang', 'tick', 'thump', 'swell', 'stab', 'brass', 'hum'];

/** Per-stem render meta: echo send (0..1), stereo, target peak. */
export const STEM_META = {
  bed_wild: { echo: 0.25 }, bed_cold: { echo: 0.4 }, bed_arid: { echo: 0.2 }, bed_dark: { echo: 0.35 }, bed_indoor: { echo: 0.3 },
  tension: { echo: 0.2 }, chase: { echo: 0.1 }, boss: { echo: 0.2 }, extract: { echo: 0.12 },
  menu: { echo: 0.4 }, orbit: { echo: 0.35 }, home: { echo: 0.2 }, muzak: { echo: 0.15 }, survey:{echo:.2},
};

const BED = {
  wild: { prog: ['D3 A3 C4 F4', 'Bb2 F3 A3 D4', 'G2 D3 F3 Bb3', 'A2 E3 G3 C4'], padWave: 'triangle', cut: 900, pent: 'D4 F4 G4 A4 C5', pluckP: 0.28, sub: 'D1', swell: true, hat: false },
  cold: { prog: ['D4 A4 E5', 'Bb3 F4 C5', 'G3 D4 A4', 'A3 E4 B4'], padWave: 'sine', cut: 2600, pent: 'D5 F5 A5 C6 E6', pluckP: 0.5, bell: true, sub: 'D1', subVel: 0.3, swell: false, hiss: true },
  arid: { prog: ['D3 A3 D4', 'Eb3 Bb3 D4', 'C3 G3 C4', 'D3 A3 D4'], padWave: 'sawtooth', cut: 700, pent: 'D4 Eb4 G4 A4 Bb4', pluckP: 0.3, sub: 'D1', drums: 'arid', swell: false },
  dark: { prog: ['D3 Eb3 A3', 'Db3 G3 Ab3', 'D2 Ab2 Eb3', 'Db2 G2 C3'], padWave: 'sawtooth', cut: 480, pent: 'D3 Eb3 Ab3', pluckP: 0.08, sub: 'D1', beat: true, clang: 0.5, swell: true },
  indoor: { prog: ['D3 G#3', 'D3 G#3', 'Eb3 A3', 'D3 G#3'], padWave: 'triangle', cut: 420, pent: 'D4 A4 G#4', pluckP: 0.1, sub: 'D1', hum: true, tick: true, thumps: true, swell: false },
};

function bedEvents(fam) {
  const B = BED[fam], r = seeded('bed_' + fam), ev = [];
  const pent = midis(B.pent);
  B.prog.forEach((ch, i) => {
    const t = i * 2 * BAR, notes = midis(ch);
    ev.push({ voice: 'pad', t, dur: 2 * BAR + 0.6, midi: notes, vel: 0.5, wave: B.padWave, cut: B.cut, att: 1.2, rel: 1.6, trem: fam === 'dark' ? 5 : 0 });
    ev.push({ voice: 'sub', t, dur: 2 * BAR + 0.4, midi: [midi(B.sub) + (i === 2 ? 5 : i === 1 ? -2 : i === 3 ? 7 : 0)], vel: B.subVel || 0.55 });
  });
  for (let s = 0; s < BARS * 8; s++) {                       // sparse notes on the 8th grid
    if (r() > B.pluckP * (s % 8 === 0 ? 1.4 : 0.7)) continue;
    ev.push({ voice: B.bell ? 'bell' : 'pluck', t: Math.max(0, s * BEAT / 2 + (r() - 0.5) * 0.02), dur: 1.2, midi: [pent[Math.floor(r() * pent.length)]], vel: 0.25 + r() * 0.2, pan: r() * 1.4 - 0.7 });
  }
  if (B.swell) for (const b of [0, 4]) ev.push({ voice: 'swell', t: b * BAR, dur: 3.6 * BAR, vel: 0.22, f0: 400, f1: 1800 });
  if (B.hiss) ev.push({ voice: 'swell', t: 0, dur: LOOP, vel: 0.1, f0: 5000, f1: 6500, flat: true });
  if (B.hum) ev.push({ voice: 'hum', t: 0, dur: LOOP, midi: [47], vel: 0.16 });
  if (B.tick) for (let b = 0; b < BARS; b++) if (r() < 0.55) ev.push({ voice: 'tick', t: b * BAR + Math.floor(r() * 4) * BEAT + 0.3 * BEAT, dur: 0.05, vel: 0.12, midi: [96] });
  if (B.thumps) for (const b of [1, 3.5, 6]) ev.push({ voice: 'thump', t: b * BAR, dur: 0.4, vel: 0.35, midi: [30] });
  if (B.beat) for (let b = 0; b < BARS; b++) ev.push({ voice: 'sub', t: b * BAR, dur: BAR, midi: [midi('D1') + 0.25], vel: 0.3 });     // slow beating against the drone
  if (B.clang) for (let b = 0; b < BARS; b++) if (r() < B.clang * 0.5) ev.push({ voice: 'clang', t: b * BAR + r() * 2, dur: 1.5, vel: 0.2, midi: [midi('D5') + Math.floor(r() * 3)] });
  if (B.drums === 'arid') {
    for (let b = 0; b < BARS; b++) {
      ev.push({ voice: 'tom', t: b * BAR, dur: 0.4, vel: 0.5, midi: [45] });
      ev.push({ voice: 'tom', t: b * BAR + 2.5 * BEAT, dur: 0.3, vel: 0.35, midi: [50] });
      if (b % 2) ev.push({ voice: 'tom', t: b * BAR + 3.5 * BEAT, dur: 0.3, vel: 0.3, midi: [55] });
      for (let s = 0; s < 8; s++) if (r() < 0.6) ev.push({ voice: 'hat', t: b * BAR + s * BEAT / 2 + BEAT / 4, dur: 0.05, vel: 0.1 + r() * 0.06 });
    }
  }
  return ev;
}

function tensionEvents() {
  const r = seeded('tension'), ev = [];
  const cl = ['D3 Ab3 Eb4', 'D3 G#3 E4', 'Db3 G3 Eb4', 'D3 Ab3 Db4'];
  cl.forEach((c, i) => ev.push({ voice: 'pad', t: i * 2 * BAR, dur: 2 * BAR + 0.5, midi: midis(c), vel: 0.4, wave: 'sawtooth', cut: 1100, att: 0.6, rel: 1.5, trem: 6.4 }));
  for (let b = 0; b < BARS; b++) {                             // heartbeat: lub-dub every bar, doubling in the second half
    ev.push({ voice: 'thump', t: b * BAR, dur: 0.4, vel: 0.6, midi: [34] });
    ev.push({ voice: 'thump', t: b * BAR + 0.36 * BEAT * 2, dur: 0.4, vel: 0.42, midi: [31] });
    if (b >= 4) { ev.push({ voice: 'thump', t: b * BAR + 2 * BEAT, dur: 0.4, vel: 0.55, midi: [34] }); ev.push({ voice: 'thump', t: b * BAR + 2 * BEAT + 0.36 * BEAT * 2, dur: 0.4, vel: 0.4, midi: [31] }); }
  }
  for (const b of [0, 4]) ev.push({ voice: 'swell', t: b * BAR, dur: 4 * BAR - 0.2, vel: 0.3, f0: 600, f1: 5200 });
  for (let b = 0; b < BARS; b++) if (r() < 0.5) ev.push({ voice: 'bell', t: b * BAR + r() * 2.2, dur: 2, midi: [midi('D6') + (r() < 0.5 ? 1 : 0)], vel: 0.16, pan: r() * 2 - 1 });
  return ev;
}

function chaseEvents() {
  const ev = [], r = seeded('chase');
  const root = [38, 38, 34, 36];                                 // D2 D2 Bb1 C2, one per 2 bars
  for (let b = 0; b < BARS; b++) {
    const t0 = b * BAR, rt = root[Math.floor(b / 2)];
    for (let s = 0; s < 8; s++) ev.push({ voice: 'bass', t: t0 + s * BEAT / 2, dur: BEAT / 2 * 0.9, midi: [rt + (s % 4 === 3 ? 12 : 0)], vel: s % 2 ? 0.45 : 0.7 });
    for (let k = 0; k < 4; k++) ev.push({ voice: 'kick', t: t0 + k * BEAT, dur: 0.25, vel: 0.85 });
    ev.push({ voice: 'snare', t: t0 + BEAT, dur: 0.2, vel: 0.6 }, { voice: 'snare', t: t0 + 3 * BEAT, dur: 0.2, vel: 0.65 });
    for (let s = 0; s < 16; s++) ev.push({ voice: 'hat', t: t0 + s * S16, dur: 0.05, vel: s % 4 === 2 ? 0.28 : 0.13 });
    for (const off of [0.5, 1.5, 2.5, 3.5]) if ((b + Math.floor(off * 2)) % 3 !== 2 || r() < 0.4) ev.push({ voice: 'stab', t: t0 + off * BEAT, dur: 0.18, midi: [rt + 24, rt + 31], vel: 0.32 });
    if (b % 4 === 3) ev.push({ voice: 'swell', t: t0, dur: BAR, vel: 0.3, f0: 800, f1: 6000 });
  }
  return ev;
}

function bossEvents() {
  const ev = [], r = seeded('boss');
  const prog = [['D2 A2 D3', 'D4 A4'], ['Bb1 F2 Bb2', 'Bb3 F4'], ['C2 G2 C3', 'C4 G4'], ['A1 E2 A2', 'A3 E4']];
  prog.forEach(([low, hi], i) => {
    const t = i * 2 * BAR;
    ev.push({ voice: 'brass', t, dur: 2 * BAR - 0.05, midi: midis(low), vel: 0.6 });
    ev.push({ voice: 'pad', t, dur: 2 * BAR + 0.4, midi: midis(hi), vel: 0.35, wave: 'sawtooth', cut: 1600, att: 0.5, rel: 1, trem: 5 });
  });
  for (let b = 0; b < BARS; b++) {
    const t0 = b * BAR;
    for (const [o, m, v] of [[0, 43, 1], [BEAT * 1.5, 47, 0.6], [BEAT * 2, 43, 0.9], [BEAT * 3.25, 50, 0.5], [BEAT * 3.5, 47, 0.7]]) ev.push({ voice: 'tom', t: t0 + o, dur: 0.45, midi: [m], vel: 0.9 * v });
    ev.push({ voice: 'kick', t: t0, dur: 0.3, vel: 0.9 }, { voice: 'kick', t: t0 + 2 * BEAT, dur: 0.3, vel: 0.8 });
    if (b % 2 === 1) ev.push({ voice: 'clang', t: t0 + 3 * BEAT, dur: 1.2, midi: [midi('D4')], vel: 0.35 });
    if (r() < 0.5) ev.push({ voice: 'snare', t: t0 + 3.75 * BEAT, dur: 0.15, vel: 0.35 });
  }
  return ev;
}

function extractEvents() {
  const ev = [];
  const arp = [[50, 53, 57, 62], [46, 50, 53, 58], [48, 52, 55, 60], [45, 49, 52, 57]];
  for (let b = 0; b < BARS; b++) {
    const t0 = b * BAR, a = arp[Math.floor(b / 2)], lift = b % 2 ? 12 : 0;
    for (let s = 0; s < 16; s++) ev.push({ voice: 'square', t: t0 + s * S16, dur: S16 * 0.8, midi: [a[s % 4] + lift + (s % 8 >= 4 ? 12 : 0)], vel: 0.16 + (s % 4 === 0 ? 0.08 : 0) });
    for (let s = 0; s < 8; s++) ev.push({ voice: 'tick', t: t0 + s * BEAT / 2, dur: 0.04, vel: s % 2 ? 0.14 : 0.24, midi: [s % 2 ? 103 : 100] });
    ev.push({ voice: 'kick', t: t0, dur: 0.25, vel: 0.7 }, { voice: 'kick', t: t0 + 2 * BEAT, dur: 0.25, vel: 0.6 });
    ev.push({ voice: 'bass', t: t0, dur: BAR * 0.98, midi: [a[0] - 24], vel: 0.5 });
    if (b % 2 === 1) ev.push({ voice: 'swell', t: t0, dur: BAR, vel: 0.22, f0: 1200, f1: 7000 });
  }
  return ev;
}

function orbitEvents() {
  const ev = [], r = seeded('orbit');
  const prog = ['D3 A3 E4 F#4', 'B2 F#3 D4 A4', 'G2 D3 A3 B3', 'A2 E3 C#4 G4'];
  const pent = midis('D5 E5 F#5 A5 B5');
  prog.forEach((c, i) => {
    ev.push({ voice: 'pad', t: i * 2 * BAR, dur: 2 * BAR + 0.8, midi: midis(c), vel: 0.5, wave: 'triangle', cut: 1500, att: 1.6, rel: 2.2, trem: 0 });
    ev.push({ voice: 'sub', t: i * 2 * BAR, dur: 2 * BAR, midi: [midis(c)[0] - 12], vel: 0.35 });
  });
  for (let s = 0; s < BARS * 4; s++) if (r() < 0.55) ev.push({ voice: 'bell', t: s * BEAT, dur: 2, midi: [pent[Math.floor(r() * pent.length)]], vel: 0.2 + r() * 0.15, pan: r() * 1.2 - 0.6 });
  return ev;
}

function homeEvents() {
  const ev = [], r = seeded('home');
  const prog = ['G3 B3 D4 E4', 'C3 G3 E4', 'D3 A3 F#4', 'G3 B3 D4'], bass = ['G2', 'C2', 'D2', 'G2'];
  const pent = midis('G4 A4 B4 D5 E5 G5');
  prog.forEach((c, i) => {
    ev.push({ voice: 'pad', t: i * 2 * BAR, dur: 2 * BAR + 0.5, midi: midis(c), vel: 0.34, wave: 'triangle', cut: 1800, att: 0.9, rel: 1.2, trem: 0 });
    for (let b = 0; b < 2; b++) for (let k = 0; k < 4; k++) ev.push({ voice: 'bass', t: (i * 2 + b) * BAR + k * BEAT, dur: BEAT * 0.7, midi: [midi(bass[i]) + (k === 2 ? 7 : 0)], vel: 0.4 });
  });
  let last = 2;
  for (let s = 0; s < BARS * 8; s++) {
    if (r() > (s % 2 ? 0.28 : 0.55)) continue;
    last = Math.max(0, Math.min(pent.length - 1, last + Math.floor(r() * 3) - 1));
    ev.push({ voice: 'pluck', t: s * BEAT / 2, dur: 0.6, midi: [pent[last]], vel: 0.32 + r() * 0.15, pan: r() * 0.8 - 0.4 });
  }
  for (let s = 0; s < BARS * 8; s++) ev.push({ voice: 'hat', t: s * BEAT / 2 + BEAT / 4, dur: 0.05, vel: 0.05 + (s % 2) * 0.03 });
  return ev;
}

function menuEvents() {
  const ev = [], r = seeded('menu');
  const prog = ['D3 F3 A3 E4', 'Bb2 D3 F3 A3', 'G2 Bb2 D3 A3', 'A2 D3 E3 A3'];
  prog.forEach((c, i) => {
    ev.push({ voice: 'pad', t: i * 2 * BAR, dur: 2 * BAR + 1, midi: midis(c), vel: 0.5, wave: 'sawtooth', cut: 700, att: 2, rel: 2.4, trem: 0 });
    ev.push({ voice: 'sub', t: i * 2 * BAR, dur: 2 * BAR, midi: [midis(c)[0] - 12], vel: 0.4 });
  });
  // the stream jingle, buried in the mix at bars 1 and 5 (an FM e-piano an octave down, quiet: the Algorithm is already here)
  const m = MOTIFS.algo;
  for (const bar of [1, 5]) {
    let t = bar * BAR + 0.5 * BEAT;
    m.notes.forEach((n, i) => { ev.push({ voice: 'ep', t, dur: m.beats[i] * BEAT * 1.4, midi: [n - 12], vel: 0.34, pan: 0.2 }); t += m.beats[i] * BEAT; });
  }
  const mel = ['A4', 'F4', 'E4', 'D4', 'C5', 'A4', 'G4', 'F4'];
  mel.forEach((n, i) => { if (r() < 0.85) ev.push({ voice: 'ep', t: (2 + i) * BAR * 0.75 + 0.5 * BEAT, dur: 1.6, midi: [midi(n)], vel: 0.26 + r() * 0.1, pan: r() * 0.6 - 0.3 }); });
  ev.push({ voice: 'swell', t: 3 * BAR, dur: 2 * BAR, vel: 0.12, f0: 300, f1: 1500 });
  return ev;
}

function muzakEvents() {
  const ev = [];
  const ch = [['C3 E3 G3 B3', 'C2'], ['A2 C#3 G3 C4', 'A1'], ['D3 F3 A3 C4', 'D2'], ['G2 B2 F3 A3', 'G1']];   // Cmaj7 A7 Dm7 G7
  ch.forEach(([c, b], i) => {
    for (let bar = 0; bar < 2; bar++) {
      const t0 = (i * 2 + bar) * BAR, notes = midis(c).map((n) => n + 12);
      for (const off of [BEAT * 0.5, BEAT * 1.5, BEAT * 3]) ev.push({ voice: 'ep', t: t0 + off, dur: BEAT * 0.9, midi: notes, vel: 0.22 });   // bossa comp
      ev.push({ voice: 'bass', t: t0, dur: BEAT * 1.4, midi: [midi(b) + 12], vel: 0.5 }, { voice: 'bass', t: t0 + 2 * BEAT, dur: BEAT * 1.2, midi: [midi(b) + 19], vel: 0.42 }, { voice: 'bass', t: t0 + 3.5 * BEAT, dur: BEAT * 0.4, midi: [midi(b) + 12], vel: 0.3 });
      for (let s = 0; s < 8; s++) ev.push({ voice: 'hat', t: t0 + s * BEAT / 2, dur: 0.05, vel: s % 2 ? 0.04 : 0.08 });
    }
  });
  const m = MOTIFS.company;                                     // the Company motif on vibes, bars 1 and 5
  for (const bar of [0, 4]) {
    let t = bar * BAR + BEAT;
    m.notes.forEach((n, i) => { ev.push({ voice: 'vibes', t, dur: m.beats[i] * BEAT * 1.6, midi: [n], vel: 0.4, pan: -0.2 }); t += m.beats[i] * BEAT; });
  }
  return ev;
}

const CACHE = new Map();
function surveyEvents(){
 const ev=[];
 // Low suspended tones and uneven metal/key tails leave walking and creature
 // warnings audible. Existing loop, voices and cache still own playback.
 for(const [t,midi] of [[0,[36,43,49]],[6.3,[36,42,43]],[13.7,[35,42,48]]])
  ev.push({voice:'pad',t,dur:5.5,midi,vel:.13,cut:680,att:1.6,rel:1.2});
 for(const [t,midi] of [[1.8,61],[8.9,60],[16.6,61]])
  ev.push({voice:'ep',t,dur:1.7,midi:[midi],vel:.07});
 for(const [t,midi] of [[4.1,39],[11.3,38],[18.2,39]])
  ev.push({voice:'clang',t,dur:1.2,midi:[midi],vel:.035});
 for(const t of [3.2,12.6])
  ev.push({voice:'swell',t,dur:3.1,f0:180,f1:450,vel:.035});
 return ev;
}
/** Sorted event list of a stem (times in [0, LOOP)). Deterministic. Cached. */
export function stemEvents(key) {
  if (CACHE.has(key)) return CACHE.get(key);
  let ev;
  if (key.startsWith('bed_')) { const f = key.slice(4); if (!BED[f]) return null; ev = bedEvents(f); }
  else if (key === 'tension') ev = tensionEvents();
  else if (key === 'chase') ev = chaseEvents();
  else if (key === 'boss') ev = bossEvents();
  else if (key === 'extract') ev = extractEvents();
  else if (key === 'orbit') ev = orbitEvents();
  else if (key === 'home') ev = homeEvents();
  else if (key === 'menu') ev = menuEvents();
  else if (key === 'muzak') ev = muzakEvents();
  else if (key === 'survey') ev = surveyEvents();
  else return null;
  ev.sort((a, b) => a.t - b.t);
  CACHE.set(key, ev);
  return ev;
}

/** Which stems a scene wants pre-rendered (in priority order) so that layers are ready before they are needed. */
export function stemsForScene(scene, family) {
  if (scene === 'field') return ['bed_' + family, 'chase', 'tension', 'boss', 'extract'];
  if (THEMES.includes(scene)) return [scene];
  return [];
}
