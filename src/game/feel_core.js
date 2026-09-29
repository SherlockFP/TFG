// TFG wave 7 - GAME FEEL, pure rules (no three.js / DOM / game): hitstop scaling, camera-kick table, procedural sound recipes
// (melee impact + whoosh per weapon class, gun punch + indoor/outdoor tails, pickup, heartbeat) and the creature death-anim state machine.
// tools/harness/feel.test.mjs runs this in node.  Balance numbers are NOT touched: everything here is presentation.

const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------- hitstop (local visual time-scale only, never the host sim)
export const HITSTOP_MIN = 0.04, HITSTOP_MAX = 0.09;   // seconds of real time
export const HITSTOP_SCALE = 0.12;                     // local time multiplier while the stop lasts
/** seconds of hitstop for a melee hit: grows with sqrt(damage), heavy / crit / backstab add, clamped to 40-90 ms */
export function hitstopSec(dmg, { heavy = false, crit = false, backstab = false } = {}) {
  let ms = 40 + Math.sqrt(Math.max(0, Number(dmg) || 0)) * 4.5;
  if (heavy) ms *= 1.15;
  if (crit) ms *= 1.2;
  if (backstab) ms += 6;
  return clamp(ms, HITSTOP_MIN * 1000, HITSTOP_MAX * 1000) / 1000;
}
/** the time scale the visual side runs at: 1 normally, HITSTOP_SCALE while hitstopT is running */
export const hitstopTimeScale = (hitstopT) => (hitstopT > 0 ? HITSTOP_SCALE : 1);

// ---------------------------------------------------------------- camera kick per melee class (shake = trauma, pitch/roll radians)
export const MELEE_CLASSES = ['club', 'sword', 'dagger', 'axe', 'great', 'hammer', 'spear'];
export const KICK = {
  dagger: { shake: 0.05, pitch: 0.006, roll: 0.004 },
  sword: { shake: 0.08, pitch: 0.010, roll: 0.008 },
  spear: { shake: 0.07, pitch: 0.012, roll: 0.003 },
  club: { shake: 0.10, pitch: 0.014, roll: 0.006 },
  axe: { shake: 0.13, pitch: 0.016, roll: 0.008 },
  great: { shake: 0.17, pitch: 0.020, roll: 0.010 },
  hammer: { shake: 0.22, pitch: 0.026, roll: 0.008 },
};
export function meleeKick(cls, { heavy = false, crit = false, metal = false } = {}) {
  const k = KICK[cls] || KICK.club, m = (heavy ? 1.5 : 1) * (crit ? 1.25 : 1) * (metal ? 0.85 : 1);
  return { shake: k.shake * m, pitch: k.pitch * m, roll: k.roll * m };
}

// ---------------------------------------------------------------- gun classes
export const GUN_CLASSES = ['pistol', 'auto', 'rifle', 'energy', 'bolt', 'flare', 'launcher'];
/** fire sound name -> gun class (every fireSnd in weapons.js / combat_weapons.js / worlds2_weapons.js must be listed: the test greps them) */
export const GUN_SOUNDS = {
  wv1_pistol: 'pistol', wv1_nail: 'auto', cb_smg: 'auto', cb_rifle: 'rifle', w2_blaster: 'energy',
  wv1_bolt: 'bolt', wv1_flare: 'flare', cb_rocket: 'launcher', cb_gl: 'launcher',
};
/** per gun class: casing ejection, smoke puff, tail size (s/m/l), flash size + colour */
export const GUN_FX = {
  pistol: { casing: true, smoke: 0.8, tail: 'm', flash: 0.55, color: 0xffd58a, kick: 1 },
  auto: { casing: true, smoke: 0.4, tail: 's', flash: 0.4, color: 0xffd58a, kick: 0.5 },
  rifle: { casing: true, smoke: 1.2, tail: 'l', flash: 0.8, color: 0xffe0a0, kick: 1.5 },
  energy: { casing: false, smoke: 0, tail: 'm', flash: 0.6, color: 0xff6a5a, kick: 0.8 },
  bolt: { casing: false, smoke: 0, tail: 's', flash: 0, color: 0xffffff, kick: 0.6 },
  flare: { casing: false, smoke: 1.4, tail: 'm', flash: 0.7, color: 0xff9a4a, kick: 0.8 },
  launcher: { casing: false, smoke: 2.2, tail: 'l', flash: 1.2, color: 0xffb060, kick: 2 },
};
export const gunClassOf = (soundName) => GUN_SOUNDS[soundName] || null;

