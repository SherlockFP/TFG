// WAVE 3 worlds2 - procedural models: 5 planet creatures (Dune Maw, Tusked Beast, Scavenger Raider, Cantina Alien, Dusk Prowler),
// the cosmetic fauna geometry (grazers + flyers, merged) and the Plasma Blade / Blaster Pistol / Blaster Cell item models.
// Creature model contract (entities/creatures.js CreatureView): { root, parts, height, radius, update(dt, {state, speed, t, time, progress}),
// setElite, setHitFlash, setTint, dispose }. Origin at the feet, facing +Z, meters. Per-instance materials (hit flash never leaks).
import * as THREE from 'three';
import { ModelKit } from './items.js';

const TAU = Math.PI * 2, PI = Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

// ------------------------------------------------------------------------------------------------ tiny builder
function kit() {
  const mats = new Map(), geos = [];
  const mat = (c, o = {}) => {
    const key = c + '|' + (o.basic ? 'b' : 'l') + (o.additive ? 'a' : '') + (o.opacity ?? '') + (o.side ?? '');
    let m = mats.get(key);
    if (!m) {
      m = o.basic ? new THREE.MeshBasicMaterial({ color: c, transparent: o.opacity != null, opacity: o.opacity ?? 1, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !o.additive, side: o.side ?? THREE.FrontSide })
        : new THREE.MeshLambertMaterial({ color: c, flatShading: true, side: o.side ?? THREE.FrontSide });
      m.userData.instance = true;
      mats.set(key, m);
    }
    return m;
  };
  const geo = (g) => { geos.push(g); return g; };
  /** box mesh centred on (x, y, z); parent gets it. o: { rx, ry, rz, basic, additive, opacity } */
  const box = (parent, c, sx, sy, sz, x = 0, y = 0, z = 0, o = {}) => {
    const m = new THREE.Mesh(geo(new THREE.BoxGeometry(sx, sy, sz)), mat(c, o));
    m.position.set(x, y, z); if (o.rx || o.ry || o.rz) m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
    parent.add(m); return m;
  };
  const cone = (parent, c, r, h, x, y, z, o = {}) => {
    const m = new THREE.Mesh(geo(new THREE.ConeGeometry(r, h, o.seg || 5)), mat(c, o));
    m.position.set(x, y, z); if (o.rx || o.ry || o.rz) m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
    parent.add(m); return m;
  };
  const cyl = (parent, c, rt, rb, h, x, y, z, o = {}) => {
    const m = new THREE.Mesh(geo(new THREE.CylinderGeometry(rt, rb, h, o.seg || 6)), mat(c, o));
    m.position.set(x, y, z); if (o.rx || o.ry || o.rz) m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
    parent.add(m); return m;
  };
  const sph = (parent, c, r, x, y, z, o = {}) => {
    const m = new THREE.Mesh(geo(new THREE.SphereGeometry(r, o.w || 7, o.h || 5)), mat(c, o));
    m.position.set(x, y, z); if (o.sx || o.sy || o.sz) m.scale.set(o.sx || 1, o.sy || 1, o.sz || 1);
    parent.add(m); return m;
  };
  const pivot = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const all = () => [...mats.values()];
  const flash = (v) => { for (const m of mats.values()) if (m.emissive) { m.emissive.setRGB(v * 0.9, v * 0.25, v * 0.2); } };
  const dispose = () => { for (const g of geos) g.dispose(); for (const m of mats.values()) m.dispose(); };
  return { mat, geo, box, cone, cyl, sph, pivot, all, flash, dispose };
}
function finish(K, root, extra) {
  return { root, parts: {}, height: 1.5, radius: 0.5, setElite() {}, setTint(c, strong) { void c; void strong; }, setHitFlash: K.flash, dispose: K.dispose, ...extra };
}
function dying(root, state, dt, t) {
  // death: fall over on the side and sink a little
  const k = clamp(t / 0.6, 0, 1);
  root.rotation.z = damp(root.rotation.z, k * 1.45, 8, dt);
  root.position.y = -0.08 * k;
}

