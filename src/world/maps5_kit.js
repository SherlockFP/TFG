// MAPS5 (wave 4) - shared building kit for the new labyrinth / vault set pieces: materials, a builder bundle (merged geometry + Rapier boxes),
// wall-run construction from a maze lattice, door steps, a drifting mist sheet and a snow particle box. Everything is boxes on the
// Solids / FrameGeo helpers of worlds2 (one merged mesh per material key for the whole map; colliders are merged wall runs).
import * as THREE from 'three';
import { levelMaterial } from './geobuilder.js';
import { makeCanvasTexture } from '../render/textures.js';
import { RNG } from '../core/rng.js';
import { FrameGeo, Solids, w2Material, guard } from './worlds2_solids.js';
import { DECOR_HELPERS } from './outdoor_biomes.js';
import { createAnyProp } from './propfactory.js';

export { FrameGeo, Solids, guard };
export const TAU = Math.PI * 2;

// material key -> level texture (tinted per quad through vertex colours, so a key is ONE material for the whole map)
export const M5_MATS = {
  hedge: 'grass', books: 'books', rack: 'server_front', rackwall: 'server_wall', ice: 'snow', marble: 'marble', stone: 'concrete_stained', wood: 'wood_dark',
  metal: 'metal_plate', dark: 'metal_dark', grate: 'metal_grate', hazard: 'hazard_stripes', cabinet: 'metal', floor: 'metal_plate', carpet: 'carpet_red',
};
export function m5Material(key) {
  if (key === 'glow') return w2Material('glow');
  if (M5_MATS[key]) return levelMaterial(M5_MATS[key], { vertexColors: true });
  return w2Material(key);
}

/** { gb, B, S }: the geometry bundle every set piece draws into. C = decor ctx (addBox, emitters, seed). */
export function makeBuilder(C, salt = 0x5a17) {
  const gb = new FrameGeo();
  const B = { gb, addBox: (...a) => C.addBox(...a), R: new RNG(((C.seed | 0) ^ salt) >>> 0), boxes: 0, emitters: [] };
  return { gb, B, S: new Solids(B) };
}
/** flush the merged geometry into the decor group (one mesh per material key); returns the group */
export function flush(C, gb, B) {
  const mesh = gb.build(m5Material);
  C.add(mesh);
  mesh.traverse((o) => { if (o.geometry) C.geos.push(o.geometry); });
  for (const e of B.emitters) C.emitters.push(e);
  return mesh;
}

/** steps that lead from a door sill (local x, z at floor level y0) outward along local +z (dir = 1) or -z (dir = -1) down to the terrain */
export function doorSteps(S, C, y0, lx, lz, dir, width = 2.8) {
  for (let j = 1; j <= 9; j++) {
    const top = y0 - 0.3 * j, sz = lz + dir * (0.25 + 0.4 * j);
    const [wx, wz] = S.w(lx, sz);
    const gh = C.terrain.heightAt(wx, wz);
    if (top <= gh + 0.02) break;
    const base = Math.min(gh, top) - 0.4;
    S.solid('stone', lx, base, sz, width, top - base, 0.4, { uv: 0.6, tint: 0.85 });
  }
}

/**
 * Build the wall runs of a lattice (see maps5_core wallLattice): one merged collider box per run (extended by half the thickness at both ends so
 * corners close) and one visual box. `pick(run)` -> { key, y0, h, T, color, tint, top } lets the caller style perimeter / interior runs; runs with
 * pick() === null are skipped (built elsewhere). `bump` adds jittered foliage lumps on top of a run. Returns the number of colliders.
 */
