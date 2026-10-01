// FACILITY CRISES (wave 11, module 'events11'; docs/wave11/events11.md). Four mid-run crises, at most ONE per landing, rolled by the host (events11_core.js, node-tested):
//   lockdown  SECURITY BREACH  every ordinary door seals (red straps, "SEALED"); hold E on 3 security terminals (loud: creatures hear it) to reopen. A terminal frees its own
//                              sector + the doors around it, so the chain always opens; creatures run 25 % faster until it lifts. Pays credits + XP.
//   flood     RISING WATER     the low sectors fill over 90 s (a water volume + wading slow via the set-piece water zones); a head under water drowns after 7 s of air.
//                              Catwalks, stairs, crates stay dry. Loose loot floats up and drifts; debris scrap spawns in the wet sectors.
//   power     POWER REROUTE    brown-out (emitter flicker + dimmer): flip 3 breaker panels from the lowest load to the highest (or the reverse, the HUD says which); a wrong
//                              flip surges, resets and calls creatures; every live panel buzzes and pulls creatures in. Solved: lights back + the vault (or a treasure room / a crate) opens.
//   viral     VIRAL MOMENT     the Algorithm picks one living player: for 60 s every creature hunts them (playersFor + a noise ping), everything they secure in the ship is worth x3.
// Extends: facilitysys keeps its own blackout / lockdown set pieces (this module never runs at the same time as those and never touches run.fac); doors use game.hostSetDoor +
// the 'door' net message; creature speed uses creatures.speedMul (like algo1); targeting wraps creatures.playersFor; HUD lines use the 'objectives' hook.
// State = game.run.ev11 = { key, plan: { id, at, done }, live: null | { id, rev, st, el, ...per crisis } } (host-authoritative, auto-synced by broadcastRun, late joiners read it).
// Net (prefix 'ev11'): 'ev11req' client -> host {op: hb|he|hd|flip, i, k}; 'ev11fx' host -> all {k: end|surge|ok|x3|free}; 'ev11t' host -> all {key, el} once a second.
import * as THREE from 'three';
import { RNG, hashString } from '../core/rng.js';
import { HOST_ONLY } from '../net/session.js';
import { hudDock } from '../ui/dock.js';
import { G } from '../physics/physics.js';
import { ITEMS, isSellable } from './items.js';
import { MOONS } from './moons.js';
import { fallbackChestLoot } from './chests.js';
import * as C from './events11_core.js';
import { x, xf } from './events11_text.js';
import * as FX from './events11_fx.js';

HOST_ONLY.add('ev11fx'); HOST_ONLY.add('ev11t');
const UP = new THREE.Vector3(0, 1, 0);
const SPARK = { count: 7, color: [0xfff2c0, 0xffb040, 0x60c8ff], speed: 3.6, up: 1.4, life: 0.35, size: 0.05, gravity: 8, drag: 2 };

