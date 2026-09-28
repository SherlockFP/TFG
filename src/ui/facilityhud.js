// FACILITY STATUS widget (hudDock right) + the two small CRT panels the facility systems use: a lore/hint NOTE
// reader and the containment KEYPAD. Both panels are registered as minigame factories (src/minigames registry
// API: create(opts) -> { el, update, destroy }, opts.onDone(result)) so game.openMinigame() handles pointer lock,
// input blocking and cleanup exactly like the built-in minigames.
import { hudDock } from './dock.js';
import { t, tf } from '../core/i18n.js';
import { escapeHtml } from '../core/util.js';

const CSS = `
.fac-hud{font-family:var(--font);background:linear-gradient(180deg,rgba(18,9,3,.96),rgba(8,4,2,.93));border:1px solid rgba(255,138,61,.45);box-shadow:0 0 14px rgba(255,138,61,.18),inset 0 0 18px rgba(0,0,0,.6);padding:6px 9px 7px;min-width:214px;color:var(--text);position:relative;overflow:hidden}
.fac-hud::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px);pointer-events:none}
.fac-hud .fh-t{font-family:var(--cond);font-weight:bold;font-size:15px;letter-spacing:2px;color:var(--amber);display:flex;justify-content:space-between;gap:10px;text-transform:uppercase}
.fac-hud .fh-t i{font-style:normal;color:#ff9ad0;opacity:.85;font-size:13px;letter-spacing:1px}
.fac-hud .fh-g{display:grid;grid-template-columns:1fr 1fr;gap:3px 10px;margin-top:4px}
.fac-hud .fh-s{display:flex;align-items:center;gap:5px;font-size:17px;line-height:1}
.fac-hud .fh-s svg{width:15px;height:15px;flex:none}
.fac-hud .fh-s b{font-weight:normal;letter-spacing:1px}
.fac-hud .ok{color:#7dff8a}.fac-hud .mid{color:#ffb040}.fac-hud .bad{color:#ff4a3a}.fac-hud .dim{color:#8a7a6a}
.fac-hud .bad svg,.fac-hud .blink{animation:fhBlink .7s steps(2) infinite}
.fac-hud .fh-x{margin-top:5px;border-top:1px solid rgba(255,138,61,.25);padding-top:4px;font-size:17px;display:flex;align-items:center;gap:6px}
.fac-hud .fh-x .tm{font-family:var(--font2);font-size:12px;color:#ff4a3a}
.fac-hud .fh-bar{flex:1;height:5px;background:rgba(255,74,58,.18);border:1px solid rgba(255,74,58,.4)}
.fac-hud .fh-bar div{height:100%;background:#ff4a3a;box-shadow:0 0 6px #ff4a3a}
.fac-hud .fh-arrow{display:inline-block;width:18px;text-align:center;color:#7dff8a;font-size:18px;transition:transform .15s linear}
.fac-hud .fh-ev{margin-top:3px;font-size:15px;letter-spacing:1px;color:#ff6a4a;text-transform:uppercase}
@keyframes fhBlink{50%{opacity:.35}}
.fac-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,92vw);background:radial-gradient(ellipse at center,#1a0e05 0%,#0a0502 100%);border:2px solid var(--amber-dim);box-shadow:0 0 40px rgba(255,138,61,.25),inset 0 0 60px rgba(0,0,0,.8);padding:18px 22px 14px;font-family:var(--font);color:var(--text);pointer-events:auto}
.fac-panel::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.2) 0 1px,transparent 1px 3px);pointer-events:none}
.fac-panel h3{margin:0 0 4px;font-family:var(--cond);font-size:26px;letter-spacing:2px;color:var(--amber);text-transform:uppercase}
.fac-panel .sub{font-size:16px;opacity:.6;letter-spacing:2px;margin-bottom:10px}
.fac-panel .paper{background:#d9d2bd;color:#2a2438;padding:14px 16px;font-size:22px;line-height:1.25;box-shadow:inset 0 0 30px rgba(90,70,30,.35);transform:rotate(-.6deg);white-space:pre-wrap}
.fac-panel .paper .hl{color:#b01818;font-weight:bold;font-size:26px;letter-spacing:2px}
.fac-panel .foot{margin-top:10px;font-size:16px;opacity:.65;text-align:right}
.fac-kp{display:flex;gap:18px;align-items:flex-start}
.fac-kp .lcd{font-family:var(--font2);font-size:34px;letter-spacing:12px;color:#7dff8a;background:#020803;border:1px solid #1c8f3b;padding:10px 14px;text-shadow:0 0 10px #39ff6a;min-width:190px;text-align:center}
.fac-kp .lcd.bad{color:#ff4a3a;border-color:#ff4a3a;text-shadow:0 0 10px #ff4a3a}
.fac-kp .keys{display:grid;grid-template-columns:repeat(3,54px);gap:6px}
.fac-kp button{font-family:var(--font2);font-size:16px;height:44px;background:#1b1109;color:var(--amber);border:1px solid var(--amber-dim);cursor:pointer}
.fac-kp button:hover{background:var(--amber);color:#120800}
`;
let cssDone = false;
function ensureCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style');
  s.id = 'fac-hud-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const ICON = {
  power: '<svg viewBox="0 0 16 16"><path fill="currentColor" d="M9 1 3 9h4l-1 6 6-8H8z"/></svg>',
  security: '<svg viewBox="0 0 16 16"><path fill="currentColor" d="M8 1 2 3v5c0 3.5 2.6 6 6 7 3.4-1 6-3.5 6-7V3zm0 2.2 4 1.3V8c0 2.4-1.7 4.2-4 5z"/></svg>',
  containment: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2" fill="currentColor"/><path fill="currentColor" d="M8 1a3 3 0 0 1 2.6 4.5L9.3 4.8A1.5 1.5 0 0 0 8 2.5 1.5 1.5 0 0 0 6.7 4.8L5.4 5.5A3 3 0 0 1 8 1zm6.1 10.5a3 3 0 0 1-5.2 0l1.3-.7a1.5 1.5 0 0 0 2.6-1.5l1.3-.7a3 3 0 0 1 0 2.9zM1.9 11.5a3 3 0 0 1 0-2.9l1.3.7a1.5 1.5 0 0 0 2.6 1.5l1.3.7a3 3 0 0 1-5.2 0z"/></svg>',
  vent: '<svg viewBox="0 0 16 16"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M1 5h9a2 2 0 1 0-2-2M1 8h12a2 2 0 1 1-2 2M1 11h6"/></svg>',
};
const CLS = {
  power: { off: 'bad', low: 'mid', normal: 'ok', overload: 'bad' },
  security: { passive: 'ok', active: 'mid', alarm: 'bad', lockdown: 'bad' },
  containment: { normal: 'ok', breach: 'bad', failure: 'bad' },
  vent: { clean: 'ok', gas: 'bad', fire: 'bad', toxic: 'bad' },
};
const LABEL = { power: 'POWER', security: 'SECURITY', containment: 'CONTAIN', vent: 'AIR' };

