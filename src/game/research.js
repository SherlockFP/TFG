// RESEARCH (wave 1): the SELL / ANALYZE / KEEP decision. Pure data + helpers (node-testable).
//  - STRANGE items (Black Box, Broken AI Core, Unknown Egg, The Watch): sell for almost nothing, but ANALYZING them
//    at the workbench gives XP and permanently unlocks an advanced recipe (profile.blueprints).
//  - creature drops (kind 'drop') can be analysed too: XP + components; the big boss / apex drops unlock Masterwork upgrades.
//  - DISMANTLE: turns scrap into components with a deterministic table (kind / family / weight / value / theme).
import { ITEMS, registerItem, itemDef } from './items.js';
import './components.js';

// ------------------------------------------------------------------------------------------------ strange items
const STRANGE_DEF = (id, name, weight, value, extra) => ({ id, name, kind: 'scrap', weight, hands: 1, value, strange: true, tier: 'epic', ...extra });
export const STRANGE = {
  strange_blackbox: {
    def: STRANGE_DEF('strange_blackbox', 'Black Box', 6, [8, 20], { use: 'noise', useSound: 'ui_notify', noise: 0.35, tip: 'Sells for pennies. Something inside is still recording. ANALYZE it at the workbench.' }),
    xp: 180, bp: 'bp_emp', weight: 3,
    lore: 'FLIGHT RECORDER 0042. Last words: "the door was never a door". The tape ends mid-sentence, then starts again.',
  },
  strange_aicore: {
    def: STRANGE_DEF('strange_aicore', 'Broken AI Core', 9, [10, 26], { tip: 'Sells for pennies. It hums when nobody is looking. ANALYZE it at the workbench.' }),
    xp: 220, bp: 'bp_cards', weight: 2,
    lore: 'The core was still answering tickets: "How may I be of service? How may I be of service? How may I be of service?"',
  },
  strange_egg: {
    def: STRANGE_DEF('strange_egg', 'Unknown Egg', 3, [6, 16], { shake: { loud: 0.5 }, tier: 'legendary', tip: 'It twitches when you run. Sells for pennies. ANALYZE it at the workbench.' }),
    xp: 200, bp: 'bp_binding', weight: 3,
    lore: 'Shell is not calcium. Something inside taps back when you tap. It stopped when we stopped.',
  },
  strange_watch: {
    def: STRANGE_DEF('strange_watch', 'The Watch', 1, [12, 30], { cursed: true, tier: 'mythic', tip: 'The hands never agree. It whispers. Sells for pennies. ANALYZE it at the workbench.' }),
    xp: 260, bp: 'bp_hauler', weight: 2,
    lore: 'It runs backwards for whoever holds it, forwards for whoever watches. The engraving reads: "carry it all".',
  },
};
export const STRANGE_IDS = Object.keys(STRANGE);
for (const s of Object.values(STRANGE)) if (!ITEMS[s.def.id]) registerItem(s.def);

export const isStrange = (def) => !!def && (def.strange === true || STRANGE_IDS.includes(def.id));

// ------------------------------------------------------------------------------------------------ analysis
// creature drops -> [components recovered, blueprint]
const DROP_ANALYSIS = {
  drop_scuttler: { comps: [['comp_circuit', 1]] },
  drop_spider: { comps: [['comp_cloth', 2], ['comp_chem', 1]] },
  drop_crawler: { comps: [['comp_chem', 2], ['comp_scrapmetal', 1]] },
  drop_hound: { comps: [['comp_cloth', 1], ['comp_chem', 1], ['comp_sensor', 1]] },
  drop_lurker: { comps: [['comp_ecto', 1]], bp: 'bp_masterwork' },
  drop_giant: { comps: [['comp_crystal', 1], ['comp_ecto', 1]], bp: 'bp_masterwork' },
  foreman_hat: { comps: [['comp_scrapmetal', 3], ['comp_fuse', 1]], bp: 'bp_masterwork' },
  legacy_core: { comps: [['comp_circuit', 2], ['comp_crystal', 1]], bp: 'bp_masterwork' },
};
const avgValue = (def) => (Array.isArray(def?.value) ? (def.value[0] + def.value[1]) / 2 : Number(def?.value) || 0);

