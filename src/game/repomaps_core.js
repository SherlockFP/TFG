// REPOMAPS core (wave 8): pure data + rules for the four themed interiors (no three.js, no DOM: unit-tested in node by tools/harness/repomaps.test.mjs).
// The runtime (models, net, hooks) lives in game/repomaps.js. Themes themselves are in world/interiors/themes_studio.js.

/** which existing moon shows which theme (moons.js / world/maps5_data.js carry the `interior` field; this table is the documented source of truth + used by tests) */
export const THEME_MOONS = Object.freeze({ palamut: 'academy', orkinos: 'museum', m5est: 'influencer', m5cold: 'colddata' });

/**
 * Fragile loot. Tags (all optional): viral (grows while carried), frozen (thaws in warm rooms), art (alarm when bumped), sig = the theme it belongs to.
 * `fragile` is the stock multiplier of the existing bump/drop damage (game/actions.js onItemImpact): value lost = ((impactSpeed - 4) * fragile * baseValue * 0.035 + 1).
 */
export const ITEM_DEFS = [
  { id: 'st_ringgold', sig: 'influencer', viral: true, name: 'Gold Ring Light', kind: 'scrap', value: [70, 120], weight: 6, hands: 1, fragile: 0.8, tip: 'A ring light plated in gold. Its follower count climbs while you carry it. Do not trip.' },
  { id: 'st_diamondbtn', sig: 'influencer', viral: true, name: 'Diamond Play Button', kind: 'scrap', value: [150, 230], weight: 3, hands: 1, fragile: 1.0, tip: 'Ten million subscribers, one very sharp edge. Grows in value while carried.' },
  { id: 'st_champagne', sig: 'influencer', viral: true, name: 'Sponsored Champagne', kind: 'scrap', value: [45, 85], weight: 4, hands: 1, fragile: 1.1, tip: 'Not for drinking: it is a prop with a sponsor. Value grows while you carry it, until it pops.' },
  { id: 'st_goldtoilet', sig: 'influencer', viral: true, big: true, name: 'Gold Toilet (Sponsored)', kind: 'big', value: [210, 340], weight: 70, hands: 0, fragile: 0.5, mass: 26, tip: 'Worth more the longer it trends. Hauling it is the hard part.' },
  { id: 'st_globe', sig: 'academy', name: 'Antique Globe', kind: 'scrap', value: [60, 110], weight: 5, hands: 1, fragile: 0.7, tip: 'Every country on it is a deleted channel now.' },
  { id: 'st_beebtrophy', sig: 'academy', name: 'Spelling Bee Trophy', kind: 'scrap', value: [45, 85], weight: 4, hands: 1, fragile: 0.6, tip: 'First place, engagement category.' },
  { id: 'st_inkwell', sig: 'academy', name: 'Detention Inkwell', kind: 'scrap', value: [22, 46], weight: 1, hands: 1, fragile: 1.0, tip: 'Sixty thousand lines written with it: I WILL POST DAILY.' },
  { id: 'st_microscope', sig: 'academy', name: 'Lab Microscope', kind: 'scrap', value: [75, 130], weight: 6, hands: 1, fragile: 0.9, tip: 'Used to study engagement up close. Lenses crack easily.' },
  { id: 'st_skeleton', sig: 'academy', big: true, name: 'Anatomy Skeleton', kind: 'big', value: [120, 210], weight: 40, hands: 0, fragile: 0.6, mass: 12, tip: 'Class mascot. It loses bones when dropped, and value with them.' },
  { id: 'st_frozendrive', sig: 'colddata', frozen: true, name: 'Frozen Data Drive', kind: 'scrap', value: [60, 105], weight: 2, hands: 1, fragile: 0.7, tip: 'FROZEN: thaws (loses value) in warm rooms and outside. Keep it moving.' },
  { id: 'st_cryovial', sig: 'colddata', frozen: true, name: 'Cryo Vial', kind: 'scrap', value: [95, 155], weight: 1, hands: 1, fragile: 1.1, tip: 'FROZEN: a sleeper\'s backup. Thaws fast, breaks faster.' },
  { id: 'st_icebrick', sig: 'colddata', frozen: true, name: 'Ice-Locked Blade', kind: 'scrap', value: [50, 90], weight: 5, hands: 1, fragile: 0.5, tip: 'FROZEN: a server blade sealed in ice. Slowly turns to water.' },
  { id: 'st_coldstack', sig: 'colddata', frozen: true, big: true, name: 'Chilled Core Stack', kind: 'big', value: [190, 310], weight: 85, hands: 0, fragile: 0.45, mass: 36, tip: 'FROZEN: a whole data core. Get it to the ship before it warms up.' },
  { id: 'st_canvas', sig: 'museum', art: true, name: 'Banned Canvas', kind: 'scrap', value: [90, 160], weight: 8, hands: 1, fragile: 0.9, tip: 'ART: it shrieks when bumped. The museum notices.' },
  { id: 'st_bust', sig: 'museum', art: true, name: 'Cancelled Bust', kind: 'scrap', value: [110, 190], weight: 14, hands: 1, fragile: 1.0, tip: 'ART: marble, and very cancelled. Setting it down hard sets off the alarm.' },
  { id: 'st_framedpost', sig: 'museum', art: true, name: 'Framed Deleted Post', kind: 'scrap', value: [60, 115], weight: 3, hands: 1, fragile: 0.8, tip: 'ART: 4 likes, 0 replies, permanently archived. Fragile glass.' },
  { id: 'st_megameme', sig: 'museum', art: true, big: true, name: 'The Last Meme (Sculpture)', kind: 'big', value: [230, 370], weight: 110, hands: 0, fragile: 0.7, mass: 34, tip: 'ART: the final meme, cast in bronze. The alarm is very loud.' },
];
export const ITEM_BY_ID = Object.freeze(Object.fromEntries(ITEM_DEFS.map((d) => [d.id, d])));
export const LOOT_WEIGHT = { st_ringgold: 8, st_diamondbtn: 3, st_champagne: 7, st_globe: 6, st_beebtrophy: 6, st_inkwell: 6, st_microscope: 5, st_frozendrive: 8, st_cryovial: 3, st_icebrick: 6, st_canvas: 8, st_bust: 4, st_framedpost: 7 };
export const BIG_WEIGHT = { st_goldtoilet: 7, st_skeleton: 8, st_coldstack: 9, st_megameme: 8 };

