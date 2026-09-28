// BACKROOMS look kit: procedural canvas textures, one decal/detail atlas and the "baked light" materials used by
// the Backrooms interior (src/world/interiors/backrooms.js) and its runtime module (src/game/brlevels.js).
//
//   brTexture(name)        cached tileable CanvasTexture: 'wall' (Level 0 chevron wallpaper), 'carpet' (mustard, damp),
//                          'ceiling' (stained drop-ceiling tiles, 3x3 per 2 m), 'manila' (Manila Room walls),
//                          'redcarpet', 'atlas' (512 px decal / detail sheet, see ATLAS)
//   brMaterials()          cached shared materials { wall, carpet, ceiling, manila, redcarpet, atlas, lit, flicker, beacon,
//                          water, puddle } - wall/carpet/ceiling/manila/redcarpet/atlas are bake-enabled
//   atlasUV(region)        [u0, v0, u1, v1] of an ATLAS region (texture space, v up)
//   bakeMaterial(mat)      clone of a lit material with a per-vertex "baked light" term (attribute vec3 `bake`):
//                          emissive += albedo * bake * BAKE.value. Missing attribute = 0 (no bake). Cached per material.
//   BAKE                   shared uniform { value } - the runtime scales every baked surface with it (power, blackouts)
//
// Everything is lazy and DOM-free at import time: in Node (layout tests) textures are null and materials are
// plain Lambert/Basic ones, so the pure planner (backrooms_levels.js) and facility code can still be imported.
import * as THREE from 'three';
import { seededRandom } from '../../render/textures.js';

const HAS_DOM = typeof document !== 'undefined';
export const BAKE = { value: 1 };

// ------------------------------------------------------------------------------------------ helpers
function makeTex(w, h, draw, { repeat = true, mips = true } = {}) {
  if (!HAS_DOM) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  g.imageSmoothingEnabled = false;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = mips ? THREE.NearestMipmapLinearFilter : THREE.NearestFilter;
  t.generateMipmaps = mips;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 1;
  t.needsUpdate = true;
  return t;
}
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
/** tileable value noise 0..1 (period w x h, lattice `cell` px) */
function tileNoise(rnd, w, h, cell) {
  const gx = Math.max(1, Math.round(w / cell)), gy = Math.max(1, Math.round(h / cell));
  const g = new Float32Array(gx * gy);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const sm = (t) => t * t * (3 - 2 * t);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * gy, iy = Math.floor(fy), ty = sm(fy - iy);
    const y0 = (iy % gy) * gx, y1 = ((iy + 1) % gy) * gx;
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * gx, ix = Math.floor(fx), tx = sm(fx - ix);
      const x0 = ix % gx, x1 = (ix + 1) % gx;
      const a = g[y0 + x0] + (g[y0 + x1] - g[y0 + x0]) * tx, b = g[y1 + x0] + (g[y1 + x1] - g[y1 + x0]) * tx;
      out[y * w + x] = a + (b - a) * ty;
    }
  }
  return out;
}
function fbm(rnd, w, h, cells) {
  const out = new Float32Array(w * h);
  let amp = 1, tot = 0;
  for (const c of cells) { const n = tileNoise(rnd, w, h, c); for (let i = 0; i < out.length; i++) out[i] += n[i] * amp; tot += amp; amp *= 0.5; }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
/** per-pixel fill through ImageData: fn(x, y, i) -> [r, g, b] or [r, g, b, a] */
function pixels(g, w, h, fn) {
  const img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, c = fn(x, y, i);
    d[i * 4] = clamp255(c[0]); d[i * 4 + 1] = clamp255(c[1]); d[i * 4 + 2] = clamp255(c[2]); d[i * 4 + 3] = c.length > 3 ? clamp255(c[3]) : 255;
  }
  g.putImageData(img, 0, 0);
}

