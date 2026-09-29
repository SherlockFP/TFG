// WORLDS3 core (wave 8, docs/wave8/worlds3.md): pure, node-testable rules - no THREE, no DOM.
//   * wrong-door odds (seeded, guaranteed on day 1 and every 3rd day) and which themed pocket a door opens onto
//   * facility SIZE CLASS per (run seed, moon)
//   * the themed pocket table (palette / fog / audio / loot / hunters / hazard numbers)
//   * PLANNERS for purposeful set dressing: facility rooms (planDressing) and themed pockets (planPocketDressing).
//     They return footprints only; src/world/worlds3_kit.js turns them into merged geometry + colliders.
import { RNG, hashString } from '../core/rng.js';
import { layoutKit, WALL_ROT, INWARD, SPECIAL_ROOMS } from '../world/interiors/common.js';

export const THEME_IDS = ['l0', 'pool', 'data', 'hotel', 'fun', 'asylum'];
const hex = (h) => h;

/** Themed pockets. Pocket = same maze generator as Level 0, different skin, loot, creatures and one rule.
 *  tier weights: index 0..2 = moon tier 1 / 2 / 3+. */
export const THEMES = {
  l0: {
    title: 'LEVEL 0', sub: '"The Lobby"', hint: 'Yellow wallpaper. Damp carpet. The hum never stops.', w: [6, 3, 2],
  },
  pool: {
    title: 'LEVEL 37', sub: '"The Poolrooms"', hint: 'White tiles, warm water. Deep patches pull you down. Sound carries far over water.', w: [2, 2, 2],
    fog: hex(0xcfe9ee), dens: 0.026, hemi: [0.86, 0.98, 1], hemiG: [0.3, 0.42, 0.46], amb: [0.85, 0.97, 1], panel: 0xe4f8ff, light: 0xcfeeff,
    ambience: 'ambience_sewer_water', ambVol: 0.4, lootMul: 1.1, hunters: { br_hound: 60, br_smiler: 25, lurker: 15 },
    deep: 9, deepR: 2.3, deepSlow: 0.16, deepStamina: 34,
    echoLoud: 1.0, echoEvery: 1.3,   // SIGNATURE: sound carries far over water - moving here reports a noise to the creatures
    loot: { sig: ['w3_float', 'w3_whistle'], pool: [['goldbar', 4], ['trophy', 6], ['ring', 3], ['perfume', 5], ['pickles', 4], ['bottles', 5]], n: 5, sigN: 2 },
    dress: ['lifeguard', 'deckchair', 'deckchair', 'poolsign', 'ringbuoy'], dressP: 0.13,
  },
  data: {
    title: 'SERVER 404', sub: '"The Algorithm\'s Data Center"', hint: 'Flooded racks. The water bites back in pulses.', w: [1, 2, 2],
    fog: hex(0x0d1c2c), dens: 0.05, hemi: [0.45, 0.66, 1], hemiG: [0.1, 0.16, 0.3], amb: [0.5, 0.7, 1], panel: 0x9fd0ff, light: 0x7fb8ff,
    ambience: 'ambience_serverfarm', ambVol: 0.55, lootMul: 1.2, hunters: { scuttler: 40, br_smiler: 30, spider: 15, lurker: 15 },
    zapEvery: 9, zapWarn: 1.5, zapDmg: 14,
    loot: { sig: ['w3_corechip', 'w3_fanarray'], pool: [['gpu', 6], ['hdd', 6], ['motherboard', 5], ['cryptocoin', 4], ['modem', 4], ['usbidol', 2]], n: 5, sigN: 2 },
    dress: ['rack', 'rack', 'rackpair', 'ups', 'cabletray'], dressP: 0.19,
  },
  hotel: {
    title: 'FLOOR 404', sub: '"The Endless Hotel"', hint: 'Numbered doors, none of them yours. The lights go out on schedule; numbers and the EXIT distance lie.', w: [1, 2, 2],
    fog: hex(0x3a1c14), dens: 0.05, hemi: [1, 0.78, 0.6], hemiG: [0.3, 0.14, 0.08], amb: [1, 0.72, 0.55], panel: 0xffc27a, light: 0xffb060,
    ambience: 'ambience_mansion', ambVol: 0.5, lootMul: 1.2, hunters: { mannequin: 45, br_smiler: 30, lurker: 25 },
    blackoutEvery: 55, blackoutLen: 6.5, mapLie: 0.4,   // SIGNATURE: room numbers re-roll and the EXIT distance hint lies (both re-rolled at every blackout)
    loot: { sig: ['w3_roomkey', 'w3_ledger'], pool: [['bell', 5], ['lamp', 5], ['painting', 6], ['perfume', 6], ['ring', 3], ['goldbar', 3], ['vhs', 4]], n: 5, sigN: 2 },
    dress: ['hoteldoor', 'hoteldoor', 'hoteldoor', 'luggage', 'sconce', 'plant'], dressP: 0.2,
  },
  fun: {
    title: 'LEVEL FUN', sub: '"Party\'s Never Over"', hint: 'Somebody planned this for you. They are early. They are very early.', w: [0, 1, 2],
    fog: hex(0x7a1a26), dens: 0.04, hemi: [1, 0.7, 0.72], hemiG: [0.4, 0.1, 0.16], amb: [1, 0.66, 0.7], panel: 0xff9aa8, light: 0xff6a80,
    ambience: 'ambience_backrooms', ambVol: 0.4, lootMul: 1.6, hunters: { br_partygoer: 55, br_smiler: 25, br_hound: 20 },
    huntAfter: 55, huntEvery: [15, 26], huntCap: 2,   // SIGNATURE: the party starts early
    loot: { sig: ['w3_cake', 'w3_pinata'], pool: [['trophy', 6], ['airhorn', 6], ['clownhorn', 5], ['goldbar', 3], ['playbutton', 2], ['liketrophy', 4], ['animefig', 4]], n: 6, sigN: 2 },
    dress: ['gifts', 'gifts', 'partytable', 'balloons', 'banner'], dressP: 0.2,
  },
  asylum: {
    title: 'WARD 13', sub: '"Saint Kefal Asylum"', hint: 'The doors lock behind you. Find the ward key.', w: [0, 2, 2],
    fog: hex(0x1a261f), dens: 0.055, hemi: [0.7, 0.9, 0.75], hemiG: [0.12, 0.18, 0.14], amb: [0.7, 0.88, 0.72], panel: 0xd8f2dc, light: 0xb8e0c0,
    ambience: 'ambience_hospital', ambVol: 0.55, lootMul: 1.15, hunters: { mannequin: 35, lurker: 30, br_smiler: 35 },
    lockMax: 300,   // SIGNATURE: the EXIT is locked until somebody picks up the ward key (auto-opens after lockMax s so nobody is stuck)
    loot: { sig: ['w3_patientfile', 'w3_jacket'], pool: [['skull', 5], ['teeth', 6], ['pot', 3], ['flask', 5], ['phone', 4], ['vhs', 4], ['perfume', 3], ['key', 2]], n: 5, sigN: 2 },
    dress: ['wheelchair', 'wheelchair', 'hospbed', 'padded', 'filecab'], dressP: 0.2,
  },
};

