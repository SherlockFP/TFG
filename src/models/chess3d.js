// CHESS3D piece set (module `chess3d`): procedural lathe pieces (pawn / rook / knight / bishop / queen / king) and dama men / kings, two team materials,
// one InstancedMesh per (type, colour): <= 12 draw calls for a chess position, 4 for dama. Plus 3 tiny InstancedMesh overlays (squares, discs, rings) for the
// last move, the selection, legal targets and the check ring. No scene lights: Lambert + emissive tint for pieces, additive MeshBasic for the glow marks.
//   const set = createPieceSet();  table.add(set.group)
//   set.setPieces(list, { animate })   list = piecesOf() from game/chess3d_map.js; animates moved pieces (hop + slide), castling moves both
//   set.setMarks({ last, check, sel, hover, tgt: [[sq, cap]] })  merge into the overlay state
//   set.hold(sq, x, z) / set.release() / set.settle(from, to)     drag support (table-local x, z)
//   set.tick(dt) -> bool (still animating)   set.stats() -> { keys, instances, drawCalls }   set.dispose()
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SQ, TOP_Y, sqToLocal, diffMoves } from '../game/chess3d_map.js';

const CAP = 16;
const P2 = (...a) => { const o = []; for (let i = 0; i < a.length; i += 2) o.push(new THREE.Vector2(a[i], a[i + 1])); return o; };
const lathe = (pts, seg = 14) => new THREE.LatheGeometry(pts, seg).toNonIndexed();
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
const M = (parts) => mergeGeometries(parts);

let GEO = null;
/** shared piece geometries (origin = base centre on the board, +y up, ~0.1 m tall for a king) */
export function pieceGeometries() {
  if (GEO) return GEO;
  const base = [0, 0, 0.033, 0, 0.035, 0.005, 0.031, 0.011];
  GEO = {
    p: lathe(P2(...base, 0.02, 0.016, 0.012, 0.028, 0.013, 0.036, 0.021, 0.039, 0.02, 0.044, 0.018, 0.052, 0.012, 0.058, 0.004, 0.061, 0, 0.062)),
    r: lathe(P2(...base, 0.022, 0.018, 0.02, 0.05, 0.028, 0.056, 0.03, 0.06, 0.03, 0.072, 0.022, 0.072, 0.022, 0.066, 0, 0.066), 12),
    b: lathe(P2(...base, 0.018, 0.02, 0.012, 0.04, 0.02, 0.046, 0.022, 0.056, 0.018, 0.07, 0.01, 0.082, 0.004, 0.09, 0.008, 0.093, 0.006, 0.098, 0, 0.099)),
    q: lathe(P2(...base, 0.022, 0.02, 0.014, 0.05, 0.026, 0.06, 0.03, 0.07, 0.022, 0.082, 0.016, 0.086, 0.016, 0.092, 0.01, 0.098, 0.004, 0.101, 0, 0.102)),
    k: M([lathe(P2(...base, 0.024, 0.02, 0.015, 0.05, 0.028, 0.06, 0.028, 0.07, 0.02, 0.08, 0.014, 0.084, 0, 0.084)), box(0.01, 0.036, 0.01, 0, 0.101, 0), box(0.03, 0.01, 0.01, 0, 0.106, 0)]),
    // knight looks toward +z in its own frame (White gets a half turn so it faces the opponent)
    n: M([
      lathe(P2(...base, 0.024, 0.02, 0.02, 0.034, 0, 0.036)),
      new THREE.BoxGeometry(0.024, 0.05, 0.034).rotateX(-0.25).translate(0, 0.058, -0.002).toNonIndexed(),
      new THREE.BoxGeometry(0.02, 0.022, 0.032).rotateX(0.35).translate(0, 0.072, 0.03).toNonIndexed(),
      box(0.006, 0.014, 0.008, -0.007, 0.092, -0.012), box(0.006, 0.014, 0.008, 0.007, 0.092, -0.012),
    ]),
    man: lathe(P2(0, 0, 0.038, 0, 0.04, 0.004, 0.04, 0.016, 0.036, 0.02, 0.026, 0.02, 0.026, 0.017, 0, 0.017)),
    king: M([lathe(P2(0, 0, 0.038, 0, 0.04, 0.004, 0.04, 0.016, 0.036, 0.02, 0, 0.02)), lathe(P2(0, 0.02, 0.038, 0.02, 0.04, 0.024, 0.04, 0.036, 0.036, 0.04, 0.026, 0.04, 0.026, 0.037, 0.014, 0.038, 0.014, 0.046, 0.008, 0.052, 0, 0.054))]),
  };
  return GEO;
}
export const PIECE_KEYS = ['p', 'n', 'b', 'r', 'q', 'k', 'man', 'king'];

