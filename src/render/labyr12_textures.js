// LABYR12 (wave 12) level textures for the Dark Web and the Elevator Hotel, registered by name like render/labyr10_textures.js (64 px PSX tiles, signs 128x32).
//   Dark Web   dw_wall (black conduit concrete)  dw_floor (grating)  dw_ceil  dw_cable (wire bundle)  dw_tarp (market stall)  dw_screen (terminal glow, use as e:)  dw_sign
//   Hotel      hz_carpet (hex pattern)  hz_wall (wallpaper over wainscot)  hz_door  hz_dnd (door + DO NOT DISTURB hanger)  hz_elev (steel doors)  hz_lobby (marble)
//              hz_ceil  hz_stairs (STAIRS door)  hz_sign (HOTEL banner)  hz_n<number> (brass room plaque, registered on demand by plaqueKey())
import { registerTexture } from './textures.js';

const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** brass room-number plaque texture key ('m:hz_n204'); the texture is registered the first time a number is asked for */
export function plaqueKey(n) {
  const name = 'hz_n' + n;
  registerTexture(name, 32, 16, (p, r) => {
    p.fill([150, 112, 44]); p.frame(0, 0, 32, 16, [232, 196, 96]); p.frame(1, 1, 30, 14, [96, 68, 24]);
    p.textC(String(n), 16, 5, [30, 18, 4], 2);
    for (let i = 0; i < 20; i++) p.set(r() * 32, r() * 16, [90, 64, 24], 0.5);
  });
  return 'm:' + name;
}