export function createFacilityHud() {
  ensureCss();
  const box = hudDock('right', 'facility', 20);
  box.className = 'hud-dock-item fac-hud';
  box.style.display = 'none';
  let last = '';
  return {
    el: box,
    /** fac: run.fac, view: { visible, coreName, left, total, exitD, arrowDeg, event } */
    update(fac, view) {
      if (!view?.visible || !fac) { if (box.style.display !== 'none') box.style.display = 'none'; last = ''; return; }
      if (box.style.display === 'none') box.style.display = '';
      const rows = ['power', 'security', 'containment', 'vent'].map((k) => {
        const v = fac[k] || '';
        const c = CLS[k][v] || 'dim';
        return `<div class="fh-s ${c}">${ICON[k]}<span class="dim">${t(LABEL[k])}</span><b>${escapeHtml(t(v.toUpperCase()))}</b></div>`;
      }).join('');
      let ext = '';
      if (fac.ext) {
        const left = Math.max(0, Math.ceil(view.left ?? fac.ext.left));
        const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
        const pct = Math.round(100 * Math.max(0, Math.min(1, left / Math.max(1, fac.ext.total))));
        ext = `<div class="fh-x"><span class="tm blink">${mm}:${ss}</span><div class="fh-bar"><div style="width:${pct}%"></div></div>`
          + (view.exitD != null ? `<span class="fh-arrow" style="transform:rotate(${Math.round(view.arrowDeg || 0)}deg)">▲</span><span class="ok">${t('EXIT')} ${view.exitD}m</span>` : '') + '</div>';
      } else if (fac.result === 'success') ext = `<div class="fh-x ok">✔ ${escapeHtml(tf('{core} EXTRACTED', { core: t(view.coreName || 'CORE') }))}</div>`;
      else if (fac.result === 'fail') ext = `<div class="fh-x bad">✖ ${escapeHtml(t('CONTAINMENT FAILURE'))}</div>`;
      const ev = view.event ? `<div class="fh-ev blink">${escapeHtml(view.event)}</div>` : '';
      const html = `<div class="fh-t">${t('FACILITY STATUS')}<i>${escapeHtml(t(view.coreName || ''))}</i></div><div class="fh-g">${rows}</div>${ext}${ev}`;
      if (html !== last) { box.innerHTML = html; last = html; }
    },
    dispose() { box.remove(); },
  };
}

