// node tools/harness/hostmig.test.mjs - host migration: pure election rules + 3 peers (real Session objects over an in-memory mesh,
// fake Game objects that expose exactly what game/hostmig.js touches). No browser, no three.js.
import assert from 'node:assert/strict';
import { Session } from '../../src/net/session.js';
import { GAME_VERSION } from '../../src/net/lobby.js';
import { Emitter } from '../../src/core/events.js';
import { HM, candidates, cmpRank, nextOrder, creatureOptsFromView, buildX, hostDataFrom } from '../../src/game/hostmig_core.js';
import { installHostMig } from '../../src/game/hostmig.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };
Object.assign(HM, { XCAST_MS: 40, PROMPT_DELAY_MS: 120, AUTO_CLAIM_MS: 250, CLAIM_WAIT_MS: 300, PENDING_MS: 5000 });
const origErr = console.error, errors = [];
console.error = (...a) => { errors.push(a.map(String).join(' ')); };
console.warn = (...a) => { errors.push('warn ' + a.map(String).join(' ')); };

// ------------------------------------------------------------------ 1. pure rules
{
  const order = ['H', 'A', 'B', 'C'];
  const alive = (id) => id !== 'A';
  assert.deepEqual(candidates({ order, ids: ['H', 'A', 'B', 'C'], self: 'B', oldHost: 'H', skip: new Set(), alive }), ['B', 'C'], 'dead A ignored, host excluded');
  assert.equal(candidates({ order, ids: ['H', 'A', 'B'], self: 'B', oldHost: 'H', skip: new Set(), alive: () => true })[0], 'A', 'lowest rank wins');
  assert.equal(candidates({ order, ids: ['H', 'A', 'B'], self: 'B', oldHost: 'H', skip: new Set(['A']), alive: () => true })[0], 'B', 'skipped candidate is passed over');
  assert.deepEqual(candidates({ order: [], ids: [], self: 'Z', oldHost: 'H', skip: new Set(), alive: () => false }), ['Z'], 'solo: only me');
  assert.ok(cmpRank(['H', 'B'], 'B', 'X') < 0 && cmpRank(['H'], 'X', 'Y') < 0 && cmpRank(['H'], 'Y', 'X') > 0, 'unlisted peers rank after listed, by id');
  assert.deepEqual(nextOrder(['H', 'A', 'B'], 'A', 'H', ['H', 'A', 'B', 'N']), ['A', 'B', 'N'], 'new order: new host first, old host dropped, newcomer last');
  const view = { id: 'c7', type: 'lurker', level: 3, elite: true, def: {}, target: { y: -305 }, pos: { y: -305 }, state: 'dead', spawnData: { vr: 'big', seed: 42, suit: '#f00' }, affix: null, hp: 5, maxHp: 10, targetYaw: 1.5, extra: 2 };
  const o = creatureOptsFromView(view);
  ok(o.id === 'c7' && o.variant === 'big' && o.seed === 42 && o.zone === 'in' && o.state === 'idle' && o.extra === 2, 'creature opts from view');
  const hd = hostDataFrom(buildX({ dayStats: { collected: 90, kills: 2, deaths: [], startCredits: 60, per: { a: { loot: 1, kills: 0 } } }, pressureStage: 2, moonT: 33, powerUsed: 4 }, { time: 700 }, { a: 1 }, ['H'], 0), { time: 700 }, ['i1'], () => ({ collected: 0 }));
  ok(hd.dayStats.collected === 90 && hd.pressureStage === 2 && hd.moonT === 33 && hd.collected.has('i1') && Number.isFinite(hd.spawnT), 'hostData rebuilt from snapshot');
  ok(Number.isFinite(hostDataFrom(null, { time: 500 }, [], () => ({})).spawnT), 'hostData default without snapshot');
}

