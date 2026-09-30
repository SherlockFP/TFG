// ATMOS12 art (wave 12): every visual of the interior atmosphere pass. Two merged meshes per facility + one shared Points pool = 3 draw calls, NO scene lights:
//   decals  (Lambert, alpha)     puddles / stains / cable runs / paper / leaves / scorch / moss / frost / confetti / rubble / glass / grates + ceiling vent grilles
//   light   (Basic, additive)    lamp shafts (3 crossed soft sheets + a floor pool per lamp), puddle + glass glints, window beams, vent exhale; vertex colours are
//                                 rewritten per frame ONLY for groups whose factor changed (flickering lamps, breathing vents, power cuts)
//   points  (additive)           dust motes in lamp cones, drips, ripples, sparks, vent puffs (atmos12.js drives it)
import * as THREE from 'three';
import { makeCanvasTexture } from '../render/textures.js';
import { KIND, KINDS, lampFactor, breath } from './atmos12_core.js';

const TAU = Math.PI * 2, T = 64, GRID = 4;

// ------------------------------------------------------------------ textures
const rnd = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
function blob(g, cx, cy, r, R, jit = 0.28, n = 11) {
  g.beginPath();
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU, rr = r * (1 - jit + R() * jit * 2); const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.closePath(); g.fill();
}
const DRAW = {
  puddle(g, R) { g.fillStyle = 'rgba(6,12,22,0.86)'; blob(g, 32, 32, 27, R, 0.3); g.fillStyle = 'rgba(28,44,66,0.55)'; blob(g, 30, 34, 17, R, 0.25); g.strokeStyle = 'rgba(120,150,180,0.4)'; g.lineWidth = 1.5; g.beginPath(); g.arc(32, 32, 26, 0.4, 2.6); g.stroke(); },
  stain(g, R) { g.fillStyle = 'rgba(48,30,14,0.62)'; blob(g, 32, 30, 24, R, 0.35); g.fillStyle = 'rgba(28,16,8,0.6)'; blob(g, 30, 32, 13, R, 0.3); for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(40,24,10,0.55)'; blob(g, 8 + R() * 48, 8 + R() * 48, 2 + R() * 4, R, 0.3, 7); } },
  cable(g) { g.lineCap = 'round'; g.strokeStyle = '#08080a'; g.lineWidth = 26; g.beginPath(); g.moveTo(0, 22); g.quadraticCurveTo(22, 12, 34, 24); g.quadraticCurveTo(48, 34, 64, 20); g.stroke(); g.strokeStyle = '#5a1418'; g.lineWidth = 15; g.beginPath(); g.moveTo(0, 46); g.quadraticCurveTo(18, 54, 34, 44); g.quadraticCurveTo(50, 36, 64, 50); g.stroke(); g.fillStyle = '#3a3a40'; g.fillRect(0, 12, 5, 20); g.fillRect(59, 38, 5, 20); },
  paper(g, R) { const cs = ['#d9d3b6', '#cfc9ab', '#e2dcc3', '#c4bf9f']; for (let i = 0; i < 6; i++) { g.save(); g.translate(10 + R() * 44, 10 + R() * 44); g.rotate(R() * TAU); g.fillStyle = cs[i & 3]; g.fillRect(-7, -9, 14, 18); g.fillStyle = 'rgba(40,40,50,0.55)'; for (let l = 0; l < 4; l++) g.fillRect(-5, -6 + l * 4, 10 - (l & 1) * 3, 1); g.restore(); } },
  leaf(g, R) { const cs = ['#6a3a14', '#8a5a1c', '#3e3a14', '#a2701c', '#55300f']; for (let i = 0; i < 16; i++) { g.save(); g.translate(4 + R() * 56, 4 + R() * 56); g.rotate(R() * TAU); g.fillStyle = cs[i % 5]; g.beginPath(); g.ellipse(0, 0, 5 + R() * 2, 2.6, 0, 0, TAU); g.fill(); g.restore(); } },
  scorch(g, R) { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,0.92)'); gr.addColorStop(0.55, 'rgba(6,4,2,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, T, T); for (let i = 0; i < 9; i++) { g.fillStyle = i & 1 ? '#ff9a30' : '#ffd070'; g.fillRect(14 + R() * 36, 14 + R() * 36, 2, 2); } },
  moss(g, R) { g.fillStyle = 'rgba(34,64,26,0.78)'; blob(g, 32, 32, 26, R, 0.38, 13); g.fillStyle = 'rgba(70,120,44,0.75)'; for (let i = 0; i < 10; i++) blob(g, 12 + R() * 40, 12 + R() * 40, 3 + R() * 4, R, 0.3, 7); },
  frost(g, R) { g.fillStyle = 'rgba(190,224,255,0.5)'; blob(g, 32, 32, 27, R, 0.3, 12); g.strokeStyle = 'rgba(245,252,255,0.85)'; g.lineWidth = 1.5; for (let i = 0; i < 9; i++) { const a = R() * TAU, l = 8 + R() * 20; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * l, 32 + Math.sin(a) * l); g.stroke(); } },
  confetti(g, R) { const cs = ['#ff3aa8', '#33e6ff', '#ffd23a', '#7dff5a', '#b06aff', '#ff7a2a']; for (let i = 0; i < 34; i++) { g.save(); g.translate(R() * T, R() * T); g.rotate(R() * TAU); g.fillStyle = cs[i % 6]; g.fillRect(-2, -1, 4 + R() * 3, 2.5); g.restore(); } },
  rubble(g, R) { g.fillStyle = 'rgba(60,54,46,0.55)'; blob(g, 32, 32, 26, R, 0.35); const cs = ['#5a5248', '#3e3832', '#726858', '#2c2824']; for (let i = 0; i < 12; i++) { g.fillStyle = cs[i & 3]; g.beginPath(); const x = 8 + R() * 48, y = 8 + R() * 48, s = 2 + R() * 5; g.moveTo(x - s, y + s); g.lineTo(x, y - s); g.lineTo(x + s, y + s * 0.6); g.closePath(); g.fill(); } },
  glass(g, R) { g.fillStyle = 'rgba(160,190,210,0.16)'; blob(g, 32, 32, 24, R, 0.3); for (let i = 0; i < 16; i++) { const x = 8 + R() * 48, y = 8 + R() * 48, s = 2 + R() * 5; g.fillStyle = i & 1 ? 'rgba(225,240,255,0.8)' : 'rgba(150,185,215,0.6)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * (R() + 0.4), y + s * 0.4); g.lineTo(x + s * 0.3, y + s * (R() + 0.5)); g.closePath(); g.fill(); } },
  grate(g) { g.fillStyle = '#0a0a0c'; g.fillRect(6, 6, 52, 52); g.fillStyle = '#4a4e52'; g.fillRect(6, 6, 52, 3); g.fillRect(6, 55, 52, 3); g.fillRect(6, 6, 3, 52); g.fillRect(55, 6, 3, 52); for (let i = 0; i < 6; i++) g.fillRect(12 + i * 8, 10, 3, 44); },
  vent(g) { g.fillStyle = '#16181c'; g.fillRect(4, 4, 56, 56); g.fillStyle = '#5c6268'; g.fillRect(4, 4, 56, 4); g.fillRect(4, 56, 56, 4); g.fillRect(4, 4, 4, 56); g.fillRect(56, 4, 4, 56); for (let i = 0; i < 7; i++) { g.fillStyle = '#070809'; g.fillRect(10, 11 + i * 6.4, 44, 3); g.fillStyle = '#3c4146'; g.fillRect(10, 14 + i * 6.4, 44, 1); } },
};
let _tex = null, _glow = null;
export function atlasTexture() {
  if (_tex !== null) return _tex;
  _tex = makeCanvasTexture(T * GRID, T * GRID, (g) => {
    KINDS.forEach((k, i) => { g.save(); g.translate((i % GRID) * T, ((i / GRID) | 0) * T); g.beginPath(); g.rect(0, 0, T, T); g.clip(); DRAW[k](g, rnd(0x1000 + i * 97)); g.restore(); });
  }) || false;
  return _tex;
}
export function glowTexture() {
  if (_glow !== null) return _glow;
  _glow = makeCanvasTexture(T, T, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.7)'); gr.addColorStop(0.65, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, T, T);
  }) || false;
  return _glow;
}

