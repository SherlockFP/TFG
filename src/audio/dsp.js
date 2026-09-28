// TFG — pure-JS DSP primitives.
// No Web Audio: everything renders into Float32Arrays so it runs (and is testable) in Node.
// Conventions: `sr` = sample rate, times in seconds, frequencies in Hz.
// Parameters documented as "num|arr" accept either a constant or a per-sample Float32Array.

export const TAU = Math.PI * 2;

// ---------------------------------------------------------------- RNG / hashing
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** mulberry32 — deterministic seeded RNG with helpers. */
export function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const r = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.bi = () => r() * 2 - 1;
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  r.fork = () => makeRng((r() * 4294967296) >>> 0);
  return r;
}

// ---------------------------------------------------------------- pitch helpers
export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'C4' | 'D#3' | 'Eb5' → midi number (C4 = 60). Returns NaN if not a note. */
export function noteToMidi(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) return NaN;
  let v = NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return v + (parseInt(m[3], 10) + 1) * 12;
}
export const cents = c => Math.pow(2, c / 1200);

// ---------------------------------------------------------------- buffer utils
export const buf = n => new Float32Array(Math.max(0, n | 0));
export const secs = (sr, s) => Math.max(0, Math.round(s * sr));

/** dst += src * g, src starting at dst index `off` (may be negative). */
export function add(dst, src, g = 1, off = 0) {
  off |= 0;
  const s0 = off < 0 ? -off : 0;
  const s1 = Math.min(src.length, dst.length - off);
  for (let i = s0; i < s1; i++) dst[i + off] += src[i] * g;
  return dst;
}
/** x *= y (y num|arr), in place. */
export function mul(x, y) {
  if (typeof y === 'number') { for (let i = 0; i < x.length; i++) x[i] *= y; }
  else { const n = Math.min(x.length, y.length); for (let i = 0; i < n; i++) x[i] *= y[i]; }
  return x;
}
export function sum(n, ...parts) {
  const o = new Float32Array(n);
  for (const p of parts) { if (!p) continue; add(o, p[0] || p, p[1] ?? 1); }
  return o;
}
export function clone(x) { return new Float32Array(x); }
export function peak(x) { let p = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; } return p; }
export function rms(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, x.length)); }
export function normalize(x, target = 1) { const p = peak(x); if (p > 1e-9) mul(x, target / p); return x; }
export function reverse(x) { const o = new Float32Array(x.length); for (let i = 0, n = x.length; i < n; i++) o[i] = x[n - 1 - i]; return o; }
export function fade(x, sr, fin = 0.002, fout = 0.01) {
  const a = Math.min(x.length, secs(sr, fin)), b = Math.min(x.length, secs(sr, fout));
  for (let i = 0; i < a; i++) x[i] *= i / a;
  for (let i = 0; i < b; i++) x[x.length - 1 - i] *= i / b;
  return x;
}
/** Varispeed resample: ratio > 1 plays faster (higher, shorter). ratio may be arr (per output sample). */
export function resample(x, ratio, outLen) {
  const constant = typeof ratio === 'number';
  const n = outLen ?? (constant ? Math.floor(x.length / ratio) : x.length);
  const o = new Float32Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const k = p | 0; const f = p - k;
    if (k + 1 >= x.length) break;
    o[i] = x[k] + (x[k + 1] - x[k]) * f;
    p += constant ? ratio : ratio[i];
  }
  return o;
}
/** Box-filter decimation by integer factor k. */
export function decimate(x, k) {
  const n = Math.ceil(x.length / k), o = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let q = 0; q < k && j < x.length; q++, j++) { s += x[j]; c++; }
    o[i] = s / c;
  }
  return o;
}
/** Linear-interpolation upsampling by integer factor k to length n. */
export function upsample(x, k, n) {
  const o = new Float32Array(n), inv = 1 / k;
  let i = 0;
  for (let a = 0; a < x.length - 1 && i < n; a++) {
    const x0 = x[a], d = (x[a + 1] - x0) * inv;
    for (let q = 0; q < k && i < n; q++, i++) o[i] = x0 + d * q;
  }
  // past the end: ramp the last value down to zero over one input step
  const last = x.length ? x[x.length - 1] : 0;
  for (let q = 0; i < n; i++, q++) o[i] = q < k ? last * (1 - q * inv) : 0;
  return o;
}
/** Equal-power pan: p in [-1, 1] → [L, R]. */
export function pan(x, p = 0) {
  const a = (p + 1) * Math.PI / 4;
  const l = new Float32Array(x.length), r = new Float32Array(x.length);
  const gl = Math.cos(a), gr = Math.sin(a);
  for (let i = 0; i < x.length; i++) { l[i] = x[i] * gl; r[i] = x[i] * gr; }
  return [l, r];
}

