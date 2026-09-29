// SHIPYARD models: module rooms bolted onto the ship hardpoints (world/hardpoints.js), the roof deck / turret / service lift, and the
// hull paint + name plate overlay. Everything is built in WORLD coordinates (the ship group sits at the world origin) so a module can be added to
// `game.ship.group` as-is. Static geometry goes through one GeoBuilder (vertex-coloured, one draw call per texture); glowing bits are unlit;
// animated bits (reactor, turret head, hologram) are separate meshes reported in `anim`. No THREE lights are created: `emitters` are pool requests.
//   buildRoomModule(socket, moduleId, tier, ctx) / buildDeck(tier, ctx) / buildTurret(tier, ctx) / buildLift(ctx) / buildPaint(paint, name)
//   -> { group, boxes: [[cx,cy,cz,hx,hy,hz]], emitters: [{pos,color,intensity,distance}], points: {name: Vector3}, anim: [fn(dt,t)], screens: {name}, dispose() }
//   ctx = { paint: {c1,c2,pat}, theme, hasChild, trophies: [{name, kills, hue}], name }
import * as THREE from 'three';
import { GeoBuilder, levelMaterial } from '../world/geobuilder.js';
import { createProp } from './props.js';
import { SOCKETS, ROOM_H, DOOR_H, CHAIN_DOOR, CORE_GAPS } from '../world/hardpoints.js';
import { MODULES, paintHex, themeTint, ROMAN } from '../game/shipyard_core.js';

const T = 0.25;                                    // wall / slab thickness
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const tmpC = new THREE.Color();
/** linear rgb triple for a hex colour, optionally scaled */
export const rgb = (hex, m = 1) => { tmpC.setHex(hex); return [clamp(tmpC.r * m, 0, 1), clamp(tmpC.g * m, 0, 1), clamp(tmpC.b * m, 0, 1)]; };
const mulHex = (hex, tint) => { const a = rgb(hex), b = rgb(tint); return [a[0] * b[0], a[1] * b[1], a[2] * b[2]]; };
const HAS_DOM = typeof document !== 'undefined';

const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const matFor = (key) => (key === 'glow' ? glowMat : levelMaterial(key, { vertexColors: true }));

// ------------------------------------------------------------------------------------------------ canvas helpers
function canvasTex(w, h, draw) {
  if (!HAS_DOM) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.canvas = c;
  return tex;
}
const cssHex = (hex) => '#' + hex.toString(16).padStart(6, '0');
/** text plane (unlit). Returns { mesh, redraw(fn) } */
function textPlane(w, h, px, py, draw, opts = {}) {
  const tex = canvasTex(px, py, draw);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: !!opts.transparent, alphaTest: opts.transparent ? 0.2 : 0, side: opts.double ? THREE.DoubleSide : THREE.FrontSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  return {
    mesh, tex,
    redraw(fn) { if (!tex) return; const c = tex.userData.canvas; fn(c.getContext('2d'), c.width, c.height); tex.needsUpdate = true; },
  };
}
function drawPattern(g, w, h, pat, c1, c2) {
  g.fillStyle = c1; g.fillRect(0, 0, w, h);
  g.fillStyle = c2;
  if (pat === 'stripes') { for (let y = 0; y < h; y += Math.max(4, h / 4)) g.fillRect(0, y, w, Math.max(2, h / 8)); }
  else if (pat === 'hazard') { g.save(); for (let x = -h; x < w + h; x += h * 0.9) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h * 0.45, h); g.lineTo(x + h * 0.45 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill(); } g.restore(); }
  else if (pat === 'checker') { const s = Math.max(4, h / 3); for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) if (((x / s) + (y / s)) % 2 === 0) g.fillRect(x, y, s, s); }
  else if (pat === 'chevron') { const s = h; for (let x = 0; x < w; x += s) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + s / 2, h / 2); g.lineTo(x, h); g.lineTo(x + s / 4, h); g.lineTo(x + s / 2 + s / 4, h / 2); g.lineTo(x + s / 4, 0); g.closePath(); g.fill(); } }
  else if (pat === 'dots') { const s = Math.max(6, h / 2.5); for (let y = s / 2; y < h; y += s) for (let x = s / 2 + ((y / s) % 2 ? s / 2 : 0); x < w; x += s) { g.beginPath(); g.arc(x, y, s * 0.28, 0, 6.3); g.fill(); } }
}

// ------------------------------------------------------------------------------------------------ Room: local frame (u = away from the ship, v = lateral)
const STYLES = {
  metal: { wall: 'metal_plate', floor: 'metal_dark', ceil: 'ship_ceiling', wallTint: 0xb8b8b0, floorTint: 0x9a9a94 },
  ship: { wall: 'ship_wall', floor: 'ship_floor', ceil: 'ship_ceiling' },
  med: { wall: 'wall_hospital', floor: 'tiles_white', ceil: 'ceiling_tiles' },
  lab: { wall: 'ship_wall', floor: 'tiles_mint', ceil: 'ceiling_tiles', wallTint: 0xdfeaf4 },
  wood: { wall: 'wood_dark', floor: 'wood_floor', ceil: 'ship_ceiling' },
  lounge: { wall: 'wallpaper_damask', floor: 'carpet_red', ceil: 'ship_ceiling' },
  bunk: { wall: 'ship_wall', floor: 'carpet_office', ceil: 'ship_ceiling', wallTint: 0xc8c8d8 },
};
const STYLE_OF = { cargo: 'metal', garage: 'metal', engine: 'metal', hangar: 'metal', workshop: 'ship', medbay: 'med', lab: 'lab', bunk: 'bunk', trophy: 'wood', lounge: 'lounge' };

class Room {
  constructor(sock, id, tier, ctx) {
    const S = SOCKETS[sock], r = S.room;
    this.sock = sock; this.id = id; this.tier = tier; this.ctx = ctx;
    [this.dx, this.dz] = S.dir; this.lx = -this.dz; this.lz = this.dx;
    this.D = this.dx ? r.x1 - r.x0 : r.z1 - r.z0;
    this.W = this.dx ? r.z1 - r.z0 : r.x1 - r.x0;
    this.ox = this.dx > 0 ? r.x0 : (r.x0 + r.x1) / 2;
    this.oz = this.dx > 0 ? (r.z0 + r.z1) / 2 : r.z1;
    this.aisle = this.dx ? S.aisle - this.oz : S.aisle - this.ox;
    this.hasChild = !!ctx.hasChild;
    this.gb = new GeoBuilder();
    this.boxes = []; this.emitters = []; this.points = {}; this.anim = []; this.screens = {}; this.extra = new THREE.Group(); this.disposables = [];
    this.style = STYLES[STYLE_OF[id]] || STYLES.ship;
    this.tint = themeTint(ctx.theme);
    this.c1 = paintHex(ctx.paint?.c1); this.c2 = paintHex(ctx.paint?.c2);
    this.mod = MODULES[id];
    // free strips beside the aisle
    this.laneW = 0.8;
    this.left = [-this.W / 2 + 0.1, this.aisle - this.laneW - 0.05];
    this.right = [this.aisle + this.laneW + 0.05, this.W / 2 - 0.1];
  }
  // local -> world
  wx(u, v) { return this.ox + u * this.dx + v * this.lx; }
  wz(u, v) { return this.oz + u * this.dz + v * this.lz; }
  w(u, v, y = 0) { return V3(this.wx(u, v), y, this.wz(u, v)); }
  yaw(fu, fv) { return Math.atan2(fu * this.dx + fv * this.lx, fu * this.dz + fv * this.lz); }
  size(du, dv) { return this.dx ? [du, dv] : [dv, du]; }
  /** solid box in local coordinates (u0..u1, v0..v1, y0..y1) */
  solid(key, u0, u1, v0, v1, y0, y1, color, collide = true) {
    const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2, [sx, sz] = this.size(Math.abs(u1 - u0), Math.abs(v1 - v0));
    const cx = this.wx(uc, vc), cz = this.wz(uc, vc), sy = y1 - y0;
    this.gb.box(key, cx, (y0 + y1) / 2, cz, sx, sy, sz, 0.5, color);
    if (collide) this.boxes.push([cx, (y0 + y1) / 2, cz, sx / 2, sy / 2, sz / 2]);
  }
  deco(key, u0, u1, v0, v1, y0, y1, color) { this.solid(key, u0, u1, v0, v1, y0, y1, color, false); }
  glow(u0, u1, v0, v1, y0, y1, hex, m = 1) { this.solid('glow', u0, u1, v0, v1, y0, y1, rgb(hex, m), false); }
  collide(u0, u1, v0, v1, y0, y1) {
    const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2, [sx, sz] = this.size(Math.abs(u1 - u0), Math.abs(v1 - v0));
    this.boxes.push([this.wx(uc, vc), (y0 + y1) / 2, this.wz(uc, vc), sx / 2, (y1 - y0) / 2, sz / 2]);
  }
  /** existing prop (props.js) facing (fu, fv) in local terms; colliders from the prop */
  prop(id, u, v, fu = 0, fv = 0, y = 0, opts = {}) {
    let o = null;
    try { o = createProp(id, { seed: 3, ...opts }); } catch (e) { return null; }
    const yaw = fu || fv ? this.yaw(fu, fv) : 0;
    o.position.set(this.wx(u, v), y, this.wz(u, v)); o.rotation.y = yaw;
    this.extra.add(o); o.updateMatrixWorld(true);
    const q = Math.round(yaw / (Math.PI / 2)) & 1;
    for (const c of o.userData.colliders || []) {
      const cp = new THREE.Vector3(...c.c).applyMatrix4(o.matrixWorld);
      this.boxes.push([cp.x, cp.y, cp.z, (q ? c.s[2] : c.s[0]) / 2, c.s[1] / 2, (q ? c.s[0] : c.s[2]) / 2]);
    }
    return o;
  }
  point(name, u, v, y = 0) { this.points[name] = this.w(u, v, y); return this.points[name]; }
  light(u, v, y, hex, intensity = 0.9, distance = 9) { this.emitters.push({ pos: this.w(u, v, y), color: hex, intensity, distance }); }
  mesh(geo, mat, u, v, y, rotY = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(this.wx(u, v), y, this.wz(u, v)); m.rotation.y = rotY; this.extra.add(m); this.disposables.push(geo, mat); return m; }
  /** unlit canvas screen on a wall plane facing (fu, fv); returns the text-plane handle */
  screen(name, u, v, y, w, h, fu, fv, px, py, draw) {
    const p = textPlane(w, h, px, py, draw);
    p.mesh.position.set(this.wx(u, v), y, this.wz(u, v)); p.mesh.rotation.y = this.yaw(fu, fv);
    this.extra.add(p.mesh); this.disposables.push(p.mesh.geometry, p.mesh.material, p.tex);
    this.screens[name] = p;
    return p;
  }

