// Node tests for wave 8 "downed" (src/game/downed.js): pure rules + the glue on a stub game. node tools/harness/downed.test.mjs
globalThis.window = globalThis;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const D = await import('../../src/game/downed.js');
const Diff = await import('../../src/game/difficulty.js');
const BR = await import('../../src/game/balance_rules.js');
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
const R = D.RULES;

// rules
ok(D.bleedSecs('standard') === 20 && D.bleedSecs('casual') === 30 && D.bleedSecs('hard') === 0, 'bleed 20 / 30 / off');
ok(D.shouldDown('standard', 'lurker', 40, 60) && !D.shouldDown('standard', 'lurker', 100, 60), 'lethal hit downs, non-lethal does not');
ok(!D.shouldDown('hard', 'lurker', 10, 999) && !D.shouldDown('standard', 'void', 10, 999) && !D.shouldDown('standard', 'left', 10, 999), 'Hard + void/left keep the old death');
ok(D.shouldDown('casual', 'jester', 10, 999) && R.reviveS === 3 && R.reviveHp === 0.3 && R.repeatWin === 60 && R.repeatMul === 0.5, 'numbers');
// balance: the instakill allowlist only counts on Hard
ok(BR.instakillHere('jester', null, 'hard') && !BR.instakillHere('jester', null, 'standard') && !BR.instakillHere('jester', null, 'casual') && !BR.instakillHere('lurker', null, 'hard'), 'instakill allowlist = Hard only');

// host book
let B = new D.DownBook(), e = B.down('a', 0, 'standard', [0, 0, 0], 'lurker');
ok(e && e.dur === 20 && !e.fast && B.down('a', 1, 'standard', [0, 0, 0], 'x') === null, 'down once');
ok(new D.DownBook().down('h', 0, 'hard', [0, 0, 0], 'x') === null, 'Hard: refused');
ok(B.hold('a', 'b', 1, 1) && B.hold('a', 'b', 1.2, 1).prog > 0.29 && B.hold('a', 'b', 1.4, 20) === null, 'reviver must be in range');
B = new D.DownBook(); B.down('a', 0, 'standard', [0, 0, 0], 'x');
let t = 0, r; for (; t < 5; t += 0.2) { r = B.hold('a', 'b', t, 1); if (r?.done) break; }
ok(r?.done && t >= 2.7 && t <= 3.3 && !B.e.has('a'), '3 s hold revives, got t=' + t.toFixed(2));
B = new D.DownBook(); B.down('a', 0, 'standard', [0, 0, 0], 'x'); B.hold('a', 'b', 1, 1); B.hold('a', 'b', 1.3, 1);
ok(B.hold('a', 'c', 1.4, 1) === null, 'one reviver at a time');
B.stop('a', 'b'); ok(B.e.get('a').prog === 0, 'a hit reviver resets progress');
B.hold('a', 'b', 2, 1); B.hold('a', 'b', 2.3, 1); const l0 = B.e.get('a').left; B.tick(0.2, 2.35);
ok(B.e.get('a').left === l0, 'bleeding pauses while held');
B.tick(0.5, 5); ok(B.e.get('a').by === null && B.e.get('a').left < l0, 'let go: bleeding resumes');
B = new D.DownBook(); B.down('a', 0, 'standard', [0, 0, 0], 'x'); const dead = []; for (let s = 0; s < 21; s += 0.1) dead.push(...B.tick(0.1, s));
ok(dead.length === 1 && dead[0].id === 'a', 'bleeds out after ~20 s');
const e2 = B.down('a', 30, 'standard', [0, 0, 0], 'x'); ok(e2.fast && e2.dur === 10, 'second down within 60 s: 10 s');
B.clear('a'); ok(B.down('a', 100, 'standard', [0, 0, 0], 'x').dur === 20, 'after 60 s: normal again');
ok(B.down('c', 0, 'casual', [0, 0, 0], 'x').dur === 30, 'Casual 30 s');

