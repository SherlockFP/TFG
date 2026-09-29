// SHIPYARD rules (pure, node-tested: tools/harness/shipyard.test.mjs). Design: docs/MASTERPLAN.md section 13, notes: docs/wave3/shipyard.md.
// The ship starts as the Starter Pod core; twelve modules (Mk I-III) bolt onto the sockets in world/hardpoints.js. State lives on the HOST
// profile (profile.shipyard, survives fired runs) and is mirrored into run.sy for every peer / late joiner:
//   { v, m: { <socket>: { id, t } }, parts: { plate, bulk, coil, brk }, paint: { c1, c2, pat }, theme, name, day: { <playerId>: dayNumber } }
import { SOCKETS, SOCKET_IDS, WALL_T } from '../world/hardpoints.js';
import { DECK_ROOMS, deckSlots } from '../world/shiplayout.js';   // [shipdeck] Upper Deck rules live here, geometry in world/shiplayout.js
import { blankDeco, sanitizeDeco } from './polish4_core.js';   // [polish4] decals + furniture ride along in the ship state

export const VERSION = 1;
export const WEIGHT_PER_MODULE = 0.05;          // route cost +5 % per installed module
export const MAX_NAME = 16;
export const PAINT_COST = 25, NAME_COST = 15, MOVE_COST = 60, SELL_REFUND = 0.5;

// ---------------------------------------------------------------------------------------------- ship parts (items)
export const PARTS = {
  plate: { id: 'sy_plate', name: 'Hull Plate', value: [12, 20], w: 40, tip: 'Ship part. Feed it to the Frame Console (Shipyard) with other parts to build or upgrade a ship module for free.' },
  bulk: { id: 'sy_bulk', name: 'Bulkhead', value: [16, 28], w: 32, tip: 'Ship part. Feed it to the Frame Console (Shipyard) with other parts to build or upgrade a ship module for free.' },
  coil: { id: 'sy_coil', name: 'Engine Coil', value: [30, 48], w: 18, tip: 'Ship part. Feed it to the Frame Console (Shipyard) with other parts to build or upgrade a ship module for free.' },
  brk: { id: 'sy_brk', name: 'Hardpoint Bracket', value: [45, 70], w: 10, tip: 'Ship part. Every module needs one (two for Mk III). Feed it to the Frame Console (Shipyard).' },
};
export const PART_KEYS = Object.keys(PARTS);
export const PART_ITEM = Object.fromEntries(PART_KEYS.map((k) => [k, PARTS[k].id]));
export const ITEM_PART = Object.fromEntries(PART_KEYS.map((k) => [PARTS[k].id, k]));
export const PART_CAP = 99;

/** which part drops, weighted; rnd = () => [0,1) */
export function rollPart(rnd, bias = {}) {
  let tot = 0;
  const ws = PART_KEYS.map((k) => { const w = PARTS[k].w * (bias[k] || 1); tot += w; return w; });
  let r = rnd() * tot;
  for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r <= 0) return PART_KEYS[i]; }
  return PART_KEYS[0];
}
/** chance that a chest drops a part, by chest tier id (wood / iron / gold ... or a rarity name) */
export const CHEST_PART_CHANCE = { wood: 0.06, common: 0.06, iron: 0.12, uncommon: 0.1, rare: 0.14, gold: 0.22, epic: 0.22, legendary: 0.3, mythic: 0.4 };
export const chestChance = (tier) => CHEST_PART_CHANCE[String(tier)] ?? 0.1;
/** guaranteed parts: boss kill / siege held / extraction success */
export const REWARD_PARTS = { boss: 3, siege: 2, siegeFlawless: 3, extraction: 2 };

