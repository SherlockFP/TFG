// SHIFT11 (wave 11) - pure planning rules for the RECYCLE BIN labyrinth: a facility whose layout changes while you are inside.
// No three.js, no DOM, no Math.random: everything is a pure function of (facility layout, options), so every peer derives the same sequence and node tests can prove
// the guarantees. Runtime (colliders, nav, telegraph, net) lives in shift11.js.
//
//   GATES    a gate is a full-width shutter on one layout edge. Two kinds:
//              rail  corridor-corridor plain opening (no door frame): the "junk tower" that slides down from the ceiling and closes a passage
//              seal  a doorway leaving a SECTOR (a room), placed on the outside face: closes when that sector is deleted
//   SECTORS  ordinary rooms that may be "permanently deleted" (sealed, floor voided, loot shredded) and restored two shifts later
//   STEPS    step n changes state n -> n+1: restore the sector purged at step n-2, purge a new one, close 1-2 rails, open 1-2 rails.
//            Every state (and therefore every transition target) keeps EVERY originally reachable, non-deleted cell reachable from the entrance / fire exits,
//            so nobody can ever be locked out of the exit. Steps are generated lazily from (layout seed, n, state) and cached: same seed = same sequence.
import { RNG, hashString } from '../core/rng.js';

export const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
export const S11 = { railGap: 3, entranceGap: 3, sectorMin: 1, sectorMax: 16, sealOff: 0.62, holdCells: 2 };
const BAD_TYPES = new Set(['entrance', 'vault', 'core', 'generator', 'contain', 'fireexit']);
const barrier = (inf) => !!inf && (inf.type === 'vault' || inf.type === 'contain' || (inf.type === 'door' && inf.locked));
const LETTERS = 'ABCDEFGH';

/**
 * @param L layout from world/facility.js generateLayout
 * @param o { exclude: Set<roomId> (rooms that carry facility systems), maxRails, maxSectors }
 */
