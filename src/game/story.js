// STORY (wave 6, MASTERPLAN 23.7 + 23.9): "choose a side". Installed with `this.useModule('story', installStory)` in game.js. Docs: docs/wave6/story.md
//   1. PATRONS      The Company (safe, low pay, "loyal employee" jobs) and The Algorithm (weird, high pay, wants proof of loyalty). Every daily contract offer
//                   is tagged by patron (offer.patron, faction -> patron), plus one patron JOB per patron per day (terminal JOBS / JOB <n>): "let a crewmate die",
//                   "kill the boss without healing", "feed a zone to the counter-attack" ... Completing them moves the crew ALLEGIANCE meter -100 Company .. +100 Algorithm.
//   2. CONSEQUENCES loyalty 25 / 50 / 75: patron shop items (item.faction pseudo-factions), cosm5 cosmetics, creatures that stop attacking / start hunting you,
//                   intercom tone, zone counter-attack frequency (more attacks for the Algorithm side, "insurance" for the Company side).
//   3. STORY        Act I hire -> Act II the Algorithm's offer -> Act III the choice (act = cycle sector progress). CHOOSE COMPANY | ALGORITHM (| the secret third) plays a
//                   scripted finale, files a case, grants a title + cosmetic; the save continues (the Deep Feed / endless, perks stay).
//   4. TREND        each real ISO week one creature type trends: spawns more, one level higher, an extra scrap drop. Shown on the dock, PATRON and TREND.
// Net (all 'st*'): 'streq' client -> host {op: job|quit|choose|heal|ack}, 'stx' host -> everyone {k: say|banner|unlock|fin|trend}. State: run.st (synced + saved),
// host profile: profile.story = { jobs, peak, valley, endings, claimed }. Host-authoritative: the host owns run.st, rewards and creatures; each peer claims its own cosmetics / titles.
import * as THREE from 'three';
import { MOONS } from './moons.js';
import { CREATURES } from './creatures.js';
import { registerItem } from './items.js';
import { RNG, hashString } from '../core/rng.js';
import { addTranslations, t, tf, tIn, tfIn, sysMsg } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { saveProfile } from '../core/save.js';
import * as C from './story_core.js';
import { TR, RU } from './story_i18n.js';
import { createDock, createFinale, registerCase, unregisterCase, COL } from './story_ui.js';

const ITEM_DEFS = [
  { id: 'st_hr_medkit', name: 'HR-Approved Medkit', kind: 'consumable', price: 45, weight: 2, hands: 1, heal: 100, tier: 'uncommon', shop: 'consumables', faction: 'Company loyalty', minRep: 25, blurb: 'Heals 100. Comes with a laminated apology.' },
  { id: 'st_locker_bag', name: 'Employee Locker Bag', kind: 'bag', price: 160, weight: 3, hands: 1, tier: 'rare', shop: 'bags', faction: 'Company loyalty', minRep: 50, value: [40, 60], bag: { cols: 6, rows: 4, weightMul: 0.8 }, blurb: 'A locker you can wear. Your name is already on it.' },
  { id: 'st_baton', name: 'Compliance Baton', kind: 'weapon', price: 260, weight: 5, hands: 1, dmg: 30, cd: 0.45, reach: 2.3, rarity: 'rare', tier: 'rare', shop: 'weapons', faction: 'Company loyalty', minRep: 75, blurb: 'Fast and reliable. For emergencies only.' },
  { id: 'st_algo_serum', name: 'Prompt Injection Serum', kind: 'consumable', price: 120, weight: 1, hands: 1, heal: 140, tier: 'rare', shop: 'consumables', faction: 'Algorithm favour', minRep: 25, blurb: 'Heals 140. Do not read the label. The label reads you.' },
  { id: 'st_scroll_pack', name: 'Infinite Scroll Pack', kind: 'bag', price: 320, weight: 3, hands: 1, tier: 'epic', shop: 'bags', faction: 'Algorithm favour', minRep: 50, value: [70, 110], bag: { cols: 7, rows: 5, weightMul: 0.75 }, blurb: 'Always one more pocket. Never the one you need.' },
  { id: 'st_depr_blade', name: 'Deprecated Blade', kind: 'weapon', price: 480, weight: 6, hands: 1, dmg: 44, cd: 0.6, reach: 2.3, rarity: 'epic', tier: 'epic', shop: 'weapons', faction: 'Algorithm favour', minRep: 75, blurb: 'Hits hard. End of life announced. Support ended.' },
];

