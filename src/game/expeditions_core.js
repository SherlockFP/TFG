// EXPEDITION MOONS (wave 8): pure rules + seeded layouts for three hand-designed special moons whose need and goal are not "loot a facility".
//   ex_barge  Sunken Server Barge   OXYGEN   flooded wreck, air pockets + bubble vents, currents, a trench eel; goal: 3 data cores back to the ship
//   ex_dune   Dune Relay Caravan    HEAT     sun / shade / canteens, a relay crawler to escort + repair over 3 checkpoints before the sandstorm; burrowers
//   ex_roof   Rooftop Blackout City POWER    planks + zip-lines between rooftops, a power cell you carry to relight 4 billboards; falls (downed rules), drones
// No three / rapier here: node-tested (tools/harness/expeditions.test.mjs). Plans are pure data in WORLD coordinates (every peer builds the same map).
// Solids are axis-aligned boxes { x0, x1, y0, y1, z0, z1, k } so the builder (world/expeditions_maps.js), the eel nav grid and the tests share one list.
import { RNG } from '../core/rng.js';

export const KINDS = ['barge', 'dune', 'roof'];
export const MOON_IDS = { barge: 'ex_barge', dune: 'ex_dune', roof: 'ex_roof' };
export const kindOf = (moonId) => (moonId === 'ex_barge' ? 'barge' : moonId === 'ex_dune' ? 'dune' : moonId === 'ex_roof' ? 'roof' : null);
export const SHIP_Y = -1.25;   // flat landing zone (world/terrain.js SHIP_FLAT_Y)
export const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sm01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------------------------------------ needs (rules)
/** OXYGEN: seconds of air; drains only while the eyes are under the water sheet and not in an air pocket / at a vent */
export const OXY = { max: 32, drain: 1, refill: 24, ventR: 2.1, tank: 26, hurt: 6, slow: 0.78, warn: 10, revive: 0.55 };
/** HEAT: 0..100; rises in the sun, falls in shade / the ship, canteens cool you down */
export const HEAT = { max: 100, gain: 1.15, shade: 2.6, ship: 3.4, canteen: 38, hot: 62, burn: 88, hurt: 3, slow: 0.93, revive: 0.5 };
/** POWER: cell charge 0..100 while somebody carries it; each billboard costs COST, a generator swap gives GAIN */
export const CELL = { max: 100, start: 100, drain: 0.34, cost: 24, gain: 46, genCd: 45, reach: 4.2, boards: 4 };
export const ZIP = { speed: 9.5, hang: 3.2, sag: 1.1, reach: 3.0, cd: 1.2 };
export const STORM = { from: 15 * 60, peak: 17 * 60 };   // game minutes (the day runs 08:00 to 24:00)
export const DUNE = { cwSpeed: 2.3, repSec: 11, repR: 8, escortR: 36, legs: 3, half: 136, play: 110, barrel: 2 };
export const BARGE = { seabed: -9, water: -3.4, wallH: 7.5, thick: 0.8, U: 36, V: 14, cores: 3 };

export const submerged = (eyeY, water = BARGE.water) => eyeY < water;
/** one oxygen tick. o: { sub, air (pocket / vent), tank }. returns { v, hurt } (hurt = at zero) */
export function oxyStep(v, dt, o = {}) {
  let n = v;
  if (o.tank) n = Math.min(OXY.max, n + OXY.tank);
  if (o.air || !o.sub) n = Math.min(OXY.max, n + OXY.refill * dt);
  else n = Math.max(0, n - OXY.drain * dt);
  return { v: n, hurt: o.sub && !o.air && n <= 0 };
}
/** sun strength 0..1 from the run clock (minutes): hot from the first minute, peak after noon, gone after 20:00 */
export function sunFactor(min) {
  if (min < 480) return 0.6;
  if (min <= 1140) return 0.65 + 0.35 * Math.sin(Math.PI * (min - 480) / 660);
  return Math.max(0, 0.65 * (1200 - min) / 60);
}
/** sandstorm strength 0..1 (dune moon): ramps from STORM.from to STORM.peak, then stays */
export const stormAt = (min) => sm01((min - STORM.from) / (STORM.peak - STORM.from));
export function heatStep(v, dt, o = {}) {
  let n = v;
  if (o.drink) n -= HEAT.canteen;
  if (o.ship) n -= HEAT.ship * dt;
  else if (o.shade) n -= HEAT.shade * dt;
  else n += HEAT.gain * clamp(o.sun ?? 1, 0, 1) * (1 - 0.7 * clamp(o.storm ?? 0, 0, 1)) * dt;
  n = clamp(n, 0, HEAT.max);
  return { v: n, hot: n >= HEAT.hot, burn: n >= HEAT.burn };
}
export const cellDrain = (v, dt, held) => (held ? Math.max(0, v - CELL.drain * dt) : v);

// ------------------------------------------------------------------------------------------------ economy (payouts scale with the quota)
/** credits + scrap values for a kind at the current quota. quota is run.quota (>= 1). */
export function payout(kind, quota) {
  const q = Math.max(60, quota | 0), r = (f, lo) => Math.max(lo, Math.round(q * f));
  if (kind === 'barge') return { step: r(0.09, 18), final: r(0.26, 60), item: r(0.13, 55), loot: r(0.04, 20) };
  if (kind === 'dune') return { step: r(0.09, 18), final: r(0.3, 70), item: r(0.06, 30), loot: r(0.05, 25) };
  return { step: r(0.08, 16), final: r(0.3, 70), item: r(0.05, 25), loot: r(0.04, 20) };
}
export const CONTRACT = { chance: 0.14, minQuota: 1 };
/** random "expedition contract" offer before the voyage unlock (quota 5): which kind is listed for this day, or null. Seeded: every peer agrees. */
export function contractRoll(seed, day, quotaIndex, ladderOpen) {
  if (ladderOpen || (quotaIndex | 0) < CONTRACT.minQuota) return null;
  const R = new RNG(((seed | 0) ^ Math.imul((day | 0) + 7, 0x9e3779b1) ^ 0xe0e0) >>> 0);
  if (!R.chance(CONTRACT.chance)) return null;
  return R.pick(KINDS);
}