// ---------------------------------------------------------------- envelopes / curves
function segMix(v0, v1, u, mode) {
  if (mode === 'exp') {
    const a = Math.max(Math.abs(v0), 1e-4), b = Math.max(Math.abs(v1), 1e-4);
    return a * Math.pow(b / a, u) * (v1 < 0 || v0 < 0 ? -1 : 1);
  }
  if (mode === 'cos') return v0 + (v1 - v0) * (0.5 - 0.5 * Math.cos(Math.PI * u));
  return v0 + (v1 - v0) * u;
}
/** Evaluate breakpoint list [[t, v], ...] at time t. */
export function interp(pts, t, mode) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let j = 1; j < pts.length; j++) {
    const p1 = pts[j];
    if (t <= p1[0]) {
      const p0 = pts[j - 1];
      const u = p1[0] > p0[0] ? (t - p0[0]) / (p1[0] - p0[0]) : 1;
      return segMix(p0[1], p1[1], u, mode);
    }
  }
  return pts[pts.length - 1][1];
}
/** Breakpoint envelope rendered to n samples. mode: 'lin' | 'exp' | 'cos'. */
export function env(n, sr, pts, mode = 'lin') {
  // evaluated at control rate (every 16 samples) and linearly interpolated
  const o = new Float32Array(n);
  if (!n) return o;
  let j = 1;
  const last = pts[pts.length - 1];
  const val = t => {
    if (t <= pts[0][0]) return pts[0][1];
    while (j < pts.length && t > pts[j][0]) j++;
    if (j >= pts.length) return last[1];
    const p0 = pts[j - 1], p1 = pts[j];
    const u = p1[0] > p0[0] ? (t - p0[0]) / (p1[0] - p0[0]) : 1;
    return segMix(p0[1], p1[1], u, mode);
  };
  const STEP = 16;
  let v0 = val(0);
  for (let i = 0; i < n; i += STEP) {
    const i1 = Math.min(n, i + STEP), v1 = val(i1 / sr), d = (v1 - v0) / STEP;
    for (let k = i; k < i1; k++) o[k] = v0 + d * (k - i);
    v0 = v1;
  }
  return o;
}
/** Percussive envelope: linear attack, exponential decay reaching -60 dB after t60. */
export function perc(n, sr, attack = 0.002, t60 = 0.3, start = 0) {
  const o = new Float32Array(n);
  const s0 = secs(sr, start), a = Math.max(1, secs(sr, attack));
  const k = Math.exp(-6.9078 / Math.max(1, t60 * sr));
  let g = 1;
  for (let i = s0; i < n; i++) {
    const j = i - s0;
    if (j < a) o[i] = j / a;
    else { o[i] = g; g *= k; }
  }
  return o;
}
/** ADSR with gate length `hold` (s). Decay/release exponential-ish. */
export function adsr(n, sr, a, d, s, r, hold) {
  const o = new Float32Array(n);
  const A = Math.max(1, secs(sr, a)), H = secs(sr, hold);
  const kd = Math.exp(-4.6 / Math.max(1, d * sr)), kr = Math.exp(-6.9 / Math.max(1, r * sr));
  let v = 0;
  for (let i = 0; i < n; i++) {
    if (i < H) {
      if (i < A) v = i / A;
      else v = s + (v - s) * kd;
    } else v *= kr;
    o[i] = v;
  }
  return o;
}
/** Linear ramp a→b over n samples (or exponential if exp). */
export function ramp(n, a, b, exp = false) {
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) { const u = n > 1 ? i / (n - 1) : 0; o[i] = exp ? a * Math.pow(b / a, u) : a + (b - a) * u; }
  return o;
}
/** Smoothed random walk (0-mean, ~±1) — control-rate noise for jitter/wobble. rate in Hz. */
export function smoothNoise(n, sr, rng, rate = 10) {
  const o = new Float32Array(n);
  const step = Math.max(1, Math.round(sr / rate));
  let a = rng.bi(), b = rng.bi();
  for (let i = 0; i < n; i++) {
    const k = i % step;
    if (k === 0 && i > 0) { a = b; b = rng.bi(); }
    const u = k / step; const w = u * u * (3 - 2 * u);
    o[i] = a + (b - a) * w;
  }
  return o;
}

