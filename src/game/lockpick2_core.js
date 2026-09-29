// LOCKPICK 2 (wave 5, MASTERPLAN 25.3): the PURE rules (no DOM, no game access; node-tested by tools/harness/lockpick2.test.mjs).
// Glue: src/game/lockpick2.js. Minigame view: src/minigames/lockpick2.js. Numbers documented in docs/wave5/lockpick2.md - change them HERE only.
//
//   TIERS / lock mapping   tierOfDifficulty() (every legacy 'lockpick' caller passes a 0..1 difficulty), tierForCage(), tierForDoor()
//   skill                  xpForLevel / levelOfXp / xpGain / perksAt (window, auto-seat, silent, one-click)
//   window maths           windowWidth(), idealTime()
//   LockState              the whole minigame rule set (marker, pins, wrong clicks, break, vault timer, algorithm shuffle, co-op)
//   Coop                   host book of "second player holds the pins" sessions
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------------------------------------- tiers
// pins = timing clicks; win = window width (fraction of the bar) at skill level 1 with a plain pick; speed = marker bar-lengths / s (triangle wave);
// timer = seconds for the whole lock (0 = none); shuffle = seconds between pin-order shuffles (0 = never); wrong = wrong clicks that snap the pick; xp = XP per opened lock.
export const TIER_IDS = Object.freeze(['simple', 'standard', 'security', 'vault', 'algorithm']);
export const TIERS = Object.freeze({
  simple:    { id: 'simple',    name: 'Simple',    pins: 1, win: 0.30, speed: 0.90, timer: 0,  shuffle: 0,   wrong: 4, xp: 8 },
  standard:  { id: 'standard',  name: 'Standard',  pins: 2, win: 0.23, speed: 1.05, timer: 0,  shuffle: 0,   wrong: 3, xp: 14 },
  security:  { id: 'security',  name: 'Security',  pins: 3, win: 0.17, speed: 1.20, timer: 0,  shuffle: 0,   wrong: 3, xp: 24 },
  vault:     { id: 'vault',     name: 'Vault',     pins: 4, win: 0.14, speed: 1.35, timer: 11, shuffle: 0,   wrong: 3, xp: 42 },
  algorithm: { id: 'algorithm', name: 'Algorithm', pins: 4, win: 0.12, speed: 1.50, timer: 13, shuffle: 2.4, wrong: 3, xp: 70 },
});
export const tierIndex = (id) => Math.max(0, TIER_IDS.indexOf(id));
export const isTier = (id) => TIER_IDS.includes(id);
/** Legacy callers pass a difficulty 0..1: 0.2 simple / 0.45 standard (iron chest) / 0.62 security (gold) / 0.8 vault (void) / 0.9+ algorithm. */
export function tierOfDifficulty(d) {
  const v = Number.isFinite(d) ? d : 0.4;
  return v < 0.35 ? 'simple' : v < 0.55 ? 'standard' : v < 0.72 ? 'security' : v < 0.88 ? 'vault' : 'algorithm';
}
/** Difficulty a cage / locker asks for at sector `quota`: 0.2 + 0.1 x quota -> simple (q0-1), standard (q2-3), security (q4-5), vault (q6), algorithm (q7+). */
export const cageDifficulty = (quota) => clamp(0.2 + 0.1 * Math.max(0, quota | 0), 0.2, 0.95);
export const tierForCage = (quota) => tierOfDifficulty(cageDifficulty(quota));
/** Difficulty of a plain locked door: tier-1 moons (danger < 1.6) stay Simple, then Standard. */
export const doorDifficulty = (danger) => clamp(0.2 + 0.08 * (Number(danger) || 0), 0.2, 0.5);
export const tierForDoor = (danger) => tierOfDifficulty(doorDifficulty(danger));
/** Chest tiers (models/chest.js difficulty 0 / .45 / .62 / .8): wood has no lock, iron Standard, gold Security, void Vault; a crowbar pry is +0.2 (harder, louder). */
export const CHEST_TIER = Object.freeze({ wood: 'simple', iron: 'standard', gold: 'security', void: 'vault' });

