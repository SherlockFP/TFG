// ALIEN DINER management panel (wave 8, module 'resto'): one compact panel, 4 tabs: STATUS (stars, till, contract, pantry), BUILD (piece list; buying happens on the floor pads),
// MENU (dishes, needs, stock), GUESTS (species tastes). Hard-edged company look on the shared theme base classes (tfg-card / tfg-bar / tfg-tag / tfg-kbd), no emoji.
//   createRestoPanel(ui, game, api) -> { el, refresh(), dispose() }   (api = the module api: state(), core, req(), snap)
import { el, escapeHtml } from '../../core/util.js';
import { t, tf } from '../../core/i18n.js';
import { itemDef } from '../../game/items.js';

const CSS = `
.overlay .menu-frame.rsp{width:min(980px,96vw);height:min(80vh,660px)}
.rsp > .cp-body{overflow:hidden;display:flex;flex-direction:column;padding-bottom:8px}
.rsp .rs-main{overflow:auto;flex:1;min-height:0;padding-right:4px;scrollbar-width:thin}
.rsp .rs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:6px;margin-bottom:8px}
.rsp .tfg-card b{font-weight:normal;font-size:21px}.rsp .sub{font-size:16px;opacity:.75;line-height:1.1}
.rsp .row{display:flex;justify-content:space-between;gap:8px;font-size:18px;align-items:center}
.rsp .ok{color:#7dff7d}.rsp .bad{color:#ff6b5a}.rsp .warn{color:#ffd23f}.rsp .dim{opacity:.55}
.rsp .tfg-bar{margin:4px 0}
.rsp .rs-pan{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.rsp .rs-pan .tfg-tag{font-size:15px}
`;
let cssDone = false;
function ensureCss() { if (cssDone && document.getElementById('tfg-rsp-css')) return; const s = document.createElement('style'); s.id = 'tfg-rsp-css'; s.textContent = CSS; document.head.appendChild(s); cssDone = true; }
const CAT = { leaf: 'Leaf', mushroom: 'Mushroom', root: 'Root', berry: 'Berry', moss: 'Moss', fruit: 'Fruit', meat: 'Meat', fish: 'Fish', moon: 'Moonpetal', spice: 'Spice', rare: 'Void Truffle' };
const f0 = (n) => Math.floor(n + 1e-9).toLocaleString('en-US');

