// ARTDIR identity kit, code side (docs/wave6/artdir.md). Pure SVG strings + path data, no images, no DOM access at import time,
// so it works in node tests. Three marks:
//   WORDMARK  - blocky stencil "TFG" (own path data, font independent) + hazard underline + optional glitch ghosts
//   SEAL      - the Company seal: octagon, ring, "T over a bar", ring text
//   EYE       - the Algorithm's eye: almond, iris ring, diamond pupil, lashes. `.ad-eye` follows the cursor (artdir.js sets --lx/--ly)
// The same path data is reused by the CRT menu canvas via Path2D (drawWordmark / drawSeal / drawEye).
import { glyphPath } from './glyphs.js';

export const WM_LETTERS = [
  { d: 'M0 0H34V10H22V40H12V10H0Z', x: 0 },                       // T
  { d: 'M0 0H34V10H10V17H28V26H10V40H0Z', x: 40 },                // F
  { d: 'M0 0H34V10H10V30H24V24H16V17H34V40H0Z', x: 80 },          // G
];
export const WM_W = 114, WM_H = 40;
export const SEAL_OCT = 'M30 4H70L96 30V70L70 96H30L4 70V30Z';
export const SEAL_T = 'M33 35H67V44H55V69H45V44H33Z';
export const EYE_ALMOND = 'M2 16c6-9 22-9 28 0-6 9-22 9-28 0z';
export const EYE_LASH = 'M16 3v3 M8 5l1.5 2.5 M24 5l-1.5 2.5';
export const EYE_PUPIL = 'M16 12l3 4-3 4-3-4z';
export const COL = { amber: '#ff8a3d', hazard: '#ffb800', term: '#7dff7d', mag: '#ff3d7f', cyan: '#2affff', ink: '#120800', paper: '#ffd9b8' };

let uid = 0;

/** "TFG" wordmark. opts.glitch adds magenta/cyan ghost layers (animated by artdir.css .ad-wm-g1/.ad-wm-g2), opts.tape the hazard underline. */
export function wordmarkSvg({ glitch = true, tape = true, cls = '' } = {}) {
  const L = (fill, c) => WM_LETTERS.map((l) => `<path class="${c}" d="${l.d}" transform="translate(${l.x} 0)" fill="${fill}"/>`).join('');
  const id = 'adh' + (uid++);
  return `<svg class="ad-wm ${cls}" viewBox="-4 -4 ${WM_W + 8} ${WM_H + (tape ? 16 : 8)}" role="img" aria-label="TFG">`
    + (tape ? `<defs><pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="5" height="10" fill="${COL.hazard}"/><rect x="5" width="5" height="10" fill="#17110a"/></pattern></defs>` : '')
    + (glitch ? `<g class="ad-wm-g1">${L(COL.mag, 'g')}</g><g class="ad-wm-g2">${L(COL.cyan, 'g')}</g>` : '')
    + `<g class="ad-wm-main">${L(COL.amber, 'm')}</g>`
    + (tape ? `<rect x="0" y="${WM_H + 4}" width="${WM_W}" height="5" fill="url(#${id})"/>` : '')
    + '</svg>';
}

/** Company seal (octagon + ring + T over bar + ring text). */
export function sealSvg({ cls = '', text = 'APPROVED FOR PERSONNEL' } = {}) {
  const id = 'ads' + (uid++);
  return `<svg class="ad-seal ${cls}" viewBox="0 0 100 100" role="img" aria-label="Company seal" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="miter">`
    + `<path d="${SEAL_OCT}"/><circle cx="50" cy="50" r="30" stroke-width="2" stroke-dasharray="3 2"/>`
    + `<path d="${SEAL_T}" fill="currentColor" stroke="none"/><path d="M33 75H67" stroke-width="3"/>`
    + `<path id="${id}" d="M50 50m-38 0a38 38 0 1 1 76 0a38 38 0 1 1-76 0" stroke="none"/>`
    + `<text class="ad-seal-txt" font-size="7.5" fill="currentColor" stroke="none" letter-spacing="1.6"><textPath href="#${id}" startOffset="0">${text} * ${text} *</textPath></text></svg>`;
}