// ================================================================================================ Dune Maw (burrowing worm)
export function createDuneMawModel(o = {}) {
  const K = kit(), root = new THREE.Group();
  const seed = o.seed || 1, tone = [0xa88a60, 0xb69466, 0x9c7c52][seed % 3];
  const skin = K.mat(tone), belly = K.mat(0xd8c08a), dark = K.mat(0x2a1a14), tooth = K.mat(0xf2ead2);
  const body = K.pivot(root);
  const N = 8, segs = [];
  for (let i = 0; i < N; i++) {
    const r = lerp(0.95, 0.42, i / (N - 1));
    const g = K.pivot(body);
    const m = new THREE.Mesh(K.geo(new THREE.CylinderGeometry(r, r * 1.05, 0.9, 8)), i % 2 ? skin : belly);
    m.rotation.x = PI / 2; g.add(m);
    segs.push({ g, r });
  }
  // head: two jaw halves ringed with teeth + a dark throat
  const head = segs[0].g;
  const jawU = K.pivot(head, 0, 0, 0.5), jawL = K.pivot(head, 0, 0, 0.5);
  K.box(jawU, tone, 1.6, 0.5, 0.8, 0, 0.35, 0.15); K.box(jawL, tone, 1.6, 0.5, 0.8, 0, -0.35, 0.15);
  K.box(head, 0x1a0c0a, 1.1, 0.8, 0.5, 0, 0, 0.7);
  for (let i = 0; i < 6; i++) { const x = -0.62 + i * 0.25; K.cone(jawU, 0xf2ead2, 0.08, 0.32, x, 0.0, 0.5, { rx: PI, seg: 4 }); K.cone(jawL, 0xf2ead2, 0.08, 0.32, x, 0.0, 0.5, { seg: 4 }); }
  for (const sx of [-1, 1]) K.box(head, 0xff9a30, 0.16, 0.16, 0.06, sx * 0.55, 0.62, 0.62, { basic: true });
  // sand mound (always there: the tell while hidden)
  const mound = new THREE.Mesh(K.geo(new THREE.ConeGeometry(1.7, 0.8, 9)), K.mat(0xd9be86)); mound.position.y = 0.22; root.add(mound);
  const ring = new THREE.Mesh(K.geo(new THREE.RingGeometry(1.4, 2.4, 14)), K.mat(0xe2c890, { basic: true, opacity: 0.45, side: THREE.DoubleSide })); ring.rotation.x = -PI / 2; ring.position.y = 0.08; root.add(ring);
  let emerge = 0, bite = 0, shake = 0, dead = 0;
  const update = (dt, a) => {
    const st = a.state, t = a.t || 0, time = a.time || 0;
    const target = st === 'emerge' || st === 'attack' ? 1 : st === 'exposed' ? 0.85 : st === 'rumble' ? 0.14 : st === 'dead' ? 0.3 : 0;
    emerge = damp(emerge, target, st === 'attack' || st === 'emerge' ? 9 : 4, dt);
    bite = damp(bite, st === 'attack' ? 1 : 0, 14, dt);
    shake = damp(shake, st === 'rumble' ? 1 : 0, 6, dt);
    dead = damp(dead, st === 'dead' ? 1 : 0, 3, dt);
    const Hh = 3.0 * emerge * (1 - 0.6 * dead);
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1), g = segs[i].g;
      const arch = Math.pow(1 - s, 1.35);
      g.position.set(Math.sin(time * 1.4 + i * 0.7) * 0.12 * emerge, Hh * arch - 1.7 * (1 - emerge) - 0.12 * i * (1 - emerge), -s * 3.6 * (0.35 + 0.65 * emerge));
      g.rotation.x = -0.9 * arch * emerge * (1 - s) + bite * 0.5 * (i === 0 ? 1 : 0);
    }
    head.rotation.x = 0.35 * emerge + bite * 0.45;
    jawU.rotation.x = -(0.35 + 0.5 * Math.sin(time * 6) * 0.15) * emerge - bite * 0.3 * Math.sin(clamp(t * 6, 0, PI));
    jawL.rotation.x = (0.35 + 0.5 * Math.sin(time * 6) * 0.15) * emerge + bite * 0.3 * Math.sin(clamp(t * 6, 0, PI));
    mound.scale.setScalar(1 + 0.2 * shake * Math.sin(time * 30) - 0.5 * emerge);
    mound.visible = emerge < 0.85;
    ring.visible = emerge < 0.5; ring.scale.setScalar(1 + 0.15 * Math.sin(time * 3) + shake * 0.4);
    root.position.x = shake * Math.sin(time * 40) * 0.05;
  };
  return finish(K, root, { parts: { head, mound }, height: 3.2, radius: 1.1, update });
}

