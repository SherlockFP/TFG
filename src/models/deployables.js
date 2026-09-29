// TFG wave 2 - procedural models for the TECH DEPLOYABLES (turrets, tesla, barricades, spikes, mines, floodlight tower,
// repair drone, motion sensor, shield dome, generator, battery bank) + the kit-case item models + the placement ghost.
// Flat vertex-coloured, merged geometry (1-3 draw calls per deployable). Barricades / spikes / mines are exported as ONE
// merged geometry (`staticGeometry`) so game/deployables.js can draw all of them through a single InstancedMesh each.
// Conventions: metres, +Y up, origin = floor point, the deployable looks along +Z (rotation.y = aim yaw).
import { sigHex } from '../core/a11y_core.js';   // [a11y]
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI, HP = PI / 2, TAU = PI * 2;
const C = { steel: 0x8a9096, dark: 0x30343a, mid: 0x565c64, rust: 0x8a5a3a, yellow: 0xd8b020, wood: 0xa8804e, woodD: 0x6e5030, red: 0xd23a2a, green: 0x40e070, cyan: 0x50d8ff, blue: 0x3c6cc8, white: 0xe8e8e0, copper: 0xc8763a, olive: 0x4a5a3a, orange: 0xe07a20 };
export const DEP_COLORS = C;

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _c = new THREE.Color(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
/** one coloured primitive: kind box[w,h,d] | cyl[rt,rb,h,seg] | cone[r,h,seg] | sph[r,ws,hs] | tor[R,r,rs,ts] */
function P(kind, a, pos = [0, 0, 0], rot = [0, 0, 0], color = C.steel) {
  let g;
  if (kind === 'box') g = new THREE.BoxGeometry(a[0], a[1], a[2]);
  else if (kind === 'cyl') g = new THREE.CylinderGeometry(a[0], a[1], a[2], a[3] || 8);
  else if (kind === 'cone') g = new THREE.ConeGeometry(a[0], a[1], a[2] || 6);
  else if (kind === 'sph') g = new THREE.SphereGeometry(a[0], a[1] || 8, a[2] || 6);
  else g = new THREE.TorusGeometry(a[0], a[1], a[2] || 4, a[3] || 10);
  _m.compose(_v.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _one);
  g.applyMatrix4(_m);
  _c.set(color);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function merged(list) {
  if (!list.length) return null;
  return list.length === 1 ? list[0] : mergeGeometries(list, false);
}

const LIT = new THREE.MeshLambertMaterial({ vertexColors: true });
const EMIT = new THREE.MeshBasicMaterial({ vertexColors: true });
export const depMaterials = { LIT, EMIT };
const meshOf = (list, mat = LIT) => { const g = merged(list); if (!g) return null; const m = new THREE.Mesh(g, mat); m.frustumCulled = true; return m; };
const grp = (name, ...kids) => { const g = new THREE.Group(); g.name = name; for (const k of kids) if (k) g.add(k); return g; };

// ---------------------------------------------------------------------------------------------- static (instanced) types
const STATIC = {
  barr_wood: () => {
    const l = [];
    for (const x of [-0.95, 0.95]) l.push(P('box', [0.16, 1.3, 0.22], [x, 0.65, 0], [0, 0, 0], C.woodD));
    for (let i = 0; i < 3; i++) l.push(P('box', [2.2, 0.22, 0.12], [0, 0.32 + i * 0.36, 0.03 * (i % 2)], [0, 0, 0], i === 1 ? C.woodD : C.wood));
    l.push(P('box', [1.6, 0.09, 0.07], [0, 0.7, 0.11], [0, 0, 0.55], C.wood), P('box', [1.6, 0.09, 0.07], [0, 0.7, 0.11], [0, 0, -0.55], C.woodD));
    for (const [x, y] of [[-0.95, 1.31], [0.95, 1.31]]) l.push(P('cone', [0.11, 0.22, 4], [x, y, 0], [0, PI / 4, 0], C.woodD));
    return l;
  },
  barr_metal: () => {
    const l = [];
    for (const x of [-1.0, 1.0]) { l.push(P('box', [0.2, 1.5, 0.28], [x, 0.75, 0], [0, 0, 0], C.dark)); l.push(P('box', [0.32, 0.08, 0.7], [x, 0.04, 0], [0, 0, 0], C.mid)); }
    l.push(P('box', [1.9, 1.15, 0.1], [0, 0.85, 0], [0, 0, 0], C.steel));
    l.push(P('box', [2.1, 0.12, 0.16], [0, 1.48, 0], [0, 0, 0], C.mid));
    for (let i = 0; i < 4; i++) l.push(P('box', [0.16, 1.0, 0.03], [-0.75 + i * 0.5, 0.85, 0.07], [0, 0, 0.7], C.yellow));
    return l;
  },
  spikes: () => {
    const l = [P('box', [2.8, 0.06, 1.4], [0, 0.03, 0], [0, 0, 0], C.dark)];
    for (let r = -1; r <= 1; r++) for (let i = -3; i <= 3; i++) l.push(P('cone', [0.07, 0.34, 5], [i * 0.4, 0.23, r * 0.45], [0, 0, 0], (i + r) & 1 ? C.rust : C.steel));
    return l;
  },
  mine: () => [P('cyl', [0.32, 0.36, 0.1, 10], [0, 0.05, 0], [0, 0, 0], C.olive), P('cyl', [0.1, 0.1, 0.06, 6], [0, 0.12, 0], [0, 0, 0], C.red), P('box', [0.5, 0.02, 0.06], [0, 0.1, 0], [0, 0, 0], C.dark)],
};
export const STATIC_TYPES = Object.keys(STATIC);
const _sg = new Map();
/** merged, vertex-coloured geometry of an instanced type (cached) */
export function staticGeometry(type) {
  let g = _sg.get(type);
  if (!g) { const b = STATIC[type]; g = b ? merged(b()) : null; _sg.set(type, g); }
  return g;
}
export const staticMaterial = LIT;

// ---------------------------------------------------------------------------------------------- animated types
// every builder returns { root, height, update(dt, st) } ; st = { aim, on, hit, hpf, t, firing, target, pool, poolMax, charge }
function turret(mk) {
  const root = new THREE.Group();
  const base = [P('cyl', [0.5, 0.6, 0.18, 8], [0, 0.09, 0], [0, 0, 0], C.dark), P('cyl', [0.16, 0.2, 0.5, 6], [0, 0.43, 0], [0, 0, 0], C.mid)];
  if (mk >= 2) base.push(P('box', [0.14, 0.34, 0.14], [0.36, 0.3, 0], [0, 0, 0.3], C.mid), P('box', [0.14, 0.34, 0.14], [-0.36, 0.3, 0], [0, 0, -0.3], C.mid));
  root.add(meshOf(base));
  const head = new THREE.Group(); head.position.y = 0.88; root.add(head);
  const body = [P('box', [0.42, 0.3, 0.5], [0, 0, 0], [0, 0, 0], mk === 3 ? C.dark : C.steel), P('box', [0.3, 0.06, 0.3], [0, 0.17, -0.05], [0, 0, 0], C.yellow)];
  if (mk >= 2) body.push(P('box', [0.16, 0.2, 0.3], [0.27, -0.02, -0.05], [0, 0, 0], C.mid), P('box', [0.16, 0.2, 0.3], [-0.27, -0.02, -0.05], [0, 0, 0], C.mid));
  if (mk === 3) body.push(P('box', [0.5, 0.05, 0.4], [0, 0.2, 0.05], [0, 0, 0], C.red));
  head.add(meshOf(body));
  const barrels = new THREE.Group(); head.add(barrels);
  const bl = [];
  const xs = mk === 1 ? [0] : mk === 2 ? [-0.1, 0.1] : [-0.14, 0, 0.14];
  for (const x of xs) bl.push(P('cyl', [0.045, 0.05, 0.62, 6], [x, 0, 0.5], [HP, 0, 0], C.dark), P('cyl', [0.07, 0.07, 0.08, 6], [x, 0, 0.8], [HP, 0, 0], C.mid));
  barrels.add(meshOf(bl));
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x40e070 });
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.03), eyeMat); eye.position.set(0, 0.08, 0.26); head.add(eye);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.95, depthWrite: false });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4), flashMat); flash.position.set(0, 0, 0.9); flash.visible = false; head.add(flash);
  let kick = 0, flashT = 0;
  return {
    root, height: 1.35, muzzle: new THREE.Vector3(0, 0.88, 0.85), head,
    fire() { kick = 0.09; flashT = 0.05; flash.visible = true; flash.rotation.z = Math.random() * 3; },
    update(dt, st) {
      head.rotation.y = st.aim || 0;
      kick = Math.max(0, kick - dt * 0.9); barrels.position.z = -kick;
      if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.visible = false; }
      eyeMat.color.setHex(!st.on ? 0x552222 : st.target ? sigHex('eye') : sigHex('ok'));   // [a11y]
    },
    dispose() { eyeMat.dispose(); flashMat.dispose(); },
  };
}
function tesla() {
  const root = new THREE.Group();
  root.add(meshOf([P('cyl', [0.55, 0.65, 0.3, 8], [0, 0.15, 0], [0, 0, 0], C.dark), P('cyl', [0.18, 0.22, 1.3, 6], [0, 0.95, 0], [0, 0, 0], C.steel)]));
  const rings = new THREE.Group(); root.add(rings);
  const rl = []; for (let i = 0; i < 4; i++) rl.push(P('tor', [0.3 - i * 0.03, 0.05, 4, 10], [0, 0.7 + i * 0.28, 0], [HP, 0, 0], C.copper));
  rings.add(meshOf(rl));
  const orbMat = new THREE.MeshBasicMaterial({ color: 0x50d8ff });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), orbMat); orb.position.y = 1.95; root.add(orb);
  return {
    root, height: 2.2, top: new THREE.Vector3(0, 1.95, 0),
    fire() { orb.scale.setScalar(1.5); },
    update(dt, st) {
      rings.rotation.y += dt * (st.on ? 2.2 : 0.2);
      const s = orb.scale.x; orb.scale.setScalar(s + ((st.on ? 1 + 0.12 * Math.sin(st.t * 6) : 0.55) - s) * Math.min(1, dt * 8));
      orbMat.color.setHex(st.on ? 0x50d8ff : 0x2a4048);
    },
    dispose() { orbMat.dispose(); },
  };
}
function floodlight() {
  const root = new THREE.Group();
  const l = [P('cyl', [0.07, 0.1, 3.6, 6], [0, 1.8, 0], [0, 0, 0], C.steel), P('box', [0.75, 0.55, 0.3], [0, 3.75, 0.05], [0, 0, 0], C.dark), P('cyl', [0.3, 0.42, 0.14, 6], [0, 0.07, 0], [0, 0, 0], C.mid)];
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; l.push(P('box', [0.07, 1.2, 0.07], [Math.sin(a) * 0.32, 0.55, Math.cos(a) * 0.32], [Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4], C.mid)); }
  root.add(meshOf(l));
  const panelMat = new THREE.MeshBasicMaterial({ color: 0xfff4d0 });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.42, 0.02), panelMat); panel.position.set(0, 3.75, 0.21); root.add(panel);
  return {
    root, height: 4.1, lamp: new THREE.Vector3(0, 3.7, 0.7),
    update(dt, st) { panelMat.color.setHex(st.on ? 0xfff4d0 : 0x3a3a34); },
    dispose() { panelMat.dispose(); },
  };
}
function drone() {
  const root = new THREE.Group();
  root.add(meshOf([P('cyl', [0.42, 0.42, 0.05, 10], [0, 0.03, 0], [0, 0, 0], C.mid), P('cyl', [0.04, 0.06, 1.0, 5], [0, 0.55, 0], [0, 0, 0], C.dark)]));
  const body = new THREE.Group(); body.position.y = 1.5; root.add(body);
  body.add(meshOf([P('sph', [0.2, 8, 6], [0, 0, 0], [0, 0, 0], C.white), P('box', [0.62, 0.03, 0.05], [0, 0.04, 0], [0, PI / 4, 0], C.dark), P('box', [0.62, 0.03, 0.05], [0, 0.04, 0], [0, -PI / 4, 0], C.dark), P('box', [0.16, 0.05, 0.16], [0, -0.16, 0], [0, 0, 0], C.mid)]));
  const rotors = [];
  for (const [x, z] of [[0.22, 0.22], [-0.22, 0.22], [0.22, -0.22], [-0.22, -0.22]]) {
    const r = meshOf([P('cyl', [0.16, 0.16, 0.012, 10], [0, 0, 0], [0, 0, 0], 0xb8c4d0)]); r.position.set(x, 0.07, z); body.add(r); rotors.push(r);
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x40e070 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), lampMat); lamp.position.set(0, -0.06, 0.18); body.add(lamp);
  return {
    root, height: 1.8, body,
    update(dt, st) {
      for (const r of rotors) r.rotation.y += dt * (st.on ? 40 : 3);
      body.position.y = 1.5 + Math.sin(st.t * 2.4) * 0.06 * (st.on ? 1 : 0.2) - (st.on ? 0 : 0.35);
      lampMat.color.setHex(!st.on ? 0x552222 : st.busy ? 0x50d8ff : 0x40e070);
    },
    dispose() { lampMat.dispose(); },
  };
}
function sensor() {
  const root = new THREE.Group();
  root.add(meshOf([P('cyl', [0.24, 0.3, 0.1, 6], [0, 0.05, 0], [0, 0, 0], C.mid), P('cyl', [0.04, 0.05, 1.3, 5], [0, 0.7, 0], [0, 0, 0], C.dark)]));
  const dish = new THREE.Group(); dish.position.y = 1.42; root.add(dish);
  const dm = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 4, 0, TAU, 0, HP), new THREE.MeshLambertMaterial({ color: 0xc8d0d8, side: THREE.DoubleSide }));
  dm.rotation.x = -1.0; dish.add(dm);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), ledMat); led.position.set(0, 0.2, 0.22); dish.add(led);
  return {
    root, height: 1.7,
    update(dt, st) {
      dish.rotation.y += dt * (st.on ? 1.6 : 0);
      ledMat.color.setHex(!st.on ? 0x331111 : st.target ? 0xff3a2a : (Math.sin(st.t * 4) > 0.6 ? 0x40e070 : 0x104020));
    },
    dispose() { dm.material.dispose(); dm.geometry.dispose(); ledMat.dispose(); },
  };
}
function shield(radius) {
  const root = new THREE.Group();
  root.add(meshOf([P('cyl', [0.4, 0.55, 0.4, 8], [0, 0.2, 0], [0, 0, 0], C.dark), P('cone', [0.15, 0.7, 6], [0, 0.85, 0], [0, 0, 0], C.mid)]));
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x50d8ff });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 4, 12), ringMat); ring.rotation.x = HP; ring.position.y = 0.5; root.add(ring);
  const domeMat = new THREE.MeshBasicMaterial({ color: 0x50d8ff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 9, 0, TAU, 0, HP), domeMat);
  dome.scale.setScalar(radius); dome.visible = false; root.add(dome);
  let flash = 0;
  return {
    root, height: 1.4, dome,
    fire() { flash = 1; },
    update(dt, st) {
      ring.rotation.z += dt * (st.on ? 2 : 0.2);
      flash = Math.max(0, flash - dt * 3);
      const up = st.on && (st.pool ?? 1) > 0;
      dome.visible = up;
      if (up) domeMat.opacity = 0.07 + 0.05 * Math.sin(st.t * 3) + flash * 0.3 + 0.08 * (st.poolMax ? 1 - st.pool / st.poolMax : 0);
      ringMat.color.setHex(up ? 0x50d8ff : 0x334048);
    },
    dispose() { ringMat.dispose(); domeMat.dispose(); dome.geometry.dispose(); ring.geometry.dispose(); },
  };
}
function generator() {
  const root = new THREE.Group();
  root.add(meshOf([P('box', [0.95, 0.55, 0.62], [0, 0.42, 0], [0, 0, 0], C.yellow), P('box', [0.08, 0.5, 0.08], [-0.46, 0.5, 0.3], [0, 0, 0], C.dark), P('box', [0.08, 0.5, 0.08], [0.46, 0.5, 0.3], [0, 0, 0], C.dark),
    P('box', [0.08, 0.5, 0.08], [-0.46, 0.5, -0.3], [0, 0, 0], C.dark), P('box', [0.08, 0.5, 0.08], [0.46, 0.5, -0.3], [0, 0, 0], C.dark), P('box', [1.0, 0.06, 0.7], [0, 0.72, 0], [0, 0, 0], C.dark),
    P('cyl', [0.2, 0.2, 0.55, 8], [-0.1, 0.98, 0], [0, 0, HP], C.red), P('cyl', [0.05, 0.05, 0.4, 5], [0.42, 0.98, -0.2], [0, 0, 0], C.mid), P('box', [0.05, 0.05, 0.4], [0.3, 0.1, 0], [0, 0, 0], C.mid)]));
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x40e070 });
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.03), ledMat); led.position.set(0.32, 0.55, 0.32); root.add(led);
  return {
    root, height: 1.25,
    update(dt, st) {
      ledMat.color.setHex(!st.on ? 0xd23a2a : 0x40e070);
      root.position.y = st.on ? Math.sin(st.t * 60) * 0.004 : 0;
    },
    dispose() { ledMat.dispose(); },
  };
}
function bank() {
  const root = new THREE.Group();
  const l = [P('box', [1.0, 0.08, 0.7], [0, 0.04, 0], [0, 0, 0], C.dark)];
  for (const [x, z] of [[-0.24, -0.16], [0.24, -0.16], [-0.24, 0.16], [0.24, 0.16]]) l.push(P('cyl', [0.19, 0.19, 0.72, 8], [x, 0.44, z], [0, 0, 0], C.blue), P('cyl', [0.08, 0.08, 0.05, 6], [x, 0.83, z], [0, 0, 0], C.yellow));
  l.push(P('box', [0.9, 0.05, 0.05], [0, 0.9, 0], [0, 0, 0], C.copper));
  root.add(meshOf(l));
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x40e070 });
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.02), ledMat); led.position.set(0, 0.2, 0.36); root.add(led);
  return {
    root, height: 1.0,
    update(dt, st) { const c = st.charge ?? 1; ledMat.color.setRGB(1 - c, 0.2 + 0.8 * c, 0.1); led.scale.x = 0.15 + 0.85 * c; },
    dispose() { ledMat.dispose(); },
  };
}

