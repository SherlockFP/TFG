// CARRY 2 tests (pure node, wave 8, docs/wave8/carry2.md): node tools/harness/carry2.test.mjs
//  1. rules: sway / turn / crawl vs two-person speed, bump loss range + floor, grip range, crack / line helpers
//  2. module smoke (fake game): bump -> loss + fx + highlight, grip -> co list, throw -> caught / cracked
//  3. items + strings: bulky defs, loot tables, TR + RU for every new key
import * as C from '../../src/game/carry2_core.js';
import { installCarry2 } from '../../src/game/carry2.js';
import { ITEMS, SCRAP_TABLE } from '../../src/game/items.js';
import { HL, hlMake } from '../../src/game/feedcams2_core.js';
import { HL_TEXT } from '../../src/game/feedcams2_i18n.js';
import { tIn } from '../../src/core/i18n.js';
import { MOONS } from '../../src/game/moons.js';
const MOON = Object.keys(MOONS).find((k) => !MOONS[k].company && !MOONS[k].home);

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// 1. rules
const rack = { id: 'cy_rack', hands: 2, weight: 66, bulky: true }, sofa = { id: 'x', hands: 2, weight: 80, kind: 'scrap' }, mug = { id: 'mug', hands: 1, weight: 5 };
ok(C.carryFeel(mug).sway === 0 && C.carryFeel(mug).speed === 1 && C.carryFeel(null).turn === 1, 'light loot: no sway, no slowdown');
const solo = C.carryFeel(rack, 'solo'), co = C.carryFeel(rack, 'co'), heavy = C.carryFeel(sofa, 'solo');
ok(solo.speed < 0.6 && co.speed > 0.9 && co.sway < solo.sway && co.turn > solo.turn, 'bulky: crawl solo, near-normal with a helper, calmer sway');
ok(heavy.sway > 0 && heavy.turn < 1 && heavy.turn >= C.FEEL.heavyTurn && heavy.speed === 1, 'heavy 2-hand loot sways + slower turn, speed left to the weight penalty');
ok(Math.abs(0.8 * C.coopHolderMul(0.8) - C.FEEL.coopSpeed) < 1e-9 && C.coopHolderMul(1) === C.FEEL.coopSpeed, 'holder speed cancels the weight penalty');
ok(C.bumpPct(2, 1) === 0 && C.bumpPct(9, 0) === 0, 'soft bump / non-fragile: no loss');
ok(C.bumpPct(3, 0.35) >= 0.05 && C.bumpPct(20, 1.2) <= 0.25 && C.bumpPct(6, 1) > C.bumpPct(3.5, 1), 'fragile bump 5..25 %, grows with speed');
ok(C.lossOf(200, 200, 0.25) === 50 && C.lossOf(200, 80, 0.25) === 10 && C.lossOf(200, 70, 0.25) === 0 && C.lossOf(0, 0, 0.25) === 0, 'loss: pct of base, floor 35 %');
ok(C.isBump(5, 0.5) && !C.isBump(5, 2.5) && !C.isBump(2, 0), 'bump = a hard stop from speed');
const hp = { x: 0, y: 0, z: 0 }, pp = { x: 3, y: 0, z: 0 };
ok(C.canGrip(rack, 'a', 'b', hp, pp) && !C.canGrip(rack, 'a', 'a', hp, hp) && !C.canGrip(mug, 'a', 'b', hp, pp) && !C.canGrip(rack, 'a', 'b', hp, { x: 9, y: 0, z: 0 }), 'grip: bulky only, other player, in range');
ok(C.crackPct(0.35) >= 0.12 && C.crackPct(2) <= 0.25 && C.throwable({ fragile: 0.5, kind: 'scrap' }) && !C.throwable({ fragile: 1, kind: 'big' }) && !C.throwable(mug), 'throw: fragile hand items only, crack 12..25 %');
ok(C.isBreak(100, 20) && !C.isBreak(100, 6) && !C.isBreak(400, 20), 'breakage threshold');

