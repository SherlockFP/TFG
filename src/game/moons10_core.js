// MOONS10 core (wave 10, docs/wave10/moons10.md): the two new outdoor-identity moons, registered at import on every peer. PURE: no three.js, no DOM.
//   x503    503-SERVICE UNAVAILABLE  tier 4, Deep Feed (quota 5+): frozen tundra of dead data centers (cooling towers venting steam, half-buried racks, a fallen
//                                    satellite dish + the last technician's hut). Interior 'funhouse'.
//   x8feed  ∞-FEED                   tier 3, quota 3 rung: dune desert, fallen phone screens as monoliths (some still flicker with a frozen post), a colossal cracked
//                                    phone at the horizon, a charging cable, red notification badges hanging in the air. Interior 'deadmall'.
// Interiors are built by another module: a moon's `interior` is a getter that answers 'funhouse' / 'deadmall' only once the theme registry knows the id (moongen.interiorAvailable),
// otherwise 'factory' (never crashes, resolved at landing time, identical on every peer of the same build).
// planTundra / planFeed are the seeded layouts (own RNG streams from the moon seed) used by world/moons10_decor.js; ctx = { seed, half, entrance:{x,z}, pathDist(x,z), avoid?(x,z,m) }.
import { MOONS, BIOMES, registerMoon } from './moons.js';
import { RNG, hashString } from '../core/rng.js';
import { addTranslations, localizeFields } from '../core/i18n.js';
import { interiorAvailable } from './moongen.js';
import { PALETTES } from './soul_core.js';
import { HOOKS, SILHOUETTE, ladderAdd } from './routeboard_core.js';
import { TX, textMaps } from './moons10_text.js';

const TAU = Math.PI * 2;
export const TUNDRA = 'x503', FEED = 'x8feed';
export const MOON10_IDS = [FEED, TUNDRA];
export const BIOME_OF = { [TUNDRA]: 'tundra503', [FEED]: 'feed8' };
/** which route-board rung a moon sits on: ∞-Feed joins the quota-3 rung, 503 waits for the Deep Feed (quota 5, routeboard_core LATE_Q) */
export const FEED_RUNG = 3;

// ------------------------------------------------------------------------------------------------ biomes
BIOMES.tundra503 = {
  name: 'Dead Data Tundra', ground: 'snow', ground2: 'rock', rock: 'rock', tint: 0xb8cbe6, pathTint: 0x8ea2c0, rockTint: 0x7488a8,
  sky: 0x5c86c0, fog: 0x88a6cc, fogDensity: 0.0105, night: 0x040b1e, sun: 0xd4e6ff, dusk: 0x4f7cff, hemiG: 0x142640, hemiW: 0.2, morn: 0.3,
  height: 12, rough: 0.55, trees: 'pine_tree', treeDensity: 0.07, treeTint: 0x9db4d0, noBushes: true, step: 'snow', planet: 0x6c9cdc, waterColor: 0x5a86b4,
  decor: 'tundra503',
  poi: ['server_rack_prop', 'ext:barrier_jersey_broken', 'power_pylon', 'radio_tower', 'generator', 'ruined_wall', 'car_wreck', 'fence_segment', 'shipping_container', 'ext:kk_solarpanel'],
  landmarks: ['ext:ind_cooling_tower', 'power_pylon', 'radio_tower'],
};
BIOMES.feed8 = {
  name: 'Infinite Feed Dunes', ground: 'sand', ground2: 'red_sand', rock: 'rock', tint: 0xf0b09c, pathTint: 0xd08a86, rockTint: 0x8a4a6c,
  sky: 0xd85a92, fog: 0xc4568c, fogDensity: 0.0078, night: 0x12041c, sun: 0xffc0d8, dusk: 0xff2a9a, hemiG: 0x40122c, hemiW: 0.22, morn: 0.25,
  height: 10, rough: 0.5, dunes: 11, trees: 'rock_big', treeDensity: 0.06, treeTint: 0x8a4a6c, noBushes: true, step: 'sand', planet: 0xe0508a, waterColor: 0xc04a8a,
  decor: 'feed8',
  poi: ['ruined_wall', 'shipping_container', 'car_wreck', 'oil_drum_stack', 'ext:barrier_jersey_broken', 'ext:kst_skip_rocks', 'lamp_post', 'fence_segment'],
  landmarks: ['radio_tower', 'power_pylon'],
};
// soul.js: a named palette keeps the biome exactly as authored (only the post saturation grade is applied; no seeded hue shift)
PALETTES[TUNDRA] = { biome: 'tundra503', sat: 1.08 };
PALETTES[FEED] = { biome: 'feed8', sat: 1.14 };

