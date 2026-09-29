// MAPART art (wave 6): every visual of the signature layer. Merged / instanced geometry only, unlit or Lambert vertex colours, NO scene lights
// (glow = MeshBasicMaterial). One 2D-art atlas (ads, signs, tape, holo variants, pod stencils) is drawn on a canvas at build time and re-drawn on a
// language change. Interactive parts (pylon eye, drones) are individual meshes sharing geometry; everything else is one mesh per material.
//   buildArt(specs, { h, seed, accent, floodY }) -> { group, colliders, pylons, drones, boards, camps, update(dt, t, cam, players), ..., dispose() }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../core/rng.js';
import { onLangChange } from '../core/i18n.js';
import { makeCanvasTexture } from '../render/textures.js';
import { ADS, SIGNS, HOLO, tx } from './mapart_text.js';
import { CELL } from './mapart_core.js';
import { buildLandmark } from './mapart_lm.js';

const TAU = Math.PI * 2;
const CW = 256, CH = 128, COLS = 4, ROWS = 8, AW = CW * COLS, AH = CH * ROWS;
const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

// ------------------------------------------------------------------ geometry bags
/** vertex-coloured solid parts, merged into ONE geometry */
export class Bag {
  constructor() { this.list = []; }
  add(geo, x, y, z, rx, ry, rz, sx, sy, sz, color) {
    const g = geo.clone();
    g.deleteAttribute('uv');
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.list.push(g);
    return this;
  }
  box(x, y, z, sx, sy, sz, color, ry = 0, rx = 0, rz = 0) { return this.add(BOX, x, y, z, rx, ry, rz, sx, sy, sz, color); }
  cyl(x, y, z, rt, rb, h, color, seg = 7, rx = 0, rz = 0, ry = 0) { return this.add(cylGeo(rt, rb, seg), x, y, z, rx, ry, rz, 1, h, 1, color); }
  geo(g, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) { return this.add(g, x, y, z, rx, ry, rz, sx, sy, sz, color); }
  build() {
    if (!this.list.length) return null;
    const out = mergeGeometries(this.list, false);
    for (const g of this.list) g.dispose();
    this.list.length = 0;
    return out;
  }
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
const cylCache = new Map();
function cylGeo(rt, rb, seg) { const k = `${rt}|${rb}|${seg}`; if (!cylCache.has(k)) cylCache.set(k, new THREE.CylinderGeometry(rt, rb, 1, seg)); return cylCache.get(k); }
export { cylGeo, BOX };

/** textured quads (atlas / holo), one merged BufferGeometry; cells can be re-pointed at run time */
class QuadBag {
  constructor() { this.pos = []; this.uv = []; this.idx = []; this.n = 0; }
  quad(p0, p1, p2, p3, cell, rep = 1) {
    const at = this.n;
    this.pos.push(...p0, ...p1, ...p2, ...p3);
    this.uv.push(...cellUV(cell, rep));
    this.idx.push(at, at + 1, at + 2, at, at + 2, at + 3);
    this.n += 4;
    return at;
  }
  build() {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
/** quad on a vertical plane centred at (cx,cy,cz) facing horizontal normal (nx,nz), readable from the front */
function face(quads, cx, cy, cz, nx, nz, w, hh, cell) {
  const rx = (nz * w) / 2, rz = (-nx * w) / 2;
  return quads.quad([cx - rx, cy - hh / 2, cz - rz], [cx + rx, cy - hh / 2, cz + rz], [cx + rx, cy + hh / 2, cz + rz], [cx - rx, cy + hh / 2, cz - rz], cell);
}
/** uv of the 4 corners (bottom-left, bottom-right, top-right, top-left) of atlas cell i */
function cellUV(i, rep = 1) {
  const col = i % COLS, row = Math.floor(i / COLS);
  const e = 0.6 / AW, u0 = col / COLS + e, u1 = (col + 1) / COLS - e;
  const v1 = 1 - row / ROWS - e, v0 = 1 - (row + 1) / ROWS + e;
  void rep;
  return [u0, v0, u1, v0, u1, v1, u0, v1];
}
function setQuadUV(geo, at, cell) { const a = geo.attributes.uv, u = cellUV(cell); for (let k = 0; k < 4; k++) a.setXY(at + k, u[k * 2], u[k * 2 + 1]); a.needsUpdate = true; }

// ------------------------------------------------------------------ 2D art atlas
function fit(ctx, str, maxW, size, weight = 'bold') {
  let s = size;
  for (; s > 8; s--) { ctx.font = `${weight} ${s}px monospace`; if (ctx.measureText(str).width <= maxW) break; }
  return s;
}
function lines(ctx, str, cx, y, lh, maxW, size, color, weight = 'bold') {
  ctx.fillStyle = color; ctx.textAlign = 'center';
  const parts = String(str).split('\n');
  let s = size;
  for (const p of parts) s = Math.min(s, fit(ctx, p, maxW, size, weight));
  ctx.font = `${weight} ${s}px monospace`;
  parts.forEach((p, i) => ctx.fillText(p, cx, y + i * lh));
}
function stripes(ctx, x, y, w, h, a, b, step = 14) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = a; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = b;
  for (let k = -h; k < w + h; k += step * 2) { ctx.beginPath(); ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + step, y + h); ctx.lineTo(x + k + step + h, y); ctx.lineTo(x + k + h, y); ctx.fill(); }
  ctx.restore();
}
function drawAtlas(ctx, pods) {
  ctx.clearRect(0, 0, AW, AH);
  const cell = (i) => [(i % COLS) * CW, Math.floor(i / COLS) * CH];
  ADS.forEach((ad, i) => {
    const [x, y] = cell(CELL.ad + i);
    ctx.fillStyle = ad.bg; ctx.fillRect(x, y, CW, CH);
    ctx.fillStyle = ad.fg; ctx.globalAlpha = 0.9; ctx.fillRect(x + 6, y + 6, CW - 12, 3); ctx.fillRect(x + 6, y + CH - 9, CW - 12, 3); ctx.globalAlpha = 1;
    lines(ctx, tx(ad.brand), x + CW / 2, y + 44, 0, CW - 24, 34, ad.fg);
    lines(ctx, tx(ad.line), x + CW / 2, y + 76, 20, CW - 22, 16, ad.fg, 'normal');
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'right'; ctx.fillStyle = ad.fg; ctx.fillText('AD', x + CW - 10, y + 22);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (let yy = 0; yy < CH; yy += 4) ctx.fillRect(x, y + yy, CW, 1);
  });
  { const [x, y] = cell(CELL.broken);
    ctx.fillStyle = '#0a0a0e'; ctx.fillRect(x, y, CW, CH);
    lines(ctx, 'ERROR 404', x + CW / 2, y + 58, 0, CW - 20, 34, '#ff2a4a');
    lines(ctx, 'AD NOT FOUND', x + CW / 2, y + 86, 0, CW - 20, 16, '#8a8a98', 'normal');
    ctx.strokeStyle = '#3a3a48'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 20, y); ctx.lineTo(x + 90, y + 60); ctx.lineTo(x + 70, y + CH); ctx.moveTo(x + 90, y + 60); ctx.lineTo(x + CW - 30, y + 30); ctx.stroke(); }
  SIGNS.forEach((s, i) => {
    const [x, y] = cell(CELL.sign + i);
    ctx.fillStyle = '#16161a'; ctx.fillRect(x, y, CW, CH);
    stripes(ctx, x, y, CW, 20, '#f2c230', '#141414', 10);
    lines(ctx, tx(s.head), x + CW / 2, y + 52, 0, CW - 20, 30, '#f2c230');
    lines(ctx, tx(s.line), x + CW / 2, y + 80, 18, CW - 20, 15, '#e4e4e4', 'normal');
    stripes(ctx, x, y + CH - 12, CW, 12, '#f2c230', '#141414', 10);
  });
  { const [x, y] = cell(CELL.tape); stripes(ctx, x, y, CW, CH, '#f2c230', '#151515', 18); }
  HOLO.forEach((h, i) => {
    const [x, y] = cell(CELL.holo + i);
    const R = new RNG(9000 + i * 31);
    ctx.fillStyle = 'rgba(8,36,52,0.62)'; ctx.fillRect(x, y, CW, CH);
    ctx.strokeStyle = '#2af4ff'; ctx.lineWidth = 3; ctx.strokeRect(x + 3, y + 3, CW - 6, CH - 6);
    lines(ctx, tx([h[0]]), x + CW / 2, y + 62, 0, CW - 40, 52, '#eaffff');
    lines(ctx, tx([h[1]]), x + CW / 2, y + 96, 0, CW - 30, 17, '#2af4ff', 'normal');
    ctx.fillStyle = '#ff2bd6'; ctx.beginPath(); ctx.arc(x + 20, y + 20, 5, 0, TAU); ctx.fill();
    for (let k = 0; k < 6; k++) { ctx.fillStyle = R.chance(0.5) ? 'rgba(255,43,214,0.55)' : 'rgba(42,244,255,0.5)'; ctx.fillRect(x + R.int(0, CW - 60), y + R.int(4, CH - 10), R.int(24, 110), R.int(2, 7)); }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let yy = 0; yy < CH; yy += 3) ctx.fillRect(x, y + yy, CW, 1);
  });
  for (let i = 0; i < CELL.podCount; i++) {
    const [x, y] = cell(CELL.pod + i), p = pods[i] || { num: 100 + i, crew: i };
    ctx.fillStyle = '#e8e2d0'; ctx.fillRect(x + 4, y + 30, CW - 8, 70);
    lines(ctx, `C-${p.num}`, x + CW / 2, y + 76, 0, CW - 30, 46, '#1c1a16');
    ctx.fillStyle = '#c4241c'; ctx.fillRect(x + 4, y + 20, CW - 8, 8);
    lines(ctx, `CREW ${p.crew + 1}  •  PROPERTY OF THE COMPANY`, x + CW / 2, y + 120, 0, CW - 10, 11, '#e8e2d0', 'normal');
  }
}

