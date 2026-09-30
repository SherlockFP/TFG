// WARDROBE panel (CRT style): suits / hats / face / back accessories with a live rotating 3D preview.
// Opened from the ship mirror + suit rack (E), the WARDROBE button on the character sheet, or game.cosmetics.open().
// Works in-game (game given: equips via game.cosmetics, syncs to the crew) and from the main menu (game null: edits
// the saved profile only). Clicking a tile TRIES it on in the preview; EQUIP / BUY act on the selection.
import { curateWardrobe } from '../../game/wardrobe13_core.js';
import '../../game/wardrobe13_data.js';
import { el } from '../../core/util.js';
import { t, tf } from '../../core/i18n.js';
import { unlockAt, claimable } from '../../game/wallet.js';
import { glyphEl } from '../glyphs.js';
import { saveProfile } from '../../core/save.js';
import { getCharPreview } from '../charpreview.js';
import { tierColor, tierDef } from '../../game/tiers.js';
import {
  SLOTS, ensureWardrobeProfile, owns, grant, entry, entriesFor, colourSuits, progressOf, PRICES,
} from '../../game/cosmetics.js';
import { FACE_ACCS, BACK_ACCS } from '../../models/cosmetics.js';

const STYLE_ID = 'tfg-wardrobe-style';
const CSS = `
.wd{width:min(1040px,95vw);max-height:92vh}
.wd .cp-body{display:flex;gap:18px;overflow:hidden;padding:12px 18px 14px}
.wd-left{width:330px;flex-shrink:0;display:flex;flex-direction:column;gap:8px;min-height:0;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin}
.wd .char-preview{max-width:204px;margin:0 auto 4px}
.wd-right{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0}
.wd-name{font-family:var(--cond);font-weight:bold;font-size:28px;letter-spacing:1px;line-height:1.05}
.wd-tier{font-size:18px;letter-spacing:2px;text-transform:uppercase;opacity:.95}
.wd-desc{font-size:19px;opacity:.9;line-height:1.15}
.wd-how{font-size:18px;color:#ffd27a}
.wd-how.ok{color:#8dff9a}
.wd-bar{height:7px;background:rgba(255,255,255,.08);border:1px solid var(--ph-line);margin-top:3px}
.wd-bar>i{display:block;height:100%;background:linear-gradient(90deg,#ff8a3d,#ffd23f)}
.wd-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px}
.wd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;overflow:auto;padding:4px 4px 4px 0;min-height:0;flex:1;align-content:start}
.wd-tile{position:relative;border:1px solid var(--ph-line);background:rgba(0,0,0,.35);padding:6px 8px 6px 10px;cursor:pointer;user-select:none;min-height:58px;border-left:4px solid var(--tc,#888)}
.wd-tile:hover{background:rgba(255,138,61,.13)}
.wd-tile:focus-visible{outline:2px solid var(--ph-hi);outline-offset:2px}
.wd-tile.sel{background:rgba(255,138,61,.14);box-shadow:inset 0 0 0 1px var(--tc,#ff8a3d)}
.wd-tile.locked{opacity:.55}
.wd-tile .n{font-family:var(--cond);font-weight:bold;font-size:20px;color:var(--tc,#ddd);line-height:1.05;padding-right:20px}
.wd-tile .s{font-size:16px;opacity:.85;margin-top:2px}
.wd-tile .sw{position:absolute;right:6px;top:6px;width:16px;height:16px;border:1px solid rgba(255,255,255,.4)}
.wd-tile .ck{position:absolute;right:6px;bottom:4px;font-size:18px;color:#8dff9a}
.wd-tabs{display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap}
.wd-note{font-size:16px;opacity:.7;margin-top:6px}
@media (max-width:820px){.wd .cp-body{flex-direction:column;overflow:auto}.wd-left{width:auto}}
`;
const injectStyle = () => {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
};

export const TABS = [['suit', 'Suits'], ['hat', 'Hats'], ['face', 'Face'], ['back', 'Back']];
/** [cosm5] extra tabs: id -> { label, list(profile), owned(profile,e), equipped(profile,e), equip(ctx,e), buy?(ctx,e), price?(e), progress?(profile,e), select?(ctx,e), preview?(ctx,e), extra?(ctx) -> Element, note?(), equipLabel?() }; plus an optional WARDROBE_EXT.__leave(ctx) run on the classic tabs */
export const WARDROBE_EXT = {};
const NONE = { face: { id: 'none', name: 'No accessory', tier: 'common', desc: 'Bare visor.', how: '' }, back: { id: 'none', name: 'No accessory', tier: 'common', desc: 'Standard tank.', how: '' }, hat: { id: 'none', name: 'No hat', tier: 'common', desc: 'Nothing on your helmet.', how: '' } };

