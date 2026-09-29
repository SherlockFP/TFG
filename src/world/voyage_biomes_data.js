// VOYAGE (wave 4) planet biome DEFINITIONS: 8 new presets used by random voyages / uncharted signals. Data only (imports moons.js + the
// moongen tables), so the generator can roll them without loading world code; the decor builders live in world/voyage_world.js.
//   vycrys  Crystal Desert    pink dunes, glass spires that sing              vyfung  Fungal Swamp      giant glowcaps, spore haze, ponds
//   vysky   Sky Shards        low gravity (x0.5), floating rock, thin fog     vyacid  Acid Sea Shore    an acid sea sheet: wading in it burns
//   vystorm Storm Plateau     terraced mesas, lightning rods, permanent gale  vybone  Bone Field        ribcage arches, skulls, ash
//   vyneon  Neon Ruins        dead city + neon signs                          vyrust  Rust City         skeletal towers, girders, cranes
// Extra biome fields (all optional): gravity (player gravity multiplier), acid (flood sheet hurts), gale (sky flicker / lightning).
import { BIOMES } from '../game/moons.js';
import { BIOME_INTERIOR_BONUS, BIOME_ADJ, BIOME_DESC, WEATHER_POOL } from '../game/moongen.js';

export const VOYAGE_BIOME_IDS = ['vycrys', 'vyfung', 'vysky', 'vyacid', 'vystorm', 'vybone', 'vyneon', 'vyrust'];

