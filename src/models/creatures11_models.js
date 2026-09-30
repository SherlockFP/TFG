// CREATURES11 wave 11 - procedural PSX models: The Captcha, The Moderator (Shadowban), The Recommended Ad (docs/wave11/creatures11.md).
// Creature model contract of entities/creatures.js CreatureView: { root, parts, height, radius, update(dt, {state, speed, t, time, progress}), setElite,
// setHitFlash, setTint, dispose }, origin at the feet, facing +Z. `progress` = the host's c.extra (a number):
//   Captcha      scan: 0..1 sweep | demand / off: 0..1 time left on the test / on the open gate | alarm: 1
//   Shadowban    0 lurking, 1 while a ban is running
//   Recommender  0..1 the fade-in of the glow / 0 otherwise
// Every glow is an emissive / basic material (fog off, not tone-mapped): NEVER a THREE light.
import * as THREE from 'three';
import { t } from '../core/i18n.js';

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
const api = (K, root, parts, height, radius, update) => ({ root, parts, height, radius, update, setElite() {}, setTint() {}, isElite: () => false, setHitFlash: (v) => K.flash(v), dispose() { K.dispose(); } });

// ================================================================================================ THE CAPTCHA
// A boxy kiosk that braces itself in a doorway on four legs. Both faces are a screen (it is planted, you meet it from either side):
//   dormant  pale panel + an empty checkbox ("I am not a robot")      scan   magenta panel + a sweeping bar (0.9 s: step back to cancel)
//   demand   amber panel + the 3x3 tile grid flickering + a draining time bar     off  green panel + a tick (slid aside, blinks in its last 3 s)
//   alarm    red panel + a big X + the siren spinning (1 s before the burst)       reload  dead grey
const CAP = { w: 1.25, h: 1.5, d: 0.5, cy: 1.25 };
export function createCaptchaModel() {
  const K = kit(), root = new THREE.Group();
  const shell = K.L(0x2b3138, 0x050608), metal = K.L(0x15181c), foot = K.L(0x0c0d10);
  const siren = K.B(0xff3322);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {   // four braces to the floor
    const leg = K.box(root, metal, 0.09, 1.1, 0.09, sx * 0.62, 0.55, sz * 0.2); leg.rotation.z = -sx * 0.16;
    K.box(root, foot, 0.2, 0.05, 0.22, sx * 0.7, 0.025, sz * 0.2);
  }
  K.box(root, shell, CAP.w, CAP.h, CAP.d, 0, CAP.cy, 0);
  K.box(root, metal, CAP.w + 0.12, 0.1, CAP.d + 0.1, 0, CAP.cy + CAP.h / 2 + 0.04, 0);
  const dome = K.add(root, new THREE.CylinderGeometry(0.1, 0.13, 0.14, 8), siren, 0, CAP.cy + CAP.h / 2 + 0.16, 0);
  const faces = [1, -1].map((s) => {
    const f = K.pivot(root, 0, CAP.cy, s * (CAP.d / 2 + 0.006)); if (s < 0) f.rotation.y = PI;
    const bgm = K.B(0xdfe9f2), bg = K.add(f, new THREE.PlaneGeometry(1.05, 1.2), bgm, 0, 0, 0);
    const ink = K.B(0x101820), out = [];
    for (const [w, h, x, y] of [[0.3, 0.035, -0.3, 0.42], [0.3, 0.035, -0.3, 0.14], [0.035, 0.3, -0.44, 0.28], [0.035, 0.3, -0.16, 0.28]]) out.push(K.add(f, new THREE.PlaneGeometry(w, h), ink, x, y, 0.004));
    const mark = [0, 1].map((i) => { const m = K.add(f, new THREE.PlaneGeometry(0.34, 0.06), K.B(0x1fa84a), -0.3, 0.28, 0.008); m.rotation.z = i ? -0.9 : 0.8; m.position.x += i ? 0.03 : -0.035; m.position.y += i ? 0.03 : -0.03; m.scale.x = i ? 1.35 : 0.6; m.visible = false; return m; });
    const bar = K.add(f, new THREE.PlaneGeometry(0.9, 0.05), K.B(0x5f9bff), 0, -0.53, 0.004); bar.visible = false;
    const tiles = []; for (let i = 0; i < 9; i++) tiles.push(K.add(f, new THREE.PlaneGeometry(0.24, 0.24), K.B(0x33465c), -0.27 + (i % 3) * 0.27, 0.05 - Math.floor(i / 3) * 0.27, 0.004));
    const sweep = K.add(f, new THREE.PlaneGeometry(1.0, 0.05), K.B(0xff44dd), 0, 0.5, 0.012); sweep.visible = false;
    return { bg, bgm, out, mark, bar, tiles, sweep };
  });
  const st = { spin: 0, tile: 0 }, col = new THREE.Color();
  const m = api(K, root, { head: dome, eyes: [] }, 2.1, 0.75, (dt, a) => {
    const state = a.state, time = a.time || 0, prog = clamp(a.progress || 0, 0, 1);
    let bg = 0xdfe9f2, sir = 0x1a0806, spin = 0;
    const blink = Math.sin(time * 16) > 0;
    if (state === 'scan') { bg = 0xf0b8f0; sir = 0xff44dd; spin = 6; }
    else if (state === 'demand') { bg = 0xffd98a; sir = 0xffaa00; spin = 3; }
    else if (state === 'off') { bg = prog < 0.15 && blink ? 0xfff2a0 : 0xa8f0b8; sir = 0x33ff66; }
    else if (state === 'alarm') { bg = blink ? 0xff5a4a : 0x8a1c14; sir = 0xff3322; spin = 14; }
    else if (state === 'reload' || state === 'dead') { bg = 0x4a5058; sir = 0x1a0806; }
    else if (state === 'stare') { bg = 0xdfe9f2; }
    st.spin += spin * dt;
    dome.rotation.y = st.spin; col.setHex(sir); siren.color.copy(col).multiplyScalar(spin ? 0.5 + 0.5 * Math.abs(Math.sin(st.spin * 2)) : 1);
    st.tile -= dt;
    for (const f of faces) {
      f.bgm.color.setHex(bg);
      const showBox = state === 'dormant' || state === 'off' || state === 'scan' || state === 'reload' || state === 'idle' || state === 'stare' || state === 'stunned';
      for (const o of f.out) o.visible = showBox && state !== 'off';
      for (const k of f.mark) { k.visible = state === 'off' || state === 'alarm'; k.material.color.setHex(state === 'alarm' ? 0x8a0a06 : 0x1fa84a); }
      if (state === 'alarm') { f.mark[0].rotation.z = 0.8; f.mark[1].rotation.z = -0.8; f.mark[0].scale.x = f.mark[1].scale.x = 1.9; f.mark[0].position.set(0, 0.05, 0.008); f.mark[1].position.set(0, 0.05, 0.008); }
      else { f.mark[0].rotation.z = 0.8; f.mark[1].rotation.z = -0.9; f.mark[0].scale.x = 0.6; f.mark[1].scale.x = 1.35; f.mark[0].position.set(-0.335, 0.25, 0.008); f.mark[1].position.set(-0.27, 0.31, 0.008); }
      f.sweep.visible = state === 'scan'; f.sweep.position.y = 0.55 - prog * 1.1;
      f.bar.visible = state === 'demand' || (state === 'off');
      f.bar.scale.x = Math.max(0.02, prog); f.bar.position.x = -0.45 * (1 - f.bar.scale.x);
      f.bar.material.color.setHex(state === 'off' ? 0x1fa84a : prog < 0.3 ? 0xff3b3b : 0x5f9bff);
      for (let i = 0; i < 9; i++) {
        const tl = f.tiles[i]; tl.visible = state === 'demand';
        if (state === 'demand' && st.tile <= 0) tl.material.color.setHex([0x33465c, 0x4a6a8a, 0x8a6a33, 0x5a3a6a, 0x3a6a4a][(Math.random() * 5) | 0]);
      }
    }
    if (st.tile <= 0) st.tile = 0.14;
    // planted and humming: a tiny shudder while it scans / demands
    root.rotation.z = state === 'demand' || state === 'alarm' ? Math.sin(time * 40) * 0.006 : 0;
  });
  return m;
}