// ---------------------------------------------------------------------------------------------- modules
const REAR = ['R1', 'R2'], NORTH = ['N1', 'N2', 'N3', 'N4'];
export const MODULES = {
  cargo: { name: 'Cargo Bay', short: 'CARGO', sockets: REAR, size: 1, cr: 220, color: 0xd8a020, blurb: 'Freight racks and a loading ramp. A broker bonus on everything you sell; Mk III adds the auto value scanner.' },
  garage: { name: 'Garage', short: 'GARAGE', sockets: REAR, size: 1.5, cr: 340, color: 0x4a86b8, blurb: 'Uplink Van dock and mechanics. The van is winched aboard from farther away and drives faster; Mk III has a tune-up rack.' },
  engine: { name: 'Engine Room', short: 'ENGINE', sockets: REAR, size: 2, cr: 480, color: 0xff7a2a, blurb: 'Big-ship drives. Cancels part of the weight penalty and the landing noise of a heavy hull.' },
  hangar: { name: 'Hangar', short: 'HANGAR', sockets: ['R2'], size: 2, cr: 520, color: 0x8a92a0, blurb: 'Supply bay behind the rear module. A field locker restocks the crew every landing.' },
  workshop: { name: 'Workshop', short: 'WORKSHOP', sockets: ['N2'], size: 1.5, cr: 300, color: 0xc8581c, blurb: 'Tool wall and a second bench in reach of the workbench. Crafting is faster and luckier.' },
  medbay: { name: 'Med Bay', short: 'MED BAY', sockets: NORTH, size: 1.5, cr: 320, color: 0x5adcc8, blurb: 'Treatment bed and the Revival Pad: bring a body aboard and pay to bring your crewmate back mid-day.' },
  lab: { name: 'Lab', short: 'LAB', sockets: ['N1', 'N3', 'N4'], size: 1.5, cr: 420, color: 0x9a6aff, blurb: 'Sample analyzer. Strange items and creature samples give more parts and a better blueprint chance.' },
  bunk: { name: 'Bunk Room', short: 'BUNKS', sockets: NORTH, size: 1, cr: 240, color: 0x6a86b8, blurb: 'Respawn point for the dead and a Rested buff on every landing.' },
  trophy: { name: 'Trophy Hall', short: 'TROPHIES', sockets: ['N1', 'N3', 'N4'], size: 1, cr: 200, color: 0xffd23f, blurb: 'Mounted creature heads from your bestiary. Sign the guestbook once a day for a little XP.' },
  lounge: { name: 'Lounge', short: 'LOUNGE', sockets: NORTH, size: 1, cr: 260, color: 0xff6a9a, blurb: 'Couches, a jukebox and a stage. Crew hanging out together relaxes the room; jam sessions here pay more.' },
  obs: { name: 'Observation Deck', short: 'DECK', sockets: ['DECK'], size: 1.5, cr: 360, color: 0x7ad8ff, blurb: 'Roof deck with a glass canopy, reached by the service lift. Standing up there sharpens your scan.' },
  turret: { name: 'Turret Hardpoint', short: 'TURRET', sockets: ['TURRET'], size: 1.5, cr: 380, color: 0xff5a3a, blurb: 'Roof gun that shoots whatever gets near the hull. Mk III has twin barrels.' },
};
export const MODULE_IDS = Object.keys(MODULES);
export const ROMAN = ['', 'I', 'II', 'III'];
export const MAX_TIER = 3;

const r5 = (n) => Math.round(n / 5) * 5;
/** credit price to install (tier 1) or upgrade TO tier `t` */
export function creditCost(id, t) { const m = MODULES[id]; if (!m || t < 1 || t > MAX_TIER) return 0; return r5(m.cr * [0, 1, 1.8, 3][t]); }
/** parts price to install (tier 1) or upgrade TO tier `t` */
export function partCost(id, t) {
  const m = MODULES[id]; if (!m || t < 1 || t > MAX_TIER) return null;
  const s = m.size, up = (n) => Math.ceil(n * s);
  const extra = id === 'turret' || id === 'engine' || id === 'lab' ? 1 : 0;
  if (t === 1) return { plate: up(3), bulk: up(2), coil: extra, brk: 1 };
  if (t === 2) return { plate: up(4), bulk: up(3), coil: up(1), brk: 1 };
  return { plate: up(6), bulk: up(4), coil: up(2) + 1, brk: 2 };
}
export const partCostText = (c) => PART_KEYS.filter((k) => c?.[k]).map((k) => `${c[k]} ${PARTS[k].name}`).join(', ');