  // -------------------------------------------------------------------------------------- shell (floor, roof, walls, tunnel jambs, door sign)
  wallFace(key, A, B, y0, y1, col, gaps = [], uv = 0.5) {
    const ax = this.wx(A[0], A[1]), az = this.wz(A[0], A[1]), bx = this.wx(B[0], B[1]), bz = this.wz(B[0], B[1]);
    const L = Math.hypot(bx - ax, bz - az), px = (bx - ax) / L, pz = (bz - az) / L;
    const at = (s, y) => [ax + px * s, az + pz * s];
    const seg = (s0, s1, ya, yb) => { if (s1 - s0 < 1e-3 || yb - ya < 1e-3) return; const p = at(s0), q = at(s1); this.gb.vrect(key, p[0], p[1], q[0], q[1], ya, yb, uv, col, s0); };
    let cur = 0;
    for (const g of [...gaps].sort((a, b) => a.s0 - b.s0)) { seg(cur, g.s0, y0, y1); seg(g.s0, g.s1, g.h, y1); cur = g.s1; }
    seg(cur, L, y0, y1);
  }
  shell() {
    const { D, W, gb } = this, st = this.style, H = ROOM_H, hw = W / 2;
    const tintI = mulHex(st.wallTint || 0xffffff, this.tint), tintF = mulHex(st.floorTint || 0xffffff, this.tint);
    const ext1 = rgb(this.c1), ext2 = rgb(this.c2);
    // floor + ceiling
    const fx0 = Math.min(this.wx(0, -hw), this.wx(D, hw)), fx1 = Math.max(this.wx(0, -hw), this.wx(D, hw)), fz0 = Math.min(this.wz(0, -hw), this.wz(D, hw)), fz1 = Math.max(this.wz(0, -hw), this.wz(D, hw));
    gb.hrect(st.floor, fx0, fz0, fx1, fz1, 0, true, 0.5, tintF);
    gb.hrect(st.ceil, fx0, fz0, fx1, fz1, H, false, 0.5, mulHex(0xffffff, this.tint));
    // outer slabs (floor slab, roof slab)
    const sx0 = Math.min(this.wx(0, -hw - T), this.wx(D + T, hw + T)), sx1 = Math.max(this.wx(0, -hw - T), this.wx(D + T, hw + T)), sz0 = Math.min(this.wz(0, -hw - T), this.wz(D + T, hw + T)), sz1 = Math.max(this.wz(0, -hw - T), this.wz(D + T, hw + T));
    gb.box('metal_dark', (sx0 + sx1) / 2, -0.155, (sz0 + sz1) / 2, sx1 - sx0, 0.29, sz1 - sz0, 0.35, rgb(this.c2, 0.55));      // floor slab (top hidden under the floor)
    gb.box('metal_dark', (sx0 + sx1) / 2, H + 0.13, (sz0 + sz1) / 2, sx1 - sx0, 0.25, sz1 - sz0, 0.35, rgb(this.c1, 0.8));      // roof slab
    // pillars down to the ground (visual only)
    for (const [pu, pv] of [[0.2, -hw - 0.1], [0.2, hw + 0.1], [D + 0.1, -hw - 0.1], [D + 0.1, hw + 0.1]]) this.deco('metal_dark', pu - 0.15, pu + 0.15, pv - 0.15, pv + 0.15, -1.45, -0.3, rgb(0x55575a));
    // side walls
    for (const sg of [-1, 1]) {
      const vi = sg * hw, vo = sg * (hw + T);
      const A = sg < 0 ? [0, vi] : [D, vi], B = sg < 0 ? [D, vi] : [0, vi];
      this.wallFace(st.wall, A, B, 0, H, tintI);
      const C = sg < 0 ? [D + T, vo] : [0, vo], E = sg < 0 ? [0, vo] : [D + T, vo];
      this.wallFace('metal_plate', C, E, -0.3, 1.1, ext2); this.wallFace('metal_plate', C, E, 1.1, H + 0.25, ext1);
      this.collide(0, D + T, Math.min(vi, vo), Math.max(vi, vo), -0.3, H + 0.25);
    }
    // far wall (with the chain doorway when another module hangs behind this one)
    const gw = CHAIN_DOOR.w, gH = CHAIN_DOOR.h;
    const gi = this.hasChild ? [{ s0: this.aisle - gw / 2 + hw, s1: this.aisle + gw / 2 + hw, h: gH }] : [];
    const go = this.hasChild ? [{ s0: hw + T - (this.aisle + gw / 2), s1: hw + T - (this.aisle - gw / 2), h: gH }] : [];
    this.wallFace(st.wall, [D, -hw], [D, hw], 0, H, tintI, gi);
    this.wallFace('metal_plate', [D + T, hw + T], [D + T, -hw - T], -0.3, 1.1, ext2, go); this.wallFace('metal_plate', [D + T, hw + T], [D + T, -hw - T], 1.1, H + 0.25, ext1, go);
    if (this.hasChild) {
      const a = this.aisle - gw / 2, b = this.aisle + gw / 2;
      this.collide(D, D + T, -hw - T, a, -0.3, H + 0.25); this.collide(D, D + T, b, hw + T, -0.3, H + 0.25); this.collide(D, D + T, a, b, gH, H + 0.25);
      this.jamb(D, a, b, gH);
    } else this.collide(D, D + T, -hw - T, hw + T, -0.3, H + 0.25);
    // floor collider
    this.collide(0, D + T, -hw - T, hw + T, -0.5, 0);
    // doorway tunnel through the core hull
    if (SOCKETS[this.sock].kind === 'core') this.coreJamb(CORE_GAPS[SOCKETS[this.sock].gap]);
    // aisle marking
    this.deco('hazard_stripes', 0.02, 0.4, this.aisle - gw / 2 + 0.1, this.aisle + gw / 2 - 0.1, 0.004, 0.012, [1, 1, 1]);
  }
  jamb(u, a, b, h) {
    const k = rgb(0x3a3c40);
    this.deco('metal_dark', u, u + T, a - 0.06, a, 0, h, k); this.deco('metal_dark', u, u + T, b, b + 0.06, 0, h, k);
    this.deco('metal_dark', u, u + T, a - 0.06, b + 0.06, h, h + 0.06, k); this.deco('metal_dark', u, u + T, a, b, -0.06, 0, k);
  }
  coreJamb(g) {
    const k = rgb(0x3a3c40), h = g.h, a = g.c - g.w / 2, b = g.c + g.w / 2, gb = this.gb;
    const bx = (cx, cy, cz, sx, sy, sz) => gb.box('metal_dark', cx, cy, cz, sx, sy, sz, 0.5, k);
    if (g.wall === '+x') { const x = 7.125; bx(x, h / 2, a - 0.03, 0.25, h, 0.06); bx(x, h / 2, b + 0.03, 0.25, h, 0.06); bx(x, h + 0.03, g.c, 0.25, 0.06, g.w + 0.12); bx(x, -0.03, g.c, 0.25, 0.06, g.w); }
    else { const z = -3.625; bx(a - 0.03, h / 2, z, 0.06, h, 0.25); bx(b + 0.03, h / 2, z, 0.06, h, 0.25); bx(g.c, h + 0.03, z, g.w + 0.12, 0.06, 0.25); bx(g.c, -0.03, z, g.w, 0.06, 0.25); }
  }
  /** name sign above the doorway, facing into the core cabin */
  doorSign() {
    const g = CORE_GAPS[SOCKETS[this.sock].gap]; if (!g) return;
    const hex = this.mod.color, label = `${this.mod.short} ${ROMAN[this.tier]}`;
    const p = textPlane(1.5, 0.3, 192, 40, (c, w, h) => { c.fillStyle = '#101214'; c.fillRect(0, 0, w, h); c.fillStyle = cssHex(hex); c.fillRect(0, 0, w, 4); c.fillRect(0, h - 4, w, 4); c.font = 'bold 26px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, w / 2, h / 2 + 1); });
    if (g.wall === '+x') { p.mesh.position.set(6.985, 2.72, g.c); p.mesh.rotation.y = -Math.PI / 2; }
    else { p.mesh.position.set(g.c, 2.72, -3.485); p.mesh.rotation.y = 0; }
    this.extra.add(p.mesh); this.disposables.push(p.mesh.geometry, p.mesh.material, p.tex);
  }
  finish() {
    const group = new THREE.Group();
    group.name = 'shipyard_' + this.id;
    group.add(this.gb.build(matFor));
    group.add(this.extra);
    return {
      group, boxes: this.boxes, emitters: this.emitters, points: this.points, anim: this.anim, screens: this.screens, id: this.id, tier: this.tier, sock: this.sock,
      dispose: () => { group.traverse((o) => { if (o.isMesh && o.geometry && !o.material?.userData?.shared) o.geometry.dispose(); }); for (const d of this.disposables) { try { d.dispose?.(); } catch { /* */ } } },
    };
  }
}

// ------------------------------------------------------------------------------------------------ small parts
const KRATES = [0xb0743c, 0x8a5a2a, 0x5a6a78, 0x7a8a5a, 0xa8402a, 0xb89a3c];
function crate(R, u, v, y, s, i) {
  const k = rgb(KRATES[i % KRATES.length], 0.9);
  R.solid(i % 2 ? 'crate_wood' : 'crate_metal', u - s / 2, u + s / 2, v - s / 2, v + s / 2, y, y + s * 0.9, k);
}
function rack(R, u, v, faceV, tier, crates, slots) {
  // vertical shelving unit against a side wall: 3 shelf levels, one crate each
  const col = rgb(0x4a4d52), sh = rgb(0x7a7e84);
  R.solid('metal_dark', u - 0.55, u - 0.5, v - 0.28, v + 0.28, 0, 2.3, col); R.solid('metal_dark', u + 0.5, u + 0.55, v - 0.28, v + 0.28, 0, 2.3, col);
  for (let l = 0; l < 3; l++) {
    const y = 0.22 + l * 0.85;
    R.deco('metal_plate', u - 0.55, u + 0.55, v - 0.28, v + 0.28, y, y + 0.05, sh);
    if (crates.n < slots) { crates.n++; crate(R, u, v, y + 0.05, 0.5, crates.n); }
  }
  R.collide(u - 0.55, u + 0.55, v - 0.28, v + 0.28, 0, 2.3);
}
function pegboard(R, u0, u1, v, fv, y0, y1) {
  R.deco('metal_plate', u0, u1, v - 0.03, v + 0.03, y0, y1, rgb(0x6a6e72));
  for (let u = u0 + 0.3; u < u1 - 0.2; u += 0.42) R.deco('metal_dark', u - 0.03, u + 0.03, v + fv * 0.05 - 0.02, v + fv * 0.05 + 0.02, y0 + 0.25 + ((u * 7) % 0.5), y0 + 0.75 + ((u * 5) % 0.4), rgb([0xc8581c, 0x3c5a48, 0xd8b020][Math.floor(u * 3) % 3]));
}
function pulseMesh(R, geo, hex, u, v, y, fn) {
  const mat = new THREE.MeshBasicMaterial({ color: hex });
  const m = R.mesh(geo, mat, u, v, y);
  R.anim.push((dt, t) => fn(m, mat, dt, t));
  return m;
}
const CYL = (r0, r1, h, n = 10) => new THREE.CylinderGeometry(r0, r1, h, n);

// ------------------------------------------------------------------------------------------------ module layouts (local frame)
const LAYOUT = {
  cargo(R, tier) {
    const crates = { n: 0 }, slots = [0, 12, 24, 36][tier], D = R.D, hw = R.W / 2;
    const step = 1.25, n = Math.floor((D - 0.8) / step);
    for (let i = 0; i < n; i++) rack(R, 0.9 + i * step, hw - 0.4, -1, tier, crates, slots);
    if (tier >= 2) for (let i = 0; i < n; i++) rack(R, 0.9 + i * step, -hw + 0.4, 1, tier, crates, slots);
    if (tier >= 3) for (const vv of [1.2, 2.5]) { R.solid('crate_wood', D - 1.5, D - 0.5, vv - 0.4, vv + 0.4, 0, 0.14, rgb(0x8a6a4a)); crate(R, D - 1.0, vv, 0.14, 0.7, crates.n++); crate(R, D - 1.0, vv, 0.14 + 0.63, 0.6, crates.n++); }
    R.deco('hazard_stripes', D - 0.05, D, -hw, hw, 0.02, 2.6, rgb(0xd8b020, 0.7));                      // cargo door (far wall)
    if (R.hasChild) R.deco('metal_dark', D - 0.12, D - 0.05, R.aisle - 0.72, R.aisle + 0.72, 0, 2.5, rgb(0x2a2c30));
    R.screen('scan', 2.2, -hw + 0.02, 2.55, 1.5, 0.75, 0, 1, 192, 96, (c, w, h) => { c.fillStyle = '#04120a'; c.fillRect(0, 0, w, h); c.fillStyle = '#6dff9a'; c.font = '22px monospace'; c.fillText('CARGO SCAN', 8, 28); });
    R.point('scan', 2.2, -hw + 0.6, 1.3);
    R.light(D / 2, R.aisle, ROOM_H - 0.4, 0xffe2b8, 0.85, 10);
    R.glow(D / 2 - 0.9, D / 2 + 0.9, R.aisle - 0.06, R.aisle + 0.06, ROOM_H - 0.03, ROOM_H, 0xfff0d0);
    R.slots = slots; R.crates = crates.n;
  },
  garage(R, tier) {
    const D = R.D, hw = R.W / 2;
    // van bay outline on the right
    const bv0 = R.right[0] + 0.1, bv1 = hw - 0.3;
    for (const [u0, u1, v0, v1] of [[0.7, D - 0.5, bv0, bv0 + 0.08], [0.7, D - 0.5, bv1 - 0.08, bv1], [0.7, 0.78, bv0, bv1], [D - 0.58, D - 0.5, bv0, bv1]]) R.deco('hazard_stripes', u0, u1, v0, v1, 0.004, 0.014, [1, 1, 1]);
    // vehicle lift: two posts + skid rails
    for (const vv of [bv0 + 0.5, bv1 - 0.5]) { R.solid('metal_dark', D / 2 - 0.15, D / 2 + 0.15, vv - 0.15, vv + 0.15, 0, 2.3, rgb(0xd8b020, 0.85)); R.deco('metal_plate', 1.2, D - 1.0, vv - 0.2, vv + 0.2, 0.02, 0.1, rgb(0x55585c)); }
    R.deco('metal_dark', D / 2 - 0.1, D / 2 + 0.1, bv0 + 0.5, bv1 - 0.5, 2.2, 2.4, rgb(0xd8b020, 0.85));
    // tool wall + bench + drums on the left
    pegboard(R, 0.6, D - 0.6, -hw + 0.04, 1, 0.9, 2.4);
    R.prop('bench', 1.4, -hw + 0.55, 0, 1); R.prop('bench', D - 1.4, -hw + 0.55, 0, 1);
    R.prop('shelf_metal', D / 2, -hw + 0.3, 0, 1);
    R.prop('barrel', D - 0.5, -hw + 1.3, 0, 1); R.prop('barrel', D - 0.9, -hw + 1.35, 0, 1);
    R.point('rack', 1.4, -hw + 1.1, 1.0);
    R.glow(1.1, 1.7, -hw + 0.02, -hw + 0.06, 1.55, 1.8, 0x5adcc8);                                    // battery rack lamp
    if (tier >= 2) { R.deco('metal_dark', 0.6, D - 0.6, R.aisle - 0.06, R.aisle + 0.06, ROOM_H - 0.5, ROOM_H - 0.38, rgb(0x3a3c40)); pulseMesh(R, new THREE.BoxGeometry(0.3, 0.3, 0.3), 0xffc040, D / 2, R.aisle, ROOM_H - 0.7, (m, mat, dt, t) => { mat.color.setHex(Math.sin(t * 2) > 0 ? 0xffc040 : 0xff9a20); }); }
    if (tier >= 3) { R.prop('server_rack_prop', 0.5, -hw + 0.6, 0, 1); R.glow(0.3, 0.7, -hw + 1.12, -hw + 1.15, 1.2, 1.9, 0x6aff9a, 0.7); }
    R.light(D / 2, 1.5, ROOM_H - 0.4, 0xffe8c0, 0.9, 10);
    R.glow(D / 2 - 1, D / 2 + 1, 1.44, 1.56, ROOM_H - 0.03, ROOM_H, 0xfff0d0);
  },
  engine(R, tier) {
    const D = R.D, hw = R.W / 2, cu = D * 0.5, cv = 1.9;
    // reactor: base, glowing core, two spinning rings
    R.solid('metal_dark', cu - 0.9, cu + 0.9, cv - 0.9, cv + 0.9, 0, 0.4, rgb(0x3a3c40));
    for (const [du, dv] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) R.solid('metal_dark', cu + du - 0.08, cu + du + 0.08, cv + dv - 0.08, cv + dv + 0.08, 0.4, ROOM_H - 0.2, rgb(0x55585c));
    pulseMesh(R, CYL(0.5, 0.5, 2.5, 10), 0xff8a3a, cu, cv, 1.65, (m, mat, dt, t) => { const k = 0.75 + 0.25 * Math.sin(t * 3); mat.color.setRGB(1, 0.45 * k + 0.2, 0.1 * k); });
    for (const [y, sp] of [[1.2, 1.4], [2.1, -1.8]]) pulseMesh(R, new THREE.TorusGeometry(0.72, 0.06, 6, 14), 0xffc060, cu, cv, y, (m, mat, dt) => { m.rotation.x = 1.15; m.rotation.y += dt * sp; });
    // coil stacks (Engine Coils) along the right wall; Mk II adds the left wall, Mk III adds a second reactor bank
    const coilN = tier >= 2 ? 2 : 1;
    for (let i = 0; i < coilN * 2; i++) { const uu = 0.9 + (i % 2) * 1.4 + (i >= 2 ? 0 : 0), vv = i < 2 ? hw - 0.5 : -hw + 0.5; R.solid('metal_plate', uu - 0.4, uu + 0.4, vv - 0.3, vv + 0.3, 0, 1.6, rgb(0x6a6e74)); for (let y = 0.3; y < 1.5; y += 0.3) R.glow(uu - 0.42, uu + 0.42, vv - 0.32, vv + 0.32, y, y + 0.06, 0xff8a3a, 0.9); }
    if (tier >= 3) { for (const vv of [-1.4 - 1.3]) { R.prop('generator', 3.4, -hw + 0.8, 0, 1); } R.deco('metal_dark', 0.4, D - 0.4, cv - 0.05, cv + 0.05, ROOM_H - 0.25, ROOM_H - 0.15, rgb(0x3a3c40)); R.glow(0.6, D - 0.6, cv - 0.03, cv + 0.03, ROOM_H - 0.28, ROOM_H - 0.24, 0xff8a3a); }
    R.prop('pipe_bundle', D * 0.5, -hw + 0.3, 0, 1);
    R.screen('weight', 1.0, -hw + 0.02, 2.0, 1.4, 0.7, 0, 1, 160, 80, (c, w, h) => { c.fillStyle = '#1a0a02'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff9a3a'; c.font = '18px monospace'; c.fillText('HULL WEIGHT', 8, 24); });
    R.point('console', 1.0, -hw + 0.7, 1.3);
    R.light(cu, cv, 2.4, 0xff9a4a, 1.1, 11);
    R.light(D / 2, R.aisle, ROOM_H - 0.4, 0xffe0c0, 0.5, 9);
  },
  hangar(R, tier) {
    const D = R.D, hw = R.W / 2, k = rgb(0x8a92a0);
    // landing pad markings
    for (const [u0, u1, v0, v1] of [[0.6, D - 0.6, 0.55, 0.63], [0.6, D - 0.6, 3.15, 3.23], [0.6, 0.68, 0.55, 3.23], [D - 0.68, D - 0.6, 0.55, 3.23]]) R.deco('hazard_stripes', u0, u1, v0, v1, 0.004, 0.014, [1, 1, 1]);
    // shuttle: fuselage, cockpit glass, wings, engines
    const su = D / 2, sv = 1.9;
    R.solid('metal_plate', su - 1.5, su + 1.5, sv - 0.55, sv + 0.55, 0.35, 1.25, k); R.solid('metal_plate', su + 1.5, su + 1.9, sv - 0.35, sv + 0.35, 0.5, 1.0, rgb(0xc8581c));
    R.glow(su + 1.55, su + 1.85, sv - 0.3, sv + 0.3, 0.9, 1.15, 0x7ad8ff, 0.8);
    R.solid('metal_dark', su - 0.6, su + 0.4, sv - 1.5, sv + 1.5, 0.6, 0.72, rgb(0x55585c)); R.deco('metal_dark', su - 1.5, su - 1.2, sv - 0.5, sv - 0.2, 0.5, 1.0, rgb(0x2a2c30)); R.deco('metal_dark', su - 1.5, su - 1.2, sv + 0.2, sv + 0.5, 0.5, 1.0, rgb(0x2a2c30));
    R.glow(su - 1.53, su - 1.5, sv - 0.45, sv - 0.25, 0.55, 0.95, 0xff8a3a); R.glow(su - 1.53, su - 1.5, sv + 0.25, sv + 0.45, 0.55, 0.95, 0xff8a3a);
    R.solid('metal_dark', su - 0.9, su - 0.7, sv - 0.55, sv + 0.55, 0.0, 0.35, rgb(0x3a3c40)); R.solid('metal_dark', su + 0.9, su + 1.1, sv - 0.55, sv + 0.55, 0.0, 0.35, rgb(0x3a3c40));
    if (tier >= 2) for (const vv of [-2.9]) { R.solid('metal_plate', 0.9, 2.1, vv - 0.4, vv + 0.4, 0, 1.1, rgb(0x6a6e74)); R.glow(1.0, 2.0, vv - 0.41, vv + 0.41, 0.5, 0.6, 0x7ad8ff, 0.7); R.solid('metal_plate', 2.5, 3.7, vv - 0.4, vv + 0.4, 0, 1.1, rgb(0x6a6e74)); R.glow(2.6, 3.6, vv - 0.41, vv + 0.41, 0.5, 0.6, 0x7ad8ff, 0.7); }
    if (tier >= 3) { R.deco('metal_dark', 0.4, D - 0.4, sv - 1.6, sv - 1.5, ROOM_H - 0.4, ROOM_H - 0.3, rgb(0x3a3c40)); R.deco('metal_dark', 0.4, D - 0.4, sv + 1.5, sv + 1.6, ROOM_H - 0.4, ROOM_H - 0.3, rgb(0x3a3c40)); R.deco('metal_dark', su - 0.15, su + 0.15, sv - 1.5, sv + 1.5, ROOM_H - 0.5, ROOM_H - 0.4, rgb(0xd8b020)); }
    // supply locker (kit spawns on the table)
    R.prop('locker', D - 0.35, -hw + 0.4, -1, 0); R.prop('locker', D - 0.35, -hw + 1.0, -1, 0); R.prop('locker', D - 0.35, -hw + 1.6, -1, 0);
    R.solid('metal_plate', D - 1.4, D - 0.8, -hw + 0.2, -hw + 1.0, 0, 0.9, rgb(0xd8b020, 0.8));
    R.glow(D - 1.38, D - 0.82, -hw + 0.22, -hw + 0.98, 0.9, 0.93, 0x6aff9a, 0.8);
    R.point('supply', D - 1.1, -hw + 0.6, 1.0);
    R.light(D / 2, 1.9, ROOM_H - 0.4, 0xdfe8ff, 1.0, 11);
    R.glow(D / 2 - 1, D / 2 + 1, 1.84, 1.96, ROOM_H - 0.03, ROOM_H, 0xdfe8ff);
  },
  workshop(R, tier) {
    const D = R.D, [l0] = R.left, [, r1] = R.right;
    R.prop('bench', 1.3, l0 + 0.35, 0, 1); R.prop('bench', 2.6, l0 + 0.35, 0, 1); R.prop('bench', 3.9, l0 + 0.35, 0, 1);
    pegboard(R, 0.6, D - 0.5, l0 - 0.1 + 0.06, 1, 1.0, 2.4);
    R.prop('shelf_metal', 1.2, r1 - 0.3, 0, -1); R.prop('shelf_metal', 2.8, r1 - 0.3, 0, -1);
    R.solid('metal_dark', D - 1.4, D - 0.5, r1 - 0.9, r1 - 0.05, 0, 0.75, rgb(0x2a2c30));                  // lathe / anvil block
    R.solid('metal_plate', D - 1.2, D - 0.7, r1 - 0.7, r1 - 0.25, 0.75, 0.95, rgb(0x8a8e94));
    if (tier >= 2) { R.solid('metal_rust', 3.6, 4.5, r1 - 0.95, r1 - 0.05, 0, 1.3, rgb(0x6a4a3a)); pulseMesh(R, new THREE.BoxGeometry(0.5, 0.28, 0.06), 0xff6a2a, 4.05, r1 - 0.98, 0.6, (m, mat, dt, t) => { m.rotation.y = R.dx ? 0 : Math.PI / 2; mat.color.setRGB(1, 0.35 + 0.15 * Math.sin(t * 5), 0.1); }); }
    if (tier >= 3) { R.deco('metal_dark', 3.7, 4.4, r1 - 0.85, r1 - 0.15, 1.3, 2.6, rgb(0x3a3c40)); R.glow(3.8, 4.3, r1 - 0.86, r1 - 0.14, 2.6, 2.63, 0xff6a2a, 0.9); }
    R.point('bench', 2.6, l0 + 0.95, 1.0);
    R.glow(1.0, 4.0, -0.05 + l0 / 2 - 0.9, 0.05 + l0 / 2 - 0.85, ROOM_H - 0.03, ROOM_H, 0xffe0b0);
    R.light(D / 2, 0, ROOM_H - 0.4, 0xffd9a0, 0.9, 9);
  },
  medbay(R, tier) {
    const D = R.D, [l0] = R.left, [r0, r1] = R.right, bedV = l0 + 0.62;
    const nBeds = tier >= 2 ? 2 : 1;
    for (let i = 0; i < nBeds; i++) R.prop('hospital_bed', 1.3 + i * 2.2, bedV, 1, 0, 0);       // long axis along u, head toward the wall
    R.prop('iv_stand', 0.55, bedV + 0.85, 0, 0);
    R.prop('surgical_lamp', 2.4, bedV + 0.2, 0, 0, 0);
    R.prop('filing_cabinet', 0.6, r1 - 0.25, 0, -1);
    R.prop('curtain_divider', 2.3, l0 + 1.25, 0, 1);
    // revival pad: glowing floor ring + emitter dome
    const pu = D - 1.1, pv = (r0 + r1) / 2;
    R.solid('metal_dark', pu - 0.75, pu + 0.75, pv - 0.75, pv + 0.75, 0, 0.1, rgb(0x2a3a3c));
    R.glow(pu - 0.6, pu + 0.6, pv - 0.6, pv + 0.6, 0.105, 0.115, 0x5adcc8, 0.9);
    R.deco('metal_dark', pu - 0.35, pu + 0.35, pv - 0.35, pv + 0.35, 0.115, 0.125, rgb(0x102020));
    pulseMesh(R, new THREE.TorusGeometry(0.5, 0.04, 6, 16), 0x5adcc8, pu, pv, 1.9, (m, mat, dt, t) => { m.rotation.x = Math.PI / 2; m.position.y = 1.5 + 0.3 * Math.sin(t * 1.6); mat.color.setRGB(0.2, 0.75 + 0.2 * Math.sin(t * 3), 0.7); });
    R.deco('metal_dark', pu - 0.06, pu + 0.06, pv - 0.06, pv + 0.06, 2.2, ROOM_H, rgb(0x3a4a4c));
    if (tier >= 3) { R.prop('operating_table', 2.4, r1 - 0.7, 0, 1); R.glow(1.9, 2.9, r1 - 1.3, r1 - 1.28, 2.6, 2.9, 0xdfffff, 0.9); }
    R.point('bed', 1.6, bedV, 0.9); R.point('pad', pu, pv, 0.15);
    R.light(D / 2, 0, ROOM_H - 0.4, 0xdfffff, 0.95, 9);
    R.glow(1.2, D - 1.2, -0.06, 0.06, ROOM_H - 0.03, ROOM_H, 0xeaffff);
  },
  lab(R, tier) {
    const D = R.D, [l0] = R.left, [r0, r1] = R.right;
    const nDesk = tier >= 3 ? 3 : tier >= 2 ? 2 : 1;
    for (let i = 0; i < nDesk; i++) R.prop('desk_computer', 0.9 + i * 1.3, l0 + 0.45, 0, 1);
    R.prop('whiteboard', 2.0, l0 - 0.1 + 0.06, 0, 1, 0);
    R.prop('server_rack_prop', 0.6, r1 - 0.4, 0, -1); R.prop('server_rack_prop', 1.3, r1 - 0.4, 0, -1);
    R.prop('water_cooler', D - 0.4, l0 + 0.3, 0, 1);
    // sample analyzer console + centrifuge
    const au = D - 1.2, av = r1 - 0.45;
    R.solid('metal_plate', au - 0.5, au + 0.5, av - 0.4, av + 0.4, 0, 0.95, rgb(0x8a8e94));
    R.deco('metal_dark', au - 0.5, au + 0.5, av - 0.4, av - 0.05, 0.95, 1.5, rgb(0x2a2c30));
    R.screen('an', au, av - 0.41, 1.25, 0.9, 0.45, 0, -1, 128, 64, (c, w, h) => { c.fillStyle = '#0b0620'; c.fillRect(0, 0, w, h); c.fillStyle = '#b89aff'; c.font = '16px monospace'; c.fillText('SAMPLE ANALYZER', 6, 22); c.fillText('insert sample', 6, 44); });
    pulseMesh(R, CYL(0.22, 0.22, 0.16, 10), 0x9a6aff, au, av + 0.15, 1.03, (m, mat, dt, t) => { m.rotation.y += dt * 6; mat.color.setRGB(0.55 + 0.2 * Math.sin(t * 4), 0.4, 1); });
    if (tier >= 2) R.solid('metal_plate', 0.7, 1.3, r1 - 0.6, r1 - 0.1, 0.0, 0.9, rgb(0x6a6e74));
    if (tier >= 3) pulseMesh(R, new THREE.TorusGeometry(0.42, 0.03, 6, 20), 0x9a6aff, au, av, 2.0, (m, mat, dt, t) => { m.rotation.x = 1.1; m.rotation.y += dt * 1.2; m.position.y = 1.9 + 0.1 * Math.sin(t * 2); });
    R.point('analyzer', au, av - 0.8, 1.2);
    R.light(D / 2, 0, ROOM_H - 0.4, 0xe8eaff, 0.95, 9);
    R.glow(1.2, D - 1.2, -0.06, 0.06, ROOM_H - 0.03, ROOM_H, 0xeef0ff);
  },
  bunk(R, tier) {
    const D = R.D, [l0] = R.left, [r0, r1] = R.right;
    const nL = tier >= 2 ? 2 : 1;
    for (let i = 0; i < nL; i++) R.prop('bunkbed', 1.25 + i * 2.15, l0 + 0.5, 1, 0);
    if (tier >= 3) for (let i = 0; i < 2; i++) R.prop('bunkbed', 1.25 + i * 2.15, r1 - 0.5, -1, 0);
    else { R.prop('locker', 0.5, r1 - 0.3, 0, -1); R.prop('locker', 1.1, r1 - 0.3, 0, -1); }
    if (tier >= 2) { R.prop('locker', 0.5, r1 - 0.3, 0, -1); R.prop('water_cooler', D - 0.4, r1 - 0.3, 0, -1); }
    // spawn points on the aisle
    R.point('spawn0', 1.6, R.aisle - 0.25, 0.05); R.point('spawn1', 2.6, R.aisle + 0.25, 0.05); R.point('spawn2', 3.6, R.aisle - 0.25, 0.05);
    R.light(D / 2, 0, ROOM_H - 0.4, 0xb8b8ff, 0.6, 8);
    R.glow(1.5, D - 1.5, -0.05, 0.05, ROOM_H - 0.03, ROOM_H, 0xb0b8ff, 0.8);
  },
  trophy(R, tier) {
    const D = R.D, hw = R.W / 2, list = R.ctx.trophies || [];
    // mounts along both walls: plaque + mounted head + name plate
    const cap = tier >= 3 ? 12 : tier >= 2 ? 9 : 6;
    for (let i = 0; i < Math.min(cap, Math.max(list.length, 2)); i++) {
      const side = i % 2 ? 1 : -1, u = 0.9 + Math.floor(i / 2) * 0.85, v = side * (hw - 0.05), e = list[i] || null;
      R.deco('wood_dark', u - 0.28, u + 0.28, v - 0.04 * side - 0.04, v - 0.04 * side + 0.04, 1.2, 2.0, rgb(0x5a3a22));
      const hue = e ? e.hue : 0.08, hx = new THREE.Color().setHSL(hue, 0.35, 0.42).getHex();
      R.deco('metal_plate', u - 0.16, u + 0.16, v - side * 0.18 - 0.14, v - side * 0.18 + 0.14, 1.35, 1.85, rgb(hx));
      R.glow(u - 0.12, u - 0.05, v - side * 0.36 - 0.02, v - side * 0.36 + 0.02, 1.6, 1.68, e ? 0xff4a2a : 0x3a3a3a, 0.9);
      R.glow(u + 0.05, u + 0.12, v - side * 0.36 - 0.02, v - side * 0.36 + 0.02, 1.6, 1.68, e ? 0xff4a2a : 0x3a3a3a, 0.9);
      const p = textPlane(0.5, 0.12, 96, 24, (c, w, h) => { c.fillStyle = '#c8a040'; c.fillRect(0, 0, w, h); c.fillStyle = '#1a1208'; c.font = 'bold 15px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e ? String(e.name).slice(0, 11).toUpperCase() : 'EMPTY', w / 2, h / 2 + 1); });
      p.mesh.position.set(R.wx(u, v - side * 0.075), 1.1, R.wz(u, v - side * 0.075)); p.mesh.rotation.y = R.yaw(0, -side);
      R.extra.add(p.mesh); R.disposables.push(p.mesh.geometry, p.mesh.material, p.tex);
    }
    // guestbook podium
    R.solid('wood_dark', 0.7, 1.2, R.right[0] + 0.1, R.right[0] + 0.6, 0, 1.0, rgb(0x6a4a2a));
    R.glow(0.75, 1.15, R.right[0] + 0.15, R.right[0] + 0.55, 1.0, 1.03, 0xffe8a0, 0.9);
    R.point('book', 0.95, R.right[0] + 0.35 - 0.7, 1.0);
    if (tier >= 2) { R.solid('metal_dark', D - 1.4, D - 0.6, R.right[0] + 0.15, R.right[1] - 0.15, 0, 0.7, rgb(0x2a2c30)); R.glow(D - 1.4, D - 0.6, R.right[0] + 0.15, R.right[1] - 0.15, 0.7, 0.72, 0xaad8ff, 0.7); pulseMesh(R, new THREE.OctahedronGeometry(0.16), 0xffd23f, D - 1.0, (R.right[0] + R.right[1]) / 2, 1.3, (m, mat, dt, t) => { m.rotation.y += dt * 1.4; m.position.y = 1.3 + 0.05 * Math.sin(t * 2); }); }
    if (tier >= 3) { R.deco('carpet_red', 0.1, D - 0.1, R.aisle - 0.45, R.aisle + 0.45, 0.004, 0.014, rgb(0xb02a22)); for (const u of [1.3, 3.1]) R.glow(u - 0.2, u + 0.2, -0.2, 0.2, ROOM_H - 0.06, ROOM_H, 0xffe8b0); }
    R.light(D / 2, 0, ROOM_H - 0.4, 0xffd890, 0.85, 9);
  },
  lounge(R, tier) {
    const D = R.D, [l0] = R.left, [r0, r1] = R.right;
    const nChairs = [0, 2, 3, 4][tier];
    for (let i = 0; i < nChairs; i++) R.prop('armchair', 0.9 + i * 0.95, l0 + 0.45, 0, 1);
    R.prop('bookcase', 1.0, r1 - 0.2, 0, -1); R.prop('planter', 2.2, r1 - 0.4, 0, -1); R.prop('planter', 0.5, r1 - 0.4, 0, -1);
    // jukebox: cabinet + animated glow face
    const ju = D - 0.7, jv = r1 - 0.35;
    R.solid('wood_dark', ju - 0.45, ju + 0.45, jv - 0.3, jv + 0.3, 0, 1.5, rgb(0x6a2a3a));
    pulseMesh(R, new THREE.PlaneGeometry(0.7, 0.9), 0xff6a9a, ju, jv - 0.31, 0.95, (m, mat, dt, t) => { m.rotation.y = R.yaw(0, -1); const h = (t * 0.2) % 1; mat.color.setHSL(h, 0.8, 0.55); });
    // stage lights (Mk III) + stage
    if (tier >= 3) { R.solid('wood_planks', D - 2.2, D - 0.2, l0 + 0.05, l0 + 1.15, 0, 0.22, rgb(0x5a3a22)); for (let i = 0; i < 3; i++) pulseMesh(R, new THREE.BoxGeometry(0.16, 0.1, 0.16), 0xffffff, D - 1.9 + i * 0.7, l0 + 0.55, ROOM_H - 0.2, (m, mat, dt, t) => { mat.color.setHSL((t * 0.3 + i / 3) % 1, 0.9, 0.6); }); }
    R.point('lounge', D / 2, l0 + 0.9, 0.2);
    R.light(D / 2, 0, ROOM_H - 0.4, 0xffb0c8, 0.85, 9);
    R.glow(1.2, D - 1.2, -0.05, 0.05, ROOM_H - 0.03, ROOM_H, 0xffd0e0, 0.8);
  },
};

/** build one ground module room. Returns the built parts (see file header). */
export function buildRoomModule(sock, id, tier, ctx = {}) {
  const R = new Room(sock, id, tier, ctx);
  R.shell();
  R.doorSign();
  (LAYOUT[id] || (() => {}))(R, tier);
  const out = R.finish();
  out.meta = { slots: R.slots, crates: R.crates };
  return out;
}

// ------------------------------------------------------------------------------------------------ roof: observation deck, turret, service lift
const ROOF_Y = 3.9;
function simple(ctx) {
  const gb = new GeoBuilder(), boxes = [], extra = new THREE.Group(), anim = [], emitters = [], points = {}, screens = {}, disp = [];
  return {
    gb, boxes, extra, anim, emitters, points, screens, disp,
    solid(key, x, y, z, sx, sy, sz, col, collide = true) { gb.box(key, x, y, z, sx, sy, sz, 0.5, col); if (collide) boxes.push([x, y, z, sx / 2, sy / 2, sz / 2]); },
    glow(x, y, z, sx, sy, sz, hex, m = 1) { gb.box('glow', x, y, z, sx, sy, sz, 0.5, rgb(hex, m)); },
    finish(name) { const group = new THREE.Group(); group.name = name; group.add(gb.build(matFor)); group.add(extra); return { group, boxes, emitters, points, anim, screens, dispose: () => { group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); for (const d of disp) { try { d.dispose?.(); } catch { /* */ } } } }; },
  };
}

export function buildDeck(tier, ctx = {}) {
  const P = simple(ctx), y0 = ROOF_Y, c1 = paintHex(ctx.paint?.c1), R = SOCKETS.DECK.room, cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
  // deck plating + safety walls around the whole roof (invisible colliders) so nobody falls off
  P.solid('metal_plate', cx, y0 + 0.02, cz, R.x1 - R.x0, 0.06, R.z1 - R.z0, rgb(0x6a6e74), false);
  const edges = [[0, 3.68, 14.5, 0.14], [0, -3.68, 14.5, 0.14]], eh = 3.85;
  for (const [x, z, sx, sz] of edges) P.boxes.push([x, y0 + 0.6, z, sx / 2, 0.6, sz / 2]);
  P.boxes.push([7.1, y0 + 0.6, 0, 0.07, 0.6, 3.75], [-7.1, y0 + 0.6, 0, 0.07, 0.6, 3.75]);
  void eh;
  // canopy: four posts, top frame, glass
  for (const [px, pz] of [[R.x0 + 0.2, R.z0 + 0.2], [R.x1 - 0.2, R.z0 + 0.2], [R.x0 + 0.2, R.z1 - 0.2], [R.x1 - 0.2, R.z1 - 0.2]]) P.solid('metal_dark', px, y0 + 1.5, pz, 0.14, 3.0, 0.14, rgb(0x55585c), true);
  P.solid('metal_dark', cx, y0 + 3.05, cz, R.x1 - R.x0, 0.1, R.z1 - R.z0, rgb(c1, 0.8), false);
  const glass = new THREE.MeshBasicMaterial({ color: 0x8ad8ff, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide });
  P.disp.push(glass);
  for (const [gx, gz, sx, sz] of [[cx, R.z0, R.x1 - R.x0, 0.02], [cx, R.z1, R.x1 - R.x0, 0.02], [R.x0, cz, 0.02, R.z1 - R.z0], [R.x1, cz, 0.02, R.z1 - R.z0]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 2.9, sz), glass); m.position.set(gx, y0 + 1.5, gz); P.extra.add(m); P.disp.push(m.geometry); }
  // telescope on a tripod + star console + benches
  P.solid('metal_dark', cx - 1.0, y0 + 0.5, cz - 1.6, 0.1, 1.0, 0.1, rgb(0x3a3c40), true);
  const scope = new THREE.Mesh(CYL(0.09, 0.14, 1.4, 8), new THREE.MeshLambertMaterial({ color: 0xb8b8c0 })); scope.position.set(cx - 1.0, y0 + 1.25, cz - 1.6); scope.rotation.set(0, 0, Math.PI / 4); P.extra.add(scope); P.disp.push(scope.geometry, scope.material);
  P.anim.push((dt, t) => { scope.rotation.y = Math.sin(t * 0.15) * 0.8; });
  P.solid('metal_plate', cx + 1.4, y0 + 0.45, cz - 2.4, 1.6, 0.9, 0.5, rgb(0x6a6e74), true);
  const scr = textPlane(1.4, 0.7, 160, 80, (c, w, h) => { c.fillStyle = '#02101c'; c.fillRect(0, 0, w, h); c.fillStyle = '#7ad8ff'; c.font = '18px monospace'; c.fillText('STAR SCANNER', 8, 24); });
  scr.mesh.position.set(cx + 1.4, y0 + 1.15, cz - 2.14); scr.mesh.rotation.x = -0.35; P.extra.add(scr.mesh); P.disp.push(scr.mesh.geometry, scr.mesh.material, scr.tex); P.screens.scan = scr;
  for (const sz of [1.8, 2.5]) P.solid('wood_planks', cx + 1.4, y0 + 0.28, cz + sz, 1.8, 0.4, 0.5, rgb(0x8a6a4a), true);
  if (tier >= 2) P.solid('metal_plate', cx - 2.2, y0 + 0.4, cz + 1.8, 0.8, 0.8, 0.8, rgb(0x6a6e74), true);
  if (tier >= 3) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.04, 6, 24), new THREE.MeshBasicMaterial({ color: 0x7ad8ff })); ring.position.set(cx - 2.2, y0 + 1.6, cz + 1.8); P.extra.add(ring); P.disp.push(ring.geometry, ring.material); P.anim.push((dt) => { ring.rotation.x = 1.1; ring.rotation.y += dt * 0.8; }); }
  P.points.deck = V3(cx, y0, cz); P.points.scan = V3(cx + 1.4, y0 + 1.0, cz - 1.9);
  P.emitters.push({ pos: V3(cx, y0 + 2.7, cz), color: 0xbfe8ff, intensity: 0.7, distance: 9 });
  return P.finish('shipyard_deck');
}

export function buildLift(ctx = {}) {
  const P = simple(ctx), gx = -2.5, gz = 4.7;
  // ground pad + frame tower up the +z hull to the roof deck
  P.solid('metal_plate', gx, -1.15, gz, 1.5, 0.2, 1.4, rgb(0x6a6e74), true);
  P.glow(gx, -1.04, gz, 1.1, 0.02, 1.0, 0x7ad8ff, 0.9);
  for (const [px, pz] of [[gx - 0.72, gz - 0.65], [gx + 0.72, gz - 0.65], [gx - 0.72, gz + 0.65], [gx + 0.72, gz + 0.65]]) P.solid('metal_dark', px, 1.4, pz, 0.1, 5.4, 0.1, rgb(0xd8b020, 0.85), false);
  P.solid('metal_dark', gx, 4.15, gz - 0.65, 1.5, 0.1, 0.1, rgb(0xd8b020, 0.85), false);
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 1.2), new THREE.MeshLambertMaterial({ color: 0x8a8e94 })); carriage.position.set(gx, -1.0, gz); P.extra.add(carriage); P.disp.push(carriage.geometry, carriage.material);
  P.anim.push((dt, t) => { carriage.position.y = 1.4 + Math.sin(t * 0.5) * 2.4; });
  // roof-side console (top station)
  P.solid('metal_plate', gx, ROOF_Y + 0.5, 2.9, 0.7, 1.0, 0.4, rgb(0x6a6e74), true);
  P.glow(gx, ROOF_Y + 1.05, 2.9, 0.5, 0.05, 0.3, 0x7ad8ff, 0.9);
  P.points.down = V3(gx, -0.6, gz - 0.9); P.points.up = V3(gx, ROOF_Y + 0.9, 2.55);
  P.points.landTop = V3(gx, ROOF_Y + 0.05, 2.2); P.points.landDown = V3(gx, -1.0, gz + 0.05);
  P.emitters.push({ pos: V3(gx, 0.8, gz + 0.4), color: 0x9adfff, intensity: 0.6, distance: 7 });
  return P.finish('shipyard_lift');
}

