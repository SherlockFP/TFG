// HOMESTEAD "KEFAL YURDU" (wave 8 tycoon, docs/wave8/tycoon.md): a Roblox-style plot tycoon on the homeworld, south of the build square.
// Loop: claim the plot (gold pad) -> buy droppers / belt / recolour gates by standing on glowing pads -> cubes ride the belt into a gold collector, stand on it to cash the pile in
// -> the money builds a lodge (foundation, bunks, hearth, workshop, porch, roof) piece by piece -> Re-Claim (credit sink) for a star + cube skin. Income is a hard-capped trickle
// (capOf per game day, pile = 2 days) so it never competes with runs; rules + numbers live in homestead_core.js.
// Net (prefix 'hs'): hsreq client -> host {op:'buy',id}|{op:'collect'}|{op:'reclaim'}; hsx host -> all 1 Hz on HOME {p,g,c,r,cl,rb}; hsmsg host -> client {k:'built'|'col'|'reclaim'|'err'}.
// State: host profile.homestead = run.hs (synced by broadcastRun(['hs']) on buy / collect / reclaim / leaving HOME). Host-authoritative, no offline catch-up.
import * as THREE from 'three';
import { t, tf, tIn, addTranslations } from '../core/i18n.js';
import { MOONS } from './moons.js';
import { HOST_ONLY } from '../net/session.js';
import { G } from '../physics/physics.js';
import { HOME_Y } from '../world/homeworld_map.js';
import { disposeTextures } from '../world/resto_view.js';
import * as C from './homestead_core.js';
import { createHomesteadView } from '../world/homestead_view.js';
import { TR, RU } from './homestead_i18n.js';
import { createHomesteadPanel } from '../ui/panels/homestead.js';

HOST_ONLY.add('hsx'); HOST_ONLY.add('hsmsg');
const fresh = (map, l) => Object.fromEntries(Object.entries(map).filter(([k]) => tIn(l, k) === k));   // never override another module's entry
addTranslations(fresh(TR, 'tr'), 'tr'); addTranslations(fresh(RU, 'ru'), 'ru');

const CSS = `.hs-hint{position:fixed;left:50%;bottom:118px;transform:translateX(-50%);z-index:30;font:20px var(--font,'VT323',monospace);color:#ffe9c8;background:rgba(10,6,12,.86);border:1px solid #ffd23f;padding:3px 12px;pointer-events:none}`;
const BUY_SFX = ['ui_buy', 'ui_buy_b', 'ui_buy_c'];
const RECLAIM_DWELL = 2.5;   // Re-Claim wipes the line and costs 1.2k+: a much longer hold than a 0.7 s buy pad

