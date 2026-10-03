// HOST MIGRATION - module 'hostmig' (docs/wave4/hostmig.md). When the host quits or crashes the crew keeps playing: every remaining peer
// elects the same successor (lowest join rank that is still alive), the successor turns isHost=true, rebuilds the host-side state from what
// every client already replicates (run state, items, creature views, remote players) plus a small 'hmx' snapshot the host broadcasts, and the
// others re-point hostId. A dialog asks "Host disconnected. Continue with <name> as host? [Continue] [Leave]".
// Net (all 'hm*'): 'hmx' host -> crew snapshot {e epoch, o join order, ds dayStats, ...}; 'hmclaim' successor -> crew {e, r, o}.
// Mods event: 'hostMigrated' (game, info{ oldHostId, newHostId, epoch, self, degraded }) - see the doc for modules that lose state.
import { t, tf, addTranslations } from '../core/i18n.js';
import { HM, candidates, cmpRank, nextOrder, creatureOptsFromView, buildX, hostDataFrom } from './hostmig_core.js';

addTranslations({
  'HOST LEFT': 'HOST AYRILDI',
  'Host disconnected. Continue with {name} as host?': 'Host bağlantısı koptu. {name} host olarak devam edilsin mi?',
  'Progress is kept (run, items, creatures). Some ship systems may reset.': 'İlerleme korunur (oyun, eşyalar, yaratıklar). Bazı gemi sistemleri sıfırlanabilir.',
  'Continue (new host)': 'Devam et (yeni host)',
  'Leave to menu': 'Menüye dön',
  'you': 'sen',
  'You take over as host in {n} s.': '{n} sn içinde host olarak devralıyorsun.',
  'Waiting for {name} to take over as host...': '{name} hostluğu devralana kadar bekleniyor...',
  '{name} is the new host.': 'Yeni host: {name}.',
  'You are the new host. The crew continues.': 'Yeni host sensin. Ekip devam ediyor.',
  'The crew continued without you (a new host was elected). Rejoin with the lobby code.': 'Ekip sensiz devam etti (yeni bir host seçildi). Lobi koduyla yeniden katıl.',
  'Host migration: some systems were reset ({list}).': 'Host devri: bazı sistemler sıfırlandı ({list}).',
}, 'tr');
addTranslations({
  'HOST LEFT': 'ХОСТ ВЫШЕЛ',
  'Host disconnected. Continue with {name} as host?': 'Хост отключился. Продолжить с {name} в роли хоста?',
  'Progress is kept (run, items, creatures). Some ship systems may reset.': 'Прогресс сохранён (забег, предметы, существа). Некоторые системы корабля могут сброситься.',
  'Continue (new host)': 'Продолжить (новый хост)',
  'Leave to menu': 'В меню',
  'you': 'вы',
  'You take over as host in {n} s.': 'Вы станете хостом через {n} с.',
  'Waiting for {name} to take over as host...': 'Ожидание, пока {name} станет хостом...',
  '{name} is the new host.': 'Новый хост: {name}.',
  'You are the new host. The crew continues.': 'Теперь хост - вы. Экипаж продолжает.',
  'The crew continued without you (a new host was elected). Rejoin with the lobby code.': 'Экипаж продолжил без вас (выбран новый хост). Войдите снова по коду лобби.',
  'Host migration: some systems were reset ({list}).': 'Смена хоста: некоторые системы сброшены ({list}).',
}, 'ru');

