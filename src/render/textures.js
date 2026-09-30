// TFG - procedural PSX pixel-art textures (canvas generated, deterministic).
//
// API
//   TEXTURE_NAMES                     list of every built-in texture name
//   getTexture(name)                  cached shared THREE.Texture (unknown name -> magenta/black checker)
//   makeCanvasTexture(w, h, drawFn)   drawFn(ctx, w, h) -> PSX-configured THREE.CanvasTexture
//   seededRandom(seed)                small deterministic RNG () => [0,1)
// Extras (used by src/models/*):
//   getMaterial(tex, color, opts)     cached MeshLambertMaterial per (texture, color, opts)
//   getBasicMaterial(tex, color, opts) cached MeshBasicMaterial (unlit / emissive bits)
//   isAlphaTexture(name), hashString(str)
//
// Every function is lazy: nothing touches `document` at import time. Without a DOM (Node tests)
// getTexture / makeCanvasTexture return null so models still build (materials just have no map).

import * as THREE from 'three';

// ------------------------------------------------------------------------------------------ RNG
export function hashString(str) {
  let h = 2166136261;
  str = String(str);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 - tiny deterministic RNG. Accepts numbers or strings. */
export function seededRandom(seed = 1) {
  let a = (typeof seed === 'string' ? hashString(seed) : Math.floor(Number(seed) || 0)) >>> 0;
  if (a === 0) a = 0x9e3779b9;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------------------ color helpers
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scl = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

// ------------------------------------------------------------------- tileable value noise / fbm
function valueNoise(rnd, w, h, cx, cy = cx) {
  const gx = Math.max(1, Math.round(w / cx));
  const gy = Math.max(1, Math.round(h / cy));
  const g = new Float32Array(gx * gy);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * gy, iy = Math.floor(fy), ty = smooth(fy - iy);
    const y0 = (iy % gy) * gx, y1 = ((iy + 1) % gy) * gx;
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * gx, ix = Math.floor(fx), tx = smooth(fx - ix);
      const x0 = ix % gx, x1 = (ix + 1) % gx;
      out[y * w + x] = lerp(lerp(g[y0 + x0], g[y0 + x1], tx), lerp(g[y1 + x0], g[y1 + x1], tx), ty);
    }
  }
  return out;
}

/** Normalised (0..1) tileable fbm. cells: list of cell sizes (number or [cx, cy]). */
function fbm(rnd, w, h, cells = [16, 8, 4]) {
  const out = new Float32Array(w * h);
  let amp = 1;
  for (const c of cells) {
    const n = Array.isArray(c) ? valueNoise(rnd, w, h, c[0], c[1]) : valueNoise(rnd, w, h, c);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    amp *= 0.5;
  }
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < out.length; i++) { if (out[i] < mn) mn = out[i]; if (out[i] > mx) mx = out[i]; }
  const k = mx > mn ? 1 / (mx - mn) : 0;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) * k;
  return out;
}

// ------------------------------------------------------------------------- 3x5 pixel font
const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '101111111111101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
  8: '111101111101111', 9: '111101111001110',
  '.': '000000000000010', ',': '000000000010100', '!': '010010010000010', '?': '110001010000010',
  '-': '000000111000000', ':': '000010000010000', "'": '010010000000000', '/': '001001010100100',
  '+': '000010111010000', '#': '101111101111101', '%': '101001010100101', '>': '100010001010100',
  '<': '001010100010001', '=': '000111000111000', '*': '000101010101000', _: '000000000000111',
  $: '011110010011110', '(': '010100100100010', ')': '010001001001010', '"': '101101000000000',
};
const textW = (str, s = 1) => String(str).length * 4 * s - s;

// ------------------------------------------------------------------------------ pixel buffer
class Pix {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
    for (let i = 3; i < this.d.length; i += 4) this.d[i] = 255;
  }
  idx(x, y) {
    const w = this.w, h = this.h;
    x = Math.floor(x) % w; if (x < 0) x += w;
    y = Math.floor(y) % h; if (y < 0) y += h;
    return (y * w + x) * 4;
  }
  get(x, y) { const i = this.idx(x, y), d = this.d; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; }
  set(x, y, c, a = 1) {
    if (a <= 0) return;
    const i = this.idx(x, y), d = this.d;
    const ca = c.length > 3 ? c[3] : 255;
    if (a >= 1 || d[i + 3] === 0) {
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
      d[i + 3] = a >= 1 ? ca : Math.max(ca * a, 140);
      return;
    }
    d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a;
    d[i + 3] = Math.max(d[i + 3], ca * a);
  }
  mul(x, y, f) { const i = this.idx(x, y), d = this.d; d[i] *= f; d[i + 1] *= f; d[i + 2] *= f; }
  add(x, y, v) { const i = this.idx(x, y), d = this.d; d[i] += v; d[i + 1] += v; d[i + 2] += v; }
  alpha(x, y, a) { this.d[this.idx(x, y) + 3] = a; }
  getA(x, y) { return this.d[this.idx(x, y) + 3]; }
  each(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) fn(x, y, y * this.w + x); }
  clear() { this.d.fill(0); }
  fill(c) { this.rect(0, 0, this.w, this.h, c); }
  rect(x, y, w, h, c, a = 1) {
    x = Math.round(x); y = Math.round(y);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.set(x + xx, y + yy, c, a);
  }
  mulRect(x, y, w, h, f) {
    x = Math.round(x); y = Math.round(y);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.mul(x + xx, y + yy, f);
  }
  frame(x, y, w, h, c, a = 1) {
    this.rect(x, y, w, 1, c, a); this.rect(x, y + h - 1, w, 1, c, a);
    this.rect(x, y + 1, 1, h - 2, c, a); this.rect(x + w - 1, y + 1, 1, h - 2, c, a);
  }
  bevel(x, y, w, h, hi = 1.2, lo = 0.65) {
    for (let i = 0; i < w; i++) { this.mul(x + i, y, hi); this.mul(x + i, y + h - 1, lo); }
    for (let i = 1; i < h - 1; i++) { this.mul(x, y + i, hi); this.mul(x + w - 1, y + i, lo); }
  }
  line(x0, y0, x1, y1, c, a = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c, a);
  }
  mulLine(x0, y0, x1, y1, f) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.mul(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), f);
  }
  circle(cx, cy, r, c, a = 1) {
    const R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy <= r * r + 0.5) this.set(cx + dx, cy + dy, c, a);
    }
  }
  ellipse(cx, cy, rx, ry, c, a = 1) {
    const RX = Math.ceil(rx), RY = Math.ceil(ry);
    for (let dy = -RY; dy <= RY; dy++) for (let dx = -RX; dx <= RX; dx++) {
      if ((dx * dx) / (rx * rx + 0.3) + (dy * dy) / (ry * ry + 0.3) <= 1) this.set(cx + dx, cy + dy, c, a);
    }
  }
  ring(cx, cy, r0, r1, c, a = 1) {
    const R = Math.ceil(r1);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= r0 && d <= r1) this.set(cx + dx, cy + dy, c, a);
    }
  }
  noiseFill(rnd, c0, c1, cells = [16, 8, 4], grain = 10) {
    const n = fbm(rnd, this.w, this.h, cells);
    const d = this.d;
    for (let i = 0; i < n.length; i++) {
      const g = (rnd() - 0.5) * grain;
      d[i * 4] = lerp(c0[0], c1[0], n[i]) + g;
      d[i * 4 + 1] = lerp(c0[1], c1[1], n[i]) + g;
      d[i * 4 + 2] = lerp(c0[2], c1[2], n[i]) + g;
      d[i * 4 + 3] = 255;
    }
    return n;
  }
  grime(rnd, amt = 0.3, cells = [16, 8, 4], pow = 2) {
    const n = fbm(rnd, this.w, this.h, cells);
    this.each((x, y, i) => this.mul(x, y, 1 - amt * Math.pow(n[i], pow)));
  }
  grain(rnd, amt = 8) { this.each((x, y) => this.add(x, y, (rnd() - 0.5) * amt)); }
  text(str, x, y, c, s = 1, a = 1) {
    str = String(str).toUpperCase();
    let cx = Math.round(x);
    y = Math.round(y);
    for (const ch of str) {
      const g = GLYPHS[ch];
      if (g) {
        for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) {
          if (g[r * 3 + q] === '1') this.rect(cx + q * s, y + r * s, s, s, c, a);
        }
      }
      cx += 4 * s;
    }
    return cx - x - s;
  }
  textC(str, cx, y, c, s = 1, a = 1) { return this.text(str, Math.round(cx - textW(str, s) / 2), y, c, s, a); }
  /** text with a 1px drop shadow */
  textS(str, cx, y, c, sh, s = 1) { this.textC(str, cx + 1, y + 1, sh, s); this.textC(str, cx, y, c, s); }
  toCtx(ctx) {
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.d);
    ctx.putImageData(img, 0, 0);
  }
}

// ----------------------------------------------------------------------- drawing helpers
function speckle(p, r, n, c, a = 1) { for (let i = 0; i < n; i++) p.set(r() * p.w, r() * p.h, c, a); }
function specks(p, r, n, f) { for (let i = 0; i < n; i++) p.mul(r() * p.w, r() * p.h, f); }

function crack(p, r, len, c, x0, y0, depth = 0) {
  let x = x0 ?? r() * p.w, y = y0 ?? r() * p.h, a = r() * Math.PI * 2;
  for (let i = 0; i < len; i++) {
    p.set(x, y, c, 0.85);
    p.mul(x + 1, y + 1, 1.1);
    a += (r() - 0.5) * 1.2;
    x += Math.cos(a); y += Math.sin(a);
    if (depth < 2 && r() < 0.07) crack(p, r, Math.floor(len * 0.4), c, x, y, depth + 1);
  }
}
function scratches(p, r, n, c, a = 0.5) {
  for (let i = 0; i < n; i++) {
    const x = r() * p.w, y = r() * p.h, l = 3 + r() * 9, an = r() * Math.PI;
    p.line(x, y, x + Math.cos(an) * l, y + Math.sin(an) * l, c, a);
  }
}
function drips(p, r, n, c, a, maxLen = 20) {
  for (let i = 0; i < n; i++) {
    let x = r() * p.w;
    const y = r() * p.h, l = 4 + r() * maxLen;
    for (let k = 0; k < l; k++) {
      p.set(x, y + k, c, a * (1 - k / l));
      if (r() < 0.05) x += r() < 0.5 ? -1 : 1;
    }
  }
}
function stain(p, r, cx, cy, rad, c, a) {
  const R = Math.ceil(rad * 1.3);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.sqrt(dx * dx + dy * dy) / rad + (r() - 0.5) * 0.3;
    if (d < 1) p.set(cx + dx, cy + dy, c, a * (1 - d * 0.6));
  }
}
function rivet(p, x, y) {
  p.mul(x, y, 1.5); p.mul(x + 1, y, 1.15); p.mul(x, y + 1, 1.15);
  p.mul(x + 1, y + 1, 0.55); p.mul(x + 2, y + 1, 0.8); p.mul(x + 1, y + 2, 0.8);
}
function brushed(p, r, c0, c1, grain = 8) {
  p.noiseFill(r, c0, c1, [[32, 4], [16, 2], 8], grain);
  for (let y = 0; y < p.h; y++) {
    const f = 0.95 + r() * 0.1;
    for (let x = 0; x < p.w; x++) p.mul(x, y, f);
  }
}
function rustify(p, r, thresh = 0.55, amt = 1) {
  const n = fbm(r, p.w, p.h, [16, 8, 4, 2]);
  p.each((x, y, i) => {
    const t = (n[i] - thresh) / 0.25;
    if (t > 0) p.set(x, y, mix([150, 82, 40], [92, 44, 22], Math.min(1, r() * 0.6 + t * 0.4)), Math.min(1, t * 1.5) * amt);
  });
}
function tiles(p, r, size, colorAt, grout) {
  for (let ty = 0; ty < p.h; ty += size) for (let tx = 0; tx < p.w; tx += size) {
    const base = colorAt(tx / size, ty / size), v = 0.93 + r() * 0.12;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (x === 0 || y === 0) { p.set(tx + x, ty + y, grout); continue; }
      let f = v * (0.96 + r() * 0.07);
      if (x === 1 || y === 1) f *= 1.08; else if (x === size - 1 || y === size - 1) f *= 0.9;
      p.set(tx + x, ty + y, scl(base, f));
    }
  }
}
function planks(p, r, ph, base, o = {}) {
  const g = fbm(r, p.w, p.h, [[p.w, 2], [16, 1], [8, 1]]);
  for (let py = 0; py < p.h; py += ph) {
    const pc = scl(base, 0.82 + r() * 0.3);
    const js = [];
    for (let q = 0; q < (o.joints ?? 1); q++) js.push(Math.floor(r() * p.w));
    for (let y = 0; y < ph && py + y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const i = (py + y) * p.w + x;
      let c = mix(scl(pc, 0.7), scl(pc, 1.12), g[i]);
      if (o.gaps !== false && y === 0) c = scl(pc, 0.32);
      else if (o.gaps !== false && y === 1) c = scl(c, 1.1);
      else if (js.includes(x)) c = scl(pc, 0.4);
      p.set(x, py + y, c);
    }
    if (o.nails) for (const jx of js) { p.set(jx - 2, py + 3, [38, 34, 30]); p.set(jx + 2, py + 3, [38, 34, 30]); p.set(jx - 2, py + ph - 3, [38, 34, 30]); p.set(jx + 2, py + ph - 3, [38, 34, 30]); }
    if (r() < 0.5) { const kx = r() * p.w, ky = py + 2 + r() * (ph - 4); p.ellipse(kx, ky, 2, 1, scl(pc, 0.5), 0.8); }
  }
  p.grain(r, 8);
}
function checker(p, a, b, s) { p.each((x, y) => p.set(x, y, (((x / s) | 0) + ((y / s) | 0)) & 1 ? a : b)); }
function paper(p, r, base) {
  p.noiseFill(r, scl(base, 0.88), scl(base, 1.04), [16, 8, 4], 10);
  p.each((x, y) => {
    const e = Math.min(x, y, p.w - 1 - x, p.h - 1 - y);
    if (e < 3) p.mul(x, y, 0.8 + e * 0.06);
  });
  for (let i = 0; i < 3; i++) stain(p, r, r() * p.w, r() * p.h, 4 + r() * 8, [120, 100, 60], 0.22);
}
function tapeCorners(p) {
  const c = [214, 208, 170];
  p.rect(0, 0, 6, 3, c, 0.75); p.rect(p.w - 6, 0, 6, 3, c, 0.75);
}
function hazard(p, x, y, w, h, period = 8) {
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    p.set(x + xx, y + yy, ((xx + yy + x + y) % (period * 2)) < period ? [214, 168, 32] : [28, 26, 22]);
  }
}
function skullIcon(p, cx, cy, c, bg) {
  p.ellipse(cx, cy, 6, 5, c);
  p.rect(cx - 3, cy + 4, 7, 4, c);
  p.circle(cx - 3, cy, 1.6, bg); p.circle(cx + 3, cy, 1.6, bg);
  p.set(cx, cy + 3, bg);
  for (let i = -2; i <= 2; i += 2) p.rect(cx + i, cy + 6, 1, 2, bg);
}
function boltIcon(p, x, y, c) {
  // lightning bolt ~9x14
  const pts = [[5, 0], [1, 7], [4, 7], [2, 13], [8, 5], [5, 5], [7, 0]];
  for (let yy = 0; yy < 14; yy++) {
    // rasterise polygon by scanline (even-odd)
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      const sy = yy + 0.5;
      if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) for (let xx = Math.round(xs[i]); xx < Math.round(xs[i + 1]); xx++) p.set(x + xx, y + yy, c);
  }
}