// ================================================================================================ quadruped rig (Tusked Beast, Dusk Prowler)
function quadruped(K, root, c) {
  const body = K.pivot(root, 0, c.legH, 0);
  K.box(body, c.fur, c.bw, c.bh, c.bl, 0, c.bh / 2, 0);
  if (c.hump) K.box(body, c.fur2, c.bw * 0.9, c.bh * 0.55, c.bl * 0.4, 0, c.bh + c.bh * 0.2, c.bl * 0.15);
  K.box(body, c.fur2, c.bw * 0.5, c.bh * 0.5, c.bl * 0.5, 0, c.bh * 0.35, -c.bl * 0.45);                   // haunch
  const neck = K.pivot(body, 0, c.bh * 0.62, c.bl * 0.45);
  const head = K.pivot(neck, 0, 0, c.bl * 0.15);
  K.box(neck, c.fur2, c.hw * 0.75, c.hw * 0.75, c.bl * 0.3, 0, 0, c.bl * 0.08);
  K.box(head, c.fur, c.hw, c.hw, c.hl, 0, 0, c.hl * 0.35);
  K.box(head, c.snout, c.hw * 0.6, c.hw * 0.45, c.hl * 0.45, 0, -c.hw * 0.15, c.hl * 0.7);
  for (const sx of [-1, 1]) K.box(head, c.eye, 0.09, 0.09, 0.05, sx * c.hw * 0.3, c.hw * 0.15, c.hl * 0.55, { basic: true });
  if (c.tusks) for (const sx of [-1, 1]) { K.cone(head, 0xf2ead2, 0.11, 0.9, sx * c.hw * 0.42, -c.hw * 0.3, c.hl * 0.85, { rx: -0.9, rz: sx * 0.25, seg: 5 }); K.cone(head, 0xf2ead2, 0.07, 0.5, sx * c.hw * 0.45, -c.hw * 0.05, c.hl * 0.95, { rx: -1.3, rz: sx * 0.35, seg: 4 }); }
  if (c.ears) for (const sx of [-1, 1]) K.cone(head, c.fur2, 0.11, 0.34, sx * c.hw * 0.4, c.hw * 0.62, c.hl * 0.1, { rz: sx * -0.3, seg: 4 });
  if (c.spine) for (let i = 0; i < 6; i++) K.cone(body, c.spine, 0.08, 0.3, 0, c.bh + 0.12, -c.bl * 0.4 + i * (c.bl * 0.75 / 5), { seg: 4 });
  const tail = K.pivot(body, 0, c.bh * 0.7, -c.bl * 0.5);
  K.box(tail, c.fur2, 0.14, 0.14, c.tail, 0, 0, -c.tail / 2);
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hip = K.pivot(body, sx * c.bw * 0.38, 0.05, sz * c.bl * 0.34);
    K.box(hip, c.fur2, c.lw, c.legH, c.lw, 0, -c.legH / 2, 0);
    K.box(hip, c.hoof, c.lw * 1.15, 0.12, c.lw * 1.25, 0, -c.legH + 0.03, 0.02);
    legs.push(hip);
  }
  return { body, neck, head, tail, legs };
}
function animateQuad(rig, c, dt, a, st) {
  const sp = a.speed || 0, time = a.time || 0;
  const gait = st.charge ? 11 : st.run ? 8 : 4;
  st.ph += dt * gait * clamp(sp / 3 + 0.25, 0.2, 2.4) * (sp > 0.25 ? 1 : 0);
  const amp = sp > 0.25 ? (st.run ? 0.75 : 0.45) : 0;
  rig.legs.forEach((l, i) => { const off = (i === 0 || i === 3) ? 0 : PI; l.rotation.x = damp(l.rotation.x, Math.sin(st.ph + off) * amp, 20, dt); });
  rig.body.position.y = damp(rig.body.position.y, c.legH + (st.run ? Math.abs(Math.sin(st.ph)) * 0.09 : Math.sin(time * 1.4) * 0.012), 20, dt);
  rig.tail.rotation.x = 0.4 + Math.sin(time * (st.run ? 9 : 2)) * 0.15;
  rig.neck.rotation.x = damp(rig.neck.rotation.x, st.neck, 8, dt);
  rig.head.rotation.x = damp(rig.head.rotation.x, st.head, 8, dt);
}

