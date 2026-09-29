// DAILY (wave 4, module 'daily'; docs/wave4/daily.md): the retention loop. Login calendar, daily / weekly challenges, earned crates, a free
// 30-tier monthly season track, first-win-of-the-day bonus, level-up fanfare and the quota crate. Rules are pure (daily_core.js, node-tested),
// the panel is ui/panels/daily.js (also opened from the main menu), effects are ui/daily_fx.js.
//
// Everything here is a PERSONAL account reward applied locally (profile.daily). The only shared thing is the delivery of parts / shards to the
// ship: the client asks the host with `dyclaim` (whitelisted ids, capped counts, only in orbit) and the host answers `dymsg`.
// Events come from the existing hooks: Progress.kill / fish, Game.onReward (collect / sell / minigame / survive / quota / core), mods
// 'tfg:chestOpened', 'levelUp', 'phase', and the anomaly STATIC stage (game.anomaly.stage).
import * as THREE from 'three';
import { t, tf } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { hudDock } from '../ui/dock.js';
import { CREATURES } from './creatures.js';
import * as C from './daily_core.js';
import { createDailyService, deliverableId } from './daily_svc.js';
import { createDailyPanel } from '../ui/panels/daily.js';
import { levelUpFanfare, celebrate } from '../ui/daily_fx.js';
import './daily_text.js';

HOST_ONLY.add('dymsg');

const READY_DELAY = 7;          // s of a running session before the "reward ready" hint
const ANOMALY_STAGE = 2;        // GLITCHING
const KILL_SXP = 2, KILL_SXP_CAP = 60, SELL_SXP_CAP = 150;
const DELIVER_EVERY = 20;       // s between delivery attempts
const isMeleeDef = (def) => !!def && def.kind === 'weapon' && !def.ranged && !def.cfire && !def.wfire;

function wrap(obj, name, after) {
  const orig = obj?.[name];
  if (typeof orig !== 'function') return () => {};
  const fn = function (...a) {
    const r = orig.apply(this, a);
    try { after(a, r); } catch (e) { console.warn('[daily]', name, e); }
    return r;
  };
  obj[name] = fn;
  return () => { if (obj[name] === fn) obj[name] = orig; };
}

