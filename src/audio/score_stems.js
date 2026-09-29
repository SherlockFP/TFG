// SCORE stems (wave 7): renders the event lists from score_core.js into AudioBuffers with an OfflineAudioContext.
// Rendering runs on the browser's audio thread (async), once per stem, never per frame. A stem is exactly LOOP (20 s) long with its reverb/echo tail
// folded back onto the start, so it loops seamlessly and all stems stay in phase. Motif variants are short one-shots (glitch = pure JS bit-crush).
import { LOOP, BEAT, mtof, stemEvents, STEM_META, motifEvents, bitcrush, stutter } from './score_core.js';

const SR = 22050;         // music beds are dark / soft: half rate is inaudible and halves memory (20 s stereo = 3.5 MB)
const SR_STING = 32000;
const TAIL = 2.6;

const OAC = () => (typeof window !== 'undefined' ? (window.OfflineAudioContext || window.webkitOfflineAudioContext) : null);
export const canRender = () => !!OAC();

function noiseBuffer(oc) {
  const n = oc.sampleRate * 2, b = oc.createBuffer(1, n, oc.sampleRate), d = b.getChannelData(0);
  let a = 0x1234567;
  for (let i = 0; i < n; i++) { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; d[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1; }
  return b;
}

// ------------------------------------------------------------------ voices: (oc, dest, ev, noise) -> schedules nodes that end by themselves
const g = (oc, dest, v = 1) => { const n = oc.createGain(); n.gain.value = v; n.connect(dest); return n; };
function env(gn, t, att, hold, rel, peak) {
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.linearRampToValueAtTime(peak, t + att);
  gn.gain.setValueAtTime(peak, t + Math.max(att, hold));
  gn.gain.linearRampToValueAtTime(0.0001, t + Math.max(att, hold) + rel);
}
function decay(gn, t, peak, dur, att = 0.004) {
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.linearRampToValueAtTime(peak, t + att);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(att + 0.02, dur));
}
function osc(oc, type, f, t, t1, dest, detune = 0) {
  const o = oc.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
  o.connect(dest); o.start(t); o.stop(t1);
  return o;
}
function filt(oc, type, f, q, dest) { const n = oc.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(dest); return n; }
function noiseSrc(oc, noise, t, dur, dest, off = 0) {
  const s = oc.createBufferSource(); s.buffer = noise; s.loop = true; s.connect(dest);
  s.start(t, off % 1.5); s.stop(t + dur);
  return s;
}
let nIdx = 0;

