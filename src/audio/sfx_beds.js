// AMBIENCE BEDS (module `sfx`, docs/wave4/sfx.md): one procedural loop per biome / interior theme, layered quietly UNDER the existing
// ambience (game.audio.setAmbience('sxbed', name, vol)). Pure JS (dsp.js + the creaturevoice primitives), loop seam = equal-power crossfade.
//   bedFor({ biome, ground, interior, indoor, company })  -> bed name or null
//   renderBed(name, sr) -> Float32Array (LOOP_SEC long, RMS ~0.12)
import * as D from './dsp.js';
import { PRIM } from './creaturevoice.js';

export const LOOP_SEC = 10;
const XF = 1.5;                       // seam crossfade (s)
const TAU = D.TAU;

/** slowly wandering amplitude envelope points (wind gusts) */
function gusts(rng, dur, lo, hi, n = 9) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push([dur * i / n, lo + (hi - lo) * rng()]);
  return pts;
}
/** add `fn(rng)` buffers at random times */
function sprinkle(out, sr, rng, count, fn, minGap = 0.3) {
  const dur = out.length / sr; let last = -9;
  for (let i = 0; i < count; i++) {
    let t = rng() * (dur - 1.2);
    if (Math.abs(t - last) < minGap) t = (t + minGap * 2) % (dur - 1.2);
    last = t;
    const b = fn(rng, i);
    D.add(out, b.buf, b.g ?? 1, Math.round(t * sr));
  }
}
const noiseBed = (sr, rng, dur, o) => PRIM.nz(sr, rng.fork(), { dur, ...o });
const wind = (sr, rng, dur, f0, f1, q, lo, hi) => noiseBed(sr, rng, dur, { color: 'pink', bp: [[0, f0], [dur * 0.5, f1], [dur, f0]], q, amp: gusts(rng, dur, lo, hi) });

