// Wave 11 sounds for THE LOOP (docs/wave11/loop11.md). Installed from sfxlib.js with its private `def` / category setter.
//   ambience_loop11  16 s loop: fluorescent ballast hum, HVAC, a high tube whine, sparse electrical ticks (the corridor never has music)
//   loop_ok / loop_bad   the elevator ding of a right call / the buzzer of a wrong one       loop_warp   the hall resetting (a breath taken through a vent)
//   loop_win   corporate fanfare for exit 8       loop_pa   descending PA chime before an HR announcement
//   loop_step  a heel on commercial carpet (the thing behind you)     loop_tick  the wall clock     loop_gurgle  the red water cooler     loop_murmur  voices behind an office door
import * as D from './dsp.js';

const TAU = D.TAU;
export const L11_IDS = ['ambience_loop11', 'loop_ok', 'loop_bad', 'loop_warp', 'loop_win', 'loop_pa', 'loop_step', 'loop_tick', 'loop_gurgle', 'loop_murmur'];
const hz = (n) => 440 * Math.pow(2, (D.noteToMidi(n) - 69) / 12);

export function installL11(def, H, setCat) {
  setCat('facility');

  def('ambience_loop11', { dur: 16, loop: true, vol: 0.45, warm: 2, xf: 0.4 }, (c) => {
    const r = c.rng, sr = c.sr, mix = c.buf();
    const pn = c.noise('pink');
    D.add(mix, D.svf(D.clone(pn), sr, 'lp', 220), 0.34);                                      // HVAC
    D.add(mix, D.svf(pn, sr, 'bp', 900, 0.7), 0.03);
    const hum = c.osc('sine', 120); D.add(hum, c.osc('sine', 240), 0.4); D.add(hum, c.osc('sine', 360), 0.14);   // ballast
    const fl = c.wob([0.25, 1.1], [1, 0.3]); for (let i = 0; i < hum.length; i++) hum[i] *= 0.75 + 0.25 * fl[i];
    D.add(mix, hum, 0.075);
    const whine = c.osc('sine', 7040); const wm = c.wob([0.13], [1]); for (let i = 0; i < whine.length; i++) whine[i] *= 0.4 + 0.6 * Math.max(0, wm[i]);
    D.add(mix, whine, 0.006);
    for (let k = 0; k < 6; k++) {                                                             // electrical ticks
      const n = c.S(0.03), tk = D.noise(n, r, 'white'); D.svf(tk, sr, 'bp', 2600 + r() * 1400, 2); D.mul(tk, D.perc(n, sr, 0.0005, 0.02));
      c.place(mix, tk, r() * 16, 0.16);
    }
    return mix;
  });

  def('loop_ok', { dur: 1.6, vol: 0.55 }, (c) => {
    const sr = c.sr, o = c.buf();
    for (const [t, f] of [[0, 1318.5], [0.16, 1975.5]]) {
      const n = c.S(1.3), b = D.osc(n, sr, 'sine', f);
      D.add(b, D.osc(n, sr, 'sine', f * 2.76), 0.18); D.mul(b, D.perc(n, sr, 0.002, 0.8)); D.add(o, b, 0.5, c.S(t));
    }
    return D.reverb(o, sr, { room: 0.35, wet: 0.16, dry: 0.9, damp: 0.5, size: 0.8 });
  });

  def('loop_bad', { dur: 1.0, vol: 0.55 }, (c) => {
    const sr = c.sr, o = c.buf();
    for (const t of [0, 0.3]) {
      const n = c.S(0.24), a = D.osc(n, sr, 'square', 110), b = D.osc(n, sr, 'saw', 116);
      D.add(a, b, 0.7); D.svf(a, sr, 'lp', 900); D.mul(a, D.adsr(n, sr, 0.006, 0.04, 0.8, 0.05, 0.16)); D.add(o, D.shape(a, 1.8), 0.6, c.S(t));
    }
    return o;
  });

  def('loop_warp', { dur: 0.9, vol: 0.6 }, (c) => {
    const sr = c.sr, n = c.N, o = c.buf();
    const w = D.noise(n, c.rng, 'pink'), fa = new Float32Array(n);
    for (let i = 0; i < n; i++) fa[i] = 1800 * Math.pow(0.12, i / n) + 200;
    D.svf(w, sr, 'lp', 1400); D.mul(w, D.env(n, sr, [[0, 0], [0.12, 1], [0.9, 0.2], [0.9999, 0]], 'lin')); D.add(o, w, 0.6);
    const sub = new Float32Array(n); for (let i = 0; i < n; i++) sub[i] = 90 - 50 * (i / n);
    D.add(o, D.mul(D.osc(n, sr, 'sine', sub), D.perc(n, sr, 0.02, 0.5)), 0.55);
    return o;
  });

  def('loop_win', { dur: 2.6, vol: 0.55 }, (c) => {
    const sr = c.sr, o = c.buf();
    [['C5', 0], ['E5', 0.13], ['G5', 0.26], ['C6', 0.4], ['G5', 0.66], ['C6', 0.8], ['E6', 1.0]].forEach(([nn, t], i) => {
      const n = c.S(i === 6 ? 1.4 : 0.34), f = hz(nn), s = D.osc(n, sr, 'square', f), tr = D.osc(n, sr, 'tri', f * 2);
      D.add(s, tr, 0.6); D.svf(s, sr, 'lp', 3600); D.mul(s, D.adsr(n, sr, 0.004, 0.06, 0.6, i === 6 ? 0.8 : 0.1, i === 6 ? 0.5 : 0.2)); D.add(o, s, 0.28, c.S(t));
    });
    return D.reverb(o, sr, { room: 0.5, wet: 0.22, dry: 0.85, damp: 0.5, size: 1.0 });
  });

  def('loop_pa', { dur: 2.0, vol: 0.5 }, (c) => {
    const sr = c.sr, o = c.buf();
    for (const [t, f] of [[0, 659.3], [0.4, 523.3], [0.8, 392.0]]) {
      const n = c.S(1.1), b = D.osc(n, sr, 'tri', f); D.add(b, D.osc(n, sr, 'sine', f * 3), 0.12); D.mul(b, D.perc(n, sr, 0.004, 0.7)); D.add(o, b, 0.5, c.S(t));
    }
    D.svf(o, sr, 'hp', 240); D.svf(o, sr, 'lp', 3600);                                          // through the ceiling speaker
    return D.reverb(o, sr, { room: 0.65, wet: 0.3, dry: 0.8, damp: 0.5, size: 1.1 });
  });

  def('loop_step', { dur: 0.24, vol: 0.5 }, (c) => {
    const sr = c.sr, n = c.N, o = c.buf();
    const th = D.osc(n, sr, 'sine', 84); D.mul(th, D.perc(n, sr, 0.001, 0.09)); D.add(o, th, 0.7);
    const sc = D.noise(n, c.rng, 'pink'); D.svf(sc, sr, 'lp', 700); D.mul(sc, D.perc(n, sr, 0.002, 0.06)); D.add(o, sc, 0.5);
    const hl = D.noise(c.S(0.02), c.rng, 'white'); D.svf(hl, sr, 'bp', 2400, 1.6); D.mul(hl, D.perc(hl.length, sr, 0.0005, 0.012)); D.add(o, hl, 0.18);   // the heel
    return o;
  });

  def('loop_tick', { dur: 0.12, vol: 0.4 }, (c) => {
    const sr = c.sr, n = c.N, o = c.buf();
    const k = D.noise(n, c.rng, 'white'); D.svf(k, sr, 'bp', 1900, 3); D.mul(k, D.perc(n, sr, 0.0004, 0.02)); D.add(o, k, 0.8);
    const b = D.osc(n, sr, 'sine', 620); D.mul(b, D.perc(n, sr, 0.0005, 0.03)); D.add(o, b, 0.25);
    return o;
  });

  def('loop_gurgle', { dur: 1.1, vol: 0.5 }, (c) => {
    const sr = c.sr, o = c.buf(), r = c.rng;
    for (let k = 0; k < 5; k++) {
      const n = c.S(0.14), fa = new Float32Array(n), f0 = 180 + r() * 160;
      for (let i = 0; i < n; i++) fa[i] = f0 * (1 + 1.6 * (i / n));
      const b = D.osc(n, sr, 'sine', fa); D.mul(b, D.env(n, sr, [[0, 0], [0.03, 1], [0.99, 0]], 'lin')); c.place(o, b, 0.05 + k * 0.19 + r() * 0.05, 0.4);
    }
    const w = D.noise(c.N, r, 'pink'); D.svf(w, sr, 'bp', 700, 1.2); D.mul(w, D.env(c.N, sr, [[0, 0], [0.1, 0.6], [0.9, 0.5], [1.0, 0]], 'lin')); D.add(o, w, 0.16);
    return o;
  });

  def('loop_murmur', { dur: 3.4, vol: 0.4 }, (c) => {
    const sr = c.sr, n = c.N, o = c.buf(), r = c.rng;
    const base = D.noise(n, r, 'brown'); D.svf(base, sr, 'bp', 420, 1.6);
    const syl = new Float32Array(n); let ph = 0, rate = 3.4;
    for (let i = 0; i < n; i++) { if (i % 4000 === 0) rate = 2.4 + r() * 3; ph += rate / sr; syl[i] = Math.max(0, Math.sin(TAU * ph)); }
    for (let i = 0; i < n; i++) base[i] *= 0.2 + 0.8 * syl[i];
    D.add(o, base, 1.1);
    const v = new Float32Array(n); for (let i = 0; i < n; i++) v[i] = 118 + 22 * Math.sin(TAU * 0.7 * i / sr) + 9 * Math.sin(TAU * 5.1 * i / sr);
    const vo = D.osc(n, sr, 'saw', v); D.svf(vo, sr, 'lp', 560); for (let i = 0; i < n; i++) vo[i] *= 0.15 + 0.85 * syl[i];
    D.add(o, vo, 0.24);
    D.svf(o, sr, 'lp', 900);                                                                     // through the door
    D.mul(o, D.env(n, sr, [[0, 0], [0.25, 1], [3.0, 1], [3.4, 0]], 'lin'));
    return o;
  });
}
