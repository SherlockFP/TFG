// MAPS5 (wave 4) - procedural models: the Hedge Warden (Estate 9), the Cryo Sleeper (Cold Storage) and five scrap items (Topiary Heart, Master Ledger,
// Cryo Core, Golden Shears, Frost Film Reel). Creature model contract (entities/creatures.js CreatureView): { root, parts, height, radius,
// update(dt, {state, speed, t, time, progress}), setElite, setHitFlash, setTint, dispose }, origin at the feet, facing +Z, metres, per-instance
// materials (hit flash never leaks). Glowing parts are MeshBasic materials (no scene lights).
import * as THREE from 'three';

const PI = Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

function kit() {
  const mats = new Map(), geos = [];
  const mat = (c, o = {}) => {
    const key = c + '|' + (o.basic ? 'b' : 'l') + (o.opacity ?? '');
    let m = mats.get(key);
    if (!m) {
      m = o.basic ? new THREE.MeshBasicMaterial({ color: c, transparent: o.opacity != null, opacity: o.opacity ?? 1, depthWrite: o.opacity == null })
        : new THREE.MeshLambertMaterial({ color: c, flatShading: true });
      m.userData.instance = true;
      mats.set(key, m);
    }
    return m;
  };
  const geo = (g) => { geos.push(g); return g; };
  const put = (parent, g, m, x, y, z, o = {}) => { const mesh = new THREE.Mesh(geo(g), m); mesh.position.set(x, y, z); if (o.rx || o.ry || o.rz) mesh.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0); parent.add(mesh); return mesh; };
  const box = (parent, c, sx, sy, sz, x = 0, y = 0, z = 0, o = {}) => put(parent, new THREE.BoxGeometry(sx, sy, sz), mat(c, o), x, y, z, o);
  const cone = (parent, c, r, h, x, y, z, o = {}) => put(parent, new THREE.ConeGeometry(r, h, o.seg || 5), mat(c, o), x, y, z, o);
  const cyl = (parent, c, rt, rb, h, x, y, z, o = {}) => put(parent, new THREE.CylinderGeometry(rt, rb, h, o.seg || 6), mat(c, o), x, y, z, o);
  const sph = (parent, c, r, x, y, z, o = {}) => { const m = put(parent, new THREE.SphereGeometry(r, o.w || 7, o.h || 5), mat(c, o), x, y, z, o); if (o.sx || o.sy || o.sz) m.scale.set(o.sx || 1, o.sy || 1, o.sz || 1); return m; };
  const pivot = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const flash = (v) => { for (const m of mats.values()) if (m.emissive) m.emissive.setRGB(v * 0.9, v * 0.25, v * 0.2); };
  const dispose = () => { for (const g of geos) g.dispose(); for (const m of mats.values()) m.dispose(); };
  return { mat, box, cone, cyl, sph, pivot, flash, dispose };
}
const finish = (K, root, extra) => ({ root, parts: {}, height: 1.5, radius: 0.5, setElite() {}, setTint() {}, setHitFlash: K.flash, dispose: K.dispose, ...extra });

