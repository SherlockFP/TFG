// ROLEDAYS - the Algorithm imposes role constraints some days (docs/wave6/roledays.md, MASTERPLAN 23.8).
//   roll     HOST, in orbit ~8 s after the morning vote opens: quota >= 2, ~25% of days, never two in a row, never Casual, never the Company moon.
//   assign   roles if chosen (game.rpg.roleOf), else round-robin by day. Solo cards (1-2 players) apply to everybody.
//   enforce  every peer: weapons (useItem + pickup), scrap pickup, doors / locks (interaction + host validators), voice + chat mute, compass, speed, vision overlay.
//   pay      when the ship lifts off with someone alive: bonus Clout (profile.addCoins) + hype (game.algo1.bump -> 'tfg:viewers').
// Net (prefix 'rd'): 'rds' host -> everyone {k:'set', cur:{card,holder,all}|null} (re-sent every 10 s so late joiners get it) | {k:'pay', cur, alive:[ids]} | {k:'say', s, v}.
import { RNG } from '../core/rng.js';
import { t, tf } from '../core/i18n.js';
import { hudDock } from '../ui/dock.js';
import { MOONS } from './moons.js';
import * as K from './roledays_core.js';
import './roledays_i18n.js';

const CSS = `.rd-card{pointer-events:none;width:260px;padding:8px 10px;background:rgba(18,19,13,.88);border:2px solid #f2c230;color:#e8e6d0;font:600 12px/1.3 'Bahnschrift','Arial Narrow',Arial,sans-serif;box-shadow:0 0 0 2px #12130d}
.rd-card .h{display:flex;justify-content:space-between;align-items:center;gap:8px;text-transform:uppercase;letter-spacing:.05em}
.rd-card .n{font-size:14px;margin:3px 0 2px;text-transform:uppercase}.rd-card .d{font-weight:500;color:#b9b7a0}.rd-card .b{margin-top:4px;color:#59e06a}
.rd-card .me{background:#f2c230;color:#111;padding:0 6px}.rd-card .pend{opacity:.75}`;

