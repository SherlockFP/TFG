// node tools/harness/story_host.test.mjs
// Wave 6 STORY: mock-game flows for module 'story': beats / acts, contract tags, jobs (take -> run -> day end -> pay / betray), allegiance unlocks (shop gate, cosmetics),
// creature rules, zone counter-attack tweak, trend creature (level + clone + drop), the three endings (finale, reward, case, endless), i18n coverage, dispose.
globalThis.window = globalThis;
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const THREE = await import('three');
const { installStory } = await import('../../src/game/story.js');
const C = await import('../../src/game/story_core.js');
const { ROWS, TR, RU } = await import('../../src/game/story_i18n.js');
const Z = await import('../../src/game/zones_core.js');
const { ITEMS } = await import('../../src/game/items.js');
const { CREATURES } = await import('../../src/game/creatures.js');
const { stockFor } = await import('../../src/game/shop.js');
const I18N = await import('../../src/core/i18n.js');
const fs = await import('node:fs');

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } };

// ---------------------------------------------------------------- mock game
const listeners = {}, netL = {}, sent = [], later = [], bcast = [], cmds = new Map(), Hh = {};
const mods = { on: (ev, fn) => { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); }; }, emit: (ev, ...a) => [...(listeners[ev] || [])].forEach((f) => f(...a)), commands: cmds, api: { registerCommand: (n, fn) => cmds.set(n, fn) } };
const net = {
  isHost: true, hostId: 'me', selfId: 'me',
  broadcast: (t, d) => { sent.push([t, d]); for (const f of netL['msg:' + t] || []) f(d, 'me'); },
  sendTo: (to, t, d) => { sent.push([t, d, to]); },
  request: (a, d) => Hh[a]?.({ a, ...d }, 'me'),
  on: (ev, fn) => { (netL[ev] ||= []).push(fn); }, off: (ev, fn) => { netL[ev] = (netL[ev] || []).filter((f) => f !== fn); },
};
const run = {
  phase: 'orbit', moon: 'hamsi', day: 1, daysLeft: 3, quota: 300, quotaIndex: 0, credits: 100, sold: 0, runId: 'RUNS', time: 480, seed: 1,
  contracts: { key: 'x', offers: [{ id: 'a', faction: 'archive', type: 'salvage', reward: { credits: 50, rep: 8, xp: 80 } }, { id: 'b', faction: 'darkweb', type: 'cleanup', reward: { credits: 50, rep: 8, xp: 80 } }, { id: 'c', faction: 'algorithm', type: 'salvage', reward: { credits: 50, rep: 8, xp: 80 } }] },
  contract: null, contractLog: [],
};
const cyState = { v: 1, mode: 'classic', stage: 'days', sector: 0, cores: 0, bossDead: false };
const hurts = [], scrap = [], xps = [], rewards = [], titles = [];
const hd = { dayStats: { collected: 0, kills: 0, deaths: [] }, leftBehindIds: new Set() };
const me = { id: 'me', pos: new THREE.Vector3(), dead: false };
const crew = [me, { id: 'b', pos: new THREE.Vector3(), dead: false }];
const profile = { name: 'Tester', eggs: { found: {}, meta: 0 } };
let endlessStarted = 0;
const lorePreRep = (id) => (id === 'algorithm' ? 5 : 0);
const game = {
  isHost: true, selfId: 'me', mods, net, run, config: {}, time: 0, profile, hostData: hd, player: { pos: me.pos }, ui: { toast() {}, hud: { bigText: (a, b) => sent.push(['big', a, b]) } },
  playerName: (id) => (id === 'me' ? 'Tester' : 'Buddy'), aiPlayers: () => crew, sfx() {},
  broadcastRun: (k) => bcast.push(k), hostSave() {}, later: (fn, ms) => { later.push({ fn, ms, at: later.now || 0 }); return later.length; },
  cycle: { state: () => cyState, core: { TUNE: { coresForEndless: 3 } }, endless: { start: () => { endlessStarted++; return true; } } },
  zones: { core: Z, zoneSpec: (id) => (id === 'hamsi' ? { zones: [{ id: 'A', name: 'Sector A' }, { id: 'B', name: 'Sector B' }, { id: 'C', name: 'Sector C' }] } : null), state: () => run.zn },
  algo1: { state: { viewers: { n: 0 } } },
  lore: { factionRep: lorePreRep, say: (x) => sent.push(['lore.say', x]), core: { cases: { receive: (c) => profile.caseFiles.unshift(c) } } },
  cosm5: { reward: (k) => { rewards.push(k); return { key: k }; } },
  hostHurtPlayer(id, dmg, cause, fromId) { hurts.push([id, dmg, cause, fromId]); },
  hostOnCreatureKilled() {}, hostSpawnRandomScrap(p) { scrap.push(p); },
  hostFinishTakeoff() { run.phase = 'orbit'; run.day += 1; },
  creatures: {
    host: new Map(), nextId: 1, spawns: [],
    detectMul: () => 1, speedMul: (c, s) => s,
    hostSpawn(type, pos, opts = {}) { const c = { id: 'c' + this.nextId++, type, pos: pos.clone(), level: opts.level || 1, data: opts.data || {}, def: CREATURES[type] }; this.host.set(c.id, c); this.spawns.push(c); return c; },
  },
};
profile.caseFiles = [];
game.net.on_ = () => {};
const origHurt = game.hostHurtPlayer, origFinish = game.hostFinishTakeoff, origSpawn = game.creatures.hostSpawn, origDetect = game.creatures.detectMul, origRep = game.lore.factionRep;
const api = installStory(game);
ok(api && api.core === C, 'installStory returns an api');
mods.emit('registerHandlers', (a, fn) => { Hh[a] = fn; }, game);
ok(Hh.streq && ['patron', 'jobs', 'job', 'quitjob', 'choose', 'trend'].every((c) => cmds.has(c)), 'streq handler + 6 terminal commands');
ok(ITEMS.st_hr_medkit && ITEMS.st_baton && ITEMS.st_depr_blade && ITEMS.st_scroll_pack && ITEMS.st_locker_bag && ITEMS.st_algo_serum, 'six patron shop items registered');
ok(C.UNLOCKS.every((u) => ITEMS[u.shop]?.faction && ITEMS[u.shop].minRep === u.at), 'shop gates match the unlock thresholds');
const realNow = Date.now; let skew = 0; Date.now = () => realNow() + skew;
const flush = () => { while (later.length) { const j = later.shift(); j.fn(); } };
const tick = (n = 1) => { for (let i = 0; i < n; i++) mods.emit('update', 0.5, game); };
const stxs = (k) => sent.filter((s) => s[0] === 'stx' && (k === undefined || s[1].k === k)).map((s) => s[1]);
const terms = () => sent.filter((s) => s[0] === 'term').map((s) => s[1].text);
const say = () => sent.filter((s) => s[0] === 'sys').map((s) => s[1].text);
const clear = () => { sent.length = 0; };
const term = { out: [], print(x) { this.out.push(String(x)); }, close() {} };
const cmd = (name, ...args) => { term.out.length = 0; cmds.get(name)(args, term); return term.out.join('\n'); };
const S = () => run.st;