const VOICE = {
  pad(oc, dest, e) {
    const t = e.t, t1 = t + e.dur + (e.rel || 1);
    const amp = g(oc, dest, 0); env(amp, t, e.att || 1, e.dur, e.rel || 1, e.vel * 0.5 / Math.max(1, e.midi.length * 0.6));
    let out = amp;
    if (e.trem) { const lfo = oc.createOscillator(), depth = oc.createGain(), tg = g(oc, amp, 0.75); lfo.frequency.value = e.trem; depth.gain.value = 0.25; lfo.connect(depth).connect(tg.gain); lfo.start(t); lfo.stop(t1); out = tg; }
    const lp = filt(oc, 'lowpass', e.cut || 1000, 0.7, out);
    for (const m of e.midi) { osc(oc, e.wave || 'triangle', mtof(m), t, t1, lp, -7); osc(oc, e.wave || 'triangle', mtof(m), t, t1, lp, 7); }
  },
  pluck(oc, dest, e) {
    const f = mtof(e.midi[0]), a = g(oc, filt(oc, 'lowpass', 2600, 0.6, dest), 0);
    decay(a, e.t, e.vel * 0.7, Math.min(e.dur, 0.9)); osc(oc, 'triangle', f, e.t, e.t + e.dur + 0.1, a); osc(oc, 'sine', f * 2, e.t, e.t + e.dur + 0.1, g(oc, a, 0.25));
  },
  bell(oc, dest, e) {
    const f = mtof(e.midi[0]), a = g(oc, dest, 0), bend = e.bend || 0;
    decay(a, e.t, e.vel * 0.55, e.dur, 0.003);
    const o = osc(oc, 'sine', f, e.t, e.t + e.dur + 0.1, a);
    if (bend) o.frequency.linearRampToValueAtTime(f * Math.pow(2, bend / 12), e.t + e.dur);
    osc(oc, 'sine', f * 2.76, e.t, e.t + e.dur * 0.6 + 0.1, g(oc, a, 0.28)); osc(oc, 'sine', f * 5.4, e.t, e.t + e.dur * 0.3 + 0.1, g(oc, a, 0.1));
  },
  ep(oc, dest, e) { fmVoice(oc, dest, e, 1, 1.6, 0.5); },
  fm(oc, dest, e) { fmVoice(oc, dest, e, 2, 3.2, 0.6); },
  square(oc, dest, e) {
    const f = mtof(e.midi[0]), a = g(oc, filt(oc, 'lowpass', 3600, 0.8, dest), 0);
    decay(a, e.t, e.vel * 0.5, Math.max(0.06, e.dur), 0.003);
    const o = osc(oc, 'square', f, e.t, e.t + e.dur + 0.1, a);
    if (e.bend) o.frequency.linearRampToValueAtTime(f * Math.pow(2, e.bend / 12), e.t + e.dur);
  },
  vibes(oc, dest, e) {
    const f = mtof(e.midi[0]), a = g(oc, dest, 0), tr = oc.createOscillator(), td = oc.createGain();
    decay(a, e.t, e.vel * 0.55, e.dur, 0.004);
    tr.frequency.value = 5.2; td.gain.value = 0.12; tr.connect(td).connect(a.gain); tr.start(e.t); tr.stop(e.t + e.dur + 0.1);
    osc(oc, 'sine', f, e.t, e.t + e.dur + 0.1, a); osc(oc, 'sine', f * 4, e.t, e.t + e.dur * 0.3 + 0.1, g(oc, a, 0.14));
  },
  sub(oc, dest, e) {
    const f = mtof(e.midi[0]), a = g(oc, dest, 0);
    env(a, e.t, 0.35, e.dur - 0.5, 0.5, e.vel * 0.7);
    osc(oc, 'sine', f, e.t, e.t + e.dur + 0.1, a); osc(oc, 'sine', f * 2, e.t, e.t + e.dur + 0.1, g(oc, a, 0.15));
  },
  hum(oc, dest, e) {
    const f = mtof(e.midi[0]), a = g(oc, dest, e.vel);
    osc(oc, 'sine', f, e.t, e.t + e.dur, a); osc(oc, 'sine', f * 2.003, e.t, e.t + e.dur, g(oc, a, 0.35)); osc(oc, 'sine', f * 3, e.t, e.t + e.dur, g(oc, a, 0.12));
  },
  bass(oc, dest, e) {
    const a = g(oc, filt(oc, 'lowpass', 520, 1.1, dest), 0);
    decay(a, e.t, e.vel * 0.7, Math.max(0.1, e.dur), 0.01); osc(oc, 'sawtooth', mtof(e.midi[0]), e.t, e.t + e.dur + 0.1, a);
  },
  kick(oc, dest, e) {
    const a = g(oc, dest, 0), o = osc(oc, 'sine', 140, e.t, e.t + 0.4, a);
    o.frequency.exponentialRampToValueAtTime(42, e.t + 0.14); decay(a, e.t, e.vel * 0.95, 0.3, 0.002);
  },
  tom(oc, dest, e, noise) {
    const f = mtof(e.midi[0]), a = g(oc, dest, 0), o = osc(oc, 'sine', f * 1.7, e.t, e.t + 0.7, a);
    o.frequency.exponentialRampToValueAtTime(f, e.t + 0.12); decay(a, e.t, e.vel * 0.9, Math.max(0.3, e.dur), 0.002);
    noiseSrc(oc, noise, e.t, 0.03, g(oc, filt(oc, 'bandpass', 900, 1, dest), e.vel * 0.15), nIdx++ * 0.13);
  },
  snare(oc, dest, e, noise) {
    const a = g(oc, filt(oc, 'bandpass', 1900, 0.8, dest), 0);
    decay(a, e.t, e.vel * 0.7, 0.16, 0.002); noiseSrc(oc, noise, e.t, 0.2, a, nIdx++ * 0.11);
    const b = g(oc, dest, 0); decay(b, e.t, e.vel * 0.3, 0.09, 0.002); osc(oc, 'triangle', 190, e.t, e.t + 0.12, b);
  },
  hat(oc, dest, e, noise) {
    const a = g(oc, filt(oc, 'highpass', 7200, 0.7, dest), 0);
    decay(a, e.t, e.vel * 0.7, Math.max(0.04, e.dur), 0.001); noiseSrc(oc, noise, e.t, e.dur + 0.04, a, nIdx++ * 0.07);
  },
  clang(oc, dest, e, noise) {
    const f = mtof(e.midi[0]), a = g(oc, dest, 0);
    decay(a, e.t, e.vel * 0.5, e.dur, 0.002);
    [1, 2.76, 5.4, 8.93].forEach((r, i) => osc(oc, 'sine', f * r, e.t, e.t + e.dur + 0.1, g(oc, a, 0.5 / (i + 1))));
    noiseSrc(oc, noise, e.t, 0.05, g(oc, filt(oc, 'bandpass', 3000, 2, dest), e.vel * 0.2), nIdx++ * 0.09);
  },
  tick(oc, dest, e) {
    const a = g(oc, dest, 0); decay(a, e.t, e.vel * 0.4, 0.035, 0.001); osc(oc, 'square', mtof(e.midi[0]) * 8, e.t, e.t + 0.05, a);
  },
  thump(oc, dest, e) {
    const f = mtof(e.midi[0]), a = g(oc, dest, 0), o = osc(oc, 'sine', f * 1.6, e.t, e.t + e.dur + 0.1, a);
    o.frequency.exponentialRampToValueAtTime(f, e.t + 0.1); decay(a, e.t, e.vel, e.dur, 0.004);
  },
  swell(oc, dest, e, noise) {
    const bp = filt(oc, 'bandpass', e.f0, 1.6, dest), a = g(oc, bp, 0);
    if (e.flat) a.gain.value = e.vel; else env(a, e.t, e.dur * 0.85, e.dur * 0.85, e.dur * 0.14, e.vel);
    if (!e.flat) { bp.frequency.setValueAtTime(e.f0, e.t); bp.frequency.exponentialRampToValueAtTime(e.f1, e.t + e.dur); }
    noiseSrc(oc, noise, e.t, e.dur + 0.05, a, nIdx++ * 0.21);
  },
  stab(oc, dest, e) {
    const a = g(oc, filt(oc, 'lowpass', 1500, 0.9, dest), 0); decay(a, e.t, e.vel * 0.4, 0.2, 0.004);
    for (const m of e.midi) { osc(oc, 'sawtooth', mtof(m), e.t, e.t + 0.3, a, -8); osc(oc, 'sawtooth', mtof(m), e.t, e.t + 0.3, a, 8); }
  },
  brass(oc, dest, e) {
    const a = g(oc, dest, 0); env(a, e.t, 0.18, e.dur - 0.3, 0.32, e.vel * 0.3);
    const lp = filt(oc, 'lowpass', 300, 0.8, a); lp.frequency.setValueAtTime(300, e.t); lp.frequency.linearRampToValueAtTime(1500, e.t + 0.45); lp.frequency.linearRampToValueAtTime(700, e.t + e.dur);
    for (const m of e.midi) { osc(oc, 'sawtooth', mtof(m), e.t, e.t + e.dur + 0.4, lp, -10); osc(oc, 'sawtooth', mtof(m), e.t, e.t + e.dur + 0.4, lp, 10); }
  },
};
function fmVoice(oc, dest, e, ratio, idx, vel) {
  const f = mtof(e.midi[0]), a = g(oc, dest, 0), t = e.t, t1 = t + e.dur + 0.15;
  decay(a, t, e.vel * vel, e.dur, 0.004);
  const car = osc(oc, 'sine', f, t, t1, a);
  const md = oc.createGain(); md.gain.setValueAtTime(f * idx, t); md.gain.exponentialRampToValueAtTime(f * 0.15, t + Math.max(0.2, e.dur * 0.6));
  const mod = oc.createOscillator(); mod.frequency.value = f * ratio; mod.connect(md).connect(car.frequency); mod.start(t); mod.stop(t1);
  if (e.bend) car.frequency.linearRampToValueAtTime(f * Math.pow(2, e.bend / 12), t + e.dur);
}

