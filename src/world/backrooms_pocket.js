// BACKROOMS POCKET - geometry / colliders / NavGrid / pooled lamps for a generatePocket() plan (backrooms_plan.js).
//
// Look (canonical Level 0): mono-yellow chevron wallpaper with a dark baseboard, mustard damp carpet with darker stains,
// off-white stained drop-ceiling tiles, a STRICT grid of bright fluorescent troffer panels, flat uniform light that
// fades into a yellow haze, a few dead-panel dark zones, pillars in the open halls, outlets, vents, marker graffiti,
// and one green EXIT far from where you land.
//
// Lighting: the level is "baked" - every vertex carries a light value computed from the troffer grid (with wall
// occlusion between cells), injected into Lambert materials as emissive (albedo x bake x uBrLight). The flashlight and
// the pooled point lights (LightPool emitters on the panels, constant light count) still add on top, so dark zones
// really are dark and a torch still works there. Everything merges into ~8 draw calls.
import * as THREE from 'three';
import { NavGrid } from './nav.js';
import { G } from '../physics/physics.js';
import { extTexturePath } from '../audio/extassets.js';
import { levelTexture } from './geobuilder.js';
import { extInstance, hasExt } from './extmodels.js';
import { POCKET, EDGE, GRAFFITI_TEXT, generatePocket } from './backrooms_plan.js';

export { POCKET, generatePocket };
const { OPEN, WALL, DOOR, STUB } = EDGE;
const T = POCKET.wall, HT = T / 2;
const S_WALL = 1.75, S_FLOOR = 1.2, S_CEIL = 2.4;   // metres per texture repeat

// ------------------------------------------------------------------ shared uniforms / materials (cached, never disposed)
export const POCKET_UNIFORMS = {
  light: { value: new THREE.Vector3(1.0, 0.95, 0.8) },   // baked light colour x level (blackouts animate this)
  time: { value: 0 },
  lightK: { value: 1 },                                    // troffer panel brightness multiplier
};
const BASE_LIGHT = new THREE.Vector3(1.0, 0.95, 0.8);

const texLoader = new THREE.TextureLoader();
const texCache = new Map();
function pocketTex(extId, fallbackKey) {
  const path = extTexturePath(extId);
  if (path && window.__kefalExtTextures !== false) {
    if (texCache.has(path)) return texCache.get(path);
    const t = texLoader.load(path);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapNearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(path, t);
    return t;
  }
  try { return fallbackKey ? levelTexture(fallbackKey) : null; } catch { return null; }
}

function bakedMaterial(name, { map = null, tint = [1, 1, 1], desat = 0, alphaTest = 0, polygonOffset = false } = {}) {
  const m = new THREE.MeshLambertMaterial({ map, color: 0xffffff, vertexColors: true, alphaTest });
  m.name = 'brpocket:' + name;
  m.userData.noConsolidate = true;
  if (polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4; }
  const tintU = { value: new THREE.Vector3(...tint) }, desatU = { value: desat };
  m.userData.tint = tintU; m.userData.desat = desatU;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBrLight = POCKET_UNIFORMS.light; sh.uniforms.uBrTint = tintU; sh.uniforms.uBrDesat = desatU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float bake;\nvarying float vBake;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBake = bake;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBake;\nuniform vec3 uBrLight;\nuniform vec3 uBrTint;\nuniform float uBrDesat;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n{ float brL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(brL), uBrDesat) * uBrTint; }')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vBake * uBrLight;');
  };
  m.customProgramCacheKey = () => 'brpocket-baked-v1';
  return m;
}

function panelMaterial(map) {
  const m = new THREE.MeshBasicMaterial({ map, color: 0xfff9ec });
  m.name = 'brpocket:panel';
  m.userData.noConsolidate = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBrTime = POCKET_UNIFORMS.time; sh.uniforms.uBrLightK = POCKET_UNIFORMS.lightK;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float flick;\nuniform float uBrTime;\nuniform float uBrLightK;\nvarying float vBrK;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (flick < -0.5) vBrK = 0.11;
        else if (flick > 0.5) { float brS = floor(uBrTime * 11.0 + flick * 13.7); float brR = fract(sin(brS * 12.9898 + flick) * 43758.5453); vBrK = brR < 0.24 ? 0.16 : (0.78 + 0.22 * brR); }
        else vBrK = 1.0;
        vBrK *= uBrLightK;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBrK;')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb *= vBrK;');
  };
  m.customProgramCacheKey = () => 'brpocket-panel-v1';
  return m;
}

