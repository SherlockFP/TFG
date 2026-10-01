// Accumulates quads/boxes per material key and builds merged meshes (few draw calls).
import * as THREE from 'three';
import { getTexture, isAlphaTexture } from '../render/textures.js';
import { TEXTURE_OVERRIDES, extTexturePath } from '../audio/extassets.js';

const extCache = new Map();
const loader = new THREE.TextureLoader();
// Theme-scoped level texture keys. TEXTURE_OVERRIDES (audio/extassets.js) is one global table, so a mapping added
// for one interior leaks into every theme that shares the procedural key (ceiling_tiles -> office ceiling used
// to re-skin the factory / mansion / hospital ceilings). New themes use their own keys (procedural fallback =
// alias in render/textures.js) and the leaked global mappings are ignored for the shared key.
export const THEME_TEXTURES = {
  ceiling_office: 'tfg_office_ceiling',
  ceiling_clinic: 'tfg_hospital_ceiling',
  floor_clinic: 'tfg_hospital_floor',
  sewer_stone: 'tfg_sewer_stone',
  backrooms_base: 'gbr_backrooms_wall_base',
  marble_lobby: 'mf_bw_marble_tile_01',
};
const THEME_ONLY = { ceiling_tiles: 'tfg_office_ceiling' };
function textureOverride(name) {
  if (THEME_TEXTURES[name]) return THEME_TEXTURES[name];
  const ov = TEXTURE_OVERRIDES[name];
  return ov && THEME_ONLY[name] === ov ? null : ov;
}
// Level texture: prefer the downloaded PSX texture pack when available, else procedural.
export function levelTexture(name) {
  const ov = textureOverride(name);
  const path = ov && extTexturePath(ov);
  if (path && window.__kefalExtTextures !== false) {
    if (extCache.has(path)) return extCache.get(path);
    const t = loader.load(path);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapNearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 1;
    extCache.set(path, t);
    return t;
  }
  return getTexture(name);
}

const matCache = new Map();
export function levelMaterial(tex, opts = {}) {
  const key = tex + '|' + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const t = tex ? levelTexture(tex) : null;
  const m = new THREE.MeshLambertMaterial({
    map: t || null,
    color: opts.color ?? 0xffffff,
    side: opts.side ?? THREE.FrontSide,
    transparent: !!opts.transparent,
    alphaTest: opts.alphaTest ?? (t?.userData?.alphaTest || (tex && isAlphaTexture(tex) ? 0.5 : 0)),
    emissive: opts.emissive ?? 0x000000,
    vertexColors: !!opts.vertexColors,
    flatShading: !!opts.flat,
  });
  if (opts.opacity !== undefined) m.opacity = opts.opacity;
  matCache.set(key, m);
  return m;
}

/// ---------- static prop merging ----------
// Props are built from many small cached materials that differ only by colour (plastic#d8d2c4,
// plastic#a82424, paint#8a8a78 ...). Before merging, every plain Lambert/Basic/Phong/Standard material is
// folded into ONE canonical vertex-coloured material per (type, texture, emissive, side, ...), and its
// colour is baked into the vertex colours. That turns ~300 distinct prop materials per theme into ~40,
// so a chunk usually needs one draw call per texture instead of one per colour variant.
const CONSOLIDATE = new Set(['MeshLambertMaterial', 'MeshBasicMaterial', 'MeshPhongMaterial', 'MeshStandardMaterial']);
const vcCache = new Map();
const baseBeforeCompile = THREE.Material.prototype.onBeforeCompile;
const uid = (t) => (t ? t.uuid : '');
export function canonicalMaterial(mat) {
  if (globalThis.__kefalLegacyMerge) return null; // TEMP-BENCH
  if (!mat || !CONSOLIDATE.has(mat.type) || mat.userData?.instance || mat.userData?.noConsolidate) return null;
  if ((mat.name && mat.name.startsWith('screen:')) || mat.onBeforeCompile !== baseBeforeCompile) return null;
  if (mat.defines && Object.keys(mat.defines).length) return null;
  if (mat.userData?.vc) return mat;
  const key = [
    mat.type, uid(mat.map), uid(mat.emissiveMap), uid(mat.alphaMap), uid(mat.lightMap), uid(mat.aoMap), uid(mat.normalMap), uid(mat.specularMap),
    mat.emissive ? mat.emissive.getHexString() : '', mat.emissiveIntensity ?? 1, mat.side, mat.alphaTest, mat.flatShading ? 1 : 0,
    mat.fog ? 1 : 0, mat.depthWrite ? 1 : 0, mat.depthTest ? 1 : 0, mat.polygonOffset ? `${mat.polygonOffsetFactor},${mat.polygonOffsetUnits}` : '',
    mat.toneMapped ? 1 : 0, mat.blending, mat.wireframe ? 1 : 0, mat.roughness ?? '', mat.metalness ?? '', mat.shininess ?? '',
    mat.specular ? mat.specular.getHexString() : '',
  ].join('|');
  let c = vcCache.get(key);
  if (!c) {
    c = mat.clone();
    c.color.setRGB(1, 1, 1);
    c.vertexColors = true;
    c.userData = { vc: true };
    c.name = 'vc:' + (mat.map?.name || mat.name || mat.type);
    vcCache.set(key, c);
  }
  return c;
}

