// gear11_core (wave 11): PURE rules + data for the five new crew gadgets (no three.js, no DOM, no game access) so
// tools/harness/gear11.test.mjs can run them in node. Units: metres, seconds.
//   DECOY SPEAKER  (rides the grenades throw pipeline, KINDS.speaker in grenades_core.js; only its numbers live here)
//   SCOUT DRONE    stepDrone (flight + wall collision through an injected ray fn), tether, ping target picking
//   DOOR JAMMER    canJam / pickDoor
//   GLOW TRAIL     dot spacing / fade / colours
//   ZIPLINE KIT    validateAnchor / zipPoint / zipSpeed / hang feet position

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------------------------------------ item data (store)
export const ITEMS11 = {
  doorjammer: { id: 'doorjammer', name: 'Door Jammer', kind: 'tool', price: 55, tier: 'uncommon', weight: 1, hands: 1, charges: 2,
    tip: 'LMB at a door: it sticks shut for 40 s. Creatures and crew cannot open it. It beeps faster before it lets go, then shrieks - the noise draws creatures.' },
  scoutdrone: { id: 'scoutdrone', name: 'Scout Drone', kind: 'tool', price: 190, tier: 'rare', weight: 3, hands: 1, battery: 30,
    tip: 'LMB: fly it for up to 30 s (battery). Your body stands still and can be hit. LMB again scans items and creatures in sight for the whole crew. E: recall. Recharge at the ship charger.' },
  glowspray: { id: 'glowspray', name: 'Glow Trail Spray', kind: 'consumable', price: 35, tier: 'common', weight: 1, hands: 1, charges: 2,
    tip: 'LMB: your footsteps leave glowing arrows for 2 minutes. Everyone sees them, they point back the way you came, and they fade after 3 minutes.' },
  ziplinekit: { id: 'ziplinekit', name: 'Zipline Kit', kind: 'tool', price: 140, tier: 'rare', weight: 4, hands: 1,
    tip: 'LMB at a wall or ceiling within 18 m (clear line of sight): a line links you to it. E on either end to slide. One line per landing. Crouch+E retracts it. Heavy loot slows the ride.' },
};
export const ITEM_IDS = Object.keys(ITEMS11);

// decoy speaker numbers (mirrored into grenades_core KINDS.speaker)
export const SPEAKER = { dur: 12, pulse: 2.4, noise: 3.2, fuse: 0.8, price: 65, stack: 2 };
export const SPEAKER_PHRASE = 'Hey, over here!';

// ------------------------------------------------------------------------------------------------ door jammer
export const JAM = { sec: 40, warn: 6, reach: 3.4, faceDot: 0.35, endNoise: 2.6 };
/** can this facility door take a jammer? (plain doors only: no vault / blast / teleport / arena / latch-shortcut, nothing already locked) */
export function canJam(door) {
  if (!door || door.kind !== 'door' || door.locked || door.teleport) return false;
  const inf = door.info || {};
  return !(inf.arena || inf.shortcut || inf.locked || inf.treasure || door.jam);
}
/** the jam-able door the player is looking at: nearest within reach, roughly in front. doors: [{id, kind, locked, pos:{x,y,z}, info}] */
export function pickDoor(doors, pos, fwd, reach = JAM.reach) {
  let best = null, bd = 1e9;
  for (const d of doors || []) {
    if (!canJam(d)) continue;
    const dx = d.pos.x - pos.x, dz = d.pos.z - pos.z, dy = (d.pos.y + 1) - pos.y;
    const dist = Math.hypot(dx, dz);
    if (dist > reach || Math.abs(dy) > 2.6) continue;
    const f = Math.hypot(fwd.x, fwd.z) || 1;
    const dot = dist < 0.6 ? 1 : (dx * fwd.x + dz * fwd.z) / (dist * f);
    if (dot < JAM.faceDot) continue;
    if (dist < bd) { bd = dist; best = d; }
  }
  return best;
}
/** seconds between warning beeps: slow, then faster and faster in the last `warn` seconds */
export function jamBeepGap(left) { return left > JAM.warn ? 99 : clamp(0.14 + left * 0.14, 0.14, 1.0); }

