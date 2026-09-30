// OUTLIFE (wave 10, module 'outlife10'; docs/wave10/outlife10.md): life for the OUTDOORS of every moon. Pure planning, no three.js (node-testable).
// The outdoors were "empty flat hills with a pylon". This layer adds, seeded by (moon, seed) so every peer rebuilds the same layout:
//   ground cover   boulders / slabs / standing stones / snow mounds, blade + twig tufts in clumps, snags (dead trees) + stumps
//   points of interest   5 kinds of Company debris (tyre heap, spilled crates, dead monitors, an office-chair meeting, cables into the ground)
//   atmosphere   low fog pools in the valleys + ONE pooled particle field per biome (pollen / fireflies, spores, snow, dust, wisps, embers)
//   horizon   a second, paler skyline ring behind mapart's (per biome: turbines, cypress, peaks, mesas, tors, treeline ...) + red beacons + the Algorithm's watcher tower
// Everything keeps off the ship pad, the walk to the main entrance, the fire exits, ponds / lakes / lava, outposts, landmark + mapart + soul footprints.
import { RNG, hashString } from '../core/rng.js';
import { addTranslations, t } from '../core/i18n.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ families + profiles
export const FAMILIES = ['hills', 'swamp', 'snow', 'desert', 'moor', 'blackforest', 'datascape', 'servermarsh', 'ashfield', 'crystal', 'pier'];
/** biome id / decor key -> family (unknown biomes read as hills) */
export function familyOf(biomeId, decor) {
  if (decor && FAMILIES.includes(decor)) return decor;
  return FAMILIES.includes(biomeId) ? biomeId : 'hills';
}

/** Counts are for a scale-1 map (see planOutlife: multiplied by k = 0.6 + 0.6 sc^2 so compact maps stay dense).
 *  rocks/mounds/tufts/snags/stumps/pois/fog = counts; big = chance of a collider boulder; tall = chance of a spire / standing stone; slab = flat slab chance.
 *  tex = [tuft A texture, tuft B texture]; the colour arrays are picked per instance (multiplied with the texture). */