// ================================================================================================ THE MODERATOR (Shadowban)
// A long dark coat with a hood and a red slit for eyes, dragging a gavel the size of a mallet. Over its head floats a circle-slash sign (the ban icon).
// Nearly invisible while it lurks; the sign and the eyes are the tell. It solidifies while it hunts its one target and slams the gavel after a 1 s wind-up.
export function createShadowbanModel() {
  const K = kit(), root = new THREE.Group();
  const coatM = K.B(0x090a10, { transparent: true, opacity: 0.25, depthWrite: false }), darkM = K.B(0x15161e, { transparent: true, opacity: 0.25, depthWrite: false });
  const eyeM = K.B(0xff2a2a), signM = K.B(0xff3a3a), woodM = K.B(0x3a2a1c, { transparent: true, opacity: 0.25, depthWrite: false });
  const fade = [coatM, darkM, woodM];
  const body = K.pivot(root, 0, 0, 0);
  const coat = K.add(body, new THREE.ConeGeometry(0.44, 1.6, 6), coatM, 0, 0.8, 0); coat.scale.z = 0.62;
  const torso = K.pivot(body, 0, 1.3, 0);
  K.box(torso, darkM, 0.4, 0.5, 0.24, 0, 0.1, 0);
  const head = K.pivot(torso, 0, 0.5, 0);
  K.add(head, new THREE.ConeGeometry(0.22, 0.5, 5), darkM, 0, 0.16, -0.02);
  K.add(head, new THREE.SphereGeometry(0.15, 6, 5), coatM, 0, 0, 0.02);
  const eyes = [-1, 1].map((s) => K.box(head, eyeM, 0.07, 0.02, 0.02, s * 0.06, 0.01, 0.16));
  const armL = K.pivot(torso, -0.26, 0.28, 0); K.box(armL, darkM, 0.08, 0.7, 0.08, 0, -0.32, 0);
  const armR = K.pivot(torso, 0.26, 0.28, 0); K.box(armR, darkM, 0.08, 0.7, 0.08, 0, -0.32, 0);
  const gavel = K.pivot(armR, 0, -0.66, 0.05);
  K.box(gavel, woodM, 0.05, 0.05, 1.15, 0, 0, 0.5);          // handle points forward when the arm hangs
  K.box(gavel, woodM, 0.3, 0.3, 0.5, 0, 0, 1.15);            // the head of the mallet
  K.box(gavel, K.B(0x6a6a72, { transparent: true, opacity: 0.4, depthWrite: false }), 0.32, 0.32, 0.06, 0, 0, 1.4);
  fade.push(gavel.children[2].material);
  const sign = K.pivot(root, 0, 2.55, 0);
  K.add(sign, new THREE.TorusGeometry(0.25, 0.035, 5, 14), signM, 0, 0, 0);
  const slash = K.box(sign, signM, 0.6, 0.06, 0.05, 0, 0, 0); slash.rotation.z = -0.8;
  const st = { a: 0.25, phase: 0, arm: 0, lean: 0, spin: 0 }, col = new THREE.Color();
  return api(K, root, { head, eyes }, 2.9, 0.45, (dt, a) => {
    const state = a.state, time = a.time || 0, tt = a.t || 0, moving = clamp((a.speed || 0) / 3, 0, 1.5);
    let alpha = 0.22, sg = 0.45, armT = 0.2, gT = -0.35, leanT = 0.05, ey = 0.9;
    if (state === 'mark') { alpha = Math.sin(time * 50) > 0 ? 0.95 : 0.4; sg = 1; armT = -0.5; leanT = -0.12; }
    else if (state === 'stalk') { alpha = 0.38; sg = 0.7 + 0.3 * Math.sin(time * 9); }
    else if (state === 'windup') { alpha = 0.7 + 0.3 * Math.sin(time * 26); sg = Math.sin(time * 30) > 0 ? 1 : 0.2; armT = -2.9; gT = 0.4; leanT = -0.2; }
    else if (state === 'attack') { alpha = 1; sg = 1; armT = 0.15; gT = -1.2; leanT = 0.45; }
    else if (state === 'off') { alpha = 0.5; sg = 0.1; armT = 0.5; leanT = 0.5; ey = 0.15; }
    else if (state === 'dead') { alpha = 0.1; sg = 0; ey = 0; }
    else if (state === 'lurk' || state === 'idle' || state === 'walk') { sg = 0.4 + 0.15 * Math.sin(time * 2); }
    st.a = damp(st.a, alpha, state === 'mark' ? 30 : 8, dt);
    for (const mm of fade) { mm.opacity = clamp(st.a, 0.02, 1); mm.depthWrite = st.a > 0.7; }
    const white = state === 'windup' && Math.sin(time * 30) > 0;
    col.setRGB(white ? 1 : 1, white ? 1 : 0.2, white ? 1 : 0.18); signM.color.copy(col).multiplyScalar(sg);
    eyeM.color.setRGB(ey, 0.1 * ey, 0.1 * ey);
    st.spin += dt * (state === 'stalk' ? 2.4 : 0.8); sign.rotation.y = st.spin; sign.position.y = 2.55 + Math.sin(time * 2.2) * 0.05;
    st.phase += (a.speed || 0) * dt * 1.6;
    st.lean = damp(st.lean, leanT + Math.sin(st.phase) * 0.04 * moving, 8, dt); body.rotation.x = st.lean;
    coat.rotation.z = Math.sin(st.phase) * 0.06 * moving;
    st.arm = damp(st.arm, armT, state === 'attack' ? 30 : 9, dt);
    armR.rotation.x = st.arm; armL.rotation.x = -0.2 + Math.sin(st.phase) * 0.3 * moving;
    gavel.rotation.x = damp(gavel.rotation.x, gT, 10, dt);
    body.position.y = Math.abs(Math.sin(st.phase * 0.5)) * 0.05 * moving;
    void tt;
  });
}

