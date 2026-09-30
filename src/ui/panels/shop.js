// COMPANY STORE panel (CRT look, same frame / tab / gamepad conventions as the other in-game panels).
//   createShopPanel(ui, game, { category, from }) -> { el, onResult(d), dispose() }
// Left: category tabs (LB/RB or PageUp/PageDown) + item cards (icon, tier colour, stats, weight, price in ▮ / ◈, deal badge,
// sold-out / locked / can't-afford states). Right: DEALS, EMPLOYEE OF THE MONTH and the CART with BUY.
// Items are click / Enter (or A on a pad) to add; the price the cart shows is only a preview - the host reprices everything.
import { el, escapeHtml } from '../../core/util.js';
import { t } from '../../core/i18n.js';
import { iconHTML } from '../icons.js';
import { glyph } from '../glyphs.js';
import { tierColor, TIERS } from '../../game/tiers.js';
import { categoryList, statsOf } from '../../game/shop.js';
import { cloutOpenOf } from '../../game/wallet.js';

const CSS = `
.overlay .menu-frame.shop{width:min(1180px,96vw);height:min(88vh,720px)}
.shop > .cp-body{overflow:hidden;display:flex;flex-direction:column;padding-bottom:8px}
.shop .tabs{margin-bottom:8px;gap:0}.shop .tabs .btn{font-size:17px;padding:2px 7px;letter-spacing:0}
.shop .sh-wrap{display:grid;grid-template-columns:minmax(0,1fr) 322px;gap:14px;min-height:0;flex:1}
.shop .sh-main{min-width:0;display:flex;flex-direction:column;min-height:0}
.shop .sh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:9px;overflow:auto;padding:4px 6px 8px 2px;flex:1;min-height:0;align-content:start;scrollbar-width:thin}
.shop .sh-card{--tc:#9aa39a;position:relative;border:1px solid color-mix(in srgb,var(--tc) 55%,transparent);border-left:4px solid var(--tc);background:linear-gradient(180deg,color-mix(in srgb,var(--tc) 9%,rgba(0,0,0,.5)),rgba(0,0,0,.5));padding:7px 9px 8px;display:flex;flex-direction:column;gap:4px;cursor:pointer;transition:transform .08s,box-shadow .1s;outline:none}
.shop .sh-card:hover,.shop .sh-card:focus-visible{transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.6),0 0 16px color-mix(in srgb,var(--tc) 45%,transparent)}
.shop .sh-card.sold{filter:grayscale(.8) brightness(.6);cursor:default}
.shop .sh-card.locked{filter:saturate(.35) brightness(.75)}
.shop .sh-top{display:flex;gap:9px;align-items:center}
.shop .sh-ico{width:56px;height:56px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.14);background:radial-gradient(circle,color-mix(in srgb,var(--tc) 22%,transparent),rgba(0,0,0,.55))}
.shop .sh-img{width:52px;height:52px;image-rendering:pixelated;opacity:0;transition:opacity .2s}.shop .sh-img.ok{opacity:1}
.shop .sh-name{font-size:23px;line-height:1;color:var(--tc);text-shadow:0 0 8px color-mix(in srgb,var(--tc) 50%,transparent)}
.shop .sh-tier{font-size:16px;opacity:.75;letter-spacing:1px;text-transform:uppercase}
.shop .sh-badge{position:absolute;top:-1px;right:-1px;background:#ff3d7f;color:#fff;font-family:var(--cond);font-weight:bold;font-size:17px;padding:0 7px;letter-spacing:1px;text-shadow:none;box-shadow:0 0 12px rgba(255,61,127,.6)}
.shop .sh-badge.eom{background:#ffd23f;color:#1a1000;box-shadow:0 0 12px rgba(255,210,63,.6)}
.shop .sh-stats{display:flex;flex-wrap:wrap;gap:3px 5px}
.shop .sh-stats span{font-size:15px;border:1px solid var(--ph-line);padding:0 5px;color:var(--ph-dim);background:rgba(0,0,0,.35)}
.shop .sh-stats b{color:var(--ph-hi);font-weight:normal}
.shop .sh-desc{font-size:17px;opacity:.82;line-height:1.05;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.shop .sh-bot{display:flex;align-items:center;gap:8px;margin-top:2px}
.shop .sh-price{font-family:var(--cond);font-weight:bold;font-size:23px;color:var(--ph-hi)}
.shop .sh-price.poor{color:#ff6b5a}.shop .sh-price.clout{color:#ff7ad9}
.shop .sh-was{font-size:16px;opacity:.5;text-decoration:line-through}
.shop .sh-left{font-size:15px;color:#ffd23f;margin-left:auto}
.shop .sh-stamp{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--cond);font-weight:bold;font-size:30px;letter-spacing:4px;color:#ff6b5a;transform:rotate(-12deg);text-shadow:0 0 10px rgba(255,60,40,.6);pointer-events:none}
.shop .sh-incart{position:absolute;bottom:6px;right:8px;font-size:16px;color:#7dff7d}
.shop .sh-empty{padding:40px 10px;text-align:center;opacity:.6;font-size:24px}
.shop .sh-side{display:flex;flex-direction:column;gap:9px;min-height:0;overflow:auto;padding-right:2px;height:100%}
.shop .sh-box{border:1px solid var(--ph-line);background:rgba(0,0,0,.32);padding:6px 9px}
.shop .sh-row{display:flex;align-items:center;gap:8px;padding:3px 4px;border-bottom:1px dashed var(--ph-line);cursor:pointer;outline:none}
.shop .sh-row:last-child{border-bottom:none}.shop .sh-row:hover,.shop .sh-row:focus-visible{background:var(--ph-sel)}
.shop .sh-row .sh-ico{width:34px;height:34px}.shop .sh-row .sh-img{width:30px;height:30px}
.shop .sh-row .nm{flex:1;min-width:0;font-size:19px;line-height:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.shop .sh-row .pr{font-family:var(--cond);font-weight:bold;font-size:19px}
.shop .sh-eom{border-color:#ffd23f;box-shadow:inset 0 0 22px rgba(255,210,63,.08)}
.shop .sh-eom .q{font-size:16px;opacity:.72;font-style:italic;line-height:1.05;margin-top:2px}
.shop .sh-cart{position:sticky;bottom:0;background:#0d0804;z-index:2;box-shadow:0 -8px 10px rgba(0,0,0,.6)}
.shop .sh-cart .ln{display:flex;align-items:center;gap:5px;font-size:19px;padding:2px 0}
.shop .sh-cart .ln .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.shop .sh-cart .btn.small{padding:0 8px;min-width:26px}
.shop .sh-total{display:flex;justify-content:space-between;font-family:var(--cond);font-weight:bold;font-size:25px;margin:6px 0 4px;color:var(--ph-hi)}
.shop .sh-total.poor{color:#ff6b5a}
.shop .sh-note{font-size:15px;opacity:.6;line-height:1.05;margin-top:4px}
.shop .cp-sub b{color:var(--ph-hi);font-weight:normal}
@media (max-width:900px){.shop .sh-wrap{grid-template-columns:1fr}.shop .sh-side{height:auto}}
`;
let cssDone = false;
function ensureCss() {
  if (cssDone && document.getElementById('tfg-shop-css')) return;
  const s = document.createElement('style'); s.id = 'tfg-shop-css'; s.textContent = CSS; document.head.appendChild(s); cssDone = true;
}
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const money = (e, v = e.price) => `▮${fmt(v)}`;   // [followers] one money: credits; milestone stock only unlocks at a follower count