// ------------------------------------------------------------------ eye textures (pylon)
function eyeTex(open) {
  return makeCanvasTexture(128, 128, (ctx) => {
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = '#ff2bd6'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) { ctx.globalAlpha = open ? 1 - k * 0.2 : 0.25; ctx.beginPath(); ctx.arc(64, 44, 14 + k * 13, Math.PI * 1.22, Math.PI * 1.78); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (open) {
      ctx.fillStyle = '#0c0616'; ctx.beginPath(); ctx.ellipse(64, 84, 52, 30, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2af4ff'; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = '#ff2bd6'; ctx.beginPath(); ctx.arc(64, 84, 21, 0, TAU); ctx.fill();
      ctx.fillStyle = '#100418'; ctx.fillRect(59, 66, 10, 36);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(48, 74, 6, 6);
    } else {
      ctx.strokeStyle = '#4a4a58'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(14, 86); ctx.quadraticCurveTo(64, 106, 114, 86); ctx.stroke();
    }
  });
}

// ------------------------------------------------------------------ the build
export function buildArt(specs, ctx) {
  const { h, seed = 1 } = ctx;
  const accent = ctx.accent ?? 0x2af4ff;
  const group = new THREE.Group();
  group.name = 'mapart';
  const geos = [], mats = [], texs = [];
  const own = (o, arr) => { arr.push(o); return o; };
  const colliders = [];
  const col = (x, y, z, sx, sy, sz, ry = 0, data = null) => colliders.push({ x, y, z, sx, sy, sz, ry, data });
  const podSpecs = specs.filter((s) => s.kind === 'pod');
  const atlas = own(makeCanvasTexture(AW, AH, (c) => drawAtlas(c, podSpecs)), texs);
  const redraw = () => { try { drawAtlas(atlas.image.getContext('2d'), podSpecs); atlas.needsUpdate = true; } catch { /* no DOM */ } };
  const offLang = onLangChange(redraw);

  const solid = new Bag(), glow = new Bag(), quads = new QuadBag(), holo = new QuadBag();
  const pylons = new Map(), drones = new Map(), boards = new Map(), panels = [], camps = new Map(), signs = new Map(), scars = [], landmarks = [];
  const R = new RNG(seed ^ 0xa17a);
  const RUST = 0x7a4a30, DARK = 0x1a1a22, GREY = 0x6a707a, PALE = 0xc8c2b0;

  // ---- pylon / eye (individual meshes)
  const eyeOpen = own(new THREE.MeshBasicMaterial({ map: eyeTex(true), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, depthWrite: false }), mats);
  const eyeShut = own(new THREE.MeshBasicMaterial({ map: eyeTex(false), transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, depthWrite: false }), mats);
  texs.push(eyeOpen.map, eyeShut.map);
  const eyeGeo = own(new THREE.PlaneGeometry(4.2, 4.2), geos);
  for (const s of specs) {
    switch (s.kind) {
      case 'pylon': {
        const H = s.h, x = s.x, z = s.z, y = s.y - 0.4;
        solid.cyl(x, y + H / 2, z, 0.35, 0.85, H, GREY, 8);
        solid.box(x, y + 0.6, z, 2.4, 1.2, 2.4, DARK, s.yaw);
        for (let k = 1; k <= 4; k++) { const f = k / 5.4, r = 0.93 - 0.5 * f; glow.cyl(x, y + H * f, z, r, r, 0.22, 0xff2bd6, 8); }
        solid.box(x, y + H + 0.3, z, 1.6, 0.6, 1.6, DARK);
        for (let k = 0; k < 4; k++) { const a = k * TAU / 4; solid.box(x + Math.cos(a) * 0.9, y + H + 1.1, z + Math.sin(a) * 0.9, 0.12, 1.8, 0.12, GREY); }
        glow.geo(new THREE.SphereGeometry(0.28, 6, 4), x, y + H + 2.2, z, 1, 1, 1, 0xff2bd6);
        const eye = new THREE.Mesh(eyeGeo, eyeOpen);
        eye.position.set(x, y + H + 3.4, z);
        group.add(eye);
        pylons.set(s.id, { spec: s, eye, off: false, look: 0, pos: new THREE.Vector3(x, y + 1.2, z) });
        col(x, y + 2, z, 1.8, 4, 1.8, 0, { kind: 'prop' });
        break;
      }
      case 'panel': {
        const w = s.w, hh = w * 0.5, c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
        const rx = c * w / 2, rz = -sn * w / 2;
        const at = holo.quad([s.x - rx, s.y - hh / 2, s.z - rz], [s.x + rx, s.y - hh / 2, s.z + rz], [s.x + rx, s.y + hh / 2, s.z + rz], [s.x - rx, s.y + hh / 2, s.z - rz], CELL.holo + s.v);
        panels.push({ spec: s, at, v: s.v, t: R.float(0, 1) });
        glow.box(s.x, s.gy + 0.1, s.z, 0.5, 0.2, 0.5, accent);   // projector puck on the ground below
        break;
      }
      case 'billboard': {
        const { w, hh, post } = s, x = s.x, z = s.z, y = s.y;
        const c = Math.cos(s.yaw), sn = Math.sin(s.yaw), fx = sn, fz = c;
        const cy = y + post + hh / 2;
        solid.box(x - c * (w / 2 - 0.5), y + post / 2, z + sn * (w / 2 - 0.5), 0.36, post, 0.36, RUST, s.yaw);
        solid.box(x + c * (w / 2 - 0.5), y + post / 2, z - sn * (w / 2 - 0.5), 0.36, post, 0.36, RUST, s.yaw);
        solid.box(x - fx * 0.08, cy, z - fz * 0.08, w + 0.4, hh + 0.4, 0.18, DARK, s.yaw);
        const at = face(quads, x + fx * 0.06, cy, z + fz * 0.06, fx, fz, w, hh, CELL.ad + s.ad);
        glow.box(x, cy + hh / 2 + 0.35, z, w + 0.4, 0.1, 0.14, 0xffe6a0, s.yaw);
        boards.set(s.id, { spec: s, at, silenced: false, pos: new THREE.Vector3(x, cy, z), jingleT: R.float(0, 6) });
        col(x - c * (w / 2 - 0.5), y + post / 2, z + sn * (w / 2 - 0.5), 0.4, post, 0.4, s.yaw, { kind: 'prop' });
        col(x + c * (w / 2 - 0.5), y + post / 2, z - sn * (w / 2 - 0.5), 0.4, post, 0.4, s.yaw, { kind: 'prop' });
        break;
      }
      case 'scar': scars.push(s); break;
      case 'pod': {
        const { x, z, yaw } = s, y = s.y, c = Math.cos(yaw), sn = Math.sin(yaw), P2 = Math.PI / 2;
        solid.cyl(x, y + 1.35, z, 1.55, 1.55, 5, PALE, 8, 0, P2 - s.tilt, yaw).cyl(x, y + 0.1, z, 4.4, 4.6, 0.2, 0x2a2622, 9);
        solid.geo(new THREE.ConeGeometry(1.55, 1.8, 8), x + c * 3.3, y + 1.0, z - sn * 3.3, 1, 1, 1, PALE, 0, yaw, -P2 + s.tilt);
        solid.box(x - c * 0.6, y + 2.75, z + sn * 0.6, 1.6, 0.3, 1.6, DARK, yaw, 0, s.tilt);   // blown hatch
        solid.box(x - c * 2.7, y + 1.4, z + sn * 2.7, 0.15, 2.4, 0.5, RUST, yaw + 0.4);
        solid.cyl(x - c * 1.0, y + 1.35, z + sn * 1.0, 1.6, 1.6, 0.7, 0xc4241c, 8, 0, P2 - s.tilt, yaw);   // hazard band
        const idx = Math.min(podSpecs.indexOf(s), CELL.podCount - 1), nx = -sn, nz = -c;
        face(quads, x + nx * 1.63, y + 1.25, z + nz * 1.63, nx, nz, 2.8, 1.4, CELL.pod + idx);
        face(quads, x - nx * 1.63, y + 1.25, z - nz * 1.63, -nx, -nz, 2.8, 1.4, CELL.pod + idx);
        col(x, y + 1.4, z, 5.4, 3, 3.3, yaw, { kind: 'prop' });
        break;
      }
      case 'rig': {
        const { x, z, y } = s;
        for (let k = 0; k < 3; k++) { const a = s.yaw + k * TAU / 3; solid.cyl(x + Math.cos(a) * 0.9, y + 1.5, z + Math.sin(a) * 0.9, 0.05, 0.09, 3.1, GREY, 5, Math.sin(a) * 0.3, Math.cos(a) * -0.3); }
        solid.cyl(x, y + 1.2, z, 0.12, 0.12, 3.6, 0x3a3a44, 6);
        solid.box(x + 1.5, y + 0.55, z - 0.6, 1.3, 1.1, 1.0, 0xd8a020, s.yaw);
        solid.box(x + 1.5, y + 1.15, z - 0.6, 1.36, 0.14, 1.06, DARK, s.yaw);
        glow.box(x + 1.5, y + 1.3, z - 0.6, 0.2, 0.2, 0.2, 0xff5a2a);
        solid.cyl(x - 1.3, y + 0.4, z + 0.8, 0.35, 0.35, 0.8, 0x9a2a20, 7);
        col(x + 0.4, y + 1, z, 3.4, 2, 1.8, s.yaw, { kind: 'prop' });
        break;
      }
      case 'camp': {
        const { x, z, y } = s, c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
        solid.geo(new THREE.ConeGeometry(2.1, 2.2, 4), x, y + 1.1, z, 1, 1, 1, 0x5a6244, 0, s.yaw + Math.PI / 4);
        solid.box(x - sn * 2.6, y + 0.35, z + c * 2.6 - 0.3, 0.9, 0.7, 0.9, 0x6a4a2a, s.yaw);
        solid.box(x + sn * 2.4 + c * 1.0, y + 0.3, z - c * 2.4 + sn * 1.0, 1.1, 0.6, 0.8, 0x3a4a3a, s.yaw + 0.5);
        solid.cyl(x + c * 3.0, y + 0.45, z - sn * 3.0, 0.42, 0.42, 0.9, 0x3a3230, 7);
        for (let k = 0; k < 6; k++) { const a = k * TAU / 6; solid.box(x + c * 3.0 + Math.cos(a) * 0.9, y + 0.1, z - sn * 3.0 + Math.sin(a) * 0.9, 0.3, 0.2, 0.3, 0x2a2a2a); }
        solid.cyl(x - c * 1.9, y + 1.5, z + sn * 1.9, 0.04, 0.04, 3, GREY, 4);
        glow.box(x - c * 1.9 + 0.35, y + 2.7, z + sn * 1.9, 0.7, 0.4, 0.04, 0xc4241c, s.yaw);
        glow.box(x - sn * 2.6, y + 0.78, z + c * 2.6 - 0.3, 0.32, 0.05, 0.24, 0xfff2b0, s.yaw + 0.3);   // the journal (glows faintly so you find it)
        camps.set(s.id, { spec: s, pos: new THREE.Vector3(x - sn * 2.6, y + 0.9, z + c * 2.6 - 0.3) });
        col(x, y + 1, z, 3, 2, 3, s.yaw + Math.PI / 4, { kind: 'prop' });
        break;
      }
      case 'sign': {
        const { x, z, y } = s, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
        solid.cyl(x, y + 1.1, z, 0.06, 0.06, 2.2, GREY, 5);
        solid.box(x - fx * 0.05, y + 1.9, z - fz * 0.05, 1.5, 1.0, 0.08, DARK, s.yaw);
        face(quads, x + fx * 0.05, y + 1.9, z + fz * 0.05, fx, fz, 1.44, 0.96, CELL.sign + s.sign);
        signs.set(s.id, { spec: s, pos: new THREE.Vector3(x, y + 1.9, z) });
        break;
      }
      case 'landmark': landmarks.push(buildLandmark(s, { h, solid, glow, col, accent, seed, R: new RNG(s.seed) })); break;
      default:
    }
    if (s.kind === 'scar' && s.tape) {   // quarantine tape square around the scar
      const half = s.rad + 1.1, cs = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([a, b]) => ({ x: s.x + a, z: s.z + b }));
      for (const p of cs) { p.y = h(p.x, p.z); solid.cyl(p.x, p.y + 0.6, p.z, 0.05, 0.06, 1.3, PALE, 5); }
      for (let k = 0; k < 4; k++) {
        const a = cs[k], b = cs[(k + 1) % 4];
        for (const yy of [0.95, 1.2]) quads.quad([a.x, a.y + yy - 0.11, a.z], [b.x, b.y + yy - 0.11, b.z], [b.x, b.y + yy + 0.11, b.z], [a.x, a.y + yy + 0.11, a.z], CELL.tape);
      }
    }
  }

  // ---- merged meshes
  const mk = (geo, mat, name) => { if (!geo) return null; geos.push(geo); const m = new THREE.Mesh(geo, mat); m.name = name; m.matrixAutoUpdate = false; m.frustumCulled = false; group.add(m); return m; };
  const solidMat = own(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), mats);
  const glowMat = own(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), mats);
  const atlasMat = own(new THREE.MeshBasicMaterial({ map: atlas, side: THREE.DoubleSide, alphaTest: 0.35 }), mats);
  const holoMat = own(new THREE.MeshBasicMaterial({ map: atlas, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }), mats);
  mk(solid.build(), solidMat, 'ma-solid');
  mk(glow.build(), glowMat, 'ma-glow');
  const quadGeo = quads.build();
  mk(quadGeo, atlasMat, 'ma-atlas');
  const holoGeo = holo.build();
  mk(holoGeo, holoMat, 'ma-holo');

  // ---- glitch scars: one instanced mesh of flat voxel cells + the odd pillar
  let scarMesh = null, scarCols = null;
  {
    const cells = [];
    for (const s of scars) for (const c of s.cells) { const x = s.x + c.dx, z = s.z + c.dz; cells.push({ x, z, y: h(x, z), s: c.s, h: c.h, c: c.c }); }
    if (cells.length) {
      const PAL = [0xff2bd6, 0x2af4ff, 0x120a1e, 0xf4f4ff];
      scarMesh = new THREE.InstancedMesh(BOX, own(new THREE.MeshBasicMaterial({ color: 0xffffff }), mats), cells.length);
      cells.forEach((c, i) => {
        _m.compose(_v.set(c.x, c.y + c.h / 2 + 0.03, c.z), _q.identity(), _s.set(c.s, c.h, c.s));
        scarMesh.setMatrixAt(i, _m); scarMesh.setColorAt(i, _c.setHex(PAL[c.c]));
      });
      scarMesh.frustumCulled = false; scarMesh.name = 'ma-scars';
      group.add(scarMesh);
      scarCols = { PAL, n: cells.length };
    }
  }

  // ---- drones: shared geometry, one mesh pair each
  const dBag = new Bag(), dGlow = new Bag();
  dBag.box(0, 0, 0, 0.9, 0.28, 0.9, 0x2a2c36).box(0, 0.18, 0, 0.5, 0.16, 0.5, 0x3c3e4a);
  for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + Math.PI / 4; dBag.box(Math.cos(a) * 0.62, 0.05, Math.sin(a) * 0.62, 0.7, 0.06, 0.08, 0x1a1a22, -a); }
  dGlow.geo(new THREE.SphereGeometry(0.16, 6, 4), 0, -0.04, 0.5, 1, 1, 1, 0xff2a2a);
  for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + Math.PI / 4; dGlow.cyl(Math.cos(a) * 0.9, 0.12, Math.sin(a) * 0.9, 0.36, 0.36, 0.03, 0x2af4ff, 8); }
  const dGeo = dBag.build(), dGlowGeo = dGlow.build();
  geos.push(dGeo, dGlowGeo);
  const dGlowMat = own(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }), mats);
  for (const s of specs) {
    if (s.kind !== 'drone') continue;
    const g = new THREE.Group();
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = s.yaw;
    const body = new THREE.Mesh(dGeo, solidMat), lens = new THREE.Mesh(dGlowGeo, dGlowMat);
    g.add(body, lens);
    group.add(g);
    drones.set(s.id, { spec: s, g, lens, dead: false, fall: 0, vy: 0, spin: R.float(-1, 1), phase: R.float(0, TAU), hp: 3, hit: 0, pos: new THREE.Vector3(s.x, s.y, s.z) });
  }

  // ---- landmark extras are already in the bags; horizon is built by the module (needs the fog colour)
  const state = { t: 0, holoT: 0, scarT: 0 };
  const _look = new THREE.Vector3();

  function nearest(pos, players, maxD) {
    let best = null, bd = maxD * maxD;
    for (const p of players) { const dx = p.x - pos.x, dz = p.z - pos.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function update(dt, t, cam, players) {
    state.t = t;
    // pylon eyes track the nearest player (yaw + a little pitch by squashing); a sabotaged pylon is shut and grey
    for (const p of pylons.values()) {
      if (p.off) continue;
      const tgt = nearest(p.eye.position, players, 110);
      if (tgt) { const want = Math.atan2(tgt.x - p.eye.position.x, tgt.z - p.eye.position.z); let d = want - p.look; d = Math.atan2(Math.sin(d), Math.cos(d)); p.look += d * Math.min(1, dt * 2.2); }
      else p.look += dt * 0.15;
      p.eye.rotation.y = p.look;
      p.eye.scale.setScalar(1 + 0.04 * Math.sin(t * 3 + p.spec.h));
    }
    // holo panels: glitchy variant swaps
    state.holoT -= dt;
    if (holoGeo && state.holoT <= 0) {
      state.holoT = 0.16;
      for (const p of panels) { if (Math.random() < 0.28) { p.v = (Math.random() < 0.3) ? Math.floor(Math.random() * CELL.holoCount) : p.spec.v; setQuadUV(holoGeo, p.at, CELL.holo + p.v); } }
    }
    // scars: random cells flip colour
    state.scarT -= dt;
    if (scarMesh && state.scarT <= 0) {
      state.scarT = 0.2;
      for (let k = 0; k < 4; k++) scarMesh.setColorAt((Math.random() * scarCols.n) | 0, _c.setHex(scarCols.PAL[(Math.random() * 4) | 0]));
      scarMesh.instanceColor.needsUpdate = true;
    }
    // drones hover, spin slowly, look at the nearest player; knocked ones fall
    for (const d of drones.values()) {
      const s = d.spec;
      if (d.dead) {
        if (d.fall < 2) { d.vy -= 16 * dt; d.g.position.y = Math.max(s.gy + 0.25, d.g.position.y + d.vy * dt); d.g.rotation.z += dt * 2.6; d.g.rotation.x += dt * 1.4; if (d.g.position.y <= s.gy + 0.26) d.fall = 2; }
        continue;
      }
      d.g.position.y = s.y + Math.sin(t * 1.4 + d.phase) * 0.35;
      d.g.position.x = s.x + Math.sin(t * 0.5 + d.phase) * 0.6;
      d.hit = Math.max(0, d.hit - dt);
      const tgt = nearest(d.g.position, players, 60);
      if (tgt) { const want = Math.atan2(tgt.x - d.g.position.x, tgt.z - d.g.position.z); let df = want - d.g.rotation.y; df = Math.atan2(Math.sin(df), Math.cos(df)); d.g.rotation.y += df * Math.min(1, dt * 1.6); }
      else d.g.rotation.y += dt * 0.3 * d.spin;
      d.g.rotation.z = Math.sin(t * 2 + d.phase) * 0.06 + d.hit * 0.5;
      d.pos.copy(d.g.position);
    }
    for (const l of landmarks) l?.update?.(dt, t);
    void cam; void _look;
  }

  return {
    group, colliders, pylons, drones, boards, camps, signs, panels, landmarks,
    solidMat, glowMat,
    setPylonOff(id, off = true) { const p = pylons.get(id); if (!p) return; p.off = off; p.eye.material = off ? eyeShut : eyeOpen; if (off) p.eye.rotation.y = p.look; },
    setBoardSilenced(id) { const b = boards.get(id); if (!b || !quadGeo) return; b.silenced = true; setQuadUV(quadGeo, b.at, CELL.broken); },
    knockDrone(id) { const d = drones.get(id); if (!d) return; d.dead = true; d.vy = 0; d.fall = 0; d.lens.visible = false; },
    hitDroneFx(id) { const d = drones.get(id); if (d) d.hit = 0.4; },
    redraw, update,
    stats() { return { solid: solid ? 1 : 0, scars: scarCols?.n || 0 }; },
    dispose() {
      offLang?.();
      group.removeFromParent();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t?.dispose?.();
      for (const l of landmarks) l?.dispose?.();
      scarMesh?.dispose?.();
    },
  };
}