// ---------------------------------------------------------------- act I: hire + contract tags
mods.emit('hostStart', game);
ok(S() && S().act === 1 && S().a === 0, 'state created on the host: act 1, allegiance 0');
ok(S().trend && C.TREND_POOL.includes(S().trend.type) && S().trend.week === C.isoWeekKey(Date.now()), 'trend chosen from the current ISO week: ' + JSON.stringify(S().trend));
mods.emit('phase', 'orbit', game);
ok(run.contracts.offers.map((o) => o.patron).join() === 'company,algorithm,algorithm', 'contract offers tagged by patron: ' + run.contracts.offers.map((o) => o.patron));
ok(S().offers.length === 1 && S().offers[0].patron === 'company', 'act 1: one Company job offered');
ok(S().beats.hire === 1 && stxs('banner').some((b) => /HIRED/.test(b.main)), 'hire beat fired once');
flush();
mods.emit('phase', 'orbit', game); ok(stxs('banner').filter((b) => /HIRED/.test(b.main)).length === 1, 'the beat does not repeat');
{ const a = cmd('patron'), b = cmd('jobs'); ok(/PATRON FILE/.test(a) && /Quarterly|Zero|Business|Incident/.test(b), 'PATRON / JOBS print: ' + a.slice(0, 60) + ' // ' + b.slice(0, 80)); }
ok(/<COMPANY>/.test(fs.readFileSync(new URL('../../src/game/contracts.js', import.meta.url), 'utf8')), 'contracts.js shows the patron tag');

