// Pet SIM test ([finish]):  node tools/harness/pets_sim.test.mjs
// pets_sim.js is pure: fetch trips, attack, guard, KO / revive, tank / shield, decoy, marks, daily cap, obey.
import assert from 'node:assert/strict';
import * as C from '../../src/game/pets_core.js';
import * as S from '../../src/game/pets_sim.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok', name); };
const seeded = (s = 7) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const mkPet = (sp, xp = 0, trait = 'loyal', ly = 100) => { const p = C.makePet({ sp, rng: seeded(3), shiny: false, trait }); p.xp = xp; p.ly = ly; return p; };
const owner = () => ({ id: 'o', pos: { x: 0, y: 0, z: 0 }, yaw: 0, zone: 'out', inShip: false, dead: false });
function world(over = {}) {
  const w = { events: [], items: [], creatures: [], drops: [], taken: [], hits: [], decoys: [], digs: 0, ...over };
  w.env = {
    owner: over.owner || owner(), day: 1, rand: seeded(9), creatures: w.creatures,
    shipPoint: { x: 20, y: 0, z: 0 }, guardPoint: over.guard || null, shipReachable: true,
    emit: (k, d) => w.events.push([k, d]),
    findItems: () => w.items.filter((i) => !w.taken.includes(i.id)),
    looseLoot: () => w.items, chests: () => w.chests || [],
    claimed: () => false,
    take: (rec, id) => { const it = w.items.find((i) => i.id === id); if (!it || w.taken.includes(id)) return false; w.taken.push(id); return true; },
    dropCarry: (rec, ids, where) => w.drops.push([ids, where, rec.x, rec.z]),
    hit: (rec, id, dmg, o) => { const c = w.creatures.find((q) => q.id === id); c.hp -= dmg; w.hits.push([id, dmg, o]); if (c.hp <= 0) { c.dead = true; return { killed: true }; } return {}; },
    decoy: (rec, dc, lure, scare) => w.decoys.push([dc.x, dc.z, lure, scare]),
    dig: () => { w.digs++; },
  };
  return w;
}
const run = (rec, w, sec, dt = 0.1) => { for (let t = 0; t < sec; t += dt) S.stepPet(rec, w.env, dt); };
const item = (id, x, z, extra = {}) => ({ id, x, y: 0, z, val: 40, tier: 0, weight: 2, big: false, nest: null, ...extra });

ok('follow: keeps near the owner, teleports when far', () => {
  const w = world(); const rec = S.makeRec('o', C.netPet(mkPet('cat')), { x: 0, y: 0, z: 0 });
  w.env.owner.pos.x = 15; run(rec, w, 6);
  assert.ok(Math.hypot(rec.x - 15, rec.z) < 4, 'caught up');
  w.env.owner.pos.x = 90; run(rec, w, 0.2);
  assert.ok(Math.hypot(rec.x - 90, rec.z) < 4, 'teleported');
});

ok('fetch: dog brings small scrap to the owner, XP event, daily cap', () => {
  const w = world({ items: [item('a', 8, 3), item('big', 6, 6, { big: true, weight: 40 }), item('far', 60, 0)] });
  const rec = S.makeRec('o', C.netPet(mkPet('dog')), { x: 1, y: 0, z: 1 });
  S.setMode(rec, 'fetch'); rec.dest = 'me';
  run(rec, w, 30);
  assert.deepEqual(w.taken, ['a'], 'only the small item in range');
  assert.equal(w.drops.length, 1); assert.equal(w.drops[0][1], 'owner');
  assert.ok(w.events.some(([k, d]) => k === 'fetched' && d.n === 1));
  assert.equal(rec.fetchedToday, 1);
  const w2 = world({ items: Array.from({ length: 30 }, (_, i) => item('i' + i, 5 + (i % 5), i % 4)) });
  const r2 = S.makeRec('o', C.netPet(mkPet('dog')), { x: 1, y: 0, z: 1 }); S.setMode(r2, 'fetch');
  run(r2, w2, 600);
  assert.ok(r2.fetchedToday <= r2.stats.fetchDaily, 'daily cap ' + r2.fetchedToday);
  assert.ok(r2.fetchedToday >= 3);
});

