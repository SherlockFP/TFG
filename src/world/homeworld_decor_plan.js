// HOMEWORLD "OFF-GRID CLAIM" decor PLAN (wave 6, home3; docs/wave6/home3.md). PURE data (no three): every solid piece of outpost dressing is an axis-aligned
// footprint {kind, x, z, hx, hz} kept OUTSIDE the factory build square (GRID_MAX * CELL = 45 m, see homeworld_core.js / homeworld2_core.js FMIN..FMAX),
// off the landing pad / ship box and off the four approach lanes (raiders + the crew walk in along the axes). Node-tested by tools/harness/homeworld_decor.test.mjs.
import { RNG } from '../core/rng.js';
import { CELL, GRID_MAX, PAD_CLEAR } from '../game/homeworld_core.js';

export const BUILD_HALF = GRID_MAX * CELL;          // 45: the build square is [-45, 45]^2 (minus the pad circle)
export const PAD_RADIUS = 14.5;
export const SHIP_BOX = { x0: -7.6, x1: 7.6, z0: -4.1, z1: 4.1 };   // ship footprint (SHIP in world/ship.js) + a margin
export const LANE = 7;                               // half width of the four approach lanes that stay free of solids
export const EMBLEM = { x: 0, z: -8.2, r: 3.6 };    // crew emblem painted on the pad (flat decal, behind the ship)

/** solid footprints (collide) and soft ones (fence, no collider). Corners: NE hut, NW antenna array, SE camp kitchen, SW memorial. */
export function planHomeDecor(seed = 1, HALF = 58) {
  const rng = new RNG(((seed | 0) ^ 0x0ff91d) >>> 0);
  const items = [];
  const add = (kind, x, z, hx, hz, extra = {}) => items.push({ kind, x, z, hx, hz, solid: !extra.soft, ...extra });
  // ---- authored set pieces (world x / z, all >= 47 m from the centre on one axis)
  add('hut', 51.5, -50.5, 3.4, 1.7, { rot: 0 });                 // two stacked shipping containers, lit window, graffiti
  add('hut', -53, -22, 1.7, 3.4, { rot: 1 });                    // west container (long along z)
  add('mast', -51, -51, 5.2, 5.2);                               // antenna array + 16 m mast, jammer dishes
  add('kitchen', 50.5, 50.5, 5, 4.5);                            // camp kitchen: table, stove, awning, stools, cooler
  add('memorial', -51, 51.5, 4.3, 2.2);                          // memorial wall for the dead crewmates
  for (const [x, z] of [[53, -15], [54, -22], [53, 17]]) add('totem', x, z, 1.2, 1.2);   // crew trophy totems
  add('laundry', -53, 20.5, 0.4, 7.2);                            // laundry line between two poles (posts collide, cloth does not)
  add('scrapheap', 22, 53, 3.2, 2.2);                             // salvage heap by the south fence
  add('scrapheap', -30, -52.5, 3.0, 2.0);
  // ---- scrap fence: 3 m panels on the inner edge of the band, four sides, gaps at the lanes + a few seeded holes (no collider, ragged)
  for (const side of ['N', 'S', 'E', 'W']) {
    for (let u = -43.5; u <= 43.5; u += 3) {
      if (Math.abs(u) < LANE + 1.5) continue;                     // approach lane stays open
      if (rng.chance(0.18)) continue;                              // seeded hole
      const along = side === 'N' || side === 'S', v = 47.3;
      const x = along ? u : (side === 'E' ? v : -v), z = along ? (side === 'N' ? -v : v) : u;
      if (items.some((it) => it.solid && Math.abs(it.x - x) < it.hx + 1.6 && Math.abs(it.z - z) < it.hz + 1.6)) continue;   // not through set pieces
      add('fence', x, z, along ? 1.5 : 0.2, along ? 0.2 : 1.5, { soft: true, along, tilt: rng.float(-0.06, 0.06), tone: rng.int(0, 4), h: rng.float(1.3, 2.0) });
    }
  }
  return items;
}

/** does the AABB overlap the factory build square (cells beyond the pad circle)? Conservative: any overlap with the square counts. */
export function overlapsBuild(it, pad = 0) {
  return Math.abs(it.x) - it.hx < BUILD_HALF + pad && Math.abs(it.z) - it.hz < BUILD_HALF + pad;
}
export function overlapsBox(it, b) { return it.x + it.hx > b.x0 && it.x - it.hx < b.x1 && it.z + it.hz > b.z0 && it.z - it.hz < b.z1; }
export function inLane(it) { return Math.abs(it.x) - it.hx < LANE || Math.abs(it.z) - it.hz < LANE; }
export const PAD_KEEP = PAD_CLEAR;
