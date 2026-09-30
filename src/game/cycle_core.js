// SECTOR CYCLE + ENDLESS MODE - pure rules (no DOM, no three, no imports). Design: docs/MASTERPLAN.md 14 / 14.1 / 14.2,
// state diagram and numbers: docs/wave2/cycle.md. The glue (src/game/cycle.js) only turns these results into game effects.
//
// Cycle state (plain JSON, lives in run.cycle so it is saved with the run and synced to late joiners):
//   { v, mode: 'classic'|'endless', stage: 'days'|'gate'|'core'|'grace', sector, fails, cores, bossDead, attempts, declined, firstKills:{theme:1}, endless }
// step(cy, ev) is pure and returns { cy, fx: [...] }.  fx tells the glue what to do (gateOpen, win, grace, shameful, ...).

export const TUNE = {
  coresForEndless: 3,      // Sector Cores cleared before "PATCH 1.0" is offered
  graceDays: 1,            // extra no-quota collection days after the first lost core
  maxFails: 2,             // second loss: the sector advances anyway (SHAMEFUL EXIT)
  coreRecallSec: 1800,     // hard cap on a core day (autopilot recall) - guarantees the day always ends
  arenaAutoOpenSec: 720,   // keys / puzzle are skipped after this long (a lost key card can never block the boss)
  shamefulRep: -12,        // faction reputation hit
};

// ---------------------------------------------------------------- boss table (theme -> boss) and scaling
export const BOSS_TABLE = {
  factory:    { id: 'foreman',       name: 'The Foreman',           title: 'Site Supervisor',      rank: 'B', hp: 1100, dmg: 50, existing: true },
  serverfarm: { id: 'loadbalancer',  name: 'The Load Balancer',     title: 'Traffic Director',     rank: 'B', hp: 1300, dmg: 42 },
  office:     { id: 'middlemanager', name: 'Middle Manager',        title: 'Synergy Enforcer',     rank: 'B', hp: 1200, dmg: 40 },
  sewer:      { id: 'hydra',         name: 'Comment Section Hydra', title: 'Many-Headed Thread',   rank: 'A', hp: 1400, dmg: 38 },
  hospital:   { id: 'surgeon',       name: 'The Head Surgeon',      title: 'Elective Procedure',   rank: 'A', hp: 1300, dmg: 46 },
  mansion:    { id: 'host',          name: 'The Host',              title: 'Welcome, Guest',       rank: 'A', hp: 1250, dmg: 44 },
  mineshaft:  { id: 'excavator',     name: 'The Excavator',         title: 'Proof of Work',        rank: 'A', hp: 1500, dmg: 48 },
  backrooms:  { id: 'lobbymanager',  name: 'The Lobby Manager',     title: 'Level Designer',       rank: 'A', hp: 1350, dmg: 45 },
};
// Themed sector bosses for the interiors that have no boss of their own (wave 8 hero content): each maps to the most fitting EXISTING boss
// (same id / kit / model / trophy; aliases, so hp, dmg, names and translations stay in one place).
BOSS_TABLE.metro = BOSS_TABLE.mansion;             // the ghost train's station host: blinks behind you the moment you look away
BOSS_TABLE.greenhouse = BOSS_TABLE.hospital;     // the head gardener: elective pruning, drags the weakest patient onto the potting table
BOSS_TABLE.prison = BOSS_TABLE.factory;         // the warden is the Foreman: "Site Supervisor" with a whistle and a shift schedule
BOSS_TABLE.tower = BOSS_TABLE.office;    // the Ivory Tower's Synergy Enforcer: mandatory meetings, paper shields
BOSS_TABLE.influencer = BOSS_TABLE.mansion;        // the Estate's Host: Welcome, Guest
BOSS_TABLE.academy = BOSS_TABLE.office;  // the principal: detention-as-a-meeting
BOSS_TABLE.museum = BOSS_TABLE.mansion;            // the curator: exhibits that move when nobody looks
BOSS_TABLE.colddata = BOSS_TABLE.serverfarm;    // the cold-storage Load Balancer: routes damage through the frozen nodes
export const LEGACY_BOSS = { id: 'legacybot', name: 'Legacy Bot', title: 'World Boss', rank: 'S', hp: 1500, dmg: 36, existing: true };
export const CREW_MUL = [1, 1, 1.6, 2.1, 2.5];   // index = crew size (0 counts as 1)

