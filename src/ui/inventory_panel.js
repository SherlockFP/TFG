// The I panel: paper-doll equipment (Suit, 2 Trinkets, Bag) · backpack grid · hotbar row · character sheet.
// Drag & drop between all of them (pointer events), RMB / double-click quick-move, SHIFT+click or drag outside = drop
// to the world, 1-9 while hovering = move to that hotbar slot. Rich tier tooltips (itemTooltipHTML, reusable).
// All state changes go through the inventory api (planMove / doMove / quickMove / sortBag): the host validates them.
import { TIERS, TIER_ORDER } from '../game/tiers.js';
import * as C from '../game/inventory_core.js';
import { isSellable } from '../game/items.js';
import { affixDisplayName, describeAffix, affixCooldown } from '../game/loot.js';
import { iconHTML } from './icons.js';
import { escapeHtml } from '../core/util.js';
import { t } from '../core/i18n.js';
import { plusMul, plusBonus, OVERCLOCKS } from '../game/enhance.js';   // [forge]
import { durBarHTML, durClass, durRow, durFlag } from './durability_style.js';   // [durability]

const CELL = 50, GAP = 3, PAD = 6;
const EQ_ITEM = { armor: [72, 92], trinket1: [50, 50], trinket2: [50, 50], bag: [64, 64] };   // item box inside each paper-doll slot
const SVG = {
  armor: '<svg viewBox="0 0 24 24" width="40" height="40"><path fill="currentColor" d="M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3c-.8 1.8-2.2 3-4 3S8.8 4.8 8 3z"/></svg>',
  trinket: '<svg viewBox="0 0 24 24" width="30" height="30"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M5 2l7 8 7-8"/><circle cx="12" cy="15.5" r="5" fill="currentColor"/></svg>',
  bag: '<svg viewBox="0 0 24 24" width="38" height="38"><path fill="currentColor" d="M9 5V4a3 3 0 0 1 6 0v1h.5A4.5 4.5 0 0 1 20 9.5V21H4V9.5A4.5 4.5 0 0 1 8.5 5H9zm1.5 0h3V4a1.5 1.5 0 0 0-3 0v1zM7 13v5h10v-5H7z"/></svg>',
};
const BODY = `<svg viewBox="0 0 40 80" class="tinv-body"><g fill="currentColor"><circle cx="20" cy="9" r="7"/><rect x="11" y="18" width="18" height="26" rx="4"/>
<rect x="3" y="19" width="7" height="24" rx="3"/><rect x="30" y="19" width="7" height="24" rx="3"/><rect x="12" y="44" width="7" height="30" rx="3"/><rect x="21" y="44" width="7" height="30" rx="3"/></g></svg>`;
const KIND_NAME = { scrap: 'Scrap', big: 'Valuable', fish: 'Catch', drop: 'Creature drop', tool: 'Tool', weapon: 'Weapon', consumable: 'Consumable',
  bag: 'Bag', armor: 'Suit / Armor', trinket: 'Trinket', component: 'Component', body: 'Body' };
const pct = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
const r1 = (v) => Math.round(v * 10) / 10;