// ---------------------------------------------------------------- procedural sound recipes
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s / 4294967296) * 2 - 1; }; }
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
const ex = (t, k) => Math.exp(-t * k);
const sn = (f, t) => Math.sin(TAU * f * t);
/** render a mono buffer: fn(t, nz, st) per sample, then peak-normalise to 0.9 with a short fade-out */
function synth(sr, dur, seed, fn) {
  const n = Math.max(1, Math.floor(sr * dur)), b = new Float32Array(n), nz = rng(seed), st = { a: 0, b: 0, c: 0 };
  let peak = 1e-6;
  for (let i = 0; i < n; i++) { const v = fn(i / sr, nz, st); b[i] = v; const a = Math.abs(v); if (a > peak) peak = a; }
  const k = 0.9 / peak, fade = Math.min(n, Math.floor(sr * 0.008));
  for (let i = 0; i < n; i++) { b[i] *= k; if (i > n - fade) b[i] *= (n - i) / fade; }
  return b;
}
const lp = (st, key, x, a) => (st[key] += (x - st[key]) * a);

/** melee class flavour: f = body thump Hz, len = tail s, snap = blade/edge click, ring = metal ring */
export const IMPACT_CLASS = {
  dagger: { f: 210, len: 0.16, snap: 1.0, ring: 0.9 }, sword: { f: 170, len: 0.22, snap: 0.8, ring: 1.0 },
  spear: { f: 190, len: 0.18, snap: 0.9, ring: 0.5 }, club: { f: 110, len: 0.24, snap: 0.4, ring: 0.3 },
  axe: { f: 120, len: 0.26, snap: 0.7, ring: 0.6 }, great: { f: 90, len: 0.32, snap: 0.6, ring: 0.8 },
  hammer: { f: 65, len: 0.38, snap: 0.3, ring: 0.5 },
};
export const SURFACES = ['flesh', 'metal', 'wall'];
export const impactName = (cls, surf) => `fl_hit_${cls}_${surf}`;
export const swingName = (cls) => `fl_swing_${cls}`;