// ---------------------------------------------------------------------------------------------- tools
export const PICK = Object.freeze({ BASIC: 'lockpick', TITANIUM: 'lp2_titanium', BYPASS: 'lp2_bypass', DRILL: 'sl_drill' });
/**
 * winMul window x; wrong = extra wrong clicks before it snaps; noise = loudness (creatures.noise units) per seated pin (picks) or `burst` once (loud tools);
 * quietable = the silent-picking perk removes its noise; skipTimer = ignores the vault / algorithm timer; auto = the tool does the timing itself (drill: seconds per pin);
 * xpMul = XP multiplier (the better the crutch, the less you learn).
 */
export const TOOLS = Object.freeze({
  [PICK.BASIC]:    { id: PICK.BASIC,    winMul: 1.00, wrong: 0, noise: 0.20, burst: 0,   quietable: true,  skipTimer: false, auto: 0,    xpMul: 1 },
  [PICK.TITANIUM]: { id: PICK.TITANIUM, winMul: 1.15, wrong: 1, noise: 0.10, burst: 0,   quietable: true,  skipTimer: false, auto: 0,    xpMul: 1 },
  [PICK.BYPASS]:   { id: PICK.BYPASS,   winMul: 1.50, wrong: 2, noise: 0,    burst: 1.3, quietable: false, skipTimer: true,  auto: 0,    xpMul: 0.6 },
  [PICK.DRILL]:    { id: PICK.DRILL,    winMul: 1,    wrong: 9, noise: 0,    burst: 2.8, quietable: false, skipTimer: true,  auto: 0.45, xpMul: 0.5, pulse: 1.6 },
});
export const PICK_TYPES = Object.freeze(Object.keys(TOOLS));
export const isPickType = (type) => Object.prototype.hasOwnProperty.call(TOOLS, type);
/** picks a cage lock accepts through secureloot (the drill has its own safe method there) */
export const CAGE_PICKS = Object.freeze([PICK.BASIC, PICK.TITANIUM, PICK.BYPASS]);
export const toolOf = (type) => TOOLS[type] || TOOLS[PICK.BASIC];
/** Store items (registered by the module; lockpick and sl_drill already exist). shop 'tools'. */
export const ITEM_DEFS = [
  { id: PICK.TITANIUM, name: 'Titanium Pick', kind: 'tool', price: 55, weight: 2, hands: 1, charges: 9, shop: 'tools', tier: 'uncommon',
    tip: 'A hardened pick: 15% wider timing window, forgives one more miss and clicks quieter. 9 uses.' },
  { id: PICK.BYPASS, name: 'Electronic Bypasser', kind: 'tool', price: 140, weight: 2, hands: 1, charges: 4, shop: 'tools', tier: 'rare',
    tip: 'Skips the vault and algorithm timers and opens wide, but it buzzes LOUD (creatures hear it). 4 uses.' },
];

// ---------------------------------------------------------------------------------------------- skill (per profile)
export const MAX_LEVEL = 10;
export const PERK_LEVEL = Object.freeze({ autoSeat: 3, silent: 5, oneClick: 7 });
/** total XP needed to REACH level l (level 1 = 0): 12, 39, 78, 127 ... 503 at level 10 (early levels come after 1-3 locks) */
export const xpForLevel = (l) => (l <= 1 ? 0 : Math.round(12 * Math.pow(Math.min(l, MAX_LEVEL) - 1, 1.7)));
export function levelOfXp(xp) {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}
/** XP of an opened lock: tier XP x tool multiplier (never below 1) */
export const xpGain = (tier, tool) => Math.max(1, Math.round((TIERS[tier]?.xp || 8) * toolOf(tool).xpMul));
export function ensureSkill(profile) {
  if (!profile) return { xp: 0, opened: 0 };
  const s = profile.lockpick2 && typeof profile.lockpick2 === 'object' ? profile.lockpick2 : (profile.lockpick2 = {});
  if (!Number.isFinite(s.xp) || s.xp < 0) s.xp = 0;
  if (!Number.isFinite(s.opened) || s.opened < 0) s.opened = 0;
  return s;
}
/** adds XP for one opened lock; returns { xp, level, gained, levelUp } */
export function awardXp(profile, tier, tool) {
  const s = ensureSkill(profile), before = levelOfXp(s.xp), gained = xpGain(tier, tool);
  s.xp += gained; s.opened++;
  const level = levelOfXp(s.xp);
  return { xp: s.xp, level, gained, levelUp: level > before };
}
/** everything a level unlocks: window x (+5 % per level), auto-seat 1 pin (lvl 3), silent picking (5), one-click Simple locks (7) */
export function perksAt(level) {
  const l = clamp(level | 0 || 1, 1, MAX_LEVEL);
  return { level: l, winMul: 1 + 0.05 * (l - 1), autoSeat: l >= PERK_LEVEL.autoSeat ? 1 : 0, silent: l >= PERK_LEVEL.silent, oneClick: l >= PERK_LEVEL.oneClick };
}

