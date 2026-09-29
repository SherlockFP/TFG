// ARTDIR (wave 6): the visual identity layer, DOM side. docs/wave6/artdir.md is the identity kit; styles are src/ui/artdir.css, every rule is scoped
// to html.tfg-artdir (setting "Art direction", default on). Removing the class restores the ui2/ui3 look, because everything injected here
// carries `.ad-only` (hidden unless the class is on). Work done here, all cheap:
//   - a MutationObserver decorates each new panel header (.cp-head) with a stamped form label + a small glyph composition,
//     and the loading screen with the seal / wordmark / Algorithm eye / skyline;
//   - one rAF-throttled pointermove handler turns every `.ad-eye` towards the cursor (skipped with reduceMotion).
import { t } from '../core/i18n.js';
import './artdir_i18n.js';
import { sealSvg, eyeSvg, wordmarkSvg, compositionSvg } from './logo.js';

// panel kind by title (EN / TR / RU stems) -> [key, glyph composition, stamp]
export const KINDS = [
  [/pause|duraklat|пауз/i, 'pause', ['hazard', 'door', 'gear'], 'ON BREAK'],
  [/host|sunucu|создат|хост/i, 'host', ['van', 'planet', 'gear'], 'APPROVED'],
  [/join|katıl|присоед|найти/i, 'join', ['web', 'user', 'planet'], 'PENDING'],
  [/daily|günlük|ежедн/i, 'daily', ['calendar', 'gift', 'star'], 'PENDING'],
  [/profile|profil|профил/i, 'profile', ['user', 'trophy', 'book'], 'CLASSIFIED'],
  [/hub|merkez|хаб|social|sosyal/i, 'hub', ['building', 'person', 'mask'], 'APPROVED'],
  [/character|karakter|персонаж|wardrobe|gardırop/i, 'character', ['mask', 'user', 'eye'], 'CLASSIFIED'],
  [/\bmods?\b|modlar|моды/i, 'mods', ['gear', 'box', 'bug'], 'RESTRICTED'],
  [/setting|ayar|настро/i, 'settings', ['gear', 'bolt', 'mic'], 'APPROVED'],
  [/how to|nasıl|как играть|guide|rehber/i, 'howto', ['help', 'book', 'eye'], 'APPROVED'],
  [/shop|store|market|mağaza|pazar|магаз|рынок/i, 'shop', ['box', 'van', 'trophy'], 'APPROVED'],
  [/forge|craft|üret|kaynak|ковк|крафт/i, 'forge', ['flame', 'gear', 'bolt'], 'RESTRICTED'],
  [/ship|yard|gemi|корабл|верф/i, 'ship', ['van', 'planet', 'crane'], 'APPROVED'],
  [/pet|evcil|питом/i, 'pets', ['hound', 'blob', 'star'], 'PENDING'],
  [/skill|tree|yetenek|навык|дерев|role|rol\b|роль/i, 'tree', ['star', 'book', 'bolt'], 'CLASSIFIED'],
  [/inventory|envanter|инвентар|bag|çanta/i, 'inv', ['box', 'lock', 'person'], 'APPROVED'],
  [/bount|görev|контракт|case|dava|дело/i, 'case', ['book', 'skull', 'check'], 'CLASSIFIED'],
];
const FALLBACK = [['building', 'box', 'gear'], ['hazard', 'eye', 'book'], ['planet', 'van', 'star'], ['crane', 'box', 'bolt']];

export function kindOf(title) {
  const s = String(title || '');
  for (const [re, key, g, stamp] of KINDS) if (re.test(s)) return { key, g, stamp };
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return { key: 'misc', g: FALLBACK[h % FALLBACK.length], stamp: 'APPROVED' };
}
/** stable pseudo form number for a title, e.g. "TFG-27-C" */
export function formCode(title) {
  let h = 7; for (const ch of String(title || '')) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return `TFG-${10 + (h % 90)}-${'ABCDEFGH'[(h >>> 8) % 8]}`;
}

