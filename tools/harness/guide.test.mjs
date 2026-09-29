// node tools/harness/guide.test.mjs - GUIDE module (wave 4): registry integrity, i18n completeness, tip selection (cooldown / used flags /
// repeat gap / context), tutorial completion from events, panel classification, lookup + "did you mean".
import fs from 'node:fs';
import { FEATURES, TUT_STEPS, TUT_DONE_SAY, TUT_START_SAY, UI, CATS, CTX_FLAGS, HIDDEN_CMDS, CMD_ALIAS, pick } from '../../src/game/guide_data.js';
import * as C from '../../src/game/guide_core.js';

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.error('FAIL', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);

// ------------------------------------------------------------------ registry integrity
const ids = new Set();
for (const f of FEATURES) {
  ok(!ids.has(f.id), 'duplicate feature id ' + f.id); ids.add(f.id);
  ok(CATS[f.cat], `feature ${f.id}: unknown category ${f.cat}`);
  for (const w of f.when || []) ok(CTX_FLAGS.includes(w), `feature ${f.id}: unknown context flag ${w}`);
  if (f.alias) ok(FEATURES.some((x) => x.id === f.alias && !x.hidden), `feature ${f.id}: alias ${f.alias} missing / hidden`);
  ok(f.prio >= 1 && f.prio <= 10, `feature ${f.id}: prio out of range`);
  ok(Array.isArray(f.tips), `feature ${f.id}: tips`);
  if (!f.hidden) ok(f.tips.length > 0, `feature ${f.id}: no tip`);
}
for (const [k, v] of Object.entries(CMD_ALIAS)) ok(FEATURES.some((f) => f.id === v), `CMD_ALIAS ${k} -> ${v} missing`);
ok(FEATURES.filter((f) => !f.hidden).length >= 30, 'at least 30 visible features');

