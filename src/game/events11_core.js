// FACILITY CRISES (wave 11, module 'events11'; docs/wave11/events11.md) - pure rules. No THREE, no DOM, no i18n: importable from Node tests.
//   At most ONE crisis per landing, rolled by the host (deterministic from runId + day + moon, stored in run.ev11.plan so a reload / host migration repeats it):
//     lockdown  SECURITY BREACH   every ordinary door seals; hack 3 terminals (hold E) to lift it; creatures run faster meanwhile
//     flood     RISING WATER      the low sectors fill over 90 s; height is safety (catwalks, stairs, props); loot floats up
//     power     POWER REROUTE     brown-out; flip 3 breakers from the lowest load to the highest; a wrong flip surges + resets; live panels buzz and call creatures
//     viral     VIRAL MOMENT      the Algorithm picks one player: for 60 s every creature hunts them, but what they secure is worth x3
//   Grid helpers use the facility layout's own conventions (world/facility.js): cells row-major (z * w + x), an edge key = (cellIndex << 1) | dir (dir 0 = +x, 1 = +z).
import { RNG, hashString } from '../core/rng.js';

export const IDS = ['lockdown', 'flood', 'power', 'viral'];
export const FACILITY_ONLY = new Set(['lockdown', 'flood', 'power']);

// ---------------------------------------------------------------------------------------------- roll
export const ROLL = {
  chance: 0.34,          // per landing on a moon (quota index 2+)
  chanceEarly: 0.16,     // quota index 1, from day 2 (index 0 = the first cycle never rolls one)
  weights: { lockdown: 1, flood: 1, power: 1, viral: 0.9 },
  at: [130, 300],        // seconds after touchdown
  retry: 8,              // s between tries while a start condition fails
  giveUp: 240,           // s after `at`
};

/** { id, at } or null. Deterministic for (runId, day, moon). `facility` = the moon has a walkable facility. */
export function rollCrisis({ runId = 'x', day = 1, moon = 'm', quotaIndex = 0, facility = true, force = null } = {}) {
  const rng = new RNG(hashString(`${runId}|${day}|${moon}|ev11`));
  const p = quotaIndex >= 2 ? ROLL.chance : quotaIndex === 1 && (day | 0) >= 2 ? ROLL.chanceEarly : 0;   // wave 12: none in the first cycle, 16 % from day 2 of the second, full rate from the third
  const hit = rng.next() < p;
  const at = Math.round(rng.float(ROLL.at[0], ROLL.at[1]));
  const pool = IDS.filter((id) => facility || !FACILITY_ONLY.has(id));
  const total = pool.reduce((s, id) => s + ROLL.weights[id], 0);
  let r = rng.next() * total, id = pool[pool.length - 1];
  for (const q of pool) { r -= ROLL.weights[q]; if (r <= 0) { id = q; break; } }
  if (force) return { id: force, at: 0 };
  return hit ? { id, at } : null;
}

// ---------------------------------------------------------------------------------------------- lockdown
export const LOCK = {
  hold: 3.5,             // s of hold-E per terminal
  speed: 1.25,           // creature speed factor while sealed
  noise: 2.2,            // creature.noise() loudness while somebody hacks (once a second)
  reach: 3.2,            // m
  hostReach: 6,          // m, host tolerance
  rescueAfter: 40,       // s: a player's sector without a terminal is released after this
  cap: 300,              // s: the backup override lifts everything (no reward)
  keepBanner: 6,
};

export function edgeCells(key, w) { const ci = key >> 1; return [ci, (key & 1) === 0 ? ci + 1 : ci + w]; }
export function edgeKeyOf(a, b, w) { return b === a + 1 ? (a << 1) : b === a + w ? ((a << 1) | 1) : b === a - 1 ? (b << 1) : ((b << 1) | 1); }

/** Sector map with `sealKeys` (a Set of edge keys) as walls: { comp: Int16Array (cell -> sector id, -1 = empty), n, adj: Map id -> Set(id), border: Map id -> [edge keys] }.
 *  L = { w, h, cells (Uint8Array, 0 empty), open (Set of edge keys) }. */
export function sectors(L, sealKeys) {
  const { w, h, cells, open } = L, N = w * h, comp = new Int16Array(N).fill(-1);
  let n = 0;
  for (let s = 0; s < N; s++) {
    if (!cells[s] || comp[s] >= 0) continue;
    const q = [s]; comp[s] = n;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi], x = c % w, z = (c / w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d];
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const b = nz * w + nx;
        if (!cells[b] || comp[b] >= 0) continue;
        const k = edgeKeyOf(c, b, w);
        if (!open.has(k) || sealKeys.has(k)) continue;
        comp[b] = n; q.push(b);
      }
    }
    n++;
  }
  const adj = new Map(), border = new Map();
  for (let i = 0; i < n; i++) { adj.set(i, new Set()); border.set(i, []); }
  for (const k of sealKeys) {
    const [a, b] = edgeCells(k, w);
    if (a < 0 || b < 0 || a >= N || b >= N || comp[a] < 0 || comp[b] < 0 || comp[a] === comp[b]) continue;
    adj.get(comp[a]).add(comp[b]); adj.get(comp[b]).add(comp[a]);
    border.get(comp[a]).push(k); border.get(comp[b]).push(k);
  }
  return { comp, n, adj, border };
}