export function buildRuns(S, runs, pick, o = {}) {
  let n = 0;
  const R = S.B.R;
  for (const run of runs) {
    const st = pick(run);
    if (!st) continue;
    const T = st.T, len = run.u1 - run.u0 + T, uc = (run.u0 + run.u1) / 2;
    const col = st.color || [1, 1, 1], tint = (st.tint ?? 1) * (0.92 + 0.16 * R.next());
    if (run.ax === 'x') {
      if (st.col !== false) { S.col(uc, st.y0, run.c, len, st.h, T); n++; }
      S.vis(st.key, uc, st.y0, run.c, len, st.h, T, { uv: st.uv ?? 0.4, tint, color: col, bottom: false });
    } else {
      if (st.col !== false) { S.col(run.c, st.y0, uc, T, st.h, len); n++; }
      S.vis(st.key, run.c, st.y0, uc, T, st.h, len, { uv: st.uv ?? 0.4, tint, color: col, bottom: false });
    }
    if (st.bump) {
      const step = st.bump, top = st.y0 + st.h;
      for (let u = run.u0 + step / 2; u < run.u1; u += step) {
        const j = R.float(-0.25, 0.25), hh = R.float(0.35, 0.75), w = step * R.float(0.7, 1.05), tt = tint * R.float(0.9, 1.15);
        if (run.ax === 'x') S.vis(st.key, u + j, top - 0.15, run.c + R.float(-0.12, 0.12), w, hh, T + R.float(0.05, 0.4), { col: false, uv: 0.5, tint: tt, color: col, bottom: false });
        else S.vis(st.key, run.c + R.float(-0.12, 0.12), top - 0.15, u + j, T + R.float(0.05, 0.4), hh, w, { col: false, uv: 0.5, tint: tt, color: col, bottom: false });
      }
    }
  }
  return n;
}

// ------------------------------------------------------------------------------------------------ particles + mist
/** camera-following particle box (snow, dust). Returns the Points object; the updater is pushed on C.updaters. */
export function skyBox(C, { n = 900, box = 64, height = 26, size = 0.11, color = 0xf2f6fa, opacity = 0.85, wind = [0.9, 0], fall = 1.3, jitter = 0.4 } = {}) {
  const P = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) { P[i * 3] = (Math.random() - 0.5) * box; P[i * 3 + 1] = Math.random() * height; P[i * 3 + 2] = (Math.random() - 0.5) * box; ph[i] = Math.random() * TAU; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  const m = C.mat(new THREE.PointsMaterial({ size, color, transparent: true, opacity, depthWrite: false, fog: true }));
  const pts = C.add(C.own(new THREE.Points(g, m)));
  pts.frustumCulled = false;
  let lx = null, lz = null;
  C.updaters.push(guard((dt, t, game) => {
    const cam = game?.camera?.position;
    if (!cam) return;
    pts.visible = cam.y > -100;
    if (!pts.visible) return;
    pts.position.set(cam.x, cam.y - height * 0.35, cam.z);
    const mx = lx === null ? 0 : cam.x - lx, mz = lz === null ? 0 : cam.z - lz;
    lx = cam.x; lz = cam.z;
    const half = box / 2, arr = g.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      arr[k] += (wind[0] + Math.sin(t * 0.7 + ph[i]) * jitter) * dt - mx;
      arr[k + 1] -= (fall + (i % 5) * 0.12) * dt;
      arr[k + 2] += (wind[1] + Math.cos(t * 0.6 + ph[i]) * jitter) * dt - mz;
      if (arr[k] > half) arr[k] -= box; else if (arr[k] < -half) arr[k] += box;
      if (arr[k + 2] > half) arr[k + 2] -= box; else if (arr[k + 2] < -half) arr[k + 2] += box;
      if (arr[k + 1] < 0) arr[k + 1] += height;
    }
    g.attributes.position.needsUpdate = true;
  }, 'maps5 sky'));
  return pts;
}

