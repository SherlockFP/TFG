// Wave 8 multiplayer audit (docs/wave8/netaudit.md). node tools/harness/netaudit_wave8.test.mjs [--table]
//  A. static: every wave-8 message type has exactly one receiver path (no on_ vs msg: shadowing), host->all types are HOST_ONLY (or check the sender),
//     every client request has a handler, wave-8 run fields are broadcast.
//  B. behavioural: real Session objects on an in-memory wire (host H + clients C, D) with stub games: downed (down -> confirm -> revive, late join,
//     host migration), feedcams (client cuts a camera, spray NaN, viewer-tax sale line, host migration clock), late join with a queued landing.
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
globalThis.window = globalThis;
window.addEventListener = () => {}; window.removeEventListener = () => {};
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const THREE = await import('three');
const { Session, HOST_ONLY } = await import('../../src/net/session.js');
const { LandingQueue } = await import('../../src/game/landingq.js');

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
const root = fileURLToPath(new URL('../../src', import.meta.url));   // fileURLToPath: .pathname gives /D:/... on Windows
const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// ================================================================================================ A. static
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })(root);
const q = `['"\`]`, KINDS = ['on', 'msg', 'handle', 'bc', 'to', 'send', 'req', 'hostonly'];
const T = {};
const pats = [['on', new RegExp(`\\bon_\\(\\s*${q}(\\w+)${q}`, 'g')], ['msg', new RegExp(`\\.on\\(\\s*${q}msg:(\\w+)${q}`, 'g')],
  ['handle', new RegExp(`\\b(?:H|Hh|Hn|handle)\\(\\s*${q}(\\w+)${q}`, 'g')], ['bc', new RegExp(`\\bbroadcast\\(\\s*${q}(\\w+)${q}`, 'g')],
  ['to', new RegExp(`\\bsendTo\\([^,]+,\\s*${q}(\\w+)${q}`, 'g')], ['send', new RegExp(`\\bnet\\.send\\(\\s*${q}(\\w+)${q}`, 'g')],
  ['req', new RegExp(`\\brequest\\(\\s*${q}(\\w+)${q}`, 'g')], ['hostonly', new RegExp(`HOST_ONLY\\.add\\(\\s*${q}(\\w+)${q}`, 'g')]];
for (const f of files) {
  const rel = path.relative(root, f);
  let src = fs.readFileSync(f, 'utf8');
  if (rel === 'game/hubgate.js') src = src.replace(/\bNET\b/g, "'hg'");          // named constants -> literal so the scan sees them
  if (rel === 'game/repomaps.js') src = src.replace(/\bMSG\b/g, "'rmap'");
  src.split('\n').forEach((ln, i) => {
    for (const [k, r] of pats) { r.lastIndex = 0; let m; while ((m = r.exec(ln))) ((T[m[1]] ||= Object.fromEntries(KINDS.map((x) => [x, []])))[k]).push(path.relative(root, f) + ':' + (i + 1)); }
  });
}
// wave-8 modules: type -> [module file, how a client is protected from a forged copy]
const W8 = {
  fcfx: ['feedcams.js', 'HOST_ONLY'], fc2fx: ['feedcams2.js', 'HOST_ONLY'], dn: ['downed.js', 'from-check'], hg: ['hubgate.js', 'HOST_ONLY'],
  rsx: ['resto.js', 'HOST_ONLY'], rsmsg: ['resto.js', 'HOST_ONLY'], hsx: ['homestead.js', 'HOST_ONLY'], hsmsg: ['homestead.js', 'HOST_ONLY'], labfx: ['labyrinths.js', 'HOST_ONLY'], w3fx: ['worlds3.js', 'from-check'],
  rmap: ['repomaps.js', 'HOST_ONLY'], lm: ['lcmonsters.js', 'HOST_ONLY'], cd: ['crdirector.js', 'from-check'], mm: ['mapmods.js', 'HOST_ONLY'],
  fjfx: ['facjobs.js', 'HOST_ONLY'], fjd: ['facjobs.js', 'HOST_ONLY'], mnd: ['mining.js', 'HOST_ONLY'], ac2s: ['arcade2.js', 'from-check'], rvpk: ['rewardviz.js', 'HOST_ONLY'],
};
const W8REQ = { fcreq: 'feedcams.js', fc2req: 'feedcams2.js', dnreq: 'downed.js', rsreq: 'resto.js', hsreq: 'homestead.js', labreq: 'labyrinths.js', lmq: 'lcmonsters.js', mmq: 'mapmods.js', fjreq: 'facjobs.js',
  mnhit: 'mining.js', mnput: 'mining.js', mnsync: 'mining.js', ac2req: 'arcade2.js', arreq: 'arcade.js' };