// entries: [{ m: Mesh, canon: canonical material | null }] -> one merged Mesh (world space of m.matrixWorld)
function mergeBucket(list, mat, parent) {
  const hasUv = !!list[0].m.geometry.attributes.uv;
  const hasCol = !!list[0].canon || !!list[0].m.geometry.attributes.color;
  let count = 0;
  const geos = list.map((e) => { const g = e.m.geometry.index ? e.m.geometry.toNonIndexed() : e.m.geometry; count += g.attributes.position.count; return { g, e }; });
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3);
  const uv = hasUv ? new Float32Array(count * 2) : null, col = hasCol ? new Float32Array(count * 3) : null;
  const tmpN = new THREE.Matrix3();
  const v = new THREE.Vector3();
  let o = 0;
  for (const { g, e } of geos) {
    const m = e.m;
    tmpN.getNormalMatrix(m.matrixWorld);
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    // canonical (vertex-coloured) material: vertex colour = source material colour x source vertex colour
    const C = e.canon ? (m.material.vertexColors ? g.attributes.color : null) : g.attributes.color;
    const mc = e.canon && !m.material.userData?.vc ? m.material.color : null;
    for (let i = 0; i < P.count; i++) {
      const j = o + i;
      v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld);
      pos[j * 3] = v.x; pos[j * 3 + 1] = v.y; pos[j * 3 + 2] = v.z;
      if (N) { v.fromBufferAttribute(N, i).applyMatrix3(tmpN).normalize(); nrm[j * 3] = v.x; nrm[j * 3 + 1] = v.y; nrm[j * 3 + 2] = v.z; }
      if (uv && U) { uv[j * 2] = U.getX(i); uv[j * 2 + 1] = U.getY(i); }
      if (col) {
        let r = 1, gg = 1, b = 1;
        if (C) { r = C.getX(i); gg = C.getY(i); b = C.getZ(i); }
        if (mc) { r *= mc.r; gg *= mc.g; b *= mc.b; }
        col[j * 3] = r; col[j * 3 + 1] = gg; col[j * 3 + 2] = b;
      }
    }
    o += P.count;
    if (g !== m.geometry) g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.matrixAutoUpdate = false;
  mesh.userData.merged = true;
  parent.add(mesh);
  for (const e of list) e.m.visible = false;
  return mesh;
}

// Merge static prop meshes into per-chunk, per-material meshes (big draw call reduction).
// objects: array of Object3D roots (already placed in the world). Meshes flagged
// userData.dynamic / userData.noMerge (or inside such a parent) and transparent/skinned/instanced meshes are
// skipped. Two passes: `chunk`-sized cells first, then whatever was alone in its cell is merged again in
// cells of `chunk * coarse` (a lone colour variant no longer costs its own draw call).
function finishSteps30(iterator) {
  let step; do { step = iterator.next(); } while (!step.done); return step.value;
}

export function mergeStaticMeshes(objects, parent, chunk = 24, coarse = 2.5) {
  return finishSteps30(mergeStaticMeshesSteps30(objects, parent, chunk, coarse));
}

