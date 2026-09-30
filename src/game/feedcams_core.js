// FEEDCAMS core (wave 8, docs/wave8/feedcams.md): PURE rules for the Algorithm's camera network ("dodge the camera / cut the feed"). No THREE / DOM.
//   plan     planCams(layout, opts) -> deterministic camera list (every peer rebuilds the same one from the run seed + facility layout)
//   sight    camYaw (servo sweep + bait), inCone, exposure (rate of "going live"), meter / heat / tax maths
// Headings are angles in the XZ plane: direction = (cos h, sin h), so 0 = +x, PI/2 = +z.
import { RNG } from '../core/rng.js';

export const TAU = Math.PI * 2;
export const FC = {
  kind: {
    wall: { fov: 0.8, R: 13, r0: 1.5, amp: 0.7, per: [8, 12], lim: 1.25 },    // wall cam: narrow, long, ~40 deg sweep each way, cannot look back into its wall
    ceil: { fov: 0.95, R: 10, r0: 2.0, amp: 0.85, per: [9, 13], lim: null },  // ceiling dome: wider, shorter, free to turn
  },
  acquire: 2,          // seconds of full exposure before the stream goes live (the stream delay you can juke inside; sim-tuned, docs/wave8/feedcams2.md)
  closeD: 6, closeMul: 1.6,   // inside 6 m the camera locks on faster
  crouchMul: 0.55, crouchRange: 0.8,   // a sneaking / crouched player is harder to see (slower lock, shorter range)
  multiMul: 1.3,       // two cameras on you at once
  sprintMul: 1.8, sprintV: 6.5,   // movement draws the eye: a player moving faster than 6.5 m/s (sprint) locks 1.8x faster
  decay: 0.3,          // meter falls per second while unseen
  hold: 10,            // seconds ON AIR after the last exposure
  juke: 0.5,           // meter that counts as a near miss when it falls back to 0
  heat: { up: 3, down: 1.2, spike: 8, ping: 30, pingEvery: 20, pingLoud: 3, wave: 70, waveEvery: 60, max: 100 },
  tax: 0.4,            // viewer tax: share of a scrap item's value the Algorithm takes when a TAGGED player brings it into the ship
  hp: 2,               // melee hits to smash a camera
  blind: 40, zap: 25,  // seconds a spray-painted lens / a zapped camera stays out
  // [camloot] every counter costs something (docs/wave9/camloot.md): spray = quiet but only `blind` s; junction cut = a 2 s hold that makes a little noise, the camera REBOOTS after 90-120 s
  // (a warning flicker for the last `rebootWarn` s); smash = permanent but loud (creatures come to look)
  cutHold: 2, cutNoise: 0.9, cutNoiseEvery: 0.7, reboot: [90, 120], rebootWarn: 6, smashLoud: 2.5,
  lootShare: 0.6,      // share of the non-tutorial cameras that sit in the rooms holding the top loot spots (planCams)
  lootTop: 0.3,        // ...where "top" = the deepest 30 % of the scrap spots (min 3)
  off: 150,            // seconds the whole network is dark after the CUT THE FEED job (and 60 s from a mapart pylon, handled by mapart)
  bait: 5, baitLoud: 1.5, baitRange: 22, baitGap: 3,   // a loud noise turns a camera toward it for 5 s
  hz: 10,              // host vision rate
};
export const ST = { OK: 0, BLIND: 1, DEAD: 2, CUT: 3 };
export const TUT_CUT = 10;   // [cam90] credits the indoor tutorial camera pays once per run for cutting / spraying it
export const TUT_PAY = 20;   // [firstrun] credits the tutorial camera pays once per run for a clean pass
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const angDiff = (from, to) => { let d = (to - from) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };
const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
const HEAD = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

