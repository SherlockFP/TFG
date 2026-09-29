// SHIP2 pure rules (wave 4, module ship2; docs/wave4/ship2.md). No THREE / DOM / game access: node-tested by tools/harness/ship2_hull.test.mjs.
//   * HULL DAMAGE: the ship accumulates damage SPOTS on its outside (dent / spark / leak / breach) from landings, weather, creatures, raids, sieges.
//     Integrity 100 -> 0 maps to tiers that add gentle-to-annoying effects (power flicker, door malfunction, slower takeoff, pre-flight outer-hull fault).
//   * OUTSIDE REPAIR: hold E next to a spot with a Wrench / Welding Torch / Repair Kit. A timing ring (needle over a green and a red arc) decides the speed.
//   * DEFENCE MOUNTS on the roof + ship power budget; PLANTERS that grow a little tree over game days.
// Early game is gentle (MASTERPLAN section 19): quota 0 = at most 2 dents, no effects at all; quota 1 = tier 2 at most.
import { mountTypes, getDef } from './defense_core.js';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------------------------------------- hull spots
/** kind -> integrity cost (%), severity, repair hold seconds per tool ('wrench' | 'torch'; the kit is instant-ish), who can fix it fully */
export const KINDS = {
  dent: { sev: 1, cost: 6, hold: { wrench: 4.0, torch: 2.6 }, name: 'Dented plate' },
  leak: { sev: 2, cost: 10, hold: { wrench: 5.5, torch: 3.6 }, name: 'Leaking pipe' },
  spark: { sev: 2, cost: 12, hold: { wrench: 6.0, torch: 4.0 }, name: 'Sparking panel' },
  breach: { sev: 3, cost: 22, hold: { wrench: 9.0, torch: 7.0 }, name: 'Hull breach' },
};
export const KIND_IDS = Object.keys(KINDS);
export const KIT_HOLD = 1.3;               // Repair Kit: seconds of holding E
export const MAX_SPOTS = 12;

/** 12 hull slots: surface point, outward normal, y kept low so a player on the ground can reach them. `door` = next to the airlock door. */
export const SLOTS = [
  { id: 0, face: '+z', x: -6.3, y: 0.9, z: 3.75, n: [0, 0, 1] },
  { id: 1, face: '+z', x: -4.8, y: 0.1, z: 3.75, n: [0, 0, 1] },
  { id: 2, face: '+z', x: -3.3, y: 0.3, z: 3.75, n: [0, 0, 1] },
  { id: 3, face: '+z', x: -1.9, y: 0.4, z: 3.75, n: [0, 0, 1] },
  { id: 4, face: '+z', x: 0.0, y: 1.0, z: 3.75, n: [0, 0, 1] },
  { id: 5, face: '+z', x: 4.7, y: 0.7, z: 3.75, n: [0, 0, 1] },
  { id: 6, face: '+z', x: 5.9, y: 1.2, z: 3.75, n: [0, 0, 1] },
  { id: 7, face: '-z', x: -1.4, y: 0.6, z: -3.75, n: [0, 0, -1] },
  { id: 8, face: '-z', x: 5.6, y: 1.0, z: -3.75, n: [0, 0, -1] },
  { id: 9, face: 'nose', x: -8.93, y: 0.2, z: 0.78, n: [-0.93, 0.2, 0.3] },
  { id: 10, face: 'nose', x: -8.93, y: 0.2, z: -0.78, n: [-0.93, 0.2, -0.3] },
  { id: 11, face: '+z', x: 1.15, y: 0.9, z: 3.75, n: [0, 0, 1], door: true },
];
export const slotById = (id) => SLOTS[id | 0] || null;
/** where a player stands to interact: 0.4 m in front of the spot */
export const standPoint = (slot) => [slot.x + slot.n[0] * 0.4, slot.y, slot.z + slot.n[2] * 0.4];