// ------------------------------------------------------------------------------------------------ helpers for plans
const box = (x0, x1, y0, y1, z0, z1, k) => ({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0, y1, z0: Math.min(z0, z1), z1: Math.max(z0, z1), k });
export const inBox = (b, x, y, z, m = 0) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m && (y == null || (y >= b.y0 - m && y <= b.y1 + m));
/** runs of a wall along an axis with gaps [[a, b], ...]: returns [[from, to], ...] solid segments */
export function segs(a0, a1, gaps = []) {
  const cuts = [a0, ...gaps.flat(), a1], out = [];
  for (let i = 0; i < cuts.length; i += 2) if (cuts[i + 1] - cuts[i] > 0.05) out.push([cuts[i], cuts[i + 1]]);
  return out;
}
const gap = (c, w) => [c - w / 2, c + w / 2];
export const pointHitsSolid = (solids, x, y, z, m = 0) => solids.some((b) => inBox(b, x, y, z, m));

// ------------------------------------------------------------------------------------------------ BARGE
/** Sunken Server Barge: hull lying on the seabed (x-axis), decks / cabins, air pockets, bubble vents, currents, cores, tanks, eel lair. */
export function planBarge(seed) {
  const R = new RNG(((seed | 0) ^ 0xba46e5) >>> 0);
  const { seabed: sb, wallH: WH, thick: T, U, V } = BARGE;
  const sz = R.sign(), cx = Math.round(R.float(-12, 12)), cz = sz * Math.round(R.float(58, 62));
  const X = (u) => cx + u, Z = (v) => cz + v;
  const solids = [];
  const S = (u0, u1, v0, v1, y0, y1, k) => { solids.push(box(X(u0), X(u1), y0, y1, Z(v0), Z(v1), k)); };
  const vb = -sz * V;                       // wall facing the landing dock
  const ub = Math.round(R.float(-8, 8)), ua = Math.round(R.float(-32, -20)), vg = Math.round(R.float(-4, 4));
  const dvA = Math.round(R.float(-7, 7)), dvF = Math.round(R.float(-7, 7));
  // outer hull: two side walls (u along x), stern (solid) and bow (gap)
  const y0 = sb - 0.3, y1 = sb + WH;
  for (const v of [-V, V]) {
    const gaps = v === vb ? [gap(ub, 6)] : [gap(ua, 2.6)];
    for (const [a, b] of segs(-U, U, gaps)) S(a, b, v - T / 2, v + T / 2, y0, y1, 'hull');
  }
  S(-U - T / 2, -U + T / 2, -V, V, y0, y1, 'hull');
  for (const [a, b] of segs(-V, V, [gap(vg, 6)])) S(U - T / 2, U + T / 2, a, b, y0, y1, 'hull');
  // bulkheads (a little lower than the hull) with a door each
  for (const [u, dv] of [[-12, dvA], [12, dvF]]) for (const [a, b] of segs(-V, V, [gap(dv, 3.4)])) S(u - T / 2, u + T / 2, a, b, y0, sb + WH - 1, 'bulk');
  // aft SERVER DECK: slab 3.6 m up on pillars + a ramp from the mid section, a roofed server cabin on top (air pocket 1)
  const dY = sb + 3.6, deck = { u0: -35.2, u1: -23.6 };
  let vr = R.chance(0.5) ? 7 : -7; if (Math.abs(vr - dvA) < 4.4) vr = -vr;
  S(deck.u0, deck.u1, -V + 0.6, V - 0.6, dY - 0.3, dY, 'deck');
  for (const u of [-24.6, -34.4]) for (const v of [-11, 0, 11]) if (Math.abs(v - vr) > 2.4 || u < -30) S(u - 0.3, u + 0.3, v - 0.3, v + 0.3, sb, dY - 0.3, 'pillar');
  const ramp = { x: X(-13.6), z: Z(vr), y: sb, dir: 'x-', width: 2.4, rise: 3.6, run: 10.4 };   // top lands flush on the deck edge
  const cab = { u0: -33.8, u1: -26.2, v0: -4.4, v1: 4.4 }, dc = Math.round(R.float(-2, 2) * 2) / 2;
  const wt = 0.4;
  for (const v of [cab.v0, cab.v1]) S(cab.u0, cab.u1, v - wt / 2, v + wt / 2, dY, dY + 3.2, 'cabin');
  S(cab.u0 - wt / 2, cab.u0 + wt / 2, cab.v0, cab.v1, dY, dY + 3.2, 'cabin');
  for (const [a, b] of segs(cab.v0, cab.v1, [gap(dc, 1.9)])) S(cab.u1 - wt / 2, cab.u1 + wt / 2, a, b, dY, dY + 3.2, 'cabin');
  S(cab.u0 - wt / 2, cab.u1 + wt / 2, cab.v0 - wt / 2, cab.v1 + wt / 2, dY + 2.9, dY + 3.2, 'roof');
  const pockets = [{ id: 'server', x0: X(cab.u0 + wt / 2), x1: X(cab.u1 - wt / 2), z0: Z(cab.v0 + wt / 2), z1: Z(cab.v1 - wt / 2), y0: dY, y1: dY + 2.9 }];
  S(-33.4, -32.5, -3.8, -2.0, dY, dY + 2.2, 'rack'); S(-33.4, -32.5, 2.0, 3.8, dY, dY + 2.2, 'rack');
  // fore BRIDGE cabin (air pocket 2), open to the sea through a door on its aft face
  const br = { u0: 26.2, u1: 33.8, v0: -4.4, v1: 4.4 }, dcb = Math.round(R.float(-2, 2) * 2) / 2;
  for (const v of [br.v0, br.v1]) S(br.u0, br.u1, v - wt / 2, v + wt / 2, sb, sb + 3.2, 'cabin');
  S(br.u1 - wt / 2, br.u1 + wt / 2, br.v0, br.v1, sb, sb + 3.2, 'cabin');
  for (const [a, b] of segs(br.v0, br.v1, [gap(dcb, 1.9)])) S(br.u0 - wt / 2, br.u0 + wt / 2, a, b, sb, sb + 3.2, 'cabin');
  S(br.u0 - wt / 2, br.u1 + wt / 2, br.v0 - wt / 2, br.v1 + wt / 2, sb + 2.9, sb + 3.2, 'roof');
  pockets.push({ id: 'bridge', x0: X(br.u0 + wt / 2), x1: X(br.u1 - wt / 2), z0: Z(br.v0 + wt / 2), z1: Z(br.v1 - wt / 2), y0: sb, y1: sb + 2.9 });
  S(32.4, 33.2, -2.4, 2.4, sb, sb + 1.2, 'console');
  // mid CARGO HOLD: one row of containers per side (|v| ~ 9.2), an aisle behind them; core B sits in the aisle behind an open cell
  const sB = R.sign(), uB = R.pick([-4.4, 0, 4.4]);
  const conts = [];
  for (const side of [-1, 1]) for (const u of [-8.8, -4.4, 0, 4.4, 8.8]) {
    if (side === sB && Math.abs(u - uB) < 3) continue;
    if (side === Math.sign(vb) && Math.abs(u - ub) < 4.4) continue;   // keep the breach lane free
    if (!R.chance(0.78)) continue;
    const st = R.chance(0.35);
    conts.push({ u, v: side * 9.2, w: 4.2, d: 2.4, h: 2.6, stack: st });
    S(u - 2.1, u + 2.1, side * 9.2 - 1.2, side * 9.2 + 1.2, sb, sb + 2.6 + (st ? 2.6 : 0), 'container');
  }
  // seabed debris
  const rocks = [];
  for (let i = 0; i < 16; i++) {
    const a = R.float(0, TAU), d = R.float(24, 118), x = Math.cos(a) * d, z = Math.sin(a) * d, r = R.float(1.1, 2.6);
    if (Math.abs(x - cx) < U + 8 && Math.abs(z - cz) < V + 8) continue;
    if (Math.hypot(x, z) < 40 || Math.abs(x) > 112 || Math.abs(z) > 112) continue;
    if (rocks.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r + 3)) continue;
    rocks.push({ x, z, r });
  }
  // cores: A on the server deck, B in the hold aisle, C in the bridge cabin
  const cores = [
    { id: 'A', x: X(-30.6), y: dY, z: Z(0), room: 'server' },
    { id: 'B', x: X(uB), y: sb, z: Z(sB * 12.2), room: 'hold' },
    { id: 'C', x: X(30.4), y: sb, z: Z(dcb > 0 ? -1.8 : 1.8), room: 'bridge' },
  ];
  const free = (x, z, y, m = 0.9) => !pointHitsSolid(solids, x, y + 0.3, z, m) && !rocks.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + m);
  // bubble vents: two on the way out, one at the breach, then one per section
  const E = { x: X(ub), z: Z(vb * 1.55) };
  const vents = [];
  for (const [t, dx] of [[0.82, 0], [0.94, 7]]) vents.push({ x: E.x * t + dx, z: E.z * t });   // the hull is ~45 m out: the first pocket of air is ~30 m from the dock (shallows above that)
  vents.push({ x: X(ub + 5), z: Z(vb * 1.28) });
  vents.push({ x: X(R.pick([-7, 6])), z: Z(-sB * 5.5) });
  vents.push({ x: X(-30.5), z: Z(vr > 0 ? -9 : 9) });
  const vfv = R.pick([-7, 7]);
  vents.push({ x: X(18), z: Z(vfv) });
  for (const v of vents) { const rk = rocks.findIndex((q) => Math.hypot(q.x - v.x, q.z - v.z) < q.r + 1.6); if (rk >= 0) rocks.splice(rk, 1); }
  // currents: the whole hold lane (weak) and a jet through each bulkhead door. dir = unit vector, speed m/s
  const dirU = R.sign();
  const currents = [
    { x0: X(-11.6), x1: X(11.6), z0: Z(-3.4), z1: Z(3.4), y0: sb, y1: sb + WH, dx: dirU, dz: 0, v: 1.9, id: 'lane' },
    { x0: X(-14.2), x1: X(-9.8), z0: Z(dvA - 2), z1: Z(dvA + 2), y0: sb, y1: sb + WH, dx: dirU, dz: 0, v: 3.4, id: 'jetA' },
    { x0: X(9.8), x1: X(14.2), z0: Z(dvF - 2), z1: Z(dvF + 2), y0: sb, y1: sb + WH, dx: dirU, dz: 0, v: 3.4, id: 'jetF' },
  ];
  const tanks = [{ x: 6.2, y: SHIP_Y, z: 11.5, dock: true }, { x: -6.2, y: SHIP_Y, z: 11.5, dock: true }, { x: X(-6), y: sb, z: Z(-sB * 5.2), dock: false }, { x: X(20), y: sb, z: Z(-vfv), dock: false }];
  // blades (scatter loot): free floor spots inside the hull
  const blades = [];
  for (let tries = 0; tries < 200 && blades.length < 3; tries++) {
    const u = R.float(-34, 34), v = R.float(-11.5, 11.5);
    const y = u < -24 && u > -35 ? dY : sb;
    if (y === dY && (u < -34 || u > -24.5)) continue;
    if (free(X(u), Z(v), y, 1.0) && !pockets.some((p) => inBox({ x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1 }, X(u), null, Z(v), 0.6)) && blades.every((q) => Math.hypot(q.x - X(u), q.z - Z(v)) > 9)) blades.push({ x: X(u), y, z: Z(v) });
  }
  const lair = { x: X(19), z: Z(-3) };
  const nav = { x0: X(-U) - 14, z0: Z(-V) - 14, x1: X(U) + 14, z1: Z(V) + 14 };
  return { seed, kind: 'barge', sz, cx, cz, dY, solids, pockets, cores, vents, currents, tanks, blades, rocks, conts, ramp, vb, ub, ua, vg, dvA, dvF, vr, deckU: deck, E, lair, nav,
    hull: { x0: X(-U), x1: X(U), z0: Z(-V), z1: Z(V) } };
}
/** which pocket (or null) holds the point */
export const pocketAt = (P, x, y, z) => P.pockets.find((p) => x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1 && y >= p.y0 - 0.5 && y <= p.y1) || null;
export const ventNear = (P, x, z, r = OXY.ventR) => P.vents.some((v) => Math.hypot(v.x - x, v.z - z) < r);
export function currentAt(P, x, y, z) {
  let dx = 0, dz = 0;
  for (const c of P.currents) if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && y >= c.y0 && y <= c.y1) { dx += c.dx * c.v; dz += c.dz * c.v; }
  return { x: dx, z: dz };
}
/** 0.5 m nav grid over a solid list (cells hit by a solid between y0..y1 are blocked); used by the eel */
export function gridOf(solids, box0, ylo, yhi, step = 0.5) {
  const w = Math.ceil((box0.x1 - box0.x0) / step), h = Math.ceil((box0.z1 - box0.z0) / step), blocked = new Uint8Array(w * h);
  for (const b of solids) {
    if (b.y1 < ylo || b.y0 > yhi) continue;
    const i0 = Math.max(0, Math.floor((b.x0 - box0.x0) / step)), i1 = Math.min(w - 1, Math.floor((b.x1 - box0.x0) / step));
    const j0 = Math.max(0, Math.floor((b.z0 - box0.z0) / step)), j1 = Math.min(h - 1, Math.floor((b.z1 - box0.z0) / step));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * w + i] = 1;
  }
  return { x0: box0.x0, z0: box0.z0, step, w, h, blocked };
}
const cellOf = (g, x, z) => [clamp(Math.floor((x - g.x0) / g.step), 0, g.w - 1), clamp(Math.floor((z - g.z0) / g.step), 0, g.h - 1)];
/** BFS over the grid: [{x, z}] waypoints (cell centres) from a to b, or null. 8-neighbour without corner cutting. */
export function gridPath(g, a, b, maxN = 30000) {
  const [ai, aj] = cellOf(g, a.x, a.z), [bi, bj] = cellOf(g, b.x, b.z);
  const W = g.w, prev = new Int32Array(W * g.h).fill(-2), q = [aj * W + ai];
  prev[q[0]] = -1;
  const goal = bj * W + bi;
  let found = false;
  for (let h = 0; h < q.length && q.length < maxN * 4; h++) {
    const k = q[h]; if (k === goal) { found = true; break; }
    const i = k % W, j = (k / W) | 0;
    for (let d = 0; d < 8; d++) {
      const di = [1, -1, 0, 0, 1, 1, -1, -1][d], dj = [0, 0, 1, -1, 1, -1, 1, -1][d], ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= g.h) continue;
      const nk = nj * W + ni; if (prev[nk] !== -2 || (g.blocked[nk] && nk !== goal)) continue;
      if (di && dj && (g.blocked[j * W + ni] || g.blocked[nj * W + i])) continue;
      prev[nk] = k; q.push(nk);
    }
  }
  if (!found) return null;
  const out = [];
  for (let k = goal; k >= 0; k = prev[k]) out.push({ x: g.x0 + ((k % W) + 0.5) * g.step, z: g.z0 + (((k / W) | 0) + 0.5) * g.step });
  out.reverse();
  return out.slice(1);
}

