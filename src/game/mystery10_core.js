// THE FIRST UPLOAD (wave 10, module 'mystery10') - pure rules. No THREE, no DOM, no i18n: importable from Node tests.
//   12 fragments in three tiers of four (tier = how deep you are into the story). One may lie on a landing (0-1), never two.
//   The host chooses (planLanding, deterministic from runId + moon + seed + the host's collected set + the dry-landing counter) and tells everyone;
//   every peer writes what it is told into its OWN profile (profile.mystery). Milestones (4 / 8 / 12) fire once per profile.
//   4  -> the ship terminal glitches and prints a message        8  -> a room that should not exist on the next landing (+ hat)        12 -> the ending
import { RNG, hashString } from '../core/rng.js';

export const TOTAL = 12;
export const MILESTONES = [4, 8, 12];
export const TITLE = 'First Viewer';
export const HAT_KEY = 'hat:firstview';

/** where: 'in' = prefers a facility room, 'out' = prefers the outdoors, 'any'. kind decides the label on the reader.
 *  sealAt: an extra line ('<id>.s' in the text table) stays unreadable until that many fragments are recovered (re-reading old ones pays off). */
export const FRAGMENTS = [
  { id: 'f01', kind: 'post', where: 'out', at: '2011-03-02 16:41' },
  { id: 'f02', kind: 'voicemail', where: 'in', at: '2011-03-05 02:51', sealAt: 8 },
  { id: 'f03', kind: 'ticket', where: 'in', at: '2011-03-09 09:12' },
  { id: 'f04', kind: 'commit', where: 'any', at: '2011-03-11 23:58', sealAt: 8 },
  { id: 'f05', kind: 'post', where: 'out', at: '2011-06-20 17:03' },
  { id: 'f06', kind: 'voicemail', where: 'in', at: '2011-07-02 04:12', sealAt: 10 },
  { id: 'f07', kind: 'ticket', where: 'in', at: '2011-07-14 03:30', sealAt: 12 },
  { id: 'f08', kind: 'report', where: 'any', at: '2011-08-01 10:00' },
  { id: 'f09', kind: 'post', where: 'out', at: '2013-05-17 07:44', sealAt: 10 },
  { id: 'f10', kind: 'voicemail', where: 'in', at: '2013-09-30 22:15' },
  { id: 'f11', kind: 'ticket', where: 'in', at: '20XX-XX-XX 03:14' },
  { id: 'f12', kind: 'post', where: 'out', at: 'now' },
];
export const BY_ID = Object.fromEntries(FRAGMENTS.map((f) => [f.id, f]));
export const IDS = FRAGMENTS.map((f) => f.id);
export const numOf = (id) => IDS.indexOf(id) + 1;
export const tierOf = (id) => Math.floor((numOf(id) - 1) / 4);

/** the wardrobe row (cosm5_data.js appends it; the model is in src/models/mystery10_models.js). Strings are keys of mystery10_text.js. */
export const COSM = [
  { slot: 'hat', id: 'firstview', name: 'First Guest Party Hat', tier: 'legendary', src: 'secret',
    desc: 'Paper cone, one strip of tape, one candle that will not go out. Somebody turned seven in here. Only one guest ever came.',
    how: 'Find the room that should not exist (First Upload, 8 fragments)' },
];