export const PROFILES = {
  hills:       { rocks: 40, big: 0.12, slab: 0.25, tall: 0.0, mounds: 0, tufts: [340, 90], tex: ['blade', 'twig'], snags: 14, stumps: 12, pois: 5, fog: 10, fx: 'meadow', fxN: 420,
    rockC: [0x8c8c84, 0x7a7d76, 0x9a9a90], moundC: [0x808878], tuftA: [0x7fa04c, 0x8cae54, 0x6c8f3e], tuftB: [0xa08c52, 0x8a7a48], snagC: [0x4d4238, 0x5c4c3e], fogC: 0xe4ece0, fogA: 0.42 },
  swamp:       { rocks: 26, big: 0.08, slab: 0.3, tall: 0.0, mounds: 0, tufts: [260, 120], tex: ['reed', 'twig'], snags: 22, stumps: 26, pois: 5, fog: 16, fx: 'spore', fxN: 460,
    rockC: [0x566650, 0x4a5a48, 0x64705a], moundC: [0x4a5a40], tuftA: [0x6f8c3c, 0x7c9a44, 0x5c7a34], tuftB: [0x6a5c38, 0x54482c], snagC: [0x3a3a30, 0x2e2e26], fogC: 0xb8cc9c, fogA: 0.5 },
  snow:        { rocks: 34, big: 0.1, slab: 0.3, tall: 0.05, mounds: 26, tufts: [90, 60], tex: ['spike', 'twig'], snags: 14, stumps: 10, pois: 5, fog: 8, fx: 'snow', fxN: 700,
    rockC: [0xa8b2bc, 0x94a0ac, 0xb8c2cc], moundC: [0xe8f0f6, 0xdce8f0], tuftA: [0xa8b8a0, 0x98a890], tuftB: [0x8a7a6a], snagC: [0x504840, 0x40382e], fogC: 0xeaf4fa, fogA: 0.5 },
  desert:      { rocks: 38, big: 0.16, slab: 0.3, tall: 0.3, mounds: 16, tufts: [0, 200], tex: ['blade', 'twig'], snags: 10, stumps: 4, pois: 5, fog: 4, fx: 'dust', fxN: 380,
    rockC: [0xb0704a, 0x9a6040, 0xc08052], moundC: [0xd8a070, 0xcc9462], tuftA: [0xb0a060], tuftB: [0xa08a58, 0x8e7a4c, 0x7a6a40], snagC: [0xc8bca4, 0xb4a88e], fogC: 0xe6c69a, fogA: 0.34 },
  moor:        { rocks: 30, big: 0.1, slab: 0.2, tall: 0.3, mounds: 0, tufts: [260, 90], tex: ['blade', 'twig'], snags: 14, stumps: 8, pois: 5, fog: 14, fx: 'wisp', fxN: 380,
    rockC: [0x666870, 0x585a64, 0x747682], moundC: [0x5a5a60], tuftA: [0x8a6a78, 0x7a5c6c, 0x6c7448], tuftB: [0x7a6a52, 0x66583e], snagC: [0x3a3438, 0x2e2a30], fogC: 0xc8ccdc, fogA: 0.46 },
  blackforest: { rocks: 28, big: 0.1, slab: 0.25, tall: 0.05, mounds: 0, tufts: [90, 160], tex: ['blade', 'twig'], snags: 34, stumps: 30, pois: 5, fog: 12, fx: 'ember', fxN: 460,
    rockC: [0x4a4044, 0x3e363a, 0x584a4c], moundC: [0x3a3234], tuftA: [0x4a5a34, 0x3c4a2c], tuftB: [0x5a3c34, 0x4a3028], snagC: [0x241a1a, 0x2e2020], fogC: 0x6a3a3c, fogA: 0.4 },
  datascape:   { rocks: 18, big: 0.06, slab: 0.7, tall: 0.2, mounds: 0, tufts: [0, 0], tex: ['blade', 'twig'], snags: 0, stumps: 0, pois: 7, fog: 8, fx: null, fxN: 0,
    rockC: [0x2c2c44, 0x38385a, 0x24243a], moundC: [0x30304a], tuftA: [0x2a90c0], tuftB: [0x2a90c0], snagC: [0x202030], fogC: 0x7a5cc8, fogA: 0.36 },
  servermarsh: { rocks: 12, big: 0.05, slab: 0.4, tall: 0.0, mounds: 0, tufts: [200, 0], tex: ['reed', 'twig'], snags: 14, stumps: 10, pois: 6, fog: 16, fx: null, fxN: 0,
    rockC: [0x626e60, 0x546052, 0x6e7a6a], moundC: [0x4a5a48], tuftA: [0x5a7a4c, 0x486a44], tuftB: [0x54482c], snagC: [0x30342c], fogC: 0x9cc0ac, fogA: 0.5 },
  ashfield:    { rocks: 30, big: 0.1, slab: 0.3, tall: 0.1, mounds: 0, tufts: [0, 60], tex: ['blade', 'twig'], snags: 30, stumps: 24, pois: 6, fog: 8, fx: null, fxN: 0,
    rockC: [0x4a4644, 0x3a3634, 0x5a5250], moundC: [0x3c3836], tuftA: [0x3a3430], tuftB: [0x2c2622, 0x3c322c], snagC: [0x1c1816, 0x241e1a], fogC: 0x8a6a5a, fogA: 0.4 },
  crystal:     { rocks: 24, big: 0.08, slab: 0.2, tall: 0.5, mounds: 0, tufts: [0, 0], tex: ['spike', 'twig'], snags: 0, stumps: 0, pois: 5, fog: 6, fx: null, fxN: 0,
    rockC: [0x6c5c9c, 0x5a4c88, 0x7c6cac], moundC: [0x6a5a98], tuftA: [0x9a72ff], tuftB: [0x9a72ff], snagC: [0x3a2c5a], fogC: 0xa08cdc, fogA: 0.36 },
  pier:        { rocks: 10, big: 0.05, slab: 0.5, tall: 0.0, mounds: 0, tufts: [40, 20], tex: ['blade', 'twig'], snags: 0, stumps: 0, pois: 8, fog: 6, fx: 'dust', fxN: 200,
    rockC: [0x70747a, 0x60646a], moundC: [0x60646a], tuftA: [0x6a7a5a], tuftB: [0x6a6a58], snagC: [0x30303a], fogC: 0xc4ccd2, fogA: 0.3 },
};

export const POI_KINDS = ['tires', 'crates', 'monitors', 'chairs', 'cables'];
/** which POI kinds a family favours (weights) - the rest still appear now and then */
const POI_W = {
  hills: { tires: 2, crates: 2, monitors: 1, chairs: 2, cables: 1 }, swamp: { tires: 2, crates: 1, monitors: 2, chairs: 1, cables: 2 },
  snow: { tires: 1, crates: 2, monitors: 1, chairs: 2, cables: 1 }, desert: { tires: 3, crates: 2, monitors: 1, chairs: 1, cables: 1 },
  moor: { tires: 1, crates: 1, monitors: 2, chairs: 3, cables: 1 }, blackforest: { tires: 1, crates: 1, monitors: 2, chairs: 2, cables: 3 },
  datascape: { tires: 0.4, crates: 1, monitors: 3, chairs: 1, cables: 3 }, servermarsh: { tires: 1, crates: 1, monitors: 3, chairs: 1, cables: 3 },
  ashfield: { tires: 3, crates: 1, monitors: 2, chairs: 1, cables: 2 }, crystal: { tires: 1, crates: 1, monitors: 2, chairs: 2, cables: 2 }, pier: { tires: 3, crates: 3, monitors: 1, chairs: 1, cables: 1 },
};
/** POI footprint radius (m) */
export const POI_R = 3.4;

