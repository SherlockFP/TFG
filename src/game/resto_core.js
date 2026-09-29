// RESTO core (wave 8, module 'resto'; docs/wave8/resto.md): the alien restaurant tycoon on the homeworld. PURE data + rules (no three / DOM / game access), node-tested by
// tools/harness/resto.test.mjs. Contents: plot + piece catalogue (tycoon buy pads), menu (dishes built from ingredient CATEGORIES so the existing farming / foraging /
// fishing items all count), alien species with taste rules, reputation -> stars, passive + active income caps, contract, and the customer simulation (Sim) the HOST runs.
// Persistent state = profile.resto (sanitize), synced to everyone as run.rs. Volatile sim (customers, pests, shuttle) lives on the host and is broadcast as 'rsx'.

export const VERSION = 1;

// ---------------------------------------------------------------------------------------------- plot (world metres, homeworld plateau half = 58)
// East strip outside the build square (|x|,|z| <= 45), between the E fence and the plateau wall, clear of the four approach lanes (|z| < 7), the totems (z <= 18.2)
// and the camp kitchen (z >= 46). The shuttle pad sits north of the door (customers walk south into the dining room).
export const PLOT = { x0: 48.4, x1: 56.6, z0: 28, z1: 44.8, cx: 52.5, doorX0: 51, doorX1: 54 };
export const SHUTTLE = { x: 52.5, z: 23.4, r: 3.2 };
export const DOOR = { x: 52.5, z: 28.2 };
export const PASS = { x: 51.6, y: 1.02, z: 40.4 };        // plates appear here (counter top)
export const PAY_SPOT = { x: 55.3, z: 30.9 };
export const AISLE_X = 52.5;
export const queueSlot = (i) => ({ x: AISLE_X, z: 29.3 + 0.85 * Math.min(i, 7) });
export const INSPECT_SPOT = { x: 52.5, z: 36.5 };

/** purchase catalogue, in tycoon order. req = piece that must exist, star = minimum restaurant stars, kind drives visuals + rules */
export const PIECES = [
  { id: 'floor', kind: 'floor', name: 'Foundation & walls', cost: 100, req: null, star: 1, at: [52.5, 32], desc: 'Tile floor, walls, the pass counter and the ticket rail.' },
  { id: 'stove1', kind: 'stove', name: 'Stove', cost: 60, req: 'floor', star: 1, at: [49.6, 43.3], desc: 'Cook the orders here.' },
  { id: 'fridge', kind: 'fridge', name: 'Fridge', cost: 50, req: 'floor', star: 1, at: [55.8, 42.6], desc: 'Stock ingredients here. Moon produce goes in, dishes come out.' },
  { id: 'counter', kind: 'counter', name: 'Register', cost: 80, req: 'floor', star: 1, at: [55.3, 29.7], desc: 'Take payments. The till also collects the daily passive income.' },
  { id: 'table1', kind: 'table', name: 'Table 1', cost: 70, req: 'floor', star: 1, at: [50.3, 31.5], desc: 'Two seats.' },
  { id: 'table2', kind: 'table', name: 'Table 2', cost: 70, req: 'table1', star: 1, at: [54.7, 31.5], desc: 'Two more seats.' },
  { id: 'sign', kind: 'sign', name: 'Neon sign', cost: 120, req: 'counter', star: 1, at: [52.5, 28.1], pad: [52.5, 26.4], desc: 'Shuttles come more often.' },
  { id: 'table3', kind: 'table', name: 'Table 3', cost: 110, req: 'table2', star: 1, at: [50.3, 34.5], desc: 'Two more seats.' },
  { id: 'stove2', kind: 'stove', name: 'Second stove', cost: 150, req: 'stove1', star: 1, at: [51.7, 43.3], desc: 'Two orders at once.' },
  { id: 'decor1', kind: 'decor', name: 'Decor I: plants and rug', cost: 250, req: 'table3', star: 1, at: [52.5, 35.5], pad: [52.5, 33.6], tier: 1, desc: 'Raises the star cap to 3.' },
  { id: 'table4', kind: 'table', name: 'Table 4', cost: 170, req: 'table3', star: 2, at: [54.7, 34.5], desc: 'Two more seats.' },
  { id: 'table5', kind: 'table', name: 'Table 5', cost: 210, req: 'table4', star: 2, at: [50.3, 37.5], desc: 'Two more seats.' },
  { id: 'chefbot', kind: 'bot', bot: 'chef', name: 'Chef robot', cost: 600, req: 'stove2', star: 3, at: [50.7, 41.7], desc: 'Automation: cooks open orders by itself (cooked quality) while stock lasts.' },
  { id: 'table6', kind: 'table', name: 'Table 6', cost: 260, req: 'table5', star: 3, at: [54.7, 37.5], desc: 'Two more seats.' },
  { id: 'waiterbot', kind: 'bot', bot: 'waiter', name: 'Waiter robot', cost: 700, req: 'table4', star: 3, at: [52.5, 36.0], desc: 'Automation: takes orders, carries finished plates, clears tables.' },
  { id: 'cashbot', kind: 'bot', bot: 'cash', name: 'Cashier robot', cost: 500, req: 'counter', star: 3, at: [53.4, 29.1], desc: 'Automation: takes every payment at full price.' },
  { id: 'decor2', kind: 'decor', name: 'Decor II: lanterns and banners', cost: 650, req: 'decor1', star: 3, at: [52.5, 39.2], pad: [52.5, 38.4], tier: 2, desc: 'Raises the star cap to 4.' },
  { id: 'booth', kind: 'table', vip: true, name: "Critic's booth", cost: 800, req: 'decor1', star: 3, at: [49.6, 29.6], desc: 'A reserved booth. The Algorithm sends a food critic when it exists.' },
  { id: 'stove3', kind: 'stove', name: 'Third stove', cost: 450, req: 'stove2', star: 4, at: [53.8, 43.3], desc: 'Three orders at once.' },
  { id: 'decor3', kind: 'decor', name: 'Decor III: skyline terrace', cost: 1800, req: 'decor2', star: 4, at: [52.5, 32.9], pad: [52.5, 31.2], tier: 3, desc: 'Raises the star cap to 5.' },
];
/** where the buy pad sits (the model origin unless a piece has its own pad spot) */
export const padOf = (p) => p.pad || p.at;
export const PIECE = Object.fromEntries(PIECES.map((p) => [p.id, p]));
export const PIECE_IDS = PIECES.map((p) => p.id);
export const TABLE_IDS = PIECES.filter((p) => p.kind === 'table').map((p) => p.id);
export const STOVE_IDS = PIECES.filter((p) => p.kind === 'stove').map((p) => p.id);