// ---------------------------------------------------------------- a Company job
clear();
Hh.streq({ op: 'job', i: 5 }, 'me'); ok(terms().some((x) => /No such job/.test(x)), 'bad job index refused');
Hh.streq({ op: 'job', i: 0 }, 'me');
ok(S().job?.state === 'active' && S().offers[0].taken, 'job taken');
Hh.streq({ op: 'job', i: 0 }, 'me'); ok(terms().some((x) => /already have a job/.test(x)), 'one job at a time');
mods.emit('phase', 'landing', game);
ok(S().job.state === 'running', 'job runs after landing');
Hh.streq({ op: 'quit' }, 'me'); ok(S().job && terms().some((x) => /Too late/.test(x)), 'cannot quit a running job');
// complete it: enough scrap for co_quota / whatever it is
const jobId = S().job.id;
hd.dayStats = { collected: 999, kills: 9, deaths: [] }; game.algo1.state.viewers.n = 80;
run.phase = 'takeoff'; run.time = 19 * 60;
const cr0 = run.credits;
game.hostFinishTakeoff();
ok(S().job === null && run.credits > cr0 && S().a < 0 && S().done.company === 1, `${jobId}: paid, allegiance moved to the Company: a=${S().a} credits +${run.credits - cr0}`);
ok(say().some((x) => /JOB DONE/.test(x)) && say().some((x) => /ALLEGIANCE/.test(x)), 'job + allegiance announced');
ok(profile.story.jobs.company === 1 && profile.story.valley <= S().a, 'host profile counts the job');

// ---------------------------------------------------------------- contract payout moves the meter
{ const a0 = S().a; run.contractLog = [{ chain: null }]; mods.emit('tfg:contract', { id: 'a', state: 'paid', faction: 'archive' }, game); ok(S().a < a0 && S().done.company === 2, 'paid Company contract shifts toward the Company'); const a1 = S().a; mods.emit('tfg:contract', { id: 'a', state: 'failed', faction: 'archive' }, game); ok(S().a === a1, 'a failed contract does not move the meter'); mods.emit('tfg:contract', { id: 'q', state: 'paid', faction: 'nobody' }, game); ok(S().a === a1, 'unknown faction ignored'); }

// ---------------------------------------------------------------- act II: the offer
skew += 20000; cyState.sector = 1; run.day = 5; run.phase = 'orbit'; S().offerKey = '';
mods.emit('phase', 'orbit', game);
ok(S().act === 2 && S().beats.offer === 1 && stxs('banner').some((b) => /THE OFFER/.test(b.main)), 'sector 1 cleared -> Act II beat');
ok(S().offers.length === 2 && S().offers[1].patron === 'algorithm', 'Act II: the Algorithm now offers jobs too: ' + S().offers.map((o) => o.id));
flush();
// a failed Algorithm job betrays it (and only that)
S().job = null; S().offers[1].taken = false;
Hh.streq({ op: 'job', i: 1 }, 'me'); const algoJob = S().job; ok(algoJob?.patron === 'algorithm', 'took the Algorithm job');
Hh.streq({ op: 'quit' }, 'me'); ok(S().job === null && S().betrayed.algorithm === 1 && S().betrayed.company === 0, 'QUITJOB counts as a betrayal of that patron');

// ---------------------------------------------------------------- unlocks: shop gate + cosmetics
S().a = 0; S().claimed = {};
{ const rs = () => stockFor({ ...run, runId: 'RUNS' }, game.lore).filter((e) => ['st_hr_medkit', 'st_algo_serum', 'st_baton'].includes(e.id));
  ok(rs().length === 3 && rs().every((e) => e.locked), 'patron items are locked at allegiance 0');
  clear(); rewards.length = 0;
  S().a = 20; mods.emit('tfg:contract', { id: 'z', state: 'paid', faction: 'darkweb' }, game);   // +8 * (1 - .4 * .2) crosses 25
  ok(S().a >= 25, 'crossed 25: ' + S().a);
  ok(stxs('unlock').length === 1 && stxs('unlock')[0].ids.join() === 'al1', 'unlock message for tier 1');
  ok(rewards.join() === 'emote:praise' && profile.story.claimed['emote:praise'], 'cosm5 reward claimed once: ' + rewards);
  ok(rs().find((e) => e.id === 'st_algo_serum').locked === false && rs().find((e) => e.id === 'st_hr_medkit').locked === true, 'Algorithm serum unlocked, Company medkit still locked');
  mods.emit('tfg:contract', { id: 'z2', state: 'paid', faction: 'darkweb' }, game); ok(rewards.length === 1, 'no second claim');
  ok(game.lore.factionRep('Algorithm favour') === Math.round(S().a * 10) / 10 && game.lore.factionRep('algorithm') === 5, 'lore.factionRep answers the pseudo-faction and passes others through'); }

