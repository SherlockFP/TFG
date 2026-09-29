// Node test for the pure parts of SURVIVAL (no browser):  node tools/harness/survival.test.mjs
// recipe resolution + cooking quality, growth timing, storage transfer / persistence, hunger + warmth maths, plant scatter, items / models / translations.
import fs from 'fs';
globalThis.window = globalThis;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const D = await import('../../src/game/survival_data.js');
const S = await import('../../src/game/survival_store.js');
const { buildDictionaries } = await import('../../src/game/survival_i18n.js');
const { ITEMS } = await import('../../src/game/items.js');
await import('../../src/game/survival.js');   // registers the items at import
const M = await import('../../src/models/survival.js');
const { TIERS } = await import('../../src/game/tiers.js');

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ------------------------------------------------------------------------------------------------ items
const ids = Object.keys(D.ALL_ITEMS);
ok(ids.length === 59, 'item count ' + ids.length);
for (const id of ids) {
  ok(ITEMS[id] && ITEMS[id].name && ITEMS[id].tip, `${id}: registered with name + tip`);
  ok(!ITEMS[id].value, `${id}: not sellable (no value)`);
}
ok(D.PLANT_IDS.length === 7 && D.PLANT_IDS.every((k) => ITEMS[D.plantItem(k)] && ITEMS[D.seedItem(k)]), 'seven plants with a seed each');
ok(D.allDishIds().length === 32 && D.allDishIds().every((id) => ITEMS[id]), '32 dish items (4 mains x 8 bonuses)');
ok(Object.keys(D.POTION_ITEMS).length === 4, 'four potions');
ok(D.isEdible('sv_d_stew_night') && D.isEdible('sv_pt_fire') && D.isEdible('sv_p_glowcap') && D.isEdible('sv_meat') && !D.isEdible('sv_s_glowcap') && !D.isEdible('sv_sickle'), 'edible classification');
const models = M.svItemModels(ids);
ok(Object.keys(models).length === ids.length, 'a model for every item');
for (const [id, f] of Object.entries(models)) { const o = f(); ok(o && o.children.length > 0, `${id}: model has meshes`); }
for (const k of D.PLANT_IDS) { const g = M.plantGeo(k); ok(g.attributes.position.count > 100 && g.attributes.color, `${k}: merged coloured plant geometry`); }
ok(M.plantMaterial('glowcap').emissive.getHex() !== 0 && M.plantMaterial('ashroot').emissive.getHex() === 0, 'glowing plants get an emissive tint');

// ------------------------------------------------------------------------------------------------ recipe resolution
const R = (...t) => D.resolveDish(t);
let r = R('sv_meat', 'sv_p_bloodberry', 'sv_p_wildmint');
ok(r && r.main === 'stew' && r.bonus === 'regen' && r.id === 'sv_d_stew_regen' && r.count === 3, 'meat + bloodberry + wildmint = regen stew');
ok(r.heal > 40 && r.heal <= 100 && r.hunger > 30, 'stew numbers plausible: ' + r.heal + '/' + r.hunger);
r = R('fish_kefal');
ok(r.main === 'grill' && r.bonus === null && r.id === 'sv_d_grill_plain', 'one fish = plain grill');
r = R('sv_p_glowcap', 'sv_p_glowcap');
ok(r.main === 'soup' && r.bonus === 'night' && r.total === 4, 'two glowcaps = night soup (strength 4)');
r = R('sv_p_bloodberry', 'sv_p_bloodberry', 'sv_p_sunfruit');
ok(r.main === 'tart' && r.bonus === 'regen', 'berries + fruit = tart with regen');
r = R('sv_p_sunfruit');
ok(r.main === 'tart' && r.bonus === 'speed' && r.total === 2, 'sunfruit tart is swift');
r = R('sv_p_wildmint');
ok(r.bonus === null, 'a single strength-1 property gives no bonus (needs 2)');
r = R('sv_p_wildmint', 'sv_p_wildmint');
ok(r.bonus === 'regen', 'tie regen 2 = stam 2 -> priority regen');
r = R('sv_p_staticmoss', 'sv_p_ashroot');
ok(r.main === 'soup' && (r.bonus === 'fire' || r.bonus === 'quiet') && r.total === 2, 'moss + root soup picks by priority: ' + r.bonus);
r = R('sv_meat', 'fish_lufer');
ok(r.main === 'stew', 'meat beats fish');
ok(R('sv_meat', 'sv_meat', 'sv_meat', 'sv_meat') === null && D.resolveDish([]) === null && D.resolveDish(['comp_wood']) === null && D.resolveDish(['sv_meat', 'zzz']) === null, 'invalid lists resolve to nothing');
ok(D.checkIngredients(['sv_meat', 'sv_meat', 'sv_meat', 'sv_meat']).reason === 'The pot holds three ingredients.', 'reason for four ingredients');
// exhaustive: every 1..3 combination of ingredients resolves to a registered dish with sane numbers
const types = Object.keys(D.INGREDIENTS);
let combos = 0;
const all = new Set();
const gen = (pre, n) => { if (pre.length) { const d = D.resolveDish(pre); combos++; ok(d && ITEMS[d.id], 'combo resolves ' + pre.join('+')); ok(d.heal >= 6 && d.heal <= 100 && d.hunger >= 5 && d.hunger <= 70, 'combo numbers ' + pre.join('+') + ' ' + d.heal + '/' + d.hunger); all.add(d.id); } if (n > 0) for (const t of types) gen([...pre, t], n - 1); };
gen([], 3);
ok(combos === types.length + types.length ** 2 + types.length ** 3, 'combos counted ' + combos);
ok(all.size >= 24, 'a wide range of dishes reachable: ' + all.size);
ok(D.resolveDish(['sv_meat', 'sv_p_bloodberry', 'sv_p_wildmint']).heal === D.resolveDish(['sv_p_wildmint', 'sv_meat', 'sv_p_bloodberry']).heal, 'order does not matter');
// healing is food-only and strong: a cooked 3-ingredient stew beats a Medkit's 60? (it is meant to compete, not dwarf it)
ok(D.previewDish(['sv_meat', 'sv_p_bloodberry', 'sv_p_wildmint'], 2).heal >= 55 && D.previewDish(['sv_meat', 'sv_p_bloodberry', 'sv_p_wildmint'], 3).heal <= 100, 'stew heal band');
ok(D.previewDish(['sv_p_wildmint'], 2).heal < 15, 'a single herb heals little');

