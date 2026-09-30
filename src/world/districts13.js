import { GeoBuilder, levelMaterial } from './geobuilder.js';
import { LabBuilder } from './interiors/lab_kit.js';
/** Capped, merged return arrows. Breadth-first route uses OPEN edges and excludes locked/vault doors. */
export function districtRoutes(L) {
  const source = L.idx(L.entrance.room.cx, L.entrance.room.cz), distance = new Int32Array(L.w * L.h).fill(-1), queue = [source];
  distance[source] = 0;
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const linked = (x, z, d) => {
    const [dx, dz] = dirs[d], nx = x + dx, nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= L.w || nz >= L.h || !L.cells[L.idx(nx, nz)]) return -1;
    const edge = L.edgeKey(x, z, d), door = L.edgeInfo.get(edge);
    if (!L.open.has(edge) || door?.locked || ['vault', 'contain'].includes(door?.type)) return -1;
    return L.idx(nx, nz);
  };
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k], x = i % L.w, z = Math.floor(i / L.w);
    for (let d = 0; d < 4; d++) { const n = linked(x, z, d); if (n >= 0 && distance[n] < 0) { distance[n] = distance[i] + 1; queue.push(n); } }
  }
  return { distance, queue, linked, dirs };
}
export function dressDistrictReturn(fac) {
  const L = fac?.layout;
  if (!L || !fac.group || fac.group.getObjectByName('district13-return')) return null;
  const { distance, queue, linked, dirs } = districtRoutes(L);
  const B = new LabBuilder({ Y: L.y, group: fac.group, GeoBuilder, levelMaterial });
  // Thin inlaid arrows have no collider, no light and one merged unlit material.
  let count = 0;
  for (const i of queue) {
    if (count >= 72) break;
    if (distance[i] < 2 || (distance[i] % 3 !== 0 && L.cells[i] !== 2)) continue;
    const x = i % L.w, z = Math.floor(i / L.w), d = dirs.findIndex((_, d) => { const n = linked(x, z, d); return n >= 0 && distance[n] === distance[i] - 1; });
    if (d < 0) continue;
    const cx = L.ox + (x + 0.5) * L.cell, cz = L.oz + (z + 0.5) * L.cell, angle = -d * Math.PI / 2;
    for (const side of [-1, 1]) B.rbox('g:669b88', cx - dirs[d][0] * 0.1 + dirs[(d + 1) % 4][0] * side * 0.18, B.Y + 0.018, cz - dirs[d][1] * 0.1 + dirs[(d + 1) % 4][1] * side * 0.18, 0.55, 0.014, 0.065, angle + side * Math.PI / 4);
    count++;
  }
  B.build('district13-return'); return { count, distance };
}