// ------------------------------------------------------------------------------------------------ DUNE
/** Dune Relay Caravan: route S0 -> C1 -> C2 -> C3 for the crawler, tents / rocks (shade), water barrels, burrower mounds. */
export function planDune(seed) {
  const R = new RNG(((seed | 0) ^ 0xd07e5a) >>> 0);
  const a0 = R.float(0, TAU), route = [{ x: Math.cos(a0) * 46, z: Math.sin(a0) * 46 }];
  for (let k = 1; k <= DUNE.legs; k++) {
    const p = route[k - 1];
    let ok = null;
    for (let t = 0; t < 400 && !ok; t++) {
      const h = R.float(0, TAU), len = R.float(94, 112);
      const x = p.x + Math.cos(h) * len, z = p.z + Math.sin(h) * len;
      if (Math.abs(x) <= 92 && Math.abs(z) <= 92 && Math.hypot(x, z) > 58 && route.every((q) => Math.hypot(q.x - x, q.z - z) > 58)) ok = { x, z };
    }
    if (!ok) ok = { x: -p.x * 0.9, z: -p.z * 0.9 };
    route.push(ok);
  }
  const d = [0]; for (let i = 1; i < route.length; i++) d.push(d[i - 1] + Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z));
  const perp = (i) => { const a = route[Math.min(i + 1, 3)], b = route[Math.max(i - 1, 0)], l = Math.hypot(a.x - b.x, a.z - b.z) || 1; return { x: -(a.z - b.z) / l, z: (a.x - b.x) / l }; };
  const tents = route.map((p, i) => { const n = perp(i); return { x: p.x + n.x * 9, z: p.z + n.z * 9, r: 5.5, i }; });
  const barrels = route.map((p, i) => { const n = perp(i); return { x: p.x - n.x * 8, z: p.z - n.z * 8, i }; });
  barrels.push({ x: Math.cos(a0) * 15 + 6 * Math.sin(a0), z: Math.sin(a0) * 15 - 6 * Math.cos(a0), i: 4 });
  const far = (x, z, m) => route.every((q) => Math.hypot(q.x - x, q.z - z) > m) && Math.hypot(x, z) > 24;
  const nearRoute = (x, z, m) => { for (let i = 1; i < route.length; i++) { const a = route[i - 1], b = route[i], l2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2, t = clamp(((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / l2, 0, 1); if (Math.hypot(x - (a.x + (b.x - a.x) * t), z - (a.z + (b.z - a.z) * t)) < m) return true; } return false; };
  const rocks = [];
  for (let t = 0; t < 300 && rocks.length < 8; t++) {
    const x = R.float(-102, 102), z = R.float(-102, 102), r = R.float(2.2, 3.6);
    if (!far(x, z, 18) || nearRoute(x, z, 8) || rocks.some((q) => Math.hypot(q.x - x, q.z - z) < 24) || tents.some((q) => Math.hypot(q.x - x, q.z - z) < 10) || barrels.some((q) => Math.hypot(q.x - x, q.z - z) < 8)) continue;
    rocks.push({ x, z, r, h: R.float(3, 5.5) });
  }
  const burrows = [];
  for (let t = 0; t < 200 && burrows.length < 3; t++) {
    const x = R.float(-100, 100), z = R.float(-100, 100);
    if (Math.hypot(x, z) < 52 || !far(x, z, 26) || burrows.some((q) => Math.hypot(q.x - x, q.z - z) < 40)) continue;
    burrows.push({ x, z });
  }
  const glass = [];
  for (const q of rocks) if (glass.length < 5) glass.push({ x: q.x + q.r + 1.4, z: q.z + 0.6 });
  const shade = [{ x: 0, z: 0, r: 15, ship: true }, ...tents.map((q) => ({ x: q.x, z: q.z, r: q.r })), ...rocks.map((q) => ({ x: q.x, z: q.z, r: q.r + 2.6 }))];
  const flats = route.map((p) => ({ x: p.x, z: p.z, r: 9, fall: 11 }));
  return { seed, kind: 'dune', route, d, len: d[d.length - 1], tents, barrels, rocks, burrows, glass, shade, flats, entrance: route[3], canteens: [{ x: 5, z: 13 }, { x: -5, z: 13 }, { x: 8, z: 12 }] };
}
export const inShade = (P, x, z) => P.shade.some((s) => Math.hypot(s.x - x, s.z - z) < s.r);
/** position + heading of the crawler at distance s along the route */
export function routeAt(P, s) {
  const c = clamp(s, 0, P.len);
  let i = 1; while (i < P.route.length - 1 && P.d[i] < c) i++;
  const a = P.route[i - 1], b = P.route[i], l = P.d[i] - P.d[i - 1] || 1, t = clamp((c - P.d[i - 1]) / l, 0, 1);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(b.x - a.x, b.z - a.z), leg: i - 1 };
}
export const newCrawler = () => ({ i: 0, s: 0, mode: 'park', rep: 0, hold: false });
/** advance the crawler: o = { rep: someone within repR, escort: someone within escortR }. returns the events fired this step. */
export function crawlerStep(cw, P, dt, o = {}) {
  const ev = [];
  if (cw.mode === 'park') {
    cw.rep = clamp(cw.rep + (o.rep ? dt / DUNE.repSec : -dt * 0.5), 0, 1);
    if (cw.rep >= 1) { cw.mode = 'go'; cw.rep = 0; ev.push('repaired'); }
  } else if (cw.mode === 'go') {
    cw.hold = !o.escort;
    if (!cw.hold) {
      cw.s = Math.min(P.d[cw.i + 1], cw.s + DUNE.cwSpeed * dt);
      if (cw.s >= P.d[cw.i + 1] - 1e-6) { cw.i++; ev.push('arrived'); if (cw.i >= DUNE.legs) { cw.mode = 'done'; ev.push('done'); } else cw.mode = 'park'; }
    }
  }
  return ev;
}

