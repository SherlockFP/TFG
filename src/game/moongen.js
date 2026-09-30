// ENDLESS MOONS: procedurally generated "uncharted servers".
//
// Beyond the 7 handcrafted moons every quota cycle opens a new SECTOR of 3-5 generated moons (older
// sectors go dark). A sector is a pure function of the run identity (run.runId, synced + saved) and the
// sector index (run.quotaIndex, synced + saved), so every peer derives the exact same moons with no extra
// network traffic. Generated moons are registered into MOONS / MOON_ORDER at runtime, so the rest of the
// game (loadMapFor, host spawning, terminal, HUD) treats them like handcrafted moons.
//
//   ensureSector(run)   (idempotent; call whenever run state changes) -> registers the current sector,
//                       plus run.moon if it points at a moon of an older sector (save/load safety), and
//                       fills missing forecasts deterministically. Returns the sector info (+ changed flag).
//   resolveMoon(run, id) MOONS[id] or a regenerated definition without registering it.
//   generateSector(runKey, index)  pure; used by tests / the terminal.
//
// Only RNG from core/rng.js is used (never Math.random), and nothing depends on optional runtime content
// (downloaded models, mods) except through separate RNG streams, so peers can never disagree.
import { MOONS, MOON_ORDER, BIOMES, GEN_BIOME_IDS } from './moons.js';
import { RNG, hashString } from '../core/rng.js';
import { getLang } from '../core/i18n.js';
import { CREATURES } from './creatures.js';
import { labInterior } from './labyrinths_core.js';   // [labyrinths]
import { labInterior12 } from './labyr12_core.js';   // [labyr12] darkweb / hotel join the generated-moon interior pool
import '../world/biomes_wave1_data.js';   // registers lava / ice / jungle into BIOMES (data only) so every peer rolls the same sectors
import '../world/worlds2_data.js';   // wave 3: soviet / twinsun biomes + the two fixed moons (own RNG stream below, older rolls stay identical)

export const GEN_PREFIX = 'gen';
const GEN_RE = /^gen(\d+)_(\d+)$/;
export const isGeneratedId = (id) => GEN_RE.test(String(id || ''));

// ------------------------------------------------------------------ interiors
export const INTERIOR_NAMES = {
  factory: 'Data Center', mansion: 'Haunted Homepage', mineshaft: 'Deep Web Mine',
  office: 'Corporate Intranet', backrooms: 'The Backrooms', serverfarm: 'Cloud Storage', sewer: 'The Comment Sewer', hospital: 'Telehealth Clinic', metro: 'The Packet Subway', greenhouse: 'Link Rot Greenhouse', prison: 'Banhammer Penitentiary', tower: 'The Ivory Tower',   // [labyrinths] same as interiors/index.js INTERIOR_NAMES
};
const BASE_INTERIORS = new Set(['factory', 'mansion', 'mineshaft']);
const INTERIOR_W = { factory: 9, mansion: 7, mineshaft: 6, office: 8, backrooms: 8, serverfarm: 8, sewer: 7, hospital: 7 };   // metro / greenhouse: swapped in by labInterior() (own hash stream)
export const BIOME_INTERIOR_BONUS = {
  datascape: { serverfarm: 12, backrooms: 9 }, servermarsh: { sewer: 13, serverfarm: 6 }, ashfield: { factory: 8, serverfarm: 7, hospital: 4 },
  crystal: { mineshaft: 12, backrooms: 5 }, snow: { mansion: 6, hospital: 6 }, desert: { mineshaft: 10, office: 3 },
  moor: { mansion: 9, hospital: 6 }, blackforest: { mansion: 6, backrooms: 6 }, swamp: { sewer: 9, factory: 3 }, hills: { office: 7, factory: 4 },
  lava: { factory: 9, serverfarm: 9, mineshaft: 5 }, ice: { hospital: 9, backrooms: 6, mansion: 5 }, jungle: { sewer: 8, mansion: 8, mineshaft: 4 },
  soviet: { office: 12, hospital: 8, factory: 6 }, twinsun: { mineshaft: 12, factory: 5, sewer: 4 },
};
// wave 1 (worldx): planets that only show up in deeper sectors (defined in world/biomes_wave1.js, registered into BIOMES on import)
const WAVE1_BIOMES = ['ice', 'jungle', 'lava'];
// wave 3 (worlds2): Soviet panel district (raids) + twin-sun desert; deeper sectors only, third RNG stream
const WORLDS2_BIOMES = ['soviet', 'twinsun'];
// set by the world layer (terrain.js) once facility.js is loaded: (themeId) => true | false | null(unknown)
let interiorProbe = null;
export function setInteriorProbe(fn) { interiorProbe = typeof fn === 'function' ? fn : null; }
export function interiorAvailable(id) {
  if (BASE_INTERIORS.has(id)) return true;
  try { return interiorProbe?.(id) === true; } catch { return false; }
}

