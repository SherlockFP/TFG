// SOCIAL HUB service (wave 4, module 'social'; docs/wave4/social.md). A separate serverless Trystero room ('tfg-hub-v1', same app id as
// the game) that everybody in the main menu (or in a run, when Settings > Gameplay > "Stay in the hub during a run" is on) can join:
// tiny presence beacons every 10 s, a player / public-lobby list, friends, lobby invites and direct messages.
// It lives on the App (app.hub), NOT on Game: the hub works in the menu where no game exists. Every failure is swallowed - the hub is optional.
// Wire (all prefixed 'so'): sop {id,n,av,st,v,lv,lb?}  sobye {}  sodm {x,id,n}  soinv {c,ln,k,s,id,n}.
import { Emitter } from '../core/events.js';
import { t } from '../core/i18n.js';
import { saveProfile } from '../core/save.js';
import { liteOf } from '../ui/avatarpic.js';
import { makeTransport } from './transport.js';
import { GAME_VERSION } from './lobby.js';
import {
  HUB, HUB_ROOM, PresenceTable, zoneRank, RateLimiter, cleanText, validateDm, validateInvite,
  addFriend, removeFriend, isFriend, sanitizeFriends, sanitizeBlocked, pushHistory, sanitizeHistory,
} from './hub_core.js';

const LS_KEY = 'tfg.social.dm.v1';
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const wall = () => Date.now();

export class HubService extends Emitter {
  constructor(app) {
    super();
    this.app = app;
    this.transport = null;
    this.status = 'idle';          // idle | connecting | online | error
    this.presence = new PresenceTable();
    this.ctx = 'menu';             // 'menu' | 'run'
    this.game = null;
    this.timer = null;
    this.lastBeacon = 0;
    this._soon = null;
    this._retry = null;
    this.retries = 0;
    this._strategy = null;
    this.outDm = new RateLimiter(HUB.DM_OUT[0], HUB.DM_OUT[1]);
    this.outInv = new RateLimiter(HUB.INV_OUT[0], HUB.INV_OUT[1]);
    this.inDm = new RateLimiter(HUB.DM_IN[0], HUB.DM_IN[1]);
    this.inInv = new RateLimiter(HUB.INV_IN[0], HUB.INV_IN[1]);
    this.conv = new Map();         // stable id -> [{ d, x, t }]  (memory; friends are mirrored to localStorage)
    this.unread = new Map();       // stable id -> n
    this.lastFrom = null;          // stable id of the last DM sender (for /r)
    this.pendingInvite = null;     // last invite that has not been answered ({ peerId, id, n, code, ... })
    this.stats = { sent: 0, recv: 0, dropped: 0 };
    this.actions = new Map();      // extra per-player buttons other modules register (see registerAction)
    this._saveT = null;
    this._loadHistory();
  }

  // ---------------------------------------------------------------- settings (all optional, defaults = on)
  get s() { return this.app.settings || {}; }
  get profile() { return this.app.profile; }
  get enabled() { return this.s.hubEnabled !== false; }
  get inRunAllowed() { return this.s.hubInRun !== false; }
  get dmPolicy() { return ['all', 'friends', 'off'].includes(this.s.hubDm) ? this.s.hubDm : 'all'; }
  get shareLobby() { return this.s.hubShareLobby !== false; }
  wantRunning() { return this.enabled && (this.ctx === 'menu' || this.inRunAllowed); }
  get connected() { return !!this.transport && this.status === 'online'; }

  /** Called by main.js / game module: 'menu' when no game exists, 'run' while a session is open. */
  setContext(ctx, game = null) {
    this.ctx = ctx; this.game = ctx === 'run' ? game : null;
    this.sync();
  }
  /** Start / stop / restart according to the settings; safe to call at any time. */
  sync() {
    try {
      const strat = this.s.netStrategy || 'nostr';
      if (this.transport && (!this.wantRunning() || strat !== this._strategy)) this.stop();
      if (!this.transport && this.wantRunning()) this.start(strat);
      else if (this.transport) this.beaconSoon();
    } catch (e) { console.warn('[hub] sync', e); }
  }