/** All wardrobe entries of a slot in display order (owned first is NOT applied: keep a stable grid) */
function listFor(slot) {
  if (slot === 'suit') {
    const outfits = entriesFor('suit');
    return [...colourSuits(), ...outfits];
  }
  const none = { slot, key: slot + ':none', ...NONE[slot] };
  if (slot === 'hat') return [none, ...entriesFor('hat')];
  return [none, ...entriesFor(slot)];
}

export function openWardrobe({ game = null, profile, ui, from = null } = {}) {
  ui = ui || game?.ui || window.kefal?.ui;
  profile = profile || game?.profile || window.kefal?.profile;
  if (!ui || !profile) return null;
  injectStyle();
  ensureWardrobeProfile(profile);
  const pv = getCharPreview();
  const cos = game?.cosmetics;
  let tab = 'suit';
  let filter = 'ready';
  const tryOn = { suit: profile.suit, hat: profile.hat || 'none', face: profile.face || 'none', back: profile.back || 'none' };
  const tryProfile = Object.create(profile);       // reads fall through to the real profile (name, title, ...)
  const applyTry = () => { Object.assign(tryProfile, { suit: tryOn.suit, hat: tryOn.hat, face: tryOn.face, back: tryOn.back }); pv.follow(tryProfile); };
  let sel = null;        // { slot, id }

  const equippedId = (slot) => profile[slot] || 'none';
  const isOwned = (slot, id) => owns(profile, slot, id);
  const doEquip = (slot, id) => {
    if (cos) return cos.equip(slot, id);
    if (!owns(profile, slot, id)) return false;
    profile[slot] = id; saveProfile(profile); return true;
  };
  const doBuy = (e) => {
    if (cos) return cos.buy(e.key);
    if (!e.price || owns(profile, e.slot, e.id)) return { ok: false };
    if (profile.level < (e.minLevel || 1)) return { ok: false, why: `Requires level ${e.minLevel}` };
    if (!claimable(profile.coins, e.price)) return { ok: false, why: tf('Unlocks at {n} followers', { n: unlockAt(e.price) }) };   // [followers] milestone, nothing is spent
    grant(profile, e.slot, e.id); saveProfile(profile);
    return { ok: true };
  };

  const wrap = el('div', { class: 'menu-frame crt-panel wide wd' });
  const render = () => {
    const focusKey = document.activeElement?.dataset?.nav;
    wrap.innerHTML = '';
    wrap.appendChild(el('div', { class: 'cp-head' }, el('span', { class: 'cp-os' }, 'TFG OS //'), el('span', { class: 'menu-title' }, t('WARDROBE')),
      el('span', { class: 'cp-cursor' }, '█'), el('span', { class: 'cp-sub' }, `◈ ${profile.coins} · Lv.${profile.level}`)));
    const X = WARDROBE_EXT[tab] || null;   // [cosm5]
    const ctx = { game, profile, pv, ui, tryOn, applyTry, render, close };
    const allItems = X ? X.list(profile) : listFor(tab);
    const ownsEntry = e => X ? !!X.owned(profile,e) : (e.id === 'none' || isOwned(e.slot || tab,e.id));
    const priceEntry = e => X?.price ? X.price(e) : (e.price || 0);
    const items = curateWardrobe(allItems, profile, ownsEntry, priceEntry, filter);
    if (!items.length) items.push(...allItems.slice(0,1));
    if (sel && !items.some(e => e.id === sel.id)) sel = null;
    if (!sel || sel.slot !== tab) sel = { slot: tab, id: X ? items[0]?.id : (tab === 'suit' ? tryOn.suit : tryOn[tab]) };
    const cur = items.find((e) => e.id === sel.id) || items[0];
    const owned = X ? !!X.owned(profile, cur) : (isOwned(cur.slot || tab, cur.id) || cur.id === 'none');
    const isEq = X ? !!X.equipped(profile, cur) : equippedId(tab) === cur.id;
    const col = tierColor(cur.tier || 'common');
    const prog = !owned ? (X ? X.progress?.(profile, cur) || null : progressOf(profile, cur.key)) : null;
    const price = X ? (X.price ? X.price(cur) : 0) : cur.price;
    if (X) X.preview?.(ctx, cur); else WARDROBE_EXT.__leave?.(ctx);

    // ---- left column: preview + detail
    const detail = el('div', { class: 'wd-detail' },
      el('div', { class: 'wd-name', style: { color: col } }, t(cur.name)),
      el('div', { class: 'wd-tier', style: { color: col } }, `${t(tierDef(cur.tier || 'common').name)} · ${X ? t(X.slotLabel ? X.slotLabel(cur) : X.label) : t(tab === 'suit' ? 'Suits' : tab === 'hat' ? 'Hats' : tab === 'face' ? 'Face' : 'Back')}`),
      el('div', { class: 'wd-desc' }, t(cur.desc || '')),
      el('div', { class: 'wd-note' }, t('Appearance only. No combat bonuses.')),
      !isEq ? el('div', { class: 'wd-note' }, t('Preview only — equip to save')) : null,
      owned ? el('div', { class: 'wd-how ok' }, glyphEl('check'), ' ' + (isEq ? t('Equipped') : t('Owned')))
        : el('div', { class: 'wd-how' }, glyphEl('lock'), ` ${t('Unlock')}: ${t(cur.how || '?')}`),
      prog ? el('div', { class: 'wd-bar' }, el('i', { style: { width: Math.round(Math.min(1, prog[0] / prog[1]) * 100) + '%' } })) : null,
      prog ? el('div', { class: 'wd-note' }, `${Math.min(prog[0], prog[1])} / ${prog[1]}`) : null,
      !owned && price ? el('div', { class: 'wd-how' }, `◈ ${tf('Unlocks at {n} followers', { n: unlockAt(price) })}${cur.minLevel > 1 ? ` · Lv.${cur.minLevel}+` : ''}`) : null,   // [followers] milestone, never spent
      !owned && price ? el('div', { class: 'wd-bar' }, el('i', { style: { width: Math.round(Math.min(1, (profile.coins || 0) / Math.max(1, unlockAt(price))) * 100) + '%' } })) : null,
      !owned && price ? el('div', { class: 'wd-note' }, tf('{n} / {m} followers', { n: Math.min(Math.floor(profile.coins || 0), unlockAt(price)), m: unlockAt(price) })) : null,
    );
    const actions = el('div', { class: 'wd-actions' });
    const equipBtn = el('button', { class: 'btn primary' + (owned && (!isEq || X?.alwaysEquippable) ? '' : ' disabled'), type: 'button', 'data-nav': 'wd:equip' }, X?.equipLabel ? X.equipLabel(cur) : t('Equip'));
    equipBtn.addEventListener('click', () => {
      if (!owned || (isEq && !X?.alwaysEquippable)) return;
      if (X ? X.equip(ctx, cur) : doEquip(tab, cur.id)) { if (!X) tryOn[tab] = cur.id; ui.sfx?.('ui_confirm', 0.5); render(); }
    });
    actions.appendChild(equipBtn);
    if (!owned && price) {
      const buyBtn = el('button', { class: 'btn' + (claimable(profile.coins, price) && profile.level >= (cur.minLevel || 1) ? ' primary' : ' disabled'), type: 'button', 'data-nav': 'wd:buy' }, claimable(profile.coins, price) ? t('Claim') : `◈ ${unlockAt(price)}`);
      buyBtn.addEventListener('click', () => {
        const r = X ? (X.buy ? X.buy(ctx, cur) : { ok: false }) : doBuy(cur);
        if (r.ok) { ui.sfx?.('ui_buy', 0.7); render(); } else { ui.sfx?.('ui_error', 0.5); ui.toast?.(t(r.why || 'Locked'), 'bad'); }
      });
      actions.appendChild(buyBtn);
    }
    detail.appendChild(actions);
    const left = el('div', { class: 'wd-left' }, pv.el, detail);

    // ---- right column: tabs + grid
    const tabs = el('div', { class: 'tabs wd-tabs' }, ...TABS.map(([k, label]) => {
      const b = el('button', { class: 'btn tab' + (tab === k ? ' sel' : ''), type: 'button', 'data-nav': 'wd:tab:' + k }, t(label));
      b.addEventListener('click', () => { if (tab === k) return; tab = k; sel = null; ui.sfx?.('ui_click', 0.4); render(); ui.flick?.(wrap); });
      return b;
    }));
    const grid = el('div', { class: 'wd-grid' });
    for (const e of items) {
      const slot = tab;
      const own = X ? !!X.owned(profile, e) : (e.id === 'none' || isOwned(slot, e.id));
      const eq = X ? !!X.equipped(profile, e) : equippedId(slot) === e.id;
      const p2 = !own ? (X ? X.progress?.(profile, e) || null : progressOf(profile, e.key)) : null;
      const tp = X && X.price ? X.price(e) : 0;
      const tile = el('div', { class: 'wd-tile' + (sel.id === e.id ? ' sel' : '') + (own ? '' : ' locked'), style: { '--tc': tierColor(e.tier || 'common') }, tabindex: 0, 'data-nav': `wd:${slot}:${e.id}`, title: e.desc || '' },
        el('div', { class: 'n' }, t(e.name)),
        el('div', { class: 's' }, ...(own ? [eq ? t('Equipped') : t('Owned')] : p2 ? [glyphEl('lock'), ` ${Math.min(p2[0], p2[1])}/${p2[1]}`] : tp ? [`◈ ${unlockAt(tp)}`] : [glyphEl('lock'), ' ' + t('Locked')])),
        e.color ? el('div', { class: 'sw', style: { background: e.color } }) : null,
        eq ? el('div', { class: 'ck' }, glyphEl('check')) : null);
      const pick = () => { sel = { slot, id: e.id }; if (X) X.select?.(ctx, e); else { tryOn[slot] = e.id; applyTry(); } ui.sfx?.('ui_hover', 0.3); render(); };
      tile.addEventListener('click', pick);
      tile.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
      grid.appendChild(tile);
    }
    const filters = el('div', { class: 'wd-tabs', role: 'group', 'aria-label': t('WARDROBE') },
      ...[['ready','Ready & next'],['owned','Owned only'],['all','Full catalog']].map(([id,label]) => {
        const b=el('button',{class:'btn small'+(filter===id?' primary':''),type:'button','aria-pressed':String(filter===id),'data-nav':'wd:filter:'+id},t(label));
        b.addEventListener('click',()=>{ filter=id; sel=null; render(); }); return b;
      }));
    const reset = el('button', {class:'btn small',type:'button','data-nav':'wd:reset'},t('Reset preview'));
    reset.addEventListener('click',()=>{ for(const slot of SLOTS) tryOn[slot]=equippedId(slot); sel=null; applyTry(); render(); });
    detail.appendChild(reset);
    const kit=el('div',{class:'wd-note'},t('Current kit')+': '+SLOTS.map(slot=>t(entry(slot,equippedId(slot))?.name || equippedId(slot))).join(' · '));
    const right = el('div', { class: 'wd-right' }, tabs, filters, kit, X?.extra?.(ctx) || null, grid,
      el('div', { class: 'wd-note' }, t('Drag to rotate') + ' · ' + (X?.note ? X.note() : (cos ? t('Your look syncs to the whole crew.') : t('Saved to your profile.')))));
    const closeBtn = el('button', { class: 'btn back', type: 'button', 'data-nav': 'wd:close' }, t('Close'));
    closeBtn.addEventListener('click', close);
    wrap.append(el('div', { class: 'cp-body' }, left, right), el('div', { class: 'cp-foot' }, el('span', {}, el('kbd', {}, 'ESC'), ' ' + t('BACK')), closeBtn));
    applyTry();
    pv.kick();   // re-attaching the canvas stops its loop: restart it
    if (focusKey) [...wrap.querySelectorAll('[data-nav]')].find(node => node.dataset.nav === focusKey)?.focus?.({ preventScroll: true });
  };
  // the shared preview canvas lives in exactly one panel: give it back to the character sheet underneath (main menu)
  // however the wardrobe gets closed (CLOSE button, ESC, another panel replacing it)
  const home = pv.el.parentElement, homeNext = pv.el.nextSibling;
  let restored = false;
  const restoreHome = () => {
    if (restored) return;
    restored = true;
    pv.setProp?.(null); if (pv.emote) pv.play?.('idle');   // [cosm5]
    pv.follow(profile);
    if (home?.isConnected && !pv.el.isConnected) home.insertBefore(pv.el, homeNext && homeNext.parentElement === home ? homeNext : home.firstChild);
    pv.kick();
  };
  function close() {
    ui.closePanel();
    if (from === 'char' && game) ui.openPanel(ui.characterPanel(true));
    restoreHome();
  }
  render();
  ui.openPanel(wrap);
  const watch = new MutationObserver(() => { if (!wrap.isConnected) { watch.disconnect(); restoreHome(); } });
  watch.observe(document.getElementById('ui') || document.body, { childList: true, subtree: true });
  return wrap;
}

/** the "Wardrobe" button on the character sheet (injected by fun.js) */
export function makeWardrobeButton(ui, getGame) {
  const b = el('button', { class: 'btn primary', type: 'button', 'data-fun': 'wardrobe', 'data-nav': 'fun:wardrobe' }, `${t('WARDROBE')} ▸ ${t('Suits')} · ${t('Hats')} · ${t('Face')} · ${t('Back')}`);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const game = getGame();
    const app = window.kefal;
    openWardrobe({ game, profile: game?.profile || app?.profile, ui, from: game ? 'char' : null });
  });
  return b;
}

export { SLOTS, PRICES, FACE_ACCS, BACK_ACCS };
