// TFG wave 2 - GRENADES: pure rules (no three.js, no DOM, no game access) so tools/harness/grenades.test.mjs can run them in node.
//   KINDS            every throwable bomb: fuse, effect radius, duration, damage, noise, stack size, price, rarity
//   throw model      hold-to-charge power, cook time (shortens the fuse), launch velocity
//   stepBall/predictArc   the ONE ball simulation (gravity, bounce, roll, stick) every peer runs and the aim preview reuses
//   smokeBlocks      does a smoke cloud sit on a sight line
//   flashExposure    how badly a bang whites out a viewer
//   rollRareDrop     tiered drop tables for the rare bombs (never sold)
// Units: metres, seconds. `ray(ox, oy, oz, dx, dy, dz, maxLen)` -> { distance, nx, ny, nz } | null (static world only).

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------------------------------------ ball physics
export const GRAV = 13;             // a little stronger than real: snappier arcs
export const BALL_R = 0.09;
export const BOUNCE_E = 0.42;       // normal restitution
export const BOUNCE_MU = 0.2;       // tangential energy lost per bounce
export const REST_VN = 2.3;         // below this impact speed on a floor the ball lands and starts to roll
export const ROLL_DRAG = 2.4;       // 1/s horizontal speed decay while rolling
export const MAX_SPEED = 23;
export const SUBSTEP = 1 / 60;

export const THROW = {
  minSpeed: 5.5, maxSpeed: 21,
  chargeT: 1.0,        // s of holding LMB for a full-power throw
  basePower: 0.42,     // a quick tap already lobs at this power; holding ramps it to 1 over chargeT
  cookMax: 1.5,        // extra s of holding after full power that count as cooking (each second shortens the fuse by 1 s)
  lift: 0.32,          // aim is tilted up (~17 deg) so a full throw carries ~23 m and a tap ~10 m
  inherit: 0.35,       // share of the thrower's horizontal velocity added
  minFuse: 0.45,       // cooking never drops the remaining fuse below this
  cooldown: 0.55,     // s between throws
};

