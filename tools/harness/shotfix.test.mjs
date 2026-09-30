// node tools/harness/shotfix.test.mjs - wave 8 shotfix: no tofu glyphs in the Algorithm typewriter, one world waypoint (the goal's),
// no magenta floating glitch cube (CRT monitor instead), torch pushed out of the mitten.
import fs from 'fs';
let bad = 0;
const chk = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const alg = rd('src/game/algorithm.js'), tasks = rd('src/game/tasks.js'), obj = rd('src/game/objectives.js'), v = rd('src/game/algo2_view.js'), grip = rd('src/game/fpbody_grip.js');

const glyphs = alg.match(/const GLYPHS = '((?:[^'\\]|\\.)*)'/)?.[1] || '';
chk(glyphs.length > 5 && /^[\x20-\x7e]+$/.test(glyphs), 'typewriter scramble glyphs are printable ASCII (block glyphs rendered as tofu): ' + glyphs);
chk(/goalSrc/.test(obj) && /goalSrc === 'tasks'/.test(tasks), 'objectives exposes the goal source, tasks gates the named world label on it');
chk(/if \(!named && !edge\) continue/.test(tasks) && /const mx = named \? 90 : 34/.test(tasks), 'non-goal tasks are edge-only icons, labels keep a margin (never cut off)');
chk(!/ff4fd8|33e6ff|0xff2bd6|OctahedronGeometry\(0\.26\)|vec3\(0\.6, 0\.0, 0\.5\)/.test(v), 'algo2 glitches: no magenta/cyan, no floating pixel cube');
chk(/crtBase/.test(v) && !/spin/.test(v), 'freeze glitch is a monitor on a crate (grounded, not spinning)');
chk(/TORCH_FWD = \{ flashlight: 0\.07, proflash: 0\.07 \}/.test(grip), 'torch model pushed forward of the palm');
if (bad) { console.log(bad + ' FAIL'); process.exit(1); }
console.log('shotfix.test: all ok');
