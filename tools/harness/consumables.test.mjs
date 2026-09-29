// UNIFY wave 5: one consumable table + the food rule. node tools/harness/consumables.test.mjs
//   packaged food = small snack, cooked meals = the real healing, herbs = food, medicine = the one non-food heal, hunger explicit everywhere
import assert from 'node:assert/strict';
import * as C from '../../src/game/consumables.js';
import { FOODS, BUFFS } from '../../src/game/food_data.js';
import * as S from '../../src/game/survival_data.js';
import { ITEMS } from '../../src/game/items.js';
import '../../src/game/recipes.js';

let n = 0, fails = 0;
const ok = (name, fn) => { n++; try { fn(); } catch (e) { fails++; console.log('FAIL', name, '\n   ', String(e.message).split('\n').slice(0, 5).join('\n    ')); } };

ok('the rule check finds no contradiction in the real tables (incl. medkit / trauma kit item values)', () => {
  const v = C.checkConsumables({ medkit: ITEMS.medkit?.heal, craft_traumakit: ITEMS.craft_traumakit?.heal });
  assert.deepEqual(v, []);
});
ok('the check really catches a broken table (a 32 HP ramen, a healing beer, a raw bite that beats a snack)', () => {
  const ramen = BUFFS.f_ramen, dur = FOODS.fd_ramen.buffs[0][1];
  FOODS.fd_ramen.buffs[0][1] = 40;
  try { assert.ok(C.checkConsumables().some((s) => /fd_ramen: snack heals 32/.test(s))); } finally { FOODS.fd_ramen.buffs[0][1] = dur; }
  const hp = FOODS.fd_lager.hp; FOODS.fd_lager.hp = 10;
  try { assert.ok(C.checkConsumables().some((s) => /fd_lager: drinks do not heal/.test(s))); } finally { if (hp === undefined) delete FOODS.fd_lager.hp; else FOODS.fd_lager.hp = hp; }
  const rh = S.RAW.heal; S.RAW.heal = 30;
  try { assert.ok(C.checkConsumables().length > 0); } finally { S.RAW.heal = rh; }
  assert.equal(ramen, BUFFS.f_ramen);
  assert.deepEqual(C.checkConsumables(), []);
});
ok('every packaged item has a table row with an explicit hunger; snacks <= cap, drinks heal nothing', () => {
  const rows = C.packagedRows();
  assert.equal(rows.length, Object.keys(FOODS).length);
  for (const r of rows) { assert.ok(Number.isInteger(r.hunger) && r.hunger >= 0, r.id); assert.equal(r.hunger, FOODS[r.id].hunger); }
  for (const r of rows.filter((x) => x.cls === 'snack')) assert.ok(r.heal <= C.RULES.snackCap, r.id);
  for (const r of rows.filter((x) => x.cls === 'drink')) assert.equal(r.heal, 0, r.id);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by.fd_pizza.heal, 12); assert.equal(by.fd_pizzabox.heal, 24); assert.equal(by.fd_noodles.heal, 15); assert.equal(by.fd_ramen.heal, 20);
  assert.equal(by.fd_cake.cls, 'party'); assert.ok(by.fd_cake.heal <= C.RULES.partyCap); assert.equal(by.fd_meat.cls, 'gamble');
  assert.ok(rows.filter((x) => x.cls === 'snack').length >= 5);
});
ok('the survival module reads a packaged item hunger from the table (no hard-coded 12 / 3)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../src/game/survival.js', import.meta.url), 'utf8');
  assert.ok(/fd\?\.hunger \?\?/.test(src));
});
ok('herbs and raw meat / fish are food: edible, a token bite, a little hunger', () => {
  const raw = C.rawRows();
  assert.equal(raw.filter((r) => r.cls === 'herb').length, Object.keys(S.PLANTS).length);
  assert.ok(raw.filter((r) => r.cls === 'raw').length >= 6, 'raw meat + fish');
  for (const r of raw) {
    if (/^fish_/.test(r.id)) { assert.ok(r.cookOnly && r.heal === 0, r.id + ' raw fish is cook-only'); continue; }
    assert.equal(r.heal, S.RAW.heal); assert.ok(r.edible, r.id); assert.ok(r.hunger >= 5 && r.hunger <= 6); assert.ok(r.ingredientHeal > r.heal, r.id + ' cooking is worth it');
  }
});
ok('cooked meals are the real healing: avg 2-ingredient meal > best snack, avg 3-ingredient >= 2 x best snack, cooking always beats raw', () => {
  const m = C.mealStats(), best = Math.max(...C.packagedRows().filter((r) => r.cls === 'snack').map((r) => r.heal));
  assert.ok(m[2].avg > best && m[3].avg >= 2 * best, JSON.stringify(m));
  assert.ok(m[3].max <= 100 && m[1].min >= 6);
  assert.deepEqual(C.cookingBeatsRaw().bad, 0);
  const q = S.QUAL, cooked = q.find((x) => x.id === 'cooked'), perfect = q.find((x) => x.id === 'perfect'), burnt = q.find((x) => x.id === 'burnt');
  assert.ok(burnt.heal < cooked.heal && cooked.heal < perfect.heal);
});
ok('medicine is the only non-food heal: medkit 60, trauma kit 100, both above any snack', () => {
  assert.equal(ITEMS.medkit.heal, C.MEDICINE.medkit.heal); assert.equal(ITEMS.craft_traumakit.heal, C.MEDICINE.craft_traumakit.heal);
  const best = Math.max(...C.packagedRows().filter((r) => r.cls === 'snack').map((r) => r.heal));
  for (const m of Object.values(C.MEDICINE)) assert.ok(m.heal > best);
  // nothing else in the item table heals (potions / tonics give buffs, not HP)
  const healers = Object.values(ITEMS).filter((it) => it.heal > 0).map((it) => it.id);
  assert.deepEqual(healers.sort(), ['craft_traumakit', 'medkit'].sort(), 'unexpected healing items: ' + healers.join());
  for (const p of C.consumableTable().potions) assert.equal(p.heal, 0);
});
ok('table shape: every dish / herb / packaged / medicine id is listed once', () => {
  const T = C.consumableTable();
  assert.equal(T.dishes, S.MAIN_IDS.length * S.BONUS_IDS.length);
  const ids = [...T.packaged, ...T.raw, ...T.medicine, ...T.potions].map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(T.qualities.length, 4); assert.equal(T.mains.length, 4);
});

console.log(`consumables: ${n} groups, ${fails} failed`);
if (fails) process.exit(1);