export function installRoledays(game) {
  const mods = game.mods;
  const offs = [], restores = [];
  let disposed = false, boundNet = null, style = null, dock = null, ov = null;
  const S = { cur: null, active: false, wasActive: false, rolledKey: null, orbitT: 0, syncT: 0, paid: false, vmuted: false, vprev: false, nv: null, hudWrapped: false, said: false };
  const host = () => !!game.isHost;
  const run = () => game.run;
  const me = () => game.selfId;
  const enabled = () => game.config?.roledays !== false;
  const rd = () => { const r = run(); return r ? (r.rd = r.rd || { lastDay: null }) : null; };
  const cur = () => (S.active ? S.cur : null);   // enforcement only while the ship is on the moon
  const ok = (id, fn, ...a) => !cur() || fn(cur(), id, ...a);
  const roleOf = (id) => { try { return game.rpg?.roleOf?.(id) || null; } catch { return null; } };
  const nameOf = (id) => { try { return game.playerName?.(id) || String(id); } catch { return String(id); } };

  // ------------------------------------------------------------ net
  const send = (d) => { try { game.net.broadcast('rds', d); } catch { /* net closing */ } };
  function onMsg(m, fromId) {
    if (disposed || !m || typeof m.k !== 'string' || (fromId !== game.selfId && fromId !== game.net?.hostId)) return;
    if (m.k === 'set') { S.cur = m.cur && K.CARDS[m.cur.card] ? { card: m.cur.card, holder: m.cur.holder ?? null, all: !!m.cur.all } : null; game.refreshStats?.(); paint(); }
    else if (m.k === 'say') { try { game.lore?.say?.(tf(m.s, m.v || {})); } catch { /* lore optional */ } }
    else if (m.k === 'pay') {
      if (!Array.isArray(m.alive) || !m.alive.includes(me()) || !m.cur) return;
      const n = K.payFor(m.cur, me());
      if (n > 0) { try { game.progress?.addCoins?.(n, 'Role day'); game.ui?.toast?.(tf('Role day done: +{n} Clout.', { n }), 'good'); } catch { /* ui optional */ } }
    }
  }
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:rds', onMsg);
    boundNet = net; net.on('msg:rds', onMsg);
  }
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  const sayAll = (s, v) => send({ k: 'say', s, v });

  // ------------------------------------------------------------ HUD (ui2 classes)
  function paint() {
    if (typeof document === 'undefined') return;
    const c = S.cur, r = run();
    const show = !!c && (r?.phase === 'orbit' || S.active);
    if (!show) { if (dock) dock.style.display = 'none'; return; }
    if (!style) { style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style); }
    if (!dock) dock = hudDock('right', 'roledays', 12);
    const def = K.CARDS[c.card];
    const mine = c.all || c.holder === me();
    const who = c.all ? t('WHOLE CREW') : mine ? t('YOU') : tf('Holder: {n}', { n: nameOf(c.holder) });
    const html = `<div class="rd-card tfg-card${S.active ? '' : ' pend'}"><div class="h"><span class="tfg-tag">${t('ROLE DAY')}</span><span class="${mine ? 'me' : ''}">${esc(who)}</span></div>`
      + `<div class="n">${esc(t(def.name))}</div><div class="d">${esc(t(def.short))}</div><div class="b">${esc(tf('Bonus: +{n} Clout if you finish the day', { n: K.payFor(c, me()) }))}</div></div>`;
    dock.style.display = '';
    if (dock.dataset.h !== html) { dock.dataset.h = html; dock.innerHTML = html; }
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------ enforcement (client hooks + host validators)
  const wrap = (obj, name, make) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w;
    restores.push(() => { if (obj[name] === w) { if (had) obj[name] = orig; else delete obj[name]; } });
  };
  const toast = (s) => { try { game.ui?.toast?.(t(s), 'bad'); game.sfx?.('ui_error', 0.4); } catch { /* ui optional */ } };

  offs.push(mods.on('useItem', (it, hk, g) => {
    if (g !== game || !it || !hk || it.def?.kind !== 'weapon' || ok(me(), K.canHoldWeapon)) return;
    hk.handled = true; toast('You cannot hold weapons today.');
  }));
  wrap(game, 'pickup', (orig) => function (it) {
    if (it && !ok(me(), K.canPickup, it.def)) { toast(it.def?.kind === 'weapon' ? 'You cannot hold weapons today.' : 'You cannot pick that up today.'); return undefined; }
    return orig.call(this, it);
  });
  wrap(game, 'doorInteraction', (orig) => function (door) {
    if (door && !ok(me(), K.canOpenDoor) && door.kind !== 'blast' && !door.teleport && !(door.kind === 'door' && door.open)) {
      return { label: t('Locked'), sub: t('Only the Mechanic'), action: () => toast('Only the Mechanic can do this today.') };
    }
    return orig.call(this, door);
  });
  offs.push(mods.on('interactables', (out, g) => {   // vault keypad
    if (g !== game || !Array.isArray(out) || ok(me(), K.canOpenDoor)) return;
    const lab = t('Crack the vault keypad [E]');
    for (const o of out) if (o && o.label === lab) o.action = () => toast('Only the Mechanic can do this today.');
  }));
  wrap(game, 'sendChat', (orig) => function (text, ...rest) {
    if (typeof text === 'string' && !text.startsWith('/') && !ok(me(), K.canSpeak)) { toast('You cannot speak today. Ping or emote.'); return undefined; }
    return orig.call(this, text, ...rest);
  });
  offs.push(mods.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    const guard = (type, test) => {
      const prev = game.net.handlers.get(type);
      if (prev) H(type, (d, from) => { if (host() && cur() && !test(d, from)) return; prev(d, from); });
    };
    guard('door', (d, from) => !d?.open || K.canOpenDoor(cur(), from));
    guard('unlock', (d, from) => K.canOpenDoor(cur(), from));
    guard('vault', (d, from) => K.canOpenDoor(cur(), from));
    guard('pick', (d, from) => { const it = game.items?.get?.(d?.id); return !it || K.canPickup(cur(), from, it.def); });
  }));
  offs.push(mods.on('stats', (st, g) => {
    if (g !== game || !st || !cur()) return;
    const m = K.speedMulFor(cur(), me());
    if (m !== 1) st.speedMul = (st.speedMul || 1) * m;
  }));
  function wrapHud() {
    const hud = game.ui?.hud;
    if (disposed || S.hudWrapped || !hud || typeof hud.drawCompass !== 'function') return;
    S.hudWrapped = true;
    wrap(hud, 'drawCompass', (orig) => function (g) {
      if (!ok(me(), K.showCompass)) { this.$?.compass?.classList.add('hidden'); return undefined; }
      return orig.call(this, g);
    });
  }

  // ------------------------------------------------------------ local per-frame effects: vision overlay, voice mute
  function vision(mode) {
    if (typeof document === 'undefined') return;
    if (S.nv === mode) return;
    const U = game.engine?.postMat?.uniforms;
    if (S.nv === 'night' && U && S.base) { U.uGamma.value = S.base.gamma; U.uVignette.value = S.base.vig; S.base = null; }
    S.nv = mode;
    if (!mode) { ov?.remove(); ov = null; return; }
    if (!ov) { ov = document.createElement('div'); (document.getElementById('ui') || document.body).appendChild(ov); }
    if (mode === 'blind') ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 8%,rgba(0,0,0,.72) 38%,rgba(0,0,0,.97) 70%)';
    else {
      ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;background:rgba(40,255,120,.10);mix-blend-mode:screen';
      if (U) { S.base = { gamma: U.uGamma.value, vig: U.uVignette.value }; U.uGamma.value = S.base.gamma * 1.55; U.uVignette.value = S.base.vig * 0.45; }
    }
  }
  function localFx() {
    wrapHud();
    const ph = run()?.phase; S.active = !!S.cur && (ph === 'landing' || ph === 'moon');   // derived on every peer, so late joiners enforce too
    vision(cur() ? K.visionFor(cur(), me()) : null);
    const n = game.time || 0; if (n - (S.paintT || 0) > 0.5) { S.paintT = n; paint(); }
    const v = game.voice;
    if (v) {
      const mute = !!cur() && !K.canSpeak(cur(), me());
      if (mute) { if (!S.vmuted) { S.vmuted = true; S.vprev = !!v.muted; } v.muted = true; }
      else if (S.vmuted) { S.vmuted = false; v.muted = S.vprev; }
    }
  }

  // ------------------------------------------------------------ host: roll, assign, announce, pay
  const crew = () => (game.aiPlayers?.() || []).map((p) => ({ id: p.id, role: roleOf(p.id), dead: !!p.dead }));
  const bcast = () => send({ k: 'set', cur: S.cur });
  function hostRoll() {
    const r = run(), st = rd(); if (!r || !st) return;
    const key = `${r.runId ?? 'x'}:${r.day}`;
    S.rolledKey = key;
    const rng = new RNG(((r.seed | 0) ^ 0x40d5 ^ ((r.day | 0) * 7919)) >>> 0);
    const players = crew();
    const ctx = { quotaIndex: r.quotaIndex | 0, difficulty: game.config?.difficulty, company: !!MOONS[r.moon]?.company, lastDay: st.lastDay, day: r.day, roll: rng.next() };
    if (!enabled() || !K.dayEligible(ctx)) { S.cur = null; bcast(); return; }
    const id = K.pickCard(players.length, () => rng.next(), st.lastCard);
    const a = id ? K.assign(id, players, r.day) : null;
    S.cur = a; S.paid = false; S.said = false;
    if (a) { st.lastDay = r.day; st.lastCard = id; }
    bcast(); game.refreshStats?.(); paint();
    if (a) game.later(() => { if (!disposed && S.cur && run()?.phase === 'orbit') sayAll('Tomorrow, casting call: {@n}. {@l}', { n: K.CARDS[a.card].name, l: K.CARDS[a.card].line }); }, 9000);
  }
  function hostPay() {
    if (!S.cur || S.paid) return;
    S.paid = true;
    const alive = crew().filter((p) => !p.dead).map((p) => p.id);
    if (!alive.length) return;
    send({ k: 'pay', cur: S.cur, alive });
    sayAll('Constraint met. The feed adores you. Do not let it go to your head.');
    try { game.algo1?.bump?.(K.T.hype, 'roleday'); } catch { /* algo1 optional */ }
  }
  function endDay(pay) {
    if (pay && host()) hostPay();
    S.active = false; S.wasActive = false;
    if (host()) { S.cur = null; bcast(); }
    game.refreshStats?.(); paint();
  }
  offs.push(mods.on('phase', (ph, g) => {
    if (g && g !== game) return;
    if (ph === 'landing') {
      const c = MOONS[run()?.moon];
      if (host() && S.cur && (c?.company || c?.home)) { S.cur = null; bcast(); }
      S.active = !!S.cur; S.wasActive = S.active; S.paid = false;
      if (host() && S.cur) {
        const a = S.cur;
        if (!crew().some((p) => p.id === a.holder) && !a.all) { S.cur = K.assign(a.card, crew(), run().day); bcast(); }
        game.later(() => { if (!disposed && S.active && S.cur) sayAll('Role day: {@n}. {@l}', { n: K.CARDS[S.cur.card].name, l: K.CARDS[S.cur.card].line }); }, 6000);
      }
      game.refreshStats?.(); paint();
    } else if (ph === 'takeoff') { if (S.wasActive) endDay(true); }
    else if (ph === 'fired') { endDay(false); }
    else if (ph === 'orbit') { if (S.wasActive) endDay(true); S.orbitT = 0; paint(); }
  }));
  offs.push(mods.on('update', (dt, g) => {
    if (disposed || (g && g !== game)) return;
    localFx();
    if (!host() || !enabled()) return;
    const r = run(); if (!r) return;
    if (r.phase === 'orbit') {
      S.orbitT += dt;
      const key = `${r.runId ?? 'x'}:${r.day}`;
      if (S.orbitT > 8 && S.rolledKey !== key) hostRoll();
    }
    S.syncT += dt;
    if (S.syncT >= 10) { S.syncT = 0; if (S.cur) bcast(); }   // late joiners
  }));

  return {
    state: S, K,
    /** debug: force a card for the coming / current day (host) */
    debug: {
      force(card) { const a = K.assign(card, crew(), run()?.day | 0); S.cur = a; if (run()?.phase !== 'orbit') S.active = !!a; bcast(); game.refreshStats?.(); paint(); return a; },
      clear() { S.cur = null; S.active = false; bcast(); paint(); },
      roll: hostRoll,
    },
    dispose() {
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      try { boundNet?.off?.('msg:rds', onMsg); } catch { /* ignore */ }
      S.cur = null; S.active = false; localFx(); vision(null); dock?.remove(); style?.remove(); dock = style = null;
    },
  };
}