ok('fetch: ship delivery walks to the ship point; cat cannot fetch', () => {
  const w = world({ items: [item('a', 6, 0)] });
  const rec = S.makeRec('o', C.netPet(mkPet('dog')), { x: 1, y: 0, z: 0 }); S.setMode(rec, 'fetch'); rec.dest = 'ship';
  run(rec, w, 40);
  assert.equal(w.drops[0]?.[1], 'ship');
  const w2 = world({ items: [item('a', 6, 0)] });
  const cat = S.makeRec('o', C.netPet(mkPet('cat')), { x: 1, y: 0, z: 0 }); S.setMode(cat, 'fetch'); run(cat, w2, 20);
  assert.equal(w2.taken.length, 0);
});

ok('fox steals nest items, others skip them; crow picks the best tier; big only for bear lv10', () => {
  const nest = item('n', 6, 0, { nest: 'c9' });
  const wf = world({ items: [nest] });
  const fox = S.makeRec('o', C.netPet(mkPet('fox')), { x: 1, y: 0, z: 0 }); S.setMode(fox, 'fetch'); run(fox, wf, 20);
  assert.deepEqual(wf.taken, ['n']);
  const wd = world({ items: [nest] });
  const dog = S.makeRec('o', C.netPet(mkPet('dog')), { x: 1, y: 0, z: 0 }); S.setMode(dog, 'fetch'); run(dog, wd, 20);
  assert.equal(wd.taken.length, 0);
  const wc = world({ items: [item('low', 3, 0, { tier: 0, val: 10 }), item('gold', 9, 0, { tier: 3, val: 200 })] });
  const crow = S.makeRec('o', C.netPet(mkPet('crow')), { x: 1, y: 0, z: 0 }); S.setMode(crow, 'fetch'); run(crow, wc, 0.5);
  assert.equal(crow.tgt, 'gold');
  const bigI = item('b', 5, 0, { big: true, weight: 15 });
  const wb1 = world({ items: [bigI] }), b1 = S.makeRec('o', C.netPet(mkPet('bear', 0)), { x: 1, y: 0, z: 0 }); S.setMode(b1, 'fetch'); run(b1, wb1, 15);
  assert.equal(wb1.taken.length, 0);
  const wb2 = world({ items: [bigI] }), b2 = S.makeRec('o', C.netPet(mkPet('bear', C.xpAtLevel(10))), { x: 1, y: 0, z: 0 }); S.setMode(b2, 'fetch'); run(b2, wb2, 30);
  assert.deepEqual(wb2.taken, ['b']);
});

ok('obey: a restless pet sometimes ignores fetch', () => {
  const p = mkPet('dog', 0, 'lazy', 0);
  let ig = 0;
  for (let s = 1; s <= 30; s++) {
    const w = world({ items: [item('a', 6, 0)] }); w.env.rand = seeded(s * 7919 + 12345);
    const rec = S.makeRec('o', C.netPet(p), { x: 1, y: 0, z: 0 }); S.setMode(rec, 'fetch'); run(rec, w, 1);
    if (w.events.some(([k, d]) => k === 'say' && d.k === 'ignore')) ig++;
  }
  assert.ok(ig > 3 && ig < 30, 'ignored ' + ig);
});

ok('attack: assist kills a creature that hunts the owner; command works; hazards / bosses skipped', () => {
  const cr = { id: 'c1', x: 5, y: 0, z: 0, hp: 20, maxHp: 20, target: 'o', active: true, type: 'hound', level: 1, dmg: 8, zone: 'out' };
  const w = world({ creatures: [cr, { id: 'h', x: 2, y: 0, z: 1, hp: null, maxHp: null, hazard: true, active: true, dmg: 50, zone: 'out' }, { id: 'boss', x: 3, y: 0, z: 2, hp: 500, maxHp: 500, boss: true, active: true, target: 'o', dmg: 30, zone: 'out' }] });
  const rec = S.makeRec('o', C.netPet(mkPet('dog', C.xpAtLevel(10))), { x: 1, y: 0, z: 1 });
  run(rec, w, 30);
  assert.ok(cr.dead, 'creature died'); assert.ok(w.hits.every(([id]) => id === 'c1'));
  assert.ok(w.events.some(([k]) => k === 'kill'));
  const c2 = { id: 'c2', x: 4, y: 0, z: 0, hp: 9, maxHp: 9, target: null, active: false, type: 'x', level: 1, dmg: 2, zone: 'out' };
  const w2 = world({ creatures: [c2] });
  const cat = S.makeRec('o', C.netPet(mkPet('cat')), { x: 1, y: 0, z: 1 });
  run(cat, w2, 3); assert.equal(w2.hits.length, 0);
  assert.equal(S.command(cat, { op: 'atk', id: 'c2' }, w2.env), 'attack');
  run(cat, w2, 15); assert.ok(c2.dead);
});

