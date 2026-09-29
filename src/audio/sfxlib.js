// TFG — procedural sound library.
// Every sound is synthesized from scratch in pure JS (see dsp.js) — no samples, no Web Audio needed.
//
//   SFX[name] = { dur, loop, cat, vol }      metadata (vol = suggested playback gain)
//   renderSfx(name, sampleRate) → { sampleRate, channels: [Float32Array, ...] }
//   listSfx() → names
//
// Rendering is deterministic (seeded from the sound's name). Output is peak-normalized to ~0.9.
// Loops are rendered "periodically": noise tables, LFO rates and events wrap on the loop period,
// processing chains are warmed up for `warm` seconds, and a short correlation-compensated
// crossfade guards the seam — so they loop seamlessly.

import * as D from './dsp.js';

const TAU = D.TAU;
const DEFS = Object.create(null);
export const SFX = {};
let CAT = 'ui';

/**
 * Register a sound. meta: dur (s), loop, vol, warm (loop warm-up s), xf (loop seam crossfade s),
 * fadeOut (one-shot tail fade s). fn(c) returns a mono Float32Array or [L, R].
 */
function def(name, meta, fn) {
  const m = { cat: CAT, vol: 0.7, loop: false, ...meta };
  DEFS[name] = { ...m, fn };
  SFX[name] = { dur: m.dur, loop: !!m.loop, cat: m.cat, vol: m.vol };
}

export function listSfx() { return Object.keys(SFX); }

/** Render context: sizes, deterministic RNG, loop-aware time/noise/event placement. */
class Ctx {
  constructor(name, d, sr) {
    this.name = name; this.sr = sr; this.dur = d.dur; this.loop = !!d.loop;
    this.L = Math.round(d.dur * sr);
    this.X = this.loop ? Math.round((d.warm ?? 0.3) * sr) : 0;
    this.Y = this.loop ? Math.min(Math.round((d.xf ?? 0.06) * sr), this.L >> 2) : 0;
    this.N = this.X + this.L + this.Y;
    this.rng = D.makeRng(D.hashString(name) ^ 0x5bd1e995);
  }
  S(s) { return Math.max(0, Math.round(s * this.sr)); }
  buf() { return new Float32Array(this.N); }
  /** Sound time of buffer index i (wraps to [0, dur) for loops). */
  t(i) {
    if (!this.loop) return i / this.sr;
    let tt = ((i - this.X) / this.sr) % this.dur;
    return tt < 0 ? tt + this.dur : tt;
  }
  /** Control curve fn(t, i) evaluated every `step` samples and linearly interpolated. */
  curve(fn, step = 16) {
    const N = this.N, a = new Float32Array(N);
    let i0 = 0, v0 = fn(this.t(0), 0);
    while (i0 < N - 1) {
      const i1 = Math.min(N - 1, i0 + step), v1 = fn(this.t(i1), i1), d = (v1 - v0) / (i1 - i0);
      for (let k = i0; k < i1; k++) a[k] = v0 + d * (k - i0);
      i0 = i1; v0 = v1;
    }
    a[N - 1] = v0;
    return a;
  }
  env(pts, mode) { return this.loop ? this.curve(t => D.interp(pts, t, mode)) : D.env(this.N, this.sr, pts, mode); }
  /** Lock a frequency so it completes an integer number of cycles per loop. */
  lf(f) { return this.loop ? Math.max(1, Math.round(f * this.dur)) / this.dur : f; }
  /** Scale a (periodic) frequency curve so its phase closes over the loop. */
  lock(fa) {
    if (!this.loop) return fa;
    let s = 0; for (let i = this.X; i < this.X + this.L; i++) s += fa[i];
    const cyc = s / this.sr; const k = Math.max(1, Math.round(cyc)) / cyc;
    for (let i = 0; i < fa.length; i++) fa[i] *= k;
    return fa;
  }
  osc(type, f, o) {
    if (typeof f === 'number') f = this.lf(f); else if (this.loop) f = this.lock(new Float32Array(f));
    return D.osc(this.N, this.sr, type, f, o);
  }
  /** Oscillator rendered at sr/k and upsampled — for low, filtered drones (cheap on long loops). */
  lowOsc(type, f, k = 4) {
    const n2 = Math.ceil(this.N / k) + 2;
    return D.upsample(D.osc(n2, this.sr / k, type, this.lf(f)), k, this.N);
  }
  /** Buffer generated with period L (for loops) — gen(len) must return a Float32Array(len). */
  periodic(gen) {
    if (!this.loop) return gen(this.N);
    const L = this.L, tab = gen(L), out = new Float32Array(this.N);
    // out[X + j] = tab[j mod L]; fill by whole-segment copies
    let start = ((-this.X % L) + L) % L; // tab index at out[0]
    for (let i = 0; i < this.N;) {
      const cnt = Math.min(L - start, this.N - i);
      out.set(tab.subarray(start, start + cnt), i);
      i += cnt; start = 0;
    }
    return out;
  }
  noise(color = 'white', rng = this.rng) {
    return this.periodic(len => {
      if (color === 'white' || !this.loop) return D.noise(len, rng, color);
      // prime the (short-memory) color filter with the table's tail so the result wraps seamlessly
      const w = D.noise(len, rng, 'white'), P = Math.min(len, 8192), two = new Float32Array(P + len);
      two.set(w.subarray(len - P)); two.set(w, P);
      return D.colorize(two, color).slice(P);
    });
  }
  dust(density, o) { return this.periodic(len => D.dust(len, this.sr, this.rng, density, o)); }
  /** Sum of sines (locked rates, random phases) normalized to ±1: slow periodic modulation. */
  wob(rates, amps) {
    const fs = rates.map(r => this.lf(r)), phs = rates.map(() => this.rng() * TAU);
    const gs = rates.map((r, k) => amps ? amps[k] : 1), tot = gs.reduce((a, b) => a + b, 0);
    const X = this.X, sr = this.sr;
    // locked rates make the loop wrap implicit, so plain (i - X)/sr time is seamless
    return this.curve((t, i) => {
      const tt = (i - X) / sr; let v = 0;
      for (let k = 0; k < fs.length; k++) v += gs[k] * Math.sin(TAU * fs[k] * tt + phs[k]);
      return v / tot;
    }, 32);
  }
  /** Add event buffer `src` at sound time t (wrapped periodically for loops). */
  place(dst, src, t, g = 1) {
    const off = Math.round(t * this.sr);
    if (!this.loop) return D.add(dst, src, g, off);
    const L = this.L;
    let p = this.X + (((off % L) + L) % L);
    while (p + src.length > 0) p -= L;
    for (p += L; p < this.N; p += L) D.add(dst, src, g, p);
    return dst;
  }
  vowels(seq, scale = 1) {
    return [0, 1, 2].map(k => this.env(seq.map(([t, v]) => [t, (typeof v === 'string' ? D.VOWELS[v] : v)[k] * scale]), 'cos'));
  }
}

export function renderSfx(name, sampleRate = 44100) {
  const d = DEFS[name];
  if (!d) throw new Error(`renderSfx: unknown sound "${name}"`);
  const c = new Ctx(name, d, sampleRate);
  const res = d.fn(c);
  let chans = (Array.isArray(res) ? res : [res]).map(x => finish(c, x, d));
  if (c.loop && typeof d.rotate === 'number') chans = rotateBy(chans, Math.round(-d.rotate * c.sr));
  else if (c.loop && d.rotate !== false) chans = rotateToQuiet(chans, Math.round(0.03 * c.sr));
  let p = 0; for (const ch of chans) p = Math.max(p, D.peak(ch));
  const g = p > 1e-9 ? 0.9 / p : 0;
  for (const ch of chans) D.mul(ch, g);
  return { sampleRate, channels: chans };
}
/** Circular shift so the loop starts `r` samples earlier (r > 0 = pre-roll before the downbeat). */
function rotateBy(chans, r) {
  const L = chans[0].length; r = ((r % L) + L) % L;
  if (!r) return chans;
  return chans.map(ch => { const o = new Float32Array(L); o.set(ch.subarray(L - r)); o.set(ch.subarray(0, L - r), r); return o; });
}
/** Circularly shift a seamless loop (≤ W samples) so it starts near a zero crossing — lossless. */
function rotateToQuiet(chans, W) {
  const L = chans[0].length;
  let best = 0, bv = Infinity;
  for (let r = 0; r < Math.min(W, L - 1); r++) {
    let v = 0;
    for (const ch of chans) { const a = ch[r], b = ch[(r - 1 + L) % L]; v += Math.abs(a) + Math.abs(a - b); }
    if (v < bv) { bv = v; best = r; }
  }
  if (!best) return chans;
  return chans.map(ch => { const o = new Float32Array(L); o.set(ch.subarray(best)); o.set(ch.subarray(0, best), L - best); return o; });
}
function finish(c, x, d) {
  let y = x;
  if (y.length !== c.N) { const z = new Float32Array(c.N); z.set(y.length > c.N ? y.subarray(0, c.N) : y); y = z; }
  for (let i = 0; i < y.length; i++) if (!Number.isFinite(y[i])) y[i] = 0;
  D.hp1(y, c.sr, d.dcHz ?? 8);
  if (c.loop) return D.loopExtract(y, c.X, c.L, c.Y);
  return D.fade(y, c.sr, 0.0005, d.fadeOut ?? 0.012);
}

// =====================================================================================
// Generic generators — each returns a standalone buffer (roughly unit peak) to be placed.
// Envelope/rate breakpoint times marked "norm" are fractions of `len`.
// =====================================================================================
const PLATE = [1, 1.59, 2.14, 2.30, 2.65, 2.92, 3.16, 3.50, 3.60, 4.06, 4.15, 4.60, 5.13, 5.40, 5.93, 6.21];
const norm = (x, p = 1) => D.normalize(x, p);
/** Level-independent saturation: normalize to unit peak, then waveshape with `drive`. */
const sat = (x, drive = 2, type = 'tanh') => D.shape(norm(x), drive, type);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

function nburst(c, o = {}) {
  const { len = 0.05, color = 'white', type = 'bp', f = 2000, f2, q = 1, a = 0.001, t60 = len, rng = c.rng } = o;
  const n = c.S(len);
  const x = D.noise(n, rng, color);
  if (type) D.svf(x, c.sr, type, f2 ? D.ramp(n, f, f2, true) : f, q);
  D.mul(x, D.perc(n, c.sr, a, t60));
  return norm(x);
}
/** Low sine thud with pitch drop f0→f1, plus brown-noise body and click. */
function thud(c, o = {}) {
  const { f0 = 140, f1 = 45, len = 0.4, drop = 0.05, t60 = len * 0.8, click = 0.15, body = 0.3, lp = 350, rng = c.rng } = o;
  const n = c.S(len);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = f1 + (f0 - f1) * Math.exp(-i / c.sr / drop);
  const x = D.osc(n, c.sr, 'sine', f);
  D.mul(x, D.perc(n, c.sr, 0.0015, t60));
  if (body) {
    const b = D.noise(n, rng, 'brown'); D.svf(b, c.sr, 'lp', lp);
    D.mul(b, D.perc(n, c.sr, 0.001, t60 * 0.6)); D.add(x, norm(b), body);
  }
  if (click) D.add(x, nburst(c, { len: 0.006, f: 2500, q: 0.8, t60: 0.004, rng }), click);
  return norm(x);
}
/** Modal metal hit (inharmonic plate modes excited by a noise tick). */
function metal(c, o = {}) {
  const { f = 400, len = 1, t60 = 0.8, count = 10, bright = 0.6, spread = 0.04, ratios = PLATE, exc = 0.0015, rng = c.rng, tilt = 0.6 } = o;
  const n = c.S(len);
  const e = new Float32Array(n);
  const en = Math.max(2, c.S(exc));
  for (let i = 0; i < en && i < n; i++) e[i] = rng.bi() * (1 - i / en);
  const cut = 1200 + bright * 9000;
  const modes = [];
  for (let k = 0; k < count; k++) {
    const r = ratios[k % ratios.length] * (k >= ratios.length ? 1.73 : 1) * (1 + rng.bi() * spread);
    const fk = f * r;
    const amp = rng.range(0.5, 1) * Math.pow(1 + k, -tilt) * (fk > cut ? 0.25 : 1);
    modes.push([fk, t60 * rng.range(0.6, 1.1) * Math.pow(f / fk, 0.4), amp]);
  }
  return norm(D.modal(e, c.sr, modes));
}
function wood(c, o = {}) {
  return metal(c, { ratios: [1, 2.31, 3.9, 5.3, 7.1], count: 5, spread: 0.06, exc: 0.0008, tilt: 0.8, t60: 0.12, len: 0.3, ...o });
}
/** Short resonant click. */
function click(c, o = {}) {
  const { f = 3000, q = 4, len = 0.02, rng = c.rng, exc = 0.0006 } = o;
  const n = c.S(len), x = new Float32Array(n), m = Math.max(1, c.S(exc));
  for (let i = 0; i < m && i < n; i++) x[i] = rng.bi();
  D.svf(x, c.sr, 'bpq', f, q);
  D.mul(x, D.perc(n, c.sr, 0.0002, len));
  return norm(x);
}
/** Band-limited noise with attack / sustain / release. */
function hiss(c, o = {}) {
  const { len = 1, lo = 2000, hi = 9000, a = 0.02, r = 0.3, color = 'white', rng = c.rng, flutter = 0, frate = 30 } = o;
  const n = c.S(len), x = D.noise(n, rng, color);
  D.band(x, c.sr, lo, hi);
  D.mul(x, D.env(n, c.sr, [[0, 0], [a, 1], [Math.max(a, len - r), 0.75], [len, 0]]));
  if (flutter) { const w = D.smoothNoise(n, c.sr, rng, frate); for (let i = 0; i < n; i++) x[i] *= 1 - flutter * (0.5 + 0.5 * w[i]); }
  return norm(x);
}
/** Air whoosh: band-passed noise sweeping f0→f1→f2 with a bell envelope. */
function whoosh(c, o = {}) {
  const { len = 0.4, f0 = 400, f1 = 1800, f2 = 500, q = 1.5, peakAt = 0.45, color = 'pink', rng = c.rng } = o;
  const n = c.S(len), x = D.noise(n, rng, color), tp = len * peakAt;
  D.svf(x, c.sr, 'bp', D.env(n, c.sr, [[0, f0], [tp, f1], [len, f2]], 'exp'), q);
  D.mul(x, D.env(n, c.sr, [[0, 0], [tp, 1], [len, 0]], 'cos'));
  return norm(x);
}
/** Stick-slip creak: impulse train (rate contour, norm times) through resonances. */
function creak(c, o = {}) {
  const { len = 1, rate = [[0, 40], [1, 60]], res = [600, 1100, 1900], q = 12, jitter = 0.25, rng = c.rng,
    amp = [[0, 0], [0.1, 1], [0.85, 1], [1, 0]] } = o;
  const n = c.S(len);
  const rt = D.env(n, c.sr, rate.map(([t, v]) => [t * len, v]), 'exp');
  const imp = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += rt[i] / c.sr * (1 + jitter * rng.bi());
    if (ph >= 1) { ph -= 1; imp[i] = 0.5 + 0.5 * rng(); }
  }
  const out = new Float32Array(n);
  res.forEach((f, k) => D.add(out, D.svf(new Float32Array(imp), c.sr, 'bpq', f * (1 + rng.bi() * 0.04), q), 1 / (1 + k * 0.4)));
  D.mul(out, D.env(n, c.sr, amp.map(([t, v]) => [t * len, v]), 'cos'));
  return norm(out);
}
/** Liquid bubble (rising-pitch damped sine, Minnaert-style). */
function bubble(c, o = {}) {
  const { f = 600, len = 0.08, rise = 2, rng = c.rng } = o;
  const n = c.S(len), fr = new Float32Array(n);
  for (let i = 0; i < n; i++) fr[i] = f * (1 + rise * i / n);
  const x = D.osc(n, c.sr, 'sine', fr, { phase: rng() * 0.1 });
  D.mul(x, D.perc(n, c.sr, 0.001, len));
  return x;
}
/** Simple tone with linear attack/release; f num or breakpoints (exp). */
function beep(c, o = {}) {
  const { f = 1000, len = 0.1, type = 'sine', a = 0.003, r = 0.02, pw = 0.5, lp = 0 } = o;
  const n = c.S(len);
  const x = D.osc(n, c.sr, type, Array.isArray(f) ? D.env(n, c.sr, f, 'exp') : f, { pw });
  if (lp) D.svf(x, c.sr, 'lp', lp);
  D.mul(x, D.env(n, c.sr, [[0, 0], [a, 1], [Math.max(a, len - r), 1], [len, 0]]));
  return x;
}
/** Formant voice wrapper: f0 / amp may be breakpoint arrays (seconds). */
function vox(c, o) {
  const n = c.S(o.len);
  const f0 = Array.isArray(o.f0) ? D.env(n, c.sr, o.f0, 'exp') : o.f0;
  const amp = Array.isArray(o.amp) ? D.env(n, c.sr, o.amp, 'cos') : o.amp;
  const y = D.voice(n, c.sr, o.rng || c.rng, { ...o, f0, amp });
  if (o.drive) D.shape(y, o.drive / (D.peak(y) || 1), o.shape || 'tanh');
  return norm(y);
}
/** Whisper-ish: noise through a formant sequence. */
function breathVox(c, o) { return vox(c, { ...o, src: 'noise', f0: 100 }); }
/** Inside-the-helmet coloration. */
function helmet(c, x, lp = 1900) { const y = D.comb(x, c.sr, 0.0011, 0.35, 0.3); D.svf(y, c.sr, 'lp', lp, 0.9); return norm(y); }
/** Pitch envelope helper: exp decay from f0 to f1 with time constant tau. */
function dropCurve(n, sr, f0, f1, tau) { const f = new Float32Array(n); for (let i = 0; i < n; i++) f[i] = f1 + (f0 - f1) * Math.exp(-i / sr / tau); return f; }
/** Place into mono or stereo destination with equal-power pan. */
function put(c, dst, b, t, g = 1, p = 0) {
  if (!Array.isArray(dst)) return c.place(dst, b, t, g);
  const a = (clamp(p, -1, 1) + 1) * Math.PI / 4;
  c.place(dst[0], b, t, g * Math.cos(a) * Math.SQRT2);
  c.place(dst[1], b, t, g * Math.sin(a) * Math.SQRT2);
}
function stereo(c) { return [c.buf(), c.buf()]; }
/** Coin: pair of bright inharmonic modes. */
function coin(c, o = {}) {
  const { f = c.rng.range(3200, 6500), len = 0.25, t60 = c.rng.range(0.08, 0.22), rng = c.rng } = o;
  return metal(c, { f, len, t60, count: 4, ratios: [1, 1.51, 2.32, 2.9], spread: 0.02, exc: 0.0004, tilt: 0.5, rng });
}

// =====================================================================================
// Instruments (return one note buffer). m = midi, len = gate length (s), v = velocity.
// =====================================================================================
function iKick(c, v = 1) { return D.mul(thud(c, { f0: 170, f1: 48, len: 0.42, drop: 0.03, t60: 0.36, click: 0.35, body: 0.1 }), v); }
function iSnare(c, v = 1) {
  const n = c.S(0.28), x = D.noise(n, c.rng);
  D.band(x, c.sr, 1200, 9000); D.mul(x, D.perc(n, c.sr, 0.001, 0.2));
  const t = D.osc(n, c.sr, 'tri', dropCurve(n, c.sr, 260, 175, 0.02)); D.mul(t, D.perc(n, c.sr, 0.001, 0.09));
  D.add(x, t, 0.8);
  return D.mul(norm(x), v);
}
const HAT_F = [205.3, 304.4, 369.6, 522.7, 540, 800];
function iHat(c, v = 1, open = false) {
  const len = open ? 0.4 : 0.07, n = c.S(len), x = new Float32Array(n);
  for (const f of HAT_F) D.add(x, D.osc(n, c.sr, 'square', f * 1.7, { phase: c.rng() }), 1 / 6);
  D.add(x, D.noise(n, c.rng), 0.6);
  D.svf(x, c.sr, 'hp', 7000); D.svf(x, c.sr, 'lp', 14000);
  D.mul(x, D.perc(n, c.sr, 0.0005, open ? 0.32 : 0.05));
  return D.mul(norm(x), v * 0.7);
}
function iClap(c, v = 1) {
  const n = c.S(0.3), x = new Float32Array(n);
  for (const t of [0, 0.009, 0.018]) D.add(x, nburst(c, { len: 0.012, f: 1300, q: 1.2, t60: 0.01 }), 0.8, c.S(t));
  D.add(x, nburst(c, { len: 0.28, f: 1200, q: 0.9, t60: 0.2 }), 0.6, c.S(0.024));
  return D.mul(norm(x), v);
}
function iDoum(c, v = 1) {
  const x = thud(c, { f0: 190, f1: 105, len: 0.45, drop: 0.02, t60: 0.38, click: 0.2, body: 0.15, lp: 500 });
  return D.mul(x, v);
}
function iTek(c, v = 1, soft = false) {
  const n = c.S(0.15), x = new Float32Array(n);
  D.add(x, nburst(c, { len: 0.03, f: soft ? 2600 : 3200, q: 1, t60: 0.02 }), 0.8);
  D.add(x, click(c, { f: soft ? 750 : 620, q: 9, len: 0.15 }), 0.7);
  D.add(x, click(c, { f: 1850, q: 6, len: 0.08 }), 0.3);
  return D.mul(norm(x), v * (soft ? 0.5 : 1));
}
function iBass(c, m, len, v = 1, o = {}) {
  const f = D.mtof(m), n = c.S(len + 0.06);
  const x = D.osc(n, c.sr, o.type ?? 'saw', f);
  D.add(x, D.osc(n, c.sr, 'square', f, { pw: 0.5 }), o.sq ?? 0.4);
  const c1 = o.cut1 ?? 2200, c0 = o.cut0 ?? 350;
  D.svf(x, c.sr, 'lp', D.env(n, c.sr, [[0, c1], [o.fdec ?? 0.12, c0]], 'exp'), o.q ?? 1.6);
  D.mul(x, D.adsr(n, c.sr, 0.004, 0.25, o.sus ?? 0.65, 0.05, len));
  if (o.drive) sat(x, o.drive);
  return D.mul(norm(x), v);
}
function iChip(c, m, len, v = 1, o = {}) {
  const f = D.mtof(m), rel = o.rel ?? 0.04, n = c.S(len + rel);
  let fr = f;
  if (o.vib) { fr = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / c.sr; fr[i] = f * (1 + o.vib * Math.min(1, Math.max(0, (t - 0.12) * 6)) * Math.sin(TAU * 6 * t)); } }
  const x = D.osc(n, c.sr, o.type ?? 'pulse', fr, { pw: o.pw ?? 0.25 });
  if (o.lp) D.svf(x, c.sr, 'lp', o.lp);
  D.mul(x, D.adsr(n, c.sr, 0.003, o.dec ?? 0.12, o.sus ?? 0.6, rel, len));
  return D.mul(x, v);
}
function iPluck(c, m, len, v = 1, o = {}) {
  const n = c.S(Math.max(len, o.ring ?? 0.8));
  const x = D.pluck(n, c.sr, c.rng, D.mtof(m), { t60: o.t60 ?? 1.2, bright: o.bright ?? 0.7, damp: o.damp ?? 0.5, pick: o.pick });
  D.mul(x, D.env(n, c.sr, [[0, 1], [n / c.sr - 0.03, 1], [n / c.sr, 0]]));
  return D.mul(norm(x), v);
}
/** Music-box tine: fundamental + cantilever 2nd mode (6.27x) + slight 2nd harmonic; detune in cents. */
function iTine(c, m, v = 1, detune = 0, t60 = null) {
  const f = D.mtof(m) * D.cents(detune);
  const T = t60 ?? clamp(2.6 * Math.pow(440 / f, 0.5), 0.6, 3.5);
  const n = c.S(T * 0.9), e = new Float32Array(n); e[0] = 1; e[1] = -0.3;
  const x = D.modal(e, c.sr, [[f, T, 1], [f * 1.0015, T * 0.9, 0.35], [f * 2, T * 0.35, 0.12], [f * 6.27, T * 0.12, 0.35], [f * 17.5, 0.05, 0.1]]);
  D.add(x, click(c, { f: 4200, q: 2, len: 0.01 }), 0.08);
  return D.mul(x, v * 0.7);
}
/** FM electric-piano / bell. ratio 1 = EP, 3.5 = bell. */
function iEP(c, m, len, v = 1, o = {}) {
  const f = D.mtof(m), rel = o.rel ?? 0.6, n = c.S(len + rel);
  const idx = D.env(n, c.sr, [[0, o.i0 ?? 2.2], [0.25, o.i1 ?? 0.4]], 'exp');
  const x = D.fm(n, c.sr, f, o.ratio ?? 1, idx);
  const na = Math.min(n, c.S(0.12)); D.add(x, D.fm(na, c.sr, f * 1.002, 14, D.perc(na, c.sr, 0.001, 0.08)), 0.15);
  D.mul(x, D.adsr(n, c.sr, 0.003, o.dec ?? 1.2, o.sus ?? 0.3, rel, len));
  return D.mul(x, v * 0.8);
}
/** Render a dark (low-passed) voice at sr/k and upsample — pads/strings are band-limited anyway. */
function subRate(c, total, k, fn) {
  const sr2 = c.sr / k, n2 = Math.ceil(total * sr2) + 2;
  return D.upsample(fn(n2, sr2), k, c.S(total));
}
function iPad(c, m, len, v = 1, o = {}) {
  const ms = Array.isArray(m) ? m : [m], rel = o.rel ?? 2.5, cut = o.cut ?? 900;
  const x = subRate(c, len + rel, cut < 1200 ? 4 : 2, (n, sr) => {
    const y = new Float32Array(n);
    for (const mm of ms) D.add(y, D.supersaw(n, sr, D.mtof(mm), o.voices ?? 5, o.detune ?? 14, c.rng));
    D.svf(y, sr, 'lp', cut, 0.8);
    return D.mul(y, D.adsr(n, sr, o.att ?? 1.5, 1, 0.85, rel, len));
  });
  return D.mul(x, v * 0.5);
}
function iStrings(c, m, len, v = 1, o = {}) {
  const f = D.mtof(m), rel = o.rel ?? 0.25, vr = o.vr ?? 5.6, vd = o.vd ?? 0.008;
  const x = subRate(c, len + rel, 2, (n, sr) => {
    const fr = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; fr[i] = f * (1 + vd * Math.min(1, t * 3) * D.sinp(vr * t)); }
    const y = D.supersaw(n, sr, fr, 3, o.detune ?? 9, c.rng);
    D.svf(y, sr, 'lp', o.cut ?? 2600, 0.7);
    D.svf(y, sr, 'hp', 180);
    return D.mul(y, D.adsr(n, sr, o.att ?? 0.06, 0.3, 0.85, rel, len));
  });
  return D.mul(x, v * 0.6);
}
function iSaw(c, m, len, v = 1, o = {}) {
  const f = D.mtof(m), rel = o.rel ?? 0.08, n = c.S(len + rel);
  const x = D.supersaw(n, c.sr, f, o.voices ?? 7, o.detune ?? 22, c.rng);
  D.svf(x, c.sr, 'lp', D.env(n, c.sr, [[0, o.c1 ?? 7000], [0.2, o.c0 ?? 3500]], 'exp'), 0.9);
  D.mul(x, D.adsr(n, c.sr, 0.005, 0.2, o.sus ?? 0.75, rel, len));
  return D.mul(x, v * 0.6);
}