/** Signature items (registered by worlds3.js): [id, name, tier, [vmin, vmax], weight, tip, model boxes]. Box = [w, h, d, x, y, z, colour(, glow)] */
export const W3_ITEMS = [
  { id: 'w3_float', name: 'Gilded Pool Float', tier: 'rare', value: [120, 210], weight: 4, tip: 'Rubber duck-shaped. Solid gold underneath. Do not ask.',
    box: [[0.36, 0.14, 0.3, 0, 0, 0, 0xf2c74a], [0.16, 0.16, 0.16, 0.12, 0.13, 0, 0xf6d766], [0.1, 0.04, 0.05, 0.21, 0.13, 0, 0xe8742a]] },
  { id: 'w3_whistle', name: 'Lifeguard Whistle', tier: 'uncommon', value: [55, 105], weight: 1, tip: 'Blow it and the water listens.',
    box: [[0.11, 0.04, 0.05, 0, 0, 0, 0xd8d8de], [0.04, 0.07, 0.05, 0.04, 0.03, 0, 0xd83a3a]] },
  { id: 'w3_corechip', name: 'Algorithm Core Drive', tier: 'epic', value: [170, 290], weight: 3, tip: 'Still warm. Something inside is reading you back.',
    box: [[0.3, 0.05, 0.22, 0, 0, 0, 0x1a2a44], [0.1, 0.03, 0.1, 0, 0.04, 0, 0x7fc4ff, true], [0.24, 0.02, 0.02, 0, 0.03, 0.08, 0xffd24a]] },
  { id: 'w3_fanarray', name: 'Cooling Fan Array', tier: 'rare', value: [75, 140], weight: 6, tip: 'Spins on its own. Never stops.',
    box: [[0.34, 0.09, 0.34, 0, 0, 0, 0x2a2f38], [0.26, 0.02, 0.26, 0, 0.05, 0, 0x5a6a80], [0.04, 0.03, 0.04, 0, 0.07, 0, 0x7fc4ff, true]] },
  { id: 'w3_roomkey', name: 'Brass Room Key 404', tier: 'rare', value: [95, 165], weight: 1, tip: 'The door it opens is somewhere on this floor. Or it opens all of them.',
    box: [[0.05, 0.05, 0.05, -0.07, 0, 0, 0xc8a24a], [0.13, 0.014, 0.014, 0, 0, 0, 0xc8a24a], [0.014, 0.03, 0.014, 0.05, -0.02, 0, 0xc8a24a], [0.09, 0.05, 0.02, -0.11, -0.03, 0, 0x7a1c22]] },
  { id: 'w3_ledger', name: 'Concierge Ledger', tier: 'epic', value: [155, 265], weight: 4, tip: 'Every guest is written down. Your name is already on the last page.',
    box: [[0.28, 0.06, 0.2, 0, 0, 0, 0x3a1410], [0.26, 0.05, 0.18, 0, 0.005, 0, 0xe9dfc4], [0.28, 0.008, 0.2, 0, 0.03, 0, 0x5c1c18], [0.06, 0.06, 0.006, 0, 0.03, 0.1, 0xc8a24a]] },
  { id: 'w3_cake', name: 'Golden Birthday Cake', tier: 'epic', value: [180, 310], weight: 7, tip: 'It says HAPPY BIRTHDAY. The name has been scratched off.',
    box: [[0.34, 0.12, 0.34, 0, 0, 0, 0xe2b44a], [0.24, 0.1, 0.24, 0, 0.11, 0, 0xf7ecd0], [0.02, 0.09, 0.02, 0, 0.2, 0, 0xff5a70], [0.02, 0.03, 0.02, 0, 0.26, 0, 0xffe27a, true]] },
  { id: 'w3_patientfile', name: 'Patient File 13', tier: 'rare', value: [105, 180], weight: 2, tip: 'Your name. Your handwriting. Dated next Tuesday.',
    box: [[0.26, 0.04, 0.34, 0, 0, 0, 0xc9b98a], [0.24, 0.006, 0.32, 0, 0.022, 0, 0xe9e2cf], [0.05, 0.05, 0.008, 0, 0.03, 0.12, 0xc83a3a]] },
  { id: 'w3_jacket', name: 'Restraint Jacket', tier: 'uncommon', value: [60, 115], weight: 6, tip: 'The sleeves are already tied. From the inside.',
    box: [[0.34, 0.06, 0.28, 0, 0, 0, 0xd8d4c6], [0.32, 0.04, 0.06, 0, 0.04, 0.06, 0xb8b4a6], [0.04, 0.03, 0.04, 0.12, 0.05, 0.1, 0x6a6a6a]] },
  { id: 'w3_wardkey', name: 'Ward Key', tier: 'rare', value: [25, 45], weight: 1, tip: 'Opens the ward EXIT. Somebody kept it in the dark.',
    box: [[0.05, 0.05, 0.05, -0.07, 0, 0, 0x9aa4a8], [0.14, 0.014, 0.014, 0, 0, 0, 0x9aa4a8], [0.014, 0.035, 0.014, 0.055, -0.02, 0, 0x9aa4a8], [0.06, 0.05, 0.012, -0.12, -0.03, 0, 0x3a8a5a]] },
  { id: 'w3_pinata', name: 'Pinata Prize', tier: 'rare', value: [85, 155], weight: 5, tip: 'Rattles. Someone was hit until it burst. It is still full.',
    box: [[0.3, 0.2, 0.22, 0, 0, 0, 0xe8447a], [0.1, 0.1, 0.1, 0.19, 0.08, 0, 0xe8447a], [0.06, 0.04, 0.24, 0, 0.12, 0, 0xffd24a], [0.3, 0.03, 0.05, 0, -0.04, 0, 0x3ac8d8]] },
];

