// Node smoke test of src/game/fpbody.js against a mocked Game (no browser): bubbles, first-person body, item fitting through the real
// view model (arm IK + live penetration check), dt smoothing.   node tools/harness/fpbody_smoke.mjs
import * as THREE from 'three';
const { installFpBody } = await import('../../src/game/fpbody.js');
const { createViewModel } = await import('../../src/models/avatar.js');
const { createItemModel } = await import('../../src/models/items.js');
const { itemDef } = await import('../../src/game/items.js');
// item models are built without a DOM (textures.js returns null textures), THEN a minimal canvas stub is installed for the bubbles / avatar
const prebuilt = {};
for (const id of ['mug', 'register', 'shovel', 'shotgun', 'flashlight', 'boombox', 'body', 'bell', 'axle', 'rod']) {
  const inner = createItemModel(id); const root = new THREE.Group(); root.add(inner);
  const bb = new THREE.Box3().setFromObject(inner); const c = bb.getCenter(new THREE.Vector3()); inner.position.sub(c); root.userData.gripOffset = c.clone();
  prebuilt[id] = root;
}
const ctxStub = new Proxy({}, { get: (t, k) => (k === 'measureText' ? (s) => ({ width: String(s).length * 9 }) : k in t ? t[k] : () => ctxStub), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }), documentElement: {} };

const out = {}; const errs = [];
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 420); scene.add(camera);
const listeners = new Map();
const mods = { on(ev, fn) { (listeners.get(ev) || listeners.set(ev, []).get(ev)).push(fn); return () => {}; }, emit(ev, ...a) { for (const fn of listeners.get(ev) || []) fn(...a); } };
let depthRangeCalls = 0;
const gl = { depthRange() { depthRangeCalls++; } };
const floats = [];
const vm = createViewModel({}); camera.add(vm.root);
const game = {
  scene, camera, settings: {}, engine: { scene, camera, renderer: { getContext: () => gl, compile() {} } }, mods, remotes: new Map(), selfId: 'me', time: 0,
  profile: { suit: 'orange' }, ui: { hud: { floatText(pos, text) { floats.push(text); } } }, physics: { lineOfSight: () => true }, emotes: { active: false }, viewModel: vm, _hand: null,
  player: { pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(), yaw: 0, pitch: 0, crouch: false, grounded: true, sprinting: false, dead: false, hSpeed: 0, stepOff: 0, airT: 0 },
  updated: [], update(dt) { this.updated.push(dt); },
};
const api = installFpBody(game);
out.installed = !!api;

// ---- bubbles
game.remotes.set('p1', { id: 'p1', pos: new THREE.Vector3(2, 0, -3), dead: false, crouch: false, emoteNet: null, emoteDef: null });
mods.emit('chat', { text: 'hello there crew', n: 'Bob' }, 'p1');
mods.emit('chat', { text: 'this is a really long message that should wrap onto two lines and then get cut off with an ellipsis because nobody reads walls of text above a head', n: 'Bob' }, 'p1');
mods.emit('chat', { text: 'FIRE!', n: '✦ Bob' }, 'p1');
mods.emit('chat', { text: 'x'.repeat(80), n: 'Bob' }, 'p1');       // one huge word: broken by characters
mods.emit('update', 0.016);
const b = api.bubbles('p1');
out.bubbles = { count: b.length, kinds: b.map((x) => x.kind), lines: b.map((x) => x.lines), ttl: b.map((x) => x.ttl), sprites: api.bubbleSprites(), texts: b.map((x) => x.text.slice(0, 40) + (x.text.length > 40 ? '...' : '')) };
mods.emit('chat', { text: 'self message', n: 'Me' }, 'me'); out.selfIgnored = api.bubbles('me').length === 0;
mods.emit('chat', { text: 'tfg system', n: 'TFG' }, 'p1'); out.tfgIgnored = api.bubbles('p1').length === 3;
// spell float text is turned into a bubble
game.ui.hud.floatText(new THREE.Vector3(2, 2.1, -3), '✦ ZAP!', '#ff0', true);
out.spellFloatToBubble = floats.length === 0 && api.bubbles('p1').some((x) => x.text.includes('ZAP'));
game.ui.hud.floatText(new THREE.Vector3(30, 2.1, 30), '✦ ZAP!', '#ff0', true);
out.unmatchedFallsThrough = floats.length === 1;
// emote
game.remotes.get('p1').emoteNet = 'wave'; game.remotes.get('p1').emoteDef = { name: 'Wave' };
mods.emit('update', 0.016); mods.emit('update', 0.016);
out.emoteBubble = api.bubbles('p1').some((x) => x.kind === 'emote' && x.text === '* Wave *');
// distance / expiry
for (let i = 0; i < 20; i++) mods.emit('update', 0.016);
const near = api.bubbles('p1').map((x) => +x.alpha.toFixed(2));
game.remotes.get('p1').pos.set(40, 0, 0);
for (let i = 0; i < 5; i++) mods.emit('update', 0.016);
out.farHidden = api.bubbles('p1').every((x) => !x.visible);
game.remotes.get('p1').pos.set(2, 0, -3);
for (let i = 0; i < 700; i++) mods.emit('update', 0.016);
out.expired = api.bubbles('p1').length === 0;
out.nearAlpha = near;