// ------------------------------------------------------------------ names
const NOUNS = [
  ['Wiki', 'Wiki'], ['MySpace Cluster', 'MySpace'], ['Webring', 'Webring'], ['Geocities Block', 'Geocities'], ['IRC Relay', 'IRC'],
  ['Imageboard', 'Imageboard'], ['Fan Forum', 'Fan Forum'], ['Blogroll', 'Blogroll'], ['Flash Portal', 'Flash'], ['Torrent Tracker', 'Tracker'],
  ['Pastebin', 'Pastebin'], ['Newsgroup', 'Newsgroup'], ['Meme Vault', 'Meme Vault'], ['CDN Edge', 'CDN'], ['Cache Node', 'Cache'],
  ['Tumblelog', 'Tumblelog'], ['MMO Shard', 'MMO'], ['Dev Blog', 'Dev Blog'], ['Mailing List', 'Mailing'], ['Web Portal', 'Portal'],
  ['Photo Album', 'Album'], ['Video Archive', 'Archive'], ['Chat Lobby', 'Lobby'], ['Wiki Mirror', 'Mirror'], ['Link Farm', 'Link Farm'],
  ['Podcast Feed', 'Podcast'], ['Stream Archive', 'Stream'], ['BBS Node', 'BBS'], ['Web Shop', 'Web Shop'], ['Crypto Exchange', 'Exchange'],
  ['Dating Site', 'Dating'], ['Emoji Server', 'Emoji'], ['Screensaver Farm', 'Screensaver'], ['Ringtone Mirror', 'Ringtone'], ['Modding Hub', 'Mod Hub'],
  ['Hit Counter', 'Counter'], ['Guild Site', 'Guild'], ['Lyrics Mirror', 'Lyrics'], ['Warez Drop', 'Warez'], ['Beta Server', 'Beta'],
];
const ADJ = ['Abandoned', 'Dead', 'Forgotten', 'Corrupted', 'Archived', 'Orphaned', 'Cursed', 'Deleted', 'Unindexed', 'Haunted', 'Legacy',
  'Broken', 'Quarantined', 'Shadowbanned', 'Deprecated', 'Paywalled', 'Unmoderated', 'Hacked', 'Mirrored', 'Lost', 'Leaked', 'Rotting', 'Silent', 'Throttled'];
export const BIOME_ADJ = {
  datascape: ['Glitched', 'Corrupted', 'Neon', 'Recursive', 'Fragmented'], servermarsh: ['Flooded', 'Waterlogged', 'Sunken', 'Drowned', 'Leaking'],
  ashfield: ['Burnt', 'Scorched', 'Melted', 'Overheated', 'Charred'], crystal: ['Cached', 'Crystal', 'Compressed', 'Prismatic', 'Frozen'],
  snow: ['Frozen', 'Cold', 'Snowed-In'], desert: ['Sunbaked', 'Dusty', 'Buried'], swamp: ['Soggy', 'Sunken', 'Rotting'],
  moor: ['Stormy', 'Haunted', 'Grim'], blackforest: ['Dark', 'Eclipsed', 'Blackout'], hills: ['Retro', 'Sunny', 'Early'],
  lava: ['Molten', 'Overclocked', 'Thermal', 'Meltdown', 'Throttled'], ice: ['Frozen', 'Permafrost', 'Cold-Storage', 'Glacial', 'Archived'],
  jungle: ['Overgrown', 'Link-Rot', 'Tangled', 'Humid', 'Rainforest'],
  soviet: ['Brutalist', 'Frozen', 'Panel', 'Propaganda', 'Grey'], twinsun: ['Binary', 'Twin-Sun', 'Sunbaked', 'Dusty', 'Dune'],
};
const CODES = ['8080', '1337', '443', '503', '418', '0x7F', '2600', '9001', '127', '2038', '1999', '451', '101', '0xFF', '777', '3DS', 'IPv6'];
const SECTOR_NAMES = ['Deadnet Reach', 'The Lost Tabs', 'Broken Link Belt', 'Cache Drift', 'Legacy Expanse', 'The Unindexed', 'Null Route',
  'Packet Graveyard', 'The Deep Feed', 'Ping Abyss', 'Bitrot Nebula', '404 Cluster', 'Dial Tone Void', 'The Cookie Jar', 'Spam Belt',
  'Timeout Rift', 'Lag Spike Ridge', 'The Comment Section', 'Beta Wasteland', 'Captcha Fields'];

