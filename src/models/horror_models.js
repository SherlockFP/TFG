// HORROR module - procedural models: Shambler (zombie), The Forger, Closet Thing (ambusher), Manor Warden + items (chalk, crest, herb).
// Creature model contract (entities/creatures.js CreatureView): { root, parts, height, radius, update(dt, {state, speed, t, time, progress}),
// setElite, setHitFlash, setTint, dispose }. Origin at the feet, facing +Z, metres, per-instance materials (hit flash never leaks).
import * as THREE from 'three';

const PI = Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

function kit() {
  const mats = new Map(), geos = [];
  const mat = (c, o = {}) => {
    const key = c + '|' + (o.basic ? 'b' : 'l') + (o.add ? 'a' : '') + (o.op ?? '') + (o.em ?? '');
    let m = mats.get(key);
    if (!m) {
      m = o.basic ? new THREE.MeshBasicMaterial({ color: c, transparent: o.op != null, opacity: o.op ?? 1, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !o.add })
        : new THREE.MeshLambertMaterial({ color: c, flatShading: true, emissive: o.em ?? 0x000000 });
      m.userData.instance = true;
      mats.set(key, m);
    }
    return m;
  };
  const geo = (g) => { geos.push(g); return g; };
  const box = (parent, c, sx, sy, sz, x = 0, y = 0, z = 0, o = {}) => {
    const m = new THREE.Mesh(geo(new THREE.BoxGeometry(sx, sy, sz)), mat(c, o));
    m.position.set(x, y, z); if (o.rx || o.ry || o.rz) m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
    parent.add(m); return m;
  };
  const cyl = (parent, c, rt, rb, h, x, y, z, o = {}) => {
    const m = new THREE.Mesh(geo(new THREE.CylinderGeometry(rt, rb, h, o.seg || 7)), mat(c, o));
    m.position.set(x, y, z); if (o.rx || o.ry || o.rz) m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
    parent.add(m); return m;
  };
  const sph = (parent, c, r, x, y, z, o = {}) => {
    const m = new THREE.Mesh(geo(new THREE.SphereGeometry(r, o.w || 7, o.h || 5)), mat(c, o));
    m.position.set(x, y, z); if (o.sx || o.sy || o.sz) m.scale.set(o.sx || 1, o.sy || 1, o.sz || 1);
    parent.add(m); return m;
  };
  const pivot = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const flash = (v) => { for (const m of mats.values()) if (m.emissive) m.emissive.setRGB(v * 0.9, v * 0.25, v * 0.2); };
  const dispose = () => { for (const g of geos) g.dispose(); for (const m of mats.values()) m.dispose(); };
  return { mat, box, cyl, sph, pivot, flash, dispose };
}
function finish(K, root, extra) {
  return { root, parts: {}, height: 1.8, radius: 0.42, setElite() {}, setTint() {}, setHitFlash: K.flash, dispose: K.dispose, ...extra };
}
function fall(root, dt, t, sideways = false) {
  const k = clamp(t / 0.55, 0, 1);
  if (sideways) root.rotation.z = damp(root.rotation.z, k * 1.5, 9, dt); else root.rotation.x = damp(root.rotation.x, -k * 1.45, 9, dt);
  root.position.y = -0.05 * k;
}

