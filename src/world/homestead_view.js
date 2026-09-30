// HOMESTEAD visuals (wave 8 tycoon, module 'homestead'): the plot's pieces, buy pads, cube line, gold pile, tally board, buyer plaques, guiding chevron trail.
// Same rules as resto_view: lit + emissive merged vertex-coloured meshes (B), shared materials, ZERO three lights, everything disposable. Cubes and pile are single InstancedMeshes
// with reused Matrix4 / Color objects (no per-frame allocation). Pure three, no game access: homestead.js drives it with the synced state.
import * as THREE from 'three';
import { B, easeOutBack, labelSprite, buildPad, flatLayer, LAYER } from './resto_view.js';
import { HOME_Y, CONSOLE_POS } from './homeworld_map.js';
import { IT_COLOR } from '../game/homeworld2_core.js';
import * as C from '../game/homestead_core.js';
import { t } from '../core/i18n.js';

export const MAX_CUBES = 48, MAX_PILE = 24, CUBE_PERIOD = 2.4, BELT_SECS = 8, PLAQUE_MAX = 6, PLAQUE_R = 8, FAR = 90;
const K = { slab: 0x3c4048, slabHi: 0x50555e, wall: 0x6a5f52, wallDk: 0x3f382f, trim: 0xffa030, steel: 0x8a9096, dark: 0x2a2e36, wood: 0x8a5a3a, roof: 0x4a3f38, gold: 0xffd23f, red: 0xd23a2a, green: 0x40e070, stone: 0x7a7670 };
const GATE_COL = [0, IT_COLOR[5], IT_COLOR[3], 0xffd23f];        // smelter orange, press cyan, polish gold (the factory's colour language)
const SCRAP_COL = IT_COLOR[1];
const ROOM_TINT = [0x5a4a4a, 0x4a4a5a, 0x4a5a4a];

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color(), _c2 = new THREE.Color();

function canvasMat(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(cv); tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false; tx.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tx, transparent: true });
}
const disposeMat = (m) => { m.map?.dispose(); m.dispose(); };

