// VOYAGE core (wave 4) - PURE rules: no three.js, no DOM, no network. Everything here is deterministic from an id / run key and unit-tested in
// tools/harness/voyage.test.mjs (generator determinism + validity over 300 seeds, mission state machines, warp guard, board / signals).
//
//   voyage id     `vy<tier><content>_<seed36>`   tier 1-6, content letter (n = none), seed = 32-bit number in base 36.
//                 The id alone rebuilds the whole moon on every peer (generateVoyageMoon) - nothing else travels over the net.
//   content       derelict ship, abandoned colony, alien temple, merchant outpost, pirate camp, crashed Company freighter, meteor shower field
//   warp          navigation glitch / distress signal at the lever (12 %, never in the first 2 quotas unless the crew opts in)
//   signals       3 "uncharted signals" per in-run day (terminal MOONS / SIGNALS)
//   missions      9 job types with a pure state machine (stepMission) + board generation (boardFor)
//   flats         terrain flatten zones / site positions for set pieces and mission props (voyageFlats, used by world/terrain.js planMoon)
import { MOONS, BIOMES } from './moons.js';
import { generateMoonFromKey } from './moongen.js';
import { RNG, hashString } from '../core/rng.js';
import '../world/voyage_biomes_data.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ contents (set pieces)
export const CONTENT = {
  derelict: { l: 'd', name: 'Derelict Ship', w: 14, minTier: 1, loot: 1.15, blurb: 'A derelict ship lies out here. Something still blinks in its bridge.' },
  colony: { l: 'c', name: 'Abandoned Colony', w: 14, minTier: 1, loot: 1.0, blurb: 'An abandoned colony: cabins, a generator and a log terminal nobody read.' },
  temple: { l: 't', name: 'Alien Temple', w: 10, minTier: 2, loot: 1.3, blurb: 'An alien temple. The relic on the altar is worth a fortune. It knows.' },
  merchant: { l: 'm', name: 'Merchant Outpost', w: 10, minTier: 1, loot: 0.6, blurb: 'A merchant outpost glows in the dark. Bring credits.' },
  pirate: { l: 'p', name: 'Pirate Camp', w: 12, minTier: 2, loot: 1.2, blurb: 'A pirate camp guards a strongbox. They have seen you.' },
  freighter: { l: 'f', name: 'Crashed Freighter', w: 14, minTier: 1, loot: 1.25, blurb: 'A Company freighter crashed here. Its cargo is still in the hold.' },
  meteor: { l: 'r', name: 'Meteor Shower Field', w: 10, minTier: 1, loot: 1.1, blurb: 'A meteor shower field. The rocks are worth money. The sky disagrees.' },
};
export const CONTENT_IDS = Object.keys(CONTENT);
const LETTER_TO_CONTENT = Object.fromEntries(CONTENT_IDS.map((id) => [CONTENT[id].l, id]));
/** Content -> flat zone radius / fall of its set piece (world/voyage_world.js builds within this footprint). */
export const CONTENT_R = 15;

// ------------------------------------------------------------------ ids
const ID_RE = /^vy([1-6])([a-z])_([0-9a-z]{1,7})$/;
export const isVoyageId = (id) => ID_RE.test(String(id || ''));
export function parseVoyageId(id) {
  const m = ID_RE.exec(String(id || ''));
  if (!m) return null;
  const c = m[2] === 'n' ? null : LETTER_TO_CONTENT[m[2]];
  if (m[2] !== 'n' && !c) return null;
  const seed = parseInt(m[3], 36);
  if (!Number.isFinite(seed) || seed < 0 || seed > 4294967295) return null;
  return { tier: +m[1], content: c, seed };
}
export function makeVoyageId(tier, content, seed) {
  return `vy${clamp(tier | 0, 1, 6)}${content ? CONTENT[content].l : 'n'}_${(seed >>> 0).toString(36)}`;
}

