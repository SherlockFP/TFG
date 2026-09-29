// FEEDCAMS wave 8 tests (pure node): node tools/harness/feedcams.test.mjs [seeds=10]
//  1. camera plan over themes x sizes x seeds: deterministic, counts by size / day (1 on the first landing, 4-10 later), inside rooms, spread
//  2. sight maths: sweep + bait, cone (blind spot under the camera, crouch shortens range), 3 s stream delay, juke, heat, viewer tax
//  3. strings translated (TR + RU)
import { generateLayout, INTERIOR_THEMES } from '../../src/world/facility.js';
import * as K from '../../src/game/feedcams_core.js';
import { FC_KEYS } from '../../src/game/feedcams_i18n.js';
import { tIn } from '../../src/core/i18n.js';

const SEEDS = Number(process.argv[2]) || 10;
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const themes = Object.keys(INTERIOR_THEMES || { factory: 1, mansion: 1, mineshaft: 1 }).slice(0, 5);
let total = 0, runs = 0, minN = 99, maxN = 0;
for (const theme of themes) for (const size of [0.8, 1.2, 2.0]) for (let s = 1; s <= SEEDS; s++) {
  const L = generateLayout(s * 977 + size * 100, theme, size, null);
  const opts = { seed: s * 31, day: 5, quotaIndex: 2, size };
  const a = K.planCams(L, opts), b = K.planCams(L, opts);
  runs++;
  ok(JSON.stringify(a) === JSON.stringify(b), `not deterministic ${theme} ${size} ${s}`);
  ok(a.length >= 3 && a.length <= 10, `count ${a.length} ${theme} ${size} ${s}`);
  minN = Math.min(minN, a.length); maxN = Math.max(maxN, a.length); total += a.length;
  ok(a.length <= K.camCount(size, 5, 2), `over budget ${theme} ${size}`);
  for (const c of a) {
    const r = L.rooms[c.room];
    const inside = c.x >= L.ox + (r.x - 0.2) * L.cell && c.x <= L.ox + (r.x + r.w + 0.2) * L.cell && c.z >= L.oz + (r.z - 0.2) * L.cell && c.z <= L.oz + (r.z + r.h + 0.2) * L.cell;
    ok(inside, `cam outside its room ${theme} ${s}`);
    ok(c.y > L.y + 2 && c.y < L.y + r.height, `cam height ${c.y - L.y} in room ${r.height}`);
    ok(c.jb && c.jb.path.length >= 2, 'junction path');
  }
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) ok(a[i].room !== a[j].room, 'two cams in one room');
  ok(a[0]?.tut, 'first cam is the tutorial cam');
  const e0 = L.entrance.room;
  const d0 = Math.hypot(a[0].cx - e0.cx, a[0].cz - e0.cz);
  ok(d0 < 14, `tutorial cam far from entrance ${d0}`);
}
// counts by day: tutorial landing, early caps, size scaling
ok(K.camCount(1.5, 1, 0) === 1, 'day 1 = one camera');
ok(K.camCount(2, 2, 0) === 3 && K.camCount(2, 3, 0) === 4, 'early caps');
ok(K.camCount(2, 9, 3) === 10 && K.camCount(0.5, 9, 3) <= 5 && K.camCount(1, 9, 1) <= 6, 'size scaling / cap 6 at quota 1');
// sight maths
const cam = { x: 0, z: 0, y: 3, h: 0, amp: 0.7, per: 10, ph: 0, fov: 0.8, R: 13, r0: 1.5, lim: 1.25 };
ok(Math.abs(K.camYaw(cam, 0)) < 1e-9 && Math.abs(K.camYaw(cam, 2.5) - 0.7) < 1e-9, 'sweep');
ok(K.inCone(cam, 0, 6, 0, false).ok, 'seen in front');
ok(!K.inCone(cam, 0, 0.8, 0, false).ok, 'blind spot under the camera');
ok(!K.inCone(cam, 0, -6, 0, false).ok && !K.inCone(cam, 0, 6, 5, false).ok, 'blind behind / beside');
ok(!K.inCone(cam, 0, 12, 0, true).ok && K.inCone(cam, 0, 12, 0, false).ok, 'crouch shortens range');
const bait = { h: 1.0, t0: 10, t1: 15 };
ok(Math.abs(K.camYaw(cam, 12, bait) - 1.0) < 1e-9 && Math.abs(K.camYaw(cam, 9, bait) - K.camYaw(cam, 9)) < 1e-9, 'bait turns the camera then releases');
ok(K.baitHeading(cam, Math.PI) <= 1.25 + 1e-9 && K.baitHeading({ ...cam, lim: null }, Math.PI) === Math.PI, 'wall cam cannot look back into its wall');
let m = 0, t = 0, live = false;
while (!live && t < 10) { const r = K.meterStep(m, K.exposureRate(9, false, 1), 0.1); m = r.m; live = r.live; t += 0.1; }
ok(live && t > 2.8 && t < 3.3, `3 s stream delay (${t.toFixed(1)})`);
ok(K.exposureRate(4, false, 1) > K.exposureRate(9, false, 1) && K.exposureRate(9, true, 1) < K.exposureRate(9, false, 1), 'close faster, crouch slower');
let jm = 0, jp = 0, jr; for (let i = 0; i < 6; i++) { jr = K.meterStep(jm, 1, 0.1, jp); jm = jr.m; jp = jr.pk; } for (let i = 0; i < 40 && !jr.juke; i++) { jr = K.meterStep(jm, 0, 0.1, jp); jm = jr.m; jp = jr.pk; }
ok(jr?.juke, 'juke fires when a near miss decays to 0'); ok(!K.meterStep(0.1, 0, 0.5, 0.2).juke, 'tiny brush is not a juke');
ok(K.heatStep(0, 1, 10) === 30 && Math.abs(K.heatStep(50, 0, 10) - 38) < 1e-9 && K.heatStep(99, 4, 10) === 100, 'heat');
ok(K.taxOf(100).v === 75 && K.taxOf(100).cut === 25 && K.taxOf(1).cut === 0 && K.taxOf(2).v >= 1, 'viewer tax 25 %, never below 1');
ok(K.stateNow({ st: 1, until: 5 }, 6) === 0 && K.stateNow({ st: 1, until: 5 }, 4) === 1 && K.stateNow({ st: 2, until: 0 }, 99) === 2, 'timed states');
ok(K.segNear([0, 0, 0], [10, 0, 0], [5, 0.5, 0], 0.9) && !K.segNear([0, 0, 0], [10, 0, 0], [5, 2, 0], 0.9), 'segNear');
// strings
for (const k of FC_KEYS) { ok(tIn('tr', k) !== k, 'missing TR: ' + k.slice(0, 40)); ok(tIn('ru', k) !== k, 'missing RU: ' + k.slice(0, 40)); }
console.log(`feedcams: ${runs} layouts, cams ${minN}..${maxN} (avg ${(total / runs).toFixed(1)}), ${fails.length ? 'FAIL' : 'ok'}`);
if (fails.length) { console.log([...new Set(fails)].slice(0, 12).join('\n')); process.exit(1); }
