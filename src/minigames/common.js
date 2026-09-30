/**
 * TFG — shared minigame helpers.
 *
 * - CRT overlay frame (DOM) + low-res pixel canvas
 * - 3x5 bitmap font for in-canvas text (no web-font dependency, crisp when upscaled)
 * - tiny sprite system (string art + procedural "kefal" fish with a mullet)
 * - particles / floaters, pixel drawing primitives
 * - input plumbing (window key listeners, pointer -> canvas coords), ESC handling
 * - math + seeded rng fallback
 *
 * IMPORTANT: nothing here touches `document` / `window` at import time.
 */

import { tNum as tmg } from '../i18n/tnum.js';   // [i18n8] every minigame string goes through tmg() (exact key, then numbers as {})
import './minigames_i18n.js';
export { tmg };

// ─────────────────────────────────────────────── math ──
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInCubic = (t) => Math.pow(clamp01(t), 3);
export const easeOutBack = (t, s = 1.70158) => {
  const u = clamp01(t) - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
};
export const easeOutElastic = (t) => {
  t = clamp01(t);
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};
export const mod = (n, m) => ((n % m) + m) % m;
export const TAU = Math.PI * 2;

/** Angular difference a-b wrapped into [-PI, PI]. */
export function angleDiff(a, b) {
  let d = mod(a - b, TAU);
  if (d > Math.PI) d -= TAU;
  return d;
}

// ─────────────────────────────────────────────── rng ──
/** Small, fast seeded PRNG (fallback when the game doesn't provide one). */
export function mulberry32(seed) {
  let a = seed >>> 0 || 0x9e3779b9;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Integer hash (stateless noise for scrolling decorations). */
export function ihash(n) {
  n = (n ^ 61) ^ (n >>> 16);
  n = (n + (n << 3)) | 0;
  n ^= n >>> 4;
  n = Math.imul(n, 0x27d4eb2d);
  n ^= n >>> 15;
  return n >>> 0;
}

/** Wraps any rng so it is guaranteed to return [0,1). */
function safeRng(fn) {
  return () => {
    let v = +fn();
    if (!(v >= 0 && v < 1)) v = Number.isFinite(v) ? mod(v, 1) : 0;
    return v;
  };
}

export function makeRng(opts = {}) {
  if (typeof opts.rng === 'function') return safeRng(opts.rng);
  if (opts.seed !== undefined && opts.seed !== null) {
    return mulberry32(typeof opts.seed === 'number' ? opts.seed : hashString(opts.seed));
  }
  return Math.random;
}

export const rrange = (rng, a, b) => a + (b - a) * rng();
export const rint = (rng, a, b) => Math.min(b, a + Math.floor(rng() * (b - a + 1))); // inclusive
export const rpick = (rng, arr) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}
/** Cosmetic randomness (particles etc.) so the game's seeded stream isn't consumed by eye-candy. */
export const fxRand = (a = 0, b = 1) => a + (b - a) * Math.random();

// ─────────────────────────────────────────────── colors ──
export const C = {
  bg: '#020805',
  green: '#39ff6a',
  greenMid: '#22c24c',
  greenDim: '#16813a',
  greenDark: '#0a2e16',
  amber: '#ffb000',
  amberDim: '#8a5c00',
  red: '#ff3b3b',
  redDim: '#6e1212',
  white: '#eafff0',
  cyan: '#6ff3ff',
  blue: '#3fa9ff',
  purple: '#c44dff',
  black: '#000000',
  shadow: '#041008',
};

export const RARITY_COLORS = {
  common: '#d6e2e0',
  uncommon: '#39ff6a',
  rare: '#3fa9ff',
  epic: '#c44dff',
  legendary: '#ffb000',
};

export function hexToRgb(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mixColor(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  t = clamp01(t);
  const r = Math.round(lerp(A[0], B[0], t));
  const g = Math.round(lerp(A[1], B[1], t));
  const bb = Math.round(lerp(A[2], B[2], t));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bb).toString(16).slice(1);
}
export const hsl = (h, s = 100, l = 60) => `hsl(${mod(h, 360)},${s}%,${l}%)`;

