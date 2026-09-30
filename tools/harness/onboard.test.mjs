// [onboard] node test: the pure flow state machine (steps, out-of-order facts, skip rules, the Algorithm's remark), the staged-unlock schedule, the
// EN/TR/RU text table, and an INSTALL test that builds the whole wing (Cell 07, corridor, hangar) on a stub game with a fake DOM and drives the complete
// Hiring Day: wake -> corridor (crouch, sprint shutter with misses) -> locker -> flashlight -> mug -> blackout + glimpse -> lockpick -> hangar -> ship ->
// landing -> 50 scrap -> return -> remark, plus the unlock guards. No browser, no Rapier.
//   node tools/harness/onboard.test.mjs
globalThis.window = globalThis;
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
// ---- fake DOM (only what begin() / the sign canvases touch)
const mkEl = () => {
  const el = {
    children: [], style: {}, className: '', textContent: '', innerHTML: '',
    classList: { add() {}, remove() {} },
    appendChild(c) { this.children.push(c); return c; }, remove() {},
    querySelector() { return { textContent: '' }; },
  };
  return el;
};
const fakeCtx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? (s) => ({ width: String(s).length * 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
globalThis.document = {
  head: mkEl(), body: mkEl(), getElementById: () => mkEl(),
  createElement: (tag) => (tag === 'canvas' ? { width: 0, height: 0, getContext: () => fakeCtx } : mkEl()),
};
globalThis.location = { search: '' };
const THREE = await import('three');
const K = await import('../../src/game/onboard_core.js');
const TX = await import('../../src/game/onboard_text.js');
const CO = await import('../../src/game/cosmetics.js');
const { installOnboard } = await import('../../src/game/onboard.js');
const { setLang, t, tf } = await import('../../src/core/i18n.js');

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

// ================================================================================================ 1. flow state machine
{
  const ids = K.STEP_IDS;
  ok(new Set(ids).size === ids.length && ids.length === 15, 'step ids unique, 15 steps');
  const f = K.newFlow();
  eq(K.currentStep(f).id, 'wake', 'starts at wake');
  eq(K.stageOf(f), 'wing', 'stage wing');
  // an event for a later step first: the fact is kept, the current step does not move
  let r = K.note(f, 'flash');
  eq(r.done, [], 'early flash completes nothing');
  eq(K.currentStep(f).id, 'wake', 'still wake');
  r = K.note(f, 'announced');
  eq(r.done, ['wake'], 'announced completes wake'); eq(r.step, 'walk', 'then walk');
  // walking: 10 m; per-event distance is capped at 3 (teleports never count)
  K.note(f, 'moved', { d: 50, x: -1 });
  ok(f.f.dist === 3, 'a teleport-sized step counts 3 m at most');
  for (let i = 0; i < 4; i++) r = K.note(f, 'moved', { d: 1, x: -1.0 });
  ok(K.currentStep(f).id === 'walk', '7 m walked: still walk');
  r = K.note(f, 'moved', { d: 3, x: -1.0 });
  eq(r.done, ['walk'], '10 m completes walk');
  ok(f.f.side < -0.9 && f.f.sideN === 6, 'lateral mean tracked');
  eq(K.currentStep(f).id, 'crouch', 'crouch next');
  r = K.note(f, 'crouched'); eq(r.step, 'sprint', 'sprint next');
  r = K.note(f, 'shutterFail'); r = K.note(f, 'shutterFail');
  ok(f.f.shutterFails === 2, 'shutter misses counted');
  r = K.note(f, 'sprinted'); eq(r.step, 'locker', 'locker next');
  r = K.note(f, 'locker'); eq(r.done, ['locker', 'flash'], 'locker + the earlier flash fact complete together'); eq(r.step, 'loot', 'loot next');
  r = K.note(f, 'loot'); eq(r.step, 'blackout', 'blackout next');
  r = K.note(f, 'blackout'); eq(r.step, 'lock', 'lock next');
  K.note(f, 'lockTry'); K.note(f, 'lockTry');
  r = K.note(f, 'lock', { tries: f.f.lockTries + 1 }); ok(f.f.lockTries === 3, 'three lock attempts'); eq(r.step, 'hangar', 'hangar next');
  eq(K.stageOf(f), 'wing', 'hangar is still the wing');
  r = K.note(f, 'boarded'); eq(r.step, 'terminal', 'terminal next'); eq(K.stageOf(f), 'ship', 'stage ship');
  K.note(f, 'terminal'); r = K.note(f, 'lever'); eq(r.step, 'door', 'door next'); eq(K.stageOf(f), 'field', 'stage field');
  K.note(f, 'door');
  eq(K.currentStep(f).id, 'field', 'field step');
  K.note(f, 'collected', { n: 30 }); K.note(f, 'collected', { n: 20 });
  ok(f.f.collected === 30, 'collected keeps the maximum');
  r = K.note(f, 'returned'); eq(r.step, 'return', 'return next'); eq(K.stageOf(f), 'return', 'stage return');
  ok(!r.finished && f.s === 'run', 'not finished before the summary');
  r = K.note(f, 'summary');
  ok(r.finished && f.s === 'done' && K.stageOf(f) === 'done', 'finished');
  eq(K.note(f, 'moved', { d: 1 }).done, [], 'a finished flow ignores events');
  // progress
  const g = K.newFlow(); eq(K.progress(g), { done: 0, total: 15, id: 'wake' }, 'progress at start');
  // forceTo
  const h = K.newFlow();
  ok(K.forceTo(h, 'terminal'), 'forceTo ok'); eq(K.currentStep(h).id, 'terminal', 'forced to terminal');
  const h2 = K.newFlow(); K.forceTo(h2, 'door'); eq(K.currentStep(h2).id, 'door', 'forced to door'); ok(h2.f.terminal && h2.f.lever, 'terminal + lever facts set');
  ok(!K.forceTo(h2, 'nope'), 'unknown step id rejected');
  // skip
  const s = K.newFlow(); ok(K.skipFlow(s, 'why') && s.s === 'skip' && K.stageOf(s) === 'done', 'skip flow');
  ok(!K.skipFlow(s), 'second skip is a no-op'); eq(K.note(s, 'announced').done, [], 'a skipped flow ignores events');
  // save repair
  ok(K.ensureFlow(null) === null && K.ensureFlow({ v: 9, s: 'run' }) === null && K.ensureFlow({ v: 1, s: 'x' }) === null, 'garbage flow rejected');
  const rt = K.ensureFlow(JSON.parse(JSON.stringify(f)));
  ok(rt && rt.s === 'done' && rt.f.lockTries === 3, 'JSON round trip');
  const junk = K.ensureFlow({ v: 1, s: 'run', f: { dist: 'a', announced: true, evil: {} } });
  ok(junk && junk.f.announced === true && junk.f.dist === 0 && !('evil' in junk.f), 'per-field repair');
}

// ================================================================================================ 2. remark
{
  const base = { deaths: 0, collected: 60, lockTries: 1, shutterFails: 0, side: 0 };
  eq(K.remarkFor({ ...base, deaths: 1 }).id, 'died', 'died first');
  eq(K.remarkFor({ ...base, collected: 20, deaths: 0 }).id, 'short', 'short of the goal');
  eq(K.remarkFor({ ...base, lockTries: 3 }).id, 'lock', 'lock attempts');
  eq(K.remarkFor({ ...base, shutterFails: 2 }).id, 'shutter', 'shutter');
  eq(K.remarkFor({ ...base, side: -0.4 }).id, 'left', 'left wall'); eq(K.remarkFor({ ...base, side: 0.4 }).id, 'right', 'right wall');
  eq(K.remarkFor(base).id, 'clean', 'clean');
  for (const id of ['died', 'short', 'lock', 'shutter', 'left', 'right', 'clean']) ok(TX.TEXT['rem.' + id], 'remark text ' + id);
  eq(K.remarkFor({ ...base, collected: 20 }).vars, { n: 20, goal: 50 }, 'short remark vars');
}

// ================================================================================================ 3. who gets Hiring Day
{
  const fresh = () => ({ stats: { days: 0, quotasMet: 0, scrapCollected: 0, sold: 0, runs: 1 }, level: 1 });
  const ctx = (o = {}) => ({ profile: fresh(), settings: {}, isHost: true, hasRunData: false, phase: 'orbit', quotaIndex: 0, day: 1, ...o });
  eq(K.shouldRun(ctx()), { run: true, why: 'fresh', mark: null }, 'fresh host runs');
  ok(K.shouldRun(ctx({ isHost: false })).mark === 'skip' && !K.shouldRun(ctx({ isHost: false })).run, 'joiner skips and is flagged');
  ok(!K.shouldRun(ctx({ profile: { ...fresh(), stats: { days: 2 } } })).run, 'veteran (days) skips');
  ok(!K.shouldRun(ctx({ profile: { ...fresh(), level: 4 } })).run, 'veteran (level) skips');
  ok(!K.shouldRun(ctx({ profile: { ...fresh(), stats: { sold: 10 } } })).run, 'veteran (sold) skips');
  ok(K.shouldRun(ctx({ profile: { ...fresh(), stats: { runs: 5 } } })).run, 'many runs but no played day still runs (quit-and-retry)');
  ok(!K.shouldRun(ctx({ hasRunData: true })).run, 'a loaded save skips');
  ok(!K.shouldRun(ctx({ settings: { skipHiringDay: true } })).run, 'settings switch skips');
  ok(!K.shouldRun(ctx({ devAuto: true })).run, 'dev auto-host skips');
  ok(K.shouldRun(ctx({ devAuto: true, forced: true })).run, 'forced beats dev');
  ok(!K.shouldRun(ctx({ phase: 'moon' })).run && !K.shouldRun(ctx({ day: 3 })).run && !K.shouldRun(ctx({ quotaIndex: 1 })).run, 'not a fresh run: skip');
  const done = fresh(); done.onboard = { v: 1, s: 'done', f: {} };
  ok(!K.shouldRun(ctx({ profile: done })).run && K.shouldRun(ctx({ profile: done })).why === 'done', 'done flag skips');
  const sk = fresh(); sk.onboard = { v: 1, s: 'skip', f: {} };
  ok(!K.shouldRun(ctx({ profile: sk })).run, 'skip flag skips');
  const partial = fresh(); partial.onboard = { v: 1, s: 'run', f: {} };
  ok(K.shouldRun(ctx({ profile: partial })).run, 'an unfinished flow starts over');
}

// ================================================================================================ 4. unlock schedule
{
  const fresh = () => ({ stats: {}, level: 1 });
  const p = fresh();
  eq(K.decideMode(p), 'staged', 'fresh profile is staged');
  const v = { stats: { days: 5 }, level: 2 };
  eq(K.decideMode(v), 'all', 'veteran keeps everything');
  const u = p.unlocks;
  const at = (q, boss = false, sale = false) => Object.fromEntries(K.UNLOCK_IDS.filter((id) => { const d = K.UNLOCKS.find((x) => x.id === id); return d.boss || d.sale || d.q <= q + 1; }).map((id) => [id, K.isOpen(id, u, { q, boss, sale })]));   // only the ids up to the next rung are compared
  eq(at(0), { shop: false, tree: false, arcade: false, pets: false, gates: false }, 'quota 0, no sale: everything locked');
  eq(at(0, false, true), { shop: true, tree: true, arcade: false, pets: false, gates: false }, 'first sale: store + skill tree (before quota 1)');
  eq(at(1), { shop: true, tree: true, arcade: true, pets: true, homeworld: false, farming: false, restaurant: false, gates: false }, 'quota 1: arcade + pets (quota 1 implies a sale)');
  eq(at(2), { shop: true, tree: true, arcade: true, pets: true, homeworld: true, farming: true, restaurant: true, forge: false, zones: false, gates: false }, 'quota 2: homeworld + farming + restaurant');
  eq(at(0, true), { shop: false, tree: false, arcade: false, pets: false, gates: true }, 'first boss: gates (independent of quotas)');
  ok(K.isOpen('nope', u, { q: 0 }), 'unknown ids are never locked');
  ok(K.isOpen('forge', u, { q: 0 }, true), 'unlockAll opens everything');
  ok(K.isOpen('homeworld', v.unlocks, { q: 0 }), 'mode all opens everything');
  // progress of a run
  eq(K.progressOf({ quotaIndex: 2 }), { q: 2, boss: false, sale: true }, 'progressOf quotas');
  ok(K.progressOf({ sold: 5 }).sale && !K.progressOf({ sold: 0 }).sale && !K.progressOf({ sold: 9, quick: { v: 1 } }).sale, 'the first sale (run.sold > 0) opens the store; Quick Shift never');
  ok(K.progressOf({ quotaIndex: 0, cycle: { firstKills: { a: 1 } } }).boss, 'boss from firstKills');
  ok(K.progressOf({ cycle: { sector: 1 } }).boss && K.progressOf({ cycle: { bossDead: true } }).boss, 'boss from sector / bossDead');
  ok(!K.progressOf({ cycle: { sector: 0, firstKills: {} } }).boss, 'no boss yet');
  // fold: never decreases, survives a second run
  ok(K.fold(u, { q: 2, boss: false, sale: true }) && u.q === 2 && u.sale, 'fold raises q + sale');
  ok(!K.fold(u, { q: 0, boss: false, sale: false }) && u.q === 2 && u.sale, 'fold never lowers q / sale');
  ok(K.isOpen('pets', u, { q: 0, boss: false }), 'a new run (quota 0) keeps what the profile earned');
  // gifts one per system, only staged profiles, once
  const g = fresh(); K.decideMode(g);
  eq(K.pendingGifts(g.unlocks, { q: 0 }), [], 'nothing to gift at quota 0');
  eq(K.pendingGifts(g.unlocks, { q: 0, sale: true }), ['shop', 'tree'], 'store + tree gifts due at the first sale');
  eq(K.pendingGifts(g.unlocks, { q: 1 }), ['shop', 'tree', 'arcade', 'pets'], 'gifts due at quota 1');
  ok(K.markGiven(g.unlocks, 'shop') && !K.markGiven(g.unlocks, 'shop'), 'gift marked once');
  eq(K.pendingGifts(g.unlocks, { q: 1 }), ['tree', 'arcade', 'pets'], 'shop no longer pending');
  eq(K.pendingGifts(g.unlocks, { q: 2, boss: true }, false), ['tree', 'arcade', 'pets', 'homeworld', 'farming', 'restaurant', 'gates'], 'the rest at quota 2 + boss');
  eq(K.pendingGifts(g.unlocks, { q: 3 }, true), [], 'unlockAll: no gifts');
  const vv = { stats: { days: 3 } }; K.decideMode(vv);
  eq(K.pendingGifts(vv.unlocks, { q: 9, boss: true }), [], 'veterans get no staged gifts');
  // JSON round trip + garbage
  const rt = { unlocks: JSON.parse(JSON.stringify(g.unlocks)) }; K.ensureUnlocks(rt);
  ok(rt.unlocks.mode === 'staged' && rt.unlocks.given.shop, 'unlocks survive JSON');
  const bad = { unlocks: { v: 1, mode: 'x', q: 'a', given: [] } }; const fixed = K.ensureUnlocks(bad);
  ok(fixed.mode === null && fixed.q === 0 && typeof fixed.given === 'object' && !Array.isArray(fixed.given), 'garbage unlocks repaired');
  eq(K.requirementText('forge'), { q: 3 }, 'requirement forge'); eq(K.requirementText('shop'), { sale: true }, 'requirement shop'); eq(K.requirementText('gates'), { boss: true }, 'requirement gates');
  // the design table
  eq(K.UNLOCKS.map((x) => [x.id, x.q ?? (x.sale ? 'sale' : 'boss')]), [['shop', 'sale'], ['tree', 'sale'], ['arcade', 1], ['pets', 1], ['homeworld', 2], ['farming', 2], ['restaurant', 2], ['forge', 3], ['zones', 3], ['voyage', 4], ['season', 4], ['gates', 'boss']], 'the wave 9 ladder (store at the first sale)');
  for (const id of K.UNLOCK_IDS) ok(K.giftsOf(id).length >= 2 && K.giftsOf(id).every((g) => CO.entry(g.slot, g.id)), 'real wardrobe gift candidates (with fallbacks) for ' + id);
  ok(K.giftOf('pets').id !== 'plushie' && !K.giftsOf('pets').slice(0, 2).some((g) => g.id === 'plushie'), 'pets gift is not the quota-1 plushie (earned anyway)');
}

// ================================================================================================ 5. text table (EN / TR / RU)
{
  const rows = TX.rows();
  ok(rows.length > 90, 'text rows: ' + rows.length);
  const ph = (s) => (s.match(/\{@?\w+\}/g) || []).map((x) => x.replace('@', '')).sort().join(',');
  for (const [id, v] of rows) {
    ok(Array.isArray(v) && v.length === 3 && v.every((s) => typeof s === 'string' && s.trim()), 'row ' + id + ' has EN/TR/RU');
    ok(ph(v[0]) === ph(v[1]) && ph(v[0]) === ph(v[2]), 'placeholders match in ' + id);
    ok(v[1] !== v[0] || /^[A-Z0-9 -]+$/.test(v[0]) || id === 'sign.hangar', 'TR differs from EN in ' + id);
  }
  for (const s of K.STEP_IDS) ok(TX.TEXT['obj.' + s] || s === 'field', 'objective text for step ' + s);
  ok(TX.TEXT['obj.field'] && TX.TEXT['obj.field_done'], 'field texts');
  for (const id of K.UNLOCK_IDS) ok(TX.TEXT['u.' + id] && TX.TEXT['gift.' + id], 'unlock texts for ' + id);
  setLang('tr'); ok(TX.x('pa_h') === 'ŞİRKET DUYURUSU', 'TR resolves at read time'); ok(TX.xf('locked_q', { name: 'FORGE', n: 1 }).includes('DEMİRHANE'), 'TR {@name} translates the system name');
  setLang('ru'); ok(TX.x('pa_h') === 'ОБЪЯВЛЕНИЕ КОМПАНИИ', 'RU resolves'); ok(TX.xf('locked_q', { name: 'FORGE', n: 1 }).includes('КУЗНИЦА'), 'RU {@name}');
  setLang('en'); ok(TX.x('pa_h') === 'COMPANY ANNOUNCEMENT', 'EN back');
  ok(tf('x {a}', { a: 1 }) === 'x 1' && t('nope') === 'nope', 'i18n sanity');
}

// ================================================================================================ 6. install: the whole Hiring Day on a stub game
{
  const listeners = {};
  const mods = {
    on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); }; },
    emit(ev, ...a) { for (const f of [...(listeners[ev] || [])]) f(...a); },
    terminalCommand(w0) { return w0 === 'hello'; },
  };
  const items = new Map(); const spawned = [];
  const colliders = new Set(); let addCount = 0;
  const scene = new THREE.Scene();
  const toasts = [], said = [], sent = [], tut = [], sfxs = [];
  const player = {
    pos: new THREE.Vector3(0, 0, 0), yaw: 0, pitch: 0, crouch: false, sprinting: false, dead: false, slots: [null, null, null, null], slot: 0,
    teleport(p, yaw) { this.pos.copy(p); this.yaw = yaw ?? this.yaw; }, eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.62, this.pos.z); },
    forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }, heldItem() { return null; },
  };
  const profile = { id: 'me', name: 'T', stats: { days: 0, quotasMet: 0, scrapCollected: 0, sold: 0, runs: 1 }, level: 1 };
  let flashOn = false, lockResult = 'fail', mgCalls = [];
  const game = {
    mods, scene, profile, player, selfId: 'me', isHost: true, remotes: new Map(), settings: {}, opts: {}, destroyed: false,
    run: { phase: 'orbit', quotaIndex: 0, day: 1, quota: 130, moon: 'hamsi' },
    hostData: { dayStats: { collected: 0 } },
    engine: { fx: { fade: 0, noise: 0 }, fadeTarget: 0, shake() {} },
    physics: {
      addStaticBox: (...a) => { const c = { a, h: ++addCount }; colliders.add(c); return c; },
      removeCollider: (c) => { colliders.delete(c); },
    },
    items: {
      get: (id) => items.get(id),
      hostSpawn(type, pos, opts = {}) { const id = 'i' + spawned.length; items.set(id, { id, type, holder: null, pos: pos.clone() }); spawned.push({ type, pos: pos.clone(), opts }); return id; },
    },
    ui: { toast: (s, k) => toasts.push([s, k]), panelOpen: null, hud: { bigText() {} } },
    lore: { say: (s) => said.push(s) },
    progress: { save() {}, addXp: (n, why) => tut.push(['xp', n, why]) },
    guide: { tutEvent: (ev) => tut.push(['guide', ev]) },
    terminal: { active: false, history: [], print() {} },
    input: { codeDown: () => false },
    objectives: { compute: () => [{ text: 'orbit line', kind: 'main' }], clientCollected: () => 0 },
    ship: { door: { open: false } },
    net: { sendTo: (id, t, d) => sent.push([id, t, d]) },
    sfx: (n) => sfxs.push(n),
    later: (fn, ms) => setTimeout(fn, ms),
    spawnInShip() { player.pos.set(0, 0.1, 0); player.yaw = Math.PI / 2; },
    updateAmbience() {},
    flashlightOn: () => flashOn,
    hostLever(from) { sent.push(['lever', from]); },
    minigame: null,
    openMinigame(kind, opts, cb) { mgCalls.push([kind, opts]); cb({ success: lockResult === 'ok' }); },
  };
  const tick = (dt = 0.1, n = 1) => { for (let i = 0; i < n; i++) mods.emit('update', dt, game); };
  const wing = () => api.wing();
  const at = (lx, lz) => { const o = wing().origin; player.pos.set(o.x + lx, 0, o.z + lz); };
  const interact = () => { const out = []; mods.emit('interactables', out, game); return out; };
  const findI = (re) => interact().find((i) => re.test(typeof i.label === 'function' ? i.label() : i.label));

  // ---- guards work before anything runs (a fresh profile, staged) + a dev auto-host must not start Hiring Day
  globalThis.location = { search: '?autohost=local&name=x' };
  let api = installOnboard(game);
  ok(api && typeof api.dispose === 'function', 'module installs');
  tick(0.1, 3);
  ok(!api.active() && !api.wing(), 'dev auto-host: no Hiring Day');
  ok(api.locked('forge') && api.locked('pets') && api.locked('voyage') && api.locked('homeworld') && api.locked('gates'), 'staged: everything locked at quota 0');
  ok(api.deny('forge') === true && toasts.length === 1 && /LOCKED/.test(toasts[0][0]), 'deny() toasts the lock');
  const term = []; const pt = { print: (s, c) => term.push([s, c]) };
  ok(mods.terminalCommand('pets', [], pt) === true && term.length === 1 && /quota 1/.test(term[0][0]), 'terminal PETS is answered with the lock text');
  ok(mods.terminalCommand('moon', ['random'], pt) === true && mods.terminalCommand('route', ['s1'], pt) === true && mods.terminalCommand('home', [], pt) === true, 'MOON RANDOM / ROUTE S1 / HOME locked');
  ok(mods.terminalCommand('hello', [], pt) === true, 'other commands pass through to the original');
  ok(mods.terminalCommand('route', ['hamsi'], pt) === false, 'plain ROUTE passes through');
  const rb = api.routeBlocked({ id: 'home', home: true });
  ok(rb && /quota 2/.test(TX.xf('locked_term', rb.v)) && rb.v.name === 'HOMEWORLD', 'homeworld ROUTE blocked with a translatable message');
  ok(api.routeBlocked({ id: 'hamsi' }) === null, 'other moons not blocked');
  // quota progress opens things and the Algorithm gifts them one by one
  ok(api.locked('shop') && /first sale/.test(TX.xf('locked_term_sale', { name: 'STORE' })), 'store: locked before the first sale, sale text');
  CO.grant(profile, 'hat', 'wizard');   // already owned: the tree gift must fall through to the next candidate
  game.run.sold = 40; tick(0.6);
  ok(!api.locked('shop') && !api.locked('tree') && api.locked('pets'), 'the FIRST SALE (run.sold > 0, quota 0) opens store tiers + skill tree');
  ok(profile.cosmetics?.hats?.includes('hardhat'), 'the store unlock handed over its wardrobe gift (hat:hardhat)');
  { const H = await import('../../src/game/hubgate_core.js'); const hb = H.hubOf(api.unlocks(), null);   // the host publishes the sale rung to joiners
    ok(hb.sale === true && H.hubOpen('shop', hb) && H.hubOpen('tree', hb) && !H.hubOpen('pets', hb), 'api.unlocks() -> hubOf() carries the sale rung (joiners see the store open)');
    game.run.sold = 0; ok(H.hubOf(api.unlocks(), null).sale === true, 'a new run (sold 0) on a profile that already sold still publishes sale:true'); game.run.sold = 40; }
  ok(said.some((s) => /better stock/.test(s)) && toasts.some((x) => /NEW TOY/.test(x[0])), 'the store tiers are gifted by the Algorithm (line + toast)');
  game.run.quotaIndex = 1; tick(0.6);
  ok(!api.locked('pets') && !api.locked('arcade') && api.locked('homeworld'), 'quota 1 opens arcade + pets');
  const n1 = said.length; tick(0.6, 3); ok(said.length === n1, 'gifts are spaced (one per 9 s)');
  tick(10, 1); tick(0.6);
  ok(said.filter((s) => /gift/i.test(s)).length >= 2, 'the next gift follows later');
  ok(profile.cosmetics?.hats?.includes('propeller') && !profile.cosmetics?.hats?.includes('tophat'), 'tree gift: the wizard hat was already owned, so the next candidate (propeller) was granted');
  game.settings.unlockAll = true; ok(!api.locked('gates') && !api.locked('homeworld'), 'Settings: unlock everything opens all'); game.settings.unlockAll = false;
  game.run.cycle = { firstKills: { core1: 1 } }; ok(!api.locked('gates'), 'first boss opens the gates');
  game.run.quotaIndex = 0; game.run.cycle = undefined;
  ok(!api.locked('pets') && api.locked('gates') === true, 'profile memory: a new run keeps quota 2, gates need the boss again only via the profile flag (set)');
  api.dispose();
  ok(mods.terminalCommand('pets', [], pt) === false, 'dispose restores terminalCommand');

  // ---- forced Hiring Day
  for (const k of Object.keys(profile)) if (k === 'unlocks' || k === 'onboard') delete profile[k];
  globalThis.location = { search: '?hiringday=wing' };
  game.run = { phase: 'orbit', quotaIndex: 0, day: 1, quota: 130, moon: 'hamsi' };
  api = installOnboard(game);
  tick(0.1, 2);
  ok(api.active() && !!wing(), 'forced: Hiring Day starts and builds the wing');
  const st = wing().stats;
  ok(st.verts > 2000 && st.verts < 200000 && st.tris > 1000, `compact merged geometry: ${st.verts} verts, ${st.tris} tris`);
  ok(st.drawCalls <= 24, 'few draw calls: ' + st.drawCalls);
  ok(colliders.size >= 60 && colliders.size < 250, 'colliders: ' + colliders.size);
  let lights = 0; scene.traverse((o) => { if (o.isLight) lights++; }); ok(lights === 0, 'no THREE lights added by the wing');
  let bad = 0; wing().group.traverse((o) => { const a = o.geometry?.attributes?.position; if (a) for (let i = 0; i < a.count * 3; i++) if (!Number.isFinite(a.array[i])) bad++; }); ok(bad === 0, 'no NaN vertices');
  ok(wing().group.position.x > 1000, 'the wing is built far from the ship');
  ok(player.pos.distanceTo(new THREE.Vector3(1600, 0, 0)) < 10 && game.engine.fadeTarget === 1, 'player teleported to Cell 07, screen black');
  eq(game.objectives.compute().map((l) => l.text), ['Wake up. Listen to the Company announcement.', 'Skip the orientation: hold Backspace'], 'only our objectives show in the wing');
  ok(game.onboard === undefined, 'stub has no game.onboard (the real Game sets it via useModule)');
  game.onboard = api;

  // timeline: announcement then the cell door opens, walking completes 'walk'
  tick(0.5, 60);   // 30 s
  ok(said.some((s) => /watching you/.test(s)), 'The Algorithm says it is watching');
  eq(api.step(), 'walk', 'announcement done -> walk');
  ok(wing().doors.cell.open, 'the cell door opened');
  for (let z = -2.2; z > -12; z -= 0.5) { at(-0.9, z); tick(0.1); }
  eq(api.step(), 'crouch', 'walked out of the cell: crouch next');
  // the duct: standing does nothing, crouching under it completes the step
  at(0, -14); tick(0.1); eq(api.step(), 'crouch', 'standing under the duct is not enough');
  player.crouch = true; tick(0.1); eq(api.step(), 'sprint', 'crouched under the duct');
  player.crouch = false;
  // sprint shutter: walk -> it closes after 2.2 s (miss), reopens, 3 misses -> generous pass
  const sh = () => wing().doors.shutter;
  ok(sh().open, 'shutter open at first');
  for (let round = 0; round < 3; round++) {
    at(0, -20.5); tick(0.1);                    // before the line
    at(0, -21.4); tick(0.1);                    // cross the trigger line
    for (let i = 0; i < 25; i++) { at(0, -21.4 - 0.4 * i); tick(0.1); if (!sh().open) break; }   // walking pace: too slow
    if (round < 2) {
      ok(!sh().open, 'walking is too slow: the shutter closes (round ' + round + ')');
      tick(0.1, 20);                            // 2 s later it reopens
      ok(sh().open, 'the shutter reopens (round ' + round + ')');
      at(0, -10); tick(0.1);                    // back behind the line
    }
  }
  ok(api.flow().f.shutterFails === 3, 'three misses counted: ' + api.flow().f.shutterFails);
  ok(said.some((s) => /generous/.test(s)), 'after 3 misses the Company is generous');
  eq(api.step(), 'locker', 'sprint step done (free pass)');
  ok(spawned.some((s) => s.type === 'mug'), 'the mug is on the break-room desk');
  // locker: prompt -> flashlight drops
  at(-4.6, -40.2); tick(0.1);
  const lk = findI(/locker 07/i); ok(!!lk, 'locker prompt'); lk.action();
  ok(spawned.some((s) => s.type === 'flashlight'), 'flashlight from the locker'); eq(api.step(), 'flash', 'flash next');
  ok(findI(/empty/i), 'locker prompt changes after opening');
  flashOn = true; tick(0.1); eq(api.step(), 'loot', 'flashlight on -> loot');
  // pick up the mug
  const mug = [...items.values()].find((i) => i.type === 'mug'); ok(!!mug, 'mug item exists');
  player.slots[0] = mug.id; tick(0.1);
  eq(api.step(), 'blackout', 'mug taken -> blackout');
  ok(wing().doors.gate.open, 'the gate opens');
  // blackout: passing z < -49 kills the lights, the figure appears, then the lights come back
  at(0, -46); tick(0.1); ok(wing().light() === 1, 'lights on before the gate');
  at(0, -50); tick(0.1); ok(wing().light() === 0, 'blackout');
  tick(0.1, 12); ok(wing().figure.visible, 'the glimpse appears');
  player.yaw = 0; tick(0.1, 10);   // looking down the corridor (-z) at it
  tick(0.1, 15);
  ok(wing().light() === 1 && !wing().figure.visible, 'lights back, figure gone');
  eq(api.step(), 'lock', 'blackout done -> lock');
  ok(said.some((s) => /harmless/.test(s)), 'the Algorithm calls it harmless');
  // cabinet: two failures then success; the minigame is the Simple lockpick
  at(0.4, -52); tick(0.1);
  let cab = findI(/pick the cabinet/i); ok(!!cab, 'cabinet prompt after the blackout');
  cab.action(); cab.action();
  ok(mgCalls.length === 2 && mgCalls[0][0] === 'lockpick' && mgCalls[0][1].tier === 'simple', "openMinigame('lockpick', {tier:'simple'})");
  ok(api.flow().f.lockTries === 2, 'two failed attempts counted'); eq(api.step(), 'lock', 'still the lock');
  lockResult = 'ok'; cab.action();
  eq(api.step(), 'hangar', 'lock opened -> hangar'); ok(wing().doors.hangar.open && api.flow().f.lockTries === 3, 'hangar door opens, 3 tries');
  // hangar: board
  at(0, -72); tick(0.1);
  const bd = findI(/board the mini-skeld/i); ok(!!bd, 'board prompt'); bd.action();
  tick(0.5, 3);
  ok(!api.wing() && api.step() === 'terminal', 'boarded: the wing is disposed, terminal step');
  ok(colliders.size === 0, 'all wing colliders removed: ' + colliders.size);
  let meshes = 0; scene.traverse((o) => { if (o.isMesh) meshes++; }); ok(meshes === 0, 'wing meshes removed from the scene');
  ok(game.engine.fadeTarget === 0 && player.yaw === Math.PI / 2, 'fade cleared, player in the ship');
  eq(api.stage(), 'ship', 'stage ship');
  ok(game.objectives.compute()[0].text === 'orbit line', 'outside the wing the normal tracker is back (our lines come through the hook)');
  const outl = []; mods.emit('objectives', (t2) => outl.push(t2), game, 'orbit'); ok(outl.some((s) => /TERMINAL/.test(s)), 'terminal objective');
  // co-op: a crewmate can not pull the lever during orientation
  game.hostLever('friend'); ok(sent.some((s) => s[1] === 'sys' && /orientation/.test(s[2].text)) && !sent.some((s) => s[0] === 'lever'), 'crew lever blocked with a message');
  // terminal: a typed command completes it
  game.terminal.active = true; tick(0.1); game.terminal.history.push('moons'); tick(0.1);
  eq(api.step(), 'lever', 'a command typed -> lever');
  game.terminal.active = false;
  game.hostLever('friend'); ok(sent.some((s) => s[0] === 'lever'), 'once the host is at the lever anyone can pull it');
  // landing
  game.run.phase = 'landing'; mods.emit('phase', 'landing', game); tick(0.1);
  eq(api.step(), 'door', 'landing -> door');
  game.run.phase = 'moon'; tick(0.1);
  ok(said.some((s) => /▮50/.test(s)), 'first-landing line names the 50 scrap goal');
  game.ship.door.open = true; tick(0.1); eq(api.step(), 'field', 'ship door open -> field');
  game.hostData.dayStats.collected = 32; tick(0.1);
  ok(api.flow().f.collected === 32 && game.objectives.compute()[0].text === 'orbit line', 'collected tracked');
  const fl = []; mods.emit('objectives', (t2, k, d, p) => fl.push([t2, p]), game, 'moon'); ok(/32/.test(fl[0][0]) && Math.abs(fl[0][1] - 0.64) < 1e-9, 'objective line with progress 32/50');
  game.hostData.dayStats.collected = 61; tick(0.1);
  ok(said.some((s) => /Target reached/.test(s)), 'goal reached line');
  // first return
  game.run.phase = 'orbit'; mods.emit('phase', 'orbit', game); tick(0.1);
  eq(api.step(), 'return', 'back in orbit -> return');
  const xpBefore = tut.filter((t2) => t2[0] === 'xp').length;
  game.ui.panelOpen = {}; tick(1, 6); ok(api.step() === 'return', 'waits while the day summary is open');
  game.ui.panelOpen = null; tick(1, 2);
  ok(!api.active() && profile.onboard.s === 'done', 'finished and saved in the profile');
  ok(tut.filter((t2) => t2[0] === 'xp').length === xpBefore + 1, 'XP awarded once');
  await new Promise((r) => setTimeout(r, 1500));
  ok(said.some((s) => /I noted|Acceptable|noted/.test(s)), 'the Algorithm makes its first remark: ' + said[said.length - 1]);
  ok(tut.some((t2) => t2[1] === 'flash') && tut.some((t2) => t2[1] === 'scrap') && tut.some((t2) => t2[1] === 'move'), 'the guide tutorial steps were marked: ' + JSON.stringify(tut.filter((t2) => t2[0] === 'guide')));
  api.dispose();

  // ---- second game with the same profile: done flag -> nothing runs
  globalThis.location = { search: '' };
  game.run = { phase: 'orbit', quotaIndex: 0, day: 1 };
  api = installOnboard(game); tick(0.1, 3); ok(!api.active() && !api.wing(), 'a profile that finished Hiring Day never gets it again');
  api.dispose();
  // ---- a fresh profile joining a friend's lobby: flagged skip
  const p2 = { id: 'x', stats: {}, level: 1 }; game.profile = p2; game.isHost = false; delete game.onboard;
  api = installOnboard(game); tick(0.1, 3);
  ok(!api.active() && p2.onboard && p2.onboard.s === 'skip' && p2.onboard.why === 'joined', 'joiner: skip flag written to the profile');
  api.dispose();
  // ---- a fresh host: starts, then skip by Backspace hold
  const p3 = { id: 'y', stats: {}, level: 1 }; game.profile = p3; game.isHost = true; game.settings = {};
  api = installOnboard(game); tick(0.1, 3); ok(api.active() && !api.wing() && api.debug().stream !== null, 'fresh host runs Hiring Day (wave 8: opens on the stream, no wing)');
  game.onboard = api;
  game.input.codeDown = (c) => c === 'Backspace'; tick(0.25, 12);
  ok(!api.active() && !api.wing() && api.debug().stream === null && p3.onboard.s === 'skip' && p3.onboard.why === 'skipped', 'holding Backspace skips (stream removed, flagged)');
  ok(colliders.size === 0, 'no colliders left after the skip');
  game.input.codeDown = () => false;
  api.dispose();
  // ---- interruption: somebody lands the ship while the host is in the wing
  const p4 = { id: 'z', stats: {}, level: 1 }; game.profile = p4; game.run = { phase: 'orbit', quotaIndex: 0, day: 1 };
  api = installOnboard(game); tick(0.1, 3); ok(api.active() && api.debug().stream !== null, 'again fresh');
  game.run.phase = 'landing'; mods.emit('phase', 'landing', game);
  ok(api.debug().stream === null && !player.frozen && api.step() === 'door', 'landing during the stream: overlay gone, flow jumps to the door');
  api.dispose();
  // ---- wave 8: the stream opening is short (<= 13 s) and lands on the terminal step (route board); SPACE cuts it
  const p5 = { id: 'w', stats: {}, level: 1, name: 'Nova' }; game.profile = p5; game.run = { phase: 'orbit', quotaIndex: 0, day: 1 };
  api = installOnboard(game); tick(0.1, 3);
  ok(api.debug().stream !== null && player.frozen === true, 'stream: overlay on, player held');
  tick(0.25, 52);
  ok(api.debug().stream === null && !player.frozen && api.step() === 'terminal' && api.active(), 'stream ends by itself within 13 s at the terminal step');
  api.dispose();
  const p6 = { id: 'v', stats: {}, level: 1 }; game.profile = p6; game.run = { phase: 'orbit', quotaIndex: 0, day: 1 };
  api = installOnboard(game); tick(0.5, 4);
  game.input.codeDown = (c) => c === 'Space'; tick(0.2, 5); game.input.codeDown = () => false;
  ok(api.debug().stream === null && api.step() === 'terminal', 'SPACE cuts the stream to the ship');
  api.dispose();
}

console.log(fails ? `FAILED ${fails}/${checks}` : `onboard: all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