// ------------------------------------------------------------------------------------------------ the bomb table
// item: inventory item id. stack: bombs per item (charges). R: effect radius (m). fuse: s (sticky: s AFTER it sticks).
// noise: creatures.noise units (via game.balance.noise). tier: item tier / rarity. rare: never sold, drops only.
export const KINDS = {
  stun:     { item: 'stungrenade', name: 'Stun Grenade', legacy: true, fuse: 2.2, R: 12, stun: 5, noise: 3, color: 0x6a7a55, tier: 'common' },
  flash:    { item: 'flashbang', name: 'Flashbang', fuse: 1.6, R: 14, stunMin: 3, stunMax: 4, blind: 2.5, noise: 3.5, stack: 3, price: 60, tier: 'common', color: 0xd8dde4 },
  smoke:    { item: 'smokegrenade', name: 'Smoke Grenade', fuse: 1.2, R: 5.5, dur: 20, noise: 0.8, stack: 2, price: 55, tier: 'common', color: 0x8a949a },
  decoy:    { item: 'decoybeacon', name: 'Decoy Beacon', fuse: 1.0, dur: 10, pulse: 1.2, noise: 2.6, stack: 2, price: 45, tier: 'common', color: 0x2fc4b0 },
  noisemaker: { item: 'noisemaker', name: 'Noisemaker', fuse: 0.9, dur: 9, pulse: 1.25, noise: 2.4, stack: 3, price: 22, tier: 'common', color: 0xe0a020 },   // [stealth] cheap lure: clatters for 9 s, sound-hunting creatures come to it
  speaker:  { item: 'decoyspeaker', name: 'Decoy Speaker', fuse: 0.8, dur: 12, pulse: 2.4, noise: 3.2, stack: 2, price: 90, tier: 'uncommon', color: 0xd9482f },   // [gear11] plays the thrower's last recorded voice clip (game.gear11.speakerPulse)
  sticky:   { item: 'stickycharge', name: 'Sticky Charge', fuse: 2.5, R: 4.2, dmg: 100, stun: 1.2, noise: 4, stack: 2, price: 110, tier: 'uncommon', sticky: true, color: 0xe8701c, crew: 0.32 },
  cryo:     { item: 'craft_cryo', name: 'Cryo Grenade', legacy: true, fuse: 1.5, R: 5, stun: 5, noise: 0, color: 0x80e0ff, tier: 'common' },
  molotov:  { item: 'craft_molotov', name: 'Molotov', legacy: true, fuse: 1.4, R: 3.2, dur: 6, tick: 9, noise: 2, color: 0xff7a1a, tier: 'common' },
  emp:      { item: 'craft_emp', name: 'EMP Charge', legacy: true, fuse: 1.5, R: 10, disable: 20, noise: 1.5, color: 0x50c8ff, tier: 'common' },
  gravity:  { item: 'bomb_gravity', name: 'Gravity Well', rare: true, fuse: 1.8, R: 9, dur: 4, pull: 6.5, collapse: 30, noise: 2.5, tier: 'legendary', color: 0x9a5cff },
  blackout: { item: 'bomb_blackout', name: 'Blackout Bomb', rare: true, fuse: 1.6, R: 16, dur: 20, noise: 1, tier: 'rare', color: 0x202028 },
  confetti: { item: 'bomb_confetti', name: 'Confetti Bomb', rare: true, fuse: 1.5, R: 9, dance: 2, stunParty: 5, stunOther: 1.5, noise: 3, tier: 'uncommon', color: 0xff5ac8 },
  glitch:   { item: 'bomb_glitch', name: 'Glitch Bomb', rare: true, fuse: 2.0, R: 8, freeze: 6, dmg: 140, bossDmg: 220, noise: 2.5, tier: 'mythic', color: 0x00ffd0 },
  cluster:  { item: 'bomb_cluster', name: 'Cluster Bomb', rare: true, fuse: 1.6, mini: 5, noise: 3.5, tier: 'epic', color: 0xd0402a },
  mini:     { item: null, name: 'Mini Bomb', internal: true, fuse: 1.1, R: 3.4, dmg: 38, stun: 0.6, noise: 1.6, color: 0xd0402a, crew: 0.32 },
};
export const KIND_IDS = Object.keys(KINDS);
export const RARE_KINDS = KIND_IDS.filter((k) => KINDS[k].rare);
export const STORE_KINDS = KIND_IDS.filter((k) => KINDS[k].price > 0);
const ITEM_KIND = {};
for (const [k, d] of Object.entries(KINDS)) if (d.item) ITEM_KIND[d.item] = k;
ITEM_KIND.craft_decoy = 'decoy';    // the crafted Noise Decoy is the same idea: unified with the beacon
/** bomb kind for an inventory item type (null = not a grenade) */
export const kindOfItem = (type) => ITEM_KIND[type] || null;
/** every effect radius in one table (tests + docs) */
export const EFFECT_RADII = Object.fromEntries(KIND_IDS.filter((k) => KINDS[k].R).map((k) => [k, KINDS[k].R]));

/** creatures that get stronger in the dark / partygoers that a confetti bomb stuns hard (creature ids) */
export const DARK_LOVERS = new Set(['lurker', 'stalker', 'screamer', 'mimic', 'spider']);
export const PARTYGOERS = new Set(['jester', 'clickbait', 'replyguy', 'tamagotchi', 'hound']);
export const DARK_BONUS = { speed: 1.3, sight: 1.4, dmg: 1.25, blindRange: 3.5 };

