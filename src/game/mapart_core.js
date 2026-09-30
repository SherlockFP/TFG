// MAPART core (wave 6, pure: no three.js / DOM, node-tested by tools/harness/mapart.test.mjs).
// The "signature layer" of every regular outdoor moon: The Algorithm's presence (broadcast pylons, LIVE holo-panels, camera drones,
// glitch scars, ad billboards) + the Company's decay (crashed pods, survey rigs, crew camps + journals, warning signs, quarantine tape)
// + ONE big biome landmark per map. planMapArt() is deterministic per (moonId, seed): every peer rebuilds the same layout.
// Interaction rules (host-authoritative, applied by src/game/mapart.js): sabotage a pylon -> 60 s "off-stream", shoot / hit a billboard ->
// silenced, knock a camera drone down (3 hits) -> a component drops.
import { RNG, hashString } from '../core/rng.js';

export const OFF_SEC = 60;          // off-stream window per pylon sabotage
export const DRONE_HP = 3;
export const REACH = { use: 4.2, melee: 4.6, shot: 90 };
export const GUARD = { landing: 34, entrance: 30, fire: 16, pond: 7, lake: 4, path: 5.5, gap: 2.5 };
/** what a knocked-down drone may drop (component ids from components.js) */
export const DRONE_LOOT = ['comp_circuit', 'comp_sensor', 'comp_battery', 'comp_cable', 'comp_circuit'];

/** landmark family per outdoor biome decor (fallback: biome id, then 'dish') */
export const FAMILY_BY_DECOR = {
  datascape: 'monolith', vyneon: 'monolith', twinsun: 'monolith', crystal: 'monolith', vycrys: 'monolith',
  ice: 'datafall', m5cold: 'datafall', soviet: 'datafall', vysky: 'datafall', vystorm: 'datafall',
  ashfield: 'crane', lava: 'crane', vyrust: 'crane',
  jungle: 'fungal', vyfung: 'fungal', servermarsh: 'fungal', vyacid: 'fungal', m5estate: 'fungal',
  vybone: 'dish',
};
export const FAMILY_BY_BIOME = { hills: 'dish', swamp: 'fungal', snow: 'datafall', desert: 'crane', moor: 'dish', blackforest: 'monolith', pier: 'crane' };
export const FAMILIES = ['monolith', 'datafall', 'crane', 'fungal', 'dish'];
export const FAMILY_RADIUS = { monolith: 15, datafall: 13, crane: 12, fungal: 15, dish: 14 };
export const familyOf = (decor, biomeId) => FAMILY_BY_DECOR[decor] || FAMILY_BY_BIOME[biomeId] || 'dish';

/** cell layout of the shared 2D-art atlas (src/game/mapart_art.js): 8 ads, broken ad, 4 signs, tape, 8 holo variants, 4 pod stencils */
export const CELL = { ad: 0, adCount: 8, broken: 8, sign: 9, signCount: 4, tape: 13, holo: 14, holoCount: 8, pod: 22, podCount: 4 };

const TAU = Math.PI * 2;
const d2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

/**
 * planMapArt(o) -> specs[]
 *   o = { seed, moonId, decor, biomeId, sc, plan:{entrance,fires,ponds,lakes}, pathPts:[{x,z}], heightAt(x,z), ok(x,z,margin)->bool (engine placement guard),
 *         extraOk?(x,z,r)->bool, floodY? }
 * Each spec: { id, kind, x, y, z, yaw, r, ...kind fields }.
 */
