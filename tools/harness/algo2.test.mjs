// Node test for algo2 (src/game/algo2_core.js + algo2_i18n.js): hype maths + tier payouts, ghost record / pack / replay timing, glitch plan + patch meter, chat gate + pools.
//   node tools/harness/algo2.test.mjs
import * as K from '../../src/game/algo2_core.js';
import { CHAT, CHAT_KINDS, HANDLES, chatLine, I18N } from '../../src/game/algo2_i18n.js';
import { RNG } from '../../src/core/rng.js';

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const near = (a, b, m, e = 1e-6) => ok(Math.abs(a - b) <= e, `${m}: got ${a} want ${b}`);

// ---------------------------------------------------------------- hype maths
{
  const s = K.newHype();
  eq([K.tierOf(0), K.tierOf(24.9), K.tierOf(25), K.tierOf(59), K.tierOf(60), K.tierOf(109), K.tierOf(110), K.tierOf(999)], [0, 0, 1, 1, 2, 2, 3, 3], 'tiers');
  let r = K.addHype(s, 'escape', 0);
  near(r.gain, 12, 'escape base'); ok(!r.up && r.tier === 0, 'no tier yet');
  r = K.addHype(s, 'escape', 1);
  near(r.gain, 9, 'second escape x0.75');
  r = K.addHype(s, 'escape', 2);
  near(r.gain, 6.8, 'third escape x0.5625 (rounded .1)');
  r = K.addHype(s, 'escape', 3); r = K.addHype(s, 'escape', 4); r = K.addHype(s, 'escape', 5); r = K.addHype(s, 'escape', 6); r = K.addHype(s, 'escape', 7);
  near(r.gain, 3, 'floor at 25 % of base (12 * .25)');
  // cooldown
  const c = K.newHype();
  near(K.addHype(c, 'dodge', 10).gain, 10, 'dodge');
  near(K.addHype(c, 'dodge', 12).gain, 0, 'dodge on cooldown (8 s)');
  ok(K.addHype(c, 'dodge', 18.1).gain > 0, 'dodge after cooldown');
  near(K.addHype(c, 'nonsense', 99).gain, 0, 'unknown kind ignored');
  // late extract only once per day
  const l = K.newHype(); K.addHype(l, 'late_extract', 0); near(K.addHype(l, 'late_extract', 1000).gain, 0, 'late extract counted once (cd)');
  // tier-up flag + cap
  const u = K.newHype(); u.h = 20; const up = K.addHype(u, 'closet', 0);
  ok(up.up && up.tier === 1, 'closet pushes 20 -> 32 = bronze, up=true');
  const capd = K.newHype(); capd.h = 199; K.addHype(capd, 'late_extract', 0); near(capd.h, K.HYPE.cap, 'hype capped');
  // every kind has points + cooldown entries
  for (const k of Object.keys(K.HYPE.pts)) ok(k in K.HYPE.cd, 'cd for ' + k);
  // a realistic good day reaches gold; a dull one stays low
  const g = K.newHype(); let t0 = 0;
  for (const k of ['escape', 'dodge', 'door_shut', 'closet', 'sprint_away', 'glitch', 'escape', 'dodge', 'boss_hit', 'late_extract']) { K.addHype(g, k, t0); t0 += 30; }
  ok(K.tierOf(g.h) >= 2, 'a busy day reaches at least silver: ' + g.h);
  ok(K.tierOf(K.addHype(K.newHype(), 'death', 0).gain) === 0, 'one death is nothing');
}