const BEDS = {
  hills: (sr, rng, dur, out) => {
    D.add(out, wind(sr, rng, dur, 380, 640, 1.1, 0.25, 0.8), 0.7);
    D.add(out, noiseBed(sr, rng, dur, { hp: 4500, amp: gusts(rng, dur, 0.02, 0.18) }), 0.25);
    sprinkle(out, sr, rng, 7, (r) => ({ buf: PRIM.tone(sr, r.fork?.() || r, { dur: 0.18, f: [[0, 2600 + 900 * r()], [0.06, 3400], [0.18, 2900]], vib: [22, 0.03], amp: [[0, 0], [0.03, 1], [0.18, 0]] }), g: 0.14 }), 0.5);
  },
  swamp: (sr, rng, dur, out) => {
    D.add(out, wind(sr, rng, dur, 260, 420, 0.9, 0.15, 0.5), 0.5);
    D.add(out, PRIM.bubbles(sr, rng.fork(), { dur, rate: 1.2, f0: 90, f1: 240, bed: 0.25 }), 0.5);
    D.add(out, PRIM.tone(sr, rng.fork(), { dur, f: 5200, ratio: 1, index: 0, amp: gusts(rng, dur, 0.0, 0.05, 20) }), 0.5);
    sprinkle(out, sr, rng, 5, (r) => ({ buf: PRIM.tone(sr, r.fork?.() || r, { dur: 0.45, f: [[0, 150 + 30 * r()], [0.4, 110]], wave: 'saw', lp: 700, gate: { rate: 9, duty: 0.6 }, amp: [[0, 0], [0.04, 1], [0.4, 0]] }), g: 0.3 }), 0.8);
  },
  snow: (sr, rng, dur, out) => {
    D.add(out, noiseBed(sr, rng, dur, { color: 'pink', bp: [[0, 900], [dur * 0.4, 1500], [dur * 0.7, 700], [dur, 900]], q: 4, amp: gusts(rng, dur, 0.1, 0.9, 7) }), 0.55);
    D.add(out, noiseBed(sr, rng, dur, { color: 'brown', lp: 220, amp: gusts(rng, dur, 0.3, 0.9, 5) }), 0.8);
    D.add(out, noiseBed(sr, rng, dur, { hp: 6000, amp: gusts(rng, dur, 0, 0.15, 12) }), 0.2);
  },
  desert: (sr, rng, dur, out) => {
    D.add(out, noiseBed(sr, rng, dur, { hp: 2500, bp: [[0, 3200], [dur / 2, 4800], [dur, 3200]], q: 0.6, amp: gusts(rng, dur, 0.1, 0.8, 8) }), 0.5);
    D.add(out, PRIM.clicks(sr, rng.fork(), { dur, n: 90, f: 5200, decay: 0.002, noise: 1, amp: 0.15, jit: 1 }), 0.4);
    D.add(out, noiseBed(sr, rng, dur, { color: 'brown', lp: 160, amp: gusts(rng, dur, 0.1, 0.5, 6) }), 0.5);
    sprinkle(out, sr, rng, 2, (r) => ({ buf: PRIM.hit(sr, r.fork?.() || r, { dur: 1.2, kind: 'tin', f: 700 + 200 * r(), decay: 1 }), g: 0.08 }), 2);
  },
  moor: (sr, rng, dur, out) => {
    D.add(out, wind(sr, rng, dur, 300, 520, 1.3, 0.3, 0.9), 0.75);
    D.add(out, noiseBed(sr, rng, dur, { color: 'brown', lp: 180, amp: gusts(rng, dur, 0.2, 0.7, 6) }), 0.6);
    sprinkle(out, sr, rng, 2, (r) => ({ buf: PRIM.tone(sr, r.fork?.() || r, { dur: 1.4, f: [[0, 95], [0.7, 80], [1.4, 95]], wave: 'saw', vib: [5, 0.05], lp: 420, amp: [[0, 0], [0.5, 1], [1.4, 0]] }), g: 0.16 }), 2);
  },
  blackforest: (sr, rng, dur, out) => {
    D.add(out, PRIM.tone(sr, rng.fork(), { dur, f: 55, ratio: 1, index: 0, amp: gusts(rng, dur, 0.4, 0.8, 5) }), 0.5);
    D.add(out, PRIM.tone(sr, rng.fork(), { dur, f: 82.6, ratio: 1, index: 0, amp: gusts(rng, dur, 0.1, 0.6, 5) }), 0.3);
    D.add(out, wind(sr, rng, dur, 240, 380, 1.4, 0.05, 0.5), 0.45);
    sprinkle(out, sr, rng, 3, (r) => ({ buf: PRIM.tone(sr, r.fork?.() || r, { dur: 0.9, f: [[0, 130], [0.9, 78]], wave: 'saw', vib: [14, 0.08], lp: 500, amp: [[0, 0], [0.2, 1], [0.9, 0]] }), g: 0.2 }), 1.5);
    sprinkle(out, sr, rng, 1, (r) => ({ buf: PRIM.tone(sr, r.fork?.() || r, { dur: 0.7, f: [[0, 380], [0.7, 330]], amp: [[0, 0], [0.1, 1], [0.25, 0.1], [0.4, 0.9], [0.7, 0] ] }), g: 0.1 }), 3);
  },
  datascape: (sr, rng, dur, out) => {
    D.add(out, PRIM.tone(sr, rng.fork(), { dur, f: 1800, steps: { rate: 6, spread: 1.4 }, crush: [6, 2], amp: gusts(rng, dur, 0, 0.16, 25) }), 0.7);
    D.add(out, noiseBed(sr, rng, dur, { hp: 7000, flutter: [37, 0.9], amp: gusts(rng, dur, 0.1, 0.4, 8) }), 0.25);
    D.add(out, PRIM.tone(sr, rng.fork(), { dur, f: 68, wave: 'saw', lp: 260, amp: gusts(rng, dur, 0.3, 0.6, 4) }), 0.35);
    sprinkle(out, sr, rng, 3, (r) => ({ buf: PRIM.tone(sr, r.fork?.() || r, { dur: 0.35, f: 1400, steps: { rate: 25, spread: 1 }, crush: [5, 3], amp: [[0, 0], [0.02, 1], [0.33, 0.5], [0.35, 0]] }), g: 0.12 }), 1.2);
  },
  servermarsh: (sr, rng, dur, out) => {
    D.add(out, PRIM.tone(sr, rng.fork(), { dur, f: 100, wave: 'saw', lp: 320, amp: gusts(rng, dur, 0.4, 0.7, 4) }), 0.35);
    D.add(out, PRIM.bubbles(sr, rng.fork(), { dur, rate: 1.6, f0: 100, f1: 260, bed: 0.2 }), 0.4);
    sprinkle(out, sr, rng, 8, (r) => ({ buf: PRIM.hit(sr, r.fork?.() || r, { dur: 0.5, kind: 'glass', f: 1400 + 800 * r(), decay: 0.2 }), g: 0.06 }), 0.6);
    D.add(out, PRIM.tone(sr, rng.fork(), { dur, f: 4800, amp: gusts(rng, dur, 0, 0.04, 20) }), 0.4);
  },
  ashfield: (sr, rng, dur, out) => {
    D.add(out, PRIM.clicks(sr, rng.fork(), { dur, n: 140, f: 3800, decay: 0.003, noise: 1, amp: 0.3, jit: 1, fs: 0.8 }), 0.45);
    D.add(out, noiseBed(sr, rng, dur, { color: 'brown', lp: 140, amp: gusts(rng, dur, 0.3, 0.8, 6) }), 0.9);
    D.add(out, noiseBed(sr, rng, dur, { hp: 5000, amp: gusts(rng, dur, 0.02, 0.2, 10) }), 0.2);
  },
  crystal: (sr, rng, dur, out) => {
    D.add(out, PRIM.tone(sr, rng.fork(), { dur, f: 220, ratio: 1, index: 0, amp: gusts(rng, dur, 0.1, 0.4, 5) }), 0.35);
    D.add(out, PRIM.tone(sr, rng.fork(), { dur, f: 330.5, ratio: 1, index: 0, amp: gusts(rng, dur, 0.0, 0.3, 6) }), 0.25);
    const scale = [880, 990, 1174, 1318, 1568, 1760];
    sprinkle(out, sr, rng, 6, (r) => ({ buf: PRIM.hit(sr, r.fork?.() || r, { dur: 1.6, kind: 'glass', f: scale[Math.floor(r() * scale.length)], decay: 1 }), g: 0.1 }), 0.7);
  },
  jungle: (sr, rng, dur, out) => {
    D.add(out, PRIM.tone(sr, rng.fork(), { dur, f: 4600, amp: gusts(rng, dur, 0.02, 0.12, 30) }), 0.5);
    D.add(out, PRIM.tone(sr, rng.fork(), { dur, f: 3300, amp: gusts(rng, dur, 0.0, 0.08, 22) }), 0.4);
    D.add(out, wind(sr, rng, dur, 350, 600, 1.0, 0.1, 0.4), 0.4);
    sprinkle(out, sr, rng, 6, (r) => ({ buf: PRIM.tone(sr, r.fork?.() || r, { dur: 0.3, f: [[0, 1800 + 800 * r()], [0.1, 2600], [0.3, 1900]], vib: [26, 0.04], amp: [[0, 0], [0.04, 1], [0.3, 0]] }), g: 0.14 }), 0.5);
    sprinkle(out, sr, rng, 3, (r) => ({ buf: PRIM.tone(sr, r.fork?.() || r, { dur: 0.35, f: [[0, 180], [0.3, 130]], wave: 'saw', lp: 800, gate: { rate: 14, duty: 0.5 }, amp: [[0, 0], [0.04, 1], [0.35, 0]] }), g: 0.2 }), 1);
  },
  soviet: (sr, rng, dur, out) => {
    D.add(out, wind(sr, rng, dur, 420, 700, 1.6, 0.2, 0.7), 0.55);
    D.add(out, PRIM.tone(sr, rng.fork(), { dur, f: 50, amp: gusts(rng, dur, 0.4, 0.7, 4) }), 0.5);
    sprinkle(out, sr, rng, 2, (r) => ({ buf: PRIM.hit(sr, r.fork?.() || r, { dur: 1.8, kind: 'metal', f: 110 + 30 * r(), decay: 1 }), g: 0.1 }), 3);
  },
  pier: (sr, rng, dur, out) => {
    D.add(out, noiseBed(sr, rng, dur, { color: 'brown', lp: [[0, 350], [dur / 2, 520], [dur, 350]], flutter: [0.35, 0.5], amp: gusts(rng, dur, 0.3, 0.9, 8) }), 0.9);
    D.add(out, wind(sr, rng, dur, 500, 800, 1.2, 0.05, 0.4), 0.35);
    sprinkle(out, sr, rng, 2, (r) => ({ buf: PRIM.tone(sr, r.fork?.() || r, { dur: 1.1, f: [[0, 140], [0.5, 120], [1.1, 135]], wave: 'saw', vib: [6, 0.04], lp: 380, amp: [[0, 0], [0.4, 1], [1.1, 0]] }), g: 0.14 }), 2.5);
  },
  // ---- interiors that had no bed of their own
  i_factory: (sr, rng, dur, out) => {
    for (let t = 0.4; t < dur - 1; t += 2.4) D.add(out, PRIM.hit(sr, rng.fork(), { dur: 0.6, kind: 'thump', f: 48 }), 0.9, Math.round(t * sr));
    D.add(out, PRIM.tone(sr, rng.fork(), { dur, f: 60, wave: 'saw', lp: 200, amp: gusts(rng, dur, 0.3, 0.6, 4) }), 0.4);
    sprinkle(out, sr, rng, 5, (r) => ({ buf: PRIM.hit(sr, r.fork?.() || r, { dur: 0.5, kind: 'tin', f: 900 + 500 * r(), decay: 0.4 }), g: 0.06 }), 0.8);
  },
  i_mansion: (sr, rng, dur, out) => {
    D.add(out, wind(sr, rng, dur, 240, 330, 1.6, 0.05, 0.4), 0.5);
    for (let t = 1; t < dur - 1; t += 1.6) D.add(out, PRIM.clicks(sr, rng.fork(), { dur: 0.06, n: 1, f: 1300, decay: 0.008, amp: 0.7 }), 0.18, Math.round(t * sr));   // a clock, far away
    sprinkle(out, sr, rng, 3, (r) => ({ buf: PRIM.tone(sr, r.fork?.() || r, { dur: 0.9, f: [[0, 160], [0.9, 105]], wave: 'saw', vib: [12, 0.06], lp: 460, amp: [[0, 0], [0.25, 1], [0.9, 0]] }), g: 0.16 }), 1.2);
  },
  i_mineshaft: (sr, rng, dur, out) => {
    sprinkle(out, sr, rng, 10, (r) => ({ buf: PRIM.hit(sr, r.fork?.() || r, { dur: 0.4, kind: 'glass', f: 1100 + 700 * r(), decay: 0.15 }), g: 0.08 }), 0.4);
    D.add(out, noiseBed(sr, rng, dur, { color: 'brown', lp: 130, amp: gusts(rng, dur, 0.3, 0.8, 5) }), 0.9);
    sprinkle(out, sr, rng, 2, (r) => ({ buf: PRIM.tone(sr, r.fork?.() || r, { dur: 1.6, f: [[0, 70], [1.6, 52]], wave: 'saw', lp: 260, amp: [[0, 0], [0.6, 1], [1.6, 0]] }), g: 0.22 }), 2.5);
  },
};

