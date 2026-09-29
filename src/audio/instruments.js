// Procedural instrument voices for the `music` module. Pure WebAudio + one pure DSP function (renderKS), reusable by anything:
//
//   const eng = createEngine(audioContext);
//   eng.note('ks',     midi, vel, { when, dest })   // acoustic guitar: Karplus-Strong string (rendered once per note, cached)
//   eng.note('ksdist', midi, vel, { when, dest })   // electric guitar: brighter string -> tanh distortion -> cabinet, + slow "feedback" sine
//   eng.note('synth',  midi, vel, { when, dest, piano })   // keytar: detuned saws through a filter sweep, or an FM electric piano
//   eng.drum(padIndex, vel, { when, dest })          // kick / snare / hats / toms / crash from oscillators + noise
//   eng.strum('ks', [midi...], vel, { when, dest, up, spread })   // staggered notes of one chord
//
// `dest` is any AudioNode (a panner chain for another player, the local bus...). Per (dest, voice) one persistent channel strip
// (EQ / distortion / cabinet) is created, so a chord shares one distortion stage like a real amp. No AudioWorklet, no ScriptProcessor.
import { midiToFreq } from '../game/songbook.js';

// ------------------------------------------------------------------ pure DSP
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Karplus-Strong plucked string with a fractional-delay all-pass (accurate pitch) and a weighted 2-tap loop lowpass.
 *   fs, freq: sample rate / fundamental (Hz)   dur: seconds of audio   t60: seconds to decay by 60 dB
 *   damp: loop lowpass weight 0.05 (bright, long) .. 0.5 (dark, short)   bright: 0..1 excitation brightness
 *   pluckPos: 0..0.5 comb position along the string (0 = none)   seed: excitation noise seed (deterministic)
 * Returns a Float32Array peak-normalised to `level`.
 */
export function renderKS({ fs, freq, dur = 2.5, t60 = 2.5, damp = 0.5, bright = 0.6, pluckPos = 0.18, seed = 1, level = 0.9 }) {
  const D = fs / freq;
  const N = Math.max(2, Math.floor(D - damp - 0.5));
  const d = D - damp - N;                        // fractional part handled by the all-pass, in [0.5, 1.5)
  const C = (1 - d) / (1 + d);
  const M = N + 1;
  const loopGain = Math.pow(10, (-3 * (1 / freq)) / t60);
  const rnd = mulberry32(seed);
  // excitation: lowpassed noise, comb-filtered by the pick position, DC removed
  const ex = new Float32Array(M);
  let lp = 0;
  const k = Math.min(0.98, 0.15 + bright * 0.83);
  for (let i = 0; i < M; i++) { lp += k * ((rnd() * 2 - 1) - lp); ex[i] = lp; }
  const pk = Math.floor(pluckPos * N);
  if (pk > 0) for (let i = M - 1; i >= pk; i--) ex[i] -= ex[i - pk];
  let mean = 0; for (let i = 0; i < M; i++) mean += ex[i]; mean /= M;
  let mx = 1e-9; for (let i = 0; i < M; i++) { ex[i] -= mean; mx = Math.max(mx, Math.abs(ex[i])); }
  for (let i = 0; i < M; i++) ex[i] /= mx;
  const len = Math.floor(fs * dur);
  const out = new Float32Array(len);
  const h = ex;                                   // circular history of the loop signal, initialised with the excitation
  let p = 0, apx = 0, apy = 0;
  const w1 = 1 - damp, w0 = damp;
  for (let n = 0; n < len; n++) {
    const oldest = h[p], newer = h[(p + 1) % M];  // s[n-N-1], s[n-N]
    const lpv = w1 * newer + w0 * oldest;
    const ap = C * lpv + apx - C * apy;
    apx = lpv; apy = ap;
    const s = loopGain * ap;
    h[p] = s; p = (p + 1) % M;
    out[n] = s;
  }
  // level + a short fade at the very end (no click on a long ring)
  let pkv = 1e-9; const win = Math.min(len, Math.floor(fs * 0.05));
  for (let n = 0; n < win; n++) pkv = Math.max(pkv, Math.abs(out[n]));
  const gain = level / pkv, fade = Math.floor(fs * 0.06);
  for (let n = 0; n < len; n++) out[n] *= gain * (n > len - fade ? (len - n) / fade : 1);
  return out;
}

/** Guitar string parameters by voice + pitch: lower notes ring longer, high notes are shorter and thinner. */
export function stringParams(voice, midi) {
  const hi = Math.max(0, Math.min(1, (midi - 40) / 48));
  if (voice === 'ksdist') return { dur: 3.4 - hi * 1.2, t60: 5.2 - hi * 2.4, damp: 0.32, bright: 0.85, pluckPos: 0.12 };
  return { dur: 2.8 - hi * 1.1, t60: 3.0 - hi * 1.6, damp: 0.5, bright: 0.55 + hi * 0.15, pluckPos: 0.2 };
}