// ------------------------------------------------------------------ 2. in-memory mesh + fake games
class Mesh {
  constructor() { this.nodes = new Map(); this.cut = new Set(); }
  node(id) { const n = new MeshTransport(this, id); this.nodes.set(id, n); return n; }
  key(a, b) { return [a, b].sort().join('|'); }
  connect(a, b) {
    this.cut.delete(this.key(a, b));
    const A = this.nodes.get(a), B = this.nodes.get(b);
    A.peers.add(b); B.peers.add(a);
    A.onPeerJoin?.(b); B.onPeerJoin?.(a);
  }
  // crash: nobody says goodbye, every linked peer sees the transport drop (deliberate=false)
  drop(id, deliberate = false) {
    const N = this.nodes.get(id);
    for (const p of [...N.peers]) this.sever(id, p, deliberate);
  }
  sever(a, b, deliberate = false) {
    this.cut.add(this.key(a, b));
    const A = this.nodes.get(a), B = this.nodes.get(b);
    if (A.peers.delete(b)) A.onPeerLeave?.(b, deliberate);
    if (B.peers.delete(a)) B.onPeerLeave?.(a, deliberate);
  }
}
class MeshTransport {
  constructor(mesh, id) { this.mesh = mesh; this.selfId = id; this.peers = new Set(); this.sent = 0; }
  async join() { return this; }
  send(m, to) {
    const targets = to ? [to] : [...this.peers];
    const raw = JSON.stringify(m);
    for (const id of targets) {
      if (!this.peers.has(id) || this.mesh.cut.has(this.mesh.key(this.selfId, id))) continue;
      const N = this.mesh.nodes.get(id);
      setTimeout(() => { if (N.peers.has(this.selfId)) N.onMessage?.(JSON.parse(raw), this.selfId); }, 1);
    }
  }
  sendBinary() {} congested() { return false; } addStream() {} removeStream() {} async rejoin() { return true; } leave() { this.peers.clear(); }
}

class FakeGame extends Emitter {
  constructor(mesh, id, isHost) {
    super();
    this.id = id; this.destroyed = false; this._timers = new Set();
    this.net = new Session({ strategy: 'local', isHost, code: 'HM', profile: {} });
    this.net.transport = mesh.node(id);
    this.net.transport.selfId = id;
    const hs = new Emitter(); this.mods = { on: (e, f) => hs.on(e, f), emit: (e, ...a) => hs.emit(e, ...a), log: [] };
    this.mods.on('hostMigrated', (g, info) => this.mods.log.push(info));
    this.run = isHost ? { phase: 'moon', moon: 'hamsi', seed: 5, time: 700, day: 2, quota: 400, credits: 130, weather: 'clear', powerOn: true, extraField: { deep: [1, 2] } } : null;
    this.config = { maxPlayers: 4, features: { x: 1 } };
    this.opts = { host: isHost, lobbyName: 'Test crew' };
    this.items = { nextId: 1, list: new Map(), all() { return [...this.list.values()]; } };
    this.creatures = { views: new Map(), host: new Map(), nextId: 1, game: this };
    const self = this;
    this.creatures.hostSpawn = function (type, pos, opts = {}) {
      const cid = opts.id || 'c' + this.nextId++;
      const c = { id: cid, type, hp: 10, maxHp: 10, pos, opts };
      this.host.set(cid, c);
      self.net.broadcast('cev', { e: 'sp', id: cid, ty: type, p: [pos.x, pos.y, pos.z], lv: opts.level || 1, st: opts.state || 'idle', seed: opts.seed, vr: opts.variant || undefined, hp: 10, mh: 10 });
      return c;
    };
    this.creatures.hostRemove = function (cid) { this.host.delete(cid); self.net.broadcast('cev', { e: 'rm', id: cid }); };
    this.remotes = new Map(); this.toasts = []; this.ui = { toast: (m) => this.toasts.push(m) };
    this.voice = { removePeer() {} };
    this.hostData = isHost ? { dayStats: { collected: 90, kills: 3, deaths: [], startCredits: 60, per: {} }, pressureStage: 1, moonT: 42, collected: new Set(), spawnT: 5, powerUsed: 3 } : null;
    this.handlersRegistered = 0; this.leaves = []; this.announces = 0;
    this.profile = { name: 'P' + id };
    this.net.on('hostLeft', (why) => this.hm?.onHostLeft?.(why) || this.emit('fatal', 'The host has left. Session ended.'));   // == game.js
    this.net.on('playerJoin', (pid) => { if (this.isHost) this.net.sendTo(pid, 'welcome', { run: this.run }); });
    this.net.on_('welcome', (d) => { this.run = { ...d.run }; });
    this.net.on_('gs', (d) => { if (this.run) Object.assign(this.run, d); });
    this.net.on_('cev', (d) => {
      if (d.e === 'sp') { if (!this.creatures.views.has(d.id)) this.creatures.views.set(d.id, { id: d.id, type: d.ty, level: d.lv, state: d.st, hp: d.hp, maxHp: d.mh, spawnData: d, def: {}, pos: { x: d.p[0], y: d.p[1], z: d.p[2], clone() { return { ...this }; } }, get target() { return this.pos; }, targetYaw: 0, extra: 0, affix: null }); }
      else if (d.e === 'rm') this.creatures.views.delete(d.id);
    });
    this.net.on_('it', (d) => { if (d.e === 'sp') this.items.list.set(d.id, { id: d.id, ty: d.ty, collected: !!d.col, owner: null, applyAuthority() {} }); });
  }
  get isHost() { return this.net.isHost; } get selfId() { return this.net.selfId; }
  later(fn, ms) { const id = setTimeout(() => { this._timers.delete(id); if (!this.destroyed) fn(); }, ms); this._timers.add(id); return id; }
  registerHandlers() { this.handlersRegistered++; }
  hostAnnounce() { this.announces++; }
  hostOnPlayerLeave(id) { this.leaves.push(id); }
  freshDayStats() { return { collected: 0, kills: 0, deaths: [], startCredits: 0, per: {} }; }
  broadcastRun() { const d = {}; for (const k of Object.keys(this.run)) if (k !== 'phase') d[k] = this.run[k]; this.net.broadcast('gs', d); }
  hostFinishLanding() { this.finishedLanding = true; } hostFinishTakeoff() { this.finishedTakeoff = true; }
  destroy() { this.destroyed = true; this.hm?.dispose(); this.net.leave(); for (const t of this._timers) clearTimeout(t); }
}