export const BED_NAMES = Object.keys(BEDS);
export const BED_LEVEL = { hills: 0.5, swamp: 0.6, snow: 0.5, desert: 0.5, moor: 0.5, blackforest: 0.6, datascape: 0.5, servermarsh: 0.55, ashfield: 0.55, crystal: 0.5, jungle: 0.55, soviet: 0.5, pier: 0.5, i_factory: 0.5, i_mansion: 0.45, i_mineshaft: 0.5 };

const BIOME_BED = {
  hills: 'hills', swamp: 'swamp', snow: 'snow', ice: 'snow', desert: 'desert', twinsun: 'desert', moor: 'moor', blackforest: 'blackforest', datascape: 'datascape',
  servermarsh: 'servermarsh', ashfield: 'ashfield', lava: 'ashfield', crystal: 'crystal', jungle: 'jungle', soviet: 'soviet', pier: 'pier',
};
const INTERIOR_BED = { factory: 'i_factory', mansion: 'i_mansion', mineshaft: 'i_mineshaft' };
const GROUND_BED = { grass: 'hills', snow: 'snow', mud: 'swamp', red_sand: 'desert', sand: 'desert', grass_dry: 'moor', dirt: 'moor', metal_plate: 'datascape', concrete: 'pier' };

/** which bed suits the current place; the 5 newer interior themes keep their own recorded beds (returns null for them) */
export function bedFor({ biome = null, ground = null, interior = null, indoor = false } = {}) {
  if (indoor) return INTERIOR_BED[interior] || null;
  return BIOME_BED[biome] || GROUND_BED[ground] || null;
}

export function renderBed(name, sr = 22050) {
  const fn = BEDS[name];
  if (!fn) throw new Error('unknown bed ' + name);
  const L = Math.round(LOOP_SEC * sr), X = Math.round(XF * sr), total = L + X;
  const rng = D.makeRng(D.hashString('sxbed:' + name));
  const a = new Float32Array(total);
  fn(sr, rng, total / sr, a);
  for (let i = 0; i < total; i++) if (!Number.isFinite(a[i])) a[i] = 0;
  D.hp1(a, sr, 25);   // before the seam: a causal filter keeps a[L-1] -> a[L] continuous
  const out = a.slice(0, L);
  for (let i = 0; i < X; i++) { const u = i / X; out[i] = a[i] * Math.sin(u * Math.PI / 2) + a[L + i] * Math.cos(u * Math.PI / 2); }
  const rm = D.rms(out), pk = D.peak(out);
  if (pk > 1e-9) D.mul(out, Math.min(0.8 / pk, 0.12 / Math.max(rm, 1e-6)));
  return out;
}

export { TAU };
