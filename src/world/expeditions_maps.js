// EXPEDITION MOON maps (wave 8): Sunken Server Barge, Dune Relay Caravan, Rooftop Blackout City. Custom outdoor maps (moon.customMap, no facility) that return
// the same object shape as world/terrain.js buildMoonOutdoor() / homeworld_map.js so every system that reads world.outdoor keeps working.
// The ground is the shared heightfield `Terrain` (barge: seabed basin, dune: the desert dune kit + flat pads, roof: a flat street with heightAt lifted over the
// roofs so drone searchlights land on them); everything else is boxes baked into two merged meshes by voyage_kit.Kit (lit + emissive) with static colliders and
// pooled emitters (the light count never changes). Layouts come from game/expeditions_core.js (seeded, pure); dynamic bits live in out.ex.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Terrain } from './terrain.js';
import { Kit } from './voyage_kit.js';
import { planStairs, emitStairs, checkStairs } from './stairs.js';
import { RNG } from '../core/rng.js';
import { G } from '../physics/physics.js';
import * as K from '../game/expeditions_core.js';

const V3 = THREE.Vector3;
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const noSnap = (m) => { m.defines = { ...(m.defines || {}), PSX_NOSNAP: '' }; return m; };

/** shared heightfield: rawHeight comes from plan.hf, heightAt is lifted by plan.top (roofs) */
class ExTerrain extends Terrain {
  rawHeight(x, z) { return this.plan.hf(x, z); }
  heightAt(x, z) { const h = super.heightAt(x, z), e = this.plan.top ? this.plan.top(x, z) : null; return e != null && e > h ? e : h; }
}

function makeBase({ seed, moon, physics, lightPool, plan, kind, TerrainCls = Terrain }) {
  const group = new THREE.Group(); group.name = 'expedition-' + kind;
  const colliders = [], emitters = [], geos = [], mats = [], objs = [], footprints = [], ownMats = [];
  const terrain = new TerrainCls(seed, moon, plan);
  group.add(terrain.buildMesh());
  colliders.push(terrain.buildCollider(physics));
  const addBox = (x, y, z, sx, sy, sz, rotY = 0, data = null) => {
    footprints.push([x, y, z, sx / 2, sy / 2, sz / 2, +rotY || 0]);
    const c = physics.addStaticBox(x, y, z, sx / 2, sy / 2, sz / 2, rotY, G.STATIC, data || { kind: 'prop' });
    colliders.push(c); return c;
  };
  const env = { add: (o) => { group.add(o); objs.push(o); return o; }, own: (g) => { geos.push(g); return g; }, mat: (m) => { mats.push(m); return m; }, addBox, emitters };
  const solidAt = (x, z, r = 0, y = null) => {
    for (const [bx, by, bz, hx, hy, hz, rot] of footprints) {
      if (hy < 0.2 || (y != null && (by + hy < y + 0.2 || by - hy > y + 1.6))) continue;
      const dx = x - bx, dz = z - bz, cs = Math.cos(rot), sn = Math.sin(rot);
      if (Math.abs(dx * cs - dz * sn) < hx + r && Math.abs(dx * sn + dz * cs) < hz + r) return true;
    }
    return false;
  };
  const half = terrain.playHalf;
  const avoid = (x, z, r = 0) => Math.abs(x) > half - 2 || Math.abs(z) > half - 2 || Math.hypot(x, z) < 14 || solidAt(x, z, r);
  // invisible boundary walls (like the homeworld plateau)
  for (const [x, z, sx, sz] of [[half + 2, 0, 2, 2 * half + 12], [-half - 2, 0, 2, 2 * half + 12], [0, half + 2, 2 * half + 12, 2], [0, -half - 2, 2 * half + 12, 2]]) addBox(x, 20, z, sx, 90, sz, 0, { kind: 'wall' });
  return { group, colliders, emitters, geos, mats, objs, footprints, ownMats, terrain, addBox, env, solidAt, avoid, half, lightPool };
}
const finishOut = (B, extra) => {
  const { group, colliders, emitters, terrain, lightPool, geos, mats, ownMats, objs, solidAt, avoid } = B;
  for (const em of emitters) lightPool.add(em);
  const out = {
    group, colliders, emitters, terrain, plan: extra.plan || terrain.plan, interactables: [], ponds: [], mainExit: extra.mainExit, fireExits: [], outdoorScrapSpots: [], entranceObj: null,
    outposts: null, decor: null, landmarks: null, harvest: { trees: [], rocks: [] }, avoid, solidAt, ownMats, expedition: extra.kind, ex: extra.ex,
    update(dt, game) { extra.update?.(dt, game); },
    dispose(physicsRef) {
      for (const c of colliders) physicsRef.removeCollider(c);
      for (const em of emitters) lightPool.remove(em);
      extra.dispose?.();
      group.traverse((o) => { if (o.geometry && o.isMesh && !o.isInstancedMesh) o.geometry.dispose(); });
      for (const g of geos) g.dispose();
      for (const m of [...mats, ...ownMats]) m.dispose();
      group.removeFromParent();
    },
  };
  void objs;
  return out;
};
const mainExitAt = (x, z, y, yaw = 0) => ({ pos: new V3(x, y + 1.4, z), spawn: new V3(x, y + 0.05, z + 2), yaw });
/** a thin glowing cable along a polyline (merged cylinders) */
function cableGeo(pts, r = 0.05) {
  const parts = [], up = new V3(0, 1, 0), q = new THREE.Quaternion(), m = new THREE.Matrix4();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = new V3().subVectors(b, a), l = d.length();
    const g = new THREE.CylinderGeometry(r, r, l, 4); q.setFromUnitVectors(up, d.normalize());
    m.compose(new V3().addVectors(a, b).multiplyScalar(0.5), q, new V3(1, 1, 1)); g.applyMatrix4(m);
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  for (const g of parts) if (g.attributes.uv) g.deleteAttribute('uv');
  return mergeGeometries(parts, false);
}
const stairsInto = (K0, B, plan, color, { solid = true } = {}) => {
  emitStairs(plan, {
    vis: (s) => K0.box(s.cx, s.y0, s.cz, s.sx, s.top - s.y0, s.sz, color),
    col: (b) => B.addBox(b.cx, b.cy, b.cz, b.sx, b.sy, b.sz, 0, { kind: 'wall' }),
    ramp: (r) => B.addBox(r.cx, r.cy, r.cz, r.sx, r.sy, r.sz, r.q, { kind: 'wall' }),
  });
  void solid;
};
const boxOf = (K0, s, color, o = {}) => K0.box((s.x0 + s.x1) / 2, s.y0, (s.z0 + s.z1) / 2, s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0, color, { solid: true, data: { kind: 'wall' }, ...o });

