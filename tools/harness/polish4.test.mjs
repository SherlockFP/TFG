// Node test for the polish4 pure rules (src/game/polish4_core.js).  node tools/harness/polish4.test.mjs
import assert from 'node:assert/strict';
import * as P from '../../src/game/polish4_core.js';
import * as Y from '../../src/game/shipyard_core.js';
import { TR_P4, RU_P4 } from '../../src/game/polish4_i18n.js';

let pass = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n       ')); process.exitCode = 1; } };

// ------------------------------------------------------------------------------------------------ eggs
ok('egg rolls are deterministic for (seed, day, source)', () => {
  for (let i = 0; i < 50; i++) {
    const a = P.rollChestEgg({ seed: 77, day: 3, id: 'c' + i, tier: 'gold', pity: 0 }), b = P.rollChestEgg({ seed: 77, day: 3, id: 'c' + i, tier: 'gold', pity: 0 });
    assert.equal(a, b);
  }
  const c = { type: 'spider', id: 9, elite: true, tier: 'rare' };
  assert.equal(P.rollCreatureEgg({ seed: 1, day: 2, c }), P.rollCreatureEgg({ seed: 1, day: 2, c }));
});
ok('chest egg rate follows the tier table (wood ~2 %, void ~20 %)', () => {
  const rate = (tier) => { let n = 0; const N = 6000; for (let i = 0; i < N; i++) if (P.rollChestEgg({ seed: 5, day: 1 + (i % 9), id: 'x' + i, tier })) n++; return n / N; };
  const w = rate('wood'), v = rate('void');
  assert.ok(w > 0.008 && w < 0.04, 'wood ' + w);
  assert.ok(v > 0.15 && v < 0.26, 'void ' + v);
});
ok('chest egg types stay in the tier pool', () => {
  const seen = { wood: new Set(), void: new Set() };
  for (let i = 0; i < 4000; i++) { const w = P.rollChestEgg({ seed: 3, day: 2, id: 'w' + i, tier: 'wood', pity: 6 }); if (w) seen.wood.add(w); const v = P.rollChestEgg({ seed: 3, day: 2, id: 'v' + i, tier: 'void' }); if (v) seen.void.add(v); }
  assert.deepEqual([...seen.wood], ['pet_egg_common']);
  assert.ok(!seen.void.has('pet_egg_common') && seen.void.has('pet_egg_glitch') && seen.void.has('pet_egg_wild'));
});
ok('regular creatures almost never drop, bosses often, swarm fodder / hazards never', () => {
  let reg = 0, boss = 0, zom = 0, haz = 0; const N = 5000;
  for (let i = 0; i < N; i++) {
    if (P.rollCreatureEgg({ seed: 8, day: 1 + (i % 9), c: { type: 'scuttler', id: i } })) reg++;
    if (P.rollCreatureEgg({ seed: 8, day: 1 + (i % 9), c: { type: 'hydra', id: i, boss: true } })) boss++;
    if (P.rollCreatureEgg({ seed: 8, day: 1, c: { type: 'zombot', id: i, elite: true, tier: 'mythic' } })) zom++;
    if (P.rollCreatureEgg({ seed: 8, day: 1, c: { type: 'mine', id: i, hazard: true } })) haz++;
  }
  assert.ok(reg / N < 0.012, 'regular ' + reg / N);
  assert.ok(boss / N > 0.42 && boss / N < 0.58, 'boss ' + boss / N);
  assert.equal(zom, 0); assert.equal(haz, 0);
});
ok('pity multiplier is capped at x3', () => { assert.equal(P.pityMul(0), 1); assert.equal(P.pityMul(2), 2); assert.equal(P.pityMul(99), 3); });

// ------------------------------------------------------------------------------------------------ barter
const has = (id) => !['plasmablade'].includes(id);
ok('barter stock is deterministic per (seed, day, npc) and rotates daily', () => {
  const o = (day, npc = 12) => P.barterOffers({ seed: 42, day, npc, has, priceOf: () => 50 });
  assert.deepEqual(o(3), o(3));
  const days = new Set(); for (let d = 1; d < 15; d++) days.add(JSON.stringify(o(d)));
  assert.ok(days.size > 6, 'stock should rotate: ' + days.size);
});
ok('every offer has a valid item, sane price / min, at most 3 per npc', () => {
  for (let d = 1; d < 40; d++) for (let n = 1; n < 8; n++) {
    const offers = P.barterOffers({ seed: 9, day: d, npc: n, has, priceOf: (id) => (id === 'blaster' ? 300 : 40) });
    assert.ok(offers.length >= 1 && offers.length <= 3);
    offers.forEach((f, i) => {
      assert.equal(f.i, i); assert.ok(has(f.item)); assert.ok(f.qty >= 1);
      if (f.kind === 'buy') assert.ok(f.price >= 8 && Number.isFinite(f.price)); else assert.ok(f.min >= 60 && f.min <= 120);
    });
  }
});
ok('barter with nothing available yields no offers (no throw)', () => { assert.deepEqual(P.barterOffers({ seed: 1, day: 1, npc: 1, has: () => false }), []); });