// ------------------------------------------------------------------------------------------ tileable textures
// Level 0 wallpaper: 256 px = 2 m. Mono-yellow, a thin darker/lighter rule every 25 cm and a column of small
// stacked chevrons in every stripe, paper grain and a faint large-scale tint drift (never pure flat colour).
function drawWall(g, w, h) {
  const r = seededRandom('br:wall');
  const drift = fbm(r, w, h, [128, 64, 32]);
  const grain = fbm(r, w, h, [4, 2]);
  pixels(g, w, h, (x, y, i) => {
    let m = 0.94 + drift[i] * 0.1 + (grain[i] - 0.5) * 0.06;
    const sx = x % 32, yy = y % 16;
    if (sx === 0) m *= 0.8;
    else if (sx === 1) m *= 1.07;
    else if (sx === 31) m *= 0.93;
    const dx = Math.abs(sx - 16);
    if (yy < 7 && (dx === yy || dx === yy + 1) && dx > 0) m *= 0.86;          // chevron arms
    else if (yy < 6 && dx === yy - 1 && dx > 0) m *= 1.05;                     // light edge under each arm
    if (sx === 16 && yy === 11) m *= 0.84;                                     // dot between chevrons
    return [205 * m, 190 * m, 112 * m];
  });
}
// Old moist carpet: mustard/ochre, fibre noise, a faint weave and darker damp blotches.
function drawCarpet(g, w, h) {
  const r = seededRandom('br:carpet');
  const damp = fbm(r, w, h, [128, 64, 32]);
  const mid = fbm(r, w, h, [16, 8]);
  pixels(g, w, h, (x, y, i) => {
    let m = 0.9 + (mid[i] - 0.5) * 0.18 + (r() - 0.5) * 0.16;
    if ((x + y) % 4 === 0) m *= 0.95;
    if ((x - y + 1024) % 4 === 0) m *= 1.03;
    const d = damp[i];
    if (d > 0.62) m *= 1 - Math.min(0.12, (d - 0.62) * 0.8);
    return [152 * m, 128 * m, 60 * m];
  });
}
// Stained drop ceiling: 192 px = 2 m -> 3 x 3 tiles of 64 px (0.67 m), T-bar grid, fissure speckles, a few
// yellowed / ring-stained tiles.
function drawCeiling(g, w, h) {
  const r = seededRandom('br:ceiling');
  const T = 64, n = w / T;
  const tone = [], stain = [];
  for (let k = 0; k < n * n; k++) { tone.push(0.95 + r() * 0.06); stain.push(r() < 0.15 ? { x: 10 + r() * 44, y: 10 + r() * 44, rad: 16 + r() * 16 } : null); }
  const grain = fbm(r, w, h, [8, 4]);
  pixels(g, w, h, (x, y, i) => {
    const tx = Math.floor(x / T), ty = Math.floor(y / T), gx = x % T, gy = y % T, k = ty * n + tx;
    if (gx < 2 || gy < 2) return gx === 1 || gy === 1 ? [196, 190, 166] : [170, 164, 142];
    let m = tone[k] + (grain[i] - 0.5) * 0.07;
    let c = [214, 208, 184];
    if (gx === 2 || gy === 2) m *= 1.04;
    if (gx === T - 1 || gy === T - 1) m *= 0.9;
    if (r() < 0.06) m *= 0.8;                                                   // fissure speckles
    const s = stain[k];
    if (s) {   // faint yellowing only (the brown water rings are decals, so they never repeat on a grid)
      const d = Math.hypot(gx - s.x, gy - s.y);
      if (d < s.rad) { const t = d / s.rad; c = [c[0] * (0.97 + 0.03 * t), c[1] * (0.95 + 0.05 * t), c[2] * (0.88 + 0.12 * t)]; }
    }
    return [c[0] * m, c[1] * m, c[2] * m];
  });
}
// Manila Room: pale manila paper wallpaper with fine vertical pinstripes.
function drawManila(g, w, h) {
  const r = seededRandom('br:manila');
  const drift = fbm(r, w, h, [64, 32]);
  pixels(g, w, h, (x, y, i) => {
    let m = 0.95 + drift[i] * 0.07 + (r() - 0.5) * 0.04;
    if (x % 16 === 0) m *= 0.93;
    if (x % 16 === 8 && y % 4 < 2) m *= 0.97;
    return [228 * m, 208 * m, 162 * m];
  });
}
function drawRedCarpet(g, w, h) {
  const r = seededRandom('br:redcarpet');
  const mid = fbm(r, w, h, [16, 8]);
  pixels(g, w, h, (x, y, i) => {
    let m = 0.88 + (mid[i] - 0.5) * 0.2 + (r() - 0.5) * 0.18;
    const dx = Math.abs((x % 32) - 16), dy = Math.abs((y % 32) - 16);
    if (dx + dy === 12) m *= 1.25;                                              // faint diamond pattern
    return [126 * m, 22 * m, 30 * m];
  });
}