/**
 * Step sequencer: places parsed steps (see D.parseSteps) with instrument inst(c, midi, len, vel, sym).
 * dst mono buffer or [L, R]. o: t0, g (gain), pan, swing (fraction of step on odd steps), hum (s random).
 */
function seq(c, dst, str, step, inst, o = {}) {
  const ev = D.parseSteps(str);
  const t0 = o.t0 ?? 0, g = o.g ?? 1, sw = o.swing ?? 0, hum = o.hum ?? 0;
  const memo = o.cache === false ? null : new Map(); // identical notes render once (like a sampler)
  for (const e of ev) {
    const t = t0 + e.step * step + (e.step % 2 ? sw * step : 0) + (hum ? c.rng.bi() * hum : 0);
    const notes = e.notes.length ? e.notes : [null];
    for (const m of notes) {
      const key = `${m}|${e.len}|${e.vel}|${e.sym}`;
      let b = memo && memo.get(key);
      if (!b) { b = inst(c, m, e.len * step, e.vel, e.sym); if (memo && b) memo.set(key, b); }
      if (b) put(c, dst, b, t, g, typeof o.pan === 'function' ? o.pan(m) : (o.pan ?? 0));
    }
  }
  return ev.total * step;
}

// =====================================================================================
// UI
// =====================================================================================
CAT = 'ui';
def('ui_click', { dur: 0.08, vol: 0.5 }, c => {
  const o = c.buf();
  c.place(o, click(c, { f: 2900, q: 6, len: 0.03 }), 0, 1);
  c.place(o, click(c, { f: 1700, q: 4, len: 0.025 }), 0.011, 0.55);
  const b = beep(c, { f: 420, len: 0.035, a: 0.001, r: 0.03 }); c.place(o, b, 0, 0.3);
  return o;
});
def('ui_hover', { dur: 0.06, vol: 0.25 }, c => {
  const o = c.buf();
  const b = beep(c, { f: [[0, 2700], [0.03, 2350]], len: 0.035, a: 0.001, r: 0.032 });
  c.place(o, b, 0, 0.7);
  c.place(o, click(c, { f: 5200, q: 3, len: 0.01 }), 0, 0.25);
  return o;
});
def('ui_confirm', { dur: 0.3, vol: 0.55 }, c => {
  const o = c.buf();
  const a = beep(c, { f: 880, len: 0.07, type: 'pulse', pw: 0.25, r: 0.01, lp: 3800 });
  const b = beep(c, { f: 1320, len: 0.17, type: 'pulse', pw: 0.25, r: 0.1, lp: 3800 });
  c.place(o, a, 0, 0.6); c.place(o, b, 0.07, 0.6);
  c.place(o, beep(c, { f: 660, len: 0.24, type: 'tri', r: 0.15 }), 0, 0.35);
  D.crush(o, 7, 1);
  return o;
});
def('ui_error', { dur: 0.38, vol: 0.55 }, c => {
  const o = c.buf();
  for (const [t, len, f1] of [[0, 0.12, 150], [0.16, 0.18, 128]]) {
    const n = c.S(len), fr = D.ramp(n, 150, f1, true);
    const x = D.osc(n, c.sr, 'square', fr); D.add(x, D.osc(n, c.sr, 'saw', D.mul(D.clone(fr), 1.047)), 0.7);
    D.svf(x, c.sr, 'lp', 1700, 1.2);
    D.mul(x, D.env(n, c.sr, [[0, 0], [0.004, 1], [len - 0.02, 0.9], [len, 0]]));
    c.place(o, x, t, 1);
  }
  sat(o, 1.5);
  return o;
});
def('ui_buy', { dur: 0.75, vol: 0.6 }, c => {
  const o = c.buf();
  c.place(o, click(c, { f: 1500, q: 3, len: 0.03 }), 0, 0.6);
  c.place(o, click(c, { f: 2100, q: 3, len: 0.03 }), 0.028, 0.5);
  c.place(o, hiss(c, { len: 0.1, lo: 1800, hi: 9000, a: 0.004, r: 0.08 }), 0.005, 0.45);   // "cha"
  const e = new Float32Array(c.S(0.7)); e[0] = 1;
  const f = 2093;
  const bell = D.modal(e, c.sr, [[f, 0.65, 1], [f * 1.003, 0.6, 0.5], [f * 2.02, 0.4, 0.45], [f * 2.74, 0.35, 0.4], [f * 4.18, 0.2, 0.2], [f * 5.6, 0.12, 0.1]]);
  c.place(o, bell, 0.07, 0.9);                                                               // "ching"
  for (let k = 0; k < 5; k++) c.place(o, coin(c, { len: 0.15 }), 0.12 + k * 0.05 + c.rng() * 0.03, 0.25 * (1 - k * 0.12));
  return o;
});
def('ui_levelup', { dur: 1.6, vol: 0.6 }, c => {
  const o = stereo(c);
  const lead = (m, len, v, o2) => iChip(c, m, len, v, { pw: 0.25, lp: 6000, ...o2 });
  const notes = [[72, 0], [76, 0.07], [79, 0.14], [84, 0.21], [79, 0.28]];
  for (const [m, t] of notes) put(c, o, lead(m, 0.065, 0.6), t, 1, -0.15);
  put(c, o, lead(84, 0.75, 0.7, { vib: 0.012, sus: 0.7, rel: 0.25 }), 0.35, 1, 0);
  put(c, o, lead(88, 0.7, 0.35, { pw: 0.5, vib: 0.01, rel: 0.25 }), 0.35, 1, 0.3);
  for (const [m, t, l] of [[48, 0, 0.14], [55, 0.14, 0.14], [60, 0.28, 0.9]]) put(c, o, iChip(c, m, l, 0.5, { type: 'tri', sus: 0.9, rel: 0.2 }), t, 1, 0);
  for (let k = 0; k < 7; k++) put(c, o, beep(c, { f: c.rng.range(2500, 5000), len: 0.06, r: 0.05 }), 0.35 + k * 0.08, 0.12, c.rng.bi() * 0.8);
  // short slap echo on the right for width
  o[1] = D.echo(o[1], c.sr, 0.11, 0.25, 0.25);
  return o;
});
def('ui_quota_met', { dur: 2.2, vol: 0.6 }, c => {
  const o = c.buf();
  const vib = (m, v, t60) => { const x = iTine(c, m, v, 0, t60); return x; };
  c.place(o, vib(72, 0.8, 1.6), 0, 1);
  c.place(o, vib(76, 0.8, 1.6), 0.24, 1);
  c.place(o, vib(79, 0.8, 1.8), 0.48, 1);
  // corporate-creepy tail: soft tritone underneath + a flat high note
  c.place(o, iEP(c, 60, 1.0, 0.45, { rel: 0.5 }), 0.85, 1);
  c.place(o, iEP(c, 66, 1.0, 0.3, { rel: 0.5 }), 0.85, 1);
  c.place(o, iTine(c, 84, 0.5, -35, 1.5), 0.86, 1);
  // tape wobble
  const n = c.N, ratio = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / c.sr; ratio[i] = 1 + 0.006 * Math.sin(TAU * 2.7 * t) * Math.min(1, t * 1.5) - 0.0015 * t; }
  const w = D.resample(o, ratio, n);
  return D.reverb(w, c.sr, { room: 0.55, wet: 0.18, damp: 0.5 });
});
def('ui_fired', { dur: 2.8, vol: 0.7 }, c => {
  const o = c.buf();
  for (const t of [0, 0.42, 0.84]) {
    const len = 0.36, n = c.S(len);
    const f = D.env(n, c.sr, [[0, 200], [0.07, 430], [0.3, 420], [len, 360]], 'exp');
    const x = D.osc(n, c.sr, 'saw', f); D.add(x, D.osc(n, c.sr, 'square', D.mul(D.clone(f), 0.5)), 0.6);
    D.svf(x, c.sr, 'bpq', 900, 1.2); sat(x, 4);
    D.svf(x, c.sr, 'hp', 300);
    D.mul(x, D.env(n, c.sr, [[0, 0], [0.01, 1], [len - 0.04, 1], [len, 0]]));
    c.place(o, x, t, 0.8);
  }
  // descending "you're done" tone
  const len = 1.5, n = c.S(len);
  const f = D.env(n, c.sr, [[0, 620], [len, 70]], 'exp');
  for (let i = 0; i < n; i++) f[i] *= 1 + 0.05 * Math.sin(TAU * 5 * i / c.sr);
  const x = D.osc(n, c.sr, 'square', f, { pw: 0.35 }); D.add(x, D.osc(n, c.sr, 'sine', f), 0.8);
  D.svf(x, c.sr, 'lp', 1800);
  D.mul(x, D.env(n, c.sr, [[0, 0], [0.03, 1], [1.0, 0.8], [len, 0]]));
  c.place(o, x, 1.25, 0.8);
  return o;
});
def('ui_chat', { dur: 0.1, vol: 0.4 }, c => {
  const o = c.buf();
  c.place(o, beep(c, { f: [[0, 1000], [0.03, 1400]], len: 0.07, a: 0.002, r: 0.05 }), 0, 0.8);
  c.place(o, beep(c, { f: [[0, 500], [0.03, 700]], len: 0.06, type: 'tri', r: 0.04 }), 0, 0.3);
  return o;
});
def('ui_scan', { dur: 1.3, vol: 0.6 }, c => {
  const L = c.buf(), R = c.buf();
  const sweep = beep(c, { f: [[0, 300], [0.12, 2400]], len: 0.13, a: 0.01, r: 0.03 });
  c.place(L, sweep, 0, 0.35); c.place(R, sweep, 0, 0.35);
  const sw = whoosh(c, { len: 0.35, f0: 500, f1: 6000, f2: 3000, q: 2.5, peakAt: 0.6, color: 'white' });
  c.place(L, sw, 0, 0.25); c.place(R, sw, 0.004, 0.25);
  const n = c.S(1.1), e = new Float32Array(n); e[0] = 1;
  const ping = D.modal(e, c.sr, [[1568, 0.9, 1], [3136, 0.4, 0.25], [4704, 0.2, 0.08], [1571, 0.9, 0.5]]);
  c.place(L, ping, 0.1, 0.8); c.place(R, ping, 0.1, 0.8);
  c.place(R, ping, 0.29, 0.4); c.place(L, ping, 0.48, 0.2); c.place(R, ping, 0.67, 0.1);
  const th = thud(c, { f0: 160, f1: 70, len: 0.2, click: 0, body: 0 }); c.place(L, th, 0.1, 0.3); c.place(R, th, 0.1, 0.3);
  return [L, R];
});
def('ui_notify', { dur: 0.5, vol: 0.5 }, c => {
  const o = c.buf();
  const n = c.S(0.45), e = new Float32Array(n); e[0] = 1;
  for (const [f, t] of [[880, 0], [1318.5, 0.1]]) c.place(o, D.modal(e, c.sr, [[f, 0.4, 1], [f * 2, 0.15, 0.2], [f * 3.01, 0.08, 0.08]]), t, 0.8);
  return o;
});

// =====================================================================================
// PLAYER
// =====================================================================================
CAT = 'player';
function stepMetal(c, v) {
  const o = c.buf(), r = c.rng;
  const f = 170 * (1 + (v - 2.5) * 0.07) * r.range(0.95, 1.05);
  c.place(o, metal(c, { f, count: 12, t60: 0.22, bright: 0.75, spread: 0.12, len: 0.4 }), 0, 0.7);
  c.place(o, metal(c, { f: f * r.range(1.3, 1.6), count: 8, t60: 0.14, bright: 0.8, spread: 0.12, len: 0.3 }), r.range(0.03, 0.05), 0.45);
  c.place(o, thud(c, { f0: 115, f1: 60, len: 0.14, click: 0.1, body: 0.3 }), 0, 0.55);
  for (let k = 0; k < 4; k++) c.place(o, click(c, { f: r.range(1800, 4200), q: 8, len: 0.02 }), 0.008 + k * r.range(0.012, 0.022), 0.25 * (1 - k * 0.2));
  c.place(o, nburst(c, { len: 0.03, type: 'hp', f: 3000, t60: 0.02 }), 0, 0.12);
  return o;
}
function stepConcrete(c, v) {
  const o = c.buf(), r = c.rng;
  c.place(o, thud(c, { f0: 125 + v * 6, f1: 55, len: 0.12, drop: 0.02, t60: 0.08, click: 0.2, body: 0.5, lp: 500 }), 0, 0.75);
  c.place(o, nburst(c, { len: 0.06, f: r.range(2000, 3000), q: 0.8, t60: 0.04 }), 0.002, 0.35);
  const n = c.S(0.07), g = D.dust(n, c.sr, r, 1400); D.svf(g, c.sr, 'bp', 4200, 1); D.mul(g, D.perc(n, c.sr, 0.002, 0.06));
  c.place(o, norm(g), 0.004, 0.25);
  c.place(o, nburst(c, { len: 0.05, f: r.range(1500, 2400), q: 1, t60: 0.035 }), r.range(0.028, 0.04), 0.18);
  return D.svf(o, c.sr, 'lp', 7000);
}
function stepGrass(c, v) {
  const o = c.buf(), r = c.rng;
  for (const [t, len, g] of [[0, 0.18, 1], [r.range(0.06, 0.09), 0.12, 0.5]]) {
    const n = c.S(len), x = D.dust(n, c.sr, r, 3500);
    D.add(x, D.noise(n, r), 0.15);
    D.band(x, c.sr, 2200 + v * 150, 9000);
    D.mul(x, D.env(n, c.sr, [[0, 0], [0.012, 1], [len, 0]]));
    c.place(o, norm(x), t, g * 0.6);
  }
  c.place(o, thud(c, { f0: 95, f1: 50, len: 0.1, t60: 0.07, click: 0, body: 0.4 }), 0, 0.45);
  return o;
}
function stepWood(c, v) {
  const o = c.buf(), r = c.rng;
  const f = 150 * (1 + (v - 2.5) * 0.06);
  c.place(o, wood(c, { f, t60: 0.13, len: 0.3 }), 0, 0.7);
  c.place(o, thud(c, { f0: 115, f1: 60, len: 0.12, t60: 0.1, click: 0.15, body: 0.3 }), 0, 0.6);
  c.place(o, wood(c, { f: f * 1.7, t60: 0.06, len: 0.1 }), r.range(0.03, 0.045), 0.35);
  c.place(o, nburst(c, { len: 0.05, f: 1800, q: 1, t60: 0.03 }), 0.004, 0.15);
  if (v % 2 === 0) c.place(o, creak(c, { len: 0.16, rate: [[0, 70], [1, 110]], res: [700, 1300, 2100], q: 14 }), 0.03, 0.18);
  return o;
}
function stepSnow(c, v) {
  const o = c.buf(), r = c.rng;
  const len = 0.26, n = c.S(len);
  const x = D.dust(n, c.sr, r, 7000);
  const rough = D.smoothNoise(n, c.sr, r, 90);
  for (let i = 0; i < n; i++) x[i] *= 0.3 + Math.abs(rough[i]);
  D.band(x, c.sr, 1200 + v * 100, 6000);
  const sq = D.svf(new Float32Array(x), c.sr, 'bpq', 1100 + v * 120, 12);
  D.add(x, norm(sq), 0.2);
  D.mul(x, D.env(n, c.sr, [[0, 0], [0.025, 1], [0.08, 0.8], [len, 0]]));
  c.place(o, norm(x), 0, 0.8);
  c.place(o, thud(c, { f0: 85, f1: 45, len: 0.1, t60: 0.08, click: 0, body: 0.5 }), 0, 0.45);
  return o;
}
function stepMud(c, v) {
  const o = c.buf(), r = c.rng;
  const len = 0.22, n = c.S(len), x = D.noise(n, r, 'pink');
  D.svf(x, c.sr, 'bpq', D.env(n, c.sr, [[0, 250 + v * 30], [0.15, 900], [len, 600]], 'exp'), 5);
  D.mul(x, D.env(n, c.sr, [[0, 0], [0.01, 1], [len, 0]]));
  c.place(o, norm(x), 0, 0.6);
  c.place(o, thud(c, { f0: 100, f1: 50, len: 0.14, t60: 0.1, click: 0, body: 0.6, lp: 700 }), 0, 0.6);
  c.place(o, bubble(c, { f: 380 + v * 40, len: 0.06, rise: 1.6 }), r.range(0.16, 0.22), 0.45);
  for (let k = 0; k < 3; k++) c.place(o, bubble(c, { f: r.range(500, 1100), len: 0.03, rise: 2 }), r.range(0.05, 0.3), 0.15);
  return D.svf(o, c.sr, 'lp', 4000);
}
for (let v = 1; v <= 4; v++) {
  def(`step_metal_${v}`, { dur: 0.3, vol: 0.5 }, c => stepMetal(c, v));
  def(`step_concrete_${v}`, { dur: 0.25, vol: 0.45 }, c => stepConcrete(c, v));
  def(`step_grass_${v}`, { dur: 0.3, vol: 0.4 }, c => stepGrass(c, v));
  def(`step_wood_${v}`, { dur: 0.32, vol: 0.5 }, c => stepWood(c, v));
}
for (let v = 1; v <= 3; v++) {
  def(`step_snow_${v}`, { dur: 0.32, vol: 0.45 }, c => stepSnow(c, v));
  def(`step_mud_${v}`, { dur: 0.4, vol: 0.45 }, c => stepMud(c, v));
}
// --- extra surfaces (game feel pass): carpet, tile, gravel, shallow water, ladder-ish metal grate
function stepCarpet(c, v) {
  const o = c.buf(), r = c.rng;
  // soft, muffled: a padded low thump + a brushed fibre scuff
  c.place(o, thud(c, { f0: 90 + v * 4, f1: 45, len: 0.12, t60: 0.07, click: 0, body: 0.55, lp: 260 }), 0, 0.8);
  const n = c.S(0.09), x = D.noise(n, r, 'pink');
  D.band(x, c.sr, 500 + v * 60, 2600);
  D.mul(x, D.env(n, c.sr, [[0, 0], [0.012, 1], [0.09, 0]]));
  c.place(o, norm(x), 0.004, 0.22);
  c.place(o, nburst(c, { len: 0.05, color: 'pink', f: 1200, q: 0.7, t60: 0.04 }), r.range(0.03, 0.05), 0.08);
  return D.svf(o, c.sr, 'lp', 2400);
}
function stepTile(c, v) {
  const o = c.buf(), r = c.rng;
  // hard heel click on ceramic + a small bright ring
  c.place(o, click(c, { f: 2400 + v * 180, q: 6, len: 0.035 }), 0, 0.55);
  c.place(o, thud(c, { f0: 150 + v * 5, f1: 70, len: 0.1, t60: 0.06, click: 0.3, body: 0.35, lp: 700 }), 0, 0.6);
  c.place(o, metal(c, { f: 900 + v * 70, count: 5, t60: 0.05, bright: 0.9, len: 0.09 }), 0.002, 0.14);
  c.place(o, click(c, { f: r.range(3200, 4200), q: 5, len: 0.02 }), r.range(0.035, 0.05), 0.25);
  return o;
}
function stepGravel(c, v) {
  const o = c.buf(), r = c.rng;
  // many tiny stone clicks over a crunchy noise bed
  const len = 0.24, n = c.S(len), x = D.dust(n, c.sr, r, 2600);
  D.band(x, c.sr, 1400 + v * 120, 7000);
  D.mul(x, D.env(n, c.sr, [[0, 0], [0.012, 1], [0.07, 0.6], [len, 0]]));
  c.place(o, norm(x), 0, 0.5);
  for (let k = 0; k < 9; k++) c.place(o, click(c, { f: r.range(1600, 5200), q: r.range(3, 8), len: 0.015 }), r.range(0, 0.13), r.range(0.12, 0.3));
  c.place(o, thud(c, { f0: 105, f1: 50, len: 0.1, t60: 0.07, click: 0, body: 0.4 }), 0, 0.45);
  return o;
}
function stepWater(c, v) {
  const o = c.buf(), r = c.rng;
  // ankle-deep slosh: filtered noise swell + a few bubbles and droplets
  const len = 0.34, n = c.S(len), x = D.noise(n, r, 'pink');
  D.svf(x, c.sr, 'bpq', D.env(n, c.sr, [[0, 380 + v * 40], [0.08, 1300], [len, 700]], 'exp'), 2.2);
  D.mul(x, D.env(n, c.sr, [[0, 0], [0.02, 1], [0.12, 0.55], [len, 0]]));
  c.place(o, norm(x), 0, 0.7);
  c.place(o, thud(c, { f0: 95, f1: 55, len: 0.12, t60: 0.08, click: 0, body: 0.5, lp: 500 }), 0, 0.35);
  for (let k = 0; k < 4; k++) c.place(o, bubble(c, { f: r.range(450, 1300), len: r.range(0.03, 0.06), rise: r.range(1.2, 2.4) }), r.range(0.04, 0.26), r.range(0.1, 0.25));
  return D.svf(o, c.sr, 'lp', 5200);
}
for (let v = 1; v <= 4; v++) {
  def(`step_carpet_${v}`, { dur: 0.22, vol: 0.38 }, c => stepCarpet(c, v));
  def(`step_tile_${v}`, { dur: 0.25, vol: 0.45 }, c => stepTile(c, v));
  def(`step_gravel_${v}`, { dur: 0.3, vol: 0.45 }, c => stepGravel(c, v));
}
for (let v = 1; v <= 3; v++) def(`step_water_${v}`, { dur: 0.4, vol: 0.5 }, c => stepWater(c, v));
// crouch / stand: suit fabric rustle + a gear rattle
def('cloth_rustle', { dur: 0.3, vol: 0.35 }, c => {
  const o = c.buf(), r = c.rng;
  const n = c.S(0.26), x = D.dust(n, c.sr, r, 5200);
  D.add(x, D.noise(n, r, 'pink'), 0.3);
  D.band(x, c.sr, 900, 6000);
  D.mul(x, D.env(n, c.sr, [[0, 0], [0.05, 1], [0.12, 0.5], [0.26, 0]], 'cos'));
  c.place(o, norm(x), 0, 0.7);
  for (let k = 0; k < 3; k++) c.place(o, metal(c, { f: r.range(1600, 2800), count: 4, t60: 0.03, len: 0.05 }), r.range(0.02, 0.15), 0.12);
  return o;
});
// heavy-carry effort: slow strained breaths with a grunt on the exhale (loop)
def('breath_heavy', { dur: 3.6, loop: true, vol: 0.42, warm: 0.2, xf: 0.08 }, c => {
  const o = c.buf(), r = c.rng;
  for (let k = 0; k < 2; k++) {
    const t = k * 1.8 + r.range(-0.04, 0.04), s = r.range(0.95, 1.08);
    const inh = breathVox(c, { len: 0.5 * s, vowels: [[0, 'uh'], [0.45, 'o']], scale: 1.0, amp: [[0, 0], [0.35 * s, 1], [0.5 * s, 0]] });
    c.place(o, inh, Math.max(0, t), 0.4);
    const exh = vox(c, { len: 0.62 * s, f0: [[0, 118], [0.25, 104], [0.62, 86]], src: 'saw', breath: 0.7, fry: 0.55, jitter: 0.05, vowels: [[0, 'uh'], [0.3, 'a'], [0.62, 'uh']], amp: [[0, 0], [0.05, 1], [0.3, 0.75], [0.62 * s, 0]], drive: 1.3 });
    c.place(o, exh, Math.max(0, t + 0.62 * s), 0.7);
  }
  return helmet(c, o, 2600);
});
// scan label blip (one per label, pitched up in sequence)
def('scan_blip', { dur: 0.16, vol: 0.4 }, c => {
  const o = c.buf();
  c.place(o, beep(c, { f: [[0, 1850], [0.05, 2350]], len: 0.07, a: 0.002, r: 0.04 }), 0, 0.5);
  c.place(o, beep(c, { f: 3520, len: 0.1, a: 0.002, r: 0.08 }), 0.02, 0.18);
  c.place(o, click(c, { f: 4200, q: 6, len: 0.015 }), 0, 0.25);
  return o;
});
// weapon impacts on walls / hard surfaces: a dull clank with grit (used by the view model impact)
def('hit_wall', { dur: 0.4, vol: 0.55 }, c => {
  const o = c.buf(), r = c.rng;
  c.place(o, thud(c, { f0: 170, f1: 70, len: 0.2, t60: 0.1, click: 0.4, body: 0.5, lp: 900 }), 0, 0.8);
  c.place(o, metal(c, { f: r.range(700, 900), count: 8, t60: 0.14, bright: 0.6, len: 0.3 }), 0.002, 0.35);
  const g = nburst(c, { len: 0.12, f: 2600, q: 0.6, t60: 0.09 }); c.place(o, g, 0.006, 0.3);
  for (let k = 0; k < 6; k++) c.place(o, click(c, { f: r.range(2500, 6000), q: 4, len: 0.012 }), r.range(0.02, 0.2), r.range(0.08, 0.2));
  return o;
});
def('jump', { dur: 0.42, vol: 0.5 }, c => {
  const o = c.buf();
  c.place(o, whoosh(c, { len: 0.28, f0: 700, f1: 2600, f2: 1100, q: 1.2 }), 0.02, 0.45);
  c.place(o, helmet(c, breathVox(c, { len: 0.16, vowels: [[0, 'uh'], [0.16, 'a']], amp: [[0, 0], [0.02, 1], [0.16, 0]], scale: 1.05 })), 0.01, 0.55);
  c.place(o, nburst(c, { len: 0.05, f: 2200, q: 0.8, t60: 0.035 }), 0, 0.3);
  for (let k = 0; k < 3; k++) c.place(o, metal(c, { f: c.rng.range(1800, 3000), count: 4, t60: 0.04, len: 0.06 }), 0.03 + k * 0.03, 0.12);
  return o;
});
def('land_soft', { dur: 0.35, vol: 0.5 }, c => {
  const o = c.buf();
  c.place(o, thud(c, { f0: 105, f1: 48, len: 0.25, t60: 0.14, click: 0.1, body: 0.5 }), 0, 0.8);
  c.place(o, nburst(c, { len: 0.12, f: 1500, q: 0.7, t60: 0.1, color: 'pink' }), 0.005, 0.3);
  c.place(o, metal(c, { f: 1400, count: 5, t60: 0.05, len: 0.08 }), 0.02, 0.1);
  return o;
});
def('land_hard', { dur: 0.5, vol: 0.7 }, c => {
  const o = c.buf(), r = c.rng;
  c.place(o, thud(c, { f0: 135, f1: 38, len: 0.6, drop: 0.05, t60: 0.4, click: 0.25, body: 0.7, lp: 400 }), 0, 1);
  for (let k = 0; k < 6; k++) {
    const b = click(c, { f: r.range(1300, 4200), q: r.range(1.5, 4), len: 0.012 });
    sat(b, 3, 'hard'); c.place(o, b, 0.008 + k * r.range(0.004, 0.009), 0.5 * r.range(0.6, 1));
  }
  const cr = nburst(c, { len: 0.05, f: 1200, q: 0.6, t60: 0.04 }); sat(cr, 4); c.place(o, norm(cr), 0.01, 0.3);
  c.place(o, helmet(c, vox(c, { len: 0.28, f0: [[0, 150], [0.2, 95]], vowels: [[0, 'uh'], [0.28, 'uh']], breath: 0.45, fry: 0.4, jitter: 0.04, amp: [[0, 0], [0.02, 1], [0.28, 0]] }), 1600), 0.03, 0.45);
  for (let k = 0; k < 4; k++) c.place(o, metal(c, { f: r.range(900, 2400), count: 5, t60: 0.07, len: 0.1 }), 0.01 + r() * 0.12, 0.12);
  return o;
});
const HURT = [
  { f0: [[0, 175], [0.06, 195], [0.35, 120]], vw: [[0, 'uh'], [0.1, 'a'], [0.35, 'uh']] },
  { f0: [[0, 210], [0.05, 235], [0.3, 150]], vw: [[0, 'e'], [0.12, 'ae'], [0.3, 'uh']] },
  { f0: [[0, 150], [0.08, 170], [0.4, 105]], vw: [[0, 'o'], [0.15, 'uh'], [0.4, 'o']] },
];
HURT.forEach((h, k) => def(`hurt_${k + 1}`, { dur: 0.5, vol: 0.7 }, c => {
  const o = c.buf();
  const len = 0.4;
  const v = vox(c, { len, f0: h.f0, vowels: h.vw, breath: 0.35, fry: 0.25 + k * 0.1, jitter: 0.04, amp: [[0, 0], [0.02, 1], [0.12, 0.9], [len, 0]], drive: 1.4 });
  c.place(o, helmet(c, v, 1800), 0.015, 0.9);
  c.place(o, thud(c, { f0: 120, f1: 60, len: 0.12, click: 0.1, body: 0.4 }), 0, 0.35);
  return o;
}));
def('death', { dur: 2.3, vol: 0.8 }, c => {
  const o = c.buf(), r = c.rng;
  c.place(o, metal(c, { f: 230, count: 14, t60: 0.35, spread: 0.2, bright: 0.5, len: 0.6, exc: 0.006 }), 0, 0.55);
  c.place(o, thud(c, { f0: 140, f1: 45, len: 0.5, t60: 0.3, click: 0.3, body: 0.6 }), 0, 0.8);
  for (let k = 0; k < 9; k++) { const b = click(c, { f: r.range(1200, 4500), q: 2, len: 0.012 }); sat(b, 3, 'hard'); c.place(o, b, k * r.range(0.004, 0.012), 0.45); }
  const cry = vox(c, { len: 0.75, f0: [[0, 230], [0.14, 330], [0.45, 290], [0.75, 140]], vowels: [[0, 'a'], [0.45, 'a'], [0.75, 'o']], breath: 0.3, fry: 0.2, jitter: 0.05, vib: [6, 0.02], amp: [[0, 0], [0.03, 1], [0.5, 0.9], [0.66, 0.4], [0.75, 0]], drive: 1.6 });
  c.place(o, helmet(c, cry, 1500), 0.05, 0.75);
  c.place(o, hiss(c, { len: 1.9, lo: 2500, hi: 9000, a: 0.01, r: 1.6, flutter: 0.3, frate: 18 }), 0.35, 0.35);
  c.place(o, thud(c, { f0: 95, f1: 40, len: 0.5, t60: 0.35, click: 0.15, body: 0.6 }), 0.62, 0.55);
  c.place(o, metal(c, { f: 700, count: 6, t60: 0.1, len: 0.2 }), 0.64, 0.2);
  return o;
});
def('breath_tired', { dur: 3.0, loop: true, vol: 0.45, warm: 0.2, xf: 0.08 }, c => {
  const o = c.buf(), r = c.rng;
  for (let k = 0; k < 4; k++) {
    const t = k * 0.75 + r.range(-0.03, 0.03), s = r.range(0.9, 1.1);
    const inh = breathVox(c, { len: 0.32 * s, vowels: [[0, 'uh'], [0.3, 'a']], scale: 1.05, amp: [[0, 0], [0.22 * s, 1], [0.32 * s, 0]] });
    c.place(o, inh, Math.max(0, t), 0.45);
    const exh = vox(c, { len: 0.38 * s, f0: [[0, 120], [0.38, 95]], src: 'saw', breath: 0.85, fry: 0.3, vowels: [[0, 'a'], [0.38, 'uh']], amp: [[0, 0], [0.04, 1], [0.38 * s, 0]] });
    c.place(o, exh, Math.max(0, t + 0.36 * s), 0.8);
  }
  return helmet(c, o, 3200);
});
def('heartbeat', { dur: 0.65, vol: 0.7 }, c => {
  const o = c.buf();
  c.place(o, thud(c, { f0: 75, f1: 42, len: 0.28, drop: 0.04, t60: 0.2, click: 0, body: 0.5, lp: 200 }), 0, 1);
  c.place(o, thud(c, { f0: 68, f1: 38, len: 0.3, drop: 0.04, t60: 0.22, click: 0, body: 0.5, lp: 180 }), 0.27, 0.72);
  for (const [t, g] of [[0, 0.3], [0.27, 0.22]]) c.place(o, nburst(c, { len: 0.08, color: 'pink', f: 160, q: 1.2, t60: 0.06 }), t, g);
  return D.svf(o, c.sr, 'lp', 520);
});
def('swing_whoosh', { dur: 0.45, vol: 0.55 }, c => {
  const o = c.buf();
  c.place(o, whoosh(c, { len: 0.4, f0: 400, f1: 1900, f2: 500, q: 1.4, peakAt: 0.42 }), 0, 0.8);
  const n = c.S(0.4), lo = D.noise(n, c.rng, 'brown'); D.svf(lo, c.sr, 'lp', 350);
  D.mul(lo, D.env(n, c.sr, [[0, 0], [0.17, 1], [0.4, 0]], 'cos'));
  c.place(o, norm(lo), 0, 0.4);
  return o;
});
def('hit_flesh', { dur: 0.3, vol: 0.7 }, c => {
  const o = c.buf();
  c.place(o, thud(c, { f0: 115, f1: 50, len: 0.3, t60: 0.16, click: 0.1, body: 0.5 }), 0, 0.85);
  c.place(o, nburst(c, { len: 0.05, f: 1200, q: 1, t60: 0.03 }), 0, 0.7);
  c.place(o, nburst(c, { len: 0.18, f: 900, f2: 280, q: 5, t60: 0.15, color: 'pink' }), 0.004, 0.45);
  c.place(o, click(c, { f: 3000, q: 2, len: 0.01 }), 0, 0.3);
  return o;
});
def('hit_metal', { dur: 0.8, vol: 0.7 }, c => {
  const o = c.buf();
  c.place(o, metal(c, { f: 330, count: 14, t60: 0.95, bright: 0.9, spread: 0.05, len: 0.8 }), 0, 1);
  c.place(o, thud(c, { f0: 160, f1: 80, len: 0.15, click: 0.3, body: 0.2 }), 0, 0.4);
  c.place(o, click(c, { f: 4500, q: 2, len: 0.01 }), 0, 0.4);
  return o;
});
def('item_pickup', { dur: 0.25, vol: 0.5 }, c => {
  const o = c.buf();
  c.place(o, nburst(c, { len: 0.07, f: 2500, q: 0.8, t60: 0.06, color: 'pink' }), 0, 0.45);
  c.place(o, metal(c, { f: 1800, count: 5, t60: 0.1, len: 0.15 }), 0.02, 0.4);
  c.place(o, thud(c, { f0: 220, f1: 150, len: 0.06, click: 0, body: 0 }), 0.015, 0.3);
  return o;
});
def('item_drop', { dur: 0.45, vol: 0.6 }, c => {
  const o = c.buf(), r = c.rng;
  c.place(o, thud(c, { f0: 160, f1: 70, len: 0.14, t60: 0.1, click: 0.2, body: 0.4 }), 0, 0.8);
  let t = 0, g = 0.7;
  for (let k = 0; k < 3; k++) {
    c.place(o, wood(c, { f: r.range(380, 700), t60: 0.07, len: 0.12 }), t, g);
    c.place(o, metal(c, { f: r.range(900, 1600), count: 5, t60: 0.08, len: 0.12 }), t + 0.002, g * 0.4);
    t += 0.14 - k * 0.035; g *= 0.5;
  }
  return o;
});
def('item_throw', { dur: 0.4, vol: 0.5 }, c => {
  const o = c.buf();
  c.place(o, whoosh(c, { len: 0.3, f0: 600, f1: 2600, f2: 900, q: 1.3, peakAt: 0.35 }), 0.02, 0.7);
  c.place(o, helmet(c, breathVox(c, { len: 0.13, vowels: [[0, 'uh'], [0.13, 'uh']], amp: [[0, 0], [0.015, 1], [0.13, 0]] })), 0, 0.4);
  return o;
});
def('inventory_switch', { dur: 0.18, vol: 0.4 }, c => {
  const o = c.buf();
  c.place(o, click(c, { f: 2200, q: 3, len: 0.025 }), 0, 0.7);
  c.place(o, click(c, { f: 3100, q: 3, len: 0.02 }), 0.05, 0.55);
  c.place(o, nburst(c, { len: 0.06, f: 3000, q: 0.8, t60: 0.04, color: 'pink' }), 0.005, 0.3);
  c.place(o, metal(c, { f: 2500, count: 3, t60: 0.04, len: 0.06 }), 0.08, 0.2);
  return o;
});
def('flashlight_click', { dur: 0.09, vol: 0.5 }, c => {
  const o = c.buf();
  c.place(o, click(c, { f: 3500, q: 6, len: 0.025 }), 0, 1);
  c.place(o, click(c, { f: 1200, q: 3, len: 0.02 }), 0, 0.5);
  c.place(o, metal(c, { f: 4200, count: 3, t60: 0.05, len: 0.06 }), 0.001, 0.2);
  c.place(o, click(c, { f: 2600, q: 5, len: 0.02 }), 0.018, 0.45);
  return o;
});
def('battery_dead', { dur: 1.3, vol: 0.5 }, c => {
  const o = c.buf(), len = 1.1, n = c.S(len);
  const f = D.env(n, c.sr, [[0, 125], [len, 62]], 'exp');
  const x = D.osc(n, c.sr, 'saw', f); D.add(x, D.osc(n, c.sr, 'square', D.mul(D.clone(f), 2.01)), 0.3);
  D.svf(x, c.sr, 'bpq', 900, 1.5); D.svf(x, c.sr, 'hp', 150);
  const gate = D.smoothNoise(n, c.sr, c.rng, 22);
  for (let i = 0; i < n; i++) { const u = i / n; const g = gate[i] > (u * 1.4 - 0.5) ? 1 : 0.08; x[i] *= g * (1 - u * 0.6); }
  D.svf(x, c.sr, 'lp', 5000);
  sat(x, 2);
  c.place(o, norm(x), 0, 0.7);
  c.place(o, beep(c, { f: [[0, 6200], [1, 4800]], len: 1.0, r: 0.6 }), 0, 0.04);
  c.place(o, click(c, { f: 2500, q: 5, len: 0.03 }), 1.14, 0.5);
  return o;
});
def('heal', { dur: 1.35, vol: 0.55 }, c => {
  const o = c.buf();
  c.place(o, click(c, { f: 2400, q: 4, len: 0.03 }), 0, 0.7);
  c.place(o, metal(c, { f: 2900, count: 4, t60: 0.08, len: 0.12 }), 0.004, 0.3);
  c.place(o, hiss(c, { len: 0.85, lo: 2500, hi: 8000, a: 0.02, r: 0.3, flutter: 0.15 }), 0.04, 0.6);
  c.place(o, beep(c, { f: 1760, len: 0.08, r: 0.02 }), 0.95, 0.35);
  c.place(o, beep(c, { f: 2349, len: 0.12, r: 0.06 }), 1.06, 0.35);
  return o;
});
def('spray_paint', { dur: 0.95, vol: 0.5 }, c => {
  const o = c.buf();
  for (const t of [0, 0.09]) c.place(o, metal(c, { f: 2900, count: 4, t60: 0.05, len: 0.07, ratios: [1, 2.1, 3.3, 4.6] }), t, 0.5);
  const h = hiss(c, { len: 0.72, lo: 3000, hi: 11000, a: 0.012, r: 0.05, flutter: 0.2, frate: 40 });
  const sh = D.svf(new Float32Array(h), c.sr, 'bpq', 6500, 1.5); D.add(h, norm(sh), 0.3);
  c.place(o, h, 0.2, 0.75);
  return o;
});
def('grab_beam', { dur: 2.0, loop: true, vol: 0.4, warm: 0.2 }, c => {
  const o = c.buf();
  const vib = c.wob([5], [1]);
  const f = new Float32Array(c.N); for (let i = 0; i < c.N; i++) f[i] = 110 * (1 + 0.004 * vib[i]);
  const saw = c.osc('saw', f);
  const cut = c.wob([0.5, 1.5]); for (let i = 0; i < c.N; i++) cut[i] = 700 + 350 * cut[i];
  D.svf(saw, c.sr, 'lp', cut, 2.5);
  D.add(o, saw, 0.5);
  D.add(o, c.osc('sine', 220), 0.25);
  D.add(o, c.osc('sine', 55), 0.35);
  const shimIdx = c.wob([1, 3]); for (let i = 0; i < c.N; i++) shimIdx[i] = 1.4 + 0.8 * shimIdx[i];
  const shim = D.fm(c.N, c.sr, c.lf(880), 1, shimIdx, { mf: c.lf(1320) });
  D.add(o, shim, 0.07);
  const trem = c.wob([8]); for (let i = 0; i < c.N; i++) o[i] *= 1 + 0.2 * trem[i];
  const cr = c.dust(35); D.svf(cr, c.sr, 'bpq', 3500, 3); D.add(o, cr, 0.25);
  return o;
});
def('glass_break', { dur: 0.9, vol: 0.7 }, c => {
  const o = c.buf(), r = c.rng;
  c.place(o, nburst(c, { len: 0.1, type: 'hp', f: 2000, t60: 0.08 }), 0, 0.7);
  c.place(o, thud(c, { f0: 220, f1: 110, len: 0.1, click: 0.3, body: 0 }), 0, 0.3);
  for (let k = 0; k < 44; k++) {
    const t = Math.min(0.9, -Math.log(1 - r() * 0.95) * 0.12);
    const f = r.range(2400, 9000), n = c.S(0.25), e = new Float32Array(n); e[0] = 1;
    const tl = r.range(0.04, 0.22);
    const x = D.modal(e, c.sr, [[f, tl, 1], [f * r.range(1.3, 1.7), tl * 0.7, 0.6], [f * r.range(2.1, 2.6), tl * 0.5, 0.3]]);
    c.place(o, x, t, r.range(0.1, 0.5) * (1 - t));
  }
  for (let k = 0; k < 5; k++) c.place(o, metal(c, { f: r.range(1200, 2400), count: 5, t60: 0.15, len: 0.2, ratios: [1, 1.8, 2.6, 3.9, 5.1] }), r() * 0.2, 0.35);
  return o;
});
def('value_lost', { dur: 0.42, vol: 0.5 }, c => {
  const o = c.buf();
  [1568, 1175, 880].forEach((f, k) => {
    const n = c.S(0.2), e = new Float32Array(n); e[0] = 1;
    c.place(o, D.modal(e, c.sr, [[f, 0.14, 1], [f * 2.7, 0.06, 0.3], [f * 5.4, 0.03, 0.1]]), k * 0.085, 0.8 - k * 0.15);
  });
  c.place(o, beep(c, { f: [[0, 330], [0.15, 210]], len: 0.16, type: 'tri', r: 0.1 }), 0.18, 0.25);
  return o;
});

