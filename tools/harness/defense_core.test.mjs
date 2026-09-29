// UNIFY wave 5: one defence core. node tools/harness/defense_core.test.mjs
//  1. every defence entity of every system resolves to ONE defense_core def (siege deployables, ship2 mounts, zones, homeworld towers / walls / traps, horror traps)
//  2. the power calculator reproduces the OLD zones numbers (per entity and for whole compositions) within tolerance
//  3. the shared targeting helper behaves like the loops it replaced (deployables turret / tesla, homeworld raid towers)
import assert from 'node:assert/strict';
import { RNG } from '../../src/core/rng.js';
import * as DC from '../../src/game/defense_core.js';
import { DEPS, DEP_TYPES } from '../../src/game/deployables.js';
import * as SH from '../../src/game/ship2_core.js';
import * as Z from '../../src/game/zones_core.js';
import * as H from '../../src/game/homeworld_core.js';
import * as H2 from '../../src/game/homeworld2_core.js';
import * as HR from '../../src/game/horror_core.js';
import * as RAID from '../../src/game/homeworld_raid_core.js';

let n = 0, fails = 0;
const ok = (name, fn) => { n++; try { fn(); } catch (e) { fails++; console.log('FAIL', name, '\n   ', String(e.message).split('\n')[0]); } };

// ------------------------------------------------------------------ 1. resolution
ok('every deployable kind resolves to a core def', () => {
  assert.equal(DEP_TYPES.length, DC.DEFENSE_IDS.length, 'same kinds');
  for (const id of DEP_TYPES) { const d = DC.getDef(id); assert.ok(d && d.sys === 'siege', id); assert.equal(DEPS[id].name, d.name, id + ' name'); assert.equal(DEPS[id].kind, d.kind, id + ' kind'); }
});
ok('DEPS combat + footprint stats are the core ones (no drift)', () => {
  for (const id of DEP_TYPES) for (const [k, v] of Object.entries(DC.DEFENSE[id].s)) assert.deepEqual(DEPS[id][k], v, `${id}.${k}`);
});
ok('deployables keep their shop / ammo knobs (not moved)', () => {
  assert.equal(DEPS.turret1.price, 180); assert.equal(DEPS.turret1.ammo, true); assert.equal(DEPS.turret1.cap, 120); assert.deepEqual(DEPS.turret2.supply, ['comp_battery', 40]);
  for (const id of DEP_TYPES) for (const k of ['price', 'weight', 'blurb', 'supply', 'cap', 'ammo']) assert.ok(!(k in DC.DEFENSE[id].s), `${id}.${k} must stay in deployables.js`);
});
ok('ship2 mounts come from the core', () => {
  assert.deepEqual(SH.MOUNT_TYPES, ['turret1', 'turret2', 'turret3', 'tesla', 'flood', 'drone', 'sensor']);
  for (const id of SH.MOUNT_TYPES) assert.ok(DC.getDef(id)?.mount, id);
  const on = SH.poweredMounts({ M1: { ty: 'turret1' }, M2: { ty: 'turret2' }, M3: { ty: 'tesla' } }, 1);
  assert.ok(on.has('M1') && on.has('M2') && !on.has('M3'), 'ammo MK1 free, one power slot');
  assert.equal(DC.getDef('turret1').ammo, true); assert.equal(DC.getDef('turret2').ammo, false);
});
ok('zones DEFS come from the core (ids, cost, upkeep, minQ, rounded rating)', () => {
  assert.deepEqual(Z.DEF_IDS, ['barr_wood', 'spikes', 'mine', 'turret1', 'flood', 'barr_metal', 'turret2', 'tesla', 'shield', 'turret3']);
  for (const id of Z.DEF_IDS) { const d = DC.getDef(id), z = Z.DEFS[id]; assert.ok(d.zone, id); assert.equal(z.cost, d.cost); assert.equal(z.upkeep, d.upkeep); assert.equal(z.minQ, d.minQ); assert.equal(z.power, Math.round(d.rating)); assert.equal(z.name, d.name); }
});
ok('homeworld defence buildings resolve (towers, walls, gates, spikes, mines)', () => {
  const ids = Object.entries(H.BUILDINGS).filter(([, b]) => b.cat === 'def').map(([t]) => t);
  assert.deepEqual(ids.sort(), ['cryo', 'flame', 'gate', 'gun', 'mines', 'sniper', 'spikes', 'tesla', 'wall']);
  for (const t of ids) {
    const d = DC.getDef('hw_' + t); assert.ok(d && d.sys === 'homeworld', t);
    assert.equal(d.hp, H.BUILDINGS[t].hp[0]); assert.equal(d.cost, H.BUILDINGS[t].base.cr);
    for (let lv = 1; lv <= 5; lv++) { const x = DC.hwDef(t, H.BUILDINGS[t], lv); assert.equal(x.hp, H.BUILDINGS[t].hp[lv - 1]); if (H.BUILDINGS[t].tw) { assert.equal(x.dps, H.BUILDINGS[t].tw.dps[lv - 1]); assert.equal(x.range, H.BUILDINGS[t].tw.range[lv - 1]); } }
  }
  assert.equal(DC.getDef('hw_gun').kind, 'gun'); assert.equal(DC.getDef('hw_wall').kind, 'wall');
});
ok('horror traps register as facility-only defences', () => {
  for (const id of HR.TRAP_IDS) { const d = DC.getDef('trap_' + id); assert.ok(d && d.sys === 'horror' && d.facilityOnly === true, id); assert.equal(d.cost, HR.TRAPS[id].price); assert.ok(d.dps > 0 && d.rating > 0, id + ' has dps + rating'); assert.equal(d.hp, null); }
  for (const id of DC.DEFENSE_IDS) assert.equal(DC.getDef(id).facilityOnly, false, 'deployables are not facility-only');
  assert.ok(!Z.DEF_IDS.some((id) => id.startsWith('trap_')), 'traps are never zone defences');
});
ok('every registered entity has the normalised shape', () => {
  for (const d of DC.allDefs()) {
    assert.ok(d.id && d.sys && d.kind && d.name, d.id);
    for (const k of ['range', 'dps', 'powerUse', 'rating', 'cost', 'upkeep']) assert.ok(Number.isFinite(d[k]), `${d.id}.${k}`);
    assert.ok(d.hp === null || d.hp > 0, d.id + ' hp');
  }
  const sys = new Set(DC.allDefs().map((d) => d.sys));
  assert.deepEqual([...sys].sort(), ['homeworld', 'horror', 'siege']);
  assert.ok(DC.allDefs().length >= 14 + 9 + 5);
});
ok('homeworld2 ghost sentries read the shared tower stats', () => {
  const g = H2.genRival(7, 3), def = H2.ghostDefense(g);
  assert.ok(def.sentries.length > 0);
  for (const s of def.sentries) { const b = H.BUILDINGS[s.t], ts = DC.towerStats(b, s.lv); assert.equal(s.dps, Math.round(ts.dps * 0.2 * 10) / 10); assert.ok(s.range <= ts.range + 1e-9); }
});

