// STEALTH wave 4 - procedural model of The Listener (creature model contract of entities/creatures.js CreatureView:
// { root, parts, height, radius, update(dt, {state, speed, t, time, progress}), setElite, setHitFlash, setTint, dispose }, origin at the feet, facing +Z).
// A tall, pale, eyeless thing: smooth blank face, two huge funnel ears that turn towards sound, long arms. Per-instance materials (hit flash never leaks).
import * as THREE from 'three';

const PI = Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

export function createListenerModel(o = {}) {
  const mats = new Map(), geos = [];
  const mat = (c, opt = {}) => {
    const key = c + (opt.basic ? 'b' : 'l') + (opt.side ?? '');
    let m = mats.get(key);
    if (!m) { m = opt.basic ? new THREE.MeshBasicMaterial({ color: c, side: opt.side ?? THREE.FrontSide }) : new THREE.MeshLambertMaterial({ color: c, flatShading: true, side: opt.side ?? THREE.FrontSide }); m.userData.instance = true; mats.set(key, m); }
    return m;
  };
  const geo = (g) => { geos.push(g); return g; };
  const box = (parent, c, sx, sy, sz, x = 0, y = 0, z = 0, opt = {}) => { const m = new THREE.Mesh(geo(new THREE.BoxGeometry(sx, sy, sz)), mat(c, opt)); m.position.set(x, y, z); if (opt.rx || opt.ry || opt.rz) m.rotation.set(opt.rx || 0, opt.ry || 0, opt.rz || 0); parent.add(m); return m; };
  const cone = (parent, c, r, h, x, y, z, opt = {}) => { const m = new THREE.Mesh(geo(new THREE.ConeGeometry(r, h, opt.seg || 7, 1, true)), mat(c, { side: THREE.DoubleSide })); m.position.set(x, y, z); if (opt.rx || opt.ry || opt.rz) m.rotation.set(opt.rx || 0, opt.ry || 0, opt.rz || 0); parent.add(m); return m; };
  const pivot = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

  const seed = o.seed || 1;
  const skin = [0xcfc8bc, 0xc4c0b6, 0xd6cec0][seed % 3], skin2 = 0xa9a294, dark = 0x1a1616, inner = 0x8a5a58;
  const root = new THREE.Group();
  const body = pivot(root, 0, 1.0, 0);
  // legs
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = pivot(body, sx * 0.17, 0, 0);
    box(hip, skin2, 0.15, 0.55, 0.17, 0, -0.28, 0);
    const knee = pivot(hip, 0, -0.55, 0);
    box(knee, skin2, 0.12, 0.5, 0.14, 0, -0.25, 0.03);
    box(knee, skin, 0.16, 0.06, 0.3, 0, -0.5, 0.1);
    legs.push({ hip, knee });
  }
  // torso (hunched) with a visible spine ridge
  const torso = pivot(body, 0, 0.05, 0);
  box(torso, skin, 0.5, 0.62, 0.3, 0, 0.36, 0);
  box(torso, skin2, 0.44, 0.24, 0.26, 0, 0.05, 0);
  for (let i = 0; i < 5; i++) box(torso, skin2, 0.07, 0.07, 0.07, 0, 0.12 + i * 0.13, -0.17);
  // arms: very long, knuckles nearly touch the floor
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = pivot(torso, sx * 0.34, 0.62, 0);
    box(sh, skin, 0.1, 0.55, 0.1, 0, -0.28, 0);
    const el = pivot(sh, 0, -0.55, 0);
    box(el, skin, 0.09, 0.55, 0.09, 0, -0.28, 0.02);
    box(el, skin2, 0.13, 0.16, 0.08, 0, -0.62, 0.03);
    for (let f = 0; f < 3; f++) box(el, dark, 0.02, 0.16, 0.02, (f - 1) * 0.04, -0.76, 0.04);
    arms.push({ sh, el });
  }
  // head: blank egg, no eyes, no nose, a thin slit that only opens to scream + two funnel ears
  const neck = pivot(torso, 0, 0.72, 0.02);
  const head = pivot(neck, 0, 0.12, 0.04);
  box(head, skin, 0.3, 0.42, 0.32, 0, 0.16, 0);
  box(head, skin2, 0.26, 0.08, 0.3, 0, 0.42, -0.02);
  const slit = box(head, dark, 0.16, 0.014, 0.02, 0, 0.0, 0.165);
  const ears = [];
  for (const sx of [-1, 1]) {
    const ear = pivot(head, sx * 0.19, 0.22, 0.02);
    cone(ear, skin, 0.27, 0.36, sx * 0.13, 0, 0.02, { rz: sx * -PI / 2, seg: 8 });
    cone(ear, inner, 0.18, 0.2, sx * 0.09, 0, 0.02, { rz: sx * -PI / 2, seg: 8 });
    ears.push({ ear, sx });
  }
  const tint = { base: null };
  let alertK = 0, runK = 0, crouchK = 0, atk = 0, deadK = 0, slump = 0;
  const update = (dt, a) => {
    dt = clamp(dt || 0, 0, 0.1);
    const st = a.state, time = a.time || 0, t = a.t || 0;
    const speed = a.speed ?? (st === 'hunt' || st === 'run' ? 8 : st === 'walk' || st === 'search' ? 1.6 : 0);
    alertK = damp(alertK, st === 'alert' ? 1 : st === 'inspect' ? 0.6 : 0, 10, dt);
    runK = damp(runK, st === 'hunt' || st === 'run' ? 1 : 0, 7, dt);
    crouchK = damp(crouchK, st === 'inspect' ? 1 : st === 'search' ? 0.55 : 0, 6, dt);
    atk = damp(atk, st === 'attack' ? Math.sin(clamp(t / 0.55, 0, 1) * PI) : 0, 20, dt);
    slump = damp(slump, st === 'stunned' ? 1 : 0, 6, dt);
    deadK = damp(deadK, st === 'dead' ? 1 : 0, 4, dt);
    const gait = time * (1.4 + speed * 0.9);
    const swing = clamp(speed / 6, 0, 1) * 0.9 + (speed > 0.3 ? 0.18 : 0);
    // legs
    for (let i = 0; i < 2; i++) {
      const ph = gait + i * PI, L = legs[i];
      L.hip.rotation.x = Math.sin(ph) * swing * (1 - crouchK * 0.4) - crouchK * 0.7;
      L.knee.rotation.x = Math.max(0, -Math.sin(ph + 0.6)) * swing * 1.1 + crouchK * 1.2;
    }
    // body: bob + lean
    body.position.y = 1.0 - crouchK * 0.42 - deadK * 0.9 + Math.abs(Math.sin(gait)) * 0.05 * clamp(speed / 3, 0, 1);
    torso.rotation.x = 0.28 + runK * 0.5 + crouchK * 0.7 + atk * 0.5 - alertK * 0.22 + slump * 0.5;
    torso.rotation.z = Math.sin(gait * 0.5) * 0.05 * clamp(speed / 3, 0, 1);
    // arms swing / reach
    for (let i = 0; i < 2; i++) {
      const A = arms[i], ph = gait + i * PI + PI;
      A.sh.rotation.x = Math.sin(ph) * swing * 0.7 - runK * 0.9 - atk * 2.0 + crouchK * 0.6;
      A.el.rotation.x = -0.25 - runK * 0.5 - atk * 0.9 - alertK * 0.3;
      A.sh.rotation.z = (i ? -1 : 1) * (0.08 + alertK * 0.2);
    }
    // head + ears: tilt and twitch while listening, swivel toward the sound (the host turns the whole body, the head adds the wobble)
    const listen = Math.max(alertK, crouchK * 0.7);
    neck.rotation.x = -0.28 - runK * 0.35 + listen * 0.1;
    head.rotation.z = Math.sin(time * 1.3) * 0.05 + listen * (0.28 + Math.sin(time * 5) * 0.06);
    head.rotation.y = Math.sin(time * 0.8) * 0.18 * (1 - runK) + Math.sin(time * 9) * 0.05 * alertK;
    for (const E of ears) {
      E.ear.rotation.y = E.sx * (0.15 + listen * 0.35 + Math.max(0, Math.sin(time * 3.1 + E.sx)) * 0.12 * (1 - runK));
      E.ear.rotation.z = Math.sin(time * 7 + E.sx * 2) * 0.05 * alertK;
    }
    slit.scale.y = 1 + atk * 24 + (st === 'hunt' ? 6 : 0);
    // death: fall backwards
    root.rotation.x = -deadK * 1.45;
    root.position.y = -0.05 * deadK;
  };
  const flash = (v) => { for (const m of mats.values()) if (m.emissive) m.emissive.setRGB(v * 0.9, v * 0.25, v * 0.2); };
  return {
    root, parts: { head, body, torso, ears: ears.map((e) => e.ear) }, height: 2.2, radius: 0.5, update,
    setElite() {}, setTint(c, strong) { void c; void strong; tint.base = c; }, setHitFlash: flash,
    dispose() { for (const g of geos) g.dispose(); for (const m of mats.values()) m.dispose(); },
  };
}
