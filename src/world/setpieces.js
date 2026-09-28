// Facility SET PIECES: vertical space + environmental hazards layered on top of buildFacility().
//
//   buildSetPieces(ctx) -> SetPieces { scrapSpots, zones, update(dt, game), dispose(physics), vents, sparks, ... }
//     ctx = { layout, group, physics, lightPool, rng, addBox(cx,cy,cz,sx,sy,sz), placeProp(id,x,y,z,rotY),
//             nav, Y, CELL, levelMaterial, GeoBuilder }
//     Call it AFTER every facility prop/door is placed but BEFORE the facility pushes its emitters into the
//     light pool, merges static props and filters scrap spots (lamps/stairs placed through ctx.placeProp then
//     get their lights, merging and nav blocking like any other prop). Run later decoration that reads the
//     nav grid (decorateMineshaft) after it, then call sp.releaseNav(): stair approaches and skull spots are
//     held unwalkable (walk = 2) until then so that decoration keeps them clear. update() also releases.
//   planDarkCorridors(layout) -> Set<cellIndex> with .runs = [[cellIndex...]...]  (runs of 3-6 cells)
//     Pure + memoised per layout. facility.js skips its corridor lamps in these cells (mineshaft.js hangs
//     dead lanterns there); buildSetPieces puts broken, sparking fixtures there.
//   slowFactorAt(zones, pos) -> 1 | 0.6            (wading through the flooded room)
//   stepSoundAt(zones, pos)  -> 'fish_splash' | null
//   surfaceAt(zones, pos)    -> 'metal' | null     (catwalk decks / stairs: use step_metal footsteps)
//
// Set pieces (all placement from ctx.rng -> identical on every peer). Each set piece kind, and each room
// inside it, draws from its own rng.fork(), so one rejected candidate never shifts the others. Overlap
// tests against already placed props never depend on which downloaded GLB models loaded on this peer
// (see propBox): a model that failed to load became a crate, so both get the same generic footprint.
//   a) CATWALKS  tall rooms (height >= 6): grating ring at 3.4 m along the walls, railings, optional centre
//                bridge, 1-2 stairs_metal runs (+ top step(s) from the stair's measured rise up to the deck;
//                the prop's collider-only stairs get rail colliders on both sides), hanging lamps, elevated
//                scrap spots. Chasers only hit within 2.2 m of height -> the deck is a refuge.
//   b) STEAM     boiler rooms (+ mansion kitchens) and straight factory corridor cells: pipe_vertical + nozzle.
//                Bursts run off a clock derived from the host-replicated run.time, so every peer sees the same
//                burst. High jets (1.48 m) can be crouched under, low jets (0.75 m) must be timed.
//                Local player damage is client side (game.damageLocal(6, 'steam') every 0.3 s in the jet).
//                The host stuns creatures that walk into a burst. The red wheel on each pipe closes that
//                vent for 60 s (host-authoritative: request 'spValve' -> broadcast 'spVent').
//                Hazards idle outside the 'moon' phase (landing / takeoff: the host's day clock is frozen).
//   c) FLOOD     at most one room: dark water at 0.35 m (0.6x speed, splash footsteps, drips). Never the
//                entrance / vault / generator, nor a mineshaft 'flooded_cave' (it has its own water).
//   d) DARK      corridor runs without working lamps; dangling fixtures spark (sound + brief light flash):
//                fluorescent tubes, or severed cables in the mineshaft theme.
//   e) BLOOD     drag trail from a doorway to a room corner, wall smear, skull scrap spot at the end.
//
//   f) HAZARDS   interiors/hazards.js (built by facility.js after the theme decoration, attached as sp.hazards):
//                laser grids, breaker rooms, cave-ins, vent shortcuts, toxic sludge. update / interactables /
//                net ('spHz' request, 'spHzB' broadcast, 'spHzState' late-join sync) / dispose run from here.
//   Theme hooks: ctx.interior.steamRooms (extra boiler-like room types), ctx.interior.noFlood.
//
// Zones (sp.zones, also exposed as facility.zones):
//   { type:'steam', pos:Vector3(jet centre), radius, period, phase, burst, warn, from:[x,y,z], dir:[dx,dz], len,
//     jetRadius, high, room, vent }
//   { type:'water', min:[x,z], max:[x,z], y, room }
//   { type:'dark', pos:Vector3, radius, cells:[cellIndex] }
//   { type:'catwalk', min:[x,z], max:[x,z], hole:[x0,z0,x1,z1]|null, y, room }
//   { type:'stairs', min:[x,z], max:[x,z], y0, y1, room }
//   { type:'toxic', min:[x,z], max:[x,z], y, room }     (sewer sludge pits; they also get a 'water' zone)
// Scrap spots: { x, y, z, room, type } (+ elevated:true on decks, item:'skull' at the end of blood trails).
//
// Static colliders are created ONLY through ctx.addBox (tracked and released by the facility), so
// dispose() never touches physics; it removes this module's emitters, meshes, geometries, materials,
// textures and the interactable hook.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { createProp } from '../models/props.js';
import { t, tf } from '../core/i18n.js';

// ------------------------------------------------------------------------------------ tuning
const CATWALK_H = 3.4;           // deck top above the floor
const CATWALK_W = 1.2;           // walkway width
const DECK_T = 0.2;              // collider thickness
const RAIL_H = 1.1;
const TOP_STEP_RISE = 0.21;      // max rise of the extra top step(s) between the stair's top and the deck
const STAIR_RAIL_H = 0.95;       // stairs_metal handrail height above the treads
const BRIDGE_W = 1.4;
// Generic footprint of downloaded GLB props (and of crate_wood, their fallback when a model did not load):
// free-standing ones get a square around their position, wall-mounted ones a slab out from their wall.
const GEN_HALF = 1.05;           // free-standing: listed models are bottom-centred, kst_bed_single reaches 1.0 m
const GEN_WALL_HALF = 0.95;      // wall-mounted: +-0.95 m along the wall (kst_computer_system is 1.8 m)
const GEN_WALL_DEPTH = 2.5;      // ... reaching 2.5 m out from the wall (psx_pipes lies 2.43 m deep)
const GEN_WALL_SNAP = 1.6;       // wall props sit (depth / 2 + 0.06) m out from their wall
const GEN_H = 2.7;               // tallest listed model is 2.6 m (kcv_robot_arm_a)
const WATER_H = 0.35;
const WATER_SLOW = 0.6;
const STEAM_BURST = 1.8;
const STEAM_WARN = 0.9;
const STEAM_TICK = 0.3;
const STEAM_DMG = 6;
const VALVE_OFF = 60;
const PLAYER_R = 0.34;
const TUBE_DIM = 0x3a4442;
const TUBE_LIT = 0xeaffff;
const CABLE_DIM = 0x5a3a22;
const CABLE_LIT = 0xfff2b0;

const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
const INWARD = [[-1, 0], [0, -1], [1, 0], [0, 1]];                 // edge d of a cell -> back into the cell
const WALL_ROT = [-Math.PI / 2, Math.PI, Math.PI / 2, 0];          // prop front (+Z) faces into the cell
const SKIP_ROOMS = new Set(['entrance', 'vault', 'generator', 'core']);
const NO_FLOOD = new Set(['flooded_cave', 'poolrooms', 'overflow', 'sludge_pit', 'cistern']);   // rooms with their own water
const FLOOD_W = { bathroom: 4, boiler: 3, kitchen: 3, nest: 2, storage: 2, lab: 2, lockers: 2, collapsed_shaft: 2 };
// creature types the steam may stun (simple state machines that recover from 'stunned' -> 'idle')
const STUN_STATES = new Set(['idle', 'walk', 'run', 'attack']);
const NO_STUN = new Set(['jester', 'mannequin', 'mimicdoor', 'turret', 'mine', 'web', 'leech', 'sludge', 'yoinker']);

// --------------------------------------------------------------------------- small helpers
// cosmetic-only randomness (particles, drips): never used for anything peers must agree on
let _cs = 0x2545f491;
function crand() { _cs ^= _cs << 13; _cs ^= _cs >>> 17; _cs ^= _cs << 5; return (_cs >>> 0) / 4294967296; }
function hash01(a, b) {
  let h = Math.imul((a | 0) ^ 0x27d4eb2d, 0x9e3779b1) ^ Math.imul(((b | 0) + 0x165667b1) | 0, 0x85ebca77);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const _v2 = new THREE.Vector2();
const _tmp = new THREE.Vector3();

// stairs_metal measured from its own colliders (what players actually walk on), once per session.
// Stairs rise toward local -Z; zTop is the local z of the top end, cx the lateral centre.
let STAIR = null;
function stairDims() {
  if (STAIR) return STAIR;
  let d = { rise: 3, run: 5, w: 2, stepRun: 5 / 15, zTop: -2.5, cx: 0 };   // documented stairs_metal
  let o = null;
  try {
    o = createProp('stairs_metal', { seed: 1 });
    const cols = o.userData.colliders || [];
    if (cols.length) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = -Infinity, sz = Infinity;
      for (const c of cols) {
        x0 = Math.min(x0, c.c[0] - c.s[0] / 2); x1 = Math.max(x1, c.c[0] + c.s[0] / 2);
        z0 = Math.min(z0, c.c[2] - c.s[2] / 2); z1 = Math.max(z1, c.c[2] + c.s[2] / 2);
        y1 = Math.max(y1, c.c[1] + c.s[1] / 2);
        sz = Math.min(sz, c.s[2]);
      }
      const th = o.userData.topHeight;
      if (Number.isFinite(th) && Math.abs(th - y1) > 0.05) console.warn('setpieces: stairs_metal topHeight', th, 'but colliders reach', y1);
      d = { rise: y1, run: z1 - z0, w: x1 - x0, stepRun: Math.min(sz, z1 - z0), zTop: z0, cx: (x0 + x1) / 2 };
    }
  } catch (e) { console.warn('setpieces: stairs_metal probe failed', e); }
  if (o) o.traverse((m) => { if (m.geometry && !m.geometry.userData?.shared) m.geometry.dispose(); });
  STAIR = d;
  return d;
}
// quarter-turn rotation of a local (x, z) offset, exactly as facility.js rotates prop colliders
function rotQ(x, z, q) {
  for (let k = 0; k < q; k++) { const t = x; x = z; z = -t; }
  return [x, z];
}

