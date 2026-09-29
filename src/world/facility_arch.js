// FACILITY ARCHETYPES (wave 8, facjobs; docs/wave8/facjobs.md). Three extra interior layouts on top of the shared generator in world/facility.js,
// selected with layoutOpts.arch (the facility-job module picks one per day; nothing else changes for facilities without it):
//   'atrium'    hub-and-spoke: a big central atrium on the entrance axis, four long spokes (left / right / up / entrance) that each end in a big room
//   'ring'      a rectangular ring corridor around the middle with two cross-chord shortcuts; rooms hang off the ring (inside + outside)
//   'catacomb'  dead-end heavy: almost no loops (a near-tree), 6x the dead-end closets, longer stubs, three dead-end mazes
// Atrium and ring reuse the 'wings' plan of the generator (they only supply the spines + a hub / spoke rooms; the comb + repair passes connect
// everything, so solvability is inherited). Catacomb only changes numbers. Pure (no three, no DOM), node-tested by tools/harness/facjobs.test.mjs.
export const ARCHS = ['atrium', 'ring', 'catacomb'];
export const ARCH_NAMES = { atrium: 'Atrium', ring: 'Ring', catacomb: 'Catacomb' };

/** layoutOpts numbers of an archetype (merged by facjobs into moon.layoutOpts) */
export function archOpts(arch) {
  if (arch === 'catacomb') return { arch, loops: 0.04, deadMul: 6, labyrinth: 3, roomMul: 1.15 };
  if (arch === 'atrium' || arch === 'ring') return { arch, roomMul: 1.05 };
  return null;
}

/**
 * Called by generateLayout right after the entrance room exists (before the hub / labyrinth / variety / random rooms, which then keep clear of
 * these corridors through canPlace). ctx: { arch, W, H, ent, cells, idx, canPlace, addRoom, line, spines, nodes }.
 * Returns true when it drew the spines (the generator then skips its default wing spines and its own hub).
 */
export function planArch(ctx) {
  const { arch, W, H, ent, cells, idx, canPlace, addRoom, line, spines, nodes } = ctx;
  if (arch === 'atrium') {
    const w = 7, h = 7, hx = ent.cx - 3, hz = Math.round(H * 0.42) - 3;
    if (!canPlace(hx, hz, w, h)) return false;
    const hub = addRoom(hx, hz, w, h, 'big'); hub.hub = true; hub.atrium = true;
    const cx = hub.cx, cz = hub.cz;
    // spoke rooms at the arm ends (skipped where they do not fit; the arm still runs to the map edge margin)
    const ends = [[2, cz - 2], [W - 6, cz - 2], [cx - 2, 2]];
    for (const [x, z] of ends) if (canPlace(x, z, 4, 4)) { const r = addRoom(x, z, 4, 4, 'big'); r.spoke = true; }
    const x0 = 4, x1 = W - 5, z0 = 4;
    line(x0, cz, x1, cz); spines.push({ axis: 'x', c: cz, a: x0, b: x1 }); nodes.push({ cx, cz });
    line(cx, z0, cx, ent.cz); spines.push({ axis: 'z', c: cx, a: z0, b: ent.cz });
    return true;
  }
  if (arch === 'ring') {
    const x0 = Math.round(W * 0.2), x1 = W - 1 - Math.round(W * 0.2), z0 = Math.round(H * 0.16), z1 = H - 9;
    if (x1 - x0 < 8 || z1 - z0 < 8) return false;
    for (const [ax, az, bx, bz] of [[x0, z1, x1, z1], [x0, z0, x1, z0], [x0, z0, x0, z1], [x1, z0, x1, z1]]) line(ax, az, bx, bz);
    spines.push({ axis: 'x', c: z1, a: x0, b: x1 }, { axis: 'x', c: z0, a: x0, b: x1 }, { axis: 'z', c: x0, a: z0, b: z1 }, { axis: 'z', c: x1, a: z0, b: z1 });
    // two chords across the ring = the shortcuts (one horizontal, one vertical), meeting the ring sides
    const zm = Math.round((z0 + z1) / 2), xm = Math.round((x0 + x1) / 2);
    line(x0, zm, x1, zm); spines.push({ axis: 'x', c: zm, a: x0, b: x1 });
    line(xm, z0, xm, z1); spines.push({ axis: 'z', c: xm, a: z0, b: z1 });
    nodes.push({ cx: xm, cz: zm });
    void cells; void idx;
    return true;
  }
  return false;
}
