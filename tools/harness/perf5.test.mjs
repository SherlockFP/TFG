// [perf5] steady-state per-frame cost profiler for the wave-8 modules, on a stub game (no browser).  node tools/harness/perf5.test.mjs [--ticks N] [--all] [--json]
//  * installs the REAL modules (install* exports) on a permissive stub game (missing game systems are inert "ghost" objects), lands a facility day
//    (phase 'moon', 4 players, 6 creatures), then runs N ticks at 60 Hz through the real mods.emit('update')
//  * every 'update' handler is wrapped: avg / max ms, heap bytes allocated per call (v8 used_heap_size deltas, positive only), and DOM / raycast counters
//    (innerHTML / textContent writes, querySelector*, getBoundingClientRect / offset* reads, createElement, THREE raycasts, physics ray calls)
//  * prints the top 15 by avg and by max, plus the DOM-op table; exits 1 when a budget below is exceeded (keeps the fixed handlers fixed)
import { register } from 'node:module';
import v8 from 'node:v8';
register('data:text/javascript,' + encodeURIComponent("export async function load(u, c, n) { if (u.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return n(u, c); }"));
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? +argv[i + 1] : d; };
const TICKS = arg('--ticks', 600), DT = 1 / 60, JSON_OUT = argv.includes('--json');
const realErr = console.error, realWarn = console.warn, realLog = console.log;
const ERRS = new Map();
console.warn = console.error = (...a) => { const m = a.map((x) => (x && x.stack ? String(x.stack).split('\n').slice(0, 2).join(' ') : String(x))).join(' ').slice(0, 220); ERRS.set(m, (ERRS.get(m) || 0) + 1); };

// ------------------------------------------------------------------------------------------------ counters
const C = { html: 0, text: 0, qs: 0, rect: 0, create: 0, style: 0, ray: 0, phys: 0, canvas: 0, ghost: 0 };   // ghost = property reads on inert stub objects (their Proxy cost inflates ms; judge a handler by ms AND ghost reads)
const snap = () => ({ ...C });

// ------------------------------------------------------------------------------------------------ ghost: an inert, permissive object
const GH = Symbol('ghost');
const ZERO = () => 0;
const EMPTY_ITER = function* () {};
function ghost(name = 'g', over = null) {
  const cache = new Map(over ? Object.entries(over) : []);
  const f = function () {};
  const p = new Proxy(f, {
    get(t, k) {
      C.ghost++;
      if (k === GH) return true;
      if (k === 'then') return undefined;
      if (k === Symbol.toPrimitive) return ZERO;
      if (k === Symbol.iterator) return EMPTY_ITER;
      if (k === 'length' || k === 'size' || k === 'count') return 0;
      if (k === 'toString') return () => '';
      if (typeof k === 'symbol') return undefined;
      let v = cache.get(k); if (v === undefined) { v = ghost(name + '.' + String(k)); cache.set(k, v); } return v;
    },
    set(t, k, v) { cache.set(k, v); return true; },
    has() { return true; }, apply() { let v = cache.get('()'); if (v === undefined) { v = ghost(name + '()'); cache.set('()', v); } return v; }, construct() { return ghost(name + 'new'); },
  });
  return p;
}

