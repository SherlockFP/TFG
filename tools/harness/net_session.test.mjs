// Node test for src/net/session.js: connection-loss grace, resume, deliberate bye, packet split, backpressure drop.
// run: node tools/harness/net_session.test.mjs
import assert from 'node:assert/strict';
import { Session, NET } from '../../src/net/session.js';
import { GAME_VERSION } from '../../src/net/lobby.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class FakeTransport {
  constructor(selfId) { this.selfId = selfId; this.peers = new Set(); this.sent = []; this.slow = new Set(); }
  async join() { return this; }
  send(m, to) { this.sent.push({ m, to: to || null }); }
  sendBinary() {}
  congested(id) { return this.slow.has(id); }
  leave() { this.peers.clear(); }
  addStream() {} removeStream() {}
  async rejoin() { this.rejoined = (this.rejoined || 0) + 1; return true; }
  join_(id) { this.peers.add(id); this.onPeerJoin?.(id); }
}
async function mk(isHost) {
  const s = new Session({ strategy: 'local', isHost, code: 'T', profile: {} });
  s.transport = new FakeTransport(isHost ? 'HOST' : 'CLI');
  await s.start({ name: 'x', pid: 'p0' });
  return s;
}
const hello = (extra = {}) => ({ t: 'hello', d: { ver: GAME_VERSION, name: 'A', pid: 'pidA', ...extra } });
const log = (s, evs) => { const out = []; for (const e of evs) s.on(e, (...a) => out.push([e, ...a])); return out; };

// The last published client lacks open-place generation and density admission.
{
  const h = await mk(true);
  try {
    h.transport.join_('OLD'); h.receive(hello({ ver: '0.12.6' }), 'OLD');
    assert.ok(h.transport.sent.some(({ m, to }) => to === 'OLD' && m.t === 'reject' && m.d.reason.startsWith('Version mismatch')));
    assert.ok(!h.players.has('OLD'), 'old layout client is rejected before snapshot admission');
    h.transport.join_('CURRENT'); h.receive(hello({ pid: 'current' }), 'CURRENT');
    assert.ok(h.players.has('CURRENT'), 'current protocol still admits the crew');
  } finally { h.leave(); }
}

// 1. host: join -> lost -> resume keeps the player, no peerLeave
{
  const h = await mk(true);
  const ev = log(h, ['playerJoin', 'peerLost', 'peerResume', 'peerLeave']);
  h.transport.join_('A'); h.receive(hello(), 'A');
  assert.equal(ev.filter((e) => e[0] === 'playerJoin').length, 1);
  assert.equal(ev[0][3], false, 'first join is not a resume');
  h.transport.peers.delete('A'); h.transport.onPeerLeave('A');
  assert.ok(h.players.has('A'), 'player kept during grace');
  assert.ok(h.lost.has('A'));
  assert.equal(ev.filter((e) => e[0] === 'peerLeave').length, 0);
  h.transport.join_('A'); h.receive(hello(), 'A');
  assert.equal(ev.filter((e) => e[0] === 'peerResume').length, 1);
  const pj = ev.filter((e) => e[0] === 'playerJoin');
  assert.equal(pj.length, 2); assert.equal(pj[1][3], true, 'second join flagged resume');
  assert.equal(h.stats.reconnects, 1);
  assert.equal(h.lost.size, 0);
  h.leave();
}

// 2. deliberate bye -> immediate leave (bye first, then transport leave; and transport leave first, then bye)
{
  const h = await mk(true);
  const ev = log(h, ['peerLeave', 'peerLost']);
  h.transport.join_('A'); h.receive(hello(), 'A');
  h.receive({ t: 'bye' }, 'A'); h.transport.peers.delete('A'); h.transport.onPeerLeave('A');
  assert.equal(ev.filter((e) => e[0] === 'peerLeave').length, 1); assert.equal(ev.filter((e) => e[0] === 'peerLost').length, 0);
  h.transport.join_('B'); h.receive(hello({ pid: 'pidB' }), 'B');
  h.transport.peers.delete('B'); h.transport.onPeerLeave('B');
  assert.ok(h.lost.has('B'));
  h.receive({ t: 'bye' }, 'B');
  assert.equal(ev.filter((e) => e[0] === 'peerLeave').length, 2);
  assert.ok(!h.players.has('B'));
  h.leave();
}

