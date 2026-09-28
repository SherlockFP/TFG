// UI manager: main menu, host/join (lobby browser), character sheet, settings, mods,
// in-game pause / tab panel / chat / market / bounties / day summary / fired / sale screens.
// Every panel is a "CRT terminal" (same look as the Black Ops style monitor room in crtmenu.js), keyboard and
// gamepad navigable (arrows / D-pad move focus, Enter / A confirm, Esc / B back, LB / RB switch tabs).
// Full-screen reports (day summary, quota met, deplatformed) play one at a time; toasts wait while one is up.
import { el, escapeHtml, clamp } from '../core/util.js';
import { t, setLang, getLang } from '../core/i18n.js';
import { HUD, randomTip } from './hud.js';
import { iconHTML, typeFromName } from './icons.js';
import { listRuns, loadRun, deleteRun, saveSettings, saveProfile, DEFAULT_KEYS } from '../core/save.js';
import { SKILLS, SKILL_CAP, xpForLevel, rankOf, derivedStats, MARKET, armorDef, dailyBounties, bountyText } from '../game/progression.js';
import { ITEMS, RARITY } from '../game/items.js';
import { MOONS } from '../game/moons.js';
import { SUIT_COLORS, HATS } from '../models/avatar.js';
import { CREATURES } from '../game/creatures.js';
import { GAME_VERSION } from '../net/lobby.js';
import { renderAchievementsPanel } from '../game/achievements.js';
import { createServiceRecord } from './panels/record.js';
import { decorateSkills } from './panels/passivetree.js';
import { getCharPreview, peekCharPreview, CharPreview } from './charpreview.js';

const LOGO = `<div class="logo"><div class="logo-main">TFG</div><div class="logo-long">TOTALLY FUCKED GAME</div><div class="logo-fish">(( ◉ ))</div><div class="logo-sub">"Engagement is love."</div></div>`;
void LOGO; void dailyBounties;

