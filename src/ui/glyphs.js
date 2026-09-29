// UI2: tiny vector pictograms (24x24 grid, 2px square-cap strokes, currentColor) that replace colour emoji in the UI.
// Usage:  el.innerHTML = glyph('lock') + ' LOCKED';   glyph('bolt', { size: 16, cls: 'x' })
//         glyphFromEmoji('🪳')  -> the closest pictogram (used by service-record cards); unknown text is returned escaped.
// Style: .tfg-glyph in src/ui/theme.css (1em box, inherits colour, sits on the text baseline).
const P = {
  sun: 'M12 8a4 4 0 1 0 .01 0z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2',
  moon: 'M20 14.5A8.5 8.5 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z',
  mic: 'M9 3h6v11H9z M5 11v1a7 7 0 0 0 14 0v-1 M12 19v3 M8 22h8',
  mute: 'M3 9h4l5-4v14l-5-4H3z M16 9l5 6 M21 9l-5 6',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  gear: 'M12 8.5a3.5 3.5 0 1 0 .01 0z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2 M12 5.5a6.5 6.5 0 1 0 .01 0z',
  snow: 'M12 2v20 M3.3 7l17.4 10 M3.3 17L20.7 7',
  flame: 'M12 2c1 5 6 7 6 12a6 6 0 0 1-12 0c0-3 2-4 3-6 1 2 2 2 3 0z',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3z M12 10.5a3.5 3.5 0 1 0 .01 0z',
  check: 'M4 12l5 5L20 6',
  cross: 'M5 5l14 14 M19 5L5 19',
  star: 'M12 2l3 7 7 .6-5.3 4.7 1.7 7.2-6.4-3.9-6.4 3.9 1.7-7.2L2 9.6 9 9z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 .01 0z',
  skull: 'M5 11a7 7 0 0 1 14 0v4l-2 1v4H7v-4l-2-1z M9 11h2v2H9z M13 11h2v2h-2z',
  spider: 'M12 8.5a3.5 3.5 0 1 0 .01 0z M9 10L3 6 M9 12H2 M9 14l-6 4 M15 10l6-4 M15 12h7 M15 14l6 4 M10 9L8 3 M14 9l2-6',
  blob: 'M4 17c0-6 3-11 8-11s8 5 8 11c0 3-3 4-8 4s-8-1-8-4z M9 12h.01 M15 12h.01',
  person: 'M12 3a3.5 3.5 0 1 0 .01 0z M5 21v-5a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v5z',
  hound: 'M4 8l3-4 3 3h4l3-3 3 4v6l-4 5H8l-4-5z M10 15h4',
  worm: 'M3 19c5 0 5-6 9-6s4-6 9-6 M20 4.5a2.5 2.5 0 1 0 .01 0z',
  turret: 'M5 21h14 M8 21a4 4 0 0 1 8 0 M12 17V8 M12 8h9',
  mine: 'M12 7.5a4.5 4.5 0 1 0 .01 0z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2',
  door: 'M6 3h12v18H6z M15 12h.01',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10',
  planet: 'M12 6a6 6 0 1 0 .01 0z M2 15c1-4 19-9 20-5',
  building: 'M5 3h14v18H5z M9 7h2 M13 7h2 M9 11h2 M13 11h2 M9 15h2 M13 15h2',
  calendar: 'M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4',
  trophy: 'M7 4h10v6a5 5 0 0 1-10 0z M7 6H3v2a4 4 0 0 0 4 4 M17 6h4v2a4 4 0 0 1-4 4 M12 15v4 M8 21h8',
  help: 'M12 3a9 9 0 1 0 .01 0z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7 M12 17h.01',
  bug: 'M8 8a4 4 0 0 1 8 0v8a4 4 0 0 1-8 0z M12 8v12 M8 11H3 M16 11h5 M8 15H4 M16 15h4 M9 5L7 3 M15 5l2-2',
  gift: 'M3 9h18v12H3z M3 13h18 M12 9v12 M12 9C9 9 8 4 11 4c2 0 1 5 1 5z M12 9c3 0 4-5 1-5-2 0-1 5-1 5z',
  hazard: 'M12 3L2 21h20z M12 10v5 M12 18h.01',
  van: 'M2 17V7h11v10 M13 10h5l4 4v3H2 M7 17a2 2 0 1 0 .01 0z M17 17a2 2 0 1 0 .01 0z',
  book: 'M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z M8 9h8 M8 13h8',
  mask: 'M4 6h16v7a8 8 0 0 1-16 0z M8 11h2 M14 11h2 M9 16h6',
  web: 'M12 2v20 M2 12h20 M5 5l14 14 M19 5L5 19 M12 7l5 5-5 5-5-5z',
  crane: 'M3 21h18 M7 21V8 M7 8h13 M20 8v5 M5 8L12 3l7 5',
  user: 'M12 3a3.5 3.5 0 1 0 .01 0z M5 21v-5a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v5z',
};
const EMOJI = {
  '🪳': 'bug', '🦝': 'person', '🕷️': 'spider', '🕷': 'spider', '👁️': 'eye', '👁': 'eye', '🧍': 'person', '🟢': 'blob', '🎁': 'gift',
  '🕸️': 'web', '🕸': 'web', '🩸': 'bug', '😱': 'skull', '🎭': 'mask', '🐺': 'hound', '🗿': 'person', '🪱': 'worm', '🔫': 'turret',
  '💣': 'mine', '🚪': 'door', '🏗️': 'crane', '🏗': 'crane', '👹': 'skull', '👾': 'bug', '📦': 'box', '🏢': 'building', '🪐': 'planet',
  '🏚️': 'building', '🏚': 'building', '📅': 'calendar', '❔': 'help', '🏆': 'trophy', '🔒': 'lock', '👤': 'user', '📷': 'camera',
  '📐': 'book', '🎙': 'mic', '🎙️': 'mic', '🔇': 'mute', '⚡': 'bolt', '🔥': 'flame', '❄': 'snow', '⚙': 'gear', '🚐': 'van', '☀': 'sun', '☾': 'moon',
};

export function glyph(name, opts = {}) {
  const d = P[name];
  if (!d) return '';
  const size = opts.size ? ` width="${opts.size}" height="${opts.size}"` : '';
  return `<svg class="tfg-glyph${opts.cls ? ' ' + opts.cls : ''}" viewBox="0 0 24 24"${size} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="${d}"/></svg>`;
}

/** Closest pictogram for an emoji (or a single-emoji string); anything else comes back HTML-escaped. */
export function glyphFromEmoji(s, opts) {
  const k = String(s ?? '').trim();
  const name = EMOJI[k];
  if (name) return glyph(name, opts);
  return k.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** UI3: a <span> holding the pictogram (for el() children where html strings are not an option). */
export function glyphEl(name, opts) {
  const s = document.createElement('span');
  s.className = 'tfg-gi';
  s.innerHTML = glyph(name, opts);
  return s;
}

/** UI3: swap the leftover symbol/emoji characters inside an ALREADY-ESCAPED html string for pictograms (use right before innerHTML). */
const INLINE = { '⚡': 'bolt', '❄': 'snow', '⚙': 'gear', '🔥': 'flame', '🔒': 'lock', '📷': 'camera', '📐': 'book', '🚐': 'van', '🎙': 'mic' };
const INLINE_RE = /(⚡|❄|⚙|🔥|🔒|📷|📐|🚐|🎙)\uFE0F?/g;
export function glyphify(html, opts) {
  return String(html ?? '').replace(INLINE_RE, (_, c) => glyph(INLINE[c], opts));
}

export const GLYPH_NAMES = Object.keys(P);
