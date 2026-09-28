// Shared CRAFTING COMPONENT contract (wave 1). Components are small inventory items used by crafting recipes,
// facility systems (fuse boxes, generators), spells and upgrades. They sell for little; their value is what you
// can make with them. Registered at import time so every module can spawn them by id.
// Owned by the crafting module (src/game/crafting.js) - other modules only read COMPONENT_IDS / spawn by id
// (or call game.crafting.dropComponents(pos, kind, n) on the host).
import { registerItem, ITEMS } from './items.js';

const C = (id, name, value, weight, extra = {}) => ({ id, name, kind: 'component', value, weight, hands: 1, component: true, tip: 'Crafting component. Use it at the ship workbench.', ...extra });
export const COMPONENTS = {
  comp_scrapmetal: C('comp_scrapmetal', 'Scrap Metal', [3, 6], 3),
  comp_wood:       C('comp_wood', 'Wood Planks', [2, 4], 4),
  comp_cable:      C('comp_cable', 'Copper Cable', [4, 8], 1),
  comp_battery:    C('comp_battery', 'Battery Cell', [6, 12], 1),
  comp_fuse:       C('comp_fuse', 'Fuse', [5, 10], 0.5),
  comp_circuit:    C('comp_circuit', 'Circuit Board', [8, 16], 1),
  comp_sensor:     C('comp_sensor', 'Sensor', [10, 20], 1),
  comp_fuel:       C('comp_fuel', 'Fuel Canister', [8, 14], 6),
  comp_coolant:    C('comp_coolant', 'Coolant', [8, 14], 3),
  comp_chem:       C('comp_chem', 'Chemicals', [6, 12], 2, { fragile: 0.3 }),
  comp_cloth:      C('comp_cloth', 'Cloth', [2, 4], 0.5),
  comp_crystal:    C('comp_crystal', 'Data Crystal', [20, 40], 1, { tier: 'rare' }),
  comp_ecto:       C('comp_ecto', 'Ectoplasm', [25, 45], 1, { tier: 'epic' }),
  comp_accesscard: C('comp_accesscard', 'Access Card', [5, 5], 0.2, { keyItem: true }),
};
export const COMPONENT_IDS = Object.keys(COMPONENTS);
export const isComponent = (id) => !!COMPONENTS[id] || ITEMS[id]?.kind === 'component';

for (const def of Object.values(COMPONENTS)) if (!ITEMS[def.id]) registerItem(def);

// ---------------------------------------------------------------------------------------------- categories / meta
/** Family of a component: what "kind" of drop table it belongs to. */
export const COMPONENT_CAT = {
  comp_scrapmetal: 'metal', comp_wood: 'wood', comp_cable: 'electronic', comp_battery: 'electronic', comp_fuse: 'electronic',
  comp_circuit: 'electronic', comp_sensor: 'electronic', comp_fuel: 'metal', comp_coolant: 'organic', comp_chem: 'organic',
  comp_cloth: 'organic', comp_crystal: 'arcane', comp_ecto: 'arcane', comp_accesscard: 'electronic',
};
/** Accent colour per component (UI chips, particles). */
export const COMPONENT_COLOR = {
  comp_scrapmetal: '#9aa0a4', comp_wood: '#c09060', comp_cable: '#e08a48', comp_battery: '#5ad07a', comp_fuse: '#e8b84a',
  comp_circuit: '#3fbf8a', comp_sensor: '#7fb8ff', comp_fuel: '#e0503a', comp_coolant: '#6ad8ff', comp_chem: '#c850ff',
  comp_cloth: '#c8b898', comp_crystal: '#60e8ff', comp_ecto: '#60ffa8', comp_accesscard: '#5a90ff',
};

