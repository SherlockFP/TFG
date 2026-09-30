// node tools/harness/algoctx.test.mjs - wave 8 morning (docs/wave8/algoctx.md): context-true Algorithm lines, one viewer count, dev-language sweep.
import fs from 'node:fs';
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
const OG = await import('../../src/game/onegoal_core.js');
const K = await import('../../src/game/algo1_core.js');
const src = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

// ---- pure rules
const orbit = OG.ctxTags({ phase: 'orbit', inShip: true }), yard = OG.ctxTags({ phase: 'moon', inShip: false, indoor: false });
const fac = OG.ctxTags({ phase: 'moon', indoor: true }), exp = OG.ctxTags({ phase: 'moon', expedition: true });
ok(orbit.has('orbit') && orbit.has('ship') && !orbit.has('moon'), 'orbit tags');
ok(yard.has('outdoor') && yard.has('moon') && !yard.has('ship') && fac.has('facility') && !fac.has('outdoor') && exp.has('expedition'), 'moon tags');
ok(OG.ctxOk(undefined, yard) && OG.ctxOk('any', fac) && OG.ctxOk(['ship', 'orbit'], orbit) && !OG.ctxOk(['ship', 'orbit'], yard) && !OG.ctxOk('orbit', fac), 'ctxOk');
ok(JSON.stringify(OG.inferCtx({ text: 'HR: Congratulations on your employment.' })) === '"orbit"', 'HR lines: orbit only');
ok(OG.inferCtx({ text: "The terminal shows today's routes." }).includes('ship') && OG.inferCtx({ key: 'brief_noise' }) === 'moon' && OG.inferCtx({ text: 'Run.' }) === 'any' && OG.inferCtx({ ctx: 'moon', text: 'HR: x' }) === 'moon', 'inferCtx: terminal / key / explicit wins');
let q = OG.enqueue([], { text: 'terminal', ctx: ['ship', 'orbit'], exp: 30 });
q = OG.enqueue(q, { text: 'any', exp: 30 }); q = OG.enqueue(q, { text: 'old', exp: 5 });
ok(OG.prune(q, 4, orbit).length === 3 && OG.prune(q, 6, orbit).length === 2, 'expiry drops old lines');
ok(OG.prune(q, 6, yard).map((x) => x.text).join() === 'any', 'a line queued in orbit is gone after landing');
ok(OG.ttlOf({}) === OG.QUEUE_TTL && OG.ttlOf({ ttl: 5 }) === 5, 'default ttl');

// ---- the ticker itself (node: no DOM, so only the queue is exercised)
const { installAlgorithm } = await import('../../src/game/algorithm.js');
const game = { run: { phase: 'orbit', day: 1, runId: 'r' }, player: { inShip: true, indoor: false }, isHost: false, settings: {}, ui: {}, playerName: () => 'X', later: () => {} };
const algo = installAlgorithm({ game, broadcast() {}, emit() {}, get day() { return null; }, clock: 0 });
algo.show({ text: "The terminal shows today's routes. Yours is set." });
algo.show({ text: 'HR: Take contracts from the board.' });
algo.show({ text: 'Something for anywhere, quite unrelated wording here.' });
ok(algo.state.q.length === 3, 'in orbit all three are queued');
game.run.phase = 'moon'; game.player.inShip = false; game.player.indoor = true;
algo.update(0.1);
ok(algo.state.q.length === 0 || algo.state.q.every((x) => x.ctx === undefined || x.ctx === 'any'), 'after landing the terminal / HR lines are dropped');
algo.show({ text: "The terminal shows the routes again, once more." });
algo.show({ text: 'HR: Reminder: the door is on the moon.' });
ok(algo.state.q.every((x) => !/terminal|HR:/.test(x.text)), 'not even queued on a moon');
game.run.phase = 'orbit'; game.player.inShip = true; algo.state.q = [];
algo.show({ text: 'A line that will expire while it waits here.' });
algo.state.t += 13; algo.update(0);
ok(algo.state.q.length === 0, 'a line older than ~12 s in the queue expires');
algo.dispose();

// ---- one viewer count
const v = K.newViewers(); K.seedViewers(v, 1470);
ok(v.n === 1470 && v.floor === 882, 'seed = the overlay count, floor 60 %');
K.decayViewers(v, 1e6); ok(Math.abs(v.n - 882) < 1, 'decays to the floor, not to 120');
let changes = 0, last = v.n;
for (let i = 0; i < 150; i++) { K.driftViewers(v, 2, (i * 0.37) % 1); const r = Math.round(v.n); if (r !== last) { changes++; last = r; } }
ok(changes >= 5 && v.n >= v.floor, 'the count keeps moving (>= 5 changes in 5 min) and never falls below the floor');
ok(OG.fmtLive(1470) === '1,470' && OG.fmtLive(120) === '120' && OG.fmtLive(23000) === '23K', 'one number format');
ok(src('src/game/onboard.js').includes('seedViewers') && src('src/game/algo1.js').includes('seedViewers'), 'overlay hands its count to algo1');

// ---- dev-language sweep (source contracts)
ok(!/TUT_START_SAY/.test(src('src/game/guide.js')), 'the "Optional onboarding started" line is gone');
ok(/controlsPinned/.test(src('src/game/guide.js')) && /controlsPinned/.test(src('src/game/onboard.js')), 'no WASD line after the stream pinned the controls');
ok(!/systemMessage\?\.\(tf\('\{by\} revived/.test(src('src/game/downed.js')), 'one revive message (toast only)');
ok(/DEV_NAME_ALIAS/.test(src('src/main.js')), 'Host / Client / Tester never reach the screen');
const loot = src('public/mods/ship-loot-tracker.js');
ok(!/sell today @|SHIP LOOT|need ▮/.test(loot) && !/quota ▮\$\{sold\}/.test(loot), 'loot panel: plain language, quota numbers only in the top bar');

console.log(bad ? `${bad} FAILED of ${n}` : `algoctx: all ${n} checks passed`);
process.exit(bad ? 1 : 0);
