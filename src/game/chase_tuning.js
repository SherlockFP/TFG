// CHASE TUNING (wave 5, docs/wave5/aimchase.md, MASTERPLAN 25.13): the ONE place that decides how fast creatures may actually run.
//   Rule: a creature's SUSTAINED chase speed is below the player's sprint (8.2 m/s). Fast hunters (def.run / def.walk above SUSTAINED)
//   get a short BURST (2-3 s up to ~9.5 m/s), then are TIRED (slow), then must recover at the sustained speed before the next burst.
//   Fast movers also turn wide (lower turn rate, they slow down when not facing the path), and hesitate 1-2 s when a shut door is in
//   their face. Bosses / hazards / the Worm are exempt (they have their own scripted mechanics).
//   Applied host-side inside CreatureManager.follow() (src/entities/creatures.js), so every behaviour that walks a path is covered,
//   including creatures registered by other modules. def.run stays what the behaviour ASKS for; this table decides what it GETS.
export const PLAYER_SPRINT = 8.2;

export const TUNING = {
  sustained: 7.0,      // m/s a chaser can hold forever (< 8.2, so a sprinter always pulls away in the long run)
  burstMax: 9.4,       // m/s cap while bursting
  burstDur: 2.2,       // s of burst (2-3 s)
  tiredDur: 3.0,       // s of fatigue after a burst
  tiredMul: 0.6,       // fatigue speed = sustained * tiredMul (4.2 m/s: slower than a walking player)
  restDur: 6.0,        // s at sustained speed before the burst is available again (cycle average 6.7 m/s)
  idleReset: 1.5,      // s of not chasing (asking for <= sustained) that refills the burst
  chaseMin: 4.5,       // a request at or above this counts as "chasing" (door hesitation, tension)
  turnRate: 8,         // rad/s, the old default
  fastTurnRate: 4.2,   // rad/s for creatures whose ask is above sustained: wide corners
  facingSlow: 0.3,     // speed factor while not facing the path (old default)
  fastFacingSlow: 0.16,// same for fast movers: they lose speed in every corner
  doorPause: [1.0, 2.0],      // s a chasing fast creature stands at a shut door before it opens it
  doorPauseSlow: [0.4, 0.8],  // same for the slower ones
  exempt: ['sandkefal'],      // + def.boss / def.hazard
  // per-type overrides (all optional); keep the table short, the defaults are the design
  perType: {
    jester: { burstDur: 2.6, burstMax: 9.5 },      // winds up for ages, then comes fast: the burst is its whole threat
    mannequin: { burstDur: 2.4 },
    crawler: { burstDur: 2.4 },
    hound: { burstDur: 2.2 },
    lurker: { burstDur: 2.0, burstMax: 9.4 },
    tamagotchi: { burstDur: 2.0 },
  },
};

const _cache = new Map();
/** merged tuning for a creature (def + type), or null when exempt (boss / hazard / the Worm / immobile). Cached per def object. */
export function chaseCfg(def, type) {
  if (!def || def.boss || def.hazard || TUNING.exempt.includes(type)) return null;
  const ask = Math.max(def.run || 0, def.walk || 0);
  if (!(ask > 0)) return null;
  let c = _cache.get(def);
  if (!c || c.type !== type) {
    const o = TUNING.perType[type] || {};
    c = { type, ...TUNING, ...o, fast: ask > TUNING.sustained };
    _cache.set(def, c);
  }
  return c;
}

/** per-creature chase state (stored on the host creature as c._ch) */
export const newChase = () => ({ b: null, tired: 0, rest: 0, idle: 0 });

/** speed the creature actually gets when it asks for `want` m/s for `dt` seconds. Mutates the chase state `ch`. */
export function chaseSpeed(ch, want, dt, cfg, now) {
  if (!cfg) return want;
  if (now != null) {                                       // a creature that was not asked to walk a path for a while has recovered
    if (ch.at != null && now - ch.at > cfg.idleReset + 0.25) { ch.b = cfg.burstDur; ch.tired = 0; ch.rest = 0; }
    ch.at = now;
  }
  if (ch.b == null) ch.b = cfg.burstDur;                   // first chase starts with a full burst
  if (want <= cfg.sustained) {                             // not really running: rest counts as recovery, walking is untouched
    ch.idle += dt;
    if (ch.idle >= cfg.idleReset) { ch.b = cfg.burstDur; ch.tired = 0; ch.rest = 0; }
    return want;
  }
  ch.idle = 0;
  if (ch.tired > 0) {
    ch.tired -= dt;
    if (ch.tired <= 0) ch.rest = cfg.restDur;
    return Math.min(want, cfg.sustained * cfg.tiredMul);
  }
  if (ch.rest > 0) {
    ch.rest -= dt;
    if (ch.rest <= 0) ch.b = cfg.burstDur;
    return Math.min(want, cfg.sustained);
  }
  if (ch.b > 0) {
    ch.b -= dt;
    if (ch.b <= 0) ch.tired = cfg.tiredDur;
    return Math.min(want, cfg.burstMax);
  }
  return Math.min(want, cfg.sustained);
}

/** turning: [turnRate rad/s, speed factor while not facing the path] */
export function chaseTurn(cfg, want, turnRate, facingSlow) {
  if (!cfg || !(want > cfg.sustained)) return [turnRate, facingSlow];
  return [Math.min(turnRate, cfg.fastTurnRate), Math.min(facingSlow, cfg.fastFacingSlow)];
}

/** how long a chasing creature hesitates at a shut door (0 when it is not chasing); r = random 0..1 */
export function doorPause(cfg, want, r) {
  if (!cfg || want < cfg.chaseMin) return 0;
  const [a, b] = want > cfg.sustained ? cfg.doorPause : cfg.doorPauseSlow;
  return a + (b - a) * r;
}

// ---- tension: how strongly the player should feel the nearest chaser (client visuals + audio) ----
/** 0..1 from the distance (m) of the nearest chasing creature: 0 beyond 28 m, 1 at 3 m */
export function tension(dist) { if (!(dist < 28)) return 0; const k = (28 - Math.max(3, dist)) / 25; return k * k * (3 - 2 * k); }
/** seconds between heartbeat pulses at tension k (matches the director's 1.05 -> 0.42 s) */
export const pulseInterval = (k) => 1.05 + (0.42 - 1.05) * Math.min(1, Math.max(0, k));