/** Pick 3 terminal sites so the lockdown can always be worked out of: one in every sector the crew stands in (up to 3), the rest in sectors that touch
 *  the ones already chosen (hacking a terminal opens every door on the edge of its sector, so the chain always opens). spots: [{ x, z, c: sector }] -> [{ spot, c }] */
export function planTerminals(sec, spots, startSectors, rng, count = 3) {
  const by = new Map();
  for (const s of spots) { if (s.c < 0) continue; (by.get(s.c) || by.set(s.c, []).get(s.c)).push(s); }
  const size = (c) => (by.get(c) || []).length;
  const picks = [];
  const seenStart = new Set();
  for (const c of startSectors) { if (c >= 0 && !seenStart.has(c) && size(c)) { seenStart.add(c); picks.push(c); } }
  picks.sort((a, b) => size(b) - size(a));
  picks.length = Math.min(picks.length, count);
  while (picks.length < count) {
    const cand = new Set();
    for (const c of picks) for (const nb of sec.adj.get(c) || []) if (!picks.includes(nb) && size(nb)) cand.add(nb);
    if (!cand.size) { for (const c of by.keys()) if (!picks.includes(c)) cand.add(c); }
    if (!cand.size) { picks.push(picks[picks.length - 1] ?? [...by.keys()][0]); continue; }   // one big sector: two terminals share it
    const list = [...cand].sort((a, b) => size(b) - size(a) || a - b);
    picks.push(list[Math.min(list.length - 1, rng.int(0, 1))]);
  }
  const out = [];
  for (const c of picks) {
    const pool = (by.get(c) || []).filter((s) => out.every((o) => Math.hypot(o.spot.x - s.x, o.spot.z - s.z) > 6));
    const src = pool.length ? pool : by.get(c) || [];
    if (!src.length) continue;
    // the farthest-ish spot from the terminals already placed reads as "across the facility"
    let best = null, bd = -1;
    for (let k = 0; k < Math.min(6, src.length); k++) {
      const s = src[rng.int(0, src.length - 1)];
      const d = out.length ? Math.min(...out.map((o) => Math.hypot(o.spot.x - s.x, o.spot.z - s.z))) : rng.float(0, 4);
      if (d > bd) { bd = d; best = s; }
    }
    out.push({ spot: best, c });
  }
  return out;
}

/** After terminal `c` is hacked its sector's border doors open: the sectors the crew can now stand in (its own + every neighbour). */
export function freedBy(sec, c) { return [c, ...(sec.adj.get(c) || [])]; }

// ---------------------------------------------------------------------------------------------- flood
export const FLOOD = { warn: 10, rise: 90, hold: 40, drain: 30, max: 1.75, air: 7, dps: 8, share: 0.3, slowFrom: 0.25 };
export const floodTotal = (F = FLOOD) => F.warn + F.rise + F.hold + F.drain;
/** water height (m above the floor) after `el` seconds */
export function floodLevel(el, F = FLOOD) {
  if (el <= F.warn) return Math.max(0, el / F.warn) * 0.05;
  const r = el - F.warn;
  if (r < F.rise) { const u = r / F.rise; return 0.05 + (F.max - 0.05) * (u * (0.55 + 0.45 * u)); }
  if (r < F.rise + F.hold) return F.max;
  const d = (r - F.rise - F.hold) / F.drain;
  return d >= 1 ? 0 : F.max * (1 - d);
}
/** the head is under water: eye (m above the floor) below the surface */
export const submerged = (eyeAboveFloor, level) => level > 0.3 && eyeAboveFloor < level;
/** a labelled height for the HUD: 0 dry, 1 ankle, 2 knee, 3 waist, 4 chest, 5 head */
export function depthLabel(level) { return level < 0.15 ? 0 : level < 0.45 ? 1 : level < 0.8 ? 2 : level < 1.15 ? 3 : level < 1.5 ? 4 : 5; }

/** Cells that flood: BFS over open edges from `sinkCells`, never the entrance surroundings (distOf <= 2) or the given excluded cells, until `share` of the floor is wet.
 *  L = { w, h, cells, open, distOf } -> [cell indices] */
