// ZONES core (wave 5, module `zones`): pure data + rules, no DOM / game / three access (node-testable: tools/harness/zones.test.mjs).
// Design + knobs: docs/wave5/zones.md (MASTERPLAN §26). Everything that can differ between peers is derived from (runKey, moonId) and, for the
// exact core positions, from the terrain plan of the current landing (host computes them, clients receive them).
import { RNG, hashString } from '../core/rng.js';
import { sig as sigColor } from '../core/a11y_core.js';   // [a11y]
import { siegePower, planWave, SG } from './siege_core.js';
import * as DC from './defense_core.js';
import { TRAPS } from './horror_core.js';
import { MK_SPEED, MK_COST, PURITY } from './homeworld2_core.js';   // zones2: the miner uses homeworld2's Mk / purity tables

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const ZN = {
  clearR: 28,            // m: no hostile creature this close to the core ...
  clearSec: 20,          // ... for this long before a beacon can be planted
  plantSec: 4,           // hold-interact time (host checks the planter stays inside plantR)
  plantR: 6,
  zoneR: 24,             // m: "standing in the zone" (build menu, border ring radius)
  shipMin: 26,           // cores keep this far from the ship
  coreGap: 28,           // and from each other
  baseSlots: 6, slotsPerUp: 2, maxUp: 3,
  upCost: [160, 320, 560],
  attackMinQuota: 1,     // run.quotaIndex >= 1 = quota 2 (never earlier)
  dusk: 17 * 60,         // in-game minute at which a live counter-attack starts on the moon the crew stands on
  coreHp: 300, coreHpUp: 100,
  incomeCapMul: 0.25, incomeCapMin: 20,   // daily passive cap = max(20, 25 % of the current quota)
  matCapPerDay: 4,
  offline: { maxDays: 3, eff: 0.5, minSec: 900, secPerDay: 1800 },   // homeworld2 style: capped, reduced efficiency
  waveJitter: [0.75, 1.3],
  winBonusMul: 2.2,
};

// ------------------------------------------------------------------ defences (outdoor numbers live in defense_core.js; zones2 adds interior trap defs)
export const DEFS = { ...DC.zoneDefs() };
export const DEF_IDS = Object.keys(DEFS);   // OUTDOOR defences (the sector-map list); interior wings use TRAP_DEF_IDS
// zones2: interior wings are fortified with the horror TRAP types (laser grid, crusher, spikes, live floor, flame vent) on corridor cells. Permanently armed while the
// zone is paid for (upkeep), they only hurt creatures (never the crew). cost ~2.2x the pay-to-arm price: a trap is a one-off purchase here, not a per-strike fee.
const TRAP_POWER = { crusher: 12, spikes: 8, electric: 11, flame: 12, laser: 15 };
const TRAP_MINQ = { crusher: 0, spikes: 0, electric: 1, flame: 1, laser: 1 };
export const TRAP_DEF_IDS = [];
for (const id of ['spikes', 'crusher', 'electric', 'flame', 'laser']) {
  const T = TRAPS[id], k = 't_' + id;
  DEFS[k] = { name: T.name, cost: Math.round((T.price * 2.2) / 5) * 5, upkeep: Math.max(2, Math.round(T.price / 14)), power: TRAP_POWER[id], minQ: TRAP_MINQ[id], in: 1, trap: id };
  TRAP_DEF_IDS.push(k);
}
export const ALL_DEF_IDS = [...DEF_IDS, ...TRAP_DEF_IDS];
export const defsFor = (interior) => (interior ? TRAP_DEF_IDS : DEF_IDS);
export const BASE_DEF = DC.BASE_DEF;   // the core defends itself a little

// zones2: outdoor wall / gate pieces (homeworld2 style snap grid: FC = 1.5 m fine cells, a piece is 3 m = 2 cells long). State: st.w = [[kind 0 wall | 1 gate, gx, gz, rot 0 | 1], ...]
// with (gx, gz) in fine cells RELATIVE TO THE CORE (the terrain differs per landing, the offsets persist; pieces that no longer fit are skipped for that landing).
export const WALL = {
  fc: 1.5, len: 3, thick: 0.5, h: 2.2, gateW: 2.0,
  cost: { 0: 14, 1: 40 }, sell: 0.5, power: { 0: 0.5, 1: 1.2 }, powerMax: 10, upkeepGate: 1,
  baseCap: 12, capPerUp: 6, hp: { 0: 260, 1: 160 }, flowCost: { 0: 25, 1: 6 },
  minCore: 3.4, shipKeep: 3.2, maxSlope: 0.9, maxReach: 11, coreClear: 2.6,
  names: ['Zone Wall', 'Zone Gate'],
};
export const wallCap = (st) => WALL.baseCap + WALL.capPerUp * (st?.up | 0);
export const wallCount = (st) => (st?.w || []).length;
export const wallPower = (st) => Math.min(WALL.powerMax, (st?.w || []).reduce((a, w) => a + (WALL.power[w[0]] || 0), 0));
export const wallUpkeep = (st) => (st?.w || []).reduce((a, w) => a + (w[0] === 1 ? WALL.upkeepGate : 0), 0);