// ------------------------------------------------------------------ door odds / theme pick
const DAY_GUARANTEE = 3;   // day 1, 4, 7, ... always has a wrong door (first-visit guarantee lives on day 1)
/** chance (0..1) that this facility-day has a wrong door. `base` = a moon override (br_level0 = 1). */
export function doorChance(day, base) {
  if (typeof base === 'number' && base >= 0.99) return 1;
  if ((((day | 0) - 1) % DAY_GUARANTEE + DAY_GUARANTEE) % DAY_GUARANTEE === 0) return 1;
  return typeof base === 'number' ? Math.max(0.22, Math.min(base, 0.5)) : 0.22;
}
/** which world the door opens onto. Day 1 is always Level 0 (the one everybody knows). Deterministic per (seed, day, moon). */
export function doorTheme(seed, day, moonId, tier) {
  if ((day | 0) <= 1) return 'l0';
  const r = new RNG(hashString(`w3door|${seed >>> 0}|${day | 0}|${moonId}`) >>> 0);
  const ti = Math.max(0, Math.min(2, (tier | 0) - 1));
  const list = THEME_IDS.map((id) => ({ id, w: THEMES[id].w[ti] })).filter((e) => e.w > 0);
  return r.weighted(list).id;
}
/** facility size class per (seed, moon). Tier 1 never gets 'large' (fair early game). Returns { cls, mul }. */
export const SIZE_MUL = { small: 0.85, medium: 1, large: 1.3 };
export function sizeClassFor(seed, moonId, tier) {
  const r = new RNG(hashString(`w3size|${seed >>> 0}|${moonId}`) >>> 0);
  const list = [{ c: 'small', w: 3 }, { c: 'medium', w: 4 }, { c: 'large', w: (tier | 0) >= 2 ? 3 : 0 }].filter((e) => e.w > 0);
  const cls = r.weighted(list).c;
  return { cls, mul: SIZE_MUL[cls] };
}

