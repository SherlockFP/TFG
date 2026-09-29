// ALGO2 - the Algorithm's LIVE STREAM (docs/wave6/algo2.md, MASTERPLAN 23.3 / 23.5 / 23.6).
//   hype    risky / fun acts (near-death escape, dodging a locked NPC shot, shutting a door on a chaser, boss hits, knocking the fake closet, extracting with < 10 s left,
//           using a glitch) add HYPE. Tiers pay at extraction: bonus Clout + a sponsor-drop crate (silver / gold). Hot days make the Algorithm "want more show":
//           +1 small creature the next landing. A fake chat (EN/TR/RU, rate-limited, settings toggle `a2Feed`) reacts in a small corner panel.
//   ghost   when a player dies the host keeps their last 10 s (10 Hz, packed ~800 chars). Next landing on the same moon a translucent ghost replays it (positioned relative to the
//           entrance, snapped to a real spot: the layout changes every landing), creatures are lured toward it, and the dead player's loot marker + one cache of scrap are there. Max 3 per moon.
//   glitch  1-3 seeded exploits per landing: a WALL you can step through (hop across the facility), a DUPLICATION shelf (copies one scrap item once), a FREEZE pixel (stuns nearby
//           creatures 5 s). Every use raises the crew PATCH meter; at 100 % the Algorithm patches (removes all glitches) and punishes (lights out or a short swarm).
// Net (prefix 'a2'): 'a2req' client -> host {op:'use', id, item?}; 'a2s' host -> everyone {k:'h'|'g'|'gh'|'tp'|'pay'|'say'|'fz', ...}.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { t, tf, getLang, sysMsg } from '../core/i18n.js';
import { hudDock } from '../ui/dock.js';
import { CREATURES, spawnTable } from './creatures.js';
import { MOONS } from './moons.js';
import { isSellable } from './items.js';
import { grantCrate } from './daily_core.js';
import * as K from './algo2_core.js';
import { CHAT, HANDLES, chatLine } from './algo2_i18n.js';
import { createView } from './algo2_view.js';
import { VIEW_GAIN } from './algo1_core.js';

const CSS = `.a2-feed{width:250px;background:rgba(6,4,3,.62);border-left:3px solid var(--tc,#f2c230);padding:4px 8px 5px;font-family:var(--cond,'Barlow Condensed','Arial Narrow',sans-serif);pointer-events:none;color:#d9d6bf;text-transform:none}
.a2-feed.off{display:none}
.a2-feed .hd{display:flex;justify-content:space-between;align-items:center;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#f2c230;margin-bottom:3px}
.a2-feed .hd b{color:var(--tc,#f2c230)}
.a2-feed .bar{display:flex;gap:2px;margin-bottom:4px}.a2-feed .bar i{flex:1;height:5px;background:#2a2a20}.a2-feed .bar i.on{background:var(--tc,#f2c230)}
.a2-feed .ln{font-size:13px;line-height:1.15;margin:1px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.a2-feed .ln u{text-decoration:none;color:#59a8b8;margin-right:5px}.a2-feed .ln:nth-child(1){opacity:.45}.a2-feed .ln:nth-child(2){opacity:.65}.a2-feed .ln:nth-child(3){opacity:.85}
.a2-feed .pm{font-size:12px;color:#ff6f61;margin-top:3px;letter-spacing:.08em}`;
const TIER_COL = ['#8a8a78', '#c58a4a', '#c8d0d8', '#ffd23f'];
const V3 = THREE.Vector3;

