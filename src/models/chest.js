// Procedural PSX treasure chests (wave 1, worldx): wood / iron / gold / void.
// One merged, vertex-coloured body mesh + one lid mesh (hinged at the back edge) + an optional light beam per chest.
// Geometry and materials are cached and shared by every chest of a tier; only the beam material is cloned (its
// opacity animates per chest), see disposeChestModel().
//
//   CHEST_TIERS[id]         look + gameplay numbers (lock difficulty, item count, colours)
//   createChestModel(tier)  -> { root, lid, beam, tier, size:[w,h,d], top }   root origin = bottom centre, front = +Z
//   setChestOpen(model, t)  t 0..1 (0 = shut, 1 = wide open); lid rotates about the hinge
//   disposeChestModel(m)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getTexture, makeCanvasTexture } from '../render/textures.js';

export const CHEST = { W: 1.12, BODY: 0.46, LID: 0.2, D: 0.74 };
export const CHEST_HEIGHT = CHEST.BODY + CHEST.LID;

// lock: 0 = never locked. difficulty feeds the lockpick minigame (0..1). items: [min, max] drops.
export const CHEST_TIERS = {
  wood: { id: 'wood', name: 'Wooden Chest', color: '#c08a4a', hex: 0xc08a4a, glow: 0xffb060, lock: 0, difficulty: 0, items: [2, 3], beam: 0.0, light: 0.0, tex: 'wood_planks', xp: 25 },
  iron: { id: 'iron', name: 'Iron Chest', color: '#8fb0d8', hex: 0x8fb0d8, glow: 0x7fc4ff, lock: 1, difficulty: 0.45, items: [3, 4], beam: 0.55, light: 0.7, tex: 'metal_plate', xp: 55 },
  gold: { id: 'gold', name: 'Gold Chest', color: '#ffc830', hex: 0xffc830, glow: 0xffc830, lock: 1, difficulty: 0.62, items: [4, 5], beam: 0.85, light: 1.1, tex: 'wood_dark', xp: 100 },
  void: { id: 'void', name: 'Void Chest', color: '#b45cff', hex: 0xb45cff, glow: 0xb45cff, lock: 1, difficulty: 0.8, items: [5, 6], beam: 1.0, light: 1.4, tex: 'metal_dark', xp: 180 },
};
export const CHEST_TIER_IDS = Object.keys(CHEST_TIERS);

const PALETTE = {
  wood: { body: 0x9a6a3a, trim: 0x3a3632, lock: 0xc8a040, gem: 0xc8a040, dark: 0x5a3a1c, emissive: 0x000000 },
  iron: { body: 0x7a8494, trim: 0x2c323c, lock: 0xd0d8e0, gem: 0x7fc4ff, dark: 0x4a5260, emissive: 0x0a1a2a },
  gold: { body: 0x4a2a1e, trim: 0xf2c030, lock: 0xffd84a, gem: 0xff4040, dark: 0x2a1610, emissive: 0x2a1c04 },
  void: { body: 0x1a1024, trim: 0x6a2ab8, lock: 0xb45cff, gem: 0xe6b0ff, dark: 0x0a0612, emissive: 0x24083c },
};

const _cache = { geo: new Map(), mat: new Map() };
let _beamGeo = null, _beamTex = null;

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

