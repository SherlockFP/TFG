// PRACTICALS (wave 8 QA night 1): cheap emissive "practical lights" so a facility reads without a torch. NO scene lights (the light count stays constant): one merged
// MeshBasic mesh per facility = exit signs (entrance + hub), a ceiling strip in every room, dim strips in the corridor cells the real lamps skip.
// Pure geometry + deterministic (no RNG; positions come from the layout), so every peer builds the same thing. Dark-corridor cells stay dark (they are a set piece).
import * as THREE from 'three';
import { getBasicMaterial } from '../../render/textures.js';
import { layoutKit } from './common.js';

const box = (w, h, d, x, y, z, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };
const scale = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); };

/** ctx = { layout, group, Y, darkCells, def } ; returns { mesh, count } (mesh is added to ctx.group) */
export function addPracticals(ctx) {
  const L = ctx.layout, K = layoutKit(L), Y = ctx.Y, C = K.C, def = ctx.def || {};
  const tint = def.lampColor ?? def.lamps?.color ?? 0xffe6c0;
  const corridorH = L.corridorH || 3.2;
  const strips = [], exits = [];
  for (const r of L.rooms) {
    const rc = K.roomRect(r), cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2, h = r.height || corridorH;
    if (r.type === 'entrance' || r.hub) exits.push(box(0.62, 0.2, 0.06, cx, Y + h - 0.35, cz, 0), box(0.06, 0.2, 0.62, cx, Y + h - 0.35, cz, 0));   // readable from every side
    if (r.w * r.h < 4 || r.type === 'nest') continue;
    const along = r.w >= r.h;
    strips.push(box(along ? Math.min(3.2, r.w * C * 0.45) : 0.16, 0.05, along ? 0.16 : Math.min(3.2, r.h * C * 0.45), cx, Y + h - 0.04, cz));
  }
  for (let z = 0; z < L.h; z++) for (let x = 0; x < L.w; x++) {
    const i = L.idx(x, z);
    if (L.cells[i] !== 2 || ctx.darkCells?.has?.(i) || (x + z * 2) % 5 !== 1) continue;
    const ew = L.open.has(L.edgeKey(x, z, 0)) || L.open.has(L.edgeKey(x, z, 2));
    strips.push(box(ew ? 1.6 : 0.12, 0.04, ew ? 0.12 : 1.6, K.wx(x) + C / 2, Y + corridorH - 0.03, K.wz(z) + C / 2));
  }
  const group = new THREE.Group(); group.name = 'practicals';
  const mk = (geos, color) => {
    if (!geos.length) return;
    const pos = [], idx = []; let base = 0;
    for (const g of geos) {
      const p = g.attributes.position, ix = g.index;
      for (let k = 0; k < p.count; k++) pos.push(p.getX(k), p.getY(k), p.getZ(k));
      for (let k = 0; k < ix.count; k++) idx.push(ix.getX(k) + base);
      base += p.count; g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, getBasicMaterial(null, color));
    m.frustumCulled = false; m.matrixAutoUpdate = false; m.userData.noMerge = true; group.add(m);
  };
  mk(strips, scale(tint, 0.55));
  mk(exits, 0x2cff78);
  ctx.group.add(group);
  return { group, count: strips.length + exits.length / 2 };
}
