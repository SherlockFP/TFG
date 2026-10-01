// ATMOS12 core (wave 12, docs/wave12/atmos12.md): PURE plan for the interior atmosphere pass. No THREE, no DOM, deterministic (src/core/rng.js only),
// so every peer / the node test builds the same plan from (facility layout, lamp emitters, seed).
//   PROFILES[theme]      per interior theme: colour-grade tint, dust / shaft strength, decal mix, drips, vents
//   planAtmos(fac, seed) -> { theme, profile, lamps, broken, decals, drips, vents, windows, sig }
//   lampFactor(e, t)     the light pool's own flicker curve (so shafts / dust flicker in sync with the real light)
//   breath(t, per, ph)   0..1 vent breathing curve (long inhale hold, fast exhale)
import { RNG, hashString } from '../core/rng.js';

/** decal kinds = atlas tiles (atmos12_art.js draws them in this order) */
export const KINDS = ['puddle', 'stain', 'cable', 'paper', 'leaf', 'scorch', 'moss', 'frost', 'confetti', 'rubble', 'glass', 'grate', 'vent'];
export const KIND = Object.freeze(Object.fromEntries(KINDS.map((k, i) => [k, i])));
/** [minSize, maxSize, aspect (depth / width)] in metres */
export const SIZES = {
  puddle: [1.0, 2.3, 0.75], stain: [0.9, 1.9, 0.85], cable: [1.8, 3.4, 0.16], paper: [1.0, 1.7, 0.9], leaf: [1.1, 1.9, 0.9], scorch: [0.75, 1.2, 1],
  moss: [1.0, 2.1, 0.85], frost: [1.3, 2.5, 0.9], confetti: [1.2, 2.2, 0.9], rubble: [1.0, 1.9, 0.9], glass: [0.9, 1.5, 0.9], grate: [0.75, 0.75, 1], vent: [0.95, 0.95, 1],
};

