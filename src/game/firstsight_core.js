// FIRST SIGHTING core (wave 8 morning review task 2, docs/wave8/firstsight.md). Pure maths + data: no THREE / DOM, node-testable
// (tools/harness/firstsight.test.mjs). The game glue (host staging, client tell / zoom) is src/game/firstsight.js.

export const FS = Object.freeze({
  dMin: 4.5, dMax: 10,        // m: the creature stands 4.5-10 m ahead of the crewmate (wave 9: near enough to read as a body, not two dots)
  dPref: 6,               // m: default preferred distance; distFor(h, w) pulls it in (down to dMin + 0.1) for a thin body so it still reaches coverMin at zoomMax
  coverMin: 0.06,         // share of the frame (bbox) a staged body should reach at zoomMax: distFor picks the distance for it. NOT the 8 % of the spec (see docs/wave9/sighting.md)
  dists: Object.freeze([4.5, 5, 5.5, 6, 7, 8, 9, 10]),   // m: distances scored along each direction (plus the corridor end when it is closer than dFar)
  dFar: 10.5,               // m: the corridor end is scored as an extra spot when it is closer than this
  cone: Object.freeze([0, 6, -6, 12, -12, 18, -18]),   // deg off the look direction that are tried (inside the view cone, centre first)
  step: 0.5,                // m: floor march step along each direction
  wallPad: 0.7,             // m: keep this far off the wall that ends a corridor
  wallBonus: 1.5,             // m: a spot this close to the wall ending its line reads as "at the end of the corridor / across the room"
  litBonus: 1.1,            // score for standing right under a lamp (lit() 0..1; ~7 m of distance): a lit body reads, an unlit one is two eyes
  litMin: 0.4,              // lit() at or above this (and d <= litMaxD) = a real lamp spot: those are tried first (line of sight), the rest are the fallback (the body-lift covers a room without a lamp)
  litMaxD: 8,               // m: a lamp spot farther than this is no preferred spot (too small a body)
  labelAfter: 2,            // s after it appears before the '??? UNKNOWN ENTITY' aim label may show (identify.js asks firstSight.labelHold)
  lift: Object.freeze([0.26, 0.17, 0.11]),   // warm emissive 'practical' added to the staged body (client, emissive only, no light) so the body reads even without a lamp
  inDelay: 5,               // s a crewmate must have been in the creature's zone (inside / outside) before the beat
  stareAt: 0.8,             // s after it appears it turns to stare: tell sound + eyes + stare pose
  hold: Object.freeze([2, 4]),   // s the stare lasts (seeded per run)
  turnRate: 2.6,            // rad/s: the head-turn toward the crewmate is slow and deliberate
  leaveMax: 4.5,            // s it may walk off before it is removed anyway
  leaveR: 9, leaveLen: 14,  // m: where it walks to (a hidden floor cell within leaveR, path at most leaveLen)
  near: 2.5,                // m: a crewmate this close ends the beat (it never becomes a melee; it is frozen, so this is only checked once the stare has begun: nearFrom)
  nearFrom: 1.4,            // s: the near abort is armed after this (stareAt + 0.6), so a crewmate walking at it still gets the tell + zoom + caption
  walkMax: 1.5,             // m/s: the host stages only for a crewmate slower than this (a walking / sprinting one would be on top of it before the tell)
  retries: 2,               // an abort before the stare (nothing seen yet) un-marks the creature and retries, at most this many times per landing
  chaseR: 40,               // m: a hunting creature this close to any crewmate = a chase: no beat
  metR: 18,                 // m: a pool creature this close to a crewmate counts as met (no beat for it later)
  nearbyR: 34,              // m: clients this close get the flicker / sound / caption
  searchGap: 0.5,           // s between two spot searches (host)
  zoomMax: 1.8,             // bodycam autofocus: max zoom (1 = off). Wave 9: gentler (was 3.6) because the body now stands 6-10 m away
  zoomCover: 0.08,          // share of the frame the autofocus AIMS at with its assumed body width (max(2 r, 0.45 h)); capped by zoomMax, so a thin body lands at ~4-6 %, not 8 %
  ndcKeep: 0.55,            // the body's centre stays inside this share of the half-screen while zoomed
  disguise: Object.freeze(['lm_lootmimic', 'lm_masked', 'mimic', 'mr_copy']),   // the disguise IS their rule: a staged sighting would spoil it
});

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** which pool creature gets its first sighting: pool order (seeded by threatpool), not met this run, a stageable body (defOk), not a
 *  disguise, and its zone holds a crewmate who is ready (zoneOk). null = nothing to stage right now. */
export function pickType(pool, seen, zoneOk, defOk) {
  for (const id of pool?.all || []) {
    if ((seen || []).includes(id) || FS.disguise.includes(id) || !defOk(id)) continue;
    if (zoneOk(id)) return id;
  }
  return null;
}
/** every stageable pool creature has been met: no more beats for this pool */
export const poolDone = (pool, seen, defOk) => !(pool?.all || []).some((id) => !(seen || []).includes(id) && !FS.disguise.includes(id) && defOk(id));