// Is a body (vertical capsule from feetY to topY, radius) inside a horizontal steam jet?
function jetHits(v, x, feetY, z, topY, radius) {
  const rx = x - v.ox, rz = z - v.oz;
  let t = rx * v.dx + rz * v.dz;
  if (t < 0) t = 0; else if (t > v.len) t = v.len;
  const hx = rx - v.dx * t, hz = rz - v.dz * t;
  const lo = feetY + radius, hi = Math.max(lo, topY - radius);
  const cy = v.oy < lo ? lo : v.oy > hi ? hi : v.oy;
  const dv = v.oy - cy;
  const R = v.jr + radius;
  return hx * hx + hz * hz + dv * dv < R * R;
}

// ------------------------------------------------------------------------ zone queries
function inWater(z, pos) {
  return pos.x >= z.min[0] && pos.x <= z.max[0] && pos.z >= z.min[1] && pos.z <= z.max[1] && pos.y < z.y + 0.05 && pos.y > z.y - 2;
}
/** Movement multiplier for a feet position: 0.6 while wading through flood water, else 1. */
export function slowFactorAt(zones, pos) {
  if (!zones || !pos) return 1;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (z.type === 'water' && inWater(z, pos)) return WATER_SLOW;
  }
  return 1;
}
/** Footstep override: 'fish_splash' in flood water, else null (keep the normal step sound). */
export function stepSoundAt(zones, pos) {
  if (!zones || !pos) return null;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (z.type === 'water' && inWater(z, pos)) return 'fish_splash';
  }
  return null;
}
/** Footstep surface override: 'metal' on catwalk decks / stairs, else null. */
export function surfaceAt(zones, pos) {
  if (!zones || !pos) return null;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (z.type === 'catwalk') {
      if (pos.y < z.y - 0.45 || pos.y > z.y + 0.6) continue;
      if (pos.x < z.min[0] || pos.x > z.max[0] || pos.z < z.min[1] || pos.z > z.max[1]) continue;
      const h = z.hole;
      if (h && pos.x > h[0] && pos.x < h[2] && pos.z > h[1] && pos.z < h[3]) continue;
      return 'metal';
    } else if (z.type === 'stairs') {
      if (pos.y < z.y0 + 0.1 || pos.y > z.y1 + 0.3) continue;
      if (pos.x < z.min[0] - 0.2 || pos.x > z.max[0] + 0.2 || pos.z < z.min[1] - 0.2 || pos.z > z.max[1] + 0.2) continue;
      return 'metal';
    }
  }
  return null;
}

// -------------------------------------------------------------------- dark corridor plan
const darkCache = new WeakMap();
/**
 * Corridor cells whose lamps are "broken" (deterministic from the layout seed, memoised per layout).
 * Returns a Set of cell indices with an extra `.runs` array (connected runs of 3-6 cells).
 */
export function planDarkCorridors(L) {
  let s = darkCache.get(L);
  if (s) return s;
  s = new Set();
  s.runs = [];
  darkCache.set(L, s);
  const rng = new RNG((L.seed ^ 0x0da4c0de) >>> 0);
  const W = L.w, H = L.h;
  const cand = [];
  for (let i = 0; i < W * H; i++) if (L.cells[i] === 2 && L.distOf[i] > 5) cand.push(i);
  if (!cand.length) return s;
  const want = 1 + Math.round((L.size || 1) * 1.5);
  for (let guard = 0; s.runs.length < want && guard < 40; guard++) {
    const seed = cand[Math.floor(rng.next() * cand.length)];
    const sx = seed % W, sz = (seed / W) | 0;
    let near = false;
    for (const j of s) if (Math.abs((j % W) - sx) + Math.abs(((j / W) | 0) - sz) < 4) { near = true; break; }
    if (near) continue;
    const len = rng.int(3, 6);
    const run = [seed], q = [seed], seen = new Set(run);
    while (q.length && run.length < len) {
      const i = q.shift();
      const x = i % W, z = (i / W) | 0;
      for (let d = 0; d < 4 && run.length < len; d++) {
        const nx = x + DX[d], nz = z + DZ[d];
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const ni = L.idx(nx, nz);
        if (seen.has(ni) || L.cells[ni] !== 2 || !L.open.has(L.edgeKey(x, z, d))) continue;
        seen.add(ni); run.push(ni); q.push(ni);
      }
    }
    if (run.length < 3) continue;   // dead-end stubs: too short to read as a dark stretch
    for (const i of run) s.add(i);
    s.runs.push(run);
  }
  return s;
}

// ------------------------------------------------------------------------ particles
// Tiny ring-buffer particle system on one THREE.Points (per-vertex alpha fades, no per-frame allocation).
class Puffs {
  constructor(n, material, center, radius) {
    this.n = n;
    this.p = new Float32Array(n * 3);
    this.v = new Float32Array(n * 3);
    this.c = new Float32Array(n * 4);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.next = 0;
    this.alive = 0;
    for (let i = 0; i < n; i++) { this.p[i * 3] = center.x; this.p[i * 3 + 1] = center.y; this.p[i * 3 + 2] = center.z; }
    const g = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
    this.ca = new THREE.BufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pa);
    g.setAttribute('color', this.ca);
    g.boundingSphere = new THREE.Sphere(center.clone(), radius);
    this.geo = g;
    this.points = new THREE.Points(g, material);
    this.points.visible = false;
    this.points.renderOrder = 3;
    this.points.userData.setPiece = true;
  }
  emit(x, y, z, vx, vy, vz, life) {
    const i = this.next;
    this.next = (i + 1) % this.n;
    const k = i * 3;
    this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z;
    this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz;
    this.age[i] = 0; this.life[i] = life;
    this.alive++;
    this.points.visible = true;
  }
  // drag: 1/s velocity damping, lift: vertical acceleration (negative = gravity)
  step(dt, drag, lift, alphaMax) {
    const p = this.p, v = this.v, c = this.c;
    const f = Math.max(0, 1 - drag * dt);
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      const life = this.life[i];
      if (life <= 0) continue;
      const a = (this.age[i] += dt);
      const q = i * 4;
      if (a >= life) { this.life[i] = 0; c[q + 3] = 0; continue; }
      const k = i * 3;
      v[k] *= f; v[k + 1] = v[k + 1] * f + lift * dt; v[k + 2] *= f;
      p[k] += v[k] * dt; p[k + 1] += v[k + 1] * dt; p[k + 2] += v[k + 2] * dt;
      c[q] = 1; c[q + 1] = 1; c[q + 2] = 1;
      c[q + 3] = alphaMax * Math.min(1, a * 12) * (1 - a / life);
      alive++;
    }
    this.alive = alive;
    this.pa.needsUpdate = true;
    this.ca.needsUpdate = true;
    if (!alive) this.points.visible = false;
  }
}

