// Node test for the pure parts of the ANOMALY system (no browser): die face reading, d20 bands, outcome tables, stage thresholds,
// zone falloff, hot-zone / shrine planning, power-up odds and the time-to-stage numbers quoted in docs/wave2/anomaly.md.
//   node tools/harness/anomaly_core.test.mjs
import * as THREE from 'three';
import { dieFaceUp, DIE_FACES } from '../../src/models/anomaly.js';
import { MUTATIONS, GOOD_MUT, BAD_MUT, rollMutation } from '../../src/game/mutations.js';
import { POWERUPS, PICKUP_IDS, rollPowerup, pickupCount } from '../../src/game/powerups.js';
import { finalRoll, bandOf, rollOutcome, planShrine, creditCost, DIE_EFFECTS, scrapBonus, SHRINE_NUM } from '../../src/game/dice.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) <= e;
let s = 12345; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };

// ---- die face from rotation: every face turned up reads back as itself, also with a random yaw spin
for (const f of DIE_FACES) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...f.n), new THREE.Vector3(0, 1, 0));
  q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28));
  const r = dieFaceUp(q);
  ok(r.v === f.v && r.up > 0.999, `die face ${f.v} read as ${r.v} (up ${r.up.toFixed(3)})`);
}
const cocked = dieFaceUp(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 1).normalize(), Math.PI / 4));
ok(cocked.up < 0.9, 'a die leaning at 45 degrees is cocked');
for (const [a, b] of [[1, 6], [2, 5], [3, 4]]) ok(DIE_FACES.find((f) => f.v === a).n.map((x, i) => x + DIE_FACES.find((f) => f.v === b).n[i]).every((x) => x === 0), `faces ${a}/${b} are opposite`);
ok(Object.keys(DIE_EFFECTS).length === 6 && [1, 2, 3, 4, 5, 6].every((k) => DIE_EFFECTS[k]), 'six die effects');
ok([1, 2, 6].every((k) => !DIE_EFFECTS[k].good) && [3, 4, 5].every((k) => DIE_EFFECTS[k].good), 'die: 3 good / 3 bad faces');

// ---- d20 bands and offering bonuses
ok(finalRoll(1, 4) === 1 && finalRoll(20, 0) === 20 && finalRoll(2, 0) === 2 && finalRoll(19, 4) === 19 && finalRoll(10, 3) === 13, 'finalRoll keeps natural 1 / 20');
ok(bandOf(1) === 'curse' && bandOf(2) === 'debuff' && bandOf(7) === 'debuff' && bandOf(8) === 'buff' && bandOf(14) === 'buff' && bandOf(15) === 'big' && bandOf(19) === 'big' && bandOf(20) === 'mythic', 'band edges');
const dist = (bonus) => {
  const c = { curse: 0, debuff: 0, buff: 0, big: 0, mythic: 0 };
  for (let nat = 1; nat <= 20; nat++) c[bandOf(finalRoll(nat, bonus))] += 5;
  return c;
};
console.log('d20 band odds % by offering bonus  (0 credits / 2 blood / 3 static / 3 scrap):');
for (const b of [0, 2, 3]) console.log(' bonus', b, JSON.stringify(dist(b)));
ok(dist(0).curse === 5 && dist(0).mythic === 5 && dist(0).debuff === 30 && dist(0).buff === 35 && dist(0).big === 25, 'credits odds 5/30/35/25/5');
ok(dist(3).curse === 5 && dist(3).mythic === 5, 'a bonus never touches the natural 1 / 20 odds');
ok(scrapBonus(0) === 0 && scrapBonus(39) === 0 && scrapBonus(40) === 1 && scrapBonus(500) === 3, 'scrap bonus caps at +3');
ok(creditCost(0, 0) === 40 && creditCost(0, 2) === 80 && creditCost(20, 2) === 400, 'credit cost grows per roll and is capped');

