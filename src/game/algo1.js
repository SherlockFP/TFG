// ALGO1 - "The Algorithm learns you" + the Morning Vote + LIVE viewers (docs/wave5/algo1.md, MASTERPLAN 21 / 23.2 / 23.4 / 23.3).
//   learn   HOST tracks 3 crew habits per landing (favourite wing from the entrance, sprint ratio, deaths + near-deaths and their causes). At the NEXT landing it
//           applies ONE small counter-change (a creature on the favourite corridor / a noise-hunter / the killer gets one more / a mercy nudge) and says so once on the
//           intercom. Never in quota 0, at most one extra creature of power <= 2 per landing.
//   vote    in orbit, before the lever, 3 rule cards (real knobs: loot value, creature budget / speed, day length, gravity, stamina, blackout) are put to a 15 s vote
//           (keys 1/2/3 or click). Ties / no votes: the Algorithm picks. The winner applies to the next landing; one loser becomes DEBT (half strength the day after).
//   live    a viewer count on the existing "LIVE" intercom banner; grows with risky moments; emits the mods event 'tfg:viewers' {viewers, delta, reason}.
// Net (prefix 'a1'): 'a1req' client -> host {op:'vote', i}; 'a1s' host -> everyone {k:'open'|'tally'|'result'|'say'|'view', ...}. Host state lives in run.a1 (debt, last profile).
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { t, tf } from '../core/i18n.js';
import { CREATURES, spawnTable } from './creatures.js';
import { MOONS } from './moons.js';
import * as K from './algo1_core.js';
import './algo1_i18n.js';

const CSS = `.a1-vote{position:fixed;left:50%;top:clamp(56px,9vh,110px);transform:translateX(-50%);z-index:60;width:min(780px,94vw);background:#12130d;border:2px solid #f2c230;color:#e8e6d0;font:600 13px/1.3 'Bahnschrift','Arial Narrow',Arial,sans-serif;letter-spacing:.03em;box-shadow:0 6px 30px #000c;user-select:none}
.a1-vote .h{display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:repeating-linear-gradient(-45deg,#f2c230 0 10px,#15150f 10px 20px);color:#111;font-weight:800;text-transform:uppercase}
.a1-vote .h b{background:#f2c230;padding:1px 8px}
.a1-vote .cards{display:flex;gap:8px;padding:10px}
.a1-vote .c{flex:1;min-width:0;border:1px solid #5a5730;padding:8px 10px;cursor:pointer;background:#191a11}
.a1-vote .c:hover{border-color:#f2c230}.a1-vote .c.me{border-color:#59e06a;background:#132114}
.a1-vote .k{color:#f2c230;font-size:18px}.a1-vote .n{font-size:14px;text-transform:uppercase;margin:2px 0 4px}
.a1-vote .d{font-weight:500;font-size:12px;color:#b9b7a0;min-height:32px}.a1-vote .v{margin-top:6px;color:#59e06a}
.a1-vote .f{padding:0 12px 8px;color:#b9b7a0;font-size:12px}
@media (max-width:760px){.a1-vote .cards{flex-direction:column}}`;

