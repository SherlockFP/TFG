// LIMINAL PHOTO PAINTER (pure canvas 2D, deterministic per seed, no assets).
// paintLiminalPhoto(canvas, seed) draws one "found photo" of a place that should not exist: an empty room in one-point
// perspective, shot with a cheap flash, with grain, a colour cast, a vignette and a date stamp.
// Scenes: lobby (yellow office, troffers), pool (white tiles, still water), garage (concrete, parking lines, pillars),
// school (lockers, green floor), party (balloons, banner, a cake and a smile). sceneOf(seed) picks the scene.
export const SCENES = ['lobby', 'pool', 'garage', 'school', 'party'];
export const sceneOf = (seed) => SCENES[((seed >>> 0) >>> 5) % SCENES.length];

function makeRng(seed) {
  let s = (seed >>> 0) || 7;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  r.range = (a, b) => a + r() * (b - a);
  return r;
}

/** one-point perspective room: returns a projector P(u, v, d) (u 0..1 left-right, v 0..1 top-bottom, d 0 near .. 1 far) */
function room(g, W, H, vx, vy, k, cols) {
  const bw = W * k, bh = H * k;
  const x0 = vx - bw / 2, x1 = vx + bw / 2, y0 = vy - bh / 2, y1 = vy + bh / 2;
  const P = (u, v, d) => [(u * W) * (1 - d) + (x0 + u * bw) * d, (v * H) * (1 - d) + (y0 + v * bh) * d];
  const poly = (pts, fill) => { g.fillStyle = fill; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill(); };
  const grad = (ya, yb, c0, c1) => { const gr = g.createLinearGradient(0, ya, 0, yb); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; };
  poly([[0, 0], [W, 0], [x1, y0], [x0, y0]], grad(0, y0, cols.ceil[0], cols.ceil[1]));
  poly([[0, H], [W, H], [x1, y1], [x0, y1]], grad(H, y1, cols.floor[0], cols.floor[1]));
  poly([[0, 0], [x0, y0], [x0, y1], [0, H]], cols.left);
  poly([[W, 0], [x1, y0], [x1, y1], [W, H]], cols.right);
  poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], cols.back);
  return { P, x0, x1, y0, y1, bw, bh, poly };
}
const quad = (g, a, b, c, d, fill, stroke) => {
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
};
/** a flat rectangle lying in the plane at depth d, between u0..u1 and v0..v1 */
const face = (g, R, u0, u1, v0, v1, d, fill, stroke) => quad(g, R.P(u0, v0, d), R.P(u1, v0, d), R.P(u1, v1, d), R.P(u0, v1, d), fill, stroke);
/** a rectangle on the left (side 0) or right (side 1) wall between depths d0..d1 and heights v0..v1 */
const wallRect = (g, R, side, d0, d1, v0, v1, fill, stroke) => quad(g, R.P(side, v0, d0), R.P(side, v0, d1), R.P(side, v1, d1), R.P(side, v1, d0), fill, stroke);
/** a rectangle on the ceiling (v = 0) between u0..u1 and depths d0..d1 */
const ceilRect = (g, R, u0, u1, d0, d1, fill) => quad(g, R.P(u0, 0, d0), R.P(u1, 0, d0), R.P(u1, 0, d1), R.P(u0, 0, d1), fill);
const floorRect = (g, R, u0, u1, d0, d1, fill, stroke) => quad(g, R.P(u0, 1, d0), R.P(u1, 1, d0), R.P(u1, 1, d1), R.P(u0, 1, d1), fill, stroke);
const depthStep = (i, n) => 1 - Math.pow(1 - i / n, 1.7);      // more steps near the far end of a corridor