// ================================================================================================ Shambler
export function createShamblerModel(o = {}) {
  const K = kit(), root = new THREE.Group();
  const seed = o.seed || 1;
  const skinC = [0x8f9c7c, 0x9aa48a, 0x86917a, 0xa3a08a][seed % 4];
  const clothC = [0x5a4a3a, 0x3d4a5c, 0x6a3a3a, 0x4a5a48][(seed >> 2) % 4];
  const skin = K.mat(skinC), cloth = K.mat(clothC), dark = K.mat(0x2a1c18), blood = K.mat(0x6a1414), eye = K.mat(0xd8d6a0, { basic: true });
  const body = K.pivot(root, 0, 0.9, 0);
  const torso = K.box(body, clothC, 0.5, 0.62, 0.28, 0, 0.3, 0);
  K.box(body, 0x6a1414, 0.22, 0.2, 0.02, 0.1, 0.32, 0.15);   // chest stain
  const hipY = 0;
  const head = K.pivot(body, 0.02, 0.72, 0.04);
  K.box(head, skinC, 0.26, 0.28, 0.26, 0, 0.14, 0);
  K.box(head, 0x2a1c18, 0.27, 0.07, 0.27, 0, 0.27, -0.01);   // thin hair
  K.box(head, 0x1a0808, 0.14, 0.05, 0.02, 0, 0.06, 0.135);   // open mouth
  K.box(head, 0xd8d6a0, 0.045, 0.03, 0.02, -0.06, 0.16, 0.135, { basic: true });
  K.box(head, 0xd8d6a0, 0.045, 0.03, 0.02, 0.06, 0.16, 0.135, { basic: true });
  const armL = K.pivot(body, -0.33, 0.55, 0), armR = K.pivot(body, 0.33, 0.55, 0);
  for (const a of [armL, armR]) { K.box(a, skinC, 0.12, 0.34, 0.12, 0, -0.17, 0); K.box(a, clothC, 0.13, 0.16, 0.13, 0, -0.08, 0); K.box(a, skinC, 0.11, 0.3, 0.11, 0, -0.42, 0.02); }
  const legL = K.pivot(root, -0.13, 0.9, 0), legR = K.pivot(root, 0.13, 0.9, 0);
  for (const l of [legL, legR]) { K.box(l, 0x3a3630, 0.16, 0.86, 0.17, 0, -0.43, 0); K.box(l, 0x1a1512, 0.17, 0.09, 0.24, 0, -0.85, 0.03); }
  void dark; void blood; void eye; void cloth; void skin; void hipY; void torso;
  let ph = seed * 1.7;
  const H = 1.8;
  return finish(K, root, {
    parts: { head, armL, armR }, height: H, radius: 0.42,
    update(dt, a) {
      const st = a.state, t = a.t || 0;
      ph += dt * (st === 'run' ? 3.6 : st === 'walk' ? 2.2 : 1.2);
      if (st === 'dead') { fall(root, dt, t); return; }
      root.rotation.x = damp(root.rotation.x, 0, 8, dt); root.position.y = damp(root.position.y, 0, 8, dt);
      const moving = st === 'walk' || st === 'run';
      const sw = moving ? Math.sin(ph * 2) : 0;
      legL.rotation.x = sw * 0.5; legR.rotation.x = -sw * 0.5;
      body.rotation.z = Math.sin(ph) * (moving ? 0.1 : 0.05);
      body.rotation.x = damp(body.rotation.x, st === 'attack' || st === 'grab' ? 0.35 : moving ? 0.16 : 0.08, 6, dt);
      head.rotation.z = Math.sin(ph * 0.7) * 0.16; head.rotation.x = 0.12 + Math.sin(ph * 0.4) * 0.06;
      const reach = st === 'attack' || st === 'grab' ? -1.5 + Math.sin(t * 14) * 0.15 : moving ? -1.25 : -0.25;
      armL.rotation.x = damp(armL.rotation.x, reach + Math.sin(ph) * 0.1, 10, dt);
      armR.rotation.x = damp(armR.rotation.x, reach - Math.sin(ph) * 0.1 + (moving ? 0.15 : 0), 10, dt);
      if (st === 'stunned') { body.rotation.x = -0.25; head.rotation.z = Math.sin(t * 20) * 0.3; }
    },
  });
}

