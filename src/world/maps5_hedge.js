// MAPS5 - the HEDGE MAZE of Estate 9: a 15 x 15 garden labyrinth (planHedge in game/maps5_core.js) standing on the estate lawn.
//   * every wall is a merged run (one collider box per straight run of hedge, one merged visual), dark foliage lumps along the top
//   * south entrance gate + far north exit gate (stone posts with lanterns), a 3 x 3 centre chamber with a pedestal (the prize), four
//     topiary statues (one of them is the Hedge Warden's resting pose) and stone benches, small lantern-lit pockets in far dead ends
//   * a low drifting mist sheet + a fog surge while you are inside (game/maps5.js)
// info (decor.info.hedge) = everything the runtime needs: frame, plan, world points of the prize / warden / gates / pockets.
import * as THREE from 'three';
import { HEDGE, wallLattice, cellCentre, toWorld, mazeRoute } from './mazegen.js';
import { buildRuns, mistSheets } from './maps5_kit.js';

export function buildHedge(C, S, site, plan, out) {
  const P = HEDGE.pitch, T = HEDGE.thick;
  const f = { x: site.x, z: site.z, rot: site.rot };
  S.frame(f.x, f.z, f.rot);
  const b0 = S.B.boxes;
  const base = site.lo - 0.7, top = site.hi + 2.7;
  const wp = (lx, lz) => { const [wx, wz] = toWorld(f, lx, lz); return { x: wx, y: C.h(wx, wz), z: wz }; };
  const lat = wallLattice(plan.cols, plan.rows, (a, b) => {
    const [i, j] = a < b ? [a, b] : [b, a];
    return (plan.g.open[i] & (1 << (j === i + 1 ? 0 : 1))) !== 0;
  }, [{ side: 'S', x: plan.entrance.x }, { side: 'N', x: plan.exit.x }], P);
  const R = S.B.R;
  buildRuns(S, lat.runs, () => ({ key: 'hedge', y0: base, h: top - base, T, color: [0.28 + R.float(0, 0.08), 0.5 + R.float(0, 0.1), 0.24 + R.float(0, 0.06)], tint: 0.95, uv: 0.32, bump: 1.7 }));
  const ox = (plan.cols * P) / 2, oz = (plan.rows * P) / 2;
  // ---- gate posts (stone, lantern cap)
  const gates = [];
  for (const [side, gx] of [['S', plan.entrance.x], ['N', plan.exit.x]]) {
    const z = side === 'S' ? oz : -oz;
    for (const sx of [-1, 1]) {
      const x = (gx + 0.5) * P - ox + sx * (P / 2 - 0.05);
      S.solid('marble', x, base, z, 0.95, top - base + 0.5, 0.95, { uv: 0.6, tint: 0.85 });
      S.vis('glow', x, top + 0.5, z, 0.42, 0.42, 0.42, { col: false, color: [1, 0.78, 0.35], bottom: false });
    }
    gates.push({ side, ...wp((gx + 0.5) * P - ox, z) });
  }
  C.emitters.push({ pos: new THREE.Vector3(gates[0].x, gates[0].y + 3.2, gates[0].z), color: 0xffc070, intensity: 0.7, distance: 12, flicker: 0.15, group: 'outdoor' });
  // ---- centre chamber: pedestal (the prize glows on its plate), topiary statues + benches
  const cl = cellCentre(plan.cols, plan.rows, P, plan.centreCell);
  const cc = wp(cl.x, cl.z), y0 = cc.y;
  S.solid('marble', cl.x, y0 - 0.2, cl.z, 1.5, 1.05, 1.5, { uv: 0.6, tint: 0.9 });
  S.solid('marble', cl.x, y0 + 0.85, cl.z, 1.2, 0.12, 1.2, { uv: 0.6, tint: 1.0 });
  S.vis('glow', cl.x, y0 + 0.97, cl.z, 0.5, 0.06, 0.5, { col: false, color: [0.5, 1, 0.75] });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) S.vis('glow', cl.x + sx * 0.7, y0 + 0.02, cl.z + sz * 0.7, 0.14, 0.05, 0.14, { col: false, color: [1, 0.85, 0.4] });
  const wardenIdx = R.int(0, 3);
  const statues = [[-3.3, -3.3], [3.3, -3.3], [-3.3, 3.3], [3.3, 3.3]].map(([dx, dz], k) => {
    const p = wp(cl.x + dx, cl.z + dz);
    if (k !== wardenIdx) {   // the warden's spot stays empty: the sleeping Hedge Warden creature IS that statue
      out.props.push({ id: 'm5:topiary' + (k % 3 || ''), x: p.x, y: p.y, z: p.z, ry: (k * Math.PI) / 2 + f.rot + Math.PI / 4 });
      S.col(cl.x + dx, p.y - 0.3, cl.z + dz, 1.0, 2.6, 1.0);
    }
    return p;
  });
  for (const [dx, dz, ang] of [[0, -4.1, 0], [0, 4.1, Math.PI]]) {
    const p = wp(cl.x + dx, cl.z + dz);
    out.props.push({ id: 'm5:bench', x: p.x, y: p.y, z: p.z, ry: ang + f.rot });
    S.col(cl.x + dx, p.y, cl.z + dz, 1.9, 0.9, 0.6);
  }
  // ---- pockets: lantern-lit dead ends with a small reward
  const pockets = plan.pockets.map((i) => {
    const c = cellCentre(plan.cols, plan.rows, P, i), p = wp(c.x, c.z);
    S.vis('glow', c.x, p.y + 0.02, c.z, 0.7, 0.04, 0.7, { col: false, color: [0.9, 0.75, 0.35] });
    return p;
  });
  const frame = { ...f };
  const mist = mistSheets(C, f.x, site.hi + 0.7, f.z, plan.cols * P + 12, { color: 0xc8d6c4, opacity: 0.22 });
  out.info.hedge = {
    frame, plan, pitch: P, thick: T, top, base, size: [plan.cols * P, plan.rows * P], colliders: S.B.boxes - b0,
    centre: cc, prize: { x: cc.x, y: y0 + 1.05, z: cc.z }, statues, wardenSpot: statues[wardenIdx], wardenIdx,
    gates, pockets, mist: mist.length, radius: Math.hypot(plan.cols, plan.rows) * P / 2,
    route: (fromXZ, toXZ) => mazeRoute(frame, plan, P, fromXZ, toXZ),
  };
}
