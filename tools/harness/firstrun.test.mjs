// node tools/harness/firstrun.test.mjs - wave 8 first-run message budget (docs/wave8/firstrun.md): stage machine, allow matrix, 45 s Algorithm gate, card lease,
// one-objective filter, the tutorial camera between entrance and first loot, new strings in EN/TR/RU, and that each module really consults the budget.
import fs from 'fs';
import * as F from '../../src/game/firstrun_core.js';
import * as K from '../../src/game/feedcams_core.js';
import { generateLayout } from '../../src/world/facility.js';
import { TEXT } from '../../src/game/onboard_text.js';
import { FC_KEYS } from '../../src/game/feedcams_i18n.js';
import { tIn } from '../../src/core/i18n.js';

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// ---- stages: only a fresh staged profile below quota 1 is budgeted
const S = (o) => F.stageOf({ mode: 'staged', q: 0, ...o });
ok(S({ flow: 'run' }) === 'hiring', 'hiring while the flow runs');
ok(S({ flow: 'done' }) === 'first' && S({ flow: 'skip' }) === 'first', 'first until the first sale (also after a skipped Hiring Day)');
ok(S({ flow: 'done', sold: true }) === 'early', 'early after the first sale');
ok(S({ flow: 'done', q: 1 }) === 'free', 'free once quota 1 is met');
ok(F.stageOf({ mode: 'all', q: 0, flow: 'done' }) === 'free' && F.stageOf({ mode: null, q: 0 }) === 'free', 'veterans are never budgeted');
ok(S({ unlockAll: true, flow: 'run' }) === 'free' && S({ quick: true, flow: 'done' }) === 'free', 'unlock-everything / Quick Shift are free');
ok(F.firstDay({ day: 1, quotaIndex: 0 }) && !F.firstDay({ day: 2, quotaIndex: 0 }) && !F.firstDay({ day: 1, quotaIndex: 1 }) && !F.firstDay({ day: 1, quotaIndex: 0, quick: {} }), 'firstDay is run-only and deterministic');

// ---- allow matrix
ok(!F.allow('mapmods', 'first') && !F.allow('mapmods', 'early') && F.allow('mapmods', 'free'), 'mapmods card only from quota 1');
ok(!F.allow('dailyEvent', 'hiring') && !F.allow('dailyEvent', 'first') && F.allow('dailyEvent', 'early'), 'daily modifier after the first sale');
ok(!F.allow('facjobs', 'first') && F.allow('facjobs', 'early'), 'facility job after the first sale');
ok(!F.allow('wrongdoor', 'first', 1) && F.allow('wrongdoor', 'first', 2) && !F.allow('wrongdoor', 'hiring', 5) && F.allow('wrongdoor', 'free', 1), 'wrong door: nothing before day 2');

// ---- Algorithm gate: one non-priority line per 45 s, priority always passes, free = no limit
ok(F.algoOk('first', 1000, 0), 'first line passes');
ok(!F.algoOk('first', 20000, 1000) && F.algoOk('first', 46001, 1000), '45 s gap');
ok(F.algoOk('first', 2000, 1000, true) && F.algoOk('free', 2000, 1000), 'priority / free pass');

// ---- one card at a time
const L0 = { kind: '', until: 0, pri: 0 };
ok(F.lease(L0, 'card', 0, 4, 2), 'card takes the empty screen');
ok(!F.lease(L0, 'caption', 1000, 6, 1), 'caption waits while the card shows');
ok(F.lease(L0, 'hub', 1000, 4, 3), 'a higher priority takes over');
ok(F.lease(L0, 'caption', 9000, 6, 1), 'the screen frees up after the lease');

// ---- one objective
const lines = [{ text: 'warn', kind: 'warn' }, { text: 'land', kind: 'main' }, { text: 'hint', kind: 'hint' }, { text: 'door', kind: 'sub', first: true }, { text: 'tut', kind: 'main', pin: true }];
const one = F.only(lines);
ok(one.length === 2 && one[0].text === 'warn' && one[1].text === 'door', 'warning + the marked goal');
ok(F.only(lines.filter((l) => !l.first)).map((l) => l.text).join() === 'warn,land', 'else the first main');
ok(F.only([{ text: 'a', kind: 'hint' }, { text: 'b', kind: 'sub' }])[0].text === 'b', 'a sub beats a hint');