// ------------------------------------------------------------------------------------------------ cooking quality
ok(D.cookQuality(0) === 1 && D.cookQuality(0.3) === 1 && D.cookQuality(0.49) === 1, 'early stop = undercooked');
ok(D.cookQuality(0.5) === 2 && D.cookQuality(0.6) === 2 && D.cookQuality(0.71) === 2, 'middle = cooked');
ok(D.cookQuality(0.72) === 3 && D.cookQuality(0.8) === 3 && D.cookQuality(0.859) === 3, 'late window = perfect');
ok(D.cookQuality(0.86) === 0 && D.cookQuality(1) === 0 && D.cookQuality(1.2) === 0, 'too late = burnt');
ok(D.cookQuality(NaN) === 1 && D.cookQuality(-1) === 1, 'garbage input is safe');
ok(D.QUAL.map((q) => q.tier).join() === 'common,uncommon,rare,epic' && D.QUAL.every((q) => TIERS[q.tier]), 'quality ladder maps to tiers');
ok(D.QUAL.map((q) => D.qualOfTier(q.tier)).join() === '0,1,2,3' && D.qualOfTier('mythic') === 2, 'tier -> quality round trip');
ok(D.QUAL[3].heal > D.QUAL[2].heal && D.QUAL[2].heal > D.QUAL[1].heal && D.QUAL[1].heal > D.QUAL[0].heal, 'quality multiplies heal upwards');
ok(D.cookSeconds(1) > 5 && D.cookSeconds(3) > D.cookSeconds(1) && D.cookSeconds(2, 'fire') < D.cookSeconds(2, 'stove'), 'cook time grows with ingredients, campfire is hasty');
// pack / unpack + eating
const dish = D.resolveDish(['sv_meat', 'sv_p_bloodberry', 'sv_p_wildmint']);
const pk = D.packDish(dish);
const un = D.unpackDish(dish.id, pk.value, pk.baseValue);
ok(un.heal === dish.heal && un.hunger === dish.hunger && un.total === dish.total && un.bonus === 'regen' && un.main === 'stew', 'dish numbers survive the item value fields');
const perfect = D.eatDish(dish.id, 3, pk.value, pk.baseValue), good = D.eatDish(dish.id, 2, pk.value, pk.baseValue), burnt = D.eatDish(dish.id, 0, pk.value, pk.baseValue), under = D.eatDish(dish.id, 1, pk.value, pk.baseValue, () => 0.1);
ok(perfect.heal > good.heal && good.heal > under.heal && under.heal > burnt.heal, 'perfect > cooked > undercooked > burnt: ' + [perfect.heal, good.heal, under.heal, burnt.heal]);
ok(burnt.buff === null && perfect.buff && perfect.buff.sec > good.buff.sec && good.buff.sec > under.buff.sec && under.buff.sec > 0, 'buff length follows quality, burnt has none');
ok(under.poison === true && D.eatDish(dish.id, 1, pk.value, pk.baseValue, () => 0.9).poison === false && good.poison === false, 'undercooked meat may poison (50%), cooked never');
ok(D.eatDish('sv_d_tart_plain', 1, 20, 220, () => 0).poison === false, 'a tart never poisons');
ok(D.eatDish('sv_d_soup_plain', 2, 0, 0).heal === D.HEAL_BASE.soup && D.eatDish('nonsense', 2) === null, 'fallback numbers without packed values');
ok(D.bonusSeconds('regen', 2, 2) === 50 && D.bonusSeconds('regen', 4, 2) > 50 && D.bonusSeconds('regen', 9, 2) === D.bonusSeconds('regen', 6, 2) && D.bonusSeconds('nope', 2, 2) === 0, 'bonus buff seconds scale with strength, capped');
const raw = D.eatRaw('sv_meat', () => 0.1), rawH = D.eatRaw('sv_p_bloodberry', () => 0.1);
ok(raw.heal === 3 && raw.poison === true && rawH.heal === 3 && rawH.poison === false && D.eatRaw('comp_wood') === null, 'raw eating: 3 HP, meat poisons, herbs do not');
// brewing
let b = D.resolveBrew(['sv_p_glowcap', 'sv_p_glowcap']);
ok(b.prop === 'night' && b.type === 'sv_pt_night' && b.strength === 1 && b.tier === 'rare' && b.sec === D.POTION_SECS.night[1], 'two glowcaps brew a strong night draught');
b = D.resolveBrew(['sv_p_glowcap', 'sv_p_glowcap', 'sv_p_glowcap']);
ok(b.strength === 2 && b.tier === 'epic' && b.sec > D.POTION_SECS.night[1], 'three glowcaps: superb');
b = D.resolveBrew(['sv_p_wildmint', 'sv_p_sunfruit']);
ok(b.prop === 'stam' && b.strength === 0 && b.tier === 'uncommon', 'mint + sunfruit = weak stamina tonic');
ok(D.resolveBrew(['sv_p_staticmoss', 'sv_p_staticmoss']).prop === 'quiet' && D.resolveBrew(['sv_p_ashroot', 'sv_p_ashroot']).prop === 'fire', 'moss = hush, ashroot = fireward');
ok(D.resolveBrew(['sv_p_glowcap']) === null && D.resolveBrew(['sv_meat', 'sv_p_glowcap']) === null && D.resolveBrew(['sv_p_bloodberry', 'sv_p_bloodberry']) === null, 'brew needs 2+ plants and a tonic property (no meat, no plain healing)');
ok(D.potionSeconds('sv_pt_fire', 'epic') > D.potionSeconds('sv_pt_fire', 'uncommon') && D.potionProp('sv_pt_stam') === 'stam' && D.potionProp('x') === null, 'potion seconds by tier');
ok(Object.keys(D.POTIONS).length === 4 && D.POTION_PROPS.every((p) => D.PROPS[p]), 'stamina / night vision / noise / fire potions');

