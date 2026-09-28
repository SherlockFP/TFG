// WAVE 1 planet biome DEFINITIONS (worldx): lava / ice / jungle. Data only (imports nothing but moons.js), so the endless
// moon generator (game/moongen.js) can rely on them without loading the world code. The decor builders that make them
// look right live in world/biomes_wave1.js.
import { BIOMES } from '../game/moons.js';

export const WAVE1_BIOME_IDS = ['lava', 'ice', 'jungle'];

BIOMES.lava = {
  name: 'Thermal Throttle Basin', ground: 'dirt', ground2: 'rock', rock: 'rock', tint: 0x4c3128, pathTint: 0x6a4a3a, rockTint: 0x2a2030,
  sky: 0x74300f, fog: 0x62280e, fogDensity: 0.024, night: 0x1c0603, sun: 0xff8a40, height: 13, rough: 0.9,
  trees: 'dead_tree', treeDensity: 0.2, treeTint: 0x241a16, decor: 'lava', planet: 0xe0400c, fx: 'ash', noBushes: true, step: 'gravel',
  lava: { y: -3.0 }, waterColor: 0xff6a20,
  poi: ['car_wreck', 'shipping_container', 'ruined_wall', 'oil_drum_stack', 'power_pylon', 'server_rack_prop', 'generator', 'ext:barrier_jersey_broken', 'ext:kst_skip_rocks'],
  landmarks: ['ext:ind_cooling_tower', 'power_pylon', 'radio_tower'],
};
BIOMES.ice = {
  name: 'Permafrost Cold Storage', ground: 'snow', ground2: 'rock', rock: 'rock', tint: 0xd4e6f6, pathTint: 0xaec2d6, rockTint: 0x9ab6d0,
  sky: 0x86acd0, fog: 0xa4c6e0, fogDensity: 0.023, night: 0x050b1a, sun: 0xdcefff, height: 16, rough: 0.85,
  trees: 'pine_tree', treeDensity: 0.28, treeTint: 0xb8d0e0, decor: 'ice', planet: 0x8ac8f4, step: 'snow', noBushes: true,
  frozen: { lakes: 2 }, waterColor: 0xa8d8f8,
  poi: ['shipping_container', 'car_wreck', 'ruined_wall', 'power_pylon', 'radio_tower', 'fence_segment', 'lamp_post', 'ext:barrier_jersey', 'ext:kst_skip_rocks', 'ext:kk_solarpanel'],
  landmarks: ['radio_tower', 'ext:kk_lights', 'ext:ind_liquid_reservoir_2'],
};
BIOMES.jungle = {
  name: 'Link-Rot Jungle', ground: 'grass', ground2: 'mud', rock: 'rock', tint: 0x5a8a48, pathTint: 0x7c7a52, rockTint: 0x5e7050,
  sky: 0x3f6f4c, fog: 0x3a6a44, fogDensity: 0.031, night: 0x020c06, sun: 0xd8f0a0, height: 9, rough: 0.55,
  trees: 'pine_tree', treeDensity: 0.5, treeTint: 0x4f8f3c, decor: 'jungle', planet: 0x30a03c, fx: 'spores', step: 'grass',
  waterColor: 0x4a8a5a,
  poi: ['ruined_wall', 'shipping_container', 'car_wreck', 'oil_drum_stack', 'fence_segment', 'lamp_post', 'radio_tower', 'ext:barrier_jersey_broken', 'ext:kst_skip_rocks'],
  landmarks: ['radio_tower', 'ext:ind_cooling_tower'],
};

