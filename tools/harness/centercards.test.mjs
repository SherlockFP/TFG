// Node test for the centre-card arbiter.   node tools/harness/centercards.test.mjs
import { createCenterCards } from '../../src/ui/centercards.js';
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } };
const rig = (cfg) => {
  let T = 0, id = 0; const tm = new Map();
  const cc = createCenterCards({ setT: (f, ms) => { tm.set(++id, [T + ms, f]); return id; }, clearT: (h) => tm.delete(h), cfg });
  const adv = (ms) => { const end = T + ms; for (;;) { let b = null; for (const [k, v] of tm) if (v[0] <= end && (!b || v[0] < tm.get(b)[0])) b = k; if (!b) break; const [at, f] = tm.get(b); tm.delete(b); T = at; f(); } T = end; };
  return { cc, adv };
};
const log = [], mk = (name, dones) => (done, o) => { log.push(name + (o.compact ? '*' : '')); dones[name] = done; };

{ // only one at a time; priorities moon > level > ach, FIFO inside a priority
  const { cc, adv } = rig(); const d = {}; log.length = 0;
  cc.request('ach', mk('a1', d));
  cc.request('ach', mk('a2', d)); cc.request('level', mk('L', d)); cc.request('moon', mk('M', d));
  ok(log.join() === 'a1', 'first starts immediately, rest wait: ' + log);
  d.a1(); adv(300);
  ok(log.join() === 'a1,M*', 'moon jumps the queue; compact because 2 wait: ' + log);
  d.M(); adv(300);
  d.L(); adv(300); ok(log.join() === 'a1,M*,L,a2', 'order + last ach alone is full form: ' + log);
  ok(cc.active === 'ach', 'active kind');
}
{ // cinematic hold blocks; released -> queue resumes
  const { cc, adv } = rig(); const d = {}; log.length = 0;
  cc.begin('cine'); cc.request('level', mk('L', d)); adv(5000);
  ok(log.length === 0 && cc.busy(), 'nothing starts under a cinematic');
  cc.end(); adv(300); ok(log.join() === 'L', 'resumes after cinematic');
}
{ // safety guard frees a card that never calls done
  const { cc, adv } = rig({ maxMs: 1000 }); const d = {}; log.length = 0;
  cc.request('moon', mk('M', d)); cc.request('ach', mk('A', d)); adv(1500);
  ok(log.join() === 'M,A', 'guard timeout advances the queue: ' + log);
}
{ // overflow is never lost: shown compact + instant
  const { cc } = rig({ maxQueue: 2 }); let inst = 0; const d = {};
  cc.request('moon', mk('M', d));
  for (let i = 0; i < 4; i++) cc.request('ach', (done, o) => { if (o.instant) inst++; });
  ok(inst === 2 && cc.size === 2, 'overflow items get the instant compact path: ' + inst + '/' + cc.size);
}
{ // done twice is harmless
  const { cc, adv } = rig(); const d = {}; log.length = 0;
  cc.request('ach', mk('a', d)); cc.request('ach', mk('b', d)); d.a(); d.a(); adv(300); ok(log.join() === 'a,b', 'double done ignored');
}
console.log(fails ? fails + ' FAILED' : 'centercards: all ok'); process.exit(fails ? 1 : 0);