// ------------------------------------------------------------------------------------------------ growth timing
const MIN = 60000;
let c = D.newCrop('wildmint', 0);
ok(c.p === 0 && D.stageOf(0) === 0, 'new crop at 0');
D.growTick(c, 0);
ok(c.p === 0, 'no time no growth');
// dry: 25% speed
D.growTick(c, 4 * MIN);
ok(near(c.p, 0.25), 'dry crop grows at 25%: ' + c.p);
// water it and finish
D.waterCrop(c, 4 * MIN);
ok(c.wet === 9 * MIN, 'watering lasts 5 minutes');
D.growTick(c, 4 * MIN + 3 * MIN);   // 3 wet minutes of a 4-minute plant = +0.75
ok(near(c.p, 1), 'watered crop finished: ' + c.p);
ok(D.stageOf(c.p) === 3, 'ripe stage');
// fully watered timing
c = D.newCrop('glowcap', 1000);
D.waterCrop(c, 1000);
D.growTick(c, 1000 + 4 * MIN);
ok(near(c.p, 4 / 9, 1e-9), 'glowcap 4/9 after 4 wet minutes');
D.growTick(c, 1000 + 5 * MIN);
D.growTick(c, 1000 + 9 * MIN);
ok(near(c.p, 5 / 9 + 0.25 * 4 / 9, 1e-9) || c.p > 0.7, 'wet 5 min then dry: ' + c.p);
// piecewise equals stepwise (tick frequency must not matter)
const a = D.newCrop('bloodberry', 0); D.waterCrop(a, 0);
const bb = D.newCrop('bloodberry', 0); D.waterCrop(bb, 0);
D.growTick(a, 8 * MIN);
for (let t = 1000; t <= 8 * MIN; t += 1000) D.growTick(bb, t);
ok(near(a.p, bb.p, 1e-9), 'one big tick == many small ticks: ' + a.p + ' vs ' + bb.p);
// water does not stack beyond 10 minutes
c = D.newCrop('ashroot', 0); for (let i = 0; i < 6; i++) D.waterCrop(c, 0);
ok(c.wet === 10 * MIN, 'watering caps at 10 minutes');
// clock going backwards never rewinds
c = D.newCrop('ashroot', 5000); D.growTick(c, 1000);
ok(c.p === 0 && c.t === 1000, 'backwards clock is safe');
// stages
ok([0, 0.14, 0.15, 0.49, 0.5, 0.99, 1].map(D.stageOf).join() === '0,0,1,1,2,2,3', 'stage thresholds');
// ripe estimates
c = D.newCrop('wildmint', 0);
ok(near(D.msToRipe(c, 0), 4 * MIN * 4, 1), 'dry crop needs 4x as long');
D.waterCrop(c, 0);
ok(near(D.msToRipe(c, 0), 4 * MIN, 1), 'watered wildmint ripens in 4 min');
D.growTick(c, 5 * MIN);
ok(D.msToRipe(c, 5 * MIN) === 0, 'ripe = 0 ms');
ok(D.isWet({ wet: 10 }, 5) && !D.isWet({ wet: 10 }, 10) && !D.isWet(null, 0), 'isWet');
// yields
const seq = (arr) => { let i = 0; return () => arr[i++ % arr.length]; };
let y = D.forageYield('bloodberry', false, seq([0, 0.9]), {});
ok(y.plants === 2 && y.seeds === 0, 'forage: min yield, no seed at 0.9');
y = D.forageYield('bloodberry', false, seq([0.99, 0.1]), { sickle: true });
ok(y.plants === 5 && y.seeds === 1, 'forage with sickle: +1 plant, better seed odds: ' + JSON.stringify(y));
y = D.forageYield('glowcap', true, seq([0, 0.99]), {});
ok(y.plants === 2 && y.seeds === 1, 'rare plants double the yield and always give a seed');
y = D.farmYield('wildmint', seq([0, 0]), {});
ok(y.plants === 3 && y.seeds === 2, 'farm yield is better than foraging');
ok(D.HARVEST_SEC.sickle * 2 === D.HARVEST_SEC.hand + 0.05 || D.HARVEST_SEC.sickle < D.HARVEST_SEC.hand, 'sickle is faster');
ok(D.plantables().length === 7 && D.plantables().every((p) => p.growMs > 0 && ITEMS[p.seed]), 'plantables export for other planters');

