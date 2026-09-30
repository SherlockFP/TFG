// warmset_core.js - wave 8 perf6: PURE plan of the landing "warm set" (no THREE / DOM). Which creature + item models can appear on this
// moon (its threat pool, spawn tables, scrap / big tables) so the landing queue can build one off-scene copy of each and let the
// renderer compile its shaders and upload its textures before the first real sighting (docs/wave8/perf6.md).
import { poolFor } from './threatpool.js';

export const CAP_CREATURES = 12, CAP_SCRAP = 20, CAP_BIG = 8;
/** models built by a function in the view (not createCreatureModel), never warmed */
const SKIP = new Set(['mimicdoor', 'web', 'company', 'kefaldayi']);

/** deps: { CREATURES, spawnTable, scrapTableFor, bigTableFor }. Returns { creatures: [id], items: [id] } (deduped, most likely first). */
export function warmPlan(run, moon, theme, deps) {
  const { CREATURES, spawnTable, scrapTableFor, bigTableFor } = deps;
  const cs = [], seenModel = new Set();
  const addC = (id) => {
    const def = CREATURES[id];
    if (!def || SKIP.has(id) || cs.length >= CAP_CREATURES) return;
    const key = def.model || id;
    if (seenModel.has(key) || SKIP.has(key)) return;
    seenModel.add(key); cs.push(id);
  };
  let pool = null;
  try { pool = run && moon ? poolFor(run, moon) : null; } catch { pool = null; }
  for (const id of pool?.all || []) addC(id);   // the curated residents + the moon's signature creature first
  for (const zone of moon?.noOutdoor ? ['in'] : ['in', 'out']) {
    let tb = {};
    try { tb = spawnTable(moon, zone, run) || {}; } catch { tb = {}; }
    for (const [id] of Object.entries(tb).sort((a, b) => b[1] - a[1])) addC(id);
  }
  const items = new Set();
  const top = (tbl, n) => (tbl || []).slice().sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, n).map((e) => e[0]);
  if (moon && !moon.company) {
    const th = theme || moon.interior;
    for (const id of top(scrapTableFor(th), CAP_SCRAP)) items.add(id);
    for (const id of top(bigTableFor(th), CAP_BIG)) items.add(id);
  }
  return { creatures: cs, items: [...items] };
}
