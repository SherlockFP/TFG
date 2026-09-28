// Game session over a transport. Host-authoritative world; each peer owns its own player.
// Envelope: { t: type, d: data }. Clients -> host requests via request(); host -> all via broadcast().
import { makeTransport } from './transport.js';
import { GAME_VERSION } from './lobby.js';
import { Emitter } from '../core/events.js';

// Message types only the host may send. A client drops them from anybody else (a rogue or buggy peer
// cannot rewrite the run, spawn items or hand out XP), and the host drops them from everybody.
export const HOST_ONLY = new Set(['welcome', 'gs', 'phase', 'it', 'cev', 'cs', 'xp', 'power', 'summary', 'fired', 'quotamet',
  'tp', 'pickfail', 'sell', 'door', 'latch', 'stun', 'slow', 'hold', 'pleft']);
// Client-originated broadcast types the host forwards to crewmates that have no direct WebRTC link to the sender
// (full mesh without TURN: a failed client<->client link would otherwise desync those two silently).
// Feature modules may add their own types: game.net.relayTypes.add('myType').
const RELAY_TYPES = ['ps', 'pst', 'pinfo', 'itst', 'is', 'chat', 'fx', 'modmsg', 'ping'];

export class Session extends Emitter {
  constructor({ strategy, isHost, code, password, profile, maxPlayers = 4 }) {
    super();
    this.strategy = strategy;
    this.isHost = isHost;
    this.code = code;
    this.password = password || '';
    this.profile = profile;
    this.maxPlayers = maxPlayers;
    this.transport = makeTransport(strategy);
    this.hostId = null;
    this.selfId = null;
    this.players = new Map();     // peerId -> { id, name, level, suit, hat, ... }
    this.handlers = new Map();    // host request handlers: action -> fn(data, from)
    this.msgHandlers = new Map(); // message type -> fn(data, from)
    this.connected = false;
    this.stats = { sent: 0, recv: 0, bytesOut: 0, bytesIn: 0, relayed: 0, packetsOut: 0, packetsIn: 0, byType: {} };
    this.measureBytes = false;    // NETSTATS turns this on (JSON length per packet costs a little CPU)
    this._outq = [];              // outgoing messages of this task: [{ m, to }], flushed as one packet per peer
    this._flushPending = false;
    this._rows = new Map();       // sendRows(): type -> Map(id -> last sent row)
    this.relayTypes = new Set(RELAY_TYPES);
    this.peerLinks = new Map();   // host: peerId -> Set of peer ids that client reports a direct link to
  }

  // client -> host: which peers do I have a direct link to (debounced; the host relays around missing links)
  reportLinks() {
    if (this.isHost || !this.hostId) return;
    clearTimeout(this._linksT);
    this._linksT = setTimeout(() => {
      if (!this.transport || this.isHost || !this.hostId) return;
      this._out({ t: 'req', d: { a: '_links', ids: [...this.transport.peers] } }, this.hostId);
    }, 400);
  }

  // host: forward a client's broadcast to accepted players that reported no direct link to that client
  relay(t, d, from) {
    if (!this.isHost || !this.relayTypes.has(t) || !this.players.has(from)) return;
    const fromLinks = this.peerLinks.get(from);
    for (const q of this.players.keys()) {
      if (q === from || q === this.selfId) continue;
      const ql = this.peerLinks.get(q);
      const missing = (ql && !ql.has(from)) || (fromLinks && !fromLinks.has(q));
      if (!missing) continue;
      this.stats.relayed++;
      this._out({ t: 'relay', d: { from, m: { t, d } } }, q);
    }
  }

  async start(helloData) {
    const t = this.transport;
    t.onMessage = (m, from) => this.receive(m, from);
    t.onBinary = (buf, from, meta) => this.emit('binary', buf, from, meta);
    t.onStream = (stream, id) => this.emit('stream', stream, id);
    t.onError = (e) => this.emit('error', e);
    t.onPeerJoin = (id) => {
      this.emit('peerConnect', id);
      this.reportLinks();
      // everybody introduces themselves to new peers
      t.send({ t: 'hello', d: { ...this.helloData, ver: GAME_VERSION, host: this.isHost } }, id);
    };
    t.onPeerLeave = (id) => {
      const p = this.players.get(id);
      this.players.delete(id);
      this.peerLinks.delete(id);
      this.reportLinks();
      this.emit('peerLeave', id, p);
      if (!this.isHost && id === this.hostId) this.emit('hostLeft');
    };
    this.helloData = helloData;
    await t.join('game-' + this.code, this.password);
    this.selfId = t.selfId;
    if (this.isHost) {
      this.hostId = this.selfId;
      this.connected = true;
      this.players.set(this.selfId, { id: this.selfId, ...helloData, host: true });
    }
    return this;
  }

