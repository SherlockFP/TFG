// Node test for the pure inventory logic (no browser):  node tools/harness/inventory_core.test.mjs
import * as C from '../../src/game/inventory_core.js';
import { ITEMS } from '../../src/game/items.js';
import { rollTier } from '../../src/game/tiers.js';
import { RNG } from '../../src/core/rng.js';

const E = (id, ty, inv, tier) => ({ id, def: ITEMS[ty], inv, tier });
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } else console.log('ok  ', m); };

ok(C.itemSize(ITEMS.bolt).h === 2, 'bolt (19 lb) is 1x2');
ok(C.itemSize(ITEMS.duck).w === 1 && C.itemSize(ITEMS.duck).h === 1, 'duck is 1x1');
ok(C.itemSize(ITEMS.axle).w === 2 && C.itemSize(ITEMS.axle).h === 2, 'two-handed axle is 2x2');
ok(C.itemSize(ITEMS.vase) === null, 'big physics items cannot be bagged');
ok(C.gridFor(null).cols === 4 && C.gridFor(null).rows === 2, 'pockets are 4x2');
ok(C.gridFor(ITEMS.beltbag).cols === 5 && C.gridFor(ITEMS.bag_void, 2).cols === 10, 'bag grids + passive-tree columns');
const base = [E('a', 'duck', { k: 'bag', x: 0, y: 0 }), E('b', 'bolt', { k: 'bag', x: 1, y: 0 }), E('c', 'duck', null)];
ok(C.validateState(base) === null, 'valid pockets layout');
ok(C.validateState([...base, E('d', 'axle', { k: 'bag', x: 2, y: 0 })]) === null, 'axle fits at 2,0');
ok(C.validateState([...base, E('d', 'axle', { k: 'bag', x: 3, y: 0 })]) === 'does not fit', 'out of bounds rejected');
ok(C.validateState([...base, E('d', 'duck', { k: 'bag', x: 1, y: 1 })]) === 'does not fit', 'overlap rejected');
ok(C.validateState([E('x', 'arm_riot', { k: 'eq', s: 'bag' })]) === 'wrong slot', 'armor in the bag slot rejected');
ok(C.validateState([E('x', 'chainletter', { k: 'bag', x: 0, y: 0 })]) === 'not baggable', 'cursed items rejected');
ok(C.validateState([E('1', 'duck', null), E('2', 'duck', null), E('3', 'duck', null)], { maxHot: 2 }) === 'hotbar full', 'hotbar count enforced');
const packed = [E('bg', 'bag_fieldpack', { k: 'eq', s: 'bag' }), E('1', 'bolt', { k: 'bag', x: 5, y: 0 })];
ok(C.validateState(packed) === null, 'field pack 6x4');
ok(C.validateState(C.applyMoves(packed, [['bg', null]])) === 'does not fit', 'unequipping the bag strands its contents');
const lay = C.packLayout([E('1', 'bolt', null), E('2', 'axle', null), E('3', 'duck', null), E('4', 'ring', null), E('5', 'tv', null)], C.gridFor(ITEMS.bag_fieldpack));
ok(!!lay && lay.size === 5, 'sort packs 5 mixed items into 6x4');
const b = C.equipBonuses([E('k', 'arm_kevlar', { k: 'eq', s: 'armor' }, 'legendary'), E('t', 'trk_dongle', { k: 'eq', s: 'trinket1' }, 'rare'), E('h', 'bag_hauler', { k: 'eq', s: 'bag' })]);
ok(Math.abs(b.armor - 0.288) < 1e-9 && Math.abs(b.speed + 0.09) < 1e-9 && Math.abs(b.luck - 0.075) < 1e-9, 'gear bonuses x tier statMul');
ok(!C.rollsTier(ITEMS.arm_kevlar, {}) && C.rollsTier(ITEMS.arm_kevlar, { valueMul: 1 }) && !C.rollsTier(ITEMS.bag_hauler, { rollTier: true }), 'store gear common, loot gear rolls, bags fixed');
ok(Math.abs(C.expectedValueMul(0) * C.TIER_VALUE_NORM - 1) < 0.02, 'tier value norm keeps the luck-0 economy neutral');
const r = new RNG(42), d = {};
for (let i = 0; i < 20000; i++) { const t = rollTier(r, { luck: 0 }); d[t] = (d[t] || 0) + 1; }
console.log('      tier distribution (luck 0, 20k):', JSON.stringify(d));
ok(d.common > 11000 && d.common < 12600 && d.mythic > 0, 'tier roll distribution');
if (fails) { console.error(fails + ' failed'); process.exit(1); } else console.log('all inventory core tests passed');
