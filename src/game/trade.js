// PLAYER TRADING (wave 2): installed with `this.useModule('trade', installTrade)` in game.js. Design + numbers: docs/wave2/trade.md.
//
// Ask: look at a crewmate within 4 m and press E (prompt "Trade with <name> [E]"), or press N (nearest crewmate), or type
// `/trade <name>` in chat / `TRADE <name>` on the ship terminal. They get a 10 s popup: N accepts, M declines.
// Window: game/../ui/panels/trade.js. Rules + state machine: trade_core.js (pure). Host side: trade_host.js (node-tested).
//
// Net (all types prefixed 'tr', one handler each):
//   client -> host requests  trreq {to}  tracc {tid, ok}  troff {tid, items, clout, q}  trlock {tid, on}  trok {tid}  trcx {tid}  trca {tid, ok}
//                            (every one also carries bx / hs = my extra bag columns + hotbar size, like the 'inv' requests)
//   host -> the two players  trs (state snapshot)  trm (notice: req / sent / open / cancel / done / err)  trc {tid, n} (debit Clout)
//   `trs` / `trm` / `trc` are HOST_ONLY: a client can never fake them.
import { t, tf } from '../core/i18n.js';   // strings: src/i18n/tr_trade.js + ru_trade.js
import { HOST_ONLY } from '../net/session.js';
import { ITEMS } from './items.js';
import { createTradeHost } from './trade_host.js';
import { CANCEL_TEXT, RULES } from './trade_core.js';
import { createTradePanel } from '../ui/panels/trade.js';
import { prewarmIcons, flushIcons, iconState, iconModelSource, iconsPending } from '../ui/icons.js';
import { auditItems } from '../ui/iconatlas.js';
import { escapeHtml } from '../core/util.js';

HOST_ONLY.add('trs'); HOST_ONLY.add('trm'); HOST_ONLY.add('trc');

export const TRADE_KEY = 'KeyN', DECLINE_KEY = 'KeyM', TRADE_REACH = 4;

const CSS = `
.trq { position: fixed; left: 50%; top: 96px; transform: translateX(-50%); z-index: 130; min-width: 330px; padding: 10px 16px 12px; text-align: center; color: #ffd9b8;
  background: repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0 1px, transparent 1px 3px), rgba(10,6,3,0.94); border: 1px solid rgba(255,150,70,0.6); border-top: 3px solid #ffd23f;
  box-shadow: 0 10px 30px rgba(0,0,0,0.75), 0 0 22px rgba(255,210,63,0.18); font-size: 20px; line-height: 1.15; animation: trqIn 0.22s ease-out both; pointer-events: auto; }
.trq .k { font-size: 14px; letter-spacing: 3px; color: #ffd23f; text-transform: uppercase; margin-bottom: 3px; }
.trq b { font-weight: normal; color: #fff3e6; font-size: 24px; }
.trq .bar { height: 5px; margin: 7px 0 8px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,150,70,0.3); }
.trq .bar i { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, #ffd23f, #ff8a3d); }
.trq .row { display: flex; gap: 10px; justify-content: center; }
.trq button { font: inherit; font-size: 19px; color: #ffd9b8; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,190,140,0.5); padding: 1px 12px; cursor: pointer; }
.trq button:hover { background: rgba(255,190,140,0.18); color: #fff; }
.trq kbd { font-family: inherit; font-size: 15px; border: 1px solid rgba(255,190,140,0.6); border-bottom-width: 2px; border-radius: 3px; padding: 0 5px; margin-right: 4px; }
@keyframes trqIn { from { opacity: 0; transform: translate(-50%, -14px); } to { opacity: 1; transform: translate(-50%, 0); } }
`;
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById('tfg-trade-style')) return;
  const s = document.createElement('style'); s.id = 'tfg-trade-style'; s.textContent = CSS; document.head.appendChild(s);
}