export const DECOR_CAP = [2, 3, 4, 5];                     // star cap with 0..3 decor tiers
export const STAR_REP = [0, 25, 80, 180, 350];             // reputation needed for star 1..5
export const MAX_STARS = 5;

// ---------------------------------------------------------------------------------------------- ingredients + dishes
/** the restaurant's own moon-only ingredients (registered as items by resto.js). cat = ingredient category used by dishes. */
export const NEW_ING = {
  rs_moonpetal: { name: 'Moonpetal', cat: 'moon', heal: 12, nutri: 10, props: { regen: 1 }, tip: 'A pale flower that only opens on moon soil. Alien diners cross a galaxy for it. Stock it in the restaurant fridge.', color: '#cfe8ff' },
  rs_ember_pepper: { name: 'Ember Pepper', cat: 'spice', heal: 6, nutri: 6, props: { fire: 1 }, tip: 'Grows in the hot ducts of facilities. Pure spice. Stock it in the restaurant fridge.', color: '#ff5a24' },
  rs_glow_spore: { name: 'Glow Spore Cap', cat: 'mushroom', heal: 11, nutri: 13, props: { night: 1 }, tip: 'A shining mushroom from the dark rooms. Stock it in the restaurant fridge.', color: '#5affe8' },
  rs_void_truffle: { name: 'Void Truffle', cat: 'rare', heal: 20, nutri: 22, props: { quiet: 1 }, tip: 'Rare. Forms where the Algorithm looks away. The critic wants it. Stock it in the restaurant fridge.', color: '#b58cff' },
};
/** extra categories a farmed plant also counts as (so a spice can be farmed too, just slower and weaker than the moon one) */
export const CAT_ALIAS = { sv_p_ashroot: ['spice'], sv_p_frostleaf: ['spice'] };
export const catsOf = (type, ing) => { const i = ing?.[type]; return i ? [i.cat, ...(CAT_ALIAS[type] || [])] : []; };

/** need = list of categories (each consumes one item of that category). tags drive species tastes. dur = station minigame seconds (3..6). */
export const DISHES = [
  { id: 'salad', name: 'Moon Salad', need: ['moon', 'leaf'], tags: ['raw', 'moon'], price: 26, star: 1, dur: 3.2, col: '#9fe870' },
  { id: 'stew', name: 'Crater Stew', need: ['meat', 'root'], tags: ['hearty'], price: 30, star: 1, dur: 5, col: '#c8703a' },
  { id: 'tart', name: 'Berry Tart', need: ['berry', 'fruit'], tags: ['sweet'], price: 24, star: 1, dur: 4, col: '#d0405e' },
  { id: 'grill', name: 'Hot Catch', need: ['fish', 'spice'], tags: ['spicy'], price: 38, star: 2, dur: 5, col: '#ff7a30' },
  { id: 'curry', name: 'Ember Curry', need: ['meat', 'spice', 'spice'], tags: ['spicy', 'hearty'], price: 46, star: 2, dur: 6, col: '#ff4a20' },
  { id: 'skewer', name: 'Glow Skewers', need: ['mushroom', 'mushroom', 'spice'], tags: ['spicy', 'moon'], price: 44, star: 3, dur: 4.5, col: '#5affe8' },
  { id: 'sorbet', name: 'Frost Sorbet', need: ['fruit', 'leaf'], tags: ['sweet', 'raw'], price: 34, star: 3, dur: 3.4, col: '#9ad8ff' },
  { id: 'pie', name: 'Sun Pie', need: ['fruit', 'berry', 'moss'], tags: ['sweet'], price: 50, star: 3, dur: 5.5, col: '#ffb02a' },
  { id: 'risotto', name: 'Void Truffle Risotto', need: ['rare', 'root', 'mushroom'], tags: ['rare', 'moon'], price: 92, star: 4, dur: 6, col: '#b58cff' },
  { id: 'banquet', name: 'Grand Banquet', need: ['meat', 'fish', 'rare', 'spice'], tags: ['rare', 'hearty', 'spicy'], price: 145, star: 5, dur: 6, col: '#ffd23f' },
];
export const DISH = Object.fromEntries(DISHES.map((d) => [d.id, d]));
export const dishItem = (id) => 'rs_d_' + id;
export const dishOfItem = (ty) => (/^rs_d_/.test(ty || '') && DISH[ty.slice(5)] ? ty.slice(5) : null);
export const QMUL = [0.4, 0.75, 1, 1.3];                     // burnt, raw, cooked, perfect (same 0..3 as survival QUAL)
export const QTIER = ['common', 'uncommon', 'rare', 'epic'];
export const MAX_PANTRY_TYPE = 30, MAX_PANTRY = 90;