// ================================================================================================ Tusked Beast
export function createTuskBeastModel(o = {}) {
  const K = kit(), root = new THREE.Group(), seed = o.seed || 1;
  const pal = [[0x6a5a48, 0x4a3e30], [0x7a6650, 0x54463a], [0x5a5248, 0x3e382f]][seed % 3];
  const cfg = { legH: 0.85, bw: 1.35, bh: 1.05, bl: 2.1, lw: 0.34, hw: 0.8, hl: 0.95, tail: 0.7, fur: pal[0], fur2: pal[1], snout: 0x8a7860, hoof: 0x231d18, eye: 0xffb030, tusks: true, hump: true };
  const rig = quadruped(K, root, cfg);
  const st = { ph: 0, neck: 0, head: 0, run: false, charge: false };
  const update = (dt, a) => {
    const s = a.state, t = a.t || 0;
    st.run = s === 'run' || s === 'attack' || s === 'charge'; st.charge = s === 'charge' || s === 'attack';
    st.neck = s === 'windup' || s === 'scrape' ? 0.55 : s === 'charge' || s === 'attack' ? 0.35 : s === 'graze' ? 0.75 : 0.05;
    st.head = s === 'windup' || s === 'scrape' ? 0.4 + Math.sin(t * 30) * 0.06 : s === 'charge' || s === 'attack' ? 0.25 : s === 'graze' ? 0.4 : 0;
    if (s === 'windup' || s === 'scrape') rig.legs[0].rotation.x = -0.9 + Math.sin(t * 22) * 0.5;   // paws the ground
    animateQuad(rig, cfg, dt, a, st);
    if (s === 'windup' || s === 'scrape') rig.legs[0].rotation.x = -0.9 + Math.sin(t * 22) * 0.5;
    if (s === 'stunned') { rig.head.rotation.z = Math.sin((a.time || 0) * 10) * 0.25; } else rig.head.rotation.z = 0;
    if (s === 'dead') dying(root, s, dt, t); else { root.rotation.z = damp(root.rotation.z, 0, 8, dt); root.position.y = 0; }
  };
  return finish(K, root, { parts: { head: rig.head }, height: 1.95, radius: 0.9, update });
}

// ================================================================================================ Dusk Prowler (night pack hunter)
export function createProwlerModel(o = {}) {
  const K = kit(), root = new THREE.Group(), seed = o.seed || 1;
  const pal = [[0x2c2a34, 0x1c1a22], [0x33303a, 0x211f27]][seed % 2];
  const cfg = { legH: 0.72, bw: 0.62, bh: 0.62, bl: 1.5, lw: 0.17, hw: 0.5, hl: 0.75, tail: 0.9, fur: pal[0], fur2: pal[1], snout: 0x3c3844, hoof: 0x121016, eye: 0xfff0a0, ears: true, spine: 0x6a5a86 };
  const rig = quadruped(K, root, cfg);
  const st = { ph: 0, neck: 0, head: 0, run: false, charge: false };
  const update = (dt, a) => {
    const s = a.state, t = a.t || 0;
    st.run = s === 'run' || s === 'attack'; st.charge = s === 'attack';
    st.neck = s === 'stalk' ? 0.45 : s === 'howl' ? -0.5 : s === 'attack' ? 0.3 : 0;
    st.head = s === 'howl' ? -0.6 : s === 'stalk' ? 0.25 : 0;
    animateQuad(rig, cfg, dt, a, st);
    if (s === 'attack') rig.body.rotation.x = -0.25 * Math.sin(clamp(t * 5, 0, PI)); else rig.body.rotation.x = damp(rig.body.rotation.x, 0, 10, dt);
    if (s === 'dead') dying(root, s, dt, t); else { root.rotation.z = damp(root.rotation.z, 0, 8, dt); root.position.y = 0; }
  };
  return finish(K, root, { parts: { head: rig.head }, height: 1.25, radius: 0.55, update });
}

