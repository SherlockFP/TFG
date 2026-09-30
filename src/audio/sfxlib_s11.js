// Wave 11 sounds for the RECYCLE BIN labyrinth (docs/wave11/shift11.md). Installed from sfxlib.js with its private `def` / category setter.
//   s11_pa     three falling chime notes through a bad ceiling speaker (before "EMPTYING RECYCLE BIN IN 10")
//   s11_tick   countdown blip (last 5 s, one per second)
//   s11_purge  the shredder: grinding noise chopped at 47 Hz, a sub drop, a digital thud (a sector is permanently deleted)
//   s11_rail   a junk tower dropping down its rails: metal drag, a squeal, a heavy landing
import * as D from './dsp.js';

const TAU = D.TAU;
export const S11_IDS = ['s11_pa', 's11_tick', 's11_purge', 's11_rail'];

export function installS11(def, H, setCat) {
  setCat('facility');

  def('s11_pa', { dur: 2.6, vol: 0.55 }, (c) => {
    const sr = c.sr, o = c.buf();
    [[0, 784], [0.42, 659.3], [0.84, 523.3]].forEach(([t, f], k) => {
      const n = c.S(1.5), b = D.osc(n, sr, 'square', f);
      D.svf(b, sr, 'lp', 2300); D.add(b, D.osc(n, sr, 'sine', f * 2.01), 0.4);
      D.mul(b, D.perc(n, sr, 0.004, 0.75 - k * 0.1)); D.add(o, b, 0.34, c.S(t));
    });
    const hiss = D.svf(c.noise('white'), sr, 'bp', 3200, 0.8); D.mul(hiss, c.env([[0, 0.05], [1.9, 0.05], [2.6, 0]])); D.add(o, hiss, 0.05);
    D.svf(o, sr, 'hp', 320);
    return D.reverb(o, sr, { room: 0.7, wet: 0.28, dry: 0.85, damp: 0.5, size: 1.1 });
  });

  def('s11_tick', { dur: 0.22, vol: 0.5 }, (c) => {
    const sr = c.sr, o = c.buf(), n = c.S(0.09), b = D.osc(n, sr, 'square', 1180);
    D.svf(b, sr, 'lp', 3000); D.mul(b, D.perc(n, sr, 0.001, 0.05)); D.add(o, b, 0.7);
    return o;
  });

  def('s11_purge', { dur: 2.6, vol: 0.85 }, (c) => {
    const sr = c.sr, mix = c.buf();
    const grind = D.svf(c.noise('white'), sr, 'bp', 900, 1.1), am = D.osc(c.N, sr, 'square', 47);
    for (let i = 0; i < grind.length; i++) grind[i] *= 0.45 + 0.55 * (am[i] > 0 ? 1 : 0.15);
    D.mul(grind, c.env([[0, 0], [0.12, 1], [1.5, 0.9], [2.0, 0.25], [2.6, 0]]));
    D.add(mix, grind, 0.55);
    const fa = c.env([[0, 190], [1.6, 60], [2.6, 34]], 'exp'), sub = D.osc(c.N, sr, 'sine', fa);
    D.mul(sub, c.env([[0, 0], [0.1, 1], [1.8, 0.8], [2.6, 0]])); D.add(mix, sub, 0.7);
    const bits = c.noise('white');   // digital confetti: sample-and-hold noise bursts
    for (let i = 0; i < bits.length; i++) bits[i] = bits[(i >> 5) << 5] * (((i / sr * 22) % 1) < 0.35 ? 1 : 0);
    D.svf(bits, sr, 'hp', 1800); D.mul(bits, c.env([[0, 0], [0.2, 0.7], [1.4, 0.4], [2.0, 0]])); D.add(mix, bits, 0.16);
    const n = c.S(0.7), th = D.osc(n, sr, 'sine', 52); D.mul(th, D.perc(n, sr, 0.003, 0.4)); D.add(mix, th, 0.9, c.S(1.75));
    return D.reverb(mix, sr, { room: 0.55, wet: 0.2, dry: 0.9, damp: 0.6, size: 1.0 });
  });

  def('s11_rail', { dur: 1.7, vol: 0.7 }, (c) => {
    const sr = c.sr, mix = c.buf();
    const drag = D.svf(c.noise('brown'), sr, 'bp', 240, 1.2), am = D.osc(c.N, sr, 'sine', 9);
    for (let i = 0; i < drag.length; i++) drag[i] *= 0.6 + 0.4 * am[i];
    D.mul(drag, c.env([[0, 0], [0.08, 1], [1.2, 0.9], [1.35, 0.1], [1.7, 0]])); D.add(mix, drag, 1.1);
    const fa = c.env([[0, 620], [1.2, 900]]), sq = D.osc(c.N, sr, 'saw', fa); D.svf(sq, sr, 'bp', 1400, 4);
    D.mul(sq, c.env([[0, 0], [0.3, 0.5], [1.2, 0.5], [1.3, 0]])); D.add(mix, sq, 0.06);
    const n = c.S(0.5), th = D.osc(n, sr, 'sine', 70); D.mul(th, D.perc(n, sr, 0.003, 0.28)); D.add(mix, th, 0.9, c.S(1.22));
    const clang = D.osc(n, sr, 'sine', 310); D.add(clang, D.osc(n, sr, 'sine', 830), 0.4); D.mul(clang, D.perc(n, sr, 0.002, 0.25)); D.add(mix, clang, 0.18, c.S(1.22));
    void TAU;
    return mix;
  });
}
