// ROUTE BOARD test (wave 8, docs/wave8/routeboard.md): the campaign route ladder (3 hero moons, +2 per quota), the 3 cards of the day,
// payout / hook / art data, EN/TR/RU text, and the host's ROUTE guard on a stub terminal.  Run: node tools/harness/routeboard.test.mjs
globalThis.window = globalThis.window || {};
const C = await import('../../src/game/routeboard_core.js');
const { MOONS, MOON_ORDER, BIOMES } = await import('../../src/game/moons.js');
await import('../../src/world/maps5_data.js');   // registers E9-Estate (a hero) + Cold Storage
await import('../../src/world/worlds2_data.js');
const { ITEMS, scrapTableFor } = await import('../../src/game/items.js');
const { scrapCountFor, scrapValueMul } = await import('../../src/game/progression.js');
const { installRouteboard, RB_TEXT } = await import('../../src/game/routeboard.js');
const { setLang, t } = await import('../../src/core/i18n.js');

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
const moons = () => MOON_ORDER.map((id) => MOONS[id]).filter(Boolean);
const ids = (list) => list.map((m) => m.id);

// ---- 1. the ladder: 3 distinct hero moons (different interiors + biomes), everything else waits
ok(C.HERO.length === 3 && C.HERO.every((id) => MOONS[id]), 'three hero moons, all registered');
ok(new Set(C.HERO.map((id) => MOONS[id].interior)).size === 3 && new Set(C.HERO.map((id) => MOONS[id].biome)).size === 3, 'hero moons: three different interiors and biomes');
ok(MOONS[C.HERO[0]].tier === 1 && !MOONS[C.HERO[0]].cost, 'the first hero is a free tier-1 moon (the Hiring Day route)');
const q0 = { all: false, q: 0 };
const open0 = moons().filter((m) => C.cardable(m) && C.routeOpen(m, q0));
ok(JSON.stringify(ids(open0).sort()) === JSON.stringify([...C.HERO].sort()), 'quota 0: only the heroes are open: ' + ids(open0));
ok(C.routeOpen(MOONS.hq, q0), 'HQ is always open (selling)');
ok(C.routeOpen({ id: 'home', home: true }, q0) && C.routeOpen({ id: 'cy', instance: true }, q0) && C.routeOpen({ id: 'v', voyage: true }, q0), 'homeworld / instance / voyage moons are ruled by their own modules');
ok(!C.routeOpen({ id: 'g1', generated: true }, { all: false, q: C.SECTOR_Q - 1 }) && C.routeOpen({ id: 'g1', generated: true }, { all: false, q: C.SECTOR_Q }), 'generated sector servers open at quota ' + C.SECTOR_Q);
ok(!C.routeOpen({ id: 'modmoon' }, { all: false, q: 4 }) && C.routeOpen({ id: 'modmoon' }, { all: false, q: C.LATE_Q }), 'unknown moons wait for the Deep Feed (quota ' + C.LATE_Q + ')');
ok(C.routeOpen(MOONS.orkinos, null) && C.routeOpen(MOONS.orkinos, { all: true, q: 0 }), 'veterans / unlock-all / Quick Shift (hub null): every route is open');
let prev = open0.length;
for (let q = 1; q <= 4; q++) {
  const n = moons().filter((m) => C.cardable(m) && C.routeOpen(m, { all: false, q })).length;
  ok(n > prev && n - prev <= 2, `quota ${q}: +1..2 routes (${prev} -> ${n})`);
  prev = n;
}
ok(C.LADDER.flatMap((s) => s.ids).every((id) => C.HOOKS[id]), 'every ladder moon has a hook');
ok(JSON.stringify(C.openedAt(moons(), 1).sort()) === JSON.stringify(['lufer', 'palamut']), 'quota 1 opens Forum + Guestbook');
ok(C.nextStep(0).q === 1 && C.nextStep(4) === null, 'next ladder step');

