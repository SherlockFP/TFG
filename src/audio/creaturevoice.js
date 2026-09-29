// CREATURE VOICES (module `sfx`, docs/wave4/sfx.md) - pure-JS procedural recipes for creature vocalisations and footsteps.
// No Web Audio and no DOM: everything renders into Float32Arrays with the shared dsp.js primitives, so the whole table is
// testable in Node (tools/harness/sfx.test.mjs renders every recipe for every creature).
//
//   ARCH[arch][event](k, v) -> spec { dur, layers:[{p, o, g, t}], post }   one archetype = one family of six events
//   STEPS[foot](k, v)       -> spec                                        footstep classes
//   renderSpec(spec, sr, seed) -> Float32Array (peak 0.9)
//   renderCreatureSound(voice, event, variant, sr) -> Float32Array
//        voice = { arch, k:{tuning}, ov:{event:(k,v)=>spec} } (see src/game/sfx_profiles.js)
//
// Layer primitives (all seeded, all return mono buffers): vox (formant voice), nz (filtered noise), clicks (chitter / bones / servo
// ticks), tone (FM / saw / square with sample&hold steps + gate = glitch, alarms), hit (modal strike: metal / wood / bone / bell ...),
// bubbles (wet gurgles). `post` = band / drive / crush / ring / stutter / static / echo on the mixed event (radio voices, data screech).
import * as D from './dsp.js';

export const EVENTS = ['idle', 'alert', 'chase', 'attack', 'hurt', 'death'];
export const RENDER_SR = 32000;
export const VARIANTS = 3;
const TAU = D.TAU;
const N = (sr, dur) => Math.max(16, Math.round(sr * dur));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** number | Float32Array | [[t, v], ...] -> Float32Array of n samples */
function curve(n, sr, p, mode = 'lin') {
  if (p instanceof Float32Array) return p;
  if (typeof p === 'number') return new Float32Array(n).fill(p);
  return D.env(n, sr, p, mode);
}

// ------------------------------------------------------------------------------------------------ layer primitives
function pulseGate(amp, pulses, depth, shape = 0.7) {
  const n = amp.length;
  for (let i = 0; i < n; i++) {
    const u = (i / n) * pulses % 1;
    amp[i] *= 1 - depth + depth * Math.pow(Math.sin(Math.PI * u), shape);
  }
}

function vox(sr, rng, o) {
  const n = N(sr, o.dur);
  const f0 = curve(n, sr, o.f0 ?? 120, 'exp');
  const amp = curve(n, sr, o.amp ?? [[0, 0], [0.03, 1], [o.dur * 0.8, 0.8], [o.dur, 0]], 'lin');
  if (o.pulses) pulseGate(amp, o.pulses, o.pd ?? 0.85);
  const y = D.voice(n, sr, rng, {
    f0, vowels: o.vowels ?? [[0, 'a']], scale: o.scale ?? 1, breath: o.breath ?? 0.12, jitter: o.jit ?? 0.012,
    fry: o.fry ?? 0, vib: o.vib, src: o.src, tilt: o.tilt, amp, bw: o.bw, gains: o.gains, pw: o.pw, direct: o.direct,
  });
  if (o.drive) D.shape(y, o.drive);
  return y;
}

function nz(sr, rng, o) {
  const n = N(sr, o.dur);
  const x = D.noise(n, rng, o.color || 'white');
  if (o.bp !== undefined) D.svf(x, sr, 'bp', curve(n, sr, o.bp, 'exp'), o.q ?? 1.5);
  if (o.lp) D.svf(x, sr, 'lp', curve(n, sr, o.lp, 'exp'), 0.7);
  if (o.hp) D.svf(x, sr, 'hp', o.hp, 0.7);
  const amp = curve(n, sr, o.amp ?? [[0, 0], [0.02, 1], [o.dur * 0.7, 0.6], [o.dur, 0]], 'lin');
  if (o.pulses) pulseGate(amp, o.pulses, o.pd ?? 0.85);
  if (o.flutter) { const [r, dp] = o.flutter; const ph = rng() * TAU; for (let i = 0; i < n; i++) amp[i] *= 1 - dp + dp * (0.5 + 0.5 * Math.sin(TAU * r * i / sr + ph)); }
  D.mul(x, amp);
  if (o.gain) D.mul(x, o.gain);
  return x;
}

function clicks(sr, rng, o) {
  const n = N(sr, o.dur), out = new Float32Array(n), cnt = Math.max(1, o.n | 0);
  const tau = o.decay ?? 0.012, acc = o.acc ?? 1, jit = o.jit ?? 0.5;
  for (let k = 0; k < cnt; k++) {
    const tt = o.dur * Math.pow(cnt > 1 ? k / (cnt - 1) : 0, acc) * 0.92 + rng() * jit * (o.dur / cnt) * 0.5;
    const s0 = Math.round(tt * sr);
    const f = o.f * (1 + (rng() - 0.5) * (o.fs ?? 0.3)), ph = rng() * TAU;
    const a = (o.amp ?? 1) * (0.55 + 0.45 * rng());
    const len = Math.min(n - s0, Math.round(tau * 7 * sr));
    for (let j = 0; j < len; j++) {
      const t = j / sr, e = Math.exp(-t / tau);
      out[s0 + j] += (Math.sin(TAU * f * t + ph) * e + (rng() * 2 - 1) * e * e * (o.noise ?? 0.6)) * a;
    }
  }
  return out;
}

function tone(sr, rng, o) {
  const n = N(sr, o.dur);
  const f = curve(n, sr, o.f ?? 440, 'exp');
  if (o.vib) { const [r, d] = o.vib; for (let i = 0; i < n; i++) f[i] *= 1 + d * Math.sin(TAU * r * i / sr); }
  if (o.steps) {                      // sample & hold: the pitch jumps every 1/rate seconds (data screech, modem, glitch)
    const per = Math.max(1, Math.round(sr / o.steps.rate)); let hold = 1;
    for (let i = 0; i < n; i++) {
      if (i % per === 0) hold = o.steps.set ? o.steps.set[Math.floor(rng() * o.steps.set.length)] : Math.pow(2, (rng() * 2 - 1) * (o.steps.spread ?? 1));
      f[i] *= hold;
    }
  }
  let y;
  if (o.wave) y = D.osc(n, sr, o.wave, f, { pw: o.pw ?? 0.5 });
  else y = D.fm(n, sr, f, o.ratio ?? 2, curve(n, sr, o.index ?? 0, 'lin'), { fb: o.fb });
  const amp = curve(n, sr, o.amp ?? [[0, 0], [0.01, 1], [o.dur * 0.8, 0.8], [o.dur, 0]], 'lin');
  D.mul(y, amp);
  if (o.gate) { const per = sr / o.gate.rate; for (let i = 0; i < n; i++) y[i] *= (i % per) / per < o.gate.duty ? 1 : 0; D.svf(y, sr, 'lp', 6000, 0.7); }
  if (o.lp) D.svf(y, sr, 'lp', o.lp, 0.7);
  if (o.crush) D.crush(y, o.crush[0], o.crush[1]);
  if (o.drive) D.shape(y, o.drive);
  return y;
}