// ------------------------------------------------------------------ geometry bag
class Bag {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.nor = []; this.idx = []; }
  get n() { return this.pos.length / 3; }
  /** four corners a b c d (each [x,y,z]) in front-face order, normal, uv rect, one colour per corner ([r,g,b]) */
  quad(a, b, c, d, nor, u0, v0, u1, v1, ca, cb = ca, cc = ca, cd = ca) {
    const i = this.n;
    this.pos.push(...a, ...b, ...c, ...d);
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.col.push(...ca, ...cb, ...cc, ...cd);
    for (let k = 0; k < 4; k++) this.nor.push(nor[0], nor[1], nor[2]);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    const c = new THREE.Float32BufferAttribute(this.col, 3); c.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('color', c);
    g.setIndex(this.idx);
    return g;
  }
}
const tileUV = (k) => { const i = KIND[k], u0 = (i % GRID) / GRID, u1 = u0 + 1 / GRID, vt = 1 - ((i / GRID) | 0) / GRID; return [u0, vt - 1 / GRID, u1, vt]; };
const MID = 0.5;   // glow row v = .5: a horizontal soft-edge profile for sheets

/** flat rotated rectangle; up = facing +Y (floor decal) or -Y (ceiling grille) */
function flat(bag, k, x, y, z, rot, w, d, up, rgb) {
  const c = Math.cos(rot), s = Math.sin(rot), hw = w / 2, hd = d / 2;
  const P = (lx, lz) => [x + lx * c - lz * s, y, z + lx * s + lz * c];
  const p0 = P(-hw, -hd), p1 = P(hw, -hd), p2 = P(hw, hd), p3 = P(-hw, hd);
  const [u0, v0, u1, v1] = tileUV(k);
  if (up) bag.quad(p3, p2, p1, p0, [0, 1, 0], u0, v0, u1, v1, rgb);
  else bag.quad(p0, p1, p2, p3, [0, -1, 0], u0, v0, u1, v1, rgb);
}