export function createShopPanel(ui, game, opts = {}) {
  ensureCss();
  const g = game, shop = g.shop;
  let cat = opts.category && categoryList().some((c) => c.id === String(opts.category).toLowerCase()) ? String(opts.category).toLowerCase() : (ui.shopTab || 'weapons');
  const cart = new Map();   // id -> { n, trade }
  const cloutOpen = () => cloutOpenOf(g);   // [trim] Clout is a wallet only after the store's quota-1 unlock: credits are the only money of the first hour
  const vis = (l) => (cloutOpen() ? l : l.filter((e) => !e.followersAt));
  let stock = vis(shop.stock());
  const byId = (id) => stock.find((e) => e.id === id);
  const wrap = ui.panel('wide shop');
  const head = ui.panelHead(t(game.industry13 ? 'FIELD BROKER / WORKSHOP' : 'COMPANY STORE'), ' ');
  const sub = head.querySelector('.cp-sub');
  const body = el('div', { class: 'cp-body' });
  const tabsEl = el('div', { class: 'tabs' });
  const gridEl = el('div', { class: 'sh-grid' });
  const sideEl = el('div', { class: 'sh-side' });
  const main = el('div', { class: 'sh-main' }, tabsEl, gridEl);
  body.appendChild(el('div', { class: 'sh-wrap' }, main, sideEl));
  wrap.append(head, body, ui.panelFoot([['LB/RB', t('TAB')], ['E', t('ADD')]]));

  const balance = () => `<b>▮${fmt(g.run?.credits || 0)}</b>${cloutOpen() ? ` · <span style="color:#ff7ad9">◈${fmt(g.profile?.coins || 0)} ${escapeHtml(t('followers'))}</span>` : ''}`;
  const cartTotal = () => { let s = 0; for (const [id, l] of cart) { const e = byId(id); if (e && e.currency === 'credits') s += (l.trade && e.def?.upgradePrice ? e.def.upgradePrice : e.price) * l.n; } return s; };
  const hasBat = (e) => !!e.def?.upgradeFrom && [...g.items.all()].some((it) => it.holder === g.selfId && it.type === e.def.upgradeFrom && !it.affix);

  // ---------------------------------------------------------------- cards
  function card(e, compact = false) {
    const tc = tierColor(e.tier);
    const poor = (g.run?.credits || 0) < e.price;
    const can = !e.soldOut && !e.locked;
    const inCart = cart.get(e.id)?.n || 0;
    const node = el('div', { class: 'sh-card' + (e.soldOut ? ' sold' : '') + (e.locked ? ' locked' : ''), style: { '--tc': tc }, tabindex: can ? '0' : '-1', 'data-id': e.id, title: e.locked ? e.lockReason : '' });
    const iconId = e.def ? e.id : null;
    node.appendChild(el('div', { class: 'sh-top' },
      el('div', { class: 'sh-ico', html: iconId ? iconHTML(iconId, 'sh-img') : `<span style="font-size:30px;display:inline-flex">${glyph(e.van ? 'van' : 'gear')}</span>` }),
      el('div', {}, el('div', { class: 'sh-name' }, e.name), el('div', { class: 'sh-tier' }, `${TIERS[e.tier]?.name || e.tier}${e.def?.weight ? ' · ' + e.def.weight + ' lb' : ''}`))));
    if (e.dealKind) node.appendChild(el('div', { class: 'sh-badge' + (e.dealKind === 'eom' ? ' eom' : '') }, `-${Math.round(e.off * 100)}%`));
    const stats = statsOf(e.def);
    if (stats.length && !compact) node.appendChild(el('div', { class: 'sh-stats', html: stats.map(([k, v]) => `<span>${k}${v !== '' ? ' <b>' + v + '</b>' : ''}</span>`).join('') }));
    node.appendChild(el('div', { class: 'sh-desc' }, t(e.def?.blurb || e.def?.tip || e.desc || '')));
    const bot = el('div', { class: 'sh-bot' }, el('span', { class: 'sh-price' + (poor ? ' poor' : '') + '' }, money(e)), e.off ? el('span', { class: 'sh-was' }, money(e, e.base)) : null,
      e.left != null && e.left > 0 && e.left <= 3 ? el('span', { class: 'sh-left' }, `${e.left} ${t('left')}`) : null);
    node.appendChild(bot);
    if (e.followersAt && e.locked) node.appendChild(el('div', { class: 'sh-desc', style: { color: '#ff7ad9' } }, `◈ ${e.lockReason}`));   // [followers] milestone
    if (e.soldOut) node.appendChild(el('div', { class: 'sh-stamp' }, e.owned ? t('INSTALLED') : t('SOLD OUT')));
    if (inCart) node.appendChild(el('div', { class: 'sh-incart' }, `x${inCart}`));
    if (can) {
      node.addEventListener('click', (ev) => { ev.stopPropagation(); add(e); });
      if (hasBat(e)) bot.appendChild(ui.button(`${t('UPGRADE')} ▮${e.def.upgradePrice}`, () => add(e, true), 'small'));
    }
    return node;
  }

  // ---------------------------------------------------------------- actions
  function add(e, trade = false) {
    ui.sfx('ui_click', 0.5);
    if (e.locked) return;
    const cur = cart.get(e.id);
    const max = e.ship || trade ? 1 : e.left != null ? e.left : 10;
    if (cur) { cur.n = Math.min(max, cur.n + 1); if (trade) cur.trade = true; } else cart.set(e.id, { n: 1, trade });
    renderSide(); refreshBadges();
  }
  function refreshBadges() {
    for (const c of gridEl.querySelectorAll('.sh-card')) {
      const n = cart.get(c.dataset.id)?.n || 0;
      let b = c.querySelector('.sh-incart');
      if (n && !b) { b = el('div', { class: 'sh-incart' }); c.appendChild(b); }
      if (b) { if (n) b.textContent = `x${n}`; else b.remove(); }
    }
  }
  function buyNow() {
    const lines = [...cart].map(([id, l]) => ({ id, n: l.n, trade: !!l.trade }));
    if (!lines.length) return;
    if (cartTotal() > (g.run?.credits || 0)) { ui.sfx('ui_error'); return; }
    shop.buy(lines);
  }

  // ---------------------------------------------------------------- rendering
  function renderTabs() {
    tabsEl.innerHTML = '';
    for (const c of categoryList()) {
      tabsEl.appendChild(ui.button(t(c.name), () => { cat = c.id; ui.shopTab = c.id; renderTabs(); renderGrid(); ui.flick(wrap); }, cat === c.id ? 'tab sel' : 'tab'));
    }
  }
  function renderGrid() {
    gridEl.innerHTML = '';
    const list = stock.filter((e) => e.cat === cat);
    if (!list.length) gridEl.appendChild(el('div', { class: 'sh-empty' }, t('OUT OF STOCK - supplier delayed')));
    for (const e of list) gridEl.appendChild(card(e));
    if (ui.padActive) ui.focusFirst(gridEl, '.sh-card[tabindex="0"]');
  }
  function miniRow(e) {
    const r = el('div', { class: 'sh-row', tabindex: e.soldOut ? '-1' : '0' });
    r.style.setProperty('--tc', tierColor(e.tier));
    r.append(el('div', { class: 'sh-ico', html: iconHTML(e.id, 'sh-img') }), el('div', { class: 'nm', style: { color: tierColor(e.tier) } }, e.name),
      el('div', { class: 'pr' }, money(e), ' ', el('span', { class: 'sh-was' }, money(e, e.base))));
    if (!e.soldOut) r.addEventListener('click', () => { cat = e.cat; ui.shopTab = cat; renderTabs(); renderGrid(); add(e); });
    return r;
  }
  function renderSide() {
    const keepScroll = sideEl.scrollTop;
    sideEl.innerHTML = '';
    const deals = stock.filter((e) => e.dealKind === 'deal'), eom = stock.find((e) => e.dealKind === 'eom');
    sideEl.appendChild(el('div', { class: 'sh-box' }, el('div', { class: 'cp-sec' }, t("TODAY'S DEALS")), ...(deals.length ? deals.map(miniRow) : [el('div', { class: 'dim' }, '-')])));
    if (eom) {
      const b = el('div', { class: 'sh-box sh-eom' }, el('div', { class: 'cp-sec' }, '★ ' + t('EMPLOYEE OF THE MONTH')), miniRow(eom), el('div', { class: 'q' }, `"${eom.eomQuote}"`));
      sideEl.appendChild(b);
    }
    const total = cartTotal(), poor = total > (g.run?.credits || 0);
    const cartBox = el('div', { class: 'sh-box sh-cart' }, el('div', { class: 'cp-sec' }, t('CART')));
    if (!cart.size) cartBox.appendChild(el('div', { class: 'dim' }, t('Your cart is empty.')));
    for (const [id, l] of cart) {
      const e = byId(id);
      if (!e) { cart.delete(id); continue; }
      const unit = l.trade && e.def?.upgradePrice ? e.def.upgradePrice : e.price;
      const max = e.ship || l.trade ? 1 : e.left != null ? e.left : 10;
      cartBox.appendChild(el('div', { class: 'ln' },
        el('span', { class: 'nm', style: { color: tierColor(e.tier) } }, `${l.n > 1 ? l.n + 'x ' : ''}${e.name}${l.trade ? ' (' + t('UPGRADE') + ')' : ''}`),
        el('span', {}, `▮${fmt(unit * l.n)}`),
        ui.button('-', () => { l.n -= 1; if (l.n <= 0) cart.delete(id); renderSide(); refreshBadges(); }, 'small'),
        ui.button('+', () => { l.n = Math.min(max, l.n + 1); renderSide(); refreshBadges(); }, 'small')));
    }
    cartBox.appendChild(el('div', { class: 'sh-total' + (poor ? ' poor' : '') }, el('span', {}, poor ? t('NOT ENOUGH') : t('TOTAL')), el('span', {}, `▮${fmt(total)}`)));
    cartBox.appendChild(el('div', { class: 'menu-row', style: { display: 'flex', gap: '8px' } },
      ui.button(t('BUY'), buyNow, 'primary' + (!cart.size || poor ? ' disabled' : '')),
      ui.button(t('CLEAR'), () => { cart.clear(); renderSide(); refreshBadges(); }, 'small' + (cart.size ? '' : ' disabled'))));
    cartBox.appendChild(el('div', { class: 'sh-note' }, t(game.industry13 ? 'Collect your order beside the field broker.' : 'Deliveries arrive in the ship storage.')));
    sideEl.appendChild(cartBox);
    sideEl.appendChild(ui.backButton(() => ui.closePanel(), t('Close')));
    sideEl.scrollTop = keepScroll;
  }
  function renderHead() { sub.innerHTML = balance(); }
  const full = () => { stock = vis(shop.stock()); renderHead(); renderTabs(); renderGrid(); renderSide(); };

  // live balance / stock (a crewmate may buy the last one while the panel is open)
  let lastKey = '';
  const poll = setInterval(() => {
    if (!wrap.isConnected) return;
    const key = (g.run?.credits || 0) + '|' + (g.profile?.coins || 0) + '|' + JSON.stringify(g.run?.shop || null) + '|' + (g.run?.day || 0);
    if (key === lastKey) return;
    lastKey = key;
    const focusId = document.activeElement?.dataset?.id;
    stock = vis(shop.stock()); renderHead(); renderGrid(); renderSide();
    if (focusId) gridEl.querySelector(`.sh-card[data-id="${focusId}"]`)?.focus({ preventScroll: true });
  }, 600);

  full();
  return {
    el: wrap,
    onResult(d) { if (d.ok) cart.clear(); stock = vis(shop.stock()); renderHead(); renderGrid(); renderSide(); },
    dispose() { clearInterval(poll); },
  };
}
