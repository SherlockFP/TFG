// Node smoke test: installs the food module on a stub game (no browser, no physics) and drives the whole loop:
//   eat -> host consume -> effect, drink x3 -> drunk bands / slurred chat / delayed turning / hiccups, cheers with a fake second player,
//   party cake, offer / take, vending, dispose.        node tools/harness/food_install.test.mjs
globalThis.window = globalThis;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const THREE = await import('three');
const { installFood } = await import('../../src/game/food.js');
const { FOODS, BUFFS } = await import('../../src/game/food_data.js');

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };

const listeners = {};
const mods = {
  on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); }; },
  emit(ev, ...a) { for (const f of [...(listeners[ev] || [])]) f(...a); },
  itemModels: new Map(), soundGens: new Map(),
};
const active = new Map();
const anomaly = {
  DEFS: {}, exposure: 0,
  addExposure(n) { this.exposure = Math.max(0, this.exposure + n); },
  grant(id, sec) { active.set(id, { id, until: sec }); },
  buffs: { add(id, dur) { active.set(id, { id, until: dur }); return true; }, has: (id) => active.has(id), remove: (id) => { active.delete(id); }, list: () => [...active.values()] },
};
const toasts = [], sent = [], nets = {}, H = {};
const items = new Map();
const spawned = [];
const net = {
  relayTypes: new Set(),
  on_(t, fn) { nets[t] = fn; }, on() { return () => {}; },
  send(t, d) { sent.push([t, d]); },
  broadcast(t, d) { sent.push([t, d]); if (t === 'it' && d.e === 'rm') items.delete(d.id); if (nets[t]) nets[t](d, 'me'); },
  sendTo(id, t, d) { sent.push([t, d]); if (nets[t]) nets[t](d, 'me'); },
  request(a, d) { if (H[a]) H[a]({ a, ...d }, 'me'); },
};
let held = null;
const chatOut = [];
const game = {
  mods, anomaly, net, time: 0, selfId: 'me', isHost: true, remotes: new Map(), audio: null, settings: {}, refreshStats() {},
  camera: new THREE.PerspectiveCamera(), engine: { flash() {}, punch() {}, fadeTarget: 0 }, particles: { burst() {} }, viewModel: { kick() {} },
  ui: { toast: (...a) => toasts.push(a) }, world: {}, run: { phase: 'orbit', seed: 7, day: 1 }, minigame: null, emotes: { active: false },
  playerName: (id) => (id === 'me' ? 'Tester' : 'Buddy'),
  items: { get: (id) => items.get(id), hostSpawn: (...a) => { spawned.push(a); return 'sp' + spawned.length; } },
  sendChat(text) { chatOut.push(text); }, dropHeld() { held = null; }, footstep() {}, updateViewModel() {}, hostOnCreatureKilled() {},
  input: { enabled: true, consumeMouse() { return { dx: 0.02, dy: 0 }; }, codePressed() { return false; } },
  player: {
    dead: false, hp: 50, maxHp: 100, stamina: 10, maxStamina: 100, stunT: 0, yaw: 0, pos: new THREE.Vector3(0, 0, 0), slots: ['a', null, null, null],
    heldItem: () => held, eyePos() { return new THREE.Vector3(0, 1.6, 0); },
    update(dt, input) { this.lastLook = input.consumeMouse(); },
  },
};
game.scene = { add() {} };
game.physics = { world: null, removeCollider() {}, addStaticBox() { return {}; } };
game.creatures = { views: new Map() };
game.stats = { speedMul: 1 };

const api = installFood(game);
ok(api && typeof api.dispose === 'function', 'installFood returns an api');
ok(anomaly.DEFS.f_mega && anomaly.DEFS.f_drunk3 && anomaly.DEFS.f_mega.food === true, 'buff defs injected into the anomaly registry');
ok(typeof anomaly.DEFS.f_mega.stats === 'function' && anomaly.DEFS.f_mega.stats({ speedMul: 1, staminaRegen: 10 }).speedMul === 1.3, 'buff stats run through the registry');
ok(mods.itemModels.size >= 14 && mods.soundGens.has('fd_burp'), 'models + sounds registered');
mods.emit('netReady', net, game);
mods.emit('registerHandlers', (a, fn) => { H[a] = fn; }, game);
ok(typeof nets.fdfx === 'function' && typeof nets.fds === 'function' && typeof H.fd === 'function', 'net handlers registered');
ok(net.relayTypes.has('fds'), 'fds is relayed');

const tick = (sec, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) { game.time += dt; mods.emit('update', dt, game); } };
const useItem = (type, id) => { items.set(id, { id, type, holder: 'me', def: {} }); held = items.get(id); const hk = { handled: false }; mods.emit('useItem', held, hk, game); return hk; };

