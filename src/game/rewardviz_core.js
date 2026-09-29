// REWARDVIZ core (wave 8, docs/wave8/rewardviz.md): pure rules - the per-day reward ledger, the map bonus, chips, the pop threshold. No DOM / game access.
export const POP_MIN = 100;            // payouts >= this get a sound + fly-up number, smaller ones stay quiet
export const ORE_CAP = 240;            // mirrors mining_core MN.valueCap (display only)
export const WARN_SECS = 6;            // the lever confirm window

export const SRC = ['job', 'crate', 'pocket', 'map', 'till', 'ore', 'clout', 'fine', 'fee', 'tax'];
export const freshLedger = () => ({ job: 0, crate: 0, pocket: 0, till: 0, ore: 0, clout: 0, fee: 0, tax: 0 });

/** add n of a source to the ledger (unknown sources / non-numbers are ignored) */
export function note(L, src, n) {
  n = Math.round(+n);
  if (!L || !Number.isFinite(n) || n <= 0 || !(src in L)) return false;
  L[src] += n; return true;
}
export const shouldPop = (n) => Math.round(+n) >= POP_MIN;

/** credits of a day's scrap that came only from the sector map's value affix (value already contains the multiplier) */
export function mapBonus(collected, valPct) {
  const c = +collected, v = +valPct;
  if (!(c > 0) || !(v > 0)) return 0;
  return Math.round(c * v / (100 + v));
}

export const valueChip = (pct) => `+${Math.round(pct)} % VALUE`;
export const curseChip = (mul) => `CURSED ×${mul}`;

/** the rows of the split block: [key, glyph, n, sign] (only rows with something in them; sign '-' = a cost) */
export function rowsOf(L, d, mapVal) {
  const out = [];
  const add = (k, g, n, sign = '+') => { n = Math.round(+n) || 0; if (n > 0) out.push([k, g, n, sign]); };
  add('scrap', '▮', d?.collected);
  add('job', '▶', L.job);
  add('crate', '▣', L.crate);
  add('pocket', '◐', L.pocket);
  add('map', '★', mapBonus(d?.collected, mapVal));
  add('till', '▤', L.till);
  add('ore', '◆', L.ore);
  add('clout', '◈', L.clout);
  add('fine', '✖', d?.fines, '-');
  add('fee', '✖', L.fee, '-');
  add('tax', '✖', L.tax, '-');
  return out;
}

/** does the ship lever need the "job not started" warning? Returns the fee (0 = no warning). jobs = run.fj.j */
export function leverFee(jobs, credits, failFee = 25) {
  if (!Array.isArray(jobs)) return 0;
  const j = jobs.find((q) => q && q.sl === 'm' && !q.pd && q.st !== 1);
  if (!j || (+j.n > 0 ? (+j.p || 0) / +j.n : 0) > 0) return 0;
  return Math.min(failFee, Math.max(0, credits | 0));
}
