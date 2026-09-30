// CREATURES12 wave 12 - procedural PSX models: 404, The Cookie, The Echo Chamber, The Lag Spike (docs/wave12/creatures12.md).
// Creature model contract of entities/creatures.js CreatureView: { root, parts, height, radius, update(dt, {state, speed, t, time, progress}), setElite, setHitFlash, setTint, dispose },
// origin at the feet, facing +Z. `progress` = the host's c.extra (a number):
//   404      0..1 the static-burst wind-up (state 'windup')                 Cookie   0..1 the prime hop (state 'prime'); a string while latched (-> 0)
//   Echo     0..1 the tape fill while 'dormant', 1 while 'feed'              Lag      0..1 the shimmer (state 'scan'), 1..0 the time left (state 'active')
// 404 exposes setLook(0|1|2) (creatures12_fx.js drives it per client): 0 invisible (root hidden), 1 glitch outline, 2 revealed.
// Every glow is an emissive / basic material (fog off, not tone-mapped): NEVER a THREE light.
import * as THREE from 'three';
import { TUNE } from '../game/creatures12_core.js';

const PI = Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

function kit() {
  const mats = [], geos = [], extra = [];
  const L = (c, em = 0x000000) => { const m = new THREE.MeshLambertMaterial({ color: c, flatShading: true, emissive: em }); m.userData.instance = true; m.userData.em = new THREE.Color(em); mats.push(m); return m; };
  const B = (c, o = {}) => { const m = new THREE.MeshBasicMaterial({ color: c, fog: false, toneMapped: false, ...o }); m.userData.instance = true; mats.push(m); return m; };
  const G = (g) => { geos.push(g); return g; };
  const add = (p, g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(G(g), m); o.position.set(x, y, z); p.add(o); return o; };
  const box = (p, m, sx, sy, sz, x, y, z) => add(p, new THREE.BoxGeometry(sx, sy, sz), m, x, y, z);
  const pivot = (p, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); return g; };
  const flash = (v) => { for (const m of mats) if (m.userData.em) m.emissive.copy(m.userData.em).add(new THREE.Color(v * 0.7, v * 0.08, v * 0.08)); };
  const dispose = () => { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); for (const e of extra) e.dispose?.(); };
  return { L, B, G, add, box, pivot, flash, dispose, extra };
}
const api = (K, root, parts, height, radius, update, more = {}) => ({ root, parts, height, radius, update, setElite() {}, setTint() {}, isElite: () => false, setHitFlash: (v) => K.flash(v), dispose() { K.dispose(); }, ...more });