// ------------------------------------------------------------------------------------------------ text + route-board card data
{
  const { tr, ru } = textMaps();
  addTranslations(tr, 'tr'); addTranslations(ru, 'ru');
}
HOOKS[TUNDRA] = TX.x503_hook;
HOOKS[FEED] = TX.feed_hook;
// card art (viewBox 0 0 120 40, evenodd): two cooling towers with steam and a fallen dish / a colossal cracked phone with two monoliths
SILHOUETTE.tundra503 = 'M6 40C12 31 14 25 14 22C14 16 11 10 10 6L32 6C31 10 28 16 28 22C28 25 30 31 36 40z M42 40C46 33 48 28 48 26C48 22 46 18 45 15L61 15C60 18 58 22 58 26C58 28 60 33 64 40z M14 3a3 2 0 1 0 6 0a3 2 0 1 0-6 0z M24 1a4 2.4 0 1 0 8 0a4 2.4 0 1 0-8 0z M72 40L92 22Q104 16 110 26Q101 32 96 40z M88 40l2-8 3 0-1 8z';
SILHOUETTE.feed8 = 'M8 40V27l12-3v16z M97 40V30l14-3v13z M40 40V6a3 3 0 0 1 3-3h34a3 3 0 0 1 3 3V40z M47 10h26v26H47z M55 5h10v2H55z M62 10l1 0-3 9 5 4-6 9-1 0 5-9-5-4z';

// ------------------------------------------------------------------------------------------------ moons
const bindInterior = (m, want) => {
  let override = null;
  Object.defineProperty(m, 'interior', { get() { return override ?? (interiorAvailable(want) ? want : 'factory'); }, set(v) { override = v; }, enumerable: true, configurable: true });
};
export const wantedInterior = { [TUNDRA]: 'funhouse', [FEED]: 'deadmall' };

if (!MOONS[FEED]) {
  const m = registerMoon({
    id: FEED, name: '∞-Feed', short: 'Feed', tier: 3, cost: 500, biome: 'feed8', size: 1.4, mapScale: 1.15, cardSil: 'feed8', landmarkBonus: 1,
    desc: TX.feed_desc[0],
    weather: ['clear', 'clear', 'clear', 'eclipsed', 'foggy'], scrapCount: [18, 24], scrapMul: 1.55, power: 7, outdoorPower: 6,
    creatures: { scuttler: 12, yoinker: 10, crawler: 12, lurker: 10, mannequin: 16, sludge: 6, spider: 8, leech: 8, jester: 12, screamer: 10, mimic: 10, turret: 8, mine: 10 },
    outdoor: { sandkefal: 9, hound: 4, mimic: 4, giant: 2 },
  });
  localizeFields(m, ['name', 'desc', 'short']); bindInterior(m, wantedInterior[FEED]);
  ladderAdd(FEED_RUNG, [FEED]);
}
if (!MOONS[TUNDRA]) {
  const m = registerMoon({
    id: TUNDRA, name: '503-Service Unavailable', short: '503', tier: 4, cost: 1100, biome: 'tundra503', size: 1.6, mapScale: 1.15, cardSil: 'tundra503', landmarkBonus: 1,
    desc: TX.x503_desc[0],
    weather: ['clear', 'foggy', 'foggy', 'stormy', 'eclipsed'], scrapCount: [24, 31], scrapMul: 1.8, power: 9, outdoorPower: 7,
    creatures: { scuttler: 8, yoinker: 8, crawler: 10, lurker: 12, mannequin: 12, sludge: 6, spider: 6, leech: 6, jester: 12, screamer: 14, mimic: 16, turret: 6, mine: 8 },
    outdoor: { hound: 12, giant: 6, mimic: 5 },
  });
  localizeFields(m, ['name', 'desc', 'short']); bindInterior(m, wantedInterior[TUNDRA]);
}
export const isMoon10 = (id) => id === TUNDRA || id === FEED;

