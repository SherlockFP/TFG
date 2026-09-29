// CREATURE DIRECTOR core (wave 8, docs/wave8/creatures_audit.md). Pure maths + data: no THREE / DOM, node-testable (tools/harness/crdirector.test.mjs).
//   One threat budget per landing (Left 4 Dead style). The old spawners keep deciding WHAT spawns; the director decides WHEN:
//   calm -> build -> peak -> relax, a cap of "active threat points" near the crew that scales with quota / sector / hard mode / mapmods.
//   Cost of a creature = its `power` (the number the vanilla spawn budget always used): Spam Bot 0.5, Data Hoarder 1, Web Crawler 2, Lurker 3 ...

export const PHASES = ['calm', 'build', 'peak', 'relax'];
export const nextPhase = (p) => PHASES[(PHASES.indexOf(p) + 1) % PHASES.length] || 'calm';

export const TUNE = Object.freeze({
  capBase: 3.5,            // active threat points at the peak, quota 0, tier 1 (~2-3 small hostiles)
  capPerQuota: 0.35, capPerTier: 0.45, capHard: 1, capMin: 3, capMax: 12,
  phaseCap: Object.freeze({ calm: 0, build: 0.55, peak: 1, relax: 0 }),   // share of the cap that may be active per phase
  gap: Object.freeze({ build: 7, peak: 3.5 }),                              // s between two releases from the queue
  len: Object.freeze({ calm: [55, 80], build: [22, 32], peak: [28, 42], relax: [45, 70] }),
  firstCalm: [80, 105],    // the first calm of a landing (early-game safe window is 90 s)
  nearR: 45,               // m: a creature this close to a living crewmate (same zone) counts as active
  recentS: 20,             // s: a creature spawned this recently counts as active wherever it is
  queueMax: 6, queueTtl: 140,
  residents: [1, 1, 2],    // creatures of the initial landing wave that may stay (quota 0-1 / 2-3 / 4+); the rest is queued for the phases
  cullFar: 70, cullAge: 90, cullGap: 5,   // relax: an ambient creature older than cullAge s and > cullFar m from every crewmate is removed (1 per cullGap s)
  stressHp: 0.35,          // any crewmate below this HP fraction ends a peak early
  peakOverrun: 1.35,       // active threat above cap * this for peakOverrunS s ends the peak early
  peakOverrunS: 8,
});

/** difficulty context -> {q, tier, hard, danger, pressure} */
export function ctxOf(o = {}) {
  return { q: Math.max(0, o.q | 0), tier: Math.max(1, Math.min(4, Math.round(o.tier || 1))), hard: !!o.hard, danger: o.danger > 0 ? o.danger : 1, pressure: o.pressure > 0 ? o.pressure : 1 };
}
/** max active threat points at the peak of a phase cycle */
export function capOf(o) {
  const c = ctxOf(o);
  const raw = TUNE.capBase + TUNE.capPerQuota * c.q + TUNE.capPerTier * (c.tier - 1) + (c.hard ? TUNE.capHard : 0);
  const scale = Math.max(0.7, Math.min(1.6, c.danger * c.pressure));
  return Math.max(TUNE.capMin, Math.min(TUNE.capMax, raw * scale));
}
/** seconds a phase lasts. u = uniform [0,1). Later quotas: shorter calms, longer peaks. */
export function phaseSeconds(phase, o, u, first = false) {
  const c = ctxOf(o);
  const [a, b] = phase === 'calm' && first ? TUNE.firstCalm : TUNE.len[phase];
  let s = a + (b - a) * u;
  if (phase === 'calm') s *= Math.max(0.6, 1 - 0.04 * c.q) * (c.hard ? 0.85 : 1);
  if (phase === 'peak') s *= Math.min(1.5, 1 + 0.05 * c.q);
  return s;
}
export const residentsFor = (q) => TUNE.residents[q >= 4 ? 2 : q >= 2 ? 1 : 0];
/** most hostile BODIES active near the crew at the peak (a pack of Spam Bots is 2-4 bodies for 0.5 vanilla power): 3 / 4 / 4 at quota 0 / 2 / 4 (tier 1 / 2 / 3) */
export function bodyCap(o) {
  const c = ctxOf(o);
  return Math.max(3, Math.min(8, Math.round(2.6 + 0.3 * c.q + 0.3 * (c.tier - 1) + (c.hard ? 1 : 0))));
}
/** Spam Bot packs are trimmed to this many bodies while the crew is still small (quota 0-1: 2, 2-3: 3, later: the vanilla 4) */
export const packMax = (q) => (q >= 4 ? 4 : q >= 2 ? 3 : 2);
/** loose ambient Zombie Accounts (horde.js) that may exist at once: 3 / 6 / vanilla */
export const ambientZombieCap = (q) => (q >= 4 ? 99 : q >= 2 ? 6 : 3);
/** bodies one queued spawn will add (estimate before it spawns) */
export function bodiesEst(type, q) { return type === 'scuttler' ? packMax(q) : !type ? 2 : 1; }

