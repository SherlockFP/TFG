// MAPS5 - SERVER STACKS: a roofed hall of tight server-rack aisles (11 x 11 cells) whose walls REPOSITION every N seconds.
//   * layout = planStacks (game/maps5_core.js): a cycle of spanning trees. Static rack walls are merged runs; every wall that ever moves is one
//     entry of a MOVABLE list: one instanced mesh (racks), one instanced mesh (warning strips on top) and one (floor marks), plus one Rapier
//     box per movable wall that is switched with collider.setEnabled (no colliders are created / destroyed at runtime).
//   * the HOST decides when (game/maps5.js, message m5sw): 'warn' flashes the affected walls amber for `warn` seconds, 'go' opens the new
//     passages first and lowers / raises the walls (1.4 s). Every state is derived from the absolute cycle step k, so a missed message heals.
//   * a wall never closes on the LOCAL player: while you stand within ~0.7 m of a rising wall it waits half-raised (collider off) until you step away.
//   * nothing here uses Math.random for layout; animation is pure state -> matrices.
import * as THREE from 'three';
import { STACKS, wallLattice, edgeCells, stacksOpen, stacksPhaseAt, toWorld, toLocal, cellCentre } from './mazegen.js';
import { buildRuns, doorSteps, guard } from './maps5_kit.js';
import { levelMaterial } from './geobuilder.js';

const _m = new THREE.Matrix4(), _l = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const IDLE = [0.08, 0.34, 0.4], WARN_A = [1, 0.62, 0.1], WARN_B = [1, 0.15, 0.08];

