// node tools/harness/zones.test.mjs [moons=40]
// Wave 5 ZONES: seeded partition determinism, core reachability on real terrain, capture rules, income cap maths, auto-resolve odds, upkeep, offline catch-up, attack picking.
import { setInteriorProbe, generateSector } from '../../src/game/moongen.js';
import { MOONS, MOON_ORDER } from '../../src/game/moons.js';
import { RNG, hashString } from '../../src/core/rng.js';
import { INTERIOR_THEMES } from '../../src/world/facility.js';
import { Terrain, planMoon } from '../../src/world/terrain.js';
import * as V from '../../src/game/voyage_core.js';
import * as Z from '../../src/game/zones_core.js';

setInteriorProbe((id) => INTERIOR_THEMES.includes(id));
const N = Number(process.argv[2]) || 40;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } };
const say = (m) => console.log('ok  ', m);

// moons under test: charted handcrafted + generated sector moons + voyage moons
const moons = MOON_ORDER.map((id) => MOONS[id]).filter((m) => Z.zonesEligible(m));
for (let q = 0; q < 4; q++) for (const m of generateSector('zt', q).moons) moons.push(MOONS[m.id] || m);
const R0 = new RNG(77);
for (let i = 0; moons.length < N && i < N * 3; i++) { const m = V.generateVoyageMoon(V.rollVoyageId(R0, R0.int(1, 5), { pNone: 0.4 })); if (m) moons.push(m); }
ok(moons.length >= 20, 'have moons to test: ' + moons.length);

// ------------------------------------------------------------------ partition: determinism, 3..6 zones, first zone is a safe field, ids unique
for (const m of moons) {
  const a = Z.zoneSpec(m, 'RUNA'), b = Z.zoneSpec(m, 'RUNA');
  ok(JSON.stringify(a) === JSON.stringify(b), `spec deterministic ${m.id}`);
  ok(a.n >= 3 && a.n <= 6 && a.zones.length === a.n, `zone count 3..6 ${m.id}: ${a.n}`);
  ok(new Set(a.zones.map((z) => z.id)).size === a.n, `unique ids ${m.id}`);
  ok(a.zones[0].kind === 'field' && a.zones[0].minQ === 0, `zone A is an open, unlocked field ${m.id}`);
  ok(a.zones.every((z) => z.threat >= 1 && z.threat <= 10), `threat range ${m.id}`);
}
{
  let differ = 0;
  for (const m of moons) if (JSON.stringify(Z.zoneSpec(m, 'RUNA')) !== JSON.stringify(Z.zoneSpec(m, 'RUNB'))) differ++;
  ok(differ > moons.length * 0.5, 'different runs partition differently: ' + differ + '/' + moons.length);
  const counts = new Set(moons.map((m) => Z.zoneSpec(m, 'K').n));
  ok(counts.size >= 2, 'zone counts vary: ' + [...counts]);
  say(`partition: ${moons.length} moons, counts ${[...counts].sort()}`);
}
ok(!Z.zonesEligible(MOONS.hq) && !Z.zonesEligible({ id: 'x', biome: 'hills', instance: true }), 'company / instance moons have no zones');

// ------------------------------------------------------------------ cores: valid + reachable on real terrain (seeded landings), placement deterministic
{
  let placedN = 0, nulls = 0, terrains = 0;
  for (const m of moons.slice(0, 30)) {
    terrains++;
    const seed = (hashString('zt' + m.id) >>> 0) % 1e9;
    const plan = planMoon(seed, m), ter = new Terrain(seed, m, plan);
    const fl = ter.flood ?? null, reach = Z.terrainReach(ter, ter.step * 1.0, (h) => fl != null && h < fl + 0.3);
    const probe = Z.coreProbe(ter);   // exactly what the game module uses
    const spec = Z.zoneSpec(m, 'RUNA');
    const c1 = Z.placeCores(spec, plan, probe, ter.playHalf, 'RUNA'), c2 = Z.placeCores(spec, plan, probe, ter.playHalf, 'RUNA');
    ok(JSON.stringify(c1) === JSON.stringify(c2), `cores deterministic ${m.id}`);
    for (const c of c1) {
      placedN++;
      if (c.x === null) { nulls++; ok(false, `${m.id} zone ${c.id}: no spot`); continue; }
      ok(reach(c.x, c.z), `${m.id} (${m.biome}) zone ${c.id} core reachable from the ship on foot`);
      ok(Math.hypot(c.x, c.z) >= Z.ZN.shipMin - 0.01, `${m.id} ${c.id} away from ship`);
      ok(!plan.ponds.some((p) => Math.hypot(c.x - p.x, c.z - p.z) < p.r), `${m.id} ${c.id} not in a pond`);
    }
    for (let i = 0; i < c1.length; i++) for (let j = i + 1; j < c1.length; j++) if (c1[i].x !== null && c1[j].x !== null) ok(Math.hypot(c1[i].x - c1[j].x, c1[i].z - c1[j].z) >= Z.ZN.coreGap - 0.01, `${m.id} cores apart`);
  }
  say(`cores: ${placedN} placed on ${terrains} terrains, ${nulls} without a spot, all reachable + deterministic`);
}

