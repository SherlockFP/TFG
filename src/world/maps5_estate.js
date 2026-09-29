// MAPS5 - ESTATE 9 decor (biome `m5estate`, decor kind 'm5estate'): overgrown mansion grounds of a dead influencer estate.
//   * HEDGE MAZE (maps5_hedge.js): 15 x 15 garden labyrinth, fog sheet, centre chamber prize, the Hedge Warden sleeps in the topiary
//   * PAPER ARCHIVE (maps5_archive.js): roofed two-level shelf labyrinth with a ladder and railed bridges, the Master Ledger on island B
//   * two fountains, a topiary walk with benches, glowing garden lanterns; a low pollen drift comes from the biome fx ('spores')
// decor.info = { kind:'m5estate', hedge, archive, zones[], loot[{x,y,z,kind}], prizes[{x,y,z,item}], counts }  (used by game/maps5.js)
import { RNG } from '../core/rng.js';
import { planHedge, planArchive, HEDGE, ARCHIVE, siteSeed } from '../game/maps5_core.js';
import { registerDecor, DECOR_HELPERS } from './outdoor_biomes.js';
import { makeBuilder, flush, findSite, placeProps, guard, TAU } from './maps5_kit.js';
import { buildHedge } from './maps5_hedge.js';
import { buildArchive } from './maps5_archive.js';
import * as THREE from 'three';

const { instanced } = DECOR_HELPERS;

export function buildEstate(C) {
  const { R, terrain, sc } = C;
  const { gb, B, S } = makeBuilder(C, 0xe57a7e);
  const info = C.info;
  const out = { props: [], info, boxes: 0 };
  Object.assign(info, { kind: 'm5estate', loot: [], prizes: [], zones: [], counts: {} });
  const taken = [];
  const claim = (s, r) => { taken.push({ x: s.x, z: s.z, r }); C.reserve?.(s.x, s.z, r); };
  const mapSeed = C.seed | 0;

  // ---- hedge maze
  const hedgeR = Math.hypot(HEDGE.cols, HEDGE.rows) * HEDGE.pitch / 2 + 4;
  const hs = findSite(C, taken, hedgeR, 3.4);
  if (hs) {
    hs.rot = R.float(0, TAU);
    claim(hs, hedgeR);
    const plan = planHedge(siteSeed(mapSeed, 'hedge'));
    try { buildHedge(C, S, hs, plan, out); } catch (e) { console.warn('m5 hedge', e); }
    const h = info.hedge;
    if (h) {
      info.zones.push({ id: 'hedge', x: hs.x, z: hs.z, contains: (x, z) => Math.hypot(x - hs.x, z - hs.z) < h.radius + 1.5, fog: 1.7 });
      info.prizes.push({ ...h.prize, item: 'm5_heart', zone: 'hedge' });
      for (const p of h.pockets) info.loot.push({ x: p.x, y: p.y + 0.4, z: p.z, kind: 'pocket' });
      if (C.scrapSpots.length < 2) C.scrapSpots.push({ x: h.gates[0].x, z: h.gates[0].z });
    }
  }
  // ---- paper archive
  const archR = Math.hypot(ARCHIVE.cols, ARCHIVE.rows) * ARCHIVE.pitch / 2 + 4;
  const as = findSite(C, taken, archR, 2.2);
  if (as) {
    as.rot = R.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    claim(as, archR);
    const plan = planArchive(siteSeed(mapSeed, 'archive'));
    try { buildArchive(C, S, as, plan, out); } catch (e) { console.warn('m5 archive', e); }
    const a = info.archive;
    if (a) {
      info.zones.push({ id: 'archive', x: as.x, z: as.z, contains: (x, z, y) => a.contains(x, z, y), fog: 3.0, dark: 0.35 });
      info.prizes.push({ ...a.prize, item: 'm5_ledger', zone: 'archive' });
      for (const l of a.loot) info.loot.push({ ...l, y: l.y + 0.4 });
      if (C.scrapSpots.length < 2) C.scrapSpots.push({ x: a.gates[0].x, z: a.gates[0].z });
    }
  }
  // ---- fountains (plaza with two benches), topiary walk
  const nF = 2;
  for (let i = 0; i < nF; i++) {
    const s = findSite(C, taken, 7, 1.4, 250);
    if (!s) continue;
    claim(s, 7);
    out.props.push({ id: 'm5:fountain', x: s.x, y: s.y0, z: s.z, ry: R.float(0, TAU) });
    const a0 = R.float(0, TAU);
    for (const k of [0, 1]) out.props.push({ id: 'm5:bench', x: s.x + Math.cos(a0 + k * Math.PI) * 4.4, y: s.y0, z: s.z + Math.sin(a0 + k * Math.PI) * 4.4, ry: -(a0 + k * Math.PI) - Math.PI / 2 });
    if (i === 0 && C.scrapSpots.length < 2) C.scrapSpots.push({ x: s.x + 3, z: s.z + 3 });
    info.loot.push({ x: s.x + 2.6, y: s.y0 + 0.4, z: s.z - 2.6, kind: 'fountain' });
  }
  for (let w = 0; w < 2 + (sc > 1.15 ? 1 : 0); w++) {
    const s = findSite(C, taken, 15, 2.2, 250);
    if (!s) continue;
    claim(s, 15);
    const a0 = R.float(0, TAU), ca = Math.cos(a0), sa = Math.sin(a0);
    for (let i = -3; i <= 3; i++) for (const side of [-1, 1]) {
      const x = s.x + ca * i * 3.6 - sa * side * 3.2, z = s.z + sa * i * 3.6 + ca * side * 3.2;
      out.props.push({ id: 'm5:topiary' + (R.pick([0, 1, 2]) || ''), x, y: C.h(x, z) - 0.05, z, ry: R.float(0, TAU) });
    }
    const [bx, bz] = [s.x + ca * 11.5, s.z + sa * 11.5];
    if (!C.avoid(bx, bz, 1)) out.props.push({ id: 'm5:bench', x: bx, y: C.h(bx, bz), z: bz, ry: -a0 + Math.PI / 2 });
  }
  // glowing garden lanterns along the entrance path (instanced emissive boxes, no lights)
  const lam = [];
  const P = terrain.pathPts || [];
  for (let k = 2; k < P.length - 1; k += 3) {
    const q = P[k], nx = (P[k + 1].x - P[k].x), nz = (P[k + 1].z - P[k].z), l = Math.hypot(nx, nz) || 1;
    for (const side of [-1, 1]) { const x = q.x - (nz / l) * 3.4 * side, z = q.z + (nx / l) * 3.4 * side; if (Math.hypot(x, z) > 16) lam.push({ x, y: C.h(x, z) + 1.0, z, sx: 0.28, sy: 0.4, sz: 0.28 }); }
  }
  instanced(C, new THREE.BoxGeometry(1, 1, 1), C.mat(new THREE.MeshBasicMaterial({ color: 0xffc46a })), lam);
  // ---- flush
  out.boxes += placeProps(C, out.props);
  const mesh = flush(C, gb, B);
  info.drawCalls = mesh.children.length;
  info.counts = { colliders: B.boxes + out.boxes, props: out.props.length, loot: info.loot.length, lanterns: lam.length, merged: mesh.children.length, tris: countTris(mesh) };
  void RNG; void guard;
}

function countTris(mesh) { let n = 0; mesh.traverse((o) => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return Math.round(n); }

registerDecor('m5estate', buildEstate);
export { countTris };