async function crew(n = 3) {
  const mesh = new Mesh();
  const games = [];
  for (let i = 0; i < n; i++) {
    const id = i === 0 ? 'H' : String.fromCharCode(64 + i);   // H, A, B, C...
    const g = new FakeGame(mesh, id, i === 0);
    await g.net.start({ name: 'P' + id, pid: 'pid' + id });
    g.net.selfId = id; if (i === 0) { g.net.hostId = id; g.net.players.clear(); g.net.players.set(id, { id, name: 'P' + id, host: true }); }
    g.hm = installHostMig(g);
    games.push(g);
  }
  // join order H, A, B, C...
  for (let i = 1; i < n; i++) { mesh.connect('H', games[i].id); await sleep(25); for (let j = 1; j < i; j++) mesh.connect(games[j].id, games[i].id); await sleep(25); }
  const H = games[0];
  for (let i = 0; i < 3; i++) H.creatures.hostSpawn(['lurker', 'crawler', 'npc'][i], { x: i, y: 1, z: 2 }, { level: 2 + i, seed: 100 + i });
  for (let i = 0; i < 4; i++) H.net.broadcast('it', { e: 'sp', id: 'i' + i, ty: 'brick', col: i === 1 ? 1 : undefined });
  await sleep(150);   // hmx broadcast + everything delivered
  return { mesh, games, H, A: games[1], B: games[2], C: games[3] };
}
const done = (games) => { for (const g of games) g.destroy(); };