export const setArtdir = (on) => { if (typeof document !== 'undefined') document.documentElement.classList.toggle('tfg-artdir', !!on); };
/** called from ui.applyUiPrefs(): settings.artDir (default on) and settings.reduceMotion (-> html.ad-calm: no glitch / wipe / pulse) */
export const syncArtdir = (s = {}) => { if (typeof document === 'undefined') return; setArtdir(s.artDir !== false); document.documentElement.classList.toggle('ad-calm', !!s.reduceMotion); };
export const isArtdir = () => typeof document !== 'undefined' && document.documentElement.classList.contains('tfg-artdir');
const reduced = () => document.documentElement.classList.contains('ad-calm');

function decorHead(head) {
  head.dataset.ad = '1';
  const title = head.querySelector('.menu-title')?.textContent || '';
  const k = kindOf(title);
  const w = document.createElement('span');
  w.className = 'ad-headr ad-only';
  w.innerHTML = `<span class="ad-stamp"><i>${t('FORM')} ${formCode(title)}</i><b>${t(k.stamp)}</b></span>`
    + (k.key === 'pause' ? eyeSvg({ cls: 'ad-eye-head' }) : '') + compositionSvg(k.g);
  head.appendChild(w);
}

const SKYLINE = '<svg class="ad-skyline" viewBox="0 0 400 70" preserveAspectRatio="xMidYMax slice" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="square" aria-hidden="true">'
  + '<circle cx="330" cy="26" r="12"/><path d="M0 62H400 M20 62V50h16V62 M24 50v-7h8v7 M70 62l10-16h30l10 16 M84 46l4-9h14l4 9 M150 62V26 M141 62l9-36 9 36 M141 40h18 M141 51h18 M200 62V42h22V62 M207 42V30 M262 62l7-22 7 22 M290 62V50h26V62 M300 50v-6h8v6 M352 62V46h14V62 M358 46V34"/>'
  + '</svg>';

function decorLoading(w) {
  w.dataset.ad = '1';
  const top = document.createElement('div');
  top.className = 'ad-ld-top ad-only';
  top.innerHTML = sealSvg({ cls: 'ad-ld-seal' }) + wordmarkSvg({ cls: 'ad-ld-wm' }) + eyeSvg({ cls: 'ad-ld-eye', live: true });
  w.insertBefore(top, w.firstChild);
  const art = document.createElement('div');
  art.className = 'ad-ld-art ad-only';
  art.innerHTML = SKYLINE + `<span class="ad-ld-cap">${t('ONBOARDING IN PROGRESS')}</span>`;
  w.appendChild(art);
}

function scan(n) {
  if (n.matches?.('.cp-head:not([data-ad])')) decorHead(n);
  else if (n.querySelectorAll) for (const h of n.querySelectorAll('.cp-head:not([data-ad])')) decorHead(h);
}

let inited = false, raf = 0, px = 0, py = 0;
function trackEyes() {
  raf = 0;
  if (!isArtdir() || reduced()) return;
  for (const s of document.querySelectorAll('.ad-eye')) {
    const r = s.getBoundingClientRect();
    if (!r.width) continue;
    const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height / 2), l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / 240) / l;
    s.style.setProperty('--lx', (dx * k).toFixed(2)); s.style.setProperty('--ly', (dy * k).toFixed(2));
  }
}

export function initArtdir(on = true) {
  if (typeof document === 'undefined' || inited) return;
  inited = true;
  setArtdir(on);
  try { document.fonts?.load('700 20px "TFG Plate"'); } catch { /* optional */ }
  window.addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; if (!raf) raf = requestAnimationFrame(trackEyes); }, { passive: true });
  const mo = new MutationObserver((recs) => {
    for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1) scan(n);
    const l = document.getElementById('loading');
    const w = l && l.querySelector('.ld-wrap:not([data-ad])');
    if (w) decorLoading(w);
  });
  mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
  scan(document.body);
}