// ------------------------------------------------------------------------------------------------ ROOF
export const ROOFC = { pitch: 48, ring: [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]], parapet: 0.9, pole: 3.2, plankW: 1.1 };
/** Rooftop Blackout City: 8 buildings around the plaza, planks between equal-height neighbours, zip-lines between the rest, 4 billboards, a generator, stairs at the 4 plaza faces. */
export function planRoof(seed) {
  const R = new RNG(((seed | 0) ^ 0x600f5) >>> 0);
  const N = 8, j = R.int(0, 3);
  const plankEdges = new Set([j, j + 4]);
  const w = new Array(N).fill(32); for (const k of [j, j + 1, j + 4, j + 5]) w[k % N] = 40;
  // heights: alternate a low / high class around the ring of "supernodes" (plank pairs share one height), so zip neighbours differ by >= 1.4 m
  const h = new Array(N).fill(0), k0 = (j + 2) % N;
  let sn = 0;
  const hs = {};
  for (let n = 0; n < N; n++) {
    const k = (k0 + n) % N, prev = (k + N - 1) % N;
    if (n > 0 && !plankEdges.has(prev)) sn++;
    const lo = sn % 2 === 0;
    if (hs[sn] == null) hs[sn] = lo ? R.float(6.8, 8.0) : R.float(9.4, 10.6);
    h[k] = hs[sn];
  }
  const b = [], solids = [];
  for (let k = 0; k < N; k++) {
    const [gx, gz] = ROOFC.ring[k], cx = gx * ROOFC.pitch, cz = gz * ROOFC.pitch, hw = w[k] / 2, roofY = SHIP_Y + h[k];
    b.push({ k, cx, cz, w: w[k], hw, h: h[k], y: roofY, x0: cx - hw, x1: cx + hw, z0: cz - hw, z1: cz + hw, gx, gz });
    solids.push(box(cx - hw, cx + hw, SHIP_Y - 0.4, roofY, cz - hw, cz + hw, 'building'));
  }
  const edges = [];
  for (let k = 0; k < N; k++) {
    const A = b[k], B = b[(k + 1) % N], axis = A.gx !== B.gx ? 'x' : 'z', sg = axis === 'x' ? Math.sign(B.cx - A.cx) : Math.sign(B.cz - A.cz);
    const fa = axis === 'x' ? (sg > 0 ? A.x1 : A.x0) : (sg > 0 ? A.z1 : A.z0), fb = axis === 'x' ? (sg > 0 ? B.x0 : B.x1) : (sg > 0 ? B.z0 : B.z1);
    const lat0 = axis === 'x' ? A.cz : A.cx, latR = Math.min(A.hw, B.hw) - 6;
    const lat = Math.round(lat0 + R.float(-latR, latR));
    edges.push({ k, a: k, b: (k + 1) % N, axis, sg, fa, fb, gap: Math.abs(fb - fa), lat, plank: plankEdges.has(k), ya: A.y, yb: B.y });
  }
  const along = (axis, a, l) => (axis === 'x' ? { x: a, z: l } : { x: l, z: a });
  const planks = [], zips = [], pads = [];
  for (const e of edges) {
    if (e.plank) {
      const a0 = Math.min(e.fa, e.fb) - 0.6, a1 = Math.max(e.fa, e.fb) + 0.6, y = e.ya;
      const s = e.axis === 'x' ? box(a0, a1, y - 0.22, y, e.lat - ROOFC.plankW / 2, e.lat + ROOFC.plankW / 2, 'plank') : box(e.lat - ROOFC.plankW / 2, e.lat + ROOFC.plankW / 2, y - 0.22, y, a0, a1, 'plank');
      planks.push({ ...s, edge: e.k, y, axis: e.axis, lat: e.lat, a0, a1 }); solids.push(s);
    } else {
      const inA = e.fa - e.sg * 1.9, inB = e.fb + e.sg * 1.9;
      const pa = { ...along(e.axis, inA, e.lat), y: e.ya }, pb = { ...along(e.axis, inB, e.lat), y: e.yb };
      const sa = { ...along(e.axis, inA - e.sg * 1.5, e.lat), y: e.ya }, sb2 = { ...along(e.axis, inB + e.sg * 1.5, e.lat), y: e.yb };
      zips.push({ edge: e.k, a: pa, b: pb, standA: sa, standB: sb2, len: Math.hypot(Math.abs(inB - inA), e.yb - e.ya), yaTop: e.ya + ROOFC.pole, ybTop: e.yb + ROOFC.pole, ea: e.a, eb: e.b, axis: e.axis });
      for (const p of [pa, pb]) solids.push(box(p.x - 0.18, p.x + 0.18, p.y, p.y + ROOFC.pole, p.z - 0.18, p.z + 0.18, 'pole'));
      pads.push({ x: sa.x, z: sa.z, y: sa.y, r: 1.6 }, { x: sb2.x, z: sb2.z, y: sb2.y, r: 1.6 });
    }
  }
  // stairs on the plaza face of the four cardinal buildings (fall recovery + the way up)
  const stairs = [];
  for (const k of [1, 3, 5, 7]) {
    const B = b[k], rise = B.h, run = Math.round(rise * 1.75 * 10) / 10;
    let s;
    if (k === 1) s = { x: B.x0 + 2, z: B.z1 + 1.2, dir: 'x+' };
    else if (k === 5) s = { x: B.x0 + 2, z: B.z0 - 1.2, dir: 'x+' };
    else if (k === 3) s = { x: B.x0 - 1.2, z: B.z0 + 2, dir: 'z+' };
    else s = { x: B.x1 + 1.2, z: B.z0 + 2, dir: 'z+' };
    stairs.push({ ...s, y: SHIP_Y, width: 2.4, rise, run, k });
    const tx = s.dir === 'x+' ? s.x + run + 0.3 : s.x, tz = s.dir === 'x+' ? s.z : s.z + run + 0.3;   // top landing centre
    // the parapet gap sits over the landing and the roof edge next to it
    stairs[stairs.length - 1].top = { x: tx, z: tz };
  }
  // generator + billboards
  const genB = b[R.pick([0, 2, 4, 6])];
  const others = b.filter((q) => q !== genB);
  R.shuffle(others);
  const bbs = [];
  for (const B of others) {
    if (bbs.length >= CELL.boards) break;
    const out = Math.abs(B.cx) >= Math.abs(B.cz) ? { x: Math.sign(B.cx) || 1, z: 0 } : { x: 0, z: Math.sign(B.cz) || 1 };
    const lat = out.x ? B.cz + R.float(-5, 5) : B.cx + R.float(-5, 5);
    const px = out.x ? B.cx + out.x * (B.hw - 3.2) : lat, pz = out.x ? lat : B.cz + out.z * (B.hw - 3.2);
    bbs.push({ i: bbs.length, k: B.k, x: px, z: pz, y: B.y, out, lat, kiosk: { x: px - out.x * 2.2, z: pz - out.z * 2.2 }, hue: [0.98, 0.1, 0.55, 0.78][bbs.length] });
  }
  const genPos = { x: genB.cx + R.float(-4, 4), z: genB.cz + R.float(-4, 4), y: genB.y, k: genB.k };
  // clutter + loot on the roofs: rejection against edges, stairs, planks, pads, billboards, the generator
  const rejectAt = (B, x, z, m) => {
    if (x < B.x0 + 2.6 || x > B.x1 - 2.6 || z < B.z0 + 2.6 || z > B.z1 - 2.6) return true;
    for (const s of stairs) if (s.k === B.k && Math.hypot(s.top.x - x, s.top.z - z) < 6) return true;
    for (const p of planks) if (Math.abs((p.axis === 'x' ? z : x) - p.lat) < 3.2 && (p.axis === 'x' ? Math.abs(x - (p.a0 + p.a1) / 2) < (p.a1 - p.a0) / 2 + 7 : Math.abs(z - (p.a0 + p.a1) / 2) < (p.a1 - p.a0) / 2 + 7)) return true;
    for (const p of pads) if (Math.hypot(p.x - x, p.z - z) < p.r + 2.4 + m) return true;
    for (const q of bbs) if (Math.hypot(q.x - x, q.z - z) < 9 + m || Math.hypot(q.kiosk.x - x, q.kiosk.z - z) < 3 + m) return true;
    if (Math.hypot(genPos.x - x, genPos.z - z) < 4.5 + m && genPos.k === B.k) return true;
    return false;
  };
  const props = [], loot = [];
  const PK = [['ac', 2.2, 1.2, 1.5], ['tank', 2.6, 2.6, 3.6], ['crate', 1.2, 1.2, 1.1], ['skylight', 3.0, 3.0, 0.5], ['mast', 0.5, 0.5, 6], ['duct', 3.4, 1.0, 1.0]];
  for (const B of b) {
    const n = R.int(4, 6);
    for (let t = 0, got = 0; t < 60 && got < n; t++) {
      const [id, sx, sz2, sy] = R.pick(PK), x = R.float(B.x0 + 3, B.x1 - 3), z = R.float(B.z0 + 3, B.z1 - 3), m = Math.max(sx, sz2) / 2;
      if (rejectAt(B, x, z, m) || props.some((q) => q.k === B.k && Math.hypot(q.x - x, q.z - z) < (q.m + m + 1.8)) || Math.hypot(genPos.x - x, genPos.z - z) < 5 && B.k === genPos.k) continue;
      props.push({ id, k: B.k, x, z, y: B.y, sx, sz: sz2, sy, m }); solids.push(box(x - sx / 2, x + sx / 2, B.y, B.y + sy, z - sz2 / 2, z + sz2 / 2, id));
      got++;
    }
    for (let t = 0, got = 0; t < 40 && got < 1; t++) {
      const x = R.float(B.x0 + 4, B.x1 - 4), z = R.float(B.z0 + 4, B.z1 - 4);
      if (rejectAt(B, x, z, 1) || props.some((q) => q.k === B.k && Math.hypot(q.x - x, q.z - z) < q.m + 1.6)) continue;
      loot.push({ x, y: B.y, z, k: B.k, kind: (loot.length % 3 === 2) ? 'neon' : 'reel' }); got++;
    }
  }
  const spawnCell = { x: 9, y: SHIP_Y, z: 14 };
  for (const q of bbs) {
    solids.push(box(q.kiosk.x - 0.45, q.kiosk.x + 0.45, q.y, q.y + 1.3, q.kiosk.z - 0.3, q.kiosk.z + 0.3, 'kiosk'));
    const ax = q.out.x ? 0 : 1;   // lateral axis: z for an x-facing board, x otherwise
    const pane = (l0, l1, y0, y1, th, k) => solids.push(ax ? box(q.lat + l0, q.lat + l1, y0, y1, q.z - th, q.z + th, k) : box(q.x - th, q.x + th, y0, y1, q.lat + l0, q.lat + l1, k));
    pane(-6, 6, q.y + 2.6, q.y + 8.4, 0.3, 'bbpanel'); pane(-4.8, -4.3, q.y, q.y + 2.6, 0.25, 'bbleg'); pane(4.3, 4.8, q.y, q.y + 2.6, 0.25, 'bbleg');
  }
  solids.push(box(genPos.x - 1.2, genPos.x + 1.2, genPos.y, genPos.y + 1.5, genPos.z - 0.7, genPos.z + 0.7, 'gen'));
  const ents = { x: genB.cx, z: genB.cz };
  return { seed, kind: 'roof', b, edges, planks, zips, stairs, bbs, gen: genPos, props, loot, solids, entrance: ents, spawnCell, pads };
}
/** roof surface height (or null) at a point, for terrain.heightAt / spot checks */
export function roofAt(P, x, z) { for (const B of P.b) if (x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1) return B.y; return null; }
/** best support height under (x, z) for tests: buildings, planks, stair ramps are handled by callers */
export function nearestPole(P, x, z, r = ZIP.reach) {
  let best = null, bd = r;
  for (const zp of P.zips) for (const [end, p, stand] of [['a', zp.a, zp.standA], ['b', zp.b, zp.standB]]) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd && Math.abs(p.y - (best?.y ?? p.y)) < 99) { best = { zip: zp, end, pole: p, stand, y: p.y }; bd = d; } }
  return best;
}
/** zip-line ride: point (feet) at progress s in 0..1 from end `from` to the other end */
export function zipPoint(zp, from, s) {
  const a = from === 'a' ? zp.a : zp.b, b = from === 'a' ? zp.b : zp.a, ya = from === 'a' ? zp.yaTop : zp.ybTop, yb = from === 'a' ? zp.ybTop : zp.yaTop;
  const t = clamp(s, 0, 1);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: ya + (yb - ya) * t - ZIP.sag * 4 * t * (1 - t) - ZIP.hang };
}
export const zipDur = (zp) => zp.len / ZIP.speed + 0.5;
export function roofPlanSummary(P) {
  return { buildings: P.b.length, planks: P.planks.length, zips: P.zips.length, stairs: P.stairs.length, billboards: P.bbs.length };
}

