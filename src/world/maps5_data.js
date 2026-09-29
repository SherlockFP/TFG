// WAVE 4 (maps5) biome + moon DEFINITIONS: Estate 9 (overgrown mansion grounds, hedge maze, paper archive) and Cold Storage (frozen data vault,
// shifting server stacks, cryo caves). Data only (imports nothing but moons.js), so it can be loaded without the world code. The decor builders that
// make the biomes look right live in world/maps5_biomes.js. Both moons are FIXED (registered on every peer at import time, like worlds2).
import { BIOMES, registerMoon } from '../game/moons.js';

export const ESTATE_MOON = 'm5est';
export const COLD_MOON = 'm5cold';
export const MAPS5_BIOME_IDS = ['m5estate', 'm5cold'];

BIOMES.m5estate = {
  name: 'Overgrown Estate Grounds', ground: 'grass', ground2: 'dirt', rock: 'concrete_stained', tint: 0x88a06e, pathTint: 0xb4a888, rockTint: 0x8a8a7e,
  sky: 0x939883, fog: 0x8c9884, fogDensity: 0.026, night: 0x070a0f, sun: 0xffe4b4, height: 7, rough: 0.28,
  trees: 'pine_tree', treeDensity: 0.2, treeTint: 0x557a4a, decor: 'm5estate', planet: 0x6e9058, fx: 'spores', step: 'grass', waterColor: 0x5a7a68,
  poi: ['fence_segment', 'fence_segment', 'lamp_post', 'ruined_wall', 'car_wreck', 'oil_drum_stack', 'ext:bollard_concrete_light'],
  landmarks: ['radio_tower', 'power_pylon'],
};
BIOMES.m5cold = {
  name: 'Cold Storage Vault', ground: 'snow', ground2: 'concrete_dark', rock: 'rock', tint: 0xcadcee, pathTint: 0x9cb2c6, rockTint: 0x8fa8c2,
  sky: 0x7d9fbf, fog: 0x9dbad2, fogDensity: 0.022, night: 0x040a18, sun: 0xd8eeff, height: 12, rough: 0.55,
  trees: 'pine_tree', treeDensity: 0.1, treeTint: 0xbcd2e2, decor: 'm5cold', planet: 0x7ac2f2, fx: 'sparkle', step: 'snow', noBushes: true,
  frozen: { lakes: 0 }, waterColor: 0xa8d8f8,   // frozen: blizzard gusts swell the fog / wind (worldx); no slippery lakes
  poi: ['server_rack_prop', 'shipping_container', 'power_pylon', 'fence_segment', 'car_wreck', 'generator', 'ext:barrier_jersey_broken'],
  landmarks: ['radio_tower', 'ext:ind_liquid_reservoir_2'],
};

{
  registerMoon({
    id: ESTATE_MOON, name: 'E9-Estate of the Departed', short: 'Estate 9', tier: 2, cost: 320, biome: 'm5estate', interior: 'mansion', size: 1.3, mapScale: 1.1,
    desc: 'The overgrown grounds of a mansion whose owner uploaded themselves. A hedge maze hides the estate vault, the Paper Archive keeps every unposted draft '
      + 'on two levels of shelves, and something in the topiary is watching you.',
    weather: ['foggy', 'foggy', 'clear', 'rainy', 'eclipsed'], scrapCount: [15, 20], scrapMul: 1.35, power: 6, outdoorPower: 4, landmarkBonus: 0,
    creatures: { scuttler: 14, yoinker: 14, crawler: 12, lurker: 12, mannequin: 12, sludge: 8, spider: 10, leech: 10, jester: 6, screamer: 8, mimic: 8, turret: 5, mine: 8 },
    outdoor: { hound: 6, giant: 2, mimic: 3 },
    m5: { hedge: true, archive: true },
  });
  registerMoon({
    id: COLD_MOON, name: 'C0-Cold Storage Vault', short: 'Cold Storage', tier: 3, cost: 640, biome: 'm5cold', interior: 'serverfarm', size: 1.5, mapScale: 1.1,
    desc: 'A frozen data vault: server aisles that rearrange themselves, cryo caves full of sleeping subscribers and a blizzard that never quite stops. '
      + 'Watch the amber strips. Do not thaw anything.',
    weather: ['foggy', 'stormy', 'clear', 'foggy', 'eclipsed'], scrapCount: [18, 24], scrapMul: 1.55, power: 8, outdoorPower: 5, landmarkBonus: 0,
    creatures: { scuttler: 10, yoinker: 8, crawler: 14, lurker: 12, mannequin: 10, sludge: 5, spider: 8, leech: 8, jester: 8, screamer: 8, mimic: 8, turret: 10, mine: 12 },
    outdoor: { hound: 8, giant: 4, mimic: 3 },
    m5: { stacks: true, cryo: true },
  });
}