// tint = post multiplier (0.85..1.15, deliberately mild so tells / warning colours stay readable); dust = mote count multiplier (1 = 150 motes);
// shaft = { k: brightness, r: radius multiplier }; decals = per-cell weights; density = decals per floor cell; drips / vents = source counts
const P = (tint, dust, shaft, density, decals, drips, vents, extra = {}) => ({ tint, dust, shaft, density, decals, drips, vents, spark: 0.5, ...extra });
export const PROFILES = {
  deadletter24: P([1.03, 1.00, 0.96], 0.75, { k: 0.85, r: 1 }, 0.10, { paper: 6, stain: 2, cable: 1 }, 0, 1, { spark: 0.1 }),
  mutedswitch24: P([0.98, 1.00, 1.03], 0.55, { k: 0.85, r: 1 }, 0.10, { cable: 5, paper: 2, glass: 1 }, 0, 2, { spark: 0.15 }),
  permissions24: P([1.04, 1.00, 0.94], 0.7, { k: 0.9, r: 1 }, 0.10, { paper: 4, stain: 2, grate: 1 }, 0, 1, { spark: 0.1 }),
  // Quiet archive motes, warm guest floors and scorched memory ceramics keep labyrinth identities distinct.
  darkweb: P([0.91, 0.93, 1.10], 0.6, { k: 0.75, r: 0.85 }, 0.14, { cable: 5, scorch: 3, glass: 2, stain: 1 }, 2, 5, { spark: 0.55 }),
  hotel: P([1.08, 1.01, 0.91], 1.2, { k: 1.1, r: 1.05 }, 0.14, { paper: 4, stain: 3, glass: 1, puddle: 1 }, 3, 2, { spark: 0.25 }),
  echoregistry: P([0.93, 1.08, 1.02], 1.1, { k: 1.05, r: 0.85 }, 0.15, { paper: 7, cable: 2, glass: 1, stain: 1 }, 1, 3, { spark: 0.2 }),
  embercache: P([1.10, 0.98, 0.87], 1.35, { k: 0.9, r: 1.05 }, 0.16, { scorch: 6, rubble: 4, cable: 2, puddle: 1 }, 4, 7, { spark: 0.8 }),
  threadarchive: P([1.04, 1.01, 0.95], 1.1, { k: 1, r: 1 }, 0.13, { paper: 6, cable: 2, stain: 1, glass: 1 }, 2, 2, { spark: 0.15 }),
  bufferfoundry: P([1.05, 0.99, 0.93], 1.0, { k: 1, r: 1 }, 0.13, { cable: 4, scorch: 2, rubble: 3, stain: 1 }, 3, 3, { spark: 0.4 }),
  factory: P([0.96, 1.0, 1.06], 0.9, { k: 1, r: 1 }, 0.16, { puddle: 3, stain: 3, cable: 4, paper: 1, scorch: 2 }, 6, 6, { spark: 0.9 }),
  mansion: P([1.09, 0.98, 0.86], 1.5, { k: 1.15, r: 1.15 }, 0.15, { leaf: 5, paper: 3, stain: 2, puddle: 1, rubble: 1 }, 3, 1),
  mineshaft: P([1.07, 0.97, 0.84], 1.6, { k: 0.8, r: 0.9 }, 0.15, { rubble: 5, puddle: 4, stain: 1, cable: 1 }, 8, 0, { spark: 0.6 }),
  office: P([1.02, 1.07, 0.9], 1.0, { k: 1, r: 1 }, 0.17, { paper: 6, stain: 2, cable: 2, glass: 1, puddle: 0.5 }, 3, 6),
  // Undelivered paper receipts in a dry, quiet depot; restrained neutral grading
  // and fewer ambient sources leave the delayed acoustic receipt legible.
  nullreception: P([1.03, 1.00, 0.96], 0.55, { k: 0.7, r: 0.85 }, 0.10, { paper: 6, stain: 2, cable: 1 }, 0, 1, { spark: 0.1 }),
  backrooms: P([1.14, 1.06, 0.72], 1.25, { k: 1.25, r: 1.3 }, 0.12, { stain: 5, puddle: 3, cable: 1 }, 3, 3, { spark: 0.3 }),
  serverfarm: P([0.86, 1.0, 1.14], 0.55, { k: 0.9, r: 0.9 }, 0.15, { cable: 8, scorch: 2, puddle: 1.5, stain: 1 }, 2, 9, { spark: 1 }),
  sewer: P([0.9, 1.06, 0.94], 0.4, { k: 0.8, r: 0.9 }, 0.2, { puddle: 6, moss: 5, grate: 3, stain: 2 }, 9, 2, { spark: 0.2 }),
  hospital: P([0.94, 1.08, 1.04], 0.9, { k: 1.2, r: 1.05 }, 0.14, { stain: 4, glass: 2, paper: 2, puddle: 1 }, 4, 6),
  influencer: P([1.1, 0.92, 1.08], 1.2, { k: 1.25, r: 1.1 }, 0.15, { confetti: 5, cable: 4, paper: 2, stain: 1 }, 2, 3, { spark: 0.7 }),
  academy: P([1.07, 1.0, 0.88], 1.5, { k: 1.3, r: 1.2 }, 0.16, { paper: 7, leaf: 2, stain: 1, rubble: 0.5 }, 2, 2),
  colddata: P([0.84, 0.99, 1.16], 1.0, { k: 1, r: 1 }, 0.16, { frost: 6, puddle: 2, cable: 3 }, 4, 8, { spark: 0.2 }),
  museum: P([1.04, 1.0, 0.9], 1.25, { k: 1.4, r: 0.85 }, 0.12, { glass: 3, paper: 2, rubble: 1, stain: 1 }, 2, 2),
  metro: P([0.85, 1.06, 1.08], 1.0, { k: 1.05, r: 1 }, 0.15, { puddle: 5, stain: 3, paper: 3, cable: 3, rubble: 1 }, 8, 4, { spark: 0.9 }),
  greenhouse: P([0.9, 1.1, 0.88], 1.7, { k: 1.4, r: 1.6 }, 0.2, { moss: 6, leaf: 6, puddle: 3 }, 5, 1, { spark: 0.1 }),
  prison: P([0.92, 0.96, 1.05], 0.9, { k: 0.9, r: 0.9 }, 0.15, { stain: 4, rubble: 3, paper: 1, puddle: 2, cable: 1 }, 5, 3),
  tower: P([1.04, 1.0, 0.97], 1.1, { k: 1.3, r: 1.1 }, 0.13, { paper: 4, glass: 2, cable: 1, stain: 1 }, 2, 4),
  deadmall: P([1.15, 1.06, 0.78], 1.3, { k: 1.5, r: 1.35 }, 0.17, { confetti: 3, glass: 4, paper: 3, stain: 3, puddle: 2, leaf: 1 }, 5, 4, { spark: 0.8 }),
  funhouse: P([1.08, 0.96, 1.1], 1.4, { k: 1.3, r: 1.15 }, 0.16, { confetti: 8, stain: 1, paper: 1 }, 3, 2, { spark: 0.8 }),
};
export const DEFAULT_PROFILE = P([1, 1, 1], 1, { k: 1, r: 1 }, 0.13, { puddle: 2, stain: 2, paper: 2, cable: 2 }, 3, 3);
export const profileOf = (id) => PROFILES[id] || DEFAULT_PROFILE;

