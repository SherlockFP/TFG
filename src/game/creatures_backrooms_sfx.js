// Procedural sounds for the Backrooms entities (module 'brcreatures'). Pure JS, no samples: each generator
// returns a mono Float32Array at the given sample rate (same format as KefalAPI.registerSound).
//   br_giggle          Smiler: breathy, too-happy "hee-hee-hee" from the dark
//   br_smiler_hiss     Smiler caught in a flashlight: a ragged hiss that falls away
//   br_smiler_shriek   Smiler bite: a shrill, tearing screech
//   br_skitter         Pale Hound crawling: nails on damp carpet (loop)
//   br_skitter_fast    Pale Hound hunting (loop)
//   br_sniff           Pale Hound listening: wet sniffs
//   br_hound_shriek    Pale Hound locks on to a sound
//   br_partyhorn       Partygoer waving: a party blower
//   br_partyhorn_long  Partygoer hug: a long blower that sags out of tune
//   br_balloon_squeak  Partygoer knocked back: rubber squeak
//   br_pop             Partygoer dies: the balloon pops
//   br_moths           Moth Swarm: wing flutter (loop)
const TAU = Math.PI * 2;

function mkNoise(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2147483648 - 1; }; }
/** two-pole resonator (band pass-ish), returns a stateful filter fn(x, f?) */
function reson(sr, f0, q = 8) {
  let y1 = 0, y2 = 0;
  return (x, f = f0) => {
    const w = (TAU * f) / sr, r = Math.exp(-Math.PI * (f / q) / sr);
    const y = (1 - r) * x + 2 * r * Math.cos(w) * y1 - r * r * y2;
    y2 = y1; y1 = y;
    return y;
  };
}
/** render(sr, dur, seed, fn(t, st)) -> normalised Float32Array with short edge fades */
function render(sr, dur, seed, fn, fadeMs = 6) {
  const n = Math.max(1, Math.floor(dur * sr));
  const out = new Float32Array(n);
  const st = { ph: 0, ph2: 0, lp: 0, lp2: 0, rnd: mkNoise(seed), dt: 1 / sr, sr };
  let peak = 1e-6;
  for (let i = 0; i < n; i++) { const v = fn(i / sr, st); out[i] = v; if (Math.abs(v) > peak) peak = Math.abs(v); }
  const g = 0.9 / peak, fade = Math.max(1, Math.floor(sr * fadeMs / 1000));
  for (let i = 0; i < n; i++) out[i] *= g * Math.min(1, i / fade, (n - 1 - i) / fade);
  return out;
}
const soft = (x) => Math.tanh(x);