// ------------------------------------------------------------------------------------------ atlas
// 512 x 512, pixel rects [x, y, w, h] (canvas space, y down). atlasUV() converts to texture space.
export const ATLAS = {
  size: 512,
  white: [2, 2, 28, 28],
  lens: [32, 0, 64, 32], deadlens: [96, 0, 64, 32], baseboard: [160, 0, 64, 16], outlet: [224, 0, 16, 24],
  vent: [240, 0, 48, 24], exit: [288, 0, 64, 24], gauge: [352, 0, 24, 24], hazard: [376, 0, 64, 16], bulb: [440, 0, 16, 16],
  streak: [0, 32, 48, 128], blob: [48, 32, 128, 128], smiley: [176, 32, 128, 128], run: [304, 32, 160, 64], arrow: [304, 96, 96, 64],
  confetti: [0, 160, 128, 128], banner: [128, 160, 256, 48], streamer: [384, 160, 32, 128], note: [416, 160, 64, 48],
  stencil: [128, 208, 160, 40], dark: [460, 2, 16, 16], ring: [288, 208, 96, 96],
};
export function atlasUV(name) {
  const [x, y, w, h] = ATLAS[name] || ATLAS.white, S = ATLAS.size;
  return [x / S, 1 - (y + h) / S, (x + w) / S, 1 - y / S];
}
function drawAtlas(g) {
  const r = seededRandom('br:atlas');
  const A = ATLAS;
  g.clearRect(0, 0, A.size, A.size);
  const rect = (k, col) => { const [x, y, w, h] = A[k]; g.fillStyle = col; g.fillRect(x, y, w, h); };
  rect('white', '#ffffff');
  rect('dark', '#101010');
  // troffer lens: cream diffuser with a prismatic grid and a light frame
  {
    const [x, y, w, h] = A.lens;
    g.fillStyle = '#fffbe8'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(210,200,160,0.55)';
    for (let k = 0; k < w; k += 4) g.fillRect(x + k, y, 1, h);
    for (let k = 0; k < h; k += 4) g.fillRect(x, y + k, w, 1);
    g.fillStyle = '#d8d2bc'; g.fillRect(x, y, w, 2); g.fillRect(x, y + h - 2, w, 2); g.fillRect(x, y, 2, h); g.fillRect(x + w - 2, y, 2, h);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(x + 4, y + 13, w - 8, 6);   // the tube glow through the diffuser
  }
  {
    const [x, y, w, h] = A.deadlens;
    g.fillStyle = '#8e8a7a'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(60,56,44,0.45)';
    for (let k = 0; k < w; k += 4) g.fillRect(x + k, y, 1, h);
    for (let k = 0; k < h; k += 4) g.fillRect(x, y + k, w, 1);
    g.fillStyle = '#6a6658'; g.fillRect(x, y, w, 2); g.fillRect(x, y + h - 2, w, 2);
    g.fillStyle = 'rgba(40,34,20,0.5)'; g.fillRect(x + 20, y + 6, 14, 9);        // dead bugs in the diffuser
  }
  {
    const [x, y, w, h] = A.baseboard;
    for (let k = 0; k < h; k++) { const m = k < 2 ? 1.12 : k > h - 3 ? 0.6 : 0.92 - k * 0.012; g.fillStyle = `rgb(${142 * m | 0},${120 * m | 0},${66 * m | 0})`; g.fillRect(x, y + k, w, 1); }
    g.fillStyle = 'rgba(40,30,10,0.25)';
    for (let k = 0; k < 14; k++) g.fillRect(x + (r() * w) | 0, y + 3 + ((r() * (h - 5)) | 0), 2 + ((r() * 5) | 0), 1);
  }
  {
    const [x, y, w, h] = A.outlet;
    g.fillStyle = '#e8e2cc'; g.fillRect(x, y, w, h);
    g.fillStyle = '#b8b09a'; g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1); g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h);
    g.fillStyle = '#2a2620';
    for (const oy of [5, 14]) { g.fillRect(x + 5, y + oy, 1, 3); g.fillRect(x + 10, y + oy, 1, 3); g.fillRect(x + 7, y + oy + 4, 2, 1); }
  }
  {
    const [x, y, w, h] = A.vent;
    g.fillStyle = '#cfc8b0'; g.fillRect(x, y, w, h);
    g.fillStyle = '#3a352a';
    for (let k = 4; k < h - 3; k += 3) g.fillRect(x + 3, y + k, w - 6, 2);
    g.fillStyle = '#9c9480'; g.fillRect(x, y, w, 2); g.fillRect(x, y + h - 2, w, 2);
  }
  {
    const [x, y, w, h] = A.exit;
    g.fillStyle = '#3a0806'; g.fillRect(x, y, w, h);
    g.fillStyle = '#ff3a26'; g.font = 'bold 17px monospace'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText('EXIT', x + w / 2, y + h / 2 + 1);
    g.fillStyle = '#ffb0a0'; g.fillRect(x + 2, y + 2, w - 4, 1);
  }
  {
    const [x, y, w, h] = A.gauge;
    g.fillStyle = '#20201c'; g.fillRect(x, y, w, h);
    g.fillStyle = '#e8e4d8'; g.beginPath(); g.arc(x + w / 2, y + h / 2, w / 2 - 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#c02010'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + w / 2, y + h / 2); g.lineTo(x + w - 5, y + 6); g.stroke();
  }
  {
    const [x, y, w, h] = A.hazard;
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = '#f2c618'; g.fillRect(x, y, w, h);
    g.fillStyle = '#1a1814';
    for (let k = -h; k < w; k += 12) { g.beginPath(); g.moveTo(x + k, y + h); g.lineTo(x + k + 6, y + h); g.lineTo(x + k + 6 + h, y); g.lineTo(x + k + h, y); g.closePath(); g.fill(); }
    g.restore();
  }
  {
    const [x, y, w, h] = A.bulb;
    const grd = g.createRadialGradient(x + w / 2, y + h / 2, 1, x + w / 2, y + h / 2, w / 2);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.5, '#ffe2a0'); grd.addColorStop(1, '#a86020');
    g.fillStyle = grd; g.fillRect(x, y, w, h);
  }
  // water streak running down a wall from the ceiling (alpha, dithered edge)
  {
    const [x, y, w, h] = A.streak;
    const img = g.createImageData(w, h), d = img.data;
    const n = tileNoise(r, w, h, 8);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const i = yy * w + xx;
      const cx = w / 2 + Math.sin(yy * 0.09) * 4 + (n[i] - 0.5) * 6;
      const width = (w * 0.42) * (1 - yy / h * 0.75) * (0.8 + n[i] * 0.4);
      const dd = Math.abs(xx - cx) / width;
      const a = (1 - dd) * (1 - Math.pow(yy / h, 2.2));
      const dith = ((xx & 1) ^ (yy & 1)) * 0.18;
      const on = a + dith > 0.55;
      const rim = on && a + dith < 0.68;
      d[i * 4] = rim ? 150 : 176; d[i * 4 + 1] = rim ? 124 : 152; d[i * 4 + 2] = rim ? 58 : 84; d[i * 4 + 3] = on ? 255 : 0;
    }
    g.putImageData(img, x, y);
  }
  // damp carpet blob (alpha): a soft irregular patch, darker rim (dried tide line)
  {
    const [x, y, w, h] = A.blob;
    const img = g.createImageData(w, h), d = img.data;
    const n = tileNoise(r, w, h, 24), n2 = tileNoise(r, w, h, 8);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const i = yy * w + xx;
      const dx = (xx - w / 2) / (w / 2), dy = (yy - h / 2) / (h / 2);
      const rr = Math.hypot(dx, dy) + (n[i] - 0.5) * 0.55 + (n2[i] - 0.5) * 0.15;
      const dith = ((xx & 1) ^ (yy & 1)) * 0.04;
      const on = rr + dith < 0.78;
      const rim = on && rr + dith > 0.7;
      const v = rim ? 58 : 84;
      d[i * 4] = v; d[i * 4 + 1] = v * 0.82; d[i * 4 + 2] = v * 0.4; d[i * 4 + 3] = on ? 255 : 0;
    }
    g.putImageData(img, x, y);
  }
  // ceiling water ring: irregular tide line with a yellowed inside (alpha outside)
  {
    const [x, y, w, h] = A.ring;
    const img = g.createImageData(w, h), d = img.data;
    const n = tileNoise(r, w, h, 16), n2 = tileNoise(r, w, h, 6);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const i = yy * w + xx;
      const dx = (xx - w / 2) / (w / 2), dy = (yy - h / 2) / (h / 2);
      const rr = Math.hypot(dx, dy) + (n[i] - 0.5) * 0.35 + (n2[i] - 0.5) * 0.08;
      const inside = rr < 0.8, rim = rr > 0.72 && rr < 0.82, rim2 = rr > 0.5 && rr < 0.55;
      const c = rim ? [150, 112, 50] : rim2 ? [196, 170, 110] : [214, 196, 146];
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = inside || rim ? 255 : 0;
    }
    g.putImageData(img, x, y);
  }
  // "=)" spray graffiti
  {
    const [x, y, w, h] = A.smiley;
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.translate(x + w / 2, y + h / 2); g.rotate(-0.08);
    g.strokeStyle = '#b01018'; g.lineCap = 'round'; g.lineWidth = 11;
    g.beginPath(); g.moveTo(-40, -18); g.lineTo(-6, -18); g.moveTo(-40, 10); g.lineTo(-6, 10); g.stroke();
    g.beginPath(); g.arc(-4, -4, 46, -0.95, 0.95); g.stroke();
    g.fillStyle = '#b01018';
    for (let k = 0; k < 40; k++) { const a = r() * Math.PI * 2, rr = 50 + r() * 16; g.fillRect(Math.cos(a) * rr * 0.9, Math.sin(a) * rr * 0.7, 2, 2); }
    for (let k = 0; k < 4; k++) g.fillRect(-36 + k * 22 + r() * 6, 14, 3, 14 + r() * 30);   // drips
    g.restore();
  }
  // "RUN" spray + arrow (Level !)
  {
    const [x, y, w, h] = A.run;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x + w / 2, y + h / 2); g.rotate(0.05);
    g.fillStyle = '#d01008'; g.font = 'bold 54px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('RUN', 0, 2);
    for (let k = 0; k < 5; k++) g.fillRect(-50 + k * 24 + r() * 6, 18, 3, 8 + r() * 12);
    g.restore();
  }
  {
    const [x, y, w, h] = A.arrow;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x + w / 2, y + h / 2);
    g.strokeStyle = '#d01008'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-36, 4); g.lineTo(28, -2); g.moveTo(10, -20); g.lineTo(30, -2); g.lineTo(12, 18); g.stroke();
    g.restore();
  }
  // confetti (Level Fun): scattered little squares, white so vertex colour can vary it... drawn multicolour here
  {
    const [x, y, w, h] = A.confetti;
    const cols = ['#ff3a5a', '#ffd23a', '#3ad0ff', '#7aff5a', '#ff7af0', '#ffffff', '#ff8a2a'];
    for (let k = 0; k < 230; k++) {
      const px = x + 2 + r() * (w - 6), py = y + 2 + r() * (h - 6), s = 2 + ((r() * 3) | 0);
      g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(px | 0, py | 0, s, r() < 0.5 ? s : s * 2);
    }
  }
  // HAPPY BIRTHDAY pennant banner (alpha between pennants)
  {
    const [x, y, w, h] = A.banner;
    const txt = 'HAPPY BIRTHDAY';
    const cols = ['#ff4a6a', '#ffd23a', '#3ab8ff', '#8aff5a', '#ff8af0'];
    g.strokeStyle = '#f0f0e0'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y + 4); g.quadraticCurveTo(x + w / 2, y + 12, x + w, y + 4); g.stroke();
    const pw = w / txt.length;
    for (let k = 0; k < txt.length; k++) {
      if (txt[k] === ' ') continue;
      const px = x + k * pw, sag = Math.sin((k + 0.5) / txt.length * Math.PI) * 7;
      g.fillStyle = cols[k % cols.length];
      g.beginPath(); g.moveTo(px + 1, y + 4 + sag); g.lineTo(px + pw - 1, y + 4 + sag); g.lineTo(px + pw / 2, y + h - 2); g.closePath(); g.fill();
      g.fillStyle = '#20180c'; g.font = 'bold 12px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt[k], px + pw / 2, y + 16 + sag);
    }
  }
  // streamer: a white twisted ribbon (vertex colour tints it)
  {
    const [x, y, w, h] = A.streamer;
    for (let k = 0; k < h; k++) {
      const t = k / 9, sw = w * 0.55 + Math.abs(Math.sin(t)) * w * 0.35, cx = x + w / 2 + Math.sin(t * 0.7) * 2;
      const m = 0.86 + 0.14 * Math.cos(t * 2);
      g.fillStyle = `rgb(${255 * m | 0},${255 * m | 0},${255 * m | 0})`; g.fillRect((cx - sw / 2) | 0, y + k, Math.max(2, sw | 0), 1);
    }
  }
  // the note pinned in the Manila Room
  {
    const [x, y, w, h] = A.note;
    g.fillStyle = '#f4efe0'; g.fillRect(x + 2, y + 2, w - 4, h - 4);
    g.fillStyle = '#a02018'; g.fillRect(x + w / 2 - 2, y + 3, 4, 4);
    g.fillStyle = '#2a2a3a'; g.font = '7px monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
    ['DO NOT', 'TELL THE', 'ALGORITHM', 'ABOUT', 'THIS ROOM'].forEach((l, k) => g.fillText(l, x + 5, y + 9 + k * 7));
  }
  // stencil "SECTOR 1" (Level 1 walls)
  {
    const [x, y, w, h] = A.stencil;
    g.fillStyle = 'rgba(30,30,30,0.9)'; g.font = 'bold 26px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('SECTOR 1', x + w / 2, y + h / 2 + 1);
    g.clearRect(x + 34, y, 2, h); g.clearRect(x + 88, y, 2, h);                 // stencil bridges
  }
}

