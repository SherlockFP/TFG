// HIGHLIGHTS CLIP tests (pure node, wave 8, docs/wave8/highlights.md): node tools/harness/highlights.test.mjs
//  1. ring -> clip: window, subject flag, creature filter, pack round trip, wire size
//  2. keepBest / fitClips (20 KB cap) / clock / viewers
//  3. captions: every moment kind x3, TR + RU
//  4. module smoke: host records, moment -> clip at takeoff -> 'hlclip' -> a receiver builds the view + summary button
import * as H from '../../src/game/highlights_core.js';
import { CAPS, INTRO, OUTRO, HLC_KEYS } from '../../src/game/highlights_i18n.js';
import { HL } from '../../src/game/feedcams2_core.js';
import { MOONS } from '../../src/game/moons.js';
import { tIn } from '../../src/core/i18n.js';

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// 1. ring -> clip: 20 s at 10 Hz, A walks +x, B walks +z, creature 7 chases A, creature 9 is far away
const ring = new H.Ring();
const posA = (t) => [t * 2, 0], posB = (t) => [5, t * 1.5];
for (let i = 0; i < 200; i++) {
  const t = i / 10;
  ring.begin(t);
  ring.setPlayer('A', ...posA(t), 1.0); ring.setPlayer('B', ...posB(t), 2.0);
  ring.setCreature(7, t * 2 - 6, 2); ring.setCreature(9, 300, 300);
}
const m = ['down', 'Ana', 0, '', 80];
const clip = H.buildClip(ring, 15, m, 'A', (id) => ({ A: 'Ana', B: 'Bo' }[id]), [[14.9, 'juke'], [15, 'down'], [2, 'live']]);
ok(clip && clip.k === 'down' && clip.sc === 80 && clip.hz === 5, 'clip header');
ok(clip.n >= 45 && clip.n <= 52 && Math.abs(clip.e - 7) < 0.3, `window ~7 s before + 3 s after (n=${clip?.n} e=${clip?.e})`);
ok(clip.p.length === 2 && clip.p.filter((q) => q[3]).length === 1 && clip.p.find((q) => q[3])[0] === 'Ana', 'both players, exactly the subject flagged');
ok(clip.c.length === 1, 'the far creature is left out');
ok(clip.ev.length === 2 && clip.ev.every(([s]) => s >= 0), 'events inside the window only');
const tr = H.unpackClip(clip), a = tr.P.find((q) => q.sub), pa = H.trackAt(a, clip.e, clip.hz), want = posA(15);
ok(pa && Math.abs(pa.x - want[0]) < 0.4 && Math.abs(pa.z - want[1]) < 0.4, `pack round trip lands on the moment (${pa?.x.toFixed(2)} vs ${want[0]})`);
ok(H.trackAt(a, 99, clip.hz) === null && H.trackAt(tr.C[0], clip.e, clip.hz), 'tracks hide outside their range');
ok(H.clipBytes(clip) < 7000, `one clip is small (${H.clipBytes(clip)} chars)`);
ok(ring.size === 120 && Math.abs(ring.time(0) - 8) < 0.11 && Math.abs(ring.time(119) - 19.9) < 0.11, 'ring keeps 12 s');
ok(H.buildClip(ring, 3, m, 'A', String) === null, 'a moment older than the ring gives no clip');

// 2. keep best / wire cap / clock
let list = [];
for (const [tm, sc] of [[10, 30], [12, 60], [40, 44], [80, 20], [120, 50]]) list = H.keepBest(list, { tm, sc, c: [] });
ok(list.length === 3 && list[0].sc === 60 && !list.some((c) => c.sc === 30) && !list.some((c) => c.sc === 20), 'best 3, a nearby worse clip is dropped');
const big = []; for (let i = 0; i < 3; i++) big.push({ ...clip, tm: i * 20, c: [...clip.c, ...clip.c, ...clip.c, ...clip.c, ...clip.c] });
const fit = H.fitClips(big, 6000);
ok(fit.reduce((n, c) => n + H.clipBytes(c), 0) < 6000 && fit.length >= 1 && fit.every((c) => !('tm' in c)), 'fitClips trims to the cap and strips local fields');
ok(H.fitClips([clip, clip, clip]).length === 3, '3 real clips fit in 20 KB');
const len = (clip.n - 1) / clip.hz, wall = H.clipWall(len, clip.e);
ok(Math.abs(H.clipClock(wall, len, clip.e) - len) < 1e-6 && wall > len && wall < len + 1.5 && H.clipClock(0.5, len, clip.e) === 0.5, 'slow-mo clock ends exactly at the clip end');
let prev = -1, mono = true; for (let e = 0; e <= wall; e += 0.05) { const u = H.clipClock(e, len, clip.e); if (u < prev) mono = false; prev = u; }
ok(mono, 'clock is monotonic');
ok(H.viewersAt(clip, 1) > H.viewersAt(clip, 0.2) && H.viewersAt(clip, 0) < 400, 'viewers climb');

