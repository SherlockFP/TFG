// Shared CRAFTING COMPONENT contract (wave 1). Components are small inventory items used by crafting recipes,
// facility systems (fuse boxes, generators), spells and upgrades. They sell for little; their value is what you
// can make with them. Registered at import time so every module can spawn them by id.
// Owned by the crafting module (src/game/crafting.js) - other modules only read COMPONENT_IDS / spawn by id.
import { registerItem, ITEMS } from './items.js';

const C = (id, name, value, weight, extra = {}) => ({ id, name, kind: 'component', value, weight, hands: 1, component: true, ...extra });
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