// ------------------------------------------------------------------ name generator ("KX-41 Verdant Hollow")
const NAMEBANK = {
  vycrys: [['Glass', 'Singing', 'Prismatic', 'Pink', 'Shardglass'], ['Flats', 'Dunes', 'Reach', 'Spires']],
  vyfung: [['Spored', 'Glowcap', 'Damp', 'Mildew', 'Sour'], ['Bog', 'Fen', 'Warren', 'Hollow']],
  vysky: [['Airy', 'Drifting', 'Skybound', 'Feather', 'Windward'], ['Shards', 'Isles', 'Perch', 'Steps']],
  vyacid: [['Caustic', 'Etched', 'Bleached', 'Sour', 'Vitriol'], ['Shore', 'Strand', 'Tideline', 'Bay']],
  vystorm: [['Gale', 'Thunder', 'Bare', 'Shattered', 'Anvil'], ['Plateau', 'Mesa', 'Table', 'Rise']],
  vybone: [['Pale', 'Ancient', 'Hollow', 'Bleached', 'Silent'], ['Field', 'Ossuary', 'Barrow', 'Fields']],
  vyneon: [['Neon', 'Flickering', 'Afterhours', 'Holo', 'Chrome'], ['Ruins', 'Avenue', 'Arcade', 'District']],
  vyrust: [['Rusted', 'Hollowed', 'Scrap', 'Iron', 'Groaning'], ['City', 'Spires', 'Yards', 'Works']],
  hills: [['Verdant', 'Rolling', 'Sunny', 'Early'], ['Hollow', 'Downs', 'Meadow', 'Vale']], swamp: [['Soggy', 'Sunken', 'Mire'], ['Bog', 'Marsh', 'Sump']],
  snow: [['Frozen', 'Cold', 'Snowed-In'], ['Drift', 'Ridge', 'Pass']], desert: [['Dusty', 'Sunbaked', 'Buried'], ['Wastes', 'Mesa', 'Dunes']],
  moor: [['Stormy', 'Grim', 'Haunted'], ['Moor', 'Heath', 'Fell']], blackforest: [['Dark', 'Eclipsed', 'Blackout'], ['Woods', 'Thicket', 'Grove']],
  datascape: [['Glitched', 'Recursive', 'Fragmented'], ['Grid', 'Lattice', 'Plane']], servermarsh: [['Flooded', 'Drowned', 'Leaking'], ['Marsh', 'Sump', 'Racks']],
  ashfield: [['Burnt', 'Scorched', 'Charred'], ['Fields', 'Cinders', 'Works']], crystal: [['Cached', 'Crystal', 'Compressed'], ['Cache', 'Spires', 'Vault']],
  lava: [['Molten', 'Overclocked', 'Thermal'], ['Basin', 'Forge', 'Sink']], ice: [['Frozen', 'Glacial', 'Permafrost'], ['Storage', 'Shelf', 'Sheet']],
  jungle: [['Overgrown', 'Tangled', 'Humid'], ['Canopy', 'Thicket', 'Rot']], soviet: [['Brutalist', 'Grey', 'Panel'], ['District', 'Blocks', 'Yards']],
  twinsun: [['Binary', 'Twin-Sun', 'Dune'], ['Sea', 'Flats', 'Basin']],
};
export function voyageName(R, biome) {
  const bank = NAMEBANK[biome] || NAMEBANK.hills;
  const L = 'KXZQVTWRJMHN';
  const code = `${L[R.int(0, L.length - 1)]}${L[R.int(0, L.length - 1)]}-${R.int(11, 99)}`;
  const adj = R.pick(bank[0]), noun = R.pick(bank[1]);
  return { name: `${code} ${adj} ${noun}`, short: `${adj} ${noun}` };
}

// ------------------------------------------------------------------ biome / content roll
const OLD_BIOMES = ['hills', 'swamp', 'snow', 'desert', 'moor', 'blackforest', 'datascape', 'servermarsh', 'ashfield', 'crystal', 'lava', 'ice', 'jungle', 'soviet', 'twinsun'];
const NEW_BIOMES = ['vycrys', 'vyfung', 'vysky', 'vyacid', 'vystorm', 'vybone', 'vyneon', 'vyrust'];
const BIOME_MIN_TIER = { lava: 3, soviet: 3, vystorm: 2, vyacid: 2, vybone: 2 };
export function biomePool(tier) {
  const out = [];
  for (const id of NEW_BIOMES) if (BIOMES[id] && tier >= (BIOME_MIN_TIER[id] || 1)) out.push({ id, w: 10 });
  for (const id of OLD_BIOMES) if (BIOMES[id] && tier >= (BIOME_MIN_TIER[id] || 1)) out.push({ id, w: 3 });
  return out;
}
export function contentPool(tier) { return CONTENT_IDS.filter((id) => tier >= CONTENT[id].minTier).map((id) => ({ id, w: CONTENT[id].w })); }
/** Random content id for a tier (or null with probability pNone). */
export function rollContent(R, tier, pNone = 0.3) { if (R.chance(pNone)) return null; const p = contentPool(tier); return p.length ? R.weighted(p).id : null; }