export const menuFor = (stars, built) => DISHES.filter((d) => d.star <= stars).map((d) => d.id);

/** pick the items a dish would use from the pantry ({type: n}); null when short. cats resolved through ing (type -> {cat}). Most-stocked type first, single-category items first. */
export function planTake(pantry, dish, ing) {
  const left = { ...pantry }, out = [];
  const needs = [...dish.need].sort((a, b) => (a === 'rare' || a === 'moon' ? -1 : 0) - (b === 'rare' || b === 'moon' ? -1 : 0));
  for (const cat of needs) {
    let best = null;
    for (const [ty, n] of Object.entries(left)) {
      if (n < 1) continue;
      const cs = catsOf(ty, ing);
      if (!cs.includes(cat)) continue;
      const score = n * 10 - cs.length;
      if (!best || score > best.score) best = { ty, score };
    }
    if (!best) return null;
    left[best.ty] -= 1; out.push(best.ty);
  }
  return out;
}
export const canCook = (pantry, dishId, ing) => !!DISH[dishId] && !!planTake(pantry, DISH[dishId], ing);
export const cookable = (pantry, stars, ing) => menuFor(stars).filter((id) => canCook(pantry, id, ing));
export const pantryTotal = (p) => Object.values(p).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------------------------- species (taste rules)
/** likes(dish) decides what they order. pay: 'cr' credits, 'scrap' rare scrap items (+ a little credit), 'clout' credits + Clout tip. pat = seconds [queue, order, food]. */
export const SPECIES = {
  gorm: { id: 'gorm', name: 'Gorm Grazer', star: 1, w: 5, pat: [95, 50, 110], speed: 1.25, mul: 0.9, pay: 'cr', likes: () => true, taste: 'Eats anything hearty. Patient.', body: '#7a8f5a', accent: '#c8d27a', shape: 'blob' },
  blorp: { id: 'blorp', name: 'Blorp', star: 1, w: 4, pat: [70, 45, 90], speed: 1.4, mul: 1.15, pay: 'cr', likes: (d) => d.tags.includes('moon') || d.tags.includes('raw'), taste: 'Only raw or moon produce.', body: '#5ac8d8', accent: '#e8ffff', shape: 'jelly' },
  vrek: { id: 'vrek', name: 'Vrek Emberkin', star: 2, w: 4, pat: [60, 40, 75], speed: 1.7, mul: 1.3, pay: 'cr', likes: (d) => d.tags.includes('spicy'), taste: 'Wants it spicy. Short temper.', body: '#c8452a', accent: '#ffb02a', shape: 'lizard' },
  klink: { id: 'klink', name: 'Klink Scrapper', star: 2, w: 3, pat: [80, 50, 100], speed: 1.3, mul: 0.3, pay: 'scrap', likes: () => true, taste: 'Pays in rare scrap, not credits.', body: '#8a8f99', accent: '#ffd23f', shape: 'bot' },
  mimi: { id: 'mimi', name: 'Mimi Sweettooth', star: 2, w: 3, pat: [70, 45, 85], speed: 1.5, mul: 1.1, pay: 'clout', likes: (d) => d.tags.includes('sweet'), taste: 'Sweet things only. Tips in Clout.', body: '#ff9ad8', accent: '#ffffff', shape: 'jelly' },
  critic: { id: 'critic', name: 'Reviewer-9', star: 3, w: 0, pat: [120, 60, 130], speed: 1.2, mul: 1.6, pay: 'cr', likes: (d) => d.price >= 44, taste: 'The Algorithm food critic. Wants a perfect dish.', body: '#2a2a3a', accent: '#40e0ff', shape: 'critic' },
  inspector: { id: 'inspector', name: 'Health Inspector', star: 1, w: 0, pat: [999, 999, 999], speed: 1.1, mul: 0, pay: 'cr', likes: () => false, taste: 'Checks the kitchen. Do not be dirty.', body: '#d8d8c8', accent: '#ff4a4a', shape: 'inspector' },
};
export const SPECIES_IDS = Object.keys(SPECIES);
export const speciesIdx = (id) => SPECIES_IDS.indexOf(id);

/** a species only visits when the unlocked menu has a dish they accept (the Galactic Menu Board: nobody flies here to starve) */
export function speciesAvailable(sp, stars, built, menu) {
  const s = SPECIES[sp];
  if (!s || s.w <= 0) return false;
  if (s.star > stars) return false;
  return menu.some((id) => s.likes(DISH[id]));
}