// ------------------------------------------------------------------ note reader (minigame factory 'fac_note')
export function createNotePanel(opts) {
  ensureCss();
  const el = document.createElement('div');
  el.className = 'fac-panel';
  const body = (opts.lines || []).map((l) => (typeof l === 'string' ? escapeHtml(l) : `<span class="hl">${escapeHtml(l.hl)}</span>`)).join('\n');
  el.innerHTML = `<h3>${escapeHtml(opts.title || t('NOTE'))}</h3><div class="sub">${escapeHtml(opts.sub || '')}</div><div class="paper">${body}</div><div class="foot">[E] / [ESC] ${t('close')}</div>`;
  (opts.container || document.body).appendChild(el);
  let done = false, age = 0;
  const finish = () => { if (done) return; done = true; opts.onDone?.({ success: true, cancelled: true }); };
  const onKey = (e) => { if (age < 0.25) return; if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); finish(); } };
  addEventListener('keydown', onKey, true);
  el.addEventListener('click', finish);
  return { el, update(dt) { age += dt; }, destroy() { removeEventListener('keydown', onKey, true); el.remove(); } };
}

// ------------------------------------------------------------------ containment keypad (minigame factory 'fac_keypad')
export function createKeypadPanel(opts) {
  ensureCss();
  const len = opts.length || 3;
  const el = document.createElement('div');
  el.className = 'fac-panel';
  el.innerHTML = `<h3>${escapeHtml(opts.title || t('CONTAINMENT KEYPAD'))}</h3><div class="sub">${escapeHtml(opts.sub || '')}</div>
    <div class="fac-kp"><div class="lcd">${'_'.repeat(len)}</div><div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'CLR', 0, 'ENT'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}</div></div>
    <div class="foot">${t('Digits, Backspace, Enter')} · [ESC] ${t('close')}</div>`;
  (opts.container || document.body).appendChild(el);
  const lcd = el.querySelector('.lcd');
  let code = '', done = false;
  const show = (bad) => { lcd.textContent = (code + '_'.repeat(len)).slice(0, len); lcd.classList.toggle('bad', !!bad); };
  const finish = (res) => { if (done) return; done = true; opts.onDone?.(res); };
  const press = (k) => {
    opts.sfx?.('safe_click');
    if (k === 'CLR') { code = ''; show(); return; }
    if (k === 'ENT') { if (code.length === len) finish({ success: true, cancelled: false, code }); else show(true); return; }
    if (code.length < len) { code += String(k); show(); }
    if (code.length === len && opts.autoSubmit) finish({ success: true, cancelled: false, code });
  };
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => press(b.dataset.k === 'CLR' || b.dataset.k === 'ENT' ? b.dataset.k : Number(b.dataset.k))));
  const onKey = (e) => {
    if (e.code === 'Escape') { e.preventDefault(); finish({ success: false, cancelled: true }); return; }
    if (/^(Digit|Numpad)\d$/.test(e.code)) { e.preventDefault(); press(Number(e.code.slice(-1))); return; }
    if (e.code === 'Backspace') { e.preventDefault(); code = code.slice(0, -1); show(); return; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); press('ENT'); }
  };
  addEventListener('keydown', onKey, true);
  return { el, update() {}, destroy() { removeEventListener('keydown', onKey, true); el.remove(); } };
}
