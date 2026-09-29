// Accessibility runtime (wave 7, docs/wave7/a11y.md). Two parts:
//  applyA11ySettings(settings)  app level (main.js boot + applySettings): colour-blind palette (tier colours, HUD css vars, traps, zones,
//                               aimtell, creature eyes read it through a11y_core `sig`), UI scale, high-contrast class, pad focus rings.
//  installA11y(game)            per game: keeps the pad's emote-wheel context, draws the interact key / pad glyph on the HUD prompt.
import { TIERS, TIER_ORDER } from './tiers.js';
import { sig, setCbMode, clampRange, UI_SCALE_MIN, UI_SCALE_MAX } from '../core/a11y_core.js';
import { actionLabel } from '../core/gamepad_core.js';
import { addTranslations, tIn } from '../core/i18n.js';
import { A11Y_TR, A11Y_RU } from './a11y_i18n.js';

// only fill gaps: words like 'Common' / 'Move' may already be translated elsewhere
const gaps = (map, l) => Object.fromEntries(Object.entries(map).filter(([k]) => tIn(l, k) === k));
addTranslations(gaps(A11Y_TR, 'tr'), 'tr');
addTranslations(gaps(A11Y_RU, 'ru'), 'ru');

const CSS = `
html { --ui-scale: 1; }
#ui { zoom: var(--ui-scale); }
.hud-prompt .p-main[data-k]:not(:empty)::before { content: '[' attr(data-k) '] '; color: var(--amber, #ffc233); }
#ui :is(.btn, input, select, [data-nav], [tabindex="0"]):focus-visible { outline: 3px solid var(--amber, #ffc233); outline-offset: 2px; }
html.a11y-pad #ui :is(.btn, input, select, [data-nav], [tabindex="0"]):focus-visible { outline: 4px solid #fff; outline-offset: 3px; box-shadow: 0 0 0 7px rgba(0,0,0,0.85); }
#ui .a11y-warn { border: 2px solid var(--bad, #ff4a3a); color: #fff; padding: 6px 10px; margin: 4px 0; font-size: 20px; }
#ui .a11y-swatches { display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 4px 0 8px; }
#ui .a11y-sw { display: inline-flex; align-items: center; gap: 6px; font-size: 18px; }
#ui .a11y-sw i { width: 16px; height: 16px; background: var(--c); border: 1px solid #fff; display: inline-block; }
#ui .a11y-pad-table { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 20px; margin: 6px 0; }
html.a11y-contrast #ui { --text: #fff; --ph: #fff; --ph-dim: #e6e6e6; }
html.a11y-contrast #ui :is(.dim, .row-note, .cp-sub) { color: #f2f2f2 !important; opacity: 1 !important; }
html.a11y-contrast #ui .menu-frame { border-color: #fff !important; }
html.a11y-contrast #ui .btn { border-width: 2px; }
html.a11y-contrast .hud { --bg: rgba(0,0,0,0.92); --bg2: rgba(0,0,0,0.95); }
`;
let cssEl = null, wired = false;
const ORIG = {};

function ensureCss() {
  if (cssEl || typeof document === 'undefined') return;
  cssEl = document.createElement('style'); cssEl.id = 'a11y-css'; cssEl.textContent = CSS;
  document.head.appendChild(cssEl);
}

export function applyA11ySettings(s) {
  if (typeof document === 'undefined') return;
  ensureCss();
  const root = document.documentElement;
  const mode = s.cbMode || 'off';
  setCbMode(mode);
  // tier colours: every module reads TIERS[id].color / .hex (tiers.js), so recolouring in place reaches the HUD, chests, shop...
  for (const id of TIER_ORDER) {
    if (!ORIG[id]) ORIG[id] = { color: TIERS[id].color, hex: TIERS[id].hex };
    const c = sig('tier.' + id, ORIG[id].color);
    TIERS[id].color = c; TIERS[id].hex = parseInt(c.slice(1), 16);
  }
  // HUD signal colours: style.css / theme.css tokens
  const st = root.style;
  if (mode === 'off') for (const v of ['--bad', '--good', '--t-bad', '--t-good', '--t-warn']) st.removeProperty(v);
  else { st.setProperty('--bad', sig('danger')); st.setProperty('--t-bad', sig('danger')); st.setProperty('--good', sig('ok')); st.setProperty('--t-good', sig('ok')); st.setProperty('--t-warn', sig('warn')); }
  root.classList.toggle('a11y-contrast', mode === 'contrast');
  st.setProperty('--ui-scale', String(clampRange(s.uiScale, UI_SCALE_MIN, UI_SCALE_MAX, 1)));
  if (!wired) {
    wired = true;
    const off = (e) => { if (e.isTrusted !== false) root.classList.remove('a11y-pad'); };
    window.addEventListener('keydown', off, true);
    window.addEventListener('mousemove', off, { passive: true });
  }
}
/** ui.js calls this from its pad handler so focus rings get the bold pad style */
export const markPadActive = () => { try { document.documentElement.classList.add('a11y-pad'); } catch { /* no DOM */ } };

export function installA11y(game) {
  let t = 0, lastK = null, lastPad = null;
  const off = game.mods.on('update', (dt, g) => {
    if (g !== game) return;
    const inp = game.input;
    if (inp?.padCtx) inp.padCtx.wheelOpen = !!game.emotes?.wheelOpen;
    t -= dt;
    if (t > 0) return;
    t = 0.2;
    const pad = !!inp?.usingPad;
    if (pad !== lastPad) { lastPad = pad; document.documentElement.classList.toggle('a11y-pad', pad); }
    const k = actionLabel('interact', game.settings?.keys, pad, inp?.padKind);
    if (k !== lastK) { lastK = k; const el = game.ui?.hud?.$?.pMain; if (el) el.dataset.k = k; }
  });
  return {
    keyLabel: (action) => actionLabel(action, game.settings?.keys, !!game.input?.usingPad, game.input?.padKind),
    dispose() { off?.(); },
  };
}