// zones2: optional extractor per zone (homeworld2 miner rules: Mk1-3 = speed x1 / 1.5 / 2.2 for cost x1 / 1.9 / 3.6, node purity impure / normal / pure = x0.5 / 1 / 1.6).
// State: st.mn = { l: 1..3, p: purity 0..2 }. It adds credits INSIDE the daily cap plus a biome material (and a little material cap of its own).
export const MINER = { cost: 220, minQ: 1, maxLv: 3, credits: 6, creditsPerTier: 4, sell: 0.5, matCapPer: 2, matCapMax: 12 };
export const minerCost = (lv) => Math.round(MINER.cost * MK_COST[Math.max(0, Math.min(2, lv - 1))]);
export const minerUpCost = (lv) => minerCost(lv + 1) - minerCost(lv);
export const minerUpkeep = (mn) => (mn ? 3 + 2 * (mn.l | 0) : 0);
export function minerPurity(runKey, moonId, zoneId) {
  const r = new RNG(hashString(`${runKey}:zn:node:${moonId}:${zoneId}`)).next();
  return r < 0.25 ? 0 : r < 0.75 ? 1 : 2;
}
export function minerBonus(moon, mn) {
  if (!mn) return null;
  const l = clamp(mn.l | 0, 1, MINER.maxLv), p = clamp(mn.p | 0, 0, 2), tier = (moon?.tier | 0) || 1;
  return { credits: Math.round((MINER.credits + MINER.creditsPerTier * tier) * PURITY[p] * MK_SPEED[l - 1]), mat: l >= 3 ? 2 : 1, matId: matOf(moon), mn: 1 };
}

// ------------------------------------------------------------------ eligibility + zone partition
export function zonesEligible(moon) {
  return !!(moon && moon.id && moon.biome && !moon.company && !moon.home && !moon.instance && !moon.core && !moon.raid && !moon.gate && !moon.stale && moon.tier !== 0);
}
const LETTERS = 'ABCDEF';
/** stable partition of a moon into 3-6 zones (no terrain needed): outdoor fields around the ship + facility wings (entrance, fire exits) */
export function zoneSpec(moon, runKey) {
  const rng = new RNG(hashString(`${runKey}:zn:${moon.id}`));
  const size = +moon.size || 1, sc = clamp(+moon.mapScale || 1, 1, 1.6);
  const n = clamp(Math.round(2.4 + size * 1.5 + (sc - 1) * 2 + rng.float(-0.7, 0.7)), 3, 6);
  const nFire = size >= 1.2 ? 2 : 1;
  const wings = Math.min(1 + nFire, n - 1);
  const fields = n - wings;
  const base = rng.float(0, Math.PI * 2);
  const tier = clamp(moon.tier | 0 || 1, 1, 9);
  const zones = [];
  for (let k = 0; k < fields; k++) {
    zones.push({ kind: 'field', ang: base + k * ((Math.PI * 2) / fields) + rng.float(-0.25, 0.25), dist: (36 + k * 17 + rng.float(-4, 6)) * sc * (0.9 + 0.1 * size), wing: null });
  }
  const order = ['entrance', 'fire0', 'fire1'];
  for (let w = 0; w < wings; w++) zones.push({ kind: 'wing', ang: 0, dist: 0, wing: order[w], flip: rng.sign() });
  zones.forEach((z, i) => {
    z.id = LETTERS[i]; z.rank = i;
    z.threat = clamp(Math.round((tier + i * 0.5 + (z.kind === 'wing' ? 0.5 : 0)) * 10) / 10, 1, 10);
    z.minQ = i >= 4 ? 2 : i >= 2 ? 1 : 0;
    z.name = z.kind === 'wing' ? (z.wing === 'entrance' ? 'Main Hall' : z.wing === 'fire0' ? 'East Annex' : 'West Annex') : `Sector ${LETTERS[i]}`;
  });
  return { n, moonId: moon.id, tier, zones };
}