export function planShift(L, o = {}) {
  const W = L.w, H = L.h, C = L.cell || 4;
  const seed = (L.seed >>> 0);
  const exclude = o.exclude || new Set();
  const src = [...new Set(L.entrySources || [])];
  const cellXZ = (i) => [i % W, (i / W) | 0];

  // ---------------------------------------------------------------- base reachability (same rule as the generator: locked doors / vaults closed)
  const adjRaw = new Array(W * H);
  for (let i = 0; i < W * H; i++) {
    adjRaw[i] = [];
    if (!L.cells[i]) continue;
    const [x, z] = cellXZ(i);
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], nz = z + DZ[d];
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const j = nz * W + nx;
      if (!L.cells[j]) continue;
      const k = L.edgeKey(x, z, d);
      if (!L.open.has(k)) continue;
      const inf = L.edgeInfo.get(k);
      if (barrier(inf)) continue;
      adjRaw[i].push([j, k]);
    }
  }
  const reach0 = new Uint8Array(W * H);
  { const q = []; for (const s of src) if (!reach0[s]) { reach0[s] = 1; q.push(s); } for (let h = 0; h < q.length; h++) for (const [j] of adjRaw[q[h]]) if (!reach0[j]) { reach0[j] = 1; q.push(j); } }
  const needed = []; for (let i = 0; i < W * H; i++) if (reach0[i] && L.cells[i]) needed.push(i);

  // ---------------------------------------------------------------- sectors
  const srcSet = new Set(src);
  const fireCells = new Set((L.fireExits || []).map((f) => f.cellZ * W + f.cellX));
  const sectors = [];
  const cellSector = new Int16Array(W * H).fill(-1);
  for (const r of L.rooms || []) {
    if (BAD_TYPES.has(r.type) || r.hero || r.m2 || r.m2ch || r.reactorSpot || r.treasure || r.arena || exclude.has(r.id)) continue;
    const cells = [];
    for (let i = 0; i < W * H; i++) if (L.roomOf[i] === r.id && L.cells[i]) cells.push(i);
    if (cells.length < S11.sectorMin || cells.length > S11.sectorMax) continue;
    if (cells.some((i) => !reach0[i] || srcSet.has(i) || fireCells.has(i))) continue;
    const s = { id: sectors.length, room: r.id, cells, set: new Set(cells), gates: [], perim: [], cx: 0, cz: 0, label: '' };
    let sx = 0, sz = 0;
    for (const i of cells) { const [x, z] = cellXZ(i); sx += x + 0.5; sz += z + 0.5; }
    s.cx = sx / cells.length; s.cz = sz / cells.length;
    s.label = LETTERS[Math.min(7, Math.floor((s.cx / W) * 8))] + (Math.min(8, Math.floor((s.cz / H) * 8) + 1));
    sectors.push(s);
    for (const i of cells) cellSector[i] = s.id;
  }

  // ---------------------------------------------------------------- gates: seals (per sector doorway) then rails
  const gates = [];
  const mkGate = (kind, key, a, b, extra = {}) => {
    const dir = key & 1, ci = key >> 1, x = ci % W, z = (ci / W) | 0;
    const g = { id: gates.length, kind, key, dir, x, z, a, b, cx: dir === 0 ? x + 1 : x + 0.5, cz: dir === 0 ? z + 0.5 : z + 1, ...extra };
    gates.push(g);
    return g;
  };
  // rails first: ids 0..nRails-1 (state.closed is indexed by gate id for rails only)
  const entCell = src[0] ?? 0, [ex0, ez0] = cellXZ(entCell);
  const railCand = [];
  for (const key of L.open) {
    if (L.edgeInfo.has(key)) continue;
    const dir = key & 1, ci = key >> 1, x = ci % W, z = (ci / W) | 0, nx = x + (dir === 0 ? 1 : 0), nz = z + (dir === 1 ? 1 : 0);
    if (nx >= W || nz >= H) continue;
    const a = z * W + x, b = nz * W + nx;
    if (L.cells[a] !== 2 || L.cells[b] !== 2 || !reach0[a] || !reach0[b]) continue;   // corridor-corridor only (rooms keep their layout)
    if (Math.min(Math.abs(x - ex0) + Math.abs(z - ez0), Math.abs(nx - ex0) + Math.abs(nz - ez0)) < S11.entranceGap) continue;
    let nearSrc = false;
    for (const s of src) { const [sx, sz] = cellXZ(s); if (Math.abs(x - sx) + Math.abs(z - sz) < 2) { nearSrc = true; break; } }
    if (nearSrc) continue;
    railCand.push({ key, a, b, x, z, nx, nz });
  }
  railCand.sort((p, q) => p.key - q.key);
  const RR = new RNG(hashString('s11rails:' + seed));
  RR.shuffle(railCand);
  const maxRails = o.maxRails ?? Math.max(4, Math.min(16, Math.round(railCand.length / 7)));
  const railsPicked = [];
  for (const c of railCand) {
    if (railsPicked.length >= maxRails) break;
    if (railsPicked.some((p) => Math.abs(p.x - c.x) + Math.abs(p.z - c.z) < S11.railGap)) continue;
    railsPicked.push(c);
  }
  for (const c of railsPicked) mkGate('rail', c.key, c.a, c.b, { rail: gates.length });
  const nRails = gates.length;
  // seals: one per (open doorway, outer cell) of every sector
  for (const s of sectors) {
    for (const i of s.cells) {
      const [x, z] = cellXZ(i);
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], nz = z + DZ[d];
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const j = nz * W + nx;
        if (!L.cells[j] || s.set.has(j)) continue;
        // perimeter strip (wall between the sector cell and whatever is outside), open or not
        s.perim.push({ cell: i, d });
        const k = L.edgeKey(x, z, d);
        if (!L.open.has(k)) continue;
        const g = mkGate('seal', k, i, j, { sector: s.id, outer: j, inner: i, sd: d });
        // outward offset (metres, world axes): from the doorway plane into the outer cell
        g.off = [DX[d] * S11.sealOff, DZ[d] * S11.sealOff];
        s.gates.push(g.id);
      }
    }
  }
  // a sector without a doorway is never purged (unusable)
  for (const s of sectors) s.usable = s.gates.length > 0;

  // ---------------------------------------------------------------- state + connectivity
  const nS = sectors.length;
  const newState = () => ({ closed: new Uint8Array(nRails), del: new Uint8Array(nS), queue: [], lastRestored: -1 });
  const clone = (st) => ({ closed: Uint8Array.from(st.closed), del: Uint8Array.from(st.del), queue: st.queue.slice(), lastRestored: st.lastRestored });
  const railOfKey = new Map(); for (let r = 0; r < nRails; r++) railOfKey.set(gates[r].key, r);
  const seen = new Uint8Array(W * H), qbuf = new Int32Array(W * H);
  /** every needed, non-deleted cell reachable from the sources given closed rails + deleted sectors */
  function connected(st) {
    seen.fill(0);
    let qt = 0;
    for (const s of src) { if (cellSector[s] >= 0 && st.del[cellSector[s]]) continue; if (!seen[s]) { seen[s] = 1; qbuf[qt++] = s; } }
    for (let h = 0; h < qt; h++) {
      for (const [j, k] of adjRaw[qbuf[h]]) {
        if (seen[j]) continue;
        if (cellSector[j] >= 0 && st.del[cellSector[j]]) continue;
        const r = railOfKey.get(k);
        if (r !== undefined && st.closed[r]) continue;
        seen[j] = 1; qbuf[qt++] = j;
      }
    }
    for (const i of needed) { if (cellSector[i] >= 0 && st.del[cellSector[i]]) continue; if (!seen[i]) return false; }
    return true;
  }

  const states = [], steps = [];
  {
    const st = newState();
    const R = new RNG(hashString('s11init:' + seed));
    const ord = R.shuffle([...Array(nRails).keys()]);
    const want = Math.ceil(nRails * 0.5);
    let n = 0;
    for (const r of ord) { if (n >= want) break; st.closed[r] = 1; if (connected(st)) n++; else st.closed[r] = 0; }
    states.push(st);
  }
  const usableIds = sectors.filter((s) => s.usable).map((s) => s.id);
  let ok = nRails >= 2 || usableIds.length >= 2;

  function makeStep(n) {
    const st = states[n], nx = clone(st), R = new RNG(hashString(`s11step:${seed}:${n}`));
    const step = { n, purge: -1, restore: -1, close: [], open: [], empty: true };
    if (st.queue.length >= 2 || (st.queue.length >= 1 && usableIds.length <= 2)) {
      step.restore = nx.queue.shift(); nx.del[step.restore] = 0; nx.lastRestored = step.restore;
    } else nx.lastRestored = -1;
    // rails: keep 35-65 % closed, always toggle something. Order: open (always safe), close (connectivity-checked), purge; if no sector can go, drop this step's closes and retry
    const closedNow = [], openNow = [];
    for (let r = 0; r < nRails; r++) (st.closed[r] ? closedNow : openNow).push(r);
    let nOpen = closedNow.length ? R.int(1, 2) : 0, nClose = openNow.length ? R.int(1, 2) : 0;
    const frac = nRails ? closedNow.length / nRails : 0;
    if (frac > 0.62) nClose = Math.max(0, nClose - 1); else if (frac < 0.38) nOpen = Math.max(0, nOpen - 1);
    for (const r of R.shuffle(closedNow.slice())) { if (step.open.length >= nOpen) break; nx.closed[r] = 0; step.open.push(r); }
    const tryClose = () => { for (const r of R.shuffle(openNow.slice())) { if (step.close.length >= nClose) break; nx.closed[r] = 1; if (connected(nx)) step.close.push(r); else nx.closed[r] = 0; } };
    const tryPurge = () => {
      for (const id of R.shuffle(usableIds.slice())) {
        if (nx.del[id] || id === st.lastRestored || id === step.restore) continue;
        nx.del[id] = 1;
        if (connected(nx)) { step.purge = id; nx.queue.push(id); return true; }
        nx.del[id] = 0;
      }
      return false;
    };
    tryClose();
    if (!tryPurge() && step.close.length) { for (const r of step.close) nx.closed[r] = 0; step.close = []; if (tryPurge()) tryClose(); }
    if (step.purge < 0) for (const r of R.shuffle(closedNow.filter((q) => nx.closed[q]))) { nx.closed[r] = 0; step.open.push(r); if (tryPurge()) break; }   // open more passages to make room
    if (!step.open.length && !step.close.length && nRails) {   // nothing toggled: force one legal change
      for (const r of R.shuffle([...Array(nRails).keys()])) { nx.closed[r] ^= 1; if (connected(nx)) { (nx.closed[r] ? step.close : step.open).push(r); break; } nx.closed[r] ^= 1; }
    }
    step.empty = step.purge < 0 && step.restore < 0 && !step.close.length && !step.open.length;
    steps.push(step); states.push(nx);
  }
  const ensure = (n) => { while (states.length <= n + 1 && ok) makeStep(states.length - 1); };

  const plan = {
    ok, seed, w: W, h: H, cell: C, gates, sectors, nRails, needed,
    /** state after n completed steps: { closed[rail], del[sector], queue } */
    stateAt(n) { n = Math.max(0, n | 0); ensure(n); return states[Math.min(n, states.length - 1)]; },
    /** the change n -> n+1 */
    stepAt(n) { n = Math.max(0, n | 0); ensure(n); return steps[Math.min(n, steps.length - 1)] || { n, purge: -1, restore: -1, close: [], open: [], empty: true }; },
    /** per gate closed flag for a state (rails from state.closed, seals from deleted sectors) */
    gateFlags(st) {
      const f = new Uint8Array(gates.length);
      for (let r = 0; r < nRails; r++) f[r] = st.closed[r];
      for (const s of sectors) if (st.del[s.id]) for (const gid of s.gates) f[gid] = 1;
      return f;
    },
    connected,
    sectorOfCell: (i) => cellSector[i],
    /** stable digest of the first n steps (tests / determinism) */
    signature(n = 24) { ensure(n); let h = 2166136261 >>> 0; const mix = (v) => { h = Math.imul(h ^ (v & 0xffff), 16777619) >>> 0; }; for (const g of gates) { mix(g.key); mix(g.kind === 'rail' ? 1 : 2); } for (let i = 0; i < n && i < steps.length; i++) { const s = steps[i]; mix(s.purge + 1); mix(s.restore + 1); for (const r of s.close) mix(r + 100); for (const r of s.open) mix(r + 200); } return h; },
  };
  if (ok) { ensure(8); let live = 0; for (let i = 0; i < 8; i++) if (!steps[i].empty) live++; if (live < 4) { ok = false; plan.ok = false; } }   // a tree-like layout where nothing can move safely: the module stays off
  return plan;
}

/** rooms that carry facility systems (generator, core, panels, notes ...) must never be deleted: collect their ids from the built facility */
export function busyRooms(fac) {
  const out = new Set();
  const add = (id) => { if (Number.isInteger(id) && id >= 0) out.add(id); };
  const sys = fac?.sys;
  if (sys) {
    for (const k of ['gen', 'contain', 'core', 'security', 'vent']) add(sys[k]?.room);
    for (const p of sys.panels || []) add(p.room);
    for (const n of sys.notes || []) add(n.room);
  }
  for (const f of fac?.layout?.fireExits || []) add(f.room?.id);
  for (const c of fac?.chestSpots || []) if (c.kind === 'vault' || c.sealed) add(c.room);
  const L = fac?.layout;
  if (L?.generator) add(L.generator.id);
  if (L?.core) add(L.core.id);
  return out;
}

/** which cell index (layout) a world position is in, or -1 */
export function cellOfPos(L, x, z) {
  const gx = Math.floor((x - L.ox) / L.cell), gz = Math.floor((z - L.oz) / L.cell);
  if (gx < 0 || gz < 0 || gx >= L.w || gz >= L.h) return -1;
  return gz * L.w + gx;
}
