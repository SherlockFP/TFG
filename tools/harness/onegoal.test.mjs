// node tools/harness/onegoal.test.mjs - wave 8 night "one goal" (docs/wave8/onegoal.md): priority resolver, message pacing for every profile,
// no waves / kill-count assignments before quota 3, the TUTORIAL 1/7 fix, and the one-line hooks in the owning modules.
import fs from 'node:fs';
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
const OG = await import('../../src/game/onegoal_core.js');
const { Emitter } = await import('../../src/core/events.js');
const K = await import('../../src/game/crdirector_core.js');
const C = await import('../../src/game/guide_core.js');

// ---- the arrival soup (REVIEW_W8_NIGHT: swarm wave + "Take down 2" + TUTORIAL 1/7 + job + quota line) -> ONE goal
const L = (text, kind, o = {}) => ({ text, kind, done: false, ...o });
const soup = [
  L('Bring scrap', 'main', { src: 'core' }),
  L('Find the facility entrance', 'sub', { src: 'core', first: true }),
  L('Scan', 'hint', { src: 'core' }),
  L('TUTORIAL 1/7: Move', 'main', { src: 'guide', pin: true }),
  L('Job: fix the relay', 'main', { src: 'facjobs' }),
  L('Assignment: Take down 2 creatures', 'sub', { cat: 'job' }),
  L('Nearby lead', 'sub', { src: 'core', cat: 'other' }),
];
let r = OG.resolve(soup);
ok(r.length === 1 && r[0].text === 'Find the facility entrance', 'arrival: one goal = the entrance ' + r.map((l) => l.text));
ok(OG.sortAll(soup).length === soup.length, 'the Tab card keeps every line');
ok(OG.resolve(soup.filter((l) => !l.first))[0].text === 'Bring scrap', 'inside: the loot line beats job / tutorial / assignment');
// a warning + the goal, never two warnings
r = OG.resolve([...soup, L('Survive the swarm: wave 1/3', 'warn', { src: 'horde' }), L('THE SHIP LEAVES AT MIDNIGHT', 'warn', { src: 'core' })]);
ok(r.length === 2 && r[0].kind === 'warn' && r[1].kind !== 'warn', 'one warning + one goal');
ok(OG.resolve([...soup, L('x', 'warn')], 1).length === 1, 'minimal = one line');
// the day's scrap target met -> the job takes the slot; TAGGED (escape) beats loot
const doneLoot = soup.filter((l) => !l.first).map((l) => (l.text === 'Bring scrap' ? { ...l, done: true } : l));
ok(OG.resolve(doneLoot)[0].text === 'Job: fix the relay', 'target met: the job is next');
ok(OG.resolve([...soup, L('TAGGED: get to the ship', 'main', { cat: 'escape', lead: true })])[0].text.startsWith('TAGGED'), 'TAGGED = escape beats loot');
ok(OG.resolve([L('Carrying 2 items', 'sub', { src: 'core', lead: true }), L('Bring scrap', 'main', { src: 'core' })])[0].text === 'Carrying 2 items', 'loot in hand leads');
ok(OG.resolve([L('only a hint', 'hint')])[0]?.text === 'only a hint', 'a hint when nothing else');
ok(OG.catOf(L('TUTORIAL 1/7', 'main', { src: 'guide', pin: true })) === 'teach' && OG.catOf(L('x', 'main', { src: 'backrooms' })) === 'escape', 'categories');
ok(OG.resolve([]).length === 0, 'empty');

// ---- pacing for every profile
ok(OG.algoOk({ nowMs: 1000, lastMs: 0 }) && !OG.algoOk({ nowMs: 20000, lastMs: 1000 }) && OG.algoOk({ nowMs: 46001, lastMs: 1000 }), '1 line / 45 s');
ok(OG.algoOk({ nowMs: 2000, lastMs: 1000, pri: true }), 'teaching lines pass the gap');
ok(!OG.algoOk({ nowMs: 99000, lastMs: 1000, peak: true }) && !OG.algoOk({ nowMs: 99000, lastMs: 1000, chase: 0.8 }), 'quiet at a peak / in a chase');
ok(OG.algoOk({ nowMs: 2000, lastMs: 1000, chatty: true, peak: true }), 'Chatty Algorithm = the old flood');