/** What analysing this item gives: { kind: 'strange'|'drop', xp, bp, comps, lore } or null when it cannot be analysed. */
export function analyzeInfo(itemId) {
  const def = itemDef(itemId);
  const s = STRANGE[itemId];
  if (s) return { kind: 'strange', xp: s.xp, bp: s.bp, comps: [], lore: s.lore, name: def.name };
  if (def.strange) return { kind: 'strange', xp: 150, bp: null, comps: [['comp_crystal', 1]], lore: 'Unclassified. Filed under: later.', name: def.name };
  if (def.kind === 'drop') {
    const d = DROP_ANALYSIS[itemId];
    const v = avgValue(def);
    const comps = d?.comps || [[v >= 100 ? 'comp_crystal' : 'comp_chem', 1]];
    return { kind: 'drop', xp: 20 + Math.round(v * 0.5), bp: d?.bp || null, comps, lore: 'Tissue sample logged. The Archive thanks you.', name: def.name };
  }
  return null;
}
/** Result of an analysis when the blueprint is already known: XP x0.6 plus a components refund. */
export const KNOWN_REFUND = [['comp_crystal', 2], ['comp_ecto', 1]];

// ------------------------------------------------------------------------------------------------ dismantling
const FAMILY_IDS = {
  metal: ['bolt', 'axle', 'cog', 'pot', 'steering', 'stopsign', 'trophy', 'liketrophy', 'bell', 'goldbar', 'airhorn', 'clownhorn', 'key', 'statue', 'mug', 'teeth', 'ring', 'pipe', 'shovel', 'machete', 'sledge', 'harpoon', 'ladder', 'spraypaint', 'lockpick'],
  electronic: ['modem', 'keyboard', 'motherboard', 'hdd', 'gpu', 'webcam', 'phone', 'flipphone', 'pager', 'printer', 'tv', 'headset', 'floppies', 'cdspindle', 'memecart', 'captcha', 'robot', 'pctower', 'cryptorig', 'server', 'ringlight', 'pocketpet', 'register', 'walkie', 'boombox', 'cryptocoin', 'nftframe', 'playbutton', 'flashlight', 'proflash', 'taser', 'jetpack', 'booster', 'inhaler', 'amphora'],
  chem: ['flask', 'bottles', 'pickles', 'canned', 'perfume', 'aquarium', 'duck', 'adblock', 'medkit', 'adrenaline', 'shells'],
  cloth: ['painting', 'gamingchair', 'lamp', 'vhs', 'animefig', 'figurine', 'vase', 'beltbag', 'suit'],
  arcane: ['chainletter', 'skull', 'usbidol'],
};
const FAMILY_OF = {};
for (const [fam, list] of Object.entries(FAMILY_IDS)) for (const id of list) FAMILY_OF[id] = fam;
// order of what each family yields (cycled up to n entries)
const PRIMARY = {
  metal: ['comp_scrapmetal', 'comp_scrapmetal', 'comp_cable', 'comp_fuse', 'comp_scrapmetal'],
  electronic: ['comp_circuit', 'comp_cable', 'comp_battery', 'comp_circuit', 'comp_sensor', 'comp_fuse'],
  chem: ['comp_chem', 'comp_chem', 'comp_coolant', 'comp_cloth', 'comp_chem'],
  cloth: ['comp_cloth', 'comp_cloth', 'comp_wood', 'comp_cable', 'comp_cloth'],
  arcane: ['comp_ecto', 'comp_crystal', 'comp_chem', 'comp_ecto'],
  drop: ['comp_chem', 'comp_cloth', 'comp_scrapmetal', 'comp_sensor'],
};
// one extra component when the yield is 3+ (the facility the ship last visited leaves its mark)
const THEME_BONUS = { serverfarm: 'comp_circuit', hospital: 'comp_chem', sewer: 'comp_coolant', mansion: 'comp_wood', office: 'comp_cable', mineshaft: 'comp_fuel', backrooms: 'comp_cloth', factory: 'comp_scrapmetal' };
// explicit overrides where the generic rules would be wrong
const DISMANTLE_TABLE = {
  reactor: [['comp_coolant', 3], ['comp_fuel', 2], ['comp_crystal', 2], ['comp_fuse', 2]],
  gpu: [['comp_circuit', 2], ['comp_coolant', 1], ['comp_crystal', 1]],
  cryptocoin: [['comp_crystal', 1]],
  usbidol: [['comp_crystal', 1], ['comp_circuit', 1]],
  chainletter: [['comp_ecto', 1]],
  skull: [['comp_ecto', 1], ['comp_chem', 1]],
  playbutton: [['comp_scrapmetal', 2], ['comp_crystal', 1]],
  goldbar: [['comp_scrapmetal', 3], ['comp_cable', 1]],
  ring: [['comp_crystal', 1]],
  flask: [['comp_chem', 2]],
  motherboard: [['comp_circuit', 2], ['comp_cable', 1]],
  hdd: [['comp_circuit', 1], ['comp_scrapmetal', 1]],
  battery: [['comp_battery', 1]],
};