// ---------------------------------------------------------------------------------------------- persistent state
export function blank() {
  return { v: VERSION, b: [], rep: 0, pantry: {}, till: 0, open: true, mk: { run: '', day: 0 }, gross: { day: -1, n: 0 }, ct: null, ctDone: 0, ctAt: -99, inspAt: 0, st: { served: 0, angry: 0, earned: 0, reviews: 0, raves: 0 } };
}
const num = (v, lo, hi, d = 0) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
export function sanitize(raw) {
  const s = blank();
  if (!raw || typeof raw !== 'object') return s;
  s.b = (Array.isArray(raw.b) ? raw.b : []).filter((id, i, a) => PIECE[id] && a.indexOf(id) === i);
  // keep the chain valid: a piece without its prerequisite is dropped
  for (let pass = 0; pass < 3; pass++) s.b = s.b.filter((id) => !PIECE[id].req || s.b.includes(PIECE[id].req));
  s.rep = num(raw.rep, 0, 99999); s.till = num(raw.till, 0, 99999); s.open = raw.open !== false;
  s.ctDone = num(raw.ctDone, 0, 9999) | 0; s.ctAt = num(raw.ctAt, -99, 99999) | 0; s.inspAt = num(raw.inspAt, 0, 99999) | 0;
  if (raw.pantry && typeof raw.pantry === 'object') for (const [k, v] of Object.entries(raw.pantry)) { const n = Math.floor(num(v, 0, MAX_PANTRY_TYPE)); if (n > 0 && /^[a-z0-9_]{2,40}$/.test(k)) s.pantry[k] = n; }
  if (raw.mk && typeof raw.mk === 'object') s.mk = { run: String(raw.mk.run || '').slice(0, 40), day: num(raw.mk.day, 0, 99999) | 0 };
  if (raw.gross && typeof raw.gross === 'object') s.gross = { day: num(raw.gross.day, -1, 99999) | 0, n: num(raw.gross.n, 0, 99999) };
  const c = raw.ct;
  if (c && typeof c === 'object') s.ct = { need: num(c.need, 1, 99) | 0, got: num(c.got, 0, 99) | 0, by: num(c.by, 0, 99999) | 0, reward: num(c.reward, 0, 9999) | 0, on: !!c.on };
  if (raw.st && typeof raw.st === 'object') for (const k of Object.keys(s.st)) s.st[k] = num(raw.st[k], 0, 1e9);
  return s;
}
export const has = (s, id) => s.b.includes(id);
export const count = (s, kind) => PIECES.filter((p) => p.kind === kind && s.b.includes(p.id)).length;
export const decorTier = (s) => PIECES.filter((p) => p.kind === 'decor' && s.b.includes(p.id)).length;
export const repStars = (rep) => { let n = 1; for (let i = 1; i < STAR_REP.length; i++) if (rep >= STAR_REP[i]) n = i + 1; return n; };
export const starCap = (s) => DECOR_CAP[Math.min(3, decorTier(s))];
export const starsOf = (s) => Math.min(repStars(s.rep), starCap(s));
export const nextStarRep = (s) => { const r = repStars(s.rep); return r >= MAX_STARS ? null : STAR_REP[r]; };
/** can the restaurant run? (floor + register + a stove + a table) */
export const canOpen = (s) => has(s, 'floor') && has(s, 'counter') && has(s, 'stove1') && has(s, 'table1');

/** buy a piece: {ok, why?, cost}. Mutates only on success. wallet = {cr}. */
export function tryBuy(s, wallet, id) {
  const p = PIECE[id];
  if (!p) return { ok: false, why: 'Unknown piece.' };
  if (has(s, id)) return { ok: false, why: 'Already built.' };
  if (p.req && !has(s, p.req)) return { ok: false, why: 'Build the previous piece first.' };
  if (starsOf(s) < p.star) return { ok: false, why: 'Needs more stars.' };
  if (wallet.cr < p.cost) return { ok: false, why: 'Not enough credits.' };
  wallet.cr -= p.cost; s.b.push(id);
  return { ok: true, cost: p.cost };
}
/** pieces that can be bought right now (pads shown on the floor) */
export const availablePieces = (s) => PIECES.filter((p) => !has(s, p.id) && (!p.req || has(s, p.req)) && starsOf(s) >= p.star);
/** pieces waiting on a star (shown as locked in the panel) */
export const lockedPieces = (s) => PIECES.filter((p) => !has(s, p.id) && (!p.req || has(s, p.req)) && starsOf(s) < p.star);