/** vertical fading sheet: top half-width r0 at yTop, bottom half-width r1 at yBot, centre (x,z), angle a */
function sheet(bag, x, z, yTop, yBot, r0, r1, a, top, bot) {
  const c = Math.cos(a), s = Math.sin(a);
  bag.quad([x - c * r0, yTop, z - s * r0], [x + c * r0, yTop, z + s * r0], [x + c * r1, yBot, z + s * r1], [x - c * r1, yBot, z - s * r1], [0, 1, 0], 0, MID, 1, MID, top, top, bot, bot);
}
function pool(bag, x, y, z, r, rgb, sx = 1, sz = 1, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, lz) => [x + lx * c - lz * s, y, z + lx * s + lz * c];
  bag.quad(P(-r * sx, -r * sz), P(-r * sx, r * sz), P(r * sx, r * sz), P(r * sx, -r * sz), [0, 1, 0], 0, 0, 1, 1, rgb);
}
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const _col = new THREE.Color();
const rgbOf = (hex, white = 0.22) => { _col.set(hex ?? 0xffe6c0); return [_col.r + (1 - _col.r) * white, _col.g + (1 - _col.g) * white, _col.b + (1 - _col.b) * white]; };

// ------------------------------------------------------------------ materials (one per mesh; warmObjects() builds the same flavours so the landing warm set compiles them)
const decalMaterial = () => new THREE.MeshLambertMaterial({ map: atlasTexture() || null, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const lightMaterial = () => new THREE.MeshBasicMaterial({ map: glowTexture() || null, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const pointsMaterial = () => new THREE.PointsMaterial({ size: 0.045, map: glowTexture() || null, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
/** tiny hidden-copy objects with the exact material flavours of the three meshes (game.mods 'warm' event -> reg(obj)) */
export function warmObjects() {
  const b = new Bag(); b.quad([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, 1, 0], 0, 0, 1, 1, [0.5, 0.5, 0.5]);
  const mk = (mat) => { const m = new THREE.Mesh(b.geometry(), mat); m.frustumCulled = false; return m; };
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)); g.setAttribute('color', new THREE.Float32BufferAttribute([0.5, 0.5, 0.5], 3));
  const pts = new THREE.Points(g, pointsMaterial()); pts.frustumCulled = false;
  return [mk(decalMaterial()), mk(lightMaterial()), pts];
}

// ------------------------------------------------------------------ builder
/**
 * plan = planAtmos(...); env = { emitters, floorAt(x, yFrom, z) -> y|null, hasFloor(x, z, y) -> bool }
 * returns { group, decals, light, groups, lampInfo, update(t, lightsTime, power), dispose, stats }
 */
export function buildAtmos(plan, env) {
  const prof = plan.profile, sh = prof.shaft, Y = env.Y;
  const group = new THREE.Group(); group.name = 'atmos12';
  const dBag = new Bag(), lBag = new Bag(), groups = [];
  const em = env.emitters;
  const open = (kind, e, extra) => { const g = { v0: lBag.n, nv: 0, kind, e: e || null, f: -1, ...extra }; groups.push(g); return g; };
  const close = (g) => { g.nv = lBag.n - g.v0; };

  // ---- ground decals (floor-validated) + vent grilles
  let nd = 0, dropped = 0;
  const puddles = [], glassy = [];
  plan.decals.forEach((d, i) => {
    const fy = env.floorAt(d.x, Y + 1.2, d.z);
    if (fy == null || Math.abs(fy - Y) > 0.15) { dropped++; return; }
    const y = fy + 0.018 + (i % 7) * 0.0016;
    flat(dBag, d.k, d.x, y, d.z, d.rot, d.w, d.d, true, [d.tone, d.tone, d.tone]);
    nd++;
    if (d.k === 'puddle') puddles.push({ ...d, y }); else if (d.k === 'glass') glassy.push({ ...d, y });
  });
  for (const v of plan.vents) { flat(dBag, 'vent', v.x, v.y, v.z, 0, 0.95, 0.95, false, [0.9, 0.9, 0.9]); nd++; }

  // ---- lamp shafts + floor pools (linked to the lamp's flicker)
  const lampInfo = [];   // per plan.lamps[i]: { fh (floor distance), r1 } for the dust anchors
  plan.lamps.forEach((l, i) => {
    const e = em[l.k];
    const fy = env.floorAt(l.x, l.y - 0.1, l.z);
    const H = fy == null ? 0 : l.y - fy;
    if (!e || H < 1.6) { lampInfo[i] = null; return; }
    const Hc = Math.min(H, 6.5), yTop = l.y - 0.06, yBot = yTop - Hc;
    const r1 = Math.max(0.6, Math.min(Hc * 0.4 * sh.r, 2.3));
    const base = rgbOf(e.color), inten = Math.max(0.7, Math.min(1.3, e.intensity ?? 1));
    const top = mul(base, 0.5 * sh.k * inten), bot = mul(base, 0.05 * sh.k);
    const g = open(1, e);
    const a0 = ((i * 2.399) % TAU);
    for (let s = 0; s < 3; s++) sheet(lBag, l.x, l.z, yTop, yBot, 0.14, r1, a0 + s * Math.PI / 3, top, bot);
    pool(lBag, l.x, fy + 0.03, l.z, r1 * 1.15, mul(base, 0.3 * sh.k * inten));
    close(g);
    lampInfo[i] = { fh: Hc, r1, floorY: fy };
  });

  // ---- puddle + glass glints: a wet streak toward the nearest lamp (glitter for shards), linked to that lamp so it flickers with it
  const nearestLamp = (x, z) => {
    let best = -1, bd = 10 * 10;
    for (let i = 0; i < plan.lamps.length; i++) {
      if (!lampInfo[i]) continue;
      const l = plan.lamps[i], d2 = (l.x - x) ** 2 + (l.z - z) ** 2;
      if (d2 < bd) { bd = d2; best = i; }
    }
    return best;
  };
  let nGlint = 0;
  for (const p of puddles.concat(glassy)) {
    if (nGlint >= 70) break;
    const li = nearestLamp(p.x, p.z);
    if (li < 0) continue;
    const l = plan.lamps[li], e = em[l.k];
    let dx = l.x - p.x, dz = l.z - p.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const g = open(1, e), isP = p.k === 'puddle', base = rgbOf(e.color, 0.35);
    const len = isP ? Math.min(0.55 * p.w, 0.8) : 0.16, wid = 0.16;
    pool(lBag, p.x + dx * 0.15 * p.w, p.y + 0.012, p.z + dz * 0.15 * p.w, 1, mul(base, isP ? 0.85 : 0.7), len, wid, Math.atan2(dz, dx));
    close(g); nGlint++;
  }

  // ---- window beams (fac.m2 windows): a cold slab from the pane down to a floor patch
  const INW = [[-1, 0], [0, -1], [1, 0], [0, 1]];
  for (const w of plan.windows) {
    const iw = INW[w.d]; if (!iw) continue;
    const fy = env.floorAt(w.x + iw[0] * 1.5, Y + 1.5, w.z + iw[1] * 1.5); if (fy == null) continue;
    const col = [0.55, 0.74, 0.95], g = open(0, null);
    const alongX = w.d % 2 === 1, hw = 0.75, len = 2.6;
    const ax = alongX ? 1 : 0, az = alongX ? 0 : 1;
    const A = [w.x - ax * hw, w.y, w.z - az * hw], B = [w.x + ax * hw, w.y, w.z + az * hw];
    const C2 = [B[0] + iw[0] * len, fy + 0.03, B[2] + iw[1] * len], D = [A[0] + iw[0] * len, fy + 0.03, A[2] + iw[1] * len];
    lBag.quad(A, B, C2, D, [0, 1, 0], 0, MID, 1, MID, mul(col, 0.42 * sh.k), mul(col, 0.42 * sh.k), mul(col, 0.06), mul(col, 0.06));
    lBag.quad([D[0], fy + 0.02, D[2]], [C2[0], fy + 0.02, C2[2]], [C2[0] + iw[0] * 0.9, fy + 0.02, C2[2] + iw[1] * 0.9], [D[0] + iw[0] * 0.9, fy + 0.02, D[2] + iw[1] * 0.9], [0, 1, 0], 0, 0, 1, 1, mul(col, 0.2), mul(col, 0.2), mul(col, 0.05), mul(col, 0.05));
    close(g);
  }

  // ---- vent exhale: a short pale plume under each grille that breathes
  plan.vents.forEach((v, i) => {
    const g = open(2, null, { per: v.per, ph: v.ph });
    const col = [0.62, 0.74, 0.86], a0 = i * 1.3;
    for (let s = 0; s < 2; s++) sheet(lBag, v.x, v.z, v.y - 0.05, v.y - 1.25, 0.3, 0.75, a0 + s * Math.PI / 2, mul(col, 0.75), mul(col, 0.04));
    close(g);
  });

  // ---- assemble
  let decals = null, light = null;
  if (dBag.n) {
    const m = decalMaterial();
    decals = new THREE.Mesh(dBag.geometry(), m); decals.frustumCulled = false; decals.renderOrder = 1; decals.matrixAutoUpdate = false; group.add(decals);
  }
  let baseCol = null;
  if (lBag.n) {
    const m = lightMaterial();
    light = new THREE.Mesh(lBag.geometry(), m); light.frustumCulled = false; light.renderOrder = 2; light.matrixAutoUpdate = false; group.add(light);
    baseCol = new Float32Array(lBag.col);
  }
  const colAttr = light?.geometry.attributes.color;

  /** per frame: rewrite the vertex colours of groups whose factor changed. t = light pool time, gd = facility power 0..1, clock = wall clock for breathing */
  function update(t, gd, clock) {
    if (!colAttr) return 0;
    const arr = colAttr.array; let wrote = 0;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      let f = 1;
      if (g.kind === 1) f = lampFactor(g.e, t) * gd;
      else if (g.kind === 2) f = (0.12 + 0.88 * breath(clock, g.per, g.ph)) * gd;
      if (Math.abs(f - g.f) < 0.025 && !(f === 0 && g.f !== 0)) continue;
      g.f = f; wrote++;
      const a = g.v0 * 3, b = (g.v0 + g.nv) * 3;
      for (let j = a; j < b; j++) arr[j] = baseCol[j] * f;
    }
    if (wrote) colAttr.needsUpdate = true;
    return wrote;
  }
  function dispose() {
    group.removeFromParent();
    for (const m of [decals, light]) { if (!m) continue; m.geometry.dispose(); m.material.dispose(); }
  }
  return { group, decals, light, groups, lampInfo, update, dispose, stats: { decals: nd, dropped, glints: nGlint, shafts: lampInfo.filter(Boolean).length, windows: plan.windows.length, vents: plan.vents.length, tris: (dBag.idx.length + lBag.idx.length) / 3 } };
}

// ------------------------------------------------------------------ points pool (dust / drips / sparks / puffs)
export function makePoints(n) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const pa = new THREE.BufferAttribute(pos, 3), ca = new THREE.BufferAttribute(col, 3);
  pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pa); geo.setAttribute('color', ca);
  const mat = pointsMaterial();
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 3;
  return { pts, pos, col, pa, ca, geo, mat, dispose() { pts.removeFromParent(); geo.dispose(); mat.dispose(); } };
}