/** Pixel fish, head toward -x (left). Used on signs, labels, posters. */
function drawFish(p, cx, cy, L, H, back, belly, o = {}) {
  const hl = L * 0.36, hh = H / 2, bx = cx - L * 0.08;
  const tx0 = bx + hl * 0.8, tl = L * 0.28;
  for (let x = 0; x <= tl; x++) {
    const hy = 1 + (x / tl) * hh * 0.95;
    for (let y = -hy; y <= hy; y++) {
      if (x > tl * 0.72 && Math.abs(y) < hy * 0.3) continue;
      p.set(tx0 + x, cy + y, scl(back, 0.8));
    }
  }
  const fl = hl * 0.8;
  for (let i = 0; i < fl; i++) {
    const fh = (1 - i / fl) * hh * 0.6;
    for (let y = 0; y < fh; y++) p.set(bx - hl * 0.15 + i, cy - hh + 1 - y, scl(back, 0.75));
  }
  for (let y = -Math.ceil(hh); y <= hh; y++) for (let x = -Math.ceil(hl); x <= hl; x++) {
    const e = (x * x) / (hl * hl) + (y * y) / (hh * hh);
    if (e > 1) continue;
    let c = y < -hh * 0.1 ? back : y < hh * 0.35 ? mix(back, belly, 0.55) : belly;
    if (((Math.round(x) + Math.round(y) * 2) & 3) === 0) c = scl(c, 0.86);
    if (e > 0.78) c = scl(c, 0.78);
    p.set(bx + x, cy + y, c);
  }
  const ex = bx - hl * 0.6, ey = cy - hh * 0.22, er = Math.max(1, H * 0.1);
  p.circle(ex, ey, er, o.eye || [236, 234, 222]);
  p.circle(ex, ey, Math.max(0.4, er * 0.45), o.pupil || [10, 10, 10]);
  p.line(bx - hl, cy + hh * 0.15, bx - hl * 0.72, cy + hh * 0.25, [30, 24, 24]);
  for (let y = -hh * 0.5; y <= hh * 0.5; y++) p.mul(bx - hl * 0.3, cy + y, 0.72);
  return { ex, ey, hx: bx - hl, top: cy - hh };
}

// -------------------------------------------------------------------------------- registry
const DEFS = Object.create(null);
const ALPHA = new Set();
function def(name, w, h, fn, alpha = false) {
  DEFS[name] = { w, h, fn };
  if (alpha) ALPHA.add(name);
}
/** [repomaps] external texture registration (src/render/studio_textures.js); a name that already exists is left alone */
export function registerTexture(name, w, h, fn, alpha = false) { if (!DEFS[name]) def(name, w, h, fn, alpha); }

// ===== concrete / stone
def('concrete', 64, 64, (p, r) => {
  p.noiseFill(r, [86, 85, 80], [134, 132, 124], [16, 8, 4, 2], 14);
  speckle(p, r, 110, [64, 63, 60], 0.7);
  speckle(p, r, 70, [160, 158, 150], 0.5);
  crack(p, r, 16, [52, 52, 50]);
  crack(p, r, 24, [52, 52, 50]);
});
def('concrete_dark', 64, 64, (p, r) => {
  p.noiseFill(r, [44, 44, 44], [78, 77, 74], [16, 8, 4, 2], 12);
  speckle(p, r, 90, [30, 30, 30], 0.7);
  speckle(p, r, 40, [100, 100, 96], 0.4);
  crack(p, r, 20, [24, 24, 24]);
  p.grime(r, 0.3);
});
def('concrete_stained', 64, 64, (p, r) => {
  p.noiseFill(r, [84, 82, 76], [128, 126, 116], [16, 8, 4, 2], 14);
  speckle(p, r, 80, [60, 58, 54], 0.6);
  drips(p, r, 14, [70, 60, 44], 0.35, 30);
  drips(p, r, 8, [110, 62, 32], 0.3, 20);
  for (let i = 0; i < 4; i++) stain(p, r, r() * 64, r() * 64, 5 + r() * 9, [72, 66, 50], 0.35);
  crack(p, r, 22, [50, 48, 44]);
  p.grime(r, 0.3);
});
def('asphalt', 64, 64, (p, r) => {
  p.noiseFill(r, [40, 40, 42], [62, 62, 64], [8, 4, 2], 22);
  speckle(p, r, 160, [96, 94, 90], 0.6);
  crack(p, r, 30, [22, 22, 22]);
  stain(p, r, r() * 64, r() * 64, 10, [28, 28, 30], 0.4);
});
def('brick', 64, 64, (p, r) => {
  p.noiseFill(r, [104, 98, 90], [124, 118, 108], [8, 4], 10);
  for (let row = 0; row < 8; row++) {
    const off = (row & 1) * 8;
    for (let bx = 0; bx < 4; bx++) {
      const base = pick(r, [[122, 54, 40], [140, 66, 48], [108, 48, 36], [132, 72, 52], [96, 50, 40]]);
      const f = 0.85 + r() * 0.25;
      for (let y = 1; y < 8; y++) for (let x = 1; x < 16; x++) {
        let c = scl(base, f * (0.9 + r() * 0.16));
        if (y === 1) c = scl(c, 1.12); else if (y === 7) c = scl(c, 0.8);
        p.set(bx * 16 + off + x, row * 8 + y, c);
      }
    }
  }
  specks(p, r, 60, 0.7);
  p.grime(r, 0.35);
});
def('marble', 64, 64, (p, r) => {
  const n = p.noiseFill(r, [196, 194, 188], [222, 220, 214], [16, 8, 4], 6);
  const t = fbm(r, 64, 64, [16, 8, 4]);
  p.each((x, y, i) => {
    const v = Math.abs(Math.sin(((x + y) / 64) * Math.PI * 2 * 2 + t[i] * 7));
    if (v < 0.07) p.set(x, y, [118, 118, 124], 0.8);
    else if (v < 0.16) p.mul(x, y, 0.88);
    if (n[i] > 0.9) p.mul(x, y, 0.95);
  });
});
def('rock', 64, 64, (p, r) => {
  const n = p.noiseFill(r, [70, 68, 64], [150, 146, 136], [32, 16, 8, 4], 16);
  p.each((x, y, i) => {
    const s = Math.sin(((y + n[i] * 12) / 16) * Math.PI * 2);
    if (s > 0.9) p.mul(x, y, 0.7); else if (s > 0.75) p.mul(x, y, 1.12);
  });
  for (let i = 0; i < 4; i++) crack(p, r, 12 + r() * 16, [44, 42, 40]);
  speckle(p, r, 40, [98, 110, 70], 0.6);
  speckle(p, r, 60, [170, 168, 160], 0.4);
});

// ===== metal
def('metal', 64, 64, (p, r) => {
  brushed(p, r, [96, 100, 104], [134, 138, 142]);
  scratches(p, r, 12, [178, 182, 186]);
  p.grime(r, 0.25);
});
def('metal_dark', 64, 64, (p, r) => {
  brushed(p, r, [40, 42, 45], [66, 68, 72], 6);
  scratches(p, r, 8, [98, 100, 104]);
  p.grime(r, 0.2);
});
def('metal_rust', 64, 64, (p, r) => {
  brushed(p, r, [92, 94, 96], [128, 128, 128]);
  rustify(p, r, 0.45);
  drips(p, r, 10, [120, 60, 30], 0.35, 18);
  p.grime(r, 0.25);
});
def('metal_plate', 64, 64, (p, r) => {
  p.noiseFill(r, [90, 93, 94], [120, 123, 124], [16, 8, 4], 10);
  for (let py = 0; py < 64; py += 32) for (let px = 0; px < 64; px += 32) {
    p.mulRect(px, py, 32, 32, 0.95 + r() * 0.1);
    p.bevel(px, py, 32, 32, 1.3, 0.55);
    for (let k = 4; k < 32; k += 8) { rivet(p, px + k, py + 3); rivet(p, px + k, py + 27); rivet(p, px + 3, py + k); rivet(p, px + 27, py + k); }
  }
  drips(p, r, 6, [112, 62, 34], 0.3, 12);
  scratches(p, r, 6, [160, 162, 164], 0.4);
  p.grime(r, 0.3);
});
def('metal_grate', 64, 64, (p, r) => {
  p.clear();
  const bar = [112, 114, 110];
  const n = fbm(r, 64, 64, [16, 8]);
  p.each((x, y, i) => {
    const bx = x % 8, by = y % 8;
    if (bx < 2 || by < 2) {
      let c = scl(bar, (bx === 0 || by === 0 ? 1.2 : 0.78) * (0.9 + r() * 0.2));
      if (n[i] > 0.7) c = mix(c, [120, 64, 34], 0.6);
      p.set(x, y, c);
    }
  });
}, true);
def('pipes', 64, 64, (p, r) => {
  // x = around the pipe, y = along it. Light neutral paint, tint with material colour.
  p.noiseFill(r, [168, 168, 162], [196, 196, 190], [[8, 32], [4, 16], 8], 8);
  p.each((x, y) => {
    const s = 0.8 + 0.3 * Math.sin((x / 64) * Math.PI * 2);
    p.mul(x, y, s);
    if (x >= 12 && x <= 15) p.mul(x, y, 1.18);
  });
  drips(p, r, 10, [120, 64, 34], 0.35, 30);
  p.rect(0, 0, 64, 3, [70, 70, 68]);
  p.rect(0, 3, 64, 1, [210, 210, 204], 0.5);
  scratches(p, r, 6, [110, 110, 106]);
  p.grime(r, 0.3);
});
def('paint', 64, 64, (p, r) => {
  // light neutral painted metal - tint with material colour
  p.noiseFill(r, [196, 196, 192], [226, 226, 222], [16, 8, 4], 8);
  const n = fbm(r, 64, 64, [8, 4, 2]);
  p.each((x, y, i) => {
    if (n[i] > 0.82) p.set(x, y, [92, 90, 88]);
    else if (n[i] > 0.76) p.mul(x, y, 0.8);
  });
  scratches(p, r, 10, [150, 150, 148]);
  drips(p, r, 6, [110, 80, 50], 0.25, 14);
  p.grime(r, 0.3);
});
def('plastic', 32, 32, (p, r) => {
  p.noiseFill(r, [214, 214, 210], [236, 236, 232], [8, 4], 6);
  scratches(p, r, 4, [190, 190, 186], 0.5);
  p.grime(r, 0.15);
});
def('container', 64, 64, (p, r) => {
  p.noiseFill(r, [176, 176, 170], [204, 204, 198], [16, 8, 4], 8);
  p.each((x, y) => {
    const m = x % 16;
    const f = m < 2 ? 1.22 : m < 7 ? 1.0 : m < 9 ? 0.68 : m < 15 ? 0.9 : 1.1;
    p.mul(x, y, f);
  });
  drips(p, r, 12, [120, 62, 32], 0.4, 30);
  rustify(p, r, 0.72, 0.8);
  scratches(p, r, 8, [220, 220, 214], 0.4);
  p.grime(r, 0.25);
});

// ===== tiles / walls
def('tiles_white', 64, 64, (p, r) => {
  tiles(p, r, 16, () => [206, 206, 196], [122, 120, 112]);
  p.grime(r, 0.15);
});
def('tiles_dirty', 64, 64, (p, r) => {
  tiles(p, r, 16, () => [184, 180, 158], [70, 64, 54]);
  p.grime(r, 0.45);
  for (let i = 0; i < 3; i++) {
    const tx = (r() * 4 | 0) * 16, ty = (r() * 4 | 0) * 16;
    crack(p, r, 10, [60, 56, 48], tx + 4 + r() * 8, ty + 4 + r() * 8);
  }
  const mx = (r() * 4 | 0) * 16, my = (r() * 4 | 0) * 16;
  for (let y = 1; y < 16; y++) for (let x = 1; x < 16; x++) p.set(mx + x, my + y, scl([70, 68, 62], 0.8 + r() * 0.3));
  for (let i = 0; i < 4; i++) stain(p, r, r() * 64, r() * 64, 4 + r() * 8, [110, 84, 44], 0.35);
  drips(p, r, 6, [96, 80, 50], 0.3, 16);
});
def('tiles_checker', 64, 64, (p, r) => {
  tiles(p, r, 16, (i, j) => ((i + j) & 1 ? [36, 36, 34] : [202, 198, 184]), [90, 88, 82]);
  p.grime(r, 0.35);
  scratches(p, r, 10, [140, 138, 130], 0.3);
});
def('ceiling_tiles', 64, 64, (p, r) => {
  p.noiseFill(r, [160, 158, 146], [184, 182, 170], [8, 4], 8);
  specks(p, r, 200, 0.72);
  p.each((x, y) => {
    const gx = x % 32, gy = y % 32;
    if (gx === 0 || gy === 0) p.set(x, y, [132, 132, 126]);
    else if (gx === 1 || gy === 1) p.mul(x, y, 1.08);
    else if (gx === 31 || gy === 31) p.mul(x, y, 0.82);
  });
  const sx = 8 + r() * 16, sy = 8 + r() * 16;
  stain(p, r, 32 + sx, sy, 9, [150, 120, 70], 0.4);
  p.ring(32 + sx, sy, 8, 9.5, [120, 92, 50], 0.4);
  p.grime(r, 0.2);
});
def('wallpaper_red', 64, 64, (p, r) => {
  p.noiseFill(r, [104, 26, 30], [132, 38, 40], [16, 8, 4], 8);
  p.each((x, y) => {
    const m = x % 16;
    if (m === 0 || m === 1) p.mul(x, y, 1.25);
    if (m === 8 && y % 4 < 2) p.set(x, y, [150, 112, 60], 0.7);
    if (m === 4 && y % 16 === 8) { p.set(x, y, [150, 112, 60], 0.8); }
  });
  for (let y = 4; y < 64; y += 16) for (let x = 12; x < 64; x += 16) { p.set(x, y, [160, 120, 64]); p.set(x - 1, y + 1, [160, 120, 64]); p.set(x + 1, y + 1, [160, 120, 64]); p.set(x, y + 2, [160, 120, 64]); }
  drips(p, r, 8, [60, 20, 20], 0.35, 30);
  for (let i = 0; i < 3; i++) stain(p, r, r() * 64, r() * 64, 5 + r() * 8, [80, 60, 40], 0.35);
  p.grime(r, 0.35);
});
def('wallpaper_green', 64, 64, (p, r) => {
  p.noiseFill(r, [58, 80, 58], [76, 100, 72], [16, 8, 4], 8);
  p.each((x, y) => {
    if ((x + y) % 16 === 0 || (x - y + 64) % 16 === 0) p.set(x, y, [120, 140, 100], 0.6);
    if ((x % 16 === 8) && (y % 16 === 0)) p.set(x, y, [170, 160, 110]);
  });
  drips(p, r, 8, [40, 50, 36], 0.3, 26);
  for (let i = 0; i < 3; i++) stain(p, r, r() * 64, r() * 64, 5 + r() * 9, [96, 90, 50], 0.35);
  p.grime(r, 0.35);
});
def('wallpaper_damask', 64, 64, (p, r) => {
  p.noiseFill(r, [46, 26, 32], [66, 36, 42], [16, 8], 6);
  const n = valueNoise(r, 8, 32, 3);
  const mask = [];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) {
    const dx = (8 - x) / 8, dy = Math.abs(y - 16) / 16;
    const inside = dx * 0.9 + dy < 1.02;
    mask.push(inside && n[y * 8 + x] + (1 - dx) * 0.35 > 0.62);
  }
  const gold = [146, 114, 62];
  const stamp = (ox, oy) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) if (mask[y * 8 + x]) {
      p.set(ox + x, oy + y, gold, 0.85);
      p.set(ox + 15 - x, oy + y, gold, 0.85);
    }
  };
  stamp(0, 0); stamp(32, 0); stamp(16, 32); stamp(48, 32);
  for (let i = 0; i < 3; i++) stain(p, r, r() * 64, r() * 64, 5 + r() * 9, [40, 30, 20], 0.35);
  p.grime(r, 0.3);
});