BIOMES.vycrys = {
  name: 'Crystal Desert', ground: 'sand', ground2: 'red_sand', rock: 'rock', tint: 0xf2d4e4, pathTint: 0xd4a8c0, rockTint: 0xc0a0d0,
  sky: 0xb888c0, fog: 0xc8a0cc, fogDensity: 0.012, night: 0x0c0420, sun: 0xffe4f4, height: 12, rough: 0.7, dunes: 9,
  trees: 'rock_big', treeDensity: 0.06, treeTint: 0xc8a8e0, decor: 'vycrys', planet: 0xe088d0, fx: 'sparkle', noBushes: true, step: 'sand', waterColor: 0xc890ff,
  poi: ['ruined_wall', 'shipping_container', 'car_wreck', 'oil_drum_stack', 'ext:kst_skip_rocks', 'ext:barrier_jersey_broken'], landmarks: ['radio_tower', 'power_pylon'],
};
BIOMES.vyfung = {
  name: 'Fungal Swamp', ground: 'mud', ground2: 'grass_dry', rock: 'rock', tint: 0x8c6c9c, pathTint: 0x8a7a6a, rockTint: 0x6a5a78,
  sky: 0x24382c, fog: 0x2c4434, fogDensity: 0.028, night: 0x030a06, sun: 0xb8ffd0, height: 5, rough: 0.4, water: true,
  trees: 'dead_tree', treeDensity: 0.14, treeTint: 0x6a5a7a, decor: 'vyfung', planet: 0x58d0a0, fx: 'spores', noBushes: true, step: 'mud', waterColor: 0x58c8a0,
  poi: ['oil_drum_stack', 'ruined_wall', 'car_wreck', 'fence_segment', 'pallet', 'ext:psx_dumpster'], landmarks: ['ext:ind_liquid_reservoir_2', 'power_pylon'],
};
BIOMES.vysky = {
  name: 'Sky Shards', ground: 'grass_dry', ground2: 'rock', rock: 'rock', tint: 0xa8d0a8, pathTint: 0xb0a890, rockTint: 0xa8b0c0,
  sky: 0x78b0e4, fog: 0x9cc8e8, fogDensity: 0.007, night: 0x050a1c, sun: 0xfff8e0, height: 26, rough: 1.0, gravity: 0.5,
  trees: 'pine_tree', treeDensity: 0.1, treeTint: 0x90c090, decor: 'vysky', planet: 0x64a8ec, fx: 'sparkle', noBushes: true, step: 'gravel', waterColor: 0x80c8f0,
  poi: ['ruined_wall', 'radio_tower', 'fence_segment', 'lamp_post', 'ext:kk_solarpanel', 'ext:kst_skip_rocks'], landmarks: ['radio_tower', 'ext:kk_lights'],
};
BIOMES.vyacid = {
  name: 'Acid Sea Shore', ground: 'sand', ground2: 'dirt', rock: 'rock', tint: 0xc8c090, pathTint: 0xa8a070, rockTint: 0x8a9058,
  sky: 0x8a9c4c, fog: 0x8a9c44, fogDensity: 0.02, night: 0x060a02, sun: 0xf4ffa0, height: 9, rough: 0.5, flood: -1.4, acid: true,
  trees: 'dead_tree', treeDensity: 0.16, treeTint: 0x707040, decor: 'vyacid', planet: 0xb8e030, fx: 'spores', noBushes: true, step: 'sand', waterColor: 0x98ff30,
  poi: ['shipping_container', 'oil_drum_stack', 'car_wreck', 'ruined_wall', 'generator', 'ext:barrier_jersey_broken'], landmarks: ['ext:ind_cooling_tower', 'power_pylon'],
};
BIOMES.vystorm = {
  name: 'Storm Plateau', ground: 'rock', ground2: 'dirt', rock: 'rock', tint: 0x70767e, pathTint: 0x8a8478, rockTint: 0x585e68,
  sky: 0x262c36, fog: 0x363e4a, fogDensity: 0.02, night: 0x03050a, sun: 0xa8bce0, height: 18, rough: 0.3, terrace: 4.5, gale: true,
  trees: null, treeDensity: 0, decor: 'vystorm', planet: 0x5a6a88, noBushes: true, step: 'gravel', waterColor: 0x506078,
  poi: ['power_pylon', 'radio_tower', 'ruined_wall', 'shipping_container', 'fence_segment', 'ext:barrier_jersey'], landmarks: ['radio_tower', 'power_pylon'],
};
BIOMES.vybone = {
  name: 'Bone Field', ground: 'dirt', ground2: 'sand', rock: 'rock', tint: 0xe0d8c0, pathTint: 0xc8c0a0, rockTint: 0xc0b898,
  sky: 0x9c8c78, fog: 0xa49480, fogDensity: 0.02, night: 0x080604, sun: 0xffe8c4, height: 8, rough: 0.6,
  trees: null, treeDensity: 0, decor: 'vybone', planet: 0xdccca0, fx: 'ash', noBushes: true, step: 'gravel', waterColor: 0x8a8a70,
  poi: ['ruined_wall', 'car_wreck', 'oil_drum_stack', 'fence_segment', 'ext:kst_skip_rocks', 'ext:barrier_jersey_broken'], landmarks: ['power_pylon', 'radio_tower'],
};
BIOMES.vyneon = {
  name: 'Neon Ruins', ground: 'asphalt', ground2: 'concrete_dark', rock: 'concrete_stained', tint: 0x546078, pathTint: 0x6a6088, rockTint: 0x505468,
  sky: 0x1c1034, fog: 0x2c1a4a, fogDensity: 0.022, night: 0x05020c, sun: 0xff78d8, height: 6, rough: 0.3, glitch: true,
  trees: null, treeDensity: 0, decor: 'vyneon', planet: 0xff48c8, fx: 'glitch', noBushes: true, step: 'concrete', waterColor: 0xa040ff,
  poi: ['car_wreck', 'lamp_post', 'ruined_wall', 'shipping_container', 'power_pylon', 'ext:barrier_jersey', 'ext:bollard_concrete_light'], landmarks: ['radio_tower', 'power_pylon', 'ext:kk_lights'],
};
BIOMES.vyrust = {
  name: 'Rust City', ground: 'dirt', ground2: 'asphalt', rock: 'metal_dark', tint: 0x94603c, pathTint: 0x7a5a44, rockTint: 0x6c4028,
  sky: 0x8c5230, fog: 0x7c4c2e, fogDensity: 0.023, night: 0x0c0402, sun: 0xffa868, height: 7, rough: 0.35,
  trees: null, treeDensity: 0, decor: 'vyrust', planet: 0xc86a34, fx: 'ash', noBushes: true, step: 'metal', waterColor: 0x8a5a34,
  poi: ['car_wreck', 'shipping_container', 'oil_drum_stack', 'power_pylon', 'generator', 'ruined_wall', 'ext:barrier_jersey_broken'], landmarks: ['ext:ind_cooling_tower', 'power_pylon', 'radio_tower'],
};

