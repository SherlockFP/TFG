// wave8 perf4 node test: landing job queue + sliced emit.  node tools/harness/landingq.test.mjs   (LANDBENCH=1 also prints node build-step timings)
import fs from 'fs';
import { LandingQueue } from '../../src/game/landingq.js';
import { Emitter } from '../../src/core/events.js';

let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
let clock = 0; const now = () => clock;

// order + budget: 6 jobs of 5 ms, budget 8 -> two per tick (a job always runs), same order as queued
{
  const q = new LandingQueue({ budgetMs: 8, startDelay: 0.05, now }); const out = [];
  for (let i = 0; i < 6; i++) q.add('j' + i, () => { out.push(i); clock += 5; });
  q.tick(0.016); ok(out.length === 0, 'start delay holds the first frames');
  for (let i = 0; i < 4; i++) q.tick(0.016); ok(out.length === 2 && out.join() === '0,1', 'two jobs in the first slice: ' + out);
  q.tick(0.016); ok(out.join() === '0,1,2,3', 'next slice continues in order');
  ok(q.pending === 2, 'pending count');
  q.flush(); ok(out.join() === '0,1,2,3,4,5' && q.pending === 0, 'flush drains in order');
  ok(q.last.length === 6 && q.report()[0].ms === 5 && q.totalMs === 30, 'timings recorded');
}
// slow frames get a bigger slice (progress guaranteed on weak GPUs)
{
  const q = new LandingQueue({ budgetMs: 8, startDelay: 0, now }); let n = 0;
  for (let i = 0; i < 20; i++) q.add('s' + i, () => { n++; clock += 5; });
  q.tick(0.25); ok(n > 2, 'slow frame runs more jobs (' + n + ')');
}
// clear drops jobs; a throwing job does not stop the rest; jobs added by jobs run after
{
  const q = new LandingQueue({ startDelay: 0, now }); const out = [];
  q.add('a', () => { out.push('a'); q.add('c', () => out.push('c')); }); q.add('bad', () => { throw new Error('x'); }); q.add('b', () => out.push('b'));
  const w = console.warn; console.warn = () => {}; q.flush(); console.warn = w;
  ok(out.join() === 'a,b,c', 'error isolated, nested job appended: ' + out);
  q.add('z', () => out.push('z')); q.clear(); q.flush(); ok(!out.includes('z') && q.pending === 0, 'clear drops pending jobs');
}
// emitSliced: same handlers + order as emit, removed handler skipped, tagged by registering module
{
  const e = new Emitter(); const a = [], b = [];
  e.on('mapLoaded', () => a.push(1)); const off2 = e.on('mapLoaded', () => a.push(2)); e.on('mapLoaded', (w) => a.push(w));
  e.emit('mapLoaded', 3);
  const jobs = []; e.emitSliced('mapLoaded', [3], (n, f) => jobs.push([n, f]));
  ok(jobs.length === 3, 'one job per handler');
  off2(); for (const [, f] of jobs) f();
  ok(a.join() === '1,2,3,1,3', 'sliced == emit order, removed handler skipped: ' + a);
  ok(jobs.every(([n]) => n.startsWith('mapLoaded:')) && /landingq\.test/.test(jobs[0][0]), 'job named after the registering file: ' + jobs[0][0]);
  e.emitSliced('nothing', [], () => b.push('bad')); ok(b.length === 0, 'unknown event: no jobs');
}
// Nyquist clamp source: no raw midiToFreq()*2 / f*mul oscillator value left in instruments.js
{
  const src = fs.readFileSync(new URL('../../src/audio/instruments.js', import.meta.url), 'utf8');
  ok(/frequency\.value = fq\(midiToFreq\(midi\) \* 2\)/.test(src) && /frequency\.value = fq\(f \* mul\)/.test(src), 'instruments clamp osc frequency below Nyquist');
}
// optional: real build-step timings (stub physics)
if (process.env.LANDBENCH) {
  const { generateLayout, buildFacility } = await import('../../src/world/facility.js');
  const { buildMoonOutdoor } = await import('../../src/world/terrain.js');
  const { MOONS } = await import('../../src/game/moons.js');
  const physics = new Proxy({}, { get: () => () => ({ handle: 1 }) }), lightPool = { add() {}, remove() {}, emitters: new Set() };
  const w = console.warn; console.warn = () => {};
  for (const id of ['hamsi', 'cipura']) {
    const m = MOONS[id]; const t0 = performance.now(); buildMoonOutdoor(7, m, { physics, lightPool }); const t1 = performance.now();
    const L = generateLayout(7, m.interior, m.size, m.layoutOpts); const t2 = performance.now(); buildFacility(L, { physics, lightPool }); const t3 = performance.now();
    console.log(`bench ${id}: outdoor ${(t1 - t0).toFixed(0)} ms, layout ${(t2 - t1).toFixed(0)} ms, facility ${(t3 - t2).toFixed(0)} ms`);
  }
  console.warn = w;
}
console.log(fail ? `landingq: ${fail} FAILED` : 'landingq: all ok');
process.exit(fail ? 1 : 0);
