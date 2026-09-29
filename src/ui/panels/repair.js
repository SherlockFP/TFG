// REPAIR UI (durability module): the workbench REPAIR tab (components + a little credit) and the HQ mechanic panel (credits only, pricier).
// Self-contained DOM + CSS (prefix drp-, amber CRT look like the workbench). All actions go through game.durability (host-authoritative);
// results come back through dura.onResult -> state.stamp + onChange().
import { ITEMS } from '../../game/items.js';
import { TIERS, tierColor } from '../../game/tiers.js';
import * as D from '../../game/durability_core.js';
import { iconImg } from '../icons.js';
import { t, tf } from '../../core/i18n.js';
import { humanizeId } from '../../core/util.js';
import { ensureDurStyle } from '../durability_style.js';

const CSS = `
.drp{display:grid;grid-template-columns:minmax(300px,38%) 1fr;gap:12px;height:100%;min-height:0;font-family:var(--font,'VT323',monospace);color:#ffdcb8}
.drp-list{display:flex;flex-direction:column;min-height:0;overflow:auto;padding-right:4px}
.drp-row{display:flex;gap:9px;align-items:center;padding:4px 7px;border:1px solid rgba(255,138,61,.16);background:rgba(0,0,0,.28);margin-bottom:4px;cursor:pointer;min-height:50px;width:100%;text-align:left;font-family:inherit;color:inherit}
.drp-row:hover{border-color:rgba(255,200,90,.6)}.drp-row.sel{border-color:var(--amber,#ff8a3d);background:rgba(255,138,61,.13)}
.drp-ic{width:44px;height:44px;flex:none;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,138,61,.25);background:rgba(0,0,0,.35)}
.drp-ic img{width:40px;height:40px;image-rendering:pixelated}
.drp-rn{flex:1;min-width:0}.drp-name{font-size:21px;color:#fff0dc;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.drp-mini{font-size:15px;opacity:.75;line-height:1.05}
.drp-bar{height:6px;background:#1a0d06;box-shadow:0 0 0 1px rgba(0,0,0,.7);margin-top:3px}.drp-bar>div{height:100%;background:#7dff7d}
.drp-bar.worn>div{background:#ffd23f}.drp-bar.critical>div{background:#ff4a3a}.drp-bar.broken>div{background:#4a4440}
.drp-detail{border:1px solid rgba(255,138,61,.28);background:rgba(0,0,0,.3);padding:12px 16px;overflow:auto;min-height:0;position:relative}
.drp-dh{display:flex;gap:16px;align-items:center;margin-bottom:8px}
.drp-big{width:88px;height:88px;flex:none;border:2px solid var(--tc,#ff8a3d);display:flex;align-items:center;justify-content:center;background:radial-gradient(circle,rgba(255,255,255,.08),rgba(0,0,0,.5))}
.drp-big img{width:76px;height:76px;image-rendering:pixelated}
.drp-dn{font-size:30px;color:#fff0dc;line-height:1}.drp-dd{font-size:19px;opacity:.85;line-height:1.1;margin-top:3px}
.drp-h{font-family:var(--font2,monospace);font-size:11px;letter-spacing:2px;color:var(--amber,#ff8a3d);margin:12px 0 6px}
.drp-ing{display:flex;align-items:center;gap:9px;padding:3px 6px;border-bottom:1px dashed rgba(255,138,61,.16);font-size:21px}
.drp-ing .drp-ic{width:34px;height:34px}.drp-ing .drp-ic img{width:30px;height:30px}.drp-ing .nm{flex:1}
.drp-cnt.ok{color:#7dff7d}.drp-cnt.no{color:#ff6b5a}
.drp-btn{font-family:inherit;font-size:26px;color:#1a0d04;background:var(--amber,#ff8a3d);border:1px solid var(--amber,#ff8a3d);padding:3px 26px;cursor:pointer;box-shadow:0 0 16px rgba(255,138,61,.45);letter-spacing:2px;margin-top:14px}
.drp-btn:hover{background:#ffb060}.drp-btn.dis{opacity:.32;pointer-events:none;filter:grayscale(.7)}
.drp-btn.ghost{background:rgba(255,138,61,.08);color:var(--amber,#ff8a3d);box-shadow:none;font-size:20px;padding:1px 12px;margin:0}
.drp-stamp{position:absolute;right:18px;top:12px;transform:rotate(-7deg);font-family:var(--font2,monospace);font-size:20px;letter-spacing:3px;padding:6px 14px;border:3px solid var(--tc,#7dff7d);color:var(--tc,#7dff7d);background:rgba(0,0,0,.6);pointer-events:none}
.drp-stamp.bad{--tc:#ff5a4a}.drp-stamp small{display:block;font-size:11px;letter-spacing:1px;margin-top:4px;opacity:.85}
.drp-empty{opacity:.65;font-size:20px;padding:14px}
.drp-note{font-size:17px;opacity:.8;margin-top:8px;line-height:1.15}
.drp-panel{width:min(1000px,96vw);height:min(600px,90vh);display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(14,9,4,.97),rgba(6,4,2,.97));border:1px solid var(--amber-dim,#a8531f);box-shadow:0 0 50px rgba(0,0,0,.85),inset 0 0 70px rgba(255,120,40,.06);padding:12px 18px;position:relative;overflow:hidden}
.drp-head{display:flex;align-items:baseline;gap:16px;margin-bottom:8px}.drp-title{font-family:var(--font2,monospace);font-size:19px;color:var(--amber,#ff8a3d);letter-spacing:3px}
.drp-sp{flex:1}.drp-pill{border:1px solid rgba(255,138,61,.4);padding:0 9px;font-size:18px;background:rgba(0,0,0,.3)}
.drp-body{flex:1;min-height:0}.drp-foot{display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:15px;opacity:.85}
@media (max-width:820px){.drp{grid-template-columns:1fr}}
`;
let styled = false;
function ensureStyle() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const s = document.createElement('style');
  s.id = 'tfg-repair-style'; s.textContent = CSS;
  document.head.appendChild(s);
  ensureDurStyle();
}
function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}
const nameOf = (id) => t(ITEMS[id]?.name || humanizeId(id));
const ico = (type) => { const b = mk('div', 'drp-ic'); try { b.appendChild(iconImg(type)); } catch { b.textContent = '?'; } return b; };
const fmt = (v) => String(Math.round(v || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Render the repair UI into `body`.  mode 'bench' (workbench tab) | 'hq' (mechanic).  state = { sel, stamp } (kept by the caller so
 * the periodic re-render of the crafting panel does not lose the selection).  onChange() re-renders after a result.
 */
export function renderRepairUI(body, { game, dura, mode = 'bench', state, onChange }) {
  ensureStyle();
  body.style.gridTemplateColumns = '1fr';
  const root = mk('div', 'drp');
  const items = dura.carried().map((it) => ({ it, i: D.durInfo(it) })).filter((e) => e.i && e.i.dur < e.i.max).sort((a, b) => a.i.frac - b.i.frac);
  if (!state.sel || !items.some((e) => e.it.id === state.sel)) state.sel = items[0]?.it.id || null;
  // ---- left: damaged items
  const list = mk('div', 'drp-list');
  list.appendChild(mk('div', 'drp-mini', mode === 'hq' ? t('Pay credits, get the item back as new. No parts needed.') : t('Bring parts and a little credit: restores 100%.')));
  for (const { it, i } of items) {
    const row = mk('button', 'drp-row' + (state.sel === it.id ? ' sel' : ''));
    const nm = mk('div', 'drp-rn');
    const bar = mk('div', 'drp-bar ' + i.state); const fill = mk('div'); fill.style.width = (i.broken ? 100 : Math.max(3, Math.round(i.frac * 100))) + '%'; bar.appendChild(fill);
    nm.append(mk('div', 'drp-name', t(it.def.name)), mk('div', 'drp-mini', i.broken ? t('BROKEN') : `${Math.round(i.dur)}/${Math.round(i.max)}`), bar);
    row.append(ico(it.type), nm);
    row.addEventListener('click', (e) => { e.stopPropagation(); state.sel = it.id; state.stamp = null; game.audio?.ui?.('ui_hover', 0.3); onChange(); });
    list.appendChild(row);
  }
  if (!items.length) list.appendChild(mk('div', 'drp-empty', t('Nothing needs repairing.')));
  root.appendChild(list);
  // ---- right: detail + cost
  const det = mk('div', 'drp-detail');
  root.appendChild(det);
  const sel = items.find((e) => e.it.id === state.sel);
  if (!sel) {
    det.appendChild(mk('div', 'drp-empty', t('Select a damaged weapon or armour.')));
    if (state.stamp) det.appendChild(stampEl(state.stamp));
  } else {
    const { it, i } = sel, plan = D.repairPlan(it, mode);
    const dh = mk('div', 'drp-dh'), big = mk('div', 'drp-big');
    big.style.setProperty('--tc', tierColor(i.tier));
    try { big.appendChild(iconImg(it.type)); } catch { big.textContent = '?'; }
    const dt = mk('div');
    dt.append(mk('div', 'drp-dn', t(it.def.name)), mk('div', 'drp-dd', `${t(TIERS[i.tier]?.name || i.tier)} · ${t('Durability')} ${i.broken ? t('BROKEN') : Math.round(i.dur) + '/' + Math.round(i.max)}`));
    dh.append(big, dt);
    det.appendChild(dh);
    if (state.stamp) det.appendChild(stampEl(state.stamp));
    if (!plan.ok) det.appendChild(mk('div', 'drp-dd', t(plan.reason)));
    else {
      det.appendChild(mk('div', 'drp-h', t('RESTORES')));
      det.appendChild(mk('div', 'drp-dd', tf('Back to {d}/{d} (100%)', { d: Math.round(plan.newMax) })));
      if (plan.aged) det.appendChild(mk('div', 'drp-note', tf('A full repair wears the item out a little: max durability {a} -> {b} (-5%, never below 60%).', { a: Math.round(i.max), b: Math.round(plan.newMax) })));
      else det.appendChild(mk('div', 'drp-note', t('A small repair does not age the item.')));
      det.appendChild(mk('div', 'drp-h', t('COST')));
      let can = true;
      const row = (icon, label, have, need, unit = '') => {
        const ok = have >= need; can = can && ok;
        const l = mk('div', 'drp-ing'); l.append(icon, mk('span', 'nm', label), mk('span', 'drp-cnt ' + (ok ? 'ok' : 'no'), `${fmt(have)} / ${fmt(need)}${unit}`)); det.appendChild(l);
      };
      for (const [id, n] of plan.comps) row(ico(id), nameOf(id), dura.count(id), n);
      if (plan.shard) row(ico(plan.shard), `${nameOf(plan.shard)} (${t('broken item')})`, dura.count(plan.shard), 1);
      row(Object.assign(mk('div', 'drp-ic'), { textContent: '▮' }), t('Credits (ship funds)'), game.run?.credits || 0, plan.credits);
      const btn = mk('button', 'drp-btn' + (can && !state.busy ? '' : ' dis'), t('REPAIR'));
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!can || state.busy) return;
        state.busy = true; state.stamp = null;
        setTimeout(() => { state.busy = false; }, 500);
        dura.requestRepair(it.id, mode);
        onChange();
      });
      det.appendChild(btn);
      if (mode === 'bench') det.appendChild(mk('div', 'drp-note', t('The HQ mechanic repairs for credits only (a bit pricier). A Repair Kit restores 40% anywhere.')));
    }
  }
  body.appendChild(root);
  return root;
}
function stampEl(s) {
  const e = mk('div', 'drp-stamp' + (s.bad ? ' bad' : ''), s.text);
  if (s.color) e.style.setProperty('--tc', s.color);
  if (s.sub) e.appendChild(mk('small', '', s.sub));
  return e;
}

