// cosm5 (wave 4) - the big cosmetics drop: DATA + pure helpers (no three.js, no DOM: importable from Node tests).
//   14 suits, 19 hats, 10 back items, 10 weapon skins, 6 emotes. Appearance only, never stats.
// Every entry: { slot, id, name, tier, src, desc, how, price?, minLevel?, boss?, rule? }
//   src = 'shop'   sold in the rotating wardrobe shop for Clout (price); also eligible for crates
//         'crate'  only found in daily crates / cosmetic rewards (cosmeticPool)
//         'boss'   dropped by a boss (`boss` = creature type, see BOSS_DROPS); every crew member gets it
//         'secret' earned by a hidden rule (see RULES in cosm5.js); `how` is shown only as a hint
// Ids are globally unique across slots (test: tools/harness/cosm5.test.mjs).
import { TIER_ORDER } from './tiers.js';
import { COSM as C10_MYST } from './mystery10_core.js';   // wave 10: mystery10 (The First Upload) hat
import './mystery10_text.js';   // registers its TR / RU strings (the wardrobe reads them through t())
import { C13 } from './wardrobe13_data.js';
import { C8 } from './cosm8_data.js';   // wave 8: +31 rows (8 suits, 8 hats, 6 back items, 4 skins, 5 emotes)

export const SLOTS5 = ['suit', 'hat', 'back', 'skin', 'emote'];

const S = (id, name, tier, src, desc, extra = {}) => ({ slot: 'suit', id, name, tier, src, desc, how: '', ...extra });
const H = (id, name, tier, src, desc, extra = {}) => ({ slot: 'hat', id, name, tier, src, desc, how: '', ...extra });
const B = (id, name, tier, src, desc, extra = {}) => ({ slot: 'back', id, name, tier, src, desc, how: '', ...extra });
const K = (id, name, tier, src, desc, extra = {}) => ({ slot: 'skin', id, name, tier, src, desc, how: '', ...extra });
const E = (id, name, tier, src, desc, extra = {}) => ({ slot: 'emote', id, name, tier, src, desc, how: '', ...extra });