  // message dispatch
  receive(m, from, inner = false) {
    if (!m || typeof m !== 'object') return;
    if (!inner) {
      this.stats.packetsIn++;
      if (this.measureBytes) { try { this.stats.bytesIn += JSON.stringify(m).length; } catch { /* ignore */ } }
    }
    const { t, d } = m;
    if (t === '_b') {                                              // batched packet: every message of one sender task
      if (inner || !Array.isArray(d)) return;
      for (const x of d) this.receive(x, from, true);
      return;
    }
    this.stats.recv++;
    if (t === 'hello') {
      if (!d || typeof d !== 'object') return;
      if (d.ver !== GAME_VERSION) { if (this.isHost) this.transport.send({ t: 'reject', d: { reason: 'Version mismatch (host ' + GAME_VERSION + ')' } }, from); return; }
      if (d.host && !this.isHost && !this.connected) this.hostId = from;   // once welcomed, nobody else can claim host
      if (this.isHost) {
        if (this.players.size >= this.maxPlayers && !this.players.has(from)) {
          this.transport.send({ t: 'reject', d: { reason: 'Lobby is full' } }, from);
          return;
        }
        this.players.set(from, { id: from, ...d });
        this.emit('playerJoin', from, d);
      } else {
        this.players.set(from, { id: from, ...d });
        this.emit('peerHello', from, d);
      }
      return;
    }
    if (t === 'reject') { if (!this.isHost && (!this.hostId || from === this.hostId)) this.emit('rejected', d?.reason || 'Rejected'); return; }
    if (t === 'relay') {
      // host-forwarded crewmate message (only trusted from the host, never a control/host-only type)
      if (this.isHost || from !== this.hostId || !d || !d.m || typeof d.from !== 'string' || d.from === this.selfId) return;
      const it = d.m.t;
      if (!this.relayTypes.has(it)) return;
      this.receive(d.m, d.from);
      return;
    }
    if (HOST_ONLY.has(t)) {
      if (this.isHost) return;                                     // the host never takes world state from a client
      if (t === 'welcome' ? (this.hostId && from !== this.hostId && this.connected) : (this.hostId && from !== this.hostId)) return;
    }
    if (t === 'req') {
      if (!this.isHost || !d || typeof d.a !== 'string') return;
      if (d.a === '_links') { if (Array.isArray(d.ids)) this.peerLinks.set(from, new Set(d.ids.map(String))); return; }
      if (!this.players.has(from)) return;                          // rejected / not-yet-accepted peers cannot act
      const fn = this.handlers.get(d.a);
      if (fn) { try { fn(d, from); } catch (e) { console.error('req', d.a, e); } }
      return;
    }
    if (t === 'welcome' && !this.isHost) { this.hostId = from; this.connected = true; this.reportLinks(); }
    if (this.isHost) this.relay(t, d, from);
    const h = this.msgHandlers.get(t);
    if (h) { try { h(d, from); } catch (e) { console.error('msg', t, e); } }
    else this.emit('msg:' + t, d, from);
  }

  on_(type, fn) { this.msgHandlers.set(type, fn); }
  handle(action, fn) { this.handlers.set(action, fn); }

  // client -> host (host handles locally)
  request(a, data = {}) {
    const d = { a, ...data };
    if (this.isHost) {
      const fn = this.handlers.get(a);
      if (fn) { try { fn(d, this.selfId); } catch (e) { console.error('req local', a, e); } }
      return;
    }
    if (this.hostId) this._out({ t: 'req', d }, this.hostId);
  }