// ---------------------------------------------------------------- oscillators
const SIN_N = 4096;
const SIN_T = new Float64Array(SIN_N + 1);
for (let i = 0; i <= SIN_N; i++) SIN_T[i] = Math.sin(TAU * i / SIN_N);
/** Fast table sine; phase in cycles (any real value). */
export function sinp(ph) {
  ph -= Math.floor(ph);
  const p = ph * SIN_N, k = p | 0;
  return SIN_T[k] + (SIN_T[k + 1] - SIN_T[k]) * (p - k);
}
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
/**
 * Oscillator. type: sine | saw | square | pulse | tri | rsaw (ramp down).
 * freq num|arr; o.pw num|arr pulse width (0..1); o.phase start phase (0..1).
 * saw/square are polyBLEP band-limited.
 */
export function osc(n, sr, type, freq, o = {}) {
  const out = new Float32Array(n);
  const fa = typeof freq === 'number' ? null : freq;
  const inv = 1 / sr;
  let ph = o.phase ?? 0;
  const f0 = fa ? 0 : freq * inv;
  if (type === 'sine') {
    for (let i = 0; i < n; i++) {
      const p = ph * SIN_N, k = p | 0;
      out[i] = SIN_T[k] + (SIN_T[k + 1] - SIN_T[k]) * (p - k);
      ph += fa ? fa[i] * inv : f0; if (ph >= 1 || ph < 0) ph -= Math.floor(ph);
    }
  } else if (type === 'saw' || type === 'rsaw') {
    const sgn = type === 'saw' ? 1 : -1;
    for (let i = 0; i < n; i++) {
      let dt = fa ? fa[i] * inv : f0; if (dt > 0.45) dt = 0.45; if (dt < 1e-7) dt = 1e-7;
      out[i] = sgn * (2 * ph - 1 - blep(ph, dt));
      ph += dt; if (ph >= 1) ph -= Math.floor(ph);
    }
  } else if (type === 'square' || type === 'pulse') {
    const pwv = o.pw ?? 0.5; const pa = typeof pwv === 'number' ? null : pwv;
    for (let i = 0; i < n; i++) {
      let dt = fa ? fa[i] * inv : f0; if (dt > 0.45) dt = 0.45; if (dt < 1e-7) dt = 1e-7;
      const pw = pa ? pa[i] : pwv;
      let v = ph < pw ? 1 : -1;
      v += blep(ph, dt);
      let t2 = ph + 1 - pw; t2 -= Math.floor(t2);
      v -= blep(t2, dt);
      out[i] = v;
      ph += dt; if (ph >= 1) ph -= Math.floor(ph);
    }
  } else if (type === 'tri') {
    for (let i = 0; i < n; i++) {
      out[i] = 1 - 4 * Math.abs(ph - 0.5);
      ph += fa ? fa[i] * inv : f0; if (ph >= 1) ph -= Math.floor(ph);
    }
  } else throw new Error('osc type ' + type);
  return out;
}
/** Sum of detuned saws (supersaw / pad). detune in cents spread, voices count. */
export function supersaw(n, sr, freq, voices = 5, detune = 20, rng = null, type = 'saw') {
  const out = new Float32Array(n);
  for (let v = 0; v < voices; v++) {
    const d = voices > 1 ? (v / (voices - 1) - 0.5) * 2 * detune : 0;
    const k = cents(d);
    const f = typeof freq === 'number' ? freq * k : mulNew(freq, k);
    add(out, osc(n, sr, type, f, { phase: rng ? rng() : v / voices }), 1 / Math.sqrt(voices));
  }
  return out;
}
function mulNew(a, k) { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] * k; return o; }

/**
 * 2-operator FM: out = sin(2π·fc·t + index·sin(2π·fm·t)), fm = fc·ratio unless o.mf given.
 * fc num|arr, index num|arr. o.fb modulator self-feedback.
 */
export function fm(n, sr, fc, ratio, index, o = {}) {
  const out = new Float32Array(n);
  const fa = typeof fc === 'number' ? null : fc;
  const ia = typeof index === 'number' ? null : index;
  const mfa = o.mf === undefined ? null : (typeof o.mf === 'number' ? null : o.mf);
  const mfc = typeof o.mf === 'number' ? o.mf : null;
  const fb = o.fb ?? 0;
  const inv = 1 / sr;
  let pc = o.phase ?? 0, pm = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const f = fa ? fa[i] : fc;
    const I = ia ? ia[i] : index;
    const m = sinp(pm + fb * last / TAU); last = m;
    out[i] = sinp(pc + I * m / TAU);
    pc += f * inv; if (pc >= 1) pc -= Math.floor(pc);
    pm += (mfa ? mfa[i] : mfc !== null ? mfc : f * ratio) * inv; if (pm >= 1) pm -= Math.floor(pm);
  }
  return out;
}