// ------------------------------------------------------------------------------------------------ BARGE
export function buildBarge(seed, moon, { physics, lightPool, biome }) {
  const P = K.planBarge(seed), sb = K.BARGE.seabed;
  const plan = {
    entrance: { x: P.E.x, z: P.E.z }, fires: [], ponds: [], lakes: [], flats: [], biome, scale: 1, playRing: 118,
    hf: (x, z) => {
      const r = Math.hypot(x, z), rInf = Math.max(Math.abs(x), Math.abs(z));
      let h = K.SHIP_Y + (sb - K.SHIP_Y) * smooth((r - 13) / 28);
      if (h < sb + 0.05) {
        const inHull = x > P.hull.x0 - 5 && x < P.hull.x1 + 5 && z > P.hull.z0 - 5 && z < P.hull.z1 + 5;
        if (!inHull) h += 0.32 * Math.sin(x * 0.21 + z * 0.13) * smooth((r - 46) / 10);
      }
      return h + smooth((rInf - 112) / 14) * 26;
    },
  };
  const B = makeBase({ seed, moon, physics, lightPool, plan, kind: 'barge', TerrainCls: ExTerrain });
  const { group, env, terrain, emitters } = B;
  const k = new Kit(env, 0, 0, 0, 0);
  // docking rig under the ship: a rusty plate disc, posts with lamps
  const padGeo = new THREE.CircleGeometry(13.6, 40); padGeo.rotateX(-Math.PI / 2);
  const padMat = noSnap(new THREE.MeshLambertMaterial({ color: 0x59422f })); padMat.polygonOffset = true; padMat.polygonOffsetFactor = -3; padMat.polygonOffsetUnits = -3;
  const pad = new THREE.Mesh(padGeo, padMat); pad.position.y = K.SHIP_Y + 0.04; env.add(pad); env.own(padGeo); env.mat(padMat);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3, x = Math.cos(a) * 12.6, z = Math.sin(a) * 12.6; k.box(x, K.SHIP_Y, z, 0.35, 2.2, 0.35, 0x3a3f44, { solid: true, data: { kind: 'prop', id: 'ex_post' } }); k.box(x, K.SHIP_Y + 2.2, z, 0.5, 0.25, 0.5, 0xffb060, { glow: true }); }
  emitters.push({ pos: new V3(9, K.SHIP_Y + 3, 9), color: 0xffb060, intensity: 1.1, distance: 18, group: 'outdoor' }, { pos: new V3(-9, K.SHIP_Y + 3, -9), color: 0xffb060, intensity: 1.1, distance: 18, group: 'outdoor' });
  // hull, decks, cabins, containers (colour by kind)
  const COL = { hull: 0x86705a, bulk: 0x5e5044, deck: 0x5f6a72, pillar: 0x353b40, cabin: 0x3f4a52, roof: 0x2f373c, rack: 0x252a30, console: 0x2b3238, container: 0x6a3a2c };
  const CONT = [0x7a3b2e, 0x2e5a6a, 0x6a6a3a, 0x4a4f5a, 0x5a3a5a];
  let ci = 0;
  for (const s of P.solids) boxOf(k, s, s.k === 'container' ? CONT[(ci++) % CONT.length] : COL[s.k] || 0x4a4038, { data: { kind: 'wall' } });
  // ramp to the server deck
  const rp = planStairs(P.ramp); const errs = checkStairs(rp); if (errs.length) console.warn('[barge] ramp', errs);
  stairsInto(k, B, rp, 0x4b535a);
  // glow: server LEDs, cabin lamps, hazard trim along the bulkheads
  const dY = P.dY;
  for (let i = 0; i < 6; i++) { k.box(P.cx - 33.3 + 0.05, dY + 0.4 + i * 0.32, P.cz - 3.6 + (i % 2) * 5.6 + 0.2, 0.06, 0.08, 1.0, i % 3 === 0 ? 0xffb040 : 0x40e0ff, { glow: true }); }
  emitters.push({ pos: new V3(P.cx - 30, dY + 2.4, P.cz), color: 0x7fe6ff, intensity: 1.0, distance: 10, group: 'outdoor' }, { pos: new V3(P.cx + 30, K.BARGE.seabed + 2.4, P.cz), color: 0xffc070, intensity: 1.0, distance: 10, group: 'outdoor' });
  k.box(P.cx - 30, dY + 2.85, P.cz, 3.2, 0.05, 0.4, 0xbff4ff, { glow: true }); k.box(P.cx + 30, sb + 2.85, P.cz, 3.2, 0.05, 0.4, 0xffd9a0, { glow: true });
  // bubble vents: pipe + glowing cap + a pooled emitter each
  for (const v of P.vents) {
    const y = terrain.heightAt(v.x, v.z);
    k.cyl(v.x, y, v.z, 0.32, 1.5, 0x3a4a50); k.cyl(v.x, y + 1.5, v.z, 0.42, 0.16, 0x40e8ff, { glow: true, seg: 8 });
    emitters.push({ pos: new V3(v.x, y + 2.2, v.z), color: 0x40e0ff, intensity: 1.3, distance: 15, group: 'outdoor' });
  }
  // rocks (seabed debris) with a collider box each
  for (const r of P.rocks) {
    const y = terrain.heightAt(r.x, r.z);
    k.ico(r.x, y + r.r * 0.55, r.z, r.r, 0x3c4a4a, { sy: 0.7, detail: 0 });
    B.addBox(r.x, y + r.r * 0.5, r.z, r.r * 1.5, r.r * 1.0, r.r * 1.5, 0, { kind: 'prop', id: 'ex_rock' });
  }
  // sunken wreck silhouettes: masts, funnels, listing container stacks that poke above the sea so the basin reads as a graveyard from the dock
  {
    const WR = new RNG((seed ^ 0x5eaf) >>> 0), inHull = (x, z, m) => x > P.hull.x0 - m && x < P.hull.x1 + m && z > P.hull.z0 - m && z < P.hull.z1 + m;
    const near = (x, z) => P.vents.some((v) => Math.hypot(v.x - x, v.z - z) < 5) || P.cores.some((c) => Math.hypot(c.x - x, c.z - z) < 5) || P.rocks.some((r) => Math.hypot(r.x - x, r.z - z) < r.r + 3);
    for (let i = 0, n = 0; i < 80 && n < 9; i++) {   // the first six sit in the cone toward the barge (the view from the dock)
      const a = n < 6 ? Math.atan2(P.cz, P.cx) + WR.float(-0.5, 0.5) : WR.float(0, Math.PI * 2), d = WR.float(24, 66), x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x) > 100 || Math.abs(z) > 100 || inHull(x, z, 8) || near(x, z) || B.solidAt(x, z, 3)) continue;
      const y = terrain.heightAt(x, z), top = K.BARGE.water + WR.float(4, 13), h = top - y, kind = n % 3;
      if (kind === 0) { k.box(x, y, z, 0.7, h, 0.7, 0x2c3338, { solid: true, data: { kind: 'prop', id: 'ex_wreck' } }); k.box(x - 2.4, y + h - 1.4, z, 5.6, 0.45, 0.45, 0x2c3338, { ry: WR.float(-0.4, 0.4) }); k.box(x, y + h, z, 0.34, 0.34, 0.34, 0xff5a3a, { glow: true }); }
      else if (kind === 1) { k.cyl(x, y, z, 2.1, h, 0x4a3d34, { seg: 8, solid: true, data: { kind: 'prop', id: 'ex_wreck' } }); k.cyl(x, y + h - 0.5, z, 2.25, 0.5, 0xa03a2a, { seg: 8 }); }
      else { const cy = K.BARGE.water + WR.float(0.6, 2.2); k.box(x, y, z, 2.6, cy - y, 2.6, 0x3b3c40, { solid: true, data: { kind: 'prop', id: 'ex_wreck' } }); k.box(x, cy, z, 6.4, 2.5, 2.5, CONT[n % CONT.length], { ry: WR.float(0, 3.1), rz: WR.float(-0.25, 0.25) }); }
      n++;
    }
  }
  // [expedfix2] barge readable from the dock: deck lights along the rails, lit portholes, a crane silhouette with a red lamp (emissive/merged only)
  {
    const H = P.hull, sz = P.sz, wz = sz > 0 ? H.z0 : H.z1, out = -sz * 0.45, topY = sb - 0.3 + K.BARGE.wallH;
    for (let x = H.x0 + 3; x < H.x1 - 2; x += 4) {
      k.box(x, topY + 0.02, wz + out, 0.5, 0.35, 0.3, 0xffe2a0, { glow: true });                 // rail lamp on the near wall top
      if (((x - H.x0) / 4 | 0) % 2 === 0) k.box(x + 1.4, K.BARGE.water + 1.1, wz + out * 0.6, 0.7, 0.7, 0.16, 0xffc36a, { glow: true });   // porthole above the waterline
    }
    for (const zz of [H.z0 + 0.3, H.z1 - 0.3]) for (let x = H.x0 + 2; x < H.x1 - 1; x += 6) k.box(x, topY + 0.05, zz, 0.3, 0.3, 0.3, 0x7fe6ff, { glow: true });
    const cxp = H.x0 + 0.55 * (H.x1 - H.x0), cz0 = (H.z0 + H.z1) / 2;
    k.box(cxp, topY, cz0, 1.2, 15, 1.2, 0x3a4048); k.box(cxp + 6, topY + 15, cz0, 16, 0.8, 0.8, 0x3a4048); k.box(cxp + 14, topY + 10, cz0, 0.2, 5, 0.2, 0x2c3238);
    k.box(cxp - 1.4, topY + 15.9, cz0, 0.7, 0.7, 0.7, 0xff2a1a, { glow: true }); k.box(cxp + 14, topY + 15.4, cz0, 0.5, 0.5, 0.5, 0xff2a1a, { glow: true });
  }
  k.finish();
  // water sheet + bubbles + core beacons (dynamic)
  const wGeo = new THREE.PlaneGeometry(420, 420); wGeo.rotateX(-Math.PI / 2);
  const wMat = noSnap(new THREE.MeshBasicMaterial({ color: 0x0f5a72, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, fog: true }));
  const water = new THREE.Mesh(wGeo, wMat); water.position.y = K.BARGE.water; env.add(water); env.own(wGeo); env.mat(wMat);
  const NB = P.vents.length * 22, bp = new Float32Array(NB * 3), bph = new Float32Array(NB);
  for (let i = 0; i < NB; i++) { bph[i] = ((i * 0.6180339) % 1) * 5; const v = P.vents[i % P.vents.length]; bp[i * 3] = v.x; bp[i * 3 + 1] = terrain.heightAt(v.x, v.z); bp[i * 3 + 2] = v.z; }
  const bGeo = new THREE.BufferGeometry(); bGeo.setAttribute('position', new THREE.BufferAttribute(bp.slice(), 3));
  const bMat = new THREE.PointsMaterial({ color: 0xbff8ff, size: 0.22, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const bubbles = new THREE.Points(bGeo, bMat); bubbles.frustumCulled = false; env.add(bubbles); env.own(bGeo); env.mat(bMat);
  const beacons = P.cores.map((c) => {
    const g = new THREE.BoxGeometry(0.16, 5.5, 0.16); g.translate(0, 2.75, 0);
    const m = new THREE.MeshBasicMaterial({ color: 0x40f0ff, transparent: true, opacity: 0.55, depthWrite: false, fog: true });
    const mesh = new THREE.Mesh(g, m); mesh.position.set(c.x, c.y, c.z); env.add(mesh); env.own(g); env.mat(m); return mesh;
  });
  let t = 0;
  const update = (dt) => {
    t += dt;
    const a = bGeo.attributes.position.array;
    for (let i = 0; i < NB; i++) {
      const up = ((t * 1.7 + bph[i]) % 5) / 5 * 7.4, v = P.vents[i % P.vents.length];
      a[i * 3] = bp[i * 3] + Math.sin(t * 2 + i) * 0.12 * (up / 7); a[i * 3 + 1] = bp[i * 3 + 1] + up; a[i * 3 + 2] = bp[i * 3 + 2] + Math.cos(t * 1.7 + i * 1.3) * 0.12 * (up / 7);
      void v;
    }
    bGeo.attributes.position.needsUpdate = true;
    for (const b of beacons) if (b.visible) b.material.opacity = 0.35 + 0.25 * Math.sin(t * 3);
  };
  const first = P.cores[0];
  return finishOut(B, { kind: 'barge', plan: { ...plan, entrance: undefined }, mainExit: mainExitAt(first.x, first.z, first.y), ex: { kind: 'barge', plan: P, beacons, water }, update });
}

// ------------------------------------------------------------------------------------------------ DUNE
export function buildDune(seed, moon, { physics, lightPool, biome }) {
  const P = K.planDune(seed);
  const plan = { entrance: { x: P.entrance.x, z: P.entrance.z }, fires: [], ponds: [], lakes: [], flats: P.flats.map((f) => ({ ...f })), biome, scale: 0.85 };
  const B = makeBase({ seed, moon, physics, lightPool, plan, kind: 'dune' });
  const { env, terrain, emitters } = B;
  const k = new Kit(env, 0, 0, 0, 0);
  // tents: four poles + a canopy 3.2 m up, a banner strip; barrels; rock outcrops with a collider each
  for (const q of P.tents) {
    const y = terrain.heightAt(q.x, q.z);
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) k.box(q.x + dx, y, q.z + dz, 0.3, 3.2, 0.3, 0x5a4a3a, { solid: true, data: { kind: 'prop', id: 'ex_pole' } });
    k.box(q.x, y + 3.2, q.z, 7.2, 0.16, 7.2, 0xc7b48a); k.box(q.x, y + 3.05, q.z + 3.55, 7.0, 0.1, 0.1, 0xff9a3a, { glow: true });
  }
  for (const q of P.barrels) {
    const y = terrain.heightAt(q.x, q.z);
    k.cyl(q.x, y, q.z, 0.55, 1.15, 0x2f5f78, { solid: true, seg: 10, data: { kind: 'prop', id: 'ex_barrel' } }); k.cyl(q.x, y + 1.15, q.z, 0.4, 0.08, 0x5ad4ff, { glow: true, seg: 10 });
  }
  for (const r of P.rocks) {
    const y = terrain.heightAt(r.x, r.z);
    k.ico(r.x, y + r.h * 0.4, r.z, r.r, 0x8a5a3c, { sy: r.h / r.r * 0.55, detail: 0 });
    B.addBox(r.x, y + r.h * 0.4, r.z, r.r * 1.5, r.h * 0.8, r.r * 1.5, 0, { kind: 'prop', id: 'ex_rock' });
  }
  // relay pylons at C1..C3: a mast + a top lamp (dynamic: red -> green when the crawler gets there)
  const lampGeo = new THREE.SphereGeometry(0.42, 8, 6), lamps = [], beamGeo = new THREE.CylinderGeometry(0.35, 0.35, 60, 6, 1, true); env.own(beamGeo);
  for (let i = 1; i <= 3; i++) {
    const p = P.route[i], y = terrain.heightAt(p.x, p.z), ox = 5, oz = 0;
    k.box(p.x + ox, y, p.z + oz, 0.7, 9, 0.7, 0x4a4f55, { solid: true, data: { kind: 'prop', id: 'ex_pylon' } }); k.box(p.x + ox, y + 9, p.z + oz, 1.6, 0.4, 1.6, 0x2a2e33);
    const m = new THREE.MeshBasicMaterial({ color: 0xff3a24, fog: true }), mesh = new THREE.Mesh(lampGeo, m); mesh.position.set(p.x + ox, y + 9.6, p.z + oz); mesh.scale.setScalar(1.8); env.add(mesh); env.mat(m); lamps.push(mesh);
    const bm = new THREE.MeshBasicMaterial({ color: 0xff3a24, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), beam = new THREE.Mesh(beamGeo, bm);   // [expedfix2] tall checkpoint beam
    beam.position.set(p.x + ox, y + 10, p.z + oz); env.add(beam); env.mat(bm); mesh.userData.beam = beam;
  }
  env.own(lampGeo);
  // start pad marker at S0 (the crawler parks here)
  const s0 = P.route[0], y0 = terrain.heightAt(s0.x, s0.z);
  k.box(s0.x, y0, s0.z, 9, 0.12, 9, 0x59503f); for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) k.box(s0.x + dx, y0 + 0.12, s0.z + dz, 0.5, 0.14, 0.5, 0xffb060, { glow: true });
  k.finish();
  // the relay crawler (own group, moved by the module): tracks, hull, cab, solar wings, dish, 3 progress lamps
  const cw = new THREE.Group(); cw.name = 'ex-crawler';
  const cenv = { add: (o) => cw.add(o), own: (g) => env.own(g), mat: (m) => env.mat(m), addBox: () => {}, emitters: [] };
  const ck = new Kit(cenv, 0, 0, 0, 0);
  for (const sx of [-1.7, 1.7]) { ck.box(sx, 0, 0, 0.95, 0.9, 7.2, 0x2a2d31); for (let z = -3; z <= 3; z += 1) ck.box(sx, 0.9, z, 1.05, 0.06, 0.16, 0x111417); }
  ck.box(0, 0.7, 0, 3.0, 1.0, 6.6, 0x6b7280); ck.box(0, 1.7, -1.2, 2.6, 1.3, 3.2, 0x8d95a3); ck.box(0, 1.9, -1.2, 2.66, 0.35, 2.4, 0x9fe8ff, { glow: true });
  ck.box(0, 1.7, 2.4, 2.4, 0.6, 2.0, 0x4d535d); for (const sx of [-2.2, 2.2]) ck.box(sx, 3.05, 0.4, 2.2, 0.08, 4.4, 0x2b4a7a);
  ck.box(0, 3.0, -1.2, 0.2, 1.4, 0.2, 0x333940); ck.cone(0, 3.9, -1.2, 0.9, 0.35, 0xdfe6ef); ck.box(0, 0.9, 3.55, 2.4, 0.16, 0.16, 0xfff0c0, { glow: true });
  ck.finish();
  const lampMat = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: 0xff3a24, fog: true })), lampG = new THREE.BoxGeometry(0.4, 0.22, 0.4), cwLamps = lampMat.map((m, i) => { const me = new THREE.Mesh(lampG, m); me.position.set(-0.6 + i * 0.6, 2.42, 0.4); cw.add(me); return me; });
  env.own(lampG); for (const m of lampMat) env.mat(m);
  cw.position.set(s0.x, y0, s0.z); env.add(cw);
  const cwEm = { pos: new V3(s0.x, y0 + 2, s0.z), color: 0xfff0c0, intensity: 1.2, distance: 16, group: 'outdoor' }; emitters.push(cwEm);
  // dust (sandstorm): a box of streaks around the camera
  const ND = 460, dp = new Float32Array(ND * 3), dv = new Float32Array(ND);
  const dRng = new RNG((seed ^ 0xd057) >>> 0);
  for (let i = 0; i < ND; i++) { dp[i * 3] = dRng.float(-40, 40); dp[i * 3 + 1] = dRng.float(0, 18); dp[i * 3 + 2] = dRng.float(-40, 40); dv[i] = dRng.float(0.6, 1.4); }
  const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dp.slice(), 3));
  const dMat = new THREE.PointsMaterial({ color: 0xd9a86c, size: 0.34, transparent: true, opacity: 0, depthWrite: false, fog: true });
  const dust = new THREE.Points(dGeo, dMat); dust.frustumCulled = false; env.add(dust); env.own(dGeo); env.mat(dMat);
  // [expedfix2] hard low sun: a bright disc + halo (unfogged, additive), billboarded toward the camera
  const sunG = new THREE.CircleGeometry(1, 24), sunM = new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false, depthWrite: false, transparent: true }), haloM = new THREE.MeshBasicMaterial({ color: 0xffa84a, fog: false, depthWrite: false, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending });
  const sun = new THREE.Group(), sd = new THREE.Mesh(sunG, sunM), sh = new THREE.Mesh(sunG, haloM); sd.scale.setScalar(16); sh.scale.setScalar(70); sh.position.z = -0.5; sun.add(sh, sd); sun.position.set(-150, 85, -150); env.add(sun); env.own(sunG); env.mat(sunM); env.mat(haloM);
  const ex = { kind: 'dune', plan: P, crawler: cw, cwLamps, cwEm, pylons: lamps, storm: 0, cwCollider: null, dust, dMat, placed: -1 };
  let t = 0;
  const cwSet = (s, mode) => {
    const r = K.routeAt(P, s), y = terrain.heightAt(r.x, r.z), yf = terrain.heightAt(r.x + Math.sin(r.yaw) * 3, r.z + Math.cos(r.yaw) * 3), yb = terrain.heightAt(r.x - Math.sin(r.yaw) * 3, r.z - Math.cos(r.yaw) * 3);
    cw.position.set(r.x, y + 0.02, r.z); cw.rotation.set(-Math.atan2(yf - yb, 6), r.yaw, 0, 'YXZ');
    cwEm.pos.set(r.x + Math.sin(r.yaw) * 4, y + 1.2, r.z + Math.cos(r.yaw) * 4);
    ex.cwPos = { x: r.x, z: r.z, y, yaw: r.yaw };
    void mode;
  };
  ex.setCrawler = (s, mode, rep, cp) => {
    cwSet(s, mode);
    for (let i = 0; i < 3; i++) cwLamps[i].material.color.setHex(i < cp ? 0x40ff70 : (i === cp && mode === 'park' ? (Math.sin(t * 6) > 0 ? 0xffb020 : 0x552200) : 0xff3a24));
    for (let i = 0; i < 3; i++) { lamps[i].material.color.setHex(i < cp ? 0x40ff70 : 0xff3a24); lamps[i].userData.beam.material.color.setHex(i < cp ? 0x40ff70 : 0xff3a24); }
    void rep;
  };
  ex.setCollider = (on, physics2) => {   // the chassis is solid only while parked
    if (ex.cwCollider) { try { physics2.removeCollider(ex.cwCollider); } catch { /* gone */ } const i = B.colliders.indexOf(ex.cwCollider); if (i >= 0) B.colliders.splice(i, 1); ex.cwCollider = null; }
    if (on && ex.cwPos) { const p = ex.cwPos; ex.cwCollider = B.addBox(p.x, p.y + 1.1, p.z, 3.6, 2.2, 7.4, p.yaw, { kind: 'prop', id: 'ex_crawler' }); }
  };
  const update = (dt, game) => {
    t += dt;
    const cam = game?.camera?.position;
    if (game?.camera) sun.lookAt(game.camera.position);
    if (cam) {
      const a = dGeo.attributes.position.array, k2 = ex.storm, wind = 6 + 16 * k2;
      for (let i = 0; i < ND; i++) {
        let x = dp[i * 3] - t * wind * dv[i], y = dp[i * 3 + 1], z = dp[i * 3 + 2] + Math.sin(t * 0.7 + i) * 0.4;
        x = ((x % 80) + 120) % 80 - 40;
        a[i * 3] = cam.x + x; a[i * 3 + 1] = cam.y - 3 + y; a[i * 3 + 2] = cam.z + z;
      }
      dGeo.attributes.position.needsUpdate = true;
    }
    dMat.opacity = Math.min(0.85, ex.storm * 0.95 + 0.06); dMat.size = 0.26 + ex.storm * 0.5;
  };
  ex.setCrawler(0, 'park', 0, 0);
  return finishOut(B, { kind: 'dune', mainExit: mainExitAt(P.route[1].x, P.route[1].z, terrain.heightAt(P.route[1].x, P.route[1].z)), ex, update, dispose: () => { ex.cwCollider = null; } });
}