// =====================================================================================
// SHIP
// =====================================================================================
CAT = 'ship';
def('ship_hum', { dur: 8, loop: true, vol: 0.45, warm: 0.5, xf: 0.1 }, c => {
  const L = c.buf(), R = c.buf();
  const drone = c.buf();
  const saw = c.osc('saw', 55); D.svf(saw, c.sr, 'lp', 260, 0.9); D.add(drone, saw, 0.5);
  D.add(drone, c.osc('sine', 55), 0.6);
  D.add(drone, c.osc('sine', 55.25), 0.12);
  D.add(drone, c.osc('sine', 110.125), 0.1);
  D.add(drone, c.osc('sine', 165), 0.1);
  const hum = c.osc('square', 120); D.svf(hum, c.sr, 'lp', 380); D.add(drone, hum, 0.05);
  const swell = c.wob([0.125, 0.375]); for (let i = 0; i < c.N; i++) drone[i] *= 1 + 0.12 * swell[i];
  const fanAm = c.wob([6.25]);
  for (const [dst, k] of [[L, 0], [R, 1]]) {
    D.add(dst, drone, 1);
    const fan = c.noise('pink'); D.svf(fan, c.sr, 'bpq', 340 + k * 25, 2.2);
    for (let i = 0; i < c.N; i++) fan[i] *= 0.7 + 0.3 * fanAm[i];
    D.add(dst, fan, 0.35);
    const air = c.noise('pink'); D.svf(air, c.sr, 'lp', 650); D.add(dst, air, 0.3);
    const whine = c.noise(); D.svf(whine, c.sr, 'bpq', 1250 + k * 60, 6); D.add(dst, whine, 0.025);
  }
  return [L, R];
});
function hydraulicDoor(c, open) {
  const o = c.buf();
  c.place(o, click(c, { f: 1600, q: 4, len: 0.03 }), 0, 0.5);
  c.place(o, hiss(c, { len: 0.35, lo: 1500, hi: 8000, a: 0.005, r: 0.3 }), 0.02, 0.55);
  const len = 1.45, n = c.S(len);
  const f = D.env(n, c.sr, open ? [[0, 88], [len, 112]] : [[0, 112], [len, 90]], 'exp');
  const m = D.osc(n, c.sr, 'saw', f); D.add(m, D.osc(n, c.sr, 'square', D.mul(D.clone(f), 2)), 0.3);
  D.svf(m, c.sr, 'lp', 650, 1.5);
  const menv = D.env(n, c.sr, [[0, 0], [0.15, 1], [len - 0.2, 1], [len, 0]], 'cos');
  D.mul(m, menv); c.place(o, norm(m), 0.1, 0.45);
  const rum = D.noise(n, c.rng, 'brown'); D.svf(rum, c.sr, 'lp', 320);
  const am = D.smoothNoise(n, c.sr, c.rng, 12); for (let i = 0; i < n; i++) rum[i] *= menv[i] * (0.7 + 0.3 * am[i]);
  c.place(o, norm(rum), 0.1, 0.4);
  const endT = open ? 1.6 : 1.5;
  c.place(o, metal(c, { f: 115, count: 10, t60: 0.35, bright: 0.4, len: 0.5 }), endT, 0.7);
  c.place(o, thud(c, { f0: 95, f1: 45, len: 0.35, t60: 0.25, click: 0.2, body: 0.5 }), endT, 0.8);
  if (!open) c.place(o, hiss(c, { len: 0.3, lo: 2000, hi: 7000, a: 0.005, r: 0.25 }), endT + 0.05, 0.3);
  return o;
}
def('ship_door_open', { dur: 2.1, vol: 0.7 }, c => hydraulicDoor(c, true));
def('ship_door_close', { dur: 2.0, vol: 0.7 }, c => hydraulicDoor(c, false));
def('lever_pull', { dur: 0.8, vol: 0.7 }, c => {
  const o = c.buf();
  for (let k = 0; k < 3; k++) c.place(o, metal(c, { f: 900 + k * 60, count: 5, t60: 0.05, len: 0.08 }), k * 0.06, 0.35);
  c.place(o, metal(c, { f: 150, count: 12, t60: 0.4, bright: 0.45, len: 0.6 }), 0.24, 0.8);
  c.place(o, thud(c, { f0: 120, f1: 42, len: 0.5, t60: 0.3, click: 0.3, body: 0.6 }), 0.24, 1);
  const n = c.S(0.6), fr = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / c.sr; fr[i] = 95 * (1 + 0.05 * Math.exp(-t * 6) * Math.sin(TAU * 11 * t)); }
  const tw = D.osc(n, c.sr, 'tri', fr); D.mul(tw, D.perc(n, c.sr, 0.002, 0.5)); c.place(o, tw, 0.26, 0.2);
  c.place(o, click(c, { f: 2000, q: 5, len: 0.03 }), 0.48, 0.35);
  c.place(o, click(c, { f: 1300, q: 5, len: 0.03 }), 0.5, 0.25);
  return o;
});
def('ship_thrusters', { dur: 4, loop: true, vol: 0.6, warm: 0.3, xf: 0.1 }, c => {
  const out = [];
  for (let k = 0; k < 2; k++) {
    const o = c.buf();
    const low = c.noise('brown'); D.svf(low, c.sr, 'lp', 190, 0.9); D.add(o, low, 1.1);
    const mid = c.noise('pink'); D.svf(mid, c.sr, 'bp', 780, 0.5);
    const fl = c.wob([23, 31, 37, 17]); for (let i = 0; i < c.N; i++) mid[i] *= 0.65 + 0.35 * fl[i];
    D.add(o, mid, 0.7);
    const hi = c.noise(); D.svf(hi, c.sr, 'hp', 3200); D.add(o, hi, 0.08);
    D.add(o, c.osc('sine', 38), 0.25);
    sat(o, 1.4);
    out.push(o);
  }
  return out;
});
def('ship_land', { dur: 3.2, vol: 0.8 }, c => {
  const o = c.buf(), len = 0.9, n = c.S(len);
  const roar = D.noise(n, c.rng, 'pink'); D.add(roar, D.noise(n, c.rng, 'brown'), 1.2);
  D.svf(roar, c.sr, 'lp', D.env(n, c.sr, [[0, 1200], [len, 200]], 'exp'), 0.8);
  D.mul(roar, D.env(n, c.sr, [[0, 0.8], [0.3, 1], [len, 0]], 'cos'));
  c.place(o, norm(roar), 0, 0.55);
  c.place(o, thud(c, { f0: 85, f1: 30, len: 1.6, drop: 0.1, t60: 1.2, click: 0.3, body: 0.9, lp: 250 }), 0.8, 1);
  c.place(o, metal(c, { f: 85, count: 14, t60: 1.1, bright: 0.35, len: 1.5, exc: 0.004 }), 0.8, 0.45);
  c.place(o, creak(c, { len: 0.9, rate: [[0, 20], [0.5, 34], [1, 18]], res: [260, 540, 900], q: 9 }), 1.0, 0.3);
  c.place(o, hiss(c, { len: 1.9, lo: 1200, hi: 7000, a: 0.02, r: 1.4 }), 1.1, 0.4);
  return o;
});
def('ship_takeoff', { dur: 4.2, vol: 0.8 }, c => {
  const o = c.buf(), len = 4.1, n = c.S(len);
  const x = D.noise(n, c.rng, 'pink'); D.add(x, D.noise(n, c.rng, 'brown'), 1.5);
  D.svf(x, c.sr, 'lp', D.env(n, c.sr, [[0, 140], [2.6, 1500], [len, 1300]], 'exp'), 0.9);
  const fl = D.smoothNoise(n, c.sr, c.rng, 28); for (let i = 0; i < n; i++) x[i] *= 0.75 + 0.25 * fl[i];
  D.mul(x, D.env(n, c.sr, [[0, 0], [0.3, 0.35], [2.5, 1], [3.6, 1], [len, 0]], 'cos'));
  c.place(o, norm(x), 0, 0.9);
  const sub = D.osc(n, c.sr, 'sine', D.env(n, c.sr, [[0, 30], [len, 46]], 'exp'));
  D.mul(sub, D.env(n, c.sr, [[0, 0], [1, 1], [3.6, 1], [len, 0]], 'cos')); c.place(o, sub, 0, 0.35);
  const wh = D.osc(n, c.sr, 'sine', D.env(n, c.sr, [[0, 380], [len, 1250]], 'exp'));
  D.mul(wh, D.env(n, c.sr, [[0, 0], [1.5, 1], [3.8, 0.6], [len, 0]])); c.place(o, wh, 0, 0.05);
  c.place(o, thud(c, { f0: 90, f1: 35, len: 0.8, t60: 0.6, click: 0.2, body: 0.8 }), 0.2, 0.7);
  return sat(o, 1.3);
});
def('ship_alarm', { dur: 2.5, vol: 0.7 }, c => {
  const o = c.buf();
  for (let k = 0; k < 8; k++) {
    const f = k % 2 ? 660 : 880;
    const x = beep(c, { f, len: 0.28, type: 'square', a: 0.004, r: 0.01 });
    D.add(x, beep(c, { f: f * 1.005, len: 0.28, type: 'saw', a: 0.004, r: 0.01 }), 0.5);
    c.place(o, x, k * 0.3, 0.6);
  }
  const horn = beep(c, { f: 110, len: 2.4, type: 'saw', a: 0.05, r: 0.3 });
  D.svf(horn, c.sr, 'lp', 700); c.place(o, horn, 0, 0.4);
  D.svf(o, c.sr, 'bp', 1200, 0.5); sat(o, 3);
  return o;
});
for (let v = 1; v <= 3; v++) def(`terminal_key_${v}`, { dur: 0.08, vol: 0.4 }, c => {
  const o = c.buf();
  c.place(o, click(c, { f: [1900, 2400, 2150][v - 1], q: 3, len: 0.03 }), 0, 1);
  c.place(o, click(c, { f: [620, 700, 560][v - 1], q: 2.5, len: 0.03 }), 0.001, 0.45);
  c.place(o, click(c, { f: 3300, q: 6, len: 0.015 }), 0.022 + v * 0.004, 0.25);
  return o;
});
def('terminal_enter', { dur: 0.22, vol: 0.5 }, c => {
  const o = c.buf();
  c.place(o, click(c, { f: 1500, q: 2.5, len: 0.04 }), 0, 1);
  c.place(o, click(c, { f: 480, q: 2, len: 0.04 }), 0, 0.6);
  c.place(o, beep(c, { f: 1200, len: 0.07, type: 'square', r: 0.01, lp: 3000 }), 0.05, 0.25);
  c.place(o, beep(c, { f: 1800, len: 0.08, type: 'square', r: 0.03, lp: 3000 }), 0.12, 0.2);
  return o;
});
def('terminal_error', { dur: 0.42, vol: 0.55 }, c => {
  const o = c.buf();
  c.place(o, click(c, { f: 1500, q: 2.5, len: 0.04 }), 0, 0.5);
  const x = beep(c, { f: 110, len: 0.32, type: 'square', r: 0.02 }); D.add(x, beep(c, { f: 116.5, len: 0.32, type: 'saw', r: 0.02 }), 0.7);
  D.svf(x, c.sr, 'bpq', 900, 1.2); sat(x, 3);
  c.place(o, norm(x), 0.04, 0.7);
  return o;
});
def('dropship', { dur: 5.5, vol: 0.7 }, c => {
  const o = c.buf(), len = 5.4, n = c.S(len);
  const dop = D.env(n, c.sr, [[0, 1.06], [2.7, 1.0], [len, 0.94]], 'cos');
  const eng = D.osc(n, c.sr, 'saw', D.mul(D.clone(dop), 72)); D.add(eng, D.osc(n, c.sr, 'saw', D.mul(D.clone(dop), 72.6)), 0.8);
  D.svf(eng, c.sr, 'lp', 500);
  const nz = D.noise(n, c.rng, 'pink'); D.svf(nz, c.sr, 'bp', D.mul(D.clone(dop), 700), 0.6);
  D.add(eng, norm(nz), 0.8);
  D.mul(eng, D.env(n, c.sr, [[0, 0], [2.4, 1], [3.1, 1], [len, 0]], 'cos'));
  c.place(o, norm(eng), 0, 0.55);
  // tinny delivery jingle through a loudspeaker
  const mel = new Float32Array(c.S(3.4));
  const tune = [[72, 0], [76, 0.18], [79, 0.36], [76, 0.54], [77, 0.72], [81, 0.9], [79, 1.08], [84, 1.44], [83, 1.62], [81, 1.8], [79, 1.98], [77, 2.16], [76, 2.34], [72, 2.52]];
  for (const [m, t] of tune) D.add(mel, iChip(c, m, 0.15, 0.6, { pw: 0.5, type: 'square', lp: 4500 }), 1, c.S(t));
  for (const [m, t] of [[48, 0], [55, 0.36], [53, 0.72], [55, 1.08], [48, 1.44], [53, 1.8], [55, 2.16], [48, 2.52]])
    D.add(mel, iChip(c, m, 0.3, 0.4, { type: 'tri', sus: 0.9 }), 1, c.S(t));
  D.band(mel, c.sr, 450, 4000); sat(mel, 1.8);
  c.place(o, norm(mel), 1.2, 0.45);
  return o;
});
def('ship_horn', { dur: 3.8, vol: 0.8 }, c => {
  const o = c.buf(), len = 3.0, n = c.S(len);
  const f = D.env(n, c.sr, [[0, 47], [0.25, 55], [len, 54]], 'exp');
  const x = D.osc(n, c.sr, 'saw', f); D.add(x, D.osc(n, c.sr, 'saw', D.mul(D.clone(f), 1.006)), 0.8);
  D.add(x, D.osc(n, c.sr, 'square', D.mul(D.clone(f), 1.5)), 0.25);
  D.svf(x, c.sr, 'lp', 650, 0.8);
  const res = D.svf(new Float32Array(x), c.sr, 'bpq', 290, 4); D.add(x, res, 0.4);
  sat(x, 1.5);
  D.mul(x, D.env(n, c.sr, [[0, 0], [0.2, 1], [2.5, 0.9], [len, 0]], 'cos'));
  c.place(o, norm(x), 0, 1);
  return D.echo(o, c.sr, 0.42, 0.25, 0.2, 0.6);
});
def('teleport', { dur: 1.9, vol: 0.7 }, c => {
  const o = c.buf(), len = 1.3, n = c.S(len);
  const fc = D.env(n, c.sr, [[0, 180], [len, 2100]], 'exp');
  const x = D.fm(n, c.sr, fc, 1.41, D.env(n, c.sr, [[0, 4], [len, 0.5]]));
  D.mul(x, D.env(n, c.sr, [[0, 0], [0.4, 0.7], [len, 1]], 'lin'));
  c.place(o, x, 0, 0.45);
  const sh = D.echo(D.fm(n, c.sr, D.mul(D.clone(fc), 2.02), 3.5, 1.2), c.sr, 0.07, 0.5, 0.6);
  D.mul(sh, D.env(n, c.sr, [[0, 0], [len, 0.8]])); c.place(o, sh, 0, 0.15);
  c.place(o, whoosh(c, { len: 1.3, f0: 300, f1: 6000, f2: 7000, q: 2, peakAt: 0.9, color: 'white' }), 0, 0.3);
  c.place(o, thud(c, { f0: 300, f1: 60, len: 0.4, drop: 0.03, click: 0.4, body: 0.3 }), 1.28, 0.8);
  c.place(o, nburst(c, { len: 0.3, type: 'hp', f: 3000, t60: 0.25 }), 1.28, 0.35);
  for (let k = 0; k < 10; k++) c.place(o, beep(c, { f: c.rng.range(3000, 7000), len: 0.05, r: 0.045 }), 1.3 + c.rng() * 0.45, 0.1);
  return o;
});