/** how many cameras this landing gets: 1 on the very first landing (the tutorial), 3-4 early, up to 10 by facility size */
export function camCount(size, day, quotaIndex, extra = 0) {
  if ((day | 0) <= 1 && (quotaIndex | 0) <= 0) return 1;
  if (extra > 0) return Math.min(12, camCount(size, day, quotaIndex) + (extra | 0));   // mapmods 'Watched': +2
  let n = clamp(Math.round(2.5 + (Number(size) || 1) * 4), 4, 10);
  if ((quotaIndex | 0) <= 0) n = Math.min(n, (day | 0) <= 2 ? 3 : 4);
  else if ((quotaIndex | 0) === 1) n = Math.min(n, 6);
  return n;
}

const runLen = (L, x, z, d) => {
  let n = 0;
  for (;;) {
    if (!L.open.has(L.edgeKey(x, z, d))) break;
    x += DX[d]; z += DZ[d];
    if (x < 0 || z < 0 || x >= L.w || z >= L.h || !L.cells[L.idx(x, z)]) break;
    if (++n >= 12) break;
  }
  return n;
};
const cellX = (L, x) => L.ox + (x + 0.5) * L.cell, cellZ = (L, z) => L.oz + (z + 0.5) * L.cell;

/** wall mount candidate facing direction d inside room r: { x, z, run } or null (needs a closed back wall) */
function wallMount(L, r, d) {
  const back = (d + 2) & 3, cells = [];
  if (d === 0 || d === 2) { const x = d === 0 ? r.x : r.x + r.w - 1; for (let z = r.z; z < r.z + r.h; z++) cells.push([x, z]); }
  else { const z = d === 1 ? r.z : r.z + r.h - 1; for (let x = r.x; x < r.x + r.w; x++) cells.push([x, z]); }
  const mid = (cells.length - 1) / 2;
  cells.sort((a, b) => Math.abs(cells.indexOf(a) - mid) - Math.abs(cells.indexOf(b) - mid));
  for (const [x, z] of cells) {
    if (L.open.has(L.edgeKey(x, z, back))) continue;   // a doorway / opening: no wall to hang on
    const off = L.cell / 2 - 0.42;
    return { x: cellX(L, x) - DX[d] * off, z: cellZ(L, z) - DZ[d] * off, run: 1 + runLen(L, x, z, d), cx: x, cz: z, d };
  }
  return null;
}

/** nearest closed wall of room r for a junction box: { x, z } just inside the wall */
function junctionWall(L, r, prefer) {
  for (let k = 0; k < 4; k++) {
    const d = (prefer + k) & 3;
    let x, z;
    if (d === 0) { x = r.x + r.w - 1; z = r.z + (r.h >> 1); } else if (d === 2) { x = r.x; z = r.z + (r.h >> 1); }
    else if (d === 1) { z = r.z + r.h - 1; x = r.x + (r.w >> 1); } else { z = r.z; x = r.x + (r.w >> 1); }
    if (L.open.has(L.edgeKey(x, z, d))) continue;
    const off = L.cell / 2 - 0.22;
    return { x: cellX(L, x) + DX[d] * off, z: cellZ(L, z) + DZ[d] * off };
  }
  return null;
}

/**
 * [firstrun] the tutorial camera's room: the room that lies BETWEEN the entrance and the nearest loot room (so the player meets the camera on the way to the
 * first loot, cannot miss it, and it never guards the loot itself). spots = the facility's scrap spots ({ room, sealed }); null -> caller falls back to "nearest room".
 */