export const BIOME_DESC = {
  datascape: ['A corrupted datascape: neon wireframe ground and floating glitch blocks.', 'The terrain renders wrong here. Neon grid everywhere, monoliths humming.'],
  servermarsh: ['Server racks rot in knee-deep flood water. The fans still spin.', 'A flooded server marsh. Mist, dead trees and blinking LEDs under the surface.'],
  ashfield: ['A burnt-out data center field. Ash still falls, fires still smoulder.', 'Everything overheated at once. Charred racks under a copper sky.'],
  crystal: ['Cache crystals grew over everything. Beautiful, loud and valuable.', 'Compressed data crystallised into glowing spires.'],
  hills: ['Rolling green hills of the early web.', 'Sunny hills, dial-up hum on the wind.'],
  swamp: ['A swampy dead board. Frequent rain, ponds full of phish.', 'Mud, fog and half-sunk flame wars.'],
  snow: ['A frozen homepage buried in snow.', 'Cold storage. Everything is preserved, including the things that hunt.'],
  desert: ['Red desert of dead chats. Something digs under the sand.', 'Sun-baked dunes over forgotten servers.'],
  moor: ['A storm-battered moor. Something wanders the heather.', 'Grey moorland and endless drizzle.'],
  blackforest: ['A black forest under a dead sun.', 'Pines so dense the flashlight gives up.'],
  lava: ['A thermal-throttled basin: rivers of molten silicon. Do not fall in.', 'Everything overclocked at once. The ground glows, the rivers kill.'],
  ice: ['Permafrost cold storage: frozen lakes, blizzard gusts, everything preserved.', 'A whiteout of archived data. The lakes are slippery.'],
  jungle: ['Link rot everywhere: giant plants strangle the old web. Humid, dense, loud.', 'A tangled rainforest of dead links and hanging vines.'],
  soviet: ['A grey district of brutalist panel blocks in the snow. Enter the stairwells; squads raid you.', 'Khrushchyovka ruins, rusted playgrounds, propaganda billboards. The fog never lifts.'],
  twinsun: ['A desert under two suns: moisture towers, a cantina outpost, things that burrow.', 'Binary dunes. Heat shimmer, twin shadows, hooded scavengers.'],
};
const INTERIOR_DESC = {
  factory: 'Inside: a cramped data center.', mansion: 'Inside: a haunted personal homepage.', mineshaft: 'Inside: a crypto mine dug deep under the surface.',
  office: 'Inside: an abandoned content farm office block.', backrooms: 'Inside: endless yellow rooms. Do not noclip.',
  serverfarm: 'Inside: rows of screaming server racks.', sewer: 'Inside: the undernet sewers. Mind the slop.', hospital: 'Inside: a dead clinic. The machines still beep.',
  metro: 'Inside: a dead subway. Ghost trains still run the tunnel.', greenhouse: 'Inside: a feral hydroponics greenhouse. Vines and spores.',
  prison: 'Inside: a three-tier penitentiary. Lockdown slams the cell doors.', tower: 'Inside: a tower with an elevator shaft. The lower floors pay more.',   // [labyrinths]
};