// ------------------------------------------------------------------------------------------------ seeded layouts
function sitesOf(ctx) {
  const sites = [];
  const lim = ctx.half * 0.82;
  const entrance = ctx.entrance || { x: 0, z: 60 };
  const pathDist = ctx.pathDist || (() => 99);
  const free = (x, z, r, gap = 3) => {
    if (Math.abs(x) > lim - r * 0.5 || Math.abs(z) > lim - r * 0.5) return false;
    if (Math.hypot(x, z) < 26 + r) return false;
    if (Math.hypot(x - entrance.x, z - entrance.z) < 22 + r) return false;
    if (pathDist(x, z) < 7 + r) return false;
    if (ctx.avoid && ctx.avoid(x, z, r)) return false;
    for (const s of sites) if (Math.hypot(x - s.x, z - s.z) < r + s.r + gap) return false;
    return true;
  };
  const add = (x, z, r) => { sites.push({ x, z, r }); };
  return { sites, free, add, lim };
}
const rd = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;

/** 503: cooling towers, data halls, the fallen dish + hut (the story beat), buried racks and drifts */
export function planTundra(ctx) {
  const S = sitesOf(ctx), half = ctx.half, ea = Math.atan2(ctx.entrance.z, ctx.entrance.x);
  const R0 = new RNG(hashString(`moons10|${TUNDRA}|${ctx.seed | 0}`));
  const out = { towers: [], halls: [], dish: null, hut: null, racks: [], drifts: [], scrap: [] };
  // 1. the fallen satellite dish (bowl radius 20, leaning on its buried rim) and the technician's hut in front of it
  const Rd = R0.fork('dish');
  for (let k = 0; k < 120 && !out.dish; k++) {
    const a = ea + Rd.sign() * Rd.float(0.7, 1.5), d = Rd.float(0.36, 0.58) * half, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!S.free(x, z, 21)) continue;
    out.dish = { x: rd(x), z: rd(z), R: 20, yaw: rd(Math.atan2(-x, -z) + Rd.float(-0.5, 0.5)), tilt: rd(Rd.float(0.5, 0.7)) };
    S.add(x, z, 21);
  }
  if (out.dish) {
    const d0 = out.dish, toShip = Math.atan2(-d0.z, -d0.x);
    for (const da of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.0, -2.0, 2.6, -2.6, Math.PI]) {
      const a = toShip + da, x = d0.x + Math.cos(a) * 30, z = d0.z + Math.sin(a) * 30;
      if (!S.free(x, z, 5, 1)) continue;
      out.hut = { x: rd(x), z: rd(z), yaw: rd(Math.atan2(-x, -z)), w: 5.2, d: 4 };   // door faces the ship
      S.add(x, z, 5);
      break;
    }
  }
  // 2. cooling towers (one collapsed)
  const Rt = R0.fork('towers');
  for (const spec of [{ r: 9.5, h: 38 }, { r: 7.2, h: 29 }, { r: 8, h: 17, broken: true }]) {
    for (let k = 0; k < 90; k++) {
      const a = Rt.float(0, TAU), d = Rt.float(0.34, 0.78) * half, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!S.free(x, z, spec.r + 6)) continue;
      out.towers.push({ x: rd(x), z: rd(z), r: spec.r, h: spec.h, broken: !!spec.broken, yaw: rd(Rt.float(0, TAU)) });
      S.add(x, z, spec.r + 6);
      break;
    }
  }
  // 3. roofless data halls (walkable shelter, racks inside)
  const Rh = R0.fork('halls');
  for (let i = 0; i < 2; i++) {
    for (let k = 0; k < 90; k++) {
      const a = Rh.float(0, TAU), d = Rh.float(0.28, 0.7) * half, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!S.free(x, z, 17)) continue;
      out.halls.push({ x: rd(x), z: rd(z), yaw: rd(Rh.pick([0, Math.PI / 2]) + Rh.float(-0.35, 0.35)), w: 28, d: 11 });
      S.add(x, z, 17);
      break;
    }
  }
  // 4. buried racks (+ a drift beside each) and loose drifts
  const Rr = R0.fork('racks');
  for (let i = 0, guard = 0; i < 36 && guard < 400; guard++) {
    const a = Rr.float(0, TAU), d = Rr.float(0.18, 0.82) * half, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!S.free(x, z, 2.2, 1.5)) continue;
    S.add(x, z, 2.2); i++;
    out.racks.push({ x: rd(x), z: rd(z), ry: rd(Rr.float(0, TAU)), sink: rd(Rr.float(0.5, 1.3)), tx: rd(Rr.float(-0.32, 0.32)), tz: rd(Rr.float(-0.32, 0.32)), s: rd(Rr.float(0.95, 1.2)) });
  }
  const Rf = R0.fork('drifts');
  for (const r of out.racks) out.drifts.push({ x: rd(r.x + Rf.float(-1.6, 1.6)), z: rd(r.z + Rf.float(-1.6, 1.6)), s: rd(Rf.float(1.8, 3.4)), ry: rd(Rf.float(0, TAU)) });
  for (let i = 0, guard = 0; i < 14 && guard < 200; guard++) {
    const x = Rf.float(-S.lim, S.lim), z = Rf.float(-S.lim, S.lim);
    if (!S.free(x, z, 3, -2)) continue;
    i++; out.drifts.push({ x: rd(x), z: rd(z), s: rd(Rf.float(2.6, 5.2)), ry: rd(Rf.float(0, TAU)) });
  }
  // loot: the hut door, the first hall
  if (out.hut) out.scrap.push({ x: rd(out.hut.x + Math.sin(out.hut.yaw) * 4.2), z: rd(out.hut.z + Math.cos(out.hut.yaw) * 4.2) });
  if (out.halls[0]) out.scrap.push({ x: out.halls[0].x, z: out.halls[0].z });
  return out;
}