// ─────────────────────────────────────────────── bitmap font (3x5) ──
// Each glyph = 5 rows, 3 bits per row (4 = left, 2 = middle, 1 = right).
const GLYPHS = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4],
  Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [7, 1, 7, 4, 7], 3: [7, 1, 3, 1, 7],
  4: [5, 5, 7, 1, 1], 5: [7, 4, 7, 1, 7], 6: [7, 4, 7, 5, 7], 7: [7, 1, 2, 2, 2],
  8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 7],
  ' ': [0, 0, 0, 0, 0], '!': [2, 2, 2, 0, 2], '?': [6, 1, 2, 0, 2], '.': [0, 0, 0, 0, 2],
  ',': [0, 0, 0, 2, 4], ':': [0, 2, 0, 2, 0], ';': [0, 2, 0, 2, 4], '-': [0, 0, 7, 0, 0],
  '+': [0, 2, 7, 2, 0], '/': [1, 1, 2, 4, 4], '\\': [4, 4, 2, 1, 1], $: [3, 6, 2, 3, 6],
  '%': [5, 1, 2, 4, 5], '*': [5, 2, 7, 2, 5], '#': [5, 7, 5, 7, 5], '=': [0, 7, 0, 7, 0],
  '(': [1, 2, 2, 2, 1], ')': [4, 2, 2, 2, 4], '<': [1, 2, 4, 2, 1], '>': [4, 2, 1, 2, 4],
  "'": [2, 2, 0, 0, 0], '"': [5, 5, 0, 0, 0], _: [0, 0, 0, 0, 7], '[': [3, 2, 2, 2, 3],
  ']': [6, 2, 2, 2, 6], '^': [2, 5, 0, 0, 0], '@': [2, 5, 7, 4, 3], '&': [2, 5, 2, 5, 3],
  '|': [2, 2, 2, 2, 2], '~': [0, 3, 6, 0, 0],
  // lowercase x is a small "times" sign (x100); other lowercase letters render uppercase
  x: [0, 5, 2, 5, 0],
  // Cyrillic (Russian): look-alikes reuse the Latin glyph, the rest are drawn in the same 3x5 grid ([i18n8])
  'А': [2, 5, 7, 5, 5], 'Б': [7, 4, 6, 5, 6], 'В': [6, 5, 6, 5, 6], 'Г': [7, 4, 4, 4, 4], 'Д': [3, 5, 5, 7, 5], 'Е': [7, 4, 6, 4, 7], 'Ё': [7, 4, 6, 4, 7],
  'Ж': [5, 2, 7, 2, 5], 'З': [6, 1, 2, 1, 6], 'И': [5, 5, 2, 5, 5], 'Й': [5, 5, 2, 5, 5], 'К': [5, 5, 6, 5, 5], 'Л': [3, 5, 5, 5, 5], 'М': [5, 7, 7, 5, 5],
  'Н': [5, 5, 7, 5, 5], 'О': [2, 5, 5, 5, 2], 'П': [7, 5, 5, 5, 5], 'Р': [6, 5, 6, 4, 4], 'С': [3, 4, 4, 4, 3], 'Т': [7, 2, 2, 2, 2], 'У': [5, 5, 2, 2, 2],
  'Ф': [2, 7, 5, 7, 2], 'Х': [5, 5, 2, 5, 5], 'Ц': [5, 5, 5, 7, 3], 'Ч': [5, 5, 7, 1, 1], 'Ъ': [6, 2, 6, 5, 6], 'Ь': [4, 4, 6, 5, 6], 'Э': [6, 1, 3, 1, 6], 'Я': [3, 5, 3, 5, 5],
};

function normText(text) {
  return tmg(String(text))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[—–]/g, '-')
    .replace(/ı/g, 'I');
}

// wider glyphs where 3px just can't cut it (bits: leftmost = 1 << (w - 1))
const WIDE = {
  M: { w: 5, r: [17, 27, 21, 17, 17] },
  W: { w: 5, r: [17, 17, 21, 27, 17] },
  N: { w: 4, r: [9, 13, 11, 9, 9] },
  'Ш': { w: 5, r: [21, 21, 21, 21, 31] }, 'Щ': { w: 5, r: [21, 21, 21, 31, 1] }, 'Ы': { w: 5, r: [17, 17, 25, 21, 25] }, 'Ю': { w: 5, r: [18, 21, 29, 21, 18] },
  '#': { w: 5, r: [10, 31, 10, 31, 10] },
};

function glyphFor(ch) {
  return GLYPHS[ch] || GLYPHS[ch.toUpperCase()] || GLYPHS['?'];
}
function wideFor(ch) {
  return ch === 'x' ? null : WIDE[ch.toUpperCase()] || null;
}
const glyphW = (ch) => {
  const wd = wideFor(ch);
  return wd ? wd.w : 3;
};

export function textWidth(text, scale = 1, spacing = 1) {
  const str = normText(text);
  if (!str.length) return 0;
  let w = 0;
  for (const ch of str) w += (glyphW(ch) + spacing) * scale;
  return w - spacing * scale;
}

function drawWide(ctx, g, x, y, s) {
  for (let r = 0; r < 5; r++) {
    const b = g.r[r];
    for (let c = 0; c < g.w; c++) if (b & (1 << (g.w - 1 - c))) ctx.fillRect(x + c * s, y + r * s, s, s);
  }
}

function drawGlyph(ctx, g, x, y, s) {
  for (let r = 0; r < 5; r++) {
    const b = g[r];
    if (!b) continue;
    const yy = y + r * s;
    if (b === 7) ctx.fillRect(x, yy, 3 * s, s);
    else if (b === 6) ctx.fillRect(x, yy, 2 * s, s);
    else if (b === 3) ctx.fillRect(x + s, yy, 2 * s, s);
    else {
      if (b & 4) ctx.fillRect(x, yy, s, s);
      if (b & 2) ctx.fillRect(x + s, yy, s, s);
      if (b & 1) ctx.fillRect(x + 2 * s, yy, s, s);
    }
  }
}