// ------------------------------------------------------------------------------------------------ glow trail
export const TRAIL = { sec: 120, gap: 3.4, life: 180, fade: 25, max: 320, minGap: 2.2, maxJump: 7 };
export const TRAIL_COLORS = [0x4dffb4, 0xffc247, 0xff5fa8, 0x62b8ff, 0xc38bff, 0xff7a4a];
export const trailColorIdx = (id) => { let h = 0; const s = String(id || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % TRAIL_COLORS.length; };
/** should a new dot drop? last/cur {x,y,z} or null */
export function trailShouldDrop(last, cur, gap = TRAIL.gap) {
  if (!last) return true;
  return Math.hypot(cur.x - last.x, cur.y - last.y, cur.z - last.z) >= gap;
}
/** dot brightness 0..1 by age (fades over the last TRAIL.fade seconds, gone at TRAIL.life) */
export function dotAlpha(age) {
  if (age >= TRAIL.life) return 0;
  const left = TRAIL.life - age;
  return left >= TRAIL.fade ? 1 : clamp(left / TRAIL.fade, 0, 1);
}
/** heading (radians, 0 = +Z) that points from `cur` back at `prev` */
export const backHeading = (cur, prev) => Math.atan2(prev.x - cur.x, prev.z - cur.z);
/** host: is this dot report believable? */
export function dotOk(last, p, sender, until, now) {
  if (!(until > now)) return false;
  if (Math.hypot(p.x - sender.x, p.z - sender.z) > TRAIL.maxJump || Math.abs(p.y - sender.y) > 3.5) return false;
  return !last || Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) >= TRAIL.minGap;
}

// ------------------------------------------------------------------------------------------------ zipline
export const ZIP = { range: 18, minLen: 3, postH: 2.4, hang: 2.0, speed: 9, cushionSec: 2.0, cushionFall: 5, mountReach: 2.4, minSpeedMul: 0.45 };
/** can the anchor go there? eye/hit {x,y,z}, normal {x,y,z} (wall/ceiling only: not a floor) */
export function validateAnchor(a, hit, normal) {
  if (!hit) return { ok: false, reason: 'noanchor' };
  const d = Math.hypot(hit.x - a.x, hit.y - a.y, hit.z - a.z);
  if (d > ZIP.range + 0.6) return { ok: false, reason: 'far' };
  if (d < ZIP.minLen) return { ok: false, reason: 'near' };
  if (normal && normal.y > 0.55) return { ok: false, reason: 'floor' };
  return { ok: true, len: d };
}
export const zipPoint = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u });
/** the rider's FEET hang `hang` below the rope; never below `floorY` (when known) */
export function hangFeet(a, b, u, floorY = null) {
  const p = zipPoint(a, b, u);
  let y = p.y - ZIP.hang;
  if (floorY != null && y < floorY + 0.03) y = floorY + 0.03;
  return { x: p.x, y, z: p.z };
}
/** ride speed (m/s): heavy loot / a carried body / bulky loot slow the ride down */
export function zipSpeed(carryWeight = 0, bodyCarry = false, carryMul = 1) {
  const load = clamp((carryWeight - 8) / 70, 0, 0.55);
  let s = ZIP.speed * (1 - load) * (carryMul > 0 && carryMul < 1 ? carryMul : 1);
  if (bodyCarry) s *= 0.6;
  return Math.max(ZIP.speed * ZIP.minSpeedMul * 0.5, s);
}
/** nearest end of the line the player is close enough to grab: 'a' | 'b' | null. ends are the interaction points (rope handle height) */
export function nearestEnd(a, b, pos, reach = ZIP.mountReach) {
  const da = Math.hypot(a.x - pos.x, a.z - pos.z), db = Math.hypot(b.x - pos.x, b.z - pos.z);
  const ya = Math.abs((a.y - ZIP.hang) - pos.y) < 2.6, yb = Math.abs((b.y - ZIP.hang) - pos.y) < 2.6;
  const oa = da <= reach && ya, ob = db <= reach && yb;
  if (oa && ob) return da <= db ? 'a' : 'b';
  return oa ? 'a' : ob ? 'b' : null;
}

