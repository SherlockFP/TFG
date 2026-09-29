// DEFENSE CORE (wave 5, "unify"): ONE table of defence entities, ONE targeting / firing helper, ONE defence-power calculator.
// Pure data + functions (no three / DOM / game access, node-tested by tools/harness/defense_core.test.mjs). Docs: docs/wave5/unify.md.
//
// Who reads it (adapters, not rewrites):
//   siege deployables   src/game/deployables.js   DEPS combat + footprint fields are applied from DEFENSE (applyToDeps); targeting = pickTarget / chainTargets
//   ship2 roof mounts   src/game/ship2_core.js    MOUNT_TYPES = mountTypes() (the kits flagged `mount`)
//   zones fortify       src/game/zones_core.js    DEFS / defencePower / winChance come from here (zoneDefs, defencePower, winOdds)
//   homeworld towers    src/game/homeworld_core.js  registers hw_<type> (per-level arrays) via regHomeworld; homeworld_raid_core targets with pickTarget
//   horror traps        src/game/horror_core.js   registers trap_<id> (facility-only) via regTrap; the stats stay in TRAPS
// Every entity resolves through getDef(id): { id, sys, kind, name, hp, range, dps, powerUse (units/s), ammo, upkeep, cost (credits), minQ, place, rating, ... }.
//
// Entity ids: the shared deployables keep their plain ids (turret1, tesla, barr_wood, spikes ...); the other systems are prefixed
// (hw_gun, hw_wall, trap_laser) because a homeworld "tesla" / "spikes" and a horror "spikes" are different things.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const round1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------------------------- 1. the shared table (siege deployables)
// Stat names are the ones deployables.js uses (so applyToDeps is a plain assign):
//   hp, r / hx / hz / h (footprint), solid, cost = flow-field crossing cost, range, dmg, rate (shots / s), cd (s between casts), turn, chain, fall,
//   dps (contact damage / s), slow, blast, trig, arm, pool, regen, heal, hullHeal, draw (power per shot / cast), drawS (power / s), burn (fuel / s).
// NOT here (deployables.js keeps them, they are shop / balance knobs): price, weight, blurb, supply, cap, ammo.
// meta: mount = can sit on the ship2 roof; zone = { o (list order), cost (credits, no kit needed), upkeep (credits / day), minQ (quota index) } = buildable in a zone.
export const DEFENSE = {
  turret1: { kind: 'turret', name: 'Auto-Turret MK1', mount: 1, zone: { o: 3, cost: 180, upkeep: 6, minQ: 0 },
    s: { hp: 120, r: 0.55, hx: 0.5, hz: 0.5, h: 1.35, solid: 1, cost: 6, range: 22, dmg: 7, rate: 4, turn: 4 } },
  turret2: { kind: 'turret', name: 'Auto-Turret MK2', mount: 1, zone: { o: 6, cost: 320, upkeep: 8, minQ: 1 },
    s: { hp: 200, r: 0.55, hx: 0.5, hz: 0.5, h: 1.35, solid: 1, cost: 6, range: 26, dmg: 12, rate: 3, turn: 6, draw: 1.2 } },
  turret3: { kind: 'turret', name: 'Auto-Turret MK3', mount: 1, zone: { o: 9, cost: 560, upkeep: 12, minQ: 2 },
    s: { hp: 320, r: 0.6, hx: 0.55, hz: 0.55, h: 1.4, solid: 1, cost: 6, range: 30, dmg: 18, rate: 3.5, turn: 9, draw: 2 } },
  tesla: { kind: 'tesla', name: 'Tesla Coil', mount: 1, zone: { o: 7, cost: 400, upkeep: 10, minQ: 1 },
    s: { hp: 160, r: 0.65, hx: 0.6, hz: 0.6, h: 2.2, solid: 1, cost: 6, range: 12, dmg: 30, cd: 1.6, chain: 3, fall: 0.7, draw: 8 } },
  barr_wood: { kind: 'barricade', name: 'Wood Barricade', zone: { o: 0, cost: 60, upkeep: 2, minQ: 0 },
    s: { hp: 200, r: 1.1, hx: 1.1, hz: 0.22, h: 1.4, solid: 1, cost: 25 } },
  barr_metal: { kind: 'barricade', name: 'Metal Barricade', zone: { o: 5, cost: 140, upkeep: 3, minQ: 1 },
    s: { hp: 520, r: 1.1, hx: 1.1, hz: 0.22, h: 1.5, solid: 1, cost: 25 } },
  spikes: { kind: 'spikes', name: 'Spike Strip', zone: { o: 1, cost: 70, upkeep: 2, minQ: 0 },
    s: { hp: 90, r: 1.4, hx: 1.4, hz: 0.7, h: 0.4, cost: 0, dps: 6, slow: 0.5 } },
  mine: { kind: 'mine', name: 'Proximity Mine', zone: { o: 2, cost: 90, upkeep: 3, minQ: 0 },
    s: { hp: 30, r: 0.4, hx: 0.35, hz: 0.35, h: 0.2, cost: 0, dmg: 90, blast: 4.2, trig: 1.6, arm: 3 } },
  flood: { kind: 'flood', name: 'Floodlight Tower', mount: 1, zone: { o: 4, cost: 150, upkeep: 4, minQ: 0 },
    s: { hp: 140, r: 0.5, hx: 0.4, hz: 0.4, h: 4.1, solid: 1, cost: 6, range: 22, drawS: 0.5 } },
  drone: { kind: 'drone', name: 'Repair Drone', mount: 1,
    s: { hp: 90, r: 0.45, hx: 0.4, hz: 0.4, h: 1.8, cost: 0, range: 9, heal: 6, hullHeal: 0.5, drawS: 1.5 } },
  sensor: { kind: 'sensor', name: 'Motion Sensor', mount: 1,
    s: { hp: 60, r: 0.35, hx: 0.3, hz: 0.3, h: 1.7, cost: 0, range: 40, drawS: 0.3 } },
  shield: { kind: 'shield', name: 'Shield Dome', zone: { o: 8, cost: 350, upkeep: 6, minQ: 2 },
    s: { hp: 200, r: 0.6, hx: 0.5, hz: 0.5, h: 1.4, solid: 1, cost: 6, range: 5.5, pool: 350, regen: 8, drawS: 0.5 } },
  gen: { kind: 'gen', name: 'Portable Generator',
    s: { hp: 180, r: 0.7, hx: 0.55, hz: 0.4, h: 1.25, solid: 1, cost: 6, range: 14, burn: 0.3 } },
  bank: { kind: 'bank', name: 'Battery Bank',
    s: { hp: 150, r: 0.6, hx: 0.5, hz: 0.36, h: 1.0, solid: 1, cost: 6, range: 10 } },
};
export const DEFENSE_IDS = Object.keys(DEFENSE);

