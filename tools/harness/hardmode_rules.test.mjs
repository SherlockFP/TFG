// Node tests for the difficulty table + the small hooks other modules read (wave 5 hardmode). node tools/harness/hardmode_rules.test.mjs
globalThis.window = globalThis;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const D = await import('../../src/game/difficulty.js');
const P = await import('../../src/game/progression.js');
const F = await import('../../src/game/enhance.js');
const S = await import('../../src/game/survival_store.js');
const SH = await import('../../src/game/shop.js');
const { ITEMS } = await import('../../src/game/items.js');
await import('../../src/game/deployables.js');   // registers the dep_* kits

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const reset = () => { D.setMode(D.DEFAULT_MODE); D.setQuota(0); };

// ------------------------------------------------------------------ table shape
ok(D.MODES.join() === 'casual,standard,hard' && D.DEFAULT_MODE === 'standard', 'three modes, Standard is the default');
ok(D.norm('nonsense') === 'standard' && D.norm('hard') === 'hard' && D.norm(undefined) === 'standard', 'norm() falls back to Standard');
for (const m of D.MODES) {
  const T = D.TABLE[m];
  ok(Object.isFrozen(T) && T.carry && T.sim, m + ': table is frozen and complete');
  for (const k of Object.keys(D.TABLE.casual)) ok(k in T, `${m} has key ${k}`);
}

// ------------------------------------------------------------------ casual == the old numbers
const OLD_SCRAP = (q) => 1 + P.BALANCE.valuePerQuota * Math.max(0, q | 0);
const OLD_WEIGHT = (w) => Math.max(0.6, Math.min(1, 1 - Math.max(0, w - 10) / 260));
D.setMode('casual');
for (let q = 0; q < 15; q++) {
  ok(near(P.scrapValueMul(q), OLD_SCRAP(q)), `casual scrapValueMul(${q}) unchanged`);
  for (const w of [0, 10, 25, 60, 120, 400]) ok(near(D.weightMul(w, q), OLD_WEIGHT(w)), `casual weightMul(${w}, ${q}) unchanged`);
  ok(D.quotaGrowthMul(5, q) === 1 && D.lockWarnSec(q) === 0 && D.strandRule(q) === null && D.creatureTricks(q) === null, `casual q${q}: no growth bonus / lock warning / strand / tricks`);
  ok(D.spoilDays(q) === 0 && D.fireCooks(q) && !D.stoveSingle(q) && D.crateMax(q) === 6 && D.ammoMul(q) === 1 && D.drawMul(q) === 1, `casual q${q}: food, stove, crates, turrets as before`);
  ok(D.priceMul(9, q) === 1 && D.forgeFailFrom(q) === 6 && D.forgeDriveCraft(q) && D.forgeDriveMul(q) === 1, `casual q${q}: prices flat, forge as before (fail from +6, drive craftable)`);
}

// ------------------------------------------------------------------ early game (quota 0-2) is comfortable in EVERY mode
for (const m of D.MODES) {
  for (let q = 0; q < D.FROM_QUOTA; q++) {
    ok(D.eff(q, m) === D.TABLE.casual && !D.isLate(q, m), `${m} q${q}: casual rules in force`);
    ok(near(P.scrapValueMul(q) * 0 + (D.setMode(m), P.scrapValueMul(q)), OLD_SCRAP(q)), `${m} q${q}: loot value curve untouched`);
    ok(near(D.weightMul(80, q, m), OLD_WEIGHT(80)), `${m} q${q}: carry penalty untouched`);
    ok(D.quotaGrowthMul(1, q, m) === 1 && D.lockWarnSec(q, m) === 0 && !D.strandRule(q, m) && !D.creatureTricks(q, m) && D.spoilDays(q, m) === 0 && D.priceMul(20, q, m) === 1, `${m} q${q}: no growth bonus, lock warning, strand, tricks, spoiling, price rise`);
  }
}
reset();

// ------------------------------------------------------------------ rule 1: loot value x0.8 after quota 3 + heavier carry penalty
D.setMode('standard');
ok(near(P.scrapValueMul(3) / OLD_SCRAP(3), 0.8) && near(P.scrapValueMul(12) / OLD_SCRAP(12), 0.8), 'standard: loot value x0.8 from quota 3');
D.setMode('hard');
ok(near(P.scrapValueMul(3) / OLD_SCRAP(3), 0.7), 'hard: loot value x0.7');
for (const w of [20, 40, 70, 120]) {
  const c = D.weightMul(w, 5, 'casual'), s = D.weightMul(w, 5, 'standard'), h = D.weightMul(w, 5, 'hard');
  ok(c > s && s > h, `carry penalty grows casual > standard > hard at weight ${w}: ${c.toFixed(3)} ${s.toFixed(3)} ${h.toFixed(3)}`);
}
ok(D.weightMul(9999, 5, 'standard') === 0.55 && D.weightMul(9999, 5, 'hard') === 0.5 && D.weightMul(5, 5, 'hard') === 1, 'floors (0.55 / 0.5) and a free light load');
reset();

