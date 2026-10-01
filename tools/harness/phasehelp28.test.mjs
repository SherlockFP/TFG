import assert from 'node:assert/strict';
import { register } from 'node:module';
import { setLang } from '../../src/core/i18n.js';
register('data:text/javascript,' + encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c)}"));
const { Game } = await import('../../src/game/game.js');
const { HUD } = await import('../../src/ui/hud.js');
const { UI } = await import('../../src/ui/ui.js');

// Real tutorial caller and native Game.later; deterministic timer delivery only.
const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
let callbacks = new Map(), serial = 0;
globalThis.setTimeout = fn => { const id = ++serial; callbacks.set(id, fn); return id; };
globalThis.clearTimeout = id => callbacks.delete(id);
const fresh = (phase = 'orbit') => {
  const lines = [];
  const g = Object.assign(Object.create(Game.prototype), {
    profile: {}, run: { phase, moon: 'hamsi', seed: 19, day: 1 }, net: {},
    progress: { save() {} }, ui: { toast: line => lines.push(line), blocksInput: () => false },
    onboard: { fr: { active: () => false } }, fleet13: { docked: () => false },
  });
  return { g, lines };
};
const deliver = () => { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(fn => fn()); };
const deliverOwned = g => { for (const id of [...g._timers]) { const fn = callbacks.get(id); callbacks.delete(id); fn(); } };
const previousDocument = globalThis.document, previousWindow = globalThis.window;
class Node {
  children = []; classes = new Set(); style = {};
  classList = { add: (...names) => names.forEach(n => this.classes.add(n)), remove: (...names) => names.forEach(n => this.classes.delete(n)), contains: name => this.classes.has(name), toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) };
  set className(value) { this.classes = new Set(value.split(' ')); }
  appendChild(node) { node.parent = this; this.children.push(node); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
  setAttribute() {}
}
const nativeQueue = () => {
  callbacks.clear();
  const { g } = fresh('moon');
  const hud = Object.assign(Object.create(HUD.prototype), { game: g, run: g.run, el: new Node(), pendingToasts: [], nextFlush: 0, $: { toasts: new Node(), big: new Node() } });
  hud.$.big.classes.add('hidden');
  g.ui = Object.assign(Object.create(UI.prototype), { hud });
  globalThis.document = { createElement: () => new Node(), createTextNode: text => Object.assign(new Node(), { textContent: text }), documentElement: {} };
  globalThis.window = {};
  g.world = { facility: {}, moonId: 'hamsi' }; g.run.descent21 = { depth: 0, rev: 0 };
  return { g, hud };
};
try {
  let { g, lines } = fresh();
  g.tutorialHint('orbit');
  assert.equal(g._timers?.size, callbacks.size, 'phase advice belongs to the native session timer set');
  assert.ok(callbacks.size > 0);
  deliver();
  assert.ok(lines.some(line => /TERMINAL/.test(line)));
  assert.ok(!lines.some(line => /STORE|BUY|Phish/.test(line)), 'route console does not advertise remote purchases');
  assert.equal(g._timers.size, 0, 'native delivery releases timer ownership');
  const count = lines.length; g.tutorialHint('orbit'); deliver();
  assert.equal(lines.length, count, 'seen advice is not rescheduled');

  for (const mutate of [
    g => { g.run.phase = 'moon'; },
    g => { g.run.seed++; },
    g => { g.run.day++; },
    g => { g.run.moon = 'sazlik'; },
    g => { g.net = {}; },
    g => { g.run = { ...g.run }; },
    g => { g.destroyed = true; },
    g => { g.ui.blocksInput = () => true; },
    g => { g.onboard.fr.active = () => true; },
    g => { g.player = { dead: true }; },
    g => { g.player = { downed: true }; },
    g => { g.deadletter24 = { active: () => true }; },
    g => { g.world = { facility: {} }; },
    g => { g.run.descent21 = { depth: 1, rev: 1 }; },
  ]) {
    ({ g, lines } = fresh()); g.tutorialHint('orbit'); mutate(g); deliver();
    assert.equal(lines.length, 0, 'old or blocked context cannot deliver a queued teacher');
  }

  ({ g, lines } = fresh()); g.onboard.fr.active = () => true;
  g.tutorialHint('orbit'); assert.equal(callbacks.size, 0, 'staged first run has one teacher');
  ({ g, lines } = fresh()); g.fleet13.docked = () => true;
  g.tutorialHint('orbit'); deliver();
  assert.ok(lines.some(line => /fleet office/i.test(line)));
  assert.ok(!lines.some(line => /TERMINAL|LEVER/.test(line)), 'dock task precedes the ship console');
  ({ g, lines } = fresh()); g.fleet13.docked = () => true; g.run.fleet13 = { selected: 'courier' };
  g.tutorialHint('orbit'); deliver();
  assert.ok(lines.some(line => /Board your selected/.test(line)));
  ({ g, lines } = fresh()); g.fleet13.docked = () => true;
  g.tutorialHint('orbit'); g.run.fleet13 = { selected: 'courier' }; deliver();
  assert.equal(lines.length, 0, 'claim during delay expires the office advice');

  for (const lang of ['en', 'tr', 'ru']) {
    setLang(lang);
    ({ g, lines } = fresh('company')); g.tutorialHint('company'); deliver();
    assert.equal(lines.length, 2);
    if (lang !== 'en') assert.ok(!lines.some(line => /Put recovered|Visit the field/.test(line)), 'phase advice is localized before the icon prefix');
  }
  setLang('en');
  // Real UI.toast -> HUD queues: validity is checked at final delivery, not
  // only when the phase timer fires. Generic rewards retain their delivery.
  for (const change of [
    g => { g.run.phase = 'orbit'; },
    g => { g.world.facility = {}; },
    g => { g.run.descent21.depth = 1; g.run.descent21.rev++; },
    g => { g.destroyed = true; },
  ]) {
    const { g, hud } = nativeQueue(); let blocked = true; hud.gate = () => blocked;
    g.tutorialHint('moon'); deliverOwned(g); assert.equal(hud.pendingToasts.length, 3);
    g.ui.toast('Earned reward', 'good'); change(g); blocked = false; hud.flushPending();
    assert.deepEqual(hud.$.toasts.children.map(n => n._tx), ['Earned reward']);
    assert.equal(hud.pendingToasts.length, 0);
  }
  {
    const { g, hud } = nativeQueue();
    g.ui.toast('First reward', 'good'); g.ui.toast('Second reward', 'good');
    g.tutorialHint('moon'); deliverOwned(g); assert.equal(hud.toastQ.length, 3);
    g.run.phase = 'company'; hud.$.toasts.children = []; hud.flushPending();
    assert.equal(hud.$.toasts.children.length, 0); assert.equal(hud.toastQ.length, 0);
  }
  {
    const { g, hud } = nativeQueue();
    g.tutorialHint('moon'); deliverOwned(g); assert.equal(hud.$.toasts.children.length, 2);
    g.ui.toast('Native warning', 'warn'); assert.ok(hud.toastQ.some(p => p[3]), 'warning preemption retains advice validity');
    g.run.phase = 'orbit'; hud.flushPending();
    assert.deepEqual(hud.$.toasts.children.map(n => n._tx), ['Native warning']);
    assert.equal(hud.toastQ.length, 0);
  }
  {
    const { g, hud } = nativeQueue();
    g.tutorialHint('moon'); deliverOwned(g);
    // Stop the native update just after its real notification/phase boundary;
    // unrelated compass/health/renderer DOM is outside this queue fixture.
    const boundary = new Error('notification boundary');
    hud.flushPending = function() { HUD.prototype.flushPending.call(this); throw boundary; };
    g.onegoal = { hot: () => true };
    assert.throws(() => hud.update(.016, g), e => e === boundary);
    assert.equal(hud.$.toasts.children.length, 0);
    assert.ok(hud.pendingToasts.every(p => typeof p[3] === 'function'));
    g.run.phase = 'orbit'; g.onegoal.hot = () => false;
    assert.throws(() => hud.update(.016, g), e => e === boundary);
    assert.equal(hud.$.toasts.children.length, 0); assert.equal(hud.pendingToasts.length, 0);
  }
  console.log('phasehelp28: native session-owned, current-context advice passes');
} finally {
  globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; setLang('en');
  if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
}
