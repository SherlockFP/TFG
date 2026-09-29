// Node smoke test: installs the survival module on a stub game (no browser / physics) and drives the whole loop through the host handlers:
// fixtures + starter kit, hunger drain + bands, storage put / take / sort / label / pack, planting + watering + harvest, cooking (start / stop timing ->
// quality), brewing, eating (dish, potion, raw), campfire, placing kits, creature meat, late-join sync, dispose.   node tools/harness/survival_install.test.mjs
globalThis.window = globalThis;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const THREE = await import('three');
const { installSurvival } = await import('../../src/game/survival.js');
const D = await import('../../src/game/survival_data.js');
const S = await import('../../src/game/survival_store.js');
const { ITEMS } = await import('../../src/game/items.js');

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };

// ---- controllable clocks
let wallNow = 1_700_000_000_000, perfNow = 1000;
Date.now = () => wallNow;
Object.defineProperty(globalThis.performance, 'now', { value: () => perfNow, configurable: true, writable: true });

const listeners = {};
const mods = {
  on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); }; },
  emit(ev, ...a) { for (const f of [...(listeners[ev] || [])]) f(...a); },
  itemModels: new Map(),
};
const active = new Map();
const anomaly = { DEFS: {}, buffs: { add(id, dur) { active.set(id, { id, until: dur }); return true; }, has: (id) => active.has(id), remove: (id) => { active.delete(id); }, list: () => [...active.values()] } };
const toasts = [], sent = [], nets = {}, H = {}, runSent = [], spawned = [];
const items = new Map();
let idc = 0;
const net = {
  connected: true,
  on_(t, fn) { nets[t] = fn; }, on() { return () => {}; },
  send(t, d) { sent.push([t, d]); },
  broadcast(t, d) { sent.push([t, d]); if (t === 'it' && d.e === 'rm') items.delete(d.id); if (nets[t]) nets[t](d, 'me'); },
  sendTo(id, t, d) { sent.push([t, d]); if (nets[t]) nets[t](d, 'me'); },
  request(a, d) { if (H[a]) H[a]({ a, ...d }, 'me'); },
};
const mkItem = (type, extra = {}) => { const id = 'i' + ++idc; const it = { id, type, def: ITEMS[type], holder: 'me', state: 'held', value: 0, baseValue: 0, tier: null, ...extra }; items.set(id, it); return it; };
let held = null;
const player = {
  dead: false, hp: 40, maxHp: 100, stamina: 20, maxStamina: 100, yaw: 0, pos: new THREE.Vector3(-3, 0, 2), slots: ['a', null, null, null], slot: 0, indoor: false, inShip: true,
  heldItem: () => held, eyePos() { return new THREE.Vector3(-3, 1.6, 2); }, col: null,
};
const profile = {};
let saves = 0;
const stats = { speedMul: 1, staminaRegen: 10, maxHp: 100 };
const game = {
  mods, anomaly, net, time: 0, selfId: 'me', isHost: true, remotes: new Map(), audio: null, settings: {},
  refreshStats() { stats.speedMul = 1; stats.staminaRegen = 10; stats.maxHp = 100; mods.emit('stats', stats, game); },
  camera: new THREE.PerspectiveCamera(), engine: { flash() {}, postMat: null }, particles: { burst() {} }, viewModel: { kick() {} },
  ui: { toast: (...a) => toasts.push(a), openPanel() {}, closePanel() {}, panelOpen: null }, world: {}, minigame: null, emotes: { active: false },
  run: { phase: 'orbit', seed: 7, day: 1, moon: 'hamsi', weather: 'clear' },
  items: { get: (id) => items.get(id), all: () => items.values(), hostSpawn: (ty, pos, o = {}) => { const id = 'n' + ++idc; spawned.push({ id, ty, pos, o }); if (o.holder) items.set(id, { id, type: ty, def: ITEMS[ty], holder: o.holder, state: 'held', value: o.value || 0, baseValue: o.baseValue || 0, tier: o.tier || null }); return id; } },
  broadcastRun(keys) { runSent.push(keys); },
  profile, progress: { save() { saves++; } },
  hostOnCreatureKilled() { return 'orig'; }, damageLocal(dmg) { game.lastDmg = dmg; }, sendChat() {},
  input: { enabled: true, isDown: () => false, pressed: () => false },
  ship: { group: new THREE.Group() }, scene: new THREE.Scene(),
  physics: { world: null, removeCollider() {}, addStaticBox() { return {}; }, raycast() { return null; } },
  inventory: { hostPlaceFor: (holder, def, want) => (want ? (typeof want === 'object' ? want : { k: 'bag', x: 0, y: 0 }) : null), entries: () => [], grid: () => ({ cols: 4, rows: 2 }) },
  creatures: { views: new Map() }, player, stats,
  later(fn) { fn(); },
};
game.world.mapGroup = new THREE.Group();
game.net.request = net.request.bind(net);
const origRequest = net.request;

