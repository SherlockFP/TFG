// LABYR10 (wave 10) level textures for the two new interiors, registered by name like render/studio_textures.js (64 px PSX tiles, signs 128x32).
//   Dead Mall   ml_tile (terrazzo promenade)  ml_tile_dark (inlay)  ml_wall  ml_ceil  ml_shutter (roll-down grille)  ml_carpet (food court)  ml_service (back corridor)
//               ml_sign_0..7 (parody brand boards: the shops died, the logos did not)  ml_fount (dry basin sludge)  ml_gold
//   Funhouse    fh_mirror  fh_mirror_ghost (a reflection that should not be there)  fh_stripes (big-top wall)  fh_checker  fh_diag  fh_tilt  fh_spin
//               fh_clown0..3 (meme murals)  fh_back (backstage wall)
import { registerTexture } from './textures.js';

export const MALL_BRANDS = ['BLOCKBUSTED', 'GAMESTOPPED', 'SPOTIFAIL', 'FOOT LOCKED', 'HOT TOPICAL', 'AMAZOOM', 'CLAIRES.EXE', 'ORANGE JULIAN'];
const BRAND_COL = [[[24, 60, 168], [255, 214, 40]], [[150, 20, 24], [240, 236, 230]], [[16, 26, 20], [40, 220, 100]], [[20, 20, 24], [240, 240, 240]],
  [[16, 10, 22], [255, 60, 150]], [[26, 34, 46], [255, 160, 40]], [[210, 90, 160], [255, 250, 250]], [[236, 120, 20], [255, 244, 210]]];
export const FUN_MURALS = 4;

const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