// ================================================================================================ Hedge Warden
export function createWardenModel(o = {}) {
  const K = kit(), root = new THREE.Group();
  const seed = o.seed || 1, L1 = [0x2f5a2a, 0x2a5228][seed % 2], L2 = 0x3b6b32, L3 = 0x244a22;
  const hip = K.pivot(root, 0, 0.9, 0);
  K.cone(hip, L3, 0.62, 1.0, 0, -0.42, 0, { seg: 7 });                                 // the hedge skirt
  const legs = [];
  for (const s of [-1, 1]) { const lg = K.pivot(hip, s * 0.2, 0, 0); K.box(lg, L1, 0.26, 0.9, 0.3, 0, -0.45, 0); legs.push(lg); }
  const torso = K.pivot(hip, 0, 0, 0);
  K.box(torso, L1, 0.78, 0.95, 0.46, 0, 0.5, 0);
  K.sph(torso, L2, 0.34, -0.42, 0.88, 0, { sy: 0.8 }); K.sph(torso, L2, 0.34, 0.42, 0.88, 0, { sy: 0.8 });   // shoulders
  for (let i = 0; i < 6; i++) K.sph(torso, i % 2 ? L2 : L3, 0.2, ((i % 3) - 1) * 0.28, 0.3 + Math.floor(i / 3) * 0.5, 0.2, { sy: 0.8 });   // leafy lumps on the chest
  const neck = K.pivot(torso, 0, 1.0, 0);
  K.sph(neck, L2, 0.3, 0, 0.26, 0);
  const eyes = [];
  for (const s of [-1, 1]) eyes.push(K.box(neck, 0x554400, 0.1, 0.07, 0.05, s * 0.11, 0.3, 0.27, { basic: true }));
  K.cyl(neck, 0xc8a860, 0.52, 0.52, 0.04, 0, 0.5, 0, { seg: 9 }); K.cyl(neck, 0xc8a860, 0.28, 0.32, 0.22, 0, 0.62, 0, { seg: 8 });   // straw hat
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = K.pivot(torso, s * 0.5, 0.92, 0);
    K.box(sh, L1, 0.17, 0.75, 0.17, 0, -0.38, 0);
    K.sph(sh, L2, 0.13, 0, -0.78, 0);
    arms.push(sh);
  }
  // shears: two blades crossed at the pivot, held by the right hand
  const shears = K.pivot(arms[1], 0, -0.8, 0.1);
  const blades = [K.box(shears, 0xc4ccd4, 0.05, 0.95, 0.02, 0, 0.42, 0.05), K.box(shears, 0xa8b0b8, 0.05, 0.95, 0.02, 0, 0.42, -0.05)];
  K.box(shears, 0x6a4a2a, 0.06, 0.28, 0.06, 0, -0.1, 0);
  let ph = 0, snip = 0, dead = 0;
  const update = (dt, a) => {
    const s = a.state, t = a.t || 0, time = a.time || 0, sp = a.speed || 0;
    const awake = s !== 'statue' && s !== 'dead';
    const glow = s === 'statue' ? 0 : s === 'wake' ? clamp(t / 0.6, 0, 1) : 1;
    eyes.forEach((e) => e.material.color.setRGB(lerp(0.33, 1, glow), lerp(0.27, 0.82, glow), lerp(0, 0.1, glow)));
    ph += dt * clamp(sp * 2.4, 0, 14) * (sp > 0.2 ? 1 : 0);
    const amp = sp > 0.2 ? clamp(sp / 4, 0.2, 0.85) : 0;
    legs[0].rotation.x = damp(legs[0].rotation.x, Math.sin(ph) * amp, 20, dt);
    legs[1].rotation.x = damp(legs[1].rotation.x, -Math.sin(ph) * amp, 20, dt);
    hip.position.y = 0.9 + (sp > 0.2 ? Math.abs(Math.sin(ph)) * 0.05 : 0);
    let ax0 = -Math.sin(ph) * amp * 0.7, ax1 = Math.sin(ph) * amp * 0.7, lean = 0;
    if (s === 'statue') { ax0 = -0.9; ax1 = -0.9; }                                 // arms forward, shears held together: a topiary pose
    else if (s === 'wake') { const k = clamp(t / 1.3, 0, 1); ax0 = -0.9 - 1.1 * k; ax1 = -0.9 - 1.6 * k; }
    else if (s === 'windup') { ax0 = -2.0; ax1 = -2.7; lean = -0.15; }
    else if (s === 'attack') { const k = clamp(t / 0.25, 0, 1); ax0 = -2.0 + 1.6 * k; ax1 = -2.7 + 2.5 * k; lean = 0.3 * k; }
    else if (s === 'run') { lean = 0.22; }
    else if (s === 'stunned') { lean = 0.25; ax0 = ax1 = -0.2; }
    arms[0].rotation.x = damp(arms[0].rotation.x, ax0, 14, dt);
    arms[1].rotation.x = damp(arms[1].rotation.x, ax1, 14, dt);
    torso.rotation.x = damp(torso.rotation.x, lean, 10, dt);
    neck.rotation.y = s === 'stunned' ? Math.sin(time * 9) * 0.3 : damp(neck.rotation.y, 0, 6, dt);
    // shears clack while awake: open / close, faster in the wake / windup telegraph
    snip += dt * (s === 'wake' || s === 'windup' ? 16 : awake ? 4 : 0);
    const open = awake ? Math.sin(snip) * 0.35 + 0.2 : 0;
    blades[0].rotation.z = open; blades[1].rotation.z = -open;
    dead = damp(dead, s === 'dead' ? 1 : 0, 5, dt);
    root.rotation.z = dead * 1.45; root.position.y = -0.1 * dead;
  };
  return finish(K, root, { parts: { head: neck }, height: 2.3, radius: 0.6, update });
}