// ---------------------------------------------------------------------------------------------- economy
export const ECON = {
  passivePerStar: 9, passiveBase: 6, tillDays: 3,           // passive: 6 + 9 * stars per GAME day, till holds 3 days
  dayCapBase: 100, dayCapPerStar: 70, overCap: 0.25,          // active gross per game day before payments drop to 25 %
  repHappy: 1, repPerfect: 1, repAngry: -3, repRave: 10, repPan: -8, repInspectPass: 10, repInspectWarn: -2, repInspectFail: -8,
  contractBase: 400, contractPerStar: 220, contractDays: 7, contractGap: 7, contractClout: 10,
  inspectEvery: 6, cleanPass: 70, cleanFail: 40,
};
export const passivePerDay = (s) => (canOpen(s) ? ECON.passiveBase + ECON.passivePerStar * starsOf(s) : 0);
export const tillCap = (s) => passivePerDay(s) * ECON.tillDays;
export const dayCap = (s) => ECON.dayCapBase + ECON.dayCapPerStar * starsOf(s);
/** new game days since the last call (a new run / rewound counter resets the mark and never pays) */
export function daysSince(s, runId, day) {
  const mk = s.mk;
  if (mk.run !== runId || day < mk.day) { mk.run = runId; mk.day = day; return 0; }
  const n = day - mk.day; mk.day = day; return n;
}
/** passive income for n days into the till, capped. Returns the amount added. */
export function accrue(s, days) {
  if (days <= 0) return 0;
  const room = Math.max(0, tillCap(s) - s.till), add = Math.min(room, passivePerDay(s) * Math.min(days, 12));
  s.till += add; return add;
}
/** credits for one served dish (before the daily cap). q 0..3, pat 0..1 = patience left */
export function payOf(dishId, spId, q, pat, stars) {
  const d = DISH[dishId], sp = SPECIES[spId];
  if (!d || !sp) return 0;
  return Math.max(1, Math.round(d.price * sp.mul * QMUL[Math.max(0, Math.min(3, q | 0))] * (0.85 + 0.3 * Math.max(0, Math.min(1, pat))) * (1 + 0.03 * (stars - 1))));
}
/** apply the daily gross cap: returns the credits actually paid and updates s.gross */
export function capPay(s, day, amount) {
  if (s.gross.day !== day) s.gross = { day, n: 0 };
  const room = Math.max(0, dayCap(s) - s.gross.n), full = Math.min(amount, room), rest = amount - full;
  const paid = Math.round(full + rest * ECON.overCap);
  s.gross.n += amount; return paid;
}
export const scrapCount = (price, q) => 1 + (q >= 3 ? 1 : 0) + (price >= 40 ? 1 : 0);
export const SCRAP_POOL = ['comp_scrapmetal', 'comp_scrapmetal', 'comp_circuit', 'comp_fuse', 'comp_chem'];

/** rep + stat bookkeeping helper (returns the new star count) */
export function addRep(s, d) { s.rep = Math.max(0, s.rep + d); return starsOf(s); }

// contract: the weekly Algorithm Food Festival
export function offerContract(s, day, rnd = Math.random) {
  if (s.ct || starsOf(s) < 3 || day - s.ctAt < ECON.contractGap) return null;
  const st = starsOf(s);
  s.ct = { need: 8 + 2 * st + Math.floor(rnd() * 3), got: 0, by: day + ECON.contractDays, reward: ECON.contractBase + ECON.contractPerStar * st, on: false };
  return s.ct;
}
export function contractServe(s, q) { const c = s.ct; if (!c || !c.on || q < 2) return false; c.got += 1; return c.got >= c.need; }
export function contractExpired(s, day) { return !!s.ct && s.ct.on && day > s.ct.by; }