// ------------------------------------------------------------------------------------------ public API
const _tex = new Map();
const DRAW = {
  wall: [256, 256, drawWall], carpet: [256, 256, drawCarpet], ceiling: [192, 192, drawCeiling],
  manila: [128, 128, drawManila], redcarpet: [128, 128, drawRedCarpet],
};
export function brTexture(name) {
  if (_tex.has(name)) return _tex.get(name);
  let t = null;
  try {
    if (name === 'atlas') t = makeTex(ATLAS.size, ATLAS.size, drawAtlas, { repeat: false, mips: false });
    else if (DRAW[name]) { const [w, h, fn] = DRAW[name]; t = makeTex(w, h, fn); }
  } catch (e) { console.warn('backrooms texture', name, e); t = null; }
  if (t) t.name = 'br_' + name;
  _tex.set(name, t);
  return t;
}

const _bake = new Map();
/** Lit material clone with the per-vertex baked light term (see header). Cached per source material. */
export function bakeMaterial(mat) {
  if (!mat || mat.userData?.brBake) return mat;
  let c = _bake.get(mat.uuid);
  if (c) return c;
  c = mat.clone();
  c.userData = { ...(mat.userData || {}), brBake: true, noConsolidate: true };
  injectBake(c);
  _bake.set(mat.uuid, c);
  return c;
}
function injectBake(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBake = BAKE;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 bake;\nvarying vec3 vBake;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBake = bake;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uBake;\nvarying vec3 vBake;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vBake * uBake;');
  };
  m.customProgramCacheKey = () => 'brbake1';
  m.needsUpdate = true;
}

