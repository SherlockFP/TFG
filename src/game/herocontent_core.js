// HERO CONTENT (wave 8, docs/wave8/herocontent.md) - pure data + registration (no THREE, no DOM): themed scrap tables for the four labyrinth
// interiors (metro, greenhouse, prison, tower) that used to fall back to the factory mix, and the twelve new items they own.
// Models live in models/artpass.js (ids `hc_*`); game/herocontent.js hooks them into the mod item-model registry.
import { ITEMS, SCRAP_TABLE, BIG_TABLES, registerItem } from './items.js';
import { addTranslations } from '../core/i18n.js';
import { TR, RU } from './herocontent_text.js';

addTranslations(TR, 'tr');
addTranslations(RU, 'ru');

/** the twelve new items: `sig` = interior theme that owns them (value = credits, same scale as the rest of items.js) */
export const ITEM_DEFS = [
  { id: 'hc_cardreader', sig: 'metro', name: 'Transit Card Reader', kind: 'scrap', value: [28, 58], weight: 4, hands: 1, tip: 'Still says INSUFFICIENT FUNDS. It has said that since the last train.' },
  { id: 'hc_railspike', sig: 'metro', name: 'Rail Spike', kind: 'scrap', value: [12, 26], weight: 5, hands: 1, tip: 'Heavy iron with a chalk mark. Somebody counted these.' },
  { id: 'hc_lantern', sig: 'metro', name: "Conductor's Lantern", kind: 'scrap', value: [58, 108], weight: 5, hands: 1, fragile: 0.6, tip: 'The flame is cold. It points down the tunnel, toward the next stop.' },
  { id: 'hc_lostbag', sig: 'metro', name: 'Lost-and-Found Bag', kind: 'scrap', value: [18, 90], weight: 9, hands: 1, tip: 'Unclaimed for 90 days, unclaimed for 9 years. You will not ask what is inside.' },
  { id: 'hc_growlamp', sig: 'greenhouse', name: 'Grow Lamp', kind: 'scrap', value: [44, 92], weight: 6, hands: 1, fragile: 0.5, tip: 'Purple light, zero plants. It is still working overtime.' },
  { id: 'hc_seedvault', sig: 'greenhouse', name: 'Seed Vault Canister', kind: 'scrap', value: [78, 142], weight: 10, hands: 1, tip: 'The last seeds of a deleted forum. Sealed, labelled, very heavy for its size.' },
  { id: 'hc_bonsai', sig: 'greenhouse', name: 'Bonsai', kind: 'scrap', value: [58, 116], weight: 6, hands: 1, fragile: 0.8, tip: 'Watered on schedule by nobody. It grows a little every time you look away.' },
  { id: 'hc_phone', sig: 'prison', name: 'Contraband Phone', kind: 'scrap', value: [34, 72], weight: 1, hands: 1, use: 'noise', useSound: 'phone_ring', noise: 0.45, tip: 'Taped, wrapped and smuggled. One bar, and every bar is a ban appeal.' },
  { id: 'hc_keyring', sig: 'prison', name: "Warden's Keyring", kind: 'scrap', value: [38, 78], weight: 2, hands: 1, use: 'noise', useSound: 'lockpick_click', noise: 0.3, tip: 'Every key opens a cell. None of them opens the door out.' },
  { id: 'hc_shield', sig: 'prison', name: 'Riot Shield', kind: 'scrap', value: [82, 146], weight: 14, hands: 2, tip: 'Scuffed by a thousand report buttons. Heavy, awkward, and worth carrying.' },
  { id: 'hc_elevdial', sig: 'tower', name: 'Brass Elevator Dial', kind: 'scrap', value: [72, 132], weight: 7, hands: 1, tip: 'The needle sits between two floors that no longer exist.' },
  { id: 'hc_nameplate', sig: 'tower', name: 'Executive Nameplate', kind: 'scrap', value: [50, 104], weight: 6, hands: 1, tip: 'Reads VICE PRESIDENT OF SYNERGY. Whoever it was, they left in a hurry.' },
];
export const ITEM_IDS = Object.freeze(ITEM_DEFS.map((d) => d.id));