// ------------------------------------------------------------------ facility set dressing (planner)
// KINDS: footprint w (along the wall) x d (out from the wall), h. `chair` reserves the far side for a seat.
export const KINDS = {
  workstation: { w: 1.8, d: 1.2, h: 1.1, solid: true },
  shelf: { w: 1.6, d: 0.55, h: 2.0, solid: true },
  crates: { w: 1.3, d: 1.1, h: 1.3, solid: true },
  tableset: { w: 1.9, d: 1.6, h: 0.8, solid: true },
  bench: { w: 1.7, d: 0.5, h: 0.5, solid: true },
  cart: { w: 1.0, d: 0.7, h: 1.1, solid: true },
  cabinet: { w: 0.4, d: 0.14, h: 0.7, solid: false, mount: 1.25 },   // extinguisher / first aid: flush wall mount, no collider
};
const ROOM_KIT = {
  office: ['workstation', 'workstation', 'shelf'], security: ['workstation', 'cart'], lab: ['workstation', 'cart', 'shelf'],
  storage: ['shelf', 'crates', 'shelf', 'crates'], maintenance: ['crates', 'cart', 'shelf'],
  breakroom: ['tableset', 'bench'], lockers: ['bench'], server: ['cart'], big: ['crates', 'cart'], small: ['crates', 'bench'],
};
const rectHit = (a, b, pad) => a.x0 - pad < b.x1 && a.x1 + pad > b.x0 && a.z0 - pad < b.z1 && a.z1 + pad > b.z0;
const kindRect = (kd, x, z, d) => {
  const alongZ = d === 0 || d === 2;   // wall normal along x => the wall runs along z
  const hx = (alongZ ? kd.d : kd.w) / 2, hz = (alongZ ? kd.w : kd.d) / 2;
  return { x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz };
};