// focusable controls inside a panel (keyboard / gamepad navigation)
const NAV_SEL = 'button:not(.disabled):not([disabled]), input:not([type=hidden]):not([type=file]):not([disabled]), select:not([disabled]), [tabindex="0"]';
// elements that play the hover blip
const HOVER_SEL = '.btn, .slot-card, .lobby-row, .chip, .swatch, .mod-row, .shop-card, .bounty-row, .rec-tab, .rec-btn, select, input[type=checkbox], input[type=range], [tabindex="0"]';
// tab strips LB / RB (or PageUp / PageDown) cycle through: our panels, the SERVICE RECORD panel, the mods screen
const TAB_SEL = '.tabs .btn, .rec-tabs .rec-tab, .tfgm-tabs .btn';

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.hud = new HUD(this.root);
    this.menuEl = el('div', { class: 'menu-root' });
    this.root.appendChild(this.menuEl);
    this.overlay = el('div', { class: 'overlay hidden' });
    this.root.appendChild(this.overlay);
    this.chatEl = el('div', { class: 'chat hidden' }, el('div', { class: 'chat-log' }), el('input', { class: 'chat-in hidden', maxlength: 200, placeholder: 'Say something... (Enter)' }));
    this.root.appendChild(this.chatEl);
    this.chatLog = this.chatEl.querySelector('.chat-log');
    this.chatIn = this.chatEl.querySelector('.chat-in');
    this.mgLayer = el('div', { class: 'mg-layer hidden' });
    this.root.appendChild(this.mgLayer);
    this.clickHint = el('div', { class: 'click-hint hidden' }, 'Click to resume');
    this.root.appendChild(this.clickHint);
    this.soundHint = el('div', { class: 'sound-hint hidden' }, '🔇 Sound is off - click anywhere to enable it');
    this.root.appendChild(this.soundHint);
    this.panelOpen = null;
    this.marketOpen = false;
    this.chatOpen = false;
    this.dialogEl = null;
    this.dialogResolve = null;
    this.cineQ = [];
    this.cineActive = null;
    this.padActive = false;
    // HUD toasts / big banners wait while a full-screen report is up (see HUD.toast)
    this.hud.gate = () => this.fullscreenOpen();
    this.chatIn.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = this.chatIn.value; this.chatIn.value = ''; this.closeChat(); if (v.trim()) this.app.game?.sendChat(v); }
      if (e.key === 'Escape') this.closeChat();
    });
    this.installNav();
    this.applyUiPrefs();
    // a new day never starts under an old report: landing flushes every queued / open full-screen report
    this.hud.onPhase = (ph) => { if (ph === 'landing' || ph === 'moon') this.clearCinematics(); };
  }

  sfx(n = 'ui_click', v = 0.5) { if (this.app.settings?.uiSounds === false) return; this.app.audio?.ui(n, v); }
  // root classes for UI preferences (reduce motion -> no CRT flicker / slide transitions; crosshair; tracker)
  applyUiPrefs() {
    const s = this.app.settings || {};
    this.root.classList.toggle('reduce-motion', !!s.reduceMotion);
    this.root.classList.toggle('no-cross', s.showCrosshair === false);
    this.root.classList.toggle('no-objectives', s.showObjectives === false);
    peekCharPreview()?.set({ reduceMotion: !!s.reduceMotion });
  }
  // quick CRT "channel switch" flicker on a panel (tab changes)
  flick(node) {
    if (!node || this.app.settings?.reduceMotion) return;
    node.classList.remove('flick'); void node.offsetWidth; node.classList.add('flick');
  }
  blocksInput() { return !!this.panelOpen || this.chatOpen || this.marketOpen || !!this.dialogEl; }

  // ---------------------------------------------------------------- generic helpers
  button(label, onClick, cls = '') {
    const b = el('button', { class: 'btn ' + cls, type: 'button' }, label);
    b.addEventListener('click', (e) => { e.stopPropagation(); if (b.classList.contains('disabled')) return; this.sfx('ui_click', 0.5); onClick?.(e); });
    return b;
  }
  backButton(onClick, label = t('BACK')) {
    const b = this.button(label, onClick, 'back');
    b.addEventListener('click', () => this.sfx('ui_hover', 0.3));
    b.dataset.back = '1';
    return b;
  }
  toast(text, kind) { this.hud.toast(text, kind); }
  systemMessage(text, kind = 'info') { this.chatMessage(null, text, false, kind); this.hud.toast(text, kind === 'signal' ? 'info' : kind); }
  chatMessage(name, text, self, kind) {
    this.chatEl.classList.remove('hidden');
    const line = el('div', { class: 'chat-line ' + (kind || '') + (self ? ' self' : '') }, name ? el('span', { class: 'cn' }, name + ': ') : null, text);
    this.chatLog.appendChild(line);
    while (this.chatLog.children.length > 40) this.chatLog.firstChild.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
    setTimeout(() => line.classList.add('old'), 9000);
  }
  openChat() {
    if (this.chatOpen) return;
    this.chatOpen = true;
    this.chatEl.classList.remove('hidden');
    this.chatEl.classList.add('open');
    this.chatIn.classList.remove('hidden');
    this.app.input.unlock();
    setTimeout(() => this.chatIn.focus(), 10);
  }
  closeChat() {
    this.chatOpen = false;
    this.chatEl.classList.remove('open');
    this.chatIn.classList.add('hidden');
    this.chatIn.blur();
    if (this.app.game && !this.panelOpen) this.app.input.lock();
  }
  minigameLayer() { return this.mgLayer; }
  setMinigameOpen(v) { this.mgLayer.classList.toggle('hidden', !v); if (!v) this.mgLayer.innerHTML = ''; }

  // ---------------------------------------------------------------- CRT panel building blocks
  panelHead(title, sub) {
    return el('div', { class: 'cp-head' },
      el('span', { class: 'cp-os' }, 'TFG OS //'),
      el('span', { class: 'menu-title' }, title),
      el('span', { class: 'cp-cursor' }, '█'),
      sub ? el('span', { class: 'cp-sub' }, sub) : null);
  }
  panelFoot(extra = []) {
    const pad = this.padActive;
    const keys = [[pad ? '✚' : '↑↓', t('SELECT')], [pad ? 'A' : 'ENTER', t('CONFIRM')], [pad ? 'B' : 'ESC', t('BACK')], ...extra];
    return el('div', { class: 'cp-foot' }, ...keys.map(([k, l]) => el('span', {}, el('kbd', {}, k), ' ' + l)));
  }
  panel(cls = '') { return el('div', { class: 'menu-frame crt-panel' + (cls ? ' ' + cls : '') }); }

  frame(title, ...children) {
    const f = this.panel();
    f.append(this.panelHead(title), el('div', { class: 'cp-body' }, ...children), this.panelFoot());
    this.menuEl.appendChild(f);
    return f;
  }
  focusFirst(scope, sel) {
    setTimeout(() => {
      if (!scope.isConnected || (document.activeElement && scope.contains(document.activeElement))) return;
      const target = (sel && scope.querySelector(sel)) || this.focusables(scope)[0];
      target?.focus?.({ preventScroll: true });
    }, 60);
  }

  // In-UI replacement for confirm()/prompt(): resolves with the button value, the input text, or null (Esc / B).
  dialog({ title, text, input, buttons }) {
    return new Promise((resolve) => {
      this.dialogResolve?.(null);
      const inp = input ? el('input', { type: input.type || 'text', maxlength: input.max || 32, placeholder: input.placeholder || '', class: 'dlg-in' }) : null;
      let box = null;
      const prevFocus = document.activeElement;
      const done = (v) => {
        if (this.dialogEl !== box) return;
        box.classList.add('out');
        const b = box;
        setTimeout(() => b.remove(), 160);
        this.dialogEl = null; this.dialogResolve = null;
        if (prevFocus?.isConnected) prevFocus.focus?.({ preventScroll: true });
        resolve(v);
      };
      const list = buttons || [{ label: t('OK'), value: true, primary: true }];
      const btns = list.map((b) => this.button(b.label, () => done(b.value === '$input' ? (inp ? inp.value : '') : b.value), (b.primary ? 'primary' : '') + (b.danger ? ' danger' : '')));
      box = el('div', { class: 'crt-dialog' + (this.app.game ? ' amber' : '') },
        el('div', { class: 'menu-frame crt-panel dlg' }, this.panelHead(title),
          el('div', { class: 'cp-body' }, text ? el('div', { class: 'dlg-text' }, text) : null, inp, el('div', { class: 'menu-row dlg-row' }, ...btns))));
      inp?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const p = list.find((b) => b.primary); done(p?.value === '$input' ? inp.value : p ? p.value : inp.value); } });
      this.dialogEl = box; this.dialogResolve = done;
      this.root.appendChild(box);
      this.sfx('ui_hover', 0.4);
      setTimeout(() => (inp || box.querySelector('.btn.primary') || btns[0])?.focus(), 40);
    });
  }
  confirmBox(title, text, okLabel = t('CONFIRM'), danger = false) {
    return this.dialog({ title, text, buttons: [{ label: t('CANCEL'), value: false }, { label: okLabel, value: true, primary: true, danger }] });
  }

  // ---------------------------------------------------------------- keyboard / gamepad navigation
  installNav() {
    this.root.addEventListener('mouseover', (e) => {
      const target = e.target?.closest?.(HOVER_SEL);
      if (!target || target === this.lastHover || target.closest('.hud')) return;
      this.lastHover = target;
      if (!target.classList.contains('disabled') && !target.classList.contains('locked')) this.sfx('ui_hover', 0.22);
    });
    window.addEventListener('keydown', (e) => this.onNavKey(e));
    // consistent feedback for form controls in every CRT panel (mods screen rows play their own)
    let rangeT = 0;
    const ctlSound = (e) => {
      const x = e.target;
      if (!x?.closest?.('.menu-frame, .rec') || x.closest('.mod-row, .tfgm-row')) return;
      if (x.type === 'checkbox' && e.type === 'change') this.sfx(x.checked ? 'ui_confirm' : 'ui_click', 0.3);
      else if (x.tagName === 'SELECT' && e.type === 'change') this.sfx('ui_hover', 0.3);
      else if (x.type === 'range' && e.type === 'input') { const now = performance.now(); if (now - rangeT > 70) { rangeT = now; this.sfx('ui_hover', 0.14); } }
    };
    this.root.addEventListener('change', ctlSound);
    this.root.addEventListener('input', ctlSound);
    window.addEventListener('gamepadconnected', () => {
      this.padActive = true;
      if (!this.padLoop) { this.padLoop = true; requestAnimationFrame(() => this.pollPad()); }
      this.toast(t('Gamepad connected'), 'info');
    });
  }
  // the BACK button of a menu screen (ours carry data-back; screens built elsewhere just say BACK)
  backOf(scope) {
    return scope.querySelector('[data-back]') || [...scope.querySelectorAll('.btn')].find((b) => b.textContent.trim() === t('BACK')) || null;
  }
  navScope() {
    if (this.dialogEl) return this.dialogEl;
    if (this.panelOpen) return this.overlay;
    if (!this.app.game && this.currentScreen && this.currentScreen !== 'title' && !this.menuEl.classList.contains('hidden')) return this.menuEl;
    return null;
  }
  focusables(scope) {
    return [...scope.querySelectorAll(NAV_SEL)].filter((b) => !b.classList.contains('disabled') && b.getClientRects().length > 0 && !b.closest('.hidden'));
  }
  focusEl(b) {
    if (!b) return;
    b.focus({ preventScroll: true });
    b.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    this.sfx('ui_hover', 0.25);
  }
  navMove(scope, dir) {
    const list = this.focusables(scope);
    if (!list.length) return;
    const a = document.activeElement;
    if (!a || !list.includes(a)) { this.focusEl(list[0]); return; }
    const r = a.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bestScore = Infinity;
    for (const b of list) {
      if (b === a) continue;
      const q = b.getBoundingClientRect();
      const bx = q.left + q.width / 2, by = q.top + q.height / 2;
      const dx = bx - cx, dy = by - cy;
      let score;
      if (dir === 'down' || dir === 'up') {
        const ahead = dir === 'down' ? q.top >= r.bottom - 4 || dy > r.height * 0.6 : q.bottom <= r.top + 4 || dy < -r.height * 0.6;
        if (!ahead) continue;
        // prefer controls in the same column (horizontal overlap), then the nearest centre
        const gap = Math.max(0, q.left - r.right, r.left - q.right);
        score = Math.abs(dy) + gap * 2 + Math.abs(dx) * 0.15;
      } else {
        const ahead = dir === 'right' ? dx > 4 : dx < -4;
        const sameRow = q.bottom > r.top + 2 && q.top < r.bottom - 2;
        if (!ahead || !sameRow) continue;
        score = Math.abs(dx) + Math.abs(dy) * 3;
      }
      if (score < bestScore) { bestScore = score; best = b; }
    }
    if (!best && (dir === 'down' || dir === 'up')) best = dir === 'down' ? list[0] : list[list.length - 1];
    if (best) this.focusEl(best);
  }
  cycleSelect(sel, dir) {
    const n = sel.options.length;
    if (!n) return;
    sel.selectedIndex = (sel.selectedIndex + dir + n) % n;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    this.sfx('ui_hover', 0.3);
  }
  switchTab(scope, dir) {
    const tabs = [...scope.querySelectorAll(TAB_SEL)].filter((b) => b.getClientRects().length > 0);
    if (tabs.length < 2) return;
    const i = Math.max(0, tabs.findIndex((b) => b.classList.contains('sel')));
    tabs[(i + dir + tabs.length) % tabs.length].click();
    this.sfx('ui_hover', 0.35);
    const newTabs = [...scope.querySelectorAll(TAB_SEL)];
    newTabs.find((b) => b.classList.contains('sel'))?.focus?.({ preventScroll: true });
  }
  onNavKey(e) {
    const scope = this.navScope();
    if (!scope || e.defaultPrevented) return;
    if (e.target?.closest?.('.chat, .terminal, .mg-layer')) return;
    const a = document.activeElement;
    const inScope = !!a && a !== document.body && scope.contains(a);
    const tag = a?.tagName, type = a?.type;
    const texty = (tag === 'INPUT' && !['checkbox', 'range', 'radio', 'button'].includes(type)) || tag === 'TEXTAREA';
    switch (e.key) {
      case 'Escape':
        if (this.dialogEl) { e.preventDefault(); e.stopImmediatePropagation(); this.dialogResolve?.(null); return; }
        if (scope === this.menuEl) { const b = this.backOf(scope); if (b) { e.preventDefault(); b.click(); } }
        return;
      case 'ArrowUp': case 'ArrowDown':
        e.preventDefault(); this.navMove(scope, e.key === 'ArrowUp' ? 'up' : 'down'); return;
      case 'ArrowLeft': case 'ArrowRight': {
        if (inScope && (texty || (tag === 'INPUT' && type === 'range'))) return;   // caret / slider
        e.preventDefault();
        if (inScope && tag === 'SELECT') { this.cycleSelect(a, e.key === 'ArrowLeft' ? -1 : 1); return; }
        this.navMove(scope, e.key === 'ArrowLeft' ? 'left' : 'right');
        return;
      }
      case 'Enter':
        if (!inScope || tag === 'BUTTON') return;
        if (texty) {
          if (this.dialogEl) return;
          const p = a.closest('.menu-row, .form-row')?.querySelector('.btn.primary');
          if (p) { e.preventDefault(); p.click(); }
          return;
        }
        if (tag === 'SELECT') { e.preventDefault(); this.cycleSelect(a, 1); return; }
        if (tag === 'INPUT' || a.getAttribute('tabindex') === '0') { e.preventDefault(); a.click(); }
        return;
      case ' ':
        if (inScope && tag === 'DIV' && a.getAttribute('tabindex') === '0') { e.preventDefault(); a.click(); }
        return;
      case 'PageUp': case 'PageDown':
        e.preventDefault(); this.switchTab(scope, e.key === 'PageUp' ? -1 : 1); return;
      default:
    }
  }
  pollPad() {
    const pads = navigator.getGamepads?.() || [];
    const pad = [...pads].find((p) => p && p.connected);
    if (!pad) { this.padLoop = false; return; }
    requestAnimationFrame(() => this.pollPad());
    const now = performance.now();
    const b = (i) => !!pad.buttons[i]?.pressed;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const held = {
      up: b(12) || ay < -0.55, down: b(13) || ay > 0.55, left: b(14) || ax < -0.55, right: b(15) || ax > 0.55,
      a: b(0), b: b(1), lb: b(4), rb: b(5), start: b(9),
    };
    const st = this.padState || (this.padState = {});
    for (const [k, on] of Object.entries(held)) {
      const s = st[k] || (st[k] = { on: false, next: 0 });
      const rep = ['up', 'down', 'left', 'right'].includes(k);
      if (on && !s.on) { s.next = now + 380; this.padAction(k); } else if (on && rep && now >= s.next) { s.next = now + 110; this.padAction(k); }
      s.on = on;
    }
  }
  padAction(act) {
    this.padActive = true;
    const g = this.app.game;
    const scope = this.navScope();
    if (!scope) {
      if (!g && this.currentScreen === 'title' && this.app.menu) { this.app.menu.padInput?.(act); return; }
      if (g && act === 'start' && !this.panelOpen && !g.minigame && !g.terminal?.active && !this.chatOpen) this.openPause();
      return;
    }
    const a = document.activeElement;
    const inScope = !!a && a !== document.body && scope.contains(a);
    switch (act) {
      case 'up': case 'down': this.navMove(scope, act); break;
      case 'left': case 'right': {
        const d = act === 'left' ? -1 : 1;
        if (inScope && a.tagName === 'SELECT') this.cycleSelect(a, d);
        else if (inScope && a.tagName === 'INPUT' && a.type === 'range') { if (d < 0) a.stepDown(); else a.stepUp(); a.dispatchEvent(new Event('input', { bubbles: true })); }
        else this.navMove(scope, act);
        break;
      }
      case 'a':
        if (!inScope) { this.navMove(scope, 'down'); break; }
        if (a.tagName === 'SELECT') this.cycleSelect(a, 1);
        else if (a.tagName === 'INPUT' && !['checkbox', 'radio'].includes(a.type)) a.select?.();
        else a.click();
        break;
      case 'b':
        if (this.dialogEl) this.dialogResolve?.(null);
        else if (scope === this.menuEl) this.backOf(scope)?.click();
        else if (this.panelOpen) this.closePanel();
        break;
      case 'lb': case 'rb': this.switchTab(scope, act === 'lb' ? -1 : 1); break;
      case 'start': if (this.panelOpen && g && !this.dialogEl) this.closePanel(); break;
      default:
    }
  }

  // ---------------------------------------------------------------- menu screens
  showMenu(screen = 'title', opts = {}) {
    this.cancelRebind?.();
    this.hud.show(false);
    this.menuEl.classList.remove('hidden');
    // CRT switch-off of the old screen (a ghost copy collapses while the new screen powers on)
    const old = this.menuEl.querySelector(':scope > .menu-frame');
    if (old && !this.app.settings?.reduceMotion && screen !== this.currentScreen) {
      const r = old.getBoundingClientRect();
      const ghost = old.cloneNode(true);
      ghost.classList.add('crt-ghost');
      Object.assign(ghost.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', margin: 0 });
      ghost.querySelectorAll('canvas').forEach((c) => c.remove());
      this.root.appendChild(ghost);
      setTimeout(() => ghost.remove(), 260);
    }
    this.menuEl.innerHTML = '';
    this.currentScreen = screen;
    this.menuOpts = opts;
    const labels = { host: t('HOST GAME'), browser: t('JOIN GAME'), character: t('CHARACTER'), mods: t('MODS'), settings: t('SETTINGS'), howto: t('HOW TO PLAY') };
    this.app.menu?.setMode?.(screen === 'title' ? 'title' : 'sub', labels[screen] || '');
    this.menuEl.classList.toggle('over-crt', screen !== 'title');
    const fn = this['screen_' + screen];
    if (fn) fn.call(this);
  }
  hideMenu() { this.menuEl.classList.add('hidden'); this.menuEl.innerHTML = ''; this.currentScreen = null; }

  screen_title() {
    // the menu itself lives on the big CRT in the 3D room (src/ui/crtmenu.js); DOM only adds a few corners
    const box = el('div', { class: 'title-screen crt' });
    box.appendChild(el('div', { class: 'version' }, 'TFG v' + GAME_VERSION + ' · three.js · WebRTC P2P'));
    box.appendChild(el('div', { class: 'crt-hint' }, t('Click an option on the screen · arrows + Enter')));
    const langBtn = this.button(getLang() === 'tr' ? 'EN' : 'TR', () => { this.app.settings.lang = getLang() === 'tr' ? 'en' : 'tr'; setLang(this.app.settings.lang); saveSettings(this.app.settings); this.app.menu?.setItems?.(); this.showMenu('title'); }, 'lang');
    box.appendChild(langBtn);
    this.menuEl.appendChild(box);
  }

  screen_host() {
    const s = this.app.settings;
    const p = this.app.profile;
    const maxAllowed = this.app.mods?.maxPlayersAllowed?.() || 4;
    const form = el('div', { class: 'form' });
    const name = el('input', { value: `${p.name}'s crew`, maxlength: 32 });
    const pub = el('input', { type: 'checkbox', checked: true });
    const pw = el('input', { type: 'text', maxlength: 24, placeholder: '—' });
    const max = el('select', {}, ...Array.from({ length: maxAllowed - 1 }, (_, i) => el('option', { value: i + 2, selected: i + 2 === Math.min(4, maxAllowed) }, String(i + 2))));
    const net = this.netSelect();
    form.append(
      el('div', { class: 'cp-sec' }, t('Crew settings')),
      row(t('Lobby name'), name), row(t('Public (listed in lobby browser)'), pub), row(t('Password (optional)'), pw),
      row(t('Max players'), max), row(t('Network'), net),
    );
    const slots = el('div', { class: 'slots' });
    let chosen = { slot: this.menuOpts?.slot || 1, data: null };
    const start = () => {
      s.netStrategy = net.value; saveSettings(s);
      this.app.hostGame({ lobbyName: name.value.trim() || 'Crew', isPublic: pub.checked, password: pw.value.trim(), maxPlayers: +max.value, strategy: net.value, slot: chosen.slot, runData: loadRun(chosen.slot) });
    };
    const renderSlots = () => {
      const focused = document.activeElement?.dataset?.slot;
      slots.innerHTML = '';
      for (const r of listRuns()) {
        const d = r.data;
        if (chosen.slot === r.slot) chosen.data = d;
        const card = el('div', { class: 'slot-card' + (chosen.slot === r.slot ? ' sel' : '') + (d ? '' : ' empty'), tabindex: 0, 'data-slot': r.slot });
        card.append(...[
          el('div', { class: 'slot-t' }, el('span', {}, `${t('Slot').toUpperCase()} ${r.slot}`), el('span', { class: 'slot-day' }, d ? `${t('Day').toUpperCase()} ${d.day}` : t('New run').toUpperCase())),
          d ? el('div', { class: 'slot-q' }, `${t('Quota')} #${(d.quotaIndex || 0) + 1} · ▮${d.sold}/${d.quota}`) : el('div', { class: 'slot-q dim' }, '— — —'),
          d ? el('div', { class: 'slot-c' }, `${t('Credits')} ▮${d.credits}`) : null,
          d ? el('div', { class: 'dim slot-crew' }, `${(d.crew || []).slice(0, 4).join(', ')}`) : null,
        ].filter(Boolean));
        card.addEventListener('click', () => { chosen = { slot: r.slot, data: d }; this.sfx(); renderSlots(); slots.querySelector(`[data-slot="${r.slot}"]`)?.focus({ preventScroll: true }); });
        card.addEventListener('dblclick', () => { chosen = { slot: r.slot, data: d }; start(); });
        if (d) {
          const del = this.button('✖', async () => {
            const ok = await this.confirmBox(t('Delete this save?'), `${t('Slot')} ${r.slot} · ${t('Day')} ${d.day}\n${t('This cannot be undone.')}`, t('Delete'), true);
            if (!ok) return;
            deleteRun(r.slot); if (chosen.slot === r.slot) chosen.data = null; renderSlots();
          }, 'small danger slot-del');
          del.title = t('Delete');
          card.appendChild(del);
        }
        slots.appendChild(card);
      }
      if (focused) slots.querySelector(`[data-slot="${focused}"]`)?.focus({ preventScroll: true });
    };
    renderSlots();
    const f = this.frame(t('HOST GAME'),
      el('div', { class: 'host-grid' }, form, el('div', { class: 'col' }, el('div', { class: 'cp-sec' }, t('Save slot')), slots)),
      el('div', { class: 'menu-row end' }, this.backButton(() => this.showMenu('title')), this.button(t('START') + ' ▶', start, 'primary big')));
    this.focusFirst(f, '.slot-card.sel');
  }

  netSelect() {
    const s = this.app.settings;
    return el('select', {},
      el('option', { value: 'nostr', selected: s.netStrategy === 'nostr' }, t('Online P2P (Nostr relays)')),
      el('option', { value: 'mqtt', selected: s.netStrategy === 'mqtt' }, t('Online P2P (MQTT brokers)')),
      el('option', { value: 'torrent', selected: s.netStrategy === 'torrent' }, t('Online P2P (BitTorrent trackers)')),
      el('option', { value: 'local', selected: s.netStrategy === 'local' }, t('Local (same PC, multiple tabs)')),
    );
  }

  async joinLobby(l, strategy) {
    let pass = '';
    if (l.locked) {
      pass = await this.dialog({ title: t('Lobby password'), text: t('This lobby is locked. Enter the password:'), input: { type: 'password', max: 24, placeholder: t('password') }, buttons: [{ label: t('CANCEL'), value: null }, { label: t('Join'), value: '$input', primary: true }] });
      if (pass === null) return;
    }
    const mine = this.app.mods.enabledIds();
    const missing = (l.mods || []).filter((m) => !mine.includes(m));
    if (missing.length && !(await this.confirmBox(t('Missing mods'), `${t('The host uses mods you do not have enabled:')}\n${missing.join('\n')}\n\n${t('Join anyway?')}`, t('Join')))) return;
    this.app.joinGame({ code: l.code, password: pass, strategy });
  }

  screen_browser() {
    const s = this.app.settings;
    const net = this.netSelect();
    const list = el('div', { class: 'lobby-list' });
    const status = el('div', { class: 'lb-status' });
    const code = el('input', { maxlength: 6, placeholder: 'ABC123', class: 'code-in', autocomplete: 'off', spellcheck: 'false' });
    code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    const pw = el('input', { placeholder: t('password'), maxlength: 24, class: 'pw-in' });
    const render = () => {
      const dir = this.app.lobbyDir;
      const lobbies = dir ? dir.list() : [];
      const focusedCode = document.activeElement?.dataset?.code;
      status.innerHTML = '';
      if (dir) status.append(el('i', { class: 'lb-dot ' + String(dir.status || '').toLowerCase() }), `${String(dir.status || '').toUpperCase()} · ${lobbies.length} ${t('lobbies')}`);
      list.innerHTML = '';
      list.appendChild(el('div', { class: 'lobby-row head' }, ...[t('Lobby'), t('Host'), t('Players'), t('Phase'), t('Quota'), t('Mods'), ''].map((h) => el('div', {}, h))));
      if (!lobbies.length) list.appendChild(el('div', { class: 'dim empty' }, t('No lobbies found yet. Host one, or ask a friend for their code.')));
      for (const l of lobbies) {
        const full = l.players >= l.max;
        const blocked = full || l.incompatible;
        const row_ = el('div', { class: 'lobby-row' + (l.incompatible ? ' bad' : '') + (full ? ' full' : ''), tabindex: blocked ? -1 : 0, 'data-code': l.code },
          el('div', { class: 'l-name' }, (l.locked ? '🔒 ' : '') + (l.name || '?')),
          el('div', { class: 'l-host' }, (l.host || '?') + ` · Lv.${l.level || 1}` + (l.stars ? ` ★${l.stars | 0}` : '') + (l.crew ? ` · [${String(l.crewTag || '').slice(0, 4)}] ${String(l.crew).slice(0, 24)} (C${l.crewLv | 0})` : '')),
          el('div', { class: 'l-pl' }, el('span', { class: 'l-bar' }, el('i', { style: { width: clamp((l.players / Math.max(1, l.max)) * 100, 0, 100) + '%' } })), ` ${l.players}/${l.max}`),
          el('div', { class: 'l-ph' }, `${String(l.phase || '').toUpperCase()} ${l.moon || ''}`),
          el('div', { class: 'l-q' }, `${t('Day')} ${l.day || 1} · ▮${l.quota || 0}`),
          el('div', { class: 'l-mods' }, (l.mods || []).length ? `${l.mods.length}` : '—'),
          this.button(full ? t('Full') : t('Join'), () => this.joinLobby(l, net.value), blocked ? 'small disabled' : 'small primary'),
        );
        if (!blocked) row_.addEventListener('click', () => this.joinLobby(l, net.value));
        list.appendChild(row_);
      }
      if (focusedCode) list.querySelector(`[data-code="${focusedCode}"]`)?.focus({ preventScroll: true });
    };
    const start = () => { this.app.startLobbyBrowser(net.value, render); };
    net.addEventListener('change', () => { s.netStrategy = net.value; saveSettings(s); start(); });
    const joinCode = () => {
      const c = code.value.trim().toUpperCase();
      if (c.length < 4) { this.toast(t('Enter a lobby code')); code.focus(); return; }
      this.app.joinGame({ code: c, password: pw.value.trim(), strategy: net.value });
    };
    this.frame(t('Lobby browser'),
      el('div', { class: 'menu-row lb-top' }, el('span', { class: 'lbl' }, t('Network')), net, status, this.button('⟳ ' + t('Refresh'), render, 'small')),
      list,
      el('div', { class: 'menu-row code-row' }, el('span', { class: 'lbl' }, t('Join by code')), code, pw, this.button(t('Join') + ' ▶', joinCode, 'primary')),
      el('div', { class: 'menu-row' }, this.backButton(() => { this.app.stopLobbyBrowser(); this.showMenu('title'); })),
    );
    start();
    render();
    this.focusFirst(this.menuEl, '.lobby-row[tabindex="0"], .code-in');
  }

  screen_character() {
    const p = this.characterPanel(false);
    this.menuEl.appendChild(p);
    this.focusFirst(p);
  }

  characterPanel(inGame) {
    const p = this.app.profile;
    const wrap = this.panel('wide char');
    const render = () => {
      const st = derivedStats(p);
      const focusKey = document.activeElement?.dataset?.nav;
      wrap.innerHTML = '';
      wrap.appendChild(this.panelHead(t('CHARACTER'), `Lv.${p.level} · ${rankOf(p.level)}`));
      const nameIn = el('input', { value: p.name, maxlength: 18 });
      nameIn.addEventListener('change', () => { p.name = nameIn.value.trim().slice(0, 18) || p.name; saveProfile(p); this.app.game?.net?.send('pinfo', this.app.game.helloData()); });
      const suits = el('div', { class: 'swatches' });
      for (const s of SUIT_COLORS) {
        const owned = p.cosmetics.suits.includes(s.id);
        const sw = el('div', { class: 'swatch' + (p.suit === s.id ? ' sel' : '') + (owned ? '' : ' locked'), title: s.name + (owned ? '' : ' (Black Market)'), style: { background: s.color }, tabindex: owned ? 0 : -1, 'data-nav': 'suit:' + s.id });
        sw.addEventListener('click', () => { if (!owned) return; p.suit = s.id; saveProfile(p); this.app.game?.viewModel?.setSuitColor?.(s.color); this.app.game?.net?.send('pinfo', this.app.game.helloData()); this.sfx(); render(); });
        suits.appendChild(sw);
      }
      const hats = el('div', { class: 'chips' });
      for (const h of HATS) {
        const owned = p.cosmetics.hats.includes(h.id);
        const c = el('div', { class: 'chip' + (p.hat === h.id ? ' sel' : '') + (owned ? '' : ' locked'), tabindex: owned ? 0 : -1, 'data-nav': 'hat:' + h.id }, h.name || h.id);
        c.addEventListener('click', () => { if (!owned) return; p.hat = h.id; saveProfile(p); this.app.game?.net?.send('pinfo', this.app.game.helloData()); this.sfx(); render(); });
        hats.appendChild(c);
      }
      // live 3D preview (suit / hat / name / title / emotes)
      const pv = getCharPreview();
      pv.set({ reduceMotion: !!this.app.settings?.reduceMotion });
      pv.follow(p);
      const modes = CharPreview.modes(p);
      if (!modes.includes(this.pvMode)) this.pvMode = 'idle';
      if (pv.mode !== this.pvMode) pv.play(this.pvMode);
      const cycle = (d) => { const i = modes.indexOf(this.pvMode); this.pvMode = modes[(i + d + modes.length) % modes.length]; pv.play(this.pvMode); modeLbl.textContent = CharPreview.modeLabel(this.pvMode); };
      const modeLbl = el('span', { class: 'cpv-mode' }, CharPreview.modeLabel(this.pvMode));
      const prevB = this.button('◀', () => cycle(-1), 'small'); prevB.dataset.nav = 'pv:prev'; prevB.title = t('Previous emote');
      const nextB = this.button('▶', () => cycle(1), 'small'); nextB.dataset.nav = 'pv:next'; nextB.title = t('Next emote');
      pv.controls.replaceChildren(prevB, modeLbl, nextB);
      pv.stage.dataset.nav = 'pv:stage';
      const left = el('div', { class: 'col' },
        pv.el,
        row(t('Name'), nameIn),
        el('div', { class: 'label' }, t('Suit')), suits,
        el('div', { class: 'label' }, t('Hat')), hats,
        el('div', { class: 'label' }, `Lv.${p.level} · ${rankOf(p.level)} · ${p.xp}/${xpForLevel(p.level)} XP`),
        el('div', { class: 'xpbar' }, el('div', { style: { width: (p.xp / xpForLevel(p.level) * 100) + '%' } })),
        el('div', { class: 'label clout' }, `◈ ${p.coins} Clout`),
      );
      // skills
      const skills = el('div', { class: 'skills' }, el('div', { class: 'label' }, `${t('Skills')} · ${t('Skill points')}: ${p.skillPoints}`));
      for (const [id, sk] of Object.entries(SKILLS)) {
        const v = p.skills[id] || 0;
        const plus = this.button('+', () => { if (this.app.game) this.app.game.progress.allocate(id); else if (p.skillPoints > 0 && v < SKILL_CAP) { p.skills[id] = v + 1; p.skillPoints--; saveProfile(p); } this.sfx('ui_confirm', 0.5); render(); }, 'small' + (p.skillPoints > 0 && v < SKILL_CAP ? '' : ' disabled'));
        plus.dataset.nav = 'sk:' + id;
        skills.appendChild(el('div', { class: 'skill-row', title: sk.desc }, el('span', { class: 'sk-name' }, `${sk.short}`), el('span', { class: 'sk-bar' }, el('span', { style: { width: (v / SKILL_CAP * 100) + '%' } })), el('span', { class: 'sk-v' }, String(v)), plus, el('span', { class: 'sk-desc' }, sk.desc)));
      }
      decorateSkills(skills, p, this);   // [rpg] legacy skill rows -> role + PASSIVE TREE [K] buttons (ui/panels/passivetree.js)
      const statsBox = el('div', { class: 'statbox' },
        el('div', {}, `HP ${st.maxHp} · Stamina ${st.maxStamina} · Armor ${Math.round(st.armor * 100)}%`),
        el('div', {}, `Melee ×${st.meleeMul.toFixed(2)} · Crit ${Math.round(st.crit * 100)}% · Speed ×${st.speedMul.toFixed(2)}`),
        el('div', {}, `Scan ${st.scanRange} m · Battery ×${st.batteryMul.toFixed(1)} · Carry relief ${st.carryRelief} lb`),
      );
      // loadout
      const lo = p.loadout;
      const loBox = el('div', { class: 'loadout' }, el('div', { class: 'label' }, t('Loadout') + ' (soulbound gear spawns with you on every landing)'));
      const selector = (slot, options, labelFn) => {
        const s = el('select', { 'data-nav': 'lo:' + slot }, el('option', { value: '' }, `— ${t('none')} —`), ...options.map((o) => el('option', { value: o, selected: lo[slot] === o }, labelFn(o))));
        s.addEventListener('change', () => { lo[slot] = s.value || null; saveProfile(p); this.app.game?.refreshStats(); render(); });
        return s;
      };
      const weapons = p.owned.filter((id) => ITEMS[id]?.kind === 'weapon');
      const heads = p.owned.filter((id) => armorDef(id)?.slot === 'head');
      const bodies = p.owned.filter((id) => armorDef(id)?.slot === 'body');
      const perks = p.owned.filter((id) => armorDef(id)?.slot === 'perk');
      const wIcon = lo.weapon && ITEMS[lo.weapon] ? el('span', { class: 'lo-ico', html: iconHTML(lo.weapon, 'lo-img') }) : null;
      loBox.append(row(t('Weapon'), el('div', { class: 'lo-w' }, wIcon, selector('weapon', weapons, (id) => ITEMS[id].name))), row(t('Head'), selector('head', heads, (id) => armorDef(id).name)), row(t('Body'), selector('body', bodies, (id) => armorDef(id).name)), row(t('Perk'), selector('perk', perks, (id) => armorDef(id).name)));
      const s = p.stats;
      const statsList = el('div', { class: 'dim' }, `Kills ${s.kills} · Deaths ${s.deaths} · Quotas ${s.quotasMet} · Days ${s.days} · Fish ${s.fish} · Arcade best ${s.bestArcade} · Bestiary ${Object.values(p.bestiary).filter((b) => b.seen).length}/${Object.keys(CREATURES).length}`);
      const right = el('div', { class: 'col' }, skills, statsBox, loBox, statsList);
      const body = el('div', { class: 'cp-body' }, el('div', { class: 'cols' }, left, right));
      const achBox = el('div', { class: 'ach-host' });
      renderAchievementsPanel(achBox, this.app.game, p);
      body.append(achBox);
      body.append(el('div', { class: 'menu-row' }, this.button(`${t('SERVICE RECORD [J]')} — ${t('Codex · Mastery · Rebirth · Weekly · Crew')}`, () => {
        if (this.app.game?.meta) { this.app.game.meta.open(); return; }
        const rec = createServiceRecord({ game: null, profile: p, onClose: () => { this.closePanel(); render(); } });
        this.openPanel(rec.el);
      }, 'primary')));
      body.append(el('div', { class: 'menu-row' }, inGame ? this.button(t('Close'), () => this.closePanel(), 'back') : this.backButton(() => this.showMenu('title'))));
      wrap.append(body, this.panelFoot());
      if (focusKey) wrap.querySelector(`[data-nav="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
    };
    render();
    return wrap;
  }

  screen_settings() {
    const p = this.settingsPanel(false);
    this.menuEl.appendChild(p);
    this.focusFirst(p, '.tabs .btn.sel');
  }

  settingsPanel(inGame) {
    const s = this.app.settings;
    const wrap = this.panel('wide settings');
    const TABS = ['Video', 'Audio', 'Voice', 'Controls', 'Gameplay'];
    let tab = TABS.includes(this.settingsTab) ? this.settingsTab : 'Video';
    const apply = () => { saveSettings(s); this.app.applySettings(); this.applyUiPrefs(); };
    const slider = (label, key, min, max, step, fmt = (v) => v) => {
      const cur = s[key] ?? min;
      const val = el('span', { class: 'val' }, String(fmt(cur)));
      const i = el('input', { type: 'range', min, max, step, value: cur });
      const paint = () => i.style.setProperty('--p', ((+i.value - min) / (max - min) * 100).toFixed(1) + '%');
      paint();
      i.addEventListener('input', () => { s[key] = +i.value; val.textContent = fmt(s[key]); paint(); apply(); });
      i.dataset.nav = 'set:' + key;
      return row(label, el('div', { class: 'slider' }, i, val));
    };
    // def: value used when the setting is missing from older saves
    const check = (label, key, note, def = false) => {
      const c = el('input', { type: 'checkbox', checked: s[key] === undefined ? def : !!s[key] });
      c.addEventListener('change', () => { s[key] = c.checked; apply(); });
      c.dataset.nav = 'set:' + key;
      const lab = el('label', {}, label, note ? el('span', { class: 'row-note' }, note) : null);
      return el('div', { class: 'form-row' }, lab, c);
    };
    const section = (txt) => el('div', { class: 'cp-sec' }, txt);
    const render = () => {
      this.cancelRebind?.();
      const focusKey = document.activeElement?.dataset?.nav;
      wrap.innerHTML = '';
      wrap.appendChild(this.panelHead(t('SETTINGS'), t(tab)));
      const tabs = el('div', { class: 'tabs' }, ...TABS.map((n) => { const b = this.button(t(n), () => { if (tab === n) return; tab = n; this.settingsTab = n; render(); this.flick(wrap); }, tab === n ? 'tab sel' : 'tab'); b.dataset.nav = 'tab:' + n; return b; }));
      const body = el('div', { class: 'form' });
      if (tab === 'Video') {
        const res = el('select', { 'data-nav': 'set:res' }, ...[240, 360, 480, 720, 1080].map((h) => el('option', { value: h, selected: s.renderHeight === h }, h + 'p' + (h === 360 ? ` (${t('default')})` : ''))));
        res.addEventListener('change', () => { s.renderHeight = +res.value; apply(); });
        const jit = el('select', { 'data-nav': 'set:jit' }, ...[['0', 'Off'], ['1', 'Normal'], ['2', 'Strong']].map(([v, n]) => el('option', { value: v, selected: String(s.vertexJitter) === v }, t(n))));
        jit.addEventListener('change', () => { s.vertexJitter = +jit.value; saveSettings(s); this.toast(t('Vertex jitter applies after reload.')); });
        body.append(section(t('Display')), row(t('Resolution (PSX)'), res), slider(t('Field of view'), 'fov', 55, 100, 1, (v) => v + '°'),
          section(t('Retro filter')), row(t('Vertex jitter') + ` (${t('reload')})`, jit), check(t('Dithering'), 'dither'), check(t('Outlines'), 'outlines'),
          section(t('Performance')), check(t('Show FPS'), 'showFps'));
      } else if (tab === 'Audio') {
        body.append(section(t('Volume')), slider(t('Master volume'), 'masterVolume', 0, 1, 0.05, pct), slider(t('Effects volume'), 'sfxVolume', 0, 1, 0.05, pct), slider(t('Music volume'), 'musicVolume', 0, 1, 0.05, pct), slider(t('Voice volume'), 'voiceVolume', 0, 1.5, 0.05, pct),
          check(t('Menu sounds'), 'uiSounds', null, true));
        const audio = this.app.audio;
        body.append(section(t('Output')));
        // output device (Chrome/Edge 110+: AudioContext.setSinkId)
        const out = el('select', { 'data-nav': 'set:out' }, el('option', { value: '' }, t('System default')));
        if (audio.canChooseOutput()) {
          navigator.mediaDevices?.enumerateDevices?.().then((ds) => {
            for (const d of ds) if (d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default') out.appendChild(el('option', { value: d.deviceId, selected: s.outputDevice === d.deviceId }, d.label || 'Output ' + (out.options.length)));
          }).catch(() => {});
          out.addEventListener('change', async () => { s.outputDevice = out.value; saveSettings(s); const ok = await audio.setOutputDevice(out.value); this.toast(ok ? t('Output device changed.') : t('Could not switch output device.')); audio.testSound(); });
          body.append(row(t('Output device'), out));
        } else body.append(el('div', { class: 'dim' }, t('Output device selection is not supported by this browser (use Chrome/Edge, or change the default device in Windows).')));
        const meter = el('div', { class: 'meter' }, el('div'));
        const state = el('span', { class: 'dim' });
        body.append(row(t('Test sound'), el('div', { class: 'slider' }, this.button('▶ ' + t('Test sound'), () => audio.testSound(), 'small'), meter, state)));
        const tick = () => {
          if (!meter.isConnected) return;
          meter.firstChild.style.width = Math.min(100, audio.outputLevel() * 400) + '%';
          state.textContent = 'engine: ' + audio.state();
          requestAnimationFrame(tick);
        };
        tick();
        body.append(el('div', { class: 'dim note' }, t('No sound? 1) Press Test sound and watch the bar. If the bar moves but you hear nothing, the sound is going to another device: pick your headphones above or in Windows sound settings. 2) Bluetooth headsets switch to "hands-free" when a mic is in use: choose "Headset (Hands-Free)" as output, or turn voice chat to listen-only.')));
      } else if (tab === 'Voice') {
        const mode = el('select', { 'data-nav': 'set:vmode' }, el('option', { value: 'open', selected: s.voiceMode === 'open' }, t('Open mic')), el('option', { value: 'ptt', selected: s.voiceMode === 'ptt' }, t('Push to talk') + ` [${prettyKey(s.keys.ptt)}]`));
        mode.addEventListener('change', () => { s.voiceMode = mode.value; apply(); });
        const dev = el('select', { 'data-nav': 'set:mic' }, el('option', { value: '' }, t('Default')));
        navigator.mediaDevices?.enumerateDevices?.().then((ds) => { for (const d of ds) if (d.kind === 'audioinput' && d.deviceId) dev.appendChild(el('option', { value: d.deviceId, selected: s.micDevice === d.deviceId }, d.label || 'Microphone')); }).catch(() => {});
        dev.addEventListener('change', () => { s.micDevice = dev.value; apply(); this.toast(t('Microphone changes apply to the next session.')); });
        const meter = el('div', { class: 'meter' }, el('div'));
        const g0 = this.app.game;
        const micBtn = g0 ? (g0.voice.enabled
          ? this.button(t('Turn microphone off'), () => { g0.voice.stopMic(); s.micConsent = 'no'; s.micEnabled = false; saveSettings(s); this.toast(t('Microphone off (listening only).')); render(); }, 'small')
          : this.button(t('Turn microphone on'), () => { s.micConsent = 'yes'; s.micEnabled = true; saveSettings(s); g0.enableMic().then(() => render()); }, 'small primary')) : null;
        const micState = el('span', { class: 'dim' }, g0 ? (g0.voice.enabled ? t('mic active') : g0.voice.micError ? t('mic error') + ': ' + g0.voice.micError : t('mic off')) : (s.micConsent === 'ask' ? t('you will be asked in game') : s.micConsent === 'yes' ? t('mic on') : t('listen only')));
        body.append(row(t('Microphone'), el('div', { class: 'slider' }, micBtn || el('span'), micState)), row(t('Voice mode'), mode), row(t('Device'), dev), slider(t('Mic gain'), 'micGain', 0.2, 3, 0.1, (v) => v.toFixed(1) + 'x'), row(t('Level'), meter),
          el('div', { class: 'dim note' }, t('Proximity voice chat: nearby crewmates hear you in 3D. Walls muffle. Hold a walkie-talkie (turned on) to talk across the map. Creatures like the Blind Hound can HEAR you talk.')));
        const g = this.app.game;
        const tick = () => { if (!meter.isConnected) return; meter.firstChild.style.width = ((g?.voice.localLevel || 0) * 100) + '%'; requestAnimationFrame(tick); };
        tick();
      } else if (tab === 'Controls') {
        body.append(section(t('Mouse')), slider(t('Mouse sensitivity'), 'sensitivity', 0.1, 3, 0.05, (v) => v.toFixed(2)), check(t('Invert Y'), 'invertY'));
        body.append(section(t('Key bindings')));
        const binds = el('div', { class: 'binds' });
        const used = {};
        for (const [a, c] of Object.entries(s.keys)) (used[c] = used[c] || []).push(a);
        for (const action of Object.keys(DEFAULT_KEYS)) {
          const code = s.keys[action];
          const clash = (used[code] || []).length > 1;
          const b = this.button(prettyKey(code), () => this.startRebind(action, b, () => { apply(); render(); }), 'small key' + (clash ? ' clash' : ''));
          b.dataset.nav = 'key:' + action;
          if (clash) b.title = t('Also used by') + ': ' + used[code].filter((x) => x !== action).map(actionName).join(', ');
          binds.appendChild(el('div', { class: 'bind-row' + (clash ? ' clash' : '') }, el('span', {}, actionName(action)), b));
        }
        body.append(binds, el('div', { class: 'menu-row' }, this.button(t('Reset keys'), () => { s.keys = { ...DEFAULT_KEYS }; apply(); render(); this.toast(t('Key bindings reset.')); }, 'small')));
        body.append(el('div', { class: 'dim note' }, t('Click a key, then press the new key (Esc cancels). A key that is already used swaps with the other action.')));
        body.append(el('div', { class: 'dim note' }, t('Also: 1-4 / wheel = slots · LMB use / grab · RMB scan · MMB ping · R reload · Esc menu · Gamepad: D-pad / A / B / LB-RB in menus')));
      } else if (tab === 'Gameplay') {
        const lang = el('select', { 'data-nav': 'set:lang' }, el('option', { value: 'en', selected: getLang() === 'en' }, 'English'), el('option', { value: 'tr', selected: getLang() === 'tr' }, 'Türkçe'));
        lang.addEventListener('change', () => {
          s.lang = lang.value; setLang(s.lang); saveSettings(s);
          this.app.menu?.setItems?.();
          if (!inGame) this.app.menu?.setMode?.('sub', t('SETTINGS'));
          render();
        });
        body.append(section(t('General')), row(t('Language'), lang),
          section(t('Comfort')),
          check(t('Reduce motion'), 'reduceMotion', t('less camera shake, bob and screen warp; calmer menus')),
          check(t('Head bob'), 'headBob', null, true),
          section(t('HUD')),
          check(t('Objective tracker'), 'showObjectives', null, true),
          check(t('Crosshair'), 'showCrosshair', null, true),
          check(t('Loading screen tips'), 'loadingTips', null, true));
      }
      const cp = el('div', { class: 'cp-body' }, tabs, body,
        el('div', { class: 'menu-row' }, inGame ? this.button(t('Close'), () => this.closePanel(), 'back') : this.backButton(() => this.showMenu('title'))));
      wrap.append(cp, this.panelFoot([['LB/RB', t('TAB')]]));
      if (focusKey) wrap.querySelector(`[data-nav="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
    };
    render();
    return wrap;
  }

  // Key rebinding: the next key press becomes the binding (Esc cancels). A key that is already bound to
  // another action swaps with it. Only one capture at a time; closing the panel / leaving cancels it.
  startRebind(action, btn, done) {
    this.cancelRebind?.();
    const s = this.app.settings;
    btn.textContent = t('press a key...');
    btn.classList.add('listening');
    let timer = 0;
    const cleanup = () => { window.removeEventListener('keydown', h, true); clearTimeout(timer); if (this.cancelRebind === cancel) this.cancelRebind = null; btn.classList.remove('listening'); };
    const cancel = () => { cleanup(); if (btn.isConnected) btn.textContent = prettyKey(s.keys[action]); };
    const h = (e) => {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      cleanup();
      if (e.code === 'Escape' || !e.code) { this.sfx('ui_click', 0.3); done(); return; }
      const prev = s.keys[action];
      const other = Object.keys(s.keys).find((a) => a !== action && s.keys[a] === e.code);
      if (other && prev) { s.keys[other] = prev; this.toast(`${actionName(other)} → ${prettyKey(prev)}`, 'info'); }
      s.keys[action] = e.code;
      this.sfx('ui_confirm', 0.4);
      done();
    };
    timer = setTimeout(cancel, 8000);
    this.cancelRebind = cancel;
    // deferred so the click / Enter that started the capture is not taken as the new key
    setTimeout(() => { if (this.cancelRebind === cancel) window.addEventListener('keydown', h, true); }, 0);
  }

  screen_mods() {
    if (this.app.mods?.buildScreen) { this.menuEl.appendChild(this.app.mods.buildScreen(this)); return; }   // TFG FEATURES + OPTIONAL MODS tabs (src/mods/modscreen.js)
    const mm = this.app.mods;
    const wrap = this.panel('wide mods');
    let filter = '';
    const search = el('input', { placeholder: t('Search mods...'), class: 'mod-search', maxlength: 40 });
    search.addEventListener('input', () => { filter = search.value.trim().toLowerCase(); renderList(); });
    const list = el('div', { class: 'mod-list' });
    const count = el('span', { class: 'cp-sub' });
    const renderList = () => {
      list.innerHTML = '';
      const all = mm.list().sort((a, b) => a.name.localeCompare(b.name));
      count.textContent = `${all.filter((d) => mm.isEnabled(d.id)).length}/${all.length} ${t('enabled')}`;
      for (const def of all) {
        if (filter && !`${def.name} ${def.description || ''} ${def.inspiredBy || ''}`.toLowerCase().includes(filter)) continue;
        const on = mm.isEnabled(def.id);
        const tog = el('input', { type: 'checkbox', checked: on });
        const rowEl = el('div', { class: 'mod-row' + (on ? ' on' : '') });
        tog.addEventListener('change', () => { mm.setEnabled(def.id, tog.checked); rowEl.classList.toggle('on', tog.checked); count.textContent = `${mm.list().filter((d) => mm.isEnabled(d.id)).length}/${mm.list().length} ${t('enabled')}`; this.sfx(tog.checked ? 'ui_confirm' : 'ui_click', 0.4); });
        const cfg = el('div', { class: 'mod-cfg' });
        const cur = mm.configFor(def.id);
        for (const [k, spec] of Object.entries(def.config || {})) {
          let input;
          if (spec.type === 'boolean') { input = el('input', { type: 'checkbox', checked: !!cur[k] }); input.addEventListener('change', () => mm.setConfig(def.id, k, input.checked)); }
          else if (spec.type === 'select') { input = el('select', {}, ...spec.options.map((o) => el('option', { value: o, selected: cur[k] === o }, o))); input.addEventListener('change', () => mm.setConfig(def.id, k, input.value)); }
          else { input = el('input', { type: 'number', value: cur[k], min: spec.min, max: spec.max, step: spec.step || 1, style: { width: '76px' } }); input.addEventListener('change', () => mm.setConfig(def.id, k, +input.value)); }
          cfg.appendChild(el('label', { class: 'cfg' }, (spec.label || k) + ' ', input));
        }
        rowEl.append(
          el('label', { class: 'mod-head' }, tog, el('span', { class: 'mod-name' }, def.name), el('span', { class: 'dim' }, ` v${def.version || '1.0'} · ${def.author || 'unknown'}${def.source === 'imported' ? ' · imported' : ''}${def.inspiredBy ? ' · ' + t('port of') + ' ' + def.inspiredBy : ''}`)),
          el('div', { class: 'mod-desc' }, def.description || ''),
          cfg,
        );
        list.appendChild(rowEl);
      }
    };
    const file = el('input', { type: 'file', accept: '.js,text/javascript', style: { display: 'none' } });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      const code = await f.text();
      file.value = '';
      if (!(await this.confirmBox(t('Import mod'), `"${f.name}"\n${t('Mods run code in your browser. Only import mods you trust.')}`, t('Import')))) return;
      mm.importMod(f.name, code);
      this.toast(t('Imported. Reload to activate.'));
    });
    wrap.append(this.panelHead(t('MODS')), el('div', { class: 'cp-body' },
      el('div', { class: 'menu-row mods-top' }, search, count),
      el('div', { class: 'dim' }, t('Changes apply after reload.') + ' ' + t('Mods are ports of popular Lethal Company mods, rebuilt for TFG. All players should enable the same mods.')),
      list,
      mm.errors.length ? el('div', { class: 'err' }, 'Errors: ' + mm.errors.join(' | ')) : null,
      file,
      el('div', { class: 'menu-row' },
        this.backButton(() => this.showMenu('title')),
        this.button(t('Import mod (.js)'), () => file.click()),
        this.button(t('Apply & reload'), () => location.reload(), 'primary')),
    ), this.panelFoot());
    renderList();
    this.menuEl.appendChild(wrap);
    this.focusFirst(wrap, '.mod-row input[type=checkbox]');
  }

  screen_howto() {
    const txt = `
<b>THE JOB</b><br>You work for TFG. Fly to moons, loot the abandoned facilities, bring scrap back to the ship and sell it at <b>0-Algorithm HQ</b> to meet the <b>profit quota</b> every 3 days. Miss it and you're fired.<br><br>
<b>THE SHIP</b><br>Use the <b>terminal</b> (MOONS, ROUTE, STORE, BUY, SCAN, BESTIARY, codes). Pull the <b>lever</b> to land or take off. The ship leaves at <b>midnight</b> — with or without you.<br><br>
<b>CONTROLS</b><br>WASD move · Shift sprint · Ctrl crouch · Space jump · E interact / pick up · LMB use / attack / grab big loot · RMB scan · MMB / P ping · G drop · Q throw · F flashlight · 1-4 slots · R reload · V push-to-talk · Z/X emotes · Enter chat · Tab character · Esc menu<br><br>
<b>SURVIVAL</b><br>Every creature has a rule. <i>Scan</i> them and read the BESTIARY. Sound matters: sprinting, horns and <b>your voice</b> attract things. Some exits are not what they seem.<br><br>
<b>PROGRESSION</b><br>You earn XP and <b>Clout</b> for securing scrap, kills, bounties, fishing and minigames. Level up to gain skill points (TAB). Buy soulbound weapons, armor, perks and cosmetics from <b>Phish Dayı</b>'s Black Market at HQ. Higher tier moons and later quotas are more dangerous — and more profitable.<br><br>
<b>MINIGAMES</b><br>Crack vault keypads, rewire fuse boxes, pick locks, fish at ponds and the HQ dock, play FLAPPY PHISH on the ship's arcade, and gamble your coins at the GACHA MACHINE.<br><br>
<b>MULTIPLAYER</b><br>Host a lobby (public or private with password) and friends can find it in the lobby browser or join with the 6-letter code. Everything is peer-to-peer; the host runs the world.`;
    const f = this.frame(t('HOW TO PLAY'), el('div', { class: 'howto', html: txt }), el('div', { class: 'menu-row' }, this.backButton(() => this.showMenu('title'))));
    this.focusFirst(f, '[data-back]');
  }

  // ---------------------------------------------------------------- in-game panels
  openPanel(content) {
    this.closePanel(true);
    this.panelOpen = content;
    this.overlay.innerHTML = '';
    this.overlay.appendChild(content);
    this.overlay.classList.remove('hidden');
    this.app.input.unlock();
    if (this.padActive) this.focusFirst(content);
  }
  closePanel(silent) {
    this.cancelRebind?.();
    if (!this.panelOpen) return;
    this.dialogResolve?.(null);
    this.panelOpen = null;
    this.marketOpen = false;
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
    if (!silent && this.app.game && !this.app.game.player.dead) this.app.input.lock();
  }

  // First-time voice chat consent (the click is also the user gesture getUserMedia needs)
  askVoice(game) {
    if (this.panelOpen || game.minigame || game.terminal.active || this.fullscreenOpen()) { setTimeout(() => this.askVoice(game), 3000); return; }
    const s = this.app.settings;
    const choose = (consent, mode) => {
      s.micConsent = consent;
      s.micEnabled = consent === 'yes';
      if (mode) s.voiceMode = mode;
      saveSettings(s);
      this.closePanel();
      if (consent === 'yes') game.enableMic();
      else this.toast('Voice chat: listening only. You can change this in Settings > Voice.');
    };
    const box = this.panel('voice');
    box.append(this.panelHead('🎙 VOICE CHAT'), el('div', { class: 'cp-body' },
      el('div', { class: 'howto', html: `Talk to your crew with <b>proximity voice chat</b> - nearby crewmates hear you in 3D, walls muffle you, your avatar's mouth moves.<br><br><span class="dim">Using <b>Bluetooth headphones</b>? Turning the mic on can switch them to low-quality "hands-free" mode and some systems go silent. If you lose sound, pick the headset in Settings > Audio > Output device, use a separate mic, or choose "listen only".</span>` }),
      el('div', { class: 'menu-list' },
        this.button('Enable mic (open mic)', () => choose('yes', 'open'), 'big'),
        this.button('Enable mic (push-to-talk: V)', () => choose('yes', 'ptt')),
        this.button('Listen only (no mic)', () => choose('no')),
      )), this.panelFoot());
    this.openPanel(box);
  }

  openPause() {
    const g = this.app.game;
    const code = g?.net?.code || '';
    const box = this.panel('pause');
    box.append(this.panelHead(t('PAUSED')), el('div', { class: 'cp-body' },
      el('div', { class: 'pause-info' },
        el('span', {}, `${t('Lobby code')}: `, el('b', { class: 'pause-code' }, code)),
        el('span', { class: 'dim' }, `${g?.isHost ? t('You are the host') : t('Connected')} · ${1 + (g?.remotes.size || 0)} ${t('player(s)')}`)),
      el('div', { class: 'menu-list' },
        this.button(t('Resume'), () => this.closePanel(), 'big'),
        this.button(t('Copy invite code'), () => { navigator.clipboard?.writeText(code); this.toast(`${t('Copied')}: ${code}`); }),
        this.button(t('CHARACTER'), () => this.openPanel(this.characterPanel(true))),
        this.button(t('SETTINGS'), () => this.openPanel(this.settingsPanel(true))),
        this.button(t('Leave game'), async () => { if (await this.confirmBox(t('Leave the game?'), t('Unsaved progress from today is lost.'), t('Leave game'), true)) this.app.leaveGame(); }, 'danger'),
      )), this.panelFoot());
    this.openPanel(box);
    this.focusFirst(box, '.btn.big');
  }

  openTab() {
    const g = this.app.game;
    if (!g) return;
    const party = el('div', { class: 'party' });
    const line = (name, lvl, hp, dead, you) => el('div', { class: 'party-row' + (dead ? ' dead' : '') + (you ? ' you' : '') }, el('span', {}, (you ? '▶ ' : '') + name), el('span', {}, 'Lv.' + lvl), el('span', {}, dead ? 'DECEASED' : Math.round(hp) + ' HP'));
    party.appendChild(line(g.profile.name, g.profile.level, g.player.hp, g.player.dead, true));
    for (const r of g.remotes.values()) party.appendChild(line(r.name, r.level, r.hp ?? 100, r.dead));
    const run = g.run || {};
    const info = el('div', { class: 'dim' }, `Quota ▮${run.sold}/${run.quota} · ${run.daysLeft} days left · Credits ▮${run.credits} · Moon: ${MOONS[run.moon]?.name}`);
    const char = this.characterPanel(true);
    char.insertBefore(el('div', { class: 'crew-box' }, el('div', { class: 'label' }, t('CREW')), party, info), char.children[1]);
    this.openPanel(char);
  }

  openMarket(game) {
    const p = game.profile;
    let tab = this.marketTab || 'Weapons';
    const wrap = this.panel('wide market');
    const render = () => {
      wrap.innerHTML = '';
      wrap.appendChild(this.panelHead(`${t('Black Market')} — Phish Dayı`, `◈ ${p.coins} · Lv.${p.level}`));
      const body = el('div', { class: 'cp-body' });
      body.appendChild(el('div', { class: 'dim' }, `"Ooo, hoş geldin evlat! Good stuff, fair prices... mostly." · You have ◈ ${p.coins} · Lv.${p.level}`));
      body.appendChild(el('div', { class: 'tabs' }, ...['Weapons', 'Armor', 'Perks', 'Cosmetics'].map((n) => this.button(t(n), () => { tab = n; this.marketTab = n; render(); }, tab === n ? 'tab sel' : 'tab'))));
      const grid = el('div', { class: 'shop-grid' });
      const card = (name, rarity, desc, price, minLevel, owned, equipped, onBuy, onEquip, iconType) => {
        const r = RARITY[rarity] || RARITY.common;
        const locked = p.level < (minLevel || 1);
        return el('div', { class: 'shop-card' + (locked ? ' lvl-locked' : ''), style: { borderColor: r.color } },
          el('div', { class: 'sc-top' }, iconType ? el('div', { class: 'sc-ico', html: iconHTML(iconType, 'sc-img') }) : null,
            el('div', {}, el('div', { class: 'sc-name', style: { color: r.color } }, name), el('div', { class: 'sc-rar' }, r.name + (minLevel > 1 ? ` · Lv.${minLevel}+` : '')))),
          el('div', { class: 'sc-desc' }, desc),
          owned ? (onEquip ? this.button(equipped ? t('Equipped') : t('Equip'), onEquip, equipped ? 'small disabled' : 'small') : el('div', { class: 'dim' }, t('Owned')))
            : this.button(`◈ ${price}`, onBuy, 'small' + (locked || p.coins < price ? ' disabled' : ' primary')),
        );
      };
      const buy = (price, fn) => () => {
        if (!game.progress.spendCoins(price)) { this.sfx('ui_error'); return; }
        fn(); saveProfile(p); game.audio.ui('ui_buy', 0.7); render();
      };
      if (tab === 'Weapons') {
        for (const w of MARKET.weapons) {
          const d = ITEMS[w.id];
          if (!d) continue;
          grid.appendChild(card(d.name, d.rarity, `DMG ${d.dmg} · ${d.ranged ? 'Ranged' : 'Melee'} · reach ${d.reach}m${d.stun ? ' · stuns' : ''}${d.hands === 2 ? ' · two-handed' : ''}`, w.coin, w.minLevel, p.owned.includes(w.id), p.loadout.weapon === w.id,
            buy(w.coin, () => { p.owned.push(w.id); p.loadout.weapon = w.id; }), () => { p.loadout.weapon = w.id; saveProfile(p); render(); }, w.id));
        }
      } else if (tab === 'Armor' || tab === 'Perks') {
        const list = tab === 'Armor' ? MARKET.armor : MARKET.perks;
        for (const a of list) {
          const desc = a.desc || `${a.slot.toUpperCase()} · ${Math.round((a.armor || 0) * 100)}% damage reduction${a.hp ? ` · +${a.hp} HP` : ''}${a.speed ? ` · +${a.speed * 100}% speed` : ''}`;
          grid.appendChild(card(a.name, a.rarity, desc, a.coin, a.minLevel, p.owned.includes(a.id), p.loadout[a.slot] === a.id,
            buy(a.coin, () => { p.owned.push(a.id); p.loadout[a.slot] = a.id; game.refreshStats(); }), () => { p.loadout[a.slot] = a.id; saveProfile(p); game.refreshStats(); render(); }, ITEMS[a.id] ? a.id : null));
        }
      } else {
        for (const c of MARKET.cosmetics) {
          const [kind, id] = c.id.split(':');
          const owned = kind === 'suit' ? p.cosmetics.suits.includes(id) : p.cosmetics.hats.includes(id);
          const meta = kind === 'suit' ? SUIT_COLORS.find((s) => s.id === id) : HATS.find((h) => h.id === id);
          if (!meta) continue;
          const nm = (kind === 'suit' ? 'Suit: ' : 'Hat: ') + (meta.name || id);
          grid.appendChild(card(nm, c.coin > 1000 ? 'legendary' : c.coin > 300 ? 'epic' : c.coin > 120 ? 'rare' : 'uncommon', kind === 'suit' ? 'A fresh coverall.' : 'Headwear. Fashion is survival.', c.coin, c.minLevel, owned, false,
            buy(c.coin, () => { if (kind === 'suit') p.cosmetics.suits.push(id); else p.cosmetics.hats.push(id); }), null));
        }
      }
      body.appendChild(grid);
      body.appendChild(el('div', { class: 'menu-row' }, this.button(t('Close'), () => this.closePanel(), 'back')));
      wrap.append(body, this.panelFoot([['LB/RB', t('TAB')]]));
    };
    render();
    this.openPanel(wrap);
    this.marketOpen = true;
    game.audio.play('market_greet', { volume: 0.8 });
  }

  openBounties(game) {
    const prog = game.progress;
    const wrap = this.panel('wide bounties');
    const render = () => {
      const board = prog.refreshBounties();
      const p = game.profile;
      wrap.innerHTML = '';
      wrap.appendChild(this.panelHead(t('Bounty board')));
      const body = el('div', { class: 'cp-body' }, el('div', { class: 'dim' }, 'Daily contracts. Accept up to 3. Progress is personal. Claim rewards here.'));
      const list = el('div', { class: 'bounty-list' });
      const extra = (p.bounties || []).filter((x) => !board.some((b) => b.id === x.id));
      for (const b of [...extra, ...board]) {
        const active = p.bounties.find((x) => x.id === b.id);
        const status = active ? (active.done ? this.button(t('Claim'), () => { prog.claim(active); render(); }, 'small primary') : el('span', { class: 'dim' }, `${active.progress}/${active.n}`)) : b.accepted ? el('span', { class: 'dim' }, '✔') : this.button(t('Accept'), () => { if (!prog.accept(b)) this.toast('You can only hold 3 bounties.'); render(); }, 'small');
        list.appendChild(el('div', { class: 'bounty-row' + (active ? ' active' : '') + (active?.done ? ' done' : '') }, el('span', {}, bountyText(b)), el('span', { class: 'b-rew' }, `+${b.xp} XP · ◈${b.coin}`), status));
      }
      body.appendChild(list);
      body.appendChild(el('div', { class: 'menu-row' }, this.button(t('Close'), () => this.closePanel(), 'back')));
      wrap.append(body, this.panelFoot());
    };
    render();
    this.openPanel(wrap);
  }

  // ---------------------------------------------------------------- full-screen reports (queued, never overlapping)
  fullscreenOpen() {
    if (!this.app.game) return false;
    if (this.cineActive) return true;
    const l = document.getElementById('loading');
    return !!l && !l.classList.contains('hidden');
  }
  playCinematic(kind, run) {
    this.cineQ.push({ kind, run });
    if (!this.cineActive) this.nextCinematic();
  }
  // Drop every queued / playing full-screen report right now (a new landing started, the game ended...).
  clearCinematics() {
    if (!this.cineActive && !this.cineQ.length) return;
    this.cineQ.length = 0;
    this.cineGen = (this.cineGen || 0) + 1;       // stale done() callbacks of the old cinematic are ignored
    clearTimeout(this.cineGuard);
    this.cineActive = null;
    this.root.classList.remove('cine-open');
    for (const x of this.root.querySelectorAll(':scope > .report, :scope > .quotamet, :scope > .fired')) { x.classList.add('out'); setTimeout(() => x.remove(), 500); }
  }
  nextCinematic() {
    clearTimeout(this.cineGuard);
    if (!this.app.game) { this.cineQ.length = 0; this.cineActive = null; this.root.classList.remove('cine-open'); return; }
    const c = this.cineQ.shift();
    this.cineActive = c ? c.kind : null;
    this.root.classList.toggle('cine-open', !!c);
    if (!c) return;
    let finished = false;
    const gen = this.cineGen || 0;
    const done = () => { if (finished || gen !== (this.cineGen || 0)) return; finished = true; this.nextCinematic(); };
    this.cineGuard = setTimeout(done, 20000);   // safety net: never block the queue forever
    try { c.run(done); } catch (e) { console.warn('[ui] cinematic', c.kind, e); done(); }
  }

  showDaySummary(d, game) {
    const extra = [];
    game.mods?.emit('daySummary', d, extra, game);
    if (!d.company) game.profile.stats.days += 1;
    this.playCinematic('report', (done) => this.renderDaySummary(d, game, extra, done));
  }
  renderDaySummary(d, game, extra, done) {
    document.querySelectorAll('.report').forEach((x) => x.remove());
    const players = d.players || [];
    const deaths = d.deaths || [];
    const nP = Math.max(1, players.length);
    const avail = (d.collected || 0) + (d.leftValue || 0);
    const ratio = avail > 0 ? (d.collected || 0) / avail : 0;
    const score = d.allDead ? -1 : ratio * 100 - (deaths.length / nP) * 40;
    const grade = d.company ? null : score >= 70 ? 'S' : score >= 50 ? 'A' : score >= 35 ? 'B' : score >= 20 ? 'C' : score >= 8 ? 'D' : 'F';
    const GRADE_COL = { S: '#ffd84a', A: '#7dffa0', B: '#7fd4ff', C: '#e8e0d0', D: '#ff9a4a', F: '#ff4a3a' };
    const GRADE_QUIP = { S: 'The Algorithm is aroused.', A: 'Solid content. Engagement up.', B: 'Mid. Acceptable mid.', C: 'Ratioed by a moon.',
      D: 'Your metrics are being reviewed.', F: 'Shadowbanned by reality.' };
    // crew badges
    const badges = new Map(players.map((p) => [p.id, []]));
    const top = players.reduce((m, p) => (p.loot > (m?.loot || 0) ? p : m), null);
    if (top) badges.get(top.id).push(['MVP', '#ffd84a']);
    const slayer = players.reduce((m, p) => (p.kills > (m?.kills || 0) ? p : m), null);
    if (slayer) badges.get(slayer.id).push(['SLAYER', '#ff7a5a']);
    const first = deaths[0];
    if (first && badges.has(first.id)) badges.get(first.id).push([first.cause === 'left' ? 'LEFT BEHIND' : 'DIED FIRST', '#ff4a3a']);
    for (const p of players) if (!p.dead && !p.loot && !d.company && players.length > 1) badges.get(p.id).push(['SHIP GUARD', '#9a9aa8']);
    const crew = players.map((p) => `<div class="rp-crew${p.dead ? ' dead' : ''}"><span class="rp-name">${p.dead ? '✖ ' : ''}${escapeHtml(p.name)}</span>`
      + `<span class="rp-badges">${badges.get(p.id).map(([b, c]) => `<i style="--c:${c}">${b}</i>`).join('')}</span>`
      + `<span class="rp-stat">▮${p.loot || 0} · ${p.kills || 0} kills</span></div>`).join('');
    const rows = [
      [t('Scrap collected'), d.collected, '▮', avail > 0 ? `${Math.round(ratio * 100)}% of moon` : ''],
      [t('On board'), d.shipValue, '▮', ''],
      [t('Creatures killed'), d.kills, '', ''],
      [t('Casualties'), deaths.length, '', deaths.length ? deaths.map((x) => escapeHtml(x.name)).join(', ') : 'none'],
      [t('Fines'), d.fines, '-▮', ''],
    ];
    const box = el('div', { class: 'report', html: `
      <div class="rp-head"><span>${t('PERFORMANCE REPORT')}</span><span>${escapeHtml(d.moon)} · ${t('Day').toUpperCase()} ${d.day}</span></div>
      ${d.allDead ? `<div class="rp-bad">ALL CREW LOST. Scrap on board was lost.</div>` : ''}
      <div class="rp-rows">${rows.map(([l, v, pre, note], i) => `<div class="rp-row" style="--i:${i}"><span>${l}</span><span class="rp-note">${note}</span><b data-v="${Number(v) || 0}" data-pre="${pre}">${pre}0</b></div>`).join('')}</div>
      ${crew ? `<div class="rp-crewlist" style="--i:${rows.length}">${crew}</div>` : ''}
      ${extra.map((x) => `<div class="sum-extra">${x}</div>`).join('')}
      <div class="rp-foot"><span>${t('QUOTA')} ▮${d.sold} / ▮${d.quota}</span><span>${d.daysLeft} ${t('DAYS LEFT')}</span></div>
      ${grade ? `<div class="rp-grade" style="--gc:${GRADE_COL[grade]}"><div class="rp-letter">${grade}</div><div class="rp-quip">${GRADE_QUIP[grade]}</div></div>` : ''}` });
    this.root.appendChild(box);
    // count-up rows, then slam the grade stamp
    box.querySelectorAll('.rp-row b').forEach((b, i) => {
      const v = +b.dataset.v || 0, pre = b.dataset.pre;
      setTimeout(() => {
        const t0 = performance.now(), dur = v ? 650 : 1;
        game.sfx?.('ui_hover', 0.35);
        const step = (now) => {
          const k = Math.min(1, (now - t0) / dur);
          b.textContent = pre + Math.round(v * (1 - Math.pow(1 - k, 3))).toLocaleString('en-US');
          if (k < 1 && box.isConnected) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }, 500 + i * 420);
    });
    const gradeAt = 500 + rows.length * 420 + 700;
    if (grade) setTimeout(() => {
      box.classList.add('graded');
      game.sfx?.(grade === 'S' || grade === 'A' ? 'ui_quota_met' : grade === 'F' ? 'death_sting' : 'stun_bang', 0.55);
      game.engine?.shake?.(grade === 'F' ? 0.5 : 0.25);
    }, gradeAt);
    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      box.classList.add('out');
      setTimeout(() => { box.remove(); done(); }, 800);
    };
    // something else is waiting (quota met / deplatformed): leave a little earlier
    setTimeout(() => { if (this.cineQ.length) finish(); }, gradeAt + 2600);
    setTimeout(finish, 13000);
  }

  showFired(d, game) { this.playCinematic('fired', (done) => this.renderFired(d, game, done)); }
  renderFired(d, game, done) {
    document.querySelectorAll('.fired').forEach((x) => x.remove());
    const lines = [
      '> reviewing creator metrics...',
      `> profit quota ........ ▮${d.sold} / ▮${d.quota}   [FAILED]`,
      `> days survived ....... ${d.days}`,
      `> quotas met .......... ${d.quotaIndex}`,
      '> community guidelines  VIOLATED (being bad at your job)',
      '> action .............. PERMANENT SUSPENSION',
    ];
    const box = el('div', { class: 'fired', html: `<div class="f-term"></div><div class="f-main" data-t="DEPLATFORMED">DEPLATFORMED</div>
      <div class="f-sub">The Algorithm thanks you for your service.<br><span>Your level, skills and Clout were kept. The run starts over.</span></div>` });
    this.root.appendChild(box);
    const term = box.querySelector('.f-term');
    lines.forEach((ln, i) => setTimeout(() => {
      const row_ = el('div', { class: 'f-line' + (ln.includes('FAILED') || ln.includes('SUSPENSION') ? ' bad' : '') }, ln);
      term.appendChild(row_);
      game.sfx?.('terminal_enter', 0.3);
    }, 300 + i * 520));
    setTimeout(() => { box.classList.add('stamped'); game.sfx?.('stun_bang', 0.7); game.engine?.shake?.(0.7); game.engine?.flash?.(0xff2010, 0.5); }, 300 + lines.length * 520 + 300);
    setTimeout(() => box.classList.add('out'), 9800);
    setTimeout(() => { box.remove(); done(); }, 10600);
  }

  showQuotaMet(d, game) { this.playCinematic('quotamet', (done) => this.renderQuotaMet(d, game, done)); }
  renderQuotaMet(d, game, done) {
    document.querySelectorAll('.quotamet').forEach((x) => x.remove());
    const box = el('div', { class: 'quotamet', html: `<div class="qm-main">${t('QUOTA MET')}</div>
      <div class="qm-sub">Quota #${d.quotaIndex} cleared${d.surplus > 0 ? ` · surplus ▮${d.surplus}` : ''}</div>
      <div class="qm-rows"><div><span>${t('OVERTIME BONUS')}</span><b>+▮${d.bonus}</b></div><div><span>${t('NEXT QUOTA')}</span><b class="qm-next">▮${d.prev}</b></div><div><span>${t('DEADLINE')}</span><b>3 ${t('DAYS')}</b></div></div>
      <div class="qm-tag">${t('The Algorithm is pleased. For now.')}</div>` });
    for (let i = 0; i < 70; i++) {
      const c = el('i', { class: 'qm-conf' });
      c.style.cssText = `left:${Math.random() * 100}%;background:hsl(${Math.random() * 360},90%,60%);animation-delay:${Math.random() * 0.8}s;animation-duration:${2.2 + Math.random() * 2}s;--dx:${(Math.random() - 0.5) * 200}px;--r:${Math.random() * 900}deg`;
      box.appendChild(c);
    }
    this.root.appendChild(box);
    const next = box.querySelector('.qm-next');
    setTimeout(() => {
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 1400);
        next.textContent = '▮' + Math.round(d.prev + (d.quota - d.prev) * (1 - Math.pow(1 - k, 3)));
        if (k < 1 && box.isConnected) requestAnimationFrame(step); else next.classList.add('done');
      };
      requestAnimationFrame(step);
      game.sfx?.('coins', 0.5);
    }, 1400);
    setTimeout(() => box.classList.add('out'), 7500);
    setTimeout(() => { box.remove(); done(); }, 8300);
  }

  showSale(d, game) {
    void game;
    const rowHtml = (x) => {
      const type = x.type || typeFromName(x.name);
      return `<div class="sum-row sale-row">${type ? iconHTML(type, 'sale-ico') : '<i class="sale-ico none"></i>'}<span class="sale-n">${escapeHtml(x.name)}</span><span>▮${x.v}</span></div>`;
    };
    const lines = d.list.slice(0, 12).map(rowHtml).join('');
    const box = el('div', { class: 'summary sale', html: `<div class="sum-title">${t('THE ALGORITHM IS PLEASED')}</div>${lines}${d.list.length > 12 ? `<div class="dim">+${d.list.length - 12} ${t('more...')}</div>` : ''}<div class="sum-row q"><span>${t('TOTAL')} (${Math.round(d.rate * 100)}%)</span><span>▮${d.total}</span></div>` });
    document.querySelectorAll('.summary.sale').forEach((x) => x.remove());
    this.root.appendChild(box);
    setTimeout(() => box.classList.add('out'), 6000);
    setTimeout(() => box.remove(), 6800);
  }

  // Ship terminal: put item icons in front of store lines ("* Flashlight ... ▮15").
  // Called by Terminal.render() after it rebuilt its output.
  decorateTerminal(out) {
    if (!out) return;
    for (const div of out.querySelectorAll('.tl')) {
      const txt = div.textContent;
      if (!txt.includes('* ') || !txt.includes('▮')) continue;
      let any = false;
      const html = txt.split('\n').map((ln) => {
        const m = ln.match(/^\* (.+?)\s+▮\d/);
        if (!m) return escapeHtml(ln);
        const type = typeFromName(m[1].trim());
        if (!type) return '<i class="tl-ico none"></i>' + escapeHtml(ln.slice(2));
        any = true;
        return iconHTML(type, 'tl-ico') + escapeHtml(ln.slice(2));
      }).join('\n');
      if (any) div.innerHTML = html;
    }
  }

  // ---------------------------------------------------------------- loading screen (boot / join / host)
  showLoading(text) {
    let l = document.getElementById('loading');
    if (!l) { l = el('div', { id: 'loading' }); document.body.appendChild(l); }
    if (!l.querySelector('.ld-wrap')) {
      l.innerHTML = `<div class="ld-wrap"><div class="ld-logo" data-t="TFG">TFG</div><div class="ld-sub">TOTALLY FUCKED GAME</div>
        <div class="load-text"></div><div class="ld-bar"><i></i></div><div class="ld-tip"><b></b><span></span></div></div><div class="ld-scan"></div>`;
    }
    const msg = t(text || 'Loading...');
    l.querySelector('.load-text').textContent = msg;
    const m = String(text || '').match(/(\d+)\s*\/\s*(\d+)/);
    const bar = l.querySelector('.ld-bar');
    bar.classList.toggle('det', !!m);
    if (m) bar.firstChild.style.width = clamp((+m[1] / Math.max(1, +m[2])) * 100, 0, 100) + '%';
    else bar.firstChild.style.width = '';
    l.classList.remove('hidden');
    l.querySelector('.ld-tip')?.classList.toggle('hidden', this.app.settings?.loadingTips === false);
    if (!this.tipTimer) {
      const rot = () => {
        const tipEl = l.querySelector('.ld-tip');
        if (!tipEl) return;
        this.loadTip = randomTip(this.loadTip);
        tipEl.firstChild.textContent = t('TIP');
        tipEl.lastChild.textContent = t(this.loadTip);
        tipEl.classList.remove('in'); void tipEl.offsetWidth; tipEl.classList.add('in');
      };
      rot();
      this.tipTimer = setInterval(rot, 4600);
    }
  }
  hideLoading() {
    document.getElementById('loading')?.classList.add('hidden');
    clearInterval(this.tipTimer);
    this.tipTimer = null;
  }
}

function row(label, input) { return el('div', { class: 'form-row' }, el('label', {}, label), input); }
function pct(v) { return Math.round(v * 100) + '%'; }
const ACTION_NAMES = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', jump: 'Jump', crouch: 'Crouch', sprint: 'Sprint',
  interact: 'Interact / pick up', drop: 'Drop item', flashlight: 'Flashlight', ptt: 'Push to talk', chat: 'Chat', emote1: 'Quick emote 1',
  emote2: 'Quick emote 2', menu: 'Character sheet', throwItem: 'Throw item', ping: 'Ping',
};
function actionName(a) { return t(ACTION_NAMES[a] || a); }
function prettyKey(code) {
  return String(code || '—').replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '').replace('ShiftLeft', 'L-Shift').replace('ControlLeft', 'L-Ctrl');
}