// ------------------------------------------------------------------ the moon definition (pure function of the id)
const moonCache = new Map();
/**
 * Full moon definition for a voyage id, shaped like every other MOONS entry (biome, interior, creatures, loot, weather, modifiers...) plus
 * { voyage: true, content, gravity, timeMul, vy: { seed, tier } }. Not registered anywhere: see registerVoyageMoon.
 */
export function generateVoyageMoon(id) {
  const P = parseVoyageId(id);
  if (!P) return null;
  if (moonCache.has(id)) return moonCache.get(id);
  const R = new RNG(hashString('vy:' + id));
  const biome = R.weighted(biomePool(P.tier)).id;
  const def = generateMoonFromKey('vy|' + id, { biome, tier: P.tier, index: Math.max(0, P.tier - 1), safe: false, deep: false });
  const nm = voyageName(R.fork('name'), biome);
  const B = BIOMES[biome];
  def.id = id; def.generated = false; def.voyage = true; def.sector = undefined; def.slot = undefined; delete def.mapPos;
  def.name = nm.name; def.short = nm.short;
  def.content = P.content;
  def.gravity = B.gravity || 1;
  def.timeMul = +(0.9 + R.fork('day').float(0, 0.26)).toFixed(2);   // day length: 0.9x (long day) .. 1.16x (short day)
  def.vy = { seed: P.seed, tier: P.tier };
  if (biome === 'vystorm') def.weather = ['stormy', 'stormy', 'rainy'];
  if (P.content === 'meteor') def.weather = def.weather.filter((w) => w !== 'foggy').concat(['clear']);
  if (P.content) def.scrapMul = +(def.scrapMul * CONTENT[P.content].loot ** 0.35).toFixed(2);   // the set piece is the bonus, not the whole map
  def.desc = `${def.desc}${P.content ? ' ' + CONTENT[P.content].blurb : ''}${def.gravity < 1 ? ' Low gravity.' : ''}`.trim();
  moonCache.set(id, def);
  if (moonCache.size > 40) moonCache.delete(moonCache.keys().next().value);
  return def;
}

/** Test hook: forget cached definitions (determinism tests). */
export function _clearVoyageCache() { moonCache.clear(); }

/** Register (idempotent) a voyage moon into MOONS so the rest of the game treats it like any moon. Never added to MOON_ORDER. */
export function registerVoyageMoon(id) {
  if (MOONS[id]) return MOONS[id];
  const d = generateVoyageMoon(id);
  if (d) MOONS[id] = d;
  return d;
}

/** A fresh random voyage id for `tier` (host only: the caller supplies the RNG so tests are deterministic). */
export function rollVoyageId(R, tier, { content, pNone = 0.3 } = {}) {
  const t = clamp(tier | 0, 1, 6);
  const c = content === undefined ? rollContent(R, t, pNone) : content;
  return makeVoyageId(t, c, Math.floor(R.next() * 4294967295));
}
export const tierForQuota = (quotaIndex, R = null) => clamp(1 + Math.floor((quotaIndex | 0) / 2) + (R && R.chance(0.35) ? 1 : 0), 1, 6);
/** Fee of "moon random" (a gamble, always paid; freeTravel does not waive it). */
export const randomFee = (quotaIndex) => 20 + Math.min(40, Math.max(0, quotaIndex | 0) * 8);

