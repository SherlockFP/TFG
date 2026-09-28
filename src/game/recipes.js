// CRAFTING RECIPES (wave 1). Pure data + helpers, no DOM / game access (node-testable).
//   RECIPES              raw table (inputs may name ids that do not exist yet: other modules' items)
//   resolveRecipes()     -> recipes whose output AND inputs exist in ITEMS right now (dynamic ids resolved, others hidden)
//   tierOdds / rollCraftTier   crafted result tiers (luck shifts weight upwards, see game/tiers.js)
//   UPGRADE / upgradeInfo      weapon tier upgrades (components + credits, success chance, failure keeps the item)
//   BLUEPRINTS           advanced recipes unlocked by ANALYZING strange items / big creature drops (profile.blueprints)
// Crafted items that only this module needs (craft_* ids) are registered here at import time.
import { ITEMS, registerItem, itemDef } from './items.js';
import { TIERS, TIER_ORDER, tierIndex } from './tiers.js';
import './components.js';

// ------------------------------------------------------------------------------------------------ crafted items
const CR = (id, name, kind, weight, extra = {}) => { if (!ITEMS[id]) registerItem({ id, name, kind, weight, hands: 1, crafted: true, ...extra }); };
CR('craft_batterypack', 'Battery Pack', 'consumable', 1, { tip: 'LMB: recharge every battery item you carry, then it is used up.' });
CR('craft_decoy', 'Noise Decoy', 'tool', 2, { throwable: true, tip: 'LMB: throw it. It blares noise for 12 s and drags creatures away from you.' });
CR('craft_floodlight', 'Portable Floodlight', 'tool', 6, { battery: 420, glow: { color: 0xfff4d8, intensity: 2.8, distance: 18 }, tip: 'LMB toggles the lamp. Charge it on the ship.' });
CR('craft_lantern', 'Ecto Lantern', 'tool', 3, { battery: 900, glow: { color: 0x70ffd0, intensity: 3.0, distance: 20 }, tip: 'LMB toggles the eerie lamp. Long battery life.' });
CR('craft_gasmask', 'Gas Mask', 'tool', 1, { tip: 'LMB: put on / take off. While worn you are immune to toxic gas.' });
CR('craft_trap', 'Bear Trap', 'tool', 5, { tip: 'LMB: set it on the floor. Roots and hurts the first creature that steps on it.' });
CR('craft_molotov', 'Molotov', 'consumable', 2, { throwable: true, tip: 'LMB: throw. Bursts into flames that burn creatures for 6 s.' });
CR('craft_emp', 'EMP Charge', 'consumable', 3, { throwable: true, tip: 'LMB: throw. Shuts down turrets, mines and machines for 20 s.' });
CR('craft_cryo', 'Cryo Grenade', 'consumable', 3, { throwable: true, tip: 'LMB: throw. Freezes creatures in the blast for 5 s. Silent.' });
CR('craft_traumakit', 'Trauma Kit', 'consumable', 3, { heal: 100, tip: 'LMB: heal 100 HP.' });
CR('craft_nailbat', 'Nail Bat', 'weapon', 6, { dmg: 30, cd: 0.62, reach: 2.3, rarity: 'uncommon' });

// ------------------------------------------------------------------------------------------------ blueprints
/** id -> { name, desc, from: which item unlocks it } (profile.blueprints[id] = timestamp) */
export const BLUEPRINTS = {
  bp_emp: { name: 'EMP Charge', desc: 'A grenade that kills machines: turrets, mines, bots.', from: 'Black Box', icon: '⚡' },
  bp_cards: { name: 'Access Card Copy', desc: 'Duplicate a card in the fabricator.', from: 'Broken AI Core', icon: '🪪' },
  bp_binding: { name: 'Skillbook Binding', desc: 'Bind crystal and ectoplasm into a skillbook.', from: 'Unknown Egg', icon: '📖' },
  bp_hauler: { name: 'Hauler Frame', desc: 'A huge backpack frame that reshapes how much you carry.', from: 'The Watch', icon: '🎒' },
  bp_masterwork: { name: 'Masterwork Upgrades', desc: 'Weapon upgrades beyond Epic (Legendary and Mythic).', from: 'a boss / apex creature drop', icon: '🔨' },
};
export const BLUEPRINT_IDS = Object.keys(BLUEPRINTS);

