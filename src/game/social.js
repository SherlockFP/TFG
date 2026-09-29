// SOCIAL (wave 4, module 'social'; docs/wave4/social.md). In-run half of the social hub (the hub itself lives on the App: src/net/hub.js).
//  * PHONE: a small HUD notice (left dock) that shows incoming DMs / lobby invites / radio lines during a run, unobtrusive and fading.
//    Reply with /r, answer invites with /accept or /decline, open the whole hub with /hub, direct message anybody in the hub with /w <nick> <text>.
//  * RADIO: private text channel to ONE crewmate through the existing walkie-talkie item (both walkies must be ON; the Backrooms have no signal).
//    Hold nothing special: press ` (Backquote) with an ON walkie to open the chat prefilled with "/rad ", or type /rad <text>. /tune <nick> picks the
//    crewmate (with exactly one other player it is automatic). Voice over the walkie is the existing proximity/walkie voice path (net/voice.js).
// Net (prefixed 'so'): 'sorad' {x, n} sent DIRECTLY to the tuned crewmate (net.sendTo, never broadcast, never relayed = private).
import { t, tf } from '../core/i18n.js';
import { hudDock } from '../ui/dock.js';
import { RateLimiter, cleanText, resolveTarget, HUB } from '../net/hub_core.js';
import { hubPanel } from '../ui/panels/hub.js';
import '../net/hub_i18n.js';


const RADIO_MAX = 160;
const RADIO_KEY = 'Backquote';

