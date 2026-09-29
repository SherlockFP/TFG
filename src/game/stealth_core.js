// STEALTH wave 4 - pure rules (no three.js, no DOM, no game access) so tools/harness/stealth_noise.test.mjs can run them in node.
//   NOISE / SURFACE      how loud every action is (the `loud` unit of creatures.noise(): a creature hears a noise at  loud * hearR - distance > 0 )
//   stepLoudness         walk / sprint / crouch-walk / sneak on a surface
//   wallsBetween / effectiveDistance   sound does not go through walls: each wall crossed adds WALL_COST metres, closed doors add half of that
//   NoiseBatcher / sanitizeEvents      compact, rate-limited client -> host noise events ('stn' message, host validates)
//   bandOf / radiusOf    HUD meter helpers
//   TIPS                 short list for the guide registry (docs/wave4/stealth.md)
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** continuous noise level of the player body (0..1). Creatures multiply it with their hearing radius. */
export const NOISE = {
  sneak: 0.02,        // Alt held: near silent
  crouch: 0.04,       // crouch-walking is a sneak too
  walk: 0.30,
  sprint: 0.70,
  wadeAdd: 0.10, wadeMul: 1.6,   // splashing
  jump: 0.55,
  landMin: 0.20,      // landing = clamp(fall speed / 12, landMin, 1)
  door: 0.35, doorSlam: 0.65,
  itemDropMin: 0.15, itemDropMax: 0.9,   // clamp(impact speed / 14)
  throwWhoosh: 0.12,
  glassBonus: 1.6,    // fragile items (bottles, vases) are louder when they break
  stickEvent: 3.0,    // clamp for a single reported event (host)
};
/** sneaking: speed (m/s) and stamina regen factor while moving (walking is 0.7, resting 1.1) */
export const SNEAK = { speed: 2.1, crouchSpeed: 2.6, regenMoving: 1.1, stride: 1.25, stepVol: 0.04 };

/** floor material multiplier on footstep loudness (surface ids come from Game.footstep: concrete wood metal carpet tile gravel water grass snow mud ...) */
export const SURFACE = { metal: 1.5, grate: 1.6, water: 1.5, wade: 1.5, gravel: 1.25, tile: 1.15, wood: 1.1, concrete: 1, sand: 0.8, mud: 0.8, grass: 0.75, carpet: 0.6, snow: 0.6, cloth: 0.55, rug: 0.55 };
export const surfaceMul = (name) => SURFACE[name] ?? 1;

/** body noise for one frame of moving on the ground. flags: { sneak, crouch, sprint, wading }, perk: 1 or 0.5 (lightfoot) */
export function stepLoudness(flags, surface = 'concrete', perk = 1) {
  let base = flags.sneak ? NOISE.sneak : flags.crouch ? NOISE.crouch : flags.sprint ? NOISE.sprint : NOISE.walk;
  base *= perk;
  let v = base * surfaceMul(surface);
  if (flags.wading) v = v * NOISE.wadeMul + NOISE.wadeAdd;
  return clamp(v, 0, 1.2);
}
export const landLoudness = (fallSpeed) => clamp(fallSpeed / 12, NOISE.landMin, 1);
export const itemImpactLoudness = (speed, fragile = false) => clamp((speed / 14) * (fragile ? NOISE.glassBonus : 1), NOISE.itemDropMin, NOISE.itemDropMax);

/** HUD bands */
export function bandOf(loud) {
  if (loud < 0.06) return 'SILENT';
  if (loud < 0.2) return 'QUIET';
  if (loud < 0.45) return 'STEADY';
  return 'LOUD';
}
/** metres a creature with hearing radius `hearR` can hear this noise over open ground */
export const radiusOf = (loud, hearR = 16) => loud * hearR;

// ------------------------------------------------------------------------------------------------ propagation
export const WALL_COST = 7;          // metres of extra "distance" per wall crossed (a corridor around the corner is not modelled, walls just muffle)
export const DOOR_COST = 3.5;        // a closed (unlocked) door in the line of sound
export const MAX_WALLS = 5;