function makePuffTexture() {
  const S = 16, data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = ((x + 0.5) / S) * 2 - 1, dy = ((y + 0.5) / S) * 2 - 1;
    const a = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
    const k = (y * S + x) * 4;
    data[k] = 255; data[k + 1] = 255; data[k + 2] = 255;
    data[k + 3] = Math.round(Math.pow(a, 1.2) * 255);
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------------ networking glue
// One live SetPieces at a time (the loaded facility). Net handlers are bound once per session and route
// to it; stale messages are ignored by the seed check.
let ACTIVE = null;
const BOUND_NETS = new WeakSet();
function bindNet(game) {
  const net = game.net;
  if (!net || BOUND_NETS.has(net)) return;
  BOUND_NETS.add(net);
  net.handle('spValve', (d, from) => { if (ACTIVE && ACTIVE.game === game) ACTIVE.hostValve(d, from); });
  net.handle('spSync', (d, from) => { if (ACTIVE && ACTIVE.game === game) ACTIVE.hostSync(d, from); });
  net.on_('spVent', (d) => { if (ACTIVE && ACTIVE.game === game) ACTIVE.applyVent(d); });
  net.on_('spVentSync', (d) => { if (ACTIVE && ACTIVE.game === game) ACTIVE.applySync(d); });
  // interior hazards (src/world/interiors/hazards.js): laser grids, breakers, cave-ins
  net.handle('spHz', (d, from) => { if (ACTIVE && ACTIVE.game === game && (d?.s >>> 0) === ACTIVE.seed) ACTIVE.hazards?.hostRequest(d, from, game, ACTIVE.clock); });
  net.on_('spHzB', (d) => { if (ACTIVE && ACTIVE.game === game && (d?.s >>> 0) === ACTIVE.seed) ACTIVE.hazards?.apply(d, game, ACTIVE.clock); });
  net.on_('spHzState', (d) => { if (ACTIVE && ACTIVE.game === game && (d?.s >>> 0) === ACTIVE.seed) ACTIVE.hazards?.applySync(d.st, ACTIVE.clock); });
}

// ============================================================================= runtime
class SetPieces {
  constructor(ctx) {
    this.layout = ctx.layout;
    this.seed = ctx.layout.seed >>> 0;
    this.group = ctx.group;
    this.lightPool = ctx.lightPool;
    this.Y = ctx.Y ?? ctx.layout.y;
    this.scrapSpots = [];
    this.zones = [];
    this.vents = [];
    this.sparks = [];
    this.catwalks = [];
    this.trails = [];
    this.flood = null;
    this.dark = null;
    this.owned = [];
    this.geometries = [];
    this.materials = [];
    this.textures = [];
    this.emitters = [];
    this.steamMat = null;
    this.sparkMat = null;
    this.clock = 0;
    this.lastRunTime = null;
    this.live = true;              // false while the host's day clock is frozen (landing / takeoff)
    this.pointScale = 1;
    this.inited = false;
    this.disposed = false;
    this.game = null;
    this.unsubInteract = null;
    this.nav = null;
    this.reserved = [];            // nav sub-cells held at walk = 2 until releaseNav()
    this.hazards = null;           // interiors/hazards.js (set by facility.js after the theme decoration)
    this.interior = ctx.interior || null;
  }

  own(obj, geo) {
    this.group.add(obj);
    this.owned.push(obj);
    if (geo) this.geometries.push(geo);
    return obj;
  }

  getSteamMat() {
    if (!this.steamMat) {
      const tex = makePuffTexture();
      this.textures.push(tex);
      this.steamMat = new THREE.PointsMaterial({
        size: 0.75, map: tex, color: 0xd8e0e4, transparent: true, depthWrite: false, vertexColors: true, alphaTest: 0.02, sizeAttenuation: true,
      });
      this.steamMat.userData.baseSize = 0.75;
      this.materials.push(this.steamMat);
    }
    return this.steamMat;
  }
  getSparkMat() {
    if (!this.sparkMat) {
      this.sparkMat = new THREE.PointsMaterial({
        size: 0.07, color: 0xffe9a0, transparent: true, depthWrite: false, vertexColors: true, alphaTest: 0.05, sizeAttenuation: true,
      });
      this.sparkMat.userData.baseSize = 0.07;
      this.materials.push(this.sparkMat);
    }
    return this.sparkMat;
  }

  // ---------------------------------------------------------------- per frame
  update(dt, game) {
    if (this.disposed || !game) return;
    if (!this.inited) this.init(game);
    if (dt > 0.1) dt = 0.1;
    const clock = this.tickClock(dt, game);
    const cam = game.camera?.position || game.player?.pos;
    if (!cam) return;
    this.syncPointScale(game);
    if (this.vents.length) this.updateSteam(dt, clock, cam, game);
    if (this.sparks.length) this.updateSparks(dt, clock, cam, game);
    if (this.flood) this.updateWater(dt, cam, game);
    if (this.hazards) this.hazards.update(dt, clock, cam, game, this.live);
  }

  /** Give the floor reserved during the build (stair approaches, skull spots) back to the nav grid.
   *  facility.js calls it once the decoration after the set pieces is done; idempotent. */
  releaseNav() {
    const walk = this.nav?.walk;
    if (walk) for (const i of this.reserved) if (walk[i] === 2) walk[i] = 1;
    this.reserved.length = 0;
  }

  init(game) {
    this.inited = true;
    this.game = game;
    this.releaseNav();   // fallback if the facility never called it
    ACTIVE = this;
    bindNet(game);
    this.hazards?.bindInteractables(game, () => this.clock);
    if (game.mods?.on) this.unsubInteract = game.mods.on('interactables', (list) => this.pushInteractables(list));
    if (game.net && !game.isHost) game.net.request('spSync', { s: this.seed });
    for (const v of this.vents) {
      v.ip = {
        pos: v.valve, r: 0.42, reach: 2.3,
        label: () => (v.offUntil > this.clock ? t('Steam valve (closed)') : t('Close the steam valve [E]')),
        sub: () => (v.offUntil > this.clock ? tf('Pressure returns in {n}s', { n: Math.ceil(v.offUntil - this.clock) }) : t('Shuts this vent off for a minute')),
        action: () => { if (v.offUntil <= this.clock) game.net?.request('spValve', { s: this.seed, i: v.i }); },
      };
    }
  }

  // Shared clock (seconds since 08:00 on the moon) from the host-replicated run.time, extrapolated locally
  // between the host's 3 s time syncs and nudged back on each sync. The host only advances run.time in
  // the 'moon' phase, so in any other phase (landing, takeoff) every peer pins the clock to it instead of
  // free-running; otherwise a client would carry the ~9 s landing drift into the day until the first sync.
  tickClock(dt, game) {
    const run = game.run;
    const rt = run?.time;
    if (typeof rt !== 'number') { this.live = true; this.clock += dt; return this.clock; }
    const target = (rt - 480) * ((game.config?.dayLengthSec || 720) / 960);
    if (run.phase && run.phase !== 'moon') {
      this.live = false;
      this.clock = target;
      this.lastRunTime = rt;
      return this.clock;
    }
    this.live = true;
    this.clock += dt;
    if (rt !== this.lastRunTime) {
      this.lastRunTime = rt;
      const err = target - this.clock;
      if (err > 1.5 || err < -1.5) this.clock = target;
      else this.clock += err * 0.35;
    }
    return this.clock;
  }

  // three.js sizes points against the canvas height, but the PSX pipeline renders into a low-res target
  syncPointScale(game) {
    const eng = game.engine;
    let k = 1;
    if (eng?.lowH && eng.renderer?.getSize) {
      const h = eng.renderer.getSize(_v2).y * (eng.renderer.getPixelRatio?.() || 1);
      if (h > 0) k = eng.lowH / h;
    }
    if (Math.abs(k - this.pointScale) < 1e-3) return;
    this.pointScale = k;
    for (const m of [this.steamMat, this.sparkMat]) if (m) m.size = m.userData.baseSize * k;
  }

  sound(game, name, pos, vol, pitch, ref, max) {
    game.audio?.play(name, { pos, volume: vol, pitch, refDistance: ref, maxDistance: max, occlude: true, bus: 'sfx' });
  }

  updateSteam(dt, clock, cam, game) {
    const p = game.player;
    const lp = p && !p.dead && p.indoor !== false ? p : null;
    const host = !!game.isHost;
    const live = this.live;
    for (let n = 0; n < this.vents.length; n++) {
      const v = this.vents[n];
      let u = (clock + v.phase) % v.period;
      if (u < 0) u += v.period;
      const state = !live || v.offUntil > clock ? 0 : u < STEAM_BURST ? 2 : u > v.period - STEAM_WARN ? 1 : 0;
      const ex = v.c.x - cam.x, ey = v.c.y - cam.y, ez = v.c.z - cam.z;
      const d2 = ex * ex + ey * ey + ez * ez;
      if (state !== v.state) {
        const prev = v.state;
        v.state = state;
        v.tickT = 0;
        if (prev !== -1) {
          if (state === 2 && d2 < 34 * 34) this.sound(game, 'steam_hiss', v.o, 0.9, 0.9 + hash01(n, v.period * 100) * 0.2, 3, 34);
          else if (state === 1 && d2 < 20 * 20) this.sound(game, 'hit_metal', v.o, 0.22, 0.5, 2, 20);
        }
      }
      // particles (only near the camera)
      const pf = v.puffs;
      if (d2 < 40 * 40 && state) {
        v.emitAcc += dt * (state === 2 ? (v.high ? 40 : 50) : 7);
        while (v.emitAcc >= 1) {
          v.emitAcc -= 1;
          const burst = state === 2;
          const s = burst ? v.len * 2.6 * (0.8 + crand() * 0.4) : 0.6 + crand() * 0.8;
          const spread = burst ? (v.high ? 0.55 : 0.85) : 0.3;
          const lat = (crand() - 0.5) * spread * 2;
          pf.emit(v.ox, v.oy, v.oz, v.dx * s - v.dz * lat, (crand() - 0.35) * spread, v.dz * s + v.dx * lat, burst ? 0.55 + crand() * 0.3 : 0.7);
        }
      } else v.emitAcc = 0;
      if (pf.alive > 0) pf.step(dt, 2.2, 1.4, 0.75);
      if (state !== 2) continue;
      // local player in the jet (client-side damage: players own their HP)
      if (lp && jetHits(v, lp.pos.x, lp.pos.y, lp.pos.z, lp.pos.y + (lp.crouch ? 1.12 : 1.8), PLAYER_R)) {
        v.tickT -= dt;
        if (v.tickT <= 0) {
          v.tickT = STEAM_TICK;
          game.damageLocal?.(STEAM_DMG, 'steam', v.o);
          if (lp.vel) { lp.vel.x += v.dx * 2.5; lp.vel.z += v.dz * 2.5; }
        }
      }
      if (host) this.stunCreatures(v, game, clock);
    }
  }

  stunCreatures(v, game, clock) {
    const list = game.creatures?.host;
    if (!list || !list.size) return;
    for (const c of list.values()) {
      if (c.dead || c.zone !== 'in' || !c.def || c.def.hazard || NO_STUN.has(c.type) || !STUN_STATES.has(c.state)) continue;
      if ((c.data?.steamCd || 0) > clock) continue;
      if (!jetHits(v, c.pos.x, c.pos.y, c.pos.z, c.pos.y + (c.def.height || 1.4), c.def.radius || 0.5)) continue;
      if (c.data) c.data.steamCd = clock + 4;
      c.stunT = Math.max(c.stunT || 0, 1.3);
      c.setState?.('stunned');
      game.creatures.sound?.(c, 'creature_hurt', 0.7);
    }
  }

  updateSparks(dt, clock, cam, game) {
    const powered = (this.lightPool?.globalDim ?? 1) > 0.05;
    const live = this.live;
    for (let n = 0; n < this.sparks.length; n++) {
      const s = this.sparks[n];
      const cyc = Math.floor((clock + s.phase) / s.period);
      if (cyc !== s.cycle) {
        const first = s.cycle === null;
        s.cycle = cyc;
        if (!first && live && powered && hash01(cyc, s.seed) < 0.72) {
          s.active = true;
          s.t = 0;
          const ex = s.pos.x - cam.x, ey = s.pos.y - cam.y, ez = s.pos.z - cam.z;
          if (ex * ex + ey * ey + ez * ez < 26 * 26) {
            this.sound(game, 'spark', s.pos, 0.5, 0.85 + hash01(cyc, n) * 0.3, 2, 24);
            const k = 6 + ((hash01(n, cyc) * 6) | 0);
            for (let i = 0; i < k; i++) s.puffs.emit(s.pos.x, s.pos.y, s.pos.z, (crand() - 0.5) * 2.4, crand() * 1.2 - 0.2, (crand() - 0.5) * 2.4, 0.35 + crand() * 0.4);
          }
        }
      }
      if (s.active) {
        s.t += dt;
        const t = s.t;
        const on = powered && (t < 0.05 || (t > 0.09 && t < 0.15) || (t > 0.22 && t < 0.27));
        if (on !== s.on) {
          s.on = on;
          s.e.enabled = on;
          s.glowMat?.color.setHex(on ? s.lit : s.dim);
        }
        if (t > 0.3) s.active = false;
      }
      if (s.puffs.alive > 0) s.puffs.step(dt, 0.5, -9.8, 1);
    }
  }

  updateWater(dt, cam, game) {
    const f = this.flood;
    const dx = f.cx - cam.x, dz = f.cz - cam.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 36 * 36 || Math.abs(cam.y - f.y) > 14) return;
    f.t += dt;
    const ou = f.t * 0.035, ov = f.t * 0.021;
    const arr = f.uv.array, base = f.base;
    for (let i = 0; i < arr.length; i += 2) {
      arr[i] = base[i] + ou + Math.sin(f.t * 0.8 + base[i + 1] * 2.5) * 0.02;
      arr[i + 1] = base[i + 1] + ov;
    }
    f.uv.needsUpdate = true;
    f.dripT -= dt;
    if (f.dripT <= 0) {
      f.dripT = 2.5 + crand() * 4;
      if (d2 < 18 * 18) {
        _tmp.set(f.rc.x0 + crand() * (f.rc.x1 - f.rc.x0), f.y, f.rc.z0 + crand() * (f.rc.z1 - f.rc.z0));
        this.sound(game, 'fish_splash', _tmp, 0.14, 1.5 + crand() * 0.5, 1.5, 16);
      }
    }
  }

  pushInteractables(list) {
    const p = this.game?.player;
    if (this.disposed || !p || p.dead || !p.indoor) return;
    for (const v of this.vents) if (v.ip && p.pos.distanceToSquared(v.valve) < 12) list.push(v.ip);
    this.hazards?.pushInteractables(list, this.game);
  }

  // ---------------------------------------------------------------- valves (host-authoritative)
  hostValve(d, from) {
    if ((d?.s >>> 0) !== this.seed) return;
    const v = this.vents[d.i | 0];
    if (!v || v.offUntil > this.clock) return;
    // the sender must be a known, living player standing near that valve
    const pl = this.game.aiPlayerById?.(from);
    if (!pl || pl.dead || !pl.pos || pl.pos.distanceToSquared(v.valve) > 36) return;
    this.game.net.broadcast('spVent', { s: this.seed, i: v.i, u: +(this.clock + VALVE_OFF).toFixed(2) });
  }
  applyVent(d) {
    if ((d?.s >>> 0) !== this.seed) return;
    const v = this.vents[d.i | 0];
    if (!v) return;
    const was = v.offUntil > this.clock;
    v.offUntil = +d.u || 0;
    if (!was && v.offUntil > this.clock && this.game) {
      this.sound(this.game, 'hit_metal', v.valve, 0.5, 1.3, 2, 22);
      this.sound(this.game, 'steam_hiss', v.o, 0.3, 0.55, 2, 20);
    }
  }
  hostSync(d, from) {
    if ((d?.s >>> 0) !== this.seed) return;
    const l = [];
    for (const v of this.vents) if (v.offUntil > this.clock) l.push([v.i, +v.offUntil.toFixed(2)]);
    if (l.length) this.game.net.sendTo(from, 'spVentSync', { s: this.seed, l });
    if (this.hazards) {
      const st = this.hazards.syncState(this.clock);
      if (st.l.length || st.b.length || st.c.length) this.game.net.sendTo(from, 'spHzState', { s: this.seed, st });
    }
  }
  applySync(d) {
    if ((d?.s >>> 0) !== this.seed) return;
    for (const e of d.l || []) { const v = this.vents[e[0] | 0]; if (v) v.offUntil = +e[1] || 0; }
  }

  // ---------------------------------------------------------------- cleanup
  // Colliders were created through ctx.addBox and are released by the facility's dispose.
  dispose(physics) {
    void physics;
    if (this.disposed) return;
    this.disposed = true;
    if (ACTIVE === this) ACTIVE = null;
    if (this.unsubInteract) { this.unsubInteract(); this.unsubInteract = null; }
    this.hazards?.dispose();
    this.hazards = null;
    for (const e of this.emitters) this.lightPool?.remove(e);
    for (const o of this.owned) o.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.emitters.length = 0; this.owned.length = 0; this.geometries.length = 0;
    this.materials.length = 0; this.textures.length = 0;
    for (const v of this.vents) v.ip = null;
    this.vents.length = 0; this.sparks.length = 0;
    this.reserved.length = 0;
    this.flood = null; this.game = null; this.nav = null;
  }
}