export const C5 = [
  // ------------------------------------------------------------ suits (14)
  S('nightjan', 'Night-Shift Janitor', 'common', 'shop', 'Grey coverall, reflective stripe, a bucket that has seen things. Somebody has to clean up.', { price: 140, minLevel: 2 }),
  S('sysadmin', 'Root Access Hoodie', 'uncommon', 'shop', 'A green-lit hoodie, a cold coffee and full permissions. Have you tried turning it off?', { price: 260, minLevel: 4 }),
  S('hazintern', 'Hazmat Intern', 'uncommon', 'shop', 'Oversized white suit, a sticker that says INTERN and a clipboard nobody reads.', { price: 300, minLevel: 5 }),
  S('beekeeper', 'Beekeeper', 'uncommon', 'crate', 'Veil hat, smoker can and a few very loyal followers. They are not part of the suit.'),
  S('retroastro', 'Retro Astronaut', 'rare', 'shop', 'Silver-and-orange pressure suit with a fishbowl helmet. Vintage 1969, still leaks.', { price: 520, minLevel: 8 }),
  S('neonrider', 'Neon Rider', 'rare', 'shop', 'Black leather, magenta and cyan light strips, a helmet that never comes off.', { price: 580, minLevel: 10 }),
  S('brassdiver', 'Brass Deep-Sea Diver', 'rare', 'crate', 'Riveted copper helmet with three portholes, lead boots, a hose to nowhere.'),
  S('mascot', 'Spam Mascot', 'rare', 'crate', 'Foam costume of a smiling pink can. The smile is load-bearing.'),
  S('samsalary', 'Samurai Salaryman', 'epic', 'shop', 'Black suit, red tie, wide shoulder wings and a katana in a briefcase-grade sheath.', { price: 1250, minLevel: 14 }),
  S('helpknight', 'Knight of the Help Desk', 'epic', 'boss', 'Chainmail, a headset and a tabard that reads TICKET #0001. Your call is important to him.', { boss: 'middlemanager' }),
  S('plagueacct', 'Plague Accountant', 'epic', 'boss', 'Long beak, black cloak and a green ledger. Balances everything, including you.', { boss: 'surgeon' }),
  S('algocult', 'Algorithm Cultist Robe', 'epic', 'secret', 'Black hooded robe with a glowing red sigil. The feed provides.', { how: 'Serve the Algorithm: sell 20,000 credits of scrap' }),
  S('glitch', 'Glitch', 'legendary', 'secret', 'Not a suit. A rendering error that got a badge. Shimmers when nobody looks.', { how: 'Play three different new emotes within 25 seconds' }),
  S('eoty', 'Employee of the Year', 'mythic', 'boss', 'Platinum plating, a gold sash and a smile that costs extra. Only one per company.', { boss: 'lobbymanager' }),
  // ------------------------------------------------------------ hats / head items (19)
  H('mophead', 'Mop Head Wig', 'common', 'shop', 'Still slightly damp. Do not ask what it mopped.', { price: 70 }),
  H('paperboat', 'Paper Boat Hat', 'common', 'shop', 'Folded from a rejected performance review.', { price: 60 }),
  H('coffeecup', 'Giant Coffee Cup', 'uncommon', 'shop', 'Fuel of the workforce. Comes with a lid and a little steam.', { price: 150 }),
  H('rubberduck', 'Rubber Duck', 'uncommon', 'shop', 'Explain your bug to it. It knows.', { price: 180 }),
  H('cowboy', 'Cowboy Hat', 'uncommon', 'shop', 'This server is not big enough for the both of us.', { price: 200 }),
  H('cablecoil', 'Cable Turban', 'uncommon', 'crate', 'Ethernet, wrapped tight. Gigabit-fashionable.'),
  H('toaster', 'Toaster Hat', 'uncommon', 'crate', 'Two slices, always ready. Pops when you are not looking.'),
  H('jester', 'Jester Cap', 'rare', 'shop', 'Bells, three points, zero dignity. The Board finds it funny.', { price: 380 }),
  H('tricorn', 'Torrent Captain Tricorn', 'rare', 'shop', 'Seeds since 2004. A tiny skull, a big grudge.', { price: 420 }),
  H('cursor', 'Giant Cursor', 'rare', 'crate', 'Click here. No, there. Yes, on your head.'),
  H('wifi', 'Wi-Fi Halo', 'rare', 'crate', 'Three bars of divinity. Drops when you enter the basement.'),
  H('loading', 'Buffering Ring', 'rare', 'crate', 'Spins forever. It is not going to load.'),
  H('crt', 'Tiny CRT', 'epic', 'crate', 'A whole television for a hat. Shows nothing but static and a tiny you.'),
  H('stormcloud', 'Personal Storm Cloud', 'epic', 'crate', 'It follows you. It has feelings. Mostly rain.'),
  H('dronebuddy', 'Drone Buddy', 'epic', 'shop', 'A small helper drone that orbits your head and judges your loot.', { price: 900, minLevel: 12 }),
  H('foremanhat', "Foreman's Halo Hardhat", 'epic', 'boss', 'The Foreman\'s own hardhat, with a halo he certainly did not earn.', { boss: 'foreman' }),
  H('laurel', 'Laurel Wreath', 'legendary', 'crate', 'For services to the quota. Golden leaves, sharp edges.'),
  H('firewall', 'Firewall Crown', 'legendary', 'secret', 'Flames that block everything. Including compliments.', { how: 'Meet the quota 15 times' }),
  H('blackhole', 'Event Horizon', 'mythic', 'secret', 'A small black hole in a ring of light. Nothing escapes. Not even sound.', { how: 'Reach level 40', minLevel: 40 }),
  // ------------------------------------------------------------ back items (10)
  B('lunchbox', 'Lunch Box Pack', 'common', 'shop', 'Contains one sad sandwich and a note that says RETURN THE FRIDGE.', { price: 90 }),
  B('cape', "Manager's Cape", 'uncommon', 'shop', 'Red, flowing, technically part of the dress code.', { price: 240 }),
  B('banner', 'Company Banner', 'uncommon', 'shop', 'A tiny flag on a tall pole. WE ARE FAMILY. (Legally.)', { price: 200 }),
  B('plushfrog', 'Plush Frog Backpack', 'uncommon', 'crate', 'Rides your back and stares at what is behind you.'),
  B('balloons', 'Balloon Cluster', 'rare', 'shop', 'Three balloons and a lot of hope. Do not go near the pipes.', { price: 450 }),
  B('dish', 'Satellite Dish', 'rare', 'crate', 'Receives nothing, transmits your location. Rotates lazily.'),
  B('server', 'Server Rack', 'rare', 'boss', 'A mini rack with blinking LEDs. Uptime: yes.', { boss: 'loadbalancer' }),
  B('capevoid', 'Void Cape', 'epic', 'crate', 'The night sky, sewn on. A few stars are stuck in it.'),
  B('jetpack', 'Jetpack', 'epic', 'shop', 'Twin nozzles and a pretend flame. HR says: props only, no takeoffs.', { price: 1100, minLevel: 12 }),
  B('wings', 'Mecha Wings', 'epic', 'boss', 'Articulated blades that flex when you move. The Hydra will want them back.', { boss: 'hydra' }),
  // ------------------------------------------------------------ weapon skins (10)
  K('camo', 'Woodland Camo', 'common', 'shop', 'Blends in with forests. There are no forests here.', { price: 150 }),
  K('rusted', 'Rusted', 'common', 'crate', 'Tetanus included. Looks worse than it cuts.'),
  K('bone', 'Bone', 'uncommon', 'crate', 'Carved from something that used to be alive. Probably.'),
  K('bubblegum', 'Bubblegum', 'uncommon', 'shop', 'Pink, glossy and only slightly sticky.', { price: 300 }),
  K('carbon', 'Carbon Weave', 'rare', 'shop', 'Twill fibre with a clear coat. Fast, light, expensive.', { price: 550, minLevel: 6 }),
  K('damascus', 'Damascus Steel', 'rare', 'shop', 'Folded a thousand times. Rippling bands of grey.', { price: 650, minLevel: 8 }),
  K('frost', 'Frostbite', 'epic', 'crate', 'Ice crystals that sparkle when you do not use it.'),
  K('circuit', 'Live Circuit', 'epic', 'shop', 'Green board, cyan traces, data pulsing down the barrel.', { price: 1000, minLevel: 12 }),
  K('lava', 'Magma Core', 'legendary', 'secret', 'Cracked black rock with a molten heart. Handle by the cool bit.', { how: 'Defeat 300 creatures' }),
  K('holo', 'Holographic', 'mythic', 'boss', 'A shifting rainbow film. Impossible to photograph, easy to admire.', { boss: 'legacybot' }),
  // ------------------------------------------------------------ emotes (6)
  E('clockout', 'Clock Out', 'uncommon', 'shop', 'Punch the card, sigh, leave. The oldest dance there is.', { price: 200, minLevel: 3, icon: '◷', dur: 3.2 }),
  E('clap', 'Corporate Clap', 'common', 'shop', 'Enthusiastic, mandatory and slightly out of sync.', { price: 120, icon: '◈', dur: 3.5 }),
  E('praise', 'Praise the Algorithm', 'rare', 'crate', 'Arms up, head back. The feed is generous today.', { icon: '✦', dur: 4 }),
  E('buffering', 'Buffering', 'rare', 'crate', 'Freeze, stutter, stare into the distance at 99%.', { icon: '◌', dur: 5 }),
  E('undo', 'Ctrl+Z', 'epic', 'secret', 'Rewinds the last few seconds of your dignity.', { how: 'Reach level 15', icon: '↶', dur: 3.4, minLevel: 15 }),
  E('lagspike', 'Lag Spike', 'epic', 'boss', 'You are here. No, there. No, back. Ping: 999.', { boss: 'host', icon: '↯', dur: 4 }),
];

