// ONBOARD (wave 5, module 'onboard'; docs/wave5/onboard.md; MASTERPLAN 25.1 "Hiring Day" + 23.1 staged unlocks).
//   Wave 8       the DEFAULT opening is now the stream (docs/wave8/routeboard.md): a 12 s LIVE overlay (the Algorithm introduces the crew as its new
//                content, viewer counter, chat with the controls pinned) over the ship, then straight to the terminal step (route board) -> lever -> landing.
//                The orientation wing below is kept behind ?hiringday=wing / settings.hiringWing.
//   Hiring Day   a first-time start for a fresh HOST profile: wake in Cell 07 (Company announcement, The Algorithm's first "I'm watching you") -> short linear
//                orientation corridor (move / crouch / sprint, borrow a flashlight from a locker, first loot, blackout + a harmless Algorithm creature glimpse, first
//                locked cabinet = openMinigame('lockpick', {tier:'simple'})) -> hangar with the Mini-Skeld -> board -> terminal / lever / door in the real ship -> first
//                landing on the easiest moon with ONE objective (bring 50 scrap) -> first return: day summary + The Algorithm's first remark.
//                The wing is compact merged geometry far from the ship (onboard_world.js, no lights) and is disposed on boarding. Steps are FACTS (onboard_core.js),
//                the guide's tutorial steps (move / flash / scrap) are marked as they happen. Returning players, veterans, friend lobbies, loaded saves and dev
//                auto-host skip it (profile.onboard flag); in co-op the crew simply stays in the ship (the real "hangar") and can not pull the lever meanwhile.
//   Unlocks      systems are locked at first and "gifted" by The Algorithm: store + tree at the first sale, arcade + pets q1, homeworld/farm/diner q2, forge + zones q3, voyage + season q4, gates after the first boss; each hands over one wardrobe piece (K.GIFTS).
//                Other modules ask game.onboard.locked(id) / deny(id) (one guard line each); Settings > "Unlock everything" opens all.
// State: profile.onboard (flow), profile.unlocks (schedule). No new net message types: the wing is local to the host player, the crew is told through
// the existing 'sys' message. Debug: game.onboard.debug(), .skip(), .force(stepId).
import * as THREE from 'three';
import { sysMsg, t } from '../core/i18n.js';
import { wrapMethod } from './dailyEvents.js';
import * as K from './onboard_core.js';
import * as FR from './firstrun_core.js';   // wave 8: the first-run message budget (game.onboard.fr)
import { fmtLive } from './onegoal_core.js';   // [algoctx] one number format for every LIVE count
import { TEXT, x, xf } from './onboard_text.js';
import { buildWing, SHUTTER } from './onboard_world.js';
import { grant as grantCosmetic, entry as cosmeticEntry, ensureWardrobeProfile } from './cosmetics.js';   // the unlock gifts are wardrobe pieces
import { HUB_CMDS, hubOpen } from './hubgate_core.js';   // wave 8: what each locked id switches off

const CSS = `.ob-pa{position:fixed;left:50%;top:clamp(48px,8vh,96px);transform:translateX(-50%);z-index:58;width:min(760px,94vw);background:#12130d;border:2px solid #f2c230;color:#e8e6d0;font:600 15px/1.35 'Bahnschrift','Arial Narrow',Arial,sans-serif;letter-spacing:.03em;box-shadow:0 6px 30px #000c;pointer-events:none;opacity:0;transition:opacity .35s}
.ob-pa.on{opacity:1}
.ob-pa .h{padding:4px 12px;background:repeating-linear-gradient(-45deg,#f2c230 0 10px,#15150f 10px 20px);color:#111;font-weight:800;text-transform:uppercase}
.ob-pa .h b{background:#f2c230;padding:1px 8px}
.ob-pa .t{padding:10px 14px}
.ob-st{position:fixed;inset:0;z-index:57;pointer-events:none;opacity:0;transition:opacity .45s;font:600 16px/1.3 var(--font2,'Arial Narrow',Arial,sans-serif);color:var(--t-paper,#ffd9b8)}
.ob-st.on{opacity:1}
body:has(.ob-st) :is(.hud,.algo-sub,.hud-toasts){visibility:hidden}
.ob-st .fr{position:absolute;inset:12px;border:1px solid var(--t-line-hi,#c96)}
.ob-st .lv{position:absolute;left:24px;top:22px;display:flex;align-items:center;gap:10px}
.ob-st .live{background:var(--t-bad,#ff5a48);color:#140404;font-weight:800;letter-spacing:.12em;padding:2px 10px}
.ob-st .vw{background:rgba(0,0,0,.72);padding:2px 10px;font-variant-numeric:tabular-nums;letter-spacing:.04em}
.ob-st .ti{position:absolute;right:24px;top:22px;background:var(--t-amber,#ff8a3d);color:#120800;font-weight:800;letter-spacing:.08em;padding:2px 12px;text-transform:uppercase}
.ob-st .ch{position:absolute;right:24px;bottom:84px;width:min(330px,34vw);display:flex;flex-direction:column;gap:3px}
.ob-st .ch div{background:rgba(6,4,3,.78);padding:3px 8px;font:17px/1.2 var(--font,monospace)}
.ob-st .ch b{color:var(--t-amber-hi,#ffb266);margin-right:6px;font-weight:400}
.ob-st .ch .pin{border-left:3px solid var(--t-hazard,#ffb800)}
.ob-st .ch .pin b{color:var(--t-hazard,#ffb800)}
.ob-st .lt{position:absolute;left:24px;bottom:84px;width:min(560px,56vw)}
.ob-st .lt .h{display:inline-block;padding:1px 10px;background:var(--t-stripe,#ffb800);color:#111;font-weight:800;letter-spacing:.1em}
.ob-st .lt .h b{background:var(--t-hazard,#ffb800);padding:0 8px}
.ob-st .lt .t{background:rgba(6,4,3,.86);padding:8px 12px;font-size:20px;min-height:1.3em}
.ob-st .sk{position:absolute;left:50%;bottom:30px;transform:translateX(-50%);color:var(--t-line-hi,#c96);letter-spacing:.08em}
.ob-skip{position:fixed;left:50%;bottom:16%;transform:translateX(-50%);z-index:58;padding:5px 12px;background:#12130d;border:1px solid #f2c230;color:#f2c230;font:700 13px 'Bahnschrift','Arial Narrow',Arial,sans-serif;letter-spacing:.05em;pointer-events:none;display:none}`;