// ------------------------------------------------------------------ 2. power calculator vs the old numbers
const OLD_POWER = { barr_wood: 4, spikes: 5, mine: 8, turret1: 12, flood: 4, barr_metal: 9, turret2: 17, tesla: 21, shield: 14, turret3: 26 };
const OLD_BASE = 6;
const oldPower = (st, dry = false, moonUps = 0) => {
  let p = OLD_BASE;
  for (const [k, c] of Object.entries(st?.d || {})) p += (OLD_POWER[k] || 0) * (c | 0);
  p *= dry ? 0.4 : 1;
  return Math.round(p * (1 + 0.1 * Math.min(6, Math.max(0, (st?.up | 0) + moonUps))) * 10) / 10;
};
ok('per-entity rating within 12 % of the old hand-written power (integers)', () => {
  for (const [id, old] of Object.entries(OLD_POWER)) {
    const r = DC.getDef(id).rating; assert.ok(Number.isInteger(r), id);
    assert.ok(Math.abs(r - old) <= Math.max(1, old * 0.12), `${id}: old ${old} new ${r}`);
  }
});
ok('whole-zone defence power within 8 % of the old calculator (random compositions, dry, ups)', () => {
  const rng = new RNG(4242);
  let worst = 0;
  for (let i = 0; i < 4000; i++) {
    const d = {};
    for (let k = rng.int(0, 8); k > 0; k--) { const id = rng.pick(Z.DEF_IDS); d[id] = (d[id] || 0) + 1; }
    const st = { d, up: rng.int(0, 3) }, dry = rng.chance(0.25), mu = rng.int(0, 2);
    const a = oldPower(st, dry, mu), b = Z.defencePower(st, dry, mu);
    const rel = Math.abs(a - b) / a; worst = Math.max(worst, rel);
    assert.ok(rel <= 0.08 || Math.abs(a - b) <= 1.2, `comp ${JSON.stringify(st)} old ${a} new ${b}`);
  }
  assert.ok(worst < 0.09, 'worst ' + worst);
});
ok('empty zone = base defence; dry x0.4; each level +10 % (max 6)', () => {
  assert.equal(Z.defencePower({ d: {}, up: 0 }), Z.BASE_DEF); assert.equal(DC.defencePower({}), DC.BASE_DEF);
  const st = { d: { turret2: 2 }, up: 0 };
  assert.ok(Math.abs(Z.defencePower(st, true) - DC.round1(Z.defencePower(st) * 0.4)) <= 0.11);
  assert.ok(Z.defencePower({ ...st, up: 6 }) === Z.defencePower({ ...st, up: 9 }), 'levels cap at 6');
  assert.ok(Z.defencePower({ ...st, up: 1 }) > Z.defencePower(st));
});
ok('win chance = the old formula', () => {
  for (const def of [5, 14, 20, 33, 60]) for (const [th, qi, cr] of [[1, 0, 1], [2, 1, 2], [3, 2, 4]]) {
    const r = def / Z.wavePowerMean(th, qi, cr), want = Math.min(1, Math.max(0, (r - 0.75) / (1.3 - 0.75)));
    assert.ok(Math.abs(Z.winChance(def, th, qi, cr) - want) < 1e-12);
  }
});
ok('ratings are monotone: better kit / higher level rates higher', () => {
  const r = (id) => DC.getDef(id).rating;
  assert.ok(r('turret1') < r('turret2') && r('turret2') < r('turret3'), 'turret tiers');
  assert.ok(r('barr_wood') < r('barr_metal'));
  for (const t of ['gun', 'tesla', 'flame', 'cryo', 'sniper', 'wall', 'spikes', 'mines']) for (let lv = 1; lv < 5; lv++) assert.ok(DC.hwDef(t, H.BUILDINGS[t], lv + 1).rating >= DC.hwDef(t, H.BUILDINGS[t], lv).rating, `${t} lv${lv}`);
  for (const id of HR.TRAP_IDS) assert.ok(r('trap_' + id) >= 5, 'trap ' + id + ' rates as a real defence');
});
ok('homeworld defence rating follows the buildings', () => {
  const s = H.blankState(); assert.equal(H.defenseRating(s), 0);
  s.b.push({ i: 1, t: 'gun', x: 0, z: 0, r: 0, l: 1 }); const a = H.defenseRating(s);
  s.b.push({ i: 2, t: 'gun', x: 4, z: 0, r: 0, l: 3 }); const b = H.defenseRating(s);
  s.b.push({ i: 3, t: 'farm', x: 8, z: 0, r: 0, l: 5 });
  assert.ok(a > 0 && b > a && H.defenseRating(s) === b, 'economy buildings do not count');
  s.b[0].h = 0; assert.ok(H.defenseRating(s) < b, 'a wrecked tower stops counting');
});
ok('ratings order homeworld towers sensibly (sniper / flame / gun at level 5 all beat level 1)', () => {
  assert.ok(DC.hwDef('flame', H.BUILDINGS.flame, 5).rating > DC.hwDef('gun', H.BUILDINGS.gun, 1).rating);
});