// ---------------------------------------------------------------------------------------------- piece models (pos = absolute for slab / walls / belt / roof, relative to `at` for machines and furniture)
function buildClaim() {
  const b = new B(), P = C.PLOT, w = P.x1 - P.x0, d = P.z1 - P.z0, cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2;
  b.box(w, 0.05, d, cx, 0.03, cz, K.slab);
  b.box(w - 0.4, 0.052, 0.1, cx, 0.035, P.z0 + 0.15, K.trim, true); b.box(w - 0.4, 0.052, 0.1, cx, 0.035, P.z1 - 0.15, K.trim, true);
  for (const [x, z] of [[P.x0, P.z0], [P.x1, P.z0], [P.x0, P.z1], [P.x1, P.z1]]) b.box(0.18, 1.5, 0.18, x, 0.75, z, K.dark).box(0.22, 0.22, 0.22, x, 1.6, z, K.trim, true);
  const bo = C.BOOTH;
  b.box(bo.hx * 2, 1.1, bo.hz * 2, bo.x, 0.55, bo.z, K.wood).box(bo.hx * 2 + 0.1, 0.06, bo.hz * 2 + 0.1, bo.x, 1.13, bo.z, K.dark);
  b.box(bo.hx * 2, 0.9, 0.08, bo.x, 1.75, bo.z - 0.15, K.dark).box(bo.hx * 2 + 0.1, 0.06, 0.1, bo.x, 2.24, bo.z - 0.15, K.trim, true).box(0.12, 1.2, 0.12, bo.x - 0.9, 1.6, bo.z - 0.15, K.dark).box(0.12, 1.2, 0.12, bo.x + 0.9, 1.6, bo.z - 0.15, K.dark);
  b.box(1.4, 0.05, 0.5, bo.x, 1.17, bo.z + 0.1, K.gold, true);                       // gold counter strip
  return b.build('hs-claim');
}
function buildBelt() {
  const b = new B(), L = C.BELT, len = L.x1 - L.x0, cx = (L.x0 + L.x1) / 2;
  b.box(len, 0.14, L.w + 0.3, cx, 0.72, L.z, K.dark).box(len, 0.04, L.w, cx, 0.8, L.z, 0x1c1e22);
  b.box(len, 0.05, 0.05, cx, 0.86, L.z - L.w / 2 - 0.1, K.trim, true).box(len, 0.05, 0.05, cx, 0.86, L.z + L.w / 2 + 0.1, K.trim, true);
  for (let x = L.x0 + 0.5; x < L.x1; x += 2.2) b.box(0.1, 0.62, 0.1, x, 0.31, L.z - 0.45, K.steel).box(0.1, 0.62, 0.1, x, 0.31, L.z + 0.45, K.steel);
  for (let x = L.x0 + 0.8; x < L.x1 - 0.6; x += 1.1) b.box(0.32, 0.02, 0.08, x, 0.815, L.z, K.trim, true);     // direction ticks
  b.box(1.0, 0.5, 1.0, L.x1 + 0.05, 0.3, L.z, K.steel).box(0.86, 0.04, 0.86, L.x1 + 0.05, 0.55, L.z, 0x1c1e22);   // collector bin
  return b.build('hs-belt');
}
function buildDrop() {
  const b = new B();
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) b.box(0.08, 1.7, 0.08, x, 0.85, z, K.steel);
  b.box(0.8, 0.5, 0.8, 0, 1.9, 0, K.stone).box(0.4, 0.3, 0.4, 0, 1.5, 0, K.dark).box(0.34, 0.04, 0.34, 0, 1.33, 0, K.trim, true).box(0.86, 0.06, 0.86, 0, 2.17, 0, K.dark);
  const grp = b.build('hs-drop');
  const lm = new THREE.MeshBasicMaterial({ color: K.green }), lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), lm); lamp.position.set(0, 2.32, 0); grp.add(lamp);
  grp.userData.lamp = lamp; grp.userData.geos.push(lamp.geometry); grp.userData.mats = [lm];
  return grp;
}
function buildGate(tier) {
  const c = GATE_COL[tier] || K.gold, b = new B();
  b.box(0.16, 1.5, 0.16, 0, 0.75, -0.55, K.steel).box(0.16, 1.5, 0.16, 0, 0.75, 0.55, K.steel).box(0.3, 0.18, 1.4, 0, 1.55, 0, K.dark).box(0.32, 0.07, 1.3, 0, 1.67, 0, c, true);
  b.box(0.05, 0.75, 0.05, 0, 1.1, -0.5, c, true).box(0.05, 0.75, 0.05, 0, 1.1, 0.5, c, true);
  return b.build('hs-gate');
}
function buildAuto() {
  const b = new B(); b.cyl(0.22, 0.9, 0, 0.45, 0, K.steel).box(0.5, 0.1, 0.5, 0, 0.05, 0, K.dark).cyl(0.14, 0.2, 0, 1.0, 0, K.trim, true);
  const grp = b.build('hs-auto'), arm = new B().box(1.3, 0.1, 0.16, 0.6, 0, 0, K.steel).box(0.16, 0.34, 0.5, 1.2, -0.1, 0, K.dark).build('arm');
  arm.position.y = 1.15; grp.add(arm); grp.userData.arm = arm; grp.userData.geos.push(...arm.userData.geos);
  return grp;
}
function buildFound() {
  const b = new B(), L = C.LODGE;
  C.ROOMS.forEach(([a, c], i) => b.box(c - a - 0.1, 0.07, L.z1 - L.z0 - 0.1, (a + c) / 2, 0.06, (L.z0 + L.z1) / 2, ROOM_TINT[i]));
  for (const w of C.collidersFor('found')) b.box(w.hx * 2, w.h, w.hz * 2, w.x, w.h / 2, w.z, K.wall);
  for (const [a, c] of C.ROOMS) { const cx = (a + c) / 2; b.box(L.door + 0.3, 0.42, L.wall + 0.06, cx, 2.38, L.z0 + L.wall / 2, K.wallDk).box(L.door, 0.06, 0.08, cx, 2.14, L.z0 - 0.03, K.trim, true); }
  b.box(L.x1 - L.x0 + 0.3, 0.1, L.wall + 0.1, (L.x0 + L.x1) / 2, L.h + 0.02, L.z1 - 0.1, K.trim, true);      // amber trim on the back wall
  return b.build('hs-found');
}
function buildBunk() {
  const b = new B();
  b.box(1.6, 0.02, 1.2, 0, 0.09, 0, 0x8a3a3a);
  for (const [x, z] of [[-2.05, 0.15], [-1.15, 0.15], [-2.05, 1.85], [-1.15, 1.85]]) b.box(0.07, 1.5, 0.07, x, 0.75, z, K.wood);
  b.box(0.95, 0.24, 1.9, -1.6, 0.42, 1.0, 0x8a8f96).box(0.95, 0.24, 1.9, -1.6, 1.12, 1.0, 0x8a8f96).box(0.85, 0.12, 0.3, -1.6, 0.6, 1.75, 0xe8e8e0).box(0.85, 0.12, 0.3, -1.6, 1.3, 1.75, 0xe8e8e0);
  b.box(0.4, 0.5, 0.4, -0.7, 0.25, 1.75, K.wood).sph(0.09, -0.7, 0.62, 1.75, K.gold, true);
  return b.build('hs-bunk');
}
function buildHearth() {
  const b = new B();
  b.box(1.9, 1.3, 0.5, 0, 0.65, 0.1, K.stone).box(0.9, 0.62, 0.1, 0, 0.42, -0.16, 0x0e0c0c).box(2.1, 0.1, 0.62, 0, 1.35, 0.1, K.dark).box(0.6, 0.06, 0.2, 0, 0.13, -0.05, 0x4a3020);
  b.box(0.08, 0.6, 0.08, -0.7, 1.7, 0.16, K.trim, true).box(0.4, 0.4, 0.03, 0.55, 1.75, 0.34, K.gold, true);
  const grp = b.build('hs-hearth'), fm = new THREE.MeshBasicMaterial({ color: 0xff7a20 }), fl = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 5), fm);
  fl.position.set(0, 0.42, -0.08); grp.add(fl); grp.userData.flame = fl; grp.userData.geos.push(fl.geometry); grp.userData.mats = [fm];
  return grp;
}
function buildShop() {
  const b = new B();
  b.box(1.9, 0.86, 0.7, 0, 0.43, 0, K.wood).box(2.0, 0.07, 0.8, 0, 0.9, 0, K.dark).box(0.3, 0.2, 0.3, 0.6, 1.04, 0, K.steel).box(0.6, 0.04, 0.3, -0.4, 0.96, 0, K.steel);
  b.box(2.0, 1.1, 0.06, 0, 1.75, 0.32, K.dark);
  for (let i = 0; i < 5; i++) b.box(0.08, 0.5 + (i % 3) * 0.08, 0.05, -0.75 + i * 0.38, 1.7, 0.27, i % 2 ? K.trim : 0x50d8ff, true);
  b.sph(0.1, -0.85, 1.05, 0.05, K.gold, true);
  return b.build('hs-shop');
}
function buildPorch() {
  const b = new B(), P = C.PORCH, cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2, at = C.PIECE.porch.at;
  b.box(P.x1 - P.x0, 0.14, P.z1 - P.z0, cx - at[0], 0.07, cz - at[1], 0x6a5a48);
  for (const z of [P.z0 + 0.3, P.z1 - 0.3]) { b.box(0.1, 2.1, 0.1, cx - at[0] + 0.9, 1.05, z - at[1], K.wood).sph(0.16, cx - at[0] + 0.9, 2.2, z - at[1], 0xffe9a8, true); }
  b.box(0.36, 0.5, 0.26, cx - at[0] - 0.9, 0.9, P.z0 + 0.5 - at[1], K.dark).box(0.05, 0.4, 0.05, cx - at[0] - 0.9, 0.5, P.z0 + 0.5 - at[1], K.steel).box(0.16, 0.08, 0.03, cx - at[0] - 0.78, 1.08, P.z0 + 0.38 - at[1], K.red, true);
  return b.build('hs-porch');
}
function buildRoof() {
  const b = new B(), L = C.LODGE, w = L.x1 - L.x0 + 0.9, d = L.z1 - L.z0 + 0.9, cx = (L.x0 + L.x1) / 2, cz = (L.z0 + L.z1) / 2;
  b.box(w, 0.22, d, cx, L.h + 0.11, cz, K.roof).box(w + 0.1, 0.06, 0.1, cx, L.h + 0.06, L.z0 - 0.42, K.trim, true).box(w - 1, 0.5, 0.2, cx, L.h + 0.45, cz + 0.6, K.dark).box(0.9, 1.1, 0.9, C.ROOMS[1][0] + 1.4, L.h + 0.7, L.z1 - 0.7, K.stone).box(3.1, 0.8, 0.12, (L.x0 + L.x1) / 2, 3.3, L.z0 - 0.05, K.dark);
  const grp = b.build('hs-roof');
  grp.userData.chimney = true; return grp;
}
function signMat(rb) {
  return canvasMat(256, 64, (g, w, h) => { g.fillStyle = '#100a14'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff4fd8'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6); g.fillStyle = '#ffd23f'; g.font = 'bold 34px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`HOME${rb ? ' \u2605' + rb : ''}`, w / 2, h / 2 + 2); });
}
export function buildPiece(id) {
  const p = C.PIECE[id]; if (!p) return null;
  switch (p.kind) {
    case 'claim': return buildClaim();
    case 'belt': return buildBelt();
    case 'drop': return buildDrop();
    case 'gate': return buildGate(p.tier);
    case 'auto': return buildAuto();
    default:
  }
  return { found: buildFound, bunk: buildBunk, hearth: buildHearth, shop: buildShop, porch: buildPorch, roof: buildRoof }[id]?.() || null;
}
const ABS = new Set(['claim', 'belt', 'found', 'roof']);       // modelled in world coordinates (origin group); the rest sit at piece.at

export function buildTrail() {
  const path = [[CONSOLE_POS.x, CONSOLE_POS.z + 1.6], [2.6, 50.6], [C.CLAIM_PAD[0] + 3, 50.6]], pos = [];
  let carry = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    for (let d = carry; d < len; d += 2.4) {
      const x = ax + ux * d, z = az + uz * d, px = -uz, pz = ux;      // chevron: one triangle pointing along the path
      pos.push(x + ux * 0.5, z + uz * 0.5, x - ux * 0.3 + px * 0.42, z - uz * 0.3 + pz * 0.42, x - ux * 0.3 - px * 0.42, z - uz * 0.3 - pz * 0.42);
      carry = d + 2.4 - len;
    }
  }
  const g = new THREE.BufferGeometry(), a = new Float32Array(pos.length / 2 * 3);
  for (let i = 0, j = 0; i < pos.length; i += 2, j += 3) { a[j] = pos[i]; a[j + 1] = 0; a[j + 2] = pos[i + 1]; }
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  const m = flatLayer(new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }), LAYER.decal);
  const mesh = new THREE.Mesh(g, m); mesh.position.y = LAYER.decal + 0.02; mesh.frustumCulled = false;
  mesh.userData.geos = [g]; mesh.userData.mats = [m]; return mesh;
}