export function installDaily(game) {
  const mods = game.mods;
  const profile = game.profile;
  const svc = createDailyService({ profile, game });
  const offs = [];
  const timers = new Set();
  let disposed = false, dock = null, dockHtml = '', dockT = 0;
  let anomalyHit = false, readyShown = false, sessionT = 0;
  let deliverT = DELIVER_EVERY - 8, pending = null, nonce = 0, boundNet = null;
  const lastClaim = new Map();   // host: peer -> ms of the last delivery
  const me = (d) => !d.to || d.to === game.selfId || d.to === profile.id;
  const toast = (text, kind = 'info') => { try { game.ui?.hud?.toast?.(text, kind); } catch { /* hud optional */ } };
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, ms); timers.add(id); };
  const sfx = (n, v, p) => svc.sfx(n, v, p);
  const reduce = () => svc.reduceMotion();
  /** run fn once no full-screen report / minigame is on top (day summary, quota cinematic ...) */
  const whenClear = (fn, tries = 90) => {
    const tick = () => {
      if (disposed) return;
      if ((game.ui?.fullscreenOpen?.() || game.minigame || game.ui?.panelOpen) && tries-- > 0) { later(tick, 700); return; }
      fn();
    };
    later(tick, 900);
  };

  // ------------------------------------------------------------------------------------------ season xp helpers
  function gainSeason(n) {
    const r = C.seasonAdd(profile, n);
    if (r.newTiers.length) {
      const tier = r.newTiers[r.newTiers.length - 1];
      toast(tf('Season tier {n} reached. Claim it in DAILY [F2].', { n: tier }), 'good');
      sfx('ui_notify', 0.6);
    }
    return r.added;
  }
  function capped(name, per, cap) {
    const d = C.ensureDaily(profile), key = C.todayKey(profile);
    if (d.caps[name + 'Day'] !== key) { d.caps[name + 'Day'] = key; d.caps[name] = 0; }
    const room = Math.max(0, cap - (d.caps[name] || 0));
    const add = Math.min(room, per);
    d.caps[name] = (d.caps[name] || 0) + add;
    return add;
  }

  // ------------------------------------------------------------------------------------------ challenge tracking
  function track(ev, n = 1, data = {}) {
    const done = C.track(profile, ev, n, data);
    if (done.length) {
      for (const c of done) {
        const q = (c.scope === 'week' ? C.ensureDaily(profile).w.list : C.ensureDaily(profile).q.list)[c.index];
        toast(`${c.scope === 'week' ? t('Weekly challenge complete') : t('Challenge complete')}: ${svc.questText(q)}`, 'good');
      }
      sfx('ui_confirm', 0.6);
      svc.changed();
    }
    game.progress?.save?.();
    dockT = 0;
  }
  function onKill(type) {
    const held = game.player?.heldItem?.();
    track('kill', 1, { melee: isMeleeDef(held?.def), boss: !!CREATURES[type]?.boss });
    if (CREATURES[type]?.boss) gainSeason(150);
    const s = capped('ks', KILL_SXP, KILL_SXP_CAP);
    if (s > 0) gainSeason(s);
  }
  function dayEnd(d) {
    track('day', 1);
    if (anomalyHit) { track('anomaly', 1); anomalyHit = false; }
    gainSeason(100);
    firstWin(d);
  }
  function onQuota() {
    track('quota', 1);
    gainSeason(250);
    if (C.capOnce(profile, 'quotaCrate')) {
      C.grantCrate(profile, 'quota', 'quota');
      game.progress?.save?.();
      whenClear(() => {
        celebrate({ root: game.ui.root, text: t('QUOTA CRATE'), sub: t('EARNED'), color: '#ffd23f', sfx, reduce: reduce() });
        toast(t('The Algorithm is pleased. A Quota Crate is waiting in DAILY [F2].'), 'good');
        dockT = 0;
      });
    }
  }
  function firstWin(d) {
    if (!C.firstWinToday(profile)) return;
    const xp = Math.max(1, Math.round(d?.xp || 0)), coin = Math.round(d?.coin || 0);
    if (xp > 1 || coin) {
      if (xp > 1) game.progress.addXp(xp, 'First win of the day');
      if (coin) game.progress.addCoins(coin, 'First win of the day');
    } else game.progress.addXp(60, 'First win of the day');
    gainSeason(60);
    game.progress.save();
    whenClear(() => {
      celebrate({ root: game.ui.root, text: t('FIRST WIN OF THE DAY'), sub: t('XP x2'), color: '#3dd6ff', sfx, reduce: reduce() });
      toast(t('First win of the day: this reward was doubled.'), 'good');
    });
    dockT = 0;
  }

  // ------------------------------------------------------------------------------------------ observers
  offs.push(wrap(game.progress, 'kill', ([type]) => onKill(type)));
  offs.push(wrap(game.progress, 'fish', () => track('fish', 1)));
  offs.push(wrap(game, 'onReward', ([d]) => {
    if (!d || !me(d)) return;
    const b = d.bounty;
    if (b?.type === 'collect') track('scrap', Number(b.n) || 0);
    else if (b?.type === 'sell') { const v = Number(b.n) || 0; track('sell', v); const s = capped('ss', Math.floor(v / 40), SELL_SXP_CAP); if (s > 0) gainSeason(s); }
    else if (b?.type === 'minigame') { track('minigame', 1); gainSeason(30); }
    else if (b?.type === 'survive') dayEnd(d);
    if (d.quota) onQuota();
    if (d.reason === 'Core extracted') { track('core', 1); gainSeason(150); firstWin(d); }
    else if (d.reason === 'Escaped the Backrooms') firstWin(d);
  }));
  offs.push(mods.on('tfg:chestOpened', (d, g) => { if ((g && g !== game) || !d || (d.by && d.by !== game.selfId)) return; track('chest', 1); }));
  offs.push(mods.on('phase', (ph, g) => { if (g && g !== game) return; if (ph === 'landing') anomalyHit = false; if (ph === 'orbit') deliverT = DELIVER_EVERY - 6; }));

  // ------------------------------------------------------------------------------------------ level-up fanfare
  offs.push(mods.on('levelUp', (level, g) => {
    if (g && g !== game) return;
    const lines = [t('+1 skill point [TAB]')];
    const d = C.ensureDaily(profile);
    const key = (profile.prestige?.stars || 0) * 1000 + level;
    if (level % 5 === 0 && key > (d.stats.lvlCrate || 0)) {
      d.stats.lvlCrate = key;
      C.grantCrate(profile, 'supply', 'level' + level);
      lines.push(tf('Level {n} milestone: a Supply Crate is waiting in DAILY [F2]', { n: level }));
    }
    game.progress.save();
    levelUpFanfare({ root: game.ui.root, level, lines, color: '#ffd23f', sfx, reduce: reduce() });
    dockT = 0;
  }));

  // ------------------------------------------------------------------------------------------ parts delivery (host authoritative)
  function reply(to, o) { if (to === game.selfId) onMsg(o, game.selfId); else game.net.sendTo(to, 'dymsg', o); }
  function hostClaim(d, from) {
    if (disposed || !d) return;
    const ph = game.run?.phase;
    const now = Date.now();
    if (ph !== 'orbit' || now - (lastClaim.get(from) || 0) < 2500) { reply(from, { k: 'no', n: d.n }); return; }
    const items = C.sanitizeDelivery(d.items, deliverableId);
    if (!items.length) { reply(from, { k: 'no', n: d.n }); return; }
    lastClaim.set(from, now);
    const base = game.aiPlayerById?.(from)?.pos || new THREE.Vector3(0.5, 0.4, 0);
    for (const [id, n] of items) {
      for (let i = 0; i < n; i++) game.items.hostSpawn(id, new THREE.Vector3(base.x + (Math.random() - 0.5) * 0.9, base.y + 1.1, base.z + (Math.random() - 0.5) * 0.9), { linvel: [Math.random() - 0.5, 2.2, Math.random() - 0.5] });
    }
    game.net.broadcast('fx', { k: 'snd', s: 'item_pickup', p: [base.x, base.y + 1, base.z], v: 0.7 });
    reply(from, { k: 'ok', n: d.n, items });
  }
  function onMsg(m, from) {
    if (disposed || !m || (from !== game.net?.hostId && from !== game.selfId)) return;
    if (!pending || m.n !== pending.n) return;
    const p = pending; pending = null;
    if (m.k === 'ok') {
      C.settleStash(profile, m.items || p.items);
      game.progress.save();
      toast(tf('Daily parcel delivered to the ship: {items}', { items: svc.itemsText(m.items || p.items) }), 'good');
      sfx('ui_buy', 0.5);
      svc.changed();
    } else deliverT = 0;
  }
  function bindNet(net) { if (!net || boundNet === net) return; boundNet?.off?.('msg:dymsg', onMsg); boundNet = net; net.on('msg:dymsg', onMsg); }
  offs.push(mods.on('registerHandlers', (H, g) => { if (g === game) H('dyclaim', (d, from) => { try { hostClaim(d, from); } catch (e) { console.error('dyclaim', e); } }); }));
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  function tryDeliver(dt) {
    if (pending) { if (Date.now() - pending.at > 9000) pending = null; return; }
    if (game.run?.phase !== 'orbit' || game.player?.dead || !game.net) return;
    deliverT += dt;
    if (deliverT < DELIVER_EVERY) return;
    const plan = C.planDelivery(profile, deliverableId);
    if (!plan.length) { deliverT = 0; return; }
    deliverT = 0;
    pending = { n: ++nonce, items: plan, at: Date.now() };
    game.net.request('dyclaim', { n: pending.n, items: plan });
  }

  // ------------------------------------------------------------------------------------------ panel / key / dock chip
  const api = {
    svc,
    open(tab) {
      const ui = game.ui;
      if (disposed || !ui?.openPanel || game.player?.dead) return null;
      if (ui.panelOpen && ui.panelOpen !== api._panel?.el) return null;
      if (api._panel && ui.panelOpen === api._panel.el) { api._panel.setTab?.(tab); return api._panel; }
      const ctl = createDailyPanel({ ui, svc, tab, closeButton: ui.button(t('Close'), () => ui.closePanel(), 'back') });
      ui.openPanel(ctl.el);
      ui.onPanelClose = () => { ctl.dispose(); if (api._panel === ctl) api._panel = null; return false; };
      api._panel = ctl;
      return ctl;
    },
    close() { if (api._panel && game.ui?.panelOpen === api._panel.el) game.ui.closePanel(); },
    track,                                       // other modules can feed events: track('scrap', 100)
    attention: () => svc.attention(),
    dispose() {
      if (disposed) return; disposed = true;
      for (const off of offs) { try { off?.(); } catch { /* ignore */ } }
      for (const id of timers) clearTimeout(id);
      timers.clear();
      try { boundNet?.off?.('msg:dymsg', onMsg); } catch { /* ignore */ }
      if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
      try { api._panel?.dispose?.(); } catch { /* ignore */ }
      dock?.remove(); dock = null;
    },
  };
  const onKey = (e) => {
    if (e.code !== (game.settings?.keys?.daily || 'F2') || e.repeat || disposed || game.destroyed || !game.run || !game.net || e.ctrlKey || e.altKey || e.metaKey) return;
    if (game.input?.isTyping?.() || game.minigame || game.terminal?.active || game.ui?.chatOpen) return;
    if (game.ui?.panelOpen && game.ui.panelOpen !== api._panel?.el) return;
    if (game.player?.dead) return;
    e.preventDefault();
    if (api._panel && game.ui.panelOpen === api._panel.el) api.close(); else api.open();
  };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);

  function drawDock() {
    if (!dock) dock = hudDock('left', 'daily', 58);
    const a = svc.attention();
    const fw = game.run?.phase === 'moon' && C.firstWinAvailable(profile);
    const hot = a.total > 0;
    const html = hot || fw ? `<div style="font:15px 'VT323',monospace;color:#ffe2b8;background:rgba(14,8,3,.72);border:1px solid rgba(255,150,70,.45);padding:2px 8px;letter-spacing:1px"><kbd style="border:1px solid #ff8a3d;padding:0 5px;color:#ff8a3d">F2</kbd> ${t('DAILY')}${hot ? ` <span style="background:#ffd23f;color:#120800;padding:0 4px;font:9px monospace;margin-left:4px">${t('NEW!')}</span>` : ''}${fw ? ` <span style="color:#3dd6ff;margin-left:6px">${t('First win: XP x2')}</span>` : ''}</div>` : '';
    if (html !== dockHtml) { dockHtml = html; dock.innerHTML = html; }
  }

  // ------------------------------------------------------------------------------------------ terminal
  try {
    mods.api?.registerCommand?.('daily', (rest, term) => {
      const l = svc.login(), q = svc.quests(), s = svc.season();
      const lines = [t('DAILY REWARDS'), '',
        `${t('Streak')}: ${l.streak} (${t('best')} ${l.best}) · ${l.canClaim ? t('reward ready: press B to claim') : t('claimed today')}`, '', t('Daily challenges')];
      for (const c of q.daily) lines.push(` ${c.claimed ? '[x]' : C.questDone(c) ? '[!]' : '[ ]'} ${svc.questText(c)}  ${Math.floor(c.prog)}/${svc.questTarget(c)}`);
      lines.push('', t('Weekly challenges'));
      for (const c of q.weekly) lines.push(` ${c.claimed ? '[x]' : C.questDone(c) ? '[!]' : '[ ]'} ${svc.questText(c)}  ${Math.floor(c.prog)}/${svc.questTarget(c)}`);
      lines.push('', `${t('Season')} ${s.key}: ${t('tier')} ${s.tier}/${C.SEASON_TIERS}  ·  ${t('Crates')}: ${svc.crates().length}`, '', t('Press B in the ship or HUD to open the DAILY panel.'));
      term.print(lines.join('\n'));
    }, 'daily rewards, challenges and season');
  } catch (e) { console.warn('[daily] terminal', e); }

  // ------------------------------------------------------------------------------------------ update
  let sampleT = 0;
  offs.push(mods.on('update', (dt, g) => {
    if (g && g !== game) return;
    if (disposed) return;
    sessionT += dt; sampleT += dt; dockT -= dt;
    if (sampleT >= 1) {
      sampleT = 0;
      if (game.run?.phase === 'moon' && (game.anomaly?.stage ?? 0) >= ANOMALY_STAGE) anomalyHit = true;
    }
    if (!readyShown && sessionT > READY_DELAY && game.run && !game.ui?.fullscreenOpen?.()) {
      readyShown = true;
      svc.settleSeason();
      const a = svc.attention();
      if (a.login) toast(t('Your daily reward is ready. Press B to claim it.'), 'good');
      else if (a.total > 0) toast(t('Rewards are waiting in DAILY [F2].'), 'info');
    }
    if (dockT <= 0) { dockT = 1.5; try { drawDock(); } catch { /* dock optional */ } }
    tryDeliver(dt);
  }));

  return api;
}