// ------------------------------------------------------------------ uncharted signals (rotate with the in-run day)
export function signalsFor(runKey, day, quotaIndex, n = 3) {
  const R = new RNG(hashString(`vysig:${runKey}|${day | 0}|${quotaIndex | 0}`));
  const base = tierForQuota(quotaIndex);
  const out = [], used = new Set();
  for (let i = 0; i < n; i++) {
    const tier = clamp(base + (i === n - 1 ? 1 : 0) - (i === 0 && base > 1 ? 1 : 0), 1, 6);
    let c = null;
    for (let t = 0; t < 8; t++) { c = rollContent(R, tier, i === 0 ? 0 : 0.15); if (!used.has(c)) break; }   // every signal a different set piece
    used.add(c);
    out.push(rollVoyageId(R, tier, { content: c }));
  }
  return out;
}

// ------------------------------------------------------------------ random warp events
export const WARP = { chance: 0.12, pityChance: 0.2, pityDays: 6, cooldownDays: 2, minQuotaIndex: 2, distressShare: 0.6, voteSec: 15, glitchDelaySec: 4 };
/**
 * state: { quotaIndex, mode: 'on'|'off'|'early', sinceDays (days since the last warp), company, home, instance, daysLeft }.
 * mode 'off' = never. Before quota #3 (quotaIndex < 2) nothing happens unless the crew opted in with mode 'early'.
 */
export function warpChance(s) {
  if (!s || s.mode === 'off') return 0;
  if (s.company || s.home || s.instance || s.voyage || s.expedition) return 0;   // HQ, homeworld, cycle instances, and a moon that is already a voyage
  if ((s.daysLeft | 0) <= 0) return 0;                            // deadline day: the Company pulls the ship in
  if ((s.quotaIndex | 0) < WARP.minQuotaIndex && s.mode !== 'early') return 0;
  const since = s.sinceDays == null ? 99 : s.sinceDays;
  if (since < WARP.cooldownDays) return 0;
  return since >= WARP.pityDays ? WARP.pityChance : WARP.chance;
}
/** null | { kind: 'glitch'|'distress', id } (id = the voyage moon the ship would drop on) */
export function rollWarp(R, s) {
  const p = warpChance(s);
  if (p <= 0 || !R.chance(p)) return null;
  const tier = tierForQuota(s.quotaIndex, R);
  const kind = R.chance(WARP.distressShare) ? 'distress' : 'glitch';
  const content = kind === 'distress' ? R.pick(['derelict', 'freighter', 'colony', 'pirate', 'temple'].filter((c) => CONTENT[c].minTier <= tier)) : rollContent(R, tier, 0.2);
  return { kind, id: rollVoyageId(R, tier, { content }) };
}
/** Majority vote for a distress prompt: strictly more yes than no; no votes / a tie = ignore. */
export const voteOutcome = (yes, no) => yes > no;

// ------------------------------------------------------------------ missions
/**
 * pay = credits at tier 1, sites = how many set-piece sites (flat zones) the job needs, goal = progress units.
 * hold jobs (defend / heist) tick while a crewmate is near the site.
 */
export const MISSION_TYPES = {
  rescue:   { pay: 95,  xp: 90,  goal: 2, sites: 1, w: 12, name: 'Rescue Stranded Crew', brief: 'A crewmate is stranded in an escape pod. Free them and escort them back to the ship alive.' },
  blackbox: { pay: 75,  xp: 70,  goal: 1, sites: 1, w: 12, name: 'Retrieve Black Box', brief: 'A flight recorder went down out here. Bring it to the ship intact.' },
  relay:    { pay: 85,  xp: 80,  goal: 3, sites: 1, w: 10, name: 'Repair Relay Tower', brief: 'A relay tower is down. Restore its three power panels (something will notice).' },
  hunt:     { pay: 115, xp: 120, goal: 1, sites: 1, w: 9,  name: 'Marked Creature', brief: 'A marked predator hunts near its lair. Kill it. The Company pays extra for proof.' },
  drone:    { pay: 105, xp: 100, goal: 2, sites: 2, w: 9,  name: 'Escort Cargo Drone', brief: 'Power up a cargo drone and escort it to the drop beacon. It only moves while you are near.' },
  survey:   { pay: 80,  xp: 85,  goal: 4, sites: 0, w: 11, name: 'Anomaly Survey', brief: 'Take readings at scattered anomalies. Each one hums. Some hum back.' },
  defend:   { pay: 125, xp: 110, goal: 1, sites: 1, w: 9,  name: 'Defend the Mining Rig', brief: 'Start the mining rig and keep it (and yourselves) alive until the timer runs out.' },
  heist:    { pay: 150, xp: 130, goal: 1, sites: 1, w: 7,  name: 'Vault Heist', brief: 'Crack the vault. The alarm will call every guard. Hold the door until it opens.' },
  photo:    { pay: 70,  xp: 75,  goal: 1, sites: 0, w: 9,  name: 'Photograph a Rare Creature', brief: 'A shy rare creature roams here. Take a photo of it with the Instant Camera from under 30 m.' },
};
export const MISSION_IDS = Object.keys(MISSION_TYPES);
/** [story] which patron a job type works for (Company = logistics / property, Algorithm = content / spectacle) */
export const MISSION_PATRON = { blackbox: 'company', relay: 'company', drone: 'company', defend: 'company', hunt: 'company', rescue: 'algorithm', survey: 'algorithm', heist: 'algorithm', photo: 'algorithm' };
export const missionPatron = (type) => MISSION_PATRON[type] || null;
export const HOLD_TYPES = new Set(['defend', 'heist']);
export const TOWER_PANELS = 3;

