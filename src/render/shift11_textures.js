// SHIFT11 (wave 11) textures for the RECYCLE BIN labyrinth, registered by name (64 px PSX tiles).
//   s11_junk    a tower of dead hardware: crates, CRT monitors, paper boxes with tape (the shutters that slide down and re-route a corridor)
//   s11_bin     sector seal: black steel, red hazard stripes, "DELETED"
//   s11_void    the floor of a deleted sector: dead signal, red scan lines, a cross
import { registerTexture } from './textures.js';

let done = false;
export function installShift11Textures() {
  if (done) return;
  done = true;
  registerTexture('s11_junk', 64, 64, (p, r) => {
    p.fill([38, 34, 32]);
    for (let row = 0; row < 4; row++) {
      let x = 0;
      const y = row * 16;
      while (x < 64) {
        const w = Math.min(64 - x, 13 + ((r() * 13) | 0)), k = r();
        if (k < 0.4) {   // crate
          const b = 92 + ((r() * 36) | 0);
          p.rect(x, y + 1, w - 1, 14, [b, b * 0.72, b * 0.44]);
          p.frame(x, y + 1, w - 1, 14, [58, 40, 24]);
          p.line(x, y + 1, x + w - 2, y + 14, [64, 44, 26]);
          p.line(x + w - 2, y + 1, x, y + 14, [64, 44, 26]);
        } else if (k < 0.72) {   // CRT
          p.rect(x, y + 1, w - 1, 14, [138, 132, 118]);
          p.frame(x, y + 1, w - 1, 14, [70, 66, 58]);
          const gl = r() < 0.5 ? [40, 200, 120] : [60, 120, 210];
          p.rect(x + 2, y + 3, Math.max(2, w - 6), 8, [16, 22, 20]);
          p.rect(x + 3, y + 5 + ((r() * 3) | 0), Math.max(1, w - 8), 1, gl);
          p.set(x + w - 4, y + 13, [220, 40, 30]);
        } else {   // paper box + tape
          p.rect(x, y + 1, w - 1, 14, [176, 164, 132]);
          p.frame(x, y + 1, w - 1, 14, [104, 96, 74]);
          p.rect(x + ((w / 2) | 0) - 1, y + 1, 3, 14, [200, 190, 150], 0.9);
          p.text('X', x + 2, y + 4, [92, 60, 40], 1, 0.6);
        }
        x += w;
      }
    }
    for (let i = 0; i < 26; i++) p.set(r() * 64, r() * 64, [10, 8, 8], 0.5);
    p.grime(r, 0.34);
  });

  registerTexture('s11_bin', 64, 64, (p, r) => {
    p.noiseFill(r, [30, 30, 34], [50, 50, 56], [16, 8, 4], 8);
    for (let y = 0; y < 64; y += 8) p.line(0, y, 63, y, [16, 16, 20], 0.7);
    // hazard band
    for (let x = 0; x < 64; x++) for (let y = 0; y < 8; y++) { const on = ((x + y) >> 3) & 1; p.set(x, y, on ? [210, 36, 30] : [24, 22, 24]); p.set(x, 63 - y, on ? [210, 36, 30] : [24, 22, 24]); }
    p.text('DELETED', 4, 26, [230, 46, 38], 2, 0.95);
    p.text('NO RECOVERY', 4, 43, [150, 32, 28], 1, 0.8);
    p.grime(r, 0.3);
  });

  registerTexture('s11_void', 64, 64, (p, r) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const n = r(), c = 8 + n * 26; p.set(x, y, [c * 1.2, c * 0.35, c * 0.4]); }
    for (let y = 0; y < 64; y += 4) p.line(0, y, 63, y, [120, 14, 20], 0.35);
    p.line(4, 4, 59, 59, [200, 30, 30], 0.7); p.line(59, 4, 4, 59, [200, 30, 30], 0.7);
    p.frame(2, 2, 60, 60, [150, 24, 26], 0.8);
  });
}