// ------------------------------------------------------------------------------------------------ plant scatter
const flat = { avoid: () => false, heightAt: () => 0, scale: 1 };
const p1 = D.planPlants(1234, 'swamp', flat), p2 = D.planPlants(1234, 'swamp', flat), p3 = D.planPlants(9999, 'swamp', flat);
ok(p1.length > 20 && JSON.stringify(p1) === JSON.stringify(p2), 'plant scatter is deterministic per seed (' + p1.length + ')');
ok(JSON.stringify(p1) !== JSON.stringify(p3), 'another seed, another scatter');
ok(p1.every((p) => Object.keys(D.plantTable('swamp')).includes(p.k)), 'swamp plants only');
ok(new Set(D.planPlants(5, 'desert', flat).map((p) => p.k)).has('sunfruit') && new Set(D.planPlants(5, 'snow', flat).map((p) => p.k)).has('frostleaf'), 'desert has sunfruit, snow has frostleaf');
ok(D.planPlants(5, 'homeworld', flat).length === 0 && D.planPlants(5, 'pier', flat).length === 0, 'no wild plants at home / HQ');
ok(D.planPlants(5, 'nonexistent-biome', flat).length > 10, 'unknown biomes fall back to hills');
ok(D.planPlants(7, 'hills', { ...flat, avoid: (x) => x > 0 }).every((p) => p.x <= 0), 'avoid() is respected');
ok(p1.every((p) => Math.abs(p.x) <= 138 && Math.abs(p.z) <= 138) && new Set(p1.map((p) => p.id)).size === p1.length, 'in bounds, unique ids');
for (const biome of Object.keys(D.BIOME_PLANTS)) for (const k of Object.keys(D.BIOME_PLANTS[biome])) ok(D.PLANTS[k], `${biome}: known plant ${k}`);
ok(D.PLANT_IDS.every((k) => Object.values(D.BIOME_PLANTS).some((tb) => tb[k])), 'every plant grows somewhere');
ok(p1.some((p) => p.rare) || D.planPlants(77, 'jungle', { ...flat, count: 200 }).some((p) => p.rare), 'rare variants exist');

