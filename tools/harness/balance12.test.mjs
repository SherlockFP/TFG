// balance12 (wave 12) data test:  node tools/harness/balance12.test.mjs
// Quota curve, threat-pool pacing for the wave 10 / 11 creatures, crisis roll + payouts, moon route costs, gear11 prices. Pure data, no browser.
import { register } from 'node:module';
register('data:text/javascript,export async function load(u,c,n){if(u.endsWith(".css"))return{format:"module",source:"export default {}",shortCircuit:true};return n(u,c);}');
import assert from 'node:assert/strict';

const P = await import('../../src/game/progression.js');
const TP = await import('../../src/game/threatpool.js');
const { MOONS } = await import('../../src/game/moons.js');
await import('../../src/game/moons10_core.js');
const C10 = await import('../../src/game/creatures10_core.js'), C11 = await import('../../src/game/creatures11_core.js'), S11 = await import('../../src/game/swarm11_core.js');
const E11 = await import('../../src/game/events11_core.js');
const G11 = await import('../../src/game/gear11_core.js');
const { KINDS } = await import('../../src/game/grenades_core.js');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok', name); };

ok('quota curve: q0 = the owner start (300-350), a real squeeze from q1, strictly rising, late curve near the old one', () => {
  const B = P.BALANCE;
  let prev = P.nextQuota(0, 0); const seq = [prev];
  assert.ok(prev >= 300 && prev <= 350, 'q0 300-350');
  for (let q = 1; q <= 12; q++) { const v = P.nextQuota(prev, q, () => 0.5); assert.ok(v > prev, `q${q} rises`); seq.push(v); prev = v; }
  assert.ok(seq[1] >= 700 && seq[2] >= 1000, 'q1 / q2 are the squeeze: ' + seq.slice(0, 3));
  assert.ok(seq[1] / seq[0] >= 2 && seq[3] - seq[2] < seq[2] - seq[1], 'the jump is at the start, the growth term takes over after the ramp');
  assert.ok(seq[6] >= 1450 && seq[6] <= 1900, 'q6 in the old neighbourhood (1445) plus the squeeze: ' + seq[6]);
  assert.ok(B.quotaRamp.length === 3 && B.quotaCurveDiv > 0);
});

ok('pool pacing: at most 1 wave 10/11 headliner per pool before quota 2, 2 before quota 4; every pool >= 3 residents; deterministic', () => {
  const moon = MOONS.levrek;
  let max = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 300; i++) for (let q = 0; q <= 5; q++) {
    const run = { runId: 'b12-' + i, quotaIndex: q }, pool = TP.poolFor(run, moon);
    const fresh = pool.ids.filter((id) => TP.NEW_IDS.has(id)).length;
    max[q] = Math.max(max[q], fresh);
    assert.equal(pool.ids.length, TP.poolSize(q), `pool size at q${q}`);
    assert.deepEqual(TP.poolFor({ ...run }, moon).ids, pool.ids, 'deterministic');
    assert.equal(new Set(pool.ids).size, pool.ids.length, 'no duplicates');
  }
  assert.ok(max[0] <= 1 && max[1] <= 1, 'q0-q1 cap: ' + max);
  assert.ok(max[2] <= 2 && max[3] <= 2, 'q2-q3 cap: ' + max);
  assert.ok(max[4] >= 3, 'late game combines them (q4 sees pools with 3+): ' + max);
  assert.equal(TP.poolSize(0), 3); assert.equal(TP.poolSize(4), 4);
});

