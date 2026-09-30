// LCMONSTERS wave 8 - procedural PSX models (creature model contract of entities/creatures.js CreatureView:
// { root, parts, height, radius, update(dt, {state, speed, t, time, progress}), setElite, setHitFlash, setTint, dispose }, origin at the feet, facing +Z).
// Original low-poly designs, flat shading, a handful of meshes each. Glows are emissive / basic materials only: NEVER a THREE light.
import * as THREE from 'three';
import { createItemModel } from './items.js';
import { createCreatureModel } from './creatures.js';

const PI = Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

function kit() {
  const mats = [], geos = [], lam = [];
  const L = (c, em = 0x000000) => { const m = new THREE.MeshLambertMaterial({ color: c, flatShading: true, emissive: em }); m.userData.instance = true; m.userData.em = new THREE.Color(em); mats.push(m); lam.push(m); return m; };
  const B = (c, o = {}) => { const m = new THREE.MeshBasicMaterial({ color: c, fog: true, ...o }); m.userData.instance = true; mats.push(m); return m; };
  const G = (g) => { geos.push(g); return g; };
  const add = (p, g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(G(g), m); o.position.set(x, y, z); p.add(o); return o; };
  const box = (p, m, sx, sy, sz, x, y, z) => add(p, new THREE.BoxGeometry(sx, sy, sz), m, x, y, z);
  const cone = (p, m, r, h, x, y, z, seg = 7, open = false) => add(p, new THREE.ConeGeometry(r, h, seg, 1, open), m, x, y, z);
  const ball = (p, m, r, x, y, z) => add(p, new THREE.SphereGeometry(r, 8, 6), m, x, y, z);
  const pivot = (p, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); return g; };
  const flash = (v) => { for (const m of lam) m.emissive.copy(m.userData.em).add(new THREE.Color(v * 0.7, v * 0.08, v * 0.08)); };
  const dispose = () => { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); };
  return { L, B, G, add, box, cone, ball, pivot, flash, dispose };
}
const api = (K, root, parts, height, radius, update, extra = {}) => ({
  root, parts, height, radius, update,
  setElite() {}, setTint() {}, isElite: () => false, setHitFlash: (v) => K.flash(v), dispose() { K.dispose(); extra.dispose?.(); },
});

// ------------------------------------------------------------------------------------------------ Blood Witch
export function createWitchModel(o = {}) {
  const K = kit(), root = new THREE.Group();
  const dress = K.L(0x1a0c14), trim = K.L(0x5a0f18, 0x120204), skin = K.L(0xb9aaa8), eye = K.B(0xff2a2a);
  const body = K.pivot(root, 0, 0, 0);
  K.cone(body, dress, 0.62, 1.55, 0, 0.78, 0, 9, true);
  K.cone(body, trim, 0.64, 0.14, 0, 0.09, 0, 9, true);
  K.box(body, dress, 0.34, 0.5, 0.22, 0, 1.75, 0);
  const head = K.pivot(body, 0, 2.08, 0);
  K.ball(head, skin, 0.16, 0, 0, 0);
  K.add(head, new THREE.CylinderGeometry(0.4, 0.4, 0.03, 9), dress, 0, 0.13, 0);
  K.cone(head, dress, 0.24, 0.62, 0, 0.45, 0, 7);
  K.box(head, eye, 0.05, 0.03, 0.02, -0.06, 0.02, 0.15); K.box(head, eye, 0.05, 0.03, 0.02, 0.06, 0.02, 0.15);
  const arms = [-1, 1].map((sx) => { const s = K.pivot(body, sx * 0.24, 1.92, 0); K.box(s, skin, 0.07, 0.62, 0.07, 0, -0.31, 0); K.box(s, K.B(0x9a0b14), 0.05, 0.14, 0.05, 0, -0.68, 0); return s; });
  let ritual = 0, dead = 0;
  const update = (dt, a) => {
    dt = clamp(dt || 0, 0, 0.1); const st = a.state, tm = a.time || 0;
    ritual = damp(ritual, st === 'ritual' ? 1 : 0, 6, dt); dead = damp(dead, st === 'dead' ? 1 : 0, 4, dt);
    body.position.y = 0.05 + Math.sin(tm * 1.6) * 0.06 + ritual * 0.35;
    body.rotation.z = Math.sin(tm * 0.9) * 0.05; body.rotation.x = dead * -1.3;
    arms.forEach((s, i) => { s.rotation.x = -ritual * 2.7 + Math.sin(tm * 1.3 + i) * 0.08 + (st === 'walk' ? -0.5 : 0); s.rotation.z = (i ? -1 : 1) * ritual * 0.5; });
    head.rotation.y = Math.sin(tm * 0.7) * 0.25;
  };
  return api(K, root, { head }, 2.6, 0.5, update);
}