const MODES = {
  metal: [[1, 0.9, 1], [2.76, 0.6, 0.7], [5.4, 0.4, 0.5], [8.9, 0.25, 0.35]],
  tin: [[1, 0.35, 1], [1.51, 0.3, 0.8], [2.25, 0.2, 0.6], [3.6, 0.15, 0.5]],
  wood: [[1, 0.18, 1], [1.6, 0.14, 0.6], [2.9, 0.1, 0.4]],
  bone: [[1, 0.09, 1], [2.3, 0.07, 0.7], [3.7, 0.05, 0.5]],
  plastic: [[1, 0.07, 1], [2.1, 0.05, 0.6], [3.3, 0.04, 0.4]],
  glass: [[1, 1.2, 1], [2.32, 0.9, 0.8], [4.25, 0.7, 0.6], [6.63, 0.5, 0.4]],
  thump: [[1, 0.16, 1], [1.9, 0.1, 0.5]],
  bell: [[1, 1.6, 1], [2.0, 1.1, 0.5], [3.01, 0.8, 0.4], [4.17, 0.5, 0.25]],
};
function hit(sr, rng, o) {
  const n = N(sr, o.dur), exc = new Float32Array(n);
  if (o.scrape) {                       // a dragged edge: long noise excitation with a slow swell
    const len = Math.min(n, N(sr, o.scrape)), env = D.env(len, sr, [[0, 0], [o.scrape * 0.3, 1], [o.scrape, 0]], 'lin');
    for (let i = 0; i < len; i++) exc[i] = (rng() * 2 - 1) * env[i] * 0.05;
  } else { const len = Math.min(n, Math.max(2, Math.round(sr * 0.003))); for (let i = 0; i < len; i++) exc[i] = (rng() * 2 - 1) * (1 - i / len); }
  const modes = (MODES[o.kind] || MODES.metal).map(([r, t60, a]) => [o.f * r * (1 + (rng() - 0.5) * 0.02), t60 * (o.decay ?? 1), a]);
  const y = D.modal(exc, sr, modes);
  return y;
}

function bubbles(sr, rng, o) {
  const n = N(sr, o.dur), out = new Float32Array(n), cnt = Math.max(1, Math.round(o.rate * o.dur)), acc = o.acc ?? 1;
  for (let k = 0; k < cnt; k++) {
    const tt = o.dur * Math.pow(rng(), acc) * 0.95, s0 = Math.round(tt * sr);
    const f = o.f0 + (o.f1 - o.f0) * rng(), len = Math.min(n - s0, Math.round((0.03 + rng() * 0.06) * sr));
    let ph = 0; const a = 0.4 + 0.6 * rng();
    for (let j = 0; j < len; j++) {
      const u = j / len; ph += f * (1 + 2.2 * u) / sr;
      out[s0 + j] += Math.sin(TAU * ph) * Math.exp(-u * 4.5) * Math.min(1, j / 40) * a;
    }
  }
  if (o.bed) { const b = D.noise(n, rng, 'brown'); D.svf(b, sr, 'lp', 380, 0.7); const sl = D.smoothNoise(n, sr, rng, 5); for (let i = 0; i < n; i++) out[i] += b[i] * o.bed * (0.6 + 0.4 * sl[i]); }
  return out;
}

export const PRIM = { vox, nz, clicks, tone, hit, bubbles };

// ------------------------------------------------------------------------------------------------ layer shorthands
const Vx = (o, g = 1, t = 0) => ({ p: 'vox', o, g, t });
const Nz = (o, g = 1, t = 0) => ({ p: 'nz', o, g, t });
const Ck = (o, g = 1, t = 0) => ({ p: 'clicks', o, g, t });
const Tn = (o, g = 1, t = 0) => ({ p: 'tone', o, g, t });
const Ht = (o, g = 1, t = 0) => ({ p: 'hit', o, g, t });
const Bb = (o, g = 1, t = 0) => ({ p: 'bubbles', o, g, t });
const swell = (d, a = 0.12, r = 0.85, peak = 1) => [[0, 0], [d * a, peak], [d * r, peak * 0.8], [d, 0]];
const perc = (d, decay = 0.25) => [[0, 0], [0.004, 1], [d * decay, 0.35], [d, 0]];
const S = (dur, layers, post) => ({ dur, layers, post: post || null });
const vr = (v) => [1, 0.92, 1.09][v % 3];   // per-variant pitch / length wobble

// ------------------------------------------------------------------------------------------------ archetypes
export const ARCH_DEFAULTS = {
  beast: { f: 110, sc: 0.9, fry: 0.6, br: 0.25, z: 1 },
  chitter: { f: 3200, n: 1, wet: 0.3, z: 1 },
  human: { f: 120, sc: 1, radio: 0, glitch: 0, whisper: 0, z: 1 },
  undead: { f: 90, rattle: 1, voc: 1, z: 1 },
  robot: { f: 220, servo: 1, beep: 1, clang: 1, z: 1 },
  glitch: { f: 440, bits: 5, rate: 12, spread: 1.2, z: 1 },
  wet: { f: 90, bub: 14, z: 1 },
  screech: { f: 900, fmi: 5, air: 0.3, scream: 0, z: 1 },
  giant: { f: 45, br: 0.4, z: 1 },
  toy: { f: 523, laugh: 1, z: 1 },
  ghost: { f: 330, z: 1 },
};

