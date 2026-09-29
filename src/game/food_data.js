// FOOD & DRINKS data + pure rules (module `food`, docs/wave2/food.md). No THREE / DOM / game access: node-testable
// (tools/harness/food.test.mjs). src/game/food.js installs it, src/models/food.js draws the items.
//
// Design: no hunger meter. Every consumable is optional, gives a temporary buff (through the anomaly buff registry / left buff bar,
// there is no second buff system) plus social fun: cheers, sharing a cake, eating at the ship table, drunk stacking with slurred chat.
import { RNG } from '../core/rng.js';
import { TABLE_SPOTS as SHIP_TABLE_SPOTS } from '../world/shiplayout.js';

export const FOOD_SHOP = 'food';

// ------------------------------------------------------------------------------------------------ items
// kind: food | drink | booze.  use = seconds of the eat / drink animation.  buffs = [[buffId, seconds]].  hp / stam = instant.
// special: cake (shared with everyone near) | meat (random good / bad) | glitch (random short anomaly mutation) | booze (stacks, see DRUNK).
// loot = weight in the scrap table of that interior theme (found lying around); price = company store (food tab), 0 = not sold.
export const FOODS = {
  fd_noodles: { kind: 'food', name: 'Instant Noodles', hunger: 12, tier: 'common', price: 12, weight: 1, value: [4, 9], use: 1.8, buffs: [['f_noodles', 30]],
    loot: { office: 6, backrooms: 4, hospital: 3, factory: 3, mansion: 2, sewer: 2, serverfarm: 3 },
    tip: 'LMB: slurp. Regenerates 0.5 HP per second for 30 s.' },
  fd_ramen: { kind: 'food', name: 'Deluxe Ramen Bowl', hunger: 12, tier: 'uncommon', price: 38, weight: 2, value: [10, 18], use: 2.3, buffs: [['f_ramen', 25]],
    loot: { office: 2, hospital: 2, mansion: 2, backrooms: 1 },
    tip: 'LMB: eat. Regenerates 0.8 HP per second for 25 s and speeds up your stamina.' },
  fd_pizza: { kind: 'food', name: 'Pizza Slice', hunger: 12, tier: 'common', price: 18, weight: 1, value: [5, 11], use: 1.6, hp: 12, buffs: [['f_full', 90]],
    loot: { office: 5, factory: 4, mansion: 3, backrooms: 3, hospital: 2, serverfarm: 3 },
    tip: 'LMB: eat. Heals 12 HP and fills you up (+8 max HP for 90 s). Pineapple not included.' },
  fd_pizzabox: { kind: 'food', name: 'Pizza Box', hunger: 24, tier: 'rare', price: 55, weight: 2, value: [14, 24], use: 2.6, hp: 24, buffs: [['f_full', 150]],
    loot: { office: 2, mansion: 1, factory: 1 },
    tip: 'LMB: eat the whole thing. Heals 24 HP and +8 max HP for 150 s. Someone will ask for a slice.' },
  fd_bar: { kind: 'food', name: 'Energy Bar', hunger: 12, tier: 'common', price: 10, weight: 0.5, value: [3, 7], use: 1.2, stam: 45, buffs: [['f_sugar', 45]],
    loot: { office: 5, factory: 4, mineshaft: 4, backrooms: 3, sewer: 2, hospital: 2, serverfarm: 3 },
    tip: 'LMB: crunch. Refills 45 stamina and +40% stamina regeneration for 45 s.' },
  fd_cake: { kind: 'food', name: 'Party Cake', hunger: 12, tier: 'epic', price: 0, weight: 3, value: [20, 35], use: 2.4, hp: 15, special: 'cake', buffs: [],
    loot: { mansion: 1 },
    tip: 'LMB: cut the cake. Everyone within 8 m gets Cake Day (speed, damage reduction, regen), longer with more guests. Found in party rooms and fridges.' },
  fd_meat: { kind: 'food', name: 'Mystery Meat', hunger: 12, tier: 'common', price: 0, weight: 1.5, value: [3, 7], use: 2.0, special: 'meat', buffs: [],
    tip: 'LMB: eat. Dropped by creatures. It is either great or terrible. Nobody knows what animal it was.' },
  fd_mega: { kind: 'drink', name: 'Mega Engagement', hunger: 3, tier: 'uncommon', price: 22, weight: 0.5, value: [5, 10], use: 1.3, fizzy: true, buffs: [['f_mega', 60]],
    loot: { office: 3, factory: 2, serverfarm: 3, backrooms: 2 },
    tip: 'LMB: chug. +30% speed and +50% stamina regen for 60 s. Then comes The Crash. Engagement is a loan.' },
  fd_coffee: { kind: 'drink', name: 'Doomscroll Coffee', hunger: 3, tier: 'common', price: 16, weight: 0.5, value: [4, 9], use: 1.4, buffs: [['f_coffee', 90]],
    loot: { office: 5, hospital: 3, backrooms: 3, serverfarm: 3, mansion: 2 },
    tip: 'LMB: sip. For 90 s you notice creatures farther away (a quiet ping every 7 s) and scan +40%.' },
  fd_glitch: { kind: 'drink', name: 'Glitch Cola', hunger: 3, tier: 'uncommon', price: 18, weight: 0.5, value: [5, 10], use: 1.3, fizzy: true, special: 'glitch', buffs: [],
    loot: { serverfarm: 4, office: 2, backrooms: 3 },
    tip: 'LMB: chug. Rolls a random 25 s anomaly mutation, good or bad. The can is always slightly warped.' },
  fd_cringe: { kind: 'drink', name: 'Cringe Juice', hunger: 3, tier: 'common', price: 14, weight: 0.5, value: [4, 8], use: 1.4, buffs: [['f_cringe', 90]],
    loot: { office: 3, backrooms: 4, hospital: 2, sewer: 2 },
    tip: 'LMB: drink. Your footsteps squeak (everyone hears it) but you take 6% less damage for 90 s.' },
  fd_lager: { kind: 'booze', name: 'Server Rack Lager', hunger: 3, tier: 'common', price: 20, weight: 1, value: [5, 10], use: 1.6, fizzy: true, booze: { pw: 1, sec: 120 },
    loot: { serverfarm: 4, factory: 3, sewer: 3, office: 2, mineshaft: 3 },
    tip: 'LMB: drink. Courage: less STATIC, a little damage reduction. But each drink stacks: swaying, slurred chat, hiccups. Lasts 2 min.' },
  fd_raki: { kind: 'booze', name: '404 Raki', hunger: 3, tier: 'uncommon', price: 34, weight: 1, value: [8, 15], use: 1.8, booze: { pw: 1.25, sec: 150 },
    loot: { mansion: 3, hospital: 2, backrooms: 2, sewer: 2 },
    tip: 'LMB: drink. Anise, water, regret. Stronger than the lager. Lasts 2.5 min. Drinks stack.' },
  fd_vodka: { kind: 'booze', name: 'Firewall Vodka', hunger: 3, tier: 'rare', price: 48, weight: 1, value: [12, 22], use: 1.9, booze: { pw: 1.5, sec: 180 },
    loot: { serverfarm: 2, mansion: 2, factory: 1 },
    tip: 'LMB: drink. Blocks all incoming feelings. The strongest one. Lasts 3 min. Drinks stack; 3 or more and you may pass out.' },
};
export const FOOD_IDS = Object.keys(FOODS);
export const isFoodType = (ty) => !!FOODS[ty];
export const isDrinkType = (ty) => FOODS[ty]?.kind === 'drink' || FOODS[ty]?.kind === 'booze';