// ---------------------------------------------------------------- noise
export function noise(n, rng, color = 'white') {
  const o = new Float32Array(n);
  // fast xorshift32 stream seeded from the caller's RNG (keeps determinism)
  let s = ((rng() * 4294967296) >>> 0) || 0x1234567;
  for (let i = 0; i < n; i++) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    o[i] = (s >>> 0) * 4.656612873077393e-10 - 1;
  }
  return color === 'white' ? o : colorize(o, color);
}
/** Filter white noise into pink/brown/blue/violet in place. */
export function colorize(o, color) {
  const n = o.length;
  if (color === 'pink') { // Kellet economy pink filter
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = o[i];
      b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
      o[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
  } else if (color === 'brown') {
    let b = 0;
    for (let i = 0; i < n; i++) { b = (b + 0.02 * o[i]) / 1.02; o[i] = b * 3.5; }
  } else if (color === 'blue' || color === 'violet') {
    let p = 0;
    for (let i = 0; i < n; i++) { const w = o[i]; o[i] = (w - p) * 0.5; p = w; }
  }
  return o;
}
/** Sparse random impulses (dust / crackle). density = impulses per second. */
export function dust(n, sr, rng, density, o = {}) {
  const out = new Float32Array(n);
  const p = density / sr;
  const bip = o.bipolar ?? true;
  for (let i = 0; i < n; i++) if (rng() < p) out[i] = (bip ? rng.bi() : rng()) * (o.amp ?? 1);
  return out;
}

// ---------------------------------------------------------------- filters
/**
 * TPT state-variable filter (stable under modulation).
 * type: lp | hp | bp (0 dB peak) | bpq (peak gain = Q) | notch | ap
 * freq, q: num|arr. Processes in place unless `out` given.
 */
export function svf(x, sr, type, freq, q = 0.7071, out = x) {
  const n = x.length;
  const fa = typeof freq === 'number' ? null : freq;
  const qa = typeof q === 'number' ? null : q;
  const mode = type === 'lp' ? 0 : type === 'bp' ? 1 : type === 'hp' ? 2 : type === 'notch' ? 3 : type === 'bpq' ? 4 : 5;
  const nyq = sr * 0.45;
  // output = m0·in + m1·band + m2·low  (branch-free mode mixing)
  let ic1 = 0, ic2 = 0, g = 0, k = 1, a1 = 0, a2 = 0, a3 = 0, m0 = 0, m1 = 0, m2 = 0;
  const set = (f, Q) => {
    if (!(f > 5)) f = 5; if (f > nyq) f = nyq; if (!(Q > 0.05)) Q = 0.05;
    g = Math.tan(Math.PI * f / sr); k = 1 / Q; a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
    switch (mode) {
      case 0: m0 = 0; m1 = 0; m2 = 1; break;
      case 1: m0 = 0; m1 = k; m2 = 0; break;
      case 2: m0 = 1; m1 = -k; m2 = -1; break;
      case 3: m0 = 1; m1 = -k; m2 = 0; break;
      case 4: m0 = 0; m1 = 1; m2 = 0; break;
      default: m0 = 1; m1 = -2 * k; m2 = 0;
    }
  };
  set(fa ? fa[0] : freq, qa ? qa[0] : q);
  const mod = !!(fa || qa);
  const B = mod ? 8 : n;
  for (let i0 = 0; i0 < n; i0 += B) {
    if (mod) set(fa ? fa[i0] : freq, qa ? qa[i0] : q);
    const i1 = Math.min(n, i0 + B);
    for (let i = i0; i < i1; i++) {
      const v0 = x[i];
      const v3 = v0 - ic2;
      const v1 = a1 * ic1 + a2 * v3;
      const v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
      out[i] = m0 * v0 + m1 * v1 + m2 * v2;
    }
  }
  return out;
}
/** Static RBJ biquad (DF1): lp hp bp notch peak lowshelf highshelf. In place. */
export function biquad(x, sr, type, f, q = 0.7071, gainDb = 0) {
  const w = TAU * Math.min(f, sr * 0.45) / sr, cw = Math.cos(w), sw = Math.sin(w);
  const al = sw / (2 * q), A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'bp': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'peak': b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break;
    }
    default: throw new Error('biquad ' + type);
  }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0; x[i] = y0;
  }
  return x;
}
/** One-pole lowpass, freq num|arr. In place. */
export function lp1(x, sr, freq) {
  const fa = typeof freq === 'number' ? null : freq;
  let a = 1 - Math.exp(-TAU * (fa ? fa[0] : freq) / sr), y = 0;
  for (let i = 0; i < x.length; i++) {
    if (fa) a = 1 - Math.exp(-TAU * fa[i] / sr);
    y += a * (x[i] - y); x[i] = y;
  }
  return x;
}
/** One-pole highpass. In place. */
export function hp1(x, sr, freq) {
  const a = 1 - Math.exp(-TAU * freq / sr);
  let y = 0;
  for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] -= y; }
  return x;
}
/** Band limit helper: hp then lp (2nd order each). */
export function band(x, sr, lo, hi, q = 0.7071) {
  if (lo > 0) svf(x, sr, 'hp', lo, q);
  if (hi > 0) svf(x, sr, 'lp', hi, q);
  return x;
}
/** Feedback comb with damping in the loop; returns new buffer. delay num|arr (s). */
export function comb(x, sr, delay, fb = 0.5, damp = 0, mix = 1) {
  const n = x.length;
  const da = typeof delay === 'number' ? null : delay;
  let maxD = delay;
  if (da) { maxD = 0; for (let i = 0; i < da.length; i++) if (da[i] > maxD) maxD = da[i]; }
  const size = Math.ceil(maxD * sr) + 4;
  const line = new Float32Array(size);
  const out = new Float32Array(n);
  let w = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const d = (da ? da[i] : delay) * sr;
    let rp = w - d; while (rp < 0) rp += size;
    const k = rp | 0, f = rp - k;
    const s = line[k] + (line[(k + 1) % size] - line[k]) * f;
    lp = s + (lp - s) * damp;
    const y = x[i] + fb * lp;
    line[w] = y; w = (w + 1) % size;
    out[i] = x[i] * (1 - mix) + y * mix;
  }
  return out;
}
/** Schroeder allpass, returns new buffer. */
export function allpass(x, sr, delay, g = 0.5) {
  const D = Math.max(1, Math.round(delay * sr));
  const line = new Float32Array(D); const out = new Float32Array(x.length);
  let w = 0;
  for (let i = 0; i < x.length; i++) {
    const b = line[w]; const v = x[i] + g * b; out[i] = b - g * v; line[w] = v; w = (w + 1) % D;
  }
  return out;
}
/** Modulated delay (chorus / flanger / doppler / echo). delay num|arr seconds. Returns new buffer. */
export function vdelay(x, sr, delay, fb = 0, mix = 0.5, damp = 0) {
  return comb(x, sr, delay, fb, damp, mix);
}
/** Feedback echo returning new buffer (dry + wet). */
export function echo(x, sr, time, fb = 0.35, wet = 0.4, damp = 0.3) {
  const D = Math.max(1, Math.round(time * sr));
  const line = new Float32Array(D); const out = new Float32Array(x.length);
  let w = 0, lp = 0;
  for (let i = 0; i < x.length; i++) {
    const d = line[w]; lp = d + (lp - d) * damp;
    line[w] = x[i] + lp * fb; w = (w + 1) % D;
    out[i] = x[i] + lp * wet;
  }
  return out;
}