// =====================================================================================
// FACILITY
// =====================================================================================
CAT = 'facility';
def('door_open', { dur: 0.75, vol: 0.6 }, c => {
  const o = c.buf();
  c.place(o, metal(c, { f: 1100, count: 6, t60: 0.06, len: 0.1 }), 0, 0.55);
  c.place(o, click(c, { f: 1800, q: 4, len: 0.03 }), 0.005, 0.5);
  c.place(o, thud(c, { f0: 190, f1: 110, len: 0.08, click: 0, body: 0.3 }), 0.01, 0.35);
  c.place(o, creak(c, { len: 0.38, rate: [[0, 260], [0.5, 420], [1, 330]], res: [1250, 2500, 3600], q: 18 }), 0.12, 0.25);
  c.place(o, whoosh(c, { len: 0.6, f0: 250, f1: 700, f2: 300, q: 0.9 }), 0.1, 0.35);
  return o;
});
def('door_close', { dur: 0.65, vol: 0.65 }, c => {
  const o = c.buf();
  c.place(o, whoosh(c, { len: 0.2, f0: 300, f1: 800, f2: 400, q: 0.9, peakAt: 0.8 }), 0, 0.35);
  c.place(o, metal(c, { f: 110, count: 10, t60: 0.35, bright: 0.4, len: 0.45 }), 0.17, 0.7);
  c.place(o, thud(c, { f0: 125, f1: 50, len: 0.3, t60: 0.2, click: 0.3, body: 0.6 }), 0.17, 1);
  c.place(o, metal(c, { f: 1300, count: 5, t60: 0.05, len: 0.08 }), 0.2, 0.4);
  return o;
});
def('door_locked', { dur: 0.45, vol: 0.55 }, c => {
  const o = c.buf(), r = c.rng;
  for (let k = 0; k < 3; k++) {
    const t = k * 0.12 + r.range(-0.01, 0.01);
    c.place(o, metal(c, { f: r.range(800, 1000), count: 6, t60: 0.07, len: 0.12 }), t, 0.6);
    c.place(o, click(c, { f: 2100, q: 4, len: 0.02 }), t, 0.4);
    c.place(o, thud(c, { f0: 220, f1: 140, len: 0.06, click: 0, body: 0.2 }), t + 0.01, 0.35);
    c.place(o, metal(c, { f: r.range(600, 750), count: 5, t60: 0.05, len: 0.1 }), t + 0.045, 0.3);
  }
  return o;
});
def('door_creak', { dur: 1.8, vol: 0.55 }, c => {
  const o = c.buf();
  c.place(o, creak(c, { len: 1.7, rate: [[0, 22], [0.25, 60], [0.5, 115], [0.75, 70], [1, 35]], res: [540, 1150, 1800, 2650], q: 15, amp: [[0, 0], [0.1, 1], [0.8, 0.9], [1, 0]] }), 0.02, 0.8);
  c.place(o, creak(c, { len: 1.2, rate: [[0, 14], [1, 20]], res: [180, 350], q: 8 }), 0.3, 0.3);
  return o;
});
def('blast_door', { dur: 3.6, vol: 0.8 }, c => {
  const o = c.buf(), len = 2.8, n = c.S(len);
  c.place(o, hiss(c, { len: 0.5, lo: 1200, hi: 7000, a: 0.005, r: 0.4 }), 0, 0.5);
  c.place(o, thud(c, { f0: 110, f1: 55, len: 0.3, click: 0.3, body: 0.4 }), 0, 0.5);
  const menv = D.env(n, c.sr, [[0, 0], [0.3, 1], [len - 0.2, 1], [len, 0.2]], 'cos');
  const m = D.osc(n, c.sr, 'saw', D.env(n, c.sr, [[0, 40], [0.5, 50], [len, 48]], 'exp'));
  D.add(m, D.osc(n, c.sr, 'square', 100), 0.3); D.svf(m, c.sr, 'lp', 420); D.mul(m, menv);
  c.place(o, norm(m), 0.15, 0.55);
  const g = D.noise(n, c.rng, 'brown'); D.svf(g, c.sr, 'bpq', 380, 1.5);
  const am = D.smoothNoise(n, c.sr, c.rng, 15); for (let i = 0; i < n; i++) g[i] *= menv[i] * (0.55 + 0.45 * am[i]);
  c.place(o, norm(g), 0.15, 0.6);
  c.place(o, creak(c, { len: 1.4, rate: [[0, 500], [0.5, 700], [1, 560]], res: [1900, 2800], q: 20, amp: [[0, 0], [0.3, 1], [0.6, 0.2], [0.8, 0.8], [1, 0]] }), 0.9, 0.12);
  c.place(o, metal(c, { f: 72, count: 14, t60: 0.9, bright: 0.35, len: 1.0, exc: 0.004 }), 2.95, 0.8);
  c.place(o, thud(c, { f0: 90, f1: 30, len: 0.6, t60: 0.45, click: 0.4, body: 0.8 }), 2.95, 1);
  return o;
});
def('vault_open', { dur: 3.6, vol: 0.8 }, c => {
  const o = c.buf();
  for (let k = 0; k < 4; k++) {
    const t = k * 0.34;
    c.place(o, metal(c, { f: 175 + k * 12, count: 10, t60: 0.22, bright: 0.45, len: 0.35 }), t, 0.6);
    c.place(o, thud(c, { f0: 150, f1: 60, len: 0.2, t60: 0.14, click: 0.25, body: 0.4 }), t, 0.7);
    c.place(o, click(c, { f: 2300, q: 5, len: 0.02 }), t + 0.05, 0.3);
  }
  c.place(o, hiss(c, { len: 0.7, lo: 1500, hi: 9000, a: 0.005, r: 0.6 }), 1.36, 0.45);
  c.place(o, creak(c, { len: 1.9, rate: [[0, 11], [0.4, 22], [1, 14]], res: [190, 420, 880, 1500], q: 10, amp: [[0, 0], [0.15, 1], [0.85, 0.8], [1, 0]] }), 1.45, 0.8);
  const n = c.S(1.9), rum = D.noise(n, c.rng, 'brown'); D.svf(rum, c.sr, 'lp', 200);
  D.mul(rum, D.env(n, c.sr, [[0, 0], [0.3, 1], [1.9, 0]], 'cos')); c.place(o, norm(rum), 1.45, 0.4);
  return o;
});
def('alarm_loop', { rotate: false, dur: 2.0, loop: true, vol: 0.6, warm: 0.1, xf: 0.02 }, c => {
  const f = c.curve(t => { const u = (t % 1) / 0.85; return u < 1 ? 460 + 560 * Math.pow(u, 0.8) : 460; });
  const x = c.osc('saw', f); D.add(x, c.osc('square', f), 0.4);
  D.mul(x, c.curve(t => { const u = t % 1; return u < 0.02 ? u / 0.02 : u < 0.85 ? 1 : u < 0.88 ? (0.88 - u) / 0.03 : 0; }));
  D.band(x, c.sr, 380, 4200); sat(x, 2.5);
  const tail = D.comb(x, c.sr, 0.013, 0.3, 0.4, 0.3);
  return tail;
});
function spinHum(c, sCurve, aCurve, o) {
  for (const [f, g] of [[60, 0.5], [120, 0.45], [180, 0.2], [240, 0.08], [900, 0.1], [1350, 0.06]]) {
    const fr = D.mul(D.clone(sCurve), f);
    const x = D.osc(sCurve.length, c.sr, f > 500 ? 'sine' : 'saw', fr);
    if (f <= 500) D.svf(x, c.sr, 'lp', 600);
    D.mul(x, aCurve); c.place(o, x, 0, g);
  }
  const fan = D.noise(sCurve.length, c.rng, 'pink'); D.svf(fan, c.sr, 'bpq', D.mul(D.clone(sCurve), 700), 2); D.mul(fan, aCurve);
  c.place(o, norm(fan), 0, 0.25);
}
def('power_down', { dur: 3.6, vol: 0.75 }, c => {
  const o = c.buf(), n = c.S(3.5);
  const s = new Float32Array(n), a = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / c.sr; s[i] = Math.max(0.02, Math.exp(-t / 1.1)); a[i] = Math.sqrt(s[i]) * Math.min(1, (3.5 - t) * 2); }
  spinHum(c, s, a, o);
  c.place(o, thud(c, { f0: 140, f1: 50, len: 0.4, click: 0.4, body: 0.5 }), 0, 0.8);
  c.place(o, metal(c, { f: 260, count: 8, t60: 0.25, len: 0.35 }), 0, 0.4);
  const z = D.dust(c.S(0.18), c.sr, c.rng, 900); D.svf(z, c.sr, 'hp', 2000); D.mul(z, D.perc(z.length, c.sr, 0.001, 0.17));
  c.place(o, norm(z), 0.005, 0.4);
  return o;
});
def('power_up', { dur: 3.6, vol: 0.75 }, c => {
  const o = c.buf(), n = c.S(3.6);
  const s = new Float32Array(n), a = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / c.sr; s[i] = Math.max(0.03, 1 - Math.exp(-t / 0.8)); a[i] = Math.sqrt(s[i]) * Math.min(1, (3.6 - t) * 5); }
  spinHum(c, s, a, o);
  c.place(o, thud(c, { f0: 140, f1: 50, len: 0.4, click: 0.4, body: 0.5 }), 0, 0.8);
  c.place(o, metal(c, { f: 260, count: 8, t60: 0.25, len: 0.35 }), 0, 0.4);
  for (const t of [1.2, 1.45, 1.52, 1.9, 2.3]) {
    c.place(o, metal(c, { f: c.rng.range(3200, 4200), count: 4, t60: 0.06, len: 0.08 }), t, 0.25);
    const b = beep(c, { f: 120, len: 0.06, type: 'saw', r: 0.02, lp: 1500 }); c.place(o, b, t, 0.2);
  }
  return o;
});
def('lights_buzz', { dur: 4.0, loop: true, vol: 0.3, warm: 0.2, xf: 0.05 }, c => {
  const o = c.buf();
  const s = c.osc('sine', 60);
  for (let i = 0; i < c.N; i++) o[i] = Math.abs(s[i]) - 0.6366;
  D.svf(o, c.sr, 'lp', 2400);
  const bz = c.osc('saw', 120); D.svf(bz, c.sr, 'bpq', 1500, 2); D.add(o, bz, 0.12);
  D.add(o, c.osc('sine', 7800), 0.012);
  // two flickers per loop: amplitude dips with crackle
  const fl = c.curve(t => { let g = 1; for (const t0 of [1.3, 3.05]) { const d = t - t0; if (d > 0 && d < 0.14) g *= 0.35 + 0.65 * Math.abs(Math.sin(d * 90)); } return g; });
  D.mul(o, fl);
  const cr = c.dust(20); D.svf(cr, c.sr, 'hp', 2500); D.add(o, cr, 0.25);
  return o;
});
def('steam_hiss', { dur: 2.0, vol: 0.6 }, c => {
  const o = c.buf();
  const h = hiss(c, { len: 1.9, lo: 1200, hi: 11000, a: 0.03, r: 0.7, flutter: 0.2, frate: 40 });
  const b = D.svf(new Float32Array(h), c.sr, 'bpq', 3500, 1.2); D.add(h, norm(b), 0.4);
  c.place(o, norm(h), 0, 0.9);
  const n = c.S(1.9), w = D.osc(n, c.sr, 'sine', 2900 * 1.0);
  D.mul(w, D.env(n, c.sr, [[0, 0], [0.1, 1], [1.2, 0.7], [1.9, 0]])); c.place(o, w, 0, 0.03);
  const lo = D.noise(n, c.rng, 'brown'); D.svf(lo, c.sr, 'lp', 220); D.mul(lo, D.env(n, c.sr, [[0, 0], [0.05, 1], [1.9, 0]]));
  c.place(o, norm(lo), 0, 0.2);
  return o;
});
def('turret_detect', { dur: 0.95, vol: 0.6 }, c => {
  const o = c.buf();
  [[0, 1000], [0.17, 1150], [0.3, 1320], [0.4, 1480]].forEach(([t, f]) => c.place(o, beep(c, { f, len: 0.06, type: 'square', r: 0.01, lp: 4500 }), t, 0.5));
  c.place(o, beep(c, { f: 1660, len: 0.38, type: 'square', a: 0.005, r: 0.05, lp: 4500 }), 0.5, 0.5);
  c.place(o, beep(c, { f: 830, len: 0.38, type: 'saw', a: 0.005, r: 0.05, lp: 2500 }), 0.5, 0.2);
  const n = c.S(0.5), sv = D.noise(n, c.rng); D.svf(sv, c.sr, 'bpq', D.env(n, c.sr, [[0, 900], [0.5, 1800]], 'exp'), 4);
  D.mul(sv, D.env(n, c.sr, [[0, 0], [0.05, 1], [0.5, 0]])); c.place(o, norm(sv), 0, 0.12);
  return o;
});
def('turret_fire', { dur: 1.4, vol: 0.85 }, c => {
  const o = c.buf(), r = c.rng;
  for (let k = 0; k < 10; k++) {
    const t = k * 0.085 + r.range(-0.004, 0.004), g = r.range(0.8, 1);
    c.place(o, nburst(c, { len: 0.05, type: 'hp', f: 900, t60: 0.03, a: 0.0002 }), t, g);
    c.place(o, thud(c, { f0: 190 * r.range(0.9, 1.1), f1: 65, len: 0.12, drop: 0.012, t60: 0.08, click: 0.3, body: 0.3 }), t, g * 0.8);
    c.place(o, click(c, { f: 3100, q: 5, len: 0.02 }), t + 0.03, 0.2);
  }
  sat(o, 1.6);
  c.place(o, metal(c, { f: 420, count: 8, t60: 0.5, bright: 0.5, len: 0.6 }), 0.86, 0.15);
  const n = c.S(0.45), wh = D.osc(n, c.sr, 'saw', D.env(n, c.sr, [[0, 210], [0.45, 70]], 'exp'));
  D.svf(wh, c.sr, 'lp', 900); D.mul(wh, D.env(n, c.sr, [[0, 0.5], [0.45, 0]])); c.place(o, wh, 0.9, 0.12);
  return o;
});
def('mine_beep', { dur: 0.3, vol: 0.55 }, c => {
  const o = c.buf();
  for (const t of [0, 0.1]) {
    c.place(o, beep(c, { f: 2400, len: 0.05, r: 0.01 }), t, 0.7);
    c.place(o, beep(c, { f: 4800, len: 0.05, type: 'square', r: 0.01, lp: 6000 }), t, 0.06);
  }
  return o;
});
def('mine_click', { dur: 0.3, vol: 0.65 }, c => {
  const o = c.buf();
  c.place(o, metal(c, { f: 1100, count: 6, t60: 0.08, len: 0.12 }), 0, 0.7);
  c.place(o, click(c, { f: 2000, q: 4, len: 0.03 }), 0, 0.8);
  c.place(o, thud(c, { f0: 260, f1: 120, len: 0.08, click: 0, body: 0.3 }), 0, 0.5);
  const n = c.S(0.2), fr = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / c.sr; fr[i] = 700 * (1 + 0.08 * Math.exp(-t * 20) * Math.sin(TAU * 40 * t)); }
  const sp = D.osc(n, c.sr, 'tri', fr); D.mul(sp, D.perc(n, c.sr, 0.001, 0.18)); c.place(o, sp, 0.005, 0.12);
  return o;
});
function boom(c, o = {}) {
  const { len = 3.4, crack = 1, rumble = 1, debris = 1, lp = 320 } = o;
  const x = new Float32Array(c.S(len)), r = c.rng;
  if (crack) D.add(x, nburst(c, { len: 0.05, type: 'hp', f: 500, t60: 0.04, a: 0.0002 }), crack);
  D.add(x, thud(c, { f0: 85, f1: 28, len: Math.min(len, 2.2), drop: 0.18, t60: 1.6, click: 0, body: 0.3, lp: 250 }), 1.2);
  const n = c.S(len), ru = D.noise(n, r, 'brown'); D.svf(ru, c.sr, 'lp', lp, 0.8);
  const am = D.smoothNoise(n, c.sr, r, 6); for (let i = 0; i < n; i++) ru[i] *= 0.7 + 0.3 * am[i];
  D.mul(ru, D.perc(n, c.sr, 0.01, len * 0.9)); D.add(x, norm(ru), rumble);
  if (debris) for (let k = 0; k < 30; k++) { const t = 0.1 + Math.pow(r(), 1.8) * (len * 0.55); D.add(x, click(c, { f: r.range(1500, 5000), q: 3, len: 0.03 }), debris * 0.12 * (1 - t / len), c.S(t)); }
  sat(x, 1.8);
  return norm(x);
}
def('explosion', { dur: 2.3, vol: 0.9 }, c => { const o = c.buf(); c.place(o, boom(c, { len: 2.3 }), 0, 1); return o; });
def('vent_rattle', { dur: 1.3, vol: 0.55 }, c => {
  const o = c.buf(), r = c.rng;
  let t = 0, g = 1;
  while (t < 1.1) {
    c.place(o, metal(c, { f: r.range(480, 760), count: 6, t60: 0.1, len: 0.15, bright: 0.6 }), t, g * r.range(0.5, 1));
    t += r.range(0.025, 0.07); g *= r.chance(0.12) ? 1.6 : 0.93; g = Math.min(g, 1);
  }
  return D.comb(o, c.sr, 0.0045, 0.55, 0.3, 0.5);
});
for (let v = 1; v <= 3; v++) def(`drip_${v}`, { dur: 0.6, vol: 0.45 }, c => {
  const o = c.buf();
  const f = [950, 1250, 780][v - 1];
  c.place(o, bubble(c, { f, len: 0.07, rise: 2.4 }), 0, 1);
  c.place(o, nburst(c, { len: 0.012, type: 'hp', f: 3500, t60: 0.01 }), 0, 0.15);
  if (v !== 2) c.place(o, bubble(c, { f: f * 1.3, len: 0.04, rise: 2 }), 0.09, 0.25);
  return D.reverb(o, c.sr, { room: 0.6, damp: 0.4, wet: 0.2, size: 0.7 });
});
for (let v = 1; v <= 3; v++) def(`distant_bang_${v}`, { dur: 4.8, vol: 0.6 }, c => {
  const o = c.buf();
  const f = [140, 95, 180][v - 1];
  c.place(o, metal(c, { f, count: 12, t60: 1.2, bright: 0.4, len: 1.5 }), 0, 0.9);
  c.place(o, thud(c, { f0: 95, f1: 45, len: 0.5, click: 0.3, body: 0.6 }), 0, 0.8);
  if (v === 2) { c.place(o, metal(c, { f: f * 1.12, count: 12, t60: 1.0, bright: 0.4, len: 1.3 }), 0.36, 0.7); c.place(o, thud(c, { f0: 90, f1: 45, len: 0.4, body: 0.6 }), 0.36, 0.6); }
  if (v === 3) c.place(o, creak(c, { len: 0.8, rate: [[0, 40], [1, 25]], res: [300, 700, 1300], q: 7 }), 0.25, 0.45);
  D.svf(o, c.sr, 'lp', 1100);
  return D.reverb(o, c.sr, { room: 0.93, damp: 0.5, wet: 0.9, dry: 0.35, size: 1.4, pre: 0.03 });
});
function whisper(c, dur, seedShift) {
  const o = c.buf(), r = c.rng;
  const vw = ['a', 'e', 'i', 'o', 'u', 'ih', 'uh', 'ae', 'er'];
  let t = 0.05;
  while (t < dur - 0.25) {
    const sl = r.range(0.1, 0.2);
    if (r.chance(0.55)) { // fricative
      const fl = r.range(0.04, 0.09), f = r.pick([4200, 5500, 2600, 6500]);
      c.place(o, hiss(c, { len: fl, lo: f * 0.7, hi: f * 1.6, a: 0.01, r: fl * 0.5 }), t, r.range(0.25, 0.5));
      t += fl * 0.7;
    }
    const v0 = r.pick(vw), v1 = r.pick(vw);
    const b = breathVox(c, { len: sl, vowels: [[0, v0], [sl, v1]], scale: 1.1 + seedShift * 0.05, amp: [[0, 0], [sl * 0.3, 1], [sl, 0]], bw: 1.3 });
    c.place(o, b, t, r.range(0.5, 1));
    if (r.chance(0.3)) c.place(o, click(c, { f: r.range(1500, 3500), q: 1.5, len: 0.01 }), t + sl, 0.15);
    t += sl + (r.chance(0.2) ? r.range(0.08, 0.25) : 0);
  }
  D.svf(o, c.sr, 'hp', 300);
  return D.reverb(o, c.sr, { room: 0.6, wet: 0.22, damp: 0.5, size: 0.8 });
}
for (let v = 1; v <= 3; v++) def(`whisper_${v}`, { dur: [2.1, 2.5, 1.8][v - 1], vol: 0.45 }, c => whisper(c, [1.8, 2.2, 1.5][v - 1], v));
def('ambience_facility', { dur: 30, loop: true, vol: 0.5, warm: 4, xf: 0.3 }, c => {
  const L = c.buf(), R = c.buf();
  const drone = c.buf();
  D.add(drone, c.osc('sine', 41.33), 0.5); D.add(drone, c.osc('sine', 41.67), 0.2); D.add(drone, c.osc('sine', 62), 0.12);
  D.add(drone, c.osc('sine', 60), 0.05); D.add(drone, c.osc('sine', 120), 0.05); D.add(drone, c.osc('sine', 180), 0.025);
  const body = c.lowOsc('saw', 41.33); D.svf(body, c.sr, 'lp', 320, 0.9); D.add(drone, body, 0.2);
  const sw = c.wob([1 / 30, 3 / 30, 7 / 30]); for (let i = 0; i < c.N; i++) drone[i] *= 0.8 + 0.2 * sw[i];
  const fanAm = c.wob([10 / 3]);
  [L, R].forEach((dst, k) => {
    D.add(dst, drone, 1);
    const pn = c.noise('pink');   // one table per channel, split into independent bands
    const rum = D.svf(D.clone(pn), c.sr, 'lp', 120); D.add(dst, rum, 0.9);
    const fan = D.svf(D.clone(pn), c.sr, 'bpq', 480 + k * 40, 3);
    for (let i = 0; i < c.N; i++) fan[i] *= (0.6 + 0.4 * fanAm[i]) * (k ? 1 : 0.5);
    D.add(dst, fan, 0.6);
    const air = D.svf(pn, c.sr, 'bp', 1800, 0.6); D.add(dst, air, 0.12);
  });
  const ev = [c.buf(), c.buf()], r = c.rng;
  for (let k = 0; k < 20; k++) put(c, ev, D.svf(thud(c, { f0: 70, f1: 40, len: 0.4, click: 0, body: 0.6, lp: 200 }), c.sr, 'lp', 220), k * 1.5, 0.22, -0.5);
  for (let k = 0; k < 20; k++) put(c, ev, D.svf(nburst(c, { len: 0.25, f: 700, q: 1, t60: 0.2, a: 0.05 }), c.sr, 'lp', 900), k * 1.5 + 0.55, 0.05, -0.5);
  for (const [t, p] of [[6, 0.6], [17.2, -0.7], [25.4, 0.2]]) {
    const cr = creak(c, { len: r.range(1.2, 2), rate: [[0, 16], [0.5, 32], [1, 20]], res: [210, 460, 820], q: 9 });
    put(c, ev, D.svf(cr, c.sr, 'lp', 900), t, 0.35, p);
  }
  for (const [t, p, f] of [[11.3, -0.4, 150], [22.5, 0.7, 110]]) {
    const m = metal(c, { f, count: 10, t60: 1.0, bright: 0.3, len: 1.3 }); D.svf(m, c.sr, 'lp', 700);
    put(c, ev, m, t, 0.3, p);
  }
  for (const [t, p] of [[3.2, 0.3], [19.8, -0.2], [20.9, -0.2]]) put(c, ev, bubble(c, { f: r.range(800, 1300), len: 0.06, rise: 2.4 }), t, 0.08, p);
  const wet = D.reverb(ev, c.sr, { room: 0.9, damp: 0.55, wet: 0.6, dry: 0.4, size: 1.3, down: 4 });
  D.add(L, wet[0], 1); D.add(R, wet[1], 1);
  return [L, R];
});
def('ambience_mansion', { dur: 20, loop: true, vol: 0.5, warm: 3, xf: 0.3 }, c => {
  const L = c.buf(), R = c.buf(), r = c.rng;
  [L, R].forEach((dst, k) => {
    const g = c.wob([0.05, 0.15, 0.35], [1, 0.6, 0.3]);
    const pn = c.noise('pink');
    const w = D.svf(D.clone(pn), c.sr, 'bp', c.curve((t, i) => 480 + 220 * g[i]), 1.1);
    for (let i = 0; i < c.N; i++) w[i] *= 0.45 + 0.35 * g[i];
    D.add(dst, w, 0.5);
    const wh = D.svf(D.clone(pn), c.sr, 'bpq', c.curve((t, i) => 820 + 120 * g[i] + k * 40), 30);
    for (let i = 0; i < c.N; i++) { const v = Math.max(0, g[i]); wh[i] *= v * v; }
    D.add(dst, wh, 0.035);
    const rt = D.svf(pn, c.sr, 'lp', 140); D.add(dst, rt, 0.22);
  });
  const ev = [c.buf(), c.buf()];
  for (const [t, p] of [[3, -0.6], [8.5, 0.5], [13.1, -0.1], [17.2, 0.8]]) {
    const cr = creak(c, { len: r.range(0.6, 1.2), rate: [[0, 18], [0.5, r.range(35, 60)], [1, 22]], res: [400, 900, 1500, 2300], q: 12 });
    put(c, ev, cr, t, r.range(0.2, 0.35), p);
  }
  for (const t of [10.3, 10.62]) put(c, ev, wood(c, { f: 180, t60: 0.1 }), t, 0.2, 0.9);
  const wet = D.reverb(ev, c.sr, { room: 0.8, damp: 0.5, wet: 0.45, dry: 0.6, down: 4 });
  D.add(L, wet[0], 1); D.add(R, wet[1], 1);
  return [L, R];
});

