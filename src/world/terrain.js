// Outdoor moon generation: heightmap terrain, flattened zones (ship, facility entrance, fire exits),
// paths, ponds, trees/rocks (instanced), misc props. Deterministic from seed.
import * as THREE from 'three';
import { RNG, Noise2D } from '../core/rng.js';
import { BIOMES } from '../game/moons.js';
import { createAnyProp as createProp } from './propfactory.js';
import { getTexture } from '../render/textures.js';
import { levelTexture } from './geobuilder.js';
import { G } from '../physics/physics.js';
import { buildOutposts } from './outposts.js';
import { buildBiomeDecor } from './outdoor_biomes.js';
import * as FACILITY from './facility.js';
import { setInteriorProbe } from '../game/moongen.js';

export const TERRAIN_SIZE = 320;   // base map size; generated big moons scale it (moon.mapScale, up to 1.5x)
const RES = 100; // cells per side at scale 1 (cell size stays ~3.2 m at every scale)
const SHIP_FLAT_Y = -1.25;

// The endless moon generator (game/moongen.js) asks which interior themes facility.js really registers
// (new themes fall back to 'factory' when missing). facility.js is loaded by now; every peer runs the
// same code, so the answer is identical everywhere.
setInteriorProbe((id) => {
  const F = FACILITY;
  if (typeof F.isInteriorTheme === 'function') return !!F.isInteriorTheme(id);   // interiors/index.js registry
  if (typeof F.moongenHasTheme === 'function') return !!F.moongenHasTheme(id);
  if (typeof F.hasInteriorTheme === 'function') return !!F.hasInteriorTheme(id);
  const T = F.THEMES || F.INTERIOR_THEMES || F.FACILITY_THEMES;
  return T && typeof T === 'object' ? !!T[id] : null;
});

export const mapScaleOf = (moon) => Math.max(1, Math.min(1.6, +moon?.mapScale || 1));