// generator flavour (read by moongen.js generateMoon: interior weights, name adjectives, descriptions, weather)
Object.assign(BIOME_INTERIOR_BONUS, {
  vycrys: { mineshaft: 12, backrooms: 6 }, vyfung: { sewer: 12, hospital: 6, mansion: 4 }, vysky: { office: 8, serverfarm: 8, factory: 4 },
  vyacid: { factory: 10, sewer: 8, serverfarm: 4 }, vystorm: { serverfarm: 10, factory: 8, office: 4 }, vybone: { mansion: 10, hospital: 8, backrooms: 4 },
  vyneon: { office: 10, backrooms: 8, serverfarm: 6 }, vyrust: { factory: 12, mineshaft: 8, sewer: 4 },
});
Object.assign(BIOME_ADJ, {
  vycrys: ['Glass', 'Singing', 'Prismatic', 'Pink'], vyfung: ['Spored', 'Glowcap', 'Rotting', 'Damp'], vysky: ['Airy', 'Drifting', 'Skybound', 'Feather'],
  vyacid: ['Caustic', 'Etched', 'Bleached', 'Sour'], vystorm: ['Gale', 'Thunder', 'Bare', 'Shattered'], vybone: ['Pale', 'Ancient', 'Hollow', 'Bleached'],
  vyneon: ['Neon', 'Flickering', 'Afterhours', 'Holo'], vyrust: ['Rusted', 'Hollowed', 'Scrap', 'Iron'],
});
Object.assign(BIOME_DESC, {
  vycrys: ['Pink dunes and singing glass spires. Everything here is beautiful and sharp.', 'A crystal desert: the sand hums when you walk on it.'],
  vyfung: ['Giant glowcaps and spore haze over black ponds. The air tastes like wet pennies.', 'A fungal swamp: soft ground, soft light, hard things in the fog.'],
  vysky: ['Floating shards of rock and thin air. Gravity is half of what you are used to. Jump at your own risk.', 'Sky shards under a pale blue sky: low gravity, long falls, longer jumps.'],
  vyacid: ['An acid sea laps at a bleached shore. Do not wade in it.', 'Sour fog and a caustic green sea. The shore is safe. Mostly.'],
  vystorm: ['A terraced plateau under a permanent gale. Lightning rods hum. Nothing grows here.', 'Bare mesas and a sky that never stops arguing with itself.'],
  vybone: ['A field of ribcage arches and skulls the size of cars. Nobody remembers what died here.', 'Pale ground, hollow giants, ash on the wind.'],
  vyneon: ['A dead city that never turned its signs off. Neon in the fog, silence in the streets.', 'Neon ruins: flickering holograms above empty avenues.'],
  vyrust: ['Skeletal towers, rusted cranes and girders that groan in the wind.', 'A rust city: everything is brown and everything creaks.'],
});
Object.assign(WEATHER_POOL, {
  vycrys: ['clear', 'clear', 'foggy', 'eclipsed'], vyfung: ['foggy', 'rainy', 'foggy', 'clear'], vysky: ['clear', 'clear', 'foggy', 'stormy'],
  vyacid: ['foggy', 'clear', 'rainy', 'foggy'], vystorm: ['stormy', 'stormy', 'rainy', 'foggy'], vybone: ['clear', 'foggy', 'eclipsed', 'clear'],
  vyneon: ['foggy', 'clear', 'rainy', 'eclipsed'], vyrust: ['clear', 'foggy', 'stormy', 'eclipsed'],
});
