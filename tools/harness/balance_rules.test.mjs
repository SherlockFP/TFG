// Node tests for the wave 8 balance rules (src/game/balance_rules.js + the creature table). node tools/harness/balance_rules.test.mjs
globalThis.window = globalThis;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const R = await import('../../src/game/balance_rules.js');
const C = await import('../../src/game/creatures.js');
const K = await import('../../src/game/balance_core.js');
const D = await import('../../src/game/difficulty.js');
for (const [m, f] of [['horror_creatures', 'registerHorrorCreatures'], ['maps5_creatures', 'registerMaps5Creatures'], ['mirror_creatures', 'registerMirrorCreatures'],
  ['worlds2_creatures', 'registerWorlds2Creatures'], ['creatures_backrooms', 'registerBackroomsCreatures'], ['skeletons', 'registerSkeletonContent'], ['stealth', 'registerStealthContent']]) {
  try { (await import(`../../src/game/${m}.js`))[f](); } catch (e) { console.log('note: could not register', m, e.message.slice(0, 60)); }
}

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };

// hit cap: 45 % / 60 % / 85 %; only allowlisted hazards may kill in one hit, and only from quota 4
ok(R.capOne(999, 0) === 45 && R.capOne(999, 1) === 45 && R.capOne(999, 2) === 60 && R.capOne(999, 3) === 60 && R.capOne(999, 4) === 85 && R.capOne(999, 20) === 85, 'cap table 45/60/85');
ok(R.capOne(999, 3, true) === 60 && R.capOne(999, 4, true) === 999, 'instakill hazards are capped before quota 4 only');
ok(K.capHit(70, 4) === 70 && K.capHit(90, 4) === 85, 'balance_core.capHit delegates to the rules');
ok(['jester', 'sandkefal', 'mimicdoor', 'mine'].every((t) => R.isInstakillOk(t)) && !R.isInstakillOk('lurker') && !R.isInstakillOk('giant'), 'allowlist');

// table: no non-boss creature (core table + every registered module) has a one-shot base number unless allowlisted
const bad = Object.entries(C.CREATURES).filter(([id, d]) => !d.boss && !R.isInstakillOk(id, d) && (d.dmg || 0) > R.RULES.safeDmg);
ok(bad.length === 0, 'no unallowlisted def above 90 dmg: ' + bad.map((b) => b[0]));
ok(C.CREATURES.lurker.dmg === 70 && C.CREATURES.giant.dmg === 85 && C.CREATURES.stalker.dmg === 70, 'lurker / giant / stalker no longer 999');
const reg = C.registerCreature('zz_test', { name: 'zz', dmg: 999 });
ok(reg.dmg === 90 && reg.dmgWas === 999, 'registerCreature clamps 999 to 90');
ok(C.registerCreature('jester2', { name: 'j', dmg: 999, instakill: true }).dmg === 999, 'def.instakill opts out');

// wind-up gate
const P = (o) => R.planAttack({ now: 10, state: 'attack', t: 0, cause: 'crawler', ...o });
ok(P({}).act === 'delay' && Math.abs(P({}).wait - 0.4) < 1e-9, 'fresh attack state waits 0.4 s');
ok(P({ t: 0.5 }).act === 'now', 'a tell that already ran 0.5 s lands at once');
ok(P({ state: 'run', t: 5 }).act === 'delay', 'a chase state is not a tell');
ok(P({ pending: true }).act === 'skip' && P({ last: 9.8 }).act === 'skip' && P({ last: 9 }).act === 'delay', 'repeat calls inside 0.45 s are dropped');
ok(P({ boss: true }).act === 'now' && P({ cause: 'sludge' }).act === 'now', 'bosses and DoT ticks are not delayed');
ok(P({ cause: 'giant', freed: true }).act === 'skip' && P({ cause: 'crawler', freed: true }).act === 'delay', 'a freed player is immune to grab damage only');