/**
 * Draw pixel text. opt: { color, scale, align: left|center|right, shadow: color, spacing,
 *   wave: {amp, t, speed, freq}, charColor: (i, ch) => color }
 * Returns rendered width.
 */
export function drawText(ctx, text, x, y, opt = {}) {
  const color = opt.color || C.green;
  const s = Math.max(1, Math.round(opt.scale || 1));
  const spacing = opt.spacing === undefined ? 1 : opt.spacing;
  const str = normText(text);
  const w = textWidth(str, s, spacing);
  let x0 = Math.round(x);
  if (opt.align === 'center') x0 = Math.round(x - w / 2);
  else if (opt.align === 'right') x0 = Math.round(x - w);
  const y0 = Math.round(y);
  const wave = opt.wave;
  const passes = opt.shadow ? [[opt.shadow, s, s], [null, 0, 0]] : [[null, 0, 0]];
  for (const [shadowCol, ox, oy] of passes) {
    if (shadowCol) ctx.fillStyle = shadowCol;
    let cx = x0;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const wd = wideFor(ch);
      const gw = wd ? wd.w : 3;
      if (ch !== ' ') {
        const dy = wave ? Math.round(Math.sin((wave.t || 0) * (wave.speed || 6) + i * (wave.freq || 0.7)) * (wave.amp || 1)) : 0;
        if (!shadowCol) ctx.fillStyle = opt.charColor ? opt.charColor(i, ch) : color;
        if (wd) drawWide(ctx, wd, cx + ox, y0 + dy + oy, s);
        else drawGlyph(ctx, glyphFor(ch), cx + ox, y0 + dy + oy, s);
      }
      cx += (gw + spacing) * s;
    }
  }
  return w;
}

/** Draw text with a 1px (scaled) dark outline — great for readability over busy art. */
export function drawTextOutlined(ctx, text, x, y, opt = {}) {
  const o = opt.outline || '#000';
  const s = Math.max(1, Math.round(opt.scale || 1));
  const base = { ...opt, shadow: null, charColor: null, color: o };
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) {
    drawText(ctx, text, x + dx * s, y + dy * s, base);
  }
  return drawText(ctx, text, x, y, { ...opt, shadow: null });
}

// ─────────────────────────────────────────────── canvases & sprites ──
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas: c, ctx };
}

/** Sprite from string art. palette maps char -> css color; '.' and ' ' are transparent. */
export function spriteFromRows(rows, palette) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const px = new Array(w * h).fill(null);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch && ch !== '.' && ch !== ' ') px[y * w + x] = palette[ch] || null;
    }
  }
  return { w, h, px, _c: null };
}

export function spriteFromGrid(w, h, px) {
  return { w, h, px, _c: null };
}

/** Same shape, every opaque pixel painted `color` (silhouettes / hit flashes). */
export function tintSprite(spr, color) {
  return { w: spr.w, h: spr.h, px: spr.px.map((c) => (c ? color : null)), _c: null };
}

/** Centre a sprite inside a larger transparent grid. */
export function padSprite(spr, w, h) {
  const px = new Array(w * h).fill(null);
  const ox = Math.floor((w - spr.w) / 2);
  const oy = Math.floor((h - spr.h) / 2);
  for (let y = 0; y < spr.h; y++) {
    for (let x = 0; x < spr.w; x++) {
      const tx = x + ox;
      const ty = y + oy;
      if (tx >= 0 && ty >= 0 && tx < w && ty < h) px[ty * w + tx] = spr.px[y * spr.w + x];
    }
  }
  return { w, h, px, _c: null };
}