// ------------------------------------------------------------------------------------------------ what counts as a threat
const NEUTRAL = new Set(['kefaldayi', 'company', 'alien_npc', 'vy_specimen', 'janitorbin', 'hoardnest', 'web', 'lbnode', 'mmpaper']);
/** hostile, non-boss, non-hazard creatures are budgeted; traps and bosses run their own show */
export function isCounted(type, def) {
  if (!def || def.hazard || def.boss || NEUTRAL.has(type)) return false;
  return (def.dmg || 0) > 0;
}
/** threat points of one creature */
export function costOf(type, def) {
  if (!isCounted(type, def)) return 0;
  if (def.power > 0) return def.power;
  return def.minion ? 0.3 : 1;   // squad / raid / mirror spawns carry power 0: count them as one small hostile
}
const SLEEPING = new Set(['hidden', 'dormant', 'statue', 'box', 'ceiling', 'off', 'dead', 'lurk_wait']);
export const isAwake = (st) => !SLEEPING.has(st);
const CALM = new Set(['idle', 'walk', 'wander', 'patrol', 'roam', 'sleep', 'rest', 'home', 'return', 'flee', 'stunned', 'follow', 'cry', 'rocked', 'hide', 'hidden', 'ceiling', 'dormant', 'box', 'lurk', 'sniff', 'armed', 'off', 'calm', 'scan', 'reload', 'boot', 'fly', 'feed']);
/** a state in which a creature is coming for somebody */
export const isHunting = (st) => !!st && !CALM.has(st) && st !== 'dead';

/**
 * Active threat now. creatures: [{type, def, state, dead, x, z, zone, age, target}], crew: [{x, z, zone, dead}].
 * A creature is active when it is awake and (hunting, or near a living crewmate of its zone, or just spawned).
 */
export function activeThreat(creatures, crew, costFn = costOf) {
  let sum = 0, n = 0;
  const r2 = TUNE.nearR * TUNE.nearR;
  for (const c of creatures) {
    if (c.dead) continue;
    const cost = costFn(c.type, c.def);
    if (cost <= 0 || !isAwake(c.state)) continue;
    let act = isHunting(c.state) || (c.age ?? 99) < TUNE.recentS;
    if (!act) for (const p of crew) {
      if (p.dead || (c.zone !== 'any' && p.zone !== c.zone)) continue;
      const dx = p.x - c.x, dz = p.z - c.z;
      if (dx * dx + dz * dz < r2) { act = true; break; }
    }
    if (act) { sum += cost; n++; }
  }
  return { sum, n };
}

// ------------------------------------------------------------------------------------------------ phase machine
/** fresh director state for a landing */
export function newState(o, rnd) {
  const s = { phase: 'calm', t: 0, len: 0, cycle: 0, gapT: 0, overT: 0, first: true };
  s.len = phaseSeconds('calm', o, rnd(), true);
  return s;
}
/**
 * Advance the phase clock by dt. info = { active, cap, stress } (stress: a crewmate is in trouble).
 * Returns the new phase name when it changed, else null. Peaks end early under stress or when others overspawned.
 */
export function step(s, dt, o, rnd, info = {}) {
  s.t += dt; s.gapT = Math.max(0, s.gapT - dt);
  if (s.phase === 'peak') {
    s.overT = info.cap > 0 && info.active > info.cap * TUNE.peakOverrun ? s.overT + dt : 0;
    if (info.stress || s.overT > TUNE.peakOverrunS) s.len = Math.min(s.len, s.t);
  }
  if (s.t < s.len) return null;
  const nx = nextPhase(s.phase);
  s.phase = nx; s.t = 0; s.overT = 0; s.first = false;
  if (nx === 'build') s.cycle++;
  s.len = phaseSeconds(nx, o, rnd());
  return nx;
}
/** may one more creature of cost `cost` be released now? ex = {n: active bodies, bodies: bodies it adds}. The first release of a phase is always allowed when nothing is active. */
export function mayRelease(s, o, active, cost, ex = {}) {
  const share = TUNE.phaseCap[s.phase] || 0;
  if (share <= 0 || s.gapT > 0) return false;
  const lim = capOf(o) * share;
  const nOk = !(ex.n > 0) || (ex.n || 0) + (ex.bodies || 1) <= Math.max(2, Math.round(bodyCap(o) * share));
  if (!nOk) return false;
  return active + cost <= lim + 1e-6 || (active <= 0.01 && cost <= lim + 1.5);
}
export const gapFor = (phase) => TUNE.gap[phase] || 99;