// ================================================================================================ Cryo Sleeper
export function createSleeperModel(o = {}) {
  const K = kit(), root = new THREE.Group();
  const seed = o.seed || 1, suit = [0x1e3448, 0x2a2e48, 0x243c40][seed % 3], skin = 0xcfe6f0;
  const hip = K.pivot(root, 0, 0.85, 0);
  const legs = [];
  for (const s of [-1, 1]) { const lg = K.pivot(hip, s * 0.14, 0, 0); K.box(lg, suit, 0.2, 0.85, 0.22, 0, -0.42, 0); K.box(lg, 0xdcecf4, 0.22, 0.06, 0.28, 0, -0.84, 0.03); legs.push(lg); }
  const torso = K.pivot(hip, 0, 0, 0);
  K.box(torso, suit, 0.5, 0.7, 0.28, 0, 0.36, 0);
  K.box(torso, 0xdcecf4, 0.52, 0.12, 0.3, 0, 0.62, 0);                                      // frost across the shoulders
  const head = K.pivot(torso, 0, 0.78, 0);
  K.sph(head, skin, 0.17, 0, 0.12, 0);
  const eyes = [];
  for (const s of [-1, 1]) eyes.push(K.box(head, 0x224466, 0.06, 0.04, 0.03, s * 0.06, 0.14, 0.15, { basic: true }));
  const arms = [];
  for (const s of [-1, 1]) { const sh = K.pivot(torso, s * 0.33, 0.66, 0); K.box(sh, suit, 0.13, 0.62, 0.13, 0, -0.3, 0); K.sph(sh, skin, 0.09, 0, -0.66, 0); arms.push(sh); }
  for (let i = 0; i < 5; i++) K.cone(torso, 0xbfe8ff, 0.05, 0.2 + (i % 3) * 0.08, ((i % 3) - 1) * 0.16, 0.4 + Math.floor(i / 3) * 0.3, 0.16, { rx: PI / 2 - 0.3, basic: true });   // ice shards growing out of the chest
  const shell = K.box(root, 0x9adcff, 0.95, 2.05, 0.75, 0, 1.03, 0, { basic: true, opacity: 0.42 });     // the ice block it is frozen in
  let ph = 0, dead = 0, shellK = 1;
  const update = (dt, a) => {
    const s = a.state, t = a.t || 0, time = a.time || 0, sp = a.speed || 0;
    const frozen = s === 'dormant';
    shellK = damp(shellK, frozen ? 1 : 0, s === 'thaw' ? 4 : 10, dt);
    shell.visible = shellK > 0.03; shell.scale.setScalar(0.9 + 0.35 * (1 - shellK)); shell.material.opacity = 0.42 * shellK;
    eyes.forEach((e) => e.material.color.setHex(frozen ? 0x224466 : 0x7fe8ff));
    ph += dt * clamp(sp * 1.6, 0, 10) * (sp > 0.2 ? 1 : 0);
    const amp = sp > 0.2 ? 0.4 : 0;
    legs[0].rotation.x = damp(legs[0].rotation.x, Math.sin(ph) * amp, 16, dt);
    legs[1].rotation.x = damp(legs[1].rotation.x, -Math.sin(ph) * amp, 16, dt);
    let ax0 = -Math.sin(ph) * 0.3, ax1 = Math.sin(ph) * 0.3, lean = 0.1;
    if (frozen) { ax0 = 0.15; ax1 = 0.15; lean = 0; }
    else if (s === 'thaw') { const k = clamp(t / 1.3, 0, 1); ax0 = 0.15 - 1.5 * k; ax1 = 0.15 - 1.5 * k; lean = 0; root.position.x = Math.sin(time * 40) * 0.03 * (1 - k); }
    else if (s === 'windup') { ax0 = -2.1; ax1 = -2.1; lean = -0.1; }
    else if (s === 'attack') { const k = clamp(t / 0.2, 0, 1); ax0 = ax1 = -2.1 + 1.9 * k; lean = 0.3 * k; }
    else if (s === 'run') { ax0 = ax1 = -1.35; lean = 0.2; }
    if (s !== 'thaw') root.position.x = damp(root.position.x, 0, 12, dt);
    arms[0].rotation.x = damp(arms[0].rotation.x, ax0, 12, dt);
    arms[1].rotation.x = damp(arms[1].rotation.x, ax1, 12, dt);
    torso.rotation.x = damp(torso.rotation.x, lean, 8, dt);
    head.rotation.z = s === 'stunned' ? Math.sin(time * 10) * 0.3 : damp(head.rotation.z, 0, 8, dt);
    dead = damp(dead, s === 'dead' ? 1 : 0, 6, dt);
    root.rotation.z = dead * 1.5; root.position.y = -0.1 * dead;
  };
  return finish(K, root, { parts: { head }, height: 1.95, radius: 0.5, update });
}