// ------------------------------------------------------------------------------------------------ dynamic outputs
// Other agents register bags / armor / ammo / skillbooks / bats later; these finders resolve them at runtime.
const ids = () => Object.keys(ITEMS);
const firstByRe = (re, filter = () => true) => ids().find((id) => re.test(id) && filter(ITEMS[id]));
const isAmmo = (d) => d.kind === 'ammo' || d.ammoType != null || d.kind === 'consumable' || d.kind === 'component';
export const finders = {
  rounds: () => firstByRe(/^(rounds|ammo_rounds|pistol_ammo|ammo_pistol|bullets|ammo_bullets|ammo_9mm)$/) || firstByRe(/(round|bullet)/, (d) => d.kind === 'ammo' || isAmmo(d)),
  nails: () => firstByRe(/^(nails|ammo_nails|nail_ammo|nailgun_ammo)$/) || firstByRe(/nail/, (d) => d.kind === 'ammo'),
  bolts: () => firstByRe(/^(crossbow_bolts|ammo_bolts|bolts_ammo|arrows|ammo_arrows)$/) || firstByRe(/(bolts|arrows)$/, (d) => d.kind === 'ammo'),
  armor: () => firstByRe(/(duct|scrap_?vest|light_?vest|padded|armor_?light|vest_?light)/, (d) => /armor|body|vest/.test(d.kind + (d.slot || ''))) || ids().filter((id) => ITEMS[id].kind === 'armor' || ITEMS[id].slot === 'armor').sort((a, b) => (ITEMS[a].price || 0) - (ITEMS[b].price || 0))[0],
  fieldpack: () => firstByRe(/field.?pack/i) || ids().find((id) => /field.?pack/i.test(ITEMS[id].name || '')),
  hauler: () => firstByRe(/hauler/i) || ids().find((id) => /hauler/i.test(ITEMS[id].name || '')),
  bat: () => firstByRe(/(^|_)(bat|baseballbat|woodbat)$/i, (d) => d.kind === 'weapon'),
  nailbat: () => (ITEMS.nailbat ? 'nailbat' : 'craft_nailbat'),
  skillbook: () => ids().filter((id) => id.startsWith('skillbook_')),
};