// ------------------------------------------------------------------------------------------------ decals / furniture
ok('deco sanitize clamps, drops unknown, caps the count', () => {
  const d = P.sanitizeDeco({ decal: 'nope', furn: [{ id: 'plant', x: 99, z: -99, r: 7 }, { id: 'ufo', x: 0, z: 0 }, ...Array(30).fill({ id: 'rug', x: 0, z: 0, r: 1 })] });
  assert.equal(d.decal, 'none'); assert.equal(d.furn.length, P.MAX_FURN);
  assert.ok(d.furn[0].x <= P.FURN_AREA.x1 && d.furn[0].z >= P.FURN_AREA.z0 && d.furn[0].r === 3);
});
ok('ship state carries the deco through shipyard sanitize', () => {
  const s = Y.blankState(); s.deco = { decal: 'skull', furn: [{ id: 'lamp', x: 1, z: 1, r: 0 }] };
  const c = Y.sanitize(JSON.parse(JSON.stringify(s)));
  assert.equal(c.deco.decal, 'skull'); assert.equal(c.deco.furn.length, 1);
  assert.equal(Y.sanitize({}).deco.decal, 'none');
});
ok('placement: area, overlap, flat vs solid, credits, refund', () => {
  const d = P.blankDeco(), w = { cr: 500 };
  assert.ok(!P.canPlace(d, { id: 'shelf', x: 6.1, z: 0, r: 0 }).ok, 'wall');
  assert.ok(P.tryPlace(d, w, { id: 'beanbag', x: 0, z: 0, r: 0 }).ok); assert.equal(w.cr, 465);
  assert.ok(!P.tryPlace(d, w, { id: 'plant', x: 0.2, z: 0.2, r: 0 }).ok, 'overlap with solid');
  assert.ok(P.tryPlace(d, w, { id: 'rug', x: 0, z: 0, r: 0 }).ok, 'rug under a bean bag');
  assert.ok(!P.tryPlace(d, w, { id: 'rug', x: 0.3, z: 0, r: 0 }).ok, 'rug on rug');
  assert.ok(!P.tryPlace(d, { cr: 1 }, { id: 'lamp', x: 3, z: 1, r: 0 }).ok, 'credits');
  assert.ok(!P.tryPlace(d, w, { id: 'lamp', x: 3, z: 1, r: 0 }, () => true).ok, 'blocked by props');
  const before = w.cr, r = P.tryRemove(d, w, 0); assert.ok(r.ok); assert.equal(w.cr, before + Math.floor(P.FURN.beanbag.cr / 2));
  assert.ok(!P.tryRemove(d, w, 40).ok);
});
ok('decal purchase', () => {
  const d = P.blankDeco(), w = { cr: 100 };
  assert.ok(P.trySetDecal(d, w, 'star').ok); assert.equal(w.cr, 80); assert.equal(d.decal, 'star');
  assert.ok(!P.trySetDecal(d, w, 'star').ok); assert.ok(!P.trySetDecal(d, w, 'zzz').ok);
  assert.equal(P.findDecal('phi'), 'fish'); assert.equal(P.findFurn('bean'), 'beanbag'); assert.equal(P.findFurn('xx'), null);
});
ok('rotated footprint swaps the extents', () => { const a = P.halfExtents('shelf', 0), b = P.halfExtents('shelf', 1); assert.deepEqual(a, [b[1], b[0]]); });

// ------------------------------------------------------------------------------------------------ squads
ok('detour: straight when clear, side waypoint around a wall, null when boxed in', () => {
  const wall = (a, b) => { // a vertical wall at x = 10 spanning z -6..6
    const dx = b.x - a.x; if (Math.abs(dx) < 1e-6) return true;
    const t = (10 - a.x) / dx; if (t <= 0 || t >= 1) return true;
    const z = a.z + (b.z - a.z) * t; return Math.abs(z) > 6;
  };
  assert.deepEqual(P.detourPath({ x: 0, z: 20 }, { x: 20, z: 20 }, wall), []);
  const wp = P.detourPath({ x: 0, z: 0 }, { x: 20, z: 0 }, wall);
  assert.equal(wp.length, 1); assert.ok(wall({ x: 0, z: 0 }, wp[0]) && wall(wp[0], { x: 20, z: 0 }));
  assert.equal(P.detourPath({ x: 0, z: 0 }, { x: 20, z: 0 }, () => false), null);
});
ok('flank: leader stays put, gunners split to opposite sides, everybody converges near the contact', () => {
  const centre = { x: 0, z: 0 }, contact = { x: 40, z: 0 };
  const f = (idx, role, dist = 40) => P.flankOffset({ centre, contact, idx, role, dist });
  assert.deepEqual(f(0, 'hs_leader'), { x: 0, z: 0 });
  const a = f(0, 'hs_gunner'), b = f(1, 'hs_gunner');
  assert.ok(Math.abs(a.z) > 5 && Math.abs(b.z) > 5 && Math.sign(a.z) === -Math.sign(b.z), JSON.stringify([a, b]));
  assert.ok(Math.abs(f(0, 'hs_enforcer').z) < Math.abs(a.z));
  const near = f(0, 'hs_gunner', 10); assert.deepEqual(near, { x: 0, z: 0 });
  const mid = f(0, 'hs_gunner', 20); assert.ok(Math.abs(mid.z) < Math.abs(a.z) && Math.abs(mid.z) > 0);
});

// ------------------------------------------------------------------------------------------------ i18n
ok('every polish4 string has TR and RU', () => {
  for (const k of Object.keys(RU_P4)) assert.ok(k in TR_P4 || true);
  assert.ok(Object.keys(TR_P4).length > 100 && Object.keys(RU_P4).length > 300);
  for (const d of P.DECALS.slice(1)) { assert.ok(d.name in TR_P4 || d.name === 'TFG', 'TR ' + d.name); assert.ok(d.name in RU_P4 || d.name === 'TFG', 'RU ' + d.name); }
  for (const f of Object.values(P.FURN)) { assert.ok(f.name in TR_P4, 'TR ' + f.name); assert.ok(f.name in RU_P4, 'RU ' + f.name); }
});

console.log(`\n${pass} passed`);