/** theme scrap tables: familiar internet junk (all ids exist in game/items.js) + the theme's own fragile valuables */
const BASE = {
  influencer: [['ringlight', 6], ['liketrophy', 6], ['playbutton', 2], ['nftframe', 4], ['perfume', 6], ['lamp', 5], ['painting', 6], ['vhs', 3], ['phone', 5], ['animefig', 4], ['gamingchair', 3], ['trophy', 5], ['mug', 5], ['bell', 3], ['goldbar', 2], ['ring', 2], ['duck', 3], ['key', 4]],
  academy: [['keyboard', 5], ['mug', 6], ['floppies', 5], ['printer', 3], ['headset', 3], ['flask', 6], ['magnify', 6], ['bell', 5], ['trophy', 5], ['skull', 3], ['pickles', 3], ['canned', 5], ['cdspindle', 4], ['phone', 3], ['duck', 3], ['figurine', 3], ['bottles', 4], ['lamp', 3], ['key', 4], ['painting', 3], ['stopsign', 2], ['captcha', 3]],
  colddata: [['hdd', 9], ['motherboard', 7], ['modem', 5], ['cog', 6], ['bolt', 6], ['cryptocoin', 4], ['gpu', 3], ['cdspindle', 4], ['floppies', 4], ['flask', 5], ['canned', 6], ['key', 3], ['goldbar', 1], ['tv', 2], ['robot', 3], ['usbidol', 2]],
  museum: [['painting', 9], ['nftframe', 6], ['vhs', 6], ['trophy', 4], ['skull', 3], ['bell', 4], ['ring', 2], ['goldbar', 2], ['perfume', 3], ['figurine', 4], ['animefig', 3], ['flask', 3], ['lamp', 4], ['magnify', 4], ['memecart', 3], ['captcha', 3], ['chainletter', 3], ['key', 3], ['teeth', 3]],
};
const BIG_BASE = {
  influencer: [['vase', 10], ['statue', 4], ['aquarium', 4], ['amphora', 4]],
  academy: [['statue', 3], ['pctower', 4], ['vase', 3], ['amphora', 3]],
  colddata: [['server', 8], ['cryptorig', 5], ['pctower', 4]],
  museum: [['statue', 6], ['amphora', 6], ['vase', 6]],
};
export function scrapTableOf(theme) {
  const own = ITEM_DEFS.filter((d) => d.sig === theme && !d.big).map((d) => [d.id, LOOT_WEIGHT[d.id] || 4]);
  return [...(BASE[theme] || []), ...own];
}
export function bigTableOf(theme) {
  const own = ITEM_DEFS.filter((d) => d.sig === theme && d.big).map((d) => [d.id, BIG_WEIGHT[d.id] || 6]);
  return [...(BIG_BASE[theme] || []), ...own];
}