// ===== wood / fabric
def('wood_planks', 64, 64, (p, r) => {
  planks(p, r, 16, [118, 84, 54], { nails: true });
  p.grime(r, 0.25);
});
def('wood_floor', 64, 64, (p, r) => {
  planks(p, r, 8, [138, 94, 58], { joints: 2 });
  scratches(p, r, 8, [170, 130, 90], 0.3);
  p.grime(r, 0.3);
});
def('wood_dark', 64, 64, (p, r) => {
  planks(p, r, 64, [74, 48, 32], { gaps: false, joints: 0 });
  p.grime(r, 0.2);
});
def('carpet_red', 64, 64, (p, r) => {
  p.noiseFill(r, [88, 18, 24], [124, 30, 34], [8, 4, 2], 26);
  p.each((x, y) => {
    if ((x + y) % 16 === 0 || (x - y + 64) % 16 === 0) p.set(x, y, [150, 110, 52], 0.4);
    if (x % 16 === 8 && y % 16 === 8) p.set(x, y, [170, 130, 60], 0.8);
  });
  for (let i = 0; i < 4; i++) stain(p, r, r() * 64, r() * 64, 4 + r() * 8, [50, 30, 20], 0.35);
  p.grime(r, 0.35);
});
def('fabric', 32, 32, (p, r) => {
  p.noiseFill(r, [176, 176, 170], [202, 202, 196], [8, 4], 6);
  p.each((x, y) => { p.mul(x, y, ((x + y) & 1 ? 1.06 : 0.94) * (y % 2 ? 0.97 : 1.02)); });
  p.grime(r, 0.2);
});
def('mattress', 32, 32, (p, r) => {
  p.noiseFill(r, [190, 188, 176], [210, 206, 194], [8, 4], 6);
  p.each((x, y) => { if (x % 8 < 2) p.set(x, y, [118, 128, 148], 0.8); });
  stain(p, r, 10 + r() * 12, 10 + r() * 12, 6, [170, 150, 90], 0.4);
  p.grime(r, 0.25);
});
def('awning', 64, 64, (p, r) => {
  p.each((x, y) => p.set(x, y, x % 16 < 8 ? [160, 34, 30] : [212, 202, 172]));
  p.each((x, y) => p.mul(x, y, ((x + y) & 1 ? 1.04 : 0.96) * (0.95 + r() * 0.08)));
  drips(p, r, 8, [80, 70, 50], 0.3, 24);
  p.grime(r, 0.35);
});
def('rubber', 32, 32, (p, r) => {
  p.noiseFill(r, [36, 36, 36], [54, 54, 54], [8, 4, 2], 8);
});
def('cardboard', 64, 64, (p, r) => {
  p.noiseFill(r, [150, 112, 72], [176, 136, 90], [16, 8, 4], 8);
  p.each((x, y) => { if (x % 3 === 0) p.mul(x, y, 0.96); });
  p.rect(26, 0, 12, 64, [196, 172, 124]);
  p.each((x, y) => { if (x >= 26 && x < 38 && (x + y * 3) % 11 === 0) p.mul(x, y, 1.08); });
  p.rect(26, 0, 1, 64, [120, 96, 64]); p.rect(37, 0, 1, 64, [120, 96, 64]);
  const ink = [66, 44, 28];
  for (const ax of [8, 50]) { p.rect(ax, 8, 2, 8, ink); p.line(ax - 3, 11, ax, 8, ink); p.line(ax + 4, 11, ax + 1, 8, ink); }
  p.textC('THIS SIDE UP', 32, 52, ink, 1, 0.8);
  stain(p, r, 12 + r() * 40, 20 + r() * 20, 7, [120, 86, 50], 0.35);
  p.grime(r, 0.25);
});

// ===== terrain
function blades(p, r, n, cols) {
  for (let i = 0; i < n; i++) {
    const x = r() * p.w, y = r() * p.h, l = 2 + r() * 3, c = pick(r, cols);
    for (let k = 0; k < l; k++) p.set(x, y - k, c, 0.8);
  }
}
def('grass', 64, 64, (p, r) => {
  p.noiseFill(r, [50, 72, 32], [86, 110, 48], [16, 8, 4], 10);
  blades(p, r, 280, [[96, 124, 56], [44, 64, 30], [110, 130, 60], [70, 96, 40]]);
  for (let i = 0; i < 3; i++) stain(p, r, r() * 64, r() * 64, 6 + r() * 6, [110, 110, 60], 0.25);
});
def('grass_dry', 64, 64, (p, r) => {
  p.noiseFill(r, [108, 96, 54], [150, 132, 78], [16, 8, 4], 12);
  blades(p, r, 260, [[170, 150, 90], [96, 84, 46], [140, 124, 70], [120, 110, 64]]);
  for (let i = 0; i < 3; i++) stain(p, r, r() * 64, r() * 64, 6 + r() * 6, [90, 72, 48], 0.3);
});
def('dirt', 64, 64, (p, r) => {
  p.noiseFill(r, [76, 58, 40], [112, 88, 60], [16, 8, 4, 2], 14);
  for (let i = 0; i < 30; i++) {
    const x = r() * 64, y = r() * 64, c = scl([120, 112, 100], 0.7 + r() * 0.5);
    p.circle(x, y, r() < 0.5 ? 0.6 : 1.2, c);
    p.mul(x + 1, y + 1, 0.6);
  }
  specks(p, r, 80, 0.75);
});
def('mud', 64, 64, (p, r) => {
  const n = p.noiseFill(r, [42, 32, 24], [72, 54, 38], [16, 8, 4], 10);
  p.each((x, y, i) => {
    if (n[i] < 0.28) { p.set(x, y, [34, 30, 26]); if (r() < 0.06) p.set(x, y, [110, 100, 90]); }
  });
  speckle(p, r, 40, [96, 86, 74], 0.5);
});
def('snow', 64, 64, (p, r) => {
  p.noiseFill(r, [198, 206, 220], [236, 240, 248], [16, 8, 4], 6);
  for (let i = 0; i < 4; i++) stain(p, r, r() * 64, r() * 64, 6 + r() * 8, [170, 182, 206], 0.3);
  speckle(p, r, 30, [255, 255, 255]);
});
function ripples(p, r, c0, c1) {
  const n = p.noiseFill(r, c0, c1, [16, 8, 4], 10);
  p.each((x, y, i) => {
    const s = Math.sin(((y + n[i] * 10 + x * 0.125) / 8) * Math.PI * 2);
    p.mul(x, y, 1 + s * 0.06);
  });
  specks(p, r, 90, 0.82);
}
def('sand', 64, 64, (p, r) => ripples(p, r, [166, 144, 102], [198, 178, 132]));
def('red_sand', 64, 64, (p, r) => ripples(p, r, [138, 62, 40], [180, 94, 60]));
def('bark', 64, 64, (p, r) => {
  const n = fbm(r, 64, 64, [[4, 32], [2, 16], 8]);
  p.each((x, y, i) => {
    let c = mix([46, 34, 24], [98, 74, 54], n[i]);
    if (n[i] < 0.3) c = [30, 22, 16];
    p.set(x, y, scl(c, 0.92 + r() * 0.16));
  });
  for (let i = 0; i < 8; i++) { const x = r() * 64, y = r() * 64, l = 6 + r() * 16; p.line(x, y, x + (r() - 0.5) * 2, y + l, [26, 20, 14], 0.8); }
  speckle(p, r, 30, [90, 104, 70], 0.5);
});
def('pine_leaves', 64, 64, (p, r) => {
  p.clear();
  const teethH = 22;
  p.each((x, y) => {
    const base = mix([30, 58, 32], [60, 94, 48], (Math.sin(x * 1.7 + y * 0.9) + 1) * 0.25 + r() * 0.5);
    let on = true;
    if (y >= 64 - teethH) {
      const t = (y - (64 - teethH)) / teethH;
      const half = (1 - t) * 4.8 + (r() - 0.5) * 1.4;
      on = Math.abs((x % 8) - 3.5) < half;
    } else if (r() < 0.04) on = false;
    if (!on) return;
    let c = base;
    if ((x + y * 2) % 5 === 0) c = scl(c, 1.35);
    if ((x * 3 + y) % 7 === 0) c = scl(c, 0.7);
    p.set(x, y, c);
  });
}, true);
def('leaves', 64, 64, (p, r) => {
  p.clear();
  const cols = [[50, 80, 34], [70, 100, 40], [40, 64, 28], [90, 112, 46], [60, 90, 30]];
  for (let i = 0; i < 110; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 27;
    const x = 32 + Math.cos(a) * d, y = 32 + Math.sin(a) * d;
    const c = pick(r, cols), rx = 1.5 + r() * 2.5, ry = 1 + r() * 1.8;
    p.ellipse(x + 1, y + 1, rx, ry, scl(c, 0.55));
    p.ellipse(x, y, rx, ry, c);
    p.set(x - 1, y - 1, scl(c, 1.3));
  }
}, true);
def('grass_blades', 64, 32, (p, r) => {
  p.clear();
  const cols = [[74, 104, 44], [96, 124, 54], [58, 84, 36], [112, 132, 60]];
  for (let i = 0; i < 46; i++) {
    const x0 = r() * 64, h = 10 + r() * 20, lean = (r() - 0.5) * 8, c = pick(r, cols);
    for (let t = 0; t < h; t++) {
      const x = x0 + lean * (t / h) * (t / h), y = 31 - t;
      p.set(x, y, scl(c, 0.8 + (t / h) * 0.4));
      if (t < h * 0.55) p.set(x + 1, y, scl(c, 0.7));
    }
  }
}, true);
def('reeds', 64, 64, (p, r) => {
  p.clear();
  for (let i = 0; i < 20; i++) {
    const x0 = 2 + r() * 60, h = 28 + r() * 34, lean = (r() - 0.5) * 6;
    const c = pick(r, [[86, 98, 48], [104, 110, 56], [70, 82, 40]]);
    for (let t = 0; t < h; t++) p.set(x0 + lean * (t / h), 63 - t, scl(c, 0.8 + (t / h) * 0.3));
    if (r() < 0.55) { const tx = x0 + lean * 0.9; p.rect(tx - 1, 63 - h + 2, 3, 7, [84, 52, 30]); p.rect(tx - 1, 63 - h + 2, 1, 7, [110, 72, 42]); }
    if (r() < 0.5) { const ly = 63 - h * 0.4, d = r() < 0.5 ? -1 : 1; p.line(x0, ly, x0 + d * 8, ly - 12, c); }
  }
}, true);