export const ARCH = {
  // ---- growling four-legged / lunging things (Troll, Pale Hound, Dusk Prowler, Lurker, Flame Fiend ...)
  beast: {
    idle: (k, v) => { const d = 1.6 * k.z, f = k.f * vr(v); return S(d, [
      Nz({ dur: d, color: 'pink', bp: [[0, 420], [0.7 * d, 780], [d, 380]], q: 1.4, amp: [[0, 0], [0.3 * d, 0.7], [0.48 * d, 0.1], [0.72 * d, 0.85], [d, 0]] }, 0.7),
      Vx({ dur: d, f0: f * 0.6, vowels: [[0, 'o'], [d, 'u']], scale: k.sc, fry: 0.9, breath: 0.3, amp: swell(d, 0.4, 0.6, 0.35) }, 0.5)]); },
    alert: (k, v) => { const d = 1.0 * k.z, f = k.f * vr(v); return S(d, [
      Vx({ dur: d, f0: [[0, f * 0.8], [0.5 * d, f * 1.15], [d, f * 0.95]], vowels: [[0, 'o'], [0.5 * d, 'a'], [d, 'uh']], scale: k.sc, fry: k.fry, breath: k.br, vib: [22, 0.03], drive: 1.6, amp: swell(d, 0.12, 0.85) }),
      Nz({ dur: d, hp: 2000, amp: swell(d, 0.2, 0.7, 0.5) }, 0.25)]); },
    chase: (k, v) => { const d = 0.9 * k.z, f = k.f * vr(v); return S(d, [
      Vx({ dur: d, f0: f * 1.4, vowels: [[0, 'a'], [d, 'e']], scale: k.sc, breath: 0.4, pulses: 4, pd: 0.95, drive: 2 }),
      Nz({ dur: d, bp: 1200, q: 0.9, pulses: 4, pd: 0.9 }, 0.4)]); },
    attack: (k, v) => { const d = 0.4, f = k.f * vr(v); return S(d, [
      Vx({ dur: d, f0: [[0, f * 2.4], [d, f * 1.3]], vowels: [[0, 'a'], [d, 'o']], scale: k.sc, fry: 0.3, drive: 3, amp: [[0, 0], [0.02, 1], [0.3, 0.7], [d, 0]] }),
      Nz({ dur: 0.18, hp: 900, amp: perc(0.18, 0.4) }, 0.5)]); },
    hurt: (k, v) => { const d = 0.35, f = k.f * vr(v); return S(d, [
      Vx({ dur: d, f0: [[0, f * 2.0], [0.4 * d, f * 3], [d, f * 1.6]], vowels: [[0, 'e'], [d, 'a']], scale: k.sc * 1.15, breath: 0.1, drive: 1.3, amp: swell(d, 0.08, 0.7) })]); },
    death: (k, v) => { const d = 1.5 * k.z, f = k.f * vr(v); return S(d, [
      Vx({ dur: d, f0: [[0, f * 1.6], [d, f * 0.55]], vowels: [[0, 'a'], [0.5 * d, 'o'], [d, 'u']], scale: k.sc, fry: 0.7, breath: 0.4, amp: [[0, 0], [0.05, 1], [0.6 * d, 0.7], [d, 0]] }),
      Nz({ dur: d, bp: 700, q: 1, amp: swell(d, 0.4, 0.7, 0.5) }, 0.6)]); },
  },

  // ---- clicking / chittering arthropods and bots (Spam Bot, Web Spider, Collector, Leecher, Replies ...)
  chitter: {
    idle: (k, v) => { const d = 0.7 * k.z; return S(d, [Ck({ dur: d, n: 3 + (v % 3), f: k.f, decay: 0.008, amp: 0.7 })]); },
    alert: (k, v) => { const d = 0.6; return S(d, [Ck({ dur: d * 0.85, n: 10, acc: 0.7, f: k.f, decay: 0.008 }), Nz({ dur: d, hp: k.f * 0.8, amp: swell(d, 0.3, 0.7, 0.5) }, 0.35)]); },
    chase: (k, v) => { const d = 0.8; return S(d, [Ck({ dur: d, n: 22 + 3 * v, f: k.f * 0.85, decay: 0.006, amp: 0.8 }), Tn({ dur: d, f: k.f * 0.3, wave: 'saw', lp: 1800, amp: swell(d, 0.1, 0.9, 0.3) }, 0.3)]); },
    attack: (k, v) => { const d = 0.35; return S(d, [Ck({ dur: 0.05, n: 1, f: k.f * 0.6, decay: 0.02, amp: 1.4, noise: 1 }), Nz({ dur: d, hp: k.f * 0.7, amp: perc(d, 0.35) }, 0.5), Ck({ dur: 0.2, n: 5, f: k.f, decay: 0.006 }, 0.5, 0.06)]); },
    hurt: (k, v) => { const d = 0.3; return S(d, [Tn({ dur: d, f: [[0, k.f * 0.6], [d, k.f * 0.35]], ratio: 1.5, index: 4, vib: [40, 0.05], amp: swell(d, 0.05, 0.7) }, 0.7), Nz({ dur: d, bp: 2400, q: 1, amp: perc(d, 0.5) }, 0.5)]); },
    death: (k, v) => { const d = 1.1; return S(d, [Ck({ dur: d, n: 16, acc: 1.7, f: k.f * 0.9, decay: 0.01 }), Tn({ dur: d, f: [[0, k.f * 0.5], [d, k.f * 0.08]], ratio: 1.5, index: 3, amp: swell(d, 0.05, 0.6, 0.6) }, 0.5), Nz({ dur: d, hp: 3000, amp: swell(d, 0.1, 0.5, 0.4) }, 0.3)]); },
  },

  // ---- humanoid voices; radio = squad radio static, glitch = deepfake / data corruption, whisper = breath only
  human: {
    idle: (k, v) => { const d = 1.2 * k.z, f = k.f * vr(v); return S(d, [
      Vx({ dur: d, f0: [[0, f], [0.5 * d, f * 1.08], [d, f * 0.95]], vowels: [[0, 'm'], [0.2 * d, 'a'], [0.5 * d, 'e'], [0.8 * d, 'o']], scale: k.sc, breath: k.whisper ? 0.9 : 0.3, src: k.whisper ? 'noise' : undefined, amp: [[0, 0], [0.1, 0.5], [0.9 * d, 0.4], [d, 0]] })], humanPost(k)); },
    alert: (k, v) => { const d = 0.55, f = k.f * vr(v); return S(d, [
      Vx({ dur: d, f0: [[0, f * 1.1], [0.5 * d, f * 1.4], [d, f * 1.25]], vowels: [[0, 'e'], [0.6 * d, 'ae']], scale: k.sc, drive: 1.5, amp: swell(d, 0.1, 0.8) })], humanPost(k)); },
    chase: (k, v) => { const d = 0.9, f = k.f * vr(v); return S(d, [
      Vx({ dur: d, f0: f * 1.3, vowels: [[0, 'e'], [d, 'ae']], scale: k.sc, pulses: 2, pd: 0.95, drive: 2.2, breath: 0.2 })], humanPost(k)); },
    attack: (k, v) => { const d = 0.3, f = k.f * vr(v); return S(d, [
      Vx({ dur: d, f0: [[0, f * 1.3], [d, f * 0.8]], vowels: [[0, 'a']], scale: k.sc, fry: 0.5, breath: 0.3, drive: 2.5, amp: swell(d, 0.05, 0.6) }), Nz({ dur: d, bp: 1500, q: 0.8, amp: perc(d, 0.3) }, 0.3)], humanPost(k)); },
    hurt: (k, v) => { const d = 0.45, f = k.f * vr(v); return S(d, [
      Vx({ dur: d, f0: [[0, f * 1.5], [d, f * 0.9]], vowels: [[0, 'ae'], [d, 'uh']], scale: k.sc, breath: 0.2, amp: swell(d, 0.1, 0.7) })], humanPost(k)); },
    death: (k, v) => { const d = 1.2, f = k.f * vr(v); return S(d, [
      Vx({ dur: d, f0: [[0, f * 1.2], [d, f * 0.5]], vowels: [[0, 'o'], [d, 'u']], scale: k.sc, breath: 0.5, fry: 0.8, amp: swell(d, 0.08, 0.6) }), Bb({ dur: d, rate: 9, f0: 200, f1: 500 }, 0.3)], humanPost(k)); },
  },

  // ---- undead groans + bone rattles (Zombie Account, Bone Walker / Archer / Knight / Swarm)
  undead: {
    idle: (k, v) => { const d = 1.6 * k.z, f = k.f * vr(v); return S(d, [
      ...(k.voc ? [Vx({ dur: d, f0: [[0, f], [0.6 * d, f * 0.9], [d, f * 0.8]], vowels: [[0, 'o'], [d, 'u']], fry: 0.9, breath: 0.4, amp: swell(d, 0.3, 0.7, 0.5) }, 0.7)] : []),
      Ck({ dur: d, n: 3 + v, f: 2200 * (f / 90) ** 0.3, decay: 0.02 }, 0.3 * k.rattle + (k.voc ? 0 : 0.5))]); },
    alert: (k, v) => { const d = 1.0, f = k.f * vr(v); return S(d, [
      ...(k.voc ? [Vx({ dur: d, f0: [[0, f], [d, f * 1.5]], vowels: [[0, 'o'], [d, 'a']], fry: 0.8, breath: 0.3, amp: swell(d, 0.2, 0.8) }, 0.8)] : [Tn({ dur: d, f: [[0, 500], [d, 900]], wave: 'saw', lp: 1400, amp: swell(d, 0.3, 0.8, 0.4) }, 0.4)]),
      Ck({ dur: d * 0.8, n: 8, acc: 0.7, f: 2000 }, 0.4 * k.rattle + 0.2)]); },
    chase: (k, v) => { const d = 0.9, f = k.f * vr(v); return S(d, [
      Ck({ dur: d, n: 22, f: 1800, decay: 0.014 }, 0.7 * k.rattle + 0.2),
      ...(k.voc ? [Vx({ dur: d, f0: f * 1.2, vowels: [[0, 'a']], breath: 0.5, pulses: 3, fry: 0.6 }, 0.5)] : [])]); },
    attack: (k, v) => { const d = 0.3, f = k.f * vr(v); return S(d, [
      Ht({ dur: d, kind: 'bone', f: 1100 }, 1), Nz({ dur: 0.16, hp: 1500, amp: perc(0.16, 0.3) }, 0.4),
      ...(k.voc ? [Vx({ dur: d, f0: f * 1.6, vowels: [[0, 'a']], fry: 0.9, breath: 0.6, amp: swell(d, 0.05, 0.6) }, 0.6)] : [])]); },
    hurt: (k, v) => { const d = 0.35, f = k.f * vr(v); return S(d, [
      Ht({ dur: d, kind: 'bone', f: 700 }, 0.9),
      ...(k.voc ? [Vx({ dur: d, f0: [[0, f * 1.6], [d, f]], vowels: [[0, 'ae'], [d, 'uh']], breath: 0.3, amp: swell(d, 0.08, 0.6) }, 0.7)] : [Ck({ dur: 0.2, n: 5, f: 1800 }, 0.5, 0.05)])]); },
    death: (k, v) => { const d = 1.3, f = k.f * vr(v); return S(d, [
      Ck({ dur: d, n: 26, acc: 1.6, f: 1400, decay: 0.016 }, 0.8 * k.rattle + 0.2), Ht({ dur: 0.6, kind: 'wood', f: 200 }, 0.6, 0.05),
      ...(k.voc ? [Vx({ dur: 1.1, f0: [[0, f * 1.1], [1.1, f * 0.4]], vowels: [[0, 'o'], [1.1, 'u']], fry: 0.9, breath: 0.4, amp: swell(1.1, 0.06, 0.6) }, 0.6)] : [])]); },
  },

  // ---- servos, beeps and clangs (Firewall Turret, Security Bot, Janitor Bot, Legacy Bot, server nodes)
  robot: {
    idle: (k, v) => { const d = 1.2 * k.z, f = k.f * vr(v); return S(d, [
      Tn({ dur: d, f: [[0, f * 0.5], [0.5 * d, f * 0.56], [d, f * 0.5]], wave: 'saw', lp: 900, amp: swell(d, 0.2, 0.8, 0.5) }, 0.45 * k.servo + 0.1),
      Tn({ dur: 0.07, f: f * 4, amp: perc(0.07, 0.6) }, 0.35 * k.beep, 0.7 * d)]); },
    alert: (k, v) => { const d = 0.7, f = k.f * vr(v); return S(d, [
      Tn({ dur: 0.12, f: f * 3, amp: perc(0.12, 0.6) }, 0.7 * k.beep), Tn({ dur: 0.12, f: f * 4.2, amp: perc(0.12, 0.6) }, 0.7 * k.beep, 0.16),
      Tn({ dur: d, f: [[0, f * 0.4], [d, f * 1.2]], wave: 'saw', lp: 1600, amp: swell(d, 0.1, 0.9, 0.6) }, 0.5 * k.servo)]); },
    chase: (k, v) => { const d = 1.0, f = k.f * vr(v); return S(d, [
      Tn({ dur: d, f: f * 0.6, wave: 'square', gate: { rate: 9, duty: 0.5 }, lp: 1200, amp: swell(d, 0.05, 0.9, 0.6) }, 0.6),
      Ck({ dur: d, n: 12, f: 2500, decay: 0.006 }, 0.5)]); },
    attack: (k, v) => { const d = 0.6, f = k.f * vr(v); return S(d, [
      Ht({ dur: d, kind: 'metal', f: 400 * k.clang }, 1), Nz({ dur: 0.12, bp: 3000, q: 1, amp: perc(0.12, 0.4) }, 0.5)]); },
    hurt: (k, v) => { const d = 0.3, f = k.f * vr(v); return S(d, [
      Nz({ dur: d, hp: 1500, amp: perc(d, 0.3) }, 0.7), Tn({ dur: d, f: [[0, f * 3], [d, f * 0.5]], wave: 'saw', lp: 4000, crush: [6, 2], amp: swell(d, 0.05, 0.6) }, 0.5), Ht({ dur: d, kind: 'metal', f: 900 }, 0.4)]); },
    death: (k, v) => { const d = 1.4, f = k.f * vr(v); return S(d, [
      Tn({ dur: d, f: [[0, f * 2], [d, f * 0.1]], wave: 'saw', lp: 2500, amp: swell(d, 0.03, 0.7, 0.8) }, 0.7),
      Nz({ dur: d, amp: swell(d, 0.1, 0.6, 0.4), hp: 2500 }, 0.35), Ht({ dur: 0.5, kind: 'thump', f: 80 }, 0.8, d * 0.9)]); },
  },

  // ---- Algorithm creatures: data screech, modem warble, buffer underrun (Pop-up, Parasocial, Clickbait, Spambomb ...)
  glitch: {
    idle: (k, v) => { const d = 1.1, f = k.f * vr(v); return S(d, [
      Tn({ dur: d, f, steps: { rate: 8, spread: 1 }, amp: swell(d, 0.1, 0.8, 0.3), gate: { rate: 5, duty: 0.6 }, crush: [6, 2] }, 0.8), Nz({ dur: d, hp: 4000, flutter: [23, 0.9], amp: swell(d, 0.1, 0.8, 0.2) }, 0.25)]); },
    alert: (k, v) => { const d = 0.7, f = k.f * vr(v); return S(d, [
      Tn({ dur: d, f: [[0, f * 0.7], [0.6 * d, f * 5], [d, f * 4]], ratio: 2.01, index: [[0, 2], [d, 9]], steps: { rate: 20, spread: 0.3 }, crush: [k.bits, 2], drive: 2, amp: swell(d, 0.08, 0.85) })]); },
    chase: (k, v) => { const d = 1.0, f = k.f * vr(v); return S(d, [
      Tn({ dur: d, f: f * 0.5, wave: 'square', steps: { rate: k.rate, spread: k.spread }, gate: { rate: k.rate * 1.5, duty: 0.55 }, crush: [k.bits, 2], amp: swell(d, 0.05, 0.9, 0.7) }),
      Nz({ dur: d, bp: 3000, q: 1, flutter: [k.rate, 0.9] }, 0.3)]); },
    attack: (k, v) => { const d = 0.3, f = k.f * vr(v); return S(d, [
      Nz({ dur: d, amp: perc(d, 0.4) }, 0.9), Tn({ dur: 0.14, f: [[0, f * 6], [0.14, f]], wave: 'square', amp: perc(0.14, 0.5) }, 0.7)], { crush: [4, 4] }); },
    hurt: (k, v) => { const d = 0.35, f = k.f * vr(v); return S(d, [0, 0.09, 0.17].map((t) => Tn({ dur: 0.08, f: [[0, f * 2], [0.08, f * 1.5]], ratio: 1.5, index: 3, amp: perc(0.08, 0.7) }, 0.8, t)), { crush: [4, 3] }); },
    death: (k, v) => { const d = 1.2, f = k.f * vr(v); return S(d, [
      Tn({ dur: d, f: [[0, f * 3], [d, f * 0.2]], wave: 'saw', steps: { rate: 14, spread: 0.5 }, amp: swell(d, 0.04, 0.7, 0.8) }, 0.8), Nz({ dur: d, hp: 1200, amp: swell(d, 0.1, 0.6, 0.5) }, 0.4)], { crush: [4, 6] }); },
  },

  // ---- wet, boneless things (AI Slop, Worm, Leecher, Hoarder nest, webs)
  wet: {
    idle: (k, v) => { const d = 1.6, f = k.f * vr(v); return S(d, [Bb({ dur: d, rate: k.bub * 0.6, f0: 120, f1: 350, bed: 0.4 }, 0.6), Vx({ dur: d, f0: f, vowels: [[0, 'u']], fry: 0.9, breath: 0.5, amp: swell(d, 0.4, 0.6, 0.3) }, 0.3)]); },
    alert: (k, v) => { const d = 1.0, f = k.f * vr(v); return S(d, [Bb({ dur: d, rate: k.bub * 1.5, f0: 150, f1: 500, bed: 0.3 }, 0.7), Vx({ dur: d, f0: [[0, f], [d, f * 1.8]], vowels: [[0, 'o'], [d, 'a']], fry: 0.9, breath: 0.5, amp: swell(d, 0.2, 0.8) }, 0.6)]); },
    chase: (k, v) => { const d = 1.0; return S(d, [Nz({ dur: d, color: 'brown', lp: 500, flutter: [7, 0.8], amp: swell(d, 0.1, 0.9, 0.8) }, 0.9), Bb({ dur: d, rate: k.bub * 2, f0: 100, f1: 300 }, 0.5)]); },
    attack: (k, v) => { const d = 0.4; return S(d, [Nz({ dur: d, bp: [[0, 2600], [0.3, 320]], q: 0.8, amp: perc(d, 0.4) }, 0.9), Ht({ dur: d, kind: 'thump', f: 120 }, 0.8), Bb({ dur: 0.3, rate: 22, f0: 200, f1: 600 }, 0.4)]); },
    hurt: (k, v) => { const d = 0.35; return S(d, [Tn({ dur: d, f: [[0, 300], [0.4 * d, 900], [d, 250]], vib: [30, 0.1], amp: swell(d, 0.08, 0.7) }, 0.6), Bb({ dur: d, rate: 20, f0: 250, f1: 700 }, 0.5)]); },
    death: (k, v) => { const d = 1.8, f = k.f * vr(v); return S(d, [Bb({ dur: d, rate: 20, acc: 1.8, f0: 100, f1: 400, bed: 0.4 }, 0.8), Nz({ dur: d, color: 'brown', lp: 300, amp: swell(d, 0.05, 0.5) }, 0.6), Vx({ dur: 1.3, f0: [[0, f * 1.2], [1.3, f * 0.4]], vowels: [[0, 'o'], [1.3, 'u']], fry: 0.9, breath: 0.4, amp: swell(1.3, 0.06, 0.6) }, 0.5)]); },
  },

  // ---- birds, screams and shrieks (Screamer, Reply Guy flock, Data Hoarder, Tamagotchi, Smiler)
  screech: {
    idle: (k, v) => { const d = 0.8, f = k.f * vr(v); return S(d, [Tn({ dur: 0.22, f: [[0, f * 0.6], [0.06, f * 0.8], [0.22, f * 0.6]], vib: [18, 0.03], amp: swell(0.22, 0.2, 0.7) }, 0.6), Tn({ dur: 0.22, f: [[0, f * 0.65], [0.06, f * 0.9], [0.22, f * 0.62]], vib: [18, 0.03], amp: swell(0.22, 0.2, 0.7) }, 0.5, 0.42)]); },
    alert: (k, v) => { const d = 0.6, f = k.f * vr(v); return S(d, [
      Tn({ dur: d, f: [[0, f * 0.7], [d, f * 1.4]], ratio: 1.5, index: [[0, 1], [0.7 * d, k.fmi], [d, 2]], vib: [12, 0.03], amp: swell(d, 0.15, 0.85) }), Nz({ dur: d, hp: 3000, amp: swell(d, 0.3, 0.8, 0.5) }, k.air)]); },
    chase: (k, v) => { const f = k.f * vr(v); return S(0.85, [0, 0.27, 0.54].map((t, i) => Tn({ dur: 0.22, f: [[0, f * (1 + 0.06 * i)], [0.12, f * 1.5]], ratio: 1.5, index: k.fmi * 0.7, amp: perc(0.22, 0.6) }, 0.8, t))); },
    attack: (k, v) => { const d = 0.4, f = k.f * vr(v); return S(d, [
      Tn({ dur: d, f: [[0, f * 1.6], [d, f * 0.9]], ratio: 1.4, index: k.fmi * 1.3, drive: 2.5, amp: swell(d, 0.05, 0.7) }), Nz({ dur: d, bp: 2500, q: 0.8, amp: perc(d, 0.4) }, 0.5),
      ...(k.scream ? [Vx({ dur: 0.9, f0: [[0, f * 0.6], [0.9, f * 0.5]], vowels: [[0, 'a']], scale: 1.5, breath: 0.4, drive: 3, amp: swell(0.9, 0.05, 0.85) }, 0.9)] : [])]); },
    hurt: (k, v) => { const d = 0.3, f = k.f * vr(v); return S(d, [Tn({ dur: d, f: [[0, f * 1.8], [d, f * 0.7]], ratio: 1.5, index: 3, amp: swell(d, 0.05, 0.7) })]); },
    death: (k, v) => { const d = 1.1, f = k.f * vr(v); return S(d, [Tn({ dur: d, f: [[0, f * 1.3], [d, f * 0.25]], vib: [7, 0.08], ratio: 1.5, index: [[0, 3], [d, 0.5]], amp: swell(d, 0.05, 0.75) }), Nz({ dur: d, hp: 2500, amp: swell(d, 0.1, 0.6, 0.4) }, 0.3)]); },
  },

  // ---- very large things (Influencer, Worm, Dune Maw, Foreman, Excavator, Behemoth)
  giant: {
    idle: (k, v) => { const d = 2.2 * k.z, f = k.f * vr(v); return S(d, [Nz({ dur: d, color: 'brown', lp: 260, amp: [[0, 0], [0.3 * d, 0.9], [0.5 * d, 0.2], [0.75 * d, 0.9], [d, 0]] }, 0.9), Vx({ dur: d, f0: f, vowels: [[0, 'o']], scale: 0.6, fry: 0.9, breath: 0.4, amp: swell(d, 0.4, 0.6, 0.4) }, 0.4)]); },
    alert: (k, v) => { const d = 1.5 * k.z, f = k.f * vr(v); return S(d, [
      Vx({ dur: d, f0: [[0, f * 0.9], [0.4 * d, f * 1.7], [d, f * 1.2]], vowels: [[0, 'o'], [0.4 * d, 'a'], [d, 'o']], scale: 0.6, fry: 0.95, breath: k.br, drive: 2, amp: swell(d, 0.2, 0.85) }),
      Nz({ dur: d, color: 'brown', lp: 600, amp: swell(d, 0.3, 0.8, 0.7) }, 0.6)]); },
    chase: (k, v) => { const d = 1.2, f = k.f * vr(v); return S(d, [Vx({ dur: d, f0: f * 1.3, vowels: [[0, 'o'], [d, 'a']], scale: 0.6, fry: 0.8, breath: 0.5, pulses: 4, pd: 0.9 }, 0.8), Nz({ dur: d, color: 'brown', lp: 400, pulses: 4, pd: 0.9 }, 0.7)]); },
    attack: (k, v) => { const d = 0.6, f = k.f * vr(v); return S(d, [Vx({ dur: 0.5, f0: [[0, f * 2], [0.5, f]], vowels: [[0, 'a'], [0.5, 'o']], scale: 0.6, fry: 0.8, drive: 3, amp: swell(0.5, 0.05, 0.6) }), Ht({ dur: d, kind: 'thump', f: 55 }, 1.1, 0.05)]); },
    hurt: (k, v) => { const d = 0.5, f = k.f * vr(v); return S(d, [Vx({ dur: d, f0: [[0, f * 1.6], [d, f]], vowels: [[0, 'o']], scale: 0.6, fry: 0.7, drive: 1.5, amp: swell(d, 0.1, 0.7) })]); },
    death: (k, v) => { const d = 2.2, f = k.f * vr(v); return S(d, [Vx({ dur: d, f0: [[0, f * 1.4], [d, f * 0.3]], vowels: [[0, 'a'], [0.5 * d, 'o'], [d, 'u']], scale: 0.6, fry: 0.9, breath: 0.5, amp: swell(d, 0.05, 0.7) }), Ht({ dur: 0.9, kind: 'thump', f: 40 }, 1, 0.55 * d), Nz({ dur: d, color: 'brown', lp: 300, amp: swell(d, 0.1, 0.6, 0.6) }, 0.5)]); },
  },

  // ---- toys and party things (Pop-up jester, Partygoer, Tamagotchi, The Editor)
  toy: {
    idle: (k, v) => { const d = 1.6, f = k.f * vr(v); const seq = [1, 1.19, 1.5, 1.19]; return S(d, seq.map((r, i) => Ht({ dur: 0.9, kind: 'bell', f: f * r * (1 + 0.006 * v), decay: 0.5 }, 0.6, i * 0.34 + (i === 3 ? 0.05 * v : 0)))); },
    alert: (k, v) => { const d = 0.9; return S(d, [Ck({ dur: 0.8, n: 14, acc: 0.8, f: 1400, decay: 0.008 }, 0.9), Tn({ dur: d, f: [[0, 200], [d, 700]], wave: 'saw', lp: 900, amp: swell(d, 0.1, 0.9, 0.4) }, 0.4)]); },
    chase: (k, v) => { const d = 1.0, f = k.f * vr(v); return S(d, [Vx({ dur: d, f0: [[0, f * 0.45], [d, f * 0.58]], vowels: [[0, 'a'], [d, 'e']], scale: 1.3, breath: 0.2, pulses: 5, pd: 0.9, drive: 2 })]); },
    attack: (k, v) => { const d = 0.3, f = k.f * vr(v); return S(d, [Tn({ dur: d, f: [[0, f * 0.5], [d, f * 0.35]], wave: 'square', drive: 2, lp: 3000, amp: swell(d, 0.03, 0.6) }), Nz({ dur: 0.1, amp: perc(0.1, 0.3) }, 0.4)]); },
    hurt: (k, v) => { const d = 0.25, f = k.f * vr(v); return S(d, [Tn({ dur: d, f: [[0, f * 1.5], [0.5 * d, f * 3], [d, f * 2]], amp: swell(d, 0.05, 0.7) })]); },
    death: (k, v) => { const d = 1.2, f = k.f * vr(v); return S(d, [Tn({ dur: d, f: [[0, f * 2], [d, f * 0.3]], wave: 'saw', vib: [16, 0.05], lp: 2500, amp: swell(d, 0.03, 0.7, 0.7) }, 0.8), Nz({ dur: d, hp: 3500, amp: swell(d, 0.1, 0.6, 0.4) }, 0.3)]); },
  },

  // ---- whispers, wails and other things that are not really there (Reflection Wraith, The Host, Smiler)
  ghost: {
    idle: (k, v) => { const d = 1.4 * k.z; return S(d, [Vx({ dur: d, f0: k.f, src: 'noise', vowels: [[0, 'i'], [0.3 * d, 'e'], [0.6 * d, 'a'], [d, 'u']], scale: 1.1, amp: [[0, 0], [0.3 * d, 0.8], [0.6 * d, 0.3], [0.85 * d, 0.7], [d, 0]] }, 1), Nz({ dur: d, hp: 5000, amp: swell(d, 0.4, 0.6, 0.25) }, 0.3)]); },
    alert: (k, v) => { const d = 1.2, f = k.f * vr(v); return S(d, [Vx({ dur: d, f0: [[0, f], [0.5 * d, f * 1.6], [d, f * 1.3]], vib: [5, 0.03], vowels: [[0, 'o'], [d, 'a']], breath: 0.5, scale: 1.2, amp: swell(d, 0.3, 0.8) })]); },
    chase: (k, v) => { const d = 1.1; return S(d, [Vx({ dur: d, f0: k.f * 0.8, src: 'noise', vowels: [[0, 'a'], [d, 'o']], pulses: 3, pd: 0.9 }, 1), Nz({ dur: d, bp: 1800, q: 1, pulses: 3, pd: 0.9 }, 0.3)]); },
    attack: (k, v) => { const d = 0.5, f = k.f * vr(v); return S(d, [Tn({ dur: d, f: [[0, f * 2], [d, f]], ratio: 1.5, index: 6, drive: 2, amp: swell(d, 0.05, 0.7) }), Nz({ dur: d, hp: 2500, amp: swell(d, 0.1, 0.6, 0.6) }, 0.5)]); },
    hurt: (k, v) => { const d = 0.5, f = k.f * vr(v); return S(d, [Vx({ dur: d, f0: [[0, f * 1.4], [d, f * 0.8]], breath: 0.6, vowels: [[0, 'e'], [d, 'o']], scale: 1.2, amp: swell(d, 0.1, 0.7) })]); },
    death: (k, v) => { const d = 1.5, f = k.f * vr(v); return S(d, [Vx({ dur: d, f0: [[0, f], [d, f * 2]], breath: 0.8, vowels: [[0, 'o'], [d, 'i']], scale: 1.2, vib: [6, 0.05], amp: swell(d, 0.1, 0.5) }), Nz({ dur: d, hp: 4000, amp: swell(d, 0.2, 0.5, 0.5) }, 0.4)], { echo: [0.16, 0.45, 0.5] }); },
  },
};