// ------------------------------------------------------------------------------------------------ buffs (registered into the anomaly buff registry)
// Numeric fields are applied by applyBuffStats (all buffs) and by the per-frame code in food.js (hps, ping, squeak, gas, sick, courage).
export const BUFFS = {
  f_noodles: { good: true, glyph: 'RMN', color: '#ffb04a', name: 'Warm Noodles', desc: 'Regenerates 0.5 HP per second.', hps: 0.5 },
  f_ramen: { good: true, glyph: 'RAM', color: '#ff9a3a', name: 'Ramen Bliss', desc: 'Regenerates 0.8 HP per second. Stamina +15%.', hps: 0.8, stamRegen: 1.15 },
  f_full: { good: true, glyph: 'FUL', color: '#ffd35a', name: 'Full Belly', desc: '+8 max HP.', maxHp: 8 },
  f_sugar: { good: true, glyph: 'SGR', color: '#ff7ad0', name: 'Sugar Rush', desc: 'Stamina regenerates 40% faster.', stamRegen: 1.4 },
  f_cake: { good: true, glyph: 'CKE', color: '#ff8ae0', name: 'Cake Day', desc: '+8% speed, 5% damage reduction, regenerates 0.2 HP per second.', speed: 0.08, armor: 0.05, hps: 0.2 },
  f_meat_rage: { good: true, glyph: 'RGE', color: '#ff5a4a', name: 'Meat Sweats', desc: '+20% damage. Regenerates 0.3 HP per second. You smell of victory.', melee: 1.2, hps: 0.3 },
  f_meat_vigor: { good: true, glyph: 'VGR', color: '#7dff7d', name: 'Mystery Vigor', desc: '+12% speed and +12 max HP. Do not ask.', speed: 0.12, maxHp: 12 },
  f_meat_sick: { good: false, glyph: 'SIK', color: '#9acb4a', name: 'Food Poisoning', desc: '-12% speed and a queasy sway. Not lethal, just rude.', speed: -0.12, sick: 0.9 },
  f_meat_gas: { good: false, glyph: 'GAS', color: '#c8b04a', name: 'Gassy', desc: 'You burp loudly every few seconds. Creatures hear it.', gas: 1 },
  f_mega: { good: true, glyph: 'MEG', color: '#5affc8', name: 'Mega Engagement', desc: '+30% speed, stamina regenerates 50% faster. Then: The Crash.', speed: 0.3, stamRegen: 1.5 },
  f_crash: { good: false, glyph: 'CRS', color: '#ff6b6b', name: 'The Crash', desc: '-20% speed, stamina regenerates 40% slower.', speed: -0.2, stamRegen: 0.6 },
  f_coffee: { good: true, glyph: 'CFE', color: '#c89060', name: 'Doomscroll Alert', desc: 'Scan range +40%. A quiet ping shows creatures within 32 m every 7 s.', scan: 1.4, stamRegen: 1.1, ping: 32 },
  f_cringe: { good: true, glyph: 'CRG', color: '#ffe066', name: 'Cringe Aura', desc: '6% damage reduction. Your footsteps squeak.', armor: 0.06, squeak: 1 },
  f_cheers: { good: true, glyph: 'CHR', color: '#ffd35a', name: 'Liquid Courage', desc: '+10% damage, 5% damage reduction, less STATIC gain.', melee: 1.1, armor: 0.05, courage: 0.3 },
  f_wellfed: { good: true, glyph: 'WEL', color: '#8affb0', name: 'Well Fed', desc: '+10 max HP, +3% speed, stamina +15%. The crew ate together.', maxHp: 10, speed: 0.03, stamRegen: 1.15 },
  // drunk bands (one is active at a time; the number of live drinks + their strength picks it, see drunkBand)
  f_drunk1: { good: true, glyph: 'TIP', color: '#ffd27a', name: 'Tipsy', desc: 'Courage: less STATIC gain, 3% damage reduction. A light sway.', drunk: 1 },
  f_drunk2: { good: true, glyph: 'DRK', color: '#ffb04a', name: 'Drunk', desc: 'Courage, but the room sways, your aim drifts and your chat slurs.', drunk: 2 },
  f_drunk3: { good: false, glyph: 'HAM', color: '#ff8a5a', name: 'Hammered', desc: 'Hiccups, heavy sway, delayed turning. You may pass out (not lethal).', drunk: 3 },
  f_drunk4: { good: false, glyph: 'LEG', color: '#ff5a5a', name: 'Legless', desc: 'Everything is fine. Everything is spinning. Passing out is likely.', drunk: 4 },
};
export const DRUNK_IDS = ['f_drunk1', 'f_drunk2', 'f_drunk3', 'f_drunk4'];