function spriteCanvas(spr) {
  if (spr._c) return spr._c;
  if (typeof document === 'undefined') return null;
  const { canvas, ctx } = makeCanvas(spr.w, spr.h);
  for (let y = 0; y < spr.h; y++) {
    for (let x = 0; x < spr.w; x++) {
      const col = spr.px[y * spr.w + x];
      if (col) {
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  spr._c = canvas;
  return canvas;
}

function drawSpritePixels(ctx, spr, x, y, s) {
  for (let yy = 0; yy < spr.h; yy++) {
    for (let xx = 0; xx < spr.w; xx++) {
      const col = spr.px[yy * spr.w + xx];
      if (col) {
        ctx.fillStyle = col;
        ctx.fillRect(x + xx * s, y + yy * s, s, s);
      }
    }
  }
}

/** opt: { scale, flipX, flipY, alpha, sw (width override for squash) } */
export function drawSprite(ctx, spr, x, y, opt = {}) {
  const s = opt.scale || 1;
  const c = spriteCanvas(spr);
  x = Math.round(x);
  y = Math.round(y);
  const a = opt.alpha === undefined ? 1 : opt.alpha;
  if (a <= 0) return;
  const prevA = ctx.globalAlpha;
  if (a < 1) ctx.globalAlpha = prevA * a;
  if (!c) {
    drawSpritePixels(ctx, spr, x, y, s);
  } else {
    ctx.imageSmoothingEnabled = false;
    const w = opt.sw !== undefined ? opt.sw : spr.w * s;
    const h = spr.h * s;
    if (!opt.flipX && !opt.flipY) {
      ctx.drawImage(c, x, y, w, h);
    } else {
      ctx.save();
      ctx.translate(x + (opt.flipX ? w : 0), y + (opt.flipY ? h : 0));
      ctx.scale(opt.flipX ? -1 : 1, opt.flipY ? -1 : 1);
      ctx.drawImage(c, 0, 0, w, h);
      ctx.restore();
    }
  }
  if (a < 1) ctx.globalAlpha = prevA;
}

/** Rotated sprite around its centre (nearest-neighbour => chunky PSX-ish rotation). */
export function drawSpriteRot(ctx, spr, cx, cy, angle, opt = {}) {
  const s = opt.scale || 1;
  const c = spriteCanvas(spr);
  if (!c) return drawSprite(ctx, spr, cx - (spr.w * s) / 2, cy - (spr.h * s) / 2, opt);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (opt.alpha !== undefined) ctx.globalAlpha *= opt.alpha;
  ctx.translate(Math.round(cx), Math.round(cy));
  ctx.rotate(angle);
  if (opt.flipX || opt.flipY) ctx.scale(opt.flipX ? -1 : 1, opt.flipY ? -1 : 1);
  ctx.drawImage(c, -Math.round((spr.w * s) / 2), -Math.round((spr.h * s) / 2), spr.w * s, spr.h * s);
  ctx.restore();
}

// ─────────────────────────────────────────────── the kefal (procedural fish) ──
export const FISH_PAL = {
  kefal: {
    o: '#06110d', back: '#35566a', mid: '#9db6c0', belly: '#e4efe8', stripe: '#6d8a97',
    fin: '#58788a', hair: '#a8501a', hairHi: '#f08a2c', eye: '#000000', eyeHi: '#ffffff',
  },
  golden: {
    o: '#2b1600', back: '#c07c0e', mid: '#ffd23f', belly: '#fff3b0', stripe: '#e6a91e',
    fin: '#e39a12', hair: '#fff3b0', hairHi: '#ffffff', eye: '#2b1600', eyeHi: '#ffffff',
  },
  lufer: {
    o: '#04110f', back: '#1f6f7a', mid: '#5fb6b0', belly: '#d8f0e0', stripe: '#3c8f94',
    fin: '#2e8a8a', hair: '#1f6f7a', hairHi: '#5fb6b0', eye: '#000000', eyeHi: '#ffffff',
  },
  levrek: {
    o: '#0b0f0c', back: '#4c5c52', mid: '#b8c4bc', belly: '#eef3ee', stripe: '#7e8d84',
    fin: '#6d7d74', hair: '#4c5c52', hairHi: '#b8c4bc', eye: '#000000', eyeHi: '#ffffff',
  },
  ghost: {
    o: '#1c0830', back: '#7a3bb0', mid: '#c49bf0', belly: '#f1e3ff', stripe: '#9a62d4',
    fin: '#a070e0', hair: '#ff5fd2', hairHi: '#ffc0ef', eye: '#000000', eyeHi: '#ffffff',
  },
};

/**
 * Procedural pixel fish facing RIGHT. W x H pixels.
 * opt.hair: the signature kefal mullet (business in front, party in the back).
 * opt.tail: -1 | 0 | 1 tail sway frame.
 */
export function makeFishSprite(W, H, pal = FISH_PAL.kefal, opt = {}) {
  const P = { ...FISH_PAL.kefal, ...pal };
  const hair = opt.hair !== false;
  const tailShift = opt.tail || 0;
  const kind = new Uint8Array(W * H); // 0 empty 1 body 2 tail 3 hair 4 dorsal
  const col = new Array(W * H).fill(null);
  const topRows = hair ? Math.max(1, Math.round(H * 0.18)) : H >= 10 ? 1 : 0;
  const x0 = 1;
  const x1 = W - 1;
  const y0 = 1 + topRows;
  const y1 = H - 1;
  const tl = Math.max(2, Math.round((x1 - x0) * 0.26));
  const bx0 = x0 + tl - 1;
  const bx1 = x1;
  const cx = (bx0 + bx1) / 2;
  const rx = (bx1 - bx0) / 2;
  const cy = (y0 + y1) / 2;
  const ry = (y1 - y0) / 2;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : kind[y * W + x]);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const dx = (px - cx) / rx;
      const dy = (py - cy) / ry;
      const e = dx * dx * (dx > 0 ? 1 + 0.35 * dx : 1) + dy * dy;
      if (e <= 1 && y >= y0 && y < y1) {
        kind[y * W + x] = 1;
      } else if (x >= x0 && x <= bx0 && y >= y0 - 1 && y < y1 + 1) {
        const t = (x - x0) / Math.max(1, bx0 - x0);
        const hh = lerp(ry * 1.0, 0.9, t);
        const d = Math.abs(py - (cy + tailShift * (1 - t)));
        const notch = t < 0.45 ? ((0.45 - t) / 0.45) * hh * 0.55 : -1;
        if (d <= hh && d >= notch && y >= 1 && y < H - 1) kind[y * W + x] = 2;
      }
    }
  }

  // body top per column
  const topOf = (x) => {
    for (let y = 0; y < H; y++) if (kind[y * W + x] === 1) return y;
    return -1;
  };

  if (hair) {
    const hx0 = Math.round(cx - rx * 0.45);
    const hx1 = Math.round(cx + rx * 0.5);
    for (let x = hx0 - 1; x <= hx1; x++) {
      const yt = topOf(x);
      if (yt < 0) continue;
      const f = (x - hx0) / Math.max(1, hx1 - hx0);
      const up = x < hx0 ? 0 : f > 0.8 ? Math.max(0, topRows - 1) : topRows;
      const down = x < hx0 ? 2 : f < 0.3 ? 2 : f < 0.55 ? 1 : 0;
      for (let y = yt - up; y < yt + down; y++) {
        if (y >= 1 && y < H - 1) kind[y * W + x] = 3;
      }
    }
  } else if (topRows > 0) {
    // dorsal fin
    const fx0 = Math.round(cx - rx * 0.35);
    const fx1 = Math.round(cx + rx * 0.05);
    for (let x = fx0; x <= fx1; x++) {
      const yt = topOf(x);
      if (yt > 1) kind[(yt - 1) * W + x] = 4;
    }
  }

  // colour pass
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = kind[y * W + x];
      if (!k) continue;
      if (k === 1) {
        const v = (y + 0.5 - (cy - ry)) / (2 * ry);
        let c = v < 0.36 ? P.back : v < 0.7 ? P.mid : P.belly;
        const dx = (x + 0.5 - cx) / rx;
        if (H >= 10 && y === Math.round(cy - ry * 0.1) && dx < 0.45 && dx > -0.85) c = P.stripe;
        col[y * W + x] = c;
      } else if (k === 2 || k === 4) {
        col[y * W + x] = P.fin;
      } else if (k === 3) {
        col[y * W + x] = at(x, y - 1) === 3 ? P.hair : P.hairHi;
      }
    }
  }
  // gill
  if (W >= 12) {
    const gx = Math.round(cx + rx * 0.3);
    for (let y = 0; y < H; y++) {
      if (kind[y * W + gx] !== 1) continue;
      const v = (y + 0.5 - (cy - ry)) / (2 * ry);
      if (v > 0.3 && v < 0.85) col[y * W + gx] = P.stripe;
    }
  }
  // pectoral fin
  if (W >= 16) {
    const fx = Math.round(cx + rx * 0.05);
    const fy = Math.round(cy + ry * 0.25);
    if (kind[fy * W + fx] === 1) col[fy * W + fx] = P.fin;
    if (kind[fy * W + fx - 1] === 1) col[fy * W + fx - 1] = P.fin;
  }
  // eye
  const ex = Math.round(cx + rx * 0.55);
  const ey = Math.round(cy - ry * 0.3);
  if (kind[ey * W + ex] === 1) {
    col[ey * W + ex] = P.eye;
    if (W >= 24) {
      if (kind[ey * W + ex + 1] === 1) col[ey * W + ex + 1] = P.eye;
      if (kind[(ey + 1) * W + ex] === 1) col[(ey + 1) * W + ex] = P.eye;
      if (kind[(ey + 1) * W + ex + 1] === 1) col[(ey + 1) * W + ex + 1] = P.eye;
      col[ey * W + ex] = P.eyeHi;
    } else if (W >= 14 && kind[ey * W + ex - 1] === 1) {
      col[ey * W + ex - 1] = P.eyeHi;
    }
  }
  // mouth
  const my = Math.round(cy + ry * 0.25);
  for (let x = W - 1; x >= 0; x--) {
    if (kind[my * W + x] === 1) {
      col[my * W + x] = P.o;
      break;
    }
  }
  // outline
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (kind[y * W + x]) continue;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) col[y * W + x] = P.o;
    }
  }
  return spriteFromGrid(W, H, col);
}