let MATS = null;
function materials() {
  if (MATS) return MATS;
  const wallTex = pocketTex('tfg_backrooms_wallpaper', 'wallpaper_yellow');
  const floorTex = pocketTex('tfg_backrooms_carpet', 'carpet_wet');
  const ceilTex = pocketTex('gbr_backrooms_ceiling', 'ceiling_stained');
  const panelTex = pocketTex('gbr_backrooms_light', null);
  MATS = {
    wall: bakedMaterial('wall', { map: wallTex, tint: [1.02, 0.97, 0.8] }),
    floor: bakedMaterial('floor', { map: floorTex, tint: [1.08, 1.0, 0.82] }),
    ceil: bakedMaterial('ceil', { map: ceilTex, tint: [1.22, 1.14, 0.94], desat: 0.82 }),
    base: bakedMaterial('base', { tint: [0.42, 0.33, 0.2] }),
    detail: bakedMaterial('detail'),
    graffiti: bakedMaterial('graffiti', { map: graffitiAtlas(), alphaTest: 0.35, polygonOffset: true }),
    stain: Object.assign(bakedMaterial('stain', { map: stainTexture(), polygonOffset: true }), { transparent: true, depthWrite: false }),
    panel: panelMaterial(panelTex),
    exitSign: new THREE.MeshBasicMaterial({ map: exitSignTexture(), color: 0xffffff }),
    exitBody: new THREE.MeshBasicMaterial({ color: 0x0b4a22 }),
    puddle: new THREE.MeshLambertMaterial({ color: 0x3a3420, transparent: true, opacity: 0.55, emissive: 0x2a2610, depthWrite: false }),
  };
  for (const m of Object.values(MATS)) m.userData.noConsolidate = true;
  return MATS;
}