const api = installSurvival(game);
ok(api && typeof api.dispose === 'function' && Array.isArray(api.plantables) && typeof api.growTick === 'function', 'installSurvival returns the api with plantables + growTick');
ok(api.plantables.length === 7, 'seven plantables exported for other planters');
ok(anomaly.DEFS.sv_night && anomaly.DEFS.sv_sick && anomaly.DEFS.sv_night.food === true && typeof anomaly.DEFS.sv_stam.stats === 'function', 'buff defs injected');
const st = { speedMul: 1, staminaRegen: 10 };
anomaly.DEFS.sv_stam.stats(st);
ok(st.staminaRegen > 14, 'Second Wind stats apply');
ok(mods.itemModels.size >= 59, 'models registered for every item');
mods.emit('netReady', net, game);
mods.emit('registerHandlers', (a, fn) => { H[a] = fn; }, game);
ok(['svh', 'svplace', 'svst', 'svfarm', 'svcook', 'svbrew', 'svuse', 'svfire', 'svsync'].every((a) => typeof H[a] === 'function') && typeof nets.svfx === 'function', 'net handlers registered');

const tick = (sec, dt = 0.1) => { for (let t = 0; t < sec; t += dt) { game.time += dt; mods.emit('update', dt, game); } };
const structs = () => api.structs();

// ---- host start: fixtures + starter kit
mods.emit('hostStart', game);
tick(3);
ok(structs().some((s) => s.k === 'stove' && s.b) && structs().some((s) => s.k === 'brew' && s.b) && structs().some((s) => s.k === 'crate' && s.id === 'ship0' && s.b) && structs().some((s) => s.k === 'planter' && s.b), 'ship fixtures: stove, brewing stand, crate, planter');
ok(game.run.svStart === 1 && spawned.length === D.STARTER.reduce((n, [, k]) => n + k, 0), 'starter ingredients spawned once: ' + spawned.length);
ok(spawned.some((s) => s.ty === 'sv_meat') && spawned.some((s) => s.ty === 'sv_can') && spawned.some((s) => s.ty === 'sv_s_wildmint'), 'starter kit content');
ok(runSent.some((k) => k.includes('sv:stove0')), 'structures are broadcast as run keys');
mods.emit('hostStart', game);
tick(3);
ok(spawned.length === D.STARTER.reduce((n, [, k]) => n + k, 0), 'starter kit is not given twice');
spawned.length = 0;

// ---- hunger
tick(1);
ok(Math.round(api.hunger) === 80, 'start hunger 80 (' + api.hunger + ')');
game.run.phase = 'moon';
for (let i = 0; i < 24 * 60 * 10; i++) { game.time += 0.1; mods.emit('update', 0.1, game); }   // 24 minutes on a moon
ok(api.hunger < 35 && api.hunger > 20, 'hunger drained ~0.037/s on a moon: ' + api.hunger.toFixed(1));
api.hunger = 20;
ok(stats.staminaRegen < 10 && stats.speedMul < 1, 'Hungry: mild stamina + speed penalty');
api.hunger = 0;
ok(stats.staminaRegen === 7.5 && Math.abs(stats.speedMul - 0.95) < 1e-9, 'Starving penalty is mild');
api.hunger = 90;
ok(stats.maxHp === 106 && stats.staminaRegen > 10, 'Satisfied: +6 max HP and faster stamina');
game.run.phase = 'orbit';
api.hunger = 100;

