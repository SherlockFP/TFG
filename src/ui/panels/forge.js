// HQ FORGE panel (CRT look, same frame conventions as the other in-game panels): ENHANCE (THE MONETIZER, +1..+9),
// ASCEND (Ascension Altar, tier up) and EXCHANGE (Shard Exchange + Backup Drive). All numbers come from game/enhance.js;
// the host re-checks and rolls everything, the panel only previews.
//   createForgePanel(ui, game, forge, { tab }) -> { el, onResult(d), dispose() }
import { el, escapeHtml } from '../../core/util.js';
import { t } from '../../core/i18n.js';
import { iconHTML } from '../icons.js';
import { TIERS, TIER_ORDER, tierColor } from '../../game/tiers.js';
import { affixDisplayName } from '../../game/loot.js';
import * as F from '../../game/enhance.js';

const CSS = `
.overlay .menu-frame.forge{width:min(1080px,96vw);height:min(86vh,700px)}
.forge > .cp-body{overflow:hidden;display:flex;flex-direction:column;padding-bottom:8px}
.forge .tabs{margin-bottom:8px}
.forge .fg-wrap{display:grid;grid-template-columns:minmax(0,300px) minmax(0,1fr);gap:14px;min-height:0;flex:1}
.forge .fg-list{overflow:auto;display:flex;flex-direction:column;gap:6px;padding-right:4px;scrollbar-width:thin}
.forge .fg-item{--tc:#9aa39a;display:flex;align-items:center;gap:8px;border:1px solid color-mix(in srgb,var(--tc) 55%,transparent);border-left:4px solid var(--tc);background:rgba(0,0,0,.42);padding:4px 8px;cursor:pointer;outline:none}
.forge .fg-item:hover,.forge .fg-item:focus-visible,.forge .fg-item.sel{background:color-mix(in srgb,var(--tc) 18%,rgba(0,0,0,.5));box-shadow:0 0 12px color-mix(in srgb,var(--tc) 40%,transparent)}
.forge .fg-item .ico{width:34px;height:34px;flex-shrink:0}
.forge .fg-item .nm{font-size:20px;line-height:1;color:var(--tc);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.forge .fg-item .tr{font-size:15px;opacity:.7;text-transform:uppercase}
.forge .fg-det{overflow:auto;display:flex;flex-direction:column;gap:9px;padding-right:4px;scrollbar-width:thin}
.forge .fg-box{border:1px solid var(--ph-line);background:rgba(0,0,0,.34);padding:8px 11px}
.forge .fg-head{display:flex;gap:12px;align-items:center}
.forge .fg-big{width:64px;height:64px;border:1px solid rgba(255,255,255,.16);background:radial-gradient(circle,color-mix(in srgb,var(--tc) 26%,transparent),rgba(0,0,0,.6))}
.forge .fg-name{font-size:28px;line-height:1;color:var(--tc);text-shadow:0 0 10px color-mix(in srgb,var(--tc) 55%,transparent)}
.forge .fg-sub{font-size:17px;opacity:.75}
.forge .fg-row{display:flex;justify-content:space-between;gap:10px;font-size:20px;padding:2px 0;border-bottom:1px dashed var(--ph-line)}
.forge .fg-row:last-child{border-bottom:none}
.forge .fg-row b{color:var(--ph-hi);font-weight:normal}
.forge .ok{color:#7dff7d}.forge .bad{color:#ff6b5a}.forge .warn{color:#ffd23f}
.forge .fg-chance{font-family:var(--cond);font-weight:bold;font-size:34px;letter-spacing:1px}
.forge .fg-oc{font-size:18px;margin-top:3px}
.forge .fg-note{font-size:16px;opacity:.65;line-height:1.05}
.forge .fg-toggle{display:flex;align-items:center;gap:8px;font-size:19px;cursor:pointer}
.forge .fg-ex{display:flex;align-items:center;gap:10px;border:1px solid var(--ph-line);background:rgba(0,0,0,.34);padding:6px 10px}
.forge .fg-ex .ico{width:32px;height:32px}
.forge .fg-ex .mid{flex:1;font-size:20px}
@media (max-width:900px){.forge .fg-wrap{grid-template-columns:1fr}}
`;
let cssDone = false;
function ensureCss() {
  if (cssDone && document.getElementById('tfg-forge-css')) return;
  const s = document.createElement('style'); s.id = 'tfg-forge-css'; s.textContent = CSS; document.head.appendChild(s); cssDone = true;
}
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const pct = (v) => `${Math.round(v * 100)}%`;
const shardName = (id) => t(F.shardDef(id)?.name || id);