function labelTex(K, text, fg, bg = '#05070a', w = 96, h = 48, px = 34) {
  if (typeof document === 'undefined') return null;
  try {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.font = `bold ${px}px VT323, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 2);
    g.fillStyle = fg; g.globalAlpha = 0.25; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; K.extra.push(tex); return tex;
  } catch { return null; }
}

// ================================================================================================ 404
// A tall thin figure with long arms and a flat screen for a face that reads 404. Meant to be unseen: a glitch outline (cyan edges, sliced sideways) for a blink when a
// flashlight beam crosses it, and a solid dark body with the screen and cyan edge lines while scanned / on the drone camera. Wind-up: the screen turns red and the body shakes.
export function createNotFoundModel() {
  const K = kit(), root = new THREE.Group(), solid = K.pivot(root), ghost = K.pivot(root);
  const skin = K.L(0x15111f, 0x08050f), edgeM = new THREE.LineBasicMaterial({ color: 0x62e8ff, fog: false, toneMapped: false, transparent: true, opacity: 0.95 }); K.extra.push(edgeM);
  const specs = [[0.5, 0.95, 0.3, 0, 1.2, 0], [0.16, 0.85, 0.16, -0.14, 0.42, 0], [0.16, 0.85, 0.16, 0.14, 0.42, 0]];   // torso, legs
  const armL = K.pivot(solid, -0.36, 1.6, 0), armR = K.pivot(solid, 0.36, 1.6, 0), armLg = K.pivot(ghost, -0.36, 1.6, 0), armRg = K.pivot(ghost, 0.36, 1.6, 0);
  const headS = K.pivot(solid, 0, 1.9, 0.02), headG = K.pivot(ghost, 0, 1.9, 0.02);
  const edgesOf = (p, sx, sy, sz, x, y, z) => { const e = new THREE.LineSegments(K.G(new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz))), edgeM); e.position.set(x, y, z); p.add(e); };
  for (const [sx, sy, sz, x, y, z] of specs) { K.box(solid, skin, sx, sy, sz, x, y, z); edgesOf(ghost, sx, sy, sz, x, y, z); }
  for (const [s, ps, pg] of [[-1, armL, armLg], [1, armR, armRg]]) { K.box(ps, skin, 0.1, 1.15, 0.1, 0, -0.55, 0); edgesOf(pg, 0.1, 1.15, 0.1, 0, -0.55, 0); void s; }
  K.box(headS, skin, 0.36, 0.42, 0.3, 0, 0, 0); edgesOf(headG, 0.36, 0.42, 0.3, 0, 0, 0);
  const cyan = labelTex(K, '404', '#62e8ff'), red = labelTex(K, '404', '#ff3a2a');
  const faceM = new THREE.MeshBasicMaterial({ map: cyan, color: cyan ? 0xffffff : 0x62e8ff, fog: false, toneMapped: false }); K.extra.push(faceM);
  const face = K.add(headS, new THREE.PlaneGeometry(0.32, 0.17), faceM, 0, 0.02, 0.152);
  const st = { look: 0, shake: 0 };
  const setLook = (m) => { st.look = m; root.visible = m > 0; solid.visible = m >= 2; ghost.visible = m >= 1; };
  setLook(0);
  return api(K, root, { head: headS, eyes: [] }, 2.1, 0.5, (dt, a) => {
    const state = a.state, time = a.time || 0, prog = clamp(a.progress || 0, 0, 1);
    const burst = state === 'windup';
    faceM.map = burst && red && Math.sin(time * 26) > 0 ? red : cyan; faceM.needsUpdate = false;
    faceM.color.setHex(burst ? 0xffb0a0 : 0xffffff);
    const walk = clamp((a.speed || 0) / 2.2, 0, 1), sw = Math.sin(time * 4.2) * 0.5 * walk;
    armL.rotation.x = armLg.rotation.x = sw + (burst ? -0.5 * prog : 0); armR.rotation.x = armRg.rotation.x = -sw + (burst ? -0.5 * prog : 0);
    solid.position.set(0, 0, 0); ghost.position.set(0, 0, 0);
    st.shake = burst ? 0.02 + 0.05 * prog : 0;
    if (st.shake) { const j = () => (Math.random() - 0.5) * st.shake; solid.position.set(j(), 0, j()); ghost.position.copy(solid.position); }
    if (st.look === 1) ghost.position.x += (Math.random() < 0.5 ? 1 : -1) * 0.06 * (Math.random() < 0.5 ? 1 : 0);   // sliced sideways: a glitch
    headS.rotation.z = headG.rotation.z = burst ? Math.sin(time * 30) * 0.12 : Math.sin(time * 1.3) * 0.05;
    edgeM.color.setHex(burst ? 0xff5a48 : state === 'dead' ? 0x556070 : 0x62e8ff);
    if (state === 'dead') { root.rotation.x = Math.min(1.4, (a.t || 0) * 2.4); } else root.rotation.x = 0;
    face.visible = true;
  }, { setLook, getLook: () => st.look });
}

// ================================================================================================ THE COOKIE
// A flat tan biscuit with amber chips (basic, fog off = readable in the dark) on four stubby legs. Crawl: legs scuttle. Prime: it hops, chips flash (0.8 s).
// Latched (state 'follow'): it sits on the victim's back, a little bigger, chips pulsing slowly.
export function createCookieModel() {
  const K = kit(), root = new THREE.Group(), body = K.pivot(root, 0, 0.12, 0);
  const dough = K.L(0xc8945a, 0x1a0e04), dark = K.L(0x3a2412), chipM = K.B(0xffb84a);
  K.add(body, new THREE.CylinderGeometry(0.15, 0.16, 0.06, 9), dough, 0, 0, 0);
  K.add(body, new THREE.CylinderGeometry(0.11, 0.13, 0.03, 9), dough, 0, 0.04, 0);
  const chips = [[0.06, 0.06, 0.03], [-0.07, 0.05, 0.02], [0.0, 0.05, -0.08], [-0.05, 0.05, 0.09], [0.1, 0.04, -0.04]].map(([x, y, z]) => K.box(body, chipM, 0.045, 0.03, 0.045, x, y, z));
  const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => K.box(root, dark, 0.035, 0.09, 0.035, sx * 0.1, 0.045, sz * 0.09));
  const st = { c: new THREE.Color() };
  return api(K, root, { head: body, eyes: [] }, 0.3, 0.2, (dt, a) => {
    const state = a.state, time = a.time || 0, prog = clamp(a.progress || 0, 0, 1);
    const latched = state === 'follow', prime = state === 'prime', moving = (a.speed || 0) > 0.3;
    root.scale.setScalar(damp(root.scale.x, latched ? 1.5 : 1, 8, dt));
    for (let i = 0; i < 4; i++) legs[i].position.y = 0.045 + (moving && !latched ? Math.max(0, Math.sin(time * 16 + i * 1.6)) * 0.03 : 0);
    body.position.y = 0.12 + (prime ? Math.abs(Math.sin(time * (14 + 10 * prog))) * 0.07 * (0.4 + prog) : 0);
    body.rotation.z = prime ? Math.sin(time * 30) * 0.1 : 0;
    const pulse = latched ? 0.55 + 0.45 * Math.sin(time * 2.4) : prime ? (Math.sin(time * 40) > 0 ? 1 : 0.3) : 0.75;
    st.c.setHex(0xffb84a).multiplyScalar(pulse); for (const c of chips) c.material.color.copy(st.c);
    if (state === 'dead') { root.scale.y = 0.4; body.rotation.z = 0.3; }
  });
}

// ================================================================================================ THE ECHO CHAMBER
// A squat pulsing organ mass with a big dark ear canal, drooping flaps and a ring of eight tape cells. Dormant: the ring fills as it records (progress = fill).
// Feed (replaying): it throbs fast, the ring blinks full and the WEAK POINT (a yellow-white bulb on a stalk) glows: hit that.
export function createEchoModel() {
  const K = kit(), root = new THREE.Group(), mass = K.pivot(root, 0, 1.0, 0);
  const flesh = K.L(0x8a4a4a, 0x140606), fleshD = K.L(0x5a2a30, 0x0a0304), hole = K.L(0x08040a);
  K.add(mass, new THREE.SphereGeometry(0.95, 8, 6), flesh, 0, 0, 0).scale.set(1, 1.05, 1);
  K.add(mass, new THREE.SphereGeometry(0.6, 7, 5), fleshD, -0.45, 0.55, -0.25);
  K.add(mass, new THREE.SphereGeometry(0.5, 7, 5), fleshD, 0.5, 0.4, -0.35);
  K.add(mass, new THREE.CylinderGeometry(0.42, 0.5, 0.25, 9), hole, 0, 0.1, 0.78).rotation.x = PI / 2;   // the ear canal
  const flaps = [-1, 1].map((s) => { const f = K.box(mass, fleshD, 0.14, 0.7, 0.4, s * 0.92, 0.1, 0.1); f.rotation.z = -s * 0.35; return f; });
  const cellM = Array.from({ length: 8 }, () => K.B(0x1a2230));
  const cells = cellM.map((m, i) => { const a = PI * 0.15 + (i / 7) * PI * 0.7; return K.box(mass, m, 0.13, 0.13, 0.05, Math.cos(a) * 0.62, 0.1 + Math.sin(a) * 0.62, 0.86); });
  void cells;
  const stalk = K.pivot(mass, 0.28, 0.98, 0.35), weakM = K.B(0xfff2a0);
  K.box(stalk, fleshD, 0.06, 0.4, 0.06, 0, 0.1, 0);
  const weak = K.add(stalk, new THREE.OctahedronGeometry(0.16, 0), weakM, 0, 0.36, 0);
  const halo = K.add(stalk, new THREE.SphereGeometry(0.26, 6, 4), K.B(0xffd23f, { transparent: true, opacity: 0.35, depthWrite: false }), 0, 0.36, 0);
  const tend = [0, 1, 2, 3].map((i) => { const t = K.box(root, fleshD, 0.09, 0.8, 0.09, Math.cos(i * 1.6 + 0.4) * 0.85, 0.3, Math.sin(i * 1.6 + 0.4) * 0.85); t.rotation.z = 0.5; return t; });
  const st = { glow: 0, c: new THREE.Color() };
  return api(K, root, { head: mass, eyes: [] }, 2.2, 0.95, (dt, a) => {
    const state = a.state, time = a.time || 0, prog = clamp(a.progress || 0, 0, 1), feed = state === 'feed';
    st.glow = damp(st.glow, feed ? 1 : 0, 6, dt);
    const rate = feed ? 7 : 1.4, amp = feed ? 0.06 : 0.025;
    mass.scale.set(1 + Math.sin(time * rate) * amp, 1 + Math.sin(time * rate + 1) * amp, 1 + Math.sin(time * rate + 2) * amp);
    for (let i = 0; i < flaps.length; i++) flaps[i].rotation.z = (i ? -1 : 1) * (-0.35 - (feed ? 0.3 : 0.05) * Math.sin(time * rate * 1.3));
    for (let i = 0; i < 8; i++) {
      const lit = feed ? (Math.sin(time * 14 + i) > -0.2 ? 1 : 0.35) : (i < Math.round(prog * 8) ? 1 : 0);
      st.c.setHex(feed ? 0xffd23f : 0x4de0ff).multiplyScalar(lit ? 1 : 0.18); cellM[i].color.copy(st.c);
    }
    weak.visible = halo.visible = st.glow > 0.05;
    weak.rotation.y = time * 3; const s = (0.6 + 0.4 * Math.sin(time * 9)) * st.glow + 0.001; weak.scale.setScalar(0.5 + s); halo.scale.setScalar(0.6 + s * 1.2);
    for (let i = 0; i < tend.length; i++) tend[i].rotation.x = Math.sin(time * 1.6 + i * 2) * 0.25;
    if (state === 'dead') { mass.scale.y = Math.max(0.2, 1 - (a.t || 0) * 0.8); }
  });
}

// ================================================================================================ THE LAG SPIKE
// A floating cube of stacked, sliced shards (magenta / cyan basic edges) hovering at 1.5 m. On the floor beneath: the 6 m zone ring.
//   fly: no ring. scan: the ring flickers in, growing brighter (the shimmer telegraph). active: solid ring + inner rings + tearing shards. off: dead grey.
export function createLagModel() {
  const K = kit(), root = new THREE.Group(), cube = K.pivot(root, 0, TUNE.lag.hover, 0);
  const coreM = K.L(0x2a1440, 0x220a3a), magM = K.B(0xff44dd), cyanM = K.B(0x44e8ff);
  const shards = [];
  for (let i = 0; i < 4; i++) shards.push(K.box(cube, i % 2 ? coreM : K.L(0x381a58, 0x2a0e48), 0.62, 0.15, 0.62, 0, -0.27 + i * 0.18, 0));
  const edges = [magM, cyanM].map((m, i) => { const e = new THREE.LineSegments(K.G(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.7 + i * 0.06, 0.78 + i * 0.06, 0.7 + i * 0.06))), new THREE.LineBasicMaterial({ color: i ? 0x44e8ff : 0xff44dd, fog: false, toneMapped: false })); cube.add(e); K.extra.push(e.material); return e; });
  const R = TUNE.lag.zone, ringM = K.B(0xff44dd, { transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }), inM = K.B(0x44e8ff, { transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  const ring = K.add(root, new THREE.RingGeometry(R - 0.18, R, 40), ringM, 0, 0.07, 0); ring.rotation.x = -PI / 2; ring.frustumCulled = false;
  const inner = [0.62, 0.32].map((f) => { const m = K.add(root, new THREE.RingGeometry(R * f - 0.05, R * f, 36), inM, 0, 0.07, 0); m.rotation.x = -PI / 2; m.frustumCulled = false; return m; });
  const disc = K.add(root, new THREE.CircleGeometry(R, 40), K.B(0xff44dd, { transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }), 0, 0.06, 0); disc.rotation.x = -PI / 2; disc.frustumCulled = false;
  const st = { seed: 0 };
  return api(K, root, { head: cube, eyes: [] }, 2.2, 0.5, (dt, a) => {
    const state = a.state, time = a.time || 0, prog = clamp(a.progress || 0, 0, 1);
    const scan = state === 'scan', active = state === 'active', dead = state === 'dead', off = state === 'off';
    cube.position.y = TUNE.lag.hover + Math.sin(time * 1.7) * 0.12 - (dead ? 1 : 0);
    cube.rotation.y += dt * (active ? 2.4 : scan ? 5 : 0.8);
    st.seed += dt;
    for (let i = 0; i < shards.length; i++) {
      const tear = active || scan ? (Math.sin(time * 23 + i * 5) > 0.55 ? 0.28 : 0) : 0.02 * Math.sin(time * 3 + i);
      shards[i].position.x = tear * (i % 2 ? 1 : -1);
    }
    edges[0].visible = !off && !dead || Math.sin(time * 9) > 0; edges[1].visible = (active || scan) && Math.sin(time * 31) > -0.4;
    const flick = scan ? (Math.sin(time * 37) > 1 - 1.4 * prog ? 1 : 0.15) : 1;
    ring.visible = scan || active; ringM.opacity = (scan ? 0.15 + 0.5 * prog : 0.55 + 0.15 * Math.sin(time * 12)) * flick;
    disc.visible = scan || active; disc.material.opacity = scan ? 0.03 + 0.07 * prog : 0.08;
    for (let i = 0; i < inner.length; i++) { inner[i].visible = active; inner[i].scale.setScalar(1 + 0.05 * Math.sin(time * 6 + i * 2)); }
    inM.opacity = 0.25 + 0.2 * Math.sin(time * 8);
    coreM.color.setHex(dead ? 0x1a1a22 : 0x2a1440);
  });
}

/** register every model in the mod creature-model registry (window.__kefalMods.creatureModels) */
export function registerC12Models(reg) {
  if (!reg) return;
  const F = { c12_404: createNotFoundModel, c12_cookie: createCookieModel, c12_echo: createEchoModel, c12_lag: createLagModel };
  for (const [id, fn] of Object.entries(F)) if (!reg.has(id)) reg.set(id, () => fn());
}
