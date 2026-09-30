// HOMEWORLD build panel (CRT look, same frame conventions as the forge / record panels): BUILD (catalogue + cost + power), MANAGE (upgrade / move /
// sell / repair), STATUS (power + cooling, storage, collect, deposit, raid record, controls).
//   createHomeworldPanel(ui, game, hw, { tab }) -> { el, refresh(), dispose() }   (hw = the module api: state(), req(), startPlace(), startMove())
import { el, escapeHtml } from '../../core/util.js';
import { glyphify } from '../glyphs.js';
import { t, tf } from '../../core/i18n.js';
import * as H from '../../game/homeworld_core.js';
import { classify, walletRowOf } from '../../game/wallet.js';   // [unify] two currencies + materials

const CSS = `
.overlay .menu-frame.hwp{width:min(1100px,96vw);height:min(86vh,720px)}
.hwp > .cp-body{overflow:hidden;display:flex;flex-direction:column;padding-bottom:8px}
.hwp .tabs{margin-bottom:6px}
.hwp .hw-res{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.hwp .hw-chip{border:1px solid var(--ph-line);background:rgba(0,0,0,.4);padding:1px 8px;font-size:18px;min-width:92px}
.hwp .hw-chip i{display:block;height:4px;background:rgba(255,255,255,.1);margin-top:2px}.hwp .hw-chip i b{display:block;height:100%;background:var(--ph-hi)}
.hwp .hw-chip.full i b{background:#ffd23f}
.hwp .hw-body{overflow:auto;flex:1;min-height:0;padding-right:4px;scrollbar-width:thin}
.hwp .hw-cat{font-size:20px;letter-spacing:3px;color:var(--ph-hi);margin:8px 0 4px;border-bottom:1px dashed var(--ph-line)}
.hwp .hw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:6px}
.hwp .hw-card{border:1px solid var(--ph-line);border-left:4px solid var(--ph-hi);background:rgba(0,0,0,.42);padding:4px 8px;cursor:pointer;outline:none}
.hwp .hw-card:hover,.hwp .hw-card:focus-visible{background:rgba(255,160,50,.12);box-shadow:0 0 12px rgba(255,160,50,.25)}
.hwp .hw-card.off{opacity:.5;cursor:not-allowed}
.hwp .hw-card b{font-size:22px;font-weight:normal;color:var(--ph-hi)}
.hwp .hw-card .sub{font-size:16px;opacity:.72;line-height:1.05}
.hwp .hw-card .row{display:flex;justify-content:space-between;gap:8px;font-size:18px}
.hwp .ok{color:#7dff7d}.hwp .bad{color:#ff6b5a}.hwp .warn{color:#ffd23f}
.hwp .hw-row{display:flex;align-items:center;gap:10px;border-bottom:1px dashed var(--ph-line);padding:3px 2px;font-size:19px;flex-wrap:wrap}
.hwp .hw-row .nm{flex:1;min-width:180px}
.hwp .hw-row .btn{font-size:17px;padding:1px 8px;min-height:0}
.hwp .hw-bar{height:8px;background:rgba(255,255,255,.1);border:1px solid var(--ph-line);position:relative;min-width:120px;flex:1}
.hwp .hw-bar>span{position:absolute;left:0;top:0;bottom:0;background:var(--ph-hi)}
.hwp .hw-bar.bad>span{background:#ff6b5a}
.hwp .hw-box{border:1px solid var(--ph-line);background:rgba(0,0,0,.34);padding:6px 10px;margin-bottom:8px;font-size:19px}
.hwp .hw-note{font-size:16px;opacity:.7;line-height:1.1}
@media (max-width:900px){.hwp .hw-grid{grid-template-columns:1fr}}
`;
let cssDone = false;
function ensureCss() {
  if (cssDone && document.getElementById('tfg-hw-css')) return;
  const s = document.createElement('style'); s.id = 'tfg-hw-css'; s.textContent = CSS; document.head.appendChild(s); cssDone = true;
}
const f0 = (n) => Math.floor(n + 1e-9).toLocaleString('en-US');
const NAME = (id) => t(H.BUILDINGS[id].name);
const costHtml = (c, st, wallet) => {
  const bits = [];
  if (c.cr) bits.push(`<span class="${wallet >= c.cr ? 'ok' : 'bad'}">▮${f0(c.cr)}</span>`);
  if (c.parts) bits.push(`<span class="${st.s.parts >= c.parts ? 'ok' : 'bad'}">⚙${c.parts}</span>`);
  if (c.s2) bits.push(`<span class="${st.s.s2 >= c.s2 ? 'ok' : 'bad'}">${c.s2}× ${t('Circuit Core')}</span>`);
  if (c.s3) bits.push(`<span class="${st.s.s3 >= c.s3 ? 'ok' : 'bad'}">${c.s3}× ${t('Data Crystal')}</span>`);
  return bits.join(' ');
};
/** one-line "what it does" at level lv */
export function effectLine(type, lv) {
  const d = H.BUILDINGS[type], i = lv - 1, bits = [];
  if (d.out) for (const k of Object.keys(d.out)) bits.push(`+${d.out[k][i]}${H.RES_ICON[k === 's' ? d.shardKey[i] : k]}/${t('day')}`);
  if (d.sup) bits.push(`⚡+${d.sup[i]}`);
  if (d.cool) bits.push(`❄+${d.cool[i]}`);
  if (d.boost) bits.push(`+${Math.round(d.boost[i] * 100)}% ${t('output')}`);
  if (d.clout) bits.push(`+${Math.round(d.clout[i] * 100)}% ◈`);
  if (d.cap) bits.push(`+${Math.round(d.cap[i] * 100)}% ${t('storage')}`);
  if (d.tw) { bits.push(`${d.tw.dps[i]} ${t('dps')}`); bits.push(`${d.tw.range[i]}m`); if (d.tw.slow) bits.push(`-${Math.round(d.tw.slow[i] * 100)}% ${t('speed')}`); if (d.tw.chain) bits.push(`x${d.tw.chain[i]} ${t('arcs')}`); }
  if (d.trap) bits.push(d.trap.dps ? `${d.trap.dps[i]} ${t('dps')}` : `${d.trap.burst[i]} ${t('blast')} x${d.trap.charges[i]}`);
  if (H.isWall(type)) bits.push(`${d.hp[i]} HP`);
  return bits.join(' · ');
}