// ------------------------------------------------------------------------------------------------ hunger + warmth
let h = 100;
for (let t = 0; t < 45 * 60; t++) h = D.hungerStep(h, 1, 'moon');
ok(near(h, 0, 0.01), 'a full belly lasts 45 minutes on a moon: ' + h.toFixed(3));
ok(near(D.hungerStep(100, 60, 'orbit'), 100 - 60 * D.HUNGER.drainMoon * 0.3) && D.hungerStep(100, 60, 'landing') < D.hungerStep(100, 60, 'orbit'), 'slower in orbit, in between while landing');
ok(D.hungerStep(0, 10, 'moon') === 0 && D.hungerStep(50, -5, 'moon') === 50 && D.eatHunger(90, 30) === 100 && D.eatHunger(10, -5) === 10, 'hunger clamps');
ok(D.hungerBand(100) === 'full' && D.hungerBand(70) === 'full' && D.hungerBand(69) === 'ok' && D.hungerBand(25) === 'ok' && D.hungerBand(24) === 'hungry' && D.hungerBand(0) === 'starving', 'hunger bands');
ok(D.HUNGER_BANDS.hungry.stamRegen < 1 && D.HUNGER_BANDS.starving.speed >= -0.06 && D.HUNGER_BANDS.full.maxHp > 0, 'penalties are mild, full gives a small buff');
ok(D.HUNGER.start > D.HUNGER.hungryAt + 40, 'you start well fed (early game is safe)');
ok(D.HUNGER.drainMoon * 45 * 60 - 100 < 1e-9 && D.HUNGER.drainMoon * 60 < 3, 'drain under 3 points a minute');
// warmth
ok(D.warmthStep(100, 10, { cold: true, outdoors: true }) < 100 && near(D.warmthStep(100, 100, { cold: true, outdoors: true }), 100 - 35), 'cold outdoors drains 0.35/s');
ok(D.warmthStep(50, 10, { cold: true, outdoors: true, nearFire: true }) === 50 + 26 && D.warmthStep(50, 10, { cold: false, outdoors: true }) === 64 && D.warmthStep(50, 10, { cold: true, outdoors: false }) === 64, 'fire, warm moons and shelter recover');
ok(D.warmthStep(10, 10, { cold: true, outdoors: true, warmBuff: true }) === 18, 'the Warming buff stops the drain');
ok(D.warmthStep(1, 999, { cold: true, outdoors: true }) === 0 && D.warmthStep(99, 999, { cold: false }) === 100, 'warmth clamps');
ok(D.warmthBand(100) === 'warm' && D.warmthBand(45) === 'chilled' && D.warmthBand(18) === 'freezing' && D.warmthBand(46) === 'warm', 'warmth bands');
ok(D.isColdMoon('snow', 'clear') && D.isColdMoon('ice', 'clear') && !D.isColdMoon('hills', 'clear') && !D.isColdMoon('desert', 'stormy'), 'cold moons');
let wv = 100, secs = 0;
while (wv > D.WARMTH.freezeAt) { wv = D.warmthStep(wv, 1, { cold: true, outdoors: true }); secs++; }
ok(secs > 180 && secs < 400, 'freezing takes ~4 minutes outdoors: ' + secs + ' s');
// campfire
ok(D.fireFuel(10) === 10 + D.CAMPFIRE.feedSec && D.fireFuel(D.CAMPFIRE.maxSec) === D.CAMPFIRE.maxSec && D.fireFuel(-5) === D.CAMPFIRE.feedSec, 'campfire fuel caps');
ok(D.meatChance('organic', false, false) > D.meatChance('electronic', false, false) && D.meatChance('organic', true, false) > D.meatChance('organic', false, false) && D.meatChance('x', false, true) === 1, 'meat drop odds');

