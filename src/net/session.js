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
    this.stats = { sent: 0, recv: 0, bytesOut: 0, relayed: 0 };
    this.relayTypes = new Set(RELAY_TYPES);
    this.peerLinks = new Map();   // host: peerId -> Set of peer ids that client reports a direct link to
  }

  // client -> host: which peers do I have a direct link to (debounced; the host relays around missing links)
  reportLinks() {
    if (this.isHost || !this.hostId) return;
    clearTimeout(this._linksT);
    this._linksT = setTimeout(() => {
      if (!this.transport || this.isHost || !this.hostId) return;
      this.transport.send({ t: 'req', d: { a: '_links', ids: [...this.transport.peers] } }, this.hostId);
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
      this.transport.send({ t: 'relay', d: { from, m: { t, d } } }, q);
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
  receive(m, from) {
    if (!m || typeof m !== 'object') return;
    this.stats.recv++;
    const { t, d } = m;
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
    if (this.hostId) this.transport.send({ t: 'req', d }, this.hostId);
  }

  // host -> everyone (including local handler when includeSelf)
  broadcast(t, d, includeSelf = true) {
    this.stats.sent++;
    this.transport.send({ t, d });
    if (includeSelf) this.receiveLocal(t, d);
  }
  sendTo(peerId, t, d) {
    if (peerId === this.selfId) { this.receiveLocal(t, d); return; }
    this.transport.send({ t, d }, peerId);
  }
  // peer -> all others (no self)
  send(t, d) { this.stats.sent++; this.transport.send({ t, d }); }
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
  leave() { clearTimeout(this._linksT); this.transport.leave(); this.clear(); }
}