/** Rich tooltip HTML for a world item (or just a def). Also usable by other panels (shop, crafting). */
export function itemTooltipHTML(it, def = it?.def, { grid = null, hint = '' } = {}) {
  if (!def) return '';
  const tier = it ? it.rarity() : (def.tier || 'common');
  const T = TIERS[tier] || TIERS.common;
  const pm = it?.plus ? plusMul(it.plus) : 1;   // [forge] +N enhancement
  const mul = T.statMul * pm;
  const name = affixDisplayName(t(def.name), it?.affix, it);
  const rows = [];
  const row = (k, v, cls = '') => rows.push(`<span class="k">${escapeHtml(t(k))}</span><span class="v ${cls}">${v}</span>`);
  if (isSellable(def) && (it?.value || def.value)) row('Value', it ? `▮${it.value}` : `▮${def.value[0]}-${def.value[1]}`);
  if (def.price && !it) row('Price', `▮${def.price}`);
  const w = def.weight || 0;
  if (it?.inv?.k === 'bag' && grid && grid.weightMul !== 1) row('Weight', `<s>${r1(w)}</s>${r1(w * grid.weightMul)} lb`);
  else row('Weight', `${r1(w)} lb`);
  const size = C.itemSize(def);
  row('Size', size ? `${size.w}×${size.h}` : '—');
  if (def.kind === 'weapon') {
    const base = def.dmg || 0;
    row('Damage', mul !== 1 ? `<s>${base}</s>${Math.round(base * mul)}${def.ranged && def.id === 'shotgun' ? ' ×8' : ''}` : `${base}`, mul > 1 ? 'up' : '');
    row('Cooldown', `${r1(affixCooldown(it?.affix, def.cd || 0))} s`);
    row(def.ranged ? 'Range' : 'Reach', `${r1(def.reach || 0)} m`);
    if (def.stun) row('Stun', `${def.stun} s`);
  }
  const g = def.gear;
  if (g) {
    if (g.armor) row('Damage reduction', `${Math.round(g.armor * mul * 100)}%`, 'up');
    if (g.luck) row('crew luck', `+${r1(g.luck * mul * 100)}`, 'up');
    if (g.crit) row('crit', pct(g.crit * mul), 'up');
    if (g.stamina) row('max stamina', `+${Math.round(g.stamina * mul)}`, 'up');
    if (g.regenPct) row('stamina regen', pct(g.regenPct * mul), 'up');
    if (g.scan) row('scan range', `+${r1(g.scan * mul)} m`, 'up');
    if (g.battery) row('battery life', pct(g.battery * mul), 'up');
    if (g.speed) row('move speed', pct(g.speed), 'down');
  }
  if (def.kind === 'bag') {
    const b = C.bagInfo(def);
    row('Grid', `${b.cols}×${b.rows}`, 'up');
    row('Stashed weight', `×${b.weightMul}`, b.weightMul < 1 ? 'up' : '');
    if (b.speed) row('move speed', pct(b.speed), 'down');
  }
  if (def.battery && it) row('Battery', `${Math.round(((it.battery ?? def.battery) / def.battery) * 100)}%`);
  if (def.charges && it) row('Charges', `${it.charges ?? def.charges}`);
  if (def.ammo !== undefined && it) row('Ammo', `${it.ammo ?? 0}/${def.ammo}`);
  if (it?.plus) row('Forge', `+${it.plus} (+${Math.round(plusBonus(it.plus) * 100)}%)`, 'up');   // [forge]
  const dRow = durRow(it, def); if (dRow) row(...dRow);   // [durability] Durability 87/120
  const ocHtml = (it?.oc || []).map((id) => OVERCLOCKS[id] ? `<div style="color:${OVERCLOCKS[id].color}">${OVERCLOCKS[id].icon} ${escapeHtml(t(OVERCLOCKS[id].name))}: ${escapeHtml(t(OVERCLOCKS[id].desc))}</div>` : '').join('');
  const aff = (it?.affix ? describeAffix(it.affix).map((s) => `<div>${escapeHtml(s)}</div>`).join('') : '') + ocHtml;
  const flags = [];
  const flag = (s, col) => flags.push(`<span style="color:${col}">${escapeHtml(t(s))}</span>`);
  if (def.hands === 2) flag('Two-handed', '#ffd9b8');
  if (def.fragile) flag('Fragile', '#8fe8ff');
  if (def.cursed) flag('Cursed', '#ff5a8a');
  if (def.hot) flag('Hot', '#ff8a3d');
  if (def.component || def.kind === 'component') flag('Component', '#7dff7d');
  if (def.keyItem || def.id === 'key') flag('Key item', '#ffd23f');
  if (it?.soulbound) flag('Soulbound', '#b35cff');
  const dFlag = durFlag(it, def); if (dFlag) flag(...dFlag);   // [durability]
  const desc = def.tip ? `<div class="tt-desc">${escapeHtml(t(def.tip))}</div>` : '';
  return `<div class="tt-head">${iconHTML(def.id, 'ico')}<div><div class="tt-name">${escapeHtml(name)}</div>
    <div class="tt-kind"><b>${escapeHtml(t(T.name))}</b> · ${escapeHtml(t(KIND_NAME[def.kind] || def.kind || ''))}</div></div></div>
    <div class="tt-rows">${rows.join('')}</div>${aff ? `<div class="tt-aff">${aff}</div>` : ''}
    ${flags.length ? `<div class="tt-flags">${flags.join('')}</div>` : ''}${desc}${hint ? `<div class="tt-keys">${hint}</div>` : ''}`;
}

