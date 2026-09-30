// SWARM11 wave 11 - procedural PSX models: Scraper, Scraper Nest, The Streamer, AutoMod (docs/wave11/swarm11.md).
// Creature model contract of entities/creatures.js CreatureView: { root, parts, height, radius, update(dt, {state, speed, t, time, progress}), setElite, setHitFlash, setTint, dispose },
// origin at the feet, facing +Z. `progress` = the host's c.extra (a number):
//   Scraper   -            (parts.carry = the tray anchor: a carried item is attached here by the client)
//   Nest      0..1 heap fill (glow / size / beam), state 'alarm' = red siren, 'dead' = collapsed
//   Streamer  1 pristine ring .. 0 about to shatter, -1 broken ; state boot / live drive the ring light and the 30 m pulse rings
//   AutoMod   0..1 flag meter (lamp cyan -> amber -> red, blinking faster) ; in 'sweep' = sweep progress, in 'flag' = wind-up progress
// Original low-poly flat-shaded designs. Every glow is an emissive / basic material (fog off, not tone-mapped): NEVER a THREE light.
import * as THREE from 'three';

const PI = Math.PI, TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const PULSE_R = 30;   // = TUNE.live.radius (kept literal: the models never import game rules)

function kit() {
  const mats = [], geos = [], lam = [], extra = [];
  const L = (c, em = 0x000000) => { const m = new THREE.MeshLambertMaterial({ color: c, flatShading: true, emissive: em }); m.userData.instance = true; m.userData.em = new THREE.Color(em); mats.push(m); lam.push(m); return m; };
  const B = (c, o = {}) => { const m = new THREE.MeshBasicMaterial({ color: c, fog: false, toneMapped: false, ...o }); m.userData.instance = true; mats.push(m); return m; };
  const G = (g) => { geos.push(g); return g; };
  const add = (p, g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(G(g), m); o.position.set(x, y, z); p.add(o); return o; };
  const box = (p, m, sx, sy, sz, x, y, z) => add(p, new THREE.BoxGeometry(sx, sy, sz), m, x, y, z);
  const ball = (p, m, r, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = add(p, new THREE.SphereGeometry(r, 8, 6), m, x, y, z); o.scale.set(sx, sy, sz); return o; };
  const cyl = (p, m, rt, rb, h, x, y, z, seg = 8) => add(p, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z);
  const pivot = (p, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); return g; };
  const flash = (v) => { for (const m of lam) m.emissive.copy(m.userData.em).add(new THREE.Color(v * 0.7, v * 0.08, v * 0.08)); };
  const dispose = () => { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); for (const e of extra) e.dispose?.(); };
  return { L, B, G, add, box, ball, cyl, pivot, flash, dispose, extra };
}
const api = (K, root, parts, height, radius, update) => ({
  root, parts, height, radius, update,
  setElite() {}, setTint() {}, isElite: () => false, setHitFlash: (v) => K.flash(v), dispose() { K.dispose(); },
});
const seeded = (seed) => { let s = (seed >>> 0) || 7; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

// ================================================================================================ SCRAPER
// A knee-high scavenger bot: a yellow chassis on six legs, a scoop up front, an open tray on its back (the carried item rides there) and ONE eye lamp.
// Eye: green = foraging, amber = carrying, red = the colony is awake (strobing during the wind-up).
export function createScraperModel(o = {}) {
  const K = kit(), root = new THREE.Group();
  const shell = K.L(0xc9a227, 0x120d00), dark = K.L(0x25272c), metal = K.L(0x6b6f78);
  const eyeM = K.B(0x4dff88), tipM = K.B(0x4dff88);
  const body = K.pivot(root, 0, 0.2, 0);
  K.box(body, shell, 0.34, 0.13, 0.42, 0, 0.06, 0);
  K.box(body, dark, 0.36, 0.03, 0.44, 0, 0.0, 0);                       // skirt
  K.box(body, metal, 0.3, 0.1, 0.06, 0, 0.05, 0.25).rotation.x = -0.5;   // the scoop
  const tray = K.pivot(body, 0, 0.14, -0.04);                            // open tray: the carried item is parented to parts.carry
  K.box(tray, dark, 0.3, 0.03, 0.3, 0, 0, 0);
  for (const s of [-1, 1]) { K.box(tray, dark, 0.02, 0.07, 0.3, s * 0.15, 0.04, 0); }
  K.box(tray, dark, 0.3, 0.07, 0.02, 0, 0.04, -0.15);
  const carry = K.pivot(tray, 0, 0.06, 0);
  const eye = K.box(body, eyeM, 0.13, 0.06, 0.03, 0, 0.09, 0.22);
  const ant = K.pivot(body, -0.12, 0.12, -0.12); K.box(ant, metal, 0.015, 0.2, 0.015, 0, 0.1, 0); K.ball(ant, tipM, 0.03, 0, 0.21, 0);
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const s = i % 2 ? 1 : -1, z = -0.15 + Math.floor(i / 2) * 0.15;
    const hip = K.pivot(root, s * 0.17, 0.2, z); K.box(hip, metal, 0.13, 0.03, 0.03, s * 0.06, 0, 0); const kn = K.pivot(hip, s * 0.12, 0, 0); K.box(kn, dark, 0.03, 0.22, 0.03, 0, -0.1, 0).rotation.z = s * 0.25;
    legs.push({ hip, s, k: i % 3 === 0 || i % 3 === 2 ? 1 : -1 });
  }
  const st = { ph: (o.seed || 1) % 7, crouch: 0, lunge: 0 }, col = new THREE.Color();
  return api(K, root, { head: body, eyes: [], carry }, 0.5, 0.35, (dt, a) => {
    const state = a.state, time = a.time || 0, t = a.t || 0, sp = clamp((a.speed || 0) / 2.5, 0, 2);
    st.ph += (a.speed || 0) * dt * 7;
    const moving = state === 'walk' || state === 'return' || state === 'rage';
    for (const l of legs) { const sw = Math.sin(st.ph + l.k * PI) * (moving ? 0.5 : 0.05) * Math.min(1, sp + 0.2); l.hip.rotation.y = damp(l.hip.rotation.y, sw * l.s, 16, dt); }
    let crouch = 0, lunge = 0, lamp = [0.3, 1, 0.5], gl = 1;
    if (state === 'return') lamp = [1, 0.7, 0.15];
    else if (state === 'rage') { lamp = [1, 0.15, 0.1]; gl = 0.8 + 0.2 * Math.sin(time * 14); }
    else if (state === 'windup') { crouch = 1; lamp = [1, 0.1, 0.08]; gl = Math.sin(time * 30) > 0 ? 1 : 0.3; }
    else if (state === 'attack') { lunge = 1; lamp = [1, 0.2, 0.1]; }
    else if (state === 'stunned') { lamp = [0.5, 0.5, 1]; gl = Math.sin(time * 40) > 0 ? 0.9 : 0.1; }
    else if (state === 'dead') gl = 0.03;
    st.crouch = damp(st.crouch, crouch, 14, dt); st.lunge = damp(st.lunge, lunge, 22, dt);
    body.position.y = 0.2 - 0.06 * st.crouch + (state === 'walk' || state === 'return' || state === 'rage' ? Math.abs(Math.sin(st.ph * 1.5)) * 0.015 : 0);
    body.position.z = 0.16 * st.lunge; body.rotation.x = -0.35 * st.crouch + 0.25 * st.lunge;
    if (state === 'dead') { body.rotation.z = damp(body.rotation.z, 0.9, 6, dt); body.position.y = damp(body.position.y, 0.1, 6, dt); }
    col.setRGB(lamp[0] * gl, lamp[1] * gl, lamp[2] * gl); eyeM.color.copy(col); tipM.color.copy(col);
    void t;
  });
}