/**
 * place the cores on the real terrain of a landing. plan = planMoon() result {entrance, fires, ponds, lakes, flats, scale}; probe(x, z) = true when the spot is
 * dry, walkable and reachable from the ship (caller supplies the terrain test); playHalf = walkable half extent. Deterministic (own RNG stream).
 * Returns [{id, x, z}] (x = null when no spot exists, which the tests treat as a failure).
 */
export function placeCores(spec, plan, probe, playHalf, runKey) {
  const rng = new RNG(hashString(`${runKey}:zn:cores:${spec.moonId}`));
  const ent = plan.entrance, fires = plan.fires || [];
  const anchors = [ent, ...fires];
  const placed = [];
  const lim = playHalf - 14;
  const validAt = (x, z, own) => {
    if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
    if (Math.hypot(x, z) < ZN.shipMin) return false;
    for (const p of plan.ponds || []) if (Math.hypot(x - p.x, z - p.z) < p.r * 1.4 + 3) return false;
    for (const l of plan.lakes || []) if (Math.hypot(x - l.x, z - l.z) < l.r + 4) return false;
    for (const f of plan.flats || []) if (Math.hypot(x - f.x, z - f.z) < f.r + 6) return false;
    for (const a of anchors) if (a !== own && Math.hypot(x - a.x, z - a.z) < 22) return false;
    if (own && Math.hypot(x - own.x, z - own.z) < 10) return false;
    for (const q of placed) if (q.x !== null && Math.hypot(x - q.x, z - q.z) < ZN.coreGap) return false;
    return !!probe(x, z);
  };
  for (const z of spec.zones) {
    let ix, iz, own = null;
    if (z.kind === 'wing') {
      own = z.wing === 'entrance' ? ent : fires[z.wing === 'fire0' ? 0 : 1] || ent;
      const d = z.wing === 'entrance' ? 17 : 12, a = Math.atan2(-own.z, -own.x) + z.flip * 0.6;   // from the anchor back towards the ship, swung sideways
      ix = own.x + Math.cos(a) * d; iz = own.z + Math.sin(a) * d;
    } else { ix = Math.cos(z.ang) * z.dist; iz = Math.sin(z.ang) * z.dist; }
    let spot = null;
    for (let t = 0; t < 60 && !spot; t++) {
      const k = t === 0 ? 0 : 1 + t * 0.35;
      const x = ix + (t ? rng.float(-1, 1) * k * 4 : 0), zz = iz + (t ? rng.float(-1, 1) * k * 4 : 0);
      if (validAt(x, zz, own)) spot = { x: Math.round(x * 10) / 10, z: Math.round(zz * 10) / 10 };
    }
    if (!spot) for (let t = 0; t < 200 && !spot; t++) {   // wide fallback: any valid ring position
      const a = rng.float(0, Math.PI * 2), d = rng.float(ZN.shipMin + 4, lim);
      const x = Math.cos(a) * d, zz = Math.sin(a) * d;
      if (validAt(x, zz, own)) spot = { x: Math.round(x * 10) / 10, z: Math.round(zz * 10) / 10 };
    }
    placed.push({ id: z.id, x: spot ? spot.x : null, z: spot ? spot.z : null });
  }
  return placed;
}

// ------------------------------------------------------------------ state (run.zn)
export const emptyState = () => ({ v: 1, m: {}, col: 0, pend: [], rt: 0, day: 0, stat: { cap: 0, held: 0, lost: 0, earned: 0 } });
export function ensureState(zn, runKey) {
  const s = zn && typeof zn === 'object' ? zn : emptyState();
  if (!s.m || typeof s.m !== 'object') s.m = {};
  if (!Array.isArray(s.pend)) s.pend = [];
  if (!s.stat) s.stat = { cap: 0, held: 0, lost: 0, earned: 0 };
  if (!s.col && runKey) s.col = 1 + (hashString(String(runKey) + ':zncol') % 6);
  return s;
}
export const getZ = (zn, m, z) => zn?.m?.[m]?.[z] || null;
export function setZ(zn, m, z, v) {
  if (!zn.m[m]) zn.m[m] = {};
  if (v) zn.m[m][z] = v; else { delete zn.m[m][z]; if (!Object.keys(zn.m[m]).length) delete zn.m[m]; }
}
/** every owned / infected zone as {m, z, st} (active = moon still in reach, decided by the caller through isActive(moonId)) */
export function listZones(zn, isActive = () => true) {
  const out = [];
  for (const [m, zs] of Object.entries(zn?.m || {})) for (const [z, st] of Object.entries(zs)) out.push({ m, z, st, active: !!isActive(m) });
  return out;
}
export const CREW_COLORS = ['#7fb7ff', '#7dff9a', '#ffb347', '#ff6f91', '#c79bff', '#5fe3d0'];
export const crewColor = (zn) => { const i = ((zn?.col || 1) - 1) % CREW_COLORS.length; return sigColor('zone.' + (i + 1), CREW_COLORS[i]); };   // [a11y] palette-aware

