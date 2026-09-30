// CREATURES10 wave 10 - procedural PSX models: Buffering, The Doomscroller, The Ratio (docs/wave10/creatures10.md).
// Creature model contract of entities/creatures.js CreatureView: { root, parts, height, radius, update(dt, {state, speed, t, time, progress}), setElite,
// setHitFlash, setTint, dispose }, origin at the feet, facing +Z. `progress` = the host's c.extra (a number):
//   Buffering  0..1 fill of the ring towards the next buffer (>0.85 = lag flicker), 1 while buffering
//   Doomscroller 0..1 dwell meter (screens scroll faster / warmer), 1 in windup
//   Ratio      0 frozen, 0.5 creep, 1 rush (also carried by the state name)
// Original low-poly flat-shaded designs. Every glow is an emissive / basic material (fog off, not tone-mapped): NEVER a THREE light.
import * as THREE from 'three';

const PI = Math.PI, TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const smooth = (u) => u * u * (3 - 2 * u);

function kit() {
  const mats = [], geos = [], lam = [], extra = [];
  const L = (c, em = 0x000000) => { const m = new THREE.MeshLambertMaterial({ color: c, flatShading: true, emissive: em }); m.userData.instance = true; m.userData.em = new THREE.Color(em); mats.push(m); lam.push(m); return m; };
  const B = (c, o = {}) => { const m = new THREE.MeshBasicMaterial({ color: c, fog: false, toneMapped: false, ...o }); m.userData.instance = true; mats.push(m); return m; };
  const G = (g) => { geos.push(g); return g; };
  const add = (p, g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(G(g), m); o.position.set(x, y, z); p.add(o); return o; };
  const box = (p, m, sx, sy, sz, x, y, z) => add(p, new THREE.BoxGeometry(sx, sy, sz), m, x, y, z);
  const ball = (p, m, r, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = add(p, new THREE.SphereGeometry(r, 8, 6), m, x, y, z); o.scale.set(sx, sy, sz); return o; };
  const cone = (p, m, r, h, x, y, z, seg = 6) => add(p, new THREE.ConeGeometry(r, h, seg), m, x, y, z);
  const pivot = (p, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); return g; };
  const flash = (v) => { for (const m of lam) m.emissive.copy(m.userData.em).add(new THREE.Color(v * 0.7, v * 0.08, v * 0.08)); };
  const dispose = () => { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); for (const e of extra) e.dispose?.(); };
  return { L, B, G, add, box, ball, cone, pivot, flash, dispose, extra };
}
const api = (K, root, parts, height, radius, update) => ({
  root, parts, height, radius, update,
  setElite() {}, setTint() {}, isElite: () => false, setHitFlash: (v) => K.flash(v), dispose() { K.dispose(); },
});