// ===== industrial / ship
def('hazard_stripes', 64, 64, (p, r) => {
  const n = fbm(r, 64, 64, [8, 4, 2]);
  p.each((x, y, i) => {
    let c = ((x + y) & 15) < 8 ? [214, 168, 32] : [28, 26, 22];
    c = scl(c, 0.9 + r() * 0.15);
    if (n[i] > 0.8) c = mix(c, [74, 70, 64], 0.85);
    p.set(x, y, c);
  });
  p.grime(r, 0.3);
});
def('ship_wall', 64, 64, (p, r) => {
  p.noiseFill(r, [96, 102, 94], [118, 124, 114], [16, 8, 4], 8);
  p.each((x, y) => {
    if (y % 32 === 0 || x === 0) p.set(x, y, [48, 52, 48]);
    else if (y % 32 === 1 || x === 1) p.mul(x, y, 1.18);
  });
  for (let k = 5; k < 64; k += 8) { rivet(p, k, 3); rivet(p, k, 35); rivet(p, 3, k); }
  drips(p, r, 8, [60, 64, 58], 0.3, 22);
  p.grime(r, 0.25);
});
def('ship_floor', 64, 64, (p, r) => {
  p.noiseFill(r, [76, 78, 78], [100, 102, 102], [16, 8], 8);
  for (let gy = 0; gy < 64; gy += 8) for (let gx = 0; gx < 64; gx += 8) {
    const row = (gy / 8) & 1, ox = row * 4;
    for (let k = 0; k < 4; k++) {
      const x = gx + ox + k + 1, y = ((gx / 8) & 1) ? gy + 1 + k : gy + 4 - k;
      p.mul(x, y, 1.4); p.mul(x + 1, y + 1, 0.65);
    }
  }
  scratches(p, r, 10, [140, 142, 142], 0.4);
  p.grime(r, 0.35);
});
def('ship_ceiling', 64, 64, (p, r) => {
  p.noiseFill(r, [70, 72, 70], [88, 90, 88], [16, 8], 6);
  for (let py = 0; py < 64; py += 32) for (let px = 0; px < 64; px += 32) {
    p.bevel(px, py, 32, 32, 1.25, 0.6);
    rivet(p, px + 3, py + 3); rivet(p, px + 27, py + 3); rivet(p, px + 3, py + 27); rivet(p, px + 27, py + 27);
    p.rect(px + 10, py + 14, 12, 4, [40, 42, 40]);
    for (let x = 11; x < 22; x += 2) p.rect(px + x, py + 15, 1, 2, [20, 20, 20]);
  }
  p.grime(r, 0.25);
});
def('door_metal', 64, 128, (p, r) => {
  p.noiseFill(r, [86, 96, 94], [108, 118, 114], [16, 8, 4], 8);
  p.bevel(0, 0, 64, 128, 1.3, 0.5);
  p.bevel(1, 1, 62, 126, 1.1, 0.7);
  p.bevel(7, 52, 50, 56, 0.7, 1.25);
  p.rect(18, 14, 28, 26, [60, 64, 62]);
  p.rect(20, 16, 24, 22, [26, 34, 38]);
  for (let y = 16; y < 38; y++) for (let x = 20; x < 44; x++) {
    if ((x + y) % 5 === 0 || (x - y + 100) % 5 === 0) p.set(x, y, [70, 80, 84]);
    if (x - 20 + (y - 16) < 8) p.mul(x, y, 1.4);
  }
  p.bevel(18, 14, 28, 26, 0.7, 1.3);
  p.rect(4, 110, 56, 15, [124, 126, 122]);
  p.bevel(4, 110, 56, 15, 1.2, 0.6);
  scratches(p, r, 14, [160, 162, 160], 0.6);
  p.rect(50, 62, 8, 12, [70, 72, 70]); p.bevel(50, 62, 8, 12);
  p.rect(46, 66, 10, 3, [34, 34, 34]);
  p.textC('B-2', 32, 56, [210, 206, 190]);
  drips(p, r, 6, [60, 50, 40], 0.35, 30);
  p.grime(r, 0.3);
});
def('blast_door', 128, 128, (p, r) => {
  p.noiseFill(r, [82, 84, 82], [108, 110, 106], [32, 16, 8, 4], 10);
  for (let y = 0; y < 128; y += 32) {
    p.bevel(0, y, 128, 32, 1.25, 0.55);
    for (let x = 6; x < 128; x += 12) { rivet(p, x, y + 3); rivet(p, x, y + 27); }
  }
  for (let x = 20; x < 128; x += 44) { p.mulRect(x, 0, 10, 128, 0.82); p.bevel(x, 0, 10, 128, 1.2, 0.6); }
  hazard(p, 0, 52, 128, 22, 8);
  p.rect(0, 52, 128, 1, [20, 20, 18]); p.rect(0, 73, 128, 1, [20, 20, 18]);
  p.rect(22, 82, 84, 16, [180, 170, 140]); p.bevel(22, 82, 84, 16, 1.1, 0.6);
  p.textC('KEEP CLEAR', 64, 85, [30, 28, 24], 2);
  drips(p, r, 14, [110, 60, 30], 0.35, 40);
  scratches(p, r, 20, [150, 150, 146], 0.5);
  p.each((x, y) => { if (y > 100) p.mul(x, y, 1 - (y - 100) / 90); });
  p.grime(r, 0.3);
});
def('vent', 64, 64, (p, r) => {
  p.noiseFill(r, [80, 82, 80], [100, 102, 100], [16, 8], 6);
  for (let y = 4; y < 60; y++) {
    const ph = (y - 4) % 8;
    const c = ph < 2 ? [150, 150, 144] : ph < 5 ? [102, 102, 98] : [14, 14, 14];
    for (let x = 4; x < 60; x++) p.set(x, y, scl(c, 0.92 + r() * 0.12));
  }
  p.bevel(0, 0, 64, 64, 1.25, 0.55);
  p.bevel(4, 4, 56, 56, 0.6, 1.2);
  rivet(p, 1, 1); rivet(p, 61, 1); rivet(p, 1, 61); rivet(p, 61, 61);
  drips(p, r, 5, [60, 50, 40], 0.3, 20);
  p.grime(r, 0.35);
});
def('crate_wood', 64, 64, (p, r) => {
  planks(p, r, 16, [142, 102, 62], { joints: 0 });
  const fr = [108, 74, 46];
  const g = fbm(r, 64, 64, [[64, 2], [8, 1]]);
  p.each((x, y, i) => {
    const inFrame = x < 6 || x > 57 || y < 6 || y > 57;
    const d = (x - 6) - (57 - y);
    const inBrace = !inFrame && Math.abs(d) < 4;
    if (inFrame || inBrace) {
      let c = mix(scl(fr, 0.8), scl(fr, 1.15), g[i]);
      if (inBrace && Math.abs(d) >= 3) c = scl(c, 0.6);
      if (inFrame && (x === 6 || x === 57 || y === 6 || y === 57)) c = scl(c, 0.55);
      p.set(x, y, c);
    }
  });
  for (const [x, y] of [[2, 2], [60, 2], [2, 60], [60, 60], [2, 30], [60, 30]]) { p.rect(x, y, 2, 2, [40, 36, 32]); }
  p.textC('TFG', 32, 1, [52, 34, 20], 1, 0.8);
  p.grime(r, 0.3);
});
def('crate_metal', 64, 64, (p, r) => {
  p.noiseFill(r, [66, 76, 58], [86, 96, 74], [16, 8, 4], 8);
  p.rect(0, 0, 64, 6, [96, 100, 90]); p.rect(0, 58, 64, 6, [96, 100, 90]);
  p.rect(0, 0, 6, 64, [96, 100, 90]); p.rect(58, 0, 6, 64, [96, 100, 90]);
  p.bevel(0, 0, 64, 64, 1.3, 0.5); p.bevel(6, 6, 52, 52, 0.7, 1.2);
  for (const [x, y] of [[0, 0], [52, 0], [0, 52], [52, 52]]) {
    p.rect(x, y, 12, 12, [120, 120, 116]); p.bevel(x, y, 12, 12);
    rivet(p, x + 3, y + 3); rivet(p, x + 7, y + 7);
  }
  p.textC('K-07', 32, 26, [206, 200, 170], 2);
  for (let i = 0; i < 6; i++) { p.set(18 + i, 42 - i, [214, 168, 32]); p.set(18 + i * 2, 42, [214, 168, 32]); p.set(30 - i, 42 - i, [214, 168, 32]); }
  rustify(p, r, 0.7);
  scratches(p, r, 10, [130, 136, 120], 0.5);
  p.grime(r, 0.3);
});
def('barrel', 64, 64, (p, r) => {
  p.noiseFill(r, [166, 166, 160], [192, 192, 186], [16, 8, 4], 8);
  p.each((x, y) => p.mul(x, y, 0.82 + 0.28 * Math.sin((x / 64) * Math.PI * 2)));
  for (const ry of [20, 42]) { p.mulRect(0, ry, 64, 1, 1.3); p.mulRect(0, ry + 1, 64, 2, 0.6); p.mulRect(0, ry + 3, 64, 1, 1.2); }
  p.mulRect(0, 0, 64, 2, 0.5); p.mulRect(0, 62, 64, 2, 0.5);
  rustify(p, r, 0.6);
  drips(p, r, 8, [110, 58, 30], 0.35, 20);
  p.grime(r, 0.3);
});
def('barrel_toxic', 64, 64, (p, r) => {
  p.noiseFill(r, [132, 144, 34], [160, 172, 50], [16, 8, 4], 8);
  p.each((x, y) => p.mul(x, y, 0.82 + 0.28 * Math.sin((x / 64) * Math.PI * 2)));
  for (const ry of [18, 44]) { p.mulRect(0, ry, 64, 1, 1.3); p.mulRect(0, ry + 1, 64, 2, 0.55); }
  p.rect(18, 23, 28, 19, [24, 24, 20]);
  p.rect(20, 25, 24, 15, [214, 184, 36]);
  skullIcon(p, 32, 30, [24, 24, 20], [214, 184, 36]);
  for (let i = 0; i < 10; i++) { const x = r() * 64, l = 3 + r() * 12; for (let k = 0; k < l; k++) p.set(x, k, [96, 200, 40], 1 - k / l); }
  rustify(p, r, 0.66);
  p.grime(r, 0.3);
});
def('fuse_panel', 64, 64, (p, r) => {
  p.noiseFill(r, [66, 70, 68], [84, 88, 86], [16, 8], 6);
  p.bevel(0, 0, 64, 64, 1.2, 0.6);
  p.rect(20, 2, 24, 8, [200, 186, 110]); p.textC('POWER', 32, 3, [30, 28, 20]);
  for (let row = 0; row < 2; row++) for (let k = 0; k < 6; k++) {
    const x = 5 + k * 9, y = 14 + row * 16;
    p.rect(x, y, 7, 12, [28, 28, 28]); p.bevel(x, y, 7, 12, 1.5, 0.6);
    const up = r() < 0.6;
    p.rect(x + 2, up ? y + 2 : y + 6, 3, 4, up ? [220, 220, 210] : [200, 40, 30]);
  }
  const wc = [[200, 40, 30], [220, 190, 40], [40, 90, 200], [50, 170, 60]];
  for (let k = 0; k < 4; k++) {
    let x = 9 + k * 14;
    for (let y = 46; y < 63; y++) { p.rect(x, y, 2, 1, wc[k]); if (r() < 0.2) x += r() < 0.5 ? -1 : 1; }
  }
  p.ellipse(56, 52, 4, 4, [214, 168, 32]);
  p.text('!', 55, 50, [20, 20, 20]);
  p.grime(r, 0.25);
});
def('keypad', 32, 48, (p, r) => {
  p.noiseFill(r, [78, 80, 78], [100, 102, 100], [8, 4], 6);
  p.bevel(0, 0, 32, 48, 1.3, 0.5);
  p.rect(3, 3, 26, 8, [18, 36, 22]); p.bevel(3, 3, 26, 8, 0.6, 1.2);
  p.text('----', 9, 5, [80, 220, 100]);
  const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
  labels.forEach((l, i) => {
    const bx = 3 + (i % 3) * 9, by = 14 + Math.floor(i / 3) * 8;
    p.rect(bx, by, 8, 7, [172, 170, 162]); p.bevel(bx, by, 8, 7, 1.15, 0.55);
    p.text(l, bx + 3 - 1, by + 1, [30, 30, 30]);
  });
  p.grime(r, 0.25);
});
def('screen_off', 64, 48, (p, r) => {
  p.each((x, y) => {
    const dx = (x - 32) / 32, dy = (y - 24) / 24, d = Math.sqrt(dx * dx + dy * dy);
    let c = scl([18, 26, 24], 1.25 - d * 0.55);
    if (y % 2) c = scl(c, 0.82);
    const e = ((x - 22) * (x - 22)) / 900 + ((y - 14) * (y - 14)) / 196;
    if (e > 0.82 && e < 1 && x < 34 && y < 18) c = [c[0] + 30, c[1] + 34, c[2] + 34];
    p.set(x, y, scl(c, 0.95 + r() * 0.1));
  });
});
def('noise_static', 64, 64, (p, r) => {
  let band = 1;
  p.each((x, y) => {
    if (x === 0) band = 0.7 + r() * 0.5;
    const v = r() * 230 * band;
    p.set(x, y, [v, v, v * 1.05]);
  });
});
def('screen_terminal', 64, 48, (p, r) => {
  p.fill([6, 14, 8]);
  const g = [72, 220, 110];
  const lines = ['TFG OS 2.1', '>MOONS', ' 7-HAMSI', ' 12-LUFER', ' 33-PALAMUT', '>_'];
  lines.forEach((l, i) => p.text(l, 2, 2 + i * 7, i === 0 ? [150, 255, 170] : g));
  p.each((x, y) => { if (y % 2) p.mul(x, y, 0.7); p.add(x, y, r() * 6); });
});
def('screen_quota', 64, 48, (p, r) => {
  p.fill([10, 12, 16]);
  p.textC('QUOTA', 32, 3, [230, 90, 50], 2);
  p.textC('130 / 400', 32, 17, [230, 220, 200]);
  p.rect(6, 25, 52, 5, [40, 40, 44]); p.rect(6, 25, 17, 5, [220, 170, 40]);
  p.textC('DEADLINE', 32, 33, [180, 180, 170]);
  p.textC('3 DAYS', 32, 40, [230, 60, 50]);
  p.each((x, y) => { if (y % 2) p.mul(x, y, 0.75); p.add(x, y, r() * 5); });
});
def('screen_arcade', 64, 48, (p, r) => {
  p.fill([12, 8, 30]);
  speckle(p, r, 30, [200, 200, 255]);
  p.textS('TFG', 32, 3, [255, 214, 40], [150, 30, 30], 2);
  p.textS('JUMP', 32, 15, [60, 230, 255], [20, 60, 150], 2);
  drawFish(p, 32, 32, 18, 8, [140, 150, 160], [220, 220, 210]);
  p.textC('INSERT COIN', 32, 41, [255, 255, 255]);
  p.each((x, y) => { if (y % 2) p.mul(x, y, 0.75); });
});
def('server_front', 64, 128, (p, r) => {
  p.fill([24, 26, 28]);
  for (let y = 4; y < 124; y += 8) {
    p.rect(3, y, 58, 7, [46, 48, 52]); p.bevel(3, y, 58, 7, 1.3, 0.55);
    for (let x = 20; x < 44; x += 2) p.set(x, y + 3, [12, 12, 12]);
    for (let k = 0; k < 3; k++) {
      const v = r();
      p.set(6 + k * 3, y + 3, v < 0.45 ? [60, 230, 80] : v < 0.7 ? [240, 170, 40] : v < 0.8 ? [230, 50, 40] : [40, 50, 40]);
    }
    p.rect(47, y + 2, 12, 3, [70, 72, 76]); p.set(57, y + 3, [140, 140, 140]);
  }
  p.rect(0, 0, 3, 128, [60, 62, 66]); p.rect(61, 0, 3, 128, [60, 62, 66]);
  for (let y = 2; y < 128; y += 4) { p.set(1, y, [20, 20, 20]); p.set(62, y, [20, 20, 20]); }
  p.grime(r, 0.2);
});
def('keyboard', 64, 16, (p, r) => {
  p.fill([58, 56, 50]);
  for (let row = 0; row < 4; row++) for (let c = 0; c < 15; c++) {
    if (row === 3 && c > 3 && c < 11) continue;
    const x = 1 + c * 4 + (row & 1), y = 1 + row * 4;
    p.rect(x, y, 3, 3, [188, 182, 166]); p.set(x, y + 2, [130, 124, 110]); p.set(x + 2, y + 2, [120, 114, 100]);
  }
  p.rect(18, 13, 27, 3, [188, 182, 166]);
  p.grime(r, 0.3);
});
def('charge_panel', 32, 48, (p, r) => {
  p.noiseFill(r, [40, 46, 52], [56, 62, 68], [8, 4], 6);
  p.bevel(0, 0, 32, 48, 1.3, 0.5);
  p.rect(5, 5, 22, 20, [20, 22, 24]);
  boltIcon(p, 11, 8, [240, 200, 40]);
  p.textC('CHARGE', 16, 29, [220, 210, 170]);
  p.rect(8, 37, 16, 6, [14, 14, 14]); p.bevel(8, 37, 16, 6, 0.6, 1.3);
  p.grime(r, 0.25);
});
def('gauge', 32, 32, (p, r) => {
  p.fill([40, 40, 40]);
  p.circle(15.5, 15.5, 15, [36, 36, 36]);
  p.circle(15.5, 15.5, 13, [222, 216, 200]);
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    p.line(15.5 + Math.cos(a) * 10, 15.5 + Math.sin(a) * 10, 15.5 + Math.cos(a) * 12, 15.5 + Math.sin(a) * 12, i > 7 ? [200, 30, 30] : [20, 20, 20]);
  }
  const na = Math.PI * 0.75 + (0.6 + r() * 0.3) * Math.PI * 1.5;
  p.line(15.5, 15.5, 15.5 + Math.cos(na) * 11, 15.5 + Math.sin(na) * 11, [190, 20, 20]);
  p.circle(15.5, 15.5, 1.5, [20, 20, 20]);
  p.each((x, y) => { if (x + y < 20 && x + y > 14) p.add(x, y, 12); });
});
def('clock_face', 64, 64, (p, r) => {
  p.noiseFill(r, [56, 38, 24], [70, 48, 30], [16, 8], 6);
  p.circle(31.5, 31.5, 30, [168, 138, 60]);
  p.circle(31.5, 31.5, 27, [220, 208, 176]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.line(31.5 + Math.cos(a) * 21, 31.5 + Math.sin(a) * 21, 31.5 + Math.cos(a) * 25, 31.5 + Math.sin(a) * 25, [24, 22, 20]);
  }
  const ha = -Math.PI / 2 - 0.1, ma = -Math.PI / 2 - 0.52;
  p.line(31.5, 31.5, 31.5 + Math.cos(ha) * 13, 31.5 + Math.sin(ha) * 13, [20, 18, 16]);
  p.line(32.5, 31.5, 32.5 + Math.cos(ha) * 13, 31.5 + Math.sin(ha) * 13, [20, 18, 16]);
  p.line(31.5, 31.5, 31.5 + Math.cos(ma) * 20, 31.5 + Math.sin(ma) * 20, [20, 18, 16]);
  p.circle(31.5, 31.5, 2, [150, 120, 50]);
  p.grime(r, 0.3);
});
def('books', 64, 64, (p, r) => {
  p.fill([20, 14, 10]);
  const cols = [[110, 30, 28], [40, 70, 44], [70, 48, 30], [36, 44, 80], [120, 100, 60], [80, 30, 60], [60, 60, 56]];
  for (let row = 0; row < 2; row++) {
    const base = row * 32 + 29;
    p.rect(0, base, 64, 3, [74, 48, 30]); p.mulRect(0, base, 64, 1, 1.3);
    let x = 0;
    while (x < 64) {
      const w = 3 + Math.floor(r() * 4), h = 18 + Math.floor(r() * 10), c = pick(r, cols);
      if (r() < 0.08) { x += w; continue; }
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w && x + xx < 64; xx++) {
        let cc = scl(c, xx === 0 ? 1.25 : xx === w - 1 ? 0.6 : 0.95 + r() * 0.1);
        if (yy === 3 || yy === h - 4) cc = [170, 140, 70];
        p.set(x + xx, base - 1 - yy, cc);
      }
      x += w;
    }
  }
  p.grime(r, 0.25);
});
def('vending_front', 64, 128, (p, r) => {
  p.noiseFill(r, [140, 26, 28], [160, 36, 36], [16, 8], 6);
  p.textS('TFG', 26, 4, [240, 236, 220], [60, 10, 10], 2);
  p.textC('COLA', 26, 15, [255, 210, 60]);
  p.rect(4, 22, 42, 72, [18, 22, 28]);
  p.bevel(3, 21, 44, 74, 0.6, 1.3);
  const cans = [[200, 40, 40], [40, 120, 200], [240, 200, 40], [60, 170, 70], [230, 120, 30], [200, 200, 200]];
  for (let row = 0; row < 5; row++) {
    const y = 26 + row * 13;
    for (let k = 0; k < 5; k++) {
      const c = pick(r, cans), x = 7 + k * 8;
      p.rect(x, y, 6, 9, c); p.rect(x, y, 1, 9, scl(c, 1.4)); p.rect(x + 5, y, 1, 9, scl(c, 0.6));
      p.rect(x + 1, y + 3, 4, 2, [240, 240, 230]);
    }
    p.rect(5, y + 10, 40, 1, [110, 110, 110]);
  }
  p.each((x, y) => { if (x >= 4 && x < 46 && y >= 22 && y < 94 && (x - y + 200) % 40 < 3) p.add(x, y, 40); });
  p.rect(49, 22, 12, 72, [60, 60, 64]); p.bevel(49, 22, 12, 72);
  p.rect(51, 25, 8, 5, [16, 30, 20]); p.text('50', 51, 25, [80, 230, 110]);
  for (let i = 0; i < 5; i++) { p.rect(51, 34 + i * 7, 3, 4, [200, 200, 190]); p.rect(56, 34 + i * 7, 3, 4, [200, 200, 190]); }
  p.rect(54, 72, 2, 8, [10, 10, 10]);
  p.rect(8, 100, 36, 18, [20, 20, 22]); p.bevel(7, 99, 38, 20, 0.6, 1.3);
  p.rect(0, 120, 64, 8, [90, 18, 20]);
  p.grime(r, 0.25);
});