// ------------------------------------------------------------------------------------------------------------------ signature mechanics (pure)
export const VIRAL_CAP = 1.4;        // a viral item can reach 140 % of its base value
export const VIRAL_RATE = 0.006;     // fraction of base value gained per second while carried
export const VIRAL_STUDIO_MUL = 2.5; // ...faster inside a studio (ring lights)
export const THAW_WARM = 0.016;      // fraction of base value lost per second while a frozen item sits in a warm room
export const THAW_OUTSIDE = 0.004;   // ...and outside the station
export const ALARM_COOLDOWN = 20;    // seconds between exhibit alarms
export const SHELF_STEP = 40;        // seconds between library shelf shifts (warn 5 s before)
export const SHELF_WARN = 5;
export const ICE_SLIDE = 0.12;       // player velocity blend factor on ice (worldx uses the same number for frozen lakes)

/** new value of a carried viral item after dt seconds (never lowers it, never exceeds the cap) */
export function viralNext(value, base, dt, inStudio) {
  if (!(value > 0) || !(base > 0)) return value;
  return Math.min(Math.round(base * VIRAL_CAP), value + base * VIRAL_RATE * dt * (inStudio ? VIRAL_STUDIO_MUL : 1));
}
/** new value of a frozen item after dt seconds: 'cold' = no loss, 'warm' = station warm room, 'outside' = outdoors */
export function thawNext(value, base, dt, zone) {
  if (!(value > 0) || !(base > 0) || zone === 'cold' || zone === 'ship') return value;
  const rate = zone === 'warm' ? THAW_WARM : THAW_OUTSIDE;
  return Math.max(1, value - base * rate * dt);
}
/** true when a tracked art item just took damage or vanished from the floor (=> alarm) */
export function artBumped(prev, cur) {
  if (!prev) return false;
  if (cur == null) return prev.world === true;
  return cur.value < prev.value - 0.5;
}
/** which rail position (0 | 1) a sliding shelf is at after `step` shifts, starting from `at0` */
export const shelfAt = (at0, step) => ((at0 | 0) + (step | 0)) & 1;
/** true when the shelf would land on somebody: players = [{x,z,y}], dest = { x, z, hw, hd } */
export function shelfBlocked(dest, players, margin = 0.9) {
  return players.some((p) => Math.abs(p.x - dest.x) < dest.hw + margin && Math.abs(p.z - dest.z) < dest.hd + margin);
}
/** room-type zone for a frozen item: 'cold' | 'warm' (station rooms are warm unless listed cold) */
export function zoneOf(roomType, coldRooms) { return !roomType || coldRooms.includes(roomType) ? 'cold' : 'warm'; }   // corridors (null) are cold too
