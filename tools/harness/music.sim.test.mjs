// Node simulation of src/game/music.js against a fake game / DOM / WebAudio (no browser needed):
// enter play mode via the useItem hook, real key / mouse events through the window capture listeners, chords, lead notes,
// songbook follow-along + reward request, rate limiting, exit conditions, network receive + jam + noise + AI-Slop calm, dispose.
// Run: node tools/harness/music.sim.test.mjs
import assert from 'node:assert/strict';

// ---------------------------------------------------------------- fake DOM / window
const mkEl = () => {
  const e = { style: {}, dataset: {}, children: [], _h: '', className: '', classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { this.children.push(c); return c; }, remove() {}, querySelector: () => mkEl(), querySelectorAll: () => [], addEventListener() {}, setAttribute() {}, insertBefore() {},
    getContext: () => new Proxy({}, { get: () => () => ({}) }), get isConnected() { return true; } };
  Object.defineProperty(e, 'innerHTML', { get() { return this._h; }, set(v) { this._h = v; } });
  return e;
};
globalThis.document = { createElement: mkEl, getElementById: () => mkEl(), head: mkEl(), body: mkEl(), addEventListener() {}, documentElement: mkEl() };
const listeners = [];
globalThis.window = globalThis;
globalThis.addEventListener = (t, f, o) => listeners.push({ t, f, o });
globalThis.removeEventListener = (t, f) => { const i = listeners.findIndex((l) => l.t === t && l.f === f); if (i >= 0) listeners.splice(i, 1); };
globalThis.localStorage = { getItem: () => null, setItem() {} };
if (!globalThis.navigator) globalThis.navigator = { language: 'en', userAgent: 'node' };

const { installMusic } = await import('../../src/game/music.js');
const SB = await import('../../src/game/songbook.js');
const { ITEMS, SCRAP_TABLE } = await import('../../src/game/items.js');
const { EMOTE_BY_ID } = await import('../../src/game/emotes.js');