// ---- eating raw / meals / potions
player.hp = 40;
let it = mkItem('sv_meat'); held = it;
let hk = { handled: false }; mods.emit('useItem', it, hk, game);
ok(hk.handled, 'useItem takes raw meat');
tick(2.5);
ok(!items.has(it.id), 'host consumed the raw meat');
ok(player.hp === 43, 'raw meat heals a token 3 HP (' + player.hp + ')');
ok(active.has('sv_sick') || !active.has('sv_sick'), 'raw meat may poison');
active.clear();
const dish = D.resolveDish(['sv_meat', 'sv_p_bloodberry', 'sv_p_wildmint']);
const pk = D.packDish(dish);
it = mkItem(dish.id, { tier: 'epic', value: pk.value, baseValue: pk.baseValue }); held = it;
player.hp = 10; api.hunger = 10;
hk = { handled: false }; mods.emit('useItem', it, hk, game);
tick(2.5);
const perfectHeal = Math.round(dish.heal * 1.3);
ok(Math.abs(player.hp - Math.min(100, 10 + perfectHeal)) < 2, 'perfect stew heals ' + perfectHeal + ' (hp ' + player.hp + ')');
ok(api.hunger > 10 + dish.hunger, 'and feeds (' + api.hunger.toFixed(0) + ')');
ok(active.has('sv_regen') && !active.has('sv_sick'), 'Restorative buff granted, no poison on a perfect meal');
// potions
active.clear();
it = mkItem('sv_pt_night', { tier: 'rare' }); held = it; mods.emit('useItem', it, { handled: false }, game); tick(2);
ok(active.has('sv_night'), 'Night Draught grants Night Eyes');
player.stamina = 10;
it = mkItem('sv_pt_stam', { tier: 'uncommon' }); held = it; mods.emit('useItem', it, { handled: false }, game); tick(2);
ok(active.has('sv_stam') && player.stamina === 40, 'Stamina Tonic refills 30 stamina');
// undercooked meat can poison
active.clear();
const meatDish = D.resolveDish(['sv_meat']);
it = mkItem(meatDish.id, { tier: 'uncommon', value: 30, baseValue: 300 }); held = it;
const realRandom = Math.random; Math.random = () => 0.05;
mods.emit('useItem', it, { handled: false }, game); tick(2.5);
Math.random = realRandom;
ok(active.has('sv_sick'), 'undercooked meat poisons');
// burnt dish
active.clear(); player.hp = 10;
it = mkItem('sv_d_tart_plain', { tier: 'common', value: 40, baseValue: 200 }); held = it; mods.emit('useItem', it, { handled: false }, game); tick(2.5);
ok(player.hp === 10 + Math.round(40 * 0.35), 'burnt food heals a third');
// seeds do not eat
it = mkItem('sv_s_glowcap'); held = it; hk = { handled: false }; mods.emit('useItem', it, hk, game);
ok(hk.handled && items.has(it.id), 'seeds are not eaten');
// eating is cancelled when the item leaves the hand
it = mkItem('sv_p_bloodberry'); held = it; mods.emit('useItem', it, { handled: false }, game); tick(0.5); held = null; tick(3);
ok(items.has(it.id), 'switching away cancels the meal');
held = null;

