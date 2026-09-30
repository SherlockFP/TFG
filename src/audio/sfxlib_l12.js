// Wave 12 sounds for the two new labyrinth interiors (docs/wave12/labyr12.md). Installed from sfxlib.js with its private `def` / category setter.
//   ambience_darkweb  24 s loop: a sub drone that breathes, cold vent air, tiny relay ticks and far-off "packets" (soft high blips)
//   ambience_hotel    30 s loop: a ballroom waltz heard through three walls (detuned e-piano, slow 3/4), room tone, the elevator motor far away
//   dw_ping           the sonar knock: a falling sine chirp + a tick, with a long dark tail (the echo pulse of the Dark Web)
//   hz_chime          the elevator door-warning chime (two soft notes, repeated by the runtime)
import * as D from './dsp.js';

const TAU = D.TAU;
export const L12_IDS = ['ambience_darkweb', 'ambience_hotel', 'dw_ping', 'hz_chime'];
const hz = (n) => 440 * Math.pow(2, (D.noteToMidi(n) - 69) / 12);

export function installL12(def, H, setCat) {
  setCat('facility');

  def('ambience_darkweb', { dur: 24, loop: true, vol: 0.5, warm: 2, xf: 0.4 }, (c) => {
    const r = c.rng, sr = c.sr, mix = c.buf();
    const sub = c.osc('sine', 38), am = c.wob([0.083, 0.31], [1, 0.4]);
    for (let i = 0; i < sub.length; i++) sub[i] *= 0.55 + 0.45 * am[i];
    D.add(mix, sub, 0.5);
    const hum2 = c.osc('sine', 57); D.add(mix, hum2, 0.12);
    const pn = c.noise('pink'), air = D.svf(pn, sr, 'bp', 380, 0.7), lf = c.wob([0.11, 0.37], [1, 0.5]);
    for (let i = 0; i < air.length; i++) air[i] *= 0.4 + 0.6 * Math.max(0, lf[i]);
    D.add(mix, air, 0.12);
    for (let k = 0; k < 40; k++) {                                              // relay ticks
      const n = c.S(0.03), t = r() * 23.6, tick = D.svf(c.noise('white').subarray(0, n), sr, 'hp', 2400 + r() * 2000); D.mul(tick, D.perc(n, sr, 0.001, 0.02));
      c.place(mix, tick, t, 0.05 + r() * 0.06);
    }
    for (let k = 0; k < 9; k++) {                                               // far packets: short soft blips
      const n = c.S(0.4), f = hz(['E5', 'B5', 'F#5', 'A5', 'D6'][(r() * 5) | 0]), b = D.osc(n, sr, 'sine', f); D.mul(b, D.perc(n, sr, 0.004, 0.25));
      c.place(mix, D.reverb(b, sr, { room: 0.8, wet: 0.6, dry: 0.3, damp: 0.6, size: 1.2, down: 2 }), r() * 22, 0.035);
    }
    return mix;
  });

  def('ambience_hotel', { dur: 30, loop: true, vol: 0.5, warm: 2, xf: 0.4 }, (c) => {
    const r = c.rng, sr = c.sr, mix = c.buf(), beat = 0.55;
    const pn = c.noise('pink');
    D.add(mix, D.svf(D.clone(pn), sr, 'lp', 220), 0.4);                          // room tone
    const mot = c.osc('sine', 47), mw = c.wob([0.2], [1]); for (let i = 0; i < mot.length; i++) mot[i] *= 0.5 + 0.5 * mw[i]; D.add(mix, mot, 0.12);   // the elevator motor, far away
    // a waltz in A minor through the walls: 3/4, one bar = 3 beats, 18 bars = 29.7 s
    const MEL = 'E5 . C5 D5 . B4 C5 . A4 B4 . G#4 A4 . C5 E5 . A5 G5 . E5 F5 . D5 E5 . C5 D5 . B4 C5 . A4 A4 . .'.split(' ');
    const mus = c.buf();
    MEL.forEach((nn, i) => {
      const t = i * beat, bar = (i / 3) | 0;
      if (i % 3 === 0) {                                                       // oom: a slow bass note
        const n = c.S(0.9), b = D.osc(n, sr, 'sine', hz(bar % 2 ? 'E2' : 'A2') * D.cents((r() - 0.5) * 20)); D.mul(b, D.perc(n, sr, 0.006, 0.5)); c.place(mus, b, t, 0.35);
      } else {                                                                 // pah pah: a soft chord
        for (const ch of ['C4', 'E4', 'A3']) { const n = c.S(0.4), s = D.osc(n, sr, 'sine', hz(ch) * D.cents((r() - 0.5) * 30)); D.mul(s, D.perc(n, sr, 0.008, 0.2)); c.place(mus, s, t, 0.07); }
      }
      if (nn !== '.') {
        const n = c.S(1.1), f = hz(nn) * D.cents((r() - 0.5) * 36 + 12 * Math.sin(bar * 0.5)), tone = D.fm(n, sr, f, 1, 1.4);
        D.mul(tone, D.perc(n, sr, 0.004, 0.6)); c.place(mus, tone, t, 0.14);
      }
    });
    D.svf(mus, sr, 'hp', 180); D.svf(mus, sr, 'lp', 1500); D.svf(mus, sr, 'lp', 1500);                  // three walls of plaster
    D.add(mix, D.reverb(mus, sr, { room: 0.85, wet: 0.5, dry: 0.5, damp: 0.6, size: 1.3, down: 2 }), 0.5);
    for (let k = 0; k < 90; k++) { const n = c.S(0.02); const cr = c.noise('white').subarray(0, n); D.mul(cr, D.perc(n, sr, 0.001, 0.012)); c.place(mix, cr, r() * 29.9, 0.03 * r()); }   // vinyl crackle
    return mix;
  });

  def('dw_ping', { dur: 1.6, vol: 0.55 }, (c) => {
    const sr = c.sr, o = c.buf(), n = c.S(0.5), fa = new Float32Array(n);
    for (let k = 0; k < n; k++) fa[k] = 1500 - 700 * (k / n);                   // falling chirp
    const ch = D.osc(n, sr, 'sine', fa); D.mul(ch, D.perc(n, sr, 0.003, 0.3)); D.add(o, ch, 0.7);
    const tk = D.svf(c.noise('white').subarray(0, c.S(0.02)), sr, 'bp', 3000, 1.2); D.add(o, tk, 0.5);
    return D.reverb(o, sr, { room: 0.9, wet: 0.6, dry: 0.5, damp: 0.5, size: 1.5, down: 2 });
  });

  def('hz_chime', { dur: 1.3, vol: 0.5 }, (c) => {
    const sr = c.sr, o = c.buf();
    for (const [t, f] of [[0, 880], [0.42, 659.3]]) {
      const n = c.S(0.9), b = D.osc(n, sr, 'sine', f); D.add(b, D.osc(n, sr, 'sine', f * 2.01), 0.25); D.mul(b, D.perc(n, sr, 0.003, 0.55)); D.add(o, b, 0.55, c.S(t));
    }
    return D.reverb(o, sr, { room: 0.6, wet: 0.25, dry: 0.85, damp: 0.5, size: 0.9 });
  });
}