// ---------------------------------------------------------------------------------------------- seats
export function seatsOf(built) {
  const out = [];
  for (const id of TABLE_IDS) {
    if (!built.includes(id)) continue;
    const p = PIECE[id], [x, z] = p.at;
    out.push({ id: id + '.0', table: id, x: x - 0.95, z, yaw: Math.PI / 2, vip: !!p.vip });
    out.push({ id: id + '.1', table: id, x: x + 0.95, z, yaw: -Math.PI / 2, vip: !!p.vip });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- the customer simulation (host)
export const ST = ['in', 'q', 'go', 'ord', 'wait', 'eat', 'pay', 'out', 'insp'];
export const EAT_SEC = 7, PAY_AUTO = 9, PAY_AUTO_MUL = 0.85, COOK_TIMEOUT = 40, SHUTTLE_LAND = 4, SHUTTLE_LEAVE = 3, DOCK_MIN = 18;

export function newSim() {
  return { t: 0, cust: [], nextId: 1, arriveT: 10, shuttle: { st: 'away', t: 0 }, dirty: {}, pests: [], pestT: 0, pestId: 1, criticT: 60, inspDue: false, cooks: {}, botT: { chef: 0, waiter: 0 } };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function step(c, dt) {
  // walk along c.path at c.speed; returns true when the path is finished
  while (c.path.length) {
    const p = c.path[0], dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.speed * dt;
    if (d <= m) { c.x = p.x; c.z = p.z; c.path.shift(); dt -= d / c.speed; if (dt <= 0) return !c.path.length; continue; }
    c.x += dx / d * m; c.z += dz / d * m; c.yaw = Math.atan2(dx, dz); return false;
  }
  return true;
}
export const dirtyTables = (sim) => new Set(Object.keys(sim.dirty).map((k) => k.split('.')[0]));
export const cleanOf = (sim) => Math.max(0, Math.min(100, 100 - 12 * dirtyTables(sim).size - 15 * sim.pests.length));
export const tickets = (sim) => sim.cust.filter((c) => c.st === 'wait');
export const arrivalEvery = (s) => Math.max(22, 62 - 6 * starsOf(s) - (has(s, 'sign') ? 8 : 0) - Math.min(10, count(s, 'table')));

function makeCustomer(sim, spId, at) {
  const sp = SPECIES[spId];
  return { id: sim.nextId++, sp: spId, x: at.x, z: at.z, yaw: Math.PI, speed: sp.speed, path: [], st: 'in', t: 0, pat: 1, seat: null, dish: null, stage: null, q: 2, plate: 0, cookBy: 0, cookT: 0, paidT: 0, sitY: 0 };
}
const patSec = (c, which) => SPECIES[c.sp].pat[which];

/**
 * advance the simulation. env = { s: persistent state, rnd, open, menu: dish ids cookable now, ing, autoOrder, autoPay, cashbot }
 * returns events: {k:'land'|'depart'|'arrive', ...} {k:'angry', c} {k:'nofood', c} {k:'ordered', c} {k:'ate', c} {k:'pay', c, auto} {k:'inspect', c, clean} {k:'pest', p} {k:'pestEat', p}
 */
export function tick(sim, dt, env) {
  const ev = [], s = env.s, rnd = env.rnd || Math.random;
  sim.t += dt;
  const seats = seatsOf(s.b), stars = starsOf(s), clean = cleanOf(sim);
  const sh = sim.shuttle;
  const seatTaken = (id) => sim.cust.some((c) => c.seat === id) || !!sim.dirty[id];
  const freeSeats = seats.filter((x) => !seatTaken(x.id));

  // ---- shuttle + arrivals
  const active = env.open && canOpen(s) && env.menu.length > 0;
  if (sh.st === 'away') {
    if (active && freeSeats.length > 0 && sim.cust.length < seats.length + 3) sim.arriveT -= dt;
    if (sim.arriveT <= 0 && active && freeSeats.length > 0) { sh.st = 'land'; sh.t = 0; ev.push({ k: 'land' }); }
  } else if (sh.st === 'land') {
    sh.t += dt;
    if (sh.t >= SHUTTLE_LAND) {
      sh.st = 'dock'; sh.t = 0;
      const group = [];
      const want = Math.max(1, Math.min(4, 1 + Math.floor(rnd() * (stars >= 3 ? 4 : stars >= 2 ? 3 : 2)), freeSeats.length));
      // special visitors first
      if (sim.inspDue && env.day - s.inspAt >= ECON.inspectEvery) { group.push('inspector'); sim.inspDue = false; }
      else if (has(s, 'booth') && stars >= 3 && sim.t >= sim.criticT && !sim.cust.some((c) => c.sp === 'critic') && freeSeats.some((x) => x.vip)) { group.push('critic'); sim.criticT = sim.t + 240; }
      const pool = SPECIES_IDS.filter((id) => speciesAvailable(id, stars, s.b, env.menu));
      while (group.length < want && pool.length) {
        let tot = 0; for (const id of pool) tot += SPECIES[id].w;
        let r = rnd() * tot, pick = pool[0];
        for (const id of pool) { r -= SPECIES[id].w; if (r <= 0) { pick = id; break; } }
        group.push(pick);
      }
      const ids = [];
      group.forEach((spId, i) => {
        const c = makeCustomer(sim, spId, { x: SHUTTLE.x + (i - 1) * 0.9, z: SHUTTLE.z + 1.4 });
        if (spId === 'inspector') { c.st = 'insp'; c.path = [{ x: AISLE_X, z: 25.6 }, { x: DOOR.x, z: DOOR.z + 0.6 }, { x: INSPECT_SPOT.x, z: INSPECT_SPOT.z }]; c.t = 0; c.inspStage = 0; }
        else c.path = [{ x: AISLE_X, z: 25.6 }, { x: DOOR.x, z: DOOR.z + 0.5 }];
        sim.cust.push(c); ids.push(c.id);
      });
      ev.push({ k: 'arrive', ids });
    }
  } else if (sh.st === 'dock') {
    sh.t += dt;
    if (sh.t >= DOCK_MIN && !sim.cust.some((c) => c.st === 'in')) { sh.st = 'leave'; sh.t = 0; ev.push({ k: 'depart' }); }
  } else if (sh.st === 'leave') {
    sh.t += dt;
    if (sh.t >= SHUTTLE_LEAVE) { sh.st = 'away'; sh.t = 0; sim.arriveT = arrivalEvery(s) * (0.85 + rnd() * 0.3); }
  }

  // ---- customers
  const qOrder = sim.cust.filter((c) => c.st === 'q').sort((a, b) => a.id - b.id);
  const dirtMul = clean < 50 ? 1.35 : 1;
  for (const c of sim.cust) {
    c.t += dt;
    const done = step(c, dt);
    if (c.st === 'in') {
      if (done) { c.st = 'q'; c.t = 0; }
    } else if (c.st === 'q') {
      c.pat -= dt / patSec(c, 0) * dirtMul;
      const i = qOrder.indexOf(c), slot = queueSlot(i);
      // first come, first served among the seats this species may use (the critic only sits in the booth, everyone else avoids it)
      const seat = freeSeats.find((x) => (c.sp === 'critic' ? x.vip : !x.vip));
      if (seat) {
        c.seat = seat.id; c.st = 'go'; c.t = 0; c.path = [{ x: AISLE_X, z: seat.z }, { x: seat.x, z: seat.z }]; c.seatYaw = seat.yaw;
        freeSeats.splice(freeSeats.indexOf(seat), 1);
        continue;
      }
      if (!c.path.length && dist(c, slot) > 0.05) c.path = [slot];
      if (c.pat <= 0) { c.st = 'out'; c.t = 0; c.path = [{ x: AISLE_X, z: DOOR.z + 0.3 }, { x: SHUTTLE.x, z: SHUTTLE.z + 1.4 }]; ev.push({ k: 'angry', c, why: 'queue' }); }
    } else if (c.st === 'go') {
      if (done) {
        c.st = 'ord'; c.t = 0; c.pat = 1; c.sitY = -0.32; c.yaw = c.seatYaw || 0;
        const opts = env.menu.filter((id) => SPECIES[c.sp].likes(DISH[id]) && (c.sp !== 'critic' || DISH[id].star >= 3 || DISH[id].price >= 44));
        if (!opts.length) { c.st = 'out'; c.t = 0; c.sitY = 0; c.seat = null; c.path = [{ x: AISLE_X, z: c.z }, { x: AISLE_X, z: DOOR.z + 0.3 }, { x: SHUTTLE.x, z: SHUTTLE.z + 1.4 }]; ev.push({ k: 'nofood', c }); }
        else { opts.sort((a, b) => DISH[b].price - DISH[a].price); c.dish = c.sp === 'critic' ? opts[0] : opts[Math.floor(rnd() * opts.length)]; }
      }
    } else if (c.st === 'ord') {
      c.pat -= dt / patSec(c, 1) * dirtMul;
      if (env.autoOrder && c.t >= 3) { c.st = 'wait'; c.stage = 'open'; c.t = 0; c.pat = 1; ev.push({ k: 'ordered', c, bot: true }); }
      else if (c.pat <= 0) { c.pat = 0; c.sitY = 0; c.st = 'out'; c.path = [{ x: AISLE_X, z: c.z }, { x: AISLE_X, z: DOOR.z + 0.3 }, { x: SHUTTLE.x, z: SHUTTLE.z + 1.4 }]; c.seat = null; ev.push({ k: 'angry', c, why: 'order' }); }
    } else if (c.st === 'wait') {
      c.pat -= dt / patSec(c, 2) * dirtMul * (c.stage === 'cooking' ? 0.6 : 1);
      if (c.stage === 'cooking' && sim.t - c.cookT > COOK_TIMEOUT) { c.stage = 'open'; delete sim.cooks[c.cookStove]; ev.push({ k: 'cookLost', c }); }
      if (c.pat <= 0) { c.pat = 0; c.sitY = 0; c.st = 'out'; c.stage = null; c.path = [{ x: AISLE_X, z: c.z }, { x: AISLE_X, z: DOOR.z + 0.3 }, { x: SHUTTLE.x, z: SHUTTLE.z + 1.4 }]; if (c.cookStove) delete sim.cooks[c.cookStove]; c.seat = null; ev.push({ k: 'angry', c, why: 'food' }); }
    } else if (c.st === 'eat') {
      if (c.t >= EAT_SEC) {
        sim.dirty[c.seat] = true; c.sitY = 0; c.st = 'pay'; c.t = 0; c.seat = null;
        c.path = [{ x: AISLE_X, z: c.z }, { x: PAY_SPOT.x - 2.8, z: PAY_SPOT.z }, { x: PAY_SPOT.x - 0.75 * (c.id % 3), z: PAY_SPOT.z }];
        ev.push({ k: 'ate', c });
      }
    } else if (c.st === 'pay') {
      if (done) {
        c.paidT += dt;
        const auto = env.cashbot ? 1.5 : PAY_AUTO;
        if (c.paidT >= auto) { ev.push({ k: 'pay', c, auto: true, full: !!env.cashbot }); c.st = 'out'; c.t = 0; c.path = [{ x: AISLE_X, z: DOOR.z + 0.3 }, { x: SHUTTLE.x, z: SHUTTLE.z + 1.4 }]; }
      }
    } else if (c.st === 'insp') {
      if (done) {
        c.inspStage = (c.inspStage || 0);
        if (c.t > 9 && !c.judged) { c.judged = true; ev.push({ k: 'inspect', c, clean }); c.st = 'out'; c.t = 0; c.path = [{ x: AISLE_X, z: DOOR.z + 0.3 }, { x: SHUTTLE.x, z: SHUTTLE.z + 1.4 }]; }
      } else c.t = 0;
    } else if (c.st === 'out') {
      if (done) { c.gone = true; }
    }
  }
  sim.cust = sim.cust.filter((c) => !c.gone);

  // ---- dirt + pests
  const dt2 = dirtyTables(sim).size;
  if (dt2 >= 2) sim.pestT += dt; else sim.pestT = Math.max(0, sim.pestT - dt);
  if (sim.pestT >= 30 && sim.pests.length < 3) {
    sim.pestT = 12;
    const p = { id: sim.pestId++, x: 49 + rnd() * 7, z: 41 + rnd() * 3.4, tx: 0, tz: 0, eat: 18 };
    p.tx = p.x; p.tz = p.z; sim.pests.push(p); ev.push({ k: 'pest', p });
  }
  for (const p of sim.pests) {
    if (dist(p, { x: p.tx, z: p.tz }) < 0.1) { p.tx = 48.9 + rnd() * 7.4; p.tz = 40.8 + rnd() * 3.6; }
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz) || 1, m = Math.min(d, 1.6 * dt); p.x += dx / d * m; p.z += dz / d * m; p.yaw = Math.atan2(dx, dz);
    p.eat -= dt; if (p.eat <= 0) { p.eat = 18; ev.push({ k: 'pestEat', p }); }
  }
  return ev;
}

// ---- host actions on the sim (all return {ok, why?} and are validated by the caller for distance / holder)
export function takeOrder(sim, cid) {
  const c = sim.cust.find((x) => x.id === cid);
  if (!c || c.st !== 'ord' || !c.dish) return { ok: false, why: 'Nobody is waiting to order.' };
  c.st = 'wait'; c.stage = 'open'; c.t = 0; c.pat = 1; return { ok: true, c };
}
export function serve(sim, cid, dishId, q) {
  const c = sim.cust.find((x) => x.id === cid);
  if (!c || c.st !== 'wait') return { ok: false, why: 'Nobody is waiting for that.' };
  if (c.dish !== dishId) return { ok: false, why: 'That is not what they ordered.', c, wrong: true };
  if (c.cookStove) delete sim.cooks[c.cookStove];
  c.st = 'eat'; c.t = 0; c.q = Math.max(0, Math.min(3, q | 0)); c.stage = null; c.servedPat = c.pat; return { ok: true, c };
}
export function clearTable(sim, tableId) {
  let n = 0;
  for (const k of Object.keys(sim.dirty)) if (k.startsWith(tableId + '.')) { delete sim.dirty[k]; n++; }
  return n;
}
export function swat(sim, pid) { const i = sim.pests.findIndex((p) => p.id === pid); if (i < 0) return false; sim.pests.splice(i, 1); return true; }
/** pay a customer waiting at the register */
export function collectPay(sim, cid) {
  const c = sim.cust.find((x) => x.id === cid);
  if (!c || c.st !== 'pay') return { ok: false, why: 'Nobody is waiting to pay.' };
  c.st = 'out'; c.t = 0; c.path = [{ x: AISLE_X, z: DOOR.z + 0.3 }, { x: SHUTTLE.x, z: SHUTTLE.z + 1.4 }]; return { ok: true, c };
}
/** oldest order that still needs cooking */
export const nextTicket = (sim) => sim.cust.filter((c) => c.st === 'wait' && c.stage === 'open').sort((a, b) => a.id - b.id)[0] || null;
export function startCook(sim, cid, stoveId, by) {
  const c = sim.cust.find((x) => x.id === cid);
  if (!c || c.st !== 'wait' || c.stage !== 'open') return { ok: false, why: 'That order is already being cooked.' };
  if (sim.cooks[stoveId]) return { ok: false, why: 'The stove is busy.' };
  c.stage = 'cooking'; c.cookBy = by; c.cookT = sim.t; c.cookStove = stoveId; sim.cooks[stoveId] = cid; return { ok: true, c };
}
export function finishCook(sim, cid, plateId) {
  const c = sim.cust.find((x) => x.id === cid);
  if (!c || c.st !== 'wait' || c.stage !== 'cooking') return { ok: false, why: 'That order is gone.' };
  delete sim.cooks[c.cookStove]; c.stage = 'ready'; c.plate = plateId; c.cookStove = null; return { ok: true, c };
}
export function cancelCook(sim, cid) {
  const c = sim.cust.find((x) => x.id === cid);
  if (!c || c.stage !== 'cooking') return false;
  delete sim.cooks[c.cookStove]; c.stage = 'open'; c.cookStove = null; return true;
}

// ---------------------------------------------------------------------------------------------- snapshot (host -> everyone, compact) + minigame grading
export function snapshot(sim, s) {
  return {
    sh: [ST_SH.indexOf(sim.shuttle.st), Math.round(sim.shuttle.t * 10) / 10],
    c: sim.cust.map((c) => [c.id, speciesIdx(c.sp), Math.round(c.x * 100), Math.round(c.z * 100), Math.round((c.yaw || 0) * 100), ST.indexOf(c.st), Math.round(c.pat * 100), c.dish ? DISHES.findIndex((d) => d.id === c.dish) : -1, c.q, c.seat || '', c.stage ? ['open', 'cooking', 'ready'].indexOf(c.stage) : -1, Math.round((c.sitY || 0) * 100)]),
    p: sim.pests.map((p) => [p.id, Math.round(p.x * 100), Math.round(p.z * 100), Math.round((p.yaw || 0) * 100)]),
    d: [...dirtyTables(sim)], cl: cleanOf(sim), ck: Object.keys(sim.cooks),
  };
}
export const ST_SH = ['away', 'land', 'dock', 'leave'];
export function unpackCustomer(a) {
  return { id: a[0], sp: SPECIES_IDS[a[1]], x: a[2] / 100, z: a[3] / 100, yaw: a[4] / 100, st: ST[a[5]], pat: a[6] / 100, dish: a[7] >= 0 ? DISHES[a[7]].id : null, q: a[8], seat: a[9] || null, stage: ['open', 'cooking', 'ready'][a[10]] || null, sitY: a[11] / 100 };
}
/** minigame stop position p (0..1.3, the needle keeps going past 1 = burnt) -> quality 0..3 (same zones as the survival cooking meter) */
export function gradeCook(p) { return !(p >= 0) ? 1 : p < 0.5 ? 1 : p < 0.72 ? 2 : p < 0.86 ? 3 : 0; }
/** host clamps a client's claimed quality: the needle cannot be ahead of the host clock */
export function clampQuality(claimed, elapsed, dur) {
  const q = Math.max(0, Math.min(3, claimed | 0));
  if (q === 0) return 0;
  const maxP = elapsed / dur + 0.15;
  return Math.min(q, maxP < 0.5 ? 1 : maxP < 0.72 ? 2 : 3);
}