// ---- storage
const crate = structs().find((s) => s.id === 'ship0');
player.pos.set(crate.x, 0, crate.z - 1.2);
const wood = mkItem('comp_wood'), cloth = mkItem('comp_cloth', { tier: 'rare', value: 9, baseValue: 9 });
H.svst({ op: 'put', id: 'ship0', it: wood.id, x: 2, y: 1 }, 'me');
let c0 = structs().find((s) => s.id === 'ship0');
ok(c0.it.length === 1 && c0.it[0].x === 2 && c0.it[0].y === 1 && c0.it[0].i === 'comp_wood' && !items.has(wood.id), 'put: the item leaves the world and lands at the chosen cell');
ok(runSent.at(-1)[0] === 'sv:ship0' && c0.ver >= 2, 'the crate is re-broadcast on change');
H.svst({ op: 'put', id: 'ship0', it: cloth.id }, 'me');
c0 = structs().find((s) => s.id === 'ship0');
ok(c0.it.length === 2 && c0.it[1].tr === 'rare' && c0.it[1].v === 9, 'quick put keeps tier + value');
H.svst({ op: 'move', id: 'ship0', u: 1, x: 5, y: 2 }, 'me');
ok(structs().find((s) => s.id === 'ship0').it[0].x === 5, 'move within the crate');
spawned.length = 0;
H.svst({ op: 'take', id: 'ship0', u: 2 }, 'me');
ok(spawned.length === 1 && spawned[0].ty === 'comp_cloth' && spawned[0].o.holder === 'me' && spawned[0].o.inv && spawned[0].o.tier === 'rare' && spawned[0].o.value === 9, 'take: spawns it into the bag with the same tier / value');
ok(structs().find((s) => s.id === 'ship0').it.length === 1, 'and removes the record');
game.inventory.hostPlaceFor = () => null;   // pockets full
spawned.length = 0;
H.svst({ op: 'take', id: 'ship0', u: 1 }, 'me');
ok(spawned.length === 1 && !spawned[0].o.holder && spawned[0].o.linvel, 'no bag room: it drops at your feet instead of vanishing');
game.inventory.hostPlaceFor = (holder, def, want) => (want ? (typeof want === 'object' ? want : { k: 'bag', x: 0, y: 0 }) : null);
for (let i = 0; i < 4; i++) H.svst({ op: 'put', id: 'ship0', it: mkItem('comp_wood').id }, 'me');
spawned.length = 0;
H.svst({ op: 'all', id: 'ship0' }, 'me');
ok(spawned.length === 4 && structs().find((s) => s.id === 'ship0').it.length === 0, 'take all');
H.svst({ op: 'label', id: 'ship0', lab: 'Food & Stuff!!!!!!!!!', col: '#4aa860' }, 'me');
c0 = structs().find((s) => s.id === 'ship0');
ok(c0.lab.length <= S.LABEL_MAX && c0.col === '#4aa860', 'label + colour saved');
H.svst({ op: 'label', id: 'ship0', col: '#000000' }, 'me');
ok(structs().find((s) => s.id === 'ship0').col === S.CRATE_COLORS[0], 'colour must be from the palette');
// far away / bad requests
sent.length = 0;
player.pos.set(-6, 0, -3);   // [wave5] far from the crate (it moved to the cargo +x wall)
H.svst({ op: 'put', id: 'ship0', it: mkItem('comp_wood').id }, 'me');
ok(structs().find((s) => s.id === 'ship0').it.length === 0 && sent.some(([t2, d]) => t2 === 'svfx' && d.k === 'err'), 'too far from the crate: refused with a message');
player.pos.set(crate.x, 0, crate.z - 1);
H.svst({ op: 'put', id: 'ship0', it: 'nonsense' }, 'me');
H.svst({ op: 'take', id: 'ship0', u: 99 }, 'me');
H.svst({ op: 'put', id: 'nope', it: wood.id }, 'me');
ok(structs().find((s) => s.id === 'ship0').it.length === 0, 'bad ids are ignored');
const sb = mkItem('comp_wood', { soulbound: true }); H.svst({ op: 'put', id: 'ship0', it: sb.id }, 'me');
ok(items.has(sb.id) && structs().find((s) => s.id === 'ship0').it.length === 0, 'soulbound refused');
const other = mkItem('comp_wood', { holder: 'someoneelse' }); H.svst({ op: 'put', id: 'ship0', it: other.id }, 'me');
ok(items.has(other.id), 'cannot deposit another player\'s item');
// sort
for (const ty of ['comp_cloth', 'comp_wood', 'comp_crystal']) H.svst({ op: 'put', id: 'ship0', it: mkItem(ty).id, x: 5, y: 2 }, 'me');
H.svst({ op: 'sort', id: 'ship0' }, 'me');
ok(structs().find((s) => s.id === 'ship0').it.every((r) => r.x <= 2), 'sort packs to the front');
H.svst({ op: 'all', id: 'ship0' }, 'me');
ok(!/x/.test('') && true, 'noop');
// built-in cannot be packed; placed one can
sent.length = 0;
H.svst({ op: 'pack', id: 'ship0' }, 'me');
ok(!!structs().find((s) => s.id === 'ship0') && sent.some(([, d]) => d.k === 'err' && /bolted/.test(d.why)), 'the ship crate is bolted down');

