// Regression: host-routed co-op works with no client-to-client connection.
import assert from 'node:assert/strict';
import { TrysteroTransport, CONGEST_AT } from '../../src/net/transport.js';
import { Session } from '../../src/net/session.js';
import { LobbyDirectory, GAME_VERSION } from '../../src/net/lobby.js';
import { hostMethods } from '../../src/game/host.js';
import { RemotePlayer } from '../../src/entities/remote.js';
import * as THREE from 'three';

class Link {
  constructor(id, bus) { this.selfId = id; this.bus = bus; this.peers = new Set(); this.sent = []; bus.set(id, this); }
  async join() {}
  send(m, to) {
    this.sent.push({ m: structuredClone(m), to });
    for (const id of to ? [to] : this.peers) {
      if (this.peers.has(id)) queueMicrotask(() => this.bus.get(id)?.onMessage?.(structuredClone(m), this.selfId));
    }
  }
  congested() { return false; }
  leave() { this.peers.clear(); }
}
const drain = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); };
for (const mesh of [false, true]) {
  const bus = new Map();
  const mk = async (id, host) => {
    const s = new Session({ strategy: 'local', isHost: host, code: 'FIX123', profile: {} });
    s.transport = new Link(id, bus);
    await s.start({ name: id, pid: id });
    return s;
  };
  const h = await mk('H', true), a = await mk('A', false), b = await mk('B', false);
  h.transport.peers = new Set(['A', 'B']);
  a.transport.peers = new Set(mesh ? ['H', 'B'] : ['H']);
  b.transport.peers = new Set(mesh ? ['H', 'A'] : ['H']);
  h.on('playerJoin', (id, info) => {
    h.broadcast('pjoin', { id, ...info }, false);
    h.sendTo(id, 'welcome', { run: { phase: 'orbit', credits: 60 }, players: [...h.players.values()] });
  });
  for (const s of [a, b]) { s.hostId = 'H'; s.on_('welcome', () => {}); }
  h.receive({ t: 'hello', d: { ver: GAME_VERSION, name: 'A', pid: 'A' } }, 'A');
  await drain();
  h.receive({ t: 'hello', d: { ver: GAME_VERSION, name: 'B', pid: 'B' } }, 'B');
  await drain();
  assert.ok(a.connected && b.connected);
  assert.equal(a.players.get('B').name, 'B', 'existing client learns new player through host');
  assert.equal(b.players.get('A').name, 'A', 'late join roster includes existing client');
  const seen = [];
  b.on_('ps', (d, from) => seen.push({ d, from }));
  const state = { p: [3, 1, 5], f: 16, hp: 100 };
  a.send('ps', state); await drain();
  assert.deepEqual(seen, [{ d: state, from: 'A' }], 'movement delivered once with original owner, mesh=' + mesh);
  assert.equal(a.transport.sent.at(-1).to, 'H', 'client gameplay targets host only');
  const charges = [];
  b.on_('itst', (d, from) => charges.push([from, d.c]));
  a.broadcast('itst', { id: 'flashlight', c: 42 }); await drain();
  assert.deepEqual(charges, [['A', 42]], 'client broadcast does not duplicate relayed inventory');
  let picked;
  h.handle('pick', (d, from) => { picked = from; h.broadcast('it', { id: d.id, holder: from }); });
  const items = [];
  b.on_('it', d => items.push(d));
  a.request('pick', { id: 'loot1' }); await drain();
  assert.equal(picked, 'A'); assert.deepEqual(items, [{ id: 'loot1', holder: 'A' }]);
  // Direct link failure must not evict a crewmate who still reaches the host.
  a.transport.peers.delete('B'); a.transport.onPeerLeave('B');
  assert.ok(a.players.has('B') && !a.lost.has('B'));
  // A client cannot forge host admission or relay as the host.
  a.receive({ t: 'pjoin', d: { id: 'EVIL' } }, 'B');
  assert.ok(!a.players.has('EVIL'));
  for (const s of [h, a, b]) s.leave();
}
// Rejected content/late joins do not reserve a slot or get treated as a permitted resume.
{
  const g = { mods: { gateJoin: () => false }, net: { players: new Map([['REJECTED', {}]]) } };
  hostMethods.hostOnPlayerJoin.call(g, 'REJECTED', {}, false);
  assert.ok(!g.net.players.has('REJECTED'));
}
// Failed world application cannot mark a client ready. A later snapshot retries cleanly.
{
  const s = new Session({ strategy: 'local', isHost: false, code: 'X', profile: {} });
  s.transport = new Link('C', new Map()); s.hostId = 'H';
  let ready = 0; s.on('ready', () => ready++);
  s.on_('welcome', () => { throw new Error('bad snapshot'); });
  const error = console.error; console.error = () => {};
  s.receive({ t: 'welcome', d: {} }, 'H'); console.error = error;
  assert.equal(s.connected, false); assert.equal(ready, 0);
  s.on_('welcome', () => {}); s.receive({ t: 'welcome', d: {} }, 'H');
  assert.equal(s.connected, true); assert.equal(ready, 1); s.leave();
}
// Periodic movement heals a missed revive event instead of keeping a living avatar invisible.
{
  const r = { pos: new THREE.Vector3(), target: new THREE.Vector3(), lastUpdate: 0, dead: true,
    emoteNet: null, heldType: null, setDead(v) { this.dead = v; this.visible = !v; } };
  RemotePlayer.prototype.applyState.call(r, { p: [2, 1, 3], y: 0, f: 16, h: null, hp: 100 });
  assert.ok(r.visible && !r.dead); assert.deepEqual(r.pos.toArray(), [2, 1, 3]);
  RemotePlayer.prototype.applyState.call(r, { p: [2, 1, 3], y: 0, f: 32, h: null, hp: 0 });
  assert.ok(r.dead && !r.visible);
}
// Discovery query really asks hosts; stopping while join awaits must not leak a timer.
{
  const bus = new Map();
  const host = new LobbyDirectory('local', () => new Link('DH', bus));
  const browser = new LobbyDirectory('local', () => new Link('DB', bus));
  await host.start(); await browser.start();
  host.transport.peers.add('DB'); browser.transport.peers.add('DH');
  host.announce({ code: 'FIX123', strategy: 'local', players: 1, max: 4 }); await drain();
  browser.lobbies.clear(); browser.refresh(); await drain();
  assert.equal(browser.list()[0].code, 'FIX123');
  assert.equal(browser.list()[0].strategy, 'local');
  host.stop(); await drain(); assert.equal(browser.list().length, 0); browser.stop();
  let resolveJoin;
  const tr = new Link('SLOW', bus); tr.join = () => new Promise(r => { resolveJoin = r; });
  const slow = new LobbyDirectory('local', () => tr);
  const joining = slow.start(); slow.stop(); resolveJoin(); await joining;
  assert.equal(slow.timer, null); assert.equal(slow.status, 'idle');
}
// Exercise the installed Trystero adapter shape, and cancellation during lazy import.
{
  const configs = [], sends = [];
  const room = { makeAction: () => ({ send: (d, opts) => { sends.push([d, opts]); return Promise.resolve(); } }), leave() {}, addStream() {} };
  const tr = new TrysteroTransport('nostr');
  tr.mod = { selfId: 'SELF', joinRoom: (cfg) => { configs.push(cfg); return room; } };
  await tr.join('game-TEST');
  assert.equal(configs[0].appId, 'kefal-company-v1');
  assert.equal(configs[0].relayConfig.redundancy, 10);
  room.onPeerJoin('P'); tr.send({ t: 'ps' }, 'P'); await drain();
  assert.deepEqual(sends.at(-1), [{ t: 'ps' }, { target: 'P' }]);
  assert.equal(tr.inflight.size, 0); tr.leave();
  const slow = new TrysteroTransport(); let release;
  slow.load = () => new Promise(r => { release = r; });
  const pending = slow.join('game-SLOW'); slow.leave();
  release({ selfId: 'SELF', joinRoom() { throw new Error('cancelled join created a ghost room'); } });
  await pending; assert.equal(slow.room, null);
}
// Saturate one peer as Trystero does when its datachannel waits for bufferedamountlow.
// Reliable events still pass; stale state is skipped only for that peer, while a healthy
// crew member receives it. Four 12-KiB packets stay below the 64-KiB low-water threshold.
{
  class Saturating extends Link {
    constructor(id, bus) { super(id, bus); this.pending = new Map(); }
    congested(id) { return (this.pending.get(id) || 0) >= CONGEST_AT; }
    send(m, to) { this.sent.push({ m: structuredClone(m), to }); if (to) this.pending.set(to, (this.pending.get(to) || 0) + 1); }
  }
  assert.equal(CONGEST_AT, 4);
  const bus = new Map(), h = new Session({ strategy: 'local', isHost: true, code: 'LOAD', profile: {} });
  h.transport = new Saturating('LOAD-H', bus); h.transport.peers = new Set(['SLOW', 'FAST']);
  h.selfId = 'LOAD-H'; h.players.set('LOAD-H', { id: 'LOAD-H' });
  for (const id of ['SLOW', 'FAST']) h.players.set(id, { id });
  h.transport.pending.set('SLOW', CONGEST_AT);
  h.send('chat', { m: 'event remains reliable' });
  h.sendRows('cs', [['creature-1', 1, 2, 3]], { keyframe: 0 });
  h.flush();
  const slow = h.transport.sent.filter(x => x.to === 'SLOW').map(x => x.m.t);
  const fast = h.transport.sent.filter(x => x.to === 'FAST').flatMap(x => x.m.t === '_b' ? x.m.d.map(m => m.t) : [x.m.t]);
  assert.deepEqual(slow, ['chat'], 'reliable event drains while congested state is skipped');
  assert.deepEqual(fast, ['chat', 'cs'], 'healthy peer keeps receiving snapshots');
  assert.equal(h.stats.dropped, 1);
  h.leave();
}
// A large keyframe is split into packets at the same 12-KiB byte boundary that
// protects the channel; Trystero need not hold one giant multi-chunk snapshot open.
{
  const bus = new Map(), h = new Session({ strategy: 'local', isHost: true, code: 'ROWS', profile: {} });
  h.transport = new Link('ROWS-H', bus); h.transport.peers.add('P');
  h.selfId = 'ROWS-H'; h.players.set('P', { id: 'P' });
  const rows = Array.from({ length: 400 }, (_, i) => ['creature-' + i, i + 0.1, 1, i + 0.2, 1, 'walk', 'player-id', 100]);
  h.sendRows('cs', rows, { keyframe: 0 }); h.flush();
  const packets = h.transport.sent.map(x => x.m);
  assert.ok(packets.length > 1, 'large creature snapshots get several bounded packets');
  assert.ok(packets.every(m => new TextEncoder().encode(JSON.stringify(m)).byteLength <= 12000), 'packet payloads fit the byte cap');
  h.leave();
}
console.log('multiplayer_hotfix.test OK (star + mesh, admission, movement, item requests, revive, discovery)');
