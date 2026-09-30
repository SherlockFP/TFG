// Moon definitions. biome drives terrain gen; interior drives facility theme/size.
export const MOONS = {
  hq: {
    id: 'hq', name: '0-Algorithm HQ', short: 'HQ', tier: 0, cost: 0, company: true,
    biome: 'pier', desc: 'Where content is sold. The Algorithm hungers. Market, gacha, bounties, phishing dock.',
    weather: ['clear', 'foggy'],
  },
  hamsi: {
    id: 'hamsi', name: '56K-Dialup', short: 'Dialup', tier: 1, cost: 0, biome: 'hills', interior: 'factory', interiorName: 'Abandoned Web Host', size: 0.8,
    desc: 'Rolling hills of the early web. A small abandoned web host. Good for new janitors.',
    weather: ['clear', 'clear', 'rainy', 'foggy'], scrapCount: [10, 14], scrapMul: 1.0, power: 3, outdoorPower: 2,
    creatures: { scuttler: 30, yoinker: 22, crawler: 10, lurker: 6, mannequin: 4, sludge: 8, spider: 10, leech: 12, mimic: 3, turret: 6, mine: 10 },
    outdoor: { hound: 5, mimic: 2 },
  },
  lufer: {
    id: 'lufer', name: '12-Forum', short: 'Forum', tier: 1, cost: 0, biome: 'swamp', interior: 'greenhouse', size: 1.0,   // [labyrinths] was factory
    desc: 'A swampy old message board. Frequent rain. Ponds full of phish. An overgrown hydroponics greenhouse hides the good scrap: cut the vines.',
    weather: ['rainy', 'rainy', 'foggy', 'clear', 'stormy'], scrapCount: [12, 16], scrapMul: 1.05, power: 4, outdoorPower: 3, ponds: 3,
    creatures: { scuttler: 24, yoinker: 18, crawler: 14, lurker: 10, mannequin: 6, sludge: 14, spider: 12, leech: 14, jester: 3, screamer: 5, mimic: 4, turret: 6, mine: 10 },
    outdoor: { hound: 6, giant: 3, mimic: 3 },
  },
  palamut: {
    id: 'palamut', name: '33-Guestbook', short: 'Guestbook', tier: 2, cost: 150, biome: 'snow', interior: 'academy', size: 1.1,   // [repomaps] Content Academy (the guestbook is a yearbook)
    desc: 'A frozen yearbook page: the Algorithm trains its streamers here. Lecture halls, detention and a library that rearranges itself. Trolls hunt at night.',
    weather: ['clear', 'foggy', 'stormy', 'eclipsed'], scrapCount: [14, 19], scrapMul: 1.25, power: 5, outdoorPower: 4,
    creatures: { scuttler: 14, yoinker: 14, crawler: 14, lurker: 14, mannequin: 10, sludge: 8, spider: 12, leech: 10, jester: 8, screamer: 8, mimic: 6, turret: 4, mine: 6 },
    outdoor: { hound: 12, giant: 5, mimic: 4 },
  },
  levrek: {
    id: 'levrek', name: '88-Chatroom', short: 'Chatroom', tier: 2, cost: 200, biome: 'desert', interior: 'metro', size: 1.35,   // [labyrinths] was mineshaft
    desc: 'Red desert of dead chatrooms. An abandoned subway runs under the mesa, and the ghost trains still keep their schedule. Something digs under the sand.',
    weather: ['clear', 'clear', 'foggy', 'eclipsed'], scrapCount: [16, 22], scrapMul: 1.3, power: 6, outdoorPower: 5,
    creatures: { scuttler: 18, yoinker: 14, crawler: 18, lurker: 10, mannequin: 12, sludge: 10, spider: 14, leech: 12, jester: 8, screamer: 8, mimic: 6, turret: 10, mine: 14 },
    outdoor: { sandkefal: 8, hound: 6, giant: 3, mimic: 3 },
  },
  cipura: {
    id: 'cipura', name: '666-Creepypasta', short: 'Creepypasta', tier: 3, cost: 450, biome: 'moor', interior: 'prison', size: 1.5,   // [labyrinths] was mansion
    desc: 'Storm-battered moor. A penitentiary of banned accounts: the cell doors slam shut when the alarm sounds. Elites roam.',
    weather: ['stormy', 'rainy', 'foggy', 'eclipsed'], scrapCount: [20, 26], scrapMul: 1.55, power: 8, outdoorPower: 6,
    creatures: { scuttler: 10, yoinker: 10, crawler: 16, lurker: 16, mannequin: 14, sludge: 10, spider: 14, leech: 12, jester: 12, screamer: 12, mimic: 10, turret: 8, mine: 10 },
    outdoor: { hound: 12, giant: 8, mimic: 6 },
  },
  orkinos: {
    id: 'orkinos', name: '404-Not Found', short: '404', tier: 4, cost: 900, biome: 'blackforest', interior: 'museum', size: 1.8,   // [repomaps] Museum of Deleted Content
    desc: 'Black forest under a dead sun. Everything lives here, and the Museum of Deleted Content keeps the best of it framed behind laser grids. Do not bump the art.',
    weather: ['eclipsed', 'foggy', 'stormy'], scrapCount: [26, 34], scrapMul: 2.0, power: 9, outdoorPower: 8,
    creatures: { scuttler: 10, yoinker: 8, crawler: 16, lurker: 16, mannequin: 16, sludge: 10, spider: 16, leech: 12, jester: 14, screamer: 14, mimic: 12, turret: 12, mine: 14 },
    outdoor: { hound: 14, giant: 10, sandkefal: 4, mimic: 8 },
  },
};