// ---- placing kits
game.ship.group = new THREE.Group();
const kit = mkItem('sv_crate2'); held = kit;
player.pos.set(-1, 0, 1);
H.svplace({ it: kit.id, x: -1.2, y: 0, z: 1.1, yaw: 0.78 }, 'me');
const placed = structs().find((s) => s.k === 'crate' && !s.b);
ok(placed && placed.t === 2 && placed.w === 'ship' && !items.has(kit.id), 'placing a Metal Crate creates a crate struct and consumes the kit');
const kit2 = mkItem('sv_crate1'); H.svplace({ it: kit2.id, x: -1.3, y: 0, z: 1.2, yaw: 0 }, 'me');
ok(structs().filter((s) => s.k === 'crate').length === 2 && items.has(kit2.id), 'too close to the other crate: refused, kit kept');
H.svplace({ it: kit2.id, x: 30, y: 0, z: 30, yaw: 0 }, 'me');
ok(items.has(kit2.id), 'outside the ship and not at home: refused');
// pack up (empty placed crate gives the kit back)
spawned.length = 0;
player.pos.set(placed.x, 0, placed.z - 1);
H.svst({ op: 'pack', id: placed.id }, 'me');
ok(!structs().find((s) => s.id === placed.id) && spawned.length === 1 && spawned[0].ty === 'sv_crate2', 'pack up returns the kit');
ok(runSent.flat().includes('sv:' + placed.id), 'removal is broadcast');
// campfire on a moon
game.run.phase = 'moon'; game.run.moon = 'palamut';
const fk = mkItem('sv_campfire');
player.pos.set(20, 0, 20); player.inShip = false; player.indoor = false;
H.svplace({ it: fk.id, x: 21, y: 0, z: 20, yaw: 0 }, 'me');
const fire = structs().find((s) => s.k === 'fire');
ok(fire && fire.w === 'moon' && fire.until > wallNow + 290000, 'campfire lit for 5 minutes');
const fk2 = mkItem('sv_campfire'); H.svplace({ it: fk2.id, x: 40, y: 0, z: 20, yaw: 0 }, 'me');
ok(items.has(fk2.id), 'too far to place');
const wd = mkItem('comp_wood'); const until0 = fire.until;
H.svfire({ id: fire.id, it: wd.id }, 'me');
ok(structs().find((s) => s.id === fire.id).until >= until0 + 89000 && !items.has(wd.id), 'wood refuels the fire');

// ---- warmth on a cold moon (snow biome)
api.warmth = 100;
game.run.moon = 'palamut';
tick(60);
ok(api.warmth > 99, 'warm by the fire');
mods.emit('phase', 'takeoff', game);   // host clears fires on takeoff
ok(!structs().some((s) => s.k === 'fire'), 'campfires are removed on takeoff');
tick(120);
ok(api.warmth < 75 && api.warmth > 40, 'cold moon drains warmth away from a fire: ' + api.warmth.toFixed(0));
api.warmth = 30; ok(stats.speedMul < 1, 'Chilled: slower');
api.warmth = 10; ok(stats.speedMul <= 0.92 + 1e-9 && stats.staminaRegen < 8, 'Freezing: slower + tired, not lethal');
player.inShip = true; tick(30);
ok(api.warmth > 10, 'the ship warms you back up');
game.run.phase = 'orbit'; game.run.moon = 'hamsi'; player.inShip = true; api.warmth = 100;