export function buildTurret(tier, ctx = {}) {
  const P = simple(ctx), R = SOCKETS.TURRET.room, cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2, y0 = ROOF_Y, c1 = paintHex(ctx.paint?.c1);
  P.solid('metal_dark', cx, y0 + 0.2, cz, 1.9, 0.4, 1.9, rgb(0x3a3c40), true);
  P.solid('metal_plate', cx, y0 + 0.75, cz, 0.9, 0.7, 0.9, rgb(c1, 0.8), true);
  for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) P.glow(cx + dx, y0 + 0.42, cz + dz, 0.1, 0.05, 0.1, 0xff5a3a, 0.9);
  // rotating head: yaw pivot -> pitch pivot -> barrel(s)
  const yaw = new THREE.Group(); yaw.position.set(cx, y0 + 1.25, cz);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 0.85), new THREE.MeshLambertMaterial({ color: 0x6a6e74 }));
  const cap = new THREE.Mesh(CYL(0.26, 0.3, 0.16, 8), new THREE.MeshLambertMaterial({ color: 0x2a2c30 })); cap.position.y = 0.32;
  const pitch = new THREE.Group(); pitch.position.set(0, 0.05, 0.3);
  const barrelMat = new THREE.MeshLambertMaterial({ color: 0x22242a }), barrelGeo = new THREE.BoxGeometry(0.1, 0.1, 1.1);
  const offs = tier >= 3 ? [-0.2, 0.2] : [0];
  const muzzles = [];
  for (const ox of offs) { const b = new THREE.Mesh(barrelGeo, barrelMat); b.position.set(ox, 0, 0.5); pitch.add(b); const mz = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.06), new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0 })); mz.position.set(ox, 0, 1.08); pitch.add(mz); muzzles.push(mz); }
  yaw.add(body, cap, pitch); P.extra.add(yaw);
  P.disp.push(body.geometry, body.material, cap.geometry, cap.material, barrelGeo, barrelMat);
  const st = { yaw: 0, pitch: 0, flash: 0 };
  P.anim.push((dt) => {
    yaw.rotation.y += (st.yaw - yaw.rotation.y) * Math.min(1, dt * 8);
    pitch.rotation.x += (-st.pitch - pitch.rotation.x) * Math.min(1, dt * 8);
    st.flash = Math.max(0, st.flash - dt * 9);
    for (const m of muzzles) m.material.opacity = st.flash > 0 ? 0.9 : 0;
  });
  P.turretState = st;
  P.points.muzzle = V3(cx, y0 + 1.3, cz);
  P.emitters.push({ pos: V3(cx, y0 + 2.0, cz), color: 0xff8a5a, intensity: 0.45, distance: 7 });
  const out = P.finish('shipyard_turret');
  out.state = st;
  return out;
}