export function installAlgo1(game) {
  const mods = game.mods;
  const offs = [], restores = [];
  let disposed = false, boundNet = null, style = null, root = null, keyFn = null;
  const host = () => !!game.isHost;
  const S = {
    vote: null,               // { key, cards, votes: Map, t, sec } host + client view { cards, counts, me, left, debt }
    rule: null,               // { win, debt } active for this day (every peer: stats knobs)
    prof: K.newProfile(),     // host: this landing's habits
    pend: null,               // host: counter chosen from the previous landing
    viewers: K.newViewers(), viewT: 0, lastSent: 0,
    trackT: 0, entrance: null, last: new Map(), low: new Map(), chase: new Map(), bossHp: new Map(), evCd: {},
    votedKey: null, orbitT: 0, deathsSeen: 0, savedDay: null, extraDone: false, say: null,
  };
  const rngFor = (salt) => new RNG(((game.run?.seed | 0) ^ salt ^ ((game.run?.day | 0) * 7919)) >>> 0);
  const run = () => game.run;
  const a1 = () => {
    const r = run(); if (!r) return null;
    const a = (r.a1 = r.a1 && typeof r.a1 === 'object' ? r.a1 : { debt: null });
    if (a.debt && !K.RULES[a.debt]) a.debt = null;                                    // a synced / migrated run may carry junk: never crash on it
    if (a.today && !K.RULES[a.today.win]) a.today = null;
    if (a.today?.half && !K.RULES[a.today.half]) a.today.half = null;
    return a;
  };
  /** the rule in force: this peer's live 'result' message, else run.a1.today (synced with the run, so a late joiner / a new host has it) while a day is running */
  const ruleNow = () => S.rule || (['landing', 'moon'].includes(run()?.phase) && run()?.a1?.today?.win && K.RULES[run().a1.today.win] ? run().a1.today : null);
  const enabled = () => game.config?.algo1 !== false;

  // ------------------------------------------------------------ net
  const send = (d) => { try { game.net.broadcast('a1s', d); } catch { /* net closing */ } };
  function onMsg(m, fromId) {
    if (disposed || !m || typeof m.k !== 'string' || (fromId !== game.selfId && fromId !== game.net?.hostId)) return;
    if (m.k === 'open') { try { mods.emit('tfg:score', { k: 'vote' }, game); } catch { /* optional */ } S.vote = { cards: m.cards, counts: [0, 0, 0], me: -1, left: m.sec, debt: m.debt || null }; showVote(); }
    else if (m.k === 'tally') { if (S.vote) { S.vote.counts = m.c; renderVote(); } }
    else if (m.k === 'result') { S.rule = m.win ? { win: m.win, debt: m.debt || null, half: m.half || null } : null; hideVote(); }
    else if (m.k === 'say') { try { game.lore?.say?.(tf(m.s, m.v || {})); } catch { /* lore optional */ } }
    else if (m.k === 'view') { const d = m.n - S.viewers.n; S.viewers.n = m.n; try { mods.emit('tfg:viewers', { viewers: m.n, delta: d, reason: m.r || null }, game); } catch { /* listeners */ } paintViewers(); }
  }
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:a1s', onMsg);
    boundNet = net; net.on('msg:a1s', onMsg);
  }
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  offs.push(mods.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    H('a1req', (d, from) => { if (host() && d?.op === 'vote') hostVote(from, d.i | 0); });
  }));
  const sayAll = (s, v) => send({ k: 'say', s, v });

  // ------------------------------------------------------------ viewers
  function bump(kind, why) {
    if (!host()) return;
    const d = K.addViewers(S.viewers, kind);
    if (d) { send({ k: 'view', n: S.viewers.n, r: why || kind }); S.lastSent = S.viewers.n; }
  }
  function paintViewers() {
    if (typeof document === 'undefined') return;
    const txt = '● LIVE  ' + K.fmtViewers(S.viewers.n);
    for (const el of document.querySelectorAll('.algo-live')) if (el.textContent !== txt) el.textContent = txt;
  }

  // ------------------------------------------------------------ vote UI (client)
  function ensureUi() {
    if (root || typeof document === 'undefined') return;
    style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    root = document.createElement('div'); root.className = 'a1-vote'; root.style.display = 'none';
    (document.getElementById('ui') || document.body).appendChild(root);
    root.addEventListener('click', (e) => { const c = e.target.closest?.('.c'); if (c) castVote(+c.dataset.i); });
  }
  function showVote() {
    ensureUi(); if (!root) return;
    root.style.display = 'block'; renderVote();
    if (!keyFn) {
      keyFn = (e) => {
        if (!S.vote || /INPUT|TEXTAREA/.test(e.target?.tagName || '')) return;
        const i = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
        if (i === undefined) return;
        e.preventDefault(); e.stopImmediatePropagation(); castVote(i);
      };
      window.addEventListener('keydown', keyFn, true);
    }
  }
  function hideVote() {
    S.vote = null;
    if (root) root.style.display = 'none';
    if (keyFn) { window.removeEventListener('keydown', keyFn, true); keyFn = null; }
  }
  function castVote(i) {
    if (!S.vote || !(i >= 0 && i < S.vote.cards.length)) return;
    S.vote.me = i; renderVote();
    try { game.net.request('a1req', { op: 'vote', i }); } catch { /* net closing */ }
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function renderVote() {
    const v = S.vote; if (!root || !v) return;
    const cards = v.cards.map((id, i) => {
      const r = K.RULES[id];
      return `<div class="c${v.me === i ? ' me' : ''}" data-i="${i}"><div class="k">${i + 1}</div><div class="n">${esc(t(r.name))}</div><div class="d">${esc(t(r.desc))}</div><div class="v">${v.counts[i] || 0} ${esc(t('votes'))}</div></div>`;
    }).join('');
    const debt = v.debt && K.RULES[v.debt] ? `<div class="f">${esc(tf('Tab: {@r} (half strength)', { r: K.RULES[v.debt].name }))}</div>` : '';
    root.innerHTML = `<div class="h"><span>${esc(t('MORNING RULES'))} - ${esc(t('Vote with 1 / 2 / 3'))}</span><b>${Math.max(0, Math.ceil(v.left))}s</b></div><div class="cards">${cards}</div>${debt}`;
  }

  // ------------------------------------------------------------ host: vote
  function hostOpenVote() {
    const r = run(), st = a1();
    if (!r || !st) return;
    const key = `${r.runId ?? 'x'}:${r.day}`;
    S.votedKey = key;
    const rng = rngFor(0xa15e);
    const cards = K.drawCards(() => rng.next(), r.quotaIndex | 0, st.debt);
    if (cards.length < 2) return;
    S.vote = { key, cards, votes: new Map(), t: K.T.voteSec, debt: st.debt || null };
    send({ k: 'open', cards, sec: K.T.voteSec, debt: st.debt || null });
  }
  function hostVote(from, i) {
    const v = S.vote; if (!v || !v.votes || !(i >= 0 && i < v.cards.length)) return;
    v.votes.set(String(from), i);
    send({ k: 'tally', c: v.cards.map((_, j) => [...v.votes.values()].filter((x) => x === j).length) });
    const n = (game.aiPlayers?.() || []).filter((p) => !p.dead).length || 1;
    if (v.votes.size >= n) hostCloseVote();
  }
  function hostCloseVote() {
    const v = S.vote, st = a1(); if (!v || !v.votes || !st) return;
    const rng = rngFor(0xdeb7);
    const res = K.tally(v.votes, v.cards.length, () => rng.next());
    const win = v.cards[res.win];
    const di = K.pickDebt(res.counts, res.win, () => rng.next());
    const newDebt = di != null ? v.cards[di] : null;
    const half = v.debt || null;                       // yesterday's debt bites at half strength today
    st.debt = newDebt;
    st.today = { win, half, day: run().day };
    S.vote = null;
    game.broadcastRun?.(['a1']);                        // late joiners / a future host get the debt + today's rule with the run
    send({ k: 'result', win, half, debt: newDebt });
    const line = res.none ? 'Nobody voted. Fine. I choose: {@r}.' : res.tie ? 'A tie. Adorable. I choose: {@r}.' : 'The people have spoken: {@r}.';
    sayAll(line, { r: K.RULES[win].name });
    if (newDebt) game.later(() => sayAll('{@d} goes on your tab: half strength tomorrow.', { d: K.RULES[newDebt].name }), 6500);
    bump('vote', 'vote');
  }
  /** every knob of the active rule set (host reads run.a1.today, peers read S.rule) */
  function fx() {
    const r = ruleNow();
    if (!r?.win) return null;
    return K.combine([{ id: r.win, k: 1 }, ...(r.half ? [{ id: r.half, k: K.T.debtK }] : [])]);
  }

  // ------------------------------------------------------------ host: learn
  const facOf = () => game.world?.facility || null;
  const moonOf = () => MOONS[run()?.moon];
  function inFacilityDay() { const r = run(); return !!r && r.phase === 'moon' && !!facOf() && !moonOf()?.company && !moonOf()?.home; }
  function trackTick(dt) {
    const fac = facOf(), players = game.aiPlayers?.() || [];
    for (const p of players) {
      if (p.dead || p.inShip) { S.last.delete(p.id); continue; }
      const prev = S.last.get(p.id); S.last.set(p.id, p.pos.clone());
      if (!S.entrance && p.zone === 'in') S.entrance = fac?.mainDoor?.spawn || p.pos.clone();
      const moving = !!prev && prev.distanceTo(p.pos) > 0.4 * dt * 2;
      const rem = game.remotes?.get?.(p.id);
      const sprint = p.id === game.selfId ? !!game.player?.sprinting : !!((rem?.flags | 0) & 2);
      const side = p.zone === 'in' && S.entrance ? K.sideOf(p.pos.x - S.entrance.x) : null;
      K.track(S.prof, { side, moving, sprint, dt });
      const hp = p.id === game.selfId ? game.player?.hp : rem?.hp;
      if (typeof hp === 'number') nearDeath(p.id, hp);
      chaseWatch(p, sprint, moving, dt);
    }
    bossWatch();
    // deaths (cause + wing)
    const deaths = game.hostData?.dayStats?.deaths || [];
    while (S.deathsSeen < deaths.length) {
      const d = deaths[S.deathsSeen++];
      const p = players.find((q) => q.id === d.id);
      K.recordDeath(S.prof, d.cause, p && S.entrance ? K.sideOf(p.pos.x - S.entrance.x) : 'C');
      bump('death', 'death');
    }
  }
  function cool(k, s) { const n = game.time || 0; if ((S.evCd[k] || 0) > n) return false; S.evCd[k] = n + s; return true; }
  function nearDeath(id, hp) {
    const cur = S.low.get(id);
    if (hp <= 25 && hp > 0) { if (cur == null) S.low.set(id, game.time || 0); return; }
    if (cur != null && hp > 35 && (game.time || 0) - cur >= 6) {   // came back from the edge
      S.low.delete(id);
      if (cool('near' + id, 45)) { K.recordNear(S.prof); bump('escape', 'escape'); }
    } else if (cur != null && hp <= 0) S.low.delete(id);
  }
  function chaseWatch(p, sprint, moving, dt) {
    if (!sprint || !moving) { S.chase.set(p.id, 0); return; }
    let near = false;
    for (const c of game.creatures?.host?.values?.() || []) {
      if (c.dead || c.def?.boss || c.zone !== p.zone) continue;
      if ((c.state === 'run' || c.state === 'attack') && c.pos.distanceTo(p.pos) < 9) { near = true; break; }
    }
    const acc = near ? (S.chase.get(p.id) || 0) + dt : 0;
    if (acc >= 3 && cool('chase' + p.id, 25)) { S.chase.set(p.id, 0); bump('sprint_away', 'sprint_away'); return; }
    S.chase.set(p.id, acc);
  }
  function bossWatch() {
    for (const c of game.creatures?.host?.values?.() || []) {
      if (!c.def?.boss || typeof c.hp !== 'number') continue;
      const prev = S.bossHp.get(c.id ?? c);
      S.bossHp.set(c.id ?? c, c.hp);
      if (prev != null && c.hp < prev - (c.def.hp || 400) * 0.02 && cool('boss', 6)) bump('boss_hit', 'boss_hit');
    }
  }

  // counter-change ------------------------------------------------
  /** power cost of `type` if it may be added as the extra creature on this moon, else null */
  function spawnable(type) {
    const def = CREATURES[type];
    if (!def || def.hazard || def.boss || def.zone === 'out' || !(def.power > 0)) return null;
    if (type === 'listener') return def.power;
    try { const tb = spawnTable(moonOf(), 'in', run()); if (!(tb?.[type] > 0)) return null; } catch { return null; }
    return def.power;
  }
  function routeType(rng) {
    let tb; try { tb = spawnTable(moonOf(), 'in', run()); } catch { return null; }
    const e = Object.keys(tb || {}).filter((id) => tb[id] > 0 && spawnable(id) != null && id !== 'listener' && CREATURES[id].power <= K.T.extraPowerCap);
    return e.length ? e[Math.floor(rng.next() * e.length)] : null;
  }
  /** end of a landing (phase orbit): decide tomorrow's counter from today's habits */
  function chooseFromProfile() {
    const r = run(); if (!r || !r.moon) return;
    const rng = rngFor(0xc0de);
    S.pend = K.chooseCounter(S.prof, { quotaIndex: r.quotaIndex | 0, spawnable, hasListener: !!CREATURES.listener, routeType: routeType(rng) });
    S.prof = K.newProfile(); S.entrance = null; S.deathsSeen = 0;
    S.last.clear(); S.low.clear(); S.chase.clear(); S.bossHp.clear();
  }
  function spotFor(side, players) {
    const fac = facOf(); if (!fac) return null;
    const early = game.hostEarlySafeFilter?.(10) || null;
    const pool = [...(fac.ventSpots || []), ...(fac.scrapSpots || []).filter((q) => !q.elevated && !q.sealed)];
    const far = pool.filter((s) => players.every((p) => Math.hypot(p.pos.x - s.x, p.pos.z - s.z) > 14) && (!early || early(s)));
    const en = S.entrance || fac.mainDoor?.spawn;
    const onSide = side && en ? far.filter((s) => K.sideOf(s.x - en.x) === side && Math.hypot(s.x - en.x, s.z - en.z) > 12) : far;
    return onSide.length ? onSide[Math.floor(rngFor(0x5907).next() * onSide.length)] : null;
  }
  /** after the moon is populated: apply the pending counter + announce (max one line) */
  function applyCounter() {
    const c = S.pend; S.pend = null;
    if (!c || (run()?.quotaIndex | 0) <= 0 || S.extraDone) return;
    S.extraDone = true;
    let line = null, vars = {};
    if (c.kind === 'mercy') {
      line = 'Your numbers are tragic. The feed goes easy on you today. Do not get used to it.';
    } else {
      if (spawnable(c.type) == null) { if (c.kind === 'route') c.type = routeType(rngFor(0x7e57)); else return; }   // the next moon may have another table
      const spot = c.type && spawnable(c.type) != null ? spotFor(c.kind === 'route' ? c.side : null, game.aiPlayers?.() || []) : null;
      if (!spot || !game.creatures?.hostSpawn) return;
      game.creatures.hostSpawn(c.type, new THREE.Vector3(spot.x, spot.y, spot.z), { level: game.rollLevel?.() || 1, zone: 'in' });
      if (c.kind === 'route') line = { L: 'You love the left corridor. I put something there.', C: 'You never leave the middle. Predictable. I put something there.', R: 'You love the right wing. I put something there.' }[c.side];
      else if (c.kind === 'sprint') line = 'You sprint everywhere. Cardio is content. I added something that listens.';
      else { line = 'Deaths to the {@c}: {n}. It received a small raise.'; vars = { c: CREATURES[c.type].name, n: c.n }; }
    }
    if (line) game.later(() => { if (run()?.phase === 'moon') sayAll(line, vars); }, 5500);
  }

  // ------------------------------------------------------------ hooks: rule + counter on landing / populate
  const wrap = (obj, name, make) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w;
    restores.push(() => { if (obj[name] === w) { if (had) obj[name] = orig; else delete obj[name]; } });
  };
  wrap(game, 'hostPopulateMoon', (orig) => function () {
    if (!enabled() || !host()) return orig.call(this);
    const f = fx(), r = run();
    S.mercy = S.pend?.kind === 'mercy' && (r.quotaIndex | 0) > 0 ? S.pend.dangerMul : 0;
    const dm = (f?.dangerMul || 1) * (S.mercy || 1), vm = f?.valueMul || 1;
    const ev0 = r.dailyEvent, patched = dm !== 1 || vm !== 1;
    if (patched) r.dailyEvent = { ...(ev0 || {}), dangerMul: (ev0?.dangerMul || 1) * dm, valueMul: (ev0?.valueMul || 1) * vm };
    try { orig.call(this); } finally { if (patched) r.dailyEvent = ev0; }
    try {
      if (f?.blackout && r.powerOn) this.hostSetPower?.(false);
      S.extraDone = false; applyCounter();
    } catch (e) { console.warn('[algo1] apply', e); }
  });
  wrap(game.creatures, 'speedMul', (orig) => function (c, speed) {
    const s = orig.call(this, c, speed), f = fx();
    return f && f.speedMul !== 1 && !c.def?.boss ? s * f.speedMul : s;
  });
  let baseDay = null;
  const restoreDay = () => { if (baseDay != null) { game.config.dayLengthSec = baseDay; baseDay = null; } };
  offs.push(mods.on('stats', (st, g) => {
    if (g !== game || !st) return;
    const f = fx();
    if (!f) return;
    st.jumpMul = (st.jumpMul || 1) * f.jumpMul;
    st.staminaRegen = (st.staminaRegen || 16) * f.staminaRegen;
  }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g && g !== game) return;
    if (ph === 'landing') {
      game.refreshStats?.();
      if (host() && enabled()) { const f = fx(); if (f && f.dayLenMul !== 1 && baseDay == null) { baseDay = game.config.dayLengthSec; game.config.dayLengthSec = Math.round((baseDay || 720) * f.dayLenMul); } }
      if (host() && S.vote) hostCloseVote();          // lever pulled during the vote: close it now
    } else if (ph === 'orbit' || ph === 'fired' || ph === 'takeoff') {
      if (ph !== 'takeoff') { restoreDay(); S.rule = null; S.mercy = 0; game.refreshStats?.(); }
      if (host() && ph === 'orbit') { if (a1()) { a1().today = null; game.broadcastRun?.(['a1']); } chooseFromProfile(); S.orbitT = 0; }
    }
  }));

  // ------------------------------------------------------------ update
  function update(dt) {
    if (disposed) return;
    const r = run();
    if (S.vote && !host()) { S.vote.left -= dt; if (root && root.style.display !== 'none') { const b = root.querySelector('.h b'); if (b) b.textContent = Math.max(0, Math.ceil(S.vote.left)) + 's'; } }
    if (!host() || !r || !enabled()) return;
    if (r.phase === 'moon' && inFacilityDay()) {
      S.trackT += dt;
      if (S.trackT >= 0.5) { const d = S.trackT; S.trackT = 0; try { trackTick(d); } catch (e) { console.warn('[algo1] track', e); } }
    }
    if (S.vote?.votes) { S.vote.t -= dt; if (S.vote.t <= 0) hostCloseVote(); }
    if (r.phase === 'orbit') {
      S.orbitT += dt;
      const key = `${r.runId ?? 'x'}:${r.day}`;
      if (S.orbitT > 4 && S.votedKey !== key && !S.vote && !MOONS[r.moon]?.company) hostOpenVote();
    }
    K.decayViewers(S.viewers, dt);
    S.viewT += dt;
    if (S.viewT >= 2) { S.viewT = 0; if (Math.abs(S.viewers.n - S.lastSent) >= 1) { S.lastSent = S.viewers.n; send({ k: 'view', n: Math.round(S.viewers.n), r: null }); } }
  }
  offs.push(mods.on('update', (dt, g) => { if (!g || g === game) update(dt); }));
  const paintT = setInterval(paintViewers, 1500);

  return {
    state: S, fx, bump,
    /** debug: force the vote / a viewer spike / read the tracker */
    debug: { openVote: hostOpenVote, closeVote: hostCloseVote, profile: () => S.prof, pending: () => S.pend },
    dispose() {
      disposed = true; clearInterval(paintT);
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      try { boundNet?.off?.('msg:a1s', onMsg); } catch { /* ignore */ }
      restoreDay(); hideVote(); root?.remove(); style?.remove(); root = style = null;
      if (typeof document !== 'undefined') for (const el of document.querySelectorAll('.algo-live')) el.textContent = '● LIVE';
    },
  };
}
