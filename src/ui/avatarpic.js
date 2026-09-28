// [profile] Avatar / profile-picture helpers: palette, frames, TFG screen-face templates, compact wire encoding,
// default generated avatars (seeded by name) and 2D canvas rendering. The encode / decode / default parts are pure
// (no DOM) so tools/harness/profile.test.mjs can run them in node; canvas / Image are only touched lazily.
//
// AV object  = { m: 'p' | 's', f: frameId, px: <256 hex chars, 16x16 palette indices>, png?: <base64 PNG body, 64x64>, bg?: '#rrggbb' }
//   m 'p' = pixel-editor picture, m 's' = 3D snapshot (px is then the 16x16 thumbnail derived from the snapshot).
// Wire      = 'p' | 's' + frame char + 256 hex chars (258 chars: hello / pinfo / lobby announce). The snapshot PNG (<= 6 KB
//             of base64) travels separately in the 'pf' message, so hello / lobby packets stay tiny.

export const AV_N = 16;                 // pixel grid
export const PX_LEN = AV_N * AV_N;      // 256
export const PNG_MAX = 6144;            // base64 chars (~4.5 KB of PNG): the "6 KB" cap of a snapshot
export const SNAP_SIZE = 64;
export const PNG_SIG = 'iVBORw0KGgo';   // base64 of the PNG signature

export const PAL = [
  '#0b0b0d', '#f4f1e8', '#8a8f98', '#3a3f4a', '#e0332b', '#f08a2a', '#ffd23f', '#7bd24a',
  '#1f8a4c', '#49ff7a', '#2fd0d0', '#3a7bd5', '#5b3fa0', '#ff4fa3', '#8a5a3a', '#f2c9a0',
];
const HEX = '0123456789abcdef';

// ---------------------------------------------------------------- frames
// need: { level } or { ach } unlocks; none = always available (the 4 basic frames).
const stripe = (ctx, x, y, s, t, a, b) => {
  const step = Math.max(2, Math.round(s / 8));
  for (let i = 0; i < s; i += step) {
    ctx.fillStyle = ((i / step) | 0) % 2 ? b : a;
    ctx.fillRect(x + i, y, step, t); ctx.fillRect(x + i, y + s - t, step, t);
    ctx.fillRect(x, y + i, t, step); ctx.fillRect(x + s - t, y + i, t, step);
  }
};
const ring = (ctx, x, y, s, t, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, s, t); ctx.fillRect(x, y + s - t, s, t); ctx.fillRect(x, y, t, s); ctx.fillRect(x + s - t, y, t, s); };
export const FRAMES = [
  { id: 'none', name: 'None', draw: (ctx, x, y, s) => ring(ctx, x, y, s, 1, 'rgba(0,0,0,0.6)') },
  { id: 'amber', name: 'Amber', draw: (ctx, x, y, s, t) => { ring(ctx, x, y, s, t, '#ff8a3d'); ring(ctx, x + t, y + t, s - 2 * t, 1, 'rgba(0,0,0,0.5)'); } },
  { id: 'crt', name: 'CRT', draw: (ctx, x, y, s, t) => { ring(ctx, x, y, s, t, '#49ff7a'); ring(ctx, x + t * 2, y + t * 2, s - 4 * t, 1, 'rgba(73,255,122,0.55)'); } },
  { id: 'hazard', name: 'Hazard', draw: (ctx, x, y, s, t) => stripe(ctx, x, y, s, t * 2, '#ffd23f', '#0b0b0d') },
  { id: 'silver', name: 'Silver', need: { level: 5 }, draw: (ctx, x, y, s, t) => { ring(ctx, x, y, s, t, '#cfd6e0'); ring(ctx, x + t, y + t, s - 2 * t, 1, '#5a6270'); } },
  { id: 'gold', name: 'Gold', need: { level: 15 }, draw: (ctx, x, y, s, t) => { ring(ctx, x, y, s, t * 2, '#ffd23f'); ring(ctx, x + t * 2, y + t * 2, s - 4 * t, 1, '#a8741a'); } },
  { id: 'blood', name: 'Blood', need: { ach: 'first_blood' }, draw: (ctx, x, y, s, t) => { ring(ctx, x, y, s, t, '#e0332b'); stripe(ctx, x + t, y + t, s - 2 * t, 1, '#7a1410', '#e0332b'); } },
  { id: 'void', name: 'Void', need: { level: 30 }, draw: (ctx, x, y, s, t) => { ring(ctx, x, y, s, t * 2, '#5b3fa0'); ring(ctx, x + t * 2, y + t * 2, s - 4 * t, 1, '#ff4fa3'); } },
];
const FRAME_BY_ID = Object.fromEntries(FRAMES.map((f) => [f.id, f]));
const FRAME_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
export const frameChar = (id) => FRAME_CHARS[Math.max(0, FRAMES.findIndex((f) => f.id === id))] || '0';
export const frameFromChar = (c) => FRAMES[FRAME_CHARS.indexOf(c)]?.id || 'none';
export const frameName = (id) => FRAME_BY_ID[id]?.name || 'None';
export function frameUnlocked(id, profile) {
  const f = FRAME_BY_ID[id];
  if (!f) return false;
  if (!f.need) return true;
  if (f.need.level) return (profile?.level || 1) >= f.need.level;
  if (f.need.ach) return !!profile?.achievements?.[f.need.ach];
  return false;
}
export function frameNeedText(id) {
  const n = FRAME_BY_ID[id]?.need;
  if (!n) return '';
  return n.level ? `Level ${n.level}` : n.ach ? 'Achievement: ' + n.ach.replace(/_/g, ' ') : '';
}