/**
 * Best readable spot in a crewmate's view cone.
 * o = { eye:{x,y,z}, look:{x,z} (horizontal look direction), feetY, out (outdoors: ridge bonus),
 *       ground(x, z) -> floor y | null (null = wall / off the map), los(x, y, z) -> clear view from the eye,
 *       lit(x, z) -> 0..1 how well a lamp lights that spot (optional), rnd() -> [0, 1) seeded tie-break }
 * -> { x, y, z, d, a (deg off the look), wall, score, heading (rad, creature-yaw convention: facing (sin, cos)) } | null
 */
export function findSpot(o) {   // o.dPref (optional) overrides FS.dPref
  const ll = Math.hypot(o.look.x, o.look.z);
  if (!(ll > 1e-6)) return null;
  const heading = Math.atan2(o.look.x / ll, o.look.z / ll);
  const far = FS.dMax + FS.wallPad;
  const cands = [];
  for (const deg of FS.cone) {
    const a = heading + (deg * Math.PI) / 180, dx = Math.sin(a), dz = Math.cos(a);
    let D = far, wall = false;
    for (let s = 1.5; s <= far; s += FS.step) {
      if (o.ground(o.eye.x + dx * s, o.eye.z + dz * s) == null) { D = s - FS.step; wall = true; break; }
    }
    const end = D - FS.wallPad;
    if (end < FS.dMin) continue;
    const ds = FS.dists.filter((d) => d <= end);
    if (end <= FS.dFar && !ds.includes(end)) ds.push(end);
    for (const d of ds) {
      const x = o.eye.x + dx * d, z = o.eye.z + dz * d, y = o.ground(x, z);
      if (y == null) continue;
      const atWall = wall && end - d < FS.wallBonus;
      const lit = clamp(+(o.lit?.(x, z)) || 0, 0, 1);
      const score = -0.15 * Math.abs(d - (o.dPref ?? FS.dPref)) - 0.05 * Math.abs(deg) + (atWall ? 0.4 : 0) + FS.litBonus * lit
        + (o.out ? 0.2 * clamp(y - (o.feetY ?? y), 0, 4) : 0) + 0.02 * (o.rnd ? o.rnd() : 0);
      cands.push({ x, y, z, d, a: deg, wall: atWall, lit, score, heading: a });
    }
  }
  cands.sort((p, q) => q.score - p.score);
  const lamp = (c) => !!o.lit && c.lit >= FS.litMin && c.d <= FS.litMaxD;   // a ranking, not a filter: lamp spots first, the rest when none of them has a clear view
  const order = [...cands.filter(lamp).slice(0, 10), ...cands.filter((c) => !lamp(c)).slice(0, 10)];
  for (const c of order) if (o.los(c.x, c.y + 1.3, c.z) && o.los(c.x, c.y + 0.5, c.z)) return c;   // props / a shut door in the way: next best
  return null;
}

/** beat timeline: 'in' (appears side-on) -> 'stare' (turns, tell) -> 'go' (walks off) */
export const beatPhase = (t, hold) => (t < FS.stareAt ? 'in' : t < FS.stareAt + hold ? 'stare' : 'go');
export const holdFor = (u) => FS.hold[0] + (FS.hold[1] - FS.hold[0]) * clamp(u, 0, 1);
/** yaw (creature convention) that faces from (x,z) toward (tx,tz) */
export const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
export const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/**
 * Bodycam autofocus: zoom that makes an h x w m body at d m cover `cover` of the frame (vertical fov in degrees, aspect w/h), capped by
 * zmax and so the body stays well inside the frame (ndc = its largest |NDC| offset from the centre at zoom 1). 1 = no zoom.
 */
export function zoomFor(d, h, w, fovDeg, aspect, ndc = 0, cover = FS.zoomCover, zmax = FS.zoomMax) {
  if (!(d > 0) || !(h > 0) || !(zmax > 1)) return 1;
  const fh = 2 * d * Math.tan((fovDeg * Math.PI) / 360), area = fh * fh * (aspect || 16 / 9);
  let z = Math.sqrt(cover / Math.max((h * Math.max(w, 0.1)) / area, 1e-6));
  if (ndc > 0.01) z = Math.min(z, FS.ndcKeep / ndc);
  return clamp(z, 1, zmax);
}
/** preferred distance for an h x w m body: the nearest-first distance at which it covers FS.coverMin of the frame at zoomMax (fov deg, aspect),
 *  clamped to [dMin + 0.1, dPref]: a wide body keeps dPref, a thin tall one comes in to ~4.6-5 m */
export function distFor(h, w, fovDeg = 72, aspect = 16 / 9, cover = FS.coverMin, zmax = FS.zoomMax) {
  if (!(h > 0) || !(w > 0)) return FS.dPref;
  const t = Math.tan((fovDeg * Math.PI) / 360), d = zmax * Math.sqrt((h * w) / (4 * t * t * (aspect || 16 / 9) * cover));
  return clamp(d, FS.dMin + 0.1, FS.dPref);
}
/** share of the frame an h x w m body covers at d m (zoom z) */
export function coverOf(d, h, w, fovDeg, aspect, z = 1) {
  const fh = (2 * d * Math.tan((fovDeg * Math.PI) / 360)) / z;
  return (h * w) / (fh * fh * (aspect || 16 / 9));
}
