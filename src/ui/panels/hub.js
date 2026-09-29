// SOCIAL HUB panel + notifier (wave 4, docs/wave4/social.md). CRT look like the other panels.
//   hubPanel(ui, { inGame }) -> element      tabs ONLINE / LOBBIES / FRIENDS, player card + DM window on the right, privacy switches
//   createHubNotifier(app)   -> { dispose }   menu-side toasts for incoming DMs / invites (Join / Decline); the in-run "phone" is game/social.js
// Everything that comes from other players is written with textContent (never innerHTML).
import { el } from '../../core/util.js';
import { t, tf } from '../../core/i18n.js';
import { saveSettings } from '../../core/save.js';
import { avatarCanvas, fromWire, defaultAvatar, avatarOfProfile } from '../avatarpic.js';
import { HUB } from '../../net/hub_core.js';
import '../../net/hub_i18n.js';

const STYLE_ID = 'tfg-hub-style';
const CSS = `
.hub{width:min(1040px,96vw);max-height:92vh}
.menu-root.over-crt .menu-frame.wide.hub{width:min(1100px,68vw)}
.hub .cp-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:16px;padding:10px 16px 12px;overflow:hidden;min-height:0}
.hub-col{display:flex;flex-direction:column;gap:8px;min-width:0;min-height:0}
.hub-tabs{display:flex;gap:5px;align-items:center;flex-wrap:wrap}
.hub-tabs .btn{font-size:17px;padding:2px 9px;letter-spacing:0;cursor:pointer}
.hub-stat{flex-basis:100%;font-size:15px;color:var(--ph-dim);white-space:nowrap}
.hub-stat i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#777;margin-right:6px}
.hub-stat i.online{background:#5dff8a;box-shadow:0 0 6px #5dff8a}.hub-stat i.connecting{background:#ffd23f}.hub-stat i.error{background:#ff6a4a}
.hub-list{display:flex;flex-direction:column;gap:3px;overflow:auto;max-height:calc(92vh - 330px);min-height:150px;scrollbar-width:thin;scrollbar-color:var(--ph-dim) transparent}
.hub-row{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:9px;align-items:center;padding:4px 8px;border:1px solid var(--ph-line);background:rgba(0,0,0,.28);cursor:pointer;outline:none}
.hub-row:hover,.hub-row:focus-visible{background:var(--ph-sel);border-color:var(--ph-dim)}
.hub-row.sel{background:rgba(170,200,255,.16);border-color:var(--ph)}
.hub-row.off{opacity:.55}
.hub-nm{font-family:var(--cond);font-weight:bold;font-size:20px;line-height:1.05;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hub-sub{font-size:15px;color:var(--ph-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hub-tag{font-size:14px;padding:0 6px;border:1px solid var(--ph-line);color:var(--ph-dim);white-space:nowrap}
.hub-tag.fr{color:#ffd23f;border-color:#ffd23f}.hub-tag.un{color:#04060a;background:#ffd23f;border-color:#ffd23f}.hub-tag.bad{color:#ff8a7a;border-color:#ff8a7a}
.hub-empty{padding:16px 6px;color:var(--ph-dim);font-size:17px}
.hub-card{display:flex;gap:12px;align-items:center;border:1px solid var(--ph-line);background:rgba(0,0,0,.35);padding:10px}
.hub-card .hub-nm{font-size:26px}
.hub-acts{display:flex;flex-wrap:wrap;gap:6px}
.hub-log{border:1px solid var(--ph-line);background:rgba(0,0,0,.4);padding:6px 8px;height:190px;overflow:auto;display:flex;flex-direction:column;gap:2px;font-size:17px;scrollbar-width:thin}
.hub-ln{word-break:break-word}.hub-ln b{color:var(--ph-dim);font-weight:normal;font-size:14px;margin-right:6px}.hub-ln.out{color:#9ff0ff}.hub-ln.sys{color:var(--ph-dim);font-style:italic}
.hub-send{display:flex;gap:6px}.hub-send input{flex:1;min-width:0}
.hub-priv{border-top:1px solid var(--ph-line);padding-top:6px;display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center;font-size:16px}
.hub-priv label{display:flex;gap:6px;align-items:center;cursor:pointer}
.hub-priv select{font-size:15px}
.hub-inv{border:1px solid #ffd23f;background:rgba(255,210,63,.1);padding:8px;display:flex;flex-direction:column;gap:6px}
.hub-note{font-size:15px;color:var(--ph-dim)}
.hub-toasts{position:fixed;left:14px;top:66px;display:flex;flex-direction:column;gap:6px;z-index:60;max-width:min(340px,86vw);pointer-events:none}
.hub-toast{pointer-events:auto;border:1px solid var(--ph-dim,#8ab);background:rgba(5,8,13,.95);color:#dfe9ff;padding:8px 10px;display:flex;flex-direction:column;gap:6px;font-size:17px;box-shadow:0 4px 18px rgba(0,0,0,.6);animation:hubIn .18s ease-out}
.hub-toast.inv{border-color:#ffd23f}
.hub-toast .hub-h{display:flex;gap:8px;align-items:center;font-family:var(--cond);font-weight:bold}
.hub-toast .hub-b{word-break:break-word;font-size:16px;opacity:.9}
.hub-toast .hub-a{display:flex;gap:6px}
.hub-toast.out{opacity:0;transform:translateX(-20px);transition:all .25s}
@keyframes hubIn{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:none}}
@media (max-width:820px){.hub .cp-body{grid-template-columns:1fr;overflow:auto}.hub-list{max-height:240px}}
`;
export function injectHubStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
}