C5.push(...C8);
C5.push(...C10_MYST.map((r) => ({ ...r })));
C5.push(...C13);   // wave 10: mystery10

export const BOSS_NAMES = { foreman: 'The Foreman', loadbalancer: 'The Load Balancer', middlemanager: 'Middle Manager', hydra: 'Comment Section Hydra', surgeon: 'The Head Surgeon', host: 'The Host', excavator: 'The Excavator', lobbymanager: 'The Lobby Manager', legacybot: 'Legacy Bot' };
// how-to-get text (English keys; translated in cosm5_i18n.js): shop / crate are fixed strings, boss / secret say where
for (const e of C5) {
  if (e.how) continue;
  e.how = e.src === 'shop' ? 'Rotating wardrobe shop' : e.src === 'crate' ? 'Daily crates and cosmetic rewards' : e.src === 'boss' ? 'Boss drop: ' + (BOSS_NAMES[e.boss] || e.boss) : 'Secret';
}
export const C5_BY_KEY = Object.fromEntries(C5.map((e) => [e.slot + ':' + e.id, e]));
export const C5_BY_ID = Object.fromEntries(C5.map((e) => [e.id, e]));
export const keyOf = (e) => e.slot + ':' + e.id;
export const bySlot = (slot) => C5.filter((e) => e.slot === slot);

/** stable id tables for the compact sync code: append only, never reorder */
export const ID_TABLE = Object.fromEntries(['suit', 'hat', 'back', 'skin'].map((s) => [s, bySlot(s).map((e) => e.id)]));