// room-type keywords bias the decal weights (room types differ per theme: 'bathroom', 'server', 'ward' ...)
const BIAS = [
  [/bath|toilet|kitchen|pool|cistern|wash|tank|sewer|channel|water|lab|hydro/, { puddle: 3, moss: 2, grate: 1.5 }],
  [/server|rack|control|generator|core|relay|console|power/, { cable: 3, scorch: 1.5 }],
  [/office|cubicle|archive|library|study|reading|desk|class|reception|lobby|store/, { paper: 3 }],
  [/ward|surg|morgue|theat|clinic|cell/, { stain: 2.5 }],
  [/garden|courtyard|conserv|dome|grotto|atrium/, { leaf: 2, moss: 1.5 }],
];
const wet = /bath|toilet|kitchen|pool|cistern|wash|tank|sewer|channel|water|hydro|leak|boiler|pipe/;

/** the light pool's flicker curve (render/lightpool.js): 0..1 brightness factor of emitter e at pool time t (0 when disabled) */
export function lampFactor(e, t) {
  if (!e.enabled) return 0;
  if (!(e.flicker > 0)) return 1;
  const tt = t + (e.phase || 0);
  const f = Math.sin(tt * 13.1) * Math.sin(tt * 7.3 + 1.3) * Math.sin(tt * 2.1);
  return f > 1 - e.flicker * 1.4 ? 0.08 : 0.9 + 0.1 * Math.sin(tt * 40);
}
/** vent breathing: slow ramp up (inhale), short hold, faster fall (exhale); 0..1 */
export function breath(t, per, ph) {
  const x = (((t + ph) / per) % 1 + 1) % 1;
  if (x < 0.55) return Math.pow(x / 0.55, 1.6) * 0.5;      // inhale: dim, grows
  if (x < 0.68) return 0.5 + 0.5 * Math.sin(((x - 0.55) / 0.13) * Math.PI * 0.5);   // burst
  return Math.max(0, 1 - (x - 0.68) / 0.32);               // exhale tail
}
/** the exhale burst starts at this fraction of the breath period (runtime puffs / sound fire when it is crossed) */
export const BURST_AT = 0.55;

function roomIndex(L) {
  const W = L.w, H = L.h, out = new Array(W * H).fill(null);
  if (L.roomOf) { for (let i = 0; i < out.length; i++) { const r = L.roomOf[i]; if (r >= 0 && L.rooms[r]) out[i] = L.rooms[r]; } return out; }
  for (const r of L.rooms || []) for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) out[z * W + x] = r;
  return out;
}