export function tutorialRoom(L, cand, entRoom, spots, dOf) {
  if (!entRoom || !Array.isArray(spots) || !spots.length) return null;
  const lootRooms = [];
  for (const s of spots) { if (s.sealed || !(s.room >= 0)) continue; const r = L.rooms.find((q) => q.id === s.room); if (r && r !== entRoom) lootRooms.push(r); }
  if (!lootRooms.length) return null;
  const target = lootRooms.reduce((a, b) => (dOf(b) < dOf(a) ? b : a));   // the loot room nearest to the entrance by walking distance
  const tD = dOf(target);
  if (tD < 6) return null;   // loot right at the door: nothing to put in between (distOf counts BFS cells, rooms are several cells wide)
  const ax = entRoom.cx, az = entRoom.cz, bx = target.cx - ax, bz = target.cz - az, l2 = bx * bx + bz * bz || 1;
  let best = null, bs = Infinity;
  for (const r of cand) {
    const d = dOf(r);
    if (r === target || d < Math.max(3, tD * 0.3) || d >= tD - 1) continue;   // a little way in, strictly before the loot room
    const t = Math.max(0, Math.min(1, ((r.cx - ax) * bx + (r.cz - az) * bz) / l2));
    const off = Math.hypot(ax + bx * t - r.cx, az + bz * t - r.cz);   // how far the room is from the straight entrance -> loot line
    const sc = off + Math.abs(d - tD * 0.7) * 0.25;   // near the line, about two thirds of the way to the loot
    if (sc < bs) { bs = sc; best = r; }
  }
  return best;
}

/** [camloot] rooms of the top loot spots (deepest 30 %, min 3, not sealed / elevated), best first, unique, never the entrance. spots = [{ room, dist, sealed, elevated }] */
export function lootRooms(L, spots, entRoom) {
  if (!L?.rooms || !Array.isArray(spots) || !spots.length) return [];
  const ok = spots.filter((s) => s && !s.sealed && !s.elevated && s.room >= 0).sort((a, b) => (b.dist || 0) - (a.dist || 0));
  const top = ok.slice(0, Math.max(3, Math.ceil(ok.length * FC.lootTop)));
  const out = [];
  for (const s of top) { const r = L.rooms.find((q) => q.id === s.room); if (r && r !== entRoom && r.type !== 'entrance' && !out.includes(r)) out.push(r); }
  return out;
}
/** [camloot] does the room keep a cell the camera's sweep envelope never covers (behind / beside the mount, or under the lens)? then there is a blind route in */
export function blindFlank(L, cam, r) {
  for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) {
    const px = cellX(L, x), pz = cellZ(L, z), d = Math.hypot(px - cam.x, pz - cam.z);
    if (d < cam.r0 || d > cam.R || Math.abs(angDiff(cam.h, Math.atan2(pz - cam.z, px - cam.x))) > cam.amp + cam.fov / 2) return true;
  }
  return false;
}

/**
 * Deterministic camera plan. opts: { seed, day, quotaIndex, size, extra (Watched affix: +2) }. Each camera:
 * { i, kind, x, y, z, h (base heading), amp, per, ph, fov, R, r0, lim, room, tut, jb: { x, y, z, path: [[x,y,z],...] } }
 */