// ===== glass / water
def('glass', 32, 32, (p, r) => {
  p.noiseFill(r, [140, 164, 172], [160, 184, 192], [8, 4], 4);
  p.each((x, y) => {
    const d = (x + y) % 32;
    if (d >= 4 && d <= 6) p.set(x, y, [220, 234, 238]);
    if (d === 10) p.set(x, y, [200, 220, 226], 0.6);
  });
});
def('water', 64, 64, (p, r) => {
  const n = p.noiseFill(r, [26, 50, 56], [46, 82, 86], [16, 8, 4], 6);
  p.each((x, y, i) => {
    const s = Math.sin(((x + n[i] * 14) / 16) * Math.PI * 2) * Math.sin(((y + n[i] * 10) / 16) * Math.PI * 2);
    if (s > 0.8) p.set(x, y, [96, 136, 136], 0.7);
    else if (s < -0.85) p.mul(x, y, 0.85);
  });
});

// ===== signs / posters / decals
def('sign_exit', 64, 32, (p, r) => {
  p.fill([24, 124, 58]);
  p.frame(1, 1, 62, 30, [222, 240, 226]);
  const w = [222, 240, 226];
  p.rect(4, 6, 12, 20, [16, 90, 40]); p.frame(4, 6, 12, 20, w);
  p.circle(21, 9, 1.6, w);
  p.line(21, 11, 20, 17, w); p.line(20, 17, 17, 22, w); p.line(20, 17, 23, 21, w); p.line(23, 21, 22, 24, w);
  p.line(21, 12, 24, 15, w); p.line(21, 12, 18, 14, w);
  p.text('EXIT', 28, 11, w, 2);
  p.each((x, y) => p.add(x, y, (r() - 0.5) * 10));
});
def('sign_danger', 64, 64, (p, r) => {
  paper(p, r, [220, 218, 206]);
  p.rect(2, 2, 60, 17, [178, 28, 24]);
  p.textC('DANGER', 32, 6, [240, 236, 226], 2);
  skullIcon(p, 32, 32, [24, 22, 20], [220, 218, 206]);
  p.textC('KEEP OUT', 32, 45, [24, 22, 20]);
  hazard(p, 0, 55, 64, 9, 4);
  p.circle(4, 4, 1, [60, 40, 30]); p.circle(59, 4, 1, [60, 40, 30]);
  drips(p, r, 4, [120, 70, 40], 0.4, 14);
  p.grime(r, 0.3);
});
def('sign_company', 128, 64, (p, r) => {
  p.noiseFill(r, [24, 20, 18], [36, 30, 28], [16, 8], 6);
  p.frame(2, 2, 124, 60, [170, 34, 30]); p.frame(3, 3, 122, 58, [120, 24, 22]);
  // The Algorithm: an eye inside a play-button triangle
  const tri = [200, 44, 40];
  for (let y = 0; y <= 40; y++) { const w = Math.round((y <= 20 ? y : 40 - y) * 1.35); p.rect(12, 12 + y, w + 1, 1, tri); }
  eyeIcon(p, 22, 32, 9, 5, [236, 214, 170], [16, 10, 10], [60, 10, 10]);
  p.textS('TFG', 88, 12, [236, 214, 170], [150, 26, 24], 3);
  p.textC('THE ALGORITHM', 88, 34, [196, 42, 36]);
  p.textC('ENGAGEMENT IS LOVE', 88, 48, [140, 130, 110]);
  p.grime(r, 0.2);
});
def('sign_market', 128, 32, (p, r) => {
  planks(p, r, 8, [70, 46, 30], {});
  p.frame(0, 0, 128, 32, [30, 20, 14]);
  p.textS('BLACK MARKET', 64, 7, [230, 200, 120], [20, 12, 8], 2);
  p.textC('NO REFUNDS', 64, 22, [200, 60, 40]);
  p.grime(r, 0.3);
});
def('arcade_marquee', 64, 16, (p, r) => {
  p.fill([10, 6, 24]);
  speckle(p, r, 12, [120, 120, 200]);
  p.textS('FLAPPY PHISH', 32, 5, [255, 214, 40], [200, 30, 90]);
  p.frame(0, 0, 64, 16, [200, 30, 90]);
});
def('arcade_art', 64, 128, (p, r) => {
  p.each((x, y) => p.set(x, y, mix([70, 20, 90], [8, 6, 20], y / 128)));
  speckle(p, r, 60, [220, 220, 255]);
  for (let i = 0; i < 10; i++) { const a = i / 10; p.circle(10 + a * 40, 90 - Math.sin(a * Math.PI) * 40, 1, [60, 230, 255]); }
  drawFish(p, 36, 52, 34, 14, [150, 160, 170], [230, 226, 214]);
  p.textS('FLAPPY', 32, 8, [255, 214, 40], [150, 20, 60], 2);
  p.textS('PHISH', 32, 22, [60, 230, 255], [20, 40, 120], 2);
  p.textC('INSERT FOLLOWERS', 32, 104, [255, 90, 160]);
  hazard(p, 0, 116, 64, 12, 6);
});
def('label_kefal', 64, 32, (p, r) => {
  p.noiseFill(r, [34, 60, 118], [44, 72, 132], [8, 4], 6);
  p.rect(0, 0, 64, 3, [190, 160, 70]); p.rect(0, 29, 64, 3, [190, 160, 70]);
  p.rect(0, 8, 64, 14, [226, 222, 210]);
  drawFish(p, 10, 15, 16, 8, [120, 128, 134], [220, 220, 210]);
  p.text('PHISH', 22, 10, [180, 30, 30], 1);
  p.text('SNACK', 22, 16, [180, 30, 30], 1);
  p.text('100% BAIT', 22, 23, [230, 210, 150]);
  p.grime(r, 0.2);
});
def('pickle_jar', 64, 64, (p, r) => {
  p.noiseFill(r, [96, 116, 50], [124, 140, 66], [16, 8], 8);
  for (let i = 0; i < 16; i++) {
    const x = r() * 64, y = r() * 64;
    p.ellipse(x, y, 3, 7, [54, 84, 30]); p.ellipse(x - 1, y - 1, 1, 5, [84, 116, 44]);
  }
  speckle(p, r, 40, [200, 210, 150], 0.6);
  p.rect(0, 22, 64, 18, [226, 220, 196]);
  p.rect(0, 22, 64, 1, [150, 40, 30]); p.rect(0, 39, 64, 1, [150, 40, 30]);
  p.textC('PICKLES', 32, 26, [40, 90, 40]);
  p.textC('NO 7', 32, 33, [150, 40, 30]);
});
def('portrait', 48, 64, (p, r) => {
  p.each((x, y) => {
    const d = Math.sqrt((x - 24) ** 2 + (y - 26) ** 2) / 34;
    p.set(x, y, scl(mix([72, 56, 38], [30, 22, 16], d), 0.9 + r() * 0.15));
  });
  p.ellipse(24, 70, 23, 20, [24, 24, 28]);
  p.line(24, 50, 17, 60, [210, 206, 194]); p.line(24, 50, 31, 60, [210, 206, 194]);
  p.rect(22, 44, 5, 8, [176, 164, 140]);
  p.ellipse(24, 28, 10, 14, [186, 174, 148]);
  p.each((x, y) => { if (x > 26 && (x - 24) ** 2 / 100 + (y - 28) ** 2 / 196 <= 1) p.mul(x, y, 0.82); });
  p.ellipse(24, 16, 10, 5, [30, 24, 20]);
  p.ellipse(20, 27, 2.2, 1.6, [6, 6, 6]); p.ellipse(28, 27, 2.2, 1.6, [6, 6, 6]);
  p.set(20, 27, [230, 230, 220]); p.set(28, 27, [230, 230, 220]);
  p.line(18, 37, 30, 37, [70, 40, 36]); p.set(17, 36, [70, 40, 36]); p.set(31, 36, [70, 40, 36]);
  for (let i = 0; i < 6; i++) crack(p, r, 10, [40, 32, 22]);
  p.each((x, y) => p.set(x, y, [140, 110, 40], 0.08));
  p.grime(r, 0.25);
});
def('poster_work', 64, 96, (p, r) => {
  paper(p, r, [198, 188, 158]);
  p.rect(4, 4, 56, 9, [168, 30, 28]);
  p.textC('NOTICE', 32, 6, [236, 230, 210]);
  const cx = 32, cy = 34;
  for (let x = -22; x <= 22; x++) {
    const hh = 12 * (1 - (x / 22) ** 2);
    for (let y = -hh; y <= hh; y++) p.set(cx + x, cy + y, [226, 220, 204]);
    p.set(cx + x, cy - hh, [20, 18, 16]); p.set(cx + x, cy + hh, [20, 18, 16]);
  }
  p.circle(cx, cy, 8.5, [150, 30, 28]); p.circle(cx, cy, 4, [10, 8, 8]); p.rect(cx - 3, cy - 4, 2, 2, [250, 250, 240]);
  for (let i = -3; i <= 3; i++) p.line(cx + i * 6, cy - 12 * (1 - ((i * 6) / 22) ** 2) - 1, cx + i * 7, cy - 17, [20, 18, 16]);
  p.textC('WORK', 32, 52, [26, 24, 22], 2);
  p.textC('HARDER.', 32, 64, [26, 24, 22], 2);
  p.textC('THE ALGORITHM', 32, 79, [150, 30, 28]);
  p.textC('IS WATCHING.', 32, 86, [150, 30, 28]);
  tapeCorners(p);
  p.grime(r, 0.25);
});
def('poster_safety', 64, 96, (p, r) => {
  paper(p, r, [214, 182, 62]);
  p.frame(2, 2, 60, 92, [26, 24, 20]); p.frame(3, 3, 58, 90, [26, 24, 20]);
  p.textC('SAFETY', 32, 7, [26, 24, 20], 2);
  p.textC('FIRST', 32, 19, [26, 24, 20], 2);
  const k = [24, 22, 18];
  for (let i = 0; i < 18; i++) { p.set(32 - i * 0.9, 34 + i * 1.6, k); p.set(32 + i * 0.9, 34 + i * 1.6, k); }
  p.rect(16, 62, 33, 1, k);
  p.circle(31, 43, 2.5, k); p.rect(28, 40, 7, 2, [220, 110, 30]);
  p.line(31, 46, 30, 53, k); p.line(30, 53, 27, 58, k); p.line(30, 53, 34, 57, k);
  p.line(31, 48, 35, 45, k); p.line(31, 48, 26, 50, k);
  p.rect(36, 56, 8, 5, [150, 20, 20]);
  p.textC('DEATH IS NOT', 32, 68, k);
  p.textC('AN EXCUSE', 32, 75, k);
  p.textC('-THE ALGORITHM', 32, 85, [120, 30, 24]);
  tapeCorners(p);
  p.grime(r, 0.3);
});
def('poster_fish', 64, 96, (p, r) => {
  // re-themed: The Algorithm propaganda (id kept for saves / level data)
  paper(p, r, [30, 26, 44]);
  p.frame(2, 2, 60, 92, [200, 180, 130]);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; p.line(32 + Math.cos(a) * 16, 32 + Math.sin(a) * 12, 32 + Math.cos(a) * 28, 32 + Math.sin(a) * 22, [120, 90, 150], 0.5); }
  eyeIcon(p, 32, 32, 18, 10, [200, 40, 60], [10, 6, 10], [20, 16, 28]);
  p.textS('LIKE.', 32, 52, [236, 214, 170], [10, 10, 16], 2);
  p.textS('SHARE.', 32, 64, [236, 214, 170], [10, 10, 16], 2);
  p.textS('OBEY.', 32, 76, [220, 50, 70], [10, 10, 16], 2);
  p.textC('THE ALGORITHM', 32, 88, [160, 150, 130]);
  tapeCorners(p);
  p.grime(r, 0.3);
});
def('poster_missing', 64, 96, (p, r) => {
  paper(p, r, [222, 220, 212]);
  p.textC('MISSING', 32, 4, [170, 20, 20], 2);
  p.rect(14, 17, 36, 34, [120, 120, 118]);
  for (let y = 40; y < 50; y++) for (let x = 15; x < 49; x++) {
    if ((x - 32) ** 2 / 196 + (y - 51) ** 2 / 100 <= 1) p.set(x, y, [44, 44, 46]);
  }
  p.ellipse(32, 31, 7, 8, [52, 52, 54]);
  p.frame(14, 17, 36, 34, [40, 40, 40]);
  p.set(29, 30, [240, 240, 240]); p.set(35, 30, [240, 240, 240]);
  p.line(20, 22, 44, 46, [170, 20, 20], 0.7); p.line(44, 22, 20, 46, [170, 20, 20], 0.7);
  p.textC('HAVE YOU', 32, 56, [30, 30, 30]);
  p.textC('SEEN THIS', 32, 63, [30, 30, 30]);
  p.textC('USER?', 32, 70, [30, 30, 30]);
  p.textC('LAST ONLINE 3Y', 32, 78, [120, 30, 30]);
  for (let x = 4; x < 60; x += 7) { p.rect(x, 86, 1, 10, [150, 150, 146]); p.rect(x + 2, 88, 3, 1, [90, 90, 90]); p.rect(x + 2, 91, 3, 1, [90, 90, 90]); }
  tapeCorners(p);
  p.grime(r, 0.3);
});
def('blood_splat', 64, 64, (p, r) => {
  p.clear();
  const n = fbm(r, 64, 64, [16, 8, 4]);
  p.each((x, y, i) => {
    const d = Math.sqrt((x - 32) ** 2 + (y - 32) ** 2) / 24;
    const v = d + (n[i] - 0.5) * 0.9;
    if (v < 0.55 && x > 0 && y > 0 && x < 63 && y < 63) p.set(x, y, mix([84, 6, 6], [140, 18, 14], Math.min(1, r() * 0.4 + (0.55 - v))));
  });
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2, d = 18 + r() * 12;
    p.circle(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 0.6 + r() * 1.6, [110, 10, 10]);
  }
  for (let i = 0; i < 5; i++) { const a = r() * Math.PI * 2; p.line(32 + Math.cos(a) * 10, 32 + Math.sin(a) * 10, 32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26, [100, 8, 8]); }
}, true);
def('graffiti', 128, 64, (p, r) => {
  p.clear();
  const c = [176, 24, 20];
  p.text('IT HEARS', 17, 8, c, 3);
  p.text('YOU', 42, 30, c, 4);
  const pts = [];
  p.each((x, y) => { if (p.getA(x, y) > 0) pts.push([x, y]); });
  for (const [x, y] of pts) {
    if (r() < 0.12) p.set(x + Math.round((r() - 0.5) * 5), y + Math.round((r() - 0.5) * 5), c);
    if (p.getA(x, y + 1) === 0 && r() < 0.12) { const l = 2 + r() * 10; for (let k = 1; k < l && y + k < 63; k++) p.set(x, y + k, c); }
  }
  p.line(8, 56, 118, 54, c);
}, true);
def('cobweb', 64, 64, (p, r) => {
  p.clear();
  const c = [206, 206, 200];
  const spokes = 10, cx = 32, cy = 32;
  const ang = [];
  for (let i = 0; i < spokes; i++) ang.push((i / spokes) * Math.PI * 2 + (r() - 0.5) * 0.3);
  for (const a of ang) p.line(cx, cy, cx + Math.cos(a) * 34, cy + Math.sin(a) * 34, c);
  for (let rad = 5; rad < 31; rad += 4 + r() * 2) {
    for (let i = 0; i < spokes; i++) {
      const a0 = ang[i], a1 = ang[(i + 1) % spokes], r0 = rad + (r() - 0.5) * 2, r1 = rad + (r() - 0.5) * 2;
      if (r() < 0.12) continue;
      p.line(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0, cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1, c);
    }
  }
  p.line(0, 0, 10, 10, c); p.line(63, 0, 54, 10, c); p.line(0, 63, 10, 54, c); p.line(63, 63, 54, 54, c);
}, true);
def('chain', 16, 64, (p, r) => {
  p.clear();
  const m = [96, 96, 92];
  for (let y = 0; y < 64; y += 16) {
    p.ring(7.5, y + 5.5, 2.2, 4.8, m);
    p.set(5, y + 3, [170, 170, 164]); p.set(6, y + 2, [170, 170, 164]);
    p.rect(6, y + 10, 4, 8, scl(m, 0.8)); p.rect(6, y + 10, 1, 8, scl(m, 1.3));
  }
}, true);
def('chainlink', 32, 32, (p, r) => {
  p.clear();
  p.each((x, y) => {
    if ((x + y) % 8 === 0 || (x - y + 32) % 8 === 0) {
      let c = scl([140, 142, 138], 0.8 + r() * 0.3);
      if (r() < 0.1) c = [120, 70, 40];
      p.set(x, y, c);
    }
  });
}, true);
def('lattice', 64, 64, (p, r) => {
  p.clear();
  const s = [112, 112, 106];
  p.each((x, y) => {
    const onFrame = x < 3 || x > 60 || y < 3 || y > 60;
    const onDiag = Math.abs(x - y) < 2 || Math.abs(x + y - 63) < 2;
    if (onFrame || onDiag) {
      let c = scl(s, (x < 1 || y < 1 ? 1.2 : 0.95) * (0.85 + r() * 0.25));
      if (r() < 0.08) c = [120, 66, 36];
      p.set(x, y, c);
    }
  });
}, true);
def('fire', 32, 32, (p, r) => {
  p.clear();
  const n = fbm(r, 32, 32, [8, 4]);
  for (let x = 0; x < 32; x++) {
    const d = Math.abs(x - 15.5) / 16;
    const tongue = 0.55 + 0.45 * Math.abs(Math.cos((x / 32) * Math.PI * 3));
    const hgt = (1 - d * d) * 29 * tongue * (0.7 + n[x] * 0.4);
    for (let y = 0; y < hgt; y++) {
      const t = y / hgt;
      if (t > 0.8 && r() < 0.4) continue;
      p.set(x, 31 - y, t < 0.35 ? [255, 232, 130] : t < 0.7 ? [250, 146, 40] : [206, 64, 20]);
    }
  }
}, true);