/** Full (non-instanced) model of a deployable type. Instanced types (barricades, spikes, mine) get a single merged mesh. */
export function createDeployableModel(type, opts = {}) {
  let m;
  switch (type) {
    case 'turret1': m = turret(1); break;
    case 'turret2': m = turret(2); break;
    case 'turret3': m = turret(3); break;
    case 'tesla': m = tesla(); break;
    case 'flood': m = floodlight(); break;
    case 'drone': m = drone(); break;
    case 'sensor': m = sensor(); break;
    case 'shield': m = shield(opts.radius || 5.5); break;
    case 'gen': m = generator(); break;
    case 'bank': m = bank(); break;
    default: {
      const g = staticGeometry(type);
      const root = new THREE.Group();
      if (g) root.add(new THREE.Mesh(g, LIT));
      m = { root, height: type.startsWith('barr') ? 1.5 : 0.4, update() {}, dispose() {} };
    }
  }
  m.type = type;
  return m;
}

/** the item shown for a kit in the hotbar / on the floor / in icons: a yellow case with a miniature of the deployable on top */
export function createKitModel(type) {
  const root = new THREE.Group();
  root.name = 'kit_' + type;
  root.add(meshOf([P('box', [0.5, 0.14, 0.36], [0, 0.07, 0], [0, 0, 0], C.yellow), P('box', [0.52, 0.045, 0.1], [0, 0.07, 0], [0, 0, 0], C.dark), P('box', [0.08, 0.06, 0.04], [0, 0.14, 0.18], [0, 0, 0], C.mid), P('box', [0.16, 0.03, 0.04], [0.16, 0.15, 0], [0, 0, 0], C.red)]));
  try {
    const mini = createDeployableModel(type, { radius: 1 });
    const s = Math.min(0.42, 0.5 / (mini.height || 1));
    mini.root.scale.setScalar(s); mini.root.position.y = 0.14;
    if (type === 'barr_wood' || type === 'barr_metal') mini.root.scale.setScalar(0.22);
    if (type === 'spikes') mini.root.scale.setScalar(0.16);
    root.add(mini.root);
    root.userData.dispose = () => mini.dispose?.();
  } catch (e) { console.warn('kit model', type, e); }
  return root;
}

