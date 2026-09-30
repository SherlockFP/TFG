// GUIDE (wave 4): the Algorithm as an in-character ADVISOR + a light optional first-landing TUTORIAL.
// Installed with game.useModule('guide', installGuide) -> game.guide. Everything is LOCAL (per profile, no net messages):
//   * registry     src/game/guide_data.js (hand-written features with EN/TR/RU how-to) + every terminal command found at runtime
//                  (mods.commands: built-ins of other modules register there, so new commands show up in GUIDE ALL by themselves)
//   * tracking     feature use is detected from real events: terminal commands (Terminal.exec wrap), panels (ui.openPanel wrap),
//                  keys, scan / arcade wraps, mod-bus events (tfg:spell, tfg:role, useItem, tfg:musicStart, tfg:brlevel), polling
//   * advisor      short Algorithm lines in the existing intercom box (game.lore.say) about things NOT tried yet, chosen by context
//                  (guide_core.selectTip: cooldown ~2.5 min, repeat gap, max 3 shows, muted via Settings > Algorithm tips)
//   * terminal     GUIDE [name|ALL|MUTE|UNMUTE], TIPS, ALGO TIPS, TUTORIAL [STATUS|SKIP|RESTART], "did you mean" on unknown words
//   * tutorial     7 objectives (move, light, scrap, inventory, scan, back to ship, sell) via the 'objectives' hook, never blocking
// Profile: profile.guide (see guide_core.js). Setting: settings.guideTips (default on). Docs: docs/wave4/guide.md.
import { attentionHot } from '../ui/hud_attention.js';
import { getLang, t } from '../core/i18n.js';
import { saveSettings } from '../core/save.js';
import { wrapMethod } from './dailyEvents.js';
import { isSellable, itemDef } from './items.js';
import { threatNearNoise } from './stealth_core.js';
import {
  FEATURES, CATS, UI, TUT_STEPS, TUT_DONE_SAY, HIDDEN_CMDS, pick, fmt,
} from './guide_data.js';
import {
  ensureState, markUsed, isUsed, usedCount, visibleFeatures, featureById, canon, selectTip, recordShown, untried, findFeature, suggestCommand,
  classifyPanel, PANEL_MAP, CMD_MAP, KEY_MAP, EVT_MAP, tutInit, tutRunning, tutCurrent, tutEvent, tutCredit, tutSkip, tutDoneCount, tutStepProgress,
  resetTutorial, stepObjective, needsOk, tipText, firstSentence, COOLDOWN_S, TUT_TOTAL,
} from './guide_core.js';

const lang = () => { try { return getLang(); } catch { return 'en'; } };
const T = (k, v) => fmt(pick(UI[k], lang()), v);