export function installTrade(game) {
  ensureStyle();
  const mods = game.mods;
  const offs = [];
  let disposed = false, prewarmT = 0;
  const S = { snap: null, recvAt: 0, mine: { items: [], clout: 0 }, dirty: false, q: 0, sentAt: 0, incoming: null, outgoing: null, panel: null, popup: null, closing: false, lastDone: null, names: {} };
  const host = createTradeHost(game);
  const net = () => game.net;
  const me = () => game.selfId;
  const nameOf = (id) => {   // remembered: a player who just left is no longer in game.remotes
    if (!id) return t('Employee');
    const n = game.playerName(id);
    if (n && n !== 'Employee') { S.names[id] = n; return n; }
    return S.names[id] || n;
  };
  const toast = (m, kind = 'info') => game.ui?.toast?.(m, kind);
  const meta = () => ({ bx: game.inventory?.extraCols?.() ?? 0, hs: game.inventory?.hotCap?.() ?? game.config?.inventorySlots ?? 4 });
  const req = (a, d = {}) => net()?.request(a, { ...meta(), ...d });
  const balance = () => Math.max(0, Math.floor(game.profile?.coins || 0));
  const peerOf = (s = S.snap) => (s ? (s.a === me() ? s.b : s.a) : null);

  // ------------------------------------------------------------------ finding crewmates
  function nearestCrew(maxD = TRADE_REACH) {
    const p = game.player;
    if (!p) return null;
    const fwd = p.forward?.();
    let best = null, bs = 1e9;
    for (const r of game.remotes.values()) {
      if (r.dead) continue;
      const d = r.pos.distanceTo(p.pos);
      if (d > maxD) continue;
      let dot = 0;
      if (fwd) { const dx = r.pos.x - p.pos.x, dz = r.pos.z - p.pos.z, l = Math.hypot(dx, dz) || 1; dot = (dx * fwd.x + dz * fwd.z) / (l * (Math.hypot(fwd.x, fwd.z) || 1)); }
      const score = d * (1.6 - 0.6 * dot);   // prefer whoever you are looking at
      if (score < bs) { bs = score; best = r; }
    }
    return best;
  }
  function findByName(q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return nearestCrew();
    let hit = null;
    for (const r of game.remotes.values()) { const n = String(r.name || '').toLowerCase(); if (n === q) return r; if (!hit && (n.startsWith(q) || n.includes(q))) hit = r; }
    return hit;
  }

  // ------------------------------------------------------------------ popup (incoming / outgoing request)
  function hidePopup() { S.popup?.remove(); S.popup = null; }
  function showPopup(kind, name, ttl) {
    hidePopup();
    const d = document.createElement('div');
    d.className = 'trq';
    d.innerHTML = kind === 'in'
      ? `<div class="k">${escapeHtml(t('TRADE REQUEST'))}</div><div><b>${escapeHtml(name)}</b> ${escapeHtml(t('wants to trade'))}</div><div class="bar"><i></i></div>
         <div class="row"><button data-a="acc"><kbd>N</kbd>${escapeHtml(t('ACCEPT'))}</button><button data-a="dec"><kbd>M</kbd>${escapeHtml(t('DECLINE'))}</button></div>`
      : `<div class="k">${escapeHtml(t('TRADE REQUEST'))}</div><div>${escapeHtml(tf('Waiting for {name}...', { name }))}</div><div class="bar"><i></i></div>
         <div class="row"><button data-a="dec"><kbd>M</kbd>${escapeHtml(t('CANCEL'))}</button></div>`;
    d.addEventListener('click', (e) => { const a = e.target.closest('button')?.dataset.a; if (a === 'acc') respond(true); else if (a === 'dec') { if (kind === 'in') respond(false); else cancelRequest(); } });
    document.body.appendChild(d);
    const bar = d.querySelector('.bar i');
    requestAnimationFrame(() => { bar.style.transition = `width ${ttl}s linear`; bar.style.width = '0%'; });
    S.popup = d;
  }
  function respond(ok) {
    const r = S.incoming;
    if (!r) return;
    S.incoming = null;
    hidePopup();
    req('tracc', { tid: r.tid, ok: !!ok });
    if (!ok) toast(tf('You declined {name}.', { name: nameOf(r.from) }), 'info');
  }
  function cancelRequest() {
    const r = S.outgoing;
    if (!r) return;
    S.outgoing = null;
    hidePopup();
    req('trcx', { tid: r.tid });
  }

  // ------------------------------------------------------------------ asking
  function requestTrade(to) {
    if (!net() || !game.run || game.player?.dead) return false;
    if (S.snap || S.outgoing || S.incoming) { toast(t('You are already trading.'), 'bad'); return false; }
    const r = game.remotes.get(to);
    if (!r || r.dead) { toast(t('Nobody there to trade with.'), 'bad'); return false; }
    if (r.pos.distanceTo(game.player.pos) > TRADE_REACH + 0.4) { toast(t('They are too far away.'), 'bad'); return false; }
    req('trreq', { to });
    return true;
  }

  // ------------------------------------------------------------------ client: state + notices
  function clearSession() { S.snap = null; S.mine = { items: [], clout: 0 }; S.dirty = false; }
  function closePanel() {
    if (!S.panel) return;
    S.closing = true;
    try { if (game.ui?.panelOpen === S.panel.el) game.ui.closePanel(); else { S.panel.dispose(); S.panel = null; } } finally { S.closing = false; }
  }
  function openPanel() {
    if (S.panel || !game.ui?.openPanel) return;
    const ctl = createTradePanel(game, api);
    S.panel = ctl;
    game.ui.openPanel(ctl.el);
    game.ui.onPanelClose = () => {   // ESC / another panel / programmatic close: leaving the window cancels the trade
      if (S.panel === ctl) { S.panel = null; ctl.dispose(); if (S.snap && !S.closing) req('trcx', { tid: S.snap.tid }); clearSession(); }
      return false;
    };
    game.audio?.ui?.('ui_click', 0.5);
    ctl.update();
    ctl.flush();
  }
  function onState(d) {
    if (disposed || !d || typeof d.tid !== 'string' || !d.p) return;
    if (d.a !== me() && d.b !== me()) return;
    S.snap = d;
    S.recvAt = performance.now();
    nameOf(peerOf(d));
    const mine = d.p[me()];
    if (mine && (mine.q >= S.q || performance.now() - S.sentAt > 1500)) { S.mine.items = mine.i.slice(); S.mine.clout = mine.c; S.dirty = false; }   // adopt the host's version once it has seen my latest edit
    if (!S.panel && (d.st === 'open' || d.st === 'countdown')) openPanel();
    S.panel?.update();
    if (d.st === 'countdown' && d.cd > 2.5) game.audio?.ui?.('ui_confirm', 0.5);
  }
  function describe(list, clout) {
    const names = (list || []).map((x) => `${ITEMS[x.ty]?.name || x.ty}${x.pl ? ' +' + x.pl : ''}`);
    if (clout) names.push(`◈${clout}`);
    return names.length ? names.join(', ') : t('nothing');
  }
  function onMsg(d) {
    if (disposed || !d) return;
    switch (d.k) {
      case 'req':
        if (S.snap || S.incoming) { req('tracc', { tid: d.tid, ok: false }); break; }
        S.incoming = { tid: d.tid, from: d.from, until: performance.now() + ((d.ttl || RULES.requestTtl) + 1) * 1000 };
        showPopup('in', nameOf(d.from), d.ttl || RULES.requestTtl);
        game.audio?.ui?.('ui_notify', 0.7);
        break;
      case 'sent':
        S.outgoing = { tid: d.tid, to: d.to, until: performance.now() + ((d.ttl || RULES.requestTtl) + 1) * 1000 };
        showPopup('out', nameOf(d.to), d.ttl || RULES.requestTtl);
        break;
      case 'open':
        S.incoming = null; S.outgoing = null; hidePopup();
        game.audio?.ui?.('ui_confirm', 0.6);
        break;
      case 'cancel': {
        const had = !!S.snap || !!S.outgoing || !!S.incoming;
        const who = d.by && d.by !== me() ? nameOf(d.by) : nameOf(peerOf() || S.incoming?.from || S.outgoing?.to);
        S.incoming = null; S.outgoing = null; hidePopup();
        clearSession();
        closePanel();
        if (had) {
          const key = d.why === 'cancelled' && d.by === me() ? 'self' : d.why;
          toast(tf(CANCEL_TEXT[key] || CANCEL_TEXT.error, { name: who }), key === 'declined' || key === 'expired' || key === 'self' ? 'info' : 'bad');
          game.audio?.ui?.('ui_error', 0.4);
        }
        break;
      }
      case 'done': {
        const other = d.with;
        clearSession();
        S.incoming = null; S.outgoing = null; hidePopup();
        S.lastDone = d;
        game.refreshStats?.();
        game.ui?.systemMessage?.(tf('Trade complete with {name}: gave {gave}; received {got}.', { name: nameOf(other), gave: describe(d.gave, d.cg), got: describe(d.got, d.cr) }), 'good');
        game.audio?.ui?.('ui_buy', 0.8);
        if (S.panel) S.panel.showDone(d);
        break;
      }
      case 'err':
        game.audio?.ui?.('ui_error', 0.4);
        if (S.panel) S.panel.say(String(d.msg || 'Not now.')); else toast(t(String(d.msg || 'Not now.')), 'bad');
        break;
      default: break;
    }
  }
  /** host asks my client to pay the Clout I offered (I am the only one who can debit my own profile) */
  function onDebit(d) {
    if (disposed || !d || typeof d.tid !== 'string') return;
    const n = Math.max(0, Math.floor(Number(d.n) || 0));
    const mineTrade = S.snap && S.snap.tid === d.tid;
    const ok = !!mineTrade && n > 0 && !!game.progress?.spendCoins?.(n);
    req('trca', { tid: d.tid, ok });
  }

  // ------------------------------------------------------------------ the panel's actions
  const sendOffer = () => {
    if (!S.snap) return;
    S.dirty = true; S.q++; S.sentAt = performance.now();
    req('troff', { tid: S.snap.tid, items: S.mine.items, clout: S.mine.clout, q: S.q });
    S.panel?.update();
  };
  const api = {
    // ---- panel interface ----
    snap: () => S.snap, mine: () => S.mine, me, peer: () => peerOf(), nameOf, balance,
    entries: () => game.inventory?.entries?.() || [],
    countdown: () => (S.snap?.st === 'countdown' ? Math.max(0, S.snap.cd - (performance.now() - S.recvAt) / 1000) : 0),
    addOffer(id) { if (!S.snap || S.mine.items.includes(id) || S.mine.items.length >= RULES.maxItems) return; S.mine.items = [...S.mine.items, id]; game.sfx?.('inventory_switch', 0.4); sendOffer(); },
    removeOffer(id) { if (!S.snap || !S.mine.items.includes(id)) return; S.mine.items = S.mine.items.filter((x) => x !== id); game.sfx?.('inventory_switch', 0.3, 0.8); sendOffer(); },
    setClout(n) { if (!S.snap) return; S.mine.clout = Math.max(0, Math.min(balance(), Math.floor(n) || 0)); sendOffer(); },
    lock(on) { if (S.snap) req('trlock', { tid: S.snap.tid, on: !!on }); },
    accept() { if (S.snap) req('trok', { tid: S.snap.tid }); },
    cancel() { if (S.snap) { const tid = S.snap.tid; req('trcx', { tid }); } else closePanel(); },
    close() { closePanel(); },
    // ---- soft interface ----
    request: requestTrade, respond, cancelRequest, nearestCrew, findByName, host,
    isTrading: () => !!S.snap, state: () => S,
    // ---- icons: every registered item must resolve to a real model icon or a generated glyph (never blank) ----
    /** render every item's icon now (batched, shared offscreen renderer); resolves with how many are still queued (0 = done) */
    async warmIcons(maxMs = 30000) {
      prewarmIcons();
      const t0 = performance.now();
      while (iconsPending() && performance.now() - t0 < maxMs) { flushIcons(30); await new Promise((r) => setTimeout(r, 0)); }
      return iconsPending();
    },
    iconAudit: () => auditItems(ITEMS, { model: iconModelSource, icon: iconState }),
    debug: () => ({ snap: S.snap, mine: S.mine, incoming: S.incoming, outgoing: S.outgoing, sessions: host.sessions.size }),
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(prewarmT);
      for (const off of offs) off?.();
      offs.length = 0;
      window.removeEventListener('keydown', onKey);
      host.dispose();
      hidePopup();
      closePanel();
      mods?.chatCommands?.delete?.('trade');
    },
  };

  // ------------------------------------------------------------------ input
  const onKey = (e) => {
    if (disposed || e.repeat || game.destroyed || !game.net || !game.run) return;
    if (e.code !== TRADE_KEY && e.code !== DECLINE_KEY) return;
    if (game.input?.isTyping?.()) return;
    if (e.code === TRADE_KEY) {
      if (S.incoming) { e.preventDefault(); respond(true); return; }
      if (S.snap || S.outgoing) return;
      if (game.ui?.panelOpen || game.minigame || game.terminal?.active || game.ui?.chatOpen || game.player?.dead) return;
      const r = nearestCrew();
      if (r) { e.preventDefault(); requestTrade(r.id); }
      else if (game.remotes.size) toast(tf('Nobody within {m} m to trade with.', { m: TRADE_REACH }), 'info');
    } else if (S.incoming) { e.preventDefault(); respond(false); }
    else if (S.outgoing) { e.preventDefault(); cancelRequest(); }
  };
  window.addEventListener('keydown', onKey);

  // ------------------------------------------------------------------ frame
  function update(dt) {
    if (disposed || !game.net) return;
    if (game.isHost) host.tick(dt);
    S.panel?.tick(dt);
    const now = performance.now();   // a request whose 'cancel' notice never arrived still disappears
    if (S.incoming && now > S.incoming.until) S.incoming = null;
    if (S.outgoing && now > S.outgoing.until) S.outgoing = null;
    if (S.popup && !S.incoming && !S.outgoing) hidePopup();
  }

  // ------------------------------------------------------------------ wiring
  if (mods?.on) {
    offs.push(mods.on('netReady', (n, g) => {
      if (g !== game) return;
      n.on_('trs', (d) => onState(d));
      n.on_('trm', (d) => onMsg(d));
      n.on_('trc', (d) => onDebit(d));
      offs.push(n.on('peerLeave', (id) => {
        if (game.isHost) host.onLeave(id);
        if (S.snap && peerOf() === id) onMsg({ k: 'cancel', tid: S.snap.tid, why: 'left', by: id });
      }));
      clearTimeout(prewarmT);
      prewarmT = setTimeout(() => { if (!disposed) prewarmIcons(); }, 6000);   // idle-sliced: every item icon is ready before the first trade window
    }));
    offs.push(mods.on('registerHandlers', (H, g) => {
      if (g !== game) return;
      H('trreq', (d, from) => host.request(from, d));
      H('tracc', (d, from) => host.respond(from, d));
      H('troff', (d, from) => host.offer(from, d));
      H('trlock', (d, from) => host.lock(from, d));
      H('trok', (d, from) => host.accept(from, d));
      H('trcx', (d, from) => host.cancelBy(from, d));
      H('trca', (d, from) => host.ack(from, d));
    }));
    offs.push(mods.on('update', (dt, g) => { if (g === game) update(dt); }));
    offs.push(mods.on('interactables', (list, g) => {
      if (g !== game || S.snap || S.outgoing || S.incoming || !game.player || game.player.dead || !game.remotes.size) return;
      for (const r of game.remotes.values()) {
        if (r.dead || r.pos.distanceTo(game.player.pos) > TRADE_REACH + 0.3) continue;
        const p = r.pos.clone(); p.y += 1.15;
        list.push({ pos: p, r: 0.8, reach: TRADE_REACH, label: tf('Trade with {name} [E]', { name: r.name }), sub: t('or press [N]'), action: () => requestTrade(r.id) });
      }
    }));
    offs.push(mods.on('phase', (ph, g) => {
      if (g !== game) return;
      if (game.isHost) host.onPhase();
      S.incoming = null; S.outgoing = null; hidePopup();
    }));
    offs.push(mods.on('localDeath', (c, g) => { if (g === game && S.snap) req('trcx', { tid: S.snap.tid }); }));
    offs.push(mods.on('sessionEnd', (g) => { if (g === game) api.dispose(); }));
  }

  // chat `/trade <name>` and terminal `TRADE <name>`
  const tryTrade = (q) => {
    const r = findByName(q);
    if (!r) return t(game.remotes.size ? 'Nobody with that name is close.' : 'Nobody there to trade with.');
    if (r.pos.distanceTo(game.player.pos) > TRADE_REACH + 0.4) return tf('{name} is too far away (max {m} m).', { name: r.name, m: TRADE_REACH });
    return requestTrade(r.id) ? null : t('Not now.');
  };
  mods?.chatCommands?.set?.('trade', { fn: (args) => { const m = tryTrade(args.join(' ')); if (m) toast(m, 'bad'); }, owner: null });
  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  if (mm?.commands) {
    const cmds = {
      trade: { help: 'TRADE <name>: ask a crewmate within 4 m to trade (or press N next to them).', fn: (rest, term) => { const m = tryTrade(rest.join(' ')); term.print(m ? m : t('Trade request sent.'), m ? 'err' : undefined); } },
      iconaudit: {
        help: 'ICONAUDIT: which items have no 3D model / fall back to a generated glyph icon.',
        fn: async (rest, term) => {
          await api.warmIcons(8000);
          const a = api.iconAudit();
          const lines = [`ICON AUDIT  ${a.total} items · ${a.model} model icons · ${a.glyph.length} glyph fallbacks · ${a.blank.length} blank · ${a.noModel.length} without a model`];
          if (a.noModel.length) lines.push('no model: ' + a.noModel.map((r) => `${r.id} (${r.kind})`).join(', '));
          term.print(lines.join('\n'));
        },
      },
    };
    for (const [k, c] of Object.entries(cmds)) if (!mm.commands.has(k)) { mm.commands.set(k, c); offs.push(() => { if (mm.commands.get(k) === c) mm.commands.delete(k); }); }
  }
  return api;
}