const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const APS = [556, 441, 341, 225];
/**
 * Freeverb-style reverb. Returns mono buffer, or [L, R] if o.stereo.
 * o: room (0..1 decay), damp (0..1), wet, dry, size (delay scale), pre (predelay s), combs (count 4..8).
 * Input x may be mono Float32Array or [L, R].
 */
export function reverb(x, sr, o = {}) {
  const room = o.room ?? 0.7, damp = o.damp ?? 0.35, wet = o.wet ?? 0.3, dry = o.dry ?? 1;
  const size = o.size ?? 1, pre = secs(sr, o.pre ?? 0), nc = o.combs ?? 8;
  const inL = Array.isArray(x) ? x[0] : x, inR = Array.isArray(x) ? x[1] : x;
  const n = inL.length;
  const isSt = !!(o.stereo || Array.isArray(x));
  if ((o.down ?? 1) > 1) { // run the (dark) tail at a reduced rate: much cheaper for long sounds
    const k = o.down;
    const lo = reverb(isSt ? [decimate(inL, k), decimate(inR, k)] : decimate(inL, k), sr / k, { ...o, down: 1, dry: 0, stereo: isSt });
    const mk = (w, inp) => { const up = upsample(w, k, n); for (let i = 0; i < n; i++) up[i] += inp[i] * dry; return up; };
    return isSt ? [mk(lo[0], inL), mk(lo[1], inR)] : mk(lo, inL);
  }
  const fb = room * 0.28 + 0.7, dmp = damp * 0.4;
  const sc = sr / 44100 * size;
  const chan = (inp, spread) => {
    const acc = new Float32Array(n), pin = new Float32Array(n);
    for (let i = pre; i < n; i++) pin[i] = inp[i - pre] * 0.015;
    for (let c = 0; c < nc; c++) {
      const L = Math.max(8, Math.round((COMBS[c] + spread) * sc));
      const line = new Float32Array(L); let w = 0, st = 0;
      for (let i = 0; i < n; i++) {
        const o0 = line[w];
        st = o0 + (st - o0) * dmp;
        line[w] = pin[i] + st * fb;
        if (++w === L) w = 0;
        acc[i] += o0;
      }
    }
    for (let a = 0; a < 4; a++) {
      const L = Math.max(4, Math.round((APS[a] + spread) * sc));
      const line = new Float32Array(L); let w = 0;
      for (let i = 0; i < n; i++) {
        const b = line[w]; const inV = acc[i];
        acc[i] = -inV + b; line[w] = inV + b * 0.5;
        if (++w === L) w = 0;
      }
    }
    const g = wet * 3 * (8 / nc);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = inp[i] * dry + acc[i] * g;
    return out;
  };
  if (isSt) return [chan(inL, 0), chan(inR, 23)];
  return chan(inL, 0);
}

