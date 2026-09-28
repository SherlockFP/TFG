// TRADE window (CRT look, same frame + tile language as the I panel): left = your inventory (hotbar / equipped / backpack, every
// item with its generated icon, tier frame, +N, durability), middle = YOUR offer (up to 9 items + Clout, drag or double-click)
// with the LOCK / ACCEPT / CANCEL buttons and the 3 s countdown, right = THEIR offer updating live + a give / get summary.
// Tooltips are the inventory's (itemTooltipHTML) plus a comparison with what you carry / wear (trade_core.compareItems).
//   createTradePanel(game, T) -> { el, update(), tick(dt), showDone(msg), dispose() }
// T (game/trade.js) exposes the state and the actions; the host validates everything, this file only draws and sends intents.
import { TIERS, tierOfItem } from '../../game/tiers.js';
import { ITEMS, isSellable } from '../../game/items.js';
import { itemTooltipHTML } from '../inventory_panel.js';
import { ensureInventoryStyles } from '../inventory_style.js';
import { iconHTML, flushIcons } from '../icons.js';
import { escapeHtml } from '../../core/util.js';
import { t, tf } from '../../core/i18n.js';
import { RULES, tradeBlock, compareItems, comparableFor, offerValue } from '../../game/trade_core.js';

const CSS = `
.overlay .menu-frame.trd { width: min(1180px, 97vw); max-height: 94vh; user-select: none; }
.trd .cp-body { display: grid; grid-template-columns: minmax(0, 1.22fr) minmax(0, 0.95fr) minmax(0, 0.95fr); gap: 16px; padding: 10px 16px 10px; overflow: hidden; min-height: 0; }
.trd-col { display: flex; flex-direction: column; gap: 7px; min-width: 0; min-height: 0; }
.trd-sec { font-family: var(--cond); font-weight: bold; text-transform: uppercase; font-size: 17px; letter-spacing: 2px; color: var(--ph-dim); display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.trd-sec::after { content: ''; flex: 1; height: 1px; background: var(--ph-line); }
.trd-sec em { font-style: normal; color: var(--ph); letter-spacing: 1px; font-size: 15px; }
.trd-invlist { overflow: auto; flex: 1; min-height: 0; padding-right: 4px; display: flex; flex-direction: column; gap: 6px; scrollbar-width: thin; scrollbar-color: var(--ph-dim) transparent; max-height: calc(94vh - 170px); }
.trd-grp { display: flex; flex-wrap: wrap; gap: 4px; padding: 5px; border: 1px solid var(--ph-line); background: rgba(0,0,0,0.3); min-height: 34px; }
.trd-grp-h { width: 100%; font-size: 13px; letter-spacing: 1.5px; color: var(--ph-dim); text-transform: uppercase; margin-bottom: -1px; }
.trd-it { position: relative; width: 54px; height: 54px; flex: none; --tc: #6a625a; border: 2px solid color-mix(in srgb, var(--tc) 70%, transparent); cursor: grab; overflow: hidden;
  background: radial-gradient(ellipse 75% 70% at 50% 58%, color-mix(in srgb, var(--tc) 26%, transparent), rgba(0,0,0,0.5) 78%), rgba(10,6,3,0.75);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.6), inset 0 -12px 16px -12px var(--tc); transition: filter 0.08s; }
.trd-it:hover { filter: brightness(1.28); z-index: 2; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.6), inset 0 -14px 18px -10px var(--tc), 0 0 12px color-mix(in srgb, var(--tc) 60%, transparent); }
.trd-it.plain { --tc: #6a625a; }
.trd-it .ico { position: absolute; left: 50%; top: 50%; width: 42px; height: 42px; transform: translate(-50%, -52%); image-rendering: pixelated; pointer-events: none; opacity: 0; transition: opacity 0.2s; }
.trd-it .ico.ok { opacity: 1; }
.trd-it .pip { position: absolute; left: 4px; top: 4px; width: 7px; height: 7px; background: var(--tc); transform: rotate(45deg); box-shadow: 0 0 6px var(--tc); pointer-events: none; }
.trd-it .pl { position: absolute; right: 3px; top: 1px; font-size: 15px; font-weight: normal; color: #ffe27a; text-shadow: 1px 1px 0 #000, -1px 0 0 #000; pointer-events: none; }
.trd-it .val { position: absolute; right: 3px; bottom: 1px; font-size: 13px; text-decoration: none; color: #fff3e6; text-shadow: 1px 1px 0 #000, -1px 0 0 #000; pointer-events: none; }
.trd-it .dur { position: absolute; left: 3px; right: 3px; bottom: 2px; height: 3px; background: #2a1608; pointer-events: none; }
.trd-it .dur i { display: block; height: 100%; background: var(--green, #7dff7d); }
.trd-it .dur.low i { background: #ff6a4a; }
.trd-it.t-epic, .trd-it.t-legendary { animation: tinvGlow 2.2s ease-in-out infinite; }
.trd-it.t-mythic { animation: tinvGlow 1.6s ease-in-out infinite; }
.trd-it.offered { opacity: 0.38; filter: grayscale(0.7); }
.trd-it.offered::after { content: '\\2713'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 30px; color: #7dff7d; text-shadow: 0 0 8px #000; }
.trd-it.blocked { cursor: not-allowed; filter: saturate(0.25) brightness(0.7); }
.trd-it.blocked::after { content: '\\2715'; position: absolute; left: 3px; bottom: 0; font-size: 14px; color: #ff6a4a; }
.trd-it.ghost-mark { outline: 2px dashed #ffd23f; }
.trd-ghost { position: fixed; z-index: 100; pointer-events: none; transform: translate(-50%, -50%) scale(1.1); opacity: 0.92; filter: drop-shadow(0 6px 10px rgba(0,0,0,0.7)); }
.trd-box { border: 1px solid var(--ph-line); background: rgba(0,0,0,0.34); padding: 8px; display: flex; flex-direction: column; gap: 6px; box-shadow: inset 0 0 22px rgba(0,0,0,0.55); }
.trd-box.hot { border-color: #7dff7d; background: rgba(60,255,110,0.08); }
.trd-box.locked { border-color: #ffd23f; }
.trd-box.accepted { border-color: #7dff7d; box-shadow: inset 0 0 22px rgba(60,255,110,0.18); }
.trd-slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.trd-slot { position: relative; aspect-ratio: 1 / 1; border: 2px dashed rgba(255,190,140,0.24); background: rgba(0,0,0,0.42); display: flex; align-items: center; justify-content: center; min-width: 0; }
.trd-slot .trd-it { position: absolute; inset: 0; width: auto; height: auto; }
.trd-slot .trd-it .ico { width: 62%; height: 62%; }
.trd-slot .trd-n { color: rgba(255,190,140,0.16); font-size: 26px; pointer-events: none; }
.trd-clout { display: flex; align-items: center; gap: 8px; font-size: 19px; color: var(--ph); }
.trd-clout span { color: #ffd23f; text-shadow: 0 0 8px rgba(255,210,63,0.4); }
.trd-clout input { width: 96px; font: inherit; font-size: 20px; color: var(--ph-hi); background: rgba(0,0,0,0.5); border: 1px solid var(--ph-dim); padding: 1px 6px; text-align: right; outline: none; }
.trd-clout input:focus { border-color: var(--ph-hi); }
.trd-clout input:disabled { opacity: 0.5; }
.trd-clout small { color: var(--ph-dim); font-size: 15px; }
.trd-clout b { font-weight: normal; color: #ffd23f; font-size: 22px; }
.trd-tot { font-size: 16px; color: var(--ph-dim); display: flex; justify-content: space-between; gap: 8px; }
.trd-tot b { font-weight: normal; color: var(--ph-hi); }
.trd-state { min-height: 44px; font-size: 18px; line-height: 1.1; color: var(--ph); padding: 6px 8px; border: 1px solid var(--ph-line); background: rgba(0,0,0,0.3); text-align: center; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
.trd-state.go { color: #7dff7d; border-color: #7dff7d; font-size: 22px; }
.trd-bar { height: 6px; background: rgba(0,0,0,0.5); border: 1px solid var(--ph-line); }
.trd-bar i { display: block; height: 100%; background: linear-gradient(90deg, #ffd23f, #7dff7d); width: 0; }
.trd-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.trd-btns .btn { flex: 1; min-width: 100px; text-align: center; font-size: 21px; }
.trd-btns .btn:disabled { opacity: 0.4; cursor: not-allowed; }
.trd-btns .btn.on { border-color: #ffd23f; color: #ffd23f; }
.trd-btns .btn.go { border-color: #7dff7d; color: #7dff7d; background: rgba(60,255,110,0.1); }
.trd-lamps { display: flex; gap: 8px; flex-wrap: wrap; }
.trd-lamp { display: inline-flex; align-items: center; gap: 6px; font-size: 16px; padding: 1px 8px; border: 1px solid var(--ph-line); color: var(--ph-dim); letter-spacing: 1px; text-transform: uppercase; }
.trd-lamp::before { content: ''; width: 9px; height: 9px; background: #6a625a; box-shadow: 0 0 6px #000; }
.trd-lamp.lock { color: #ffd23f; border-color: #ffd23f; } .trd-lamp.lock::before { background: #ffd23f; box-shadow: 0 0 8px #ffd23f; }
.trd-lamp.ok { color: #7dff7d; border-color: #7dff7d; } .trd-lamp.ok::before { background: #7dff7d; box-shadow: 0 0 8px #7dff7d; }
.trd-sum { font-size: 17px; line-height: 1.15; border: 1px solid var(--ph-line); background: rgba(0,0,0,0.3); padding: 6px 9px; display: flex; flex-direction: column; gap: 3px; }
.trd-sum div { display: flex; justify-content: space-between; gap: 8px; color: var(--ph-dim); text-transform: uppercase; letter-spacing: 1px; font-size: 15px; }
.trd-sum div b { font-weight: normal; color: var(--ph-hi); text-transform: none; letter-spacing: 0; font-size: 17px; }
.trd-sum .warn { color: #ffd23f; text-transform: none; letter-spacing: 0; font-size: 15px; }
.trd-msg { min-height: 18px; font-size: 16px; color: #ff6a4a; text-align: center; }
.trd-empty { color: var(--ph-dim); font-size: 16px; opacity: 0.6; padding: 4px; }
.trd-done { position: absolute; inset: 0; z-index: 4; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 14px; background: rgba(6,3,1,0.94); }
.trd-done.on { display: flex; }
.trd-done h2 { margin: 0; font-family: var(--cond); font-size: 46px; letter-spacing: 6px; color: #7dff7d; text-shadow: 0 0 18px rgba(60,255,110,0.5); }
.trd-done .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; width: min(760px, 92%); }
.trd-done .cols > div { border: 1px solid var(--ph-line); background: rgba(0,0,0,0.4); padding: 8px 12px; min-height: 90px; }
.trd-done h4 { margin: 0 0 6px; font-size: 16px; letter-spacing: 2px; color: var(--ph-dim); text-transform: uppercase; font-weight: normal; }
.trd-done .row { display: flex; align-items: center; gap: 8px; font-size: 20px; color: var(--tc, #ffd9b8); }
.trd-done .row img { width: 30px; height: 30px; image-rendering: pixelated; }
.trd-done .row em { margin-left: auto; font-style: normal; color: #ffe27a; }
.trd-done .cl { color: #ffd23f; font-size: 20px; margin-top: 4px; }
.tinv-tip .tt-cmp { padding: 4px 12px 0; border-top: 1px solid rgba(255,150,70,0.18); margin-top: 4px; }
.tinv-tip .tt-cmp .cmp-h { font-size: 13px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,217,184,0.55); margin-bottom: 2px; }
.tinv-tip .tt-cmp .cmp-r { display: flex; justify-content: space-between; font-size: 16px; }
.tinv-tip .tt-cmp .cmp-r span { color: rgba(255,217,184,0.65); }
.tinv-tip .tt-cmp .up { color: #7dff7d; } .tinv-tip .tt-cmp .down { color: #ff7a5a; } .tinv-tip .tt-cmp .same { color: rgba(255,217,184,0.4); }
.tinv-tip .tt-rows .v.down { color: #ff7a5a; }
.tinv-tip .tt-block { padding: 4px 12px 0; color: #ff6a4a; font-size: 16px; }
@media (max-width: 1000px) { .trd .cp-body { grid-template-columns: 1fr; overflow: auto; } }
`;