export const BR_SOUNDS = {
  br_giggle: (sr) => {
    const f1 = reson(sr, 700, 6), f2 = reson(sr, 2300, 9), br = reson(sr, 3200, 3);
    const pulses = [[0, 0.1, 1], [0.16, 0.09, 0.95], [0.3, 0.09, 0.9], [0.43, 0.1, 0.8], [0.6, 0.16, 0.65]];
    return render(sr, 1.0, 301, (t, s) => {
      let env = 0, k = 0;
      for (const [t0, len, a] of pulses) { const u = (t - t0) / len; if (u > 0 && u < 1) { env = Math.sin(Math.PI * u) ** 0.7 * a; k = t0; } }
      const f = 470 - k * 120 + 25 * Math.sin(TAU * 7 * t);
      s.ph += f * s.dt;
      const saw = (s.ph % 1) * 2 - 1;
      const n = s.rnd();
      const voice = f1(saw) * 1.2 + f2(saw) * 0.8;
      return soft((voice * env * 2.2 + br(n) * (env * 0.9 + 0.05)) * 1.6);
    });
  },
  br_smiler_hiss: (sr) => {
    const hp = reson(sr, 5200, 1.4), mid = reson(sr, 1400, 4);
    return render(sr, 0.9, 302, (t, s) => {
      const env = Math.min(1, t / 0.03) * Math.exp(-t * 3.2);
      const n = s.rnd();
      s.ph += (260 - 160 * t) * s.dt;
      const rasp = Math.sin(TAU * s.ph) > 0.2 ? 1 : 0.4;
      return (hp(n) * 1.6 + mid(n) * 0.7 * rasp) * env;
    });
  },
  br_smiler_shriek: (sr) => {
    const f1 = reson(sr, 1800, 5), f2 = reson(sr, 3100, 7);
    return render(sr, 0.7, 303, (t, s) => {
      const env = Math.min(1, t / 0.015) * Math.exp(-t * 3);
      const f = 1350 - 600 * t + 90 * Math.sin(TAU * 31 * t);
      s.ph += f * s.dt; s.ph2 += f * 1.49 * s.dt;
      const src = ((s.ph % 1) * 2 - 1) + 0.6 * Math.sin(TAU * s.ph2);
      return soft((f1(src) * 1.4 + f2(src) + s.rnd() * 0.35) * env * 3);
    });
  },
  br_skitter: (sr) => skitter(sr, 2.0, 304, 13, 0.7),
  br_skitter_fast: (sr) => skitter(sr, 1.5, 305, 27, 1),
  br_sniff: (sr) => {
    const bp = reson(sr, 2100, 2.5), lo = reson(sr, 420, 3);
    const sn = [[0.05, 0.12], [0.22, 0.1], [0.37, 0.14]];
    return render(sr, 1.3, 306, (t, s) => {
      let e = 0;
      for (const [t0, len] of sn) { const u = (t - t0) / len; if (u > 0 && u < 1) e = Math.max(e, Math.sin(Math.PI * u) ** 1.5); }
      const ex = t > 0.62 && t < 1.2 ? Math.sin(Math.PI * (t - 0.62) / 0.58) * 0.45 : 0;
      const n = s.rnd();
      return bp(n) * e * 1.8 + lo(n) * ex * 1.4 + bp(n) * ex * 0.25;
    });
  },
  br_hound_shriek: (sr) => {
    const f1 = reson(sr, 800, 5), f2 = reson(sr, 1250, 6), f3 = reson(sr, 2600, 8);
    return render(sr, 1.05, 307, (t, s) => {
      const env = Math.min(1, t / 0.05) * (t < 0.55 ? 1 : Math.exp(-(t - 0.55) * 6));
      const f = 290 + 260 * Math.min(1, t / 0.25) - 90 * Math.max(0, t - 0.5) + 30 * s.rnd();
      s.ph += f * s.dt;
      const saw = (s.ph % 1) * 2 - 1;
      const src = saw + s.rnd() * 0.9;
      return soft((f1(src) + f2(src) * 0.9 + f3(src) * 0.6) * env * 2.4);
    });
  },
  br_partyhorn: (sr) => partyHorn(sr, 0.9, 308, false),
  br_partyhorn_long: (sr) => partyHorn(sr, 1.8, 309, true),
  br_balloon_squeak: (sr) => render(sr, 0.45, 310, (t, s) => {
    const env = Math.sin(Math.PI * Math.min(1, t / 0.45)) ** 0.6;
    const f = 780 + 380 * Math.sin(TAU * 3 * t) + 60 * Math.sin(TAU * 37 * t);
    s.ph += f * s.dt;
    return (Math.sin(TAU * s.ph) + 0.35 * Math.sin(TAU * 2 * s.ph) + s.rnd() * 0.08) * env;
  }),
  br_pop: (sr) => {
    const lo = reson(sr, 260, 2);
    return render(sr, 0.3, 311, (t, s) => {
      const n = s.rnd();
      return n * Math.exp(-t * 60) * 1.4 + lo(n) * Math.exp(-t * 18) * 3 + Math.sin(TAU * 90 * t) * Math.exp(-t * 25) * 0.5;
    }, 2);
  },
  br_moths: (sr) => {
    const bp = reson(sr, 650, 1.8), hi = reson(sr, 2400, 2);
    const moths = [];
    const r = mkNoise(312);
    for (let i = 0; i < 9; i++) moths.push({ f: 18 + (r() + 1) * 7, p: (r() + 1) * Math.PI, a: 0.4 + (r() + 1) * 0.3, m: 0.4 + (r() + 1) * 0.6 });
    const dur = 2.0;
    return render(sr, dur, 313, (t, s) => {
      let e = 0;
      for (const m of moths) {
        const f = Math.round(m.f * dur) / dur;                 // whole cycles per loop: seamless
        const g = Math.round(m.m * dur) / dur || 1 / dur;
        e += m.a * Math.max(0, Math.sin(TAU * f * t + m.p)) ** 3 * (0.6 + 0.4 * Math.sin(TAU * g * t + m.p * 2));
      }
      const n = s.rnd();
      return (bp(n) * 1.4 + hi(n) * 0.3) * e * 0.5;
    }, 12);
  },
};