// =====================================================================================
// OUTDOOR
// =====================================================================================
CAT = 'outdoor';
function windBed(c, k, base = 420, depth = 300, whistle = 0.03) {
  const o = c.buf();
  const g = c.wob([1 / 12, 3 / 12 + k / 12, 0.45, 0.9], [1, 0.6, 0.3, 0.15]);
  const pn = c.noise('pink');
  const w = D.svf(D.clone(pn), c.sr, 'bp', c.curve((t, i) => base + depth * g[i]), 0.9);
  for (let i = 0; i < c.N; i++) w[i] *= 0.5 + 0.45 * g[i];
  D.add(o, w, 1);
  const wh = D.svf(D.clone(pn), c.sr, 'bpq', c.curve((t, i) => 900 + 250 * g[i] + k * 70), 25);
  for (let i = 0; i < c.N; i++) { const v = Math.max(0, g[i]); wh[i] *= v * v; }
  D.add(o, wh, whistle * 1.7);
  const lo = D.svf(pn, c.sr, 'lp', 150); D.add(o, lo, 0.7);
  return o;
}
def('wind', { dur: 12, loop: true, vol: 0.55, warm: 0.3, xf: 0.2 }, c => [windBed(c, 0), windBed(c, 1)]);
def('rain', { dur: 8, loop: true, vol: 0.55, warm: 0.2, xf: 0.1 }, c => {
  const out = [];
  for (let k = 0; k < 2; k++) {
    const o = c.buf();
    const bed = c.noise(); D.band(bed, c.sr, 600, 8000); D.add(o, bed, 0.35);
    const soft = c.noise('pink'); D.svf(soft, c.sr, 'lp', 2000); D.add(o, soft, 0.3);
    const d = c.dust(500); D.svf(d, c.sr, 'bp', 3000, 0.8); D.add(o, d, 0.5);
    for (let j = 0; j < 90; j++) c.place(o, bubble(c, { f: c.rng.range(1200, 4000), len: 0.025, rise: 1.5 }), c.rng() * 8, c.rng.range(0.05, 0.2));
    const rum = c.noise('brown'); D.svf(rum, c.sr, 'lp', 100); D.add(o, rum, 0.25);
    out.push(o);
  }
  return out;
});
function thunder(c, close) {
  const o = c.buf(), r = c.rng, len = c.dur;
  if (close) {
    c.place(o, nburst(c, { len: 0.08, type: 'hp', f: 1500, t60: 0.06, a: 0.0003 }), 0, 0.8);
    const n = c.S(0.4), cr = D.dust(n, c.sr, r, 4000); D.svf(cr, c.sr, 'hp', 1500); D.mul(cr, D.perc(n, c.sr, 0.001, 0.35));
    c.place(o, norm(cr), 0.01, 0.5);
    c.place(o, thud(c, { f0: 50, f1: 25, len: 2, drop: 0.3, t60: 1.8, click: 0, body: 0.4 }), 0.02, 0.8);
  }
  const t0 = close ? 0.03 : 0.1, n = c.S(len - t0);
  const ru = D.noise(n, r, 'brown');
  D.svf(ru, c.sr, 'lp', D.env(n, c.sr, [[0, close ? 700 : 400], [len - t0, 140]], 'exp'), 0.8);
  const roll = D.smoothNoise(n, c.sr, r, close ? 4 : 3);
  for (let i = 0; i < n; i++) ru[i] *= 0.25 + Math.abs(roll[i]) * 1.2;
  D.mul(ru, D.env(n, c.sr, close ? [[0, 0], [0.05, 1], [1.5, 0.6], [len - t0, 0]] : [[0, 0], [0.5, 0.7], [1.5, 1], [3, 0.6], [len - t0, 0]], 'cos'));
  c.place(o, norm(ru), t0, 1);
  return sat(o, 1.3);
}
def('thunder_1', { dur: 5, vol: 0.85 }, c => thunder(c, true));
def('thunder_2', { dur: 6, vol: 0.75 }, c => thunder(c, false));
def('crickets', { dur: 6, loop: true, vol: 0.4, warm: 0.1, xf: 0.05 }, c => {
  const o = [c.buf(), c.buf()], r = c.rng;
  const crs = [[4300, 0.6, -0.6], [4700, 0.75, 0.5], [5100, 1.0, 0.1], [3900, 1.5, -0.2], [4500, 0.5, 0.8]];
  for (const [f, per, p] of crs) {
    const pulses = r.int(2, 4), n = c.S(0.03 * pulses + 0.02);
    const ch = D.osc(n, c.sr, 'sine', f); D.add(ch, D.osc(n, c.sr, 'sine', f * 2), 0.15);
    const am = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / c.sr, u = (t % 0.03) / 0.03; am[i] = t < 0.03 * pulses && u < 0.55 ? Math.sin(Math.PI * u / 0.55) : 0; }
    D.mul(ch, am);
    const off = r() * per, g = r.range(0.3, 1);
    for (let t = off; t < 6; t += per) put(c, o, ch, t + r.range(-0.004, 0.004), g * r.range(0.8, 1), p);
  }
  for (const dst of o) { const a = c.noise('pink'); D.svf(a, c.sr, 'lp', 1500); D.add(dst, a, 0.03); }
  return o;
});
def('ambience_outdoor', { dur: 20, loop: true, vol: 0.5, warm: 3, xf: 0.3 }, c => {
  const L = windBed(c, 0, 320, 200, 0.02), R = windBed(c, 1, 340, 200, 0.02);
  D.mul(L, 0.7); D.mul(R, 0.7);
  const tones = [c.buf(), c.buf()];
  const wn = c.noise();
  [[311.1, -0.5], [466.2, 0.4], [622.3, 0.0], [207.7, 0.2]].forEach(([f, p], k) => {
    const x = D.svf(D.clone(wn), c.sr, 'bpq', f, 60);
    const sw = c.wob([1 / 20 * (k + 1), 3 / 20]); for (let i = 0; i < c.N; i++) { const v = Math.max(0, sw[i] + 0.2); x[i] *= v * Math.sqrt(v); }
    const gl = (p + 1) * Math.PI / 4; D.add(tones[0], x, 0.5 * Math.cos(gl)); D.add(tones[1], x, 0.5 * Math.sin(gl));
  });
  const dr = c.buf(); D.add(dr, c.osc('sine', 55), 0.08); D.add(dr, c.osc('sine', 58.3), 0.06);
  D.add(tones[0], dr, 1); D.add(tones[1], dr, 1);
  const call = vox(c, { len: 2.2, f0: [[0, 240], [0.7, 380], [1.6, 330], [2.2, 210]], vowels: [[0, 'u'], [0.8, 'o'], [2.2, 'u']], vib: [4, 0.03], breath: 0.3, amp: [[0, 0], [0.5, 1], [1.7, 0.8], [2.2, 0]] });
  D.svf(call, c.sr, 'lp', 900);
  put(c, tones, call, 11.5, 0.12, -0.7);
  const wet = D.reverb(tones, c.sr, { room: 0.92, damp: 0.4, wet: 0.5, dry: 0.7, size: 1.3, down: 4 });
  D.add(L, wet[0], 1); D.add(R, wet[1], 1);
  return [L, R];
});
def('lightning_strike', { dur: 1.8, vol: 0.9 }, c => {
  const o = c.buf();
  c.place(o, nburst(c, { len: 0.02, type: 'hp', f: 800, t60: 0.015, a: 0.0001 }), 0, 1);
  const n = c.S(0.5), z = D.dust(n, c.sr, c.rng, 6000); D.svf(z, c.sr, 'hp', 3000); D.mul(z, D.perc(n, c.sr, 0.001, 0.45));
  c.place(o, norm(z), 0.003, 0.6);
  c.place(o, boom(c, { len: 1.75, crack: 0.5, debris: 0.3, lp: 400 }), 0.01, 0.9);
  return o;
});