// ---------------------------------------------------------------------------------------------- window maths
export const COOP_MAX_HELPERS = 2;
export const coopWinMul = (helpers) => 1 + 0.15 * clamp(helpers | 0, 0, COOP_MAX_HELPERS);
/** pins a helper holds for the picker: one per helper, never the last pin */
export const coopSeat = (pins, helpers) => Math.min(clamp(helpers | 0, 0, COOP_MAX_HELPERS), Math.max(0, pins - 1));
/** window width (fraction of the bar, 0.04..0.62) */
export function windowWidth(tier, level = 1, tool = PICK.BASIC, helpers = 0) {
  const T = TIERS[tier] || TIERS.simple;
  return clamp(T.win * perksAt(level).winMul * toolOf(tool).winMul * coopWinMul(helpers), 0.04, 0.62);
}
/** wrong clicks that snap the pick: tier base + tool bonus + 1 per 4 skill levels */
export const maxWrong = (tier, level = 1, tool = PICK.BASIC) => (TIERS[tier]?.wrong || 3) + toolOf(tool).wrong + Math.floor((clamp(level | 0, 1, MAX_LEVEL) - 1) / 4);
export const effectiveTimer = (tier, tool = PICK.BASIC) => (toolOf(tool).skipTimer ? 0 : TIERS[tier]?.timer || 0);
/** pins the player still has to click at the start */
export function pinsToPlay(tier, level = 1, helpers = 0) {
  const pins = TIERS[tier]?.pins || 1, P = perksAt(level);
  if (pins === 1) return 1;
  return pins - Math.min(pins - 1, P.autoSeat + coopSeat(pins, helpers));
}
export const SETUP_TIME = 0.4, OPEN_TIME = 0.3;
/** seconds a player who plays WELL needs (setup + per-pin wait for the marker to enter the window + the open animation). Drill: 0.45 s per pin. */
export function idealTime(tier, level = 1, tool = PICK.BASIC, helpers = 0) {
  const T = TIERS[tier] || TIERS.simple, tl = toolOf(tool);
  if (tl.auto) return SETUP_TIME + T.pins * tl.auto + OPEN_TIME * 0.5;
  const w = windowWidth(tier, level, tool, helpers), n = pinsToPlay(tier, level, helpers);
  if (T.pins === 1 && perksAt(level).oneClick) return SETUP_TIME + 0.12 + OPEN_TIME;
  return SETUP_TIME + n * (0.3 + ((1 - w) * 0.5) / T.speed + (T.shuffle > 0 ? 0.25 : 0)) + OPEN_TIME;   // the algorithm lock costs a re-aim per pin
}
/** triangle wave marker position 0..1 */
export function markerAt(phase) { const f = phase - Math.floor(phase); return f < 0.5 ? f * 2 : 2 - f * 2; }

// ---------------------------------------------------------------------------------------------- noise
/** loudness of one seated pin / the start burst, after the silent-picking perk */
export function pinNoise(tool, level) {
  const tl = toolOf(tool);
  if (tl.quietable && perksAt(level).silent) return 0;
  return tl.noise;
}
export function burstNoise(tool) { return toolOf(tool).burst; }

// ---------------------------------------------------------------------------------------------- the lock state machine
/**
 * opts: { tier, level, tool, helpers (n), rng (() => 0..1) }.
 * Player API: click() -> { hit, seated (pin index), dropped (index|-1), broken, done, lockout }; tick(dt) -> { done, timeout, shuffled }; setHelpers(n).
 * Result flags: state.done, state.opened, state.broken, state.timedOut.
 */
