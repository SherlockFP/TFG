// extra-moons-pack — port of Wesley's Moons / Tolian's Moons / Orion family.
// Three new moons built from the existing biomes and interiors. TFG built-in feature: every player
// has all three moon definitions (so a lobby on any of them always loads); the per-moon switches
// only decide which ones the terminal lists / routes to.
KefalAPI.defineMod({
  id: 'extra-moons-pack',
  name: 'Extra Moons Pack',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: "Wesley's Moons + Tolian's Moons + Orion",
  builtin: true,
  scope: 'host',
  category: 'content',
  enabledByDefault: true,
  description: 'Adds 44-Wiki (foggy swamp manor), 403-Forbidden (frozen security complex full of turrets and mines) and 500-Mainframe (eclipsed red desert, huge refinery, The Worm). Route with the terminal.',
  config: {
    istavrit: { type: 'boolean', default: true, label: '44-Wiki' },
    kalkan: { type: 'boolean', default: true, label: '403-Forbidden' },
    lagos: { type: 'boolean', default: true, label: '500-Mainframe' },
    priceMul: { type: 'number', default: 1, min: 0, max: 3, step: 0.25, label: 'Routing price multiplier' },
  },
  init(api, cfg) {
    // (creature ids that are not installed - e.g. the optional asset-pack skeleton/robot - are ignored by the spawner)
    const pm = Number.isFinite(Number(cfg.priceMul)) ? Math.max(0, Number(cfg.priceMul)) : 1;
    const price = (c) => Math.round(c * pm);

    api.registerMoon({
      id: 'istavrit', name: '44-Wiki', short: 'Wiki', tier: 2, cost: price(120),
      biome: 'swamp', interior: 'mansion', size: 1.0, ponds: 4,
      desc: 'A drowned wiki estate in a foggy swamp. Every page edited by something. Quiet halls, loud things. Great phishing.',
      weather: ['foggy', 'foggy', 'rainy', 'clear'], scrapCount: [14, 18], scrapMul: 1.2, power: 5, outdoorPower: 4,
      creatures: { scuttler: 12, yoinker: 16, crawler: 8, lurker: 14, mannequin: 12, sludge: 14, spider: 10, leech: 14, jester: 6, screamer: 12, mimic: 8, turret: 2, mine: 4, skeleton: 12 },
      outdoor: { hound: 8, mimic: 5, giant: 2 },
    }, { hidden: !cfg.istavrit });

    api.registerMoon({
      id: 'kalkan', name: '403-Forbidden', short: 'Forbidden', tier: 3, cost: price(380),
      biome: 'snow', interior: 'factory', size: 1.45,
      desc: 'A frozen Algorithm security complex. Access denied: expect firewall turrets, clickbait mines and locked doors. Rich pickings for careful crews.',
      weather: ['clear', 'foggy', 'stormy'], scrapCount: [20, 26], scrapMul: 1.6, power: 8, outdoorPower: 6,
      creatures: { scuttler: 16, yoinker: 8, crawler: 18, lurker: 8, mannequin: 16, sludge: 6, spider: 10, leech: 8, jester: 8, screamer: 10, mimic: 6, turret: 24, mine: 30, robot: 14, skeleton: 6 },
      outdoor: { hound: 14, giant: 6, mimic: 4 },
    }, { hidden: !cfg.kalkan });

    api.registerMoon({
      id: 'lagos', name: '500-Mainframe', short: 'Mainframe', tier: 4, cost: price(750),
      biome: 'desert', interior: 'factory', size: 1.7,
      desc: 'An eclipsed red desert around a colossal mainframe refinery. The Worm is hungry. The loot is legendary.',
      weather: ['eclipsed', 'eclipsed', 'stormy', 'clear'], scrapCount: [26, 32], scrapMul: 2.2, power: 13, outdoorPower: 11,
      creatures: { scuttler: 14, yoinker: 10, crawler: 18, lurker: 14, mannequin: 12, sludge: 10, spider: 16, leech: 12, jester: 12, screamer: 12, mimic: 10, turret: 12, mine: 16, robot: 10, skeleton: 8 },
      outdoor: { sandkefal: 14, hound: 10, giant: 8, mimic: 6 },
    }, { hidden: !cfg.lagos });
  },
});