// ------------------------------------------------------------------ rendering
function build(oc, events, { echo = 0, radio = false } = {}) {
  const noise = noiseBuffer(oc), master = oc.createGain();
  master.gain.value = 1;
  let head = master;
  if (radio) { const hp = filt(oc, 'highpass', 520, 0.8, oc.destination); const lp = filt(oc, 'lowpass', 3300, 0.9, hp); master.connect(lp); }
  else master.connect(oc.destination);
  if (echo > 0) {   // dotted-eighth feedback echo, tail folded by the caller
    const d = oc.createDelay(1.5), fb = oc.createGain(), lp = filt(oc, 'lowpass', 2400, 0.5, fb), send = oc.createGain();
    d.delayTime.value = BEAT * 0.75; fb.gain.value = 0.36; send.gain.value = echo;
    master.connect(send).connect(d); d.connect(lp); fb.connect(d); d.connect(oc.destination);
    head = master;
  }
  for (const e of events) {
    const fn = VOICE[e.voice];
    if (!fn) continue;
    let dest = head;
    if (e.pan) { const p = oc.createStereoPanner ? oc.createStereoPanner() : null; if (p) { p.pan.value = Math.max(-1, Math.min(1, e.pan)); p.connect(head); dest = p; } }
    fn(oc, dest, e, noise);
  }
}

