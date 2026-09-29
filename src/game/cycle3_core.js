// SECTOR CYCLE 3 - pure rules (no DOM, no three, no game object). Glue: cycle3*.js. Design: docs/MASTERPLAN.md 14, 14.1 (Glitch Gates), 14.2, 19 (early comfort);
// notes and knobs: docs/wave4/cycle3.md. Everything here is deterministic (hash01 / RNG only) and node-tested by tools/harness/cycle3.test.mjs.
//
//   GATES        rank table, roll, gate record, chest spec, moon layout options, break rule, hidden gate clue / ping / tear spot, statue puzzle
//   TROPHIES     record merge (run <-> profile), slots of the Trophy Wall on the ship, date / time formatting
//   ELEVATOR     ElevatorRun (ride -> stop between floors -> fuse sequence + brace the door while something knocks -> resume / drop), room picker
//   RELAYS       the "three relays" core puzzle (all three lit at once drops the arena shield)
//   SHRINES      the "Double shrines" endless mutator knobs
import { RNG, hashString } from '../core/rng.js';
import { hash01, BOSS_TABLE, LEGACY_BOSS } from './cycle_core.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ================================================================================================ GLITCH GATES (MASTERPLAN 14.1)
export const GATE = {
  fromQuota: 1,         // first gate on quota index 1 (early game 19: quota 0 is learning time)
  hiddenFromQuota: 2,   // hidden gates from quota 2
  siegeFromQuota: 2,    // Gate Break -> SIEGE only from quota 2 (SIEGE itself starts at quota 2)
  breakDays: 2,         // a gate that is not cleared within 2 days breaks
  maxOpen: 2,           // at most two unresolved gates at a time
  redChance: 0.14,      // of the rolled gates (rank D and up)
  hiddenChance: 0.07,   // of the rolled gates (quota 2+, rank C and up)
  baseChance: 0.32,     // per finished moon day
  chancePerQuota: 0.03, capChance: 0.5,
  pingRange: 26,        // metres: a scan pulse this close to the tear reveals a hidden gate
};
export const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
export const rankIndex = (r) => Math.max(0, RANKS.indexOf(r));

/** Per rank: boss hp (x the core formula), boss damage, facility size + layout options, chest content, XP. `keys` = access cards (0 = the arena stays open, a short dungeon). */
export const RANK_CFG = {
  E: { hpMul: 0.28, dmgMul: 0.70, size: 1.20, wings: 2, lab: 0, keys: 0, perWing: 1, tierAdd: -2, scrap: 0.80, rarity: 'rare',      weapons: 1, shards: [['shard_ecto', 1]],                     gold: 1, xp: 260,  coin: 40 },
  D: { hpMul: 0.40, dmgMul: 0.80, size: 1.35, wings: 2, lab: 0, keys: 1, perWing: 1, tierAdd: -1, scrap: 0.90, rarity: 'rare',      weapons: 1, shards: [['shard_ecto', 2]],                     gold: 1, xp: 380,  coin: 55 },
  C: { hpMul: 0.55, dmgMul: 0.90, size: 1.55, wings: 2, lab: 1, keys: 1, perWing: 2, tierAdd: 0,  scrap: 1.00, rarity: 'epic',      weapons: 1, shards: [['shard_ecto', 2], ['shard_algo', 1]],  gold: 2, xp: 520,  coin: 75 },
  B: { hpMul: 0.72, dmgMul: 1.00, size: 1.75, wings: 3, lab: 1, keys: 1, perWing: 2, tierAdd: 0,  scrap: 1.10, rarity: 'epic',      weapons: 1, shards: [['shard_algo', 2]],                     gold: 3, xp: 700,  coin: 95 },
  A: { hpMul: 0.90, dmgMul: 1.10, size: 1.95, wings: 3, lab: 1, keys: 2, perWing: 3, tierAdd: 1,  scrap: 1.20, rarity: 'legendary', weapons: 1, shards: [['shard_algo', 2], ['shard_source', 1]], gold: 4, xp: 900,  coin: 120 },
  S: { hpMul: 1.10, dmgMul: 1.20, size: 2.15, wings: 3, lab: 1, keys: 2, perWing: 3, tierAdd: 1,  scrap: 1.30, rarity: 'legendary', weapons: 2, shards: [['shard_algo', 3], ['shard_source', 1]], gold: 5, xp: 1200, coin: 150 },
};
/** rank weights by quota index (S needs quota 5+, "S is rare and sector 4+") */
const RANK_W = [
  null,
  { E: 70, D: 30 },
  { E: 40, D: 40, C: 20 },
  { D: 25, C: 40, B: 35 },
  { C: 30, B: 45, A: 25 },
  { B: 30, A: 55, S: 15 },
  { B: 20, A: 55, S: 25 },
];
export const rankWeights = (q) => RANK_W[clamp(q | 0, 0, RANK_W.length - 1)] || null;
export function pickRank(rnd01, q) {
  const w = rankWeights(q);
  if (!w) return null;
  const ids = RANKS.filter((r) => w[r]);
  let tot = 0; for (const r of ids) tot += w[r];
  let x = rnd01 * tot;
  for (const r of ids) { x -= w[r]; if (x < 0) return r; }
  return ids[ids.length - 1];
}
export const gateChance = (q) => Math.min(GATE.capChance, GATE.baseChance + GATE.chancePerQuota * Math.max(0, (q | 0) - GATE.fromQuota));