// ------------------------------------------------------------------ rule 2: quota growth scaled by crew performance (up to x1.15)
ok(D.quotaGrowthMul(0, 5, 'standard') === 1 && D.quotaGrowthMul(-1, 5, 'standard') === 1, 'no surplus -> growth x1');
ok(near(D.quotaGrowthMul(0.3, 5, 'standard'), 1.075) && near(D.quotaGrowthMul(0.6, 5, 'standard'), 1.15) && near(D.quotaGrowthMul(9, 5, 'standard'), 1.15), 'standard: x1 .. x1.15, full at +60% surplus, capped');
ok(D.quotaGrowthMul(9, 5, 'hard') === 1.3 && D.quotaGrowthMul(9, 2, 'standard') === 1 && D.quotaGrowthMul(NaN, 5, 'standard') === 1, 'hard caps at x1.3; nothing before quota 3; NaN safe');
{
  // the real hook: host.js hostEvaluateQuota multiplies (nextQuota - prev) by this
  const prev = 1000, base = P.nextQuota(prev, 5, () => 0.5) - prev;
  const grown = Math.round(prev + base * D.quotaGrowthMul(0.6, 5, 'standard'));
  ok(grown > prev + base && grown <= Math.round(prev + base * 1.15), 'new quota is larger for an overshooting crew: ' + (prev + base) + ' -> ' + grown);
}

// ------------------------------------------------------------------ rule 3: ship door lock warning + late crew stay outside
ok(D.lockWarnSec(3, 'standard') === 90 && D.lockWarnSec(3, 'hard') === 120, 'lock warning: 90 s (Standard), 120 s (Hard)');
{
  const r = D.strandRule(4, 'standard');
  ok(r && r.hpFrac === 0.5 && r.keepsScrap === false, 'standard: stranded crew return at 50% HP without their scrap');
  ok(D.strandRule(4, 'hard').hpFrac === 0.3 && D.strandRule(4, 'casual') === null, 'hard 30% HP; casual = old kill rule');
}

// ------------------------------------------------------------------ rule 5: creatures close doors / cut lights after quota 3
{
  const t = D.creatureTricks(3, 'standard');
  ok(t && t.doorEveryS === 50 && t.lightEveryS === 130 && t.lightSec === 12, 'standard tricks');
  const h = D.creatureTricks(3, 'hard');
  ok(h.doorEveryS < t.doorEveryS && h.lightEveryS < t.lightEveryS && h.lightSec > t.lightSec, 'hard tricks are more frequent / longer');
}

// ------------------------------------------------------------------ rule 6: food spoils after 3 days, single stove, crate limits
ok(D.spoilDays(3, 'standard') === 3 && D.spoilDays(3, 'hard') === 3 && near(D.spoilHealMul(3, 'standard'), 0.4), 'dishes spoil after 3 days, heal x0.4');
ok(D.stoveSingle(3, 'standard') && D.fireCooks(3, 'standard') && !D.fireCooks(3, 'hard'), 'stove single; hard campfires do not cook');
{
  D.setMode('standard'); D.setQuota(3);
  const ex = (n) => Array.from({ length: n }, (_, i) => ({ k: 'crate', x: i * 5, z: 0 }));
  ok(S.placeReject('crate', 0, 40, ex(4)) === null && S.placeReject('crate', 0, 40, ex(5)) !== null, 'standard: at most 5 crates per place (was 6)');
  D.setMode('hard');
  ok(S.placeReject('crate', 0, 40, ex(3)) === null && S.placeReject('crate', 0, 40, ex(4)) !== null, 'hard: at most 4 crates');
  D.setMode('casual');
  ok(S.placeReject('crate', 0, 40, ex(5)) === null && S.placeReject('crate', 0, 40, ex(6)) !== null, 'casual: 6 crates as before');
  D.setMode('hard'); D.setQuota(1);
  ok(S.placeReject('crate', 0, 40, ex(5)) === null, 'hard but quota 1: still 6 crates');
  ok(S.CRATE_TIERS[1].cols * S.CRATE_TIERS[1].rows === 18 && S.capacity({ t: 3 }) === 50, 'crate grids (capacity) are unchanged');
  reset();
}