// ------------------------------------------------------------------------------------------------ DOM / browser globals
globalThis.window = globalThis;
globalThis.self = globalThis;
const noop = () => {};
globalThis.addEventListener = globalThis.removeEventListener = noop;
globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = noop;
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node', language: 'en', getGamepads: () => [], hardwareConcurrency: 4 }, configurable: true });
globalThis.innerWidth = 1280; globalThis.innerHeight = 720; globalThis.devicePixelRatio = 1;
globalThis.matchMedia = () => ({ matches: false, addEventListener: noop, addListener: noop });
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.getComputedStyle = () => ghost('cs');
class El {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase(); this.children = []; this.childNodes = this.children; this.parentNode = null; this.dataset = {}; this._attrs = {}; this._h = {};
    this._style = {}; this._cls = new Set(); this._html = ''; this._text = ''; this.width = 300; this.height = 150; this.id = ''; this.value = '';
    const self = this;
    this.style = new Proxy(this._style, { set(t, k, v) { C.style++; t[k] = v; return true; }, get(t, k) { if (k === 'setProperty') return (a, b) => { C.style++; t[a] = b; }; if (k === 'removeProperty') return (a) => { delete t[a]; }; return t[k] ?? ''; } });
    this.classList = { add: (...a) => a.forEach((c) => self._cls.add(c)), remove: (...a) => a.forEach((c) => self._cls.delete(c)), toggle: (c, on) => { const v = on ?? !self._cls.has(c); v ? self._cls.add(c) : self._cls.delete(c); return v; }, contains: (c) => self._cls.has(c), replace() {} };
  }
  get className() { return [...this._cls].join(' '); } set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get innerHTML() { return this._html; } set innerHTML(v) { C.html++; this._html = String(v); this.children.length = 0; }
  get textContent() { return this._text; } set textContent(v) { C.text++; this._text = String(v); }
  get innerText() { return this._text; } set innerText(v) { C.text++; this._text = String(v); }
  appendChild(c) { if (c && c.parentNode) c.parentNode.removeChild?.(c); this.children.push(c); if (c) c.parentNode = this; return c; }
  append(...cs) { for (const c of cs) this.appendChild(c); }
  prepend(...cs) { for (const c of cs) { this.appendChild(c); } }
  insertBefore(c) { return this.appendChild(c); }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); if (c) c.parentNode = null; return c; }
  remove() { this.parentNode?.removeChild(this); }
  replaceChildren(...cs) { this.children.length = 0; for (const c of cs) this.appendChild(c); }
  setAttribute(k, v) { this._attrs[k] = String(v); } getAttribute(k) { return this._attrs[k] ?? null; } removeAttribute(k) { delete this._attrs[k]; }
  addEventListener(t, f) { (this._h[t] ||= []).push(f); } removeEventListener() {} dispatchEvent() { return true; }
  querySelector(sel) { C.qs++; return (this._q ||= new Map()).get(sel) || (this._q.set(sel, new El('div')), this._q.get(sel)); } querySelectorAll() { C.qs++; return []; }
  getElementsByClassName() { C.qs++; return []; } getElementsByTagName() { C.qs++; return []; }
  closest() { return null; } contains() { return false; } cloneNode() { return new El(this.tagName); }
  getBoundingClientRect() { C.rect++; return { left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40, x: 0, y: 0 }; }
  get offsetWidth() { C.rect++; return 100; } get offsetHeight() { C.rect++; return 40; } get clientWidth() { C.rect++; return 100; } get clientHeight() { C.rect++; return 40; }
  get offsetLeft() { C.rect++; return 0; } get offsetTop() { C.rect++; return 0; } get scrollHeight() { C.rect++; return 40; } get scrollWidth() { C.rect++; return 100; }
  focus() {} blur() {} click() {} scrollIntoView() {}
  getContext() {
    C.canvas++;
    return new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) : (k in t ? t[k] : () => { C.canvas++; }), set: (t, k, v) => { t[k] = v; return true; } });
  }
  toDataURL() { return 'data:,'; }
}
const body = new El('body'), head = new El('head'), docEl = new El('html'), uiRoot = new El('div'); uiRoot.id = 'ui'; body.appendChild(uiRoot);
const byId = new Map();
globalThis.document = { createElement: (t) => { C.create++; return new El(t); }, createElementNS: (n, t) => { C.create++; return new El(t); }, createTextNode: (s) => { const e = new El('#text'); e._text = s; return e; },
  getElementById: (id) => { if (id === 'ui') return uiRoot; return (byId.get(id) || (byId.set(id, new El('div')), byId.get(id))); }, querySelector: (sel) => { C.qs++; return byId.get('?' + sel) || (byId.set('?' + sel, new El('div')), byId.get('?' + sel)); }, querySelectorAll: () => { C.qs++; return []; }, getElementsByClassName: () => { C.qs++; return []; },
  body, head, documentElement: docEl, addEventListener: noop, removeEventListener: noop, activeElement: null, pointerLockElement: null, hidden: false, fonts: { ready: Promise.resolve(), load: () => Promise.resolve() }, exitPointerLock: noop, hasFocus: () => true };
globalThis.Image = class { set src(v) { this.width = 8; this.height = 8; } };
globalThis.HTMLElement = El; globalThis.HTMLCanvasElement = El; globalThis.Element = El;
globalThis.AudioContext = globalThis.webkitAudioContext = undefined;
globalThis.fetch = () => Promise.reject(new Error('no net'));
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return new El('canvas').getContext(); } };
globalThis.ResizeObserver = globalThis.IntersectionObserver = globalThis.MutationObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.BroadcastChannel = class { postMessage() {} close() {} addEventListener() {} };