/** Every 5th sector (index 4, 9, ...) is the Legacy Bot regardless of theme. */
export const isLegacySector = (sector) => (sector | 0) % 5 === 4;
export function bossFor(theme, sector) {
  if (isLegacySector(sector)) return { ...LEGACY_BOSS, theme: theme || 'factory' };
  const b = BOSS_TABLE[theme] || BOSS_TABLE.factory;
  return { ...b, theme: BOSS_TABLE[theme] ? theme : 'factory' };
}
export const crewMul = (n) => CREW_MUL[Math.max(1, Math.min(4, n | 0))] || 1;
/** boss HP = base x (1 + 0.35 x sector) x crew multiplier (design 14). */
export const bossHp = (base, sector, crew) => Math.round(base * (1 + 0.35 * Math.max(0, sector | 0)) * crewMul(crew));
export const bossDmgMul = (sector) => +(1 + 0.06 * Math.max(0, sector | 0)).toFixed(3);
/** mechanics gain a second phase after the third sector (index >= 3). */
export const secondPhase = (sector) => (sector | 0) >= 3;
export const recommendedLevel = (sector) => 4 + 3 * Math.max(0, sector | 0);
/** number of key-holding mini-bosses / key cards for a core (1 early, 2 from the second sector). */
export const keysNeeded = (sector) => ((sector | 0) >= 1 ? 2 : 1);

/** Dominant interior of a sector's moons; ties are broken by `roll` in [0,1) so it is deterministic per run. */
export function dominantInterior(interiors, roll = 0) {
  const cnt = {};
  for (const i of interiors || []) cnt[i] = (cnt[i] || 0) + 1;
  const ids = Object.keys(cnt);
  if (!ids.length) return 'factory';
  const top = Math.max(...ids.map((i) => cnt[i]));
  const best = ids.filter((i) => cnt[i] === top).sort();
  return best[Math.min(best.length - 1, Math.floor(Math.max(0, Math.min(0.999999, roll)) * best.length))];
}

// ---------------------------------------------------------------- state machine
export function newCycle() {
  return { v: 1, mode: 'classic', stage: 'days', sector: 0, fails: 0, cores: 0, bossDead: false, attempts: 0, declined: false, firstKills: {}, endless: null };
}
const clone = (c) => ({ ...c, firstKills: { ...(c.firstKills || {}) }, endless: c.endless ? { ...c.endless, mutators: [...(c.endless.mutators || [])] } : null });

/**
 * Events: quotaMet | land | bossKilled | coreEnd{reason: lever|alldead|recall|midnight} | dayEnd | fired | endlessAccept | endlessDecline | endlessExit | load
 * Stage flow (details in docs/wave2/cycle.md):
 *   days --quotaMet--> gate --land--> core --coreEnd(boss dead)--> days (sector+1, chest)
 *                                     core --coreEnd(no kill, 1st)--> grace --dayEnd--> gate
 *                                     core --coreEnd(no kill, 2nd)--> days (sector+1, SHAMEFUL EXIT, no chest)
 */
