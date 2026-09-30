// ROUTE BOARD (wave 8, module 'routeboard'; docs/wave8/routeboard.md; CRITIQUE_W8 P13 + REVIEW_W8_NIGHT item 12).
//   The terminal's MOONS wall becomes a board of 3 big ROUTE CARDS (palette + interior silhouette, danger pips, scrap-on-site payout, the moon's
//   hook, interior, weather, fee) + one HQ row. It opens by itself the first time the terminal is used in orbit, and on MOONS / ROUTES.
//   Keys: 1-3 cards, 4 HQ, arrows move, ENTER routes, TAB = ALL ROUTES (the old text list, also MOONS ALL), ESC = type commands; any letter
//   drops to the prompt. Mouse: click a card to select it, click its ROUTE button to go.
//   Campaign ladder (routeboard_core.js): a fresh staged profile starts with 3 hero moons, +2 routes per quota; veterans / Unlock everything /
//   Quick Shift are never gated. The HOST enforces it on ROUTE (terminal.hostExecute wrap); a joiner reads the host's ladder from run.hub.
// Net: none new (routing is the existing 'term' {op:'route'} request).
import { MOONS, MOON_ORDER, WEATHER, BIOMES } from './moons.js';
import { ITEMS, scrapTableFor } from './items.js';
import './herocontent_core.js';   // wave 8: the metro / greenhouse / prison / tower scrap tables (the payout estimate below reads scrapTableFor)
import { scrapCountFor, scrapValueMul, buyRate } from './progression.js';
import { dangerOf, dangerName, interiorName } from '../ui/hud.js';
import { AFFIX_BY_ID } from './mapmods_core.js';
import { wrapMethod } from './dailyEvents.js';
import { t, tf, tfIn, addTranslations } from '../core/i18n.js';
import { escapeHtml } from '../core/util.js';
import * as C from './routeboard_core.js';

const TEXT = {
  'rb.title': ['ROUTE BOARD', 'ROTA PANOSU', 'ДОСКА МАРШРУТОВ'],
  'rb.sub': ['Day {d} · quota ▮{s} / ▮{q} · {n} days left', 'Gün {d} · kota ▮{s} / ▮{q} · {n} gün kaldı', 'День {d} · квота ▮{s} / ▮{q} · осталось дней: {n}'],
  today: ['TODAY', 'BUGÜN', 'СЕГОДНЯ'],
  nextmap: ['NEXT LANDING', 'SONRAKİ İNİŞ', 'СЛЕДУЮЩАЯ ПОСАДКА'],
  danger: ['DANGER', 'TEHLİKE', 'ОПАСНОСТЬ'],
  payout: ['SCRAP ON SITE', 'SAHADAKİ HURDA', 'ХЛАМ НА МЕСТЕ'],
  interior: ['INTERIOR', 'İÇ MEKÂN', 'ИНТЕРЬЕР'],
  weather: ['WEATHER', 'HAVA', 'ПОГОДА'],
  cur: ['CURRENT ROUTE', 'MEVCUT ROTA', 'ТЕКУЩИЙ МАРШРУТ'],
  fresh: ['NEW', 'YENİ', 'НОВОЕ'],
  go: ['ROUTE HERE', 'BURAYA ROTA', 'ПРОЛОЖИТЬ СЮДА'],
  go_fee: ['ROUTE HERE · ▮{c}', 'BURAYA ROTA · ▮{c}', 'ПРОЛОЖИТЬ СЮДА · ▮{c}'],
  lever: ['ROUTED. PULL THE LEVER', 'ROTA HAZIR. KOLU ÇEK', 'МАРШРУТ ЗАДАН. ДЁРНИ РЫЧАГ'],
  orbit_only: ['Routing opens in orbit.', 'Rota yalnızca yörüngede seçilir.', 'Маршрут выбирается только на орбите.'],
  hq: ['0-ALGORITHM HQ · SELL SCRAP', '0-ALGORITHM HQ · HURDA SAT', '0-ALGORITHM HQ · ПРОДАТЬ ХЛАМ'],
  hq_rate: ['buying at {r}%', '%{r} fiyattan alıyor', 'скупка по {r}%'],
  keys: ['pick', 'seç', 'выбор'],
  k_route: ['route', 'rota', 'маршрут'],
  k_all: ['ALL ROUTES', 'TÜM ROTALAR', 'ВСЕ МАРШРУТЫ'],
  k_type: ['type commands', 'komut yaz', 'ввод команд'],
  next: ['Quota {n} opens: {list}', 'Kota {n} açar: {list}', 'Квота {n} откроет: {list}'],
  sector: ['UNCHARTED SECTOR: {n} servers (type SECTOR)', 'HARİTASIZ SEKTÖR: {n} sunucu (SECTOR yaz)', 'НЕИЗВЕСТНЫЙ СЕКТОР: серверов {n} (введи SECTOR)'],
  new_routes: ['NEW ROUTES OPEN: {list}', 'YENİ ROTALAR AÇILDI: {list}', 'ОТКРЫТЫ НОВЫЕ МАРШРУТЫ: {list}'],
  locked_route: ['{@m} is not on the Company route list yet: it opens at quota {n}. (Settings: Unlock everything.)', '{@m} henüz Şirket rota listesinde değil: {n}. kotada açılır. (Ayarlar: Her şeyin kilidini aç.)', '{@m} ещё нет в списке маршрутов Компании: откроется на квоте {n}. (Настройки: открыть всё.)'],
  lock_tag: ['LOCKED: QUOTA {n}', 'KİLİTLİ: KOTA {n}', 'ЗАКРЫТО: КВОТА {n}'],
  'rb.help': ['>MOONS        route board (MOONS ALL: the full list)', '>MOONS        rota panosu (MOONS ALL: tam liste)', '>MOONS        доска маршрутов (MOONS ALL: полный список)'],
};
const trMap = {}, ruMap = {};
for (const v of Object.values(TEXT)) { trMap[v[0]] = v[1]; ruMap[v[0]] = v[2]; }
for (const v of Object.values(C.HOOKS)) { trMap[v[0]] = v[1]; ruMap[v[0]] = v[2]; }
addTranslations(trMap);
addTranslations(ruMap, 'ru');
export const RB_TEXT = TEXT;
const x = (id) => t(TEXT[id][0]);
const xf = (id, v) => tf(TEXT[id][0], v || {});