/** ∞-Feed: phone monoliths, the colossal cracked phone, the plug + cable, notification badges, the seated figure (story beat) */
export function planFeed(ctx) {
  const S = sitesOf(ctx), half = ctx.half, ea = Math.atan2(ctx.entrance.z, ctx.entrance.x);
  const R0 = new RNG(hashString(`moons10|${FEED}|${ctx.seed | 0}`));
  const out = { giant: null, slabs: [], plug: null, cable: [], badges: [], beat: null, scrap: [] };
  // 1. the colossus at the horizon, beyond the entrance and a little off-axis (the walk points at it)
  const Rg = R0.fork('giant');
  for (let k = 0; k < 40 && !out.giant; k++) {
    const a = ea + Rg.sign() * Rg.float(0.25, 0.6), d = half * (0.72 + Rg.float(-0.02, 0.03)), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) > half - 16 || Math.abs(z) > half - 16) continue;
    out.giant = { x: rd(x), z: rd(z), ry: rd(Math.atan2(-x, -z)), w: 34, h: 64, d: 5.5, rx: -0.1, rz: rd(Rg.float(-0.05, 0.05)) };
    S.add(x, z, 20);
  }
  // 2. the seated figure facing a live slab, 13-28 m off the walking path
  const Rb = R0.fork('beat');
  for (let k = 0; k < 400 && !out.beat; k++) {
    const a = Rb.float(0, TAU), d = Rb.float(0.25, 0.7) * half, x = Math.cos(a) * d, z = Math.sin(a) * d, pd = ctx.pathDist ? ctx.pathDist(x, z) : 99;
    if (pd < 13 || pd > 28 || !S.free(x, z, 6, 2)) continue;
    const ry = Rb.float(0, TAU), sx = x + Math.sin(ry) * 6.5, sz = z + Math.cos(ry) * 6.5;   // the slab stands 6.5 m in front of the chair
    out.beat = { chair: { x: rd(x), z: rd(z), ry: rd(ry + Math.PI) }, slab: { x: rd(sx), z: rd(sz), ry: rd(ry + Math.PI), w: 5.2, h: 10, d: 0.5, rx: -0.06, rz: 0, variant: 1, live: true, beat: true } };
    S.add(x + Math.sin(ry) * 3, z + Math.cos(ry) * 3, 9);
    out.scrap.push({ x: rd(x + Math.cos(ry) * 2.2), z: rd(z - Math.sin(ry) * 2.2) });
  }
  // 3. phone monoliths: half of them live (flicker), variants 0-5 = frozen posts, 6 = dead screen
  const Rs = R0.fork('slabs');
  if (out.beat) out.slabs.push(out.beat.slab);
  for (let i = 0, guard = 0; i < 26 && guard < 700; guard++) {
    const a = Rs.float(0, TAU), d = Rs.float(0.16, 0.78) * half, x = Math.cos(a) * d, z = Math.sin(a) * d, w = Rs.float(3.2, 6);
    if (!S.free(x, z, w * 0.7 + 1, 4)) continue;
    S.add(x, z, w * 0.7 + 1); i++;
    out.slabs.push({ x: rd(x), z: rd(z), ry: rd(Rs.float(0, TAU)), w: rd(w), h: rd(w * Rs.float(1.85, 2.05)), d: 0.5, rx: rd(Rs.float(-0.2, 0.2)), rz: rd(Rs.float(-0.1, 0.1)), sink: rd(Rs.float(0.22, 0.36)),
      variant: Rs.chance(0.16) ? 6 : Rs.int(0, 5), live: Rs.chance(0.45) });
  }
  // 4. the plug (the giant's charger, unplugged) and its cable across the dunes
  const Rp = R0.fork('plug');
  if (out.giant) {
    for (let k = 0; k < 120 && !out.plug; k++) {
      const a = Rp.float(0, TAU), d = Rp.float(0.3, 0.62) * half, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!S.free(x, z, 6, 3)) continue;
      out.plug = { x: rd(x), z: rd(z), ry: rd(Rp.float(0, TAU)) };
      S.add(x, z, 6);
    }
    if (out.plug) {
      const g = out.giant, c = Math.cos(g.ry), s = Math.sin(g.ry);
      const px = g.x + c * -8 + s * 4, pz = g.z - s * -8 + c * 4, n = 30, phase = Rp.float(0, TAU), amp = Rp.float(5, 9);
      const dx = out.plug.x - px, dz = out.plug.z - pz, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
      for (let i = 0; i <= n; i++) {
        const u = i / n, w = Math.sin(u * Math.PI) * Math.sin(u * TAU * 1.5 + phase) * amp;
        out.cable.push({ x: rd(px + dx * u + nx * w), z: rd(pz + dz * u + nz * w) });
      }
    }
  }
  // 5. red notification badges hanging in the air
  const Rn = R0.fork('badges');
  for (let i = 0, guard = 0; i < 34 && guard < 200; guard++) {
    const a = Rn.float(0, TAU), d = Rn.float(0.14, 0.8) * half, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.hypot(x, z) < 20) continue;
    i++;
    out.badges.push({ x: rd(x), z: rd(z), y: rd(Rn.float(3, 9)), s: rd(Rn.float(0.5, 1.1)), ph: rd(Rn.float(0, TAU)) });
  }
  if (out.slabs[1]) out.scrap.push({ x: rd(out.slabs[1].x + 2.4), z: out.slabs[1].z });
  return out;
}
export const planFor = (moonId, ctx) => (moonId === TUNDRA ? planTundra(ctx) : moonId === FEED ? planFeed(ctx) : null);