export function installEvents11(game) {
  const mods = game.mods;
  if (!mods) return null;
  const offs = [], restores = [], timers = [], sounds = [];
  let disposed = false, time = 0, lastNet = null, streaming21=false;
  const deep21=()=>streaming21 || (game.run?.descent21?.depth|0)>0;
  const hasDom = typeof document !== 'undefined';

  // ------------------------------------------------------------------------------------------------ small helpers
  const isHost = () => !!game.isHost;
  const run = () => game.run;
  const fac = () => deep21()?null:game.world?.facility || null;
  const evd = () => run()?.ev11 || null;
  const live = () => { const e = evd(); return e && e.live && e.live.st === 'run' ? e.live : null; };
  const bcast = () => { try { game.broadcastRun?.(['ev11']); } catch { /* net closing */ } };
  const later = (fn, ms) => { const id = setTimeout(() => { const i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1); if (!disposed) fn(); }, ms); timers.push(id); return id; };
  const say = (s, kind = 'info') => { try { game.ui?.toast?.(s, kind); } catch { /* ui optional */ } };
  const big = (a, b = '') => { try { game.ui?.hud?.bigText?.(a, b); } catch { /* hud optional */ } };
  const algo = (text) => { try { game.lore?.say?.(text, { cls: 'danger', ttl: 12 }); } catch { /* the ticker is optional */ } };
  const nameOf = (id) => { try { return game.playerName(id); } catch { return 'Someone'; } };
  const posOf = (id) => (id === game.selfId ? game.player?.pos : game.remotes?.get(id)?.pos);
  const alive = () => (game.aiPlayers?.() || []).filter((p) => !p.dead);
  const snd = (name, opts = {}) => { try { return mods.api?.playSound?.(name, opts) || null; } catch { return null; } };
  const sndAt = (name, pos, vol = 0.8, extra = {}) => snd(name, { pos, volume: vol, refDistance: 3, maxDistance: 40, rolloff: 1.4, occlude: true, ...extra });
  const wrap = (obj, name, make) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w;
    restores.push(() => { if (obj[name] === w) { if (had) obj[name] = orig; else delete obj[name]; } });
  };
  const req = (op, extra = {}) => { try { game.net?.request?.('ev11req', { op, k: evd()?.key, ...extra }); } catch { /* net closing */ } };
  const fx = (d) => { try { game.net.broadcast('ev11fx', d); } catch { /* net closing */ } };
  const floorY = () => fac()?.layout?.y ?? -300;
  const cellCentre = (c, L) => ({ x: L.ox + ((c % L.w) + 0.5) * L.cell, z: L.oz + (((c / L.w) | 0) + 0.5) * L.cell });

  if (mods.api?.registerSound) for (const [name, gen] of Object.entries(FX.SOUNDS)) { try { mods.api.registerSound(name, gen); sounds.push(name); } catch { /* optional */ } }
  const ov = FX.createOverlays();

  // bottom dock bar (hold-E progress / air), same look as secureloot's
  let box = null;
  if (hasDom) { try { box = hudDock('bottom', 'events11', 14); box.style.cssText = 'display:none;min-width:280px;font-family:var(--font);font-size:22px;color:#ffe9b8;text-align:center;text-shadow:0 0 8px rgba(255,190,80,.5)'; } catch { box = null; } }
  let barOn = false;
  function setBar(text, u, col = 'linear-gradient(90deg,#ff8a3d,#ffd23f)') {
    if (!box) return;
    if (text == null) { if (barOn) { box.style.display = 'none'; barOn = false; } return; }
    barOn = true; box.style.display = 'block';
    box.innerHTML = `${text}<div style="height:8px;margin-top:4px;background:rgba(255,255,255,.12);border:1px solid rgba(255,190,70,.5)"><div style="height:100%;width:${Math.round(Math.max(0, Math.min(1, u)) * 100)}%;background:${col}"></div></div>`;
  }

  // ================================================================================================ HOST
  const H = { moonT: 0, tryAt: 0, el: 0, tickT: 0, tSend: 0, buzzT: 0, pingT: 0, hack: new Map(), sec: null, stuck: new Map(), freeSet: new Set(), x3: new Set(), sealedCache: null, actT: 0 };
  const rngFor = (salt) => { const r = run(); return new RNG(hashString(`${r?.runId}|${r?.day}|${r?.moon}|ev11|${salt}`)); };

  function hostArm() {
    if(deep21())return;
    const r = run();
    if (!r || !isHost()) return;
    const moon = MOONS[r.moon];
    if (!moon || !game.world?.moonId || game.world.company) { r.ev11 = null; bcast(); return; }
    const key = `${r.runId}|${r.day}|${r.moon}`;
    H.moonT = 0; H.tryAt = 0; H.hack.clear(); H.stuck.clear(); H.freeSet.clear(); H.x3.clear(); H.sec = null; H.el = 0;
    if (r.ev11?.key === key && r.ev11.plan) { if (r.ev11.live) r.ev11.live = null; bcast(); return; }   // a reload of the same landing keeps its roll (a running crisis is not resumed)
    const F = fac();
    const plan = C.rollCrisis({ runId: r.runId, day: r.day, moon: r.moon, quotaIndex: r.quotaIndex | 0, facility: !!F?.layout?.cells && !!F.doors?.length });
    r.ev11 = { key, plan: plan ? { ...plan, done: 0 } : { id: null, at: 0, done: 1 }, live: null };
    bcast();
  }

  /** can this crisis start now? (host) */
  function canStart(id) {
    const r = run(), F = fac();
    if (!r || r.phase !== 'moon') return false;
    if (r.fac && (r.fac.ev || r.fac.lock > 0 || r.fac.extraction || r.fac.alarm > 0)) return false;   // facilitysys has its own set piece going
    const ps = alive();
    if (!ps.length) return false;
    if (id === 'viral') return true;
    if (!F?.layout?.cells || !ps.some((p) => p.zone === 'in' && !p.inShip)) return false;
    return true;
  }

  function hostStart(id, force = false) {
    if(deep21())return false;
    const r = run();
    if (!r?.ev11 || r.ev11.live) return false;
    if (!force && !canStart(id)) return false;
    if (force && !alive().length) return false;
    const L = { id, rev: 1, st: 'run', el: 0 };
    H.el = 0; H.hack.clear(); H.stuck.clear(); H.freeSet.clear(); H.x3.clear(); H.sec = null; H.tSend = 0; H.buzzT = 0; H.pingT = 0; H.actT = 0;
    let ok = false;
    try {
      if (id === 'lockdown') ok = initLockdown(L);
      else if (id === 'flood') ok = initFlood(L);
      else if (id === 'power') ok = initPower(L);
      else if (id === 'viral') ok = initViral(L);
    } catch (e) { console.warn('[events11] start', id, e); ok = false; }
    if (!ok) return false;
    r.ev11.plan = { ...(r.ev11.plan || {}), id, done: 1 };
    r.ev11.live = L;
    bcast();
    return true;
  }

  function hostEnd(ok, why = '') {
    const r = run(), L = r?.ev11?.live;
    if (!L) return;
    const id = L.id;
    const ps = alive();
    const left = id === 'lockdown' ? 1 - L.el / C.LOCK.cap : id === 'power' ? 1 - L.el / C.POWER.cap : 0;
    const pay = ok ? C.payout(id, r.quotaIndex | 0, left) : { credits: 0, xp: 0, coin: 0 };
    if (id === 'lockdown') unseal(L, L.sealed || []);
    if (ok && pay.credits) { r.credits = (r.credits | 0) + pay.credits; try { game.broadcastRun?.(['credits']); } catch { /* ignore */ } }
    if (ok && pay.xp) {
      const reason = { lockdown: 'ld.reason', flood: 'fl.reason', power: 'pw.reason', viral: 'vr.reason' }[id];
      const targets = id === 'viral' ? ps.filter((p) => p.id === L.who) : ps;
      for (const p of targets) game.net.broadcast('xp', { to: p.id, xp: pay.xp, coin: pay.coin, reason: x(reason) });
    }
    fx({ k: 'end', id, ok: !!ok, why, c: pay.credits | 0, who: L.who || null });
    r.ev11.live = null;
    r.ev11.last = { id, ok: !!ok };
    H.hack.clear();
    bcast();
  }

  // ---- lockdown ----
  const sealable = (F) => (F.doors || []).filter((d) => d.kind === 'door' && !d.treasure && !d.info?.arena && !d.info?.shortcut && !d.teleport && d.info?.key !== undefined);
  function sectorsOf(F, sealedIds) {
    const keys = new Set();
    for (const id of sealedIds) { const d = game.doorById(id); if (d?.info) keys.add(d.info.key); }
    return C.sectors(F.layout, keys);
  }
  function initLockdown(L) {
    const F = fac(), lay = F.layout, rng = rngFor('lock' + hashString(String(time | 0)));
    const doors = sealable(F);
    if (doors.length < 3) return false;
    const sec = C.sectors(lay, new Set(doors.map((d) => d.info.key)));
    if (sec.n < 2) return false;
    const starts = alive().filter((p) => p.zone === 'in' && !p.inShip).map((p) => sec.comp[F.cellAt(p.pos.x, p.pos.z)]);
    const ent = lay.entrance?.room;
    if (ent && (alive().some((p) => p.zone === 'out') || !starts.length)) starts.push(sec.comp[lay.idx(ent.cx, ent.cz)]);
    const spots = (F.scrapSpots || []).filter((s) => !s.sealed && !s.elevated && s.room >= 0 && !lay.rooms[s.room]?.arena && !['vault', 'core', 'generator'].includes(lay.rooms[s.room]?.type) && F.nav.walkableAt(s.x, s.z))
      .map((s) => ({ x: s.x, y: s.y, z: s.z, room: s.room, c: sec.comp[F.cellAt(s.x, s.z)] }));
    const plan = C.planTerminals(sec, spots, starts, rng, 3);
    if (plan.length < 3) return false;
    L.terms = plan.map((p, i) => ({ x: +p.spot.x.toFixed(2), y: +p.spot.y.toFixed(2), z: +p.spot.z.toFixed(2), c: p.c, yaw: +(rng.float(0, 4)).toFixed(0) * Math.PI / 2, done: 0, w: 0 }));
    L.sealed = doors.map((d) => d.id);
    L.pre = doors.filter((d) => d.locked).map((d) => d.id);
    L.free = [];
    H.sec = sec;
    for (const d of doors) game.net.broadcast('door', { id: d.id, open: false, locked: true, silent: true });
    fx({ k: 'snd', s: 'blast_door' });
    return true;
  }
  function unseal(L, ids) {
    const F = fac();
    if (!F) return;
    for (const id of ids) {
      if (H.freeSet.has(id)) continue;
      H.freeSet.add(id);
      if (!L.free.includes(id)) L.free.push(id);
      const d = game.doorById(id);
      if (!d) continue;
      const stay = L.pre?.includes(id);
      game.net.broadcast('door', { id, open: !stay, locked: !!stay, silent: false });
    }
  }
  function borderDoors(L, sec, c) {
    const F = fac(), out = [];
    for (const k of sec.border.get(c) || []) { const d = F.doorByKey?.get(k); if (d && L.sealed.includes(d.id)) out.push(d.id); }
    return out;
  }
  function hackDone(L, i, from) {
    const F = fac(), t = L.terms[i];
    if (!t || t.done) return;
    t.done = 1; t.w = 0;
    const sec = H.sec || (H.sec = sectorsOf(F, L.sealed));
    unseal(L, borderDoors(L, sec, t.c));   // every door on the edge of the terminal's sector
    L.rev++;
    const n = L.terms.filter((q) => q.done).length;
    fx({ k: 'free', i, n, by: from, p: [t.x, t.y + 1, t.z] });
    if (n >= L.terms.length) { unseal(L, L.sealed); hostEnd(true); } else bcast();
  }
  function tickLockdown(dt, L) {
    const F = fac(), now = time;
    // hackers: a hold that stopped reporting (or walked away) ends; while it lasts creatures hear the terminal once a second
    for (const [id, h] of [...H.hack]) {
      const pp = posOf(id), t = L.terms[h.i];
      if (!pp || !t || t.done || now - h.last > 6 || Math.hypot(pp.x - t.x, pp.z - t.z) > C.LOCK.hostReach) { H.hack.delete(id); if (t && !t.done && ![...H.hack.values()].some((q) => q.i === h.i)) { t.w = 0; L.rev++; bcast(); } continue; }
      if (now - h.noiseAt >= 1) { h.noiseAt = now; try { game.creatures.noise(new THREE.Vector3(t.x, t.y + 1, t.z), C.LOCK.noise, id); } catch { /* creatures not ready */ } }
    }
    // a sector with players but no terminal and sealed borders: after a while the maintenance shutters cycle
    H.actT -= dt;
    if (H.actT <= 0) {
      H.actT = 5;
      const sec = H.sec || (H.sec = sectorsOf(F, L.sealed));
      const seenC = new Set();
      for (const p of alive()) {
        if (p.zone !== 'in' || p.inShip) continue;
        const c = sec.comp[F.cellAt(p.pos.x, p.pos.z)];
        if (c < 0 || seenC.has(c)) continue;
        seenC.add(c);
        const b = borderDoors(L, sec, c).filter((id) => !H.freeSet.has(id));
        if (!b.length || L.terms.some((t) => !t.done && t.c === c)) { H.stuck.delete(c); continue; }
        const s = (H.stuck.get(c) || 0) + 5;
        H.stuck.set(c, s);
        if (s >= C.LOCK.rescueAfter) { H.stuck.delete(c); unseal(L, b); L.rev++; bcast(); fx({ k: 'rescue' }); }
      }
    }
    if (L.el > C.LOCK.cap) { unseal(L, L.sealed); hostEnd(false, 'cap'); }
  }

  // ---- flood ----
  function initFlood(L) {
    const F = fac(), lay = F.layout, rng = rngFor('flood' + hashString(String(time | 0)));
    const catRooms = new Set((F.zones || []).filter((z) => z.type === 'catwalk').map((z) => z.room));
    const okRoom = (r) => r && !r.arena && !r.hub && !['entrance', 'vault', 'core'].includes(r.type) && (lay.distOf[lay.idx(r.cx, r.cz)] ?? 0) >= 3;
    let pool = lay.rooms.filter((r) => okRoom(r) && catRooms.has(r.id));
    if (!pool.length) pool = lay.rooms.filter(okRoom).sort((a, b) => lay.distOf[lay.idx(b.cx, b.cz)] - lay.distOf[lay.idx(a.cx, a.cz)]).slice(0, 4);
    if (!pool.length) return false;
    const sink = pool[rng.int(0, pool.length - 1)];
    const sinkCells = [];
    for (let zz = sink.z; zz < sink.z + sink.h; zz++) for (let xx = sink.x; xx < sink.x + sink.w; xx++) sinkCells.push(lay.idx(xx, zz));
    const exclude = new Set();
    for (const r of lay.rooms) if (['vault', 'core'].includes(r.type) || r.arena) for (let zz = r.z; zz < r.z + r.h; zz++) for (let xx = r.x; xx < r.x + r.w; xx++) exclude.add(lay.idx(xx, zz));
    const basin = C.pickBasin(lay, sinkCells, exclude);
    if (basin.length < 8) return false;
    L.cells = basin;
    const sc = cellCentre(lay.idx(sink.cx, sink.cz), lay);
    L.sink = [+sc.x.toFixed(1), +sc.z.toFixed(1)];
    // debris scrap in the wet sectors (it floats: the reward for going in early)
    const pickable = Object.values(ITEMS).filter((d) => d.kind === 'scrap' && Array.isArray(d.value) && d.value[1] >= 25 && d.value[1] <= 160);
    if (pickable.length) {
      const wet = basin.slice();
      for (let k = 0; k < 4 && wet.length; k++) {
        const c = wet.splice(rng.int(0, wet.length - 1), 1)[0], p = cellCentre(c, lay), d = rng.pick(pickable);
        if (!F.nav.walkableAt(p.x, p.z)) continue;
        try { game.items.hostSpawn(d.id, new THREE.Vector3(p.x, floorY() + 0.5, p.z), { valueMul: 1.4 }); } catch { /* item spawn is optional */ }
      }
    }
    fx({ k: 'snd', s: 'blast_door' });
    return true;
  }
  function tickFlood(dt, L) {
    const F = fac(), lvl = C.floodLevel(H.el);
    if (!H.wet || H.wetFor !== L) { H.wet = new Set(L.cells); H.wetFor = L; }
    if (lvl > 0.12 && game.items) {
      const fy = floorY(), sx = L.sink[0], sz = L.sink[1];
      for (const it of game.items.all()) {
        if (it.state !== 'world' || !it.body || it.ladder || it.holder || it.def?.kind === 'big' || !it.isSimulatedHere()) continue;
        const p = it.obj.position;
        if (!H.wet.has(F.cellAt(p.x, p.z))) continue;
        const y = p.y - fy;
        if (y > lvl + 0.35 || y < -1) continue;
        const v = it.body.linvel(), dx = sx - p.x, dz = sz - p.z, d = Math.hypot(dx, dz) || 1, k = Math.min(1, dt * 1.5);
        it.body.setLinvel({ x: v.x + (dx / d * 0.45 - v.x) * k, y: C.buoyVel(y, lvl), z: v.z + (dz / d * 0.45 - v.z) * k }, true);
      }
    }
    if (H.el >= C.floodTotal()) hostEnd(true);
  }

  // ---- power ----
  function initPower(L) {
    const F = fac(), lay = F.layout, rng = rngFor('power' + hashString(String(time | 0)));
    const spots = (F.scrapSpots || []).filter((s) => !s.sealed && !s.elevated && s.room >= 0 && !lay.rooms[s.room]?.arena && !['vault', 'core'].includes(lay.rooms[s.room]?.type) && F.nav.walkableAt(s.x, s.z));
    if (spots.length < 3) return false;
    const vault = (F.doors || []).find((d) => d.kind === 'vault' && !d.contain && d.locked);
    const treasure = (F.doors || []).find((d) => d.treasure && d.locked);
    const chosen = C.spreadSpots(spots, rng, 3), plan = C.planPanels(rng);
    L.pan = chosen.map((s, i) => {
      const r = lay.rooms[s.room], rc = r ? cellCentre(lay.idx(r.cx, r.cz), lay) : { x: s.x, z: s.z + 1 };
      return { x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2), ld: plan.ld[i], up: 0, yaw: +Math.atan2(rc.x - s.x, rc.z - s.z).toFixed(2) };
    });
    L.dir = plan.dir; L.ord = plan.ord; L.n = 0; L.sg = 0;
    L.rk = vault ? vault.id : treasure ? treasure.id : null;
    L.rt = vault ? 'vault' : treasure ? 'treasure' : 'crate';
    fx({ k: 'snd', s: 'power_down' });
    return true;
  }
  function solvePower(L, from) {
    const F = fac(), rk = L.rk ? game.doorById(L.rk) : null;
    if (rk) { rk.locked = false; game.hostSetDoor(rk.id, true); game.net.broadcast('door', { id: rk.id, open: true, locked: false }); }
    else {
      const p = L.pan[L.ord[2]], rng = rngFor('crate' + L.n);
      let list = null;
      try { list = game.crafting?.rollChestLoot?.('iron', rng); } catch { /* fallback below */ }
      if (!Array.isArray(list) || !list.length) list = fallbackChestLoot('iron', rng);
      list.filter((e) => e && ITEMS[e.type]).forEach((e, i, a) => {
        const ang = (i / Math.max(1, a.length)) * Math.PI * 2 + p.yaw;
        try { game.items.hostSpawn(e.type, new THREE.Vector3(p.x + Math.sin(ang) * 0.9, p.y + 0.9, p.z + Math.cos(ang) * 0.9), { tier: e.tier, linvel: [Math.sin(ang) * 1.4, 2.2, Math.cos(ang) * 1.4] }); } catch { /* optional */ }
      });
    }
    void F;
    hostEnd(true, L.rt);
  }
  function hostFlip(d, from) {
    const L = live();
    if (!L || L.id !== 'power') return;
    const i = d.i | 0, p = L.pan[i], pp = posOf(from);
    if (!p || !pp || p.up || Math.hypot(pp.x - p.x, pp.z - p.z) > C.POWER.reach + 3.5 || Math.abs(pp.y - p.y) > 3) return;
    const res = C.flip(L.ord, L.n, i);
    if (res === 'surge') {
      L.n = 0; L.sg++;
      for (const q of L.pan) q.up = 0;
      L.rev++;
      try { game.creatures.noise(new THREE.Vector3(p.x, p.y + 1, p.z), C.POWER.surgeLoud, from); } catch { /* creatures not ready */ }
      fx({ k: 'surge', i, p: [p.x, p.y + 1, p.z] });
      bcast();
    } else if (res === 'ok' || res === 'solved') {
      p.up = 1; L.n++; L.rev++;
      fx({ k: 'ok', i, n: L.n, p: [p.x, p.y + 1, p.z] });
      if (res === 'solved') solvePower(L, from); else bcast();
    }
  }
  function tickPower(dt, L) {
    H.buzzT -= dt;
    if (H.buzzT <= 0) {
      H.buzzT = C.POWER.buzzEvery;
      for (const p of L.pan) if (!p.up) { try { game.creatures.noise(new THREE.Vector3(p.x, p.y + 1, p.z), C.POWER.buzzLoud); } catch { /* creatures not ready */ } }
    }
    if (L.el > C.POWER.cap) hostEnd(false, 'cap');
  }

  // ---- viral ----
  function initViral(L) {
    const ps = alive();
    if (!ps.length) return false;
    L.who = C.pickTrending(ps.map((p) => p.id), `${run()?.runId}|${run()?.day}|${run()?.moon}`);
    L.act = 0; L.dur = C.VIRAL.dur; L.rv = C.VIRAL.reveal;
    return !!L.who;
  }
  function tickViral(dt, L) {
    const p = (game.aiPlayers?.() || []).find((q) => q.id === L.who);
    if (!p || p.dead) { hostEnd(false, 'dead'); return; }
    if (!L.act && H.el >= L.rv) { L.act = 1; L.rev++; bcast(); }
    if (!L.act) return;
    H.pingT -= dt;
    if (H.pingT <= 0 && !p.inShip) { H.pingT = C.VIRAL.ping; try { game.creatures.noise(p.pos.clone().setY(p.pos.y + 1), C.VIRAL.pingLoud, L.who); } catch { /* creatures not ready */ } }
    // x3: everything the trending player secures in the ship
    let got = 0;
    for (const it of game.items.inShipItems?.() || []) {
      if (it.lastHolder !== L.who || H.x3.has(it.id) || it.collected || !isSellable(it.def) || it.soulbound || it.type === 'body' || !(it.value > 0)) continue;
      H.x3.add(it.id);
      const v = C.viralValue(it.value);
      got += v - it.value;
      it.value = v;
      game.net.broadcast('it', { e: 'val', id: it.id, v });
    }
    if (got > 0) fx({ k: 'x3', to: L.who, v: got });
    if (H.el >= L.rv + L.dur) hostEnd(true);
  }

  // ---- host tick + requests ----
  function hostTick(dt) {
    const r = run();
    if (!r?.ev11) return;
    const e = r.ev11, L = e.live;
    if (r.phase !== 'moon') return;
    if (!L) {
      const pl = e.plan;
      if (!pl || pl.done || !pl.id) return;
      H.moonT += dt;
      if (H.moonT >= pl.at && time >= H.tryAt) {
        H.tryAt = time + C.ROLL.retry;
        if (hostStart(pl.id)) return;
        if (H.moonT > pl.at + C.ROLL.giveUp) { pl.done = 1; bcast(); }
      }
      return;
    }
    if (L.st !== 'run') return;
    H.el += dt; L.el = Math.floor(H.el);
    H.tSend -= dt;
    if (H.tSend <= 0) { H.tSend = 1; try { game.net.broadcast('ev11t', { key: e.key, el: +H.el.toFixed(2) }); } catch { /* net closing */ } }
    if (L.id === 'lockdown') tickLockdown(dt, L);
    else if (L.id === 'flood') tickFlood(dt, L);
    else if (L.id === 'power') tickPower(dt, L);
    else if (L.id === 'viral') tickViral(dt, L);
  }
  function hostReq(d, from) {
    if(deep21())return false;
    const e = evd(), L = live();
    if (!isHost() || !e || !L || d?.k !== e.key) return;
    const pp = posOf(from), pl = (game.aiPlayers?.() || []).find((q) => q.id === from);
    if (!pp || !pl || pl.dead) return;
    if (L.id === 'lockdown') {
      const i = d.i | 0, t = L.terms?.[i];
      if (!t || t.done || Math.hypot(pp.x - t.x, pp.z - t.z) > C.LOCK.hostReach || Math.abs(pp.y - t.y) > 3) return;
      if (d.op === 'hb') {
        H.hack.set(from, { i, t0: time, last: time, noiseAt: time - 1 });
        if (!t.w) { t.w = 1; L.rev++; bcast(); }
      } else if (d.op === 'he') {
        H.hack.delete(from);
        if (![...H.hack.values()].some((q) => q.i === i)) { t.w = 0; L.rev++; bcast(); }
      } else if (d.op === 'hd') {
        const h = H.hack.get(from);
        if (!h || h.i !== i || time - h.t0 < C.LOCK.hold * 0.7) return;
        H.hack.delete(from);
        hackDone(L, i, from);
      } else if (d.op === 'hp') { const h = H.hack.get(from); if (h && h.i === i) h.last = time; }
    } else if (L.id === 'power' && d.op === 'flip') hostFlip(d, from);
  }

  // ================================================================================================ CLIENT (every peer, host included)
  const Cl = { k: '', id: '', rev: -1, fac: null, m: null, T: { el: 0, at: 0, key: '' }, seen: new Set() };
  const elNow = () => (isHost() ? H.el : Cl.T.el + (time - Cl.T.at));

  function stopClient() {
    try { Cl.m?.stop?.(); } catch (e) { console.warn('[events11] stop', e); }
    Cl.m = null; Cl.id = ''; Cl.rev = -1; Cl.fac = null;
    setBar(null); ov?.wet(0); ov?.dark(0); ov?.viral(false);
  }
  function startClient(L, F) {
    Cl.id = L.id; Cl.k = evd()?.key || ''; Cl.rev = L.rev; Cl.fac = F;
    Cl.T = { el: L.el || 0, at: time, key: Cl.k };
    const fresh = (L.el || 0) < 4;
    if (L.id === 'lockdown') Cl.m = clientLockdown(L, F, fresh);
    else if (L.id === 'flood') Cl.m = clientFlood(L, F, fresh);
    else if (L.id === 'power') Cl.m = clientPower(L, F, fresh);
    else if (L.id === 'viral') Cl.m = clientViral(L, fresh);
  }
  function syncClient() {
    const L = live(), F = fac();
    const need = L && (L.id === 'viral' || (F && F.layout && game.world?.moonId));
    if (!L || !need || run()?.phase !== 'moon') { if (Cl.id) stopClient(); return; }
    if (Cl.id !== L.id || Cl.k !== evd()?.key || (L.id !== 'viral' && Cl.fac !== F)) { if (Cl.id) stopClient(); startClient(L, F); return; }
    if (Cl.rev !== L.rev) { Cl.rev = L.rev; try { Cl.m?.refresh?.(L); } catch (e) { console.warn('[events11] refresh', e); } }
  }

  const interactLists = [];   // per-crisis interactable providers (list, player)
  const tag = (fn, key) => Object.assign(fn, { __ev: key });

  // ---- lockdown (client) ----
  function clientLockdown(L, F, fresh) {
    const lay = F.layout, fy = lay.y, terms = [], cols = [];
    const straps = FX.createSealStraps(L.sealed.map((id) => game.doorById(id)).filter((d) => d && !L.free.includes(d.id)), fy);
    F.group.add(straps.group);
    L.terms.forEach((t, i) => {
      const m = FX.createTerminalModel();
      m.root.position.set(t.x, t.y, t.z); m.root.rotation.y = t.yaw || 0;
      F.group.add(m.root);
      try { cols.push(game.physics.addStaticBox(t.x, t.y + 0.55, t.z, 0.4, 0.55, 0.3, t.yaw || 0, G.STATIC, { kind: 'prop', id: 'ev11_term' })); } catch { /* collider optional */ }
      m.setState(t.done ? 'done' : t.w ? 'work' : 'idle');
      terms.push({ m, pos: new THREE.Vector3(t.x, t.y + 1.0, t.z) });
    });
    let hold = null, klaxon = null;
    const stopHold = (send = true) => { if (hold && send) req('he', { i: hold.i }); hold = null; setBar(null); };
    const provider = (list, p) => {
      const Lc = live();
      if (!Lc || p.dead || !p.indoor) return;
      Lc.terms.forEach((t, i) => {
        if (t.done) return;
        const dx = p.pos.x - t.x, dz = p.pos.z - t.z;
        if (dx * dx + dz * dz > 25 || Math.abs(p.pos.y - t.y) > 3) return;
        list.push({ pos: terms[i].pos, r: 0.9, reach: 2.8, label: x('ld.term'), sub: x('ld.term.sub'), action: tag(() => { if (hold) return; hold = { i, t: 0, tk: 0, pk: 0 }; req('hb', { i }); }, 'h' + i) });
      });
    };
    interactLists.push(provider);
    if (fresh) {
      big(x('ld.title'), x('ld.sub')); say(x('ld.hint'), 'warn'); algo(x('ld.algo'));
      snd('ev_klaxon', { volume: 0.3 }); game.engine?.shake?.(0.25);
    }
    return {
      refresh(Ln) {
        Ln.terms.forEach((t, i) => terms[i]?.m.setState(t.done ? 'done' : t.w ? 'work' : 'idle'));
        for (const id of Ln.free) straps.free(id);
      },
      tick(dt) {
        const Lc = live(); if (!Lc) return;
        straps.tick(time);
        terms.forEach((q, i) => q.m.tick(dt, time));
        const p = game.player;
        if (hold) {
          const tgt = game.interactTarget;
          const ok = game.input?.isDown('interact') && tgt?.action?.__ev === 'h' + hold.i && !p.dead && !game.minigame && !Lc.terms[hold.i]?.done;
          if (!ok) stopHold();
          else {
            hold.t += dt; hold.pk += dt;
            if (hold.pk > 2) { hold.pk = 0; req('hp', { i: hold.i }); }
            const k = Math.floor(hold.t / 0.35);
            if (k !== hold.tk) { hold.tk = k; snd('ev_beep', { volume: 0.35, pitch: 0.9 + 0.1 * (k % 3) }); }
            setBar(x('ld.hacking'), hold.t / C.LOCK.hold);
            if (hold.t >= C.LOCK.hold) { const i = hold.i; hold = null; setBar(null); req('hd', { i }); }
          }
        }
        const want = p.indoor && !p.dead;
        if (want && !klaxon) klaxon = snd('ev_klaxon', { volume: 0.12, loop: true });
        else if (!want && klaxon) { try { klaxon.stop?.(0.3); } catch { /* ignore */ } klaxon = null; }
      },
      objectives(add) {
        const Lc = live(); if (!Lc) return;
        const n = Lc.terms.filter((t) => t.done).length;
        add(xf('ld.obj', { n }), 'warn', false, n / 3);
        add(x('ld.hint'), 'hint');
      },
      stop() {
        stopHold();
        try { klaxon?.stop?.(0.2); } catch { /* ignore */ }
        const i = interactLists.indexOf(provider); if (i >= 0) interactLists.splice(i, 1);
        for (const c of cols) { try { game.physics.removeCollider(c); } catch { /* world gone */ } }
        for (const q of terms) { q.m.root.removeFromParent(); q.m.dispose(); }
        straps.dispose();
      },
    };
  }

  // ---- flood (client) ----
  function clientFlood(L, F, fresh) {
    const lay = F.layout, fy = lay.y, basin = new Set(L.cells), edges = C.basinEdges(lay, L.cells);
    const water = FX.createWaterMesh(lay, L.cells, edges, fy);
    F.group.add(water.mesh);
    const zones = [];
    for (const c of L.cells) {
      const cc = cellCentre(c, lay), z = { type: 'water', min: [cc.x - lay.cell / 2, cc.z - lay.cell / 2], max: [cc.x + lay.cell / 2, cc.z + lay.cell / 2], y: fy - 9, room: -1, ev11: 1 };
      zones.push(z); F.zones?.push(z);
    }
    let air = C.FLOOD.air, dmgT = 0, under = false, rumble = null, lvl = 0;
    if (fresh) { big(x('fl.title'), x('fl.sub')); say(x('fl.hint'), 'warn'); algo(x('fl.algo')); snd('ev_rumble', { volume: 0.7 }); game.engine?.shake?.(0.4); }
    return {
      refresh() { /* level comes from the shared clock */ },
      tick(dt) {
        const el = elNow(); lvl = C.floodLevel(el);
        water.setLevel(lvl, time);
        const y = fy + lvl, slow = lvl >= C.FLOOD.slowFrom;
        for (const z of zones) z.y = slow ? y : fy - 9;
        const p = game.player, cell = F.cellAt(p.pos.x, p.pos.z), inB = p.indoor && basin.has(cell);
        const eye = p.pos.y + (p.eye || 1.62) - fy;
        const sub = inB && !p.dead && C.submerged(eye, lvl);
        if (sub && !under) { game.sfx?.('fish_splash', 0.7); }
        else if (!sub && under && lvl > 0.3) game.sfx?.('fish_splash', 0.5);
        under = sub;
        if (sub) {
          air = Math.max(0, air - dt);
          if (air <= 0) { dmgT -= dt; if (dmgT <= 0) { dmgT = 1; game.damageLocal?.(C.FLOOD.dps, 'drown', null); } }
        } else { air = Math.min(C.FLOOD.air, air + dt * 3); dmgT = 0.5; }
        ov?.wet(sub ? 1 : 0);
        if (sub || air < C.FLOOD.air - 0.05) setBar(air > 0 ? xf('fl.air', { s: Math.ceil(air) }) : x('fl.air0'), air / C.FLOOD.air, air > 2 ? 'linear-gradient(90deg,#3aa6ff,#9fe8ff)' : 'linear-gradient(90deg,#ff4030,#ff9a70)');
        else setBar(null);
        const wantRumble = p.indoor && lvl > 0.05 && lvl < C.FLOOD.max + 0.01 && el < C.FLOOD.warn + C.FLOOD.rise;
        if (wantRumble && !rumble) rumble = snd('ev_rumble', { volume: 0.32, loop: true });
        else if (!wantRumble && rumble) { try { rumble.stop?.(0.6); } catch { /* ignore */ } rumble = null; }
      },
      objectives(add) {
        const el = elNow(), F0 = C.FLOOD, lv = x('fl.lvl' + C.depthLabel(lvl));
        if (el < F0.warn) add(xf('fl.obj.warn', { s: Math.ceil(F0.warn - el) }), 'warn', false, el / F0.warn);
        else if (el < F0.warn + F0.rise) add(xf('fl.obj.rise', { lvl: lv }), 'warn', false, (el - F0.warn) / F0.rise);
        else if (el < F0.warn + F0.rise + F0.hold) add(xf('fl.obj.hold', { lvl: lv, s: Math.ceil(F0.warn + F0.rise + F0.hold - el) }), 'warn');
        else add(xf('fl.obj.drain', { s: Math.ceil(C.floodTotal() - el) }), 'main');
        add(x('fl.hint'), 'hint');
      },
      stop() {
        try { rumble?.stop?.(0.3); } catch { /* ignore */ }
        if (F.zones) for (const z of zones) { const i = F.zones.indexOf(z); if (i >= 0) F.zones.splice(i, 1); }
        water.dispose();
      },
    };
  }

  // ---- power reroute (client) ----
  function clientPower(L, F, fresh) {
    const fy = F.layout.y, panels = [], cols = [], hums = [];
    const emit = (F.emitters || []).filter((e) => e.group === 'facility').map((e) => ({ e, i: e.intensity, f: e.flicker || 0 }));
    let look = null, surgeT = 0, dimK = 0;
    const setLook = (n, surge) => {
      const k = `${n}|${surge ? 1 : 0}`; if (k === look) return; look = k;
      const lk = C.lampLook(n, surge);
      for (const q of emit) { q.e.intensity = q.i * lk.dim; q.e.flicker = Math.max(q.f, lk.flicker); }
      dimK = 1 - lk.dim;
    };
    L.pan.forEach((p, i) => {
      const m = FX.createBreakerModel(p.ld);
      m.root.position.set(p.x, p.y, p.z); m.root.rotation.y = p.yaw || 0; m.setUp(p.up);
      F.group.add(m.root);
      try { cols.push(game.physics.addStaticBox(p.x, p.y + 0.9, p.z, 0.5, 0.9, 0.16, p.yaw || 0, G.STATIC, { kind: 'prop', id: 'ev11_panel' })); } catch { /* collider optional */ }
      panels.push({ m, pos: new THREE.Vector3(p.x, p.y + 1.0, p.z), hum: null });
    });
    setLook(L.n, false);
    const provider = (list, pl) => {
      const Lc = live();
      if (!Lc || pl.dead || !pl.indoor) return;
      Lc.pan.forEach((p, i) => {
        if (p.up) return;
        const dx = pl.pos.x - p.x, dz = pl.pos.z - p.z;
        if (dx * dx + dz * dz > 36 || Math.abs(pl.pos.y - p.y) > 3) return;
        list.push({ pos: panels[i].pos, r: 0.9, reach: 2.8, label: x('pw.panel'), sub: xf('pw.panel.sub', { n: p.ld }), action: () => req('flip', { i }) });
      });
    };
    interactLists.push(provider);
    if (fresh) { big(x('pw.title'), x(L.dir > 0 ? 'pw.sub.low' : 'pw.sub.high')); say(x('pw.hint'), 'warn'); algo(x('pw.algo')); snd('ev_surge', { volume: 0.5 }); game.sfx?.('power_down', 0.7); }
    return {
      refresh(Ln) {
        Ln.pan.forEach((p, i) => panels[i]?.m.setUp(p.up));
        setLook(Ln.n, surgeT > 0);
      },
      surge(i) {
        surgeT = 1.4; setLook(live()?.n || 0, true); panels[i]?.m.surge();
        game.engine?.shake?.(0.3);
      },
      tick(dt) {
        const Lc = live(); if (!Lc) return;
        panels.forEach((q, i) => {
          q.m.tick(dt, time, !Lc.pan[i].up);
          const d2 = game.camera ? game.camera.position.distanceToSquared(q.pos) : 1e9;
          if (!Lc.pan[i].up && d2 < 26 * 26 && !q.hum) q.hum = snd('ev_buzz', { pos: q.pos, loop: true, volume: 0.5, refDistance: 2, maxDistance: 26, rolloff: 1.5, occlude: true });
          else if ((Lc.pan[i].up || d2 > 32 * 32) && q.hum) { try { q.hum.stop?.(0.3); } catch { /* ignore */ } q.hum = null; }
        });
        if (surgeT > 0) { surgeT -= dt; if (surgeT <= 0) setLook(Lc.n, false); }
        ov?.dark(game.player?.indoor ? 0.5 * (dimK + (surgeT > 0 ? 0.4 : 0)) : 0);
      },
      objectives(add) {
        const Lc = live(); if (!Lc) return;
        add(xf(Lc.dir > 0 ? 'pw.obj.low' : 'pw.obj.high', { n: Lc.n }), 'warn', false, Lc.n / 3);
        add(x('pw.hint'), 'hint');
      },
      stop() {
        for (const q of emit) { q.e.intensity = q.i; q.e.flicker = q.f; }
        const i = interactLists.indexOf(provider); if (i >= 0) interactLists.splice(i, 1);
        for (const c of cols) { try { game.physics.removeCollider(c); } catch { /* world gone */ } }
        for (const q of panels) { try { q.hum?.stop?.(0.2); } catch { /* ignore */ } q.m.root.removeFromParent(); q.m.dispose(); }
        ov?.dark(0);
      },
    };
  }

  // ---- viral (client) ----
  function clientViral(L, fresh) {
    let tagObj = null, acted = !!L.act;
    const me = () => L.who === game.selfId;
    const banner = () => {
      const name = nameOf(L.who);
      if (me()) { big(x('vr.you'), x('vr.you.sub')); } else { big(xf('vr.other', { name }), x('vr.other.sub')); }
      algo(xf('vr.algo', { name })); snd('ev_ping', { volume: 0.7 });
    };
    if (fresh) { big(x('vr.title'), x('vr.pick')); snd('ev_ping', { volume: 0.5, pitch: 0.8 }); if (L.act) { later(banner, 1400); } }
    else if (L.act) acted = true;
    return {
      refresh(Ln) { L = Ln; if (Ln.act && !acted) { acted = true; banner(); } },
      tick() {
        const Lc = live(); if (!Lc) return;
        L = Lc;
        if (!L.act) return;
        const self = me();
        ov?.viral(self && !game.player.dead);
        if (self) { if (tagObj) { tagObj.dispose(); tagObj = null; } return; }
        const rp = posOf(L.who);
        if (!rp) return;
        if (!tagObj && game.scene) { tagObj = FX.createTrendTag(x('vr.tag')); game.scene.add(tagObj.sprite); }
        if (tagObj) tagObj.sprite.position.set(rp.x, rp.y + 2.5, rp.z);
      },
      objectives(add) {
        const Lc = live(); if (!Lc) return;
        const left = Math.max(0, Math.ceil(Lc.rv + Lc.dur - elNow()));
        if (!Lc.act) { add(x('vr.pick'), 'warn'); return; }
        add(Lc.who === game.selfId ? xf('vr.obj.self', { s: left }) : xf('vr.obj.other', { name: nameOf(Lc.who), s: left }), 'warn', false, left / Lc.dur);
      },
      stop() { tagObj?.dispose(); tagObj = null; ov?.viral(false); },
    };
  }

  // ---- messages every peer gets ----
  function onFx(d) {
    if(deep21())return false;
    if (!d) return;
    if (d.k === 'snd') { game.sfx?.(d.s, 0.8); return; }
    if (d.k === 'free') {
      say(x('ld.freed'), 'good');
      const pos = d.p ? new THREE.Vector3().fromArray(d.p) : null;
      if (pos) sndAt('ev_done', pos, 0.9, { maxDistance: 60 }); else snd('ev_done', { volume: 0.7 });
    } else if (d.k === 'rescue') { say(x('ld.rescue'), 'info'); game.sfx?.('blast_door', 0.5); }
    else if (d.k === 'surge') {
      const pos = d.p ? new THREE.Vector3().fromArray(d.p) : null;
      if (pos) { sndAt('ev_surge', pos, 1, { maxDistance: 60 }); game.particles?.burst?.(pos, SPARK); }
      Cl.m?.surge?.(d.i);
      say(x('pw.surge'), 'bad');
    } else if (d.k === 'ok') {
      const pos = d.p ? new THREE.Vector3().fromArray(d.p) : null;
      if (pos) { sndAt('ev_beep', pos, 0.8, { pitch: 0.8 + d.n * 0.2 }); game.particles?.burst?.(pos, { ...SPARK, count: 3 }); }
      say(xf('pw.ok', { n: d.n }), 'good');
    } else if (d.k === 'x3') {
      if (d.to === game.selfId) { say(xf('vr.x3', { v: d.v }), 'good'); game.sfx?.('ui_levelup', 0.5); }
    } else if (d.k === 'end') {
      const good = !!d.ok;
      if (d.id === 'lockdown') { if (good) { big(x('ld.lifted'), x('ld.lifted.sub')); if (d.c) say(xf('ld.pay', { c: d.c }), 'good'); game.sfx?.('ui_levelup', 0.5); game.sfx?.('power_up', 0.6); } else say(x('ld.fail'), 'warn'); }
      else if (d.id === 'flood') { say(x('fl.over'), 'info'); game.sfx?.('ui_notify', 0.5); }
      else if (d.id === 'power') {
        if (good) { big(x('pw.solved'), x('pw.solved.' + (d.why || 'crate'))); if (d.c) say(xf('pw.pay', { c: d.c }), 'good'); game.sfx?.('power_up', 0.9); game.sfx?.('ui_levelup', 0.5); if (d.why === 'vault') game.sfx?.('vault_open', 0.7); }
        else say(x('pw.fail'), 'warn');
      } else if (d.id === 'viral') say(x(good ? 'vr.end' : 'vr.end.dead'), 'info');
    }
  }
  function onTime(d) { if (d && d.key === evd()?.key) Cl.T = { el: +d.el || 0, at: time, key: d.key }; }

  // ================================================================================================ wiring
  function bindNet(net) {
    if (lastNet === net) return;
    lastNet = net;
    net.on_('ev11fx', (d) => { try { onFx(d); } catch (e) { console.warn('[events11] fx', e); } });
    net.on_('ev11t', (d) => onTime(d));
    net.handle('ev11req', (d, from) => { try { hostReq(d, from); } catch (e) { console.warn('[events11] req', e); } });
  }
  offs.push(mods.on('netReady', (net) => bindNet(net)));
  if (game.net) { try { bindNet(game.net); } catch { /* netReady binds it */ } }
  offs.push(mods.on('facilityWillChange',(w,g)=>{if(g!==game)return;streaming21=true;stopClient();H.sec=null;for(const t of timers.splice(0))clearTimeout(t);setBar(null); }));
  offs.push(mods.on('facilityChanged',(w,g)=>{if(g===game)streaming21=false;}));
  offs.push(mods.on('moonPopulated', (g) => { if (g === game || !g) { try { hostArm(); } catch (e) { console.warn('[events11] arm', e); } } }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g && g !== game) return;
    if (ph !== 'moon' && ph !== 'landing') {
      if (Cl.id) stopClient();
      if (isHost() && run()?.ev11) { run().ev11 = null; H.moonT = 0; bcast(); }
    }
  }));
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed || deep21()) return;
    time += dt;
    if (isHost()) { try { hostTick(dt); } catch (e) { console.warn('[events11] hostTick', e); } }
    try { syncClient(); Cl.m?.tick?.(dt); } catch (e) { console.warn('[events11] client', e); }
  }));
  offs.push(mods.on('interactables', (list, g) => {
    if (g !== game || deep21() || !Cl.m) return;
    const p = game.player;
    if (!p || p.dead) return;
    for (const f of interactLists) { try { f(list, p); } catch { /* ignore */ } }
  }));
  offs.push(mods.on('objectives', (add, g, phase) => {
    if (g !== game || disposed || phase !== 'moon' || !Cl.m || !live()) return;
    try { Cl.m.objectives?.(add); } catch { /* ignore */ }
  }));

  // sealed doors: the prompt says why; the key / lockpick prompts do not appear
  wrap(game, 'doorInteraction', (orig) => function (door) {
    const L = live();
    if (L && L.id === 'lockdown' && door && L.sealed?.includes(door.id) && !L.free?.includes(door.id)) {
      return { label: x('ld.door'), sub: x('ld.door.sub'), action: () => { try { game.audio?.at?.('door_locked', door.pos.clone().add(UP), 0.8); } catch { /* audio optional */ } } };
    }
    return orig.call(this, door);
  });
  // creatures run faster while the doors are sealed
  wrap(game.creatures, 'speedMul', (orig) => function (c, speed) {
    const s = orig.call(this, c, speed), L = live();
    return L && L.id === 'lockdown' && !c.def?.boss ? s * C.LOCK.speed : s;
  });
  // viral: every creature sees only the trending player (when they are alive and in the creature's zone)
  wrap(game.creatures, 'playersFor', (orig) => function (c) {
    const list = orig.call(this, c), L = live();
    if (!L || L.id !== 'viral' || !L.act) return list;
    const p = list.find((q) => q.id === L.who);
    return p ? [p] : list;
  });
  // a live brown-out keeps the fuse boxes from ending the puzzle: the facility's own power flag is never touched here, nothing to guard.

  // ================================================================================================ the API
  const api = {
    core: C,
    active: () => { const L = live(); return L ? L.id : null; },
    state: () => evd(),
    /** debug (host): kefal.game.events11.debug.trigger('flood' | 'lockdown' | 'power' | 'viral') starts that crisis now; .end(true|false) ends it; .plan() shows the roll */
    debug: {
      trigger(id = 'viral') {
        if (!isHost()) return 'host only';
        if (!C.IDS.includes(id)) return 'unknown crisis: ' + C.IDS.join(' | ');
        const r = run();
        if (!r || r.phase !== 'moon') return 'land on a moon first';
        if (!r.ev11) r.ev11 = { key: `${r.runId}|${r.day}|${r.moon}`, plan: { id: null, at: 0, done: 1 }, live: null };
        if (r.ev11.live) hostEnd(false, 'debug');
        return hostStart(id, true) ? 'started ' + id : 'could not start ' + id + ' (facility needed?)';
      },
      end(ok = true) { if (isHost()) hostEnd(!!ok, 'debug'); return live() ? 'ending' : 'idle'; },
      plan: () => evd()?.plan || null,
      state: () => JSON.parse(JSON.stringify(evd() || null)),
      /** flood: jump the water clock (s) */ seek(s) { if (isHost()) H.el = +s || 0; return H.el; },
      hack(i = 0) { const L = live(); if (isHost() && L?.id === 'lockdown' && L.terms[i]) { hackDone(L, i, game.selfId); return 'hacked ' + i; } return 'no lockdown'; },
      solve() { const L = live(); if (isHost() && L?.id === 'power') { solvePower(L, game.selfId); return 'solved'; } return 'no power crisis'; },
      roll: (q = 1) => C.rollCrisis({ runId: run()?.runId, day: run()?.day, moon: run()?.moon, quotaIndex: q, facility: true }),
    },
    dispose() {
      disposed = true;
      stopClient();
      for (const t of timers.splice(0)) clearTimeout(t);
      for (const off of offs.splice(0)) { try { off?.(); } catch { /* ignore */ } }
      for (const r of restores.splice(0).reverse()) { try { r(); } catch { /* ignore */ } }
      for (const n of sounds) { try { mods.soundGens?.delete(n); } catch { /* ignore */ } }
      try { box?.remove(); } catch { /* ignore */ }
      try { ov?.dispose(); } catch { /* ignore */ }
    },
  };
  return api;
}