export class InventoryPanel {
  constructor(game, api) {
    this.game = game; this.api = api;
    this.el = null; this.sig = ''; this.t = 0;
    this.press = null; this.drag = null; this.hoverId = null; this.tip = null;
    this.planCache = new Map();
    this.onDown = (e) => this.pointerDown(e);
    this.onMove = (e) => this.pointerMove(e);
    this.onUp = (e) => this.pointerUp(e);
    this.onCtx = (e) => { e.preventDefault(); const iv = e.target.closest?.('.ivi'); if (iv && !this.drag) this.quick(iv.dataset.id); };
    this.onDbl = (e) => { const iv = e.target.closest?.('.ivi'); if (iv) this.quick(iv.dataset.id); };
    this.onKey = (e) => this.key(e);
    this.onOver = (e) => { const iv = e.target.closest?.('.ivi'); this.setHover(iv?.dataset.id || null, e); };
    this.onLeave = () => this.setHover(null);
  }

  // ------------------------------------------------------------------ lifecycle
  isOpen() { return !!this.el && this.game.ui?.panelOpen === this.el; }
  open() {
    const ui = this.game.ui;
    if (!ui?.openPanel || typeof document === 'undefined') return;
    if (this.isOpen()) return;
    this.cleanup();
    this.el = this.build();
    ui.openPanel(this.el);
    this.el.addEventListener('pointerdown', this.onDown);
    this.el.addEventListener('contextmenu', this.onCtx);
    this.el.addEventListener('dblclick', this.onDbl);
    this.el.addEventListener('pointerover', this.onOver);
    this.el.addEventListener('pointerleave', this.onLeave);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('keydown', this.onKey);
    this.sig = '';
    this.render();
    this.game.audio?.ui?.('ui_click', 0.45);
    this.game.sfx?.('cloth_rustle', 0.35, 1.1);
  }
  close() {
    if (this.isOpen()) this.game.ui.closePanel();
    this.cleanup();
  }
  cleanup() {
    if (!this.el) return;
    this.cancelDrag();
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('contextmenu', this.onCtx);
    this.el.removeEventListener('dblclick', this.onDbl);
    this.el.removeEventListener('pointerover', this.onOver);
    this.el.removeEventListener('pointerleave', this.onLeave);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    this.tip?.remove(); this.tip = null;
    this.el = null; this.hoverId = null; this.press = null;
  }
  dispose() { this.close(); }
  update(dt) {
    if (this.el && !this.isOpen()) { this.cleanup(); return; }   // closed by Esc / TAB / another panel
    if (!this.isOpen()) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.15;
    if (this.drag) return;
    const sig = this.signature();
    if (sig !== this.sig) this.render();
  }
  flash(msg) {
    if (!msg) return;
    const m = this.el?.querySelector('.tinv-msg');
    if (!m) { this.game.ui?.toast(t(msg), 'bad'); return; }
    m.textContent = t(msg);
    m.className = 'tinv-msg bad';
    clearTimeout(this.msgT);
    this.msgT = setTimeout(() => { if (m.isConnected) { m.textContent = ''; m.className = 'tinv-msg'; } }, 2400);
    this.game.sfx?.('ui_error', 0.35);
  }