// ------------------------------------------------------------------------------------------------ Lantern Keeper
export function createKeeperModel(o = {}) {
  const K = kit(), root = new THREE.Group();
  const coat = K.L(0x2a2620), dark = K.L(0x100e0c), glowM = K.B(0xffb45a), cage = K.L(0x3a2a14);
  const beamM = K.B(0xffc878, { transparent: true, opacity: 0.07, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.FrontSide, vertexColors: true });   // [qa1] additive, low alpha, front faces only (no wall of light from inside), fades apex -> far end
  const body = K.pivot(root, 0, 0, 0);
  const legs = [-1, 1].map((sx) => { const l = K.pivot(body, sx * 0.13, 0.85, 0); K.box(l, dark, 0.13, 0.85, 0.15, 0, -0.42, 0); return l; });
  K.box(body, coat, 0.44, 1.05, 0.3, 0, 1.3, 0);
  K.cone(body, coat, 0.36, 0.9, 0, 0.62, 0, 8, true);
  const head = K.pivot(body, 0, 1.98, 0.02);
  K.ball(head, dark, 0.17, 0, 0, 0); K.cone(head, coat, 0.24, 0.42, 0, 0.14, -0.03, 7);
  K.box(head, glowM, 0.04, 0.02, 0.02, -0.055, 0.01, 0.15); K.box(head, glowM, 0.04, 0.02, 0.02, 0.055, 0.01, 0.15);
  const armL = K.pivot(body, -0.28, 1.72, 0); K.box(armL, coat, 0.09, 0.7, 0.09, 0, -0.35, 0);
  const armR = K.pivot(body, 0.28, 1.72, 0); K.box(armR, coat, 0.09, 0.62, 0.09, 0, -0.31, 0.02);
  armR.rotation.x = -1.15;                                             // the lantern arm points forward
  const lantern = K.pivot(armR, 0, -0.66, 0.02);
  K.box(lantern, cage, 0.2, 0.05, 0.2, 0, 0.13, 0); K.box(lantern, cage, 0.2, 0.05, 0.2, 0, -0.13, 0);
  const core = K.box(lantern, glowM, 0.15, 0.22, 0.15, 0, 0, 0);
  const beam = K.cone(root, beamM, 4.1, 9.5, 0.32, 1.02, 5.3, 14, true);   // apex at the lantern, opens forward: the hazard zone the host tests (inBeam)
  beam.rotation.x = -PI / 2;
  { const g = beam.geometry, p = g.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const f = clamp(p.getY(i) / 9.5 + 0.5, 0, 1); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = f * f; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }   // 1 at the lantern, 0 at the far rim
  beam.renderOrder = 5;
  let lit = 1, dead = 0;
  const update = (dt, a) => {
    dt = clamp(dt || 0, 0, 0.1); const st = a.state, tm = a.time || 0;
    const speed = a.speed ?? (st === 'walk' ? 1.6 : 0);
    lit = damp(lit, st === 'dark' || st === 'stunned' || st === 'dead' ? 0 : 1, 8, dt); dead = damp(dead, st === 'dead' ? 1 : 0, 4, dt);
    const gait = tm * (2 + speed * 1.4), sw = clamp(speed / 2, 0, 1) * 0.5;
    legs[0].rotation.x = Math.sin(gait) * sw; legs[1].rotation.x = -Math.sin(gait) * sw;
    body.rotation.x = dead * -1.4; body.position.y = Math.abs(Math.sin(gait)) * 0.03 * sw;
    lantern.rotation.z = Math.sin(tm * 2.4) * 0.12 * lit;
    core.material.color.setRGB(1, 0.62 + 0.1 * Math.sin(tm * 9), 0.3).multiplyScalar(0.25 + 0.75 * lit);
    beam.visible = lit > 0.05; beam.material.opacity = 0.07 * lit * (0.85 + 0.15 * Math.sin(tm * 7));
    head.rotation.y = Math.sin(tm * 0.5) * 0.3 * lit;
  };
  return api(K, root, { head, lantern, beam }, 2.25, 0.4, update);
}