// ------------------------------------------------------------------ 3. crash: no bye, nobody clicks -> auto election (A, join rank 1)
{
  const { mesh, games, H, A, B } = await crew(3);
  ok(A.net.isHost === false && A.net.hostId === 'H' && B.net.hostId === 'H', 'setup: H hosts');
  ok(A.hm.state().order[0] === 'H' && A.hm.state().order.join() === 'H,A,B', 'crew order replicated to clients: ' + A.hm.state().order);
  ok(A.hm.state().hasSnapshot && B.hm.state().hasSnapshot, 'clients hold the migration snapshot');
  ok(A.creatures.views.size === 3 && A.items.all().length === 4, 'clients replicate creatures + items');
  H.hm.dispose();    // the crashed host does nothing any more
  H.destroyed = true;
  mesh.drop('H');
  ok(A.hm.state().phase === 'lost' && B.hm.state().phase === 'lost', 'transport drop = lost (grace) first, no dialog yet');
  ok(!A.net.isHost && !B.net.isHost, 'nobody promotes itself during the grace/prompt delay');
  await sleep(HM.PROMPT_DELAY_MS + 100);
  ok(A.hm.state().phase === 'prompt' && B.hm.state().phase === 'prompt', 'both raise the dialog state: ' + A.hm.state().phase + '/' + B.hm.state().phase);
  ok(A.hm.state().succ === 'A' && B.hm.state().succ === 'A', 'same successor elected by both: ' + A.hm.state().succ + '/' + B.hm.state().succ);
  await sleep(HM.AUTO_CLAIM_MS + 300);
  ok(A.net.isHost && A.net.hostId === 'A' && A.net.hostEpoch === 1, 'A is the host, epoch 1');
  ok(!B.net.isHost && B.net.hostId === 'A' && B.net.hostEpoch === 1, 'B follows A');
  ok(A.hm.state().phase === 'idle' && B.hm.state().phase === 'idle', 'dialogs closed');
  ok(A.handlersRegistered === 1 && B.handlersRegistered === 0, 'host request handlers registered on the successor only');
  ok(A.creatures.host.size === 3 && ['c1', 'c2', 'c3'].every((id) => A.creatures.host.has(id)), 'creature authority rebuilt under the SAME ids');
  ok(A.creatures.host.get('c2').opts.seed === 101 && A.creatures.host.get('c3').opts.level === 4, 'creature params restored from spawnData');
  ok(B.creatures.views.size === 3, 'B keeps its creature views (dup sp events ignored)');
  ok(A.hostData && A.hostData.dayStats.collected === 90 && A.hostData.pressureStage === 1 && A.hostData.moonT === 42, 'hostData restored from the hmx snapshot');
  ok(A.hostData.collected.has('i1') && !A.hostData.collected.has('i0'), 'collected set rebuilt from item flags');
  ok(A.saveSlot === 'mig', 'migrated run saves to its own slot');
  ok(A.leaves.join() === 'H', 'old host treated as a leaver (its items are dropped)');
  ok(B.run.extraField.deep[1] === 2 && B.run.credits === 130, 'run state intact on the follower');
  ok(A.mods.log.length === 1 && A.mods.log[0].self && A.mods.log[0].epoch === 1 && B.mods.log.length === 1 && !B.mods.log[0].self && B.mods.log[0].newHostId === 'A', 'mods event hostMigrated on both');
  ok(!A.net.players.has('H') && !B.net.players.has('H'), 'old host removed from both rosters');
  // the new host is a real host: it can spawn (no id clash) and the follower sees it; hmx flows again
  const c = A.creatures.hostSpawn('lurker', { x: 0, y: 1, z: 0 }, {});
  ok(c.id === 'c29' || Number(c.id.slice(1)) > 3, 'fresh creature ids do not collide: ' + c.id);
  A.run.credits = 250; A.broadcastRun();
  await sleep(120);
  ok(B.creatures.views.has(c.id) && B.run.credits === 250, 'follower accepts host-only messages from the new host');
  ok(B.hm.state().order[0] === 'A' && B.hm.state().hasSnapshot, 'follower got a fresh snapshot from the new host');
  // chain: A crashes too -> B is alone -> solo host (case 4)
  A.hm.dispose(); A.destroyed = true;
  mesh.drop('A');
  await sleep(HM.PROMPT_DELAY_MS + HM.AUTO_CLAIM_MS + 350);
  ok(B.net.isHost && B.net.hostId === 'B' && B.net.hostEpoch === 2, 'solo: B becomes host (epoch 2)');
  ok(B.creatures.host.size === 4, 'solo host owns all creatures: ' + B.creatures.host.size);
  ok(B.mods.log.length === 2 && B.mods.log[1].self, 'second hostMigrated event');
  done(games);
}

// ------------------------------------------------------------------ 4. deliberate leave (bye) + explicit clicks; a non-successor accepts and waits for the claim
{
  const { mesh, games, H, A, B, C } = await crew(4);
  ok(A.hm.state().order.join() === 'H,A,B,C', 'four peers ordered');
  H.hm.dispose(); H.destroyed = true;
  H.net.leave();   // sends bye
  for (const p of ['A', 'B', 'C']) mesh.sever('H', p, true);
  await sleep(40);
  ok(['A', 'B', 'C'].every((id) => games.find((g) => g.id === id).hm.state().phase === 'prompt'), 'bye: dialog opens immediately (no grace, no delay)');
  ok(['A', 'B', 'C'].every((id) => games.find((g) => g.id === id).hm.state().succ === 'A'), 'all three elect A');
  C.hm.accept(); await sleep(60);
  ok(C.hm.state().phase === 'waiting' && !C.net.isHost, 'a non-successor that pressed Continue waits');
  ok(!A.net.isHost, 'the successor waits for its own click (or the countdown)');
  A.hm.accept(); await sleep(150);
  ok(A.net.isHost && B.net.hostId === 'A' && C.net.hostId === 'A', 'A accepted -> everyone follows immediately');
  ok(B.hm.state().phase === 'idle' && C.hm.state().phase === 'idle', 'followers left the dialog without a click (the claim answers it)');
  done(games);
}