/** Why an item can NOT be dismantled (null = it can). `it` is a WorldItem-like { type, def, soulbound }. */
export function dismantleBlock(it) {
  const def = it?.def || itemDef(it?.type);
  if (!it || !def) return 'Nothing there.';
  if (it.type === 'body') return 'Not that.';
  if (it.soulbound) return 'Soulbound gear cannot be dismantled.';
  if (def.kind === 'component' || def.component) return 'It is already a component.';
  if (isStrange(def)) return 'Too strange to take apart. ANALYZE it instead.';
  if (def.kind === 'fish') return 'That is a fish.';
  if (def.keyItem) return 'You might need that.';
  return null;
}

/** Deterministic yield [[componentId, n], ...] for an item type. value = instance value (falls back to the def average). */
export function dismantleYield(itemId, { value, theme } = {}) {
  if (DISMANTLE_TABLE[itemId]) return DISMANTLE_TABLE[itemId].map((e) => e.slice());
  const def = itemDef(itemId);
  const fam = FAMILY_OF[itemId] || (def.kind === 'drop' ? 'drop' : def.kind === 'big' ? 'electronic' : def.kind === 'weapon' || def.kind === 'tool' ? 'metal' : 'metal');
  const v = Number.isFinite(value) && value > 0 ? value : avgValue(def);
  let n = 1 + Math.floor((def.weight || 0) / 14) + Math.floor(v / 70);
  n = Math.max(1, Math.min(def.kind === 'big' ? 6 : 4, n));
  const list = PRIMARY[fam] || PRIMARY.metal;
  const map = new Map();
  for (let i = 0; i < n; i++) map.set(list[i % list.length], (map.get(list[i % list.length]) || 0) + 1);
  if (n >= 3 && THEME_BONUS[theme]) map.set(THEME_BONUS[theme], (map.get(THEME_BONUS[theme]) || 0) + 1);
  if (v >= 150 && (fam === 'electronic' || fam === 'arcane')) map.set('comp_crystal', (map.get('comp_crystal') || 0) + 1);
  return [...map.entries()];
}

// ------------------------------------------------------------------------------------------------ blueprint state (profile.blueprints)
export function ensureBlueprints(profile) {
  if (!profile) return {};
  if (!profile.blueprints || typeof profile.blueprints !== 'object' || Array.isArray(profile.blueprints)) profile.blueprints = {};
  return profile.blueprints;
}
export const hasBlueprint = (profile, id) => !id || !!profile?.blueprints?.[id];
/** Store a blueprint; returns true when it is NEW. */
export function unlockBlueprint(profile, id) {
  const b = ensureBlueprints(profile);
  if (!id || b[id]) return false;
  b[id] = Date.now();
  return true;
}
export const knownBlueprints = (profile) => Object.keys(profile?.blueprints || {}).filter((id) => id.startsWith('bp_'));
