// MOONS12 core (wave 12, docs/wave12/moons12.md): two moons that have their OWN GOAL instead of "collect scrap", registered at import on every peer. PURE: no three.js, no DOM.
//   c9sky   CLOUD-9           floating rocky islands over an endless white void (rope bridges, hover pads, wind gusts). GOAL: re-align 3 relay dishes (hold E) -> uplink bonus. Interior 'tower'.
//   dcable  DEEP CABLE        flooded seabed under a glass tunnel network (air meter, domes, dead server hulks). GOAL: carry 3 heavy DATA CORES to the ship; a carried core pulses a beacon. Interior 'serverfarm'.
// Terrain: the biomes carry a `terrainHook` (world/terrain.js calls it once per map): { shape(x, z, h), off?(x, z, m), plan }. The Cloud-9 hook turns the height field into islands + a void,
// the Deep Cable hook flattens the dome / tunnel corridors. Everything below is seeded and identical on every peer.
import { MOONS, BIOMES, registerMoon } from './moons.js';
import { RNG, hashString } from '../core/rng.js';
import { addTranslations, localizeFields } from '../core/i18n.js';
import { PALETTES } from './soul_core.js';
import { HOOKS, SILHOUETTE, ladderAdd } from './routeboard_core.js';
import { TX, textMaps } from './moons12_text.js';

