// Node test for landing10 (wave 10): landing sequence ordering + merge rules.   node tools/harness/landing10.test.mjs
import fs from 'node:fs';
import { LandingSeq, CFG, cleanText, dedupeKey } from '../../src/game/landing10_core.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } };
const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// text normalisation
ok(cleanText('  ⚠ CONTESTED   ZONE: x ') === 'CONTESTED ZONE: x', 'leading symbol + whitespace stripped');
ok(dedupeKey('Crew tasks: 1/5') === dedupeKey('CREW TASKS: 0/5'), 'counters fold into one key');

// ordering: nothing is captured before the landing starts / after it is done
const s = new LandingSeq();
ok(!s.add('early', 'info', 0) && !s.holding(), 'idle: nothing captured, nothing held');
ok(s.begin('k1', 0) && s.stage === 'landing' && s.holding(), 'begin -> landing (holds toasts)');
ok(!s.begin('k1', 5), 'same key twice is ignored');
const lines = [['CREW TASKS assigned - finish yours', 'info'], ['Seismic sensors: something heavy', 'info'], ['WEATHER: eclipse', 'warn'], ['Technician kit issued', 'info'],
  ['PRE-FLIGHT CHECK: 2 faults', 'bad'], ['Takeoff blocked: 2 left', 'warn'], ['CONTESTED ZONE: squads', 'warn'], ['Crew tasks: 0/5', 'info'], ['Crew tasks: 1/5', 'info']];
lines.forEach(([m, k], i) => ok(s.add(m, k, 100 + i), 'captured ' + m));
ok(s.tick(500, { phase: 'landing' }) === null && s.stage === 'landing', 'descent: no panel yet');
ok(s.tick(9000, { phase: 'moon', centerBusy: true }) === null && s.stage === 'wait', 'touchdown -> wait');
ok(s.tick(9500, { phase: 'moon', centerBusy: true }) === null, 'title card still up (or settle time): panel waits');
const show = s.tick(9000 + 3000, { phase: 'moon', centerBusy: false });
ok(show && show.type === 'show' && s.stage === 'panel', 'title gone -> panel opens (one card at a time)');

// merge rules: max 5 lines, priority kept, arrival order shown, counter replaced, overflow counted
ok(show.lines.length === CFG.maxLines, 'at most 5 lines');
ok(show.lines.some((l) => l.text.startsWith('PRE-FLIGHT')), 'the bad line always makes the cut');
const crew = show.lines.filter((l) => /^crew tasks:/i.test(l.text));
ok(crew.length <= 1, 'the counter lines merged into one');
ok(!s.lines.some((l) => /0\/5/.test(l.text)), 'the newest counter wins');
ok(show.dropped === s.lines.length - show.lines.length && show.dropped > 0, 'overflow is counted (the rest stays in the chat log)');
const order = show.lines.map((l) => lines.findIndex(([m]) => l.text.startsWith(m.slice(0, 8))));
ok(order.every((v, i) => i === 0 || order[i - 1] <= v), 'shown in arrival order');

// panel lifetime: late line extends (bounded), then it dismisses itself, then the sequence is over and nothing is captured
ok(s.add('Late line', 'info', 12500) && s.tick(12600, { phase: 'moon' })?.type === 'update', 'a late line updates the open panel');
ok(s.tick(12600 + CFG.maxShowMs + 10, { phase: 'moon' })?.type === 'hide' && s.stage === 'done', 'panel dismisses itself');
ok(!s.add('after', 'info', 30000) && !s.holding(), 'after the sequence: normal toasts again');

// no empty card; force-open when another card never leaves; takeoff cancels
const e = new LandingSeq(); e.begin('e', 0); e.tick(10, { phase: 'moon' });
ok(e.tick(CFG.forceMs + 100, { phase: 'moon' }) === null && e.stage === 'done', 'nothing captured -> no empty panel');
const f = new LandingSeq(); f.begin('f', 0); f.tick(10, { phase: 'moon' }); f.add('x', 'info', 20);
ok(f.tick(5000, { phase: 'moon', centerBusy: true }) === null, 'busy: waits');
ok(f.tick(10 + CFG.forceMs + 1, { phase: 'moon', centerBusy: true })?.type === 'show', 'busy forever: opens at the force time');
const g = new LandingSeq(); g.begin('g', 0); g.add('y', 'info', 1);
ok(g.tick(100, { phase: 'takeoff' }) === null && !g.holding(), 'leaving the moon cancels');
const d = new LandingSeq(); d.begin('d', 0, true); d.add('z', 'info', 1);
ok(d.tick(2000, { phase: 'moon', dead: true }) === null && d.stage === 'done', 'a dead player gets no card');
ok(new LandingSeq().begin('h', 0, true), 'a late joiner (already touched down) starts in wait');

// hooks are wired
const ui = rd('src/ui/ui.js');
ok(/landHook\?\.capture\(text, kind\)/.test(ui) && /landHook\?\.hold\(\)/.test(ui), 'ui.js: systemMessage + fullscreenOpen hooks');
ok(/:scope > \.lcase-cine/.test(ui), 'ui.js: clearCinematics also removes the case card');
ok(/\['\.l10-brief', 0\]/.test(rd('src/ui/docklayout.js')), 'docklayout stacks the panel');
ok(/installLanding10/.test(rd('src/game/game.js')), 'game.js installs the module');

console.log(fails ? `landing10: ${fails} FAILED` : 'landing10: all ok');
process.exit(fails ? 1 : 0);