/** tanh soft-clip transfer curve for a WaveShaperNode */
export function distortionCurve(amount = 3, n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * amount) / Math.tanh(amount); }
  return c;
}

// ------------------------------------------------------------------ engine
const MAX_LIVE = 64;

export function createEngine(ctx) {
  const cache = new Map();            // 'voice:midi' -> AudioBuffer
  const channels = new WeakMap();     // dest node -> Map(voice -> input node)
  let noiseBuf = null;
  let live = 0;
  let disposed = false;

  function ksBuffer(voice, midi) {
    const key = voice + ':' + midi;
    let b = cache.get(key);
    if (b) return b;
    const sp = stringParams(voice, midi);
    const data = renderKS({ fs: ctx.sampleRate, freq: midiToFreq(midi), seed: midi * 7919 + (voice === 'ksdist' ? 13 : 1), ...sp });
    b = ctx.createBuffer(1, data.length, ctx.sampleRate);
    b.copyToChannel(data, 0);
    if (cache.size > 120) cache.delete(cache.keys().next().value);
    cache.set(key, b);
    return b;
  }
  function noise() {
    if (noiseBuf) return noiseBuf;
    const len = Math.floor(ctx.sampleRate * 1.6), rnd = mulberry32(4242);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
    return noiseBuf;
  }
  const fq = (f) => Math.min(f, ctx.sampleRate / 2 - 100);   // [perf4] Oscillator.frequency above Nyquist (midi 124/127 x2 = 21096/25087 Hz) logged a console.warn per node
  const biquad = (type, f, q = 0.7, gain = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b; };

  /** persistent strip for (dest, voice); returns the node voices connect into */
  function channel(dest, voice) {
    let m = channels.get(dest);
    if (!m) { m = new Map(); channels.set(dest, m); }
    let inp = m.get(voice);
    if (inp) return inp;
    inp = ctx.createGain();
    if (voice === 'ks') {                                   // wooden body: low resonances, a little air taken off
      inp.connect(biquad('peaking', 105, 1.1, 5)).connect(biquad('peaking', 240, 1.4, 3)).connect(biquad('highshelf', 4200, 0.7, -3)).connect(dest);
    } else if (voice === 'ksdist') {                        // amp: gain -> tanh -> cabinet
      const pre = ctx.createGain(); pre.gain.value = 3.2;
      const ws = ctx.createWaveShaper(); ws.curve = distortionCurve(3.4); try { ws.oversample = '2x'; } catch { /* older browsers */ }
      const post = ctx.createGain(); post.gain.value = 0.42;
      inp.connect(pre).connect(biquad('highpass', 85, 0.7)).connect(ws).connect(biquad('peaking', 900, 0.9, 3)).connect(biquad('lowpass', 3600, 0.9)).connect(post).connect(dest);
    } else inp.connect(dest);
    m.set(voice, inp);
    return inp;
  }

  const done = (src, extra) => { src.onended = () => { live = Math.max(0, live - 1); try { extra?.(); } catch { /* ignore */ } }; live++; };
  const lvl = (vel) => 0.16 + 0.84 * Math.pow(Math.max(1, Math.min(127, vel)) / 127, 1.4);

  function note(voice, midi, vel = 96, o = {}) {
    if (disposed || !o.dest || live > MAX_LIVE) return;
    const when = Math.max(o.when ?? 0, ctx.currentTime);
    const ch = channel(o.dest, voice);
    const v = lvl(vel);
    if (voice === 'ks' || voice === 'ksdist') {
      const src = ctx.createBufferSource();
      src.buffer = ksBuffer(voice, midi);
      const g = ctx.createGain();
      g.gain.value = v * (voice === 'ksdist' ? 0.8 : 1) * (o.gain ?? 1);
      src.connect(g).connect(ch);
      src.start(when);
      done(src, () => g.disconnect());
      if (voice === 'ksdist' && o.feedback && vel > 60) {   // slight amp feedback: a sine an octave up that swells under the ring
        const os = ctx.createOscillator(), og = ctx.createGain();
        os.type = 'sine'; os.frequency.value = fq(midiToFreq(midi) * 2);
        og.gain.setValueAtTime(0, when);
        og.gain.linearRampToValueAtTime(0.09 * v, when + 0.9);
        og.gain.exponentialRampToValueAtTime(0.0002, when + 3);
        os.connect(og).connect(ch);
        os.start(when); os.stop(when + 3.1);
        os.onended = () => og.disconnect();
      }
      return;
    }
    // keytar
    const f = midiToFreq(midi), sus = o.sustain ? 2.4 : 1;
    const out = ctx.createGain();
    out.connect(ch);
    if (o.piano) {                                          // FM electric piano: sine + 1:1 modulator whose index decays (bell -> mellow)
      const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain();
      car.type = 'sine'; mod.type = 'sine';
      car.frequency.value = fq(f); mod.frequency.value = fq(f);
      mg.gain.setValueAtTime(f * (1.2 + 2.2 * v), when);
      mg.gain.exponentialRampToValueAtTime(f * 0.12, when + 0.5);
      mod.connect(mg).connect(car.frequency);
      out.gain.setValueAtTime(0.0001, when);
      out.gain.exponentialRampToValueAtTime(0.5 * v, when + 0.004);
      out.gain.exponentialRampToValueAtTime(0.0002, when + 2.2 * sus);
      car.connect(out);
      car.start(when); mod.start(when);
      car.stop(when + 2.3 * sus); mod.stop(when + 2.3 * sus);
      done(car, () => out.disconnect());
      return;
    }
    const lp = biquad('lowpass', Math.min(9000, f * 9), 4.5);
    lp.frequency.setValueAtTime(Math.min(9000, f * 9), when);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 2.4), when + 0.4 * sus);
    out.gain.setValueAtTime(0.0001, when);
    out.gain.exponentialRampToValueAtTime(0.34 * v, when + 0.008);
    out.gain.exponentialRampToValueAtTime(0.0002, when + 1.0 * sus);
    let first = null;
    for (const [type, mul, gain] of [['sawtooth', 1.004, 0.55], ['sawtooth', 0.996, 0.55], ['square', 0.5, 0.35]]) {
      const os = ctx.createOscillator(), og = ctx.createGain();
      os.type = type; os.frequency.value = fq(f * mul); og.gain.value = gain;
      os.connect(og).connect(lp);
      os.start(when); os.stop(when + 1.05 * sus);
      first = first || os;
    }
    lp.connect(out);
    done(first, () => { out.disconnect(); lp.disconnect(); });
  }

  function strum(voice, notes, vel = 96, o = {}) {
    const n = notes.length, spread = (o.spread ?? 0.016);
    const base = Math.max(o.when ?? 0, ctx.currentTime);
    notes.forEach((m, i) => {
      const k = o.up ? n - 1 - i : i;
      const ramp = 0.82 + 0.18 * (o.up ? (i + 1) / n : 1 - i / n);        // down-strums start heavy on the bass strings, up-strums on the trebles
      note(voice, m, Math.round(vel * ramp), { ...o, when: base + k * spread, feedback: false, gain: 1.15 / Math.sqrt(n) });   // a 6-string chord is not 6x louder than one string
    });
  }

  function drum(pad, vel = 100, o = {}) {
    if (disposed || !o.dest) return;
    const t = Math.max(o.when ?? 0, ctx.currentTime), ch = channel(o.dest, 'drums'), v = lvl(vel);
    const env = (g, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0002, t + dec); };
    const osc = (type, f0, f1, sweep, peak, dec) => {
      const os = ctx.createOscillator(), g = ctx.createGain();
      os.type = type; os.frequency.setValueAtTime(fq(f0), t); os.frequency.exponentialRampToValueAtTime(Math.max(20, fq(f1)), t + sweep);
      env(g, peak, dec); os.connect(g).connect(ch); os.start(t); os.stop(t + dec + 0.05);
      return os;
    };
    const burst = (filterType, f, q, peak, dec) => {
      const src = ctx.createBufferSource(), fl = biquad(filterType, f, q), g = ctx.createGain();
      src.buffer = noise(); env(g, peak, dec);
      src.connect(fl).connect(g).connect(ch);
      src.start(t, Math.random() * 0.5); src.stop(t + dec + 0.05);
      return src;
    };
    let last;
    switch (pad) {
      case 0: osc('sine', 150, 44, 0.11, 1.0 * v, 0.5); last = burst('lowpass', 1800, 0.7, 0.35 * v, 0.02); break;              // kick
      case 1: osc('triangle', 190, 150, 0.06, 0.55 * v, 0.13); last = burst('bandpass', 1900, 0.6, 0.9 * v, 0.2); break;         // snare
      case 2: last = burst('highpass', 7200, 0.8, 0.5 * v, 0.055); break;                                                          // closed hat
      case 3: last = burst('highpass', 6400, 0.8, 0.5 * v, 0.42); break;                                                           // open hat
      case 4: osc('sine', 330, 200, 0.16, 0.9 * v, 0.4); last = burst('bandpass', 900, 1, 0.12 * v, 0.05); break;                 // tom
      case 5: osc('sine', 250, 150, 0.18, 0.9 * v, 0.5); last = burst('bandpass', 700, 1, 0.12 * v, 0.05); break;                 // mid tom
      case 6: osc('sine', 170, 100, 0.2, 0.95 * v, 0.6); last = burst('bandpass', 500, 1, 0.12 * v, 0.06); break;                 // floor tom
      default: last = burst('highpass', 3200, 0.6, 0.6 * v, 1.7); burst('bandpass', 8200, 2.2, 0.3 * v, 1.2); break;               // crash
    }
    done(last);
  }

  return { note, strum, drum, channel, ksBuffer, get live() { return live; }, dispose() { disposed = true; cache.clear(); } };
}