ok('staggered gates: HEADLINE minQ = the creature spawn gate; harmless first (scraper 0, streamer / captcha 1), chase rules 2, Ratio / AutoMod / Shadowban 3, Recommender 4', () => {
  const want = { c10_buffering: 2, c10_doomscroller: 2, c10_ratio: 3, c11_captcha: 1, c11_shadowban: 3, c11_recommender: 4, sw_streamer: 1, sw_automod: 3 };
  const gate = { ...C10.TUNE.minQuota, ...C11.TUNE.minQuota, ...S11.TUNE.minQuota };
  for (const [id, q] of Object.entries(want)) { assert.equal(gate[id], q, id + ' gate'); assert.equal(TP.HEADLINE.find((h) => h.id === id)?.minQ, q, id + ' HEADLINE minQ'); }
  assert.equal(TP.HEADLINE.find((h) => h.id === 'sw_scraper').minQ | 0, 0);
  for (const id of TP.NEW_IDS) assert.ok(TP.HEADLINE.some((h) => h.id === id), id + ' is a headliner');
  // nothing with a bite is a q0 / q1 headliner
  for (const h of TP.HEADLINE) if (TP.NEW_IDS.has(h.id) && !['sw_scraper', 'sw_streamer', 'c11_captcha'].includes(h.id)) assert.ok(h.minQ >= 2, h.id + ' waits');
});

ok('crises: none in the first cycle, 16 % (from day 2) in the second, full rate from the third; payouts worth a real slice of a day', () => {
  const roll = (q, day) => { let hit = 0; for (let i = 0; i < 2000; i++) if (E11.rollCrisis({ runId: 'c' + i, day, moon: 'hamsi', quotaIndex: q, facility: true })) hit++; return hit / 2000; };
  assert.equal(roll(0, 1), 0); assert.equal(roll(0, 2), 0); assert.equal(roll(0, 3), 0);
  assert.equal(roll(1, 1), 0); const r1 = roll(1, 2); assert.ok(r1 > 0.1 && r1 < 0.22, 'q1 day 2 ~16 %: ' + r1);
  const r2 = roll(2, 1); assert.ok(r2 > 0.28 && r2 < 0.4, 'q2 ~34 %: ' + r2);
  assert.ok(E11.payout('lockdown', 2, 0).credits >= 150 && E11.payout('power', 2, 0).credits >= 230, 'payouts');
  assert.ok(E11.payout('power', 2, 1).credits > E11.payout('power', 2, 0).credits && E11.payout('flood').credits === 0, 'time bonus, flood pays in floating loot');
});

ok('route costs rise with tier and depth; 503 is the deeper route; Feed pays as much as its price says; 503 is not the jester farm', () => {
  const list = ['hamsi', 'lufer', 'palamut', 'levrek', 'cipura', 'orkinos'].map((id) => MOONS[id]);
  for (let i = 1; i < list.length; i++) assert.ok(list[i].cost >= list[i - 1].cost, list[i].id + ' >= ' + list[i - 1].id);
  const feed = MOONS.x8feed, t503 = MOONS.x503;
  assert.ok(feed.cost >= 400 && feed.cost < t503.cost && t503.cost < MOONS.orkinos.cost, 'feed < 503 < 404');
  assert.ok(feed.scrapMul < t503.scrapMul && t503.scrapMul <= MOONS.orkinos.scrapMul && feed.scrapMul >= MOONS.cipura.scrapMul * 0.95, 'payout order');
  assert.ok(t503.creatures.jester <= MOONS.orkinos.creatures.jester, '503 jester weight no higher than 404');
});

ok('gear11 prices are tiered by power (consumables < tools < the scan / traversal gadgets); grenade mirror in sync', () => {
  const I = G11.ITEMS11;
  assert.ok(I.glowspray.price < I.doorjammer.price && I.doorjammer.price < I.ziplinekit.price && I.ziplinekit.price < I.scoutdrone.price, 'ordered');
  assert.ok(I.scoutdrone.price >= 350 && I.ziplinekit.price >= 200, 'the reusable gadgets are worth saving for');
  assert.equal(KINDS.speaker.price, G11.SPEAKER.price, 'decoy speaker price mirrored');
  assert.ok(KINDS.speaker.price > KINDS.decoy.price, 'speaker costs more than the plain beacon');
});

console.log(`balance12.test: ${n} groups passed`);
