// WORKBENCH panel (ship workbench, [E]): CRAFT · UPGRADE · DISMANTLE · ANALYZE · BLUEPRINTS.
// Self-contained DOM + injected CSS in the dark CRT / amber look of style.css (same family as panels/record.js).
// The panel is dumb: every action goes through game.crafting (host-authoritative), results come back through api.on().
import { ITEMS, itemDef, isSellable } from '../../game/items.js';
import { TIERS, TIER_ORDER, tierOfItem, tierColor } from '../../game/tiers.js';
import { COMPONENT_IDS, COMPONENT_COLOR } from '../../game/components.js';
import { BLUEPRINTS, CATS, tierOdds, upgradeInfo, isUpgradable } from '../../game/recipes.js';
import { analyzeInfo, dismantleYield, dismantleBlock, isStrange } from '../../game/research.js';
import { iconImg } from '../icons.js';
import { t } from '../../core/i18n.js';

const STYLE_ID = 'tfg-crafting-style';
const CSS = `
.crp{width:min(1160px,96vw);height:min(760px,92vh);display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(14,9,4,.97),rgba(6,4,2,.97));
 border:1px solid var(--amber-dim,#a8531f);box-shadow:0 0 50px rgba(0,0,0,.85),inset 0 0 70px rgba(255,120,40,.06);padding:12px 18px;position:relative;overflow:hidden;font-family:var(--font,'VT323',monospace);color:var(--text,#ffd9b8)}
.crp::before{content:'';position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px);mix-blend-mode:multiply;z-index:3}
.crp-head{display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;margin-bottom:6px}
.crp-title{font-family:var(--font2,monospace);font-size:19px;color:var(--amber,#ff8a3d);letter-spacing:3px;text-shadow:0 0 12px rgba(255,138,61,.45)}
.crp-sub{opacity:.75;font-size:19px}.crp-sp{flex:1}
.crp-pill{border:1px solid rgba(255,138,61,.4);padding:0 9px;font-size:18px;background:rgba(0,0,0,.3)}
.crp-tabs{display:flex;gap:4px;border-bottom:1px solid rgba(255,138,61,.3);margin-bottom:8px;flex-wrap:wrap}
.crp-tab{font-family:var(--font2,monospace);font-size:11px;letter-spacing:2px;padding:8px 12px;cursor:pointer;color:var(--amber-dim,#a8531f);border:1px solid transparent;border-bottom:none;user-select:none;background:none}
.crp-tab:hover{color:var(--amber,#ff8a3d)}
.crp-tab.sel{color:#1a0d04;background:var(--amber,#ff8a3d);box-shadow:0 0 14px rgba(255,138,61,.5)}
.crp-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(340px,40%) 1fr;gap:12px}
.crp-list{display:flex;flex-direction:column;min-height:0}
.crp-cats{display:flex;gap:3px;flex-wrap:nowrap;margin-bottom:6px;overflow:hidden}
.crp-chip{border:1px solid rgba(255,138,61,.35);padding:0 6px;font-size:15px;text-transform:uppercase;white-space:nowrap;cursor:pointer;user-select:none;background:none;color:inherit;font-family:inherit}
.crp-chip:hover{border-color:var(--amber,#ff8a3d)}.crp-chip.sel{background:rgba(255,138,61,.22);border-color:var(--amber,#ff8a3d);color:#fff0dc}
.crp-rows{overflow:auto;flex:1;min-height:0;padding-right:4px}
.crp-row{display:flex;gap:9px;align-items:center;padding:4px 7px;border:1px solid rgba(255,138,61,.16);background:rgba(0,0,0,.28);margin-bottom:4px;cursor:pointer;min-height:50px;width:100%;text-align:left;font-family:inherit;color:inherit}
.crp-row:hover{border-color:rgba(255,200,90,.6)}
.crp-row.sel{border-color:var(--amber,#ff8a3d);background:rgba(255,138,61,.13);box-shadow:inset 0 0 18px rgba(255,150,60,.12)}
.crp-row.locked{opacity:.55}
.crp-ic{width:44px;height:44px;flex:none;display:flex;align-items:center;justify-content:center;font-size:26px;border:1px solid rgba(255,138,61,.25);background:rgba(0,0,0,.35)}
.crp-ic img{width:40px;height:40px;image-rendering:pixelated}
.crp-rn{flex:1;min-width:0}.crp-name{font-size:21px;color:#fff0dc;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.crp-mini{font-size:15px;opacity:.72;line-height:1.05}
.crp-tag{font-family:var(--font2,monospace);font-size:9px;letter-spacing:1px;padding:2px 5px;border:1px solid}
.crp-tag.ok{color:#7dff7d;border-color:#2f8f3a;background:rgba(40,120,50,.18)}.crp-tag.no{color:#8a6a55;border-color:#4a3527}.crp-tag.lock{color:#7fc4ff;border-color:#2f5f95}
.crp-detail{border:1px solid rgba(255,138,61,.28);background:rgba(0,0,0,.3);padding:12px 16px;overflow:auto;min-height:0;position:relative}
.crp-dh{display:flex;gap:16px;align-items:center;margin-bottom:8px}
.crp-big{width:88px;height:88px;flex:none;border:2px solid var(--tc,#ff8a3d);display:flex;align-items:center;justify-content:center;background:radial-gradient(circle,rgba(255,255,255,.08),rgba(0,0,0,.5));box-shadow:0 0 22px var(--tg,rgba(255,138,61,.3)),inset 0 0 16px rgba(0,0,0,.6)}
.crp-big img{width:76px;height:76px;image-rendering:pixelated}
.crp-dn{font-size:32px;color:#fff0dc;line-height:1;text-shadow:0 0 10px rgba(255,138,61,.4)}.crp-dd{font-size:19px;opacity:.85;line-height:1.1;margin-top:3px}
.crp-h{font-family:var(--font2,monospace);font-size:11px;letter-spacing:2px;color:var(--amber,#ff8a3d);margin:12px 0 6px}
.crp-ing{display:flex;align-items:center;gap:9px;padding:3px 6px;border-bottom:1px dashed rgba(255,138,61,.16);font-size:21px}
.crp-ing .crp-ic{width:34px;height:34px}.crp-ing .crp-ic img{width:30px;height:30px}
.crp-ing .nm{flex:1}.crp-cnt{font-size:22px}.crp-cnt.ok{color:#7dff7d}.crp-cnt.no{color:#ff6b5a}
.crp-odds{display:flex;height:22px;border:1px solid rgba(255,138,61,.4);overflow:hidden;background:#000}
.crp-odds>span{display:flex;align-items:center;justify-content:center;font-size:15px;color:#0a0503;min-width:2px;text-shadow:none;white-space:nowrap;overflow:hidden}
.crp-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:17px;margin-top:4px}.crp-legend i{display:inline-block;width:10px;height:10px;margin-right:4px}
.crp-act{display:flex;gap:12px;align-items:center;margin-top:14px}
.crp-btn{font-family:var(--font,monospace);font-size:26px;color:#1a0d04;background:var(--amber,#ff8a3d);border:1px solid var(--amber,#ff8a3d);padding:3px 26px;cursor:pointer;box-shadow:0 0 16px rgba(255,138,61,.45);letter-spacing:2px}
.crp-btn:hover{background:#ffb060}.crp-btn.dis{opacity:.32;pointer-events:none;filter:grayscale(.7)}
.crp-btn.ghost{background:rgba(255,138,61,.08);color:var(--amber,#ff8a3d);box-shadow:none;font-size:20px;padding:1px 12px}.crp-btn.ghost:hover{background:var(--amber,#ff8a3d);color:#150a02}
.crp-prog{flex:1;height:24px;border:1px solid var(--amber-dim,#a8531f);background:rgba(0,0,0,.5);position:relative;overflow:hidden}
.crp-prog>span{position:absolute;left:0;top:0;bottom:0;width:0;background:repeating-linear-gradient(90deg,#ff8a3d 0 8px,#ffb060 8px 10px);box-shadow:0 0 12px rgba(255,150,60,.7)}
.crp-prog>b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:400;font-size:17px;letter-spacing:2px;color:#fff0dc;mix-blend-mode:difference}
.crp-stamp{position:absolute;right:18px;top:12px;transform:rotate(-7deg);font-family:var(--font2,monospace);font-size:20px;letter-spacing:3px;padding:6px 14px;border:3px solid var(--tc,#7dff7d);color:var(--tc,#7dff7d);
 background:rgba(0,0,0,.6);text-shadow:0 0 12px var(--tc,#7dff7d);animation:crpStamp .45s cubic-bezier(.2,1.6,.4,1) both;pointer-events:none}
.crp-stamp.bad{--tc:#ff5a4a}.crp-stamp small{display:block;font-size:11px;letter-spacing:1px;margin-top:4px;opacity:.85}
@keyframes crpStamp{from{opacity:0;transform:rotate(-7deg) scale(2.4)}to{opacity:1;transform:rotate(-7deg) scale(1)}}
.crp-comps{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,138,61,.3)}
.crp-comp{display:flex;align-items:center;gap:4px;border:1px solid rgba(255,138,61,.22);padding:0 6px 0 2px;font-size:18px;background:rgba(0,0,0,.3)}
.crp-comp img{width:24px;height:24px;image-rendering:pixelated}.crp-comp.z{opacity:.4}.crp-comp b{font-weight:400;color:var(--cc,#fff)}
.crp-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:6px;flex-wrap:wrap}
.crp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
.crp-bp{border:1px solid #2f5f95;background:linear-gradient(180deg,rgba(20,52,92,.5),rgba(6,16,32,.7));padding:10px 12px;position:relative}
.crp-bp.off{filter:grayscale(1) brightness(.5);border-color:#3a3a3a}.crp-bp .n{font-size:24px;color:#dff2ff}.crp-bp .d{font-size:17px;opacity:.85}.crp-bp .s{font-size:16px;color:#7fc4ff;margin-top:4px}
.crp-empty{opacity:.6;font-size:20px;padding:14px}
.crp-tier{font-family:var(--font2,monospace);font-size:9px;letter-spacing:1px;padding:2px 5px;border:1px solid var(--tc);color:var(--tc)}
.crp-arrow{font-size:28px;color:var(--amber,#ff8a3d);margin:0 6px}
@media (max-width:820px){.crp-body{grid-template-columns:1fr}}
`;
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID; s.textContent = CSS;
  document.head.appendChild(s);
}
function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}
const icon = (type, fallback = '?') => {
  const box = mk('div', 'crp-ic');
  try { box.appendChild(iconImg(type)); } catch { box.textContent = fallback; }
  return box;
};
const nameOf = (id) => t(ITEMS[id]?.name || id);
const fmt = (v) => String(Math.round(v || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const pct = (p) => (p >= 0.995 ? '100' : p < 0.01 ? '<1' : String(Math.round(p * 100)));
const CAT_LABEL = { survival: 'survival', combat: 'combat', tools: 'tools', gear: 'gear', arcane: 'arcane', tech: 'tech' };

let lastTab = 'craft';
let lastCat = 'all';

/** opts: { game, api (game.crafting), tab, onClose } -> { el, refresh, onResult, dispose } */
export function createCraftingPanel({ game, api, tab, onClose } = {}) {
  ensureStyle();
  if (tab) lastTab = tab;
  const root = mk('div', 'crp');
  root.addEventListener('keydown', (e) => { const tg = e.target?.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') e.stopPropagation(); });
  const sfx = (n = 'ui_click', v = 0.5) => { try { game.audio?.ui?.(n, v); } catch { /* ignore */ } };
  let sel = null;          // selected recipe id | item id
  let busy = null;         // { until, timer } while the progress bar runs
  let stamp = null;        // last result { text, sub, bad, color }
  let disposed = false;
  let poll = null;

  const state = () => ({ luck: api.luck(), recipes: api.recipes() });

  function render() {
    if (disposed) return;
    const listScroll = root.querySelector('.crp-rows')?.scrollTop || 0;
    const detScroll = root.querySelector('.crp-detail')?.scrollTop || 0;
    const focusNav = document.activeElement?.dataset?.nav;
    root.replaceChildren();
    const st = state();
    const head = mk('div', 'crp-head');
    head.append(mk('div', 'crp-title', t('WORKBENCH')), mk('div', 'crp-sub', 'FABRICATOR MK-I'), mk('div', 'crp-sp'),
      mk('div', 'crp-pill', `▮ ${fmt(game.run?.credits || 0)}`),
      mk('div', 'crp-pill', `${t('LUCK')} +${Math.round(st.luck * 100)}%`),
      mk('div', 'crp-pill', `${t('BLUEPRINTS')} ${api.blueprints().length}/${Object.keys(BLUEPRINTS).length}`));
    root.appendChild(head);
    const tabs = mk('div', 'crp-tabs');
    for (const id of ['craft', 'upgrade', 'dismantle', 'analyze', 'blueprints', ...(game.durability ? ['repair'] : [])]) {   // [durability] REPAIR tab
      const b = mk('button', 'crp-tab' + (lastTab === id ? ' sel' : ''), t(id.toUpperCase()));
      b.dataset.nav = 'crp:' + id;
      b.addEventListener('click', (e) => { e.stopPropagation(); if (busy) return; lastTab = id; sel = null; stamp = null; sfx(); render(); root.querySelector(`[data-nav="crp:${id}"]`)?.focus({ preventScroll: true }); });
      tabs.appendChild(b);
    }
    root.appendChild(tabs);
    const body = mk('div', 'crp-body');
    root.appendChild(body);
    try {
      if (lastTab === 'craft') renderCraft(body, st);
      else if (lastTab === 'upgrade') renderUpgrade(body, st);
      else if (lastTab === 'dismantle') renderDismantle(body);
      else if (lastTab === 'analyze') renderAnalyze(body);
      else if (lastTab === 'repair' && game.durability) game.durability.renderRepairTab(body, render);   // [durability]
      else renderBlueprints(body);
    } catch (e) { console.warn('[crafting panel]', e); body.appendChild(mk('div', 'crp-empty', 'Error: ' + e.message)); }
    // component stock bar
    const comps = mk('div', 'crp-comps');
    for (const id of COMPONENT_IDS) {
      const n = api.have(id);
      const c = mk('div', 'crp-comp' + (n ? '' : ' z'));
      c.style.setProperty('--cc', COMPONENT_COLOR[id] || '#fff');
      c.title = nameOf(id);
      c.append(icon(id, '·').firstChild || mk('span', '', '·'), Object.assign(mk('b', '', n), {}));
      comps.appendChild(c);
    }
    root.appendChild(comps);
    const foot = mk('div', 'crp-foot');
    foot.append(mk('div', 'crp-mini', t('Ingredients: items you hold + items lying on the bench.') + '   [ESC]'), (() => { const b = mk('button', 'crp-btn ghost', t('Close')); b.addEventListener('click', (e) => { e.stopPropagation(); sfx(); onClose?.(); }); return b; })());
    root.appendChild(foot);
    const rows = root.querySelector('.crp-rows'); if (rows) rows.scrollTop = listScroll;
    const det = root.querySelector('.crp-detail'); if (det) det.scrollTop = detScroll;
    if (focusNav) root.querySelector(`[data-nav="${focusNav}"]`)?.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- CRAFT
  function renderCraft(body, st) {
    const left = mk('div', 'crp-list');
    const cats = mk('div', 'crp-cats');
    for (const c of ['all', ...CATS]) {
      const b = mk('button', 'crp-chip' + (lastCat === c ? ' sel' : ''), t(c === 'all' ? 'ALL' : CAT_LABEL[c]));
      b.addEventListener('click', (e) => { e.stopPropagation(); lastCat = c; sfx('ui_hover', 0.3); render(); });
      cats.appendChild(b);
    }
    left.appendChild(cats);
    const rows = mk('div', 'crp-rows');
    const list = st.recipes.filter((r) => lastCat === 'all' || r.cat === lastCat);
    list.sort((a, b) => (a.locked - b.locked) || (api.status(b).can - api.status(a).can) || 0);
    if (!sel || !list.some((r) => r.id === sel)) sel = list[0]?.id || null;
    for (const r of list) {
      const s = api.status(r);
      const row = mk('button', 'crp-row' + (sel === r.id ? ' sel' : '') + (r.locked ? ' locked' : ''));
      row.dataset.nav = 'crp:r:' + r.id;
      const nm = mk('div', 'crp-rn');
      nm.append(mk('div', 'crp-name', t(r.name)), mk('div', 'crp-mini', r.locked ? t('Blueprint required') : r.in.map(([id, n]) => `${nameOf(id)} ${n}`).join(' · ')));
      row.append(r.locked ? Object.assign(mk('div', 'crp-ic'), { textContent: '🔒' }) : icon(r.out), nm, mk('span', 'crp-tag ' + (r.locked ? 'lock' : s.can ? 'ok' : 'no'), r.locked ? 'BP' : s.can ? 'READY' : '—'));
      row.addEventListener('click', (e) => { e.stopPropagation(); if (busy) return; sel = r.id; stamp = null; sfx('ui_hover', 0.3); render(); });
      rows.appendChild(row);
    }
    if (!list.length) rows.appendChild(mk('div', 'crp-empty', t('Nothing here yet.')));
    left.appendChild(rows);
    body.appendChild(left);
    const det = mk('div', 'crp-detail');
    body.appendChild(det);
    const r = list.find((x) => x.id === sel);
    if (!r) { det.appendChild(mk('div', 'crp-empty', t('Select a recipe.'))); return; }
    const s = api.status(r);
    const odds = tierOdds(r.tier, st.luck);
    const top = odds.length ? odds[odds.length - 1].tier : (ITEMS[r.out]?.tier || 'common');
    const tc = tierColor(r.tier ? top : ITEMS[r.out]?.tier || 'common');
    const dh = mk('div', 'crp-dh');
    const big = mk('div', 'crp-big');
    big.style.setProperty('--tc', tc); big.style.setProperty('--tg', tc + '66');
    try { big.appendChild(iconImg(r.out)); } catch { big.textContent = '?'; }
    const dt = mk('div');
    dt.append(mk('div', 'crp-dn', t(r.name) + (r.n > 1 ? ` ×${r.n}` : '')), mk('div', 'crp-dd', t(r.desc)));
    dh.append(big, dt);
    det.appendChild(dh);
    if (stamp) { const sp = mk('div', 'crp-stamp' + (stamp.bad ? ' bad' : ''), stamp.text); if (stamp.color) sp.style.setProperty('--tc', stamp.color); if (stamp.sub) sp.appendChild(mk('small', '', stamp.sub)); det.appendChild(sp); }
    det.appendChild(mk('div', 'crp-h', t('INGREDIENTS')));
    for (const row of s.rows) {
      const line = mk('div', 'crp-ing');
      line.append(icon(row.id), mk('span', 'nm', nameOf(row.id)), mk('span', 'crp-cnt ' + (row.ok ? 'ok' : 'no'), `${row.have} / ${row.need}`));
      det.appendChild(line);
    }
    if (r.credits) { const line = mk('div', 'crp-ing'); line.append(Object.assign(mk('div', 'crp-ic'), { textContent: '▮' }), mk('span', 'nm', t('Credits (ship funds)')), mk('span', 'crp-cnt ' + (s.credits.ok ? 'ok' : 'no'), `${fmt(s.credits.have)} / ${fmt(r.credits)}`)); det.appendChild(line); }
    if (r.bp) { const line = mk('div', 'crp-ing'); line.append(Object.assign(mk('div', 'crp-ic'), { textContent: '📐' }), mk('span', 'nm', `${t('Blueprint')}: ${t(BLUEPRINTS[r.bp].name)}`), mk('span', 'crp-cnt ' + (s.bp.ok ? 'ok' : 'no'), s.bp.ok ? t('KNOWN') : t('UNKNOWN'))); det.appendChild(line); }
    if (r.locked) { det.appendChild(mk('div', 'crp-dd', `${t('Unlocked by analyzing')}: ${t(BLUEPRINTS[r.bp].from)}`)); }
    det.appendChild(mk('div', 'crp-h', t('TIER CHANCE')));
    det.appendChild(oddsBar(odds));
    det.appendChild(actionRow(r.time, s.can && !r.locked, t('CRAFT'), () => api.craft(r.id), r.locked ? t('LOCKED') : !s.can ? t('MISSING PARTS') : null));
  }
  function oddsBar(odds) {
    if (!odds.length) return mk('div', 'crp-dd', t('This item has no tier.'));
    const wrap = mk('div');
    const bar = mk('div', 'crp-odds');
    for (const o of odds) { const sp = mk('span', '', o.p >= 0.08 ? pct(o.p) + '%' : ''); sp.style.width = o.p * 100 + '%'; sp.style.background = tierColor(o.tier); bar.appendChild(sp); }
    const leg = mk('div', 'crp-legend');
    for (const o of odds) { const i = mk('span'); const sw = mk('i'); sw.style.background = tierColor(o.tier); i.append(sw, `${TIERS[o.tier].name} ${pct(o.p)}%`); leg.appendChild(i); }
    wrap.append(bar, leg);
    return wrap;
  }
  // progress bar + big button: run the bar (with ticking sounds), then fire the request
  function actionRow(seconds, enabled, label, fire, why) {
    const row = mk('div', 'crp-act');
    const prog = mk('div', 'crp-prog');
    const fill = mk('span');
    const txt = mk('b', '', busy ? t('WORKING...') : why || t('READY'));
    prog.append(fill, txt);
    const btn = mk('button', 'crp-btn' + (enabled && !busy ? '' : ' dis'), label);
    btn.dataset.nav = 'crp:go';
    btn.addEventListener('click', (e) => { e.stopPropagation(); if (!enabled || busy) return; start(seconds, fire, fill, txt); });
    row.append(btn, prog);
    if (busy) { fill.style.width = Math.min(100, (1 - (busy.until - performance.now()) / busy.total) * 100) + '%'; }
    return row;
  }
  function start(seconds, fire, fill, txt) {
    const total = Math.max(700, seconds * 1000);
    busy = { until: performance.now() + total, total };
    stamp = null;
    txt.textContent = t('WORKING...');
    let last = 0;
    const tick = () => {
      if (disposed || !busy) return;
      const left = busy.until - performance.now();
      const f = Math.min(1, 1 - left / busy.total);
      fill.style.width = f * 100 + '%';
      const step = Math.floor(f * 9);
      if (step !== last) { last = step; sfx(step % 3 === 0 ? 'hit_metal' : 'lockpick_click', step % 3 === 0 ? 0.3 : 0.4); }
      if (left <= 0) { busy = null; try { fire(); } catch (e) { console.warn(e); } return; }
      busy.timer = requestAnimationFrame(tick);
    };
    busy.timer = requestAnimationFrame(tick);
    sfx('wire_connect', 0.45);
  }

  // ---------------------------------------------------------------- UPGRADE
  function renderUpgrade(body, st) {
    const left = mk('div', 'crp-list');
    left.appendChild(mk('div', 'crp-mini', t('Pick a weapon you carry or leave on the bench.')));
    const rows = mk('div', 'crp-rows');
    const items = api.carried().filter((it) => isUpgradable(it.def));
    if (!sel || !items.some((it) => it.id === sel)) sel = items[0]?.id || null;
    for (const it of items) {
      const tr = tierOfItem(it, it.def);
      const row = mk('button', 'crp-row' + (sel === it.id ? ' sel' : ''));
      row.dataset.nav = 'crp:u:' + it.id;
      const nm = mk('div', 'crp-rn');
      nm.append(mk('div', 'crp-name', t(it.def.name)), mk('div', 'crp-mini', `${TIERS[tr].name}${it.affix ? ' · affixed' : ''}${it.soulbound ? ' · soulbound' : ''}`));
      const tag = mk('span', 'crp-tier', TIERS[tr].name.toUpperCase()); tag.style.setProperty('--tc', tierColor(tr));
      row.append(icon(it.type), nm, tag);
      row.addEventListener('click', (e) => { e.stopPropagation(); if (busy) return; sel = it.id; stamp = null; sfx('ui_hover', 0.3); render(); });
      rows.appendChild(row);
    }
    if (!items.length) rows.appendChild(mk('div', 'crp-empty', t('No weapon in reach. Hold one or put it on the bench.')));
    left.appendChild(rows);
    body.appendChild(left);
    const det = mk('div', 'crp-detail');
    body.appendChild(det);
    const it = items.find((x) => x.id === sel);
    if (!it) { det.appendChild(mk('div', 'crp-empty', t('Select a weapon.'))); return; }
    const cur = tierOfItem(it, it.def);
    const u = upgradeInfo(cur, st.luck);
    const dh = mk('div', 'crp-dh');
    const big = mk('div', 'crp-big'); big.style.setProperty('--tc', tierColor(cur)); big.style.setProperty('--tg', tierColor(cur) + '66');
    try { big.appendChild(iconImg(it.type)); } catch { big.textContent = '?'; }
    const dt = mk('div');
    const line = mk('div', 'crp-dn'); line.append(t(it.def.name));
    dt.append(line);
    if (u) {
      const a = mk('div', 'crp-dd'); a.append(Object.assign(mk('span', 'crp-tier', TIERS[cur].name.toUpperCase()), {}), mk('span', 'crp-arrow', '→'), mk('span', 'crp-tier', TIERS[u.to].name.toUpperCase()));
      a.firstChild.style.setProperty('--tc', tierColor(cur)); a.lastChild.style.setProperty('--tc', tierColor(u.to));
      dt.appendChild(a);
    } else dt.appendChild(mk('div', 'crp-dd', t(cur !== 'mythic' && TIER_ORDER.indexOf(cur) >= 2 ? 'Workbench upgrades stop at Rare. Use the Ascension Altar at HQ.' : 'Already at the top tier.')));   // [forge]
    dh.append(big, dt);
    det.appendChild(dh);
    if (stamp) { const sp = mk('div', 'crp-stamp' + (stamp.bad ? ' bad' : ''), stamp.text); if (stamp.color) sp.style.setProperty('--tc', stamp.color); if (stamp.sub) sp.appendChild(mk('small', '', stamp.sub)); det.appendChild(sp); }
    if (!u) return;
    // costs exclude the weapon itself
    det.appendChild(mk('div', 'crp-h', t('COST')));
    let can = true;
    for (const [id, need] of u.in) {
      const have = api.carried().filter((x) => x !== it && x.type === id).length;
      const ok = have >= need; can = can && ok;
      const l = mk('div', 'crp-ing'); l.append(icon(id), mk('span', 'nm', nameOf(id)), mk('span', 'crp-cnt ' + (ok ? 'ok' : 'no'), `${have} / ${need}`)); det.appendChild(l);
    }
    const cr = game.run?.credits || 0, cok = cr >= u.credits; can = can && cok;
    const cl = mk('div', 'crp-ing'); cl.append(Object.assign(mk('div', 'crp-ic'), { textContent: '▮' }), mk('span', 'nm', t('Credits (ship funds)')), mk('span', 'crp-cnt ' + (cok ? 'ok' : 'no'), `${fmt(cr)} / ${fmt(u.credits)}`)); det.appendChild(cl);
    let bpOk = true;
    if (u.bp) { bpOk = api.blueprints().includes(u.bp); can = can && bpOk; const l = mk('div', 'crp-ing'); l.append(Object.assign(mk('div', 'crp-ic'), { textContent: '📐' }), mk('span', 'nm', `${t('Blueprint')}: ${t(BLUEPRINTS[u.bp].name)}`), mk('span', 'crp-cnt ' + (bpOk ? 'ok' : 'no'), bpOk ? t('KNOWN') : t('UNKNOWN'))); det.appendChild(l); }
    det.appendChild(mk('div', 'crp-h', t('SUCCESS CHANCE')));
    const chance = mk('div', 'crp-odds'); const sp = mk('span', '', pct(u.chance) + '%'); sp.style.width = u.chance * 100 + '%'; sp.style.background = '#7dff7d'; const sp2 = mk('span', '', ''); sp2.style.width = (1 - u.chance) * 100 + '%'; sp2.style.background = '#ff5a4a'; chance.append(sp, sp2);
    det.append(chance, mk('div', 'crp-dd', t('On failure the weapon is kept; parts are lost and half the credits.')));
    det.appendChild(actionRow(3, can, t('UPGRADE'), () => api.upgrade(it.id), !can ? t('MISSING PARTS') : null));
  }

  // ---------------------------------------------------------------- DISMANTLE / ANALYZE lists
  function itemRows(body, items, kindLabel, detailFn) {
    const left = mk('div', 'crp-list');
    left.appendChild(mk('div', 'crp-mini', kindLabel));
    const rows = mk('div', 'crp-rows');
    if (!sel || !items.some((it) => it.id === sel)) sel = items[0]?.id || null;
    for (const it of items) {
      const row = mk('button', 'crp-row' + (sel === it.id ? ' sel' : ''));
      row.dataset.nav = 'crp:i:' + it.id;
      const nm = mk('div', 'crp-rn');
      nm.append(mk('div', 'crp-name', t(it.def.name)), mk('div', 'crp-mini', `${isSellable(it.def) && it.value ? '▮' + it.value : ''} ${it.holder ? '' : '· ' + t('on bench')}`));
      row.append(icon(it.type), nm);
      row.addEventListener('click', (e) => { e.stopPropagation(); if (busy) return; sel = it.id; stamp = null; sfx('ui_hover', 0.3); render(); });
      rows.appendChild(row);
    }
    if (!items.length) rows.appendChild(mk('div', 'crp-empty', t('Nothing suitable in reach. Hold items or put them on the bench.')));
    left.appendChild(rows);
    body.appendChild(left);
    const det = mk('div', 'crp-detail');
    body.appendChild(det);
    const it = items.find((x) => x.id === sel);
    if (!it) { det.appendChild(mk('div', 'crp-empty', t('Select an item.'))); return; }
    detailFn(det, it);
  }
  function itemHead(det, it, sub) {
    const dh = mk('div', 'crp-dh');
    const tr = tierOfItem(it, it.def);
    const big = mk('div', 'crp-big'); big.style.setProperty('--tc', tierColor(tr)); big.style.setProperty('--tg', tierColor(tr) + '66');
    try { big.appendChild(iconImg(it.type)); } catch { big.textContent = '?'; }
    const dt = mk('div');
    dt.append(mk('div', 'crp-dn', t(it.def.name)), mk('div', 'crp-dd', sub));
    dh.append(big, dt);
    det.appendChild(dh);
    if (stamp) { const sp = mk('div', 'crp-stamp' + (stamp.bad ? ' bad' : ''), stamp.text); if (stamp.color) sp.style.setProperty('--tc', stamp.color); if (stamp.sub) sp.appendChild(mk('small', '', stamp.sub)); det.appendChild(sp); }
  }
  function renderDismantle(body) {
    const items = api.carried().filter((it) => !dismantleBlock(it));
    itemRows(body, items, t('Turn scrap into components instead of selling it.'), (det, it) => {
      itemHead(det, it, `${isSellable(it.def) && it.value ? t('Sells for') + ' ▮' + it.value + ' · ' : ''}${t('SELL / DISMANTLE / KEEP - your call.')}`);
      det.appendChild(mk('div', 'crp-h', t('YIELDS')));
      for (const [id, n] of dismantleYield(it.type, { value: it.baseValue || it.value })) {
        const l = mk('div', 'crp-ing'); l.append(icon(id), mk('span', 'nm', nameOf(id)), mk('span', 'crp-cnt ok', '×' + n)); det.appendChild(l);
      }
      det.appendChild(actionRow(1.6, true, t('DISMANTLE'), () => api.dismantle(it.id)));
    });
  }
  function renderAnalyze(body) {
    const items = api.carried().filter((it) => analyzeInfo(it.type) && !it.soulbound);
    itemRows(body, items, t('Strange items and creature drops: learn from them instead of selling them.'), (det, it) => {
      const info = analyzeInfo(it.type);
      itemHead(det, it, `${isSellable(it.def) && it.value ? t('Sells for') + ' ▮' + it.value + ' · ' : ''}${isStrange(it.def) ? t('STRANGE') : t('creature sample')}`);
      det.appendChild(mk('div', 'crp-h', t('WHAT YOU MIGHT LEARN')));
      const known = info.bp && api.blueprints().includes(info.bp);
      det.appendChild(mk('div', 'crp-dd', `+${info.xp} XP` + (info.bp ? ` · ${t('Blueprint')}: ${known ? t(BLUEPRINTS[info.bp].name) + ' (' + t('KNOWN') + ')' : isStrange(it.def) ? '???' : t(BLUEPRINTS[info.bp].name)}` : '')));
      for (const [id, n] of info.comps) { const l = mk('div', 'crp-ing'); l.append(icon(id), mk('span', 'nm', nameOf(id)), mk('span', 'crp-cnt ok', '×' + n)); det.appendChild(l); }
      det.appendChild(actionRow(3.2, true, t('ANALYZE'), () => api.analyze(it.id)));
    });
  }
  function renderBlueprints(body) {
    body.style.gridTemplateColumns = '1fr';
    const known = api.blueprints();
    const wrap = mk('div', 'crp-detail');
    wrap.appendChild(mk('div', 'crp-dd', t('Analyze strange items and big creature drops at the workbench to permanently unlock advanced recipes.')));
    const grid = mk('div', 'crp-grid'); grid.style.marginTop = '10px';
    for (const [id, b] of Object.entries(BLUEPRINTS)) {
      const on = known.includes(id);
      const c = mk('div', 'crp-bp' + (on ? '' : ' off'));
      c.append(mk('div', 'n', `${b.icon || '📐'} ${on ? t(b.name) : '???'}`), mk('div', 'd', on ? t(b.desc) : t('Not yet discovered.')), mk('div', 's', `${t('Source')}: ${t(b.from)}`));
      grid.appendChild(c);
    }
    wrap.appendChild(grid);
    body.appendChild(wrap);
  }

  // ---------------------------------------------------------------- results from the host
  function onResult(d) {
    if (disposed) return;
    busy = null;
    if (d.k === 'crafted') {
      const c = d.tier ? tierColor(d.tier) : '#7dff7d';
      stamp = { text: t('CRAFTED'), sub: `${nameOf(d.out)}${d.n > 1 ? ' ×' + d.n : ''}${d.tier ? ' · ' + TIERS[d.tier].name : ''}`, color: c };
      sfx('ui_buy', 0.7);
    } else if (d.k === 'dismantled') { stamp = { text: t('DISMANTLED'), sub: d.yields.map(([id, n]) => `${nameOf(id)} ×${n}`).join(', '), color: '#9aa0a4' }; sfx('ui_confirm', 0.6); sel = null; }
    else if (d.k === 'analyzed') {
      stamp = { text: d.bp ? t('BLUEPRINT!') : t('ANALYZED'), sub: `+${d.xp} XP${d.known ? ' · ' + t('already known: parts recovered') : ''}`, color: '#7fc4ff' };
      sel = null;
    } else if (d.k === 'upgraded') {
      stamp = d.ok ? { text: t('UPGRADED'), sub: `${TIERS[d.from].name} → ${TIERS[d.to].name}`, color: tierColor(d.to) } : { text: t('FAILED'), sub: t('The weapon survived.'), bad: true };
      sfx(d.ok ? 'ui_levelup' : 'ui_error', 0.7); if (d.ok) sel = null;
    } else if (d.k === 'err') { stamp = { text: t('ERROR'), sub: t(d.msg), bad: true }; }
    render();
  }

  function dispose() {
    disposed = true;
    if (busy?.timer) cancelAnimationFrame(busy.timer);
    busy = null;
    clearInterval(poll);
    off?.();
  }
  const off = api.on(onResult);
  poll = setInterval(() => { if (!disposed && !busy && root.isConnected) render(); }, 900);
  void itemDef;
  void TIER_ORDER;
  render();
  return { el: root, refresh: render, onResult, dispose };
}
