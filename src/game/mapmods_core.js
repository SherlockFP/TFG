// MAP MODS core (wave 8, docs/wave8/mapmods.md): Path-of-Exile-style affixes for a landing's interior. PURE (no THREE / DOM / game): node-tested.
//   * A landing rolls 0-3 affixes by rarity (Normal 0 / Magic 1-2 / Rare 3), seeded from (run id, day, roll counter). Rarity odds rise with the quota index (= sector).
//   * PREFIX = danger (the crew pays for it), SUFFIX = environment. Every affix carries a reward [qty %, value %] shown next to it, like PoE map mods.
//   * `fx` uses the daily-event vocabulary (dailyEvents.js combineEvents), so every existing consumer (HUD, extra scrap, blackout, elites, bot packs, clout...)
//     already understands it. `flag` effects (speed / hearing / volatile) are read by the glue in mapmods.js.
//   * Fairness (balance_rules.js): no affix touches damage numbers; the combined danger multiplier is capped; the nasty ones are gated behind a quota index.
import { RNG, hashString } from '../core/rng.js';

export const MAX_AFFIX = 3;
export const DANGER_CAP = 1.5;       // combined dangerMul never exceeds this (a Purge day is 1.22)
export const RARITY = ['normal', 'magic', 'rare'];
export const RARITY_NAME = ['NORMAL', 'MAGIC', 'RARE'];

/** kind: prefix (danger) | suffix (environment). minQ: first quota index it can roll. w: weight. rew: [quantity %, value %]. */
export const AFFIXES = [
  { id: 'infested', kind: 'prefix', name: 'Infested', desc: 'More creatures live in the facility (+20% spawns).', minQ: 1, w: 10, rew: [8, 12], fx: { dangerMul: 1.2 } },
  { id: 'overclocked', kind: 'prefix', name: 'Overclocked', desc: 'Creatures move 15% faster (never past the early-sector speed cap).', minQ: 2, w: 7, rew: [0, 20], flag: { spd: 1.15 } },
  { id: 'volatile', kind: 'prefix', name: 'Volatile', desc: 'Dropped scrap may blow up a moment later (beeps first, 22 damage max).', minQ: 1, w: 6, rew: [5, 15], flag: { boom: 0.15 } },
  { id: 'watched', kind: 'prefix', name: 'Watched', desc: 'The Algorithm streams this floor: Clout +40%, the crowd wants blood (+6% danger).', minQ: 0, w: 9, rew: [0, 8], fx: { coinMul: 1.4, dangerMul: 1.06 } },
  { id: 'ruthless', kind: 'prefix', name: 'Ruthless', desc: 'Elite creatures are 12% more common.', minQ: 3, w: 5, rew: [0, 18], fx: { eliteAdd: 0.12 } },
  { id: 'swarming', kind: 'prefix', name: 'Swarming', desc: 'Two extra bot packs are released indoors.', minQ: 1, w: 7, rew: [6, 8], fx: { swarm: 2 } },
  { id: 'hoarder', kind: 'prefix', name: 'Hoarder', desc: 'One more loot room worth of scrap, and the floor is a little busier (+10% danger).', minQ: 0, w: 8, rew: [25, 0], fx: { dangerMul: 1.1 } },
  { id: 'silence', kind: 'suffix', name: 'of Silence', desc: 'The Listener hears 50% farther. Sneak, or do not move.', minQ: 1, w: 8, rew: [0, 10], flag: { listen: 1.5 } },
  { id: 'darkness', kind: 'suffix', name: 'of Darkness', desc: 'The interior lights are off. Bring flashlights; a fuse box restores power.', minQ: 1, w: 7, rew: [5, 20], fx: { blackout: true } },
  { id: 'echoes', kind: 'suffix', name: 'of Echoes', desc: 'Sound carries: every creature notices you 20% farther away.', minQ: 2, w: 7, rew: [5, 10], flag: { detect: 1.2 } },
  { id: 'draining', kind: 'suffix', name: 'of Draining', desc: 'Batteries drain 33% faster.', minQ: 0, w: 8, rew: [0, 8], fx: { batteryMul: 0.75 } },
  { id: 'static', kind: 'suffix', name: 'of Static', desc: 'Scanner range -30%.', minQ: 0, w: 8, rew: [0, 8], fx: { scanMul: 0.7 } },
  { id: 'fatigue', kind: 'suffix', name: 'of Fatigue', desc: 'Stamina regenerates 30% slower.', minQ: 0, w: 7, rew: [0, 6], fx: { staminaMul: 0.7 } },
];
export const AFFIX_BY_ID = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));

