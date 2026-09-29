// Node test for the pure parts of FOOD & DRINKS (no browser):  node tools/harness/food.test.mjs
// Effect table, buff stat maths, drunk stacking / expiry / bands, slurred chat, cheers detection, table meals, deterministic placement,
// model + translation coverage.
import fs from 'fs';
import {
  FOODS, FOOD_IDS, BUFFS, DRUNK_IDS, DRUNK, MEAT, CHEERS, TABLE, CAKE_RADIUS, MACHINE_STOCK, VEND_TABLE, TABLE_SPOTS, FOOD_RECIPES,
  applyBuffStats, rollMeat, cakeDuration, liveStacks, addStack, drunkLevel, drunkBand, drunkEffects, slurText, detectCheers, tableWellFed,
  planFoodSpots, vendPick, lootByTheme, isDrinkType, TR, RU,
} from '../../src/game/food_data.js';
import { FOOD_MODELS, createTable, createMachine } from '../../src/models/food.js';

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const seq = (arr) => { let i = 0; return () => arr[i++ % arr.length]; };
const base = () => ({ speedMul: 1, staminaRegen: 16, armor: 0, maxHp: 100, meleeMul: 1, rangedMul: 1, scanRange: 22 });

// ---- item table
ok(FOOD_IDS.length === 14, 'fourteen consumables (7 food, 4 drinks, 3 booze) -> ' + FOOD_IDS.length);
const kinds = { food: 0, drink: 0, booze: 0 };
for (const id of FOOD_IDS) {
  const d = FOODS[id];
  kinds[d.kind]++;
  ok(/^fd_[a-z]+$/.test(id), `${id}: id format`);
  ok(['food', 'drink', 'booze'].includes(d.kind), `${id}: kind`);
  ok(['common', 'uncommon', 'rare', 'epic'].includes(d.tier), `${id}: tier`);
  ok(d.use >= 1 && d.use <= 3, `${id}: use time ${d.use}`);
  ok(Array.isArray(d.value) && d.value[0] > 0 && d.value[1] >= d.value[0], `${id}: sell value`);
  ok(d.tip && d.name && d.weight > 0, `${id}: name / tip / weight`);
  ok(d.price === 0 || (d.price >= 8 && d.price <= 80), `${id}: price ${d.price}`);
  for (const [b, sec] of d.buffs || []) { ok(BUFFS[b], `${id}: buff ${b} exists`); ok(sec >= 20 && sec <= 200, `${id}: buff ${b} lasts ${sec}s`); }
  if (d.kind === 'booze') ok(d.booze && d.booze.pw >= 1 && d.booze.sec >= 60 && d.booze.sec <= 180, `${id}: booze lasts 1-3 min (${d.booze?.sec})`);
  if (d.special === 'cake') ok(d.price === 0 && d.tier === 'epic', 'party cake is a found item');
  if (d.special === 'meat') ok(d.price === 0, 'mystery meat is a drop only');
  ok(isDrinkType(id) === (d.kind !== 'food'), `${id}: isDrinkType`);
  for (const [th, w] of Object.entries(d.loot || {})) ok(['factory', 'mansion', 'mineshaft', 'office', 'backrooms', 'serverfarm', 'sewer', 'hospital'].includes(th) && w > 0, `${id}: loot theme ${th}`);
}
ok(kinds.food === 7 && kinds.drink === 4 && kinds.booze === 3, 'kind counts ' + JSON.stringify(kinds));
ok(FOODS.fd_lager.booze.pw < FOODS.fd_raki.booze.pw && FOODS.fd_raki.booze.pw < FOODS.fd_vodka.booze.pw, 'booze strength lager < raki < vodka');
ok(FOODS.fd_mega.fizzy && FOODS.fd_glitch.fizzy && FOODS.fd_lager.fizzy && !FOODS.fd_coffee.fizzy, 'fizzy drinks burp');
ok(FOODS.fd_pizza.hp === 12 && FOODS.fd_pizzabox.hp === 24 && FOODS.fd_bar.stam === 45, 'instant effects');
// loot tables
const loot = lootByTheme();
ok(Object.keys(loot).length >= 6 && loot.office.some((e) => e[0] === 'fd_noodles'), 'loot by theme');