// ------------------------------------------------------------------ boss drops (creature type -> cosmetic keys)
export const BOSS_DROPS = {};
for (const e of C5) if (e.boss) (BOSS_DROPS[e.boss] ||= []).push(keyOf(e));

// ------------------------------------------------------------------ crate pool (used by the daily-reward module)
/**
 * Cosmetics a crate / daily reward may hand out.
 *   cosmeticPool(tier)            -> [{ key, slot, id, name, tier }]  all crate-eligible entries of exactly that tier
 *   cosmeticPool(tier, { slot })  -> only one slot ('suit' | 'hat' | 'back' | 'skin' | 'emote')
 * Crate-eligible = src 'shop' or 'crate' (never boss / secret trophies). Tiers are those of src/game/tiers.js.
 */
export function cosmeticPool(tier, { slot = null, owned = null } = {}) {
  const out = [];
  for (const e of C5) {
    if (e.src !== 'shop' && e.src !== 'crate') continue;
    if (tier && e.tier !== tier) continue;
    if (slot && e.slot !== slot) continue;
    if (owned && owned.has(keyOf(e))) continue;
    out.push({ key: keyOf(e), slot: e.slot, id: e.id, name: e.name, tier: e.tier });
  }
  return out;
}
/** pick from cosmeticPool with any object that has next() (src/core/rng.js RNG); falls back to lower tiers when a tier is empty. */
export function rollCosmetic(rng, tier, opts = {}) {
  let ti = TIER_ORDER.indexOf(tier); if (ti < 0) ti = 0;
  for (let i = ti; i >= 0; i--) {
    const pool = cosmeticPool(TIER_ORDER[i], opts);
    if (pool.length) return pool[Math.floor(rng.next() * pool.length)];
  }
  return null;
}

// ------------------------------------------------------------------ compact sync code
// 'a' (version) + '.' + four base-36 indices (suit.hat.back.skin), 0 = "not a cosm5 id / none".  Example: "a.3.0.7.a"
const VERSION = 'a';
const idx = (slot, id) => { const i = ID_TABLE[slot].indexOf(id); return i < 0 ? '0' : (i + 1).toString(36); };
const unidx = (slot, s) => { const n = parseInt(s, 36); return Number.isFinite(n) && n >= 1 && n <= ID_TABLE[slot].length ? ID_TABLE[slot][n - 1] : null; };
export function encodeLook(look = {}) {
  return [VERSION, idx('suit', look.suit), idx('hat', look.hat), idx('back', look.back), idx('skin', look.skin)].join('.');
}
/** -> { suit, hat, back, skin } (each an id or null = "not a cosm5 id"), or null for garbage */
export function decodeLook(code) {
  if (typeof code !== 'string' || code.length > 24) return null;
  const p = code.split('.');
  if (p.length !== 5 || p[0] !== VERSION) return null;
  return { suit: unidx('suit', p[1]), hat: unidx('hat', p[2]), back: unidx('back', p[3]), skin: unidx('skin', p[4]) };
}

// ------------------------------------------------------------------ shop rotation (deterministic per UTC day)
export const utcDay = (ms = Date.now()) => Math.floor(ms / 86400000);
/** 8 daily offers + 1 weekly feature, same for everybody. `rng` = new RNG(seed) from src/core/rng.js. */
export function rotationFor(day, RNGClass) {
  const shop = C5.filter((e) => e.src === 'shop');
  const rng = new RNGClass('c5shop:' + day);
  const pool = shop.slice();
  rng.shuffle(pool);
  const daily = [];
  const seen = new Set();
  // at most 3 of a slot per day keeps the rotation varied
  for (const e of pool) {
    const n = daily.filter((d) => d.slot === e.slot).length;
    if (n >= 3 || seen.has(e.id)) continue;
    daily.push(e); seen.add(e.id);
    if (daily.length >= 8) break;
  }
  const weeklyRng = new RNGClass('c5week:' + Math.floor(day / 7));
  const feat = C5.filter((e) => (e.src === 'crate') && TIER_ORDER.indexOf(e.tier) >= 3);
  const featured = feat.length ? feat[Math.floor(weeklyRng.next() * feat.length)] : null;
  return { day, daily: daily.map(keyOf), featured: featured ? keyOf(featured) : null };
}
/** price of a rotation entry: shop items cost their price, the weekly feature 2.4x an epic base */
export function offerPrice(e, featured = false) {
  if (!e) return 0;
  if (e.price) return e.price;
  const base = { common: 120, uncommon: 260, rare: 520, epic: 1000, legendary: 2200, mythic: 4000 }[e.tier] || 300;
  return featured ? Math.round(base * 1.6) : base;
}