  // ---------------------------------------------------------------- connection
  async start(strategy) {
    if (this.transport) return;
    this._strategy = strategy || this.s.netStrategy || 'nostr';
    this.status = 'connecting';
    this.emit('change');
    let tr = null;
    try {
      tr = makeTransport(this._strategy);
      this.transport = tr;
      tr.onMessage = (m, from) => { if (this.transport === tr) this._onMsg(m, from); };
      tr.onPeerJoin = (id) => { if (this.transport !== tr) return; this.status = 'online'; this._sendBeacon(id); this.emit('change'); };
      tr.onPeerLeave = (id) => { if (this.transport !== tr) return; if (this.presence.remove(id)) this.emit('change'); };
      tr.onError = () => { /* signalling hiccups are normal (relay down); the hub just stays quiet */ };
      await tr.join(HUB_ROOM);
      if (this.transport !== tr) { try { tr.leave(); } catch { /* ignore */ } return; }
      this.status = 'online';
      this.retries = 0;
      this.lastBeacon = 0;
      clearInterval(this.timer);
      this.timer = setInterval(() => this._tick(), 2500);
      this._tick();
    } catch (e) {
      console.warn('[hub] join failed', e);
      if (this.transport === tr) { this.transport = null; this.status = 'error'; try { tr?.leave(); } catch { /* ignore */ } }
      // a few slow retries, never a loop: the game must not care
      if (this.retries < 3 && this.wantRunning()) { this.retries++; clearTimeout(this._retry); this._retry = setTimeout(() => { this._retry = null; if (!this.transport && this.wantRunning()) this.start(); }, 45000 * this.retries); }
    }
    this.emit('change');
  }
  stop() {
    clearInterval(this.timer); this.timer = null;
    clearTimeout(this._soon); this._soon = null;
    clearTimeout(this._retry); this._retry = null;
    const tr = this.transport;
    this.transport = null;
    if (tr) { try { tr.send({ t: 'sobye', d: {} }); } catch { /* ignore */ } try { tr.leave(); } catch { /* ignore */ } }
    this.presence = new PresenceTable();
    this.status = 'idle';
    this.emit('change');
  }
  dispose() { this.stop(); this._flushSave(); this.clear(); }

  _tick() {
    if (!this.transport) return;
    const now = nowMs();
    if (now - this.lastBeacon >= HUB.BEACON_MS - 200) this._sendBeacon();
    if (this.presence.prune(now).length) this.emit('change');
  }
  beaconSoon() {
    if (!this.transport || this._soon) return;
    this._soon = setTimeout(() => { this._soon = null; this._sendBeacon(); }, 900);
  }

  /** What leaves this machine (documented in docs/wave4/social.md). ~0.4 KB. */
  beaconData() {
    const p = this.profile, g = this.game;
    let st = 'menu';
    if (this.ctx === 'run' && g) st = g.run?.phase === 'orbit' || g.run?.phase === 'company' || !g.run ? 'lobby' : 'run';
    const d = { id: p.id, n: p.name, av: liteOf(p), st, v: GAME_VERSION, lv: p.level | 0 };
    const zs = this.ctx === 'run' && g?.isHost ? this.zoneStats() : null;
    if (zs) d.zs = zs;
    // a public lobby is only advertised by its host, only while announcing to the lobby browser, and only if the player allows it
    const info = this.ctx === 'run' && g?.isHost ? this.app.lobbyDir?.announceInfo : null;
    if (info && this.shareLobby && g.opts?.isPublic) {
      d.lb = { c: info.code, n: info.name, p: info.players | 0, m: info.max | 0, k: info.locked ? 1 : 0, s: this.app.lobbyDir?.strategy || this._strategy };
    }
    return d;
  }
  /** [links] this crew's zone stats [owned, income/day, defences held] (host only), or null */
  zoneStats() {
    try {
      const sn = this.game?.zones?.snapshot?.();
      if (!sn) return null;
      const z = [sn.owned | 0, sn.income?.credits | 0, sn.stat?.held | 0];
      return z[0] || z[2] ? z : null;
    } catch { return null; }
  }
  /** [links] leaderboard rows: everyone online with zone stats plus this crew */
  zoneBoard() {
    const rows = this.online().filter((e) => e.zs);
    const mine = this.ctx === 'run' && this.game?.isHost ? this.zoneStats() : null;
    if (mine) rows.push({ id: this.profile.id, n: this.profile.name, zs: mine, me: true });
    return zoneRank(rows);
  }
  _sendBeacon(to) {
    if (!this.transport) return;
    try {
      this.transport.send({ t: 'sop', d: this.beaconData() }, to);
      if (!to) this.lastBeacon = nowMs();
    } catch (e) { /* peer gone */ }
  }