// ===== items / misc
def('gold', 32, 32, (p, r) => {
  p.noiseFill(r, [180, 134, 36], [236, 196, 80], [8, 4], 10);
  p.each((x, y) => {
    const d = (x + y) % 32;
    if (d > 6 && d < 10) p.set(x, y, [255, 236, 150], 0.7);
  });
  specks(p, r, 20, 0.8);
});
def('fish_skin', 64, 32, (p, r) => {
  p.each((x, y) => {
    const t = y / 31;
    let c = mix([62, 66, 72], [206, 206, 198], smooth(Math.min(1, Math.max(0, (t - 0.2) / 0.55))));
    const sx = x % 4, sy = (y + ((x >> 2) & 1) * 2) % 4;
    if (sy === 0 && sx > 0) c = scl(c, 0.84);
    if (y === 15) c = scl(c, 0.72);
    p.set(x, y, scl(c, 0.95 + r() * 0.1));
  });
});
def('porcelain', 64, 64, (p, r) => {
  p.noiseFill(r, [218, 220, 214], [234, 236, 230], [16, 8], 4);
  const b = [40, 60, 140];
  p.rect(0, 8, 64, 2, b); p.rect(0, 52, 64, 2, b); p.rect(0, 12, 64, 1, b); p.rect(0, 49, 64, 1, b);
  for (let x = 0; x < 64; x++) p.set(x, 30 + Math.round(Math.sin((x / 64) * Math.PI * 4) * 5), b);
  for (let i = 0; i < 4; i++) {
    const cx = 8 + i * 16, cy = 30 + Math.round(Math.sin(((8 + i * 16) / 64) * Math.PI * 4) * 5);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; p.circle(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3, 1.4, b); }
    p.circle(cx, cy, 1, [200, 170, 60]);
    p.ellipse(cx + 6, cy - 6, 2, 1, b); p.ellipse(cx - 5, cy + 7, 2, 1, b);
  }
  for (let i = 0; i < 5; i++) crack(p, r, 12, [180, 180, 176]);
});
def('amphora', 64, 64, (p, r) => {
  p.noiseFill(r, [160, 82, 48], [184, 100, 60], [16, 8, 4], 8);
  const k = [30, 24, 20];
  p.rect(0, 6, 64, 4, k);
  p.rect(0, 22, 64, 18, k);
  for (let cx = 0; cx < 64; cx += 8) {
    const c = [184, 104, 62];
    p.rect(cx + 1, 25, 6, 1, c); p.rect(cx + 6, 25, 1, 10, c); p.rect(cx + 3, 34, 4, 1, c); p.rect(cx + 3, 29, 1, 6, c); p.rect(cx + 3, 29, 2, 1, c);
  }
  for (let cx = 0; cx < 64; cx += 8) for (let y = 0; y < 6; y++) p.rect(cx + y * 0.5 + 1, 46 + y, 7 - y, 1, k);
  p.grime(r, 0.3);
  for (let i = 0; i < 3; i++) crack(p, r, 10, [90, 50, 30]);
});
def('medkit', 32, 32, (p, r) => {
  p.noiseFill(r, [206, 206, 198], [226, 226, 220], [8, 4], 6);
  p.rect(12, 5, 8, 22, [188, 30, 30]); p.rect(5, 12, 22, 8, [188, 30, 30]);
  p.bevel(0, 0, 32, 32, 1.1, 0.6);
  p.grime(r, 0.25);
});
def('stop_sign', 64, 64, (p, r) => {
  p.noiseFill(r, [118, 118, 116], [136, 136, 132], [8, 4], 6);
  const a = 29.5, b = 26.5;
  p.each((x, y) => {
    const dx = Math.abs(x - 31.5), dy = Math.abs(y - 31.5);
    if (dx <= a && dy <= a && dx + dy <= a * 1.414) {
      const inner = dx <= b && dy <= b && dx + dy <= b * 1.414;
      p.set(x, y, inner ? scl([184, 28, 26], 0.9 + r() * 0.15) : [226, 226, 220]);
    }
  });
  p.textC('STOP', 32, 25, [236, 236, 230], 3);
  for (let i = 0; i < 3; i++) { const x = 14 + r() * 36, y = 14 + r() * 36; p.circle(x, y, 1.6, [210, 210, 200]); p.set(x, y, [20, 20, 20]); }
  rustify(p, r, 0.74);
  p.grime(r, 0.25);
});
def('boombox_front', 64, 32, (p, r) => {
  p.noiseFill(r, [46, 46, 48], [60, 60, 62], [8, 4], 6);
  for (const cx of [13.5, 50.5]) {
    p.circle(cx, 17, 11, [26, 26, 26]);
    p.circle(cx, 17, 9, [70, 70, 74]);
    p.ring(cx, 17, 6, 6.8, [50, 50, 54]);
    p.circle(cx, 17, 3, [20, 20, 20]);
    p.set(cx - 5, 12, [140, 140, 150]);
  }
  p.rect(25, 5, 14, 12, [92, 92, 98]); p.bevel(25, 5, 14, 12);
  p.rect(27, 8, 10, 6, [20, 20, 22]); p.circle(29, 11, 1, [200, 200, 190]); p.circle(35, 11, 1, [200, 200, 190]);
  const bc = [[200, 40, 40], [220, 180, 40], [40, 160, 60], [200, 200, 200]];
  bc.forEach((c, i) => p.rect(26 + i * 3, 21, 2, 3, c));
  p.textC('TFG', 32, 26, [200, 190, 160]);
});
def('wet_floor', 32, 64, (p, r) => {
  p.noiseFill(r, [214, 176, 30], [232, 194, 44], [8, 4], 6);
  const k = [24, 22, 18];
  for (let i = 0; i < 16; i++) { p.set(16 - i * 0.7, 4 + i, k); p.set(16 + i * 0.7, 4 + i, k); }
  p.rect(5, 20, 23, 1, k);
  p.circle(15, 10, 1.3, k); p.line(15, 12, 14, 16, k); p.line(14, 16, 11, 19, k); p.line(14, 16, 18, 18, k); p.line(15, 13, 19, 12, k);
  p.textC('CAUTION', 16, 26, k);
  p.textC('WET', 16, 34, k);
  p.textC('FLOOR', 16, 41, k);
  hazard(p, 0, 52, 32, 12, 4);
  p.grime(r, 0.25);
});
def('shells_box', 32, 32, (p, r) => {
  p.noiseFill(r, [150, 28, 22], [172, 40, 30], [8, 4], 6);
  p.rect(0, 10, 32, 11, [226, 220, 204]);
  p.textC('12 GA', 16, 13, [150, 28, 22]);
  for (let i = 0; i < 3; i++) { p.rect(6 + i * 8, 24, 4, 6, [190, 40, 30]); p.rect(6 + i * 8, 28, 4, 2, [200, 170, 70]); }
  p.bevel(0, 0, 32, 32, 1.1, 0.6);
  p.grime(r, 0.25);
});
def('slot_reels', 64, 32, (p, r) => {
  p.fill([40, 20, 20]);
  for (let i = 0; i < 3; i++) {
    const x = 3 + i * 20;
    p.rect(x, 3, 18, 26, [232, 226, 210]);
    p.each((xx, yy) => { if (xx >= x && xx < x + 18 && yy >= 3 && yy < 29) p.mul(xx, yy, 0.75 + 0.25 * Math.sin(((yy - 3) / 26) * Math.PI)); });
  }
  drawFish(p, 12, 16, 14, 7, [120, 130, 140], [220, 220, 210]);
  p.text('7', 27, 9, [200, 30, 30], 3);
  p.circle(49, 18, 3, [200, 30, 30]); p.circle(54, 19, 3, [200, 30, 30]); p.line(49, 15, 53, 9, [40, 120, 40]); p.line(54, 16, 53, 9, [40, 120, 40]);
  p.rect(0, 15, 64, 1, [220, 40, 40]);
});
def('corkboard', 64, 64, (p, r) => {
  p.noiseFill(r, [146, 104, 62], [178, 134, 86], [8, 4, 2], 26);
  specks(p, r, 200, 0.7);
  const papers = [[226, 224, 214], [230, 214, 120], [220, 190, 196], [190, 214, 226], [236, 234, 226]];
  for (let i = 0; i < 6; i++) {
    const w = 12 + Math.floor(r() * 10), h = 14 + Math.floor(r() * 10);
    const x = 2 + Math.floor(r() * (60 - w)), y = 2 + Math.floor(r() * (60 - h));
    const c = pick(r, papers);
    p.rect(x + 1, y + 1, w, h, [70, 50, 30], 0.5);
    p.rect(x, y, w, h, c);
    for (let ly = y + 4; ly < y + h - 2; ly += 3) p.rect(x + 2, ly, Math.floor(w * (0.5 + r() * 0.4)), 1, [70, 70, 80]);
    p.circle(x + w / 2, y + 1, 1, pick(r, [[200, 30, 30], [40, 80, 200], [40, 160, 60]]));
  }
});
def('unknown', 32, 32, (p) => {
  checker(p, [200, 0, 200], [12, 12, 12], 8);
  p.rect(10, 7, 13, 19, [0, 0, 0]);
  p.text('?', 12, 9, [255, 255, 255], 3);
});
def('label_open', 48, 16, (p, r) => {
  p.fill([26, 132, 56]); p.frame(0, 0, 48, 16, [210, 236, 214]);
  p.textC('OPEN', 24, 3, [236, 250, 236], 2);
  p.grain(r, 8);
});
def('label_close', 48, 16, (p, r) => {
  p.fill([170, 30, 28]); p.frame(0, 0, 48, 16, [240, 214, 210]);
  p.textC('CLOSE', 24, 3, [250, 236, 232], 2);
  p.grain(r, 8);
});