// ---------------------------------------------------------------- payouts
{
  eq(K.payout(0, { aboard: 3, quotaIndex: 2 }), { tier: 0, coin: 0, xp: 0, crate: null }, 'tier 0 pays nothing');
  const b = K.payout(1, { aboard: 2, quotaIndex: 0 });
  eq([b.coin, b.xp, b.crate], [30, 20, null], 'bronze q0');
  const s = K.payout(2, { aboard: 2, quotaIndex: 2 });
  eq([s.coin, s.crate], [140, { kind: 'supply', tier: 'uncommon' }], 'silver q2 + uncommon sponsor crate');
  const gd = K.payout(3, { aboard: 1, quotaIndex: 3 });
  eq([gd.coin, gd.crate], [310, { kind: 'supply', tier: 'rare' }], 'gold q3 + rare sponsor crate');
  eq(K.payout(3, { aboard: 1, quotaIndex: 99 }).coin, 160 + 50 * 6, 'quota bonus capped at 6');
  eq(K.payout(3, { aboard: 0, quotaIndex: 1 }).coin, 0, 'nobody aboard, nothing');
  eq(K.payout(3, { aboard: 2, quotaIndex: 1, allDead: true }).coin, 0, 'all dead, nothing');
  const a = K.payout(3, { aboard: 1, quotaIndex: 1 }); a.crate.tier = 'x';
  eq(K.payout(3, { aboard: 1, quotaIndex: 1 }).crate.tier, 'rare', 'payout returns a copy of the crate spec');
  // want more show
  eq([K.wantMore(1, 3), K.wantMore(2, 3), K.wantMore(3, 3), K.wantMore(3, 0)], [0, 1, 1, 0], 'want more: silver+, never quota 0');
  // late extract clock: 720 s day -> 960 game minutes -> 1.3333 min per s
  near(K.secondsLeft(1440 - 8 * (960 / 720), 720), 8, 'secondsLeft 8');
  ok(K.isLateExtract(1440 - 5, 720, 12), '< 10 s left and was outside 12 s ago');
  ok(!K.isLateExtract(1440 - 5, 720, 90), 'was not outside recently');
  ok(!K.isLateExtract(1440 - 60, 720, 5), 'plenty of time left');
  ok(!K.isLateExtract(1440, 720, null), 'never outside');
}

// ---------------------------------------------------------------- chat gate + pools
{
  const g = K.makeChatGate({ gap: 1.1, burst: 4, win: 8 });
  const seq = [0, 0.5, 1.2, 2.4, 3.6, 4.8, 5.9, 9.5, 10.7];
  const res = seq.map((x) => g(x));
  eq(res, [true, false, true, true, true, false, false, true, true], 'gate: gap 1.1 s, burst 4 per 8 s');
  for (const k of CHAT_KINDS) for (const l of ['en', 'tr', 'ru']) {
    const p = CHAT[k][l];
    ok(Array.isArray(p) && p.length >= 4, `chat ${k}/${l} has >= 4 lines`);
    for (const line of p || []) ok(line.length > 0 && line.length <= 46, `chat ${k}/${l} short: "${line}" (${line.length})`);
  }
  for (const k of ['escape', 'dodge', 'door_shut', 'boss_hit', 'closet', 'late_extract', 'glitch', 'death', 'tier', 'patch', 'ghost', 'ambient', 'sprint_away']) ok(CHAT_KINDS.includes(k), 'chat kind ' + k);
  ok(HANDLES.length >= 12 && HANDLES.every((h) => h.length <= 16), 'handles');
  eq(chatLine('escape', 'xx', 0), CHAT.escape.en[0], 'unknown lang falls back to English');
  ok(CHAT.escape.tr.includes(chatLine('escape', 'tr', 0.99)), 'TR line');
  // TR + RU cover every English UI key
  const en = Object.keys(I18N.TR);
  eq(Object.keys(I18N.RU).filter((k) => !en.includes(k)), [], 'RU has no extra keys');
  eq(en.filter((k) => !(k in I18N.RU)), [], 'RU covers every TR key');
  ok(en.length >= 25, 'ui key count');
}