// ---------------------------------------------------------------- nonlinear
export function tanh(x) { if (x > 3) return 1; if (x < -3) return -1; const x2 = x * x; return x * (27 + x2) / (27 + 9 * x2); }
/** Waveshaper. type: tanh | hard | fold | asym | cubic. drive num|arr. In place. */
export function shape(x, drive = 2, type = 'tanh') {
  const da = typeof drive === 'number' ? null : drive;
  for (let i = 0; i < x.length; i++) {
    const d = da ? da[i] : drive; let v = x[i] * d;
    switch (type) {
      case 'hard': v = v > 1 ? 1 : v < -1 ? -1 : v; break;
      case 'fold': { v = v * 0.25 + 0.25; v -= Math.floor(v); v = 1 - 4 * Math.abs(v - 0.5); v = -v; break; }
      case 'asym': v = v >= 0 ? tanh(v) : tanh(v * 0.6) * 0.8; break;
      case 'cubic': v = v > 1 ? 2 / 3 : v < -1 ? -2 / 3 : v - v * v * v / 3; v *= 1.5; break;
      default: v = tanh(v);
    }
    x[i] = v;
  }
  return x;
}
/** Bit depth + sample-rate reduction. In place. */
export function crush(x, bits = 8, down = 1) {
  const q = Math.pow(2, bits - 1);
  let hold = 0, acc = 1e9;
  for (let i = 0; i < x.length; i++) {
    acc += 1;
    if (acc >= down) { acc -= down; if (acc > down) acc = 0; hold = Math.round(x[i] * q) / q; }
    x[i] = hold;
  }
  return x;
}
/** Ring modulation by sine at freq (num|arr). mix 0..1. In place. */
export function ring(x, sr, freq, mix = 1) {
  const m = osc(x.length, sr, 'sine', freq);
  for (let i = 0; i < x.length; i++) x[i] = x[i] * (1 - mix) + x[i] * m[i] * mix;
  return x;
}

// ---------------------------------------------------------------- modal / physical
/**
 * Modal resonator bank: each mode [freq, t60, amp] is a 2-pole resonator driven by `exc`.
 * A unit impulse gives a sine of amplitude `amp` decaying to -60 dB at t60.
 * Returns new buffer of exc.length (or accumulates into `out`).
 */
