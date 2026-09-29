// CANTINA BARTER panel (polish4): a small rotating stock per neutral cantina alien. Plain rows in the amber CRT look of the other panels
// (prefix p4b-). All rules run on the host (game.polish4.hostBarter); this only renders offers and sends requests.
import { ITEMS } from '../../game/items.js';
import { iconImg } from '../icons.js';
import { t, tf } from '../../core/i18n.js';

const CSS = `
.p4b{width:min(620px,94vw);max-height:min(560px,88vh);display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(14,9,4,.97),rgba(6,4,2,.97));border:1px solid var(--amber-dim,#a8531f);
box-shadow:0 0 50px rgba(0,0,0,.85),inset 0 0 70px rgba(255,120,40,.06);padding:12px 18px;font-family:var(--font,'VT323',monospace);color:#ffdcb8}
.p4b-head{display:flex;align-items:baseline;gap:14px;margin-bottom:6px}.p4b-title{font-family:var(--font2,monospace);font-size:18px;color:var(--amber,#ff8a3d);letter-spacing:3px}
.p4b-sp{flex:1}.p4b-pill{border:1px solid rgba(255,138,61,.4);padding:0 9px;font-size:19px;background:rgba(0,0,0,.3)}
.p4b-sub{font-size:17px;opacity:.75;margin-bottom:8px;line-height:1.1}
.p4b-list{display:flex;flex-direction:column;gap:6px;overflow:auto;min-height:0}
.p4b-row{display:flex;align-items:center;gap:10px;padding:5px 8px;border:1px solid rgba(255,138,61,.2);background:rgba(0,0,0,.3)}
.p4b-ic{width:44px;height:44px;flex:none;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,138,61,.25);background:rgba(0,0,0,.35)}
.p4b-ic img{width:40px;height:40px;image-rendering:pixelated}
.p4b-nm{flex:1;min-width:0}.p4b-name{font-size:23px;color:#fff0dc;line-height:1.05}.p4b-cost{font-size:17px;opacity:.85;line-height:1.1}.p4b-cost.no{color:#ff6b5a;opacity:1}
.p4b-btn{font-family:inherit;font-size:22px;color:#1a0d04;background:var(--amber,#ff8a3d);border:1px solid var(--amber,#ff8a3d);padding:2px 18px;cursor:pointer;letter-spacing:2px;flex:none}
.p4b-btn:hover{background:#ffb060}.p4b-btn.dis{opacity:.3;pointer-events:none;filter:grayscale(.7)}
.p4b-foot{display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:16px;opacity:.85}
.p4b-x{font-family:inherit;font-size:18px;color:var(--amber,#ff8a3d);background:rgba(255,138,61,.08);border:1px solid rgba(255,138,61,.4);padding:1px 14px;cursor:pointer}
`;
let styled = false;
function ensureStyle() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const s = document.createElement('style'); s.id = 'tfg-p4-barter-style'; s.textContent = CSS; document.head.appendChild(s);
}
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; };

/**
 * ctl = { offers(): [{i,kind,item,qty,price,min,left,rare}], credits(): n, scrap(min): item|null, buy(offer, itemId?), close() }
 * returns { el, refresh(), dispose() }
 */
export function createBarterPanel(ctl) {
  ensureStyle();
  const el = mk('div', 'p4b');
  function render() {
    el.innerHTML = '';
    const head = mk('div', 'p4b-head');
    head.append(mk('div', 'p4b-title', t('CANTINA BARTER')), mk('div', 'p4b-sp'), mk('div', 'p4b-pill', `▮ ${ctl.credits()}`));
    el.append(head, mk('div', 'p4b-sub', t('The stock changes every day. Swaps take the cheapest scrap you carry that is worth enough.')));
    const list = mk('div', 'p4b-list');
    const offers = ctl.offers();
    if (!offers.length) list.appendChild(mk('div', 'p4b-sub', t('Nothing on offer today.')));
    for (const o of offers) {
      const row = mk('div', 'p4b-row');
      const ic = mk('div', 'p4b-ic'); try { ic.appendChild(iconImg(o.item)); } catch { ic.textContent = '?'; }
      const nm = mk('div', 'p4b-nm');
      nm.appendChild(mk('div', 'p4b-name', t(ITEMS[o.item]?.name || o.item) + (o.rare ? ' *' : '')));
      let can = o.left > 0, cost;
      if (o.kind === 'buy') {
        const ok = ctl.credits() >= o.price;
        can = can && ok;
        cost = mk('div', 'p4b-cost' + (ok ? '' : ' no'), `▮ ${o.price}`);
      } else {
        const give = ctl.scrap(o.min);
        can = can && !!give;
        cost = mk('div', 'p4b-cost' + (give ? '' : ' no'), give ? tf('Give: {n} (▮{v})', { n: t(give.def?.name || give.type), v: Math.round(give.value || 0) }) : tf('Needs scrap worth ▮{v}+', { v: o.min }));
      }
      nm.appendChild(cost);
      const b = mk('button', 'p4b-btn' + (can ? '' : ' dis'), o.left > 0 ? (o.kind === 'buy' ? t('BUY') : t('SWAP')) : t('SOLD OUT'));
      b.onclick = () => { if (can) ctl.buy(o, o.kind === 'swap' ? ctl.scrap(o.min)?.id : null); };
      row.append(ic, nm, b);
      list.appendChild(row);
    }
    el.appendChild(list);
    const foot = mk('div', 'p4b-foot');
    const x = mk('button', 'p4b-x', t('Close')); x.onclick = () => ctl.close();
    foot.append(mk('span', '', t('Do not hit the patrons.')), x);
    el.appendChild(foot);
  }
  render();
  return { el, refresh: render, dispose() { el.remove(); } };
}