// Same collection/bucket order as the synchronous merge; each completed bucket
// is already owned by parent when a staged caller yields or cancels.
export function* mergeStaticMeshesSteps30(objects, parent, chunk = 24, coarse = 2.5) {
  const entries = []; let collected = 0;
  for (const root of objects) {
    root.updateMatrixWorld(true);
    root.traverse((m) => {
      if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || !m.visible) return;
      for (let o = m; o; o = o.parent) { if (o.userData?.dynamic || o.userData?.noMerge) return; if (o === root) break; }
      const mat = m.material;
      if (Array.isArray(mat) || !mat || mat.transparent || mat.userData?.instance) return;
      const g = m.geometry;
      if (!g?.attributes?.position || g.morphAttributes?.position) return;
      const canon = canonicalMaterial(mat);
      const c = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
      entries.push({ m, c, canon, mat: canon || mat, sig: `${(canon || mat).uuid}|${g.attributes.uv ? 1 : 0}|${canon || g.attributes.color ? 1 : 0}` });
    });
    if (++collected % 8 === 0) yield 'merge-collect';
  }
  yield 'merge-collect';
  let merged = 0;
  const pass = function* (list, size) {
    const buckets = new Map();
    for (const e of list) {
      const key = `${Math.floor(e.c.x / size)},${Math.floor(e.c.z / size)},${Math.floor(e.c.y / 20)}|${e.sig}`;
      let b = buckets.get(key);
      if (!b) { b = []; buckets.set(key, b); }
      b.push(e);
    }
    const left = [];
    for (const b of buckets.values()) {
      if (b.length < 2) { left.push(...b); continue; }
      mergeBucket(b, b[0].mat, parent);
      merged += b.length;
      yield 'merge-bucket';
    }
    return left;
  };
  const left = yield* pass(entries, chunk);
  if (coarse > 1 && !globalThis.__kefalLegacyMerge) yield* pass(left, chunk * coarse); // TEMP-BENCH
  return merged;
}

/** Merge the static meshes under `root` (an animated anchor such as a door leaf) into root-local meshes, one per
 *  canonical material. Meshes below any object in `skip` (nested anchors) are left alone. */
export function compactSubtree(root, skip = null) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  root.traverse((m) => {
    if (!m.isMesh || m === root || m.isInstancedMesh || m.isSkinnedMesh || !m.visible) return;
    for (let o = m; o && o !== root; o = o.parent) if (o.userData?.dynamic || o.userData?.noMerge || (skip && skip.has(o))) return;
    const mat = m.material;
    if (Array.isArray(mat) || !mat || mat.transparent) return;
    const canon = canonicalMaterial(mat);
    if (!canon || !m.geometry?.attributes?.position || m.geometry.morphAttributes?.position) return;
    const key = canon.uuid + '|' + (m.geometry.attributes.uv ? 1 : 0);
    let b = buckets.get(key);
    if (!b) { b = []; buckets.set(key, b); }
    b.push({ m, canon });
  });
  const holder = new THREE.Group();
  for (const b of buckets.values()) {
    if (b.length < 2) continue;
    // express every mesh in root space: temporarily bake root^-1 * world
    const saved = b.map((e) => e.m.matrixWorld.clone());
    for (const e of b) e.m.matrixWorld.premultiply(inv);
    const mesh = mergeBucket(b, b[0].canon, holder);
    b.forEach((e, i) => e.m.matrixWorld.copy(saved[i]));
    mesh.matrixAutoUpdate = true;
    mesh.userData.merged = false;
  }
  for (const c of [...holder.children]) root.add(c);
}

