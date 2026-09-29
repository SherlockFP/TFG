// EMOTE WHEEL 2 + EMOTE STUDIO (wave 6, docs/wave6/dance.md). Replaces the old 16-item ring of emotes.js when this module is imported (it installs WHEEL.make).
//  Hold B: radial wheel of 8 slots per PAGE (Favourites, then Dance / Social / Taunt / Signal, big categories split into even pages). Mouse picks, release plays.
//          LEFT / RIGHT or the mouse wheel turns the page, UP toggles the hovered emote as a favourite. Thumbnails = the avatar in each emote's signature pose (rendered once).
//  Tap B (no pick): the Emote Studio panel (pointer free): search, category chips, thumbnail grid, drag an emote onto one of the 8 favourite slots
//          (click a slot to clear, double click a tile to play it). Favourites live in profile.emoteFav.
// Look: UI2/UI3 (hard corners, hazard tape, glyph() pictograms, no emoji).
import { EMOTES, EMOTE_BY_ID, isEmoteUnlocked, WHEEL } from '../game/emotes.js';
import * as DD from '../game/dance_data.js';
import { glyph } from './glyphs.js';
import { t } from '../core/i18n.js';
import { saveProfile } from '../core/save.js';
import { thumbFor } from './emotethumbs.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const catLabel = (id) => t((DD.CATS.find((c) => c.id === id) || DD.CATS[2]).en);
const catGlyph = (id) => (DD.CATS.find((c) => c.id === id) || DD.CATS[2]).glyph;
const nameOf = (e) => (e ? String(e.name) : '');
const tag = (def) => (DD.isLoop(def) ? t('LOOP') : t('ONE-SHOT'));

