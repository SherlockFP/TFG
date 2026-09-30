// FEELFIX2 test (pure node, docs/wave8/feelfix2.md): node tools/harness/feelfix2.test.mjs
//  1. bulky held items cover <= 25 % of the frame (fpbody_grip fitGrip), small ones are left alone
//  2. the metro / influencer themes carry the denser practicals knob + the metro platform has a checker floor
//  3. the drone cone / disc helpers exist (round + soft) and the day report hides the top quota banner
import * as THREE from 'three';
import fs from 'node:fs';
import { fitGrip, itemGeom, COVER_MAX } from '../../src/game/fpbody_grip.js';

let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const box = (sx, sy, sz) => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz).translate(0, sy / 2, 0), new THREE.MeshBasicMaterial())); return g; };
const DEF = { hands: 2, kind: 'scrap', weight: 62 };

for (const [sx, sy, sz] of [[0.9, 1.8, 0.8], [0.6, 1.5, 0.9], [1.2, 1.0, 0.6], [0.7, 1.3, 0.5]]) {
  const f = fitGrip(itemGeom(box(sx, sy, sz)), DEF, 'x');
  ok(f.cls === 'carry' && f.cover <= COVER_MAX + 0.02 && f.ghost && f.pen < 0.02, `bulky ${sx}x${sy}x${sz}: cover ${f.cover.toFixed(2)} ghost ${f.ghost} pen ${f.pen.toFixed(3)}`);
  ok(f.grip.R.x > 0.13 && f.grip.L.x < f.grip.R.x, 'both hands present, shifted right of centre');
}
const small = fitGrip(itemGeom(box(0.3, 0.3, 0.3)), DEF, 'x');
ok(!small.ghost && small.scale === 1, 'a small two-hand item is not ghosted / scaled');

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
ok(/practicals: \{ corridor: 2 \}/.test(read('src/world/interiors/lab_themes.js')) && /practicals: \{ corridor: 2 \}/.test(read('src/world/interiors/themes_studio.js')), 'practicals knob on metro + influencer');
ok(/platform: R\(\{ floor: 'tiles_checker'/.test(read('src/world/interiors/lab_themes.js')), 'metro platform checker floor');
ok(/softDisc\(/.test(read('src/game/feedcams2.js')) && /const M = 20/.test(read('src/game/feedcams.js')), 'round drone cone + 20-slice camera cone');
ok(/body:has\(\.report\) \.hud-quota/.test(read('src/ui/docklayout.js')), 'report hides the top quota banner');
ok(/LOCK_NEAR = 1\.5/.test(read('src/game/hubgate.js')), 'locked-fixture prompt only within 1.5 m');

console.log(bad ? `feelfix2: ${bad} FAILED` : 'feelfix2: all ok');
process.exit(bad ? 1 : 0);