const TAU = Math.PI * 2;
export const CLOUD = 'c9sky', CABLE = 'dcable';
export const MOON12_IDS = [CLOUD, CABLE];
export const isMoon12 = (id) => id === CLOUD || id === CABLE;
export const kindOf = (id) => (id === CLOUD ? 'c9' : id === CABLE ? 'dc' : null);
/** route-board rungs: Cloud-9 opens with the quota-3 rung, Deep Cable with the quota-4 rung */
export const CLOUD_RUNG = 3, CABLE_RUNG = 4;
export const BASE = -1.25;            // = terrain.js SHIP_FLAT_Y: every island rim / tunnel floor sits here so bridges and tubes can be level
export const VOID_Y = -130, FALL_Y = -14, CLIFF = 3.2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rd = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
const h01 = (n) => { let t = (n + 0x6d2b79f5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mod = (a, n) => ((a % n) + n) % n;

// ------------------------------------------------------------------------------------------------ rules (knobs)
/** gusts: everything in GAME MINUTES (run.time; 1 game minute is about 0.75 s of a normal day) so every peer sees the same gust */
export const WIND = { period: 21, tele: 2.4, dur: 7.5, push: 3.6, brace: 0.3, first: 3 };
/** relay dishes: deg/s, angle tolerance; the dish slows down near the target (the tell that you are close) */
export const DISH = { rate: 26, minRate: 7, tol: 2.5, reach: 3.6, hostReach: 5.2, count: 3 };
export const PAD = { charge: 0.9, cd: 2.2, r: 1.7 };
export const FALL = { fee: 40, dizzy: 6 };
/** deep cable: seconds of air, drain multipliers, refill per second, slowness in the water, drowning damage */
export const AIR = { max: 90, sprint: 1.7, carry: 1.6, dome: 45, tunnel: 12, slow: 0.8, hurt: 7, warn: 20, revive: 0.45 };
/** core beacon: a pulse every `period` s while a core is carried outdoors; `tele` s of warning before it; domes shield it */
export const BEACON = { period: 8, tele: 1.6, loud: 3.4, cap: 3, spawnEvery: 2 };
export const GOAL_N = 3;

export function payout(kind, quota) {
  const q = Math.max(60, quota | 0), r10 = (v) => Math.round(v / 10) * 10;
  if (kind === 'c9') return { step: r10(q * 0.06 + 20), final: r10(q * 0.34 + 90) };
  return { step: r10(q * 0.05 + 20), final: r10(q * 0.3 + 100), item: clamp(r10(q * 0.07 + 90), 110, 340) };
}
export const fallFee = (credits) => Math.min(Math.max(0, credits | 0), FALL.fee);

/** wind at game-minute m: { id, tele 0..1 (streaks before the push), k 0..1 strength, dx, dz } */
export function windAt(seed, m) {
  const P = WIND.period, k = Math.floor(m / P);
  const one = (n) => {
    const st = n * P + WIND.first + h01((seed | 0) * 31 + n * 7 + 1) * 6, a = h01((seed | 0) * 17 + n * 13 + 5) * TAU;
    const u = (m - st) / WIND.dur, tl = (m - (st - WIND.tele)) / WIND.tele;
    if (u >= 0 && u <= 1) return { id: n, tele: 1, k: Math.pow(Math.sin(Math.PI * u), 0.6), dx: Math.sin(a), dz: Math.cos(a) };
    if (tl >= 0 && tl < 1) return { id: n, tele: tl, k: 0, dx: Math.sin(a), dz: Math.cos(a) };
    return null;
  };
  return one(k) || one(k - 1) || { id: -1, tele: 0, k: 0, dx: 0, dz: 0 };
}
/** dish turning: remaining degrees `rem` (0..360] to the target -> deg/s */
export const dishRate = (rem) => clamp(rem * 0.9, DISH.minRate, DISH.rate);
/** integrate a turn of `dt` seconds. a = current deg, target = target deg. -> { a, locked } */
export function dishStep(a, target, dt) {
  let rem = mod(target - a, 360); if (rem === 0) rem = 360;
  if (rem <= DISH.tol || rem >= 360 - 0.01) return { a: target, locked: true };
  const nr = rem - dishRate(rem) * dt;
  if (nr <= DISH.tol) return { a: target, locked: true };
  return { a: mod(target - nr, 360), locked: false };
}
export const dishRem = (a, target) => { const r = mod(target - a, 360); return r === 0 ? 360 : r; };
export const bearingDeg = (dx, dz) => mod((Math.atan2(dx, dz) * 180) / Math.PI, 360);

// ------------------------------------------------------------------------------------------------ biomes
BIOMES.cloud9 = {
  name: 'Cloud-9 Sky Isles', ground: 'rock', ground2: 'sand', rock: 'rock', tint: 0xdcdde8, pathTint: 0xc4c7d6, rockTint: 0x8a90a8,
  sky: 0xf2f5ff, fog: 0xe8edfb, fogDensity: 0.0085, night: 0x0c1230, sun: 0xfff6e2, dusk: 0xff9cc0, hemiG: 0x9aa4c8, hemiW: 0.55, morn: 0.3,
  height: 5, rough: 0.5, trees: null, noBushes: true, step: 'concrete', planet: 0xdfe6ff, waterColor: 0xdfe6ff, decor: 'cloud9',
  poi: ['server_rack_prop', 'ruined_wall', 'generator', 'fence_segment', 'ext:barrier_jersey_broken', 'lamp_post'],
  landmarks: ['radio_tower', 'power_pylon'],
};
BIOMES.dcable = {
  name: 'Deep Cable Seabed', ground: 'mud', ground2: 'metal_plate', rock: 'rock', tint: 0x527f84, pathTint: 0x5f8c8c, rockTint: 0x2f4c58,
  sky: 0x0b4250, fog: 0x0a4c5b, fogDensity: 0.019, night: 0x021018, sun: 0x86dcec, dusk: 0x2ab4c4, hemiG: 0x0a2c36, hemiW: 0.34, morn: 0.35,
  height: 4, rough: 0.35, trees: null, noBushes: true, step: 'mud', planet: 0x2a9ab0, waterColor: 0x0a4c5b, decor: 'dcable',
  poi: ['server_rack_prop', 'shipping_container', 'oil_drum_stack', 'ext:barrier_jersey_broken', 'generator', 'fence_segment'],
  landmarks: ['power_pylon'],
};
PALETTES[CLOUD] = { biome: 'cloud9', sat: 1.05 };
PALETTES[CABLE] = { biome: 'dcable', sat: 1.1 };

// ------------------------------------------------------------------------------------------------ text + route-board card data
{ const { tr, ru } = textMaps(); addTranslations(tr, 'tr'); addTranslations(ru, 'ru'); }
HOOKS[CLOUD] = TX.c9_hook; HOOKS[CABLE] = TX.dc_hook;
// card art (viewBox 0 0 120 40, evenodd): three floating islands with a dish / a dome, a hulk and a cable
SILHOUETTE.cloud9 = 'M6 22h30l-4 6-6 3-6-3z M46 14h28l-4 6-5 3-6-3z M84 24h30l-4 6-6 3-6-3z M19 22V15h2v7z M14 12a6 3 0 0 1 12 0a6 3 0 0 1-12 0z M56 14v-5h2v5z M92 24v-6h2v6z M88 15h10v3H88z M36 26l10-9 M74 18l10 8';
SILHOUETTE.cable12 = 'M0 40V34Q10 30 20 34T40 34T60 34T80 34T100 34T120 34V40z M8 34a14 14 0 0 1 28 0z M52 34V22h34v12z M86 34l8-6h18v6z M60 22V14h4v8z M70 22V10h3v12z M14 34v-4h2v4z';

// ------------------------------------------------------------------------------------------------ moons
const FACILITY_POOL = { scuttler: 10, yoinker: 10, crawler: 10, lurker: 10, mannequin: 12, sludge: 6, spider: 8, leech: 6, jester: 12, screamer: 10, mimic: 10, turret: 8, mine: 8 };
if (!MOONS[CLOUD]) {
  const m = registerMoon({
    id: CLOUD, name: 'CLOUD-9', short: 'C9', tier: 3, cost: 420, biome: 'cloud9', interior: 'tower', size: 1.1, mapScale: 1.15, cardSil: 'cloud9', landmarkBonus: 0, ponds: 0,
    desc: TX.c9_desc[0], weather: ['clear', 'clear', 'clear', 'foggy', 'eclipsed'], scrapCount: [8, 11], scrapMul: 1.5, power: 6, outdoorPower: 0,
    creatures: { ...FACILITY_POOL }, outdoor: {}, goal: 'uplink',
  });
  localizeFields(m, ['name', 'desc', 'short']);
  ladderAdd(CLOUD_RUNG, [CLOUD]);
}
if (!MOONS[CABLE]) {
  const m = registerMoon({
    id: CABLE, name: 'DEEP CABLE', short: 'CABLE', tier: 4, cost: 780, biome: 'dcable', interior: 'serverfarm', size: 1.3, mapScale: 1.1, cardSil: 'cable12', landmarkBonus: 0, ponds: 0,
    desc: TX.dc_desc[0], weather: ['clear', 'clear', 'foggy'], scrapCount: [15, 21], scrapMul: 1.7, power: 8, outdoorPower: 5,
    creatures: { ...FACILITY_POOL, sludge: 10, leech: 10 }, outdoor: { sandkefal: 8, hound: 8, mimic: 3 }, goal: 'cores',
  });
  localizeFields(m, ['name', 'desc', 'short']);
  ladderAdd(CABLE_RUNG, [CABLE]);
}

// ================================================================================================ CLOUD-9 layout
const rad = (o, th) => o.r * (1 + o.a1 * Math.sin(3 * th + o.ph) + o.a2 * Math.sin(5 * th + o.ph2));
/** signed distance to the island rim (negative = inside) */
export const islEdge = (o, x, z) => { const dx = x - o.x, dz = z - o.z; return Math.hypot(dx, dz) - rad(o, Math.atan2(dz, dx)); };

/** ctx = { seed, plan: { entrance, fires }, half } */
export function planCloud(ctx) {
  const seed = ctx.seed | 0, half = ctx.half, e = ctx.plan.entrance, fires = ctx.plan.fires || [];
  const R0 = new RNG(hashString(`moons12|c9|${seed}`));
  const lim = half * 0.74;
  const islands = [];
  const mk = (kind, x, z, r, R) => {
    const o = { id: islands.length, kind, x: rd(x), z: rd(z), r, ph: rd(R.float(0, TAU)), ph2: rd(R.float(0, TAU)), a1: rd(R.float(0.06, 0.13)), a2: rd(R.float(0.03, 0.07)) };
    islands.push(o); return o;
  };
  const gapTo = (o, x, z, r) => Math.hypot(x - o.x, z - o.z) - o.r * 1.13 - r;   // 1.13: the harmonics can bulge the rim
  const ship = mk('ship', 0, 0, 25, R0.fork('ship'));
  const door = mk('door', e.x, e.z, 24, R0.fork('door'));
  fires.forEach((f, i) => {   // a fire exit that would hang in the void gets its own islet
    if (islands.some((o) => Math.hypot(f.x - o.x, f.z - o.z) < o.r * 0.7)) return;
    mk('fire', f.x, f.z, 10.5, R0.fork('fire' + i));
  });
  // three dish islands, each hung off an existing island 11-22 m from its rim
  const Rd = R0.fork('dish');
  const dishIsl = [];
  for (let k = 0; k < DISH.count; k++) {
    let placed = null;
    for (let tr = 0; tr < 700 && !placed; tr++) {
      const relax = tr > 400 ? 1.18 : 1;
      const par = islands[Rd.int(0, islands.length - 1)];
      if (par.kind === 'fire') continue;
      const a = Rd.float(0, TAU), r = Rd.float(13, 17), gap = Rd.float(11, 22 - (tr > 400 ? 6 : 0));
      const d = par.r * 1.05 + r + gap, x = par.x + Math.cos(a) * d, z = par.z + Math.sin(a) * d;
      if (Math.abs(x) > lim * relax || Math.abs(z) > lim * relax || Math.hypot(x, z) < 48) continue;
      if (islands.some((o) => gapTo(o, x, z, r * 1.13) < 7)) continue;
      placed = { par, x, z, r };
    }
    if (!placed) { const a = (k / DISH.count) * TAU + 0.6, d = lim * 0.9; placed = { par: ship, x: Math.cos(a) * d, z: Math.sin(a) * d, r: 14 }; }
    const o = mk('dish', placed.x, placed.z, placed.r, Rd.fork('i' + k)); o.par = placed.par.id; dishIsl.push(o);
  }
  // links
  const links = [], have = new Set();
  const key = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
  const geo = (A, B, type) => {
    const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
    const ra = rad(A, Math.atan2(uz, ux)), rb = rad(B, Math.atan2(-uz, -ux));
    const L = { a: A.id, b: B.id, type, yaw: rd(Math.atan2(ux, uz), 3), gap: rd(d - ra - rb, 1) };
    L.ax = rd(A.x + ux * ra * 0.83); L.az = rd(A.z + uz * ra * 0.83); L.bx = rd(B.x - ux * rb * 0.83); L.bz = rd(B.z - uz * rb * 0.83);
    L.len = rd(Math.hypot(L.bx - L.ax, L.bz - L.az), 1);
    if (type === 'pad') {   // two pads: each one 20 % inside its own rim, lands 45 % inside the other island
      L.pa = { x: rd(A.x + ux * ra * 0.78), z: rd(A.z + uz * ra * 0.78), tx: rd(B.x - ux * rb * 0.55), tz: rd(B.z - uz * rb * 0.55), yaw: L.yaw };
      L.pb = { x: rd(B.x - ux * rb * 0.78), z: rd(B.z - uz * rb * 0.78), tx: rd(A.x + ux * ra * 0.55), tz: rd(A.z + uz * ra * 0.55), yaw: rd(L.yaw + Math.PI, 3) };
    }
    return L;
  };
  const link = (A, B, forcePad = false) => {
    if (A.id === B.id || have.has(key(A.id, B.id))) return null;
    const d = Math.hypot(B.x - A.x, B.z - A.z), gap = d - A.r - B.r;
    have.add(key(A.id, B.id));
    if (gap <= 1.5) return null;   // touching islands need no crossing
    const pad = forcePad || gap > 24 || (gap > 14 && Rd.chance(0.3) && !links.some((l) => l.type === 'pad'));
    const L = geo(A, B, pad ? 'pad' : 'bridge'); links.push(L); return L;
  };
  link(ship, door);
  for (const o of dishIsl) link(islands[o.par], o);
  for (const o of islands) if (o.kind === 'fire') {   // a fire islet hangs off its nearest neighbour
    let best = null, bd = 1e9;
    for (const q of islands) { if (q.id === o.id) continue; const d = Math.hypot(q.x - o.x, q.z - o.z) - q.r; if (d < bd) { bd = d; best = q; } }
    if (best) link(best, o);
  }
  // one shortcut so the chain has a loop (falls are punishing, dead ends are not fun)
  let shortcut = false;
  for (const a of dishIsl) {
    if (shortcut) break;
    for (const b of islands) {
      if (a.id === b.id || have.has(key(a.id, b.id))) continue;
      const gap = Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
      if (gap > 5 && gap < 19) { const L = link(a, b); if (L) { L.shortcut = 1; shortcut = true; break; } }
    }
  }
  // dishes: chain d0 -> d1 -> d2 -> the mast on the ship island; start angles 110-250 deg away from the target
  const Ma = Rd.float(0, TAU), mast = { x: rd(Math.cos(Ma) * 15), z: rd(Math.sin(Ma) * 15) };
  const dishes = dishIsl.map((o, i) => {
    const nx = i < dishIsl.length - 1 ? dishIsl[i + 1] : mast;
    const target = rd(bearingDeg(nx.x - o.x, nx.z - o.z), 1), start = rd(mod(target - Rd.float(110, 250), 360), 1);
    const ca = Rd.float(0, TAU);
    return { i, isl: o.id, x: o.x, z: o.z, tx: rd(nx.x), tz: rd(nx.z), target, start, console: { x: rd(o.x + Math.cos(ca) * 5.2), z: rd(o.z + Math.sin(ca) * 5.2), yaw: rd(Math.atan2(-Math.cos(ca), -Math.sin(ca)), 3) } };
  });
  // far scenery: drifting rocks (visual only), never near an island
  const Rr = R0.fork('rocks'), rocks = [];
  for (let k = 0, g = 0; k < 16 && g < 300; g++) {
    const a = Rr.float(0, TAU), d = Rr.float(0.7, 1.55) * half, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (islands.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 14)) continue;
    k++; rocks.push({ x: rd(x), y: rd(Rr.float(-22, 24)), z: rd(z), s: rd(Rr.float(2.5, 9)), ry: rd(Rr.float(0, TAU)) });
  }
  return { islands, links, dishes, mast, rocks, ship: ship.id, door: door.id, lim };
}

/** the terrain hook: islands over a void. h is the raw height (ship / entrance flats already applied) */
function cloudHook(ctx) {
  const P = planCloud(ctx), isl = P.islands;
  const shape = (x, z, h) => {
    let best = VOID_Y;
    for (const o of isl) {
      const far = o.r * 1.4 + 42;
      if (Math.abs(x - o.x) > far || Math.abs(z - o.z) > far) continue;
      const e = islEdge(o, x, z);
      let y;
      if (e <= 0) {
        const t = sm((-e - 0.3 * o.r) / (0.3 * o.r));
        y = BASE + (clamp(h, BASE - 0.8, BASE + 3.4) - BASE) * t;
        if (o.kind === 'dish') y = BASE + 0.3 + (y - BASE - 0.3) * sm((Math.hypot(x - o.x, z - o.z) - 5) / 6);
      } else y = BASE - CLIFF * e;
      if (y > best) best = y;
    }
    return Math.max(best, VOID_Y);
  };
  const off = (x, z, m = 0) => { for (const o of isl) if (islEdge(o, x, z) < -(m + 1.5)) return false; return true; };
  return { shape, off, plan: P };
}
BIOMES.cloud9.terrainHook = cloudHook;

/** is (x, z) on an island (ignores bridges) -> island or null */
export const islandAt = (P, x, z) => { for (const o of P.islands) if (islEdge(o, x, z) < 0) return o; return null; };
export const nearestBridgeDist = (P, x, z) => {
  let best = 1e9;
  for (const l of P.links) {
    if (l.type !== 'bridge') continue;
    const abx = l.bx - l.ax, abz = l.bz - l.az, t = clamp(((x - l.ax) * abx + (z - l.az) * abz) / (abx * abx + abz * abz || 1), 0, 1);
    best = Math.min(best, Math.hypot(x - (l.ax + abx * t), z - (l.az + abz * t)));
  }
  return best;
};
/** on something solid: an island or a bridge deck (used by the fall test in node and by the debug API) */
export const solidAt = (P, x, z) => !!islandAt(P, x, z) || nearestBridgeDist(P, x, z) < 1.4;

// ================================================================================================ DEEP CABLE layout
const segDist = (x, z, ax, az, bx, bz) => { const abx = bx - ax, abz = bz - az, t = clamp(((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz || 1), 0, 1); return { d: Math.hypot(x - (ax + abx * t), z - (az + abz * t)), t }; };

/** ctx = { seed, plan: { entrance, fires }, half } */
export function planCable(ctx) {
  const seed = ctx.seed | 0, half = ctx.half, e = ctx.plan.entrance, fires = ctx.plan.fires || [];
  const R0 = new RNG(hashString(`moons12|dc|${seed}`));
  const el = Math.hypot(e.x, e.z), ux = e.x / el, uz = e.z / el;
  const side = R0.sign(), hub = { id: 0, kind: 'hub', x: rd(e.x * 0.55 - uz * 16 * side), z: rd(e.z * 0.55 + ux * 16 * side), r: 9 };
  const domes = [hub];
  const lim = half * 0.78, wrecks = [];
  const Rw = R0.fork('wrecks'), a0 = Rw.float(0, TAU);
  const okWreck = (x, z) => {
    if (Math.hypot(x, z) < 42 || Math.hypot(x - e.x, z - e.z) < 42 || Math.hypot(x - hub.x, z - hub.z) < 30) return false;
    if (segDist(x, z, 0, 0, e.x, e.z).d < 24) return false;
    for (const f of fires) if (Math.hypot(x - f.x, z - f.z) < 24) return false;
    for (const w of wrecks) if (Math.hypot(x - w.x, z - w.z) < 50) return false;
    return true;
  };
  for (let k = 0; k < GOAL_N; k++) {
    let ok = null;
    for (let tr = 0; tr < 400 && !ok; tr++) {
      const a = a0 + (k * TAU) / GOAL_N + Rw.float(-0.5, 0.5) * (tr > 200 ? 2 : 1), d = Rw.float(60, 92) * (tr > 300 ? 0.85 : 1), x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x) > lim || Math.abs(z) > lim || !okWreck(x, z)) continue;
      ok = { x, z };
    }
    if (!ok) { const a = a0 + (k * TAU) / GOAL_N, d = Math.min(lim, 70); ok = { x: Math.cos(a) * d, z: Math.sin(a) * d }; }
    const len = rd(Rw.float(34, 42), 1), wid = rd(Rw.float(12, 15), 1), hei = rd(Rw.float(8, 11), 1);
    const dx = hub.x - ok.x, dz = hub.z - ok.z, dl = Math.hypot(dx, dz), yaw = rd(Math.atan2(dx, dz), 3), fx = dx / dl, fz = dz / dl;   // local +z points at the hub: the bay mouth faces it
    const mouth = { x: rd(ok.x + fx * (len / 2)), z: rd(ok.z + fz * (len / 2)) };
    const core = { x: rd(ok.x + fx * (len / 2 - 4)), z: rd(ok.z + fz * (len / 2 - 4)) };
    const w = { id: k, x: rd(ok.x), z: rd(ok.z), yaw, len, wid, hei, mouth, core };
    wrecks.push(w);
    domes.push({ id: domes.length, kind: 'wreck', x: rd(mouth.x + fx * (24 + 8)), z: rd(mouth.z + fz * (24 + 8)), r: 8, wreck: k });
  }
  // tunnels: ship stub -> hub, hub -> entrance stub, hub -> each wreck dome; every one has a breach (8 m without air / glass) somewhere in the middle
  const tunnels = [];
  const Rt = R0.fork('tunnels');
  const addT = (ax, az, bx, bz, kind) => {
    const len = Math.hypot(bx - ax, bz - az); if (len < 6) return;
    const c0 = 0.4 + Rt.float(0, 0.2), half8 = 4 / len;   // only long tunnels have a breach
    tunnels.push({ id: tunnels.length, kind, ax: rd(ax), az: rd(az), bx: rd(bx), bz: rd(bz), len: rd(len, 1), yaw: rd(Math.atan2(bx - ax, bz - az), 3), breach: len >= 26 ? [rd(c0 - half8, 3), rd(c0 + half8, 3)] : null });
  };
  const toward = (fx0, fz0, tx, tz, dist) => { const dx = tx - fx0, dz = tz - fz0, d = Math.hypot(dx, dz) || 1; return { x: fx0 + (dx / d) * dist, z: fz0 + (dz / d) * dist }; };
  { const s = toward(0, 0, hub.x, hub.z, 14), h = toward(hub.x, hub.z, s.x, s.z, hub.r - 0.5); addT(s.x, s.z, h.x, h.z, 'ship'); }
  { const s = toward(e.x, e.z, hub.x, hub.z, 12), h = toward(hub.x, hub.z, s.x, s.z, hub.r - 0.5); addT(h.x, h.z, s.x, s.z, 'door'); }
  for (const d of domes) if (d.kind === 'wreck') { const a = toward(hub.x, hub.z, d.x, d.z, hub.r - 0.5), b = toward(d.x, d.z, hub.x, hub.z, d.r - 0.5); addT(a.x, a.z, b.x, b.z, 'wreck'); }
  // kelp of cables + a few vent stacks (visual), seeded
  const Rk = R0.fork('kelp'), kelp = [];
  for (let k = 0, g = 0; k < 64 && g < 400; g++) {
    const x = Rk.float(-lim, lim), z = Rk.float(-lim, lim);
    if (Math.hypot(x, z) < 24 || Math.hypot(x - e.x, z - e.z) < 18) continue;
    if (domes.some((d) => Math.hypot(x - d.x, z - d.z) < d.r + 3) || tunnels.some((t) => segDist(x, z, t.ax, t.az, t.bx, t.bz).d < 5)) continue;
    if (wrecks.some((w) => Math.hypot(x - w.x, z - w.z) < w.len * 0.62)) continue;
    k++; kelp.push({ x: rd(x), z: rd(z), n: Rk.int(3, 5), h: rd(Rk.float(4, 9)), ry: rd(Rk.float(0, TAU)) });
  }
  return { hub, domes, tunnels, wrecks, kelp, lim, side };
}
/** air at (x, z): 2 = inside a dome (refills fast, shields a core's beacon), 1 = inside an intact tunnel (refills slowly), 0 = the water */
export function airAt(P, x, z) {
  for (const d of P.domes) if ((x - d.x) ** 2 + (z - d.z) ** 2 < (d.r - 0.4) ** 2) return 2;
  for (const t of P.tunnels) {
    const s = segDist(x, z, t.ax, t.az, t.bx, t.bz);
    if (s.d < 2.3 && !(t.breach && s.t > t.breach[0] && s.t < t.breach[1])) return 1;
  }
  return 0;
}
function cableHook(ctx) {
  const P = planCable(ctx);
  const shape = (x, z, h) => {
    let w = 0;
    for (const d of P.domes) { const dd = Math.hypot(x - d.x, z - d.z); if (dd < d.r + 9) w = Math.max(w, 1 - sm((dd - d.r - 1) / 7)); }
    for (const t of P.tunnels) { const s = segDist(x, z, t.ax, t.az, t.bx, t.bz); if (s.d < 8) w = Math.max(w, 1 - sm((s.d - 3.4) / 4.2)); }
    return w > 0 ? h + (BASE - h) * w : h;
  };
  return { shape, plan: P };
}
BIOMES.dcable.terrainHook = cableHook;