let pass = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('ok  ' + name); } catch (e) { console.error('FAIL ' + name + '\n  ' + (e.stack || e).toString().split('\n').slice(0, 14).join('\n  ')); process.exitCode = 1; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- fake WebAudio
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
const mkNode = (counter) => new Proxy({ connect(n) { return n; }, disconnect() {}, start() { queueMicrotask(() => this.onended?.()); }, stop() {}, setPosition() {} }, {
  get(t, k) { if (k in t) return t[k]; if (typeof k === 'string' && /^[a-zA-Z]/.test(k) && !k.startsWith('on')) { t[k] = param(); return t[k]; } return undefined; },
  set(t, k, v) { t[k] = v; return true; },
});
const ctx = { currentTime: 1, sampleRate: 44100, state: 'running', made: { src: 0, osc: 0, gain: 0, buf: 0 },
  createGain() { this.made.gain++; return mkNode(); }, createBiquadFilter: () => mkNode(), createWaveShaper: () => mkNode(), createPanner: () => mkNode(),
  createBufferSource() { this.made.src++; return mkNode(); }, createOscillator() { this.made.osc++; return mkNode(); },
  createBuffer(ch, len) { this.made.buf++; return { length: len, copyToChannel() {}, getChannelData: () => new Float32Array(len) }; } };

// ---------------------------------------------------------------- fake game
const mkArm = () => { const sh = { rotation: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } } }; const el = { rotation: { x: 0 }, parent: sh }; return { hand: { parent: el }, sh, el }; };
const mkAvatar = () => { const L = mkArm(), R = mkArm(); return { parts: { neck: { rotation: { x: 0 } }, torso: { rotation: { x: 0, z: 0 }, add() {} }, handL: L.hand, handR: R.hand }, _arms: { L, R } }; };
function makeGame() {
  const handlers = new Map();
  const mods = { on(ev, fn) { const a = handlers.get(ev) || []; a.push(fn); handlers.set(ev, a); return () => { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }; }, emit(ev, ...args) { for (const f of [...(handlers.get(ev) || [])]) f(...args); } };
  const item = { id: 'i1', type: 'guitar_acoustic', def: ITEMS.guitar_acoustic, obj: { visible: true } };
  const net = { sent: [], requests: [], broadcasts: [], handlers: new Map(), relayTypes: new Set(), send(t, d) { this.sent.push([t, d]); }, request(a, d) { this.requests.push([a, d]); }, broadcast(t, d) { this.broadcasts.push([t, d]); }, on_(t, f) { this.handlers.set(t, f); }, on() { return () => {}; } };
  const g = {
    mods, net, selfId: 'me', isHost: true, settings: { instrumentVolume: 0.8 }, run: { phase: 'moon', day: 3, runId: 'r' },
    audio: { ctx, master: mkNode(), reverb: mkNode(), resume() {}, ui() {}, occluder: null },
    player: { dead: false, grounded: true, frozen: false, vel: { x: 3, y: 0, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, pos: { x: 0, y: 0, z: 0 }, inShip: false, indoor: true,
      heldItem: () => item, eyePos: () => ({ toArray: () => [0, 1.6, 0], x: 0, y: 1.6, z: 0 }) },
    emotes: { current: null, avatar: mkAvatar(), play(def) { this.current = def; }, stop() { this.current = null; } },
    input: { locked: true, down: new Set(['KeyW', 'KeyG']), mouseButtons: new Set([0]), isTyping: () => false },
    ui: { toasts: [], toast(m) { this.toasts.push(m); }, blocksInput: () => false },
    minigame: null, terminal: { active: false }, cruiser: null, remotes: new Map(), items: { all: () => [item] }, camera: { position: { x: 0, y: 1.6, z: 0, distanceTo() { return 0; } } },
    balance: { noises: [], noise(pos, amt) { this.noises.push(amt); } },
    hostBoomboxNear() { return false; },
  };
  return { g, item, net, mods };
}
// KeyboardEvent-alike dispatch through the registered window listeners (capture order, stopImmediatePropagation honoured)
function fire(type, props = {}) {
  let stopped = false;
  const ev = { type, code: '', shiftKey: false, repeat: false, button: 0, deltaY: 1, preventDefault() {}, stopImmediatePropagation() { stopped = true; }, ...props };
  for (const l of [...listeners]) { if (l.t !== type) continue; l.f(ev); if (stopped) break; }
  return stopped;
}
const key = (code, o = {}) => { const s = fire('keydown', { code, ...o }); fire('keyup', { code, ...o }); return s; };
const flushNet = async () => { await Promise.resolve(); await Promise.resolve(); };
const events = (net) => net.sent.filter(([t]) => t === 'mu').flatMap(([, d]) => d.e);

// ---------------------------------------------------------------- tests
const { g, item, net, mods } = makeGame();
g.localActions = function (dt, input) { this._sawEnabled = input.enabled; };
g.input.enabled = true;
const api = installMusic(g);

await t('install: items, loot tables, emotes, translations registered', () => {
  for (const id of ['guitar_acoustic', 'guitar_electric', 'keytar', 'drumpad']) { assert.ok(ITEMS[id], id); assert.equal(ITEMS[id].shop, 'music'); assert.ok(ITEMS[id].price > 0 && ITEMS[id].price < 250); assert.equal(ITEMS[id].hands, 1); assert.ok(ITEMS[id].value[1] > ITEMS[id].value[0]); }
  for (const th of ['factory', 'mansion', 'office', 'hospital', 'sewer', 'serverfarm']) assert.ok(SCRAP_TABLE[th].some((e) => /guitar|keytar|drumpad/.test(e[0])), th);
  for (const ins of SB.INSTRUMENTS) assert.equal(EMOTE_BY_ID['mu_' + ins.id].musicItem, ins.item);
  assert.ok(api && typeof api.enter === 'function');
});

await t('LMB (useItem hook) enters play mode: emote, movement lock, listeners', () => {
  const hk = { handled: false };
  mods.emit('useItem', item, hk, g);
  assert.equal(hk.handled, true); assert.equal(api.playing, true);
  assert.equal(g.emotes.current, EMOTE_BY_ID.mu_gac); assert.equal(g.player.frozen, true);
  assert.equal(g.player.vel.x, 0);                                                     // no residual slide
  assert.equal(g.input.down.has('KeyW'), false); assert.equal(g.input.down.has('KeyG'), false);   // stale held keys cleared
  assert.ok(listeners.some((l) => l.t === 'keydown') && listeners.some((l) => l.t === 'mousedown') && listeners.some((l) => l.t === 'wheel'));
});

await t('the game\'s own per-frame actions run with input disabled while playing (drop / throw / hotbar cannot fire)', () => {
  g.localActions(0.016, g.input);
  assert.equal(g._sawEnabled, false); assert.equal(g.input.enabled, true, 'restored');
});

await t('chord keys 1-8 strum real chords; SHIFT gives variants; keys never leak to the game', async () => {
  assert.equal(key('Digit1'), true);                                                   // swallowed
  assert.equal(key('KeyG'), true);                                                     // would be "drop"
  assert.equal(key('KeyF'), true);                                                     // would be "flashlight"
  assert.equal(fire('keydown', { code: 'KeyV' }), false);                               // voice PTT passes through
  await flushNet();
  let evs = events(net);
  assert.deepEqual(SB.decodeChord(evs[0][1]), { root: 0, q: 0, oct: 0 });              // C major
  assert.equal(evs[0][0], 0); assert.equal(evs[0][3] & SB.F_CHORD, SB.F_CHORD);
  net.sent.length = 0;
  key('Digit3'); key('Digit3', { shiftKey: true }); key('Digit7');
  await flushNet();
  const names = events(net).map((e) => { const c = SB.decodeChord(e[1]); return SB.chordName(c.root, c.q); });
  assert.deepEqual(names, ['Am', 'A7', 'E7']);
  assert.ok(ctx.made.src >= 6 * 4, 'guitar strings were synthesised: ' + ctx.made.src);
});

await t('mouse strums (LMB down, RMB up) and the wheel strums; octave shifts voicing', async () => {
  net.sent.length = 0;
  fire('mousedown', { button: 0 }); fire('mousedown', { button: 2 });
  await sleep(90); fire('wheel', { deltaY: -1 });
  await flushNet();
  const evs = events(net);
  assert.equal(evs.length, 3);
  assert.equal(evs[0][3] & SB.F_UP, 0); assert.equal(evs[1][3] & SB.F_UP, SB.F_UP); assert.equal(evs[2][3] & SB.F_UP, SB.F_UP);
  net.sent.length = 0;
  key('KeyX'); key('KeyX'); key('Space');
  await flushNet();
  assert.equal(SB.decodeChord(events(net)[0][1]).oct, 1);                              // clamped to +1
  key('KeyZ'); key('KeyZ'); key('KeyZ'); net.sent.length = 0; key('Space'); await flushNet();
  assert.equal(SB.decodeChord(events(net)[0][1]).oct, -1);
});

await t('lead mode (Q): piano-row keys play single notes with real MIDI numbers', async () => {
  key('KeyQ'); key('KeyX'); key('KeyX');                                               // octave 3 -> back up: lead octave starts at baseOct 3
  const st = api.state();
  assert.equal(st.mode, 'lead');
  net.sent.length = 0;
  fire('keydown', { code: 'KeyA' }); fire('keyup', { code: 'KeyA' });
  await flushNet();
  const oct = api.state().octave;
  assert.deepEqual(events(net)[0].slice(0, 2), [0, (oct + 1) * 12]);                   // A = C of the current octave
  net.sent.length = 0; key('KeyW'); await flushNet();
  assert.equal(events(net)[0][1] % 12, 1);                                             // W = C#
});

await t('songbook follow-along: wrong notes count, right notes advance, finishing requests a capped reward', async () => {
  key('Digit0');                                                                       // guide on
  let s = api.state();
  assert.equal(s.guide.on, true); assert.equal(s.mode, 'lead');
  const song = api.songs[0];
  net.sent.length = 0; net.requests.length = 0;
  // one wrong note first (F# in Ode to Joy's E4 opening)
  const oct = s.octave, wrong = SB.midiToKey(70, oct, 0) || 'KeyU';
  key(wrong);
  assert.equal(api.state().guide.misses, 1); assert.equal(api.state().guide.idx, 0);
  for (const [m] of song.notes) {
    let k = SB.midiToKey(m, api.state().octave, 0);
    if (!k) { key(m < SB.keyToMidi('KeyA', api.state().octave) ? 'KeyZ' : 'KeyX'); k = SB.midiToKey(m, api.state().octave, 0); }
    assert.ok(k, 'reachable ' + m);
    key(k);
    await sleep(66);                                                                   // a hand plays ~15 notes / s, under the sender's rate limit
  }
  s = api.state();
  assert.equal(s.guide.done || s.guide.idx === 0, true, 'song finished');
  assert.ok(g.ui.toasts.some((m) => /accuracy/.test(m)), 'accuracy toast');
  const req = net.requests.find(([a]) => a === 'musong');
  assert.ok(req && req[1].sid === 'ode' && req[1].acc > 0.9 && req[1].acc < 1, JSON.stringify(req));
});
await t('rate limiter: a 200-key flood cannot exceed the burst', async () => {
  await sleep(1300); net.sent.length = 0;
  key('KeyQ');                                                                          // back to chord mode
  for (let i = 0; i < 200; i++) key('Digit2');
  await flushNet();
  const n = events(net).length;
  assert.ok(n > 5 && n <= 32, 'sent ' + n);
  assert.ok(net.sent.every(([, d]) => d.e.length <= SB.MU_MAX_BATCH));
});

await t('noise: playing indoors on a moon feeds game.balance.noise, throttled', async () => {
  await sleep(1700);
  g.balance.noises.length = 0;
  g.player.inShip = false; g.player.indoor = true; g.run.phase = 'moon';
  key('Digit1'); mods.emit('update', 0.016, g);
  key('Digit1'); mods.emit('update', 0.016, g);
  assert.equal(g.balance.noises.length, 1); assert.equal(g.balance.noises[0], 0.3);
  await sleep(1700); key('Digit1'); g.player.inShip = true; mods.emit('update', 0.016, g);
  assert.equal(g.balance.noises.length, 1, 'no noise in the ship');
  g.player.inShip = false;
});

await t('play mode exits: Backspace, hurt (after grace), pointer lock loss, item swap, phase change', async () => {
  const exitsOn = async (trigger) => {
    assert.equal(api.enter(item) || api.playing, true, 'enter');
    await sleep(450); await trigger(); mods.emit('update', 0.016, g);
    assert.equal(api.playing, false); assert.equal(g.player.frozen, false); assert.equal(g.emotes.current, null);
    assert.equal(listeners.some((l) => l.t === 'keydown'), false);
  };
  if (api.playing) api.exit('test');
  await exitsOn(() => fire('keydown', { code: 'Backspace' }));
  await exitsOn(() => mods.emit('localHurt', { dmg: 12 }, g));
  assert.ok(g.ui.toasts.some((m) => /startled/.test(m)));
  await exitsOn(() => { g.input.locked = false; });
  g.input.locked = true;
  await exitsOn(() => { g.player.heldItem = () => null; });
  g.player.heldItem = () => item;
  await exitsOn(() => mods.emit('phase', 'takeoff', g));
  assert.equal(api.enter(item), true); g.player.dead = true; mods.emit('update', 0.016, g); assert.equal(api.playing, false); g.player.dead = false;
});

await t('cannot enter while dead / airborne / in a panel', () => {
  g.player.grounded = false; assert.equal(api.enter(item), false); g.player.grounded = true;
  g.ui.blocksInput = () => true; assert.equal(api.enter(item), false); g.ui.blocksInput = () => false;
  g.emotes.current = {}; assert.equal(api.enter(item), false); g.emotes.current = null;
});

await t('keytar: piano row, scale lock, sustain + e-piano flags; drums: pads + mouse', async () => {
  const kt = { id: 'k1', type: 'keytar', def: ITEMS.keytar, obj: { visible: true } };
  g.player.heldItem = () => kt;
  assert.equal(api.enter(kt), true); net.sent.length = 0;
  key('KeyA'); key('KeyS'); key('KeyK'); key('KeyP');
  fire('keydown', { code: 'Space' }); key('KeyD'); fire('keyup', { code: 'Space' }); key('KeyQ'); key('KeyF');
  await flushNet();
  const ev = events(net);
  assert.deepEqual(ev.map((e) => e[1] - 60), [0, 2, 12, 15, 4, 5]);                    // C4 D4 C5 D#5 E4 F4 (keytar base octave 4)
  assert.equal(ev[4][3] & SB.F_SUS, SB.F_SUS); assert.equal(ev[5][3] & SB.F_ALT, SB.F_ALT); assert.equal(ev[5][3] & SB.F_SUS, 0);
  net.sent.length = 0; key('Digit3');                                                  // minor scale lock
  key('KeyA'); key('KeyD'); key('KeyG'); await flushNet();
  assert.deepEqual(events(net).map((e) => e[1] - 60), [0, 3, 7]);                      // C Eb G
  api.exit('test');
  const dr = { id: 'd1', type: 'drumpad', def: ITEMS.drumpad, obj: { visible: true } };
  g.player.heldItem = () => dr;
  assert.equal(api.enter(dr), true); net.sent.length = 0;
  key('KeyA'); key('KeyS'); key('Digit8'); fire('mousedown', { button: 0 }); fire('mousedown', { button: 2 }); fire('wheel', { deltaY: 1 });
  await flushNet();
  assert.deepEqual(events(net).map((e) => e[1]), [0, 1, 7, 1, 0, 2]);
  assert.ok(events(net).every((e) => e[0] === 3));
  api.exit('test'); g.player.heldItem = () => item;
});

await t('avatar animation fx runs (guitar / keytar / drums) after a hit without throwing', () => {
  const av = mkAvatar();
  const root = { position: { y: 0 }, rotation: {} };
  for (const id of ['gac', 'gel', 'key', 'drm']) {
    const def = EMOTE_BY_ID['mu_' + id];
    def.fx(av, root, 1.2);
    av._mu = { hit: performance.now(), hitL: performance.now(), hitR: performance.now(), side: 1, up: true };
    def.fx(av, root, 1.3);
  }
  assert.ok(av._arms.L.sh.rotation.x < 0);
});

await t('network receive: validates, rate-limits per sender, plays at the sender, tracks jam + calms slop', async () => {
  mods.emit('netReady', net, g);
  const h = net.handlers.get('mu'); assert.equal(typeof h, 'function'); assert.ok(net.relayTypes.has('mu'));
  g.remotes.set('p2', { id: 'p2', dead: false, pos: { x: 3, y: 0, z: 0, distanceTo: () => 3 }, avatar: mkAvatar() });
  const before = ctx.made.src + ctx.made.osc;
  h({ e: [[2, 60, 100, 0], [2, 64, 100, 0], [2, 67, 100, 0], [9, 1, 1, 1], ['x'], null] }, 'p2');
  assert.ok(ctx.made.src + ctx.made.osc > before, 'synthesised');
  assert.equal(api.recent().find((r) => r.id === 'p2').n, 3, 'invalid events ignored');
  assert.ok(g.remotes.get('p2').avatar._mu.hit > 0, 'remote avatar animates');
  const b2 = ctx.made.osc;
  h({ e: [[2, 60, 100, 0]] }, 'nobody');                                               // unknown sender
  h({ e: [[2, 60, 100, 0]] }, 'me');                                                   // own echo
  assert.equal(ctx.made.osc, b2);
  let played = 0;
  const b3 = ctx.made.osc;
  for (let i = 0; i < 60; i++) h({ e: Array.from({ length: 16 }, () => [2, 60, 100, 0]) }, 'p2');
  played = ctx.made.osc - b3;
  assert.ok(played > 0 && played < 60 * 16 * 3 * 0.2, 'flood limited: ' + played);
  await sleep(1900);                                                                   // the sender's bucket refills
  // jam: I play too, both within 8 m in the ship phase
  g.run.phase = 'orbit';
  api.enter(item); key('Digit1'); key('Digit2'); key('Digit1'); key('Digit2');
  h({ e: [[2, 60, 100, 0], [2, 62, 100, 0], [2, 64, 100, 0]] }, 'p2');
  g.net.broadcasts.length = 0;
  mods.emit('update', 0.6, g);
  const jam = api.state().jam.sort();
  assert.deepEqual(jam, ['me', 'p2']);
  assert.equal(g.hostBoomboxNear({ x: 2, y: 0, z: 0 }, 14), true);                     // music calms AI Slop nearby
  assert.equal(g.hostBoomboxNear({ x: 200, y: 0, z: 0 }, 14), false);
  // far away peer is not a jam partner
  g.remotes.get('p2').pos.x = 40; h({ e: [[2, 60, 100, 0], [2, 62, 100, 0], [2, 64, 100, 0]] }, 'p2');
  mods.emit('update', 0.6, g);
  assert.deepEqual(api.state().jam, []);
  api.exit('test');
});

await t('host: song reward is validated and capped per day; jam XP is capped', async () => {
  const H = new Map();
  mods.emit('registerHandlers', (a, f) => H.set(a, f), g);
  const song = H.get('musong'); assert.equal(typeof song, 'function');
  g.net.broadcasts.length = 0;
  song({ sid: 'ode', acc: 0.95 }, 'p2'); song({ sid: 'nope', acc: 0.95 }, 'p2'); song({ sid: 'ode', acc: 0.3 }, 'p2'); song({ sid: 'ode', acc: 5 }, 'p2');
  assert.equal(g.net.broadcasts.filter(([t]) => t === 'xp').length, 1);
  for (let i = 0; i < 6; i++) song({ sid: 'twinkle', acc: 1 }, 'p2');
  assert.equal(g.net.broadcasts.filter(([t]) => t === 'xp').length, 3);               // 3 / day
  const x = g.net.broadcasts.find(([t]) => t === 'xp')[1];
  assert.ok(x.to === 'p2' && x.xp >= 8 && x.xp <= 24 && x.coin <= 1);
});

await t('Company Store lists the instruments in a "music" tab, priced under the premium-stock threshold', async () => {
  const shop = await import('../../src/game/shop.js');
  const entries = shop.catalogEntries().filter((e) => e.cat === 'music');
  assert.deepEqual(entries.map((e) => e.id).sort(), ['drumpad', 'guitar_acoustic', 'guitar_electric', 'keytar']);
  assert.ok(entries.every((e) => e.currency === 'credits' && e.base > 0 && e.base < 250));
  assert.ok(shop.categoryList().some((c) => c.id === 'music' && c.name === 'Music'));
});

await t('models: each instrument builds a few merged meshes with sane real-world size', async () => {
  const THREE = await import('three');
  const { createInstrumentMesh, INSTRUMENT_MODELS, INSTRUMENT_POSE } = await import('../../src/models/instruments.js');
  const dims = { guitar_acoustic: [0.9, 1.15], guitar_electric: [0.9, 1.15], keytar: [0.9, 1.25], drumpad: [0.25, 0.4] };
  for (const id of Object.keys(INSTRUMENT_MODELS)) {
    const m = createInstrumentMesh(id);
    let meshes = 0; m.traverse((o) => { if (o.isMesh) meshes++; });
    assert.ok(meshes >= 2 && meshes <= 10, id + ' meshes ' + meshes);
    const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z);
    assert.ok(longest >= dims[id][0] && longest <= dims[id][1], id + ' longest side ' + longest.toFixed(2));
    assert.ok(INSTRUMENT_POSE[id].scale > 0);
  }
});

await t('dispose removes listeners, docks and the boombox wrapper', () => {
  api.dispose();
  assert.equal(listeners.length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(g, 'hostBoomboxNear'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(g, 'localActions'), false);
});

console.log(`\n${pass} sim tests passed` + (process.exitCode ? ' (with failures)' : ''));
process.exit(process.exitCode || 0);