// ------------------------------------------------------------------ text (EN / TR / RU)
export const TX = {
  tires: ['Company fleet: 4 tyres, 0 vehicles. Fully depreciated.', 'Şirket filosu: 4 lastik, 0 araç. Tamamen amortize edildi.', 'Автопарк Компании: 4 шины, 0 машин. Полностью амортизировано.'],
  crates: ['Returned goods. Reason for return: "the goods looked back".', 'İade edilen mallar. İade nedeni: “mallar geri baktı”.', 'Возврат товара. Причина: «товар посмотрел в ответ».'],
  monitors: ['Dead monitors. One of them is still watching.', 'Ölü monitörler. Biri hâlâ izliyor.', 'Мёртвые мониторы. Один всё ещё смотрит.'],
  chairs: ['A meeting nobody left. The minutes are still being taken.', 'Kimsenin terk etmediği bir toplantı. Tutanak hâlâ tutuluyor.', 'Совещание, с которого никто не ушёл. Протокол всё ещё ведётся.'],
  cables: ['Unlabelled cables. HR asks you not to follow them.', 'Etiketsiz kablolar. İK takip etmemenizi rica ediyor.', 'Кабели без маркировки. HR просит не идти за ними.'],
};
let _registered = false;
export function registerOutlifeText() {
  if (_registered) return;
  _registered = true;
  const tr = {}, ru = {};
  for (const [en, a, b] of Object.values(TX)) { tr[en] = a; ru[en] = b; }
  addTranslations(tr, 'tr');
  addTranslations(ru, 'ru');
}
export const poiText = (kind) => (TX[kind] ? t(TX[kind][0]) : '');

// ------------------------------------------------------------------ spatial grid
/** circles in a uniform grid; hit(x, z, r) = is any stored circle closer than its radius + r */
export function makeGrid(items = [], cell = 8) {
  const m = new Map();
  let maxR = 0;
  const ck = (cx, cz) => (cx + 2048) * 4096 + (cz + 2048);
  const g = {
    n: 0,
    add(x, z, r) {
      const k = ck(Math.floor(x / cell), Math.floor(z / cell));
      let a = m.get(k);
      if (!a) m.set(k, a = []);
      a.push({ x, z, r });
      if (r > maxR) maxR = r;
      g.n++;
    },
    hit(x, z, r = 0) {
      const n = Math.ceil((r + maxR) / cell), cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
        const a = m.get(ck(cx + i, cz + j));
        if (a) for (const q of a) { const dx = q.x - x, dz = q.z - z, rr = q.r + r; if (dx * dx + dz * dz < rr * rr) return true; }
      }
      return false;
    },
  };
  for (const q of items) if (Number.isFinite(q.x + q.z)) g.add(q.x, q.z, q.r || 1);
  return g;
}

// ------------------------------------------------------------------ the plan
/**
 * planOutlife(o) -> { family, rocks[], tufts[], snags[], stumps[], pois[], fog[], fx, colliders }
 *   o = { seed, moonId, biomeId, decor, sc, half, plan:{entrance,fires,ponds,lakes}, heightAt(x,z), distToPath(x,z), avoid?(x,z,m), solidAt?(x,z,r), lavaDepthAt?(x,z),
 *         floodY?, obstacles?:[{x,z,r}] (trees, rocks, outposts, mapart, soul, scrap), ok?(x,z,r) }
 * Each rock: { x, y, z, sx, sy, sz, ry, rx, rz, c, kind:'rock'|'mound', col }  (y = instance centre; col = boulder gets a collider)
 * tuft: { x, y, z, w, h, ry, c, k:0|1 }   snag: { x, y, z, s, ry, rx, rz, c }   stump: { x, y, z, s, ry, c }
 * poi: { id, kind, x, y, z, yaw, r }      fog: { x, y, z, r, ry, a }
 */