function impact(sr, cls, surf) {
  const p = IMPACT_CLASS[cls], dur = surf === 'metal' ? p.len + 0.45 * p.ring + 0.15 : p.len + 0.06;
  return synth(sr, dur, hash(impactName(cls, surf)), (t, nz, st) => {
    const body = sn(p.f * (0.55 + 0.45 * ex(t, 40)), t) * ex(t, 9 / p.len * 0.5);
    if (surf === 'flesh') {
      const wet = lp(st, 'a', nz(), 0.22) * ex(t, 24 / p.len * 0.6);
      const edge = t < 0.012 ? nz() * p.snap * 0.7 : 0;
      return body * 1.1 + wet * 0.9 + edge;
    }
    if (surf === 'metal') {
      let ring = 0;
      for (const [m, g] of [[4.1, 1], [6.3, 0.7], [9.7, 0.5], [13.4, 0.3]]) ring += sn(p.f * m * 1.7, t) * g * ex(t, 5 + m * 0.6 / p.ring);
      return body * 0.5 + ring * (0.4 + 0.5 * p.ring) + (t < 0.006 ? nz() * 0.9 : 0);
    }
    const grit = (nz() > 0.94 ? nz() : 0) * ex(t, 18) * 0.7;
    return body * 0.9 + sn(p.f * 3.2, t) * ex(t, 22) * 0.35 + lp(st, 'a', nz(), 0.5) * ex(t, 40) * 0.6 + grit;
  });
}
/** swing whoosh: band-passed noise that sweeps up then down; heavy classes add a low body */
export const WHOOSH_CLASS = {
  dagger: { len: 0.16, lo: 0.25, hi: 0.85, sub: 0 }, spear: { len: 0.2, lo: 0.2, hi: 0.7, sub: 0 }, sword: { len: 0.24, lo: 0.16, hi: 0.6, sub: 0 },
  club: { len: 0.26, lo: 0.1, hi: 0.4, sub: 0.15 }, axe: { len: 0.3, lo: 0.08, hi: 0.35, sub: 0.3 },
  great: { len: 0.4, lo: 0.06, hi: 0.3, sub: 0.45 }, hammer: { len: 0.45, lo: 0.04, hi: 0.22, sub: 0.7 },
};
function whoosh(sr, cls) {
  const p = WHOOSH_CLASS[cls];
  return synth(sr, p.len, hash(swingName(cls)), (t, nz, st) => {
    const u = t / p.len, bell = Math.sin(Math.PI * u), a = p.lo + (p.hi - p.lo) * bell;
    return lp(st, 'a', nz(), a) * Math.pow(bell, 1.4) + sn(60 - 25 * u, t) * bell * p.sub * 0.5;
  });
}
/** gun punch layer: mixed over the stock fire sound so each class reads differently */
function shot(sr, cls) {
  const R = {
    pistol: [0.28, (t, nz, st) => (t < 0.005 ? nz() : 0) * 1.1 + lp(st, 'a', nz(), 0.35) * ex(t, 45) + sn(75 + 130 * ex(t, 26), t) * ex(t, 15)],
    auto: [0.12, (t, nz, st) => lp(st, 'a', nz(), 0.5) * ex(t, 80) * 1.1 + sn(140, t) * ex(t, 45) * 0.7],
    rifle: [0.45, (t, nz, st) => (t < 0.008 ? nz() : 0) * 1.2 + lp(st, 'a', nz(), 0.25) * ex(t, 30) * 1.1 + sn(48 + 90 * ex(t, 18), t) * ex(t, 8)],
    energy: [0.3, (t) => sn(1900 * ex(t, 9) + 260, t + 0.1 * Math.sin(TAU * 40 * t)) * ex(t, 12) + sn(90, t) * ex(t, 20) * 0.5],
    bolt: [0.35, (t, nz, st) => sn(310, t) * ex(t, 13) * 0.8 + sn(620, t) * ex(t, 22) * 0.4 + (t < 0.02 ? lp(st, 'a', nz(), 0.3) * 0.7 : 0)],
    flare: [0.32, (t, nz, st) => sn(95 * (1 + 0.6 * ex(t, 30)), t) * ex(t, 14) + lp(st, 'a', nz(), 0.2) * (ex(t, 9) * 0.5 + (t < 0.01 ? 0.6 : 0))],
    launcher: [0.6, (t, nz, st) => sn(42 + 60 * ex(t, 14), t) * ex(t, 5) * 1.2 + lp(st, 'a', nz(), 0.12) * ex(t, 6) * 0.8 + (t < 0.01 ? nz() : 0)],
  }[cls];
  return synth(sr, R[0], hash('fl_shot_' + cls), R[1]);
}
export const shotName = (cls) => `fl_shot_${cls}`;
export const TAIL_SIZES = ['s', 'm', 'l'];
export const tailName = (indoor, size) => `fl_tail_${indoor ? 'in' : 'out'}_${size}`;
/** indoor: dense slap-back echoes off walls; outdoor: thin low rumble + one distant late echo */
function tail(sr, indoor, size) {
  const k = { s: 0.7, m: 1, l: 1.4 }[size], dur = (indoor ? 0.45 : 0.75) * k;
  const taps = indoor ? [[0.03, 0.7], [0.07, 0.55], [0.13, 0.4], [0.22, 0.25]] : [[0.12, 0.3], [0.38, 0.2]];
  return synth(sr, dur, hash(tailName(indoor, size)), (t, nz, st) => {
    let v = 0;
    for (const [d, g] of taps) { const tt = t - d * k; if (tt > 0) v += nz() * g * ex(tt, indoor ? 12 / k : 7 / k); }
    v = lp(st, 'a', v, indoor ? 0.35 : 0.12);
    return v + (indoor ? 0 : sn(55, t) * ex(t, 5) * 0.3 * (t > 0.05 ? 1 : t / 0.05));
  });
}
/** misc feedback sounds */
const MISC = {
  fl_thunk: [0.14, (t, nz, st) => sn(135 - 60 * t / 0.14, t) * ex(t, 28) + lp(st, 'a', nz(), 0.3) * ex(t, 60) * 0.5],
  fl_tick: [0.05, (t) => sn(2600, t) * ex(t, 120) * 0.8 + sn(1300, t) * ex(t, 90) * 0.4],
  fl_heart: [0.55, (t) => sn(55, t) * ex(t, 22) + (t > 0.17 ? sn(46, t - 0.17) * ex(t - 0.17, 26) * 0.75 : 0)],
  fl_body: [0.4, (t, nz, st) => sn(72 - 30 * t / 0.4, t) * ex(t, 12) + lp(st, 'a', nz(), 0.18) * ex(t, 30) * 0.9],
};