export const M5_CREATURE_MODELS = { m5warden: (o) => createWardenModel(o), m5sleeper: (o) => createSleeperModel(o) };

// ================================================================================================ items
function itemRoot(build) { const root = new THREE.Group(); build(root); return root; }
const lamb = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const bas = (c) => new THREE.MeshBasicMaterial({ color: c });
const add = (root, geo, mat, x = 0, y = 0, z = 0, r = null) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (r) m.rotation.set(r[0], r[1], r[2]); root.add(m); return m; };

export const M5_ITEM_MODELS = {
  m5_heart: () => itemRoot((r) => {                       // a heart carved from hedge: two lobes + a point, faint green glow
    const g = lamb(0x2f7a3a);
    add(r, new THREE.SphereGeometry(0.11, 7, 5), g, -0.075, 0.06, 0); add(r, new THREE.SphereGeometry(0.11, 7, 5), g, 0.075, 0.06, 0);
    add(r, new THREE.ConeGeometry(0.15, 0.22, 5), g, 0, -0.06, 0, [0, 0, PI]);
    add(r, new THREE.SphereGeometry(0.035, 6, 4), bas(0x9dffb0), 0, 0.02, 0.1);
  }),
  m5_ledger: () => itemRoot((r) => {                      // the Master Ledger: a fat book with a gold clasp
    add(r, new THREE.BoxGeometry(0.34, 0.09, 0.44), lamb(0x5a2a1e)); add(r, new THREE.BoxGeometry(0.31, 0.07, 0.41), lamb(0xe8dcc0), 0.01, 0, 0);
    add(r, new THREE.BoxGeometry(0.05, 0.1, 0.08), lamb(0xd8b030), 0.17, 0, 0.1); add(r, new THREE.BoxGeometry(0.2, 0.005, 0.26), bas(0xffd070), -0.02, 0.048, 0);
  }),
  m5_cryocore: () => itemRoot((r) => {                    // a frozen power cell: steel body, glowing cyan rings
    add(r, new THREE.CylinderGeometry(0.11, 0.11, 0.36, 8), lamb(0x6a7a88));
    for (const y of [-0.1, 0.02, 0.14]) add(r, new THREE.CylinderGeometry(0.118, 0.118, 0.035, 8), bas(0x5ae0ff), 0, y, 0);
    add(r, new THREE.ConeGeometry(0.09, 0.1, 6), lamb(0xdcecf4), 0, 0.23, 0);
  }),
  m5_shears: () => itemRoot((r) => {                      // golden garden shears
    const gold = lamb(0xd8b030);
    add(r, new THREE.BoxGeometry(0.03, 0.34, 0.012), lamb(0xe8d078), 0.02, 0.13, 0, [0, 0, 0.12]); add(r, new THREE.BoxGeometry(0.03, 0.34, 0.012), lamb(0xc8a838), -0.02, 0.13, 0, [0, 0, -0.12]);
    add(r, new THREE.TorusGeometry(0.05, 0.014, 4, 8), gold, 0.05, -0.08, 0); add(r, new THREE.TorusGeometry(0.05, 0.014, 4, 8), gold, -0.05, -0.08, 0);
  }),
  m5_frostfilm: () => itemRoot((r) => {                   // a film reel with a rime of frost
    add(r, new THREE.CylinderGeometry(0.16, 0.16, 0.035, 10), lamb(0x3a4854), 0, 0, 0, [PI / 2, 0, 0]);
    add(r, new THREE.CylinderGeometry(0.05, 0.05, 0.05, 6), lamb(0xdcecf4), 0, 0, 0, [PI / 2, 0, 0]);
    add(r, new THREE.CylinderGeometry(0.13, 0.13, 0.03, 10), bas(0x9adcff), 0, 0, 0.005, [PI / 2, 0, 0]).scale.set(1, 1, 0.5);
  }),
};