/** overwrite the combat + footprint fields of a deployables DEPS table from the core (deployables.js calls this once after its own table) */
export function applyToDeps(DEPS) {
  for (const id of DEFENSE_IDS) if (DEPS[id]) Object.assign(DEPS[id], DEFENSE[id].s, { name: DEFENSE[id].name, kind: DEFENSE[id].kind });
  return DEPS;
}
/** the kits the ship2 roof can carry (ship2_core MOUNT_TYPES) */
export const mountTypes = () => DEFENSE_IDS.filter((id) => DEFENSE[id].mount);
/** ids buildable in a zone, in the order the fortify list shows them */
export const ZONE_IDS = DEFENSE_IDS.filter((id) => DEFENSE[id].zone).sort((a, b) => DEFENSE[a].zone.o - DEFENSE[b].zone.o);

// ---------------------------------------------------------------------------------------------- 2. the defence-power calculator
// rating = what one defence adds to a zone / base "defence power". Calibrated once against the old hand-written zones table (12 / 17 / 26 / 21 / 4 / 9 / 5 / 8 / 4 / 14):
// offence = K[kind] x effective dps^0.92 x a mild range factor; soak (barricade hp, dome pool) and support (light) are linear.
const K = { turret: 0.55, tesla: 0.86, spikes: 0.9, trap: 0.5, cryo: 0.9, sniper: 0.5, flame: 0.5, gun: 0.55, hwtesla: 0.5 };
const rangeFactor = (range) => (range > 0 ? clamp(Math.pow(range / 22, 0.3), 0.8, 1.25) : 1);
const chainSum = (n, fall) => { let s = 0, m = 1; for (let i = 0; i < Math.max(1, n | 0); i++) { s += m; m *= fall; } return s; };
/** damage per second one defence deals to a single group under fire (contact / cast / trap cycle) */
export function dpsOf(def) {
  if (!def) return 0;
  if (Number.isFinite(def.dpsFlat)) return def.dpsFlat;
  if (def.dps > 0) return def.dps;
  if (def.dmg > 0 && def.rate > 0) return def.dmg * def.rate;
  if (def.dmg > 0 && def.cd > 0) return (def.dmg / def.cd) * (def.chain > 1 ? chainSum(def.chain, def.fall || 0.7) : 1);
  if (def.dmg > 0 && def.cycle > 0) return def.dmg / def.cycle;
  return 0;
}
/** one-off burst (mines) */
export const burstOf = (def) => (def?.blast > 0 && def.dmg > 0 ? def.dmg : 0);
/** power units / s the entity draws while working (ship2 budget, generators) */
export function powerPerSec(def) {
  if (!def) return 0;
  if (def.drawS > 0) return def.drawS;
  if (def.draw > 0) return def.draw * (def.rate > 0 ? def.rate : def.cd > 0 ? 1 / def.cd : 1);
  return 0;
}
/** rating of one defence (one entity of a level `lv` for the per-level ones) */
export function ratingOf(def) {
  if (!def) return 0;
  let r = 0;
  const k = def.k ?? K[def.kind] ?? 0.5;
  if (def.kind === 'mine') r += 0.09 * burstOf(def);
  else if (dpsOf(def) > 0) r += k * Math.pow(dpsOf(def), 0.92) * (def.kind === 'spikes' || def.kind === 'trap' ? 1 : rangeFactor(def.range));
  if (def.kind === 'barricade' || def.kind === 'wall') r += 0.0175 * (def.hp || 0);
  if (def.kind === 'shield') r += 0.04 * (def.pool || 0);
  if (def.kind === 'flood') r += 0.18 * (def.range || 0);
  if (def.kind === 'drone') r += 0.5 * (def.heal || 0);
  if (def.slow > 0 && def.kind !== 'spikes') r += 8 * def.slow * rangeFactor(def.range);
  return Math.max(0, Math.round(r));
}
export const BASE_DEF = 6;   // a zone core defends itself a little
/**
 * The one defence-power number. counts = { id: n } over defence ids (any system), opts = { dry (unpaid upkeep: x0.4), ups (zone level + moon upgrades, +10 % each, max 6), base }.
 * Used by zones for the auto-resolve; homeworld / ship read the same per-entity ratings.
 */