  // ------------------------------------------------------------------ DOM
  build() {
    const f = document.createElement('div');
    f.className = 'menu-frame crt-panel tinv';
    const eq = (s, ghost, label) => `<div class="tinv-eq tinv-eq-${s}"><div class="tinv-slot" data-eq="${s}"><div class="tinv-ghost">${ghost}</div></div><div class="tinv-eqlbl">${escapeHtml(t(label))}</div></div>`;
    f.innerHTML = `
      <div class="cp-head"><span class="menu-title">${escapeHtml(t('INVENTORY'))}</span><span class="cp-cursor">█</span><span class="cp-sub tinv-sub"></span></div>
      <div class="cp-body">
        <div class="tinv-col tinv-doll">
          <div class="tinv-sec">${escapeHtml(t('Equipment'))}</div>
          <div class="tinv-dollbox">${BODY}
            ${eq('trinket1', SVG.trinket, 'Trinket I')}${eq('trinket2', SVG.trinket, 'Trinket II')}${eq('armor', SVG.armor, 'Suit / Armor')}${eq('bag', SVG.bag, 'Bag')}
            <div class="tinv-eq-hint"></div>
          </div>
        </div>
        <div class="tinv-col tinv-mid">
          <div class="tinv-sec tinv-bagtitle"></div>
          <div class="tinv-gridwrap"><div class="tinv-grid"></div><div class="tinv-items"></div><div class="tinv-empty"></div></div>
          <div class="tinv-bar"><span class="tinv-wtxt"></span><div class="tinv-wbar"><div></div><span></span></div><button class="btn tinv-btn tinv-sort">${escapeHtml(t('Sort'))}</button></div>
          <div class="tinv-sec">${escapeHtml(t('Hotbar'))}</div>
          <div class="tinv-hotrow"></div>
          <div class="tinv-msg"></div>
        </div>
        <div class="tinv-col tinv-sheet">
          <div class="tinv-sec">${escapeHtml(t('Character'))}</div>
          <div class="tinv-stats"></div>
          <div class="tinv-sec">${escapeHtml(t('Loot tiers'))}</div>
          <div class="tinv-legend">${TIER_ORDER.map((id) => `<span class="tier-${id}">${escapeHtml(t(TIERS[id].name))}</span>`).join('')}</div>
        </div>
      </div>
      <div class="cp-foot">${[['DRAG', 'move'], ['RMB', 'quick-move / equip'], ['SHIFT+CLICK', 'drop'], ['1-4', 'to hotbar'], ['I / ESC', 'close']]
        .map(([k, l]) => `<span><kbd>${k}</kbd> ${escapeHtml(t(l))}</span>`).join('')}</div>`;
    f.querySelector('.tinv-sort').addEventListener('click', () => { if (this.api.sortBag()) this.game.sfx?.('inventory_switch', 0.5, 0.8); });
    return f;
  }

  signature() {
    const g = this.game, p = g.player;
    const list = this.api.entries();
    const grid = this.api.grid();
    return list.map((e) => `${e.id}:${e.inv ? e.inv.k + (e.inv.s || '') + e.inv.x + ',' + e.inv.y : 'h'}:${e.tier}:${e.value}:${e.it.charges ?? ''}:${Math.round(e.it.battery ?? -1)}:${e.it.ammo ?? ''}:${e.it.dur ?? ''}`).join('|')
      + `#${p.slots.join(',')}#${p.slot}#${grid.cols}x${grid.rows}#${Math.round(p.carryWeight?.() || 0)}`;
  }