// ------------------------------------------------------------------ economy
export const maxOwned = (qi) => Math.min(12, 3 + 2 * Math.max(0, qi | 0));
export const slotsOf = (st) => ZN.baseSlots + ZN.slotsPerUp * (st?.up | 0);
export const defCount = (st) => Object.values(st?.d || {}).reduce((a, b) => a + (b | 0), 0);
/** beacon cost: cheap for the first zone of a run (owner: capturable from quota 1), growing with zones held; recapture is half price */
export function captureCost(moon, zone, owned, recapture = false) {
  const c = 35 + 20 * (moon.tier | 0 || 1) + 12 * (zone.rank | 0) + 10 * Math.max(0, owned | 0);
  return Math.round(recapture ? c * 0.5 : c);
}
const MATS = ['comp_scrapmetal', 'comp_wood', 'comp_cable', 'comp_battery', 'comp_fuse', 'comp_circuit', 'comp_sensor', 'comp_fuel', 'comp_coolant', 'comp_chem', 'comp_cloth', 'comp_crystal'];
const BIOME_MAT = { hills: 'comp_wood', swamp: 'comp_chem', snow: 'comp_coolant', desert: 'comp_scrapmetal', moor: 'comp_cloth', blackforest: 'comp_wood', pier: 'comp_scrapmetal', datascape: 'comp_circuit', servermarsh: 'comp_chem', ashfield: 'comp_fuel', crystal: 'comp_crystal', lava: 'comp_fuel', ice: 'comp_coolant', jungle: 'comp_cloth', soviet: 'comp_cable', twinsun: 'comp_battery' };
export const matOf = (moon) => BIOME_MAT[moon?.biome] || MATS[hashString(String(moon?.biome || moon?.id || 'x')) % MATS.length];
/** per-day income of one owned zone (before the daily cap) */
export function zoneIncome(moon, zone, st) {
  const up = clamp(st?.up | 0, 0, ZN.maxUp);
  const tier = moon.tier | 0 || 1;
  const credits = Math.round((10 + 7 * tier) * (1 + 0.15 * (zone.rank | 0)) * (1 + 0.25 * up));
  const mat = tier >= 3 || up >= 2 ? 2 : 1;
  return { credits, mat, matId: matOf(moon), mn: minerBonus(moon, st?.mn) };
}
/** the rows the daily cap works on: the zone itself + its extractor (if any) */
export const incomeRows = (moon, zone, st) => { const i = zoneIncome(moon, zone, st); return i.mn ? [i, i.mn] : [i]; };
export const incomeTotal = (i) => i.credits + (i.mn ? i.mn.credits : 0);
export const dailyCap = (quota) => Math.max(ZN.incomeCapMin, Math.round((quota | 0) * ZN.incomeCapMul));
/** rows = [{credits, mat, matId}] -> capped totals (the cap scales credits down proportionally, materials to matCapPerDay) */
export function capIncome(rows, quota) {
  const cap = dailyCap(quota);
  const gross = rows.reduce((a, r) => a + r.credits, 0);
  const k = gross > cap ? cap / gross : 1;
  const credits = Math.floor(gross * k);
  const mats = {};
  let left = ZN.matCapPerDay + Math.min(MINER.matCapMax - ZN.matCapPerDay, MINER.matCapPer * rows.filter((r) => r.mn).length);
  for (const r of rows) { const q = Math.min(left, r.mat | 0); if (q > 0) { mats[r.matId] = (mats[r.matId] || 0) + q; left -= q; } }
  return { gross, credits, cap, capped: gross > cap, mats };
}
export const upkeepOf = (st) => Object.entries(st?.d || {}).reduce((a, [k, n]) => a + (DEFS[k]?.upkeep || 0) * (n | 0), 0) + wallUpkeep(st) + minerUpkeep(st?.mn);
/** pay upkeep for zones in order out of `funds`; zones that cannot be paid go dry (defences at 40 % power, turrets start empty) */
export function payUpkeep(funds, rows) {
  let left = Math.max(0, funds | 0), paid = 0;
  const dry = [], frac = {};   // frac = how much of the day's upkeep (= ammo) a zone got (1 when paid in full; unpaid zones get what is left, without spending it)
  for (const r of rows) {
    const c = upkeepOf(r.st);
    if (c <= 0) { frac[r.key] = 1; continue; }
    if (left >= c) { left -= c; paid += c; frac[r.key] = 1; } else { dry.push(r.key); frac[r.key] = clamp(left / c, 0, 0.5); }
  }
  return { paid, dry, left, frac };
}
export function defencePower(st, dry = false, moonUps = 0) {
  let p = BASE_DEF;
  for (const [k, n] of Object.entries(st?.d || {})) p += (DEFS[k]?.power || 0) * (n | 0);
  p += wallPower(st);
  p *= dry ? 0.4 : 1;
  return Math.round(p * (1 + 0.1 * clamp((st?.up | 0) + moonUps, 0, 6)) * 10) / 10;
}
export const offlineDays = (elapsedSec) => {
  const o = ZN.offline;
  if (!(elapsedSec >= o.minSec)) return 0;
  return Math.min(o.maxDays, Math.floor(elapsedSec / o.secPerDay));
};
/** credits for `days` offline days: same daily cap, reduced efficiency */
export const offlineIncome = (days, rows, quota) => Math.floor(capIncome(rows, quota).credits * Math.max(0, days) * ZN.offline.eff);

