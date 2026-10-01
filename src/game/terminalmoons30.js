// The ship's searchable dispatch directory. Routes still go through Terminal's
// confirmation and the existing authoritative host request, never a UI wallet.
import { MOONS, MOON_ORDER, WEATHER } from './moons.js';
import { ensureSector, sectorMoons } from './moongen.js';
import { scrapCountFor, scrapValueMul, buyRate } from './progression.js';
import { dangerOf, dangerName, interiorName } from '../ui/hud.js';
import { normalizeMoonQuery30, moonQueryKeys30, shortMoonAlias30 } from './moonroute30.js';
import { t, tf, addTranslations, getLang, onLangChange } from '../core/i18n.js';
import { escapeHtml } from '../core/util.js';

const TEXT = {
  title: ['MOON DIRECTORY', 'AY REHBERİ', 'КАТАЛОГ ЛУН'],
  search: ['Search names, short names or IDs', 'Ad, kısa ad veya kimlik ara', 'Поиск по имени, краткому имени или ID'],
  all: ['All routes', 'Tüm rotalar', 'Все маршруты'],
  open: ['Available routes', 'Uygun rotalar', 'Доступные маршруты'],
  free: ['Free routes', 'Ücretsiz rotalar', 'Бесплатные маршруты'],
  charter: ['Charted', 'Haritalanmış', 'Известные'],
  generated: ['Current sector', 'Mevcut sektör', 'Текущий сектор'],
  commands: ['Type commands', 'Komut yaz', 'Ввод команд'],
  choose: ['Select a moon to inspect its route.', 'Rotasını incelemek için bir ay seç.', 'Выберите луну для просмотра маршрута.'],
  none: ['No matching routes. Try a shorter name or clear the filters.', 'Eşleşen rota yok. Daha kısa ad dene veya filtreleri temizle.', 'Нет подходящих маршрутов. Сократите имя или сбросьте фильтры.'],
  alias: ['Short command', 'Kısa komut', 'Краткая команда'],
  id: ['Route ID', 'Rota kimliği', 'ID маршрута'],
  fee: ['Actual routing fee', 'Gerçek rota ücreti', 'Стоимость маршрута'],
  stock: ['Estimated loose scrap', 'Tahmini serbest hurda', 'Примерно свободного хлама'],
  estimate: ['Estimates are before room capacity, bonus loot and daily events.', 'Tahminler oda kapasitesi, ek ganimet ve günlük olaylardan öncedir.', 'Оценки до учёта вместимости комнат, бонусной добычи и событий дня.'],
  value: ['Base scrap value', 'Temel hurda değeri', 'Базовая ценность хлама'],
  go: ['ROUTE · confirm next', 'ROTA · ardından onayla', 'МАРШРУТ · затем подтвердить'],
  cur: ['CURRENT ROUTE · pull the lever', 'MEVCUT ROTA · kolu çek', 'ТЕКУЩИЙ МАРШРУТ · дёрните рычаг'],
  info: ['Print INFO', 'INFO yazdır', 'Вывести INFO'],
  slots: ['#n refers only to the displayed current sector. Buttons use route IDs.', '#n yalnızca gösterilen mevcut sektörü belirtir. Düğmeler rota kimliği kullanır.', '#n относится только к показанному текущему сектору. Кнопки используют ID маршрутов.'],
  ambiguous: ['More than one moon matches "{q}". Choose a full name, route ID or current-sector #n:', '"{q}" birden fazla ayla eşleşiyor. Tam ad, rota kimliği veya mevcut sektörün #n kodunu seç:', '«{q}» подходит нескольким лунам. Укажите полное имя, ID или #n текущего сектора:'],
  changed: ['The sector changed. Type MOONS and choose the destination again.', 'Sektör değişti. MOONS yaz ve hedefi yeniden seç.', 'Сектор изменился. Введите MOONS и выберите цель заново.'],
};
for (const [lang, idx] of [['tr', 1], ['ru', 2]]) addTranslations(Object.fromEntries(Object.values(TEXT).map(v => [v[0], v[idx]])), lang);
export const MOON_DIRECTORY_TEXT30 = TEXT;
export const moonNames30 = m => [t(m.name || ''), t(m.$name || ''), t(m.short || '')];
export const directoryMoons30 = () => MOON_ORDER.map(id => MOONS[id]).filter(m => m && !m.stale && !m.deadletter && !m.deadletter24);
export function routeFee30(game, moon) {
  return game.shipyard?.routeFee ? game.shipyard.routeFee(moon, !!game.config?.freeTravel) : game.config?.freeTravel ? 0 : moon.cost || 0;
}
export function routeReason30(game, m) {
  const r = game.run || {};
  if (r.phase !== 'orbit') return t('Routing is only possible while in orbit.');
  const cycle = game.cycle?.routeBlocked?.(m);
  if (cycle) return t(cycle);
  const onboard = game.onboard?.routeBlocked?.(m);
  if (onboard) return tf(onboard.k, onboard.v || {});
  const lock = game.routeboard?.lockTag?.(m);
  if (lock) return lock.trim();
  if (r.daysLeft <= 0 && !m.company) return t('Deadline reached: only 0-Algorithm HQ is available.');
  if ((r.credits || 0) < routeFee30(game, m)) return t('Insufficient credits.');
  return '';
}

