// KEFAL HOMESTEAD panel (wave 8 tycoon, module 'homestead'): one compact read-only page opened with E at the booth. Buying / collecting happens on the floor pads.
// Shows: pot (pile / cap, per minute), today's production, the next pads with costs, the lodge checklist, stars, top crew spenders and the Re-Claim requirements.
//   createHomesteadPanel(ui, game, api) -> { el, refresh(), dispose() }   (api = the module api: state(), core, snap, pileNow())
import { el, escapeHtml } from '../../core/util.js';
import { t, tf } from '../../core/i18n.js';

const CSS = `
.overlay .menu-frame.hsp{width:min(900px,96vw);height:min(78vh,620px)}
.hsp > .cp-body{overflow:hidden;display:flex;flex-direction:column;padding-bottom:8px}
.hsp .hs-main{overflow:auto;flex:1;min-height:0;padding-right:4px;scrollbar-width:thin}
.hsp .hs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:6px;margin-bottom:8px}
.hsp .tfg-card b{font-weight:normal;font-size:21px}.hsp .sub{font-size:16px;opacity:.75;line-height:1.1}
.hsp .row{display:flex;justify-content:space-between;gap:8px;font-size:18px;align-items:center}
.hsp .ok{color:#7dff7d}.hsp .bad{color:#ff6b5a}.hsp .warn{color:#ffd23f}.hsp .dim{opacity:.55}
.hsp .tfg-bar{margin:4px 0}
`;
let cssDone = false;
function ensureCss() { if (cssDone && document.getElementById('tfg-hsp-css')) return; const s = document.createElement('style'); s.id = 'tfg-hsp-css'; s.textContent = CSS; document.head.appendChild(s); cssDone = true; }
const f0 = (n) => Math.floor(n + 1e-9).toLocaleString('en-US');

export function createHomesteadPanel(ui, game, api) {
  ensureCss();
  const C = api.core;
  let sig = '';
  const wrap = ui.panel('wide hsp');
  const head = ui.panelHead(t('KEFAL HOMESTEAD'), ' ');
  const body = el('div', { class: 'cp-body' }), mainEl = el('div', { class: 'hs-main' });
  body.append(mainEl);
  wrap.append(head, body, ui.panelFoot([['ESC', t('CLOSE')]]));
  const bar = (v) => `<div class="tfg-bar"><i style="width:${Math.max(0, Math.min(100, v * 100))}%"></i></div>`;
  const line = (label, right, cls = '') => `<div class="row"><span>${escapeHtml(label)}</span><span class="${cls}">${escapeHtml(right)}</span></div>`;

  function render() {
    const s = api.state(), snap = api.snap, cr = game.run?.credits || 0;
    const cap = C.capOf(s), pc = C.pileCap(s), pile = api.pileNow(), g = game.isHost ? s.g.n : snap.g, rate = cap > 0 ? cap / C.TY.rampS * 60 : 0;
    const key = JSON.stringify([s.b, s.rb, s.who, s.by, Math.floor(pile), Math.floor(g), cr >= 1 ? Math.floor(cr / 20) : 0]);
    if (key === sig) return; sig = key;
    const sub = head.querySelector('.cp-sub'); if (sub) sub.textContent = '★'.repeat(s.rb) || ' ';
    let h = `<div class="hs-grid">
      <div class="tfg-card"><div class="row"><b>${escapeHtml(t('Pot'))}</b><span class="${pile >= 1 ? 'ok' : 'dim'}">▮${f0(pile)} / ${f0(pc)}</span></div>${bar(pc > 0 ? pile / pc : 0)}
        <div class="sub">${escapeHtml(cap > 0 ? tf('{n} per minute while the line runs. Stand on the gold pad to cash in.', { n: Math.round(rate * 10) / 10 }) : t('Build the belt and the line starts paying.'))}</div>
        <div class="sub">${escapeHtml(t('Clout: once per game day, stand on the gold pad.'))}</div></div>
      <div class="tfg-card"><div class="row"><b>${escapeHtml(t('Today'))}</b><span>${f0(g)} / ${f0(cap)}</span></div>${bar(cap > 0 ? g / cap : 0)}
        <div class="sub">${escapeHtml(t('The line makes a fixed amount per game day. Past that it waits: fly a run to reset it.'))}</div></div>
      <div class="tfg-card"><div class="row"><b>${escapeHtml(t('Stars'))}</b><span class="warn">${'★'.repeat(s.rb)}${'☆'.repeat(C.MAX_RB - s.rb)}</span></div>
        <div class="sub">${escapeHtml(s.rb ? tf('Belt speed +{n}%, shinier cubes. The daily cap never changes.', { n: Math.round((C.beltSpeedMul(s.rb) - 1) * 100) }) : t('Re-Claim the line for a star: faster belt, shinier cubes.'))}</div></div></div>`;
    const av = C.available(s, 3);
    h += `<div class="hs-grid"><div class="tfg-card"><div class="row"><b>${escapeHtml(t('Next pads'))}</b></div>${av.length ? av.map((p) => { const c = C.priceOf(s, p); return line(t(p.name), c ? `▮${f0(c)}` : t('free'), cr >= c ? 'ok' : 'warn'); }).join('') : `<div class="sub">${escapeHtml(t('Everything is built.'))}</div>`}
        <div class="sub">${escapeHtml(t('Stand on a glowing pad for a moment to buy it.'))}</div></div>`;
    h += `<div class="tfg-card"><div class="row"><b>${escapeHtml(t('Lodge'))}</b><span class="dim">${C.LODGE_IDS.filter((id) => C.has(s, id)).length} / ${C.LODGE_IDS.length}</span></div>${C.LODGE_IDS.map((id) => line(t(C.PIECE[id].name), C.has(s, id) ? '✓' : `▮${f0(C.PIECE[id].cost)}`, C.has(s, id) ? 'ok' : 'dim')).join('')}</div>`;
    const top = Object.entries(s.by).sort((a, b) => b[1] - a[1]).slice(0, 4);
    h += `<div class="tfg-card"><div class="row"><b>${escapeHtml(t('Top builders'))}</b></div>${top.length ? top.map(([n, v]) => line(n, `▮${f0(v)}`)).join('') : `<div class="sub">${escapeHtml(t('Nobody has spent a credit here yet.'))}</div>`}</div>`;
    const need = C.has(s, 'gate3') && C.has(s, 'roof');
    h += `<div class="tfg-card"><div class="row"><b>${escapeHtml(t('Re-Claim'))}</b><span class="${s.rb >= C.MAX_RB ? 'dim' : need ? 'ok' : 'warn'}">${s.rb >= C.MAX_RB ? escapeHtml(t('MAX')) : `▮${f0(C.reclaimCost(s.rb))}`}</span></div>
      <div class="sub">${escapeHtml(t('Needs the Polish Gate and the Roof. The line resets (re-buying costs 75%), the lodge stays.'))}</div>
      ${line(t('Polish Gate'), C.has(s, 'gate3') ? '✓' : '-', C.has(s, 'gate3') ? 'ok' : 'dim')}${line(t('Roof'), C.has(s, 'roof') ? '✓' : '-', C.has(s, 'roof') ? 'ok' : 'dim')}</div></div>`;
    const top2 = mainEl.scrollTop; mainEl.innerHTML = h; mainEl.scrollTop = top2;
  }
  render();
  return { el: wrap, refresh: render, dispose() { /* DOM is dropped by ui.closePanel */ } };
}
