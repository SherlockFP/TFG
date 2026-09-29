// polish4 pure rules (no THREE / DOM): seeded pet-egg drops, cantina barter stock, ship decals + furniture, waypoint detours and squad flank offsets.
// Everything here is deterministic from (run seed, game day, source id) so the host, a re-join and node tests all agree. Tested by tools/harness/polish4.test.mjs.
import { RNG, hashString } from '../core/rng.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const int = (v, a, b, d = 0) => clamp(Math.round(num(v, d)), a, b);

// ---------------------------------------------------------------------------------------------------- pet eggs
export const EGG_IDS = ['pet_egg_common', 'pet_egg_wild', 'pet_egg_glitch'];
/** chance that an opened chest holds an egg (per chest tier id) */
export const CHEST_EGG = { wood: 0.02, iron: 0.05, gold: 0.1, void: 0.2 };
/** never more than this many egg drops per game day (all sources together) */
export const EGG_DAY_CAP = 2;
/** creature types that never drop eggs (swarm fodder, neutral NPCs, props) */
export const EGG_IGNORE = new Set(['zombot', 'alien_npc', 'janitorbin', 'hoardnest', 'turret', 'mine']);
const TIER_INDEX = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };

const rngFor = (seed, day, kind, id) => new RNG(hashString(`p4egg|${seed | 0}|${day | 0}|${kind}|${id}`));
/** every game day without an egg makes the next roll a bit likelier (x1.5 per day, capped at x3) */
export const pityMul = (days) => 1 + Math.min(2, 0.5 * Math.max(0, num(days)));

/** egg from an opened chest: seeded by (seed, day, chest id). Returns an egg item id or null. */
export function rollChestEgg({ seed, day, id, tier = 'wood', pity = 0 }) {
  const r = rngFor(seed, day, 'chest', id);
  const p = (CHEST_EGG[tier] ?? CHEST_EGG.wood) * pityMul(pity);
  if (r.next() >= p) return null;
  const u = r.next();
  if (tier === 'wood') return 'pet_egg_common';
  if (tier === 'iron') return u < 0.7 ? 'pet_egg_common' : 'pet_egg_wild';
  if (tier === 'gold') return u < 0.25 ? 'pet_egg_common' : u < 0.85 ? 'pet_egg_wild' : 'pet_egg_glitch';
  return u < 0.55 ? 'pet_egg_wild' : 'pet_egg_glitch';
}

/** egg from a killed creature. c = { type, id, boss, elite, tier, hazard } */
export function rollCreatureEgg({ seed, day, c, pity = 0 }) {
  if (!c || c.hazard || EGG_IGNORE.has(c.type)) return null;
  const r = rngFor(seed, day, 'kill', `${c.type}#${c.id}`);
  const u = r.next(), v = r.next();
  if (c.boss) return u < 0.35 ? 'pet_egg_wild' : u < 0.5 ? 'pet_egg_glitch' : null;
  const ti = TIER_INDEX[c.tier] ?? 0;
  let p = c.elite ? 0.04 : 0.005;
  if (ti >= 2) p += 0.02 * (ti - 1);
  p *= pityMul(pity);
  if (u >= p) return null;
  const rare = c.elite || ti >= 2;
  if (rare) return v < 0.6 ? 'pet_egg_wild' : v < 0.72 ? 'pet_egg_glitch' : 'pet_egg_common';
  return v < 0.6 ? 'pet_egg_common' : 'pet_egg_wild';
}

// ---------------------------------------------------------------------------------------------------- cantina barter
export const BARTER_BUY = ['adrenaline', 'medkit', 'stungrenade', 'glowstick', 'proflash', 'walkie', 'lockpick', 'blastercell'];
export const BARTER_SWAP = ['jetpack', 'beltbag', 'boombox', 'booster', 'ladder', 'adblock', 'blaster', 'pet_egg_common'];
export const BARTER_RARE = [['pet_egg_wild', 0.45, 340], ['blaster', 0.3, 520], ['plasmablade', 0.25, 900]];
export const BARTER_MARKUP = 1.35;

/**
 * The stock of one cantina NPC on one game day (rotates every day). `has(id)` says which item ids exist,
 * `priceOf(id)` the shop price. Offer shape:
 *   { i, kind: 'buy'|'swap', item, qty, price? (credits), min? (value of the scrap you hand over) }
 */