// ------------------------------------------------------------------------------------------------ recipes
// in: [[itemId | () => id | null, count], ...]; out: item id | () => id (null hides) ; tier: [min, max] tier the result can roll, or null
// bp: blueprint required (null = always known); time: seconds of the crafting progress bar; cat: filter tab.
export const CATS = ['survival', 'combat', 'tools', 'gear', 'arcane'];
const T_BASIC = ['common', 'rare'], T_GOOD = ['common', 'epic'], T_ADV = ['uncommon', 'epic'], T_TOP = ['rare', 'legendary'];
export const RECIPES = [
  // ---- survival
  { id: 'medkit', name: 'Medkit', cat: 'survival', out: 'medkit', n: 1, in: [['comp_cloth', 2], ['comp_chem', 1]], tier: T_BASIC, time: 1.6, desc: 'Field dressings and antiseptic. Heals 60 HP.' },
  { id: 'traumakit', name: 'Trauma Kit', cat: 'survival', out: 'craft_traumakit', n: 1, in: [['medkit', 1], ['comp_chem', 1], ['comp_cloth', 2]], tier: T_GOOD, time: 2.2, desc: 'A medkit with the good stuff. Heals 100 HP.' },
  { id: 'gasmask', name: 'Gas Mask', cat: 'survival', out: 'craft_gasmask', n: 1, in: [['comp_cloth', 2], ['comp_chem', 1], ['comp_scrapmetal', 1]], tier: T_BASIC, time: 2, desc: 'Wear it to become immune to toxic gas. (gasProof)' },
  { id: 'glowsticks', name: 'Glowstick Bundle', cat: 'survival', out: 'glowstick', n: 3, in: [['comp_chem', 1], ['comp_cloth', 1]], tier: null, time: 1.2, desc: 'Three glowsticks. Mark your route, light a corner.' },
  { id: 'batterypack', name: 'Battery Pack', cat: 'survival', out: 'craft_batterypack', n: 1, in: [['comp_battery', 2], ['comp_cable', 1]], tier: T_BASIC, time: 1.4, desc: 'Recharges every battery item you carry, anywhere.' },
  { id: 'armor', name: 'Duct-Tape Armor', cat: 'gear', out: () => finders.armor(), n: 1, in: [['comp_cloth', 4], ['comp_scrapmetal', 2]], tier: T_GOOD, time: 2.4, desc: 'Cloth, scrap and a truly irresponsible amount of tape.' },
  // ---- combat
  { id: 'stungrenade', name: 'Stun Grenade', cat: 'combat', out: 'stungrenade', n: 1, in: [['comp_battery', 1], ['comp_circuit', 1], ['comp_scrapmetal', 1]], tier: T_BASIC, time: 1.8, desc: 'Flash and bang. Stuns creatures for 5 s.' },
  { id: 'cryo', name: 'Cryo Grenade', cat: 'combat', out: 'craft_cryo', n: 1, in: [['comp_coolant', 2], ['comp_scrapmetal', 1]], tier: T_BASIC, time: 1.8, desc: 'Silent blast of cold. Freezes creatures in 5 m for 5 s.' },
  { id: 'molotov', name: 'Molotov', cat: 'combat', out: 'craft_molotov', n: 2, in: [['comp_fuel', 1], ['comp_cloth', 1]], tier: T_BASIC, time: 1.5, desc: 'Two firebombs. Flames burn creatures for 6 s.' },
  { id: 'trap', name: 'Bear Trap', cat: 'combat', out: 'craft_trap', n: 1, in: [['comp_scrapmetal', 4], ['comp_cable', 1]], tier: T_BASIC, time: 2.2, desc: 'Roots the first creature that steps on it for 6 s.' },
  { id: 'decoy', name: 'Noise Decoy', cat: 'combat', out: 'craft_decoy', n: 1, in: [['comp_battery', 1], ['comp_circuit', 1], ['comp_scrapmetal', 1]], tier: T_BASIC, time: 1.8, desc: 'Throw it: 12 s of noise that pulls creatures away from you.' },
  { id: 'emp', name: 'EMP Charge', cat: 'combat', out: 'craft_emp', n: 1, in: [['comp_circuit', 2], ['comp_battery', 2], ['comp_crystal', 1]], tier: T_ADV, time: 2.6, bp: 'bp_emp', desc: 'Shuts down turrets, mines and machines for 20 s.' },
  { id: 'nailbat', name: 'Nail Bat', cat: 'combat', out: () => finders.nailbat(), n: 1, in: [[() => finders.bat(), 1], ['comp_scrapmetal', 2]], tier: T_GOOD, time: 2.2, desc: 'A bat with opinions. Needs a bat and some nails.' },
  { id: 'shells', name: 'Shotgun Shells', cat: 'combat', out: 'shells', n: 3, in: [['comp_scrapmetal', 1], ['comp_chem', 1]], tier: null, time: 1.1, desc: 'Three shells.' },
  { id: 'rounds', name: 'Rounds', cat: 'combat', out: () => finders.rounds(), n: 3, in: [['comp_scrapmetal', 1], ['comp_chem', 1]], tier: null, time: 1.1, desc: 'Three boxes of rounds.' },
  { id: 'nails', name: 'Nails', cat: 'combat', out: () => finders.nails(), n: 3, in: [['comp_scrapmetal', 1]], tier: null, time: 0.9, desc: 'Three magazines of nail-gun ammunition.' },
  { id: 'bolts', name: 'Bolts', cat: 'combat', out: () => finders.bolts(), n: 3, in: [['comp_scrapmetal', 1], ['comp_wood', 1]], tier: null, time: 1, desc: 'Three quivers of crossbow bolts.' },
  // ---- tools
  { id: 'lockpick', name: 'Lockpicker', cat: 'tools', out: 'lockpick', n: 1, in: [['comp_scrapmetal', 2], ['comp_cable', 1]], tier: T_BASIC, time: 1.5, desc: 'Opens locked doors and crates (3 charges).' },
  { id: 'fuse', name: 'Fuse', cat: 'tools', out: 'comp_fuse', n: 2, in: [['comp_scrapmetal', 1], ['comp_cable', 1]], tier: null, time: 1, desc: 'Two fuses for blown fuse boxes and generators.' },
  { id: 'cardcopy', name: 'Access Card Copy', cat: 'tools', out: 'comp_accesscard', n: 2, in: [['comp_accesscard', 1], ['comp_circuit', 1]], tier: null, time: 2, bp: 'bp_cards', desc: 'Clone a card in the fabricator: 1 card in, 2 out.' },
  { id: 'floodlight', name: 'Portable Floodlight', cat: 'tools', out: 'craft_floodlight', n: 1, in: [['comp_battery', 2], ['comp_circuit', 1], ['comp_scrapmetal', 2]], tier: T_BASIC, time: 2.2, desc: 'A hand-held sun. LMB toggles it.' },
  { id: 'proflash', name: 'Pro Flashlight', cat: 'tools', out: 'proflash', n: 1, in: [['flashlight', 1], ['comp_circuit', 1], ['comp_battery', 1], ['comp_crystal', 1]], tier: T_ADV, time: 2.4, desc: 'Upgrade a flashlight: brighter, longer, more battery.' },
  { id: 'booster', name: 'Signal Booster', cat: 'tools', out: 'booster', n: 1, in: [['comp_sensor', 1], ['comp_circuit', 1], ['comp_battery', 1]], tier: T_BASIC, time: 1.8, desc: 'Pings nearby scrap and creatures through walls.' },
  { id: 'adblock', name: 'Adblock Spray', cat: 'tools', out: 'adblock', n: 1, in: [['comp_chem', 2], ['comp_cable', 1], ['comp_scrapmetal', 1]], tier: T_BASIC, time: 1.6, desc: 'Melts spam, pop-ups and reply guys.' },
  // ---- gear (bags)
  { id: 'beltbag', name: 'Belt Bag', cat: 'gear', out: 'beltbag', n: 1, in: [['comp_cloth', 3], ['comp_cable', 1], ['comp_scrapmetal', 1]], tier: T_GOOD, time: 2, desc: 'Stash small scrap on your belt.' },
  { id: 'fieldpack', name: 'Field Pack', cat: 'gear', out: () => finders.fieldpack(), n: 1, in: [['comp_cloth', 6], ['comp_cable', 2], ['comp_scrapmetal', 2]], credits: 30, tier: T_GOOD, time: 2.8, desc: 'A proper backpack. More grid, more loot.' },
  { id: 'hauler', name: 'Hauler Frame', cat: 'gear', out: () => finders.hauler(), n: 1, in: [['comp_cloth', 8], ['comp_scrapmetal', 6], ['comp_circuit', 2]], credits: 120, tier: T_ADV, time: 3.2, bp: 'bp_hauler', desc: 'An exo-frame pack for serious haulers.' },
  // ---- arcane
  { id: 'lantern', name: 'Ecto Lantern', cat: 'arcane', out: 'craft_lantern', n: 1, in: [['comp_ecto', 1], ['comp_crystal', 1], ['comp_cable', 1], ['comp_battery', 1]], tier: T_TOP, time: 3, desc: 'A lantern powered by something that watches back.' },
  { id: 'skillbook', name: 'Skillbook Binding', cat: 'arcane', out: () => finders.skillbook(), n: 1, in: [['comp_crystal', 1], ['comp_ecto', 1], ['comp_cloth', 2]], credits: 60, tier: T_TOP, time: 3.4, bp: 'bp_binding', desc: 'Bind a random skillbook from crystal and ectoplasm.' },
];