// ================================================================================================ The Forger
export function createForgerModel(o = {}) {
  const K = kit(), root = new THREE.Group();
  const seed = o.seed || 1; void seed;
  const skin = 0xd9d6cc, robe = 0x2b2c34;
  const body = K.pivot(root, 0, 0.95, 0);
  K.box(body, robe, 0.36, 0.78, 0.22, 0, 0.35, 0);
  K.box(body, 0x1a1a20, 0.42, 0.5, 0.26, 0, 0.0, 0);   // long coat skirt
  const head = K.pivot(body, 0, 0.82, 0.02);
  K.box(head, skin, 0.22, 0.3, 0.22, 0, 0.15, 0);
  K.box(head, robe, 0.28, 0.2, 0.28, 0, 0.3, -0.02);   // hood
  K.box(head, 0x0a0a0a, 0.16, 0.16, 0.02, 0, 0.16, 0.115);
  K.box(head, 0xfff4c8, 0.03, 0.03, 0.02, -0.04, 0.18, 0.126, { basic: true });
  K.box(head, 0xfff4c8, 0.03, 0.03, 0.02, 0.04, 0.18, 0.126, { basic: true });
  const armL = K.pivot(body, -0.24, 0.65, 0), armR = K.pivot(body, 0.24, 0.65, 0);
  for (const a of [armL, armR]) { K.box(a, robe, 0.1, 0.55, 0.1, 0, -0.27, 0); K.box(a, skin, 0.07, 0.4, 0.07, 0, -0.72, 0); K.box(a, 0xffffff, 0.09, 0.09, 0.09, 0, -0.95, 0, { basic: true }); }   // chalk-white hands
  const legL = K.pivot(root, -0.1, 0.95, 0), legR = K.pivot(root, 0.1, 0.95, 0);
  for (const l of [legL, legR]) K.box(l, 0x15151a, 0.12, 0.92, 0.12, 0, -0.46, 0);
  let ph = 0;
  return finish(K, root, {
    parts: { head, armL, armR }, height: 1.95, radius: 0.4,
    update(dt, a) {
      const st = a.state, t = a.t || 0;
      ph += dt * (st === 'run' || st === 'flee' ? 7 : st === 'walk' ? 4 : 1.5);
      if (st === 'dead') { fall(root, dt, t, true); return; }
      root.rotation.z = damp(root.rotation.z, 0, 8, dt); root.position.y = damp(root.position.y, 0, 8, dt);
      const moving = st === 'walk' || st === 'run' || st === 'flee';
      legL.rotation.x = moving ? Math.sin(ph * 2) * 0.6 : 0; legR.rotation.x = moving ? -Math.sin(ph * 2) * 0.6 : 0;
      const scratch = st === 'scratch';
      body.rotation.x = damp(body.rotation.x, scratch ? 0.85 : moving ? 0.12 : 0.02, 6, dt);
      root.position.y = scratch ? -0.32 : 0;
      armR.rotation.x = scratch ? -1.5 + Math.sin(t * 22) * 0.55 : moving ? Math.sin(ph * 2) * 0.5 : -0.1;
      armL.rotation.x = scratch ? -1.2 : moving ? -Math.sin(ph * 2) * 0.5 : -0.1;
      head.rotation.y = scratch ? Math.sin(t * 3) * 0.6 : Math.sin(ph * 0.3) * 0.2;
    },
  });
}