  // ---------------------------------------------------------------- receiving
  _onMsg(m, from) {
    if (!m || typeof m !== 'object' || typeof m.t !== 'string' || typeof from !== 'string') return;
    const now = nowMs();
    switch (m.t) {
      case 'sop': {
        const r = this.presence.upsert(from, m.d, now);
        if (r === 'new' || r === 'update') { this.emit('change'); if (r === 'new') this._sendBeacon(from); }
        break;
      }
      case 'sobye': if (this.presence.remove(from)) this.emit('change'); break;
      case 'sodm': this._onDm(m.d, from, now); break;
      case 'soinv': this._onInvite(m.d, from, now); break;
      default: if (m.t.startsWith('so') && m.t.length <= 12 && this.presence.get(from)) this.emit('msg', m, from); break;   // extension: other modules' own 'so*' types
    }
  }
  _who(from, d) {   // stable id + nick of a sender: what its beacon said wins over what the message claims
    const e = this.presence.get(from);
    return { id: e?.id || d.id || '', n: e?.n || d.n || '' };
  }
  _allowedFrom(id) {
    if (this.dmPolicy === 'off') return false;
    if (id && this.blocked.includes(id)) return false;
    if (this.dmPolicy === 'friends' && !isFriend(this.friends, id)) return false;
    return true;
  }
  _onDm(d, from, now) {
    const v = validateDm(d);
    if (!v) { this.stats.dropped++; return; }
    if (!this.inDm.allow(from, now)) { this.stats.dropped++; return; }
    const w = this._who(from, v);
    if (!w.id || !w.n || !this._allowedFrom(w.id)) { this.stats.dropped++; return; }
    this.stats.recv++;
    this._record(w.id, w.n, { d: 'in', x: v.text, t: wall() });
    this.unread.set(w.id, (this.unread.get(w.id) || 0) + 1);
    this.lastFrom = w.id;
    this.emit('dm', { peerId: from, id: w.id, n: w.n, text: v.text, friend: isFriend(this.friends, w.id) });
    this.emit('change');
  }
  _onInvite(d, from, now) {
    const v = validateInvite(d);
    if (!v) { this.stats.dropped++; return; }
    if (!this.inInv.allow(from, now)) { this.stats.dropped++; return; }
    const w = this._who(from, v);
    if (!w.id || !w.n || !this._allowedFrom(w.id)) { this.stats.dropped++; return; }
    // never yank someone out of the lobby they already are in
    if (this.ctx === 'run' && this.game?.net?.code === v.code) return;
    this.stats.recv++;
    const inv = { peerId: from, id: w.id, n: w.n, code: v.code, name: v.name, lock: v.lock, strat: v.strat, at: wall(), friend: isFriend(this.friends, w.id) };
    this.pendingInvite = inv;
    this.emit('invite', inv);
  }