const easeOut = (u) => 1 - (1 - u) * (1 - u);
const COL = { last: 0x7a6410, sel: 0x1b8fd0, hover: 0x2a2a2a, tgt: 0x33ff77, cap: 0xff3b30, check: 0xff2a20 };

export function createPieceSet() {
  const group = new THREE.Group();
  group.name = 'chess3d_pieces';
  group.position.y = TOP_Y + 0.003;
  const mats = {
    w: new THREE.MeshLambertMaterial({ color: 0xece0c8, emissive: 0x2a241a }),
    b: new THREE.MeshLambertMaterial({ color: 0x2b1f18, emissive: 0x0d0805 }),
  };
  const meshes = new Map();   // key -> InstancedMesh
  const G = pieceGeometries();
  const meshFor = (t, c) => {
    const k = t + '_' + c;
    let m = meshes.get(k);
    if (!m) {
      m = new THREE.InstancedMesh(G[t], mats[c], CAP);
      m.count = 0; m.frustumCulled = false; m.name = 'pc_' + k;
      group.add(m); meshes.set(k, m);
    }
    return m;
  };
  let items = [];                       // { t, c, sq, x, z, rot, anim }
  let held = null, settleS = null;      // drag: { sq, x, z }; settle: { from, to, until }
  let clock = 0, wasBusy = false;
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);

  function flush() {
    const n = new Map();
    for (const it of items) {
      const m = meshFor(it.t, it.c), i = n.get(m) || 0;
      if (i >= CAP) continue;
      n.set(m, i + 1);
      let x = it.x, z = it.z, y = 0;
      if (it.anim) { const u = easeOut(Math.min(1, it.anim.el / it.anim.dur)); x = it.anim.fx + (it.x - it.anim.fx) * u; z = it.anim.fz + (it.z - it.anim.fz) * u; y = 0.05 * Math.sin(Math.PI * u); }
      if (held && held.sq === it.sq) { x = held.x; z = held.z; y = 0.045; }
      else if (settleS && settleS.from === it.sq) { const l = sqToLocal(settleS.to); x = l.x; z = l.z; }
      tmpQ.setFromAxisAngle(up, it.rot);
      m.setMatrixAt(i, tmpM.compose(tmpP.set(x, y, z), tmpQ, one));
    }
    for (const m of meshes.values()) { m.count = n.get(m) || 0; m.instanceMatrix.needsUpdate = true; m.visible = m.count > 0; }
  }

  function setPieces(list, o = {}) {
    const prev = items.map((i) => ({ sq: i.sq, t: i.t, c: i.c }));
    let mv = o.animate && prev.length ? diffMoves(prev, list) : [];
    if (mv.length > 3) mv = [];
    const st = settleS;
    items = list.map((p) => {
      const l = sqToLocal(p.sq);
      const it = { t: p.t, c: p.c, sq: p.sq, x: l.x, z: l.z, rot: p.t === 'n' ? (p.c === 'w' ? Math.PI : 0) : 0, anim: null };
      const m = mv.find((q) => q.to === p.sq && q.t === p.t && q.c === p.c);
      if (m && !(st && st.to === p.sq)) {
        const f = sqToLocal(m.from), d = Math.hypot(f.x - l.x, f.z - l.z);
        it.anim = { fx: f.x, fz: f.z, el: 0, dur: 0.22 + Math.min(0.4, d * 0.9) };
      }
      return it;
    });
    held = null; settleS = null;
    flush();
  }

  // ---- overlay marks
  const mk = { last: null, check: -1, sel: -1, hover: -1, tgt: [] };
  const flat = (g) => g.rotateX(-Math.PI / 2);
  const glow = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const overlay = (geo, cap, y) => { const m = new THREE.InstancedMesh(geo, glow(), cap); m.count = 0; m.frustumCulled = false; m.position.y = y; m.renderOrder = 2; group.add(m); return m; };
  const sqs = overlay(flat(new THREE.PlaneGeometry(SQ * 0.98, SQ * 0.98)), 8, 0.0012);
  const discs = overlay(flat(new THREE.CircleGeometry(0.014, 16)), 40, 0.0016);
  const rings = overlay(flat(new THREE.RingGeometry(0.036, 0.046, 28)), 48, 0.002);
  const c = new THREE.Color(), sc = new THREE.Vector3();
  const put = (m, sq, color, k = 1, scale = 1) => {
    const i = m.count++, l = sqToLocal(sq);
    m.setMatrixAt(i, tmpM.compose(tmpP.set(l.x, 0, l.z), tmpQ.identity(), sc.set(scale, 1, scale)));
    m.setColorAt(i, c.set(color).multiplyScalar(k));
  };
  function flushMarks() {
    sqs.count = discs.count = rings.count = 0;
    if (mk.last) for (const s of mk.last) put(sqs, s, COL.last);
    if (mk.sel >= 0) put(sqs, mk.sel, COL.sel);
    if (mk.hover >= 0 && mk.hover !== mk.sel) put(sqs, mk.hover, COL.hover);
    for (const [s, cap] of mk.tgt) { if (cap && rings.count < 48) put(rings, s, COL.cap); else if (discs.count < 40) put(discs, s, COL.tgt); }
    if (mk.check >= 0) put(rings, mk.check, COL.check, 0.7 + 0.3 * Math.sin(clock * 5), 1.12);
    for (const m of [sqs, discs, rings]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.visible = m.count > 0; }
  }
  function setMarks(o) { Object.assign(mk, o); flushMarks(); }

  function tick(dt) {
    clock += dt;
    let busy = false;
    for (const it of items) if (it.anim) { it.anim.el += dt; if (it.anim.el >= it.anim.dur) it.anim = null; else busy = true; }
    if (settleS && clock > settleS.until) { settleS = null; busy = true; }
    if (held || settleS) busy = true;
    if (busy || wasBusy) flush();
    wasBusy = busy;
    if (mk.check >= 0) flushMarks();
    return busy;
  }

  return {
    group, setPieces, setMarks, tick,
    marks: mk,
    hold(sq, x, z) { held = { sq, x, z }; flush(); },
    release() { if (held) { held = null; flush(); } },
    settle(from, to) { held = null; settleS = { from, to, until: clock + 1.5 }; flush(); },
    animating: () => items.some((i) => i.anim) || !!held || !!settleS,
    stats() {
      let inst = 0, calls = 0;
      for (const m of meshes.values()) if (m.visible && m.count > 0) { inst += m.count; calls++; }
      for (const m of [sqs, discs, rings]) if (m.visible && m.count > 0) calls++;
      return { keys: [...meshes.entries()].filter(([, m]) => m.count > 0).map(([k]) => k), instances: inst, drawCalls: calls };
    },
    dispose() {
      for (const m of meshes.values()) m.dispose();
      for (const m of [sqs, discs, rings]) { m.geometry.dispose(); m.material.dispose(); m.dispose(); }
      mats.w.dispose(); mats.b.dispose();
      group.removeFromParent();
    },
  };
}