/** Apply the plain numeric stat fields of a buff def to a stats object (game.stats shape). */
export function applyBuffStats(d, s) {
  if (!d || !s) return s;
  if (d.speed) s.speedMul += d.speed;
  if (d.stamRegen) s.staminaRegen *= d.stamRegen;
  if (d.armor) s.armor = (s.armor || 0) + d.armor;
  if (d.maxHp) s.maxHp += d.maxHp;
  if (d.melee) { s.meleeMul *= d.melee; if (s.rangedMul) s.rangedMul *= d.melee; }
  if (d.scan) s.scanRange = Math.round(s.scanRange * d.scan);
  return s;
}

// ------------------------------------------------------------------------------------------------ special outcomes
/** Mystery Meat: weighted good / bad outcome. rnd = () => [0,1). */
export const MEAT = [
  { id: 'f_meat_rage', w: 3, sec: 60 }, { id: 'f_meat_vigor', w: 3, sec: 75 },
  { id: 'f_meat_sick', w: 3, sec: 45 }, { id: 'f_meat_gas', w: 2, sec: 40 },
];
export function rollMeat(rnd) {
  let tot = 0; for (const m of MEAT) tot += m.w;
  let r = rnd() * tot;
  for (const m of MEAT) { r -= m.w; if (r <= 0) return m; }
  return MEAT[0];
}
/** Party Cake buff length: 60 s alone, +30 s per extra guest, capped at 150 s. */
export const cakeDuration = (n) => Math.min(150, 60 + 30 * Math.max(0, (n | 0) - 1));
export const CAKE_RADIUS = 8;

// ------------------------------------------------------------------------------------------------ drunk stacking
export const DRUNK = { maxStacks: 8, blackoutEvery: 12, blackoutDur: 2.6, blackoutCooldown: 45, hiccupMin: 3.5 };

/** Live drink stacks: [{ pw, until }] -> only those still running at `now`. */
export const liveStacks = (stacks, now) => stacks.filter((s) => s.until > now);
/** Add a drink (strength pw, lasting sec seconds). At most DRUNK.maxStacks; the one ending soonest is dropped first. */
export function addStack(stacks, pw, sec, now) {
  const out = liveStacks(stacks, now);
  out.push({ pw, until: now + sec });
  if (out.length > DRUNK.maxStacks) { out.sort((a, b) => a.until - b.until); out.shift(); }
  return out;
}
/** Total drunkenness (sum of the strengths of live drinks). */
export const drunkLevel = (live) => live.reduce((a, s) => a + s.pw, 0);
/** 0 sober, 1 Tipsy, 2 Drunk, 3 Hammered (3+ drinks), 4 Legless (4+ drinks). */
export function drunkBand(level, count) {
  if (count <= 0 || level <= 0.01) return 0;
  if (count >= 4) return 4;
  if (count >= 3) return 3;
  return level >= 2 ? 2 : 1;
}
/** All numbers the drunk effects run on. Zero everything when sober. */
export function drunkEffects(level, count) {
  const L = Math.max(0, level), C = Math.max(0, count | 0);
  if (L <= 0.01 || C <= 0) return { level: 0, count: 0, roll: 0, weave: 0, freq: 0.6, drift: 0, lagRate: 999, slur: 0, courage: 0, armor: 0, speed: 0, hiccupEvery: 0, blackout: 0, blur: 0 };
  return {
    level: L, count: C,
    roll: Math.min(0.11, 0.014 + 0.017 * L),            // camera roll amplitude (rad)
    weave: Math.min(0.12, 0.02 * L),                     // sideways camera weave (m)
    freq: 0.55 + 0.1 * L,                                // sway speed (Hz-ish)
    drift: Math.min(0.09, 0.012 * L),                    // aim drift (rad/s)
    lagRate: Math.max(5, 26 - 4.2 * L),                  // look smoothing (1/s): lower = more delayed turning
    slur: Math.min(0.6, 0.1 * L),                        // chance factor per letter for slurred chat
    courage: Math.min(0.55, 0.05 + 0.15 * C),            // share of STATIC gain refunded
    armor: Math.min(0.09, 0.03 * C),                     // damage reduction
    speed: -Math.min(0.12, 0.02 * L),
    hiccupEvery: C >= 3 ? Math.max(DRUNK.hiccupMin, 11 - 2.2 * (C - 3)) : 0,
    blackout: C >= 3 ? Math.min(0.4, 0.07 + 0.07 * (C - 3)) : 0,   // chance per DRUNK.blackoutEvery seconds
    blur: Math.min(2.2, 0.35 * L),                       // px of screen blur
  };
}