export function moonDirectoryData30(game) {
  const r = game.run || {}, sector = ensureSector(r), moons = directoryMoons30(), generated = sectorMoons();
  return { sector, rows: moons.map(m => {
    const weatherId = r.forecast?.[m.id] || 'clear';
    const ordinary = !m.company && !m.home && !m.expedition && !m.instance && Array.isArray(m.scrapCount);
    return { moon: m, id: m.id, name: t(m.$name || m.name), short: m.short || '', alias: shortMoonAlias30(m, moons, generated, moonNames30),
      slot: m.generated ? generated.findIndex(x => x.id === m.id) + 1 : 0, current: m.id === r.moon,
      fee: routeFee30(game, m), reason: routeReason30(game, m), weather: t(WEATHER[weatherId]?.name || 'Clear'),
      danger: dangerName(dangerOf(m, { ...r, weather: weatherId }, r.dailyEvent)), interior: interiorName(m),
      stock: ordinary ? m.scrapCount.map(n => scrapCountFor(n, r.quotaIndex)) : null,
      valueMul: ordinary ? (m.scrapMul || 1) * scrapValueMul(r.quotaIndex) : null };
  }) };
}

const CSS = `.tm30{position:absolute;inset:0;z-index:6;display:flex;flex-direction:column;gap:10px;padding:14px;background:var(--t-ink,#0c0906);color:var(--t-paper,#ffd9b8);font:18px/1.2 var(--font,monospace)}
.tm30.hidden{display:none}.tm30 button,.tm30 input,.tm30 select{font:inherit;color:inherit;background:var(--t-panel,#120d08);border:1px solid var(--t-line,#6a4a30);padding:5px 8px;min-width:0}.tm30 button{cursor:pointer}.tm30 button:hover,.tm30 button:focus-visible{border-color:var(--t-amber,#ff8a3d)}.tm30 button:disabled{opacity:.55;cursor:default}.tm30-head,.tm30-tools,.tm30-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.tm30-head strong{color:var(--t-amber-hi,#ffb266);font:700 18px var(--font2,sans-serif)}.tm30-head span{flex:1;min-width:0;overflow-wrap:anywhere}.tm30-tools input{flex:1;min-width:140px}.tm30-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;flex:1;min-height:0}.tm30-list,.tm30-detail{overflow:auto;min-height:0;scrollbar-width:thin}.tm30-row{display:block;width:100%;text-align:left;margin-bottom:6px}.tm30-row.sel{border-color:var(--t-amber,#ff8a3d);background:var(--t-panel-hi,#21170d)}.tm30-row b{display:block;font-size:19px;color:var(--t-amber-hi,#ffb266);overflow-wrap:anywhere}.tm30-row span{display:block;font-size:16px;margin-top:3px}.tm30-row small{display:block;font-size:15px;color:var(--t-line-hi,#c96);overflow-wrap:anywhere}.tm30-detail h3{margin:0 0 8px;font-size:22px;overflow-wrap:anywhere}.tm30-meta{margin:0 0 8px;white-space:pre-wrap}.tm30-info{white-space:pre-wrap;font:18px/1.25 var(--font,monospace);margin:10px 0}.tm30-note{font-size:15px;color:var(--t-line-hi,#c96);overflow-wrap:anywhere}.tm30-reason{color:var(--t-warn,#ffc233)}.tm30-actions{margin-top:10px}.tm30-actions .tm30-route{border-color:var(--t-amber,#ff8a3d);color:var(--t-amber-hi,#ffb266)}
@media(max-width:720px){.tm30{padding:10px;gap:7px;font-size:17px}.tm30-columns{grid-template-columns:1fr;grid-template-rows:minmax(100px,.9fr) minmax(140px,1fr)}.tm30-head span{font-size:15px}.tm30-info{font-size:17px}.tm30-note{font-size:14px}}`;