  // ---------------------------------------------------------------- extension point for other modules (e.g. arcade: 'Rock-paper-scissors with a friend')
  /** Add a button to the hub player card: def = { id, label (English, run through t()), enabled?(entry) -> bool, run(entry, app) }.
   *  `entry` = the online player { id, n, peerId, st, lv, friend, ... }. Also announced as mods event 'socialAction'(list, entry, app) when the card is drawn.
   *  Returns an unregister function. Actions can use hub.transport / hub.sendDm themselves; a game session is `app.game`. */
  registerAction(def) {
    if (!def || typeof def.id !== 'string' || typeof def.run !== 'function') return () => {};
    this.actions.set(def.id, def);
    return () => { if (this.actions.get(def.id) === def) this.actions.delete(def.id); };
  }
  /** actions to show for an online player (registered + collected through the mods event) */
  actionsFor(entry) {
    const list = [...this.actions.values()];
    try { this.app.mods?.emit('socialAction', list, entry, this.app); } catch { /* mods are optional */ }
    return list.filter((a) => { try { return !a.enabled || a.enabled(entry); } catch { return false; } });
  }

  // ---------------------------------------------------------------- lists
  get friends() { const p = this.profile; if (!Array.isArray(p.friends) || p._friendsClean !== p.friends) { p.friends = sanitizeFriends(p.friends); p._friendsClean = p.friends; } return p.friends; }
  get blocked() { const p = this.profile; if (!Array.isArray(p.socialBlocked)) p.socialBlocked = sanitizeBlocked(p.socialBlocked); return p.socialBlocked; }
  /** everybody currently visible (blocked hidden), with a friend flag; self excluded by peer id (the transport never echoes) */
  online() {
    const now = nowMs();
    return this.presence.list(now).filter((e) => !this.blocked.includes(e.id)).map((e) => ({ ...e, friend: isFriend(this.friends, e.id), compat: e.v === GAME_VERSION }));
  }
  lobbies() { return this.online().filter((e) => e.lb); }
  /** the friends list merged with presence: [{ id, nick, online, entry }] */
  friendRows() {
    const on = this.online();
    return this.friends.map((f) => { const entry = on.find((e) => e.id === f.id) || null; return { id: f.id, nick: entry?.n || f.nick, online: !!entry, entry, unread: this.unread.get(f.id) || 0 }; })
      .sort((a, b) => (b.online - a.online) || a.nick.localeCompare(b.nick));
  }
  peerForId(id) { const e = this.online().find((x) => x.id === id); return e ? e.peerId : null; }
  totalUnread() { let n = 0; for (const v of this.unread.values()) n += v; return n; }

  // ---------------------------------------------------------------- friends / blocks
  addFriend(id, nick) {
    const r = addFriend(this.profile.friends, id, nick);
    if (r.ok) { this.profile.friends = r.list; this.profile._friendsClean = r.list; try { saveProfile(this.profile); } catch { /* ignore */ } this.emit('change'); }
    return r;
  }
  removeFriend(id) {
    this.profile.friends = removeFriend(this.profile.friends, id); this.profile._friendsClean = this.profile.friends;
    this.conv.delete(id); this.unread.delete(id);
    try { saveProfile(this.profile); } catch { /* ignore */ }
    this._saveHistory();
    this.emit('change');
  }
  block(id) {
    if (!id || this.blocked.includes(id)) return;
    this.profile.socialBlocked = sanitizeBlocked([...this.blocked, id]);
    this.removeFriend(id);
  }
  unblock(id) { this.profile.socialBlocked = this.blocked.filter((x) => x !== id); try { saveProfile(this.profile); } catch { /* ignore */ } this.emit('change'); }