// ---------------------------------------------------------------------------------------------- state
export const freshState = () => ({ v: 1, sp: [], seq: 0, pw: 0 });
export function sanitize(s) {
  const out = freshState();
  if (!s || typeof s !== 'object') return out;
  out.seq = clamp(s.seq | 0, 0, 1e6);
  const seen = new Set();
  for (const r of Array.isArray(s.sp) ? s.sp : []) {
    if (!r || !KINDS[r.k] || !slotById(r.s) || seen.has(r.s | 0)) continue;
    seen.add(r.s | 0);
    out.sp.push({ i: String(r.i || 'h' + out.sp.length).slice(0, 8), k: r.k, s: r.s | 0, t: Number(r.t) || 0 });
    if (out.sp.length >= MAX_SPOTS) break;
  }
  return out;
}
export const integrity = (st) => clamp(100 - (st?.sp || []).reduce((a, p) => a + (KINDS[p.k]?.cost || 0), 0), 0, 100);
/** 0 fine (>= 85), 1 scuffed (>= 60), 2 damaged (>= 35), 3 critical */
export const tierOf = (integ) => (integ >= 85 ? 0 : integ >= 60 ? 1 : integ >= 35 ? 2 : 3);
export const hasBreach = (st) => (st?.sp || []).some((p) => p.k === 'breach');
export const spotById = (st, id) => (st?.sp || []).find((p) => p.i === id) || null;