export function planMapArt(o) {
  const R = new RNG(hashString(`mapart|${o.moonId}|${o.seed | 0}`));
  const sc = Math.max(0.6, +o.sc || 1), big = sc > 1.2;   // [pacing] compact maps have sc < 1
  const plan = o.plan || {};
  const lim = 118 * sc;
  const specs = [];
  const h = o.heightAt;
  const fam = familyOf(o.decor, o.biomeId);
  const guard = (x, z, r) => {
    if (Math.hypot(x, z) < GUARD.landing + r) return false;
    const e = plan.entrance;
    if (e && d2(x, z, e.x, e.z) < GUARD.entrance + r) return false;
    for (const f of plan.fires || []) if (d2(x, z, f.x, f.z) < GUARD.fire + r) return false;
    for (const p of plan.ponds || []) if (d2(x, z, p.x, p.z) < p.r * 1.4 + GUARD.pond + r) return false;
    for (const l of plan.lakes || []) if (d2(x, z, l.x, l.z) < l.r + GUARD.lake + r) return false;
    for (const s of specs) if (d2(x, z, s.x, s.z) < s.r + r + GUARD.gap) return false;
    return true;
  };
  const flat = (x, z, r, maxDy) => {
    const y0 = h(x, z);
    if (o.floodY != null && y0 < o.floodY + 0.5) return null;
    const rr = Math.min(r * 0.7, 6);
    let lo = y0, hi = y0;
    for (let k = 0; k < 4; k++) { const y = h(x + Math.cos(k * TAU / 4) * rr, z + Math.sin(k * TAU / 4) * rr); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    return hi - lo <= maxDy ? y0 : null;
  };
  const accept = (x, z, r, maxDy) => {
    if (Math.abs(x) > lim || Math.abs(z) > lim) return null;
    if (!guard(x, z, r)) return null;
    if (o.ok && o.ok(x, z, r)) return null;   // engine guard says "blocked"
    if (o.extraOk && !o.extraOk(x, z, r)) return null;
    return flat(x, z, r, maxDy);
  };
  const add = (kind, x, y, z, yaw, r, extra = {}) => {
    const s = { id: '', kind, x, y, z, yaw, r, ...extra };
    const n = specs.filter((q) => q.kind === kind).length;
    s.id = kind.slice(0, 3) + n;
    specs.push(s);
    return s;
  };
  const free = (r, minD, maxD, maxDy, tries = 60) => {
    for (let t = 0; t < tries; t++) {
      const a = R.float(0, TAU), d = R.float(minD, maxD) * sc;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const y = accept(x, z, r, maxDy);
      if (y != null) return { x, y, z };
    }
    return null;
  };
  // point beside the walking path (billboards / signs face the walkers)
  const pathSpot = (lateral, r, maxDy, tries = 50) => {
    const P = o.pathPts || [];
    if (P.length < 8) return null;
    for (let t = 0; t < tries; t++) {
      const k = R.int(3, P.length - 4);
      const p = P[k], q = P[k + 1], w = P[k - 1];
      if (Math.hypot(p.x, p.z) < 40) continue;
      const tx = q.x - w.x, tz = q.z - w.z, tl = Math.hypot(tx, tz) || 1;
      const side = R.chance(0.5) ? 1 : -1, lat = lateral * R.float(0.9, 1.3);
      const x = p.x + (-tz / tl) * side * lat, z = p.z + (tx / tl) * side * lat;
      const y = accept(x, z, r, maxDy);
      if (y != null) return { x, y, z, yaw: Math.atan2(p.x - x, p.z - z), pk: k };
    }
    return null;
  };

  // 1. the one big biome landmark (two on big maps): planned first so it gets the best spot
  const lmR = FAMILY_RADIUS[fam];
  for (let i = 0; i < (big ? 2 : 1); i++) {
    const s = free(lmR, 58, 108, fam === 'dish' ? 3.2 : 2.4, 90);
    if (s) add('landmark', s.x, s.y, s.z, R.float(0, TAU), lmR, { fam, seed: R.int(1, 1e9) });
  }
  // 2. The Algorithm's presence
  for (let i = 0; i < (big ? 3 : 2); i++) {
    const s = free(3, 42, 112, 2.2, 60);
    if (s) add('pylon', s.x, s.y, s.z, R.float(0, TAU), 3, { h: R.float(20, 27) });
  }
  const nPanel = 3 + (big ? 2 : 0);
  for (let i = 0; i < nPanel; i++) {
    const s = free(2.5, 36, 118, 3, 40);
    if (s) add('panel', s.x, s.y + R.float(3.4, 5.4), s.z, R.float(0, TAU), 2.5, { w: 3.4, v: R.int(0, CELL.holoCount - 1), gy: s.y });
  }
  for (let i = 0; i < (big ? 5 : 3); i++) {
    const s = free(2, 30, 120, 6, 40);
    if (s) add('drone', s.x, s.y + R.float(3.4, 5.6), s.z, R.float(0, TAU), 2, { gy: s.y });
  }
  const adPool = Array.from({ length: CELL.adCount }, (_, i) => i);
  for (let i = adPool.length - 1; i > 0; i--) { const j = R.int(0, i); [adPool[i], adPool[j]] = [adPool[j], adPool[i]]; }
  for (let i = 0; i < (big ? 5 : 3); i++) {
    const s = pathSpot(11, 4.5, 2.4);
    if (s) add('billboard', s.x, s.y, s.z, s.yaw, 4.5, { ad: adPool[i % adPool.length], w: 7.2, hh: 3.6, post: 2.7 });
  }
  const nScar = 0;   // wave 8: glitch scars removed (owner: unreadable walk-through magenta/cyan patches that did not fit the game)
  for (let i = 0; i < nScar; i++) {
    const s = free(6, 34, 118, 3, 40);
    if (!s) continue;
    const rad = R.float(2.6, 5.2), cells = [];
    const n = R.int(26, 42);
    for (let k = 0; k < n; k++) {
      const a = R.float(0, TAU), d = Math.sqrt(R.float(0, 1)) * rad;
      cells.push({ dx: Math.round(Math.cos(a) * d * 2) / 2, dz: Math.round(Math.sin(a) * d * 2) / 2, s: R.pick([0.5, 0.5, 1, 1.5]), h: R.chance(0.14) ? R.float(0.6, 2.2) : 0.08, c: R.int(0, 3) });
    }
    add('scar', s.x, s.y, s.z, 0, rad + 1, { rad, cells, tape: R.chance(0.6) });
  }
  // 3. The Company's decay
  for (let i = 0; i < 2; i++) {
    const s = free(5.5, 40, 112, 1.6, 60);
    if (s) add('pod', s.x, s.y, s.z, R.float(0, TAU), 5.5, { crew: R.int(0, CELL.podCount - 1), tilt: R.float(0.12, 0.3), num: R.int(100, 999) });
  }
  for (let i = 0; i < 2; i++) {
    const s = free(4, 36, 116, 1.6, 60);
    if (s) add('rig', s.x, s.y, s.z, R.float(0, TAU), 4);
  }
  for (let i = 0; i < (big ? 2 : 1); i++) {
    const s = free(6, 38, 108, 1.4, 70);
    if (s) add('camp', s.x, s.y, s.z, R.float(0, TAU), 6, { journal: R.int(0, 4) });
  }
  const nSign = 5 + (big ? 3 : 0);
  for (let i = 0; i < nSign; i++) {
    const s = pathSpot(7.5, 1.2, 2.2);
    if (s) add('sign', s.x, s.y, s.z, s.yaw, 1.2, { sign: R.int(0, CELL.signCount - 1) });
  }
  return specs;
}

// ------------------------------------------------------------------ interaction rules (host owns them; clients mirror the broadcasts)
export function newState(specs) {
  const st = { offUntil: 0, pylons: {}, drones: {}, boards: {}, loot: {} };
  for (const s of specs) {
    if (s.kind === 'pylon') st.pylons[s.id] = false;
    else if (s.kind === 'drone') st.drones[s.id] = DRONE_HP;
    else if (s.kind === 'billboard') st.boards[s.id] = false;
  }
  return st;
}
export const offActive = (st, now) => now < st.offUntil;
export const offLeft = (st, now) => Math.max(0, st.offUntil - now);
/** sabotage a pylon: once per pylon per map; sets / extends the off-stream window to `sec` from now */
export function sabotage(st, id, now, sec = OFF_SEC) {
  if (!(id in st.pylons)) return { ok: false, reason: 'unknown' };
  if (st.pylons[id]) return { ok: false, reason: 'done' };
  st.pylons[id] = true;
  st.offUntil = Math.max(st.offUntil, now + sec);
  return { ok: true, until: st.offUntil, sec: st.offUntil - now };
}
export function hitDrone(st, id, dmg = 1) {
  if (!(id in st.drones) || st.drones[id] <= 0) return { ok: false, reason: 'gone' };
  st.drones[id] = Math.max(0, st.drones[id] - dmg);
  return { ok: true, hp: st.drones[id], dead: st.drones[id] <= 0 };
}
export function hitBoard(st, id) {
  if (!(id in st.boards) || st.boards[id]) return { ok: false, reason: 'gone' };
  st.boards[id] = true;
  return { ok: true };
}
/** deterministic component for a drone id */
export function droneLoot(seed, id) { return DRONE_LOOT[hashString(`ma|loot|${seed | 0}|${id}`) % DRONE_LOOT.length]; }
/** Spawn suppression multiplier while off-stream: the host keeps its spawn timers from running out. */
export const SPAWN_HOLD = 3;
/** segment a->b passes within r of point c (all [x,y,z]) */
export function segNear(a, b, c, r) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const len2 = abx * abx + aby * aby + abz * abz;
  let u = len2 > 1e-9 ? ((c[0] - a[0]) * abx + (c[1] - a[1]) * aby + (c[2] - a[2]) * abz) / len2 : 0;
  u = Math.max(0, Math.min(1, u));
  const px = a[0] + abx * u - c[0], py = a[1] + aby * u - c[1], pz = a[2] + abz * u - c[2];
  return px * px + py * py + pz * pz <= r * r;
}
/** can a peer at `pp` ([x,y,z]) act on target `c` with the given reach? */
export const inReach = (pp, c, reach) => !!pp && Math.hypot(pp[0] - c[0], pp[1] - c[1], pp[2] - c[2]) <= reach;