// ---------------------------------------------------------------------------------------------------- scenes
const SCENE_FN = {
  lobby(g, W, H, r, vx, vy) {
    const R = room(g, W, H, vx, vy, 0.2, {
      ceil: ['#e9e2bf', '#c3b676'], floor: ['#9a8340', '#6b5724'], left: '#cdb455', right: '#c2a94c', back: '#d6bf62',
    });
    for (let i = 1; i < 16; i++) { const d = depthStep(i, 16); wallRect(g, R, 0, d, Math.min(1, d + 0.004), 0, 1, 'rgba(120,100,30,0.28)'); wallRect(g, R, 1, d, Math.min(1, d + 0.004), 0, 1, 'rgba(120,100,30,0.28)'); }
    for (let i = 0; i < 9; i++) { const d0 = depthStep(i, 9.5), d1 = depthStep(i + 0.55, 9.5); for (const u of [0.28, 0.72]) if (r() > 0.1) ceilRect(g, R, u - 0.09, u + 0.09, d0, d1, `rgba(255,252,232,${0.95 - i * 0.05})`); }
    // a doorway / side opening, dark
    const dx = r.range(0.35, 0.6);
    face(g, R, dx, dx + 0.14, 0.32, 1, 1, '#4c3d14');
    const pick = r();
    if (pick < 0.32) {           // a tall figure far away
      const [fx, fy] = R.P(dx + 0.07, 0.95, 1);
      g.fillStyle = 'rgba(14,10,4,0.9)'; g.fillRect(fx - 3, fy - R.bh * 0.5, 6, R.bh * 0.5); g.beginPath(); g.arc(fx, fy - R.bh * 0.54, 3.5, 0, 6.3); g.fill();
    } else if (pick < 0.5) {     // a grin in the doorway
      const [sx, sy] = R.P(dx + 0.07, 0.6, 1);
      g.fillStyle = '#fffbe0'; g.fillRect(sx - 6, sy - 6, 3, 2); g.fillRect(sx + 3, sy - 6, 3, 2);
      g.strokeStyle = '#fffbe0'; g.lineWidth = 1.6; g.beginPath(); g.arc(sx, sy - 1, 6, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
    }
    return { tint: [255, 236, 150], name: 'lobby' };
  },
  pool(g, W, H, r, vx, vy) {
    const R = room(g, W, H, vx, vy, 0.28, {
      ceil: ['#e6f2f4', '#b6d2d8'], floor: ['#78c6d0', '#3d8a98'], left: '#d9ecee', right: '#cfe6ea', back: '#e4f4f6',
    });
    g.strokeStyle = 'rgba(80,130,140,0.35)';
    for (let i = 1; i < 14; i++) { const d = depthStep(i, 14); wallRect(g, R, 0, d, Math.min(1, d + 0.003), 0, 1, 'rgba(80,130,140,0.3)'); wallRect(g, R, 1, d, Math.min(1, d + 0.003), 0, 1, 'rgba(80,130,140,0.3)'); }
    for (let j = 1; j < 8; j++) wallRect(g, R, 0, 0, 1, j / 8, j / 8 + 0.004, 'rgba(80,130,140,0.25)');
    for (let i = 0; i < 6; i++) { const d0 = depthStep(i, 6.5), d1 = depthStep(i + 0.5, 6.5); ceilRect(g, R, 0.4, 0.6, d0, d1, `rgba(255,255,255,${0.95 - i * 0.08})`); }
    // water ripples on the floor
    for (let i = 0; i < 9; i++) { const d = r.range(0.05, 0.9), u = r.range(0.15, 0.85); floorRect(g, R, u - 0.12, u + 0.12, d, d + 0.01, 'rgba(255,255,255,0.28)'); }
    // a lone ladder rail
    const lu = r.range(0.2, 0.75);
    g.strokeStyle = 'rgba(210,214,220,0.9)'; g.lineWidth = 2; g.beginPath();
    const a = R.P(lu, 1, 0.55), b = R.P(lu, 0.55, 0.55), c = R.P(lu + 0.06, 0.55, 0.55), d2 = R.P(lu + 0.06, 1, 0.55);
    g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d2[0], d2[1]); g.stroke();
    return { tint: [200, 240, 245], name: 'pool' };
  },
  garage(g, W, H, r, vx, vy) {
    const R = room(g, W, H, vx, vy, 0.16, {
      ceil: ['#8b8d8c', '#5c5e5d'], floor: ['#6a6c6b', '#3c3e3e'], left: '#77797a', right: '#727475', back: '#1c1d1d',
    });
    for (let i = 0; i < 6; i++) { const d0 = depthStep(i, 6.4), d1 = depthStep(i + 0.4, 6.4); for (const u of [0.3, 0.7]) ceilRect(g, R, u - 0.16, u + 0.16, d0, d1, i === 3 && r() < 0.6 ? 'rgba(40,40,40,0.5)' : 'rgba(235,240,220,0.9)'); }
    for (let i = 0; i < 8; i++) { const d0 = depthStep(i, 8.5), d1 = depthStep(i + 0.4, 8.5); floorRect(g, R, 0.24, 0.255, d0, d1, 'rgba(230,200,60,0.8)'); floorRect(g, R, 0.745, 0.76, d0, d1, 'rgba(230,200,60,0.8)'); }
    for (let i = 1; i < 5; i++) { const d = depthStep(i * 1.4, 7); const [px0] = R.P(0.14, 0.5, d), [px1] = R.P(0.2, 0.5, d), [, py0] = R.P(0.14, 0, d), [, py1] = R.P(0.14, 1, d); g.fillStyle = `rgba(105,107,107,${0.95})`; g.fillRect(px0, py0, px1 - px0, py1 - py0); g.strokeStyle = 'rgba(30,30,30,0.5)'; g.strokeRect(px0, py0, px1 - px0, py1 - py0); }
    if (r() < 0.4) { const [cx, cy] = R.P(0.6, 1, 0.55); g.fillStyle = 'rgba(20,24,30,0.9)'; g.fillRect(cx - 14, cy - 12, 28, 10); g.fillRect(cx - 8, cy - 18, 16, 7); }
    return { tint: [220, 230, 225], name: 'garage' };
  },
  school(g, W, H, r, vx, vy) {
    const R = room(g, W, H, vx, vy, 0.18, {
      ceil: ['#dcd6c4', '#b3ad98'], floor: ['#8fa686', '#5c7357'], left: '#c7c2a8', right: '#bdb89f', back: '#a7ab97',
    });
    for (let i = 0; i < 12; i++) {
      const d0 = depthStep(i, 12.5), d1 = depthStep(i + 0.8, 12.5);
      wallRect(g, R, 0, d0, d1, 0.22, 0.78, i % 2 ? '#4f6f8c' : '#456684', 'rgba(20,30,40,0.6)');
      wallRect(g, R, 0, d0, d1, 0.3, 0.34, 'rgba(20,30,40,0.5)');
      if (r() < 0.25) wallRect(g, R, 0, d0, d1, 0.22, 0.78, 'rgba(0,0,0,0.5)');
    }
    for (let i = 0; i < 7; i++) { const d0 = depthStep(i, 7.5), d1 = depthStep(i + 0.5, 7.5); ceilRect(g, R, 0.4, 0.6, d0, d1, i === 4 ? 'rgba(50,50,45,0.4)' : 'rgba(250,250,235,0.9)'); }
    floorRect(g, R, 0.44, 0.56, 0, 1, 'rgba(210,205,170,0.18)');
    const [dx, dy] = R.P(0.5, 0.7, 1);
    g.fillStyle = 'rgba(15,15,12,0.85)'; g.fillRect(dx - 10, dy - R.bh * 0.35, 20, R.bh * 0.6);
    return { tint: [225, 240, 205], name: 'school' };
  },
  party(g, W, H, r, vx, vy) {
    const R = room(g, W, H, vx, vy, 0.3, {
      ceil: ['#f1d9dc', '#cfa7ad'], floor: ['#a9789a', '#6f4a68'], left: '#e8b8c6', right: '#e3b1c0', back: '#f2d3a6',
    });
    // banner across the back wall
    const cols = ['#ff5a5a', '#ffd23f', '#5ac8fa', '#7bd88f'];
    for (let i = 0; i < 9; i++) { const [ax, ay] = R.P(i / 8, 0.08 + Math.sin((i / 8) * 3.14) * 0.06, 1); g.fillStyle = cols[i % 4]; g.beginPath(); g.moveTo(ax - 5, ay); g.lineTo(ax + 5, ay); g.lineTo(ax, ay + 10); g.fill(); }
    // the smile
    const [sx, sy] = R.P(0.5, 0.42, 1), rr = R.bh * 0.18;
    g.fillStyle = '#f7e14a'; g.beginPath(); g.arc(sx, sy, rr, 0, 6.3); g.fill();
    g.fillStyle = '#1a1200'; g.fillRect(sx - rr * 0.42, sy - rr * 0.35, rr * 0.16, rr * 0.34); g.fillRect(sx + rr * 0.26, sy - rr * 0.35, rr * 0.16, rr * 0.34);
    g.strokeStyle = '#1a1200'; g.lineWidth = 2; g.beginPath(); g.arc(sx, sy, rr * 0.62, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    // a table with a cake, balloons
    const [tx, ty] = R.P(0.5, 0.95, 0.7);
    g.fillStyle = '#e8e2d0'; g.fillRect(tx - 34, ty - 6, 68, 5); g.fillStyle = '#f0a7c0'; g.fillRect(tx - 12, ty - 16, 24, 10); g.fillStyle = '#ffdc5a'; g.fillRect(tx - 1, ty - 22, 2, 6);
    for (let i = 0; i < 7; i++) { const [bx, by] = R.P(r.range(0.06, 0.94), r.range(0.05, 0.4), r.range(0, 0.75)); g.fillStyle = cols[i % 4]; g.beginPath(); g.ellipse(bx, by, 9, 11, 0, 0, 6.3); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.moveTo(bx, by + 11); g.lineTo(bx + r.range(-3, 3), by + 30); g.stroke(); }
    for (let i = 0; i < 4; i++) ceilRect(g, R, 0.4, 0.6, depthStep(i, 4.5), depthStep(i + 0.5, 4.5), 'rgba(255,250,235,0.9)');
    return { tint: [255, 220, 225], name: 'party' };
  },
};

const pad2 = (n) => String(n).padStart(2, '0');
/** VHS-style date stamp derived from a seed: "OCT 04 1997  03:12 AM" */
export function photoStamp(seed) {
  const r = makeRng(seed ^ 0x51ed270b);
  const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const h = 1 + Math.floor(r() * 12);
  return `${M[Math.floor(r() * 12)]} ${pad2(1 + Math.floor(r() * 28))} ${1988 + Math.floor(r() * 12)}  ${pad2(h)}:${pad2(Math.floor(r() * 60))} ${r() < 0.5 ? 'AM' : 'PM'}`;
}

/**
 * Paint the photo onto `canvas` (any size; designed for ~280x220). Returns { scene, stamp }.
 * opts.scene forces a scene; opts.stamp === false leaves the date stamp off; opts.develop (0..1) fades the picture in
 * from a dark blue-grey wash (for the polaroid "developing" animation).
 */
export function paintLiminalPhoto(canvas, seed, opts = {}) {
  const g = canvas.getContext('2d');
  if (!g) return { scene: null, stamp: '' };
  const W = canvas.width, H = canvas.height;
  const r = makeRng(seed);
  const scene = opts.scene && SCENE_FN[opts.scene] ? opts.scene : sceneOf(seed);
  g.save();
  g.clearRect(0, 0, W, H);
  const vx = W * (0.36 + r() * 0.28), vy = H * (0.42 + r() * 0.1);
  const info = SCENE_FN[scene](g, W, H, r, vx, vy);
  // film grain, colour cast, cheap-flash falloff
  const img = g.getImageData(0, 0, W, H), d = img.data, T = info.tint;
  const dev = opts.develop == null ? 1 : Math.max(0, Math.min(1, opts.develop));
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const n = (r() - 0.5) * 30;
    const x = (p % W) / W - 0.5, y = ((p / W) | 0) / H - 0.5;
    const fl = 1.12 - Math.min(0.62, (x * x + y * y) * 1.9);           // bright centre, dark corners
    let R = d[i] * fl + n, G = d[i + 1] * fl + n, B = d[i + 2] * fl + n * 0.8;
    R = R * 0.85 + T[0] * 0.15 * fl; G = G * 0.85 + T[1] * 0.15 * fl; B = B * 0.85 + T[2] * 0.15 * fl;
    if (dev < 1) { const m = dev * dev; R = 24 + (R - 24) * m; G = 30 + (G - 30) * m; B = 38 + (B - 38) * m; }
    d[i] = R; d[i + 1] = G; d[i + 2] = B;
  }
  g.putImageData(img, 0, 0);
  // a few dust specks and a faint scratch
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 12; i++) g.fillRect(r() * W, r() * H, 1 + r(), 1 + r());
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(r() * W, 0, 1, H);
  const stamp = photoStamp(seed);
  if (opts.stamp !== false && dev > 0.6) {
    g.font = `bold ${Math.max(9, Math.round(H * 0.06))}px "Courier New", monospace`;
    g.textBaseline = 'alphabetic'; g.textAlign = 'right';
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(stamp, W - 8 + 1, H - 8 + 1);
    g.fillStyle = 'rgba(255,150,40,0.92)'; g.fillText(stamp, W - 8, H - 8);
  }
  g.restore();
  return { scene, stamp };
}