export class LockState {
  constructor({ tier = 'simple', level = 1, tool = PICK.BASIC, helpers = 0, rng = Math.random } = {}) {
    this.T = TIERS[tier] || TIERS.simple; this.tier = this.T.id; this.level = clamp(level | 0 || 1, 1, MAX_LEVEL); this.tool = TOOLS[tool] ? tool : PICK.BASIC;
    this.rng = rng; this.P = perksAt(this.level); this.tl = toolOf(this.tool);
    this.pins = this.T.pins; this.seated = new Array(this.pins).fill(false); this.held = new Array(this.pins).fill(false);   // held = auto-seat perk / co-op helper (never dropped)
    this.stack = [];                       // indices the player seated (a wrong click drops the LAST one)
    this.helpers = 0; this.wrong = 0; this.maxWrong = maxWrong(this.tier, this.level, this.tool);
    this.timer = effectiveTimer(this.tier, this.tool); this.timeLeft = this.timer; this.t = 0; this.lockout = 0;
    this.phase = rng() * 2; this.oneClick = this.pins === 1 && this.P.oneClick && !this.tl.auto;
    this.shuffleT = this.T.shuffle; this.shuffles = 0;
    this.done = false; this.opened = false; this.broken = false; this.timedOut = false;
    this.order = []; this.active = -1; this.center = 0.5; this.width = 0.3;
    this.autoSeatPerk();
    this.setHelpers(helpers);
    this.reorder(false); this.relocate();
  }
  get remaining() { return this.seated.filter((s) => !s).length; }
  get pos() { return markerAt(this.phase + this.t * this.T.speed); }
  autoSeatPerk() { const n = this.pins > 1 ? Math.min(this.P.autoSeat, this.pins - 1) : 0; for (let i = 0; i < n; i++) this.hold(i); }
  hold(i) { if (i >= 0 && i < this.pins && !this.seated[i]) { this.seated[i] = true; this.held[i] = true; return true; } return false; }
  /** a helper joined / left: more held pins (never fewer once seated), window follows */
  setHelpers(n) {
    if (this.done) return;
    this.helpers = clamp(n | 0, 0, COOP_MAX_HELPERS);
    const perk = this.pins > 1 ? Math.min(this.P.autoSeat, this.pins - 1) : 0;
    const want = Math.min(coopSeat(this.pins, this.helpers), this.pins - 1 - perk);
    let have = this.held.filter(Boolean).length - perk;
    for (let i = this.pins - 1; i >= 0 && have < want; i--) if (this.hold(i)) have++;
    if (this.active >= 0 && this.seated[this.active]) { this.reorder(false); this.relocate(); }
    this.width = windowWidth(this.tier, this.level, this.tool, this.helpers);
    if (this.remaining === 0) this.finish(true);
  }
  reorder(shuffle) {
    const left = []; for (let i = 0; i < this.pins; i++) if (!this.seated[i]) left.push(i);
    if (shuffle) for (let i = left.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [left[i], left[j]] = [left[j], left[i]]; }
    this.order = left; this.active = left.length ? left[0] : -1;
  }
  relocate() {
    this.width = windowWidth(this.tier, this.level, this.tool, this.helpers);
    const half = this.width / 2, cur = this.pos;
    let c = half + this.rng() * (1 - 2 * half);
    if (Math.abs(c - cur) < 0.22) c = clamp(cur < 0.5 ? cur + 0.3 + this.rng() * 0.15 : cur - 0.3 - this.rng() * 0.15, half, 1 - half);   // never instant
    this.center = c;
  }
  inWindow() { return this.oneClick || Math.abs(this.pos - this.center) <= this.width / 2; }
  finish(ok, why) {
    this.done = true; this.opened = !!ok;
    if (!ok) { if (why === 'break') this.broken = true; else if (why === 'timeout') this.timedOut = true; }
  }
  click() {
    if (this.done || this.active < 0) return { hit: false, done: this.done };
    if (this.lockout > 0) return { hit: false, locked: true, done: false };
    if (this.inWindow()) {
      const idx = this.active;
      this.seated[idx] = true; this.stack.push(idx);
      this.reorder(false);
      let opened = false;
      if (this.remaining === 0) { this.finish(true); opened = true; } else this.relocate();
      return { hit: true, seated: idx, done: this.done, opened };
    }
    this.wrong++;
    let dropped = -1;
    if (this.stack.length) { dropped = this.stack.pop(); this.seated[dropped] = false; }
    this.lockout = 0.28;
    if (this.wrong >= this.maxWrong) { this.finish(false, 'break'); return { hit: false, dropped, broken: true, done: true }; }
    this.reorder(this.T.shuffle > 0); this.relocate();
    return { hit: false, dropped, wrong: this.wrong, done: false };
  }
  tick(dt) {
    if (this.done) return { done: true };
    this.t += dt; if (this.lockout > 0) this.lockout = Math.max(0, this.lockout - dt);
    const out = { done: false };
    if (this.timer > 0) { this.timeLeft = Math.max(0, this.timeLeft - dt); if (this.timeLeft <= 0) { this.finish(false, 'timeout'); return { done: true, timeout: true }; } }
    if (this.T.shuffle > 0 && this.remaining > 1) {
      this.shuffleT -= dt;
      if (this.shuffleT <= 0) { this.shuffleT = this.T.shuffle; this.shuffles++; this.reorder(true); this.relocate(); out.shuffled = true; }
    }
    return out;
  }
}