export function createHomeworldPanel(ui, game, hw, opts = {}) {
  ensureCss();
  let tab = ['build', 'manage', 'status'].includes(opts.tab) ? opts.tab : 'build';
  let sig = '';
  const wrap = ui.panel('wide hwp');
  const head = ui.panelHead(t('HOMEWORLD'), ' ');
  const sub = head.querySelector('.cp-sub');
  const body = el('div', { class: 'cp-body' });
  const tabsEl = el('div', { class: 'tabs' }), resEl = el('div', { class: 'hw-res' }), mainEl = el('div', { class: 'hw-body' });
  body.append(tabsEl, resEl, mainEl);
  wrap.append(head, body, ui.panelFoot([['H', t('BUILD MODE')], ['ESC', t('CLOSE')]]));
  const S = () => hw.state();
  const wallet = () => game.run?.credits || 0;

  function renderTabs() {
    tabsEl.innerHTML = '';
    for (const [id, label] of [['build', 'BUILD'], ['manage', 'MANAGE'], ['status', 'STATUS']]) tabsEl.appendChild(ui.button(t(label), () => { tab = id; full(); }, tab === id ? 'tab sel' : 'tab'));
  }
  function renderRes() {
    const st = S(); resEl.innerHTML = '';
    sub.innerHTML = `<b>${escapeHtml(walletRowOf(game))}</b> · ${st.b.length} ${t('buildings')}`;   // [unify] the one wallet row
    for (const k of H.RES_KEYS) {
      const cap = H.capOf(st, k), v = st.s[k], full = v >= cap - 1e-9;
      const label = k === 's1' ? t('Scrap Shard') : k === 's2' ? t('Circuit Core') : k === 's3' ? t('Data Crystal') : k === 's4' ? t('Ecto Core') : k === 'meals' ? t('Meals') : k === 'parts' ? t('Components') : k === 'clout' ? 'Followers' : t('Credits');
      const isMat = classify(k) === 'material';   // [unify] shards / components / meals are materials, not money
      resEl.appendChild(el('div', { class: 'hw-chip' + (full ? ' full' : '') + (isMat ? ' mat' : ''), title: isMat ? t('Materials: crafting only, not money') : '', html: glyphify(`${H.RES_ICON[k].length === 1 ? H.RES_ICON[k] : ''} ${f0(v)}/${f0(cap)}<br><small>${escapeHtml(label)}</small><i><b style="width:${Math.min(100, (v / cap) * 100)}%"></b></i>`) }));
    }
  }

  // ---------------------------------------------------------------- BUILD
  function renderBuild() {
    const st = S(), P = H.powerStats(st);
    let h = `<div class="hw-note">${escapeHtml(t('Pick a building, then LMB on the grid to place it. R rotates. RMB / ESC leaves build mode.'))}  ⚡ ${P.demand}/${P.supply}  ❄ ${P.heat}/${P.cooling}</div>`;
    for (const [cat, label] of H.CATS) {
      h += `<div class="hw-cat">${escapeHtml(t(label))}</div><div class="hw-grid">`;
      for (const id of H.TYPE_ORDER.filter((x) => H.BUILDINGS[x].cat === cat)) {
        const d = H.BUILDINGS[id], c = H.levelCost(id, 1), n = H.count(st, id);
        const why = n >= d.max ? tf('Limit reached ({n})', { n: d.max }) : '';
        h += `<div class="hw-card${why ? ' off' : ''}" tabindex="0" data-place="${id}"><div class="row"><b>${escapeHtml(NAME(id))}</b><span>${n}/${d.max}</span></div>
          <div class="sub">${escapeHtml(t(d.desc))}</div><div class="sub">${escapeHtml(effectLine(id, 1))} → ${escapeHtml(effectLine(id, 5).split(' · ')[0])}</div>
          <div class="row"><span>${costHtml(c, st, wallet())}</span><span class="sub">${d.size}x${d.size} · ⚡${d.pw[0] ? '-' + d.pw[0] : d.sup ? '+' + d.sup[0] : 0}${d.heat[0] ? ' · 🔥' + d.heat[0] : ''}${d.cool ? ' · ❄+' + d.cool[0] : ''}</span></div>${why ? `<div class="sub bad">${escapeHtml(why)}</div>` : ''}</div>`;
      }
      h += '</div>';
    }
    mainEl.innerHTML = glyphify(h);
    mainEl.querySelectorAll('[data-place]').forEach((n) => n.addEventListener('click', () => { if (!n.classList.contains('off')) hw.startPlace(n.dataset.place); }));
  }

  // ---------------------------------------------------------------- MANAGE
  function renderManage() {
    const st = S();
    if (!st.b.length) { mainEl.innerHTML = `<div class="hw-box">${escapeHtml(t('Nothing built yet. Use the BUILD tab.'))}</div>`; return; }
    const rows = [...st.b].sort((a, b) => (H.BUILDINGS[a.t].cat > H.BUILDINGS[b.t].cat ? 1 : -1) || a.i - b.i);
    let h = '';
    for (const b of rows) {
      const d = H.BUILDINGS[b.t], hp = H.hpOf(b), mx = H.hpMax(b), dead = hp <= 0;
      const up = b.l < H.MAX_LV ? H.levelCost(b.t, b.l + 1) : null, rc = H.repairCost(b), sv = H.sellValue(b);
      h += `<div class="hw-row" data-id="${b.i}"><span class="nm"><b>${escapeHtml(NAME(b.t))}</b> Lv${b.l}${dead ? ` <span class="bad">${escapeHtml(t('WRECKED'))}</span>` : ''}<br><small>${escapeHtml(effectLine(b.t, b.l))}</small></span>
        <span class="hw-bar${dead ? ' bad' : ''}" title="${Math.round(hp)}/${mx}"><span style="width:${Math.max(0, (hp / mx) * 100)}%"></span></span>
        ${up ? `<button class="btn" data-op="up">${escapeHtml(t('UPGRADE'))} ${costHtml(up, st, wallet())}</button>` : `<span class="ok">MAX</span>`}
        ${rc.cr || dead ? `<button class="btn" data-op="repair">${escapeHtml(t('REPAIR'))} ▮${rc.cr} ⚙${rc.parts}</button>` : ''}
        <button class="btn" data-op="move">${escapeHtml(t('MOVE'))}</button><button class="btn" data-op="sell">${escapeHtml(t('SELL'))} ▮${sv.cr}</button></div>`;
    }
    if (st.b.some((b) => H.hpOf(b) < H.hpMax(b))) h += `<div style="margin-top:8px"><button class="btn" data-op="repairall">${escapeHtml(t('REPAIR ALL'))}</button></div>`;
    mainEl.innerHTML = glyphify(h);
    mainEl.querySelectorAll('[data-op]').forEach((n) => n.addEventListener('click', () => {
      const id = +n.closest('[data-id]')?.dataset.id, op = n.dataset.op;
      ui.sfx?.('ui_click', 0.5);
      if (op === 'move') hw.startMove(id); else if (op === 'repairall') hw.req('repair', { id: 'all' }); else hw.req(op, { id });
    }));
  }

  // ---------------------------------------------------------------- STATUS
  function renderStatus() {
    const st = S(), P = H.powerStats(st), out = H.dayOutput(st, { exhibits: hw.exhibits() });
    const bar = (a, b, label) => `<div class="hw-row"><span class="nm">${label} ${a}/${b}</span><span class="hw-bar${a > b ? ' bad' : ''}"><span style="width:${Math.min(100, (a / Math.max(1, b)) * 100)}%"></span></span></div>`;
    const daily = H.RES_KEYS.filter((k) => out[k] > 0.001).map((k) => `${H.RES_ICON[k].length === 1 ? H.RES_ICON[k] : t('shards')}${out[k].toFixed(1)}`).join('  ');
    const rs = st.st;
    mainEl.innerHTML = glyphify(`<div class="hw-box">${bar(P.demand, P.supply, '⚡ ' + t('Power'))}${bar(P.heat, P.cooling, '❄ ' + t('Cooling'))}
      <div class="hw-note">${escapeHtml(t('Buildings produce per GAME DAY (a day on a moon), not in real time. Storage is capped: come back and collect.'))}</div></div>
      <div class="hw-box">${escapeHtml(t('Per day now'))}: <b>${daily || '-'}</b> · ${escapeHtml(t('worth'))} ≈ ▮${Math.round(H.valueOf(out))} · ${escapeHtml(t('workers'))} ${H.workersOf(st)} · +${Math.round(H.boostOf(st) * 100)}%<br>
      ${escapeHtml(t('Ready to collect'))}: <b>${H.stored(st)}</b>  ·  ${escapeHtml(t('Days accounted'))}: ${st.days}</div>
      <div class="hw-row"><button class="btn" data-op="collect">${escapeHtml(t('COLLECT'))}</button><button class="btn" data-op="deposit">${escapeHtml(t('DEPOSIT HELD COMPONENTS'))}</button><button class="btn" data-op="withdraw">${escapeHtml(t('WITHDRAW 6 COMPONENTS'))}</button></div>
      <div class="hw-box">${escapeHtml(t('Raids'))}: ${escapeHtml(t('repelled'))} ${rs.repelled} · ${escapeHtml(t('held'))} ${rs.held} · ${escapeHtml(t('breached'))} ${rs.breached} · ${escapeHtml(t('Chance per landed day'))} ${Math.round(H.raidChance(st, (game.run?.day || 0) + 99) * 1000) / 10}%<br>
      <span class="hw-note">${escapeHtml(t('While the crew is away the homeworld can be raided. Towers, walls and mines defend it on their own; fly home in time and the crew adds firepower. A lost raid wrecks a building (repair it, it is never destroyed) and steals part of the storage.'))}</span></div>
      <div class="hw-box hw-note">${escapeHtml(t('Controls on the homeworld: [E] at the console or [H] opens this panel · LMB place · R rotate · RMB / ESC leave · U upgrade / X sell / M move the building under the crosshair.'))}</div>`);
    mainEl.querySelectorAll('[data-op]').forEach((n) => n.addEventListener('click', () => { ui.sfx?.('ui_click', 0.5); hw.req(n.dataset.op, {}); }));
  }

  function full() { renderTabs(); renderRes(); if (tab === 'build') renderBuild(); else if (tab === 'manage') renderManage(); else renderStatus(); }
  full();
  return {
    el: wrap,
    refresh() {
      const st = S(), s2 = JSON.stringify([st.b, st.s, wallet(), tab]);
      if (s2 === sig) return;
      sig = s2; const top = mainEl.scrollTop; full(); mainEl.scrollTop = top;
    },
    dispose() { /* DOM is dropped by ui.closePanel */ },
  };
}