export class GeoBuilder {
  constructor() { this.buckets = new Map(); }
  bucket(key) {
    let b = this.buckets.get(key);
    if (!b) { b = { pos: [], nrm: [], uv: [], col: [], idx: [] }; this.buckets.set(key, b); }
    return b;
  }
  // p0..p3 counter-clockwise when seen from the front. uvs: [[u,v]x4]
  quad(key, p0, p1, p2, p3, uvs, color) {
    const b = this.bucket(key);
    const base = b.pos.length / 3;
    const e1 = new THREE.Vector3().subVectors(p1, p0), e2 = new THREE.Vector3().subVectors(p3, p0);
    const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
    for (const p of [p0, p1, p2, p3]) { b.pos.push(p.x, p.y, p.z); b.nrm.push(n.x, n.y, n.z); }
    for (const uv of uvs) b.uv.push(uv[0], uv[1]);
    const c = color || [1, 1, 1];
    if (Array.isArray(c[0])) for (let i = 0; i < 4; i++) b.col.push(c[i][0], c[i][1], c[i][2]);   // per-vertex colours p0..p3
    else for (let i = 0; i < 4; i++) b.col.push(c[0], c[1], c[2]);
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // Horizontal rect at height y spanning x0..x1, z0..z1. up=true faces +Y (floor), false faces -Y (ceiling)
  hrect(key, x0, z0, x1, z1, y, up, uvScale = 0.5, color) {
    const a = new THREE.Vector3(x0, y, z0), b = new THREE.Vector3(x1, y, z0), c = new THREE.Vector3(x1, y, z1), d = new THREE.Vector3(x0, y, z1);
    const uv = (p) => [p.x * uvScale, p.z * uvScale];
    if (up) this.quad(key, d, c, b, a, [uv(d), uv(c), uv(b), uv(a)], color);
    else this.quad(key, a, b, c, d, [uv(a), uv(b), uv(c), uv(d)], color);
  }
  /** hrect with one colour per corner: cols = [c(x0,z0), c(x1,z0), c(x1,z1), c(x0,z1)] */
  hrectC(key, x0, z0, x1, z1, y, up, uvScale, cols) {
    const a = new THREE.Vector3(x0, y, z0), b = new THREE.Vector3(x1, y, z0), c = new THREE.Vector3(x1, y, z1), d = new THREE.Vector3(x0, y, z1);
    const uv = (p) => [p.x * uvScale, p.z * uvScale];
    if (up) this.quad(key, d, c, b, a, [uv(d), uv(c), uv(b), uv(a)], [cols[3], cols[2], cols[1], cols[0]]);
    else this.quad(key, a, b, c, d, [uv(a), uv(b), uv(c), uv(d)], cols);
  }
  // Vertical wall rect from (x0,z0) to (x1,z1), y0..y1, facing the left-hand normal of the direction.
  // color: [r,g,b] for the whole quad, or { bottom: [r,g,b], top: [r,g,b] } for a vertical gradient.
  vrect(key, x0, z0, x1, z1, y0, y1, uvScale = 0.5, color, uOffset = 0) {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y0, z1), c = new THREE.Vector3(x1, y1, z1), d = new THREE.Vector3(x0, y1, z0);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const u0 = uOffset * uvScale, u1 = (uOffset + len) * uvScale;
    const col = color && color.bottom ? [color.bottom, color.bottom, color.top, color.top] : color;
    this.quad(key, a, b, c, d, [[u0, y0 * uvScale], [u1, y0 * uvScale], [u1, y1 * uvScale], [u0, y1 * uvScale]], col);
  }
  box(key, cx, cy, cz, sx, sy, sz, uvScale = 0.5, color) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    this.hrect(key, x0, z0, x1, z1, y1, true, uvScale, color);
    this.hrect(key, x0, z0, x1, z1, y0, false, uvScale, color);
    this.vrect(key, x0, z1, x1, z1, y0, y1, uvScale, color); // +z face
    this.vrect(key, x1, z0, x0, z0, y0, y1, uvScale, color); // -z face
    this.vrect(key, x1, z1, x1, z0, y0, y1, uvScale, color); // +x
    this.vrect(key, x0, z0, x0, z1, y0, y1, uvScale, color); // -x
  }
  build(materialFor) { return finishSteps30(this.buildSteps30(materialFor)); }
  // Optional ownership callback runs before the first material is constructed,
  // so a cancelled facility can free already-finished detached output meshes.
  *buildSteps30(materialFor, ownGroup = null) {
    const group = new THREE.Group();
    ownGroup?.(group);
    for (const [key, b] of this.buckets) {
      if (!b.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.idx);
      g.computeBoundingSphere();
      g.computeBoundingBox();
      let mesh;
      try { mesh = new THREE.Mesh(g, materialFor(key)); } catch (error) { g.dispose(); throw error; }
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.userData.levelKey = key;
      group.add(mesh);
      yield 'level-mesh';
    }
    return group;
  }
}