// ------------------------------------------------------------------ capture rules
/** ctx: {phase, moonId, currentMoon, dist, zoneUnlockedQ, quotaIndex, credits, cost, owned, st, clearT, hostileNear, dead} */
export function canCapture(c) {
  if (c.phase !== 'moon' || c.moonId !== c.currentMoon) return { ok: false, why: 'Land on this moon first.' };
  if (c.dead) return { ok: false, why: 'You are dead.' };
  if ((c.quotaIndex | 0) < (c.minQ | 0)) return { ok: false, why: 'Locked: this zone opens in a later quota.' };
  if (c.st?.s === 'own') return { ok: false, why: 'Already yours.' };
  if (c.dist > ZN.plantR) return { ok: false, why: 'Stand next to the core.' };
  if ((c.owned | 0) >= maxOwned(c.quotaIndex)) return { ok: false, why: 'Zone limit reached for this quota.' };
  if (c.hostileNear) return { ok: false, why: 'Hostiles near the core. Clear the area first.' };
  if ((c.clearT || 0) < ZN.clearSec) return { ok: false, why: 'Keep the area clear: the relay is still scanning.' };
  if ((c.credits | 0) < c.cost) return { ok: false, why: 'Not enough credits for a beacon.' };
  return { ok: true };
}
/** advance the "area clear" timer: any hostile within clearR resets it */
export const stepClear = (t, dt, hostileNear) => (hostileNear ? 0 : Math.min(ZN.clearSec + 5, (t || 0) + dt));
export function canBuild(c) {
  const def = DEFS[c.def];
  if (!def) return { ok: false, why: 'Unknown defence.' };
  if (c.st?.s !== 'own') return { ok: false, why: 'Capture the zone first.' };
  if (!!def.in !== !!c.interior) return { ok: false, why: def.in ? 'Traps only work inside a facility wing.' : 'Not for a facility wing: build traps there.' };
  if (c.dist > ZN.zoneR) return { ok: false, why: 'Stand inside the zone.' };
  if ((c.quotaIndex | 0) < def.minQ) return { ok: false, why: 'Not unlocked yet (later quota).' };
  if (defCount(c.st) >= slotsOf(c.st)) return { ok: false, why: 'No free defence slot: upgrade the zone.' };
  if ((c.credits | 0) < def.cost) return { ok: false, why: 'Not enough credits.' };
  return { ok: true };
}

