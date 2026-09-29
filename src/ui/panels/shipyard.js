// SHIPYARD panel (CRT look, same frame conventions as the forge / crafting panels): MODULES (buy / build / upgrade / sell / move), FRAME (ship parts
// stock + deposit), HULL (paint colours, pattern, interior theme, name plate) and STATUS (weight, route cost, threat). Everything shown comes from
// game/shipyard_core.js; the host re-checks every action, the panel only previews.
//   createShipyardPanel(ui, game, sy, { tab }) -> { el, setTab(id), dispose() }
import { el, escapeHtml } from '../../core/util.js';
import { t, tf } from '../../core/i18n.js';
import { iconHTML } from '../icons.js';
import * as Y from '../../game/shipyard_core.js';
import { SOCKETS, SOCKET_IDS } from '../../world/hardpoints.js';

const CSS = `
.overlay .menu-frame.shipyard{width:min(1100px,96vw);height:min(86vh,720px)}
.shipyard > .cp-body{overflow:hidden;display:flex;flex-direction:column;padding-bottom:8px}
.shipyard .tabs{margin-bottom:8px}
.shipyard .sy-wrap{display:grid;grid-template-columns:minmax(0,290px) minmax(0,1fr);gap:14px;min-height:0;flex:1}
.shipyard .sy-list{overflow:auto;display:flex;flex-direction:column;gap:6px;padding-right:4px;scrollbar-width:thin}
.shipyard .sy-row{--tc:#9aa39a;display:flex;align-items:center;gap:8px;border:1px solid color-mix(in srgb,var(--tc) 50%,transparent);border-left:4px solid var(--tc);background:rgba(0,0,0,.42);padding:5px 8px;cursor:pointer;outline:none}
.shipyard .sy-row:hover,.shipyard .sy-row:focus-visible,.shipyard .sy-row.sel{background:color-mix(in srgb,var(--tc) 18%,rgba(0,0,0,.5));box-shadow:0 0 12px color-mix(in srgb,var(--tc) 35%,transparent)}
.shipyard .sy-row .nm{font-size:21px;line-height:1;color:var(--tc);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.shipyard .sy-row .mk{font-size:16px;opacity:.85;text-transform:uppercase}
.shipyard .sy-row.off{opacity:.62}
.shipyard .sy-det{overflow:auto;display:flex;flex-direction:column;gap:9px;padding-right:4px;scrollbar-width:thin}
.shipyard .sy-box{border:1px solid var(--ph-line);background:rgba(0,0,0,.34);padding:8px 11px}
.shipyard .sy-name{font-size:30px;line-height:1;color:var(--tc,#ffd9b8);text-shadow:0 0 10px color-mix(in srgb,var(--tc,#ffb060) 55%,transparent)}
.shipyard .sy-sub{font-size:17px;opacity:.75;margin-top:2px}
.shipyard .sy-tier{border:1px solid var(--ph-line);padding:5px 9px;margin-top:6px;background:rgba(0,0,0,.3)}
.shipyard .sy-tier.now{border-color:var(--tc,#ffb060);background:color-mix(in srgb,var(--tc,#ffb060) 14%,rgba(0,0,0,.4))}
.shipyard .sy-tier.next{border-style:dashed;border-color:#7dff7d}
.shipyard .sy-tier h4{margin:0;font-size:20px;font-weight:normal;color:var(--ph-hi)}
.shipyard .sy-tier li{font-size:18px;line-height:1.1;margin:1px 0 1px 16px}
.shipyard .sy-cost{font-size:19px;margin-top:3px}
.shipyard .ok{color:#7dff7d}.shipyard .bad{color:#ff6b5a}.shipyard .warn{color:#ffd23f}
.shipyard .sy-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:4px}
.shipyard .sy-socks{display:flex;flex-wrap:wrap;gap:6px}
.shipyard .sy-note{font-size:16px;opacity:.65;line-height:1.05}
.shipyard .sy-parts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.shipyard .sy-part{border:1px solid var(--ph-line);background:rgba(0,0,0,.4);padding:8px;text-align:center}
.shipyard .sy-part .ico{width:44px;height:44px;margin:0 auto}
.shipyard .sy-part b{display:block;font-size:30px;color:var(--ph-hi);font-weight:normal}
.shipyard .sy-part span{font-size:16px;opacity:.75;display:block;line-height:1.05}
.shipyard .sy-sw{display:grid;grid-template-columns:repeat(12,1fr);gap:4px;margin:4px 0 8px}
.shipyard .sy-sw i{display:block;height:26px;border:2px solid rgba(255,255,255,.15);cursor:pointer}
.shipyard .sy-sw i.sel{border-color:#fff;box-shadow:0 0 8px #fff}
.shipyard .sy-btns{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px}
.shipyard .sy-in{background:rgba(0,0,0,.5);color:var(--ph-hi);border:1px solid var(--ph-line);font:22px var(--font,'VT323',monospace);padding:2px 8px;width:14em;letter-spacing:2px;text-transform:uppercase}
.shipyard canvas.sy-prev{width:100%;max-width:520px;image-rendering:pixelated;border:1px solid var(--ph-line);background:#05070a}
.shipyard .sy-row2{display:flex;justify-content:space-between;gap:10px;font-size:20px;padding:2px 0;border-bottom:1px dashed var(--ph-line)}
.shipyard .sy-row2:last-child{border-bottom:none}
@media (max-width:900px){.shipyard .sy-wrap{grid-template-columns:1fr}.shipyard .sy-parts{grid-template-columns:repeat(2,1fr)}}
`;
let cssDone = false;
function ensureCss() {
  if (cssDone && document.getElementById('tfg-shipyard-css')) return;
  const s = document.createElement('style'); s.id = 'tfg-shipyard-css'; s.textContent = CSS; document.head.appendChild(s); cssDone = true;
}
const hexCss = (h) => '#' + h.toString(16).padStart(6, '0');
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function createShipyardPanel(ui, game, sy, opts = {}) {
  ensureCss();
  let tab = ['modules', 'frame', 'hull', 'status'].includes(opts.tab) ? opts.tab : 'modules';
  let sel = null, selSock = null, moving = false, lastKey = '';
  const draft = { c1: null, c2: null, pat: null, theme: null, name: null };
  const wrap = ui.panel('wide shipyard');
  const head = ui.panelHead(t('SHIPYARD'), ' ');
  const sub = head.querySelector('.cp-sub');
  const body = el('div', { class: 'cp-body' });
  const tabsEl = el('div', { class: 'tabs' });
  const main = el('div', { class: 'sy-wrap' });
  body.append(tabsEl, main);
  wrap.append(head, body, ui.panelFoot([['ESC', t('BACK')]]));

  const S = () => sy.state();
  const cr = () => sy.credits();
  const sfx = (n) => ui.sfx?.(n, 0.45);
  const setSub = () => { const s = S(); sub.innerHTML = `<b>▮${fmt(cr())}</b> · ${Y.PART_KEYS.map((k) => `${s.parts[k]}`).join(' / ')} ${escapeHtml(t('Ship parts'))}`; };
  const costHtml = (c, p, have) => {
    const okC = cr() >= c;
    const parts = p ? Y.PART_KEYS.filter((k) => p[k]).map((k) => `<span class="${(have.parts[k] || 0) >= p[k] ? 'ok' : 'bad'}">${have.parts[k] || 0}/${p[k]} ${escapeHtml(t(Y.PARTS[k].name))}</span>`).join(', ') : '';
    return `<div class="sy-cost">${escapeHtml(t('Cost'))}: <b class="${okC ? '' : 'bad'}">▮${fmt(c)}</b> ${parts ? ` · ${escapeHtml(t('or free with parts'))}: ${parts}` : ''}</div>`;
  };

  // ------------------------------------------------------------------ tabs
  function renderTabs() {
    tabsEl.innerHTML = '';
    for (const [id, label] of [['modules', 'MODULES'], ['frame', 'FRAME'], ['hull', 'HULL'], ['status', 'STATUS']]) {
      tabsEl.appendChild(ui.button(t(label), () => { tab = id; sfx('ui_click'); full(); }, tab === id ? 'tab sel' : 'tab'));
    }
  }

  // ------------------------------------------------------------------ modules
  function moduleRow(id) {
    const m = Y.MODULES[id], tier = Y.tierOf(S(), id);
    const row = el('div', { class: 'sy-row' + (sel === id ? ' sel' : '') + (tier ? '' : ' off'), tabindex: '0', style: { '--tc': hexCss(m.color) } });
    row.append(el('div', { class: 'nm' }, t(m.name)), el('div', { class: 'mk' }, tier ? `Mk ${Y.ROMAN[tier]}` : t('Not installed')));
    row.addEventListener('click', () => { sel = id; selSock = null; moving = false; sfx('ui_click'); renderList(); renderDetail(); });
    return row;
  }
  function renderModules() {
    main.innerHTML = '';
    const list = el('div', { class: 'sy-list' }), det = el('div', { class: 'sy-det' });
    main.append(list, det);
    renderModules.list = list; renderModules.det = det;
    if (!sel) sel = Y.MODULE_IDS[0];
    renderList(); renderDetail();
  }
  function renderList() {
    const list = renderModules.list; if (!list) return;
    list.innerHTML = '';
    for (const id of Y.MODULE_IDS) list.appendChild(moduleRow(id));
  }
  function renderDetail() {
    const det = renderModules.det; if (!det || tab !== 'modules') return;
    det.innerHTML = '';
    const s = S(), id = sel, m = Y.MODULES[id];
    if (!m) { det.appendChild(el('div', { class: 'sy-note' }, t('Pick a module.'))); return; }
    const tier = Y.tierOf(s, id), sock = Y.socketOf(s, id), q = Y.quote(s, id);
    const have = { parts: s.parts };
    const box = el('div', { class: 'sy-box', style: { '--tc': hexCss(m.color) } });
    box.append(el('div', { class: 'sy-name' }, t(m.name)), el('div', { class: 'sy-sub' }, t(m.blurb)));
    if (sock) box.append(el('div', { class: 'sy-sub ok' }, `${t('Installed')}: ${sy.sockName(sock)} · Mk ${Y.ROMAN[tier]}`));
    det.appendChild(box);
    // tiers
    for (let n = 1; n <= 3; n++) {
      const d = el('div', { class: 'sy-tier' + (n === tier ? ' now' : n === tier + 1 ? ' next' : ''), style: { '--tc': hexCss(m.color) } });
      d.appendChild(el('h4', {}, `Mk ${Y.ROMAN[n]}${n === tier ? ' ✓' : ''}`));
      const ul = el('ul', { style: { margin: '2px 0' } });
      for (const l of sy.lines(id, n)) ul.appendChild(el('li', {}, l));
      d.appendChild(ul);
      if (n === tier + 1) d.insertAdjacentHTML('beforeend', costHtml(q.cr, q.parts, have));
      det.appendChild(d);
    }
    // actions
    const acts = el('div', { class: 'sy-box' });
    const atC = sy.atConsole();
    if (!tier) {
      const free = Y.freeSockets(s, id);
      if (!free.length) acts.appendChild(el('div', { class: 'bad' }, t('No free hardpoint for that module.')));
      else {
        if (!selSock || !free.includes(selSock)) selSock = free[0];
        acts.appendChild(el('div', { class: 'sy-sub' }, t('Choose a hardpoint')));
        const socks = el('div', { class: 'sy-socks' });
        for (const k of free) socks.appendChild(ui.button(sy.sockName(k), () => { selSock = k; renderDetail(); }, 'small' + (selSock === k ? ' primary' : '')));
        acts.appendChild(socks);
        const canC = cr() >= q.cr, canP = Y.PART_KEYS.every((k) => (s.parts[k] || 0) >= (q.parts[k] || 0)) && atC;
        const row = el('div', { class: 'sy-acts' });
        row.appendChild(ui.button(`${t('BUY')} ▮${fmt(q.cr)}`, () => { if (canC) sy.req('install', { id, sock: selSock, via: 'credits' }); else { ui.sfx('ui_error'); ui.toast(t('Not enough credits.'), 'bad'); } }, 'primary' + (canC ? '' : ' disabled')));
        row.appendChild(ui.button(t('BUILD'), () => { if (canP) sy.req('install', { id, sock: selSock, via: 'parts' }); else { ui.sfx('ui_error'); ui.toast(atC ? t('Missing ship parts.') : t('Stand at the Frame Console to use ship parts.'), 'bad'); } }, 'primary' + (canP ? '' : ' disabled')));
        acts.appendChild(row);
      }
    } else {
      const row = el('div', { class: 'sy-acts' });
      if (q.maxed) row.appendChild(el('div', { class: 'ok' }, t('Mk III (max)')));
      else {
        const canC = cr() >= q.cr, canP = Y.PART_KEYS.every((k) => (s.parts[k] || 0) >= (q.parts[k] || 0)) && atC;
        row.appendChild(ui.button(`${t('UPGRADE')} ▮${fmt(q.cr)}`, () => { if (canC) sy.req('upgrade', { id, via: 'credits' }); else { ui.sfx('ui_error'); ui.toast(t('Not enough credits.'), 'bad'); } }, 'primary' + (canC ? '' : ' disabled')));
        row.appendChild(ui.button(`${t('UPGRADE')} (${t('Ship parts')})`, () => { if (canP) sy.req('upgrade', { id, via: 'parts' }); else { ui.sfx('ui_error'); ui.toast(atC ? t('Missing ship parts.') : t('Stand at the Frame Console to use ship parts.'), 'bad'); } }, canP ? '' : 'disabled'));
      }
      row.appendChild(ui.button(`${t('Sell (50% back)')} ▮${fmt(Y.refundOf(s, id))}`, () => sy.req('sell', { id }), 'small'));
      const targets = m.sockets.filter((k) => !s.m[k] && k !== sock && (!SOCKETS[k].parent || (s.m[SOCKETS[k].parent] && SOCKETS[k].parent !== sock)));
      if (targets.length) row.appendChild(ui.button(tf('Move (▮{n})', { n: Y.MOVE_COST }), () => { moving = !moving; renderDetail(); }, 'small' + (moving ? ' primary' : '')));
      acts.appendChild(row);
      if (moving && targets.length) {
        const socks = el('div', { class: 'sy-socks', style: { marginTop: '6px' } });
        for (const k of targets) socks.appendChild(ui.button(sy.sockName(k), () => { moving = false; sy.req('move', { id, to: k }); }, 'small'));
        acts.appendChild(socks);
      }
    }
    if (!atC) acts.appendChild(el('div', { class: 'sy-note' }, t('Stand at the Frame Console to use ship parts.')));
    acts.appendChild(el('div', { class: 'sy-note' }, tf('Weight: routes cost {p} more, heavy hull = louder touchdown, bigger siege target.', { p: Y.weightText(s) })));
    det.appendChild(acts);
  }

  // ------------------------------------------------------------------ frame (ship parts)
  function renderFrame() {
    main.innerHTML = '';
    const det = el('div', { class: 'sy-det', style: { gridColumn: '1 / -1' } });
    main.appendChild(det);
    const s = S(), carried = sy.held();
    const grid = el('div', { class: 'sy-parts' });
    for (const k of Y.PART_KEYS) {
      const p = Y.PARTS[k];
      grid.appendChild(el('div', { class: 'sy-part' }, el('div', { class: 'ico', html: iconHTML(p.id, 'ico') }), el('b', {}, String(s.parts[k])), el('span', {}, t(p.name)), el('span', { class: carried[k] ? 'ok' : '' }, `${t('Carried')}: ${carried[k]}`)));
    }
    det.append(el('div', { class: 'sy-box' }, el('div', { class: 'sy-name' }, t('Frame Console')), el('div', { class: 'sy-sub' }, t('Feed carried ship parts to the console. Parts are kept for good: fired runs do not take them, nor the modules.'))), grid);
    const any = Y.PART_KEYS.some((k) => carried[k] > 0), atC = sy.atConsole();
    det.appendChild(ui.button(t('DEPOSIT HELD PARTS'), () => { if (!atC) { ui.sfx('ui_error'); ui.toast(t('Stand at the Frame Console to use ship parts.'), 'bad'); } else if (!any) { ui.sfx('ui_error'); ui.toast(t('Hold ship parts to deposit them.'), 'bad'); } else sy.req('deposit'); }, 'primary' + (any && atC ? '' : ' disabled')));
    if (!atC) det.appendChild(el('div', { class: 'sy-note bad' }, t('Stand at the Frame Console to use ship parts.')));
    det.appendChild(el('div', { class: 'sy-note' }, t('Tell the crew: the ship is yours. Modules, parts and paint stay with the crew across fired runs.')));
  }

  // ------------------------------------------------------------------ hull paint
  function drawPreview(cv) {
    const g = cv.getContext('2d'), w = cv.width, h = cv.height, s = S();
    const c1 = hexCss(Y.paintHex(draft.c1 || s.paint.c1)), c2 = hexCss(Y.paintHex(draft.c2 || s.paint.c2)), pat = draft.pat || s.paint.pat;
    g.fillStyle = '#05070a'; g.fillRect(0, 0, w, h);
    const x0 = 30, x1 = w - 30, y0 = 34, y1 = h - 34;
    g.fillStyle = '#4a4d52'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = c1; g.fillRect(x0, y0 + 6, x1 - x0, 10);
    g.fillStyle = '#22262b'; g.fillRect(x0 - 14, y0 + 14, 14, y1 - y0 - 20);
    // pattern band
    const bx = x0, by = y1 - 22, bw = x1 - x0, bh = 14;
    g.fillStyle = c1; g.fillRect(bx, by, bw, bh); g.fillStyle = c2;
    if (pat === 'stripes') { for (let y = by + 2; y < by + bh; y += 6) g.fillRect(bx, y, bw, 2); }
    else if (pat === 'hazard') { for (let x = bx - bh; x < bx + bw; x += 16) { g.beginPath(); g.moveTo(x, by + bh); g.lineTo(x + 8, by + bh); g.lineTo(x + 8 + bh, by); g.lineTo(x + bh, by); g.fill(); } }
    else if (pat === 'checker') { for (let y = by, j = 0; y < by + bh; y += 7, j++) for (let x = bx, i = 0; x < bx + bw; x += 7, i++) if ((i + j) % 2 === 0) g.fillRect(x, y, 7, 7); }
    else if (pat === 'chevron') { for (let x = bx; x < bx + bw; x += bh) { g.beginPath(); g.moveTo(x, by); g.lineTo(x + bh / 2, by + bh / 2); g.lineTo(x, by + bh); g.lineTo(x + 4, by + bh); g.lineTo(x + bh / 2 + 4, by + bh / 2); g.lineTo(x + 4, by); g.fill(); } }
    else if (pat === 'dots') { for (let y = by + 4; y < by + bh; y += 7) for (let x = bx + 4 + ((y - by) % 14 ? 3 : 0); x < bx + bw; x += 8) { g.beginPath(); g.arc(x, y, 2, 0, 6.3); g.fill(); } }
    g.fillStyle = '#12151a'; g.fillRect(x0 + 40, y0 + 26, 190, 22); g.strokeStyle = c1; g.strokeRect(x0 + 40.5, y0 + 26.5, 189, 21);
    g.fillStyle = '#e8e0cc'; g.font = 'bold 16px monospace'; g.textAlign = 'center'; g.fillText((draft.name ?? s.name).toUpperCase().slice(0, Y.MAX_NAME) || Y.DEFAULT_NAME, x0 + 135, y0 + 42);
  }
  function renderHull() {
    main.innerHTML = '';
    const det = el('div', { class: 'sy-det', style: { gridColumn: '1 / -1' } });
    main.appendChild(det);
    const s = S();
    const cur = { c1: draft.c1 || s.paint.c1, c2: draft.c2 || s.paint.c2, pat: draft.pat || s.paint.pat, theme: draft.theme || s.theme, name: draft.name ?? s.name };
    const box = el('div', { class: 'sy-box' });
    box.append(el('div', { class: 'sy-name' }, t('HULL PAINT')));
    const cv = el('canvas', { class: 'sy-prev', width: 520, height: 130 });
    box.append(cv); drawPreview(cv);
    const swatches = (key, label) => {
      box.append(el('div', { class: 'sy-sub' }, t(label)));
      const sw = el('div', { class: 'sy-sw' });
      for (const p of Y.PAINTS) { const i = el('i', { class: cur[key] === p.id ? 'sel' : '', title: t(p.name), style: { background: hexCss(p.hex) } }); i.addEventListener('click', () => { draft[key] = p.id; sfx('ui_click'); renderHull(); }); sw.appendChild(i); }
      box.append(sw);
    };
    swatches('c1', 'Primary'); swatches('c2', 'Secondary');
    const btns = (key, label, list) => {
      box.append(el('div', { class: 'sy-sub' }, t(label)));
      const b = el('div', { class: 'sy-btns' });
      for (const p of list) b.appendChild(ui.button(t(p.name), () => { draft[key] = p.id; renderHull(); }, 'small' + (cur[key] === p.id ? ' primary' : '')));
      box.append(b);
    };
    btns('pat', 'Pattern', Y.PATTERNS); btns('theme', 'Interior theme', Y.THEMES);
    box.append(el('div', { class: 'sy-sub' }, t('Name plate')));
    const inp = el('input', { class: 'sy-in', type: 'text', maxlength: String(Y.MAX_NAME), value: cur.name });
    inp.addEventListener('input', () => { draft.name = inp.value; drawPreview(cv); });
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    box.append(inp);
    det.appendChild(box);
    const paintChanged = cur.c1 !== s.paint.c1 || cur.c2 !== s.paint.c2 || cur.pat !== s.paint.pat || cur.theme !== s.theme;
    const nameChanged = Y.sanitizeName(cur.name) !== s.name;
    const price = (paintChanged ? Y.PAINT_COST : 0) + (nameChanged ? Y.NAME_COST : 0);
    const can = (paintChanged || nameChanged) && cr() >= price;
    det.appendChild(el('div', { class: 'sy-note' }, tf('Paint job ▮{a}, name plate ▮{b}', { a: Y.PAINT_COST, b: Y.NAME_COST })));
    det.appendChild(ui.button(`${t('APPLY')} ▮${price}`, () => { if (can) { sy.req('paint', { c1: cur.c1, c2: cur.c2, pat: cur.pat, theme: cur.theme, name: nameChanged ? cur.name : undefined }); draft.c1 = draft.c2 = draft.pat = draft.theme = draft.name = null; } else { ui.sfx('ui_error'); ui.toast(price ? t('Not enough credits.') : t('Nothing changed.'), 'bad'); } }, 'primary' + (can ? '' : ' disabled')));
  }

  // ------------------------------------------------------------------ status
  function renderStatus() {
    main.innerHTML = '';
    const det = el('div', { class: 'sy-det', style: { gridColumn: '1 / -1' } });
    main.appendChild(det);
    const s = S(), e = sy.effects();
    const rows = [
      [t('Modules'), `${Y.count(s)} / ${SOCKET_IDS.length}`], [t('Route cost'), `x${Y.routeMul(s).toFixed(2)} (${Y.weightText(s)})`], [t('Touchdown Threat'), `+${Y.landingThreat(s)}`], [t('Siege surface'), `x${Y.siegeSurface(s).toFixed(2)}`],
    ];
    det.appendChild(el('div', { class: 'sy-box' }, el('div', { class: 'sy-name' }, t('STATUS')), ...rows.map(([a, b]) => el('div', { class: 'sy-row2' }, el('span', {}, a), el('b', {}, b)))));
    const inst = el('div', { class: 'sy-box' });
    for (const m of Y.installed(s)) {
      inst.appendChild(el('div', { class: 'sy-tier now', style: { '--tc': hexCss(Y.MODULES[m.id].color) } }, el('h4', {}, `${t(Y.MODULES[m.id].name)} · Mk ${Y.ROMAN[m.t]} · ${sy.sockName(m.socket)}`), el('ul', {}, ...sy.lines(m.id, m.t).map((l) => el('li', {}, l)))));
    }
    if (!Y.count(s)) inst.appendChild(el('div', { class: 'sy-note' }, t('Pick a module.')));
    det.appendChild(inst);
    void e;
  }

  function full() {
    setSub(); renderTabs();
    if (tab === 'modules') renderModules(); else if (tab === 'frame') renderFrame(); else if (tab === 'hull') renderHull(); else renderStatus();
  }

  // live refresh (credits / parts / state can change while open)
  const poll = setInterval(() => {
    if (!wrap.isConnected) return;
    const key = [JSON.stringify(S()), cr(), JSON.stringify(sy.held()), sy.atConsole() ? 1 : 0, tab].join('|');
    if (key === lastKey) return;
    lastKey = key;
    setSub();
    if (tab === 'modules') { renderList(); renderDetail(); } else if (tab === 'frame') renderFrame(); else if (tab === 'status') renderStatus();
    else if (tab === 'hull' && !document.activeElement?.classList?.contains('sy-in')) renderHull();
  }, 400);

  full();
  return {
    el: wrap,
    setTab(id) { tab = id; full(); },
    dispose() { clearInterval(poll); },
  };
}
