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
  congested() { return false; }   // backpressure probe: Session drops state rows for a peer whose sends pile up
}

// Optional TURN relay (symmetric NATs / mobile carriers can never connect with STUN only, and links that die after a
// NAT rebind cannot be re-established). Configure with VITE_TURN_URL(+_USER/_CRED) at build time, or in the browser:
// localStorage['tfg.turn'] = '{"urls":"turn:host:3478","username":"u","credential":"c"}'.
function turnServers() {
  const out = [];
  try {
    const env = import.meta.env || {};
    if (env.VITE_TURN_URL) out.push({ urls: env.VITE_TURN_URL.split(','), username: env.VITE_TURN_USER || '', credential: env.VITE_TURN_CRED || '' });
  } catch { /* not vite */ }
  try {
    const j = typeof localStorage !== 'undefined' && localStorage.getItem('tfg.turn');
    if (j) { const v = JSON.parse(j); for (const x of Array.isArray(v) ? v : [v]) if (x && x.urls) out.push(x); }
  } catch { /* bad json */ }
  return out;
}
// Keep the WebRTC data channel under Trystero's 64 KiB bufferedAmount low-water threshold.
// Session packets are capped at 12 KiB, so four concurrent packets stay below that limit.
export const CONGEST_AT = 4;

export class TrysteroTransport extends BaseTransport {
  constructor(strategy = 'nostr') { super(); this.strategy = strategy; this.room = null; this.inflight = new Map(); this.rejoins = 0; }
  async load() {
    if (this.mod) return this.mod;
    if (this.strategy === 'mqtt') this.mod = await import('@trystero-p2p/mqtt');
    else if (this.strategy === 'torrent') this.mod = await import('@trystero-p2p/torrent');
    else this.mod = await import('trystero');
    return this.mod;
  }
  async join(roomId, password) {
    const generation = this._generation = (this._generation || 0) + 1;
    const mod = await this.load();
    if (this._generation !== generation) return this;   // left while the strategy module was loading
    this.selfId = mod.selfId;
    this._joinArgs = [roomId, password];
    const cfg = { appId: APP_ID };
    if (password) cfg.password = password;
    // Keep the appId and strategy stable, but avoid depending on just five default relays.
    // Discovery and game rooms use this same config so every player announces in the same places.
    cfg.relayConfig = { warnOnRelayFailure: false, ...(this.strategy === 'nostr' ? { redundancy: 10 } : {}) };
    const urls = this.strategy === 'nostr' && import.meta.env?.VITE_NOSTR_RELAY_URLS;
    if (urls) cfg.relayConfig.urls = urls.split(',').map(s => s.trim()).filter(Boolean);
    const turn = turnServers();
    if (turn.length) cfg.turnConfig = turn;
    this.hasTurn = turn.length > 0;
    this.room = mod.joinRoom(cfg, roomId, {
      onJoinError: (d) => {
        console.warn('join error', d);
        // Trystero: "could not connect to peer X after exchanging SDP; configure TURN servers ..." = both sides found each
        // other through the relays but no ICE path exists (symmetric NAT / CGNAT / firewall). Tag it so the UI can say so.
        const msg = String(d?.error || d || '');
        if (/after exchanging SDP/i.test(msg)) this.onError?.({ kind: 'nat', peerId: d?.peerId || (msg.match(/peer (\S+)/) || [])[1] || null, error: msg, turn: this.hasTurn });
        else this.onError?.(d);
      },
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
    const room = this.room;
    room.onPeerJoin = (id) => {
      if (this.room !== room) return;
      this.peers.add(id);
      try { this.onPeerJoin?.(id); } catch (e) { console.error('peerJoin', e); }
      if (this.stream) { try { room.addStream(this.stream, { target: id }); } catch (e) { console.warn('addStream', e); } }
    };
    // never let an app-level exception escape into Trystero: its own peer cleanup runs after this callback
    room.onPeerLeave = (id) => {
      if (this.room !== room) return;
      this.peers.delete(id); this.inflight.delete(id);
      try { this.onPeerLeave?.(id); } catch (e) { console.error('peerLeave', e); }
    };
    this.room.onPeerStream = (stream, id) => this.onStream?.(stream, id);
    return this;
  }
  // One send per peer (not one broadcast): every peer gets its own in-flight counter, so a single stalled link is
  // detected (congested(id)) without throttling the healthy ones. The promise MUST be caught: a peer that vanishes
  // mid-send rejects it asynchronously (the old try/catch never saw that -> unhandled rejections).
  send(data, to) {
    if (!this._msg) return;
    const targets = to ? [to] : [...this.peers];
    for (const id of targets) {
      if (!this.peers.has(id)) continue;
      try {
        const p = this._msg.send(data, { target: id });
        this.inflight.set(id, (this.inflight.get(id) || 0) + 1);
        const done = () => { const n = (this.inflight.get(id) || 1) - 1; if (n > 0) this.inflight.set(id, n); else this.inflight.delete(id); };
        if (p && p.then) p.then(done, done); else done();
      } catch (e) { /* peer gone */ }
    }
  }
  congested(id) { return (this.inflight.get(id) || 0) >= CONGEST_AT; }
  // Re-enter the room (same selfId) to force a fresh signalling announce when links died and were not re-discovered.
  async rejoin() {
    if (!this._joinArgs || this._rejoining) return false;
    this._rejoining = true;
    const generation = this._generation;
    try {
      const old = this.room; const stream = this.stream;
      this.room = null; this.inflight.clear();
      const gone = [...this.peers]; this.peers.clear();
      try { await old?.leave(); } catch { /* ignore */ }
      if (this._generation !== generation) return false;
      for (const id of gone) { try { this.onPeerLeave?.(id); } catch (e) { console.error('peerLeave', e); } }
      await this.join(...this._joinArgs);
      if (!this.room) return false;
      this.stream = stream;
      this.rejoins++;
      return true;
    } catch (e) { console.warn('rejoin failed', e); return false; } finally { this._rejoining = false; }
  }
  sendBinary(buf, meta, to) {
    if (!this._bin) return;
    try { const p = this._bin.send(buf, { target: to || undefined, metadata: meta }); p?.catch?.(() => {}); } catch { /* ignore */ }
  }
  addStream(stream) { this.stream = stream; try { this.room?.addStream(stream); } catch (e) { console.warn(e); } }
  removeStream(stream) { try { this.room?.removeStream(stream); } catch { /* ignore */ } this.stream = null; }
  async ping(id) { try { return await this.room.ping(id); } catch { return -1; } }
  // Per-peer WebRTC path: 'host' (same LAN), 'srflx' (direct through NAT via STUN) or 'relay' (TURN). For NETSTATS / bug reports.
  async linkInfo() {
    const out = {};
    let pcs = {};
    try { pcs = this.room?.getPeers?.() || {}; } catch { /* ignore */ }
    for (const [id, pc] of Object.entries(pcs)) {
      const info = { ice: pc?.iceConnectionState || '?', path: '?' };
      try {
        const st = await pc.getStats();
        const byId = new Map(); let pair = null;
        st.forEach((r) => { byId.set(r.id, r); if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) pair = r; });
        if (pair) { const l = byId.get(pair.localCandidateId)?.candidateType, r = byId.get(pair.remoteCandidateId)?.candidateType; info.path = `${l}->${r}`; if (pair.currentRoundTripTime != null) info.rtt = Math.round(pair.currentRoundTripTime * 1000); }
      } catch { /* ignore */ }
      out[id] = info;
    }
    return out;
  }
  // Relay sockets currently open (Nostr only): 0 means signalling cannot reach anybody from this network.
  relayStatus() {
    try {
      const socks = this.mod?.getRelaySockets?.() || {};
      const all = Object.values(socks);
      return { open: all.filter((s) => s?.readyState === 1).length, total: all.length };
    } catch { return null; }
  }
  leave() { this._generation = (this._generation || 0) + 1; this._msg = null; this._bin = null; try { const p = this.room?.leave(); p?.catch?.(() => {}); } catch { /* ignore */ } this.room = null; this.peers.clear(); this.inflight.clear(); }
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
      if (m.t === 'bye') { if (this.peers.delete(m.from)) this.onPeerLeave?.(m.from, true); return; }
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
    window.addEventListener('pagehide', this._unload);   // pagehide, not beforeunload: the leave-confirm dialog can be cancelled
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
    window.removeEventListener('pagehide', this._unload);
  }
}

export function makeTransport(strategy) {
  if (strategy === 'local') return new LocalTransport();
  return new TrysteroTransport(strategy);
}