// ---- models / translations cover every id
for (const id of FOOD_IDS) {
  const m = FOOD_MODELS[id]?.();
  let meshes = 0; m?.traverse?.((o) => { if (o.isMesh) meshes++; });
  ok(meshes >= 3 && meshes <= 40, `${id}: model has ${meshes} meshes`);
  ok(TR[FOODS[id].name] && RU[FOODS[id].name], `${id}: name translated`);
  ok(TR[FOODS[id].tip] && RU[FOODS[id].tip], `${id}: tip translated`);
}
for (const [id, b] of Object.entries(BUFFS)) {
  ok(TR[b.name] && RU[b.name], `${id}: name translated`);
  ok(TR[b.desc] && RU[b.desc], `${id}: desc translated`);
  ok(/^[A-Z]{3}$/.test(b.glyph) && /^#[0-9a-f]{6}$/i.test(b.color), `${id}: glyph / colour`);
  ok(typeof b.good === 'boolean', `${id}: good flag`);
}
for (const k of Object.keys(TR)) ok(RU[k], `Russian has "${k}"`);
for (const k of Object.keys(RU)) ok(TR[k], `Turkish has "${k}"`);
{
  const table = createTable(), vend = createMachine('vend'), fridge = createMachine('fridge');
  ok(table.userData.colliders.length === 5, 'table + 4 stool colliders');
  ok(vend.userData.colliders.length === 1 && fridge.userData.size.h > 1.5, 'machines');
}
ok(TABLE_SPOTS.length >= 3 && TABLE_SPOTS.every(([x, z]) => Math.abs(x) < 6.2 && Math.abs(z) < 2.6), 'table spots are inside the ship');

// ---- buffs: stats table
{
  const s = applyBuffStats(BUFFS.f_mega, base());
  ok(near(s.speedMul, 1.3) && near(s.staminaRegen, 24), 'Mega Engagement: +30% speed, +50% stamina regen');
  const c = applyBuffStats(BUFFS.f_crash, base());
  ok(near(c.speedMul, 0.8) && near(c.staminaRegen, 9.6), 'The Crash: -20% speed, -40% regen');
  ok(!BUFFS.f_mega.good === false && BUFFS.f_crash.good === false, 'crash is a debuff');
  const k = applyBuffStats(BUFFS.f_coffee, base());
  ok(k.scanRange === 31 && near(k.staminaRegen, 17.6), 'Doomscroll Coffee: scan +40%');
  const g = applyBuffStats(BUFFS.f_cringe, base());
  ok(near(g.armor, 0.06), 'Cringe Juice: 6% damage reduction');
  const f = applyBuffStats(BUFFS.f_full, base());
  ok(f.maxHp === 108, 'Full Belly +8 max HP');
  const r = applyBuffStats(BUFFS.f_meat_rage, base());
  ok(near(r.meleeMul, 1.2) && near(r.rangedMul, 1.2), 'Meat Sweats +20% damage');
  const w = applyBuffStats(BUFFS.f_wellfed, base());
  ok(w.maxHp === 110 && near(w.speedMul, 1.03), 'Well Fed');
  ok(applyBuffStats(null, base()).speedMul === 1, 'null def is a no-op');
  ok(BUFFS.f_noodles.hps === 0.5 && BUFFS.f_ramen.hps > BUFFS.f_noodles.hps && BUFFS.f_cake.hps === 0.6, 'regen numbers');
  // no buff can make you invulnerable / immobile
  for (const [id, b] of Object.entries(BUFFS)) {
    const st = applyBuffStats(b, base());
    ok(st.speedMul >= 0.75 && st.speedMul <= 1.35, `${id}: speed stays sane (${st.speedMul})`);
    ok(st.armor <= 0.1, `${id}: armor stays small (${st.armor})`);
  }
}

// ---- mystery meat / cake
{
  const goods = MEAT.filter((m) => BUFFS[m.id].good), bads = MEAT.filter((m) => !BUFFS[m.id].good);
  ok(goods.length >= 2 && bads.length >= 2, 'meat has good and bad outcomes');
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(rollMeat(() => (i + 0.5) / 200).id);
  ok(seen.size === MEAT.length, 'every meat outcome is reachable');
  ok(MEAT.every((m) => BUFFS[m.id] && m.sec >= 30 && m.sec <= 90), 'meat durations');
  ok(cakeDuration(1) === 60 && cakeDuration(2) === 90 && cakeDuration(4) === 150 && cakeDuration(9) === 150 && cakeDuration(0) === 60, 'cake duration grows with guests, capped');
  ok(CAKE_RADIUS === 8, 'cake radius');
}

// ---- drunk stacking / expiry / bands
{
  let st = [];
  ok(drunkLevel(liveStacks(st, 0)) === 0 && drunkBand(0, 0) === 0, 'sober');
  st = addStack(st, 1, 120, 0);
  ok(st.length === 1 && drunkBand(drunkLevel(st), 1) === 1, 'one lager = Tipsy');
  st = addStack(st, 1.25, 150, 10);
  ok(st.length === 2 && near(drunkLevel(st), 2.25) && drunkBand(drunkLevel(st), 2) === 2, 'lager + raki = Drunk');
  st = addStack(st, 1.5, 180, 20);
  ok(st.length === 3 && drunkBand(drunkLevel(st), 3) === 3, 'three drinks = Hammered');
  st = addStack(st, 1, 120, 30);
  ok(drunkBand(drunkLevel(st), 4) === 4, 'four drinks = Legless');
  // expiry, oldest first
  ok(liveStacks(st, 119).length === 4 && liveStacks(st, 121).length === 3, 'first lager expires at 120 s');
  ok(liveStacks(st, 151).length === 2 && liveStacks(st, 171).length === 1 && liveStacks(st, 201).length === 0, 'raki (10+150) and vodka (20+180) expire later');
  ok(liveStacks(st, 400).length === 0, 'everything expires within 3.5 minutes');
  // cap
  let big = [];
  for (let i = 0; i < 12; i++) big = addStack(big, 1, 100 + i, 0);
  ok(big.length === DRUNK.maxStacks, 'stack cap ' + DRUNK.maxStacks);
  ok(Math.min(...big.map((s) => s.until)) === 104, 'the drink ending soonest is dropped first');
  ok(addStack(st, 1, 60, 500).length === 1, 'expired stacks are dropped when adding');
  // effects scale up with each drink
  const fx = [0, 1, 2, 3, 4, 5].map((c) => drunkEffects(c * 1.1, c));
  ok(fx[0].level === 0 && fx[0].roll === 0 && fx[0].slur === 0 && fx[0].courage === 0 && fx[0].hiccupEvery === 0 && fx[0].blackout === 0, 'sober has no effects');
  for (let c = 1; c < 6; c++) {
    ok(fx[c].roll > fx[c - 1].roll && fx[c].slur >= fx[c - 1].slur && fx[c].drift > fx[c - 1].drift, `sway / slur / drift grow with drink ${c}`);
    ok(fx[c].lagRate < fx[c - 1].lagRate || fx[c - 1].lagRate === 999, `turning gets more delayed with drink ${c}`);
    ok(fx[c].courage >= fx[c - 1].courage && fx[c].courage <= 0.55, `courage caps (${fx[c].courage})`);
    ok(fx[c].armor <= 0.09, 'booze armor stays small');
  }
  ok(fx[1].courage > 0.15 && fx[1].armor === 0.03, 'one drink already gives courage + 3% armor');
  ok(fx[1].hiccupEvery === 0 && fx[2].hiccupEvery === 0 && fx[1].blackout === 0 && fx[2].blackout === 0, 'no hiccups / blackout below 3 drinks');
  ok(fx[3].hiccupEvery > 0 && fx[3].blackout > 0 && fx[5].hiccupEvery < fx[3].hiccupEvery && fx[5].blackout > fx[3].blackout, '3+ drinks: hiccups + blackout risk, worse with more');
  ok(fx[5].blackout <= 0.4 && fx[5].hiccupEvery >= DRUNK.hiccupMin, 'blackout risk and hiccup rate are bounded (funny, not lethal)');
  ok(DRUNK.blackoutDur <= 3 && DRUNK.blackoutCooldown >= 30, 'blackouts are short and rare');
  ok(fx[5].speed >= -0.12 && fx[5].lagRate >= 5, 'speed / turning penalties are capped');
  ok(DRUNK_IDS.length === 4 && DRUNK_IDS.every((id) => BUFFS[id].drunk), 'four drunk bands');
}

// ---- slurred chat
{
  ok(slurText('hello there', 0, () => 0) === 'hello there', 'sober chat untouched');
  ok(slurText('/help me', 3, () => 0) === '/help me', 'commands untouched');
  ok(slurText('', 2, () => 0) === '', 'empty text');
  const slurred = slurText('so this is a super message', 3, () => 0.0, 3);
  ok(slurred !== 'so this is a super message' && slurred.length > 'so this is a super message'.length, 'drunk chat is scrambled: ' + slurred);
  ok(slurred.endsWith('*hic*'), '3+ drinks add a hiccup');
  ok(slurText('so this is a super message', 3, () => 0.99, 3) === 'so this is a super message', 'high rolls leave the text alone');
  ok(slurText('so this is a super message', 3, () => 0.05, 1) !== 'so this is a super message' && slurText('so this is a super message', 0.2, () => 0.05, 1) === 'so this is a super message', 'more drinks slur more');
  ok(slurText('x'.repeat(300), 3, () => 0, 3).length <= 200, 'never longer than a chat line');
  const a = slurText('cheers my friends', 2, seq([0.05, 0.4, 0.9, 0.2, 0.7, 0.01]), 2), b = slurText('cheers my friends', 2, seq([0.05, 0.4, 0.9, 0.2, 0.7, 0.01]), 2);
  ok(a === b, 'deterministic for a fixed rnd');
}

// ---- cheers
{
  const ev = (id, t, x, z = 0) => ({ id, t, p: [x, 0, z] });
  ok(detectCheers([], 0) === null, 'no drinks, no cheers');
  ok(detectCheers([ev('a', 0, 0)], 0) === null, 'one drinker is not a cheers');
  const two = detectCheers([ev('a', 10, 0), ev('b', 11.5, 3)], 12);
  ok(two && two.length === 2 && two.includes('a') && two.includes('b'), 'two drinkers 3 m apart, 1.5 s apart: cheers');
  ok(detectCheers([ev('a', 10, 0), ev('b', 11.5, 4.5)], 12) === null, 'more than 4 m apart: no cheers');
  ok(detectCheers([ev('a', 10, 0), ev('b', 13.6, 1)], 14) === null, 'more than 3 s apart: no cheers');
  ok(detectCheers([ev('a', 10, 0), ev('b', 13, 1)], 13) !== null, 'exactly 3 s apart still counts');
  ok(detectCheers([ev('a', 10, 0), ev('a', 10.5, 1)], 11) === null, 'the same player twice is not a cheers');
  const three = detectCheers([ev('a', 10, 0), ev('b', 10.5, 2), ev('c', 11, 1), ev('d', 11, 30)], 11.5);
  ok(three && three.length === 3 && !three.includes('d'), 'biggest nearby group wins, far drinker excluded');
  ok(detectCheers([ev('a', 0, 0), ev('b', 1, 1)], 30) === null, 'old drinks are ignored');
  ok(CHEERS.radius === 4 && CHEERS.window === 3, 'cheers rule: 4 m / 3 s');
  const y = detectCheers([{ id: 'a', t: 1, p: [0, 0, 0] }, { id: 'b', t: 1, p: [0, 3.5, 0] }], 1.5);
  ok(y === null || y.length === 2, 'vertical distance counts (3.5 m up is still within 4 m)');
}

// ---- ship table: eating together
{
  ok(tableWellFed([], 0, 3).length === 0, 'nobody ate');
  ok(tableWellFed([{ id: 'a', t: 0 }], 5, 3).length === 0, 'one player eating alone in a crew does not count');
  ok(tableWellFed([{ id: 'a', t: 0 }], 5, 1).length === 1, 'a solo player gets Well Fed');
  const w = tableWellFed([{ id: 'a', t: 0 }, { id: 'b', t: 12 }], 15, 3);
  ok(w.length === 2, 'two players eating within 30 s: Well Fed for both');
  ok(tableWellFed([{ id: 'a', t: 0 }, { id: 'b', t: 40 }], 41, 3).length === 0, 'meals more than 30 s apart do not count');
  ok(tableWellFed([{ id: 'a', t: 0 }, { id: 'a', t: 2 }], 3, 3).length === 0, 'the same player twice does not count');
  ok(TABLE.wellFedSec === 240 && TABLE.radius === 3, 'table numbers');
}

// ---- world placement: deterministic, sane
{
  const spots = [];
  for (let i = 0; i < 40; i++) spots.push({ x: (i % 8) * 9 - 30, y: 0, z: Math.floor(i / 8) * 9 - 18, room: i % 5, type: ['kitchen', 'office', 'lab', 'lounge', 'corridor'][i % 5], dist: 3 + (i % 9) });
  const a = planFoodSpots(spots, 12345), b = planFoodSpots(spots, 12345), c = planFoodSpots(spots, 999);
  ok(JSON.stringify(a) === JSON.stringify(b), 'placement is deterministic for one seed');
  let variety = 0;
  for (let s = 1; s <= 60; s++) { const p = planFoodSpots(spots, s * 7919); variety += p.machines.length + (p.cake ? 1 : 0); ok(p.machines.length <= 2, 'at most two machines'); for (const m of p.machines) { ok(['vend', 'fridge'].includes(m.kind), 'machine kind'); const sp = spots.find((q) => q.x === m.x && q.z === m.z); ok(sp && sp.type !== 'corridor' && sp.room >= 0 && sp.dist >= 3, 'machine sits in a room, not a corridor'); } if (p.cake) ok(spots.some((q) => q.x === p.cake.x && q.z === p.cake.z && /kitchen|lounge/.test(q.type)), 'cake only in party-ish rooms'); }
  ok(variety > 40 && variety < 200, 'a landing usually has 0-2 machines and sometimes a cake: ' + variety);
  ok(planFoodSpots([], 1).machines.length === 0 && planFoodSpots(null, 1).cake === null, 'no spots, no machines');
  void c;
  // fridge / vending contents
  const seen = { vend: new Set(), fridge: new Set() };
  for (let i = 0; i < 400; i++) { seen.vend.add(vendPick('vend', () => (i + 0.5) / 400)); seen.fridge.add(vendPick('fridge', () => (i + 0.5) / 400)); }
  ok([...seen.vend].every((id) => FOODS[id]) && [...seen.fridge].every((id) => FOODS[id]), 'machine contents are real items');
  ok(seen.vend.size === VEND_TABLE.vend.length && seen.fridge.size === VEND_TABLE.fridge.length, 'every entry can drop');
  ok(VEND_TABLE.fridge.some((e) => e[0] === 'fd_cake'), 'fridges can hold a cake');
  ok(MACHINE_STOCK.vend >= 2 && MACHINE_STOCK.fridge >= 2, 'machines hold a few items');
}

// ---- recipes
{
  const known = new Set([...FOOD_IDS, 'comp_chem', 'comp_coolant', 'comp_cloth', 'comp_crystal', 'comp_battery', 'comp_circuit', 'comp_fuse', 'comp_cable']);
  for (const r of FOOD_RECIPES) {
    ok(FOODS[r.out] && known.has(r.out), `${r.id}: output is a food item`);
    ok(r.in.every(([id, n]) => known.has(id) && n >= 1), `${r.id}: inputs are known ids`);
    ok(r.cat === 'survival' && r.n >= 1 && r.time > 0, `${r.id}: recipe fields`);
  }
  ok(FOOD_RECIPES.every((r) => FOODS[r.out].price >= 0), 'recipes exist for sold or crafted foods');
}

// ---- source hygiene: placement uses the seeded RNG only, every net type is prefixed fd
{
  const data = fs.readFileSync(new URL('../../src/game/food_data.js', import.meta.url), 'utf8');
  const plan = data.slice(data.indexOf('export function planFoodSpots'), data.indexOf('/** Ship table candidates'));
  ok(!/Math\.random/.test(plan), 'planFoodSpots never touches Math.random');
  const src = fs.readFileSync(new URL('../../src/game/food.js', import.meta.url), 'utf8');
  const types = new Set([...src.matchAll(/(?:on_|request|send|broadcast|sendTo)\('([a-z]+)'/g)].map((m) => m[1]));
  for (const ty of types) ok(/^(fd|fdfx|fds)$/.test(ty) || ['it', 'pst'].includes(ty), `net type ${ty} is fd-prefixed (or a stock type)`);
  ok(/HOST_ONLY\.add\('fdfx'\)/.test(src), 'fdfx is host-only');
  ok(/this\.useModule\('food', installFood\)/.test(fs.readFileSync(new URL('../../src/game/game.js', import.meta.url), 'utf8')), 'game.js installs the module');
}

console.log(`food.test: ${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