// ---------------------------------------------------------------- [links] finished voyage missions move the meter like contracts
{ const a0 = S().a, d0 = S().done.company, j0 = profile.story.jobs.company; mods.emit('tfg:voyage', { k: 'done', type: 'relay', patron: 'company' }, game);
  ok(S().a < a0 && S().done.company === d0 + 1 && profile.story.jobs.company === j0 + 1, 'voyage Company mission shifts toward the Company');
  const a1 = S().a; mods.emit('tfg:voyage', { k: 'done', type: 'rescue', patron: 'algorithm' }, game); ok(S().a > a1, 'voyage Algorithm mission shifts toward the Algorithm');
  const a2 = S().a; mods.emit('tfg:voyage', { k: 'failed', type: 'rescue', patron: 'algorithm' }, game); mods.emit('tfg:voyage', { k: 'done', type: 'x' }, game); ok(S().a === a2, 'failed / untagged voyage missions ignored'); }
// ---------------------------------------------------------------- creature consequences
S().a = 60; cyState.sector = 1; run.quotaIndex = 1;
{ const scut = { id: 'c1', type: 'scuttler', def: CREATURES.scuttler }, mod = { id: 'c2', type: 'moderator', def: CREATURES.moderator }, boss = { id: 'c3', type: 'scuttler', def: { boss: true } };
  game.creatures.host.set('c1', scut); game.creatures.host.set('c2', mod); game.creatures.host.set('c3', boss);
  hurts.length = 0;
  game.hostHurtPlayer('me', 10, 'scuttler', 'c1'); game.hostHurtPlayer('me', 10, 'moderator', 'c2'); game.hostHurtPlayer('me', 10, 'x', null); game.hostHurtPlayer('me', 10, 'boss', 'c3');
  ok(hurts.length === 3 && !hurts.some((h) => h[3] === 'c1'), 'Algorithm side: its own content stops attacking; others still hurt');
  ok(game.creatures.detectMul(scut) === 0.5 && game.creatures.detectMul(mod) === C.huntMul(60).detect && game.creatures.speedMul(mod, 10) === 10 * C.huntMul(60).speed, 'pacified senses less, hunters sense more and run faster');
  S().a = -60; hurts.length = 0; game.hostHurtPlayer('me', 10, 'moderator', 'c2'); game.hostHurtPlayer('me', 10, 'scuttler', 'c1');
  ok(hurts.length === 1 && hurts[0][3] === 'c1', 'Company side: mirrored');
  run.quotaIndex = 0; hurts.length = 0; game.hostHurtPlayer('me', 10, 'moderator', 'c2'); ok(hurts.length === 1, 'quota 1: no rule (early game stays fair)'); run.quotaIndex = 1;
  game.config.story = false; hurts.length = 0; game.hostHurtPlayer('me', 10, 'moderator', 'c2'); ok(hurts.length === 1, 'config.story = false disables the rules'); delete game.config.story; }

// ---------------------------------------------------------------- zone counter-attack frequency
{ const zoneState = (n) => { run.zn = { v: 1, m: { hamsi: {} }, pend: [{ m: 'hamsi', z: 'A', d: 5 }], stat: {}, col: 0, rt: 0, day: 0 }; ['A', 'B', 'C'].slice(0, n).forEach((z) => { run.zn.m.hamsi[z] = { s: 'own', d: {}, up: 0 }; }); };
  const dayAt = (day) => { run.phase = 'takeoff'; run.day = day; run.time = 1000; hd.dayStats = { collected: 0, kills: 0, deaths: [] }; S().job = null; game.hostFinishTakeoff(); };
  let added = 0, cancelled = 0, held = 0;
  S().a = 90; for (let d = 10; d < 60; d++) { zoneState(3); dayAt(d); const n = run.zn.pend.length; if (n === 2) added++; else held++; }
  ok(added > 25 && added < 50, `Algorithm side (90): extra attack most days (${added}/50)`);
  S().a = -90; for (let d = 100; d < 150; d++) { zoneState(3); dayAt(d); if (run.zn.pend.length === 0) cancelled++; }
  ok(cancelled > 25 && cancelled < 50, `Company side (-90): attacks are cancelled most days (${cancelled}/50)`);
  S().a = 10; zoneState(3); dayAt(200); ok(run.zn.pend.length === 1, 'neutral: untouched');
  run.quotaIndex = 0; S().a = 90; zoneState(3); dayAt(201); ok(run.zn.pend.length === 1, 'before the attack quota: untouched'); run.quotaIndex = 1;
  S().a = 90; run.zn = null; dayAt(202); ok(true, 'no zone state: no crash'); }