/** Everything is derived from the layout + emitters, so two peers with the same facility get the same plan. `q` = quality density 0..1. */
export function planAtmos(fac, seed = 1, q = 1) {
  const L = fac.layout, theme = fac.interior || L.theme || 'factory', prof = profileOf(theme);
  const rng = new RNG((hashString('atmos12|' + theme) ^ ((L.seed ?? 1) >>> 0) ^ (seed >>> 0)) >>> 0);
  const C = L.cell, W = L.w, Y = L.y, corH = L.corridorH || 3.2;
  const rIdx = roomIndex(L);
  const walk = (x, z) => { try { return fac.nav?.walkableAt ? !!fac.nav.walkableAt(x, z) : true; } catch { return true; } };
  const cand = [];
  for (let i = 0; i < L.cells.length; i++) {
    if (!L.cells[i]) continue;
    const cx = i % W, cz = (i / W) | 0, wx = L.ox + cx * C, wz = L.oz + cz * C;
    if (!walk(wx + C / 2, wz + C / 2)) continue;
    const room = rIdx[i], h = L.heightOf?.[i] || room?.height || corH;
    cand.push({ i, wx, wz, h, corridor: L.cells[i] === 2, type: String(room?.type || (L.cells[i] === 2 ? 'corridor' : 'room')), room });
  }
  rng.shuffle(cand);

  // ---- ceiling lamps (shafts, dust anchors, sparks): emitters up under a ceiling
  const lamps = [];
  const em = fac.emitters || [];
  for (let k = 0; k < em.length; k++) {
    const e = em[k];
    if (!e?.pos || e.pos.y < Y + 1.9 || e.pos.y > Y + 9.5 || (e.distance ?? 9) < 6.5 || e.halo === false) continue;
    lamps.push({ k, x: e.pos.x, y: e.pos.y, z: e.pos.z });
  }
  const step = lamps.length > 150 ? Math.ceil(lamps.length / 150) : 1;
  const lampsOut = step === 1 ? lamps : lamps.filter((_, n) => n % step === 0);
  // ---- broken lamps: the flickering ones + a seeded share of the rest (sparks fall from them, a scorch mark below)
  const broken = [];
  for (const l of lampsOut) {
    const e = em[l.k];
    if ((e.flicker || 0) >= 0.25 || rng.chance(0.06 * prof.spark)) broken.push(l);
    if (broken.length >= 10) break;
  }

  // ---- ground decals
  const decals = [];
  const target = Math.min(340, Math.round(cand.length * prof.density * 1.6 * q));
  const total = (o) => { let s = 0; for (const k in o) s += o[k]; return s; };
  const pickKind = (type) => {
    const w = { ...prof.decals };
    for (const [re, b] of BIAS) if (re.test(type)) for (const k in b) if (w[k] !== undefined) w[k] *= b[k];
    let r = rng.next() * total(w);
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'stain';
  };
  const put = (k, x, z, extra) => {
    const [lo, hi, asp] = SIZES[k], w = rng.float(lo, hi);
    decals.push({ k, x, z, w, d: w * asp * rng.float(0.85, 1.15), rot: rng.float(0, Math.PI * 2), tone: rng.float(0.75, 1.05), ...extra });
  };
  for (let n = 0; n < cand.length && decals.length < target; n++) {
    const c = cand[n], k = pickKind(c.type);
    if (k === 'cable') {
      // a cable run hugs the corridor axis (or a room row): one long thin decal, axis-aligned
      const alongX = rng.chance(0.5);
      put(k, c.wx + C * rng.float(0.3, 0.7), c.wz + C * rng.float(0.3, 0.7), { rot: alongX ? 0 : Math.PI / 2 });
    } else if (k === 'grate') put(k, c.wx + C * 0.5, c.wz + C * 0.5, { rot: Math.floor(rng.float(0, 4)) * Math.PI / 2 });
    else put(k, c.wx + C * rng.float(0.25, 0.75), c.wz + C * rng.float(0.25, 0.75));
  }

  // ---- ceiling drips: leaks (a puddle forms below each one) and breathing vents; spaced, wet rooms first
  const pickSources = (n, minGap, prefer) => {
    const out = [];
    const ordered = prefer ? cand.filter((c) => prefer.test(c.type)).concat(cand) : cand;
    for (const c of ordered) {
      if (out.length >= n) break;
      const x = c.wx + C * rng.float(0.3, 0.7), z = c.wz + C * rng.float(0.3, 0.7);
      if (out.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < minGap * minGap)) continue;
      out.push({ x, z, y: Y + c.h - 0.04, h: c.h, corridor: c.corridor });
    }
    return out;
  };
  const drips = pickSources(Math.round(prof.drips * Math.min(1, q + 0.3)), 6, wet);
  for (const d of drips) put('puddle', d.x, d.z, { w: rng.float(1.0, 1.5), d: rng.float(0.8, 1.2), leak: true });
  const vents = pickSources(prof.vents, 8, null).map((v) => ({ ...v, y: v.y + 0.02, per: rng.float(5.5, 8), ph: rng.float(0, 8) }));
  for (const b of broken) put('scorch', b.x + rng.float(-0.25, 0.25), b.z + rng.float(-0.25, 0.25), { w: rng.float(0.8, 1.2), under: true });

  const windows = (fac.m2?.windows?.list || []).map((w) => ({ x: w.x, y: w.y, z: w.z, d: w.d }));
  let sig = decals.length * 131 + drips.length * 17 + vents.length * 7 + broken.length * 3 + lampsOut.length;
  for (const d of decals) sig = (Math.imul(sig, 31) + Math.round(d.x * 10) + Math.round(d.z * 10) * 7 + d.k.length) | 0;
  return { theme, profile: prof, lamps: lampsOut, broken, decals, drips, vents, windows, sig };
}
