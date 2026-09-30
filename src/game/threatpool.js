// THREAT POOL (wave 8 "threatmerge", docs/wave8/threatmerge.md). Pure (no THREE / DOM): each moon draws a 3-4 creature pool from ~10 curated
// "headline" creatures with distinct rules, seeded per (run, moon, sector). Headline creatures outside the pool are rare (Hard mode: less rare) in
// the spawn tables and blocked for scripted spawners; every other creature is untouched. Shown on the terminal as KNOWN RESIDENTS; enforced in
// spawnTable (creatures.js), lcmonsters planDay and the crdirector "new rule" pick.
import { RNG, hashString } from '../core/rng.js';
import { getMode } from './difficulty.js';
import { addTranslations } from '../core/i18n.js';

addTranslations({ 'KNOWN RESIDENTS': 'BİLİNEN SAKİNLER', 'Zombie Accounts': 'Zombi Hesaplar' }, 'tr');
addTranslations({ 'KNOWN RESIDENTS': 'ИЗВЕСТНЫЕ ОБИТАТЕЛИ', 'Zombie Accounts': 'Зомби-аккаунты' }, 'ru');

/** id: creature id (name = CREATURES[id].name), zone: where it lives, minQ: earliest quota index it may be drawn */
export const HEADLINE = Object.freeze([
  { id: 'listener', zone: 'in' }, { id: 'spider', zone: 'in' },
  { id: 'lm_keeper', zone: 'in' }, { id: 'lm_masked', zone: 'in', minQ: 1 }, { id: 'lm_lootmimic', zone: 'in' },
  { id: 'cd_follower', zone: 'in', minQ: 1 }, { id: 'cd_dimmer', zone: 'in', minQ: 1 }, { id: 'cd_auditor', zone: 'in', minQ: 1 },
  { id: 'lm_hunter', zone: 'in', minQ: 1 }, { id: 'lm_witch', zone: 'out' },
  { id: 'zombie', zone: 'out', minQ: 3 },   // Zombie Accounts: horde waves (crdirector gates them to quota 3+ anyway)
]);
export const HEAD_IDS = new Set(HEADLINE.map((h) => h.id));
/** lcmonsters plan kind -> creature id */
export const LM_KIND_ID = Object.freeze({ witch: 'lm_witch', keeper: 'lm_keeper', lootmimic: 'lm_lootmimic', masked: 'lm_masked', otherside: 'lm_hunter' });
/** everyday roster of the base game: never a "theme" creature */
const BASELINE = new Set(['scuttler', 'yoinker', 'crawler', 'lurker', 'mannequin', 'sludge', 'spider', 'leech', 'jester', 'screamer', 'mimic', 'turret', 'mine', 'hound', 'giant', 'listener']);
export const POOL_SIZE = 3;
export const RARE_MUL = 0.12;   // table weight multiplier of a headline creature outside the pool (Hard mode: x2)

/** the moon's signature creature: its heaviest non-baseline spawn entry (Worm, backrooms residents, skeletons ...) or null */
export function themeOf(moon) {
  let best = null, bw = 0;
  for (const tb of [moon?.creatures, moon?.outdoor]) for (const [id, w] of Object.entries(tb || {})) if (w > bw && !BASELINE.has(id) && !HEAD_IDS.has(id)) { best = id; bw = w; }
  return best;
}
const cache = new Map();
/** pool for a run + moon: { key, ids: [headline ids], theme, all: [ids incl. theme] }. run = { runId|seed, quotaIndex }, moon = MOONS[id]. null = no pool (company / no run) */
export function poolFor(run, moon) {
  if (!run || !moon || moon.company) return null;
  const q = run.quotaIndex | 0;
  const key = `${run.runId ?? run.seed ?? 'legacy'}|${moon.id}|${q}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rng = new RNG(hashString('threatpool:' + key));
  const cand = HEADLINE.filter((h) => (h.minQ | 0) <= q && !(h.zone === 'out' && moon.noOutdoor));
  const ids = [];
  for (let n = 0; n < POOL_SIZE && cand.length; n++) ids.push(cand.splice(rng.int(0, cand.length - 1), 1)[0].id);
  const theme = themeOf(moon);
  const pool = { key, ids, theme, all: theme ? [...ids, theme] : ids };
  if (cache.size > 64) cache.clear();
  cache.set(key, pool);
  return pool;
}
/** spawn weight multiplier of creature `id` under `pool`: 1 for non-headline / pooled creatures, RARE_MUL (Hard x2) for the rest. No pool (harness, sandbox) = 1 */
export function poolMul(id, pool, hard = getMode() === 'hard') {
  if (!pool || !HEAD_IDS.has(id) || pool.ids.includes(id)) return 1;
  return hard ? RARE_MUL * 2 : RARE_MUL;
}
/** hard veto for scripted spawners (crdirector new-rule pick, lcmonsters plan): a headline creature outside the pool. Hard mode lets it through. */
export function poolBlocks(id, pool, hard = getMode() === 'hard') {
  return !!pool && !hard && HEAD_IDS.has(id) && !pool.ids.includes(id);
}