/**
 * planDressing(L, rng, opts) -> [{ kind, x, z, yaw, rect }]   (facility layout L from generateLayout)
 *   opts.clear(x0, z0, x1, z1) -> bool : plain walkable floor under the rect (runtime: navClear on the nav grid)
 *   opts.avoid: [{ x, z, r }] spots to keep free (scrap, doors, interactables ...)
 *   opts.skipTypes: room types to leave alone
 */
export function planDressing(L, rng, { clear, avoid = [], skipTypes = [] } = {}) {
  const kit = layoutKit(L);
  const out = [];
  const near = (rc, pad) => avoid.some((a) => a.x > rc.x0 - a.r - pad && a.x < rc.x1 + a.r + pad && a.z > rc.z0 - a.r - pad && a.z < rc.z1 + a.r + pad);
  const tryPlace = (kind, e, along) => {
    const kd = KINDS[kind];
    const [x, z] = kit.wallPoint(e.x, e.z, e.d, along, kd.d / 2 + 0.06);
    const rc = kindRect(kd, x, z, e.d);
    // the aisle in front must be plain floor too (never wall the room in)
    const f = INWARD[e.d];
    const aisle = { x0: Math.min(rc.x0, rc.x0 + f[0] * 0.9, rc.x1 + f[0] * 0.9), x1: Math.max(rc.x1, rc.x0 + f[0] * 0.9, rc.x1 + f[0] * 0.9), z0: Math.min(rc.z0, rc.z0 + f[1] * 0.9, rc.z1 + f[1] * 0.9), z1: Math.max(rc.z1, rc.z0 + f[1] * 0.9, rc.z1 + f[1] * 0.9) };
    if (clear && !(clear(rc.x0, rc.z0, rc.x1, rc.z1) && (kd.mount || clear(aisle.x0, aisle.z0, aisle.x1, aisle.z1)))) return null;
    if (near(rc, 0.25)) return null;
    if (!kd.mount && out.some((o) => !KINDS[o.kind].mount && rectHit(o.rect, rc, 1.05))) return null;
    const p = { kind, x, z, yaw: WALL_ROT[e.d], rect: rc, room: e.room };
    out.push(p);
    return p;
  };
  // rooms
  const bigMul = L.size >= 1.6 ? 1.35 : 1;
  for (const r of L.rooms) {
    if (SPECIAL_ROOMS.has(r.type) || skipTypes.includes(r.type) || r.maze || r.arena || r.treasure) continue;
    const kinds = ROOM_KIT[r.type];
    if (!kinds) continue;
    const walls = kit.perimeter(r).filter((e) => !kit.edgeBusy(e.x, e.z, e.d)).map((e) => ({ ...e, room: r.id }));
    if (!walls.length) continue;
    rng.shuffle(walls);
    const want = Math.max(1, Math.min(4, Math.round((r.w * r.h) / 5 * bigMul)));
    let got = 0;
    for (let i = 0; i < walls.length && got < want; i++) {
      const kind = kinds[(got + i) % kinds.length];
      const kd = KINDS[kind];
      const room = kd.w / 2 + 0.15;
      const span = kit.C / 2 - room;                                 // keep it clear of the corners
      const along = span > 0.2 ? rng.float(-span * 0.7, span * 0.7) : 0;
      if (tryPlace(kind, walls[i], along)) got++;
    }
  }
  // corridors: an extinguisher / first-aid cabinet every ~12 straight cells (flush, no collider)
  for (let z = 0; z < L.h; z++) for (let x = 0; x < L.w; x++) {
    if (L.cells[L.idx(x, z)] !== 2 || !rng.chance(0.07)) continue;
    const ax = kit.straightAxis(x, z);
    if (!ax) continue;
    const dirs = ax === 'x' ? [1, 3] : [0, 2];
    const d = dirs[rng.int(0, 1)];
    if (kit.edgeBusy(x, z, d)) continue;
    tryPlace('cabinet', { x, z, d, room: -1 }, rng.float(-1, 1));
  }
  return out;
}