// ---------------------------------------------------------------- pixel strings
export const blankPx = (c = 0) => HEX[c & 15].repeat(PX_LEN);
export const isPx = (s) => typeof s === 'string' && s.length === PX_LEN && /^[0-9a-f]+$/.test(s);
export function encodePx(arr) {
  let s = '';
  for (let i = 0; i < PX_LEN; i++) s += HEX[(arr[i] | 0) & 15];
  return s;
}
export function decodePx(str) {
  const out = new Uint8Array(PX_LEN);
  if (!isPx(str)) return out;
  for (let i = 0; i < PX_LEN; i++) out[i] = HEX.indexOf(str[i]);
  return out;
}

/** 4-way flood fill on a Uint8Array grid (in place). */
export function floodFill(arr, x, y, colour) {
  const from = arr[y * AV_N + x];
  if (from === colour) return arr;
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= AV_N || cy >= AV_N || arr[cy * AV_N + cx] !== from) continue;
    arr[cy * AV_N + cx] = colour;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return arr;
}
/** Bresenham line of cells (so a fast drag leaves no gaps). */
export function lineCells(x0, y0, x1, y1) {
  const out = [];
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 64; i++) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return out;
}

// ---------------------------------------------------------------- TFG screen-face templates
// 12x9 screen art ('.' = screen black) placed in a 16x16 CRT monitor.
const FACES = {
  smile: ['............', '..99....99..', '..99....99..', '............', '............', '.9........9.', '..99999999..', '............', '............'],
  happy: ['............', '..99....99..', '.9..9..9..9.', '............', '............', '.9........9.', '..99999999..', '............', '............'],
  dead: ['............', '.4.4....4.4.', '..4......4..', '.4.4....4.4.', '............', '............', '...444444...', '............', '............'],
  angry: ['............', '.44......44.', '..44....44..', '..66....66..', '..66....66..', '............', '..44444444..', '.4........4.', '............'],
  glitch: ['............', '..aa....aa..', '..aad...aad.', '...dd....dd.', '............', '....aaaa....', '............', 'dddd........', '............'],
  logo: ['............', '............', '555.555..55.', '.5..5...5...', '.5..55..5.5.', '.5..5...5.5.', '.5..5....55.', '............', '............'],
};