export function planCams(L, opts = {}) {
  if (!L || !L.rooms || !L.open) return [];
  const rng = new RNG(((opts.seed | 0) ^ 0xfeedca11 ^ Math.imul((L.seed | 0) || 1, 31) ^ Math.imul((opts.day | 0) + 3, 7919)) >>> 0);
  const n = camCount(opts.size ?? L.size, opts.day, opts.quotaIndex, opts.extra | 0);
  const floorY = L.y;
  const entRoom = L.entrance?.room;
  const cand = L.rooms.filter((r) => r !== entRoom && !['entrance', 'vault'].includes(r.type) && !r.treasure && r.w * r.h >= 2 && r.height);
  if (!cand.length) return [];
  const loot = lootRooms(L, opts.spots, entRoom);   // [camloot] rooms of the top loot spots, best first (treasure / vault rooms included: the cameras guard the money now)
  const dOf = (r) => L.distOf?.[L.idx(r.cx, r.cz)] ?? 0;
  const entDist = (r) => Math.hypot(r.cx - (entRoom?.cx ?? r.cx), r.cz - (entRoom?.cz ?? r.cz));
  const list = [];
  const build = (r, tut) => {
    const area = r.w * r.h;
    let kind = area >= 8 && rng.chance(0.7) && !tut ? 'ceil' : 'wall';
    let m = null, best = -1;
    if (kind === 'wall') {
      for (let d = 0; d < 4; d++) { const c = wallMount(L, r, d), sc = c ? c.run + rng.float(0, 1.5) : -1; if (c && sc > best) { best = sc; m = c; } }
      if (!m) kind = 'ceil';
    }
    const K = FC.kind[kind];
    let x, z, y, h, jbWall;
    if (kind === 'wall') {
      x = m.x; z = m.z; h = HEAD[m.d]; y = floorY + Math.min(2.9, r.height - 0.6);
      jbWall = { x: m.x, z: m.z };
    } else {
      x = L.ox + (r.x + r.w / 2) * L.cell; z = L.oz + (r.z + r.h / 2) * L.cell; y = floorY + r.height - 0.3;
      let bd = 0, bs = -1;
      for (let d = 0; d < 4; d++) { const s = runLen(L, r.cx, r.cz, d) + rng.float(0, 0.8); if (s > bs) { bs = s; bd = d; } }
      h = HEAD[bd]; jbWall = junctionWall(L, r, (bd + 2) & 3);
    }
    if (!jbWall) jbWall = { x, z };
    const jy = floorY + 1.3;
    const path = kind === 'wall' ? [[x, y - 0.15, z], [jbWall.x, jy + 0.22, jbWall.z]] : [[x, y, z], [jbWall.x, y, jbWall.z], [jbWall.x, jy + 0.22, jbWall.z]];
    return {
      kind, x, y, z, h, amp: tut ? 0.5 : K.amp, per: tut ? 13 : rng.float(K.per[0], K.per[1]), ph: rng.float(0, TAU),
      fov: K.fov, R: K.R, r0: K.r0, lim: K.lim, room: r.id, tut: !!tut, cx: r.cx, cz: r.cz,
      jb: { x: jbWall.x, y: jy, z: jbWall.z, path },
    };
  };
  // 1) the first camera guards the first room you meet (the tutorial camera); it is a wall cam with a slow sweep
  const sorted = cand.slice().sort((a, b) => entDist(a) - entDist(b));
  const first = tutorialRoom(L, cand, entRoom, opts.spots, dOf) || sorted.find((r) => entDist(r) >= 2) || sorted[0];
  const c0 = build(first, true);
  list.push(c0);
  // 2) the rest: rooms with long sightlines, spread out
  const spread = (r, minD) => list.every((c) => Math.hypot(r.cx - c.cx, r.cz - c.cz) >= minD);
  // 2a) [camloot] ~60 % of the non-tutorial cameras go to the loot rooms (best first); a room is only guarded when it keeps a blind flank (a way in the lens cannot see)
  const wantLoot = loot.length ? Math.min(loot.length, Math.ceil(FC.lootShare * (n - 1))) : 0;
  for (const minD of [4, 2.5, 1.5, 0]) {
    for (const r of loot) {
      if (list.length > wantLoot || list.length >= n) break;
      if (r === first || !r.height || r.w * r.h < 2 || list.some((c) => c.room === r.id) || !spread(r, minD)) continue;
      const c = build(r, false);
      if (!blindFlank(L, c, r)) continue;
      list.push(c);
    }
  }
  const scored = cand.filter((r) => r !== first).map((r) => {
    let run = 0; for (let d = 0; d < 4; d++) run = Math.max(run, runLen(L, r.cx, r.cz, d));
    return { r, s: 1 + run * 0.5 + (r.w * r.h >= 6 ? 1 : 0) + (dOf(r) > 6 ? 0.8 : 0) + rng.float(0, 2) };
  }).sort((a, b) => b.s - a.s);
  for (const minD of [5, 3.5, 2]) {
    for (const { r } of scored) {
      if (list.length >= n) break;
      if (list.includes(r) || list.some((c) => c.room === r.id) || !spread(r, minD)) continue;
      list.push(build(r, false));
    }
  }
  list.length = Math.min(list.length, n);
  list.forEach((c, i) => { c.i = i; });
  return list;
}