const rows = [];
for (const [type, [file, how]] of Object.entries(W8)) {
  const v = T[type];
  ok(v && (v.bc.length || v.to.length), `${type}: has a sender in ${file}`);
  const recv = v ? v.on.length + v.msg.length : 0;
  ok(recv >= 1 && (v?.on.length || 0) <= 1, `${type}: has a receiver and at most one on_ owner (${recv})`);
  ok(!v || !(v.on.length && v.msg.length), `${type}: on_ does not shadow a msg: listener`);
  if (how === 'HOST_ONLY') ok(HOST_ONLY.has(type) || (v?.hostonly.length || 0) >= 1, `${type}: HOST_ONLY.add`);
  else ok(/hostId|fromHost/.test(rd('game/' + file)), `${type}: ${file} checks the sender against the host`);
  ok(!(v?.send.length), `${type}: never sent by a client`);
  rows.push([type, file, how]);
}
for (const [type, file] of Object.entries(W8REQ)) ok(T[type]?.req.length && (T[type].handle.length || type === 'arreq' || type === 'mnhit'), `${type}: request has a handler (${file})`);
// a type registered with net.on_ AND listened to via msg: means the msg: listener never fires (this hid feedcams' viewer-tax line for 'sell')
for (const [type, v] of Object.entries(T)) if (v.on.length && v.msg.length) ok(false, `SHADOW ${type}: on_ ${v.on[0]} replaces msg: listener ${v.msg[0]}`);
// hub gate: the host store validation must pass the lock (a client can forge the terminal BUY / cart request)
ok(/new Map\(stockFor\(run, lore\(\), g\.hubgate\?\.shopLock[,)]/.test(rd('game/shop.js')), 'shop host paths enforce the hub lock');   // [followers] the Clout coinbuy path is gone; the cart path carries the lock (+ follower gate)
// every run field the wave-8 modules write is broadcast right there
for (const [f, keys] of [['feedcams.js', ["'fc'", "'fcTax'"]], ['feedcams2.js', ["'fc2'"]], ['hubgate.js', ["'hub'"]], ['resto.js', ["'rs'"]], ['homestead.js', ["'hs'"]], ['facjobs.js', ['bcast']], ['mapmods.js', ["'mm'"]]]) {
  const src = rd('game/' + f);
  for (const k of keys) ok(new RegExp('broadcastRun\\??\\.?\\(\\[[^\\]]*' + k.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')).test(src) || (k === 'bcast' && /bcast = /.test(src)), `${f}: run field ${k} is broadcast`);
}
if (process.argv.includes('--table')) console.log(rows.map((r) => r.join('  ')).join('\n'));

// ================================================================================================ B. behavioural
const tick = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
class Wire {
  constructor() { this.tr = new Map(); this.down = new Set(); }
  add(id) { const t = new WireT(this, id); this.tr.set(id, t); return t; }
  link(a, b) { this.tr.get(a).peers.add(b); this.tr.get(b).peers.add(a); }
  drop(id) { this.down.add(id); for (const t of this.tr.values()) t.peers.delete(id); }
  route(from, m, to) {
    if (this.down.has(from)) return;
    const targets = to ? [to] : [...this.tr.get(from).peers];
    for (const id of targets) { if (this.down.has(id) || !this.tr.get(from).peers.has(id)) continue; const c = JSON.parse(JSON.stringify(m)); queueMicrotask(() => this.tr.get(id)?.onMessage?.(c, from)); }
  }
}
class WireT {
  constructor(w, id) { this.w = w; this.selfId = id; this.peers = new Set(); }
  async join() { return this; } send(m, to) { this.w.route(this.selfId, m, to); } sendBinary() {} congested() { return false; }
  leave() {} addStream() {} removeStream() {} async rejoin() { return true; }
}
const sessions = [];
async function mkSession(wire, id, isHost) {
  const s = new Session({ strategy: 'local', isHost, code: 'W8', profile: {} });
  s.transport = wire.add(id);
  await s.start({ name: id, pid: 'p' + id });
  sessions.push(s);
  return s;
}
function mkMods() {
  const L = {};
  return { on(ev, fn) { (L[ev] ||= []).push(fn); return () => { L[ev] = (L[ev] || []).filter((f) => f !== fn); }; }, emit(ev, ...a) { for (const f of [...(L[ev] || [])]) f(...a); } };
}
/** stub game wired to a real Session; `hostRun` is shared truth that gs broadcasts copy into every peer's run */
function mkGame(net, id, isHost, extra = {}) {
  const mods = mkMods();
  const game = {
    mods, net, selfId: id, isHost, godMode: false, config: {}, time: 100 + (id === 'H' ? 0 : id === 'C' ? 37 : 900), remotes: new Map(),
    run: extra.run || {}, toasts: [], engine: { hurt() {}, flash() {}, setLowHealth() {} }, ui: { toast(s, k) { game.toasts.push([s, k]); }, systemMessage() {} }, sfx() {}, audio: {},
    player: { hp: 100, maxHp: 100, dead: false, downed: false, pos: new THREE.Vector3(), toArray() { return this.pos.toArray(); } },
    playerName: (x) => x, hasPerk: () => false, items: { all: () => [] },
    damageLocal(dmg) { game.player.hp -= dmg; if (game.player.hp <= 0) game.died = true; }, localActions() {}, die(c) { game.died = c; },
    aiPlayers: () => (extra.roster ? extra.roster() : []),
    broadcastRun(keys) { const d = {}; for (const k of keys || Object.keys(game.run)) d[k] = game.run[k] === undefined ? null : game.run[k]; net.broadcast('gs', d); },
    registerHandlers() { game.mods.emit('registerHandlers', (a, fn) => net.handle(a, fn), game); },
    ...extra.game,
  };
  net.on_('gs', (d) => { if (!game.isHost) Object.assign(game.run, JSON.parse(JSON.stringify(d))); });
  return game;
}
const warns = []; const cw = console.warn; console.warn = (...a) => { warns.push(a.join(' ')); };

// ---------------------------------------------------------------- downed: down -> host confirms -> revive; late join; host migration
{
  const { installDowned } = await import('../../src/game/downed.js');
  const Diff = await import('../../src/game/difficulty.js'); Diff.setMode('standard');
  const wire = new Wire();
  const [H, C, D] = await Promise.all([mkSession(wire, 'H', true), mkSession(wire, 'C', false), mkSession(wire, 'D', false)]);
  wire.link('H', 'C'); wire.link('H', 'D'); wire.link('C', 'D');
  for (const id of ['C', 'D']) { H.players.set(id, { id, name: id }); }
  for (const s of [C, D]) { s.hostId = 'H'; s.connected = true; s.players.set('H', { id: 'H', host: true }); }
  const world = { H: new THREE.Vector3(0, 0, 0), C: new THREE.Vector3(1, 0, 0), D: new THREE.Vector3(2, 0, 0) };
  const roster = () => Object.entries(world).map(([id, pos]) => ({ id, pos, dead: false }));
  const gH = mkGame(H, 'H', true, { roster }), gC = mkGame(C, 'C', false, { roster }), gD = mkGame(D, 'D', false, { roster });
  gC.remotes.set('H', { id: 'H', dead: false, flags: 0, pos: world.H }); gC.remotes.set('D', { id: 'D', dead: false, flags: 0, pos: world.D });
  const aH = installDowned(gH), aC = installDowned(gC);
  for (const g of [gH, gC]) g.mods.emit('netReady', g.net, g);
  gH.registerHandlers();
  gC.damageLocal(500, 'lurker', null);
  await tick();
  ok(gC.player.downed && !gC.died, 'downed: lethal hit downs the client (no death)');
  ok(aH.S.book.e.has('C') && aH.isDowned('C') && aC.isDowned('C'), 'downed: host booked it and broadcast "on" back to the victim');
  // forged messages: a peer other than the host cannot fake an "up"
  gC.net.receive({ t: 'dn', d: { k: 'up', id: 'C', by: 'D', hp: 1 } }, 'D');
  ok(gC.player.downed, 'downed: "up" from a non-host peer is ignored');
  // a request from a player who is not down / out of range does nothing
  H.request('dnreq', { k: 'hold', id: 'D', m: 0 }); ok(!aH.S.book.e.has('D'), 'downed: hold on a healthy player refused');
  // LATE JOIN: D (new game) installs after C went down; the host replays the open entry on playerJoin
  const aD = installDowned(gD); gD.mods.emit('netReady', D, gD);
  ok(!aD.isDowned('C'), 'downed: (precondition) a joiner has not seen the down');
  gH.mods.emit('playerJoin', 'D', {}, gH); await tick();
  ok(aD.isDowned('C') && aD.S.down.get('C').left > 0, 'downed: late joiner learns who is down (marker + bleed clock)');
  // KIT exploit gap: a reviver without a medkit / adrenaline cannot stand a downed player up
  gH.items = { all: () => [], get: () => null };
  D.request('dnreq', { k: 'kit', id: 'C', it: 'nokit' }); await tick();
  ok(aH.S.book.e.has('C') && gC.player.downed, 'downed: kit request without a held medkit refused');
  // HOST MIGRATION: H drops, D takes over; its book is rebuilt from the mirror and D can still revive C
  wire.drop('H'); delete world.H;
  D.migrateTo('D', 1); C.migrateTo('D', 1); gD.isHost = true; gC.isHost = false;
  gD.registerHandlers();
  ok(!aD.S.book.e.has('C'), 'downed: (precondition) the new host has an empty book');
  gD.mods.emit('hostMigrated', gD, { self: true, oldHostId: 'H', newHostId: 'D' });
  ok(aD.S.book.e.has('C'), 'downed: host migration rebuilds the DownBook from the mirrored downs');
  let up = false; gC.mods.on('tfg:revived', (d) => { if (d.id === 'C') up = true; });
  for (let i = 0; i < 24 && !up; i++) { D.request('dnreq', { k: 'hold', id: 'C', m: 0 }); gD.mods.emit('update', 0.2, gD); gC.mods.emit('update', 0.2, gC); await tick(2); }
  ok(up && !gC.player.downed && gC.player.hp === 30, 'downed: revive completes on the NEW host (client stands at 30 %)');
  // kit accepted on the new host when D really holds one (host consumes it, no separate consume request)
  aD.S.book.down('C', aD.S.clock, 'standard', [0, 0, 0], 'x'); gC.player.downed = true;   // (a second net down inside the same second is rate limited, so book it directly)
  ok(aD.S.book.e.has('C'), 'downed: (precondition) C down again under the new host');
  const kitIt = { id: 'k1', type: 'medkit', holder: 'D' }; gD.items = { all: () => [kitIt], get: (i) => (i === 'k1' ? kitIt : null) };
  D.request('dnreq', { k: 'kit', id: 'C', it: 'k1' }); await tick();
  ok(!aD.S.book.e.has('C') && !gC.player.downed, 'downed: kit request with a held medkit stands the crewmate up');
  aH.dispose(); aC.dispose(); aD.dispose();
}

// ---------------------------------------------------------------- wave-8 leftovers: migration rebuild + exploit gates (static + pure)
{
  const src = (f) => fs.readFileSync(path.join(root, 'game', f), 'utf8');
  for (const f of ['arcade.js', 'arcade2.js', 'facjobs.js', 'resto.js']) ok(/on\('hostMigrated'/.test(src(f)), `migration: ${f} handles hostMigrated`);
  ok(/on\('hostMigrated'/.test(src('lcmonsters_fx.js') + src('lcmonsters.js')) || /case 'cu': cursed\.set/.test(src('lcmonsters_fx.js')), 'migration: lcmonsters curse map is mirrored on every peer (cu/cm), crdirector re-inits via hostUpdate (!S.st)');
  ok(/if \(!S\.st\) \{ startLanding\(\)/.test(src('crdirector.js').replace(/[{}()]/g, (c) => '\\' + c)) || /if \(!S\.st\) \{ startLanding/.test(src('crdirector.js')), 'migration: crdirector restarts a short calm phase when S.st is missing');
  ok(/nearCab/.test(src('labyrinths.js')) && /nearPanel/.test(src('labyrinths.js')), 'exploit: elevator call range check present');
  ok(/charger/.test(src('host.js').split("H('charge'")[1].split("H('dropship'")[0]), 'exploit: charge request range check present');
  const A = await import('../../src/game/arcade_core.js');
  const tb = A.newTable('t1', 'chess'); tb.seats.w = 'C'; tb.ai.b = 1; A.aiStep?.(tb);
  const back = A.restoreTable(A.snapshot(tb));
  ok(JSON.stringify(A.snapshot(back)) === JSON.stringify(A.snapshot(tb)), 'migration: chess table rebuilt from its snapshot is identical');
  const K2 = await import('../../src/game/arcade2_core.js');
  ok(K2.wire({ day: 'd', b: { fish: [{ id: 'a', n: 'a', s: 5 }], cable: [], stack: [], invaders: [] } }).b.fish.length === 1, 'migration: arcade2 boards survive wire()');
}

// ---------------------------------------------------------------- feedcams: client cuts a camera; NaN spray; sale line hook; migration clock
{
  const { generateLayout, INTERIOR_THEMES } = await import('../../src/world/facility.js');
  const { MOONS } = await import('../../src/game/moons.js');
  const { installFeedcams } = await import('../../src/game/feedcams.js');
  const { ST } = await import('../../src/game/feedcams_core.js');
  const moon = Object.keys(MOONS).find((k) => !MOONS[k].company && !MOONS[k].home && !MOONS[k].ghost);
  const L = generateLayout(2931, Object.keys(INTERIOR_THEMES)[0], 1.2, null);
  const wire = new Wire();
  const [H, C, D] = await Promise.all([mkSession(wire, 'H', true), mkSession(wire, 'C', false), mkSession(wire, 'D', false)]);
  wire.link('H', 'C'); wire.link('H', 'D'); wire.link('C', 'D');
  for (const id of ['C', 'D']) H.players.set(id, { id, name: id });
  for (const s of [C, D]) { s.hostId = 'H'; s.connected = true; }
  const mkRun = () => ({ phase: 'moon', moon, seed: 7, day: 3, quotaIndex: 1, credits: 0 });
  const world = { H: new THREE.Vector3(0, 0, 0), C: new THREE.Vector3(500, 0, 500), D: new THREE.Vector3(600, 0, 600) };
  const roster = () => Object.entries(world).map(([id, pos]) => ({ id, pos, dead: false, zone: 'in', inShip: false }));
  const fac = () => ({ layout: L, group: new THREE.Group() });
  const physics = { raycast: () => null, lineOfSight: () => false };
  const mk = (net, id, host, sold) => { const g = mkGame(net, id, host, { run: mkRun(), roster, game: { physics, world: { facility: fac(), outdoor: null }, onSellResult(d) { sold.push(d); }, creatures: null } }); return g; };
  const sold = [];
  const gH = mk(H, 'H', true, sold), gC = mk(C, 'C', false, []), gD = mk(D, 'D', false, []);
  gH.remotes.set('C', { id: 'C', pos: world.C }); gH.remotes.set('D', { id: 'D', pos: world.D });
  const aH = installFeedcams(gH), aC = installFeedcams(gC), aD = installFeedcams(gD);
  for (const g of [gH, gC, gD]) g.mods.emit('netReady', g.net, g);
  gH.registerHandlers();
  for (const g of [gH, gC, gD]) g.mods.emit('update', 0.1, g);
  await tick();
  const plan = aH.plan();
  ok(plan.length > 0 && aC.plan().length === plan.length && gC.run.fc?.c?.length === plan.length, 'feedcams: every peer builds the same plan and the client got run.fc (broadcastRun)');
  const cam = plan[0], jb = cam.jb;
  // out of reach: refused
  C.request('fcreq', { op: 'cut', i: 0 }); await tick();
  ok(gH.run.fc.c[0][0] !== ST.CUT, 'feedcams: cut from 700 m away refused by the host');
  // in reach: the host cuts, everyone hears it, the run state syncs
  world.C.set(jb.x, jb.y - 1, jb.z); gH.time += 1;
  C.request('fcreq', { op: 'cut', i: 0 }); await tick();
  ok(gH.run.fc.c[0][0] !== ST.CUT, 'feedcams: a cut is a hold, not instant');   // [camloot]
  gH.time += 2.5; gH.mods.emit('update', 0.2, gH); await tick();   // ...2 s later the host completes it
  ok(gH.run.fc.c[0][0] === ST.CUT && gC.run.fc.c[0][0] === ST.CUT && gD.run.fc.c[0][0] === ST.CUT, 'feedcams: client cut the camera; host + both clients agree');
  // forged fcfx from a client is dropped (HOST_ONLY)
  const before = gD.toasts.length; D.receive({ t: 'fcfx', d: { k: 'tax', cut: 999 } }, 'C'); ok(gD.toasts.length === before, 'feedcams: fcfx from a client is ignored');
  // NaN spray must not blind cameras (host onFx)
  const j = plan.find((c) => c.i !== 0); world.C.set(j.x, j.y - 1, j.z);
  gH.mods.emit('fx', { k: 'spray', p: [NaN, NaN, NaN] }, 'C'); ok(gH.run.fc.c[j.i][0] === ST.OK, 'feedcams: spray with NaN coordinates blinds nothing');
  gH.mods.emit('fx', { k: 'spray', p: [j.x, j.y, j.z] }, 'C'); ok(gH.run.fc.c[j.i][0] === ST.BLIND, 'feedcams: a real spray at the camera blinds it');
  // viewer-tax sale line: hooked through onSellResult (net.on_("sell") in game.js swallows msg:sell)
  gH.run.fcTax = 40; let sale = null; gC.mods.emit('netReady', C, gC);
  C.on('msg:fcfx', (d) => { if (d.k === 'sale') sale = d; });
  gH.onSellResult({ total: 100, pending: false }); await tick();
  ok(sold.length === 1 && gH.run.fcTax === 0 && !!sale, 'feedcams: the sale hook fires the viewer-tax line and still calls the original onSellResult');
  // host migration: D takes over; clock-relative timers are re-based onto D's clock
  gH.run.fc.c[j.i][1] = gH.time + 8; gH.broadcastRun(['fc']); await tick();
  for (const g of [gC, gD]) g.mods.emit('update', 0.1, g);   // clients refresh S.off from F.ck
  const offD = aD.state.off, remain = gD.run.fc.c[j.i][1] - (gD.time + offD);
  wire.drop('H'); D.migrateTo('D', 1); C.migrateTo('D', 1); gD.isHost = true; gD.registerHandlers();
  gD.mods.emit('hostMigrated', gD, { self: true, oldHostId: 'H', newHostId: 'D' });
  const remain2 = gD.run.fc.c[j.i][1] - gD.time;
  ok(Math.abs(remain - remain2) < 0.6 && Math.abs(gD.run.fc.ck - gD.time) < 0.02, `feedcams: blind timer re-based on migration (was ${remain.toFixed(1)} s left, now ${remain2.toFixed(1)} s)`);
  aH.dispose(); aC.dispose(); aD.dispose();
}

// ---------------------------------------------------------------- landing queue: a late joiner builds synchronously while the host's queue is still pending
{
  const built = [];
  const hostQ = new LandingQueue({ startDelay: 0, now: () => 0 });
  hostQ.add('map', () => built.push('host:map')); hostQ.add('mapLoaded:a', () => built.push('host:a')); hostQ.add('phase:landing', () => built.push('host:phase'));
  ok(hostQ.pending === 3, 'landq: host has 3 pending jobs mid-landing');
  const joinQ = new LandingQueue(); joinQ.add('map', () => built.push('join:map')); joinQ.add('mapLoaded:a', () => built.push('join:a'));
  joinQ.flush();   // game.loadMapFor(instant): flushes at once
  ok(joinQ.pending === 0 && built.join() === 'join:map,join:a', 'landq: a joiner (instant load) runs the same jobs in the same order right away');
  hostQ.flush(); ok(built.join() === 'join:map,join:a,host:map,host:a,host:phase', 'landq: hostFinishLanding flushes the rest in order (hostmig later() path uses the same call)');
  hostQ.add('x', () => { throw new Error('boom'); }); hostQ.add('y', () => built.push('y')); hostQ.flush(); ok(built.at(-1) === 'y', 'landq: a throwing job does not stop the queue');
}

console.warn = cw;
for (const s of sessions) { try { s.leave(); } catch { /* ignore */ } }
const bad = warns.filter((w) => /\[(feedcams|downed)/.test(w));
if (bad.length) { console.log('module warnings:', bad.slice(0, 4).join(' | ')); }
ok(!bad.length, 'no module warnings from downed / feedcams during the flows');
console.log(`netaudit_wave8: ${checks - fails}/${checks} ok`);
process.exit(fails ? 1 : 0);
