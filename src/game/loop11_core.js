// LOOP11 - pure rules for THE LOOP (wave 11): an Exit-8 style observation corridor behind a door in the facility.
// No THREE / DOM / game access: node-testable (tools/harness/loop11.test.mjs).
//   Rule the player learns: each pass the corridor is identical to the one you know, or has exactly ONE anomaly. Anomaly -> turn back, none -> keep going.
//   Right call = exit counter +1 (goal 8), wrong call = counter back to 0 and a strike. Too many strikes = terminated (door sealed, HR sends someone).
//   The crew shares ONE corridor state: the host judges the first player to cross an end of the hall and everybody inside is reset to the start.
//   Everything a peer must agree on is either derived from (run seed, moon, pass index) here or broadcast by the host ('loops').
import { RNG, hashString } from '../core/rng.js';
import { closetCandidates, closetFrame, planFacility } from './horror_core.js';

export const LP = { GOAL: 8, LIMIT: 6, WARN: 3, SUPPORT_AT: 4, P_ANOM: 0.55, P_ANOM_HARD: 0.68, STREAK: 3, RECENT: 3 };

/** shared geometry (local space: u along the hall from its west end, v across; world = origin + (u, 0, v)) */
export const GEO = {
  ox: 14000, oz: -3000, L: 32, W: 3.6, H: 2.7, STUB: 2.2, GAP: 2.2, GAP_H: 2.4,   // the far-away hall + the dark stub behind each end
  SPAWN_U: 6.5, ARM_U: 12, TRIG: 0.9,
  R: { u0: 50, u1: 62, hw: 4, H: 3.0 },                                            // the break room behind exit 8
  FRAME: { yaw: -Math.PI / 2 },                                                    // facing +u (the game's yaw 0 looks along -z)
};

/** anomaly catalogue: tier 1 subtle, 2 noticeable, 3 scary. w = base pick weight. */
export const ANOMS = [
  { id: 'eyes', tier: 2, w: 10 }, { id: 'doornum', tier: 1, w: 10 }, { id: 'coworker', tier: 3, w: 8 }, { id: 'breath', tier: 2, w: 10 },
  { id: 'notice', tier: 2, w: 10 }, { id: 'wetsign', tier: 1, w: 9 }, { id: 'extinguisher', tier: 1, w: 9 }, { id: 'clock', tier: 1, w: 8 },
  { id: 'steps', tier: 3, w: 8 }, { id: 'lowceil', tier: 2, w: 9 }, { id: 'carpet', tier: 2, w: 9 }, { id: 'shadow', tier: 3, w: 7 },
  { id: 'posters', tier: 1, w: 10 }, { id: 'cooler', tier: 2, w: 8 }, { id: 'ajar', tier: 2, w: 8 }, { id: 'ceileyes', tier: 3, w: 6 },
  { id: 'mirror', tier: 2, w: 7 }, { id: 'exitred', tier: 1, w: 9 },
];
export const ANOM_IDS = ANOMS.map((a) => a.id);
export const ANOM_BY_ID = Object.fromEntries(ANOMS.map((a) => [a.id, a]));
/** the first anomaly of a run is one nobody can miss (a lesson, not a test) */
export const EASY = ['breath', 'carpet', 'lowceil', 'cooler'];

const hs = (...a) => hashString(a.join('|')) || 1;

export function newState(seed, moonId) {
  return { pass: 0, n: 0, wrong: 0, an: null, vs: hs('loop11.vs', seed >>> 0, moonId, 0), hist: [null], won: false, sealed: false };
}

/** content of pass `pass`: { an: id | null, vs: variant seed }. ctx = { wrong, hist } (the streak guard and the "HR is watching" bias read it). */
export function passSpec(seed, moonId, pass, ctx = {}) {
  const rng = new RNG(hs('loop11', seed >>> 0, moonId, pass));
  const vs = 1 + rng.int(0, 0x7ffffffe);
  if (pass <= 0) return { an: null, vs };
  const hist = ctx.hist || [], wrong = ctx.wrong | 0;
  if (pass === 1) return { an: rng.pick(EASY), vs };
  const tail = hist.slice(-LP.STREAK);
  const allNormal = tail.length >= LP.STREAK && tail.every((x) => x == null);
  const allAnom = tail.length >= LP.STREAK && tail.every((x) => x != null);
  let anomaly = rng.chance(wrong >= LP.WARN ? LP.P_ANOM_HARD : LP.P_ANOM);
  if (allNormal) anomaly = true; else if (allAnom) anomaly = false;
  if (!anomaly) return { an: null, vs };
  const recent = new Set(hist.slice(-LP.RECENT).filter(Boolean));
  const bag = ANOMS.filter((a) => !recent.has(a.id)).map((a) => ({ id: a.id, w: a.w * (wrong >= LP.WARN && a.tier === 3 ? 1.8 : 1) }));
  return { an: rng.weighted(bag).id, vs };
}