/**
 * Number of wall crossings on the straight line between two world points over the facility nav grid (NavGrid.canStep decides what a wall is:
 * closed layout edges, solid rock, locked / closed vault doors). `doorAt(edgeKey)` -> true for a CLOSED plain door (counts DOOR_COST / WALL_COST).
 * Returns { walls, doors }.
 */
export function wallsBetween(nav, ax, az, bx, bz, doorAt = null) {
  let [x0, z0] = nav.toGrid(ax, az);
  const [x1, z1] = nav.toGrid(bx, bz);
  const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
  const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
  let err = dx - dz, guard = 0, walls = 0, doors = 0, inWall = false;
  const L = nav.layout;
  while ((x0 !== x1 || z0 !== z1) && guard++ < 260) {
    const e2 = 2 * err;
    let nx = x0, nz = z0;
    if (e2 > -dz) { err -= dz; nx += sx; }
    if (e2 < dx) { err += dx; nz += sz; }
    // diagonal steps are checked as their two orthogonal halves (a sound cannot squeeze through a wall corner)
    const blocked = (nx !== x0 && nz !== z0) ? !(nav.canStep(x0, z0, nx, z0) && nav.canStep(nx, z0, nx, nz)) : !nav.canStep(x0, z0, nx, nz);
    if (blocked) { if (!inWall) { inWall = true; walls++; if (walls >= MAX_WALLS) break; } }
    else {
      inWall = false;
      if (doorAt && L && nav.sub) {
        const s = nav.sub, acx = Math.floor(x0 / s), acz = Math.floor(z0 / s), bcx = Math.floor(nx / s), bcz = Math.floor(nz / s);
        if (acx !== bcx || acz !== bcz) {
          const key = bcx > acx ? L.edgeKey(acx, acz, 0) : bcx < acx ? L.edgeKey(acx, acz, 2) : bcz > acz ? L.edgeKey(acx, acz, 1) : L.edgeKey(acx, acz, 3);
          if (doorAt(key)) doors++;
        }
      }
    }
    x0 = nx; z0 = nz;
  }
  return { walls, doors };
}

/** "acoustic distance" between a sound source and a listener: metres + WALL_COST per wall (+ DOOR_COST per closed door). nav null = open air. */
export function effectiveDistance(nav, a, b, doorAt = null) {
  const dx = a.x - b.x, dz = a.z - b.z, dy = (a.y ?? 0) - (b.y ?? 0);
  const d = Math.hypot(dx, dz, Math.abs(dy) > 3 ? dy : 0);
  if (!nav || d < 1.6) return d;
  const { walls, doors } = wallsBetween(nav, a.x, a.z, b.x, b.z, doorAt);
  return d + walls * WALL_COST + doors * DOOR_COST;
}

// ------------------------------------------------------------------------------------------------ client -> host events ('stn')
export const EVENT_KINDS = { jump: 0, land: 1, door: 2, drop: 3, impact: 4, throw: 5, use: 6, lure: 7, hatch: 8 };
export const KIND_BY_ID = Object.fromEntries(Object.entries(EVENT_KINDS).map(([k, v]) => [v, k]));

