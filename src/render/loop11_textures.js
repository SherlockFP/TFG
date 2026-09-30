// LOOP11 (wave 11) level textures for the re-onboarding corridor, registered by name like render/labyr10_textures.js (64 px PSX tiles).
//   lp_wall   one tile = 2.7 m x 2.7 m (a full wall height, so the wainscot sits at the same height everywhere): cream plaster over sage paint, chair rail
//   lp_floor  grey-blue commercial carpet tiles      lp_ceil  drop-ceiling tiles (4 x 4 per tile)     lp_door  painted office door with a recessed panel
//   lp_trim   dark skirting / frames                 lp_void  the black behind the ends of the hall
import { registerTexture } from './textures.js';

let done = false;
export function installLoop11Textures() {
  if (done) return;
  done = true;
  registerTexture('lp_wall', 64, 64, (p, r) => {
    p.noiseFill(r, [216, 210, 188], [228, 222, 200], [16, 8], 6);                     // upper plaster (top of the canvas = top of the wall)
    for (let y = 40; y < 64; y++) for (let x = 0; x < 64; x++) p.set(x, y, [148 + ((r() * 8) | 0), 164 + ((r() * 8) | 0), 146 + ((r() * 6) | 0)]);   // sage wainscot
    p.rect(0, 38, 64, 2, [238, 234, 214]); p.rect(0, 40, 64, 1, [96, 108, 96]);       // chair rail + its shadow
    p.rect(0, 0, 1, 64, [190, 184, 164], 0.5);                                        // panel seam at the tile edge
    for (let i = 0; i < 40; i++) p.set(r() * 64, r() * 64, [178, 170, 146], 0.35);
    p.grime(r, 0.1);
  });
  registerTexture('lp_floor', 64, 64, (p, r) => {
    p.noiseFill(r, [92, 106, 114], [108, 122, 130], [12, 6], 8);
    for (let i = 0; i < 64; i++) { p.mul(i, 0, 0.82); p.mul(0, i, 0.82); p.mul(i, 32, 0.9); p.mul(32, i, 0.9); }   // 1 m carpet tiles
    for (let i = 0; i < 70; i++) p.set(r() * 64, r() * 64, [140, 150, 150], 0.4);
    p.grime(r, 0.16);
  });
  registerTexture('lp_ceil', 64, 64, (p, r) => {
    p.noiseFill(r, [222, 220, 208], [234, 232, 220], [16, 8], 6);
    for (let i = 0; i < 64; i += 16) for (let k = 0; k < 64; k++) { p.mul(i, k, 0.72); p.mul(k, i, 0.72); }
    for (let i = 0; i < 90; i++) p.set(r() * 64, r() * 64, [140, 138, 128], 0.5);   // perforations
    p.grime(r, 0.12);
  });
  registerTexture('lp_door', 32, 64, (p, r) => {
    p.noiseFill(r, [92, 112, 104], [104, 124, 116], [8, 4], 6);
    p.frame(4, 5, 24, 26, [66, 82, 76]); p.frame(4, 35, 24, 24, [66, 82, 76]);          // recessed panels
    p.rect(5, 6, 22, 24, [98, 118, 110], 0.5); p.rect(5, 36, 22, 22, [98, 118, 110], 0.5);
    p.rect(0, 0, 32, 1, [58, 72, 66]); p.rect(0, 0, 1, 64, [58, 72, 66]); p.rect(31, 0, 1, 64, [58, 72, 66]);
    p.grime(r, 0.16);
  });
  registerTexture('lp_trim', 16, 16, (p, r) => { p.noiseFill(r, [58, 54, 48], [70, 64, 58], [4], 4); p.grime(r, 0.1); });
  registerTexture('lp_void', 8, 8, (p) => { p.fill([5, 5, 7]); });
}