// ================================================================================================ humanoid rig (raider, aliens)
function humanoid(K, root, c) {
  const hip = K.pivot(root, 0, c.legL, 0);
  const torso = K.pivot(hip, 0, 0, 0);
  K.box(torso, c.robe, c.tw, c.th, c.td, 0, c.th / 2, 0);
  if (c.skirt) K.cone(hip, c.robe, c.tw * 0.85, c.legL + 0.1, 0, -c.legL / 2 + 0.05, 0, { seg: 6 });
  const neck = K.pivot(torso, 0, c.th, 0);
  const head = K.pivot(neck, 0, 0.02, 0);
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = K.pivot(torso, sx * (c.tw / 2 + 0.06), c.th * 0.9, 0);
    K.box(sh, c.sleeve || c.robe, 0.14, c.armL, 0.14, 0, -c.armL / 2, 0);
    K.box(sh, c.skin, 0.12, 0.12, 0.12, 0, -c.armL - 0.05, 0);
    arms.push(sh);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const lg = K.pivot(hip, sx * c.tw * 0.25, 0, 0);
    K.box(lg, c.pants, 0.18, c.legL, 0.2, 0, -c.legL / 2, 0);
    K.box(lg, c.boot, 0.2, 0.1, 0.3, 0, -c.legL + 0.05, 0.05);
    legs.push(lg);
  }
  return { hip, torso, neck, head, arms, legs };
}
function animateHuman(rig, c, dt, a, st) {
  const sp = a.speed || 0, time = a.time || 0;
  st.ph += dt * clamp(sp * 2.2, 0, 16) * (sp > 0.2 ? 1 : 0);
  const amp = sp > 0.2 ? clamp(sp / 4, 0.2, 0.9) : 0;
  rig.legs[0].rotation.x = damp(rig.legs[0].rotation.x, Math.sin(st.ph) * amp, 20, dt);
  rig.legs[1].rotation.x = damp(rig.legs[1].rotation.x, -Math.sin(st.ph) * amp, 20, dt);
  rig.hip.position.y = c.legL + (sp > 0.2 ? Math.abs(Math.sin(st.ph)) * 0.05 : Math.sin(time * 1.6) * 0.008);
  rig.torso.rotation.x = damp(rig.torso.rotation.x, st.lean, 10, dt);
  rig.head.rotation.y = damp(rig.head.rotation.y, st.look, 6, dt);
  rig.arms[0].rotation.x = damp(rig.arms[0].rotation.x, st.armL ?? -Math.sin(st.ph) * amp * 0.8, 14, dt);
  rig.arms[1].rotation.x = damp(rig.arms[1].rotation.x, st.armR ?? Math.sin(st.ph) * amp * 0.8, 14, dt);
  rig.arms[0].rotation.z = damp(rig.arms[0].rotation.z, st.zL ?? 0.06, 12, dt);
  rig.arms[1].rotation.z = damp(rig.arms[1].rotation.z, st.zR ?? -0.06, 12, dt);
}

// ================================================================================================ Scavenger Raider (hooded, blaster carbine)
export function createScavRaiderModel(o = {}) {
  const K = kit(), root = new THREE.Group(), seed = o.seed || 1;
  const cloth = [0x8c7050, 0x6e5a44, 0x7a6a56, 0x5c5040][seed % 4];
  const c = { legL: 0.82, tw: 0.5, th: 0.62, td: 0.3, robe: cloth, sleeve: cloth, skin: 0x3a2e26, pants: 0x4a3c30, boot: 0x241a14, armL: 0.62, skirt: true };
  const rig = humanoid(K, root, c);
  // hood + face slit with two glowing eyes + goggles
  K.box(rig.head, cloth, 0.42, 0.44, 0.42, 0, 0.23, 0);
  K.cone(rig.head, cloth, 0.28, 0.32, 0, 0.52, -0.02, { seg: 4, ry: PI / 4 });
  K.box(rig.head, 0x100a08, 0.3, 0.2, 0.06, 0, 0.22, 0.2);
  for (const sx of [-1, 1]) K.box(rig.head, 0xff5a2a, 0.07, 0.05, 0.04, sx * 0.08, 0.24, 0.235, { basic: true });
  K.box(rig.torso, 0x2a1e18, 0.56, 0.1, 0.34, 0, 0.42, 0);                                     // bandolier
  K.box(rig.torso, 0x3a2c22, 0.52, 0.08, 0.34, 0, 0.12, 0, { rz: 0.0 });
  // carbine held in the right hand
  const gun = K.pivot(rig.arms[1], 0, -0.66, 0.05);
  K.box(gun, 0x2c2e34, 0.08, 0.12, 0.7, 0, 0, 0.3); K.box(gun, 0x6a3a1c, 0.06, 0.1, 0.24, 0, -0.04, -0.12); K.box(gun, 0x9a9ea6, 0.05, 0.05, 0.3, 0, 0.03, 0.72);
  const muzzle = K.box(gun, 0xff4a20, 0.12, 0.12, 0.12, 0, 0.03, 0.9, { basic: true, additive: true, opacity: 0.0 });
  const st = { ph: 0, lean: 0, look: 0 };
  const update = (dt, a) => {
    const s = a.state, t = a.t || 0, time = a.time || 0;
    st.look = Math.sin(time * 0.7 + (o.seed || 0)) * (s === 'idle' ? 0.5 : 0.15);
    st.lean = s === 'run' ? 0.25 : s === 'aim' ? -0.08 : 0;
    st.armR = s === 'aim' || s === 'attack' ? -1.45 : s === 'reload' ? -0.9 : undefined;
    st.armL = s === 'aim' || s === 'attack' ? -1.25 : s === 'reload' ? -0.8 + Math.sin(t * 12) * 0.15 : undefined;
    st.zR = s === 'aim' || s === 'attack' ? 0.0 : undefined; st.zL = s === 'aim' || s === 'attack' ? 0.3 : undefined;
    animateHuman(rig, c, dt, a, st);
    muzzle.material.opacity = s === 'attack' && t < 0.12 ? 0.9 : 0;
    if (s === 'dead') dying(root, s, dt, t); else { root.rotation.z = damp(root.rotation.z, 0, 8, dt); root.position.y = 0; }
  };
  return finish(K, root, { parts: { head: rig.head }, height: 1.85, radius: 0.42, update });
}