// ------------------------------------------------------------------ capture rules
{
  const base = { phase: 'moon', moonId: 'hamsi', currentMoon: 'hamsi', dist: 2, quotaIndex: 0, minQ: 0, credits: 100, cost: 55, owned: 0, st: null, clearT: Z.ZN.clearSec, hostileNear: false, dead: false };
  ok(Z.canCapture(base).ok, 'first zone capturable from quota 1');
  ok(!Z.canCapture({ ...base, phase: 'orbit' }).ok, 'not in orbit');
  ok(!Z.canCapture({ ...base, currentMoon: 'lufer' }).ok, 'wrong moon');
  ok(!Z.canCapture({ ...base, hostileNear: true }).ok, 'hostile near blocks');
  ok(!Z.canCapture({ ...base, clearT: Z.ZN.clearSec - 1 }).ok, 'clear timer must be full');
  ok(!Z.canCapture({ ...base, credits: 10 }).ok, 'needs credits');
  ok(!Z.canCapture({ ...base, dist: 12 }).ok, 'must stand next to the core');
  ok(!Z.canCapture({ ...base, st: { s: 'own' } }).ok, 'already own');
  ok(Z.canCapture({ ...base, st: { s: 'inf' } }).ok, 'infected zone can be recaptured');
  ok(!Z.canCapture({ ...base, minQ: 1 }).ok && Z.canCapture({ ...base, minQ: 1, quotaIndex: 1 }).ok, 'later zones unlock by quota');
  ok(!Z.canCapture({ ...base, owned: Z.maxOwned(0) }).ok, 'zone cap');
  ok(Z.maxOwned(0) === 3 && Z.maxOwned(3) === 9 && Z.maxOwned(40) === 12, 'maxOwned curve');
  let t = 0; for (let i = 0; i < 100; i++) t = Z.stepClear(t, 0.5, false);
  ok(t >= Z.ZN.clearSec, 'clear timer fills'); ok(Z.stepClear(t, 0.1, true) === 0, 'hostile resets the timer');
  const spec = Z.zoneSpec(MOONS.hamsi, 'RUNA'), c0 = Z.captureCost(MOONS.hamsi, spec.zones[0], 0);
  ok(c0 <= 60, 'first beacon <= starting credits: ' + c0);
  ok(Z.captureCost(MOONS.hamsi, spec.zones[0], 3) > c0, 'beacons get pricier');
  ok(Z.captureCost(MOONS.hamsi, spec.zones[0], 2, true) < Z.captureCost(MOONS.hamsi, spec.zones[0], 2), 'recapture is cheaper');
  const own = { s: 'own', d: {}, up: 0 };
  const b = { def: 'turret1', st: own, dist: 5, quotaIndex: 0, credits: 500 };
  ok(Z.canBuild(b).ok && !Z.canBuild({ ...b, dist: 40 }).ok && !Z.canBuild({ ...b, credits: 10 }).ok && !Z.canBuild({ ...b, st: null }).ok && !Z.canBuild({ ...b, def: 'turret3' }).ok, 'build rules');
  ok(!Z.canBuild({ ...b, st: { s: 'own', d: { barr_wood: 6 }, up: 0 } }).ok && Z.canBuild({ ...b, st: { s: 'own', d: { barr_wood: 6 }, up: 1 } }).ok, 'slots + upgrade');
  say('capture + build rules');
}

// ------------------------------------------------------------------ income cap maths
{
  const spec = Z.zoneSpec(MOONS.hamsi, 'RUNA'), z0 = spec.zones[0];
  const one = Z.zoneIncome(MOONS.hamsi, z0, { up: 0 });
  ok(one.credits > 0 && one.mat >= 1, 'zone pays credits + material: ' + JSON.stringify(one));
  ok(Z.zoneIncome(MOONS.hamsi, z0, { up: 2 }).credits > one.credits, 'upgrades raise income');
  ok(Z.zoneIncome(MOONS.cipura, z0, { up: 0 }).credits > one.credits, 'tier raises income');
  const rows = Array.from({ length: 12 }, () => ({ credits: 60, mat: 2, matId: 'comp_wood' }));
  const c = Z.capIncome(rows, 130);
  ok(c.capped && c.credits <= Z.dailyCap(130) && c.gross === 720, 'daily cap binds: ' + JSON.stringify({ ...c, mats: undefined }));
  ok(Z.dailyCap(130) === 33 && Z.dailyCap(10) === 20, 'cap = 25 % of quota, min 20');
  ok(Object.values(c.mats).reduce((a, x) => a + x, 0) <= Z.ZN.matCapPerDay, 'material cap');
  ok(!Z.capIncome([one], 400).capped, 'small income is not capped');
  for (const q of [130, 400, 1200, 4000]) ok(Z.capIncome(rows, q).credits <= q * 0.25 + 1, `cap <= 25 % of quota ${q}`);
  ok(Z.offlineDays(100) === 0 && Z.offlineDays(3600) === 2 && Z.offlineDays(1e9) === 3, 'offline days: min 15 min, max 3');
  const off = Z.offlineIncome(3, rows, 130);
  ok(off === Math.floor(33 * 3 * 0.5), 'offline = cap x days x 0.5: ' + off);
  ok(Z.offlineIncome(0, rows, 130) === 0, 'no offline days no income');
  say('income cap maths');
}