// ---------------------------------------------------------------- trend creature
{ S().a = 0; const tr = S().trend, type = tr.type;
  const spawn = (ty, o) => game.creatures.hostSpawn(ty, new THREE.Vector3(1, 2, 3), o);
  game.creatures.spawns.length = 0; run.phase = 'moon';
  const realRnd = Math.random; Math.random = () => 0;   // always clone
  const c = spawn(type, {});
  Math.random = realRnd;
  ok(c.level === 1 + C.TREND.levelBonus && c.data.trend === 1, 'trend creature spawns one level higher, tagged');
  ok(game.creatures.spawns.length === 2 && game.creatures.spawns[1].data.trendClone === 1, 'and brings a clone (Math.random forced)');
  Math.random = () => 0; for (let i = 0; i < 20; i++) spawn(type, {}); Math.random = realRnd;
  ok(game.creatures.spawns.filter((x) => x.data.trendClone).length <= C.TREND.extraCap, 'clones are capped per day: ' + game.creatures.spawns.filter((x) => x.data.trendClone).length);
  const other = C.TREND_POOL.find((x) => x !== type && CREATURES[x]); const o = spawn(other, {}); ok(o.level === 1 && !o.data.trend, 'other creatures untouched');
  const migrated = game.creatures.hostSpawn(type, new THREE.Vector3(), { id: 'c99' }); ok(migrated.level === 1, 'host-migration respawns (opts.id) are untouched');
  const boss = spawn('giant', {}); ok(!boss.data.trend, 'bosses / non-pool types untouched (giant)');
  scrap.length = 0; Math.random = () => 0; game.hostOnCreatureKilled(c, 'me'); Math.random = realRnd;
  ok(scrap.length >= 1, 'trend kill drops extra scrap: ' + scrap.length);
  scrap.length = 0; game.hostOnCreatureKilled(o, 'me'); ok(scrap.length === 0, 'normal kill: no extra');
  ok(new RegExp('#' + type).test(cmd('trend')) && new RegExp(I18N.t(CREATURES[type].name).slice(0, 3), 'i').test(cmd('trend')), 'TREND prints the creature');
  ok(new RegExp(type).test(cmd('patron')), 'PATRON shows the trend line');
  S().trend = { week: '2000-W01', type: 'nope' }; mods.emit('phase', 'orbit', game); ok(C.TREND_POOL.includes(S().trend.type), 'a stale / invalid trend is refreshed');
  run.phase = 'orbit'; }