// ------------------------------------------------------------------------------------------------ queue
/** bounded FIFO of wanted spawns [{zone, type?, t}]; dedupes by keeping at most TUNE.queueMax, drops stale entries */
export function enqueue(q, e, now) {
  q.push({ ...e, t: now });
  while (q.length > TUNE.queueMax) q.shift();
  return q.length;
}
export function expire(q, now) {
  let n = 0;
  for (let i = q.length - 1; i >= 0; i--) if (now - q[i].t > TUNE.queueTtl) { q.splice(i, 1); n++; }
  return n;
}
/** first queue entry whose cost fits (zone must be open). costOfEntry(e) -> points. Returns index or -1. */
export function pickRelease(q, s, o, active, costOfEntry, zoneOpen, n = 0) {
  for (let i = 0; i < q.length; i++) {
    const e = q[i];
    if (zoneOpen && !zoneOpen(e.zone)) continue;
    if (mayRelease(s, o, active, costOfEntry(e), { n, bodies: bodiesEst(e.type, o.q) })) return i;
  }
  return -1;
}

// ------------------------------------------------------------------------------------------------ telegraphs (client)
/** signature approach cue per creature type. s: sound candidates (first that exists), p pitch, v volume, r trigger radius (m),
 *  eye: emissive eye colour while hunting near you, fx: 'flicker' (facility lights dip) | 'dust' (ceiling dust falls) */
export const TELLS = Object.freeze({
  scuttler: { s: ['scuttler_click'], p: 1.5, v: 0.5, r: 18 },
  yoinker: { s: ['yoinker_yippee'], p: 0.6, v: 0.45, r: 14 },
  crawler: { s: ['crawler_step', 'vent_rattle'], p: 0.55, v: 0.7, r: 34, fx: 'dust' },
  lurker: { s: ['breath_heavy', 'breath_tired'], p: 0.55, v: 0.55, r: 20, eye: '#ff2ab8', fx: 'flicker' },
  mannequin: { s: ['mannequin_step'], p: 0.7, v: 0.6, r: 20, fx: 'flicker' },
  sludge: { s: ['steam_hiss'], p: 0.5, v: 0.4, r: 14 },
  spider: { s: ['spider_hiss', 'vent_rattle'], p: 0.7, v: 0.6, r: 22, fx: 'dust' },
  screamer: { s: ['breath_heavy'], p: 1.2, v: 0.35, r: 16, eye: '#cfe8ff' },
  mimic: { s: ['walkie_static'], p: 0.9, v: 0.3, r: 16 },
  hound: { s: ['hound_growl'], p: 0.6, v: 0.6, r: 36 },
  giant: { s: ['giant_step'], p: 1, v: 1, r: 70, fx: 'dust' },
  moderator: { s: ['beep_3', 'turret_detect'], p: 0.8, v: 0.5, r: 30, eye: '#7dff7d' },
  support: { s: ['voice_clown_grunt', 'squeak'], p: 1.3, v: 0.35, r: 20 },
  editor: { s: ['sting_drum', 'hit_metal'], p: 1, v: 0.5, r: 24 },
  tamagotchi: { s: ['voice_rat_scared', 'squeak'], p: 1.6, v: 0.5, r: 24 },
  clickbait: { s: ['ui_notify', 'bell_ding'], p: 1.1, v: 0.5, r: 26 },
  replyguy: { s: ['voice_bat_anger', 'animal_crow'], p: 0.8, v: 0.5, r: 30 },
  listener: { s: ['breath_heavy'], p: 0.45, v: 0.5, r: 22 },
  cd_dimmer: { s: ['lights_buzz'], p: 0.6, v: 0.6, r: 22, fx: 'flicker', eye: '#ffb347' },
  cd_follower: { s: ['walkie_static'], p: 0.5, v: 0.6, r: 28, eye: '#ffffff' },
  cd_auditor: { s: ['coins', 'bell_ding'], p: 0.6, v: 0.5, r: 26, eye: '#ffd24a' },
});
export const DEFAULT_TELL = Object.freeze({ s: ['heartbeat'], p: 1, v: 0.35, r: 22 });
export const tellOf = (type) => TELLS[type] || DEFAULT_TELL;

/** which screen edge a danger at world offset (dx,dz) shows on, for a camera looking along (fx,fz). 'f' front / 'b' behind / 'l' / 'r' */
export function edgeOf(dx, dz, fx, fz) {
  const a = Math.atan2(fx * dz - fz * dx, dx * fx + dz * fz);   // signed angle from forward, + = right (camera looking along -z: +x is on the right)
  const aa = Math.abs(a);
  if (aa < Math.PI / 4) return 'f';
  if (aa > (3 * Math.PI) / 4) return 'b';
  return a > 0 ? 'r' : 'l';
}