export function step(cy0, ev) {
  const cy = clone(cy0 || newCycle());
  const fx = [];
  switch (ev?.t) {
    case 'quotaMet':
      if (cy.mode === 'classic' && cy.stage === 'days') { cy.stage = 'gate'; cy.fails = 0; fx.push({ k: 'gateOpen', sector: cy.sector, retry: false }); }
      break;
    case 'land':
      if (cy.stage === 'gate') { cy.stage = 'core'; cy.bossDead = false; cy.attempts += 1; fx.push({ k: 'coreLanded', sector: cy.sector, attempt: cy.attempts }); }
      break;
    case 'bossKilled':
      if (cy.stage === 'core' && !cy.bossDead) { cy.bossDead = true; fx.push({ k: 'bossDown', sector: cy.sector }); }
      break;
    case 'coreEnd':
      if (cy.stage !== 'core') break;
      if (cy.bossDead) {
        const theme = ev.theme || null;
        const first = !!theme && !cy.firstKills[theme];
        if (theme) cy.firstKills[theme] = 1;
        cy.cores += 1;
        fx.push({ k: 'win', sector: cy.sector, firstKill: first, theme });
        cy.sector += 1; cy.fails = 0; cy.bossDead = false; cy.stage = 'days';
        if (cy.cores >= TUNE.coresForEndless && cy.mode === 'classic' && !cy.declined) fx.push({ k: 'endlessOffer' });
      } else {
        cy.fails += 1;
        if (cy.fails >= TUNE.maxFails) {
          fx.push({ k: 'shameful', sector: cy.sector, rep: TUNE.shamefulRep });
          cy.sector += 1; cy.fails = 0; cy.stage = 'days';
        } else { cy.stage = 'grace'; fx.push({ k: 'grace', days: TUNE.graceDays, sector: cy.sector }); }
      }
      break;
    case 'dayEnd':
      if (cy.stage === 'grace') { cy.stage = 'gate'; fx.push({ k: 'gateOpen', sector: cy.sector, retry: true }); }
      break;
    case 'endlessAccept':
      if (cy.mode === 'classic' && cy.cores >= TUNE.coresForEndless) { cy.mode = 'endless'; cy.stage = 'days'; cy.endless = newEndless(ev.baseQuota || 1000, cy.cores); fx.push({ k: 'endlessStart' }); }
      break;
    case 'endlessDecline':
      cy.declined = true; break;
    case 'endlessExit':   // CASH OUT: back to the classic loop, the cores counter restarts (PATCH 1.0 can be offered again after 3 more cores)
      if (cy.mode === 'endless') { cy.mode = 'classic'; cy.stage = 'days'; cy.endless = null; cy.cores = 0; cy.declined = false; cy.fails = 0; cy.bossDead = false; fx.push({ k: 'endlessEnd' }); }
      break;
    case 'load':   // a run loaded from a save can never resume in the middle of a core day: treat it as not started
      if (cy.stage === 'core') { cy.stage = 'gate'; cy.bossDead = false; }
      break;
    case 'fired': {
      const keep = cy.firstKills;
      const fresh = newCycle(); fresh.firstKills = keep;
      return { cy: fresh, fx: [{ k: 'reset' }] };
    }
    default: break;
  }
  return { cy, fx };
}

/** Is the ship locked to the Sector Core (lever lands there, other routes refused)? */
export const gateLocked = (cy) => !!cy && cy.mode === 'classic' && (cy.stage === 'gate' || cy.stage === 'core');
/** During a grace day there is no quota: selling is free-form and the day counter does not end the run. */
export const noQuota = (cy) => !!cy && cy.stage === 'grace';

// ---------------------------------------------------------------- ENDLESS (the Deep Feed, design 14.2)
export const E = {
  meterMax: 100, start: 70, decayBase: 10, decayPer: 1.8, maxActive: 8, unitPer: 0.09, reliefEvery: 5, patchEvery: 3, finaleEvery: 10,
  rollbackChance: 0.25, lootPerPatch: 0.08, overflowToCredits: 0.1, gateAfter: 2, gateGap: 2, firedFactor: 0.5,
};