// every terminal command registered anywhere in the source is either documented in the registry or intentionally hidden
const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const walk = (d, out = []) => { for (const e of fs.readdirSync(new URL('../../' + d, import.meta.url), { withFileTypes: true })) { const p = d + '/' + e.name; if (e.isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p); } return out; };
const registered = new Set();
for (const f of [...walk('src'), ...walk('public/mods')]) {
  const s = src(f);
  for (const m of s.matchAll(/registerCommand\??\.?\(\s*'([a-z_]+)'/g)) registered.add(m[1]);
  for (const m of s.matchAll(/\breg\(\s*'([a-z_]+)'/g)) if (f.includes('cycle_console')) registered.add(m[1]);
  for (const m of s.matchAll(/commands\.set\(\s*'([a-z_]+)'/g)) registered.add(m[1]);
}
for (const w of ['guide', 'tips', 'tutorial']) registered.delete(w);
const uncovered = [...registered].filter((w) => !C.CMD_MAP.has(w) && !HIDDEN_CMDS.has(w));
// commands without a hand-written entry still appear in GUIDE ALL (auto-collected), but the important ones must be documented
const MUST = ['role', 'tree', 'respec', 'craft', 'recipes', 'shipyard', 'home', 'pets', 'trade', 'contracts', 'factions', 'logs', 'cases', 'keystone', 'raid', 'core', 'cycle', 'van', 'deals', 'inventory', 'reroll', 'facility', 'siege'];
for (const w of MUST) if (registered.has(w)) ok(C.CMD_MAP.has(w) || HIDDEN_CMDS.has(w), 'important command not documented: ' + w);
console.log('terminal commands found in source:', registered.size, ' undocumented (auto-collected at runtime):', uncovered.join(' ') || '-');

// ------------------------------------------------------------------ i18n completeness (EN / TR / RU)
const ph = (s) => [...String(s).matchAll(/\{\w+\}/g)].map((m) => m[0]).sort().join(',');
const CYR = /[Ѐ-ӿ]/;
const TRC = /[çğıöşüÇĞİÖŞÜ]/;
function checkTriple(arr, where, { maxEn = 400, allowEmpty = false, ident = false } = {}) {
  ok(Array.isArray(arr) && arr.length === 3, `${where}: not an [en, tr, ru] triple`);
  if (!Array.isArray(arr) || arr.length !== 3) return;
  const [en, tr, ru] = arr;
  if (allowEmpty && !en && !tr && !ru) return;
  ok(en && tr && ru, `${where}: empty translation`);
  ok(String(en).length <= maxEn, `${where}: EN too long (${String(en).length})`);
  ok(ph(en) === ph(tr) && ph(en) === ph(ru), `${where}: placeholders differ`);
  if (!ident && en.length > 24) { ok(tr !== en, `${where}: TR equals EN`); ok(ru !== en, `${where}: RU equals EN`); ok(CYR.test(ru), `${where}: RU has no Cyrillic`); ok(!CYR.test(tr), `${where}: TR has Cyrillic`); }
  if (!ident && en.length > 40) ok(TRC.test(tr) || /[a-z]/.test(tr), `${where}: TR suspicious`);
}
for (const f of FEATURES) {
  checkTriple(f.name, `${f.id}.name`, { maxEn: 40, ident: true });
  checkTriple(f.how, `${f.id}.how`, { allowEmpty: !!f.hidden });
  (f.tips || []).forEach((t, i) => checkTriple(t, `${f.id}.tips[${i}]`, { maxEn: 135 }));
}
for (const [k, v] of Object.entries(CATS)) checkTriple(v, 'CATS.' + k, { ident: true });
for (const s of TUT_STEPS) { checkTriple(s.obj, `tut ${s.id}.obj`, { maxEn: 120 }); if (s.obj2) checkTriple(s.obj2, `tut ${s.id}.obj2`); checkTriple(s.say, `tut ${s.id}.say`, { maxEn: 135 }); }
checkTriple(TUT_DONE_SAY, 'TUT_DONE_SAY', { maxEn: 160 }); checkTriple(TUT_START_SAY, 'TUT_START_SAY', { maxEn: 160 });
for (const [k, v] of Object.entries(UI)) checkTriple(v, 'UI.' + k, { ident: v[0].length < 30 || k === 'tut_usage' });
ok(TUT_STEPS.length >= 5 && TUT_STEPS.length <= 7, 'tutorial has 5-7 steps');
// the words a tip tells the player to type must exist as real commands (a typo in a tip would send players nowhere)
const CMDISH = /\b(STORE|BUY|MOONS|ROUTE|SECTOR|INFO|BESTIARY|CODES|CREW|SWITCH|CRAFT|RECIPES|SHIPYARD|VAN|ROLE|TREE|RESPEC|CONTRACTS|ACCEPT|SIGN|TRIBUTE|FACTIONS|LOGS|LOG|CASES|CASE|HOME|PETS|TRADE|CYCLE|CORE|KEYSTONE|RAID|QUOTA|DEALS|GUIDE|TUTORIAL|ENDLESS|NOCLIP)\b/g;
const KNOWN_WORDS = new Set([...registered, ...C.CMD_MAP.keys(), 'store', 'buy', 'moons', 'route', 'sector', 'info', 'bestiary', 'codes', 'crew', 'switch', 'quota', 'guide', 'tutorial', 'tips']);
for (const f of FEATURES) for (const t of f.tips || []) for (const m of t[0].matchAll(CMDISH)) ok(KNOWN_WORDS.has(m[1].toLowerCase()), `${f.id}: tip mentions unknown command ${m[1]}`);

// ------------------------------------------------------------------ tip selection
const fresh = () => C.ensureState({});
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const session = (o = {}) => ({ t: 1000, lastTipT: -Infinity, muted: false, tutorial: false, ...o });
const F = (...n) => new Set(n);
const opts = { rng: () => 0.1, now: 1e12, has: () => true, level: 5 };
{
  const g = fresh();
  ok(C.selectTip(g, F('orbit', 'rich'), session({ t: 30 }), opts) === null, 'no tip in the start grace');
  ok(C.selectTip(g, F('orbit', 'rich'), session({ muted: true }), opts) === null, 'muted -> no tip');
  ok(C.selectTip(g, F('orbit', 'rich'), session({ tutorial: true }), opts) === null, 'tutorial running -> no tip');
  const p = C.selectTip(g, F('orbit', 'rich'), session(), opts);
  ok(p && p.id === 'store', 'rich in orbit -> STORE tip, got ' + p?.id);
  ok(/STORE/.test(C.tipText(p.feature, p.i, 'en')), 'store tip names the command');
  // cooldown
  ok(C.selectTip(g, F('orbit', 'rich'), session({ t: 1100, lastTipT: 1000 }), opts) === null, 'inside the cooldown (100 s) -> null');
  ok(C.selectTip(g, F('orbit', 'rich'), session({ t: 1030, lastTipT: 1000 }), opts) === null, 'inside the relax gap -> null even for urgent');
  ok(C.selectTip(g, F('orbit', 'rich'), session({ t: 1000 + C.COOLDOWN_S + 1, lastTipT: 1000 }), opts) !== null, 'after the cooldown -> tip');
  // urgent (prio >= 9) tips may cut the cooldown once the relax gap has passed
  const u = C.selectTip(g, F('orbit', 'skillpts'), session({ t: 1000 + C.RELAX_GAP_S + 1, lastTipT: 1000 }), opts);
  ok(u && u.id === 'skilltree', 'unspent skill points is an urgent tip: ' + u?.id);
  const nu = C.selectTip(g, F('orbit', 'rich'), session({ t: 1000 + C.RELAX_GAP_S + 1, lastTipT: 1000 }), opts);
  ok(nu === null, 'non-urgent tip must wait for the full cooldown');
  const sb = C.selectTip(g, F('moon', 'skillbook'), session(), opts);
  ok(sb && sb.id === 'magic', 'skillbook in hand -> magic hint: ' + sb?.id);
  const lo = C.selectTip(g, F('moon', 'lowhp', 'hurt'), session(), opts);
  ok(lo && lo.id === 'food', 'low hp -> food hint: ' + lo?.id);
  const fl = C.selectTip(g, F('moon', 'indoor', 'noflash'), session(), opts);
  ok(fl && fl.id === 'flashlight', 'indoors without a light -> flashlight: ' + fl?.id);
}
{
  // used flags
  const g = fresh();
  C.markUsed(g, 'store', 5);
  const p = C.selectTip(g, F('orbit', 'rich'), session(), opts);
  ok(!p || p.id !== 'store', 'used feature is never suggested');
  ok(C.isUsed(g, 'store') && !C.markUsed(g, 'store'), 'markUsed returns false the second time');
  // hidden variants share the used flag of the feature they alias
  const g2 = fresh();
  C.markUsed(g2, 'inventory');
  const p2 = C.selectTip(g2, F('moon', 'invfull'), session(), opts);
  ok(!p2 || p2.canon !== 'inventory', 'alias: using inventory silences inventory_full');
  const g3 = fresh();
  const p3 = C.selectTip(g3, F('moon', 'invfull'), session(), opts);
  ok(p3 && p3.canon === 'inventory' && p3.id === 'inventory_full', 'full slots -> contextual inventory tip: ' + p3?.id);
  // needs
  const g4 = fresh();
  ok(C.selectTip(g4, F('daily'), session(), { ...opts, has: () => false }) === null || C.selectTip(g4, F('daily'), session(), { ...opts, has: () => false }).id !== 'daily', 'feature that needs a missing module is not suggested');
  const pd = C.selectTip(g4, F('daily'), session(), { ...opts, has: (n) => n === 'daily' });
  ok(pd && pd.id === 'daily', 'daily reward tip when the module exists');
}
{
  // repeat gap + max shown + tip rotation
  const g = fresh();
  const flags = F('orbit', 'rich');
  let now = 1e12, shownIds = [];
  for (let i = 0; i < 12; i++) {
    const p = C.selectTip(g, flags, session(), { ...opts, now });
    if (!p) break;
    ok(!g.shown[p.id] || now - g.shown[p.id].t >= C.REPEAT_GAP_MS, 'same tip repeated inside the gap');
    C.recordShown(g, p.id, p.i, now);
    shownIds.push(p.id);
    now += C.REPEAT_GAP_MS + 1;
  }
  for (const [id, sh] of Object.entries(g.shown)) ok(sh.n <= C.MAX_SHOWN, `${id} shown ${sh.n} > MAX_SHOWN`);
  const g5 = fresh();
  C.recordShown(g5, 'store', 0, 1e12);
  ok(C.selectTip(g5, F('orbit', 'rich'), session(), { ...opts, now: 1e12 + 1000 })?.id !== 'store', 'tip shown 1 s ago is not repeated');
  const t2 = C.selectTip(g5, F('orbit', 'rich'), session(), { ...opts, now: 1e12 + C.REPEAT_GAP_MS + 1 });
  ok(t2 && t2.id === 'store' && t2.i === 1, 'the second showing rotates to the next variant: ' + JSON.stringify(t2 && [t2.id, t2.i]));
  // a full session simulation: over 3 hours of play the advisor never fires faster than the cooldown
  const g6 = fresh();
  let last = -Infinity, n = 0, tsim = 0, gaps = [];
  let nowms = 1e12;
  const rng = seq(0.3, 0.7, 0.5, 0.9);
  for (; tsim < 3 * 3600; tsim += 1) {
    nowms += 1000;
    const p = C.selectTip(g6, F('orbit', 'moon', 'rich', 'wealthy', 'crew', 'lvl3', 'day2', 'coins', 'skillpts', 'lowhp', 'quotaMet', 'company', 'indoor', 'noflash', 'seencreature'), { t: tsim, lastTipT: last, muted: false, tutorial: false, count: n }, { rng, now: nowms, has: () => true, level: 6, cooldown: C.COOLDOWN_S });
    if (p) { C.recordShown(g6, p.id, p.i, nowms); if (last > -Infinity) gaps.push(tsim - last); last = tsim; n++; }
  }
  ok(n > 5 && n <= C.MAX_PER_SESSION + 6, `3 h of play gives a sane number of tips (${n})`);
  ok(gaps.every((x) => x >= C.RELAX_GAP_S), 'no two tips closer than the relax gap');
  ok(gaps.filter((x) => x < C.COOLDOWN_S).length <= n / 2, 'most tips respect the full cooldown');
}
{
  // GUIDE list: untried features, relevant-now first, used ones are gone
  const g = fresh();
  const all = C.untried(g, F(), opts);
  ok(all.length >= 30, 'untried list is long for a new player: ' + all.length);
  const rel = C.untried(g, F('orbit', 'rich', 'skillpts'), opts);
  ok(['skilltree', 'store'].includes(rel[0].f.id), 'relevant features first: ' + rel[0].f.id);
  C.markUsed(g, 'skilltree');
  ok(!C.untried(g, F('skillpts'), opts).some((e) => e.f.id === 'skilltree'), 'tried feature leaves the list');
  ok(!all.some((e) => e.f.hidden), 'hidden variants are never listed');
  ok(!C.untried(fresh(), F(), { ...opts, has: () => false }).some((e) => e.f.id === 'daily'), 'module-gated feature hidden');
}

// ------------------------------------------------------------------ tutorial
{
  const g = fresh();
  eq(C.tutInit(g, false), 'run', 'new player runs the tutorial');
  ok(C.tutRunning(g) && C.tutCurrent(g).id === TUT_STEPS[0].id, 'first step is current');
  // move needs distance + sprint + crouch
  let r = C.tutEvent(g, 'move', { d: 2, sprint: false, crouch: false });
  eq(r.steps, [], 'walking alone does not finish the move step');
  for (let i = 0; i < 5; i++) C.tutEvent(g, 'move', { d: 2 });
  r = C.tutEvent(g, 'move', { d: 0.1, sprint: true });
  eq(r.steps, [], 'still needs crouch');
  ok(C.tutStepProgress(g, 'move') > 0.6 && C.tutStepProgress(g, 'move') < 1, 'partial move progress ' + C.tutStepProgress(g, 'move'));
  r = C.tutEvent(g, 'move', { d: 0.1, crouch: true });
  eq(r.steps, ['move'], 'move step completes with distance + sprint + crouch');
  ok(C.tutCurrent(g).id === 'light', 'next step is the flashlight');
  // out-of-order completion: sell before scrap, inv before light
  r = C.tutEvent(g, 'sell'); eq(r.steps, ['sell'], 'steps complete in any order');
  r = C.tutEvent(g, 'inv'); eq(r.steps, ['inv'], 'inventory step');
  eq(C.tutEvent(g, 'inv').steps, [], 'a step completes once');
  ok(C.tutCurrent(g).id === 'light', 'the current step is the first NOT done one');
  C.tutEvent(g, 'flash'); C.tutEvent(g, 'scan'); C.tutEvent(g, 'ship');
  ok(C.tutRunning(g) && C.tutCurrent(g).id === 'scrap', 'scrap still missing');
  r = C.tutEvent(g, 'scrap');
  ok(r.finished && g.tut.s === 'done' && C.tutCurrent(g) === null, 'tutorial finishes by itself');
  eq(C.tutEvent(g, 'flash').steps, [], 'no events after finishing');
  eq(C.tutDoneCount(g), C.TUT_TOTAL, 'all steps counted');
  // restart / skip
  const snap = JSON.parse(JSON.stringify(g));
  const p = { guide: g };
  C.resetTutorial(p);
  ok(p.guide.tut.s === 'run' && C.tutDoneCount(p.guide) === 0 && p.guide.tut.runs === 1, 'resetTutorial restarts (advisor history stays)');
  ok(C.tutSkip(p.guide) && p.guide.tut.s === 'skip', 'skip');
  ok(!C.tutSkip(p.guide), 'skipping twice is a no-op');
  eq(C.tutEvent(p.guide, 'scrap').steps, [], 'events do nothing after a skip');
  ok(C.selectTip(p.guide, F('orbit', 'rich'), session(), opts) !== null, 'advisor tips are allowed once the tutorial is skipped');
  // veterans never get the tutorial
  const v = fresh();
  eq(C.tutInit(v, true), 'skip', 'veteran profile skips silently'); ok(v.tut.auto === 1, 'auto flag');
  eq(C.tutInit(v, false), 'skip', 'decision is made only once');
  // survives a JSON round trip (profile save)
  const rt = C.ensureState({ guide: snap });
  eq(rt.tut.s, 'done', 'state round-trips through JSON');
  // garbage in the profile does not crash
  const bad = C.ensureState({ guide: { used: 5, shown: [], tut: 'x' } });
  ok(bad && typeof bad.used === 'object' && bad.tut.done, 'corrupted guide state is repaired');
  ok(C.ensureState(null) === null, 'null profile');
  // objective text switches when a flashlight is owned
  const step = TUT_STEPS.find((s) => s.id === 'light');
  ok(C.stepObjective(step, 'en', { hasFlashlight: true }) !== C.stepObjective(step, 'en', {}), 'flashlight step text changes with ownership');
  ok(/F/.test(C.stepObjective(step, 'ru', { hasFlashlight: true })), 'RU objective');
}

// ------------------------------------------------------------------ lookup + suggestions + panels
{
  eq(C.findFeature('store')?.id, 'store', 'find by id');
  eq(C.findFeature('shop')?.id, 'store', 'find by alias');
  eq(C.findFeature('k')?.id, 'skilltree', 'find by key alias');
  eq(C.findFeature('passive')?.id, 'skilltree', 'find by name prefix');
  eq(C.findFeature('bestiary')?.id, 'bestiary', 'find by command');
  eq(C.findFeature('Envanter', 'tr')?.id, 'inventory', 'find by TR name');
  eq(C.findFeature('инвентарь', 'ru')?.id, 'inventory', 'find by RU name');
  ok(C.findFeature('zzzzqq') === null, 'unknown feature -> null');
  ok(C.findFeature('inventory_full') === null || C.findFeature('inventory_full').hidden !== true, 'hidden variants are not returned');
  const names = ['moons', 'store', 'route', 'bestiary', 'shipyard', 'contracts'];
  eq(C.suggestCommand('stor', names), 'store', 'did you mean: prefix');
  eq(C.suggestCommand('moon', names), 'moons', 'did you mean: plural');
  eq(C.suggestCommand('shipyrd', names), 'shipyard', 'did you mean: typo');
  eq(C.suggestCommand('bestiry', names), 'bestiary', 'did you mean: missing letter');
  ok(C.suggestCommand('xyzzy', names) === null, 'no suggestion for nonsense');
  ok(C.suggestCommand('a', names) === null, 'no suggestion for one letter');
  // panels (stub elements: classList + matches + querySelector)
  const stub = (cls, children = []) => ({ className: cls, classList: { contains: (c) => cls.split(/\s+/).includes(c) }, matches: (sel) => cls.split(/\s+/).includes(sel.slice(1)), querySelector: (sel) => (children.includes(sel.slice(1)) ? {} : null) });
  eq(C.classifyPanel(stub('menu-frame crt-panel tinv')), 'inventory', 'inventory panel');
  eq(C.classifyPanel(stub('menu-frame crt-panel wide forge')), 'forge', 'forge panel');
  eq(C.classifyPanel(stub('menu-frame crt-panel wide shop')), 'shop', 'shop panel');
  eq(C.classifyPanel(stub('pt')), 'tree', 'tree panel');
  eq(C.classifyPanel(stub('pt', ['pt-slot'])), 'pets', 'pets panel');
  eq(C.classifyPanel(stub('rl')), 'roles', 'roles panel');
  eq(C.classifyPanel(stub('menu-frame crt-panel trd')), 'trade', 'trade panel');
  eq(C.classifyPanel(stub('menu-frame crt-panel wide wd')), 'wardrobe', 'wardrobe panel');
  eq(C.classifyPanel(stub('dailyRewards')), 'daily', 'daily panel (any daily class)');
  ok(C.classifyPanel(stub('settings')) === null && C.classifyPanel(null) === null, 'unrelated panels are ignored');
  // every panel kind classifyPanel returns is wired to a feature that documents it
  for (const k of ['inventory', 'forge', 'shop', 'shipyard', 'homeworld', 'trade', 'wardrobe', 'roles', 'contracts', 'record', 'crafting', 'tree', 'pets', 'daily']) ok(C.PANEL_MAP.has(k), 'panel ' + k + ' maps to a feature');
  // text helpers
  ok(C.firstSentence('One. Two.') === 'One.', 'firstSentence');
  ok(C.firstSentence('x'.repeat(300)).length <= 118, 'firstSentence truncates');
  ok(C.tipText(C.featureById('skilltree_basic'), 0, 'en', { lvl: 4 }).includes('4'), 'tip placeholders are filled');
  ok(pick(['a', 'b', 'c'], 'ru') === 'c' && pick(['a', 'b'], 'ru') === 'a' && pick('x', 'tr') === 'x', 'pick fallbacks');
}

console.log(fails ? `\nFAILED ${fails} of ${checks}` : `guide.test: PASS (${checks} checks)`);
process.exit(fails ? 1 : 0);