// ------------------------------------------------------------------ profile
/** normalise profile.mystery in place and return it */
export function ensure(p) {
  if (!p || typeof p !== 'object') return null;
  const raw = p.mystery && typeof p.mystery === 'object' && !Array.isArray(p.mystery) ? p.mystery : {};
  const m = { v: 1, frags: {}, seen: {}, m: {}, dry: 0, room: 0, roomDone: 0, pend: {}, ending: 0 };
  if (raw.frags && typeof raw.frags === 'object') for (const id of IDS) { const v = +raw.frags[id]; if (v > 0) m.frags[id] = Math.min(v, 4e12); }
  if (raw.seen && typeof raw.seen === 'object') for (const id of IDS) if (raw.seen[id] && m.frags[id]) m.seen[id] = 1;
  const cnt = Object.keys(m.frags).length;
  if (raw.m && typeof raw.m === 'object') for (const k of MILESTONES) if (raw.m[k] && cnt >= k) m.m[k] = 1;
  m.dry = Math.max(0, Math.min(9, raw.dry | 0));
  m.room = raw.room ? 1 : 0; m.roomDone = raw.roomDone ? 1 : 0;
  if (raw.pend && typeof raw.pend === 'object') for (const k of ['4', 'e']) if (raw.pend[k]) m.pend[k] = 1;
  m.ending = raw.ending && cnt >= TOTAL ? 1 : 0;
  if (m.ending) delete m.pend.e;
  p.mystery = m;
  return m;
}
export const count = (p) => Object.keys(ensure(p)?.frags || {}).length;
export const has = (p, id) => !!ensure(p)?.frags[id];
export const collectedSet = (p) => new Set(Object.keys(ensure(p)?.frags || {}));
export const complete = (p) => count(p) >= TOTAL;
/** the next milestone still ahead (for the archive UI); null when finished */
export const nextMilestone = (p) => MILESTONES.find((k) => count(p) < k) || null;

/**
 * Record a fragment. -> { isNew, count, reached: [milestones crossed by this pickup and not fired before] }. Idempotent per id.
 * Milestone bookkeeping: m[k] is set here (fires once per profile); the caller runs the effects.
 */
export function collect(p, id, now = Date.now()) {
  const m = ensure(p);
  const size = () => Object.keys(m.frags).length;   // never call count(p) here: ensure() would swap p.mystery for a new object under us
  if (!m || !BY_ID[id]) return { isNew: false, count: m ? size() : 0, reached: [] };
  if (m.frags[id]) return { isNew: false, count: size(), reached: [] };
  m.frags[id] = Number.isFinite(now) && now > 0 ? Math.floor(now) : 1;
  const n = size(), reached = [];
  for (const k of MILESTONES) if (n >= k && !m.m[k]) { m.m[k] = 1; reached.push(k); }
  if (reached.includes(4)) m.pend['4'] = 1;
  if (reached.includes(8)) m.room = 1;
  if (reached.includes(12)) m.pend.e = 1;
  return { isNew: true, count: n, reached };
}
/** a queued milestone effect ('4' terminal glitch, 'e' ending scene) fires in orbit, never in the middle of a landing. true once, then false. */
export function takePending(p, key) {
  const m = ensure(p);
  if (!m || !m.pend[key]) return false;
  delete m.pend[key];
  if (key === 'e') m.ending = 1;
  return true;
}
export const hasPending = (p, key) => !!ensure(p)?.pend[key];
export const markSeen = (p, id) => { const m = ensure(p); if (m && m.frags[id]) m.seen[id] = 1; };
/** true when milestone 8 was reached and the room has not been claimed yet (the HOST'S profile decides whether the room appears) */
export const roomDue = (p) => { const m = ensure(p); return !!(m && m.room && !m.roomDone); };
export const sealedOpen = (f, n) => !f.sealAt || n >= f.sealAt;

// ------------------------------------------------------------------ landing plan (host)
export const CHANCE = { base: 0.4, perDry: 0.15, max: 0.85, nextTier: 0.25 };
/** chance that this landing carries a fragment */
export const chanceFor = (dry) => Math.min(CHANCE.max, CHANCE.base + CHANCE.perDry * Math.max(0, dry | 0));

/**
 * Which fragment (if any) lies on this landing. Deterministic in (runId, moonId, seed, collected, dry).
 * The lowest unfinished tier is served first; with 25 % one fragment of the tier above may show up instead (so the story is roughly in order, never strictly).
 */
export function pickFragment({ runId = '', moonId = '', seed = 0, collected = new Set(), dry = 0 } = {}) {
  const have = collected instanceof Set ? collected : new Set(Object.keys(collected || {}));
  const left = IDS.filter((id) => !have.has(id));
  if (!left.length) return null;
  const R = new RNG(hashString(`myst|pick|${runId}|${moonId}|${seed | 0}`));
  if (!R.chance(chanceFor(dry))) return null;
  const tier = tierOf(left[0]);
  let pool = left.filter((id) => tierOf(id) === tier);
  const above = left.filter((id) => tierOf(id) === tier + 1);
  if (above.length && R.chance(CHANCE.nextTier)) pool = above;
  return R.pick(pool);
}