// holds: end after 3.2 s, then 4 s of immunity; a break request frees at once
const B = new R.HoldBook();
let n = 0; for (let t = 0; t < 5; t += 0.1) if (B.touch('a', t)) n++;
ok(n >= 31 && n <= 34, 'hold lasts ~3.2 s, got ' + n + ' ticks');
ok(B.isFree('a', 4) && !B.isFree('a', 7.5) && B.touch('a', 7.6), 'immunity ~4 s, then holdable again');
B.touch('b', 0); ok(B.held('b', 0.5), 'held'); B.free('b', 0.5); ok(!B.touch('b', 1), 'mash frees at once');

// difficulty: creature damage +10 % on Hard from quota 3, otherwise x1
ok(R.modeDmgMul(3, 'standard') === 1 && R.modeDmgMul(3, 'hard') === 1.1 && R.modeDmgMul(1, 'hard') === 1 && R.modeDmgMul(5, 'casual') === 1 && D.TABLE.hard.dmgMul === 1.1, 'hardmode dmgMul');

// glue with a fake game: hit lands after the wind-up, a dodge whiffs, a stun cancels
const timers = [];
const hits = [];
const M = { host: new Map(), attack: (c, p, dmg, cause, late) => { if (!late && game.balRules.gate(M, c, p, dmg, cause)) return; hits.push(dmg); } };
const game = { isHost: true, time: 100, mods: { on: () => () => {} }, later: (fn, ms) => timers.push([fn, ms]), hostHoldPlayer() {} };
game.balRules = R.installBalanceRules(game);
const mk = (o = {}) => { const c = { id: 'c' + M.host.size, type: 'crawler', state: 'attack', t: 0, pos: { x: 0, z: 0 }, dead: false, stunT: 0, def: {}, ...o }; M.host.set(c.id, c); return c; };
const pl = () => ({ id: 'p', dead: false, pos: { x: 1, z: 0 } });
let c = mk(), p = pl(); M.attack(c, p, 40, 'crawler');
ok(hits.length === 0 && timers.length === 1 && timers[0][1] >= 399, 'gate defers the hit by 0.4 s');
timers.shift()[0](); ok(hits.length === 1 && hits[0] === 40, 'hit lands after the wind-up');
c = mk(); p = pl(); M.attack(c, p, 40, 'crawler'); p.pos.x = 5; timers.shift()[0](); ok(hits.length === 1, 'stepping away during the tell dodges');
c = mk(); p = pl(); M.attack(c, p, 40, 'crawler'); c.stunT = 1; timers.shift()[0](); ok(hits.length === 1, 'a stunned creature does not swing');
game.balRules.dispose();

// C32's safety limit belongs after the native host's sector/difficulty scaling.
const { hostMethods } = await import('../../src/game/host.js');
const delivered = [];
const capGame = {
  creatures: { host: new Map([
    ['quiet', { type: 'c32_dormant' }], ['ram', { type: 'c32_ram' }], ['base', { type: 'crawler' }],
  ]) },
  balance: { hitDamage: () => 80 },
  net: { sendTo: (id, kind, row) => delivered.push({ id, kind, row }) },
};
for (const source of ['quiet', 'ram', 'base']) hostMethods.hostHurtPlayer.call(capGame, 'crew', 22, 'creature', source);
hostMethods.hostHurtPlayer.call(capGame, 'crew', 999, 'left');
ok(delivered[0].row.dmg === 35 && delivered[1].row.dmg === 35, 'both original C32 threats cap after upstream damage scaling');
ok(delivered[2].row.dmg === 80 && delivered[3].row.dmg === 999, 'other creature and environment damage retain native contracts');
ok(delivered.every(x => x.id === 'crew' && x.kind === 'hurt'), 'cap retains the real host hurt delivery path');

console.log(fails ? `${fails} FAILED of ${checks}` : `balance_rules: all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