/** a drifting low mist sheet (two crossed layers) over a square area; pure decoration (one transparent draw call per layer) */
export function mistSheets(C, cx, y, cz, size, { color = 0xcfd8cc, opacity = 0.2, layers = 2 } = {}) {
  const mkTex = (seed) => makeCanvasTexture(64, 64, (ctx) => {
    const R = new RNG(seed);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 90; i++) { const x = R.float(0, 64), yy = R.float(0, 64), r = R.float(4, 12), a = R.float(0.1, 0.5); ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(x, yy, r, 0, TAU); ctx.fill(); }
  });
  const sheets = [];
  for (let k = 0; k < layers; k++) {
    const tex = mkTex(77 + k * 13);
    if (tex) C.texs.push(tex);
    const m = C.mat(new THREE.MeshBasicMaterial({ color, map: tex || null, alphaMap: tex || null, transparent: true, opacity: opacity * (k ? 0.7 : 1), depthWrite: false, fog: true, side: THREE.DoubleSide }));
    if (m.map) { m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; m.map.repeat.set(size / 14, size / 14); }
    if (m.alphaMap) { m.alphaMap.wrapS = m.alphaMap.wrapT = THREE.RepeatWrapping; m.alphaMap.repeat.set(size / 14, size / 14); }
    const mesh = C.add(C.own(new THREE.Mesh(new THREE.PlaneGeometry(size, size), m)));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(cx, y + k * 0.9, cz);
    sheets.push({ mesh, m, k });
  }
  C.updaters.push(guard((dt, t) => {
    for (const s of sheets) {
      if (s.m.map) { s.m.map.offset.x = (t * 0.012 * (s.k ? -1 : 1)) % 1; s.m.map.offset.y = (t * 0.008) % 1; }
      if (s.m.alphaMap && s.m.alphaMap !== s.m.map) { s.m.alphaMap.offset.x = (t * 0.012 * (s.k ? -1 : 1)) % 1; s.m.alphaMap.offset.y = (t * 0.008) % 1; }
      s.m.opacity = opacity * (s.k ? 0.7 : 1) * (0.85 + 0.15 * Math.sin(t * 0.4 + s.k));
    }
  }, 'maps5 mist'));
  return sheets;
}

/** the site finder of worlds2, but with more tries: the centrepieces must always find a place */
export function findSite(C, taken, radius, tol = 2.4, tries = 400, grow = 0.6) {
  const R = C.R;
  for (let t = 0; t < tries; t++) {
    const x = R.float(-C.lim * 0.8, C.lim * 0.8), z = R.float(-C.lim * 0.8, C.lim * 0.8);
    if (C.avoid(x, z, radius)) continue;
    if (taken.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + radius + 3)) continue;
    let lo = Infinity, hi = -Infinity;
    const pts = [[0, 0]];
    for (const rr of [radius * 0.5, radius * 0.9]) for (let k = 0; k < 8; k++) pts.push([Math.cos((k / 8) * TAU) * rr, Math.sin((k / 8) * TAU) * rr]);
    for (const [dx, dz] of pts) { const v = C.h(x + dx, z + dz); if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo > tol + Math.floor(t / 25) * grow) continue;
    return { x, z, lo, hi, y0: hi + 0.05, yLo: lo };
  }
  return null;
}

// ------------------------------------------------------------------------------------------------ props
const _protoCols = new Map();
/**
 * Place procedural props ('m5:*', 'ext:*' ...): visuals are instanced per prototype material (DECOR_HELPERS.instancedProp), colliders come
 * from the prototype's userData.colliders rotated by the entry yaw. Entries: { id, x, y, z, ry, nocol }. Returns the number of colliders.
 */
export function placeProps(C, list) {
  const byId = new Map();
  for (const p of list) { if (!byId.has(p.id)) byId.set(p.id, []); byId.get(p.id).push(p); }
  let boxes = 0;
  for (const [id, items] of byId) {
    DECOR_HELPERS.instancedProp(C, id, items.map((p) => ({ x: p.x, y: p.y, z: p.z, ry: p.ry || 0 })));
    if (!_protoCols.has(id)) {
      let cols = [];
      try { const proto = createAnyProp(id, { seed: 7 }); cols = proto.userData.colliders || []; proto.traverse((m) => { if (m.geometry) m.geometry.dispose(); }); } catch { /* prop optional */ }
      _protoCols.set(id, cols);
    }
    for (const p of items) {
      if (p.nocol) continue;
      const c0 = Math.cos(p.ry || 0), s0 = Math.sin(p.ry || 0);
      for (const c of _protoCols.get(id)) {
        C.addBox(p.x + c.c[0] * c0 + c.c[2] * s0, p.y + c.c[1], p.z - c.c[0] * s0 + c.c[2] * c0, c.s[0], c.s[1], c.s[2], p.ry || 0);
        boxes++;
      }
    }
  }
  return boxes;
}