// ------------------------------------------------------------------ themed pocket set dressing (planner)
export const POCKET_KINDS = {
  lifeguard: { w: 0.9, d: 0.9, h: 2.3, solid: true }, deckchair: { w: 0.7, d: 1.5, h: 0.55, solid: true },
  poolsign: { w: 1.1, d: 0.08, h: 0.5, solid: false, mount: 1.7 }, ringbuoy: { w: 0.6, d: 0.1, h: 0.6, solid: false, mount: 1.3 },
  rack: { w: 0.95, d: 0.95, h: 2.1, solid: true }, rackpair: { w: 1.9, d: 0.95, h: 2.1, solid: true }, ups: { w: 0.7, d: 0.8, h: 1.1, solid: true },
  cabletray: { w: 2.4, d: 0.45, h: 0.35, solid: false, mount: 2.35 },
  hoteldoor: { w: 1.05, d: 0.1, h: 2.15, solid: false, mount: 0 }, luggage: { w: 1.3, d: 0.7, h: 1.4, solid: true },
  sconce: { w: 0.3, d: 0.16, h: 0.4, solid: false, mount: 1.85 }, plant: { w: 0.7, d: 0.7, h: 1.4, solid: true },
  gifts: { w: 1.4, d: 1.2, h: 1.0, solid: true }, partytable: { w: 1.8, d: 1.2, h: 1.0, solid: true },
  balloons: { w: 0.9, d: 0.9, h: 2.4, solid: true }, banner: { w: 2.6, d: 0.06, h: 0.9, solid: false, mount: 1.6 },
  wheelchair: { w: 0.75, d: 1.0, h: 1.0, solid: true }, hospbed: { w: 1.0, d: 2.1, h: 0.95, solid: true },
  padded: { w: 1.6, d: 0.14, h: 2.0, solid: false, mount: 0 }, filecab: { w: 0.55, d: 0.6, h: 1.35, solid: true },
};

/**
 * planPocketDressing(P, rng, theme, extraAvoid) -> [{ kind, x, z, yaw, rect, cell }]   (P = generatePocket plan)
 * One prop per cell at most, only on solid WALL edges, never in the landing cell / near the EXIT / loot / chairs.
 */
export function planPocketDressing(P, rng, th, avoid = []) {
  const T = THEMES[th];
  if (!T || !T.dress) return [];
  const out = [], used = new Set();
  const spawnCell = P.spawnCell;
  const pts = [...avoid, ...(P.loot || []).map((l) => ({ x: l.x, z: l.z, r: 1.2 })), ...(P.landings || []).map((l) => ({ x: l.x, z: l.z, r: 2 })), ...(P.chairs || []).map((c) => ({ x: c.x, z: c.z, r: 1.2 }))];
  if (P.exit) pts.push({ x: P.exit.x ?? P.exit.pos?.x ?? 0, z: P.exit.z ?? P.exit.pos?.z ?? 0, r: 3.4 });
  const C = P.C;
  const cells = [];
  for (let i = 0; i < P.W * P.H; i++) cells.push(i);
  rng.shuffle(cells);
  for (const ci of cells) {
    if (ci === spawnCell || used.has(ci) || !rng.chance(T.dressP)) continue;
    const cx = ci % P.W, cz = (ci / P.W) | 0;
    const ds = [0, 1, 2, 3].filter((d) => P.typeOf(P.edgeKey(cx, cz, d)) === 1);   // EDGE.WALL
    if (!ds.length) continue;
    const d = ds[rng.int(0, ds.length - 1)];
    const kind = rng.pick(T.dress);
    const kd = POCKET_KINDS[kind];
    const [ex, ez] = [[P.ox + (cx + 1) * C, P.oz + cz * C + C / 2], [P.ox + cx * C + C / 2, P.oz + (cz + 1) * C], [P.ox + cx * C, P.oz + cz * C + C / 2], [P.ox + cx * C + C / 2, P.oz + cz * C]][d];
    const inw = INWARD[d];
    const off = 0.11 + kd.d / 2 + 0.03;
    const x = ex + inw[0] * off, z = ez + inw[1] * off;
    const rc = kindRect(kd, x, z, d);
    if (pts.some((a) => a.x > rc.x0 - a.r && a.x < rc.x1 + a.r && a.z > rc.z0 - a.r && a.z < rc.z1 + a.r)) continue;
    used.add(ci);
    out.push({ kind, x, z, yaw: WALL_ROT[d], rect: rc, cell: ci });
  }
  return out;
}