export function installAlgo2(game) {
  const mods = game.mods;
  const offs = [], restores = [];
  let disposed = false, boundNet = null, spied = null, style = null, box = null;
  const host = () => !!game.isHost;
  const view = createView(game);
  const S = {
    hype: K.newHype(), hs: { h: 0, tier: 0 },   // host truth / everyone's mirror
    rec: new K.Recorder(), recT: 0,
    atPh: new Map(), outT: new Map(), evCd: {}, pendingWant: 0,
    gl: [], glKey: null, ps: K.newPatch(), glFac: null,
    live: [], biasT: 0, chatLines: [], chatGate: K.makeChatGate(), ambT: 6, chatT: 0, patchLater: false, tickT: 0,
  };
  const run = () => game.run;
  const a2 = () => { const r = run(); if (!r) return null; return (r.a2 = r.a2 || { ghosts: {}, patch: 0, want: 0 }); };
  const enabled = () => game.config?.algo2 !== false;
  const feedOn = () => game.settings?.a2Feed === true;   // wave 8 declutter: the fake chat is opt-in (Settings > HUD)
  const moonOf = () => MOONS[run()?.moon];
  const facOf = () => game.world?.facility || null;
  function inFacilityDay() { const r = run(); return !!r && r.phase === 'moon' && !!facOf() && !moonOf()?.company && !moonOf()?.home; }
  const rngFor = (salt) => new RNG(((run()?.seed | 0) ^ salt ^ ((run()?.day | 0) * 131)) >>> 0);
  const quota = () => run()?.quotaIndex | 0;

  // ------------------------------------------------------------ net
  const wrap = (obj, name, make) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w;
    restores.push(() => { if (obj[name] === w) { if (had) obj[name] = orig; else delete obj[name]; } });
  };
  const send = (d) => { try { game.net.broadcast('a2s', d); } catch { /* net closing */ } };
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:a2s', onMsg);
    boundNet = net; net.on('msg:a2s', onMsg);
    if (net !== spied) {   // the horror module owns 'hrfx' (one handler per type): spy on the host's outgoing effect instead of a second handler
      spied = net;
      wrap(net, 'broadcast', (orig) => function (type, d, ...rest) {
        try { if (type === 'hrfx' && d?.k === 'knock' && d.ans) onClosetKnock(); } catch { /* hype is optional */ }
        return orig.call(this, type, d, ...rest);
      });
    }
  }
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  offs.push(mods.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    H('a2req', (d, from) => { if (host() && d?.op === 'use') hostUse(d, from); });
  }));
  offs.push(mods.on('playerJoin', (id, info, g) => {
    if (g !== game || !host() || !enabled()) return;
    try {
      game.net.sendTo(id, 'a2s', { k: 'h', h: S.hype.h, t: K.tierOf(S.hype.h) });
      game.net.sendTo(id, 'a2s', { k: 'g', meter: S.ps.meter, patched: S.ps.patched ? 1 : 0, used: Object.keys(S.ps.used), wall: S.ps.wall });
      if (S.live.length) game.net.sendTo(id, 'a2s', { k: 'gh', list: S.live.map(wireGhost) });
    } catch { /* joiner gone */ }
  }));

  function onMsg(m, fromId) {
    if (disposed || !m || typeof m.k !== 'string' || (fromId !== game.selfId && fromId !== game.net?.hostId)) return;
    switch (m.k) {
      case 'h': {
        const tier = m.t | 0, up = tier > S.hs.tier;
        S.hs.h = +m.h || 0; S.hs.tier = tier; paintFeed();
        if (m.e) chat(m.e);
        if (up) { chat('tier'); try { game.mods.emit('tfg:score', { k: 'hype', tier }, game); } catch { /* optional */ } }
        break;
      }
      case 'g': {
        S.ps.meter = m.meter | 0; S.ps.wall = m.wall | 0;
        const nu = (m.used || []).length; if (S.ps.gN !== undefined && nu > S.ps.gN) { try { mods.emit('tfg:score', { k: 'glitch' }, game); } catch { /* optional */ } } S.ps.gN = nu;   // [score]
        S.ps.used = {}; for (const id of m.used || []) S.ps.used[id] = 1;
        for (const id of m.used || []) if (id[0] !== 'w') view.hideGlitch(id);
        if (m.patched) { S.ps.patched = true; view.clearGlitches(); chat('patch'); }
        paintFeed();
        break;
      }
      case 'gh': {
        const clampGhost = (tr, a) => { try { return K.clampTrack(tr, a, facOf()?.nav); } catch { return tr; } };
        S.liveView = (m.list || []).map((g) => ({ a: g.a, track: clampGhost(K.unpackTrack(g.tr), g.a), label: tf('GHOST: {name}', { name: g.n }), loot: g.loot | 0 }));
        view.setGhosts(S.liveView);
        if (S.liveView.length) chat('ghost');
        break;
      }
      case 'tp': if (m.to === game.selfId) doTeleport(m); break;
      case 'pay': if (Array.isArray(m.ids) && (m.ids.includes(game.selfId) || m.ids.includes(game.profile?.id))) receivePay(m); break;
      case 'say': try { game.lore?.say?.(tf(m.s, m.v || {})); } catch { /* lore optional */ } break;
      case 'fz': try { game.audio?.at?.('beep_3', new V3(m.p[0], m.p[1] + 1, m.p[2]), 0.6); } catch { /* audio optional */ } break;
      default: break;
    }
  }
  const sayAll = (s, v) => send({ k: 'say', s, v });

  // ------------------------------------------------------------ hype (host)
  function hype(kind) {
    if (!host() || !enabled() || !inFacilityDay()) return;
    const r = K.addHype(S.hype, kind, game.time || 0);
    if (r.gain <= 0) return;
    if (!FROM_ALGO1[kind]) { try { game.algo1?.bump?.(kind, kind); } catch { /* algo1 optional */ } }   // algo1's own acts already moved the counter
    send({ k: 'h', h: S.hype.h, t: r.tier, e: kind });
  }
  const cool = (k, s) => { const n = game.time || 0; if ((S.evCd[k] || 0) > n) return false; S.evCd[k] = n + s; return true; };
  // events algo1 already detects arrive as viewer bumps with a reason
  const FROM_ALGO1 = { escape: 1, boss_hit: 1, sprint_away: 1, death: 1 };
  offs.push(mods.on('tfg:viewers', (d, g) => {
    if ((g && g !== game) || !d?.reason || !FROM_ALGO1[d.reason] || !host() || !enabled() || !inFacilityDay()) return;
    const r = K.addHype(S.hype, d.reason, game.time || 0);
    if (r.gain > 0) send({ k: 'h', h: S.hype.h, t: r.tier, e: d.reason });
  }));
  function onClosetKnock() { if (host() && enabled()) hype('closet'); }
  // viewer growth for the new acts (algo1 owns the counter)
  Object.assign(VIEW_GAIN, { dodge: 0.08, door_shut: 0.08, closet: 0.15, late_extract: 0.2, glitch: 0.06 });

  // shutting a door with a chaser next to it (host sees every door change)
  wrap(game, 'hostSetDoor', (orig) => function (id, open, silent) {
    let closing = false, door = null;
    try { door = this.doorById?.(id); closing = !!door && door.open && !open && door.kind === 'door'; } catch { /* no door */ }
    const r = orig.call(this, id, open, silent);
    try {
      if (closing && host() && enabled() && inFacilityDay() && door.pos) {
        let chaser = false;
        for (const c of game.creatures?.host?.values?.() || []) {
          if (c.dead || c.def?.boss || (c.state !== 'run' && c.state !== 'attack')) continue;
          if (c.pos.distanceTo(door.pos) < 6) { chaser = true; break; }
        }
        const near = (game.aiPlayers?.() || []).some((p) => !p.dead && p.pos.distanceTo(door.pos) < 4.5);
        if (chaser && near && cool('door', 12)) hype('door_shut');
      }
    } catch { /* hype is optional */ }
    return r;
  });
  // a death: keep the last 10 s as a ghost for the next landing on this moon
  wrap(game, 'hostOnPlayerDied', (orig) => function (id, d) {
    try { if (host() && enabled() && inFacilityDay() && d?.cause !== 'left') onDeath(id, d); } catch (e) { console.warn('[algo2] death', e); }
    return orig.call(this, id, d);
  });
  function onDeath(id, d) {
    const tr = S.rec.finish(id);
    const en = entrance(), st = a2();
    if (!tr || !en || !st) return;
    const p = game.aiPlayerById?.(id);
    const pos = d.pos ? { x: d.pos[0], z: d.pos[2] } : (p ? { x: p.pos.x, z: p.pos.z } : { x: tr.ax / 10, z: tr.az / 10 });
    let loot = 0;
    for (const it of game.items?.all?.() || []) if (it.holder === id && isSellable(it.def) && !it.soulbound && it.type !== 'body') loot += it.value | 0;
    K.addGhost(st, run().moon, { v: 1, tr, day: run().day | 0, name: game.playerName?.(id) || 'Employee', rx: +(pos.x - en.x).toFixed(1), rz: +(pos.z - en.z).toFixed(1), loot });
  }
  const wireGhost = (g) => ({ a: g.a, tr: g.tr, n: g.name, loot: g.loot });

  // ------------------------------------------------------------ host: tick (recorder, dodge watch, late-extract memory, ghost bias)
  const entrance = () => { const s = facOf()?.mainDoor?.spawn; return s ? { x: s.x, y: s.y, z: s.z } : null; };
  function hostTick(dt) {
    const players = game.aiPlayers?.() || [];
    S.recT += dt;
    if (S.recT >= 0.1) {
      const list = [];
      for (const p of players) {
        const yaw = Math.atan2(-p.look.x, -p.look.z);
        list.push({ id: p.id, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw, skip: p.dead || p.inShip || p.zone !== 'in' });
        if (!p.dead && !p.inShip) S.outT.set(p.id, game.time || 0);
      }
      S.rec.feed(S.recT, list); S.recT = 0;
    }
    // dodged a locked NPC shot: the aim went lock -> idle and the target stands well away from the locked point
    for (const c of game.creatures?.host?.values?.() || []) {
      const a = c.data?.at; if (!a) continue;
      const prev = S.atPh.get(c.id); S.atPh.set(c.id, a.ph);
      if (prev === 'lock' && a.ph === 'idle' && a.lock) {
        const p = game.aiPlayerById?.(a.tid);
        if (p && !p.dead && Math.hypot(p.pos.x - a.lock[0], p.pos.z - a.lock[2]) > 1.1 && cool('dodge' + p.id, 8)) hype('dodge');
      }
    }
    // lure creatures toward the ghosts for the first couple of minutes of the day (never in quota 0)
    if (S.live.length && quota() > 0 && (game.hostData?.moonT || 0) < K.GHOST.biasSec) {
      S.biasT -= dt;
      if (S.biasT <= 0) {
        S.biasT = K.GHOST.biasEvery;
        for (const g of S.live) game.creatures?.noise?.(new V3(g.a[0], g.a[1] + 0.5, g.a[2]), K.GHOST.biasLoud, null);
      }
    }
  }

  // ------------------------------------------------------------ host: populate (ghosts, glitch meter, "wants more show")
  function extraCreature() {
    let tb; try { tb = spawnTable(moonOf(), 'in', run()); } catch { return false; }
    const ids = Object.keys(tb || {}).filter((id) => tb[id] > 0 && CREATURES[id] && !CREATURES[id].hazard && !CREATURES[id].boss && CREATURES[id].zone !== 'out' && CREATURES[id].power > 0 && CREATURES[id].power <= 1.5 && id !== 'leech' && id !== 'mimic' && id !== 'jester' && id !== 'scuttler');
    if (!ids.length) return false;
    return !!game.hostSpawnCreatureIndoor?.(ids[Math.floor(rngFor(0xa2ee).next() * ids.length)]);
  }
  function hostPopulated() {
    if (!host() || !enabled() || !inFacilityDay()) return;
    const st = a2(), r = run();
    S.hype = K.newHype(); S.hs = { h: 0, tier: 0 }; send({ k: 'h', h: 0, t: 0 });
    S.rec.clear(); S.atPh.clear(); S.evCd = {}; S.outT.clear();
    // 1) the Algorithm wanted more show
    if (st.want > 0 && quota() > 0) {
      const ok = extraCreature();
      st.want = 0;
      if (ok) game.later(() => { if (run()?.phase === 'moon') sayAll('Ratings are up. Tomorrow needs more show.'); }, 7000);
    }
    // 2) ghosts of earlier deaths on this moon
    S.live = [];
    const en = entrance(), fac = facOf();
    const dead = K.takeGhosts(st, r.moon, r.day | 0);
    if (dead.length && en && fac) {
      const pool = [...(fac.ventSpots || []), ...(fac.scrapSpots || []).filter((q) => !q.elevated && !q.sealed)];
      const anchors = K.chooseAnchors(dead, pool, en);
      dead.forEach((g, i) => { const s = anchors[i]; if (s) S.live.push({ ...g, a: [s.x, s.y, s.z] }); });
      if (S.live.length) {
        send({ k: 'gh', list: S.live.map(wireGhost) });
        S.biasT = 8;
        for (const g of S.live) if (g.loot > 0) { try { game.hostSpawnRandomScrap?.(new V3(g.a[0] + 1.2, g.a[1] + 0.5, g.a[2])); } catch { /* cache is optional */ } }
        game.later(() => { if (run()?.phase === 'moon' && S.live[0]) sayAll('A ghost of {name} walks here again. The creatures remember.', { name: S.live[0].name }); }, 12000);
      }
    }
  }
  offs.push(mods.on('moonPopulated', (g) => { if (!g || g === game) { try { hostPopulated(); } catch (e) { console.warn('[algo2] populate', e); } } }));

  // ------------------------------------------------------------ extraction payout (host, wraps hostFinishTakeoff)
  wrap(game, 'hostFinishTakeoff', (orig) => function (...a) {
    let pay = null;
    try {
      if (host() && enabled() && run()?.phase === 'takeoff' && !MOONS[run().moon]?.company && !MOONS[run().moon]?.home && facOf()) {
        const aboard = (game.aiPlayers?.() || []).filter((p) => !p.dead && p.inShip);
        const now = game.time || 0;
        const late = aboard.some((p) => S.outT.has(p.id) && K.isLateExtract(run().time, game.config?.dayLengthSec || 720, now - S.outT.get(p.id)));
        if (late && aboard.length) hype('late_extract');
        const tier = K.tierOf(S.hype.h);
        const p = K.payout(tier, { aboard: aboard.length, quotaIndex: quota() });
        if (p.coin > 0) pay = { ids: aboard.map((q) => q.id), ...p };
        const st = a2();
        if (st) { st.want = K.wantMore(tier, quota()); }
      }
    } catch (e) { console.warn('[algo2] payout', e); }
    const res = orig.apply(this, a);
    try { if (pay) send({ k: 'pay', ids: pay.ids, tier: pay.tier, coin: pay.coin, xp: pay.xp, crate: pay.crate }); } catch { /* net closing */ }
    return res;
  });
  function receivePay(m) {
    const names = ['', t('BRONZE'), t('SILVER'), t('GOLD')];
    try {
      if (m.coin) game.progress?.addCoins?.(m.coin, 'Live stream bonus');
      if (m.xp) game.progress?.addXp?.(m.xp, 'Live stream bonus');
      game.ui?.hud?.toast?.(tf('The audience loved that. {t} tier: {n} Clout each.', { t: names[m.tier] || '', n: m.coin }), 'good');
      if (m.crate && game.profile) {
        grantCrate(game.profile, m.crate.kind, 'sponsor', m.crate.tier ? { tier: m.crate.tier } : {});
        game.progress?.save?.();
        game.later?.(() => game.ui?.hud?.toast?.(t('Sponsor drop: a crate is waiting in DAILY [B].'), 'good'), 1800);
      }
    } catch (e) { console.warn('[algo2] pay', e); }
  }

  // ------------------------------------------------------------ glitches
  function planGlitches() {
    const fac = facOf(), en = entrance();
    if (!fac || !en) return [];
    const pool = [...(fac.scrapSpots || []).filter((q) => !q.elevated && !q.sealed), ...(fac.ventSpots || [])];
    if (pool.length < 3) return [];
    const rng = rngFor(0x61177c4);
    return K.planGlitches(pool, en, quota(), () => rng.next());
  }
  function ensureGlitches() {
    const fac = facOf(), r = run();
    const key = `${r.seed}:${r.day}`;
    if (S.glKey === key && S.glFac === fac) return;
    S.glKey = key; S.glFac = fac;
    S.gl = enabled() && game.config?.algo2Glitch !== false ? planGlitches() : [];
    S.ps = K.newPatch();
    if (host()) { const st = a2(); S.ps.meter = K.landingMeter(st?.patch | 0); if (st) st.patch = S.ps.meter; }
    view.setGlitches(fac?.group, S.gl);
    if (host()) send({ k: 'g', meter: S.ps.meter, patched: 0, used: [], wall: 0 });
  }
  function hostUse(d, from) {
    if (!enabled() || !inFacilityDay()) return;
    const gl = S.gl.find((g) => g.id === d.id), p = game.aiPlayerById?.(from);
    if (!gl || !p || p.dead || S.ps.patched) return;
    const ends = gl.to ? [gl, gl.to] : [gl];
    const near = ends.find((e) => Math.hypot(p.pos.x - e.x, p.pos.z - e.z) < K.GLITCH.reach + 1.5 && Math.abs(p.pos.y - e.y) < 3);
    if (!near) return;
    let item = null;
    if (gl.type === 'dup') {
      item = game.items?.get?.(d.item);
      if (!item || item.holder !== from || !isSellable(item.def) || item.soulbound || item.type === 'body') return;
    }
    const r = K.useGlitch(S.ps, gl);
    if (!r.ok) return;
    if (gl.type === 'wall') {
      const dest = near === gl ? gl.to : gl;
      const dx = dest.x - near.x, dz = dest.z - near.z;
      send({ k: 'tp', to: from, p: [dest.x, dest.y + 0.05, dest.z], yaw: Math.atan2(-dx, -dz) });
    } else if (gl.type === 'dup') {
      game.items.hostSpawn(item.type, new V3(gl.x, gl.y + 1.3, gl.z), { value: item.value, baseValue: item.baseValue, linvel: [0, 1.5, 0] });
      game.net.sendTo?.(from, 'sys', sysMsg('The shelf coughs up a copy.', {}, 'good'));
    } else {
      let n = 0;
      for (const c of game.creatures?.host?.values?.() || []) {
        if (c.dead || c.def?.boss || c.zone !== 'in') continue;
        if (Math.hypot(c.pos.x - gl.x, c.pos.z - gl.z) > K.GLITCH.freezeR) continue;
        c.stunT = Math.max(c.stunT || 0, K.GLITCH.freezeSec); if (c.state !== 'stunned') c.setState?.('stunned'); c.path = null; n++;
      }
      send({ k: 'fz', p: [gl.x, gl.y, gl.z], n });
    }
    const st = a2(); if (st) st.patch = S.ps.meter;
    send({ k: 'g', meter: S.ps.meter, patched: r.patched ? 1 : 0, used: Object.keys(S.ps.used), wall: S.ps.wall });
    hype('glitch');
    if (r.patched) doPatch();
  }
  function doPatch() {
    S.gl = [];
    sayAll('I saw that. I am patching the building. Do not move.');
    game.later(() => {
      if (run()?.phase !== 'moon') return;
      const st = a2(); if (st) st.patch = 0;
      let kind = K.punishment(quota(), rngFor(0x7a7c).next());
      if (kind === 'lights' && !run().powerOn) kind = 'swarm';   // already dark (blackout day): make it a swarm instead
      if (kind === 'lights') {
        sayAll('Rebooting the lights. Please hold.');
        game.hostSetPower?.(false);
        game.later(() => { if (run()?.phase === 'moon' && !run().powerOn) game.hostSetPower?.(true); }, K.GLITCH.punishLightsSec * 1000);
        return;
      }
      if (quota() <= 0) return;
      sayAll('Compliance swarm dispatched.');
      let tb; try { tb = spawnTable(moonOf(), 'in', run()); } catch { tb = {}; }
      const ids = Object.keys(tb || {}).filter((id) => tb[id] > 0 && CREATURES[id] && !CREATURES[id].hazard && !CREATURES[id].boss && CREATURES[id].zone !== 'out' && CREATURES[id].power > 0 && CREATURES[id].power <= 2 && id !== 'leech' && id !== 'jester' && id !== 'mimic');
      if (!ids.length) return;
      const n = K.GLITCH.swarmN[0] + (rngFor(0x5a).next() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) game.hostSpawnCreatureIndoor?.(ids[i % ids.length]);
      const p0 = (game.aiPlayers?.() || []).find((p) => !p.dead && !p.inShip);
      if (p0) game.creatures?.noise?.(p0.pos.clone(), 0.9, null);
    }, 3500);
  }
  function doTeleport(m) {
    try {
      game.player.teleport(new V3().fromArray(m.p), m.yaw);
      game.psTimer = 0;
      game.audio?.play?.('ui_notify', { volume: 0.5 });
    } catch (e) { console.warn('[algo2] tp', e); }
  }

  // local interactables (E) on the glitches
  offs.push(mods.on('interactables', (out, g) => {
    if (g !== game || disposed || !enabled() || !S.gl.length || S.ps.patched || !game.player || game.player.dead || !inFacilityDay()) return;
    const pp = game.player.pos;
    const req = (id, extra) => { try { game.net.request('a2req', { op: 'use', id, ...extra }); } catch { /* net closing */ } };
    for (const gl of S.gl) {
      if (gl.type !== 'wall' && S.ps.used[gl.id]) continue;
      if (gl.type === 'wall' && S.ps.wall >= K.PATCH.wallMaxUses) continue;
      for (const e of gl.to ? [gl, gl.to] : [gl]) {
        if (Math.hypot(pp.x - e.x, pp.z - e.z) > 7 || Math.abs(pp.y - e.y) > 3) continue;
        const pos = new V3(e.x, e.y + 1.1, e.z);
        const sub = () => tf('PATCH {n}%', { n: S.ps.meter });
        if (gl.type === 'wall') out.push({ pos, r: 1.1, reach: K.GLITCH.reach, label: () => t('Step through the glitch [E]'), sub: () => t('The wall is not there. Every use raises the PATCH meter.') + '  ' + sub(), action: () => req(gl.id) });
        else if (gl.type === 'freeze') out.push({ pos, r: 0.8, reach: K.GLITCH.reach, label: () => t('Touch the frozen pixel [E]'), sub: () => t('Freezes creatures nearby for 5 s. Once.') + '  ' + sub(), action: () => req(gl.id) });
        else {
          const held = () => game.player?.heldItem?.();
          out.push({ pos, r: 1.0, reach: K.GLITCH.reach, label: () => { const h = held(); return h && isSellable(h.def) && !h.soulbound ? tf('Duplicate {item} [E]', { item: t(h.def.name || h.type) }) : t('Duplication shelf'); }, sub: () => t('Hold a scrap item to duplicate it (once).') + '  ' + sub(),
            action: () => { const h = held(); if (h && isSellable(h.def) && !h.soulbound && h.type !== 'body') req(gl.id, { item: h.id }); else game.ui?.hud?.toast?.(t('Hold up. A scrap item in hand first.'), 'warn'); } });
        }
      }
    }
  }));

  // ------------------------------------------------------------ fake chat + hype panel (client)
  function ensureUi() {
    if (box || typeof document === 'undefined') return;
    style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    box = hudDock('left', 'a2feed', 30);
    box.className += ' a2-feed';
    box.classList.add('off');
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function chat(kind) {
    if (!feedOn() || !enabled()) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    if (!S.chatGate(now)) return;
    S.chatLines.push({ h: HANDLES[Math.floor(Math.random() * HANDLES.length)], l: chatLine(kind, getLang(), Math.random()) });
    if (S.chatLines.length > 4) S.chatLines.shift();
    paintFeed();
  }
  function paintFeed() {
    ensureUi(); if (!box) return;
    const r = run();
    const show = feedOn() && enabled() && !!r && (r.phase === 'moon' || r.phase === 'landing' || r.phase === 'takeoff') && !moonOf()?.company && !moonOf()?.home;
    box.classList.toggle('off', !show);
    if (!show) return;
    const tier = S.hs.tier, col = TIER_COL[tier] || TIER_COL[0];
    const segs = K.HYPE.tiers[3];
    const on = Math.min(10, Math.round((S.hs.h / segs) * 10));
    const bar = Array.from({ length: 10 }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('');
    const tn = tier ? t(['', 'BRONZE', 'SILVER', 'GOLD'][tier]) : '-';
    const pm = S.gl.length && !S.ps.patched && S.ps.meter > 0 ? `<div class="pm">${esc(tf('PATCH {n}%', { n: S.ps.meter }))}</div>` : '';
    box.style.setProperty('--tc', col);
    box.innerHTML = `<div class="hd"><span>${esc(t('LIVE CHAT'))}</span><b>${esc(t('HYPE'))} ${esc(tn)}</b></div><div class="bar">${bar}</div>${S.chatLines.map((c) => `<div class="ln"><u>${esc(c.h)}</u>${esc(c.l)}</div>`).join('')}${pm}`;
  }

  // ------------------------------------------------------------ phases + update
  offs.push(mods.on('phase', (ph, g) => {
    if (g && g !== game) return;
    if (ph === 'orbit' || ph === 'fired' || ph === 'takeoff') { if (ph !== 'takeoff') { view.clearGhosts(); view.clearGlitches(); S.gl = []; S.glKey = null; S.glFac = null; S.live = []; S.ps = K.newPatch(); } }
    if (ph === 'orbit') { S.chatLines = []; S.hs = { h: 0, tier: 0 }; }
    paintFeed();
  }));
  offs.push(mods.on('update', (dt, g) => {
    if (disposed || (g && g !== game)) return;
    const r = run();
    if (!r) return;
    try {
      if (inFacilityDay() && enabled()) {
        S.tickT += dt;
        if (S.tickT > 1 || S.glKey === null) { S.tickT = 0; ensureGlitches(); }
        if (host()) hostTick(dt);
      }
      const cam = game.camera?.position || game.player?.pos;
      if (cam) view.update(dt, cam);
      // ambient chatter
      S.ambT -= dt; S.chatT += dt;
      if (S.ambT <= 0) { S.ambT = 9 + Math.random() * 9; if (r.phase === 'moon') chat('ambient'); }
      if (S.chatT > 3) { S.chatT = 0; paintFeed(); }
    } catch (e) { if (!S.warned) { S.warned = true; console.warn('[algo2] update', e); } }
  }));

  return {
    state: S, view,
    /** debug helpers (headless scripts): hype('dodge'), plan glitches now, ghost store */
    debug: { hype, ensureGlitches, glitches: () => S.gl, patch: () => S.ps, ghosts: () => S.live, store: () => a2(), chat, hostUse, hostPopulated },
    dispose() {
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      try { boundNet?.off?.('msg:a2s', onMsg); } catch { /* ignore */ }
      view.dispose(); box?.remove(); style?.remove(); box = style = null;
    },
  };
}

export { CHAT };