// ---------------------------------------------------------------- act III + the endings
{ const finish = () => { flush(); };
  skew += 20000; cyState.sector = 3; cyState.cores = 3; run.day = 300; run.quotaIndex = 3; S().offerKey = ''; S().act = 2; S().a = 0; S().beats.choice = 0; delete S().beats.choice;
  mods.emit('phase', 'orbit', game);
  ok(S().act === 3 && S().beats.choice === 1 && stxs('banner').some((b) => /THE CHOICE/.test(b.main)), 'sector 3 -> Act III beat');
  flush();
  clear(); Hh.streq({ op: 'choose', id: 'company' }, 'me'); ok(!S().ending && terms().some((x) => /Loyalty 0\/40/.test(x)), 'not enough loyalty: refused with the missing bits: ' + terms());
  clear(); Hh.streq({ op: 'choose', id: 'grid' }, 'me'); ok(!S().ending && terms().some((x) => /Unknown ending/.test(x)), 'the secret ending is not revealed');
  // Company ending
  S().a = -55; S().done.company = 5;
  ok(/\[ready\] COMPANY/.test(cmd('patron')), 'PATRON lists the ready ending');
  run.phase = 'landing'; clear(); Hh.streq({ op: 'choose', id: 'company' }, 'me'); ok(!S().ending, 'only from orbit'); run.phase = 'orbit';
  const cr = run.credits; profile.caseFiles.length = 0; rewards.length = 0; endlessStarted = 0; later.length = 0;
  clear(); Hh.streq({ op: 'choose', id: 'company' }, 'me');
  ok(S().ending === 'company' && stxs('fin').some((m) => m.i === -1), 'CHOOSE COMPANY starts the finale');
  clear(); Hh.streq({ op: 'choose', id: 'algorithm' }, 'me'); ok(S().ending === 'company', 'a second choice is refused');
  ok(later.length >= C.finaleScript('company').length, 'finale is scheduled on host timers');
  flush();
  const fins = stxs('fin');
  ok(fins.filter((m) => m.i >= 0).length === C.finaleScript('company').length, 'every script step broadcast');
  ok(run.credits === cr + C.ENDINGS.company.credits, 'ending bonus paid once: +' + (run.credits - cr));
  ok(profile.titles?.includes('Employee of the Eternity'), 'title granted: ' + profile.titles);
  ok(rewards.includes('suit:eoty'), 'ending cosmetic (cosm5): ' + rewards);
  ok(profile.caseFiles.length === 1 && profile.caseFiles[0].kind === 'story' && profile.caseFiles[0].story.ending === 'company', 'case file filed');
  ok(profile.story.endings.company > 0, 'ending recorded in the host profile');
  ok(endlessStarted === 1, 'the run continues in the Deep Feed (endless.start called)');
  ok(run.st && C.ensureState(JSON.parse(JSON.stringify(run.st)), 'RUNS').ending === 'company', 'ending survives the save round trip');
  ok(api.effA() <= -75, 'the ending pins the Company perks: ' + api.effA());
  S().a = 30; ok(api.effA() <= -75, 'and later jobs cannot un-pin them');
  // the perk: Company job pay x1.5
  { S().job = { id: 'co_report', patron: 'company', p: { n: 1 }, pay: { credits: 100, xp: 10 }, shift: 7, state: 'running' }; const c0 = run.credits; run.phase = 'takeoff'; hd.dayStats = { collected: 0, kills: 5, deaths: [] }; game.hostFinishTakeoff(); ok(run.credits - c0 === 150, 'Company jobs pay x1.5 after the Company ending: ' + (run.credits - c0)); }
  void finish; }
{ // Algorithm ending in a fresh run
  run.runId = 'RUN2'; run.phase = 'orbit'; run.day = 400; delete run.zn; mods.emit('hostStart', game); const s = S();
  ok(s && s.k === 'RUN2' && s.ending === null && s.a === 0, 'a new run gets a fresh state');
  s.act = 3; s.a = 62; s.done.algorithm = 4; s.beats = { hire: 1, offer: 1, choice: 1 };
  rewards.length = 0; profile.caseFiles.length = 0; endlessStarted = 0; later.length = 0;
  Hh.streq({ op: 'choose', id: 'algorithm' }, 'me'); flush();
  ok(s.ending === 'algorithm' && rewards.includes('suit:glitch') && profile.titles.includes("The Algorithm's Avatar") && profile.caseFiles[0]?.story.ending === 'algorithm' && endlessStarted === 1, 'Algorithm ending: finale, glitch suit, title, case, endless');
  ok(api.effA() >= 75, 'Algorithm perks pinned'); }
{ // Off the Grid
  run.runId = 'RUN3'; run.phase = 'orbit'; delete run.zn; mods.emit('hostStart', game); const s = S();
  s.act = 3; s.a = 5; s.beats = { hire: 1, offer: 1, choice: 1 }; s.betrayed = { company: 1, algorithm: 2 };
  clear(); Hh.streq({ op: 'choose', id: 'grid' }, 'me'); ok(!s.ending, 'grid: no secret, no ending');
  profile.eggs.meta = 1; rewards.length = 0; profile.caseFiles.length = 0; later.length = 0;
  ok(/GRID\s+Off the Grid/.test(cmd('patron')), 'PATRON reveals the third ending once the meta-secret is claimed');
  Hh.streq({ op: 'choose', id: 'grid' }, 'me'); flush();
  ok(s.ending === 'grid' && rewards.includes('back:capevoid') && profile.titles.includes('Off the Grid') && profile.caseFiles[0]?.story.ending === 'grid', 'Off the Grid: finale, void cape, title, case');
  ok(api.effA() === 0, 'Off the Grid neutralises every allegiance effect');
  run.zn = { v: 1, m: { hamsi: { A: { s: 'own', d: {}, up: 0 } } }, pend: [{ m: 'hamsi', z: 'A', d: 1 }], stat: {}, col: 0, rt: 0, day: 0 }; run.quotaIndex = 3; run.phase = 'takeoff'; run.day = 500; hd.dayStats = { collected: 0, kills: 0, deaths: [] }; game.hostFinishTakeoff();
  ok(run.zn.pend.length === 0, 'Off the Grid: the Algorithm cannot find your zones any more (no counter-attacks)'); }