// ------------------------------------------------------------------ upkeep
{
  const a = { d: { turret1: 2, barr_wood: 1 } }, b = { d: { tesla: 1 } }, c = { d: {} };
  ok(Z.upkeepOf(a) === 14 && Z.upkeepOf(b) === 10 && Z.upkeepOf(c) === 0, 'upkeep sums');
  const r = Z.payUpkeep(20, [{ key: 'a', st: a }, { key: 'b', st: b }, { key: 'c', st: c }]);
  ok(r.paid === 14 && r.dry.length === 1 && r.dry[0] === 'b' && r.left === 6, 'upkeep pays in order, the rest goes dry: ' + JSON.stringify(r));
  ok(Z.payUpkeep(1000, [{ key: 'a', st: a }]).dry.length === 0, 'rich crew pays everything');
  ok(Z.defencePower(a, true) < Z.defencePower(a, false), 'dry defences are weaker');
  ok(Z.defencePower({ d: {}, up: 0 }) === Z.BASE_DEF, 'empty zone = base defence');
  say('upkeep');
}

// ------------------------------------------------------------------ auto-resolve odds
{
  const th = 2, qi = 2;
  const none = Z.defencePower({ d: {} }), three = Z.defencePower({ d: { turret1: 3 } }), heavy = Z.defencePower({ d: { turret2: 3, tesla: 1, barr_metal: 2 }, up: 1 });
  ok(Z.winChance(none, th, qi, 2) < 0.05, 'undefended zone loses: ' + Z.winChance(none, th, qi, 2).toFixed(2));
  ok(Z.winChance(three, th, qi, 2) > 0.8, '3 turrets hold a threat-2 wave: ' + Z.winChance(three, th, qi, 2).toFixed(2));
  ok(Z.winChance(heavy, 5, 8, 2) > Z.winChance(three, 5, 8, 2), 'more defence, better odds');
  ok(Z.winChance(three, 2, 2, 4) < Z.winChance(three, 2, 2, 1), 'bigger crews make waves harder (co-op live is the reward)');
  const rng = new RNG(5); let w = 0; const T = 4000;
  for (let i = 0; i < T; i++) if (Z.resolveAuto(three, th, qi, 2, rng.next()).win) w++;
  ok(Math.abs(w / T - Z.winChance(three, th, qi, 2)) < 0.03, `monte carlo ${(w / T).toFixed(3)} ~ ${Z.winChance(three, th, qi, 2).toFixed(3)}`);
  ok(Z.resolveAuto(three, th, qi, 2, 0.1).credits > 0 && Z.resolveAuto(none, th, qi, 2, 0.5).credits === 0, 'win pays a bonus, loss pays nothing');
  ok(Z.winChance(Z.defencePower({ d: { turret1: 1 } }), 1, 1, 1) > 0.5, 'solo, one turret, early zone: generous');
  const zn = Z.ensureState(null, 'r');
  Z.setZ(zn, 'hamsi', 'A', { s: 'own', d: {}, up: 0 }); Z.setZ(zn, 'lufer', 'B', { s: 'inf', d: {}, up: 0 }); Z.setZ(zn, 'gone', 'A', { s: 'own', d: {}, up: 0 });
  ok(Z.pickAttacks(zn, 0, new RNG(1)).length === 0, 'no attacks in quota 1');
  const p = Z.pickAttacks(zn, 1, new RNG(1), (m) => m !== 'gone');
  ok(p.length === 1 && p[0].m === 'hamsi', 'picks only owned + active zones');
  for (let i = 0; i < 50; i++) ok(Z.pickAttacks(zn, 3, new RNG(i), (m) => m !== 'gone').length <= 2, 'at most two');
  const lw = Z.liveWaves(2, 2, 2);
  ok(lw.W === 2 && lw.waves[0].total > 0 && lw.waves[1].total >= lw.waves[0].total, 'live waves reuse siege planWave: ' + lw.waves.map((x) => x.total));
  say('auto-resolve odds + attack picks + live waves');
}

// ------------------------------------------------------------------ state helpers
{
  const zn = Z.ensureState(null, 'RUNA');
  ok(zn.col >= 1 && zn.col <= 6 && Z.crewColor(zn).startsWith('#'), 'crew colour');
  Z.setZ(zn, 'hamsi', 'A', { s: 'own', d: {}, up: 0 });
  ok(Z.getZ(zn, 'hamsi', 'A').s === 'own' && Z.listZones(zn).length === 1, 'set/get/list');
  Z.setZ(zn, 'hamsi', 'A', null);
  ok(!zn.m.hamsi && Z.listZones(zn).length === 0, 'remove prunes empty moons');
  ok(JSON.stringify(JSON.parse(JSON.stringify(zn))) === JSON.stringify(zn), 'state is JSON-safe');
  say('state helpers');
}

console.log(`\n${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