// 2. module smoke
{
  const handlers = new Map(), H = new Map(), sent = [], recs = [], said = [], dmg = [];
  const mods = { on(ev, fn) { (handlers.get(ev) || handlers.set(ev, []).get(ev)).push(fn); return () => {}; }, emit(ev, ...a) { for (const f of handlers.get(ev) || []) f(...a); } };
  const items = new Map();
  const mk = (id, holder, def) => ({ id, holder, def, value: 200, baseValue: 200, state: holder ? 'held' : 'world', lastHolder: holder, obj: { position: { x: 0, y: 1, z: 0 } }, body: { linvel: () => ({ x: 0, y: 0, z: 0 }) } });
  const game = {
    mods, isHost: true, selfId: 'h', time: 100, run: { phase: 'moon', moon: MOON },
    net: { broadcast: (k, d) => sent.push([k, d]), request: (k, d) => H.get(k)?.(d, 'a'), on_() {}, on() {}, off() {} },
    items: { get: (id) => items.get(id), all: () => items.values() },
    player: { pos: { x: 0, y: 0, z: 0 }, heldItem: () => null }, remotes: new Map([['a', { pos: { x: 0, y: 0, z: 0 } }], ['b', { pos: { x: 2, y: 0, z: 0 } }]]),
    playerName: (id) => id, hostDamageItem: (id, n) => { dmg.push([id, n]); const it = items.get(id); it.value -= n; },
    feedcams: { meter: () => ({ live: true }), sees: () => true }, feedcams2: { record: (...a) => recs.push(a) }, lore: { say: (s) => said.push(s) },
    dropItem() {}, engine: {}, ui: {}, audio: {},
  };
  const api = installCarry2(game);
  mods.emit('registerHandlers', (k, fn) => H.set(k, fn), game);
  const fxs = (k) => sent.filter(([m, d]) => m === 'cy2fx' && d.k === k).map(([, d]) => d);
  const vase = mk('v1', 'a', { name: 'Vase', fragile: 1, kind: 'scrap', hands: 2, weight: 40 });
  items.set('v1', vase);
  H.get('cy2q')({ op: 'bump', id: 'v1', s: 6 }, 'a');
  ok(dmg.length === 1 && dmg[0][1] >= 10 && dmg[0][1] <= 50 && fxs('brk').length === 1, 'hard bump: value lost (<= 25 %), crunch fx');
  ok(recs.some((r) => r[0] === 'crack') && fxs('brk')[0].ln >= 0, 'breakage on camera: highlight + Algorithm line index');
  H.get('cy2q')({ op: 'bump', id: 'v1', s: 6 }, 'a');
  ok(dmg.length === 1, 'bump cooldown');
  game.time += 3; H.get('cy2q')({ op: 'bump', id: 'v1', s: 2 }, 'a');
  ok(dmg.length === 1, 'soft bump ignored');
  const core = mk('c1', 'a', ITEMS.fj_core || { id: 'fj_core', bulky: true, hands: 2, weight: 38 }); items.set('c1', core);
  ok(ITEMS.fj_core?.bulky !== false, 'server core flagged bulky when registered');
  const bulk = mk('r1', 'a', { ...ITEMS.cy_rack });
  items.set('r1', bulk);
  H.get('cy2q')({ op: 'grip', id: 'r1', on: 1 }, 'b');
  ok(fxs('co').at(-1)?.l?.[0]?.[1] === 'b', 'grip: helper registered and broadcast');
  H.get('cy2q')({ op: 'grip', id: 'r1', on: 1 }, 'a');
  ok(api.state.coHost.get('r1')?.by === 'b', 'the carrier cannot grip its own item');
  game.time += 2; mods.emit('update', 0.016, game);
  ok(!api.state.coHost.has('r1') && fxs('co').at(-1).l.length === 0, 'grip lapses without keepalive');
  // throw -> lands and cracks / caught keeps value
  const cup = mk('t1', null, { name: 'Flask', fragile: 0.5, kind: 'scrap', hands: 1, weight: 5 }); cup.lastHolder = 'a'; items.set('t1', cup);
  H.get('cy2q')({ op: 'throw', id: 't1' }, 'a');
  ok(fxs('throw').length === 1, 'throw announced');
  const n0 = dmg.length; game.time += 1; mods.emit('update', 0.5, game);
  ok(dmg.length === n0 + 1 && cup.value >= Math.ceil(200 * C.BUMP.floor), 'uncaught throw cracks (within the floor)');
  const cup2 = mk('t2', null, { name: 'Flask', fragile: 0.5, kind: 'scrap', hands: 1, weight: 5 }); cup2.lastHolder = 'a'; items.set('t2', cup2);
  H.get('cy2q')({ op: 'throw', id: 't2' }, 'a');
  cup2.holder = 'b'; cup2.state = 'held'; const n1 = dmg.length; mods.emit('update', 0.5, game);
  ok(dmg.length === n1 && fxs('catch').length === 1 && recs.some((r) => r[0] === 'catch'), 'caught throw keeps its value + catch fx + highlight');
  api.dispose();
}

// 3. items + strings
for (const d of C.ITEM_DEFS) { ok(ITEMS[d.id]?.hands === 2 && ITEMS[d.id].fragile > 0 && ITEMS[d.id].bulky, d.id + ' registered'); ok(tIn('tr', d.name) !== d.name && tIn('ru', d.name) !== d.name, 'name TR/RU ' + d.id); ok(tIn('tr', d.tip) !== d.tip && tIn('ru', d.tip) !== d.tip, 'tip TR/RU ' + d.id); }
for (const [th, rows] of Object.entries(C.LOOT)) for (const [id] of rows) ok(SCRAP_TABLE[th]?.some((e) => e[0] === id), `loot ${id} in ${th}`);
for (const k of ['crack', 'catch']) { ok(HL[k] && HL_TEXT[k] && hlMake(k, 'A', 40)[4] > 0, 'highlight ' + k); ok(tIn('tr', HL_TEXT[k]) !== HL_TEXT[k] && tIn('ru', HL_TEXT[k]) !== HL_TEXT[k], 'highlight TR/RU ' + k); }
for (const k of [...C.LINES, 'Catch the {name} [E]', 'Help carry the {name} [hold E]', '{name} is helping you carry the {item}.', 'You share the load of the {item}.', 'The grip slips. Back to crawling.', 'Nice catch. Not a crack.']) {
  ok(tIn('tr', k) !== k, 'missing TR: ' + k.slice(0, 40)); ok(tIn('ru', k) !== k, 'missing RU: ' + k.slice(0, 40));
}

console.log(`carry2: ${fails.length ? 'FAIL' : 'ok'}`);
for (const f of fails) console.log('  x ' + f);
process.exit(fails.length ? 1 : 0);