// ------------------------------------------------------------------------------------------------ scout drone
export const DRONE = {
  sec: 30, minBattery: 3, speed: 6.5, sprint: 1.6, accel: 7, radius: 0.32, tether: 42, linkWarn: 28,
  scanCd: 3, scanRange: 16, scanCost: 1.5, pingSec: 9, maxPings: 10, hitRadius: 1.9, hitCooldownBatt: 0,
  noiseEvery: 1.6, noiseLoud: 0.28, sendHz: 8, deadSec: 20,
};
export function newDrone(pos, yaw = 0, pitch = 0) { return { x: pos.x, y: pos.y, z: pos.z, vx: 0, vy: 0, vz: 0, yaw, pitch }; }
/** advance the drone by dt. axes {f,s,u} each -1..1 (forward, strafe right, up). ray(ox,oy,oz,dx,dy,dz,len) -> {distance,nx,ny,nz}|null. returns speed (m/s) */
export function stepDrone(d, axes, dt, ray, sprint = false) {
  const sp = DRONE.speed * (sprint ? DRONE.sprint : 1);
  const sy = Math.sin(d.yaw), cy = Math.cos(d.yaw);
  const cp = Math.cos(d.pitch), sp2 = Math.sin(d.pitch);
  // forward follows the view pitch a little (feels like a camera drone), strafe is flat, up is world Y
  const fx = -sy * cp, fy = sp2 * 0.6, fz = -cy * cp;
  const rx = cy, rz = -sy;
  let wx = fx * axes.f + rx * axes.s, wy = fy * axes.f + axes.u, wz = fz * axes.f + rz * axes.s;
  const wl = Math.hypot(wx, wy, wz);
  if (wl > 1) { wx /= wl; wy /= wl; wz /= wl; }
  const k = 1 - Math.exp(-DRONE.accel * dt);
  d.vx += (wx * sp - d.vx) * k; d.vy += (wy * sp - d.vy) * k; d.vz += (wz * sp - d.vz) * k;
  const step = (dx, dy, dz) => {
    const L = Math.hypot(dx, dy, dz);
    if (L < 1e-6) return;
    const ux = dx / L, uy = dy / L, uz = dz / L;
    const h = ray ? ray(d.x, d.y, d.z, ux, uy, uz, L + DRONE.radius) : null;
    if (h && h.distance < L + DRONE.radius) {
      const go = Math.max(0, h.distance - DRONE.radius);
      d.x += ux * go; d.y += uy * go; d.z += uz * go;
      // slide: drop the velocity component into the wall
      const vn = d.vx * (h.nx || 0) + d.vy * (h.ny || 0) + d.vz * (h.nz || 0);
      if (vn < 0) { d.vx -= vn * h.nx; d.vy -= vn * h.ny; d.vz -= vn * h.nz; }
    } else { d.x += dx; d.y += dy; d.z += dz; }
  };
  // axis-separated moves so a wall on one axis never stops the others
  step(d.vx * dt, 0, 0); step(0, d.vy * dt, 0); step(0, 0, d.vz * dt);
  return Math.hypot(d.vx, d.vy, d.vz);
}
/** keep the drone inside the tether radius around the body; returns 0..1 link quality */
export function tether(d, body, R = DRONE.tether) {
  const dx = d.x - body.x, dy = d.y - body.y, dz = d.z - body.z, L = Math.hypot(dx, dy, dz);
  if (L > R) { const k = R / L; d.x = body.x + dx * k; d.y = body.y + dy * k; d.z = body.z + dz * k; d.vx *= 0.5; d.vy *= 0.5; d.vz *= 0.5; }
  return linkQuality(Math.min(L, R));
}
export const linkQuality = (dist) => clamp(1 - Math.max(0, dist - DRONE.linkWarn) / (DRONE.tether - DRONE.linkWarn), 0, 1);
/** what a scan reveals: candidates [{k:'i'|'c', x,y,z, name}], drone pos, LOS fn -> nearest first, creatures before items, capped */
export function pickTargets(cands, dpos, los, range = DRONE.scanRange, cap = DRONE.maxPings) {
  const out = [];
  for (const c of cands) {
    const d = Math.hypot(c.x - dpos.x, c.y - dpos.y, c.z - dpos.z);
    if (d > range) continue;
    if (los && !los(dpos, c)) continue;
    out.push({ ...c, d });
  }
  out.sort((a, b) => (a.k === b.k ? a.d - b.d : a.k === 'c' ? -1 : 1));
  return out.slice(0, cap);
}
/** is a creature at (x,y,z) close enough to smash the drone? */
export const droneHit = (d, c) => Math.hypot(d.x - c.x, d.y - c.y, d.z - c.z) < DRONE.hitRadius;