function smooth01(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

export function planMoon(seed, moon) {
  const rng = new RNG((seed ^ 0xa11ce) >>> 0);
  const biome = BIOMES[moon.biome] || BIOMES.hills;
  const sc = mapScaleOf(moon);
  // facility entrance position (bigger maps push it further out: a longer, more dangerous walk)
  const ang = rng.float(0, Math.PI * 2);
  const dist = rng.float(70, 105) * Math.min(1.25, 0.85 + (moon.size || 1) * 0.2) * (1 + (sc - 1) * 0.9);
  const entrance = { x: Math.cos(ang) * dist, z: Math.sin(ang) * dist };
  const fires = [];
  const nFire = (moon.size || 1) >= 1.2 ? 2 : 1;
  for (let i = 0; i < nFire; i++) {
    const a2 = ang + rng.sign() * rng.float(0.7, 1.5);
    const d2 = rng.float(45, 110) * sc;
    fires.push({ x: Math.cos(a2) * d2, z: Math.sin(a2) * d2 });
  }
  const ponds = [];
  const nPonds = moon.ponds ?? (biome.flood != null ? 0 : biome.water ? 2 : rng.chance(0.6) ? 1 : 0);
  for (let i = 0; i < nPonds; i++) {
    for (let t = 0; t < 30; t++) {
      const a = rng.float(0, Math.PI * 2), d = rng.float(35, 110) * sc;
      const p = { x: Math.cos(a) * d, z: Math.sin(a) * d, r: rng.float(6, 10) };
      const far = (q, m) => Math.hypot(p.x - q.x, p.z - q.z) > m;
      if (far({ x: 0, z: 0 }, 30) && far(entrance, 28) && fires.every((f) => far(f, 18)) && ponds.every((o) => far(o, 30))) { ponds.push(p); break; }
    }
  }
  return { entrance, entranceYaw: Math.atan2(-entrance.x, -entrance.z), fires, ponds, biome, scale: sc };
}

export class Terrain {
  constructor(seed, moon, plan) {
    this.seed = seed; this.moon = moon; this.plan = plan;
    this.biome = plan.biome;
    this.noise = new Noise2D(seed ^ 0x1234);
    this.noise2 = new Noise2D(seed ^ 0x9876);
    this.scale = plan.scale || 1;
    const S = TERRAIN_SIZE * this.scale;
    this.res = Math.round(RES * this.scale);
    const RES_ = this.res;
    this.half = S / 2;
    this.step = S / RES_;
    this.playHalf = 130 * this.scale;       // walkable area half-extent inside the border mountains (creature wander clamp)
    this.flood = this.biome.flood ?? null;  // world-y of the water sheet on flooded biomes
    this.heights = new Float32Array((RES_ + 1) * (RES_ + 1));
    this.pathPts = this.makePath();
    for (let j = 0; j <= RES_; j++) for (let i = 0; i <= RES_; i++) {
      const x = -this.half + i * this.step, z = -this.half + j * this.step;
      this.heights[j * (RES_ + 1) + i] = this.rawHeight(x, z);
    }
  }

  // footstep surface for game.footstep (biome.step, wading splashes in flood water)
  footSurface(pos) {
    if (this.flood != null && pos && this.heightAt(pos.x, pos.z) < this.flood - 0.05) return 'mud';
    return this.biome.step || null;
  }

  makePath() {
    // simple wobbly line from ship door (+z side) to the entrance
    const r = new RNG(this.seed ^ 0x77);
    const e = this.plan.entrance;
    const pts = [];
    const n = 24;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const wob = Math.sin(t * Math.PI) * r.float(-8, 8);
      const px = e.x * t, pz = e.z * t;
      const nx = -e.z, nz = e.x; const l = Math.hypot(nx, nz) || 1;
      pts.push({ x: px + (nx / l) * wob, z: pz + (nz / l) * wob });
    }
    return pts;
  }
  distToPath(x, z) {
    let best = 1e9;
    const P = this.pathPts;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const abx = b.x - a.x, abz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz || 1)));
      const dx = x - (a.x + abx * t), dz = z - (a.z + abz * t);
      best = Math.min(best, dx * dx + dz * dz);
    }
    return Math.sqrt(best);
  }

  rawHeight(x, z) {
    const b = this.biome;
    const n = this.noise;
    const sc = this.scale || 1;
    let h = n.fbm(x * 0.012, z * 0.012, 4) * b.height;
    h += n.ridged(x * 0.02 + 40, z * 0.02 - 17, 3) * b.height * 0.35 * (b.rough ?? 0.6);
    h += this.noise2.fbm(x * 0.08, z * 0.08, 2) * 0.8;
    // blocky "voxel" terraces (corrupted datascape)
    if (b.terrace) { const q = Math.round(h / b.terrace) * b.terrace; h += (q - h) * 0.82; }
    // flooded biomes: valleys bottom out just below the water sheet (wade-deep, never swim-deep)
    if (b.flood != null) h = Math.max(h, b.flood - 0.85);
    // border mountains
    const r = Math.max(Math.abs(x), Math.abs(z));
    h += smooth01((r - 120 * sc) / 38) * 45 + smooth01((r - 150 * sc) / 10) * 30;
    // flatten zones
    const flat = (cx, cz, rad, fall, target) => {
      const d = Math.hypot(x - cx, z - cz);
      const t = smooth01((d - rad) / fall);
      h = target * (1 - t) + h * t;
    };
    // path: soften towards a gentle line
    const pd = this.distToPath(x, z);
    const pt = smooth01((pd - 2.5) / 7);
    h = h * (0.55 + 0.45 * pt);
    const e = this.plan.entrance;
    const dryY = (y) => (b.flood != null ? Math.max(y, b.flood + 0.4) : y);   // doors never sit in the water
    this.entranceY = this.entranceY ?? dryY(n.fbm(e.x * 0.012, e.z * 0.012, 4) * b.height * 0.5);
    flat(e.x, e.z, 13, 12, this.entranceY);
    for (const f of this.plan.fires) {
      f.y = f.y ?? dryY(n.fbm(f.x * 0.012, f.z * 0.012, 4) * b.height * 0.5);
      flat(f.x, f.z, 5, 8, f.y);
    }
    for (const p of this.plan.ponds) {
      const d = Math.hypot(x - p.x, z - p.z);
      p.y = p.y ?? n.fbm(p.x * 0.012, p.z * 0.012, 4) * b.height * 0.5;
      if (d < p.r + 10) {
        const t = smooth01((d - p.r * 0.2) / (p.r + 8));
        const bowl = p.y - 1.8 * (1 - smooth01(d / p.r));
        h = bowl * (1 - t) + h * t;
      }
    }
    flat(0, 0, 13, 16, SHIP_FLAT_Y);
    return h;
  }

  heightAt(x, z) {
    const fx = (x + this.half) / this.step, fz = (z + this.half) / this.step;
    const RES_ = this.res;
    const i = Math.max(0, Math.min(RES_ - 1, Math.floor(fx))), j = Math.max(0, Math.min(RES_ - 1, Math.floor(fz)));
    const tx = fx - i, tz = fz - j;
    const H = this.heights, W = RES_ + 1;
    const h00 = H[j * W + i], h10 = H[j * W + i + 1], h01 = H[(j + 1) * W + i], h11 = H[(j + 1) * W + i + 1];
    // match triangle split (i,j)-(i+1,j+1)
    if (tx > tz) return h00 + (h10 - h00) * tx + (h11 - h10) * tz;
    return h00 + (h11 - h01) * tx + (h01 - h00) * tz;
  }

  buildMesh() {
    const RES_ = this.res, W = RES_ + 1;
    const b = this.biome;
    const tintOf = (hex) => { const c = new THREE.Color(hex ?? 0xffffff); return [c.r, c.g, c.b]; };
    const tints = { ground: tintOf(b.tint), rock: tintOf(b.rockTint ?? b.tint), path: tintOf(b.pathTint ?? b.tint) };
    const groundTex = levelTexture(b.ground);
    const rockTex = levelTexture(b.rock || 'rock');
    const pathTex = levelTexture(b.ground2 || 'dirt');
    const buckets = { ground: { p: [], n: [], uv: [], c: [], t: tints.ground }, rock: { p: [], n: [], uv: [], c: [], t: tints.rock }, path: { p: [], n: [], uv: [], c: [], t: tints.path } };
    const v = (i, j) => new THREE.Vector3(-this.half + i * this.step, this.heights[j * W + i], -this.half + j * this.step);
    const tmp1 = new THREE.Vector3(), tmp2 = new THREE.Vector3(), nrm = new THREE.Vector3();
    const tri = (a, bb, c) => {
      tmp1.subVectors(bb, a); tmp2.subVectors(c, a); nrm.crossVectors(tmp1, tmp2).normalize();
      if (nrm.y < 0) nrm.negate();
      const cx = (a.x + bb.x + c.x) / 3, cz = (a.z + bb.z + c.z) / 3;
      const steep = nrm.y < 0.78;
      const onPath = !steep && this.distToPath(cx, cz) < 3.2 && Math.hypot(cx, cz) > 12;
      const bk = steep ? buckets.rock : onPath ? buckets.path : buckets.ground;
      const shade = 0.78 + this.noise2.noise(cx * 0.15, cz * 0.15) * 0.18 + (nrm.y - 0.8) * 0.3;
      for (const p of [a, bb, c]) {
        bk.p.push(p.x, p.y, p.z); bk.n.push(nrm.x, nrm.y, nrm.z);
        bk.uv.push(p.x * 0.25, p.z * 0.25);
        bk.c.push(shade * bk.t[0], shade * bk.t[1], shade * bk.t[2]);
      }
    };
    for (let j = 0; j < RES_; j++) for (let i = 0; i < RES_; i++) {
      const a = v(i, j), bb = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
      tri(a, c, bb); tri(a, d, c);
    }
    const group = new THREE.Group();
    const mk = (bk, tex) => {
      if (!bk.p.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(bk.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(bk.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(bk.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(bk.c, 3));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide }));
      m.matrixAutoUpdate = false;
      group.add(m);
    };
    mk(buckets.ground, groundTex); mk(buckets.rock, rockTex); mk(buckets.path, pathTex);
    return group;
  }

  // collider: full trimesh
  buildCollider(physics) {
    const RES = this.res, W = RES + 1;
    const verts = new Float32Array(W * W * 3);
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const k = (j * W + i) * 3;
      verts[k] = -this.half + i * this.step; verts[k + 1] = this.heights[j * W + i]; verts[k + 2] = -this.half + j * this.step;
    }
    const idx = new Uint32Array(RES * RES * 6);
    let o = 0;
    for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
      const a = j * W + i, b = j * W + i + 1, c = (j + 1) * W + i + 1, d = (j + 1) * W + i;
      idx[o++] = a; idx[o++] = c; idx[o++] = b;
      idx[o++] = a; idx[o++] = d; idx[o++] = c;
    }
    return physics.addStaticTrimesh(verts, idx, { kind: 'terrain' });
  }
}