// ------------------------------------------------------------------------------------------------ throw model
export const throwPower = (hold) => clamp(THROW.basePower + (1 - THROW.basePower) * (hold / THROW.chargeT), THROW.basePower, 1);
export const throwSpeed = (power) => lerp(THROW.minSpeed, THROW.maxSpeed, Math.pow(clamp(power, 0, 1), 0.9));
export const cookTime = (hold) => clamp(hold - THROW.chargeT, 0, THROW.cookMax);
/** fuse left after cooking `cook` seconds (sticky charges always give their full post-stick fuse) */
export function fuseAfterCook(kind, cook = 0) {
  const d = KINDS[kind];
  if (!d) return 1;
  if (d.sticky) return d.fuse;
  return Math.max(THROW.minFuse, d.fuse - clamp(cook, 0, THROW.cookMax));
}
/** launch velocity for a forward vector, throw power and the thrower's velocity */
export function throwVelocity(fwd, power, pv = null) {
  let dx = fwd.x, dy = fwd.y + THROW.lift, dz = fwd.z;
  const L = Math.hypot(dx, dy, dz) || 1;
  dx /= L; dy /= L; dz /= L;
  const s = throwSpeed(power);
  let vx = dx * s + (pv ? pv.x * THROW.inherit : 0), vy = dy * s, vz = dz * s + (pv ? pv.z * THROW.inherit : 0);
  const m = Math.hypot(vx, vy, vz);
  if (m > MAX_SPEED + 2) { const k = (MAX_SPEED + 2) / m; vx *= k; vy *= k; vz *= k; }
  return { x: vx, y: vy, z: vz };
}
/** seconds between fuse beeps: slow at the start, a rattle at the end */
export function beepInterval(remaining, total) {
  const u = 1 - clamp(remaining / Math.max(0.2, total), 0, 1);
  return lerp(0.6, 0.075, Math.pow(u, 1.6));
}

// ------------------------------------------------------------------------------------------------ ball simulation
export function makeBall(o, v, opts = {}) {
  return { x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, grounded: false, rest: false, stuck: false, bounces: 0, sticky: !!opts.sticky, t: 0, maxY: o.y, sx: 0, sy: 1, sz: 0 };
}
function unitNormal(hit, dx, dy, dz) {
  let nx = hit.nx, ny = hit.ny, nz = hit.nz;
  const L = Math.hypot(nx, ny, nz);
  if (!(L > 0.5)) return { x: -dx, y: -dy, z: -dz };      // ray started inside geometry: push back along the ray
  return { x: nx / L, y: ny / L, z: nz / L };
}
/** advance the ball by h (<= SUBSTEP) seconds. Returns { bounce, speed, stick, x, y, z } for a notable event, else null. */
export function stepBall(p, h, ray) {
  if (p.stuck || p.rest) return null;
  let ev = null;
  p.t += h;
  if (!p.grounded) p.vy -= GRAV * h;
  const sp = Math.hypot(p.vx, p.vy, p.vz);
  const len = sp * h;
  if (len > 1e-6) {
    const dx = p.vx / sp, dy = p.vy / sp, dz = p.vz / sp;
    const hit = ray(p.x, p.y, p.z, dx, dy, dz, len + BALL_R);
    if (hit) {
      const d = Math.max(0, hit.distance - BALL_R);
      p.x += dx * d; p.y += dy * d; p.z += dz * d;
      const n = unitNormal(hit, dx, dy, dz);
      const vn = p.vx * n.x + p.vy * n.y + p.vz * n.z;    // < 0 when moving into the surface
      if (p.sticky) {
        p.stuck = true; p.vx = p.vy = p.vz = 0; p.sx = n.x; p.sy = n.y; p.sz = n.z;
        p.x += n.x * 0.02; p.y += n.y * 0.02; p.z += n.z * 0.02;
        return { stick: true, x: p.x, y: p.y, z: p.z, nx: n.x, ny: n.y, nz: n.z };
      }
      if (n.y > 0.7 && -vn < REST_VN) {                  // landed: start rolling
        p.grounded = true; p.vy = 0;
        ev = { bounce: false, land: true, speed: -vn, x: p.x, y: p.y, z: p.z };
      } else {
        const e = 1 + BOUNCE_E;
        p.vx -= e * vn * n.x; p.vy -= e * vn * n.y; p.vz -= e * vn * n.z;
        // tangential friction: keep (1 - mu) of the sliding speed
        const tvn = p.vx * n.x + p.vy * n.y + p.vz * n.z;
        const tx = p.vx - tvn * n.x, ty = p.vy - tvn * n.y, tz = p.vz - tvn * n.z;
        p.vx -= tx * BOUNCE_MU; p.vy -= ty * BOUNCE_MU; p.vz -= tz * BOUNCE_MU;
        p.x += n.x * 0.012; p.y += n.y * 0.012; p.z += n.z * 0.012;
        p.bounces++;
        ev = { bounce: true, speed: -vn, x: p.x, y: p.y, z: p.z, nx: n.x, ny: n.y, nz: n.z };
      }
    } else { p.x += dx * len; p.y += dy * len; p.z += dz * len; }
  }
  if (p.grounded) {
    const f = Math.exp(-ROLL_DRAG * h);
    p.vx *= f; p.vz *= f; p.vy = 0;
    const g = ray(p.x, p.y + 0.05, p.z, 0, -1, 0, BALL_R + 0.22);
    if (!g) p.grounded = false;                         // rolled off an edge: fall again
    else p.y = p.y + 0.05 - g.distance + BALL_R;
    if (Math.hypot(p.vx, p.vz) < 0.22) { p.vx = p.vz = 0; p.rest = true; }
  }
  if (p.y > p.maxY) p.maxY = p.y;
  return ev;
}
/** advance by dt in <= SUBSTEP slices; onEvent(ev) for bounces / landing / sticking */
export function advanceBall(p, dt, ray, onEvent) {
  let left = dt;
  while (left > 1e-6 && !p.stuck && !p.rest) {
    const h = Math.min(SUBSTEP, left);
    left -= h;
    const ev = stepBall(p, h, ray);
    if (ev && onEvent) onEvent(ev);
  }
}
/**
 * Predict the flight: run the very same simulation ahead of time. Returns { pts: [[x, y, z, bounces], ...] (one per `sample` s),
 * end: {x, y, z}, t, bounces, rest, stuck, firstImpact: {x, y, z, t} | null, apex }.
 */