/** Slur a chat line: drawn-out vowels, sh-sounds, swapped letters and (at 3+ drinks) a *hic*. rnd = () => [0,1). Commands ("/") are never touched. */
export function slurText(text, level, rnd = Math.random, count = 0) {
  text = String(text ?? '');
  const fx = drunkEffects(level, Math.max(count, level > 0 ? 1 : 0));
  const p = fx.slur;
  if (p <= 0 || text.startsWith('/')) return text;
  const chars = [...text];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i], low = c.toLowerCase();
    const alpha = low !== c.toUpperCase();
    if (!alpha) { out += c; continue; }
    if ('aeiou'.includes(low) && rnd() < p * 0.5) { out += c + c; continue; }
    if (low === 's' && rnd() < p * 0.6) { out += c + (c === 'S' ? 'H' : 'h'); continue; }
    const n = chars[i + 1];
    if (n && n.toLowerCase() !== n.toUpperCase() && n !== c && rnd() < p * 0.22) { out += n + c; i++; continue; }
    out += c;
  }
  if (count >= 3 && rnd() < 0.35) out += ' *hic*';
  return out.slice(0, 200);
}

// ------------------------------------------------------------------------------------------------ cheers (CHEERS! / SEREFE!)
export const CHEERS = { radius: 4, window: 3, cooldown: 12 };
/**
 * events = [{ id, t, p: [x, y, z] }] of recent drinks. Returns the ids of the biggest group of 2+ different players who drank within
 * CHEERS.window seconds and CHEERS.radius metres of each other (one of them is the anchor), or null.
 */
