// HOMEWORLD 2 panel (CRT look, same frame conventions as ui/panels/homeworld.js): BUILD (factory / rooms / garden catalogue), MANAGE (machines: upgrade /
// repair / sell), STATUS (power, income, docks, wave clock, storage), RAID (share code, PvP flag, ghost targets).
//   createHomeworld2Panel(ui, game, hw2, { tab }) -> { el, refresh(), dispose() }   (hw2 = the module api)
import { el, escapeHtml } from '../../core/util.js';
import { t, tf } from '../../core/i18n.js';
import * as H from '../../game/homeworld_core.js';
import * as X from '../../game/homeworld2_core.js';

const CSS = `
.overlay .menu-frame.h2p{width:min(1100px,96vw);height:min(86vh,720px)}
.h2p > .cp-body{overflow:hidden;display:flex;flex-direction:column;padding-bottom:8px}
.h2p .tabs{margin-bottom:6px}
.h2p .h2-res{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.h2p .h2-chip{border:1px solid var(--ph-line);background:rgba(0,0,0,.4);padding:1px 8px;font-size:18px;min-width:92px}
.h2p .h2-body{overflow:auto;flex:1;min-height:0;padding-right:4px;scrollbar-width:thin}
.h2p .h2-cat{font-size:20px;letter-spacing:3px;color:var(--ph-hi);margin:8px 0 4px;border-bottom:1px dashed var(--ph-line)}
.h2p .h2-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:6px}
.h2p .h2-card{border:1px solid var(--ph-line);border-left:4px solid var(--ph-hi);background:rgba(0,0,0,.42);padding:4px 8px;cursor:pointer;outline:none}
.h2p .h2-card:hover,.h2p .h2-card:focus-visible{background:rgba(255,160,50,.12);box-shadow:0 0 12px rgba(255,160,50,.25)}
.h2p .h2-card.off{opacity:.5;cursor:not-allowed}
.h2p .h2-card b{font-size:22px;font-weight:normal;color:var(--ph-hi)}
.h2p .h2-card .sub{font-size:16px;opacity:.72;line-height:1.05}
.h2p .h2-card .row{display:flex;justify-content:space-between;gap:8px;font-size:18px}
.h2p .ok{color:#7dff7d}.h2p .bad{color:#ff6b5a}.h2p .warn{color:#ffd23f}
.h2p .h2-row{display:flex;align-items:center;gap:10px;border-bottom:1px dashed var(--ph-line);padding:3px 2px;font-size:19px;flex-wrap:wrap}
.h2p .h2-row .nm{flex:1;min-width:180px}
.h2p .h2-row .btn{font-size:17px;padding:1px 8px;min-height:0}
.h2p .h2-bar{height:8px;background:rgba(255,255,255,.1);border:1px solid var(--ph-line);position:relative;min-width:120px;flex:1}
.h2p .h2-bar>span{position:absolute;left:0;top:0;bottom:0;background:var(--ph-hi)}
.h2p .h2-bar.bad>span{background:#ff6b5a}
.h2p .h2-box{border:1px solid var(--ph-line);background:rgba(0,0,0,.34);padding:6px 10px;margin-bottom:8px;font-size:19px}
.h2p .h2-note{font-size:16px;opacity:.7;line-height:1.1}
.h2p textarea{width:100%;box-sizing:border-box;min-height:54px;background:rgba(0,0,0,.5);color:var(--ph-hi);border:1px solid var(--ph-line);font:16px var(--font,'VT323',monospace);padding:4px;resize:vertical}
@media (max-width:900px){.h2p .h2-grid{grid-template-columns:1fr}}
`;
let cssDone = false;
function ensureCss() {
  if (cssDone && document.getElementById('tfg-h2-css')) return;
  const s = document.createElement('style'); s.id = 'tfg-h2-css'; s.textContent = CSS; document.head.appendChild(s); cssDone = true;
}
const f0 = (n) => Math.floor(n + 1e-9).toLocaleString('en-US');
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
export const pieceName = (id) => t(X.PT[id]?.name || id);
const costHtml = (c, hw, wallet) => {
  const bits = [];
  if (c.cr) bits.push(`<span class="${wallet >= c.cr ? 'ok' : 'bad'}">▮${f0(c.cr)}</span>`);
  if (c.parts) bits.push(`<span class="${hw.s.parts >= c.parts ? 'ok' : 'bad'}">⚙${c.parts}</span>`);
  return bits.join(' ');
};
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function createHomeworld2Panel(ui, game, hw2, opts = {}) {
  ensureCss();
  let tab = ['build', 'manage', 'status', 'raid'].includes(opts.tab) ? opts.tab : 'build', sig = '', codeText = '';
  const wrap = ui.panel('wide h2p');
  const head = ui.panelHead(t('FACTORY'), ' ');
  const sub = head.querySelector('.cp-sub');
  const body = el('div', { class: 'cp-body' });
  const tabsEl = el('div', { class: 'tabs' }), resEl = el('div', { class: 'h2-res' }), mainEl = el('div', { class: 'h2-body' });
  body.append(tabsEl, resEl, mainEl);
  wrap.append(head, body, ui.panelFoot([['T', t('BUILD MODE')], ['ESC', t('CLOSE')]]));
  const S = () => hw2.layout(), HW = () => hw2.hw(), wallet = () => game.run?.credits || 0;

  function renderTabs() {
    tabsEl.innerHTML = '';
    for (const [id, label] of [['build', 'BUILD'], ['manage', 'MANAGE'], ['status', 'STATUS'], ['raid', 'RAID']]) tabsEl.appendChild(ui.button(t(label), () => { tab = id; full(); }, tab === id ? 'tab sel' : 'tab'));
  }
  function renderRes() {
    const hw = HW(); resEl.innerHTML = '';
    sub.innerHTML = `<b>▮${f0(wallet())}</b> · ${S().p.length} ${t('pieces')} · ${f1(hw2.income())}/${t('min')}`;
    for (const [k, label, icon] of [['cr', 'Credits', '▮'], ['parts', 'Components', '⚙'], ['s2', 'Circuit Core', '']]) {
      const cap = H.capOf(hw, k), v = hw.s[k], full = v >= cap - 1e-9;
      resEl.appendChild(el('div', { class: 'h2-chip' + (full ? ' warn' : ''), html: `${icon} ${f0(v)}/${f0(cap)}<br><small>${escapeHtml(t(label))}${full ? ' · ' + escapeHtml(t('FULL')) : ''}</small>` }));
    }
  }

  // ---------------------------------------------------------------- BUILD
  function card(id) {
    const d = X.PT[id], c = X.levelCost(id, 1), n = X.countOf(S(), id), hw = HW();
    const why = n >= d.max ? tf('Limit reached ({n})', { n: d.max }) : '';
    return `<div class="h2-card${why ? ' off' : ''}" tabindex="0" data-place="${id}"><div class="row"><b>${escapeHtml(pieceName(id))}</b><span>${n}/${d.max}</span></div>
      <div class="sub">${escapeHtml(t(d.desc))}</div>
      <div class="row"><span>${costHtml(c, hw, wallet())}</span><span class="sub">${d.size[0]}x${d.size[1]}${d.pw ? ' · ⚡-' + d.pw : ''}${id === 'generator' ? ' · ⚡+' + X.GEN.supply : ''}</span></div>${why ? `<div class="sub bad">${escapeHtml(why)}</div>` : ''}</div>`;
  }
  function kitCard(k) {
    const K = X.KITS[k], c = X.kitCost(k), hw = HW();
    return `<div class="h2-card" tabindex="0" data-kit="${k}"><div class="row"><b>${escapeHtml(t(KIT_NAME[k]))}</b><span>${K.w}x${K.h}</span></div><div class="sub">${escapeHtml(t(KIT_DESC[k]))}</div>
      <div class="row"><span>${costHtml(c, hw, wallet())}</span><span class="sub">${escapeHtml(t('floor + walls + door + roof + furniture'))}</span></div></div>`;
  }
  const KIT_NAME = { storage: 'Storage Room', workshop: 'Workshop', bedroom: 'Bedroom', greenhouse: 'Greenhouse' };
  const KIT_DESC = { storage: 'Three crates: storage +60 %.', workshop: 'Two benches: every machine +12 % speed.', bedroom: 'A bed under a roof: slow passive Clout.', greenhouse: 'A planter under a roof: trees grow twice as fast.' };
  function renderBuild() {
    let h = `<div class="h2-note">${escapeHtml(t('Pick a piece, then LMB on the grid. Hold LMB to drag belts, floors and walls. R rotates, X removes, U upgrades, RMB / ESC leaves.'))}</div>`;
    h += `<div class="h2-cat">${escapeHtml(t('FACTORY'))}</div><div class="h2-grid">${X.TYPES.filter((k) => X.PT[k].cat === 'fac').map(card).join('')}</div>`;
    h += `<div class="h2-cat">${escapeHtml(t('ROOM KITS'))}</div><div class="h2-grid">${Object.keys(X.KITS).map(kitCard).join('')}</div>`;
    h += `<div class="h2-cat">${escapeHtml(t('ROOM PIECES'))}</div><div class="h2-grid">${X.TYPES.filter((k) => X.PT[k].cat === 'str').map(card).join('')}</div>`;
    h += `<div class="h2-cat">${escapeHtml(t('GARDEN'))}</div><div class="h2-grid">${X.TYPES.filter((k) => X.PT[k].cat === 'nat').map(card).join('')}</div>`;
    mainEl.innerHTML = h;
    mainEl.querySelectorAll('[data-place]').forEach((n) => n.addEventListener('click', () => { if (!n.classList.contains('off')) hw2.startPlace(n.dataset.place); }));
    mainEl.querySelectorAll('[data-kit]').forEach((n) => n.addEventListener('click', () => hw2.startKit(n.dataset.kit)));
  }

  // ---------------------------------------------------------------- MANAGE
  function renderManage() {
    const s = S(), hw = HW();
    const list = s.p.filter((p) => X.PT[p.t].cat !== 'str' || p.t === 'crate' || p.t === 'bench' || p.t === 'bed' || p.t === 'planter').filter((p) => p.t !== 'belt' && p.t !== 'pole' && p.t !== 'splitter');
    if (!list.length) { mainEl.innerHTML = `<div class="h2-box">${escapeHtml(t('Nothing built yet. Use the BUILD tab.'))}</div>`; return; }
    let h = '';
    for (const p of list.sort((a, b) => (a.t > b.t ? 1 : -1) || a.i - b.i)) {
      const d = X.PT[p.t], up = d.mk && p.l < X.MAX_LV ? X.upgradeCost(p.t, p.l) : null, sv = X.sellOf(p), rc = p.br ? X.repairCostOf(p) : null;
      const extra = p.t === 'tree' ? ` · ${escapeHtml(t(['Sapling', 'Young tree', 'Mature tree'][X.treeStage(p.a || 0)]))}${p.f ? ` · ${p.f} ${escapeHtml(t('fruit'))}` : ''}` : '';
      h += `<div class="h2-row" data-id="${p.i}"><span class="nm"><b>${escapeHtml(pieceName(p.t))}</b>${d.mk ? ' Mk' + p.l : ''}${p.br ? ` <span class="bad">${escapeHtml(t('BROKEN'))}</span>` : ''}${extra}</span>
        ${up ? `<button class="btn" data-op="up">${escapeHtml(t('UPGRADE'))} ${costHtml(up, hw, wallet())}</button>` : d.mk ? '<span class="ok">MAX</span>' : ''}
        ${rc ? `<button class="btn" data-op="repair">${escapeHtml(t('REPAIR'))} ▮${rc.cr} ⚙${rc.parts}</button>` : ''}
        <button class="btn" data-op="sell">${escapeHtml(p.t === 'tree' ? t('FELL') : t('SELL'))} ▮${sv.cr}</button></div>`;
    }
    if (s.p.some((p) => p.br)) h += `<div style="margin-top:8px"><button class="btn" data-op="repairall">${escapeHtml(t('REPAIR ALL'))}</button></div>`;
    mainEl.innerHTML = h;
    mainEl.querySelectorAll('[data-op]').forEach((n) => n.addEventListener('click', () => {
      const id = +n.closest('[data-id]')?.dataset.id, op = n.dataset.op;
      ui.sfx?.('ui_click', 0.5);
      if (op === 'repairall') hw2.req('repair', { id: 'all' }); else hw2.req(op, { id });
    }));
  }

  // ---------------------------------------------------------------- STATUS
  function renderStatus() {
    const m = hw2.meta(), hw = HW(), s = S(), gate = X.waveGate(hw, s), P = m.pw || { sup: 0, dem: 0 };
    const bar = (a, b, label) => `<div class="h2-row"><span class="nm">${label} ${f1(a)}/${f1(b)}</span><span class="h2-bar${a > b ? ' bad' : ''}"><span style="width:${Math.min(100, (a / Math.max(1, b)) * 100)}%"></span></span></div>`;
    const wv = m.w || { left: 0, armed: 0, shield: 0, n: 0 };
    const shield = Math.max(0, Math.round((wv.shield - Date.now()) / 1000));
    let wave;
    if (shield > 0) wave = `<span class="ok">${escapeHtml(t('SHIELD'))} ${mmss(shield)}</span> - ${escapeHtml(t('the raiders lost track of your base. No waves until it ends.'))}`;
    else if (!gate.ok) wave = `${escapeHtml(t('No waves yet: build a few things first.'))} (${gate.n}/${gate.needN}, ▮${f0(gate.v)}/${gate.needV})`;
    else wave = `${escapeHtml(t('NEXT WAVE'))} <b class="${wv.left < 60 ? 'bad' : ''}">${mmss(wv.left)}</b> · ${escapeHtml(t('waves survived'))} ${wv.n} · ${escapeHtml(t('power'))} ${f1(X.wavePower(X.baseValue(hw, s), wv.n, game.run?.quotaIndex || 0))}${wv.left > 20 ? `<br><button class="btn" data-op="call">${escapeHtml(t('CALL WAVE EARLY (+25 % loot)'))}</button>` : ''}`;
    const full = ['cr', 'parts', 's2'].some((k) => hw.s[k] >= H.capOf(hw, k) - 1e-9);
    mainEl.innerHTML = `<div class="h2-box">${bar(P.dem, P.sup, '⚡ ' + t('Power'))}
      <div class="h2-note">${escapeHtml(t('Poles link within 12 m, machines need a pole within 7.5 m, and the pole network has to reach the landing pad. Generators burn scrap from a belt; the pad shore power is shared with your buildings.'))}</div></div>
      <div class="h2-box">${escapeHtml(t('Income now'))}: <b>${f1(hw2.income())}</b> ${escapeHtml(t('credit-equivalents per minute'))} · ${escapeHtml(t('exported in total'))} ≈ ▮${f0(s.st.exported)}<br>
      ${full ? `<span class="warn">${escapeHtml(t('STORAGE FULL: the export docks are backing up. COLLECT at the console, or build Warehouses / a Storage Room.'))}</span><br>` : ''}
      <span class="h2-note">${escapeHtml(t('The factory runs while you are online (any phase). While you are away it earns 10 % of the live rate for up to 8 hours, and it can never pay more than your storage holds.'))}</span></div>
      <div class="h2-box">${wave}<br><span class="h2-note">${escapeHtml(t('Waves come only while somebody is on the homeworld. A lost wave breaks a machine or two (repair it, nothing is ever deleted) and raises a shield.'))}</span></div>
      <div class="h2-row"><button class="btn" data-op="collect">${escapeHtml(t('COLLECT'))}</button><span class="h2-note">${escapeHtml(t('(the classic homeworld console also collects)'))}</span></div>
      <div class="h2-box h2-note">${escapeHtml(t('Rooms: ') + `${m.rooms || 0} ${t('closed rooms')} · ${t('storage')} +${Math.round((m.storage || 0) * 100)}% · ${t('machine speed')} +${Math.round((m.speed || 0) * 100)}% · Clout ${f1(m.clout || 0)}/${t('min')}`)}</div>`;
    mainEl.querySelectorAll('[data-op]').forEach((n) => n.addEventListener('click', () => { ui.sfx?.('ui_click', 0.5); if (n.dataset.op === 'collect') game.homeworld?.req?.('collect', {}); else hw2.req(n.dataset.op, {}); }));
  }

  // ---------------------------------------------------------------- RAID (ghosts)
  function renderRaid() {
    const s = S(), m = hw2.meta(), targets = hw2.ghosts(), now = Date.now();
    let h = `<div class="h2-box">${escapeHtml(t('Raid other bases: a ghost is a snapshot of a base. Its towers and guards are real, you fight them with your own gear, crack the vault and leave. Nobody loses anything: it is a raid on a copy.'))}<br>
      <label><input type="checkbox" data-op="pvp" ${s.pvp ? 'checked' : ''}> ${escapeHtml(t('Allow raids on my base (PvP flag): lets you export a share code'))}</label></div>`;
    h += `<div class="h2-box"><b>${escapeHtml(t('SHARE MY BASE'))}</b> <button class="btn" data-op="gexport">${escapeHtml(t('GENERATE CODE'))}</button><br><textarea id="h2-code" readonly placeholder="TFG-H2:...">${escapeHtml(codeText)}</textarea></div>`;
    h += `<div class="h2-box"><b>${escapeHtml(t('IMPORT A BASE CODE'))}</b><br><textarea id="h2-imp" placeholder="TFG-H2:..."></textarea><button class="btn" data-op="gimport">${escapeHtml(t('IMPORT'))}</button></div>`;
    h += `<div class="h2-cat">${escapeHtml(t('TARGETS'))}</div>`;
    for (const g of targets) {
      const cd = Math.max(0, Math.round(((s.g.raided[g.id] || 0) - now) / 1000)), sel = m.gt === g.id;
      const loot = X.ghostLoot(g, { quotaIndex: game.run?.quotaIndex || 0, mine: g.id === 'mine' });
      h += `<div class="h2-row" data-gid="${escapeHtml(g.id)}"><span class="nm"><b>${escapeHtml(g.name)}</b> ${sel ? '<span class="ok">' + escapeHtml(t('SELECTED')) + '</span>' : ''}<br><small>${escapeHtml(t('tier'))} ${g.tier} · ${g.n ?? g.b?.length ?? 0} ${escapeHtml(t('buildings'))} · ${escapeHtml(t('loot up to'))} ▮${loot.cr} ⚙${loot.parts} ◈${loot.clout}${g.id === 'mine' ? ' (' + escapeHtml(t('practice: 40 %')) + ')' : ''}</small></span>
        ${cd > 0 ? `<span class="warn">${escapeHtml(t('cooldown'))} ${mmss(cd)}</span>` : `<button class="btn" data-op="gtarget">${escapeHtml(t('SELECT'))}</button>`}</div>`;
    }
    h += `<div class="h2-box h2-note">${escapeHtml(t('Then take off and type GHOST GO at the ship terminal (GHOST lists the targets). You land next to the base; leave with the lever when you are done.'))}</div>`;
    mainEl.innerHTML = h;
    mainEl.querySelectorAll('[data-op]').forEach((n) => {
      const op = n.dataset.op;
      const fn = () => {
        ui.sfx?.('ui_click', 0.5);
        if (op === 'pvp') hw2.req('pvp', { on: n.checked ? 1 : 0 });
        else if (op === 'gexport') hw2.req('gexport', {});
        else if (op === 'gimport') hw2.req('gimport', { code: mainEl.querySelector('#h2-imp')?.value || '' });
        else if (op === 'gtarget') hw2.req('gtarget', { id: n.closest('[data-gid]')?.dataset.gid });
      };
      n.addEventListener(op === 'pvp' ? 'change' : 'click', fn);
    });
  }

  function full() { renderTabs(); renderRes(); ({ build: renderBuild, manage: renderManage, status: renderStatus, raid: renderRaid })[tab](); }
  full();
  return {
    el: wrap,
    setCode(c) { codeText = c || ''; if (tab === 'raid') { const ta = mainEl.querySelector('#h2-code'); if (ta) ta.value = codeText; } },
    refresh() {
      const s = S(), hw = HW(), m = hw2.meta();
      const s2 = JSON.stringify([tab === 'manage' || tab === 'build' ? s.p.length + ':' + s.p.reduce((a, p) => a + (p.l || 1) + (p.br ? 100 : 0) + (p.f || 0) + Math.floor((p.a || 0) / 100), 0) : 0, hw.s.cr | 0, hw.s.parts | 0, wallet() | 0, tab, tab === 'status' ? [Math.floor((m.w?.left || 0) / 5), m.pw, Math.round(hw2.income())] : 0, tab === 'raid' ? [m.gt, s.pvp, s.g.imported.length] : 0]);
      if (s2 === sig) return;
      const editing = tab === 'raid' && document.activeElement?.tagName === 'TEXTAREA';
      if (editing) return;
      sig = s2; const top = mainEl.scrollTop; full(); mainEl.scrollTop = top;
    },
    dispose() { /* DOM is dropped by ui.closePanel */ },
  };
}