const _ghostMats = {
  ok: new THREE.MeshBasicMaterial({ color: 0x40ff70, transparent: true, opacity: 0.45, depthWrite: false }),
  bad: new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.45, depthWrite: false }),
};
/** placement ghost: the model with every mesh drawn in one translucent colour. Returns { root, set(ok) } */
export function createGhost(type, opts = {}) {
  const m = createDeployableModel(type, opts);
  m.update?.(0, { on: false, t: 0 });
  const meshes = [];
  m.root.traverse((o) => { if (o.isMesh) { meshes.push(o); o.material = _ghostMats.ok; o.frustumCulled = false; } });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40), new THREE.MeshBasicMaterial({ color: 0x40ff70, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -HP; ring.position.y = 0.05; ring.visible = false; m.root.add(ring);
  return {
    root: m.root, ring, model: m,
    set(ok) { for (const o of meshes) o.material = ok ? _ghostMats.ok : _ghostMats.bad; ring.material.color.setHex(ok ? 0x40ff70 : 0xff3a2a); },
    range(r) { ring.visible = r > 0; if (r > 0) ring.scale.set(r, r, 1); },
    dispose() { m.dispose?.(); ring.geometry.dispose(); ring.material.dispose(); },
  };
}

/** a small glowing relic (strange finds that unlock the tech blueprints) */
export function createRelicModel(color = 0x50d8ff) {
  const root = new THREE.Group();
  root.add(meshOf([P('box', [0.24, 0.05, 0.18], [0, 0.025, 0], [0, 0, 0], C.dark), P('cyl', [0.03, 0.05, 0.08, 5], [0, 0.09, 0], [0, 0, 0], C.mid)]));
  const crystal = meshOf([P('sph', [0.09, 5, 3], [0, 0.2, 0], [0.3, 0.6, 0], color)], EMIT);
  root.add(crystal);
  return root;
}