export function createRestoPanel(ui, game, api) {
  ensureCss();
  const C = api.core;
  let tab = 'status', sig = '';
  const wrap = ui.panel('wide rsp');
  const head = ui.panelHead(t('ALIEN DINER'), ' ');
  const sub = head.querySelector('.cp-sub');
  const body = el('div', { class: 'cp-body' });
  const tabsEl = el('div', { class: 'tabs' }), mainEl = el('div', { class: 'rs-main' });
  body.append(tabsEl, mainEl);
  wrap.append(head, body, ui.panelFoot([['ESC', t('CLOSE')]]));
  const S = () => api.state();
  const bar = (v, extra = '') => `<div class="tfg-bar ${extra}"><i style="width:${Math.max(0, Math.min(100, v * 100))}%"></i></div>`;
  const catText = (need) => { const m = {}; for (const c of need) m[c] = (m[c] || 0) + 1; return Object.entries(m).map(([c, n]) => `${n > 1 ? n + 'x ' : ''}${t(CAT[c] || c)}`).join(' + '); };

  function renderTabs() {
    tabsEl.innerHTML = '';
    for (const [id, label] of [['status', 'STATUS'], ['build', 'BUILD'], ['menu', 'MENU'], ['guests', 'GUESTS']]) tabsEl.appendChild(ui.button(t(label), () => { tab = id; sig = ''; render(); }, tab === id ? 'tab sel' : 'tab'));
  }
  function status(s) {
    const st = C.starsOf(s), nx = C.nextStarRep(s), cap = C.starCap(s), rep = Math.floor(s.rep);
    const prev = C.STAR_REP[st - 1], span = nx == null ? 1 : nx - prev, into = nx == null ? 1 : Math.min(span, s.rep - prev) / span;
    const clean = api.snap.cl ?? 100, gross = s.gross.day === (game.run?.day || 0) ? s.gross.n : 0, dcap = C.dayCap(s);
    let h = `<div class="rs-grid"><div class="tfg-card"><div class="row"><b>${escapeHtml(tf('{n} of 5 stars', { n: st }))}</b><span class="tfg-tag">${escapeHtml(t('star cap'))} ${cap}</span></div>${bar(into)}
      <div class="sub">${nx == null ? escapeHtml(t('Top rating.')) : escapeHtml(tf('{a} / {b} reputation to the next star', { a: rep, b: nx }))}${st >= cap && st < 5 ? ' - ' + escapeHtml(t('build the next Decor tier to raise the cap')) : ''}</div></div>
      <div class="tfg-card"><div class="row"><b>${escapeHtml(t('Till'))}</b><span class="${s.till >= 1 ? 'ok' : 'dim'}">${f0(s.till)} / ${f0(C.tillCap(s))}</span></div>
      <div class="sub">${escapeHtml(tf('Passive income: {n} credits per game day (capped). Collect at the register.', { n: C.passivePerDay(s) }))}</div></div>
      <div class="tfg-card"><div class="row"><b>${escapeHtml(t('Today'))}</b><span>${f0(gross)} / ${f0(dcap)}</span></div>${bar(gross / dcap)}
      <div class="sub">${escapeHtml(t('Active takings per game day are capped: past the cap guests pay a quarter. Fly a run to reset it - and to restock.'))}</div></div>
      <div class="tfg-card"><div class="row"><b>${escapeHtml(t('Kitchen'))}</b><span class="${clean >= 70 ? 'ok' : clean >= 40 ? 'warn' : 'bad'}">${escapeHtml(t('clean'))} ${clean}%</span></div>${bar(clean / 100)}
      <div class="sub">${escapeHtml(t('Dirty tables draw pests and the Health Inspector fines a filthy diner.'))}</div></div></div>`;
    h += `<div class="rs-grid"><div class="tfg-card"><div class="row"><b>${escapeHtml(t('Service'))}</b><span class="${s.open ? 'ok' : 'bad'}">${escapeHtml(s.open ? t('OPEN') : t('CLOSED'))}</span></div>
      <div class="sub">${escapeHtml(C.canOpen(s) ? t('Shuttles bring guests while you are on the homeworld.') : t('Needs a floor, register, stove and a table.'))}</div><div data-slot="open"></div></div>`;
    const c = s.ct;
    h += `<div class="tfg-card"><div class="row"><b>${escapeHtml(t('Algorithm Food Festival'))}</b><span class="tfg-tag">${escapeHtml(tf('done {n}x', { n: s.ctDone }))}</span></div>`;
    if (!c) h += `<div class="sub">${escapeHtml(st >= 3 ? t('No contract right now. The Algorithm offers one roughly every week of game days.') : t('Reach 3 stars: the Algorithm will offer a weekly festival contract.'))}</div>`;
    else h += `<div class="sub">${escapeHtml(tf('Serve {n} cooked or better dishes by day {d}. Reward {r} credits and Clout for everyone.', { n: c.need, d: c.by, r: c.reward }))}</div>${c.on ? bar(c.got / c.need) + `<div class="sub ok">${c.got} / ${c.need}</div>` : '<div data-slot="ct"></div>'}`;
    h += `</div></div>`;
    const pan = Object.entries(s.pantry).sort((a, b) => b[1] - a[1]);
    h += `<div class="tfg-card"><div class="row"><b>${escapeHtml(t('Fridge'))}</b><span>${C.pantryTotal(s.pantry)} / ${C.MAX_PANTRY}</span></div>`;
    h += pan.length ? `<div class="rs-pan">${pan.map(([k, n]) => `<span class="tfg-tag">${escapeHtml(t(itemDef(k).name))} x${n}</span>`).join('')}</div>` : `<div class="sub">${escapeHtml(t('Empty. Bring produce, meat and fish from the moons and stock it at the fridge. Moonpetal, Ember Pepper, Glow Spores and Void Truffle only grow out there.'))}</div>`;
    h += `</div><div class="sub" style="margin-top:6px">${escapeHtml(tf('Served {a} - angry {b} - earned {c} credits - critic raves {d}', { a: f0(s.st.served), b: f0(s.st.angry), c: f0(s.st.earned), d: f0(s.st.raves) }))}</div>`;
    return h;
  }
  function build(s) {
    const st = C.starsOf(s);
    let h = `<div class="sub">${escapeHtml(t('Walk onto a glowing pad in the diner and hold still to buy that piece. Pieces unlock in a chain; more stars unlock more.'))}</div><div class="rs-grid">`;
    for (const p of C.PIECES) {
      const has = C.has(s, p.id), needsPrev = p.req && !C.has(s, p.req), needsStar = st < p.star;
      const state = has ? `<span class="ok">${escapeHtml(t('BUILT'))}</span>` : needsPrev ? `<span class="dim">${escapeHtml(tf('needs {n}', { n: t(C.PIECE[p.req].name) }))}</span>` : needsStar ? `<span class="warn">${escapeHtml(tf('needs {n} stars', { n: p.star }))}</span>` : `<span class="${(game.run?.credits || 0) >= p.cost ? 'ok' : 'bad'}">${escapeHtml(t('ON PAD'))} - ${f0(p.cost)}</span>`;
      h += `<div class="tfg-card${has ? '' : ''}"><div class="row"><b>${escapeHtml(t(p.name))}</b>${state}</div><div class="sub">${escapeHtml(t(p.desc))}</div>${has ? '' : `<div class="sub">${escapeHtml(t('Cost'))} ${f0(p.cost)}</div>`}</div>`;
    }
    return h + '</div>';
  }
  function menu(s) {
    const st = C.starsOf(s);
    let h = `<div class="sub">${escapeHtml(t('Every dish needs ingredient categories. Any item of the category works: farmed, foraged or fished.'))}</div><div class="rs-grid">`;
    for (const d of C.DISHES) {
      const locked = d.star > st, ok = !locked && C.canCook(s.pantry, d.id, api.ING);
      h += `<div class="tfg-card${locked ? ' dim' : ''}"><div class="row"><b>${escapeHtml(t(d.name))}</b><span>${f0(d.price)}</span></div><div class="sub">${escapeHtml(catText(d.need))}</div>
        <div class="row"><span class="sub">${escapeHtml(d.tags.map((x) => t(x)).join(' / '))}</span>${locked ? `<span class="warn">${d.star}*</span>` : `<span class="${ok ? 'ok' : 'bad'}">${escapeHtml(ok ? t('IN STOCK') : t('MISSING'))}</span>`}</div></div>`;
    }
    return h + '</div>';
  }
  function guests(s) {
    const st = C.starsOf(s), menuIds = C.menuFor(st);
    let h = `<div class="sub">${escapeHtml(t('Guests only fly in when the unlocked menu has something they eat. Unhappy guests leave and cost reputation.'))}</div><div class="rs-grid">`;
    for (const sp of Object.values(C.SPECIES)) {
      const on = sp.id === 'inspector' || sp.id === 'critic' ? sp.id === 'critic' ? C.has(s, 'booth') && st >= 3 : C.has(s, 'floor') : C.speciesAvailable(sp.id, st, s.b, menuIds);
      h += `<div class="tfg-card${on ? '' : ' dim'}"><div class="row"><b>${escapeHtml(t(sp.name))}</b><span class="${on ? 'ok' : 'warn'}">${escapeHtml(on ? t('VISITS') : sp.star > st ? `${sp.star}*` : t('LOCKED'))}</span></div><div class="sub">${escapeHtml(t(sp.taste))}</div><div class="sub">${escapeHtml(t(sp.pay === 'scrap' ? 'Pays: rare scrap' : sp.pay === 'clout' ? 'Pays: credits + Clout tip' : 'Pays: credits'))}</div></div>`;
    }
    return h + '</div>';
  }
  function render() {
    const s = S(); renderTabs();
    sub.innerHTML = `<b>${escapeHtml(tf('{n} stars', { n: C.starsOf(s) }))}</b> - ${escapeHtml(f0(game.run?.credits || 0))} ${escapeHtml(t('credits'))}`;
    mainEl.innerHTML = tab === 'status' ? status(s) : tab === 'build' ? build(s) : tab === 'menu' ? menu(s) : guests(s);
    const os = mainEl.querySelector('[data-slot="open"]'); if (os) os.appendChild(ui.button(s.open ? t('CLOSE THE DINER') : t('OPEN THE DINER'), () => api.req('open', { on: !s.open }), 'btn'));
    const cs = mainEl.querySelector('[data-slot="ct"]'); if (cs) cs.appendChild(ui.button(t('ACCEPT CONTRACT'), () => api.req('ct', { on: true }), 'btn'));
  }
  function refresh() {
    const s = S(), k = `${tab}|${JSON.stringify(s)}|${game.run?.credits}|${api.snap.cl}`;
    if (k === sig) return; sig = k;
    const sc = mainEl.scrollTop; render(); mainEl.scrollTop = sc;
  }
  render();
  return { el: wrap, refresh, dispose() { wrap.remove(); } };
}