// ------------------------------------------------------------------ rule 7: trap / turret price rises with daily use, turrets burn more ammo
ok(D.priceMul(0, 3, 'standard') === 1 && near(D.priceMul(3, 3, 'standard'), 1.3) && D.priceMul(99, 3, 'standard') === 1.8 && D.priceMul(99, 3, 'hard') === 2.5, 'price multiplier: +10% per kit bought today, capped x1.8 (hard +18%, x2.5)');
ok(D.trapUnitPrice(180, 0, 1, 3, 'standard') === 180 && D.trapUnitPrice(180, 2, 1, 3, 'standard') === 216, 'unit price after 2 kits today');
ok(D.trapUnitPrice(100, 0, 3, 3, 'standard') === Math.round((100 + 110 + 120) / 3), 'buying 3 at once averages the rising steps (no bulk loophole)');
ok(D.isTrapItem(ITEMS.dep_turret1) && D.isTrapItem(ITEMS.dep_mine) && D.isTrapItem(ITEMS.dep_spikes) && !D.isTrapItem(ITEMS.dep_flood) && !D.isTrapItem(ITEMS.flashlight), 'trap kit classification');
ok(D.ammoMul(3, 'standard') === 1.5 && D.ammoMul(3, 'hard') === 2 && D.drawMul(3, 'hard') === 1.5, 'turret ammo / power draw multipliers');
{
  // through the real shop: stockFor prices a turret kit higher after purchases today, only from quota 3
  const run = { seed: 5, day: 4, quotaIndex: 3, credits: 9999, shop: { d: 4, sold: {} } };
  D.setMode('standard'); D.setQuota(3);
  const price = (r) => SH.stockFor(r).find((e) => e.id === 'dep_turret1')?.price;
  const p0 = price(run);
  ok(p0 > 0, 'turret kit is in the store: ' + p0);
  const run2 = { ...run, shop: { d: 4, sold: { dep_turret1: 2, dep_mine: 1 } } };
  ok(price(run2) === Math.round(p0 * 1.3), `3 trap kits bought today -> x1.3 (${p0} -> ${price(run2)})`);
  ok(price({ ...run2, day: 5 }) === p0, 'a new day resets the price');
  D.setQuota(2);
  ok(price({ ...run2, quotaIndex: 2 }) === p0, 'quota 2: no rise');
  D.setMode('casual'); D.setQuota(3);
  ok(price(run2) === p0, 'casual: flat price');
  reset();
}

// ------------------------------------------------------------------ rule 8: forge failure drops one level (never breaks), protection prevents it
{
  D.setMode('standard'); D.setQuota(3);
  let r = F.resolveEnhance(5, 0.99);
  ok(!r.ok && r.dropped && r.to === 4, 'standard q3: failing the attempt at +6 drops one level');
  r = F.resolveEnhance(4, 0.99);
  ok(!r.ok && !r.dropped && r.to === 4, 'failing +5 keeps the level');
  r = F.resolveEnhance(5, 0.99, { backup: true });
  ok(!r.ok && !r.dropped && r.backupUsed && r.to === 5, 'Backup Drive (protection) prevents the drop');
  r = F.resolveEnhance(8, 0.99);
  ok(r.to === 7 && r.dropped, 'a failure never goes below cur-1 and never breaks the item');
  ok(F.backupCost().n === 6, 'standard: drive costs 2x shards (6)');
  D.setMode('hard');
  r = F.resolveEnhance(4, 0.99);
  ok(!r.ok && r.dropped && r.to === 3, 'hard: the drop starts at +5');
  ok(!D.forgeDriveCraft(), 'hard: drives cannot be crafted (rare drops only)');
  D.setMode('casual');
  ok(F.backupCost().n === F.BACKUP_COST.n && F.enhanceInfo(5).failDrops, 'casual: drive cost and +6 rule as before');
  D.setMode('hard'); D.setQuota(1);
  ok(F.enhanceInfo(4).failDrops === false && F.backupCost().n === 3, 'hard at quota 1: old forge rules');
  reset();
}

// ------------------------------------------------------------------ sim model numbers sane
for (const m of D.MODES) {
  const s = D.TABLE[m].sim;
  ok(s.threatMul >= 1 && s.foodCapMul <= 1 && s.upkeep >= 0, m + ': sim knobs sane');
}
ok(D.TABLE.casual.sim.threatMul === 1 && D.TABLE.standard.sim.threatMul < D.TABLE.hard.sim.threatMul, 'sim threat: casual 1 < standard < hard');

console.log(fails ? `${fails} FAILED of ${checks}` : `all ${checks} hardmode rule checks passed`);
process.exit(fails ? 1 : 0);
