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

// [fastmenu] rolling frame-time window: a Float32Array ring (allocation-free per frame). frameStats() is called only from perfInfo().
export const FRAME_WIN = 600;
export function makeFrameRing(n = FRAME_WIN) { return { buf: new Float32Array(n), i: 0, n: 0, last: 0 }; }
/** push the frame that ended at `now` (ms); gaps > 1 s (hidden tab / debugger) are not frames */
export function pushFrame(r, now) {
  if (r.last) { const d = now - r.last; if (d > 0 && d < 1000) { r.buf[r.i] = d; r.i = (r.i + 1) % r.buf.length; if (r.n < r.buf.length) r.n++; } }
  r.last = now;
}
/** p50 / p95 / p99 frame ms + 1%-low fps (1000 / mean of the worst 1 % of frames) */
export function frameStats(r) {
  const n = r.n;
  if (!n) return { frames: 0, p50: null, p95: null, p99: null, low1pctFps: null, avgFps: null };
  const a = Array.from(r.buf.subarray(0, n)).sort((x, y) => x - y);
  const pct = (p) => a[Math.min(n - 1, Math.floor(p * n))];
  const k = Math.max(1, Math.ceil(n * 0.01));
  let worst = 0; for (let j = n - k; j < n; j++) worst += a[j];
  let sum = 0; for (const v of a) sum += v;
  const r1 = (v) => Math.round(v * 100) / 100;
  return { frames: n, p50: r1(pct(0.5)), p95: r1(pct(0.95)), p99: r1(pct(0.99)), low1pctFps: r1(1000 / (worst / k)), avgFps: r1(1000 / (sum / n)) };
}