// ------------------------------------------------------------------------------------------------ Trick-or-Treater
export function createTreaterModel(o = {}) {
  const K = kit(), root = new THREE.Group();
  const sheet = K.L(0xe8e0d0, 0x101008), hole = K.B(0x050505), bucket = K.L(0xd8620f, 0x401800), candy = K.B(0xffd04a);
  const body = K.pivot(root, 0, 0, 0);
  K.cone(body, sheet, 0.42, 1.0, 0, 0.5, 0, 9, true);
  const head = K.pivot(body, 0, 1.08, 0);
  K.ball(head, sheet, 0.2, 0, 0, 0);
  K.box(head, hole, 0.07, 0.09, 0.02, -0.07, 0.03, 0.19); K.box(head, hole, 0.07, 0.09, 0.02, 0.07, 0.03, 0.19); K.box(head, hole, 0.13, 0.03, 0.02, 0, -0.08, 0.19);
  const arm = K.pivot(body, 0.22, 0.85, 0.05); K.box(arm, sheet, 0.08, 0.4, 0.08, 0, -0.2, 0);
  const pail = K.pivot(body, -0.05, 0.62, 0.42);
  K.cone(pail, bucket, 0.17, 0.26, 0, 0, 0, 8, true); pail.children[0].rotation.x = PI;
  K.box(pail, candy, 0.14, 0.02, 0.14, 0, 0.12, 0);
  const update = (dt, a) => {
    dt = clamp(dt || 0, 0, 0.1); const st = a.state, tm = a.time || 0, t = a.t || 0;
    body.position.y = Math.abs(Math.sin(tm * 3)) * 0.03; body.rotation.z = Math.sin(tm * 1.5) * 0.03;
    const knock = st === 'knock' ? Math.abs(Math.sin(t * 9)) : 0;
    arm.rotation.x = -1.3 - knock * 0.5; arm.rotation.z = -0.2;
    pail.position.y = 0.62 + Math.sin(tm * 2) * 0.02; pail.rotation.x = st === 'trick' ? -0.9 : 0;
    head.rotation.z = Math.sin(tm * 2.4) * 0.14; if (st === 'dead') body.rotation.x = -1.4;
  };
  return api(K, root, { head, pail }, 1.3, 0.4, update);
}