export function defencePower(counts, opts = {}) {
  let p = opts.base ?? BASE_DEF;
  for (const [id, n] of Object.entries(counts || {})) p += (getDef(id)?.rating || 0) * (n | 0);
  if (opts.dry) p *= 0.4;
  return Math.round(p * (1 + 0.1 * clamp(opts.ups | 0, 0, 6)) * 10) / 10;
}
/** probability the defence wins an auto-resolve: defence >= mean wave power x jitter, jitter uniform in [a, b] */
export function winOdds(def, waveMean, jitter = [0.75, 1.3]) {
  const [a, b] = jitter;
  return clamp((def / waveMean - a) / (b - a), 0, 1);
}

// ---------------------------------------------------------------------------------------------- 3. the registry
const REG = new Map();
/** normalised view of an entity. `raw` is anything with the stat names above; extra = { sys, id, name, upkeep, cost, minQ, ... } */
function norm(id, sys, kind, name, s, extra = {}) {
  const def = { id, sys, kind, name, hp: s.hp ?? null, range: s.range ?? 0, ...s, ...extra };
  def.dps = dpsOf(def);
  def.burst = burstOf(def);
  def.powerUse = powerPerSec(def);
  def.rating = extra.rating ?? ratingOf(def);
  return def;
}
export function registerDefense(def) { REG.set(def.id, def); return def; }
for (const id of DEFENSE_IDS) {
  const D = DEFENSE[id], z = D.zone;
  registerDefense(norm(id, 'siege', D.kind, D.name, D.s, {
    mount: !!D.mount, zone: !!z, cost: z ? z.cost : 0, upkeep: z ? z.upkeep : 0, minQ: z ? z.minQ : 0,
    place: { r: D.s.r, hx: D.s.hx, hz: D.s.hz, h: D.s.h, solid: !!D.s.solid, flow: D.s.cost },
    ammo: id === 'turret1', facilityOnly: false,
  }));
}
export const getDef = (id) => REG.get(id) || null;
export const allDefs = () => [...REG.values()];
export const defsOf = (sys) => allDefs().filter((d) => d.sys === sys);