ok('attack: owl first strike x2, bee dot / aoe flags', () => {
  const mk = (sp, xp) => { const c = { id: 'c', x: 2, y: 0, z: 0, hp: 500, maxHp: 500, target: 'o', active: true, type: 'x', level: 1, dmg: 0, zone: 'out' }; const w = world({ creatures: [c] }); const rec = S.makeRec('o', C.netPet(mkPet(sp, xp)), { x: 1.5, y: 0, z: 0 }); S.command(rec, { op: 'atk', id: 'c' }, w.env); run(rec, w, 4); return w; };
  const owl = mk('owl', C.xpAtLevel(20));
  assert.ok(owl.hits[0][1] > owl.hits[1][1] * 1.8, 'first strike');
  assert.ok(mk('bee', 0).hits[0][2].dot);
  assert.ok(mk('bee', C.xpAtLevel(20)).hits[0][2].aoe > 0);
});

ok('guard: holds the ship door and fights there, ignoring the owner far away', () => {
  const cr = { id: 'g1', x: 21, y: 0, z: 4, hp: 20, maxHp: 20, target: null, active: true, type: 'x', level: 1, dmg: 3, zone: 'out' };
  const w = world({ creatures: [cr], guard: { x: 20, y: 0, z: 3 } }); w.env.owner.pos.x = -80;
  const rec = S.makeRec('o', C.netPet(mkPet('dog')), { x: 0, y: 0, z: 0 }); S.setMode(rec, 'guard');
  rec.x = 20; rec.z = 3;
  run(rec, w, 20);
  assert.ok(cr.dead); assert.ok(Math.hypot(rec.x - 20, rec.z - 3) < 4);
});

ok('KO, cat revive once a day, carry dropped, tank + shield', () => {
  const w = world();
  const bear = S.makeRec('o', C.netPet(mkPet('bear')), { x: 1, y: 0, z: 1 });
  const sh = S.tankShare(bear, 30, { x: 0, y: 0, z: 0 });
  assert.ok(Math.abs(sh.toPet - 30 * bear.stats.tank) < 1e-9 && sh.toPlayer < 30);
  assert.equal(S.tankShare(bear, 999, { x: 0, y: 0, z: 0 }).toPet, 0);
  assert.equal(S.tankShare(bear, 30, { x: 50, y: 0, z: 0 }).toPet, 0);
  bear.carry.push('x1');
  assert.equal(S.hurtPet(bear, 1e6, w.env), 'ko'); assert.ok(bear.ko); assert.equal(w.drops.length, 1);
  assert.ok(w.events.some(([k]) => k === 'ko'));
  const cat = S.makeRec('o', C.netPet(mkPet('cat', C.xpAtLevel(10))), { x: 1, y: 0, z: 1 });
  assert.equal(S.hurtPet(cat, 1e6, w.env), 'revive'); assert.ok(cat.hp > 0 && !cat.ko);
  assert.equal(S.hurtPet(cat, 1e6, w.env), 'ko');
  const bot = S.makeRec('o', C.netPet(mkPet('bot')), { x: 1, y: 0, z: 1 });
  assert.equal(S.absorbShield(bot, 10), 0); assert.equal(S.absorbShield(bot, 10), 10, 'cooldown');
  run(bot, w, 61); assert.ok(S.absorbShield(bot, 30) > 0);
  assert.equal(S.absorbShield(S.makeRec('o', C.netPet(mkPet('bot')), { x: 0, y: 0, z: 0 }), 999), 999);
});

ok('creatures hurt an adjacent pet', () => {
  const cr = { id: 'x', x: 1.2, y: 0, z: 1.2, hp: 50, maxHp: 50, target: 'o', active: true, type: 'x', level: 1, dmg: 20, zone: 'out' };
  const w = world({ creatures: [cr] });
  const rec = S.makeRec('o', C.netPet(mkPet('bee')), { x: 1, y: 0, z: 1 }); S.setMode(rec, 'stay');
  run(rec, w, 20);
  assert.ok(rec.ko || rec.hp < rec.maxHp);
});