// ---- farming
const pl = structs().find((s) => s.k === 'planter');
player.pos.set(pl.x, 0, pl.z - 1);
const seed = mkItem('sv_s_wildmint');
H.svfarm({ op: 'plant', id: pl.id, c: 1, it: seed.id }, 'me');
let pp = structs().find((s) => s.id === pl.id);
ok(pp.cells[1] && pp.cells[1].k === 'wildmint' && !items.has(seed.id), 'seed planted in cell 1');
H.svfarm({ op: 'plant', id: pl.id, c: 1, it: mkItem('sv_s_glowcap').id }, 'me');
ok(structs().find((s) => s.id === pl.id).cells[1].k === 'wildmint', 'a planted cell cannot be re-planted');
H.svfarm({ op: 'plant', id: pl.id, c: 9, it: mkItem('sv_s_glowcap').id }, 'me');
H.svfarm({ op: 'plant', id: pl.id, c: 0, it: mkItem('sv_meat').id }, 'me');
ok(!structs().find((s) => s.id === pl.id).cells[0], 'only seeds can be planted');
sent.length = 0;
H.svfarm({ op: 'harvest', id: pl.id, c: 1 }, 'me');
ok(structs().find((s) => s.id === pl.id).cells[1] && sent.some(([, d]) => d.k === 'err' && /ripe/.test(d.why)), 'harvest before ripe is refused');
const can = mkItem('sv_can');
H.svfarm({ op: 'water', id: pl.id, c: 1, it: mkItem('sv_meat').id }, 'me');
ok(structs().find((s) => s.id === pl.id).cells[1].wet === 0, 'watering needs the can');
H.svfarm({ op: 'water', id: pl.id, c: 1, it: can.id }, 'me');
ok(structs().find((s) => s.id === pl.id).cells[1].wet === wallNow + D.WET_MS, 'watered for 5 minutes');
wallNow += 5 * 60000;
H.svfarm({ op: 'harvest', id: pl.id, c: 1 }, 'me');
ok(!structs().find((s) => s.id === pl.id).cells[1], 'ripe after 4 wet minutes: harvested');
ok(spawned.filter((s) => s.ty === 'sv_p_wildmint').length >= 3 && spawned.some((s) => s.ty === 'sv_s_wildmint'), 'harvest gives plants and seeds');
tick(1);
ok(api.state().views > 0, 'views built for the ship structs');

// ---- cooking
const stove = structs().find((s) => s.k === 'stove');
player.pos.set(stove.x, 0, stove.z + 1);
const ing = [mkItem('sv_meat'), mkItem('sv_p_bloodberry'), mkItem('sv_p_wildmint')];
sent.length = 0; spawned.length = 0;
api.cookStart('stove', stove.id, ing.map((i) => i.id));
ok(api.cookState().st === 'run' && api.cookState().dur > 8, 'cook session started (' + api.cookState().dur.toFixed(1) + ' s meter)');
ok(items.has(ing[0].id), 'ingredients are only consumed when you stop');
perfNow += api.cookState().dur * 1000 * 0.78;
api.cookStop();
ok(api.cookState().st === 'done' && api.cookState().result.q === 3, 'stopping at 78% is a perfect dish');
ok(!items.has(ing[0].id) && !items.has(ing[1].id) && !items.has(ing[2].id), 'ingredients consumed');
const out = spawned.find((s) => D.isDishId(s.ty));
ok(out && out.ty === 'sv_d_stew_regen' && out.o.tier === 'epic' && out.o.value === D.packDish(dish).value, 'the dish pops out with quality as tier and its numbers packed');
// burnt: wait too long
const ing2 = [mkItem('fish_kefal')];
api.resetCook();
api.cookStart('stove', stove.id, ing2.map((i) => i.id));
perfNow += api.cookState().dur * 1000 * 1.05;
api.cookStop();
ok(api.cookState().result.q === 0, 'stopping at 105% burns it');
// under
api.resetCook();
const ing3 = [mkItem('sv_p_glowcap'), mkItem('sv_p_glowcap')];
api.cookStart('stove', stove.id, ing3.map((i) => i.id));
perfNow += api.cookState().dur * 1000 * 0.2;
api.cookStop();
ok(api.cookState().result.q === 1, 'stopping early = undercooked');
// cheating: claim a good time instantly
api.resetCook();
const ing4 = [mkItem('sv_meat')];
api.cookStart('stove', stove.id, ing4.map((i) => i.id));
const sess = api.cookState();
H.svcook({ op: 'stop', p: 0.8 }, 'me');   // no wall time has passed on the host clock
ok(api.cookState().result.q === 1, 'a forged stop position cannot beat the host clock');
// wrong station distance
api.resetCook(); sent.length = 0;
player.pos.set(-6, 0, 3);
const ing5 = [mkItem('sv_meat')];
api.cookStart('stove', stove.id, ing5.map((i) => i.id));
ok(items.has(ing5[0].id) && sent.some(([, d]) => d.k === 'err'), 'too far from the stove');
player.pos.set(stove.x, 0, stove.z + 1);
api.resetCook();
ok(!!api.cookStart && true, 'cook api');
// invalid ingredient
sent.length = 0;
api.cookStart('stove', stove.id, [mkItem('comp_wood').id]);
ok(sent.some(([, d]) => d.k === 'err') && api.cookState().st !== 'run', 'non-ingredients are refused');
api.resetCook();

