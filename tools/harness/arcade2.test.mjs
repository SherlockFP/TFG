// Node test for arcade2 (src/game/arcade2_core.js + the four game simulations of src/minigames/arcade2.js).
//   node tools/harness/arcade2.test.mjs
import * as K from '../../src/game/arcade2_core.js';
import { MAKERS, cabinetGames } from '../../src/minigames/arcade2.js';
import { readFile } from 'node:fs/promises';
import { mulberry32 } from '../../src/minigames/common.js';

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
// The browser registry imports CSS; stub only that registry while executing
// the actual installer and its real core/translation dependencies in Node.
const installerUrl = new URL('../../src/game/arcade2.js', import.meta.url);
const installerSource = (await readFile(installerUrl, 'utf8'))
  .replace("import { MINIGAMES } from '../minigames/index.js';", 'const MINIGAMES = {};')
  .replace(/from '(\.\.?\/[^']+)'/g, (_, path) => `from '${new URL(path, installerUrl).href}'`);
const { installArcade2 } = await import(`data:text/javascript;base64,${Buffer.from(installerSource).toString('base64')}`);

// A brand-new character uses the actual cabinet installer, then hands classic
// back to its native entry point; menu selection must not issue a reward claim.
{
  let opened = 0, classicPlays = 0, captured, done;
  const requests = [];
  const original = () => { classicPlays++; };
  const game = {
    run: { quotaIndex: 0, day: 0 }, profile: { level: 1 }, player: { dead: false },
    mods: { on: () => () => {} },
    net: { on() {}, off() {}, request: (...args) => requests.push(args) },
    startArcade: original,
    openMinigame: (id, opts, callback) => { opened++; captured = { id, opts }; done = callback; },
  };
  const installed = installArcade2(game);
  game.startArcade();
  ok(opened === 1 && captured.id === 'arcade2' && captured.opts.classic, 'q0 lv1 physical cabinet opens all five games');
  eq(cabinetGames(captured.opts.classic), [...K.GAMES, 'classic'], 'classic appears beside all four existing games');
  done({ classic: true });
  ok(classicPlays === 1 && requests.every(([, req]) => req.op === 'sync'), 'classic selection uses native entry without inventing a reward');
  game.player.dead = true;
  game.startArcade(); done({ classic: true });
  ok(opened === 1 && classicPlays === 1, 'death prevents menu entry and delayed classic handoff');
  game.player.dead = false; game.minigame = {};
  game.startArcade();
  ok(opened === 1, 'existing minigame prevents overlapping cabinet sessions');
  installed.dispose();
  ok(game.startArcade === original, 'dispose restores original classic entry');
}