  itemHTML(e, w, h) {
    const it = e.it, def = e.def;
    const tier = e.tier;
    const tiered = !!(it.tier || it.affix || def.tier || def.value) && tier !== 'common';
    const s = Math.min(w, h);
    const ico = Math.max(28, Math.min(s - 8, 96));
    const val = isSellable(def) && it.value ? `<div class="iv-v">▮${it.value}</div>` : '';
    const bat = def.battery ? `<div class="iv-bat"><div style="width:${Math.max(0, Math.min(100, ((it.battery ?? 0) / def.battery) * 100))}%"></div></div>` : '';
    const ch = def.ammo !== undefined ? `<div class="iv-c">${it.ammo ?? 0}/${def.ammo}</div>` : def.charges ? `<div class="iv-c">${it.charges ?? 0}</div>` : '';
    const style = `width:${w}px;height:${h}px;${tiered ? `--tc:${TIERS[tier].color};` : ''}`;
    const img = iconHTML(it.type, 'ico').replace('<img ', `<img style="width:${ico}px;height:${ico}px" `);
    return `<div class="ivi ${tiered ? 't-' + tier : 'plain'}${durClass(it)}" data-id="${escapeHtml(e.id)}" style="${style}">${tiered ? '<div class="iv-pip"></div>' : ''}${img}${val}${ch}${bat}${durBarHTML(it)}</div>`;   // [durability] bar + BROKEN overlay
  }

