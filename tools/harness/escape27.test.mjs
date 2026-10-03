import assert from 'node:assert/strict';
import { Input } from '../../src/core/input.js';
import { UI } from '../../src/ui/ui.js';
import { Terminal } from '../../src/game/terminal.js';
import { installRouteboard } from '../../src/game/routeboard.js';
import { createMinigame } from '../../src/minigames/common.js';
import { hasEscapeLayer27, installEscape27 } from '../../src/ui/escape27.js';

// DOM/event fixture models capture before target/bubble, unlike Node EventTarget.
// Real Input, UI.closePanel/closeChat, Terminal.close and minigame handlers execute.
class Events {
  listeners = [];
  addEventListener(type, fn, capture = false) { this.listeners.push({ type, fn, capture: capture === true }); }
  removeEventListener(type, fn, capture = false) { this.listeners = this.listeners.filter(v => v.type !== type || v.fn !== fn || v.capture !== (capture === true)); }
  dispatchEvent(e) {
    e.immediate = false; e.propagationStopped = false;
    const stop = e.stopImmediatePropagation.bind(e);
    e.stopImmediatePropagation = () => { e.immediate = true; stop(); };
    const stopPropagation = e.stopPropagation.bind(e);
    e.stopPropagation = () => { e.propagationStopped = true; stopPropagation(); };
    for (const phase of [true, false]) {
      if (!phase && e.propagationStopped) break;
      for (const v of [...this.listeners]) if (!e.immediate && v.type === e.type && v.capture === phase) v.fn(e);
    }
    return !e.defaultPrevented;
  }
}
class Node extends Events {
  classes = new Set(); children = []; style = { setProperty() {} }; isConnected = true;
  set className(v) { this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classes].join(' '); }
  classList = { add: (...v) => v.forEach(x => this.classes.add(x)), remove: (...v) => v.forEach(x => this.classes.delete(x)), contains: v => this.classes.has(v) };
  append(...v) { this.children.push(...v); }
  appendChild(v) { this.append(v); return v; }
  setAttribute() {}
  getContext() { return {}; }
  querySelectorAll() { return []; }
  remove() { this.isConnected = false; }
  focus() { document.activeElement = this; }
  blur() { document.activeElement = null; }
}
const win = globalThis.window = new Events(), doc = globalThis.document = new Events();
doc.activeElement = null; doc.pointerLockElement = null; doc.body = new Node();
doc.documentElement = new Node(); doc.head = new Node(); doc.createElement = () => new Node();
const input = new Input({ requestPointerLock: () => Promise.resolve() }, { keys: { emoteWheel: 'KeyB' }, fullscreenPlay: false });
let locks = 0; input.lock = () => { locks++; };
const ui = { panelOpen: null, dialogEl: null, chatOpen: false, overlay: new Node(), chatEl: new Node(), chatIn: new Node(),
  closePanel: UI.prototype.closePanel, closeChat: UI.prototype.closeChat, fullscreenOpen: () => false };
let pauses = 0;
ui.openPause = () => { pauses++; ui.panelOpen = new Node(); ui.panelOpen.classList.add('pause'); };
const game = { player: { dead: false, frozen: true }, terminal: { active: false } };
const app = { ui, input, game }; ui.app = app;
const uninstall = installEscape27(app, win);
function key(props = {}) {
  const e = new Event('keydown', { cancelable: true });
  Object.assign(e, { code: 'Escape', key: 'Escape', ...props });
  win.dispatchEvent(e); return e;
}
function panel() { ui.panelOpen = new Node(); ui.marketOpen = true; }