/** Client-side queue: at most `perSec` events per second, near-duplicates (same kind within `dupMs` and 1.5 m) merged into the louder one. */
export class NoiseBatcher {
  constructor({ perSec = 8, dupMs = 180, flushMs = 120, maxPerFlush = 6 } = {}) {
    Object.assign(this, { perSec, dupMs, flushMs, maxPerFlush });
    this.q = []; this.tokens = perSec; this.lastRefill = 0; this.lastFlush = 0;
  }
  add(kind, x, y, z, loud, nowMs) {
    if (!(loud > 0.02) || ![x, y, z, loud].every(Number.isFinite)) return false;
    const k = EVENT_KINDS[kind] ?? EVENT_KINDS.use;
    const dup = this.q.find((e) => e[0] === k && nowMs - e[5] < this.dupMs && Math.hypot(e[1] / 10 - x, e[3] / 10 - z) < 1.5);
    const enc = [k, Math.round(x * 10), Math.round(y * 10), Math.round(z * 10), Math.round(clamp(loud, 0, NOISE.stickEvent) * 100), nowMs];
    if (dup) { if (enc[4] > dup[4]) dup[4] = enc[4]; return true; }
    this.refill(nowMs);
    if (this.tokens < 1) return false;
    this.tokens--;
    if (this.q.length >= 24) this.q.shift();
    this.q.push(enc);
    return true;
  }
  refill(nowMs) {
    const dt = Math.max(0, nowMs - this.lastRefill) / 1000;
    this.lastRefill = nowMs;
    this.tokens = Math.min(this.perSec, this.tokens + dt * this.perSec);
  }
  /** events to send now (compact int arrays without the timestamp) or null */
  drain(nowMs) {
    if (!this.q.length || nowMs - this.lastFlush < this.flushMs) return null;
    this.lastFlush = nowMs;
    const out = this.q.splice(0, this.maxPerFlush).map((e) => e.slice(0, 5));
    return out;
  }
}

/** Host side: validate a batch from a client. Returns [{ kind, x, y, z, loud }] (at most 6, loud clamped, coordinates finite and within `range` of the sender). */
export function sanitizeEvents(list, senderPos = null, range = 60) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const e of list.slice(0, 6)) {
    if (!Array.isArray(e) || e.length < 5) continue;
    const [k, x, y, z, l] = e.map(Number);
    if (![k, x, y, z, l].every(Number.isFinite)) continue;
    const px = x / 10, py = y / 10, pz = z / 10;
    if (senderPos && Math.hypot(px - senderPos.x, pz - senderPos.z) > range) continue;   // a client can only make noise near itself (thrown items travel, hence the range)
    out.push({ kind: KIND_BY_ID[k | 0] || 'use', x: px, y: py, z: pz, loud: clamp(l / 100, 0, NOISE.stickEvent) });
  }
  return out;
}

/** host: per-sender token bucket so a modified client cannot flood the creature AI */
export function makeRateLimiter(perSec = 10, burst = 12) {
  const buckets = new Map();
  return (id, nowMs) => {
    let b = buckets.get(id);
    if (!b) { b = { t: burst, at: nowMs }; buckets.set(id, b); }
    b.t = Math.min(burst, b.t + ((nowMs - b.at) / 1000) * perSec); b.at = nowMs;
    if (b.t < 1) return false;
    b.t -= 1;
    return true;
  };
}

// ------------------------------------------------------------------------------------------------ guide tips (docs/wave4/stealth.md, for the guide registry)
export const TIPS = [
  { id: 'sneak', title: 'Sneaking', body: 'Hold Alt (or crouch-walk with Ctrl) to move almost silently. You are slow, but stamina recovers while you sneak.' },
  { id: 'noise_meter', title: 'Noise meter', body: 'The NOISE meter on the right shows how far a listening creature can hear you. Sprinting is loud, carpet is quiet, metal floors and water are loud.' },
  { id: 'listener', title: 'The Listener', body: 'The Listener has no eyes. It creeps slowly until it hears something, then it sprints to the sound. Stand still or sneak and it will walk right past.' },
  { id: 'crawler', title: 'Web Crawlers', body: 'Web Crawlers follow noise too: a Crawler that lost you searches the last sound. Break away quietly.' },
  { id: 'lure', title: 'Lures', body: 'Throw an item, a bottle or a Noisemaker to pull sound-hunters away. Walls and closed doors muffle sound, so lure them through a door.' },
  { id: 'hatch', title: 'Creaky floors', body: 'Striped floor plates in maze dead ends are loose. Sneak over them or you drop through to another part of the facility.' },
  { id: 'shortcut', title: 'Latch doors', body: 'A door that says LOCKED but has a control panel beside it opens from the other side. Find the far side and pull the latch.' },
];