// ================================================================================================ Closet Thing (fake closet ambusher)
export function createAmbusherModel(o = {}) {
  const K = kit(), root = new THREE.Group();
  const seed = o.seed || 1; void seed;
  const wood = 0x3c2a1c, wood2 = 0x2c1f15;
  const body = K.pivot(root, 0, 0.95, 0);
  K.box(body, wood, 0.7, 1.2, 0.42, 0, 0.3, 0);
  for (let i = -1; i <= 1; i++) K.box(body, wood2, 0.02, 1.18, 0.44, i * 0.2, 0.3, 0);   // plank seams
  const head = K.pivot(body, 0, 1.0, 0.05);
  K.box(head, wood2, 0.36, 0.34, 0.3, 0, 0.1, 0);
  const jaw = K.pivot(head, 0, 0.0, 0.14);
  K.box(jaw, 0x120606, 0.24, 0.3, 0.05, 0, 0.1, 0.02);   // vertical maw
  K.box(head, 0xff5a2a, 0.06, 0.04, 0.02, -0.09, 0.22, 0.155, { basic: true });
  K.box(head, 0xff5a2a, 0.06, 0.04, 0.02, 0.09, 0.22, 0.155, { basic: true });
  const armL = K.pivot(body, -0.42, 0.7, 0), armR = K.pivot(body, 0.42, 0.7, 0);
  for (const a of [armL, armR]) { K.box(a, wood, 0.12, 0.9, 0.12, 0, -0.45, 0); K.box(a, wood2, 0.16, 0.34, 0.06, 0, -1.0, 0.03); }
  const legL = K.pivot(root, -0.2, 0.95, 0), legR = K.pivot(root, 0.2, 0.95, 0);
  for (const l of [legL, legR]) K.box(l, wood2, 0.14, 0.95, 0.14, 0, -0.47, 0);
  let ph = 0;
  return finish(K, root, {
    parts: { head, armL, armR, jaw }, height: 2.1, radius: 0.5,
    update(dt, a) {
      const st = a.state, t = a.t || 0;
      ph += dt * (st === 'run' ? 8 : 4);
      if (st === 'dead') { fall(root, dt, t); return; }
      root.rotation.x = damp(root.rotation.x, 0, 8, dt); root.position.y = damp(root.position.y, 0, 8, dt);
      const moving = st === 'run' || st === 'walk';
      legL.rotation.x = moving ? Math.sin(ph * 2) * 0.7 : 0; legR.rotation.x = moving ? -Math.sin(ph * 2) * 0.7 : 0;
      const lunge = st === 'burst' || st === 'attack';
      body.rotation.x = damp(body.rotation.x, lunge ? 0.55 : moving ? 0.25 : 0, 12, dt);
      armL.rotation.x = damp(armL.rotation.x, lunge ? -1.7 : moving ? Math.sin(ph * 2) * 0.6 : -0.1, 14, dt);
      armR.rotation.x = damp(armR.rotation.x, lunge ? -1.7 : moving ? -Math.sin(ph * 2) * 0.6 : -0.1, 14, dt);
      jaw.rotation.x = damp(jaw.rotation.x, lunge ? 0.5 : st === 'stir' ? Math.sin(t * 30) * 0.15 : 0, 12, dt);
      if (st === 'stir') body.rotation.z = Math.sin(t * 26) * 0.05;
      else body.rotation.z = damp(body.rotation.z, 0, 10, dt);
    },
  });
}

// ================================================================================================ Manor Warden (illager-like)
export function createWardenModel(o = {}) {
  const K = kit(), root = new THREE.Group();
  const seed = o.seed || 1; void seed;
  const skin = 0x8a9a86, robe = 0x4a4038, robe2 = 0x2a2420;
  const body = K.pivot(root, 0, 0.9, 0);
  K.box(body, robe, 0.52, 0.86, 0.32, 0, 0.3, 0);
  K.box(body, robe2, 0.56, 0.16, 0.36, 0, 0.62, 0);
  const head = K.pivot(body, 0, 0.85, 0.02);
  K.box(head, skin, 0.3, 0.34, 0.3, 0, 0.15, 0);
  K.box(head, skin, 0.09, 0.16, 0.1, 0, 0.1, 0.19);   // the nose
  K.box(head, 0x1a1a1a, 0.3, 0.05, 0.31, 0, 0.26, 0);   // one long brow
  K.box(head, 0xe8e0c0, 0.05, 0.03, 0.02, -0.07, 0.2, 0.152, { basic: true });
  K.box(head, 0xe8e0c0, 0.05, 0.03, 0.02, 0.07, 0.2, 0.152, { basic: true });
  const armL = K.pivot(body, -0.36, 0.62, 0), armR = K.pivot(body, 0.36, 0.62, 0);
  for (const a of [armL, armR]) { K.box(a, robe, 0.14, 0.6, 0.14, 0, -0.3, 0); K.box(a, skin, 0.1, 0.16, 0.1, 0, -0.66, 0); }
  const axe = K.pivot(armR, 0, -0.66, 0.04);
  K.box(axe, 0x5a3a1e, 0.05, 0.8, 0.05, 0, 0.1, 0.04);
  K.box(axe, 0x9aa0a8, 0.26, 0.2, 0.05, 0.13, 0.42, 0.04);
  const legL = K.pivot(root, -0.14, 0.9, 0), legR = K.pivot(root, 0.14, 0.9, 0);
  for (const l of [legL, legR]) K.box(l, robe2, 0.18, 0.9, 0.2, 0, -0.45, 0);
  let ph = 0;
  return finish(K, root, {
    parts: { head, armL, armR }, height: 1.95, radius: 0.45,
    update(dt, a) {
      const st = a.state, t = a.t || 0;
      ph += dt * (st === 'run' ? 6.5 : 3.6);
      if (st === 'dead') { fall(root, dt, t); return; }
      root.rotation.x = damp(root.rotation.x, 0, 8, dt); root.position.y = damp(root.position.y, 0, 8, dt);
      const moving = st === 'run' || st === 'walk';
      legL.rotation.x = moving ? Math.sin(ph * 2) * 0.55 : 0; legR.rotation.x = moving ? -Math.sin(ph * 2) * 0.55 : 0;
      const swing = st === 'attack';
      armL.rotation.x = damp(armL.rotation.x, swing ? -0.6 : moving ? -0.5 : -0.9, 10, dt);   // idle: arms folded
      armR.rotation.x = damp(armR.rotation.x, swing ? -2.3 + Math.min(1, t * 6) * 2.6 : moving ? -1.1 + Math.sin(ph * 2) * 0.3 : -0.9, swing ? 22 : 10, dt);
      armL.rotation.z = damp(armL.rotation.z, moving || swing ? 0 : 0.5, 8, dt); armR.rotation.z = damp(armR.rotation.z, moving || swing ? 0 : -0.5, 8, dt);
      body.rotation.x = damp(body.rotation.x, moving ? 0.14 : 0, 6, dt);
      head.rotation.y = st === 'idle' ? Math.sin(t * 0.6) * 0.5 : 0;
    },
  });
}