// ---- adapters: other systems register their own entities in the same table ------------------------------------------------------------
/** homeworld tower / wall / trap building b (homeworld_core BUILDINGS entry) at level lv (1-based). Per-level arrays are kept as `lv` tables. */
export function hwDef(type, b, lv = 1) {
  const i = clamp(lv - 1, 0, (b.hp?.length || 1) - 1);
  const tw = b.tw || null, trap = b.trap || null;
  const kind = tw ? (type === 'gun' ? 'gun' : type === 'tesla' ? 'hwtesla' : type) : type === 'wall' || type === 'gate' ? 'wall' : 'trap';
  const s = { hp: b.hp[i], range: tw ? tw.range[i] : trap?.r || 0 };
  if (tw) { s.dpsFlat = tw.dps[i]; if (tw.chain) s.chain = tw.chain[i]; if (tw.slow) s.slow = tw.slow[i]; if (tw.shot) s.shot = tw.shot[i]; }
  else if (trap?.dps) s.dpsFlat = trap.dps[i];
  else if (trap?.burst) { s.dmg = trap.burst[i]; s.blast = trap.r; s.charges = trap.charges?.[i]; }
  return norm('hw_' + type, 'homeworld', kind, b.name, s, { lv, cost: b.base?.cr || 0, powerUse: b.pw ? b.pw[i] : 0, upkeep: 0, k: type === 'tesla' ? 0.5 : undefined,
    place: { solid: type === 'wall' || type === 'gate' ? true : false, passable: !!b.passable }, facilityOnly: false, levels: b.hp.length });
}
/** register every defence-category building of the homeworld table (level 1 view; use hwDef(type, b, lv) for other levels) */
export function regHomeworld(BUILDINGS) {
  for (const [type, b] of Object.entries(BUILDINGS)) if (b.cat === 'def') registerDefense(hwDef(type, b, 1));
}
/** horror trap (horror_core TRAPS entry T): facility-only, pay-to-arm, its stats stay in TRAPS */
export function regTrap(T) {
  const ticks = T.tick > 0 ? Math.max(1, Math.floor(T.strike / T.tick)) : 1;
  return registerDefense(norm('trap_' + T.id, 'horror', 'trap', T.name, { hp: null, range: 0, dmg: T.dmgC * ticks, cycle: T.tele + T.strike + T.cd, charges: T.charges },
    { cost: T.price, upkeep: 0, minQ: 0, powerUse: 0, place: { facility: true }, facilityOnly: true }));
}
/** the stats of a homeworld tower at level lv scaled by the power ratio (what RaidSim / the ghost raid use) */
export const towerStats = (b, lv, powerRatio = 1) => {
  const i = clamp(lv - 1, 0, b.hp.length - 1);
  return { dps: b.tw.dps[i] * powerRatio, range: b.tw.range[i], chain: b.tw.chain?.[i] || 1, slow: b.tw.slow?.[i] || 0 };
};

