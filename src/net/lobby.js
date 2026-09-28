// Lobby discovery without a server: everyone who opens the lobby browser (and every public host)
// joins a shared discovery room; hosts announce their lobby info periodically.
import { makeTransport } from './transport.js';

export const GAME_VERSION = '0.10.0';   // 0.10: batched packets ('_b') + delta rows - older clients are rejected cleanly
const DISCOVERY_ROOM = 'kefal-lobbies-v1';

export class LobbyDirectory {
  constructor(strategy) {
    this.strategy = strategy;
    this.transport = null;
    this.lobbies = new Map();   // code -> { info, peerId, seen }
    this.onChange = null;
    this.announceInfo = null;
    this.timer = null;
    this.status = 'idle';
  }
  async start() {
    if (this.transport) return;
    this.status = 'connecting';
    this.transport = makeTransport(this.strategy);
    this.transport.onMessage = (m, from) => {
      if (!m || m.t !== 'lobby' || !m.d?.code) return;
      if (m.d.version !== GAME_VERSION) m.d.incompatible = true;
      this.lobbies.set(m.d.code, { info: m.d, peerId: from, seen: performance.now() });
      this.onChange?.();
    };
    this.transport.onPeerJoin = (id) => {
      this.status = 'online';
      if (this.announceInfo) this.transport.send({ t: 'lobby', d: this.announceInfo }, id);
      this.onChange?.();
    };
    this.transport.onPeerLeave = (id) => {
      for (const [code, l] of this.lobbies) if (l.peerId === id) this.lobbies.delete(code);
      this.onChange?.();
    };
    try {
      await this.transport.join(DISCOVERY_ROOM);
      this.status = 'online';
    } catch (e) {
      console.warn('discovery failed', e);
      this.status = 'error';
    }
    this.timer = setInterval(() => {
      if (this.announceInfo) this.transport?.send({ t: 'lobby', d: this.announceInfo });
      const now = performance.now();
      let changed = false;
      for (const [code, l] of this.lobbies) if (now - l.seen > 7500) { this.lobbies.delete(code); changed = true; }
      if (changed) this.onChange?.();
    }, 2000);
  }
  announce(info) {
    this.announceInfo = info ? { ...info, version: GAME_VERSION } : null;
    if (this.announceInfo) this.transport?.send({ t: 'lobby', d: this.announceInfo });
  }
  list() {
    return [...this.lobbies.values()].map((l) => l.info).sort((a, b) => (b.players || 0) - (a.players || 0));
  }
  stop() {
    clearInterval(this.timer); this.timer = null;
    this.transport?.leave(); this.transport = null;
    this.lobbies.clear();
    this.status = 'idle';
  }
}