// ------------------------------------------------------------------------------------------------ run state
export function initState(kind, day = 1) {
  if (kind === 'barge') return { m: 'barge', d: day, st: 'go', n: 0, of: BARGE.cores };
  if (kind === 'dune') return { m: 'dune', d: day, st: 'go', cp: 0, rp: 0, of: DUNE.legs, w: [DUNE.barrel, DUNE.barrel, DUNE.barrel, DUNE.barrel, DUNE.barrel] };
  return { m: 'roof', d: day, st: 'go', b: [0, 0, 0, 0], c: CELL.start, g: [0, 0], of: CELL.boards };
}
export const progressOf = (ex) => {
  if (!ex) return { n: 0, of: 0, done: false };
  if (ex.m === 'barge') return { n: ex.n | 0, of: ex.of || BARGE.cores, done: ex.st === 'won' };
  if (ex.m === 'dune') return { n: ex.cp | 0, of: ex.of || DUNE.legs, done: ex.st === 'won' };
  return { n: (ex.b || []).reduce((s, v) => s + (v ? 1 : 0), 0), of: ex.of || CELL.boards, done: ex.st === 'won' };
};
/** relight billboard i? (host validation). returns { ok, why } */
export function canRelight(ex, i, holdsCell) {
  if (!ex || ex.m !== 'roof' || ex.st !== 'go') return { ok: false, why: 'closed' };
  if (!(i >= 0 && i < CELL.boards) || ex.b[i]) return { ok: false, why: 'done' };
  if (!holdsCell) return { ok: false, why: 'nocell' };
  if (ex.c < CELL.cost) return { ok: false, why: 'low' };
  return { ok: true };
}