// ---------------------------------------------------------------------------------------------- 4. zones adapter
/** zones_core DEFS: { name, cost, upkeep, power, minQ } from the core (power = the calculator's rating, rounded) */
export function zoneDefs() {
  const out = {};
  for (const id of ZONE_IDS) { const d = getDef(id); out[id] = { name: d.name, cost: d.cost, upkeep: d.upkeep, power: Math.round(d.rating), minQ: d.minQ }; }
  return out;
}

// ---------------------------------------------------------------------------------------------- 5. targeting / firing helper
const posOf = (o) => o.pos || o;
/**
 * Pick a target for a defence at `from` ({x, z, y?}) among `list` (anything with x / z or .pos).
 * opts: { mode: 'nearest' | 'strongest', minRange, dy (max height difference), pred (extra filter), alive (default: hp > 0 when hp is a number) }.
 * Ties: the first candidate wins. Returns the list item or null.
 */
export function pickTarget(list, from, range, opts = {}) {
  const { mode = 'nearest', minRange = 0, dy = Infinity, pred = null } = opts;
  let best = null, bd = mode === 'nearest' ? range : -1, bs = -1;
  for (const c of list) {
    if (c.dead || (typeof c.hp === 'number' && c.hp <= 0 && opts.alive !== false)) continue;
    const p = posOf(c), d = Math.hypot(p.x - from.x, p.z - from.z);
    if (d > range || d < minRange) continue;
    if (dy !== Infinity && Math.abs((p.y || 0) - (from.y || 0)) > dy) continue;
    if (pred && !pred(c, d)) continue;
    if (mode === 'strongest') { const s = c.hp || c.maxHp || 0; if (s > bs) { bs = s; best = c; } }
    else if (d < bd || (!best && d <= bd)) { bd = d; best = c; }
  }
  return best;
}
/** the chain of a tesla-like defence: `first` then up to hops-1 nearest not-yet-hit targets within `radius` of the previous one */
export function chainTargets(first, list, hops, radius, opts = {}) {
  const out = [first], seen = new Set([first]);
  let cur = first;
  for (let i = 1; i < hops && cur; i++) {
    cur = pickTarget(list, posOf(cur), radius, { ...opts, pred: (c, d) => !seen.has(c) && (!opts.pred || opts.pred(c, d)) });
    if (cur) { out.push(cur); seen.add(cur); }
  }
  return out;
}
/** everything within r of a point, with a linear falloff (1 at the centre, 1 - falloff at the edge). Returns [{ c, dmg }] */
export function splash(list, at, r, dmg, falloff = 0) {
  const out = [];
  for (const c of list) {
    if (c.dead || (typeof c.hp === 'number' && c.hp <= 0)) continue;
    const p = posOf(c), d = Math.hypot(p.x - at.x, (p.z ?? 0) - (at.z ?? 0));
    if (d <= r) out.push({ c, dmg: dmg * (1 - falloff * (d / r)) });
  }
  return out;
}
/** damage of one shot / tick: dmg x tier multiplier x (1 +- jitter). rnd = () => [0, 1) (Math.random by default) */
export function shotDamage(def, mul = 1, jitter = 0.1, rnd = Math.random) {
  return (def.dmg || 0) * mul * (1 - jitter + 2 * jitter * rnd());
}
/** seconds between shots / casts */
export const cooldownOf = (def) => (def.rate > 0 ? 1 / def.rate : def.cd > 0 ? def.cd : 1);
