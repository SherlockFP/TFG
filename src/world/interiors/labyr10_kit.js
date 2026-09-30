// LABYR10 shared decorate helpers (Dead Mall + Funhouse): door lanes, wall panels, tilted boxes, placement guard. Merged geometry only (LabBuilder).
import * as THREE from 'three';
import { navClear } from './common.js';

const V = THREE.Vector3;

/** world rectangles [x0, z0, x1, z1] in front of every doorway / arch / exit: solids must stay out (doors are never blocked) */
export function doorLanes(L) {
  const C = L.cell, out = [];
  for (const inf of L.edgeInfo.values()) {
    const ex = L.ox + inf.cx * C, ez = L.oz + inf.cz * C, half = (inf.width || 2.6) / 2 + 0.5, reach = 2.7;
    out.push(inf.dir === 0 ? [ex - reach, ez - half, ex + reach, ez + half] : [ex - half, ez - reach, ex + half, ez + reach]);
  }
  return out;
}

/** placement guard: plain walkable floor (pad m around), and outside every door lane */
export function makeFree(ctx, lanes) {
  return (x0, z0, x1, z1, pad = 0.3) => navClear(ctx.nav, x0, z0, x1, z1, pad) && !lanes.some((l) => x1 + pad > l[0] && x0 - pad < l[2] && z1 + pad > l[1] && z0 - pad < l[3]);
}

/**
 * Flat panel on a wall plane (merged into the builder, no collider): centre (x, z) on the wall, bottom y, `n` = unit normal pointing into the room,
 * w x h metres, texture mapped 0..1 (u runs to the viewer's right). Use for signs, murals, grilles, mirrors.
 */
export function panel(B, key, x, y, z, nx, nz, w, h) {
  const ax = nz, az = -nx, hw = w / 2;
  const p0 = new V(x - ax * hw, y, z - az * hw), p1 = new V(x + ax * hw, y, z + az * hw);
  B.gb.quad(key, p0, p1, new V(p1.x, y + h, p1.z), new V(p0.x, y + h, p0.z), [[0, 0], [1, 0], [1, 1], [0, 1]]);
}

/** thin frame (4 bars) around a panel, same conventions as panel(); glow keys ('g:hex') make a neon tube */
export function frameBars(B, key, x, y, z, nx, nz, w, h, t = 0.07) {
  const ax = Math.abs(nz), az = Math.abs(nx);            // |along| components
  const put = (cx, cy, cz, lenAlong, hgt) => B.box(key, cx, cy, cz, ax ? lenAlong : t, hgt, az ? lenAlong : t);
  put(x, y, z, w + t, t); put(x, y + h, z, w + t, t);
  const hw = w / 2, sx = nz, sz = -nx;
  for (const s of [-1, 1]) put(x + sx * hw * s, y + h / 2, z + sz * hw * s, t, h);
}

const FACES = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];   // corner index quads (bit0 = +x, bit1 = +y, bit2 = +z)
/** box rolled about its own long axis (visual only): centre, size, yaw, roll in radians. Winding is fixed up per face from the outward direction. */
export function tiltBox(B, key, cx, cy, cz, sx, sy, sz, yaw, roll, uv = 0.6) {
  const m = new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationZ(roll));
  const P = [];
  for (let i = 0; i < 8; i++) P.push(new V(((i & 1) ? 0.5 : -0.5) * sx, ((i & 2) ? 0.5 : -0.5) * sy, ((i & 4) ? 0.5 : -0.5) * sz).applyMatrix4(m).add(new V(cx, cy, cz)));
  const mid = new V(cx, cy, cz);
  for (const f of FACES) {
    let q = f.map((i) => P[i]);
    const fc = q.reduce((a, p) => a.add(p.clone()), new V()).multiplyScalar(0.25);
    const n = new V().crossVectors(new V().subVectors(q[1], q[0]), new V().subVectors(q[3], q[0]));
    if (n.dot(fc.clone().sub(mid)) < 0) q = [q[0], q[3], q[2], q[1]];
    const lu = q[0].distanceTo(q[1]) * uv, lv = q[0].distanceTo(q[3]) * uv;      // uv = texture repeats per metre, like every other builder
    B.gb.quad(key, q[0], q[1], q[2], q[3], [[0, 0], [lu, 0], [lu, lv], [0, lv]]);
  }
}

/** iterate the closed, un-busy wall edges of a room: cb(x, z, d, nx, nz) with (nx, nz) the inward unit normal */
export function eachWall(K, L, r, cb) {
  const IN = [[-1, 0], [0, -1], [1, 0], [0, 1]];
  for (const e of K.perimeter(r)) if (!K.edgeBusy(e.x, e.z, e.d)) cb(e.x, e.z, e.d, IN[e.d][0], IN[e.d][1]);
}
