// SURVIVAL panels (module `survival`): the cooking pot (ship stove / campfire, timing minigame), the brewing stand and the storage crate grid.
// Same CRT frame + inventory tile look as the I panel (inventory_style.js classes: .tinv-grid / .tinv-cell / .ivi). Panels are dumb: every action
// goes through the module api `sv` (host-authoritative requests); they re-render when the state signature changes.
import { ITEMS } from '../../game/items.js';
import { TIERS } from '../../game/tiers.js';
import * as C from '../../game/inventory_core.js';
import { iconHTML } from '../icons.js';
import { escapeHtml } from '../../core/util.js';
import { t, tf, getLang } from '../../core/i18n.js';
import { ensureInventoryStyles } from '../inventory_style.js';
import { itemTooltipHTML } from './../inventory_panel.js';
import * as D from '../../game/survival_data.js';
import * as S from '../../game/survival_store.js';

const CELL = 46, GAP = 3, PAD = 6;
const CSS = `
.overlay .menu-frame.svp{width:min(1080px,97vw);max-height:94vh}
.svp .cp-body{display:flex;gap:16px;align-items:flex-start;padding:12px 18px}
.svp .svp-col{display:flex;flex-direction:column;gap:8px;min-width:0}
.svp .svp-sec{font-family:var(--cond);font-weight:bold;text-transform:uppercase;font-size:17px;letter-spacing:2px;color:var(--ph-dim);display:flex;align-items:center;gap:8px;white-space:nowrap}
.svp .svp-sec::after{content:'';flex:1;height:1px;background:var(--ph-line)}
.svp .svp-list{display:flex;flex-direction:column;gap:4px;max-height:52vh;overflow:auto;scrollbar-width:thin}
.svp .svp-row{display:flex;align-items:center;gap:8px;border:1px solid var(--ph-line);background:rgba(0,0,0,.34);padding:2px 8px 2px 4px;cursor:pointer;font-size:19px;user-select:none}
.svp .svp-row:hover{background:rgba(255,160,50,.13);border-color:var(--ph-hi)}
.svp .svp-row.off{opacity:.4;pointer-events:none}
.svp .svp-row img{width:36px;height:36px;image-rendering:pixelated}
.svp .svp-row .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.svp .svp-row b{font-weight:normal;color:var(--ph-hi)}
.svp .svp-pot{display:flex;gap:8px}
.svp .svp-slot{width:70px;height:70px;border:2px dashed rgba(255,190,140,.3);background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative}
.svp .svp-slot img{width:56px;height:56px;image-rendering:pixelated}
.svp .svp-slot.full{border-style:solid;border-color:var(--ph-hi)}
.svp .svp-slot i{position:absolute;right:3px;bottom:0;font-style:normal;font-size:14px;color:var(--ph-dim)}
.svp .svp-box{border:1px solid var(--ph-line);background:rgba(0,0,0,.34);padding:6px 10px;font-size:19px;line-height:1.15}
.svp .svp-box .big{font-size:24px;color:var(--ph-hi)}
.svp .svp-box .dim{color:var(--ph-dim);font-size:16px}
.svp .svp-box .good{color:#7dff7d}.svp .svp-box .bad{color:#ff8a6a}
.svp .svp-meter{position:relative;height:30px;border:1px solid var(--ph-line);background:#000;overflow:hidden}
.svp .svp-meter>div.z{position:absolute;top:0;bottom:0}
.svp .svp-meter>div.nd{position:absolute;top:-2px;bottom:-2px;width:4px;background:#fff;box-shadow:0 0 8px #fff;left:0}
.svp .svp-meter>span{position:absolute;top:0;bottom:0;display:flex;align-items:center;justify-content:center;font-size:14px;letter-spacing:1px;color:rgba(0,0,0,.75);pointer-events:none}
.svp .svp-btn{font-size:26px;padding:3px 26px;min-width:150px}
.svp .svp-msg{min-height:22px;font-size:18px;color:#ffd23f}
.svp .svp-msg.bad{color:#ff6a4a}
.svp .svp-guide{font-size:16px;line-height:1.1;color:var(--ph-dim);max-height:52vh;overflow:auto;scrollbar-width:thin}
.svp .svp-guide div{margin-bottom:4px}.svp .svp-guide b{color:var(--ph-hi);font-weight:normal}
.svp .svp-head input{font:inherit;font-size:20px;width:150px;background:rgba(0,0,0,.5);color:var(--ph-hi);border:1px solid var(--ph-line);padding:0 6px}
.svp .svp-sw{display:inline-flex;gap:3px;margin-left:6px}
.svp .svp-sw i{width:18px;height:18px;border:1px solid #000;cursor:pointer;display:inline-block}.svp .svp-sw i.sel{outline:2px solid #fff}
.svp-crate .tinv-cell{width:${CELL}px;height:${CELL}px}
.svp .tinv-gridwrap{align-self:flex-start}
.svp .svp-hot{display:flex;gap:6px;flex-wrap:wrap}
.svp .svp-hot .tinv-slot{width:58px;height:58px}
@media (max-width:900px){.svp .cp-body{flex-direction:column}}
`;
let cssDone = false;
function ensureCss() {
  ensureInventoryStyles();
  if (cssDone && document.getElementById('tfg-svp-css')) return;
  const s = document.createElement('style'); s.id = 'tfg-svp-css'; s.textContent = CSS; document.head.appendChild(s); cssDone = true;
}
const nm = (ty) => escapeHtml(t(ITEMS[ty]?.name || ty));
const px = (n) => n * CELL + (n - 1) * GAP;
const pct = (n) => `${Math.round(n)}`;
function frame(title, sub, bodyHtml, foot) {
  const f = document.createElement('div');
  f.className = 'menu-frame crt-panel svp';
  f.innerHTML = `<div class="cp-head"><span class="menu-title">${escapeHtml(title)}</span><span class="cp-cursor">█</span><span class="cp-sub">${escapeHtml(sub || '')}</span></div>
    <div class="cp-body">${bodyHtml}</div>
    <div class="cp-foot">${(foot || []).map(([k, l]) => `<span><kbd>${escapeHtml(k)}</kbd> ${escapeHtml(t(l))}</span>`).join('')}</div>`;
  return f;
}
/** field guide: property -> plants */
function guideHTML() {
  const rows = [];
  for (const p of D.PROP_IDS) {
    const who = D.PLANT_IDS.filter((k) => D.PLANTS[k].props[p]).map((k) => t(D.PLANTS[k].name));
    if (who.length) rows.push(`<div><b>${escapeHtml(t(D.PROPS[p].short))}</b>: ${escapeHtml(who.join(', '))}<br>${escapeHtml(t(D.PROPS[p].desc))}</div>`);
  }
  return rows.join('');
}
const itemRowHTML = (type, n, extra = '') => `<div class="svp-row" data-type="${escapeHtml(type)}">${iconHTML(type, 'ico')}<span class="n">${nm(type)}</span><b>x${n}</b>${extra}</div>`;