/** Weapon upgrade special recipe (shown in the panel's UPGRADE tab; listed in the terminal). */
export const UPGRADE = {
  uncommon:  { in: [['comp_scrapmetal', 2], ['comp_cable', 1]], credits: 40, chance: 0.95 },
  rare:      { in: [['comp_scrapmetal', 3], ['comp_circuit', 1], ['comp_battery', 1]], credits: 90, chance: 0.85 },
  epic:      { in: [['comp_circuit', 2], ['comp_sensor', 1], ['comp_crystal', 1]], credits: 220, chance: 0.65 },
  legendary: { in: [['comp_crystal', 2], ['comp_ecto', 1], ['comp_circuit', 2]], credits: 520, chance: 0.4, bp: 'bp_masterwork' },
  mythic:    { in: [['comp_crystal', 3], ['comp_ecto', 3], ['comp_sensor', 2]], credits: 1100, chance: 0.2, bp: 'bp_masterwork' },
};
/** Upgrade requirements for taking an item from `fromTier` to the next tier (null at the top). */
export function upgradeInfo(fromTier, luck = 0) {
  const i = tierIndex(fromTier);
  if (i >= TIER_ORDER.length - 1) return null;
  const to = TIER_ORDER[i + 1];
  const u = UPGRADE[to];
  return { from: fromTier, to, in: u.in, credits: u.credits, bp: u.bp || null, chance: Math.min(0.98, u.chance + Math.max(0, luck) * 0.12) };
}
export const isUpgradable = (def) => !!def && def.kind === 'weapon';