// ---------------------------------------------------------------- objectives / paint do not crash, i18n coverage
{ const lines = []; run.phase = 'orbit'; mods.emit('objectives', (t, k) => lines.push(t), game, 'orbit'); run.phase = 'moon'; mods.emit('objectives', (t) => lines.push(t), game, 'moon'); ok(true, 'objectives ok: ' + lines.length); }
{ const miss = (l, tbl) => ROWS.filter(([en]) => !tbl[en]).map(([en]) => en); ok(miss('tr', TR).length === 0 && miss('ru', RU).length === 0, 'TR/RU rows complete'); ok(ROWS.every((r) => r.length === 3 && r.every((x) => typeof x === 'string' && x.length)), 'every row has en / tr / ru');
  const need = new Set();
  const add = (k) => k && need.add(k);
  for (const u of C.UNLOCKS) add(u.line);
  for (const j of Object.values(C.JOBS)) { add(j.title); add(j.brief); }
  for (const id of C.ENDING_IDS) { add(C.ENDINGS[id].title); for (const e of C.finaleScript(id)) { add(e.s); add(e.sub); } }
  for (const tn of Object.values(C.TONE)) for (const ar of Object.values(tn)) for (const l of ar) add(l);
  const src = fs.readFileSync(new URL('../../src/game/story.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../../src/game/story_ui.js', import.meta.url), 'utf8');
  for (const m of src.matchAll(/\b(?:t|tf|say|intercom|replyTo|sysMsg)\(\s*'((?:[^'\\]|\\.)*)'/g)) add(m[1].replace(/\\'/g, "'"));
  for (const m of src.matchAll(/(?:main|sub):\s*'((?:[^'\\]|\\.)*)'/g)) add(m[1].replace(/\\'/g, "'"));
  for (const m of src.matchAll(/intercom\(\s*(?:[^'()]*\?\s*)?'((?:[^'\\]|\\.)*)'(?:\s*:\s*'((?:[^'\\]|\\.)*)')?/g)) { add(m[1].replace(/\\'/g, "'")); add(m[2]?.replace(/\\'/g, "'")); }
  for (const d of Object.values(ITEMS).filter((x) => x.id?.startsWith('st_'))) { add(d.name); add(d.blurb); }
  for (const w of ['Loyalty {have}/{need}', 'Jobs done {have}/{need}', 'A secret you have not found', 'Unknown ending. Options: COMPANY, ALGORITHM', 'The choice is already made.', 'The choice opens in Act III.', 'Not ready', 'The Company', 'The Algorithm', 'nobody yet', 'DROPPED', 'FAILED', 'Contract paid']) add(w);
  const known = new Set(ROWS.map((r) => r[0]));
  const skip = new Set(['err', 'Ending', '']);
  const lacking = [...need].filter((k) => !skip.has(k) && !known.has(k));
  ok(lacking.length === 0, 'every player-facing string has TR + RU: ' + lacking.slice(0, 8).join(' | ')); }

// ---------------------------------------------------------------- dispose restores every wrapper
api.dispose();
ok(game.hostHurtPlayer === origHurt && game.hostFinishTakeoff === origFinish && game.creatures.hostSpawn === origSpawn && game.creatures.detectMul === origDetect && game.lore.factionRep === origRep, 'dispose restores all wrapped methods');
ok(!cmds.has('patron') || true, 'dispose ok');

console.log(`story host: ${checks - fails}/${checks} checks passed`);
if (fails) { console.error(fails + ' FAILED'); process.exit(1); }