let _mats = null;
/** Shared materials (created once, reused by every Backrooms facility). */
export function brMaterials() {
  if (_mats) return _mats;
  const lam = (tex, o = {}) => injectAnd(new THREE.MeshLambertMaterial({ map: brTexture(tex), vertexColors: !!o.vc, ...(o.extra || {}) }));
  const injectAnd = (m) => { m.userData.brBake = true; m.userData.noConsolidate = true; injectBake(m); return m; };
  const atlas = brTexture('atlas');
  _mats = {
    wall: lam('wall'), carpet: lam('carpet', { vc: true }), ceiling: lam('ceiling'),
    manila: lam('manila'), redcarpet: lam('redcarpet', { vc: true }),
    // opaque + cutout decals and details, tinted per vertex (balloons, pipes, frames, stains, graffiti)
    atlas: injectAnd(new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide })),
    // unlit emissive bits: troffer lenses, EXIT signs, bulbs (colour > 1 feeds the post bloom)
    lit: new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, color: new THREE.Color(1.45, 1.4, 1.25) }),
    flicker: new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, color: new THREE.Color(1.45, 1.4, 1.25) }),
    beacon: new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, color: new THREE.Color(1.6, 0.18, 0.1) }),
    water: new THREE.MeshLambertMaterial({ color: 0x9ae8f4, emissive: 0x1a3a44, transparent: true, opacity: 0.55, depthWrite: false }),
    puddle: new THREE.MeshLambertMaterial({ color: 0x3a4650, emissive: 0x0c1016, transparent: true, opacity: 0.55, depthWrite: false }),
  };
  for (const k of ['lit', 'flicker', 'beacon', 'water', 'puddle']) { _mats[k].userData.noConsolidate = true; _mats[k].userData.brShared = true; }
  for (const k of ['wall', 'carpet', 'ceiling', 'manila', 'redcarpet', 'atlas']) _mats[k].userData.brShared = true;
  // animated water: its own copy of the procedural water texture (the shared one is also used by the sewer)
  try {
    const wt = brWaterTexture();
    if (wt) { _mats.water.map = wt; _mats.water.needsUpdate = true; }
  } catch { /* no DOM */ }
  return _mats;
}
let _waterTex = null;
function brWaterTexture() {
  if (_waterTex || !HAS_DOM) return _waterTex;
  _waterTex = makeTex(64, 64, (g, w, h) => {
    const r = seededRandom('br:water');
    const n = fbm(r, w, h, [16, 8, 4]);
    pixels(g, w, h, (x, y, i) => { const v = n[i]; const c = v > 0.62 ? 1.12 : v < 0.35 ? 0.9 : 1; return [210 * c, 240 * c, 246 * c]; });
  });
  return _waterTex;
}
