// HORROR module - HOST side: trap state machine + damage + refunds, requests (arm / door / crest / fake closet / chalk / herb / box / rest ...), population of the
// pockets and the facility (Shamblers, sidearm, loot, crest, Closet Thing, Forger), chalk store. Everything the crew can win or lose is decided here.
import * as THREE from 'three';
import { TRAPS, TRAP_RULES, trapPrice, killRefund, armTrap, stepTrap, trapDamageTo, laserFrac, sweepHit, zoneCoords, ChalkStore, validateDraw, forgerMove, rollFor,
  FAKE, fakeOutcome, SIDEARM, ZOMBIE, HEADSHOT_MUL, CHALK, CLOSET, encodeMark } from './horror_core.js';
import { HOOKS } from './horror_creatures.js';
import { ITEMS, scrapTableFor } from './items.js';
import { MOONS } from './moons.js';
import { scrapValueMul } from './progression.js';
import { toWorld } from './horror_closet.js';

const rnd = Math.random;
const V = new THREE.Vector3();

export function installHost(X) {
  const { g, S } = X;
  const H = { uses: 0, herbs: new Set(), secrets: new Set(), boxes: new Map(), rest: new Set(), owners: new Map(), lastChalk: new Map(), forger: null, ambusher: null, forgerT: 8, crestId: null, given: new Set() };
  S.host = H;
  const M = () => g.creatures;
  const aip = (id) => g.aiPlayerById?.(id);
  const dist2 = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  const priceNow = (T) => trapPrice(T.desc.type, { quotaIndex: g.run?.quotaIndex || 0, usesThisLanding: H.uses });
  const trapById = (uid) => S.traps.find((t) => t.uid === uid);
  const closetById = (id) => S.closets.find((c) => c.id === id);
  const now = () => g.time || 0;

  // ================================================================================ traps
  function trapsPayload() { return S.traps.map((T) => [T.uid, T.st.s, T.st.charges, Math.max(0, Math.round(T.st.until - now())), priceNow(T), T.st.arms]); }
  function sendTraps(to) { const d = { t: 'trs', a: trapsPayload() }; if (to) g.net.sendTo(to, 'hrs', d); else g.net.broadcast('hrs', d); }
  function sndAt(name, x, y, z, vol = 1, ref = 6, max = 70, pitch) { g.net.broadcast('fx', { k: 'snd', s: name, p: [+x.toFixed(1), +y.toFixed(1), +z.toFixed(1)], v: vol, r: ref, m: max, pt: pitch }); }
  function shake(T, amt) { g.net.broadcast('hrfx', { k: 'shake', p: [T.zone.cx, T.zone.y, T.zone.cz], a: amt }); }

  const victimsIn = (T, margin = 0.2) => {
    const out = [];
    const zone = { ...T.zone, len: T.zone.len + margin * 2, wid: T.zone.wid + margin };
    for (const c of M().host.values()) {
      if (c.dead || c.def.hazard || c.maxHp === null || Math.abs(c.pos.y - T.zone.y) > 3) continue;
      const zc = zoneCoords(zone, c.pos.x, c.pos.z);
      if (zc.inside) out.push({ kind: 'c', c, s: zc.s - margin, id: c.id });
    }
    for (const p of g.aiPlayers()) {
      if (p.dead || p.inShip || Math.abs(p.pos.y - T.zone.y) > 2.5) continue;
      const zc = zoneCoords(zone, p.pos.x, p.pos.z);
      if (zc.inside) out.push({ kind: 'p', p, s: zc.s - margin, id: p.id });
    }
    return out;
  };
  function hitCreature(T, v) {
    const c = v.c, c0 = { hp: c.hp, maxHp: c.maxHp, boss: c.def.boss, hazard: c.def.hazard, elite: c.elite, dead: c.dead };
    const dmg = trapDamageTo(T.desc.type, c0);
    if (dmg <= 0) return;
    const keep = { target: c.target, hitBy: c.data.hitBy, hitAt: c.data.hitAt, alarm: c.data.alarm };
    const by = T.st.by && aip(T.st.by) ? T.st.by : 'trap';
    M().damage(c.id, dmg, by, { stun: T.desc.type === 'electric' ? 0.6 : 0 });
    // the trap is not an attacker: the victims do not turn on whoever paid for it
    if (!c.dead) { c.target = keep.target; c.data.hitBy = keep.hitBy; c.data.hitAt = keep.hitAt; c.data.alarm = keep.alarm; }
    if (c.dead) {
      T.st.kills++;
      const paid = TRAPS[T.desc.type].price;
      const back = killRefund(T.desc.type, T.st.paid || paid, T.st.refunded);
      if (back > 0 && g.run) { T.st.refunded += back; g.run.credits += back; g.broadcastRun(['credits']); g.net.broadcast('hrfx', { k: 'refund', n: back, p: [c.pos.x, c.pos.y + 1.2, c.pos.z] }); }
    }
  }
  function hitPlayer(T, v, tick = false) {
    const TR = TRAPS[T.desc.type];
    const key = 'p:' + v.id;
    if (!tick && T.st.hit?.has(key)) return;
    T.st.hit?.add(key);
    g.hostHurtPlayer(v.id, TR.dmgP, 'hr_' + T.desc.type, null, new THREE.Vector3(T.zone.cx, T.zone.y + 1, T.zone.cz));
    if (T.desc.type === 'electric') g.hostStunPlayer(v.id, 0.35);
    if (T.desc.type === 'flame') g.hostSlowPlayer(v.id, 0.8);
  }
  function strikeStart(T) {
    const t = T.desc.type;
    T.prevP = 0; T.slammed = false; T.nextTick = now();
    const z = T.zone;
    if (t === 'laser') sndAt('taser_zap', z.cx, z.y + 1.4, z.cz, 1, 8, 90, 0.7);
    if (t === 'flame') sndAt('steam_hiss', z.cx, z.y + 1, z.cz, 1, 8, 70, 0.6);
    if (t === 'spikes') sndAt('hit_metal', z.cx, z.y + 0.2, z.cz, 0.9, 6, 60, 0.7);
    if (t === 'electric') sndAt('spark', z.cx, z.y + 0.5, z.cz, 1, 6, 60, 0.6);
    M().noise(new THREE.Vector3(z.cx, z.y, z.cz), t === 'crusher' ? 2.4 : 1.4);
  }
  function applyStrike(T, dt) {
    const TR = TRAPS[T.desc.type], el = now() - T.st.t0;
    const type = T.desc.type;
    if (type === 'laser') {
      const p = laserFrac(el, TR.strike);
      for (const v of victimsIn(T)) {
        if (T.st.hit.has(v.id)) continue;
        if (!sweepHit(T.prevP, p, v.s, T.zone.len)) continue;
        T.st.hit.add(v.id);
        if (v.kind === 'c') hitCreature(T, v); else hitPlayer(T, v);
      }
      T.prevP = p;
    } else if (type === 'crusher' || type === 'spikes') {
      if (!T.slammed && el >= (type === 'crusher' ? 0.12 : 0.1)) {
        T.slammed = true;
        if (type === 'crusher') { sndAt('hit_wall', T.zone.cx, T.zone.y + 0.4, T.zone.cz, 1, 8, 90, 0.5); sndAt('blast_door', T.zone.cx, T.zone.y + 0.4, T.zone.cz, 0.9, 8, 90, 1.3); shake(T, 0.8); }
        for (const v of victimsIn(T)) { if (v.kind === 'c') hitCreature(T, v); else hitPlayer(T, v); }
      }
    } else if (TR.tick > 0) {
      while (now() >= T.nextTick && T.nextTick < T.st.t0 + TR.strike) {
        T.nextTick += TR.tick;
        for (const v of victimsIn(T)) { if (v.kind === 'c') hitCreature(T, v); else hitPlayer(T, v, true); }
      }
    }
    void dt;
  }
  function trapsTick(dt) {
    const t = now();
    let changed = false;
    for (const T of S.traps) {
      const st = T.st;
      let occupied = false;
      if (st.s === 'armed') for (const c of M().host.values()) {
        if (c.dead || c.def.hazard || c.maxHp === null || Math.abs(c.pos.y - T.zone.y) > 3 || c.type === 'alien_npc') continue;
        if (zoneCoords({ ...T.zone, len: T.zone.len + 0.6 }, c.pos.x, c.pos.z).inside) { occupied = true; break; }
      }
      const before = st.s;
      const evs = stepTrap(st, t, occupied);
      for (const ev of evs) {
        const z = T.zone;
        if (ev === 'tele') sndAt('mine_beep', z.cx, z.y + 1.5, z.cz, 1, 8, 60, 0.7 + rnd() * 0.1);
        if (ev === 'strike') strikeStart(T);
        if (ev === 'expire') g.net.broadcast('sys', X.sys('The {@trap} powered down. Nobody walked in.', { trap: TR_NAME(T) }, 'info'));
      }
      if (st.s === 'strike') applyStrike(T, dt);
      if (st.s !== before) changed = true;
    }
    if (changed) sendTraps();
  }
  const TR_NAME = (T) => TRAPS[T.desc.type].name;
  function reqArm(d, from) {
    const T = trapById(d.i); const p = aip(from);
    if (!T || !p || p.dead || p.inShip) return;
    if (dist2(p.pos, T.panel.x, T.panel.z) > 4.2 || Math.abs(p.pos.y - T.zone.y) > 3) return;
    const price = priceNow(T);
    if ((g.run?.credits || 0) < price) { g.net.sendTo(from, 'hrfx', { k: 'deny', why: 'credits', n: price }); return; }
    const r = armTrap(T.st, now(), from);
    if (!r.ok) { g.net.sendTo(from, 'hrfx', { k: 'deny', why: r.reason }); return; }
    T.st.paid = price;
    g.run.credits -= price; g.broadcastRun(['credits']);
    H.uses++;
    sndAt('terminal_enter', T.panel.x, T.panel.y, T.panel.z, 0.9, 4, 30);
    g.net.broadcast('sys', X.sys('{name} armed the {@trap} for {n}.', { name: X.name(from), trap: TR_NAME(T), n: '\u25AE' + price }, 'info'));
    sendTraps();
  }

  // ================================================================================ closets / pockets requests
  function reqDoor(d, from) {
    const c = closetById(d.i); const p = aip(from);
    if (!c || !p || p.dead || c.fake) return;
    if (c.locked && !c.unlocked) return;
    const dp = toWorld(c.frame, 0, CLOSET.d);
    if (dist2(p.pos, dp.x, dp.z) > 4.6) return;
    g.net.broadcast('hrs', { t: 'door', i: c.id, o: d.o ? 1 : 0 });
  }
  function reqCrest(d, from) {
    const c = closetById(d.i); const p = aip(from);
    if (!c || !p || p.dead || !c.locked || c.unlocked) return;
    const dp = toWorld(c.frame, 0, CLOSET.d);
    if (dist2(p.pos, dp.x, dp.z) > 4) return;
    const it = [...g.items.all()].find((x) => x.holder === from && x.type === 'hr_crest');
    if (!it) { g.net.sendTo(from, 'hrfx', { k: 'deny', why: 'nocrest' }); return; }
    g.net.broadcast('it', { e: 'rm', id: it.id });
    c.unlocked = true;
    g.net.broadcast('hrs', { t: 'lock', i: c.id, u: 1 });
    g.net.broadcast('hrs', { t: 'door', i: c.id, o: 1 });
    g.net.broadcast('hrfx', { k: 'unlock', i: c.id });
    g.net.broadcast('sys', X.sys('{name} slotted the crest. The quarantine door unlocked.', { name: X.name(from) }, 'good'));
  }
  function reqFake(d, from) {
    const c = closetById(d.i); const p = aip(from);
    if (!c || !p || p.dead || !c.fake) return;
    const mode = d.mode === 'knock' || d.mode === 'hook' ? d.mode : 'open';
    const dp = toWorld(c.frame, 0, CLOSET.d);
    const dist = dist2(p.pos, dp.x, dp.z);
    if (dist > (mode === 'hook' ? FAKE.hookReach : FAKE.handReach) + 0.8) return;
    const cr = H.ambusher && M().host.get(H.ambusher);
    if (!cr || cr.dead || cr.state !== 'lurk') {   // spent: an ordinary empty closet now
      if (mode !== 'knock') g.net.broadcast('hrs', { t: 'door', i: c.id, o: 1 });
      return;
    }
    const out = fakeOutcome(mode, dist);
    cr.data.op = { mode, by: from, lunge: out.lunge, lethal: out.lethal };
    if (mode === 'knock') g.net.broadcast('hrfx', { k: 'knock', i: c.id, ans: 1 });
  }
  HOOKS.fakeDoor = (idx) => { const c = closetById(idx); if (!c) return null; const dp = toWorld(c.frame, 0, CLOSET.d); return { x: dp.x, z: dp.z, fx: c.frame.fx, fz: c.frame.fz }; };
  HOOKS.fakeOpened = (idx, cr, mode, second) => {
    const c = closetById(idx); if (!c) return;
    g.net.broadcast('hrs', { t: 'door', i: c.id, o: 1, v: 1 });
    const dp = toWorld(c.frame, 0, CLOSET.d);
    sndAt('door_creak', dp.x, c.frame.y + 1, dp.z, 1, 6, 60, 0.6); sndAt('giant_growl', dp.x, c.frame.y + 1, dp.z, 1, 8, 80, 1.2);
    void mode; void second; void cr;
  };

  // ================================================================================ chalk
  const ownerIdx = (id) => { if (!H.owners.has(id)) H.owners.set(id, H.owners.size % (CHALK.colors.length - 1)); return H.owners.get(id); };
  function reqChalk(d, from) {
    const p = aip(from); if (!p || p.dead) return;
    const t = now(); const hist = (H.lastChalk.get(from) || []).filter((x) => t - x < CHALK.rateSec);
    if (hist.length >= CHALK.rateN) return;
    if (![...g.items.all()].some((it) => it.holder === from && it.type === CHALK.item)) return;
    const m = validateDraw(d, p.pos); if (!m) return;
    hist.push(t); H.lastChalk.set(from, hist);
    m.o = ownerIdx(from); m.v = (Math.random() * 4) | 0; m.f = 0;
    const { mark, evicted } = S.store.add(m, ownerIdx(from));
    g.net.broadcast('hrch', { a: [encodeMark(mark)], rm: evicted });
    g.creatures.noise(new THREE.Vector3(m.x, m.y, m.z), 0.25);
  }
  function reqWipe(d, from) {
    const p = aip(from); const m = S.store.marks.get(d.id | 0);
    if (!p || !m || p.dead || Math.hypot(m.x - p.pos.x, m.z - p.pos.z) > 4.2) return;
    S.store.remove(m.id);
    g.net.broadcast('hrch', { a: [], rm: [m.id] });
  }
  HOOKS.chalk = () => S.store;
  HOOKS.forge = (c, job) => {
    const mv = forgerMove(S.store, rnd, job ? { x: job.x, z: job.z } : null);
    if (!mv) return null;
    const add = [], rm = [];
    if (mv.erase) { if (S.store.remove(mv.erase)) rm.push(mv.erase); }
    if (mv.forge) { const r = S.store.add(mv.forge, 0); add.push(encodeMark(r.mark)); rm.push(...r.evicted); }
    g.net.broadcast('hrch', { a: add, rm });
    return mv;
  };
  function sendChalk(to) { const d = { all: S.store.encodeAll() }; if (to) g.net.sendTo(to, 'hrch', d); else g.net.broadcast('hrch', d); }
  function reqHead(d, from) {
    const c = M().host.get(d.cid); if (!c || c.dead || c.type !== 'hr_zombie') return;
    const p = aip(from); if (!p || p.pos.distanceTo(c.pos) > 60) return;
    c.data.headBy = from; c.data.headT = now();
  }

  // ================================================================================ herb / typewriter / item box / secret doors
  function reqHerb(d, from) {
    const pk = S.pockets[d.p | 0]; const sp = pk?.spots.herb.find((h) => h.id === (d.id | 0)); const p = aip(from);
    if (!pk || !sp || !p || p.dead || H.herbs.has(d.p + ':' + sp.id) || dist2(p.pos, sp.x, sp.z) > 3.4) return;
    H.herbs.add(d.p + ':' + sp.id);
    g.items.hostSpawn('fd_herb', new THREE.Vector3(sp.x, sp.y, sp.z), {});
    g.net.broadcast('hrs', { t: 'herb', p: d.p | 0, id: sp.id });
  }
  function reqRest(d, from) {
    const pk = S.pockets[d.p | 0]; const p = aip(from);
    if (!pk?.spots.typewriter || !p || p.dead || dist2(p.pos, pk.spots.typewriter.x, pk.spots.typewriter.z) > 3.6) return;
    const key = d.p + ':' + from;
    const first = !H.rest.has(key); H.rest.add(key);
    if (first) g.net.broadcast('xp', { to: from, xp: 18, coin: 0, reason: 'Typed up the report', bounty: null, kill: null });
    g.net.sendTo(from, 'hrfx', { k: 'rest', first });
  }
  const snapItem = (it) => ({ ty: it.type, v: it.value, bv: it.baseValue, b: it.battery ?? undefined, c: it.charges ?? undefined, af: it.affix || undefined, tr: it.tier || undefined, pl: it.plus || undefined, oc: it.oc?.length ? [...it.oc] : undefined, du: it.dur ?? undefined });
  function reqBox(d, from) {
    const pk = S.pockets[d.p | 0]; const p = aip(from);
    if (!pk?.spots.box || !p || p.dead || dist2(p.pos, pk.spots.box.x, pk.spots.box.z) > 3.6) return;
    const list = H.boxes.get(d.p | 0) || []; H.boxes.set(d.p | 0, list);
    if (d.act === 'put') {
      const it = g.items.get(d.id);
      if (!it || it.holder !== from || list.length >= 8 || it.def?.kind === 'weapon' || it.bag?.length || it.type === 'body' || it.soulbound) { g.net.sendTo(from, 'hrfx', { k: 'deny', why: 'box' }); return; }
      list.push(snapItem(it));
      g.net.broadcast('it', { e: 'rm', id: it.id });
    } else if (d.act === 'take') {
      const s = list.pop(); if (!s) return;
      g.items.hostSpawn(s.ty, new THREE.Vector3(pk.spots.box.x, pk.spots.box.y + 0.3, pk.spots.box.z), { value: s.v, baseValue: s.bv, battery: s.b, charges: s.c, af: s.af, tier: s.tr, plus: s.pl, oc: s.oc, dur: s.du, holder: from });
    }
    g.net.broadcast('hrs', { t: 'box', p: d.p | 0, n: list.length });
  }
  function reqSecret(d, from) {
    const pk = S.pockets[d.p | 0]; const sp = pk?.spots.secret[d.i | 0]; const p = aip(from);
    if (!sp || !p || p.dead || dist2(p.pos, sp.x, sp.z) > 3.6) return;
    if (H.secrets.has(d.p + ':' + sp.i)) return;
    H.secrets.add(d.p + ':' + sp.i);
    g.net.broadcast('hrs', { t: 'sec', p: d.p | 0, i: sp.i, o: 1 });
  }

  // ================================================================================ population
  const lvl = () => 1 + Math.floor((g.run?.quotaIndex || 0) / 3);
  function scrapPicker() {
    const theme = g.world?.facility?.layout?.theme || 'factory';
    const table = scrapTableFor(theme).filter(([id]) => ITEMS[id]);
    let tot = 0; for (const [, w] of table) tot += w;
    return () => { let r = rnd() * tot; for (const [id, w] of table) { r -= w; if (r <= 0) return id; } return table[0][0]; };
  }
  function populate() {
    if (!g.isHost || !S.active) return;
    const run = g.run, moon = MOONS[run.moon];
    const valueMul = (moon?.scrapMul || 1) * scrapValueMul(run.quotaIndex || 0) * 0.9;
    const pick = scrapPicker();
    const zt = { outbreak: 1.5, mansion: 1.3, ballroom: 1.2, warehouse: 1.1 };
    const at = (s, dy = 0.4) => new THREE.Vector3(s.x + (rnd() - 0.5) * 0.4, s.y + dy, s.z + (rnd() - 0.5) * 0.4);
    let n = { zombie: 0, warden: 0, loot: 0 };
    for (const pk of S.pockets) {
      const kind = pk.spec.id, mul = valueMul * (zt[kind] || 1);
      for (const s of pk.spots.zombie) { M().hostSpawn('hr_zombie', new THREE.Vector3(s.x, s.y, s.z), { zone: 'in', level: lvl(), state: 'idle', yaw: rnd() * 6.28, seed: (rnd() * 99) | 0, variant: null, affix: null }); n.zombie++; }
      for (const s of pk.spots.warden) { M().hostSpawn('hr_warden', new THREE.Vector3(s.x, s.y, s.z), { zone: 'in', level: lvl(), state: 'idle', yaw: rnd() * 6.28, seed: (rnd() * 99) | 0, variant: null, affix: null }); n.warden++; }
      for (const s of pk.spots.pistol) g.items.hostSpawn(SIDEARM.item, new THREE.Vector3(s.x, s.y + 0.05, s.z), {});
      for (const s of pk.spots.ammo) if (rnd() < SIDEARM.boxChance) g.items.hostSpawn(SIDEARM.boxItem, new THREE.Vector3(s.x, s.y + 0.1, s.z), { charges: SIDEARM.boxRounds, value: 0 });
      let idx = 0;
      const loot = pk.spots.loot.slice();
      for (const s of loot) {
        idx++;
        if (!s.big && rnd() > 0.88) continue;
        let id = s.big ? ['goldbar', 'ring', 'trophy', 'figurine', 'perfume', 'ring'][(rnd() * 6) | 0] : pick();
        if (kind === 'outbreak' && idx === loot.length && ITEMS.hr_specimen) id = 'hr_specimen';
        if (!ITEMS[id]) id = pick();
        g.items.hostSpawn(id, at(s), { valueMul: mul * (s.big ? 1.25 : 1) });
        n.loot++;
      }
    }
    // the crest for the quarantine door
    if (S.plan?.crestRoom >= 0 && S.closets.some((c) => c.kind === 'outbreak')) {
      const L = S.L, r = L.rooms[S.plan.crestRoom];
      const fac = g.world.facility;
      let spot = null;
      if (r) {
        const inRoom = (fac.scrapSpots || []).filter((s) => { const gx = Math.floor((s.x - L.ox) / L.cell), gz = Math.floor((s.z - L.oz) / L.cell); return gx >= r.x && gx < r.x + r.w && gz >= r.z && gz < r.z + r.h; });
        spot = inRoom.length ? inRoom[Math.floor(rnd() * inRoom.length)] : null;
        if (!spot) { const w = fac.nav.nearestWalkable(...fac.nav.toGrid(L.ox + (r.cx + 0.5) * L.cell, L.oz + (r.cz + 0.5) * L.cell), 4); if (w) { const q = fac.nav.toWorld(w[0], w[1]); spot = { x: q.x, y: L.y, z: q.z }; } }
      }
      if (!spot) { const rp = fac.nav.randomWalkable(rnd); if (rp) spot = { x: rp.x, y: L.y, z: rp.z }; }
      if (spot) { g.items.hostSpawn('hr_crest', new THREE.Vector3(spot.x, (spot.y ?? S.L.y) + 0.4, spot.z), {}); H.crestAt = spot; }
    }
    // the fake closet
    for (const c of S.closets) if (c.fake) {
      const ip = toWorld(c.frame, 0, CLOSET.d / 2);
      const cr = M().hostSpawn('hr_ambusher', new THREE.Vector3(ip.x, c.frame.y, ip.z), { zone: 'in', level: lvl(), state: 'lurk', yaw: Math.atan2(c.frame.fx, c.frame.fz), data: { closet: c.id }, variant: null, affix: null });
      if (cr) { H.ambusher = cr.id; cr.age = 0; }
      // a Forger left its mark: two clean arrows on the floor that lead straight to the door
      for (const k of [2.6, 4.6]) {
        const lp = toWorld(c.frame, (rnd() - 0.5) * 0.6, CLOSET.d + k);
        const r = S.store.add({ o: 255, k: 0, x: lp.x, y: c.frame.y, z: lp.z, n: 2, r: rollFor(2, [-c.frame.fx, 0, -c.frame.fz]), f: 1, v: 1 }, 0);
        H.fakeMarks = (H.fakeMarks || []).concat(r.mark.id);
      }
      sendChalk();
    }
    for (const p of g.aiPlayers()) giveChalk(p.id);
    return n;
  }
  function giveChalk(id) {
    if (!id || H.given.has(id) || !ITEMS[CHALK.item]) return;
    const p = aip(id); if (!p) return;
    const has = [...g.items.all()].filter((it) => it.holder === id);
    if (has.some((it) => it.type === CHALK.item)) { H.given.add(id); return; }
    if (has.length >= (g.config?.inventorySlots || 4)) return;
    H.given.add(id);
    g.items.hostSpawn(CHALK.item, p.pos.clone().add(new THREE.Vector3(0, 1, 0)), { holder: id });
  }
  function maybeForger(dt) {
    H.forgerT -= dt;
    if (H.forgerT > 0) return;
    H.forgerT = 6;
    if (H.forger === false || typeof H.forger === 'string') return;   // decided against it for this landing / already out there
    if (S.store.marks.size < 5 || ((g.run?.day || 1) < 2 && (g.run?.quotaIndex || 0) < 1)) return;
    if (rnd() > 0.35) { H.forger = false; return; }
    const nav = g.world.facility?.nav; if (!nav) return;
    for (let i = 0; i < 25; i++) {
      const q = nav.randomWalkable(rnd); if (!q) continue;
      if (g.aiPlayers().some((p) => !p.dead && Math.hypot(p.pos.x - q.x, p.pos.z - q.z) < 24)) continue;
      const c = M().hostSpawn('hr_forger', new THREE.Vector3(q.x, S.L.y, q.z), { zone: 'in', level: lvl(), state: 'idle', variant: null, affix: null });
      if (c) { H.forger = c.id; g.net.broadcast('hrfx', { k: 'scratch_hint' }); }
      return;
    }
  }

  // ================================================================================ headshots: damage wrapper on the creature manager (restored in dispose)
  const Mgr = g.creatures, prevDamage = Mgr.damage, ownDamage = Object.prototype.hasOwnProperty.call(Mgr, 'damage');
  const wrapDamage = function (id, amount, by, opts = {}) {
    const c = this.host.get(id);
    if (c && c.type === 'hr_zombie' && !c.dead && by && c.data.headBy === by && now() - (c.data.headT || -9) < ZOMBIE.headWindow && amount > 0) {
      amount *= HEADSHOT_MUL; opts = { ...opts, crit: true }; c.data.headT = -9;
    }
    return prevDamage.call(this, id, amount, by, opts);
  };
  Mgr.damage = wrapDamage;

  function onRequest(d, from) {
    try {
      switch (d.op) {
        case 'arm': reqArm(d, from); break;
        case 'door': reqDoor(d, from); break;
        case 'crest': reqCrest(d, from); break;
        case 'fake': reqFake(d, from); break;
        case 'chalk': reqChalk(d, from); break;
        case 'wipe': reqWipe(d, from); break;
        case 'head': reqHead(d, from); break;
        case 'herb': reqHerb(d, from); break;
        case 'rest': reqRest(d, from); break;
        case 'box': reqBox(d, from); break;
        case 'secret': reqSecret(d, from); break;
        case 'sync': sendAll(from); break;
        default: break;
      }
    } catch (e) { console.error('[horror] req', d?.op, e); }
  }
  function sendAll(to) {
    const doors = S.closets.map((c) => [c.id, c.view.isOpen ? 1 : 0, c.unlocked ? 1 : 0]);
    g.net.sendTo(to, 'hrs', { t: 'all', a: trapsPayload(), doors, herbs: [...H.herbs], sec: [...H.secrets], boxes: [...H.boxes].map(([p, l]) => [p, l.length]) });
    sendChalk(to);
  }
  return {
    populate, onRequest, sendAll, giveChalk, sendChalk, sendTraps,
    tick(dt) { if (!S.active) return; trapsTick(dt); maybeForger(dt); if ((H.giveT = (H.giveT || 0) - dt) <= 0) { H.giveT = 4; for (const p of g.aiPlayers()) giveChalk(p.id); } },
    dispose() { if (Mgr.damage === wrapDamage) { if (ownDamage) Mgr.damage = prevDamage; else delete Mgr.damage; } for (const k of ['fakeDoor', 'fakeOpened', 'chalk', 'forge']) delete HOOKS[k]; },
  };
}