// ---- first-person body
game.player.pos.set(0, 0, 0); game.player.yaw = 0.6;
for (let i = 0; i < 30; i++) { game.player.vel.set(-Math.sin(0.6) * 4.5, 0, -Math.cos(0.6) * 4.5); game.player.hSpeed = 4.5; camera.position.set(0, 1.62, 0); camera.rotation.set(-1.2, 0.6, 0, 'YXZ'); camera.updateMatrixWorld(true); mods.emit('update', 1 / 60); }
out.body = api.bodyInfo();
game.player.crouch = true; game.player.hSpeed = 0; game.player.vel.set(0, 0, 0); camera.position.set(0, 0.95, 0); camera.updateMatrixWorld(true);
for (let i = 0; i < 40; i++) mods.emit('update', 1 / 60);
out.bodyCrouch = { minCameraDist: api.bodyInfo().minCameraDist };
game.player.crouch = false; game.player.dead = true; mods.emit('update', 1 / 60); out.hiddenWhenDead = api.body.root.visible === false;
game.player.dead = false;

// ---- held items through the real view model
const inspect = [];
for (const id of Object.keys(prebuilt)) {
  const def = itemDef(id); if (!def) continue;
  const root = prebuilt[id];
  vm.handR.add(root);
  const it = { type: id, obj: root, def };
  const placed = api.placeHeld(it, def);
  const holding = def.hands === 2 || def.kind === 'big' || id === 'body' ? 'twohand' : 'onehand';
  for (let i = 0; i < 60; i++) vm.update(0.05, { holding, grip: api.gripOf(it), moveBob: 0, time: i * 0.05 });
  camera.position.set(0, 1.62, 0); camera.rotation.set(0, 0, 0); camera.updateMatrixWorld(true);
  const r = api.checkHeld(it);
  inspect.push({ placed, ...r });
  vm.handR.remove(root);
}
out.held = inspect.map((r) => `${r.type}(${r.cls}) pen=${r.penetrationCm}cm behindNear=${r.behindNearPct}% ctrNDC=${r.centreNdc} corners=${r.cornersInFrustum}/8 palm=${r.palmToItemCm}cm`);
// ---- dt smoothing
const raw = []; let s = 7;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const smoothed = [];
for (let i = 0; i < 600; i++) { const dt = 1 / 60 + (rnd() - 0.5) * 0.005; raw.push(dt); smoothed.push(api.smoothDt(dt)); }
const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
out.dt = { rawStdMs: +(sd(raw) * 1000).toFixed(3), smoothedStdMs: +(sd(smoothed) * 1000).toFixed(3), sumDriftMs: +(1000 * (smoothed.reduce((a, b2) => a + b2, 0) - raw.reduce((a, b2) => a + b2, 0))).toFixed(2), hitchPassThrough: api.smoothDt(0.05) === 0.05 };
game.update(1 / 60); out.updatePatched = game.updated.length === 1;
api.dispose(); out.disposed = true; out.updateRestored = Object.prototype.hasOwnProperty.call(game, 'update');
console.log(JSON.stringify(out, null, 1));