const payFor = (type, tier, qi) => Math.round((MISSION_TYPES[type].pay * (1 + 0.28 * (tier - 1)) * (1 + 0.07 * Math.min(10, qi | 0))) / 5) * 5;
const xpFor = (type, tier, qi) => Math.round(MISSION_TYPES[type].xp * (1 + 0.2 * (tier - 1) + 0.05 * Math.min(10, qi | 0)));

/** One offer for a destination moon id. `tier` = that moon's tier. */
export function makeOffer(R, type, moonId, tier, qi) {
  const spec = MISSION_TYPES[type];
  const o = { id: `${type}:${moonId}:${Math.floor(R.next() * 1e6).toString(36)}`, type, patron: missionPatron(type), moon: moonId, tier, pay: payFor(type, tier, qi), xp: xpFor(type, tier, qi) };
  if (type === 'survey') o.n = clamp(3 + Math.floor(tier / 2) + (R.chance(0.4) ? 1 : 0), 3, 6);
  else if (type === 'defend') o.n = clamp(120 + tier * 20 + R.int(0, 30), 120, 240);      // seconds
  else if (type === 'heist') o.n = clamp(30 + tier * 5 + R.int(0, 10), 30, 60);          // seconds of cracking
  else o.n = spec.goal;
  // extra loot: a chest roll at the ship (iron from tier 1-2, gold from tier 4), components / tier gear
  o.loot = tier >= 4 ? 'gold' : (tier >= 2 || R.chance(0.4)) ? 'iron' : 'wood';
  if (type === 'heist' || type === 'hunt') o.loot = tier >= 3 ? 'gold' : 'iron';
  o.comps = type === 'relay' || type === 'blackbox' ? 2 + (tier >= 3 ? 1 : 0) : (R.chance(0.5) ? 1 : 0);
  return o;
}

/** Job types that can run on a moon: photo needs the camera (always allowed), the rest are outdoors set pieces. */
export function missionTypesFor(moon) { void moon; return MISSION_IDS; }

/** The mission board: 4 offers (2 for charted moons, 2 for signals), stable for (run, day, quota). moons = [{id, tier}] routable charted moons. */
export function boardFor(runKey, day, quotaIndex, moons, signalIds = null) {
  const R = new RNG(hashString(`vyboard:${runKey}|${day | 0}|${quotaIndex | 0}`));
  const sig = signalIds || signalsFor(runKey, day, quotaIndex);
  const dests = [];
  const charted = moons.filter((m) => m && !m.company && !m.home && !m.instance && !m.stale && !m.expedition);
  const pool = R.shuffle(charted.slice());
  for (const m of pool.slice(0, 2)) dests.push({ id: m.id, tier: m.tier || 1 });
  for (const id of sig.slice(0, 4 - dests.length)) dests.push({ id, tier: parseVoyageId(id)?.tier || 1 });
  const wt = MISSION_IDS.map((id) => ({ id, w: MISSION_TYPES[id].w }));
  return dests.map((d) => {
    const pick = R.weighted(wt);
    wt.splice(wt.indexOf(pick), 1);   // four different jobs on the board
    return makeOffer(R, pick.id, d.id, d.tier, quotaIndex);
  });
}

