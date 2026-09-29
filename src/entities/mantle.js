// Mantle / vault (wave 8 movefix). Pure helpers: probeLedge() looks ahead of the local player with a handful of Rapier rays and
// returns a move plan, mantlePose() samples it. LocalPlayer (localplayer.js) runs the ~0.4 s scripted move when jump is pressed
// facing an obstacle. Only STATIC geometry counts (doors are never vaulted); tall walls are rejected because the top ray starts inside them.
import { G } from '../physics/physics.js';
import { addTranslations } from '../core/i18n.js';

export const MANTLE = {
  minH: 0.5,        // below this the controller's autostep (0.42) already walks over it
  maxH: 1.6,        // ledge height a mantle can reach (feet -> top)
  vaultH: 1.05,     // thin obstacles up to this height are vaulted OVER (fences, crates), keeping momentum
  reach: 0.55,      // wall must be this close to the capsule surface (0.9 while sprinting)
  radius: 0.34,
  needDepth: 0.75,  // top surface depth that counts as a standable ledge
  stamina: 10, vaultStamina: 5,
  heavyMul: 0.72,   // weightMul below this = "too heavy to climb"
};
const R = MANTLE.radius;
const SAMPLES = [0.05, 0.15, 0.3, 0.5, 0.7, 0.9];

addTranslations({ 'Too heavy to climb!': 'Bu yükle tırmanılmaz!' });
addTranslations({ 'Too heavy to climb!': 'С таким грузом не залезть!' }, 'ru');

/**
 * @param phys Physics wrapper (raycast(origin, dir, maxDist, mask))
 * @param feet {x,y,z} feet position; yaw camera yaw; opt {sprint}
 * @returns null | { kind: 'mantle'|'vault', H, topY, to:{x,y,z}, dur, dirX, dirZ }
 */
export function probeLedge(phys, feet, yaw, opt = {}) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const ray = (x, y, z, dx, dy, dz, len, mask = G.STATIC) => phys.raycast({ x, y, z }, { x: dx, y: dy, z: dz }, len, mask);
  const reach = R + (opt.sprint ? 0.9 : MANTLE.reach);
  // 1. a steep face right in front of us at knee height (slopes / terrain are ignored)
  const wall = ray(feet.x, feet.y + MANTLE.minH, feet.z, fx, 0, fz, reach);
  if (!wall) return null;
  const n = wall.normal;
  if (n.y > 0.35 || -(n.x * fx + n.z * fz) < 0.45) return null;
  const dw = wall.distance;
  // 2. top surface: drop rays just beyond the face, starting above the maximum reachable height
  const top0 = feet.y + MANTLE.maxH + 0.2;
  const drop = (off) => {
    const h = ray(feet.x + fx * (dw + off), top0, feet.z + fz * (dw + off), 0, -1, 0, MANTLE.maxH + 0.2 + 1.6);
    return h ? { y: top0 - h.distance, ok: h.distance > 0.005 && h.normal.y > 0.7 } : null;
  };
  const first = drop(SAMPLES[0]);
  if (!first || !first.ok) return null;       // inside a tall wall, or no flat top
  const topY = first.y, H = topY - feet.y;
  if (H < MANTLE.minH - 0.05 || H > MANTLE.maxH) return null;
  let depth = SAMPLES[0] + 0.1;
  for (let i = 1; i < SAMPLES.length; i++) {
    const s = drop(SAMPLES[i]);
    if (!s || !s.ok || Math.abs(s.y - topY) > 0.2) break;
    depth = SAMPLES[i] + 0.1;
  }
  // 3. headroom for the lift and for standing on top
  if (ray(feet.x, feet.y + 1.0, feet.z, 0, 1, 0, H + 0.75, G.STATIC | G.DOOR)) return null;
  let kind, off;
  if (depth >= MANTLE.needDepth) { kind = 'mantle'; off = 0.4; }
  else if (H <= MANTLE.vaultH + (opt.sprint ? 0.1 : 0)) { kind = 'vault'; off = depth + 0.45; }
  else return null;
  const dx = feet.x + fx * (dw + off), dz = feet.z + fz * (dw + off);
  let toY = topY;
  if (kind === 'vault') {                      // land on whatever floor is behind the obstacle
    const f = ray(dx, topY + 0.3, dz, 0, -1, 0, 2.6);
    if (!f || f.normal.y < 0.7) return null;
    toY = topY + 0.3 - f.distance;
    if (toY - feet.y > 0.5 || toY - feet.y < -1.5) return null;
  }
  if (ray(dx, toY + 0.05, dz, 0, 1, 0, 1.75, G.STATIC | G.DOOR)) return null;                       // headroom at the destination
  if (ray(feet.x, topY + 0.35, feet.z, fx, 0, fz, dw + off + R, G.STATIC | G.DOOR)) return null;    // nothing above the top in the way
  const low = opt.sprint && H <= MANTLE.vaultH + 0.1;   // sprinting over something low: a quick hop that keeps the run going
  const dur = kind === 'mantle' ? (low ? 0.34 : 0.4 + 0.1 * (H - MANTLE.minH)) : (opt.sprint ? 0.32 : 0.38);
  return { kind, H, topY, to: { x: dx, y: toY, z: dz }, dur, dirX: fx, dirZ: fz, from: { x: feet.x, y: feet.y, z: feet.z } };
}

const smooth = (u) => u * u * (3 - 2 * u);
/** Feet position at progress u (0..1). Mantle: pull UP first, then forward. Vault: forward with an arc over the top. */
export function mantlePose(m, u, out = { x: 0, y: 0, z: 0 }) {
  const a = m.from, b = m.to;
  if (m.kind === 'mantle') {
    const up = 1 - (1 - Math.min(1, u / 0.65)) ** 2;
    const fw = smooth(Math.max(0, (u - 0.3) / 0.7));
    out.x = a.x + (b.x - a.x) * fw; out.z = a.z + (b.z - a.z) * fw; out.y = a.y + (b.y - a.y) * up;
  } else {
    const s = smooth(u), bump = Math.max(0.1, m.topY + 0.12 - (a.y + b.y) / 2);
    out.x = a.x + (b.x - a.x) * s; out.z = a.z + (b.z - a.z) * s; out.y = a.y + (b.y - a.y) * s + bump * Math.sin(Math.PI * u);
  }
  return out;
}