function part(geo, color, pos, rot = [0, 0, 0], scale = null) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
  _m4.compose(_p.set(pos[0], pos[1], pos[2]), _q, scale ? _s.set(scale[0], scale[1], scale[2]) : _s.set(1, 1, 1));
  g.applyMatrix4(_m4);
  // box-projected world-scale UVs (one texture repeat per 0.6 m)
  const P = g.attributes.position, N = g.attributes.normal;
  const uv = new Float32Array(P.count * 2), col = new Float32Array(P.count * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / 0.6; uv[i * 2 + 1] = v / 0.6;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function bodyGeo(tier) {
  const P = PALETTE[tier], W = CHEST.W, H = CHEST.BODY, D = CHEST.D;
  const L = [];
  L.push(part(box(W, H, D), P.body, [0, H / 2, 0]));
  // corner posts + horizontal bands
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.push(part(box(0.09, H + 0.02, 0.09), P.trim, [sx * (W / 2 - 0.035), H / 2, sz * (D / 2 - 0.035)]));
  for (const sx of [-1, 1]) L.push(part(box(0.08, H + 0.01, D + 0.03), P.trim, [sx * 0.3, H / 2, 0]));
  L.push(part(box(W + 0.03, 0.07, D + 0.03), P.trim, [0, 0.03, 0]));
  // lock plate + keyhole
  L.push(part(box(0.2, 0.2, 0.05), P.lock, [0, H - 0.09, D / 2 + 0.02]));
  L.push(part(box(0.05, 0.08, 0.06), P.dark, [0, H - 0.1, D / 2 + 0.03]));
  if (tier === 'iron') for (const sx of [-1, 1]) for (const sy of [0.1, 0.34]) L.push(part(box(0.05, 0.05, 0.03), P.lock, [sx * 0.46, sy, D / 2 + 0.02]));
  if (tier === 'gold') {
    L.push(part(box(0.32, 0.04, D + 0.04), P.trim, [0, H - 0.02, 0]));
    for (const sx of [-1, 1]) L.push(part(new THREE.OctahedronGeometry(0.06, 0), P.gem, [sx * 0.42, H - 0.14, D / 2 + 0.03], [0, 0.6, 0]));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.push(part(box(0.11, 0.11, 0.11), P.trim, [sx * (W / 2 - 0.02), 0.06, sz * (D / 2 - 0.02)]));
  }
  if (tier === 'void') {
    // floating runes + a jagged crown of shards around the base
    for (const sx of [-1, 1]) L.push(part(new THREE.OctahedronGeometry(0.09, 0), P.gem, [sx * 0.6, H + 0.2, 0.05], [0.3, 0.6, 0.2], [0.7, 1.5, 0.7]));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      L.push(part(new THREE.ConeGeometry(0.06, 0.28, 4), P.trim, [Math.cos(a) * (W / 2 + 0.05), 0.12, Math.sin(a) * (D / 2 + 0.06)], [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3]));
    }
    L.push(part(box(0.5, 0.05, 0.05), P.gem, [0, H * 0.55, D / 2 + 0.03]));
  }
  const g = mergeGeometries(L, false);
  L.forEach((x) => x.dispose());
  g.computeBoundingSphere();
  return g;
}

// lid: local origin at the hinge (back edge, top of the body); dome spans z 0..D
function lidGeo(tier) {
  const P = PALETTE[tier], W = CHEST.W, D = CHEST.D, R = D / 2, LID = CHEST.LID;
  const L = [];
  const dome = new THREE.CylinderGeometry(R, R, W, 8, 1, false, 0, Math.PI);   // half cylinder (bulges towards +X, axis Y)
  dome.rotateZ(Math.PI / 2);                                                    // axis along X, dome facing +Y
  dome.scale(1, LID / R, 1);
  L.push(part(dome, P.body, [0, 0, R]));
  L.push(part(box(W + 0.03, 0.05, D + 0.03), P.trim, [0, 0.025, R]));
  for (const sx of [-1, 1]) L.push(part(box(0.08, LID + 0.02, D + 0.03), P.trim, [sx * 0.3, LID / 2, R], [0, 0, 0], [1, 0.9, 1]));
  L.push(part(box(0.16, 0.06, 0.06), P.lock, [0, 0.03, D + 0.02]));
  if (tier === 'gold') L.push(part(new THREE.OctahedronGeometry(0.075, 0), P.gem, [0, LID + 0.03, R], [0, 0.4, 0], [1, 1.3, 1]));
  if (tier === 'void') L.push(part(new THREE.OctahedronGeometry(0.11, 0), P.gem, [0, LID + 0.09, R], [0.2, 0.4, 0], [1, 1.8, 1]));
  const g = mergeGeometries(L, false);
  L.forEach((x) => x.dispose());
  g.computeBoundingSphere();
  return g;
}