const THREE = await import('three');
// raycast counter (feedcams / drones / carry LOS should be batched)
for (const k of ['intersectObject', 'intersectObjects']) { const o = THREE.Raycaster.prototype[k]; THREE.Raycaster.prototype[k] = function (...a) { C.ray++; return o.apply(this, a); }; }

// ------------------------------------------------------------------------------------------------ the stub game
const { Emitter } = await import('../../src/core/events.js');
const { MOONS } = await import('../../src/game/moons.js');
const { CREATURES } = await import('../../src/game/creatures.js');
const moonId = argv.includes('--moon') ? argv[argv.indexOf('--moon') + 1] : 'hamsi';
const run0 = { seed: 1234 };
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 400); camera.position.set(0, 1.6, 0);
const lightPool = { add() {}, remove() {}, emitters: new Set(), update() {}, acquire: () => null };
const physStub = new Proxy({}, { get: () => () => ({ handle: 1 }) });
const { generateLayout, buildFacility } = await import('../../src/world/facility.js');
const layout = generateLayout(run0.seed, MOONS[moonId].interior, MOONS[moonId].size, MOONS[moonId].layoutOpts);
const facility = buildFacility(layout, { physics: physStub, lightPool }); scene.add(facility.group);
const mkPlayer = (id, x, z) => ({ id, name: id, pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(), yaw: 0, pitch: 0, hp: 100, maxHp: 100, alive: true, dead: false, downed: false, inShip: false, sprint: false, crouch: false, height: 1.7, radius: 0.35, holding: null, root: new THREE.Group(), look: new THREE.Vector3(0, 0, -1), zone: 'in', dead: false, stamina: 100, slots: [], slot: 0, eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.6, this.pos.z); }, heldItem: () => null, holderId: null });
const spots = [...(facility?.scrapSpots || [])];
const sp = (i) => spots[(i * 7) % Math.max(1, spots.length)] || { x: 6 + i * 3, y: 0, z: 4 + i };
const players = ['h', 'p1', 'p2', 'p3'].map((id, i) => { const q = mkPlayer(id, sp(i).x, sp(i).z); q.pos.y = sp(i).y || 0; return q; });
const creatureIds = ['scuttler', 'yoinker', 'lurker', 'spider', 'mannequin', 'sludge'].filter((k) => CREATURES[k]);
const views = creatureIds.map((type, i) => ({
  id: 'c' + i, type, def: CREATURES[type], pos: new THREE.Vector3(sp(i + 9).x, sp(i + 9).y || 0, sp(i + 9).z), yaw: 0, hp: 20, maxHp: 20, state: i % 2 ? 'chase' : 'idle', stateT: 0.3, hitFlash: 0, height: 1.6, dead: false, alive: true, root: new THREE.Group(), model: { height: 1.6, parts: {} },
  setState(s) { this.state = s; this.stateT = 0; }, data: {}, cooldown: 0, t: 0,
}));
const shipGroup = new THREE.Group(); for (let i = 0; i < 120; i++) { const o = new THREE.Group(); o.position.set(i % 10, 0, (i / 10) | 0); shipGroup.add(o); }
const viewMap = new Map(views.map((v) => [v.id, v]));
const game = new Proxy({
  // real bits
  mods: new Emitter(), time: 100, dtLast: DT, isHost: true, selfId: 'h', destroyed: false, paused: false, tick: 0,
  run: { phase: 'moon', moon: moonId, day: 3, daysLeft: 2, quota: 260, quotaIndex: 1, credits: 200, seed: 1234, runId: 'r1', hour: 12 * 60, clock: 12 * 60, fc: null, fc2: null, mm: {}, rs: {}, hub: {}, difficulty: 'normal', scrap: [], modifiers: [], moonState: {} },
  player: players[0], players,
  remotes: new Map(players.slice(1).map((p) => [p.id, p])),
  camera, scene, engine: { scene, camera, renderer: ghost('renderer'), fov: 70, setFov: noop },
  hostData: { dayStats: { collected: 0, kills: 0 }, killLog: [] },
  world: { facility, outdoor: null, layout },
  map: { rooms: [] },
  aiPlayers() { return players; }, aiPlayerById(id) { return players.find((p) => p.id === id); },
  allPlayers() { return players; }, getPlayer(id) { return players.find((p) => p.id === id); },
  playerName: (id) => id, playersNear() { return players; },
  later(fn, ms) { return setTimeout(fn, 0); },
  broadcastRun: noop, broadcast: noop, sendTo: noop, toast: noop, say: noop,
  net: ghost('net', { id: 'h', selfId: 'h', isHost: true, hostId: 'h', peers: ['p1', 'p2', 'p3'], broadcast: noop, send: noop, sendTo: noop, request: noop, on: noop, on_: noop, off: noop, handlers: {} }),
  physics: ghost('physics', { lineOfSight: () => { C.phys++; return true; }, raycast: () => { C.phys++; return null; }, castRay: () => { C.phys++; return null; }, groundY: () => 0, sphereCast: () => { C.phys++; return null; } , addStaticBox: () => ({}), addBox: () => ({}), removeCollider: noop, addStaticMesh: () => ({}), addCollider: () => ({}) }),
  ui: ghost('ui'), audio: ghost('audio'), sfx: noop, hud: ghost('hud'),
  creatures: ghost('creatures', { list: views, all: views, views: viewMap, host: viewMap, game: null, nearest: () => ({ p: players[0], d: 10 }), noise: noop, nav: () => null, placeAt: noop, follow: noop, byType: () => [], hostList: () => views }),
  items: ghost('items', { list: [], all: () => [], values: () => [], get: () => null, held: () => null, forEach: noop, hostSpawn: () => 'i0', nearest: () => null, [Symbol.iterator]: function* () {} }),
  ship: { group: shipGroup, interior: shipGroup },
}, {
  get(t, k) {
    if (k in t) return t[k];
    if (typeof k === 'symbol' || k === 'then') return undefined;
    const g = ghost('game.' + String(k)); t[k] = g; return g;
  },
  set(t, k, v) { t[k] = v; return true; },
});
game.creatures.game = game;
for (const v of views) v.mgr = game.creatures;
window.kefal = { game };
window.__kefalMods = game.mods;
if (!MOONS[moonId]) throw new Error('no moon ' + moonId);