// ---- mission state machine (pure). m = { id, type, moon, tier, n, pay, xp, loot, comps, st, p } ; st: accepted | active | done | failed
export function newMission(offer, day = 0) {
  return { id: offer.id, type: offer.type, patron: offer.patron || missionPatron(offer.type), moon: offer.moon, tier: offer.tier, n: offer.n, pay: offer.pay, xp: offer.xp, loot: offer.loot, comps: offer.comps, day, st: 'accepted', p: {} };
}
const cp = (m) => ({ ...m, p: { ...m.p, panels: m.p.panels ? m.p.panels.slice() : undefined, reads: m.p.reads ? m.p.reads.slice() : undefined } });
/** progress fraction 0..1 for the HUD */
export function missionProgress(m) {
  if (!m) return 0;
  if (m.st === 'done') return 1;
  const p = m.p || {};
  switch (m.type) {
    case 'rescue': return (p.freed ? 0.5 : 0) + (p.safe ? 0.5 : 0);
    case 'relay': return (p.panels || []).filter(Boolean).length / TOWER_PANELS;
    case 'drone': return (p.on ? 0.25 : 0) + (p.done ? 0.75 : 0) + (p.frac || 0) * 0.5 * (p.done ? 0 : 1);
    case 'survey': return (p.reads || []).filter(Boolean).length / Math.max(1, m.n);
    case 'defend': case 'heist': return clamp((p.t || 0) / Math.max(1, m.n), 0, 1);
    default: return p.done ? 1 : 0;
  }
}
/**
 * Apply one event. Returns { m, fx } where fx is a list of { k } (host side effects / messages): 'active', 'progress', 'done', 'failed'.
 * Events: land{moon} takeoff  npc_freed npc_safe npc_dead  delivered  panel{i}  target_dead  drone_on drone_move{frac} drone_done drone_dead
 *         read{i}  hold_start hold_tick{dt} hold_fail  photo  abandon
 */
export function stepMission(m0, ev) {
  if (!m0 || m0.st === 'done' || m0.st === 'failed') return { m: m0, fx: [] };
  const m = cp(m0), fx = [];
  const done = () => { m.st = 'done'; fx.push({ k: 'done' }); };
  const fail = (why) => { m.st = 'failed'; fx.push({ k: 'failed', why }); };
  const prog = () => fx.push({ k: 'progress' });
  if (ev.t === 'abandon') { fail('abandoned'); return { m, fx }; }
  if (m.st === 'accepted') {
    if (ev.t === 'land' && ev.moon === m.moon) { m.st = 'active'; fx.push({ k: 'active' }); }
    return { m, fx };
  }
  // active
  if (ev.t === 'takeoff') { fail('left'); return { m, fx }; }
  const p = m.p;
  switch (m.type) {
    case 'rescue':
      if (ev.t === 'npc_freed' && !p.freed) { p.freed = true; prog(); }
      else if (ev.t === 'npc_safe' && p.freed) { p.safe = true; done(); }
      else if (ev.t === 'npc_dead') fail('died');
      break;
    case 'blackbox':
      if (ev.t === 'delivered') { p.done = true; done(); }
      break;
    case 'relay':
      if (ev.t === 'panel') {
        p.panels = p.panels || [];
        const i = ev.i | 0;
        if (i >= 0 && i < TOWER_PANELS && !p.panels[i]) { p.panels[i] = true; if (p.panels.filter(Boolean).length >= TOWER_PANELS) done(); else prog(); }
      }
      break;
    case 'hunt':
      if (ev.t === 'target_dead') { p.done = true; done(); }
      break;
    case 'drone':
      if (ev.t === 'drone_on' && !p.on) { p.on = true; prog(); }
      else if (ev.t === 'drone_move' && p.on) p.frac = clamp(+ev.frac || 0, 0, 1);
      else if (ev.t === 'drone_done' && p.on) { p.done = true; done(); }
      else if (ev.t === 'drone_dead') fail('died');
      break;
    case 'survey':
      if (ev.t === 'read') {
        p.reads = p.reads || [];
        const i = ev.i | 0;
        if (i >= 0 && i < m.n && !p.reads[i]) { p.reads[i] = true; if (p.reads.filter(Boolean).length >= m.n) done(); else prog(); }
      }
      break;
    case 'defend': case 'heist':
      if (ev.t === 'hold_start' && !p.on) { p.on = true; p.t = 0; prog(); }
      else if (ev.t === 'hold_tick' && p.on) { p.t = +(p.t + Math.max(0, +ev.dt || 0)).toFixed(2); if (p.t >= m.n) done(); }
      else if (ev.t === 'hold_fail' && p.on) fail('overrun');
      break;
    case 'photo':
      if (ev.t === 'photo') { p.done = true; done(); }
      break;
    default: break;
  }
  return { m, fx };
}

