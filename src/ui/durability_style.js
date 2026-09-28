// Durability UI helpers shared by the hotbar (hud.js), the I panel (inventory_panel.js) and the repair panel:
// the little bar under an icon (Minecraft style: only shown once the item is damaged), the BROKEN overlay (greyed icon + crack) and
// the tooltip row.  Pure string helpers + one lazily injected <style>; the rules live in game/durability_core.js.
import { durInfo } from '../game/durability_core.js';
import { t } from '../core/i18n.js';

const CSS = `
.dur-bar { position: absolute; left: 5px; right: 5px; bottom: 3px; height: 4px; background: #1a0d06; box-shadow: 0 0 0 1px rgba(0,0,0,0.65); pointer-events: none; z-index: 3; }
.dur-bar > div { height: 100%; background: #7dff7d; }
.dur-bar.dur-worn > div { background: #ffd23f; }
.dur-bar.dur-critical > div { background: #ff4a3a; animation: durPulse 0.9s ease-in-out infinite; }
.dur-bar.dur-broken > div { background: #4a4440; }
.dur-crack { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 4; opacity: 0.9; }
.dur-broken-tag { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%) rotate(-8deg); text-align: center; font-size: 11px; letter-spacing: 1px; color: #ff5a4a; text-shadow: 1px 1px 0 #000, -1px 0 0 #000; pointer-events: none; z-index: 5; }
.inv-slot.dur-broken .inv-ico, .ivi.dur-broken .ico { filter: grayscale(1) brightness(0.5) contrast(0.9); }
.inv-slot.dur-broken .inv-name { color: #8a8278 !important; text-decoration: line-through; }
.ivi.dur-broken { --tc: #4a4440 !important; }
.tt-rows .v.dur-warn { color: #ffd23f; } .tt-rows .v.dur-crit { color: #ff5a4a; } .tt-rows .v.dur-brk { color: #ff5a4a; letter-spacing: 1px; }
@keyframes durPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
`;
let injected = false;
export function ensureDurStyle() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  try {
    const s = document.createElement('style');
    s.id = 'tfg-dur-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  } catch { /* no DOM (node) */ }
}
const CRACK = '<svg class="dur-crack" viewBox="0 0 40 40" preserveAspectRatio="none"><path d="M7 1 L17 13 L11 18 L23 29 L19 39 M23 29 L35 33 M17 13 L31 9" fill="none" stroke="#ff5a4a" stroke-width="1.6" stroke-linejoin="round"/></svg>';

/** bar (+ crack overlay when broken) for an item icon cell; '' for non-durable or undamaged items */
export function durBarHTML(it) {
  const i = it ? durInfo(it) : null;
  if (!i || i.dur >= i.max) return '';
  ensureDurStyle();
  const pct = Math.max(0, Math.min(100, Math.round(i.frac * 100)));
  return `<div class="dur-bar dur-${i.state}"><div style="width:${i.broken ? 100 : Math.max(4, pct)}%"></div></div>${i.broken ? CRACK + `<div class="dur-broken-tag">${t('BROKEN')}</div>` : ''}`;
}
/** extra CSS class for the icon cell (grey out broken items) */
export const durClass = (it) => { const i = it ? durInfo(it) : null; return i && i.broken ? ' dur-broken' : ''; };
/** tooltip row [key, valueHTML, cls] or null: "Durability 87/120" (+ repairs / status) */
export function durRow(it, def = it?.def) {
  const i = it ? durInfo(it, def) : null;
  if (!i) return null;
  ensureDurStyle();
  const d = Math.round(i.dur), m = Math.round(i.max);
  if (i.broken) return ['Durability', `${t('BROKEN')} 0/${m}`, 'dur-brk'];
  const aged = i.repairs ? ` <small>(${t('worn out by repairs')})</small>` : '';
  return ['Durability', `${d}/${m}${aged}`, i.state === 'critical' ? 'dur-crit' : i.state === 'worn' ? 'dur-warn' : ''];
}
/** one-line explanation of what happens at 0 (tooltip flag) */
export function durFlag(it, def = it?.def) {
  const i = it ? durInfo(it, def) : null;
  if (!i) return null;
  return i.outcome === 'destroy' ? ['Shatters at 0 durability', '#ffb070'] : ['Breaks at 0: repair it', '#ffb070'];
}