export function planOutlife(o) {
  const fam = familyOf(o.biomeId, o.decor), P = PROFILES[fam];
  const key = `outlife10|${o.moonId}|${o.seed | 0}`;
  const sc = Math.max(0.6, +o.sc || 1), k = 0.6 + 0.6 * sc * sc;
  const lim = Math.min((o.half || 160) - 24, 128 * sc);
  const h = o.heightAt, plan = o.plan || {}, e = plan.entrance;
  const obst = makeGrid(o.obstacles || [], 8), taken = makeGrid([], 6);
  const rng = (name) => new RNG(hashString(`${key}|${name}`));
  const dpath = (x, z) => o.distToPath(x, z);
  const wet = (x, z, m = 0.45) => (o.floodY != null && h(x, z) < o.floodY + m) || (o.lavaDepthAt && o.lavaDepthAt(x, z) > -0.9);
  /** the hard rules every category shares (ship pad, entrance, fire exits, ponds, lakes, existing avoid()) */
  const clear = (x, z, r) => {
    if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
    if (Math.hypot(x, z) < 24 + r) return false;
    if (e && Math.hypot(x - e.x, z - e.z) < 18 + r) return false;
    for (const f of plan.fires || []) if (Math.hypot(x - f.x, z - f.z) < 12 + r) return false;
    for (const p of plan.ponds || []) if (Math.hypot(x - p.x, z - p.z) < p.r * 1.4 + 3 + r) return false;
    for (const l of plan.lakes || []) if (Math.hypot(x - l.x, z - l.z) < l.r + 3 + r) return false;
    if (o.avoid && o.avoid(x, z, r)) return false;
    return !wet(x, z);
  };
  const heavy = (x, z, r, pathClear) => clear(x, z, r) && dpath(x, z) >= pathClear + r * 0.5 && !obst.hit(x, z, r) && !taken.hit(x, z, r) && !(o.solidAt && o.solidAt(x, z, r)) && !(o.ok && o.ok(x, z, r));
  /** ground: lowest and highest height under a footprint of radius r */
  const span = (x, z, r) => {
    let lo = h(x, z), hi = lo;
    for (let i = 0; i < 6; i++) { const y = h(x + Math.cos(i * TAU / 6) * r, z + Math.sin(i * TAU / 6) * r); if (y < lo) lo = y; if (y > hi) hi = y; }
    return [lo, hi];
  };
  const pickC = (R, arr) => arr[Math.floor(R.next() * arr.length)];
  const shade = (c, R, v = 0.16) => { const f = 1 - v / 2 + R.next() * v, r = Math.min(255, (c >> 16 & 255) * f), g = Math.min(255, (c >> 8 & 255) * f), b = Math.min(255, (c & 255) * f); return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b); };

  // ---- rocks, slabs, standing stones, mounds
  const rocks = [];
  let ncol = 0;
  {
    const R = rng('rocks'), want = Math.round(P.rocks * k);
    for (let tries = 0; tries < want * 10 && rocks.length < want; tries++) {
      const x = R.float(-lim, lim), z = R.float(-lim, lim);
      const big = R.chance(P.big), s = big ? R.float(2.1, 3.1) : R.float(0.55, 1.45);
      const tall = R.chance(P.tall), slab = !tall && R.chance(P.slab);
      const sx = s * (tall ? R.float(0.5, 0.7) : slab ? R.float(1.5, 2.1) : R.float(0.85, 1.25)), sz = s * (tall ? R.float(0.4, 0.6) : slab ? R.float(1.1, 1.5) : R.float(0.85, 1.25));
      const sy = s * (tall ? R.float(1.9, 2.8) : slab ? R.float(0.4, 0.6) : R.float(0.7, 1.05));
      const rad = Math.max(sx, sz) * 1.05;
      const wantCol = rad >= 1.5 && ncol < 12;
      if (rad >= 1.5 && !wantCol) continue;   // collider budget spent: no more big ones
      if (!heavy(x, z, rad, wantCol ? 18 : 5)) continue;
      const [lo, hi] = span(x, z, rad * 0.8);
      if (hi - lo > (wantCol ? 2.2 : 3.4)) continue;
      const it = { x, y: lo + sy * 0.5, z, sx, sy, sz, ry: R.float(0, TAU), rx: R.float(-0.12, 0.12), rz: R.float(-0.12, 0.12), c: shade(pickC(R, P.rockC), R), kind: 'rock', col: wantCol };
      if (wantCol) { ncol++; it.rx = it.rz = 0; }
      rocks.push(it); taken.add(x, z, rad);
      if (R.chance(0.4)) for (let q = R.int(1, 3); q > 0; q--) {   // satellites: small stones leaning on the big one
        const a = R.float(0, TAU), d = rad + R.float(0.3, 1.1), qx = x + Math.cos(a) * d, qz = z + Math.sin(a) * d, qs = s * R.float(0.25, 0.5);
        if (!clear(qx, qz, qs) || dpath(qx, qz) < 4 || obst.hit(qx, qz, qs) || taken.hit(qx, qz, qs * 0.6)) continue;
        rocks.push({ x: qx, y: span(qx, qz, qs)[0] + qs * 0.4, z: qz, sx: qs * R.float(0.9, 1.4), sy: qs * R.float(0.6, 1), sz: qs * R.float(0.9, 1.4), ry: R.float(0, TAU), rx: R.float(-0.2, 0.2), rz: R.float(-0.2, 0.2), c: shade(pickC(R, P.rockC), R), kind: 'rock', col: false });
        taken.add(qx, qz, qs * 0.6);
      }
    }
    const nm = Math.round(P.mounds * k);   // snow drifts / dunes: flat, wide, no collider (walk over them)
    for (let tries = 0; tries < nm * 8 && rocks.filter((q) => q.kind === 'mound').length < nm; tries++) {
      const x = R.float(-lim, lim), z = R.float(-lim, lim), w = R.float(2.6, 5.6);
      if (!clear(x, z, w * 0.5) || dpath(x, z) < 3 + w * 0.3 || obst.hit(x, z, w * 0.5) || taken.hit(x, z, w * 0.4)) continue;
      const [lo] = span(x, z, w * 0.4);
      rocks.push({ x, y: lo - 0.05, z, sx: w, sy: R.float(0.5, 0.95), sz: w * R.float(0.6, 0.95), ry: R.float(0, TAU), rx: 0, rz: 0, c: shade(pickC(R, P.moundC), R, 0.1), kind: 'mound', col: false });
      taken.add(x, z, w * 0.35);
    }
  }

  // ---- tufts in clumps
  const tufts = [];
  {
    const R = rng('tufts');
    P.tufts.forEach((total, kind) => {
      const want = Math.round(total * k), pal = kind ? P.tuftB : P.tuftA, reed = P.tex[kind] === 'reed';
      let made = 0;
      for (let tries = 0; tries < want && made < want; tries++) {
        const cx = R.float(-lim, lim), cz = R.float(-lim, lim);
        if (!clear(cx, cz, 1) || dpath(cx, cz) < 2.8) continue;
        const spread = R.float(2.2, 5), n = R.int(kind ? 3 : 5, kind ? 6 : 10), base = pickC(R, pal);
        for (let i = 0; i < n && made < want; i++) {
          const a = R.float(0, TAU), d = Math.sqrt(R.float(0, 1)) * spread, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
          if (dpath(x, z) < 2.6 || !clear(x, z, 0) || obst.hit(x, z, 0.3) || taken.hit(x, z, 0)) continue;
          const w = reed ? R.float(0.7, 1.1) : kind ? R.float(0.9, 1.5) : R.float(0.8, 1.5), hh = reed ? R.float(1.3, 2.1) : kind ? R.float(0.6, 1.1) : R.float(0.5, 1.0);
          tufts.push({ x, y: h(x, z) - 0.04, z, w, h: hh, ry: R.float(0, TAU), c: shade(base, R, 0.24), k: kind }); made++;
        }
      }
    });
  }

  // ---- snags (dead trees) + stumps
  const snags = [], stumps = [];
  {
    const R = rng('wood');
    const ns = Math.round(P.snags * k * 1.5);
    for (let tries = 0; tries < ns * 10 && snags.length < ns; tries++) {
      const x = R.float(-lim, lim), z = R.float(-lim, lim), s = R.float(0.85, 1.6);
      if (!heavy(x, z, 1.1, 6)) continue;
      snags.push({ x, y: span(x, z, 0.5)[0] - 0.15, z, s, ry: R.float(0, TAU), rx: R.float(-0.1, 0.1), rz: R.float(-0.1, 0.1), c: shade(pickC(R, P.snagC), R, 0.2) });
      taken.add(x, z, 1.0);
      if (R.chance(0.35)) for (let q = R.int(1, 2); q > 0; q--) {   // a felled neighbour: a stump beside the snag
        const a = R.float(0, TAU), d = R.float(1.6, 3.2), sx = x + Math.cos(a) * d, sz = z + Math.sin(a) * d;
        if (heavy(sx, sz, 0.7, 4) && stumps.length < 60) { stumps.push({ x: sx, y: span(sx, sz, 0.4)[0] - 0.1, z: sz, s: R.float(0.7, 1.3), ry: R.float(0, TAU), c: shade(pickC(R, P.snagC), R, 0.2) }); taken.add(sx, sz, 0.6); }
      }
    }
    const nt = Math.round(P.stumps * k * 1.3);
    for (let tries = 0; tries < nt * 8 && stumps.length < nt + 8; tries++) {
      const x = R.float(-lim, lim), z = R.float(-lim, lim);
      if (!heavy(x, z, 0.7, 4)) continue;
      stumps.push({ x, y: span(x, z, 0.4)[0] - 0.1, z, s: R.float(0.7, 1.4), ry: R.float(0, TAU), c: shade(pickC(R, P.snagC), R, 0.2) });
      taken.add(x, z, 0.6);
    }
  }

  // ---- points of interest: two beside the walk (14-30 m off the path so they read from the route), the rest spread out, >= 26 m apart
  const pois = [];
  {
    const R = rng('poi'), want = Math.max(4, Math.min(9, Math.round(P.pois * k) + 1));
    const W = POI_W[fam] || POI_W.hills;
    // weighted draw WITHOUT replacement: the first five POIs are five different kinds (the family's favourites first), then it refills
    let left = [];
    const draw = () => {
      if (!left.length) left = POI_KINDS.slice();
      let tot = 0; for (const kd of left) tot += W[kd] ?? 1;
      let r = R.next() * tot, pick = left[left.length - 1];
      for (const kd of left) { r -= W[kd] ?? 1; if (r <= 0) { pick = kd; break; } }
      left.splice(left.indexOf(pick), 1);
      return pick;
    };
    const order = [];
    while (order.length < want) order.push(draw());
    const pts = o.pathPts || [];
    const flatOk = (x, z) => { const [lo, hi] = span(x, z, POI_R * 0.8); return hi - lo <= 1.3; };
    const spaced = (x, z) => pois.every((q) => Math.hypot(q.x - x, q.z - z) > 22);
    order.forEach((kind, i) => {
      for (let t = 0; t < 160; t++) {
        let x, z;
        if (i < 2 && pts.length > 6) {   // beside the route
          const idx = Math.floor(pts.length * (i === 0 ? R.float(0.25, 0.5) : R.float(0.55, 0.85))), p = pts[Math.min(pts.length - 1, idx)], q = pts[Math.min(pts.length - 1, idx + 1)];
          const tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1, side = R.sign(), lat = R.float(14, 30);
          x = p.x - (tz / tl) * lat * side; z = p.z + (tx / tl) * lat * side;
        } else { x = R.float(-lim, lim); z = R.float(-lim, lim); }
        if (!heavy(x, z, POI_R, 12) || !spaced(x, z) || !flatOk(x, z)) continue;
        pois.push({ id: kind.slice(0, 3) + i, kind, x, y: h(x, z), z, yaw: R.float(0, TAU), r: POI_R });
        taken.add(x, z, POI_R);
        return;
      }
    });
  }

  // ---- fog pools: the flattest, lowest spots (a flat card in a hollow reads as pooled fog, on a slope it would slice the hill)
  const fog = [];
  {
    const R = rng('fog'), want = Math.round(P.fog * k), cand = [];
    for (let i = 0; i < want * 24; i++) {
      const x = R.float(-lim, lim), z = R.float(-lim, lim), r = R.float(9, 19);
      if (!clear(x, z, r * 0.4) || Math.hypot(x, z) < 26 + r * 0.3 || (e && Math.hypot(x - e.x, z - e.z) < 22 + r * 0.3)) continue;
      const [lo, hi] = span(x, z, r * 0.6);
      if (hi - lo > 2.6) continue;
      let ring = 0; for (let q = 0; q < 8; q++) ring += h(x + Math.cos(q * TAU / 8) * r * 1.3, z + Math.sin(q * TAU / 8) * r * 1.3);
      cand.push({ x, z, r, hi, lo, dep: ring / 8 - h(x, z), a: P.fogA * R.float(0.7, 1.1), ry: R.float(0, TAU) });
    }
    cand.sort((a, b) => b.dep - a.dep);
    for (const c of cand) {
      if (fog.length >= want) break;
      if (fog.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < (q.r + c.r) * 0.8)) continue;
      fog.push({ x: c.x, y: Math.min(c.hi + 0.1, c.lo + 1.5) + 0.15, z: c.z, r: c.r, ry: c.ry, a: c.a });
    }
  }
  return { family: fam, key, rocks, tufts, snags, stumps, pois, fog, fx: P.fx ? { kind: P.fx, n: P.fxN } : null, colliders: rocks.filter((q) => q.col).length, profile: P };
}