// ---- outcome table content
const N = 30000;
const tally = { curse: 0, debuff: 0, buff: 0, big: 0, mythic: 0 }, extra = { mimic: 0, spawn: 0, allCrew: 0, twoMuts: 0, cloud: 0, badMut: 0, goodMut: 0, pu: 0 };
for (let i = 0; i < N; i++) {
  const res = finalRoll(1 + Math.floor(rnd() * 20), 0);
  const o = rollOutcome(res, rnd, 1);
  tally[o.band]++;
  if (o.mimic) extra.mimic++;
  if (o.spawn) extra.spawn++;
  if (o.all) extra.allCrew++;
  if (o.muts.length === 2) extra.twoMuts++;
  if (o.pus.some((p) => p[0] === 'p_cloud')) extra.cloud++;
  if (o.band === 'debuff') ok(o.muts.length === 1 && BAD_MUT.includes(o.muts[0][0]), 'debuff gives exactly one bad mutation');
  if (o.band === 'buff') ok(o.muts.length + o.pus.length === 1 && o.muts.every((m) => GOOD_MUT.includes(m[0])), 'buff gives one good mutation or one power-up');
  if (o.band === 'big' && o.muts.length === 2) ok(o.muts[0][0] !== o.muts[1][0], 'jackpot mutations differ');
  for (const [id, dur] of o.muts) ok(MUTATIONS[id] && dur >= 20 && dur <= 180, 'mutation duration 20..180 s');
  for (const [id, dur] of o.pus) ok(POWERUPS[id] && dur <= 180, 'power-up duration <= 180 s');
  if (o.band === 'mythic') ok(o.spawn?.tier === 'mythic' && o.all && o.heal === 100, 'mythic drops a mythic item and helps the whole crew');
}
console.log('outcome tally (credits, N=30000):', JSON.stringify(tally), JSON.stringify(extra));
ok(near(tally.curse / N, 0.05, 0.01) && near(tally.mythic / N, 0.05, 0.01) && near(tally.debuff / N, 0.30, 0.02), 'sampled band odds match');
ok(extra.mimic === tally.curse, 'every curse spawns a Deepfake');

// ---- mutations / power-ups
ok(GOOD_MUT.length === 5 && BAD_MUT.length === 5, '5 good + 5 bad mutations');
for (const k of Object.keys(MUTATIONS)) { const m = MUTATIONS[k]; ok(m.desc && m.glyph && m.color && m.name && m.dur[0] >= 20 && m.dur[1] <= 180, `mutation ${k} has data and a short duration`); }
ok(Object.keys(POWERUPS).filter((k) => POWERUPS[k].w > 0).length === 6, '6 pickup power-ups');
const cnt = {}; for (let i = 0; i < 20000; i++) { const k = rollPowerup(rnd); cnt[k] = (cnt[k] || 0) + 1; }
console.log('power-up pickup odds:', JSON.stringify(Object.fromEntries(Object.entries(cnt).map(([k, v]) => [k, +(v / 200).toFixed(1)]))));
ok(cnt.p_cloud < cnt.p_xp, 'Cloud Save is rarer than Double XP');
let pc = 0; const pcd = [0, 0, 0]; for (let i = 0; i < 20000; i++) { const n = pickupCount(rnd); pc += n; pcd[n]++; }
console.log('pickups per landing: mean', (pc / 20000).toFixed(2), 'dist', pcd.map((v) => (v / 200).toFixed(0) + '%').join(' / '));
ok(pcd[0] > 0 && pcd[1] > 0 && pcd[2] > 0 && pc / 20000 < 1, 'pickups are rare: 0-2 per landing, mean < 1');
let good = 0; for (let i = 0; i < 4000; i++) if (MUTATIONS[rollMutation(rnd, 0.5)].good) good++;
ok(near(good / 4000, 0.5, 0.05), 'glitch dice are 50/50');