// =====================================================================================
// CREATURES
// =====================================================================================
CAT = 'creature';
def('scuttler_click', { dur: 0.35, vol: 0.55 }, c => {
  const o = c.buf(), r = c.rng;
  let t = 0;
  const cnt = r.int(5, 8);
  for (let k = 0; k < cnt; k++) {
    const g = r.range(0.6, 1);
    c.place(o, click(c, { f: r.range(2200, 4300), q: r.range(6, 11), len: 0.015 }), t, g);
    c.place(o, click(c, { f: r.range(800, 1100), q: 3, len: 0.012 }), t + 0.001, g * 0.45);
    t += r.range(0.018, 0.045);
  }
  return o;
});
def('scuttler_hiss', { dur: 0.9, vol: 0.6 }, c => {
  const o = c.buf(), len = 0.85, n = c.S(len);
  const x = D.noise(n, c.rng); D.svf(x, c.sr, 'hp', 2000);
  const f1 = D.svf(new Float32Array(x), c.sr, 'bpq', 3200, 3), f2 = D.svf(new Float32Array(x), c.sr, 'bpq', 5300, 3);
  const y = D.sum(n, [x, 0.3], [f1, 0.15], [f2, 0.12]);
  for (let i = 0; i < n; i++) y[i] *= 0.55 + 0.45 * Math.sin(TAU * 46 * i / c.sr);
  D.mul(y, D.env(n, c.sr, [[0, 0], [0.03, 1], [0.5, 0.8], [len, 0]]));
  c.place(o, norm(y), 0, 0.85);
  const kh = D.noise(n, c.rng); D.svf(kh, c.sr, 'bpq', 1200, 2); D.mul(kh, D.env(n, c.sr, [[0, 0], [0.05, 1], [len, 0]]));
  c.place(o, norm(kh), 0, 0.25);
  for (let k = 0; k < 3; k++) c.place(o, click(c, { f: 3500, q: 8, len: 0.012 }), k * 0.025, 0.5);
  return o;
});
def('scuttler_death', { dur: 1.0, vol: 0.65 }, c => {
  const o = c.buf(), r = c.rng;
  c.place(o, nburst(c, { len: 0.25, color: 'pink', f: 1200, f2: 280, q: 4, t60: 0.2 }), 0, 0.7);
  for (let k = 0; k < 7; k++) c.place(o, click(c, { f: r.range(1500, 4500), q: 3, len: 0.012 }), k * r.range(0.003, 0.008), 0.6);
  const n = c.S(0.38), sc = D.fm(n, c.sr, D.env(n, c.sr, [[0, 2300], [0.38, 480]], 'exp'), 1.5, 2);
  D.mul(sc, D.env(n, c.sr, [[0, 0], [0.01, 1], [0.38, 0]])); c.place(o, sc, 0.02, 0.45);
  [0.5, 0.63, 0.79].forEach((t, k) => c.place(o, click(c, { f: r.range(2500, 4000), q: 7, len: 0.015 }), t, 0.35 - k * 0.08));
  return o;
});
def('yoinker_yippee', { dur: 0.75, vol: 0.75 }, c => {
  const o = c.buf(), len = 0.72;
  // small-creature "i": F1 raised to sit on the (high) fundamental so the "pee!" stays full and loud
  const I_HI = [600, 2250, 3000], I_Y = [330, 2200, 3000];
  const y = vox(c, {
    len, scale: 1.55, breath: 0.12, jitter: 0.012, vib: [8, 0.018], direct: 0.3, directLp: 1400,
    f0: [[0, 560], [0.06, 640], [0.15, 665], [0.2, 690], [0.24, 720], [0.34, 930], [0.48, 1010], [0.6, 905], [0.72, 820]],
    vowels: [[0, I_Y], [0.05, 'ih'], [0.15, 'ih'], [0.21, I_HI], [0.5, I_HI], [0.72, 'ee']],
    amp: [[0, 0], [0.015, 0.6], [0.05, 0.75], [0.12, 0.7], [0.15, 0], [0.215, 0], [0.235, 1], [0.45, 1], [0.6, 0.7], [0.72, 0]],
    drive: 1.5,
  });
  c.place(o, y, 0, 1);
  c.place(o, nburst(c, { len: 0.008, f: 1500, q: 1, t60: 0.006 }), 0.207, 0.35);  // the "p"
  return o;
});
def('yoinker_angry', { dur: 0.9, vol: 0.65 }, c => {
  const o = c.buf(), len = 0.85, n = c.S(len);
  const v = vox(c, { len, f0: [[0, 360], [0.3, 420], [0.85, 330]], jitter: 0.08, jrate: 40, fry: 0.4, breath: 0.3, scale: 1.5, vowels: [[0, 'e'], [0.3, 'a'], [0.85, 'e']], amp: [[0, 0], [0.03, 1], [0.7, 0.9], [len, 0]], drive: 3 });
  const am = new Float32Array(n); for (let i = 0; i < n; i++) am[i] = 0.3 + 0.7 * (Math.sin(TAU * 31 * i / c.sr) > -0.2 ? 1 : 0);
  D.lp1(am, c.sr, 400); D.mul(v, am);
  c.place(o, v, 0, 0.85);
  const bz = D.osc(n, c.sr, 'saw', 190); D.svf(bz, c.sr, 'bpq', 1500, 2); D.mul(bz, am);
  D.mul(bz, D.env(n, c.sr, [[0, 0], [0.03, 1], [len, 0]])); c.place(o, norm(bz), 0, 0.3);
  for (let k = 0; k < 6; k++) c.place(o, click(c, { f: c.rng.range(2500, 4000), q: 6, len: 0.012 }), k * 0.13 + c.rng() * 0.03, 0.25);
  return o;
});
def('crawler_roar', { dur: 1.9, vol: 0.85 }, c => {
  const o = c.buf(), len = 1.8, n = c.S(len);
  const amp = [[0, 0], [0.08, 1], [1.2, 0.9], [len, 0]];
  c.place(o, vox(c, { len, f0: [[0, 90], [0.2, 135], [0.8, 120], [1.4, 82], [1.8, 60]], vowels: [[0, 'a'], [0.6, 'aw'], [1.8, 'o']], scale: 0.85, fry: 0.6, jitter: 0.08, breath: 0.4, amp, drive: 3, shape: 'asym' }), 0, 0.9);
  c.place(o, vox(c, { len: 1.6, f0: [[0, 500], [0.3, 720], [1.2, 610], [1.6, 400]], vowels: [[0, 'ae'], [1.6, 'a']], scale: 1.3, fry: 0.3, jitter: 0.06, breath: 0.3, amp: [[0, 0], [0.1, 1], [1.1, 0.8], [1.6, 0]], drive: 2 }), 0.05, 0.22);
  const br = D.noise(n, c.rng, 'pink'); D.svf(br, c.sr, 'bp', 900, 0.7); D.mul(br, D.env(n, c.sr, amp, 'cos'));
  c.place(o, norm(br), 0, 0.35);
  const sub = D.osc(n, c.sr, 'sine', 45); D.mul(sub, D.env(n, c.sr, amp, 'cos')); c.place(o, sub, 0, 0.3);
  sat(o, 1.6);
  D.svf(o, c.sr, 'lp', 3800, 0.6);
  return D.biquad(o, c.sr, 'lowshelf', 250, 0.7, 4);
});
def('crawler_step', { dur: 0.3, vol: 0.7 }, c => {
  const o = c.buf();
  c.place(o, thud(c, { f0: 105, f1: 45, len: 0.35, t60: 0.22, click: 0.1, body: 0.8 }), 0, 1);
  c.place(o, nburst(c, { len: 0.04, f: 900, q: 0.8, t60: 0.025 }), 0, 0.8);
  c.place(o, click(c, { f: 3000, q: 5, len: 0.02 }), 0.02, 0.35);
  c.place(o, nburst(c, { len: 0.15, color: 'pink', f: 600, f2: 250, q: 3, t60: 0.12 }), 0.005, 0.3);
  return o;
});
def('lurker_growl', { dur: 1.6, vol: 0.7 }, c => {
  const o = c.buf(), len = 1.55, n = c.S(len);
  const g = vox(c, { len, f0: [[0, 55], [0.4, 66], [1.1, 58], [1.55, 48]], src: 'pulse', pw: 0.2, fry: 0.85, jitter: 0.12, jrate: 40, breath: 0.3, scale: 0.8, vowels: [[0, 'o'], [0.6, 'uh'], [1.2, 'o']], amp: [[0, 0], [0.2, 1], [1.2, 0.9], [len, 0]] });
  const rattle = D.smoothNoise(n, c.sr, c.rng, 22);
  for (let i = 0; i < n; i++) g[i] *= 0.6 + 0.4 * rattle[i];
  c.place(o, g, 0, 1);
  const sub = D.osc(n, c.sr, 'sine', 29); D.mul(sub, D.env(n, c.sr, [[0, 0], [0.3, 1], [1.2, 0.8], [len, 0]], 'cos')); c.place(o, sub, 0, 0.25);
  D.svf(o, c.sr, 'lp', 2500);
  return sat(o, 2);
});
def('lurker_snap', { dur: 0.35, vol: 0.8 }, c => {
  const o = c.buf(), r = c.rng;
  for (const [t, g] of [[0, 1], [0.012, 0.7], [0.03, 0.85]]) {
    const n = c.S(0.03), x = D.noise(n, r); D.mul(x, D.perc(n, c.sr, 0.0001, 0.006));
    const y = D.sum(n, [D.svf(new Float32Array(x), c.sr, 'bpq', r.range(2200, 2800), 1.5), 1], [D.svf(new Float32Array(x), c.sr, 'bpq', r.range(4200, 5000), 2), 0.6]);
    sat(y, 4, 'hard');
    c.place(o, norm(y), t, g);
  }
  const n = c.S(0.08), cr = D.dust(n, c.sr, r, 2500); D.svf(cr, c.sr, 'bp', 2000, 0.8); D.mul(cr, D.perc(n, c.sr, 0.001, 0.07));
  c.place(o, norm(cr), 0.005, 0.5);
  c.place(o, thud(c, { f0: 150, f1: 60, len: 0.25, t60: 0.15, click: 0, body: 0.5 }), 0.01, 0.55);
  c.place(o, nburst(c, { len: 0.12, color: 'pink', f: 800, f2: 350, q: 3, t60: 0.1 }), 0.02, 0.3);
  return o;
});
function boing(c, f = 280, wob = 14, len = 0.85) {
  const n = c.S(len), fr = new Float32Array(n), am = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / c.sr, e = Math.exp(-t / 0.28);
    fr[i] = f * (1 + 0.1 * t) * (1 + 0.25 * e * Math.sin(TAU * wob * t));
    am[i] = 1 - 0.3 * e * (0.5 + 0.5 * Math.sin(TAU * wob * t + 1));
  }
  const x = D.osc(n, c.sr, 'sine', fr); D.add(x, D.osc(n, c.sr, 'tri', fr), 0.4);
  D.add(x, D.osc(n, c.sr, 'sine', D.mul(D.clone(fr), 2.01)), 0.15);
  D.mul(x, am); D.mul(x, D.perc(n, c.sr, 0.002, len));
  return norm(x);
}
def('mannequin_boing', { dur: 0.9, vol: 0.6 }, c => {
  const o = c.buf();
  c.place(o, boing(c, 280, 14, 0.88), 0, 0.9);
  c.place(o, metal(c, { f: 1400, count: 4, t60: 0.3, len: 0.35, ratios: [1, 2.9, 4.1, 5.3] }), 0, 0.2);
  c.place(o, thud(c, { f0: 200, f1: 100, len: 0.1, click: 0.2, body: 0 }), 0, 0.3);
  return o;
});
def('mannequin_step', { dur: 0.3, vol: 0.6 }, c => {
  const o = c.buf();
  c.place(o, wood(c, { f: 850 * c.rng.range(0.95, 1.05), t60: 0.05, len: 0.15, ratios: [1, 2.3, 3.7, 5.1] }), 0, 0.9);
  c.place(o, click(c, { f: 3500, q: 3, len: 0.02 }), 0, 0.6);
  c.place(o, thud(c, { f0: 180, f1: 90, len: 0.08, t60: 0.05, click: 0, body: 0 }), 0, 0.4);
  return o;
});
def('sludge_gurgle', { dur: 5, loop: true, vol: 0.55, warm: 0.2, xf: 0.1 }, c => {
  const o = c.buf(), r = c.rng;
  const bed = c.noise('brown');
  const w = c.wob([0.6, 1.2, 2.2]);
  D.svf(bed, c.sr, 'bpq', c.curve((t, i) => 200 + 90 * w[i]), 3);
  const am = c.wob([0.4, 1.8, 3.2]); for (let i = 0; i < c.N; i++) bed[i] *= 0.6 + 0.4 * am[i];
  D.add(o, norm(bed), 0.35);
  for (let k = 0; k < 34; k++) c.place(o, bubble(c, { f: r.range(140, 520), len: r.range(0.05, 0.15), rise: r.range(1, 3) }), r() * 5, r.range(0.2, 0.6));
  for (const t of [0.7, 2.1, 3.4, 4.4]) c.place(o, bubble(c, { f: r.range(85, 130), len: 0.28, rise: 1.2 }), t, 0.8);
  return D.svf(o, c.sr, 'lp', 2200);
});
def('jester_music', { rotate: false, dur: 12, loop: true, vol: 0.55, warm: 0.1, xf: 0.02 }, c => {
  const o = c.buf(), r = c.rng, st = 0.25;
  const mel = 'E5 . A5 . C6 . | B5 . A5 . E5 . | F5 . A5 . D6 . | C6 . B5 . A5 . | G#5 . B5 . E6 . | D6 . C6 . B5 . | A5 . E5 . C5 . | A4 - - - - .';
  const acc = 'A3 . E4 . C4 . | A3 . E4 . C4 . | D3 . A3 . F4 . | A3 . E4 . C4 . | E3 . B3 . G#4 . | E3 . B3 . D4 . | A3 . E4 . C4 . | A3 . E4 . A4 .';
  const tine = (cc, m, len, v) => iTine(cc, m, v, r.range(-16, 16));
  seq(c, o, mel, st, tine, { hum: 0.006, t0: 0.012 });
  seq(c, o, acc, st, (cc, m, len, v) => iTine(cc, m, v * 0.55, r.range(-12, 12)), { hum: 0.005, t0: 0.012 });
  const tick = click(c, { f: 2600, q: 3, len: 0.01 });
  for (let k = 0; k < 48; k++) c.place(o, tick, k * st + 0.008, 0.02);
  return o;
});
def('jester_crank', { dur: 1.6, loop: true, vol: 0.5, warm: 0.1, xf: 0.02 }, c => {
  const o = c.buf(), r = c.rng;
  for (let k = 0; k < 20; k++) {
    const t = k * 0.08 + r.range(-0.004, 0.004), acc = k % 5 === 0 ? 1 : 0.65;
    c.place(o, metal(c, { f: r.range(2400, 2900), count: 4, t60: 0.03, len: 0.05 }), t, 0.6 * acc);
    c.place(o, click(c, { f: 1800, q: 4, len: 0.02 }), t, 0.5 * acc);
    c.place(o, click(c, { f: 450, q: 3, len: 0.03 }), t + 0.002, 0.35 * acc);
  }
  const wh = c.noise(); D.svf(wh, c.sr, 'bpq', 1200, 4);
  const am = c.curve(t => 0.5 + 0.5 * Math.cos(TAU * 12.5 * t));
  D.mul(wh, am); D.add(o, norm(wh), 0.06);
  return o;
});
def('jester_pop', { dur: 1.7, vol: 0.9 }, c => {
  const o = c.buf();
  const n = c.S(0.06), pop = D.osc(n, c.sr, 'sine', dropCurve(n, c.sr, 520, 150, 0.012)); D.mul(pop, D.perc(n, c.sr, 0.0005, 0.05));
  c.place(o, pop, 0, 1);
  c.place(o, nburst(c, { len: 0.015, type: 'hp', f: 1000, t60: 0.01 }), 0, 0.6);
  c.place(o, wood(c, { f: 380, t60: 0.08 }), 0.003, 0.5);
  c.place(o, boing(c, 350, 18, 0.6), 0.01, 0.45);
  const len = 1.5;
  const scr = vox(c, { len, f0: [[0, 600], [0.2, 1100], [1.05, 1000], [len, 700]], fry: 0.5, jitter: 0.1, breath: 0.3, scale: 1.4, vowels: [[0, 'a'], [0.5, 'ae'], [len, 'e']], amp: [[0, 0], [0.08, 1], [1.1, 0.9], [len, 0]], drive: 4 });
  c.place(o, scr, 0.15, 0.75);
  const m = c.S(len), fr = D.env(m, c.sr, [[0, 1400], [0.3, 1700], [len, 1300]], 'exp');
  for (let i = 0; i < m; i++) fr[i] *= 1 + 0.03 * Math.sin(TAU * 9 * i / c.sr);
  const fmx = D.fm(m, c.sr, fr, 1.414, 4); D.mul(fmx, D.env(m, c.sr, [[0, 0], [0.1, 1], [1.1, 0.8], [len, 0]]));
  c.place(o, fmx, 0.15, 0.3);
  return sat(o, 1.4);
});
def('jester_scream', { dur: 3, loop: true, vol: 0.8, warm: 0.2, xf: 0.3 }, c => {
  const o = c.buf();
  [[700, 7, 0], [950, 9, 1], [1320, 11, 2]].forEach(([f, vr, k]) => {
    const vb = c.wob([vr, vr * 0.37]), sw = c.wob([1 / 3, 2 / 3]);
    const f0 = new Float32Array(c.N); for (let i = 0; i < c.N; i++) f0[i] = f * (1 + 0.045 * vb[i] + 0.08 * sw[i]);
    const vs = k === 1 ? [[0, 'ae'], [1, 'a'], [2, 'e'], [3, 'ae']] : [[0, 'a'], [1.5, 'e'], [3, 'a']];
    const y = D.voice(c.N, c.sr, c.rng, { f0: c.lock(f0), formants: c.vowels(vs, 1.4), fry: 0.4, jitter: 0.06, breath: 0.25, scale: 1.4 });
    D.add(o, norm(y), 0.6);
  });
  const roar = c.noise('pink'); D.svf(roar, c.sr, 'bp', 700, 0.8); D.add(o, norm(roar), 0.35);
  sat(o, 3);
  return o;
});
def('hound_growl', { dur: 1.4, vol: 0.7 }, c => {
  const o = c.buf(), len = 1.35, n = c.S(len);
  const amp = [[0, 0], [0.12, 1], [1.0, 0.9], [len, 0]];
  const g = vox(c, { len, f0: [[0, 85], [0.5, 96], [1.0, 90], [len, 78]], src: 'pulse', pw: 0.25, fry: 0.7, jitter: 0.1, jrate: 30, breath: 0.35, scale: 0.9, vowels: [[0, 'uh'], [0.7, 'aw'], [len, 'uh']], amp });
  c.place(o, g, 0, 0.9);
  const sn = D.noise(n, c.rng); D.svf(sn, c.sr, 'bpq', 1800, 2);
  for (let i = 0; i < n; i++) sn[i] *= 0.5 + 0.5 * Math.sin(TAU * 26 * i / c.sr);
  D.mul(sn, D.env(n, c.sr, amp, 'cos')); c.place(o, norm(sn), 0, 0.25);
  const ringed = D.ring(D.clone(g), c.sr, 43, 1); c.place(o, ringed, 0, 0.3);
  const sub = D.osc(n, c.sr, 'sine', D.env(n, c.sr, [[0, 42], [len, 39]])); D.mul(sub, D.env(n, c.sr, amp, 'cos')); c.place(o, sub, 0, 0.3);
  return sat(o, 2.5);
});
def('hound_howl', { dur: 3.8, vol: 0.8 }, c => {
  const o = c.buf(), len = 2.7;
  const amp = [[0, 0], [0.25, 1], [2.1, 0.9], [len, 0]];
  const f0 = [[0, 300], [0.4, 480], [1.6, 520], [2.2, 420], [len, 320]];
  const vw = [[0, 'u'], [0.5, 'o'], [1.2, 'a'], [2.2, 'o'], [len, 'u']];
  const a = vox(c, { len, f0, vowels: vw, vib: [5.5, 0.03], breath: 0.25, jitter: 0.02, amp });
  const b = vox(c, { len, f0: f0.map(([t, f]) => [t, f * 1.414]), vowels: vw, vib: [6.3, 0.035], breath: 0.3, jitter: 0.03, amp, scale: 1.1 });
  const x = D.sum(a.length, [a, 1], [b, 0.45]);
  D.ring(x, c.sr, 90, 0.25); sat(x, 1.8); D.crush(x, 8, 1);
  D.svf(x, c.sr, 'lp', 4500, 0.7);
  c.place(o, norm(x), 0, 1);
  return D.reverb(o, c.sr, { room: 0.82, damp: 0.45, wet: 0.35, size: 1.2 });
});
def('hound_bark', { dur: 0.4, vol: 0.8 }, c => {
  const o = c.buf(), len = 0.3;
  const b = vox(c, { len, f0: [[0, 320], [0.05, 430], [0.15, 250], [len, 175]], vowels: [[0, 'a'], [0.1, 'aw'], [len, 'o']], fry: 0.5, breath: 0.5, jitter: 0.1, amp: [[0, 0], [0.008, 1], [0.1, 0.8], [len, 0]], drive: 5 });
  c.place(o, b, 0, 1);
  c.place(o, nburst(c, { len: 0.1, f: 800, q: 1, t60: 0.08 }), 0, 0.4);
  return D.comb(o, c.sr, 0.0031, 0.5, 0.2, 0.4);
});
def('giant_step', { dur: 1.6, vol: 0.85 }, c => {
  const o = c.buf();
  c.place(o, thud(c, { f0: 58, f1: 27, len: 1.5, drop: 0.12, t60: 1.2, click: 0.1, body: 1, lp: 200 }), 0, 1);
  const n = c.S(1.2), ru = D.noise(n, c.rng, 'brown'); D.svf(ru, c.sr, 'lp', 150); D.mul(ru, D.perc(n, c.sr, 0.02, 1.0));
  c.place(o, norm(ru), 0.02, 0.5);
  const m = c.S(0.2), cr = D.dust(m, c.sr, c.rng, 3000); D.svf(cr, c.sr, 'lp', 1500); D.mul(cr, D.perc(m, c.sr, 0.002, 0.18));
  c.place(o, norm(cr), 0.01, 0.35);
  c.place(o, nburst(c, { len: 0.25, color: 'pink', f: 320, q: 0.9, t60: 0.2 }), 0.005, 0.5);
  D.svf(o, c.sr, 'lp', 700);
  return D.reverb(o, c.sr, { room: 0.8, damp: 0.6, wet: 0.3, size: 1.3 });
});
def('giant_growl', { dur: 2.5, vol: 0.8 }, c => {
  const o = c.buf(), len = 2.4, n = c.S(len);
  const amp = [[0, 0], [0.4, 1], [1.8, 0.9], [len, 0]];
  c.place(o, vox(c, { len, f0: [[0, 38], [0.8, 46], [1.8, 42], [len, 33]], src: 'pulse', pw: 0.2, fry: 0.8, jitter: 0.1, breath: 0.4, scale: 0.6, vowels: [[0, 'o'], [1, 'aw'], [2, 'u']], amp }), 0, 1);
  const br = D.noise(n, c.rng, 'pink'); D.svf(br, c.sr, 'lp', 600); D.mul(br, D.env(n, c.sr, amp, 'cos')); c.place(o, norm(br), 0, 0.45);
  const sub = D.osc(n, c.sr, 'sine', D.env(n, c.sr, [[0, 38], [0.8, 46], [1.8, 42], [len, 33]], 'exp')); D.mul(sub, D.env(n, c.sr, amp, 'cos')); c.place(o, sub, 0, 0.4);
  return sat(o, 2);
});
function speech(c, words, f0base, scale) {
  // words: [[t, [['h',len],['eh',len],...], pitchMul]]
  const o = c.buf(), r = c.rng;
  for (const [t0, phones, pm] of words) {
    let t = t0;
    for (const [ph, len] of phones) {
      if (ph === 'h' || ph === 's' || ph === 'f') {
        c.place(o, hiss(c, { len, lo: ph === 's' ? 3500 : 800, hi: ph === 's' ? 9000 : 4000, a: 0.01, r: len * 0.6 }), t, 0.25);
      } else if (ph === 'p' || ph === 't' || ph === 'k') {
        c.place(o, nburst(c, { len: 0.02, f: ph === 'p' ? 900 : ph === 't' ? 3500 : 1800, q: 1, t60: 0.015 }), t + len * 0.5, 0.35);
      } else if (ph !== '_') {
        const v = vox(c, { len: len + 0.03, f0: [[0, f0base * pm * r.range(0.97, 1.05)], [len, f0base * pm * r.range(0.85, 0.95)]], vowels: [[0, ph], [len, ph]], scale, breath: 0.2, jitter: 0.03, amp: [[0, 0], [0.02, 1], [len, 0.8], [len + 0.03, 0]] });
        c.place(o, v, t, 0.8);
      }
      t += len;
    }
  }
  return o;
}
function garble(c, x, chunk, rev) {
  const out = new Float32Array(x.length), m = c.S(chunk), r = c.rng;
  for (let s = 0, k = 0; s < x.length; s += m, k++) {
    const e = Math.min(x.length, s + m), n = e - s;
    const seg = x.subarray(s, e), doRev = rev === 'all' || (k % 2 === 1) !== r.chance(0.25);
    for (let i = 0; i < n; i++) { const w = Math.min(1, i / 64, (n - 1 - i) / 64); out[s + i] = (doRev ? seg[n - 1 - i] : seg[i]) * w; }
  }
  return out;
}
def('mimic_voice_1', { dur: 1.9, vol: 0.7 }, c => {
  const words = [
    [0.05, [['h', 0.07], ['eh', 0.16], ['l', 0.07], ['p', 0.06]], 1.0],
    [0.55, [['h', 0.06], ['eh', 0.22], ['l', 0.08], ['p', 0.06]], 1.15],
    [1.1, [['m', 0.08], ['ee', 0.3]], 1.05],
  ];
  const x = speech(c, words, 125, 1.0);
  const g = garble(c, x, 0.11, 'alt');
  const n = g.length, ratio = new Float32Array(n);
  for (let i = 0; i < n; i++) ratio[i] = 0.92 + 0.08 * Math.sin(TAU * 1.3 * i / c.sr);
  const w = D.resample(g, ratio, n);
  D.band(w, c.sr, 250, 3500); D.crush(w, 8, 1.5);
  return D.shape(w, 1.5 / (D.peak(w) || 1));
});
def('mimic_voice_2', { dur: 1.45, vol: 0.7 }, c => {
  const words = [
    [0.05, [['h', 0.08], ['e', 0.12], ['l', 0.08], ['o', 0.35]], 1.0],
    [0.8, [['h', 0.05], ['ae', 0.1], ['l', 0.06], ['o', 0.25]], 1.25],
  ];
  const x = speech(c, words, 150, 1.12);
  const spoken = x.subarray(c.S(0.03), c.S(1.3));          // trim the silence before reversing
  const rv = garble(c, D.reverse(spoken), 0.16, 'alt');
  const n = rv.length, ratio = new Float32Array(n);
  for (let i = 0; i < n; i++) ratio[i] = 0.86 + 0.08 * Math.sin(TAU * 0.9 * i / c.sr + 1);
  const w = D.resample(rv, ratio, Math.floor(n / 0.86));
  D.band(w, c.sr, 300, 3200); D.crush(w, 7, 2);
  const o = c.buf(); c.place(o, w, 0.02, 1);
  return o;
});
def('spider_skitter', { dur: 2.0, loop: true, vol: 0.5, warm: 0.05, xf: 0.02 }, c => {
  const o = c.buf(), r = c.rng;
  let t = 0;
  while (t < 2.0) {
    const burst = r.int(3, 8);
    for (let k = 0; k < burst && t < 2.0; k++) {
      c.place(o, click(c, { f: r.range(2500, 6000), q: r.range(4, 8), len: 0.012 }), t, r.range(0.3, 1));
      t += r.range(0.015, 0.035);
    }
    t += r.range(0.02, 0.12);
  }
  const ru = c.noise(); D.svf(ru, c.sr, 'bpq', 3000, 2);
  const am = c.wob([7, 11, 3]); for (let i = 0; i < c.N; i++) ru[i] *= Math.max(0, am[i]);
  D.add(o, norm(ru), 0.1);
  return D.svf(o, c.sr, 'lp', 9000);
});
def('spider_hiss', { dur: 1.0, vol: 0.6 }, c => {
  const o = c.buf(), len = 0.95, n = c.S(len);
  const x = D.noise(n, c.rng); D.svf(x, c.sr, 'hp', 2500); D.svf(x, c.sr, 'bp', 4200, 0.9);
  for (let i = 0; i < n; i++) x[i] *= 0.4 + 0.6 * Math.abs(Math.sin(TAU * 35 * i / c.sr));
  D.mul(x, D.env(n, c.sr, [[0, 0], [0.06, 1], [0.6, 0.85], [len, 0]]));
  c.place(o, norm(x), 0.02, 0.8);
  const kh = D.noise(n, c.rng); D.svf(kh, c.sr, 'bpq', 1000, 2); D.mul(kh, D.env(n, c.sr, [[0, 0], [0.08, 1], [len, 0]]));
  c.place(o, norm(kh), 0.02, 0.25);
  c.place(o, click(c, { f: 3000, q: 6, len: 0.02 }), 0, 0.6);
  c.place(o, click(c, { f: 3400, q: 6, len: 0.02 }), 0.045, 0.5);
  return o;
});
def('leech_chitter', { dur: 0.9, vol: 0.6 }, c => {
  const o = c.buf(), r = c.rng, len = 0.8, n = c.S(len);
  for (let k = 0; k < 20; k++) {
    const t = k * 0.04 + r.range(-0.005, 0.005);
    c.place(o, click(c, { f: r.range(1200, 2500), q: 6, len: 0.02 }), t, r.range(0.5, 1));
    if (k % 3 === 1) c.place(o, beep(c, { f: [[0, r.range(1800, 2400)], [0.015, 3000], [0.03, 2000]], len: 0.03, r: 0.015 }), t + 0.01, 0.25);
  }
  const sq = D.noise(n, r, 'pink'); D.svf(sq, c.sr, 'bpq', D.env(n, c.sr, [[0, 600], [0.4, 1500], [len, 800]], 'exp'), 4);
  for (let i = 0; i < n; i++) sq[i] *= 0.5 + 0.5 * Math.sin(TAU * 25 * i / c.sr);
  D.mul(sq, D.env(n, c.sr, [[0, 0], [0.05, 1], [len, 0]])); c.place(o, norm(sq), 0, 0.35);
  return o;
});
def('leech_screech', { dur: 1.1, vol: 0.75 }, c => {
  const o = c.buf(), len = 1.05, n = c.S(len);
  const fc = D.env(n, c.sr, [[0, 1400], [0.2, 2400], [0.8, 2000], [len, 1200]], 'exp');
  for (let i = 0; i < n; i++) fc[i] *= 1 + 0.03 * Math.sin(TAU * 13 * i / c.sr);
  const x = D.fm(n, c.sr, fc, 1.47, 3.5);
  const amp = D.env(n, c.sr, [[0, 0], [0.02, 1], [0.8, 0.8], [len, 0]]);
  D.mul(x, amp); c.place(o, x, 0, 0.6);
  const h = D.noise(n, c.rng); D.svf(h, c.sr, 'hp', 3000); D.mul(h, amp); c.place(o, norm(h), 0, 0.2);
  c.place(o, vox(c, { len, f0: D.mul(D.clone(fc), 0.7), vowels: [[0, 'i'], [len, 'e']], scale: 1.6, breath: 0.2, jitter: 0.05, amp: [[0, 0], [0.02, 1], [0.8, 0.8], [len, 0]] }), 0, 0.5);
  sat(o, 2.5);
  return D.svf(o, c.sr, 'lp', 6000, 0.6);
});
def('screamer_scream', { dur: 2.0, vol: 0.85 }, c => {
  const o = c.buf(), len = 1.95, n = c.S(len);
  const amp = [[0, 0], [0.03, 1], [1.5, 0.95], [len, 0]];
  for (const [f, vr] of [[1150, 9], [1230, 10.5], [1720, 8]]) {
    c.place(o, vox(c, { len, f0: [[0, f * 0.8], [0.15, f], [1.5, f * 1.05], [len, f * 0.9]], vib: [vr, 0.05], jitter: 0.05, vowels: [[0, 'i'], [0.5, 'ee'], [len, 'i']], scale: 1.6, breath: 0.2, amp }), 0, 0.5);
  }
  const fmx = D.fm(n, c.sr, 2600, 1.01, 1.5); D.mul(fmx, D.env(n, c.sr, amp, 'cos')); c.place(o, fmx, 0, 0.2);
  const h = D.noise(n, c.rng); D.svf(h, c.sr, 'hp', 4000); D.mul(h, D.env(n, c.sr, amp, 'cos')); c.place(o, norm(h), 0, 0.15);
  D.ring(o, c.sr, 180, 0.3);
  return sat(o, 2.2);
});
def('sandkefal_rumble', { dur: 6, loop: true, vol: 0.8, warm: 0.3, xf: 0.2, dcHz: 5 }, c => {
  const o = c.buf(), r = c.rng;
  const ru = c.noise('brown'); D.svf(ru, c.sr, 'lp', 90, 0.8);
  const am = c.wob([1 / 3, 0.5, 5 / 6, 2]); for (let i = 0; i < c.N; i++) ru[i] *= 0.55 + 0.45 * am[i];
  D.add(o, norm(ru), 1);
  D.add(o, c.osc('sine', 31.67), 0.35); D.add(o, c.osc('sine', 34.33), 0.25);
  const gr = c.noise('pink'); D.svf(gr, c.sr, 'bp', 260, 1.2); D.svf(gr, c.sr, 'lp', 900);
  const gam = c.wob([0.5, 1.5, 3.5, 7]); for (let i = 0; i < c.N; i++) gr[i] *= Math.max(0, 0.3 + 0.7 * gam[i]);
  D.add(o, norm(gr), 0.8);
  for (let k = 0; k < 60; k++) c.place(o, nburst(c, { len: r.range(0.005, 0.02), type: 'lp', f: 1200, t60: 0.015 }), r() * 6, r.range(0.12, 0.35));
  return sat(o, 1.3);
});
def('sandkefal_roar', { dur: 3.0, vol: 0.9, dcHz: 5 }, c => {
  const o = c.buf();
  c.place(o, boom(c, { len: 2.5, crack: 0.3, debris: 1.2, lp: 250 }), 0, 0.7);
  c.place(o, vox(c, { len: 2.7, f0: [[0, 45], [0.6, 72], [1.8, 60], [2.7, 40]], src: 'pulse', pw: 0.2, fry: 0.8, breath: 0.5, jitter: 0.08, scale: 0.55, vowels: [[0, 'o'], [1, 'a'], [2.7, 'o']], amp: [[0, 0], [0.3, 1], [2, 0.9], [2.7, 0]], drive: 2 }), 0.1, 0.9);
  c.place(o, vox(c, { len: 2.2, f0: [[0, 180], [0.9, 260], [2.2, 200]], vib: [3, 0.04], scale: 0.8, breath: 0.2, vowels: [[0, 'u'], [1, 'o'], [2.2, 'u']], amp: [[0, 0], [0.5, 1], [1.7, 0.8], [2.2, 0]] }), 0.3, 0.3);
  const h = hiss(c, { len: 2.2, lo: 1500, hi: 5000, a: 0.3, r: 1, color: 'pink', flutter: 0.4, frate: 12 });
  c.place(o, h, 0.3, 0.25);
  return sat(o, 1.8);
});
def('creature_hurt', { dur: 0.45, vol: 0.7 }, c => {
  const o = c.buf();
  c.place(o, vox(c, { len: 0.4, f0: [[0, 350], [0.08, 620], [0.4, 290]], vowels: [[0, 'e'], [0.4, 'a']], scale: 1.2, fry: 0.4, jitter: 0.08, breath: 0.3, amp: [[0, 0], [0.015, 1], [0.15, 0.8], [0.4, 0]], drive: 2 }), 0, 0.9);
  c.place(o, thud(c, { f0: 140, f1: 70, len: 0.12, click: 0.2, body: 0.4 }), 0, 0.4);
  return o;
});
def('creature_death', { dur: 1.5, vol: 0.75 }, c => {
  const o = c.buf(), len = 1.15, n = c.S(len);
  const v = vox(c, { len, f0: [[0, 320], [0.2, 385], [0.6, 180], [len, 70]], vowels: [[0, 'a'], [0.5, 'o'], [1.0, 'u']], fry: 0.5, breath: 0.4, jitter: 0.06, amp: [[0, 0], [0.02, 1], [0.5, 0.8], [len, 0]], drive: 1.8 });
  for (let i = 0; i < n; i++) { const t = i / c.sr; if (t > 0.45) v[i] *= 1 - 0.6 * Math.min(1, (t - 0.45) * 4) * (0.5 + 0.5 * Math.sin(TAU * 18 * t)); }
  c.place(o, v, 0, 0.9);
  c.place(o, thud(c, { f0: 110, f1: 45, len: 0.4, t60: 0.3, click: 0.2, body: 0.6 }), 0.95, 0.7);
  c.place(o, nburst(c, { len: 0.15, color: 'pink', f: 900, f2: 300, q: 3, t60: 0.12 }), 0.96, 0.3);
  return o;
});
def('vent_crawl', { dur: 2.6, vol: 0.6 }, c => {
  const o = c.buf(), r = c.rng;
  let t = 0.05, k = 0;
  while (t < 2.3) {
    const g = 0.4 + 0.6 * Math.sin(Math.PI * t / 2.4);
    c.place(o, thud(c, { f0: 170, f1: 95, len: 0.15, t60: 0.1, click: 0.1, body: 0.3 }), t, g * 0.8);
    c.place(o, metal(c, { f: r.range(230, 300), count: 6, t60: 0.15, len: 0.2, bright: 0.3 }), t, g * 0.5);
    t += k++ % 2 ? r.range(0.25, 0.4) : r.range(0.08, 0.13);
  }
  for (const [t0, len] of [[0.3, 0.35], [1.1, 0.5], [1.8, 0.3]]) {
    const n = c.S(len), s = D.noise(n, r); D.svf(s, c.sr, 'bp', r.range(1000, 2500), 1.2);
    const am = D.smoothNoise(n, c.sr, r, 40); for (let i = 0; i < n; i++) s[i] *= Math.abs(am[i]);
    D.mul(s, D.env(n, c.sr, [[0, 0], [0.05, 1], [len, 0]]));
    c.place(o, norm(s), t0, 0.3);
  }
  const y = D.comb(o, c.sr, 0.0037, 0.55, 0.3, 0.6);
  return D.svf(y, c.sr, 'lp', 3000);
});