// ---------------------------------------------------------------- ghost: record / pack / replay
{
  // a walk with turns: 10 s at 10 Hz
  const walk = [];
  for (let i = 0; i <= 100; i++) { const t = i / 10; walk.push([40 + Math.sin(t) * 6, 1.5 + (i > 60 ? 0.1 : 0), -12 + t * 3.1, (t * 0.8) % (Math.PI * 2)]); }
  const p = K.packTrack(walk);
  eq([p.n, p.hz], [101, 10], 'packed n/hz');
  ok(p.s.length === 101 * 8, 'compact: 8 chars per sample = ' + p.s.length);
  ok(JSON.stringify(p).length < 900, 'JSON under 900 chars: ' + JSON.stringify(p).length);
  const u = K.unpackTrack(p);
  eq(u.length, 101, 'unpacked length');
  near(u[100][0], 0, 'last sample is the anchor (dx)'); near(u[100][2], 0, 'anchor dz');
  let worst = 0;
  for (let i = 0; i <= 100; i++) {
    worst = Math.max(worst, Math.abs(u[i][0] - (walk[i][0] - walk[100][0])), Math.abs(u[i][1] - (walk[i][1] - walk[100][1])), Math.abs(u[i][2] - (walk[i][2] - walk[100][2])));
  }
  ok(worst <= 0.101, 'positions within 0.1 m after packing: ' + worst);
  let wy = 0; for (let i = 0; i <= 100; i++) { const d = Math.abs(((u[i][3] - walk[i][3] + Math.PI * 3) % (Math.PI * 2)) - Math.PI); wy = Math.max(wy, d); }
  ok(wy < 0.03, 'yaw within ~1.4 deg: ' + wy);
  // sampling / timing
  const len = 10;
  const s0 = K.sampleAt(u, 0), s5 = K.sampleAt(u, 5), s10 = K.sampleAt(u, 10), s99 = K.sampleAt(u, 99);
  near(s0.x, u[0][0], 'u=0 first sample'); near(s5.z, u[50][2], 'u=5 -> sample 50', 1e-6); near(s10.x, 0, 'u=10 last = anchor'); near(s99.x, 0, 'past the end clamps');
  const mid = K.sampleAt(u, 0.05);
  near(mid.z, (u[0][2] + u[1][2]) / 2, 'interpolates half way', 1e-6);
  ok(s5.speed > 2.5 && s5.speed < 4.5, 'speed of a 3.1 m/s walk: ' + s5.speed);
  // loop: plays len s, then holds GHOST.hold s fading, then restarts
  const l0 = K.ghostLoop(0, len), l3 = K.ghostLoop(3, len), lh = K.ghostLoop(len + 1.25, len), lr = K.ghostLoop(len + K.GHOST.hold + 0.1, len);
  eq([l0.holding, l3.holding, lh.holding, lr.holding], [false, false, true, false], 'loop phases');
  near(l3.u, 3, 'u at t=3'); near(lh.alpha, 0.5, 'fade half way through the hold'); near(lr.u, 0.1, 'restarts', 1e-9);
  ok(l0.alpha === 0 && K.ghostLoop(1, len).alpha === 1, 'fade in over 0.6 s');
  // yaw wrap: 350 deg -> 10 deg goes the short way
  const wrapT = [[0, 0, 0, 6.1], [0, 0, 0, 0.2]];
  const w = K.sampleAt(K.unpackTrack(K.packTrack(wrapT)), 0.05);
  ok(Math.abs(((w.yaw - 6.283 + 3.1416) % 6.2832 + 6.2832) % 6.2832 - 3.1416) < 0.2, 'yaw interpolates through 0/2pi: ' + w.yaw);
  // corrupted / short input
  eq(K.unpackTrack(null), [], 'null pack'); eq(K.unpackTrack({ n: 5, s: 'AA' }), [], 'truncated pack');
  eq(K.packTrack([]).n, 0, 'empty pack');
  // huge jump is clamped, not corrupt
  const jump = K.unpackTrack(K.packTrack([[0, 0, 0, 0], [500, 0, 0, 0], [500, 0, 0, 0]]));
  eq(jump.length, 3, 'jump keeps length');
}
{
  // recorder: 10 Hz, ring of 10 s, dead / ship clears
  const R = new K.Recorder();
  for (let i = 0; i < 300; i++) R.feed(0.05, [{ id: 'a', x: i * 0.05, y: 0, z: 0, yaw: 0 }, { id: 'b', x: 0, y: 0, z: 0, yaw: 0, skip: i > 200 }]);   // 15 s at 20 Hz
  const b = R.buf.get('a');
  eq(b.length, 101, 'ring keeps the last 10 s (101 samples @10 Hz)');
  ok(R.buf.get('b') == null, 'skipped player has no buffer');
  const pk = R.finish('a');
  eq(pk.n, 101, 'finish packs 101 samples'); ok(R.buf.get('a') == null, 'finish forgets');
  eq(R.finish('a'), null, 'nothing left');
  const R2 = new K.Recorder();
  for (let i = 0; i < 10; i++) R2.feed(0.1, [{ id: 'z', x: 0, y: 0, z: 0, yaw: 0 }]);
  eq(R2.finish('z'), null, '1 s is too little to replay');
  const R3 = new K.Recorder();
  for (let i = 0; i < 30; i++) R3.feed(0.1, [{ id: 'z', x: 0, y: 0, z: 0, yaw: 0 }]);
  ok(R3.finish('z') != null, '3 s is enough');
  // big dt never records a burst of fake samples
  const R4 = new K.Recorder(); R4.feed(5, [{ id: 'q', x: 0, y: 0, z: 0, yaw: 0 }]);
  eq(R4.buf.get('q').length, 1, 'a long frame adds ONE sample');
  // 10 Hz timing: 3 s of 60 fps frames gives ~30 samples
  const R5 = new K.Recorder(); for (let i = 0; i < 180; i++) R5.feed(1 / 60, [{ id: 'q', x: 0, y: 0, z: 0, yaw: 0 }]);
  ok(Math.abs(R5.buf.get('q').length - 30) <= 1, '60 fps -> 10 Hz: ' + R5.buf.get('q').length);
}
{
  // ghost store: max 3 per moon, plays once, only on a later day, expires
  const st = {};
  for (let d = 1; d <= 5; d++) K.addGhost(st, 'hamsi', { day: d, name: 'n' + d, rx: 0, rz: 0 });
  eq(st.ghosts.hamsi.map((g) => g.day), [3, 4, 5], 'max 3 ghosts per moon (oldest dropped)');
  K.addGhost(st, 'other', { day: 5 });
  eq(K.takeGhosts(st, 'hamsi', 5).map((g) => g.day), [3, 4], 'plays earlier days only, not the same day');
  eq(st.ghosts.hamsi.map((g) => g.day), [5], 'a ghost made today stays in the store');
  eq(K.takeGhosts(st, 'hamsi', 5), [], 'and does not play today'); K.takeGhosts(st, 'hamsi', 6);
  ok(st.ghosts.hamsi == null, 'store emptied once everything played');
  K.addGhost(st, 'hamsi', { day: 2 }); K.addGhost(st, 'hamsi', { day: 10 });
  eq(K.takeGhosts(st, 'hamsi', 20).map((g) => g.day), [], 'ghosts older than 8 days expire');
  K.addGhost(st, 'hamsi', { day: 6 }); K.addGhost(st, 'hamsi', { day: 7 });
  eq(K.takeGhosts(st, 'hamsi', 8).map((g) => g.day), [6, 7], 'plays next day');
  eq(K.takeGhosts(st, 'hamsi', 9), [], 'plays once');
  eq(K.takeGhosts(st, 'other', 6).length, 1, 'other moon separate');
  // anchors: nearest to entrance + offset, >= 12 m from the door, ghosts apart
  const en = { x: 0, z: 0 };
  const pool = [{ x: 3, z: 0 }, { x: 20, z: 0 }, { x: 22, z: 2 }, { x: -30, z: 5 }, { x: 0, z: 40 }];
  const a = K.chooseAnchors([{ rx: 21, rz: 0 }, { rx: 21, rz: 1 }, { rx: -28, rz: 4 }], pool, en);
  eq(a.map((s) => s && [s.x, s.z]), [[20, 0], [0, 40], [-30, 5]], 'anchors: 2nd ghost avoids the first (6 m apart), none within 12 m of the door');
  ok(a.every((s) => !s || Math.hypot(s.x, s.z) >= 12), 'nothing near the entrance');
  eq(K.chooseAnchors([{ rx: 0, rz: 0 }], [{ x: 2, z: 1 }], en), [null], 'no valid spot -> null');
}