let done = false;
export function installLabyr10Textures() {
  if (done) return;
  done = true;

  // ------------------------------------------------------------------------------------------------ DEAD MALL
  registerTexture('ml_tile', 64, 64, (p, r) => {
    for (let ty = 0; ty < 64; ty += 32) for (let tx = 0; tx < 64; tx += 32) {
      const base = ((tx + ty) >> 5) & 1 ? [188, 182, 150] : [200, 196, 164];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(tx + x, ty + y, (x === 0 || y === 0) ? [116, 112, 92] : mixc(base, [base[0] * 0.92, base[1] * 0.92, base[2] * 0.9], r()));
    }
    for (let i = 0; i < 90; i++) p.set(r() * 64, r() * 64, [120, 110, 90], 0.45);   // terrazzo chips
    for (let i = 0; i < 40; i++) p.set(r() * 64, r() * 64, [236, 232, 205], 0.6);
    p.grime(r, 0.32);
  });
  registerTexture('ml_tile_dark', 64, 64, (p, r) => {
    p.noiseFill(r, [56, 78, 64], [78, 100, 84], [16, 8], 6);
    for (let y = 0; y < 64; y += 16) p.rect(0, y, 64, 1, [30, 44, 36]);
    for (let x = 0; x < 64; x += 16) p.rect(x, 0, 1, 64, [30, 44, 36]);
    p.grime(r, 0.3);
  });
  registerTexture('ml_wall', 64, 64, (p, r) => {
    p.noiseFill(r, [206, 176, 150], [224, 194, 166], [16, 8], 6);              // faded peach plaster
    p.rect(0, 36, 64, 3, [64, 120, 118]);                                      // teal stripe
    p.rect(0, 39, 64, 1, [236, 226, 200]);
    p.rect(0, 58, 64, 6, [142, 112, 92]);                                      // dado (thin: the tile repeats every 2 m)
    p.rect(0, 57, 64, 1, [90, 66, 52]);
    for (let x = 0; x < 64; x += 16) p.rect(x, 58, 1, 6, [104, 78, 62]);
    for (let i = 0; i < 10; i++) { const x = r() * 64; for (let k = 0; k < 6 + r() * 16; k++) p.set(x, 8 + k, [120, 100, 76], 0.3); }   // water streaks
    p.grime(r, 0.3);
  });
  registerTexture('ml_ceil', 64, 64, (p, r) => {
    p.noiseFill(r, [206, 204, 190], [228, 226, 212], [16, 8], 5);
    for (let x = 0; x < 64; x += 32) p.rect(x, 0, 1, 64, [110, 108, 98]);
    for (let y = 0; y < 64; y += 32) p.rect(0, y, 64, 1, [110, 108, 98]);
    for (let i = 0; i < 3; i++) { const cx = r() * 64, cy = r() * 64; for (let k = 0; k < 8; k++) p.circle(cx + (r() - 0.5) * 6, cy + (r() - 0.5) * 6, 2 + r() * 3, [150, 128, 84], 0.25); }   // stains
    p.grime(r, 0.25);
  });
  registerTexture('ml_shutter', 64, 64, (p, r) => {
    for (let y = 0; y < 64; y++) { const rib = y % 6; const v = rib === 0 ? 0.55 : rib === 1 ? 0.8 : rib === 5 ? 1.15 : 1; p.rect(0, y, 64, 1, [118 * v, 122 * v, 126 * v]); }
    for (let i = 0; i < 40; i++) p.set(r() * 64, r() * 64, [96, 60, 36], 0.5);
    for (let i = 0; i < 6; i++) { const x = r() * 64; for (let k = 0; k < 10 + r() * 30; k++) p.set(x, k, [110, 62, 34], 0.5); }   // rust drips
    p.rect(28, 30, 8, 4, [40, 40, 44]); p.rect(30, 31, 4, 2, [180, 150, 60]);   // padlock plate
    p.grime(r, 0.25);
  });
  registerTexture('ml_carpet', 64, 64, (p, r) => {
    p.noiseFill(r, [24, 78, 92], [34, 100, 112], [16, 8], 8);                  // 90s teal confetti carpet
    const cols = [[214, 60, 140], [236, 190, 50], [244, 240, 232], [110, 40, 150]];
    for (let i = 0; i < 46; i++) { const x = r() * 64, y = r() * 64, c = cols[(r() * 4) | 0], a = r() * Math.PI; p.line(x, y, x + Math.cos(a) * 4, y + Math.sin(a) * 4, c, 0.9); }
    p.grime(r, 0.35);
  });
  registerTexture('ml_service', 64, 64, (p, r) => {
    p.noiseFill(r, [110, 116, 108], [136, 142, 132], [16, 8], 8);
    p.rect(0, 40, 64, 2, [204, 176, 46]);                                      // safety stripe
    p.rect(0, 42, 64, 22, [86, 92, 86]);
    p.rect(0, 24, 64, 1, [80, 86, 80]);
    p.grime(r, 0.4);
  });
  registerTexture('ml_fount', 64, 64, (p, r) => {
    p.noiseFill(r, [92, 104, 70], [128, 138, 90], [16, 8, 4], 10);            // dried algae basin
    for (let i = 0; i < 6; i++) p.ring(r() * 64, r() * 64, 5 + r() * 8, 6 + r() * 8, [70, 78, 52], 0.5);
    for (let i = 0; i < 30; i++) p.set(r() * 64, r() * 64, [220, 190, 90], 0.9);   // coins
    p.grime(r, 0.3);
  });
  registerTexture('ml_gold', 64, 64, (p, r) => {
    p.noiseFill(r, [196, 150, 40], [244, 204, 84], [16, 8], 10);
    for (let i = 0; i < 8; i++) p.line(r() * 64, 0, r() * 64, 64, [255, 240, 170], 0.35);
    p.grime(r, 0.18);
  });
  MALL_BRANDS.forEach((name, i) => registerTexture('ml_sign_' + i, 128, 32, (p, r) => {
    const [bg, fg] = BRAND_COL[i];
    p.fill(bg);
    p.frame(0, 0, 128, 32, fg); p.frame(2, 2, 124, 28, mixc(bg, fg, 0.35));
    p.textC(name, 64, 11, [0, 0, 0], 2, 0.6); p.textC(name, 63, 10, fg, 2);
    for (let x = 4; x < 124; x += 6) p.set(x, 27, fg, 0.6);
    for (let k = 0; k < 40; k++) p.set(r() * 128, r() * 32, [0, 0, 0], 0.3);   // dead pixels
    p.grime(r, 0.2);
  }));

  // ------------------------------------------------------------------------------------------------ FUNHOUSE
  const mirrorBase = (p, r) => {
    for (let y = 0; y < 64; y++) { const t = y / 63; const c = mixc([196, 214, 232], [110, 132, 160], t); for (let x = 0; x < 64; x++) p.set(x, y, mixc(c, [c[0] - 14, c[1] - 12, c[2] - 8], ((x * 3 + y) % 11) / 11 * 0.4 + r() * 0.1)); }
    for (let k = 0; k < 4; k++) { const x0 = (k * 21 + 6) % 70 - 6; p.line(x0, 0, x0 + 30, 64, [250, 252, 255], 0.4); p.line(x0 + 3, 0, x0 + 33, 64, [250, 252, 255], 0.2); }   // glare
    for (let y = 8; y < 64; y += 9) for (let x = 0; x < 64; x++) p.mul(x, y + Math.round(Math.sin(x * 0.4 + y) * 1.4), 0.93);   // wavy distortion
    p.frame(0, 0, 64, 64, [64, 56, 82]); p.frame(1, 1, 62, 62, [168, 150, 200], 0.6);
    p.rect(31, 1, 2, 62, [70, 62, 90], 0.7);                                   // panel seam
  };
  registerTexture('fh_mirror', 64, 64, (p, r) => { mirrorBase(p, r); p.grime(r, 0.16); });
  registerTexture('fh_mirror_ghost', 64, 64, (p, r) => {
    mirrorBase(p, r);
    const dk = [30, 34, 70];
    p.ellipse(16, 20, 5, 6, dk, 0.85); p.rect(11, 26, 10, 22, dk, 0.85);        // head + torso
    p.line(11, 28, 5, 44, dk, 0.8); p.line(21, 28, 27, 46, dk, 0.8);            // arms too long
    p.rect(12, 48, 3, 14, dk, 0.85); p.rect(17, 48, 3, 14, dk, 0.85);
    p.set(14, 19, [255, 255, 255]); p.set(18, 19, [255, 255, 255]);              // eyes
    p.grime(r, 0.16);
  });
  registerTexture('fh_stripes', 64, 64, (p, r) => {
    for (let x = 0; x < 64; x++) p.rect(x, 0, 1, 64, ((x >> 3) & 1) ? [206, 190, 160] : [176, 34, 48]);
    for (let y = 0; y < 64; y += 16) p.rect(0, y, 64, 1, [90, 20, 30], 0.35);
    p.rect(0, 61, 64, 3, [52, 20, 70]);                                        // purple skirting
    p.grime(r, 0.36);
  });
  registerTexture('fh_checker', 64, 64, (p, r) => {
    for (let ty = 0; ty < 64; ty += 16) for (let tx = 0; tx < 64; tx += 16) {
      const c = ((tx + ty) >> 4) & 1 ? [168, 30, 60] : [34, 18, 46];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(tx + x, ty + y, mixc(c, [c[0] * 0.85, c[1] * 0.85, c[2] * 0.85], r()));
    }
    p.grime(r, 0.34);
  });
  registerTexture('fh_diag', 64, 64, (p, r) => {                                // crooked-room wall: sheared stripes + a skewed frame
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.set(x, y, (((x + y * 0.5) | 0) >> 3) & 1 ? [214, 176, 44] : [92, 40, 128]);
    p.line(8, 6, 50, 14, [20, 10, 30]); p.line(50, 14, 56, 46, [20, 10, 30]); p.line(56, 46, 14, 38, [20, 10, 30]); p.line(14, 38, 8, 6, [20, 10, 30]);
    p.grime(r, 0.3);
  });
  registerTexture('fh_tilt', 64, 64, (p, r) => {                                // vertigo floor: diagonal checkers
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.set(x, y, (((x + y) >> 4) + ((x - y + 64) >> 4)) & 1 ? [40, 130, 96] : [70, 30, 100]);
    p.grime(r, 0.32);
  });
  registerTexture('fh_spin', 64, 64, (p, r) => {                                // spinning tunnel shell: bold slanted bands
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const b = ((x + y) >> 3) & 3; p.set(x, y, b === 0 ? [244, 240, 236] : b === 1 ? [20, 14, 28] : b === 2 ? [236, 46, 132] : [20, 14, 28]); }
    p.grime(r, 0.22);
  });
  registerTexture('fh_back', 64, 64, (p, r) => {
    p.noiseFill(r, [64, 52, 76], [88, 72, 104], [16, 8], 8);
    p.rect(0, 46, 64, 18, [44, 36, 56]);
    for (let x = 0; x < 64; x += 16) p.rect(x, 0, 1, 64, [36, 28, 46]);
    p.grime(r, 0.4);
  });
  // meme murals: 0 the grin, 1 "TRY IT", 2 balloon, 3 "1 LEFT"
  const face = (p, r, cx, cy, s) => {
    const R = (v) => Math.round(v * s);
    for (const [dx, dy] of [[-18, -18], [18, -18], [-24, -6], [24, -6], [0, -24]]) p.circle(cx + R(dx), cy + R(dy), R(9), [236, 70, 40]);     // hair
    p.ellipse(cx, cy, R(21), R(25), [244, 240, 232]);
    p.ellipse(cx, cy, R(21), R(25), [244, 240, 232]);
    for (const dx of [-9, 9]) { p.ellipse(cx + R(dx), cy - R(7), R(6), R(4), [40, 110, 220]); p.circle(cx + R(dx), cy - R(7), R(2), [10, 10, 20]); }
    p.circle(cx, cy + R(1), R(5), [220, 30, 30]);
    p.ellipse(cx, cy + R(13), R(15), R(7), [16, 6, 10]);                        // grin
    for (let k = -12; k <= 12; k += 4) p.rect(cx + R(k) - 1, cy + R(8), 3, R(3) + 1, [244, 244, 236]);
    p.ellipse(cx - R(9), cy + R(4), R(4), R(3), [246, 150, 150], 0.7); p.ellipse(cx + R(9), cy + R(4), R(4), R(3), [246, 150, 150], 0.7);
  };
  const murals = [
    (p, r) => { p.fill([62, 20, 84]); face(p, r, 32, 36, 1); p.textC('LOL', 32, 3, [255, 226, 60], 2); },
    (p, r) => { p.fill([30, 90, 120]); face(p, r, 32, 32, 0.9); p.textC('TRY IT', 32, 54, [255, 255, 255], 2); p.textC('DO THE CHALLENGE', 32, 2, [255, 226, 60], 1); },
    (p, r) => { p.fill([150, 30, 60]); p.ellipse(32, 24, 14, 17, [244, 210, 60]); p.line(32, 41, 30, 60, [240, 240, 240]); face(p, r, 32, 44, 0.45); p.textC('SMILE.EXE', 32, 56, [255, 255, 255], 1); },
    (p, r) => { p.fill([20, 20, 28]); face(p, r, 32, 28, 0.8); p.textC('1 LEFT', 32, 52, [255, 60, 60], 2); p.textC('NO ONE EXITED', 32, 2, [200, 200, 210], 1); },
  ];
  murals.forEach((fn, i) => registerTexture('fh_clown' + i, 64, 64, (p, r) => { fn(p, r); p.frame(0, 0, 64, 64, [20, 10, 20]); p.grime(r, 0.28); }));
  registerTexture('fh_sign', 128, 32, (p, r) => {
    p.fill([24, 10, 40]); p.frame(0, 0, 128, 32, [255, 214, 60]); p.frame(2, 2, 124, 28, [236, 46, 132]);
    p.textC('FUNHOUSE', 64, 11, [0, 0, 0], 2, 0.6); p.textC('FUNHOUSE', 63, 10, [255, 240, 120], 2);
    for (let x = 6; x < 124; x += 8) p.circle(x, 27, 1, [255, 240, 120]);
    p.grime(r, 0.2);
  });
}