/** every recipe: name -> (sr) => Float32Array. Registered into mods.soundGens by feel.js. */
export function buildRecipes() {
  const R = {};
  for (const c of MELEE_CLASSES) {
    R[swingName(c)] = (sr) => whoosh(sr, c);
    for (const s of SURFACES) R[impactName(c, s)] = (sr) => impact(sr, c, s);
  }
  for (const c of GUN_CLASSES) R[shotName(c)] = (sr) => shot(sr, c);
  for (const s of TAIL_SIZES) for (const i of [true, false]) R[tailName(i, s)] = (sr) => tail(sr, i, s);
  for (const [n, [d, fn]] of Object.entries(MISC)) R[n] = (sr) => synth(sr, d, hash(n), fn);
  return R;
}

// ---------------------------------------------------------------- creature death animation (ragdoll-lite)
// phases: alive -> fall (topple, accelerating) -> bounce (small rebound + hop) -> rest -> dissolve (sink + shrink) -> gone
export const DEATH = { fall: 0.55, bounce: 0.35, dissolveAt: 8, dissolveDur: 2.5, target: 1.45 };
export const DEATH_PHASES = ['fall', 'bounce', 'rest', 'dissolve', 'gone'];
export function deathPhase(t, size = 1) {
  const f = DEATH.fall * clamp(Math.sqrt(size), 0.7, 1.6);
  if (t < f) return 'fall';
  if (t < f + DEATH.bounce) return 'bounce';
  if (t < DEATH.dissolveAt) return 'rest';
  if (t < DEATH.dissolveAt + DEATH.dissolveDur) return 'dissolve';
  return 'gone';
}
/** pose for a corpse t seconds after death. seed picks the topple direction (back / forward / left / right). Pure and deterministic. */
export function deathPose(t, seed = 0, size = 1) {
  const f = DEATH.fall * clamp(Math.sqrt(size), 0.7, 1.6), phase = deathPhase(t, size), tg = DEATH.target;
  const mode = (Math.abs(seed | 0) % 4), px = [-1, 1, 0, 0][mode], rz = [0, 0, 1, -1][mode];
  let amt = tg, hop = 0, scale = 1, sink = 0;
  if (phase === 'fall') { const u = t / f; amt = tg * u * u; }
  else if (phase === 'bounce') { const b = (t - f) / DEATH.bounce; amt = tg - tg * 0.1 * Math.sin(Math.PI * b) * (1 - b); hop = 0.07 * Math.min(size, 2) * Math.sin(Math.PI * b) * (1 - b); }
  else if (phase === 'dissolve' || phase === 'gone') {
    const u = clamp((t - DEATH.dissolveAt) / DEATH.dissolveDur, 0, 1);
    scale = 1 - u * u; sink = 0.35 * size * u;
  }
  return { phase, pitch: amt * px, roll: amt * rz, hop, sink, scale: Math.max(0.001, scale), done: phase === 'gone' };
}
/** creature types the topple must never touch (fixtures, bosses that own their death, ceiling / door props) */
export const NO_TOPPLE = new Set(['turret', 'mine', 'web', 'mimicdoor', 'sandkefal', 'giant', 'leech']);

// ---------------------------------------------------------------- low-HP heartbeat
/** level 0..1 below `from` fraction of max HP; 0 when healthy or dead */
export const lowHpLevel = (hp, maxHp, from = 0.35) => (maxHp > 0 && hp > 0 ? clamp((from - hp / maxHp) / from, 0, 1) : 0);
/** seconds between beats: 0.95 s at the threshold, 0.5 s near death */
export const beatInterval = (level) => 0.95 - 0.45 * clamp(level, 0, 1);