  render() {
    const el = this.el;
    if (!el) return;
    const g = this.game, p = g.player, api = this.api;
    this.sig = this.signature();
    this.planCache.clear();
    const list = api.entries();
    const grid = api.grid();
    const byId = new Map(list.map((e) => [e.id, e]));
    const px = (n) => n * CELL + (n - 1) * GAP;
    // equipment
    for (const s of C.EQUIP_SLOTS) {
      const slot = el.querySelector(`[data-eq="${s}"]`);
      const e = list.find((x) => x.inv?.k === 'eq' && x.inv.s === s);
      slot.querySelector('.ivi')?.remove();
      slot.querySelector('.tinv-ghost').style.display = e ? 'none' : '';
      if (e) { const [w, h] = EQ_ITEM[s]; slot.insertAdjacentHTML('beforeend', this.itemHTML(e, w, h)); }
    }
    const b = C.equipBonuses(list);
    el.querySelector('.tinv-eq-hint').textContent = b.armor > 0 ? `${t('Armor')} ${Math.round(Math.min(0.6, g.stats.armor || 0) * 100)}%` : '';
    // bag grid
    const bagE = C.bagEntryOf(list);
    const extra = api.extraCols();
    el.querySelector('.tinv-bagtitle').innerHTML = `${escapeHtml(bagE ? t(bagE.def.name) : t('Pockets'))} <em>${grid.cols}×${grid.rows}${extra ? ` (+${extra})` : ''}${grid.weightMul !== 1 ? ` · ${escapeHtml(t('loot weight'))} ×${grid.weightMul}` : ''}${grid.speed ? ` · ${pct(grid.speed)}` : ''}</em>`;
    const gridEl = el.querySelector('.tinv-grid');
    gridEl.style.gridTemplateColumns = `repeat(${grid.cols}, ${CELL}px)`;
    gridEl.innerHTML = '<div class="tinv-cell"></div>'.repeat(grid.cols * grid.rows);
    const itemsEl = el.querySelector('.tinv-items');
    itemsEl.innerHTML = list.filter((e) => e.inv?.k === 'bag').map((e) => {
      const sz = C.itemSize(e.def) || { w: 1, h: 1 };
      return this.itemHTML(e, px(sz.w), px(sz.h)).replace('style="', `style="left:${e.inv.x * (CELL + GAP)}px;top:${e.inv.y * (CELL + GAP)}px;`);
    }).join('');
    const bagged = list.filter((e) => e.inv?.k === 'bag');
    el.querySelector('.tinv-empty').textContent = bagged.length ? '' : (bagE ? t('Empty — drag loot here') : t('Wear a bag for more room'));
    // hotbar
    el.querySelector('.tinv-hotrow').innerHTML = p.slots.map((id, i) => {
      const e = id && byId.get(id);
      return `<div class="tinv-hot${i === p.slot ? ' active' : ''}"><div class="tinv-slot" data-hot="${i}">${e ? this.itemHTML(e, 58, 58) : ''}</div><div class="tinv-hk">${i + 1}</div></div>`;
    }).join('');
    // weight bar
    const relief = g.stats.carryRelief || 0;
    const wNet = p.carryWeight?.() || 0;
    const wShown = Math.round(wNet + relief);
    const bar = el.querySelector('.tinv-wbar');
    bar.firstElementChild.style.width = `${Math.min(100, (wNet / 114) * 100)}%`;
    bar.lastElementChild.style.left = `${(10 / 114) * 100}%`;
    const slow = 1 - Math.max(0.6, Math.min(1, 1 - Math.max(0, wNet - 10) / 260));
    el.querySelector('.tinv-wtxt').textContent = `${wShown} lb${slow > 0.005 ? ` · ${pct(-slow)}` : ''}`;
    // header
    let carried = 0;
    for (const e of list) if (isSellable(e.def) && e.it.type !== 'body') carried += e.value || 0;
    el.querySelector('.tinv-sub').textContent = `▮${carried} ${t('carried')} · ${wShown} lb · ${C.usedCells(list)}/${grid.cols * grid.rows}`;
    // character sheet
    const s = g.stats;
    const sp = (s.speedMul || 1) * (p.weightMul || 1) - 1;
    let bagVal = 0; for (const e of bagged) if (isSellable(e.def)) bagVal += e.value || 0;
    const statRow = (k, v, cls = '') => `<span class="k">${escapeHtml(t(k))}</span><span class="v ${cls}">${v}</span>`;
    el.querySelector('.tinv-stats').innerHTML = [
      statRow('Armor', `${Math.round(Math.min(0.6, s.armor || 0) * 100)}%`, s.armor > 0 ? 'up' : ''),
      statRow('Move speed', pct(sp), sp < -0.005 ? 'down' : sp > 0.005 ? 'up' : ''),
      statRow('Stamina', `${Math.round(s.maxStamina || 100)}`, b.stamina > 0 ? 'up' : ''),
      statRow('Scan range', `${Math.round(s.scanRange || 0)} m`, b.scan > 0 ? 'up' : ''),
      statRow('Crit chance', `${Math.round((s.crit || 0) * 100)}%`, b.crit > 0 ? 'up' : ''),
      statRow('Crew loot luck', `+${Math.round((b.luck || 0) * 100)}`, b.luck > 0 ? 'up' : ''),
      statRow('Carrying', `${wShown} lb`),
      statRow('Bag value', `▮${bagVal}`),
    ].join('');
    if (this.hoverId && !byId.has(this.hoverId)) this.setHover(null);
  }

  // ------------------------------------------------------------------ tooltip
  setHover(id, ev) {
    if (this.drag) id = null;
    if (id !== this.hoverId) {
      this.hoverId = id;
      if (!id) { this.tip?.remove(); this.tip = null; return; }
      const e = this.api.entries().find((x) => x.id === id);
      if (!e) return;
      if (!this.tip) { this.tip = document.createElement('div'); this.tip.className = 'tinv-tip'; document.body.appendChild(this.tip); }
      const tier = e.tier;
      this.tip.style.setProperty('--tc', (TIERS[tier] || TIERS.common).color);
      const hint = e.inv?.k === 'eq' ? 'RMB: unequip · SHIFT+CLICK: drop' : C.isEquippable(e.def) ? 'RMB: equip · SHIFT+CLICK: drop' : e.inv ? 'RMB: to hotbar · 1-4: hotbar slot · SHIFT+CLICK: drop' : 'RMB: stash in bag · SHIFT+CLICK: drop';
      this.tip.innerHTML = itemTooltipHTML(e.it, e.def, { grid: this.api.grid(), hint });
    }
    if (ev && this.tip) this.placeTip(ev.clientX, ev.clientY);
  }
  placeTip(x, y) {
    const tip = this.tip;
    if (!tip) return;
    const w = tip.offsetWidth || 300, h = tip.offsetHeight || 200;
    let lx = x + 22, ly = y + 16;
    if (lx + w > window.innerWidth - 8) lx = x - w - 18;
    if (ly + h > window.innerHeight - 8) ly = Math.max(8, window.innerHeight - h - 8);
    tip.style.left = Math.max(8, lx) + 'px';
    tip.style.top = ly + 'px';
  }