export const MOON_ORDER = ['hq', 'hamsi', 'lufer', 'palamut', 'levrek', 'cipura', 'orkinos'];

export const WEATHER = {
  clear: { name: 'Clear', color: '#9fd49f' },
  rainy: { name: 'Rainy', color: '#6fa8dc' },
  foggy: { name: 'Foggy', color: '#bbbbbb' },
  stormy: { name: 'Stormy', color: '#f1c232' },
  eclipsed: { name: 'Eclipsed', color: '#e06666' },
};

export const BIOMES = {
  hills: { ground: 'grass', ground2: 'dirt', rock: 'rock', sky: 0x6f8a99, fog: 0x7d8f95, fogDensity: 0.014, trees: 'pine_tree', treeDensity: 0.5, height: 14, rough: 0.6, sun: 0xfff1d6 },
  swamp: { ground: 'mud', ground2: 'grass_dry', rock: 'rock', sky: 0x4d5a4d, fog: 0x4f5a4c, fogDensity: 0.022, trees: 'dead_tree', treeDensity: 0.7, height: 6, rough: 0.4, sun: 0xd8e0c0, water: true },
  snow: { ground: 'snow', ground2: 'rock', rock: 'rock', sky: 0xa0aab5, fog: 0xb4bcc4, fogDensity: 0.02, trees: 'pine_tree', treeDensity: 0.35, height: 18, rough: 0.8, sun: 0xeef4ff },
  desert: { ground: 'red_sand', ground2: 'sand', rock: 'rock', sky: 0xb57a52, fog: 0xa87450, fogDensity: 0.012, trees: 'rock_big', treeDensity: 0.25, height: 22, rough: 1.0, sun: 0xffd9a0 },
  moor: { ground: 'grass_dry', ground2: 'mud', rock: 'rock', sky: 0x4a4f58, fog: 0x50555e, fogDensity: 0.02, trees: 'dead_tree', treeDensity: 0.3, height: 12, rough: 0.7, sun: 0xc8cce0 },
  blackforest: { ground: 'dirt', ground2: 'mud', rock: 'rock', sky: 0x1b1414, fog: 0x1d1515, fogDensity: 0.028, trees: 'pine_tree', treeDensity: 1.0, height: 12, rough: 0.7, sun: 0xff9a7a },
  pier: { ground: 'concrete', ground2: 'concrete_dark', rock: 'rock', sky: 0x3a4148, fog: 0x3c444a, fogDensity: 0.016, sun: 0xd0d8e0 },
  // ---- generated-sector biomes (src/game/moongen.js). Extra fields, all optional:
  //   name        display name (terminal)          tint / pathTint / rockTint  vertex tint per terrain bucket
  //   night       night sky colour                 glitch      random sky/fog glitch flashes (environment.js)
  //   fx          ambient particles: glitch | ash | spores | sparkle (environment.js)
  //   decor       biome set dressing builder (src/world/outdoor_biomes.js)
  //   terrace     height quantisation step (blocky terrain)   flood  world-y water sheet (valleys wade-deep)
  //   treeTint    tint for the instanced trees     noBushes    no grass clumps / bushes
  //   step        footstep surface                 poi / landmarks  outdoor junk prop ids
  //   planet      orbit planet colour (game.planetColorFor; falls back to sky)
  datascape: {
    name: 'Corrupted Datascape', ground: 'metal_plate', ground2: 'asphalt', rock: 'metal_dark', tint: 0x4a5878, pathTint: 0x7a7090, rockTint: 0x5a5a7a,
    sky: 0x1c1038, fog: 0x2a1850, fogDensity: 0.019, night: 0x07031a, sun: 0xa8e8ff, height: 11, rough: 0.9, terrace: 2.4,
    trees: null, decor: 'datascape', planet: 0x5a2ab8, grid: 0x2af4ff, fx: 'glitch', glitch: true, noBushes: true, step: 'metal', waterColor: 0x40d8ff,
    poi: ['shipping_container', 'power_pylon', 'radio_tower', 'server_rack_prop', 'generator', 'ext:kk_solarpanel', 'ext:barrier_jersey', 'ext:bollard_concrete_light', 'fence_segment'],
    landmarks: ['radio_tower', 'power_pylon', 'ext:kk_lights'],
  },
  servermarsh: {
    name: 'Flooded Server Marsh', ground: 'mud', ground2: 'concrete_dark', rock: 'concrete_stained', tint: 0x7c8c70, pathTint: 0x9a9a92, rockTint: 0x8a9488,
    sky: 0x33463f, fog: 0x3a5048, fogDensity: 0.025, sun: 0xc8e4d4, height: 6, rough: 0.35, flood: -2.1,
    trees: 'dead_tree', treeDensity: 0.3, treeTint: 0x6a7462, decor: 'servermarsh', planet: 0x3a6a5c, fx: 'spores', step: 'mud', waterColor: 0x4a6a60,
    poi: ['server_rack_prop', 'shipping_container', 'oil_drum_stack', 'ruined_wall', 'fence_segment', 'power_pylon', 'pallet', 'car_wreck', 'ext:psx_dumpster'],
    landmarks: ['ext:ind_liquid_reservoir_2', 'ext:ind_cooling_tower', 'power_pylon'],
  },
  ashfield: {
    name: 'Burnt Data Center', ground: 'dirt', ground2: 'asphalt', rock: 'rock', tint: 0x55504c, pathTint: 0x6a6664, rockTint: 0x484442,
    sky: 0x5c3624, fog: 0x4c3226, fogDensity: 0.021, night: 0x140604, sun: 0xff9a5c, height: 14, rough: 0.8,
    trees: 'dead_tree', treeDensity: 0.45, treeTint: 0x2c2522, decor: 'ashfield', planet: 0x8a3a1c, fx: 'ash', noBushes: true, step: 'concrete',
    poi: ['car_wreck', 'shipping_container', 'ruined_wall', 'oil_drum_stack', 'power_pylon', 'server_rack_prop', 'generator', 'ext:barrier_jersey_broken', 'ext:kst_skip_rocks'],
    landmarks: ['ext:ind_cooling_tower', 'power_pylon', 'radio_tower'],
  },
  crystal: {
    name: 'Crystal Cache', ground: 'snow', ground2: 'rock', rock: 'rock', tint: 0xb0a0e0, pathTint: 0x9a90b8, rockTint: 0x8a78b8,
    sky: 0x3c2c62, fog: 0x4a3a7c, fogDensity: 0.017, night: 0x0a0420, sun: 0xe4ccff, height: 17, rough: 1.0,
    trees: null, decor: 'crystal', planet: 0x9a72ff, fx: 'sparkle', noBushes: true, step: 'snow', waterColor: 0x9a7aff,
    poi: ['ruined_wall', 'radio_tower', 'shipping_container', 'car_wreck', 'fence_segment', 'lamp_post', 'ext:kk_solarpanel', 'ext:kst_skip_rocks'],
    landmarks: ['radio_tower', 'ext:kk_lights'],
  },
};

// Every biome the endless generator may use (handcrafted ones + the generated-sector ones above).
export const GEN_BIOME_IDS = ['hills', 'swamp', 'snow', 'desert', 'moor', 'blackforest', 'datascape', 'servermarsh', 'ashfield', 'crystal'];

export function registerMoon(def) {
  MOONS[def.id] = { tier: 1, cost: 0, biome: 'hills', interior: 'factory', size: 1, scrapCount: [12, 16], scrapMul: 1, power: 4, outdoorPower: 3, weather: ['clear'], creatures: { scuttler: 10 }, outdoor: {}, ...def };
  if (!MOON_ORDER.includes(def.id)) MOON_ORDER.push(def.id);
  return MOONS[def.id];
}