export function installGuide(game) {
  const offs = [];
  const restores = [];
  let disposed = false;
  let sneakT = 0;
  const S = {
    t: 0, lastTipT: -Infinity, nextGap: COOLDOWN_S, pollT: 0, tipT: 0, sayQ: [], quietT: 0, tutT: 0, lastPos: null,
    last: { sold: null, scrap: 0, flash: false, market: false, mirror: false, hp: 1 }, tips: 0, ctx: new Set(),
    tutStartSaid: false, finishing: false, seeded: false,
  };
  const G = () => ensureState(game.profile);
  const g0 = G();
  const save = () => { try { game.progress?.save?.(); } catch { /* optional */ } };
  const has = (name) => (String(name).startsWith('cmd:') ? !!game.mods?.commands?.has?.(String(name).slice(4)) : !!game[name]);
  const muted = () => game.settings?.guideTips === false;

  // ---------------------------------------------------------------- first run: veteran detection + used seeds
  function seed() {
    const g = G(), p = game.profile;
    if (!g || g.seeded) return;
    g.seeded = 1;
    const st = p.stats || {};
    const veteran = (st.days || 0) > 0 || (st.runs || 0) > 1 || (st.quotasMet || 0) > 0 || (p.level || 1) >= 4 || (st.scrapCollected || 0) > 0 || (st.sold || 0) > 0;
    tutInit(g, veteran);
    const u = (id) => markUsed(g, id);
    if (p.rpg?.nodes?.length) u('skilltree');
    if (p.rpg?.role) u('role');
    if (p.pets?.stable?.length) u('pets');
    if (p.loreLogs && Object.keys(p.loreLogs).length) u('logs');
    if (Object.values(p.bestiary || {}).some((b) => b?.kills)) u('scan');
    if ((p.owned || []).length > 1) u('blackmarket');
    if (p.shipyard && Object.keys(p.shipyard.modules || p.shipyard.mods || {}).length) u('shipyard');
    save();
  }
  seed();
  if (!g0.tut.s) tutInit(g0, false);

  // ---------------------------------------------------------------- usage tracking
  function use(id) {
    const g = G();
    if (!g || disposed) return false;
    const first = markUsed(g, id);
    if (first) save();
    return first;
  }
  function onCommand(w0) {
    const id = CMD_MAP.get(w0);
    if (id) use(id);
    else if (game.mods?.commands?.has(w0)) use('cmd:' + w0);
  }
  function onPanel(el) {
    const kind = classifyPanel(el);
    if (!kind) return;
    const id = PANEL_MAP.get(kind);
    if (id) use(id);
    if (kind === 'inventory') tut('inv');
  }
  const cmdNames = () => {
    const names = new Set(['moons', 'sector', 'info', 'route', 'store', 'buy', 'scan', 'quota', 'crew', 'bestiary', 'switch', 'codes', 'transmit', 'teleport', 'clear', 'help']);
    for (const k of game.mods?.commands?.keys?.() || []) names.add(k);
    for (const k of CMD_MAP.keys()) names.add(k);
    for (const k of HIDDEN_CMDS) names.delete(k);
    names.add('guide'); names.add('tutorial'); names.add('help');
    return [...names];
  };

  // Terminal.exec wrap: track the command word, add a hint after HELP and a suggestion after an unknown word
  const term = game.terminal;
  if (term) {
    restores.push(wrapMethod(term, 'exec', (orig) => function (cmd, ...rest) {
      const w0 = String(cmd || '').toLowerCase().trim().split(/\s+/)[0];
      const beforeLast = this.lines?.[this.lines.length - 1];
      const r = orig.call(this, cmd, ...rest);
      if (disposed) return r;
      try {
        const last = this.lines?.[this.lines.length - 1];
        const unknown = !!last && last !== beforeLast && last.text === t('[There was no action supplied with the word.]');
        if (unknown) {
          if (!/^[a-z]\d{1,2}$/.test(w0)) { const s = suggestCommand(w0, cmdNames()); if (s) this.print(T('guide_did_you_mean', { c: s.toUpperCase() }), 'dim'); }
        } else if (w0) {
          onCommand(w0);
          if (w0 === 'help' || w0 === '?') setTimeout(() => { if (!disposed && term.active) { const n = untriedList().length; if (n) term.print(T('guide_hint_help', { n }), 'dim'); } }, 40);
        }
      } catch (e) { console.warn('[guide] exec hook', e); }
      return r;
    }));
  }

  // ui.openPanel wrap: which panel opened
  const ui = game.ui;
  if (ui) restores.push(wrapMethod(ui, 'openPanel', (orig) => function (content, ...rest) {
    const r = orig.call(this, content, ...rest);
    try { if (!disposed) onPanel(content); } catch (e) { console.warn('[guide] panel hook', e); }
    return r;
  }));
  // scan / arcade (actions mixins on the Game instance)
  restores.push(wrapMethod(game, 'scan', (orig) => function (...a) { const r = orig.apply(this, a); if (!disposed) { use('scan'); tut('scan'); } return r; }));
  restores.push(wrapMethod(game, 'startArcade', (orig) => function (...a) { const r = orig.apply(this, a); if (!disposed) use('arcade'); return r; }));

  // keys + middle mouse (gameplay only: pointer locked, not typing)
  const onKey = (e) => {
    if (disposed || e.repeat || !game.input?.locked || game.input.isTyping?.()) return;
    const id = KEY_MAP.get(e.code);
    if (id) use(id);
  };
  const onMouse = (e) => { if (!disposed && e.button === 1 && game.input?.locked) use('ping'); };
  if (typeof window !== 'undefined') { window.addEventListener('keydown', onKey, true); window.addEventListener('mousedown', onMouse, true); }

  // mod-bus events
  const mm = game.mods;
  const on = (ev, fn) => { const off = mm?.on?.(ev, (...a) => { if (disposed) return; try { fn(...a); } catch (e) { console.warn('[guide]', ev, e); } }); if (off) offs.push(off); };
  on('tfg:spell', (d) => { if (!d || d.caster === game.selfId || d.caster === undefined) use('magic'); });
  on('tfg:role', () => use('role'));
  on('tfg:musicStart', (d) => { if (!d || d.by === game.selfId || d.by === undefined) use('music'); });
  on('tfg:brlevel', () => use('backrooms'));
  on('useItem', (it) => {
    const def = it?.def;
    if (!def) return;
    if (def.grenade || def.throwable) use('grenades');
    if (String(it.type || '').startsWith('fd_') || it.type === 'medkit') use('food');
  });
  // itemState also carries remote/world lamps: only credit a lamp in this player's hotbar.
  on('itemState', (it) => { if ((it?.type === 'flashlight' || it?.type === 'proflash') && it.on && game.player?.slots?.includes(it.id)) { use('flashlight'); tut('flash'); } });

  // ---------------------------------------------------------------- tutorial
  function tut(ev, data) {
    const g = G();
    if (!g || disposed || !tutRunning(g)) return;
    const r = tutEvent(g, ev, data);
    if (!r.steps.length) return;
    save();
    if (r.finished) finishTutorial();
    else queueStepSay(0);
  }
  function queueStepSay(delay = 3) {
    const g = G();
    const s = tutCurrent(g);
    if (!s || g.tut.said[s.id]) return;
    g.tut.said[s.id] = 1;
    if (s.id === 'move' && game.onboard?.controlsPinned?.()) { save(); return; }   // [algoctx] the stream overlay / Hiring Day already showed WASD, Shift and C
    S.sayQ.push({ text: pick(s.say, lang()), at: S.t + delay, kind: 'tut', id: s.id, key: 'say:' + s.id, src: s.say, ctx: s.ctx });
    save();
  }
  function finishTutorial() {
    if (S.finishing) return;
    S.finishing = true;
    const xp = 60, coins = 25;
    S.sayQ.push({ text: pick(TUT_DONE_SAY, lang()), at: S.t + 2.5, kind: 'tut', src: TUT_DONE_SAY });
    try { game.progress?.addXp?.(xp, 'tutorial'); game.progress?.addCoins?.(coins, 'tutorial'); } catch { /* optional */ }
    try { game.ui?.toast?.(T('tut_done_toast', { xp, coins }), 'good'); } catch { /* optional */ }
    save();
  }
  function restartTutorial() {
    resetTutorial(game.profile);
    S.finishing = false; S.tutStartSaid = false; S.tutT = 0; S.sayQ = S.sayQ.filter((q) => q.kind !== 'tut');
    S.last.sold = game.run?.sold ?? null;
    save();
    return true;
  }
  function skipTutorial() { const ok = tutSkip(G()); if (ok) { S.sayQ = S.sayQ.filter((q) => q.kind !== 'tut'); save(); } return ok; }

  function hasFlashlight() {
    const p = game.player;
    for (const id of p?.slots || []) { const it = id && game.items?.get?.(id); if (it && (it.type === 'flashlight' || it.type === 'proflash')) return true; }
    return false;
  }
  const lightContext = () => ({
    hasFlashlight: hasFlashlight(),
    docked: !!game.fleet13?.docked?.(),
    bagFlashlight: !!(game.inventory?.bagItems?.() || []).some(it => it.type === 'flashlight' || it.type === 'proflash'),
    price: game.shop?.priceOf?.('flashlight') ?? itemDef('flashlight')?.price ?? 15,
    key: (game.input?.key?.('flashlight') || 'KeyF').replace(/^Key/, '').replace(/^Digit/, ''),
  });
  const holdsScrap = () => {
    const p = game.player;
    for (const id of p?.slots || []) { const it = id && game.items?.get?.(id); if (it && it.def && isSellable(it.def) && !it.soulbound && it.type !== 'body') return true; }
    return false;
  };

  // objectives hook: the current step (+ how to skip)
  on('objectives', (add, g, phase) => {
    if (g && g !== game) return;
    const gs = G();
    if (!gs || !tutRunning(gs) || game.player?.dead || game.onboard?.active?.()) return;   // [onboard] Hiring Day shows its own objectives
    const s = tutCurrent(gs);
    if (!s) return;
    const idx = TUT_STEPS.indexOf(s) + 1;
    const tutLine = add(T('tut_obj', { n: idx, total: TUT_TOTAL, text: stepObjective(s, lang(), lightContext()) }), 'main', false, tutStepProgress(gs, s.id) || null);
    if (tutLine && typeof tutLine === 'object') tutLine.pin = true;   // wave 8: never hidden by the calm HUD cut
    if (S.tutT < 300) add(T('tut_skip_hint'), 'hint');
    void phase;
  });

  // ---------------------------------------------------------------- context flags + advisor
  function computeCtx() {
    const f = new Set();
    const run = game.run || {}, p = game.player, prof = game.profile, st = prof.stats || {};
    const ph = run.phase;
    if (ph === 'orbit') f.add('orbit'); if (ph === 'moon' || ph === 'landing') f.add('moon'); if (ph === 'company') f.add('company');
    if (p?.indoor) f.add('indoor'); if (p?.inShip) f.add('inship');
    const cr = run.credits || 0;
    if (ph === 'orbit' && cr >= 120) f.add('rich');
    if (cr >= 450) f.add('wealthy');
    const hp = p && p.maxHp ? p.hp / p.maxHp : 1;
    if (!p?.dead && hp < 0.4) f.add('lowhp');
    if (!p?.dead && hp < 0.72) f.add('hurt');
    if ((prof.skillPoints || 0) > 0 || (game.rpg?.points?.() || 0) > 0) f.add('skillpts');
    let book = false, grenade = false, food = false, light = false, full = true;
    for (const id of p?.slots || []) {
      if (!id) { full = false; continue; }
      const it = game.items?.get?.(id);
      const def = it?.def;
      if (!it || !def) continue;
      if (def.kind === 'skillbook') book = true;
      if (def.grenade) grenade = true;
      if (String(it.type).startsWith('fd_') || it.type === 'medkit') food = true;
      if (it.type === 'flashlight' || it.type === 'proflash') light = true;
    }
    if (book) f.add('skillbook'); if (grenade) f.add('hasgrenade'); if (food) f.add('hasfood'); if (full && (p?.slots || []).length) f.add('invfull');
    if (!light) f.add('noflash');
    if (game.rpg && !game.rpg.role?.() && (prof.level || 1) >= 2) f.add('norole');
    if ((prof.coins || 0) >= 100) f.add('coins');
    if ((prof.level || 1) >= 3) f.add('lvl3');
    if ((st.days || 0) >= 1 || (run.day || 1) >= 2) f.add('day2');
    if ((run.quotaIndex | 0) >= 1) f.add('quotaMet');
    if (Object.values(prof.bestiary || {}).some((b) => b?.seen)) f.add('seencreature');
    if (game.remotes?.size > 0) f.add('crew');
    if ((run.time || 0) >= 20 * 60) f.add('night');
    if (prof.loreLogs && Object.keys(prof.loreLogs).length) f.add('lore_found');
    if (game.daily) f.add('daily');
    return f;
  }

  const loreBusy = () => {
    const a = game.lore?.core?.algo;
    return !!(a && (a.speaking || (a.state?.q?.length || 0) > 0));
  };
  function canSpeak() {
    if (attentionHot(game) || game.ui?.centerCards?.busy?.()) return false;
    if (game.player?.dead || game.minigame || game.terminal?.active || game.ui?.panelOpen || game.ui?.chatOpen || game.ui?.fullscreenOpen?.()) return false;
    if ((game.chase?.tension?.() || 0) > 0.12 || threatNearNoise(game.player, game.creatures?.views?.values?.(), 10)) return false;
    if (!game.run || game.run.phase === 'fired') return false;
    return !loreBusy() && S.quietT <= 0;
  }
  function say(text, pri = false, ctx) {
    try {
      if (game.lore?.say) { game.lore.say(text, { mood: 'curious', pri, ctx }); return true; }
      game.ui?.toast?.(pick(UI.fallback_prefix, lang()) + text, 'info');
      return true;
    } catch (e) { console.warn('[guide] say', e); return false; }
  }

  function untriedList() { return untried(G(), computeCtx(), { has, level: game.profile.level }); }

  function advise() {
    const g = G();
    const flags = S.ctx = computeCtx();
    const pick_ = selectTip(g, flags, { t: S.t, lastTipT: S.lastTipT, muted: muted(), tutorial: tutRunning(g), count: S.tips }, { has, level: game.profile.level, cooldown: S.nextGap });
    if (!pick_) return false;
    const text = tipText(pick_.feature, pick_.i, lang(), { lvl: game.profile.level });
    if (!say(text)) return false;
    recordShown(g, pick_.id, pick_.i);
    S.lastTipT = S.t; S.tips += 1;
    S.nextGap = COOLDOWN_S + Math.random() * 60;
    S.quietT = 6;
    save();
    return true;
  }
  /** debug / harness: show a tip right now, ignoring cooldown and grace */
  function forceTip(id) {
    const f = featureById(id) || FEATURES.find((x) => canon(x) === id && x.tips?.length);
    if (!f?.tips?.length) return false;
    return say(tipText(f, 0, lang(), { lvl: game.profile.level }));
  }

  // ---------------------------------------------------------------- polling: tutorial events + a few usage flags
  function poll(dt) {
    const g = G();
    const run = game.run, p = game.player;
    if (!g || !run || !p) return;
    // movement (horizontal, ignores teleports and the ship's takeoff / landing shake)
    const pos = p.pos;
    if (pos && S.lastPos && !p.dead && !p.frozen) {
      const d = Math.hypot(pos.x - S.lastPos.x, pos.z - S.lastPos.z);
      if (d > 0.02 && d < 3 && p.crouch && !p.sprinting) sneakT += 0.25;
      if (sneakT > 3) use('sneak');
      if (d > 0 && d < 3) { if (tutRunning(g)) tut('move', { d, sprint: !!p.sprinting && d > 0.02, crouch: !!p.crouch }); }
    }
    if (pos) S.lastPos = { x: pos.x, z: pos.z };
    if (tutRunning(g)) {
      S.tutT += dt;
      if (!S.obCredit && game.profile?.onboard?.s === 'done') { S.obCredit = true; const r = tutCredit(g, ['move', 'light', 'scrap']); if (r.steps.length) { save(); if (r.finished) finishTutorial(); } }   // [onegoal] Hiring Day already taught these
      let fl = false; try { fl = !!game.flashlightOn?.(); } catch { /* optional */ }
      if (fl) { use('flashlight'); tut('flash'); }
      const carrying = holdsScrap();
      if (carrying) { S.last.scrap = 1; tut('scrap'); }
      if (S.last.scrap && p.inShip && !carrying && run.phase !== 'company') tut('ship');
      try { for (const it of game.items?.inShipItems?.() || []) if (it.collected && it.def && isSellable(it.def)) { tut('scrap'); tut('ship'); break; } } catch { /* optional */ }
      if (run.sold != null) { if (S.last.sold != null && run.sold > S.last.sold) tut('sell'); S.last.sold = run.sold; }
    }
    // usage flags that have no event
    if (game.ui?.marketOpen && !S.last.market) use('blackmarket');
    S.last.market = !!game.ui?.marketOpen;
    try { if (game.mirror?.debug?.().inside) use('mirror'); } catch { /* optional */ }
    if (game.flashlightOn?.()) use('flashlight');
  }

  // ---------------------------------------------------------------- update loop
  on('update', (dt, gm) => {
    if (gm && gm !== game) return;
    S.t += dt;
    if (S.quietT > 0) S.quietT -= dt;
    S.pollT -= dt;
    if (S.pollT <= 0) { S.pollT = 0.25; poll(0.25); }
    const g = G();
    if (!g || !game.run || game.onboard?.active?.()) return;   // [onboard] the guide waits while Hiring Day runs
    // queued tutorial lines first (tips wait while a tutorial line is due)
    if (S.sayQ.length && S.sayQ[0].at <= S.t) {
      if (tutRunning(g) || S.sayQ[0].src === TUT_DONE_SAY) { if (canSpeak()) { const q = S.sayQ.shift(); say(pick(q.src, lang()), true, q.ctx); S.quietT = 4; } }
      else S.sayQ.shift();
      return;
    }
    if (tutRunning(g) && !S.tutStartSaid && S.t > 8 && game.run.phase) {
      S.tutStartSaid = true;
      if (!g.tut.said.start) { g.tut.said.start = 1; queueStepSay(9); save(); }   // [algoctx] no 'optional onboarding started' line
      else queueStepSay(6);
      return;
    }
    S.tipT -= dt;
    if (S.tipT > 0) return;
    S.tipT = 1;
    if (!S.sayQ.length && canSpeak() && !game.onboard?.fr?.calm?.('tips')) advise();   // [firstrun] no 'you have not tried X' tips before the first sale
  });

  // ---------------------------------------------------------------- terminal commands
  const kapi = typeof window !== 'undefined' ? window.KefalAPI : null;
  const ownCmds = new Map();
  const regCmd = (name, fn, help) => { if (!kapi?.registerCommand) return; ownCmds.set(name, fn); kapi.registerCommand(name, fn, help); };

  function listText() {
    const g = G(), flags = computeCtx();
    const list = untried(g, flags, { has, level: game.profile.level });
    if (!list.length) return T('guide_none');
    const out = [T('guide_title'), ''];
    const MAX = 8;
    for (const e of list.slice(0, MAX)) {
      const f = e.f;
      out.push(`* ${pick(f.name, lang()).toLocaleUpperCase(lang())}${f.key ? '  [' + f.key + ']' : ''}${e.rel ? '  <-' : ''}`);
      out.push('    ' + firstSentence(pick(f.how, lang())));
    }
    if (list.length > MAX) out.push('', T('guide_more', { n: list.length - MAX }));
    out.push('', T('guide_footer'));
    return out.join('\n');
  }
  function allText() {
    const g = G();
    const vis = visibleFeatures().filter((f) => needsOk(f, { has }));
    const out = [T('guide_all_title', { used: vis.filter((f) => g.used[f.id]).length, total: vis.length }), ''];
    for (const cat of Object.keys(CATS)) {
      const rows = vis.filter((f) => f.cat === cat);
      if (!rows.length) continue;
      out.push(pick(CATS[cat], lang()));
      for (const f of rows) out.push(`  [${g.used[f.id] ? 'x' : ' '}] ${pick(f.name, lang())}${f.key ? '  [' + f.key + ']' : ''}${f.cmds?.length ? '  >' + f.cmds[0].toUpperCase() : ''}`);
      out.push('');
    }
    // every other terminal command found at runtime (mods, wave modules): auto-collected
    const known = new Set(CMD_MAP.keys());
    const others = [...(game.mods?.commands?.entries?.() || [])].filter(([k]) => !known.has(k) && !HIDDEN_CMDS.has(k) && !FEATURES.some((f) => f.id === k));
    if (others.length) {
      out.push(pick(UI.other_cmds, lang()));
      for (const [k, c] of others) out.push(`  [${g.used['cmd:' + k] ? 'x' : ' '}] >${k.toUpperCase()}  ${c.help || ''}`);
      out.push('');
    }
    out.push(T('guide_footer'));
    return out.join('\n');
  }
  function detailText(f) {
    const g = G();
    const out = [pick(f.name, lang()).toLocaleUpperCase(lang()) + '  -  ' + T(g.used[canon(f)] ? 'guide_state_tried' : 'guide_state_new'), '', T('guide_how') + pick(f.how, lang())];
    if (f.cmds?.length) out.push('', T('guide_cmds') + f.cmds.map((c) => c.toUpperCase()).join(', '));
    if (f.key) out.push(T('guide_key') + f.key);
    return out.join('\n');
  }
  function guideCmd(rest, term_) {
    const a = (rest[0] || '').toLowerCase();
    if (a === 'mute' || a === 'off') { setMuted(true); term_.print(T('guide_muted')); return; }
    if (a === 'unmute' || a === 'on') { setMuted(false); term_.print(T('guide_unmuted')); return; }
    if (a === 'all' || a === 'index' || a === 'list') { term_.print(allText()); return; }
    if (a === 'tutorial') { tutorialCmd(rest.slice(1), term_); return; }
    if (!a) { term_.print(listText()); return; }
    const f = findFeature(rest.join(' '), lang());
    if (!f) { term_.print(T('guide_unknown'), 'err'); return; }
    term_.print(detailText(f));
  }
  function setMuted(v) {
    if (!game.settings) return;
    game.settings.guideTips = !v;
    try { saveSettings(game.settings); } catch { /* ignore */ }
  }
  function tutorialCmd(rest, term_) {
    const a = (rest[0] || 'status').toLowerCase();
    const g = G();
    if (a === 'skip') { const ok = skipTutorial(); term_.print(ok ? T('tut_skipped') : tutStatus(g)); return; }
    if (a === 'restart' || a === 'reset' || a === 'start') { restartTutorial(); term_.print(T('tut_restarted')); return; }
    if (a === 'status') { term_.print(tutStatus(g)); return; }
    term_.print(T('tut_usage'), 'err');
  }
  function tutStatus(g) {
    if (tutRunning(g)) { const s = tutCurrent(g); return T('tut_status_run', { done: tutDoneCount(g), total: TUT_TOTAL, text: s ? stepObjective(s, lang(), lightContext()) : '' }); }
    return T(g.tut.s === 'done' ? 'tut_status_done' : 'tut_status_skip');
  }
  regCmd('guide', guideCmd, 'The Algorithm\'s tips: things you have not tried yet (GUIDE <name>, GUIDE ALL, GUIDE MUTE)');
  regCmd('tips', (rest, t_) => guideCmd(rest, t_), 'alias of GUIDE');
  regCmd('tutorial', tutorialCmd, 'first-landing onboarding: TUTORIAL [STATUS|SKIP|RESTART]');
  // ALGO TIPS / ALGO GUIDE: extend the lore module's ALGO command without replacing it
  const prevAlgo = mm?.commands?.get?.('algo');
  if (prevAlgo && kapi?.registerCommand) {
    const fn = (rest, term_, gm) => {
      const a = (rest[0] || '').toLowerCase();
      if (['tips', 'guide', 'hints', 'hint', 'help', 'tutorial'].includes(a)) { a === 'tutorial' ? tutorialCmd(rest.slice(1), term_) : guideCmd(rest.slice(1), term_); return; }
      return prevAlgo.fn(rest, term_, gm);
    };
    ownCmds.set('algo', fn);
    kapi.registerCommand('algo', fn, (prevAlgo.help || '') + '; ALGO TIPS = things you have not tried');
    restores.push(() => { if (mm.commands.get('algo')?.fn === fn) mm.commands.set('algo', prevAlgo); });
  }

  // ---------------------------------------------------------------- public API (game.guide)
  return {
    features: () => FEATURES.map((f) => ({ id: f.id, cat: f.cat, used: !!G().used[canon(f)], hidden: !!f.hidden })),
    used: (id) => isUsed(G(), id), markUsed: use, usedCount: () => usedCount(G()),
    untried: () => untriedList().map((e) => e.f.id),
    ctx: () => [...computeCtx()],
    tip: advise, forceTip,
    say,
    tutorial: () => ({ state: G().tut.s, done: tutDoneCount(G()), total: TUT_TOTAL, current: tutCurrent(G())?.id || null, prog: { ...G().tut.prog } }),
    tutEvent: tut, restartTutorial, skipTutorial,
    setMuted,
    state: () => G(),
    debug: () => ({ t: S.t, lastTipT: S.lastTipT, tips: S.tips, sayQ: S.sayQ.length, ctx: [...S.ctx], commands: cmdNames().length }),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of offs) { try { o(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      if (typeof window !== 'undefined') { window.removeEventListener('keydown', onKey, true); window.removeEventListener('mousedown', onMouse, true); }
      if (mm?.commands) for (const [c, fn] of ownCmds) if (mm.commands.get(c)?.fn === fn) mm.commands.delete(c);
    },
  };
}

export { UI as GUIDE_UI, EVT_MAP };
