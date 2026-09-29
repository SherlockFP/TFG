// node tools/harness/harvest2.test.mjs
import assert from 'node:assert/strict';
import * as H from '../../src/game/harvest2_core.js';
const ok = (n, f) => { f(); console.log('ok  ' + n); };
const axe = { id: 'tool_axe', kind: 'weapon', dmg: 15 }, pick = { id: 'tool_pickaxe', kind: 'weapon', dmg: 13 }, bat = { id: 'bat', kind: 'weapon', dmg: 22 };
ok('tool classes', () => {
  assert.equal(H.toolClass(null), 'hand'); assert.equal(H.toolClass(axe), 'axe'); assert.equal(H.toolClass(pick), 'pick');
  assert.equal(H.toolClass(bat), 'weapon'); assert.equal(H.toolClass({ id: 'waraxe', kind: 'weapon', dmg: 30 }), 'weapon');
  assert.equal(H.toolClass({ id: 'pistol', kind: 'weapon', ranged: true, dmg: 17 }), 'hand'); assert.equal(H.toolClass({ id: 'flashlight', kind: 'tool' }), 'hand');
});
ok('multipliers per spec', () => {
  assert.equal(H.multiplier('axe', 'tree'), 2); assert.equal(H.multiplier('pick', 'rock'), 2);
  assert.equal(H.multiplier('hand', 'tree'), 0.3); assert.equal(H.multiplier('hand', 'rock'), 0.3);
  assert.equal(H.multiplier('weapon', 'tree'), 0.6); assert.equal(H.multiplier('weapon', 'rock'), 0.6);
  assert.ok(H.multiplier('pick', 'tree') < 1 && H.multiplier('axe', 'rock') < 1);
});
ok('damage: clamp + floor', () => {
  assert.equal(H.hitDamage(15, 'axe', 'tree'), 30); assert.equal(H.hitDamage(1e9, 'axe', 'tree'), H.MAX_BASE_DMG * 2);
  assert.equal(H.hitDamage(0, 'hand', 'tree'), 0.9); assert.equal(H.hitDamage(NaN, 'weapon', 'rock'), 1.8); assert.equal(H.hitDamage(-50, 'axe', 'tree'), 6);
});
ok('HP -> drop flow (hits to fell)', () => {
  const hp = H.hpFor('tree', 1); assert.equal(hp, 80);
  assert.equal(H.hitsToBreak(hp, 15, 'axe', 'tree'), 3);           // axe: 30/hit
  assert.equal(H.hitsToBreak(hp, 22, 'weapon', 'tree'), 7);        // bat: 13.2/hit
  assert.ok(H.hitsToBreak(hp, 4, 'hand', 'tree') > 40);            // fists: painful
  assert.equal(H.hitsToBreak(H.hpFor('rock', 1), 13, 'pick', 'rock'), 6);
  let left = hp, n = 0; while (left > 0) { left -= H.hitDamage(15, 'axe', 'tree'); n++; } assert.equal(n, 3);
  assert.ok(H.DROPS.tree.n[0] >= 1 && H.DROPS.rock.crystalChance < 0.2);
});
ok('host validation: range', () => {
  const base = { now: 10, target: { x: 0, y: 0, z: 0 }, pos: { x: 3, y: 0, z: 0 } };
  assert.equal(H.validateHit(base).ok, true);
  assert.equal(H.validateHit({ ...base, pos: { x: 7, y: 0, z: 0 } }).why, 'range');
  assert.equal(H.validateHit({ ...base, pos: { x: 1, y: 9, z: 0 } }).why, 'range');
  assert.equal(H.validateHit({ ...base, pos: null }).why, 'pos'); assert.equal(H.validateHit({ ...base, target: null }).why, 'target');
  assert.equal(H.validateHit({ ...base, fallen: true }).why, 'fallen');
});
ok('host validation: rate limit', () => {
  const base = { now: 10, target: { x: 0, y: 0, z: 0 }, pos: { x: 1, y: 0, z: 0 } };
  assert.equal(H.validateHit({ ...base, pairLast: 9.9 }).why, 'rate'); assert.equal(H.validateHit({ ...base, pairLast: 9.7 }).ok, true);
  assert.equal(H.validateHit({ ...base, peerLast: 9.95 }).why, 'rate'); assert.equal(H.validateHit({ ...base, peerLast: 9.5 }).ok, true);
});
ok('wobble decays', () => { assert.equal(H.wobble(1), 0); assert.ok(Math.abs(H.wobble(0.1)) > Math.abs(H.wobble(0.9))); });
// ---- module-level flow with a mock game: request -> host validation -> HP -> fell + drops (skipped if the module cannot load in node)
let M = null; try { M = await import('../../src/game/harvest.js'); } catch (e) { console.log('skip module flow (' + e.message.slice(0, 80) + ')'); }
if (M) {
  const sent = [], spawned = [], handlers = {};
  const game = { isHost: true, selfId: 'h', run: { phase: 'moon' }, player: { pos: { x: 2, y: 0, z: 0 } }, remotes: new Map([['p2', { pos: { x: 40, y: 0, z: 0 } }]]),
    mods: { itemModels: new Map(), emit() {} }, crafting: { dropComponents: (pos, kind, n) => spawned.push([kind, n]) }, items: { hostSpawn: (id) => spawned.push(id) }, physics: { removeCollider() {} },
    net: { broadcast: (k, d) => sent.push([k, d]), request() {}, on_: (k, f) => { handlers[k] = f; }, handle: (k, f) => { handlers[k] = f; } } };
  const H2 = M.installHarvest(game, {});
  const tree = (id, x) => ({ id, kind: 'tree', x, y: 0, z: 0, scale: 1, rot: 0, inst: [], cols: [] });
  const outdoor = { harvest: { trees: [tree('t1', 0), tree('t2', 1)], rocks: [] }, colliders: [], group: { add() {} } };
  game.world = { outdoor };
  H2.onMapLoaded({ seed: 7, outdoor });
  H2.bindNet(game.net);
  const send = (id, d, c, from = 'h') => handlers.wxHit({ s: 7, id, d, c }, from);
  ok('module: axe fells an 80 HP tree in 3 hits, drops spawn once', () => {
    for (let i = 0; i < 3; i++) { H2.update(0.3); send('t1', 15, 'axe'); }
    assert.equal(sent.filter(([k]) => k === 'wxHp').length, 2); assert.equal(sent.filter(([k]) => k === 'wxFell').length, 1);
    assert.deepEqual(spawned.length, 1); assert.equal(spawned[0][0], "wood"); assert.equal(H2.info('t1').dying, true);
    const n = spawned.length; H2.update(0.3); send('t1', 15, 'axe'); assert.equal(spawned.length, n);
  });
  ok('module: out-of-range peer, spam and huge damage', () => {
    const hp0 = H2.info('t2').hp;
    send('t2', 50, 'axe', 'p2'); assert.equal(H2.info('t2').hp, hp0);                   // 40 m away
    H2.update(1); send('t2', 15, 'axe'); const hp1 = H2.info('t2').hp; assert.equal(hp1, hp0 - 30);
    send('t2', 15, 'axe'); assert.equal(H2.info('t2').hp, hp1);                          // same tick: rate limited
    H2.update(1); send('t2', 9999, 'axe'); assert.equal(H2.info('t2').dying, true);     // clamped to 120 x2 = 240 >= remaining
    assert.ok(sent.filter(([k]) => k === 'wxFell').length === 2);
  });
}
console.log('harvest2: all passed');