// ---- the tutorial camera sits between the entrance and the first loot room
let tried = 0, placed = 0;
for (const theme of ['factory', 'mansion']) for (const size of [1.2, 2.0]) for (let s = 1; s <= 12; s++) {
  const L = generateLayout(s * 977 + size * 100, theme, size, null);
  const dOf = (r) => L.distOf?.[L.idx(r.cx, r.cz)] ?? 0;
  const ds = L.rooms.map(dOf).sort((x, y) => x - y), med = ds[Math.floor(ds.length / 2)];   // loot only in the far half of the facility
  const spots = L.rooms.filter((r) => r !== L.entrance?.room && !r.treasure && dOf(r) >= med).map((r) => ({ room: r.id, sealed: false }));
  if (!spots.length) continue;
  tried++;
  const opts = { seed: s * 31, day: 1, quotaIndex: 0, size, spots };
  const a = K.planCams(L, opts), b = K.planCams(L, opts);
  ok(JSON.stringify(a) === JSON.stringify(b), `tutorial plan deterministic ${theme} ${s}`);
  ok(a.length === 1 && a[0].tut, `first landing = exactly the tutorial camera ${theme} ${s}`);
  const loot = spots.map((sp) => L.rooms.find((r) => r.id === sp.room)).reduce((p, r) => (dOf(r) < dOf(p) ? r : p));
  if (dOf(loot) >= 6) {
    const room = L.rooms[a[0].room];
    if (dOf(room) >= 3 && dOf(room) < dOf(loot)) placed++;
    ok(room !== loot && room !== L.entrance?.room, `tutorial camera is not in the loot / entrance room ${theme} ${s}`);
  }
  ok(K.planCams(L, { ...opts, spots: null })[0]?.tut, 'still planned without spots (fallback)');
}
ok(tried > 10 && placed > 0, `tutorial room was placed between entrance and loot (${placed}/${tried})`);
ok(K.TUT_PAY > 0 && K.TUT_PAY <= 30, 'small tutorial reward');

// ---- strings (EN + TR + RU)
for (const k of ['obj.field_in', 'obj.field_cam']) ok(TEXT[k] && TEXT[k].length === 3 && TEXT[k].every((s) => s && s.length > 3), 'onboard text ' + k);
const pass = 'Clean pass. The Algorithm saw nothing: +▮{n}';
ok(FC_KEYS.includes(pass) && tIn('tr', pass) !== pass && tIn('ru', pass) !== pass, 'clean-pass string translated');
ok(FC_KEYS.some((k) => k.startsWith('Blind spot: the green ring')), 'blind-spot tip mentions the ring');

// ---- every module really consults the budget (one line each, optional chaining)
const need = [['src/game/algorithm.js', 'fr?.algoOk'], ['src/game/objectives.js', 'fr?.only'], ['src/game/game.js', 'fr?.active'], ['src/game/mapmods.js', "fr?.calm?.('mapmods')"], ['src/game/facjobs.js', "fr?.calm?.('facjobs')"],
  ['src/game/host.js', "fr?.calm?.('dailyEvent')"], ['src/game/daily.js', "locked?.('season')"], ['src/game/guide.js', "fr?.calm?.('tips')"], ['src/game/soul.js', 'fr?.lease'], ['src/game/crdirector.js', 'fr?.lease'],
  ['src/game/worlds3.js', 'firstDay(r)'], ['src/game/feedcams2.js', 'firstDay(r)'], ['src/game/feedcams.js', 'fr?.camDone'], ['src/game/lore.js', 'pri: !!opts.pri']];
for (const [f, needle] of need) ok(rd(f).includes(needle), `${f} consults the budget (${needle})`);

if (fails.length) { console.log('FAIL', fails.length); for (const f of fails.slice(0, 40)) console.log(' -', f); process.exit(1); }
console.log('firstrun.test: OK');