export function createForgePanel(ui, game, forge, opts = {}) {
  ensureCss();
  const g = game;
  let tab = ['enhance', 'ascend', 'exchange'].includes(opts.tab) ? opts.tab : 'enhance';
  let sel = null, backup = false, sacId = null, lastKey = '';
  const wrap = ui.panel('wide forge');
  const head = ui.panelHead(t('THE MONETIZER'), ' ');
  const sub = head.querySelector('.cp-sub');
  const body = el('div', { class: 'cp-body' });
  const tabsEl = el('div', { class: 'tabs' });
  const listEl = el('div', { class: 'fg-list' });
  const detEl = el('div', { class: 'fg-det' });
  body.append(tabsEl, el('div', { class: 'fg-wrap' }, listEl, detEl));
  wrap.append(head, body, ui.panelFoot([['E', t('CONFIRM')], ['ESC', t('CLOSE')]]));

  const credits = () => g.run?.credits || 0;
  const tierOf = (it) => it.rarity();
  const setSub = () => { sub.innerHTML = `<b>▮${fmt(credits())}</b> · ${F.SHARD_DEFS.map((s) => `<span style="color:${s.color}">${forge.count(s.id)}</span>`).join(' / ')}`; };
  const matLine = (mat) => {
    const have = forge.count(mat[0]);
    return `<span class="${have >= mat[1] ? 'ok' : 'bad'}">${have}/${mat[1]} ${escapeHtml(shardName(mat[0]))}</span>`;
  };

  // ------------------------------------------------------------------ tabs / lists
  function renderTabs() {
    tabsEl.innerHTML = '';
    for (const [id, label] of [['enhance', 'ENHANCE'], ['ascend', 'ASCEND'], ['exchange', 'EXCHANGE']]) {
      tabsEl.appendChild(ui.button(t(label), () => { tab = id; sel = null; sacId = null; backup = false; ui.sfx('ui_click', 0.5); full(); }, tab === id ? 'tab sel' : 'tab'));
    }
  }
  function itemRow(it) {
    const tier = tierOf(it);
    const row = el('div', { class: 'fg-item' + (sel === it.id ? ' sel' : ''), tabindex: '0', style: { '--tc': tierColor(tier) } });
    row.append(el('div', { class: 'ico', html: iconHTML(it.type, 'ico') }), el('div', { class: 'nm' }, affixDisplayName(t(it.def.name), it.affix, it)), el('div', { class: 'tr' }, t(TIERS[tier].name)));
    row.addEventListener('click', () => { sel = it.id; sacId = null; backup = false; ui.sfx('ui_click', 0.4); renderList(); renderDetail(); });
    return row;
  }
  function renderList() {
    listEl.innerHTML = '';
    if (tab === 'exchange') {
      for (const s of F.SHARD_DEFS) listEl.appendChild(el('div', { class: 'fg-item', style: { '--tc': s.color } }, el('div', { class: 'ico', html: iconHTML(s.id, 'ico') }), el('div', { class: 'nm' }, t(s.name)), el('div', { class: 'tr' }, 'x' + forge.count(s.id))));
      return;
    }
    const items = forge.myItems();
    if (!items.length) listEl.appendChild(el('div', { class: 'fg-note' }, t('Carry a weapon, armour or trinket to the machine.')));
    for (const it of items) listEl.appendChild(itemRow(it));
    if (!sel && items.length) { sel = items[0].id; }
  }

  // ------------------------------------------------------------------ enhance
  function detailEnhance() {
    const it = sel && g.items.get(sel);
    if (!it || it.holder !== g.selfId) { detEl.appendChild(el('div', { class: 'fg-note' }, t('Select an item.'))); return; }
    const tier = tierOf(it), tc = tierColor(tier);
    const box = el('div', { class: 'fg-box', style: { '--tc': tc } });
    box.appendChild(el('div', { class: 'fg-head' }, el('div', { class: 'fg-big', html: iconHTML(it.type, 'ico') }),
      el('div', {}, el('div', { class: 'fg-name' }, affixDisplayName(t(it.def.name), it.affix, it)), el('div', { class: 'fg-sub' }, `${t(TIERS[tier].name)} · +${it.plus || 0} / +${F.MAX_PLUS}`))));
    detEl.appendChild(box);
    const info = F.enhanceInfo(it.plus || 0, { backup });
    const b2 = el('div', { class: 'fg-box' });
    if (!info) { b2.appendChild(el('div', { class: 'fg-row warn' }, t('MAXIMUM ENHANCEMENT REACHED'))); detEl.appendChild(b2); return; }
    const isW = it.def.kind === 'weapon';
    const chColor = info.chance >= 0.85 ? 'ok' : info.chance >= 0.5 ? 'warn' : 'bad';
    b2.innerHTML = `<div class="fg-row"><span>${t('Success chance')}</span><span class="fg-chance ${chColor}">${pct(info.chance)}</span></div>
      <div class="fg-row"><span>${t('Cost')}</span><span><b class="${credits() >= info.credits ? '' : 'bad'}">▮${fmt(info.credits)}</b> + ${matLine(info.mat)}</span></div>
      <div class="fg-row"><span>${isW ? t('Damage') : t('Stats')}</span><span><b>+${Math.round(info.from * 100)}%</b> → <b class="ok">+${Math.round(info.bonus * 100)}%</b></span></div>
      <div class="fg-row"><span>${t('On failure')}</span><span class="${info.failDrops ? 'bad' : 'ok'}">${info.failDrops ? (backup ? t('Backup Drive protects the level') : t('drops one level')) : t('level stays the same')}</span></div>`;
    const ocLine = (it.oc || []).map((id) => F.OVERCLOCKS[id] ? `<span style="color:${F.OVERCLOCKS[id].color}">${F.OVERCLOCKS[id].icon} ${t(F.OVERCLOCKS[id].name)}</span>` : '').join('  ');
    if (info.opens && isW) b2.insertAdjacentHTML('beforeend', `<div class="fg-oc warn">⚡ ${t('Success opens an OVERCLOCK socket (random effect)')}</div>`);
    if (ocLine) b2.insertAdjacentHTML('beforeend', `<div class="fg-oc">${ocLine}</div>`);
    detEl.appendChild(b2);
    if (info.failDrops) {
      const nb = forge.count(F.BACKUP_ID);
      const tg = el('label', { class: 'fg-toggle' }, el('input', { type: 'checkbox' }), el('span', {}, `${t('Use a Backup Drive')} (${nb})`));
      const cb = tg.querySelector('input'); cb.checked = backup && nb > 0; cb.disabled = nb <= 0;
      cb.addEventListener('change', () => { backup = cb.checked; renderDetail(); });
      detEl.appendChild(tg);
    }
    const can = credits() >= info.credits && forge.count(info.mat[0]) >= info.mat[1];
    detEl.appendChild(ui.button(`${t('ENHANCE')} +${info.target}`, () => { if (can) forge.requestEnhance(it.id, { backup: backup && forge.count(F.BACKUP_ID) > 0 }); else { ui.sfx('ui_error'); ui.toast(t('Not enough credits or shards.'), 'bad'); } }, 'primary' + (can ? '' : ' disabled')));
    detEl.appendChild(el('div', { class: 'fg-note' }, t('The Algorithm takes a cut of every attempt. Costs are paid up front.')));
  }

  // ------------------------------------------------------------------ ascend
  function detailAscend() {
    const it = sel && g.items.get(sel);
    if (!it || it.holder !== g.selfId) { detEl.appendChild(el('div', { class: 'fg-note' }, t('Select an item.'))); return; }
    const tier = tierOf(it), tc = tierColor(tier);
    const spares = forge.myItems().filter((o) => o.id !== it.id && o.type === it.type && !o.soulbound && !(o.plus > 0));
    if (sacId && !spares.some((o) => o.id === sacId)) sacId = null;
    const info = F.ascendInfo(tier, { sacrifice: !!sacId });
    detEl.appendChild(el('div', { class: 'fg-box', style: { '--tc': tc } }, el('div', { class: 'fg-head' }, el('div', { class: 'fg-big', html: iconHTML(it.type, 'ico') }),
      el('div', {}, el('div', { class: 'fg-name' }, affixDisplayName(t(it.def.name), it.affix, it)), el('div', { class: 'fg-sub' }, t(TIERS[tier].name) + (info ? ` → ${t(TIERS[info.to].name)}` : ''))))));
    if (!info) { detEl.appendChild(el('div', { class: 'fg-box warn' }, t('MYTHIC: nothing above this.'))); return; }
    const chColor = info.chance >= 0.75 ? 'ok' : info.chance >= 0.4 ? 'warn' : 'bad';
    const b2 = el('div', { class: 'fg-box' });
    b2.innerHTML = `<div class="fg-row"><span>${t('Success chance')}</span><span class="fg-chance ${chColor}">${pct(info.chance)}</span></div>
      <div class="fg-row"><span>${t('Cost')}</span><span><b class="${credits() >= info.credits ? '' : 'bad'}">▮${fmt(info.credits)}</b> + ${matLine(info.mat)}</span></div>
      <div class="fg-row"><span>${t('On failure')}</span><span class="ok">${t('tier is kept, materials are lost')}</span></div>`;
    detEl.appendChild(b2);
    if (spares.length) {
      const tg = el('label', { class: 'fg-toggle' }, el('input', { type: 'checkbox' }), el('span', {}, `${t('Sacrifice a spare')} ${t(it.def.name)} (+${Math.round(F.SACRIFICE_BONUS * 100)}%)`));
      const cb = tg.querySelector('input'); cb.checked = !!sacId;
      cb.addEventListener('change', () => { sacId = cb.checked ? spares[0].id : null; renderDetail(); });
      detEl.appendChild(tg);
    }
    const can = credits() >= info.credits && forge.count(info.mat[0]) >= info.mat[1];
    detEl.appendChild(ui.button(`${t('ASCEND')} → ${t(TIERS[info.to].name)}`, () => { if (can) forge.requestAscend(it.id, sacId); else { ui.sfx('ui_error'); ui.toast(t('Not enough credits or shards.'), 'bad'); } }, 'primary' + (can ? '' : ' disabled')));
    detEl.appendChild(el('div', { class: 'fg-note' }, t('The workbench only raises items up to Rare. Epic and above is done here.')));
  }

  // ------------------------------------------------------------------ exchange
  function detailExchange() {
    for (const s of F.SHARD_DEFS) {
      const rule = F.exchangeRule(s.id);
      if (!rule) continue;
      const have = forge.count(s.id), can = have >= rule.n;
      const to = F.shardDef(rule.to);
      detEl.appendChild(el('div', { class: 'fg-ex' }, el('div', { class: 'ico', html: iconHTML(s.id, 'ico') }),
        el('div', { class: 'mid', html: `${rule.n} × <span style="color:${s.color}">${escapeHtml(t(s.name))}</span> <span style="opacity:.6">(${have})</span> → 1 × <span style="color:${to.color}">${escapeHtml(t(to.name))}</span>` }),
        ui.button(t('CONVERT'), () => { if (can) forge.requestExchange({ op: 'up', shard: s.id }); else ui.sfx('ui_error'); }, 'small' + (can ? '' : ' disabled'))));
    }
    const bc = F.BACKUP_COST, hb = forge.count(bc.id);
    detEl.appendChild(el('div', { class: 'fg-ex' }, el('div', { class: 'ico', html: iconHTML(F.BACKUP_ID, 'ico') }),
      el('div', { class: 'mid', html: `${escapeHtml(t('Backup Drive'))}: ${bc.n} × ${escapeHtml(shardName(bc.id))} <span style="opacity:.6">(${hb})</span>` }),
      ui.button(t('BUY'), () => { if (hb >= bc.n) forge.requestExchange({ op: 'backup' }); else ui.sfx('ui_error'); }, 'small' + (hb >= bc.n ? '' : ' disabled'))));
    detEl.appendChild(el('div', { class: 'fg-note' }, t('Source Code cannot be traded for. It only drops from Mythic creatures and world bosses.')));
  }

  function renderDetail() {
    detEl.innerHTML = '';
    if (tab === 'enhance') detailEnhance(); else if (tab === 'ascend') detailAscend(); else detailExchange();
  }
  function full() { setSub(); renderTabs(); renderList(); renderDetail(); }

  // live refresh (credits / shards / item state can change while open)
  const poll = setInterval(() => {
    if (!wrap.isConnected) return;
    const it = sel && g.items.get(sel);
    const key = [credits(), F.SHARD_IDS.map((id) => forge.count(id)).join(','), forge.count(F.BACKUP_ID), it?.plus || 0, it?.tier || '', (it?.oc || []).join('.'), forge.myItems().length, tab].join('|');
    if (key === lastKey) return;
    lastKey = key; setSub(); renderList(); renderDetail();
  }, 400);

  full();
  return {
    el: wrap,
    onResult() { full(); },
    dispose() { clearInterval(poll); },
    setTab(id) { tab = id; sel = null; full(); },
  };
}
void TIER_ORDER;