// ---------------------------------------------------------------- boards / prizes / caps
{
  const T0 = 1e12, s = K.newBoards(K.dayKey(T0));
  let r = K.submit(s, { pid: 'a', name: 'Ann', game: 'fish', score: 10 }, T0);
  ok(r.ok && r.best && r.rank === 1 && r.coins === 10 && !r.champ, 'first play pays score/div, rank 1');
  r = K.submit(s, { pid: 'a', name: 'Ann', game: 'fish', score: 30 }, T0 + 5000);
  ok(!r.ok && r.err === 'rate', 'second submission within MIN_PLAY_MS rejected');
  r = K.submit(s, { pid: 'a', name: 'Ann', game: 'fish', score: 30 }, T0 + 20000);
  ok(r.ok && r.champ && r.coins === 30 && r.rows[0].s === 30, 'beating the target flags champ; board keeps the best');
  r = K.submit(s, { pid: 'a', name: 'Ann', game: 'fish', score: 40 }, T0 + 40000);
  ok(r.ok && r.coins === 0, 'daily cap (40 Clout) reached: no more coins');
  r = K.submit(s, { pid: 'a', name: 'Ann', game: 'fish', score: 5 }, T0 + 60000);
  ok(r.ok && !r.best && r.rows.find((x) => x.id === 'a').s === 40, 'a worse play never lowers the board row');
  r = K.submit(s, { pid: 'b', name: 'Bob', game: 'invaders', score: 9999 }, T0);
  ok(!r.ok && r.err === 'range', 'implausible score rejected');
  r = K.submit(s, { pid: 'b', name: 'Bob', game: 'nope', score: 5 }, T0);
  ok(!r.ok && r.err === 'bad', 'unknown game rejected');
  r = K.submit(s, { pid: 'b', name: 'Bob', game: 'fish', score: 50 }, T0);
  eq(r.rows.map((x) => x.n), ['Bob', 'Ann'], 'board sorted, two rows');
  const w = K.wire(s); eq(Object.keys(w.b), K.GAMES, 'wire has every game');
  K.submit(s, { pid: 'c', name: 'Cy', game: 'stack', score: 8 }, T0 + 86400000);
  ok(s.day === K.dayKey(T0) + 1 && s.b.fish.length === 0 && s.paid.a === undefined && s.paid.c === 2, 'new UTC day resets boards + caps');
  eq([K.prizeFor('fish', 999, 0), K.prizeFor('stack', 20, 0), K.prizeFor('invaders', 100, 30), K.prizeFor('cable', 30, 40)], [40, 5, 10, 0], 'prizeFor is capped');
  const P = {}; ok(K.ledgerRoom(P, 5) === K.PRIZE_CAP, 'fresh ledger'); P.arcade2.paid = 15; ok(K.ledgerRoom(P, 5) === 25 && K.ledgerRoom(P, 6) === K.PRIZE_CAP, 'profile ledger room + day reset');
}

// ---------------------------------------------------------------- every game runs, ends, and scores sanely with scripted play
{
  const parts = { spawn() {}, burst() {}, list: [] };
  const mg = { flash() {}, glitch() {}, shake() {} };
  const mk = (id, seed) => MAKERS[id]({ rng: mulberry32(seed), sfx() {}, parts, mg });
  for (const id of K.GAMES) {
    const g = mk(id, 1234 + id.length);
    const ctx = new Proxy({}, { get: (_, k) => (k === 'canvas' ? {} : () => {}), set: () => true });
    let t = 0, n = 0;
    while (!g.over && t < 100) {
      const dt = 1 / 60; t += dt; n++;
      if (id === 'fish' && n % 24 === 0) g.key('Space', true);
      if (id === 'cable' && n % 40 === 0) g.key(['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][(n / 40) % 4], true);
      if (id === 'stack') { if (n % 20 === 0) g.key('ArrowLeft', true); if (n % 50 === 0) g.key('Space', true); }
      if (id === 'invaders') { if (n % 90 === 0) g.key('ArrowRight', n % 180 !== 0); g.key('Space', true); }
      g.update(dt);
      if (n % 30 === 0) g.draw(ctx);
    }
    ok(Number.isFinite(g.score) && g.score >= 0 && g.score <= K.MAX_SCORE[id], `${id}: score ${g.score} within plausibility ceiling`);
    ok(typeof g.info() === 'string', `${id}: info text`);
  }
  // determinism: same seed -> same pipe layout -> same outcome
  const a = mk('fish', 77), b = mk('fish', 77);
  for (let i = 0; i < 400; i++) { if (i % 20 === 0) { a.key('Space', true); b.key('Space', true); } a.update(1 / 60); b.update(1 / 60); }
  ok(a.score === b.score && a.over === b.over, 'fish is deterministic per seed (crew shares the day layout)');
  // the flip: over 60 s of steady flaps gravity must have flipped at least once (banner state is internal; check the fish still lives or dies without throwing)
  const f = mk('fish', 5); let thrown = false; try { for (let i = 0; i < 60 * 30 && !f.over; i++) { if (i % 20 === 0) f.key('Space', true); f.update(1 / 60); } } catch { thrown = true; }
  ok(!thrown, 'fish donation flip runs without errors');
}

console.log(fails ? `arcade2: ${fails} FAIL / ${checks}` : `arcade2: OK (${checks} checks)`);
process.exit(fails ? 1 : 0);