// ------------------------------------------------------------------------------------------------ install the real modules
const G = '../../src/game/';
const LIST = [
  ['feedcams', 'feedcams', 'installFeedcams'], ['feedcams2', 'feedcams2', 'installFeedcams2'], ['highlights', 'highlights', 'installHighlights'], ['carry2', 'carry2', 'installCarry2'],
  ['crdirector', 'crdirector', 'installCrdirector'], ['threatpool', 'threatpool', null], ['onegoal', 'onegoal', 'installOneGoal'], ['rewardviz', 'rewardviz', 'installRewardviz'],
  ['sound2', 'sound2', 'installSound2'], ['expeditions', 'expeditions', 'installExpeditions'], ['labyrinths', 'labyrinths', 'installLabyrinths'], ['routeboard', 'routeboard', 'installRouteboard'],
  ['hudcalm', 'hudcalm', 'installHudCalm'], ['creatureRead', 'creature_read', 'installCreatureRead'], ['lcmonsters', 'lcmonsters', 'installLcmonsters'], ['loaner', 'loaner', 'installLoaner'],
  ['downed', 'downed', 'installDowned'], ['hubgate', 'hubgate', 'installHubgate'], ['mapmods', 'mapmods', 'installMapmods'], ['worlds3', 'worlds3', 'installWorlds3'], ['facjobs', 'facjobs', 'installFacjobs'],
  ['mining', 'mining', 'installMining'], ['atmos', 'atmos', 'installAtmos'], ['soul', 'soul', 'installSoul'], ['repomaps', 'repomaps', 'installRepomaps'], ['resto', 'resto', 'installResto'],
  ['arcade2', 'arcade2', 'installArcade2'], ['herocontent', 'herocontent', 'installHerocontent'], ['nvgear', 'nvgear', 'installNvgear'], ['balRules', 'balance_rules', 'installBalanceRules'],
  ['gpusweep', 'gpusweep', 'installGpuSweep'],
];
// default = every module game.js installs, in game.js order (parsed from its import + useModule lines); --tonight = the wave-8 subset above
import fs from 'node:fs';
const gsrc = fs.readFileSync(new URL(G + 'game.js', import.meta.url), 'utf8'), lsrc = fs.readFileSync(new URL(G + 'lazymods.js', import.meta.url), 'utf8');
const fileOf = {};
for (const m of gsrc.matchAll(/^import \{([^}]*)\} from '(\.[^']+)';/gm)) for (const nm of m[1].split(',')) { const n = nm.trim().split(/\s+as\s+/)[0]; if (/^install/.test(n) && m[2] !== './lazymods.js') fileOf[n] = m[2]; }
const lazyKeyFile = {}; for (const m of lsrc.matchAll(/^\s*(\w+): \(\) => import\('\.\/([\w]+)\.js'\)/gm)) lazyKeyFile[m[1]] = m[2];
for (const m of lsrc.matchAll(/export const (install\w+) = lazyInstall\('(\w+)'/g)) if (lazyKeyFile[m[2]]) fileOf[m[1]] = './' + lazyKeyFile[m[2]] + '.js';
const AUTO = [];
for (const m of gsrc.matchAll(/^\s*this\.(?:(\w+) = (install\w+)\(this\)|useModule\('(\w+)', (install\w+)\))/gm)) { const fn = m[2] || m[4], name = m[1] || m[3]; if (fileOf[fn]) AUTO.push([name, fileOf[fn].replace(/\.js$/, ''), fn]); }
const SKIP = new Set(['installHostMig', 'installNetStats', 'installA11y']);   // reach for real sockets / storage listeners
const RUN = argv.includes('--tonight') ? LIST.map(([n, f, i]) => [n, './' + f, i]).filter((x) => x[2]) : AUTO.filter((x) => !SKIP.has(x[2]));
const installed = [], failed = [];
const handlers = [];   // { mod, idx, fn, ... }
let curMod = '?';
const origOn = game.mods.on.bind(game.mods);
game.mods.on = (ev, fn) => { if (ev === 'update') handlers.push({ mod: curMod, fn, n: 0, tot: 0, max: 0, mem: 0, d: {}, dmax: {}, ticksSeen: [] }); return origOn(ev, fn); };
for (const [name, file, fn] of RUN) {
  curMod = name;
  try { const m = await import(new URL(file + '.js', new URL(G, import.meta.url)).href); if (typeof m[fn] !== 'function') throw new Error('no export ' + fn); game[name] = m[fn](game) || null; installed.push(name); }
  catch (e) { failed.push(name + ': ' + String(e && e.message || e).slice(0, 90)); }
}
curMod = 'BASELINE(empty handler = probe overhead)'; game.mods.on('update', () => {});
game.mods.on = origOn;
// modules with cross-references installed above may have registered other update-ish work through ghost objects; that is inert by design.

// ------------------------------------------------------------------------------------------------ land the day (same events, same order as game.js)
const landErr0 = ERRS.size;
game.run.phase = 'landing';
game.mods.emit('mapLoaded', game.world, game);
game.mods.emit('phase', 'landing', game);
game.run.phase = 'moon';
game.mods.emit('phase', 'moon', game);
game.mods.emit('moonPopulated', game);
game.mods.emit('netReady', game.net, game);
for (let i = 0; i < 30; i++) { game.time += DT; game.mods.emit('update', DT, game); }   // let lazy init (plans, cameras, drones) settle before measuring

// ------------------------------------------------------------------------------------------------ simulate
const gh = () => v8.getHeapStatistics().used_heap_size;
const set = game.mods._h.get('update') || new Set();
const byFn = new Map(handlers.map((h) => [h.fn, h]));
const wrapped = []; let MEASURING = true;
for (const fn of set) {
  let h = byFn.get(fn);
  if (!h) { h = { mod: 'core?:' + (fn.name || fn.toString().replace(/\s+/g, ' ').slice(0, 40)), fn, n: 0, tot: 0, max: 0, mem: 0, d: {}, dmax: {} }; handlers.push(h); }
  wrapped.push(function (...a) {
    if (!MEASURING) return fn.apply(this, a);
    const c0 = snap(), m0 = gh(), t0 = performance.now();
    try { return fn.apply(this, a); } finally {
      const dt = performance.now() - t0, m1 = gh(); h.n++; h.tot += dt; (h.s ||= []).push(dt); if (dt > h.max) h.max = dt; if (dt > SPIKE_MS) (h.sp ||= []).push(game.tick); if (m1 > m0) h.mem += m1 - m0;
      for (const k in C) { const d = C[k] - c0[k]; if (d) { h.d[k] = (h.d[k] || 0) + d; if (d > (h.dmax[k] || 0)) h.dmax[k] = d; } }
    }
  });
}
game.mods._h.set('update', new Set(wrapped)); game.mods._a.delete('update');

// per-frame drivers that live outside mods 'update' (creature views -> creatureRead.apply)
const extra = { name: 'creatureRead.apply x' + views.length, n: 0, tot: 0, max: 0, mem: 0, d: {}, dmax: {} };
for (const v of views) v.root.rotation.order = 'YXZ';
for (const v of views) { try { game.creatureRead?.dress?.(v); } catch { /* ok */ } }
const tickTimes = [];
const fakeFrame = (i) => {
  for (const p of players) { p.pos.x += Math.sin(i * 0.01 + p.pos.z) * 0.02; p.pos.z += Math.cos(i * 0.013 + p.pos.x) * 0.02; p.yaw += 0.01; p.sprint = (i / 90 | 0) % 3 === 0; }
  for (const v of views) { v.pos.x += Math.sin(i * 0.02 + v.pos.z) * 0.03; v.stateT += DT; if (i % 120 === 0) { v.state = ['idle', 'chase', 'attack', 'stunned'][(i / 120 + v.id.length | 0) % 4]; v.stateT = 0; } }
  camera.position.set(players[0].pos.x, 1.6, players[0].pos.z);
};
if (game.crdirector?.dispose) { /* keep */ }
const WARM = 240, SPIKE_MS = 0.5;   // 4 s of warm-up (JIT, lazy init, first-use allocations) before anything is measured
for (let i = 0; i < TICKS + WARM; i++) {
  if (i === WARM) { for (const h of handlers) { h.n = h.tot = h.max = h.mem = 0; h.d = {}; h.dmax = {}; h.s = []; h.sp = []; } extra.n = extra.tot = extra.max = extra.mem = 0; extra.d = {}; extra.dmax = {}; tickTimes.length = 0; }
  game.time += DT; game.tick = i; fakeFrame(i);
  const t0 = performance.now();
  game.mods.emit('update', DT, game);
  if (game.creatureRead) { const c0 = snap(), m0 = gh(), a0 = performance.now(); for (const v of views) game.creatureRead.apply(v, DT); const dt = performance.now() - a0, m1 = gh(); extra.n++; extra.tot += dt; if (dt > extra.max) extra.max = dt; if (m1 > m0) extra.mem += m1 - m0; }
  tickTimes.push(performance.now() - t0);
}

// allocation pass: V8 sampling heap profiler (includes objects already collected), bytes attributed to the allocating function's source file
const allocBy = new Map(), allocFn = new Map();
MEASURING = false;   // the allocation pass runs under the sampling heap profiler (slow): not part of the timings
{
  const inspector = await import('node:inspector');
  const ses = new inspector.Session(); ses.connect();
  const post = (m, p) => new Promise((res, rej) => ses.post(m, p, (e, r) => (e ? rej(e) : res(r))));
  await post('HeapProfiler.enable');
  await post('HeapProfiler.startSampling', { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const ALLOC_TICKS = Math.min(TICKS, 300);
  for (let i = 0; i < ALLOC_TICKS; i++) { game.time += DT; game.tick = TICKS + WARM + i; fakeFrame(TICKS + WARM + i); game.mods.emit('update', DT, game); if (game.creatureRead) for (const v of views) game.creatureRead.apply(v, DT); }
  const { profile } = await post('HeapProfiler.stopSampling');
  const walk = (n) => {
    const cf = n.callFrame, file = (cf.url.match(/(?:src\/)?([\w./]+\.js)$/) || [, cf.url || '(native)'])[1].replace(/^.*\/(src\/)/, '');
    if (n.selfSize && !/perf5/.test(cf.url)) { allocBy.set(file, (allocBy.get(file) || 0) + n.selfSize); const k = file + ':' + (cf.functionName || '(anon)') + ':' + cf.lineNumber; allocFn.set(k, (allocFn.get(k) || 0) + n.selfSize); }
    for (const c of n.children) walk(c);
  };
  walk(profile.head); ses.disconnect();
  for (const m of [allocBy, allocFn]) for (const [k, v] of m) m.set(k, v / ALLOC_TICKS);   // bytes per tick
}

// ------------------------------------------------------------------------------------------------ report
const rows = [...handlers, ...(extra.n ? [{ ...extra, mod: extra.name }] : [])].filter((h) => h.n).map((h) => ({ mod: h.mod, sp: h.sp, med: h.s && h.s.length ? h.s.slice().sort((a, b) => a - b)[h.s.length >> 1] : h.tot / h.n, avg: h.tot / h.n, max: h.max, mem: h.mem / h.n, d: h.d, dmax: h.dmax, n: h.n, fn: h.fn }));
const f = (x, d = 3) => x.toFixed(d);
const sumMed = rows.reduce((s, r) => s + r.med, 0), sumAvg = rows.reduce((s, r) => s + r.avg, 0), sumMem = rows.reduce((s, r) => s + r.mem, 0);
tickTimes.sort((a, b) => a - b);
const report = {
  installed: installed.length, failed, handlers: rows.length, sumAvgMs: +f(sumAvg, 4), sumMedianMs: +f(sumMed, 4), sumAllocBytesPerTick: Math.round(sumMem), tickMedianMs: +f(tickTimes[tickTimes.length >> 1], 4), tickP99Ms: +f(tickTimes[Math.floor(tickTimes.length * 0.99)], 4), tickMaxMs: +f(tickTimes[tickTimes.length - 1], 3),
  byAvg: [...rows].sort((a, b) => b.avg - a.avg).slice(0, 15).map((r) => ({ mod: r.mod, avgMs: +f(r.avg, 4), medMs: +f(r.med, 4), maxMs: +f(r.max, 3), allocB: Math.round(r.mem), ghostPerCall: +((r.d.ghost || 0) / r.n).toFixed(1), dom: r.d })),
  spikes: rows.filter((r) => r.sp && r.sp.length).map((r) => ({ mod: r.mod, n: r.sp.length, atTicks: r.sp.slice(0, 6).map((x) => x - WARM), maxMs: +r.max.toFixed(2) })).sort((a, b) => b.n - a.n).slice(0, 12),
  all: rows.map((r) => ({ mod: r.mod, avg: +r.avg.toFixed(4), med: +r.med.toFixed(4), max: +r.max.toFixed(3), alloc: Math.round(r.mem) })),
  byMax: [...rows].sort((a, b) => b.max - a.max).slice(0, 15).map((r) => ({ mod: r.mod, avgMs: +f(r.avg, 4), maxMs: +f(r.max, 3), allocB: Math.round(r.mem) })),
  allocByFile: [...allocBy].filter(([k]) => /game\/|entities\/|render\/|ui\/|world\/|models\/|core\//.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => ({ file: k, bytesPerTick: Math.round(v) })),
  allocByFn: [...allocFn].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => ({ fn: k, bytesPerTick: Math.round(v) })),
  byAlloc: [...rows].sort((a, b) => b.mem - a.mem).slice(0, 10).map((r) => ({ mod: r.mod, allocB: Math.round(r.mem), avgMs: +f(r.avg, 4) })),
  domPerSec: Object.fromEntries(Object.keys(C).filter((k) => k !== 'ghost').map((k) => [k, +(rows.reduce((s, r) => s + (r.d[k] || 0), 0) / TICKS * 60).toFixed(1)])),
  domHeavy: rows.filter((r) => Object.keys(r.d).some((k) => k !== 'ghost')).map((r) => ({ mod: r.mod, perSec: Object.fromEntries(Object.entries(r.d).filter(([k]) => k !== 'ghost').map(([k, v]) => [k, +(v / r.n * 60).toFixed(1)])) })),
};
if (JSON_OUT) realLog(JSON.stringify(report, null, 1));
else {
  realLog(`perf5: ${installed.length} modules installed, ${failed.length} failed to install on the stub, ${rows.length} per-frame handlers, ${TICKS} ticks @60Hz (moon ${moonId}, 4 players, ${views.length} creatures)`);
  if (argv.includes('--errors')) for (const [m, n] of [...ERRS].sort((a, b) => b[1] - a[1]).slice(0, 25)) realLog('  ERR x' + n + ' ' + m);
  if (failed.length) realLog('  not installed (stub too thin): ' + failed.join(' | '));
  realLog(`sum of handler avg = ${f(sumAvg, 4)} ms/tick (sum of medians ${f(sumMed, 4)}), alloc = ${Math.round(sumMem)} B/tick, whole update emit: median ${f(tickTimes[tickTimes.length >> 1], 4)} ms, p99 ${f(tickTimes[Math.floor(tickTimes.length * 0.99)], 4)}, max ${f(tickTimes[tickTimes.length - 1], 3)}`);
  const tab = (t, list, cols) => { realLog('\n' + t); for (const r of list) realLog('  ' + r.mod.padEnd(34).slice(0, 34) + cols.map((c) => String(r[c]).padStart(11)).join('')); };
  tab('TOP 15 by avg ms (columns: avg med max ms, allocB/call, ghostReads/call)', report.byAvg, ['avgMs', 'medMs', 'maxMs', 'allocB', 'ghostPerCall']);
  tab('TOP 15 by max ms', report.byMax, ['avgMs', 'maxMs', 'allocB']);
  tab('TOP 10 by allocation (B/call)', report.byAlloc, ['allocB', 'avgMs']);
  realLog('\nALLOCATION per tick by source file (V8 sampling heap profiler, 300 ticks; excludes the probe):'); for (const r of report.allocByFile) realLog('  ' + r.file.padEnd(34) + String(r.bytesPerTick).padStart(9) + ' B/tick');
  realLog('ALLOCATION per tick by function:'); for (const r of report.allocByFn) realLog('  ' + r.fn.padEnd(52).slice(0, 52) + String(r.bytesPerTick).padStart(9) + ' B/tick');
  { const b = rows.find((r) => /^BASELINE/.test(r.mod)); if (b) realLog(`\nprobe overhead (empty handler): ${f(b.avg, 4)} ms, ${Math.round(b.mem)} B per call - subtract from every row`); }
  realLog('\nSPIKES (> ' + SPIKE_MS + ' ms after warm-up; tick indices show periodic work):'); for (const r of report.spikes) realLog('  ' + r.mod.padEnd(34).slice(0, 34) + ' x' + String(r.n).padEnd(4) + ' max ' + r.maxMs + ' ms at ticks ' + r.atTicks.join(','));
  realLog('\nDOM / raycast ops per second (all handlers): ' + JSON.stringify(report.domPerSec));
  for (const r of report.domHeavy) realLog('  ' + r.mod.padEnd(34).slice(0, 34) + JSON.stringify(r.perSec));
}

// ------------------------------------------------------------------------------------------------ budgets (regression guard; stub numbers, generous: real machines / real data differ)
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; realLog('FAIL', m); } };
const allocOf = (file) => allocBy.get(file) || 0;
ok(installed.length >= 90, 'at least 90 real modules install on the stub: ' + installed.length);
ok(sumMed < 1.2, `sum of handler medians ${f(sumMed)} ms/tick (budget 1.2 on the stub)`);
ok(report.domPerSec.html < 30 && report.domPerSec.qs < 30 && report.domPerSec.rect < 60 && report.domPerSec.create < 30, 'DOM churn per second: ' + JSON.stringify(report.domPerSec));
ok(report.domPerSec.text < 120 && report.domPerSec.style < 220, 'text / style writes per second stay low (write-if-changed): ' + report.domPerSec.text + ' / ' + report.domPerSec.style);
ok(report.domPerSec.ray < 40, 'THREE raycasts per second: ' + report.domPerSec.ray);
for (const r of rows) if (!/^BASELINE/.test(r.mod)) ok(r.med < 0.15, `handler ${r.mod} median ${f(r.med)} ms (budget 0.15)`);
ok(allocOf('game/feedcams.js') < 2500, 'feedcams allocates < 2.5 KB/tick (was 3.1 KB: closures per camera per frame): ' + Math.round(allocOf('game/feedcams.js')));
ok(allocOf('game/shipyard_core.js') < 1500, 'shipyard effects() memoised, < 1.5 KB/tick (was 5.9 KB): ' + Math.round(allocOf('game/shipyard_core.js')));
ok(allocOf('game/creature_read.js') < 1000, 'creatureRead pose layer < 1 KB/tick for 6 creatures (was 1.1 KB): ' + Math.round(allocOf('game/creature_read.js')));
realLog(fail ? `perf5: ${fail} FAILED` : `perf5 tests OK (sum of medians ${f(sumMed)} ms/tick over ${rows.length} handlers)`);
process.exit(fail ? 1 : 0);