// ------------------------------------------------------------------------------------------------ hull paint + name plate (core)
export function buildPaint(paint, name) {
  const group = new THREE.Group(); group.name = 'shipyard_paint';
  if (!HAS_DOM) return { group, dispose() {} };
  const h1 = cssHex(paintHex(paint.c1)), h2 = cssHex(paintHex(paint.c2)), disp = [];
  const S = { x0: -7.25, x1: 7.25, z0: -3.75, z1: 3.75 }, eh = 3.85;
  // recolour the orange hull stripe and add a pattern band low on the hull
  const stripeTex = canvasTex(256, 32, (g, w, h) => { g.fillStyle = h1; g.fillRect(0, 0, w, h); });
  const bandTex = canvasTex(512, 32, (g, w, h) => drawPattern(g, w, h, paint.pat, h1, h2));
  const roofTex = canvasTex(256, 128, (g, w, h) => { drawPattern(g, w, h, paint.pat === 'solid' ? 'solid' : paint.pat, h2, h1); g.strokeStyle = h1; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); });
  for (const t of [stripeTex, bandTex, roofTex]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; disp.push(t); }
  bandTex.repeat.set(3, 1);
  const mStripe = new THREE.MeshLambertMaterial({ map: stripeTex }), mBand = new THREE.MeshLambertMaterial({ map: bandTex }), mRoof = new THREE.MeshLambertMaterial({ map: roofTex });
  disp.push(mStripe, mBand, mRoof);
  const pl = (w, hh, mat, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), mat); m.position.set(x, y, z); m.rotation.y = ry; group.add(m); disp.push(m.geometry); return m; };
  // [wave5] the stripe / band are cut around the door opening, the clerestory windows (+z) and the N1 / N2 doorways (-z): they used to run straight
  // across them, so a painted ship looked closed from outside and the windows were painted over
  const DOOR = { x0: 1.5, x1: 3.7 }, WIN = [[-6.3, -4.9], [-3.75, -2.55], [-1.0, 0.2]];
  const cut = (segs, a, b) => segs.flatMap(([p, q]) => (b <= p || a >= q ? [[p, q]] : [[p, Math.max(p, a)], [Math.min(q, b), q]])).filter(([p, q]) => q - p > 0.05);
  const run = (mat, y, hh, z, ry, holes) => {
    let segs = [[S.x0, S.x1]];
    for (const [a, b] of holes) segs = cut(segs, a, b);
    for (const [a, b] of segs) { const m = pl(b - a, hh, mat, (a + b) / 2, y, z, ry); if (mat.map) { m.geometry.attributes.uv.array.forEach((v, i, arr) => { if (i % 2 === 0) arr[i] = (a + v * (b - a) - S.x0) / (S.x1 - S.x0); }); } }
  };
  const gapsN = Object.values(CORE_GAPS).filter((g) => g.wall === '-z').map((g) => [g.c - g.w / 2, g.c + g.w / 2]);
  for (const sg of [1, -1]) {
    const z = sg * (S.z1 + 0.05), ry = sg > 0 ? 0 : Math.PI;
    run(mStripe, 2.6, 0.5, z, ry, sg > 0 ? [[DOOR.x0, DOOR.x1], ...WIN] : gapsN);
    run(mBand, 0.42, 0.6, z, ry, sg > 0 ? [[DOOR.x0, DOOR.x1]] : gapsN);
    // name plate above the door line
    const plate = textPlane(3.6, 0.5, 288, 40, (c, w, hh) => { c.fillStyle = '#12151a'; c.fillRect(0, 0, w, hh); c.strokeStyle = h1; c.lineWidth = 3; c.strokeRect(2, 2, w - 4, hh - 4); c.fillStyle = '#e8e0cc'; c.font = 'bold 26px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(name || 'KC-07'), w / 2, hh / 2 + 2); });
    plate.mesh.position.set(-2.4, 3.3, sg * (S.z1 + 0.06)); plate.mesh.rotation.y = ry; group.add(plate.mesh); disp.push(plate.mesh.geometry, plate.mesh.material, plate.tex);
  }
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(S.x1 - S.x0 - 0.6, S.z1 - S.z0 - 0.6), mRoof); roof.rotation.x = -Math.PI / 2; roof.position.set(0, eh + 0.015, 0); group.add(roof); disp.push(roof.geometry);
  return { group, dispose() { for (const d of disp) { try { d.dispose?.(); } catch { /* */ } } } };
}