// ------------------------------------------------------------------------------------------------ resolution
const resolveId = (v) => (typeof v === 'function' ? v() : v);
/**
 * Resolve every recipe against the items that exist right now. `hidden` recipes (an output or an input id is not
 * registered) are omitted unless `withHidden`. Recipes with a list output (skillbook) resolve `outs` to the id list.
 */
export function resolveRecipes({ withHidden = false } = {}) {
  const out = [];
  for (const r of RECIPES) {
    let o = resolveId(r.out);
    let outs = null;
    if (Array.isArray(o)) { outs = o.filter((id) => ITEMS[id]); o = outs[0] || null; }
    const inputs = [];
    let ok = !!o && !!ITEMS[o];
    for (const [v, n] of r.in) {
      const id = resolveId(v);
      if (!id || !ITEMS[id]) ok = false;
      inputs.push([id, n]);
    }
    if (!ok && !withHidden) continue;
    out.push({ id: r.id, name: r.name, cat: r.cat, out: o, outs, n: r.n, in: inputs, credits: r.credits || 0, bp: r.bp || null, tier: r.tier || null, time: r.time || 1.5, desc: r.desc, hidden: !ok });
  }
  return out;
}
export function recipeById(id) { return resolveRecipes({ withHidden: true }).find((r) => r.id === id) || null; }

// ------------------------------------------------------------------------------------------------ tier odds
/** Same weights as tiers.js rollTier: TIERS[t].weight * (1 + luck*2.5)^i over the allowed [min, max] range. Returns [{tier, p}]. */
export function tierOdds(range, luck = 0) {
  if (!range) return [];
  const lo = tierIndex(range[0]), hi = tierIndex(range[1]);
  const idsT = TIER_ORDER.slice(lo, hi + 1);
  const ws = idsT.map((id, i) => TIERS[id].weight * Math.pow(1 + Math.max(0, luck) * 2.5, i));
  const tot = ws.reduce((a, b) => a + b, 0);
  return idsT.map((id, i) => ({ tier: id, p: ws[i] / tot }));
}
export { itemDef };