// ============================================================================= build
export function buildSetPieces(ctx) {
  const L = ctx.layout, group = ctx.group, rng = ctx.rng, nav = ctx.nav;
  const C = ctx.CELL || L.cell || 4;
  const Y = ctx.Y ?? L.y;
  const W = L.w, H = L.h;
  const levelMaterial = ctx.levelMaterial;
  const gb = new ctx.GeoBuilder();
  const sp = new SetPieces(ctx);
  const { scrapSpots, zones } = sp;
  const mine = L.theme === 'mineshaft';
  const industrial = !L.theme || L.theme === 'factory' || L.theme === 'sewer';
  const steamRooms = new Set(['boiler', ...(ctx.interior?.steamRooms || [])]);
  const noFlood = new Set([...NO_FLOOD, ...(ctx.interior?.noFlood || [])]);
  // one stream per set piece kind (forked in a fixed order), so a rejection in one never shifts another
  const rFlood = rng.fork('flood'), rVent = rng.fork('vent'), rCat = rng.fork('catwalk');
  const rCorr = rng.fork('corridor'), rDark = rng.fork('dark'), rTrail = rng.fork('trail');

  // ---------------------------------------------------------------- geometry helpers
  const wx = (x) => L.ox + x * C, wz = (z) => L.oz + z * C;
  const ek = (x, z, d) => L.edgeKey(x, z, d);
  const edgeBusy = (x, z, d) => { const k = ek(x, z, d); return L.open.has(k) || L.edgeInfo.has(k); };
  const cellHasDoorway = (x, z) => { for (let d = 0; d < 4; d++) if (L.edgeInfo.has(ek(x, z, d))) return true; return false; };
  const edgeCenter = (x, z, d) => (d === 0 ? [wx(x + 1), wz(z) + C / 2] : d === 2 ? [wx(x), wz(z) + C / 2] : d === 1 ? [wx(x) + C / 2, wz(z + 1)] : [wx(x) + C / 2, wz(z)]);
  const rect = (x0, z0, x1, z1) => ({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
  const grow = (a, m) => ({ x0: a.x0 - m, z0: a.z0 - m, x1: a.x1 + m, z1: a.z1 + m });
  const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
  const roomRect = (r) => rect(wx(r.x), wz(r.z), wx(r.x + r.w), wz(r.z + r.h));
  const roomDist = (r) => L.distOf[L.idx(r.cx, r.cz)];
  const perimeter = (r) => {
    const out = [];
    for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], nz = z + DZ[d];
      if (nx >= r.x && nx < r.x + r.w && nz >= r.z && nz < r.z + r.h) continue;
      out.push({ x, z, d });
    }
    return out;
  };
  // floor area in front of a wall edge (depth into the cell, halfW along the wall)
  const frontRect = (x, z, d, depth, halfW) => {
    const [ecx, ecz] = edgeCenter(x, z, d);
    const [ix, iz] = INWARD[d];
    return d === 0 || d === 2 ? rect(ecx, ecz - halfW, ecx + ix * depth, ecz + halfW) : rect(ecx - halfW, ecz, ecx + halfW, ecz + iz * depth);
  };
  const doorRects = (r) => perimeter(r).filter((e) => edgeBusy(e.x, e.z, e.d)).map((e) => frontRect(e.x, e.z, e.d, 2.4, C / 2 + 0.25));

  // World AABBs of the props already placed (cached per object; props placed later are picked up too).
  // They must come out the same on every peer: placement branches on them. Procedural props (props.js)
  // are measured. Downloaded GLB props are not: where a model failed to load, the facility placed a
  // crate_wood instead (and pushed a wall prop out by the crate's depth, not the model's), so GLB props
  // and crates both get genericBox(), which only uses what every peer agrees on.
  const boxCache = new Map();
  const angleIs = (a, b) => {
    let d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d) < 1e-3;
  };
  const box3 = (rc, y0, y1) => new THREE.Box3(new THREE.Vector3(rc.x0, y0, rc.z0), new THREE.Vector3(rc.x1, y1, rc.z1));
  const genericBox = (o) => {
    const p = o.position;
    const y0 = p.y - 0.05, y1 = p.y + GEN_H;
    const gx = Math.floor((p.x - L.ox) / C), gz = Math.floor((p.z - L.oz) / C);
    if (gx >= 0 && gz >= 0 && gx < W && gz < H) {
      // wall props: facing into the cell, exactly on the edge's centre line, a little out from a closed wall.
      // Only their distance from the wall differs between peers, and the box starts at the wall itself.
      for (let d = 0; d < 4; d++) {
        if (!angleIs(o.rotation.y, WALL_ROT[d]) || edgeBusy(gx, gz, d)) continue;
        const [ecx, ecz] = edgeCenter(gx, gz, d);
        const [ix, iz] = INWARD[d];
        const alongZ = d === 0 || d === 2;
        const lateral = alongZ ? p.z - ecz : p.x - ecx;
        const out = alongZ ? (p.x - ecx) * ix : (p.z - ecz) * iz;
        if (Math.abs(lateral) > 1e-4 || out <= 0 || out > GEN_WALL_SNAP) continue;
        return box3(alongZ ? rect(ecx, ecz - GEN_WALL_HALF, ecx + ix * GEN_WALL_DEPTH, ecz + GEN_WALL_HALF)
          : rect(ecx - GEN_WALL_HALF, ecz, ecx + GEN_WALL_HALF, ecz + iz * GEN_WALL_DEPTH), y0, y1);
      }
    }
    return box3(rect(p.x - GEN_HALF, p.z - GEN_HALF, p.x + GEN_HALF, p.z + GEN_HALF), y0, y1);
  };
  const propBox = (o) => {
    let bb = boxCache.get(o);
    if (bb === undefined) {
      if (o.userData.ext || o.userData.propId === 'crate_wood') bb = genericBox(o);
      else { bb = new THREE.Box3().setFromObject(o); if (bb.isEmpty()) bb = null; }
      boxCache.set(o, bb);
    }
    return bb;
  };
  const propHit = (rc, y0, y1) => {
    for (const o of group.children) {
      const ud = o.userData;
      if (!ud || !(ud.propId || ud.ext) || ud.setPiece) continue;
      // cheap reject (generic boxes reach < 2.6 m from their prop, so this never decides a hit by itself)
      const p = o.position;
      if (p.x < rc.x0 - 5 || p.x > rc.x1 + 5 || p.z < rc.z0 - 5 || p.z > rc.z1 + 5) continue;
      const bb = propBox(o);
      if (!bb) continue;
      if (bb.max.x <= rc.x0 || bb.min.x >= rc.x1 || bb.max.z <= rc.z0 || bb.min.z >= rc.z1) continue;
      if (bb.max.y <= y0 || bb.min.y >= y1) continue;
      return true;
    }
    return false;
  };
  // Nav walkability as every peer sees it. The facility nav-blocks every prop collider, and a GLB model's
  // collider is not its fallback crate's, so sub-cells a GLB-or-crate collider may have blocked (centre
  // inside its generic box + blockBox's 0.15 m pad) count as blocked here, whatever this peer loaded.
  let unsure = null;
  const cellsIn = (x0, z0, x1, z1, pad, fn) => {   // NavGrid.blockBox's sub-cell selection
    const r = nav.res, NW = nav.w, NH = nav.h;
    const gx0 = Math.max(0, Math.floor((x0 - pad - nav.ox) / r)), gx1 = Math.min(NW - 1, Math.floor((x1 + pad - nav.ox) / r));
    const gz0 = Math.max(0, Math.floor((z0 - pad - nav.oz) / r)), gz1 = Math.min(NH - 1, Math.floor((z1 + pad - nav.oz) / r));
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const cx = nav.ox + (gx + 0.5) * r, cz = nav.oz + (gz + 0.5) * r;
      if (cx >= x0 - pad && cx <= x1 + pad && cz >= z0 - pad && cz <= z1 + pad) fn(gz * NW + gx);
    }
  };
  const getUnsure = () => {
    if (unsure) return unsure;
    unsure = new Uint8Array(nav.w * nav.h);
    const mark = (i) => { unsure[i] = 1; };
    for (const o of group.children) {
      const ud = o.userData;
      if (!ud || ud.setPiece || !(ud.ext || ud.propId === 'crate_wood')) continue;
      const bb = propBox(o);
      if (bb) cellsIn(bb.min.x, bb.min.z, bb.max.x, bb.max.z, 0.2, mark);
    }
    return unsure;
  };
  const walkable = (gx, gz) => {
    if (gx < 0 || gz < 0 || gx >= nav.w || gz >= nav.h) return false;
    const i = gz * nav.w + gx;
    return nav.walk[i] === 1 && !getUnsure()[i];
  };
  const walkableAt = (x, z) => { const [gx, gz] = nav.toGrid(x, z); return walkable(gx, gz); };
  const navFree = (rc) => {
    const [gx0, gz0] = nav.toGrid(rc.x0 + 0.05, rc.z0 + 0.05);
    const [gx1, gz1] = nav.toGrid(rc.x1 - 0.05, rc.z1 - 0.05);
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) if (!walkable(gx, gz)) return false;
    return true;
  };
  // Floor that must stay walkable (stair approaches, the skull at a trail's end) is held at walk = 2
  // (not walkable to anyone) until sp.releaseNav(), so decoration placed after the set pieces, such as
  // decorateMineshaft (its nav guard only blocks walkable sub-cells), leaves it clear.
  const reserve = (rc) => {
    const [gx0, gz0] = nav.toGrid(rc.x0 + 0.05, rc.z0 + 0.05);
    const [gx1, gz1] = nav.toGrid(rc.x1 - 0.05, rc.z1 - 0.05);
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      if (gx < 0 || gz < 0 || gx >= nav.w || gz >= nav.h) continue;
      const i = gz * nav.w + gx;
      if (nav.walk[i] === 1) { nav.walk[i] = 2; sp.reserved.push(i); }
    }
  };
  sp.nav = nav;

  // ---------------------------------------------------------------- catwalk parts (merged GeoBuilder)
  function deck(x0, z0, x1, z1, top) {
    if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
    gb.hrect('grate', x0, z0, x1, z1, top, true, 1);
    gb.hrect('grate', x0, z0, x1, z1, top - 0.03, false, 1);
    ctx.addBox((x0 + x1) / 2, top - DECK_T / 2, (z0 + z1) / 2, x1 - x0, DECK_T, z1 - z0);
  }
  function joists(x0, z0, x1, z1, top, alongX) {
    const y = top - 0.09;
    if (alongX) for (let x = x0 + 0.15; x < x1 - 0.05; x += 2) gb.box('frame', x, y, (z0 + z1) / 2, 0.07, 0.1, z1 - z0);
    else for (let z = z0 + 0.15; z < z1 - 0.05; z += 2) gb.box('frame', (x0 + x1) / 2, y, z, x1 - x0, 0.1, 0.07);
  }
  function rod(x, z, y0, y1) {
    if (y1 - y0 > 0.05) gb.box('rod', x, (y0 + y1) / 2, z, 0.04, y1 - y0, 0.04);
  }
  // ceil = null: no suspension rods (short rails on the stair top steps)
  function railing(ax, az, bx, bz, y, ceil) {
    const alongX = Math.abs(bx - ax) >= Math.abs(bz - az);
    const len = alongX ? Math.abs(bx - ax) : Math.abs(bz - az);
    if (len < 0.15) return;
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      gb.box('rail', ax + (bx - ax) * t, y + RAIL_H / 2, az + (bz - az) * t, 0.05, RAIL_H, 0.05);
    }
    gb.box('rail', cx, y + RAIL_H - 0.025, cz, alongX ? len : 0.05, 0.05, alongX ? 0.05 : len);
    gb.box('rail', cx, y + 0.58, cz, alongX ? len : 0.035, 0.035, alongX ? 0.035 : len);
    gb.box('hazard', cx, y + 0.07, cz, alongX ? len : 0.015, 0.12, alongX ? 0.015 : len, 2);
    ctx.addBox(cx, y + RAIL_H / 2, cz, alongX ? len : 0.1, RAIL_H, alongX ? 0.1 : len);
    if (ceil == null) return;
    // suspension rods to the ceiling at both ends and every <= 4 m
    const nr = Math.max(1, Math.ceil(len / 4));
    for (let i = 0; i <= nr; i++) { const t = i / nr; rod(ax + (bx - ax) * t, az + (bz - az) * t, y + RAIL_H, ceil); }
  }
  // railing along a line with gaps [[a0,a1],...] (stair arrivals, bridge ends)
  function railRun(alongX, fixed, from, to, gaps, y, ceil) {
    const gs = gaps.slice().sort((p, q) => p[0] - q[0]);
    const seg = (a, b) => (alongX ? railing(a, fixed, b, fixed, y, ceil) : railing(fixed, a, fixed, b, y, ceil));
    let cur = from;
    for (const [g0, g1] of gs) { if (g0 > cur) seg(cur, Math.min(g0, to)); cur = Math.max(cur, g1); }
    if (cur < to) seg(cur, to);
  }
  function slab(rc, top) {
    gb.hrect('grate', rc.x0, rc.z0, rc.x1, rc.z1, top, true, 1);
    gb.hrect('grate', rc.x0, rc.z0, rc.x1, rc.z1, top - 0.03, false, 1);
    ctx.addBox((rc.x0 + rc.x1) / 2, top - 0.1, (rc.z0 + rc.z1) / 2, rc.x1 - rc.x0, 0.2, rc.z1 - rc.z0);
  }

  // ---------------------------------------------------------------- c) flooded room
  let floodRoom = null;
  {
    const cand = L.rooms.filter((r) => !SKIP_ROOMS.has(r.type) && !noFlood.has(r.type) && !r.hub && roomDist(r) > 3);
    if (cand.length && rFlood.chance(0.65)) {
      floodRoom = rFlood.weighted(cand.map((r) => ({ r, w: FLOOD_W[r.type] ?? 1 }))).r;
      buildFlood(floodRoom);
    }
  }
  function buildFlood(r) {
    const rc = roomRect(r);
    const wy = Y + WATER_H;
    const geo = new THREE.PlaneGeometry(rc.x1 - rc.x0, rc.z1 - rc.z0, r.w * 2, r.h * 2);
    geo.rotateX(-Math.PI / 2);
    geo.translate((rc.x0 + rc.x1) / 2, wy, (rc.z0 + rc.z1) / 2);
    const P = geo.attributes.position, U = geo.attributes.uv;
    const base = new Float32Array(U.count * 2);
    for (let i = 0; i < U.count; i++) {
      base[i * 2] = P.getX(i) * 0.3; base[i * 2 + 1] = P.getZ(i) * 0.3;
      U.setXY(i, base[i * 2], base[i * 2 + 1]);
    }
    U.setUsage(THREE.DynamicDrawUsage);
    const mesh = new THREE.Mesh(geo, levelMaterial('water', { transparent: true, opacity: 0.84, color: 0x4a6268 }));
    mesh.renderOrder = 2;
    mesh.userData.setPiece = true;
    sp.own(mesh, geo);
    // doorway "curtains": the water surface seen edge-on from the corridor reads as a contained pool
    for (const e of perimeter(r)) {
      if (!edgeBusy(e.x, e.z, e.d)) continue;
      const [ecx, ecz] = edgeCenter(e.x, e.z, e.d);
      // only across the opening itself: beside it the curtain would be coplanar with the corridor wall
      const info = L.edgeInfo.get(ek(e.x, e.z, e.d));
      const hw = Math.min(C, info?.width ?? C) / 2 - 0.02, tx = DZ[e.d], tz = -DX[e.d];
      gb.vrect('water', ecx - tx * hw, ecz - tz * hw, ecx + tx * hw, ecz + tz * hw, Y + 0.01, wy, 0.3);
    }
    sp.flood = { mesh, uv: U, base, rc, cx: (rc.x0 + rc.x1) / 2, cz: (rc.z0 + rc.z1) / 2, y: wy, t: 0, dripT: 1.5, room: r.id };
    zones.push({ type: 'water', min: [rc.x0, rc.z0], max: [rc.x1, rc.z1], y: wy, room: r.id });
  }

  // ---------------------------------------------------------------- b) steam vents
  function addVent(r, x, z, d, len, high, roomId) {
    const [ecx, ecz] = edgeCenter(x, z, d);
    const [ix, iz] = INWARD[d];
    const px = ecx + ix * 0.23, pz = ecz + iz * 0.23;
    if (propHit(rect(px - 0.35, pz - 0.35, px + 0.35, pz + 0.35), Y + 0.02, Y + 4)) return false;
    if (!ctx.placeProp('pipe_vertical', px, Y, pz, WALL_ROT[d])) return false;
    const h = high ? 1.48 : 0.75;
    const jr = high ? 0.33 : 0.45;
    gb.box('frame', px + ix * 0.24, Y + h, pz + iz * 0.24, ix ? 0.18 : 0.12, 0.12, iz ? 0.18 : 0.12);
    const ox = px + ix * 0.33, oz = pz + iz * 0.33;
    const period = r.float(5.2, 9), phase = r.float(0, period);
    const v = {
      i: sp.vents.length, ox, oy: Y + h, oz, dx: ix, dz: iz, len, jr, high, period, phase, room: roomId,
      o: new THREE.Vector3(ox, Y + h, oz), c: new THREE.Vector3(ox + ix * len / 2, Y + h, oz + iz * len / 2),
      valve: new THREE.Vector3(px + ix * 0.3, Y + 1.2, pz + iz * 0.3),
      offUntil: -1e9, state: -1, tickT: 0, emitAcc: 0, puffs: null, ip: null,
      rect: rect(ox + (ix ? 0 : -jr), oz + (iz ? 0 : -jr), ox + ix * len + (ix ? 0 : jr), oz + iz * len + (iz ? 0 : jr)),
    };
    v.puffs = new Puffs(high ? 34 : 42, sp.getSteamMat(), v.c, len / 2 + 2.5);
    sp.own(v.puffs.points, v.puffs.geo);
    sp.vents.push(v);
    zones.push({
      type: 'steam', pos: v.c, radius: len / 2 + jr, period, phase, burst: STEAM_BURST, warn: STEAM_WARN,
      from: [ox, Y + h, oz], dir: [ix, iz], len, jetRadius: jr, high, room: roomId, vent: v.i,
    });
    return true;
  }
  for (const r of L.rooms) {
    const boiler = steamRooms.has(r.type);
    if (!boiler && r.type !== 'kitchen') continue;
    const rv = rVent.fork('r' + r.id);
    if (!boiler && !rv.chance(0.5)) continue;
    const slots = rv.shuffle(perimeter(r).filter((e) => !edgeBusy(e.x, e.z, e.d) && !cellHasDoorway(e.x, e.z)));
    const want = boiler ? rv.int(1, 3) : 1;
    let made = 0;
    for (const s of slots) {
      if (made >= want) break;
      if (addVent(rv, s.x, s.z, s.d, 2.6, rv.chance(0.4), r.id)) made++;
    }
  }

  // ---------------------------------------------------------------- a) catwalks
  // stairs_metal as measured from its colliders. Its top is ST.rise; extra top steps (slabs, each one prop
  // step long, rising <= TOP_STEP_RISE) lead up to the deck: 3.0 -> 3.2 -> 3.4 for the current prop.
  const ST = stairDims();
  const topGap = CATWALK_H - ST.rise;
  const topRises = topGap > 0.005 ? Math.ceil(topGap / TOP_STEP_RISE - 1e-6) : 0;
  const nSlabs = Math.max(0, topRises - 1);
  const slabLen = nSlabs * ST.stepRun;
  const stairsUsable = ST.run > 1 && ST.w > 0.9 && ST.stepRun > 0.05 && topGap > -0.005 && topGap < 1.0;
  if (!stairsUsable) console.warn('setpieces: stairs_metal does not fit a', CATWALK_H, 'm deck', ST);
  const QROT = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  for (const r of L.rooms) {
    if (SKIP_ROOMS.has(r.type) || !(r.height >= 6) || !stairsUsable) continue;
    const rc = rCat.fork('r' + r.id);
    if (!rc.chance(r.type === 'storage' ? 0.8 : r.type === 'boiler' ? 0.65 : 0.55)) continue;
    buildCatwalk(r, rc);
  }
  function buildCatwalk(r, rc) {
    const rr = roomRect(r);
    // blast door frames reach 3.85 m and stick 0.3 m into the room: hang that side's deck off the wall
    const inset = [0, 0, 0, 0];
    for (const e of perimeter(r)) {
      const info = L.edgeInfo.get(ek(e.x, e.z, e.d));
      if (info && (info.type === 'blast' || info.type === 'entrance')) inset[e.d] = 0.42;
    }
    const a = { x0: rr.x0 + inset[2], z0: rr.z0 + inset[3], x1: rr.x1 - inset[0], z1: rr.z1 - inset[1] };
    const inner = { x0: a.x0 + CATWALK_W, z0: a.z0 + CATWALK_W, x1: a.x1 - CATWALK_W, z1: a.z1 - CATWALK_W };
    if (inner.x1 - inner.x0 < 4.4 || inner.z1 - inner.z0 < 4.4) return false;
    const top = Y + CATWALK_H;
    const ceil = Y + r.height;
    if (ceil - top < 2.4) return false;
    const doors = doorRects(r);
    const SW = ST.w;

    // stair candidates: the top step arrives at an inner deck edge (N=3, S=1, W=2, E=0)
    const stairLen = ST.run + slabLen;
    const cands = [];
    for (const side of [3, 1, 2, 0]) {
      const alongZ = side === 3 || side === 1;           // stair runs along z
      const sign = side === 3 || side === 2 ? -1 : 1;    // rising direction on that axis
      const edge = side === 3 ? inner.z0 : side === 1 ? inner.z1 : side === 2 ? inner.x0 : inner.x1;
      const lo = alongZ ? inner.x0 : inner.z0, hi = alongZ ? inner.x1 : inner.z1;
      const lats = [lo + SW / 2 + 0.05, hi - SW / 2 - 0.05, (lo + hi) / 2, lo + (hi - lo) * 0.3, lo + (hi - lo) * 0.7];
      const used = [];
      for (const c of lats) {
        if (c - SW / 2 < lo || c + SW / 2 > hi || used.some((u) => Math.abs(u - c) < 0.5)) continue;
        used.push(c);
        const base = edge - sign * stairLen;
        const apEnd = base - sign * 1.2;
        const fp = alongZ ? rect(c - SW / 2, edge, c + SW / 2, base) : rect(edge, c - SW / 2, base, c + SW / 2);
        const ap = alongZ ? rect(c - 0.8, base, c + 0.8, apEnd) : rect(base, c - 0.8, apEnd, c + 0.8);
        cands.push({ side, alongZ, sign, edge, c, fp, ap });
      }
    }
    const valid = (s) => {
      if (s.ap.x0 < rr.x0 + 0.1 || s.ap.x1 > rr.x1 - 0.1 || s.ap.z0 < rr.z0 + 0.1 || s.ap.z1 > rr.z1 - 0.1) return false;
      const fpg = grow(s.fp, 0.1);
      for (const d of doors) if (overlap(fpg, d) || overlap(s.ap, d)) return false;
      // nobody should climb through, or queue at the foot of the stairs inside, a steam jet
      for (const v of sp.vents) if (overlap(fpg, v.rect) || overlap(s.ap, v.rect)) return false;
      if (!navFree(fpg) || !navFree(s.ap)) return false;
      if (propHit(fpg, Y + 0.05, top) || propHit(s.ap, Y + 0.05, Y + 2)) return false;
      return true;
    };
    const ok = cands.filter(valid);
    if (!ok.length) return false;
    const stairs = [ok[Math.floor(rc.next() * ok.length)]];
    if (r.w * r.h >= 12 && rc.chance(0.6)) {
      const f = stairs[0];
      const mid = (s) => [(s.fp.x0 + s.fp.x1) / 2, (s.fp.z0 + s.fp.z1) / 2];
      const [fx, fz] = mid(f);
      const far = ok.filter((s) => {
        if (s === f || overlap(grow(s.fp, 0.8), grow(f.fp, 0.8)) || overlap(s.ap, f.fp) || overlap(f.ap, s.fp)) return false;
        const [sx, sz] = mid(s);
        return Math.hypot(sx - fx, sz - fz) > 6;
      });
      if (far.length) stairs.push(far[Math.floor(rc.next() * far.length)]);
    }

    // optional bridge across the shorter inner span
    let bridge = null;
    if (r.w * r.h >= 9 && rc.chance(0.55)) {
      const spanZ = inner.z1 - inner.z0 <= inner.x1 - inner.x0;   // bridge runs along z (N <-> S)
      const lo = spanZ ? inner.x0 : inner.z0, hi = spanZ ? inner.x1 : inner.z1;
      const m = (lo + hi) / 2;
      for (const c of rc.shuffle([m, m - 2.2, m + 2.2, m - 1.1, m + 1.1])) {
        if (c - BRIDGE_W / 2 < lo + 0.6 || c + BRIDGE_W / 2 > hi - 0.6) continue;
        const br = spanZ ? rect(c - BRIDGE_W / 2, inner.z0, c + BRIDGE_W / 2, inner.z1) : rect(inner.x0, c - BRIDGE_W / 2, inner.x1, c + BRIDGE_W / 2);
        const g = grow(br, 0.6);
        if (stairs.some((s) => overlap(g, s.fp))) continue;
        if (propHit(br, top - DECK_T - 0.1, top + 1.0)) continue;
        bridge = { spanZ, c, rect: br };
        break;
      }
    }

    // stairs first: one that fails to place leaves no top step, railing gap, zone or nav block behind,
    // and a catwalk without any working stair is not built at all
    const placed = [];
    for (const s of stairs) {
      const q = s.side === 3 ? 0 : s.side === 1 ? 2 : s.side === 2 ? 1 : 3;   // quarter turns: rise -> -Z local
      const T = s.edge - s.sign * slabLen;                                     // axis coordinate of the stair's top end
      const [ox, oz] = rotQ(ST.cx, ST.zTop, q);
      if (ctx.placeProp('stairs_metal', (s.alongZ ? s.c : T) - ox, Y, (s.alongZ ? T : s.c) - oz, QROT[q])) placed.push(s);
    }
    if (!placed.length) return false;

    // decks (non-overlapping strips: N and S span the corners)
    deck(a.x0, a.z0, a.x1, inner.z0, top);
    deck(a.x0, inner.z1, a.x1, a.z1, top);
    deck(a.x0, inner.z0, inner.x0, inner.z1, top);
    deck(inner.x1, inner.z0, a.x1, inner.z1, top);
    joists(a.x0, a.z0, a.x1, inner.z0, top, true);
    joists(a.x0, inner.z1, a.x1, a.z1, top, true);
    joists(a.x0, inner.z0, inner.x0, inner.z1, top, false);
    joists(inner.x1, inner.z0, a.x1, inner.z1, top, false);
    // inner fascia beams
    gb.box('frame', (inner.x0 + inner.x1) / 2, top - 0.09, inner.z0, inner.x1 - inner.x0 + 0.06, 0.16, 0.06);
    gb.box('frame', (inner.x0 + inner.x1) / 2, top - 0.09, inner.z1, inner.x1 - inner.x0 + 0.06, 0.16, 0.06);
    gb.box('frame', inner.x0, top - 0.09, (inner.z0 + inner.z1) / 2, 0.06, 0.16, inner.z1 - inner.z0);
    gb.box('frame', inner.x1, top - 0.09, (inner.z0 + inner.z1) / 2, 0.06, 0.16, inner.z1 - inner.z0);
    if (bridge) {
      const b = bridge.rect;
      deck(b.x0, b.z0, b.x1, b.z1, top);
      joists(b.x0, b.z0, b.x1, b.z1, top, !bridge.spanZ);
    }

    // railings along the inner edges, open where stairs arrive and the bridge connects
    const gaps = { 0: [], 1: [], 2: [], 3: [] };
    for (const s of placed) gaps[s.side].push([s.c - SW / 2 - 0.02, s.c + SW / 2 + 0.02]);
    if (bridge) {
      const g = [bridge.c - BRIDGE_W / 2, bridge.c + BRIDGE_W / 2];
      if (bridge.spanZ) { gaps[3].push(g); gaps[1].push(g); } else { gaps[2].push(g); gaps[0].push(g); }
    }
    const o = 0.05;
    railRun(true, inner.z0 - o, inner.x0 - o, inner.x1 + o, gaps[3], top, ceil);
    railRun(true, inner.z1 + o, inner.x0 - o, inner.x1 + o, gaps[1], top, ceil);
    railRun(false, inner.x0 - o, inner.z0 - o, inner.z1 + o, gaps[2], top, ceil);
    railRun(false, inner.x1 + o, inner.z0 - o, inner.z1 + o, gaps[0], top, ceil);
    if (bridge) {
      const b = bridge.rect;
      if (bridge.spanZ) {
        railRun(false, b.x0 + o, b.z0, b.z1, [], top, ceil);
        railRun(false, b.x1 - o, b.z0, b.z1, [], top, ceil);
      } else {
        railRun(true, b.z0 + o, b.x0, b.x1, [], top, ceil);
        railRun(true, b.z1 - o, b.x0, b.x1, [], top, ceil);
      }
    }

    // top steps, rail colliders, nav + zones; creatures keep to the floor, so only the footprint leaves the nav grid
    const stepRise = ST.rise * ST.stepRun / ST.run;
    const nSeg = Math.max(1, Math.round(ST.run));
    for (const s of placed) {
      const at = (t) => s.edge - s.sign * t;               // axis coordinate t metres back from the deck edge
      const span = (t0, t1, lat, half) => (s.alongZ ? rect(lat - half, at(t0), lat + half, at(t1)) : rect(at(t0), lat - half, at(t1), lat + half));
      for (let j = 1; j <= nSlabs; j++) {
        const t0 = slabLen - j * ST.stepRun, t1 = slabLen - (j - 1) * ST.stepRun;
        const slabTop = Y + ST.rise + topGap * j / topRises;
        slab(span(t0, t1, s.c, SW / 2), slabTop);
        // short rails on both open ends of the step; the last one runs into the deck railing line
        const t0r = j === nSlabs ? -2 * o : t0;
        for (const k of [-1, 1]) {
          const lat = s.c + k * (SW / 2 - o);
          if (s.alongZ) railing(lat, at(t0r), lat, at(t1), slabTop, null);
          else railing(at(t0r), lat, at(t1), lat, slabTop, null);
        }
      }
      // stairs_metal's handrails are visual only: collide along both sides, stepping up with the treads
      for (let k = 0; k < nSeg; k++) {
        const a0 = (ST.run * k) / nSeg, a1 = (ST.run * (k + 1)) / nSeg;   // from the stair's base
        const tread = Math.min(ST.rise, Math.ceil(a1 / ST.stepRun - 1e-6) * stepRise);
        const hgt = tread + STAIR_RAIL_H;
        for (const side of [-1, 1]) {
          const rc2 = span(slabLen + ST.run - a1, slabLen + ST.run - a0, s.c + side * (SW / 2 - 0.03), 0.04);
          ctx.addBox((rc2.x0 + rc2.x1) / 2, Y + hgt / 2, (rc2.z0 + rc2.z1) / 2, rc2.x1 - rc2.x0, hgt, rc2.z1 - rc2.z0);
        }
      }
      nav.blockBox(s.fp.x0, s.fp.z0, s.fp.x1, s.fp.z1, 0.1);
      reserve(s.ap);
      zones.push({ type: 'stairs', min: [s.fp.x0, s.fp.z0], max: [s.fp.x1, s.fp.z1], y0: Y, y1: top, room: r.id });
    }

    // hanging lamps over the walkway (lights come from the prop through the facility's placer)
    const lampY = Math.min(top + 2.3, ceil - 0.75);
    if (lampY > top + 1.95) {
      const spots = rc.shuffle([
        [(a.x0 + a.x1) / 2, (a.z0 + inner.z0) / 2], [(a.x0 + a.x1) / 2, (inner.z1 + a.z1) / 2],
        [(a.x0 + inner.x0) / 2, (a.z0 + a.z1) / 2], [(inner.x1 + a.x1) / 2, (a.z0 + a.z1) / 2],
      ]);
      for (let k = 0; k < 2; k++) {
        const [lx, lz] = spots[k];
        if (ctx.placeProp('ceiling_lamp', lx, lampY, lz, 0)) rod(lx, lz, lampY + 0.7, ceil);
      }
    }

    // loot up on the deck
    const want = 2 + (r.w * r.h >= 12 ? 1 : 0) + (rc.chance(0.4) ? 1 : 0);
    for (let k = 0, tries = 0; k < want && tries < want * 4; tries++) {
      const side = rc.int(0, 3);
      let x, z;
      if (side === 0) { x = rc.float(a.x0 + 0.7, a.x1 - 0.7); z = (a.z0 + inner.z0) / 2; }
      else if (side === 1) { x = rc.float(a.x0 + 0.7, a.x1 - 0.7); z = (inner.z1 + a.z1) / 2; }
      else if (side === 2) { x = (a.x0 + inner.x0) / 2; z = rc.float(inner.z0 + 0.3, inner.z1 - 0.3); }
      else { x = (inner.x1 + a.x1) / 2; z = rc.float(inner.z0 + 0.3, inner.z1 - 0.3); }
      if (propHit(rect(x - 0.35, z - 0.35, x + 0.35, z + 0.35), top, top + 1.2)) continue;   // pipe through the deck
      scrapSpots.push({ x, y: top, z, room: r.id, type: 'catwalk', elevated: true });
      k++;
    }
    if (bridge) {
      const b = bridge.rect;
      scrapSpots.push({ x: (b.x0 + b.x1) / 2, y: top, z: (b.z0 + b.z1) / 2, room: r.id, type: 'catwalk', elevated: true });
      zones.push({ type: 'catwalk', min: [b.x0, b.z0], max: [b.x1, b.z1], hole: null, y: top, room: r.id });
    }
    zones.push({ type: 'catwalk', min: [a.x0, a.z0], max: [a.x1, a.z1], hole: [inner.x0, inner.z0, inner.x1, inner.z1], y: top, room: r.id });
    sp.catwalks.push({
      room: r.id, top, ring: a, inner, bridge: bridge ? { spanZ: bridge.spanZ, rect: bridge.rect } : null,
      stairs: placed.map((s) => ({ side: s.side, alongZ: s.alongZ, sign: s.sign, edge: s.edge, c: s.c, fp: s.fp, ap: s.ap })),
    });
    return true;
  }

  // ---------------------------------------------------------------- d) dark corridors (plan first: vents avoid them)
  const dark = planDarkCorridors(L);
  sp.dark = dark;

  // corridor steam vents (factory only: no industrial pipes in mansion halls or mine tunnels):
  // straight cells, jet across the corridor
  if (industrial) {
    const maxN = Math.round(1 + (L.size || 1) * 2);
    const placed = [];
    for (let z = 0; z < H && placed.length < maxN; z++) for (let x = 0; x < W && placed.length < maxN; x++) {
      const i = L.idx(x, z);
      if (L.cells[i] !== 2 || L.distOf[i] <= 4 || dark.has(i) || cellHasDoorway(x, z)) continue;
      let sides = null;
      if (L.open.has(ek(x, z, 0)) && L.open.has(ek(x, z, 2)) && !edgeBusy(x, z, 1) && !edgeBusy(x, z, 3)) sides = [1, 3];
      else if (L.open.has(ek(x, z, 1)) && L.open.has(ek(x, z, 3)) && !edgeBusy(x, z, 0) && !edgeBusy(x, z, 2)) sides = [0, 2];
      if (!sides || !rCorr.chance(0.07)) continue;
      if (placed.some((p) => Math.abs(p[0] - x) + Math.abs(p[1] - z) < 4)) continue;
      const first = rCorr.chance(0.5) ? 0 : 1;
      const len = C - 0.75;
      if (addVent(rCorr, x, z, sides[first], len, rCorr.chance(0.6), -1) || addVent(rCorr, x, z, sides[1 - first], len, rCorr.chance(0.6), -1)) placed.push([x, z]);
    }
  }

  // broken, sparking fixtures in the dark runs: dangling fluorescent fittings, or (mineshaft, where
  // mineshaft.js already hangs the dead lanterns) severed power cables hanging from the tunnel roof
  const shared = mine ? {
    box: new THREE.BoxGeometry(0.16, 0.1, 0.12).translate(0, -0.05, 0),
    cable: new THREE.BoxGeometry(0.025, 1, 0.025).translate(0, -0.5, 0),
    tip: new THREE.BoxGeometry(0.045, 0.07, 0.045).translate(0, -0.035, 0),
  } : {
    housing: new THREE.BoxGeometry(1.24, 0.06, 0.24),
    tube: new THREE.CylinderGeometry(0.02, 0.02, 1.15, 5).rotateZ(Math.PI / 2),
  };
  for (const k in shared) shared[k].userData.shared = true;
  let usedShared = false;
  const housingMat = levelMaterial(mine ? 'metal_dark' : 'paint', { color: mine ? 0x6a6660 : L.theme === 'mansion' ? 0x8a6a3a : 0x9a9a90 });
  const cableMat = mine ? levelMaterial('metal_dark', { color: 0x262422 }) : null;
  function buildBrokenFixture(i) {
    usedShared = true;
    const x = i % W, z = (i / W) | 0;
    const alongX = L.open.has(ek(x, z, 0)) || L.open.has(ek(x, z, 2));
    const ceil = Y + (L.heightOf[i] || 3.3);
    const off = rDark.float(-0.8, 0.8);
    const side = mine ? rDark.sign() * rDark.float(0.55, 0.85) : 0;   // cables run along the tunnel's sides
    const root = new THREE.Group();
    root.position.set(wx(x) + C / 2 + (alongX ? off : side), ceil, wz(z) + C / 2 + (alongX ? side : off));
    root.rotation.y = alongX ? 0 : Math.PI / 2;
    root.userData.setPiece = true;
    const hinge = new THREE.Group();
    const glowMat = new THREE.MeshBasicMaterial({ color: mine ? CABLE_DIM : TUBE_DIM });
    sp.materials.push(glowMat);
    let tipLocal;
    if (mine) {
      // junction box on the roof, the severed cable swinging off it with a frayed copper end
      root.add(new THREE.Mesh(shared.box, housingMat));
      hinge.position.set(0, -0.1, 0);
      hinge.rotation.z = rDark.sign() * rDark.float(0.15, 0.5);
      const len = rDark.float(0.7, 1.25);
      const cable = new THREE.Mesh(shared.cable, cableMat);
      cable.scale.y = len;
      hinge.add(cable);
      const tip = new THREE.Mesh(shared.tip, glowMat);
      tip.position.y = -len;
      hinge.add(tip);
      tipLocal = new THREE.Vector3(0, -len - 0.07, 0);
    } else {
      hinge.position.set(-0.62, -0.03, 0);
      hinge.rotation.z = -(0.45 + rDark.float(0, 0.55));   // one chain snapped: the fixture dangles
      const housing = new THREE.Mesh(shared.housing, housingMat);
      housing.position.set(0.62, -0.03, 0);
      hinge.add(housing);
      const tube = new THREE.Mesh(shared.tube, glowMat);
      tube.position.set(0.62, -0.085, 0);
      hinge.add(tube);
      tipLocal = new THREE.Vector3(0.62, -0.1, 0);
    }
    root.add(hinge);
    sp.own(root);
    root.updateMatrixWorld(true);
    const pos = tipLocal.applyMatrix4(hinge.matrixWorld);
    const e = ctx.lightPool.add({ pos: pos.clone(), color: mine ? 0xffd9a0 : 0xcfe6ff, intensity: mine ? 1.6 : 2.0, distance: mine ? 6.5 : 7.5, group: 'facility', enabled: false });
    sp.emitters.push(e);
    const puffs = new Puffs(12, sp.getSparkMat(), pos, 3);
    sp.own(puffs.points, puffs.geo);
    const period = rDark.float(2.4, 6.5);
    sp.sparks.push({
      pos, e, glowMat, dim: mine ? CABLE_DIM : TUBE_DIM, lit: mine ? CABLE_LIT : TUBE_LIT, puffs, period,
      phase: rDark.float(0, period), seed: rDark.int(1, 0x7ffffff), cycle: null, t: 0, active: false, on: false,
    });
  }
  for (const run of dark.runs) {
    let cells = run.filter((i) => ((i % W) + ((i / W) | 0) * 3) % 3 === 0);
    if (!cells.length) cells = [run[run.length >> 1]];
    let sx = 0, sz = 0;
    for (const i of run) { sx += wx(i % W) + C / 2; sz += wz((i / W) | 0) + C / 2; }
    const cx = sx / run.length, cz = sz / run.length;
    let rad = 0;
    for (const i of run) rad = Math.max(rad, Math.hypot(wx(i % W) + C / 2 - cx, wz((i / W) | 0) + C / 2 - cz));
    zones.push({ type: 'dark', pos: new THREE.Vector3(cx, Y + 1, cz), radius: rad + C * 0.75, cells: run.slice() });
    for (const i of cells) buildBrokenFixture(i);
  }
  for (const k in shared) { if (usedShared) sp.geometries.push(shared[k]); else shared[k].dispose(); }

  // ---------------------------------------------------------------- e) blood trails
  const decal = { pos: [], nrm: [], uv: [], col: [], idx: [] };
  function pushQuad(p, n, shade) {
    const b = decal.pos.length / 3;
    for (const q of p) decal.pos.push(q[0], q[1], q[2]);
    for (let k = 0; k < 4; k++) { decal.nrm.push(n[0], n[1], n[2]); decal.col.push(shade, shade * 0.92, shade * 0.92); }
    decal.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    decal.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // floor quad centred at (cx,cz), long axis along the unit tangent (tx,tz)
  function floorDecal(cx, cz, tx, tz, hl, hw, y, shade) {
    const nx = tz, nz = -tx;   // (t x n) points up -> counter-clockwise seen from above
    pushQuad([
      [cx - tx * hl - nx * hw, y, cz - tz * hl - nz * hw], [cx + tx * hl - nx * hw, y, cz + tz * hl - nz * hw],
      [cx + tx * hl + nx * hw, y, cz + tz * hl + nz * hw], [cx - tx * hl + nx * hw, y, cz - tz * hl + nz * hw],
    ], [0, 1, 0], shade);
  }
  // wall quad on the plane through (cx,cz) with inward normal (nx,nz)
  function wallDecal(cx, cy, cz, nx, nz, hw, hh, shade) {
    const ux = nz, uz = -nx;   // u x up = n
    pushQuad([
      [cx - ux * hw, cy - hh, cz - uz * hw], [cx + ux * hw, cy - hh, cz + uz * hw],
      [cx + ux * hw, cy + hh, cz + uz * hw], [cx - ux * hw, cy + hh, cz - uz * hw],
    ], [nx, 0, nz], shade);
  }
  function buildTrail(r, rng) {
    const doorsIn = perimeter(r).filter((e) => { const inf = L.edgeInfo.get(ek(e.x, e.z, e.d)); return inf && (inf.type === 'door' || inf.type === 'arch' || inf.type === 'blast'); });
    if (!doorsIn.length) return false;
    const de = doorsIn[Math.floor(rng.next() * doorsIn.length)];
    const [ecx, ecz] = edgeCenter(de.x, de.z, de.d);
    const [ix, iz] = INWARD[de.d];
    const p0x = ecx + ix * 0.45, p0z = ecz + iz * 0.45;
    const rr = roomRect(r);
    // [x, z, x-wall side, z-wall side, corner cell x, corner cell z]
    const corners = [
      [rr.x0 + 0.95, rr.z0 + 0.95, 2, 3, r.x, r.z], [rr.x1 - 0.95, rr.z0 + 0.95, 0, 3, r.x + r.w - 1, r.z],
      [rr.x0 + 0.95, rr.z1 - 0.95, 2, 1, r.x, r.z + r.h - 1], [rr.x1 - 0.95, rr.z1 - 0.95, 0, 1, r.x + r.w - 1, r.z + r.h - 1],
    ].filter(([x, z]) => walkableAt(x, z) && Math.hypot(x - p0x, z - p0z) > 3.2 && !propHit(rect(x - 0.45, z - 0.45, x + 0.45, z + 0.45), Y + 0.02, Y + 0.7));
    if (!corners.length) return false;
    corners.sort((p, q) => Math.hypot(q[0] - p0x, q[1] - p0z) - Math.hypot(p[0] - p0x, p[1] - p0z));
    const cn = corners[corners.length > 1 && rng.chance(0.35) ? 1 : 0];
    const [ex, ez] = cn;
    const len = Math.hypot(ex - p0x, ez - p0z);
    const perpX = -(ez - p0z) / len, perpZ = (ex - p0x) / len;
    const bend = rng.float(-0.3, 0.3) * len;
    const qx = (p0x + ex) / 2 + perpX * bend, qz = (p0z + ez) / 2 + perpZ * bend;
    const steps = Math.max(5, Math.round(len / 0.45));
    let y = Y + 0.012;
    for (let k = 1; k < steps; k++) {
      const t = k / steps, mt = 1 - t;
      let bx = mt * mt * p0x + 2 * mt * t * qx + t * t * ex;
      let bz = mt * mt * p0z + 2 * mt * t * qz + t * t * ez;
      let tx = 2 * mt * (qx - p0x) + 2 * t * (ex - qx), tz = 2 * mt * (qz - p0z) + 2 * t * (ez - qz);
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      const lat = rng.float(-0.12, 0.12);
      bx += -tz * lat; bz += tx * lat;
      const shade = rng.float(0.55, 0.95);
      y += 0.0004;
      if (k % 3 === 0 || rng.chance(0.15)) {
        const a = rng.float(0, Math.PI * 2), s = rng.float(0.16, 0.28);
        floorDecal(bx, bz, Math.cos(a), Math.sin(a), s, s, y, shade);
      } else floorDecal(bx, bz, tx, tz, rng.float(0.3, 0.48), rng.float(0.13, 0.2), y, shade);
    }
    const pa = rng.float(0, Math.PI * 2), ps = rng.float(0.55, 0.75);
    floorDecal(ex, ez, Math.cos(pa), Math.sin(pa), ps, ps, y + 0.0005, 0.75);
    // smear on one closed wall of the corner
    const walls = [[cn[2], cn[4], cn[5]], [cn[3], cn[4], cn[5]]];
    if (rng.chance(0.5)) walls.reverse();
    for (const [d, cx, cz] of walls) {
      if (edgeBusy(cx, cz, d)) continue;
      const [nx, nz] = INWARD[d];
      const wxp = d === 0 ? rr.x1 : d === 2 ? rr.x0 : ex, wzp = d === 1 ? rr.z1 : d === 3 ? rr.z0 : ez;
      const slide = rng.float(-0.35, 0.35);
      wallDecal(wxp + nx * 0.03 + (d === 1 || d === 3 ? slide : 0), Y + rng.float(0.7, 1.05), wzp + nz * 0.03 + (d === 0 || d === 2 ? slide : 0), nx, nz, 0.45, 0.55, 0.7);
      break;
    }
    scrapSpots.push({ x: ex, y: Y, z: ez, room: r.id, type: 'blood', item: 'skull' });
    reserve(rect(ex - 0.45, ez - 0.45, ex + 0.45, ez + 0.45));
    sp.trails.push({ room: r.id, from: [p0x, p0z], to: [ex, ez] });
    return true;
  }
  {
    const cand = rTrail.shuffle(L.rooms.filter((r) => !SKIP_ROOMS.has(r.type) && r !== floodRoom && roomDist(r) > 3));
    const want = 1 + ((L.size || 1) >= 1.3 ? 1 : 0) + (rTrail.chance(0.5) ? 1 : 0);
    let made = 0;
    for (const r of cand) { if (made >= want) break; if (buildTrail(r, rTrail.fork('r' + r.id))) made++; }
    if (decal.idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(decal.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(decal.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(decal.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(decal.col, 3));
      g.setIndex(decal.idx);
      g.computeBoundingSphere();
      const m = levelMaterial('blood_splat', { transparent: true }).clone();
      m.depthWrite = false;
      m.polygonOffset = true; m.polygonOffsetFactor = -4; m.polygonOffsetUnits = -4;
      m.vertexColors = true;
      m.alphaTest = 0.35;
      sp.materials.push(m);
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = 1;
      mesh.matrixAutoUpdate = false;
      mesh.userData.setPiece = true;
      sp.own(mesh, g);
    }
  }

  // ---------------------------------------------------------------- merged static geometry
  const matFor = {
    grate: () => levelMaterial('metal_grate', {}),
    frame: () => levelMaterial('metal_dark', {}),
    rail: () => levelMaterial('paint', { color: 0xb09030 }),
    hazard: () => levelMaterial('hazard_stripes', {}),
    rod: () => levelMaterial('metal', {}),
    water: () => levelMaterial('water', { transparent: true, opacity: 0.84, color: 0x4a6268 }),
  };
  const built = gb.build((key) => (matFor[key] || matFor.frame)());
  if (built.children.length) {
    built.name = 'setpieces';
    built.userData.setPiece = true;
    sp.own(built);
    for (const m of built.children) if (m.geometry) sp.geometries.push(m.geometry);
  }

  return sp;
}
