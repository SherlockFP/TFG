// MOONS10 decor (wave 10, docs/wave10/moons10.md): the set dressing of the two new moons, registered as biome decor kinds 'tundra503' and 'feed8'
// (outdoor_biomes.js registerDecor; terrain.js builds it for every peer from the map seed, so layouts and colliders are identical).
//   tundra503  cooling towers venting steam (sprites), roofless data halls (walkable), half-buried server racks, snow drifts, the fallen satellite dish and the last
//              technician's hut (story beat: a heater, a monitor stuck on 503, 41 tally marks, a note), snowfall + gusts (wind layer follows the gust)
//   feed8      fallen phone-screen monoliths (frozen posts, half of them flicker), the colossal cracked phone at the horizon, the plug + its cable, red notification
//              badges hanging in the air, hot-pixel motes, the seated figure before a live slab (story beat: a note)
// Everything solid is merged through voyage_kit.Kit (2 draw calls for all of it) + a few instanced meshes; lights are pooled emitters only (constant light count).
// Layouts come from game/moons10_core.js (pure, node-tested). Math.random only drives visuals / audio timing.
import * as THREE from 'three';
import { registerDecor, DECOR_HELPERS } from './outdoor_biomes.js';
import { Kit } from './voyage_kit.js';
import { makeCanvasTexture } from '../render/textures.js';
import { getLang } from '../core/i18n.js';
import { RNG } from '../core/rng.js';
import { planTundra, planFeed, TUNDRA, FEED } from '../game/moons10_core.js';
import { tx } from '../game/moons10_text.js';

const { emitter, softPuffTexture, instancedProp, TAU } = DECOR_HELPERS;
const FONT = "'TFG Cyr VT','Arial Black','Arial Narrow',monospace";
const curLang = () => { try { return getLang(); } catch { return 'en'; } };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _e = new THREE.Euler(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------------------------------------ small helpers
/** lowest / highest ground within r of (x, z) */
function ground(C, x, z, r) {
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i < 9; i++) {
    const a = (i * TAU) / 8, y = i === 8 ? C.h(x, z) : C.h(x + Math.cos(a) * r, z + Math.sin(a) * r);
    if (y < lo) lo = y; if (y > hi) hi = y;
  }
  return { lo, hi, c: C.h(x, z) };
}
/** a Kit in a yawed frame anchored at (x, z): local (lx, lz) -> world, y is always ABSOLUTE */
class Frame {
  constructor(K, x, z, yaw) { this.K = K; this.x = x; this.z = z; this.yaw = yaw; this.co = Math.cos(yaw); this.si = Math.sin(yaw); }
  wx(lx, lz) { return this.x + lx * this.co + lz * this.si; }
  wz(lx, lz) { return this.z - lx * this.si + lz * this.co; }
  box(lx, y, lz, w, h, d, color, o = {}) { this.K.box(this.wx(lx, lz), y, this.wz(lx, lz), w, h, d, color, { ...o, ry: (o.ry || 0) + this.yaw }); }
  cyl(lx, y, lz, r, h, color, o = {}) { this.K.cyl(this.wx(lx, lz), y, this.wz(lx, lz), r, h, color, { ...o, ry: (o.ry || 0) + this.yaw }); }
  ico(lx, y, lz, r, color, o = {}) { this.K.ico(this.wx(lx, lz), y, this.wz(lx, lz), r, color, o); }
  light(lx, y, lz, color, i, d, f) { this.K.light(this.wx(lx, lz), y, this.wz(lx, lz), color, i, d, f); }
}
/** a thin cylinder from p0 to p1 (world), baked into the kit */
function strut(K, p0, p1, r, color, o = {}) {
  _v.set(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
  const L = _v.length();
  if (L < 0.05) return;
  _q.setFromUnitVectors(_Y, _v.normalize());
  _e.setFromQuaternion(_q, 'YXZ');
  K.cyl(p0.x, p0.y, p0.z, r, L, color, { seg: 5, ...o, rx: _e.x, ry: _e.y, rz: _e.z });
}
function wrapText(ctx, text, x, y, maxW, lh, maxLines = 99) {
  const words = String(text).split(' ');
  let line = '', n = 0;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; if (++n >= maxLines) return y; } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lh;
}
const basicMat = (C, map, o = {}) => C.mat(new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, fog: true, ...o }));
function planeMesh(C, mat, w, h) { return C.add(C.own(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat))); }
function tex(C, w, h, draw) { const t = makeCanvasTexture(w, h, draw); if (t) C.texs.push(t); return t; }