export function installHostMig(game) {
  const offs = [];
  const timers = new Set();
  const hostTimers = new Set();     // timers this module started while hosting (cleared on demotion)
  let disposed = false, net = null, dlg = null;
  // S.phase: 'idle' | 'lost' (host link down, dialog not yet shown) | 'prompt' (dialog open) | 'waiting' (Continue pressed, successor is someone else)
  const S = { phase: 'idle', order: [], x: null, skip: new Set(), oldHost: null, accepted: false, promptAt: 0, waitAt: 0, hostRank: null, pending: null, succ: null, why: '' };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const enabled = () => game.config?.hostMig !== false;
  const later = (fn, ms, own) => {
    const id = game.later ? game.later(fn, ms) : setTimeout(fn, ms);
    timers.add(id); if (own) hostTimers.add(id);
    return id;
  };
  const clearT = (id) => { clearTimeout(id); timers.delete(id); hostTimers.delete(id); };
  const nameOf = (id) => (id === game.selfId ? t('you') : (net?.players.get(id)?.name || game.remotes?.get(id)?.name || '?'));
  const ready = () => !disposed && !game.destroyed && !!net && !!game.run && net.connected && !net.isHost && enabled();

  // ------------------------------------------------------------------ crew order / election
  function knownIds() {
    const ids = new Set([...(net.players?.keys() || []), ...(net.transport?.peers || []), ...(S.order || [])]);
    ids.delete(undefined); ids.delete(null);
    return ids;
  }
  const alive = (id) => id === net.selfId || (!!net.transport?.peers?.has(id) && !net.lost.has(id));
  function cands() {
    const ids = [...knownIds()].filter((id) => id === net.selfId || net.players.has(id));   // must have said hello (we know who they are)
    return candidates({ order: S.order, ids, self: net.selfId, oldHost: S.oldHost ?? net.hostId, skip: S.skip, alive });
  }
  const rankOf = (id) => { const order = S.order || []; const i = order.indexOf(id); return i >= 0 ? i : 1e6 + [...knownIds()].sort().indexOf(id); };

  // ------------------------------------------------------------------ host side: crew snapshot broadcast
  function sendX(to) {
    if (!net || !game.isHost || !game.run) return;
    const order = nextOrder(S.order, net.selfId, null, [...net.players.keys()]);
    S.order = order;
    let x = buildX(game.hostData, game.run, game.config, order, net.hostEpoch, game.opts?.lobbyName);
    try { if (JSON.stringify(x).length > HM.MAX_X_BYTES) { delete x.cf; } } catch { /* ignore */ }
    if (to) net.sendTo(to, 'hmx', x); else net.broadcast('hmx', x, false);
  }
  function xLoop() {
    if (disposed) return;
    try { if (net && game.isHost) sendX(); } catch (e) { console.warn('[hostmig] hmx', e); }
    later(xLoop, HM.XCAST_MS);
  }
  function onX(d, from) {
    if (!d || typeof d !== 'object' || from !== net.hostId || net.isHost) return;
    if (Array.isArray(d.o)) S.order = d.o.filter((x) => typeof x === 'string').slice(0, 64);
    S.x = d;
    if (Number.isFinite(d.e) && d.e > net.hostEpoch) net.hostEpoch = d.e;   // late joiner after a migration
  }

  // ------------------------------------------------------------------ dialog
  function ui() { return game.ui; }
  function closeDialog(relock) {
    if (!dlg) return;
    try { dlg.el.remove(); } catch { /* ignore */ }
    dlg = null;
    if (relock) { try { ui()?.app?.input?.lock?.(); } catch { /* needs a gesture */ } }
  }
  function renderDialog(model) {
    if (typeof document === 'undefined' || !ui()?.root) return;
    const key = model.key;
    if (dlg && dlg.key === key) { if (dlg.countEl) dlg.countEl.textContent = model.count || ''; return; }
    closeDialog(false);
    const u = ui();
    const box = u.panel('hostmig');
    const cd = document.createElement('div'); cd.className = 'dim'; cd.textContent = model.count || '';
    const body = document.createElement('div'); body.className = 'howto'; body.textContent = model.text;
    const note = document.createElement('div'); note.className = 'dim'; note.style.marginTop = '8px'; note.textContent = t('Progress is kept (run, items, creatures). Some ship systems may reset.');
    const list = document.createElement('div'); list.className = 'menu-list'; list.style.marginTop = '12px';
    let first = null;
    for (const b of model.buttons) { const btn = u.button(b.label, b.fn, b.cls || ''); list.append(btn); first = first || btn; }
    const bodyWrap = document.createElement('div'); bodyWrap.className = 'cp-body';
    bodyWrap.append(body, cd, note, list);
    box.append(u.panelHead(t('HOST LEFT')), bodyWrap);
    const ov = document.createElement('div'); ov.className = 'overlay'; ov.style.zIndex = '60';
    ov.append(box);
    u.root.appendChild(ov);
    dlg = { el: ov, key, countEl: cd };
    try { u.app?.input?.unlock?.(); } catch { /* ignore */ }
    setTimeout(() => { try { first?.focus?.({ preventScroll: true }); } catch { /* ignore */ } }, 50);
  }
  function refreshDialog() {
    if (S.phase !== 'prompt' && S.phase !== 'waiting') { closeDialog(false); return; }
    const succ = S.succ;
    const self = succ === net.selfId;
    const leaveBtn = { label: t('Leave to menu'), fn: () => leaveToMenu(), cls: 'danger' };
    if (S.phase === 'waiting') { renderDialog({ key: 'w:' + succ, text: tf('Waiting for {name} to take over as host...', { name: nameOf(succ) }), buttons: [leaveBtn] }); return; }
    const left = Math.max(0, Math.ceil((HM.AUTO_CLAIM_MS - (now() - S.promptAt)) / 1000));
    renderDialog({
      key: 'p:' + succ, text: tf('Host disconnected. Continue with {name} as host?', { name: nameOf(succ) }),
      count: self ? tf('You take over as host in {n} s.', { n: left }) : '',
      buttons: [{ label: t('Continue (new host)'), fn: () => accept(), cls: 'primary' }, leaveBtn],
    });
  }
  function leaveToMenu() {
    S.phase = 'closed';
    closeDialog(false);
    const app = ui()?.app;
    if (app?.leaveGame) app.leaveGame(); else game.emit('fatal', t('The host has left. Session ended.'));
  }

  // ------------------------------------------------------------------ detection (client side)
  function beginLost() {
    if (!ready() || S.phase !== 'idle') return;
    S.phase = 'lost'; S.oldHost = net.hostId; S.skip.clear(); S.accepted = false;
    S.promptTimer = later(() => { if (S.phase === 'lost') openPrompt('lost'); }, HM.PROMPT_DELAY_MS);
  }
  function openPrompt(why) {
    if (disposed || !net || net.isHost) return;
    if (S.phase === 'idle') { S.oldHost = net.hostId; S.skip.clear(); S.accepted = false; }
    clearT(S.promptTimer);
    S.phase = 'prompt'; S.why = why || ''; S.promptAt = now(); S.waitFor = null;
    pulse();
    pollLoop();
  }
  // called by Game on net 'hostLeft' (bye, or the 45 s grace ran out). true = handled, do not end the session.
  function onHostLeft(why) {
    if (S.phase === 'closed') return true;
    if (S.phase === 'idle' && !ready()) return false;
    if (S.phase === 'idle' || S.phase === 'lost') openPrompt(why);
    return true;
  }
  function cancelLost(why) {   // the old host came back inside the grace window: nothing to migrate
    if (S.phase === 'idle') return;
    S.phase = 'idle'; S.oldHost = null; S.accepted = false; S.pending = null;
    clearT(S.promptTimer); clearT(S.pollTimer);
    closeDialog(false);
  }
  function pollLoop() {
    clearT(S.pollTimer);
    if (disposed || (S.phase !== 'prompt' && S.phase !== 'waiting')) return;
    S.pollTimer = later(pollLoop, 500);
    try { pulse(); } catch (e) { console.warn('[hostmig] pulse', e); }
  }
  // one decision step (runs every 500 ms and after every event)
  function pulse() {
    if (disposed || !net || net.isHost) return;
    if (S.phase !== 'prompt' && S.phase !== 'waiting') return;
    const list = cands();
    S.succ = list[0] ?? net.selfId;
    // a claim that raced ahead of our own detection
    if (S.pending && now() - S.pending.at < HM.PENDING_MS) { const p = S.pending; S.pending = null; if (acceptClaim(p.from, p.d)) return; }
    const self = S.succ === net.selfId;
    if (self) {
      if (S.accepted || now() - S.promptAt >= HM.AUTO_CLAIM_MS) { becomeHost(); return; }
    } else {
      if (S.waitFor !== S.succ) { S.waitFor = S.succ; S.waitAt = now(); }
      // the successor gets AUTO_CLAIM_MS to take over by itself plus CLAIM_WAIT_MS of slack, then the next candidate is elected
      if (now() - S.waitAt > HM.AUTO_CLAIM_MS + HM.CLAIM_WAIT_MS) { S.skip.add(S.succ); S.waitFor = null; S.promptAt = now() - HM.AUTO_CLAIM_MS; return pulse(); }
      if (S.accepted) S.phase = 'waiting';
    }
    refreshDialog();
  }
  function accept() {
    if (S.phase !== 'prompt' && S.phase !== 'waiting') return;
    S.accepted = true;
    pulse();
  }

  // ------------------------------------------------------------------ becoming the host
  function rebuildCreatures(degraded) {
    const M = game.creatures;
    if (!M?.views) return 0;
    let maxN = 0;
    for (const id of M.views.keys()) { const m = /^c(\d+)$/.exec(id); if (m) maxN = Math.max(maxN, +m[1]); }
    M.nextId = Math.max(M.nextId || 1, maxN + 1) + 25;
    M.host.clear();
    let n = 0, lost = 0;
    for (const v of [...M.views.values()]) {
      try {
        if (v.state === 'dead' || (v.maxHp && v.hp <= 0)) { const id = v.id; later(() => { if (M.views.has(id) && !M.host.has(id)) M.hostRemove(id); }, 8000, true); continue; }
        if (!v.def || !v.type) continue;
        const c = M.hostSpawn(v.type, (v.target || v.pos).clone(), creatureOptsFromView(v));
        if (!c) { lost++; continue; }
        if (typeof v.hp === 'number') c.hp = v.hp;
        if (v.maxHp) c.maxHp = v.maxHp;
        n++;
      } catch (e) { lost++; console.warn('[hostmig] creature', v.type, e); }
    }
    if (lost) degraded.push('creatures:' + lost);
    return n;
  }
  function becomeHost() {
    if (net.isHost || disposed) return;
    const old = S.oldHost ?? net.hostId;
    const epoch = net.hostEpoch + 1;
    const degraded = [];
    clearT(S.promptTimer); clearT(S.pollTimer);
    S.phase = 'idle'; S.accepted = false; S.pending = null;
    closeDialog(false);
    const oldPlayer = net.migrateTo(net.selfId, epoch);
    S.order = nextOrder(S.order, net.selfId, old, [...net.players.keys()]);
    S.hostRank = 0;
    // 1. tell the crew first (per-peer message order is preserved: followers re-point before they see any host-only message)
    net.broadcast('hmclaim', { e: epoch, r: 0, o: S.order }, false);
    // 2. host-side state
    try {
      game.hostData = hostDataFrom(S.x, game.run, [...game.items.all()].filter((it) => it.collected).map((it) => it.id), () => game.freshDayStats());
      if (!S.x) degraded.push('hostData');
      else if (S.x.cf && typeof S.x.cf === 'object') game.config = { ...game.config, ...S.x.cf };
      game.saveSlot = 'mig';   // never overwrite one of this player's own save slots with the crew's run
      game.opts = { ...(game.opts || {}), host: true, lobbyName: S.x?.ln || game.opts?.lobbyName };
    } catch (e) { degraded.push('hostData'); console.warn('[hostmig] hostData', e); }
    let restored = 0;
    try { restored = rebuildCreatures(degraded); } catch (e) { degraded.push('creatures'); console.warn('[hostmig] creatures', e); }
    try {
      let mx = 0;
      for (const it of game.items.all()) { const m = /^i([0-9a-z]+?)[0-9a-z]$/.exec(it.id || ''); if (m) mx = Math.max(mx, parseInt(m[1], 36) || 0); }
      game.items.nextId = Math.max(game.items.nextId || 1, mx + 1) + 1000 * epoch;
    } catch (e) { console.warn('[hostmig] items', e); }
    try { game.registerHandlers(); } catch (e) { degraded.push('handlers'); console.warn('[hostmig] registerHandlers', e); }
    try { game.hostOnPlayerLeave(old); } catch (e) { console.warn('[hostmig] leave', e); }
    dropAvatar(old, oldPlayer);
    reownItems(old);
    // 3. phases that were mid-flight on the old host (its timers died with it)
    try {
      const ph = game.run.phase;
      // Boarding countdown callbacks belong to the departed host. Cancel the
      // orphaned request; the living crew can explicitly start another countdown.
      // Null travels in the following full keyframe so followers clear their HUD.
      if((ph==='moon'||ph==='company')&&game.run.departure38)game.run.departure38=null;
      if (ph === 'landing') later(() => game.hostFinishLanding(), 3000, true);
      else if (ph === 'takeoff') later(() => game.hostFinishTakeoff(), 3000, true);
    } catch (e) { console.warn('[hostmig] phase', e); }
    // 4. full keyframe: every run field again, creature/item rows restart their keyframe cycle
    try { game._runSent = new Map(); game.broadcastRun(); net._rows?.clear?.(); sendX(); } catch (e) { console.warn('[hostmig] keyframe', e); }
    try { game.hostAnnounce?.(); } catch { /* lobby browser only */ }
    game.ui?.toast?.(t('You are the new host. The crew continues.'), 'good');
    if (degraded.length) game.ui?.toast?.(tf('Host migration: some systems were reset ({list}).', { list: degraded.join(', ') }), 'info');
    announce({ oldHostId: old, newHostId: net.selfId, epoch, self: true, degraded, creatures: restored });
  }

  // remove the old host's avatar / voice on this peer
  function dropAvatar(id, p) {
    if (!id || id === net.selfId) return;
    const r = game.remotes?.get(id);
    if (r) { try { r.dispose(); } catch { /* ignore */ } game.remotes.delete(id); game.ui?.toast?.(tf('{name} left the ship.', { name: r.name || p?.name || '?' })); }
    try { game.voice?.removePeer?.(id); } catch { /* ignore */ }
  }
  // items whose physics owner was the old host fall back to "the host" (= the new hostId): re-apply body authority everywhere
  function reownItems(old) {
    for (const it of game.items?.all?.() || []) {
      try { if (it.owner === old) it.owner = null; it.applyAuthority?.(); } catch { /* ignore */ }
    }
  }
  function announce(info) {
    try { game.mods?.emit?.('hostMigrated', game, info); } catch (e) { console.warn('[hostmig] hostMigrated', e); }
    try { game.emit?.('hostMigrated', info); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------------ claims
  const known = (id) => net.players.has(id) || net.transport?.peers?.has(id);
  function onClaim(d, from) {
    if (disposed || !net || !d || typeof d !== 'object' || from === net.selfId || !Number.isFinite(d.e)) return;
    if (Array.isArray(d.o)) { /* the claimant's order is informative only: ranks stay on the last order from the host */ }
    if (!known(from)) return;
    if (net.isHost) {
      if (d.e > net.hostEpoch) {
        // somebody claims a newer epoch. If other crewmates are still healthily linked to us the claimant is the one on a bad link: keep hosting,
        // adopt its epoch and answer with a broadcast claim (as the lowest-ranked host we win the same-epoch conflict, the claimant demotes).
        const healthy = [...net.players.keys()].filter((id) => id !== net.selfId && id !== from && net.transport?.peers?.has(id) && !net.lost.has(id)).length;
        if (healthy > 0) { net.hostEpoch = d.e; S.hostRank = 0; try { net.broadcast('hmclaim', { e: d.e, r: 0, o: S.order, k: 1 }, false); } catch { /* ignore */ } return; }
        S.phase = 'closed'; game.emit('fatal', t('The crew continued without you (a new host was elected). Rejoin with the lobby code.')); return;   // isolated stale host came back
      }
      if (d.k && d.e >= net.hostEpoch) { follow(from, d); return; }   // a live host with crew answered our (mistaken) claim: go back to it
      if (d.e === net.hostEpoch && S.hostRank != null && cmpRank(S.order, from, net.selfId) < 0) { follow(from, d); return; }   // lower rank wins a same-epoch conflict
      try { net.sendTo(from, 'hmclaim', { e: net.hostEpoch, r: 0, o: S.order }); } catch { /* ignore */ }   // make the rival yield
      return;
    }
    if (from === net.hostId) { if (d.e > net.hostEpoch) net.hostEpoch = d.e; return; }   // direct sync from the current host
    if (d.k && d.e >= net.hostEpoch) { follow(from, d); return; }   // the original host is alive after all (it kept its crew): follow it again
    const migrating = S.phase === 'lost' || S.phase === 'prompt' || S.phase === 'waiting';
    if (migrating) { acceptClaim(from, d); return; }
    if (d.e === net.hostEpoch && S.hostRank != null && cmpRank(S.order, from, net.hostId) < 0) { follow(from, d); return; }   // an earlier-ranked peer that we had counted out
    if (d.e > net.hostEpoch) S.pending = { from, d, at: now() };   // we have not noticed the host loss yet: keep the claim
  }
  function acceptClaim(from, d) {
    if (!(d.e > net.hostEpoch)) return false;
    // a claimant that ranks after somebody we still see alive is not accepted (that one gets CLAIM_WAIT_MS to speak up first)
    const better = cands().find((id) => id !== from && cmpRank(S.order, id, from) < 0);
    if (better) { S.pending = { from, d, at: now() }; return false; }
    follow(from, d);
    return true;
  }
  // re-point at a new host (also used to demote a host that lost a same-epoch conflict)
  function follow(from, d) {
    const wasHost = net.isHost;
    const old = net.hostId;
    if (wasHost) {
      for (const id of [...hostTimers]) clearT(id);
      try { game.hostData = null; game.creatures?.host?.clear?.(); } catch { /* ignore */ }
    }
    clearT(S.promptTimer); clearT(S.pollTimer);
    S.phase = 'idle'; S.accepted = false; S.pending = null; S.oldHost = null;
    const oldPlayer = net.migrateTo(from, d.e, !!d.k);
    S.hostRank = rankOf(from);
    S.order = Array.isArray(d.o) ? d.o.filter((x) => typeof x === 'string').slice(0, 64) : S.order;
    closeDialog(true);
    if (!d.k) {   // (d.k: the previous host is alive after all and stays in the crew)
      if (!wasHost) dropAvatar(old, oldPlayer);
      if (old !== net.selfId) reownItems(old);
    }
    game.ui?.toast?.(tf('{name} is the new host.', { name: nameOf(from) }), 'good');
    announce({ oldHostId: old, newHostId: from, epoch: d.e, self: false, degraded: [] });
  }

  // ------------------------------------------------------------------ wiring
  function bind(n) {
    if (net === n) return;
    net = n;
    n.on_('hmx', onX);
    n.on_('hmclaim', onClaim);
    n.relayTypes.add('hmclaim');
    offs.push(n.on('peerLost', (id) => { if (id === n.hostId && !n.isHost) beginLost(); }));
    offs.push(n.on('peerResume', (id) => { if (id === n.hostId && S.phase !== 'idle') cancelLost('resume'); }));
    offs.push(n.on('peerHello', (id, d) => { if (id === n.hostId && S.phase !== 'idle') cancelLost('hello'); }));
    offs.push(n.on('playerJoin', (id) => { if (n.isHost) later(() => sendX(id), 600, true); }));
    offs.push(n.on('peerConnect', (id) => { if (n.isHost && n.hostEpoch > 0) { try { n.sendTo(id, 'hmclaim', { e: n.hostEpoch, r: 0, o: S.order }); } catch { /* ignore */ } } }));
    if (game.isHost) S.order = nextOrder([], n.selfId, null, [...n.players.keys()]);
  }
  offs.push(game.mods?.on?.('netReady', (n, g) => { if (!g || g === game) bind(n); }));
  if (game.net) bind(game.net);
  later(xLoop, HM.XCAST_MS);

  return {
    onHostLeft, accept, leave: leaveToMenu, becomeHost,
    state: () => ({ phase: S.phase, succ: S.succ, order: [...S.order], epoch: net?.hostEpoch || 0, hasSnapshot: !!S.x, skip: [...S.skip], rank: net ? rankOf(net.selfId) : null }),
    candidates: () => (net ? cands() : []),
    S,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const id of timers) clearTimeout(id);
      timers.clear(); hostTimers.clear();
      closeDialog(false);
      for (const off of offs.splice(0)) { try { off?.(); } catch { /* ignore */ } }
      try { net?.relayTypes?.delete('hmclaim'); } catch { /* ignore */ }
    },
  };
}
