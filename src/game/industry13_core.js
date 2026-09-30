// Fictional supply chains advance only after completed field shifts, never wall-clock AFK.
import { hashString, RNG } from '../core/rng.js';
export const PRODUCTS = {
  cells: { name: 'Rebuilt power cells', cost: 12, sell: 23, shifts: 1, illegal: false },
  culture: { name: 'Medic culture', cost: 20, sell: 35, shifts: 1, illegal: false },
  dream: { name: 'Dreamdust contraband', cost: 30, sell: 52, shifts: 2, illegal: true },
};
export const ROBOT = { cost: 45, shifts: 2, minReturn: 52, maxReturn: 68 };
export function createIndustry() { return { shift: 0, lastShift: null, jobs: [], goods: {}, robot: null, report: null, heat: 0, serial: 0, soldShift: -1, soldValue: 0 }; }
export function industryOf(run) {
  const s = run.industry13;
  return s && Array.isArray(s.jobs) && s.goods && typeof s.goods === 'object' ? s : (run.industry13 = createIndustry());
}
export function transactIndustry(run, cmd) {
  const s = industryOf(run), p = Object.hasOwn(PRODUCTS, cmd?.product) ? PRODUCTS[cmd.product] : null;
  if (!Number.isFinite(run.credits) || run.credits < 0) return { ok: false, key: 'Invalid ledger.' };
  if (cmd?.op === 'produce') {
    if (!p || s.jobs.length >= 3 || run.credits < p.cost) return { ok: false, key: 'Not enough credits or production bays are full.' };
    run.credits -= p.cost;
    s.jobs.push({ id: ++s.serial, product: cmd.product, due: s.shift + p.shifts, ...(cmd.physical === true ? { physical: true, tuned: false } : {}) });
    return { ok: true, key: 'Batch commissioned. Complete field shifts, then collect at a broker.' };
  }
  if (cmd?.op === 'calibrate' || cmd?.op === 'pack') {
    const job=s.jobs.find(j=>j.id===cmd.id);
    if(!job?.physical || job.due>s.shift || !PRODUCTS[job.product])return {ok:false,key:'Batch is waiting for field shifts.'};
    if(cmd.op==='calibrate'){if(job.tuned)return {ok:false,key:'Batch is already calibrated.'};job.tuned=true;return {ok:true,key:'Calibration complete. Collect the finished parcel at this bay.'};}
    if(!job.tuned)return {ok:false,key:'Calibrate the bay before collecting.'};
    s.jobs.splice(s.jobs.indexOf(job),1);s.goods[job.product]=(s.goods[job.product]||0)+1;
    return {ok:true,key:'Finished parcel collected. Sell it to the broker.'};
  }
  if (cmd?.op === 'sell') {
    if (!p || !(s.goods[cmd.product] > 0)) return { ok: false, key: 'No finished batch to sell.' };
    if (s.soldShift !== s.shift) { s.soldShift = s.shift; s.soldValue = 0; }
    const limit = Math.max(55, Math.min(100, Math.floor((run.quota || 330) * 0.12)));
    if (s.soldValue + p.sell > limit) return { ok: false, key: 'Broker budget spent. Return after another field shift.' };
    const rng = new RNG(hashString(`${run.runId}:${s.shift}:${s.serial}:${cmd.product}:${s.goods[cmd.product]}`));
    s.goods[cmd.product]--; s.soldValue += p.sell;
    if (p.illegal && rng.chance(Math.min(0.35, 0.08 + s.heat * 0.04))) {
      s.heat = Math.min(6, s.heat + 1);
      return { ok: true, key: 'Customs seized the contraband batch. No payout.', seized: true };
    }
    run.credits += p.sell;
    if (p.illegal) s.heat = Math.min(6, s.heat + 1);
    return { ok: true, key: 'Batch sold. Side income does not count toward the content quota.' };
  }
  if (cmd?.op === 'robot') {
    if (s.robot || s.report || run.credits < ROBOT.cost) return { ok: false, key: 'Scout is busy, report is unclaimed, or credits are short.' };
    run.credits -= ROBOT.cost;
    s.robot = { due: s.shift + ROBOT.shifts, target: String(cmd.target || run.moon), seed: hashString(`${run.runId}:${++s.serial}`) };
    return { ok: true, key: 'Scout dispatched. Return after two field shifts for salvage and a route report.' };
  }
  if (cmd?.op === 'collect') {
    if (!s.report) return { ok: false, key: 'No scout report yet.' };
    const report = s.report; s.report = null; run.credits += report.salvage;
    return { ok: true, key: 'Scout salvage collected. The surveyed route has a forecast.', report };
  }
  return { ok: false, key: 'Unknown workshop order.' };
}
export function completeIndustryShift(run, moonId, day) {
  const s = industryOf(run), key = `${run.runId}:${day}:${moonId}`;
  if (s.lastShift === key) return false;
  s.lastShift = key; s.shift++; s.heat = Math.max(0, s.heat - 0.5);
  const pending = [];
  for (const job of s.jobs) {
    if (!job.physical && job.due <= s.shift && PRODUCTS[job.product]) s.goods[job.product] = (s.goods[job.product] || 0) + 1;
    else pending.push(job);
  }
  s.jobs = pending;
  if (s.robot && s.robot.due <= s.shift) {
    const rng = new RNG(s.robot.seed);
    s.report = { target: s.robot.target, salvage: rng.int(ROBOT.minReturn, ROBOT.maxReturn), weather: run.forecast?.[s.robot.target] || 'clear', shift: s.shift };
    s.robot = null;
  }
  return true;
}