// ------------------------------------------------------------------ canvas textures
const GRAF_COLS = 2, GRAF_ROWS = 5, GRAF_W = 512, GRAF_H = 104;
function graffitiAtlas() {
  const c = document.createElement('canvas');
  c.width = GRAF_W * GRAF_COLS; c.height = GRAF_H * GRAF_ROWS;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  GRAFFITI_TEXT.forEach((txt, i) => {
    const x = (i % GRAF_COLS) * GRAF_W, y = Math.floor(i / GRAF_COLS) * GRAF_H;
    g.save();
    g.beginPath(); g.rect(x, y, GRAF_W, GRAF_H); g.clip();
    const big = txt.length <= 3;
    let size = big ? 92 : 58;
    g.font = `bold ${size}px "Comic Sans MS", "Marker Felt", "Segoe Print", cursive, sans-serif`;
    while (g.measureText(txt).width > GRAF_W - 30 && size > 20) { size -= 4; g.font = `bold ${size}px "Comic Sans MS", "Marker Felt", "Segoe Print", cursive, sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const col = i === 0 ? '#1c1208' : i % 3 === 0 ? '#5b140c' : '#1f1a14';
    // marker look: a few jittered passes + drips
    for (let k = 0; k < 3; k++) { g.globalAlpha = 0.55; g.fillStyle = col; g.fillText(txt, x + GRAF_W / 2 + (k - 1) * 1.5, y + GRAF_H / 2 + ((k * 7) % 3) - 1); }
    g.globalAlpha = 0.7; g.fillStyle = col;
    for (let k = 0; k < (big ? 3 : 2); k++) { const dx = x + 60 + ((i * 97 + k * 173) % (GRAF_W - 120)); g.fillRect(dx, y + GRAF_H / 2 + 14, 3, 14 + ((i + k * 5) % 4) * 8); }
    g.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function graffitiUV(i) {
  const cx = i % GRAF_COLS, cy = Math.floor(i / GRAF_COLS);
  const u0 = cx / GRAF_COLS, u1 = (cx + 1) / GRAF_COLS;
  const v1 = 1 - cy / GRAF_ROWS, v0 = 1 - (cy + 1) / GRAF_ROWS;
  return [u0, v0, u1, v1];
}
function stainTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(78,58,24,0.5)'); grd.addColorStop(0.55, 'rgba(88,64,28,0.38)'); grd.addColorStop(0.82, 'rgba(96,70,30,0.26)'); grd.addColorStop(1, 'rgba(96,70,30,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  // tide mark ring
  g.strokeStyle = 'rgba(60,42,16,0.32)'; g.lineWidth = 2; g.beginPath(); g.ellipse(32, 32, 27, 24, 0.4, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function exitSignTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#0f9a45'; g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#063f1c'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 88);
  g.fillStyle = '#f4fff4';
  g.font = 'bold 60px Arial, Helvetica, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('EXIT', 92, 51);
  // running figure + arrow (ISO 7010 style, drawn)
  g.strokeStyle = '#f4fff4'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.arc(44, 24, 7, 0, Math.PI * 2); g.fillStyle = '#f4fff4'; g.fill();
  g.beginPath(); g.moveTo(40, 34); g.lineTo(34, 58); g.lineTo(20, 78); g.moveTo(34, 58); g.lineTo(50, 68); g.lineTo(46, 84);
  g.moveTo(38, 40); g.lineTo(58, 48); g.moveTo(38, 40); g.lineTo(22, 48); g.stroke();
  g.beginPath(); g.moveTo(62, 70); g.lineTo(80, 70); g.moveTo(72, 62); g.lineTo(81, 70); g.lineTo(72, 78); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ geometry builder with a per-vertex bake attribute
class BakeBuilder {
  constructor() { this.buckets = new Map(); }
  bucket(k) {
    let b = this.buckets.get(k);
    if (!b) { b = { pos: [], nrm: [], uv: [], col: [], bake: [], idx: [] }; this.buckets.set(k, b); }
    return b;
  }
  /** Subdivided plane: point(i/nu, j/nv) = o + ua*s + va*t, facing cross(ua, va) = n. fns get the world point. */
  plane(k, o, ua, va, n, { nu = 1, nv = 1, uv, col, bake, vSplits = null }) {
    const b = this.bucket(k);
    const base = b.pos.length / 3;
    const ts = vSplits || Array.from({ length: nv + 1 }, (_, j) => j / nv);
    const rows = ts.length;
    const p = [0, 0, 0];
    for (let j = 0; j < rows; j++) {
      const t = ts[j];
      for (let i = 0; i <= nu; i++) {
        const s = i / nu;
        p[0] = o[0] + ua[0] * s + va[0] * t; p[1] = o[1] + ua[1] * s + va[1] * t; p[2] = o[2] + ua[2] * s + va[2] * t;
        b.pos.push(p[0], p[1], p[2]); b.nrm.push(n[0], n[1], n[2]);
        const u = uv(p, s, t); b.uv.push(u[0], u[1]);
        const c = col ? col(p, s, t) : null; if (c) b.col.push(c[0], c[1], c[2]); else b.col.push(1, 1, 1);
        b.bake.push(bake ? bake(p, s, t) : 1);
      }
    }
    const W = nu + 1;
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * W + i, bb = a + 1, c = a + W + 1, d = a + W;
      b.idx.push(a, bb, c, a, c, d);
    }
  }
  build(matFor, attrName = (k) => 'bake') {
    const group = new THREE.Group();
    for (const [k, b] of this.buckets) {
      if (!b.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setAttribute(attrName(k), new THREE.Float32BufferAttribute(b.bake, 1));
      g.setIndex(b.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const m = new THREE.Mesh(g, matFor(k));
      m.matrixAutoUpdate = false; m.updateMatrix();
      m.name = 'brpocket_' + k;
      m.userData.brOwned = true;
      if (k === 'stain') m.renderOrder = 1;
      group.add(m);
    }
    return group;
  }
}

const smooth = (x) => x * x * (3 - 2 * x);

// ------------------------------------------------------------------ build
/**
 * Build a pocket from a plan (or a key). ctx: { physics, lightPool }. Returns the pocket object:
 *   { key, plan, group, colliders, nav, emitters, spawn, landings, exit, loot, bounds, contains(p), lightAt(x, z),
 *     isDark(x, z), cellAt(x, z), update(dt), setLight(k), dispose() }
 */
export function buildPocket(planOrKey, { physics, lightPool } = {}) {
  const tStart = performance.now();
  const P = typeof planOrKey === 'object' ? planOrKey : generatePocket(planOrKey);
  const tPlan = performance.now();
  const { W, H, C, ox, oz, y: Y, ceil: CH, typeOf, vid, hid, edgeSeg, allIds, doorW, stub, dark, idx } = P;
  const M = materials();
  const gb = new BakeBuilder();
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'backrooms_pocket';
  const addBox = (cx, cy, cz, sx, sy, sz) => { if (physics) colliders.push(physics.addStaticBox(cx, cy, cz, sx / 2, sy / 2, sz / 2, 0, G.STATIC, { kind: 'static', brPocket: true })); };

  // ---- light field (troffer grid, wall-occluded between cells) ----
  const trofByCell = Array.from({ length: W * H }, () => []);
  for (const t of P.troffers) trofByCell[t.cell].push(t);
  const cellAt = (x, z) => {
    const cx = Math.floor((x - ox) / C), cz = Math.floor((z - oz) / C);
    if (cx < 0 || cz < 0 || cx >= W || cz >= H) return -1;
    return idx(cx, cz);
  };
  const edgeFactor = (ci, d) => {
    const x = ci % W, z = (ci / W) | 0;
    const t = typeOf(P.edgeKey(x, z, d));
    return t === OPEN ? 1 : t === STUB ? 0.75 : t === DOOR ? 0.45 : 0;
  };
  const reach = (ci, dx, dz) => {
    if (!dx && !dz) return 1;
    const dX = dx > 0 ? 0 : 2, dZ = dz > 0 ? 1 : 3;
    if (!dz) return edgeFactor(ci, dX);
    if (!dx) return edgeFactor(ci, dZ);
    const cx = ci % W, cz = (ci / W) | 0;
    const viaX = edgeFactor(ci, dX) * edgeFactor(idx(cx + dx, cz), dZ);
    const viaZ = edgeFactor(ci, dZ) * edgeFactor(idx(cx, cz + dz), dX);
    return Math.max(viaX, viaZ);
  };
  const R = 3.9;
  // per-cell list of the live troffers that can light it (own cell + neighbours through open edges) with the reach factor
  const lightSrc = Array.from({ length: W * H }, (_, ci) => {
    const cx = ci % W, cz = (ci / W) | 0, out = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const f = reach(ci, dx, dz);
      if (f <= 0) continue;
      for (const t of trofByCell[idx(nx, nz)]) if (t.v > 0) out.push(t.x, t.z, t.v * f);
    }
    return out;
  });
  const R2 = R * R;
  const lightMemo = new Map();
  const lightAt = (x, z, ci = cellAt(x, z)) => {
    if (ci < 0) return 0.06;
    const key = ci * 1048576 + Math.round((x - ox) * 4) * 1024 + Math.round((z - oz) * 4);
    const m = lightMemo.get(key);
    if (m !== undefined) return m;
    const L = lightSrc[ci];
    let sum = 0;
    for (let i = 0; i < L.length; i += 3) {
      const dx = L[i] - x, dz = L[i + 1] - z, d2 = dx * dx + dz * dz;
      if (d2 >= R2) continue;
      const u = 1 - Math.sqrt(d2) / R;
      sum += L[i + 2] * u * Math.sqrt(u);
    }
    const v = Math.min(1, 0.055 + sum * 0.95);
    lightMemo.set(key, v);
    return v;
  };
  const cellFor = (p, n) => cellAt(p[0] + n[0] * 0.3, p[2] + n[2] * 0.3);

  // edge solidity at an along-coordinate (for floor AO)
  const edgeSolidAt = (id, a) => {
    const t = typeOf(id);
    if (t === WALL) return true;
    if (t === OPEN) return false;
    const s = edgeSeg(id);
    const A0 = s.axis === 'x' ? s.x0 : s.z0, A1 = s.axis === 'x' ? s.x1 : s.z1;
    if (t === DOOR) return Math.abs(a - (A0 + A1) / 2) > doorW.get(id) / 2;
    const st = stub.get(id);
    return st.from === 0 ? a <= A0 + st.len : a >= A1 - st.len;
  };
  // vertices (grid corners) that carry a corner post: any edge whose geometry reaches the vertex
  const post = new Uint8Array((W + 1) * (H + 1));
  const reachesEnd = (id, end) => { const t = typeOf(id); return t === WALL || t === DOOR || (t === STUB && stub.get(id).from === end); };
  for (const id of allIds) {
    if (typeOf(id) === OPEN) continue;
    const s = edgeSeg(id);
    const v0 = s.gx + s.gz * (W + 1);
    const v1 = s.axis === 'x' ? v0 + 1 : v0 + (W + 1);
    if (reachesEnd(id, 0)) post[v0] = 1;
    if (reachesEnd(id, 1)) post[v1] = 1;
  }
  const pillarAt = new Set(P.pillars.map((q) => q.i + q.j * (W + 1)));
  const aoAt = (x, z) => {
    const fi = (x - ox) / C, fj = (z - oz) / C;
    const ri = Math.round(fi), rj = Math.round(fj);
    const onV = Math.abs(fi - ri) < 1e-4, onH = Math.abs(fj - rj) < 1e-4;
    if (onV && onH) { const v = ri + rj * (W + 1); return pillarAt.has(v) ? 0.66 : post[v] ? 0.74 : 1; }
    if (onV && rj >= 0) { const zr = Math.min(H - 1, Math.max(0, Math.floor(fj))); return edgeSolidAt(vid(ri, zr), z) ? 0.8 : 1; }
    if (onH) { const xc = Math.min(W - 1, Math.max(0, Math.floor(fi))); return edgeSolidAt(hid(xc, rj), x) ? 0.8 : 1; }
    return 1;
  };
  // stains per cell (own + neighbours), for the floor colour
  const stainCell = Array.from({ length: W * H }, () => []);
  for (const st of P.stains) {
    const c = cellAt(st.x, st.z); if (c < 0) continue;
    const cx = c % W, cz = (c / W) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const nx = cx + dx, nz = cz + dz; if (nx >= 0 && nz >= 0 && nx < W && nz < H) stainCell[idx(nx, nz)].push(st); }
  }
  const stainAt = (x, z, ci) => {
    let k = 0;
    for (const st of stainCell[ci] || []) { const dx = st.x - x, dz = st.z - z; if (Math.abs(dx) > st.r || Math.abs(dz) > st.r) continue; const d = Math.sqrt(dx * dx + dz * dz); if (d < st.r) k = Math.max(k, st.a * smooth(1 - d / st.r)); }
    return k;
  };

  const ceilCell = Array.from({ length: W * H }, () => []);
  for (const st of P.ceilStains) {
    const c = cellAt(st.x, st.z); if (c < 0) continue;
    const cx = c % W, cz = (c / W) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const nx = cx + dx, nz = cz + dz; if (nx >= 0 && nz >= 0 && nx < W && nz < H) ceilCell[idx(nx, nz)].push(st); }
  }
  // ---- floor + ceiling (per cell, 4x4 quads so the bake has resolution) ----
  const nSub = 4;
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const ci = idx(x, z), x0 = ox + x * C, z0 = oz + z * C;
    gb.plane('floor', [x0, Y, z0], [0, 0, C], [C, 0, 0], [0, 1, 0], {
      nu: nSub, nv: nSub,
      uv: (p) => [p[0] / S_FLOOR, p[2] / S_FLOOR],
      col: (p) => { const s = stainAt(p[0], p[2], ci); return [1 - s * 0.3, 1 - s * 0.35, 1 - s * 0.44]; },
      bake: (p) => lightAt(p[0], p[2], ci) * aoAt(p[0], p[2]),
    });
    gb.plane('ceil', [x0, Y + CH, z0], [C, 0, 0], [0, 0, C], [0, -1, 0], {
      nu: nSub, nv: nSub,
      uv: (p) => [p[0] / S_CEIL, p[2] / S_CEIL],
      col: (p) => {
        let k = 0;
        for (const s of ceilCell[ci]) { if (Math.abs(s.x - p[0]) > s.r || Math.abs(s.z - p[2]) > s.r) continue; const d = Math.hypot(s.x - p[0], s.z - p[2]); if (d < s.r) k = Math.max(k, s.a * smooth(1 - d / s.r)); }
        return [1 - k * 0.22, 1 - k * 0.3, 1 - k * 0.48];
      },
      bake: (p) => 0.74 * lightAt(p[0], p[2], ci) * (0.8 + 0.2 * aoAt(p[0], p[2])),
    });
  }

  // ---- walls ----
  const TOP = Y + CH + 0.05;   // walls poke 5 cm into the ceiling: no light cracks at the seam (PSX vertex snap)
  const V_SPLITS = [0, 0.45 / (CH + 0.05), 2.25 / (CH + 0.05), 1];
  const wallBake = (p, n) => {
    const b = lightAt(p[0], p[2], cellFor(p, n));
    const h = p[1] - Y;
    const f = h < 0.05 ? 0.8 : h < 0.5 ? 0.95 : h > CH - 0.05 ? 0.84 : 1;
    return b * f;
  };
  // one vertical face of a box: normal n (horizontal), from along-start point o, extent ua (horizontal), height hgt
  const wallFace = (k, o, ua, hgt, n, y0) => {
    const len = Math.hypot(ua[0], ua[2]);
    const r = [n[2], 0, -n[0]];
    gb.plane(k, [o[0], y0, o[2]], ua, [0, hgt, 0], n, {
      nu: Math.max(1, Math.ceil(len / 1.5)), vSplits: y0 === Y && hgt >= CH - 0.01 ? V_SPLITS : null, nv: 1,
      uv: (p) => [(p[0] * r[0] + p[2] * r[2]) / S_WALL, (p[1] - Y) / S_WALL],
      bake: (p) => wallBake(p, n),
    });
  };
  // baseboard strip along a face
  const baseboard = (o, ua, n) => {
    const d = 0.02, h = 0.1;
    const f = [o[0] + n[0] * d, Y, o[2] + n[2] * d];
    const len = Math.hypot(ua[0], ua[2]);
    gb.plane('base', f, ua, [0, h, 0], n, { nu: Math.max(1, Math.ceil(len / 1.5)), uv: () => [0, 0], bake: (p) => wallBake(p, n) * 0.9 });
    // top lip: the plane must face up, so order (ua, n*d) by the y component of their cross product
    const topO = [o[0], Y + h, o[2]];
    const nd = [n[0] * d, 0, n[2] * d];
    const up = ua[2] * nd[0] - ua[0] * nd[2];
    if (up > 0) gb.plane('base', topO, ua, nd, [0, 1, 0], { nu: 1, uv: () => [0, 0], bake: (p) => wallBake(p, n) });
    else gb.plane('base', topO, nd, ua, [0, 1, 0], { nu: 1, uv: () => [0, 0], bake: (p) => wallBake(p, n) });
  };
  /** Axis-aligned solid box (wall piece / post / pillar): faces on the requested sides, collider, baseboards. */
  const solid = (k, cx, cz, sx, sz, y0, y1, sides, { base = true, underside = false } = {}) => {
    const hx = sx / 2, hz = sz / 2, hgt = y1 - y0;
    if (sides.px) { wallFace(k, [cx + hx, 0, cz + hz], [0, 0, -sz], hgt, [1, 0, 0], y0); if (base && y0 === Y) baseboard([cx + hx, 0, cz + hz], [0, 0, -sz], [1, 0, 0]); }
    if (sides.nx) { wallFace(k, [cx - hx, 0, cz - hz], [0, 0, sz], hgt, [-1, 0, 0], y0); if (base && y0 === Y) baseboard([cx - hx, 0, cz - hz], [0, 0, sz], [-1, 0, 0]); }
    if (sides.pz) { wallFace(k, [cx - hx, 0, cz + hz], [sx, 0, 0], hgt, [0, 0, 1], y0); if (base && y0 === Y) baseboard([cx - hx, 0, cz + hz], [sx, 0, 0], [0, 0, 1]); }
    if (sides.nz) { wallFace(k, [cx + hx, 0, cz - hz], [-sx, 0, 0], hgt, [0, 0, -1], y0); if (base && y0 === Y) baseboard([cx + hx, 0, cz - hz], [-sx, 0, 0], [0, 0, -1]); }
    if (underside) {
      gb.plane(k, [cx - hx, y0, cz - hz], [sx, 0, 0], [0, 0, sz], [0, -1, 0], {
        uv: (p) => [p[0] / S_WALL, p[2] / S_WALL], bake: (p) => lightAt(p[0], p[2]) * 0.8,
      });
    }
    addBox(cx, (y0 + y1) / 2, cz, sx, hgt, sz);
  };
  const outer = (s) => (s.axis === 'z' ? (s.gx === 0 ? 'nx' : s.gx === W ? 'px' : null) : (s.gz === 0 ? 'nz' : s.gz === H ? 'pz' : null));
  for (const id of allIds) {
    const t = typeOf(id);
    if (t === OPEN) continue;
    const s = edgeSeg(id);
    const alongX = s.axis === 'x';
    const A0 = alongX ? s.x0 : s.z0, A1 = alongX ? s.x1 : s.z1, Lc = alongX ? s.z0 : s.x0;
    const hideOuter = outer(s);   // the outside face of the boundary wall is never seen
    const piece = (a0, a1, y0, y1, capLo, capHi, underside = false) => {
      if (a1 - a0 < 0.02) return;
      const cA = (a0 + a1) / 2, len = a1 - a0, hgt = y1 - y0;
      const sides = alongX ? { pz: hideOuter !== 'pz', nz: hideOuter !== 'nz', nx: capLo, px: capHi } : { px: hideOuter !== 'px', nx: hideOuter !== 'nx', nz: capLo, pz: capHi };
      if (alongX) solid('wall', cA, Lc, len, T, y0, y1, sides, { underside, base: y0 === Y });
      else solid('wall', Lc, cA, T, len, y0, y1, sides, { underside, base: y0 === Y });
      void hgt;
    };
    if (t === WALL) piece(A0 + HT, A1 - HT, Y, TOP, false, false);
    else if (t === DOOR) {
      const w = doorW.get(id), mid = (A0 + A1) / 2;
      // side pieces: jamb caps only up to the lintel
      piece(A0 + HT, mid - w / 2, Y, TOP, false, false);
      piece(mid + w / 2, A1 - HT, Y, TOP, false, false);
      // jamb faces (caps from the floor to the lintel)
      // (right vector of normal n is (n.z, 0, -n.x): the face starts at the "left" end so it winds towards n)
      const jamb = (a, dir) => {
        const n = alongX ? [dir, 0, 0] : [0, 0, dir];
        const o = alongX ? [a, 0, Lc + dir * HT] : [Lc - dir * HT, 0, a];
        const ua = alongX ? [0, 0, -dir * T] : [dir * T, 0, 0];
        wallFace('wall', o, ua, POCKET.doorH, n, Y);
      };
      jamb(mid - w / 2, 1); jamb(mid + w / 2, -1);
      piece(mid - w / 2, mid + w / 2, Y + POCKET.doorH, TOP, false, false, true);
    } else if (t === STUB) {
      const st = stub.get(id);
      if (st.from === 0) piece(A0 + HT, A0 + st.len, Y, TOP, false, true);
      else piece(A1 - st.len, A1 - HT, Y, TOP, true, false);
    }
  }
  // corner posts
  for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) {
    const v = i + j * (W + 1);
    if (!post[v]) continue;
    solid('wall', ox + i * C, oz + j * C, T, T, Y, TOP, { px: i < W, nx: i > 0, pz: j < H, nz: j > 0 });
  }
  // pillars (open halls)
  const PS = 0.56;
  for (const q of P.pillars) solid('wall', q.x, q.z, PS, PS, Y, TOP, { px: true, nx: true, pz: true, nz: true });
  // floor + ceiling slabs
  addBox(ox + (W * C) / 2, Y - 0.5, oz + (H * C) / 2, W * C + 2, 1, H * C + 2);
  addBox(ox + (W * C) / 2, Y + CH + 0.5, oz + (H * C) / 2, W * C + 2, 1, H * C + 2);

  // ---- troffer panels (strict grid) ----
  const panelY = Y + CH - 0.012;
  for (const t of P.troffers) {
    gb.plane('panel', [t.x - 0.6, panelY, t.z - 0.3], [1.2, 0, 0], [0, 0, 0.6], [0, -1, 0], { uv: (p, s, tt) => [s, tt], bake: () => t.fl });
  }

  // ---- wall details: outlets, vents, graffiti ----
  const faceFrame = (f, along, yy, out = HT + 0.004) => {
    const n = [f.nx, 0, f.nz], r = [f.nz, 0, -f.nx];
    const A0 = f.axis === 'x' ? f.x0 : f.z0;
    const a = A0 + along;
    const px = f.axis === 'x' ? a : f.x0 + f.nx * out, pz = f.axis === 'x' ? f.z0 + f.nz * out : a;
    return { n, r, p: [px, Y + yy, pz] };
  };
  const detailBox = (fr, w, h, d, col) => {
    const { n, r, p } = fr;
    const o = [p[0] - r[0] * w / 2 + n[0] * d, p[1] - h / 2, p[2] - r[2] * w / 2 + n[2] * d];
    gb.plane('detail', o, [r[0] * w, 0, r[2] * w], [0, h, 0], n, { uv: () => [0, 0], col: () => col, bake: (q) => wallBake(q, n) });
  };
  for (const o of P.outlets) {
    const fr = faceFrame(o.f, o.along, o.y);
    detailBox(fr, 0.085, 0.125, 0.012, [0.93, 0.9, 0.82]);
    const off = (dy) => ({ ...fr, p: [fr.p[0], fr.p[1] + dy, fr.p[2]] });
    detailBox(off(0.028), 0.03, 0.022, 0.016, [0.18, 0.16, 0.12]);
    detailBox(off(-0.028), 0.03, 0.022, 0.016, [0.18, 0.16, 0.12]);
  }
  for (const v of P.vents) {
    const fr = faceFrame(v.f, v.along, v.y);
    detailBox(fr, 0.56, 0.3, 0.012, [0.72, 0.7, 0.62]);
    for (let k = 0; k < 5; k++) detailBox({ ...fr, p: [fr.p[0], fr.p[1] - 0.1 + k * 0.05, fr.p[2]] }, 0.48, 0.022, 0.016, [0.16, 0.15, 0.12]);
  }
  for (const gr of P.graffiti) {
    const fr = faceFrame(gr.f, gr.along, gr.y, HT + 0.006);
    const big = gr.text === 0;
    const w = big ? 1.3 : 1.7, h = big ? 0.9 : 0.34;
    const [u0, v0, u1, v1] = graffitiUV(gr.text);
    const { n, r, p } = fr;
    const o = [p[0] - r[0] * w / 2, p[1] - h / 2, p[2] - r[2] * w / 2];
    // big "=)": stretch the atlas cell vertically (it is a 5:1 slot)
    gb.plane('graffiti', o, [r[0] * w, 0, r[2] * w], [0, h, 0], n, {
      uv: (q, s, t) => [u0 + (u1 - u0) * (big ? 0.34 + s * 0.32 : s), v0 + (v1 - v0) * t],
      bake: (q) => wallBake(q, n),
    });
  }
  // floor stains as decals (in addition to the vertex-colour darkening) + ceiling water marks
  for (const s of P.stains) {
    if (s.r < 1.1) continue;
    const r = s.r * 0.85, ci = cellAt(s.x, s.z);
    gb.plane('stain', [s.x - r, Y + 0.004, s.z - r], [0, 0, 2 * r], [2 * r, 0, 0], [0, 1, 0], { uv: (p, a, b) => [b, a], bake: (p) => lightAt(p[0], p[2], ci) });
  }
  for (const s of P.ceilStains) {
    const r = s.r, ci = cellAt(s.x, s.z);
    gb.plane('stain', [s.x - r, Y + CH - 0.006, s.z - r], [2 * r, 0, 0], [0, 0, 2 * r], [0, -1, 0], { uv: (p, a, b) => [a, b], bake: (p) => 0.8 * lightAt(p[0], p[2], ci) });
  }

  // ---- EXIT door (on a solid wall of the far cell) ----
  const ex = P.exit;
  {
    const n = [ex.nx, 0, ex.nz], r = [ex.nz, 0, -ex.nx];
    const at = (along, yy, out) => [ex.x + r[0] * along + n[0] * out, Y + yy, ex.z + r[2] * along + n[2] * out];
    const box = (along, yy, w, h, out, col) => {
      const p = at(along - w / 2, yy, out);
      gb.plane('detail', p, [r[0] * w, 0, r[2] * w], [0, h, 0], n, { uv: () => [0, 0], col: () => col, bake: (q) => Math.max(0.55, wallBake(q, n)) });
    };
    box(0, 0, 1.24, 2.2, 0.004, [0.2, 0.2, 0.18]);        // frame
    box(0, 0.02, 1.06, 2.1, 0.03, [0.34, 0.4, 0.36]);     // leaf (painted metal, greenish grey)
    box(0.02, 0.95, 0.86, 0.07, 0.07, [0.62, 0.62, 0.58]); // push bar
    box(-0.36, 1.02, 0.1, 0.12, 0.06, [0.2, 0.2, 0.18]);  // latch
    box(0, 2.08, 1.06, 0.02, 0.035, [0.15, 0.15, 0.13]);  // top shadow line
    // sign: lit box above the door
    const sw = 0.66, sh = 0.24, sd = 0.09;
    const c = at(0, 2.2 + 0.16 + sh / 2, sd / 2 + 0.01);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), [M.exitBody, M.exitBody, M.exitBody, M.exitBody, M.exitSign, M.exitBody]);
    sign.position.set(c[0], c[1], c[2]);
    sign.rotation.y = ex.yaw;
    sign.name = 'brpocket_exit_sign';
    sign.userData.brOwned = true;
    group.add(sign);
    ex.signPos = new THREE.Vector3(c[0], c[1], c[2]);
    ex.pos = new THREE.Vector3(...at(0, 0, 0.6));
    ex.interact = new THREE.Vector3(...at(0, 1.2, 0.2));
  }

  // ---- puddles (flat, glossy-dark, not merged: transparent) ----
  for (const pd of P.puddles) {
    const g = new THREE.CircleGeometry(1, 14);
    g.rotateX(-Math.PI / 2);
    g.scale(pd.rx, 1, pd.rz);
    g.translate(pd.x, Y + 0.008, pd.z);
    const m = new THREE.Mesh(g, M.puddle);
    m.renderOrder = 1; m.name = 'brpocket_puddle'; m.userData.brOwned = true;
    group.add(m);
  }

  const tGeo = performance.now();
  const built = gb.build((k) => M[k] || M.detail, (k) => (k === 'panel' ? 'flick' : 'bake'));
  group.add(built);

  // ---- props: a handful of stacking chairs (almost no furniture) ----
  if (hasExt('tfg_stack_chair')) {
    for (const ch of P.chairs) {
      const o = extInstance('tfg_stack_chair');
      if (!o) break;
      o.position.set(ch.x, Y, ch.z);
      o.rotation.y = ch.yaw;
      if (ch.tipped) { o.rotation.z = Math.PI / 2; o.position.y = Y + 0.22; }
      o.traverse((m) => { if (m.isMesh) m.userData.brPocket = true; });
      group.add(o);
    }
  }

  // ---- navigation: the pocket's own NavGrid (creatures in the pocket use it, see game/backrooms.js) ----
  const nav = new NavGrid(P.layout, 1);
  for (const q of P.pillars) nav.blockBox(q.x - PS / 2, q.z - PS / 2, q.x + PS / 2, q.z + PS / 2, 0.3);
  for (const [id, st] of stub) {
    if (typeOf(id) !== STUB) continue;
    const s = edgeSeg(id);
    if (s.axis === 'x') { const a0 = st.from === 0 ? s.x0 : s.x1 - st.len, a1 = st.from === 0 ? s.x0 + st.len : s.x1; nav.blockBox(a0, s.z0 - HT, a1, s.z0 + HT, 0.6); }
    else { const a0 = st.from === 0 ? s.z0 : s.z1 - st.len, a1 = st.from === 0 ? s.z0 + st.len : s.z1; nav.blockBox(s.x0 - HT, a0, s.x0 + HT, a1, 0.6); }
  }

  // ---- pooled lamps: one emitter per live panel (LightPool keeps the scene light COUNT constant) ----
  const emitters = [];
  for (const t of P.troffers) {
    if (t.v <= 0) continue;
    emitters.push({ pos: new THREE.Vector3(t.x, Y + CH - 0.1, t.z), color: 0xfff0c8, intensity: 0.22 * t.v, distance: 6.5, flicker: t.fl > 0 ? 0.55 : 0, group: 'br_pocket', halo: true });
  }
  emitters.push({ pos: new THREE.Vector3(ex.signPos.x, ex.signPos.y, ex.signPos.z).addScaledVector(new THREE.Vector3(ex.nx, 0, ex.nz), 0.3), color: 0x35ff7a, intensity: 0.9, distance: 5.5, group: 'br_pocket', halo: true });
  if (lightPool) for (const e of emitters) lightPool.add(e);

  const bounds = { x0: ox - 1, z0: oz - 1, x1: ox + W * C + 1, z1: oz + H * C + 1, y0: Y - 8, y1: Y + CH + 6 };
  const spawnY = Y + 0.05;
  const pocket = {
    key: P.key, plan: P, group, colliders, nav, emitters, layout: P.layout, y: Y, ceil: CH,
    spawn: new THREE.Vector3(P.spawn.x, spawnY, P.spawn.z),
    landings: P.landings.map((l) => new THREE.Vector3(l.x, spawnY, l.z)),
    exit: ex,
    loot: P.loot,
    bounds,
    lightAt: (x, z) => lightAt(x, z),
    cellAt,
    isDark: (x, z) => { const c = cellAt(x, z); return c >= 0 && !!dark[c]; },
    contains(p) { return !!p && p.x > bounds.x0 && p.x < bounds.x1 && p.z > bounds.z0 && p.z < bounds.z1 && p.y > bounds.y0 && p.y < bounds.y1; },
    /** light level 0..1 over the whole pocket (blackout when the ship leaves) */
    setLight(k) {
      pocket.lightLevel = k;
      POCKET_UNIFORMS.light.value.copy(BASE_LIGHT).multiplyScalar(k);
      POCKET_UNIFORMS.lightK.value = 0.12 + 0.88 * k;
      for (const e of emitters) e.intensity = (e.baseIntensity ??= e.intensity) * k;
    },
    lightLevel: 1,
    update(dt) { POCKET_UNIFORMS.time.value += dt; },
    dispose() {
      if (physics) for (const c of colliders) physics.removeCollider(c);
      colliders.length = 0;
      if (lightPool) for (const e of emitters) lightPool.remove(e);
      group.traverse((o) => { if (o.isMesh && o.userData.brOwned) o.geometry?.dispose(); });   // ext chairs share the GLB cache geometry
      group.removeFromParent();
    },
  };
  pocket.setLight(1);
  const tEnd = performance.now();
  pocket.buildMs = { plan: +(tPlan - tStart).toFixed(1), geometry: +(tGeo - tPlan).toFixed(1), rest: +(tEnd - tGeo).toFixed(1), total: +(tEnd - tStart).toFixed(1) };
  return pocket;
}