ok('passives: marks, pollen, recharge, dig, decoy', () => {
  const cr = { id: 'm', x: 10, y: 0, z: 0, hp: 20, maxHp: 20, target: null, active: false, type: 'x', level: 1, dmg: 1, zone: 'out' };
  const trap = { id: 't', x: 0, y: 0, z: 12, hp: null, maxHp: null, hazard: true, zone: 'out' };
  const w = world({ creatures: [cr, trap], items: [item('loot', 30, 0)], chests: [{ x: 25, y: 0, z: 0, opened: false }] });
  const cat = S.makeRec('o', C.netPet(mkPet('cat')), { x: 1, y: 0, z: 0 }); run(cat, w, 1);
  const mk1 = w.events.find(([k]) => k === 'mk')[1].list; assert.equal(mk1.length, 1); assert.equal(mk1[0][3], 'c');
  const w2 = world({ creatures: [cr, trap] });
  const cat20 = S.makeRec('o', C.netPet(mkPet('cat', C.xpAtLevel(20))), { x: 1, y: 0, z: 0 }); run(cat20, w2, 1);
  assert.ok(w2.events.find(([k]) => k === 'mk')[1].list.some((m) => m[3] === 'h'));
  const w3 = world({ creatures: [{ ...cr, active: true, x: 15 }] });
  const dog = S.makeRec('o', C.netPet(mkPet('dog', C.xpAtLevel(10))), { x: 1, y: 0, z: 0 }); S.setMode(dog, 'stay'); run(dog, w3, 1);
  assert.ok(w3.events.some(([k]) => k === 'bark'));
  const w4 = world({ items: [item('loot', 30, 0)] });
  const owl = S.makeRec('o', C.netPet(mkPet('owl', C.xpAtLevel(10))), { x: 1, y: 0, z: 0 }); run(owl, w4, 1);
  assert.ok(w4.events.find(([k]) => k === 'mk')[1].list.some((m) => m[3] === 'l'));
  const w5 = world({ chests: [{ x: 25, y: 0, z: 0, opened: false }, { x: 5, y: 0, z: 0, opened: true }] });
  const fox = S.makeRec('o', C.netPet(mkPet('fox', C.xpAtLevel(10))), { x: 1, y: 0, z: 0 }); run(fox, w5, 1);
  assert.equal(w5.events.find(([k]) => k === 'mk')[1].list.filter((m) => m[3] === 'k').length, 1);
  const w6 = world();
  const bee = S.makeRec('o', C.netPet(mkPet('bee', C.xpAtLevel(10))), { x: 1, y: 0, z: 0 }); run(bee, w6, 10);
  assert.ok(w6.events.filter(([k]) => k === 'heal').length >= 2);
  const bot = S.makeRec('o', C.netPet(mkPet('bot', C.xpAtLevel(10))), { x: 1, y: 0, z: 0 }); run(bot, w6, 31);
  assert.ok(w6.events.filter(([k]) => k === 'recharge').length >= 2);
  const w7 = world();
  const crow = S.makeRec('o', C.netPet(mkPet('crow', C.xpAtLevel(10))), { x: 1, y: 0, z: 0 }); run(crow, w7, 200, 0.5);
  assert.ok(w7.digs >= 1, 'dig ' + w7.digs);
  assert.ok(C.petStats(mkPet('crow', C.xpAtLevel(10))).luck > 0);
  const w8 = world();
  const par = S.makeRec('o', C.netPet(mkPet('parrot')), { x: 1, y: 0, z: 0 });
  assert.equal(S.command(par, { op: 'atk', p: [12, 0, 0] }, w8.env), 'decoy');
  run(par, w8, 5); assert.ok(w8.decoys.length >= 2 && Math.abs(par.x - 12) < 3); run(par, w8, 10); assert.ok(w8.decoys.length >= 4);
  assert.equal(S.command(par, { op: 'atk', p: [12, 0, 0] }, w8.env), 'cooldown');
});

ok('zone change: pet snaps to the owner; blocked pets idle', () => {
  const w = world(); const rec = S.makeRec('o', C.netPet(mkPet('cat')), { x: 0, y: 0, z: 0 });
  w.env.owner.zone = 'in'; w.env.owner.pos = { x: 5, y: -300, z: 5 };
  run(rec, w, 0.2); assert.equal(rec.zone, 'in'); assert.ok(Math.hypot(rec.x - 5, rec.z - 5) < 3);
  rec.blocked = true; const x = rec.x; w.env.owner.pos.x = 9; run(rec, w, 2); assert.equal(rec.x, x);
});

console.log(n + ' pet sim checks passed');