// ================================================================================================ BUFFERING
// A tall, thin company man in a grey suit with a tie, arms to the knees. Where the face should be: a black disc with a loading spinner (10 dots, a fading
// tail) turning on it. The spinner is the whole rule: turning = moving; stuck and amber = your window; racing red = it is about to hit you.
export const BUF_RING = { n: 10, r: 0.32 };
const BUF_SPIN = { walk: 2.6, spin: 8, windup: 16, attack: 5, buffer: 0, resume: 0, stunned: 0.6, dead: 0, idle: 2.6 };
export function createBufferingModel(o = {}) {
  const K = kit(), root = new THREE.Group();
  const suit = K.L(0x20242c), shirt = K.L(0x9aa0aa), tie = K.L(0x5a1218, 0x12030a), skin = K.L(0x0b0c10), shoe = K.L(0x101114);
  const body = K.pivot(root, 0, 0, 0);
  const legs = [-1, 1].map((s) => {
    const hip = K.pivot(body, s * 0.1, 1.2, 0);
    K.box(hip, suit, 0.09, 1.16, 0.09, 0, -0.58, 0); K.box(hip, shoe, 0.11, 0.06, 0.2, 0, -1.17, 0.05);
    return hip;
  });
  K.box(body, suit, 0.3, 0.14, 0.17, 0, 1.24, 0);
  const torso = K.pivot(body, 0, 1.3, 0);
  K.box(torso, suit, 0.3, 0.86, 0.17, 0, 0.43, 0); K.box(torso, shirt, 0.08, 0.6, 0.012, 0, 0.5, 0.09); K.box(torso, tie, 0.05, 0.5, 0.012, 0, 0.42, 0.098);
  const arms = [-1, 1].map((s) => {
    const sh = K.pivot(torso, s * 0.2, 0.8, 0);
    K.box(sh, suit, 0.07, 0.62, 0.07, 0, -0.31, 0);
    const el = K.pivot(sh, 0, -0.62, 0); K.box(el, suit, 0.06, 0.6, 0.06, 0, -0.3, 0); K.box(el, skin, 0.08, 0.16, 0.05, 0, -0.66, 0);
    return { sh, el };
  });
  K.box(torso, suit, 0.06, 0.2, 0.06, 0, 0.95, 0);
  const head = K.pivot(torso, 0, 1.13, 0);
  const disc = K.add(head, new THREE.CylinderGeometry(0.36, 0.36, 0.08, 12), skin, 0, 0, 0); disc.rotation.x = PI / 2;
  const ring = K.pivot(head, 0, 0, 0.1);
  const dots = [];
  for (let i = 0; i < BUF_RING.n; i++) {
    const a = (i / BUF_RING.n) * TAU, m = K.B(0xbff4ff), d = K.box(ring, m, 0.15, 0.15, 0.04, Math.sin(a) * BUF_RING.r, Math.cos(a) * BUF_RING.r, 0);
    const kk = (i / BUF_RING.n) ** 1.6; d.scale.setScalar(0.7 + 0.5 * kk);   // the leading dot is the biggest
    d.rotation.z = -a; dots.push({ m, k: kk, lead: i === BUF_RING.n - 1 });   // the fading tail of a loading spinner
  }
  const bar = K.B(0xbff4ff); K.box(head, bar, 0.36, 0.02, 0.02, 0, -0.34, 0.03);   // a "progress bar" under the head: the fill is the time to the next buffer
  const fill = K.box(head, K.B(0xffffff), 0.34, 0.012, 0.03, 0, -0.34, 0.045);
  const st = { w: 2.6, phase: 0, lean: 0, arm: 0 }, col = new THREE.Color();
  const C_RUN = [0.72, 0.96, 1.0], C_BUF = [1.0, 0.72, 0.18], C_HIT = [1.0, 0.16, 0.1];
  const m = api(K, root, { head, eyes: [] }, 2.7, 0.4, (dt, a) => {
    const state = a.state, t = a.t || 0, prog = a.progress || 0, time = a.time || 0;
    // ---- ring rotation: it turns while it moves, coasts to a stop in ~0.4 s when it buffers, spins up during 'resume'
    let want = BUF_SPIN[state] ?? 2.6;
    if (state === 'resume') want = 3 + 13 * clamp(t / 0.8, 0, 1);
    if ((state === 'spin' || state === 'walk') && prog > 0.85) want *= 0.75 + 0.5 * Math.abs(Math.sin(time * 31));   // lag: it stutters just before it buffers
    st.w = damp(st.w, want, state === 'buffer' ? 9 : 6, dt);
    ring.rotation.z -= st.w * dt;
    // ---- colours: cyan while moving, amber + slow breathing while buffering, red racing before a hit
    let c = C_RUN, glow = 1;
    if (state === 'buffer') { c = C_BUF; glow = 0.85 + 0.15 * Math.sin(time * 4); }
    else if (state === 'resume') { const u = clamp(t / 0.8, 0, 1); c = [C_BUF[0] + (C_RUN[0] - C_BUF[0]) * u, C_BUF[1] + (C_RUN[1] - C_BUF[1]) * u, C_BUF[2] + (C_RUN[2] - C_BUF[2]) * u]; glow = 0.8 + 0.2 * Math.sin(time * 26); }
    else if (state === 'windup' || state === 'attack') { c = C_HIT; glow = 0.6 + 0.4 * Math.abs(Math.sin(time * 18)); }
    else if (state === 'dead') glow = 0.06;
    for (const d of dots) { const k = (state === 'buffer' ? 0.95 : 0.4 + 0.6 * d.k) * glow * (d.lead && state !== 'buffer' ? 1.4 : 1); d.m.color.setRGB(c[0] * k, c[1] * k, c[2] * k); }
    col.setRGB(c[0] * glow, c[1] * glow, c[2] * glow); bar.color.copy(col); fill.material.color.copy(col);
    const f = state === 'buffer' ? 0.99 : clamp(prog, 0.02, 1); fill.scale.x = Math.max(0.02, f * (state === 'buffer' ? 0.99 : 1)); fill.position.x = -0.17 * (1 - fill.scale.x);
    // ---- body: stiff stride while moving, slump + tremble while buffering, arms up before the strike
    const moving = (state === 'walk' || state === 'spin') ? clamp((a.speed || 0) / 3, 0, 1.6) : 0;
    st.phase += (a.speed || 0) * dt * 1.7;
    const sw = Math.sin(st.phase) * 0.5 * moving;
    legs[0].rotation.x = damp(legs[0].rotation.x, sw, 14, dt); legs[1].rotation.x = damp(legs[1].rotation.x, -sw, 14, dt);
    let armT = Math.sin(st.phase) * 0.25 * moving, armE = -0.1, leanT = 0.05 * moving, headT = 0;
    if (state === 'buffer') { leanT = 0.16; armT = 0.12; headT = 0.3 + Math.sin(time * 37) * 0.03; legs[0].rotation.x = legs[1].rotation.x = 0; }
    if (state === 'resume') { leanT = 0.1 - 0.1 * clamp(t / 0.8, 0, 1); headT = 0.3 * (1 - clamp(t / 0.8, 0, 1)); }
    if (state === 'windup') { armT = -1.55; armE = -0.35; leanT = -0.16; headT = -0.15; }
    if (state === 'attack') { armT = 0.5; armE = -0.15; leanT = 0.35; }
    if (state === 'dead') { armT = 0.2; leanT = 0; }
    st.lean = damp(st.lean, leanT, 10, dt); torso.rotation.x = st.lean;
    arms[0].sh.rotation.x = damp(arms[0].sh.rotation.x, armT, 12, dt); arms[1].sh.rotation.x = damp(arms[1].sh.rotation.x, state === 'windup' ? armT : -armT, 12, dt);
    arms[0].el.rotation.x = arms[1].el.rotation.x = damp(arms[0].el.rotation.x, armE, 12, dt);
    head.rotation.z = damp(head.rotation.z, headT, 10, dt);
  });
  return m;
}

