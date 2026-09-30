// Pure counterplay rules. Each attack locks information before the hit.
export const IDS = Object.freeze({ printer: 'c13_printer', checksum: 'c13_checksum' });
export const TUNE = Object.freeze({ windup: 1.4, laneWidth: 0.8, laneLength: 12, scanTime: 1.6, quietTime: 0.55, hitReach: 2.1, rest: 4 });
export function inPrintLane(p, origin, yaw) {
  if (Math.abs(p.y - origin.y) > 2) return false;
  const x = p.x - origin.x, z = p.z - origin.z;
  const along = x * Math.sin(yaw) + z * Math.cos(yaw);
  const across = x * Math.cos(yaw) - z * Math.sin(yaw);
  return along > 0 && along <= TUNE.laneLength && Math.abs(across) < TUNE.laneWidth;
}
export const quietEnough = (p) => (p.noise || 0) < 0.12 && (p.voice || 0) < 0.12;
export function quietStep(held, p, dt) { return quietEnough(p) ? held + dt : 0; }