export function predictArc(origin, vel, ray, o = {}) {
  const p = makeBall(origin, vel, { sticky: !!o.sticky });
  const maxT = o.maxT ?? 3, sample = o.sample ?? 0.07, h = o.h ?? 1 / 45;
  const pts = [[p.x, p.y, p.z, 0]];
  let acc = 0, first = null;
  while (p.t < maxT && !p.rest && !p.stuck) {
    const ev = stepBall(p, h, ray);
    if (ev && !first) first = { x: ev.x, y: ev.y, z: ev.z, t: p.t };
    acc += h;
    if (acc >= sample) { acc = 0; pts.push([p.x, p.y, p.z, p.bounces]); }
  }
  if (acc > 1e-6) pts.push([p.x, p.y, p.z, p.bounces]);
  return { pts, end: { x: p.x, y: p.y, z: p.z }, t: p.t, bounces: p.bounces, rest: p.rest, stuck: p.stuck, firstImpact: first, apex: p.maxY };
}

// ------------------------------------------------------------------------------------------------ smoke / sight lines
/** length of segment a-b that lies inside the sphere c (radius r) */
export function chordInside(a, b, c, r) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L2 = dx * dx + dy * dy + dz * dz;
  const L = Math.sqrt(L2);
  if (L < 1e-6) return 0;
  const ux = dx / L, uy = dy / L, uz = dz / L;
  const wx = c.x - a.x, wy = c.y - a.y, wz = c.z - a.z;
  const tc = wx * ux + wy * uy + wz * uz;                      // closest approach along the segment
  const d2 = wx * wx + wy * wy + wz * wz - tc * tc;
  if (d2 >= r * r) return 0;
  const h = Math.sqrt(r * r - d2);
  return Math.max(0, Math.min(L, tc + h) - Math.max(0, tc - h));
}
export const SMOKE = { minChord: 1.6, nearSee: 2.5, growT: 1.5, fadeT: 2.5 };
/** current radius of a smoke cloud of full radius R, `t` s after it popped, lasting `dur` s */
export function smokeRadius(R, t, dur) {
  const grow = clamp(t / SMOKE.growT, 0, 1);
  const shrink = clamp((dur - t) / SMOKE.fadeT, 0, 1);
  return R * Math.sqrt(grow) * (0.35 + 0.65 * shrink);
}
/** does any cloud ({x, y, z, r}) hide b from a? Very close targets (< nearSee) are always seen. */
export function smokeBlocks(a, b, clouds) {
  if (!clouds || !clouds.length) return false;
  const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  if (L < SMOKE.nearSee) return false;
  for (const c of clouds) if (c.r > 0.5 && chordInside(a, b, c, c.r) > SMOKE.minChord) return true;
  return false;
}
/** point inside any zone ({x, y, z, r})? */
export function inZone(p, zones) {
  if (!zones) return null;
  for (const z of zones) { const dx = p.x - z.x, dy = p.y - z.y, dz = p.z - z.z; if (dx * dx + dy * dy + dz * dz < z.r * z.r) return z; }
  return null;
}