// ================================================================================================ cooking + brewing
/** kind: 'stove' | 'fire' | 'brew'.  sv: module api (carried(), cookState(), cookStart(), cookStop(), brewStart(), brewJob(), close()). */
export function createCookPanel(game, sv, o) {
  ensureCss();
  const brew = o.kind === 'brew';
  const title = brew ? t('BREWING STAND') : o.kind === 'fire' ? t('CAMPFIRE') : t('SHIP STOVE');
  const zones = brew ? '' : `<div class="svp-meter"><div class="z" style="left:0;width:${D.COOK_ZONES.cooked / 1.1 * 100}%;background:#5a6a86"></div><div class="z" style="left:${D.COOK_ZONES.cooked / 1.1 * 100}%;width:${(D.COOK_ZONES.perfect - D.COOK_ZONES.cooked) / 1.1 * 100}%;background:#d8c040"></div><div class="z" style="left:${D.COOK_ZONES.perfect / 1.1 * 100}%;width:${(D.COOK_ZONES.burnt - D.COOK_ZONES.perfect) / 1.1 * 100}%;background:#4ade60"></div><div class="z" style="left:${D.COOK_ZONES.burnt / 1.1 * 100}%;right:0;background:#a83a2a"></div><div class="nd"></div>
      <span style="left:1%">${escapeHtml(t('RAW'))}</span><span style="left:${D.COOK_ZONES.cooked / 1.1 * 100 + 1}%">${escapeHtml(t('COOKED'))}</span><span style="left:${D.COOK_ZONES.perfect / 1.1 * 100}%;width:${(D.COOK_ZONES.burnt - D.COOK_ZONES.perfect) / 1.1 * 100}%">${escapeHtml(t('PERFECT'))}</span><span style="right:1%">${escapeHtml(t('BURNT'))}</span></div>`;
  const f = frame(title, '', `
    <div class="svp-col" style="width:300px"><div class="svp-sec">${escapeHtml(t('Carried ingredients'))}</div><div class="svp-list" data-r="list"></div></div>
    <div class="svp-col" style="flex:1;min-width:320px">
      <div class="svp-sec">${escapeHtml(brew ? t('Flasks') : t('Pot'))} <em style="font-style:normal;font-size:15px;opacity:.7">${escapeHtml(brew ? t('2-3 herbs') : t('1-3 ingredients'))}</em></div>
      <div class="svp-pot" data-r="pot"></div>
      <div class="svp-box" data-r="preview"></div>
      ${zones}
      <div style="display:flex;gap:10px;align-items:center"><button class="btn primary svp-btn" data-r="go"></button><button class="btn small" data-r="clear">${escapeHtml(t('Clear'))}</button></div>
      <div class="svp-msg" data-r="msg"></div>
    </div>
    <div class="svp-col" style="width:260px"><div class="svp-sec">${escapeHtml(t('Field guide'))}</div><div class="svp-guide">${guideHTML()}</div></div>`,
  brew ? [['Click', 'add / remove'], ['ESC', 'close']] : [['Click', 'add / remove'], ['SPACE / E', 'stop the needle'], ['ESC', 'close']]);
  const q = (r) => f.querySelector(`[data-r="${r}"]`);
  const pot = [];   // item ids
  let sig = '', raf = 0, dead = false, msg = '', msgBad = false;
  const carried = () => sv.carried().filter((e) => (brew ? D.INGREDIENTS[e.type] && !D.INGREDIENTS[e.type].meat : true));
  const typesOf = () => pot.map((id) => sv.itemType(id)).filter(Boolean);
  const say = (s, bad) => { msg = s || ''; msgBad = !!bad; };

  function render() {
    const list = carried();
    const byType = new Map();
    for (const e of list) { const a = byType.get(e.type) || []; a.push(e); byType.set(e.type, a); }
    // drop pot entries that vanished
    for (let i = pot.length - 1; i >= 0; i--) if (!list.some((e) => e.id === pot[i])) pot.splice(i, 1);
    const lst = q('list');
    const rows = [...byType.entries()].map(([ty, arr]) => {
      const free = arr.filter((e) => !pot.includes(e.id)).length;
      return `<div class="svp-row${free ? '' : ' off'}" data-type="${escapeHtml(ty)}">${iconHTML(ty, 'ico')}<span class="n">${nm(ty)}</span><b>x${free}</b></div>`;
    });
    lst.innerHTML = rows.join('') || `<div class="svp-box dim">${escapeHtml(brew ? t('No herbs on you. Forage or farm some.') : t('No ingredients on you. Forage plants, hunt, fish or farm.'))}</div>`;
    const cs = sv.cookState();
    const busy = !brew && cs.st !== 'idle' && cs.st !== 'done';
    q('pot').innerHTML = [0, 1, 2].map((i) => {
      const id = pot[i], ty = id && sv.itemType(id);
      return `<div class="svp-slot${ty ? ' full' : ''}" data-slot="${i}">${ty ? iconHTML(ty, 'ico') : ''}${ty ? `<i>${nm(ty)}</i>` : ''}</div>`;
    }).join('');
    const types = typesOf();
    const box = q('preview');
    let ok = false;
    if (brew) {
      const b = D.resolveBrew(types);
      const job = sv.brewJob(o.sid);
      if (job) box.innerHTML = `<div class="big">${nm(job.type)}</div><div class="dim">${escapeHtml(job.left > 0 ? tf('Brewing... {s} s', { s: Math.ceil(job.left / 1000) }) : t('Ready! It is on the stand.'))}</div>`;
      else if (b) { box.innerHTML = `<div class="big">${nm(b.type)}</div><div>${escapeHtml(t(D.PROPS[b.prop].desc))}</div><div class="dim">${escapeHtml(tf('{s} s of effect, ready in {b} s. Quality: {q}', { s: b.sec, b: Math.round(D.BREW_MS / 1000), q: t(TIERS[b.tier].name) }))}</div>`; ok = true; }
      else box.innerHTML = `<div class="dim">${escapeHtml(types.length ? t('Needs 2-3 plants that share a property: Second Wind, Night Eyes, Hush or Fireproof.') : t('Put herbs on the flasks.'))}</div>`;
      const go = q('go'); go.textContent = t('BREW'); go.classList.toggle('disabled', !ok || !!job);
    } else {
      const pv = D.previewDish(types, 2), pf = D.previewDish(types, 3);
      if (cs.st === 'done' && cs.result) {
        const r = cs.result;
        box.innerHTML = `<div class="big ${r.q >= 2 ? 'good' : 'bad'}">${nm(r.ty)}</div><div>${escapeHtml(t(D.QUAL[r.q].name))}</div><div class="dim">${escapeHtml(t('It is on the counter. Pick it up and eat it.'))}</div>`;
      } else if (pv) {
        ok = true;
        box.innerHTML = `<div class="big">${escapeHtml(t(D.MAINS[pv.main].name))}${pv.bonus ? ` <span class="dim">(${escapeHtml(t(D.PROPS[pv.bonus].short))})</span>` : ''}</div>
          <div>${escapeHtml(tf('Heals {h} HP, feeds {f}', { h: pv.heal, f: pv.hunger }))} <span class="dim">${escapeHtml(tf('(perfect: {h})', { h: pf.heal }))}</span></div>
          ${pv.bonus ? `<div>${escapeHtml(t(D.PROPS[pv.bonus].name))}: ${escapeHtml(t(D.PROPS[pv.bonus].desc))}</div>` : ''}${pv.meat ? `<div class="bad">${escapeHtml(t('Raw meat: do not stop the needle too early.'))}</div>` : ''}`;
      } else box.innerHTML = `<div class="dim">${escapeHtml(t('Pick 1-3 ingredients. Meat makes a stew, fish a grill, greens a soup, berries a tart. Herbs add an effect.'))}</div>`;
      const go = q('go');
      go.textContent = cs.st === 'run' ? t('STOP') : t('COOK');
      go.classList.toggle('disabled', cs.st === 'run' ? false : (!ok || cs.st === 'wait'));
    }
    const m = q('msg'); m.textContent = msg; m.className = 'svp-msg' + (msgBad ? ' bad' : '');
    q('clear').classList.toggle('disabled', busy);
    sig = signature();
  }
  function signature() {
    const cs = sv.cookState(), job = brew ? sv.brewJob(o.sid) : null;
    return `${carried().map((e) => e.id).join(',')}|${pot.join(',')}|${cs.st}|${cs.result?.ty || ''}|${job ? job.type + ':' + Math.ceil(job.left / 1000) : ''}|${msg}`;
  }
  function frameLoop() {
    if (dead) return;
    raf = requestAnimationFrame(frameLoop);
    if (game.ui?.panelOpen !== f) { api.dispose(); return; }
    const cs = sv.cookState();
    if (!brew) {
      const nd = f.querySelector('.nd');
      if (nd) nd.style.left = `${Math.min(100, (cs.st === 'run' ? cs.p : cs.st === 'done' && cs.result ? cs.result.p : 0) / 1.1 * 100)}%`;
      if (cs.st === 'run' && cs.p >= 1.1) sv.cookStop();
    }
    if (signature() !== sig) render();
  }
  function click(e) {
    const slot = e.target.closest?.('[data-slot]');
    if (slot) { const i = Number(slot.dataset.slot); if (pot[i] && !(sv.cookState().st === 'run' || sv.cookState().st === 'wait')) { pot.splice(i, 1); say(''); render(); } return; }
    const row = e.target.closest?.('.svp-row');
    if (row && !row.classList.contains('off')) {
      if (pot.length >= D.MAX_INGREDIENTS) { say(t('The pot holds three ingredients.'), true); render(); return; }
      const cs = sv.cookState();
      if (cs.st === 'run' || cs.st === 'wait') return;
      const e2 = carried().find((x) => x.type === row.dataset.type && !pot.includes(x.id));
      if (e2) { pot.push(e2.id); say(''); sv.resetCook(); render(); }
      return;
    }
    if (e.target.closest?.('[data-r="clear"]')) { pot.length = 0; say(''); sv.resetCook(); render(); return; }
    if (e.target.closest?.('[data-r="go"]')) go();
  }
  function go() {
    const cs = sv.cookState();
    if (brew) { if (pot.length >= 2) { sv.brewStart(o.sid, pot.slice()); pot.length = 0; say(t('The flasks start bubbling.')); render(); } return; }
    if (cs.st === 'run') { sv.cookStop(); return; }
    if (!pot.length) return;
    say('');
    sv.cookStart(o.kind, o.sid, pot.slice());
  }
  function key(e) {
    if (game.ui?.panelOpen !== f) return;
    if (!brew && (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') && sv.cookState().st === 'run') { e.preventDefault(); sv.cookStop(); }
  }
  f.addEventListener('click', click);
  window.addEventListener('keydown', key);
  const api = {
    el: f,
    say(s, bad) { say(s, bad); },
    refresh() { render(); },
    dispose() { if (dead) return; dead = true; cancelAnimationFrame(raf); window.removeEventListener('keydown', key); sv.resetCook(); },
  };
  render();
  raf = requestAnimationFrame(frameLoop);
  return api;
}

// ================================================================================================ storage crate
/** sv: module api (crate(id), carried entries via game.inventory, stReq(op, data), close()). */
export function createStoragePanel(game, sv, crateId) {
  ensureCss();
  const inv = game.inventory;
  const crate0 = sv.crate(crateId);
  const T = S.CRATE_TIERS[crate0?.t || 1];
  const f = frame(t(T.name).toLocaleUpperCase(getLang()), '', `
    <div class="svp-col">
      <div class="svp-sec" data-r="ctitle"></div>
      <div class="tinv-gridwrap svp-crate"><div class="tinv-grid" data-r="cgrid"></div><div class="tinv-items" data-r="citems"></div><div class="tinv-empty" data-r="cempty"></div></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn small" data-r="sort">${escapeHtml(t('Sort'))}</button><button class="btn small" data-r="all">${escapeHtml(t('Take all'))}</button><button class="btn small danger" data-r="pack">${escapeHtml(t('Pack up'))}</button></div>
      <div class="svp-head" style="display:flex;align-items:center;flex-wrap:wrap;gap:4px"><span class="dim" style="font-size:16px;color:var(--ph-dim)">${escapeHtml(t('Label'))}</span><input data-r="label" maxlength="${S.LABEL_MAX}" spellcheck="false"><span class="svp-sw" data-r="sw"></span></div>
    </div>
    <div class="svp-col">
      <div class="svp-sec" data-r="btitle"></div>
      <div class="tinv-gridwrap svp-mine"><div class="tinv-grid" data-r="bgrid"></div><div class="tinv-items" data-r="bitems"></div><div class="tinv-empty" data-r="bempty"></div></div>
      <div class="svp-sec">${escapeHtml(t('Hotbar'))}</div>
      <div class="svp-hot" data-r="hot"></div>
      <div class="svp-msg" data-r="msg"></div>
    </div>`,
  [['DRAG', 'move between crate and pockets'], ['RMB', 'quick move'], ['ESC', 'close']]);
  const q = (r) => f.querySelector(`[data-r="${r}"]`);
  let sig = '', dead = false, raf = 0, drag = null, press = null, tip = null, hover = null, msg = '', msgBad = false, lastLabel = null;
  const crate = () => sv.crate(crateId);
  const mineEntries = () => (inv?.entries?.() || []);
  const say = (s, bad) => { msg = s || ''; msgBad = !!bad; const m = q('msg'); if (m) { m.textContent = msg; m.className = 'svp-msg' + (bad ? ' bad' : ''); } };

  const itemHTML = (ty, id, w, h, tier, extra = '', src = 'mine') => {
    const tiered = tier && tier !== 'common';
    const ico = Math.max(26, Math.min(Math.min(w, h) - 8, 90));
    const img = iconHTML(ty, 'ico').replace('<img ', `<img style="width:${ico}px;height:${ico}px" `);
    return `<div class="ivi ${tiered ? 't-' + tier : 'plain'}" data-src="${src}" data-id="${escapeHtml(String(id))}" style="width:${w}px;height:${h}px;${tiered ? `--tc:${TIERS[tier].color};` : ''}">${tiered ? '<div class="iv-pip"></div>' : ''}${img}${extra}</div>`;
  };
  function signature() {
    const c = crate();
    if (!c) return 'gone';
    const p = game.player;
    return `${c.ver}|${c.lab}|${c.col}|${mineEntries().map((e) => e.id + (e.inv ? e.inv.k + (e.inv.x ?? '') + (e.inv.y ?? '') : 'h')).join(',')}|${p?.slots?.join(',')}|${p?.slot}`;
  }
  function render() {
    const c = crate();
    if (!c) { api.dispose(); game.ui?.closePanel?.(); return; }
    sig = signature();
    const g = S.crateGrid(c.t);
    q('ctitle').innerHTML = `${escapeHtml(c.lab || t(T.name))} <em style="font-style:normal">${g.cols}×${g.rows} · ${S.usedCells(c)}/${g.cols * g.rows}</em>`;
    const cgrid = q('cgrid');
    cgrid.style.gridTemplateColumns = `repeat(${g.cols}, ${CELL}px)`;
    cgrid.innerHTML = '<div class="tinv-cell"></div>'.repeat(g.cols * g.rows);
    q('citems').innerHTML = S.entriesOf(c).map((e) => {
      const s = C.itemSize(e.def) || { w: 1, h: 1 };
      const html = itemHTML(e.def.id, e.rec.u, px(s.w), px(s.h), e.tier, '', 'crate');
      return html.replace('style="', `style="left:${e.rec.x * (CELL + GAP)}px;top:${e.rec.y * (CELL + GAP)}px;`);
    }).join('');
    q('cempty').textContent = (c.it || []).length ? '' : t('Empty. Drag items in.');
    // my side
    const list = mineEntries();
    const grid = inv?.grid?.() || { cols: 4, rows: 2 };
    const bagE = C.bagEntryOf(list);
    q('btitle').innerHTML = `${escapeHtml(bagE ? t(bagE.def.name) : t('Pockets'))} <em style="font-style:normal">${grid.cols}×${grid.rows}</em>`;
    const bgrid = q('bgrid');
    bgrid.style.gridTemplateColumns = `repeat(${grid.cols}, ${CELL}px)`;
    bgrid.innerHTML = '<div class="tinv-cell"></div>'.repeat(grid.cols * grid.rows);
    q('bitems').innerHTML = list.filter((e) => e.inv?.k === 'bag').map((e) => {
      const s = C.itemSize(e.def) || { w: 1, h: 1 };
      return itemHTML(e.it.type, e.id, px(s.w), px(s.h), e.tier, '', 'mine').replace('style="', `style="left:${e.inv.x * (CELL + GAP)}px;top:${e.inv.y * (CELL + GAP)}px;`);
    }).join('');
    const p = game.player, byId = new Map(list.map((e) => [e.id, e]));
    q('hot').innerHTML = (p?.slots || []).map((id, i) => {
      const e = id && byId.get(id);
      return `<div class="tinv-hot${i === p.slot ? ' active' : ''}"><div class="tinv-slot" data-hot="${i}">${e ? itemHTML(e.it.type, e.id, 54, 54, e.tier, '', 'mine') : ''}</div></div>`;
    }).join('');
    const sw = q('sw');
    if (!sw.childElementCount) sw.innerHTML = S.CRATE_COLORS.map((col) => `<i data-col="${col}" style="background:${col}"></i>`).join('');
    for (const i of sw.children) i.classList.toggle('sel', i.dataset.col === c.col);
    const lab = q('label');
    if (document.activeElement !== lab && lastLabel !== c.lab) { lab.value = c.lab || ''; lastLabel = c.lab; }
    q('pack').style.display = S.isEmptyStruct(c) && !c.b ? '' : 'none';
    setHover(null);
  }
  // ---- tooltip
  const pseudo = (r) => ({ type: r.i, def: ITEMS[r.i], value: r.v || 0, baseValue: r.bv || r.v || 0, tier: r.tr, rarity: () => r.tr || ITEMS[r.i]?.tier || 'common', plus: r.pl || 0, oc: r.oc || [], affix: r.af || null, battery: r.b, charges: r.c, dur: r.du, dr: r.dr, inv: null, soulbound: false, bag: [] });
  function setHover(id, src, ev) {
    if (drag) id = null;
    const key = id ? src + id : null;
    if (key !== hover) {
      hover = key;
      if (!id) { tip?.remove(); tip = null; return; }
      let html = '';
      try {
        if (src === 'crate') { const r = crate()?.it?.find((x) => String(x.u) === String(id)); if (r) html = itemTooltipHTML(pseudo(r), ITEMS[r.i], { hint: t('RMB: to pockets') }); }
        else { const e = mineEntries().find((x) => x.id === id); if (e) html = itemTooltipHTML(e.it, e.def, { hint: t('RMB: into the crate') }); }
      } catch { html = ''; }
      if (!html) return;
      if (!tip) { tip = document.createElement('div'); tip.className = 'tinv-tip'; document.body.appendChild(tip); }
      const tier = src === 'crate' ? (crate()?.it?.find((x) => String(x.u) === String(id))?.tr || 'common') : (mineEntries().find((x) => x.id === id)?.tier || 'common');
      tip.style.setProperty('--tc', (TIERS[tier] || TIERS.common).color);
      tip.innerHTML = html;
    }
    if (ev && tip) { tip.style.left = Math.min(window.innerWidth - 320, ev.clientX + 22) + 'px'; tip.style.top = Math.min(window.innerHeight - 260, ev.clientY + 14) + 'px'; }
  }
  // ---- drag
  function down(e) {
    if (e.button !== 0) return;
    const iv = e.target.closest?.('.ivi');
    if (!iv) return;
    e.preventDefault();
    const r = iv.getBoundingClientRect(), inGrid = !!iv.closest('.tinv-items');
    press = { id: iv.dataset.id, src: iv.dataset.src, x: e.clientX, y: e.clientY, el: iv, off: inGrid ? { cx: Math.floor((e.clientX - r.left) / (CELL + GAP)), cy: Math.floor((e.clientY - r.top) / (CELL + GAP)) } : { cx: 0, cy: 0 } };
  }
  function sizeOfPress(pr) {
    if (pr.src === 'crate') { const r = crate()?.it?.find((x) => String(x.u) === pr.id); return C.itemSize(ITEMS[r?.i]) || { w: 1, h: 1 }; }
    const e = mineEntries().find((x) => x.id === pr.id);
    return C.itemSize(e?.def) || { w: 1, h: 1 };
  }
  function move(e) {
    if (tip && !drag) { tip.style.left = Math.min(window.innerWidth - 320, e.clientX + 22) + 'px'; tip.style.top = Math.min(window.innerHeight - 260, e.clientY + 14) + 'px'; }
    if (press && !drag && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) {
      const size = sizeOfPress(press);
      const ghost = document.createElement('div');
      ghost.className = 'tinv-drag';
      ghost.innerHTML = press.el.outerHTML.replace(/left:[^;]*;top:[^;]*;/, '');
      ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
      document.body.appendChild(ghost);
      press.el.classList.add('dragging');
      setHover(null);
      drag = { ...press, size, ghost };
    }
    if (drag) { drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px'; }
  }
  function targetAt(x, y) {
    const under = document.elementFromPoint(x, y);
    if (!under || !f.contains(under)) return null;
    const cw = under.closest('.svp-crate');
    if (cw) {
      const r = cw.getBoundingClientRect(), g = S.crateGrid(crate()?.t || 1), size = drag?.size || { w: 1, h: 1 };
      const cx = Math.floor((x - r.left - PAD) / (CELL + GAP)), cy = Math.floor((y - r.top - PAD) / (CELL + GAP));
      return { k: 'crate', x: Math.max(0, Math.min(g.cols - size.w, cx - (drag?.off.cx || 0))), y: Math.max(0, Math.min(g.rows - size.h, cy - (drag?.off.cy || 0))) };
    }
    const mw = under.closest('.svp-mine');
    if (mw) {
      const r = mw.getBoundingClientRect(), g = inv.grid(), size = drag?.size || { w: 1, h: 1 };
      const cx = Math.floor((x - r.left - PAD) / (CELL + GAP)), cy = Math.floor((y - r.top - PAD) / (CELL + GAP));
      return { k: 'bag', x: Math.max(0, Math.min(g.cols - size.w, cx - (drag?.off.cx || 0))), y: Math.max(0, Math.min(g.rows - size.h, cy - (drag?.off.cy || 0))) };
    }
    const hot = under.closest('[data-hot]');
    if (hot) return { k: 'hot', i: Number(hot.dataset.hot) };
    if (under.closest('.svp-col')) return { k: 'side' };
    return null;
  }
  function up(e) {
    const pr = press; press = null;
    if (!drag) return;
    const d = drag; drag = null;
    d.ghost.remove(); d.el.classList.remove('dragging');
    const tgt = targetAt(e.clientX, e.clientY);
    if (!tgt || !pr) return;
    if (d.src === 'mine') {
      if (tgt.k === 'crate') sv.stReq('put', { id: crateId, it: d.id, x: tgt.x, y: tgt.y });
      else if (tgt.k === 'bag') inv.doMove(d.id, { k: 'bag', x: tgt.x, y: tgt.y });
      else if (tgt.k === 'hot') inv.doMove(d.id, { k: 'hot', i: tgt.i });
    } else if (d.src === 'crate') {
      if (tgt.k === 'crate') sv.stReq('move', { id: crateId, u: Number(d.id), x: tgt.x, y: tgt.y });
      else sv.stReq('take', { id: crateId, u: Number(d.id), to: tgt.k === 'bag' ? { k: 'bag', x: tgt.x, y: tgt.y } : null });
    }
    sig = '';
  }
  function quick(e) {
    e.preventDefault();
    const iv = e.target.closest?.('.ivi');
    if (!iv || drag) return;
    setHover(null);
    if (iv.dataset.src === 'crate') sv.stReq('take', { id: crateId, u: Number(iv.dataset.id), to: null });
    else sv.stReq('put', { id: crateId, it: iv.dataset.id });
  }
  function click(e) {
    const r = e.target.closest?.('[data-r]')?.dataset.r;
    const sw = e.target.closest?.('[data-col]');
    if (sw) { sv.stReq('label', { id: crateId, col: sw.dataset.col }); return; }
    if (r === 'sort') sv.stReq('sort', { id: crateId });
    else if (r === 'all') sv.stReq('all', { id: crateId });
    else if (r === 'pack') { sv.stReq('pack', { id: crateId }); game.ui?.closePanel?.(); }
  }
  function over(e) { const iv = e.target.closest?.('.ivi'); setHover(iv?.dataset.id || null, iv?.dataset.src, e); }
  function labelCommit() { const v = q('label').value; if (v !== (crate()?.lab || '')) sv.stReq('label', { id: crateId, lab: v }); }
  f.addEventListener('pointerdown', down);
  f.addEventListener('contextmenu', quick);
  f.addEventListener('dblclick', (e) => { const iv = e.target.closest?.('.ivi'); if (iv) quick(e); });
  f.addEventListener('pointerover', over);
  f.addEventListener('pointerleave', () => setHover(null));
  f.addEventListener('click', click);
  const lab = q('label');
  lab.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { labelCommit(); lab.blur(); } });
  lab.addEventListener('blur', labelCommit);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  function loop() {
    if (dead) return;
    raf = requestAnimationFrame(loop);
    if (game.ui?.panelOpen !== f) { api.dispose(); return; }
    if (signature() !== sig) render();
  }
  const api = {
    el: f, crateId,
    say, refresh() { render(); },
    dispose() {
      if (dead) return; dead = true; cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      drag?.ghost.remove(); drag = null; tip?.remove(); tip = null;
    },
  };
  render();
  raf = requestAnimationFrame(loop);
  return api;
}