// ------------------------------------------------------------------ modifiers (all effects are real: they only change moon def fields
// the host / world code already reads)
export const MODIFIERS = {
  motherlode: { name: 'MOTHERLODE', desc: 'Scrap is worth +30%. Word got around: creature power +10%.', risk: 0.3, apply(d) { d.scrapMul *= 1.3; d.power = Math.round(d.power * 1.1); } },
  infested: { name: 'INFESTED', desc: 'Creature power +35%. Nests hoard scrap: +4 items, scrap +20%.', risk: 1.0, apply(d) { d.power = Math.round(d.power * 1.35); d.scrapCount = d.scrapCount.map((v) => v + 4); d.scrapMul *= 1.2; } },
  botswarm: { name: 'BOT SWARM', desc: 'Spam Bots and Leechers everywhere.', risk: 0.4, apply(d) { add(d.creatures, 'scuttler', 40); add(d.creatures, 'leech', 14); } },
  firewalled: { name: 'FIREWALLED', desc: 'Extra turrets and clickbait mines guard +3 items of scrap.', risk: 0.6, apply(d) { add(d.creatures, 'turret', 14); add(d.creatures, 'mine', 18); d.scrapCount = d.scrapCount.map((v) => v + 3); } },
  deadsun: { name: 'DEAD SUN', desc: 'Permanent eclipse. Scrap +30%.', risk: 1.0, minTier: 2, apply(d) { d.weather = ['eclipsed']; d.scrapMul *= 1.3; } },
  fogbank: { name: 'FOG BANK', desc: 'Always foggy. Outdoor threats +30%.', risk: 0.4, apply(d) { d.weather = ['foggy']; d.outdoorPower = Math.round(d.outdoorPower * 1.3); } },
  overgrown: { name: 'OVERGROWN', desc: 'Dense cover outside.', risk: 0.2, apply(d) { d.treeMul = 1.8; } },
  clearance: { name: 'CLEARANCE', desc: 'Routing cost -60%.', risk: 0, apply(d) { d.cost = round10(d.cost * 0.4); } },
  trollcountry: { name: 'TROLL COUNTRY', desc: 'Trolls hunt outside. Scrap +15%.', risk: 0.7, apply(d) { add(d.outdoor, 'hound', 20); d.outdoorPower = Math.round(d.outdoorPower * 1.35); d.scrapMul *= 1.15; } },
  meetup: { name: 'INFLUENCER MEETUP', desc: 'Influencers gather outside. Scrap +15%.', risk: 0.9, minTier: 2, apply(d) { add(d.outdoor, 'giant', 16); d.scrapMul *= 1.15; } },
  wormsign: { name: 'WORMSIGN', desc: 'The Worm moves under the ground. Scrap +12%.', risk: 0.8, biomes: ['desert', 'ashfield', 'datascape', 'hills', 'crystal'], apply(d) { add(d.outdoor, 'sandkefal', 14); d.scrapMul *= 1.12; } },
  legacyvaults: { name: 'LEGACY VAULTS', desc: 'Bigger facility, more scrap.', risk: 0.5, apply(d) { d.size = Math.min(2.6, +(d.size + 0.3).toFixed(2)); d.scrapCount = d.scrapCount.map((v) => v + 3); } },
  meltdown: { name: 'MELTDOWN', desc: 'The lava rivers run wide. Scrap +25%, creature power +10%.', risk: 0.7, biomes: ['lava'], apply(d) { d.lavaMul = 1.5; d.scrapMul *= 1.25; d.power = Math.round(d.power * 1.1); } },
  whiteout: { name: 'WHITEOUT', desc: 'Permanent blizzard. Outdoor threats +25%, scrap +20%.', risk: 0.7, biomes: ['ice'], apply(d) { d.blizzard = true; d.weather = ['foggy']; d.outdoorPower = Math.round(d.outdoorPower * 1.25); d.scrapMul *= 1.2; } },
  linkbloom: { name: 'LINK BLOOM', desc: 'Rampant overgrowth. Bots and leechers love it. Scrap +15%.', risk: 0.5, biomes: ['jungle'], apply(d) { d.treeMul = 2.0; add(d.creatures, 'scuttler', 20); add(d.creatures, 'leech', 10); d.scrapMul *= 1.15; } },
  expedition: { name: 'EXPEDITION SITE', desc: 'More towers, ruins and parkour routes outside (and more chests).', risk: 0.1, apply(d) { d.landmarkBonus = 2; } },
  lowtraffic: { name: 'LOW TRAFFIC', desc: 'Fewer creatures, scrap -15%.', risk: -0.6, apply(d) { d.power = Math.max(2, Math.round(d.power * 0.7)); d.scrapMul *= 0.85; } },
};
function add(tbl, id, w) { tbl[id] = (tbl[id] || 0) + w; }
function round10(v) { return Math.round(v / 10) * 10; }

// ------------------------------------------------------------------ stats
const TIER_COST = [0, 0, 160, 420, 780, 1150, 1600];
export const WEATHER_POOL = {
  datascape: ['clear', 'foggy', 'stormy', 'eclipsed'], servermarsh: ['rainy', 'rainy', 'foggy', 'stormy', 'clear'],
  ashfield: ['clear', 'foggy', 'stormy', 'eclipsed'], crystal: ['clear', 'clear', 'foggy', 'eclipsed'],
  hills: ['clear', 'clear', 'rainy', 'foggy'], swamp: ['rainy', 'rainy', 'foggy', 'clear', 'stormy'], snow: ['clear', 'foggy', 'stormy', 'eclipsed'],
  desert: ['clear', 'clear', 'foggy', 'eclipsed'], moor: ['stormy', 'rainy', 'foggy', 'eclipsed'], blackforest: ['eclipsed', 'foggy', 'stormy'],
  lava: ['clear', 'clear', 'foggy', 'stormy', 'eclipsed'], ice: ['foggy', 'stormy', 'clear', 'foggy'], jungle: ['rainy', 'rainy', 'foggy', 'clear', 'stormy'],
  soviet: ['foggy', 'foggy', 'stormy', 'clear', 'eclipsed'], twinsun: ['clear', 'clear', 'clear', 'foggy', 'eclipsed'],
};
// indoor creature weights: [tier 1, tier 6] (lerped by tier); hazards handled separately
const INDOOR = { scuttler: [30, 10], yoinker: [22, 8], crawler: [10, 16], lurker: [5, 16], mannequin: [4, 16], sludge: [8, 10], spider: [10, 16],
  leech: [12, 12], jester: [0, 14], screamer: [3, 14], mimic: [3, 12] };