/** camera-relative drifting points (snow / hot pixels): world-fixed, wrapped around the camera. step(dt, t, gust) may tweak velocities */
function motes(C, o) {
  const n = o.n, box = o.box, H = o.h;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), ph = new Float32Array(n), cc = new THREE.Color();
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * box; pos[i * 3 + 1] = Math.random() * H; pos[i * 3 + 2] = (Math.random() - 0.5) * box;
    cc.set(o.colors[i % o.colors.length]); col.set([cc.r, cc.g, cc.b], i * 3); ph[i] = Math.random() * TAU;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = C.mat(new THREE.PointsMaterial({ size: o.size, vertexColors: true, transparent: true, opacity: o.opacity, depthWrite: false, fog: true, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  const pts = C.add(C.own(new THREE.Points(g, m)));
  pts.frustumCulled = false; pts.userData.noCull = true;
  let lx = null, lz = null;
  C.updaters.push((dt, t, game) => {
    const cam = game?.camera?.position;
    if (!cam) return;
    pts.visible = !(cam.y < -100 || game.env?.indoor);
    if (!pts.visible) return;
    pts.position.set(cam.x, cam.y - H * 0.35, cam.z);
    const mx = lx == null ? 0 : cam.x - lx, mz = lx == null ? 0 : cam.z - lz;
    lx = cam.x; lz = cam.z;
    const gust = o.gust ? o.gust(t) : 1, half = box / 2, P = pos;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      P[k] += (o.vx * gust + Math.sin(t * 0.8 + ph[i]) * o.sway) * dt - mx;
      P[k + 1] += o.vy * dt;
      P[k + 2] += (o.vz * gust + Math.cos(t * 0.7 + ph[i]) * o.sway) * dt - mz;
      if (P[k] > half) P[k] -= box; else if (P[k] < -half) P[k] += box;
      if (P[k + 2] > half) P[k + 2] -= box; else if (P[k + 2] < -half) P[k + 2] += box;
      if (P[k + 1] > H) P[k + 1] -= H; else if (P[k + 1] < 0) P[k + 1] += H;
    }
    g.attributes.position.needsUpdate = true;
  });
  return pts;
}
/** InstancedMesh without the quality thinning (colliders / story depend on every instance); colors: per-instance colour attribute */
function instMesh(C, geo, mat, list, colors = false) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((p, i) => {
    _q.setFromEuler(_e.set(p.rx || 0, p.ry || 0, p.rz || 0, 'YXZ'));
    _s.set(p.sx ?? p.s ?? 1, p.sy ?? p.s ?? 1, p.sz ?? p.s ?? 1);
    _m.compose(_p.set(p.x, p.y, p.z), _q, _s);
    if (p.local) _m.multiply(p.local);
    im.setMatrixAt(i, _m);
    if (colors) im.setColorAt(i, new THREE.Color(p.color ?? 0xffffff));
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  C.geos.push(geo);
  return C.add(im);
}
/** a paper note lying in the world: canvas text painted for the language of the map load (the [E] reader shows the full text) */
function notePaper(C, lang, key, x, y, z, yaw, w = 0.5, h = 0.36) {
  const t = tex(C, 192, 128, (c, W, H) => {
    c.fillStyle = '#e6dcb4'; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(120,90,50,0.22)'; c.fillRect(0, H - 18, W, 18);
    c.fillStyle = '#3a2c1a'; c.font = `bold 15px ${FONT}`; c.textAlign = 'left';
    c.fillText(tx(key + '_title', lang).slice(0, 26), 8, 18);
    c.font = `11px ${FONT}`; wrapText(c, tx(key, lang), 8, 34, W - 16, 13, 7);
  });
  const m = planeMesh(C, basicMat(C, t, { color: 0xd8d0b8 }), w, h);
  m.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ');
  m.position.set(x, y, z);
  return m;
}

// ================================================================================================ 503-SERVICE UNAVAILABLE
const T = { conc: 0x9aa8ba, concD: 0x6c788a, rust: 0x7a4a3a, snow: 0xe8f0fa, metal: 0x5c6a7c, rack: 0x2a3444, roof: 0x59667a, wood: 0x6a5a48, bag: 0x4a6a58 };
const GLOW = { warm: 0xffb070, green: 0x40ff80, red: 0xff3030, cyan: 0x6ad0ff, heat: 0xff8a3a };

function buildTundra(C) {
  const { R, terrain } = C;
  const lang = curLang();
  const P = planTundra({ seed: C.seed, half: terrain.half, entrance: C.plan.entrance, pathDist: (x, z) => terrain.distToPath(x, z), avoid: (x, z, m) => C.avoid(x, z, m) });
  C.info.kind = TUNDRA; C.info.plan = P; C.info.notes = []; C.info.audio = [];
  const K = new Kit(C, 0, 0, 0, 0);
  const steam = [];   // { x, y, z, r, n, ph[] }
  const reserve = (x, z, r) => { try { C.reserve?.(x, z, r); } catch { /* optional */ } };

  // ---- cooling towers
  for (let ti = 0; ti < P.towers.length; ti++) {
    const tw = P.towers[ti], g = ground(C, tw.x, tw.z, tw.r * 0.8), y0 = g.hi + 0.1, r = tw.r;
    reserve(tw.x, tw.z, r + 4);
    K.cyl(tw.x, g.lo - 2.5, tw.z, r * 1.02, y0 - (g.lo - 2.5) + 2.6, T.concD, { seg: 12, solid: true });                        // foot ring, buried
    const h1 = tw.h * 0.56, h2 = tw.h - h1 - 2.6;
    K.cyl(tw.x, y0 + 2.6, tw.z, r, h1, T.conc, { rTop: r * 0.72, seg: 12 });                                                     // shell, lower half (narrowing)
    if (tw.broken) {
      // collapsed: the upper shell is a jagged crown and a rubble ring
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * TAU + R.float(-0.15, 0.15), hh = R.float(1.2, 5.2), rr = r * 0.72;
        K.box(tw.x + Math.cos(a) * rr * 0.95, y0 + 2.6 + h1 - 0.4, tw.z + Math.sin(a) * rr * 0.95, r * 0.5, hh, 0.9, T.conc, { ry: -a + Math.PI / 2, rx: R.float(-0.25, 0.25) });
      }
      for (let k = 0; k < 8; k++) {
        const a = R.float(0, TAU), d = r * R.float(1.0, 1.55), sz = R.float(1.4, 3.2), gy = C.h(tw.x + Math.cos(a) * d, tw.z + Math.sin(a) * d);
        K.box(tw.x + Math.cos(a) * d, gy - 0.4, tw.z + Math.sin(a) * d, sz, sz * 0.8, sz * R.float(0.7, 1.2), k % 3 ? T.conc : T.concD, { ry: R.float(0, TAU), solid: sz > 1.8 });
      }
      steam.push({ x: tw.x, y: y0 + 2.6 + h1 + 1, z: tw.z, r: r * 0.5, n: 3 });
    } else {
      K.cyl(tw.x, y0 + 2.6 + h1, tw.z, r * 0.72, h2, T.conc, { rTop: r * 0.8, seg: 12 });                                          // upper half (widening again)
      K.cyl(tw.x, y0 + tw.h - 0.2, tw.z, r * 0.84, 0.9, 0xb8c4d4, { seg: 12 });                                                   // rim
      K.cyl(tw.x, y0 + tw.h + 0.6, tw.z, r * 0.74, 0.12, 0x10141c, { seg: 12 });                                                  // dark opening
      for (const a of [h1 * 0.3, h1 * 0.8, h1 + h2 * 0.5]) {   // shell joints (radius follows the hyperboloid profile)
        const rr = a < h1 ? r + (r * 0.72 - r) * (a / h1) : r * 0.72 + (r * 0.8 - r * 0.72) * ((a - h1) / h2);
        K.cyl(tw.x, y0 + 2.6 + a, tw.z, rr * 1.03, 0.45, T.concD, { seg: 12 });
      }
      steam.push({ x: tw.x, y: y0 + tw.h + 1, z: tw.z, r: r * 0.95, n: 8 });
      if (ti < 2) {   // aircraft beacon on the rim (still blinking for nobody)
        K.box(tw.x + r * 0.8, y0 + tw.h + 0.6, tw.z, 0.5, 0.5, 0.5, GLOW.red, { glow: true });
        emitter(C, tw.x + r * 0.8, y0 + tw.h + 1.4, tw.z, GLOW.red, 1.4, 22, 0.7);
      }
    }
    // rust streaks + a cold-lit maintenance door at the foot (the towers are the only warm-ish thing left: hum, light)
    const da = Math.atan2(-tw.z, -tw.x);   // door faces the ship
    for (let k = 0; k < 5; k++) { const a = R.float(0, TAU); K.box(tw.x + Math.cos(a) * r * 0.99, y0 + 3 + R.float(0, 6), tw.z + Math.sin(a) * r * 0.99, 0.5, R.float(4, 9), 0.25, T.rust, { ry: -a + Math.PI / 2 }); }
    K.box(tw.x + Math.cos(da) * (r * 1.005), y0 + 2.5, tw.z + Math.sin(da) * (r * 1.005), 3.2, 4.2, 0.3, 0x0c1420, { ry: -da + Math.PI / 2 });
    K.box(tw.x + Math.cos(da) * (r * 1.02), y0 + 2.6, tw.z + Math.sin(da) * (r * 1.02), 2.4, 0.5, 0.06, GLOW.cyan, { ry: -da + Math.PI / 2, glow: true });
    if (!tw.broken) emitter(C, tw.x + Math.cos(da) * (r + 2.5), y0 + 3.2, tw.z + Math.sin(da) * (r + 2.5), GLOW.cyan, 1.2, 14, 0.12);
    C.info.audio.push({ kind: 'groan', x: tw.x, y: y0 + 4, z: tw.z, r: r });
  }

  // ---- roofless data halls (walkable): perimeter walls with breaches, fallen roof slabs, two rows of racks
  P.halls.forEach((hl, hi) => {
    const g = ground(C, hl.x, hl.z, 12), F = new Frame(K, hl.x, hl.z, hl.yaw), WH = 5, top = g.hi + WH, bot = g.lo - 1.4, w = hl.w, d = hl.d, th = 0.6;
    reserve(hl.x, hl.z, 17);
    const wall = (lx, lz, len, alongX, gaps = []) => {
      const cuts = [-len / 2, ...gaps.flat(), len / 2];
      for (let i = 0; i < cuts.length; i += 2) {
        const a = cuts[i], b = cuts[i + 1];
        if (b - a < 0.3) continue;
        const mid = (a + b) / 2;
        if (alongX) F.box(lx + mid, bot, lz, b - a, top - bot, th, T.conc, { solid: true });
        else F.box(lx, bot, lz + mid, th, top - bot, b - a, T.conc, { solid: true });
      }
    };
    wall(0, -d / 2, w, true, [[-6.5, -3.5], [8, 10.5]]);          // long north wall: two breaches
    wall(0, d / 2, w, true, [[-2, 2]]);                            // long south wall: the door
    wall(-w / 2, 0, d, false, [[-2, 2]]);                           // short ends: doors
    wall(w / 2, 0, d, false, []);
    // roof remains: three slabs that came down + one still hanging on the beams
    for (let k = 0; k < 3; k++) F.box(R.float(-w / 2 + 3, w / 2 - 3), C.h(F.wx(0, 0), F.wz(0, 0)) + R.float(0.2, 1.3), R.float(-d / 2 + 2, d / 2 - 2), R.float(3, 5), 0.35, R.float(3, 4.5), T.concD, { ry: R.float(0, TAU), rz: R.float(-0.5, 0.5), rx: R.float(-0.4, 0.4) });
    F.box(w / 2 - 5, top - 0.2, 0, 8, 0.4, d + 1.2, T.concD);
    F.box(w / 2 - 9.1, top - 0.6, 0, 0.5, 0.6, d + 1.2, T.metal);
    // racks: two rows, a few alive
    let alive = 0;
    for (let row = 0; row < 2; row++) for (let k = 0; k < 6; k++) {
      const lx = -w / 2 + 5 + k * 3.6, lz = row ? 1.9 : -1.9, wx = F.wx(lx, lz), wz = F.wz(lx, lz), gy = C.h(wx, wz);
      const live = R.chance(0.28) && alive < 3;
      if (live) alive++;
      F.box(lx, gy - 0.05, lz, 0.85, 2.1, 1.1, T.rack, { solid: true, rx: R.chance(0.15) ? 0.35 : 0 });
      for (let led = 0; led < 4; led++) F.box(lx, gy + 0.3 + led * 0.45, lz + (row ? -0.56 : 0.56), 0.5, 0.06, 0.03, live ? (led % 2 ? GLOW.green : GLOW.cyan) : 0x18222e, { glow: true });
    }
    for (let k = 0; k < 3; k++) { const lx = -w / 2 + 2.6 + k * 9, wx = F.wx(lx, 0), wz = F.wz(lx, 0); F.box(lx, C.h(wx, wz) - 0.2, 0, R.float(2.2, 3.6), 0.7, R.float(1.6, 2.4), T.snow, { ry: R.float(0, TAU) }); }   // snow drifted in
    emitter(C, F.wx(0, 0), g.hi + 2.6, F.wz(0, 0), GLOW.cyan, 1.0, 12, 0.3);
    C.info.audio.push({ kind: 'beep', x: F.wx(0, 0), y: g.hi + 1.5, z: F.wz(0, 0), r: 16 });
    if (hi === 0) C.info.hall = { x: hl.x, z: hl.z };
  });

  // ---- the fallen satellite dish
  if (P.dish) {
    const D = P.dish, Rd = D.R, tilt = D.tilt, yaw = D.yaw, th = Math.asin(Rd / 34), Rs = 34;
    reserve(D.x, D.z, 23);
    const dishE = new THREE.Euler(tilt, yaw, 0, 'YXZ'), depth = Rs * (1 - Math.cos(th));
    const axis = new THREE.Vector3(0, 1, 0).applyEuler(dishE), front = new THREE.Vector3(0, 0, Rd).applyEuler(dishE);
    const gFront = C.h(D.x + front.x, D.z + front.z);
    const yc = gFront - front.y - 1.1;   // the low rim is buried about a metre deep
    const geo = new THREE.SphereGeometry(Rs, 18, 5, 0, TAU, Math.PI - th, th);
    geo.translate(0, Rs * Math.cos(th), 0);
    geo.computeVertexNormals();
    const mat = C.mat(new THREE.MeshLambertMaterial({ color: 0xc6d2e0, side: THREE.DoubleSide, flatShading: true }));
    const bowl = C.add(C.own(new THREE.Mesh(geo, mat)));
    bowl.rotation.set(tilt, yaw, 0, 'YXZ'); bowl.position.set(D.x, yc, D.z); bowl.userData.noCull = true;
    const focal = { x: D.x + axis.x * 12, y: yc + axis.y * 12, z: D.z + axis.z * 12 };
    // feed struts (one snapped), the feed horn, and the mount that is still holding the pole
    [0, Math.PI, Math.PI * 1.5].forEach((phi, i) => {
      _v.set(Math.cos(phi) * Rd, 0, Math.sin(phi) * Rd).applyEuler(dishE);
      const p0 = { x: D.x + _v.x, y: yc + _v.y, z: D.z + _v.z };
      const f = i === 1 ? 0.55 : 1;   // the snapped one
      strut(K, p0, { x: p0.x + (focal.x - p0.x) * f, y: p0.y + (focal.y - p0.y) * f, z: p0.z + (focal.z - p0.z) * f }, 0.28, T.metal);
    });
    K.cyl(focal.x, focal.y - 0.6, focal.z, 0.7, 1.6, T.concD, { rTop: 0.35, seg: 6 });
    K.box(focal.x - 0.2, focal.y + 0.8, focal.z - 0.2, 0.4, 0.4, 0.4, GLOW.cyan, { glow: true });
    _v.set(0, -depth, 0).applyEuler(dishE);
    const pole = { x: D.x + _v.x, y: yc + _v.y, z: D.z + _v.z };
    const bx = D.x - Math.sin(yaw) * 8, bz = D.z - Math.cos(yaw) * 8;
    strut(K, { x: bx, y: C.h(bx, bz) - 1, z: bz }, pole, 0.9, T.concD, { seg: 6 });
    K.box(bx, C.h(bx, bz) - 1.5, bz, 4.4, 3.2, 4.4, T.concD, { solid: true });   // mount block
    emitter(C, D.x, yc + 2.5, D.z, GLOW.cyan, 1.3, 18, 0.15);
    C.info.audio.push({ kind: 'groan', x: D.x, y: yc + 4, z: D.z, r: Rd });
    C.info.dish = { x: D.x, y: yc, z: D.z };
    // the fallen feed horn beside the hut, lying in the snow
    if (P.hut) K.cyl(P.hut.x - Math.cos(P.hut.yaw) * 6, C.h(P.hut.x, P.hut.z) + 0.55, P.hut.z + Math.sin(P.hut.yaw) * 6, 0.8, 4.6, T.conc, { rTop: 0.4, seg: 7, rz: Math.PI / 2, ry: P.hut.yaw, solid: true });
  }

  // ---- the technician's hut (story beat)
  if (P.hut) {
    const H = P.hut, F = new Frame(K, H.x, H.z, H.yaw), w = H.w, d = H.d;
    const door = { x: F.wx(1, d / 2 + 0.6), z: F.wz(1, d / 2 + 0.6) }, y0 = C.h(door.x, door.z) + 0.08, g = ground(C, H.x, H.z, 3.2);
    reserve(H.x, H.z, 6);
    F.box(0, g.lo - 1.6, 0, w + 0.5, y0 - (g.lo - 1.6), d + 0.5, T.concD, { solid: true });   // foundation (also the floor)
    const WT = 0.22, WH = 2.6;
    F.box(0, y0, -d / 2 + WT / 2, w, WH, WT, T.metal, { solid: true });                          // back
    F.box(-w / 2 + WT / 2, y0, 0, WT, WH, d, T.metal, { solid: true });                          // left
    F.box(w / 2 - WT / 2, y0, 0, WT, WH, d, T.metal, { solid: true });                           // right
    F.box(-1.125, y0, d / 2 - WT / 2, 2.95, WH, WT, T.metal, { solid: true });                   // front, left of the door
    F.box(2.125, y0, d / 2 - WT / 2, 0.95, WH, WT, T.metal, { solid: true });                    // front, right of the door
    F.box(1.0, y0 + 2.0, d / 2 - WT / 2, 1.3, WH - 2.0, WT, T.metal);                            // lintel
    F.box(-1.1, y0 + 1.15, d / 2 + 0.02, 0.9, 0.6, 0.05, GLOW.warm, { glow: true });           // window
    F.box(0, y0 + WH, 0, w + 0.9, 0.26, d + 0.9, T.roof, { solid: true });                       // roof
    F.box(0, y0 + WH + 0.26, 0, w + 0.7, 0.2, d + 0.7, T.snow);
    F.cyl(-1.8, y0 + WH + 0.26, -1.0, 0.16, 1.3, T.concD, { seg: 6 });                          // stove pipe
    steam.push({ x: F.wx(-1.8, -1.0), y: y0 + WH + 1.7, z: F.wz(-1.8, -1.0), r: 0.5, n: 3 });
    F.box(-1.6, y0, -1.1, 0.85, 0.35, 1.9, T.bag);                                                // cot + sleeping bag
    F.box(-1.6, y0 + 0.35, -1.85, 0.6, 0.12, 0.4, 0xd8d0c0);
    F.box(1.6, y0, -1.4, 1.5, 0.75, 0.7, T.wood, { solid: true });                                // desk
    F.box(1.75, y0 + 0.75, -1.55, 0.7, 0.5, 0.1, 0x14181f);                                       // monitor body
    F.box(-0.2, y0, -1.6, 0.55, 0.7, 0.4, 0x4a4a52, { solid: true });                             // heater
    F.box(-0.2, y0 + 0.15, -1.39, 0.36, 0.3, 0.03, GLOW.heat, { glow: true });
    F.cyl(0.95, y0 + 0.75, -1.6, 0.07, 0.2, 0xd8d8d0, { seg: 6 });                               // thermos
    F.light(-0.2, y0 + 1.0, -1.0, GLOW.heat, 1.8, 13, 0.14);
    // the monitor: stuck on 503; the wall: 41 tally marks
    const scr = tex(C, 128, 96, (c, W, Ht) => {
      c.fillStyle = '#0a1a14'; c.fillRect(0, 0, W, Ht);
      c.fillStyle = '#6dff9a'; c.textAlign = 'center';
      c.font = `bold 40px ${FONT}`; c.fillText(tx('scr_503', lang), W / 2, 40);
      c.font = `bold 11px ${FONT}`; c.fillText(tx('scr_503_sub', lang), W / 2, 58, W - 8);
      c.font = `10px ${FONT}`; c.fillStyle = '#3aa866'; c.fillText(tx('scr_retry', lang), W / 2, 76, W - 8);
      c.fillStyle = '#6dff9a'; c.fillRect(W / 2 + 28, 82, 6, 8);
    });
    const smat = basicMat(C, scr);
    const sm = planeMesh(C, smat, 0.62, 0.42);
    sm.position.set(F.wx(1.75, -1.49), y0 + 1.03, F.wz(1.75, -1.49)); sm.rotation.y = H.yaw;
    C.updaters.push((dt, t) => { smat.color.setScalar(0.85 + 0.15 * Math.sin(t * 9) * (Math.random() < 0.04 ? 0.3 : 1)); });
    const tally = tex(C, 128, 72, (c, W, Ht) => {
      c.fillStyle = '#26303a'; c.fillRect(0, 0, W, Ht);
      c.strokeStyle = '#d8e0e8'; c.lineWidth = 2;
      for (let n = 0; n < 41; n++) {
        const grp = Math.floor(n / 5), k = n % 5, gx = 8 + (grp % 8) * 15, gy = 10 + Math.floor(grp / 8) * 22;
        if (k < 4) { c.beginPath(); c.moveTo(gx + k * 3, gy); c.lineTo(gx + k * 3, gy + 14); c.stroke(); } else { c.beginPath(); c.moveTo(gx - 2, gy + 12); c.lineTo(gx + 12, gy + 2); c.stroke(); }
      }
    });
    const tm = planeMesh(C, basicMat(C, tally, { color: 0xb8c0c8 }), 1.6, 0.9);
    tm.position.set(F.wx(-1.4, -d / 2 + 0.14), y0 + 1.55, F.wz(-1.4, -d / 2 + 0.14)); tm.rotation.y = H.yaw;
    const nx = F.wx(1.0, -1.35), nz = F.wz(1.0, -1.35);
    notePaper(C, lang, 'x503_note', nx, y0 + 0.78, nz, H.yaw + 0.3, 0.34, 0.24);
    C.info.notes.push({ id: 'x503_note', x: nx, y: y0 + 0.9, z: nz });
    for (const s of P.scrap.slice(0, 1)) C.scrapSpots.push({ x: s.x, z: s.z });
  }
  if (P.halls[0]) C.scrapSpots.push({ x: P.halls[0].x, z: P.halls[0].z });

  // ---- half-buried racks + drifts
  const racks = [];
  P.racks.forEach((r, i) => {
    const y = C.h(r.x, r.z) - r.sink;
    racks.push({ x: r.x, y, z: r.z, ry: r.ry, rx: r.tx, rz: r.tz, s: r.s });
    C.addBox(r.x, y + 1.0, r.z, 0.7, 2.0, 1.05, r.ry);
    if (i < 6) emitter(C, r.x, y + 2.1, r.z, i % 2 ? GLOW.green : GLOW.red, 0.8, 6.5, 0.6);
  });
  instancedProp(C, 'server_rack_prop', racks, 0xa4b4c8);
  const dGeo = new THREE.IcosahedronGeometry(1, 1); dGeo.scale(1, 0.32, 1);
  instMesh(C, dGeo, C.mat(new THREE.MeshLambertMaterial({ color: 0xe6eef8, flatShading: true })), P.drifts.map((d) => ({ x: d.x, y: C.h(d.x, d.z) - 0.05, z: d.z, ry: d.ry, s: d.s })));
  K.finish().forEach((m) => { m.userData.noCull = true; });

  // ---- steam over the towers (sprites, blown downwind), snowfall, gusts
  const puff = softPuffTexture(C);
  const wind = { x: 0.86, z: 0.33 };
  const sprites = [];
  if (puff) for (const s of steam) for (let k = 0; k < s.n; k++) {
    const mat = C.mat(new THREE.SpriteMaterial({ map: puff, color: 0xe4eef8, transparent: true, opacity: 0.5, depthWrite: false, fog: true }));
    const sp = C.add(new THREE.Sprite(mat)); sp.userData.noCull = true;
    sprites.push({ sp, mat, s, ph: k / s.n + R.float(0, 0.05) });
  }
  const gustAt = (t) => clamp(0.62 + 0.38 * Math.sin(t * 0.37) * Math.sin(t * 0.11 + 1.3), 0.15, 1);
  C.updaters.push((dt, t, game) => {
    const cam = game?.camera?.position;
    for (const p of sprites) {
      const near = !cam || (cam.x - p.s.x) ** 2 + (cam.z - p.s.z) ** 2 < 260 * 260;
      p.sp.visible = near;
      if (!near) continue;
      const k = (t * (p.s.r > 3 ? 0.045 : 0.075) + p.ph) % 1, gs = 0.7 + gustAt(t) * 0.6;
      p.sp.position.set(p.s.x + wind.x * k * 26 * gs, p.s.y + k * (p.s.r > 3 ? 30 : 9), p.s.z + wind.z * k * 26 * gs);
      const sc = p.s.r * (0.9 + k * 2.6);
      p.sp.scale.set(sc, sc, 1);
      p.mat.opacity = 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (p.s.r > 3 ? 1 : 0.8);
    }
  });
  motes(C, { n: 650, box: 46, h: 22, colors: [0xffffff, 0xdce8ff], size: 0.12, opacity: 0.9, additive: false, vx: 1.6, vy: -1.5, vz: 0.5, sway: 0.5, gust: gustAt });
  // wind layer follows the gust (the same 'wind' loop the weather uses; only outdoors)
  let windT = 0, sndT = 6;
  C.updaters.push((dt, t, game) => {
    const cam = game?.camera?.position;
    if (!cam || game.env?.indoor || game.player?.indoor) return;
    windT -= dt;
    if (windT <= 0) { windT = 0.45; try { game.audio?.setAmbience?.('wind', 'wind', 0.2 + gustAt(t) * 0.5, 1.2); } catch { /* audio optional */ } }
    sndT -= dt;
    if (sndT > 0) return;
    sndT = 14 + Math.random() * 22;
    const near = C.info.audio.filter((a) => (cam.x - a.x) ** 2 + (cam.z - a.z) ** 2 < 75 * 75);
    if (!near.length) return;
    const a = near[Math.floor(Math.random() * near.length)], au = game.audio;
    _v.set(a.x, a.y, a.z);
    try {
      if (a.kind === 'groan' && au?.has?.('pipe_groan')) au.at('pipe_groan', _v.clone(), 0.5);
      else if (a.kind === 'beep' && au?.has?.('bios_beep')) { au.at('hdd_click', _v.clone(), 0.5); setTimeout(() => { try { au.at('bios_beep', _v.clone(), 0.35); } catch { /* audio optional */ } }, 420); }
    } catch { /* audio optional */ }
  });
}

// ================================================================================================ ∞-FEED
const F8 = { body: 0x1c1622, rail: 0x6a5a7a, sand: 0xd8a89a, cloth: 0x3a3a52, hood: 0x2c2c40 };

/** the painted screens: 0 selfie post, 1 caught up, 2 loading, 3 get rich, 4 someone you may know, 5 video unavailable, 6 dead */
function drawScreen(c, W, H, v, lang, rnd) {
  const bar = (col) => { c.fillStyle = col; c.fillRect(0, 0, W, 12); c.fillStyle = '#fff'; c.font = `bold 9px ${FONT}`; c.textAlign = 'left'; c.fillText('3:47', 5, 9); c.fillStyle = '#fff'; c.fillRect(W - 22, 3, 14, 6); c.fillStyle = col; c.fillRect(W - 21, 4, 3, 4); };
  const crack = (x0, y0, n) => { c.strokeStyle = 'rgba(210,240,255,0.9)'; c.lineWidth = 1; for (let i = 0; i < n; i++) { let x = x0, y = y0; c.beginPath(); c.moveTo(x, y); const a = rnd() * TAU; for (let s = 0; s < 4; s++) { x += Math.cos(a + (rnd() - 0.5) * 0.9) * (10 + rnd() * 18); y += Math.sin(a + (rnd() - 0.5) * 0.9) * (10 + rnd() * 18); c.lineTo(x, y); } c.stroke(); } };
  c.textAlign = 'center';
  if (v === 0) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#ff7ab0'); g.addColorStop(1, '#ffb060'); c.fillStyle = g; c.fillRect(0, 0, W, H); bar('rgba(0,0,0,0.25)');
    c.fillStyle = '#fff'; c.beginPath(); c.arc(14, 26, 8, 0, TAU); c.fill(); c.fillStyle = '#2a1a30'; c.font = `bold 10px ${FONT}`; c.textAlign = 'left'; c.fillText('@djay_4ever', 28, 29);
    c.fillStyle = '#ffe0c8'; c.fillRect(8, 40, W - 16, 88); c.fillStyle = '#2a1a30'; c.beginPath(); c.arc(W / 2 - 12, 78, 3, 0, TAU); c.arc(W / 2 + 12, 78, 3, 0, TAU); c.fill(); c.beginPath(); c.arc(W / 2, 90, 14, 0.15 * Math.PI, 0.85 * Math.PI); c.lineWidth = 3; c.strokeStyle = '#2a1a30'; c.stroke();
    c.fillStyle = '#ff2a5a'; c.font = `bold 16px ${FONT}`; c.fillText('♥ 4.1M', 10, 150); c.fillStyle = '#fff'; c.font = `10px ${FONT}`; wrapText(c, tx('scr_morning', lang), 10, 168, W - 20, 12, 3);
  } else if (v === 1) {
    c.fillStyle = '#0c1226'; c.fillRect(0, 0, W, H); bar('rgba(255,255,255,0.08)');
    c.strokeStyle = '#5af0ff'; c.lineWidth = 4; c.beginPath(); c.arc(W / 2, 70, 26, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(W / 2 - 12, 70); c.lineTo(W / 2 - 3, 80); c.lineTo(W / 2 + 14, 58); c.stroke();
    c.fillStyle = '#fff'; c.font = `bold 12px ${FONT}`; c.textAlign = 'center'; wrapText(c, tx('scr_caught', lang), W / 2, 122, W - 12, 14, 2); c.fillStyle = '#7a86a8'; c.font = `10px ${FONT}`; c.fillText(tx('scr_kidding', lang), W / 2, 158, W - 8);
    c.fillStyle = '#1c2440'; for (let i = 0; i < 3; i++) c.fillRect(14, 172 + i * 12, W - 28 - i * 16, 6);
  } else if (v === 2) {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H); bar('rgba(255,255,255,0.1)');
    c.strokeStyle = '#fff'; c.lineWidth = 5; c.beginPath(); c.arc(W / 2, 86, 24, 0.4, 0.4 + Math.PI * 1.55); c.stroke();
    c.fillStyle = '#9aa0b0'; c.font = `11px ${FONT}`; c.fillText(tx('scr_loading', lang), W / 2, 138, W - 8);
  } else if (v === 3) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#f6ea3a'); g.addColorStop(1, '#5adf6a'); c.fillStyle = g; c.fillRect(0, 0, W, H); bar('rgba(0,0,0,0.3)');
    c.fillStyle = '#10140a'; c.font = `bold 16px ${FONT}`; wrapText(c, tx('scr_rich', lang), W / 2, 48, W - 12, 19, 4); c.font = `bold 60px ${FONT}`; c.fillText('$', W / 2, 140);
    c.font = `10px ${FONT}`; c.fillText(tx('scr_part', lang), W / 2, 176, W - 8); c.beginPath(); c.moveTo(W / 2 - 8, 186); c.lineTo(W / 2 + 10, 194); c.lineTo(W / 2 - 8, 202); c.fill();
  } else if (v === 4) {
    c.fillStyle = '#120c18'; c.fillRect(0, 0, W, H); bar('rgba(255,255,255,0.08)');
    c.fillStyle = '#8a8298'; c.font = `10px ${FONT}`; c.fillText(tx('scr_know', lang), W / 2, 34, W - 8);
    c.fillStyle = '#3a3448'; c.beginPath(); c.arc(W / 2, 74, 18, 0, TAU); c.fill(); c.beginPath(); c.arc(W / 2, 120, 32, Math.PI, 0); c.fill();
    c.fillStyle = '#ff2a4a'; c.font = `bold 26px ${FONT}`; c.fillText(tx('scr_you', lang), W / 2, 168, W - 8);
    c.fillStyle = '#3a8aff'; c.fillRect(W / 2 - 18, 178, 36, 12); c.fillStyle = '#fff'; c.fillRect(W / 2 - 3, 181, 6, 6);
  } else if (v === 5) {
    c.fillStyle = '#2a2a30'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) { const s = 60 + Math.floor(rnd() * 120); c.fillStyle = `rgb(${s},${s},${s + 6})`; c.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), 4, 3); }
    bar('rgba(0,0,0,0.5)'); c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 70, W, 60); c.fillStyle = '#fff'; c.font = `bold 11px ${FONT}`; wrapText(c, tx('scr_novideo', lang), W / 2, 96, W - 12, 14, 2);
  } else {
    c.fillStyle = '#04030a'; c.fillRect(0, 0, W, H); c.fillStyle = '#3a3a52'; c.font = `bold 10px ${FONT}`; c.fillText(tx('scr_nosignal', lang), W / 2, H / 2, W - 8); crack(W * 0.35, H * 0.4, 6);
  }
  if (v !== 6 && rnd() < 0.5) crack(W * (0.25 + rnd() * 0.5), H * (0.2 + rnd() * 0.5), 3);
}
function drawGiant(c, W, H, mode, lang, rnd) {
  if (mode === 0) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a1650'); g.addColorStop(0.6, '#c0367e'); g.addColorStop(1, '#ff9a6a'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = '#0a0812'; c.beginPath(); c.roundRect?.(W / 2 - 22, 5, 44, 11, 5); c.fill(); if (!c.roundRect) c.fillRect(W / 2 - 22, 5, 44, 11);
    c.fillStyle = '#ff2a3a'; c.fillRect(W - 40, 8, 26, 10); c.fillRect(W - 14, 11, 3, 4); c.fillStyle = '#fff'; c.font = `bold 11px ${FONT}`; c.textAlign = 'left'; c.fillText('1%', W - 62, 17);
    c.strokeStyle = '#5af0ff'; c.lineWidth = 6; c.beginPath(); c.arc(W / 2, 190, 52, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(W / 2 - 24, 190); c.lineTo(W / 2 - 6, 210); c.lineTo(W / 2 + 28, 168); c.stroke();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = `bold 26px ${FONT}`; wrapText(c, tx('scr_caught', lang), W / 2, 290, W - 20, 30, 2); c.fillStyle = '#ffd0e0'; c.font = `16px ${FONT}`; c.fillText(tx('scr_kidding', lang), W / 2, 356, W - 16);
    c.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < 5; i++) c.fillRect(24, 390 + i * 20, W - 48 - (i % 3) * 30, 9);
    // the impact crack: a web from one point
    const cx = W * 0.62, cy = H * 0.34;
    c.strokeStyle = 'rgba(235,250,255,0.95)'; c.lineWidth = 2;
    for (let i = 0; i < 16; i++) { let x = cx, y = cy; const a = (i / 16) * TAU + rnd() * 0.3; c.beginPath(); c.moveTo(x, y); for (let s = 0; s < 6; s++) { x += Math.cos(a + (rnd() - 0.5) * 0.7) * (16 + rnd() * 40); y += Math.sin(a + (rnd() - 0.5) * 0.7) * (16 + rnd() * 40); c.lineTo(x, y); } c.stroke(); }
    c.lineWidth = 1; for (let r = 24; r < 150; r += 34) { c.beginPath(); for (let i = 0; i <= 16; i++) { const a = (i / 16) * TAU, rr = r * (0.85 + rnd() * 0.3); c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } c.stroke(); }
  } else {
    c.fillStyle = '#100608'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#ff2a3a'; c.lineWidth = 8; c.strokeRect(W / 2 - 60, H / 2 - 34, 110, 68); c.fillStyle = '#ff2a3a'; c.fillRect(W / 2 + 50, H / 2 - 12, 10, 24); c.fillRect(W / 2 - 54, H / 2 - 28, 12, 56);
    c.fillStyle = '#ff5a5a'; c.font = `bold 40px ${FONT}`; c.textAlign = 'center'; c.fillText('1%', W / 2, H / 2 + 100);
  }
}