export function barterOffers({ seed, day, npc, role = 'patron', has = () => true, priceOf = () => 40 }) {
  const r = new RNG(hashString(`p4bt|${seed | 0}|${day | 0}|${npc}`));
  const out = [];
  const pick = (list) => { const l = list.filter(has); return l.length ? l[Math.floor(r.next() * l.length) % l.length] : null; };
  const buy = pick(BARTER_BUY);
  if (buy) out.push({ i: 0, kind: 'buy', item: buy, qty: 2, price: Math.max(8, Math.round(num(priceOf(buy), 30) * BARTER_MARKUP)) });
  const swap = pick(BARTER_SWAP);
  if (swap) out.push({ i: out.length, kind: 'swap', item: swap, qty: 1, min: Math.round((60 + r.next() * 60) / 5) * 5 });
  if (role === 'bartender' || r.next() < 0.35) {
    let u = r.next() * BARTER_RARE.reduce((a, e) => a + e[1], 0), rare = null;
    for (const e of BARTER_RARE) { u -= e[1]; if (u <= 0 && has(e[0])) { rare = e; break; } }
    rare = rare || BARTER_RARE.find((e) => has(e[0]));
    if (rare) out.push({ i: out.length, kind: 'buy', item: rare[0], qty: 1, price: Math.max(rare[2], Math.round(num(priceOf(rare[0]), rare[2]) * 1.5)), rare: 1 });
  }
  return out;
}
export const offerKey = (day, npc, i) => `${day | 0}|${npc}|${i | 0}`;

// ---------------------------------------------------------------------------------------------------- ship decals + furniture
export const DECALS = [
  { id: 'none', name: 'No decal', cr: 0 },
  { id: 'skull', name: 'Skull', cr: 20 },
  { id: 'bolt', name: 'Bolt', cr: 20 },
  { id: 'star', name: 'Star', cr: 20 },
  { id: 'eye', name: 'Eye', cr: 25 },
  { id: 'fish', name: 'Phish', cr: 25 },
  { id: 'tfg', name: 'TFG', cr: 30 },
];
export const DECAL_IDS = DECALS.map((d) => d.id);
/** floor furniture: size = [w, h, d] metres (before rotation), flat = walkable (no collider, ignores props) */
export const FURN = {
  rug: { name: 'Woven Rug', cr: 25, size: [2.0, 0.04, 1.4], flat: true, color: 0x7a2f2a },
  plant: { name: 'Potted Plant', cr: 20, size: [0.5, 1.1, 0.5], color: 0x3d8a4a },
  beanbag: { name: 'Bean Bag', cr: 35, size: [0.9, 0.55, 0.9], color: 0xc8581c },
  shelf: { name: 'Crate Shelf', cr: 40, size: [1.0, 1.5, 0.4], color: 0x6b5a44 },
  lamp: { name: 'Floor Lamp', cr: 45, size: [0.35, 1.7, 0.35], color: 0xffd9a0 },
  pedestal: { name: 'Trophy Pedestal', cr: 50, size: [0.6, 1.0, 0.6], color: 0xb8b8c0 },
};
export const FURN_IDS = Object.keys(FURN);
export const MAX_FURN = 12;
/** floor area furniture may stand in (inside the Starter Pod core, clear of the wall props) */
export const FURN_AREA = { x0: -6.2, x1: 6.2, z0: -2.9, z1: 2.9 };
export const blankDeco = () => ({ decal: 'none', furn: [] });
export function sanitizeDeco(raw) {
  const d = blankDeco();
  if (!raw || typeof raw !== 'object') return d;
  d.decal = DECAL_IDS.includes(raw.decal) ? raw.decal : 'none';
  if (Array.isArray(raw.furn)) for (const f of raw.furn) {
    if (d.furn.length >= MAX_FURN) break;
    if (!f || !FURN[f.id]) continue;
    const x = clamp(num(f.x), FURN_AREA.x0, FURN_AREA.x1), z = clamp(num(f.z), FURN_AREA.z0, FURN_AREA.z1);
    d.furn.push({ id: f.id, x: Math.round(x * 20) / 20, z: Math.round(z * 20) / 20, r: int(f.r, 0, 3) });
  }
  return d;
}
/** footprint half extents after the quarter-turn rotation r */
export const halfExtents = (id, r) => { const s = FURN[id]?.size || [1, 1, 1]; return r % 2 ? [s[2] / 2, s[0] / 2] : [s[0] / 2, s[2] / 2]; };
const overlap = (a, b, m = 0.02) => Math.abs(a.x - b.x) < a.hx + b.hx - m && Math.abs(a.z - b.z) < a.hz + b.hz - m;
export const boxOf = (f) => { const [hx, hz] = halfExtents(f.id, f.r); return { x: f.x, z: f.z, hx, hz }; };
/**
 * Can `f` ({id,x,z,r}) stand there? `blocked(box)` is the caller's check against ship props (optional).
 * Solid pieces may not overlap other solid pieces; flat pieces (rugs) may overlap anything except other rugs.
 */