/**
 * The host's judgement. side: 'f' = walked out of the far end (keep going), 'b' = walked out of the near end (turn back).
 * Returns null when the run is over, else { ev: 'pass' | 'win' | 'fired', ok, side, prevAn, st } (st = the new state; pure, `st0` is not mutated).
 */
export function advance(st0, side, seed, moonId) {
  if (!st0 || st0.won || st0.sealed || (side !== 'f' && side !== 'b')) return null;
  const anomalous = st0.an != null;
  const ok = (side === 'f') === !anomalous;
  const st = { ...st0, hist: st0.hist.slice(-6) };
  st.n = ok ? st0.n + 1 : 0;
  st.wrong = st0.wrong + (ok ? 0 : 1);
  st.pass = st0.pass + 1;
  let ev = 'pass';
  if (ok && st.n >= LP.GOAL) { st.won = true; ev = 'win'; }
  else if (!ok && st.wrong >= LP.LIMIT) { st.sealed = true; ev = 'fired'; }
  if (ev === 'pass') {
    const sp = passSpec(seed, moonId, st.pass, st);
    st.an = sp.an; st.vs = sp.vs; st.hist.push(sp.an);
  }
  return { ev, ok, side, prevAn: st0.an, st };
}

/** which moons get the door: tier 2-3 always, otherwise sometimes; never HQ / company */
export function doorChance(tier) {
  if (tier === 2 || tier === 3) return 1;
  if (tier === 4) return 0.5;
  if (tier === 1) return 0.25;
  return tier > 4 ? 0.35 : 0;
}

/** where the door stands: a plain closed wall of an ordinary room that no portal closet uses. { cell: {x, z, d}, room } | null. Same on every peer (layout seed). */
export function doorSite(L, run = {}, tier = 2) {
  if (!L || !L.rooms || (L.theme === 'backrooms' || L.theme === 'mineshaft')) return null;
  const rng = new RNG(hs('loop11.door', L.seed | 0, run.moonId || ''));
  if (!rng.chance(doorChance(tier))) return null;
  const used = new Set();
  try {
    const pl = planFacility(L, { day: run.day || 1, quotaIndex: run.quotaIndex || 0 });
    for (const c of pl.closets) used.add(c.room);
    if (pl.fake) used.add(pl.fake.room);
  } catch { /* horror plan is optional */ }
  const cands = closetCandidates(L).filter((c) => !used.has(c.room) && !c.maze && c.area >= 4).sort((a, b) => a.room - b.room);
  if (!cands.length) return null;
  const near = cands.filter((c) => c.dist >= 2);   // not in the first rooms behind the entrance
  const c = rng.pick(near.length ? near : cands);
  const cell = rng.pick(c.cands);
  return { cell: { x: cell.x, z: cell.z, d: cell.d }, room: c.room };
}
export { closetFrame };

// ---- spots (local space) -------------------------------------------------------------------------------------------------------------------
const slotOf = (id) => hashString(String(id || 'x')) % 3;
export const startSpot = (id) => ({ u: GEO.SPAWN_U, v: (slotOf(id) - 1) * 0.8 });
export const rewardSpot = (id) => ({ u: GEO.R.u0 + 3, v: (slotOf(id) - 1) * 1.1 });
/** where a reward item lies: the table + the shelf, local (u, v, y above the floor) */
export const REWARD_SPOTS = [[GEO.R.u0 + 6.2, -0.6, 0.62], [GEO.R.u0 + 6.9, 0.2, 0.62], [GEO.R.u0 + 7.6, -0.3, 0.62], [GEO.R.u0 + 9.4, 3.1, 1.02], [GEO.R.u0 + 4.6, -3.2, 0.5]];
/** rare scrap the break room holds besides the badge: [item id, weight] (all existing scrap) */
export const REWARD_POOL = [['goldbar', 3], ['playbutton', 3], ['ring', 3], ['trophy', 3], ['figurine', 2], ['perfume', 2], ['liketrophy', 2]];

/** deterministic variants a peer derives from the pass variant seed (all peers agree) */
export function variantOf(an, vs) {
  const r = new RNG(vs >>> 0 || 1);
  switch (an) {
    case 'doornum': { const door = r.int(0, 3); return { door }; }
    case 'notice': return { alt: r.int(0, 5) };
    case 'wetsign': return { spot: r.int(0, 2) };
    case 'ajar': return { door: r.int(1, 3) };
    case 'ceileyes': return { u: 14 + r.int(0, 8) };
    case 'shadow': return { u: 15 + r.int(0, 8), wall: r.chance(0.5) ? 1 : -1 };
    case 'carpet': return { u: 10 + r.int(0, 10) };
    case 'lowceil': return { u0: 9 + r.int(0, 3) };
    default: return {};
  }
}