export function detectCheers(events, now, o = {}) {
  const win = o.window ?? CHEERS.window, rad = o.radius ?? CHEERS.radius, minN = o.min ?? 2;
  const live = events.filter((e) => now - e.t <= win + 1e-6);
  let best = null;
  for (const a of live) {
    const grp = new Map([[a.id, a]]);
    for (const b of live) {
      if (b.id === a.id || grp.has(b.id)) continue;
      if (Math.abs(b.t - a.t) > win) continue;
      const dx = a.p[0] - b.p[0], dy = (a.p[1] || 0) - (b.p[1] || 0), dz = a.p[2] - b.p[2];
      if (dx * dx + dy * dy + dz * dz <= rad * rad) grp.set(b.id, b);
    }
    if (grp.size >= minN && (!best || grp.size > best.length)) best = [...grp.keys()];
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ ship table: eating together
export const TABLE = { radius: 3, window: 30, wellFedSec: 240 };
/** log = [{ id, t }] meals eaten at the table. Returns the ids that get Well Fed (>= 2 different players, or 1 when playing alone). */
export function tableWellFed(log, now, alive = 2) {
  const ids = [...new Set(log.filter((e) => now - e.t <= TABLE.window).map((e) => e.id))];
  return ids.length >= Math.min(2, Math.max(1, alive)) ? ids : [];
}

// ------------------------------------------------------------------------------------------------ world placement (vending machines, fridges, party cake)
export const MACHINE_ROOMS = /break|cafe|kitchen|lounge|canteen|lobby|dining|pantry|reception|office|nursery|ball|party/i;
export const VEND_TABLE = {
  vend: [['fd_mega', 3], ['fd_coffee', 4], ['fd_glitch', 3], ['fd_cringe', 3], ['fd_bar', 4], ['fd_lager', 2], ['fd_pizza', 1]],
  fridge: [['fd_noodles', 4], ['fd_pizza', 4], ['fd_ramen', 2], ['fd_pizzabox', 1], ['fd_lager', 2], ['fd_raki', 1], ['fd_coffee', 2], ['fd_cake', 0.5]],
};
export const MACHINE_STOCK = { vend: 3, fridge: 2 };
/** Weighted pick from VEND_TABLE[kind]. */
export function vendPick(kind, rnd) {
  const tb = VEND_TABLE[kind] || VEND_TABLE.vend;
  let tot = 0; for (const e of tb) tot += e[1];
  let r = rnd() * tot;
  for (const e of tb) { r -= e[1]; if (r <= 0) return e[0]; }
  return tb[0][0];
}
/**
 * Deterministic plan from the facility scrap spots + run seed (every peer computes the same thing):
 * { machines: [{ kind: 'vend' | 'fridge', x, y, z, yaw }], cake: { x, y, z } | null }.
 */
export function planFoodSpots(spots, seed) {
  const rng = new RNG(((seed ^ 0xf00d5) >>> 0) || 1);
  const ok = (spots || []).filter((s) => !s.elevated && !s.item && !s.sealed && s.room >= 0 && s.type !== 'corridor' && (s.dist || 0) >= 3);
  const preferred = ok.filter((s) => MACHINE_ROOMS.test(String(s.type || '')));
  const pool = () => (preferred.length >= 2 ? preferred : ok);
  const machines = [];
  const used = [];
  const far = (s) => used.every((u) => Math.hypot(u.x - s.x, u.z - s.z) > 6);
  const take = (kind, chance) => {
    if (!rng.chance(chance)) return;
    const cand = pool().filter(far);
    if (!cand.length) return;
    const s = rng.pick(cand);
    used.push(s);
    machines.push({ kind, x: s.x, y: s.y, z: s.z, yaw: Math.floor(rng.next() * 4) * (Math.PI / 2) });
  };
  take('vend', 0.7);
  take('fridge', 0.55);
  if (!machines.length && ok.length && rng.chance(0.5)) take('vend', 1);
  let cake = null;
  const party = ok.filter((s) => /party|ball|nursery|dining|kitchen|lounge|cafe|break/i.test(String(s.type || '')));
  if (party.length && rng.chance(0.4)) { const s = rng.pick(party); cake = { x: s.x, y: s.y, z: s.z }; }
  return { machines, cake };
}
/** Ship table candidates, in order of preference (the first free one is used). The ship is x -7..7, z -3.5..3.5. */
export const TABLE_SPOTS = SHIP_TABLE_SPOTS;   // [ship2] world/shiplayout.js

// ------------------------------------------------------------------------------------------------ item sell / loot helpers
/** { theme: [[id, weight], ...] } built from FOODS[].loot (added to the scrap tables). */
export function lootByTheme() {
  const out = {};
  for (const [id, d] of Object.entries(FOODS)) for (const [th, w] of Object.entries(d.loot || {})) (out[th] || (out[th] = [])).push([id, w]);
  return out;
}

// ------------------------------------------------------------------------------------------------ crafting recipes (survival tab)
export const FOOD_RECIPES = [
  { id: 'fd_noodles', name: 'Instant Noodles', cat: 'survival', out: 'fd_noodles', n: 1, in: [['comp_chem', 1], ['comp_coolant', 1]], tier: null, time: 1.6, desc: 'Just add hot water. And chemistry.' },
  { id: 'fd_ramen', name: 'Deluxe Ramen Bowl', cat: 'survival', out: 'fd_ramen', n: 1, in: [['fd_noodles', 1], ['comp_chem', 1], ['comp_cloth', 1]], tier: null, time: 2.2, desc: 'Noodles with ambition.' },
  { id: 'fd_bar', name: 'Energy Bar', cat: 'survival', out: 'fd_bar', n: 2, in: [['comp_chem', 1], ['comp_cloth', 1]], tier: null, time: 1.4, desc: 'Compressed chemistry in a wrapper.' },
  { id: 'fd_cringe', name: 'Cringe Juice', cat: 'survival', out: 'fd_cringe', n: 1, in: [['comp_chem', 2], ['comp_coolant', 1]], tier: null, time: 1.8, desc: 'Squeezed from something embarrassing.' },
  { id: 'fd_glitch', name: 'Glitch Cola', cat: 'survival', out: 'fd_glitch', n: 1, in: [['comp_chem', 1], ['comp_crystal', 1]], tier: null, time: 2.2, desc: 'Fizz with a data crystal in it.' },
  { id: 'fd_lager', name: 'Server Rack Lager', cat: 'survival', out: 'fd_lager', n: 1, in: [['comp_coolant', 2], ['comp_chem', 1]], tier: null, time: 2.4, desc: 'Home-brewed in a server rack. Cold, at least.' },
];

// ------------------------------------------------------------------------------------------------ translations (English key -> Turkish / Russian)
export const TR = {
  'Instant Noodles': 'Hazır Noodle', 'Deluxe Ramen Bowl': 'Lüks Ramen Kasesi', 'Pizza Slice': 'Pizza Dilimi', 'Pizza Box': 'Pizza Kutusu', 'Energy Bar': 'Enerji Barı',
  'Party Cake': 'Parti Pastası', 'Mystery Meat': 'Gizemli Et', 'Mega Engagement': 'Mega Etkileşim', 'Doomscroll Coffee': 'Doomscroll Kahvesi', 'Glitch Cola': 'Glitch Kola',
  'Cringe Juice': 'Cringe Suyu', 'Server Rack Lager': 'Sunucu Rafı Birası', '404 Raki': '404 Rakı', 'Firewall Vodka': 'Güvenlik Duvarı Votkası',
  'LMB: slurp. Regenerates 0.5 HP per second for 30 s.': 'Sol tık: höpürdet. 30 sn boyunca saniyede 0.5 CAN yeniler.',
  'LMB: eat. Regenerates 0.8 HP per second for 25 s and speeds up your stamina.': 'Sol tık: ye. 25 sn saniyede 0.8 CAN yeniler, dayanıklılığı hızlandırır.',
  'LMB: eat. Heals 12 HP and fills you up (+8 max HP for 90 s). Pineapple not included.': 'Sol tık: ye. 12 CAN iyileştirir, karnını doyurur (90 sn +8 maks CAN). Ananas dahil değil.',
  'LMB: eat the whole thing. Heals 24 HP and +8 max HP for 150 s. Someone will ask for a slice.': 'Sol tık: hepsini ye. 24 CAN iyileştirir, 150 sn +8 maks CAN. Biri mutlaka dilim isteyecek.',
  'LMB: crunch. Refills 45 stamina and +40% stamina regeneration for 45 s.': 'Sol tık: çıtır. 45 dayanıklılık doldurur, 45 sn dayanıklılık yenilenmesi +%40.',
  'LMB: cut the cake. Everyone within 8 m gets Cake Day (speed, damage reduction, regen), longer with more guests. Found in party rooms and fridges.': 'Sol tık: pastayı kes. 8 m içindeki herkese Pasta Günü (hız, hasar azaltma, yenilenme), misafir çoksa daha uzun. Parti odalarında ve buzdolaplarında bulunur.',
  'LMB: eat. Dropped by creatures. It is either great or terrible. Nobody knows what animal it was.': 'Sol tık: ye. Yaratıklardan düşer. Ya harikadır ya berbat. Hangi hayvan olduğunu kimse bilmiyor.',
  'LMB: chug. +30% speed and +50% stamina regen for 60 s. Then comes The Crash. Engagement is a loan.': 'Sol tık: dikine devir. 60 sn +%30 hız, +%50 dayanıklılık yenilenmesi. Sonra Çöküş gelir. Etkileşim bir borçtur.',
  'LMB: sip. For 90 s you notice creatures farther away (a quiet ping every 7 s) and scan +40%.': 'Sol tık: yudumla. 90 sn yaratıkları daha uzaktan fark edersin (7 sn\'de bir sessiz ping), tarama +%40.',
  'LMB: chug. Rolls a random 25 s anomaly mutation, good or bad. The can is always slightly warped.': 'Sol tık: dikine devir. Rastgele 25 sn anomali mutasyonu verir, iyi ya da kötü. Kutu hep biraz bükük.',
  'LMB: drink. Your footsteps squeak (everyone hears it) but you take 6% less damage for 90 s.': 'Sol tık: iç. 90 sn adımların gıcırdar (herkes duyar) ama %6 daha az hasar alırsın.',
  'LMB: drink. Courage: less STATIC, a little damage reduction. But each drink stacks: swaying, slurred chat, hiccups. Lasts 2 min.': 'Sol tık: iç. Cesaret: daha az STATİK, biraz hasar azaltma. Ama her içki birikir: sallanma, peltek sohbet, hıçkırık. 2 dk sürer.',
  'LMB: drink. Anise, water, regret. Stronger than the lager. Lasts 2.5 min. Drinks stack.': 'Sol tık: iç. Anason, su, pişmanlık. Biradan güçlü. 2.5 dk sürer. İçkiler birikir.',
  'LMB: drink. Blocks all incoming feelings. The strongest one. Lasts 3 min. Drinks stack; 3 or more and you may pass out.': 'Sol tık: iç. Gelen tüm duyguları engeller. En güçlüsü. 3 dk sürer. İçkiler birikir; 3 veya fazlasında bayılabilirsin.',
  'Warm Noodles': 'Sıcak Noodle', 'Ramen Bliss': 'Ramen Mutluluğu', 'Full Belly': 'Tok Karın', 'Sugar Rush': 'Şeker Patlaması', 'Cake Day': 'Pasta Günü', 'Meat Sweats': 'Et Terlemesi',
  'Mystery Vigor': 'Gizemli Zindelik', 'Food Poisoning': 'Gıda Zehirlenmesi', Gassy: 'Gazlı', 'The Crash': 'Çöküş', 'Doomscroll Alert': 'Doomscroll Uyarısı', 'Cringe Aura': 'Cringe Aurası',
  'Liquid Courage': 'Sıvı Cesaret', 'Well Fed': 'Tok ve Mutlu', Tipsy: 'Çakır Keyif', Drunk: 'Sarhoş', Hammered: 'Çakma', Legless: 'Ayakta Duramıyor',
  'Regenerates 0.5 HP per second.': 'Saniyede 0.5 CAN yeniler.', 'Regenerates 0.8 HP per second. Stamina +15%.': 'Saniyede 0.8 CAN yeniler. Dayanıklılık +%15.', '+8 max HP.': '+8 maks CAN.',
  'Stamina regenerates 40% faster.': 'Dayanıklılık %40 hızlı yenilenir.', '+8% speed, 5% damage reduction, regenerates 0.2 HP per second.': '+%8 hız, %5 hasar azaltma, saniyede 0.2 CAN yeniler.',
  '+20% damage. Regenerates 0.3 HP per second. You smell of victory.': '+%20 hasar. Saniyede 0.3 CAN yeniler. Zafer kokuyorsun.', '+12% speed and +12 max HP. Do not ask.': '+%12 hız ve +12 maks CAN. Sorma.',
  '-12% speed and a queasy sway. Not lethal, just rude.': '-%12 hız ve mide bulandıran sallanma. Ölümcül değil, sadece kaba.', 'You burp loudly every few seconds. Creatures hear it.': 'Birkaç saniyede bir yüksek sesle geğirirsin. Yaratıklar duyar.',
  '+30% speed, stamina regenerates 50% faster. Then: The Crash.': '+%30 hız, dayanıklılık %50 hızlı yenilenir. Sonra: Çöküş.', '-20% speed, stamina regenerates 40% slower.': '-%20 hız, dayanıklılık %40 yavaş yenilenir.',
  'Scan range +40%. A quiet ping shows creatures within 32 m every 7 s.': 'Tarama menzili +%40. Sessiz bir ping 7 sn\'de bir 32 m içindeki yaratıkları gösterir.', '6% damage reduction. Your footsteps squeak.': '%6 hasar azaltma. Adımların gıcırdar.',
  '+10% damage, 5% damage reduction, less STATIC gain.': '+%10 hasar, %5 hasar azaltma, daha az STATİK artışı.', '+10 max HP, +3% speed, stamina +15%. The crew ate together.': '+10 maks CAN, +%3 hız, dayanıklılık +%15. Ekip birlikte yedi.',
  'Courage: less STATIC gain, 3% damage reduction. A light sway.': 'Cesaret: daha az STATİK artışı, %3 hasar azaltma. Hafif sallanma.', 'Courage, but the room sways, your aim drifts and your chat slurs.': 'Cesaret var ama oda sallanır, nişan kayar, sohbetin peltekleşir.',
  'Hiccups, heavy sway, delayed turning. You may pass out (not lethal).': 'Hıçkırık, ağır sallanma, gecikmeli dönüş. Bayılabilirsin (ölümcül değil).', 'Everything is fine. Everything is spinning. Passing out is likely.': 'Her şey yolunda. Her şey dönüyor. Bayılma ihtimali yüksek.',
  'CHEERS!': 'ŞEREFE!', 'You blacked out.': 'Bayıldın.', 'You come to. You dropped what you were holding.': 'Kendine geldin. Elindekini düşürdün.', '{name} passed out.': '{name} bayıldı.',
  'Ship table [E]': 'Gemi masası [E]', 'Hold food or a drink and press E. Eat together: Well Fed on the next landing.': 'Yiyecek veya içecek tut, E\'ye bas. Birlikte ye: sonraki inişte Tok ve Mutlu.',
  'Eat here [E]': 'Burada ye [E]', 'Well Fed: the next landing starts on a full stomach.': 'Tok ve Mutlu: sonraki iniş tok karnına başlar.', 'Table meal. Eat with the crew to get Well Fed.': 'Masa yemeği. Ekiple ye, Tok ve Mutlu ol.',
  'Vending Machine [E]': 'Otomat [E]', 'Fridge [E]': 'Buzdolabı [E]', '{n} left': '{n} kaldı', 'It is empty.': 'İçi boş.', 'It hums. Nothing comes out.': 'Uğuldar. Hiçbir şey çıkmaz.',
  'Take {item} from {name} [E]': '{name} kişisinden {item} al [E]', 'You hold out the {item}. A crewmate can take it with E.': '{item} uzattın. Bir ekip arkadaşı E ile alabilir.',
  'Hold food or a drink to offer it.': 'İkram etmek için yiyecek veya içecek tut.', '{name} handed you {item}.': '{name} sana {item} verdi.', 'You handed {item} to {name}.': '{name} kişisine {item} verdin.',
  'No free hands.': 'Eller dolu.', 'Offer [H]': 'İkram et [H]', 'Slow down, chef.': 'Yavaş ol şef.',
  'Cake Day. Everyone nearby is happy.': 'Pasta Günü. Yakındaki herkes mutlu.', 'Burp.': 'Geğirik.', 'You are already eating.': 'Zaten yiyorsun.',
};
export const RU = {
  'Instant Noodles': 'Лапша быстрого приготовления', 'Deluxe Ramen Bowl': 'Рамен «Делюкс»', 'Pizza Slice': 'Кусок пиццы', 'Pizza Box': 'Коробка пиццы', 'Energy Bar': 'Энергобатончик',
  'Party Cake': 'Праздничный торт', 'Mystery Meat': 'Загадочное мясо', 'Mega Engagement': 'Мега Вовлечённость', 'Doomscroll Coffee': 'Кофе для думскроллинга', 'Glitch Cola': 'Глитч-кола',
  'Cringe Juice': 'Кринж-сок', 'Server Rack Lager': 'Лагер «Серверная стойка»', '404 Raki': 'Ракы 404', 'Firewall Vodka': 'Водка «Файрвол»',
  'LMB: slurp. Regenerates 0.5 HP per second for 30 s.': 'ЛКМ: хлебнуть. 30 с восстанавливает 0.5 ЗДР в секунду.',
  'LMB: eat. Regenerates 0.8 HP per second for 25 s and speeds up your stamina.': 'ЛКМ: съесть. 25 с восстанавливает 0.8 ЗДР в секунду и ускоряет выносливость.',
  'LMB: eat. Heals 12 HP and fills you up (+8 max HP for 90 s). Pineapple not included.': 'ЛКМ: съесть. Лечит 12 ЗДР и насыщает (+8 макс. ЗДР на 90 с). Ананасов нет.',
  'LMB: eat the whole thing. Heals 24 HP and +8 max HP for 150 s. Someone will ask for a slice.': 'ЛКМ: съесть всё. Лечит 24 ЗДР и +8 макс. ЗДР на 150 с. Кто-нибудь попросит кусочек.',
  'LMB: crunch. Refills 45 stamina and +40% stamina regeneration for 45 s.': 'ЛКМ: хрустеть. Возвращает 45 выносливости и +40% к её восстановлению на 45 с.',
  'LMB: cut the cake. Everyone within 8 m gets Cake Day (speed, damage reduction, regen), longer with more guests. Found in party rooms and fridges.': 'ЛКМ: разрезать торт. Все в 8 м получают День торта (скорость, снижение урона, регенерация), дольше при большем числе гостей. Ищите в комнатах для вечеринок и холодильниках.',
  'LMB: eat. Dropped by creatures. It is either great or terrible. Nobody knows what animal it was.': 'ЛКМ: съесть. Выпадает из существ. Либо отлично, либо ужасно. Чьё это мясо, никто не знает.',
  'LMB: chug. +30% speed and +50% stamina regen for 60 s. Then comes The Crash. Engagement is a loan.': 'ЛКМ: залпом. 60 с: +30% скорости и +50% к восстановлению выносливости. Потом Обвал. Вовлечённость это кредит.',
  'LMB: sip. For 90 s you notice creatures farther away (a quiet ping every 7 s) and scan +40%.': 'ЛКМ: глоток. 90 с вы замечаете существ дальше (тихий пинг раз в 7 с), сканирование +40%.',
  'LMB: chug. Rolls a random 25 s anomaly mutation, good or bad. The can is always slightly warped.': 'ЛКМ: залпом. Случайная аномальная мутация на 25 с, хорошая или плохая. Банка всегда слегка кривая.',
  'LMB: drink. Your footsteps squeak (everyone hears it) but you take 6% less damage for 90 s.': 'ЛКМ: выпить. Шаги скрипят (слышат все), но 90 с вы получаете на 6% меньше урона.',
  'LMB: drink. Courage: less STATIC, a little damage reduction. But each drink stacks: swaying, slurred chat, hiccups. Lasts 2 min.': 'ЛКМ: выпить. Храбрость: меньше СТАТИКИ, чуть меньше урона. Но каждый глоток копится: качка, невнятный чат, икота. 2 мин.',
  'LMB: drink. Anise, water, regret. Stronger than the lager. Lasts 2.5 min. Drinks stack.': 'ЛКМ: выпить. Анис, вода, сожаления. Крепче лагера. 2.5 мин. Напитки копятся.',
  'LMB: drink. Blocks all incoming feelings. The strongest one. Lasts 3 min. Drinks stack; 3 or more and you may pass out.': 'ЛКМ: выпить. Блокирует все входящие чувства. Самая крепкая. 3 мин. Напитки копятся; от трёх можно отключиться.',
  'Warm Noodles': 'Тёплая лапша', 'Ramen Bliss': 'Блаженство рамена', 'Full Belly': 'Сытое брюшко', 'Sugar Rush': 'Сахарный заряд', 'Cake Day': 'День торта', 'Meat Sweats': 'Мясной угар',
  'Mystery Vigor': 'Загадочная бодрость', 'Food Poisoning': 'Пищевое отравление', Gassy: 'Газики', 'The Crash': 'Обвал', 'Doomscroll Alert': 'Настороже от думскроллинга', 'Cringe Aura': 'Аура кринжа',
  'Liquid Courage': 'Жидкая храбрость', 'Well Fed': 'Сыт и доволен', Tipsy: 'Навеселе', Drunk: 'Пьян', Hammered: 'В стельку', Legless: 'Не стоит на ногах',
  'Regenerates 0.5 HP per second.': 'Восстанавливает 0.5 ЗДР в секунду.', 'Regenerates 0.8 HP per second. Stamina +15%.': 'Восстанавливает 0.8 ЗДР в секунду. Выносливость +15%.', '+8 max HP.': '+8 макс. ЗДР.',
  'Stamina regenerates 40% faster.': 'Выносливость восстанавливается на 40% быстрее.', '+8% speed, 5% damage reduction, regenerates 0.2 HP per second.': '+8% скорости, -5% урона, 0.2 ЗДР в секунду.',
  '+20% damage. Regenerates 0.3 HP per second. You smell of victory.': '+20% урона. 0.3 ЗДР в секунду. Вы пахнете победой.', '+12% speed and +12 max HP. Do not ask.': '+12% скорости и +12 макс. ЗДР. Не спрашивайте.',
  '-12% speed and a queasy sway. Not lethal, just rude.': '-12% скорости и тошнотная качка. Не смертельно, просто неприятно.', 'You burp loudly every few seconds. Creatures hear it.': 'Вы громко рыгаете каждые несколько секунд. Существа слышат.',
  '+30% speed, stamina regenerates 50% faster. Then: The Crash.': '+30% скорости, выносливость восстанавливается на 50% быстрее. Потом: Обвал.', '-20% speed, stamina regenerates 40% slower.': '-20% скорости, выносливость восстанавливается на 40% медленнее.',
  'Scan range +40%. A quiet ping shows creatures within 32 m every 7 s.': 'Дальность сканирования +40%. Тихий пинг раз в 7 с показывает существ в 32 м.', '6% damage reduction. Your footsteps squeak.': '-6% урона. Ваши шаги скрипят.',
  '+10% damage, 5% damage reduction, less STATIC gain.': '+10% урона, -5% урона, меньше прироста СТАТИКИ.', '+10 max HP, +3% speed, stamina +15%. The crew ate together.': '+10 макс. ЗДР, +3% скорости, выносливость +15%. Команда поела вместе.',
  'Courage: less STATIC gain, 3% damage reduction. A light sway.': 'Храбрость: меньше прироста СТАТИКИ, -3% урона. Лёгкая качка.', 'Courage, but the room sways, your aim drifts and your chat slurs.': 'Храбрость, но комната качается, прицел уплывает, чат невнятный.',
  'Hiccups, heavy sway, delayed turning. You may pass out (not lethal).': 'Икота, сильная качка, запаздывающие повороты. Можно отключиться (не смертельно).', 'Everything is fine. Everything is spinning. Passing out is likely.': 'Всё хорошо. Всё кружится. Отключка вероятна.',
  'CHEERS!': 'ЗА ЗДОРОВЬЕ!', 'You blacked out.': 'Вы отключились.', 'You come to. You dropped what you were holding.': 'Вы очнулись. Всё из рук выпало.', '{name} passed out.': '{name} отключился.',
  'Ship table [E]': 'Стол на корабле [E]', 'Hold food or a drink and press E. Eat together: Well Fed on the next landing.': 'Возьмите еду или напиток и нажмите E. Ешьте вместе: «Сыт и доволен» на следующей посадке.',
  'Eat here [E]': 'Поесть здесь [E]', 'Well Fed: the next landing starts on a full stomach.': 'Сыт и доволен: следующая посадка начнётся на сытый желудок.', 'Table meal. Eat with the crew to get Well Fed.': 'Общий стол. Поешьте вместе, чтобы стать сытыми и довольными.',
  'Vending Machine [E]': 'Автомат [E]', 'Fridge [E]': 'Холодильник [E]', '{n} left': 'Осталось {n}', 'It is empty.': 'Пусто.', 'It hums. Nothing comes out.': 'Гудит. Ничего не выпадает.',
  'Take {item} from {name} [E]': 'Взять {item} у {name} [E]', 'You hold out the {item}. A crewmate can take it with E.': 'Вы протянули: {item}. Напарник может взять на E.',
  'Hold food or a drink to offer it.': 'Возьмите еду или напиток, чтобы угостить.', '{name} handed you {item}.': '{name} угостил вас: {item}.', 'You handed {item} to {name}.': 'Вы отдали {item}: {name}.',
  'No free hands.': 'Руки заняты.', 'Offer [H]': 'Угостить [H]', 'Slow down, chef.': 'Не спеши, шеф.',
  'Cake Day. Everyone nearby is happy.': 'День торта. Все рядом довольны.', 'Burp.': 'Ик.', 'You are already eating.': 'Вы уже едите.',
};