  // ---------------------------------------------------------------- sending
  /** @returns {{ok:boolean, reason?:string, wait?:number}}  reasons: off | empty | gone | rate */
  sendDm(id, text) {
    if (!this.connected) return { ok: false, reason: 'off' };
    const x = cleanText(String(text ?? ''), HUB.DM_MAX);
    if (!x) return { ok: false, reason: 'empty' };
    const peerId = this.peerForId(id);
    if (!peerId) return { ok: false, reason: 'gone' };
    const now = nowMs();
    if (!this.outDm.allow('out', now)) return { ok: false, reason: 'rate', wait: this.outDm.wait('out', now) };
    try { this.transport.send({ t: 'sodm', d: { x, id: this.profile.id, n: this.profile.name } }, peerId); } catch { return { ok: false, reason: 'gone' }; }
    this.stats.sent++;
    const e = this.presence.get(peerId);
    this._record(id, e?.n || '?', { d: 'out', x, t: wall() });
    this.emit('change');
    return { ok: true };
  }
  /** Invite a peer to the lobby you are in (needs a running session). Never sends the password. */
  invite(id) {
    if (!this.connected) return { ok: false, reason: 'off' };
    const g = this.game;
    const code = g?.net?.code;
    if (this.ctx !== 'run' || !code) return { ok: false, reason: 'nolobby' };
    const peerId = this.peerForId(id);
    if (!peerId) return { ok: false, reason: 'gone' };
    const now = nowMs();
    if (!this.outInv.allow('out', now)) return { ok: false, reason: 'rate', wait: this.outInv.wait('out', now) };
    const ln = g.opts?.lobbyName || (this.profile.name + "'s crew");
    try { this.transport.send({ t: 'soinv', d: { c: code, ln: cleanText(String(ln), HUB.LOBBY_NAME_MAX), k: g.opts?.password ? 1 : 0, s: g.net.strategy || this._strategy, id: this.profile.id, n: this.profile.name } }, peerId); } catch { return { ok: false, reason: 'gone' }; }
    this.stats.sent++;
    return { ok: true };
  }
  /** Join the lobby of an invite / beacon through the normal join flow (password is asked by ui.joinLobby). */
  async joinLobby({ code, lock, name, strat }) {
    const ui = this.app.ui;
    if (this.app.game) {
      const ok = await ui.confirmBox?.(t('Leave current lobby?'), t('Leave your current crew and join the invited lobby?'), t('Join'));
      if (!ok) return false;
      this.app.leaveGame();
    }
    await ui.joinLobby?.({ code, locked: !!lock, name, mods: [] }, strat || this.s.netStrategy || 'nostr');
    return true;
  }
  clearInvite(inv) { if (this.pendingInvite === inv || !inv) this.pendingInvite = null; }

  // ---------------------------------------------------------------- history (memory + last 50 per friend in localStorage)
  history(id) { return this.conv.get(id) || []; }
  markRead(id) { if (this.unread.delete(id)) this.emit('change'); }
  _record(id, nick, entry) {
    const h = pushHistory(this.conv.get(id), entry, HUB.MEM_HISTORY_MAX);
    this.conv.set(id, h);
    if (this.conv.size > 60) this.conv.delete(this.conv.keys().next().value);
    if (isFriend(this.friends, id)) this._saveHistory();
  }
  _loadHistory() {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
      if (!raw) return;
      const obj = sanitizeHistory(JSON.parse(raw), this.friends);
      for (const [id, arr] of Object.entries(obj)) this.conv.set(id, arr);
    } catch { /* corrupt / blocked storage: start empty */ }
  }
  _saveHistory() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this._flushSave(), 600);
  }
  _flushSave() {
    clearTimeout(this._saveT); this._saveT = null;
    try {
      if (typeof localStorage === 'undefined') return;
      const out = {};
      for (const f of this.friends) { const h = this.conv.get(f.id); if (h?.length) out[f.id] = h.slice(-HUB.HISTORY_MAX); }
      localStorage.setItem(LS_KEY, JSON.stringify(out));
    } catch { /* quota / private mode */ }
  }
}

export function installHub(app) {
  try {
    const hub = new HubService(app);
    app.hub = hub;
    hub.sync();
    window.addEventListener('beforeunload', () => { try { hub.stop(); hub._flushSave(); } catch { /* ignore */ } });
    return hub;
  } catch (e) { console.warn('[hub] install', e); return null; }
}