const CSS = `
.ew2 { position: absolute; left: 50%; top: 50%; width: 600px; height: 600px; transform: translate(-50%, -50%); pointer-events: none; z-index: 22; font-family: var(--font2, 'VT323', monospace); color: #f2e4d2; animation: ew2in 0.1s ease-out; }
@keyframes ew2in { from { opacity: 0; transform: translate(-50%, -50%) scale(0.94); } }
.ew2-plate { position: absolute; inset: 34px; background: rgba(10,7,4,0.84); border: 2px solid #4a3620; box-shadow: 0 0 0 1px #000, 0 12px 60px rgba(0,0,0,0.7); }
.ew2-plate::before, .ew2-plate::after { content: ''; position: absolute; left: -2px; right: -2px; height: 7px; background: repeating-linear-gradient(-45deg, #ffb800 0 6px, #17110a 6px 12px); }
.ew2-plate::before { top: -9px; } .ew2-plate::after { bottom: -9px; }
.ew2-tabs { position: absolute; left: 50%; top: 4px; transform: translateX(-50%); display: flex; gap: 3px; z-index: 2; }
.ew2-tab { display: flex; align-items: center; gap: 5px; padding: 2px 8px 1px; font-size: 16px; letter-spacing: 1px; background: #17110a; border: 1px solid #4a3620; color: #b39a7a; text-transform: uppercase; }
.ew2-tab.on { background: #ffb800; color: #17110a; border-color: #ffb800; }
.ew2-tab .tfg-glyph { width: 14px; height: 14px; }
.ew2-slot { position: absolute; width: 90px; height: 96px; margin: -48px 0 0 -45px; background: rgba(23,17,10,0.92); border: 2px solid #4a3620; text-align: center; transition: transform 0.06s; overflow: hidden; }
.ew2-slot .th { display: block; width: 100%; height: 68px; background: center / contain no-repeat; display: flex; align-items: center; justify-content: center; color: #6b5538; }
.ew2-slot .th .tfg-glyph { width: 30px; height: 30px; }
.ew2-slot .lb { display: block; font-size: 15px; line-height: 16px; padding: 0 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #d9c6ad; }
.ew2-slot .fv { position: absolute; right: 2px; top: 2px; color: #ffb800; } .ew2-slot .fv .tfg-glyph { width: 12px; height: 12px; }
.ew2-slot.empty { border-style: dashed; opacity: 0.55; } .ew2-slot.empty .th { color: #4a3620; }
.ew2-slot.sel { transform: scale(1.14); border-color: #ffb800; background: #241a0e; z-index: 3; box-shadow: 0 0 0 1px #000, 0 0 18px rgba(255,184,0,0.35); }
.ew2-slot.sel .lb { color: #fff; }
.ew2-center { position: absolute; left: 50%; top: 50%; width: 196px; margin: -104px 0 0 -98px; text-align: center; background: #120d07; border: 2px solid #4a3620; padding: 6px 4px 8px; z-index: 1; }
.ew2-center .pv { height: 132px; background: center / contain no-repeat; display: flex; align-items: center; justify-content: center; color: #4a3620; } .ew2-center .pv .tfg-glyph { width: 54px; height: 54px; }
.ew2-center .nm { font-size: 24px; line-height: 24px; color: #ffb800; margin-top: 4px; text-transform: uppercase; }
.ew2-center .sb { font-size: 16px; opacity: 0.75; letter-spacing: 1px; }
.ew2-hint { position: absolute; left: 0; right: 0; bottom: 8px; text-align: center; font-size: 15px; opacity: 0.8; letter-spacing: 1px; }
.ew2-hint kbd, .es-foot kbd { display: inline-block; padding: 0 5px; margin: 0 2px; background: #ffb800; color: #17110a; font-family: inherit; }
.ew2-page { position: absolute; right: 44px; top: 42px; font-size: 16px; opacity: 0.7; }
.emote-studio { width: min(980px, 96vw); }
.es-body { display: grid; grid-template-columns: 1fr 250px; gap: 14px; padding: 10px 16px; max-height: 60vh; }
.es-tools { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
.es-tools input { flex: 1 1 160px; min-width: 120px; background: #0c0805; border: 2px solid #4a3620; color: #f2e4d2; font: inherit; font-size: 18px; padding: 3px 8px; border-radius: 0; }
.es-chip { padding: 2px 9px; font-size: 16px; background: #17110a; border: 1px solid #4a3620; color: #b39a7a; cursor: pointer; text-transform: uppercase; border-radius: 0; }
.es-chip.on { background: #ffb800; color: #17110a; border-color: #ffb800; }
.es-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; overflow-y: auto; max-height: calc(60vh - 52px); padding-right: 4px; }
.es-tile { position: relative; background: #17110a; border: 2px solid #4a3620; padding: 2px; cursor: grab; text-align: center; user-select: none; border-radius: 0; }
.es-tile:hover, .es-tile.arm { border-color: #ffb800; }
.es-tile.locked { opacity: 0.45; cursor: not-allowed; }
.es-tile .th { height: 74px; background: center / contain no-repeat; display: flex; align-items: center; justify-content: center; color: #4a3620; } .es-tile .th .tfg-glyph { width: 28px; height: 28px; }
.es-tile .nm { font-size: 15px; line-height: 15px; height: 30px; overflow: hidden; color: #e6d3b8; }
.es-tile .tg { position: absolute; left: 3px; top: 3px; font-size: 12px; background: #000c; color: #ffb800; padding: 0 3px; letter-spacing: 1px; }
.es-tile .lk { position: absolute; right: 3px; top: 3px; color: #ff6b5a; } .es-tile .lk .tfg-glyph { width: 13px; height: 13px; }
.es-side h4 { margin: 0 0 6px; font-size: 18px; color: #ffb800; letter-spacing: 1px; font-weight: normal; text-transform: uppercase; }
.es-slots { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.es-slot { position: relative; height: 104px; border: 2px dashed #4a3620; background: #0c0805; text-align: center; cursor: pointer; border-radius: 0; }
.es-slot.full { border-style: solid; background: #17110a; }
.es-slot.over { border-color: #ffb800; background: #241a0e; }
.es-slot .n { position: absolute; left: 3px; top: 1px; font-size: 13px; color: #ffb800; }
.es-slot .th { height: 74px; background: center / contain no-repeat; margin-top: 4px; display: flex; align-items: center; justify-content: center; color: #4a3620; }
.es-slot .nm { font-size: 14px; line-height: 15px; color: #e6d3b8; }
.es-note { margin-top: 8px; font-size: 15px; opacity: 0.7; line-height: 16px; }
.es-foot { padding: 6px 16px 10px; font-size: 15px; opacity: 0.8; }
@media (max-width: 800px) { .es-body { grid-template-columns: 1fr; } }
`;
let styleEl = null;
function ensureStyle() {
  if (styleEl || typeof document === 'undefined') return;
  styleEl = document.createElement('style'); styleEl.id = 'ew2-style'; styleEl.textContent = CSS; document.head.appendChild(styleEl);
}
function paintThumb(el, id, profile, cat) {
  el.innerHTML = glyph(catGlyph(cat));
  thumbFor(id, profile, (url) => { if (url && el.isConnected) { el.style.backgroundImage = `url(${url})`; el.innerHTML = ''; } });
}