// ------------------------------------------------------------------------------------------------ ROOF
const AD_TEXT = ['ALGORITHM+', 'STREAM NOW', 'CLICK. LIKE. OBEY.', 'YOUR FEED AWAITS'];
/** one 256x128 (power-of-two) canvas texture per ad style, drawn once; the caller caches it per map and disposes it with the map */
function adTexture(i) {
  try {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d'); if (!g) return null;
    const hue = [340, 40, 190, 280][i % 4];
    g.fillStyle = `hsl(${hue},85%,52%)`; g.fillRect(0, 0, 256, 128);
    g.fillStyle = 'rgba(0,0,0,.28)'; for (let y = 0; y < 128; y += 6) g.fillRect(0, y, 256, 2);
    g.fillStyle = '#fff'; g.font = 'bold 30px monospace'; g.textAlign = 'center'; g.fillText(AD_TEXT[i % 4], 128, 72);
    g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(6, 6, 244, 116);
    const tex = new THREE.CanvasTexture(c); tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; return tex;
  } catch { return null; }
}
export function buildRoof(seed, moon, { physics, lightPool, biome }) {
  const P = K.planRoof(seed);
  const plan = { entrance: { x: P.entrance.x, z: P.entrance.z }, fires: [], ponds: [], lakes: [], flats: [], biome, scale: 0.8, hf: () => K.SHIP_Y, top: (x, z) => K.roofAt(P, x, z) };
  const B = makeBase({ seed, moon, physics, lightPool, plan, kind: 'roof', TerrainCls: ExTerrain });
  const { env, terrain, emitters } = B;
  const k = new Kit(env, 0, 0, 0, 0), R = new RNG((seed ^ 0x40017) >>> 0);
  const CB = [0x454b5e, 0x4a4660, 0x3f4f62, 0x504658];   // [expedfix2] lighter roof slabs so the surfaces read at night
  // buildings + parapets with gaps at the stair tops / plank ends
  for (const b of P.b) {
    boxOf(k, { x0: b.x0, x1: b.x1, y0: K.SHIP_Y - 0.4, y1: b.y, z0: b.z0, z1: b.z1 }, CB[b.k % 4], { data: { kind: 'wall' } });
    const gaps = { n: [], s: [], w: [], e: [] };   // per side: [a, b] along x for n/s (z0 / z1), along z for w/e (x0 / x1)
    for (const st of P.stairs) if (st.k === b.k) { const T = st.top; if (st.dir === 'x+') gaps[b.gz < 0 ? 's' : 'n'].push([T.x - 1.4, T.x + 1.4]); else gaps[b.gx < 0 ? 'e' : 'w'].push([T.z - 1.4, T.z + 1.4]); }
    for (const e of P.edges) if (e.plank && (e.a === b.k || e.b === b.k)) { const side = e.axis === 'x' ? ((e.a === b.k ? e.sg : -e.sg) > 0 ? 'e' : 'w') : ((e.a === b.k ? e.sg : -e.sg) > 0 ? 's' : 'n'); gaps[side].push([e.lat - 1.5, e.lat + 1.5]); }
    const par = (x0, x1, z0, z1) => boxOf(k, { x0, x1, y0: b.y, y1: b.y + K.ROOFC.parapet, z0, z1 }, 0x3a3f4a, { data: { kind: 'prop', id: 'ex_parapet' } });
    for (const [a0, a1] of K.segs(b.x0, b.x1, gaps.n.slice().sort((p, q) => p[0] - q[0]))) par(a0, a1, b.z0, b.z0 + 0.5);
    for (const [a0, a1] of K.segs(b.x0, b.x1, gaps.s.slice().sort((p, q) => p[0] - q[0]))) par(a0, a1, b.z1 - 0.5, b.z1);
    for (const [a0, a1] of K.segs(b.z0, b.z1, gaps.w.slice().sort((p, q) => p[0] - q[0]))) par(b.x0, b.x0 + 0.5, a0, a1);
    for (const [a0, a1] of K.segs(b.z0, b.z1, gaps.e.slice().sort((p, q) => p[0] - q[0]))) par(b.x1 - 0.5, b.x1, a0, a1);
    // a dim violet edge line along the roof rim: the blackout city still reads as walkable roofs from the plaza and from the next roof over
    { const ey = b.y + K.ROOFC.parapet + 0.02, w = b.x1 - b.x0, d = b.z1 - b.z0;
      for (const [cx, cz, sx, sz] of [[(b.x0 + b.x1) / 2, b.z0 + 0.25, w, 0.1], [(b.x0 + b.x1) / 2, b.z1 - 0.25, w, 0.1], [b.x0 + 0.25, (b.z0 + b.z1) / 2, 0.1, d], [b.x1 - 0.25, (b.z0 + b.z1) / 2, 0.1, d]]) k.box(cx, ey, cz, sx, 0.05, sz, 0x4a52c8, { glow: true }); }
    // [expedfix2] rooftop practicals: an access door with a warm lamp, wet puddles that catch the sky
    { const dz = b.gz < 0 ? b.z1 - 0.62 : b.z0 + 0.62;
      k.box(b.cx + R.float(-5, 5), b.y, dz, 1.6, 2.2, 0.2, 0x1c2028); k.box(b.cx + 0.0, b.y + 2.35, dz, 0.5, 0.2, 0.2, 0xffb45a, { glow: true });
      for (let j = 0; j < 2; j++) k.box(b.cx + R.float(-b.w / 3, b.w / 3), b.y + 0.03, b.cz + R.float(-b.w / 3, b.w / 3), R.float(2.5, 4.5), 0.03, R.float(1.6, 3), 0x3c4a86, { glow: true }); }
    // window strips on the four faces (glow), about a third lit
    for (let row = 0; row < 3; row++) {
      const yy = K.SHIP_Y + 1.6 + row * (b.h - 3) / 3;
      for (const [fx, fz, sx, sz] of [[b.cx, b.z0 - 0.03, b.w - 6, 0.06], [b.cx, b.z1 + 0.03, b.w - 6, 0.06], [b.x0 - 0.03, b.cz, 0.06, b.w - 6], [b.x1 + 0.03, b.cz, 0.06, b.w - 6]]) {
        if (!R.chance(0.42)) continue;
        k.box(fx, yy, fz, sx * R.float(0.4, 0.9), 0.5, sz * 1, R.pick([0xffc070, 0x7fd8ff, 0xffe9b0]) , { glow: true, ry: 0 });
      }
    }
  }
  // stairs (visual steps + ramp collider), planks, zip-line poles + cables
  for (const st of P.stairs) { const sp = planStairs({ x: st.x, z: st.z, y: st.y, dir: st.dir, width: st.width, rise: st.rise, run: st.run }); const er = checkStairs(sp); if (er.length) console.warn('[roof] stairs', er); stairsInto(k, B, sp, 0x4c5058); }
  for (const p of P.planks) boxOf(k, p, 0x6a5238, { data: { kind: 'prop', id: 'ex_plank' } });
  const cables = [];
  for (const zp of P.zips) {
    for (const pole of [zp.a, zp.b]) { k.box(pole.x, pole.y, pole.z, 0.36, K.ROOFC.pole, 0.36, 0x555b63, { solid: true, data: { kind: 'prop', id: 'ex_pole' } }); k.box(pole.x, pole.y + K.ROOFC.pole, pole.z, 0.6, 0.16, 0.6, 0x40e8ff, { glow: true }); }
    const pts = []; for (let i = 0; i <= 8; i++) { const s = i / 8, q = K.zipPoint(zp, 'a', s); pts.push(new V3(q.x, q.y + K.ZIP.hang, q.z)); }
    cables.push(cableGeo(pts));
  }
  if (cables.length) { const cg = mergeGeometries(cables, false), cm = new THREE.MeshBasicMaterial({ color: 0x40e8ff, fog: true }), cm2 = new THREE.Mesh(cg, cm); env.add(cm2); env.own(cg); env.mat(cm); for (const g of cables) g.dispose(); }
  // rooftop clutter
  const PC = { ac: 0x6b7078, tank: 0x5a4a3a, crate: 0x5d4a34, skylight: 0x30586a, mast: 0x3a3f45, duct: 0x555b63 };
  for (const p of P.props) {
    if (p.id === 'tank') { k.cyl(p.x, p.y + 1.0, p.z, 1.2, p.sy - 1.0, PC.tank, { seg: 10 }); for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) k.box(p.x + dx, p.y, p.z + dz, 0.2, 1.0, 0.2, 0x333333); B.addBox(p.x, p.y + p.sy / 2, p.z, p.sx, p.sy, p.sz, 0, { kind: 'prop', id: 'ex_tank' }); continue; }
    k.box(p.x, p.y, p.z, p.sx, p.sy, p.sz, PC[p.id] || 0x555555, { solid: true, data: { kind: 'prop', id: 'ex_' + p.id } });
    if (p.id === 'skylight') k.box(p.x, p.y + p.sy, p.z, p.sx - 0.4, 0.05, p.sz - 0.4, 0x7fd8ff, { glow: true });
    if (p.id === 'mast') k.box(p.x, p.y + p.sy, p.z, 0.3, 0.3, 0.3, 0xff3a24, { glow: true });
    if (p.id === 'ac') { k.box(p.x, p.y + p.sy - 0.05, p.z + p.sz / 2 + 0.02, p.sx * 0.5, 0.12, 0.05, 0x40e8ff, { glow: true }); for (let j = 0; j < 3; j++) k.box(p.x - p.sx * 0.35 + j * 0.3, p.y + p.sy * 0.5, p.z + p.sz / 2 + 0.03, 0.14, 0.14, 0.05, [0x40ff70, 0xffb020, 0xff3a24][j], { glow: true }); }
  }
  // generator (charging station) + billboards (dynamic panels) + kiosks
  const g0 = P.gen; k.box(g0.x, g0.y + 1.5, g0.z, 1.4, 0.16, 0.5, 0xffd060, { glow: true }); k.box(g0.x - 1.2, g0.y + 1.6, g0.z - 0.72, 0.16, 0.16, 0.06, 0x40ff70, { glow: true });
  k.finish();
  const boards = [], panelGeo = new THREE.BoxGeometry(1, 1, 1), ledGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22), adTex = new Map();
  for (const q of P.bbs) {
    if (!adTex.has(q.i % 4)) adTex.set(q.i % 4, adTexture(q.i));
    const tex = adTex.get(q.i % 4), on = new THREE.MeshBasicMaterial(tex ? { map: tex, fog: true } : { color: new THREE.Color().setHSL(q.hue, 0.85, 0.55), fog: true }), off = new THREE.MeshBasicMaterial({ color: 0x14161c, fog: true });
    const mesh = new THREE.Mesh(panelGeo, off);
    const fw = q.out.x ? new V3(q.out.x, 0, 0) : new V3(0, 0, q.out.z);
    mesh.scale.set(q.out.x ? 0.5 : 11.6, 5.6, q.out.x ? 11.6 : 0.5); mesh.position.set(q.x + fw.x * 0.06, q.y + 5.5, q.z + fw.z * 0.06);
    env.add(mesh); env.mat(on); env.mat(off);
    const em = { pos: new V3(q.x + fw.x * 4, q.y + 6, q.z + fw.z * 4), color: new THREE.Color().setHSL(q.hue, 0.9, 0.6).getHex(), intensity: 0, distance: 30, group: 'outdoor' }; emitters.push(em);
    const led = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ color: 0xff3a24 })); led.position.set(q.kiosk.x, q.y + 1.4, q.kiosk.z); env.add(led); env.mat(led.material);
    boards.push({ q, mesh, on, off, em, led });
  }
  env.own(panelGeo); env.own(ledGeo);
  // plaza lamps + skyline (dark towers beyond the walls, a few lit windows)
  const sk = new Kit(env, 0, 0, 0, 0);   // one kit (2 meshes) for the plaza lamps + the skyline
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.5, x = Math.cos(a) * 21, z = Math.sin(a) * 21; sk.box(x, K.SHIP_Y, z, 0.3, 4.4, 0.3, 0x30353b, { solid: true, data: { kind: 'prop', id: 'ex_lamp' } }); sk.box(x, K.SHIP_Y + 4.4, z, 0.9, 0.2, 0.9, 0xffa040, { glow: true }); }
  emitters.push({ pos: new V3(0, K.SHIP_Y + 4.5, 21), color: 0xffa040, intensity: 0.9, distance: 26, group: 'outdoor' }, { pos: new V3(0, K.SHIP_Y + 4.5, -21), color: 0xffa040, intensity: 0.9, distance: 26, group: 'outdoor' });
  {
    const half = terrain.half - 8;
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2, x = Math.max(-half, Math.min(half, Math.cos(a) * 140)), z = Math.max(-half, Math.min(half, Math.sin(a) * 140)), h = R.float(24, 52), w = R.float(12, 20);
      if (Math.abs(x) < terrain.playHalf + 6 && Math.abs(z) < terrain.playHalf + 6) continue;
      sk.box(x, K.SHIP_Y - 0.5, z, w, h, w, 0x1c1f2c); sk.box(x, K.SHIP_Y + 1, z, w + 0.2, 4, w + 0.2, i % 2 ? 0x5a2f6a : 0x6a4a2a, { glow: true });   // [expedfix2] faint city glow at the tower feet lights the fog
      for (let r = 0; r < 4; r++) if (R.chance(0.6)) sk.box(x, K.SHIP_Y + 4 + r * (h - 8) / 4, z + w / 2 + 0.03, w * 0.5, 0.6, 0.05, R.pick([0xffc070, 0x7fd8ff]), { glow: true });
    }
    sk.finish();
  }
  let t = 0;
  const ex = { kind: 'roof', plan: P, boards, gen: g0 };
  ex.setBoard = (i, lit) => { const b = boards[i]; if (!b) return; b.mesh.material = lit ? b.on : b.off; b.em.intensity = lit ? 1.7 : 0; b.led.material.color.setHex(lit ? 0x40ff70 : 0xff3a24); };
  const update = (dt) => { t += dt; for (const b of boards) if (b.mesh.material === b.off) b.led.visible = Math.sin(t * 3 + b.q.i) > -0.2; else b.led.visible = true; };
  return finishOut(B, { kind: 'roof', mainExit: mainExitAt(P.gen.x, P.gen.z, P.gen.y), ex, update, dispose: () => { for (const tx of adTex.values()) tx?.dispose(); adTex.clear(); } });
}

export function buildExpeditionMap(kind, seed, moon, ctx) {
  const c = { ...ctx, biome: ctx.biome };
  if (kind === 'barge') return buildBarge(seed, moon, c);
  if (kind === 'dune') return buildDune(seed, moon, c);
  return buildRoof(seed, moon, c);
}