const STATUS_TEXT = { menu: 'In the menu', lobby: 'In a lobby', run: 'In a run' };
const REASONS = {
  off: 'The hub is offline.', empty: 'Write something first.', gone: 'That player is not online any more.',
  rate: 'Slow down a little.', nolobby: 'Host or join a lobby first, then invite.',
};
const hhmm = (ms) => { const d = new Date(ms || Date.now()); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const avOf = (e) => fromWire(e?.av) || defaultAvatar(e?.n || e?.nick || '?');
const stTxt = (e) => (e ? t(STATUS_TEXT[e.st] || STATUS_TEXT.menu) : t('Offline'));

export function hubPanel(ui, { inGame = false } = {}) {
  injectHubStyle();
  const app = ui.app, hub = app.hub;
  const wrap = ui.panel('wide hub');
  const s = app.settings;
  wrap.appendChild(ui.panelHead(t('SOCIAL HUB'), t('players · friends · messages')));
  if (!hub) {
    wrap.append(el('div', { class: 'cp-body' }, el('div', { class: 'hub-empty' }, t('The hub is unavailable.'))), el('div', { class: 'menu-row' }, inGame ? ui.button(t('Close'), () => ui.closePanel(), 'back') : ui.backButton(() => ui.showMenu('title'))));
    return wrap;
  }
  let tab = ui.hubTab || 'online';
  let sel = null;   // stable id of the selected player
  const status = el('span', { class: 'hub-stat' });
  const tabs = el('div', { class: 'hub-tabs' });
  const list = el('div', { class: 'hub-list' });
  const priv = el('div', { class: 'hub-priv' });
  const card = el('div', { class: 'hub-col' });
  const log = el('div', { class: 'hub-log' });
  const input = el('input', { maxlength: HUB.DM_MAX, placeholder: t('Write a message...'), autocomplete: 'off', spellcheck: 'false' });
  const sendBtn = ui.button(t('SEND'), () => send(), 'small primary');
  const msg = (k, kind) => ui.toast(t(REASONS[k] || k), kind || 'bad');

  const entryOf = (id) => hub.online().find((e) => e.id === id) || null;
  const friendOf = (id) => hub.friendRows().find((f) => f.id === id) || null;

  function send() {
    if (!sel) return;
    const r = hub.sendDm(sel, input.value);
    if (!r.ok) { msg(r.reason); return; }
    input.value = '';
    renderRight();
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } e.stopPropagation(); });

  function row(id, nick, e, extra) {
    const sid = id.split('|')[0];
    const r = el('div', { class: 'hub-row' + (sel === id ? ' sel' : '') + (e ? '' : ' off'), tabindex: 0, 'data-hid': id });
    const nm = el('div', { class: 'hub-nm' }, nick);
    const sub = el('div', { class: 'hub-sub' }, extra || stTxt(e));
    const tags = el('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } });
    if (e?.friend || friendOf(sid)) tags.append(el('span', { class: 'hub-tag fr' }, t('FRIEND')));
    const un = hub.unread.get(sid) || 0;
    if (un) tags.append(el('span', { class: 'hub-tag un' }, String(un)));
    r.append(avatarCanvas(avOf(e || { n: nick }), 28), el('div', { style: { minWidth: 0 } }, nm, sub), tags);
    r.addEventListener('click', () => { sel = id; hub.markRead(sid); renderAll(); if (!r.classList.contains('off')) input.focus({ preventScroll: true }); });
    r.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') r.click(); });
    return r;
  }

  function renderStatus() {
    const st = hub.enabled ? hub.status : 'idle';
    const txt = !hub.enabled ? t('Hub off') : st === 'online' ? tf('{n} online', { n: hub.online().length }) : st === 'connecting' ? t('Connecting...') : st === 'error' ? t('Hub unreachable') : t('Hub idle');
    status.replaceChildren(el('i', { class: st }), txt);
  }
  function renderTabs() {
    const defs = [['online', t('ONLINE')], ['lobbies', t('LOBBIES')], ['friends', t('FRIENDS')]];
    tabs.replaceChildren(...defs.map(([id, label]) => {
      const n = id === 'friends' ? hub.totalUnread() : 0;
      const b = ui.button(label + (n ? ` (${n})` : ''), () => { tab = id; ui.hubTab = id; renderAll(); }, 'chip' + (tab === id ? ' sel' : ''));
      return b;
    }), status);
  }
  function renderList() {
    const rows = [];
    if (!hub.enabled) rows.push(el('div', { class: 'hub-empty' }, t('The hub is switched off. Turn it on below to see other players.')));
    else if (tab === 'online') {
      const on = hub.online();
      if (!on.length) rows.push(el('div', { class: 'hub-empty' }, hub.status === 'error' ? t('Could not reach the hub network. The game works fine without it.') : t('Nobody else is here yet. Presence beacons arrive every ~10 s.')));
      for (const e of on) rows.push(row(e.id + '|' + e.peerId, e.n, e, `${stTxt(e)} · ${tf('Lv.{n}', { n: e.lv || 1 })}`));
    } else if (tab === 'lobbies') {
      const ls = hub.lobbies();
      if (!ls.length) rows.push(el('div', { class: 'hub-empty' }, t('No public lobbies shared through the hub right now. The JOIN GAME browser may still list some.')));
      for (const e of ls) {
        const r = row(e.id + '|' + e.peerId, e.lb.n || e.n, e, `${e.n} · ${e.lb.p}/${e.lb.m}${e.lb.k ? ' · ' + t('LOCKED') : ''}${e.compat ? '' : ' · ' + t('other version')}`);
        const jb = ui.button(t('Join'), (ev) => { ev.stopPropagation?.(); joinEntry(e); }, 'small primary' + (e.compat && e.lb.p < e.lb.m ? '' : ' disabled'));
        r.lastChild.replaceChildren(jb);
        rows.push(r);
      }
    } else {
      const fr = hub.friendRows();
      if (!fr.length) rows.push(el('div', { class: 'hub-empty' }, t('No friends yet. Open a player in ONLINE and press ADD FRIEND.')));
      for (const f of fr) rows.push(row(f.id, f.nick, f.entry, f.online ? `${stTxt(f.entry)} · ${tf('Lv.{n}', { n: f.entry.lv || 1 })}` : t('Offline')));
    }
    const keep = document.activeElement?.dataset?.hid;
    list.replaceChildren(...rows);
    if (keep) list.querySelector(`[data-hid="${CSS.escape(keep)}"]`)?.focus({ preventScroll: true });
  }
  function joinEntry(e) {
    if (!e?.lb) return;
    hub.joinLobby({ code: e.lb.c, lock: e.lb.k, name: e.lb.n, strat: e.lb.s });
  }

  function selId() { return sel ? sel.split('|')[0] : null; }
  function renderRight() {
    const id = selId();
    const e = id ? entryOf(id) : null;
    const f = id ? friendOf(id) : null;
    const nick = e?.n || f?.nick || '';
    const parts = [];
    const inv = hub.pendingInvite;
    if (inv && Date.now() - inv.at < 90000) {
      parts.push(el('div', { class: 'hub-inv' },
        el('div', { class: 'hub-nm' }, tf('{name} invites you', { name: inv.n })),
        el('div', { class: 'hub-sub' }, `${inv.name || inv.code}${inv.lock ? ' · ' + t('LOCKED') : ''}`),
        el('div', { class: 'hub-acts' },
          ui.button(t('Join'), () => { const i = hub.pendingInvite; hub.clearInvite(i); if (i) hub.joinLobby(i); }, 'small primary'),
          ui.button(t('Decline'), () => { hub.clearInvite(inv); renderRight(); }, 'small'))));
    }
    if (!id) {
      const me = app.profile;
      parts.push(el('div', { class: 'hub-card' }, avatarCanvas(avatarOfProfile(me), 48), el('div', {}, el('div', { class: 'hub-nm' }, me.name), el('div', { class: 'hub-sub' }, t('This is how others see you.')))));
      parts.push(el('div', { class: 'hub-note' }, t('Pick a player to message, add as a friend or invite. The hub only shares your nickname, avatar, level and status. Never your save or chat from a run.')));
      card.replaceChildren(...parts);
      return;
    }
    const head = el('div', { class: 'hub-card' }, avatarCanvas(avOf(e || { n: nick }), 48),
      el('div', { style: { minWidth: 0 } }, el('div', { class: 'hub-nm' }, nick || '?'),
        el('div', { class: 'hub-sub' }, e ? `${stTxt(e)} · ${tf('Lv.{n}', { n: e.lv || 1 })}${e.lb ? ' · ' + (e.lb.n || e.lb.c) : ''}` : t('Offline - messages need both of you online'))));
    const acts = el('div', { class: 'hub-acts' });
    if (!f) acts.append(ui.button(t('ADD FRIEND'), () => { const r = hub.addFriend(id, nick); ui.toast(r.ok ? tf('{name} added to friends.', { name: nick }) : t('Friend list is full.'), r.ok ? 'info' : 'bad'); renderAll(); }, 'small'));
    else acts.append(ui.button(t('REMOVE FRIEND'), () => { hub.removeFriend(id); renderAll(); }, 'small'));
    if (e) {
      acts.append(ui.button(t('INVITE'), () => { const r = hub.invite(id); if (r.ok) ui.toast(tf('Invite sent to {name}.', { name: nick }), 'info'); else msg(r.reason); }, 'small' + (hub.ctx === 'run' ? '' : ' disabled')));
      if (e.lb) acts.append(ui.button(t('JOIN LOBBY'), () => joinEntry(e), 'small primary' + (e.compat && e.lb.p < e.lb.m ? '' : ' disabled')));
    }
    if (e) for (const a of hub.actionsFor(e)) acts.append(ui.button(t(a.label || a.id), () => { try { a.run(e, app); } catch (err) { console.warn('[hub] action', a.id, err); } }, 'small'));
    acts.append(ui.button(t('BLOCK'), async () => { if (await ui.confirmBox?.(t('Block player'), tf('Hide {name} and ignore their messages?', { name: nick }), t('BLOCK'), true)) { hub.block(id); sel = null; renderAll(); } }, 'small'));
    parts.push(head, acts);
    if (hub.ctx !== 'run') parts.push(el('div', { class: 'hub-note' }, t('INVITE works while you are in a lobby (host or join one first).')));
    // conversation
    const lines = hub.history(id).map((h) => el('div', { class: 'hub-ln ' + h.d }, el('b', {}, hhmm(h.t)), (h.d === 'out' ? t('You') : nick) + ': ' + h.x));
    if (!lines.length) lines.push(el('div', { class: 'hub-ln sys' }, t('No messages yet.')));
    log.replaceChildren(...lines);
    log.scrollTop = log.scrollHeight;
    input.disabled = !e; sendBtn.classList.toggle('disabled', !e);
    input.placeholder = e ? t('Write a message...') : t('Offline');
    parts.push(log, el('div', { class: 'hub-send' }, input, sendBtn));
    card.replaceChildren(...parts);
  }
  function renderPriv() {
    const chk = (label, key, def = true, onSet) => {
      const c = el('input', { type: 'checkbox', checked: s[key] === undefined ? def : !!s[key] });
      c.addEventListener('change', () => { s[key] = c.checked; saveSettings(s); app.applySettings?.(); onSet?.(); renderAll(); });
      return el('label', {}, c, label);
    };
    const dm = el('select', {}, ...[['all', t('DMs: everyone')], ['friends', t('DMs: friends only')], ['off', t('DMs: off')]].map(([v, l]) => el('option', { value: v, selected: hub.dmPolicy === v }, l)));
    dm.addEventListener('change', () => { s.hubDm = dm.value; saveSettings(s); });
    priv.replaceChildren(chk(t('Hub online'), 'hubEnabled'), chk(t('Stay in the hub during a run'), 'hubInRun'), chk(t('Share my public lobby'), 'hubShareLobby'), dm);
  }
  function renderAll() { renderStatus(); renderTabs(); renderList(); renderRight(); }

  const left = el('div', { class: 'hub-col' }, tabs, list, priv);
  wrap.append(el('div', { class: 'cp-body' }, left, card), el('div', { class: 'menu-row' }, inGame ? ui.button(t('Close'), () => ui.closePanel(), 'back') : ui.backButton(() => ui.showMenu('title'))), ui.panelFoot());
  renderPriv();
  renderAll();
  let raf = 0;
  const off = hub.on('change', () => {
    if (!wrap.isConnected) { off(); return; }
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; if (wrap.isConnected) { renderStatus(); renderTabs(); renderList(); renderRight(); } });
  });
  const tickT = setInterval(() => { if (!wrap.isConnected) { clearInterval(tickT); off(); } else { renderStatus(); } }, 3000);
  return wrap;
}

