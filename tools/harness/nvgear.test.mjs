// nvgear: goggles / cell are registered + buyable, battery math, charger fixture stays in shiplayout. Run: node tools/harness/nvgear.test.mjs
import assert from 'node:assert/strict';
import * as C from '../../src/game/nvgear_core.js';
import '../../src/game/nvgear.js';
import { ITEMS, STORE_ITEMS } from '../../src/game/items.js';
import { catalogEntries } from '../../src/game/shop.js';
import * as L from '../../src/world/shiplayout.js';
import { setLang, t } from '../../src/core/i18n.js';

let fail = 0;
const ok = (n, fn) => { try { fn(); console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n    ' + e.message); } };

ok('goggles + cell are registered, battery-limited and in the store', () => {
  for (const id of ['nvg1', 'nvg2', 'nvcell']) { assert.ok(ITEMS[id], id); assert.ok(STORE_ITEMS.includes(id), id + ' in STORE_ITEMS'); }
  assert.equal(ITEMS.nvg1.battery, 90); assert.ok(ITEMS.nvg2.battery > ITEMS.nvg1.battery && ITEMS.nvg2.price > ITEMS.nvg1.price);
  const ids = catalogEntries().map((e) => e.id);
  for (const id of ['nvg1', 'nvg2', 'nvcell']) assert.ok(ids.includes(id), id + ' in shop catalogue');
});
ok('dazzle: Mk II is shorter, capped; cold drains more', () => {
  assert.ok(C.dazzleSeconds(1, 0.5) < C.dazzleSeconds(1, 1)); assert.ok(C.dazzleSeconds(1, 1) <= 3.2);
  assert.equal(C.drainMul({}), 1); assert.ok(C.drainMul({ cold: true }) > 1);
});
ok('spare cell refills the emptiest item by 60% and clamps', () => {
  assert.equal(C.emptiest([{ battery: 100, cap: 150 }, { battery: 10, cap: 90 }, null]), 1);
  assert.equal(C.emptiest([{ battery: 90, cap: 90 }]), -1);
  assert.equal(C.afterCell(10, 90), 64); assert.equal(C.afterCell(80, 90), 90);
});
ok('TR + RU strings exist', () => {
  setLang('tr'); assert.notEqual(t('Charging...'), 'Charging...'); assert.notEqual(t(C.NV_GOGGLES.nvg1.tip), C.NV_GOGGLES.nvg1.tip);
  setLang('ru'); assert.notEqual(t('Charging...'), 'Charging...'); assert.notEqual(t('Spare Battery Cell'), 'Spare Battery Cell');
  setLang('en');
});
ok('ship charger fixture + standing spot still in shiplayout', () => {
  assert.ok(L.SPOTS.charger && L.DIMS.charger); assert.ok(L.ACCESS.some((a) => a.id === 'charger'));
});
process.exit(fail ? 1 : 0);
