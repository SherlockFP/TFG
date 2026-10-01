// Game session over a transport. Host-authoritative world; each peer owns its own player.
// Envelope: { t: type, d: data }. Clients -> host requests via request(); host -> all via broadcast().
import { makeTransport } from './transport.js';
import { GAME_VERSION } from './lobby.js';
import { Emitter } from '../core/events.js';

// Message types only the host may send. A client drops them from anybody else (a rogue or buggy peer
// cannot rewrite the run, spawn items or hand out XP), and the host drops them from everybody.
export const HOST_ONLY = new Set(['welcome', 'gs', 'phase', 'it', 'cev', 'cs', 'xp', 'power', 'summary', 'fired', 'quotamet',
  'tp', 'pickfail', 'sell', 'door', 'latch', 'stun', 'slow', 'hold', 'pleft', 'pjoin']);
// Client-originated gameplay types routed through the host. A missing client<->client
// WebRTC link never prevents movement / inventory / chat from reaching crewmates.
// Feature modules may add their own types: game.net.relayTypes.add('myType').
const RELAY_TYPES = ['ps', 'pst', 'pinfo', 'itst', 'is', 'chat', 'fx', 'modmsg', 'ping'];

// Connection-loss policy (tuned for real-internet WebRTC; see docs/wave3/net.md)
export const NET = {
  LOST_GRACE_MS: 45000,   // a transport "peer left" is NOT a leave for this long: the same peer id usually re-appears (ICE restart / Trystero re-announce)
  HB_MS: 2000,            // app-level heartbeat (independent of the game loop, keeps flowing from throttled hidden tabs)
  STALL_MS: 20000,        // no packet from a linked peer for this long -> 'peerStall' warning
  DEAD_MS: 75000,         // ...and this long -> the link is a zombie: rejoin the room (client) / drop the peer (host)
  // A lost HOST link that has not come back after this long -> the client forces a fresh signalling announce. Must stay
  // above Trystero's own handshake windows (answer TTL 23.3 s, disconnected-peer grace 7.5 s): leaving the room earlier
  // aborts a handshake that was about to succeed, and on slow relays / real NATs the joiner never got in (2026-09-29 regression).
  REJOIN_AFTER_MS: 25000,
  FIRST_JOIN_REJOIN_MS: 35000, // a joiner that has not heard from any host yet (the first Nostr handshake can take 10-20 s)
  REJOIN_EVERY_MS: 30000,
  PACKET_CAP: 12000,      // batched packets are split above ~12 KB (a single bigger message goes alone; Trystero chunks at 16 KB)
};
// Latest-wins state streams: dropped (never queued) for a peer whose datachannel is backed up. Keyframes heal them.
const DROPPABLE = new Set(['ps', 'cs', 'is', 'sgs']);

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
    this.stats = { sent: 0, recv: 0, bytesOut: 0, bytesIn: 0, relayed: 0, packetsOut: 0, packetsIn: 0, byType: {}, lost: 0, reconnects: 0, rejoins: 0, dropped: 0, splits: 0, stalls: 0, graceExpired: 0 };
    this.lost = new Map();        // peerId -> { t, timer }: transport says gone, still inside the grace window (player/items/avatar kept)
    this.byes = new Set();        // peers that announced a deliberate leave
    this.lastSeen = new Map();    // peerId -> performance.now() of the last packet (any type, heartbeats included)
    this._stalled = new Set();
    this.measureBytes = false;    // NETSTATS turns this on (JSON length per packet costs a little CPU)
    this._outq = [];              // outgoing messages of this task: [{ m, to }], flushed as one packet per peer
    this._flushPending = false;
    this._rows = new Map();       // sendRows(): type -> Map(id -> last sent row)
    this.relayTypes = new Set(RELAY_TYPES);
    this.peerLinks = new Map();   // host: peerId -> Set of peer ids that client reports a direct link to
    this.hostEpoch = 0;           // host migration counter (game/hostmig.js): +1 every time the crew elects a new host
  }

  // Host migration (game/hostmig.js, docs/wave4/hostmig.md): re-point this session at a new host. Only flips the role fields and forgets
  // the old host's transport bookkeeping; all game-level work (rebuilding host state, avatars, items) is done by the caller.
  // keepOld: the previous host is alive and stays in the crew (split-brain resolution). Returns the old host's player record (or null). Never emits 'hostLeft' / 'peerLeave' by itself.
  migrateTo(newHostId, epoch, keepOld = false) {
    const old = this.hostId;
    this.hostId = newHostId;
    this.isHost = newHostId === this.selfId;
    this.connected = true;
    this._hellos = 99;
    if (epoch != null) this.hostEpoch = epoch;
    let oldPlayer = null;
    if (old && old !== newHostId && old !== this.selfId && !keepOld) {
      const L = this.lost.get(old); if (L) clearTimeout(L.timer);
      this.lost.delete(old); this.lastSeen.delete(old); this._stalled.delete(old); this.peerLinks.delete(old);
      oldPlayer = this.players.get(old) || null;
      this.players.delete(old);
    }
    for (const [id, p] of this.players) p.host = id === newHostId;
    if (this.isHost && this.selfId && !this.players.has(this.selfId)) this.players.set(this.selfId, { id: this.selfId, ...this.helloData, host: true });
    this.reportLinks();
    return oldPlayer;
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

  // Host forwards client gameplay to every admitted crewmate, independent of direct mesh links.
  relay(t, d, from) {
    if (!this.isHost || !this.relayTypes.has(t) || !this.players.has(from)) return;
    for (const q of this.players.keys()) {
      if (q === from || q === this.selfId) continue;
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
      this.byes.delete(id);
      this.lastSeen.set(id, performance.now());
      this.emit('peerConnect', id);
      this.reportLinks();
      // everybody introduces themselves to new peers
      t.send({ t: 'hello', d: { ...this.helloData, ver: GAME_VERSION, host: this.isHost } }, id);
    };
    t.onPeerLeave = (id, deliberate) => this.peerGone(id, !!deliberate || this.byes.has(id));
    this.helloData = helloData;
    this._startWatch();
    await t.join('game-' + this.code, this.password);
    this.selfId = t.selfId;
    this._startedAt = performance.now();
    if (this.isHost) {
      this.hostId = this.selfId;
      this.connected = true;
      this.players.set(this.selfId, { id: this.selfId, ...helloData, host: true });
    }
    return this;
  }

  // ------------------------------------------------------------------ connection loss / resume
  // The transport says a peer is gone. Unless it announced a leave ('bye'), keep its player record for a grace window:
  // a WebRTC link that dropped (ICE 'disconnected' > 5 s, NAT rebind, sleep) is normally re-discovered and the same
  // peer id comes back with a fresh 'hello' -> peerResume, nothing lost. Only when the window expires does it become
  // the old hard leave (peerLeave: items dropped, avatar removed, slot freed / 'hostLeft').
  peerGone(id, deliberate) {
    this.byes.delete(id);
    if (!this.isHost && id !== this.hostId && !deliberate) { this.reportLinks(); return; }
    const known = this.players.has(id) || id === this.hostId;
    if (deliberate || !known || this.leaving) { this.finalizeLeave(id); return; }
    if (this.lost.has(id)) return;
    this.stats.lost++;
    const timer = setTimeout(() => { if (this.lost.has(id)) { this.stats.graceExpired++; this.finalizeLeave(id, 'timeout'); } }, NET.LOST_GRACE_MS);
    this.lost.set(id, { t: performance.now(), timer });
    this.peerLinks.delete(id);
    this.reportLinks();
    this.emit('peerLost', id, this.players.get(id), NET.LOST_GRACE_MS);
  }
  finalizeLeave(id, why) {
    const L = this.lost.get(id);
    if (L) clearTimeout(L.timer);
    this.lost.delete(id);
    this.lastSeen.delete(id); this._stalled.delete(id);
    const p = this.players.get(id);
    this.players.delete(id);
    this.peerLinks.delete(id);
    this.reportLinks();
    this.emit('peerLeave', id, p);
    if (!this.isHost && id === this.hostId) this.emit('hostLeft', why || 'left');
  }
  // same person came back under a NEW peer id (page reload): free the ghost's slot right away
  _replaceGhost(pid, newId) {
    if (!pid) return;
    for (const id of [...this.lost.keys()]) if (id !== newId && this.players.get(id)?.pid === pid) this.finalizeLeave(id, 'replaced');
  }

  _startWatch() {
    if (this._watch) return;
    this._watch = setInterval(() => { try { this._tick(); } catch (e) { console.error('net watch', e); } }, NET.HB_MS);
    this._watch.unref?.();
    if (typeof window !== 'undefined') {
      this._onUnload = () => { try { this.flush(); this.transport?.send({ t: 'bye' }); } catch { /* ignore */ } };
      window.addEventListener('pagehide', this._onUnload, true);
    }
  }
  _tick() {
    const t = this.transport;
    if (!t) return;
    const now = performance.now();
    if (t.peers.size) t.send({ t: 'hb' });
    for (const id of [...t.peers]) {
      const last = this.lastSeen.get(id) ?? (this.lastSeen.set(id, now), now);
      const idle = now - last;
      if (idle < 5000) this._stalled.delete(id);
      else if (idle > NET.STALL_MS && !this._stalled.has(id)) { this._stalled.add(id); this.stats.stalls++; this.emit('peerStall', id, idle); }
      if (idle > NET.DEAD_MS) {
        // the transport still calls it connected but nothing arrives: zombie link
        this.lastSeen.set(id, now);
        if (this.isHost) { t.peers.delete(id); this.peerGone(id, true); }
        else if (id === this.hostId) { this.peerGone(id, false); this._rejoin(); }
      }
    }
    if (!this.isHost && !this.connected && !this.hostId && now - (this._startedAt ?? now) > NET.FIRST_JOIN_REJOIN_MS) this._rejoin();
    // joiner that never got its welcome (snapshot chunks can be dropped after a 10 s datachannel stall): ask again, the host re-welcomes
    if (!this.isHost && !this.connected && this.hostId && t.peers.has(this.hostId) && (this._hellos || 0) < 4) {
      this._helloT ??= now;
      if (now - this._helloT > 8000 * ((this._hellos || 0) + 1)) { this._hellos = (this._hellos || 0) + 1; t.send({ t: 'hello', d: { ...this.helloData, ver: GAME_VERSION, host: false } }, this.hostId); }
    }
    // Only a CLIENT re-enters the room, and only for its host link. The host never does: leaving the room drops every
    // other crewmate and aborts the handshakes of players who are joining right now; Trystero keeps announcing the
    // host on the relays by itself, so a lost client finds it again without help.
    for (const [id, L] of this.lost) {
      if (now - L.t < NET.REJOIN_AFTER_MS) continue;
      if (!this.isHost && id === this.hostId) this._rejoin();
    }
  }
  _rejoin() {
    const t = this.transport;
    const now = performance.now();
    if (this.isHost || !t?.rejoin || this.leaving || now - (this._lastRejoin ?? -1e9) < NET.REJOIN_EVERY_MS) return;
    this._lastRejoin = now;
    this.stats.rejoins++;
    t.rejoin().then((ok) => { if (ok) this.emit('rejoined'); }).catch(() => {});
  }

  // message dispatch
  receive(m, from, inner = false) {
    if (!m || typeof m !== 'object') return;
    if (!inner) {
      this.lastSeen.set(from, performance.now());
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
    if (t === 'hb') return;
    if (t === 'bye') { this.byes.add(from); if (this.lost.has(from)) this.finalizeLeave(from); return; }
    if (t === 'hello') {
      if (!d || typeof d !== 'object') return;
      if (d.ver !== GAME_VERSION) { if (this.isHost) this.transport.send({ t: 'reject', d: { reason: 'Version mismatch (host ' + GAME_VERSION + ')' } }, from); return; }
      this.byes.delete(from);
      if (d.host && !this.isHost && !this.connected) this.hostId = from;   // once welcomed, nobody else can claim host
      // a hello from a peer we already know (lost inside the grace window, or a re-established link Trystero swapped in
      // silently) is a RESUME: same player record, the host re-sends the world snapshot instead of running a fresh join
      const L = this.lost.get(from);
      if (L) { clearTimeout(L.timer); this.lost.delete(from); }
      const resume = !!L || this.players.has(from);
      this._replaceGhost(d.pid, from);
      if (this.isHost && this.players.size >= this.maxPlayers && !this.players.has(from)) {
        this.transport.send({ t: 'reject', d: { reason: 'Lobby is full' } }, from);
        return;
      }
      if (resume) this.stats.reconnects++;
      this.players.set(from, { id: from, ...d });
      if (resume) this.emit('peerResume', from, d);
      if (this.isHost) this.emit('playerJoin', from, d, resume);
      else this.emit('peerHello', from, d);
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
      if (t === 'welcome' ? (this.hostId && from !== this.hostId) : from !== this.hostId) return;
    }
    if (this.isHost && this.relayTypes.has(t) && !this.players.has(from)) return;
    if (t === 'req') {
      if (!this.isHost || !d || typeof d.a !== 'string') return;
      if (d.a === '_links') { if (Array.isArray(d.ids)) this.peerLinks.set(from, new Set(d.ids.map(String))); return; }
      if (!this.players.has(from)) return;                          // rejected / not-yet-accepted peers cannot act
      const fn = this.handlers.get(d.a);
      if (fn) { try { fn(d, from); } catch (e) { console.error('req', d.a, e); } }
      return;
    }
    if (t === 'welcome' && !this.isHost) {
      this.hostId = from;
      for (const p of d?.players || []) if (p?.id) this.players.set(p.id, { ...p, host: p.id === from });
    }
    if (t === 'pjoin' && !this.isHost && d?.id) this.players.set(d.id, d);
    if (this.isHost) this.relay(t, d, from);
    const h = this.msgHandlers.get(t);
    if (h) { try { h(d, from); } catch (e) { console.error('msg', t, e); return; } }
    else this.emit('msg:' + t, d, from);
    if (t === 'welcome' && !this.isHost) { this.connected = true; this.reportLinks(); this.emit('ready'); }
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
    this.send(t, d);
    if (includeSelf) this.receiveLocal(t, d);
  }
  sendTo(peerId, t, d) {
    if (peerId === this.selfId) { this.receiveLocal(t, d); return; }
    this._out({ t, d }, peerId);
  }
  // peer -> all others (no self)
  send(t, d) {
    // Gameplay travels through the host: clients never need a client-to-client ICE link.
    if (!this.isHost && this.relayTypes.has(t)) {
      if (this.hostId && this.connected) this._out({ t, d }, this.hostId);
      return;
    }
    this._out({ t, d });
  }

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
    // Wire-only feature views keep private host state out of remote packets.
    // Local broadcast handlers still receive their original authoritative data.
    if (typeof this.outboundView === 'function') {
      const view = this.outboundView(m.t, m.d);
      if (view !== m.d) m = { ...m, d: view };
    }
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
    const tr = this.transport;
    const sizes = new Map();
    const sizeOf = (m) => { let n = sizes.get(m); if (n === undefined) { try { n = new TextEncoder().encode(JSON.stringify(m)).byteLength; } catch { n = 0; } sizes.set(m, n); } return n; };
    // split a per-peer message list into packets of <= PACKET_CAP (one oversized message goes alone)
    const packs = (list) => {
      if (list.length === 1) return [list[0]];
      const out = []; let cur = [], n = 0;
      for (const m of list) {
        const z = sizeOf(m);
        if (cur.length && n + z > NET.PACKET_CAP) { out.push(cur.length === 1 ? cur[0] : { t: '_b', d: cur }); cur = []; n = 0; }
        cur.push(m); n += z;
      }
      if (cur.length) out.push(cur.length === 1 ? cur[0] : { t: '_b', d: cur });
      if (out.length > 1) this.stats.splits++;
      return out;
    };
    const put = (m, to) => {
      this.stats.packetsOut++;
      if (this.measureBytes) this.stats.bytesOut += sizeOf(m) * (to ? 1 : Math.max(1, tr.peers.size));
      tr.send(m, to || undefined);
    };
    const peers = [...tr.peers];
    // per-peer lists (broadcasts go to everyone, directed ones to their peer); a backed-up peer is not fed latest-wins state
    const per = new Map();
    for (const e of q) {
      const targets = e.to ? [e.to] : peers;
      for (const p of targets) {
        if (!tr.peers.has(p)) { this.stats.dropped++; continue; }          // lost / gone: nothing to send to
        if (DROPPABLE.has(e.m.t === 'relay' ? e.m.d?.m?.t : e.m.t) && tr.congested?.(p)) { this.stats.dropped++; continue; }
        let a = per.get(p); if (!a) per.set(p, a = []); a.push(e.m);
      }
    }
    for (const [p, list] of per) {
      const compacted = [];
      const latestState = new Map();
      const expandRows = (m) => {
        const relay = m.t === 'relay' ? m.d : null;
        const inner = relay?.m;
        const t = inner?.t || m.t;
        const rows = inner?.d ?? m.d;
        if (!DROPPABLE.has(t) || !['cs', 'is', 'sgs'].includes(t) || !Array.isArray(rows) || rows.length < 2) return [m];
        const build = (part) => inner ? { ...m, d: { ...relay, m: { ...inner, d: part } } } : { ...m, d: part };
        const chunks = [];
        let part = [];
        for (const row of rows) {
          const candidate = [...part, row];
          if (part.length && sizeOf(build(candidate)) > NET.PACKET_CAP) { chunks.push(part); part = [row]; }
          else part = candidate;
        }
        if (part.length) chunks.push(part);
        return chunks.map(build);
      };
      for (const original of list) {
        const expanded = expandRows(original);
        for (let ci = 0; ci < expanded.length; ci++) {
          const m = expanded[ci];
          const t = m.t === 'relay' ? m.d?.m?.t : m.t;
          if (!DROPPABLE.has(t)) { compacted.push(m); continue; }
          // A player's pose is latest-wins per originating player; delta-row snapshots are
          // latest-wins per stream and heal themselves on the next keyframe.
          const owner = m.t === 'relay' ? m.d?.from : '';
          const lane = t + ':' + String(owner || '');
          const key = lane + (expanded.length > 1 ? ':' + ci : '');
          if (latestState.has(key)) compacted[latestState.get(key)] = m;
          else { latestState.set(key, compacted.length); compacted.push(m); }
        }
      }
      // Keep event order. Check congestion before each packet, not once for the whole frame:
      // Trystero waits at 64 KiB and gives up on a chunk after 10 s. Four 12-KiB packets
      // leave room for framing while reliable events remain ordered and continue draining.
      let cur = [], bytes = 0;
      const flushCur = () => { if (cur.length) { for (const pk of packs(cur)) put(pk, p); cur = []; bytes = 0; } };
      for (const m of compacted) {
        const z = sizeOf(m);
        if (cur.length && bytes + z > NET.PACKET_CAP) { this.stats.splits++; flushCur(); }
        const t = m.t === 'relay' ? m.d?.m?.t : m.t;
        if (DROPPABLE.has(t) && tr.congested?.(p)) { this.stats.dropped++; continue; }
        cur.push(m); bytes += z;
      }
      flushCur();
    }
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
  leave() {
    this.leaving = true;
    clearTimeout(this._linksT);
    try { this.flush(); this.transport.send({ t: 'bye' }); } catch { /* ignore */ }
    clearInterval(this._watch); this._watch = null;
    for (const L of this.lost.values()) clearTimeout(L.timer);
    this.lost.clear();
    if (typeof window !== 'undefined' && this._onUnload) { window.removeEventListener('pagehide', this._onUnload, true); }
    this.transport.leave(); this.clear();
  }
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