/** The Algorithm's eye. Class ad-eye follows the cursor via CSS vars --lx/--ly (-1..1); opts.live adds the LIVE dot. */
export function eyeSvg({ cls = '', live = false } = {}) {
  return `<svg class="ad-eye ${cls}" viewBox="0 0 32 32" role="img" aria-label="The Algorithm" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter">`
    + `<path d="${EYE_LASH}" stroke-width="1.4"/><path d="${EYE_ALMOND}"/>`
    + `<g class="ad-eye-look"><circle cx="16" cy="16" r="6.2"/><path class="ad-eye-pupil" d="${EYE_PUPIL}" fill="var(--ad-eye, currentColor)" stroke="none"/></g>`
    + (live ? '<circle class="ad-eye-live" cx="28" cy="5" r="2" fill="#ff3d3d" stroke="none"/>' : '') + '</svg>';
}

/** Small glyph composition for panel headers: one big pictogram, two small ones, corner ticks, dashes. names = [main, a, b]. */
export function compositionSvg(names, cls = '') {
  const [m, a, b] = names;
  const G = (n, x, y, s, o) => (glyphPath(n) ? `<g transform="translate(${x} ${y}) scale(${s})" opacity="${o}"><path d="${glyphPath(n)}"/></g>` : '');
  return `<svg class="ad-comp ${cls}" viewBox="0 0 96 44" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">`
    + '<path d="M1 7V1h6 M89 1h6v6 M1 37v6h6 M89 43h6v-6" stroke-width="1.2" opacity=".6"/>'
    + G(m, 30, 4, 1.45, 1) + G(a, 6, 12, 0.85, 0.55) + G(b, 70, 12, 0.85, 0.55)
    + '<path d="M2 22h4 M90 22h4" opacity=".5"/><path d="M12 41h72" stroke-dasharray="6 4" opacity=".4"/></svg>';
}

// ---- canvas twins (CRT menu). ctx state is saved/restored.
export function drawWordmark(ctx, x, y, h, { fill = COL.amber, jitter = 0, ghost = false } = {}) {
  if (typeof Path2D === 'undefined') return;
  const s = h / WM_H;
  const pass = (col, dx, dy) => { ctx.save(); ctx.translate(x + dx, y + dy); ctx.scale(s, s); ctx.fillStyle = col; for (const l of WM_LETTERS) { ctx.save(); ctx.translate(l.x, 0); ctx.fill(new Path2D(l.d)); ctx.restore(); } ctx.restore(); };
  if (ghost) { pass(COL.mag, -3 - jitter, 0); pass(COL.cyan, 3 + jitter, 0); }
  pass(fill, 0, 0);
}
export function drawSeal(ctx, cx, cy, size, col = COL.amber) {
  if (typeof Path2D === 'undefined') return;
  ctx.save(); ctx.translate(cx - size / 2, cy - size / 2); ctx.scale(size / 100, size / 100);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 4; ctx.lineJoin = 'miter';
  ctx.stroke(new Path2D(SEAL_OCT)); ctx.lineWidth = 2.5; ctx.setLineDash([3, 2]); ctx.beginPath(); ctx.arc(50, 50, 30, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fill(new Path2D(SEAL_T)); ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(33, 75); ctx.lineTo(67, 75); ctx.stroke(); ctx.restore();
}
/** Eye on a canvas: (cx,cy) centre, w width; lx/ly -1..1 look vector; open 0..1 blink. */
export function drawEye(ctx, cx, cy, w, lx = 0, ly = 0, { col = COL.amber, pupil = COL.mag, open = 1, ghost = false } = {}) {
  if (typeof Path2D === 'undefined') return;
  const s = w / 32;
  const pass = (c, dx) => {
    ctx.save(); ctx.translate(cx - w / 2 + dx, cy - w / 2); ctx.scale(s, s);
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 2.2; ctx.lineJoin = 'miter';
    ctx.stroke(new Path2D(EYE_LASH));
    ctx.save(); ctx.translate(16, 16); ctx.scale(1, Math.max(0.08, open)); ctx.translate(-16, -16); ctx.stroke(new Path2D(EYE_ALMOND)); ctx.restore();
    if (open > 0.3) { ctx.translate(lx * 3.6, ly * 2.2); ctx.beginPath(); ctx.arc(16, 16, 6.2, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = ghost ? c : pupil; ctx.fill(new Path2D(EYE_PUPIL)); }
    ctx.restore();
  };
  if (ghost) { pass(COL.mag, -1.5); pass(COL.cyan, 1.5); }
  pass(col, 0);
}