// ================================================================================================ NEST
// A heap of scavenged keyboards, monitors and cables around a glowing core. The more it holds, the bigger the pile grows, the brighter the core and the taller the beam.
// Alarm = the core flashes red (the swarm moves one second later). Dead = the pile slumps and the core goes dark.
export function createNestModel(o = {}) {
  const K = kit(), root = new THREE.Group(), r = seeded((o.seed || 1) * 977);
  const junk = [K.L(0x3a3d45), K.L(0x55483a), K.L(0x2a3a3f), K.L(0x4b4b52)], cable = K.L(0x121316);
  const coreM = K.B(0x40e0ff), haloM = K.B(0x40e0ff, { transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }), beamM = K.B(0x40e0ff, { transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending });
  const pile = K.pivot(root, 0, 0, 0);
  const pieces = [];
  for (let i = 0; i < 22; i++) {
    const a = r() * TAU, rad = i < 8 ? 0.35 + r() * 0.55 : 0.1 + r() * 0.6, h = i < 8 ? 0.08 + r() * 0.1 : 0.22 + (i - 8) * 0.045;
    const w = 0.28 + r() * 0.32, d = 0.16 + r() * 0.3;
    const m = K.box(pile, junk[i % junk.length], w, 0.09 + r() * 0.12, d, Math.cos(a) * rad, h, Math.sin(a) * rad);
    m.rotation.set((r() - 0.5) * 0.5, r() * PI, (r() - 0.5) * 0.5);
    pieces.push({ m, k: i < 8 ? 0 : (i - 8) / 14 });
    if (i % 3 === 0) { const c = K.add(pile, new THREE.TorusGeometry(0.16 + r() * 0.1, 0.018, 5, 10), cable, Math.cos(a) * rad * 0.7, h + 0.06, Math.sin(a) * rad * 0.7); c.rotation.set(PI / 2 + (r() - 0.5), r() * PI, 0); pieces.push({ m: c, k: i < 8 ? 0 : (i - 8) / 14 }); }
  }
  const core = K.pivot(root, 0, 0.62, 0);
  K.box(core, coreM, 0.34, 0.34, 0.34, 0, 0, 0).rotation.set(0.6, 0.6, 0);
  const halo = K.add(root, new THREE.SphereGeometry(1.4, 10, 8), haloM, 0, 0.7, 0);
  const beam = K.add(root, new THREE.CylinderGeometry(0.05, 0.16, 1, 8, 1, true), beamM, 0, 1.2, 0);
  const st = { fill: 0, collapse: 0 }, col = new THREE.Color();
  return api(K, root, { head: core, eyes: [] }, 1.3, 1.0, (dt, a) => {
    const state = a.state, time = a.time || 0, fill = clamp(a.progress || 0, 0, 1);
    st.fill = damp(st.fill, fill, 3, dt);
    for (const p of pieces) p.m.visible = p.k <= st.fill + 0.02;
    let c = [0.25 + 0.75 * st.fill, 0.88 - 0.25 * st.fill, 1 - 0.75 * st.fill], lvl = 0.35 + 0.65 * st.fill;   // cool cyan when nearly empty, warm gold when full
    if (state === 'alarm') { c = [1, 0.1, 0.08]; lvl = Math.sin(time * 16) > 0 ? 1 : 0.2; }
    st.collapse = damp(st.collapse, state === 'dead' ? 1 : 0, 3, dt);
    if (state === 'dead') lvl = 0.03;
    else lvl *= 0.88 + 0.12 * Math.sin(time * 3);
    col.setRGB(c[0] * lvl, c[1] * lvl, c[2] * lvl); coreM.color.copy(col); haloM.color.copy(col); beamM.color.copy(col);
    haloM.opacity = state === 'dead' ? 0 : 0.05 + 0.13 * st.fill + (state === 'alarm' ? 0.08 : 0);
    beamM.opacity = state === 'dead' ? 0 : 0.06 + 0.24 * st.fill;
    const bh = 0.6 + 3.2 * st.fill; beam.scale.y = bh; beam.position.y = 0.7 + bh / 2;
    core.rotation.y = time * 0.9; core.scale.setScalar((0.75 + 0.5 * st.fill) * (1 - 0.6 * st.collapse)); core.position.y = 0.62 - 0.3 * st.collapse;
    pile.scale.y = 1 - 0.5 * st.collapse; pile.scale.x = pile.scale.z = 1 + 0.15 * st.collapse;
  });
}