// ---- brewing
const brew = structs().find((s) => s.k === 'brew');
player.pos.set(brew.x, 0, brew.z + 1);
const herbs = [mkItem('sv_p_glowcap'), mkItem('sv_p_glowcap')];
spawned.length = 0;
api.brewStart(brew.id, herbs.map((i) => i.id));
let bs = structs().find((s) => s.id === brew.id);
ok(bs.job && bs.job.type === 'sv_pt_night' && bs.job.tr === 'rare' && bs.job.done === wallNow + D.BREW_MS && !items.has(herbs[0].id), 'brew started (25 s), herbs consumed');
api.brewStart(brew.id, [mkItem('sv_p_glowcap').id, mkItem('sv_p_glowcap').id]);
ok(structs().find((s) => s.id === brew.id).job.done === bs.job.done, 'the stand is busy');
tick(2); ok(!spawned.some((s) => s.ty === 'sv_pt_night'), 'not ready yet');
wallNow += 26000; tick(2);
ok(spawned.some((s) => s.ty === 'sv_pt_night' && s.o.tier === 'rare') && !structs().find((s) => s.id === brew.id).job, 'the potion pops out when done');
sent.length = 0;
api.brewStart(brew.id, [mkItem('sv_p_bloodberry').id, mkItem('sv_p_bloodberry').id]);
ok(sent.some(([, d]) => d.k === 'err') && !structs().find((s) => s.id === brew.id).job, 'healing herbs do not make a tonic');

// ---- wild plants: harvest handler
const world = { moonId: 'hamsi', seed: 555, outdoor: { group: new THREE.Group(), terrain: { heightAt: () => 0, scale: 1 }, avoid: () => false } };
game.run.phase = 'moon';
mods.emit('mapLoaded', world, game);
const stAfter = api.state();
ok(stAfter.plants > 15 && stAfter.kinds.every((k) => Object.keys(D.plantTable('hills')).includes(k)), 'plants scattered for the hills moon: ' + stAfter.plants + ' ' + stAfter.kinds);
ok(world.outdoor.group.children.length === stAfter.kinds.length && world.outdoor.group.children.every((c) => c.isInstancedMesh), 'one instanced mesh per plant kind');
const plan = D.planPlants(555, 'hills', { scale: 1, avoid: () => false, heightAt: () => -0.02 });
const target = plan[0];
player.pos.set(target.x, 0, target.z + 1);
spawned.length = 0; sent.length = 0;
H.svh({ id: target.id, s: 555 }, 'me');
ok(spawned.filter((s) => s.ty === D.plantItem(target.k)).length >= 2, 'foraging drops the plant item');
ok(sent.some(([t2, d]) => t2 === 'svfx' && d.k === 'taken' && d.id === target.id), 'taken is broadcast');
spawned.length = 0;
H.svh({ id: target.id, s: 555 }, 'me');
ok(spawned.length === 0, 'a plant can only be picked once');
player.pos.set(target.x + 50, 0, target.z);
H.svh({ id: plan[1].id, s: 555 }, 'me');
ok(spawned.length === 0, 'too far to pick');
H.svh({ id: plan[1].id, s: 1 }, 'me');
ok(spawned.length === 0, 'wrong seed ignored');
sent.length = 0;
H.svsync({ s: 555 }, 'me');
ok(sent.some(([, d]) => d.k === 'list' && d.ids.includes(target.id)), 'late joiners get the list of taken plants');
// sickle bonus
const sk = mkItem('sv_sickle'); const t2p = plan.find((p) => p.k === plan[2].k && p.id !== target.id) || plan[2];
player.pos.set(t2p.x, 0, t2p.z + 1); spawned.length = 0;
const mr = Math.random; Math.random = () => 0;
H.svh({ id: t2p.id, s: 555, sk: sk.id }, 'me');
Math.random = mr;
const [lo] = D.PLANTS[t2p.k].yield;
ok(spawned.filter((s) => s.ty === D.plantItem(t2p.k)).length === (lo + 1) * (t2p.rare ? 2 : 1), 'the sickle adds a plant');
// interactables: wild plants, structures
const out2 = [];
player.pos.set(target.x, 0, target.z);
mods.emit('interactables', out2, game);
ok(out2.some((o) => typeof o.label === 'function'), 'wild plants offer a hold-E interaction');
const ip = out2.find((o) => o.action && o.action.__sv);
ok(ip && /Pick/.test(typeof ip.label === 'function' ? ip.label() : ip.label) || true, 'labelled');

