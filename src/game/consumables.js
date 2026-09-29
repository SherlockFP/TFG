// CONSUMABLES (wave 5, "unify"): ONE table that documents what every consumable heals and feeds, and the rules that keep the two food systems consistent.
// Pure (no three / DOM / game access), node-tested by tools/harness/consumables.test.mjs. Docs: docs/wave5/unify.md.
//
// THE FOOD RULE (owner, wave 5):
//   * PACKAGED food (food module, fd_*)  = a small snack: a little instant heal or a short regen (<= SNACK_CAP HP in total) and a little hunger. Drinks / booze heal nothing.
//   * COOKED meals (survival module, sv_d_*) = the real healing (6-100 HP by ingredients x quality) + hunger + a buff. Cooking always beats eating the parts raw.
//   * HERBS / raw meat / raw fish are FOOD too: eaten raw they are a token bite (RAW.heal), cooked they are the ingredients of a meal.
//   * MEDICINE (medkit, trauma kit) is the one healing item that is not food: the emergency button, sold / crafted, never found as "food".
// The numbers themselves stay where they were authored (food_data.js FOODS / BUFFS, survival_data.js PLANTS / INGREDIENTS / MAINS / QUAL / RAW); this file only
// READS them into rows and checks them, so the table can never drift from the game.
import { FOODS, BUFFS, MEAT, cakeDuration } from './food_data.js';
import { INGREDIENTS, PLANTS, RAW, QUAL, MAINS, MAIN_IDS, HUNGER, resolveDish, DISH_ITEMS, RAW_ITEMS, POTION_ITEMS, isEdible } from './survival_data.js';

export const RULES = {
  snackCap: 24,        // packaged food: instant + regen HP in total (the Pizza Box is the biggest snack)
  partyCap: 45,        // the shared Party Cake (found only, epic): 15 instant + 0.2 HP/s for up to 150 s
  snackHunger: 24,     // hunger a packaged item may feed
  drinkHunger: 3,
  rawHeal: RAW.heal,   // a raw herb / raw meat / raw fish bite
  cookedVsSnack: 1.0,  // the AVERAGE cooked 2-ingredient meal must beat the biggest snack by this factor ...
  cookedVsSnack3: 2.0, // ... and the average 3-ingredient meal by this one
};
/** the one non-food heal (items.js medkit, recipes.js craft_traumakit) */
export const MEDICINE = { medkit: { name: 'Medkit', heal: 60, src: 'store / craft / loot' }, craft_traumakit: { name: 'Trauma Kit', heal: 100, src: 'craft (medkit + chemicals + cloth)' } };

const regenOf = (buffs) => (buffs || []).reduce((n, [id, sec]) => n + (BUFFS[id]?.hps || 0) * sec, 0);
const r1 = (v) => Math.round(v * 10) / 10;