export function createTerminalMoons30(term) {
  const game = term.game;
  let el = null, selected = null, query = '', filter = 'all', rows = [], offs = [], poll = 0, signature = '';
  const visible = () => !!el && !el.classList.contains('hidden') && term.active;
  const label = key => t(TEXT[key][0]);
  const filtered = () => {
    const q = normalizeMoonQuery30(query);
    const slotQuery = query.trim().startsWith('#'), slot = /^#\s*(\d+)$/.exec(query.trim());
    return rows.filter(c => (slotQuery ? !!c.slot && !!slot && c.slot === Number(slot[1]) : !q || moonQueryKeys30(c.moon, moonNames30(c.moon)).some(k => k.includes(q))) &&
      (filter !== 'open' || !c.reason) && (filter !== 'free' || c.fee === 0) && (filter !== 'charter' || !c.moon.generated) && (filter !== 'generated' || c.moon.generated));
  };
  function hide(focus = true) {
    el?.classList.add('hidden');
    for (const off of offs.splice(0)) off?.();
    if (focus) term.inp?.focus();
  }
  function render(force = false) {
    if (!el || !visible()) return;
    const data = moonDirectoryData30(game), r = game.run || {};
    const sig = JSON.stringify([getLang(), r.moon, r.phase, r.credits, r.daysLeft, data.sector?.key, query, filter,
      data.rows.map(c => [c.id, c.name, c.alias, c.fee, c.reason, c.weather, c.danger, c.stock, c.valueMul]), r.dailyEvent, selected]);
    if (!force && sig === signature) return;
    signature = sig; rows = data.rows;
    const shown = filtered();
    if (!shown.some(c => c.id === selected)) selected = shown.find(c => c.current)?.id || shown[0]?.id || null;
    const current = MOONS[r.moon];
    el.querySelector('.tm30-title').textContent = label('title');
    el.querySelector('.tm30-current').textContent = t('CURRENT ROUTE') + ': ' + t(current?.$name || current?.name || '—') + ' · ▮' + (r.credits || 0).toLocaleString('en-US');
    const search = el.querySelector('.tm30-search'); search.placeholder = label('search'); search.setAttribute('aria-label', label('search'));
    const select = el.querySelector('.tm30-filter');
    select.innerHTML = ['all','open','free','charter','generated'].map(k => `<option value="${k}">${escapeHtml(label(k))}</option>`).join(''); select.value = filter;
    el.querySelector('.tm30-commands').textContent = label('commands');
    el.querySelector('.tm30-sector').textContent = (data.sector?.name || '') + ' · ' + label('slots');
    term.displayedSectorKey30 = data.sector?.key;
    el.querySelector('.tm30-list').innerHTML = shown.length ? shown.map(c => `<button type="button" class="tm30-row${c.id === selected ? ' sel' : ''}" data-moon="${escapeHtml(c.id)}" aria-pressed="${c.id === selected}"><b>${escapeHtml(c.name)}${c.current ? ' · ' + escapeHtml(t('CURRENT ROUTE')) : ''}</b><span>${escapeHtml(c.moon.company ? tf('buying at {r}%', {r: Math.round(buyRate(r.daysLeft,r.buyRnd)*100)}) : c.danger + ' · ' + c.weather)} · ${c.fee ? '▮' + c.fee.toLocaleString('en-US') : escapeHtml(t('FREE'))}</span><small>ROUTE ${escapeHtml(c.alias)}${c.slot ? ' · #' + c.slot : ''}${c.reason ? ' · ' + escapeHtml(c.reason) : ''}</small></button>`).join('') : `<p>${escapeHtml(label('none'))}</p>`;
    const c = shown.find(x => x.id === selected), detail = el.querySelector('.tm30-detail');
    if (!c) { detail.textContent = label('choose'); return; }
    const meta = `${label('alias')}: ROUTE ${c.alias}${c.slot ? ' / ROUTE #' + c.slot : ''}\n${label('id')}: ${c.id}\n${label('fee')}: ${c.fee ? '▮' + c.fee.toLocaleString('en-US') : t('FREE')}`;
    detail.innerHTML = `<h3>${escapeHtml(c.name)}</h3><p class="tm30-meta">${escapeHtml(meta)}</p>${c.stock ? `<p>${escapeHtml(label('stock'))}: ${c.stock.join('–')} · ${escapeHtml(label('value'))}: x${c.valueMul.toFixed(2)}</p><p class="tm30-note">${escapeHtml(label('estimate'))}</p>` : ''}<pre class="tm30-info">${escapeHtml(term.moonInfo(c.moon,r))}</pre><div class="tm30-reason">${escapeHtml(c.reason)}</div><div class="tm30-actions"><button type="button" class="tm30-route" data-action="route"${c.reason || c.current ? ' disabled' : ''}>${escapeHtml(label(c.current ? 'cur' : 'go'))}</button><button type="button" data-action="info">${escapeHtml(label('info'))}</button></div>`;
  }
  function ensure() {
    if (el) return true;
    if (typeof document === 'undefined') return false;
    term.ensureDom(); const screen = term.el?.querySelector('.term-screen');
    if (!screen) return false;
    el = document.createElement('section'); el.className = 'tm30 hidden'; el.setAttribute('aria-label', label('title'));
    el.innerHTML = `<style>${CSS}</style><div class="tm30-head"><strong class="tm30-title"></strong><span class="tm30-current"></span><button type="button" class="tm30-commands"></button></div><div class="tm30-tools"><input class="tm30-search" maxlength="80" spellcheck="false"/><select class="tm30-filter" aria-label="${escapeHtml(label('all'))}"></select></div><div class="tm30-columns"><div class="tm30-list"></div><div class="tm30-detail"></div></div><div class="tm30-sector tm30-note"></div>`;
    screen.appendChild(el);
    el.querySelector('.tm30-search').addEventListener('input', e => { query = e.target.value; render(true); });
    el.querySelector('.tm30-filter').addEventListener('change', e => { filter = e.target.value; render(true); });
    el.querySelector('.tm30-commands').addEventListener('click', () => hide());
    el.addEventListener('click', e => {
      const row = e.target.closest?.('[data-moon]');
      if (row) { selected = row.dataset.moon; render(true); return; }
      const action = e.target.closest?.('[data-action]');
      if (!action || action.disabled) return;
      const c = rows.find(x => x.id === selected); if (!c) return;
      // Fresh native lookup on submit rejects stale destinations; never resolve a saved #n here.
      hide(); term.submit((action.dataset.action === 'info' ? 'INFO ' : 'ROUTE ') + c.id);
    });
    term.el.addEventListener('keydown', e => {
      if (!visible() || e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation(); hide();
    }, true);
    return true;
  }
  function show() {
    if (typeof document === 'undefined') return false;
    if (!term.active) term.open();
    if (!ensure()) return false;
    query = ''; filter = 'all'; selected = game.run?.moon || null; signature = ''; poll = 0;
    el.querySelector('.tm30-search').value = ''; el.classList.remove('hidden'); render(true);
    if (!offs.length) {
      if (game.mods?.on) offs.push(game.mods.on('update', dt => { if (!visible()) return; poll -= dt; if (poll <= 0) { poll = .75; render(); } }));
      offs.push(onLangChange(() => render(true)));
    }
    el.querySelector('.tm30-search').focus(); return true;
  }
  return { show, hide, visible, refresh: render, data: () => moonDirectoryData30(game), dispose() { hide(false); el?.remove(); el = null; } };
}