function humanPost(k) {
  const p = {};
  if (k.radio) { p.band = [350, 3200]; p.drive = 1.6 + 1.2 * k.radio; p.static = 0.22 * k.radio; }
  if (k.glitch) { p.crush = [Math.round(7 - 3 * k.glitch), 1 + Math.round(2 * k.glitch)]; p.stutter = { rate: 9 + 12 * k.glitch, depth: 0.7 * k.glitch }; }
  return p.band || p.crush ? p : null;
}

// ------------------------------------------------------------------------------------------------ footsteps by foot class
export const FOOT_CLASSES = ['none', 'pad', 'paw', 'skitter', 'scuttle', 'plastic', 'squelch', 'metal', 'bone', 'boot', 'stomp', 'hoof', 'bare', 'shoe', 'flap', 'shuffle', 'wheel', 'rumble'];
export const STEPS = {
  pad: (k, v) => S(0.14, [Ht({ dur: 0.14, kind: 'thump', f: 90 * vr(v) }, 0.9), Nz({ dur: 0.1, lp: 500, amp: perc(0.1, 0.3) }, 0.5)]),
  paw: (k, v) => S(0.2, [Ht({ dur: 0.2, kind: 'thump', f: 70 * vr(v) }, 0.9), Nz({ dur: 0.1, bp: 1200, q: 0.8, amp: perc(0.1, 0.3) }, 0.35), Ck({ dur: 0.08, n: 2, f: 3500, decay: 0.004 }, 0.35, 0.02)]),
  skitter: (k, v) => S(0.12, [Ck({ dur: 0.1, n: 5, f: 3600 * vr(v), decay: 0.005, amp: 0.7 })]),
  scuttle: (k, v) => S(0.16, [Ck({ dur: 0.13, n: 4, f: 2200 * vr(v), decay: 0.008 }, 0.8), Ht({ dur: 0.1, kind: 'tin', f: 900 }, 0.3)]),
  plastic: (k, v) => S(0.14, [Ht({ dur: 0.1, kind: 'plastic', f: 1800 * vr(v) }, 0.9), Ck({ dur: 0.05, n: 1, f: 3000, decay: 0.004 }, 0.5)]),
  squelch: (k, v) => S(0.22, [Bb({ dur: 0.2, rate: 12, f0: 140, f1: 380 }, 0.8), Nz({ dur: 0.16, lp: 600, amp: perc(0.16, 0.4) }, 0.6)]),
  metal: (k, v) => S(0.35, [Ht({ dur: 0.35, kind: 'metal', f: 300 * vr(v), decay: 0.4 }, 0.8), Nz({ dur: 0.1, bp: 800, q: 0.8, amp: perc(0.1, 0.3) }, 0.5), Ht({ dur: 0.16, kind: 'thump', f: 80 }, 0.5)]),
  bone: (k, v) => S(0.14, [Ck({ dur: 0.1, n: 2, f: 1500 * vr(v), decay: 0.015 }, 0.9), Ht({ dur: 0.1, kind: 'bone', f: 800 }, 0.6)]),
  boot: (k, v) => S(0.2, [Ht({ dur: 0.18, kind: 'thump', f: 110 * vr(v) }, 0.9), Nz({ dur: 0.08, bp: 900, q: 0.8, amp: perc(0.08, 0.3) }, 0.5), Ht({ dur: 0.1, kind: 'wood', f: 420 }, 0.3)]),
  stomp: (k, v) => S(0.5, [Ht({ dur: 0.5, kind: 'thump', f: 45 * vr(v) }, 1.1), Nz({ dur: 0.35, color: 'brown', lp: 220, amp: perc(0.35, 0.4) }, 0.7)]),
  hoof: (k, v) => S(0.22, [Ht({ dur: 0.2, kind: 'wood', f: 150 * vr(v) }, 0.9), Ht({ dur: 0.2, kind: 'thump', f: 60 }, 0.8)]),
  bare: (k, v) => S(0.1, [Nz({ dur: 0.1, lp: 320 * vr(v), amp: perc(0.1, 0.3) }, 0.9)]),
  shoe: (k, v) => S(0.16, [Tn({ dur: 0.09, f: [[0, 600 * vr(v)], [0.07, 1250]], amp: swell(0.09, 0.1, 0.7) }, 0.5), Ht({ dur: 0.14, kind: 'thump', f: 100 }, 0.6)]),
  flap: (k, v) => S(0.18, [Nz({ dur: 0.16, bp: 2000, q: 0.7, flutter: [28, 0.9], amp: swell(0.16, 0.2, 0.6, 0.7) }, 0.8)]),
  shuffle: (k, v) => S(0.28, [Nz({ dur: 0.26, color: 'pink', lp: 700 * vr(v), amp: [[0, 0], [0.05, 0.7], [0.18, 0.5], [0.26, 0]] }, 0.8), Ht({ dur: 0.14, kind: 'thump', f: 80 }, 0.4, 0.1)]),
  wheel: (k, v) => S(0.3, [Tn({ dur: 0.3, f: [[0, 260 * vr(v)], [0.3, 300]], wave: 'saw', lp: 1100, amp: swell(0.3, 0.2, 0.7, 0.5) }, 0.5), Ck({ dur: 0.25, n: 4, f: 2600, decay: 0.005 }, 0.4)]),
  rumble: (k, v) => S(0.7, [Nz({ dur: 0.7, color: 'brown', lp: 150, amp: swell(0.7, 0.3, 0.6) }, 1), Ht({ dur: 0.5, kind: 'thump', f: 35 }, 0.8)]),
};