// ------------------------------------------------------------------------------------------------ flash
/** viewer exposure to a bang: dist to the bomb, facing = dot(view dir, dir to bomb), los = clear line. -> { amt 0..1, dur s } */
export function flashExposure(dist, facing, los, R = KINDS.flash.R) {
  if (!los || dist > R * 1.15) return { amt: 0, dur: 0 };
  const near = clamp(1 - dist / (R * 1.15), 0, 1);
  const look = clamp((facing + 0.25) / 1.25, 0, 1);            // facing 1 -> 1, looking away (<= -0.25) -> 0
  const amt = clamp((0.28 + 0.72 * look) * (0.35 + 0.9 * near), 0, 1);
  return { amt: +amt.toFixed(3), dur: amt <= 0.05 ? 0 : +(1.2 + 3.8 * amt).toFixed(2) };
}

// ------------------------------------------------------------------------------------------------ gravity well
/** creature pull speed (m/s) at distance d inside radius R: gentle at the rim, strong near the core */
export const pullSpeed = (d, R, max = 6.5) => clamp(1.8 + (1 - clamp(d / R, 0, 1)) * (max - 1.8), 0, max);

// ------------------------------------------------------------------------------------------------ rare drops
// weights per kind. chance = probability that the source yields a bomb at all.
export const RARE_SOURCES = {
  'chest:wood':  { chance: 0.0, table: {} },
  'chest:iron':  { chance: 0.07, table: { confetti: 6, blackout: 4 } },
  'chest:gold':  { chance: 0.4, table: { confetti: 30, blackout: 30, cluster: 22, gravity: 14, glitch: 4 } },
  'chest:void':  { chance: 0.8, table: { blackout: 15, cluster: 30, gravity: 30, glitch: 15, confetti: 10 } },
  boss:          { chance: 1.0, table: { cluster: 20, gravity: 35, glitch: 25, blackout: 20 } },
  'tier:legendary': { chance: 0.3, table: { gravity: 40, cluster: 40, blackout: 20 } },
  'tier:mythic': { chance: 0.5, table: { glitch: 45, gravity: 35, cluster: 20 } },
  world:         { chance: 0.28, table: { confetti: 35, blackout: 35, cluster: 20, gravity: 10 } },
};
/** roll a rare bomb kind for a source key, or null. `rnd` returns [0, 1). */
export function rollRareDrop(source, rnd = Math.random) {
  const s = RARE_SOURCES[source];
  if (!s || !(s.chance > 0) || rnd() >= s.chance) return null;
  const entries = Object.entries(s.table);
  let tot = 0;
  for (const [, w] of entries) tot += w;
  if (!(tot > 0)) return null;
  let r = rnd() * tot;
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}
