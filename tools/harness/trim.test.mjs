// node tools/harness/trim.test.mjs - wave 8 trim (docs/wave8/trim.md): ONE headline modifier per landing, the Algorithm ticker classes + daily dedupe,
// Clout hidden before the store unlock, and the one-line hooks in the owning modules.
import fs from 'node:fs';
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
const HC = await import('../../src/game/headline_core.js');
const OG = await import('../../src/game/onegoal_core.js');
const W = await import('../../src/game/wallet.js');
const src = (f) => fs.readFileSync(new URL('../../src/' + f, import.meta.url), 'utf8');

// ---- headline: priority + suppression
ok(HC.pickHeadline({ mapmods: 1, role: 1, daily: 1, trend: 1 }) === 'mapmods', 'affix set beats everything');
ok(HC.pickHeadline({ role: 1, daily: 1, trend: 1 }) === 'role', 'the announced role day keeps its day over a later daily roll');
ok(HC.pickHeadline({ warp: 1, daily: 1, trend: 1 }) === 'warp', 'a fired warp beats the daily');
ok(HC.pickHeadline({ daily: 1, trend: 1 }) === 'daily', 'daily beats trend');
ok(HC.pickHeadline({ trend: 1 }) === 'trend' && HC.pickHeadline({}) === 'none' && HC.pickHeadline(null) === 'none', 'trend alone / nothing');
ok(HC.pickHeadline({ weekly: 1, daily: 1, mapmods: 1, role: 1 }) === 'daily', 'the weekly challenge always keeps the day');
ok(!HC.roleMayRoll(2) && HC.roleMayRoll(0), 'no role day on an affix set');
ok(!HC.warpMayRoll(1, false) && !HC.warpMayRoll(0, true) && HC.warpMayRoll(0, false), 'no warp on an affix / role day');
ok(HC.trendActive(null) && HC.trendActive({ k: 'trend' }) && !HC.trendActive({ k: 'daily' }) && !HC.trendActive({ k: 'none' }), 'trend only acts on its own headline (old hosts: as before)');
ok(HC.affixCalm({ mode: 'staged', q: 1 }) && !HC.affixCalm({ mode: 'staged', q: 2 }), 'affix cards / side jobs wait until quota 2 (fresh staged)');
ok(!HC.affixCalm({ mode: 'all', q: 0 }) && !HC.affixCalm({ mode: 'staged', q: 0, quick: true }) && !HC.affixCalm({ mode: 'staged', q: 0, unlockAll: true }) && !HC.affixCalm(null), 'veterans / Quick Shift / unlock-everything are never gated');

// ---- Algorithm ticker: classes, queue, day dedupe
ok(OG.classOf({ pri: true }) === 'teach' && OG.classOf({ cls: 'danger' }) === 'danger' && OG.classOf({}) === 'flavour' && OG.classOf({ cls: 'danger', pri: true }) === 'danger', 'line classes');
let q = [];
for (const c of ['flavour', 'flavour', 'danger', 'teach', 'flavour']) q = OG.enqueue(q, { c, cls: c });
ok(q.map((x) => x.c).join() === 'teach,danger,flavour', 'queue: teaching > danger > flavour, the oldest flavour is dropped');
ok(OG.dangerOk(10000, 0) && !OG.dangerOk(10000, 5000) && OG.dangerOk(14000, 5000) && OG.dangerOk(1, 1, true), 'danger has its own 8 s gap');
ok(OG.algoOk({ nowMs: 1000, lastMs: 900, peak: true }) === false && OG.algoOk({ nowMs: 1000, lastMs: 900, pri: true }) === true, 'flavour muted at a peak / inside the gap, teaching passes');
const seen = [OG.lineWords('Quota 3 met. Nice work, crew!')];
ok(OG.nearDup('quota 5 MET, nice work crew', seen) && !OG.nearDup('The Algorithm is watching you carefully', seen), 'near-identical lines (numbers / case / punctuation aside) are dupes');
ok(!OG.nearDup('anything', []) && !OG.nearDup('', seen), 'empty edge cases');

// ---- Clout: credits are the only wallet until the store unlock
ok(W.cloutOpenOf({}) === true && W.cloutOpenOf({ onboard: { locked: (id) => id === 'shop' } }) === false && W.cloutOpenOf({ onboard: { locked: () => false } }) === true, 'cloutOpenOf follows the hub shop lock');

// ---- the one-line hooks exist where the rules say
const has = (f, s, m) => ok(src(f).includes(s), m || `${f} contains ${s}`);
has('game/algorithm.js', 'OG.nearDup(text, st.seen)', 'algorithm.show dedupes');
has('game/algorithm.js', 'OG.enqueue(st.q', 'algorithm.show ranks the queue');
has('game/lore.js', 'cls: opts.cls', 'lore.say passes the class');
has('game/crdirector.js', "game.lore.say(text.replace", 'crdirector captions go through the ticker');
has('game/game.js', "useModule('headline', installHeadline)", 'headline installed');
has('game/roledays.js', 'roleMayRoll(game.mapmods?.plan?.())', 'role day skips affix days');
has('game/voyage.js', 'warpMayRoll(game.mapmods?.plan?.()', 'warp skips affix / role days');
has('game/story.js', 'trendActive(r?.hl)', 'trend reads the headline');
has('game/mapmods.js', 'affixCalm({', 'mapmods waits for quota 2');
has('game/facjobs.js', 'affixCalm({ mode: r.hub?.mode', 'facjob side jobs wait for quota 2');
has('game/hubgate.js', "e.currency === 'clout'", 'Clout stock locked with the rare stock');
has('game/shop.js', 'cloutOpenOf(g)', 'terminal store hides Clout prices');
has('ui/panels/shop.js', 'cloutOpen()', 'store panel hides the Clout wallet');
has('ui/ui.js', 'cloutOpenOf(game)', 'Black Market waits for the unlock');
has('ui/hud.js', 'if (run.hl) return null', 'HUD does not re-roll a suppressed daily event');
has('game/host.js', "['mapmods', 'role', 'warp', 'trend'].includes(this.run.hl?.k)", 'no NORMAL FEED line on a headline day');

console.log(bad ? `${bad}/${n} FAILED` : `trim: all ${n} checks passed`);
process.exit(bad ? 1 : 0);