function tierMaterial(tier) {
  let m = _cache.mat.get(tier);
  if (m) return m;
  const P = PALETTE[tier];
  m = new THREE.MeshLambertMaterial({ map: getTexture(CHEST_TIERS[tier].tex), vertexColors: true, emissive: new THREE.Color(P.emissive), flatShading: true });
  m.name = 'chest:' + tier;
  _cache.mat.set(tier, m);
  return m;
}

function beamAssets() {
  if (_beamGeo) return;
  _beamGeo = new THREE.CylinderGeometry(0.1, 0.42, 1, 10, 1, true).translate(0, 0.5, 0);
  _beamTex = makeCanvasTexture(4, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.25, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  if (_beamTex) { _beamTex.magFilter = THREE.LinearFilter; _beamTex.minFilter = THREE.LinearFilter; }
}

export function createChestModel(tier = 'wood', { beamHeight = 15 } = {}) {
  if (!CHEST_TIERS[tier]) tier = 'wood';
  const T = CHEST_TIERS[tier];
  let bg = _cache.geo.get('b:' + tier), lg = _cache.geo.get('l:' + tier);
  if (!bg) { bg = bodyGeo(tier); _cache.geo.set('b:' + tier, bg); }
  if (!lg) { lg = lidGeo(tier); _cache.geo.set('l:' + tier, lg); }
  const mat = tierMaterial(tier);
  const root = new THREE.Group();
  root.name = 'chest-' + tier;
  // a closed chest is ONE merged mesh (1 draw call); body + lid are only shown while / after it opens
  let cg = _cache.geo.get('c:' + tier);
  if (!cg) {
    const lidAt = lg.clone().translate(0, CHEST.BODY, -CHEST.D / 2);
    cg = mergeGeometries([bg.clone(), lidAt], false);
    lidAt.dispose();
    cg.computeBoundingSphere();
    _cache.geo.set('c:' + tier, cg);
  }
  const closed = new THREE.Mesh(cg, mat);
  root.add(closed);
  const body = new THREE.Mesh(bg, mat);
  body.visible = false;
  root.add(body);
  const lid = new THREE.Group();
  lid.position.set(0, CHEST.BODY, -CHEST.D / 2);
  lid.add(new THREE.Mesh(lg, mat));
  lid.visible = false;
  root.add(lid);
  let beam = null;
  if (T.beam > 0) {
    beamAssets();
    const bm = new THREE.MeshBasicMaterial({ map: _beamTex, color: T.glow, transparent: true, opacity: 0.4 * T.beam, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
    beam = new THREE.Mesh(_beamGeo, bm);
    beam.scale.set(1, beamHeight * (0.5 + 0.5 * T.beam), 1);
    beam.position.y = CHEST_HEIGHT;
    beam.frustumCulled = false;
    beam.renderOrder = 3;
    beam.userData.baseOpacity = bm.opacity;
    root.add(beam);
  }
  return { root, body, lid, closed, beam, tier, size: [CHEST.W, CHEST_HEIGHT, CHEST.D], top: CHEST_HEIGHT, open: 0 };
}

/** t: 0 shut .. 1 wide open (overshoots a little for a springy pop). */
export function setChestOpen(m, t) {
  m.open = t;
  const o = t > 0.001;
  m.closed.visible = !o; m.body.visible = o; m.lid.visible = o;
  m.lid.rotation.x = -1.85 * t;
}

export function disposeChestModel(m) {
  if (!m) return;
  m.root.removeFromParent();
  if (m.beam) m.beam.material.dispose();
}