// ------------------------------------------------------------------------------------------------ Frame Console (core cabin, +z wall) - where ship parts are fed in
export const FRAME_CONSOLE = { x: -4.9, z: 3.22, w: 0.95, d: 0.5, h: 1.1 };
export function buildFrameConsole() {
  const g = new THREE.Group(); g.name = 'shipyard_frame_console';
  const F = FRAME_CONSOLE, disp = [];
  const body = new THREE.Mesh(new THREE.BoxGeometry(F.w, F.h, F.d), LM(0x4a4d52)); body.position.set(F.x, F.h / 2, F.z); g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(F.w + 0.06, 0.06, F.d + 0.06), LM(0xd8b020)); top.position.set(F.x, F.h + 0.03, F.z); g.add(top);
  disp.push(body.geometry, body.material, top.geometry, top.material);
  const scr = textPlane(0.8, 0.4, 160, 80, (c, w, h) => { c.fillStyle = '#0a0c08'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd23f'; c.font = 'bold 20px monospace'; c.fillText('FRAME CONSOLE', 8, 26); c.fillStyle = '#9aa08a'; c.font = '15px monospace'; c.fillText('SHIPYARD', 8, 48); c.fillText('feed ship parts', 8, 68); });
  scr.mesh.position.set(F.x, F.h + 0.3, F.z - 0.05); scr.mesh.rotation.y = Math.PI;
  g.add(scr.mesh); disp.push(scr.mesh.geometry, scr.mesh.material, scr.tex);
  const hopper = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.3), new THREE.MeshBasicMaterial({ color: 0xffb040 })); hopper.position.set(F.x, F.h + 0.075, F.z - 0.02); g.add(hopper); disp.push(hopper.geometry, hopper.material);
  const boxes = [[F.x, F.h / 2, F.z, F.w / 2, F.h / 2, F.d / 2]];
  return { group: g, boxes, point: V3(F.x, 1.25, F.z - 0.45), dispose() { for (const d of disp) { try { d.dispose?.(); } catch { /* */ } } } };
}