// ---- 2. the cards of the day
const run = { moon: 'hamsi', seed: 1234, day: 1, quotaIndex: 0 };
ok(JSON.stringify(ids(C.pickCards(moons(), q0, run))) === JSON.stringify(['hamsi', 'levrek', 'm5est']), 'quota 0: the three heroes, the current route first');
ok(ids(C.pickCards(moons(), q0, { ...run, moon: 'm5est' }))[0] === 'm5est', 'the current route leads');
const c1 = ids(C.pickCards(moons(), { all: false, q: 1 }, run));
ok(c1.length === 3 && c1[0] === 'hamsi' && c1.includes('lufer') && c1.includes('palamut'), 'quota 1: current + the two new routes: ' + c1);
const all = { all: false, q: 9 };
const a1 = ids(C.pickCards(moons(), all, { ...run, moon: 'hq', day: 3 })), a2 = ids(C.pickCards(moons(), all, { ...run, moon: 'hq', day: 3 }));
ok(a1.length === 3 && JSON.stringify(a1) === JSON.stringify(a2), 'deterministic per seed + day');
let differs = false; for (let d = 4; d < 12 && !differs; d++) differs = JSON.stringify(ids(C.pickCards(moons(), all, { ...run, moon: 'hq', day: d }))) !== JSON.stringify(a1);
ok(differs, 'the daily order rotates');
ok(C.pickCards(moons(), null, run).length === 3 && !C.pickCards(moons(), null, run).some((m) => m.company || m.generated), 'never HQ or generated servers on a card');

// ---- 3. numbers + art
for (const id of C.HERO) {
  const m = MOONS[id];
  const avg = C.tableAvg(scrapTableFor(m.interior), (i) => ITEMS[i]?.value);
  const [lo, hi] = C.payout(m, 0, avg, scrapCountFor, scrapValueMul);
  ok(lo > 50 && hi > lo && hi < 5000, `${id} payout ▮${lo}-${hi}`);
  ok(C.silhouetteOf(m.interior) !== C.SILHOUETTE.generic, `${id} has its own interior silhouette (${m.interior})`);
  ok(C.bands(BIOMES[m.biome]).every((c) => /^#[0-9a-f]{6}$/.test(c)), `${id} palette bands`);
}
const pOrk = C.payout(MOONS.orkinos, 0, [30, 50]), pHam = C.payout(MOONS.hamsi, 0, [30, 50]);
ok(pOrk[1] > pHam[1], 'a harder moon pays more');
ok(C.pips(3).filter(Boolean).length === 3 && C.pips(3).length === 5, 'danger pips');
ok(C.hookOf({ id: 'x', desc: 'First sentence. Second one.' }) === 'First sentence.', 'hook fallback: the first sentence of desc');
for (const d of Object.values(C.SILHOUETTE)) ok(/^[MmLlHhVvAaQqZz0-9 .,-]+$/.test(d), 'silhouette path is plain SVG path data');

// ---- 4. text: EN / TR / RU with matching placeholders
const ph = (s) => (s.match(/\{@?\w+\}/g) || []).sort().join(',');
for (const [k, v] of [...Object.entries(RB_TEXT), ...Object.entries(C.HOOKS)]) {
  ok(v.length === 3 && v.every((s) => typeof s === 'string' && s.trim()), 'three languages: ' + k);
  ok(ph(v[0]) === ph(v[1]) && ph(v[0]) === ph(v[2]), 'placeholders match: ' + k);
}
setLang('tr'); ok(t(C.HOOKS.levrek[0]) === C.HOOKS.levrek[1] && t(RB_TEXT['rb.title'][0]) === 'ROTA PANOSU', 'TR resolves');
setLang('ru'); ok(t(RB_TEXT['rb.title'][0]) === 'ДОСКА МАРШРУТОВ', 'RU resolves');
setLang('en');

// ---- 5. install: the host refuses a ROUTE the ladder has not opened (stub terminal, no DOM)
{
  const listeners = {};
  const sent = [], routed = [];
  const term = { active: false, hostExecute(cmd) { routed.push(cmd.moon); }, exec() { return 'orig'; }, open() { this.active = true; }, print() {} };
  const game = {
    mods: { on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); }; } },
    terminal: term, isHost: true, settings: {}, run: { phase: 'orbit', moon: 'hamsi', quotaIndex: 0, day: 1, seed: 5 },
    onboard: { unlocks: () => ({ mode: 'staged', q: 0 }) },
    net: { sendTo: (to, type, d) => sent.push([to, type, d]) },
  };
  const api = installRouteboard(game);
  ok(api && typeof api.dispose === 'function', 'module installs');
  term.hostExecute({ op: 'route', moon: 'lufer' }, 'p2');
  ok(!routed.includes('lufer') && sent.length === 1 && sent[0][1] === 'term' && sent[0][2].err && /quota 1/.test(sent[0][2].text), 'locked route refused with a translatable message');
  term.hostExecute({ op: 'route', moon: 'levrek' }, 'p2');
  term.hostExecute({ op: 'route', moon: 'hq' }, 'p2');
  ok(routed.includes('levrek') && routed.includes('hq'), 'hero moon + HQ pass through');
  ok(/QUOTA 2/.test(api.lockTag(MOONS.cipura)) && api.lockTag(MOONS.hamsi) === '', 'MOONS ALL lock tags');
  ok(JSON.stringify(api.cards()) === JSON.stringify(['hamsi', 'levrek', 'm5est']), 'api.cards at quota 0');
  const d = api.data();
  ok(d.length === 3 && d[0].cur && d.every((c) => c.pay[1] > c.pay[0] && c.hook && c.danger >= 1), 'card data complete');
  game.onboard.unlocks = () => ({ mode: 'all', q: 0 });
  term.hostExecute({ op: 'route', moon: 'orkinos' }, 'p2');
  ok(routed.includes('orkinos'), "veteran ('all' ladder): nothing gated");
  game.onboard.unlocks = () => ({ mode: 'staged', q: 0 }); game.run.quick = { v: 1 };
  term.hostExecute({ op: 'route', moon: 'cipura' }, 'p2');
  ok(routed.includes('cipura'), 'Quick Shift: nothing gated');
  delete game.run.quick;
  ok(term.exec('moons all') === 'orig' && term.exec('buy shovel') === 'orig', 'MOONS ALL + other commands reach the original terminal');
  api.dispose();
  term.hostExecute({ op: 'route', moon: 'palamut' }, 'p2');
  ok(routed.includes('palamut'), 'dispose restores hostExecute');
}