  // host -> everyone (including local handler when includeSelf)
  broadcast(t, d, includeSelf = true) {
    this._out({ t, d });
    if (includeSelf) this.receiveLocal(t, d);
  }
  sendTo(peerId, t, d) {
    if (peerId === this.selfId) { this.receiveLocal(t, d); return; }
    this._out({ t, d }, peerId);
  }
  // peer -> all others (no self)
  send(t, d) { this._out({ t, d }); }

  // Delta-compressed row snapshots (creature / item state tables: rows are arrays whose [0] is a stable id).
  // Only rows that changed since the last send go out; every `keyframe` seconds all rows are re-sent so late
  // joiners and lost packets heal. Receivers must apply rows individually (a missing row means "unchanged").
  // eps: numeric columns whose change is below it count as unchanged (positions/yaw jitter).
  sendRows(t, rows, { keyframe = 1.5, eps = 0.015, to } = {}) {
    let st = this._rows.get(t);
    if (!st) this._rows.set(t, st = { last: new Map(), keyT: 0 });
    const now = performance.now() / 1000;
    const full = now - st.keyT >= keyframe;
    if (full) st.keyT = now;
    const out = full ? rows : [];
    const seen = new Set();
    for (const r of rows) {
      const id = r[0];
      seen.add(id);
      const prev = st.last.get(id);
      if (!full && !rowChanged(prev, r, eps)) continue;
      st.last.set(id, r);
      if (!full) out.push(r);
    }
    if (full) for (const r of rows) st.last.set(r[0], r);
    for (const id of st.last.keys()) if (!seen.has(id)) st.last.delete(id);
    if (!out.length) return 0;
    if (to) this.sendTo(to, t, out); else this.send(t, out);
    return out.length;
  }

  // queue one message; everything queued during the current task leaves as ONE packet per peer (microtask
  // flush), so a frame that emits 8 messages costs 1 WebRTC send instead of 8. Per-peer order is preserved.
  _out(m, to) {
    this.stats.sent++;
    const bt = this.stats.byType;
    bt[m.t] = (bt[m.t] || 0) + 1;
    this._outq.push({ m, to: to || null });
    if (!this._flushPending) { this._flushPending = true; queueMicrotask(() => this.flush()); }
  }
  flush() {
    this._flushPending = false;
    const q = this._outq;
    if (!q.length || !this.transport) { q.length = 0; return; }
    this._outq = [];
    const pack = (list) => (list.length === 1 ? list[0] : { t: '_b', d: list });
    const put = (m, to) => {
      this.stats.packetsOut++;
      if (this.measureBytes) { try { this.stats.bytesOut += JSON.stringify(m).length * (to ? 1 : Math.max(1, this.transport.peers.size)); } catch { /* ignore */ } }
      this.transport.send(m, to || undefined);
    };
    if (q.every((e) => !e.to)) { put(pack(q.map((e) => e.m))); return; }
    // mixed targets: build each peer's ordered list (broadcasts go to everyone, directed ones to their peer)
    const per = new Map();
    const peers = [...this.transport.peers];
    for (const e of q) {
      const targets = e.to ? [e.to] : peers;
      for (const p of targets) { let a = per.get(p); if (!a) per.set(p, a = []); a.push(e.m); }
    }
    for (const [p, list] of per) put(pack(list), p);
  }
  receiveLocal(t, d) {
    const h = this.msgHandlers.get(t);
    if (h) { try { h(d, this.selfId); } catch (e) { console.error('local', t, e); } }
    else this.emit('msg:' + t, d, this.selfId);
  }

  sendBinary(buf, meta, to) { this.transport.sendBinary(buf, meta, to); }
  addStream(s) { this.transport.addStream(s); }
  removeStream(s) { this.transport.removeStream(s); }
  peerIds() { return [...this.transport.peers]; }
  playerCount() { return this.players.size; }
  leave() { clearTimeout(this._linksT); try { this.flush(); } catch { /* ignore */ } this.transport.leave(); this.clear(); }
}

function rowChanged(a, b, eps) {
  if (!a || a.length !== b.length) return true;
  for (let i = 1; i < b.length; i++) {
    const x = a[i], y = b[i];
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') { if (Math.abs(x - y) > eps) return true; continue; }
    if (x && y && typeof x === 'object') { try { if (JSON.stringify(x) === JSON.stringify(y)) continue; } catch { /* fallthrough */ } }
    return true;
  }
  return false;
}