// ---------------------------------------------------------------------------------------------- customisation
export const PAINTS = [
  { id: 'orange', name: 'Safety Orange', hex: 0xc8581c }, { id: 'red', name: 'Alarm Red', hex: 0xb02a22 }, { id: 'sea', name: 'Deep Sea', hex: 0x1f4a7a },
  { id: 'sky', name: 'Sky', hex: 0x4a86b8 }, { id: 'forest', name: 'Forest', hex: 0x2f6a3a }, { id: 'lime', name: 'Lime', hex: 0x8bb82a },
  { id: 'sun', name: 'Sun', hex: 0xd8b020 }, { id: 'violet', name: 'Violet', hex: 0x6a3a9a }, { id: 'pink', name: 'Hot Pink', hex: 0xd84a8a },
  { id: 'bone', name: 'Bone', hex: 0xd8d0b8 }, { id: 'slate', name: 'Slate', hex: 0x4a5058 }, { id: 'void', name: 'Void', hex: 0x15161a },
];
export const PAINT_IDS = PAINTS.map((p) => p.id);
export const PATTERNS = [{ id: 'solid', name: 'Solid' }, { id: 'stripes', name: 'Stripes' }, { id: 'hazard', name: 'Hazard' }, { id: 'checker', name: 'Checker' }, { id: 'chevron', name: 'Chevron' }, { id: 'dots', name: 'Dots' }];
export const PATTERN_IDS = PATTERNS.map((p) => p.id);
export const THEMES = [{ id: 'steel', name: 'Steel', tint: 0xffffff }, { id: 'rust', name: 'Rust', tint: 0xd8a888 }, { id: 'clean', name: 'Clean Room', tint: 0xdfeaf4 }, { id: 'warm', name: 'Warm', tint: 0xf0d8b0 }];
export const THEME_IDS = THEMES.map((p) => p.id);
export const paintHex = (id) => (PAINTS.find((p) => p.id === id) || PAINTS[0]).hex;
export const themeTint = (id) => (THEMES.find((p) => p.id === id) || THEMES[0]).tint;
export const DEFAULT_NAME = 'KC-07';
export function sanitizeName(n) {
  const s = String(n ?? '').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, MAX_NAME);
  return s || DEFAULT_NAME;
}