/** mutator pool: `fx` documents the real knob the glue turns (dailyEvent / config / stats / spawn hooks). */
export const MUTATORS = {
  lowgrav:    { name: 'Gravity -20%',        desc: 'Jumps carry 30% further. Falling still hurts.',            fx: { jumpMul: 1.3 } },
  doors:      { name: 'Creatures learn doors', desc: 'Creatures are 15% faster and open doors on the chase.',   fx: { speedMul: 1.15 } },
  shy:        { name: 'Loot is shy',         desc: '25% of scrap does not spawn, the rest is worth +30%.',     fx: { scrapKeep: 0.75, valueMul: 1.3 } },
  shrines:    { name: 'Double shrines',      desc: 'Shrines and dice appear twice as often.',                  fx: { shrineMul: 2 } },
  fog:        { name: 'Persistent fog',      desc: 'Every day is foggy. Outdoor threats +20%.',                fx: { weather: 'foggy', outdoorMul: 1.2 } },
  blackout:   { name: 'Rolling blackouts',   desc: 'The facility starts without power. Scrap +15%.',           fx: { blackout: true, valueMul: 1.15 } },
  fastday:    { name: 'Speedrun patch',      desc: 'Days are 25% shorter. Scrap +20%.',                        fx: { dayLenMul: 0.75, valueMul: 1.2 } },
  elites:     { name: 'Elite outbreak',      desc: 'Elite creatures are twice as common.',                     fx: { eliteMul: 2 } },
  horde:      { name: 'Traffic spike',       desc: 'Creature budget +25%.',                                    fx: { dangerMul: 1.25 } },
  bonanza:    { name: 'Bonanza',             desc: 'Scrap is worth +40%. Creature budget +15%.',               fx: { valueMul: 1.4, dangerMul: 1.15 } },
  glass:      { name: 'Glass cannon',        desc: 'Everyone deals +30% and takes +30% damage.',               fx: { dmgDealt: 1.3, dmgTaken: 1.3 } },
  tired:      { name: 'Sleep deprivation',   desc: 'Stamina regenerates 30% slower.',                          fx: { staminaRegen: 0.7 } },
  hoarders:   { name: 'Hoarder season',      desc: 'Data Hoarder nests everywhere: +6 scrap, creatures +10%.', fx: { scrapAdd: 6, dangerMul: 1.1 } },
  quiet:      { name: 'Quiet hours',         desc: 'Creatures spawn 20% less often. Scrap -10%.',              fx: { dangerMul: 0.8, valueMul: 0.9 } },
};
export const MUTATOR_IDS = Object.keys(MUTATORS);

export function newEndless(baseQuota, cores = 3) {
  return { depth: 0, meter: E.start, base: Math.max(100, Math.round(baseQuota)), mutators: [], lootMul: 1, lastGate: -99, cores, sales: 0, gate: null, patches: 0, best: 0 };
}
export const isRelief = (depth) => depth > 0 && depth % E.reliefEvery === 0;
export const isPatch = (depth) => depth > 0 && depth % E.patchEvery === 0;
export const isFinale = (depth) => depth > 0 && depth % E.finaleEvery === 0;
/** sales needed for a full meter, growing with depth */
export const meterUnit = (base, depth) => Math.max(1, Math.round(base * (1 + E.unitPer * Math.max(0, depth))));
export const dailyDecay = (depth) => +(E.decayBase + E.decayPer * Math.pow(Math.max(0, depth), 0.9)).toFixed(2);
/** soft power curve: creature power, loot value and tier luck all follow it */
export const depthPower = (depth) => +(1 + 0.6 * Math.log(1 + Math.max(0, depth) / 4)).toFixed(3);
export const lootLuckBonus = (depth) => +Math.min(0.5, 0.08 * Math.log(1 + Math.max(0, depth))).toFixed(3);

/** A sale of `total` credits fills the meter; whatever exceeds 100 turns into a small credit bonus. */
export function endlessSale(e0, total) {
  const e = { ...e0 };
  const gain = 100 * Math.max(0, total) / meterUnit(e.base, e.depth);
  const raw = e.meter + gain;
  const over = Math.max(0, raw - E.meterMax);
  e.meter = +Math.min(E.meterMax, raw).toFixed(2);
  e.sales += Math.max(0, total);
  return { e, gain: +gain.toFixed(2), bonusCredits: Math.round(over / 100 * meterUnit(e.base, e.depth) * E.overflowToCredits) };
}

/** A moon day ended: depth + 1, the meter decays (not on relief days). fired = meter reached 0. */
export function endlessDayEnd(e0) {
  const e = { ...e0 };
  e.depth += 1;
  const relief = isRelief(e.depth);
  const decay = relief ? 0 : dailyDecay(e.depth);
  e.meter = +Math.max(0, e.meter - decay).toFixed(2);
  e.best = Math.max(e.best || 0, e.depth);
  return { e, decay, relief, fired: e.meter <= 0, patch: isPatch(e.depth), finale: isFinale(e.depth) };
}