const INTERIOR_PACKS = {
  office: { yoinker: 14, mimic: 8, mannequin: 6 }, backrooms: { mannequin: 16, lurker: 10, screamer: 8, jester: 4 },
  serverfarm: { crawler: 12, turret: 10, scuttler: 10 }, sewer: { sludge: 14, leech: 14, spider: 10 }, hospital: { screamer: 14, mannequin: 10, lurker: 6 },
  mineshaft: { spider: 8, crawler: 6, leech: 6 }, mansion: { lurker: 6, jester: 4, screamer: 4 }, factory: { turret: 4 },
};
const DRY = new Set(['desert', 'ashfield', 'datascape']);
const RISK = [[1.8, 'LOW'], [2.9, 'MODERATE'], [4.0, 'HIGH'], [5.2, 'SEVERE'], [Infinity, 'LETHAL']];
export function riskLabel(score) { return RISK.find(([lim]) => score < lim)[1]; }

/** Map scale of a generated moon: bigger facilities and deeper sectors open bigger maps (terrain.js clamps to 1.6x for perf). */
export function mapScaleFor(size, index) {
  return +Math.min(1.6, Math.max(1, 1 + Math.max(0, size - 1.45) * 0.45 + Math.max(0, index) * 0.03)).toFixed(2);
}

// ------------------------------------------------------------------ generation (pure)
const sectorCache = new Map();
const HANDCRAFTED = ['hq', 'hamsi', 'lufer', 'palamut', 'levrek', 'cipura', 'orkinos'];   // fixed list: mod moons never change generation

export function generateSector(runKey, index) {
  index = Math.max(0, index | 0);
  const key = `${runKey}|${index}`;
  if (sectorCache.has(key)) return sectorCache.get(key);
  const R = new RNG(hashString('sector:' + key));
  const letter = 'ABCDEFGHJKLMNPQRSTUVWXYZ'[R.int(0, 23)];
  const name = `SECTOR ${index + 1}-${letter} "${R.pick(SECTOR_NAMES)}"`;
  const n = R.int(3, index >= 2 ? 5 : 4);
  // distinct biomes; the new generated-only biomes are favoured (at least one per sector)
  const pool = GEN_BIOME_IDS.filter((b) => BIOMES[b]).map((id) => ({ id, w: BIOMES[id].decor ? 9 : 5 }));
  const biomes = [];
  while (biomes.length < n) {
    const avail = pool.filter((p) => !biomes.includes(p.id));
    if (!avail.length) break;
    biomes.push(R.weighted(avail).id);
  }
  if (!biomes.some((b) => BIOMES[b]?.decor)) biomes[R.int(0, biomes.length - 1)] = R.pick(pool.filter((p) => BIOMES[p.id].decor && !biomes.includes(p.id))).id;
  if (index >= 1) {
    const W = new RNG(hashString('wx1:' + key));
    const avail = WAVE1_BIOMES.filter((id) => BIOMES[id] && (id !== 'lava' || index >= 2));
    const nSwap = index >= 4 && W.chance(0.5) ? 2 : W.chance(Math.min(0.95, 0.55 + index * 0.1)) ? 1 : 0;
    for (let sw = 0; sw < nSwap && avail.length; sw++) {
      const id = W.pick(avail);
      avail.splice(avail.indexOf(id), 1);
      if (biomes.includes(id)) continue;
      biomes[W.int(id === 'lava' ? 1 : 0, biomes.length - 1)] = id;   // lava never as the soft first server
    }
    // wave 3 (worlds2): deeper sectors may swap one slot for the Soviet district / twin-sun desert (own RNG stream, never the soft first server)
    const W3 = new RNG(hashString('w2:' + key));
    if (index >= 2 && W3.chance(Math.min(0.8, 0.25 + index * 0.12)) && biomes.length > 1) {
      const id = W3.pick(WORLDS2_BIOMES.filter((b) => BIOMES[b] && (b !== 'soviet' || index >= 2)));
      if (id && !biomes.includes(id)) biomes[W3.int(1, biomes.length - 1)] = id;
    }
  }
  const base = 1 + Math.floor(index / 2);
  const tiers = [];
  for (let k = 0; k < biomes.length; k++) {
    let t = base + R.int(0, 1);
    if (k === 0) t = Math.max(1, base - 1);                 // a softer "safe" server in every sector
    if (k === biomes.length - 1) t = base + 1 + R.int(0, 1); // and a deep one worth the risk
    tiers.push(Math.max(1, Math.min(6, t)));
  }
  const usedNames = new Set(HANDCRAFTED.map((id) => MOONS[id]?.name).filter(Boolean));
  const moons = biomes.map((biome, k) => generateMoon({ runKey, index, k, biome, tier: tiers[k], usedNames, safe: k === 0, deep: k === biomes.length - 1 }));
  const sector = { key, index, name, moons, runKey };
  sectorCache.set(key, sector);
  if (sectorCache.size > 6) sectorCache.delete(sectorCache.keys().next().value);
  return sector;
}