// ---------------------------------------------------------------------------------------------- state
export function blankState() {
  return { v: VERSION, m: {}, parts: { plate: 0, bulk: 0, coil: 0, brk: 0 }, paint: { c1: 'orange', c2: 'slate', pat: 'stripes' }, theme: 'steel', name: DEFAULT_NAME, day: {}, deco: blankDeco(), deck: blankDeck() };
}
const int = (v, lo, hi, d = 0) => { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
export function sanitize(raw) {
  const s = blankState();
  if (!raw || typeof raw !== 'object') return s;
  const seen = new Set();
  for (const sock of SOCKET_IDS) {
    const e = raw.m?.[sock];
    if (!e || !MODULES[e.id] || seen.has(e.id) || !MODULES[e.id].sockets.includes(sock)) continue;
    const par = SOCKETS[sock].parent;
    if (par && !s.m[par]) continue;            // chained sockets need their parent
    s.m[sock] = { id: e.id, t: int(e.t, 1, MAX_TIER, 1) };
    seen.add(e.id);
  }
  for (const k of PART_KEYS) s.parts[k] = int(raw.parts?.[k], 0, PART_CAP);
  const p = raw.paint || {};
  s.paint = { c1: PAINT_IDS.includes(p.c1) ? p.c1 : 'orange', c2: PAINT_IDS.includes(p.c2) ? p.c2 : 'slate', pat: PATTERN_IDS.includes(p.pat) ? p.pat : 'stripes' };
  s.theme = THEME_IDS.includes(raw.theme) ? raw.theme : 'steel';
  s.name = sanitizeName(raw.name);
  s.deco = sanitizeDeco(raw.deco);
  s.deck = sanitizeDeck(raw.deck);
  if (raw.day && typeof raw.day === 'object') for (const [k, v] of Object.entries(raw.day).slice(0, 16)) if (Number.isFinite(v)) s.day[String(k).slice(0, 32)] = int(v, 0, 1e6);
  return s;
}

// ---------------------------------------------------------------------------------------------- UPPER DECK (wave 5 shipdeck)
// state.deck = { t: 0..3, rooms: [slot0..slot3] } - Mk I bare deck (stair + hatch), Mk II two rooms the crew picks, Mk III dome + 4 slots + one extra roof mount.
export const DECK_MAX = 3;
export const DECK_CR = [0, 450, 800, 1500];
export const DECK_ROOM_CR = 120;
export const DECK_INFO = {
  bunk: { name: 'Bunk Room', tip: 'Cots and a night lamp. +60 s of Rested buff if the Bunk module is built.' },
  store: { name: 'Storage', tip: 'Shelves and crates. +6 rack slots if the Cargo Bay is built.' },
  turret: { name: 'Turret Control', tip: 'Gunnery console. Roof turret fires 10% faster if the Turret Hardpoint is built.' },
  lounge: { name: 'Observation Lounge', tip: 'Sofa and a warm lamp. Jam sessions pay 10% more if the Lounge is built.' },
};
export const deckPartCost = (t) => (t === 1 ? { plate: 6, bulk: 4, coil: 1, brk: 1 } : t === 2 ? { plate: 8, bulk: 6, coil: 2, brk: 1 } : t === 3 ? { plate: 12, bulk: 8, coil: 4, brk: 2 } : null);
export function blankDeck() { return { t: 0, rooms: [null, null, null, null] }; }
export function sanitizeDeck(raw) {
  const t = int(raw?.t, 0, DECK_MAX), n = deckSlots(t), seen = new Set();
  const rooms = [0, 1, 2, 3].map((i) => { const r = raw?.rooms?.[i]; if (i >= n || !DECK_ROOMS.includes(r) || seen.has(r)) return null; seen.add(r); return r; });
  return { t, rooms };
}
export const deckHas = (s, room) => !!s.deck?.rooms?.includes(room);
export function deckQuote(s) {
  const cur = s.deck?.t || 0, to = cur + 1;
  if (to > DECK_MAX) return { cur, to: null, maxed: true };
  return { cur, to, cr: DECK_CR[to], parts: deckPartCost(to), install: cur === 0 };
}
export function tryDeckUp(s, wallet, via = 'credits') {
  const q = deckQuote(s);
  if (q.maxed) return fail('Already Mk III.');
  const bad = canPay(s, wallet, q.cr, q.parts, via);
  if (bad) return fail(bad);
  pay(s, wallet, q.cr, q.parts, via);
  s.deck = sanitizeDeck({ t: q.to, rooms: s.deck.rooms });
  return { ok: true, t: q.to, via };
}
/** put `room` (or null = empty) into deck slot `slot`; a room can stand in one slot only (moving it swaps the empty slot) */
export function tryDeckRoom(s, wallet, slot, room) {
  slot = Math.floor(Number(slot));
  if (!(slot >= 0 && slot < deckSlots(s.deck.t))) return fail('That deck slot is not built yet.');
  if (room !== null && !DECK_ROOMS.includes(room)) return fail('Unknown room.');
  if (s.deck.rooms[slot] === room) return fail('Nothing changed.');
  const cost = room === null ? 0 : DECK_ROOM_CR;
  if (wallet.cr < cost) return fail('Not enough credits.');
  wallet.cr -= cost;
  const rooms = [...s.deck.rooms];
  if (room !== null) { const at = rooms.indexOf(room); if (at >= 0) rooms[at] = null; }
  rooms[slot] = room;
  s.deck = sanitizeDeck({ t: s.deck.t, rooms });
  return { ok: true, slot, room, cr: cost };
}

export const socketOf = (s, id) => SOCKET_IDS.find((k) => s.m[k]?.id === id) || null;
export const tierOf = (s, id) => { const k = socketOf(s, id); return k ? s.m[k].t : 0; };
export const installed = (s) => SOCKET_IDS.filter((k) => s.m[k]).map((k) => ({ socket: k, id: s.m[k].id, t: s.m[k].t }));
export const count = (s) => installed(s).length;
export const totalTiers = (s) => installed(s).reduce((a, e) => a + e.t, 0);
export const children = (s, sock) => SOCKET_IDS.filter((k) => SOCKETS[k].parent === sock && s.m[k]);

// ---------------------------------------------------------------------------------------------- effects (numbers used by game/shipyard.js)
const pick = (arr, t) => arr[Math.max(0, Math.min(arr.length - 1, t))];
export function effects(s) {
  const T = (id) => tierOf(s, id);
  const e = {
    sellBonus: pick([0, 0.03, 0.06, 0.09], T('cargo')), cargoSlots: pick([0, 12, 24, 36], T('cargo')), scanner: T('cargo'),
    dockBonus: pick([0, 12, 24, 36], T('garage')), vanSpeed: pick([1, 1.05, 1.1, 1.2], T('garage')),
    weightCut: pick([0, 0.25, 0.5, 0.75], T('engine')),
    hangarKit: T('hangar'),
    craftTimeMul: pick([1, 0.9, 0.8, 0.7], T('workshop')), craftLuck: pick([0, 0.03, 0.06, 0.1], T('workshop')),
    reviveCost: pick([0, 100, 75, 50], T('medbay')), healFrac: pick([0, 0.5, 0.75, 1], T('medbay')), healCd: pick([0, 90, 60, 30], T('medbay')),
    labYield: pick([0, 1, 1.5, 2], T('lab')), labBp: pick([0, 0.1, 0.2, 0.35], T('lab')),
    bunk: T('bunk'), restSec: pick([0, 180, 300, 420], T('bunk')),
    trophyXp: pick([0, 12, 20, 30], T('trophy')), trophyPer: pick([0, 1, 1.5, 2], T('trophy')), trophyCap: pick([0, 60, 100, 160], T('trophy')),
    loungeRelief: pick([0, 3, 5, 8], T('lounge')), jamMul: pick([1, 1.15, 1.3, 1.5], T('lounge')), stageLights: T('lounge') >= 3,
    scanMul: pick([1, 1.25, 1.4, 1.6], T('obs')),
    turret: T('turret'), turretDmg: pick([0, 6, 9, 12], T('turret')), turretRange: pick([0, 22, 26, 30], T('turret')), turretBarrels: pick([0, 1, 1, 2], T('turret')), turretRate: pick([0, 2.2, 2.6, 3], T('turret')),
  };
  // [shipdeck] Upper Deck rooms: small bonuses that only count when the matching module is built (nothing changes without a deck)
  e.deck = s.deck?.t || 0;
  if (e.deck >= 2) {
    if (deckHas(s, 'turret') && e.turret) e.turretRate = +(e.turretRate * 1.1).toFixed(3);
    if (deckHas(s, 'store') && e.cargoSlots) e.cargoSlots += 6;
    if (deckHas(s, 'bunk') && e.restSec) e.restSec += 60;
    if (deckHas(s, 'lounge') && e.jamMul > 1) e.jamMul = +(e.jamMul + 0.1).toFixed(2);
  }
  return e;
}
/** route / landing cost multiplier: +5 % per module, reduced by the Engine Room */
export function routeMul(s) { return 1 + WEIGHT_PER_MODULE * count(s) * (1 - effects(s).weightCut); }
export const routeCost = (base, s) => Math.round((Number(base) || 0) * routeMul(s));
/** extra Threat at touchdown (heavy hulls are loud); Engine Room dampens it */
export function landingThreat(s) {
  const n = count(s);
  const base = n >= 3 ? 2 + (n >= 6 ? 2 : 0) + (n >= 9 ? 2 : 0) : 0;
  return Math.round(base * (1 - effects(s).weightCut));
}
/** a heavier hull is a bigger siege target: hull hit multiplier */
export const siegeSurface = (s) => 1 + 0.03 * count(s);
export function weightText(s) { const m = routeMul(s); return `+${Math.round((m - 1) * 100)}%`; }

// ---------------------------------------------------------------------------------------------- geometry data (footprints, aboard volumes)
export function hullBox(s, base = { x0: -8.3, x1: 7.6, z0: -4.2, z1: 4.2 }) {
  const h = { ...base };
  for (const k of SOCKET_IDS) {
    if (!s.m[k] || SOCKETS[k].kind === 'roof') continue;
    const r = SOCKETS[k].room;
    h.x0 = Math.min(h.x0, r.x0 - 0.35); h.x1 = Math.max(h.x1, r.x1 + 0.35); h.z0 = Math.min(h.z0, r.z0 - 0.35); h.z1 = Math.max(h.z1, r.z1 + 0.35);
  }
  return h;
}
/** volumes that count as "aboard the ship" (world/ship.js SHIP_EXTRA) */
export function aboardVolumes(s) {
  const out = [];
  for (const k of SOCKET_IDS) {
    if (!s.m[k] || SOCKETS[k].kind === 'roof') continue;
    const r = SOCKETS[k].room, d = SOCKETS[k].dir;
    out.push({ x0: r.x0 - (d[0] > 0 ? WALL_T + 0.05 : 0), x1: r.x1, z0: r.z0, z1: r.z1 + (d[1] < 0 ? WALL_T + 0.05 : 0), y0: -0.8, y1: 4.0 });
  }
  if (s.m.DECK) {
    out.push({ x0: -7.3, x1: 7.3, z0: -3.8, z1: 3.8, y0: 3.6, y1: 9 });
    out.push({ x0: -3.5, x1: -1.5, z0: 3.6, z1: 5.6, y0: -1.6, y1: 9 });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- actions (host). wallet = { cr }.
const fail = (why) => ({ ok: false, why });
const canPay = (s, wallet, cr, parts, via) => {
  if (via === 'parts') { for (const k of PART_KEYS) if ((parts?.[k] || 0) > s.parts[k]) return 'Missing ship parts.'; return null; }
  return wallet.cr >= cr ? null : 'Not enough credits.';
};
const pay = (s, wallet, cr, parts, via) => { if (via === 'parts') for (const k of PART_KEYS) s.parts[k] -= parts?.[k] || 0; else wallet.cr -= cr; };

/** what would installing / upgrading `id` cost right now? */
export function quote(s, id, socket = null) {
  const m = MODULES[id];
  if (!m) return null;
  const cur = tierOf(s, id), to = cur + 1;
  if (to > MAX_TIER) return { id, cur, to: null, maxed: true };
  return { id, cur, to, cr: creditCost(id, to), parts: partCost(id, to), socket: socket || socketOf(s, id), install: cur === 0 };
}
export function freeSockets(s, id) {
  const m = MODULES[id];
  if (!m) return [];
  return m.sockets.filter((k) => !s.m[k] && (!SOCKETS[k].parent || s.m[SOCKETS[k].parent]));
}
export function tryInstall(s, wallet, id, socket, via = 'credits') {
  const m = MODULES[id];
  if (!m) return fail('Unknown module.');
  if (tierOf(s, id) > 0) return fail('Already installed.');
  if (!SOCKETS[socket] || !m.sockets.includes(socket)) return fail('That module does not fit there.');
  if (s.m[socket]) return fail('That hardpoint is taken.');
  if (SOCKETS[socket].parent && !s.m[SOCKETS[socket].parent]) return fail('Build the module in front of it first.');
  const cr = creditCost(id, 1), parts = partCost(id, 1);
  const bad = canPay(s, wallet, cr, parts, via);
  if (bad) return fail(bad);
  pay(s, wallet, cr, parts, via);
  s.m[socket] = { id, t: 1 };
  return { ok: true, id, socket, t: 1, via };
}
export function tryUpgrade(s, wallet, id, via = 'credits') {
  const sock = socketOf(s, id);
  if (!sock) return fail('Not installed.');
  const to = s.m[sock].t + 1;
  if (to > MAX_TIER) return fail('Already Mk III.');
  const cr = creditCost(id, to), parts = partCost(id, to);
  const bad = canPay(s, wallet, cr, parts, via);
  if (bad) return fail(bad);
  pay(s, wallet, cr, parts, via);
  s.m[sock].t = to;
  return { ok: true, id, socket: sock, t: to, via };
}
export function refundOf(s, id) {
  const sock = socketOf(s, id); if (!sock) return 0;
  let cr = 0; for (let t = 1; t <= s.m[sock].t; t++) cr += creditCost(id, t);
  return Math.floor(cr * SELL_REFUND);
}
export function trySell(s, wallet, id) {
  const sock = socketOf(s, id);
  if (!sock) return fail('Not installed.');
  if (children(s, sock).length) return fail('Remove the module behind it first.');
  const cr = refundOf(s, id);
  delete s.m[sock];
  wallet.cr += cr;
  return { ok: true, id, socket: sock, refund: cr };
}
export function tryMove(s, wallet, id, to) {
  const from = socketOf(s, id);
  if (!from) return fail('Not installed.');
  if (!MODULES[id].sockets.includes(to) || !SOCKETS[to]) return fail('That module does not fit there.');
  if (from === to) return fail('It is already there.');
  if (s.m[to]) return fail('That hardpoint is taken.');
  if (SOCKETS[to].parent && (!s.m[SOCKETS[to].parent] || SOCKETS[to].parent === from)) return fail('Build the module in front of it first.');
  if (children(s, from).length) return fail('Remove the module behind it first.');
  if (wallet.cr < MOVE_COST) return fail('Not enough credits.');
  wallet.cr -= MOVE_COST;
  s.m[to] = s.m[from]; delete s.m[from];
  return { ok: true, id, socket: to, from };
}
/** feed carried ship parts into the stock: counts = { plate: n, ... } */
export function tryDeposit(s, counts) {
  let n = 0;
  for (const k of PART_KEYS) {
    const add = Math.max(0, Math.floor(Number(counts?.[k]) || 0));
    const room = PART_CAP - s.parts[k];
    const put = Math.min(add, room);
    s.parts[k] += put; n += put;
  }
  return n ? { ok: true, n } : fail('Nothing to deposit.');
}
export function tryPaint(s, wallet, o) {
  const next = { c1: PAINT_IDS.includes(o?.c1) ? o.c1 : s.paint.c1, c2: PAINT_IDS.includes(o?.c2) ? o.c2 : s.paint.c2, pat: PATTERN_IDS.includes(o?.pat) ? o.pat : s.paint.pat };
  const theme = THEME_IDS.includes(o?.theme) ? o.theme : s.theme;
  const name = o && 'name' in o ? sanitizeName(o.name) : s.name;
  const paintChanged = next.c1 !== s.paint.c1 || next.c2 !== s.paint.c2 || next.pat !== s.paint.pat || theme !== s.theme;
  const nameChanged = name !== s.name;
  if (!paintChanged && !nameChanged) return fail('Nothing changed.');
  const cr = (paintChanged ? PAINT_COST : 0) + (nameChanged ? NAME_COST : 0);
  if (wallet.cr < cr) return fail('Not enough credits.');
  wallet.cr -= cr;
  s.paint = next; s.theme = theme; s.name = name;
  return { ok: true, cr };
}

// ---------------------------------------------------------------------------------------------- module actions (host rules)
export const REVIVE_RANGE = 2.4;
/** Trophy Hall guestbook: xp for one visit, once per game day per player */
export function trophyReward(e, kinds, visitors = 1) {
  if (!e.trophyXp) return 0;
  const raw = e.trophyXp + kinds * e.trophyPer;
  return Math.min(e.trophyCap, Math.round(raw * (1 + (e.trophyPer >= 2 ? 0.1 * Math.max(0, visitors - 1) : 0))));
}
/** Lab: components from an analysed sample */
export function labYield(base, e, rnd = Math.random) {
  const out = [];
  for (const [id, n] of base) { const f = n * e.labYield; out.push([id, Math.floor(f) + (rnd() < f - Math.floor(f) ? 1 : 0)]); }
  return out.filter(([, n]) => n > 0);
}
/** Hangar field locker (host, at every landing) */
export function hangarKit(tier) {
  return [null, [['glowstick', 2]], [['glowstick', 2], ['medkit', 1]], [['glowstick', 3], ['medkit', 1], ['walkie', 1]]][Math.max(0, Math.min(3, tier))] || [];
}
/** Rested buff def per Bunk Room tier */
export const RESTED = [null,
  { maxHp: 5, speed: 0.01, stamRegen: 1.05 },
  { maxHp: 10, speed: 0.02, stamRegen: 1.1 },
  { maxHp: 15, speed: 0.03, stamRegen: 1.15 }];