// =====================================================================================
// ITEMS
// =====================================================================================
CAT = 'item';
def('airhorn', { dur: 1.3, vol: 0.8 }, c => {
  const o = c.buf(), len = 1.2, n = c.S(len);
  const f = D.env(n, c.sr, [[0, 380], [0.06, 452], [1.0, 448], [len, 430]], 'exp');
  const x = D.osc(n, c.sr, 'saw', f); D.add(x, D.osc(n, c.sr, 'saw', D.mul(D.clone(f), 1.004)), 0.8);
  D.add(x, D.osc(n, c.sr, 'square', D.mul(D.clone(f), 0.5)), 0.3);
  const f1 = D.svf(new Float32Array(x), c.sr, 'bpq', 1200, 3), f2 = D.svf(new Float32Array(x), c.sr, 'bpq', 2500, 4);
  D.add(x, f1, 0.3); D.add(x, f2, 0.2);
  D.band(x, c.sr, 350, 6000); D.shape(x, 3 / (D.peak(x) || 1));
  D.mul(x, D.env(n, c.sr, [[0, 0], [0.02, 1], [len - 0.1, 1], [len, 0]]));
  c.place(o, norm(x), 0, 1);
  c.place(o, hiss(c, { len, lo: 4000, hi: 10000, a: 0.02, r: 0.1 }), 0, 0.12);
  return o;
});
def('clownhorn', { dur: 0.6, vol: 0.7 }, c => {
  const o = c.buf(), len = 0.48, n = c.S(len);
  const f = D.env(n, c.sr, [[0, 300], [0.04, 392], [0.35, 380], [len, 330]], 'exp');
  const x = D.osc(n, c.sr, 'pulse', f, { pw: 0.3 });
  const y = D.sum(n, [D.svf(new Float32Array(x), c.sr, 'bpq', 1100, 3), 1], [D.svf(new Float32Array(x), c.sr, 'bpq', 2600, 4), 0.5], [x, 0.15]);
  D.svf(y, c.sr, 'lp', 3500); D.shape(y, 3 / (D.peak(y) || 1));
  D.mul(y, D.env(n, c.sr, [[0, 0], [0.015, 1], [len - 0.06, 0.9], [len, 0]]));
  c.place(o, norm(y), 0, 1);
  c.place(o, beep(c, { f: [[0, 1800], [0.08, 1500]], len: 0.08, r: 0.05 }), len - 0.03, 0.12);
  return o;
});
def('squeak', { dur: 0.4, vol: 0.6 }, c => {
  const o = c.buf(), len = 0.36;
  c.place(o, vox(c, { len, f0: [[0, 1200], [0.08, 2100], [0.25, 1900], [len, 1500]], vowels: [[0, 'i'], [len, 'ee']], scale: 2.0, breath: 0.3, vib: [11, 0.02], direct: 0.6, directLp: 3000, amp: [[0, 0], [0.02, 1], [0.28, 0.8], [len, 0]] }), 0, 1);
  return o;
});
def('register', { dur: 0.8, vol: 0.7 }, c => {
  const o = c.buf();
  for (const [t, f] of [[0, 1500], [0.07, 2200]]) { c.place(o, click(c, { f, q: 3, len: 0.03 }), t, 0.6); c.place(o, metal(c, { f: f * 0.6, count: 5, t60: 0.05, len: 0.08 }), t, 0.3); }
  const e = new Float32Array(c.S(0.9)); e[0] = 1; const f = 2350;
  c.place(o, D.modal(e, c.sr, [[f, 0.75, 1], [f * 1.004, 0.7, 0.5], [f * 2.03, 0.45, 0.45], [f * 2.7, 0.4, 0.35], [f * 3.9, 0.25, 0.2], [f * 5.1, 0.15, 0.1]]), 0.12, 0.8);
  const n = c.S(0.3), sl = D.noise(n, c.rng, 'pink'); D.svf(sl, c.sr, 'bp', D.ramp(n, 600, 1100, true), 1);
  const rc = D.dust(n, c.sr, c.rng, 150); D.add(sl, rc, 2); D.mul(sl, D.env(n, c.sr, [[0, 0], [0.05, 1], [0.3, 0.6]]));
  c.place(o, norm(sl), 0.15, 0.4);
  c.place(o, wood(c, { f: 260, t60: 0.1 }), 0.45, 0.6);
  c.place(o, metal(c, { f: 500, count: 6, t60: 0.12, len: 0.2 }), 0.45, 0.35);
  for (let k = 0; k < 4; k++) c.place(o, coin(c), 0.47 + k * 0.04 + c.rng() * 0.02, 0.2);
  return o;
});
def('phone_ring', { rotate: false, dur: 3.0, loop: true, vol: 0.6, warm: 1.3, xf: 0.02 }, c => {
  const eA = c.buf(), eB = c.buf(), imp = new Float32Array(1); imp[0] = 1;
  for (let k = 0; k < 48; k++) c.place(k % 2 ? eB : eA, imp, 0.01 + k / 40, k < 3 ? 0.6 + k * 0.15 : 1);
  const o = D.modal(eA, c.sr, [[1650, 0.9, 1], [1653, 0.9, 0.4], [4420, 0.4, 0.4], [7150, 0.2, 0.15]]);
  D.modal(eB, c.sr, [[1855, 0.9, 1], [1859, 0.85, 0.4], [4950, 0.35, 0.35], [7800, 0.18, 0.12]], o);
  return sat(o, 1.2);
});
def('teeth_chatter', { dur: 1.0, vol: 0.55 }, c => {
  const o = c.buf(), r = c.rng;
  for (let k = 0; k < 5; k++) c.place(o, click(c, { f: 3200, q: 6, len: 0.015 }), k * 0.03, 0.25);
  for (let k = 0; k < 13; k++) {
    const t = 0.12 + k / 16;
    c.place(o, wood(c, { f: (k % 2 ? 1250 : 1450) * r.range(0.97, 1.03), t60: 0.03, len: 0.06 }), t, 0.8);
    c.place(o, click(c, { f: 3000, q: 3, len: 0.012 }), t, 0.4);
  }
  const n = c.S(0.85), wh = D.osc(n, c.sr, 'saw', 60); D.svf(wh, c.sr, 'lp', 500);
  for (let i = 0; i < n; i++) wh[i] *= 0.5 + 0.5 * Math.sin(TAU * 16 * i / c.sr);
  D.mul(wh, D.env(n, c.sr, [[0, 0], [0.1, 1], [0.85, 0]])); c.place(o, wh, 0.05, 0.12);
  return o;
});
def('bell_ding', { dur: 1.4, vol: 0.6 }, c => {
  const o = c.buf(), f = 880;
  const e = new Float32Array(c.S(1.8)); e[0] = 1;
  const modes = [[0.5, 1.6, 0.3], [1, 1.4, 0.8], [1.19, 1.2, 0.5], [1.5, 1.0, 0.4], [2, 1.3, 1], [2.52, 0.8, 0.35], [3.0, 0.6, 0.3], [4.1, 0.4, 0.15]];
  const m = []; for (const [r, t, a] of modes) { m.push([f * r, t, a]); m.push([f * r + 1.3, t * 0.95, a * 0.5]); }
  c.place(o, D.modal(e, c.sr, m), 0, 1);
  c.place(o, click(c, { f: 4000, q: 2, len: 0.01 }), 0, 0.2);
  return o;
});
def('stun_bang', { dur: 4.0, vol: 0.9 }, c => {
  const o = c.buf();
  c.place(o, nburst(c, { len: 0.05, type: 'hp', f: 600, t60: 0.04, a: 0.0001 }), 0, 1);
  c.place(o, thud(c, { f0: 95, f1: 35, len: 1.0, drop: 0.08, t60: 0.8, click: 0, body: 0.4 }), 0, 0.9);
  const n0 = c.S(1.2), ru = D.noise(n0, c.rng, 'brown'); D.svf(ru, c.sr, 'lp', 400); D.mul(ru, D.perc(n0, c.sr, 0.005, 1.0));
  c.place(o, norm(ru), 0, 0.6);
  const n = c.S(3.9), ti = D.osc(n, c.sr, 'sine', 3900); D.add(ti, D.osc(n, c.sr, 'sine', 3921), 0.7);
  D.mul(ti, D.env(n, c.sr, [[0, 0], [0.12, 1], [1.5, 0.75], [3.9, 0]]));
  c.place(o, ti, 0.05, 0.3);
  sat(o, 1.5);
  return o;
});
def('stun_pin', { dur: 0.35, vol: 0.6 }, c => {
  const o = c.buf();
  c.place(o, metal(c, { f: 2900, count: 5, t60: 0.25, len: 0.3 }), 0, 0.6);
  c.place(o, click(c, { f: 2200, q: 4, len: 0.02 }), 0, 0.5);
  c.place(o, metal(c, { f: 700, count: 6, t60: 0.1, len: 0.2 }), 0.06, 0.5);
  return o;
});
def('taser_zap', { dur: 1.0, loop: true, vol: 0.7, warm: 0.1, xf: 0.03 }, c => {
  const o = c.buf(), r = c.rng;
  // chattering arc: buzzy harmonic tone gated by a random on/off pattern
  const gate = c.noise(); D.lp1(gate, c.sr, 45); for (let i = 0; i < c.N; i++) gate[i] = gate[i] > -0.05 ? 1 : 0.15;
  D.lp1(gate, c.sr, 250);
  const arc = c.osc('saw', 120); D.add(arc, c.osc('square', 240), 0.5);
  D.svf(arc, c.sr, 'bpq', 1400, 1.2); D.svf(arc, c.sr, 'hp', 200);
  D.mul(arc, gate); D.add(o, norm(arc), 0.8);
  const hum = c.osc('sine', 120); D.mul(hum, gate); D.add(o, hum, 0.25);
  // discharge snaps
  for (let k = 0; k < 18; k++) {
    const t = k / 18 + r.range(-0.008, 0.008), g = r.range(0.5, 1);
    const n = c.S(0.02), x = D.noise(n, r); D.mul(x, D.perc(n, c.sr, 0.0001, 0.008));
    const y = D.sum(n, [D.svf(new Float32Array(x), c.sr, 'bpq', r.range(1800, 2800), 2), 1], [D.svf(new Float32Array(x), c.sr, 'hp', 1500), 0.4]);
    c.place(o, norm(y), t, g * 0.9);
  }
  const sz = c.noise(); D.svf(sz, c.sr, 'bp', 5000, 0.7); D.mul(sz, gate); D.add(o, norm(sz), 0.1);
  return sat(o, 2.2);
});
def('shotgun_fire', { dur: 1.0, vol: 0.9 }, c => {
  const o = c.buf();
  c.place(o, nburst(c, { len: 0.04, type: 'hp', f: 400, t60: 0.03, a: 0.0003 }), 0, 1);
  c.place(o, thud(c, { f0: 150, f1: 45, len: 0.4, drop: 0.025, t60: 0.3, click: 0.2, body: 0.8 }), 0, 1.2);
  const n = c.S(1.4), t = D.noise(n, c.rng, 'brown'); D.svf(t, c.sr, 'lp', 500); D.mul(t, D.perc(n, c.sr, 0.004, 1.2));
  c.place(o, norm(t), 0.005, 0.6);
  c.place(o, click(c, { f: 2500, q: 3, len: 0.02 }), 0, 0.3);
  sat(o, 2.5);
  const echo = D.svf(D.clone(o), c.sr, 'lp', 1200); c.place(o, echo, 0.12, 0.2);
  return o;
});
def('shotgun_reload', { dur: 0.85, vol: 0.6 }, c => {
  const o = c.buf();
  for (const t of [0, 0.2]) { c.place(o, metal(c, { f: 1200, count: 5, t60: 0.06, len: 0.1 }), t, 0.6); c.place(o, click(c, { f: 2500, q: 4, len: 0.02 }), t, 0.5); }
  c.place(o, nburst(c, { len: 0.07, f: 1500, q: 1, t60: 0.06 }), 0.48, 0.35);
  c.place(o, metal(c, { f: 800, count: 6, t60: 0.08, len: 0.12 }), 0.52, 0.7);
  c.place(o, nburst(c, { len: 0.06, f: 1700, q: 1, t60: 0.05 }), 0.64, 0.35);
  c.place(o, metal(c, { f: 950, count: 6, t60: 0.1, len: 0.14 }), 0.68, 0.9);
  c.place(o, thud(c, { f0: 200, f1: 110, len: 0.08, click: 0, body: 0.3 }), 0.68, 0.4);
  return o;
});
def('harpoon_fire', { dur: 0.7, vol: 0.8 }, c => {
  const o = c.buf();
  c.place(o, click(c, { f: 2000, q: 4, len: 0.02 }), 0, 0.5);
  c.place(o, thud(c, { f0: 180, f1: 60, len: 0.3, drop: 0.02, t60: 0.2, click: 0.3, body: 0.6 }), 0.01, 1);
  c.place(o, hiss(c, { len: 0.35, lo: 1000, hi: 6000, a: 0.003, r: 0.3 }), 0.01, 0.5);
  const tw = iPluck(c, 38, 0.9, 1, { t60: 0.8, bright: 0.9, ring: 0.9 }); c.place(o, tw, 0.03, 0.35);
  c.place(o, whoosh(c, { len: 0.45, f0: 1500, f1: 1200, f2: 500, q: 3, peakAt: 0.1, color: 'white' }), 0.02, 0.3);
  return o;
});
def('walkie_on', { dur: 0.3, vol: 0.55 }, c => {
  const o = c.buf();
  c.place(o, click(c, { f: 2000, q: 4, len: 0.02 }), 0, 0.6);
  c.place(o, click(c, { f: 900, q: 2, len: 0.02 }), 0, 0.4);
  const n = c.S(0.16), s = D.noise(n, c.rng); D.band(s, c.sr, 300, 3000);
  D.mul(s, D.env(n, c.sr, [[0, 0], [0.005, 1], [0.15, 0.8], [0.16, 0]])); c.place(o, norm(s), 0.02, 0.45);
  c.place(o, beep(c, { f: 1400, len: 0.04, type: 'square', r: 0.005, lp: 3000 }), 0.2, 0.2);
  return o;
});
def('walkie_static', { dur: 2.0, loop: true, vol: 0.4, warm: 0.1, xf: 0.05 }, c => {
  const o = c.noise(); D.band(o, c.sr, 300, 3400);
  const am = c.wob([7, 11, 13, 3]); for (let i = 0; i < c.N; i++) o[i] *= 0.7 + 0.3 * am[i];
  for (let k = 0; k < 40; k++) c.place(o, nburst(c, { len: 0.006, type: 'hp', f: 1000, t60: 0.004 }), c.rng() * 2, c.rng.range(0.5, 1.5));
  const wh = c.osc('sine', 1000); D.add(o, wh, 0.03);
  return D.crush(o, 6, 1);
});
/** Boombox speaker: band-limit, then joint-normalized soft saturation. */
function lofi(c, st, lo = 90, hi = 8500, drive = 1.3) {
  for (const ch of st) D.band(ch, c.sr, lo, hi);
  const p = Math.max(...st.map(D.peak)) || 1;
  for (const ch of st) D.shape(ch, drive / p);
  return st;
}
// --- Boombox 1: groovy funk, E dorian, 110 bpm, 8 bars
const FUNK_STEP = 60 / 110 / 4;
def('boombox_1', { rotate: -0.004, dur: FUNK_STEP * 128, loop: true, vol: 0.6, warm: 0.3, xf: 0.02 }, c => {
  const o = stereo(c), s = FUNK_STEP, sw = 0.12;
  const rep = (str, k) => Array(k).fill(str).join(' | ');
  const R = n => Array(n).fill('.').join(' ');
  seq(c, o, rep('X . . . . . x . . . X . . . . . | X . . . . . x . . . X . . x . .', 4), s, (cc, m, l, v) => iKick(cc, v), { g: 1.0, swing: sw });
  seq(c, o, rep('. . . . X . . o . o . . X . . o', 8), s, (cc, m, l, v) => iSnare(cc, v), { g: 0.7, swing: sw });
  seq(c, o, rep('X o x o X o x o X o x o X o x o', 8), s, (cc, m, l, v) => iHat(cc, v), { g: 0.35, swing: sw, pan: 0.3 });
  seq(c, o, rep('. . . . . . . . . . . . . . x . | . . . . . . . . . . . . . . . .', 4), s, (cc, m, l, v) => iHat(cc, v, true), { g: 0.25, swing: sw, pan: 0.3 });
  const bass = 'E2 . . E3 . . E2 . G2 . A2 . . B2 D3 . | E2 . . E3 . . E2 E2 G2 . A2 . B2 . A2 G2 | A2 . . A3 . . A2 . C3 . C#3 . . E3 G3 . | A2 . . A3 . . A2 A2 G2 . E2 . G2 . F#2 .';
  seq(c, o, bass + ' | ' + bass, s, (cc, m, l, v) => iBass(cc, m, Math.min(l, s * 1.6), v, { cut1: 2800, cut0: 380, fdec: 0.06, q: 2.2, sus: 0.5, drive: 1.5 }), { g: 0.85, swing: sw });
  const Em = 'E4,G4,B4,D5', A7 = 'E4,G4,A4,C#5';
  const clavBar = ch => `. . ${ch} . . ${ch} . . . . ${ch} . . ${ch} . .`;
  const clav4 = [clavBar(Em), clavBar(Em), clavBar(A7), clavBar(A7)].join(' | ');
  seq(c, o, clav4 + ' | ' + clav4, s, (cc, m, l, v) => {
    const f = D.mtof(m), n = cc.S(0.16), x = D.osc(n, cc.sr, 'pulse', f, { pw: 0.2 });
    D.svf(x, cc.sr, 'bpq', D.env(n, cc.sr, [[0, 3200], [0.1, 900]], 'exp'), 2.5);
    D.mul(x, D.env(n, cc.sr, [[0, 0], [0.002, 1], [0.08, 0.5], [0.16, 0]]));
    return D.mul(x, 0.25);
  }, { g: 0.5, swing: sw, pan: -0.4 });
  const lead = 'B4 . D5 . E5 . . D5 . B4 . A4 . G4 A4 . | B4 - - . . . G4 A4 B4 . D5 . B4 - - . | C#5 . E5 . G5 . . E5 . C#5 . A4 . B4 C#5 . | E5 - - - . . D5 . B4 . A4 . G4 . E4 .';
  seq(c, o, R(64) + ' ' + lead, s, (cc, m, l, v) => iChip(cc, m, l * 0.9, v, { pw: 0.3, vib: 0.008, lp: 5000, sus: 0.7 }), { g: 0.4, swing: sw, pan: 0.2 });
  const stab = 'E4,G4,B4,D5 . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . | A3,C#4,E4,G4 . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .';
  seq(c, o, stab + ' | ' + stab, s, (cc, m, l, v) => iSaw(cc, m, 0.12, v, { voices: 3, c1: 4000, c0: 1500, sus: 0.3 }), { g: 0.3, swing: sw, pan: -0.1 });
  return lofi(c, D.reverb(o, c.sr, { room: 0.4, wet: 0.08, damp: 0.5, down: 3 }), 70, 9000, 1.2);
});
// --- Boombox 2: eurobeat-ish, A minor, 150 bpm, 12 bars
const EURO_STEP = 60 / 150 / 4;
def('boombox_2', { rotate: -0.004, dur: EURO_STEP * 192, loop: true, vol: 0.6, warm: 0.4, xf: 0.02 }, c => {
  const o = stereo(c), s = EURO_STEP;
  const rep = (str, k) => Array(k).fill(str).join(' | ');
  seq(c, o, rep('X . . . X . . . X . . . X . . .', 12), s, (cc, m, l, v) => iKick(cc, v), { g: 1 });
  seq(c, o, rep('. . . . X . . . . . . . X . . .', 12), s, (cc, m, l, v) => iClap(cc, v), { g: 0.55 });
  seq(c, o, rep('. . x . . . x . . . x . . . x .', 12), s, (cc, m, l, v) => iHat(cc, v, true), { g: 0.3, pan: 0.25 });
  seq(c, o, rep('o . . o o . . o o . . o o . . o', 12), s, (cc, m, l, v) => iHat(cc, v), { g: 0.25, pan: -0.25 });
  const roots = ['A', 'F', 'G', 'E'];
  const bassBar = r => `${r}2 . ${r}3 . ${r}2 . ${r}3 . ${r}2 . ${r}3 . ${r}2 . ${r}3 .`;
  seq(c, o, rep(roots.map(bassBar).join(' | '), 3), s, (cc, m, l, v) => iBass(cc, m, s * 1.7, v, { cut1: 3000, cut0: 600, fdec: 0.08, sus: 0.6 }), { g: 0.8 });
  const chords = ['A3,C4,E4', 'F3,A3,C4', 'G3,B3,D4', 'E3,G3,B3'];
  seq(c, o, rep(chords.map(ch => ch + ' - - - - - - - - - - - - - - -').join(' | '), 3), s, (cc, m, l, v) => iPad(cc, m, l, v, { voices: 3, att: 0.05, rel: 0.3, cut: 1800, detune: 18 }), { g: 0.35 });
  const arp = ['A4 C5 E5 A5 E5 C5 A4 C5 E5 A5 E5 C5 A4 C5 E5 C5', 'F4 A4 C5 F5 C5 A4 F4 A4 C5 F5 C5 A4 F4 A4 C5 A4', 'G4 B4 D5 G5 D5 B4 G4 B4 D5 G5 D5 B4 G4 B4 D5 B4', 'E4 G4 B4 E5 B4 G4 E4 G4 B4 E5 B4 G4 E4 G4 B4 G4'];
  seq(c, o, arp.join(' | '), s, (cc, m, l, v) => iChip(cc, m, s * 0.8, v, { type: 'square', lp: 3500, sus: 0.3, dec: 0.05 }), { g: 0.22, pan: m => (m % 2 ? -0.5 : 0.5) });
  const e8 = str => str.split(' ').map(t => t === '-' ? '- -' : t + ' ' + (t === '.' ? '.' : '-')).join(' ');
  const lead = ['A4 . C5 . E5 . D5 C5', 'C5 . A4 . F4 . A4 C5', 'D5 . B4 . G4 . B4 D5', 'E5 - - . D5 . B4 .', 'A5 . G5 . E5 . C5 .', 'F5 . E5 . C5 . A4 C5', 'D5 . G5 . F5 . D5 B4', 'E5 - - - B4 . E5 .'].map(e8).join(' | ');
  const R = n => Array(n).fill('.').join(' ');
  const leadInst = (cc, m, l, v) => { const a = iSaw(cc, m, l * 0.92, v, { voices: 5, detune: 25, c1: 6500, c0: 3800 }); D.add(a, iSaw(cc, m + 12, l * 0.92, v * 0.4, { voices: 3, detune: 15 }), 1); return a; };
  seq(c, o, R(64) + ' ' + lead, s, leadInst, { g: 0.45 });
  return lofi(c, D.reverb(o, c.sr, { room: 0.55, wet: 0.12, damp: 0.4, down: 3 }), 60, 9500, 1.15);
});
// --- Boombox 3: Turkish arabesque (Hicaz on D), 96 bpm, 8 bars, maqsum on darbuka
const ARAB_STEP = 60 / 96 / 4;
def('boombox_3', { rotate: -0.004, dur: ARAB_STEP * 128, loop: true, vol: 0.6, warm: 0.6, xf: 0.02 }, c => {
  const o = stereo(c), s = ARAB_STEP;
  const rep = (str, k) => Array(k).fill(str).join(' | ');
  seq(c, o, rep('X . . . . . . . X . . . . . . .', 8), s, (cc, m, l, v) => iDoum(cc, v), { g: 0.9 });
  seq(c, o, rep('. . X . . . X . . . . . X . . .', 8), s, (cc, m, l, v) => iTek(cc, v), { g: 0.6, pan: 0.2 });
  seq(c, o, rep('. o . o . o . . . o . o . o . o', 8), s, (cc, m, l, v) => iTek(cc, v, true), { g: 0.45, pan: 0.35, hum: 0.004 });
  const roots = ['D2', 'G2', 'D2', 'D2', 'C2', 'G2', 'C2', 'D2'];
  seq(c, o, roots.map(r => `${r} . . . . . ${r} . ${r} . . . . . . .`).join(' | '), s, (cc, m, l, v) => iBass(cc, m, s * 3, v, { type: 'tri', sq: 0.2, cut1: 900, cut0: 300 }), { g: 0.7 });
  const chords = { D: 'D4,F#4,A4', Gm: 'G3,Bb3,D4', Cm: 'C4,Eb4,G4' };
  const prog = ['D', 'Gm', 'D', 'D', 'Cm', 'Gm', 'Cm', 'D'];
  seq(c, o, prog.map(p => chords[p] + ' - - - - - - - - - - - - - - -').join(' | '), s, (cc, m, l, v) => iStrings(cc, m, l, v * 0.5, { att: 0.3, rel: 0.5, cut: 1800 }), { g: 0.35, pan: -0.3 });
  const mel8 = ['D5 - C5 Bb4 A4 - G4 A4', 'Bb4 A4 G4 F#4 G4 - - .', 'F#4 G4 A4 Bb4 C5 Bb4 A4 G4', 'A4 - - - - - . .', 'A4 Bb4 C5 D5 Eb5 D5 C5 Bb4', 'C5 Bb4 A4 G4 A4 - Bb4 A4', 'G4 F#4 Eb4 F#4 G4 A4 G4 F#4', 'D4 - - - - - . .'];
  const e8 = str => str.split(' ').map(t => t === '-' ? '- -' : t + ' ' + (t === '.' ? '.' : '-')).join(' ');
  const mel = mel8.map(e8).join(' | ');
  // baglama: bright pluck, tremolo-picked on long notes
  seq(c, o, mel, s, (cc, m, l, v) => {
    const out = new Float32Array(cc.S(l + 0.6));
    const reps = l > s * 2.5 ? Math.floor(l / s) : 1;
    for (let k = 0; k < reps; k++) D.add(out, iPluck(cc, m, s, (k ? 0.55 : 1) * v, { t60: 0.9, bright: 0.85, pick: 0.13, ring: 0.6 }), 1, cc.S(k * s));
    return out;
  }, { g: 0.55, pan: 0.25 });
  // string section doubling the melody an octave lower with arabesk vibrato
  seq(c, o, mel, s, (cc, m, l, v) => iStrings(cc, m - 12, l, v, { vr: 6, vd: 0.012, att: 0.05, cut: 3000 }), { g: 0.4, pan: -0.15 });
  return lofi(c, D.reverb(o, c.sr, { room: 0.7, wet: 0.2, damp: 0.45, down: 3 }), 80, 8500, 1.2);
});
def('jetpack', { dur: 2.0, loop: true, vol: 0.6, warm: 0.2, xf: 0.05 }, c => {
  const o = c.buf();
  const a = c.noise('pink'); D.svf(a, c.sr, 'lp', 1200, 0.8); D.add(o, a, 1);
  const b = c.noise('brown'); D.svf(b, c.sr, 'lp', 250); D.add(o, b, 1.2);
  const h = c.noise(); D.svf(h, c.sr, 'hp', 4000); D.add(o, h, 0.08);
  const fl = c.wob([21, 29, 37, 43]); for (let i = 0; i < c.N; i++) o[i] *= 0.7 + 0.3 * fl[i];
  return sat(o, 1.5);
});
def('glowstick_crack', { dur: 0.5, vol: 0.55 }, c => {
  const o = c.buf();
  c.place(o, creak(c, { len: 0.06, rate: [[0, 150], [1, 250]], res: [1500, 3000], q: 8 }), 0, 0.3);
  for (const [t, g] of [[0.05, 1], [0.065, 0.6], [0.09, 0.8]]) {
    c.place(o, click(c, { f: 2500, q: 2, len: 0.015 }), t, g);
    c.place(o, nburst(c, { len: 0.004, type: 'hp', f: 2000, t60: 0.003 }), t, g * 0.7);
  }
  for (const t of [0.22, 0.34]) {
    const n = c.S(0.1), sl = D.noise(n, c.rng); D.svf(sl, c.sr, 'bpq', 600, 3);
    for (let i = 0; i < n; i++) sl[i] *= 0.5 + 0.5 * Math.sin(TAU * 30 * i / c.sr);
    D.mul(sl, D.env(n, c.sr, [[0, 0], [0.03, 1], [0.1, 0]])); c.place(o, norm(sl), t, 0.12);
    c.place(o, bubble(c, { f: 1500, len: 0.02, rise: 1 }), t + 0.03, 0.08);
  }
  return o;
});