// ================================================================================================ Cantina Alien (neutral patrons, seed = species)
export const ALIEN_SPECIES = ['Bulbhead', 'Trinocular', 'Long-snout', 'Fourarm', 'Frillneck'];
export function createAlienModel(o = {}) {
  const K = kit(), root = new THREE.Group(), seed = Math.abs(o.seed || 1), sp = seed % 5;
  const skins = [[0x7ab89a, 0x3a5a4a], [0xb08adf, 0x5a3a7a], [0xd89a6a, 0x7a4a2a], [0x6aa0d8, 0x2a4a7a], [0xd8d06a, 0x6a6a2a]][sp];
  const robeCols = [0x8a3a3a, 0x3a5a8a, 0x5a7a3a, 0x8a6a2a, 0x6a3a7a, 0x2a2a30];
  const tall = [1.0, 1.12, 0.92, 1.28, 1.02][sp];
  const c = { legL: 0.78 * tall, tw: sp === 3 ? 0.72 : 0.46, th: 0.62 * tall, td: 0.28, robe: robeCols[(seed >> 3) % robeCols.length], sleeve: skins[0], skin: skins[0], pants: skins[1], boot: 0x2a2018, armL: 0.6 * tall, skirt: sp === 4 };
  const rig = humanoid(K, root, c);
  const skin = skins[0];
  if (sp === 0) { K.sph(rig.head, skin, 0.32, 0, 0.32, 0, { sy: 1.25, w: 8, h: 6 }); for (const sx of [-1, 1]) K.sph(rig.head, 0x101010, 0.07, sx * 0.13, 0.36, 0.26, { w: 5, h: 4 }); }
  else if (sp === 1) { K.box(rig.head, skin, 0.34, 0.4, 0.32, 0, 0.22, 0); for (const sx of [-1, 0, 1]) K.sph(rig.head, 0xfff0d0, 0.07, sx * 0.1, 0.3 + (sx === 0 ? 0.08 : 0), 0.17, { w: 5, h: 4 }); K.box(rig.head, 0x2a1a20, 0.16, 0.05, 0.05, 0, 0.1, 0.17); }
  else if (sp === 2) { K.box(rig.head, skin, 0.3, 0.32, 0.3, 0, 0.2, 0); K.box(rig.head, skins[1], 0.2, 0.2, 0.5, 0, 0.14, 0.32); for (const sx of [-1, 1]) K.cone(rig.head, skin, 0.09, 0.34, sx * 0.22, 0.4, -0.05, { rz: -sx * 0.5, seg: 4 }); K.box(rig.head, 0x101010, 0.05, 0.05, 0.05, -0.1, 0.28, 0.18); K.box(rig.head, 0x101010, 0.05, 0.05, 0.05, 0.1, 0.28, 0.18); }
  else if (sp === 3) { K.box(rig.head, skin, 0.4, 0.38, 0.36, 0, 0.2, 0); for (const sx of [-1, 1]) { K.cone(rig.head, 0xf2ead2, 0.06, 0.3, sx * 0.14, 0.02, 0.2, { rx: -0.6, seg: 4 }); K.box(rig.head, 0xffa040, 0.08, 0.05, 0.04, sx * 0.1, 0.28, 0.19, { basic: true }); }
    const a3 = K.pivot(rig.torso, 0.4, 0.4, 0); K.box(a3, skin, 0.13, 0.5, 0.13, 0, -0.25, 0); const a4 = K.pivot(rig.torso, -0.4, 0.4, 0); K.box(a4, skin, 0.13, 0.5, 0.13, 0, -0.25, 0); a3.rotation.z = -0.5; a4.rotation.z = 0.5; }
  else { K.box(rig.head, skin, 0.3, 0.34, 0.3, 0, 0.2, 0); for (let i = -2; i <= 2; i++) K.cone(rig.head, skins[1], 0.06, 0.34, i * 0.09, 0.42, -0.1, { rx: -0.4, rz: i * 0.15, seg: 4 }); K.box(rig.head, 0x101010, 0.05, 0.05, 0.05, -0.08, 0.24, 0.16); K.box(rig.head, 0x101010, 0.05, 0.05, 0.05, 0.08, 0.24, 0.16); }
  const st = { ph: 0, lean: 0, look: 0 };
  const update = (dt, a) => {
    const s = a.state, t = a.t || 0, time = a.time || 0;
    st.look = Math.sin(time * 0.5 + seed) * 0.45;
    st.lean = s === 'angry' || s === 'attack' ? 0.25 : 0;
    st.armR = s === 'talk' ? -0.8 + Math.sin(time * 4 + seed) * 0.4 : s === 'attack' ? -1.2 : s === 'flee' ? -0.5 : s === 'drink' ? -1.6 : undefined;
    st.armL = s === 'talk' ? -0.3 + Math.sin(time * 3 + seed * 2) * 0.3 : s === 'attack' ? -1.0 : undefined;
    animateHuman(rig, c, dt, a, st);
    if (s === 'dead') dying(root, s, dt, t); else { root.rotation.z = damp(root.rotation.z, 0, 8, dt); root.position.y = 0; }
  };
  return finish(K, root, { parts: { head: rig.head }, height: 1.75 * tall, radius: 0.42, update });
}