function monitor(face) {
  const g = new Uint8Array(PX_LEN);
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < AV_N && y < AV_N) g[y * AV_N + x] = c; };
  for (let y = 0; y <= 12; y++) for (let x = 0; x < AV_N; x++) set(x, y, (x === 0 || x === 15 || y === 0 || y === 12) ? 2 : 3);
  for (let y = 2; y <= 10; y++) for (let x = 2; x <= 13; x++) set(x, y, 0);
  for (let y = 2; y <= 10; y++) set(1, y, 3);
  set(14, 11, 4); set(13, 11, 9);                       // power LEDs
  for (let x = 6; x <= 9; x++) set(x, 13, 3);
  for (let x = 4; x <= 11; x++) { set(x, 14, 3); set(x, 15, 2); }
  face.forEach((row, ry) => { for (let rx = 0; rx < 12; rx++) { const ch = row[rx]; if (ch && ch !== '.') set(2 + rx, 2 + ry, HEX.indexOf(ch)); } });
  return encodePx(g);
}
export const TEMPLATES = [
  { id: 'smile', name: 'Smile', px: () => monitor(FACES.smile) },
  { id: 'happy', name: 'Happy', px: () => monitor(FACES.happy) },
  { id: 'dead', name: 'Dead', px: () => monitor(FACES.dead) },
  { id: 'angry', name: 'Angry', px: () => monitor(FACES.angry) },
  { id: 'glitch', name: 'Glitch', px: () => monitor(FACES.glitch) },
  { id: 'logo', name: 'TFG', px: () => monitor(FACES.logo) },
];