// ------------------------------------------------------------------ site planning (terrain flat zones; pure, identical on every peer)
let missionProvider = () => null;
/** world/terrain.js asks this at planMoon time: the mission (run.vy.mission) that applies to a moon id, or null. */
export function setMissionProvider(fn) { missionProvider = typeof fn === 'function' ? fn : () => null; }
export const activeMissionFor = (moonId) => { try { const m = missionProvider(); return m && m.moon === moonId && (m.st === 'accepted' || m.st === 'active') ? m : null; } catch { return null; } };

export const SITE = { r: 15, fall: 10, mr: 9, mfall: 8 };
/**
 * Flat zones for the set piece + mission props of a moon: [{ key, x, z, r, fall, yaw }]. keys: 'content', 'm0', 'm1'.
 * plan = { entrance, fires, ponds, lakes, scale } from terrain.js planMoon (needs no THREE).
 */
export function voyageFlats(seed, moon, plan, mission = undefined) {
  const ms = mission === undefined ? activeMissionFor(moon?.id) : mission;
  const need = [];
  if (moon?.content) need.push('content');
  const nm = ms ? MISSION_TYPES[ms.type]?.sites | 0 : 0;
  for (let i = 0; i < nm; i++) need.push('m' + i);
  if (!need.length) return [];
  const R = new RNG(((seed | 0) ^ 0x707a6e ^ hashString(moon.id)) >>> 0);
  const B = BIOMES[moon.biome] || {};
  const sc = plan.scale || 1;
  const e = plan.entrance, fires = plan.fires || [], ponds = plan.ponds || [], lakes = plan.lakes || [];
  const taken = [];
  const out = [];
  for (const key of need) {
    const r = key === 'content' ? SITE.r : SITE.mr, fall = key === 'content' ? SITE.fall : SITE.mfall;
    let site = null;
    for (let t = 0; t < 90 && !site; t++) {
      let x, z;
      if (B.lava) {   // lava rivers never come within 11 m of the ship -> exit lines: put sites on those lines
        const tgt = [e, ...fires][R.int(0, fires.length)];
        const f = R.float(0.28, 0.78), len = Math.hypot(tgt.x, tgt.z) || 1;
        x = tgt.x * f + (-tgt.z / len) * R.float(-2.5, 2.5); z = tgt.z * f + (tgt.x / len) * R.float(-2.5, 2.5);
      } else {
        const a = R.float(0, TAU), d = R.float(42, 100 * sc);
        x = Math.cos(a) * d; z = Math.sin(a) * d;
      }
      if (Math.hypot(x, z) < 38 + (t > 60 ? -6 : 0)) continue;
      if (Math.max(Math.abs(x), Math.abs(z)) > 112 * sc) continue;
      if (Math.hypot(x - e.x, z - e.z) < r + 26) continue;
      if (fires.some((f) => Math.hypot(x - f.x, z - f.z) < r + 14)) continue;
      if (ponds.some((p) => Math.hypot(x - p.x, z - p.z) < p.r * 1.5 + r + 4)) continue;
      if (lakes.some((l) => Math.hypot(x - l.x, z - l.z) < l.r + r + 6)) continue;
      if (taken.some((q) => Math.hypot(x - q.x, z - q.z) < (key === 'content' || q.key === 'content' ? 42 : 34))) continue;
      site = { key, x: +x.toFixed(2), z: +z.toFixed(2), r, fall, yaw: +R.float(0, TAU).toFixed(3) };
    }
    if (site) { taken.push(site); out.push(site); }
  }
  return out;
}

// ------------------------------------------------------------------ small text helpers shared by terminal / HUD (English keys; translated by callers)
export function missionSites(type) { return MISSION_TYPES[type]?.sites | 0; }