// Real installed capture listener: pasted/history-filled terminal input wins over board selection.
{
  const oldDocument = globalThis.document;
  const element = () => { const classes = new Set(); return { innerHTML:'', style:{}, set className(v) { for(const c of v.split(' ')) classes.add(c); }, classList:{contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c)}, appendChild(){},addEventListener(){},remove(){} }; };
  globalThis.document = { createElement:element, head:{appendChild(){}} };
  const screen=element(), capture=new Map(), printed=[];
  const inp={value:'',focus(){}};
  const term={active:true,inp,el:{querySelector:()=>screen,addEventListener:(key,fn)=>capture.set(key,fn),removeEventListener(){}},exec(){},open(){this.active=true;},print:text=>printed.push(text)};
  const game={terminal:term,mods:{on:()=>()=>{}},run:{phase:'orbit',moon:'hamsi',day:1,seed:5},settings:{}};
  const api=installRouteboard(game);api.show();
  let prevented=false,stopped=false;
  inp.value='route hq';capture.get('keydown')({target:inp,key:'Enter',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
  ok(!prevented&&!stopped&&!api.visible()&&inp.value==='route hq'&&printed.length===0,'nonempty real command reaches input submit unchanged; board does not route');
  inp.value='';api.show();capture.get('keydown')({target:inp,key:'Enter',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
  ok(prevented&&stopped&&printed.some(v=>v.includes('Already routed')),'empty Enter still selects the board current route');
  api.dispose();if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
}

console.log(fails ? `FAILED ${fails}/${checks}` : `routeboard: all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