// ================================================================================================ THE DOOMSCROLLER
// A chain of 8 phones crawling along the ceiling, screens down, each showing an endless feed. The head phone has a red REC dot and two thumb-like mandibles.
// The chain is a trail: every segment sits where the head was a moment ago (so it snakes through corridors and pours down when it drops).
const DS = { n: 8, gap: 0.62, hang: 0.55, floor: 0.04 };
function feedTexture(K, seed) {
  if (typeof document === 'undefined') return null;
  try {
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 96;
    const g = cv.getContext('2d'); g.fillStyle = '#0b1224'; g.fillRect(0, 0, 32, 96);
    let s = seed >>> 0 || 7; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let y = 2; y < 94;) {   // an endless feed: a thumbnail, two caption lines, a heart row, repeat
      const h = 14 + Math.floor(r() * 10);
      g.fillStyle = r() < 0.5 ? '#6f8fd6' : '#d68f6f'; g.fillRect(2, y, 28, h);
      g.fillStyle = '#d8e4ff'; g.fillRect(2, y + h + 2, 10 + Math.floor(r() * 18), 2); g.fillRect(2, y + h + 6, 6 + Math.floor(r() * 20), 2);
      g.fillStyle = '#ff5a78'; g.fillRect(2, y + h + 10, 4, 3);
      y += h + 17;
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    K.extra.push(tex);
    return tex;
  } catch { return null; }
}
export function createDoomscrollerModel(o = {}) {
  const K = kit(), root = new THREE.Group(), chain = new THREE.Group(); root.add(chain);
  const shell = K.L(0x14171d), metal = K.L(0x0a0b0e), rec = K.B(0xff2222), thumb = K.L(0xb5988c);
  const base = feedTexture(K, (o.seed || 1) * 7919);
  const segs = [];
  for (let i = 0; i < DS.n; i++) {
    const g = new THREE.Group(), head = i === 0, w = head ? 0.56 : 0.44, l = head ? 0.84 : 0.68 - i * 0.012;
    K.box(g, shell, w, 0.05, l, 0, 0, 0);
    const tex = base ? base.clone() : null; if (tex) { tex.needsUpdate = true; tex.offset.y = (i * 0.37) % 1; tex.repeat.set(1, 0.5); K.extra.push(tex); }
    const scrMat = K.B(0xbfd8ff, tex ? { map: tex } : {});
    const scr = K.add(g, new THREE.PlaneGeometry(w - 0.06, l - 0.08), scrMat, 0, -0.028, 0); scr.rotation.x = PI / 2;
    K.box(g, metal, w + 0.3, 0.03, 0.05, 0, 0.005, 0);   // the legs: one bar through the phone, scissoring
    const bar = g.children[g.children.length - 1];
    if (head) {
      K.add(g, new THREE.SphereGeometry(0.045, 6, 4), rec, 0, -0.03, l / 2 - 0.06);
      for (const s of [-1, 1]) { const m = K.cone(g, thumb, 0.06, 0.34, s * 0.14, -0.06, l / 2 + 0.12, 5); m.rotation.x = PI / 2 - 0.35; }
    }
    chain.add(g);
    segs.push({ g, tex, scrMat, bar, w, l });
  }
  const trail = [], tmp = new THREE.Vector3(), out = new THREE.Vector3(), dirA = new THREE.Vector3(), dirB = new THREE.Vector3();
  const st = { hang: 1, phase: 0, x: NaN, z: NaN, y: NaN, scroll: 0, gl: 0 };
  const pointAt = (s, res) => {   // position on the trail polyline s metres behind the head (trail[0] is the newest point)
    let acc = 0;
    for (let i = 0; i < trail.length - 1; i++) {
      const a = trail[i], b = trail[i + 1], d = a.distanceTo(b);
      if (acc + d >= s) return res.copy(a).lerp(b, d > 1e-6 ? (s - acc) / d : 0);
      acc += d;
    }
    return res.copy(trail[trail.length - 1]);
  };
  const m = api(K, root, { head: root, eyes: [] }, 0.6, 0.9, (dt, a) => {
    const state = a.state, time = a.time || 0, prog = a.progress || 0, t = a.t || 0;
    root.updateMatrixWorld?.();
    const hp = root.position, yaw = root.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
    if (!trail.length) for (let i = 0; i <= 14; i++) trail.push(new THREE.Vector3(hp.x - fx * i * 0.2, hp.y, hp.z - fz * i * 0.2));   // spawn: stretched out straight behind the head
    if (tmp.copy(hp).distanceTo(trail[0]) > 0.14) { trail.unshift(hp.clone()); let len = 0; for (let i = 1; i < trail.length; i++) { len += trail[i].distanceTo(trail[i - 1]); if (len > DS.n * DS.gap + 1.5) { trail.length = i + 1; break; } } }
    else trail[0].copy(hp);
    // ---- hang: on the ceiling the phones ride high with their screens down; sprawled on the floor they lie screens up
    const HANG = state === 'roam' || state === 'scroll' || state === 'windup' || state === 'drop';   // any other state (sprawl, the staged first sighting 'stare') lies on the floor
    const hangT = HANG ? 1 : state === 'climb' ? smooth(clamp(t / 2.2, 0, 1)) : state === 'stunned' || state === 'dead' ? st.hang : 0;
    st.hang = damp(st.hang, hangT, state === 'sprawl' ? 16 : 6, dt);
    const flip = (1 - st.hang) * PI;
    const moving = clamp((a.speed || 0) / 2, 0, 1.5); st.phase += (0.6 + moving * 7) * dt;
    // ---- feed scroll + colour (the tell): cold blue while it roams, warming with the dwell meter, red + frozen in windup, glitching when sprawled
    let rate = 0.22 + moving * 0.2, cr = 0.74, cg = 0.86, cb = 1.0;
    if (state === 'scroll') { rate = 0.4 + prog * 4.5; const k = prog * 0.9; cr = 0.74 + 0.26 * k; cg = 0.86 - 0.2 * k; cb = 1.0 - 0.6 * k; }
    else if (state === 'windup') { rate = 0; const f = Math.abs(Math.sin(time * 14)); cr = 1; cg = 0.1 + 0.15 * f; cb = 0.08; }
    else if (state === 'drop') rate = 6;
    else if (state === 'sprawl') { rate = (Math.sin(time * 40) > 0 ? 4 : -2); const f = Math.sin(time * 33) > 0.3 ? 1 : 0.25; cr = 0.9 * f; cg = 0.9 * f; cb = 1 * f; }
    else if (state === 'climb') rate = 1.2;
    else if (state === 'dead') { rate = 0; cr = cg = cb = 0.05; }
    st.scroll += rate * dt;
    const legAmp = state === 'sprawl' ? 0.7 : 0.32;
    for (let i = 0; i < segs.length; i++) {
      const sg = segs[i], s = i * DS.gap;
      pointAt(s, out); pointAt(s + 0.32, dirB); pointAt(Math.max(0, s - 0.32), dirA);
      dirA.sub(dirB);
      const ry = dirA.x * dirA.x + dirA.z * dirA.z > 1e-5 ? Math.atan2(dirA.x, dirA.z) - yaw : 0;
      out.sub(hp);
      sg.g.position.set(out.x * Math.cos(yaw) - out.z * Math.sin(yaw), out.y + DS.floor + (DS.hang - DS.floor) * st.hang, out.x * Math.sin(yaw) + out.z * Math.cos(yaw));
      sg.g.rotation.set(0, ry, flip);
      if (state === 'sprawl') sg.g.rotation.y += Math.sin(time * 9 + i * 1.7) * 0.25;
      sg.bar.rotation.y = Math.sin(st.phase + i * 0.9) * legAmp;
      if (sg.tex) sg.tex.offset.y = ((i * 0.37 + st.scroll * (1 + (i % 3) * 0.12)) % 1 + 1) % 1;
      sg.scrMat.color.setRGB(cr * (i === 0 ? 1 : 0.88), cg * (i === 0 ? 1 : 0.88), cb * (i === 0 ? 1 : 0.88));
    }
    rec.color.setRGB(Math.sin(time * 5) > 0 || state === 'windup' ? 1 : 0.25, 0.05, 0.05);
  });
  return m;
}