// ================================================================ interior themes (src/world/interiors)
function heartIcon(p, cx, cy, s, c) {
  for (let y = -s; y <= s * 1.3; y++) for (let x = -s * 1.4; x <= s * 1.4; x++) {
    const ax = Math.abs(x) - s * 0.62, ay = y + s * 0.2;
    const lobes = ax * ax + ay * ay <= (s * 0.72) ** 2 && y < s * 0.3;
    const tip = y >= -s * 0.1 && Math.abs(x) <= (s * 1.3 - y) * 1.05;
    if (lobes || tip) p.set(cx + x, cy + y, c);
  }
}
function eyeIcon(p, cx, cy, rx, ry, iris, pupil, lid) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const e = (x * x) / (rx * rx) + (y * y) / ((ry * (1 - Math.abs(x) / (rx * 1.15))) ** 2 + 0.3);
    if (e <= 1) p.set(cx + x, cy + y, [236, 232, 220]);
  }
  p.circle(cx, cy, ry * 0.75, iris);
  p.circle(cx, cy, ry * 0.32, pupil);
  p.set(cx - 1, cy - 1, [255, 255, 255]);
  for (let x = -rx; x <= rx; x++) {
    const yy = Math.round(-ry * (1 - (x / rx) ** 2));
    p.set(cx + x, cy + yy, lid); p.set(cx + x, cy - yy, lid);
  }
}
// office (Corporate Intranet)
def('carpet_office', 64, 64, (p, r) => {
  p.noiseFill(r, [58, 66, 80], [78, 86, 100], [8, 4, 2], 22);
  p.each((x, y) => { if ((x % 8 === 0) && (y % 8 === 0)) p.set(x, y, [104, 112, 126], 0.6); if ((x + y) % 2) p.mul(x, y, 0.95); });
  for (let i = 0; i < 4; i++) stain(p, r, r() * 64, r() * 64, 3 + r() * 7, [44, 40, 34], 0.3);
  stain(p, r, r() * 64, r() * 64, 3, [70, 44, 26], 0.45);   // coffee
  p.grime(r, 0.25);
});
def('wall_office', 64, 64, (p, r) => {
  p.noiseFill(r, [176, 168, 146], [196, 188, 166], [16, 8, 4], 7);
  p.each((x, y) => { if (x % 32 === 0) p.mul(x, y, 0.86); if (x % 32 === 1) p.mul(x, y, 1.05); });
  scratches(p, r, 8, [140, 132, 116], 0.35);
  for (let i = 0; i < 3; i++) stain(p, r, r() * 64, r() * 64, 4 + r() * 6, [150, 134, 100], 0.2);
  p.grime(r, 0.22);
});
def('cubicle_fabric', 32, 32, (p, r) => {
  p.noiseFill(r, [86, 98, 118], [104, 116, 136], [8, 4], 10);
  p.each((x, y) => p.mul(x, y, ((x + y) & 1 ? 1.05 : 0.95) * (x % 4 === 0 ? 0.94 : 1)));
  p.grime(r, 0.2);
});
def('whiteboard', 64, 48, (p, r) => {
  p.fill([218, 220, 214]);
  p.frame(0, 0, 64, 48, [150, 152, 150]); p.frame(1, 1, 62, 46, [180, 182, 180]);
  const blue = [40, 70, 170], red = [180, 36, 32], blk = [40, 40, 44];
  p.text('Q3 KPI', 4, 4, blue);
  p.line(6, 40, 16, 32, blk); p.line(16, 32, 26, 36, blk); p.line(26, 36, 38, 20, blk); p.line(38, 20, 44, 26, blk); p.line(44, 26, 58, 8, red);
  p.line(58, 8, 55, 9, red); p.line(58, 8, 57, 11, red);
  p.text('SYNERGY', 4, 12, blk);
  p.text('ENGAGE', 30, 30, red);
  p.line(4, 42, 60, 42, blk, 0.5); p.line(4, 42, 4, 12, blk, 0.3);
  for (let i = 0; i < 5; i++) { const x = r() * 60, y = r() * 44; p.line(x, y, x + 4 + r() * 8, y + (r() - 0.5) * 3, [150, 150, 160], 0.45); }
  p.rect(18, 44, 20, 3, [120, 120, 124]);
});
def('elevator_panel', 32, 64, (p, r) => {
  p.fill([150, 152, 154]); brushed(p, r, [140, 142, 146], [176, 178, 182], 6);
  p.rect(6, 4, 20, 10, [16, 10, 8]);
  p.text('404', 8, 7, [255, 120, 40]);
  for (const y of [26, 40]) { p.circle(16, y, 5, [70, 70, 74]); p.circle(16, y, 4, [210, 206, 190]); }
  p.line(13, 27, 16, 24, [60, 60, 60]); p.line(19, 27, 16, 24, [60, 60, 60]);
  p.line(13, 39, 16, 42, [60, 60, 60]); p.line(19, 39, 16, 42, [60, 60, 60]);
  p.textC('OUT OF', 16, 50, [180, 36, 32]); p.textC('ORDER', 16, 57, [180, 36, 32]);
});
// backrooms (Level 0)
def('carpet_wet', 64, 64, (p, r) => {
  p.noiseFill(r, [140, 118, 60], [168, 146, 80], [8, 4, 2], 24);
  const n = fbm(r, 64, 64, [32, 16, 8]);
  p.each((x, y, i) => { const t = (n[i] - 0.52) / 0.2; if (t > 0) p.mul(x, y, 1 - Math.min(0.42, t * 0.42)); if ((x + y * 3) % 5 === 0) p.mul(x, y, 0.93); });
  for (let i = 0; i < 3; i++) stain(p, r, r() * 64, r() * 64, 5 + r() * 9, [92, 74, 36], 0.3);
  p.grime(r, 0.2);
});
def('wallpaper_yellow', 64, 64, (p, r) => {
  p.noiseFill(r, [188, 170, 104], [206, 190, 122], [16, 8, 4], 6);
  p.each((x, y) => {
    const m = x % 16;
    if (m === 0) p.mul(x, y, 0.9);
    if ((m === 5 || m === 11) && ((y + (m === 5 ? 0 : 4)) % 8) < 3) p.set(x, y, [170, 150, 88], 0.55);
    if (m === 8 && y % 8 === 4) p.set(x, y, [214, 198, 136], 0.8);
  });
  drips(p, r, 5, [136, 114, 60], 0.25, 30);
  for (let i = 0; i < 2; i++) stain(p, r, r() * 64, 44 + r() * 20, 6 + r() * 6, [140, 118, 64], 0.3);
  p.grime(r, 0.18);
});
def('ceiling_stained', 64, 64, (p, r) => {
  p.noiseFill(r, [178, 168, 128], [198, 188, 146], [8, 4], 8);
  specks(p, r, 180, 0.76);
  p.each((x, y) => {
    const gx = x % 32, gy = y % 32;
    if (gx === 0 || gy === 0) p.set(x, y, [150, 140, 104]);
    else if (gx === 31 || gy === 31) p.mul(x, y, 0.84);
  });
  for (let i = 0; i < 2; i++) { const sx = r() * 64, sy = r() * 64, rad = 5 + r() * 7; stain(p, r, sx, sy, rad, [150, 118, 58], 0.45); p.ring(sx, sy, rad - 1, rad + 0.6, [118, 88, 40], 0.45); }
  p.grime(r, 0.15);
});
def('ceiling_panel_lit', 32, 32, (p, r) => {
  p.fill([250, 248, 226]);
  p.each((x, y) => { if (x % 8 === 0 || y % 8 === 0) p.set(x, y, [214, 210, 186]); });
  p.frame(0, 0, 32, 32, [180, 176, 150]);
  specks(p, r, 20, 0.92);
});
def('pool_tiles', 64, 64, (p, r) => {
  tiles(p, r, 8, () => [212, 230, 232], [150, 176, 180]);
  p.grime(r, 0.12);
});
// server farm
def('raised_floor', 64, 64, (p, r) => {
  brushed(p, r, [120, 124, 130], [146, 150, 156], 6);
  p.each((x, y) => {
    const gx = x % 32, gy = y % 32;
    if (gx === 0 || gy === 0) p.set(x, y, [60, 62, 66]);
    else if (gx === 1 || gy === 1) p.mul(x, y, 1.12);
    else if (gx === 31 || gy === 31) p.mul(x, y, 0.8);
  });
  // two perforated tiles per repeat
  for (const [ox, oy] of [[0, 0], [32, 32]]) for (let y = 5; y < 28; y += 3) for (let x = 5; x < 28; x += 3) p.set(ox + x, oy + y, [40, 44, 52]);
  p.grime(r, 0.15);
});
def('server_wall', 64, 64, (p, r) => {
  p.noiseFill(r, [196, 200, 204], [214, 218, 222], [16, 8], 5);
  p.each((x, y) => { if (x % 32 === 0 || y % 64 === 0) p.set(x, y, [150, 154, 160]); if (x % 32 === 1) p.mul(x, y, 1.05); });
  p.rect(4, 30, 56, 2, [60, 150, 210], 0.8);
  p.grime(r, 0.16);
});
def('sign_aisle', 64, 32, (p, r) => {
  p.fill([24, 28, 34]);
  p.rect(0, 0, 32, 32, [200, 50, 40]); p.rect(32, 0, 32, 32, [40, 110, 200]);
  p.textC('HOT', 16, 8, [255, 236, 220], 2); p.textC('AISLE', 16, 21, [255, 236, 220]);
  p.textC('COLD', 48, 8, [230, 244, 255], 2); p.textC('AISLE', 48, 21, [230, 244, 255]);
  p.grain(r, 8);
});
def('screen_noc', 64, 32, (p, r) => {
  p.fill([6, 14, 20]);
  for (let i = 0; i < 6; i++) { const y = 4 + i * 4; p.rect(3, y, 16 + Math.floor(r() * 12), 2, r() < 0.2 ? [220, 60, 50] : [60, 200, 120]); }
  for (let x = 34; x < 62; x++) p.set(x, 22 - Math.round(Math.sin(x * 0.5) * 3 + r() * 4), [80, 200, 255]);
  p.text('UPTIME 0%', 33, 26, [255, 90, 70]);
  p.frame(0, 0, 64, 32, [40, 60, 70]);
});
// sewer (The Comment Sewer)
def('sewer_brick', 64, 64, (p, r) => {
  p.noiseFill(r, [46, 48, 36], [62, 64, 48], [16, 8], 8);
  for (let row = 0; row < 8; row++) {
    const off = row & 1 ? 8 : 0;
    for (let bx = -1; bx < 4; bx++) {
      const x0 = bx * 16 + off, y0 = row * 8, c = scl([74, 70, 52], 0.8 + r() * 0.35);
      for (let y = 1; y < 8; y++) for (let x = 1; x < 16; x++) p.set(x0 + x, y0 + y, scl(c, 0.92 + r() * 0.14));
    }
  }
  const n = fbm(r, 64, 64, [16, 8, 4]);
  p.each((x, y, i) => { const t = (n[i] - 0.5) / 0.2 + (y / 64) * 0.9 - 0.3; if (t > 0) p.set(x, y, [44, 70, 30], Math.min(0.75, t * 0.6)); });
  drips(p, r, 12, [70, 90, 40], 0.45, 26);
  p.grime(r, 0.3);
});
def('sewer_floor', 64, 64, (p, r) => {
  p.noiseFill(r, [48, 50, 42], [72, 74, 62], [16, 8, 4, 2], 12);
  const n = fbm(r, 64, 64, [32, 16]);
  p.each((x, y, i) => { if (n[i] > 0.6) p.set(x, y, [36, 48, 34], 0.6); if (n[i] < 0.3) p.mul(x, y, 1.12); });
  crack(p, r, 20, [30, 30, 26]);
  speckle(p, r, 60, [90, 96, 80], 0.5);
});
def('sludge', 64, 64, (p, r) => {
  p.noiseFill(r, [60, 150, 30], [120, 220, 60], [16, 8, 4], 14);
  for (let i = 0; i < 18; i++) { const x = r() * 64, y = r() * 64, rad = 1 + r() * 3; p.ring(x, y, rad, rad + 0.8, [190, 255, 120], 0.8); }
  speckle(p, r, 40, [30, 70, 10], 0.6);
});
// hospital (Telehealth Clinic)
def('tiles_mint', 64, 64, (p, r) => {
  tiles(p, r, 16, (i, j) => ((i + j) & 1 ? [168, 196, 176] : [196, 214, 200]), [128, 146, 134]);
  scratches(p, r, 10, [120, 136, 124], 0.3);
  p.grime(r, 0.28);
});
def('wall_hospital', 64, 64, (p, r) => {
  p.noiseFill(r, [174, 200, 184], [192, 214, 198], [16, 8, 4], 6);
  p.each((x, y) => { if (x % 32 === 0) p.mul(x, y, 0.9); });
  scratches(p, r, 10, [140, 160, 146], 0.35);
  drips(p, r, 4, [120, 110, 80], 0.2, 20);
  for (let i = 0; i < 2; i++) stain(p, r, r() * 64, r() * 64, 4 + r() * 6, [150, 130, 90], 0.22);
  p.grime(r, 0.24);
});
def('curtain', 32, 64, (p, r) => {
  p.noiseFill(r, [150, 186, 190], [170, 204, 206], [8, 4], 6);
  p.each((x, y) => p.mul(x, y, 0.82 + 0.2 * Math.abs(Math.sin(x * 0.4))));
  stain(p, r, 8 + r() * 16, 50, 5, [120, 30, 26], 0.3);
});
def('morgue_front', 64, 64, (p, r) => {
  brushed(p, r, [150, 154, 156], [180, 184, 186], 6);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) {
    const x = 2 + i * 31, y = 2 + j * 21;
    p.frame(x, y, 29, 19, [90, 94, 96]); p.bevel(x + 1, y + 1, 27, 17, 1.15, 0.8);
    p.rect(x + 10, y + 12, 9, 2, [70, 72, 74]);
    p.rect(x + 11, y + 4, 7, 4, [226, 222, 206]);
  }
  p.grime(r, 0.25);
});
def('poster_hospital', 64, 96, (p, r) => {
  paper(p, r, [226, 232, 230]);
  p.rect(4, 4, 56, 12, [40, 130, 110]);
  p.textC('HEALTH TIP', 32, 8, [236, 250, 244]);
  p.rect(22, 22, 20, 20, [210, 60, 50]); p.rect(28, 20, 8, 24, [210, 60, 50]); p.rect(20, 28, 24, 8, [210, 60, 50]);
  p.rect(24, 24, 16, 16, [236, 96, 80]); p.rect(28, 28, 8, 8, [250, 250, 244]);
  p.textC('HAVE YOU', 32, 50, [30, 40, 40]);
  p.textC('TRIED', 32, 57, [30, 40, 40]);
  p.textC('TURNING IT', 32, 64, [30, 40, 40]);
  p.textC('OFF AND ON', 32, 71, [30, 40, 40]);
  p.textC('AGAIN?', 32, 78, [180, 40, 36]);
  tapeCorners(p);
  p.grime(r, 0.25);
});
// shared internet-horror posters
def('poster_like', 64, 96, (p, r) => {
  paper(p, r, [38, 34, 52]);
  p.frame(2, 2, 60, 92, [210, 190, 120]);
  heartIcon(p, 32, 30, 14, [220, 40, 70]);
  p.circle(26, 26, 2, [250, 180, 190]);
  p.textS('ENGAGEMENT', 32, 54, [240, 220, 180], [10, 10, 16]);
  p.textS('IS LOVE', 32, 64, [230, 60, 80], [10, 10, 16], 2);
  p.textC('- THE ALGORITHM', 32, 84, [180, 170, 150]);
  tapeCorners(p);
  p.grime(r, 0.3);
});
def('poster_hang', 64, 96, (p, r) => {
  paper(p, r, [120, 170, 210]);
  p.line(4, 14, 60, 18, [60, 50, 40]);
  const k = [70, 60, 50];
  p.ellipse(34, 34, 9, 12, [200, 150, 90]); p.ellipse(34, 22, 7, 6, [210, 160, 100]);
  p.line(28, 18, 26, 16, k); p.line(40, 18, 42, 16, k);
  p.circle(31, 22, 1, [20, 20, 20]); p.circle(37, 22, 1, [20, 20, 20]);
  p.rect(26, 15, 3, 3, [200, 150, 90]); p.rect(39, 16, 3, 3, [200, 150, 90]);
  p.textS('HANG IN', 32, 56, [255, 255, 255], [30, 40, 60], 2);
  p.textS('THERE', 32, 68, [255, 255, 255], [30, 40, 60], 2);
  p.textC("DON'T LOG OFF", 32, 84, [30, 40, 60]);
  tapeCorners(p);
  p.grime(r, 0.3);
});
// wave 8 studio: six more notice-board posters (faction slogans from docs/LORE.md) so no room repeats the same three
def('poster_delete', 64, 96, (p, r) => {
  paper(p, r, [52, 84, 112]);
  p.frame(2, 2, 60, 92, [200, 226, 240]);
  p.ellipse(32, 24, 15, 8, [226, 238, 244]); p.circle(32, 24, 6, [30, 60, 90]); p.circle(32, 24, 2.5, [10, 14, 20]);
  p.line(16, 40, 48, 10, [190, 40, 40]); p.line(17, 40, 49, 10, [190, 40, 40]);
  p.textC('IF YOU SEE', 32, 46, [230, 240, 246]);
  p.textC('SOMETHING,', 32, 54, [230, 240, 246]);
  p.textS('DELETE', 32, 64, [255, 255, 255], [20, 40, 60], 2);
  p.textC('SOMETHING', 32, 78, [230, 240, 246]);
  p.textC('MOD BUREAU', 32, 87, [150, 190, 214]);
  tapeCorners(p);
  p.grime(r, 0.3);
});
def('poster_grave', 64, 96, (p, r) => {
  paper(p, r, [96, 106, 62]);
  p.frame(2, 2, 60, 92, [210, 220, 150]);
  p.rect(22, 14, 20, 24, [160, 168, 150]); p.ellipse(32, 14, 10, 6, [160, 168, 150]);
  p.textC('404', 32, 22, [50, 56, 40], 2);
  p.rect(14, 38, 36, 2, [40, 60, 30]);
  p.textC('IS NOT AN', 32, 46, [236, 240, 200]);
  p.textC('ERROR.', 32, 54, [236, 240, 200]);
  p.textC('IT IS A', 32, 66, [236, 240, 200]);
  p.textS('GRAVE.', 32, 74, [255, 255, 230], [40, 48, 26], 2);
  p.textC('THE ARCHIVE', 32, 87, [190, 200, 130]);
  tapeCorners(p);
  p.grime(r, 0.32);
});
def('poster_noref', 64, 96, (p, r) => {
  paper(p, r, [56, 20, 42]);
  p.frame(2, 2, 60, 92, [255, 90, 160]);
  p.textS('NO', 32, 10, [255, 110, 170], [20, 6, 14], 3);
  p.textS('REFUNDS', 32, 28, [255, 230, 240], [20, 6, 14], 2);
  p.textS('NO', 32, 46, [255, 110, 170], [20, 6, 14], 2);
  p.textC('RECEIPTS', 32, 58, [255, 230, 240]);
  p.textC('NO', 32, 66, [255, 110, 170]);
  p.textC('MODERATORS', 32, 74, [255, 230, 240]);
  p.textC('DARK WEB BAZAAR', 32, 87, [200, 100, 150]);
  tapeCorners(p);
  p.grime(r, 0.3);
});
def('poster_hr', 64, 96, (p, r) => {
  paper(p, r, [214, 206, 178]);
  p.rect(4, 4, 56, 9, [40, 110, 74]);
  p.textC('HR NOTICE', 32, 6, [236, 240, 226]);
  const k = [40, 36, 30];
  p.rect(31, 20, 2, 26, k); p.rect(20, 46, 24, 2, k); p.line(14, 24, 50, 24, k);
  p.line(14, 24, 10, 34, k); p.line(14, 24, 18, 34, k); p.rect(8, 34, 12, 2, k);
  p.line(50, 24, 46, 30, k); p.line(50, 24, 54, 30, k); p.rect(44, 30, 12, 2, k);
  p.textC('WORK-LIFE', 32, 56, k);
  p.textC('BALANCE:', 32, 63, k);
  p.textC('PENDING', 32, 71, [150, 30, 28], 2);
  p.textC('ASK HR-BOT', 32, 87, [80, 74, 60]);
  tapeCorners(p);
  p.grime(r, 0.25);
});
def('poster_wash', 64, 96, (p, r) => {
  paper(p, r, [150, 194, 208]);
  p.frame(2, 2, 60, 92, [40, 80, 100]);
  const k = [40, 80, 100];
  p.ellipse(32, 28, 12, 10, [236, 214, 190]);
  for (let i = 0; i < 4; i++) p.rect(22 + i * 6, 8 + (i === 0 || i === 3 ? 4 : 0), 4, 12, [236, 214, 190]);
  p.circle(32, 28, 3, [20, 20, 20]); p.circle(32, 28, 1, [255, 255, 255]);
  p.textC('WASH YOUR', 32, 50, k);
  p.textS('HANDS.', 32, 58, [255, 255, 255], [30, 60, 80], 2);
  p.textC('THEY ARE', 32, 74, k);
  p.textC('WATCHING.', 32, 81, k);
  p.textC('FACILITIES', 32, 89, [60, 100, 120]);
  tapeCorners(p);
  p.grime(r, 0.28);
});
def('poster_lost', 64, 96, (p, r) => {
  paper(p, r, [230, 222, 190]);
  const k = [30, 28, 24];
  p.textC('LOST', 32, 6, k, 3);
  p.ellipse(32, 38, 10, 7, k); p.circle(32, 26, 6, k);
  p.line(27, 22, 25, 16, k); p.line(28, 21, 25, 16, k); p.line(37, 22, 39, 16, k); p.line(36, 21, 39, 16, k);
  p.circle(30, 26, 1, [230, 222, 190]); p.circle(35, 26, 1, [230, 222, 190]);
  p.line(41, 40, 50, 32, k); p.line(42, 40, 51, 33, k);
  p.textC('ANSWERS TO', 32, 50, k);
  p.textC('ANYTHING.', 32, 57, k);
  p.textC('FOUND: 4 CATS.', 32, 66, [150, 30, 28]);
  p.textC('NONE ARE HERS.', 32, 73, [150, 30, 28]);
  for (let i = 0; i < 7; i++) { p.rect(4 + i * 8, 82, 7, 12, [214, 206, 176]); p.line(4 + i * 8, 82, 4 + i * 8, 94, k); }
  tapeCorners(p);
  p.grime(r, 0.25);
});
def('sign_noclip', 64, 64, (p, r) => {
  paper(p, r, [226, 214, 150]);
  p.rect(2, 2, 60, 16, [30, 28, 20]);
  p.textC('LEVEL 0', 32, 7, [236, 220, 150], 2);
  p.textC('DO NOT', 32, 26, [150, 30, 24], 2);
  p.textC('NOCLIP', 32, 40, [150, 30, 24], 2);
  p.textC('STAY HYDRATED', 32, 54, [40, 36, 30]);
  p.grime(r, 0.35);
});