// ------------------------------------------------------------------ horizon: shapes as data
/** A second skyline ring BEHIND mapart's (radius R2, paler, taller pieces), a few red mast beacons and one Algorithm watcher tower (a ring on a mast, facing the ship).
 *  shape: { t:'box'|'cone'|'cyl'|'frust'|'dome'|'ring', seg, x, y (centre), z, sx, sy, sz (sx/sz = diameter for round shapes, sy = height), rx, ry, rz }  -> { shapes, beacons, eye } */
export function skylineSpecs(fam, seed, sc = 1, R2 = 260) {
  const R = new RNG(hashString(`outlife10|sky|${fam}|${seed | 0}`));
  const shapes = [], beacons = [], Y0 = -6;
  const put = (t, a, d, w, hh, dp, o = {}) => {
    const x = Math.cos(a) * (R2 + d), z = Math.sin(a) * (R2 + d), y0 = Y0 + (o.y || 0);
    shapes.push({ t, seg: o.seg || 0, x, y: y0 + hh / 2, z, sx: w, sy: hh, sz: dp, rx: o.rx || 0, ry: o.ry ?? (-a + Math.PI / 2), rz: o.rz || 0 });
    return { x, z, top: y0 + hh };
  };
  const jit = (i, n) => (i / n) * TAU + R.float(-0.4, 0.4) / n * 2;
  const mast = (a, hh) => { const m = put('cyl', a, R.float(-8, 8), 2.2, hh, 2.2, { seg: 5 }); put('box', a, 0, 15, 1.2, 1.2, { y: hh - 9, ry: -a + Math.PI / 2 }); beacons.push([m.x, m.top + 1.2, m.z]); };
  const domes = (n, wlo, whi, hlo, hhi, dOff = 0) => { for (let i = 0; i < n; i++) put('dome', jit(i, n), dOff + R.float(0, 30), R.float(wlo, whi), R.float(hlo, hhi), R.float(50, 90)); };
  const pylon = (a, hh) => { put('cyl', a, 0, 2.4, hh, 2.4, { seg: 4 }); put('box', a, 0, 18, 1.4, 1.4, { y: hh - 7 }); put('box', a, 0, 12, 1.2, 1.2, { y: hh - 15 }); };
  const turbine = (a, hh) => {
    const tw = put('cyl', a, 0, 2.6, hh, 2.6, { seg: 6 }), ry = -a + Math.PI / 2, hubY = Y0 + hh;
    const hubX = tw.x, hubZ = tw.z, ph = R.float(0, TAU);
    for (let b = 0; b < 3; b++) {
      const phi = ph + (b * TAU) / 3, L = 26, lx = -Math.sin(phi) * L / 2, ly = Math.cos(phi) * L / 2;
      shapes.push({ t: 'box', seg: 0, x: hubX + lx * Math.cos(ry), y: hubY + ly, z: hubZ - lx * Math.sin(ry), sx: 1.6, sy: L, sz: 0.7, rx: 0, ry, rz: phi });
    }
    shapes.push({ t: 'box', seg: 0, x: hubX, y: hubY, z: hubZ, sx: 3.4, sy: 3.4, sz: 5, rx: 0, ry, rz: 0 });
  };
  switch (fam) {
    case 'swamp': {
      for (let g = 0; g < 16; g++) { const a0 = R.float(0, TAU); for (let i = R.int(3, 5); i > 0; i--) put('cone', a0 + R.float(-0.03, 0.03), R.float(0, 12), R.float(8, 15), R.float(32, 56), R.float(8, 15), { seg: 5, ry: 0 }); }
      for (let i = 0; i < 3; i++) { const a = R.float(0, TAU); for (const [ox, oz] of [[-4, -4], [4, -4], [4, 4], [-4, 4]]) shapes.push({ t: 'cyl', seg: 4, x: Math.cos(a) * (R2 + 10) + ox, y: Y0 + 17, z: Math.sin(a) * (R2 + 10) + oz, sx: 1.2, sy: 34, sz: 1.2, rx: 0, ry: 0, rz: 0 }); put('cyl', a, 10, 14, 12, 14, { y: 33, seg: 7, ry: 0 }); put('cone', a, 10, 15, 6, 15, { y: 45, seg: 7, ry: 0 }); }
      for (let i = 0; i < 2; i++) put('frust', R.float(0, TAU), 0, 12, R.float(62, 84), 12, { seg: 8, ry: 0 });
      domes(20, 60, 100, 8, 16);
      break;
    }
    case 'snow': {
      for (let i = 0; i < 26; i++) { const a = jit(i, 26), w = R.float(50, 92), hh = R.float(48, 108); put('cone', a, R.float(0, 26), w, hh, w * R.float(0.8, 1), { seg: 4, ry: R.float(0, 3) }); if (R.chance(0.6)) put('cone', a + R.float(0.02, 0.05), 10, w * 0.6, hh * 0.55, w * 0.5, { seg: 4, ry: R.float(0, 3) }); }
      { const a0 = R.float(0, TAU); for (let i = 0; i < 5; i++) { const a = a0 + i * 0.1; put('cyl', a, 0, 2, 34, 2, { seg: 4 }); put('box', a, 0, 5, 4, 4, { y: 12 }); put('box', a, 0, 12, 1.2, 1.2, { y: 32 }); } }
      break;
    }
    case 'desert': {
      for (let i = 0; i < 12; i++) { const a = jit(i, 12), w = R.float(46, 90), hh = R.float(26, 50); put('frust', a, R.float(0, 20), w * 1.35, hh * 0.6, w * 0.9, { seg: 6, ry: R.float(0, 3) }); put('box', a, 0, w, hh * 0.42, w * 0.7, { y: hh * 0.58 - 2, ry: -a + Math.PI / 2 }); }
      domes(16, 110, 170, 10, 22, 14);
      for (let i = 0; i < 2; i++) { const a = R.float(0, TAU); put('cyl', a, 0, 2, 40, 2, { seg: 5 }); put('dome', a, 0, 28, 13, 28, { y: 46, rx: Math.PI * 0.82, ry: -a + Math.PI / 2 }); beacons.push([Math.cos(a) * R2, Y0 + 62, Math.sin(a) * R2]); }
      break;
    }
    case 'moor': {
      for (let i = 0; i < 16; i++) { const a = jit(i, 16); for (let j = R.int(2, 4); j > 0; j--) put('box', a + R.float(-0.02, 0.02), R.float(0, 8), R.float(8, 22), R.float(8, 24), R.float(8, 16), { y: R.float(0, 6), ry: R.float(0, 3) }); }
      { const a0 = R.float(0, TAU); for (let i = 0; i < 7; i++) put('box', a0 + i * 0.022, -R.float(0, 3), 3.4, R.float(12, 17), 2.2); }
      domes(22, 70, 120, 14, 32);
      break;
    }
    case 'blackforest': {
      for (let i = 0; i < 84; i++) { const a = (i / 84) * TAU + R.float(-0.02, 0.02), w = R.float(16, 26), hh = R.float(44, 72); put('cone', a, R.float(0, 14), w, hh, w, { seg: 5, ry: 0 }); put('cone', a, R.float(0, 14), w * 0.62, hh * 0.6, w * 0.62, { seg: 5, y: hh * 0.42, ry: 0 }); }
      for (let i = 0; i < 2; i++) put('frust', R.float(0, TAU), 20, 34, 76, 34, { seg: 8, ry: 0 });
      { const a = R.float(0, TAU); put('cyl', a, 6, 5, 70, 5, { seg: 5 }); for (let b = 0; b < 5; b++) put('box', a, 6, 1.6, R.float(14, 24), 1.6, { y: 30 + b * 8, rz: R.sign() * R.float(0.7, 1.1) }); }
      break;
    }
    case 'datascape': {
      for (let i = 0; i < 24; i++) { const a = jit(i, 24), w = R.float(8, 16); put('box', a, R.float(0, 26), w, R.float(40, 124), R.float(6, 10), { rz: R.float(-0.04, 0.04) }); }
      domes(14, 70, 110, 10, 22);
      break;
    }
    case 'servermarsh': {
      for (let i = 0; i < 18; i++) { const a = jit(i, 18); put('box', a, R.float(0, 20), R.float(8, 14), R.float(20, 46), R.float(8, 12), { rz: R.float(-0.25, 0.25) }); }
      for (let i = 0; i < 3; i++) { const a = R.float(0, TAU); for (const [ox, oz] of [[-4, -4], [4, -4], [4, 4], [-4, 4]]) shapes.push({ t: 'cyl', seg: 4, x: Math.cos(a) * R2 + ox, y: Y0 + 17, z: Math.sin(a) * R2 + oz, sx: 1.2, sy: 34, sz: 1.2, rx: 0, ry: 0, rz: 0 }); put('cyl', a, 0, 14, 12, 14, { y: 33, seg: 7, ry: 0 }); }
      domes(16, 60, 100, 6, 14);
      break;
    }
    case 'ashfield': {
      for (let i = 0; i < 9; i++) { const a = R.float(0, TAU), w = R.float(6, 10); put('frust', a, R.float(0, 20), w, R.float(60, 112), w, { seg: 8, ry: 0 }); }
      for (let i = 0; i < 12; i++) { const a = jit(i, 12); for (let j = R.int(2, 4); j > 0; j--) put('box', a + R.float(-0.02, 0.02), 6, R.float(6, 12), R.float(14, 44), R.float(6, 10), { rz: R.float(-0.08, 0.08) }); }
      domes(20, 80, 130, 10, 26);
      break;
    }
    case 'crystal': {
      for (let i = 0; i < 30; i++) { const a = jit(i, 30), w = R.float(10, 22); put('cone', a, R.float(0, 26), w, R.float(60, 132), w, { seg: 5, rz: R.float(-0.14, 0.14), ry: R.float(0, 3) }); }
      domes(12, 80, 120, 8, 18);
      break;
    }
    case 'pier': {
      for (let i = 0; i < 14; i++) { const a = jit(i, 14); for (let j = R.int(1, 3); j > 0; j--) put('box', a + R.float(-0.01, 0.01), R.float(0, 12), 22, 8, 9, { y: j * 8 - 8 }); }
      for (let i = 0; i < 3; i++) { const a = R.float(0, TAU); put('box', a, 0, 3, 58, 3, { y: 0 }); put('box', a, 0, 50, 2.6, 2.6, { y: 56 }); put('box', a, 0, 3, 58, 3, { y: 0, ry: -a + Math.PI / 2 }); }
      domes(10, 70, 100, 6, 12);
      break;
    }
    default: {   // hills
      domes(30, 70, 120, 22, 46);
      { const a0 = R.float(0, TAU); for (let i = 0; i < 6; i++) pylon(a0 + i * 0.085, 44); }
      for (let i = 0; i < 3; i++) turbine(R.float(0, TAU), R.float(46, 56));
    }
  }
  for (let i = 0; i < 3; i++) mast(R.float(0, TAU), R.float(58, 86));
  const ea = R.float(0, TAU), ery = -ea + Math.PI / 2, ex = Math.cos(ea) * (R2 + 40), ez = Math.sin(ea) * (R2 + 40);
  const eye = { x: ex, z: ez, a: ea };
  shapes.push({ t: 'box', seg: 0, x: ex, y: Y0 + 46, z: ez, sx: 4.6, sy: 92, sz: 4.6, rx: 0, ry: ery, rz: 0 });
  shapes.push({ t: 'ring', seg: 0, x: ex, y: Y0 + 100, z: ez, sx: 28, sy: 28, sz: 28, rx: 0, ry: ery, rz: 0 });
  shapes.push({ t: 'box', seg: 0, x: ex, y: Y0 + 100, z: ez, sx: 9, sy: 9, sz: 2, rx: 0, ry: ery, rz: Math.PI / 4 });
  beacons.push([ex, Y0 + 116, ez]);
  return { shapes, beacons, eye };
}