// 3. grace expiry -> hard leave; new peer id with the same pid replaces the ghost immediately
{
  const old = NET.LOST_GRACE_MS; NET.LOST_GRACE_MS = 40;
  const h = await mk(true);
  const ev = log(h, ['peerLeave']);
  h.transport.join_('A'); h.receive(hello(), 'A');
  h.transport.peers.delete('A'); h.transport.onPeerLeave('A');
  await sleep(90);
  assert.equal(ev.length, 1); assert.ok(!h.players.has('A'));
  NET.LOST_GRACE_MS = 5000;
  h.transport.join_('C'); h.receive(hello({ pid: 'pidC' }), 'C');
  h.transport.peers.delete('C'); h.transport.onPeerLeave('C');
  h.transport.join_('C2'); h.receive(hello({ pid: 'pidC' }), 'C2');
  assert.ok(!h.players.has('C') && h.players.has('C2'), 'ghost replaced by same pid');
  assert.equal(h.lost.size, 0);
  NET.LOST_GRACE_MS = old;
  h.leave();
}

// 4. full lobby still rejects strangers but not a resuming player
{
  const h = await mk(true); h.maxPlayers = 2;
  h.transport.join_('A'); h.receive(hello(), 'A');
  h.transport.join_('B'); h.receive(hello({ pid: 'pidB' }), 'B');
  assert.ok(h.transport.sent.some((x) => x.m.t === 'reject' && x.to === 'B'));
  assert.ok(!h.players.has('B'));
  h.transport.peers.delete('A'); h.transport.onPeerLeave('A');
  h.transport.join_('A'); h.receive(hello(), 'A');
  assert.ok(h.players.has('A'));
  h.leave();
}

// 5. client: host lost -> peerLost, then resume; expiry -> hostLeft('timeout'); bye -> hostLeft('left')
{
  const old = NET.LOST_GRACE_MS;
  const c = await mk(false);
  const ev = log(c, ['peerLost', 'peerResume', 'hostLeft']);
  c.transport.join_('HOST'); c.receive({ t: 'hello', d: { ver: GAME_VERSION, host: true, name: 'H', pid: 'ph' } }, 'HOST');
  c.receive({ t: 'welcome', d: {} }, 'HOST');
  assert.equal(c.hostId, 'HOST');
  c.transport.peers.delete('HOST'); c.transport.onPeerLeave('HOST');
  assert.equal(ev.filter((e) => e[0] === 'hostLeft').length, 0);
  c.transport.join_('HOST'); c.receive({ t: 'hello', d: { ver: GAME_VERSION, host: true, name: 'H', pid: 'ph' } }, 'HOST');
  assert.equal(ev.filter((e) => e[0] === 'peerResume').length, 1);
  NET.LOST_GRACE_MS = 30;
  c.transport.peers.delete('HOST'); c.transport.onPeerLeave('HOST');
  await sleep(80);
  const hl = ev.find((e) => e[0] === 'hostLeft'); assert.ok(hl && hl[1] === 'timeout');
  NET.LOST_GRACE_MS = old;
  c.leave();
  const c2 = await mk(false);
  const ev2 = log(c2, ['hostLeft']);
  c2.transport.join_('HOST'); c2.receive({ t: 'hello', d: { ver: GAME_VERSION, host: true, name: 'H', pid: 'ph' } }, 'HOST'); c2.receive({ t: 'welcome', d: {} }, 'HOST');
  c2.receive({ t: 'bye' }, 'HOST'); c2.transport.peers.delete('HOST'); c2.transport.onPeerLeave('HOST');
  assert.equal(ev2.length, 1); assert.equal(ev2[0][1], 'left');
  c2.leave();
}

// 6. packet cap: 40 x 1 KB messages -> several packets, each <= cap (+ one message); order preserved
{
  const h = await mk(true);
  h.transport.join_('A'); h.receive(hello(), 'A');
  h.transport.sent.length = 0;
  const blob = 'x'.repeat(1000);
  for (let i = 0; i < 40; i++) h.send('chat', { i, blob });
  h.flush();
  const pk = h.transport.sent.filter((x) => x.m.t === '_b' || x.m.t === 'chat');
  assert.ok(pk.length >= 3, 'split into several packets: ' + pk.length);
  const got = [];
  for (const x of pk) { assert.ok(JSON.stringify(x.m).length <= NET.PACKET_CAP + 1200); for (const m of (x.m.t === '_b' ? x.m.d : [x.m])) got.push(m.d.i); }
  assert.deepEqual(got, Array.from({ length: 40 }, (_, i) => i));
  assert.ok(h.stats.splits >= 1);
  // one oversized message goes alone
  h.transport.sent.length = 0;
  h.send('chat', { i: 1, blob: 'y'.repeat(50000) }); h.send('chat', { i: 2 });
  h.flush();
  assert.equal(h.transport.sent.length, 2);
  h.leave();
}