function skitter(sr, dur, seed, rate, loud) {
  const bp = reson(sr, 3600, 2.2), knock = reson(sr, 900, 5), scrape = reson(sr, 1600, 1.5);
  const r = mkNoise(seed);
  const hits = [];
  const n = Math.round(rate * dur);
  for (let i = 0; i < n; i++) hits.push({ t: ((i + 0.5 + r() * 0.45) / n) * dur, a: 0.45 + (r() + 1) * 0.3, k: r() > 0.55 });
  return render(sr, dur, seed, (t, s) => {
    let e = 0, kk = 0;
    for (const h of hits) { const u = t - h.t; if (u >= 0 && u < 0.03) { const v = h.a * Math.exp(-u * 260); e += v; if (h.k) kk += v; } }
    const nz = s.rnd();
    const sc = 0.05 * (0.6 + 0.4 * Math.sin(TAU * (2 / dur) * t));
    return (bp(nz) * e * 2.2 + knock(nz) * kk * 1.4 + scrape(nz) * sc) * loud;
  }, 10);
}

function partyHorn(sr, dur, seed, sag) {
  const body = reson(sr, 1100, 3), buzz = reson(sr, 2600, 4);
  return render(sr, dur, seed, (t, s) => {
    const u = t / dur;
    const env = Math.min(1, t / 0.04) * (u < 0.85 ? 1 : (1 - u) / 0.15);
    let f = 330 + 50 * Math.min(1, t / 0.12) + 7 * Math.sin(TAU * 6 * t);
    if (sag) f *= 1 - 0.32 * Math.max(0, u - 0.45) ** 1.4 + 0.04 * Math.sin(TAU * 2.3 * t);
    s.ph += f * s.dt; s.ph2 += f * 1.006 * s.dt;
    const pw = 0.3 + 0.1 * Math.sin(TAU * 3 * t);
    const sq = ((s.ph % 1) < pw ? 1 : -1) + ((s.ph2 % 1) < pw ? 0.8 : -0.8);
    const crinkle = s.rnd() * (0.12 + 0.2 * Math.max(0, Math.sin(TAU * 17 * t)));
    return soft((body(sq) * 1.3 + buzz(sq) * 0.9 + sq * 0.12 + crinkle) * env * 1.4);
  });
}

/** Renders every sound into audio.buffers (once an AudioContext exists) and registers them with the mod API. */
export function ensureBrSounds(game) {
  const api = game?.mods?.api || (typeof window !== 'undefined' ? window.KefalAPI : null);
  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  for (const [name, gen] of Object.entries(BR_SOUNDS)) {
    if (mm?.soundGens && !mm.soundGens.has(name)) { try { mm.soundGens.set(name, gen); } catch { /* ignore */ } }
    else if (!mm?.soundGens && api?.registerSound) { try { api.registerSound(name, gen); } catch { /* ignore */ } }
  }
  const audio = game?.audio;
  if (!audio?.ctx || !audio.buffers) return false;
  for (const [name, gen] of Object.entries(BR_SOUNDS)) {
    if (audio.buffers.has(name)) continue;
    try {
      const data = gen(audio.ctx.sampleRate);
      const buf = audio.ctx.createBuffer(1, data.length, audio.ctx.sampleRate);
      buf.copyToChannel(data, 0);
      audio.buffers.set(name, buf);
    } catch (e) { console.warn('br sound', name, e); audio.buffers.set(name, null); }
  }
  return true;
}