/** [normal, magic, rare] probabilities at quota index q. Early game: no Rare before quota 2. */
export function rarityOdds(q) {
  q = Math.max(0, q | 0);
  const rare = q < 2 ? 0 : Math.min(0.35, 0.06 + 0.035 * (q - 2));
  const magic = Math.min(0.5, 0.26 + 0.04 * q);
  return [1 - rare - magic, magic, rare];
}

const hasQ = (a, q) => (a.minQ || 0) <= q;
/** pick `n` distinct affixes: at most 2 prefixes and 2 suffixes; `have` (ids) stay and are never duplicated. */
function pickMore(rng, have, n, q) {
  const out = have.slice();
  for (let guard = 0; out.length < have.length + n && guard < 40; guard++) {
    const pre = out.filter((id) => AFFIX_BY_ID[id].kind === 'prefix').length, suf = out.length - pre;
    const pool = AFFIXES.filter((a) => hasQ(a, q) && !out.includes(a.id) && (a.kind === 'prefix' ? pre < 2 : suf < 2));
    if (!pool.length) break;
    out.push(rng.weighted(pool).id);
  }
  return out;
}
const rarityOf = (n) => (n >= 3 ? 2 : n >= 1 ? 1 : 0);

/** the seeded roll of one landing: { r: rarity index, a: [affix ids] } */
export function rollMap(seedStr, q) {
  const rng = new RNG(hashString('mm:' + seedStr));
  const odds = rarityOdds(q);
  let r = 0, x = rng.next();
  if (x >= odds[0]) r = x < odds[0] + odds[1] ? 1 : 2;
  const n = r === 0 ? 0 : r === 1 ? rng.int(1, 2) : 3;
  return { r: rarityOf(n), a: pickMore(rng, [], n, q) };
}
/** exalted-style: add one affix (max MAX_AFFIX, rarity follows the count). Returns the same map when full. */
export function addAffix(map, seedStr, q) {
  const have = map?.a || [];
  if (have.length >= MAX_AFFIX) return { r: rarityOf(have.length), a: have.slice() };
  const rng = new RNG(hashString('mmadd:' + seedStr));
  const a = pickMore(rng, have, 1, q);
  return { r: rarityOf(a.length), a };
}

/** total reward of an affix list: { qty %, val % } (additive, PoE style) */
export function rewardOf(ids) {
  let qty = 0, val = 0;
  for (const id of ids || []) { const a = AFFIX_BY_ID[id]; if (a) { qty += a.rew[0]; val += a.rew[1]; } }
  return { qty, val };
}

/** the daily-event style effect object of an affix list (multipliers multiply, counts add), rewards included. Danger is capped. */
export function effectsOf(ids) {
  const fx = {};
  for (const id of ids || []) {
    const a = AFFIX_BY_ID[id];
    if (!a?.fx) continue;
    for (const [k, v] of Object.entries(a.fx)) {
      if (typeof v === 'number') fx[k] = k === 'swarm' || k === 'eliteAdd' ? (fx[k] || 0) + v : (fx[k] ?? 1) * v;
      else fx[k] = v;
    }
  }
  const rw = rewardOf(ids);
  if (rw.val) fx.valueMul = (fx.valueMul ?? 1) * (1 + rw.val / 100);
  if (rw.qty >= 10) fx.extraScrap = +(rw.qty / 40).toFixed(2);   // 25% -> 0.6 (dailyEvents adds spots*0.35*x + 2 scrap)
  if (fx.dangerMul) fx.dangerMul = +Math.min(DANGER_CAP, fx.dangerMul).toFixed(3);
  return fx;
}
/** runtime flag multipliers (host AI / items): { spd, listen, detect, boom } (1 / 0 = off) */
export function flagsOf(ids) {
  const f = { spd: 1, listen: 1, detect: 1, boom: 0 };
  for (const id of ids || []) { const fl = AFFIX_BY_ID[id]?.flag; if (fl) for (const [k, v] of Object.entries(fl)) f[k] = k === 'boom' ? Math.max(f[k], v) : f[k] * v; }
  return f;
}

/** "Infested Overclocked 56K-Dialup of Darkness of Silence" */
export function mapTitle(moonName, ids, tr = (s) => s) {
  const list = (ids || []).map((id) => AFFIX_BY_ID[id]).filter(Boolean);
  const pre = list.filter((a) => a.kind === 'prefix').map((a) => tr(a.name)), suf = list.filter((a) => a.kind === 'suffix').map((a) => tr(a.name));
  return [...pre, moonName, ...suf].join(' ');
}
/** validate untrusted / saved data: keeps only known ids, max MAX_AFFIX, recomputes rarity */
export function cleanMap(m) {
  if (!m || !Array.isArray(m.a)) return null;
  const a = [...new Set(m.a.filter((id) => AFFIX_BY_ID[id]))].slice(0, MAX_AFFIX);
  return { r: rarityOf(a.length), a };
}