export function modal(exc, sr, modes, out) {
  const n = exc.length;
  out = out || new Float32Array(n);
  let last = 0; for (let i = n - 1; i >= 0; i--) if (exc[i] !== 0) { last = i; break; }
  for (let m = 0; m < modes.length; m++) {
    const f = modes[m][0], t60 = modes[m][1], amp = modes[m][2] ?? 1;
    if (!(f > 0) || f >= sr * 0.47 || !amp) continue;
    const w = TAU * f / sr, r = Math.exp(-6.9078 / Math.max(1, t60 * sr));
    const c1 = 2 * r * Math.cos(w), c2 = -r * r, g = amp * Math.sin(w);
    let y1 = 0, y2 = 0;
    const stop = Math.min(n, last + Math.ceil(t60 * sr * 1.2) + 1);
    for (let i = 0; i < stop; i++) {
      const y = c1 * y1 + c2 * y2 + g * exc[i];
      out[i] += y; y2 = y1; y1 = y;
    }
  }
  return out;
}
/** Karplus-Strong plucked string. t60 decay time, bright 0..1, returns buffer of length n. */
export function pluck(n, sr, rng, freq, o = {}) {
  const t60 = o.t60 ?? 1.5, bright = o.bright ?? 0.5;
  const damp = o.damp ?? 0.5; // loop lowpass blend (delay of `damp` samples)
  const out = new Float32Array(n);
  const P = sr / freq;
  let D = Math.max(2, Math.floor(P - damp)); let frac = P - damp - D;
  if (frac < 0.15 && D > 2) { D -= 1; frac += 1; }
  const line = new Float32Array(D);
  // excitation: filtered noise burst (brightness), DC removed
  let lp = 0; const a = 0.1 + 0.9 * bright;
  for (let i = 0; i < D; i++) { lp += a * (rng.bi() - lp); line[i] = lp; }
  let mean = 0; for (let i = 0; i < D; i++) mean += line[i]; mean /= D;
  for (let i = 0; i < D; i++) line[i] -= mean;
  if (o.pick) { const pk = Math.max(1, Math.round(D * o.pick)); for (let i = D - 1; i >= pk; i--) line[i] -= line[i - pk] * 0.9; }
  const loss = Math.pow(10, -3 / (t60 * freq));
  const apC = (1 - frac) / (1 + frac); // allpass fractional delay tuning
  let w = 0, prev = 0, apX = 0, apY = 0;
  for (let i = 0; i < n; i++) {
    const cur = line[w];
    const avg = cur * (1 - damp) + prev * damp; prev = cur;
    const y = apC * avg + apX - apC * apY; apX = avg; apY = y;
    out[i] = cur;
    line[w] = y * loss;
    if (++w >= D) w = 0;
  }
  return out;
}

// ---------------------------------------------------------------- voice / formants
export const VOWELS = {
  a: [730, 1090, 2440], e: [530, 1840, 2480], i: [270, 2290, 3010], o: [570, 840, 2410], u: [300, 870, 2240],
  ae: [660, 1720, 2410], uh: [640, 1190, 2390], ih: [390, 1990, 2550], oo: [440, 1020, 2240], er: [490, 1350, 1690],
  m: [250, 1100, 2300], n: [250, 1600, 2600], l: [360, 1300, 2700], y: [250, 2200, 3000], w: [300, 700, 2200],
  aw: [570, 900, 2500], ee: [300, 2500, 3200], eh: [560, 1800, 2500],
};
function vowelTrack(n, sr, seq, idx, scale) {
  // seq: [[t, 'a' | [f1,f2,f3]], ...]
  const pts = seq.map(([t, v]) => [t, (typeof v === 'string' ? VOWELS[v] : v)[idx] * scale]);
  return env(n, sr, pts, 'cos');
}
/**
 * Formant voice synth. o:
 *  f0 num|arr (Hz), vowels [[t, vowel], ...], scale (formant scale: 1 man, 1.2 woman, 1.6 small creature),
 *  breath 0..1, jitter (fraction), jrate (Hz), vib [rate, depthFrac], amp num|arr (source envelope),
 *  bw (bandwidth mult), gains [g1,g2,g3,g4], src 'saw'|'pulse'|'noise', tilt (lp Hz on source), fry (0..1 subharmonic AM)
 */