/**
 * The themed tables: SIGNATURE = the 8-10 entries that make the theme (new items first, then the fitting existing models), FILLER = the
 * general junk that keeps the mix like the other interiors. Average value is kept near the factory mix (~47-52 credits per item, the
 * economy sim's SCRAP_AVG) so the median quota count stays put (docs/wave8/econ8.md); only the flavour changes.
 */
export const SIGNATURE = {
  metro: [['hc_cardreader', 6], ['hc_railspike', 3], ['hc_lantern', 6], ['hc_lostbag', 7], ['pager', 4], ['flipphone', 5], ['headset', 5], ['stopsign', 2], ['cdspindle', 2]],
  greenhouse: [['hc_growlamp', 6], ['hc_seedvault', 2], ['hc_bonsai', 4], ['flask', 8], ['pot', 7], ['pickles', 6], ['bottles', 6], ['magnify', 4], ['perfume', 4], ['lamp', 3]],
  prison: [['hc_phone', 6], ['hc_keyring', 5], ['hc_shield', 3], ['flipphone', 5], ['pager', 4], ['stopsign', 3], ['skull', 5], ['teeth', 5], ['airhorn', 4], ['chainletter', 3]],
  tower: [['hc_elevdial', 4], ['hc_nameplate', 5], ['trophy', 3], ['liketrophy', 4], ['goldbar', 1], ['perfume', 3], ['register', 2], ['painting', 2], ['lamp', 2], ['bell', 3]],
};
export const FILLER = {
  metro: [['bolt', 3], ['axle', 5], ['cog', 2], ['canned', 4], ['mug', 6], ['bottles', 3], ['modem', 5], ['keyboard', 4], ['phone', 5], ['skull', 4], ['airhorn', 3], ['key', 3], ['captcha', 3], ['steering', 3], ['tv', 4], ['vhs', 1], ['lamp', 3], ['painting', 2]],
  greenhouse: [['canned', 6], ['mug', 6], ['duck', 5], ['figurine', 4], ['teeth', 3], ['skull', 3], ['hdd', 3], ['webcam', 3], ['bolt', 6], ['cog', 6], ['painting', 2], ['robot', 3], ['key', 3], ['ring', 1], ['phone', 3], ['tv', 2], ['motherboard', 3]],
  prison: [['canned', 5], ['mug', 5], ['bottles', 4], ['steering', 5], ['tv', 4], ['bolt', 5], ['axle', 4], ['cog', 4], ['key', 4], ['phone', 4], ['trophy', 4], ['headset', 4], ['flask', 3], ['clownhorn', 2], ['hdd', 3], ['magnify', 3], ['cdspindle', 3], ['lamp', 2]],
  tower: [['keyboard', 6], ['printer', 4], ['mug', 10], ['headset', 5], ['gamingchair', 2], ['phone', 7], ['magnify', 3], ['captcha', 3], ['figurine', 4], ['nftframe', 2], ['bottles', 5], ['playbutton', 1], ['ringlight', 3], ['key', 4], ['duck', 6], ['tv', 2], ['flipphone', 5], ['webcam', 3], ['floppies', 6], ['ring', 1], ['canned', 5], ['cdspindle', 5]],
};
export const HERO_THEMES = Object.freeze(Object.keys(SIGNATURE));

/**
 * BIG valuables (wave 8 night, docs/wave8/bossdress.md): kind 'big' physics props like vase / server (grabbed with LMB, so no 2-hand flag: the grab is already
 * two-handed and slow), eight themed ones; values sit on the existing scale (vase 90-170 ... statue 200-350) so the per-theme mean stays ~165-200.
 */
