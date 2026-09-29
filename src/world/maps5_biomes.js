// WAVE 4 maps5: registers the Estate 9 / Cold Storage biome decor builders (outdoor_biomes.js registerDecor) and, through maps5_data.js, the two biomes
// and fixed moons. Imported by game/maps5.js (so the moons exist on every peer before any run state is read) and by tests.
import './maps5_data.js';
import './maps5_estate.js';   // registerDecor('m5estate')
import './maps5_cold.js';     // registerDecor('m5cold')
export { ESTATE_MOON, COLD_MOON, MAPS5_BIOME_IDS } from './maps5_data.js';