// ---------------------------------------------------------------------------------------------- the view
/** createHomesteadView() -> { root, sync(state), setSnap(o), update(dt, time, ctx), padAt(x, z), dispose(), pads, pieces, cubeCount, pileCount } */
export function createHomesteadView() {
  const root = new THREE.Group(); root.name = 'homestead'; root.position.y = HOME_Y;
  const pieces = new Map(), pops = new Map(), pads = new Map(), plaques = new Map();
  let first = true, padSig = '', boardKey = '', signRb = -1, trail = null, trailFade = -1, snap = { p: 0, g: 0, c: 0, r: 0, cl: 0, rb: 0 }, built = new Set(), st = null;
  const own = [];                                                        // disposables owned by the view

  // cubes: 48 pooled structs + one InstancedMesh
  const cg = new THREE.BoxGeometry(0.26, 0.26, 0.26), cm = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const cubesMesh = new THREE.InstancedMesh(cg, cm, MAX_CUBES); cubesMesh.count = 0; cubesMesh.frustumCulled = false; cubesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cubesMesh.setColorAt(0, _c.set(0xffffff)); root.add(cubesMesh); own.push(cg, cm);
  const cubes = Array.from({ length: MAX_CUBES }, () => ({ on: false, x: 0, z: 0, d: 0 }));
  const emitT = [0, 0.8, 1.6];
  // pile: 24 gold cubes at the collector bin
  const pg = new THREE.BoxGeometry(0.22, 0.22, 0.22), pm = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pileMesh = new THREE.InstancedMesh(pg, pm, MAX_PILE); pileMesh.count = 0; pileMesh.frustumCulled = false; root.add(pileMesh); own.push(pg, pm);
  let pileN = -1;
  // tally board (canvas redrawn only when its text changes)
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.66), new THREE.MeshBasicMaterial({ transparent: true })); board.visible = false; board.position.set(C.BOOTH.x, 1.75, C.BOOTH.z - 0.08); root.add(board);
  own.push(board.geometry);
  const collector = buildPad(0xffd23f); collector.position.set(C.COLLECTOR.x, 0, C.COLLECTOR.z); collector.visible = false; root.add(collector);
  const cLabel = labelSprite(t('COLLECT'), { color: '#ffd23f', scale: 1.5 }); cLabel.position.set(0, 1.9, 0); collector.add(cLabel); collector.userData.mats.push(cLabel.material);
  own.push(...collector.userData.geos, ...collector.userData.mats);

  let drops = [], gates = [], slowT = 0;                                   // cached per sync (no per-frame allocation in the cube loop)

  function addPiece(id, animate) {
    const p = C.PIECE[id], grp = buildPiece(id); if (!grp) return;
    if (!ABS.has(id)) grp.position.set(p.at[0], 0, p.at[1]);
    if (id === 'auto' || id === 'drop1') grp.rotation.y = 0;
    root.add(grp); pieces.set(id, grp);
    if (id === 'roof') { const sm = signMat(snap.rb); const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.75), sm); sg.position.set(C.LODGE.x0 + 8.3, 3.3, C.LODGE.z0 - 0.13); grp.add(sg); grp.userData.sign = sg; signRb = snap.rb; own.push(sg.geometry); }
    if (animate) pops.set(id, { t: 0, grp, kind: id === 'roof' ? 'drop' : ABS.has(id) ? 'rise' : 'scale' });
    if (animate) { if (id === 'roof') grp.position.y = 5; else if (ABS.has(id)) grp.scale.y = 0.01; else grp.scale.setScalar(0.01); }
  }
  function delPiece(id) { const g = pieces.get(id); if (!g) return; for (const x of g.userData.geos || []) x.dispose?.(); for (const m of g.userData.mats || []) m.dispose?.(); if (g.userData.sign) disposeMat(g.userData.sign.material); g.removeFromParent(); pieces.delete(id); pops.delete(id); }

  /** apply the synced state. Returns the ids that were added since the last call (the module plays the burst / sound). */
  function sync(s) {
    st = s; const added = [], set = new Set(s.b); built = set; snap.rb = s.rb;
    drops = C.PIECES.filter((p) => p.kind === 'drop' && set.has(p.id)); gates = C.PIECES.filter((p) => p.kind === 'gate' && set.has(p.id));
    for (const id of s.b) if (!pieces.has(id)) { addPiece(id, !first); if (!first) added.push(id); }
    for (const id of [...pieces.keys()]) if (!set.has(id)) delPiece(id);
    first = false;
    collector.visible = set.has('claim');
    if (!set.has('claim') && !trail) { trail = buildTrail(); root.add(trail); trailFade = -1; }
    else if (set.has('claim') && trail && trailFade < 0) trailFade = 1;
    const sign = pieces.get('roof')?.userData.sign;
    if (sign && signRb !== s.rb) { disposeMat(sign.material); sign.material = signMat(s.rb); signRb = s.rb; }
    return added;
  }
  function setSnap(o) { snap = { ...snap, ...o }; }

  function syncPads(cr, ready) {
    const av = st ? C.available(st, 3) : [], reclaimOn = st ? C.canReclaim(st) : false;
    const sig = `${av.map((p) => p.id + (cr >= C.priceOf(st, p) ? 1 : 0)).join(',')}|${reclaimOn ? (cr >= C.reclaimCost(st.rb) ? 'R1' : 'R0') : ''}|${ready}`;
    if (sig === padSig) return; padSig = sig;
    for (const v of pads.values()) { for (const g of v.grp.userData.geos) g.dispose(); for (const m of v.grp.userData.mats) m.dispose(); v.grp.removeFromParent(); }
    pads.clear();
    if (!ready) return;
    const mk = (id, x, z, cost, name, kind) => {
      const afford = cr >= cost, col = afford ? 0x50ff80 : 0xffc040, grp = buildPad(kind === 'reclaim' ? (afford ? 0xd79bff : 0x9a70c0) : col);
      grp.position.set(x, 0, z);
      const lb = labelSprite(cost > 0 ? `${name}  ▮${cost}` : name, { color: afford ? '#9dffb4' : '#ffd070', scale: 2.3 }); lb.position.set(0, 1.9, 0); grp.add(lb); grp.userData.mats.push(lb.material);
      root.add(grp); pads.set(id, { grp, id, x, z, afford, cost });
    };
    for (const p of av) mk(p.id, C.padOf(p)[0], C.padOf(p)[1], C.priceOf(st, p), t(p.name), 'buy');
    if (reclaimOn) mk('reclaim', C.RECLAIM_PAD[0], C.RECLAIM_PAD[1], C.reclaimCost(st.rb), t('Re-Claim'), 'reclaim');
  }
  /** the pad the player stands on (within DWELL_R), collector included */
  function padAt(x, z) {
    for (const v of pads.values()) if (Math.hypot(x - v.x, z - v.z) < C.DWELL_R) return v;
    if (collector.visible && Math.hypot(x - C.COLLECTOR.x, z - C.COLLECTOR.z) < C.DWELL_R) return { id: 'collect', x: C.COLLECTOR.x, z: C.COLLECTOR.z, afford: true, grp: collector };
    return null;
  }

  function paintBoard() {
    const cap = snap.c, pc = cap * C.TY.pileMul, full = cap > 0 && snap.p >= pc - 0.5, capped = cap > 0 && snap.g >= cap - 0.05;
    const line1 = `▮ ${Math.floor(snap.p)}/${Math.floor(pc)} · ${Math.round(snap.r * 60)}/${t('min')}`, line2 = `${t('TODAY')} ${Math.floor(snap.g)}/${Math.floor(cap)}`;
    const chip = full ? t('POT FULL') : capped ? t('DAILY LIMIT: fly a run') : '';
    board.visible = built.has('claim') && boardKey !== '';
    const key = `${line1}|${line2}|${chip}`; if (key === boardKey) return; boardKey = key; board.visible = built.has('claim');
    const old = board.material.map, mat = board.material;
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 100; const g = cv.getContext('2d');
    g.fillStyle = '#100c14'; g.fillRect(0, 0, 256, 100); g.strokeStyle = '#ffd23f'; g.lineWidth = 3; g.strokeRect(2, 2, 252, 96);
    g.fillStyle = '#ffe9a8'; g.font = 'bold 26px monospace'; g.textAlign = 'center'; g.fillText(line1, 128, 32); g.font = 'bold 20px monospace'; g.fillStyle = '#9dffb4'; g.fillText(line2, 128, 60);
    if (chip) { g.fillStyle = full ? '#ff6a4a' : '#ffd070'; g.font = 'bold 17px monospace'; g.fillText(chip, 128, 88); }
    const tx = new THREE.CanvasTexture(cv); tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false; tx.colorSpace = THREE.SRGBColorSpace;
    mat.map = tx; mat.needsUpdate = true; old?.dispose();
  }
  function cubeColor(x, i, time, rb) {
    let col = SCRAP_COL, tier = 0;
    for (const g of gates) if (x > g.at[0]) tier = Math.max(tier, g.tier);
    if (tier) col = GATE_COL[tier];
    _c.set(col);
    if (rb === 1) _c.lerp(_c2.set(IT_COLOR[4]), 0.4);
    else if (rb === 2) _c.multiplyScalar(0.8 + 0.5 * Math.abs(Math.sin(time * 3 + i)));
    else if (rb >= 3) _c.setHSL(((x + time * 2) * 0.06) % 1, 0.9, 0.6);
    return _c;
  }
  function updateCubes(dt, time) {
    const rb = snap.rb, spd = (C.BELT.x1 - C.BELT.x0) / BELT_SECS * C.beltSpeedMul(rb), producing = built.has('belt') && snap.c > 0 && snap.g < snap.c - 0.05 && snap.p < snap.c * C.TY.pileMul - 0.5;
    const period = CUBE_PERIOD / C.beltSpeedMul(rb);
    for (let k = 0; k < drops.length; k++) {
      emitT[k] += dt;
      if (emitT[k] >= period) { emitT[k] = 0; if (producing) { const cb = cubes.find((c) => !c.on); if (cb) { cb.on = true; cb.x = drops[k].at[0]; cb.z = C.BELT.z + (k - 1) * 0.16; cb.d = k; } } }
    }
    let n = 0;
    for (const cb of cubes) {
      if (!cb.on) continue;
      cb.x += spd * dt;
      if (cb.x >= C.BELT.x1) { cb.on = false; continue; }
      _m.compose(_p.set(cb.x, 0.96, cb.z), _q.identity(), _s); cubesMesh.setMatrixAt(n, _m); cubesMesh.setColorAt(n, cubeColor(cb.x, n, time, rb)); n++;
    }
    cubesMesh.count = n; cubesMesh.instanceMatrix.needsUpdate = true; if (cubesMesh.instanceColor) cubesMesh.instanceColor.needsUpdate = true;
    for (let k = 0; k < drops.length; k++) { const lp = pieces.get(drops[k].id)?.userData.lamp; if (lp) lp.material.color.setHex(producing ? 0x40e070 : 0xff3a2a); }
  }
  function updatePile() {
    const pc = snap.c * C.TY.pileMul, n = pc > 0 && snap.p >= 1 ? Math.max(1, Math.ceil(MAX_PILE * Math.min(1, snap.p / pc))) : 0;
    if (n === pileN) return; pileN = n;
    for (let i = 0; i < n; i++) {
      const lv = Math.floor(i / 6), j = i % 6, x = C.BELT.x1 - 0.25 + (j % 3) * 0.24, z = C.BELT.z - 0.24 + Math.floor(j / 3) * 0.24 - lv * 0.02;
      _m.compose(_p.set(x, 0.66 + lv * 0.21, z), _q.identity(), _s); pileMesh.setMatrixAt(i, _m); pileMesh.setColorAt(i, _c.set(lv % 2 ? 0xffb02a : 0xffd23f));
    }
    pileMesh.count = n; pileMesh.instanceMatrix.needsUpdate = true; if (pileMesh.instanceColor) pileMesh.instanceColor.needsUpdate = true;
  }
  function updatePlaques(pp) {
    if (!st) return;
    const near = [];
    for (const [id, name] of Object.entries(st.who)) {
      const p = C.PIECE[id], pl = plaques.get(id); if (!p || !pieces.has(id)) continue;
      const x = p.id === 'found' || p.id === 'roof' ? C.LODGE.x0 + 1.4 : p.at[0], z = p.id === 'found' || p.id === 'roof' ? C.LODGE.z0 - 0.3 : p.at[1], d = pp ? Math.hypot(pp.x - x, pp.z - z) : 99;
      if (!pl || pl.name !== name) { pl?.sp.removeFromParent(); pl?.sp.material.dispose(); const sp = labelSprite(name, { color: '#cfd6de', scale: 1.05, w: 256, h: 40 }); root.add(sp); plaques.set(id, { sp, name, x, z, d }); }
      const q = plaques.get(id); q.d = d; q.x = x; q.z = z; near.push(q);
    }
    for (const [id, q] of [...plaques]) if (!st.who[id]) { q.sp.removeFromParent(); q.sp.material.dispose(); plaques.delete(id); }
    near.sort((a, b) => a.d - b.d);
    near.forEach((q, i) => { const on = i < PLAQUE_MAX && q.d < PLAQUE_R; q.sp.visible = on; if (on) q.sp.position.set(q.x, 0.45, q.z); });
  }
  function animate(dt, time) {
    for (const [id, pop] of [...pops]) {
      pop.t += dt; const dur = pop.kind === 'rise' ? 0.8 : 0.55, k = easeOutBack(pop.t / dur), g = pop.grp;
      if (pop.kind === 'rise') g.scale.y = Math.max(0.01, k); else if (pop.kind === 'drop') g.position.y = 5 * (1 - Math.min(1, k)); else g.scale.setScalar(Math.max(0.01, k));
      if (pop.t >= dur) { g.scale.set(1, 1, 1); g.position.y = 0; pops.delete(id); }
    }
    const fl = pieces.get('hearth')?.userData.flame; if (fl) { fl.scale.set(1, 0.85 + 0.3 * Math.sin(time * 9) * Math.sin(time * 5.3), 1); fl.material.color.setHex(Math.sin(time * 11) > 0 ? 0xff7a20 : 0xffb030); }
    const arm = pieces.get('auto')?.userData.arm; if (arm) arm.rotation.y = snap.p >= 1 ? Math.sin(time * 1.6) * 0.6 : 0;
    const pad = collector; if (pad.visible) { pad.userData.arrow.position.y = 1.15 + Math.sin(time * 3) * 0.1; pad.userData.arrow.rotation.y += dt * 2; }
    for (const v of pads.values()) { const u = v.grp.userData; u.arrow.position.y = 1.15 + Math.sin(time * 3 + v.x) * 0.1; u.arrow.rotation.y += dt * 2; u.disc.material.opacity = 0.4 + 0.2 * Math.sin(time * 4); }
    if (trail) { if (trailFade >= 0) { trailFade -= dt; trail.material.opacity = Math.max(0, trailFade) * 0.8; if (trailFade <= 0) { for (const g of trail.userData.geos) g.dispose(); for (const m of trail.userData.mats) m.dispose(); trail.removeFromParent(); trail = null; trailFade = -1; } } else trail.material.opacity = 0.45 + 0.35 * Math.sin(time * 4); }
  }
  /** ctx = { pp (player pos or null), cr (credits), dt } - call only while on the homeworld */
  function update(dt, time, ctx = {}) {
    const pp = ctx.pp, far = pp && Math.hypot(pp.x - (C.PLOT.x0 + C.PLOT.x1) / 2, pp.z - (C.PLOT.z0 + C.PLOT.z1) / 2) > FAR;
    root.visible = !far; if (far) return;
    animate(dt, time); updateCubes(dt, time);
    slowT -= dt; if (slowT <= 0) { slowT = 0.2; syncPads(ctx.cr || 0, ctx.pads !== false); updatePile(); paintBoard(); updatePlaques(pp); }
  }
  const counts = { get cubes() { return cubesMesh.count; }, get pile() { return pileMesh.count; } };
  function dispose() {
    for (const id of [...pieces.keys()]) delPiece(id);
    for (const v of pads.values()) { for (const g of v.grp.userData.geos) g.dispose(); for (const m of v.grp.userData.mats) m.dispose(); }
    for (const q of plaques.values()) q.sp.material.dispose();
    if (trail) { for (const g of trail.userData.geos) g.dispose(); for (const m of trail.userData.mats) m.dispose(); }
    board.material.map?.dispose(); board.material.dispose();
    for (const o of own) o.dispose?.();
    cubesMesh.dispose?.(); pileMesh.dispose?.();
    pads.clear(); plaques.clear(); pops.clear(); root.removeFromParent();
  }
  return { root, sync, setSnap, update, padAt, dispose, pads, pieces, counts, get snap() { return snap; }, burstSpot: (id) => { const p = C.PIECE[id]; return p ? { x: id === 'found' || id === 'roof' ? (C.LODGE.x0 + C.LODGE.x1) / 2 : p.at[0], z: id === 'found' || id === 'roof' ? (C.LODGE.z0 + C.LODGE.z1) / 2 : p.at[1] } : null; } };
}
