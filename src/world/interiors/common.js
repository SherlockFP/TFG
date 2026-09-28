// Shared helpers for the interior theme modules (office / backrooms / serverfarm / sewer / hospital).
// Everything here is pure geometry math on the facility layout (see facility.js generateLayout):
// cell (x, z), edge direction d: 0 = +x, 1 = +z, 2 = -x, 3 = -z.
import * as THREE from 'three';

export const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
export const INWARD = [[-1, 0], [0, -1], [1, 0], [0, 1]];          // edge d -> back into the cell
export const WALL_ROT = [-Math.PI / 2, Math.PI, Math.PI / 2, 0];   // prop front (+Z) faces into the cell
export const SPECIAL_ROOMS = new Set(['entrance', 'vault', 'generator']);

/** Geometry helper bundle bound to one layout. */
export function layoutKit(L) {
  const C = L.cell, W = L.w, H = L.h;
  const wx = (x) => L.ox + x * C, wz = (z) => L.oz + z * C;
  const ek = (x, z, d) => L.edgeKey(x, z, d);
  const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
  const edgeBusy = (x, z, d) => { const k = ek(x, z, d); return L.open.has(k) || L.edgeInfo.has(k); };
  const cellHasDoorway = (x, z) => { for (let d = 0; d < 4; d++) if (L.edgeInfo.has(ek(x, z, d))) return true; return false; };
  const edgeCenter = (x, z, d) => (d === 0 ? [wx(x + 1), wz(z) + C / 2] : d === 2 ? [wx(x), wz(z) + C / 2] : d === 1 ? [wx(x) + C / 2, wz(z + 1)] : [wx(x) + C / 2, wz(z)]);
  const roomRect = (r) => ({ x0: wx(r.x), z0: wz(r.z), x1: wx(r.x + r.w), z1: wz(r.z + r.h) });
  const cellRect = (x, z) => ({ x0: wx(x), z0: wz(z), x1: wx(x + 1), z1: wz(z + 1) });
  const perimeter = (r) => {
    const out = [];
    for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], nz = z + DZ[d];
      if (nx >= r.x && nx < r.x + r.w && nz >= r.z && nz < r.z + r.h) continue;
      out.push({ x, z, d });
    }
    return out;
  };
  /** closed wall edges of a room that back onto solid rock (no neighbour cell) */
  const solidWalls = (r) => perimeter(r).filter((e) => {
    if (edgeBusy(e.x, e.z, e.d)) return false;
    const nx = e.x + DX[e.d], nz = e.z + DZ[e.d];
    return !(inb(nx, nz) && L.cells[L.idx(nx, nz)]);
  });
  /** world position on wall edge (x, z, d): `along` metres from the edge centre, `out` metres into the cell */
  const wallPoint = (x, z, d, along, out) => {
    const [ecx, ecz] = edgeCenter(x, z, d);
    const [ix, iz] = INWARD[d];
    const alongX = d === 1 || d === 3;
    return [ecx + ix * out + (alongX ? along : 0), ecz + iz * out + (alongX ? 0 : along)];
  };
  const roomDist = (r) => L.distOf[L.idx(r.cx, r.cz)];
  const straightAxis = (x, z) => {
    const o = (d) => L.open.has(ek(x, z, d));
    if (o(0) && o(2) && !edgeBusy(x, z, 1) && !edgeBusy(x, z, 3)) return 'x';
    if (o(1) && o(3) && !edgeBusy(x, z, 0) && !edgeBusy(x, z, 2)) return 'z';
    return null;
  };
  return { C, W, H, wx, wz, ek, inb, edgeBusy, cellHasDoorway, edgeCenter, roomRect, cellRect, perimeter, solidWalls, wallPoint, roomDist, straightAxis };
}

/** true when every nav sub-cell under the rect (plus pad) is plain walkable floor (walk === 1): not a
 *  wall, prop, stair footprint or a floor the set pieces reserved (walk === 2). */
export function navClear(nav, x0, z0, x1, z1, pad = 0.2) {
  const [gx0, gz0] = nav.toGrid(x0 - pad, z0 - pad), [gx1, gz1] = nav.toGrid(x1 + pad, z1 + pad);
  for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
    if (gx < 0 || gz < 0 || gx >= nav.w || gz >= nav.h || nav.walk[gz * nav.w + gx] !== 1) return false;
  }
  return true;
}

/** Recolour the lights a placed lamp prop emitted (they are the last n entries of `emitters`). */
export function tintLampLights(emitters, obj, color, flicker) {
  const n = obj?.userData?.lights?.length || 0;
  for (let k = 0; k < n; k++) {
    const e = emitters[emitters.length - n + k];
    if (!e) continue;
    if (color != null) e.color = color;
    if (flicker != null) e.flicker = flicker;
  }
}

/** Merged, owned geometry for a theme's decoration (disposed through the facility group traverse). */
export function buildMerged(gb, group, materialFor, name) {
  const built = gb.build(materialFor);
  if (built.children.length) {
    built.name = name;
    group.add(built);
  }
  return built;
}

/** Water / sludge surface plane (not merged: it is transparent) */
export function surfacePlane(group, levelMaterial, tex, rc, y, opts = {}) {
  const geo = new THREE.PlaneGeometry(rc.x1 - rc.x0, rc.z1 - rc.z0);
  geo.rotateX(-Math.PI / 2);
  geo.translate((rc.x0 + rc.x1) / 2, y, (rc.z0 + rc.z1) / 2);
  const uv = geo.attributes.uv;
  const P = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, P.getX(i) * (opts.uv ?? 0.3), P.getZ(i) * (opts.uv ?? 0.3));
  const mat = levelMaterial(tex, { transparent: true, opacity: opts.opacity ?? 0.8, color: opts.color ?? 0xffffff, emissive: opts.emissive ?? 0x000000 });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  m.userData.setPiece = true;
  group.add(m);
  return m;
}