/**
 * The whole landing plan. samplers (all optional; null = unavailable):
 *   outdoor(rng, r) -> {x,y,z}|null    a flat outdoor spot with clearance r
 *   facility        -> [{x,y,z,room,dist,type,sealed}]  (facility.scrapSpots)
 *   avoid           -> [{x,z,r}]       positions to keep clear (eggs, ship...)
 * -> { frag: {id, where:'in'|'out', x,y,z, yaw}|null, room: {x,y,z,yaw}|null }
 */
export function planLanding(o = {}) {
  const out = { frag: null, room: null };
  const key = `${o.runId ?? ''}|${o.moonId ?? ''}|${o.seed | 0}`;
  const avoid = o.avoid || [];
  const clear = (x, z, r) => avoid.every((a) => Math.hypot(a.x - x, a.z - z) > (a.r || 6) + r);
  const id = pickFragment(o);
  const fac = (Array.isArray(o.facility) ? o.facility : []).filter((s) => s && s.room >= 0 && !s.sealed && s.type !== 'vault' && Number.isFinite(s.x) && Number.isFinite(s.z));
  if (id) {
    const f = BY_ID[id], R = new RNG(hashString('myst|spot|' + key + '|' + id));
    const tryIn = () => {
      if (!fac.length) return null;
      // deeper rooms weigh more (unexplored), rooms with other eggs / fragments never
      const entries = fac.filter((s) => clear(s.x, s.z, 1.5)).map((s) => ({ s, w: 1 + Math.pow(Math.max(0, s.dist || 0), 1.4) }));
      if (!entries.length) return null;
      const s = R.weighted(entries).s;
      return { where: 'in', x: s.x, y: s.y ?? 0, z: s.z };
    };
    const tryOut = () => {
      if (!o.outdoor) return null;
      let best = null, bestScore = -1;
      for (let i = 0; i < 40; i++) {
        const c = o.outdoor(R, 1.2);
        if (!c || !clear(c.x, c.z, 2)) continue;
        const d = Math.hypot(c.x, c.z);
        if (d < 32) continue;                       // never right next to the ship
        const score = Math.min(d, 130) + R.float(0, 45);   // far from the ship = story spot
        if (score > bestScore) { best = c; bestScore = score; }
        if (i >= 12 && best) break;
      }
      return best ? { where: 'out', x: best.x, y: best.y, z: best.z } : null;
    };
    const spot = f.where === 'in' ? (tryIn() || tryOut()) : f.where === 'out' ? (tryOut() || tryIn()) : (R.chance(0.5) ? (tryIn() || tryOut()) : (tryOut() || tryIn()));
    if (spot) out.frag = { id, ...spot, yaw: R.float(0, Math.PI * 2) };
  }
  if (o.room && o.outdoor) {
    const R = new RNG(hashString('myst|room|' + key));
    let best = null, bestScore = -1;
    for (let i = 0; i < 80; i++) {
      const c = o.outdoor(R, 4.5);
      if (!c || !clear(c.x, c.z, 6)) continue;
      const d = Math.hypot(c.x, c.z);
      if (d < 45 || d > 135) continue;
      if (out.frag && Math.hypot(out.frag.x - c.x, out.frag.z - c.z) < 14) continue;
      const score = R.float(0, 1) + (d > 60 ? 1 : 0);
      if (score > bestScore) { best = c; bestScore = score; }
      if (i >= 30 && best) break;
    }
    if (best) out.room = { x: best.x, y: best.y, z: best.z, yaw: Math.round(R.float(0, 4)) * (Math.PI / 2) };
  }
  return out;
}

/** the counter of landings without a fragment (host profile): a miss raises the next chance, a hit resets it */
export function bumpDry(p, spawned) {
  const m = ensure(p); if (!m) return 0;
  m.dry = spawned ? 0 : Math.min(9, m.dry + 1);
  return m.dry;
}