// ---------------------------------------------------------------------------------------------- damage sources
/** weather severity 0..1 (how hard the sky hits the hull) */
export const WEATHER_SEV = { clear: 0, foggy: 0.15, rainy: 0.35, eclipsed: 0.6, stormy: 1 };
/** per source: base chance for one roll, kind weights, count. quota 0 uses `early` instead. */
export const SOURCES = {
  landing: { chance: 0.1, kinds: { dent: 6, spark: 2, leak: 1 }, early: 0.05 },
  weather: { chance: 0.11, kinds: { dent: 4, spark: 3, leak: 1 }, early: 0.05 },   // rolled every WEATHER_EVERY seconds of moon time, times the weather severity
  creature: { chance: 0.16, kinds: { dent: 5, leak: 2, spark: 1 }, early: 0.05 },   // rolled every CREATURE_EVERY seconds while a hostile is next to the hull
  raid: { chance: 0.6, kinds: { dent: 3, spark: 3, breach: 1 }, early: 0.15 },
  siege: { chance: 1, kinds: { dent: 3, spark: 3, leak: 2, breach: 1 }, early: 0.2 },
  event: { chance: 1, kinds: { dent: 2, spark: 2, leak: 2 }, early: 0.5 },          // debug / other modules
};
export const WEATHER_EVERY = 100;
export const CREATURE_EVERY = 12;
/** hard caps by quota: [maxSpots, maxTier] - quota 0 is a learning period */
export function capsFor(quota = 0) {
  const q = quota | 0;
  return q <= 0 ? { spots: 2, tier: 1, kinds: ['dent'] } : q === 1 ? { spots: 5, tier: 2, kinds: ['dent', 'leak', 'spark'] } : { spots: MAX_SPOTS, tier: 3, kinds: KIND_IDS };
}
const pickWeighted = (w, rng, allow) => {
  const ids = Object.keys(w).filter((k) => !allow || allow.includes(k));
  if (!ids.length) return 'dent';
  let tot = 0; for (const k of ids) tot += w[k];
  let r = rng() * tot;
  for (const k of ids) { r -= w[k]; if (r <= 0) return k; }
  return ids[ids.length - 1];
};
/** chance of one roll: `mul` = weather / threat / weight multiplier (>= 0) */
export function rollChance(source, quota = 0, mul = 1) {
  const s = SOURCES[source]; if (!s) return 0;
  return clamp(((quota | 0) <= 0 ? s.early : s.chance) * mul, 0, 1);
}
/** free slot for a new spot: 'door' preference for creature attacks; deterministic given rng */
export function freeSlot(st, rng, prefer = null) {
  const used = new Set((st.sp || []).map((p) => p.s));
  const free = SLOTS.filter((s) => !used.has(s.id));
  if (!free.length) return null;
  if (prefer === 'door') { const d = free.find((s) => s.door); if (d && rng() < 0.5) return d.id; }
  return free[Math.floor(rng() * free.length) % free.length].id;
}
/** Add one damage spot (or escalate an existing one when the hull is full). Returns { st, added, escalated, blocked } - never mutates `st`. */
export function addDamage(st, source, quota = 0, rng = Math.random, opts = {}) {
  const caps = capsFor(quota), sp = (st.sp || []).map((p) => ({ ...p }));
  const src = SOURCES[source] || SOURCES.event;
  const kind = opts.kind && KINDS[opts.kind] && caps.kinds.includes(opts.kind) ? opts.kind : pickWeighted(src.kinds, rng, caps.kinds);
  const next = { ...st, sp, seq: (st.seq | 0) + 1 };
  const before = tierOf(integrity(st));
  const cap = Math.min(caps.spots, MAX_SPOTS);
  if (sp.length >= cap) {
    // hull already as bad as this stage of the run allows: worsen an existing spot instead (never past the tier cap)
    const cand = sp.filter((p) => p.k === 'dent' || p.k === 'spark' || p.k === 'leak');
    if (!cand.length || !caps.kinds.includes('spark')) return { st, added: null, escalated: null, blocked: true };
    const pick = cand[Math.floor(rng() * cand.length) % cand.length];
    const to = pick.k === 'dent' ? 'spark' : pick.k === 'leak' || pick.k === 'spark' ? (caps.kinds.includes('breach') ? 'breach' : pick.k) : pick.k;
    if (to === pick.k) return { st, added: null, escalated: null, blocked: true };
    const trial = sp.map((p) => (p === pick ? { ...p, k: to } : p));
    if (tierOf(integrity({ sp: trial })) > caps.tier) return { st, added: null, escalated: null, blocked: true };
    pick.k = to;
    return { st: next, added: null, escalated: { i: pick.i, k: to }, blocked: false };
  }
  const slot = freeSlot(st, rng, opts.prefer);
  if (slot === null) return { st, added: null, escalated: null, blocked: true };
  let k = kind;
  // stay inside the tier cap of this stage of the run: downgrade the kind until it fits
  const order = ['breach', 'spark', 'leak', 'dent'];
  while (tierOf(integrity({ sp: [...sp, { k }] })) > caps.tier && k !== 'dent') k = order[order.indexOf(k) + 1] || 'dent';
  if (tierOf(integrity({ sp: [...sp, { k }] })) > caps.tier) return { st, added: null, escalated: null, blocked: true };
  const spot = { i: 'h' + next.seq.toString(36), k, s: slot, t: opts.t || 0 };
  sp.push(spot);
  return { st: next, added: spot, escalated: null, blocked: false, tierUp: tierOf(integrity(next)) > before };
}
/** Once per game day (landing / takeoff): an unrepaired spark or leak may get worse. Quota 0 never worsens. */
export function escalate(st, quota = 0, rng = Math.random) {
  if ((quota | 0) < 1) return { st, changed: [] };
  const caps = capsFor(quota), changed = [];
  const sp = (st.sp || []).map((p) => {
    if ((p.k === 'spark' || p.k === 'leak') && rng() < 0.35 && caps.kinds.includes('breach')) { changed.push({ i: p.i, k: 'breach' }); return { ...p, k: 'breach' }; }
    if (p.k === 'dent' && rng() < 0.1 && caps.kinds.includes('spark')) { changed.push({ i: p.i, k: 'spark' }); return { ...p, k: 'spark' }; }
    return p;
  });
  const out = { ...st, sp };
  if (tierOf(integrity(out)) > caps.tier) return { st, changed: [] };
  return { st: out, changed };
}

// ---------------------------------------------------------------------------------------------- tools + repair
export const TOOLS = {
  s2_wrench: { tool: 'wrench', name: 'Wrench', price: 35, weight: 2, tip: 'Hold E next to hull damage to repair it. Fixes dents, leaks and sparks; on a breach it can only patch it down to sparks.' },
  s2_torch: { tool: 'torch', name: 'Welding Torch', price: 120, weight: 3, tip: 'Faster than the wrench and the only tool that seals a hull breach for good. Hold E next to hull damage.' },
  s2_kit: { tool: 'kit', name: 'Repair Kit', price: 25, weight: 1, tip: 'Consumable. Hold E for a moment next to hull damage: fixes one dent / leak / spark, or patches a breach down a step.' },
};
export const TOOL_IDS = Object.keys(TOOLS);
export const toolOf = (itemId) => TOOLS[itemId]?.tool || null;