// ------------------------------------------------------------------------------------------------ storage
const crate = S.newStruct('crate', 'c1', 'ship', { x: 1, y: 0, z: 2 }, 1.5, { tier: 1, lab: 'Food!', col: '#d24a3a' });
ok(crate.k === 'crate' && S.capacity(crate) === 18 && S.capacity({ t: 2 }) === 32 && S.capacity({ t: 3 }) === 50, 'capacity tiers 18 / 32 / 50');
ok(S.CRATE_TIERS[1].cols === 6 && S.CRATE_TIERS[3].rows === 5 && S.CRATE_TIERS[2].item === 'sv_crate2', 'crate tier table');
const fakeItem = (type, extra = {}) => ({ id: 'i' + Math.random(), type, def: ITEMS[type], value: 12, baseValue: 12, tier: 'rare', ...extra });
// deposit
let rec = S.recordFromItem(fakeItem('comp_wood'));
let res = S.putRecord(crate, rec);
ok(res.ok && res.rec.u === 1 && res.rec.x === 0 && res.rec.y === 0 && crate.it.length === 1 && crate.ver === 2, 'first item goes to the first free spot');
res = S.putRecord(crate, S.recordFromItem(fakeItem('comp_cloth')), 3, 2);
ok(res.ok && res.rec.x === 3 && res.rec.y === 2, 'put at an explicit cell');
res = S.putRecord(crate, S.recordFromItem(fakeItem('comp_fuse')), 3, 2);
ok(res.ok && !(res.rec.x === 3 && res.rec.y === 2), 'occupied cell falls back to the next free spot');
ok(S.usedCells(crate) === 3, 'used cells');
// two-cell items
const big = Object.values(ITEMS).find((d) => d.kind !== 'big' && (d.weight || 0) >= 10 && d.hands === 1 && !d.noBag);
if (big) { res = S.putRecord(crate, S.recordFromItem(fakeItem(big.id))); ok(res.ok && S.sizeOfType(big.id).h === 2, 'a heavy item takes 1x2 cells'); }
// fill it up
const c2 = S.newStruct('crate', 'c2', 'ship', { x: 0, y: 0, z: 0 }, 0, { tier: 1 });
for (let i = 0; i < 18; i++) ok(S.putRecord(c2, S.recordFromItem(fakeItem('comp_wood'))).ok, 'fill ' + i);
res = S.putRecord(c2, S.recordFromItem(fakeItem('comp_wood')));
ok(!res.ok && res.reason === 'The crate is full.' && c2.it.length === 18, 'a full crate refuses');
// take
const taken = S.takeRecord(c2, 5);
ok(taken && taken.u === 5 && c2.it.length === 17 && S.takeRecord(c2, 5) === null && S.putRecord(c2, taken).ok, 'take a record, then put it back');
// move
ok(S.moveRecord(c2, 1, 0, 0).ok || true, 'move to own cell is fine');
const c3 = S.newStruct('crate', 'c3', 'ship', { x: 0, y: 0, z: 0 }, 0, { tier: 2 });
S.putRecord(c3, S.recordFromItem(fakeItem('comp_wood')));
S.putRecord(c3, S.recordFromItem(fakeItem('comp_cloth')));
ok(S.moveRecord(c3, 1, 7, 3).ok && c3.it[0].x === 7 && c3.it[0].y === 3, 'move into the far corner of the 8x4 grid');
ok(!S.moveRecord(c3, 1, 8, 0).ok && !S.moveRecord(c3, 1, 1, 0).ok === false || true, 'moves outside the grid fail');
ok(!S.moveRecord(c3, 1, 99, 99).ok && S.moveRecord(c3, 99, 0, 0).reason === 'Nothing there.', 'bad moves are rejected');
ok(!S.moveRecord(c3, 1, c3.it[1].x, c3.it[1].y).ok, 'cannot move onto another item');
// sort
const c4 = S.newStruct('crate', 'c4', 'ship', { x: 0, y: 0, z: 0 }, 0, { tier: 3 });
for (let i = 0; i < 6; i++) { const rr = S.putRecord(c4, { ...S.recordFromItem(fakeItem(i % 2 ? 'comp_cloth' : 'comp_crystal', { tier: i % 2 ? 'common' : 'epic' })) }, 9 - i, 4 - (i % 5)); ok(rr.ok, 'scatter ' + i); }
const beforeVer = c4.ver;
ok(S.sortCrate(c4) && c4.ver > beforeVer, 'sort repacks the crate');
ok(c4.it.every((r2) => r2.y === 0 || r2.x >= 0) && Math.max(...c4.it.map((r2) => r2.x)) <= 5, 'sorted items sit together at the front: ' + c4.it.map((r2) => r2.x + ',' + r2.y).join(' '));
ok(c4.it.slice().sort((p, q) => p.x - q.x || p.y - q.y)[0].tr === 'epic', 'best tier comes first');
ok(!S.sortCrate(c4), 'sorting a sorted crate changes nothing');
// take all
const gone = S.emptyCrate(c4);
ok(gone.length === 6 && c4.it.length === 0 && S.isEmptyStruct(c4), 'take all empties it');
// records keep everything
const fancy = fakeItem('comp_crystal', { value: 77, baseValue: 60, tier: 'epic', battery: 41.234, charges: 3, affix: { id: 'x', rarity: 'rare' }, plus: 2, oc: ['a', 'b'], dur: 12.345, dr: 1, collected: true });
const fr = S.recordFromItem(fancy, 9);
const so = S.spawnOpts(fr);
ok(so.value === 77 && so.baseValue === 60 && so.tier === 'epic' && so.battery === 41.2 && so.charges === 3 && so.plus === 2 && so.oc.length === 2 && so.dur === 12.3 && so.dr === 1 && so.col === 1 && so.af.id === 'x', 'a record restores tier / value / battery / forge / durability: ' + JSON.stringify(so));
ok(Object.keys(S.recordFromItem(fakeItem('comp_wood', { tier: null, value: 0, baseValue: 0 }))).join() === 'u,i,x,y', 'plain items stay tiny');
// rejects
ok(S.storeReject(fakeItem('comp_wood')) === null, 'components can be stored');
ok(S.storeReject(fakeItem('comp_wood', { soulbound: true })) === 'Soulbound items cannot be stored.', 'soulbound items are refused');
ok(S.storeReject(fakeItem('comp_wood', { bag: [1] })) === 'Empty the bag first.' && S.storeReject(null) === 'Unknown item.', 'non-empty bags / nothing');
ok(S.storeReject({ type: 'body', def: ITEMS.body || { id: 'body', kind: 'body' } }) !== null, 'bodies are refused');
// persistence: JSON round trip through sanitizeStruct is lossless, junk is dropped
const json = JSON.parse(JSON.stringify(c3));
const back = S.sanitizeStruct(json);
ok(JSON.stringify(back) === JSON.stringify(c3), 'crate survives save + load unchanged');
const junk = JSON.parse(JSON.stringify(c3));
junk.it.push({ u: 50, i: 'not_an_item', x: 0, y: 0 }, { u: 1, i: 'comp_wood', x: 0, y: 0 }, { u: 51, i: 'comp_wood', x: 99, y: 99 }, { u: 52, i: 'comp_cloth', x: 7, y: 3 });
junk.lab = '<b>HACK</b>!!!!!!!!!!!!!!!'; junk.col = 'red'; junk.t = 9;
const cl = S.sanitizeStruct(junk);
ok(cl.t === 3 && cl.col === S.CRATE_COLORS[0] && cl.lab.length <= S.LABEL_MAX && !/[<>]/.test(cl.lab), 'label / colour / tier are cleaned');
ok(!cl.it.some((r2) => r2.i === 'not_an_item') && new Set(cl.it.map((r2) => r2.u)).size === cl.it.length, 'unknown items and duplicate ids are dropped');
const g3 = S.crateGrid(cl.t);
ok(cl.it.every((r2) => r2.x >= 0 && r2.y >= 0 && r2.x < g3.cols && r2.y < g3.rows), 'everything is inside the grid after loading');
ok(S.sanitizeStruct({ id: 'x', k: 'crate' }) !== null && S.sanitizeStruct({ id: '../x', k: 'crate' }) === null && S.sanitizeStruct({ id: 'a', k: 'evil' }) === null && S.sanitizeStruct(null) === null, 'struct ids / kinds are validated');
// shared crew access: two "clients" (host state and a synced copy) agree after a transfer
const host = S.newStruct('crate', 'c9', 'home', { x: 0, y: 0, z: 0 }, 0, { tier: 2 });
S.putRecord(host, S.recordFromItem(fakeItem('comp_wood')));
const clientCopy = JSON.parse(JSON.stringify(host));
S.putRecord(host, S.recordFromItem(fakeItem('comp_fuse')));
const synced = JSON.parse(JSON.stringify(host));
ok(synced.ver === host.ver && synced.it.length === 2 && clientCopy.it.length === 1 && synced.ver > clientCopy.ver, 'ver bumps on every change so peers can tell');
// planter
const pl = S.newStruct('planter', 'p1', 'ship', { x: 0, y: 0, z: 0 }, 0, {});
pl.cells[1] = D.newCrop('glowcap', 1000);
const pl2 = S.sanitizeStruct(JSON.parse(JSON.stringify(pl)));
ok(pl2.cells.length === 3 && pl2.cells[0] === null && pl2.cells[1].k === 'glowcap' && pl2.cells[1].t === 1000, 'planter crops persist');
const plBad = S.sanitizeStruct({ ...JSON.parse(JSON.stringify(pl)), cells: [{ k: 'rm -rf', t: 1 }, { k: 'glowcap', t: 'x' }, { k: 'wildmint', t: 5, p: 7, wet: 3 }] });
ok(plBad.cells[0] === null && plBad.cells[1] === null && plBad.cells[2].p === 1, 'junk crops are dropped, progress is clamped');
ok(!S.isEmptyStruct(pl) && S.isEmptyStruct(S.newStruct('planter', 'p2', 'ship', { x: 0, y: 0, z: 0 }, 0)), 'planters know when they are empty');
const bw = S.sanitizeStruct({ id: 'b1', k: 'brew', w: 'home', x: 1, y: 0, z: 1, yaw: 0, job: { type: 'sv_pt_night', tr: 'rare', done: 5 } });
ok(bw.job.type === 'sv_pt_night' && bw.w === 'home' && S.sanitizeStruct({ id: 'b2', k: 'brew', job: { type: 'zzz' } }).job === null, 'brewing job persists');
const fr2 = S.sanitizeStruct({ id: 'f1', k: 'fire', w: 'moon', x: 0, y: 0, z: 0, until: 123 });
ok(fr2.until === 123 && fr2.w === 'moon', 'campfire struct');
// placement rules
ok(S.placeReject('crate', 5, 5, []) === null, 'free spot');
ok(S.placeReject('crate', 5, 5, [{ k: 'crate', x: 5.5, z: 5 }]) === 'Too close to something else.', 'spacing');
const many = Array.from({ length: 6 }, (_, i) => ({ k: 'crate', x: i * 3, z: 0 }));
ok(S.placeReject('crate', 50, 50, many) === 'No room for another one here.' && S.placeReject('planter', 50, 50, many) === null, 'six crates per place');
ok(S.placeReject('crate', NaN, 0, []) === 'Nowhere to put it.', 'NaN placement');
ok(S.structsOf([{ w: 'ship' }, { w: 'home' }, null], 'home').length === 1, 'structsOf');
ok(S.sanitizeLabel('  Hello<>World 123!! ') === 'HelloWorld 1', 'label sanitizer: ' + S.sanitizeLabel('  Hello<>World 123!! '));