export function newGates() { return { v: 1, seq: 0, lastRoll: -1, rolled: -1, list: [] }; }
export const openGates = (g) => (g?.list || []).filter((x) => x.state === 'open');
export const listedGates = (g) => openGates(g).filter((x) => !x.hidden || x.found);

/** theme (interior) list of the quota-q sector's moons, for the gate dungeon themes / hidden anchors */
export function sectorInteriors(moons) { return (moons || []).filter((m) => m && m.interior && !m.company && !m.home).map((m) => ({ id: m.id, interior: m.interior, name: m.name })); }

/**
 * Roll a new gate for the day that just ended. `moons` = interiors of the quota's sector ([{id, interior, name}]). Returns the gate record or null.
 * Deterministic in (runKey, day, quota, seq): every peer / re-load agrees.
 */
export function rollGate({ runKey, day, q, gates, moons = [], mode = 'classic', force = null }) {
  q = q | 0;
  const g = gates || newGates();
  if (!force) {
    if (mode !== 'classic' || q < GATE.fromQuota) return null;
    if (openGates(g).length >= GATE.maxOpen) return null;
    if (hash01(`c3g:${runKey}:${day}`) >= gateChance(q)) return null;
  }
  const n = g.seq + 1;
  const tag = `${runKey}:${day}:${n}`;
  let rank = force?.rank || pickRank(hash01(`c3r:${tag}`), Math.max(1, q));
  if (!rank) return null;
  const hidden = force?.hidden ?? (q >= GATE.hiddenFromQuota && !openGates(g).some((x) => x.hidden) && moons.length > 0 && hash01(`c3h:${tag}`) < GATE.hiddenChance);
  let red = force?.red ?? (!hidden && rankIndex(rank) >= 1 && hash01(`c3red:${tag}`) < GATE.redChance);
  if (hidden && rankIndex(rank) < 2) rank = 'C';
  let theme = null, anchor = null, anchorName = null;
  if (moons.length) {
    const pick = moons[Math.floor(hash01(`c3t:${tag}`) * moons.length) % moons.length];
    theme = pick.interior;
    if (hidden) { anchor = pick.id; anchorName = pick.name; }
  }
  return {
    n, id: 'cg' + n, rank, red: !!red, hidden: !!hidden, found: !hidden, theme, anchor, anchorName,
    seed: hashString(`${tag}:seed`) >>> 0, opened: day | 0, expires: (day | 0) + GATE.breakDays, state: 'open', q,
  };
}
/** the gate list after a new day dawns: unresolved gates past their deadline break */
export function tickGates(gates, day) {
  const out = { ...gates, v: 1, rolled: day | 0, list: gates.list.map((x) => ({ ...x })) };
  const broke = [];
  for (const x of out.list) if (x.state === 'open' && (day | 0) >= x.expires) { x.state = 'broken'; broke.push(x); }
  return { gates: out, broke };
}
/** insert a rolled gate (keeps the record list short: 12 newest resolved + all open) */
export function addGate(gates, gate, day) {
  const list = [...gates.list, gate];
  const open = list.filter((x) => x.state === 'open'), done = list.filter((x) => x.state !== 'open').slice(-12);
  return { ...gates, v: 1, seq: gate.n, lastRoll: day | 0, list: [...done, ...open] };
}
export function setGateState(gates, id, patch) {
  return { ...gates, list: gates.list.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
}
/** does a broken gate start a SIEGE? (never before quota 2) */
export const breakStartsSiege = (q) => (q | 0) >= GATE.siegeFromQuota;

/** effective numbers of a gate (red = harder + better loot) */
export function gateStats(g, q = 0) {
  const c = RANK_CFG[g.rank] || RANK_CFG.E;
  const red = g.red ? 1 : 0;
  return {
    hpMul: +(c.hpMul * (red ? 1.35 : 1)).toFixed(3),
    dmgMul: +(c.dmgMul * (red ? 1.2 : 1)).toFixed(3),
    perWing: c.perWing + red,
    keys: c.keys, wings: c.wings, lab: c.lab, size: c.size,
    chests: (red ? 2 : 1) * (g.hidden ? 2 : 1),
    xp: Math.round(c.xp * (red ? 1.5 : 1) * (g.hidden ? 1.5 : 1)), coin: Math.round(c.coin * (red ? 1.5 : 1)),
    q,
  };
}
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const bumpRarity = (r, n) => RARITIES[clamp(RARITIES.indexOf(r) + n, 0, RARITIES.length - 1)];
/** chest content in the shape cycle_inst.dropChest wants: { weapons, minRarity, shards, scrap } (red: +1 rarity step, x2 shards / gold, +1 weapon; hidden: the same again) */
export function gateChestSpec(g) {
  const c = RANK_CFG[g.rank] || RANK_CFG.E;
  const mul = (g.red ? 2 : 1) * (g.hidden ? 2 : 1);
  const spec = {
    weapons: c.weapons + (g.red ? 1 : 0) + (g.hidden ? 1 : 0),
    minRarity: bumpRarity(c.rarity, (g.red ? 1 : 0) + (g.hidden ? 1 : 0)),
    shards: c.shards.map(([id, n]) => [id, n * mul]),
    scrap: [['goldbar', c.gold * mul]],
  };
  if (g.red || rankIndex(g.rank) >= 3) spec.scrap.push(['x_goldbars', g.red ? 2 : 1]);
  return spec;
}
/** the info object cycle_inst reads through ctx.gate() (kind, red, hpMul, chests, chestSpec) */
export function gateInfo(g, q = 0) {
  const s = gateStats(g, q);
  return { kind: g.hidden ? 'hidden' : g.red ? 'red' : 'glitch', rank: g.rank, red: !!g.red, hidden: !!g.hidden, hpMul: s.hpMul, dmgMul: s.dmgMul, chests: s.chests, chestSpec: gateChestSpec(g), n: g.n };
}
/** generator options of the gate dungeon (reuses facility.js: wings + labyrinth + arena). perWing is read by cycle_inst.planContent. */
export function gateLayoutOpts(g) {
  const c = RANK_CFG[g.rank] || RANK_CFG.E, s = gateStats(g);
  return { plan: 'wings', wings: c.wings, labyrinth: c.lab, arena: true, roomMul: 1.05, keys: c.keys, kind: 'gate', perWing: s.perWing };
}
/** moon def of a classic gate: a slimmed-down core (theme boss, rank-scaled). `core` = P.coreMoonDef result for the same quota / theme. */
export function gateMoonFrom(core, g) {
  const c = RANK_CFG[g.rank] || RANK_CFG.E, s = gateStats(g);
  const boss = BOSS_TABLE[g.theme] || BOSS_TABLE.factory;
  const tag = g.hidden ? 'HIDDEN GATE' : g.red ? 'RED GATE' : 'GLITCH GATE';
  return {
    ...core, core: false, coreSector: undefined, gate: true, legacyGate: false, instance: true, id: 'cgate' + g.n,
    interior: g.theme || core.interior, name: `${tag} ${g.rank}`, short: `Gate ${g.rank}`,
    tier: Math.max(1, Math.min(6, (core.tier || 2) + c.tierAdd + (g.red ? 1 : 0))), size: c.size,
    scrapMul: +((core.scrapMul || 1) * c.scrap / 1.35 * (g.red ? 1.25 : 1)).toFixed(2),
    power: Math.max(2, Math.round((core.power || 5) * (0.5 + 0.1 * rankIndex(g.rank)))),
    outdoorPower: 1,
    coreBoss: { id: boss.id, name: boss.name, title: boss.title, rank: g.rank },
    layoutOpts: gateLayoutOpts(g),
    desc: `${tag} (rank ${g.rank}). Boss: ${boss.name}. ${g.red ? 'RED: the exit is sealed until the boss falls. Harder, better loot.' : 'A short glitched dungeon with a boss room at the end.'}`,
    risk: rankIndex(g.rank) >= 3 ? 'LETHAL' : 'HIGH', riskScore: 2 + rankIndex(g.rank),
  };
}

// ---------------------------------------------------------------- hidden gates: clue, ping, tear
export const interiorLabel = { factory: 'Data Center', mansion: 'Haunted Homepage', mineshaft: 'Deep Web Mine', office: 'Corporate Intranet', backrooms: 'The Backrooms', serverfarm: 'Cloud Storage', sewer: 'The Comment Sewer', hospital: 'Telehealth Clinic' };
/** terminal PING on the routed moon: hot (that moon), warm (same interior), cold. */
export function pingReading(gate, moonId, moonInterior) {
  if (!gate || !gate.hidden || gate.found) return null;
  if (gate.anchor === moonId) return 'hot';
  return moonInterior && moonInterior === gate.theme ? 'warm' : 'cold';
}
/** where the tear hangs in the anchor moon's facility: a far, ground-level scrap spot (deterministic in the gate seed) */
export function tearSpot(spots, seed) {
  const rng = new RNG(((seed ^ 0x7e4a11) >>> 0) || 1);
  const ok = (spots || []).filter((s) => s && !s.elevated && !s.item && (s.room ?? 0) >= 0 && (s.dist || 0) >= 7);
  const pool = ok.length ? ok : (spots || []).filter((s) => s && !s.elevated);
  if (!pool.length) return null;
  const far = pool.slice().sort((a, b) => (b.dist || 0) - (a.dist || 0)).slice(0, Math.max(1, Math.ceil(pool.length / 4)));
  const s = rng.pick(far);
  return { x: s.x, y: s.y, z: s.z, yaw: rng.float(0, Math.PI * 2), room: s.room };
}
/** a scan pulse at `p` reveals the tear when it is within range (the host re-checks with the peer's real position) */
export function scanReveals(tear, p, range = GATE.pingRange) {
  if (!tear || !p) return false;
  return Math.hypot(tear.x - p.x, tear.z - p.z) <= range && Math.abs(tear.y - p.y) < 6;
}

// ---------------------------------------------------------------- the three rules (hidden gate statue puzzle)
export const RULES = [
  { n: 1, statue: 'algo',    text: 'Respect the Algorithm.' },
  { n: 2, statue: 'viewers', text: 'Worship the viewers.' },
  { n: 3, statue: 'alive',   text: 'Stay alive.' },
];
export const STATUE_NAMES = { algo: 'THE ALGORITHM', viewers: 'THE VIEWERS', alive: 'THE LIVING' };
export class StatuePuzzle {
  constructor(seed) {
    const rng = new RNG(((seed ^ 0x57a7) >>> 0) || 1);
    this.order = RULES.map((r) => r.statue);
    this.plaque = rng.shuffle(RULES.map((r) => ({ ...r })));    // the plaque lists the rules in a scrambled order (the numbers stay)
    this.slots = rng.shuffle(this.order.slice());                // statue positions left to right
    this.progress = 0; this.solved = false; this.zaps = 0;
  }
  /** returns 'ok' | 'done' | 'wrong' | 'ignored' */
  press(statue) {
    if (this.solved) return 'ignored';
    if (!this.order.includes(statue)) return 'ignored';
    if (statue === this.order[this.progress]) { this.progress++; if (this.progress >= this.order.length) { this.solved = true; return 'done'; } return 'ok'; }
    this.progress = 0; this.zaps++;
    return 'wrong';
  }
}
/** room for the hidden Sanctum: far from the entrance, not the arena / key rooms / special rooms */
export function pickSanctumRoom(L, keyRooms = []) {
  const bad = (r) => !r || ['entrance', 'vault', 'generator', 'core'].includes(r.type) || r.treasure || r.arena || keyRooms.includes(r.id) || r.w * r.h < 4;
  let best = null, bd = -1;
  for (const r of L.rooms || []) {
    if (bad(r)) continue;
    const d = L.distOf ? (L.distOf[L.idx(r.cx, r.cz)] || 0) : 0;
    if (d > bd) { bd = d; best = r; }
  }
  return best ? best.id : null;
}

// ================================================================================================ TROPHIES
/** the 12 mounts of the Trophy Wall: 9 bosses + raid + keystone + the hidden gate. Row-major, 6 columns. */
export const TROPHY_SLOTS = [
  { id: 'foreman', kind: 'boss' }, { id: 'loadbalancer', kind: 'boss' }, { id: 'middlemanager', kind: 'boss' }, { id: 'hydra', kind: 'boss' }, { id: 'surgeon', kind: 'boss' }, { id: 'host', kind: 'boss' },
  { id: 'excavator', kind: 'boss' }, { id: 'lobbymanager', kind: 'boss' }, { id: 'legacybot', kind: 'boss' }, { id: 'raid', kind: 'raid' }, { id: 'keystone', kind: 'keystone' }, { id: 'hidden', kind: 'gate' },
];
export const TROPHY_IDS = TROPHY_SLOTS.map((s) => s.id);
export const BOSS_NAMES = { ...Object.fromEntries(Object.values(BOSS_TABLE).map((b) => [b.id, b.name])), legacybot: LEGACY_BOSS.name, raid: "The Algorithm's Core", keystone: 'Corrupted Keystone', hidden: 'The Hidden Gate' };
export const isTrophyId = (id) => TROPHY_IDS.includes(id);
export const mmss = (sec) => { sec = Math.max(0, Math.round(sec || 0)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
export const fmtDate = (ms) => { try { return new Date(ms).toISOString().slice(0, 10); } catch { return '-'; } };

const cleanCrew = (a) => (Array.isArray(a) ? a.map((s) => String(s).slice(0, 24)).slice(0, 8) : []);
const cleanSide = (s) => ({ at: +s?.at || 0, crew: cleanCrew(s?.crew), t: Math.max(0, Math.round(+s?.t || 0)), sector: Math.max(0, s?.sector | 0), day: Math.max(0, s?.day | 0), src: String(s?.src || 'world').slice(0, 12), lvl: s?.lvl === undefined ? undefined : String(s.lvl).slice(0, 10) });

/** apply one kill / completion to a trophy map. evt: { id, at, crew:[names], t:sec, sector, day, src, lvl }. Immutable. */
export function recordKill(map, evt) {
  if (!isTrophyId(evt?.id)) return { map: map || {}, rec: null, first: false };
  const out = { ...(map || {}) };
  const old = out[evt.id];
  const side = cleanSide(evt);
  const rec = old
    ? { ...old, kills: (old.kills | 0) + 1, last: side, best: side.t > 0 && (!old.best || side.t < old.best.t) ? { t: side.t, at: side.at, crew: side.crew } : old.best }
    : { id: evt.id, kills: 1, first: side, last: side, best: side.t > 0 ? { t: side.t, at: side.at, crew: side.crew } : null };
  if (evt.id === 'keystone') rec.top = Math.max(+old?.top || 0, +evt.lvl || 0);
  if (evt.id === 'raid') { const order = ['normal', 'heroic', 'mythic']; rec.top = order[Math.max(order.indexOf(old?.top), order.indexOf(evt.lvl), 0)]; }
  out[evt.id] = rec;
  return { map: out, rec, first: !old };
}
/** idempotent merge of two records of the same trophy (run <-> profile <-> peers) */
export function mergeRecord(a, b) {
  if (!a) return b ? JSON.parse(JSON.stringify(b)) : null;
  if (!b) return JSON.parse(JSON.stringify(a));
  const first = (a.first?.at || Infinity) <= (b.first?.at || Infinity) ? a.first : b.first;
  const last = (a.last?.at || 0) >= (b.last?.at || 0) ? a.last : b.last;
  const best = a.best && b.best ? (a.best.t <= b.best.t ? a.best : b.best) : a.best || b.best || null;
  const out = { id: a.id, kills: Math.max(a.kills | 0, b.kills | 0), first, last, best };
  if (a.top !== undefined || b.top !== undefined) out.top = a.id === 'raid' ? ['normal', 'heroic', 'mythic'][Math.max(['normal', 'heroic', 'mythic'].indexOf(a.top), ['normal', 'heroic', 'mythic'].indexOf(b.top), 0)] : Math.max(+a.top || 0, +b.top || 0);
  return JSON.parse(JSON.stringify(out));
}
export function mergeMaps(a, b) {
  const out = {};
  for (const id of TROPHY_IDS) { const r = mergeRecord(a?.[id], b?.[id]); if (r) out[id] = r; }
  return out;
}
export const ensureProfileC3 = (p) => { if (!p) return null; if (!p.cycle3 || typeof p.cycle3 !== 'object') p.cycle3 = {}; if (!p.cycle3.trophies || typeof p.cycle3.trophies !== 'object') p.cycle3.trophies = {}; if (!p.cycle3.cases || typeof p.cycle3.cases !== 'object') p.cycle3.cases = {}; return p.cycle3; };
/** a peer keeps a record in its own profile only if it was part of the crew (the host keeps everything) */
export const peerKeeps = (rec, name, isHost) => !!rec && (isHost || (rec.first?.crew || []).includes(name) || (rec.last?.crew || []).includes(name) || (rec.best?.crew || []).includes(name));
/** copy a run trophy map into a profile (returns true when something changed) */
export function saveToProfile(profile, runMap, name, isHost) {
  const c = ensureProfileC3(profile);
  if (!c) return false;
  let changed = false;
  for (const id of TROPHY_IDS) {
    const r = runMap?.[id];
    if (!peerKeeps(r, name, isHost)) continue;
    const m = mergeRecord(c.trophies[id], r);
    if (JSON.stringify(m) !== JSON.stringify(c.trophies[id])) { c.trophies[id] = m; changed = true; }
  }
  return changed;
}
/** seed a fresh run's trophy map from the host profile (new run after 'fired', or a run created before this module existed) */
export const seedFromProfile = (profile, runMap) => mergeMaps(runMap || {}, ensureProfileC3(profile)?.trophies || {});
export const trophyCount = (map) => TROPHY_IDS.filter((id) => map?.[id]?.kills > 0).length;

// ================================================================================================ ELEVATOR STOP
export const ELEV = {
  fromQuota: 0,
  existsChance: 0.5,           // per facility (seeded): a freight elevator pair exists
  stopChance: [0.4, 0.55, 0.6],// by quota bracket (0, 1, 2+): a ride stops between floors
  rideSec: 5.5, resumeSec: 3.2,
  timer: [60, 50, 45],         // s to fix the fuse before the cab drops
  knockEvery: [9, 7.5, 6.5], firstKnock: 7, warn: 1.6,
  holdAdd: 0.45, holdDecay: 0.15, braceMin: 0.2,
  seqLen: [3, 3, 4],
  hitDmg: [0, 8, 12], failDmg: [0, 15, 22],    // quota 0: never any damage (early comfort)
  callRange: 3.6,
};
const bracket = (q) => clamp(q | 0, 0, 2);
export const elevatorStops = (seed, q) => hash01(`c3es:${seed}`) < ELEV.stopChance[bracket(q)];

/** the sim of one ride. tick(dt) / press(i) / brace() return event lists; snap() is what the peers draw. */
export class ElevatorRun {
  constructor({ seed = 1, q = 0, stops = null } = {}) {
    const b = bracket(q), rng = new RNG(((seed ^ 0xe1e7a7) >>> 0) || 1);
    this.q = q | 0; this.b = b;
    this.stops = stops ?? elevatorStops(seed, q);
    const len = ELEV.seqLen[b];
    this.seq = Array.from({ length: len }, () => rng.int(0, 2));
    this.phase = 'ride'; this.t = 0; this.prog = 0; this.hold = 0; this.hits = 0; this.wrong = 0;
    this.rideT = this.stops ? ELEV.rideSec * 0.55 : ELEV.rideSec;
    this.limit = ELEV.timer[b]; this.stopT = 0; this.nextKnock = ELEV.firstKnock; this.warned = false; this.knocks = 0;
    this.ok = null;
  }
  get left() { return Math.max(0, this.limit - this.stopT); }
  get done() { return this.phase === 'done'; }
  tick(dt) {
    const ev = [];
    if (this.phase === 'done') return ev;
    this.t += dt;
    if (this.phase === 'ride') {
      if (this.t >= this.rideT) {
        if (this.stops) { this.phase = 'stopped'; this.t = 0; ev.push({ k: 'stop' }); }
        else { this.phase = 'done'; this.ok = true; ev.push({ k: 'arrive', ok: true, dmg: 0 }); }
      }
    } else if (this.phase === 'stopped') {
      this.stopT += dt;
      this.hold = Math.max(0, this.hold - ELEV.holdDecay * dt);
      const every = ELEV.knockEvery[this.b];
      if (!this.warned && this.stopT >= this.nextKnock - ELEV.warn) { this.warned = true; ev.push({ k: 'warn', n: this.knocks + 1 }); }
      if (this.stopT >= this.nextKnock) {
        this.knocks++; this.warned = false; this.nextKnock += every;
        const absorbed = this.hold >= ELEV.braceMin;
        if (!absorbed) { this.hits++; this.prog = Math.max(0, this.prog - 1); }
        ev.push({ k: 'knock', n: this.knocks, absorbed, dmg: absorbed ? 0 : ELEV.hitDmg[this.b], prog: this.prog });
      }
      if (this.stopT >= this.limit) { this.phase = 'fall'; this.t = 0; ev.push({ k: 'fail' }); }
    } else if (this.phase === 'resume' || this.phase === 'fall') {
      if (this.t >= ELEV.resumeSec) {
        const ok = this.phase === 'resume';
        this.phase = 'done'; this.ok = ok;
        ev.push({ k: 'arrive', ok, dmg: ok ? 0 : ELEV.failDmg[this.b] });
      }
    }
    return ev;
  }
  /** a fuse-panel button (0 red, 1 green, 2 blue). A wrong one resets the sequence. */
  press(i) {
    if (this.phase !== 'stopped') return [];
    if (i === this.seq[this.prog]) {
      this.prog++;
      if (this.prog >= this.seq.length) { this.phase = 'resume'; this.t = 0; return [{ k: 'progress', prog: this.prog }, { k: 'solved' }]; }
      return [{ k: 'progress', prog: this.prog }];
    }
    this.prog = 0; this.wrong++;
    return [{ k: 'wrong' }];
  }
  /** the door lever: bracing absorbs the next knock */
  brace() { if (this.phase !== 'stopped') return []; this.hold = Math.min(1, this.hold + ELEV.holdAdd); return [{ k: 'brace', hold: this.hold }]; }
  snap() { return { ph: this.phase, prog: this.prog, len: this.seq.length, hold: +this.hold.toFixed(2), left: Math.ceil(this.left), knocks: this.knocks, warn: this.warned ? 1 : 0 }; }
  /** reward for a finished ride (arrival point): scrap crates + XP */
  reward() { return this.stops && this.ok ? { scrap: 1 + Math.min(2, this.q >> 1) + (this.hits === 0 ? 1 : 0), xp: 30 + 10 * this.b, clean: this.hits === 0 } : { scrap: 0, xp: 0, clean: false }; }
}

/**
 * Where the two elevator doors go. `kit` = layoutKit(L). Picks a near room (A) and a deep room (B) with a solid wall run (rock behind, nothing sticks out).
 * Returns { a, b } where each = { room, x, z, d } (cell + wall side) or null. Deterministic in (L, seed).
 */
export function pickElevatorRooms(L, kit, seed) {
  const rng = new RNG(((seed ^ 0x4c1f7) >>> 0) || 1);
  const bad = (r) => !r || ['entrance', 'vault', 'generator', 'core', 'nest'].includes(r.type) || r.treasure || r.arena || r.m2ch || r.w * r.h < 4 || (L.mazes || []).some((m) => m.id === r.id);
  const cands = [];
  for (const r of L.rooms || []) {
    if (bad(r)) continue;
    const walls = kit.solidWalls(r).filter((e) => {
      // not in a corner cell (a prop 2.4 m wide needs the middle of a wall)
      const onX = e.d === 1 || e.d === 3;
      const along = onX ? e.x - r.x : e.z - r.z, len = onX ? r.w : r.h;
      return len >= 3 ? along > 0 && along < len - 1 : true;
    });
    if (!walls.length) continue;
    cands.push({ r, dist: kit.roomDist(r), walls });
  }
  if (cands.length < 2) return null;
  const maxD = Math.max(...cands.map((c) => c.dist));
  const near = cands.filter((c) => c.dist <= Math.max(4, maxD * 0.4)), far = cands.filter((c) => c.dist >= Math.max(7, maxD * 0.6));
  if (!near.length || !far.length) return null;
  const A = rng.pick(near), B = rng.pick(far.filter((c) => c !== A).length ? far.filter((c) => c !== A) : far);
  if (!A || !B || A === B) return null;
  const w = (c) => { const e = rng.pick(c.walls); return { room: c.r.id, x: e.x, z: e.z, d: e.d }; };
  return { a: w(A), b: w(B) };
}
export const elevatorExists = (seed, q, quotaFrom = ELEV.fromQuota) => (q | 0) >= quotaFrom && hash01(`c3ee:${seed}`) < ELEV.existsChance;

// ================================================================================================ RELAYS (core puzzle)
export const RELAY = { count: 3, holdSolo: 75, holdCrew: 55, fromRooms: 3 };
export const relayHold = (crew) => ((crew | 0) <= 1 ? RELAY.holdSolo : RELAY.holdCrew);
/** three relays; each stays lit for `hold` seconds after a press; all three lit at once = solved (latched). */
export class RelayPuzzle {
  constructor(n = RELAY.count, hold = RELAY.holdSolo) { this.n = n; this.hold = hold; this.t = new Array(n).fill(0); this.solved = false; }
  press(i) {
    if (this.solved || i < 0 || i >= this.n) return 'ignored';
    this.t[i] = this.hold;
    if (this.t.every((x) => x > 0)) { this.solved = true; return 'done'; }
    return 'lit';
  }
  tick(dt) { if (this.solved) return; for (let i = 0; i < this.n; i++) if (this.t[i] > 0) this.t[i] = Math.max(0, this.t[i] - dt); }
  lit() { return this.t.filter((x) => x > 0).length; }
  snap() { return { on: this.t.map((x) => (x > 0 ? Math.ceil(x) : 0)), solved: this.solved ? 1 : 0 }; }
}
/** three rooms for the relays: one per wing when the layout has wings, else spread by distance. Never the arena / entrance / key rooms / special rooms. */
export function pickRelayRooms(L, keyRooms = [], seed = 1) {
  const rng = new RNG(((seed ^ 0x8e1a75) >>> 0) || 1);
  const bad = (r) => !r || ['entrance', 'vault', 'generator', 'core', 'nest'].includes(r.type) || r.treasure || r.arena || keyRooms.includes(r.id) || r.w * r.h < 2;
  const out = [];
  for (const w of L.wings || []) {
    const c = rng.shuffle((w.rooms || []).filter((id) => !bad(L.rooms[id]) && !(L.mazes || []).some((m) => m.id === id)));
    if (c.length) out.push(c[0]);
    if (out.length >= RELAY.count) break;
  }
  if (out.length < RELAY.count) {
    const rest = rng.shuffle((L.rooms || []).filter((r) => !bad(r) && !out.includes(r.id) && !(L.mazes || []).some((m) => m.id === r.id)));
    for (const r of rest) { if (out.length >= RELAY.count) break; out.push(r.id); }
  }
  return out.slice(0, RELAY.count);
}

// ================================================================================================ SHRINES (endless mutator "Double shrines")
export const SHRINE_BASE_CHANCE = 0.35;
export const shrineChance = (mul) => +Math.min(0.9, SHRINE_BASE_CHANCE * (mul > 0 ? mul : 1)).toFixed(3);
export const dieWeight = (w, mul) => +(Math.max(0, w) * (mul > 0 ? mul : 1)).toFixed(3);