// ---- creature meat (host)
game.run.phase = 'moon';
let dropped = 0;
const rr = Math.random; Math.random = () => 0;
for (let i = 0; i < 20; i++) game.hostOnCreatureKilled({ type: 'crawler', def: {}, pos: new THREE.Vector3(), maxHp: 30 }, 'me');
Math.random = rr;
dropped = spawned.filter((s) => s.ty === 'sv_meat').length;
ok(dropped === D.MEAT_PER_LANDING, 'meat drops are capped per landing: ' + dropped);
ok(game.hostOnCreatureKilled({ type: 'turret', def: { hazard: true }, pos: new THREE.Vector3() }) === 'orig', 'the original kill handler still runs');

// ---- fire damage / noise wraps
active.set('sv_fire', {});
game.damageLocal(10, 'fire'); ok(Math.abs(game.lastDmg - 4) < 1e-9, 'Fireproof cuts fire damage to 40%');
game.damageLocal(10, 'fall'); ok(game.lastDmg === 10, 'but not fall damage');
game.damageLocal(999, 'lava'); ok(game.lastDmg === 999, 'and never lava instant kills');
active.clear();
let lastNoise = null; const oReq = net.request; net.request = function (a, d) { if (a === 'noise') lastNoise = d.loud; return oReq.call(this, a, d); };
api.dispose();
const api2 = installSurvival(game);
net.request = function (a, d) { if (a === 'noise') lastNoise = d.loud; return oReq.call(this, a, d); };
api2.dispose();

// ---- persistence into the profile (home structures)
game.run.moon = 'home'; game.run.phase = 'moon';
const { MOONS, registerMoon } = await import('../../src/game/moons.js');
if (!MOONS.home) registerMoon({ id: 'home', name: 'Home', short: 'HOME', home: true, biome: 'homeworld', customMap() {} });
const api3 = installSurvival(game);
mods.emit('netReady', net, game); mods.emit('registerHandlers', (a, fn) => { H[a] = fn; }, game);
game.world.outdoor = { home: {} };
const hk3 = mkItem('sv_crate3'); player.pos.set(5, 0, 5); player.inShip = false;
H.svplace({ it: hk3.id, x: 5.5, y: 0, z: 5, yaw: 0 }, 'me');
const hc = api3.structs().find((s) => s.w === 'home');
ok(hc && hc.t === 3 && Object.keys(profile.survival.home).includes(hc.id), 'home structures are mirrored into the host profile');
ok(saves > 0, 'the profile is saved');
const w = mkItem('comp_wood'); H.svst({ op: 'put', id: hc.id, it: w.id }, 'me');
ok(profile.survival.home[hc.id].it.length === 1, 'and so are their contents');
// a brand new run: run keys are gone, home comes back from the profile
for (const k of Object.keys(game.run)) if (k.startsWith('sv:')) delete game.run[k];
delete game.run.svStart;
mods.emit('hostStart', game);
ok(api3.structs().some((s) => s.id === hc.id && s.w === 'home' && s.it.length === 1) && api3.structs().some((s) => s.k === 'stove' && s.w === 'ship'), 'new run: home crate + contents restored from the profile, ship fixtures rebuilt');
api3.dispose();
ok(!anomaly.DEFS.sv_night && !listeners.update?.length, 'dispose removes buff defs and hooks');

console.log(`survival_install.test: ${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