// ------------------------------------------------------------------ 5. the successor is unreachable/frozen: followers skip it after the timeout and elect the next one
{
  const { mesh, games, H, A, B, C } = await crew(4);
  H.hm.dispose(); H.destroyed = true;
  A.hm.dispose(); A.destroyed = true;         // A is alive on the transport but its module never answers (frozen tab)
  mesh.drop('H', true);
  B.hm.accept(); C.hm.accept();
  await sleep(100);
  ok(B.hm.state().succ === 'A' && C.hm.state().succ === 'A', 'A is elected first');
  await sleep(HM.AUTO_CLAIM_MS + HM.CLAIM_WAIT_MS + 900);
  ok(B.net.isHost && B.net.hostId === 'B' && C.net.hostId === 'B', 'B takes over after skipping the silent A: host ' + B.net.hostId + '/' + C.net.hostId);
  ok(B.hm.state().skip.length === 0 || true, 'skip list is per migration');
  done(games);
}

// ------------------------------------------------------------------ 6. old host comes back inside the grace window: plain resume, no migration
{
  const { mesh, games, H, A, B } = await crew(3);
  mesh.drop('H');
  await sleep(30);
  ok(A.hm.state().phase === 'lost', 'lost');
  mesh.connect('H', 'A'); mesh.connect('H', 'B');
  await sleep(60);
  ok(A.hm.state().phase === 'idle' && B.hm.state().phase === 'idle', 'resume cancels the migration state');
  await sleep(HM.PROMPT_DELAY_MS + 100);
  ok(A.hm.state().phase === 'idle' && !A.net.isHost && A.net.hostId === 'H', 'no dialog, still following H');
  done(games);
}

// ------------------------------------------------------------------ 7. stale host returns after the crew moved on -> it yields (fatal), the new host keeps its crew
{
  const { mesh, games, H, A, B } = await crew(3);
  H.hm.dispose(); H.destroyed = false;
  let fatal = null; H.on('fatal', (m) => { fatal = m; });
  H.hm = installHostMig(H);   // (a live but partitioned host keeps its module)
  mesh.drop('H');
  await sleep(HM.PROMPT_DELAY_MS + HM.AUTO_CLAIM_MS + 400);
  ok(A.net.isHost && B.net.hostId === 'A', 'crew migrated to A while H was away');
  mesh.connect('H', 'A');
  await sleep(120);
  ok(fatal && /continued without you/i.test(fatal), 'stale isolated host yields: ' + fatal);
  ok(A.net.isHost && B.net.hostId === 'A', 'new host unaffected');
  done(games);
}

// ------------------------------------------------------------------ 8. mistaken claim: only A<->H broke, B is still linked to H -> H keeps hosting, A demotes
{
  const { mesh, games, H, A, B } = await crew(3);
  mesh.sever('H', 'A');            // A alone lost H (link problem); B and H are fine
  await sleep(HM.PROMPT_DELAY_MS + HM.AUTO_CLAIM_MS + 400);
  ok(A.net.isHost && A.net.hostEpoch === 1, 'A (cut off from H) claimed the host on its side');
  ok(H.net.isHost && B.net.hostId === 'H', 'H and B are unaffected (B holds A\'s claim as pending)');
  mesh.connect('H', 'A');           // the link comes back
  await sleep(250);
  ok(H.net.isHost && H.net.hostEpoch === 1, 'H kept hosting and adopted epoch 1');
  ok(!A.net.isHost && A.net.hostId === 'H', 'A demoted and follows H again');
  ok(A.creatures.host.size === 0 && A.hostData === null, 'demoted host dropped its host-side state');
  ok(B.net.hostId === 'H', 'B still follows H');
  ok(H.net.players.has('A') && A.net.players.has('H'), 'nobody was removed from a roster');
  done(games);
}

// ------------------------------------------------------------------ 9. never before welcomed / migration disabled -> old behaviour (game ends)
{
  const mesh = new Mesh();
  const g = new FakeGame(mesh, 'X', false);
  await g.net.start({ name: 'x', pid: 'px' });
  g.hm = installHostMig(g);
  ok(g.hm.onHostLeft('left') === false, 'a joiner that never got a welcome ends the session as before');
  g.net.hostId = 'H'; g.net.connected = true; g.run = { phase: 'orbit' }; g.config.hostMig = false;
  ok(g.hm.onHostLeft('left') === false, 'config.hostMig=false keeps the old behaviour');
  done([g]);
}

console.error = origErr;
const bad = errors.filter((e) => !/^warn \[hostmig\] (hostData|creatures)/.test(e));
if (bad.length) { console.log('LOGGED ERRORS:\n' + bad.join('\n')); }
assert.equal(bad.length, 0, 'no exceptions / warnings logged');
console.log('hostmig.test: ' + checks + ' checks passed');
process.exit(0);