// ---------------------------------------------------------------- glitch plan + patch meter
{
  const pool = [];
  for (let i = 0; i < 60; i++) pool.push({ x: (i % 10) * 9 - 20, y: 0, z: Math.floor(i / 10) * 11 - 20, room: i % 7 });
  const en = { x: -20, z: -20 };
  const plan = (seed) => { const r = new RNG(seed); return K.planGlitches(pool, en, 1, () => r.next()); };
  eq(plan(5), plan(5), 'deterministic for a seed');
  eq(plan(5), K.planGlitches(pool.slice().reverse(), en, 1, (() => { const r = new RNG(5); return () => r.next(); })()), 'pool order does not matter (sorted)');
  const counts = new Set(), types = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const g = plan(seed);
    counts.add(g.length);
    ok(g.length >= 1 && g.length <= 3, 'count 1-3');
    ok(new Set(g.map((x) => x.type)).size === g.length, 'unique types per landing');
    for (const x of g) {
      types.add(x.type);
      ok(Math.hypot(x.x - en.x, x.z - en.z) >= K.GLITCH.minFromEntrance, 'far from entrance');
      if (x.type === 'wall') { const d = Math.hypot(x.to.x - x.x, x.to.z - x.z); ok(d >= K.GLITCH.wallHop[0] && d <= K.GLITCH.wallHop[1], 'wall hop distance ' + d); }
    }
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) ok(Math.hypot(g[i].x - g[j].x, g[i].z - g[j].z) >= K.GLITCH.apart, 'glitches apart');
  }
  eq([...counts].sort(), [1, 2, 3], 'all counts occur'); eq([...types].sort(), ['dup', 'freeze', 'wall'], 'all types occur');
  eq(K.planGlitches([{ x: -19, y: 0, z: -20, room: 0 }], en, 1, () => 0.5), [], 'no valid spots, no glitches');

  // patch meter
  const ps = K.newPatch();
  let r = K.useGlitch(ps, { id: 'w0', type: 'wall' });
  eq([r.ok, r.meter, r.patched], [true, 16, false], 'wall use +16');
  r = K.useGlitch(ps, { id: 'f1', type: 'freeze' });
  eq([r.ok, r.meter], [true, 46], 'freeze +30');
  r = K.useGlitch(ps, { id: 'f1', type: 'freeze' });
  eq([r.ok, r.reason, r.meter], [false, 'used', 46], 'freeze is once');
  r = K.useGlitch(ps, { id: 'd2', type: 'dup' });
  eq([r.ok, r.meter, r.patched], [true, 86, false], 'dup +40');
  r = K.useGlitch(ps, { id: 'd2', type: 'dup' });
  eq([r.ok, r.reason], [false, 'used'], 'dup once');
  r = K.useGlitch(ps, { id: 'w0', type: 'wall' });
  eq([r.ok, r.meter, r.patched], [true, 100, true], 'meter capped at 100 and the fill triggers the patch');
  r = K.useGlitch(ps, { id: 'w0', type: 'wall' });
  eq([r.ok, r.reason, r.patched], [false, 'patched', false], 'nothing works after the patch (and it does not fire twice)');
  eq(K.useGlitch(K.newPatch(), { id: 'x', type: 'bogus' }).reason, 'unknown', 'unknown glitch type');
  // wall cap
  const pw = K.newPatch(); pw.meter = 0; let okc = 0;
  for (let i = 0; i < 12; i++) { const q = K.useGlitch(pw, { id: 'w', type: 'wall' }); if (q.ok) okc++; if (pw.patched) break; }
  ok(okc === Math.min(K.PATCH.wallMaxUses, Math.ceil(100 / 16)), 'wall alone patches after ' + okc + ' uses');
  const pw2 = K.newPatch(); pw2.meter = 0; pw2.wall = K.PATCH.wallMaxUses;
  eq(K.useGlitch(pw2, { id: 'w', type: 'wall' }).reason, 'used', 'wall cap');
  // landing decay + punishment
  eq([K.landingMeter(100), K.landingMeter(60), K.landingMeter(10), K.landingMeter(0)], [75, 35, 0, 0], 'meter cools 25 per landing');
  eq([K.punishment(0, 0.9), K.punishment(0, 0.1), K.punishment(2, 0.2), K.punishment(2, 0.9)], ['lights', 'lights', 'swarm', 'lights'], 'punishment: quota 0 is only lights');
  // a crew that uses every glitch of a full landing (dup + freeze + wall x2) patches; one careful use does not
  const full = K.newPatch();
  for (const g of [{ id: 'd', type: 'dup' }, { id: 'f', type: 'freeze' }, { id: 'w', type: 'wall' }, { id: 'w', type: 'wall' }]) K.useGlitch(full, g);
  ok(full.patched, 'a greedy crew triggers the patch: ' + full.meter);
  const carefulP = K.newPatch(); K.useGlitch(carefulP, { id: 'd', type: 'dup' });
  ok(!carefulP.patched, 'one careful use does not');
}

console.log(fails ? `algo2 test: ${fails} FAILED of ${checks}` : `algo2 test: ${checks} checks OK`);
process.exit(fails ? 1 : 0);