// ------------------------------------------------------------------ counter-attack
export const crewFactor = (crew) => (crew <= 1 ? 0.75 : crew === 2 ? 1 : 1 + 0.12 * (crew - 2));
export function wavePowerMean(threat, qi, crew = 1) { return (10 + 9 * threat) * (1 + 0.1 * Math.max(0, qi | 0)) * crewFactor(crew); }
export const wavePower = (threat, qi, crew, rnd) => wavePowerMean(threat, qi, crew) * (ZN.waveJitter[0] + (ZN.waveJitter[1] - ZN.waveJitter[0]) * clamp(rnd, 0, 1));
/** win probability of the auto-resolve: defence >= wave * jitter, jitter uniform in waveJitter */
export function winChance(def, threat, qi, crew = 1) {
  return DC.winOdds(def, wavePowerMean(threat, qi, crew), ZN.waveJitter);
}
export function resolveAuto(def, threat, qi, crew, rnd) {
  const w = wavePower(threat, qi, crew, rnd);
  const win = def >= w;
  return { win, wave: Math.round(w * 10) / 10, def, credits: win ? Math.round(w * ZN.winBonusMul) : 0 };
}
/** the Algorithm picks 1-2 owned, active, non-infected zones (never before quota 2). rng = RNG. Returns [{m, z}] */
export function pickAttacks(zn, qi, rng, isActive = () => true) {
  if ((qi | 0) < ZN.attackMinQuota) return [];
  const cand = listZones(zn, isActive).filter((e) => e.active && e.st.s === 'own');
  if (!cand.length) return [];
  const n = cand.length >= 4 && rng.chance(0.35) ? 2 : 1;
  const out = [];
  const pool = cand.slice();
  for (let i = 0; i < n && pool.length; i++) { const k = Math.floor(rng.next() * pool.length); const e = pool.splice(k, 1)[0]; out.push({ m: e.m, z: e.z }); }
  return out;
}
/** live defence wave composition: reuses siege_core (siegePower + planWave); 2 waves */
export function liveWaves(threat, qi, crew) {
  const P = clamp(siegePower({ quotaIndex: qi, crew, threat: clamp(threat * 10, 0, 100), reason: 'night' }).power * (0.7 + 0.08 * threat), 0.75, 3.4);
  const W = 2;
  return { P, W, waves: [planWave(1, W, P), planWave(2, W, P)] };
}
export { SG };

// ------------------------------------------------------------------ Algorithm intercom lines (English source; TR/RU in zones_i18n.js)
export const LINE_KEYS = {
  vote: ['The viewers voted for {z} on {m}. Thank you for your engagement.', 'Chat is bored. {z} on {m} will be attacked. Please do not defend it too well.', 'Poll closed: {z} ({m}). 71% wanted to see it burn.'],
  held: ['{z} on {m} held. Ratings are down. I am not angry, I am disappointed.', 'Impressive defence of {z}. The viewers demand a rematch.'],
  lost: ['{z} on {m} is infected. Content will be restored. Eventually.', 'You lost {z} ({m}). Chat is calling it "peak television".'],
  cap: ['Passive income capped for today. The Company does not pay for idleness.'],
  live: ['Live event: {z} is under attack. Viewer count rising.'],
  taken: ['You planted a beacon on {z}. I have logged it. I log everything.'],
};
export const pickLine = (kind, seed) => { const a = LINE_KEYS[kind] || LINE_KEYS.vote; return a[(seed >>> 0) % a.length]; };

// ------------------------------------------------------------------ terrain reachability (shared by the game module and the node test)
/** flood-fill from the ship (world origin) over the height grid of a Terrain (heights / res / half / step); lim = max height step per cell, ban(h) = unwalkable height. Returns (x, z) => bool */
export function terrainReach(t, lim, ban) {
  const W = t.res + 1, H = t.heights, seen = new Uint8Array(W * W), ci = Math.round(t.half / t.step), s0 = ci * W + ci;
  const st = [s0]; seen[s0] = 1;
  while (st.length) {
    const k = st.pop(), i = k % W, j = (k / W) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= W) continue;
      const nk = nj * W + ni;
      if (seen[nk] || ban(H[nk]) || Math.abs(H[nk] - H[k]) > lim * (di && dj ? 1.41 : 1)) continue;
      seen[nk] = 1; st.push(nk);
    }
  }
  return (x, z) => { const i = Math.round((x + t.half) / t.step), j = Math.round((z + t.half) / t.step); return i >= 0 && j >= 0 && i < W && j < W && !!seen[j * W + i]; };
}
/** the probe used for placeCores(): dry, gentle, reachable on foot from the ship */
export function coreProbe(ter) {
  const fl = ter.flood ?? null, reach = terrainReach(ter, ter.step * 1.0, (h) => fl != null && h < fl + 0.3);
  return (x, z) => {
    const h = ter.heightAt(x, z);
    if (fl != null && h < fl + 0.3) return false;
    if (ter.blocked(x, z, 2)) return false;
    for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (Math.abs(ter.heightAt(x + dx, z + dz) - h) > 2.4) return false;
    return reach(x, z);
  };
}
