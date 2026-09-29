// WAVE 3 (worlds2) planet biome DEFINITIONS: the Soviet panel-block district ("soviet") and the twin-sun desert ("twinsun").
// Data only (imports nothing but moons.js) so the endless moon generator (game/moongen.js) can roll them without loading the
// world code. The decor builders that make them look right live in world/worlds2_biomes.js.
// The two fixed moons are registered here too (registerMoon), so they exist on every peer before any run state is read.
import { BIOMES, registerMoon } from '../game/moons.js';

export const WORLDS2_BIOME_IDS = ['soviet', 'twinsun'];
export const SOVIET_MOON = 'w2sov';
export const TWINSUN_MOON = 'w2sun';

BIOMES.soviet = {
  name: 'Panelka District', ground: 'snow', ground2: 'asphalt', rock: 'concrete_stained', tint: 0xb4bcc6, pathTint: 0x8a8e94, rockTint: 0x8c9096,
  sky: 0x8a929c, fog: 0x969ea8, fogDensity: 0.027, night: 0x07090e, sun: 0xdfe6f0, height: 8, rough: 0.35,
  trees: 'dead_tree', treeDensity: 0.1, treeTint: 0x8c8c88, decor: 'soviet', planet: 0x7a8896, step: 'snow', noBushes: true,
  waterColor: 0x6a7a86, snowfall: true,
  poi: ['car_wreck', 'ruined_wall', 'lamp_post', 'fence_segment', 'fence_segment', 'power_pylon', 'oil_drum_stack', 'shipping_container', 'ext:barrier_jersey_broken', 'ext:bollard_concrete_light'],
  landmarks: ['radio_tower', 'power_pylon'],
};
BIOMES.twinsun = {
  name: 'Twin-Sun Dust Sea', ground: 'sand', ground2: 'red_sand', rock: 'rock', tint: 0xf2d698, pathTint: 0xcfa66c, rockTint: 0xb98a56,
  sky: 0xe4b676, fog: 0xdcb47c, fogDensity: 0.011, night: 0x0b0812, sun: 0xfff0c4, height: 13, rough: 0.5, dunes: 10,
  trees: 'rock_big', treeDensity: 0.1, treeTint: 0xb98a56, decor: 'twinsun', planet: 0xd8a050, step: 'sand', noBushes: true,
  waterColor: 0x8ab0a0, twinSun: true,
  poi: ['ruined_wall', 'shipping_container', 'car_wreck', 'oil_drum_stack', 'generator', 'fence_segment', 'ext:kst_skip_rocks', 'ext:barrier_jersey_broken'],
  landmarks: ['radio_tower', 'power_pylon'],
};

// ------------------------------------------------------------------ fixed moons
// `raid`: raid director settings (worlds2.js): first raid after `first` s on the ground, then every `every` s (shrinks with the
// days-in-run factor), squads of `n` (+ days), factions picked from the list. `cantina`: an NPC outpost is built (twin-sun decor).
{
  registerMoon({
    id: SOVIET_MOON, name: '1991-Runet Panelka', short: 'Panelka', tier: 3, cost: 520, biome: 'soviet', interior: 'tower', size: 1.5,   // [labyrinths] was office
    desc: 'A grey district of brutalist panel blocks, rusted playgrounds and propaganda billboards, buried in snow and fog. '
      + 'Enter the stairwells for loot. Armed squads RAID your position every few minutes.',
    weather: ['foggy', 'foggy', 'stormy', 'clear', 'eclipsed'], scrapCount: [18, 24], scrapMul: 1.5, power: 8, outdoorPower: 5, landmarkBonus: 1,
    creatures: { scuttler: 12, yoinker: 10, crawler: 14, lurker: 12, mannequin: 14, sludge: 8, spider: 8, leech: 10, jester: 8, screamer: 10, mimic: 8, turret: 8, mine: 10 },
    outdoor: { hound: 6, mimic: 4, giant: 3 },
    raid: { first: 170, every: 250, n: 3, factions: ['bureau', 'algorithm', 'archive'] },
  });
  registerMoon({
    id: TWINSUN_MOON, name: 'A2-Binary Dunes', short: 'Binary', tier: 2, cost: 260, biome: 'twinsun', interior: 'mineshaft', size: 1.3,
    desc: 'A desert under two suns, moisture-harvester towers on the ridges and a cantina outpost full of neutral aliens. '
      + 'Dune Maws burrow under the sand, Tusked Beasts graze in herds and hooded scavenger raiders roam. Bring a Plasma Blade.',
    weather: ['clear', 'clear', 'clear', 'foggy', 'eclipsed'], scrapCount: [15, 20], scrapMul: 1.3, power: 6, outdoorPower: 6, landmarkBonus: 1,
    creatures: { scuttler: 16, yoinker: 12, crawler: 16, lurker: 8, mannequin: 8, sludge: 8, spider: 14, leech: 10, jester: 4, screamer: 6, mimic: 6, turret: 8, mine: 12 },
    outdoor: { dunemaw: 9, tuskbeast: 10, scavraider: 9, hound: 3, mimic: 2 },
    cantina: true,
  });
}