// ------------------------------------------------------------------------------------------------ Rift Stalker (Demogorgon-like)
export function createHunterModel(o = {}) {
  const K = kit(), root = new THREE.Group();
  const skin = K.L(0x3a2c2c), flesh = K.L(0x7a2030, 0x180408), petalIn = K.B(0xff5a78), claw = K.L(0x140c0c);
  const body = K.pivot(root, 0, 0, 0);
  const legs = [-1, 1].map((sx) => { const h = K.pivot(body, sx * 0.16, 1.1, 0); K.box(h, skin, 0.14, 0.62, 0.15, 0, -0.3, 0); const k = K.pivot(h, 0, -0.6, 0); K.box(k, skin, 0.11, 0.55, 0.13, 0, -0.28, 0.06); return { h, k }; });
  const torso = K.pivot(body, 0, 1.15, 0); K.box(torso, skin, 0.42, 0.9, 0.26, 0, 0.45, 0);
  const arms = [-1, 1].map((sx) => { const s = K.pivot(torso, sx * 0.3, 0.85, 0); K.box(s, skin, 0.08, 0.75, 0.08, 0, -0.37, 0); const e = K.pivot(s, 0, -0.75, 0); K.box(e, skin, 0.07, 0.7, 0.07, 0, -0.35, 0.05); for (let f = 0; f < 3; f++) K.box(e, claw, 0.02, 0.2, 0.02, (f - 1) * 0.04, -0.78, 0.06); return { s, e }; });
  const head = K.pivot(torso, 0, 1.0, 0.05);
  K.box(head, skin, 0.16, 0.2, 0.16, 0, 0, 0);
  K.add(head, new THREE.CircleGeometry(0.13, 8), petalIn, 0, 0.03, 0.09);
  const petals = [];
  for (let i = 0; i < 5; i++) {                                   // the flower face: 5 petals hinged around the mouth, closed = a bud, open = a maw
    const hinge = K.pivot(head, 0, 0.03, 0.09); hinge.rotation.z = (i / 5) * PI * 2;
    const pv = K.pivot(hinge, 0, 0.08, 0); K.box(pv, flesh, 0.1, 0.26, 0.03, 0, 0.13, 0);
    petals.push(pv);
  }
  let open = 0, run = 0, dead = 0;
  const update = (dt, a) => {
    dt = clamp(dt || 0, 0, 0.1); const st = a.state, tm = a.time || 0, t = a.t || 0;
    const speed = a.speed ?? (st === 'run' ? 6 : st === 'walk' ? 2 : 0);
    open = damp(open, st === 'attack' ? 1 : st === 'run' || st === 'emerge' ? 0.55 : 0.04, st === 'attack' ? 22 : 8, dt);
    run = damp(run, st === 'run' ? 1 : 0, 6, dt); dead = damp(dead, st === 'dead' ? 1 : 0, 4, dt);
    const gait = tm * (1.5 + speed * 0.9), sw = clamp(speed / 5, 0, 1) * 0.8 + (speed > 0.3 ? 0.15 : 0);
    legs.forEach((L, i) => { const ph = gait + i * PI; L.h.rotation.x = Math.sin(ph) * sw; L.k.rotation.x = Math.max(0, -Math.sin(ph + 0.6)) * sw * 1.1; });
    torso.rotation.x = 0.25 + run * 0.5 + dead * 1.2 + (st === 'emerge' ? Math.max(0, 1 - t / 1.2) * 0.9 : 0);
    body.position.y = -dead * 0.9 + Math.abs(Math.sin(gait)) * 0.05 * clamp(speed / 3, 0, 1);
    arms.forEach((A, i) => { A.s.rotation.x = -(st === 'attack' ? 1.6 : run * 0.6) + Math.sin(gait + i * PI) * sw * 0.5; A.e.rotation.x = -0.4 - (st === 'attack' ? 0.6 : 0); });
    petals.forEach((p, i) => { p.rotation.x = -0.15 - open * 1.25 + Math.sin(tm * 6 + i * 1.3) * 0.05 * (0.3 + open); });
    head.rotation.y = Math.sin(tm * 0.8) * 0.3 * (1 - open);
  };
  return api(K, root, { head, petals }, 2.5, 0.45, update);
}