/** [voyage] one moon from a free-form key (random voyages, uncharted signals): the sector generator with no registry side effects. */
export function generateMoonFromKey(key, { biome, tier, index = 0, safe = false, deep = false }) {
  return generateMoon({ runKey: key, index, k: 0, biome, tier, usedNames: new Set(), safe, deep });
}

function generateMoon({ runKey, index, k, biome, tier, usedNames, safe, deep }) {
  const R = new RNG(hashString(`moon:${runKey}|${index}|${k}`));
  const B = BIOMES[biome] || BIOMES.hills;
  // name
  let name = '', short = '';
  for (let t = 0; t < 12; t++) {
    const [noun, nounShort] = R.pick(NOUNS);
    const roll = R.next();
    const adj = roll < 0.35 ? R.pick(BIOME_ADJ[biome] || ADJ) : roll < 0.85 ? R.pick(ADJ) : '';
    const code = R.chance(0.5) ? R.pick(CODES) : `${R.int(1, 9)}${'ABCDEF'[R.int(0, 5)]}${R.int(0, 9)}`;
    name = `${code}-${adj ? adj + ' ' : ''}${noun}`;
    short = adj && (adj.length + nounShort.length) < 14 ? `${adj} ${nounShort}` : nounShort;
    if (!usedNames.has(name)) break;
  }
  usedNames.add(name);
  // interior (the pick never depends on what is registered; only the fallback does)
  const bonus = BIOME_INTERIOR_BONUS[biome] || {};
  const iw = Object.entries(INTERIOR_W).map(([id, w]) => ({ id, w: w + (bonus[id] || 0) }));
  const wanted = R.weighted(iw).id;
  let interior = interiorAvailable(wanted) ? wanted : 'factory';
  { const li = labInterior(runKey, index, k, biome, tier, interior); if (li && interiorAvailable(li)) interior = li; }   // [labyrinths]
  { const l12 = labInterior12(runKey, index, k, biome, tier, interior); if (l12 && interiorAvailable(l12)) interior = l12; }   // [labyr12] feature-detected: falls back to the interior picked above
  // size / scale
  let size = 1.0 + (tier - 1) * 0.28 + R.float(-0.1, 0.35) + (deep ? 0.15 : 0);
  size = +Math.max(1.0, Math.min(2.6, size)).toFixed(2);
  const tf = (tier - 1) / 5;
  // creature budget per tier (balance round, tools/sim/economy.mjs): expected haul grows faster per tier than the
  // threat (budget x creature level), so a deeper server pays for its risk once the quota demands it
  const power = Math.round(2.6 + tier * 1.45 + (size - 1) * 0.8);
  const outdoorPower = Math.max(2, Math.round(1 + tier * 1.8 + R.float(0, 1.5)));
  const scrapMul = +(0.8 + tier * 0.24 * R.float(0.92, 1.08) + (deep ? 0.1 : 0)).toFixed(2);
  const scrapCount = [Math.round(8 + size * 6 + tier), Math.round(12 + size * 8 + tier * 1.3)];
  let cost = tier <= 1 ? (safe || R.chance(0.5) ? 0 : 40) : round10(TIER_COST[tier] * R.float(0.85, 1.15) * (1 + (size - 1) * 0.25));
  if (safe && tier > 1) cost = round10(cost * 0.5);
  // weather
  const weather = (WEATHER_POOL[biome] || ['clear', 'foggy']).slice();
  if (tier >= 4) weather.push('stormy', 'eclipsed');
  // creatures: own stream (so a table change never shifts names/biomes)
  const C = R.fork('creatures');
  const creatures = {};
  const species = C.shuffle(Object.keys(INDOOR));
  const drop = C.int(1, 3);
  for (const id of species.slice(drop)) {
    const [lo, hi] = INDOOR[id];
    const w = Math.round((lo + (hi - lo) * tf) * C.float(0.6, 1.4));
    if (w > 0) creatures[id] = w;
  }
  if (tier < 2) delete creatures.jester;
  creatures.turret = Math.round(4 + tier * 1.5 + C.float(0, 4));
  creatures.mine = Math.round(8 + tier + C.float(0, 6));
  for (const [id, w] of Object.entries(INTERIOR_PACKS[interior] || {})) add(creatures, id, w);
  // creatures registered at boot from downloaded models (extcontent.js): host-only tables, own stream
  const X = R.fork('ext');
  const EXT = { skeleton: ['mansion', 'hospital', 'backrooms', 'mineshaft'], robot: ['serverfarm', 'factory', 'office'] };
  for (const [id, homes] of Object.entries(EXT)) {
    const w = Math.round(X.float(4, 12));
    if (CREATURES[id] && (homes.includes(interior) || X.chance(0.25))) creatures[id] = w;
  }
  const outdoor = { hound: 5 + tier * 2, mimic: 2 + tier };
  if (tier >= 2) outdoor.giant = Math.round(2 + tier * 1.5);
  if (DRY.has(biome)) outdoor.sandkefal = 3 + tier;
  if (biome === 'twinsun') Object.assign(outdoor, { dunemaw: 5 + tier * 2, tuskbeast: 6 + tier, scavraider: 4 + tier * 2 });   // wave 3: planet creatures (game/worlds2_creatures.js)
  // ponds: flooded / burnt maps have none, datascape gets glowing data pools sometimes
  const ponds = B.flood != null || biome === 'ashfield' || biome === 'lava' || biome === 'ice' || biome === 'twinsun' || biome === 'soviet' ? 0 : biome === 'crystal' ? 1 : biome === 'datascape' ? R.int(0, 1) : undefined;
  const def = {
    id: `${GEN_PREFIX}${index}_${k}`, name, short, tier, cost, biome, interior, size, generated: true, sector: index, slot: k,
    weather, scrapCount, scrapMul, power, outdoorPower, creatures, outdoor, mods: [],
    mapScale: mapScaleFor(size, index),
  };
  if (ponds !== undefined) def.ponds = ponds;
  if (biome === 'soviet') def.raid = { first: 190, every: 270, n: 3, factions: ['bureau', 'algorithm', 'archive', 'darkweb'] };   // wave 3: raid director (game/worlds2.js)
  if (biome === 'twinsun') def.cantina = true;
  if (interior !== wanted) def.wantedInterior = wanted;
  if (deep && index >= 1) def.layoutOpts = { plan: 'wings', wings: 2, labyrinth: 1, kind: 'deep' };   // [cycle] the deepest server of every sector from sector 2: wings, a labyrinth and named zones (world/facility.js)
  // modifiers
  const M = R.fork('mods');
  const nMods = safe ? (M.chance(0.35) ? 1 : 0) : tier >= 3 ? M.int(0, 2) : (M.chance(0.5) ? 1 : 0);
  const modPool = Object.entries(MODIFIERS).filter(([, m]) => (!m.minTier || tier >= m.minTier) && (!m.biomes || m.biomes.includes(biome)) && (!safe || m.risk <= 0.4));
  for (let i = 0; i < nMods && modPool.length; i++) {
    const [id, m] = modPool.splice(M.int(0, modPool.length - 1), 1)[0];
    m.apply(def);
    def.mods.push(id);
  }
  def.scrapMul = +def.scrapMul.toFixed(2);
  if (def.mods.includes('legacyvaults')) def.mapScale = mapScaleFor(def.size, index);
  const riskMods = def.mods.reduce((s, id) => s + (MODIFIERS[id].risk || 0), 0);
  def.riskScore = +(tier + riskMods).toFixed(2);   // relative to other moons (every moon scales with the quota the same way)
  def.risk = riskLabel(def.riskScore);
  def.desc = `${R.pick(BIOME_DESC[biome] || BIOME_DESC.hills)} ${INTERIOR_DESC[interior] || ''}${def.mods.length ? ' ' + def.mods.map((id) => MODIFIERS[id].desc).join(' ') : ''}`.trim();
  // position on the SECTOR map (terminal): spread around the ship, left-to-right by slot
  def.mapPos = { x: 0.18 + (k + 0.5) / 5.4 * 0.8 + R.float(-0.04, 0.04), y: R.float(0.1, 0.9) };
  return def;
}