// Instanced placement of a prop type (keeps draw calls low). tint: multiply the prop colours (materials are
// cloned into ownMats, which the moon disposes on unload).
function instanceProps(id, placements, group, tint = null, ownMats = null) {
  if (!placements.length) return;
  const variants = new Map();
  for (const p of placements) {
    const v = p.variant ?? 0;
    if (!variants.has(v)) variants.set(v, []);
    variants.get(v).push(p);
  }
  for (const [variant, list] of variants) {
    let proto;
    try { proto = createProp(id, { seed: variant * 31 + 7, variant }); } catch (e) { console.warn(e); return; }
    proto.updateMatrixWorld(true);
    const meshes = [];
    proto.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    for (const mesh of meshes) {
      let mat = mesh.material;
      if (tint != null && ownMats) {
        const tc = new THREE.Color(tint);
        mat = (Array.isArray(mat) ? mat : [mat]).map((m0) => { const m = m0.clone(); m.color?.multiply(tc); ownMats.push(m); return m; });
        if (mat.length === 1) mat = mat[0];
      }
      const inst = new THREE.InstancedMesh(mesh.geometry, mat, list.length);
      list.forEach((p, k) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
        s.setScalar(p.scale);
        pos.set(p.x, p.y, p.z);
        m4.compose(pos, q, s).multiply(mesh.matrixWorld);
        inst.setMatrixAt(k, m4);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      group.add(inst);
    }
    // collect colliders from proto
    for (const p of list) p.colliders = proto.userData.colliders || [];
  }
}

export function buildMoonOutdoor(seed, moon, { physics, lightPool }) {
  const plan = planMoon(seed, moon);
  const terrain = new Terrain(seed, moon, plan);
  const rng = new RNG((seed ^ 0xb00b) >>> 0);
  const group = new THREE.Group();
  group.name = 'moon-outdoor';
  const colliders = [];
  const emitters = [];
  const interactables = [];
  group.add(terrain.buildMesh());
  colliders.push(terrain.buildCollider(physics));
  const b = plan.biome;
  const sc = terrain.scale || 1, sc2 = sc * sc;
  const ownMats = [];   // tinted material clones owned by this moon

  const addBox = (x, y, z, sx, sy, sz, rotY = 0) => {
    const c = physics.addStaticBox(x, y, z, sx / 2, sy / 2, sz / 2, rotY, G.STATIC, { kind: 'prop' });
    colliders.push(c);
  };
  const placeProp = (id, x, z, rotY = 0, opts = {}) => {
    let obj;
    try { obj = createProp(id, { seed: rng.int(0, 9999), ...opts }); } catch (e) { console.warn(e); return null; }
    const y = opts.y ?? terrain.heightAt(x, z);
    obj.position.set(x, y, z); obj.rotation.y = rotY;
    group.add(obj);
    obj.updateMatrixWorld(true);
    for (const c of obj.userData.colliders || []) {
      const cp = new THREE.Vector3(...c.c).applyMatrix4(obj.matrixWorld);
      addBox(cp.x, cp.y, cp.z, c.s[0], c.s[1], c.s[2], rotY);
    }
    for (const l of obj.userData.lights || []) {
      const p = new THREE.Vector3(...l.p).applyMatrix4(obj.matrixWorld);
      emitters.push({ pos: p, color: l.color, intensity: l.intensity ?? 1, distance: (l.distance ?? 9) * 1.3, group: 'outdoor' });
    }
    return obj;
  };

  // facility entrance building (front faces the ship)
  const e = plan.entrance;
  const entYaw = Math.atan2(-e.x, -e.z);
  const entObj = placeProp('facility_entrance', e.x, e.z, entYaw, { y: terrain.entranceY });
  const doorLocal = entObj?.userData.anchors?.door;
  const entDoorPos = doorLocal ? doorLocal.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(e.x, terrain.entranceY, e.z);
  const fwd = new THREE.Vector3(Math.sin(entYaw), 0, Math.cos(entYaw));
  const mainExit = { pos: entDoorPos.clone(), spawn: entDoorPos.clone().addScaledVector(fwd, 2.2), yaw: Math.atan2(-fwd.x, -fwd.z) };
  mainExit.spawn.y = Math.max(entDoorPos.y, terrain.heightAt(mainExit.spawn.x, mainExit.spawn.z)) + 0.05;   // keep the landing height (was 0.18 m inside the slab)
  interactables.push({ type: 'exit', index: 0, pos: entDoorPos.clone().add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(fwd, 0.3) });

  const fireExits = [];
  plan.fires.forEach((f, k) => {
    const yaw = rng.float(0, Math.PI * 2);
    const obj = placeProp('fire_exit', f.x, f.z, yaw, { y: f.y });
    const dl = obj?.userData.anchors?.door;
    const dp = dl ? dl.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(f.x, f.y, f.z);
    const fw = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const sp = dp.clone().addScaledVector(fw, 1.8);
    sp.y = terrain.heightAt(sp.x, sp.z) + 0.1;
    fireExits.push({ pos: dp.clone(), spawn: sp, yaw: Math.atan2(-fw.x, -fw.z) });
    interactables.push({ type: 'exit', index: k + 1, pos: dp.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(fw, 0.3) });
  });

  // ponds
  const ponds = [];
  for (const p of plan.ponds) {
    const wmat = new THREE.MeshLambertMaterial({ map: getTexture('water'), color: b.waterColor ?? 0x6d8fa0, transparent: true, opacity: 0.82 });
    if (b.decor === 'datascape' || b.decor === 'crystal') wmat.emissive = new THREE.Color(b.waterColor).multiplyScalar(0.35);   // glowing data pools
    ownMats.push(wmat);
    const water = new THREE.Mesh(new THREE.CircleGeometry(p.r * 1.25, 18), wmat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(p.x, p.y - 0.35, p.z);
    group.add(water);
    ponds.push({ x: p.x, z: p.z, r: p.r, y: p.y - 0.35, mesh: water });
    // reeds / rocks around
    for (let k = 0; k < 8; k++) {
      const a = rng.float(0, Math.PI * 2);
      const rx = p.x + Math.cos(a) * (p.r * 1.3), rz = p.z + Math.sin(a) * (p.r * 1.3);
      placeProp(rng.chance(0.6) ? 'grass_clump' : 'rock_small', rx, rz, rng.float(0, 6.28));
    }
    interactables.push({ type: 'pond', pos: new THREE.Vector3(p.x, p.y, p.z), r: p.r * 1.25 + 2.5 });
  }

  // trees / rocks scatter (instanced)
  const avoid = (x, z, m = 0) => {
    if (Math.hypot(x, z) < 26 + m) return true;
    if (Math.hypot(x - e.x, z - e.z) < 20 + m) return true;
    for (const f of plan.fires) if (Math.hypot(x - f.x, z - f.z) < 9 + m) return true;
    for (const p of plan.ponds) if (Math.hypot(x - p.x, z - p.z) < p.r * 1.4 + 2 + m) return true;
    if (terrain.distToPath(x, z) < 5 + m) return true;
    return false;
  };
  const treeId = b.trees;
  const trees = [];
  if (treeId) {
    const n = Math.round(260 * (b.treeDensity ?? 0.5) * sc2 * (moon.treeMul || 1));
    for (let k = 0; k < n * 3 && trees.length < n; k++) {
      const x = rng.float(-138, 138) * sc, z = rng.float(-138, 138) * sc;
      if (avoid(x, z)) continue;
      // clusters: accept more where noise is high
      if (terrain.noise2.noise(x * 0.02, z * 0.02) < -0.15 && rng.chance(0.7)) continue;
      const y = terrain.heightAt(x, z);
      trees.push({ x, y: y - 0.1, z, rot: rng.float(0, 6.28), scale: rng.float(0.8, 1.35), variant: rng.int(0, 2) });
    }
    instanceProps(treeId, trees, group, b.treeTint ?? null, ownMats);
  }
  const rocks = [];
  for (let k = 0; k < Math.round(90 * sc2); k++) {
    const x = rng.float(-140, 140) * sc, z = rng.float(-140, 140) * sc;
    if (avoid(x, z, -4)) continue;
    rocks.push({ x, y: terrain.heightAt(x, z) - 0.2, z, rot: rng.float(0, 6.28), scale: rng.float(0.6, 1.6), variant: rng.int(0, 2) });
  }
  const rockTint = b.rockTint != null && b.decor ? b.rockTint : null;
  instanceProps(rng.chance(0.5) ? 'rock_big' : 'rock_small', rocks.slice(0, Math.round(45 * sc2)), group, rockTint, ownMats);
  instanceProps('rock_small', rocks.slice(Math.round(45 * sc2)), group, rockTint, ownMats);
  const bushes = [];
  if (b.ground !== 'snow' && b.ground !== 'red_sand' && !b.noBushes) {
    for (let k = 0; k < Math.round(160 * sc2); k++) {
      const x = rng.float(-140, 140) * sc, z = rng.float(-140, 140) * sc;
      if (avoid(x, z, -8)) continue;
      bushes.push({ x, y: terrain.heightAt(x, z), z, rot: rng.float(0, 6.28), scale: rng.float(0.7, 1.3), variant: 0 });
    }
    const nGrass = Math.round(110 * sc2);
    instanceProps('grass_clump', bushes.slice(0, nGrass), group, b.treeTint && b.flood != null ? b.treeTint : null, ownMats);
    instanceProps('bush', bushes.slice(nGrass), group);
  }
  // colliders for trees/rocks (trunks)
  for (const list of [trees, rocks]) {
    for (const p of list) {
      for (const c of p.colliders || []) {
        const sx = c.s[0] * p.scale, sy = c.s[1] * p.scale, sz = c.s[2] * p.scale;
        const lx = c.c[0] * p.scale, lz = c.c[2] * p.scale;
        const cs = Math.cos(p.rot), sn = Math.sin(p.rot);
        addBox(p.x + lx * cs + lz * sn, p.y + c.c[1] * p.scale, p.z - lx * sn + lz * cs, sx, sy, sz, p.rot);
      }
    }
  }

  // biome set dressing (neon grid + monoliths, flooded racks, burnt husks + fires, crystal fields): own RNG
  // stream, instanced/merged geometry, added straight to the group so the outposts see it as obstacles
  let decor = null;
  if (b.decor) {
    try {
      decor = buildBiomeDecor({ seed, moon, biome: b, terrain, plan, group, addBox, avoid, emitters, sc });
    } catch (err) { console.warn('biome decor', err); decor = null; }
  }

  // points of interest / junk
  const poi = b.poi || ['shipping_container', 'car_wreck', 'oil_drum_stack', 'ruined_wall', 'fence_segment', 'fence_segment', 'lamp_post', 'power_pylon', 'radio_tower',
    'ext:barrier_jersey', 'ext:barrier_jersey_broken', 'ext:kk_containers_a', 'ext:kk_containers_c', 'ext:ind_cargo_1_open', 'ext:psx_dumpster', 'ext:kst_skip_rocks', 'ext:kk_solarpanel', 'ext:bollard_concrete_light'];
  // a big industrial landmark (cooling tower / reservoir) somewhere on the map (two on big maps)
  for (let li = 0; li < (sc > 1.2 ? 2 : 1); li++) {
    const lm = rng.pick(b.landmarks || ['ext:ind_cooling_tower', 'ext:ind_liquid_reservoir_2', 'ext:kk_lights']);
    for (let t = 0; t < 20; t++) {
      const x = rng.float(-115, 115) * sc, z = rng.float(-115, 115) * sc;
      if (avoid(x, z, 8)) continue;
      placeProp(lm, x, z, rng.float(0, 6.28));
      break;
    }
  }
  const nPoi = Math.round((10 + Math.round((moon.size || 1) * 6)) * sc);
  const outdoorScrapSpots = [];
  for (const s of (decor?.scrapSpots || []).slice(0, 2)) outdoorScrapSpots.push({ x: s.x, z: s.z });
  for (let k = 0; k < nPoi; k++) {
    const id = rng.pick(poi);
    for (let t = 0; t < 10; t++) {
      const x = rng.float(-120, 120) * sc, z = rng.float(-120, 120) * sc;
      if (avoid(x, z, 2)) continue;
      placeProp(id, x, z, rng.float(0, 6.28));
      if (rng.chance(0.4)) outdoorScrapSpots.push({ x: x + rng.float(-3, 3), z: z + rng.float(-3, 3) });
      break;
    }
  }
  // outposts: hand-built outdoor points of interest (camp / cargo drop / bunker / radio station / lander)
  let outposts = null;
  try {
    outposts = buildOutposts({ seed, moon, plan, terrain, group, physics, lightPool, rng, addBox, placeProp, avoid });
  } catch (err) { console.warn('outposts', err); }
  // lamp posts along the path
  for (let k = 3; k < terrain.pathPts.length - 2; k += 6) {
    const p = terrain.pathPts[k];
    if (Math.hypot(p.x + 3.5, p.z + 1) < 18) continue;
    placeProp('lamp_post', p.x + 3.5, p.z + 1, rng.float(0, 6.28));
  }

  for (const em of emitters) lightPool.add(em);
  for (const s of outdoorScrapSpots) s.y = terrain.heightAt(s.x, s.z);

  return {
    group, colliders, emitters, terrain, plan, interactables, ponds, mainExit, fireExits, outdoorScrapSpots,
    entranceObj: entObj,
    outposts,
    decor,
    // per-frame visuals of the biome decor (glitch cubes, pulsing grid, fires, blinking racks); cheap when idle
    update(dt, game) { decor?.update(dt, game); },
    dispose(physicsRef) {
      for (const c of colliders) physicsRef.removeCollider(c);
      for (const em of emitters) lightPool.remove(em);
      outposts?.dispose(physicsRef);
      decor?.dispose();
      group.traverse((o) => { if (o.geometry && o.isMesh && !o.isInstancedMesh) o.geometry.dispose(); });
      for (const m of ownMats) m.dispose();
      group.removeFromParent();
    },
  };
}