// ================================================================================================ merged fauna geometry (instanced, cosmetic)
function mergeColored(list) {
  const geos = list.map((b) => {
    const g = new THREE.BoxGeometry(b.sx, b.sy, b.sz);
    if (b.rx || b.ry || b.rz) g.rotateX(b.rx || 0), g.rotateY(b.ry || 0), g.rotateZ(b.rz || 0);
    g.translate(b.x, b.y, b.z);
    const ng = g.toNonIndexed(); g.dispose();
    const n = ng.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = b.c[0]; col[i * 3 + 1] = b.c[1]; col[i * 3 + 2] = b.c[2]; }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return ng;
  });
  let total = 0; for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); col.set(g.attributes.color.array, o); o += g.attributes.position.array.length; g.dispose(); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
const W = [1, 1, 1], D = [0.42, 0.4, 0.4], DK = [0.16, 0.15, 0.16];
/** grazer: tintable body (white vertex colours) with dark legs / muzzle. Legs are separate boxes swung by the renderer via 2 geometries. */
export function createGrazerGeometries() {
  const body = mergeColored([
    { x: 0, y: 0.72, z: 0, sx: 0.62, sy: 0.6, sz: 1.2, c: W },
    { x: 0, y: 0.98, z: 0.42, sx: 0.5, sy: 0.32, sz: 0.5, c: W },
    { x: 0, y: 1.05, z: 0.86, sx: 0.36, sy: 0.36, sz: 0.5, c: W },
    { x: 0, y: 0.98, z: 1.2, sx: 0.22, sy: 0.2, sz: 0.2, c: D },
    { x: -0.1, y: 1.32, z: 0.8, sx: 0.06, sy: 0.3, sz: 0.06, c: D, rz: 0.2 }, { x: 0.1, y: 1.32, z: 0.8, sx: 0.06, sy: 0.3, sz: 0.06, c: D, rz: -0.2 },
    { x: 0, y: 0.92, z: -0.7, sx: 0.1, sy: 0.1, sz: 0.4, c: D },
  ]);
  const leg = mergeColored([{ x: 0, y: -0.28, z: 0, sx: 0.13, sy: 0.56, sz: 0.13, c: DK }]);
  return { body, leg };
}
export function createFlyerGeometries() {
  const body = mergeColored([
    { x: 0, y: 0, z: 0, sx: 0.22, sy: 0.2, sz: 0.7, c: W }, { x: 0, y: 0.04, z: 0.42, sx: 0.16, sy: 0.16, sz: 0.2, c: W },
    { x: 0, y: 0.03, z: 0.55, sx: 0.06, sy: 0.05, sz: 0.16, c: [1, 0.7, 0.2] }, { x: 0, y: 0, z: -0.5, sx: 0.06, sy: 0.04, sz: 0.5, c: D },
  ]);
  const wing = mergeColored([{ x: 0.55, y: 0, z: 0, sx: 1.1, sy: 0.03, sz: 0.42, c: W }, { x: 1.2, y: 0, z: -0.05, sx: 0.5, sy: 0.02, sz: 0.28, c: D }]);
  return { body, wing };
}