for (const kind of ['inventory', 'map', 'codex', 'wardrobe', 'settings', 'skill-tree', 'shop']) {
  panel(); let disposed = 0; ui.onPanelClose = () => { disposed++; return false; };
  doc.activeElement = { tagName: 'INPUT', type: 'text' };
  assert.ok(key().defaultPrevented, kind);
  assert.equal(ui.panelOpen, null); assert.equal(ui.marketOpen, false); assert.equal(disposed, 1);
  assert.equal(pauses, 0); assert.equal(input.down.has('Escape'), false); assert.equal(input.pressedSet.has('Escape'), false);
}
doc.activeElement = null;
panel(); ui.dialogEl = new Node(); let dialogValue;
ui.dialogResolve = value => { dialogValue = value; ui.dialogEl = null; ui.dialogResolve = null; };
key(); assert.equal(dialogValue, null); assert.ok(ui.panelOpen); assert.equal(pauses, 0);
let rebound = 0; ui.cancelRebind = () => { rebound++; ui.cancelRebind = null; };
key(); assert.equal(rebound, 1); assert.ok(ui.panelOpen);
ui.chatOpen = true; key(); assert.equal(ui.chatOpen, false); assert.ok(ui.panelOpen);
key(); assert.equal(ui.panelOpen, null);
// Native close callback can restore the terminal: no cascade closes it as well.
panel(); ui.onPanelClose = () => { game.terminal.active = true; return true; };
key(); assert.equal(ui.panelOpen, null); assert.equal(game.terminal.active, true); assert.equal(pauses, 0);
game.terminal = { active: true, game: { player: game.player, input }, el: new Node(), inp: new Node(), close: Terminal.prototype.close };
const termScreen = new Node(); game.terminal.el.querySelector = () => termScreen;
game.terminal.open = function () { this.active = true; }; game.terminal.exec = () => {};
game.terminal.hostExecute = () => {};
game.mods = { on: () => () => {} }; game.run = { phase: 'orbit', moon: 'hamsi', quotaIndex: 0, day: 1, seed: 5 };
game.routeboard = installRouteboard(game);
assert.equal(game.routeboard.visible(), false, 'unmounted native board is not a layer');
assert.equal(game.routeboard.show(), true);
assert.equal(game.routeboard.visible(), true);
assert.ok(hasEscapeLayer27(app), 'native visible board blocks pointer-unlock pause');
key(); assert.equal(game.routeboard.visible(), false); assert.equal(game.terminal.active, true);
assert.ok(hasEscapeLayer27(app), 'prompt remains the input owner after board closes');
key(); assert.equal(game.terminal.active, false); assert.equal(game.player.frozen, false);
assert.equal(hasEscapeLayer27(app), false, 'closed board and terminal release the layer');
game.routeboard.dispose(); game.routeboard = null;
game.magic = { wheelOpen: true, closeWheel(cast) { assert.equal(cast, false); this.wheelOpen = false; } };
key(); assert.equal(game.magic.wheelOpen, false); assert.equal(pauses, 0);
input.down.add('KeyB'); input.pressedSet.add('KeyB');
game.emotes = { wheelOpen: true, wheelUI: { close() { return { id: 'selected-must-not-play' }; } } };
key(); assert.equal(game.emotes.wheelOpen, false); assert.equal(input.down.has('KeyB'), false);
game.homeworld2 = { building: true, stop() { this.building = false; } };
assert.ok(hasEscapeLayer27(app)); key(); assert.equal(game.homeworld2.building, false); assert.equal(pauses, 0);
let codeCloses = 0;
game.facjobs = { codeOpen: true, closeCode() { codeCloses++; this.codeOpen = false; } };
assert.ok(hasEscapeLayer27(app), 'vault popup blocks pointer-unlock auto-pause');
key(); assert.equal(codeCloses, 1); assert.equal(game.facjobs.codeOpen, false); assert.equal(pauses, 0);

// Actual native pending outcome flushes once; Escape must not silently cancel it.
let results = [];
const mg = createMinigame({ container: new Node(), onDone: r => { results.push(r); game.minigame = null; mg.api.destroy(); } },
  { kind: 'test', title: 'TEST', width: 32, height: 32 });
game.minigame = mg.api;
mg.finishAfter({ success: true, prize: 12 }, 2);
key(); assert.equal(results.length, 1); assert.equal(results[0].success, true); assert.equal(results[0].prize, 12); assert.equal(pauses, 0);
const mg2 = createMinigame({ container: new Node(), onDone: r => { results.push(r); game.minigame = null; mg2.api.destroy(); } },
  { kind: 'test', title: 'TEST', width: 32, height: 32 });
game.minigame = mg2.api;
key(); assert.equal(results.length, 2); assert.equal(results[1].cancelled, true); assert.equal(pauses, 0);
// Native capture popups which prevent default own the gesture before fallback.
const popup = e => { e.preventDefault(); e.stopImmediatePropagation(); win.removeEventListener('keydown', popup, true); };
win.addEventListener('keydown', popup, true); key(); assert.equal(pauses, 0);
assert.equal(key({ isComposing: true }).defaultPrevented, false); assert.equal(pauses, 0);
ui.fullscreenOpen = () => true; key(); assert.equal(pauses, 0); ui.fullscreenOpen = () => false;
key(); assert.equal(pauses, 1); assert.ok(ui.panelOpen);
key({ repeat: true }); assert.ok(ui.panelOpen); assert.equal(pauses, 1);
key(); assert.equal(ui.panelOpen, null); assert.equal(pauses, 1);
// An already open pause always closes on the first explicit Escape gesture.
ui.openPause(); app.pauseFromUnlockAt = performance.now(); key(); assert.equal(ui.panelOpen, null);
ui.currentScreen = 'settings'; ui.menuEl = new Node(); app.game = null;
let backs = 0; ui.backOf = () => ({ click() { backs++; } }); doc.activeElement = { tagName: 'INPUT' };
key(); assert.equal(backs, 1); assert.equal(pauses, 2);
uninstall();
assert.ok(locks > 0);
console.log('escape27: captured foremost menus/text/rebind/chat/native close handoff, wheel/build cancellation, native pending/cancel minigames, popup priority, IME, pause repeat and first-gesture pause close passed');