// missing-texture fallback (not listed in TEXTURE_NAMES)
const MISSING = { w: 16, h: 16, fn: (p) => checker(p, [255, 0, 255], [0, 0, 0], 4) };

export const TEXTURE_NAMES = Object.freeze(Object.keys(DEFS));

// ------------------------------------------------------------------------------ public API
function configurePSX(tex) {
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Creates a PSX-configured CanvasTexture. Returns null when there is no DOM (Node). */
export function makeCanvasTexture(w, h, drawFn) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    if (drawFn) drawFn(ctx, w, h);
  }
  return configurePSX(new THREE.CanvasTexture(canvas));
}

const _texCache = new Map();

/** Cached shared texture by name. Unknown names get a magenta/black checker. Null without DOM. */
export function getTexture(name) {
  if (_texCache.has(name)) return _texCache.get(name);
  if (typeof document === 'undefined') return null;
  const d = DEFS[name] || MISSING;
  const tex = makeCanvasTexture(d.w, d.h, (ctx) => {
    const p = new Pix(d.w, d.h);
    d.fn(p, seededRandom('tex:' + name));
    p.toCtx(ctx);
  });
  if (tex) {
    tex.name = String(name);
    if (ALPHA.has(name)) tex.userData.alphaTest = 0.5;
  }
  _texCache.set(name, tex);
  return tex;
}

export function isAlphaTexture(name) { return ALPHA.has(name); }

// ------------------------------------------------------------------------ material cache
const _matCache = new Map();

function applyOpts(m, tex, o) {
  if (o.flat) m.flatShading = true;
  const at = o.alphaTest ?? (tex && ALPHA.has(tex) ? 0.5 : 0);
  if (at) { m.alphaTest = at; m.side = THREE.DoubleSide; }
  if (o.double) m.side = THREE.DoubleSide;
  if (o.back) m.side = THREE.BackSide;
  if (o.opacity != null && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
  if (o.decal) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; }
  if (o.fog === false) m.fog = false;
}

/**
 * Shared MeshLambertMaterial per (texture, color, opts).
 * opts: { flat, double, back, opacity, emissive:hex, alphaTest, decal, fog }
 * Alpha textures (pine_leaves, leaves, grass_blades, ...) automatically get alphaTest 0.5 + DoubleSide.
 */
export function getMaterial(tex = null, color = 0xffffff, opts = {}) {
  const key = 'L|' + (tex || '') + '|' + color + '|' + JSON.stringify(opts || {});
  let m = _matCache.get(key);
  if (m) return m;
  m = new THREE.MeshLambertMaterial({ color, map: tex ? getTexture(tex) : null });
  opts = opts || {};
  applyOpts(m, tex, opts);
  if (opts.emissive != null) m.emissive.setHex(opts.emissive);
  m.name = (tex || 'flat') + '#' + color.toString(16);
  _matCache.set(key, m);
  return m;
}

/** Shared MeshBasicMaterial (unlit) per (texture, color, opts). */
export function getBasicMaterial(tex = null, color = 0xffffff, opts = {}) {
  const key = 'B|' + (tex || '') + '|' + color + '|' + JSON.stringify(opts || {});
  let m = _matCache.get(key);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ color, map: tex ? getTexture(tex) : null });
  applyOpts(m, tex, opts || {});
  m.name = 'basic:' + (tex || 'flat') + '#' + color.toString(16);
  _matCache.set(key, m);
  return m;
}

// ===== grime decals (round 4 interior looks: src/world/interiors/looks.js). Alpha cutout with dithered rims,
// neutral dark colours: the facility tints each decal per theme through vertex colours (one texture, many looks).
def('grime_stain', 64, 64, (p, r) => {
  p.clear();
  const n = fbm(r, 64, 64, [16, 8, 4]);
  const cx = 32 + (r() - 0.5) * 8, cy = 32 + (r() - 0.5) * 8;
  p.each((x, y, i) => {
    if (x === 0 || y === 0 || x === 63 || y === 63) return;
    const v = Math.hypot((x - cx) / 29, (y - cy) / 25) + (n[i] - 0.5) * 0.85;
    if (v >= 0.66) return;
    if (v > 0.5 && ((x + y) & 1)) return;              // dithered rim
    const k = Math.min(1, (0.66 - v) * 2.2);
    p.set(x, y, mix([92, 86, 76], [44, 40, 34], k));
  });
  speckle(p, r, 30, [30, 28, 24]);
}, true);
def('floor_puddle', 64, 64, (p, r) => {
  p.clear();
  const n = fbm(r, 64, 64, [16, 8, 4]);
  p.each((x, y, i) => {
    if (x === 0 || y === 0 || x === 63 || y === 63) return;
    const v = Math.hypot((x - 32) / 30, (y - 32) / 20) + (n[i] - 0.5) * 0.6;
    if (v >= 0.7) return;
    if (v > 0.6 && ((x ^ y) & 1)) return;
    const k = Math.min(1, (0.7 - v) * 1.8);
    p.set(x, y, mix([70, 72, 70], [26, 28, 30], k));
  });
  for (let i = 0; i < 9; i++) { const x = 20 + r() * 24, y = 24 + r() * 14; p.line(x, y, x + 2 + r() * 4, y, [150, 156, 160]); }   // wet highlights
}, true);
def('leak_streak', 32, 64, (p, r) => {
  p.clear();
  for (let s = 0; s < 7; s++) {
    const x = 3 + Math.floor(r() * 26), len = 16 + r() * 46, w = r() < 0.4 ? 2 : 1;
    for (let y = 0; y < len && y < 64; y++) {
      const fade = y / len;
      if (fade > 0.75 && ((y + x) & 1)) continue;
      const c = mix([40, 36, 30], [78, 72, 62], fade);
      for (let k = 0; k < w; k++) p.set(x + k + (y > len * 0.6 && r() < 0.1 ? 1 : 0), y, c);
    }
  }
  for (let x = 0; x < 32; x++) if (r() < 0.8) p.set(x, 0, [36, 32, 28]);   // wet line along the top
}, true);
def('floor_crack', 64, 64, (p, r) => {
  p.clear();
  const c = [30, 28, 26];
  for (let k = 0; k < 3; k++) {
    let x = 32, y = 32, a = r() * Math.PI * 2;
    for (let s = 0; s < 34; s++) {
      a += (r() - 0.5) * 0.9;
      const nx = x + Math.cos(a) * 1.4, ny = y + Math.sin(a) * 1.4;
      if (nx < 1 || ny < 1 || nx > 62 || ny > 62) break;
      p.line(x, y, nx, ny, c);
      if (r() < 0.25) p.set(nx + 1, ny, c);
      x = nx; y = ny;
    }
  }
}, true);
def('glow_panel', 16, 16, (p, r) => {
  p.fill([236, 236, 230]);
  p.frame(0, 0, 16, 16, [150, 150, 146]);
  for (let y = 3; y < 13; y += 3) for (let x = 1; x < 15; x++) p.mul(x, y, 0.9);
  p.grain(r, 6);
});

// per-theme level texture keys: same procedural fallback as their base, but their own downloaded texture
// (geobuilder.js levelTexture THEME_TEXTURES). Keeps the office ceiling from leaking into the factory.
function alias(name, base) { if (DEFS[base] && !DEFS[name]) { DEFS[name] = DEFS[base]; if (ALPHA.has(base)) ALPHA.add(name); } }
alias('ceiling_office', 'ceiling_tiles');
alias('ceiling_clinic', 'ceiling_tiles');
alias('floor_clinic', 'tiles_white');
alias('sewer_stone', 'sewer_brick');
alias('backrooms_base', 'wallpaper_yellow');
alias('marble_lobby', 'marble');
alias('server_ceiling', 'metal_dark');

const TREE_TEX = ['map', 'emissiveMap', 'alphaMap', 'lightMap', 'aoMap', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap'];
/** [leak] free what a map built into `root` owns: geometries (instanced meshes too; userData.shared = keep) and every material / texture that is NOT
 *  in the shared getMaterial / getTexture caches (per-prop screen canvases, cloned water, tinted clones ...). Cached ones are bounded by the cache and stay.
 *  Idempotent; call it BEFORE sub-systems detach their own groups. dispose() only drops the GPU copy: three re-uploads if something still draws it. */
export function freeTree(root) {
  if (!root) return;
  const cm = new Set(_matCache.values()), ct = new Set(_texCache.values());
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    for (const m of [].concat(o.material || [])) {
      if (!m || cm.has(m) || m.userData?.shared) continue;
      for (const k of TREE_TEX) { const t = m[k]; if (t && t.isTexture && !ct.has(t) && !t.isRenderTargetTexture && !t.userData?.keep) t.dispose(); }
      m.dispose();
    }
  });
}
