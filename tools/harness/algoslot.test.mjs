// Node test for algoslot (wave 9): ONE Algorithm slot, ONE viewer number, quota/credits/route off the top bar.   node tools/harness/algoslot.test.mjs
import fs from 'node:fs';
import * as OG from '../../src/game/onegoal_core.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } };
const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// ---- pure rules
ok(OG.liveText(1470) === '● LIVE 1,470' && OG.liveText(12500) === '● LIVE 13K', 'liveText uses the one format');
ok(OG.liveDeltaText(300) === '+300' && OG.liveDeltaText(0) === '' && OG.liveDeltaText(-5) === '', 'delta pop');
ok(OG.calmDrop({ key: 'orbit_idle' }) && !OG.calmDrop({ key: 'orbit_idle' }, true) && !OG.calmDrop({ key: 'death' }) && !OG.calmDrop({ text: 'x' }), 'idle chatter dropped while calm');
ok(OG.reactKey('onair', 100, 0.1) === 'tagged' && OG.reactKey('death', 100, 0.1) === 'downed', 'events map to a reaction');
ok(OG.reactKey('onair', 10, 0.1) === null && OG.reactKey('onair', 100, 0.9) === null && OG.reactKey('vote', 100, 0.1) === null, 'reactions are rare');

// ---- ONE slot: the subtitle has no face / pink box / LIVE label of its own
const alg = rd('src/game/algorithm.js');
ok(!/algo-face|algo-who|<canvas/.test(alg.split('export function installAlgorithm')[1]), 'subtitle: no face card, no who/live header');
ok(!/linear-gradient\(90deg,rgba\(12,4,10/.test(alg) && !/border:1px solid rgba\(255,61,127/.test(alg), 'subtitle: no pink box');
ok(/-webkit-line-clamp:2/.test(alg), 'subtitle: max 2 lines');
ok(/OG\.calmDrop/.test(alg), 'subtitle: calm chatter gate');

// ---- ONE viewer number: only algoslot creates the strip; algo1 paints it; the report reads the same count
const slot = rd('src/game/algoslot.js'), a1 = rd('src/game/algo1.js');
ok((slot.match(/class="algo-live"/g) || []).length === 1 && !/class="algo-live"/.test(alg), 'exactly one LIVE element is built');
ok(/liveText\(S\.viewers\.n\)/.test(a1) && /game\.algo1\?\.viewers/.test(slot), 'strip + report use algo1 viewers');
ok(/'daySummary'/.test(slot) && /LIVE peak/.test(slot), 'report shows the same number (peak)');
ok(/installAlgoSlot/.test(rd('src/game/game.js')), 'module installed');

// ---- QUOTA / CREDITS / ROUTE left the top bar
const hud = rd('src/ui/hud.js'), term = rd('src/game/terminal.js'), calm = rd('src/game/hudcalm.js');
ok(!/t\('CREDITS'\)|t\('ROUTE'\)/.test(hud), 'hud.js: no CREDITS / ROUTE in the top bar');
ok(/t\('CREDITS'\)/.test(term) && /t\('ROUTE'\)/.test(term) && /term-head/.test(term), 'terminal header carries quota / credits / route');
ok(/t\('CREDITS'\)/.test(calm) && /t\('ROUTE'\)/.test(calm), 'Tab card carries credits / route');

if (fails) { console.error(fails + ' failed'); process.exit(1); }
console.log('algoslot ok');
