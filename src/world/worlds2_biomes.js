// WAVE 3 worlds2: registers the Soviet panel district and the twin-sun desert into the biome decor registry (outdoor_biomes.js
// registerDecor) and, through worlds2_data.js, into BIOMES + the two fixed moons. Imported by game/worlds2.js and terrain.js-independent:
// the terrain only needs BIOMES[..].decor to resolve to a builder, which happens the moment this module is evaluated.
import { registerDecor } from './outdoor_biomes.js';
import { WORLDS2_BIOME_IDS } from './worlds2_data.js';
import { buildSoviet } from './worlds2_soviet.js';
import { buildTwinSun } from './worlds2_twinsun.js';

registerDecor('soviet', buildSoviet);
registerDecor('twinsun', buildTwinSun);
export { WORLDS2_BIOME_IDS };