// ---- module: tagged emit + the TAGGED line + lease
globalThis.performance ??= { now: () => Date.now() };
const mods = new Emitter();
const game = { mods, selfId: 'me', settings: {}, run: { phase: 'moon', fc: { p: { me: [80, 1, 1] } } }, player: { pos: { x: 30, z: 40 }, dead: false, inShip: false } };
const h1 = (add) => add('Job line', 'main'); h1._src = 'facjobs'; mods.on('objectives', h1);
mods.on('objectives', (add) => add('mod line', 'sub'));
const { installOneGoal } = await import('../../src/game/onegoal.js');
const api = installOneGoal(game);
const out = []; const add = (text, kind) => { const o = { text, kind }; out.push(o); return o; };
api.emit(add, game, 'moon');
ok(out.find((l) => l.text === 'Job line')?.src === 'facjobs' && out.find((l) => l.text === 'mod line')?.src === 'mod', 'lines tagged with their source');
const tag = out.find((l) => /TAGGED/.test(l.text));
ok(tag && tag.cat === 'escape' && /50 m/.test(tag.text), 'TAGGED line with the distance to the ship');
ok(api.shown([...out, L('Bring scrap', 'main', { src: 'core' })], 'standard')[0] === tag, 'TAGGED is the goal');
ok(api.lease('card', 4, 2) && !api.lease('caption', 6, 1) && api.lease('hub', 4, 3), 'one card at a time for veterans');
game.settings.chattyAlgo = true; ok(api.lease('caption', 6, 1), 'chatty: cards may stack');
api.dispose();

// ---- no waves / kill-count before quota 3
ok(!K.wavesAllowed(0) && !K.wavesAllowed(2) && K.wavesAllowed(3), 'waves only after quota 3');

// ---- TUTORIAL 1/7 advances: walking 40 m completes "move" without a crouch; Hiring Day credits its steps
const g = { tut: { s: 'run', done: {}, prog: {}, said: {} } };
for (let i = 0; i < 17; i++) C.tutEvent(g, 'move', { d: 2.5 });
ok(!!g.tut.done.move, 'move completes by distance alone');
const cr = C.tutCredit(g, ['light', 'scrap', 'nope']);
ok(cr.steps.join() === 'light,scrap' && C.tutCurrent(g)?.id === 'inv', 'Hiring Day credit -> the tutorial moves on');

// ---- one-line hooks in the owning modules
const src = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const need = [['src/game/game.js', "useModule('onegoal'"], ['src/game/game.js', "f._src = name"], ['src/game/objectives.js', 'onegoal.emit'], ['src/game/objectives.js', 'og.shown'],
  ['src/game/horde.js', 'wavesAllowed(sector())'], ['src/game/siege.js', 'wavesAllowed(run.quotaIndex)'], ['src/game/contracts.js', "type === 'cleanup' && !step && q < 3"],
  ['public/mods/employee-assignments.js', 'if ((ctx.qi | 0) < 3) return null'], ['src/game/onboard.js', 'onegoal?.algoOk'], ['src/game/onboard.js', 'onegoal?.lease'],
  ['src/game/crdirector.js', 'peakNow()'], ['src/game/guide.js', 'tutCredit(g'], ['src/ui/ui.js', "'chattyAlgo'"]];
for (const [f, s] of need) ok(src(f).includes(s), `${f} has ${s}`);

console.log(bad ? `onegoal: ${bad} FAIL / ${n}` : `onegoal: all ${n} checks pass`);
process.exit(bad ? 1 : 0);