/** Drill / bypass style auto run: seats every remaining pin one after another. Returns the event list [{ at (s), pin }] and the total time. */
export function autoRun(state) {
  const tl = state.tl, ev = []; let at = SETUP_TIME;
  for (let i = 0; i < state.pins; i++) if (!state.seated[i]) { at += tl.auto; ev.push({ at: +at.toFixed(3), pin: i }); }
  return { events: ev, total: +(at + OPEN_TIME * 0.5).toFixed(3) };
}

// ---------------------------------------------------------------------------------------------- co-op book (host)
export const COOP = Object.freeze({ HELP_TTL: 1.3, REACH: 4.2, SESSION_TTL: 90 });
/**
 * Host bookkeeping of lock sessions: a picker 'start's one at his position, other players in reach 'help' (hold E, renewed every ~0.5 s, expires after HELP_TTL).
 * Pure: pass the clock in (seconds) and a distance function.
 */
export class Coop {
  constructor() { this.sessions = new Map(); this.seq = 0; }
  start(by, pos, tier, now) {
    for (const s of this.sessions.values()) if (s.by === by) this.sessions.delete(s.id);
    if (!isTier(tier)) return null;
    const s = { id: 'lp' + (++this.seq), by, x: pos[0], y: pos[1], z: pos[2], tier, at: now, helpers: new Map() };
    this.sessions.set(s.id, s);
    return s;
  }
  end(by) { for (const s of this.sessions.values()) if (s.by === by) this.sessions.delete(s.id); }
  /** a second player holds the pins; false when out of reach / own lock / unknown / full */
  help(from, id, pos, now) {
    const s = this.sessions.get(id);
    if (!s || s.by === from) return false;
    if (Math.hypot(s.x - pos[0], s.z - pos[2]) > COOP.REACH || Math.abs(s.y - pos[1]) > 3) return false;
    if (!s.helpers.has(from) && this.count(s, now) >= COOP_MAX_HELPERS) return false;
    s.helpers.set(from, now + COOP.HELP_TTL);
    return true;
  }
  count(s, now) { let n = 0; for (const [k, until] of s.helpers) { if (until > now) n++; else s.helpers.delete(k); } return n; }
  /** drops expired helpers / sessions; returns true when anything changed (caller re-broadcasts) */
  sweep(now) {
    let ch = false;
    for (const s of [...this.sessions.values()]) {
      if (now - s.at > COOP.SESSION_TTL) { this.sessions.delete(s.id); ch = true; continue; }
      const before = s.helpers.size, n = this.count(s, now);
      if (before !== s.helpers.size || n !== s.h) { s.h = n; ch = true; }
    }
    return ch;
  }
  list(now) { return [...this.sessions.values()].map((s) => ({ id: s.id, by: s.by, x: +s.x.toFixed(1), y: +s.y.toFixed(1), z: +s.z.toFixed(1), tier: s.tier, h: this.count(s, now) })); }
}