// ------------------------------------------------------------------------------------------------ Loot Mimic (a scrap item that bites)
export const MIMIC_LOOK = Object.freeze(['goldbar', 'vase', 'tv', 'bell', 'trophy', 'register', 'robot', 'playbutton', 'nftframe', 'cryptocoin']);
export const mimicLookOf = (seed) => MIMIC_LOOK[Math.abs(seed | 0) % MIMIC_LOOK.length];
export function createLootMimicModel(o = {}) {
  const K = kit(), root = new THREE.Group();
  const id = mimicLookOf(o.seed || 1);
  let item; try { item = createItemModel(id); } catch { item = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), K.L(0xb08a2a)); }
  const holder = new THREE.Group(); holder.add(item); root.add(holder);
  const bb = new THREE.Box3().setFromObject(item), sz = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
  item.position.sub(ctr); item.position.y += sz.y / 2; holder.scale.setScalar(1);
  const tooth = K.B(0xf2eee0), tongue = K.B(0x9a1424), maw = K.B(0x1a0406);
  const jaw = K.pivot(root, 0, sz.y * 0.5, 0), r = Math.max(0.16, Math.max(sz.x, sz.z) * 0.55);
  const teeth = [];
  for (let i = 0; i < 9; i++) { const a = (i / 9) * PI * 2, c = K.cone(jaw, tooth, 0.035, 0.16, Math.cos(a) * r, 0, Math.sin(a) * r, 4); teeth.push(c); c.scale.setScalar(0.001); }
  const ring = K.add(jaw, new THREE.RingGeometry(r * 0.6, r * 1.1, 10), maw, 0, 0.005, 0); ring.rotation.x = -PI / 2; ring.scale.setScalar(0.001);
  const tg = K.box(jaw, tongue, 0.1, 0.03, 0.26, 0, 0.02, r * 0.5); tg.scale.setScalar(0.001);
  let awake = 0, twT = 1.5 + (o.seed % 7) * 0.4, tw = 0;
  const update = (dt, a) => {
    dt = clamp(dt || 0, 0, 0.1); const st = a.state, tm = a.time || 0;
    awake = damp(awake, st === 'attack' || st === 'run' || st === 'chase' || st === 'walk' ? 1 : 0, st === 'attack' ? 30 : 9, dt);
    const dormant = st === 'idle' || st === 'lure' || st === 'dormant';
    const s = 1 + (dormant ? 0.02 * Math.sin(tm * 2.3 + (o.seed || 0)) : 0.06 * Math.sin(tm * 14));
    holder.scale.set(s, 1 + (s - 1) * 1.6, s);
    twT -= dt; if (twT <= 0) { twT = 2.6 + ((o.seed || 1) * 0.37 + tm) % 2.4; tw = dormant ? 0.09 : 0; }
    tw = damp(tw, 0, 9, dt); holder.rotation.z = tw * Math.sin(tm * 40); holder.rotation.y = tw * 3 * Math.sin(tm * 31);
    for (const c of teeth) c.scale.setScalar(Math.max(0.001, awake)); ring.scale.setScalar(Math.max(0.001, awake)); tg.scale.setScalar(Math.max(0.001, awake));
    tg.position.z = r * 0.5 + Math.sin(tm * 12) * 0.03 * awake;
    holder.position.y = awake * Math.abs(Math.sin(tm * (st === 'run' || st === 'chase' ? 12 : 4))) * 0.08 * (st === 'dead' ? 0 : 1);
    root.rotation.z = st === 'dead' ? 0.6 : 0;
  };
  return api(K, root, { item: holder, jaw }, Math.max(0.5, sz.y + 0.1), Math.max(0.3, r), update);
}

