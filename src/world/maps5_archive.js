// MAPS5 - the PAPER ARCHIVE of Estate 9: a roofed two-level shelf labyrinth (planArchive in game/maps5_core.js).
//   * level 0: a full maze of 3.25 m book stacks (merged wall runs), entrance door south, exit door north
//   * level 1 (3.6 m up): two deck ISLANDS of low stacks joined only by narrow railed BRIDGES over the gap column. One LADDER (a climb volume in
//     game/maps5.js) leads from level 0 to a dead-end cell of island A; island B (the Master Ledger, the reward) can only be entered over a bridge
//   * ladder hole: a deck cell with a rail-protected hatch; the ladder prop stands under it
//   * everything static: one merged mesh per material key, one collider per straight wall run / slab / rail; no scene lights (emissive strips)
import { ARCHIVE, wallLattice, cellCentre, toWorld, toLocal, DX, DZ, degree } from '../game/maps5_core.js';
import { buildRuns, doorSteps } from './maps5_kit.js';
import { rectMinus } from './worlds2_solids.js';
import * as THREE from 'three';

export function buildArchive(C, S, site, plan, out) {
  const A = ARCHIVE, P = A.pitch, T0 = A.thick, T1 = 0.5, cols = plan.cols, rows = plan.rows;
  const f = { x: site.x, z: site.z, rot: site.rot };
  const W = cols * P, D = rows * P, ox = W / 2, oz = D / 2;
  const y0 = site.y0, deckTop = y0 + A.deckY, roof = y0 + A.roofY;
  S.frame(f.x, f.z, f.rot);
  const b0 = S.B.boxes;
  const R = S.B.R;
  S.solid('stone', 0, site.yLo - 0.8, 0, W + 1.4, y0 - site.yLo + 0.8, D + 1.4, { uv: 0.35, tint: 0.55, color: [0.85, 0.8, 0.7] });   // foundation = level-0 floor
  S.solid('wood', 0, roof, 0, W + 0.6, 0.35, D + 0.6, { uv: 0.4, tint: 0.4 });                                                         // roof
  const isPerim = (run) => (run.ax === 'x' ? Math.abs(Math.abs(run.c) - oz) < 0.01 : Math.abs(Math.abs(run.c) - ox) < 0.01);
  const openOf = (g) => (a, b) => { const [i, j] = a < b ? [a, b] : [b, a]; return (g.open[i] & (1 << (j === i + 1 ? 0 : 1))) !== 0; };
  // ---- level 0 (perimeter runs are the full-height shell)
  const lat0 = wallLattice(cols, rows, openOf(plan.g0), [{ side: 'S', x: plan.entrance.x }, { side: 'N', x: plan.exit.x }], P);
  buildRuns(S, lat0.runs, (run) => (isPerim(run)
    ? { key: 'books', y0, h: A.roofY, T: T0, color: [0.62, 0.5, 0.4], tint: 0.6, uv: 0.3 }
    : { key: 'books', y0, h: A.h0, T: T0, color: [0.85, 0.7, 0.55], tint: 0.85, uv: 0.4 }));
  // warm shelf-top lamp strips (emissive) along the interior runs
  for (const run of lat0.runs) {
    if (isPerim(run)) continue;
    const len = run.u1 - run.u0 + T0 - 0.3, uc = (run.u0 + run.u1) / 2;
    if (run.ax === 'x') S.vis('glow', uc, y0 + A.h0 - 0.05, run.c, len, 0.06, T0 + 0.04, { col: false, color: [0.5, 0.34, 0.14], bottom: false });
    else S.vis('glow', run.c, y0 + A.h0 - 0.05, uc, T0 + 0.04, 0.06, len, { col: false, color: [0.5, 0.34, 0.14], bottom: false });
  }
  // chandelier glows under the roof (no light objects)
  for (let z = 0; z < rows; z += 2) for (let x = (z / 2) % 2; x < cols; x += 2) { const c = cellCentre(cols, rows, P, z * cols + x); S.vis('glow', c.x, y0 + A.roofY - 0.5, c.z, 0.9, 0.16, 0.9, { col: false, color: [0.85, 0.62, 0.28] }); }

  // ---- level 1: deck slabs (per row runs, the ladder cell cut around its hatch)
  const deck1 = (i) => plan.deck[i] === 1;
  const lad = plan.ladder, lc = cellCentre(cols, rows, P, lad.cell);
  const hd = { x: DX[lad.hole], z: DZ[lad.hole] };
  const hole = { cx: lc.x + hd.x * 0.55, cz: lc.z + hd.z * 0.55, hx: hd.x ? 0.65 : 0.65, hz: 0.65 };
  for (let z = 1; z <= rows - 2; z++) {
    let x = 0;
    while (x < cols) {
      const i = z * cols + x;
      if (!deck1(i) || i === lad.cell) { x++; continue; }
      let x1 = x;
      while (x1 + 1 < cols && deck1(z * cols + x1 + 1) && z * cols + x1 + 1 !== lad.cell && plan.islandOf[z * cols + x1 + 1] === plan.islandOf[i]) x1++;
      S.slab('wood', [x * P - ox, (x1 + 1) * P - ox, z * P - oz, (z + 1) * P - oz], deckTop, 0.3, { uv: 0.5, tint: 0.7 });
      x = x1 + 1;
    }
  }
  {   // ladder cell floor with the hatch cut out
    const r = [lc.x - P / 2, lc.x + P / 2, lc.z - P / 2, lc.z + P / 2];
    for (const q of rectMinus(r, [[hole.cx - hole.hx, hole.cx + hole.hx, hole.cz - hole.hz, hole.cz + hole.hz]])) S.slab('wood', q, deckTop, 0.3, { uv: 0.5, tint: 0.7 });
  }
  // hatch rails: both sides + the front edge with a 1.0 m gap where the ladder arrives
  {
    const px = hd.x !== 0, ax = px ? 0 : 1;   // hole axis: x (E/W) or z (S/N)
    const rail = (cx, cz, sx, sz) => S.solid('metal', cx, deckTop, cz, sx, 0.95, sz, { uv: 0.6, tint: 0.8, bottom: false });
    const sideLen = 1.3;
    for (const s of [-1, 1]) {
      if (ax === 0) rail(hole.cx, hole.cz + s * (hole.hz + 0.05), sideLen, 0.1); else rail(hole.cx + s * (hole.hx + 0.05), hole.cz, 0.1, sideLen);
    }
    const front = -(px ? hd.x : hd.z);   // sign of the front edge relative to the hole centre
    for (const s of [-1, 1]) {
      const off = s * 0.75;
      if (ax === 0) rail(hole.cx + front * (hole.hx + 0.05), hole.cz + off, 0.1, 0.5); else rail(hole.cx + off, hole.cz + front * (hole.hz + 0.05), 0.5, 0.1);
    }
  }
  // ---- level 1 walls (low stacks); bridges are cut open by inner gates and railed on both sides
  const deckHas = (i) => plan.deck[i] === 1;
  const openings = [];
  for (const b of plan.bridges) {
    const r = b.row, ca = b.cells[0] % cols;
    openings.push({ side: 'V', z: r, x: ca + 1 }, { side: 'V', z: r, x: ca + 2 });
  }
  const lat1 = wallLattice(cols, rows, openOf(plan.g1), openings, P, deckHas);
  buildRuns(S, lat1.runs, (run) => (isPerim(run) ? null : { key: 'books', y0: deckTop, h: A.wallH1, T: T1, color: [0.8, 0.62, 0.45], tint: 0.9, uv: 0.4 }));
  for (const run of lat1.runs) {   // reading-lamp glow along the low stacks
    if (isPerim(run)) continue;
    const len = run.u1 - run.u0 - 0.4, uc = (run.u0 + run.u1) / 2;
    if (run.ax === 'x') S.vis('glow', uc, deckTop + A.wallH1 + 0.02, run.c, len, 0.04, T1 - 0.1, { col: false, color: [0.7, 0.5, 0.2], bottom: false });
    else S.vis('glow', run.c, deckTop + A.wallH1 + 0.02, uc, T1 - 0.1, 0.04, len, { col: false, color: [0.7, 0.5, 0.2], bottom: false });
  }
  // ---- bridges: catwalk strip + side rails
  for (const b of plan.bridges) {
    const m = cellCentre(cols, rows, P, b.cells[1]);
    S.solid('metal', m.x, deckTop - 0.25, m.z, P + 0.5, 0.25, 1.6, { uv: 0.5, tint: 0.75 });
    S.vis('grate', m.x, deckTop + 0.005, m.z, P + 0.5, 0.02, 1.5, { col: false, tint: 0.6 });
    for (const s of [-1, 1]) {
      S.solid('metal', m.x, deckTop, m.z + s * 0.85, P + 0.5, 1.15, 0.1, { uv: 0.6, tint: 0.7, bottom: false });
      S.vis('glow', m.x, deckTop + 1.15, m.z + s * 0.85, P + 0.5, 0.04, 0.12, { col: false, color: [0.85, 0.6, 0.25], bottom: false });
    }
  }
  // ---- gates (door posts) + steps
  const gates = [];
  for (const [side, gx] of [['S', plan.entrance.x], ['N', plan.exit.x]]) {
    const z = side === 'S' ? oz : -oz, x = (gx + 0.5) * P - ox;
    for (const sx of [-1, 1]) S.solid('wood', x + sx * (P / 2 - 0.1), y0, z, 0.35, 2.9, 1.0, { uv: 0.5, tint: 0.7 });
    S.solid('wood', x, y0 + 2.75, z, P - 0.3, 0.3, 0.9, { uv: 0.5, tint: 0.7, col: false });
    S.vis('glow', x, y0 + 2.5, z + (side === 'S' ? 0.45 : -0.45) * 1.05, 0.9, 0.16, 0.05, { col: false, color: side === 'N' ? [0.3, 1, 0.5] : [1, 0.6, 0.25], bottom: false });
    doorSteps(S, C, y0, x, z + (side === 'S' ? 0.5 : -0.5), side === 'S' ? 1 : -1, P - 0.6);
    const [wx, wz] = toWorld(f, x, z);
    gates.push({ side, x: wx, z: wz, y: y0 });
  }
  // ---- reward pedestal on island B, lamp at the ladder foot
  const rw = cellCentre(cols, rows, P, plan.reward), [rwx, rwz] = toWorld(f, rw.x, rw.z);
  S.solid('marble', rw.x, deckTop, rw.z, 1.0, 0.9, 1.0, { uv: 0.6, tint: 0.85 });
  S.vis('glow', rw.x, deckTop + 0.93, rw.z, 0.5, 0.05, 0.5, { col: false, color: [1, 0.85, 0.4] });
  // ---- props (ladder under the hatch, loot cells)
  const [lhx, lhz] = toWorld(f, hole.cx - hd.x * 0.6, hole.cz - hd.z * 0.6);   // the ladder hangs from the FRONT edge of the hatch: you climb facing it and step forward onto the deck
  const ladderYaw = Math.atan2(hd.x, hd.z) + f.rot;   // its front looks at the climber, who stands under the hatch
  out.props.push({ id: 'm5:archive_ladder', x: lhx, y: y0, z: lhz, ry: ladderYaw, variant: 0, h: A.deckY + 0.9 });
  const [hcx, hcz] = toWorld(f, hole.cx - hd.x * 0.2, hole.cz - hd.z * 0.2);
  const fwd = { x: Math.sin(ladderYaw), z: Math.cos(ladderYaw) };   // the climber faces the ladder: opposite of its front, towards the floor beyond the hatch edge
  const loot = [];
  const dEnt = plan.dist;
  const ends0 = [];
  for (let i = 0; i < plan.g0.n; i++) if (degree(plan.g0, i) === 1 && i !== plan.entrance.cell && i !== plan.exit.cell && i !== lad.cell) ends0.push(i);
  ends0.sort((a, b) => (dEnt[b] - dEnt[a]) || (a - b));
  for (const i of ends0.slice(0, 3)) { const c = cellCentre(cols, rows, P, i), [wx, wz] = toWorld(f, c.x, c.z); loot.push({ x: wx, y: y0, z: wz, kind: 'shelf' }); S.vis('glow', c.x, y0 + 0.02, c.z, 0.6, 0.04, 0.6, { col: false, color: [0.7, 0.5, 0.2] }); }
  for (let i = 0; i < plan.g1.n; i++) if (plan.deck[i] === 1 && plan.islandOf[i] === 0 && degree(plan.g1, i) === 1 && i !== lad.cell && loot.length < 5) { const c = cellCentre(cols, rows, P, i), [wx, wz] = toWorld(f, c.x, c.z); loot.push({ x: wx, y: deckTop, z: wz, kind: 'deck' }); }
  const climb = { x: hcx, z: hcz, y0, top: deckTop + 0.9, r: 0.6, face: { x: -fwd.x, z: -fwd.z } };
  const arch = {
    kind: 'archive', plan, frame: f, y0, deckTop, roof, gates, ladder: climb, prize: { x: rwx, y: deckTop + 1.05, z: rwz }, loot,
    size: [W, D], colliders: S.B.boxes - b0,
    contains(wx, wz, y = y0 + 1) { const [lx, lz] = toLocal(f, wx, wz); return Math.abs(lx) < ox + 0.5 && Math.abs(lz) < oz + 0.5 && y > y0 - 1 && y < roof + 1; },
  };
  out.info.archive = arch;
  void THREE; void R;
  return arch;
}