// 7. backpressure: a congested peer is not fed latest-wins state, healthy peers are; directed msgs to a lost peer are dropped
{
  const h = await mk(true);
  h.transport.join_('A'); h.receive(hello(), 'A');
  h.transport.join_('B'); h.receive(hello({ pid: 'pidB' }), 'B');
  h.transport.slow.add('A');
  h.transport.sent.length = 0;
  h.send('ps', { p: [0, 0, 0] }); h.send('chat', { m: 'hi' });
  h.flush();
  const toA = h.transport.sent.filter((x) => x.to === 'A').flatMap((x) => (x.m.t === '_b' ? x.m.d : [x.m])).map((m) => m.t);
  const toB = h.transport.sent.filter((x) => x.to === 'B').flatMap((x) => (x.m.t === '_b' ? x.m.d : [x.m])).map((m) => m.t);
  assert.deepEqual(toA, ['chat']); assert.deepEqual(toB, ['ps', 'chat']);
  assert.ok(h.stats.dropped >= 1);
  h.transport.slow.clear();
  h.transport.peers.delete('B'); h.transport.onPeerLeave('B');
  h.transport.sent.length = 0;
  h.sendTo('B', 'sys', {}); h.flush();
  assert.equal(h.transport.sent.length, 0);
  h.leave();
}

// 8. heartbeat + stall + zombie (host drops it), lost host triggers a rejoin
{
  const h = await mk(true);
  const ev = log(h, ['peerStall', 'peerLeave']);
  h.transport.join_('A'); h.receive(hello(), 'A');
  h.transport.sent.length = 0; h._tick();
  assert.ok(h.transport.sent.some((x) => x.m.t === 'hb'));
  h.lastSeen.set('A', performance.now() - NET.STALL_MS - 100); h._tick();
  assert.equal(ev.filter((e) => e[0] === 'peerStall').length, 1);
  h.lastSeen.set('A', performance.now() - NET.DEAD_MS - 100); h._tick();
  assert.equal(ev.filter((e) => e[0] === 'peerLeave').length, 1);
  h.leave();
  const c = await mk(false);
  c.transport.join_('HOST'); c.receive({ t: 'hello', d: { ver: GAME_VERSION, host: true, name: 'H', pid: 'ph' } }, 'HOST'); c.receive({ t: 'welcome', d: {} }, 'HOST');
  c.transport.peers.delete('HOST'); c.transport.onPeerLeave('HOST');
  c.lost.get('HOST').t -= NET.REJOIN_AFTER_MS + 1; c._tick();
  assert.equal(c.transport.rejoined, 1); assert.equal(c.stats.rejoins, 1);
  c.leave();
}

// Manual settings recovery works for an isolated host without clearing native
// player records. Existing crew links and in-flight/too-early retries are kept.
for(const isHost of [true,false]){
  const s=await mk(isHost),transport=s.transport,players=s.players;
  assert.equal((await s.retryConnection()).reason,'waiting');
  s._startedAt=performance.now()-NET.FIRST_JOIN_REJOIN_MS-10;
  let notice=0;s.on('rejoined',()=>notice++);
  assert.equal((await s.retryConnection()).ok,true);
  assert.equal(transport.rejoined,1);assert.equal(notice,1);assert.equal(s.players,players);
  assert.equal((await s.retryConnection()).reason,'waiting');
  s._lastRejoin-=NET.REJOIN_EVERY_MS+1;transport.peers.add('WORKING');
  assert.equal((await s.retryConnection()).reason,'connected');assert.equal(transport.rejoined,1);
  transport.peers.clear();transport._rejoining=true;
  assert.equal((await s.retryConnection()).reason,'busy');transport._rejoining=false;
  transport.rejoin=async()=>{throw Error('offline')};assert.equal((await s.retryConnection()).reason,'failed');
  s.leave();assert.equal((await s.retryConnection()).reason,'stopped');
}
{
 const s=await mk(true);s.transport.rejoin=undefined;
 assert.equal((await s.retryConnection()).reason,'unsupported');s.leave();
}
console.log('net_session.test OK');
process.exit(0);