export class EmoteWheel {
  constructor(sys) {
    this.sys = sys; this.game = sys.game;
    this.pageIdx = 0; this.hover = -1; this.mx = 0; this.my = 0; this.openFlag = false;
    ensureStyle();
    const el = document.createElement('div'); el.className = 'ew2 hidden';
    el.innerHTML = '<div class="ew2-plate"></div><div class="ew2-tabs"></div><div class="ew2-page"></div><div class="ew2-center"><div class="pv"></div><div class="nm"></div><div class="sb"></div></div><div class="ew2-hint"></div>';
    (document.getElementById('ui') || document.body).appendChild(el);
    this.el = el; this.tabs = el.querySelector('.ew2-tabs'); this.pageEl = el.querySelector('.ew2-page');
    this.pv = el.querySelector('.pv'); this.nm = el.querySelector('.nm'); this.sb = el.querySelector('.sb'); this.hint = el.querySelector('.ew2-hint');
    this.slots = [];
  }
  get profile() { return this.game.profile; }
  ownedIds() { return EMOTES.filter((e) => isEmoteUnlocked(this.profile, e.id)).map((e) => e.id); }
  favs() { return DD.normFavs(this.profile.emoteFav, (id) => isEmoteUnlocked(this.profile, id) && !!EMOTE_BY_ID[id]); }
  build() { this.pages = DD.buildPages(this.ownedIds(), this.favs()); if (this.pageIdx >= this.pages.length) this.pageIdx = 0; }
  page() { return this.pages[this.pageIdx]; }
  slotCount(P) { return P.cat === 'fav' ? DD.SLOTS : P.ids.length; }