// ------------------------------------------------------------------------------------------------ Masked (a crewmate in the Company suit + a streamer mask)
export function createMaskedModel(o = {}) {
  const K = kit();
  const m = createCreatureModel('mimic', { suitColor: '#d9642b', elite: false, seed: o.seed || 1 });
  const smile = (o.seed || 1) % 2 === 0;
  const face = K.L(smile ? 0xefe6d2 : 0xd8d2e6, smile ? 0x181410 : 0x101018), dark = K.B(0x0a0a0a), glint = K.B(smile ? 0xffe9a0 : 0xa8c4ff);
  const head = m.parts.head;
  const mask = new THREE.Group(); mask.position.set(0, 0.135, 0.17); head.add(mask);
  K.box(mask, face, 0.29, 0.31, 0.035, 0, 0, 0);
  K.box(mask, dark, 0.06, 0.05, 0.01, -0.07, 0.05, 0.02); K.box(mask, dark, 0.06, 0.05, 0.01, 0.07, 0.05, 0.02);
  const mouth = K.box(mask, dark, 0.13, smile ? 0.03 : 0.05, 0.01, 0, -0.07, 0.02); mouth.rotation.z = smile ? 0 : 0;
  K.box(mask, glint, 0.02, 0.02, 0.005, 0.1, 0.11, 0.02);        // the glint that catches a flashlight
  const inner = m.update;
  m.update = (dt, a) => { inner(dt, a); glint.color.setScalar(0.6 + 0.4 * Math.sin((a.time || 0) * 5)).multiply(new THREE.Color(smile ? 1 : 0.7, smile ? 0.9 : 0.8, smile ? 0.6 : 1)); };
  const dm = m.dispose; m.dispose = () => { dm(); K.dispose(); };
  return m;
}

/** register every model in the mod creature-model registry (window.__kefalMods.creatureModels) */
export function registerLcModels(reg) {
  if (!reg) return;
  const F = { lm_witch: createWitchModel, lm_keeper: createKeeperModel, lm_treater: createTreaterModel, lm_hunter: createHunterModel, lm_lootmimic: createLootMimicModel, lm_masked: createMaskedModel };
  for (const [id, fn] of Object.entries(F)) if (!reg.has(id)) reg.set(id, (T, o) => fn(o || {}));
}

// ------------------------------------------------------------------------------------------------ item models (mod item-model registry: () => Object3D)
export function createLcItemModel(id) {
  const g = new THREE.Group(), geos = [], mat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o }), bas = (c) => new THREE.MeshBasicMaterial({ color: c });
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); geos.push(geo); return o; };
  if (id === 'lm_lantern') {
    add(new THREE.BoxGeometry(0.2, 0.05, 0.2), mat(0x3a2a14), 0, 0.13, 0); add(new THREE.BoxGeometry(0.2, 0.05, 0.2), mat(0x3a2a14), 0, -0.13, 0);
    add(new THREE.BoxGeometry(0.15, 0.22, 0.15), bas(0xffb45a)); add(new THREE.TorusGeometry(0.09, 0.015, 4, 8, Math.PI), mat(0x3a2a14), 0, 0.15, 0);
  } else if (id === 'lm_fang') {
    add(new THREE.ConeGeometry(0.06, 0.32, 5), bas(0xf2eee0), 0, 0.16, 0);
  } else {                                                          // Fan Mask: smiling / crying streamer mask
    const smile = id === 'lm_mask_smile';
    add(new THREE.BoxGeometry(0.22, 0.26, 0.04), mat(smile ? 0xefe6d2 : 0xd8d2e6, { emissive: smile ? 0x201a10 : 0x101020 }));
    add(new THREE.BoxGeometry(0.05, 0.04, 0.01), bas(0x0a0a0a), -0.055, 0.04, 0.025); add(new THREE.BoxGeometry(0.05, 0.04, 0.01), bas(0x0a0a0a), 0.055, 0.04, 0.025);
    const m = add(new THREE.BoxGeometry(0.1, smile ? 0.025 : 0.045, 0.01), bas(0x0a0a0a), 0, -0.06, 0.025); if (!smile) m.position.y = -0.075;
    add(new THREE.BoxGeometry(0.02, 0.02, 0.005), bas(smile ? 0xffe9a0 : 0xa8c4ff), 0.08, 0.09, 0.03);
  }
  return g;
}
export const LC_ITEM_IDS = Object.freeze(['lm_lantern', 'lm_fang', 'lm_mask_smile', 'lm_mask_cry']);
