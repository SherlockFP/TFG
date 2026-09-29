// WORLDS3 canvas textures (wave 8): wall / floor / ceiling skins for the themed pockets + the hotel door-number atlas.
// 128 px tiling canvases, generated once per theme and cached. No files, no network.
import * as THREE from 'three';

const cache = new Map();
function canvas(n = 128) { const c = document.createElement('canvas'); c.width = c.height = n; return [c, c.getContext('2d')]; }
function wrap(c, aniso = 4) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  return t;
}
function speckle(g, n, w, cols, alpha = 0.12, seed = 1) {
  let k = seed * 9973;
  const r = () => { k = (Math.imul(k, 1664525) + 1013904223) | 0; return ((k >>> 8) & 0xffff) / 65536; };
  for (let i = 0; i < n; i++) { g.globalAlpha = alpha * (0.4 + r()); g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(r() * w, r() * w, 1 + r() * 2, 1 + r() * 2); }
  g.globalAlpha = 1;
}
const tiles = (g, w, n, base, grout, gw = 2) => {
  g.fillStyle = grout; g.fillRect(0, 0, w, w);
  const s = w / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = base; g.fillRect(x * s + gw / 2, y * s + gw / 2, s - gw, s - gw); }
};

const MAKERS = {
  pool: {
    wall() { const [c, g] = canvas(); tiles(g, 128, 4, '#e6f2f0', '#8fc2c8'); speckle(g, 120, 128, ['#b8d8d8', '#ffffff'], 0.25, 3); g.fillStyle = 'rgba(70,160,180,0.35)'; g.fillRect(0, 0, 128, 16); return wrap(c); },
    floor() { const [c, g] = canvas(); tiles(g, 128, 4, '#cfe8ee', '#6fa8b4'); speckle(g, 160, 128, ['#9ac8d2', '#ffffff'], 0.25, 4); return wrap(c); },
    ceil() { const [c, g] = canvas(); tiles(g, 128, 2, '#f0f6f6', '#c4d4d6', 1); return wrap(c); },
  },
  data: {
    wall() {
      const [c, g] = canvas(); g.fillStyle = '#131b27'; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#1c2636'; for (let y = 0; y < 4; y++) g.fillRect(3, y * 32 + 3, 122, 26);
      let k = 7; const r = () => { k = (Math.imul(k, 1664525) + 1013904223) | 0; return ((k >>> 8) & 0xffff) / 65536; };
      for (let y = 0; y < 4; y++) for (let x = 0; x < 10; x++) { const q = r(); g.fillStyle = q < 0.12 ? '#ff5a4a' : q < 0.5 ? '#38e88a' : q < 0.8 ? '#4ab0ff' : '#0d131c'; g.fillRect(8 + x * 12, y * 32 + 12, 4, 4); }
      return wrap(c);
    },
    floor() { const [c, g] = canvas(); g.fillStyle = '#1b2431'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#0c1118'; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.beginPath(); g.arc(8 + x * 16, 8 + y * 16, 3, 0, 6.3); g.fill(); } g.strokeStyle = '#2f3e52'; g.lineWidth = 2; g.strokeRect(1, 1, 126, 126); return wrap(c); },
    ceil() { const [c, g] = canvas(); g.fillStyle = '#0d141d'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#18222f'; for (let i = 0; i < 4; i++) g.fillRect(0, i * 32 + 14, 128, 4); return wrap(c); },
  },
  hotel: {
    wall() {
      const [c, g] = canvas(); g.fillStyle = '#5a1e22'; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#7a2a2c'; for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 16, 128);
      g.fillStyle = '#c8a24a'; for (let x = 15; x < 128; x += 32) g.fillRect(x, 0, 2, 128);
      g.fillStyle = 'rgba(200,162,74,0.55)'; for (let y = 8; y < 128; y += 32) for (let x = 0; x < 128; x += 32) { g.beginPath(); g.moveTo(x + 8, y); g.lineTo(x + 12, y + 5); g.lineTo(x + 8, y + 10); g.lineTo(x + 4, y + 5); g.fill(); }
      speckle(g, 100, 128, ['#2a0a0c'], 0.25, 5); return wrap(c);
    },
    floor() {
      const [c, g] = canvas(); g.fillStyle = '#1f3b2c'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#c8a24a'; g.lineWidth = 2; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const x = i * 64 + 32, y = j * 64 + 32; g.beginPath(); g.moveTo(x, y - 24); g.lineTo(x + 24, y); g.lineTo(x, y + 24); g.lineTo(x - 24, y); g.closePath(); g.stroke(); }
      speckle(g, 260, 128, ['#142a1e', '#2c5a40'], 0.3, 6); return wrap(c);
    },
    ceil() { const [c, g] = canvas(); g.fillStyle = '#2a1710'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#3a2216'; for (let i = 0; i < 4; i++) g.fillRect(0, i * 32, 128, 3); return wrap(c); },
  },
  fun: {
    wall() {
      const [c, g] = canvas(); g.fillStyle = '#c4283c'; g.fillRect(0, 0, 128, 128);
      let k = 11; const r = () => { k = (Math.imul(k, 1664525) + 1013904223) | 0; return ((k >>> 8) & 0xffff) / 65536; };
      const cols = ['#ffe27a', '#ffffff', '#3ac8d8', '#ff9ab0', '#7ad84a'];
      for (let i = 0; i < 46; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(r() * 124, r() * 124, 4 + r() * 4, 3 + r() * 3); }
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(0, 100, 128, 6); return wrap(c);
    },
    floor() { const [c, g] = canvas(); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) & 1 ? '#f2e6d0' : '#c4283c'; g.fillRect(x * 32, y * 32, 32, 32); } speckle(g, 200, 128, ['#7a1a26', '#ffffff'], 0.2, 8); return wrap(c); },
    ceil() { const [c, g] = canvas(); g.fillStyle = '#1a1018'; g.fillRect(0, 0, 128, 128); speckle(g, 60, 128, ['#ffe27a', '#ff9ab0', '#3ac8d8'], 0.7, 9); return wrap(c); },
  },
  asylum: {
    wall() {
      const [c, g] = canvas(); g.fillStyle = '#a9b8a6'; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#7f9284'; g.fillRect(0, 84, 128, 44);   // dado paint
      g.fillStyle = 'rgba(40,50,40,0.5)'; g.fillRect(0, 82, 128, 3);
      speckle(g, 240, 128, ['#6a7a68', '#c8d4c4', '#4a5a4a'], 0.3, 10);
      g.fillStyle = 'rgba(70,60,40,0.22)'; for (let i = 0; i < 4; i++) g.fillRect(10 + i * 32, 0, 2 + (i % 2), 30 + i * 12);   // water runs
      return wrap(c);
    },
    floor() { const [c, g] = canvas(); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) & 1 ? '#c8c6b4' : '#7a8074'; g.fillRect(x * 32, y * 32, 32, 32); } speckle(g, 260, 128, ['#4a4a3a', '#e8e4d0'], 0.3, 12); return wrap(c); },
    ceil() { const [c, g] = canvas(); g.fillStyle = '#8a9088'; g.fillRect(0, 0, 128, 128); speckle(g, 120, 128, ['#5a6058', '#4a3a2a'], 0.35, 13); return wrap(c); },
  },
};