  open() {
    this.build(); this.openFlag = true; this.hover = -1; this.mx = 0; this.my = 0;
    this.el.classList.remove('hidden');
    this.renderPage();
    this.game.audio?.ui?.('ui_hover', 0.4);
  }
  close() {
    this.openFlag = false; this.el.classList.add('hidden');
    const P = this.page(), id = this.hover >= 0 ? P?.ids[this.hover] : null;
    return id ? EMOTE_BY_ID[id] || null : null;
  }
  renderPage() {
    const P = this.page(), n = this.slotCount(P);
    this.tabs.innerHTML = '';
    const seen = new Set();
    this.pages.forEach((p, i) => {
      if (seen.has(p.cat)) return; seen.add(p.cat);
      const d = document.createElement('div'); d.className = 'ew2-tab' + (p.cat === P.cat ? ' on' : '');
      d.innerHTML = glyph(catGlyph(p.cat)) + '<span>' + esc(catLabel(p.cat)) + '</span>'; this.tabs.appendChild(d);
    });
    this.pageEl.textContent = P.parts > 1 ? `${P.part + 1}/${P.parts}` : '';
    for (const s of this.slots) s.remove();
    this.slots = [];
    const favSet = new Set(this.favs());
    for (let i = 0; i < n; i++) {
      const id = P.ids[i], def = id ? EMOTE_BY_ID[id] : null, pos = DD.slotPos(i, n, 205);
      const d = document.createElement('div'); d.className = 'ew2-slot' + (def ? '' : ' empty');
      d.style.left = (300 + pos.x) + 'px'; d.style.top = (300 + pos.y) + 'px';
      d.innerHTML = `<span class="th"></span><span class="lb">${def ? esc(nameOf(def)) : esc(t('Empty slot'))}</span>${def && P.cat !== 'fav' && favSet.has(id) ? '<span class="fv">' + glyph('star') + '</span>' : ''}`;
      if (def) paintThumb(d.firstChild, id, this.profile, DD.catOf(id));
      else d.firstChild.innerHTML = glyph('cross');
      this.el.appendChild(d); this.slots.push(d);
    }
    this.hint.innerHTML = `<kbd>B</kbd> ${esc(t('MOUSE pick · release B play'))} &nbsp; ${esc(t('LEFT/RIGHT page'))} &nbsp; ${esc(t('UP favourite'))} &nbsp; ${esc(t('TAP B studio'))}`;
    this.paintHover();
  }
  paintHover() {
    const P = this.page(), id = this.hover >= 0 ? P.ids[this.hover] : null, def = id ? EMOTE_BY_ID[id] : null;
    this.slots.forEach((s, i) => s.classList.toggle('sel', i === this.hover));
    if (def) { this.nm.textContent = nameOf(def); this.sb.textContent = catLabel(DD.catOf(id)) + ' · ' + tag(def); paintThumb(this.pv, id, this.profile, DD.catOf(id)); }
    else { this.nm.textContent = t('EMOTES'); this.sb.textContent = catLabel(P.cat); this.pv.style.backgroundImage = ''; this.pv.innerHTML = glyph(catGlyph(P.cat)); }
  }
  turn(d) {
    this.pageIdx = DD.pageStep(this.pageIdx, d, this.pages.length);
    this.hover = -1; this.mx = 0; this.my = 0; this.renderPage();
    this.game.audio?.ui?.('ui_hover', 0.3);
  }
  favToggle() {
    const P = this.page(), id = this.hover >= 0 ? P.ids[this.hover] : null;
    if (!id) return;
    const f = DD.toggleFav(this.favs(), id);
    this.profile.emoteFav = f; try { saveProfile(this.profile); } catch { /* */ }
    this.build(); this.renderPage();
    this.game.audio?.ui?.('ui_confirm', 0.3);
  }
  update(input) {
    this.mx += input.mouseDX; this.my += input.mouseDY; input.mouseDX = 0; input.mouseDY = 0;
    const mag = Math.hypot(this.mx, this.my), P = this.page();
    if (mag > 25) {
      const i = DD.slotAt(this.mx, this.my, this.slotCount(P), 25);
      if (i >= 0 && i !== this.hover) { this.hover = i; this.paintHover(); this.game.audio?.ui?.('ui_hover', 0.25); }
      if (mag > 160) { this.mx *= 160 / mag; this.my *= 160 / mag; }
    }
    if (input.codePressed('ArrowLeft')) this.turn(-1);
    if (input.codePressed('ArrowRight')) this.turn(1);
    const w = input.consumeWheel ? input.consumeWheel() : 0;
    if (w) this.turn(Math.sign(w));
    if (input.codePressed('ArrowUp')) this.favToggle();
  }