export function buildStacks(C, S, site, plan, out) {
  const P = STACKS.pitch, T = STACKS.thick, H = STACKS.height, cols = plan.cols, rows = plan.rows;
  const f = { x: site.x, z: site.z, rot: site.rot };
  const W = cols * P, D = rows * P, ox = W / 2, oz = D / 2;
  const y0 = site.y0;
  S.frame(f.x, f.z, f.rot);
  const b0 = S.B.boxes;
  // foundation, roof
  S.solid('floor', 0, site.yLo - 0.8, 0, W + 1.4, y0 - site.yLo + 0.8, D + 1.4, { uv: 0.35, tint: 0.5, color: [0.7, 0.85, 1] });
  S.solid('dark', 0, y0 + H, 0, W + 0.6, 0.4, D + 0.6, { uv: 0.4, tint: 0.45 });
  // static rack walls: every edge that is closed in ALL phases
  const eidOf = (a, b) => { const [i, j] = a < b ? [a, b] : [b, a]; return i * 2 + (j === i + 1 ? 0 : 1); };
  const openAny = (a, b) => { const e = eidOf(a, b); for (const s of plan.states) if (s[e]) return true; return false; };
  const lat = wallLattice(cols, rows, openAny, [{ side: 'S', x: plan.entrance.x }, { side: 'N', x: plan.exit.x }], P);
  buildRuns(S, lat.runs, () => ({ key: 'rack', y0, h: H, T, color: [0.55, 0.62, 0.72], tint: 0.85, uv: 0.34 }));
  for (const run of lat.runs) {   // dim LED band along the top of every static run + hazard tint at run ends is skipped (few tris)
    const len = run.u1 - run.u0 + T, uc = (run.u0 + run.u1) / 2;
    if (run.ax === 'x') S.vis('glow', uc, y0 + H - 0.28, run.c, len - 0.2, 0.09, T + 0.05, { col: false, color: IDLE, bottom: false });
    else S.vis('glow', run.c, y0 + H - 0.28, uc, T + 0.05, 0.09, len - 0.2, { col: false, color: IDLE, bottom: false });
  }
  // corner posts for lattice vertices that touch a movable wall and no static one
  const mov = plan.movable.map((eid) => {
    const [a] = edgeCells(cols, eid), ax = a % cols, az = (a / cols) | 0, south = (eid & 1) === 1;
    const lx = south ? (ax + 0.5) * P - ox : (ax + 1) * P - ox, lz = south ? (az + 1) * P - oz : (az + 0.5) * P - oz;
    const v = south ? [[ax, az + 1], [ax + 1, az + 1]] : [[ax + 1, az], [ax + 1, az + 1]];
    return { eid, ax, az, south, lx, lz, len: P - T, v };
  });
  const wallAt = (vx, vz) => (vz > 0 && lat.V[vz - 1]?.[vx]) || (vz < rows && lat.V[vz]?.[vx]) || (vx > 0 && lat.H[vz]?.[vx - 1]) || (vx < cols && lat.H[vz]?.[vx]);
  const posts = new Set();
  for (const m of mov) for (const [vx, vz] of m.v) if (!wallAt(vx, vz)) posts.add(vz * (cols + 1) + vx);
  for (const k of posts) {
    const vx = k % (cols + 1), vz = (k / (cols + 1)) | 0;
    S.solid('rack', vx * P - ox, y0, vz * P - oz, T, H, T, { uv: 0.5, tint: 0.8, color: [0.55, 0.62, 0.72] });
  }
  // ceiling panels (emissive, no scene light) + gate frames
  for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) if ((x + 2 * z) % 3 === 0) { const c = cellCentre(cols, rows, P, z * cols + x); S.vis('glow', c.x, y0 + H - 0.03, c.z, 1.3, 0.05, 0.45, { col: false, color: [0.55, 0.85, 0.95], bottom: false }); }
  const gates = [];
  for (const [side, gx] of [['S', plan.entrance.x], ['N', plan.exit.x]]) {
    const z = side === 'S' ? oz : -oz, x = (gx + 0.5) * P - ox;
    for (const sx of [-1, 1]) S.solid('hazard', x + sx * (P / 2 - 0.2), y0, z, 0.4, H, 0.9, { uv: 0.5, tint: 0.9 });
    S.vis('glow', x, y0 + H - 0.55, z, P - 0.9, 0.16, 0.08, { col: false, color: side === 'N' ? [0.3, 1, 0.5] : [1, 0.5, 0.2], bottom: false });
    doorSteps(S, C, y0, x, z + (side === 'S' ? 0.4 : -0.4), side === 'S' ? 1 : -1, P - 0.4);
    const [wx, wz] = toWorld(f, x, z);
    gates.push({ side, x: wx, z: wz, y: y0 });
  }
  // core (reward chamber marker): a glowing plinth in the middle cell
  const cc = cellCentre(cols, rows, P, plan.core), [cwx, cwz] = toWorld(f, cc.x, cc.z);
  S.solid('metal', cc.x, y0, cc.z, 0.9, 0.9, 0.9, { uv: 0.6, tint: 0.7, color: [0.8, 0.9, 1] });
  S.vis('glow', cc.x, y0 + 0.93, cc.z, 0.5, 0.05, 0.5, { col: false, color: [0.4, 1, 1] });
  C.emitters.push({ pos: new THREE.Vector3(cwx, y0 + 2.8, cwz), color: 0x5ad8ff, intensity: 0.8, distance: 11, flicker: 0.1, group: 'outdoor' });

  // ---- movable walls: colliders (one per wall, enabled / disabled) + instanced visuals
  const n = mov.length;
  const wallTex = levelMaterial('server_front', {});
  const wallMat = C.mat(wallTex.clone());
  wallMat.color.setRGB(1, 1, 1);
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  C.geos.push(wallGeo);
  const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, Math.max(1, n));
  const stripMat = C.mat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const stripMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stripMat, Math.max(1, n));
  C.geos.push(stripMesh.geometry);
  const markMat = C.mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }));
  const markMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), markMat, Math.max(1, n));
  C.geos.push(markMesh.geometry);
  for (const im of [wallMesh, stripMesh, markMesh]) { im.frustumCulled = false; C.add(im); }
  const frameM = new THREE.Matrix4().makeRotationY(f.rot).setPosition(f.x, 0, f.z);
  const walls = mov.map((m, i) => {
    const lenX = m.south ? m.len : T, lenZ = m.south ? T : m.len;
    const [wx, wz] = toWorld(f, m.lx, m.lz);
    const col = C.addBox(wx, y0 + H / 2, wz, lenX, H, lenZ, f.rot);
    return { ...m, i, sx: lenX, sz: lenZ, wx, wz, col, ext: 1, tgt: 1, enabled: true, warn: false, hold: false };
  });
  const totalBoxes = () => S.B.boxes - b0 + walls.length;

  // ---- runtime state machine
  const rt = {
    kind: 'stacks', plan, frame: f, y0, H, P, T, walls, gates, core: { x: cwx, y: y0, z: cwz }, k: -1, warned: false, size: [W, D],
    meshes: { walls: wallMesh, strips: stripMesh, marks: markMesh },
    get colliders() { return totalBoxes(); },
    contains(wx, wz, y = y0 + 1) { const [lx, lz] = toLocal(f, wx, wz); return Math.abs(lx) < ox + 0.5 && Math.abs(lz) < oz + 0.5 && y > y0 - 1 && y < y0 + H + 1; },
    /** target flags for cycle step k: wall i present (1) or lowered (0) */
    targetsAt(k) { const open = stacksOpen(plan, stacksPhaseAt(plan, k)); return walls.map((w) => (open[w.eid] ? 0 : 1)); },
    /** flag the walls that differ between the current targets and cycle step k (telegraph); returns their indices */
    warn(k) {
      const t = rt.targetsAt(k), changed = [];
      walls.forEach((w, i) => { w.warn = w.tgt !== t[i]; if (w.warn) changed.push(i); });
      rt.warned = changed.length > 0;
      return changed;
    },
    /** set the targets of cycle step k (animated); instant = snap (late join / map load) */
    goTo(k, instant = false) {
      const t = rt.targetsAt(k);
      walls.forEach((w, i) => { w.tgt = t[i]; w.warn = false; if (instant) { w.ext = t[i]; w.hold = false; } });
      rt.k = k; rt.warned = false;
      if (instant) rt.apply(true);
    },
    /** advance animation; the local player (player = { pos }) never gets a wall closed on them */
    step(dt, player = null) {
      for (const w of walls) {
        if (w.tgt > w.ext) {
          if (player && w.ext >= 0.45 && rt.near(w, player.pos)) { w.hold = true; w.ext = Math.min(w.ext, 0.5); continue; }
          w.hold = false;
          w.ext = Math.min(w.tgt, w.ext + dt / 1.5);
        } else if (w.tgt < w.ext) { w.hold = false; w.ext = Math.max(w.tgt, w.ext - dt / 1.1); }
      }
      rt.apply(false);
    },
    near(w, pos) {
      const [lx, lz] = toLocal(f, pos.x, pos.z);
      if (pos.y < y0 - 1 || pos.y > y0 + H) return false;
      return Math.abs(lx - w.lx) < w.sx / 2 + 0.75 && Math.abs(lz - w.lz) < w.sz / 2 + 0.75;
    },
    apply(force) {
      for (const w of walls) {
        const on = w.ext > 0.55 && !w.hold;
        if (force || on !== w.enabled) { w.enabled = on; try { w.col?.setEnabled?.(on); } catch { /* collider already gone */ } }
      }
    },
    paint(t) {
      const blink = Math.sin(t * 26) > 0;
      for (const w of walls) {
        const y = y0 + H / 2 - H * (1 - w.ext);
        _q.identity();
        _l.compose(_p.set(w.lx, y, w.lz), _q, _s.set(w.sx, H, w.sz));
        wallMesh.setMatrixAt(w.i, _m.copy(frameM).multiply(_l));
        _l.compose(_p.set(w.lx, y0 + H - 0.14 - H * (1 - w.ext), w.lz), _q, _s.set(w.south ? w.sx - 0.1 : w.sx + 0.06, 0.16, w.south ? w.sz + 0.06 : w.sz - 0.1));
        stripMesh.setMatrixAt(w.i, _m.copy(frameM).multiply(_l));
        const c = w.warn ? (blink ? WARN_A : WARN_B) : w.hold ? WARN_B : IDLE;
        stripMesh.setColorAt(w.i, _c.setRGB(c[0], c[1], c[2]));
        const showMark = w.warn || w.hold;
        _l.compose(_p.set(w.lx, y0 + 0.03, w.lz), _q, _s.set(showMark ? (w.south ? w.sx : T + 0.5) : 0.001, 0.02, showMark ? (w.south ? T + 0.5 : w.sz) : 0.001));
        markMesh.setMatrixAt(w.i, _m.copy(frameM).multiply(_l));
        markMesh.setColorAt(w.i, _c.setRGB(...(blink ? WARN_A : WARN_B)));
      }
      wallMesh.instanceMatrix.needsUpdate = stripMesh.instanceMatrix.needsUpdate = markMesh.instanceMatrix.needsUpdate = true;
      if (stripMesh.instanceColor) stripMesh.instanceColor.needsUpdate = true;
      if (markMesh.instanceColor) markMesh.instanceColor.needsUpdate = true;
    },
    dispose() { /* meshes / geometry belong to the decor (C.objs / C.geos) */ },
  };
  rt.goTo(0, true);
  rt.paint(0);
  C.updaters.push(guard((dt, t, game) => { rt.step(dt, game?.player?.pos ? game.player : null); rt.paint(t); }, 'maps5 stacks'));
  out.info.stacks = rt;
  return rt;
}