/** PATCH NOTES: rnd() in [0,1). Adds a mutator; the oldest is rolled back at random (25%, once 3+ are active) or when 8 are active. Loot multiplier grows every patch. */
export function patchNotes(e0, rnd) {
  const e = { ...e0, mutators: [...(e0.mutators || [])] };
  let add = null, rollback = null;
  if (e.mutators.length >= E.maxActive || (e.mutators.length >= 3 && rnd() < E.rollbackChance)) rollback = e.mutators.shift();
  if (!rollback || rnd() < 0.5) {
    const pool = MUTATOR_IDS.filter((id) => !e.mutators.includes(id) && id !== rollback);
    if (pool.length) { add = pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))]; e.mutators.push(add); }
  }
  e.lootMul = +(e.lootMul * (1 + E.lootPerPatch)).toFixed(3);
  e.patches += 1;
  return { e, add, rollback };
}

/** Combined numeric effect of the active mutators (multiplicative knobs, flags kept as-is). */
export function mutatorEffects(ids) {
  const out = { dangerMul: 1, valueMul: 1, outdoorMul: 1, eliteMul: 1, dayLenMul: 1, scrapKeep: 1, scrapAdd: 0, jumpMul: 1, speedMul: 1, staminaRegen: 1, dmgDealt: 1, dmgTaken: 1, shrineMul: 1, blackout: false, weather: null };
  for (const id of ids || []) {
    const f = MUTATORS[id]?.fx; if (!f) continue;
    for (const [k, v] of Object.entries(f)) {
      if (k === 'blackout') out.blackout = true; else if (k === 'weather') out.weather = v; else if (k === 'scrapAdd') out.scrapAdd += v; else out[k] = +(out[k] * v).toFixed(4);
    }
  }
  return out;
}

/** deterministic [0,1) from a string (FNV-1a + mix), for seeded gate rolls on every peer */
export function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Random S-rank gate for the day at `depth` (null = none). A season finale is guaranteed every 10th depth. */
export function gateRoll(runKey, depth, lastGate = -99) {
  if (isFinale(depth)) return { kind: 'finale', rank: 'S+', red: false, depth, hpMul: 1.5, chests: 2 };
  if (depth < E.gateAfter || depth - lastGate < E.gateGap) return null;
  if (hash01(`gate:${runKey}:${depth}`) >= Math.min(0.45, 0.12 + 0.03 * depth)) return null;
  const red = hash01(`red:${runKey}:${depth}`) < 0.2;
  return { kind: red ? 'red' : 'glitch', rank: 'S', red, depth, hpMul: 1, chests: red ? 2 : 1 };
}

/** CASH OUT rewards (permanent). Fired = half. */
export function cashOut(depth, { fired = false, crew = 1 } = {}) {
  const f = fired ? E.firedFactor : 1;
  const d = Math.max(0, depth | 0);
  const titles = [[30, 'Eternal Feed'], [20, 'Content Abyss'], [10, 'Deep Feeder'], [5, 'Scroll Survivor']];
  return {
    clout: Math.round(40 * Math.pow(d, 1.25) * f),
    xp: Math.round(120 * d * f),
    stars: fired ? 0 : Math.floor(d / 15),
    title: (titles.find(([n]) => d >= n) || [0, null])[1],
    cosmetic: fired ? null : d >= 10 ? 'endless_' + Math.min(3, Math.floor(d / 10)) : null,
    crew: Math.max(1, crew | 0), factor: f,
  };
}
export const scoreOf = (depth, cores, sales) => Math.round(depth * 1000 + cores * 250 + Math.sqrt(Math.max(0, sales)) * 5);
/** local leaderboard: best first, capped */
export function insertLeaderboard(list, entry, max = 20) {
  const out = [...(list || []), entry].sort((a, b) => b.score - a.score || (b.at || 0) - (a.at || 0)).slice(0, max);
  return { list: out, rank: out.indexOf(entry) + 1 };
}