// ---------------------------------------------------------------- default (seeded) avatar
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function mulberry32(a) {
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A little symmetrical monster head, fully determined by `seed` (a name). */
export function defaultPx(seed) {
  const rnd = mulberry32(fnv1a(String(seed || 'Employee').toLowerCase()));
  const bgs = [0, 3, 8, 12];
  const bg = bgs[(rnd() * bgs.length) | 0];
  const bodies = [4, 5, 6, 7, 9, 10, 11, 13, 15].filter((c) => c !== bg);
  const body = bodies[(rnd() * bodies.length) | 0];
  const accents = [1, 6, 9, 10, 13, 4].filter((c) => c !== bg && c !== body);
  const acc = accents[(rnd() * accents.length) | 0];
  const g = new Uint8Array(PX_LEN).fill(bg);
  const set = (x, y, c) => { g[y * AV_N + x] = c; g[y * AV_N + (AV_N - 1 - x)] = c; };
  for (let y = 2; y <= 13; y++) {
    for (let x = 2; x <= 7; x++) {
      const dx = (7.5 - x) / 6, dy = Math.abs(y - 7.5) / 6;
      const p = 1.05 - dx * 0.9 - dy * 0.55;                 // dense in the middle, ragged at the edge
      if (rnd() < p) set(x, y, body);
    }
  }
  for (let y = 3; y <= 12; y++) set(7, y, body);           // spine so the head never splits in two
  const ey = 5 + ((rnd() * 2) | 0), ex = 4 + ((rnd() * 2) | 0);
  set(ex, ey, 1); set(ex, ey + 1, 0); set(ex + 1, ey, 1); set(ex + 1, ey + 1, 0);   // eyes: white with dark pupils
  const my = 10 + ((rnd() * 2) | 0);
  for (let x = 5; x <= 7; x++) set(x, my, rnd() < 0.5 ? acc : 0);
  if (rnd() < 0.6) set(2 + ((rnd() * 3) | 0), 2 + ((rnd() * 2) | 0), acc);          // horn / antenna
  return encodePx(g);
}
export const defaultAvatar = (seed) => ({ m: 'p', f: 'none', px: defaultPx(seed) });

// ---------------------------------------------------------------- wire format + validation
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
export const isPng = (s) => typeof s === 'string' && s.length >= 40 && s.length <= PNG_MAX + 4 && s.startsWith(PNG_SIG) && B64.test(s);

/** Clean an AV-shaped object (from a save file or the network). Returns null when it is not usable. */
export function sanitizeAvatar(a) {
  if (!a || typeof a !== 'object') return null;
  if (!isPx(a.px)) return null;
  const m = a.m === 's' && isPng(a.png) ? 's' : 'p';
  const out = { m, f: FRAME_BY_ID[a.f] ? a.f : 'none', px: a.px };
  if (m === 's') out.png = a.png;
  if (typeof a.bg === 'string' && /^#[0-9a-f]{6}$/i.test(a.bg)) out.bg = a.bg;
  return out;
}
/** 258-char wire string (no snapshot bytes). */
export function toWire(a) {
  const av = sanitizeAvatar(a);
  return av ? av.m + frameChar(av.f) + av.px : '';
}
/** Wire string (+ optional snapshot body) -> AV, or null. */
export function fromWire(str, png) {
  if (typeof str !== 'string' || str.length !== PX_LEN + 2 || (str[0] !== 'p' && str[0] !== 's')) return null;
  return sanitizeAvatar({ m: str[0] === 's' && png ? 's' : 'p', f: frameFromChar(str[1]), px: str.slice(2), png });
}
/** The AV to show for a profile (own avatar, or the default generated from the name). */
export function avatarOfProfile(p) {
  return sanitizeAvatar(p?.avatar) || defaultAvatar(p?.name);
}
export const liteOf = (p) => toWire(avatarOfProfile(p));

// ---------------------------------------------------------------- rendering (2D canvas)
const pxCache = new Map();      // px string -> 16x16 canvas
function pxCanvas(px) {
  let c = pxCache.get(px);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = AV_N;
  const g = c.getContext('2d');
  const arr = decodePx(px);
  for (let i = 0; i < PX_LEN; i++) { g.fillStyle = PAL[arr[i]]; g.fillRect(i % AV_N, (i / AV_N) | 0, 1, 1); }
  if (pxCache.size > 96) pxCache.delete(pxCache.keys().next().value);
  pxCache.set(px, c);
  return c;
}
const imgCache = new Map();     // png body -> { img, ready, cbs }
function pngImage(png, cb) {
  let e = imgCache.get(png);
  if (!e) {
    const img = new Image();
    e = { img, ready: false, cbs: [] };
    img.onload = () => { e.ready = true; const l = e.cbs; e.cbs = []; l.forEach((f) => f()); };
    img.onerror = () => { e.cbs = []; e.bad = true; };
    img.src = 'data:image/png;base64,' + png;
    if (imgCache.size > 24) imgCache.delete(imgCache.keys().next().value);
    imgCache.set(png, e);
  }
  if (!e.ready && !e.bad && cb) e.cbs.push(cb);
  return e.ready ? e.img : null;
}

/** Draw an avatar (picture + frame) into a 2D context. `thumb` forces the 16x16 version (icons). */
export function drawAvatar(ctx, av, x, y, size, { thumb = false, onReady, frame = true } = {}) {
  av = sanitizeAvatar(av) || defaultAvatar('Employee');
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const img = av.m === 's' && av.png && !thumb && size > 24 ? pngImage(av.png, onReady) : null;
  if (img) { ctx.imageSmoothingEnabled = size < SNAP_SIZE * 2; ctx.drawImage(img, x, y, size, size); } else ctx.drawImage(pxCanvas(av.px), x, y, size, size);
  if (frame) {
    const f = FRAME_BY_ID[av.f] || FRAMES[0];
    f.draw(ctx, x, y, size, Math.max(1, Math.round(size / 24)));
  }
  ctx.restore();
}
/** Draw the raw 16x16 grid at `size` px with an optional cell grid (pixel editor). */
export function drawPixelGrid(ctx, px, x, y, size, grid = true) {
  const arr = decodePx(px), c = size / AV_N;
  for (let i = 0; i < PX_LEN; i++) {
    ctx.fillStyle = PAL[arr[i]];
    const cx = i % AV_N, cy = (i / AV_N) | 0;
    ctx.fillRect(x + Math.round(cx * c), y + Math.round(cy * c), Math.ceil(c), Math.ceil(c));
  }
  if (grid) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 1; i < AV_N; i++) { ctx.fillRect(x + Math.round(i * c), y, 1, size); ctx.fillRect(x, y + Math.round(i * c), size, 1); }
  }
}