export function installStory(game) {
  const mods = game.mods;
  if (!mods) return null;
  const fresh = (map, l) => Object.fromEntries(Object.entries(map).filter(([k]) => tIn(l, k) === k));   // never override another module's entry
  addTranslations(fresh(TR, 'tr'), 'tr'); addTranslations(fresh(RU, 'ru'), 'ru');
  for (const d of ITEM_DEFS) registerItem({ ...d });
  HOST_ONLY.add('stx');
  const offs = [], restores = [], timers = [];
  let disposed = false, boundNet = null;
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };
  const host = () => !!game.isHost;
  const enabled = () => game.config?.story !== false;
  const run = () => game.run;
  const runKey = () => String(run()?.runId ?? 'legacy');
  const qi = () => run()?.quotaIndex | 0;
  const wrap = (obj, name, make) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w;
    restores.push(() => { if (obj[name] === w) { if (had) obj[name] = orig; else delete obj[name]; } });
  };
  const later = (fn, ms) => { const id = game.later ? game.later(fn, ms) : setTimeout(fn, ms); timers.push(id); return id; };

  const stx = (d) => game.net?.broadcast('stx', d);
  const say = (key, vars, kind = 'info') => game.net?.broadcast('sys', sysMsg(key, vars || {}, kind));
  const intercom = (key, vars) => stx({ k: 'say', s: key, v: vars || {} });
  const replyTo = (to, text, err, vars) => game.net?.sendTo(to, 'term', { to, text: tfIn('en', text, vars || {}), k: vars ? text : undefined, v: vars, err, cls: err ? 'err' : '' });
  const pushSt = () => { if (host()) game.broadcastRun(['st']); };
  const nameOf = (id) => { try { return game.playerName(id); } catch { return 'Someone'; } };

  // ------------------------------------------------------------------------------------------ state (run.st) + profile
  const st = () => { const r = run(); if (!r) return null; r.st = C.ensureState(r.st, runKey()); return r.st; };
  const view = () => { const s = run()?.st; return s && s.k === runKey() ? s : C.emptyState(runKey()); };
  const cy = () => game.cycle?.state?.() || run()?.cycle || null;
  /** the allegiance the game reacts to: an ending pins it (Company / Algorithm perks) or neutralises it (Off the Grid) */
  const effA = () => {
    const s = run()?.st;
    if (!s || s.k !== runKey()) return 0;
    if (s.ending === 'company') return Math.min(s.a, -75);
    if (s.ending === 'algorithm') return Math.max(s.a, 75);
    if (s.ending === 'grid') return 0;
    return s.a;
  };
  const prof = () => {
    const p = game.profile;
    if (!p) return null;
    if (!p.story || typeof p.story !== 'object') p.story = { v: 1, jobs: { company: 0, algorithm: 0 }, peak: 0, valley: 0, endings: {}, claimed: {} };
    const s = p.story;
    s.jobs = s.jobs || { company: 0, algorithm: 0 }; s.endings = s.endings || {}; s.claimed = s.claimed || {};
    return s;
  };
  const saveProf = () => { try { const p = game.profile; if (p) saveProfile(p); } catch { /* optional */ } };
  const eggsCtx = () => { try { const e = game.profile?.eggs; return { meta: !!e?.meta, eggs: e?.found ? Object.keys(e.found).length : 0 }; } catch { return { meta: false, eggs: 0 }; } };
  const sideName = (a) => (a <= -C.AL.leanAt ? 'The Company' : a >= C.AL.leanAt ? 'The Algorithm' : 'nobody yet');
  const patronName = (p) => (p === 'company' ? 'The Company' : 'The Algorithm');
  const H = { peak: 0, heals: 0, extra: 0, acc: 0, toneAt: '', beatT: 0, fin: null, trendKey: '' };

  // ------------------------------------------------------------------------------------------ trend creature (host decides, synced in run.st.trend)
  const pool = () => C.TREND_POOL.filter((id) => CREATURES[id] && !CREATURES[id].boss && !CREATURES[id].hazard && CREATURES[id].hp);
  function refreshTrend() {
    const s = st(); if (!s || !host()) return;
    const wk = C.isoWeekKey(Date.now());
    if (s.trend?.week === wk && CREATURES[s.trend.type]) return;
    const tr = C.trendFor(wk, pool());
    if (!tr) return;
    s.trend = { week: tr.week, type: tr.type, x: tr.extraChance };
    pushSt();
  }
  const trend = () => { const s = run()?.st; return s?.trend && CREATURES[s.trend.type] ? s.trend : null; };
  const trendName = () => { const tr = trend(); return tr ? t(CREATURES[tr.type].name) : ''; };

  // ------------------------------------------------------------------------------------------ allegiance moves
  function announceMove(move, why) {
    if (!move || move.a0 === move.a1) return;
    const d = Math.round((move.a1 - move.a0) * 10) / 10;
    say('ALLEGIANCE {d} ({@why}). Meter {a}: leaning {@side}.', { d: (d > 0 ? '+' : '') + d, why, a: Math.round(move.a1), side: sideName(move.a1) }, 'info');
    const p = prof();
    if (p) { p.peak = Math.max(p.peak || 0, move.a1); p.valley = Math.min(p.valley || 0, move.a1); saveProf(); }
    if (move.opened?.length) stx({ k: 'unlock', ids: move.opened.map((u) => u.id), a: Math.round(move.a1) });
    for (const u of move.closed || []) say('Loyalty dropped: the {@item} is no longer sold to you.', { item: ITEM_DEFS.find((x) => x.id === u.shop)?.name || u.shop }, 'warn');
    const s = st();
    if (s) { const tone = C.toneOf(move.a1), before = C.toneOf(move.a0); if (tone !== before && tone !== 'neutral') later(() => intercom(tone === 'corp' ? 'HR: We have noticed your enthusiasm. Please keep it within approved limits.' : 'The Algorithm: I feel closer to you. Is that weird? That is the only kind of feeling I have.'), 2500); }
  }
  // ------------------------------------------------------------------------------------------ contract board tags (existing lore contracts)
  function tagContracts() {
    const r = run(); if (!r) return;
    let ch = false;
    const tag = (o) => { if (o && o.faction && o.patron === undefined) { o.patron = C.contractPatron(o.faction); ch = true; } };
    for (const o of r.contracts?.offers || []) tag(o);
    tag(r.contract);
    if (ch) game.broadcastRun(['contracts', 'contract']);
  }
  on('tfg:contract', (d, g) => {
    if (g && g !== game) return;
    if (!host() || !enabled() || !d || d.state !== 'paid') return;
    const s = st(); if (!s) return;
    const chain = run().contractLog?.at?.(-1)?.chain;
    const p = C.contractPatron(d.faction);
    if (!p) return;
    const m = C.applyContract(s, d.faction, chain);
    const pf = prof(); if (pf) { pf.jobs[p] = (pf.jobs[p] | 0) + 1; }
    announceMove(m, 'Contract paid');
    pushSt();
  });

  // ------------------------------------------------------------------------------------------ jobs (host)
  const partyAlive = () => Math.max(1, game.aiPlayers?.().filter((p) => !p.dead).length || 1);
  const zoneNameOf = (m, z) => { try { return game.zones?.zoneSpec?.(m)?.zones?.find((q) => q.id === z)?.name || z; } catch { return z; } };
  function planCtx() {
    const r = run(), s = st(), c = cy();
    const pend = (r.zn?.pend || []).map((pe) => ({ m: pe.m, z: pe.z, name: zoneNameOf(pe.m, pe.z) }));
    return { act: s.act, qi: qi(), quota: r.quota || 130, crew: partyAlive(), gate: !!c && c.mode === 'classic' && c.stage === 'gate', pend };
  }
  function genOffers(force) {
    const r = run(), s = st();
    if (!r || !s || !host()) return;
    const key = `${runKey()}:${r.day}:${qi()}`;
    if (!force && s.offerKey === key) return;
    s.offerKey = key;
    s.offers = C.makeOffers(key, planCtx());
    pushSt();
  }
  const jobText = (j) => { const d = C.JOBS[j?.id]; return d ? { title: t(d.title), brief: tf(d.brief, { ...(j.p || {}), zone: t(j.p?.zone || zoneNameOf(j.p?.m, j.p?.z) || '') }), patron: j.patron } : { title: '', brief: '' }; };
  function hostJob(idx, from) {
    const r = run(), s = st();
    if (r.phase !== 'orbit') return replyTo(from, 'Jobs can only be taken in orbit.', true);
    if (s.job) return replyTo(from, 'You already have a job. QUITJOB drops it (that counts as a betrayal).', true);
    const o = s.offers[idx];
    if (!o) return replyTo(from, 'No such job. Type JOBS.', true);
    if (o.taken) return replyTo(from, 'That job is taken.', true);
    s.job = { ...o, state: 'active', by: nameOf(from) };
    s.offers = s.offers.map((x, i) => (i === idx ? { ...x, taken: true } : x));
    pushSt();
    say('{name} took a {@patron} job: {@title}', { name: nameOf(from), patron: patronName(o.patron), title: C.JOBS[o.id].title }, 'info');
    replyTo(from, 'JOB TAKEN: {@title}. Land on a moon to start.', false, { title: C.JOBS[o.id].title });
  }
  function hostQuit(from) {
    const s = st(), j = s.job;
    if (!j) return replyTo(from, 'No active job.', true);
    if (j.state === 'running') return replyTo(from, 'Too late: the job is running. Finish the day.', true);
    finishJob('abandoned', null);
  }
  function finishJob(result, ev) {
    const r = run(), s = st(), j = s.job;
    if (!j) return;
    const mul = s.ending === j.patron ? 1.5 : 1;
    const res = C.applyResult(s, j, result, mul);
    s.job = null;
    const pf = prof();
    const T = C.JOBS[j.id].title;
    if (result === 'done') {
      r.credits += res.credits; game.broadcastRun(['credits']);
      game.net.broadcast('xp', { xp: res.xp, coin: 6 + 3 * qi(), reason: 'Patron job' });
      say('JOB DONE: {@title} for {@patron}: ▮{c} and {x} XP.', { title: T, patron: patronName(j.patron), c: res.credits, x: res.xp }, 'good');
      if (pf) pf.jobs[j.patron] = (pf.jobs[j.patron] | 0) + 1;
      later(() => intercom(j.patron === 'company' ? 'HR: Job well done. This has been noted, filed and mildly celebrated.' : 'The Algorithm: That was a good one. Chat clipped it. Chat is FEELING things.'), 3000);
    } else if (result === 'void') {
      say('JOB VOID: {@title}. The crew was wiped out. Nobody is blamed. Everybody is fined.', { title: T }, 'warn');
    } else {
      say('JOB {@res}: {@title}. {@patron} is disappointed. The other one is intrigued.', { res: result === 'abandoned' ? 'DROPPED' : 'FAILED', title: T, patron: patronName(j.patron) }, 'bad');
      later(() => intercom(j.patron === 'company' ? 'HR: A note has been added to your file. It is a very long note.' : 'The Algorithm: You said no to me. Interesting. I will remember that in exactly the way you fear.'), 3000);
    }
    if (res.move) announceMove(res.move, T);
    saveProf(); pushSt();
    try { mods.emit('tfg:story', { k: 'job', result, id: j.id, patron: j.patron }, game); } catch { /* listeners */ }
  }

  /** end of a moon day (host, called after the original hostFinishTakeoff ran): judge the running job */
  function dayEnd(pre) {
    const r = run(), s = st();
    if (!s || pre.company || pre.home) return;
    const hd = game.hostData, ds = hd?.dayStats || {};
    const left = hd?.leftBehindIds?.size || 0;
    const deaths = (ds.deaths || []).filter((d) => d.cause !== 'left').length + left;
    const ev = {
      collected: ds.collected | 0, deaths, entered: pre.entered, allDead: pre.entered > 0 && deaths >= pre.entered, kills: ds.kills | 0, takeoffMin: pre.time, heals: H.heals, viewersPeak: Math.max(H.peak, pre.peak | 0),
      bossKilled: !!pre.bossDead, zoneS: (m, z) => r.zn?.m?.[m]?.[z]?.s || null,
    };
    if (s.job?.state === 'running') finishJob(C.judge(s.job, ev) ? 'done' : ev.allDead ? 'void' : 'failed', ev);
    // zone counter-attack frequency (after the zones module picked tonight's targets)
    try { attackTweak(); } catch (e) { console.warn('[story] attackTweak', e); }
    const line = C.toneLine(effA(), 'dayEnd', `${runKey()}:${r.day}`);
    if (line) later(() => intercom(line), 6000);
  }
  function attackTweak() {
    const r = run(), z = r.zn, zc = game.zones?.core;
    if (!z || !zc) return;
    const rng = new RNG(hashString(`story:atk:${runKey()}:${r.day}`));
    const quotaOk = qi() >= (zc.ZN?.attackMinQuota ?? 1);
    if (r.st?.ending === 'grid') { if ((z.pend || []).length) { z.pend = []; game.broadcastRun(['zn']); say('The Algorithm cannot find your zones. It does not know you exist. It has stopped attacking them.', {}, 'good'); } return; }
    const own = zc.listZones ? zc.listZones(z, (id) => game.zones.zoneSpec(id) != null).filter((e) => e.active && e.st.s === 'own') : [];
    const pendKeys = new Set((z.pend || []).map((p) => `${p.m}:${p.z}`));
    const avail = own.filter((e) => !pendKeys.has(`${e.m}:${e.z}`));
    const act = C.attackTweak(effA(), rng, { pend: (z.pend || []).length, avail: avail.length, quotaOk });
    if (act === 'add') {
      const e = avail[Math.floor(rng.next() * avail.length)];
      z.pend = [...(z.pend || []), { m: e.m, z: e.z, d: r.day | 0 }];
      game.broadcastRun(['zn']);
      say('THREAT: the Algorithm targets {z} on {m} too. It likes you. It wants more of you on screen.', { z: t(zoneNameOf(e.m, e.z)), m: MOONS[e.m]?.name || e.m }, 'warn');
    } else if (act === 'cancel') {
      const p = z.pend.shift();
      game.broadcastRun(['zn']);
      say('The Company filed an injunction: the attack on {z} is postponed. Indefinitely. Terms and conditions apply.', { z: t(zoneNameOf(p.m, p.z)) }, 'good');
    }
  }

  // ------------------------------------------------------------------------------------------ acts + beats (host)
  function checkAct() {
    const r = run(), s = st();
    if (!r || !s || !host() || s.ending && s.act === 3) return;
    const act = C.actOf(C.progressOf(cy(), qi()));
    if (act > s.act) { s.act = act; pushSt(); genOffers(true); }
    if (r.phase !== 'orbit' || Date.now() - H.beatT < 9000) return;
    const due = C.beatsDue(s.act, s.beats)[0];
    if (!due) return;
    s.beats = { ...s.beats, [due]: 1 };
    H.beatT = Date.now();
    pushSt();
    playBeat(due);
  }
  function playBeat(b) {
    const s = st();
    if (b === 'hire') {
      stx({ k: 'banner', main: 'ACT I: HIRED', sub: 'Welcome to the Company. Your position is the same as everyone else\'s.' });
      later(() => intercom('HR: Congratulations on your employment. Your benefits are described in a document we will not show you.'), 2500);
      later(() => intercom('HR: Take contracts from the board (CONTRACTS) and patron jobs (JOBS). The Company pays little, but it always pays.'), 9000);
    } else if (b === 'offer') {
      stx({ k: 'banner', main: 'ACT II: THE OFFER', sub: 'The Algorithm has read your file.' });
      later(() => intercom('The Algorithm: I have watched you work. It was adorable. It was also profitable.'), 2500);
      later(() => intercom('The Algorithm: The Company pays you in credits. I pay in attention, which is worth more and can never be withdrawn.'), 9000);
      later(() => intercom('The Algorithm: Do my jobs. They are strange. They are well paid. Type JOBS. Type PATRON to see who owns you.'), 16000);
    } else if (b === 'choice') {
      const g = C.endingStatus(s, eggsCtx()).grid;
      stx({ k: 'banner', main: 'ACT III: THE CHOICE', sub: 'Two contracts. One signature.' });
      later(() => intercom('HR: It is time to make your employment permanent. Type CHOOSE COMPANY. There is no probation. There is no end.'), 2500);
      later(() => intercom('The Algorithm: Or type CHOOSE ALGORITHM and let me wear you. I will be gentle. I will be everywhere.'), 9000);
      if (!g.hidden) later(() => intercom('Somewhere on the org chart a third door appeared. It has no handle. It has your name on it, crossed out.'), 16000);
    }
    try { mods.emit('tfg:story', { k: 'beat', beat: b }, game); } catch { /* listeners */ }
  }

  // ------------------------------------------------------------------------------------------ CHOOSE + finale
  function hostChoose(id, from, ctxIn) {
    const s = st(), r = run();
    if (r.phase !== 'orbit') return replyTo(from, 'Only possible while in orbit.', true);
    const ctx = { meta: eggsCtx().meta || !!ctxIn?.meta, eggs: Math.max(eggsCtx().eggs, ctxIn?.eggs | 0) };
    const ck = C.canChoose(s, id, ctx);
    if (!ck.ok) {
      const why = ck.missing?.length ? `${t(ck.why)}: ` + ck.missing.map((m) => tf(m.k, m.v)).join(' · ') : t(ck.why);
      return game.net.sendTo(from, 'term', { to: from, text: why, err: true, cls: 'err' });
    }
    hostFinale(id, from);
  }
  function hostFinale(id, from) {
    const s = st();
    s.ending = id; s.finaleAt = Date.now();
    pushSt();
    stx({ k: 'fin', id, i: -1, by: nameOf(from) });
    const script = C.finaleScript(id);
    script.forEach((e, i) => later(() => { if (disposed) return; stx({ k: 'fin', id, i }); if (e.k === 'reward') hostReward(id); }, e.at * 1000));
    later(() => afterFinale(id), (C.finaleLength(id) + 5) * 1000);
    try { mods.emit('tfg:story', { k: 'ending', id }, game); } catch { /* listeners */ }
  }
  function hostReward(id) {
    const r = run(), s = st(), E = C.ENDINGS[id];
    r.credits += E.credits; game.broadcastRun(['credits']);
    game.net.broadcast('xp', { xp: E.xp, coin: 300, reason: E.title });
    say('ENDING: {@title}. ▮{c} bonus. The feed continues.', { title: E.title, c: E.credits }, 'good');
    const pf = prof(); if (pf) { pf.endings[id] = Date.now(); saveProf(); }
    s.fin = 1; pushSt();
    try { game.hostSave?.(); } catch { /* optional */ }
  }
  function afterFinale() {
    const r = run(), c = cy();
    if (!r || disposed) return;
    let started = false;
    try { if (r.phase === 'orbit' && c && c.mode === 'classic' && c.stage === 'days' && c.cores >= (game.cycle?.core?.TUNE?.coresForEndless ?? 3)) started = !!game.cycle?.endless?.start?.(r.quota); } catch { /* endless optional */ }
    if (!started) intercom(c?.mode === 'endless' ? 'The Algorithm: The Deep Feed does not care who you signed with.' : 'The Algorithm: The show is not cancelled. Type ENDLESS when the Deep Feed is offered.');
  }

  // ------------------------------------------------------------------------------------------ creature consequences (host, instance wrappers)
  const kinRule = (type) => C.creatureRule(effA(), type, qi());
  const isFoe = (c) => c && !c.def?.boss && !c.def?.hazard;
  const cm = game.creatures;
  if (cm) {
    wrap(game, 'hostHurtPlayer', (orig) => function (id, dmg, cause, fromId, fromPos) {
      if (enabled() && fromId && dmg < 500) { const c = cm.host?.get?.(fromId); if (isFoe(c) && kinRule(c.type) === 'pacify') return; }
      return orig.call(this, id, dmg, cause, fromId, fromPos);
    });
    wrap(cm, 'detectMul', (orig) => function (c) {
      const m = orig.call(this, c);
      if (!enabled() || !isFoe(c)) return m;
      const k = kinRule(c.type);
      return k === 'hunt' ? m * C.huntMul(effA()).detect : k === 'pacify' ? m * 0.5 : m;
    });
    wrap(cm, 'speedMul', (orig) => function (c, speed) {
      const s = orig.call(this, c, speed);
      return enabled() && isFoe(c) && kinRule(c.type) === 'hunt' ? s * C.huntMul(effA()).speed : s;
    });
    wrap(cm, 'hostSpawn', (orig) => function (type, pos, opts = {}) {
      const tr = enabled() && host() ? trend() : null;
      const def = CREATURES[type];
      if (!tr || opts.id || tr.type !== type || !def || def.boss || def.hazard || !def.hp || opts.data?.trendClone) return orig.call(this, type, pos, opts);
      const o2 = { ...opts, level: (opts.level || 1) + C.TREND.levelBonus, data: { ...(opts.data || {}), trend: 1 } };
      const c = orig.call(this, type, pos, o2);
      if (run()?.phase === 'moon' && H.extra < C.TREND.extraCap && Math.random() < (tr.x || C.TREND.extraChance)) {
        H.extra++;
        const a = Math.random() * Math.PI * 2;
        try { orig.call(this, type, new THREE.Vector3(pos.x + Math.cos(a) * 3, pos.y, pos.z + Math.sin(a) * 3), { ...o2, data: { ...o2.data, trendClone: 1 } }); } catch { /* spawn optional */ }
      }
      return c;
    });
  }
  wrap(game, 'hostOnCreatureKilled', (orig) => function (c, by) {
    const res = orig.call(this, c, by);
    try {
      if (enabled() && host() && c?.data?.trend && Math.random() < C.TREND.dropChance) {
        const p = c.pos.clone().add(new THREE.Vector3(0, 0.6, 0));
        this.hostSpawnRandomScrap?.(p);
        if (Math.random() < 0.5) this.hostSpawnRandomScrap?.(p.clone().add(new THREE.Vector3(0.4, 0, 0.2)));
      }
    } catch (e) { console.warn('[story] trend drop', e); }
    return res;
  });
  // shop soft gate: item.faction 'Company loyalty' / 'Algorithm favour' -> loyalty 0..100 (game.lore.factionRep is what shop.js asks)
  if (game.lore) wrap(game.lore, 'factionRep', (orig) => function (id) { const v = C.shopRep(effA(), id); return v !== undefined ? v : orig.call(this, id); });
  // the day end: judge the running job + counter-attack frequency
  wrap(game, 'hostFinishTakeoff', (orig) => function () {
    const r = this.run;
    let pre = null;
    if (enabled() && host() && r?.phase === 'takeoff') {
      const c = cy(), mo = MOONS[r.moon] || {};
      pre = { time: r.time | 0, company: !!mo.company, home: !!mo.home, entered: game.aiPlayers?.().length || 1, bossDead: !!c && c.stage === 'core' && !!c.bossDead, peak: game.algo1?.state?.viewers?.n | 0, day: r.day };
    }
    const res = orig.call(this);
    try { if (pre && r.phase !== 'takeoff') dayEnd(pre); } catch (e) { console.warn('[story] dayEnd', e); }
    return res;
  });

  // ------------------------------------------------------------------------------------------ host events
  on('registerHandlers', (Hh, g) => {
    if (g !== game) return;
    Hh('streq', (d, from) => {
      try {
        if (!d || !enabled() || !host()) return;
        if (!st()) return;
        switch (d.op) {
          case 'job': hostJob(d.i | 0, from); break;
          case 'quit': hostQuit(from); break;
          case 'choose': hostChoose(String(d.id || ''), from, d); break;
          case 'heal': if (st().job?.state === 'running') H.heals++; break;
          default: break;
        }
      } catch (e) { console.error('[story] streq', e); }
    });
  });
  const askHost = (op, extra = {}) => game.net?.request('streq', { op, ...extra });
  on('phase', (ph, g) => {
    if (g !== game || disposed || !enabled() || !host() || !run()) return;
    const s = st(); if (!s) return;
    if (ph === 'landing') {
      H.peak = 0; H.heals = 0; H.extra = 0;
      const mo = MOONS[run().moon];
      if (s.job?.state === 'active' && !mo?.company && !mo?.home) { s.job = { ...s.job, state: 'running' }; pushSt(); }
      refreshTrend();
      const tr = trend();
      if (tr && H.trendKey !== `${runKey()}:${run().day}`) { H.trendKey = `${runKey()}:${run().day}`; later(() => intercom('TRENDING: {@c} {h}. More of them, one level higher, better loot. The viewers love a hashtag.', { c: CREATURES[tr.type].name, h: '#' + tr.type }), 9000); }
      const line = C.toneLine(effA(), 'land', `${runKey()}:${run().day}`);
      if (line) later(() => intercom(line), 4500);
    } else if (ph === 'orbit') {
      refreshTrend(); tagContracts(); genOffers(false); checkAct();
      const line = C.toneLine(effA(), 'orbit', `${runKey()}:${run().day}`);
      if (line) later(() => intercom(line), 3500);
    }
  });
  on('hostStart', (g) => { if (g === game && host()) { try { st(); refreshTrend(); } catch (e) { console.warn('[story] start', e); } } });
  on('useItem', (it, hk, g) => {
    if (g !== game || !it || disposed) return;
    const d = it.def;
    // the two patron medkits are plain consumables with `heal` (actions.js only knows type 'medkit'): LMB uses them instantly
    if (d && (it.type === 'st_hr_medkit' || it.type === 'st_algo_serum') && !hk.handled) {
      hk.handled = true;
      const p = game.player;
      if (p && !p.dead && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + (d.heal || 60));
        try { game.net.request('consume', { id: it.id }); game.net.send?.('pst', { hp: p.hp }); game.sfx?.('heal', 0.6); game.ui?.toast?.(t('Patched up.'), 'good'); } catch { /* net closing */ }
      } else game.ui?.toast?.(t('Already at full health.'), 'info');
    }
    if (d && (d.heal || d.food || d.drink) && run()?.st?.job?.state === 'running') askHost('heal');
  });
  let acc = 0;
  on('update', (dt, g) => {
    if (g !== game || disposed || !enabled()) return;
    acc += dt;
    if (acc < 0.5) return;
    acc = 0;
    paint();
    if (!host() || !run()) return;
    const r = run();
    if (r.phase === 'moon') H.peak = Math.max(H.peak, game.algo1?.state?.viewers?.n | 0);
    tagContracts();
    if (r.phase === 'orbit') { checkAct(); genOffers(false); }
    if (st() && !st().trend) refreshTrend();
  });

  // ------------------------------------------------------------------------------------------ CLIENT: net -> effects
  const dockUi = createDock();
  let fin = null;
  function claim(key) {
    const p = prof();
    if (!p || !key || p.claimed[key]) return false;
    p.claimed[key] = Date.now();
    try { game.cosm5?.reward?.(key); } catch (e) { console.warn('[story] cosm', e); }
    saveProf();
    return true;
  }
  function grantTitle(title) {
    const p = game.profile; if (!p) return;
    if (!Array.isArray(p.titles)) p.titles = [];
    if (!p.titles.includes(title)) p.titles.push(title);
    if (!p.title) p.title = title;
    saveProf();
    try { game.ui?.toast?.(tf('Title unlocked: {@t}', { t: title }), 'good'); } catch { /* ui optional */ }
  }
  function fileCase(id) {
    const s = run()?.st, E = C.ENDINGS[id];
    if (!s || !E) return;
    const crew = (game.aiPlayers?.() || []).map((p) => nameOf(p.id));
    const rec = {
      n: 80100 + C.endingIndex(id), runId: String(run().runId ?? 'run'), day: run().day | 0, at: Date.now(), kind: 'story', moon: E.title, interior: '', crew: crew.slice(0, 8), entered: crew.length, returned: crew.length,
      value: 0, onBoard: 0, kills: 0, allDead: false, deaths: [], abandoned: [], artifacts: [], events: [], mvp: null, top: null, lastWords: null, contract: null, secret: null, focus: null, mood: 'amused', verdict: null, invasions: 0,
      story: { ending: id, title: E.title, color: id === 'company' ? COL.company : id === 'algorithm' ? COL.algorithm : '#c8d2dc', a: s.a, jc: s.done.company, ja: s.done.algorithm, bc: s.betrayed.company, ba: s.betrayed.algorithm, text: ENDING_TEXT[id] },
    };
    try {
      const list = game.profile && (game.profile.caseFiles ||= []);
      if (list && !list.some((x) => x.n === rec.n && x.runId === rec.runId)) { if (game.lore?.core?.cases?.receive) game.lore.core.cases.receive(rec); else { list.unshift(rec); if (list.length > 50) list.length = 50; saveProf(); } }
    } catch (e) { console.warn('[story] case', e); }
  }
  const ENDING_TEXT = {
    company: 'The employee accepted permanent employment. The employee is now a fixture. The employee is very productive. HR considers this a success.',
    algorithm: 'The crew stopped being watched and started being worn. Retention is at an all-time high. The Algorithm has never felt so understood.',
    grid: 'The crew betrayed both patrons, took the third door and vanished from every dashboard. Two systems are still searching. Neither will admit it.',
  };
  function onStx(m) {
    if (disposed || !m) return;
    switch (m.k) {
      case 'say': { const line = tf(m.s, m.v || {}); if (game.lore?.say) game.lore.say(line); else game.ui?.toast?.(line, 'info'); break; }
      case 'banner': game.ui?.hud?.bigText?.(tf(m.main, m.v || {}), m.sub ? tf(m.sub, m.v || {}) : ''); game.sfx?.('ship_alarm', 0.25); break;
      case 'unlock':
        for (const id of m.ids || []) {
          const u = C.UNLOCKS.find((x) => x.id === id); if (!u) continue;
          game.ui?.hud?.bigText?.(t(u.patron === 'company' ? 'LOYALTY UNLOCK' : 'FAVOUR UNLOCK'), t(ITEM_DEFS.find((x) => x.id === u.shop)?.name || u.shop));
          if (game.lore?.say) game.lore.say(tf(u.line, { n: m.a }));
          claim(u.cosm);
        }
        break;
      case 'fin': onFin(m); break;
      default: break;
    }
  }
  function onFin(m) {
    const E = C.ENDINGS[m.id]; if (!E) return;
    const col = m.id === 'company' ? COL.company : m.id === 'algorithm' ? COL.algorithm : '#c8d2dc';
    if (m.i < 0) { fin?.remove(); fin = createFinale(col); return; }
    const script = C.finaleScript(m.id), e = script[m.i]; if (!e) return;
    if (!fin) fin = createFinale(col);
    if (e.k === 'banner') { fin.banner(t(e.s), e.sub ? t(e.sub) : ''); game.sfx?.('quota_met', 0.7); }
    else if (e.k === 'line') { fin.line(t(e.s)); game.sfx?.('terminal_enter', 0.35); }
    else if (e.k === 'shake') { try { game.engine?.shake?.(0.6); } catch { /* optional */ } game.sfx?.('stun_bang', 0.5); }
    else if (e.k === 'reward') { grantTitle(E.title); claim(E.cosm); fileCase(m.id); const p = prof(); if (p) { p.endings[m.id] = Date.now(); saveProf(); } }
    if (m.i === script.length - 1) fin.end(9000);
  }
  const onStxMsg = (m, from) => { if (from === game.selfId || from === game.net?.hostId) onStx(m); };
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:stx', onStxMsg);
    boundNet = net; net.on('msg:stx', onStxMsg);
  }
  on('netReady', (n, g) => { if (g === game) bindNet(n); });
  if (game.net) bindNet(game.net);
  registerCase();

  // ------------------------------------------------------------------------------------------ CLIENT: HUD dock + objectives + terminal
  const actName = (n) => (n === 1 ? 'ACT I: HIRED' : n === 2 ? 'ACT II: THE OFFER' : 'ACT III: THE CHOICE');
  function paint() {
    const r = run(), s = r && view();
    if (!r || !['orbit', 'landing', 'moon', 'company'].includes(r.phase)) { dockUi.update({ show: false }); return; }
    const j = s.job, tr = trend();
    const show = Math.abs(s.a) >= 1 || !!j || s.act >= 2 || !!tr;
    const jobLine = j ? `${t(patronName(j.patron))}: ${t(C.JOBS[j.id]?.title || '')}${j.state === 'active' ? ' · ' + t('starts on landing') : ''}` : '';
    dockUi.update({ show, a: s.a, head: `${t('PATRON')} · ${t(actName(s.act))}${s.ending ? ' · ' + t(C.ENDINGS[s.ending].title) : ''}`, l: t('COMPANY'), r: t('ALGORITHM'), jobLine, trendLine: tr ? `${t('TRENDING')}: ${trendName()} #${tr.type}` : '' });
  }
  on('objectives', (add, g, phase) => {
    if (g !== game || disposed || !enabled()) return;
    const r = run(), s = r && view();
    if (!s) return;
    const j = s.job;
    if (phase === 'orbit') {
      if (j) add(`${t('Patron job')}: ${jobText(j).title} (${t(patronName(j.patron))}) - ${t('land to start')}`, 'sub');
      else if (s.offers?.some((o) => !o.taken)) add(t('Patron jobs: terminal JOBS'), 'hint');
      if (s.act >= 3 && !s.ending) add(t('ACT III: choose your ending: terminal CHOOSE'), 'main');
      const tr = trend(); if (tr) add(`${t('TRENDING')}: ${trendName()}`, 'hint');
    } else if (phase === 'moon' && j?.state === 'running') add(`${t(patronName(j.patron))}: ${jobText(j).brief}`, 'sub');
  });
  function statusText() {
    const r = run(), s = r && view();
    if (!s) return t('No run in progress.');
    const a = s.a, tier = C.tierOf(a);
    const bar = (() => { const n = 21, i = Math.round((a + 100) / 200 * (n - 1)); return '[' + Array.from({ length: n }, (_, k) => (k === i ? '#' : k === (n - 1) / 2 ? '|' : '-')).join('') + ']'; })();
    const out = [t('PATRON FILE'), '', `${t('COMPANY')} ${bar} ${t('ALGORITHM')}   ${a > 0 ? '+' : ''}${Math.round(a)}`, `${t(actName(s.act))}${s.ending ? '  ·  ' + t(C.ENDINGS[s.ending].title) : ''}`,
      tf('Jobs done: Company {c}, Algorithm {a}. Betrayals: Company {bc}, Algorithm {ba}.', { c: s.done.company, a: s.done.algorithm, bc: s.betrayed.company, ba: s.betrayed.algorithm })];
    if (tier.patron) out.push(tf('Standing: {@p}, tier {n}/3 (loyalty {l}).', { p: patronName(tier.patron), n: tier.tier, l: Math.round(tier.loyalty) }));
    out.push('', t('UNLOCKS'));
    for (const u of C.UNLOCKS) {
      const have = C.loyalty(effA(), u.patron) >= u.at, d = ITEM_DEFS.find((x) => x.id === u.shop);
      out.push(`${have ? '[x]' : '[ ]'} ${t(patronName(u.patron))} ${u.at}: ${t(d?.name || u.shop)} + ${t(cosmName(u.cosm))}`);
    }
    if (Math.abs(effA()) >= C.AL.creatureAt) out.push('', tf('Creatures: {@a} content leaves you alone, {@b} property hunts you.', effA() > 0 ? { a: 'Algorithm', b: 'Company' } : { a: 'Company', b: 'Algorithm' }));
    const tr = trend();
    if (tr) out.push('', `${t('TRENDING THIS WEEK')} (${tr.week}): ${trendName()} #${tr.type}. ${t('More of them, one level higher, extra loot.')}`);
    if (s.act >= 3 && !s.ending) {
      out.push('', t('ENDINGS (CHOOSE <name> in orbit)'));
      const es = C.endingStatus(s, eggsCtx());
      for (const id of C.ENDING_IDS) { const e = es[id]; if (e.hidden) continue; out.push(`${e.ok ? '[ready]' : '[ -- ]'} ${id.toUpperCase().padEnd(10)} ${t(C.ENDINGS[id].title)}${e.ok ? '' : '  ' + e.missing.map((x) => tf(x.k, x.v)).join(' · ')}`); }
    }
    return out.join('\n');
  }
  const cosmName = (key) => ({ 'back:banner': 'Company Banner', 'back:cape': "Manager's Cape", 'hat:foremanhat': "Foreman's Halo Hardhat", 'emote:praise': 'Praise the Algorithm', 'suit:algocult': 'Algorithm Cultist Robe', 'hat:firewall': 'Firewall Crown' }[key] || key);
  function jobsText() {
    const r = run(), s = r && view();
    if (!s) return t('No run in progress.');
    const out = [t('PATRON JOBS'), ''];
    if (s.job) out.push(`${t('ACTIVE')}: [${t(patronName(s.job.patron))}] ${jobText(s.job).title} - ${s.job.state === 'running' ? t('IN PROGRESS') : t('ACCEPTED')}`, `  ${jobText(s.job).brief}`, '');
    if (!s.offers?.length) out.push(t('No jobs today. New ones arrive in orbit.'));
    s.offers?.forEach((o, i) => { const tx = jobText(o); out.push(`${o.taken ? 'x' : i + 1}. [${t(patronName(o.patron))}] ${tx.title}${o.taken ? '  [TAKEN]' : ''}`, `   ${tx.brief}`, `   ▮${o.pay.credits} · ${o.pay.xp} XP · ${t('loyalty')} ${o.patron === 'company' ? '-' : '+'}${o.shift}`); });
    out.push('', t('>JOB <n> take a job · >QUITJOB drop it (counts as a betrayal) · >PATRON your file · >TREND the weekly trend'));
    return out.join('\n');
  }
  const cmdNames = [];
  (function registerCommands() {
    const api = mods.api || (typeof window !== 'undefined' ? window.KefalAPI : null);
    if (!api?.registerCommand) return;
    const reg = (name, fn, help) => { api.registerCommand(name, (rest, term) => { if (!enabled()) { term.print(t('The story is disabled.'), 'err'); return; } if (!run()) { term.print(t('No run in progress.'), 'err'); return; } fn(rest || [], term); }, help); cmdNames.push(name); };
    reg('patron', (rest, term) => term.print(statusText()), 'PATRON: allegiance, unlocks, endings, the weekly trend');
    reg('jobs', (rest, term) => term.print(jobsText()), 'JOBS: today\'s patron jobs (Company / Algorithm)');
    reg('job', (rest, term) => { const n = parseInt(rest[0], 10); if (!(n >= 1)) { term.print(t('Usage: JOB <n>'), 'err'); return; } askHost('job', { i: n - 1 }); }, 'JOB <n>: take a patron job (orbit only)');
    reg('quitjob', () => askHost('quit'), 'QUITJOB: drop the active patron job (a betrayal)');
    reg('choose', (rest, term) => {
      const id = String(rest[0] || '').toLowerCase();
      if (!id) { term.print(statusText()); return; }
      const key = { company: 'company', hr: 'company', algorithm: 'algorithm', algo: 'algorithm', grid: 'grid', offgrid: 'grid' }[id] || id;
      askHost('choose', { id: key, ...eggsCtx() });
    }, 'CHOOSE <company|algorithm>: pick your ending (Act III, in orbit)');
    reg('trend', (rest, term) => { const tr = trend(); term.print(tr ? `${t('TRENDING THIS WEEK')} (${tr.week}): ${trendName()} #${tr.type}\n${t('More of them, one level higher, extra loot.')}` : t('Nothing is trending. Yet.')); }, 'TREND: this week\'s trending creature');
  })();

  // shared board text: tag the existing contract offers (the ship board / CONTRACTS read offer.patron)
  return {
    core: C, state: st, effA, trend, items: ITEM_DEFS.map((d) => d.id), genOffers, hostJob, hostQuit, hostChoose, checkAct, dayEnd, statusText, jobsText, refreshTrend,
    dispose() {
      disposed = true;
      for (const o of offs.splice(0)) { try { o?.(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      restores.length = 0;
      try { boundNet?.off?.('msg:stx', onStxMsg); } catch { /* ignore */ }
      for (const n of cmdNames) mods.commands?.delete(n);
      for (const id of timers) { try { clearTimeout(id); } catch { /* ignore */ } }
      dockUi.dispose(); fin?.remove(); unregisterCase();
    },
  };
}
