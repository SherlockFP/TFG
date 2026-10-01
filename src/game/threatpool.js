// THREAT POOL (wave 8 "threatmerge", docs/wave8/threatmerge.md). Pure (no THREE / DOM): each moon draws a 3-4 creature pool from ~10 curated
// "headline" creatures with distinct rules, seeded per (run, moon, sector). Headline creatures outside the pool are rare (Hard mode: less rare) in
// the spawn tables and blocked for scripted spawners; every other creature is untouched. Shown on the terminal as KNOWN RESIDENTS; enforced in
// spawnTable (creatures.js), lcmonsters planDay and the crdirector "new rule" pick.
import { RNG, hashString } from '../core/rng.js';
import { getMode } from './difficulty.js';
import { addTranslations } from '../core/i18n.js';
import * as C10 from './creatures10_core.js';   // pure (no imports): the spawn gates below are the single source of the headline minQ
import * as C11 from './creatures11_core.js';
import * as S11 from './swarm11_core.js';

addTranslations({ 'KNOWN RESIDENTS': 'BİLİNEN SAKİNLER', 'Zombie Accounts': 'Zombi Hesaplar' }, 'tr');
addTranslations({ 'KNOWN RESIDENTS': 'ИЗВЕСТНЫЕ ОБИТАТЕЛИ', 'Zombie Accounts': 'Зомби-аккаунты' }, 'ru');

/** id: creature id (name = CREATURES[id].name), zone: where it lives, minQ: earliest quota index it may be drawn */
export const HEADLINE = Object.freeze([
  { id: 'listener', zone: 'in' }, { id: 'spider', zone: 'in' },
  { id: 'lm_keeper', zone: 'in' }, { id: 'lm_masked', zone: 'in', minQ: 1 }, { id: 'lm_lootmimic', zone: 'in' },
  { id: 'cd_follower', zone: 'in', minQ: 1 }, { id: 'cd_dimmer', zone: 'in', minQ: 1 }, { id: 'cd_auditor', zone: 'in', minQ: 1 },
  { id: 'lm_hunter', zone: 'in', minQ: 1 }, { id: 'lm_witch', zone: 'out' },
  { id: 'c12_404', zone: 'in', minQ: 2 }, { id: 'c12_cookie', zone: 'in', minQ: 2 }, { id: 'c12_echo', zone: 'in', minQ: 2 }, { id: 'c12_lag', zone: 'in', minQ: 2 },   // wave 12 creatures12 (docs/wave12/creatures12.md)
  { id: 'c10_buffering', zone: 'in', minQ: C10.TUNE.minQuota.c10_buffering }, { id: 'c10_doomscroller', zone: 'in', minQ: C10.TUNE.minQuota.c10_doomscroller }, { id: 'c10_ratio', zone: 'in', minQ: C10.TUNE.minQuota.c10_ratio },   // wave 10 creatures10 (docs/wave10/creatures10.md); minQ = the creature's own spawn gate (wave 12 balance12 staggers them)
  { id: 'c11_captcha', zone: 'in', minQ: C11.TUNE.minQuota.c11_captcha }, { id: 'c11_shadowban', zone: 'in', minQ: C11.TUNE.minQuota.c11_shadowban }, { id: 'c11_recommender', zone: 'in', minQ: C11.TUNE.minQuota.c11_recommender },   // wave 11 creatures11 (docs/wave11/creatures11.md)
  { id: 'sw_scraper', zone: 'in' }, { id: 'sw_streamer', zone: 'in', minQ: S11.TUNE.minQuota.sw_streamer }, { id: 'sw_automod', zone: 'in', minQ: S11.TUNE.minQuota.sw_automod },   // wave 11 swarm11 (docs/wave11/swarm11.md)
  { id: 'c13_printer', zone: 'in', minQ: 2 }, { id: 'c13_checksum', zone: 'in', minQ: 2 },
  { id: 'c20_pixel', zone: 'in', minQ: 2, family: 'cargo20' }, { id: 'c20_brute', zone: 'in', minQ: 2, family: 'cargo20' },
  { id: 'zombie', zone: 'out', minQ: 3 },   // Zombie Accounts: horde waves (crdirector gates them to quota 3+ anyway)
]);
export const HEAD_IDS = new Set(HEADLINE.map((h) => h.id));
/** lcmonsters plan kind -> creature id */
export const LM_KIND_ID = Object.freeze({ witch: 'lm_witch', keeper: 'lm_keeper', lootmimic: 'lm_lootmimic', masked: 'lm_masked', otherside: 'lm_hunter' });
/** everyday roster of the base game: never a "theme" creature */
const BASELINE = new Set(['scuttler', 'yoinker', 'crawler', 'lurker', 'mannequin', 'sludge', 'spider', 'leech', 'jester', 'screamer', 'mimic', 'turret', 'mine', 'hound', 'giant', 'listener']);
export const POOL_SIZE = 3;
/** [balance12] wave 10 / 11 headliners ("new rules"): a pool holds at most newCap(q) of them - 1 before quota 2 (one lesson per landing), 2 at quota 2-3, then unlimited (the late game combines them) */
export const NEW_IDS = new Set(['c12_404', 'c12_cookie', 'c12_echo', 'c12_lag', 'c13_printer', 'c13_checksum', 'c20_pixel', 'c20_brute', 'c10_buffering', 'c10_doomscroller', 'c10_ratio', 'c11_captcha', 'c11_shadowban', 'c11_recommender', 'sw_scraper', 'sw_streamer', 'sw_automod']);
export const newCap = (q) => ((q | 0) < 2 ? 1 : (q | 0) < 4 ? 2 : 9);
/** [balance12] pool size: 3 residents until quota 4, then 4 (more rules meet on one moon) */
export const poolSize = (q) => ((q | 0) >= 4 ? POOL_SIZE + 1 : POOL_SIZE);
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
  let fresh = 0;
  for (let n = 0; n < poolSize(q) && cand.length; n++) {
    const h = cand.splice(rng.int(0, cand.length - 1), 1)[0];
    if (h.family && ids.some(id => HEADLINE.find(e => e.id === id)?.family === h.family)) { n--; continue; }
    if (NEW_IDS.has(h.id) && fresh >= newCap(q)) { n--; continue; }   // over the cap: draw again (the skipped one stays out)
    if (NEW_IDS.has(h.id)) fresh++;
    ids.push(h.id);
  }
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