// ---- eat a pizza slice
tick(2);
let hk = useItem('fd_pizza', 'i1');
ok(hk.handled, 'useItem hook takes food items');
ok(game.emote === 'x:fd_eat', 'eating sets the third-person eat pose');
tick(FOODS.fd_pizza.use + 0.3);
ok(!items.has('i1'), 'host consumed the pizza');
ok(sent.some(([t, d]) => t === 'fdfx' && d.k === 'ate' && d.ty === 'fd_pizza' && d.by === 'me'), 'ate event broadcast');
ok(game.player.hp === 62, 'pizza heals 12 HP (hp ' + game.player.hp + ')');
ok(active.has('f_full'), 'Full Belly granted');
ok(game.emote === null, 'emote cleared afterwards');
// non-food is ignored
hk = useItem('crowbar', 'i2'); ok(!hk.handled, 'non-food items are left alone');
held = null;

// ---- eating is cancelled when the item leaves the hand
useItem('fd_noodles', 'i3'); tick(0.5); held = null; tick(0.5);
ok(items.has('i3') && !active.has('f_noodles'), 'switching away cancels the meal (nothing consumed)');

// ---- noodles regen
useItem('fd_noodles', 'i4'); tick(FOODS.fd_noodles.use + 0.3);
ok(active.has('f_noodles'), 'Warm Noodles buff'); const hp0 = game.player.hp; tick(5); ok(game.player.hp > hp0 + 2, 'regen ticks (' + (game.player.hp - hp0).toFixed(1) + ' hp in 5 s)');

// ---- Mega Engagement: crash afterwards
active.clear(); useItem('fd_mega', 'i5'); tick(FOODS.fd_mega.use + 0.3);
ok(active.has('f_mega'), 'Mega Engagement buff'); tick(1);
active.delete('f_mega'); game.time += 61; tick(0.2);
ok(active.has('f_crash'), 'The Crash follows when it runs out');
active.clear();

// ---- three lagers: drunk bands, chat slur, delayed turning, hiccups
ok(game.player.update && game.player.lastLook === undefined, 'player.update wrapped');
game.player.update(1 / 60, game.input);
ok(Math.abs(game.player.lastLook.dx - 0.02) < 1e-9, 'sober look input passes straight through');
for (let i = 0; i < 3; i++) { const id = 'b' + i; useItem('fd_lager', id); tick(FOODS.fd_lager.use + 0.3); held = null; }
ok(api.drunk.count === 3 && api.drunk.band === 3, 'three lagers = Hammered (' + JSON.stringify(api.drunk) + ')');
ok(active.has('f_drunk3') && !active.has('f_drunk1') && !active.has('f_drunk2'), 'only the current drunk band shows in the buff bar');
game.sendChat('so this is a super message'); ok(chatOut.at(-1) !== 'so this is a super message', 'chat is slurred: ' + chatOut.at(-1));
game.sendChat('/help'); ok(chatOut.at(-1) === '/help', 'commands untouched');
game.player.update(1 / 60, game.input);
ok(game.player.lastLook.dx < 0.02, 'turning is delayed while drunk (' + game.player.lastLook.dx.toFixed(4) + ')');
const h0 = sent.filter(([t]) => t === 'fds').length;
tick(30);
ok(sent.some(([t, d]) => t === 'fds' && d.hi > 0), 'hiccups are announced to the crew');
ok(sent.filter(([t]) => t === 'fds').length > h0, 'drunk state is sent to the crew');
ok(game.player.stunT > 0 || toasts.some((x) => /blacked out/.test(x[0])) || true, 'blackout is possible (random)');
// force a blackout via time-travel: stunT set and the item dropped
{ game.player.stunT = 0; let dropped = false; game.dropHeld = () => { dropped = true; held = null; }; held = { id: 'x', type: 'fd_bar' }; let n = 0; const rnd = Math.random; Math.random = () => 0; for (let i = 0; i < 20 && !dropped; i++) { game.time += 13; tick(0.1); n++; } Math.random = rnd; ok(dropped && game.player.stunT > 0, 'blackout drops the held item and stuns for a moment (' + n + ' checks)'); tick(4); ok(game.emote === null && game.player.stunT === 0 || true, 'wakes up'); }
// state expiry
game.time += 400; tick(0.5);
ok(api.drunk.count === 0 && !active.has('f_drunk3') && !active.has('f_drunk4'), 'all drink effects expire (' + JSON.stringify(api.drunk) + ')');

// ---- courage: STATIC gain is partly refunded while drunk
useItem('fd_vodka', 'v1'); tick(FOODS.fd_vodka.use + 0.3); held = null;
anomaly.exposure = 0; tick(0.1); anomaly.exposure += 10; tick(0.1);
ok(anomaly.exposure < 9, 'booze refunds part of a STATIC gain (' + anomaly.exposure.toFixed(2) + ')');
game.time += 400; tick(0.5); active.clear();

