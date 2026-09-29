// REPOMAPS (wave 8) level textures for the four themed interiors (world/interiors/themes_studio.js). Procedural 64px tiles in the same
// pixel-buffer style as render/textures.js; registered by name (st_*) so facility styles can use them like any other level texture.
//   st_pinkgold  Influencer Mansion wall     st_velvet   its carpet             st_school  Academy wainscot wall   st_linoleum  Academy floor
//   st_frost     Cold Storage wall panel     st_icefloor Cold Storage floor      st_gallery Museum wall             st_gfloor    Museum floor   st_redacted  banned-content wall
import { registerTexture } from './textures.js';

const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

let done = false;
export function installStudioTextures() {
  if (done) return;
  done = true;
  registerTexture('st_pinkgold', 64, 64, (p, r) => {
    p.noiseFill(r, [150, 44, 100], [178, 62, 122], [16, 8], 6);
    const gold = [218, 176, 82];
    for (let i = -64; i < 128; i += 16) { p.line(i, 0, i + 64, 64, gold, 0.75); p.line(i + 64, 0, i, 64, gold, 0.75); }
    for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) p.circle(x + 8, y + 8, 1.6, [255, 226, 140]);
    p.rect(0, 0, 64, 1, gold); p.rect(0, 63, 64, 1, [112, 26, 74]);
  });
  registerTexture('st_velvet', 64, 64, (p, r) => {
    p.noiseFill(r, [96, 18, 60], [128, 30, 84], [16, 8, 4], 8);
    p.each((x, y) => { if (((x >> 4) + (y >> 4)) & 1) p.mul(x, y, 0.86); });
    p.frame(0, 0, 64, 64, [206, 160, 70]);
    for (let i = 0; i < 40; i++) p.set(r() * 64, r() * 64, [255, 210, 120], 0.35);
  });
  registerTexture('st_school', 64, 64, (p, r) => {
    p.noiseFill(r, [206, 198, 168], [224, 216, 186], [16, 8], 6);          // cream plaster
    p.rect(0, 34, 64, 30, [52, 104, 78]);                                   // green wainscot
    p.each((x, y) => { if (y >= 34) p.mul(x, y, 0.92 + ((x * 7 + y * 3) % 5) * 0.03); });
    p.rect(0, 32, 64, 2, [96, 66, 40]); p.rect(0, 30, 64, 1, [150, 130, 96]);   // chair rail
    p.text('ABC', 4, 8, [70, 70, 84], 1, 0.55); p.text('1+1', 40, 18, [140, 60, 50], 1, 0.55);
    p.grime(r, 0.28);
  });
  registerTexture('st_linoleum', 64, 64, (p, r) => {
    for (let ty = 0; ty < 64; ty += 16) for (let tx = 0; tx < 64; tx += 16) {
      const c = ((tx + ty) >> 4) & 1 ? [150, 160, 118] : [176, 170, 132];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(tx + x, ty + y, (x === 0 || y === 0) ? [98, 100, 78] : mixc(c, [c[0] * 0.9, c[1] * 0.9, c[2] * 0.9], r()));
    }
    for (let i = 0; i < 26; i++) p.set(r() * 64, r() * 64, [90, 90, 70], 0.5);
    p.grime(r, 0.3);
  });
  registerTexture('st_frost', 64, 64, (p, r) => {
    p.noiseFill(r, [120, 146, 168], [156, 182, 202], [16, 8, 4], 8);
    for (let x = 0; x < 64; x += 32) { p.rect(x, 0, 1, 64, [70, 92, 112]); p.rect(x + 1, 0, 1, 64, [190, 214, 230], 0.6); }
    p.rect(0, 30, 64, 4, [214, 232, 244], 0.35);
    for (let i = 0; i < 80; i++) p.set(r() * 64, r() * 64, [244, 250, 255], 0.7);
    p.rect(26, 6, 12, 5, [30, 60, 90]); p.text('-18', 27, 6, [150, 230, 255]);
    p.grime(r, 0.22);
  });
  registerTexture('st_icefloor', 64, 64, (p, r) => {
    p.noiseFill(r, [168, 200, 224], [206, 228, 244], [16, 8, 4], 8);
    for (let i = 0; i < 5; i++) { const x = r() * 64, y = r() * 64; p.line(x, y, x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, [232, 246, 255], 0.8); }
    p.grime(r, 0.16);
  });
  registerTexture('st_gallery', 64, 64, (p, r) => {
    p.noiseFill(r, [214, 212, 206], [232, 230, 224], [16, 8], 4);
    p.rect(0, 58, 64, 6, [60, 60, 66]); p.rect(0, 57, 64, 1, [150, 150, 154]);   // dark skirting
    p.grime(r, 0.12);
  });
  registerTexture('st_gfloor', 64, 64, (p, r) => {
    p.noiseFill(r, [38, 36, 40], [58, 56, 62], [16, 8, 4], 8);
    for (let x = 0; x < 64; x += 32) p.rect(x, 0, 1, 64, [16, 16, 18]);
    for (let y = 0; y < 64; y += 32) p.rect(0, y, 64, 1, [16, 16, 18]);
    for (let i = 0; i < 4; i++) p.line(r() * 64, 0, r() * 64, 64, [92, 90, 100], 0.22);   // polish streaks
  });
  registerTexture('st_redacted', 64, 64, (p, r) => {
    p.fill([22, 22, 26]);
    for (let y = 4; y < 60; y += 9) { const w = 20 + r() * 36; p.rect(4, y, w, 5, [8, 8, 10]); p.rect(4 + w + 3, y, 6 + r() * 8, 5, [70, 70, 78], 0.7); }
    p.text('DELETED', 6, 2, [190, 44, 44]);
    p.grime(r, 0.2);
  });
}