  // ------------------------------------------------------------------ input
  quick(id) {
    if (!id) return;
    this.setHover(null);
    this.api.quickMove(id);
    this.sig = ''; this.t = 0;
  }
  key(e) {
    if (!this.isOpen() || this.game.input?.isTyping?.()) return;
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m && this.hoverId) {
      const i = Number(m[1]) - 1;
      if (i < this.game.player.slots.length) { e.preventDefault(); this.api.doMove(this.hoverId, { k: 'hot', i }); this.sig = ''; this.t = 0; }
    }
  }
  pointerDown(e) {
    if (e.button !== 0) return;
    const iv = e.target.closest?.('.ivi');
    if (!iv) return;
    e.preventDefault();
    const id = iv.dataset.id;
    if (e.shiftKey) { this.setHover(null); this.api.doMove(id, { k: 'world' }); this.sig = ''; this.t = 0; return; }
    const r = iv.getBoundingClientRect();
    const inGrid = !!iv.closest('.tinv-items');
    this.press = { id, x: e.clientX, y: e.clientY, el: iv, off: inGrid ? { cx: Math.floor((e.clientX - r.left) / (CELL + GAP)), cy: Math.floor((e.clientY - r.top) / (CELL + GAP)) } : null };
  }
  pointerMove(e) {
    if (this.hoverId && this.tip && !this.drag) this.placeTip(e.clientX, e.clientY);
    if (this.press && !this.drag && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 5) this.startDrag(e);
    if (!this.drag) return;
    this.drag.ghost.style.left = e.clientX + 'px';
    this.drag.ghost.style.top = e.clientY + 'px';
    this.preview(this.targetAt(e.clientX, e.clientY));
  }
  pointerUp(e) {
    const press = this.press;
    this.press = null;
    if (!this.drag) return;
    const tgt = this.targetAt(e.clientX, e.clientY);
    const id = this.drag.id;
    this.cancelDrag();
    if (!tgt || !press) { this.render(); return; }
    this.api.doMove(id, tgt);
    this.sig = ''; this.t = 0;
    this.render();
  }
  startDrag(e) {
    const { id, el } = this.press;
    const entry = this.api.entries().find((x) => x.id === id);
    if (!entry) { this.press = null; return; }
    this.setHover(null);
    const size = C.itemSize(entry.def) || { w: 1, h: 1 };
    const w = size.w * CELL + (size.w - 1) * GAP, h = size.h * CELL + (size.h - 1) * GAP;
    const ghost = document.createElement('div');
    ghost.className = 'tinv-drag';
    ghost.innerHTML = this.itemHTML(entry, w, h);
    ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
    if (this.press.off) ghost.style.transform = `translate(${-(this.press.off.cx + 0.5) * (CELL + GAP)}px, ${-(this.press.off.cy + 0.5) * (CELL + GAP)}px) scale(1.04)`;
    document.body.appendChild(ghost);
    el.classList.add('dragging');
    this.drag = { id, size, ghost, src: el, off: this.press.off || { cx: Math.floor((size.w - 1) / 2), cy: Math.floor((size.h - 1) / 2) }, key: '' };
    this.game.sfx?.('inventory_switch', 0.25, 1.2);
  }
  cancelDrag() {
    const d = this.drag;
    if (!d) return;
    d.ghost.remove();
    d.src?.classList.remove('dragging');
    this.drag = null;
    this.clearPreview();
  }
  targetAt(x, y) {
    if (!this.el) return null;
    const under = document.elementFromPoint(x, y);
    const frame = this.el;
    if (!under || !frame.contains(under)) return { k: 'world' };
    const eq = under.closest('[data-eq]');
    if (eq) return { k: 'eq', s: eq.dataset.eq };
    const hot = under.closest('[data-hot]');
    if (hot) return { k: 'hot', i: Number(hot.dataset.hot) };
    const wrap = under.closest('.tinv-gridwrap');
    if (wrap) {
      const r = wrap.getBoundingClientRect();
      const grid = this.api.grid();
      const cx = Math.floor((x - r.left - PAD) / (CELL + GAP)), cy = Math.floor((y - r.top - PAD) / (CELL + GAP));
      const off = this.drag?.off || { cx: 0, cy: 0 };
      const size = this.drag?.size || { w: 1, h: 1 };
      const gx = Math.max(0, Math.min(grid.cols - size.w, cx - off.cx)), gy = Math.max(0, Math.min(grid.rows - size.h, cy - off.cy));
      return { k: 'bag', x: gx, y: gy };
    }
    return null;
  }
  plan(tgt) {
    const key = `${this.drag.id}>${tgt.k}:${tgt.s ?? tgt.i ?? ''}:${tgt.x ?? ''},${tgt.y ?? ''}`;
    if (!this.planCache.has(key)) this.planCache.set(key, this.api.planMove(this.drag.id, tgt));
    return this.planCache.get(key);
  }
  clearPreview() {
    if (!this.el) return;
    for (const c of this.el.querySelectorAll('.c-ok, .c-swap, .c-bad')) c.classList.remove('c-ok', 'c-swap', 'c-bad');
    for (const c of this.el.querySelectorAll('.drop-ok, .drop-swap, .drop-bad')) c.classList.remove('drop-ok', 'drop-swap', 'drop-bad');
    const m = this.el.querySelector('.tinv-msg');
    if (m && m.dataset.drag) { m.textContent = ''; m.dataset.drag = ''; }
  }
  preview(tgt) {
    const key = tgt ? JSON.stringify(tgt) : '';
    if (key === this.drag.key) return;
    this.drag.key = key;
    this.clearPreview();
    if (!tgt) return;
    const msg = this.el.querySelector('.tinv-msg');
    if (tgt.k === 'world') { msg.textContent = t('Drag here to drop') + ' ↓'; msg.dataset.drag = '1'; msg.className = 'tinv-msg'; return; }
    const pl = this.plan(tgt);
    const cls = !pl.ok ? 'bad' : (pl.swap || (tgt.k !== 'bag' && pl.moves.length > 1 && !pl.local)) ? 'swap' : 'ok';
    if (tgt.k === 'bag') {
      const grid = this.api.grid();
      const cells = this.el.querySelectorAll('.tinv-cell');
      for (let j = tgt.y; j < Math.min(grid.rows, tgt.y + this.drag.size.h); j++) for (let i = tgt.x; i < Math.min(grid.cols, tgt.x + this.drag.size.w); i++) cells[j * grid.cols + i]?.classList.add('c-' + cls);
    } else {
      const slot = this.el.querySelector(tgt.k === 'eq' ? `[data-eq="${tgt.s}"]` : `[data-hot="${tgt.i}"]`);
      slot?.classList.add('drop-' + cls);
    }
    if (!pl.ok && pl.reason) { msg.textContent = t(pl.reason); msg.dataset.drag = '1'; msg.className = 'tinv-msg bad'; }
  }
}