const CSS = `.rb{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;gap:8px;padding:12px 14px;background:var(--t-ink,#0c0906);color:var(--t-paper,#ffd9b8);font:18px/1.2 var(--font,monospace);overflow:hidden}
.rb.hidden{display:none}
.rb-head{display:flex;align-items:center;gap:12px}
.rb-head .tfg-plate{font-size:20px}
.rb-sub{flex:1;font:700 15px var(--font2,sans-serif);letter-spacing:.06em;color:var(--t-line-hi,#c96);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rb-cred{font:700 18px var(--font2,sans-serif);color:var(--t-amber-hi,#ffb266)}
.rb-strip{display:flex;gap:14px;flex-wrap:wrap;font:700 14px var(--font2,sans-serif);letter-spacing:.05em;text-transform:uppercase}
.rb-strip b{color:var(--t-hazard,#ffb800);margin-right:6px}
.rb-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;flex:1;min-height:0}
.rb-card{display:flex;flex-direction:column;border:1px solid var(--t-line,#6a4a30);background:var(--t-panel,#120d08);cursor:pointer;min-height:0;overflow:hidden}
.rb-card.sel{border-color:var(--t-amber,#ff8a3d);box-shadow:0 0 0 1px var(--t-amber,#ff8a3d)}
.rb-art{position:relative;height:clamp(58px,15vh,92px);flex:none}
.rb-art svg{position:absolute;left:0;right:0;bottom:0;width:100%;height:78%;fill:#0a0806;opacity:.92}
.rb-art .rb-key{position:absolute;left:6px;top:6px}
.rb-art .rb-flag{position:absolute;right:6px;top:6px;background:var(--t-ink,#0c0906)}
.rb-body{display:flex;flex-direction:column;gap:5px;padding:7px 9px 8px;flex:1;min-height:0}
.rb-name{font:700 19px var(--font2,sans-serif);letter-spacing:.05em;text-transform:uppercase;color:var(--t-amber-hi,#ffb266);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rb-hook{font-size:16px;line-height:1.15;color:var(--t-paper,#ffd9b8);min-height:2.3em;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.rb-rows{display:grid;grid-template-columns:auto 1fr;gap:1px 8px;font-size:16px;margin-top:auto}
.rb-rows span{font:700 12px var(--font2,sans-serif);letter-spacing:.08em;color:var(--t-line-hi,#c96);align-self:center}
.rb-rows b{font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rb-pips{display:inline-flex;gap:2px;margin-right:6px;vertical-align:1px}
.rb-pips i{width:9px;height:9px;border:1px solid var(--t-line-hi,#c96)}
.rb-pips i.on{background:var(--t-bad,#ff5a48);border-color:var(--t-bad,#ff5a48)}
.rb-go{margin-top:6px;padding:4px 6px;text-align:center;font:700 14px var(--font2,sans-serif);letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--t-line-hi,#c96);color:var(--t-paper,#ffd9b8)}
.rb-card.sel .rb-go{background:var(--t-amber,#ff8a3d);color:#120800;border-color:var(--t-amber,#ff8a3d)}
.rb-card.cur .rb-go{background:transparent;color:var(--t-good,#7dff7d);border-color:var(--t-good,#7dff7d)}
.rb-hq{display:flex;align-items:center;gap:10px;padding:5px 9px;border:1px solid var(--t-line,#6a4a30);cursor:pointer;font:700 15px var(--font2,sans-serif);letter-spacing:.06em;text-transform:uppercase}
.rb-hq.sel{border-color:var(--t-amber,#ff8a3d);box-shadow:0 0 0 1px var(--t-amber,#ff8a3d)}
.rb-hq em{font-style:normal;color:var(--t-line-hi,#c96);margin-left:auto}
.rb-foot{display:flex;gap:12px;align-items:center;flex-wrap:wrap;font:700 13px var(--font2,sans-serif);letter-spacing:.05em;text-transform:uppercase;color:var(--t-line-hi,#c96)}
.rb-foot .rb-all{cursor:pointer;color:var(--t-paper,#ffd9b8)}
.rb-foot .rb-next{margin-left:auto;color:var(--t-warn,#ffc233)}
.rb-msg{font-size:15px;color:var(--t-warn,#ffc233)}`;