// ------------------------------------------------------------------------------------------------ notifier (menu side)
export function createHubNotifier(app) {
  injectHubStyle();
  const box = el('div', { class: 'hub-toasts' });
  (document.getElementById('ui') || document.body).appendChild(box);
  const offs = [];
  const drop = (n) => { n.classList.add('out'); setTimeout(() => n.remove(), 260); };
  const push = (n, ms) => { box.appendChild(n); while (box.children.length > 4) box.firstChild.remove(); setTimeout(() => { if (n.isConnected) drop(n); }, ms); };
  const active = () => app.hub && app.hub.ctx === 'menu';   // in a run the phone (game/social.js) shows them
  const head = (e) => el('div', { class: 'hub-h' }, avatarCanvas(avOf(e), 22), el('span', {}, e.n));
  const hub = app.hub;
  if (hub) {
    offs.push(hub.on('dm', (d) => {
      if (!active()) return;
      const n = el('div', { class: 'hub-toast' }, head({ n: d.n, av: hub.presence.get(d.peerId)?.av }), el('div', { class: 'hub-b' }, d.text));
      n.style.cursor = 'pointer';
      n.addEventListener('click', () => { drop(n); app.ui.hubTab = d.friend ? 'friends' : 'online'; app.ui.showMenu('hub'); });
      push(n, 9000);
      try { app.audio?.ui('ui_chat', 0.4); } catch { /* audio optional */ }
    }));
    offs.push(hub.on('invite', (inv) => {
      if (!active()) return;
      const n = el('div', { class: 'hub-toast inv' }, head({ n: inv.n, av: hub.presence.get(inv.peerId)?.av }),
        el('div', { class: 'hub-b' }, tf('invites you to {lobby}', { lobby: inv.name || inv.code }) + (inv.lock ? ' · ' + t('LOCKED') : '')),
        el('div', { class: 'hub-a' },
          app.ui.button(t('Join'), () => { drop(n); hub.clearInvite(inv); hub.joinLobby(inv); }, 'small primary'),
          app.ui.button(t('Decline'), () => { drop(n); hub.clearInvite(inv); }, 'small')));
      push(n, 25000);
      try { app.audio?.ui('ui_confirm', 0.5); } catch { /* audio optional */ }
    }));
  }
  return { dispose() { for (const o of offs) o?.(); box.remove(); } };
}