// ------------------------------------------------------------------ runtime registry
let current = null;   // { key, sector, extraIds }

const runKeyOf = (run) => String(run?.runId ?? 'legacy');

function unregisterGenerated(keep) {
  for (let i = MOON_ORDER.length - 1; i >= 0; i--) {
    const id = MOON_ORDER[i];
    if (MOONS[id]?.generated && !keep.has(id)) { delete MOONS[id]; MOON_ORDER.splice(i, 1); }
  }
  for (const id of Object.keys(MOONS)) if (MOONS[id]?.generated && !keep.has(id)) delete MOONS[id];
}

function register(def, stale) {
  MOONS[def.id] = stale ? { ...def, stale: true } : def;
  if (!MOON_ORDER.includes(def.id)) MOON_ORDER.push(def.id);
}

function parseId(id) {
  const m = GEN_RE.exec(String(id || ''));
  return m ? { index: +m[1], k: +m[2] } : null;
}

/** A moon definition for id in this run, registered or not (null when it does not exist). */
export function resolveMoon(run, id = run?.moon) {
  if (MOONS[id]) return MOONS[id];
  const p = parseId(id);
  return p ? generateSector(runKeyOf(run), p.index).moons[p.k] || null : null;
}

/**
 * Register the run's current sector (idempotent, cheap when nothing changed). Call after every run-state
 * update on every peer. Returns { key, index, name, moons, changed, prevKey }.
 */