// ------------------------------------------------------------------------------------------------ sight
/** servo heading at host time t; bait = { h, t0, t1 } turns the camera toward a sound for a moment */
export function camYaw(cam, t, bait) {
  const s = cam.h + cam.amp * Math.sin(TAU * t / cam.per + cam.ph);
  if (!bait || t < bait.t0 || t > bait.t1 + 0.7) return s;
  const w = t < bait.t0 + 0.7 ? sm((t - bait.t0) / 0.7) : t <= bait.t1 ? 1 : 1 - sm((t - bait.t1) / 0.7);
  return s + angDiff(s, bait.h) * w;
}
/** clamp a bait heading to what the mount can physically face */
export function baitHeading(cam, h) {
  if (!cam.lim) return h;
  return cam.h + clamp(angDiff(cam.h, h), -cam.lim, cam.lim);
}
/** { d, ok } for a point (px, pz) against a camera looking along `yaw`; crouch shortens the range */
export function inCone(cam, yaw, px, pz, crouch) {
  const dx = px - cam.x, dz = pz - cam.z, d = Math.hypot(dx, dz);
  const R = cam.R * (crouch ? FC.crouchRange : 1);
  if (d < cam.r0 || d > R) return { d, ok: false };
  return { d, ok: Math.abs(angDiff(yaw, Math.atan2(dz, dx))) <= cam.fov / 2 };
}
/** meter gain per second for one exposure (d metres away) */
export function exposureRate(d, crouch, cams = 1, sprint = false) {
  let r = 1 / FC.acquire;
  if (d < FC.closeD) r *= FC.closeMul;
  if (crouch) r *= FC.crouchMul;
  else if (sprint) r *= FC.sprintMul;
  if (cams > 1) r *= FC.multiMul;
  return r;
}
/** one meter step. rate > 0 = exposed. pk = highest meter of this exposure. Returns { m, pk, live (just went live), juke (a near miss just ended) } */
export function meterStep(m, rate, dt, pk = 0) {
  const was = m;
  m = rate > 0 ? Math.min(1, m + rate * dt) : Math.max(0, m - FC.decay * dt);
  pk = Math.max(pk, m);
  const juke = was > 0 && m <= 0 && rate <= 0 && pk >= FC.juke && pk < 1;
  return { m, pk: m <= 0 ? 0 : pk, live: was < 1 && m >= 1, juke };
}
export function heatStep(h, onAir, dt) {
  const H = FC.heat;
  return clamp(h + (onAir > 0 ? H.up * Math.sqrt(onAir) : -H.down) * dt, 0, H.max);
}
/** value after the viewer tax (never below 1) and the amount taken */
export function taxOf(v) {
  v = Math.round(v) || 0;
  if (v < 2) return { v, cut: 0 };
  const cut = Math.max(1, Math.round(v * FC.tax));
  return { v: Math.max(1, v - cut), cut: Math.min(cut, v - 1) };
}
/** camera state at host time now: ST.OK when a timed state has expired */
export function stateNow(c, now) {
  if ((c.st === ST.BLIND || c.st === ST.CUT) && now >= c.until) return ST.OK;   // [camloot] a cut cable is spliced back (the camera reboots)
  return c.st;
}
/** [camloot] seconds a cut camera stays dark: 90-120 s, `u` in [0, 1) picks the point */
export const rebootIn = (u = 0.5) => FC.reboot[0] + (FC.reboot[1] - FC.reboot[0]) * clamp(u, 0, 0.999);
/** [camloot] a CUT camera is about to reboot: the lamp flickers for the last FC.rebootWarn s */
export const rebootWarn = (c, now) => c.st === ST.CUT && c.until > 0 && now < c.until && c.until - now <= FC.rebootWarn;
/** distance from point p to segment a-b (3D arrays) */
export function segNear(a, b, p, r) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = l2 > 1e-9 ? clamp((ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / l2, 0, 1) : 0;
  return Math.hypot(a[0] + ab[0] * t - p[0], a[1] + ab[1] * t - p[1], a[2] + ab[2] * t - p[2]) <= r;
}
