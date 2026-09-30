// FEEDCAMS 2 core (wave 8, docs/wave8/feedcams2.md): PURE rules for the second half of the core verb "dodge the camera / cut the feed".
// No THREE / DOM (node-tested by tools/harness/feedcams2.test.mjs, tuned by tools/sim/feedcams_sim.mjs).
//   SHOW    going live ON PURPOSE: a big item carried into the ship while ON AIR is a "showcase" (still pays the viewer tax, but sponsors tip Clout + hype)
//   DRONE   1-2 outdoor patrol drones circle the facility entrance at night; a searchlight cone on the ground = a mobile camera
//   JAM     the Signal Jammer (shop tool, battery): cameras / drones near a running jammer go blind; it hums (creatures hear it)
//   HL      "Highlights": host records on-air moments, the day summary names the best one
import { RNG } from '../core/rng.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------------------------------------------ go live on purpose
export const SHOW = {
  min: 35,        // pre-tax value that makes a taxed item a showcase (the big / rare scrap)
  tipMul: 1,      // sponsor tip in Clout = cut x tipMul (the Algorithm pays you in its own currency for what it took from the Company)
  tipMax: 40,
  perDay: 3,      // sponsors pay at most 3 showcases per player per day (hype keeps counting)
  hype: 14,       // algo2 hype points (x0.75 per repeat inside a day), viewers +12 %
};
/** Clout tip for a showcased item that paid `cut` viewer tax (0 when it is not a showcase) */
export function showTip(value, cut, paid = 0) {
  if (!(value >= SHOW.min) || !(cut > 0) || paid >= SHOW.perDay) return 0;
  return Math.min(SHOW.tipMax, Math.round(cut * SHOW.tipMul));
}

// ------------------------------------------------------------------------------------------------ outdoor patrol drones
export const DRONE = {
  night: 18 * 60,   // run.time (game minutes) from which the drones fly
  alt: 7,           // m above the ground
  R: 5.5,           // searchlight radius on the ground (crouched: x0.8)
  loop: [10, 17],   // patrol radius around its centre
  per: [30, 42],    // s per lap
  off: [6, 14],     // centre offset from the entrance (toward the ship side)
  bait: 6, baitR: 30, baitLoud: 1.5, baitGap: 4,   // a loud noise pulls the drone over for 6 s
  zap: 25,          // s blind after a Zap Gun hit
  hitR: 1.1,        // a rifle tracer this close to the body downs it
};
/** 1 drone early, 2 from quota 2 or on a Watched map. Deterministic from run seed + day + entrance. */
export function planDrones(o = {}) {
  const e = o.entrance; if (!e || o.first) return [];   // [firstrun] no outdoor drone on the very first landing: the tutorial camera indoors is the first camera the player meets
  const n = (o.quotaIndex | 0) >= 2 || o.watched ? 2 : 1;
  const rng = new RNG(((o.seed | 0) ^ 0xd20e5 ^ Math.imul((o.day | 0) + 11, 7919)) >>> 0);
  const toShip = Math.atan2(-e.z, -e.x);   // the ship lands at the origin
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = toShip + (i ? 1 : -1) * rng.float(0.2, 0.9), off = rng.float(DRONE.off[0], DRONE.off[1]);
    out.push({ i, cx: e.x + Math.cos(a) * off, cz: e.z + Math.sin(a) * off, rx: rng.float(DRONE.loop[0], DRONE.loop[1]), rz: rng.float(DRONE.loop[0], DRONE.loop[1]) * 0.7,
      rot: rng.float(0, TAU), per: rng.float(DRONE.per[0], DRONE.per[1]) * (i ? -1 : 1), ph: rng.float(0, TAU) });
  }
  return out;
}
// [cam90] the ship -> entrance walk (42-75 m) carries the game's core verb: ONE slow patrol drone, day and night, on EVERY landing (also the first one).
//   Its lit disc sweeps the direct line for part of every lap (learn the timing), and the flank opposite its side is always dark (the obvious blind route).
export const PATHD = { f: [0.42, 0.6], side: [4.5, 7], rx: [3.6, 4.8], per: [40, 54], tries: 8, margin: 2 };
/** the path drone (array, 0 or 1 entries). i = its index in the drone list. ok(x, z) rejects spots (water, rocks). Ship at the origin. */
export function planPathDrone(o = {}, i = 0) {
  const e = o.entrance, len = e ? Math.hypot(e.x, e.z) : 0; if (!e || len < 16) return [];
  const rng = new RNG(((o.seed | 0) ^ 0xd20e6 ^ Math.imul((o.day | 0) + 5, 6151)) >>> 0);
  const ux = e.x / len, uz = e.z / len;
  const rx = rng.float(PATHD.rx[0], PATHD.rx[1]), rz = rx * 0.7, rot = rng.float(0, TAU), per = rng.float(PATHD.per[0], PATHD.per[1]), ph = rng.float(0, TAU);
  let sign = rng.chance(0.5) ? 1 : -1, pick = null;
  for (let k = 0; k < PATHD.tries && !pick; k++) {
    const f = rng.float(PATHD.f[0], PATHD.f[1]), side = rng.float(PATHD.side[0], PATHD.side[1]);
    const cx = ux * len * f - uz * side * sign, cz = uz * len * f + ux * side * sign;
    const spots = [[0, 0], [rx, 0], [-rx, 0], [0, rz], [0, -rz]];
    if (!o.ok || spots.every(([a, b]) => o.ok(cx + a, cz + b))) pick = { cx, cz, side };
    else if (k % 2) sign = -sign;
    if (!pick && k === PATHD.tries - 1) pick = { cx, cz, side };
  }
  return [{ i, day: true, cx: pick.cx, cz: pick.cz, rx, rz, rot, per: per * (sign > 0 ? 1 : -1), ph, side: pick.side, sign }];
}
/** the clear flank: lateral offset (m, on the side AWAY from the drone) from the direct ship -> entrance line at which no point of the lit disc ever reaches you */
export const blindOffset = (d) => Math.ceil(Math.max(0, DRONE.R + PATHD.margin + Math.max(d.rx, d.rz) - d.side)) + 1;
/** a point on the direct line (t 0..1) shifted `off` m to the clear flank (off 0 = the straight walk) */
export function pathPoint(d, e, t, off = 0) {
  const len = Math.hypot(e.x, e.z) || 1, ux = e.x / len, uz = e.z / len;
  return { x: e.x * t + uz * off * d.sign, z: e.z * t - ux * off * d.sign };
}
const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
/** ground point under the drone at host time t. bait = { x, z, t0, t1 } pulls it toward a noise for a moment */
export function dronePos(d, t, bait) {
  const a = TAU * t / d.per + d.ph, lx = Math.cos(a) * d.rx, lz = Math.sin(a) * d.rz, c = Math.cos(d.rot), s = Math.sin(d.rot);
  let x = d.cx + lx * c - lz * s, z = d.cz + lx * s + lz * c;
  if (bait && t >= bait.t0 && t <= bait.t1 + 2) {
    const w = t < bait.t0 + 2 ? sm((t - bait.t0) / 2) : t <= bait.t1 ? 1 : 1 - sm((t - bait.t1) / 2);
    x += (bait.x - x) * w; z += (bait.z - z) * w;
  }
  return { x, z };
}
/** is (px, pz) inside the searchlight of a drone whose ground point is g? */
export function droneSees(g, px, pz, crouch) {
  const d = Math.hypot(px - g.x, pz - g.z);
  return { d: Math.hypot(d, DRONE.alt), ok: d <= DRONE.R * (crouch ? 0.8 : 1) };
}
export const isNight = (time, weather) => (Number(time) || 0) >= DRONE.night || weather === 'eclipsed';