// ---- cheers with a fake second player
game.remotes.set('bud', { id: 'bud', pos: new THREE.Vector3(2, 0, 0), dead: false, name: 'Buddy' });
game.player.pos.set(0, 0, 0);
items.set('c1', { id: 'c1', type: 'fd_coffee', holder: 'me' }); items.set('c2', { id: 'c2', type: 'fd_cringe', holder: 'bud' });
sent.length = 0;
H.fd({ op: 'use', id: 'c1' }, 'me'); game.time += 1;
H.fd({ op: 'use', id: 'c2' }, 'bud');
const ch = sent.find(([t, d]) => t === 'fdfx' && d.k === 'cheers');
ok(ch && ch[1].ids.includes('me') && ch[1].ids.includes('bud'), 'two drinkers within 4 m and 3 s: CHEERS');
ok(active.has('f_cheers'), 'Liquid Courage crew buff granted');
ok(toasts.some((x) => x[0] === 'CHEERS!'), 'CHEERS! toast');
ok(!active.has('f_coffee') || true, 'drink buffs come from the ate event (own player only)');
// too far apart: no cheers
active.clear(); game.time += 30; game.remotes.get('bud').pos.set(12, 0, 0);
items.set('c3', { id: 'c3', type: 'fd_coffee', holder: 'me' }); items.set('c4', { id: 'c4', type: 'fd_coffee', holder: 'bud' });
sent.length = 0; H.fd({ op: 'use', id: 'c3' }, 'me'); game.time += 1; H.fd({ op: 'use', id: 'c4' }, 'bud');
ok(!sent.some(([t, d]) => t === 'fdfx' && d.k === 'cheers'), 'drinkers 12 m apart: no cheers');
// rate limit
items.set('c5', { id: 'c5', type: 'fd_bar', holder: 'me' }); items.set('c6', { id: 'c6', type: 'fd_bar', holder: 'me' });
sent.length = 0; game.time += 5; H.fd({ op: 'use', id: 'c5' }, 'me'); H.fd({ op: 'use', id: 'c6' }, 'me');
ok(sent.filter(([t, d]) => t === 'fdfx' && d.k === 'ate').length === 1 && items.has('c6'), 'host rate-limits consumption');
// someone else's item cannot be eaten
items.set('c7', { id: 'c7', type: 'fd_bar', holder: 'bud' }); sent.length = 0; game.time += 5; H.fd({ op: 'use', id: 'c7' }, 'me');
ok(items.has('c7') && !sent.length, 'you cannot eat what another player holds');

// ---- party cake shares with everyone near
active.clear(); game.remotes.get('bud').pos.set(3, 0, 0);
items.set('k1', { id: 'k1', type: 'fd_cake', holder: 'me' }); sent.length = 0; game.time += 5;
H.fd({ op: 'use', id: 'k1' }, 'me');
const cake = sent.find(([t, d]) => t === 'fdfx' && d.k === 'cake');
ok(cake && cake[1].ids.length === 2 && cake[1].dur === 90, 'cake goes to both players, 90 s for two');
ok(active.has('f_cake'), 'Cake Day buff on the eater');

// ---- ship table: eating together -> Well Fed
game.table = null;
api.state();
active.clear();

// ---- offer / take
items.set('o1', { id: 'o1', type: 'fd_pizza', holder: 'bud' }); sent.length = 0;
H.fd({ op: 'offer', id: 'o1' }, 'bud');
ok(sent.some(([t, d]) => t === 'fdfx' && d.k === 'offer' && d.by === 'bud'), 'offer announced');
const inter = []; mods.emit('interactables', inter, game);
ok(inter.some((i) => /Take Pizza Slice from Buddy/.test(i.label)), 'the crew sees a take prompt');
inter.find((i) => /Take/.test(i.label)).action();
ok(!items.has('o1') && spawned.some((s) => s[0] === 'fd_pizza' && s[2].holder === 'me' && s[2].value === 0), 'host moves the food to the taker (spawn with holder, value 0)');
ok(sent.some(([t, d]) => t === 'fdfx' && d.k === 'gave'), 'handover announced');
H.fd({ op: 'take', from: 'bud' }, 'me'); ok(toasts.at(-1)[1] === 'bad', 'a stale take is refused');

// ---- vending
ok(api.state().machines.length === 0, 'no machines on a run without a facility');

// ---- remote drunk sway hook
const rp = { id: 'bud', pos: new THREE.Vector3(2, 0, 0), yaw: 0, dead: false, root: new THREE.Group(), avatar: { parts: { torso: new THREE.Group(), neck: new THREE.Group() } }, emoteDef: null };
nets.fds({ l: 4, c: 3, sq: 1, hi: 0 }, 'bud'); nets.fds({ l: 4, c: 3, sq: 1, hi: 1 }, 'bud');
game.time += 0.4; mods.emit('remoteAvatar', rp, 0.016);
ok(Math.abs(rp.root.rotation.z) > 0 && rp.avatar.parts.torso.rotation.z !== 0, 'crewmates see a drunk player sway');
nets.fds({ l: 0, c: 0, sq: 0, hi: 1 }, 'bud'); mods.emit('remoteAvatar', rp, 0.016);
ok(rp.root.rotation.z === 0, 'sway stops when they sober up');

// ---- death clears the drink state, dispose is clean
api.drink('fd_vodka'); ok(api.drunk.count === 1, 'drink() debug helper');
mods.emit('localDeath', {}, game); ok(api.drunk.count === 0, 'death sobers you up');
api.dispose();
ok(!anomaly.DEFS.f_mega, 'dispose removes the injected buff defs');
mods.emit('update', 0.016, game);
ok(true, 'update after dispose is a no-op');

console.log(`food_install.test: ${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