/** { ok, mode: 'fix' | 'patch', to?: kind, hold } - what a tool does to a spot kind */
export function repairRule(tool, kind, aptMul = 1) {
  if (!KINDS[kind] || !['wrench', 'torch', 'kit'].includes(tool)) return { ok: false };
  const mul = Math.max(0.3, aptMul || 1);
  const base = tool === 'kit' ? KIT_HOLD : KINDS[kind].hold[tool];
  const hold = Math.max(0.6, base / mul);
  if (kind === 'breach' && tool !== 'torch') return { ok: true, mode: 'patch', to: 'spark', hold: tool === 'kit' ? hold : hold * 0.7, consume: tool === 'kit' };
  return { ok: true, mode: 'fix', hold, consume: tool === 'kit' };
}
/** apply a finished repair: returns the new state (spot removed or downgraded) */
export function applyRepair(st, id, tool) {
  const p = spotById(st, id); if (!p) return st;
  const r = repairRule(tool, p.k); if (!r.ok) return st;
  const sp = r.mode === 'fix' ? st.sp.filter((x) => x.i !== id) : st.sp.map((x) => (x.i === id ? { ...x, k: r.to } : x));
  return { ...st, sp };
}

// ---------------------------------------------------------------------------------------------- timing ring (deterministic from a seed: host and clients agree)
export const RING = { period: 2.0, green: 0.2, red: 0.16 };
const frac = (v) => v - Math.floor(v);
export function ringSeed(id, start) { let h = 2166136261; for (const ch of String(id) + ':' + Math.round(start * 10)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
/** needle 0..1 at time t since the session start; arcs are seed-dependent, always opposite each other */
export function ringAt(seed, t) {
  const needle = frac(t / RING.period), g = frac(seed), r = frac(seed + 0.5);
  const inArc = (c, w) => { const d = Math.abs(frac(needle - c + 0.5) - 0.5); return d <= w / 2; };
  return { needle, green: g, red: r, zone: inArc(g, RING.green) ? 'green' : inArc(r, RING.red) ? 'red' : 'none' };
}
export const ZONE_RATE = { green: 2.2, none: 1.0, red: -0.35 };
/** advance a host hold-session: s = { need, prog, seed, t, down }; returns { done, shock } */
export function stepSession(s, dt, early = false) {
  s.t += dt;
  if (!s.down) { s.prog = Math.max(0, s.prog - dt * 0.6); return { done: false, shock: false }; }   // let go = the weld cools: slow decay
  const z = ringAt(s.seed, s.t).zone;
  const rate = z === 'red' && early ? 0.5 : ZONE_RATE[z];       // early game: the red arc only slows you
  s.prog = clamp(s.prog + dt * rate, 0, s.need);
  return { done: s.prog >= s.need - 1e-6, shock: z === 'red' && !early };
}

// ---------------------------------------------------------------------------------------------- effects by tier
export const takeoffDelay = (tier, quota = 0) => ((quota | 0) < 1 ? 0 : [0, 0, 6, 14][tier] || 0);
export const doorJamChance = (tier, quota = 0) => ((quota | 0) < 1 ? 0 : [0, 0, 0.2, 0.5][tier] || 0);
export const lightFlicker = (tier, quota = 0) => ((quota | 0) < 1 ? 0 : [0, 0, 0.22, 0.5][tier] || 0);
/** shipfaults integration: is an outer-hull breach part of the pre-flight check? (quota >= 1 and a breach or a critical hull) */
export const outerFaultWanted = (st, quota = 0) => (quota | 0) >= 1 && (hasBreach(st) || tierOf(integrity(st)) >= 3);
/** the spot the pre-flight outer fault points at (worst first) */
export function worstSpot(st) { const o = { breach: 3, spark: 2, leak: 2, dent: 1 }; return [...(st?.sp || [])].sort((a, b) => o[b.k] - o[a.k])[0] || null; }
/** does the outer fault count as done: no breach left and the hull is not critical */
export const outerFaultDone = (st) => !hasBreach(st) && tierOf(integrity(st)) < 3;

// ---------------------------------------------------------------------------------------------- defence mounts + ship power budget
export const MOUNTS = [
  { id: 'M1', x: 5.9, z: -2.5, label: 'TAIL N' }, { id: 'M2', x: 6.2, z: 2.0, label: 'TAIL S' }, { id: 'M3', x: 5.2, z: -0.2, label: 'TAIL C' },
  { id: 'M4', x: 2.8, z: -2.7, label: 'MID N' }, { id: 'M5', x: 2.8, z: 2.7, label: 'MID S' },
];
export const MOUNT_Y = 3.9;      // roof surface (ship.js eh)
/** deployable kits that can be mounted: the ship powers them (no battery / fuel) except the ammo-fed MK1 */
export const MOUNT_TYPES = mountTypes();   // [unify] the kits flagged `mount` in defense_core.js
/** power slots the ship can feed: 1 in quota 0, 2 later, +1 per Engine Room tier (0..3), -1 while the hull is critical; min 1 */
export function powerSlots(quota = 0, engineTier = 0, hullTier = 0) {
  return Math.max(1, ((quota | 0) <= 0 ? 1 : 2) + clamp(engineTier | 0, 0, 3) - (hullTier >= 3 ? 1 : 0));
}
export function sanitizeMounts(m) {
  const out = {};
  if (!m || typeof m !== 'object') return out;
  for (const mt of MOUNTS) { const r = m[mt.id]; if (r && MOUNT_TYPES.includes(r.ty)) out[mt.id] = { ty: r.ty, tr: r.tr || null, hp: Number.isFinite(r.hp) ? r.hp : null }; }
  return out;
}
/** which mounts get power this tick: the first `slots` mounted ones by id order (ammo-fed MK1 uses no slot) */
export function poweredMounts(mounts, slots) {
  const on = new Set(); let n = 0;
  for (const mt of MOUNTS) {
    const r = mounts?.[mt.id]; if (!r) continue;
    if (getDef(r.ty)?.ammo) { on.add(mt.id); continue; }   // ammo-fed kits (MK1) use no power slot
    if (n < slots) { on.add(mt.id); n++; }
  }
  return on;
}

// ---------------------------------------------------------------------------------------------- planters (a little tree over game days, then fruit)
export const PLANT = { days: [0, 1, 2, 4, 6], stages: ['soil', 'sprout', 'sapling', 'tree', 'fruiting'], regrow: 2, waterBonus: 0.5, fruit: 'fd_hydro' };
export const stageOf = (pts) => { let s = 0; for (let i = 1; i < PLANT.days.length; i++) if (pts >= PLANT.days[i]) s = i; return s; };
export const freshPlanter = () => ({ pl: 0, pts: 0, w: 0, key: '' });
/** one game day passed (key = runId:day, once per key). watered gives +0.5. */
export function growPlanter(p, key, watered) {
  if (!p || !p.pl || p.key === key) return p;
  return { ...p, pts: Math.min(PLANT.days[4] + 1, p.pts + 1 + (p.w || watered ? PLANT.waterBonus : 0)), w: 0, key };
}
export const canHarvest = (p) => !!p?.pl && stageOf(p.pts) >= 4;
export const harvest = (p) => ({ ...p, pts: PLANT.days[4] - PLANT.regrow, w: 0 });
export const plantIt = (p, key = '') => ({ ...(p || freshPlanter()), pl: 1, pts: 0, w: 0, key });
export const waterIt = (p) => (p?.pl && !p.w ? { ...p, w: 1 } : p);
export function sanitizePlanters(m) {
  const out = {};
  if (!m || typeof m !== 'object') return out;
  for (const id of Object.keys(m).slice(0, 8)) { const p = m[id]; if (p && typeof id === 'string' && id.length < 24) out[id] = { pl: p.pl ? 1 : 0, pts: clamp(Number(p.pts) || 0, 0, 12), w: p.w ? 1 : 0, key: String(p.key || '').slice(0, 24) }; }
  return out;
}