// ================================================================================================ THE RATIO
// One of a pair: a faceless ivory mannequin with a tilted head, mid-pose. A vertical eye slit and a chest panel glow: cold white = frozen (watched), amber = creeping,
// red pulse = rushing (the OTHER twin is being watched), white strobe = winding up. Odd seeds are the mirror image (the twin gets seed ^ 1).
export function createRatioModel(o = {}) {
  const K = kit(), root = new THREE.Group();
  const side = ((o.seed | 0) & 1) ? -1 : 1;
  const ivory = K.L(0xd8d3c6, 0x0a0a08), joint = K.L(0x26262b), glow = K.B(0x8fdcff), slit = K.B(0x8fdcff);
  const mir = new THREE.Group(); mir.scale.x = side; root.add(mir);   // the mirror image: negative scale (three flips the winding for us)
  const legs = [-1, 1].map((s) => {
    const hip = K.pivot(mir, s * 0.1, 0.96, 0);
    K.box(hip, ivory, 0.13, 0.46, 0.13, 0, -0.23, 0);
    const kn = K.pivot(hip, 0, -0.46, 0); K.box(kn, joint, 0.1, 0.06, 0.1, 0, 0, 0); K.box(kn, ivory, 0.11, 0.42, 0.11, 0, -0.23, 0); K.box(kn, joint, 0.12, 0.05, 0.22, 0, -0.45, 0.05);
    return { hip, kn };
  });
  K.box(mir, joint, 0.32, 0.12, 0.18, 0, 1.0, 0);
  const torso = K.pivot(mir, 0, 1.06, 0);
  K.box(torso, ivory, 0.34, 0.5, 0.2, 0, 0.25, 0); K.box(torso, ivory, 0.5, 0.1, 0.18, 0, 0.52, 0);
  K.box(torso, glow, 0.15, 0.2, 0.01, 0, 0.3, 0.106);   // the chest panel (the state tell)
  K.box(torso, joint, 0.06, 0.1, 0.06, 0, 0.62, 0);
  const arms = [-1, 1].map((s) => {
    const sh = K.pivot(torso, s * 0.27, 0.5, 0); K.box(sh, joint, 0.09, 0.09, 0.09, 0, 0, 0); K.box(sh, ivory, 0.075, 0.34, 0.075, 0, -0.17, 0);
    const el = K.pivot(sh, 0, -0.34, 0); K.box(el, joint, 0.07, 0.07, 0.07, 0, 0, 0); K.box(el, ivory, 0.065, 0.3, 0.065, 0, -0.15, 0); K.box(el, ivory, 0.05, 0.1, 0.09, 0, -0.34, 0);
    return { sh, el, s };
  });
  const head = K.pivot(torso, 0, 0.72, 0);
  K.ball(head, ivory, 0.13, 0, 0.1, 0, 1, 1.4, 1.05);
  K.box(head, slit, 0.014, 0.1, 0.012, 0, 0.1, 0.135);   // one vertical slit where a face would be
  const st = { phase: 0, lean: 0, held: 0, armL: 0, armR: 0 }, col = new THREE.Color();
  const m = api(K, root, { head, eyes: [] }, 1.9, 0.4, (dt, a) => {
    const state = a.state, time = a.time || 0, t = a.t || 0;
    const advancing = state === 'creep' || state === 'rush';
    if (advancing) st.phase += (a.speed || 0) * dt * (state === 'rush' ? 2.3 : 3.4);   // frozen mid-stride when watched: the phase simply stops
    const sw = Math.sin(st.phase) * (state === 'rush' ? 0.85 : 0.5);
    const frozen = !advancing;
    const k = frozen ? 40 : 14;
    legs[0].hip.rotation.x = damp(legs[0].hip.rotation.x, sw, k, dt); legs[1].hip.rotation.x = damp(legs[1].hip.rotation.x, -sw, k, dt);
    legs[0].kn.rotation.x = damp(legs[0].kn.rotation.x, Math.max(0, -sw) * 0.9, k, dt); legs[1].kn.rotation.x = damp(legs[1].kn.rotation.x, Math.max(0, sw) * 0.9, k, dt);
    // pose: a stiff shop-window pose (one arm bent up, one down, head tilted); rush leans in with arms forward; windup raises both
    let aL = 0.2, aR = -0.45, eL = -0.5, eR = -1.7, lean = 0, tilt = 0.28;
    if (state === 'rush') { aL = -0.9 + sw * 0.5; aR = -0.9 - sw * 0.5; eL = eR = -0.5; lean = 0.28; }
    else if (state === 'creep') { aL = sw * 0.35; aR = -sw * 0.35 - 0.3; eL = -0.2; eR = -1.1; lean = 0.08; }
    else if (state === 'windup') { aL = aR = -2.7 + Math.sin(time * 30) * 0.06; eL = eR = -0.2; lean = -0.2; tilt = -0.1; }
    else if (state === 'attack') { aL = aR = 0.7; eL = eR = -0.3; lean = 0.42; tilt = 0; }
    else if (state === 'dead') { aL = aR = 0.1; eL = eR = -0.1; tilt = 0.4; }
    st.lean = damp(st.lean, lean, 12, dt); torso.rotation.x = st.lean;
    arms[0].sh.rotation.x = damp(arms[0].sh.rotation.x, aL, k, dt); arms[1].sh.rotation.x = damp(arms[1].sh.rotation.x, aR, k, dt);
    arms[0].el.rotation.x = damp(arms[0].el.rotation.x, eL, k, dt); arms[1].el.rotation.x = damp(arms[1].el.rotation.x, eR, k, dt);
    head.rotation.z = damp(head.rotation.z, tilt, 10, dt);
    // tell colours
    let r = 0.55, g = 0.85, b = 1.0, lvl = 0.6;
    if (state === 'creep') { r = 1; g = 0.7; b = 0.2; lvl = 0.85; }
    else if (state === 'rush') { r = 1; g = 0.12; b = 0.08; lvl = 0.7 + 0.3 * Math.sin(time * 14); }
    else if (state === 'windup') { r = g = b = 1; lvl = Math.sin(time * 26) > 0 ? 1 : 0.25; }
    else if (state === 'attack') { r = 1; g = 0.2; b = 0.1; lvl = 1; }
    else if (state === 'statue') lvl = 0.3;
    else if (state === 'dead') lvl = 0.03;
    col.setRGB(r * lvl, g * lvl, b * lvl); glow.color.copy(col); slit.color.copy(col);
    void t;
  });
  return m;
}

/** register every model in the mod creature-model registry (window.__kefalMods.creatureModels) */
export function registerC10Models(reg) {
  if (!reg) return;
  const F = { c10_buffering: createBufferingModel, c10_doomscroller: createDoomscrollerModel, c10_ratio: createRatioModel };
  for (const [id, fn] of Object.entries(F)) if (!reg.has(id)) reg.set(id, (T, opts) => fn(opts || {}));
}