function toBuffer(rendered, frames, foldFrom) {
  const out = new AudioBuffer({ length: frames, numberOfChannels: rendered.numberOfChannels, sampleRate: rendered.sampleRate });
  let peak = 1e-6;
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    const src = rendered.getChannelData(c), dst = out.getChannelData(c);
    dst.set(src.subarray(0, frames));
    if (foldFrom) for (let i = 0; i < src.length - foldFrom && i < frames; i++) dst[i] += src[foldFrom + i];   // wrap the echo tail onto the start: seamless loop
    for (let i = 0; i < frames; i++) { const a = Math.abs(dst[i]); if (a > peak) peak = a; }
  }
  const k = 0.85 / peak;
  for (let c = 0; c < out.numberOfChannels; c++) { const d = out.getChannelData(c); for (let i = 0; i < frames; i++) d[i] *= k; }
  return out;
}

/** Render one 20 s loop stem. Resolves an AudioBuffer (stereo, 22.05 kHz), or null when the events are unknown / offline rendering is unavailable. */
export async function renderStem(key) {
  const OC = OAC(), events = stemEvents(key);
  if (!OC || !events) return null;
  const frames = Math.round(LOOP * SR), total = Math.round((LOOP + TAIL) * SR);
  const oc = new OC(2, total, SR);
  build(oc, events, { echo: STEM_META[key]?.echo || 0 });
  const rendered = await oc.startRendering();
  return toBuffer(rendered, frames, frames);
}

/** Render a motif variant one-shot (mono -> stereo copy), with the glitch post-processing applied in JS. */
export async function renderMotif(id) {
  const OC = OAC(), me = motifEvents(id);
  if (!OC || !me) return null;
  const v = me.v, n = Math.ceil((me.dur + 0.4) * SR_STING);
  const oc = new OC(1, n, SR_STING);
  const ev = me.events.slice();
  if (v.sweep) ev.push({ voice: 'swell', t: 0, dur: 0.5, vel: 0.35, f0: 500, f1: 6000 });
  build(oc, ev, { radio: !!v.radio });
  const rendered = await oc.startRendering();
  let d = new Float32Array(rendered.getChannelData(0));
  if (v.stutter) {
    const lastT = Math.max(...me.events.filter((e) => e.n === 4).map((e) => e.t));
    d = stutter(d, SR_STING, lastT + 0.05, 0.07, 3);
    for (const [at, len] of [[0.31, 0.03], [0.62, 0.04]]) d.fill(0, Math.floor(at * SR_STING), Math.floor((at + len) * SR_STING));   // dropouts
  }
  if (v.crush) bitcrush(d, v.crush.bits, v.crush.div);
  let peak = 1e-6; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = 0.8 / peak; for (let i = 0; i < d.length; i++) d[i] *= k;
  const out = new AudioBuffer({ length: d.length, numberOfChannels: 2, sampleRate: SR_STING });
  out.copyToChannel(d, 0); out.copyToChannel(d, 1);
  return out;
}