// ---------------------------------------------------------------------------------------------- drop tables
// [id, weight] tables. `dropComponents(pos, kind, n)` (trees / rocks / creatures) and the facility spawner use them.
export const KIND_TABLES = {
  wood:       [['comp_wood', 78], ['comp_cloth', 10], ['comp_scrapmetal', 5], ['comp_chem', 4], ['comp_fuel', 3]],
  metal:      [['comp_scrapmetal', 58], ['comp_cable', 14], ['comp_fuse', 8], ['comp_fuel', 8], ['comp_battery', 7], ['comp_crystal', 3], ['comp_coolant', 2]],
  electronic: [['comp_circuit', 28], ['comp_cable', 26], ['comp_battery', 18], ['comp_sensor', 11], ['comp_fuse', 11], ['comp_crystal', 4], ['comp_accesscard', 2]],
  organic:    [['comp_chem', 32], ['comp_cloth', 32], ['comp_coolant', 10], ['comp_wood', 8], ['comp_ecto', 4], ['comp_sensor', 2], ['comp_crystal', 1]],
  arcane:     [['comp_ecto', 38], ['comp_crystal', 32], ['comp_chem', 16], ['comp_cloth', 10], ['comp_sensor', 4]],
};
/** Facility spawns: weights by interior theme (server farm -> circuits/cables, factory -> metal/fuel, hospital -> chem/cloth ...). */
export const THEME_TABLES = {
  serverfarm: [['comp_circuit', 24], ['comp_cable', 22], ['comp_battery', 12], ['comp_sensor', 10], ['comp_coolant', 9], ['comp_fuse', 8], ['comp_scrapmetal', 8], ['comp_crystal', 5], ['comp_accesscard', 2]],
  factory:    [['comp_scrapmetal', 30], ['comp_fuel', 16], ['comp_cable', 12], ['comp_fuse', 12], ['comp_battery', 10], ['comp_coolant', 8], ['comp_circuit', 6], ['comp_crystal', 2], ['comp_sensor', 2], ['comp_chem', 2]],
  hospital:   [['comp_chem', 28], ['comp_cloth', 24], ['comp_coolant', 10], ['comp_sensor', 9], ['comp_battery', 8], ['comp_cable', 6], ['comp_ecto', 4], ['comp_circuit', 5], ['comp_crystal', 3], ['comp_fuse', 3]],
  mansion:    [['comp_wood', 24], ['comp_cloth', 24], ['comp_chem', 10], ['comp_cable', 10], ['comp_scrapmetal', 8], ['comp_ecto', 6], ['comp_crystal', 4], ['comp_battery', 6], ['comp_fuse', 4], ['comp_circuit', 4]],
  mineshaft:  [['comp_scrapmetal', 28], ['comp_fuel', 16], ['comp_wood', 16], ['comp_battery', 10], ['comp_cable', 8], ['comp_crystal', 7], ['comp_fuse', 8], ['comp_chem', 4], ['comp_coolant', 3]],
  office:     [['comp_cable', 22], ['comp_circuit', 16], ['comp_cloth', 14], ['comp_battery', 14], ['comp_fuse', 10], ['comp_sensor', 8], ['comp_scrapmetal', 8], ['comp_accesscard', 4], ['comp_crystal', 3], ['comp_chem', 1]],
  backrooms:  [['comp_cloth', 26], ['comp_wood', 18], ['comp_chem', 14], ['comp_ecto', 8], ['comp_cable', 10], ['comp_battery', 8], ['comp_fuse', 6], ['comp_scrapmetal', 5], ['comp_crystal', 5]],
  sewer:      [['comp_chem', 24], ['comp_scrapmetal', 20], ['comp_coolant', 14], ['comp_cloth', 12], ['comp_fuel', 8], ['comp_ecto', 5], ['comp_cable', 8], ['comp_battery', 4], ['comp_crystal', 3], ['comp_fuse', 2]],
};
/** How a killed creature is "flavoured" (which KIND_TABLES row it drops from). Unknown creatures use 'random' (= the theme table). */
export const CREATURE_FLAVOUR = {
  scuttler: 'electronic', yoinker: 'organic', crawler: 'organic', lurker: 'arcane', mannequin: 'wood', sludge: 'organic', jester: 'metal',
  spider: 'organic', leech: 'organic', screamer: 'arcane', hound: 'organic', giant: 'arcane', sandkefal: 'organic', turret: 'metal', mine: 'metal',
  mimicdoor: 'wood', mimic: 'random', moderator: 'electronic', support: 'electronic', ticketswarm: 'electronic', editor: 'electronic',
  tamagotchi: 'electronic', stalker: 'arcane', clickbait: 'electronic', replyguy: 'electronic', foreman: 'metal',
};

/** Weighted pick from a [id, weight] table with anything that has next() (src/core/rng.js RNG). */
export function pickWeighted(rng, table) {
  let tot = 0;
  for (const e of table) tot += e[1];
  let r = rng.next() * tot;
  for (const e of table) { r -= e[1]; if (r <= 0) return e[0]; }
  return table[table.length - 1][0];
}
/** Table for a drop kind ('wood' | 'metal' | 'electronic' | 'organic' | 'arcane' | 'random'); 'random' / unknown use the theme table. */
export function tableFor(kind, theme) {
  return KIND_TABLES[kind] || THEME_TABLES[theme] || THEME_TABLES.factory;
}