// ------------------------------------------------------------------------------------------------ Signal Jammer
export const JAM = {
  id: 'fc_jammer', price: 40, battery: 50,   // s of use; charge it at the ship charger (nvgear rules: drains 1/s while on, anywhere in your slots)
  r: 8,            // cameras within 8 m (drones within 8 m of their ground point) are blinded
  hum: 4, humLoud: 0.7,   // every 4 s the jammer hums: a quiet noise creatures can hear
};
/** is a camera / drone at (x, y, z) inside any running jammer's bubble? jams = [{x, y, z}] */
export function jammed(x, y, z, jams, r = JAM.r) {
  for (const j of jams || []) if (Math.hypot(x - j.x, (y - j.y) * 0.6, z - j.z) <= r) return true;
  return false;
}

// ------------------------------------------------------------------------------------------------ highlights
// kind -> [base score, per-unit score]. value meaning: show = item value, juke = peak meter %, streak = seconds live in one go, fans = heat.
export const HL = {
  down: [80, 0], revive: [72, 0], drone: [58, 0], fans: [50, 0], smash: [44, 0], cut: [40, 0],
  show: [26, 0.4], juke: [18, 0.3], streak: [0, 1.4], live: [8, 0],
  crack: [42, 0.25], catch: [36, 0],   // carry2: a fragile carry breaking on camera / a thrown item caught out of the air
};
export const hlScore = (kind, v = 0) => { const k = HL[kind]; return k ? k[0] + k[1] * (Number(v) || 0) : 0; };
/** keep the better moment. m = [kind, name, value, extra, score] */
export function hlBetter(a, b) {
  if (!b) return a || null;
  if (!a) return b;
  return (b[4] || 0) > (a[4] || 0) ? b : a;
}
export const hlMake = (kind, name, v = 0, extra = '') => [kind, String(name || '?').slice(0, 24), Math.round(Number(v) || 0), String(extra || '').slice(0, 40), Math.round(hlScore(kind, v))];