// =====================================================================================
// MINIGAMES
// =====================================================================================
CAT = 'minigame';
def('fish_cast', { dur: 1.0, vol: 0.6 }, c => {
  const o = c.buf();
  c.place(o, whoosh(c, { len: 0.35, f0: 400, f1: 2000, f2: 700, q: 1.4 }), 0, 0.7);
  let t = 0.15, rate = 60;
  while (t < 0.9) { c.place(o, click(c, { f: 4000, q: 6, len: 0.01 }), t, 0.4 * (1 - (t - 0.15) / 0.9)); t += 1 / rate; rate = Math.max(9, rate * 0.94); }
  const n = c.S(0.75), wh = D.noise(n, c.rng); D.svf(wh, c.sr, 'bpq', D.ramp(n, 3200, 2200), 3);
  D.mul(wh, D.env(n, c.sr, [[0, 0], [0.05, 1], [0.75, 0]])); c.place(o, norm(wh), 0.15, 0.2);
  return o;
});
function splash(c, o, t0, big = 1) {
  const r = c.rng;
  const n = c.S(0.35), s = D.noise(n, r); D.svf(s, c.sr, 'lp', 3500); D.svf(s, c.sr, 'hp', 300);
  D.mul(s, D.env(n, c.sr, [[0, 0], [0.005, 1], [0.08, 0.5], [0.35, 0]]));
  c.place(o, norm(s), t0, 0.7 * big);
  c.place(o, thud(c, { f0: 130, f1: 60, len: 0.15, t60: 0.1, click: 0, body: 0.4 }), t0, 0.5 * big);
  for (let k = 0; k < 12; k++) c.place(o, bubble(c, { f: r.range(600, 2000), len: r.range(0.03, 0.08), rise: 2 }), t0 + 0.02 + r() * 0.38, r.range(0.1, 0.3));
  for (let k = 0; k < 8; k++) c.place(o, bubble(c, { f: r.range(1800, 3500), len: 0.02, rise: 1 }), t0 + 0.3 + r() * 0.45, r.range(0.05, 0.15));
}
def('fish_splash', { dur: 0.85, vol: 0.6 }, c => { const o = c.buf(); splash(c, o, 0, 1); return o; });
def('fish_bite', { dur: 0.45, vol: 0.6 }, c => {
  const o = c.buf();
  c.place(o, bubble(c, { f: 280, len: 0.12, rise: 2.5 }), 0, 1);
  c.place(o, thud(c, { f0: 160, f1: 80, len: 0.08, click: 0, body: 0.2 }), 0, 0.3);
  c.place(o, nburst(c, { len: 0.04, type: 'hp', f: 2000, t60: 0.035 }), 0.005, 0.2);
  c.place(o, bubble(c, { f: 900, len: 0.03, rise: 2 }), 0.13, 0.2);
  c.place(o, bubble(c, { f: 1300, len: 0.025, rise: 2 }), 0.2, 0.15);
  return o;
});
def('reel_loop', { dur: 1.0, loop: true, vol: 0.5, warm: 0.05, xf: 0.01 }, c => {
  const o = c.buf();
  for (let k = 0; k < 24; k++) {
    c.place(o, click(c, { f: 3500, q: 8, len: 0.012 }), k / 24, k % 4 === 0 ? 0.8 : 0.55);
    c.place(o, click(c, { f: 1200, q: 3, len: 0.012 }), k / 24, 0.3);
  }
  const wh = c.noise(); D.svf(wh, c.sr, 'bpq', 1800, 2);
  D.mul(wh, c.curve(t => 0.6 + 0.4 * Math.cos(TAU * 24 * t))); D.add(o, norm(wh), 0.12);
  return o;
});
def('fish_caught', { dur: 1.6, vol: 0.6 }, c => {
  const o = c.buf();
  splash(c, o, 0, 0.6);
  [[67, 0.15], [72, 0.23], [76, 0.31], [79, 0.39], [84, 0.47]].forEach(([m, t]) => c.place(o, iPluck(c, m, 0.3, 1, { t60: 0.8, bright: 0.8, ring: 0.9 }), t, 0.5));
  for (const m of [72, 76, 79, 84]) c.place(o, iPluck(c, m, 0.9, 1, { t60: 1.0, bright: 0.7, ring: 1.0 }), 0.58, 0.3);
  for (let k = 0; k < 6; k++) c.place(o, beep(c, { f: c.rng.range(3000, 6000), len: 0.05, r: 0.04 }), 0.6 + k * 0.07, 0.08);
  return o;
});
def('slot_spin', { dur: 1.2, loop: true, vol: 0.5, warm: 0.05, xf: 0.01 }, c => {
  const o = c.buf();
  const wh = c.noise(); D.svf(wh, c.sr, 'bpq', 900, 2);
  D.mul(wh, c.curve(t => 0.6 + 0.4 * Math.cos(TAU * 30 * t))); D.add(o, norm(wh), 0.3);
  for (let k = 0; k < 36; k++) c.place(o, click(c, { f: 2500, q: 5, len: 0.012 }), k / 30, 0.45);
  const hum = c.osc('saw', 60); D.svf(hum, c.sr, 'lp', 300); D.add(o, hum, 0.15);
  const notes = [84, 88, 91, 96];
  for (let k = 0; k < 16; k++) c.place(o, iChip(c, notes[k % 4], 0.06, 1, { type: 'square', lp: 5000, sus: 0.5, rel: 0.01 }), k * 0.075, 0.1);
  return o;
});
def('slot_stop', { dur: 0.3, vol: 0.6 }, c => {
  const o = c.buf();
  c.place(o, thud(c, { f0: 200, f1: 90, len: 0.12, t60: 0.08, click: 0.2, body: 0.3 }), 0, 0.8);
  c.place(o, metal(c, { f: 600, count: 5, t60: 0.1, len: 0.15 }), 0, 0.5);
  c.place(o, click(c, { f: 2200, q: 4, len: 0.02 }), 0, 0.5);
  return o;
});
function fmBell(c, m, len = 1, v = 1) { return iEP(c, m, 0.05, v, { ratio: 3.5, i0: 1.8, i1: 0.2, dec: len * 0.6, sus: 0, rel: len }); }
def('slot_win', { dur: 1.5, vol: 0.6 }, c => {
  const o = c.buf();
  [72, 76, 79, 84, 76, 79, 84, 88].forEach((m, k) => c.place(o, fmBell(c, m, 0.8, 0.8), k * 0.08, 0.5));
  for (let k = 0; k < 10; k++) c.place(o, coin(c), 0.3 + c.rng() * 0.9, 0.25);
  return o;
});
def('slot_jackpot', { dur: 3.6, vol: 0.7 }, c => {
  const o = c.buf(), r = c.rng;
  const e = new Float32Array(c.S(3.4)); for (let k = 0; k < 75; k++) e[c.S(k / 25)] = 1;
  const bell = D.modal(e, c.sr, [[2200, 0.5, 1], [2207, 0.5, 0.5], [5100, 0.25, 0.4], [6300, 0.15, 0.2]]);
  D.mul(bell, D.env(bell.length, c.sr, [[0, 1], [3.0, 1], [3.4, 0]]));
  c.place(o, norm(bell), 0, 0.3);
  const fan = [72, 76, 79, 84, 76, 79, 84, 88, 79, 84, 88, 91];
  fan.forEach((m, k) => c.place(o, iChip(c, m, 0.08, 1, { pw: 0.25, lp: 6000 }), k * 0.09, 0.35));
  for (const m of [84, 88, 91, 96]) c.place(o, iChip(c, m, 1.4, 1, { pw: 0.25, vib: 0.01, sus: 0.8, rel: 0.4, lp: 6000 }), 1.1, 0.18);
  for (let k = 0; k < 60; k++) c.place(o, coin(c), 0.3 + Math.pow(r(), 0.8) * 3.0, r.range(0.1, 0.3));
  return o;
});
def('slot_lose', { dur: 1.1, vol: 0.55 }, c => {
  const o = c.buf();
  [[55, 0, 0.2], [54, 0.22, 0.2], [53, 0.44, 0.2], [52, 0.66, 0.42]].forEach(([m, t, len]) => {
    const n = c.S(len), f = new Float32Array(n), fm = D.mtof(m);
    for (let i = 0; i < n; i++) { const tt = i / c.sr; f[i] = fm * (1 + (len > 0.3 ? 0.02 * Math.sin(TAU * 6 * tt) : 0)); }
    const x = D.osc(n, c.sr, 'saw', f); D.add(x, D.osc(n, c.sr, 'square', f), 0.3);
    D.svf(x, c.sr, 'bpq', D.env(n, c.sr, [[0, 400], [len * 0.5, 1200], [len, 500]], 'exp'), 3);
    D.mul(x, D.env(n, c.sr, [[0, 0], [0.02, 1], [len - 0.04, 0.8], [len, 0]]));
    c.place(o, norm(x), t, 0.8);
  });
  return o;
});
const DTMF = [[697, 1209], [770, 1336], [852, 1477]];
DTMF.forEach(([a, b], k) => def(`keypad_beep_${k + 1}`, { dur: 0.13, vol: 0.45 }, c => {
  const o = c.buf();
  c.place(o, beep(c, { f: a, len: 0.1, r: 0.01 }), 0.005, 0.5);
  c.place(o, beep(c, { f: b, len: 0.1, r: 0.01 }), 0.005, 0.5);
  c.place(o, click(c, { f: 2500, q: 3, len: 0.01 }), 0, 0.3);
  return o;
}));
def('safe_click', { dur: 0.12, vol: 0.5 }, c => {
  const o = c.buf();
  c.place(o, metal(c, { f: 2200, count: 4, t60: 0.04, len: 0.06 }), 0, 0.7);
  c.place(o, click(c, { f: 700, q: 4, len: 0.03 }), 0, 0.5);
  return o;
});
def('wire_connect', { dur: 0.4, vol: 0.55 }, c => {
  const o = c.buf();
  c.place(o, click(c, { f: 2000, q: 3, len: 0.02 }), 0, 0.7);
  c.place(o, metal(c, { f: 1500, count: 4, t60: 0.05, len: 0.08 }), 0, 0.4);
  const n = c.S(0.02), z = D.dust(n, c.sr, c.rng, 3000); D.svf(z, c.sr, 'hp', 3000); c.place(o, norm(z), 0.02, 0.3);
  const h = beep(c, { f: 120, len: 0.25, type: 'saw', r: 0.15, lp: 1000 }); c.place(o, h, 0.05, 0.25);
  c.place(o, beep(c, { f: 880, len: 0.1, r: 0.06 }), 0.1, 0.3);
  return o;
});
def('spark', { dur: 0.6, vol: 0.6 }, c => {
  const o = c.buf(), r = c.rng;
  for (let k = 0; k < 25; k++) {
    const t = Math.pow(r(), 1.5) * 0.4;
    c.place(o, nburst(c, { len: r.range(0.001, 0.003), type: 'hp', f: 2000, t60: 0.002 }), t, r.range(0.4, 1));
    c.place(o, click(c, { f: r.range(3000, 6000), q: 3, len: 0.01 }), t, 0.3);
  }
  c.place(o, hiss(c, { len: 0.35, lo: 5000, hi: 12000, a: 0.003, r: 0.3 }), 0, 0.2);
  c.place(o, beep(c, { f: 60, len: 0.3, type: 'saw', r: 0.25, lp: 800 }), 0, 0.15);
  return o;
});
def('arcade_jump', { dur: 0.25, vol: 0.45 }, c => {
  const o = c.buf();
  c.place(o, beep(c, { f: [[0, 300], [0.15, 900]], len: 0.16, type: 'square', r: 0.03 }), 0, 0.6);
  return D.crush(o, 5, 2);
});
def('arcade_score', { dur: 0.36, vol: 0.45 }, c => {
  const o = c.buf();
  c.place(o, beep(c, { f: 988, len: 0.06, type: 'square', r: 0.005 }), 0, 0.5);
  c.place(o, beep(c, { f: 1319, len: 0.26, type: 'square', r: 0.15 }), 0.06, 0.5);
  return D.crush(o, 5, 2);
});
def('arcade_die', { dur: 1.0, vol: 0.5 }, c => {
  const o = c.buf(), len = 0.9, n = c.S(len), f = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / c.sr; f[i] = 900 * Math.exp(-t * 1.6) * (1 + 0.08 * Math.sin(TAU * 12 * t)); }
  const x = D.osc(n, c.sr, 'square', f); D.mul(x, D.env(n, c.sr, [[0, 0], [0.005, 1], [0.7, 0.8], [len, 0]]));
  c.place(o, x, 0, 0.5);
  c.place(o, nburst(c, { len: 0.15, type: 'lp', f: 3000, t60: 0.12 }), 0, 0.4);
  return D.crush(o, 5, 2);
});
def('lockpick_click', { dur: 0.1, vol: 0.4 }, c => {
  const o = c.buf();
  c.place(o, metal(c, { f: 3500, count: 3, t60: 0.03, len: 0.05 }), 0, 0.7);
  c.place(o, click(c, { f: 5000, q: 5, len: 0.01 }), 0, 0.4);
  return o;
});
def('lockpick_success', { dur: 0.6, vol: 0.55 }, c => {
  const o = c.buf();
  for (const t of [0, 0.05]) c.place(o, metal(c, { f: 3400, count: 3, t60: 0.03, len: 0.05 }), t, 0.5);
  c.place(o, metal(c, { f: 900, count: 6, t60: 0.12, len: 0.2 }), 0.15, 0.7);
  c.place(o, thud(c, { f0: 250, f1: 120, len: 0.1, click: 0.2, body: 0.3 }), 0.15, 0.5);
  c.place(o, metal(c, { f: 600, count: 6, t60: 0.15, len: 0.25 }), 0.3, 0.6);
  c.place(o, thud(c, { f0: 180, f1: 90, len: 0.12, click: 0.1, body: 0.4 }), 0.3, 0.5);
  return o;
});

// =====================================================================================
// COMPANY
// =====================================================================================
CAT = 'company';
def('company_bell', { dur: 2.0, vol: 0.6 }, c => {
  const o = c.buf(), f = 2300;
  const e = new Float32Array(c.S(2.2)); e[0] = 1;
  c.place(o, D.modal(e, c.sr, [[f, 1.8, 1], [f + 2.2, 1.7, 0.5], [f * 2.32, 1.2, 0.4], [f * 2.32 + 3, 1.1, 0.2], [f * 3.89, 0.8, 0.25], [f * 5.4, 0.5, 0.12], [f * 0.61, 1.5, 0.15]]), 0, 1);
  c.place(o, click(c, { f: 3500, q: 2, len: 0.01 }), 0, 0.3);
  c.place(o, wood(c, { f: 300, t60: 0.05 }), 0, 0.15);
  return D.reverb(o, c.sr, { room: 0.75, damp: 0.4, wet: 0.3 });
});
def('company_tentacle', { dur: 1.8, vol: 0.7 }, c => {
  const o = c.buf(), r = c.rng, len = 1.6, n = c.S(len);
  const x = D.noise(n, r, 'pink');
  const sl = D.formantFilter(x, c.sr, [[0, 'u'], [0.4, 'o'], [0.8, 'a'], [1.2, 'o'], [len, 'u']], 0.7, 1.5);
  const am = D.smoothNoise(n, c.sr, r, 12); for (let i = 0; i < n; i++) sl[i] *= Math.abs(am[i]) * 1.4;
  D.mul(sl, D.env(n, c.sr, [[0, 0], [0.1, 1], [1.3, 0.8], [len, 0]]));
  c.place(o, norm(sl), 0, 0.8);
  for (let k = 0; k < 9; k++) c.place(o, bubble(c, { f: r.range(200, 600), len: r.range(0.05, 0.12), rise: r.range(1, 3) }), 0.1 + r() * 1.4, r.range(0.3, 0.6));
  c.place(o, vox(c, { len: 1.5, f0: [[0, 58], [0.8, 66], [1.5, 52]], src: 'pulse', fry: 0.8, jitter: 0.1, scale: 0.6, breath: 0.4, vowels: [[0, 'o'], [1.5, 'u']], amp: [[0, 0], [0.5, 1], [1.5, 0]] }), 0.05, 0.3);
  for (let k = 0; k < 10; k++) c.place(o, D.svf(click(c, { f: r.range(600, 1500), q: 4, len: 0.02 }), c.sr, 'lp', 2000), r() * 1.6, 0.25);
  return D.svf(o, c.sr, 'lp', 5000);
});
def('coins', { dur: 1.0, vol: 0.6 }, c => {
  const o = c.buf(), r = c.rng;
  for (let k = 0; k < 45; k++) {
    const t = -Math.log(1 - r() * 0.97) * 0.25;
    if (t > 1.1) continue;
    c.place(o, coin(c), t, r.range(0.2, 0.6) * (1 - t * 0.6));
  }
  for (const t of [0.05, 0.2]) c.place(o, wood(c, { f: 350, t60: 0.06 }), t, 0.2);
  c.place(o, hiss(c, { len: 0.8, lo: 4000, hi: 11000, a: 0.02, r: 0.6 }), 0, 0.08);
  return o;
});
def('market_greet', { dur: 0.9, vol: 0.65 }, c => {
  const o = c.buf();
  c.place(o, vox(c, { len: 0.36, f0: [[0, 125], [0.12, 160], [0.36, 132]], vowels: [[0, 'm'], [0.36, 'm']], breath: 0.08, jitter: 0.02, gains: [1, 0.25, 0.1, 0], direct: 0.4, directLp: 500, amp: [[0, 0], [0.04, 1], [0.28, 0.9], [0.36, 0]] }), 0, 0.8);
  c.place(o, vox(c, { len: 0.34, f0: [[0, 150], [0.1, 200], [0.34, 175]], vowels: [[0, 'm'], [0.16, 'm'], [0.26, 'uh'], [0.34, 'm']], breath: 0.1, jitter: 0.02, gains: [1, 0.35, 0.15, 0], direct: 0.4, directLp: 600, amp: [[0, 0], [0.03, 1], [0.26, 1], [0.34, 0]] }), 0.46, 0.9);
  return D.svf(o, c.sr, 'lp', 3000);
});

// =====================================================================================
// MUSIC
// =====================================================================================
CAT = 'music';
def('menu_theme', { rotate: -0.004, dur: 40, loop: true, vol: 0.55, warm: 5, xf: 0.2 }, c => {
  const o = stereo(c), r = c.rng;
  // drone
  const dr = c.lowOsc('saw', 73.42); D.add(dr, c.lowOsc('saw', 73.6), 1);
  const cw = c.wob([1 / 40, 3 / 40]); D.svf(dr, c.sr, 'lp', c.curve((t, i) => 260 + 120 * cw[i]), 1.2);
  D.add(dr, c.lowOsc('sine', 36.7), 0.8); D.add(dr, c.lowOsc('sine', 110.1), 0.12);
  D.add(o[0], dr, 0.22); D.add(o[1], dr, 0.22);
  // chords, 10 s each
  const chords = [[0, 'D3 F3 A3 E4'], [10, 'Bb2 D3 F3 A3'], [20, 'G2 Bb2 D3 A3'], [30, 'A2 D3 E3 A3'], [35, 'A2 C#3 E3 A3']];
  chords.forEach(([t, ns], k) => {
    const len = k >= 3 ? 5 : 10, ms = ns.split(' ').map(D.noteToMidi);
    for (const side of [0, 1]) {
      const grp = ms.filter((m, j) => j % 2 === side);
      put(c, o, iPad(c, grp, len, 1, { voices: 3, detune: 10, att: 2.5, rel: 3.5, cut: 750 }), t, 0.35, side ? 0.35 : -0.35);
    }
  });
  // sparse melancholic melody (FM e-piano)
  const mel = [[2, 'A4', 1.8], [4, 'F4', 1.4], [5.5, 'E4', 1.4], [7, 'D4', 2.8], [12, 'D5', 1.4], [13.5, 'C5', 1.4], [15, 'A4', 1.8], [17, 'F4', 2.6],
    [22, 'Bb4', 1.4], [23.5, 'A4', 1.4], [25, 'G4', 1.4], [26.5, 'F4', 1.4], [28, 'D4', 2.5], [32, 'E4', 1.4], [33.5, 'A4', 1.4], [35, 'C#5', 1.8], [37, 'A4', 2.8]];
  const mb = stereo(c);
  for (const [t, nm, l] of mel) put(c, mb, iEP(c, D.noteToMidi(nm), l, r.range(0.7, 0.9), { i0: 1.4, i1: 0.3, dec: 2, sus: 0.25, rel: 1.2 }), t + r.range(-0.03, 0.03), 0.5, r.range(-0.3, 0.3));
  // ping-pong echo on the melody
  const eL = D.echo(mb[0], c.sr, 0.75, 0.35, 0.3, 0.5), eR = D.echo(mb[1], c.sr, 1.125, 0.3, 0.3, 0.5);
  D.add(o[0], eL, 1); D.add(o[1], eR, 1);
  // distant metallic groan + tape hiss
  const g = creak(c, { len: 2.2, rate: [[0, 14], [0.5, 26], [1, 16]], res: [200, 430, 760], q: 8 }); D.svf(g, c.sr, 'lp', 700);
  put(c, o, g, 18.5, 0.12, 0.6);
  for (const ch of o) { const h = c.noise(); D.svf(h, c.sr, 'hp', 3000); D.add(ch, h, 0.006); }
  return D.reverb(o, c.sr, { room: 0.9, damp: 0.5, wet: 0.45, dry: 0.7, size: 1.2, down: 3 });
});
def('level_up_jingle', { dur: 2.2, vol: 0.6 }, c => {
  const o = stereo(c), s = 0.09;
  seq(c, o, 'G4 C5 E5 G5 . E5 G5 - C6 - - - - - - - - - - -', s, (cc, m, l, v) => iChip(cc, m, l * 0.95, v, { pw: 0.25, vib: 0.012, sus: 0.7, rel: 0.2, lp: 7000 }), { g: 0.5, pan: -0.1 });
  seq(c, o, 'E4 G4 C5 E5 . C5 E5 - G5 - - - - - - - - - - -', s, (cc, m, l, v) => iChip(cc, m, l * 0.95, v, { pw: 0.5, sus: 0.6, rel: 0.2, lp: 5000 }), { g: 0.3, pan: 0.3 });
  seq(c, o, 'C3 - - - G2 - - - C3 - - - - - - - - - - -', s, (cc, m, l, v) => iChip(cc, m, l * 0.95, v, { type: 'tri', sus: 0.9, rel: 0.2 }), { g: 0.55 });
  seq(c, o, 'o o o o x . o o X . . . . . . . . . . .', s, (cc, m, l, v) => iSnare(cc, v), { g: 0.3 });
  const cr = nburst(c, { len: 1.3, type: 'hp', f: 5000, t60: 1.1 }); put(c, o, cr, 8 * s, 0.25, 0.2);
  put(c, o, iKick(c, 1), 8 * s, 0.6, 0);
  return D.reverb(o, c.sr, { room: 0.5, wet: 0.12 });
});
def('quota_jingle', { dur: 3.4, vol: 0.6 }, c => {
  const o = c.buf();
  const mar = (m, v = 1) => {
    const f = D.mtof(m), n = c.S(0.9), e = new Float32Array(n); e[0] = 1;
    return D.mul(D.modal(e, c.sr, [[f, 0.7, 1], [f * 3.99, 0.15, 0.35], [f * 9.9, 0.05, 0.1]]), v);
  };
  [[72, 0], [76, 0.15], [79, 0.3], [84, 0.45], [83, 0.75], [79, 0.9], [81, 1.05]].forEach(([m, t]) => c.place(o, mar(m), t, 0.7));
  for (const m of [60, 64, 67, 72]) c.place(o, mar(m, 0.6), 1.35, 0.6);
  c.place(o, iEP(c, 78, 1.0, 0.35, { i0: 1, rel: 0.8 }), 1.37, 1);    // off-key F#5 ghost
  c.place(o, iEP(c, 48, 1.2, 0.5, { i0: 1, rel: 0.8 }), 1.35, 1);
  const n = c.N, ratio = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / c.sr; ratio[i] = t < 2.0 ? 1 + 0.003 * Math.sin(TAU * 3 * t) : Math.max(0.45, 1 - (t - 2.0) * 0.7); }
  return D.reverb(D.resample(o, ratio, n), c.sr, { room: 0.55, wet: 0.15 });
});
def('death_sting', { dur: 3.3, vol: 0.8 }, c => {
  const o = stereo(c);
  put(c, o, thud(c, { f0: 70, f1: 28, len: 2, drop: 0.15, t60: 1.8, click: 0.2, body: 0.8 }), 0, 1);
  ['C3', 'C#3', 'F#3', 'G3', 'C4', 'C#4'].forEach((nm, k) => {
    const x = iStrings(c, D.noteToMidi(nm), 1.9, 1, { vr: 7 + k * 0.6, vd: 0.02, att: 0.08, rel: 1.0, cut: 3500, detune: 20 });
    put(c, o, x, 0.02, 0.3, (k / 5 - 0.5) * 1.2);
  });
  const n = c.S(2.2), fr = D.env(n, c.sr, [[0, 2000], [0.4, 3000], [2.2, 2400]], 'exp');
  const sc = D.fm(n, c.sr, fr, 1.41, 2.5); D.mul(sc, D.env(n, c.sr, [[0, 0], [0.3, 1], [2.2, 0]]));
  put(c, o, sc, 0.05, 0.1, 0);
  for (const ch of o) sat(ch, 1.5);
  return D.reverb(o, c.sr, { room: 0.85, wet: 0.35, damp: 0.4 });
});
def('chase_sting', { dur: 2.0, vol: 0.8 }, c => {
  const o = stereo(c);
  ['E3', 'F3', 'F#3', 'G3'].forEach((nm, k) => {
    const m = D.noteToMidi(nm);
    for (let j = 0; j < 4; j++) {
      const t = k * 0.24 + j * 0.06;
      put(c, o, iStrings(c, m, 0.05, 0.8 + k * 0.1, { att: 0.005, rel: 0.03, cut: 4000 }), t, 0.45, -0.3);
      put(c, o, iStrings(c, m + 12, 0.05, 0.6 + k * 0.1, { att: 0.005, rel: 0.03, cut: 4000 }), t, 0.3, 0.3);
    }
  });
  const hit = new Float32Array(c.S(0.8));
  for (const nm of ['C3', 'G3', 'C4', 'Eb4', 'F#4']) D.add(hit, iSaw(c, D.noteToMidi(nm), 0.25, 1, { voices: 5, c1: 5000, c0: 1200, sus: 0.3, rel: 0.4 }), 0.35);
  D.add(hit, nburst(c, { len: 0.3, type: 'bp', f: 2000, q: 0.6, t60: 0.25 }), 0.4);
  put(c, o, hit, 0.96, 0.8, 0);
  put(c, o, thud(c, { f0: 90, f1: 35, len: 0.6, t60: 0.5, click: 0.3, body: 0.7 }), 0.96, 1, 0);
  return D.reverb(o, c.sr, { room: 0.75, wet: 0.25 });
});
def('orbit_ambience', { dur: 24, loop: true, vol: 0.5, warm: 5, xf: 0.2 }, c => {
  const o = stereo(c), r = c.rng;
  const pad = (ms, len) => subRate(c, len + 4, 4, (n, sr) => {
    const x = new Float32Array(n);
    for (const m of ms) {
      const f = D.mtof(m);
      D.add(x, D.osc(n, sr, 'sine', f)); D.add(x, D.osc(n, sr, 'sine', f * 1.003), 0.8); D.add(x, D.osc(n, sr, 'tri', f * 2.001), 0.15);
    }
    return D.mul(x, D.adsr(n, sr, 3, 1, 0.9, 4, len));
  });
  const chords = [[0, ['C3', 'G3', 'B3', 'D4', 'E4']], [12, ['A2', 'E3', 'G3', 'B3', 'C4']]];
  for (const [t, ns] of chords) {
    const ms = ns.map(D.noteToMidi);
    put(c, o, pad(ms.filter((m, j) => j % 2 === 0), 12), t, 0.25, -0.5);
    put(c, o, pad(ms.filter((m, j) => j % 2 === 1), 12), t, 0.25, 0.5);
  }
  const sub = c.osc('sine', 65.4); D.mul(sub, c.curve(t => 0.8 + 0.2 * Math.cos(TAU * t / 12))); D.add(o[0], sub, 0.12); D.add(o[1], sub, 0.12);
  const pent = [84, 86, 88, 91, 93, 96, 98, 100];
  for (let k = 0; k < 22; k++) {
    const f = D.mtof(r.pick(pent)), n = c.S(2.5), e = new Float32Array(n); e[0] = 1;
    put(c, o, D.modal(e, c.sr, [[f, 2.2, 1], [f * 2.01, 0.8, 0.2]]), r() * 24, r.range(0.04, 0.1), r.bi());
  }
  const sh = [c.noise(), c.noise()]; for (let k = 0; k < 2; k++) { D.svf(sh[k], c.sr, 'bpq', 5200 + k * 300, 12); D.add(o[k], sh[k], 0.004); }
  const eL = D.echo(o[0], c.sr, 0.6, 0.4, 0.25, 0.4), eR = D.echo(o[1], c.sr, 0.9, 0.4, 0.25, 0.4);
  return D.reverb([eL, eR], c.sr, { room: 0.92, damp: 0.35, wet: 0.5, dry: 0.7, size: 1.3, down: 3 });
});

// =====================================================================================
// DANCE LOOPS (wave 6, game/dance.js): six short 8-beat loops, one per dance mood, tempo == the dance's bpm
// =====================================================================================
CAT = 'item';
function danceLoop(name, bpm, P) {
  const s = 60 / bpm / 4, rep = str => str + ' | ' + str;
  def(name, { dur: s * 32, loop: true, vol: 0.6, warm: 0.4, xf: 0.02 }, c => {
    const o = stereo(c);
    seq(c, o, rep(P.kick), s, (cc, m, l, v) => iKick(cc, v), { g: 1 });
    if (P.clap) seq(c, o, rep(P.clap), s, (cc, m, l, v) => iClap(cc, v), { g: 0.55 });
    if (P.hat) seq(c, o, rep(P.hat), s, (cc, m, l, v) => iHat(cc, v), { g: 0.3, pan: 0.25 });
    seq(c, o, rep(P.bass), s, (cc, m, l, v) => iBass(cc, m, s * 1.7, v, { cut1: P.cut || 2600, cut0: 500, fdec: 0.08, sus: 0.6, drive: P.drive }), { g: 0.8 });
    if (P.lead) seq(c, o, rep(P.lead), s, (cc, m, l, v) => iChip(cc, m, l * 0.9, v, { type: P.wave || 'square', lp: 4000, sus: 0.4, dec: 0.05 }), { g: 0.32, pan: 0.2 });
    if (P.pad) seq(c, o, rep(P.pad), s, (cc, m, l, v) => iPad(cc, m, l, v, { voices: 3, att: 0.05, rel: 0.3, cut: 1800, detune: 18 }), { g: 0.3 });
    return lofi(c, D.reverb(o, c.sr, { room: 0.4, wet: 0.08, damp: 0.5, down: 3 }), 60, 9500, 1.15);
  });
}
danceLoop('dance_office', 112, { kick: 'X . . . X . . . X . . . X . . .', clap: '. . . . X . . . . . . . X . . .', hat: 'x . x . x . x . x . x . x . x x', bass: 'A2 . . A2 . . A2 . G2 . . G2 . . E2 .', lead: 'E5 . . D5 . C5 . . A4 . . . C5 . D5 .', pad: 'A3,C4,E4 - - - - - - - G3,B3,D4 - - - - - - -' });
danceLoop('dance_robot', 128, { kick: 'X . . . X . . . X . . . X . . .', hat: '. . x . . . x . . . x . . . x .', bass: 'D2 . D2 . D2 . D3 . D2 . D2 . F2 . G2 .', lead: 'D5 . . . A4 . . . D5 . . F5 . E5 . .', cut: 1800, wave: 'saw', drive: 1.4 });
danceLoop('dance_sway', 84, { kick: 'X . . . . . . . X . . . . . X .', clap: '. . . . X . . . . . . . X . . .', hat: 'x . . x . . x . x . . x . . x .', bass: 'F2 . . . . . C3 . D2 . . . . . A2 .', lead: 'A4 . . C5 . . E5 . . . D5 . C5 . . .', pad: 'F3,A3,C4 - - - - - - - D3,F3,A3 - - - - - - -', cut: 1400, wave: 'tri' });
danceLoop('dance_glitch', 140, { kick: 'X . . X . . X . X . . X . X . .', clap: '. . . . X . . . . . . . X . . X', hat: 'x x . x x . x x . x x . x . x x', bass: 'C2 . C2 C2 . . C3 . Eb2 . Eb2 . . G2 . .', lead: 'G5 . Eb5 . C5 . . G4 . . Bb4 . C5 . . .', cut: 3200, wave: 'square', drive: 1.8 });
danceLoop('dance_disco', 120, { kick: 'X . . . X . . . X . . . X . . .', clap: '. . . . X . . . . . . . X . . .', hat: '. . x . . . x . . . x . . . x .', bass: 'A2 A3 A2 A3 A2 A3 A2 A3 F2 F3 F2 F3 G2 G3 G2 G3', lead: 'E5 . G5 . E5 . C5 . D5 . F5 . D5 . B4 .', pad: 'A3,C4,E4 - - - - - - - F3,A3,C4 - - - G3,B3,D4 - - -', cut: 3000 });
danceLoop('dance_metal', 150, { kick: 'X . X . X . X . X . X . X . X X', clap: '. . . . X . . . . . . . X . . .', hat: 'x . x . x . x . x . x . x . x .', bass: 'E2 E2 . E2 E2 . E2 . G2 G2 . G2 A2 . A2 .', lead: 'E4 . . G4 . . B4 . E5 . D5 . B4 . G4 .', cut: 2400, wave: 'saw', drive: 2.2 });