// ─────────────────────────────────────────────── pixel primitives ──
export function pxRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Raised/bevelled panel. */
export function bevel(ctx, x, y, w, h, base, light, dark, inset = false) {
  pxRect(ctx, x, y, w, h, base);
  pxRect(ctx, x, y, w, 1, inset ? dark : light);
  pxRect(ctx, x, y, 1, h, inset ? dark : light);
  pxRect(ctx, x, y + h - 1, w, 1, inset ? light : dark);
  pxRect(ctx, x + w - 1, y, 1, h, inset ? light : dark);
}

export function pxLine(ctx, x0, y0, x1, y1, color, size = 1) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  ctx.fillStyle = color;
  const off = Math.floor(size / 2);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let guard = 0;
  for (;;) {
    ctx.fillRect(x0 - off, y0 - off, size, size);
    if ((x0 === x1 && y0 === y1) || guard++ > 2000) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

export function pxCircle(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  cx = Math.round(cx);
  cy = Math.round(cy);
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y + r * 0.8));
    ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1);
  }
}

/** Ellipse outline made of pixels (ripples). */
export function pxEllipse(ctx, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  const steps = Math.max(12, Math.round((rx + ry) * 2.2));
  let lx = null;
  let ly = null;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU;
    const x = Math.round(cx + Math.cos(a) * rx);
    const y = Math.round(cy + Math.sin(a) * ry);
    if (x !== lx || y !== ly) ctx.fillRect(x, y, 1, 1);
    lx = x;
    ly = y;
  }
}