let done = false;
export function installLabyr12Textures() {
  if (done) return;
  done = true;

  // ------------------------------------------------------------------------------------------------ DARK WEB
  registerTexture('dw_wall', 64, 64, (p, r) => {
    p.noiseFill(r, [12, 15, 20], [30, 36, 44], [16, 8], 8);
    for (let x = 6; x < 64; x += 16) { p.rect(x, 0, 2, 64, [8, 10, 14]); p.rect(x + 1, 0, 1, 64, [24, 60, 64], 0.5); }   // conduit
    for (let y = 12; y < 64; y += 24) p.rect(0, y, 64, 1, [8, 10, 14]);
    for (let i = 0; i < 6; i++) p.textC((r() * 65535 | 0).toString(16), 8 + r() * 48, 4 + ((r() * 12) | 0) * 5, [20, 88, 84], 1, 0.7);   // stencilled hex
    p.grime(r, 0.32);
  });
  registerTexture('dw_floor', 64, 64, (p, r) => {
    p.fill([14, 16, 18]);
    for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) { p.rect(x + 1, y + 1, 6, 6, [22, 25, 28]); p.set(x + 3, y + 3, [10, 12, 14]); }
    for (let i = 0; i < 24; i++) p.set(r() * 64, r() * 64, [24, 70, 70], 0.8);
    p.grime(r, 0.35);
  });
  registerTexture('dw_ceil', 64, 64, (p, r) => {
    p.noiseFill(r, [8, 10, 12], [18, 22, 26], [16, 8], 6);
    for (let y = 8; y < 64; y += 20) { p.rect(0, y, 64, 3, [4, 5, 6]); p.rect(0, y + 1, 64, 1, [16, 20, 24]); }
    p.grime(r, 0.3);
  });
  registerTexture('dw_cable', 64, 64, (p, r) => {                              // a bundle of network cable: horizontal wires in dead colours
    const cols = [[20, 20, 24], [26, 60, 84], [72, 22, 40], [40, 64, 30], [90, 74, 24], [18, 18, 18]];
    for (let y = 0; y < 64; y += 4) { const c = cols[((y >> 2) + ((r() * 2) | 0)) % cols.length]; p.rect(0, y, 64, 4, c); p.rect(0, y, 64, 1, [c[0] * 1.5, c[1] * 1.5, c[2] * 1.5]); }
    for (let x = 0; x < 64; x += 16) p.rect(x, 0, 2, 64, [50, 50, 54]);          // cable ties
    p.grime(r, 0.3);
  });
  registerTexture('dw_tarp', 64, 64, (p, r) => {
    for (let x = 0; x < 64; x++) p.rect(x, 0, 1, 64, ((x >> 3) & 1) ? [34, 26, 46] : [22, 22, 30]);
    for (let i = 0; i < 5; i++) p.line(r() * 64, 0, r() * 64, 64, [10, 8, 14], 0.5);   // folds
    p.grime(r, 0.36);
  });
  registerTexture('dw_screen', 64, 64, (p, r) => {                             // used emissive: scrolling dead terminal text
    p.fill([2, 12, 8]);
    for (let y = 2; y < 62; y += 6) { const n = 4 + ((r() * 10) | 0); p.rect(3, y, n * 4, 2, [20 + r() * 40, 150 + r() * 80, 80], 0.85); }
    p.frame(0, 0, 64, 64, [12, 40, 28]);
  });
  registerTexture('dw_sign', 128, 32, (p, r) => {
    p.fill([4, 8, 10]); p.frame(0, 0, 128, 32, [20, 200, 170]); p.frame(2, 2, 124, 28, [8, 60, 56]);
    p.textC('.ONION MARKET', 64, 6, [40, 255, 210], 2); p.textC('NO REFUNDS. NO RETURN.', 64, 22, [30, 150, 130], 1);
    for (let k = 0; k < 30; k++) p.set(r() * 128, r() * 32, [0, 0, 0], 0.4);
  });

  // ------------------------------------------------------------------------------------------------ HOTEL
  registerTexture('hz_carpet', 64, 64, (p, r) => {                             // hexagon lattice, red-brown ground with orange and teal
    p.noiseFill(r, [96, 26, 26], [116, 36, 30], [16, 8], 6);
    for (let cy = 0; cy < 3; cy++) for (let cx = 0; cx < 3; cx++) {
      const x = cx * 22 + ((cy & 1) ? 11 : 0), y = cy * 21;
      p.ring(x, y, 8, 10, [196, 110, 30], 0.9); p.ring(x, y, 3, 5, [24, 110, 110], 0.85); p.circle(x, y, 2, [230, 190, 90]);
    }
    p.grime(r, 0.3);
  });
  registerTexture('hz_wall', 64, 64, (p, r) => {
    p.noiseFill(r, [206, 190, 150], [224, 208, 168], [16, 8], 5);
    for (let x = 4; x < 64; x += 16) { p.rect(x, 0, 4, 40, [124, 148, 112], 0.8); p.rect(x + 1, 0, 2, 40, [148, 170, 130], 0.6); }
    for (let y = 6; y < 36; y += 12) for (let x = 12; x < 64; x += 16) p.circle(x, y, 2, [166, 60, 50], 0.7);
    p.rect(0, 40, 64, 2, [90, 60, 30]); p.rect(0, 42, 64, 22, [88, 52, 28]);   // wainscot
    for (let x = 0; x < 64; x += 16) p.rect(x, 42, 1, 22, [56, 32, 16]);
    p.grime(r, 0.32);
  });
  registerTexture('hz_door', 64, 64, (p, r) => {
    p.fill([84, 52, 28]);
    p.frame(4, 3, 56, 58, [40, 24, 10]); p.frame(10, 8, 20, 22, [60, 36, 16]); p.frame(34, 8, 20, 22, [60, 36, 16]);
    p.frame(10, 34, 20, 22, [60, 36, 16]); p.frame(34, 34, 20, 22, [60, 36, 16]);
    p.circle(52, 32, 2, [222, 178, 70]); p.circle(32, 4, 1, [10, 8, 6]);          // knob + peephole
    p.grime(r, 0.3);
  });
  registerTexture('hz_dnd', 64, 64, (p, r) => {
    p.fill([84, 52, 28]);
    p.frame(4, 3, 56, 58, [40, 24, 10]); p.frame(10, 34, 20, 22, [60, 36, 16]); p.frame(34, 34, 20, 22, [60, 36, 16]);
    p.circle(52, 32, 2, [222, 178, 70]);
    p.rect(40, 6, 16, 24, [190, 24, 24]); p.frame(40, 6, 16, 24, [250, 240, 230]);   // the hanger on the knob side
    p.textC('DND', 48, 10, [255, 255, 255], 1); p.textC('KEEP', 48, 17, [255, 220, 220], 1); p.textC('OUT', 48, 23, [255, 220, 220], 1);
    p.grime(r, 0.3);
  });
  registerTexture('hz_elev', 64, 64, (p, r) => {                               // brushed steel double doors
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.set(x, y, mixc([150, 154, 158], [178, 182, 186], ((x * 7 + y * 3) % 13) / 13));
    p.rect(31, 0, 2, 64, [40, 42, 46]); p.frame(0, 0, 64, 64, [70, 74, 80]); p.frame(4, 4, 24, 56, [120, 124, 130]); p.frame(36, 4, 24, 56, [120, 124, 130]);
    p.grime(r, 0.25);
  });
  registerTexture('hz_lobby', 64, 64, (p, r) => {
    for (let ty = 0; ty < 64; ty += 32) for (let tx = 0; tx < 64; tx += 32) {
      const c = ((tx + ty) >> 5) & 1 ? [196, 190, 176] : [34, 32, 34];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(tx + x, ty + y, mixc(c, [c[0] * 0.9, c[1] * 0.9, c[2] * 0.9], r()));
      p.frame(tx, ty, 32, 32, [120, 100, 60], 0.5);
    }
    p.grime(r, 0.3);
  });
  registerTexture('hz_ceil', 64, 64, (p, r) => {
    p.noiseFill(r, [204, 196, 172], [222, 214, 190], [16, 8], 5);
    for (let x = 0; x < 64; x += 32) p.rect(x, 0, 2, 64, [120, 96, 60]);
    for (let y = 0; y < 64; y += 32) p.rect(0, y, 64, 2, [120, 96, 60]);
    for (let i = 0; i < 3; i++) p.circle(r() * 64, r() * 64, 3 + r() * 4, [150, 120, 70], 0.25);
    p.grime(r, 0.3);
  });
  registerTexture('hz_stairs', 64, 64, (p, r) => {
    p.fill([60, 66, 62]); p.frame(4, 3, 56, 58, [30, 34, 32]);
    p.rect(14, 8, 36, 14, [20, 130, 60]); p.textC('STAIRS', 32, 13, [230, 255, 235], 1);
    for (let k = 0; k < 4; k++) p.rect(16 + k * 8, 46 - k * 6, 10, 3, [230, 255, 235], 0.8);
    p.grime(r, 0.28);
  });
  registerTexture('hz_sign', 128, 32, (p, r) => {
    p.fill([60, 14, 18]); p.frame(0, 0, 128, 32, [222, 178, 70]); p.frame(2, 2, 124, 28, [120, 30, 30]);
    p.textC('THE OVERLOAD', 64, 6, [0, 0, 0], 2, 0.5); p.textC('THE OVERLOAD', 63, 5, [240, 206, 110], 2);
    p.textC('CHECK OUT ANYTIME. ERROR 404', 64, 22, [200, 160, 90], 1);
    for (let k = 0; k < 30; k++) p.set(r() * 128, r() * 32, [0, 0, 0], 0.35);
  });
}