export function pickBasin(L, sinkCells, exclude = new Set(), share = FLOOD.share) {
  const { w, h, cells, open, distOf } = L;
  const floor = []; for (let i = 0; i < w * h; i++) if (cells[i]) floor.push(i);
  const want = Math.max(10, Math.round(floor.length * share));
  const ok = (c) => cells[c] && !exclude.has(c) && !((distOf?.[c] ?? 99) <= 2);
  const seen = new Set(), q = [];
  for (const c of sinkCells) if (ok(c) && !seen.has(c)) { seen.add(c); q.push(c); }
  for (let qi = 0; qi < q.length && q.length < want; qi++) {
    const c = q[qi], x = c % w, z = (c / w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d];
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const b = nz * w + nx;
      if (seen.has(b) || !ok(b) || !open.has(edgeKeyOf(c, b, w))) continue;
      seen.add(b); q.push(b);
      if (q.length >= want) break;
    }
  }
  return q;
}
/** edges around a basin where the water meets an OPEN neighbour cell (a curtain is drawn there): [{ a, b, key }] with a inside, b outside */
export function basinEdges(L, basin) {
  const set = new Set(basin), out = [];
  for (const a of basin) {
    const x = a % L.w, z = (a / L.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d];
      if (nx < 0 || nz < 0 || nx >= L.w || nz >= L.h) continue;
      const b = nz * L.w + nx;
      if (set.has(b) || !L.cells[b]) continue;
      const key = edgeKeyOf(a, b, L.w);
      if (L.open.has(key)) out.push({ a, b, key, d });
    }
  }
  return out;
}
/** buoyancy for a loose item at height `y` (m above floor) in water at `level`: vertical speed towards the surface (m/s) */
export function buoyVel(y, level) { const gap = level + 0.06 - y; return gap > 0 ? Math.min(2.4, 0.6 + gap * 3.2) : gap < -0.25 ? -0.8 : gap * 2; }

// ---------------------------------------------------------------------------------------------- power reroute
export const POWER = { reach: 3, buzzEvery: 2.2, buzzLoud: 2.4, surgeLoud: 4, dim: 0.5, flicker: 0.7, cap: 420 };
/** Loads 1..3 are a shuffled permutation over the three panels; `dir` = +1 (flip the LOWEST load first) or -1 (HIGHEST first). Returns { ld: [a,b,c], dir, ord: [panel index in the order to flip] }. */
export function planPanels(rng) {
  const ld = rng.shuffle([1, 2, 3]);
  const dir = rng.chance(0.5) ? 1 : -1;
  const ord = [0, 1, 2].sort((a, b) => (ld[a] - ld[b]) * dir);
  return { ld, dir, ord };
}
/** what a flip of panel `i` does when `n` breakers are already up in order `ord` */
export function flip(ord, n, i) {
  if (n >= ord.length) return 'done';
  return ord[n] === i ? (n + 1 >= ord.length ? 'solved' : 'ok') : 'surge';
}
/** three panel sites: the first random, then the spots farthest from those already picked (with a little jitter so seeds differ) */
export function spreadSpots(spots, rng, n = 3) {
  if (spots.length <= n) return spots.slice(0, n);
  const out = [spots[rng.int(0, spots.length - 1)]];
  while (out.length < n) {
    let best = null, bd = -1;
    for (const s of spots) {
      if (out.includes(s)) continue;
      const d = Math.min(...out.map((o) => Math.hypot(o.x - s.x, o.z - s.z))) * rng.float(0.8, 1.2);
      if (d > bd) { bd = d; best = s; }
    }
    out.push(best);
  }
  return out;
}
/** feedback for the lights: 0 = no progress ... 3 = all up. Flicker (0..1 = how often a lamp drops out) and brightness (0..1 of normal) */
export function lampLook(n, surge = false) {
  if (surge) return { flicker: 1, dim: 0.25 };
  return { flicker: [POWER.flicker, 0.5, 0.3, 0][Math.max(0, Math.min(3, n))], dim: [POWER.dim, 0.65, 0.82, 1][Math.max(0, Math.min(3, n))] };
}

// ---------------------------------------------------------------------------------------------- viral
export const VIRAL = { dur: 60, mul: 3, reveal: 3, ping: 1.6, pingLoud: 4, keepBanner: 6 };
/** the trending player: uniform over the living crew, seeded by the roll key so a retry picks the same one */
export function pickTrending(ids, key = 'v') {
  const list = [...ids].sort();
  if (!list.length) return null;
  return list[new RNG(hashString(`${key}|trend`)).int(0, list.length - 1)];
}
/** value of an item secured by the trending player */
export const viralValue = (v) => Math.round((v || 0) * VIRAL.mul);

// ---------------------------------------------------------------------------------------------- payouts
/** host: { credits, xp, coin } for a finished crisis. `left` = fraction of the time budget still unused (0..1) */
export function payout(id, quotaIndex = 0, left = 0) {
  const q = Math.max(0, quotaIndex | 0), bonus = 1 + Math.max(0, Math.min(1, left)) * 0.5;
  if (id === 'lockdown') return { credits: Math.round((110 + 30 * q) * bonus), xp: Math.round((70 + 10 * q) * bonus), coin: 8 };
  if (id === 'power') return { credits: Math.round((160 + 40 * q) * bonus), xp: Math.round((90 + 12 * q) * bonus), coin: 12 };
  if (id === 'flood') return { credits: 0, xp: 40 + 5 * q, coin: 5 };
  if (id === 'viral') return { credits: 0, xp: 60 + 8 * q, coin: 15 };
  return { credits: 0, xp: 0, coin: 0 };
}

export const ALL_TEXT_IDS = IDS;