// 3. captions
for (const k of Object.keys(HL)) ok(CAPS[k]?.length >= 3, 'captions for ' + k);
for (const s of [...Object.values(CAPS).flat(), ...INTRO, ...OUTRO, ...HLC_KEYS]) {
  ok(tIn('tr', s) !== s, 'TR ' + s);
  ok(tIn('ru', s) !== s, 'RU ' + s);
  if (/\{name\}/.test(s)) ok(/\{name\}/.test(tIn('tr', s)) && /\{name\}/.test(tIn('ru', s)), 'placeholder kept ' + s);
  if (/[—–]/.test(s) || /!/.test(s)) fails.push('style (no dash / exclamation): ' + s);
}

// 4. module smoke
const noop = () => {};
globalThis.document = { createElement: () => ({ style: {}, remove: noop, addEventListener: noop, appendChild: noop, querySelector: () => null }), head: { appendChild: noop }, body: { appendChild: noop }, addEventListener: noop, removeEventListener: noop, getElementById: () => null };
const { installHighlights } = await import('../../src/game/highlights.js');
const moon = Object.keys(MOONS).find((k) => !MOONS[k].company && !MOONS[k].home);
const mk = (isHost) => {
  const handlers = new Map(), sent = [], net = { handlers: new Map(), broadcast: (k, d) => sent.push([k, d]), on_(k, f) { this.handlers.set(k, f); } };
  const mods = { on(ev, fn) { (handlers.get(ev) || handlers.set(ev, []).get(ev)).push(fn); return noop; }, emit(ev, ...a) { for (const f of handlers.get(ev) || []) f(...a); } };
  const game = { mods, isHost, selfId: 'h', net, time: 0, run: { phase: 'moon', moon }, player: { pos: { x: 0, z: 0 }, yaw: 0, dead: false }, playerName: (id) => ({ h: 'Host', p: 'Pal' }[id] || '?'),
    remotes: new Map([['p', { id: 'p', pos: { x: 4, z: 0 }, yaw: 1 }]]), creatures: { host: new Map([[1, { id: 1, pos: { x: 6, z: 1 } }]]) }, ui: { fullscreenOpen: () => false } };
  return { game, mods, sent, net, api: installHighlights(game) };
};
const H1 = mk(true), R1 = mk(false);
ok(H1.api && R1.api, 'module installs');
H1.mods.emit('phase', 'moon', H1.game);
for (let i = 0; i < 160; i++) {
  H1.game.player.pos.x += 0.2; H1.game.remotes.get('p').pos.x += 0.15; H1.game.creatures.host.get(1).pos.x += 0.1;
  H1.mods.emit('update', 0.1, H1.game);
  if (i === 90) H1.api.onMoment('down', 'p', ['down', 'Pal', 0, '', 80]);
}
H1.mods.emit('phase', 'takeoff', H1.game);
const out = H1.sent.find(([k]) => k === 'hlclip');
ok(out && out[1].c.length === 1 && out[1].c[0].k === 'down' && out[1].c[0].s === 'Pal', 'takeoff broadcasts one clip');
ok(out && JSON.stringify(out[1]).length < 20000, 'payload under 20 KB');
ok(out && out[1].c[0].p.some((q) => q[3] && q[0] === 'Pal') && out[1].c[0].c.length === 1, 'subject + creature recorded');
H1.mods.emit('phase', 'orbit', H1.game);
ok(H1.sent.filter(([k]) => k === 'hlclip').length === 1, 'sent once per day');
R1.net.handlers.get('hlclip')({ c: [...(out?.[1].c || []), { junk: 1 }, null] });
ok(R1.api.state.view.length === 1, 'receiver keeps the good clip, ignores junk');
const extra = []; R1.mods.emit('daySummary', { day: 1 }, extra, R1.game);
ok(extra.length === 1 && /hc-watch/.test(extra[0]), 'day summary gets the WATCH HIGHLIGHT button');
R1.mods.emit('phase', 'moon', R1.game);
ok(R1.api.state.view.length === 0, 'a new landing clears the view');
H1.api.dispose(); R1.api.dispose();

if (fails.length) { console.error('FAIL\n' + fails.join('\n')); process.exit(1); }
console.log('highlights: ok');