// glue on a stub game
const { installDowned } = D;
const L = {}, sent = [], reqs = [];
const mods = { on(ev, fn) { (L[ev] ||= []).push(fn); return () => { L[ev] = L[ev].filter((f) => f !== fn); }; }, emit(ev, ...a) { for (const f of [...(L[ev] || [])]) f(...a); } };
const nets = {};
const net = { hostId: 'me', on(t2, fn) { nets[t2] = fn; }, off() {}, send(t2, d) { sent.push([t2, d]); }, request(a, d) { reqs.push([a, d]); }, broadcast(t2, d) { sent.push([t2, d]); nets['msg:' + t2]?.(d, 'me'); } };
const items = [];
const game = {
  isHost: false, selfId: 'me', net, mods, godMode: false, config: {}, remotes: new Map([['b', { id: 'b', dead: false, flags: 0, pos: { x: 0, y: 0, z: 0 } }]]),
  player: { hp: 30, maxHp: 100, dead: false, downed: false, pos: { x: 1, y: 0, z: 2, toArray() { return [1, 0, 2]; } } },
  items: { all: () => items }, engine: { hurt() {}, flash() {}, setLowHealth() {} }, ui: { toast() {}, systemMessage() {} }, sfx() {}, audio: {}, time: 0,
  playerName: (id) => id, aiPlayers() { return [{ id: 'me', dead: false }, { id: 'b', dead: false }]; },
  hasPerk: () => false, damageLocal(dmg) { game.player.hp -= dmg; game.origHit = (game.origHit || 0) + 1; if (game.player.hp <= 0) game.died = true; },
  localActions() { game.acted = true; }, die(c) { game.died = c; },
};
const api = installDowned(game);
mods.emit('netReady', net, game);
Diff.setMode('standard');
game.damageLocal(50, 'lurker', null);
ok(game.player.downed && game.player.hp === 1 && !game.died && !game.origHit, 'lethal hit -> DOWNED, not dead');
ok(reqs.some((q) => q[0] === 'dnreq' && q[1].k === 'down' && q[1].c === 'lurker'), 'host told');
game.damageLocal(40, 'hound', null); ok(game.player.hp === 1 && !game.died && game.player.downed, 'downed player ignores hits');
game.localActions(0.1, {}); ok(!game.acted, 'no item / interact actions while down');
nets['msg:dn']({ k: 'on', id: 'me', dur: 20, p: [0, 0, 0], c: 'lurker' }, 'me');
ok(api.isDowned() && api.isDowned('me'), 'host confirmed');
const ev = []; mods.on('tfg:revived', (d) => ev.push(d));
nets['msg:dn']({ k: 'up', id: 'me', by: 'b', hp: 0.3 }, 'me');
ok(!game.player.downed && game.player.hp === 30 && ev.length === 1 && ev[0].by === 'b', 'revived at 30 %, event fired');
// true death: giant / void keep the old flow
game.player.hp = 10; game.origHit = 0; game.damageLocal(50, 'giant', null); ok(game.origHit === 1 && !game.player.downed, 'giant stays a true death (old flow)');
// bleed out -> the old death flow
game.died = null; game.player.hp = 10; game.player.dead = false; game.damageLocal(50, 'crawler', null);
nets['msg:dn']({ k: 'on', id: 'me', dur: 20, p: [0, 0, 0], c: 'crawler' }, 'me');
nets['msg:dn']({ k: 'bleed', id: 'me', c: 'crawler' }, 'me'); ok(game.died === 'crawler' && !game.player.downed, 'bleed-out runs game.die(cause)');
// creatures ignore downed players (host view)
nets['msg:dn']({ k: 'on', id: 'b', dur: 20, p: [0, 0, 0], c: 'x' }, 'me');
ok(game.aiPlayers().find((p) => p.id === 'b').dead === true && game.aiPlayers().find((p) => p.id === 'me').dead === false, 'aiPlayers reports downed as dead');
nets['msg:dn']({ k: 'up', id: 'b', by: 'me' }, 'me'); ok(!game.aiPlayers().find((p) => p.id === 'b').dead, 'and alive again after the revive');
// Hard: old behaviour
Diff.setMode('hard'); game.died = null; game.player.hp = 10; game.origHit = 0; game.damageLocal(50, 'lurker', null);
ok(game.origHit === 1 && game.died === true && !game.player.downed, 'Hard: one hit kills as before');
Diff.setMode('standard');
// solo: no crew -> death unless a medkit
game.remotes.clear(); game.died = null; game.origHit = 0; game.player.dead = false; game.player.hp = 10;
game.damageLocal(50, 'lurker', null); ok(game.origHit === 1 && game.died === true, 'solo without a kit: death as today');
game.died = null; game.player.hp = 10; game.player.dead = false; items.push({ id: 'k1', type: 'medkit', holder: 'me', def: { name: 'Medkit' } });
reqs.length = 0; game.damageLocal(50, 'lurker', null);
ok(!game.died && game.player.hp === 30 && !game.player.downed && reqs.some((q) => q[0] === 'consume' && q[1].id === 'k1'), 'solo with a medkit: self-revive at 30 %, kit consumed');
game.player.hp = 10; game.origHit = 0; game.damageLocal(50, 'lurker', null); ok(game.origHit === 1, 'only one self-revive per landing');
api.dispose();

console.log(`downed: ${checks - fails}/${checks} ok`);
process.exit(fails ? 1 : 0);