export function canPlace(deco, f, blocked = null) {
  const def = FURN[f.id];
  if (!def) return { ok: false, why: 'Unknown furniture.' };
  const b = boxOf(f);
  if (b.x - b.hx < FURN_AREA.x0 || b.x + b.hx > FURN_AREA.x1 || b.z - b.hz < FURN_AREA.z0 || b.z + b.hz > FURN_AREA.z1) return { ok: false, why: 'Too close to the wall.' };
  for (const o of deco.furn) {
    const od = FURN[o.id];
    if (!!def.flat !== !!od.flat) continue;                 // rugs never collide with solid furniture and the other way round
    if (overlap(b, boxOf(o))) return { ok: false, why: 'Something is already there.' };
  }
  if (!def.flat && blocked && blocked(b)) return { ok: false, why: 'Blocked by something.' };
  return { ok: true };
}
export function tryPlace(deco, wallet, f, blocked = null) {
  if (deco.furn.length >= MAX_FURN) return { ok: false, why: 'The ship cannot hold more furniture.' };
  const c = canPlace(deco, f, blocked);
  if (!c.ok) return c;
  const cr = FURN[f.id].cr;
  if (num(wallet.cr) < cr) return { ok: false, why: 'Not enough credits.' };
  wallet.cr -= cr;
  deco.furn.push({ id: f.id, x: Math.round(f.x * 20) / 20, z: Math.round(f.z * 20) / 20, r: int(f.r, 0, 3) });
  return { ok: true, cr };
}
/** remove piece #i and refund half its price */
export function tryRemove(deco, wallet, i) {
  const f = deco.furn[int(i, -1, 999, -1)];
  if (!f) return { ok: false, why: 'Nothing there.' };
  const back = Math.floor(FURN[f.id].cr / 2);
  deco.furn.splice(deco.furn.indexOf(f), 1);
  wallet.cr = num(wallet.cr) + back;
  return { ok: true, back, id: f.id };
}
export function trySetDecal(deco, wallet, id) {
  const d = DECALS.find((x) => x.id === id);
  if (!d) return { ok: false, why: 'Unknown decal.' };
  if (deco.decal === id) return { ok: false, why: 'Nothing changed.' };
  if (num(wallet.cr) < d.cr) return { ok: false, why: 'Not enough credits.' };
  wallet.cr -= d.cr; deco.decal = id;
  return { ok: true, cr: d.cr };
}
export const findFurn = (q) => { q = String(q || '').toLowerCase().replace(/[^a-z]/g, ''); return q ? FURN_IDS.find((id) => id === q) || FURN_IDS.find((id) => (id + FURN[id].name).toLowerCase().replace(/[^a-z]/g, '').includes(q)) || null : null; };
export const findDecal = (q) => { q = String(q || '').toLowerCase().replace(/[^a-z]/g, ''); return q ? DECAL_IDS.find((id) => id === q) || DECALS.find((d) => d.name.toLowerCase().replace(/[^a-z]/g, '').includes(q))?.id || null : null; };

// ---------------------------------------------------------------------------------------------------- squad waypoints
/**
 * Outdoor detour. `clear(a, b)` is the caller's segment test (a horizontal physics ray at head height). When the straight line from -> to is
 * blocked, try a waypoint to the side of the middle (growing offsets, both sides) and keep the first one whose two legs are clear.
 * Returns [] (go straight), [wp] or null (nothing found: caller keeps the straight line).
 */
export function detourPath(from, to, clear, { side = [5, 8, 12, 17] } = {}) {
  if (clear(from, to)) return [];
  const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len;
  for (const off of side) for (const sg of [1, -1]) for (const t of [0.5, 0.35, 0.65]) {
    const wp = { x: from.x + dx * t + nx * off * sg, z: from.z + dz * t + nz * off * sg };
    if (clear(from, wp) && clear(wp, to)) return [wp];
  }
  return null;
}
/**
 * Flank offset for squad member `idx` of `count` when the crew was last seen at `contact`, the squad centre being `centre`.
 * Enforcers rush in from the front (small spread), gunners swing wide to alternating sides, the leader holds the middle.
 * Returns the extra offset { x, z } (metres) to add to the contact position. `dist` = distance to the contact: inside `near` it fades to 0.
 */
export function flankOffset({ centre, contact, idx, role, dist, near = 15, wide = 9 }) {
  if (role === 'hs_leader' || dist < near) return { x: 0, z: 0 };
  const dx = contact.x - centre.x, dz = contact.z - centre.z, len = Math.hypot(dx, dz);
  if (len < 1) return { x: 0, z: 0 };
  const px = -dz / len, pz = dx / len;
  const side = idx % 2 === 0 ? 1 : -1;
  const k = role === 'hs_enforcer' ? wide * 0.35 : wide;
  const fade = clamp((dist - near) / 10, 0, 1);
  return { x: px * side * k * fade, z: pz * side * k * fade };
}