  // ------------------------------------------------------------------ studio panel
  openStudio() {
    const g = this.game, ui = g.ui;
    if (!ui?.panel || !ui.openPanel) return;
    ensureStyle();
    const profile = this.profile;
    const box = ui.panel('emote-studio');
    const body = document.createElement('div'); body.className = 'cp-body es-body';
    const main = document.createElement('div'), side = document.createElement('div'); side.className = 'es-side';
    main.innerHTML = '<div class="es-tools"><input type="text" spellcheck="false"><span class="es-chips"></span></div><div class="es-grid"></div>';
    side.innerHTML = `<h4>${esc(t('Favourite slots'))}</h4><div class="es-slots"></div><div class="es-note">${esc(t('Drag an emote onto a slot, click a slot to clear it.'))}</div>`;
    body.append(main, side);
    const foot = document.createElement('div'); foot.className = 'es-foot';
    foot.innerHTML = `<kbd>DRAG</kbd> ${esc(t('DRAG TO SLOT'))} &nbsp; <kbd>2xCLICK</kbd> ${esc(t('Play (double click)'))} &nbsp; <kbd>ESC</kbd> ${esc(t('Close'))}`;
    box.append(ui.panelHead(t('Emote Studio')), body, foot);
    const input = main.querySelector('input'), chips = main.querySelector('.es-chips'), grid = main.querySelector('.es-grid'), slotsEl = side.querySelector('.es-slots');
    input.placeholder = t('Search emotes');
    let cat = 'all', armed = null;
    const catList = [['all', t('ALL')], ...DD.CATS.slice(1).map((c) => [c.id, t(c.en)])];
    const drawChips = () => { chips.innerHTML = ''; for (const [id, label] of catList) { const c = document.createElement('button'); c.type = 'button'; c.className = 'es-chip' + (id === cat ? ' on' : ''); c.textContent = label; c.onclick = () => { cat = id; drawChips(); drawGrid(); }; chips.appendChild(c); } };
    const setFavs = (f) => { profile.emoteFav = f; try { saveProfile(profile); } catch { /* */ } drawSlots(); };
    const drawSlots = () => {
      const f = this.favs(); slotsEl.innerHTML = '';
      f.forEach((id, i) => {
        const d = document.createElement('div'); d.className = 'es-slot' + (id ? ' full' : ''); d.dataset.i = i;
        d.innerHTML = `<span class="n">${i + 1}</span><span class="th"></span><span class="nm">${id ? esc(nameOf(EMOTE_BY_ID[id])) : ''}</span>`;
        if (id) paintThumb(d.querySelector('.th'), id, profile, DD.catOf(id)); else d.querySelector('.th').innerHTML = glyph('cross');
        d.ondragover = (e) => { e.preventDefault(); d.classList.add('over'); };
        d.ondragleave = () => d.classList.remove('over');
        d.ondrop = (e) => { e.preventDefault(); d.classList.remove('over'); const did = e.dataTransfer?.getData('text/plain'); if (did && EMOTE_BY_ID[did] && isEmoteUnlocked(profile, did)) setFavs(DD.setFav(this.favs(), did, i)); };
        d.onclick = () => { if (armed && isEmoteUnlocked(profile, armed)) { setFavs(DD.setFav(this.favs(), armed, i)); armed = null; drawGrid(); } else if (id) setFavs(DD.setFav(this.favs(), null, i)); };
        slotsEl.appendChild(d);
      });
    };
    const drawGrid = () => {
      let list = EMOTES.slice();
      if (cat !== 'all') list = list.filter((e) => DD.catOf(e.id) === cat);
      list = DD.searchEmotes(list, input.value, nameOf);
      grid.innerHTML = '';
      if (!list.length) { grid.innerHTML = `<div class="es-note">${esc(t('No emotes match.'))}</div>`; return; }
      for (const def of list) {
        const owned = isEmoteUnlocked(profile, def.id);
        const d = document.createElement('div'); d.className = 'es-tile' + (owned ? '' : ' locked') + (armed === def.id ? ' arm' : ''); d.draggable = owned;
        d.innerHTML = `<span class="tg">${esc(tag(def))}</span>${owned ? '' : '<span class="lk">' + glyph('lock') + '</span>'}<div class="th"></div><div class="nm">${esc(nameOf(def))}</div>`;
        paintThumb(d.querySelector('.th'), def.id, profile, DD.catOf(def.id));
        if (!owned) d.title = t('Locked') + (def.lock ? ': ' + t(def.lock) : '');
        else {
          d.ondragstart = (e) => { e.dataTransfer.setData('text/plain', def.id); e.dataTransfer.effectAllowed = 'copy'; };
          d.onclick = () => { armed = armed === def.id ? null : def.id; drawGrid(); };
          d.ondblclick = () => { ui.closePanel(); setTimeout(() => g.emotes?.play(def), 60); };
        }
        grid.appendChild(d);
      }
    };
    input.oninput = drawGrid;
    input.addEventListener('keydown', (e) => e.stopPropagation());
    drawChips(); drawGrid(); drawSlots();
    ui.openPanel(box);
    setTimeout(() => input.focus(), 30);
  }
  dispose() { this.el?.remove(); for (const s of this.slots) s.remove(); styleEl?.remove(); styleEl = null; }
}
WHEEL.make = (sys) => (typeof document === 'undefined' ? null : new EmoteWheel(sys));
