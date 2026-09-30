// Node tests for wave 8 MAP MODS (src/game/mapmods_core.js + the glue with a fake game). node tools/harness/mapmods.test.mjs
globalThis.window = globalThis;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const C = await import('../../src/game/mapmods_core.js');
const I = await import('../../src/core/i18n.js');
const M = await import('../../src/game/mapmods.js');
const BR = await import('../../src/game/balance_rules.js');
const { ITEMS } = await import('../../src/game/items.js');
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };

// ---- rolls: deterministic, gated, structurally valid
ok(JSON.stringify(C.rollMap('s1', 3)) === JSON.stringify(C.rollMap('s1', 3)), 'roll is deterministic');
const stat = (q) => {
  const s = { n: [0, 0, 0], bad: 0 };
  for (let i = 0; i < 4000; i++) {
    const m = C.rollMap('x' + i, q), ids = m.a; s.n[m.r]++;
    const pre = ids.filter((id) => C.AFFIX_BY_ID[id].kind === 'prefix').length;
    if (new Set(ids).size !== ids.length || pre > 2 || ids.length - pre > 2 || ids.length > 3 || ids.some((id) => C.AFFIX_BY_ID[id].minQ > q) || (m.r === 0) !== (ids.length === 0)) s.bad++;
  }
  return s;
};
const s0 = stat(0), s8 = stat(8);
ok(s0.bad === 0 && s8.bad === 0, 'rolls respect distinct / 2+2 / minQ / rarity');
ok(s0.n[2] === 0, 'no Rare before quota 2 (' + s0.n + ')');
ok(s8.n[2] > 300 && s8.n[0] < s0.n[0], 'rarity rises with quota (' + s0.n + ' -> ' + s8.n + ')');
ok(C.AFFIXES.filter((a) => a.minQ === 0).every((a) => !a.fx?.dangerMul || a.fx.dangerMul <= 1.1) && C.AFFIXES.filter((a) => a.minQ === 0).length >= 4, 'quota-0 affixes are gentle');

// ---- effects: balance rules (danger cap, no damage numbers), reward maths, add
let worst = 1;
for (const a of C.AFFIXES) for (const b of C.AFFIXES) for (const c of C.AFFIXES) { const fx = C.effectsOf([a.id, b.id, c.id]); worst = Math.max(worst, fx.dangerMul || 1); }
ok(worst <= C.DANGER_CAP + 1e-9, 'combined dangerMul capped (' + worst + ')');
ok(C.AFFIXES.every((a) => !('dmg' in (a.fx || {})) && !('dmgMul' in (a.fx || {}))), 'no affix changes damage');
const fx = C.effectsOf(['hoarder', 'darkness']);
ok(fx.blackout === true && fx.extraScrap >= 0.5 && fx.valueMul > 1.15 && fx.dangerMul > 1.09, 'effects merge (' + JSON.stringify(fx) + ')');
ok(C.rewardOf(['hoarder', 'darkness']).qty === 30, 'rewards add up');
ok(C.flagsOf(['overclocked', 'echoes', 'silence', 'volatile']).spd === 1.15 && C.flagsOf(['silence']).listen === 1.5, 'flags');
let m = { r: 0, a: [] };
for (let i = 0; i < 5; i++) m = C.addAffix(m, 'add' + i, 5);
ok(m.a.length === 3 && m.r === 2, 'ADD stops at 3 affixes -> Rare');
ok(C.cleanMap({ a: ['infested', 'nope', 'infested'] }).a.length === 1, 'cleanMap drops junk');
ok(BR.capOne(22, 0) <= 45, 'Volatile blast (22) is inside the early hit cap');

// ---- i18n: every affix name + desc + the item has TR and RU
for (const a of C.AFFIXES) for (const k of [a.name, a.desc]) ok(I.hasTranslation('tr', k) && I.hasTranslation('ru', k), 'i18n ' + k);
ok(I.hasTranslation('tr', 'Sector Map') && I.hasTranslation('ru', 'Sector Map') && ITEMS.sectormap?.price > 0 && ITEMS.sectormap.shop === 'consumables', 'item registered + translated');

// ---- glue with a fake game: landing merge, ATLAS reroll/add consume a map, HQ keeps the map
const sent = [], phases = [];
const handlers = {};
const mods = { commands: new Map(), on(ev, fn) { (handlers[ev] ||= []).push(fn); return () => {}; } };
const mapItem = { id: 'i9', type: 'sectormap', holder: 'me', state: 'held', def: ITEMS.sectormap, obj: { position: { x: 0, y: 0, z: 0 } } };
const game = {
  isHost: true, selfId: 'me', mods, later: () => {}, net: { broadcast: (t, d) => sent.push([t, d]), sendTo: (to, t, d) => sent.push([t, d]), on() {}, off() {}, request() {} },
  items: { all: () => [mapItem], inShipItems: () => [], get: () => null }, remotes: new Map(),
  run: { phase: 'orbit', moon: 'hamsi', quotaIndex: 5, day: 3, runId: 'ABC', daysLeft: 3, dailyEvent: { id: 'quiet', name: 'QUIET FEED', desc: 'x', dangerMul: 0.78, valueMul: 0.95 } },
  broadcastRun() {}, hostSetPhase(p, e) { phases.push([p, e]); Object.assign(this.run, e); },
};
const api = M.installMapmods(game);
api.rollNext();
const nxt = JSON.parse(JSON.stringify(game.run.mm.nxt));
ok(!!nxt && Array.isArray(nxt.a), 'orbit roll writes run.mm.nxt');
game.hostSetPhase('landing', {});   // wrapped
const cur = game.run.mm.cur;
if (nxt.a.length) {
  ok(JSON.stringify(cur) === JSON.stringify(nxt) && game.run.mm.nxt === null, 'landing moves nxt -> cur');
  ok(game.run.dailyEvent.name === 'SECTOR MAP' && game.run.dailyEvent.desc !== 'x' && game.run.dailyEvent.mm.length === nxt.a.length && phases[0][1].dailyEvent === game.run.dailyEvent, 'affix numbers merged into the day event, name SECTOR MAP (trim: the affix set replaces the daily event), phase message carries it');
} else ok(cur.a.length === 0, 'normal map lands clean');
game.run.phase = 'orbit'; game.run.dailyEvent = null;
handlers.phase.forEach((f) => f('orbit', game));
ok(game.run.mm.cur === null && !!game.run.mm.nxt, 'orbit clears cur and rolls the next map');
api.hostUse({ op: 'reroll' }, 'me');
ok(sent.some(([t, d]) => t === 'it' && d.e === 'rm' && d.id === 'i9'), 'REROLL consumes the Sector Map');
sent.length = 0; mapItem.holder = 'someone';
api.hostUse({ op: 'add' }, 'me');
ok(sent.length === 1 && sent[0][1].err === true, 'no map in hand -> refused, nothing consumed');
game.run.phase = 'moon'; sent.length = 0; mapItem.holder = 'me';
api.hostUse({ op: 'reroll' }, 'me');
ok(sent[0][1].err === true && !sent.some(([t]) => t === 'it'), 'only usable in orbit');
game.run.phase = 'orbit'; game.run.moon = 'hq'; game.hostSetPhase('landing', {});
ok(game.run.mm.cur === null && !!game.run.mm.nxt, 'HQ landing keeps the map for the next real moon');
ok(typeof api.readout() === 'string' && api.readout().includes('SECTOR MAP'), 'readout text');
api.dispose();
console.log(`mapmods: ${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