export const HR_CREATURE_MODELS = {
  hr_zombie: createShamblerModel, hr_forger: createForgerModel, hr_ambusher: createAmbusherModel, hr_warden: createWardenModel,
};

// ================================================================================================ items
function itemKit() {
  const g = new THREE.Group();
  const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, emissive: o.em ?? 0 });
  const bas = (c) => new THREE.MeshBasicMaterial({ color: c });
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  return { g, lam, bas, add };
}
export function createChalkModel() {
  const { g, lam, add } = itemKit();
  add(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 8), lam(0xf4f0e2, { em: 0x333330 }), 0, 0.05, 0, 0, 0, PI / 2 - 0.35);
  add(new THREE.CylinderGeometry(0.0145, 0.0145, 0.04, 8), lam(0xe8c34a), 0.03, 0.02, 0, 0, 0, PI / 2 - 0.35);
  return g;
}
export function createCrestModel() {
  const { g, lam, add } = itemKit();
  add(new THREE.CylinderGeometry(0.07, 0.07, 0.014, 14), lam(0xb08a3a, { em: 0x221808 }), 0, 0.03, 0, PI / 2, 0, 0);
  add(new THREE.CylinderGeometry(0.052, 0.052, 0.018, 14), lam(0x6a1a1a), 0, 0.03, 0.002, PI / 2, 0, 0);
  add(new THREE.BoxGeometry(0.018, 0.075, 0.02), lam(0xd8c070), 0, 0.03, 0.006);
  add(new THREE.BoxGeometry(0.075, 0.018, 0.02), lam(0xd8c070), 0, 0.03, 0.006);
  return g;
}
export function createHerbModel() {
  const { g, lam, add } = itemKit();
  const leaf = new THREE.BoxGeometry(0.05, 0.005, 0.11);
  for (let i = 0; i < 5; i++) { const m = add(leaf, lam(i % 2 ? 0x3aa84a : 0x4fc05a, { em: 0x0a2a0e }), Math.sin(i * 1.26) * 0.03, 0.03 + i * 0.006, Math.cos(i * 1.26) * 0.03, -0.5, i * 1.26, 0); m.position.y += 0.02; }
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 5), lam(0x2a6a30), 0, 0.02, 0);
  return g;
}
export function createTicketModel() {
  const { g, lam, add } = itemKit();
  add(new THREE.BoxGeometry(0.11, 0.004, 0.16), lam(0xe8e0c8), 0, 0.02, 0);
  add(new THREE.BoxGeometry(0.07, 0.005, 0.01), lam(0x2a2a2a), 0, 0.023, -0.03);
  return g;
}
export const HR_ITEM_MODELS = { hr_chalk: createChalkModel, hr_crest: createCrestModel, fd_herb: createHerbModel, hr_specimen: createTicketModel };
void lerp;