const STEP_SAY = { crouch: 'say.crouch', sprint: 'say.sprint', locker: 'say.locker', flash: 'say.flash', loot: 'say.loot', lock: 'say.lock', hangar: 'say.hangar', terminal: 'say.terminal' };
const CMD_LOCK = HUB_CMDS;   // terminal word -> unlock id (hubgate_core.js SYSTEMS)
const SKIP_HOLD = 2.0;
const STREAM_LEN = 12;   // s: the LIVE overlay, then the ship (wave 8: Hiring Day <= 90 s to the first landing)
const CHATTERS = ['xX_lurker_Xx', 'ratking', 'dialup_dave', 'nightshift', '404mom', 'shrimp_enjoyer'];

export function installOnboard(game) {
  const mods = game.mods;
  if (!mods) return null;
  const offs = [], restores = [];
  let disposed = false, style = null, paEl = null, skipEl = null;
  const T = { t: 0 };
  const S = {
    decided: false, flow: null, wing: null, wingT: 0, tl: [], sh: { armed: true, t: -1, fails: 0, sprint: false, reopenAt: 0 }, blk: null, mugId: null, said: new Set(),
    board: null, histStart: 0, termWas: false, termT: 0, uT: 0, giftAt: 0, giftHint: null, skipT: 0, crewSeen: 0, retAt: 0, goalSaid: false, deadWas: false, pollT: 0, lastPos: null,
    landSaid: false, paT: 0, entered: false, camNear: false, stream: null,
  };
  const warn = (tag, e) => { try { console.warn('[onboard] ' + tag, e); } catch { /* ignore */ } };
  const save = () => { try { game.progress?.save?.(); } catch { /* optional */ } };
  // [algoctx] lines that only make sense in the ship / on the moon carry that context (dropped when stale, see onegoal_core.inferCtx)
  const SAY_CTX = { 'say.terminal': ['ship', 'orbit'], 'say.hangar': ['ship', 'orbit'], 'say.land': 'moon', 'say.goal': 'moon' };
  const say = (id, vars) => { const s = xf(id, vars); try { if (game.lore?.say) game.lore.say(s, { pri: true, ctx: SAY_CTX[id] }); else game.ui?.toast?.(s, 'info'); } catch { /* optional */ } };
  const sfx = (n, v = 0.7) => { try { game.sfx?.(n, v); } catch { /* unknown sound */ } };
  const toast = (s, kind = 'info') => { try { game.ui?.toast?.(s, kind); } catch { /* optional */ } };
  const qsp = () => { try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(''); } };

  // ============================================================================================ UNLOCKS (always installed)
  const U = () => { const u = K.ensureUnlocks(game.profile); if (u) K.decideMode(game.profile); return u; };
  const unlockAll = () => !!game.settings?.unlockAll;
  const prog = () => K.progressOf(game.run, U());
  function locked(id) {
    const u = U();
    if (!u) return false;
    const hub = game.hubgate?.remoteHub?.();   // wave 8: a joiner is ruled by the HOST's ladder (run.hub), not by their own profile
    if (hub) return !hubOpen(id, hub, unlockAll());
    return K.isLockedId(id, u, prog(), unlockAll());
  }
  function lockedVars(id) { const r = K.requirementText(id); return { name: TEXT['u.' + id]?.[0] || id, n: r?.q || 0, boss: !!r?.boss, sale: !!r?.sale }; }
  function lockedText(id, term) {
    const v = lockedVars(id);
    return xf(term ? (v.boss ? 'locked_term_boss' : v.sale ? 'locked_term_sale' : 'locked_term') : (v.boss ? 'locked_boss' : v.sale ? 'locked_sale' : 'locked_q'), v);
  }
  let denyAt = -9;
  /** guard for other modules: true (and a toast) when `id` is still locked */
  function deny(id) {
    if (disposed || !locked(id)) return false;
    if (T.t - denyAt > 1.5) { denyAt = T.t; toast(lockedText(id), 'bad'); sfx('ui_error', 0.4); }
    return true;
  }
  /** host terminal ROUTE: { k, v } (a translatable message) or null */
  function routeBlocked(m) {
    if (disposed || !m) return null;
    if (m.home && locked('homeworld')) { const v = lockedVars('homeworld'); return { k: v.boss ? TEXT.locked_term_boss[0] : TEXT.locked_term[0], v }; }
    return null;
  }
  restores.push(wrapMethod(mods, 'terminalCommand', (orig) => function (w0, rest, term) {
    if (!disposed) {
      let id = CMD_LOCK[w0];
      if (w0 === 'moon' && ['random', 'rnd', 'rand'].includes(rest?.[0])) id = 'voyage';
      if (w0 === 'route' && /^(s|~|sig|signal)\s*[1-3]$/.test((rest || []).join(' '))) id = 'voyage';
      if (id && locked(id)) { term?.print?.(lockedText(id, true), 'err'); return true; }
      if (w0 === 'help' && this.commands?.size) {   // locked commands stay out of the HELP list (the list is built synchronously, printed later)
        const hid = [...this.commands.keys()].filter((c) => CMD_LOCK[c] && locked(CMD_LOCK[c])).map((c) => [c, this.commands.get(c)]);
        for (const [c] of hid) this.commands.delete(c);
        try { return orig.call(this, w0, rest, term); } finally { for (const [c, v] of hid) this.commands.set(c, v); }
      }
    }
    return orig.call(this, w0, rest, term);
  }));
  /** hand over the unlock's ONE wardrobe piece (own profile; each peer's gift lands in their own wardrobe) -> its translated name or '' */
  function giveGift(id) {
    const g = K.giftOf(id);
    if (!g || !game.profile) return '';
    try {
      ensureWardrobeProfile(game.profile);
      const e = cosmeticEntry(g.slot, g.id);
      if (!e) return '';
      grantCosmetic(game.profile, g.slot, g.id);
      game.cosmetics?.refresh?.();
      return t(e.name);
    } catch { return ''; }
  }
  function announceGift(id) {
    const name = TEXT['u.' + id]?.[0] || id;
    const item = giveGift(id);
    const extra = item ? xf('gift_item', { name: item }) : '';
    let carded = false;
    try { carded = !!game.hubgate?.card?.(id, extra); } catch { /* optional */ }   // wave 8: the unlock card (big banner) replaces the toast
    if (!carded) toast(xf('gift_toast', { name }) + (extra ? ' | ' + extra : ''), 'good');
    sfx('ui_levelup', 0.6);
    say('gift.' + id);
    S.giftHint = { id, until: T.t + 240 };
  }
  function tickUnlocks(dt) {
    S.uT -= dt;
    if (S.uT > 0) return;
    S.uT = 0.5;
    const u = U();
    if (!u || !game.run) return;
    if (K.fold(u, prog())) save();
    if (flowActive()) return;
    if (!['orbit', 'company'].includes(game.run.phase)) return;
    if (game.ui?.panelOpen || game.terminal?.active || game.minigame || T.t < S.giftAt) return;
    const [id] = K.pendingGifts(u, prog(), unlockAll());
    if (id && K.markGiven(u, id)) { announceGift(id); save(); S.giftAt = T.t + 9; }
  }

  // ============================================================================================ HIRING DAY
  const flowActive = () => !!S.flow && S.flow.s === 'run';
  const stage = () => (flowActive() ? K.stageOf(S.flow) : 'done');
  const step = () => (flowActive() ? K.currentStep(S.flow)?.id || null : null);
  const localP = () => (S.wing ? S.wing.local(game.player.pos) : { x: 0, y: 0, z: 0 });

  function note(ev, data) {
    const fl = S.flow;
    if (!fl || fl.s !== 'run') return null;
    const r = K.note(fl, ev, data);
    if (r.done.length) onDone(r);
    return r;
  }
  function onDone(r) {
    for (const id of r.done) {
      sfx('ui_confirm', 0.35);
      try {
        if (id === 'sprint') game.guide?.tutEvent?.('move', { d: 99, sprint: true, crouch: true });
        if (id === 'flash') game.guide?.tutEvent?.('flash');
        if (id === 'loot') game.guide?.tutEvent?.('scrap');
      } catch { /* guide optional */ }
    }
    save();
    if (r.finished) { finish(); return; }
    const s = r.step;
    if (s && STEP_SAY[s] && !S.said.has(s)) { S.said.add(s); game.later ? game.later(() => { if (!disposed && flowActive()) say(STEP_SAY[s]); }, 900) : say(STEP_SAY[s]); }
    if (s === 'locker' && !S.mugId) spawnMug();
  }
  function finish() {
    const xp = 50;
    try { game.progress?.addXp?.(xp, 'Hiring Day'); } catch { /* optional */ }
    toast(xf('done_toast', { xp }), 'good');
    sfx('ui_quota_met', 0.5);
    save();
    hidePa();
  }

  // ---- decide + begin ----------------------------------------------------------------------------------------------------
  function markSkip(why) {
    const fl = K.newFlow();
    K.skipFlow(fl, why);
    game.profile.onboard = fl;
    save();
  }
  function decide() {
    S.decided = true;
    const q = qsp();
    const forced = ['1', 'wing', 'stream'].includes(q.get('hiringday')) && !!game.isHost;
    const ctx = {
      profile: game.profile, settings: game.settings, isHost: !!game.isHost, hasRunData: !!game.opts?.runData, phase: game.run?.phase, quotaIndex: game.run?.quotaIndex, day: game.run?.day,
      devAuto: q.has('autohost') || q.has('autojoin'), forced, quick: !!game.run?.quick,
    };
    const r = K.shouldRun(ctx);
    if (r.mark === 'skip') markSkip(r.why);
    if (r.run) begin();
  }
  function begin(mode) {
    if (S.wing || S.stream || disposed) return;
    const fl = K.newFlow();
    fl.startedAt = Date.now();
    game.profile.onboard = fl;
    S.flow = fl;
    save();
    style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    const ui = document.getElementById('ui') || document.body;
    paEl = document.createElement('div'); paEl.className = 'ob-pa'; paEl.innerHTML = '<div class="h"><b></b></div><div class="t"></div>'; ui.appendChild(paEl);
    skipEl = document.createElement('div'); skipEl.className = 'ob-skip'; ui.appendChild(skipEl);
    S.crewSeen = game.remotes?.size || 0;
    // wave 8: the default opening is the LIVE stream moment; the long orientation wing stays for ?hiringday=wing / settings.hiringWing
    const wantWing = mode === 'wing' || (mode !== 'stream' && (qsp().get('hiringday') === 'wing' || !!game.settings?.hiringWing));
    if (!wantWing) { beginStream(); return; }
    S.wing = buildWing(game);
    const sp = S.wing.spawn();
    game.player.teleport(sp.pos, sp.yaw); game.player.pitch = 0;
    game.engine.fx.fade = 1; game.engine.fadeTarget = 1;
    S.wingT = 0; S.tl = [];
    const at = (t0, fn) => S.tl.push({ at: t0, fn });
    at(0.7, () => { game.engine.fadeTarget = 0; });
    at(3.3, () => { game.engine.fadeTarget = 1; });
    at(3.55, () => { game.engine.fadeTarget = 0; });
    at(2.6, () => pa('pa1'));
    at(8.6, () => pa('pa2'));
    at(14.6, () => pa('pa3'));
    at(16.5, () => say('alg1'));
    at(22.5, () => say('alg2'));
    at(25.5, () => { hidePa(); sfx('door_open', 0.8); S.wing.doors.cell.set(true); note('announced'); });
    at(1.2, () => { try { game.ui?.hud?.bigText?.(x('sign.crt1'), x('sign.cell')); } catch { /* optional */ } });
    S.crewSeen = game.remotes?.size || 0;
  }
  // ---- the stream opening (wave 8) ---------------------------------------------------------------------------------------
  function beginStream() {
    const ui = document.getElementById('ui') || document.body;
    const names = [game.profile?.name, ...[...(game.remotes?.values?.() || [])].map((r) => r.name)].filter(Boolean).join(', ') || 'Employee';
    let h = 7; for (const ch of String(names)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const st = S.stream = { t: 0, tl: [], v: 0, vT: 900 + (h % 700), vShown: -1, cut: false, el: document.createElement('div') };
    const el = st.el;
    el.className = 'ob-st';
    el.innerHTML = '<div class="fr"></div><div class="lv"><span class="live"></span><span class="vw"></span></div><div class="ti"></div><div class="ch"></div><div class="lt"><div class="h"><b></b></div><div class="t"></div></div><div class="sk"></div>';
    el.querySelector('.live').textContent = '\u25CF ' + x('st.live');
    el.querySelector('.ti').textContent = x('st.title');
    el.querySelector('.lt .h b').textContent = x('st.host');
    el.querySelector('.sk').textContent = x('st.skip');
    ui.appendChild(el);
    try { game.spawnInShip?.(); } catch (e) { warn('spawn', e); }
    game.player.pitch = 0; game.player.frozen = true;
    try {   // [feelfix2] the first frame after the overlay looks at the terminal (the objective), never at a tarped fixture
      const tp = game.ship?.points?.terminal, pp = game.player.pos;
      // [qa3] the terminal stands in the cockpit, behind the bulkhead (x -4.0, hatch at z 0): from the hub aim at the hatch, not at the wall / trophy wall
      const BULK = -4.0;
      if (tp) game.player.yaw = (pp.x > BULK + 0.2 && tp.x < BULK - 0.2) ? Math.atan2(-(BULK - pp.x), -(0 - pp.z)) : Math.atan2(-(tp.x - pp.x), -(tp.z - pp.z));
    } catch (e) { warn('face', e); }
    game.engine.fx.fade = 1; game.engine.fadeTarget = 1;
    const at = (t0, fn) => st.tl.push({ at: t0, fn });
    const cap = (id, vars) => { el.querySelector('.lt .t').textContent = xf(id, vars); sfx('ui_notify', 0.3); };
    const chat = (who, id, pin) => {
      const box = el.querySelector('.ch'), d = document.createElement('div');
      if (typeof box?.appendChild !== 'function') return;
      if (pin) d.className = 'pin';
      const b = document.createElement('b'), sp = document.createElement('span'); b.textContent = who; sp.textContent = x(id); d.appendChild(b); d.appendChild(sp);
      box.appendChild(d);
      while ((box.children?.length | 0) > 6) box.firstChild.remove();
    };
    at(0.3, () => { game.engine.fadeTarget = 0; el.classList.add('on'); sfx('onair_sting', 0.6); });
    at(0.8, () => cap('st.l1'));
    at(1.4, () => chat(CHATTERS[0], 'st.c1'));
    at(2.4, () => chat(CHATTERS[1], 'st.c2'));
    at(3.2, () => { S.pinned = true; chat(x('st.mod'), 'st.pin', true); });   // [algoctx] the controls are on screen now: the guide skips its WASD line
    at(4.4, () => cap('st.l2', { names }));
    at(5.0, () => chat(CHATTERS[2], 'st.c3'));
    at(6.4, () => chat(CHATTERS[3], 'st.c4'));
    at(7.4, () => chat(CHATTERS[4], 'st.c5'));
    at(8.2, () => cap('st.l3'));
    at(9.2, () => chat(CHATTERS[5], 'st.c6'));
    at(STREAM_LEN - 0.7, () => el.classList.remove('on'));
    at(STREAM_LEN, () => endStream());
    st.tl.sort((a, b) => a.at - b.at);
  }
  function streamTick(dt) {
    const st = S.stream;
    st.t += dt;
    while (S.stream === st && st.tl.length && st.tl[0].at <= st.t) st.tl.shift().fn();
    if (S.stream !== st) return;
    st.v += (st.vT - st.v) * Math.min(1, dt * 0.5) + dt * 6;   // the viewer count climbs fast, then keeps creeping
    const n = Math.round(st.v);
    if (n !== st.vShown) { st.vShown = n; const vw = st.el.querySelector('.vw'); if (vw) vw.textContent = xf('st.viewers', { n: fmtLive(n) }); }
    if (!st.cut && st.t > 1.5 && (game.input?.codeDown?.('Space') || game.input?.codeDown?.('Enter'))) {   // cut to the ship
      st.cut = true;
      st.tl = [{ at: st.t + 0.05, fn: () => st.el.classList.remove('on') }, { at: st.t + 0.5, fn: () => endStream() }];
    }
  }
  /** the overlay goes; quiet = no flow facts (skip / force / dispose) */
  function endStream(quiet = false) {
    const st = S.stream;
    if (!st) return;
    S.stream = null;
    try { if (st.t > 3) game.algo1?.seedViewers?.(Math.round(st.v)); } catch { /* algo1 optional */ }   // [algoctx] ONE viewer count: the overlay's number carries on in the LIVE tag
    st.el?.remove();
    try { game.player.frozen = false; game.engine.fadeTarget = 0; } catch { /* engine gone */ }
    if (quiet || !flowActive()) return;
    K.forceTo(S.flow, 'hangar');
    note('boarded');   // -> step 'terminal' (+ its line)
    S.histStart = game.terminal?.history?.length || 0;
    save();
  }
  function pa(id) {
    if (!paEl) return;
    paEl.querySelector('.h b').textContent = x('pa_h');
    paEl.querySelector('.t').textContent = x(id);
    paEl.classList.add('on');
    sfx('ui_notify', 0.4);
    S.paT = T.t + 5.6;
  }
  function hidePa() { paEl?.classList.remove('on'); S.paT = 0; }

  function spawnMug() {
    if (!game.isHost || !S.wing || !game.items?.hostSpawn) return;
    try { S.mugId = game.items.hostSpawn('mug', S.wing.pts.mug, { value: 12 }); } catch (e) { warn('mug', e); }
  }
  function openLocker() {
    if (!S.wing || S.wing.lockerOpen()) return;
    S.wing.setLocker(true);
    sfx('door_open', 0.7);
    try { game.items.hostSpawn('flashlight', S.wing.pts.lockerDrop, { linvel: [1.5, 1.4, 0.2] }); } catch (e) { warn('flashlight', e); }
    note('locker');
  }
  function pickCabinet() {
    if (game.minigame) return;
    game.openMinigame('lockpick', { tier: 'simple' }, (res) => {
      if (disposed || !flowActive() || S.flow.f.lock) return;
      if (res?.success) {
        note('lock', { tries: (S.flow.f.lockTries | 0) + 1 });
        sfx('door_open', 0.8);
        S.wing?.doors.hangar.set(true);
        say('say.lock_ok');
      } else if (!res?.cancelled) { note('lockTry'); }
    });
  }
  function board() {
    if (S.board || !S.wing) return;
    S.board = { t: 0 };
    game.engine.fadeTarget = 1;
    sfx('door_open', 0.6);
  }
  function toShip() {
    const w = S.wing;
    S.wing = null; S.board = null;
    try { w?.dispose(); } catch (e) { warn('dispose wing', e); }
    S.tl = []; S.blk = null;
    hidePa();
    game.spawnInShip();
    game.player.pitch = 0;
    game.engine.fadeTarget = 0;
    try { game.updateAmbience(); } catch { /* optional */ }
    S.histStart = game.terminal?.history?.length || 0;
  }
  function abortWing(why) {
    if (!S.wing) return;
    K.forceTo(S.flow, why === 'landing' ? 'door' : 'terminal');
    toShip();
    save();
  }
  function skip() {
    if (!flowActive()) return false;
    K.skipFlow(S.flow, 'skipped');
    if (S.wing) toShip();
    endStream(true);
    hidePa();
    toast(x('skipped'), 'info');
    save();
    return true;
  }

  // ---- per frame: the wing -----------------------------------------------------------------------------------------------
  function wingTick(dt) {
    const W = S.wing, fl = S.flow, p = game.player, f = fl.f;
    W.update(dt);
    S.wingT += dt;
    while (S.tl.length && S.tl[0].at <= S.wingT) S.tl.shift().fn();
    if (S.paT && T.t > S.paT) hidePa();
    const l = W.local(p.pos);
    // walking / lateral habit (the Algorithm reads it in its first remark)
    if (S.lastPos) {
      const d = Math.hypot(p.pos.x - S.lastPos.x, p.pos.z - S.lastPos.z);
      if (d > 0.005 && d < 3) note('moved', { d, x: W.inCorridor(p.pos) && l.z < -8 ? l.x : undefined });
    }
    S.lastPos = { x: p.pos.x, z: p.pos.z };
    // crouch under the duct
    if (!f.crouched && p.crouch && l.z < -13.0 && l.z > -15.5 && Math.abs(l.x) < 1.7) note('crouched');
    // sprint shutter
    shutterTick(dt, l, p);
    // flashlight
    if (!f.flash && game.flashlightOn?.()) note('flash');
    // the mug
    if (S.mugId && !f.loot) {
      const it = game.items.get(S.mugId);
      if (it) S.mugSeen = true;
      if ((S.mugSeen && !it) || (it && (p.slots.includes(S.mugId) || it.holder === game.selfId))) note('loot');
    }
    // the gate after the break room opens once flashlight + mug are done
    if (f.flash && f.loot && !W.doors.gate.open) { W.doors.gate.set(true); sfx('door_open', 0.6); }
    blackoutTick(dt, l, p);
    // boarding
    if (S.board) {
      S.board.t += dt;
      if (S.board.t > 0.95) { toShip(); note('boarded'); }
    }
    // crew arrived while the host is in orientation
    const n = game.remotes?.size || 0;
    if (n > S.crewSeen) { toast(x('crew_wait'), 'info'); }
    S.crewSeen = n;
  }
  function shutterTick(dt, l, p) {
    const sh = S.sh, f = S.flow.f, W = S.wing, door = W.doors.shutter;
    if (f.sprinted) return;
    if (sh.t < 0) {
      if (sh.armed && l.z < SHUTTER.trigger && l.z > SHUTTER.trigger - 2.5 && Math.abs(l.x) < 1.7) { sh.t = 0; sh.sprint = false; sh.armed = false; }
      else if (l.z > SHUTTER.trigger + 0.5) sh.armed = true;
      return;
    }
    if (sh.reopenAt) {   // the shutter is closed: wait, then open it again for another try
      if (T.t >= sh.reopenAt) {
        sh.reopenAt = 0; door.set(true); sfx('door_open', 0.5);
        say('say.sprint_retry');
        const between = l.z < SHUTTER.trigger && l.z > SHUTTER.z + 0.8;
        if (between) { sh.t = 0; sh.grace = 0.9; } else { sh.t = -1; sh.armed = false; }   // still in the run-up: go again at once; else cross the line again
      }
      return;
    }
    sh.grace = Math.max(0, (sh.grace || 0) - dt);
    sh.t += dt;
    if (p.sprinting) sh.sprint = true;
    if (l.z < SHUTTER.z - 0.7) { sh.t = -1; note('sprinted'); return; }   // through
    if (sh.t >= 2.2 + (sh.grace || 0) && Math.abs(l.z - SHUTTER.z) > 0.8 && l.z > SHUTTER.z) {
      note('shutterFail');
      sh.fails++;
      if (sh.fails >= K.SPRINT_FAILS_FREE) { say('say.sprint_free'); sh.t = -1; note('sprinted'); return; }
      door.set(false); sfx('door_close', 0.9);
      try { game.engine.shake?.(0.25); } catch { /* optional */ }
      sh.reopenAt = T.t + 1.6;
    }
  }
  function blackoutTick(dt, l, p) {
    const W = S.wing, f = S.flow.f;
    if (f.blackout) return;
    if (!S.blk) {
      if (W.doors.gate.open && l.z < -49.0) { S.blk = { t: 0, ph: 'dark', seen: 0, figT: 0, fl: 0 }; W.setLight(0); sfx('power_down', 0.9); try { game.engine.fx.noise = 0.5; setTimeout(() => { try { game.engine.fx.noise = 0; } catch { /* gone */ } }, 500); } catch { /* optional */ } }
      return;
    }
    const B = S.blk;
    B.t += dt;
    if (B.ph === 'dark') { if (B.t > 1.0) { B.ph = 'fig'; sfx('light_flicker', 0.5); } }
    else if (B.ph === 'fig') {
      B.figT += dt;
      W.showFigure(true, T.t);
      const fp = W.figure.getWorldPosition(new THREE.Vector3()); fp.y += 1.7;
      const eye = p.eyePos(), to = fp.sub(eye), d = to.length();
      if (d < 30 && to.normalize().dot(p.forward()) > 0.88) B.seen += dt;
      if (B.seen > 0.7 || B.figT > 5.5) { B.ph = 'flick'; B.fl = 0; sfx('light_flicker', 0.7); }
    } else if (B.ph === 'flick') {
      B.fl += dt;
      W.setLight(Math.sin(B.fl * 44) > 0 ? 0.75 : 0.1);
      if (B.fl > 0.3) W.showFigure(false);
      if (B.fl > 0.8) {
        W.setLight(1); sfx('power_up', 0.8); S.blk = null;
        say('say.blackout');
        note('blackout');
      }
    }
  }

  // ---- per frame: ship / field / return ------------------------------------------------------------------------------------
  function shipTick(dt) {
    const fl = S.flow, f = fl.f, run = game.run, ph = run?.phase, p = game.player;
    const s = step();
    if (s === 'terminal') {
      const on = !!game.terminal?.active;
      if (on) S.termT += dt;
      if (on && (game.terminal.history?.length || 0) > S.histStart) note('terminal');
      else if (S.termWas && !on && S.termT >= 4) note('terminal');
      if (!on && S.termWas) S.termT = 0;
      S.termWas = on;
    }
    if (ph && ph !== 'orbit') { if (!f.terminal) note('terminal'); if (!f.lever) note('lever'); }   // landing started (any peer pulled it)
    if (ph === 'moon' && f.lever && !S.landSaid) { S.landSaid = true; say('say.land', { n: K.GOAL }); }
    if (ph === 'moon' && !f.door && game.ship?.door?.open) note('door');
    if (ph === 'moon' && p.indoor) S.entered = true;
    else if (ph !== 'moon') S.entered = false;
    S.camNear = false;
    if (ph === 'moon' && p.indoor && !f.camPass) {   // the tutorial camera is within 22 m and still works (objective + hint)
      try { const c = game.feedcams?.plan?.().find((q) => q.tut); if (c && Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 22 && Math.abs(p.pos.y - (c.y - 2)) < 6 && (game.run?.fc?.c?.[c.i]?.[0] | 0) === 0) S.camNear = true; } catch { /* feedcams optional */ }
    }
    if (ph === 'moon' && S.landSaid) {
      // collected value (host: exact, clients: the ship's items)
      const n = game.hostData?.dayStats?.collected ?? game.objectives?.clientCollected?.() ?? 0;
      if (n > (f.collected | 0)) note('collected', { n });
      if (!S.goalSaid && (f.collected | 0) >= K.GOAL) { S.goalSaid = true; say('say.goal'); toast(x('obj.field_done'), 'good'); }
    }
    const dead = !!p.dead;
    if (dead && !S.deadWas) note('death');
    S.deadWas = dead;
    // first return: back in orbit after the landing
    if (ph === 'orbit' && f.lever && !f.returned && S.landSaid) { if (!f.door) note('door'); note('returned'); S.retAt = T.t; }
    if (f.returned && !f.summary) {
      const since = T.t - S.retAt;
      if ((since > 4 && !game.ui?.panelOpen && !game.terminal?.active) || since > 35) {
        const rm = K.remarkFor(f);
        note('summary');
        game.later ? game.later(() => say('rem.' + rm.id, rm.vars), 1200) : say('rem.' + rm.id, rm.vars);
      }
    }
  }
  function flowTick(dt) {
    if (!S.decided) { if (game.run && game.net && game.player && game.isHost !== undefined) decide(); return; }
    if (!flowActive()) return;
    const p = game.player;
    if (!p || !game.run) return;
    // hold Backspace to skip (any stage)
    const holding = !!game.input?.codeDown?.('Backspace') && !game.terminal?.active && !game.minigame;
    S.skipT = holding ? S.skipT + dt : Math.max(0, S.skipT - dt * 2);
    if (skipEl) { skipEl.style.display = S.skipT > 0.1 ? 'block' : 'none'; if (S.skipT > 0.1) skipEl.textContent = xf('skip_prog', { n: Math.min(100, Math.round((S.skipT / SKIP_HOLD) * 100)) }); }
    if (S.skipT >= SKIP_HOLD) { S.skipT = 0; skip(); return; }
    if (S.stream) { streamTick(dt); return; }
    if (S.wing && stage() === 'wing') wingTick(dt);
    else if (!S.wing && flowActive()) shipTick(dt);
  }

  // ---- hooks ---------------------------------------------------------------------------------------------------------------
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    T.t += dt;
    try { tickUnlocks(dt); frTick(); } catch (e) { warn('unlocks', e); }
    try { flowTick(dt); } catch (e) { warn('flow', e); }
  }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g !== game || disposed || !flowActive()) return;
    if (S.wing && ph !== 'orbit') abortWing(ph);
    if (S.stream && ph !== 'orbit') { endStream(true); K.forceTo(S.flow, ph === 'landing' ? 'door' : 'terminal'); save(); }   // the crew launched during the stream   // someone landed the ship while the host was still in orientation
  }));
  offs.push(mods.on('interactables', (list, g) => {
    if (g !== game || disposed || !S.wing || !flowActive()) return;
    const W = S.wing, f = S.flow.f;
    if (f.locker || W.lockerOpen()) list.push({ pos: W.pts.locker, r: 1.0, reach: 3, label: x('p.locker_open'), action: () => sfx('ui_click', 0.3) });
    else list.push({ pos: W.pts.locker, r: 1.0, reach: 3, label: x('p.locker'), action: openLocker });
    if (f.lock) list.push({ pos: W.pts.cabinet, r: 1.0, reach: 3, label: x('p.cabinet_open'), action: () => sfx('ui_click', 0.3) });
    else if (f.blackout) list.push({ pos: W.pts.cabinet, r: 1.0, reach: 3, label: x('p.cabinet'), action: pickCabinet });
    else list.push({ pos: W.pts.cabinet, r: 1.0, reach: 3, label: x('p.cabinet_wait'), action: () => sfx('door_locked', 0.7) });
    if (W.doors.hangar.open) list.push({ pos: W.pts.board, r: 1.7, reach: 4.6, label: x('p.board'), action: board });
  }));
  // the objective tracker: in the wing it shows ONLY our lines (the orbit lines about the lever would be nonsense there)
  function myLines() {
    const out = [];
    const fl = S.flow;
    if (!fl || fl.s !== 'run') return out;
    const s = K.currentStep(fl), f = fl.f;
    if (!s) return out;
    const add = (text, kind = 'main', done = false, progress = null) => out.push({ text, kind, done, progress });
    if (s.id === 'field') {
      const n = f.collected | 0, ex = game.world?.outdoor?.mainExit?.pos, p = game.player;
      if (n < K.GOAL && !S.entered && ex && p && !p.indoor && !p.inShip && game.run?.phase === 'moon') add(xf('obj.field_in', { d: Math.round(Math.hypot(ex.x - p.pos.x, ex.z - p.pos.z)), b: K.GOAL }), 'main');   // wave 8: ONE goal at a time - the door first
      else if (n < K.GOAL && S.camNear && !f.camPass) add(x('obj.field_cam'), 'main');   // ... then the first camera (feedcams tutorial camera)
      else {
        add(xf('obj.field', { a: n, b: K.GOAL }), 'main', n >= K.GOAL, Math.min(1, n / K.GOAL));
        if (n >= K.GOAL) add(x('obj.field_done'), 'sub');
      }
    } else add(x(S.stream ? 'obj.stream' : 'obj.' + s.id), 'main', false, s.id === 'walk' && !S.stream ? Math.min(1, (f.dist || 0) / K.WALK_DIST) : null);
    if (s.id === 'blackout' && S.blk) add(x('say.flash'), 'hint');
    add(x('skip_hint'), 'hint');
    return out;
  }
  if (game.objectives?.compute) restores.push(wrapMethod(game.objectives, 'compute', (orig) => function (...a) {
    if (!disposed && S.wing && flowActive()) return myLines();
    return orig.apply(this, a);
  }));
  offs.push(mods.on('objectives', (add, g) => {
    if (g && g !== game) return;
    if (disposed) return;
    if (!S.wing && flowActive()) for (const l of myLines()) { const o = add(l.text, l.kind, l.done, l.progress); if (o && typeof o === 'object' && l.kind === 'main') o.first = true; }   // first = the one goal the budget keeps
    else if (S.giftHint && T.t < S.giftHint.until && !flowActive()) add(xf('gift_hint', { name: TEXT['u.' + S.giftHint.id]?.[0] || S.giftHint.id }), 'hint');
  }));
  // co-op: the crew can not launch the ship while the new hire is still in orientation
  restores.push(wrapMethod(game, 'hostLever', (orig) => function (from) {
    if (!disposed && flowActive() && from !== game.selfId && ['wing', 'ship'].includes(stage()) && !S.flow.f.lever && (S.wing || S.stream || step() === 'terminal')) {
      try { game.net.sendTo(from, 'sys', sysMsg(TEXT.lever_wait[0], {}, 'info')); } catch { /* net closing */ }
      return undefined;
    }
    return orig.call(this, from);
  }));

  // ============================================================================================ FIRST-RUN MESSAGE BUDGET (wave 8, docs/wave8/firstrun.md)
  // Other modules ask `game.onboard?.fr?.allow('mapmods')`, `.algoOk(pri)`, `.lease('card', s, pri)`, `.only(lines)`. Only a fresh staged profile is ever budgeted.
  function frStage() {
    if (disposed) return 'free';
    const u = game.profile?.unlocks, ob = game.profile?.onboard;
    return FR.stageOf({ mode: u?.mode, q: Math.max(u?.q | 0, prog().q | 0), unlockAll: unlockAll(), quick: !!game.run?.quick, flow: S.flow?.s === 'run' ? 'run' : ob?.s || null, sold: !!ob?.f?.frSold });
  }
  const frLease = { kind: '', until: 0, pri: 0 };
  const frQ = { until: 0 };   // arrival card timeline (all stages): FR.slot
  let frAlgoAt = 0;
  const fr = {
    stage: frStage,
    active: () => frStage() !== 'free',
    allow: (kind) => FR.allow(kind, frStage(), game.run?.day),
    calm: (kind) => !FR.allow(kind, frStage(), game.run?.day),
    /** one Algorithm line per 45 s while budgeted (priority lines always pass); true = show it */
    algoOk(pri = false) { if (frStage() === 'free') return game.onegoal?.algoOk?.(pri) ?? true;   // [onegoal] past the budget: the same calm pacing for every profile
      if (!pri && game.onegoal?.hot?.()) return false;   // [onegoal] quiet during a chase / director peak
      const now = performance.now(); if (!FR.algoOk(frStage(), now, frAlgoAt, pri)) return false; frAlgoAt = now; return true; },
    /** one card / caption on screen at a time while budgeted; true = you may show yours */
    lease(kind, secs, pri = 1) { return frStage() === 'free' ? (game.onegoal?.lease?.(kind, secs, pri) ?? true) : FR.lease(frLease, kind, performance.now(), secs, pri); },   // [onegoal] one card at a time for veterans too
    /** arrival cards queue instead of stacking: returns ms to wait before showing a card of `secs` (0 = now), and reserves that time. Every stage. */
    slot: (secs) => FR.slot(frQ, performance.now(), secs),
    /** ms until the arrival card timeline is free (the Algorithm box waits for it) */
    busy: () => FR.busyMs(frQ, performance.now()),
    /** ONE objective at a time while budgeted (the same list when free) */
    only: (lines) => (frStage() === 'free' ? lines : FR.only(lines)),
    /** after Hiring Day, with scrap aboard and nothing sold yet, the orbit objective becomes "sell it" (the first sale beat) */
    wantSell: (value) => frStage() === 'first' && !flowActive() && (value | 0) > 0 && FR.sellWindow(game.run),   // [econ9] never on day 1: the deadline day pays 100 %
    firstDay: () => FR.firstDay(game.run),
    /** feedcams: the tutorial camera was passed (or you went live on it): the camera objective is done for good */
    camDone() { const f = game.profile?.onboard?.f; if (f && !f.camPass) { f.camPass = true; save(); } },
    camPassed: () => !!game.profile?.onboard?.f?.camPass,
  };
  function frTick() {
    const r = game.run, f = game.profile?.onboard?.f;
    if (r && f && !f.frSold && ((r.sold | 0) > 0 || (r.quotaIndex | 0) > 0)) { f.frSold = true; save(); }   // the first sale (or quota 1) ends the "first" stage
  }

  // ---- guide: while Hiring Day runs the guide's own tutorial lines are held (see guide.js: game.onboard.active()) ------------------------
  const api = {
    /** Hiring Day is running (the guide holds its tutorial lines) */
    active: () => !disposed && flowActive(),
    /** [algoctx] the stream overlay pinned the controls (or Hiring Day taught them): the guide's WASD / sprint / crouch line is redundant */
    controlsPinned: () => !!S.pinned || game.profile?.onboard?.s === 'done',
    stage, step, flow: () => S.flow, fr,
    locked, deny, routeBlocked, lockedText,
    unlocks: () => { const u = U(); return u ? { mode: u.mode, q: u.q, boss: u.boss, given: { ...u.given }, open: K.UNLOCK_IDS.filter((id) => !locked(id)) } : null; },
    skip, begin, decide,
    force: (id) => { if (!flowActive()) return false; const ok = K.forceTo(S.flow, id); if (S.wing && K.stageOf(S.flow) !== 'wing') toShip(); if (S.stream && K.stageOf(S.flow) !== 'wing') endStream(true); return ok; },
    note,
    core: K,
    debug: () => ({
      decided: S.decided, flow: S.flow ? JSON.parse(JSON.stringify(S.flow)) : null, stage: stage(), step: step(), wing: !!S.wing, stream: S.stream ? +S.stream.t.toFixed(1) : null, wingT: +S.wingT.toFixed(1), sh: { ...S.sh }, blk: S.blk ? { ...S.blk } : null,
      stats: S.wing?.stats || null, lines: myLines().map((l) => l.text), lockedNow: K.UNLOCK_IDS.filter((id) => locked(id)),
    }),
    wing: () => S.wing,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of offs) { try { o(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      try { S.wing?.dispose(); } catch { /* ignore */ }
      S.wing = null;
      endStream(true);
      paEl?.remove(); skipEl?.remove(); style?.remove();
      try { game.engine.fadeTarget = 0; } catch { /* engine gone */ }
    },
  };
  return api;
}