export function installRouteboard(game) {
  const mods = game.mods, term = game.terminal;
  if (!mods || !term) return null;
  const offs = [], restores = [];
  let disposed = false, style = null, el = null, sel = 0, cards = [], bypass = false, autoShown = false, lastQ = null, pollT = 0;
  const avgCache = new Map();
  const warn = (tag, e) => { try { console.warn('[routeboard] ' + tag, e); } catch { /* ignore */ } };
  const sfx = (n, v = 0.4) => { try { game.sfx?.(n, v); } catch { /* unknown sound */ } };
  const run = () => game.run || {};
  const fr = () => game.onboard?.fr;

  // ------------------------------------------------------------------------------------------------ ladder
  /** { all:false, q } or null (= nothing gated): Quick Shift, veterans ('all' ladder), host Unlock everything, no onboard module */
  function hub() {
    const r = game.run;
    if (!r || r.quick) return null;
    if (game.isHost && game.settings?.unlockAll) return null;
    const h = !game.isHost && r.hub ? r.hub : game.onboard?.unlocks?.();
    if (!h || h.mode !== 'staged') return null;
    return { all: false, q: Math.max(h.q | 0, r.quotaIndex | 0) };
  }
  const moons = () => MOON_ORDER.map((id) => MOONS[id]).filter(Boolean);
  const routeOpen = (m) => C.routeOpen(m, hub());
  function lockTag(m) { const h = hub(); return m && !C.routeOpen(m, h) ? '  [' + xf('lock_tag', { n: C.routeQ(m) }) + ']' : ''; }

  // host: ROUTE to a moon the ladder has not opened yet is refused (terminal ROUTE, board, voyage jobs)
  restores.push(wrapMethod(term, 'hostExecute', (orig) => function (cmd, from) {
    if (!disposed && cmd && cmd.op === 'route') {
      const m = MOONS[cmd.moon];
      if (m && !routeOpen(m)) {
        const k = TEXT.locked_route[0], v = { m: m.$name || m.name, n: C.routeQ(m) };
        try { game.net.sendTo(from, 'term', { to: from, text: tfIn('en', k, v), k, v, err: true, cls: 'err' }); } catch (e) { warn('reply', e); }
        return undefined;
      }
    }
    return orig.call(this, cmd, from);
  }));

  // ------------------------------------------------------------------------------------------------ card data
  function avgOf(theme) {
    if (!avgCache.has(theme)) avgCache.set(theme, C.tableAvg(scrapTableFor(theme), (id) => ITEMS[id]?.value));
    return avgCache.get(theme);
  }
  function feeOf(m) {
    const free = !!game.config?.freeTravel;
    try { if (game.shipyard?.routeFee) return game.shipyard.routeFee(m, free) | 0; } catch { /* optional */ }
    return free ? 0 : m.cost | 0;
  }
  function cardData(m) {
    const r = run(), q = r.quotaIndex | 0;
    const wid = r.forecast?.[m.id] || 'clear';
    const w = WEATHER[wid] || WEATHER.clear;
    const ev = fr()?.allow?.('dailyEvent') === false ? null : r.dailyEvent;
    const danger = dangerOf(m, { ...r, weather: wid }, ev);
    return {
      id: m.id, name: m.$name || m.name, hook: t(C.hookOf(m)), interior: interiorName(m), weather: t(w.name), wcol: w.color || '#ccc',
      danger, dname: dangerName(danger), pay: C.payout(m, q, avgOf(m.interior || 'factory'), scrapCountFor, scrapValueMul), fee: feeOf(m),
      bands: C.bands(BIOMES[m.biome]), sil: C.silhouetteOf(m.interior), cur: m.id === r.moon, fresh: (hub()?.q | 0) > 0 && C.routeQ(m) === (hub()?.q | 0),
    };
  }
  function strip() {
    const r = run(), out = [];
    if (r.dailyEvent && fr()?.allow?.('dailyEvent') !== false) out.push(`<span><b>${escapeHtml(x('today'))}</b>${escapeHtml(t(r.dailyEvent.name || ''))}</span>`);
    const a = r.mm?.nxt?.a;
    if (Array.isArray(a) && a.length && fr()?.allow?.('mapmods') !== false && game.mapmods?.allowed?.() !== false) out.push(`<span><b>${escapeHtml(x('nextmap'))}</b>${a.map((id) => escapeHtml(t(AFFIX_BY_ID[id]?.name || id))).join(' · ')}</span>`);
    return out.length ? `<div class="rb-strip">${out.join('')}</div>` : '';
  }
  function cardHtml(c, i, orbit) {
    const [sky, fog, gnd] = c.bands;
    const pip = C.pips(c.danger).map((on) => `<i class="${on ? 'on' : ''}"></i>`).join('');
    const go = c.cur ? x('lever') : !orbit ? x('orbit_only') : c.fee ? xf('go_fee', { c: c.fee }) : x('go');
    const flag = c.cur ? `<span class="tfg-tag rb-flag">${escapeHtml(x('cur'))}</span>` : c.fresh ? `<span class="tfg-tag rb-flag" style="color:var(--t-good,#7dff7d)">${escapeHtml(x('fresh'))}</span>` : '';
    return `<div class="rb-card${i === sel ? ' sel' : ''}${c.cur ? ' cur' : ''}" data-i="${i}">
      <div class="rb-art" style="background:linear-gradient(${sky} 0 56%,${fog} 56% 72%,${gnd} 72%)"><svg viewBox="0 0 120 40" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><path fill-rule="evenodd" d="${c.sil}"/></svg><kbd class="tfg-kbd rb-key">${i + 1}</kbd>${flag}</div>
      <div class="rb-body"><div class="rb-name">${escapeHtml(c.name)}</div><div class="rb-hook">${escapeHtml(c.hook)}</div>
      <div class="rb-rows"><span>${escapeHtml(x('danger'))}</span><b><span class="rb-pips">${pip}</span>${escapeHtml(c.dname)}</b>
      <span>${escapeHtml(x('payout'))}</span><b class="tfg-num">▮${c.pay[0]}–${c.pay[1]}</b>
      <span>${escapeHtml(x('interior'))}</span><b>${escapeHtml(c.interior)}</b>
      <span>${escapeHtml(x('weather'))}</span><b style="color:${escapeHtml(c.wcol)}">${escapeHtml(c.weather)}</b></div>
      <div class="rb-go" data-go="${i}">${escapeHtml(go)}${!c.cur && orbit ? ' <kbd class="tfg-kbd">ENTER</kbd>' : ''}</div></div></div>`;
  }
  function footNext() {
    const h = hub();
    if (!h) return '';
    const s = C.nextStep(h.q);
    if (!s) return '';
    const names = s.ids.map((id) => MOONS[id]).filter(Boolean).map((m) => m.$name || m.name);
    return names.length ? `<span class="rb-next">${escapeHtml(xf('next', { n: s.q, list: names.join(', ') }))}</span>` : '';
  }
  function render() {
    if (!el) return;
    const r = run(), orbit = r.phase === 'orbit';
    cards = C.pickCards(moons(), hub(), r).map(cardData);
    sel = Math.max(0, Math.min(sel, cards.length));   // cards.length = the HQ row
    const hq = MOONS.hq;
    const gen = moons().filter((m) => m.generated && !m.stale && routeOpen(m)).length;
    el.innerHTML = `<div class="rb-head"><span class="tfg-plate">${escapeHtml(x('rb.title'))}</span><span class="rb-sub">${escapeHtml(xf('rb.sub', { d: r.day ?? 1, s: r.sold | 0, q: r.quota | 0, n: r.daysLeft ?? 0 }))}</span><span class="rb-cred tfg-num">▮${(r.credits | 0).toLocaleString('en-US')}</span></div>
      <div class="tfg-hazard"></div>${strip()}
      <div class="rb-cards">${cards.map((c, i) => cardHtml(c, i, orbit)).join('')}</div>
      ${hq ? `<div class="rb-hq${sel === cards.length ? ' sel' : ''}" data-i="${cards.length}"><kbd class="tfg-kbd">${cards.length + 1}</kbd>${escapeHtml(x('hq'))}${r.moon === 'hq' ? ` <span class="tfg-tag">${escapeHtml(x('cur'))}</span>` : ''}<em>${escapeHtml(xf('hq_rate', { r: Math.round(buyRate(r.daysLeft, r.buyRnd) * 100) }))}</em></div>` : ''}
      ${gen ? `<div class="rb-msg">${escapeHtml(xf('sector', { n: gen }))}</div>` : ''}
      ${orbit ? '' : `<div class="rb-msg">${escapeHtml(x('orbit_only'))}</div>`}
      <div class="rb-foot"><span><kbd class="tfg-kbd">1-${cards.length + 1}</kbd> ${escapeHtml(x('keys'))}</span><span><kbd class="tfg-kbd">ENTER</kbd> ${escapeHtml(x('k_route'))}</span><span class="rb-all"><kbd class="tfg-kbd">TAB</kbd> ${escapeHtml(x('k_all'))}</span><span><kbd class="tfg-kbd">ESC</kbd> ${escapeHtml(x('k_type'))}</span>${footNext()}</div>`;
  }

  // ------------------------------------------------------------------------------------------------ board DOM + input
  function ensure() {
    if (el || typeof document === 'undefined') return !!el;
    term.ensureDom?.();
    const screen = term.el?.querySelector?.('.term-screen');
    if (!screen) return false;
    style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    el = document.createElement('div'); el.className = 'rb hidden';
    screen.appendChild(el);
    el.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();   // keep the keyboard focus in the terminal input (the key handler below lives on the terminal root)
      try { term.inp?.focus(); } catch { /* gone */ }
      const go = e.target.closest?.('[data-go]'), card = e.target.closest?.('[data-i]');
      if (go) { sel = +go.dataset.go; route(); return; }
      if (e.target.closest?.('.rb-all')) { showAll(); return; }
      if (card) { const i = +card.dataset.i; if (i === sel && i === cards.length) { route(); return; } sel = i; sfx('ui_click', 0.3); render(); }
    });
    // capture on the terminal root: runs before the input's own keydown (which would submit / close)
    const onKey = (e) => {
      if (!visible()) return;
      const k = e.key;
      const n = /^[1-9]$/.test(k) ? +k - 1 : -1;
      if (n >= 0 && n <= cards.length) { sel = n; sfx('ui_click', 0.3); render(); }
      else if (k === 'ArrowRight' || k === 'ArrowDown') { sel = (sel + 1) % (cards.length + 1); render(); }
      else if (k === 'ArrowLeft' || k === 'ArrowUp') { sel = (sel + cards.length) % (cards.length + 1); render(); }
      else if (k === 'Enter') route();
      else if (k === 'Tab') showAll();
      else if (k === 'Escape') hide();
      else { if (k.length === 1) hide(); return; }   // typing a command: the board steps aside, the key reaches the prompt
      e.preventDefault(); e.stopPropagation();
    };
    term.el.addEventListener('keydown', onKey, true);
    offs.push(() => term.el?.removeEventListener('keydown', onKey, true));
    return true;
  }
  const visible = () => !!el && !el.classList.contains('hidden') && !!term.active;
  function show() {
    if (disposed) return false;
    if (!term.active) term.open();
    if (!ensure()) return false;
    const r = run();
    const idx = C.pickCards(moons(), hub(), r).findIndex((m) => m.id === r.moon);
    sel = idx >= 0 ? idx : 0;   // the current route is preselected: ENTER on it = "pull the lever" (Hiring Day's first route)
    render();
    el.classList.remove('hidden');
    return true;
  }
  function hide() {
    if (!el) return;
    el.classList.add('hidden');
    try { game.onboard?.note?.('terminal'); } catch { /* optional */ }
    setTimeout(() => { try { term.inp?.focus(); } catch { /* gone */ } }, 0);
  }
  function showAll() { hide(); bypass = true; try { term.print('> MOONS ALL', 'echo'); term.exec('moons'); } finally { bypass = false; } }
  function route() {
    const r = run();
    const m = sel === cards.length ? MOONS.hq : MOONS[cards[sel]?.id];
    if (!m) return;
    if (r.phase !== 'orbit') { sfx('ui_error', 0.4); return; }
    if (m.id === r.moon) { hide(); term.print(tf('Already routed to {name}.', { name: m.name })); return; }
    hide();
    term.print('> ROUTE ' + String(m.short || m.name).toUpperCase(), 'echo');
    sfx('terminal_enter', 0.4);
    game.net?.request?.('term', { cmd: { op: 'route', moon: m.id } });
  }

  // MOONS / MOON / ROUTES open the board; MOONS ALL keeps the old list (voyage's MOONS wrapper passes through here with `bypass`)
  restores.push(wrapMethod(term, 'exec', (orig) => function (cmd) {
    if (!disposed && !bypass) {
      const [w0, ...rest] = String(cmd || '').toLowerCase().trim().split(/\s+/);
      if (['moons', 'moon', 'routes', 'board'].includes(w0)) {
        if (rest[0] === 'all' || rest[0] === 'list') { bypass = true; try { return orig.call(this, 'moons'); } finally { bypass = false; } }
        if (!rest.length) { show(); return undefined; }
      }
    }
    return orig.call(this, cmd);
  }));
  // the first terminal visit of every orbit opens on the board
  restores.push(wrapMethod(term, 'open', (orig) => function (...a) {
    const was = this.active;
    const r = orig.apply(this, a);
    if (!disposed && !was && this.active && !autoShown && game.run?.phase === 'orbit') { autoShown = true; try { show(); } catch (e) { warn('show', e); } }
    else if (!was && el) el.classList.add('hidden');   // a later visit opens on the prompt (MOONS brings the board back)
    return r;
  }));
  offs.push(mods.on('phase', (ph, g) => { if (g && g !== game) return; if (ph === 'orbit') autoShown = false; if (visible()) render(); }));

  // "NEW ROUTES OPEN" when the ladder moves (every peer, from its own view of the ladder)
  offs.push(mods.on('update', (dt, g) => {
    if (disposed || (g && g !== game)) return;
    pollT -= dt;
    if (pollT > 0) return;
    pollT = 1;
    const h = hub();
    const q = h ? h.q | 0 : null;
    if (q !== null && lastQ !== null && q > lastQ) {
      const ids = [];
      for (let k = lastQ + 1; k <= q; k++) ids.push(...C.openedAt(moons(), k));
      const names = ids.map((id) => MOONS[id]?.name).filter(Boolean);
      if (names.length) { try { game.ui?.toast?.(xf('new_routes', { list: names.join(', ') }), 'good'); } catch { /* optional */ } }
    }
    lastQ = q;
  }));

  return {
    show, hide, visible, render, routeOpen, lockTag, hub,
    cards: () => C.pickCards(moons(), hub(), run()).map((m) => m.id),
    data: () => C.pickCards(moons(), hub(), run()).map(cardData),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of offs) { try { o(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      el?.remove(); style?.remove(); el = null;
    },
  };
}