export function ensureSector(run) {
  if (!run) return null;
  const index = Math.max(0, run.quotaIndex | 0);
  const key = `${runKeyOf(run)}|${index}`;
  const want = parseId(run.moon);
  const moonOk = !want || !!MOONS[run.moon];
  if (current && current.key === key && moonOk) { fillForecast(run, current.sector); return { ...current.sector, changed: false, prevKey: key }; }
  const prevKey = current?.key || null;
  const sector = generateSector(runKeyOf(run), index);
  const keep = new Set(sector.moons.map((m) => m.id));
  // a saved / routed moon from an older sector stays resolvable (flagged stale: it cannot be routed to again)
  let extra = null;
  if (want && want.index !== index) {
    extra = generateSector(runKeyOf(run), want.index).moons[want.k] || null;
    if (extra) keep.add(extra.id);
  }
  unregisterGenerated(keep);
  for (const m of sector.moons) register(m, false);
  if (extra) register(extra, true);
  if (want && !MOONS[run.moon]) run.moon = 'hamsi';   // unknown slot (should never happen): fall back safely, same on every peer
  current = { key, sector };
  fillForecast(run, sector);
  return { ...sector, changed: key !== prevKey, prevKey };
}

// forecasts for generated moons that the host has not rolled yet (new sector mid-cycle): deterministic
function fillForecast(run, sector) {
  if (!run.forecast || typeof run.forecast !== 'object') run.forecast = {};
  for (const m of sector.moons) {
    if (run.forecast[m.id]) continue;
    const r = new RNG(hashString(`wx:${sector.key}|${m.id}|${run.day | 0}`));
    run.forecast[m.id] = r.pick(m.weather);
  }
}

/** HUD texts for a freshly charted sector: { title, sub, toast } (EN / TR). */
export function sectorAnnouncement(sector) {
  const n = sector?.moons?.length || 0;
  const tr = (() => { try { return getLang() === 'tr'; } catch { return false; } })();
  const deep = sector?.moons?.[n - 1];
  return tr
    ? { title: 'YENİ SEKTÖR HARİTALANDI', sub: `${sector.name} · ${n} keşfedilmemiş sunucu`, toast: `Yeni sektör: ${n} keşfedilmemiş sunucu. Terminalde SECTOR yaz.${deep ? ` En derin: ${deep.name} (T${deep.tier}).` : ''}` }
    : { title: 'NEW SECTOR CHARTED', sub: `${sector.name} · ${n} uncharted servers`, toast: `New sector: ${n} uncharted servers. Type SECTOR at the terminal.${deep ? ` Deepest: ${deep.name} (T${deep.tier}).` : ''}` };
}

export function currentSector() { return current?.sector || null; }

/** Sector moons in slot order (current sector only). */
export function sectorMoons() { return (current?.sector.moons || []).map((m) => MOONS[m.id] || m); }

export function biomeName(id) {
  const b = BIOMES[id];
  if (b?.name) return b.name;
  return { hills: 'Green Hills', swamp: 'Swamp', snow: 'Snowfield', desert: 'Red Desert', moor: 'Moor', blackforest: 'Black Forest', pier: 'Pier' }[id] || id;
}

/** Test hook: forget the registry state (node sanity scripts). */
export function _resetSectorState() { current = null; sectorCache.clear(); unregisterGenerated(new Set()); }