/** Quadratic bezier sampled into pixel points. */
export function bezierPoints(x0, y0, cx, cy, x1, y1, step = 1.2) {
  const len = Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy);
  const n = Math.max(2, Math.ceil(len / step));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
  }
  return pts;
}

// ─────────────────────────────────────────────── particles ──
export function createParticles(max = 400) {
  const list = [];
  const api = {
    list,
    spawn(p) {
      if (list.length >= max) list.shift();
      const life = p.life === undefined ? 1 : p.life;
      list.push({ x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, size: 1, color: '#fff', ...p, life, max: life, age: 0 });
    },
    burst(n, fn) {
      for (let i = 0; i < n; i++) api.spawn(fn(i));
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        p.age += dt;
        if (p.life <= 0) {
          list.splice(i, 1);
          continue;
        }
        p.vy += p.g * dt;
        if (p.drag) {
          const k = Math.exp(-p.drag * dt);
          p.vx *= k;
          p.vy *= k;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.floor !== undefined && p.y > p.floor) {
          p.y = p.floor;
          p.vy = -Math.abs(p.vy) * (p.bounce === undefined ? 0.4 : p.bounce);
          p.vx *= 0.75;
        }
        if (p.onUpdate) p.onUpdate(p, dt);
      }
    },
    draw(ctx) {
      const prev = ctx.globalAlpha;
      for (const p of list) {
        const a = p.fade === false ? 1 : clamp01((p.life / p.max) * 1.6);
        ctx.globalAlpha = prev * a;
        if (p.draw) p.draw(ctx, p);
        else {
          ctx.fillStyle = typeof p.color === 'function' ? p.color(p) : p.color;
          const s = p.size;
          ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
        }
      }
      ctx.globalAlpha = prev;
    },
    clear() {
      list.length = 0;
    },
  };
  return api;
}

/** Floating pixel text (e.g. "+1", "-3S"). */
export function floatText(parts, text, x, y, color, opt = {}) {
  parts.spawn({
    x,
    y,
    vy: opt.vy === undefined ? -22 : opt.vy,
    vx: 0,
    drag: 1.5,
    life: opt.life || 0.9,
    draw(ctx, p) {
      const pop = p.age < 0.08 ? 1 : 0;
      drawText(ctx, text, p.x, p.y - pop, { color, scale: opt.scale || 1, align: 'center', shadow: '#000' });
    },
  });
}

/** Standard radial spark burst. */
export function sparkBurst(parts, x, y, n = 12, colors = ['#fff', '#ffe066', '#ffb000'], speed = 70) {
  parts.burst(n, () => {
    const a = fxRand(0, TAU);
    const v = fxRand(0.3, 1) * speed;
    return {
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - speed * 0.2,
      g: 140,
      drag: 2,
      life: fxRand(0.2, 0.55),
      size: fxRand() < 0.3 ? 2 : 1,
      color: colors[(Math.random() * colors.length) | 0],
    };
  });
}

// ─────────────────────────────────────────────── DOM + lifecycle ──
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function normalizeOpts(opts = {}) {
  const o = opts || {};
  const sfxFn = typeof o.sfx === 'function' ? o.sfx : null;
  return {
    ...o,
    container: o.container || (typeof document !== 'undefined' ? document.body : null),
    difficulty: clamp01(Number(o.difficulty) || 0),
    rng: makeRng(o),
    sfx: (name) => {
      if (!sfxFn) return;
      try {
        sfxFn(name);
      } catch (err) {
        /* sound must never break a minigame */
      }
    },
    onDone: typeof o.onDone === 'function' ? o.onDone : () => {},
  };
}

/** Fill an element with help text, highlighting [KEY] tokens. */
export function setHelpText(node, text) {
  node.textContent = '';
  const parts = tmg(String(text || '')).split(/(\[[^\]]+\])/g);
  for (const part of parts) {
    if (!part) continue;
    if (/^\[[^\]]+\]$/.test(part)) node.appendChild(el('span', 'mg-key', part));
    else node.appendChild(document.createTextNode(part));
  }
}