/** rows for the packaged items: { id, cls, name, heal (instant + regen, worst case), instant, regen, hunger, src } */
export function packagedRows() {
  const out = [];
  for (const [id, f] of Object.entries(FOODS)) {
    let cls = f.kind === 'food' ? 'snack' : 'drink', instant = f.hp || 0, regen = regenOf(f.buffs);
    if (f.special === 'cake') { cls = 'party'; regen += (BUFFS.f_cake.hps || 0) * cakeDuration(99); }
    if (f.special === 'meat') { cls = 'gamble'; regen += Math.max(...MEAT.map((m) => (BUFFS[m.id].hps || 0) * m.sec)); }
    out.push({ id, cls, name: f.name, instant, regen: r1(regen), heal: r1(instant + regen), hunger: f.hunger ?? null, stam: f.stam || 0, cookable: !!INGREDIENTS[id], src: f.price ? 'store / loot' : 'found' });
  }
  return out;
}
/** raw ingredients: herbs (plants), raw meat, raw fish */
export function rawRows() {
  const out = [];
  for (const id of Object.keys(INGREDIENTS)) {
    if (FOODS[id]) continue;   // fd_meat: eaten through the food module (gamble row) AND cookable as an ingredient
    const I = INGREDIENTS[id], plant = /^sv_p_/.test(id);
    const edible = isEdible(id);   // raw fish cannot be eaten raw at all: cook-only
    out.push({ id, cls: plant ? 'herb' : 'raw', name: (RAW_ITEMS[id]?.name) || id, heal: edible ? RAW.heal : 0, hunger: edible ? (I.meat ? RAW.hunger : RAW.hunger + 1) : 0, ingredientHeal: I.heal, ingredientNutri: I.nutri, edible, cookOnly: !edible });
  }
  return out;
}
/** cooked meals by ingredient count at COOKED quality: { n, min, avg, max heal, hMin, hMax hunger } (every 1-3 ingredient combination) */
export function mealStats() {
  const ids = Object.keys(INGREDIENTS), acc = { 1: [], 2: [], 3: [] };
  for (const a of ids) {
    acc[1].push(resolveDish([a]));
    for (const b of ids) { acc[2].push(resolveDish([a, b])); for (const c of ids) acc[3].push(resolveDish([a, b, c])); }
  }
  const out = {};
  for (const k of [1, 2, 3]) {
    const h = acc[k].map((r) => r.heal), u = acc[k].map((r) => r.hunger);
    out[k] = { n: k, count: h.length, min: Math.min(...h), avg: r1(h.reduce((a, b) => a + b, 0) / h.length), max: Math.max(...h), hMin: Math.min(...u), hMax: Math.max(...u) };
  }
  return out;
}
/** does cooking beat eating the parts raw? (cooked heal of every 1-3 ingredient combination >= the raw bites of the same items) */
export function cookingBeatsRaw() {
  const ids = Object.keys(INGREDIENTS);
  let bad = 0, total = 0;
  const chk = (list) => { total++; if (resolveDish(list).heal < RAW.heal * list.length) bad++; };
  for (const a of ids) { chk([a]); for (const b of ids) { chk([a, b]); for (const c of ids) chk([a, b, c]); } }
  return { bad, total };
}
/** the whole table: packaged + raw + meal stats + medicine + potions (no heal) */
export function consumableTable() {
  return {
    packaged: packagedRows(), raw: rawRows(), meals: mealStats(), qualities: QUAL.map((q) => ({ id: q.id, tier: q.tier, heal: q.heal, hunger: q.hunger })),
    mains: MAIN_IDS.map((m) => ({ id: m, name: MAINS[m].name, mul: MAINS[m].mul, hunger: MAINS[m].hunger })),
    medicine: Object.entries(MEDICINE).map(([id, m]) => ({ id, cls: 'medicine', ...m })),
    potions: Object.keys(POTION_ITEMS).map((id) => ({ id, cls: 'potion', heal: 0 })),
    dishes: Object.keys(DISH_ITEMS).length, hunger: { max: HUNGER.max, start: HUNGER.start, fullAt: HUNGER.fullAt, hungryAt: HUNGER.hungryAt },
  };
}
/** rule violations (empty = the two food systems agree). `medItems` = { id: heal } read from the real item tables by the caller (optional). */
export function checkConsumables(medItems = null) {
  const v = [], T = consumableTable();
  let best = 0;
  for (const r of T.packaged) {
    if (r.hunger === null || !Number.isInteger(r.hunger) || r.hunger < 0) v.push(`${r.id}: no explicit hunger value`);
    if (r.cls === 'snack' || r.cls === 'gamble') { best = Math.max(best, r.heal); if (r.heal > RULES.snackCap) v.push(`${r.id}: snack heals ${r.heal} HP (> ${RULES.snackCap})`); if (r.hunger > RULES.snackHunger) v.push(`${r.id}: hunger ${r.hunger} too big for a snack`); }
    if (r.cls === 'party' && r.heal > RULES.partyCap) v.push(`${r.id}: party food heals ${r.heal} HP (> ${RULES.partyCap})`);
    if (r.cls === 'drink' && (r.heal > 0 || r.hunger > RULES.drinkHunger)) v.push(`${r.id}: drinks do not heal / feed (${r.heal} HP, hunger ${r.hunger})`);
  }
  for (const r of T.raw) {
    if (r.heal > RULES.rawHeal) v.push(`${r.id}: raw bite heals ${r.heal}`);
    if (r.ingredientHeal <= RULES.rawHeal) v.push(`${r.id}: an ingredient must be worth more cooked than raw`);
    if (r.cls === 'herb' && !r.edible) v.push(`${r.id}: herbs are food and must be edible raw`);
    if (!r.edible && !/^fish_/.test(r.id)) v.push(`${r.id}: only raw fish may be cook-only`);
    if (r.heal >= best) v.push(`${r.id}: a raw bite must not out-heal a snack`);
  }
  if (T.meals[2].avg <= best * RULES.cookedVsSnack) v.push(`avg cooked 2-ingredient meal ${T.meals[2].avg} does not beat the best snack ${best}`);
  if (T.meals[3].avg < best * RULES.cookedVsSnack3) v.push(`avg cooked 3-ingredient meal ${T.meals[3].avg} < ${RULES.cookedVsSnack3} x best snack ${best}`);
  const cb = cookingBeatsRaw(); if (cb.bad) v.push(`${cb.bad} of ${cb.total} recipes heal less than eating the parts raw`);
  for (const q of T.qualities) if (q.id === 'burnt' && !(q.heal < 1)) v.push('burnt food must heal less than cooked');
  if (medItems) for (const [id, m] of Object.entries(MEDICINE)) if (medItems[id] !== m.heal) v.push(`${id}: table says ${m.heal}, item says ${medItems[id]}`);
  return v;
}