// ================================================================================================ THE RECOMMENDED AD (Recommender)
// A pop-up window floating at head height: blue title bar, a red close box, a fake product picture, five stars and a green BUY button. Before it exists
// a doorway-sized cyan frame with "RECOMMENDED FOR YOU" glows where it is about to appear (2 s). Wind-up: the window swells and the close box flashes.
function signTexture(K, text) {
  if (typeof document === 'undefined') return null;
  try {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const g = cv.getContext('2d'); g.clearRect(0, 0, 256, 64);
    let px = 30; g.font = px + 'px VT323, monospace'; while (px > 12 && g.measureText(text).width > 240) { px -= 2; g.font = px + 'px VT323, monospace'; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#b8f4ff';
    g.fillText(text, 128, 26); g.fillStyle = '#ffd23f'; g.font = '22px monospace'; g.fillText('*****', 128, 52);
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; K.extra.push(tex); return tex;
  } catch { return null; }
}
export function createRecommenderModel() {
  const K = kit(), root = new THREE.Group();
  const ad = K.pivot(root, 0, 1.35, 0), win = K.pivot(ad, 0, 0, 0);
  const frameM = K.B(0xe8eef8, { transparent: true }), titleM = K.B(0x1f5fe0, { transparent: true }), closeM = K.B(0xd83a30, { transparent: true });
  const picM = K.B(0x243044, { transparent: true }), buyM = K.B(0x28b856, { transparent: true }), starM = K.B(0xffd23f, { transparent: true }), inkM = K.B(0x101820, { transparent: true });
  const solids = [frameM, titleM, closeM, picM, buyM, starM, inkM];
  K.box(win, frameM, 1.1, 1.5, 0.06, 0, 0, 0);
  K.box(win, titleM, 1.06, 0.17, 0.02, 0, 0.62, 0.04);
  const close = K.box(win, closeM, 0.15, 0.13, 0.03, 0.44, 0.62, 0.06);
  K.box(win, picM, 0.9, 0.62, 0.02, 0, 0.12, 0.04);
  K.box(win, inkM, 0.3, 0.3, 0.02, -0.2, 0.12, 0.055); K.box(win, inkM, 0.24, 0.24, 0.02, 0.22, 0.05, 0.055);
  for (let i = 0; i < 5; i++) K.box(win, starM, 0.1, 0.1, 0.02, -0.3 + i * 0.15, -0.32, 0.05);
  K.box(win, buyM, 0.62, 0.15, 0.02, 0, -0.55, 0.05);
  // the doorway frame + sign that announces it
  const glowM = K.B(0x62e8ff, { transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  const glow = K.pivot(root, 0, 1.2, 0);
  for (const [w, h, x, y] of [[1.7, 0.06, 0, 1.18], [1.7, 0.06, 0, -1.18], [0.06, 2.42, -0.85, 0], [0.06, 2.42, 0.85, 0]]) K.box(glow, glowM, w, h, 0.03, x, y, 0);
  K.add(glow, new THREE.PlaneGeometry(1.64, 2.36), K.B(0x62e8ff, { transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }), 0, 0, 0);
  const tex = signTexture(K, t('RECOMMENDED FOR YOU'));
  const sign = K.add(glow, new THREE.PlaneGeometry(1.5, 0.375), new THREE.MeshBasicMaterial({ map: tex || null, color: tex ? 0xffffff : 0x62e8ff, transparent: true, fog: false, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }), 0, 0.55, 0.05);
  K.extra.push(sign.material);
  const st = { pop: 0, glow: 0, swell: 1 };
  return api(K, root, { head: ad, eyes: [] }, 2.4, 0.6, (dt, a) => {
    const state = a.state, time = a.time || 0, prog = clamp(a.progress || 0, 0, 1), tt = a.t || 0;
    const solid = state === 'ambush' || state === 'windup' || state === 'attack' || state === 'dismiss' || state === 'stunned' || state === 'dead';
    const glowT = state === 'foretell' ? 0.35 + 0.65 * prog : state === 'ambush' ? 0.1 : 0;
    st.glow = damp(st.glow, glowT, 8, dt);
    st.pop = damp(st.pop, solid ? 1 : 0, solid ? 14 : 20, dt);
    glow.visible = st.glow > 0.02; glowM.opacity = 0.18 + 0.3 * st.glow * (0.7 + 0.3 * Math.sin(time * 9));
    sign.material.opacity = st.glow;
    ad.visible = st.pop > 0.03 || state === 'foretell';
    let alpha = st.pop, sc = 0.2 + 0.8 * st.pop;
    if (state === 'foretell') { alpha = 0.12 + 0.1 * Math.sin(time * 7) + 0.25 * prog; sc = 1; }
    if (state === 'windup') { st.swell = damp(st.swell, 1.55, 3.2, dt); }
    else if (state === 'attack') st.swell = damp(st.swell, 1.9, 24, dt);
    else st.swell = damp(st.swell, 1, 8, dt);
    if (state === 'dismiss') { alpha = Math.sin(time * 60) > 0 ? 0.7 : 0.1; sc *= 1 - 0.5 * clamp(tt / 1.2, 0, 1); }
    if (state === 'dead') alpha = 0.3;
    for (const mm of solids) mm.opacity = clamp(alpha, 0, 1);
    win.scale.setScalar(Math.max(0.05, sc * st.swell));
    ad.position.y = 1.35 + Math.sin(time * 2.4) * 0.06 + (state === 'attack' ? -0.15 : 0);
    ad.position.z = state === 'attack' ? 0.9 : 0;
    ad.rotation.y = Math.sin(time * 1.1) * 0.1; win.rotation.z = state === 'windup' ? Math.sin(time * 34) * 0.05 : state === 'dead' ? 0.4 : 0;
    closeM.color.setHex(state === 'windup' ? (Math.sin(time * 30) > 0 ? 0xffffff : 0xff2010) : 0xd83a30);
    close.scale.setScalar(state === 'windup' ? 1.3 : 1);
    titleM.color.setHex(state === 'windup' || state === 'attack' ? 0xd83a30 : 0x1f5fe0);
  });
}

/** register every model in the mod creature-model registry (window.__kefalMods.creatureModels) */
export function registerC11Models(reg) {
  if (!reg) return;
  const F = { c11_captcha: createCaptchaModel, c11_shadowban: createShadowbanModel, c11_recommender: createRecommenderModel };
  for (const [id, fn] of Object.entries(F)) if (!reg.has(id)) reg.set(id, () => fn());
}