// ================================================================================================ items: Plasma Blade, Blaster Pistol, Blaster Cell
const { anchor } = ModelKit;
/** Plasma Blade: grip at the origin, blade towards -Z, userData.tip. `setBladeColor(hex)` recolours the blade + glow (tier colours). */
export function createPlasmaBladeModel() {
  const root = new THREE.Group();
  const metal = new THREE.MeshLambertMaterial({ color: 0x9aa0aa, flatShading: true }), dark = new THREE.MeshLambertMaterial({ color: 0x1e2026, flatShading: true }), gold = new THREE.MeshLambertMaterial({ color: 0xc8a04a, flatShading: true });
  const add = (geo, m, x, y, z, rx = 0) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.x = rx; root.add(me); return me; };
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), dark, 0, 0, 0.06, PI / 2);                          // grip
  for (const z of [-0.02, 0.06, 0.14]) add(new THREE.CylinderGeometry(0.034, 0.034, 0.02, 8), metal, 0, 0, z, PI / 2);   // grip rings
  add(new THREE.CylinderGeometry(0.038, 0.032, 0.05, 8), gold, 0, 0, 0.22, PI / 2);                      // pommel
  add(new THREE.CylinderGeometry(0.045, 0.038, 0.09, 8), metal, 0, 0, -0.13, PI / 2);                     // emitter housing
  add(new THREE.BoxGeometry(0.034, 0.03, 0.05), gold, 0, 0.038, 0.02);                                     // activator plate
  const btn = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.02), new THREE.MeshBasicMaterial({ color: 0xff3030 })); btn.position.set(0, 0.056, 0.02); root.add(btn);
  const bladeMat = new THREE.MeshBasicMaterial({ color: 0x35e0ff }), coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
  const L = 0.98;
  const blade = add(new THREE.CylinderGeometry(0.02, 0.02, L, 8), bladeMat, 0, 0, -0.18 - L / 2, PI / 2);
  add(new THREE.SphereGeometry(0.02, 8, 6), bladeMat, 0, 0, -0.18 - L);
  const core = add(new THREE.CylinderGeometry(0.009, 0.009, L * 0.98, 6), coreMat, 0, 0, -0.18 - L / 2, PI / 2);
  const glow = add(new THREE.CylinderGeometry(0.055, 0.055, L * 1.02, 10), glowMat, 0, 0, -0.18 - L / 2, PI / 2);
  add(new THREE.SphereGeometry(0.055, 8, 6), glowMat, 0, 0, -0.18 - L);
  root.userData.blade = { blade, core, glow };
  root.userData.setBladeColor = (hex) => { bladeMat.color.setHex(hex); glowMat.color.setHex(hex); };
  root.userData.tip = anchor(root, 'tip', [0, 0, -0.18 - L]);
  root.userData.kind = 'weapon';
  return root;
}

export function createBlasterModel() {
  const root = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: 0x8a909a, flatShading: true }), dark = new THREE.MeshLambertMaterial({ color: 0x20232a, flatShading: true }), brass = new THREE.MeshLambertMaterial({ color: 0xb08a48, flatShading: true });
  const box = (m, sx, sy, sz, x, y, z, rx = 0) => { const me = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); me.position.set(x, y, z); me.rotation.x = rx; root.add(me); return me; };
  box(dark, 0.04, 0.08, 0.2, 0, 0.01, -0.05);                                    // receiver
  box(steel, 0.034, 0.05, 0.22, 0, 0.03, -0.24);                                 // barrel shroud
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 6), steel); bar.rotation.x = PI / 2; bar.position.set(0, 0.03, -0.42); root.add(bar);
  box(dark, 0.035, 0.11, 0.05, 0, -0.08, 0.04, -0.25);                           // grip
  box(brass, 0.045, 0.03, 0.09, 0, 0.065, -0.02);                                // top brass fitting
  box(steel, 0.02, 0.03, 0.02, 0, 0.1, -0.16);                                   // sight
  const cell = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.1), new THREE.MeshBasicMaterial({ color: 0xff3a2a })); cell.position.set(0, 0.0, -0.12); root.add(cell);
  root.userData.tip = anchor(root, 'tip', [0, 0.03, -0.5]);
  root.userData.kind = 'weapon';
  return root;
}
export function createBlasterCellModel() {
  const root = new THREE.Group();
  const shell = new THREE.MeshLambertMaterial({ color: 0x3a3f4a, flatShading: true }), glow = new THREE.MeshBasicMaterial({ color: 0xff5a30 });
  for (const x of [-0.04, 0.04]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), shell); c.position.set(x, 0, 0); root.add(c);
    const g = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 6), glow); g.position.set(x, 0.02, 0); root.add(g);
  }
  return root;
}

export const W2_CREATURE_MODELS = {
  dunemaw: (o) => createDuneMawModel(o), tuskbeast: (o) => createTuskBeastModel(o), scavraider: (o) => createScavRaiderModel(o),
  alien_npc: (o) => createAlienModel(o), prowler: (o) => createProwlerModel(o),
};
export const W2_ITEM_MODELS = { plasmablade: createPlasmaBladeModel, blaster: createBlasterModel, blastercell: createBlasterCellModel };
void lerp;