let cssDone = false;
function ensureCss() {
  if (cssDone && document.getElementById('tfg-trade-css')) return;
  const s = document.createElement('style'); s.id = 'tfg-trade-css'; s.textContent = CSS; document.head.appendChild(s); cssDone = true;
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const durFrac = (it) => {
  if (typeof it?.dur !== 'number') return null;   // durability module: it.dur (fraction, or absolute with it.durMax / def.durability)
  const mx = it.durMax || it.def?.durability || it.def?.dur || 1;
  return Math.max(0, Math.min(1, it.dur / mx));
};
const asCmp = (it) => ({ id: it.id, def: it.def, tier: it.rarity ? it.rarity() : it.tier, plus: it.plus || 0, value: it.value || 0 });

export function createTradePanel(game, T) {
  ensureInventoryStyles();
  ensureCss();
  const root = document.createElement('div');
  root.className = 'menu-frame crt-panel trd';
  root.innerHTML = `
    <div class="cp-head"><span class="cp-os">TFG OS //</span><span class="menu-title">${escapeHtml(t('TRADE'))}</span><span class="cp-cursor">█</span><span class="cp-sub trd-sub"></span></div>
    <div class="cp-body">
      <div class="trd-col trd-inv"><div class="trd-sec">${escapeHtml(t('Your inventory'))} <em class="trd-invn"></em></div><div class="trd-invlist"></div></div>
      <div class="trd-col trd-mid">
        <div class="trd-sec">${escapeHtml(t('Your offer'))}</div>
        <div class="trd-box trd-mine"><div class="trd-slots" data-side="mine"></div>
          <div class="trd-clout"><span>◈ ${escapeHtml(t('Clout'))}</span><input class="trd-cin" type="number" min="0" step="1" value="0"><small class="trd-cbal"></small></div>
          <div class="trd-tot trd-tot-mine"></div></div>
        <div class="trd-state"></div>
        <div class="trd-btns"><button class="btn trd-lock"></button><button class="btn primary trd-acc"></button><button class="btn trd-cancel">${escapeHtml(t('CANCEL'))}</button></div>
        <div class="trd-msg"></div>
      </div>
      <div class="trd-col trd-their">
        <div class="trd-sec"><span class="trd-tname"></span></div>
        <div class="trd-box trd-theirs"><div class="trd-slots" data-side="their"></div>
          <div class="trd-clout"><span>◈ ${escapeHtml(t('Clout'))}</span><b class="trd-tclout">0</b></div>
          <div class="trd-tot trd-tot-their"></div></div>
        <div class="trd-lamps"></div>
        <div class="trd-sec">${escapeHtml(t('Summary'))}</div>
        <div class="trd-sum"></div>
      </div>
    </div>
    <div class="cp-foot">${[['DRAG', 'offer'], ['DBL-CLICK / RMB', 'add / remove'], ['LOCK', 'then ACCEPT'], ['ESC', 'cancel trade']].map(([k, l]) => `<span><kbd>${k}</kbd> ${escapeHtml(t(l))}</span>`).join('')}</div>
    <div class="trd-done"></div>`;
  const $ = (s) => root.querySelector(s);
  const invList = $('.trd-invlist'), mineSlots = $('[data-side=mine]'), theirSlots = $('[data-side=their]');
  const cin = $('.trd-cin'), stateEl = $('.trd-state'), lockB = $('.trd-lock'), accB = $('.trd-acc'), cancelB = $('.trd-cancel'), msgEl = $('.trd-msg');
  let sig = '', tip = null, hoverId = null, press = null, drag = null, cinT = 0, cinFocus = false, msgT = 0, disposed = false, done = false;
  for (const n of ['.trd-sub', '.trd-invn']) $(n).textContent = '';

  // ------------------------------------------------------------------ tiles
  function tile(it, { side = 'inv', offered = false, blocked = false } = {}) {
    const def = it.def, tier = it.rarity();
    const tiered = !!(it.tier || it.affix || def.tier || def.value) && tier !== 'common';
    const val = isSellable(def) && it.value ? `<s class="val">▮${it.value}</s>` : '';
    const pl = it.plus ? `<b class="pl">+${it.plus}</b>` : '';
    const df = durFrac(it);
    const bf = df === null && def.battery && it.battery != null ? Math.max(0, Math.min(1, it.battery / def.battery)) : null;
    const f = df ?? bf;
    const bar = f === null ? '' : `<u class="dur${f < 0.25 ? ' low' : ''}"><i style="width:${Math.round(f * 100)}%"></i></u>`;
    return `<div class="trd-it ${tiered ? 't-' + tier : 'plain'}${offered ? ' offered' : ''}${blocked ? ' blocked' : ''}" data-id="${escapeHtml(it.id)}" data-side="${side}" style="${tiered ? `--tc:${TIERS[tier].color};` : ''}">${tiered ? '<i class="pip"></i>' : ''}${iconHTML(it.type, 'ico')}${pl}${val}${bar}</div>`;
  }

  // ------------------------------------------------------------------ render
  function signature(s, mine) {
    const list = T.entries();
    return `${list.map((e) => `${e.id}:${e.inv ? e.inv.k + (e.inv.s || e.inv.x + ',' + e.inv.y) : 'h'}:${e.tier}:${e.value}:${e.it.plus || 0}:${Math.round((e.it.dur ?? -1) * 100)}`).join('|')}#${s.v}#${s.st}#${mine.items.join(',')}#${s.p[T.peer()]?.i.join(',')}`;
  }
  function render() {
    const s = T.snap();
    if (!s || done) return;
    const me = T.me(), other = T.peer();
    const mine = T.mine(), theirs = s.p[other] || { i: [], c: 0, l: 0, k: 0 };
    const my = s.p[me] || { l: 0, k: 0 };
    sig = signature(s, mine);
    // header
    const r = game.remotes.get(other);
    $('.trd-sub').textContent = tf('with {name} · Lv.{lvl}', { name: T.nameOf(other), lvl: r?.level ?? game.net?.players?.get(other)?.level ?? '?' });
    $('.trd-tname').textContent = tf("{name}'s offer", { name: T.nameOf(other) });
    // inventory
    const list = T.entries();
    const offered = new Set(mine.items);
    const groups = [['Hotbar', list.filter((e) => !e.inv)], ['Equipped', list.filter((e) => e.inv?.k === 'eq')], ['Backpack', list.filter((e) => e.inv?.k === 'bag')]];
    invList.innerHTML = groups.map(([name, arr]) => `<div class="trd-grp"><div class="trd-grp-h">${escapeHtml(t(name))} (${arr.length})</div>${arr.length ? arr.map((e) => tile(e.it, { offered: offered.has(e.id), blocked: !!tradeBlock(e) })).join('') : `<span class="trd-empty">${escapeHtml(t('Empty'))}</span>`}</div>`).join('');
    $('.trd-invn').textContent = `${list.length}`;
    // offers
    const fill = (host, ids, side) => {
      let h = '';
      for (let i = 0; i < RULES.maxItems; i++) {
        const it = ids[i] ? game.items.get(ids[i]) : null;
        h += `<div class="trd-slot" data-slot="${i}">${it ? tile(it, { side }) : `<span class="trd-n">${i + 1}</span>`}</div>`;
      }
      host.innerHTML = h;
    };
    fill(mineSlots, mine.items, 'mine');
    fill(theirSlots, theirs.i, 'their');
    const items = (ids) => ids.map((id) => game.items.get(id)).filter(Boolean);
    const myV = offerValue(items(mine.items)), thV = offerValue(items(theirs.i));
    $('.trd-tot-mine').innerHTML = `<span>${mine.items.length}/${RULES.maxItems} ${escapeHtml(t('items'))}</span><b>▮${fmt(myV)}</b>`;
    $('.trd-tot-their').innerHTML = `<span>${theirs.i.length}/${RULES.maxItems} ${escapeHtml(t('items'))}</span><b>▮${fmt(thV)}</b>`;
    $('.trd-tclout').textContent = fmt(theirs.c);
    $('.trd-cbal').textContent = `/ ${fmt(T.balance())}`;
    if (!cinFocus && Number(cin.value) !== mine.clout) cin.value = String(mine.clout);
    // boxes
    $('.trd-mine').classList.toggle('locked', !!my.l && !my.k); $('.trd-mine').classList.toggle('accepted', !!my.k);
    $('.trd-theirs').classList.toggle('locked', !!theirs.l && !theirs.k); $('.trd-theirs').classList.toggle('accepted', !!theirs.k);
    $('.trd-lamps').innerHTML = [[t('You'), my], [T.nameOf(other), theirs]].map(([n, p]) => `<span class="trd-lamp ${p.k ? 'ok' : p.l ? 'lock' : ''}">${escapeHtml(n)}: ${escapeHtml(p.k ? t('ACCEPTED') : p.l ? t('LOCKED') : t('EDITING'))}</span>`).join('');
    // summary
    const gv = `${mine.items.length ? tf('{n} item(s)', { n: mine.items.length }) : t('nothing')}${mine.clout ? ` + ◈${fmt(mine.clout)}` : ''}`;
    const tv = `${theirs.i.length ? tf('{n} item(s)', { n: theirs.i.length }) : t('nothing')}${theirs.c ? ` + ◈${fmt(theirs.c)}` : ''}`;
    $('.trd-sum').innerHTML = `<div>${escapeHtml(t('You give'))}<b>${escapeHtml(gv)}</b></div><div>${escapeHtml(t('You get'))}<b>${escapeHtml(tv)}</b></div>`
      + (!theirs.i.length && !theirs.c && (mine.items.length || mine.clout) ? `<div class="warn">${escapeHtml(t('Careful: they are offering nothing.'))}</div>` : '')
      + (myV > 0 && thV > 0 && myV > thV * 2.5 ? `<div class="warn">${escapeHtml(t('Their offer is worth far less than yours.'))}</div>` : '');
    controls();
  }
  /** buttons + status line (also called every frame while a countdown runs) */
  function controls() {
    const s = T.snap();
    if (!s || done) return;
    const me = T.me(), other = T.peer();
    const my = s.p[me] || {}, th = s.p[other] || {};
    const cd = T.countdown();
    const editable = s.st === 'open' || s.st === 'countdown';
    lockB.textContent = my.l ? t('UNLOCK') : t('LOCK OFFER');
    lockB.classList.toggle('on', !!my.l);
    lockB.disabled = !editable || cd > 0;
    accB.textContent = my.k ? t('ACCEPTED') : t('ACCEPT');
    accB.disabled = !(editable && my.l && th.l && !my.k) || cd > 0;
    accB.classList.toggle('go', !!(my.l && th.l && !my.k));
    cin.disabled = !editable;
    let txt, go = false;
    if (cd > 0) { txt = `<span>${escapeHtml(tf('TRADE IN {n}', { n: cd.toFixed(1) }))}</span><div class="trd-bar"><i style="width:${Math.max(0, Math.min(100, (1 - cd / RULES.countdown) * 100))}%"></i></div>`; go = true; }
    else if (s.st === 'exec' || s.st === 'countdown') { txt = escapeHtml(t('Swapping...')); go = true; }   // countdown over, the host is moving the items
    else if (my.k) txt = escapeHtml(tf('Waiting for {name} to accept.', { name: T.nameOf(other) }));
    else if (my.l && th.l) txt = escapeHtml(t('Both locked. Press ACCEPT to confirm.'));
    else if (my.l) txt = escapeHtml(tf('Your offer is locked. Waiting for {name} to lock.', { name: T.nameOf(other) }));
    else if (th.l) txt = escapeHtml(tf('{name} locked their offer. Check it, then LOCK yours.', { name: T.nameOf(other) }));
    else txt = escapeHtml(t('Drag items in, set Clout, then LOCK. Any change resets the locks.'));
    stateEl.classList.toggle('go', go);
    stateEl.innerHTML = txt;
  }
  function update() { if (disposed || done) return; if (T.snap()) render(); }
  let acc = 0;
  function tick(dt) {
    if (disposed || done) return;
    const s = T.snap();
    if (!s) return;
    if (T.countdown() > 0) controls();
    msgT -= dt;
    if (msgT <= 0 && msgEl.textContent) msgEl.textContent = '';
    acc += dt;
    if (acc < 0.2) return;   // inventory / offer changes are picked up 5x a second
    acc = 0;
    const cur = signature(s, T.mine());
    if (cur !== sig && !drag) render();
  }
  function say(m) { msgEl.textContent = m ? t(m) : ''; msgT = 3; }

  // ------------------------------------------------------------------ tooltip (+ comparison)
  function showTip(id, ev) {
    const it = game.items.get(id);
    if (!it) return;
    if (!tip) { tip = document.createElement('div'); tip.className = 'tinv-tip'; document.body.appendChild(tip); }
    const tier = it.rarity();
    tip.style.setProperty('--tc', (TIERS[tier] || TIERS.common).color);
    const mineItem = T.entries().some((e) => e.id === id);
    const why = tradeBlock({ id, def: it.def, it, soulbound: it.soulbound });
    let html = itemTooltipHTML(it, it.def, { hint: mineItem ? t('DBL-CLICK / RMB: offer or take back · DRAG into the offer box') : '' });
    if (why && mineItem) html += `<div class="tt-block">${escapeHtml(t(why))}</div>`;
    if (!mineItem) {
      const base = comparableFor(asCmp(it), T.entries().map((e) => ({ id: e.id, def: e.def, inv: e.inv, ...asCmp(e.it) })));
      const rows = base ? compareItems(asCmp(it), base) : [];
      const shown = rows.filter((r) => r.delta !== 0 || r.key === 'value');
      if (base && shown.length) {
        const bn = ITEMS[base.def.id]?.name || base.def.name;
        html += `<div class="tt-cmp"><div class="cmp-h">${escapeHtml(tf('vs your {name}', { name: bn }))}</div>${shown.map((r) => `<div class="cmp-r"><span>${escapeHtml(t(r.label))}</span><b class="${r.better}">${r.delta > 0 ? '+' : ''}${r.delta}</b></div>`).join('')}</div>`;
      }
    }
    tip.innerHTML = html;
    if (ev) placeTip(ev.clientX, ev.clientY);
  }
  function placeTip(x, y) {
    if (!tip) return;
    const w = tip.offsetWidth || 300, h = tip.offsetHeight || 220;
    let lx = x + 22, ly = y + 16;
    if (lx + w > window.innerWidth - 8) lx = x - w - 18;
    if (ly + h > window.innerHeight - 8) ly = Math.max(8, window.innerHeight - h - 8);
    tip.style.left = Math.max(8, lx) + 'px'; tip.style.top = ly + 'px';
  }
  function hideTip() { tip?.remove(); tip = null; hoverId = null; }
  const onOver = (e) => {
    const it = e.target.closest?.('.trd-it');
    const id = it?.dataset.id || null;
    if (drag) return;
    if (id !== hoverId) { hoverId = id; if (!id) { tip?.remove(); tip = null; return; } showTip(id, e); }
  };
  const onLeave = () => hideTip();

  // ------------------------------------------------------------------ input: drag, double click, RMB
  const toggle = (id, side) => {
    if (side === 'mine') { T.removeOffer(id); return; }
    const it = T.entries().find((e) => e.id === id);
    if (!it) return;
    if (T.mine().items.includes(id)) { T.removeOffer(id); return; }
    const why = tradeBlock(it);
    if (why) { say(why); game.sfx?.('ui_error', 0.35); return; }
    if (T.mine().items.length >= RULES.maxItems) { say('Too many items.'); return; }
    T.addOffer(id);
  };
  const onDown = (e) => {
    if (e.button !== 0) return;
    const it = e.target.closest?.('.trd-it');
    if (!it || it.dataset.side === 'their') return;
    e.preventDefault();
    press = { id: it.dataset.id, side: it.dataset.side, x: e.clientX, y: e.clientY, el: it };
  };
  const onMove = (e) => {
    if (tip && !drag) placeTip(e.clientX, e.clientY);
    if (press && !drag && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) {
      hideTip();
      const g = document.createElement('div');
      g.className = 'trd-ghost';
      g.innerHTML = press.el.outerHTML;
      document.body.appendChild(g);
      drag = { ...press, ghost: g };
    }
    if (!drag) return;
    drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
    const under = document.elementFromPoint(e.clientX, e.clientY);
    $('.trd-mine').classList.toggle('hot', !!under?.closest?.('.trd-mine') && drag.side !== 'mine');
  };
  const onUp = (e) => {
    const p = press; press = null;
    if (!drag) {
      if (p && p.side === 'mine') T.removeOffer(p.id);   // plain click on an offered item takes it back
      return;
    }
    const d = drag; drag = null;
    d.ghost.remove();
    $('.trd-mine').classList.remove('hot');
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (d.side === 'mine') { if (!under?.closest?.('.trd-mine')) T.removeOffer(d.id); }
    else if (under?.closest?.('.trd-mine')) toggleAdd(d.id);
  };
  const toggleAdd = (id) => { if (!T.mine().items.includes(id)) toggle(id, 'inv'); };
  const onCtx = (e) => { const it = e.target.closest?.('.trd-it'); if (!it || it.dataset.side === 'their') return; e.preventDefault(); toggle(it.dataset.id, it.dataset.side); hideTip(); };
  const onDbl = (e) => { const it = e.target.closest?.('.trd-it'); if (!it || it.dataset.side === 'their') return; toggle(it.dataset.id, it.dataset.side); hideTip(); };
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointerover', onOver);
  root.addEventListener('pointerleave', onLeave);
  root.addEventListener('contextmenu', onCtx);
  root.addEventListener('dblclick', onDbl);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  cin.addEventListener('focus', () => { cinFocus = true; });
  cin.addEventListener('blur', () => { cinFocus = false; commitClout(); });
  cin.addEventListener('input', () => { clearTimeout(cinT); cinT = setTimeout(commitClout, 350); });
  cin.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { commitClout(); cin.blur(); } });
  cin.addEventListener('keyup', (e) => e.stopPropagation());
  function commitClout() {
    clearTimeout(cinT);
    const v = Math.max(0, Math.min(T.balance(), Math.floor(Number(cin.value) || 0)));
    cin.value = String(v);
    if (v !== T.mine().clout) T.setClout(v);
  }
  lockB.addEventListener('click', () => { commitClout(); T.lock(!(T.snap()?.p[T.me()]?.l)); });
  accB.addEventListener('click', () => T.accept());
  cancelB.addEventListener('click', () => T.cancel());

  // ------------------------------------------------------------------ TRADE COMPLETE
  function showDone(msg) {
    done = true;
    hideTip();
    const list = (arr) => (arr.length ? arr.map((x) => {
      const def = ITEMS[x.ty], tier = TIERS[x.tr] ? x.tr : tierOfItem(null, def || {});
      return `<div class="row" style="--tc:${TIERS[tier].color}">${iconHTML(x.ty, 'ico')}<span>${escapeHtml(def?.name || x.ty)}</span>${x.pl ? `<em>+${x.pl}</em>` : ''}</div>`;
    }).join('') : `<div class="trd-empty">${escapeHtml(t('nothing'))}</div>`);
    const d = $('.trd-done');
    d.innerHTML = `<h2>${escapeHtml(t('TRADE COMPLETE'))}</h2><div>${escapeHtml(tf('with {name}', { name: T.nameOf(msg.with) }))}</div>
      <div class="cols"><div><h4>${escapeHtml(t('You gave'))}</h4>${list(msg.gave || [])}${msg.cg ? `<div class="cl">◈ ${fmt(msg.cg)}</div>` : ''}</div>
      <div><h4>${escapeHtml(t('You received'))}</h4>${list(msg.got || [])}${msg.cr ? `<div class="cl">◈ ${fmt(msg.cr)}</div>` : ''}</div></div>
      <button class="btn primary trd-close">${escapeHtml(t('CLOSE'))}</button>`;
    d.classList.add('on');
    d.querySelector('.trd-close').addEventListener('click', () => T.close());
    flushIcons(40);
    d.querySelector('.trd-close').focus?.({ preventScroll: true });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(cinT);
    hideTip();
    drag?.ghost.remove(); drag = null;
    root.removeEventListener('pointerdown', onDown);
    root.removeEventListener('pointerover', onOver);
    root.removeEventListener('pointerleave', onLeave);
    root.removeEventListener('contextmenu', onCtx);
    root.removeEventListener('dblclick', onDbl);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }
  return { el: root, update, tick, showDone, say, dispose, flush: () => flushIcons(60) };
}
