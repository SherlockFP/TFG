// algo1 pure rules (docs/wave5/algo1.md): the behaviour tracker, the counter-change choice + caps, the morning-vote tally / debt maths and the
// viewer-count model. No THREE / DOM here so tools/harness/algo1.test.mjs can run it in plain node.

export const T = {
  sideDx: 7,            // m left / right of the entrance line before a position counts as the left / right wing
  routeMinT: 45,        // s of indoor time before a favourite route is believed
  routeShare: 0.5,      // that side must hold >= 50 % of the indoor time
  sprintMinMoveT: 40, sprintHeavy: 0.42,
  causeMin: 2,          // deaths to the same cause before it is punished
  mercyDeaths: 3, mercyNear: 3,
  extraPowerCap: 2,     // an added creature may cost at most this much spawn power (and there is only ever ONE per landing)
  mercyDanger: 0.9,
  voteSec: 15, debtK: 0.5,
};

// ------------------------------------------------------------------ behaviour tracker (one profile per landing)
export const newProfile = () => ({ routes: { L: 0, C: 0, R: 0 }, moveT: 0, sprintT: 0, deaths: [], near: 0 });
export const sideOf = (dx) => (dx < -T.sideDx ? 'L' : dx > T.sideDx ? 'R' : 'C');
/** s = { side: 'L'|'C'|'R'|null (null = not indoors), moving, sprint, dt } */
export function track(p, s) {
  const dt = Math.max(0, Math.min(2, +s.dt || 0));
  if (s.moving) { p.moveT += dt; if (s.sprint) p.sprintT += dt; }
  if (s.side && p.routes[s.side] !== undefined) p.routes[s.side] += dt;
  return p;
}
export const recordDeath = (p, cause, side) => { p.deaths.push({ cause: String(cause || '?'), side: side || 'C' }); return p; };
export const recordNear = (p) => { p.near += 1; return p; };
export const sprintRatio = (p) => (p.moveT > 0 ? Math.min(1, p.sprintT / p.moveT) : 0);
export function favouriteRoute(p) {
  const tot = p.routes.L + p.routes.C + p.routes.R;
  if (tot < T.routeMinT) return null;
  let best = 'C';
  for (const k of ['L', 'R', 'C']) if (p.routes[k] > p.routes[best]) best = k;
  const share = p.routes[best] / tot;
  return share >= T.routeShare ? { side: best, share: +share.toFixed(2) } : null;
}
export function topCause(p) {
  const n = {};
  for (const d of p.deaths) n[d.cause] = (n[d.cause] || 0) + 1;
  let best = null;
  for (const k of Object.keys(n)) if (!best || n[k] > best.n) best = { cause: k, n: n[k] };
  return best;
}

/**
 * ONE counter-change for the next landing, or null. o = { quotaIndex, spawnable: (type) => power|null, hasListener, routeType }.
 * Priority: mercy (crew is struggling) > cause (repeated deaths to X) > sprint (noise hunter) > route (something on the favourite corridor).
 * Never in quota 0; extra creatures cost <= T.extraPowerCap.
 */
export function chooseCounter(p, o = {}) {
  if (!p || (o.quotaIndex | 0) <= 0) return null;
  if (p.deaths.length >= T.mercyDeaths || p.near >= T.mercyNear) return { kind: 'mercy', dangerMul: T.mercyDanger };
  const ok = (type) => { const pw = o.spawnable?.(type); return pw != null && pw > 0 && pw <= T.extraPowerCap; };
  const tc = topCause(p);
  if (tc && tc.n >= T.causeMin && ok(tc.cause)) return { kind: 'cause', type: tc.cause, n: tc.n };
  if (p.moveT >= T.sprintMinMoveT && sprintRatio(p) >= T.sprintHeavy && o.hasListener && ok('listener')) return { kind: 'sprint', type: 'listener', ratio: +sprintRatio(p).toFixed(2) };
  const fr = favouriteRoute(p);
  if (fr && o.routeType && ok(o.routeType)) return { kind: 'route', side: fr.side, type: o.routeType, share: fr.share };
  return null;
}

// ------------------------------------------------------------------ morning vote
/** rule cards: fx knobs are all real (dangerMul / valueMul at populate, dayLenMul at landing, speedMul, jumpMul, staminaRegen, blackout). */
export const RULES = {
  lowgrav:   { name: 'Half gravity',             desc: 'Jumps carry 30% further. Falling still hurts.',        fx: { jumpMul: 1.3 }, safe: true },
  lights:    { name: 'Lights out',               desc: 'The facility starts without power. Loot +15%.',        fx: { blackout: true, valueMul: 1.15 } },
  fastquiet: { name: 'Quiet halls, fast feet',   desc: 'Fewer creatures (-20%), but they are 15% faster.',     fx: { dangerMul: 0.8, speedMul: 1.15 } },
  double:    { name: 'Double loot, early close', desc: 'Loot is worth +80%. The day is 30% shorter.',          fx: { valueMul: 1.8, dayLenMul: 0.7 }, safe: true },
  bonanza:   { name: 'Bonanza',                  desc: 'Loot +40%, creature budget +15%.',                     fx: { valueMul: 1.4, dangerMul: 1.15 } },
  traffic:   { name: 'Traffic spike',            desc: 'Creature budget +25%. Loot +25%.',                     fx: { dangerMul: 1.25, valueMul: 1.25 } },
  tired:     { name: 'Sleep deprivation',        desc: 'Stamina regenerates 30% slower. Loot +20%.',           fx: { staminaRegen: 0.7, valueMul: 1.2 } },
  fastday:   { name: 'Speedrun patch',           desc: 'The day is 25% shorter. Loot +20%.',                   fx: { dayLenMul: 0.75, valueMul: 1.2 }, safe: true },
  doors:     { name: 'Creatures learn doors',    desc: 'Creatures are 15% faster. Loot +15%.',                 fx: { speedMul: 1.15, valueMul: 1.15 } },
  calm:      { name: 'Quiet hours',              desc: 'Creature budget -20%. Loot -10%.',                     fx: { dangerMul: 0.8, valueMul: 0.9 }, safe: true },
};
export const RULE_IDS = Object.keys(RULES);

