// CAMLOOT (wave 9, docs/wave9/camloot.md) tests (pure node): node tools/harness/camloot.test.mjs
//  1. planCams puts >= 60 % of the non-tutorial cameras into the rooms of the top loot spots, each keeps a blind flank, deterministic
//  2. counters cost: junction cut = 2 s hold + reboot 90-120 s (stateNow expires CUT, warning flicker), smash is loud, spray is 40 s
//  3. route cards: camsOf; strings translated EN/TR/RU; the sim's careful-vs-sloppy net gap >= 15 %
import { execFileSync } from 'node:child_process';
import { generateLayout, INTERIOR_THEMES } from '../../src/world/facility.js';
import * as K from '../../src/game/feedcams_core.js';
import { camsOf } from '../../src/game/routeboard_core.js';
import { FC_KEYS } from '../../src/game/feedcams_i18n.js';
import { tIn } from '../../src/core/i18n.js';

const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const themes = Object.keys(INTERIOR_THEMES || { factory: 1, mansion: 1, mineshaft: 1 }).slice(0, 5);
let cams = 0, inLoot = 0, plans = 0, short = 0;
for (const theme of themes) for (const size of [0.8, 1.2, 2.0]) for (let s = 1; s <= 8; s++) {
  const L = generateLayout(s * 977 + size * 100, theme, size, null);
  const dOf = (r) => L.distOf?.[L.idx(r.cx, r.cz)] ?? 0;
  const spots = L.rooms.filter((r) => r !== L.entrance?.room).map((r) => ({ room: r.id, dist: dOf(r), sealed: false }));
  const opts = { seed: s * 31, day: 5, quotaIndex: 2, size, spots };
  const a = K.planCams(L, opts);
  if (!a.length) continue;
  ok(JSON.stringify(a) === JSON.stringify(K.planCams(L, opts)), `not deterministic ${theme} ${size} ${s}`);
  const loot = K.lootRooms(L, spots, L.entrance?.room), ids = new Set(loot.map((r) => r.id));
  const rest = a.filter((c) => !c.tut), want = Math.min(loot.length, Math.ceil(K.FC.lootShare * rest.length));
  plans++;
  const n = rest.filter((c) => ids.has(c.room)).length;
  if (n < want) short++;
  cams += rest.length; inLoot += n;
  for (const c of rest) if (ids.has(c.room)) ok(K.blindFlank(L, c, L.rooms[c.room]), `loot cam without a blind flank ${theme} ${s}`);
}
ok(cams > 100 && inLoot / cams >= 0.6, `>= 60 % of the non-tutorial cameras guard loot rooms (${inLoot}/${cams})`);
ok(short <= plans * 0.1, `almost every plan reaches its loot quota (${short}/${plans} short)`);
// counters cost something
const F = K.FC;
ok(F.cutHold === 2 && F.reboot[0] === 90 && F.reboot[1] === 120 && F.blind === 40 && F.smashLoud > F.baitLoud, 'cut 2 s / reboot 90-120 s / spray 40 s / smash louder than a bait');
ok(K.rebootIn(0) === 90 && K.rebootIn(0.999) < 120 && K.rebootIn(1.5) < 120, 'reboot delay 90-120 s');
const cut = { st: K.ST.CUT, until: 100 };
ok(K.stateNow(cut, 99) === K.ST.CUT && K.stateNow(cut, 100) === K.ST.OK && K.stateNow({ st: K.ST.DEAD, until: 0 }, 999) === K.ST.DEAD, 'a cut expires (reboot), a smash never does');
ok(!K.rebootWarn(cut, 90) && K.rebootWarn(cut, 95) && !K.rebootWarn(cut, 100) && !K.rebootWarn({ st: K.ST.BLIND, until: 100 }, 95), 'warning flicker in the last seconds before the reboot');
// route cards
ok(camsOf({ id: 'x', size: 1 }, 1, 0) === 1 && camsOf({ id: 'x', size: 1.5 }, 9, 2) >= 4 && camsOf({ id: 'hq', company: true }, 5, 2) === 0, 'camsOf');
// strings
const miss = [];
for (const k of FC_KEYS) if (!tIn('tr', k) || tIn('tr', k) === k || !tIn('ru', k) || tIn('ru', k) === k) miss.push(k.slice(0, 30));
ok(!miss.length, 'untranslated: ' + miss.join(' | '));
// the sim: careful crews out-earn sloppy ones by >= 15 %, going live on purpose stays a paid choice
const out = execFileSync('node', ['tools/sim/feedcams_sim.mjs', '12'], { encoding: 'utf8' });
const gap = Number(/careful vs sloppy (-?[\d.]+) %/.exec(out)?.[1]), show = Number(/showman vs careful (-?[\d.]+) %/.exec(out)?.[1]);
ok(gap >= 15, `sim net gap careful vs sloppy ${gap} % >= 15`);
ok(show < 0 && show > -40, `going live on purpose costs something but is not suicide (${show} %)`);
console.log(fails.length ? 'FAIL\n' + fails.join('\n') : `camloot OK (loot cams ${inLoot}/${cams}, sim gap ${gap} %, showman ${show} %)`);
process.exit(fails.length ? 1 : 0);
