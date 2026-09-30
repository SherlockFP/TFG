// QA night 1 fixes: node test.  node tools/harness/qa1.test.mjs
import * as THREE from 'three';
import { LandingQueue } from '../../src/game/landingq.js';
import * as FR from '../../src/game/firstrun_core.js';
import { generateLayout, THEMES } from '../../src/world/facility.js';
import { addPracticals } from '../../src/world/interiors/practicals.js';
import fs from 'fs';

let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };

// 1. a job may split into sub-jobs that run NEXT (before the jobs queued behind it), in the order added; nested + outside-a-job behave
{
  const q = new LandingQueue({ startDelay: 0 }); const out = [];
  q.add('horror', () => { out.push('h'); q.addNext('a', () => { out.push('a'); q.addNext('a2', () => out.push('a2')); }); q.addNext('b', () => out.push('b')); });
  q.add('other', () => out.push('o')); q.add('prewarm', () => out.push('p'));
  q.flush(); ok(out.join() === 'h,a,a2,b,o,p', 'addNext order: ' + out);
  let ran = 0; q.addNext('x', () => ran++); ok(ran === 1, 'outside a job the part runs immediately');
}
// 2. arrival card timeline: cards queue one after another, free again after the last one
{
  const st = { until: 0 };
  ok(FR.slot(st, 1000, 4) === 0, 'first card is immediate');
  ok(FR.slot(st, 1000, 6) === 4000, 'second waits for the first');
  ok(FR.slot(st, 2000, 3) === 9000, 'third waits for both');
  ok(FR.busyMs(st, 2000) === 12000, 'busy = time left: ' + FR.busyMs(st, 2000));
  ok(FR.slot(st, 20000, 3) === 0 && FR.busyMs(st, 40000) === 0, 'timeline frees itself');
}
// 3. practicals: one merged emissive mesh, no THREE lights, deterministic, exit sign in the entrance room, every theme
for (const id of Object.keys(THEMES).slice(0, 6).concat(['museum', 'academy'])) {
  const mk = () => { const L = generateLayout(4242, id, 1.2); const g = new THREE.Group(); const r = addPracticals({ layout: L, group: g, Y: L.y || 0, def: THEMES[id] || {}, darkCells: new Set() }); return { r, g, L }; };
  const a = mk(), b = mk();
  let lights = 0, meshes = 0; a.g.traverse((o) => { if (o.isLight) lights++; if (o.isMesh) meshes++; });
  ok(lights === 0 && meshes >= 1 && meshes <= 2, `${id}: ${meshes} meshes, ${lights} lights`);
  ok(a.r.count === b.r.count && a.r.count > 3, `${id}: deterministic + non-empty (${a.r.count})`);
}
// 4. source guards: soul palettes blend with the clock, loaner torch slot, hub door count text, docklayout caption, beam is additive + vertex-faded
const rd = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
ok(/palBlend/.test(rd('src/world/environment.js')) && /palBlend/.test(rd('src/game/soul.js')), 'palette blend wired');
ok(/useModule\('loaner', installLoaner\)/.test(rd('src/game/game.js')), 'loaner slot');
ok(/hg\.door_first/.test(rd('src/game/hubgate.js')) && /'\.cd-cap'/.test(rd('src/ui/docklayout.js')), 'hub door text + cd-cap banner');
ok(!/Bahnschrift/.test(rd('src/game/downed.js')) && !/Bahnschrift/.test(rd('src/game/hubgate.js')), 'no Bahnschrift in downed / hubgate');
ok(/AdditiveBlending/.test(rd('src/models/lcmonsters_models.js')) && /FrontSide/.test(rd('src/models/lcmonsters_models.js')), 'keeper beam additive');
ok(/addNext/.test(rd('src/game/horror.js')) && /slot\?\./.test(rd('src/game/mapmods.js')) && /slot\?\./.test(rd('src/game/soul.js')), 'horror split + arrival cards use the slot');
console.log(fail ? `qa1 FAILED ${fail}` : 'qa1: all ok');
process.exit(fail ? 1 : 0);