// ================================================================================================ THE STREAMER
// A thin hooded figure holding a selfie stick, its head circled by a big ring light. The ring is the whole rule:
// dim = idle, warming white = the LIVE jingle is about to fire (boot), pulsing white + expanding floor rings = LIVE (every creature inside the rings is being pulled), cracked = one more hit,
// dark = broken (it flees and never streams again).
function liveTag(K) {
  if (typeof document === 'undefined') return null;
  try {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 40;
    const g = cv.getContext('2d');
    g.fillStyle = '#e01c34'; g.fillRect(0, 4, 128, 32); g.fillStyle = '#ffffff'; g.font = 'bold 26px VT323, monospace'; g.textAlign = 'center'; g.fillText('● LIVE', 64, 29);
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; K.extra.push(tex);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthTest: false })); sp.scale.set(0.9, 0.28, 1); sp.renderOrder = 6; K.extra.push(sp.material);
    return sp;
  } catch { return null; }
}
export function createStreamerModel(o = {}) {
  const K = kit(), root = new THREE.Group();
  const hood = K.L(0x54388a, 0x08041a), jeans = K.L(0x1d2233), skin = K.L(0xb8927c), stick = K.L(0x1a1a1e), shoe = K.L(0xdedede);
  const ringM = K.B(0x777060), phoneM = K.B(0x9ad0ff), dotM = K.B(0xff2233);
  const legs = [-1, 1].map((s) => { const hip = K.pivot(root, s * 0.1, 0.92, 0); K.box(hip, jeans, 0.12, 0.88, 0.12, 0, -0.44, 0); K.box(hip, shoe, 0.13, 0.07, 0.24, 0, -0.9, 0.05); return hip; });
  const torso = K.pivot(root, 0, 0.92, 0);
  K.box(torso, hood, 0.36, 0.6, 0.2, 0, 0.3, 0); K.box(torso, hood, 0.4, 0.14, 0.22, 0, 0.62, -0.02);
  const armL = K.pivot(torso, -0.24, 0.56, 0); K.box(armL, hood, 0.08, 0.5, 0.08, 0, -0.25, 0); K.box(armL, skin, 0.07, 0.1, 0.07, 0, -0.55, 0);
  const armR = K.pivot(torso, 0.24, 0.56, 0); K.box(armR, hood, 0.08, 0.4, 0.08, 0, -0.2, 0); K.box(armR, skin, 0.07, 0.1, 0.07, 0, -0.44, 0);
  const rod = K.pivot(armR, 0, -0.44, 0); K.box(rod, stick, 0.025, 0.8, 0.025, 0, 0.4, 0); K.box(rod, phoneM, 0.12, 0.2, 0.02, 0, 0.86, 0.02); K.ball(rod, dotM, 0.02, 0.04, 0.94, 0.04);
  const head = K.pivot(torso, 0, 0.78, 0);
  K.ball(head, hood, 0.15, 0, 0.02, 0, 1, 1.15, 1); K.ball(head, K.L(0x0c0c10), 0.1, 0, 0.0, 0.08, 1, 1.1, 0.7);
  const ring = K.pivot(head, 0, 0.02, -0.02);
  K.add(ring, new THREE.TorusGeometry(0.33, 0.045, 5, 18), ringM, 0, 0, 0);
  const crack = K.box(ring, K.B(0x000000), 0.05, 0.05, 0.12, 0.33, 0, 0); crack.visible = false;      // a dark notch: the crack (only when weak)
  const tag = liveTag(K); if (tag) { tag.position.set(0, 1.42, 0); tag.visible = false; root.add(tag); }
  const pr = [0, 1].map(() => {
    const m = new THREE.MeshBasicMaterial({ color: 0xffb0d8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
    const g = new THREE.RingGeometry(0.975, 1, 64); K.extra.push(m, g);
    const mesh = new THREE.Mesh(g, m); mesh.rotation.x = -PI / 2; mesh.position.y = 0.07; mesh.visible = false; mesh.frustumCulled = false; root.add(mesh);
    return { mesh, m };
  });
  const st = { ph: 0, warm: 0, arm: 0 }, col = new THREE.Color();
  const m = api(K, root, { head, eyes: [] }, 2.1, 0.4, (dt, a) => {
    const state = a.state, time = a.time || 0, t = a.t || 0, prog = a.progress ?? 1, broken = prog < 0;
    st.ph += (a.speed || 0) * dt * 3.2;
    const mv = clamp((a.speed || 0) / 2, 0, 1.5), sw = Math.sin(st.ph) * 0.5 * mv;
    legs[0].rotation.x = damp(legs[0].rotation.x, sw, 12, dt); legs[1].rotation.x = damp(legs[1].rotation.x, -sw, 12, dt);
    const live = state === 'live', boot = state === 'boot';
    // the stick arm: down while walking, up + tilted toward the crowd in boot / live
    const armT = live || boot ? -2.5 : -0.3 + sw * 0.4;
    st.arm = damp(st.arm, armT, 8, dt); armR.rotation.x = st.arm; rod.rotation.x = live || boot ? 0.4 : 0.1; armL.rotation.x = live ? -0.6 + Math.sin(time * 6) * 0.25 : -sw * 0.6;   // waves with the free hand
    torso.rotation.y = live ? Math.sin(time * 2.2) * 0.25 : 0;
    // ring light colour + level
    let c = [1, 0.85, 0.55], lvl = 0.16;
    if (boot) { const u = clamp(t / 1.6, 0, 1); lvl = 0.16 + 0.84 * u * u; c = [1, 0.85 + 0.15 * u, 0.55 + 0.45 * u]; if (t > 1.0 && Math.sin(time * 34) > 0.3) lvl = 1; }
    else if (live) { lvl = 0.85 + 0.15 * Math.sin(time * 8); c = [1, 0.95, 1]; }
    if (state === 'dead') lvl = 0.02;
    if (broken) { lvl = state === 'dead' ? 0.02 : (Math.sin(time * 23) > 0.75 ? 0.5 : 0.03); c = [1, 0.6, 0.3]; }
    else if (prog < 0.4 && state !== 'dead') { lvl *= Math.sin(time * 41 + prog * 9) > -0.1 ? 1 : 0.15; crack.visible = true; }   // weak: it flickers and shows the crack
    else crack.visible = false;
    if (broken) crack.visible = true;
    col.setRGB(c[0] * lvl, c[1] * lvl, c[2] * lvl); ringM.color.copy(col); phoneM.color.setRGB(0.4 * lvl + 0.3, 0.7 * lvl + 0.2, lvl * 0.9 + 0.1);
    dotM.color.setRGB(live && Math.sin(time * 6) > 0 ? 1 : 0.3, 0.05, 0.08);
    if (tag) { tag.visible = live && !broken; if (tag.visible) tag.material.opacity = Math.sin(time * 6) > 0 ? 1 : 0.75; }
    // the pull rings: two ripples per 1.5 s pulse, reaching 30 m (the host pulls everything calm inside the outer edge)
    for (let i = 0; i < 2; i++) {
      const p = pr[i];
      if (!live) { p.mesh.visible = false; continue; }
      const u = ((t / 1.5 + i * 0.5) % 1 + 1) % 1;
      p.mesh.visible = true; p.mesh.scale.setScalar(Math.max(0.3, u * PULSE_R)); p.m.opacity = (1 - u) * 0.55 * (u < 0.05 ? u / 0.05 : 1);
    }
  });
  return m;
}

// ================================================================================================ AUTOMOD
// A moderation cart: a grey-blue wheeled body, a mast with a boxy head-screen, a warning-yellow band, and one long arm ending in a wide squeegee. The head LAMP is the tell:
// cyan = patrol, amber = it locked a target, white spin = sweeping (deleting), and with the flag meter it turns amber -> red and blinks faster; red strobe + squeegee overhead = the delete
// is 1.3 s away (step away from the body).
export function createAutoModModel(o = {}) {
  const K = kit(), root = new THREE.Group();
  const shell = K.L(0x3e4c5c, 0x05070a), band = K.L(0xd9b21e, 0x181200), dark = K.L(0x1a1c20), metal = K.L(0x8a919c);
  const lampM = K.B(0x40e8ff), scrM = K.B(0x0a1a22), barM = K.B(0x40e8ff);
  const base = K.pivot(root, 0, 0, 0);
  K.box(base, shell, 0.86, 0.5, 0.7, 0, 0.48, 0); K.box(base, band, 0.88, 0.1, 0.72, 0, 0.34, 0);
  const wheels = [[-0.36, 0.2], [0.36, 0.2], [-0.36, -0.24], [0.36, -0.24]].map(([x, z]) => { const w = K.pivot(base, x, 0.2, z); const c = K.cyl(w, dark, 0.2, 0.2, 0.12, 0, 0, 0, 10); c.rotation.z = PI / 2; K.box(w, metal, 0.13, 0.05, 0.05, 0, 0, 0); return w; });
  const mast = K.pivot(base, 0, 0.72, -0.05);
  K.box(mast, shell, 0.24, 0.9, 0.22, 0, 0.45, 0);
  const head = K.pivot(mast, 0, 1.05, 0);
  K.box(head, shell, 0.54, 0.4, 0.34, 0, 0.1, 0); K.box(head, scrM, 0.44, 0.24, 0.02, 0, 0.1, 0.18);
  const bar = K.box(head, barM, 0.36, 0.06, 0.02, 0, 0.1, 0.195);          // the scanner bar sweeps across the screen
  const lamp = K.ball(head, lampM, 0.09, 0, 0.36, 0);                        // beacon on top: the state tell
  K.box(head, metal, 0.03, 0.14, 0.03, 0, 0.3, 0);
  const arm = K.pivot(mast, 0.16, 0.7, 0.05);
  K.box(arm, metal, 0.07, 0.07, 0.07, 0, 0, 0);
  const pole = K.pivot(arm, 0.06, 0, 0); K.box(pole, metal, 0.05, 0.05, 1.3, 0, 0, 0.65);
  const sq = K.pivot(pole, 0, 0, 1.3); K.box(sq, dark, 0.62, 0.05, 0.14, 0, 0, 0); K.box(sq, K.L(0xb9c0c8), 0.6, 0.03, 0.03, 0, -0.04, 0);
  const st = { ph: 0, arm: 0.6, armY: 0, tilt: 0, sw: 0 }, col = new THREE.Color();
  return api(K, root, { head, eyes: [] }, 2.1, 0.6, (dt, a) => {
    const state = a.state, time = a.time || 0, t = a.t || 0, prog = clamp(a.progress || 0, 0, 1), sp = a.speed || 0;
    st.ph += sp * dt * 5;
    for (const w of wheels) w.children[0].rotation.x = st.ph;   // (the cylinder is the first child: it turns about its axle)
    base.rotation.z = damp(base.rotation.z, 0, 8, dt);
    let armX = 0.55, armYt = 0, tilt = 0, lamp1 = [0.25, 0.9, 1], gl = 0.85, barSp = 1.5;
    if (state === 'scan') { lamp1 = [1, 0.75, 0.15]; gl = 0.9; barSp = 4; armX = 0.35; }
    else if (state === 'sweep') { st.sw += dt * 5; armYt = Math.sin(st.sw) * 0.55; armX = 1.15; lamp1 = [1, 1, 1]; gl = 0.7 + 0.3 * Math.abs(Math.sin(time * 12)); barSp = 8; tilt = 0.06; }
    else if (state === 'hunt') { lamp1 = [1, 0.4, 0.1]; gl = 0.7 + 0.3 * Math.abs(Math.sin(time * 9)); barSp = 6; armX = 0.2; tilt = 0.1; }
    else if (state === 'flag') { const u = clamp(t / 1.3, 0, 1); armX = -1.5 * u + 0.3 * (1 - u); lamp1 = [1, 0.08, 0.06]; gl = Math.sin(time * (14 + 22 * u)) > 0 ? 1 : 0.15; barSp = 12; tilt = -0.1 * u; }
    else if (state === 'delete') { armX = 1.6; lamp1 = [1, 0.1, 0.1]; gl = 1; tilt = 0.14; }
    else if (state === 'stunned') { gl = Math.sin(time * 30) > 0 ? 0.8 : 0.05; lamp1 = [0.6, 0.6, 1]; armX = 0.9; }
    else if (state === 'dead') { gl = 0.03; armX = 1.4; }
    else if (state === 'walk' && prog > 0.02) { const k = prog; lamp1 = [0.25 + 0.75 * k, 0.9 - 0.55 * k, 1 - 0.95 * k]; gl = 0.7 + 0.3 * Math.abs(Math.sin(time * (3 + 14 * k))); barSp = 1.5 + 6 * k; }   // the flag meter of someone near a body
    if ((state === 'scan' || state === 'hunt') && prog > 0.02) { lamp1 = [1, 0.75 - 0.6 * prog, 0.15 - 0.1 * prog]; gl = 0.7 + 0.3 * Math.abs(Math.sin(time * (6 + 12 * prog))); }
    st.arm = damp(st.arm, armX, state === 'delete' ? 26 : 9, dt); st.armY = damp(st.armY, armYt, 12, dt); st.tilt = damp(st.tilt, tilt, 9, dt);
    arm.rotation.x = st.arm; arm.rotation.y = st.armY; mast.rotation.x = st.tilt;
    col.setRGB(lamp1[0] * gl, lamp1[1] * gl, lamp1[2] * gl); lampM.color.copy(col); barM.color.copy(col);
    bar.position.x = Math.sin(time * barSp) * 0.16;
    lamp.scale.setScalar(1 + (state === 'flag' ? 0.3 : 0));
    head.rotation.y = state === 'dead' ? 0.6 : Math.sin(time * 0.7) * (state === 'walk' ? 0.35 : 0.08);
  });
}

/** register every model in the mod creature-model registry (window.__kefalMods.creatureModels) */
export function registerSw11Models(reg) {
  if (!reg) return;
  const F = { sw_scraper: createScraperModel, sw_nest: createNestModel, sw_streamer: createStreamerModel, sw_automod: createAutoModModel };
  for (const [id, fn] of Object.entries(F)) if (!reg.has(id)) reg.set(id, (T, opts) => fn(opts || {}));
}