// ------------------------------------------------------------------ 3. targeting / firing
ok('pickTarget = the old nearest loop (range, height band, predicate, alive)', () => {
  const rng = new RNG(99);
  for (let t = 0; t < 400; t++) {
    const list = Array.from({ length: rng.int(0, 14) }, (_, i) => ({ id: i, pos: { x: rng.float(-30, 30), y: rng.float(-3, 8), z: rng.float(-30, 30) }, hp: rng.chance(0.15) ? 0 : 50 }));
    const from = { x: rng.float(-10, 10), y: 0, z: rng.float(-10, 10) }, range = rng.float(4, 26), odd = (c) => c.id % 3 !== 0;
    let best = null, bd = 1e9;   // the old simTurret loop (nearest, dy 6, extra filter)
    for (const c of list) { if (c.hp <= 0) continue; const dd = Math.hypot(c.pos.x - from.x, c.pos.z - from.z); if (dd > range || Math.abs(c.pos.y - from.y) > 6 || dd >= bd) continue; if (!odd(c)) continue; bd = dd; best = c; }
    assert.equal(DC.pickTarget(list, from, range, { dy: 6, pred: odd }), best);
  }
});
ok('pickTarget: minRange, strongest mode, empty list, first wins a tie', () => {
  const l = [{ x: 1, z: 0, hp: 10 }, { x: 5, z: 0, hp: 90 }, { x: 5, z: 0, hp: 90 }, { x: 9, z: 0, hp: 40 }];
  assert.equal(DC.pickTarget(l, { x: 0, z: 0 }, 20), l[0]);
  assert.equal(DC.pickTarget(l, { x: 0, z: 0 }, 20, { mode: 'strongest', minRange: 2 }), l[1]);
  assert.equal(DC.pickTarget(l, { x: 0, z: 0 }, 0.5), null); assert.equal(DC.pickTarget([], { x: 0, z: 0 }, 9), null);
  assert.equal(DC.pickTarget(l, { x: 0, z: 0 }, 5), l[0]);
});
ok('chainTargets = the old tesla chain (never hits twice, hops within radius)', () => {
  const rng = new RNG(5);
  for (let t = 0; t < 300; t++) {
    const list = Array.from({ length: rng.int(1, 12) }, (_, i) => ({ id: i, pos: { x: rng.float(-12, 12), y: 0, z: rng.float(-12, 12) } }));
    const first = list[0], hops = rng.int(1, 5), got = DC.chainTargets(first, list, hops, 6, { dy: 6.6 });
    const seen = new Set(), old = []; let cur = first;   // old loop
    for (let i = 0; i < hops && cur; i++) { seen.add(cur.id); old.push(cur); let b = null, bd = 36; for (const c of list) { const dx = c.pos.x - cur.pos.x, dz = c.pos.z - cur.pos.z, dd = dx * dx + dz * dz; if (dd > bd || seen.has(c.id)) continue; bd = dd; b = c; } cur = b; }
    assert.deepEqual(got.map((c) => c.id), old.map((c) => c.id));
    assert.equal(new Set(got).size, got.length);
  }
});
ok('raid towers still pick the nearest / the strongest raider through the core', () => {
  const sim = { def: { towers: [{ id: 1, t: 'gun', lv: 1, x: 0, z: 0, dps: 14, range: 22, chain: 1, slow: 0 }, { id: 2, t: 'sniper', lv: 1, x: 0, z: 0, dps: 28, range: 50, chain: 1, slow: 0 }] }, alive: () => true };
  const raiders = [{ id: 'a', x: 10, z: 0, hp: 30 }, { id: 'b', x: 30, z: 0, hp: 500 }, { id: 'c', x: 2, z: 0, hp: 20 }, { id: 'd', x: 15, z: 0, hp: 0 }];
  const shots = RAID.towerStep(sim, RAID.newTowerState(), raiders, 1);
  const gun = shots.find((s) => s.t === 'gun'), sn = shots.find((s) => s.t === 'sniper');
  assert.equal(gun.hits[0].id, 'c'); assert.equal(sn.hits[0].id, 'b');
});
ok('shotDamage / splash / cooldown', () => {
  const t1 = DC.getDef('turret1');
  assert.equal(DC.shotDamage(t1, 2, 0.1, () => 0.5), 14);
  const lo = DC.shotDamage(t1, 1, 0.1, () => 0), hi = DC.shotDamage(t1, 1, 0.1, () => 1);
  assert.ok(Math.abs(lo - 6.3) < 1e-9 && Math.abs(hi - 7.7) < 1e-9);
  assert.equal(DC.cooldownOf(t1), 0.25); assert.equal(DC.cooldownOf(DC.getDef('tesla')), 1.6);
  const s = DC.splash([{ x: 0, z: 0, hp: 5 }, { x: 4, z: 0, hp: 5 }, { x: 9, z: 0, hp: 5 }, { x: 1, z: 0, hp: 0 }], { x: 0, z: 0 }, 4.2, 90, 0.6);
  assert.equal(s.length, 2); assert.equal(s[0].dmg, 90); assert.ok(s[1].dmg < 90 && s[1].dmg > 30);
  assert.equal(DC.dpsOf(t1), 28); assert.ok(DC.powerPerSec(DC.getDef('turret2')) > 3 && DC.powerPerSec(t1) === 0);
});

console.log(`defense_core: ${n} groups, ${fails} failed`);
if (fails) process.exit(1);
