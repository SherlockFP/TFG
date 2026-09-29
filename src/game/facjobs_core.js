// FACILITY JOBS (wave 8; docs/wave8/facjobs.md): pure rules, no three / DOM (node-tested by tools/harness/facjobs.test.mjs).
// Each landing on a regular moon rolls ONE main job + 0-1 side job. The roll is a pure function of (runId, day, moon) so the terminal can show
// it before the lever is pulled and every peer builds the same layout archetype without a network message.
import { RNG, hashString } from '../core/rng.js';
import { ARCHS, archOpts } from '../world/facility_arch.js';
import { LAB_IDS } from './labyrinths_core.js';   // [labyrinths] theme-owned layouts

/** id -> { arch (preferred layout), main, side, n (goal count), cr / cl (full credits / clout at quota 0), tier (guaranteed crate), color } */
export const JOBS = {
  power: { arch: 'atrium', main: true, side: false, n: 3, cr: 130, cl: 10, tier: 'iron', color: 0xffd34a },
  core: { arch: 'ring', main: true, side: false, n: 1, cr: 170, cl: 14, tier: 'gold', color: 0x4aa8ff },
  feed: { arch: 'atrium', main: true, side: false, n: 100, cr: 120, cl: 12, tier: 'iron', color: 0xff4a4a },
  drone: { arch: 'ring', main: true, side: false, n: 100, cr: 150, cl: 12, tier: 'gold', color: 0x7aff9a },
  vault: { arch: 'catacomb', main: true, side: true, n: 1, cr: 140, cl: 11, tier: 'gold', color: 0xd9b45a },
  rescue: { arch: 'catacomb', main: true, side: true, n: 1, cr: 110, cl: 10, tier: 'iron', color: 0xff9a4a },
  sample: { arch: 'catacomb', main: true, side: true, n: 5, cr: 100, cl: 8, tier: 'iron', color: 0x8aff5a },
  photo: { arch: null, main: true, side: true, n: 1, cr: 90, cl: 8, tier: 'wood', color: 0xd070ff },
};
export const MAIN_IDS = Object.keys(JOBS).filter((k) => JOBS[k].main);
export const SIDE_IDS = Object.keys(JOBS).filter((k) => JOBS[k].side);
export const SIDE_MUL = 0.55;         // a side job pays this fraction of the main job
export const PARTIAL_MIN = 0.25;      // below this fraction of progress a job pays nothing (and, as a main job, costs the fee)
export const FAIL_FEE = 25;           // credits taken when a MAIN job ends at takeoff with zero progress (never more than the crew holds)
export const CODE_LEN = 3;            // vault code digits (one clue note each)
export const FEED_SECONDS = 20;       // one player cutting the feed
export const DRONE_SPEED = 1.7;       // m/s, only while a living crew member is within DRONE_FOLLOW
export const DRONE_FOLLOW = 10;
export const DRONE_HP = 100;
export const ARCH_CHANCE = 0.85;      // share of days that get a layout archetype at all (the rest keep the classic facility)

/** can this moon host jobs? (regular facility moons only; Sector Cores / Raids / Keystones bring their own structure) */
export function jobMoon(moon) {
  return !!moon && !moon.company && !moon.home && !moon.customMap && !moon.layoutOpts && !!moon.interior;
}

/** the day's roll: { main, side | null, arch | null } deterministic in (runId, day, moon id) */
export function rollJobs(runId, day, moonId, quotaIndex = 0) {
  const rng = new RNG(hashString(`fj:${runId}:${day}:${moonId}`) >>> 0);
  const main = rng.pick(MAIN_IDS);
  let side = null;
  if (rng.chance(0.55)) { const pool = SIDE_IDS.filter((k) => k !== main); side = rng.pick(pool); }
  let arch = JOBS[main].arch;
  if (!arch && rng.chance(0.7)) arch = rng.pick(ARCHS);
  if (!rng.chance(ARCH_CHANCE)) arch = null;
  return { main, side, arch, qi: quotaIndex | 0 };
}

/** layoutOpts for a moon on this run (merged over nothing: jobMoon() moons have none). null = classic layout. */
export function layoutOptsFor(moon, run) {
  if (!jobMoon(moon) || !run || run.moon == null || LAB_IDS.includes(moon.interior)) return null;   // [labyrinths] theme-owned layouts
  const r = rollJobs(run.runId ?? 'x', run.day ?? 1, run.moon, run.quotaIndex | 0);
  return r.arch ? archOpts(r.arch) : null;
}

/** credits / clout / crate tier for a job at a completion fraction (0..1); side jobs pay SIDE_MUL */
export function payout(id, frac, quotaIndex = 0, isSide = false) {
  const J = JOBS[id];
  if (!J) return { cr: 0, cl: 0, crate: null };
  const f = Math.max(0, Math.min(1, frac));
  const m = (1 + 0.15 * Math.max(0, quotaIndex)) * (isSide ? SIDE_MUL : 1);
  if (f < PARTIAL_MIN) return { cr: 0, cl: 0, crate: null };
  const s = f >= 1 ? 1 : f * 0.7;   // partial work pays 70 % of its share
  return { cr: Math.round(J.cr * m * s), cl: Math.round(J.cl * (isSide ? SIDE_MUL : 1) * s), crate: f >= 1 ? (isSide && J.tier === 'gold' ? 'iron' : J.tier) : null };
}

/** vault code, deterministic from the seed */
export function vaultCode(seed) {
  const rng = new RNG((seed ^ 0xc0de) >>> 0);
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += String(rng.int(0, 9));
  return s;
}

/** pick `n` spots at least `sep` metres apart, farthest-from-the-entrance first among a shuffled top slice (pure, deterministic) */
export function pickSpots(spots, n, rng, { sep = 7, minDist = 0, used = [] } = {}) {
  const pool = rng.shuffle(spots.filter((s) => (s.dist || 0) >= minDist));
  const out = [];
  const far = (s, list) => list.every((o) => Math.hypot(o.x - s.x, o.z - s.z) >= sep);
  for (const s of pool) { if (out.length >= n) break; if (far(s, out) && far(s, used)) out.push(s); }
  for (const s of pool) { if (out.length >= n) break; if (!out.includes(s)) out.push(s); }   // too crowded: relax the spacing
  return out;
}

/** BFS cell path over a generator layout's open edges (no locked-door check: the drone hovers through) as world XZ waypoints, collinear points dropped */
export function cellPath(L, fromCell, toCell) {
  const W = L.w, n = L.w * L.h, prev = new Int32Array(n).fill(-1), seen = new Uint8Array(n);
  const q = [fromCell]; seen[fromCell] = 1;
  const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
  for (let h = 0; h < q.length && !seen[toCell]; h++) {
    const i = q[h], x = i % W, z = (i / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], nz = z + DZ[d];
      if (nx < 0 || nz < 0 || nx >= W || nz >= L.h) continue;
      const j = nz * W + nx;
      if (seen[j] || !L.cells[j] || !L.open.has(L.edgeKey(x, z, d))) continue;
      seen[j] = 1; prev[j] = i; q.push(j);
    }
  }
  if (!seen[toCell]) return null;
  const cells = [];
  for (let c = toCell; c !== -1; c = prev[c]) cells.push(c);
  cells.reverse();
  const out = [];
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k], a = cells[k - 1], b = cells[k + 1];
    if (a !== undefined && b !== undefined && ((c - a) === (b - c))) continue;   // straight through
    out.push([L.ox + ((c % W) + 0.5) * L.cell, L.oz + (((c / W) | 0) + 0.5) * L.cell]);
  }
  return out;
}