// ------------------------------------------------------------------------------------------------ rendering
export function specFor(voice, event, variant = 0) {
  if (event === 'step') {
    const fn = STEPS[voice.foot] || STEPS.pad;
    return fn({}, variant);
  }
  const k = { ...(ARCH_DEFAULTS[voice.arch] || {}), ...(voice.k || {}) };
  const ov = voice.ov?.[event];
  if (ov) return ov(k, variant, ARCH[voice.arch]?.[event]);
  const fn = ARCH[voice.arch]?.[event];
  if (!fn) throw new Error(`no recipe ${voice.arch}.${event}`);
  return fn(k, variant);
}

export function renderSpec(spec, sr = RENDER_SR, seed = 1) {
  const rng = D.makeRng(seed);
  const total = N(sr, spec.dur);
  let out = new Float32Array(total);
  for (const L of spec.layers) {
    const fn = PRIM[L.p];
    if (!fn) throw new Error('unknown layer ' + L.p);
    D.add(out, fn(sr, rng.fork(), L.o), L.g ?? 1, Math.round((L.t ?? 0) * sr));
  }
  const P = spec.post;
  if (P) {
    if (P.band) { D.svf(out, sr, 'hp', P.band[0], 0.7); D.svf(out, sr, 'lp', P.band[1], 0.7); }
    if (P.crush) D.crush(out, P.crush[0], P.crush[1]);
    if (P.ring) D.ring(out, sr, P.ring[0], P.ring[1]);
    if (P.stutter) {           // gate chops (data dropouts)
      const per = Math.max(1, Math.round(sr / P.stutter.rate)), r2 = rng.fork();
      for (let s = 0; s < total; s += per) if (r2() < 0.35 * P.stutter.depth + 0.05) { const e = Math.min(total, s + Math.round(per * (0.4 + 0.5 * r2()))); for (let i = s; i < e; i++) out[i] *= 1 - P.stutter.depth; }
    }
    if (P.static) {
      const nn = D.noise(total, rng.fork()); D.svf(nn, sr, 'bp', 2200, 0.6);
      const env = new Float32Array(out); for (let i = 0; i < total; i++) env[i] = Math.abs(env[i]);
      D.lp1(env, sr, 25);
      const pk = Math.max(1e-6, D.peak(out));
      for (let i = 0; i < total; i++) out[i] += nn[i] * Math.min(1, env[i] / pk * 2) * P.static * pk;
    }
    if (P.drive) D.shape(out, P.drive);
    if (P.echo) out = D.echo(out, sr, P.echo[0], P.echo[1], P.echo[2]);
  }
  D.hp1(out, sr, 22);
  for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i])) out[i] = 0;
  D.fade(out, sr, 0.003, Math.min(0.03, spec.dur * 0.15));
  // loudness match: peak 0.9 for sparse / percussive sounds, RMS 0.17 for dense tonal ones (screeches would otherwise dominate)
  const pk = D.peak(out), rm = D.rms(out);
  if (pk > 1e-9) D.mul(out, Math.min(0.9 / pk, 0.17 / Math.max(rm, 1e-6)));
  return out;
}

export function renderCreatureSound(voice, event, variant = 0, sr = RENDER_SR, id = '') {
  const spec = specFor(voice, event, variant);
  const seed = D.hashString(`${id}|${voice.arch}|${JSON.stringify(voice.k || {})}|${voice.foot || ''}|${event}|${variant}`);
  return renderSpec(spec, sr, seed);
}

export { curve, clamp, S, Nz, Ck, Tn, Ht, Bb, Vx, swell, perc };