/** A <canvas class="av"> showing the avatar; `repaint(av)` swaps the picture in place. */
export function avatarCanvas(av, size = 24, opts = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.className = 'av' + (opts.cls ? ' ' + opts.cls : '');
  c.style.cssText = `width:${size}px;height:${size}px;image-rendering:pixelated;vertical-align:middle;flex:none`;
  const paint = (a) => { const g = c.getContext('2d'); g.clearRect(0, 0, size, size); drawAvatar(g, a, 0, 0, size, { ...opts, onReady: () => paint(a) }); };
  c.repaint = paint;
  paint(av);
  return c;
}
/** PNG data URL of a small avatar (for innerHTML <img>). */
export function avatarDataUrl(av, size = 20) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  drawAvatar(c.getContext('2d'), av, 0, 0, size, { thumb: true });
  return c.toDataURL('image/png');
}

// ---------------------------------------------------------------- snapshot helpers
/** Nearest palette index of an RGB colour. */
const PAL_RGB = PAL.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
export function nearestPal(r, g, b) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < 16; i++) { const p = PAL_RGB[i]; const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
/** 16x16 palette thumbnail (block average) of a 64x64 canvas. */
export function thumbOfCanvas(canvas) {
  const s = canvas.width, k = s / AV_N;
  const d = canvas.getContext('2d').getImageData(0, 0, s, s).data;
  const out = new Uint8Array(PX_LEN);
  for (let cy = 0; cy < AV_N; cy++) for (let cx = 0; cx < AV_N; cx++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = cy * k; y < (cy + 1) * k; y++) for (let x = cx * k; x < (cx + 1) * k; x++) { const i = (y * s + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    out[cy * AV_N + cx] = nearestPal(r / n, g / n, b / n);
  }
  return encodePx(out);
}
/**
 * PNG body (base64, no data: prefix) of a 64x64 canvas, at most `max` chars: the picture is posterised harder
 * (32 -> 3 levels per channel) and finally downscaled until it fits. Returns '' if nothing fits.
 * `encode(canvas) -> dataURL` is injectable for tests.
 */
export function capPng(canvas, max = PNG_MAX, encode = (c) => c.toDataURL('image/png')) {
  const body = (u) => u.slice(u.indexOf(',') + 1);
  let size = canvas.width;
  let src = canvas;
  for (let shrink = 0; shrink < 3; shrink++) {
    for (const levels of [0, 32, 16, 12, 8, 6, 5, 4, 3]) {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, size, size);
      if (levels) {
        const im = g.getImageData(0, 0, size, size), d = im.data, st = 255 / (levels - 1);
        for (let i = 0; i < d.length; i += 4) { d[i] = Math.round(Math.round(d[i] / st) * st); d[i + 1] = Math.round(Math.round(d[i + 1] / st) * st); d[i + 2] = Math.round(Math.round(d[i + 2] / st) * st); d[i + 3] = 255; }
        g.putImageData(im, 0, 0);
      }
      const b = body(encode(c));
      if (b.length <= max) return b;
    }
    size = Math.round(size * 0.75);
  }
  return '';
}
