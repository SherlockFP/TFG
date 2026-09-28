// Transports: Trystero (serverless WebRTC; Nostr / MQTT / BitTorrent signaling) and a
// BroadcastChannel transport for same-machine multi-tab testing ("local").
import { randomId } from '../core/rng.js';

export const APP_ID = 'kefal-company-v1';

class BaseTransport {
  constructor() {
    this.onPeerJoin = null; this.onPeerLeave = null; this.onMessage = null; this.onBinary = null; this.onStream = null;
    this.onError = null;
    this.peers = new Set();
  }
}

export class TrysteroTransport extends BaseTransport {
  constructor(strategy = 'nostr') { super(); this.strategy = strategy; this.room = null; }
  async load() {
    if (this.mod) return this.mod;
    if (this.strategy === 'mqtt') this.mod = await import('@trystero-p2p/mqtt');
    else if (this.strategy === 'torrent') this.mod = await import('@trystero-p2p/torrent');
    else this.mod = await import('trystero');
    return this.mod;
  }
  async join(roomId, password) {
    const mod = await this.load();
    this.selfId = mod.selfId;
    const cfg = { appId: APP_ID };
    if (password) cfg.password = password;
    cfg.relayConfig = { warnOnRelayFailure: false };
    this.room = mod.joinRoom(cfg, roomId, {
      onJoinError: (d) => { console.warn('join error', d); this.onError?.(d); },
    });
    const msg = this.room.makeAction('m');
    const bin = this.room.makeAction('b');
    this._msg = msg; this._bin = bin;
    msg.onMessage = (data, meta) => this.onMessage?.(data, meta?.peerId ?? meta);
    // Trystero delivers binary payloads as Uint8Array views; the voice-clip decoder wants a standalone ArrayBuffer
    bin.onMessage = (data, meta) => {
      const ab = data instanceof ArrayBuffer ? data : ArrayBuffer.isView(data) ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
      this.onBinary?.(ab, meta?.peerId ?? meta, meta?.metadata);
    };
    this.room.onPeerJoin = (id) => { this.peers.add(id); this.onPeerJoin?.(id); if (this.stream) this.room.addStream(this.stream, { target: id }); };
    this.room.onPeerLeave = (id) => { this.peers.delete(id); this.onPeerLeave?.(id); };
    this.room.onPeerStream = (stream, id) => this.onStream?.(stream, id);
    return this;
  }
  send(data, to) {
    if (!this._msg) return;
    try { this._msg.send(data, to ? { target: to } : undefined); } catch (e) { /* peer gone */ }
  }
  sendBinary(buf, meta, to) {
    if (!this._bin) return;
    try { this._bin.send(buf, { target: to || undefined, metadata: meta }); } catch { /* ignore */ }
  }
  addStream(stream) { this.stream = stream; try { this.room?.addStream(stream); } catch (e) { console.warn(e); } }
  removeStream(stream) { try { this.room?.removeStream(stream); } catch { /* ignore */ } this.stream = null; }
  async ping(id) { try { return await this.room.ping(id); } catch { return -1; } }
  leave() { try { this.room?.leave(); } catch { /* ignore */ } this.room = null; this.peers.clear(); }
}

// Same-browser transport (multiple tabs). Peers discover each other via hello/heartbeat.
export class LocalTransport extends BaseTransport {
  constructor() { super(); this.selfId = 'L' + randomId(9); this.ch = null; this.last = new Map(); }
  async join(roomId) {
    this.ch = new BroadcastChannel('kefal:' + roomId);
    this.ch.onmessage = (ev) => {
      const m = ev.data;
      if (!m || m.from === this.selfId) return;
      if (m.to && m.to !== this.selfId && !(Array.isArray(m.to) && m.to.includes(this.selfId))) return;
      if (!this.peers.has(m.from) && m.t !== 'bye') {
        this.peers.add(m.from);
        this.onPeerJoin?.(m.from);
        if (m.t === 'hello') this.ch.postMessage({ t: 'here', from: this.selfId, to: m.from });
      }
      this.last.set(m.from, performance.now());
      if (m.t === 'bye') { if (this.peers.delete(m.from)) this.onPeerLeave?.(m.from); return; }
      if (m.t === 'msg') this.onMessage?.(m.d, m.from);
      if (m.t === 'bin') this.onBinary?.(m.d, m.from, m.meta);
    };
    this.ch.postMessage({ t: 'hello', from: this.selfId });
    let prevBeat = performance.now();
    this.hb = setInterval(() => {
      this.ch?.postMessage({ t: 'hb', from: this.selfId });
      const now = performance.now();
      // This tab was blocked (a moon loading / world gen) or throttled (hidden tab): the heartbeats that arrived meanwhile are still
      // queued behind this timer task, so `last` is stale through no fault of the peer. Give everybody a fresh window instead of
      // evicting the host ("The host has left. Session ended.").
      const stalled = now - prevBeat > 2500;
      prevBeat = now;
      if (stalled) { for (const id of this.peers) this.last.set(id, now); return; }
      // 15 s: the peer's OWN tab can be busy for many seconds while it builds a moon (a real leave sends 'bye' immediately)
      for (const id of [...this.peers]) if (now - (this.last.get(id) || 0) > 15000) { this.peers.delete(id); this.onPeerLeave?.(id); }
    }, 1000);
    this._unload = () => this.leave();
    window.addEventListener('beforeunload', this._unload);
    return this;
  }
  send(data, to) { this.ch?.postMessage({ t: 'msg', from: this.selfId, to: to || null, d: data }); }
  sendBinary(buf, meta, to) { this.ch?.postMessage({ t: 'bin', from: this.selfId, to: to || null, d: buf, meta }); }
  addStream() { /* no media over BroadcastChannel */ }
  removeStream() {}
  async ping() { return 1; }
  leave() {
    if (!this.ch) return;
    try { this.ch.postMessage({ t: 'bye', from: this.selfId }); } catch { /* ignore */ }
    clearInterval(this.hb);
    this.ch.close(); this.ch = null;
    this.peers.clear();
    window.removeEventListener('beforeunload', this._unload);
  }
}

export function makeTransport(strategy) {
  if (strategy === 'local') return new LocalTransport();
  return new TrysteroTransport(strategy);
}
