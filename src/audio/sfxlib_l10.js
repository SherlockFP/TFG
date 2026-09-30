// Wave 10 sounds for the two new labyrinth interiors (docs/wave10/labyr10.md). Installed from sfxlib.js with its private `def` / category setter.
//   ambience_deadmall  32 s loop: through-the-ceiling muzak (mistuned e-piano over a slow chord loop), HVAC room tone, fluorescent hum
//   ambience_funhouse  28.8 s loop: a warped calliope waltz that droops off-key, an oom-pah bass, the tunnel motor turning somewhere
//   mall_chime         the two-note PA chime before an announcement
//   fun_honk           double clown-horn honk (occasional distant one-shot)
import * as D from './dsp.js';

const TAU = D.TAU;
export const L10_IDS = ['ambience_deadmall', 'ambience_funhouse', 'mall_chime', 'fun_honk'];
const hz = (n) => 440 * Math.pow(2, (D.noteToMidi(n) - 69) / 12);

export function installL10(def, H, setCat) {
  setCat('facility');

  def('ambience_deadmall', { dur: 32, loop: true, vol: 0.5, warm: 2, xf: 0.4 }, (c) => {
    const r = c.rng, sr = c.sr, mix = c.buf();
    const pn = c.noise('pink');
    D.add(mix, D.svf(D.clone(pn), sr, 'lp', 240), 0.5);                       // HVAC rumble
    D.add(mix, D.svf(pn, sr, 'bp', 1100, 0.8), 0.05);                         // air through vents
    const hum = c.osc('sine', 100); D.add(hum, c.osc('sine', 200), 0.35);       // fluorescent ballast
    const fl = c.wob([0.31, 1.3], [1, 0.3]); for (let i = 0; i < hum.length; i++) hum[i] *= 0.7 + 0.3 * fl[i];
    D.add(mix, hum, 0.05);
    // muzak: four chords, 8 s each; e-piano arpeggios with a random mistuning, pads underneath
    const mus = c.buf();
    const CH = [['C3', 'G3', 'E4', 'B4', 'D5'], ['A2', 'E3', 'C4', 'G4', 'B4'], ['D3', 'A3', 'F4', 'C5', 'E5'], ['G2', 'D3', 'F4', 'B4', 'E5']];
    CH.forEach((ch, k) => {
      const t0 = k * 8;
      for (const nn of ch.slice(0, 4)) {
        const n = c.S(9.6), f = hz(nn), p = D.osc(n, sr, 'sine', f * D.cents((r() - 0.5) * 24));
        D.mul(p, D.adsr(n, sr, 1.6, 0.6, 0.6, 2.0, 6.4)); c.place(mus, p, t0, 0.035);
      }
      for (let s = 0; s < 14; s++) {
        const t = t0 + s * 0.5 + (r() < 0.15 ? 0.25 : 0), f = hz(ch[1 + ((r() * 4) | 0)]) * D.cents((r() - 0.5) * 34), n = c.S(1.6);
        const tone = D.fm(n, sr, f, 1, 1.25); D.mul(tone, D.perc(n, sr, 0.004, 0.85));
        const bell = D.osc(n, sr, 'sine', f * 4); D.mul(bell, D.perc(n, sr, 0.002, 0.12)); D.add(tone, bell, 0.22);
        c.place(mus, tone, t, 0.16);
      }
    });
    D.svf(mus, sr, 'hp', 260); D.svf(mus, sr, 'lp', 3300);                      // ceiling speaker
    D.add(mix, D.reverb(mus, sr, { room: 0.75, wet: 0.45, dry: 0.6, damp: 0.5, size: 1.2, down: 2 }), 0.42);
    return mix;
  });

  def('ambience_funhouse', { dur: 28.8, loop: true, vol: 0.5, warm: 2, xf: 0.4 }, (c) => {
    const r = c.rng, sr = c.sr, mix = c.buf(), beat = 0.6;
    const MEL = 'E5 C5 A4 B4 C5 D5 E5 E5 E5 D5 C5 B4 C5 A4 A4 G4 A4 B4 C5 C5 C5 B4 A4 G#4 E5 C5 A4 B4 C5 D5 E5 E5 E5 D5 C5 B4 A4 C5 E5 A5 G5 E5 F5 E5 D5 E5 . .'.split(' ');
    const mel = c.buf(), bass = c.buf();
    MEL.forEach((nn, i) => {
      const bar = (i / 3) | 0, t = i * beat;
      if (nn !== '.') {
        const n = c.S(0.7), f0 = hz(nn) * D.cents(25 * Math.sin(bar * 0.7) + (r() - 0.5) * 22), fa = new Float32Array(n);
        for (let k = 0; k < n; k++) fa[k] = f0 * (1 - 0.035 * k / n) * (1 + 0.005 * Math.sin(TAU * 5.5 * k / sr));   // droops and wobbles
        const tone = D.osc(n, sr, 'square', fa); D.svf(tone, sr, 'lp', 1700); D.mul(tone, D.perc(n, sr, 0.012, 0.42));
        c.place(mel, tone, t, 0.2);
      }
      if (i % 3 === 0) {                                                       // oom
        const n = c.S(0.45), b = D.osc(n, sr, 'sine', hz(bar % 4 < 2 ? 'A2' : 'E2')); D.mul(b, D.perc(n, sr, 0.005, 0.28)); c.place(bass, b, t, 0.5);
      } else {                                                                 // pah
        const n = c.S(0.3), st = D.osc(n, sr, 'square', hz('C4')); D.add(st, D.osc(n, sr, 'square', hz('E4')), 0.8); D.add(st, D.osc(n, sr, 'square', hz('A3')), 0.8);
        D.svf(st, sr, 'lp', 900); D.mul(st, D.perc(n, sr, 0.006, 0.12)); c.place(bass, st, t, 0.1);
      }
    });
    D.add(mix, D.reverb(mel, sr, { room: 0.6, wet: 0.35, dry: 0.7, damp: 0.5, size: 1.0, down: 2 }), 0.55);
    D.add(mix, bass, 0.6);
    const sub = c.osc('sine', 36), am = c.wob([0.625], [1]);                    // the spinning tunnel's motor
    for (let i = 0; i < sub.length; i++) sub[i] *= 0.6 + 0.4 * am[i];
    D.add(mix, sub, 0.25);
    const spin = D.svf(c.noise('pink'), sr, 'bp', 520, 1.4); for (let i = 0; i < spin.length; i++) spin[i] *= 0.35 + 0.65 * Math.max(0, am[i]); D.add(mix, spin, 0.09);
    return mix;
  });

  def('mall_chime', { dur: 2.2, vol: 0.55 }, (c) => {
    const sr = c.sr, o = c.buf();
    for (const [t, f] of [[0, 659.3], [0.55, 523.3]]) {
      const n = c.S(1.6), b = D.osc(n, sr, 'sine', f);
      D.add(b, D.osc(n, sr, 'sine', f * 2.76), 0.28); D.add(b, D.osc(n, sr, 'sine', f * 5.4), 0.1);
      D.mul(b, D.perc(n, sr, 0.003, 0.9)); D.add(o, b, 0.5, c.S(t));
    }
    return D.reverb(o, sr, { room: 0.7, wet: 0.3, dry: 0.8, damp: 0.5, size: 1.0 });
  });

  def('fun_honk', { dur: 0.75, vol: 0.5 }, (c) => {
    const sr = c.sr, o = c.buf();
    for (const [t, f0, f1] of [[0.02, 430, 360], [0.3, 400, 330]]) {
      const n = c.S(0.22), fa = new Float32Array(n);
      for (let k = 0; k < n; k++) fa[k] = f0 + (f1 - f0) * k / n + 6 * Math.sin(k * 0.05);
      const h = D.osc(n, sr, 'saw', fa); D.svf(h, sr, 'bp', 1100, 1.3);
      D.mul(h, D.adsr(n, sr, 0.008, 0.05, 0.8, 0.05, 0.16)); D.add(o, D.shape(h, 2.2), 0.6, c.S(t));
    }
    return o;
  });
}