/**
 * Builds the CRT overlay + canvas and wires up input/lifecycle.
 * cfg: { kind, title, tag, status, help, width, height }
 *
 * The returned `mg` object exposes hooks the minigame assigns:
 *   onFrame(dt), onKeyDown(e) -> true if used, onKeyUp(e) -> true if used,
 *   onPointerDown(x, y, e), onPointerMove(x, y, e), onPointerUp(x, y, e),
 *   onEscape(), onBlur(), onFinish(result), onDestroy()
 */
export function createMinigame(rawOpts, cfg) {
  const opts = normalizeOpts(rawOpts);
  const W = cfg.width | 0;
  const H = cfg.height | 0;

  const root = el('div', `mg-root mg-${cfg.kind}`);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', tmg(cfg.title));
  root.tabIndex = -1;
  const frame = el('div', 'mg-frame');
  const head = el('div', 'mg-head');
  const titleWrap = el('div', 'mg-titlewrap');
  titleWrap.append(el('div', 'mg-brand', `TFG // ${tmg(cfg.tag || 'TERMINAL')}`), el('div', 'mg-title', tmg(cfg.title)));
  const statusEl = el('div', 'mg-status', tmg(cfg.status || ''));
  head.append(titleWrap, statusEl);
  const screen = el('div', 'mg-screen');
  const canvas = document.createElement('canvas');
  canvas.className = 'mg-canvas';
  canvas.width = W;
  canvas.height = H;
  canvas.style.setProperty('--mg-ar', String(W / H));
  screen.appendChild(canvas);
  const helpEl = el('div', 'mg-help');
  setHelpText(helpEl, cfg.help);
  const flashEl = el('div', 'mg-flash');
  frame.append(head, screen, helpEl, el('div', 'mg-scan'), flashEl);
  root.appendChild(frame);

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const cleanups = [];
  const state = { done: false, destroyed: false, time: 0 };
  let shakeAmp = 0;
  let flashA = 0;
  let glitchT = 0;
  let pending = null; // { result, t, minShow }

  const pointer = { x: -1, y: -1, down: false, inside: false };

  const mg = {
    opts,
    rng: opts.rng,
    sfx: opts.sfx,
    difficulty: opts.difficulty,
    root,
    frame,
    canvas,
    ctx,
    W,
    H,
    pointer,
    onFrame: null,
    onKeyDown: null,
    onKeyUp: null,
    onPointerDown: null,
    onPointerMove: null,
    onPointerUp: null,
    onEscape: null,
    onBlur: null,
    onFinish: null,
    onDestroy: null,
    get time() {
      return state.time;
    },
    get done() {
      return state.done;
    },
    get destroyed() {
      return state.destroyed;
    },
    get pending() {
      return !!pending;
    },
    listen,
    finish,
    finishAfter,
    shake(amount) {
      shakeAmp = Math.max(shakeAmp, amount);
    },
    flash(color = '#ffffff', strength = 0.5) {
      flashEl.style.background = color;
      flashA = Math.max(flashA, strength);
      flashEl.style.opacity = String(flashA);
    },
    glitch(duration = 0.25) {
      glitchT = Math.max(glitchT, duration);
      root.classList.add('mg-glitching');
    },
    setStatus(text, tone) {
      const txt = tmg(text || '');
      const cls = 'mg-status' + (tone ? ` mg-tone-${tone}` : '');
      if (statusEl.textContent !== txt) statusEl.textContent = txt;
      if (statusEl.className !== cls) statusEl.className = cls;
    },
    setHelp(text) {
      setHelpText(helpEl, text);
    },
    setCursor(c) {
      if (canvas.style.cursor !== c) canvas.style.cursor = c;
    },
    toCanvas,
    api: null,
  };

  function listen(target, type, fn, options) {
    target.addEventListener(type, fn, options);
    cleanups.push(() => target.removeEventListener(type, fn, options));
  }

  function finish(result) {
    if (state.done) return;
    state.done = true;
    pending = null;
    const r = { success: false, cancelled: false, ...result };
    if (mg.onFinish) {
      try {
        mg.onFinish(r);
      } catch (err) {
        console.error(err);
      }
    }
    try {
      opts.onDone(r);
    } catch (err) {
      console.error('[minigame] onDone threw', err);
    }
  }

  /** Show the outcome for `delay` seconds, then report. SPACE/ENTER/click/ESC skip (after minShow). */
  function finishAfter(result, delay = 1.5, minShow = 0.45) {
    if (state.done || pending) return;
    pending = { result, t: delay, minShow };
  }

  function flushPending() {
    if (pending) finish(pending.result);
  }

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / Math.max(1, r.width)) * W;
    const y = ((e.clientY - r.top) / Math.max(1, r.height)) * H;
    return { x, y, inside: x >= 0 && y >= 0 && x < W && y < H };
  }

  // keyboard (capture phase so ESC doesn't also reach game/pause handlers)
  listen(
    window,
    'keydown',
    (e) => {
      if (state.destroyed) return;
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat || state.done) return;
        if (pending) flushPending();
        else if (mg.onEscape) mg.onEscape();
        else finish({ success: false, cancelled: true });
        return;
      }
      const code = e.code || '';
      const isSkipKey = code === 'Space' || code === 'Enter' || code === 'NumpadEnter';
      if (pending) {
        if (isSkipKey) e.preventDefault();
        if (isSkipKey && !e.repeat && pending.minShow <= 0) flushPending();
        return;
      }
      if (state.done) {
        if (isSkipKey || code.startsWith('Arrow')) e.preventDefault();
        return;
      }
      let used = false;
      if (mg.onKeyDown) used = mg.onKeyDown(e) === true;
      if (used || isSkipKey || code.startsWith('Arrow')) e.preventDefault();
    },
    true,
  );
  listen(
    window,
    'keyup',
    (e) => {
      if (state.destroyed) return;
      let used = false;
      if (mg.onKeyUp && !state.done) used = mg.onKeyUp(e) === true;
      if (used || e.code === 'Space') e.preventDefault();
    },
    true,
  );
  listen(window, 'blur', () => {
    pointer.down = false;
    if (mg.onBlur && !state.destroyed) mg.onBlur();
  });

  // pointer
  listen(root, 'contextmenu', (e) => e.preventDefault());
  listen(root, 'pointerdown', (e) => {
    if (state.destroyed) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const p = toCanvas(e);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.inside = p.inside;
    pointer.down = true;
    if (pending) {
      if (pending.minShow <= 0) flushPending();
      return;
    }
    if (state.done) return;
    if (mg.onPointerDown) mg.onPointerDown(p.x, p.y, e, p.inside);
  });
  listen(window, 'pointermove', (e) => {
    if (state.destroyed) return;
    const p = toCanvas(e);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.inside = p.inside;
    if (mg.onPointerMove && !state.done) mg.onPointerMove(p.x, p.y, e, p.inside);
  });
  const up = (e) => {
    if (state.destroyed) return;
    const wasDown = pointer.down;
    pointer.down = false;
    const p = toCanvas(e);
    if (wasDown && mg.onPointerUp && !state.done) mg.onPointerUp(p.x, p.y, e, p.inside);
  };
  listen(window, 'pointerup', up);
  listen(window, 'pointercancel', up);

  function update(dt) {
    if (state.destroyed) return;
    dt = Number(dt);
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    state.time += dt;

    // juice
    if (shakeAmp > 0.05) {
      const a = shakeAmp;
      const dx = (Math.random() * 2 - 1) * a;
      const dy = (Math.random() * 2 - 1) * a;
      const rot = (Math.random() * 2 - 1) * a * 0.08;
      frame.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
      shakeAmp = Math.max(0, shakeAmp - dt * (shakeAmp * 7 + 3));
    } else if (shakeAmp !== 0) {
      shakeAmp = 0;
      frame.style.transform = '';
    }
    if (flashA > 0) {
      flashA = Math.max(0, flashA - dt * 2.8);
      flashEl.style.opacity = String(flashA.toFixed(3));
    }
    if (glitchT > 0) {
      glitchT -= dt;
      if (glitchT <= 0) root.classList.remove('mg-glitching');
    }

    if (mg.onFrame) {
      try {
        mg.onFrame(dt);
      } catch (err) {
        console.error('[minigame] frame error', err);
      }
    }

    if (pending) {
      pending.minShow -= dt;
      pending.t -= dt;
      if (pending.t <= 0) flushPending();
    }
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    pending = null;
    if (mg.onDestroy) {
      try {
        mg.onDestroy();
      } catch (err) {
        console.error(err);
      }
    }
    for (const f of cleanups.splice(0)) f();
    root.remove();
    // hand keyboard focus back to the game view (never to buttons/inputs)
    if (restoreFocus && restoreFocus.isConnected !== false && typeof restoreFocus.focus === 'function') {
      try {
        restoreFocus.focus({ preventScroll: true });
      } catch (err) {
        /* ignore */
      }
    }
  }

  // mount
  const active = document.activeElement;
  const restoreFocus = active && /^(CANVAS|DIV|MAIN|SECTION)$/.test(active.tagName || '') ? active : null;
  if (active && active !== document.body && typeof active.blur === 'function') active.blur();
  if (opts.container) opts.container.appendChild(root);
  try {
    root.focus({ preventScroll: true });
  } catch (err) {
    /* ignore */
  }

  mg.api = { el: root, update, destroy };
  return mg;
}

/** Keyboard helpers */
export const isConfirmKey = (e) => e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter';
export function digitFromEvent(e) {
  if (/^[0-9]$/.test(e.key)) return e.key;
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code || '');
  return m ? m[1] : null;
}