function buildFeed(C) {
  const { R, terrain } = C;
  const lang = curLang();
  const P = planFeed({ seed: C.seed, half: terrain.half, entrance: C.plan.entrance, pathDist: (x, z) => terrain.distToPath(x, z), avoid: (x, z, m) => C.avoid(x, z, m) });
  C.info.kind = FEED; C.info.plan = P; C.info.notes = []; C.info.audio = [];
  const K = new Kit(C, 0, 0, 0, 0);
  const reserve = (x, z, r) => { try { C.reserve?.(x, z, r); } catch { /* optional */ } };
  const rot = (rx, ry, rz) => new THREE.Euler(rx, ry, rz, 'YXZ');
  /** base point + euler-rotated local offset */
  const at = (b, e, lx, ly, lz) => _v.set(lx, ly, lz).applyEuler(e).add(b).clone();

  // ---- variant textures (one InstancedMesh per variant; per-instance colour = brightness: live slabs flicker, dead ones are dim)
  const seedR = new RNG((C.seed ^ 0x5eed) >>> 0);
  const variantMats = [];
  for (let v = 0; v < 7; v++) {
    const t = tex(C, 96, 200, (c, W, H) => drawScreen(c, W, H, v, lang, () => seedR.next()));
    variantMats.push(basicMat(C, t, { side: THREE.FrontSide }));
  }
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const byVariant = variantMats.map(() => []);
  const live = [];   // { v, i, ph, next, burst, x, z }
  let slabIdx = 0, lightN = 0;
  for (const s of P.slabs) {
    const gy = C.h(s.x, s.z), sink = s.sink ?? 0.3, yb = gy - s.h * sink, e = rot(s.rx, s.ry, s.rz);
    K.box(s.x, yb, s.z, s.w, s.h, s.d, F8.body, { rx: s.rx, ry: s.ry, rz: s.rz });
    const rp = at({ x: s.x, y: yb, z: s.z }, e, 0, s.h * 0.5, s.d / 2 + 0.03);
    _q.setFromEuler(e);
    _m.compose(rp, _q, _s.set(s.w * 0.9, s.h * 0.93, 1));
    const list = byVariant[s.variant];
    list.push({ mat: _m.clone(), live: s.live, x: s.x, z: s.z, h: s.h, ry: s.ry, idx: slabIdx });
    // the collider: the standing part of the slab, unrotated (tilt is small)
    C.addBox(s.x, yb + s.h * 0.36, s.z, s.w, s.h * 0.72, Math.max(0.8, s.d * 1.5), s.ry);
    slabIdx++;
    if (s.live && s.variant !== 6 && (s.beat || lightN < 5)) {   // the first live monoliths light the sand in front of them (pooled emitters)
      const fx = Math.sin(s.ry) * 2.6, fz = Math.cos(s.ry) * 2.6;
      emitter(C, s.x + fx, gy + 3.2, s.z + fz, (s.beat ? 1 : lightN++) % 2 ? 0x5af0ff : 0xff5ac8, s.beat ? 1.4 : 1.2, s.beat ? 14 : 15, 0.25);
    }
  }
  // ---- the screens (instanced per variant)
  const screens = [];
  variantMats.forEach((mat, v) => {
    const list = byVariant[v];
    if (!list.length) return;
    const im = new THREE.InstancedMesh(planeGeo, mat, list.length);
    list.forEach((it, i) => { im.setMatrixAt(i, it.mat); im.setColorAt(i, new THREE.Color(it.live ? 1 : 0.4)); if (it.live) live.push({ im, i, v, x: it.x, z: it.z, ph: R.float(0, TAU), next: 1 + R.float(0, 5), burst: 0, base: 1 }); });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.frustumCulled = false; im.userData.noCull = true;
    C.add(im); screens.push(im);
  });
  C.geos.push(planeGeo);

  // ---- the colossus at the horizon
  if (P.giant) {
    const g = P.giant, gy = C.h(g.x, g.z), yb = gy - 3.5, e = rot(g.rx, g.ry, g.rz), base = { x: g.x, y: yb, z: g.z };
    reserve(g.x, g.z, 20);
    K.box(g.x, yb, g.z, g.w, g.h, g.d, F8.body, { rx: g.rx, ry: g.ry, rz: g.rz });
    for (const sx of [-1, 1]) { const p = at(base, e, sx * (g.w / 2 + 0.25), 0, 0); K.box(p.x, p.y, p.z, 0.6, g.h, g.d + 0.3, F8.rail, { rx: g.rx, ry: g.ry, rz: g.rz }); }
    { const p = at(base, e, 0, 0, 0); K.box(p.x, p.y, p.z, g.w * 0.28, 0.8, 0.9, 0x0a0812, { rx: g.rx, ry: g.ry, rz: g.rz }); }   // charging port, bottom edge
    const tA = tex(C, 256, 512, (c, W, H) => drawGiant(c, W, H, 0, lang, () => seedR.next()));
    const tB = tex(C, 256, 512, (c, W, H) => drawGiant(c, W, H, 1, lang, () => seedR.next()));
    const mat = basicMat(C, tA, { side: THREE.FrontSide });
    const scr = planeMesh(C, mat, g.w * 0.92, g.h * 0.95);
    const sp = at(base, e, 0, g.h * 0.5, g.d / 2 + 0.05);
    scr.position.copy(sp); scr.rotation.set(g.rx, g.ry, g.rz, 'YXZ'); scr.userData.noCull = true;
    C.addBox(g.x, yb + 5.5, g.z, g.w * 0.96, 11, g.d * 1.1, g.ry);
    const fx = Math.sin(g.ry) * 16, fz = Math.cos(g.ry) * 16;
    emitter(C, g.x + fx, gy + 6, g.z + fz, 0xff5ac8, 2.0, 46, 0.1);
    emitter(C, g.x + fx * 0.5, gy + 26, g.z + fz * 0.5, 0x5af0ff, 1.4, 40, 0.15);
    let glitch = 0, nextG = 4 + Math.random() * 6;
    C.updaters.push((dt, t) => {
      nextG -= dt;
      if (nextG <= 0) { nextG = 5 + Math.random() * 9; glitch = 0.22; }
      if (glitch > 0) { glitch -= dt; mat.map = tB; mat.color.setScalar(1.1); if (glitch <= 0) { mat.map = tA; mat.color.setScalar(1); } } else mat.color.setScalar(0.92 + 0.08 * Math.sin(t * 1.7));
    });
    C.info.giant = { x: g.x, y: yb + g.h, z: g.z };
  }

  // ---- the plug + the cable
  if (P.plug) {
    const pl = P.plug, gy = C.h(pl.x, pl.z), F = new Frame(K, pl.x, pl.z, pl.ry);
    reserve(pl.x, pl.z, 6);
    F.box(0, gy - 0.6, 0, 3.4, 1.7, 7.5, 0x24242e, { rx: 0.2, solid: true });                      // sleeve, stuck in the dune
    F.box(0, gy + 0.4, 4.2, 2.7, 0.9, 3.4, 0xb8b8c8, { rx: 0.2 });                                  // the connector
    for (let i = 0; i < 6; i++) F.box(-1.0 + i * 0.4, gy + 0.9, 5.3, 0.22, 0.12, 0.9, i % 2 ? 0x5af0ff : 0xff5ac8, { rx: 0.2, glow: true });
    K.light(F.wx(0, 5), gy + 1.5, F.wz(0, 5), 0x5af0ff, 1.1, 11, 0.5);
    C.info.audio.push({ kind: 'spark', x: F.wx(0, 5), y: gy + 1.2, z: F.wz(0, 5), r: 4 });
    const segs = [];
    for (let i = 0; i < P.cable.length - 1; i++) {
      const a = P.cable[i], b = P.cable[i + 1], ya = C.h(a.x, a.z) + 0.25, yb2 = C.h(b.x, b.z) + 0.25;
      _v.set(b.x - a.x, yb2 - ya, b.z - a.z);
      const L = _v.length(); _v.normalize(); _q.setFromUnitVectors(_Y, _v); _e.setFromQuaternion(_q, 'YXZ');
      segs.push({ x: (a.x + b.x) / 2, y: (ya + yb2) / 2, z: (a.z + b.z) / 2, rx: _e.x, ry: _e.y, rz: _e.z, sx: 1, sy: L * 1.06, sz: 1 });
    }
    instMesh(C, new THREE.CylinderGeometry(0.32, 0.32, 1, 6), C.mat(new THREE.MeshLambertMaterial({ color: 0x14101a, flatShading: true })), segs);
  }

  // ---- the seated figure before a live slab (story beat)
  if (P.beat) {
    const b = P.beat, face = b.chair.ry + Math.PI, gy = C.h(b.chair.x, b.chair.z), F = new Frame(K, b.chair.x, b.chair.z, face);
    reserve(b.chair.x + Math.sin(face) * 3, b.chair.z + Math.cos(face) * 3, 9);
    for (const [lx, lz] of [[-0.24, -0.22], [0.24, -0.22], [-0.24, 0.22], [0.24, 0.22]]) F.box(lx, gy, lz, 0.05, 0.46, 0.05, 0x8a8a94);   // chair legs
    F.box(0, gy + 0.46, 0, 0.56, 0.05, 0.52, 0x5a5a68);                                                       // seat
    F.box(0, gy + 0.5, -0.27, 0.56, 0.62, 0.05, 0x5a5a68);                                                    // back
    F.box(0, gy + 0.55, -0.02, 0.5, 0.62, 0.32, F8.cloth, { rx: 0.28 });                                      // slumped torso (hoodie)
    F.ico(0, gy + 1.28, 0.12, 0.2, F8.hood, { detail: 0 });                                                   // hood
    F.box(0, gy + 1.2, 0.3, 0.16, 0.14, 0.04, 0x05040a);                                                      // face: empty
    for (const sx of [-1, 1]) {
      F.box(sx * 0.29, gy + 0.9, 0.12, 0.13, 0.13, 0.5, F8.cloth, { rx: -0.5 });                              // arms up
      F.box(sx * 0.14, gy + 0.5, 0.3, 0.17, 0.17, 0.5, 0x2a2a3c);                                             // thighs
      F.box(sx * 0.14, gy, 0.55, 0.16, 0.5, 0.16, 0x2a2a3c);                                                  // shins
      F.box(sx * 0.14, gy, 0.66, 0.16, 0.1, 0.28, 0x14141c);                                                  // shoes
    }
    F.box(0, gy + 1.0, 0.5, 0.13, 0.2, 0.02, 0xbfe8ff, { rx: -0.35, glow: true });                            // the phone in its hands
    K.light(F.wx(0, 0.6), gy + 1.1, F.wz(0, 0.6), 0x8ad8ff, 0.7, 5, 0.3);
    F.box(0, gy + 1.42, 0.02, 0.5, 0.05, 0.4, F8.sand);                                                       // dust on the hood
    F.box(-0.78, gy, 0.1, 0.09, 0.28, 0.09, 0xd0d8e0);                                                        // empty bottle
    const nx = F.wx(0.95, 0.4), nz = F.wz(0.95, 0.4), ny = C.h(nx, nz) + 0.04;
    notePaper(C, lang, 'feed_note', nx, ny, nz, face + 0.5, 0.5, 0.36);
    C.info.notes.push({ id: 'feed_note', x: nx, y: ny + 0.3, z: nz });
    for (const s of P.scrap.slice(0, 1)) C.scrapSpots.push({ x: s.x, z: s.z });
  }
  if (P.slabs[1]) C.scrapSpots.push({ x: P.slabs[1].x + 2.4, z: P.slabs[1].z });
  K.finish().forEach((m) => { m.userData.noCull = true; });

  // ---- notification badges (one Points draw: a red dot with a white 1, always facing the camera)
  if (P.badges.length) {
    const bt = tex(C, 32, 32, (c) => { c.fillStyle = '#ff2a3a'; c.beginPath(); c.arc(16, 16, 14, 0, TAU); c.fill(); c.fillStyle = '#fff'; c.font = `bold 20px ${FONT}`; c.textAlign = 'center'; c.fillText('1', 16, 23); });
    const n = P.badges.length, pos = new Float32Array(n * 3);
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const bm = C.mat(new THREE.PointsMaterial({ map: bt, size: 1.7, sizeAttenuation: true, transparent: true, alphaTest: 0.4, depthWrite: false, fog: true }));
    const bp = C.add(C.own(new THREE.Points(bg, bm))); bp.frustumCulled = false; bp.userData.noCull = true;
    C.updaters.push((dt, t) => {
      for (let i = 0; i < n; i++) { const b = P.badges[i]; pos[i * 3] = b.x; pos[i * 3 + 1] = C.h(b.x, b.z) + b.y + Math.sin(t * 0.7 + b.ph) * 0.6; pos[i * 3 + 2] = b.z; }
      bg.attributes.position.needsUpdate = true;
    });
    C.info.badges = P.badges.map((b) => ({ x: b.x, y: b.y, z: b.z }));
  }
  motes(C, { n: 320, box: 52, h: 24, colors: [0xff5ac8, 0x5af0ff, 0xffe070, 0xffffff], size: 0.15, opacity: 0.85, additive: true, vx: 0.9, vy: 0.25, vz: 0.2, sway: 0.4 });

  // ---- flicker (live screens: bursts of on / off with a fluorescent tick) + audio (a phantom notification, the plug arcs)
  let tickT = 0, pingT = 20, arcT = 8;
  C.updaters.push((dt, t, game) => {
    const cam = game?.camera?.position;
    let dirty = false;
    tickT -= dt; pingT -= dt; arcT -= dt;
    for (const L of live) {
      L.next -= dt;
      if (L.next <= 0) { L.burst = 0.25 + Math.random() * 0.3; L.next = 2 + Math.random() * 7; if (cam && tickT <= 0 && (cam.x - L.x) ** 2 + (cam.z - L.z) ** 2 < 32 * 32) { tickT = 1.4; try { if (game.audio?.has?.('light_flicker')) game.audio.at('light_flicker', new THREE.Vector3(L.x, 3, L.z), 0.35); } catch { /* audio optional */ } } }
      let v = 1;
      if (L.burst > 0) { L.burst -= dt; v = Math.random() < 0.5 ? 0.12 : 1.15; }
      else v = 0.9 + 0.1 * Math.sin(t * 3 + L.ph);
      if (Math.abs(v - L.base) > 0.005) { L.base = v; L.im.setColorAt(L.i, _sc.setScalar(v)); L.im.instanceColor.needsUpdate = true; dirty = true; }
    }
    void dirty;
    if (!cam || game.env?.indoor || game.player?.indoor) return;
    if (pingT <= 0 && C.info.badges?.length) {
      pingT = 24 + Math.random() * 30;
      const b = C.info.badges[Math.floor(Math.random() * C.info.badges.length)];
      if ((cam.x - b.x) ** 2 + (cam.z - b.z) ** 2 < 70 * 70) { try { if (game.audio?.has?.('ui_notify')) game.audio.at('ui_notify', new THREE.Vector3(b.x, b.y, b.z), 0.5); } catch { /* audio optional */ } }
    }
    if (arcT <= 0) {
      arcT = 7 + Math.random() * 14;
      const a = C.info.audio[0];
      if (a && (cam.x - a.x) ** 2 + (cam.z - a.z) ** 2 < 55 * 55) { try { game.audio?.at?.('spark', new THREE.Vector3(a.x, a.y, a.z), 0.5); } catch { /* audio optional */ } }
    }
  });
}
const _sc = new THREE.Color();

registerDecor('tundra503', buildTundra);
registerDecor('feed8', buildFeed);
/** painters, exported for the node test (fake 2D context) */
export const PAINT = { drawScreen, drawGiant, wrapText };