export function installSocial(game) {
  const app = game.ui?.app || window.kefal;
  const hub = app?.hub;
  if (!hub) return null;   // hub failed to install: the game works without it
  const mods = game.mods;
  const offs = [];
  const cmds = [];
  let disposed = false;
  const S = { tuned: null, inRate: new RateLimiter(5, 8000), outRate: new RateLimiter(5, 8000), lines: [], box: null, lastStatic: 0, hintT: 0, keyT: 0 };

  hub.setContext('run', game);

  // ---------------------------------------------------------------- phone (HUD notice)
  const box = hudDock('left', 'social-phone', 70);
  box.style.cssText = 'display:none;flex-direction:column;gap:3px;max-width:290px;font:15px/1.25 var(--cond, Arial Narrow, sans-serif);color:#dfe9ff';
  S.box = box;
  const now = () => performance.now();
  function paint() {
    if (disposed) return;
    const t0 = now();
    S.lines = S.lines.filter((l) => l.until > t0);
    const unread = hub.totalUnread();
    box.replaceChildren();
    if (!S.lines.length && !unread) { box.style.display = 'none'; return; }
    box.style.display = 'flex';
    for (const l of S.lines) {
      const d = document.createElement('div');
      d.style.cssText = `background:rgba(5,8,13,.82);border-left:3px solid ${l.color};padding:3px 8px;word-break:break-word;opacity:${Math.min(1, (l.until - t0) / 900)}`;
      const h = document.createElement('b'); h.textContent = l.head + ' '; h.style.color = l.color;
      const tx = document.createElement('span'); tx.textContent = l.text;
      d.append(h, tx);
      if (l.hint) { const hh = document.createElement('div'); hh.textContent = l.hint; hh.style.cssText = 'opacity:.65;font-size:13px'; d.append(hh); }
      box.append(d);
    }
    if (unread && !S.lines.length) {
      const d = document.createElement('div');
      d.style.cssText = 'background:rgba(5,8,13,.7);padding:2px 8px;opacity:.75;font-size:14px';
      d.textContent = tf('PHONE: {n} unread - /hub', { n: unread });
      box.append(d);
    }
  }
  function note(head, text, color, ms, hint) {
    S.lines.push({ head, text, color, until: now() + ms, hint });
    if (S.lines.length > 3) S.lines.shift();
    paint();
  }
  const sfx = (n, v = 0.4) => { try { game.audio?.ui?.(n, v); } catch { /* audio optional */ } };

  offs.push(hub.on('dm', (d) => {
    if (hub.game !== game) return;
    note('✉ ' + d.n + ':', d.text, '#9fd0ff', 9000, t('/r to reply'));
    sfx('ui_chat', 0.4);
  }));
  offs.push(hub.on('invite', (inv) => {
    if (hub.game !== game) return;
    note('☎ ' + inv.n, tf('invites you to {lobby}', { lobby: inv.name || inv.code }), '#ffd23f', 25000, t('/accept  or  /decline'));
    sfx('ui_confirm', 0.5);
  }));
  offs.push(hub.on('change', () => { if (!disposed && S.box) paint(); }));

  // ---------------------------------------------------------------- radio
  const others = () => [...(game.net?.players?.keys() || [])].filter((id) => id !== game.selfId);
  const nameOf = (id) => game.playerName?.(id) || 'Employee';
  const walkieOn = () => { try { return !!game.hasActiveWalkie?.(game.selfId); } catch { return false; } };
  function tunedId() {
    if (S.tuned && game.net?.players?.has(S.tuned)) return S.tuned;
    const o = others();
    return o.length === 1 ? o[0] : null;
  }
  const toast = (s, kind = 'info') => { try { game.ui?.toast?.(s, kind); } catch { /* ui optional */ } };
  function radioSend(text) {
    const x = cleanText(text, RADIO_MAX);
    if (!x) { toast(t('Radio: type a message after /rad'), 'bad'); return; }
    if (!walkieOn()) { toast(t('Turn your walkie-talkie on first.'), 'bad'); return; }
    const to = tunedId();
    if (!to) { toast(others().length ? t('Radio: pick a crewmate with /tune <name>') : t('Radio: nobody else is in the crew.'), 'bad'); return; }
    if (!S.outRate.allow('o', now())) { toast(t('Slow down a little.'), 'bad'); return; }
    try { game.net.sendTo(to, 'sorad', { x, n: game.profile.name }); } catch { toast(t('Radio: no link to that crewmate.'), 'bad'); return; }
    note('⌁ → ' + nameOf(to) + ':', x, '#9ff0a0', 7000);
    try { game.ui?.chatMessage?.(null, '[' + t('RADIO') + ' → ' + nameOf(to) + '] ' + x, false, 'signal'); } catch { /* ignore */ }
  }
  function onRadio(d, from) {
    if (!d || typeof d !== 'object' || from === game.selfId || !game.net?.players?.has(from)) return;   // crew members only
    const x = cleanText(typeof d.x === 'string' ? d.x : '', RADIO_MAX);
    if (!x || !S.inRate.allow(from, now())) return;
    const nm = nameOf(from);
    if (!walkieOn()) {   // your walkie is off / no signal: you only hear static
      if (now() - S.lastStatic > 10000) { S.lastStatic = now(); note('⌁ ' + nm, t('... static ... (turn your walkie-talkie on)'), '#8a8f99', 5000); try { game.sfx?.('walkie_static', 0.3); } catch { /* ignore */ } }
      return;
    }
    if (!S.tuned || !game.net.players.has(S.tuned)) S.tuned = from;   // answer whoever calls you
    note('⌁ ' + nm + ':', x, '#9ff0a0', 9000, t('RADIO'));
    try { game.ui?.chatMessage?.(null, '[' + t('RADIO') + '] ' + nm + ': ' + x, false, 'signal'); } catch { /* ignore */ }
    try { game.sfx?.('walkie_static', 0.35); } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------- chat commands
  function cmd(name, fn) { try { mods?.chatCommands?.set(name, { fn, owner: null }); cmds.push(name); } catch { /* ignore */ } }
  cmd('rad', (args) => radioSend(args.join(' ')));
  cmd('radio', (args) => radioSend(args.join(' ')));
  cmd('tune', (args) => {
    const o = others();
    if (!o.length) { toast(t('Radio: nobody else is in the crew.'), 'bad'); return; }
    let id = null;
    if (args.length) { const r = resolveTarget(o.map((i) => ({ id: i, n: nameOf(i) })), args); id = r?.row.id || null; }
    else id = o[(Math.max(0, o.indexOf(S.tuned)) + (S.tuned ? 1 : 0)) % o.length];   // no name: cycle
    if (!id) { toast(t('Radio: no such crewmate.'), 'bad'); return; }
    S.tuned = id;
    toast(tf('Radio tuned to {name}.', { name: nameOf(id) }));
  });
  cmd('w', (args) => {
    const rows = hub.online().map((e) => ({ id: e.id, n: e.n }));
    const r = resolveTarget(rows, args);
    if (!r) { toast(t(hub.connected ? 'Usage: /w <name> <message> (the player must be online in the hub)' : 'The hub is offline.'), 'bad'); return; }
    dm(r.row.id, r.row.n, r.text);
  });
  cmd('msg', (args) => game.sendChat?.('/w ' + args.join(' ')));
  cmd('r', (args) => {
    const id = hub.lastFrom;
    if (!id) { toast(t('Nobody has messaged you yet.'), 'bad'); return; }
    dm(id, hub.online().find((e) => e.id === id)?.n || '?', args.join(' '));
  });
  function dm(id, nick, text) {
    if (!text) { toast(tf('Write something after the name: /w {name} <message>', { name: nick }), 'bad'); return; }
    const r = hub.sendDm(id, text);
    if (r.ok) { hub.markRead(id); note('✉ → ' + nick + ':', cleanText(text, HUB.DM_MAX), '#9fd0ff', 5000); }
    else toast(t({ off: 'The hub is offline.', empty: 'Write something first.', gone: 'That player is not online any more.', rate: 'Slow down a little.' }[r.reason] || 'Could not send.'), 'bad');
  }
  cmd('accept', () => {
    const inv = hub.pendingInvite;
    if (!inv || Date.now() - inv.at > 90000) { toast(t('No pending invite.'), 'bad'); return; }
    hub.clearInvite(inv);
    hub.joinLobby(inv);
  });
  cmd('decline', () => { hub.clearInvite(); S.lines = S.lines.filter((l) => l.head[0] !== '☎'); paint(); toast(t('Invite declined.')); });
  cmd('invite', (args) => {
    const rows = hub.online().map((e) => ({ id: e.id, n: e.n }));
    const r = resolveTarget(rows, args);
    if (!r) { toast(t('Usage: /invite <name> (the player must be online in the hub)'), 'bad'); return; }
    const res = hub.invite(r.row.id);
    toast(res.ok ? tf('Invite sent to {name}.', { name: r.row.n }) : t({ off: 'The hub is offline.', nolobby: 'Host or join a lobby first, then invite.', gone: 'That player is not online any more.', rate: 'Slow down a little.' }[res.reason] || 'Could not send.'), res.ok ? 'info' : 'bad');
  });
  cmd('hub', () => { try { game.ui.openPanel(hubPanel(game.ui, { inGame: true })); } catch (e) { console.warn('[social] hub panel', e); } });

  // ---------------------------------------------------------------- hooks
  offs.push(mods.on('netReady', (net, g) => {
    if (g !== game) return;
    net.on_('sorad', (d, from) => onRadio(d, from));
    offs.push(net.on('peerLeave', (id) => { if (S.tuned === id) S.tuned = null; }));
  }));
  offs.push(mods.on('phase', (ph, g) => { if (g === game) hub.beaconSoon(); }));
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    S.hintT += dt;
    if (S.lines.length && S.hintT > 0.25) { S.hintT = 0; paint(); }   // fade + expiry
    const inp = game.input;
    if (inp?.enabled && inp.locked && !game.player?.dead && inp.codePressed?.(RADIO_KEY) && walkieOn() && !game.ui?.chatOpen) {
      game.ui.openChat();
      try { game.ui.chatIn.value = '/rad '; } catch { /* ignore */ }
    }
  }));
  offs.push(mods.on('sessionEnd', (g) => { if (g === game) api.dispose(); }));

  const api = {
    state: () => ({ tuned: S.tuned, lines: S.lines.length, hubStatus: hub.status, peers: hub.presence.size }),
    tune: (id) => { S.tuned = id; },
    radioSend, onRadio, note,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      for (const c of cmds) { try { mods?.chatCommands?.delete(c); } catch { /* ignore */ } }
      try { box.remove(); } catch { /* ignore */ }
      try { if (hub.game === game) hub.setContext('menu'); } catch { /* ignore */ }
    },
  };
  return api;
}