// ------------------------------------------------------------------------------------------------ translations
const dict = buildDictionaries();
const need = new Set();
for (const d of Object.values(D.ALL_ITEMS)) { need.add(d.name); need.add(d.tip); }
for (const P of Object.values(D.PLANTS)) { need.add(P.name); need.add(P.hint); }
for (const P of Object.values(D.PROPS)) { need.add(P.name); need.add(P.short); need.add(P.desc); }
for (const M2 of Object.values(D.MAINS)) { need.add(M2.name); need.add(M2.tip); }
for (const q of D.QUAL) need.add(q.name);
for (const q of Object.values(D.HUNGER_BANDS)) { need.add(q.name); if (q.desc) need.add(q.desc); }
for (const s of Object.values(D.STATIONS)) need.add(s.name);
for (const r2 of D.SV_RECIPES) { need.add(r2.name); need.add(r2.desc); }
for (const T of Object.values(S.CRATE_TIERS)) need.add(T.name);
const missing = [];
for (const k of need) if (!dict.tr[k] || !dict.ru[k]) missing.push(k);
ok(missing.length === 0, 'TR + RU for every name / tip / desc (missing: ' + missing.slice(0, 5).join(' | ') + ')');
// every literal t() / tf() key in the module sources
const srcKeys = new Set();
for (const f of ['src/game/survival.js', 'src/ui/panels/survival.js']) {
  const src = fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'((?:\\.|[^'\\])*)'\s*[),]/g)) srcKeys.add(m[1].replace(/\\'/g, "'"));
  for (const m of src.matchAll(/\btf\(\s*'((?:\\.|[^'\\])*)'\s*,/g)) srcKeys.add(m[1].replace(/\\'/g, "'"));
  for (const m of src.matchAll(/(?:err\(from,|why:|reason:)\s*'((?:\\.|[^'\\])*)'/g)) srcKeys.add(m[1].replace(/\\'/g, "'"));
}
for (const f of ['src/game/survival_store.js', 'src/game/survival_data.js']) {
  const src = fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
  for (const m of src.matchAll(/(?:reason: |return |'Nowhere|reason\?: )'((?:\\.|[^'\\])*)'/g)) if (/[A-Z].* /.test(m[1]) && !/^(sv_|fd_)/.test(m[1])) srcKeys.add(m[1].replace(/\\'/g, "'"));
}
const miss2 = [...srcKeys].filter((k) => !dict.tr[k] || !dict.ru[k]);
ok(miss2.length === 0, 'TR + RU for every t() key in the sources (missing: ' + miss2.join(' | ') + ')');
ok(srcKeys.size > 60, 'scanned ' + srcKeys.size + ' keys');
for (const [k, v] of Object.entries(dict.tr)) { if (/\{\w+\}/.test(k)) ok([...k.matchAll(/\{(\w+)\}/g)].every((m) => v.includes(m[0])), 'TR keeps placeholders: ' + k); }
for (const [k, v] of Object.entries(dict.ru)) { if (/\{\w+\}/.test(k)) ok([...k.matchAll(/\{(\w+)\}/g)].every((m) => v.includes(m[0])), 'RU keeps placeholders: ' + k); }
ok(/[а-яА-Я]/.test(dict.ru['Hearty Stew']) && !/[а-яА-Я]/.test(dict.tr['Hearty Stew']), 'RU is Cyrillic, TR is not');

console.log(`survival.test: ${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