// ------------------------------------------------------------------------------------------------ ship part item models (world drops + inventory icons)
const LM = (c) => new THREE.MeshLambertMaterial({ color: c });
const bx = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
export function createPartModel(key) {
  const g = new THREE.Group();
  if (key === 'plate') {
    g.add(bx(0.3, 0.03, 0.22, LM(0x8a8e94)));
    for (const [x, z] of [[-0.12, -0.08], [0.12, -0.08], [-0.12, 0.08], [0.12, 0.08]]) g.add(bx(0.03, 0.02, 0.03, LM(0x3a3c40), x, 0.02, z));
    g.add(bx(0.3, 0.032, 0.05, LM(0xc8581c), 0, 0, 0.0));
  } else if (key === 'bulk') {
    const m = LM(0x6a6e74);
    g.add(bx(0.26, 0.03, 0.26, m)); g.add(bx(0.03, 0.14, 0.26, m, -0.115, 0.07, 0)); g.add(bx(0.03, 0.14, 0.26, m, 0.115, 0.07, 0)); g.add(bx(0.26, 0.03, 0.03, LM(0xd8b020), 0, 0.14, 0));
  } else if (key === 'coil') {
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8), LM(0xb0743c)); g.add(core);
    for (const y of [-0.07, 0, 0.07]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 5, 10), new THREE.MeshBasicMaterial({ color: 0xff8a3a })); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); }
  } else {
    g.add(bx(0.22, 0.05, 0.08, LM(0xd8b020))); g.add(bx(0.05, 0.16, 0.08, LM(0xd8b020), -0.085, 0.055, 0)); g.add(bx(0.03, 0.03, 0.09, LM(0x2a2c30), 0.05, 0.03, 0));
  }
  return g;
}