export const BIG_DEFS = [
  { id: 'hb_turnstile', name: 'Turnstile Gate', kind: 'big', value: [130, 210], weight: 85, hands: 0, fragile: 0.4, mass: 34, tip: 'Waist-high, tripod arms, one green light. It still counts everyone who ever passed.' },
  { id: 'hb_ticketkiosk', name: 'Ticket Kiosk', kind: 'big', value: [170, 270], weight: 110, hands: 0, fragile: 0.5, mass: 46, tip: 'Sells single rides to a station that was renamed. Change not given.' },
  { id: 'hb_planter', name: 'Giant Planter', kind: 'big', value: [100, 180], weight: 60, hands: 0, fragile: 0.9, mass: 22, tip: 'A cracked terracotta pot with a fern that outgrew its forum thread.' },
  { id: 'hb_terrarium', name: 'Seed Terrarium', kind: 'big', value: [150, 250], weight: 75, hands: 0, fragile: 1.0, mass: 26, tip: 'Glass on all sides, humid inside, faintly green. Handle it like it can hear you.' },
  { id: 'hb_locker', name: 'Evidence Locker', kind: 'big', value: [170, 280], weight: 120, hands: 0, fragile: 0.3, mass: 52, tip: 'Sealed with red tape and a stamp that says EXHIBIT A. There is no exhibit B.' },
  { id: 'hb_searchlight', name: 'Yard Searchlight', kind: 'big', value: [140, 230], weight: 80, hands: 0, fragile: 0.6, mass: 30, tip: 'It tracked every ban appeal across the yard. The lens is still warm.' },
  { id: 'hb_bust', name: "Founder's Bust", kind: 'big', value: [200, 320], weight: 95, hands: 0, fragile: 0.5, mass: 40, tip: 'Marble, stern and slightly too polished. The nameplate has been replaced four times.' },
  { id: 'hb_safe', name: 'Executive Safe', kind: 'big', value: [190, 300], weight: 140, hands: 0, fragile: 0.25, mass: 60, tip: 'Brass dial, heavy door, one bonus in it. It is not yours, and it is very heavy.' },
];
export const BIG_IDS = Object.freeze(BIG_DEFS.map((d) => d.id));
/** big-valuable tables per theme (falls back to the default BIG_TABLE without an entry): themed items first, then the existing bigs that fit */
export const BIG_SIGNATURE = {
  metro: [['hb_turnstile', 8], ['hb_ticketkiosk', 5], ['pctower', 4], ['vase', 4], ['amphora', 3], ['server', 3]],
  greenhouse: [['hb_planter', 8], ['hb_terrarium', 6], ['aquarium', 5], ['vase', 4], ['amphora', 3]],
  prison: [['hb_locker', 6], ['hb_searchlight', 6], ['server', 3], ['pctower', 4], ['statue', 2]],
  tower: [['hb_bust', 5], ['hb_safe', 4], ['pctower', 9], ['aquarium', 4], ['vase', 4]],
  influencer: [['vase', 8], ['aquarium', 6], ['hb_bust', 3], ['statue', 3], ['pctower', 3]],
  academy: [['pctower', 8], ['hb_bust', 3], ['hb_planter', 3], ['aquarium', 4], ['vase', 4]],
  museum: [['amphora', 8], ['vase', 6], ['statue', 5], ['hb_bust', 4], ['hb_terrarium', 2]],
  colddata: [['server', 10], ['cryptorig', 5], ['pctower', 8], ['hb_safe', 3]],
};
export const BIG_THEMES = Object.freeze(Object.keys(BIG_SIGNATURE));
export const MODEL_IDS = Object.freeze([...ITEM_IDS, ...BIG_IDS]);

/** merged [id, weight] table of a theme (duplicate ids are summed) */
export function heroTable(theme) {
  const m = new Map();
  for (const [id, w] of [...(SIGNATURE[theme] || []), ...(FILLER[theme] || [])]) m.set(id, (m.get(id) || 0) + w);
  return [...m];
}

/** register the items and set the four tables (idempotent; runs at import so every module that walks SCRAP_TABLE sees them) */
export function registerHeroContent(force = false) {
  for (const d of ITEM_DEFS) { const { sig, ...def } = d; if (force || !ITEMS[d.id]) registerItem(def); }
  for (const th of HERO_THEMES) SCRAP_TABLE[th] = heroTable(th);
  for (const d of BIG_DEFS) if (force || !ITEMS[d.id]) registerItem({ ...d });
  for (const th of BIG_THEMES) BIG_TABLES[th] = BIG_SIGNATURE[th].map((e) => [...e]);
}
registerHeroContent();