/** every placed spot of a plan as { id, x, y | null, z } (y = the surface it stands on, null = plain terrain): geomfix + tests check support / bounds */
export function spotsOf(P) {
  const out = [];
  if (P.kind === 'barge') {
    for (const c of P.cores) out.push({ id: 'core' + c.id, x: c.x, y: c.y, z: c.z });
    for (const q of P.tanks) out.push({ id: 'tank', x: q.x, y: q.y, z: q.z });
    for (const q of P.blades) out.push({ id: 'blade', x: q.x, y: q.y, z: q.z });
    for (const v of P.vents) out.push({ id: 'vent', x: v.x, y: null, z: v.z });
    for (const r of P.rocks) out.push({ id: 'rock', x: r.x, y: null, z: r.z });
  } else if (P.kind === 'dune') {
    for (const [id, list] of [['route', P.route], ['tent', P.tents], ['barrel', P.barrels], ['rock', P.rocks], ['burrow', P.burrows], ['glass', P.glass], ['canteen', P.canteens]]) for (const q of list) out.push({ id, x: q.x, y: null, z: q.z });
  } else if (P.kind === 'roof') {
    for (const q of P.props) out.push({ id: q.id, x: q.x, y: q.y, z: q.z });
    for (const q of P.loot) out.push({ id: 'loot', x: q.x, y: q.y, z: q.z });
    for (const q of P.bbs) out.push({ id: 'billboard', x: q.x, y: q.y, z: q.z }, { id: 'kiosk', x: q.kiosk.x, y: q.y, z: q.kiosk.z });
    out.push({ id: 'generator', x: P.gen.x, y: P.gen.y, z: P.gen.z }, { id: 'cell', x: P.spawnCell.x, y: P.spawnCell.y, z: P.spawnCell.z });
    for (const q of P.pads) out.push({ id: 'pad', x: q.x, y: q.y, z: q.z });
    for (const z of P.zips) out.push({ id: 'pole', x: z.a.x, y: z.a.y, z: z.a.z }, { id: 'pole', x: z.b.x, y: z.b.y, z: z.b.z });
  }
  return out;
}