/** HQ mechanic panel (own frame). -> { el, refresh, dispose } */
export function createHqRepairPanel({ game, dura, onClose }) {
  ensureStyle();
  const state = { sel: null, stamp: null, busy: false };
  const el = mk('div', 'drp-panel');
  let disposed = false;
  const render = () => {
    if (disposed) return;
    el.replaceChildren();
    const head = mk('div', 'drp-head');
    head.append(mk('div', 'drp-title', t('MECHANIC')), mk('div', 'drp-sp'), mk('div', 'drp-pill', `▮ ${fmt(game.run?.credits || 0)}`));
    const body = mk('div', 'drp-body');
    renderRepairUI(body, { game, dura, mode: 'hq', state, onChange: render });
    const foot = mk('div', 'drp-foot');
    const close = mk('button', 'drp-btn ghost', t('Close'));
    close.addEventListener('click', (e) => { e.stopPropagation(); onClose?.(); });
    foot.append(mk('div', '', t('Credits only. Repairs restore 100% of the (slightly aged) maximum.') + '   [ESC]'), close);
    el.append(head, body, foot);
  };
  const poll = setInterval(() => { if (!disposed && !state.busy && el.isConnected) render(); }, 900);
  render();
  return { el, state, refresh: render, dispose() { disposed = true; clearInterval(poll); } };
}