export function voice(n, sr, rng, o = {}) {
  let f0 = typeof o.f0 === 'number' ? new Float32Array(n).fill(o.f0) : new Float32Array(o.f0);
  if (o.vib) { const [vr, vd] = o.vib; for (let i = 0; i < n; i++) f0[i] *= 1 + vd * Math.sin(TAU * vr * i / sr); }
  if (o.jitter) { const j = smoothNoise(n, sr, rng, o.jrate ?? 25); for (let i = 0; i < n; i++) f0[i] *= 1 + o.jitter * j[i]; }
  const breath = o.breath ?? 0.1;
  let src;
  if (o.src === 'noise') src = noise(n, rng);
  else {
    src = osc(n, sr, o.src === 'pulse' ? 'pulse' : 'saw', f0, { pw: o.pw ?? 0.3 });
    if (o.fry) { // irregular subharmonic amplitude modulation (vocal fry / growl roughness)
      const sub = osc(n, sr, 'sine', mulNew(f0, 0.5));
      const rough = smoothNoise(n, sr, rng, 60);
      for (let i = 0; i < n; i++) src[i] *= 1 - o.fry * (0.5 + 0.5 * sub[i]) * (0.6 + 0.4 * rough[i]);
    }
    if (breath > 0) {
      const ns = noise(n, rng); svf(ns, sr, 'hp', 400);
      for (let i = 0; i < n; i++) src[i] = src[i] * (1 - breath) + ns[i] * breath * 1.2;
    }
  }
  if (o.tilt) lp1(src, sr, o.tilt);
  if (o.amp !== undefined) mul(src, o.amp);
  const scale = o.scale ?? 1, bw = o.bw ?? 1;
  const seq = o.vowels ?? [[0, 'a']];
  const gains = o.gains ?? [1, 0.7, 0.35, 0.15];
  const out = new Float32Array(n);
  const BW = [90, 110, 150, 200];
  for (let k = 0; k < 3; k++) {
    // o.formants: explicit [F1arr, F2arr, F3arr] (Hz, already scaled) — used for seamless loops
    const F = o.formants ? o.formants[k] : vowelTrack(n, sr, seq, k, scale);
    const Q = new Float32Array(n);
    for (let i = 0; i < n; i++) Q[i] = Math.max(0.5, F[i] / (BW[k] * bw * Math.sqrt(scale)));
    const y = svf(new Float32Array(src), sr, 'bp', F, Q);
    add(out, y, gains[k] * (k === 0 ? 1 : 1.4));
  }
  if (gains[3]) { const y = svf(new Float32Array(src), sr, 'bp', 3400 * scale, 3); add(out, y, gains[3]); }
  // direct (unfiltered, low-passed) path keeps the fundamental for high-pitched voices
  if (o.direct) { const y = lp1(new Float32Array(src), sr, o.directLp ?? 1500); add(out, y, o.direct); }
  return out;
}
/** Filter an arbitrary excitation through a vowel sequence (whispers, slurps). */
export function formantFilter(x, sr, seq, scale = 1, bw = 1, gains = [1, 0.8, 0.5]) {
  const n = x.length; const out = new Float32Array(n);
  const BW = [90, 110, 150];
  for (let k = 0; k < 3; k++) {
    const F = vowelTrack(n, sr, seq, k, scale);
    const Q = new Float32Array(n);
    for (let i = 0; i < n; i++) Q[i] = Math.max(0.5, F[i] / (BW[k] * bw));
    add(out, svf(new Float32Array(x), sr, 'bp', F, Q), gains[k] * (k ? 1.4 : 1));
  }
  return out;
}

// ---------------------------------------------------------------- loops
/**
 * Crossfade `x` into a loop of length L: out[i] = x[off+i], with the first Y samples blended
 * against x[off+L+i]. Weights are compensated for measured correlation so both identical
 * (periodic) and uncorrelated material keep constant loudness.
 */
export function loopExtract(x, off, L, Y) {
  const out = new Float32Array(L);
  for (let i = 0; i < L; i++) out[i] = x[off + i];
  if (Y <= 0) return out;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < Y; i++) { const a = x[off + i], b = x[off + L + i]; sxy += a * b; sxx += a * a; syy += b * b; }
  const rho = sxx > 1e-12 && syy > 1e-12 ? Math.max(0, Math.min(1, sxy / Math.sqrt(sxx * syy))) : 1;
  for (let i = 0; i < Y; i++) {
    const u = (i + 0.5) / Y; const wa = 0.5 - 0.5 * Math.cos(Math.PI * u), wb = 1 - wa;
    const g = 1 / Math.sqrt(wa * wa + wb * wb + 2 * wa * wb * rho);
    out[i] = (x[off + i] * wa + x[off + L + i] * wb) * g;
  }
  return out;
}

// ---------------------------------------------------------------- sequencing
/**
 * Parse a step string: tokens separated by whitespace, '|' ignored.
 * '.' rest, '-' tie (extends previous), note names (C4, D#3, Eb5, may be chords 'C4,E4,G4'),
 * drum hits 'x' (0.8) 'X' (1) 'o' (0.45) or any other letter (returned as sym).
 * Returns [{ step, len, notes:[midi], vel, sym }].
 */
export function parseSteps(str) {
  const toks = str.trim().split(/\s+/).filter(t => t && t !== '|');
  const ev = [];
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    if (tk === '.' || tk === '-') continue;
    let len = 1; while (toks[i + len] === '-') len++;
    let vel = 1, sym = tk, notes = [];
    if (tk === 'x') vel = 0.8; else if (tk === 'X') vel = 1; else if (tk === 'o') vel = 0.45;
    else {
      const parts = tk.split(',');
      const ms = parts.map(p => { const m = /^(.*?)(!|\?)?$/.exec(p); return m; });
      for (const m of ms) {
        const midi = noteToMidi(m[1]);
        if (!isNaN(midi)) notes.push(midi);
        if (m[2] === '!') vel = 1.25; else if (m[2] === '?') vel = 0.55;
      }
    }
    ev.push({ step: i, len, notes, vel, sym });
  }
  ev.total = toks.length;
  return ev;
}