/** { wall, floor, ceil } CanvasTextures for a theme, or null (Level 0 keeps its own textures) */
export function themeTextures(id) {
  const m = MAKERS[id];
  if (!m) return null;
  if (!cache.has(id)) cache.set(id, { wall: m.wall(), floor: m.floor(), ceil: m.ceil() });
  return cache.get(id);
}
export function disposeThemeTextures() { for (const v of cache.values()) for (const t of Object.values(v)) t.dispose(); cache.clear(); }

export const HOTEL_NUMBERS = ['404', '217', '13', '666', '108', '0', '311', '999', '7', '512', '44', '1408', '23', '88', '303', '???'];
let atlas = null;
/** 4x4 door-number atlas (brass plate, black digits). */
export function numberAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  HOTEL_NUMBERS.forEach((n, i) => {
    const x = (i % 4) * 64, y = Math.floor(i / 4) * 40;
    g.fillStyle = '#c8a24a'; g.fillRect(x, y, 64, 40); g.strokeStyle = '#6a4c14'; g.lineWidth = 2; g.strokeRect(x + 2, y + 2, 60, 36);
    g.fillStyle = '#1a1208'; g.font = 'bold 24px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, x + 32, y + 21);
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
  atlas = { tex, cols: 4, rows: 4, cells: 16, salt: 0, pick(i) { return (i * 5 + 3 + this.salt * (1 + (i % 3))) % 16; } };
  return atlas;
}