// ---- shrine planning (fake spots)
const spots = Array.from({ length: 40 }, (_, i) => ({ x: i, y: 0, z: i * 2, room: i % 5, type: 'room', dist: 3 + i % 12 }));
let hits = 0; for (let seed = 1; seed <= 3000; seed++) { const a = planShrine(spots, seed), b = planShrine(spots, seed); if (a) hits++; ok(JSON.stringify(a) === JSON.stringify(b), 'shrine plan is deterministic'); }
console.log('shrine on', (hits / 30).toFixed(1) + '% of landings');
ok(near(hits / 3000, SHRINE_NUM.chance, 0.03), 'shrine on ~35% of landings');
ok(!planShrine([{ x: 0, y: 0, z: 0, room: -1, type: 'corridor', dist: 20 }], 1), 'never in a corridor');

// ---- static numbers (imports facility / ship chains: node-tolerant only when the DOM-free path works)
let S = null;
try { S = await import('../../src/game/static.js'); } catch (e) { console.log('(static.js not importable in node:', String(e.message).slice(0, 90) + ')'); }
if (S) {
  const { stageOf, zoneRate, earlyMul, STATIC_NUM, planHotZones, STAGES } = S;
  ok(stageOf(0) === 0 && stageOf(24.9) === 0 && stageOf(25) === 1 && stageOf(50) === 2 && stageOf(75) === 3 && stageOf(100) === 4, 'stage thresholds 25 / 50 / 75 / 100');
  ok(stageOf(24, 1) === 1 && stageOf(22.5, 1) === 0 && stageOf(74, 3) === 3 && stageOf(72.9, 3) === 2, 'stage hysteresis of 2 points');
  ok(earlyMul(0) === 0.5 && earlyMul(1) === 0.7 && earlyMul(2) === 1, 'early game rates x0.5 / x0.7');
  const z = { x0: 0, x1: 10, z0: 0, z1: 10, y0: 0, base: 2 };
  ok(zoneRate(z, 5, 0, 5, 3) === 2 && zoneRate(z, 12, 0, 5, 3) > 0 && zoneRate(z, 12, 0, 5, 3) < 2 && zoneRate(z, 14, 0, 5, 3) === 0 && zoneRate(z, 5, 20, 5, 3) === 0, 'zone falloff (inside, edge, outside, other floor)');
  ok(STAGES.length === 5, 'five stages');
  console.log('time in a hot room to reach each stage (s) from 0 [core 2.2/s, generator 1.7/s, server 1.5/s] at quota 0 / 1 / 2+:');
  for (const [n, base] of [['core', 2.2], ['generator', 1.7], ['server', 1.5]]) {
    const row = [0, 1, 2].map((q) => [25, 50, 75, 100].map((th) => Math.round(th / (base * earlyMul(q)))).join('/'));
    console.log(' ', n.padEnd(9), row.join('   '));
  }
  console.log('Faraday (x0.32): core at quota 2+ reaches DELETED in', Math.round(100 / (2.2 * 0.32)), 's; ship decay', STATIC_NUM.decayShip, '/s ->', Math.round(100 / STATIC_NUM.decayShip), 's from 100');
  const L = { cell: 6, ox: -100, oz: -100, y: -300, rooms: [{ id: 0, type: 'entrance', x: 1, z: 1, w: 3, h: 3 }, { id: 1, type: 'core', x: 5, z: 5, w: 3, h: 3, height: 5.2 }, { id: 2, type: 'generator', x: 9, z: 1, w: 2, h: 2, height: 4 }, { id: 3, type: 'server', x: 2, z: 8, w: 3, h: 3, height: 4.4 }] };
  const z1 = planHotZones(L, 777, 0), z2 = planHotZones(L, 777, 3);
  ok(z1.length === 1 && z1[0].type === 'core' && z2.length === 2 && z2[0].type === 'core', 'quota 0-1: 1 hot room (the core), later 2');
  ok(JSON.stringify(planHotZones(L, 777, 3)) === JSON.stringify(z2), 'hot zones are deterministic');
}

console.log(fails ? `\n${fails} FAILED` : '\nPASS: anomaly core');
process.exit(fails ? 1 : 0);