export function installHomestead(game) {
  const mods = game.mods, offs = [];
  let disposed = false, boundNet = null, panel = null, hintEl = null, view = null, migHs = false, welcomed = false;
  const host = () => !!game.isHost;
  const me = () => game.selfId;
  const BLANK = C.blank();
  const S = () => { const s = game.run?.hs; return s && Array.isArray(s.b) ? s : BLANK; };
  const st = () => (migHs ? game.run.hs : game.profile.homestead);   // a migrated host adopts the crew's plot from run.hs and never touches its own profile
  const onHome = () => !!(MOONS[game.run?.moon]?.home && !MOONS[game.run?.moon]?.ghost && game.run?.phase === 'moon' && game.world?.outdoor?.home);
  const locked = () => !!game.onboard?.locked?.('homeworld');
  const raidOn = () => !!(game.homeworld?.raid || (game.run?.hwr && !game.run.hwr.done));
  const posOf = (id) => (id === me() ? game.player?.pos : game.remotes?.get(id)?.pos) || null;
  const near = (from, x, z, r) => { const q = posOf(from); return !!q && Math.hypot(q.x - x, q.z - z) <= r; };
  const say = (to, m) => (to ? game.net.sendTo(to, 'hsmsg', m) : game.net.broadcast('hsmsg', m));
  const err = (to, why) => say(to, { k: 'err', why });
  if (typeof document !== 'undefined' && !document.getElementById('tfg-hs-css')) { const s = document.createElement('style'); s.id = 'tfg-hs-css'; s.textContent = CSS; document.head.appendChild(s); }

  // ================================================================================================ HOST
  let lastReq = new Map(), snapT = 0, autoT = 0, saveT = 0, dirty = false, hostWasHome = false;
  const wallet = () => ({ cr: game.run.credits });
  const cloutAll = (n, reason) => { if (n > 0) for (const p of game.aiPlayers?.() || []) game.net.broadcast('xp', { to: p.id, xp: 0, coin: n, reason }); };
  function commit(extra = []) {
    if (!host()) return;
    game.run.hs = st(); dirty = false; saveT = 0;
    try { game.broadcastRun(['hs', ...extra]); game.progress?.save?.(); } catch (e) { console.warn('[hs] commit', e); }
  }
  function attach() {
    const p = game.profile;
    p.homestead = C.sanitize(p.homestead);
    game.run.hs = p.homestead;
    C.advance(p.homestead, game.run.runId || '', game.run.day || 0);   // re-anchor only: a loaded / new run never pays retroactively
  }
  const snapOf = (s) => { const cap = C.capOf(s), prod = cap > 0 && s.g.n < cap - 0.05 && s.pile < C.pileCap(s) - 0.5; return { p: Math.round(s.pile * 100) / 100, g: Math.round(s.g.n * 100) / 100, c: cap, r: prod ? Math.round(cap / C.TY.rampS * 1000) / 1000 : 0, cl: s.cl, rb: s.rb }; };
  function hostTick(dt) {
    const s = st();
    if (!s || !game.run) return;
    const day0 = s.g.day, add = C.tick(s, dt, game.run.runId || '', game.run.day || 0);
    if (add > 0) dirty = true;
    if (s.g.day !== day0) commit();
    saveT += dt; if (dirty && saveT >= 15) { saveT = 0; dirty = false; try { game.progress?.save?.(); } catch { /* ignore */ } }
    const home = onHome() && !locked();
    if (!home) { if (hostWasHome) commit(); hostWasHome = false; return; }
    if (!hostWasHome) { hostWasHome = true; snapT = 0; }
    if (C.has(s, 'auto') && !raidOn()) {
      autoT += dt;
      if (autoT >= C.TY.autoEvery) { autoT = 0; const w = wallet(), r = C.collect(s, w, true); if (r.ok) { game.run.credits = w.cr; commit(['credits']); say(null, { k: 'col', n: r.n, cl: 0, by: 0, a: 1 }); } }
    }
    snapT -= dt;
    if (snapT <= 0) { snapT = 1; game.net.broadcast('hsx', snapOf(s)); }
  }
  function hostReq(d, from) {
    if (!host() || !d || typeof d.op !== 'string') return;
    if (!onHome()) return err(from, 'You must be on the homeworld.');
    if (raidOn()) return err(from, 'Not during a raid.');
    if (locked()) return err(from, 'Locked.');
    const nowT = game.time || 0; if (nowT - (lastReq.get(from) || -1) < 0.08) return; lastReq.set(from, nowT);
    const s = st(); if (!s) return;
    switch (d.op) {
      case 'buy': {
        const p = C.PIECE[String(d.id)]; if (!p) return;
        const pd = C.padOf(p); if (!near(from, pd[0], pd[1], C.USE_R)) return err(from, 'Stand on the glowing pad.');
        const w = wallet(), r = C.tryBuy(s, w, p.id, game.playerName?.(from) || '');
        if (!r.ok) return err(from, r.why);
        game.run.credits = w.cr; commit(['credits']); say(null, { k: 'built', id: p.id, by: from, nm: s.who[p.id] || '' });
        return;
      }
      case 'collect': {
        if (!near(from, C.COLLECTOR.x, C.COLLECTOR.z, C.USE_R)) return err(from, 'Stand on the gold pad.');
        const w = wallet(), r = C.collect(s, w, false);
        if (!r.ok) return err(from, 'Nothing to collect yet.');
        game.run.credits = w.cr; commit(['credits']); cloutAll(r.clout, 'Homestead');
        say(null, { k: 'col', n: r.n, cl: r.clout, by: from });
        return;
      }
      case 'reclaim': {
        if (!near(from, C.RECLAIM_PAD[0], C.RECLAIM_PAD[1], C.USE_R)) return err(from, 'Stand on the glowing pad.');
        const w = wallet(), r = C.reclaim(s, w);
        if (!r.ok) return err(from, r.why);
        game.run.credits = w.cr; commit(['credits']); say(null, { k: 'reclaim', rb: r.rb, by: from });
      }
    }
  }

  // ================================================================================================ CLIENT: view, colliders, pads, messages
  let snapSeen = false, snap = { p: 0, g: 0, c: 0, r: 0, cl: 0, rb: 0 }, streakT = -99, streak = 0, standId = '', stand = 0, reqAt = 0, toldFirst = false, markT = 0;
  const colliders = new Map();
  const dropCols = (id) => { for (const c of colliders.get(id) || []) { try { game.physics.removeCollider(c); } catch { /* gone */ } } colliders.delete(id); };
  function syncColliders(s) {
    for (const id of s.b) if (!colliders.has(id)) { const cols = []; for (const b of C.collidersFor(id)) cols.push(game.physics.addStaticBox(b.x, HOME_Y + b.h / 2, b.z, b.hx, b.h / 2, b.hz, 0, G.STATIC, { kind: 'prop' })); if (cols.length) colliders.set(id, cols); }
    for (const id of [...colliders.keys()]) if (!s.b.includes(id)) dropCols(id);
  }
  function ensureView() {
    if (view) return view;
    view = createHomesteadView(); game.scene.add(view.root); return view;
  }
  function clearView() {
    for (const id of [...colliders.keys()]) dropCols(id);
    if (view) { view.dispose(); view = null; }
    standId = ''; stand = 0;
  }
  const vec = (x, y, z) => new THREE.Vector3(x, HOME_Y + y, z);
  function builtFx(id) {
    const at = view?.burstSpot(id); if (!at) return;
    game.particles?.burst?.(vec(at.x, 0.4, at.z), 'dust'); game.particles?.burst?.(vec(at.x, 1.3, at.z), 'sparks');
    if (id === 'roof') for (const dx of [-6, -2, 2, 6]) { game.particles?.burst?.(vec(at.x + dx, 3.2, at.z), 'sparks'); game.particles?.burst?.(vec(at.x + dx, 1.0, at.z), 'dust'); }
  }
  function buySound(id) {
    const now = performance.now() / 1000; streak = now - streakT < 6 ? Math.min(streak + 1, BUY_SFX.length - 1) : 0; streakT = now;
    game.audio?.play?.(id === 'roof' ? 'ui_levelup' : BUY_SFX[streak], { volume: 0.7, bus: 'ui' });
  }
  const pileNow = () => (host() ? st()?.pile : snapSeen ? snap.p : S().pile) ?? 0;
  const onMsg = (m, from) => {
    if (disposed || !m || (from !== game.net?.hostId && !host())) return;
    switch (m.k) {
      case 'err': if (m.why === 'owned') break; game.ui?.toast(t(m.why), 'bad'); game.audio?.play?.('ui_error', { volume: 0.4, bus: 'ui' }); break;
      case 'built': {
        if (!onHome()) break;
        const p = C.PIECE[m.id]; buySound(m.id);
        if (m.by === me()) game.ui?.toast(`${t(p?.name || m.id)} - ${t('built')}`, 'good');
        else if (m.nm) game.ui?.toast(tf('{name} built {piece}', { name: m.nm, piece: t(p?.name || m.id) }), 'good');
        if (m.id === 'roof') game.ui?.hud?.bigText?.(t('KEFAL HOMESTEAD COMPLETE'), t('The lodge has a roof. Home sweet home.'));
        break;
      }
      case 'col': {
        if (!onHome()) break;
        const at = vec(C.COLLECTOR.x, 1.4, C.COLLECTOR.z);
        game.particles?.burst?.(at, 'sparks');
        if (!m.a) { game.audio?.play?.('coins', { volume: 0.7 }); game.ui?.hud?.floatText?.(at, `${m.n ? `+${m.n} ▮` : ''}${m.cl ? `${m.n ? ' · ' : ''}+${m.cl} ◈` : ''}`, '#ffd23f'); }
        else game.audio?.play?.('coins', { volume: 0.2 });
        if (m.by === me() && m.cl) game.ui?.toast(tf('+{n} followers for the crew', { n: m.cl }), 'good');
        break;
      }
      case 'reclaim': {
        game.ui?.hud?.bigText?.(tf('RE-CLAIMED {n}', { n: '★'.repeat(m.rb) }), t('The line starts over. The belt runs faster and the cubes shine.'));
        game.audio?.play?.('ui_levelup', { volume: 0.6, bus: 'ui' }); break;
      }
    }
  };
  const onSnap = (d, from) => {
    if (disposed || !d || (from !== game.net?.hostId && !host())) return;
    const n = (v) => (Number.isFinite(+v) ? +v : 0);
    snap = { p: n(d.p), g: n(d.g), c: n(d.c), r: n(d.r), cl: d.cl ? 1 : 0, rb: n(d.rb) | 0 }; snapSeen = true;
  };
  function bindNet(net) { if (!net || boundNet === net) return; boundNet?.off?.('msg:hsmsg', onMsg); boundNet?.off?.('msg:hsx', onSnap); boundNet = net; net.on('msg:hsmsg', onMsg); net.on('msg:hsx', onSnap); }

  const req = (op, d = {}) => game.net.request('hsreq', { op, ...d });
  function setHint(text) {
    if (!text) { hintEl?.remove(); hintEl = null; return; }
    if (!hintEl) { hintEl = document.createElement('div'); hintEl.className = 'hs-hint'; document.body.appendChild(hintEl); }
    hintEl.textContent = text;
  }
  function padUpdate(dt) {
    const pp = game.player?.pos; let on = null;
    if (pp && !game.ui?.panelOpen && !game.player.dead && Math.abs(pp.y - HOME_Y) < 2.2) on = view.padAt(pp.x, pp.z);
    const time = performance.now() / 1000;
    if (!on) { standId = ''; stand = 0; return null; }
    if (standId !== on.id) { standId = on.id; stand = 0; }
    const rc = on.id === 'reclaim'; stand += dt; on.grp.userData.ring?.scale.setScalar(1 + Math.sin(stand * (rc ? 20 + stand * 12 : 20)) * (rc ? 0.06 + Math.min(0.1, stand * 0.04) : 0.06));
    if (on.id === 'collect') { const can = snap.p >= 1 || (snap.cl && snap.g >= 0.01); if (can && stand >= 0.7 && time - reqAt > 1.5) { reqAt = time; req('collect'); } return can ? 'collect' : null; }
    if (!on.afford) { if (time - reqAt > 2.5) { reqAt = time; game.ui?.toast(t('Not enough credits.'), 'bad'); } return null; }
    if (stand >= (rc ? RECLAIM_DWELL : 0.7) && time - reqAt > 1.6) { reqAt = time; if (rc) req('reclaim'); else req('buy', { id: on.id }); }
    return rc ? 'reclaim' : 'build';
  }
  function interactables(list) {
    const s = S(); if (!C.has(s, 'claim')) return;
    list.push({ pos: vec(C.BOOTH.x, 1.4, C.BOOTH.z + 1.3), r: 1.6, reach: 4, label: t('Kefal Homestead [E]'), sub: `▮${Math.floor(pileNow())} / ${Math.floor(C.pileCap(s))}`, action: () => openPanel() });
  }
  function markProgress(s) {   // co-op crew members keep a tiny monotone mark of the shared plot so their own achievements (hs_*) can see it
    const p = game.profile; if (!p || host()) return;
    const keep = ['claim', 'gate1', 'gate2', 'gate3', 'roof'].filter((id) => s.b.includes(id)), old = p.hsMark || { b: [], rb: 0 };
    const b = [...new Set([...old.b, ...keep])], rb = Math.max(old.rb | 0, s.rb | 0);
    if (b.length !== old.b.length || rb !== (old.rb | 0)) p.hsMark = { b, rb };
  }
  function openPanel() {
    if (game.onboard?.deny?.('homeworld')) return;   // [hubgate] unlocks at quota 3
    if (!onHome() || disposed) return;
    closePanel();
    const ctl = createHomesteadPanel(game.ui, game, api);
    game.ui.openPanel(ctl.el); panel = ctl;
    game.ui.onPanelClose = () => { ctl.dispose(); if (panel === ctl) panel = null; return false; };
  }
  const closePanel = () => { if (panel) game.ui.closePanel(); };

  // ------------------------------------------------------------------------------------------ wiring
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  offs.push(mods.on('registerHandlers', (Hh, g) => { if (g === game) Hh('hsreq', (d, from) => { try { hostReq(d, from); } catch (e) { console.error('hsreq', e); err(from, 'Error.'); } }); }));
  offs.push(mods.on('hostStart', (g) => { if (!g || g === game) attach(); }));
  offs.push(mods.on('hostMigrated', (g, info) => {
    if (g !== game || !info?.self || !game.run?.hs) return;
    migHs = true; game.run.hs = C.sanitize(game.run.hs);   // adopt the synced plot; commit() keeps broadcasting it without touching the new host's profile
  }));
  offs.push(mods.on('phase', (ph, g) => { if (g !== game || disposed) return; if (ph !== 'moon' && ph !== 'landing') { closePanel(); clearView(); snapSeen = false; snap = { p: 0, g: 0, c: 0, r: 0, cl: 0, rb: 0 }; } }));
  offs.push(mods.on('mapLoaded', (w, g) => {
    if (g !== game) return;
    clearView(); welcomed = false;
    if (host() && game.run?.hs && MOONS[game.run.moon]?.home) commit();   // the crew lands: everyone gets the current pile (rewardviz reads it for the arrival toast)
  }));
  offs.push(mods.on('interactables', (list, g) => { if (g !== game || disposed || !onHome() || locked()) return; try { interactables(list); } catch (e) { console.warn('[hs] interactables', e); } }));
  let errs = 0;
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    try {
      if (host() && game.run && !game.run.hs) attach();
      if (host() && game.run?.hs) hostTick(dt);
      if (!onHome() || locked()) { if (view) clearView(); setHint(null); return; }
      const s = S(); if (host()) snap = snapOf(st() || s);
      const v = ensureView(); syncColliders(s);
      for (const id of v.sync(s)) builtFx(id);
      v.setSnap(snap);
      const time = performance.now() / 1000;
      v.update(dt, time, { pp: game.player?.pos, cr: game.run?.credits || 0 });
      const act = padUpdate(dt);
      setHint(act === 'build' ? t('Stand on the pad to build...') : act === 'reclaim' ? t('Hold to Re-Claim: the line resets') : act === 'collect' ? t('Collecting...') : null);
      if (!welcomed) { welcomed = true; if (!C.has(s, 'claim') && !toldFirst) { toldFirst = true; game.ui?.toast(t('A gold pad is blinking in the south. Follow the arrows.'), 'good'); } }
      markT -= dt; if (markT <= 0) { markT = 2; markProgress(s); panel?.refresh?.(); }
    } catch (e) { if (++errs <= 3) console.warn('[hs] update', e); }
  }));
  const api = {
    state: S, core: C, req, open: openPanel, close: closePanel, pileNow, get snap() { return snap; }, get view() { return view; },
    dispose() {
      if (disposed) return; disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      boundNet?.off?.('msg:hsmsg', onMsg); boundNet?.off?.('msg:hsx', onSnap);
      closePanel(); clearView(); setHint(null); disposeTextures();
    },
  };
  return api;
}