/** 3 distinct card ids. rnd = () => [0,1). Quota 0 only offers `safe` cards. `exclude` (yesterday's debt) is not offered again. */
export function drawCards(rnd, quotaIndex, exclude = null) {
  const a = RULE_IDS.filter((id) => id !== exclude && ((quotaIndex | 0) > 0 || RULES[id].safe));
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, 3);
}
/** votes = Map|object playerId -> card index. Returns { counts, win (index), tie, none }. Ties / no votes: the Algorithm picks among the leaders. */
export function tally(votes, n, rnd) {
  const counts = new Array(n).fill(0);
  for (const v of (votes instanceof Map ? votes.values() : Object.values(votes || {}))) if (Number.isInteger(v) && v >= 0 && v < n) counts[v]++;
  const max = Math.max(0, ...counts);
  const leaders = counts.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0);
  const none = max === 0, tie = leaders.length > 1;
  const win = leaders.length === 1 ? leaders[0] : leaders[Math.floor((rnd ? rnd() : 0.5) * leaders.length) % leaders.length];
  return { counts, win, tie: tie && !none, none };
}
/** which losing card becomes debt: the loser with the most votes (the crew's runner-up), ties by rnd. */
export function pickDebt(counts, win, rnd) {
  const losers = counts.map((c, i) => i).filter((i) => i !== win);
  if (!losers.length) return null;
  const m = Math.max(...losers.map((i) => counts[i]));
  const top = losers.filter((i) => counts[i] === m);
  return top[Math.floor((rnd ? rnd() : 0.5) * top.length) % top.length];
}
/** combine active rules: [{ id, k }] k = 1 full, 0.5 debt. Multiplicative knobs scale toward 1 by k; blackout only at full strength. */
export function combine(list) {
  const out = { dangerMul: 1, valueMul: 1, dayLenMul: 1, speedMul: 1, jumpMul: 1, staminaRegen: 1, blackout: false };
  for (const { id, k = 1 } of list || []) {
    const f = RULES[id]?.fx; if (!f) continue;
    for (const [key, v] of Object.entries(f)) {
      if (key === 'blackout') { if (k >= 1) out.blackout = true; } else out[key] = +(out[key] * (1 + (v - 1) * k)).toFixed(4);
    }
  }
  return out;
}

// ------------------------------------------------------------------ viewers (cosmetic in v1, event 'tfg:viewers')
export const VIEW = { base: 120, max: 99999, decay: 0.02 };
export const VIEW_GAIN = { escape: 0.35, boss_hit: 0.12, sprint_away: 0.18, death: 0.25, vote: 0.05, dance: 0.04, onair: 0.06 };
export const newViewers = () => ({ n: VIEW.base });
/** kind in VIEW_GAIN: the audience grows by a share of itself (min +25). Returns the delta. */
export function addViewers(v, kind) {
  const g = VIEW_GAIN[kind]; if (!g) return 0;
  const d = Math.max(25, Math.round(v.n * g));
  v.n = Math.min(VIEW.max, v.n + d);
  return d;
}
/** slow decay toward the base (per second) */
export function decayViewers(v, dt) {
  const base = Math.max(VIEW.base, v.floor || 0);   // [algoctx] the stream overlay's audience is the new floor (seedViewers)
  if (v.n > base) v.n = Math.max(base, v.n - (v.n - base) * VIEW.decay * dt);
  return v;
}
/** [algoctx] the audience never sits still: a slow random walk (+-1.5 %/s, r01 = a 0..1 random), never below the floor. Returns v. */
export function driftViewers(v, dt, r01) {
  const base = Math.max(VIEW.base, v.floor || 0);
  v.n = Math.min(VIEW.max, Math.max(base, v.n * (1 + (r01 - 0.47) * 0.03 * dt)));
  return v;
}
/** [algoctx] the overlay's count becomes the running audience (floor = 60 % of it) */
export function seedViewers(v, n) {
  n = Math.max(VIEW.base, Math.min(VIEW.max, Math.round(n) || 0));
  v.n = n; v.floor = Math.round(n * 0.6);
  return v;
}
export const fmtViewers = (n) => (n >= 10000 ? (n / 1000).toFixed(0) + 'K' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(Math.round(n)));
