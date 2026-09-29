// SHIP2 (wave 4, module 'ship2'; docs/wave4/ship2.md): the default ship became a small "Mini-Skeld" (world/shiplayout.js + world/shipdeco.js) and now has
//   * HULL DAMAGE on the OUTSIDE (dents / sparking panels / leaking pipes / breaches: emissive, instanced-free, constant light count) from landings, weather,
//     creatures at the hull, raids and sieges; unrepaired it flickers the ship lights, jams the door, delays takeoff and finally adds an "Outer Hull Breach"
//     pre-flight fault to shipfaults.js (host: run.s2, integrity / tier rules in ship2_core.js);
//   * OUTSIDE REPAIR with shop tools (Wrench, Welding Torch, Repair Kit): hold E next to a spot; a small timing ring (green arc = fast, red arc = arc flash, let go)
//     changes the speed. Host-authoritative: the host owns the session, the progress and the ring clock (deterministic from a seed), clients only draw it;
//   * DEFENCE MOUNTS on the roof (turret / tesla / floodlight / sensor / drone kits from the siege deployables), fed by the ship's power budget, reached by a roof ladder;
//   * PLANTERS (hydroponic pots) that grow a little tree over game days and give Hydro Apples; `game.ship2.addPlanterSlot()` lets shipyard rooms add more.
// Net (all prefixed s2): request  s2req {op ...}  ->  host messages  s2msg {k ...}  (HOST_ONLY);  state = run.s2 (generic run sync, late joiners get it in `welcome`).
import * as THREE from 'three';
import { t, tf, sysMsg } from '../core/i18n.js';
import { registerItem, ITEMS, STORE_ITEMS } from './items.js';
import { FOODS } from './food_data.js';
import { HOST_ONLY } from '../net/session.js';
import { SHIP } from '../world/ship.js';
import { bakeParts } from '../world/shipdeco.js';
import { PLANTER_SLOTS, DECOR } from '../world/shiplayout.js';
import { G } from '../physics/physics.js';
import { hudDock } from '../ui/dock.js';
import { repairMul } from './aptitudes.js';
import * as C from './ship2_core.js';
import * as MD from '../models/ship2.js';

HOST_ONLY.add('s2msg');

// ---------------------------------------------------------------------------------------------- items (registered at import, ids stable)
export function registerShip2Items() {
  for (const id of C.TOOL_IDS) {
    const T = C.TOOLS[id];
    if (!ITEMS[id]) registerItem({ id, name: T.name, kind: 'tool', price: T.price, weight: T.weight, hands: 1, tier: id === 's2_torch' ? 'uncommon' : 'common', shop: 'tools', s2tool: T.tool, tip: T.tip });
    if (!STORE_ITEMS.includes(id)) STORE_ITEMS.push(id);
  }
  if (!FOODS.fd_hydro) FOODS.fd_hydro = { kind: 'food', name: 'Hydro Apple', tier: 'common', price: 0, weight: 0.5, value: [4, 8], use: 1.2, hp: 18, stam: 30, buffs: [['f_sugar', 30]], tip: 'A crisp apple grown in the ship planter. Heals a little and gives a short energy boost.' };
  if (!ITEMS.fd_hydro) registerItem({ id: 'fd_hydro', name: 'Hydro Apple', kind: 'consumable', food: 'food', weight: 0.5, hands: 1, tier: 'common', value: [4, 8], tip: FOODS.fd_hydro.tip });
}
registerShip2Items();

const HULL_Z = 3.75;
const FACE_NAME = { '+z': 'door side', '-z': 'far side', nose: 'nose', tail: 'tail' };
const LADDER = { x: 6.75, z: 3.95, roofX: 6.3, roofZ: 2.9 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function installShip2(game, ctx = {}) {
  const mods = game.mods;
  const offs = [];
  const st = { disposed: false };
  const V = new THREE.Vector3(), V2 = new THREE.Vector3();
  const host = () => !!game.isHost;
  const enabled = () => game.config?.ship2 !== false;
  const quota = () => game.run?.quotaIndex | 0;
  const toast = (s, k = 'info') => { try { game.ui?.toast?.(s, k); } catch { /* ui optional */ } };
  const posOf = (id) => (id === game.selfId ? game.player?.pos : game.remotes?.get(id)?.pos);
  const phaseNow = () => game.run?.phase;
  const landed = () => phaseNow() === 'moon' || phaseNow() === 'company';
  const sys = (key, vars = {}, kind = 'info') => game.net?.broadcast('sys', sysMsg(key, vars, kind));
  const q0 = () => quota() <= 0;

  // ================================================================================= host state
  // hull (per run) lives in run.s2; mounts + planters are per host profile (survive fired runs) and are mirrored into run.s2 (mt / pl) for every peer
  let hull = C.freshState();
  let mounts = {}, planters = {};
  const H = { weatherT: 0, creatureT: 0, mountT: 0, syncT: 0, sessions: new Map(), jam: new Map(), prevSiege: null, landAt: null, dayKey: null, deps: new Map(), depAge: new Map(), poweredSig: '', lastEsc: null, delayed: false };

  function attach() {
    if (!host() || !game.run) return;
    const p = game.profile || (game.profile = {});
    const pr = p.ship2 || {};
    mounts = C.sanitizeMounts(pr.mounts); planters = C.sanitizePlanters(pr.planters);
    p.ship2 = { mounts, planters };
    hull = C.sanitize(game.run.s2 && game.run.s2.sp ? game.run.s2 : null);
    publish(false);
  }
  const integ = () => C.integrity(hull), tier = () => C.tierOf(integ());
  const engineTier = () => { try { const y = game.shipyard; return Number(y?.core?.tierOf?.(y.state(), 'engine')) || 0; } catch { return 0; } };   // Engine Room Mk I-III = +1 power slot each
  const deckTier = () => { try { return Number(game.shipdeck?.tier?.()) || 0; } catch { return 0; } };   // [shipdeck] Upper Deck Mk III: +1 power slot and the extra mount M6
  const mountOn = (m) => !m.deck || deckTier() >= m.deck;
  const slots = () => C.powerSlots(quota(), engineTier(), tier(), deckTier());
  function publish(save = true) {
    if (!host() || !game.run) return;
    const on = [...C.poweredMounts(mounts, slots())];
    game.run.s2 = { v: 1, sp: hull.sp, seq: hull.seq, mt: mounts, pl: planters, on, ps: slots() };
    game.run.hullDamage = +(100 - integ()).toFixed(1);       // shipfaults reads this (softHull): more faults with a battered hull
    try { game.broadcastRun?.(['s2', 'hullDamage']); } catch { /* not networked yet */ }
    if (save) { try { game.profile.ship2 = { mounts, planters }; game.progress?.save?.(); } catch { /* ignore */ } }
  }
  function setHull(next, why) {
    const before = tier();
    hull = next;
    publish(false);
    if (tier() !== before) mods?.emit('tfg:hullTier', { tier: tier(), integrity: integ(), why }, game);
    mods?.emit('tfg:hull', { integrity: integ(), tier: tier(), spots: hull.sp.length }, game);
  }

  // ---------------------------------------------------------------- damage (host)
  const SRC_MSG = { landing: 'Rough landing: the hull is scarred.', weather: 'A storm batters the hull.', creature: 'Something is clawing at the hull!', raid: 'Raiders are shooting at the ship!', siege: 'The siege is tearing the hull apart.' };
  /** damage the hull from `source` (landing | weather | creature | raid | siege | event). Returns the new spot / escalation or null. Host only. */
  function damage(source, opts = {}) {
    if (!host() || !enabled() || !game.run || st.disposed) return null;
    if (!landed()) return null;
    const res = C.addDamage(hull, source, quota(), Math.random, { kind: opts.kind, prefer: source === 'creature' ? 'door' : null, t: game.time || 0 });
    if (res.blocked) return null;
    setHull(res.st, source);
    const spot = res.added || (res.escalated && hull.sp.find((p) => p.i === res.escalated.i));
    if (spot) {
      const slot = C.slotById(spot.s);
      sys('The hull took a hit: {@k} on the {@f}.', { k: C.KINDS[spot.k].name, f: FACE_NAME[slot.face] || 'nose' }, spot.k === 'breach' ? 'bad' : 'warn');
      if (SRC_MSG[source] && !opts.quiet) game.net.broadcast('s2msg', { k: 'banner', text: SRC_MSG[source] });
      game.net.broadcast('s2msg', { k: 'hit', i: spot.i, kind: spot.k, x: slot.x, y: slot.y, z: slot.z });
    }
    return spot || res.escalated;
  }
  const hostRoll = (source, mul = 1, opts) => { if (Math.random() < C.rollChance(source, quota(), mul)) return damage(source, opts); return null; };
  const weatherSev = () => C.WEATHER_SEV[game.run?.weather] ?? 0;

  function creaturesAtHull() {
    let n = 0;
    try {
      for (const c of game.creatures.host.values()) {
        if (c.dead || c.def?.hazard || c.maxHp === null) continue;
        const dx = Math.max(SHIP.x0 - 0.25 - c.pos.x, 0, c.pos.x - (SHIP.x1 + 0.25)), dz = Math.max(SHIP.z0 - 0.25 - c.pos.z, 0, c.pos.z - (SHIP.z1 + 0.25));
        if (Math.hypot(dx, dz) < 5.5 && Math.abs(c.pos.y) < 6) n++;
      }
    } catch { /* creatures not ready */ }
    return n;
  }

  // ---------------------------------------------------------------- repair sessions (host authoritative)
  const tgtSpot = (id) => 'h:' + id, tgtMount = (id) => 'm:' + id;
  function toolOfItem(it) { return it && ITEMS[it.type]?.s2tool ? { id: it.type, tool: ITEMS[it.type].s2tool } : null; }
  function aptMul(from) { try { return repairMul(game.gameplay2?.aptitudes?.bonusOf?.(from, 'repairSpeed')); } catch { return 1; } }
  const playerOf = (id) => { try { return game.aiPlayerById(id); } catch { return null; } };
  function stopSession(from, why, quiet) {
    const s = H.sessions.get(from); if (!s) return;
    H.sessions.delete(from);
    if (!quiet) game.net.sendTo(from, 's2msg', { k: 'rx', tg: s.tg, why });
  }
  function validSession(s) {
    const pl = playerOf(s.from);
    if (!pl || pl.dead || !landed()) return false;
    const it = game.items.get(s.item);
    if (!it || it.holder !== s.from || !ITEMS[it.type]?.s2tool) return false;
    if (s.tg.startsWith('h:')) {
      const spot = C.spotById(hull, s.tg.slice(2)); if (!spot) return false;
      const sl = C.slotById(spot.s), sp = C.standPoint(sl);
      return !pl.inShip && Math.hypot(pl.pos.x - sp[0], pl.pos.z - sp[2]) < 5.2 && Math.abs(pl.pos.y + 1.0 - sl.y) < 6;
    }
    const m = C.MOUNTS.find((x) => x.id === s.tg.slice(2)); if (!m || !mounts[m.id]) return false;
    return Math.hypot(pl.pos.x - m.x, pl.pos.z - m.z) < 4.2 && pl.pos.y > 3.0;
  }
  function onStart(d, from) {
    if (!enabled() || !landed()) { game.net.sendTo(from, 's2msg', { k: 'rx', tg: String(d.tg || ''), why: 'phase' }); return; }
    const tg = String(d.tg || ''), it = game.items.get(String(d.item || ''));
    const tl = toolOfItem(it);
    if (!tl || it.holder !== from) { game.net.sendTo(from, 's2msg', { k: 'rx', tg, why: 'tool' }); return; }
    const old = H.sessions.get(from); if (old && old.tg === tg && old.item === it.id) { old.down = true; return; }
    stopSession(from, 'new', true);
    let need = 0;
    if (tg.startsWith('h:')) {
      const spot = C.spotById(hull, tg.slice(2)); if (!spot) { game.net.sendTo(from, 's2msg', { k: 'rx', tg, why: 'gone' }); return; }
      for (const [, o] of H.sessions) if (o.tg === tg) { game.net.sendTo(from, 's2msg', { k: 'rx', tg, why: 'busy' }); return; }
      const rule = C.repairRule(tl.tool, spot.k, aptMul(from)); if (!rule.ok) return;
      need = rule.hold;
    } else if (tg.startsWith('m:')) {
      if (!mounts[tg.slice(2)]) return;
      need = Math.max(0.8, (tl.tool === 'kit' ? 1.0 : tl.tool === 'torch' ? 1.6 : 2.6) / aptMul(from));
    } else return;
    const s = { from, tg, item: it.id, tool: tl.tool, need, prog: 0, seed: C.ringSeed(tg, game.time || 0), t: 0, down: true, sendT: 0, shockT: 0 };
    if (!validSession(s)) { game.net.sendTo(from, 's2msg', { k: 'rx', tg, why: 'range' }); return; }
    H.sessions.set(from, s);
    game.net.sendTo(from, 's2msg', { k: 'rs', tg, need: +need.toFixed(2), seed: s.seed, tool: tl.tool });
  }
  function finish(s) {
    H.sessions.delete(s.from);
    const it = game.items.get(s.item);
    const consume = () => { if (s.tool === 'kit' && it) game.net.broadcast('it', { e: 'rm', id: it.id }); };
    if (s.tg.startsWith('h:')) {
      const spot = C.spotById(hull, s.tg.slice(2)); if (!spot) return;
      const rule = C.repairRule(s.tool, spot.k);
      const next = C.applyRepair(hull, spot.i, s.tool);
      consume();
      setHull(next, 'repair');
      const slot = C.slotById(spot.s);
      game.net.broadcast('s2msg', { k: 'fixed', i: spot.i, kind: spot.k, mode: rule.mode, x: slot.x, y: slot.y, z: slot.z });
      sys(rule.mode === 'fix' ? 'Hull repaired: {@k}' : 'Hull patched down: {@k}', { k: C.KINDS[spot.k].name }, 'good');
      const q = quota();
      game.net.broadcast('xp', { to: s.from, xp: 14 + spot.k.length + q * 5 + (spot.k === 'breach' ? 20 : 0), coin: 2, reason: t('Hull repair') });
      if (C.outerFaultDone(hull)) { try { game.gameplay2?.faults?.fixOuter?.(s.from); } catch { /* faults optional */ } }
      mods?.emit('tfg:hullRepaired', { kind: spot.k, mode: rule.mode, by: s.from }, game);
    } else {
      const id = s.tg.slice(2), dep = H.deps.get(id) && game.deployables?.get?.(H.deps.get(id));
      consume();
      if (dep && !dep.dead) { dep.hp = Math.min(dep.maxHp, dep.hp + dep.maxHp * (s.tool === 'kit' ? 0.6 : 0.4)); game.net.broadcast('fx', { k: 'snd', s: 'spark', p: [dep.center.x, dep.center.y, dep.center.z], v: 0.6 }); }
      game.net.broadcast('s2msg', { k: 'fixed', i: s.tg, kind: 'mount' });
    }
    game.net.sendTo(s.from, 's2msg', { k: 'rd', tg: s.tg });
  }
  function sessionsTick(dt) {
    for (const s of [...H.sessions.values()]) {
      if (!validSession(s)) { stopSession(s.from, 'invalid'); continue; }
      const r = C.stepSession(s, dt, q0());
      if (r.shock) {
        s.shockT -= dt;
        if (s.shockT <= 0) { s.shockT = 0.5; try { game.hostHurtPlayer(s.from, 3, 'arcflash', null, null); } catch { /* soft */ } game.net.sendTo(s.from, 's2msg', { k: 'shock' }); }
      }
      if (r.done) { finish(s); continue; }
      s.sendT -= dt;
      if (s.sendT <= 0) { s.sendT = 0.15; game.net.sendTo(s.from, 's2msg', { k: 'rp', tg: s.tg, p: +(s.prog / s.need).toFixed(3) }); }
      if (!s.down && s.prog <= 0 && s.t > 3) stopSession(s.from, 'idle');
    }
  }

  // ---------------------------------------------------------------- door malfunction / takeoff delay
  function doorJam(from, wantOpen) {
    if (!enabled() || st.disposed) return false;
    const ch = C.doorJamChance(tier(), quota());
    if (ch <= 0) return false;
    const n = H.jam.get(from) || 0;
    if (n >= 2 || Math.random() >= ch) { H.jam.set(from, 0); return false; }     // never twice in a row: nobody is sealed out for good
    H.jam.set(from, n + 1);
    game.net.sendTo(from, 's2msg', { k: 'jam' });
    game.net.broadcast('fx', { k: 'snd', s: 'spark', p: [SHIP.door.x, 1.5, SHIP.z1 + 0.3], v: 0.9 });
    return true;
  }
  const origFinishTakeoff = game.hostFinishTakeoff;
  if (typeof origFinishTakeoff === 'function') {
    game.hostFinishTakeoff = function (...a) {
      try {
        if (host() && enabled() && this.run?.phase === 'takeoff' && !H.delayed && this.hostData?.takeoffReason === 'lever') {
          const d = C.takeoffDelay(tier(), quota());
          if (d > 0) {
            H.delayed = true;
            sys('Engines struggling on a damaged hull: takeoff delayed {n} s.', { n: d }, 'warn');
            game.net.broadcast('fx', { k: 'snd', s: 'ship_alarm', p: [0, 2, 0], v: 0.6, r: 30, m: 200 });
            this.later(() => { H.delayed = false; if (!st.disposed) origFinishTakeoff.apply(this, a); }, d * 1000);
            return;
          }
        }
      } catch (e) { console.warn('[ship2] takeoff', e); }
      return origFinishTakeoff.apply(this, a);
    };
  }

  // ---------------------------------------------------------------- defence mounts (host): deployables on the roof, ship powered
  const mountOf = (id) => C.MOUNTS.find((m) => m.id === id);
  function ensureDeps() {
    const D = game.deployables; if (!D || phaseNow() !== 'moon') return;
    for (const m of C.MOUNTS) {
      const r = mounts[m.id]; if (!r || !mountOn(m)) continue;
      const id = H.deps.get(m.id);
      const have = id && D.get(id);
      if (have && !have.dead) continue;
      if (id && H.depAge.get(m.id) && (game.time || 0) - H.depAge.get(m.id) > 3) {   // it was there and now it is gone (destroyed / packed up): the mount is empty again
        delete mounts[m.id]; H.deps.delete(m.id); H.depAge.delete(m.id); publish(); continue;
      }
      if (id) continue;
      const dep = D.debugPlace(r.ty, m.x, m.z, Math.atan2(m.x, m.z), r.tr || null, C.mountY(m));
      if (dep) { if (Number.isFinite(r.hp) && r.hp > 0) dep.hp = Math.min(dep.maxHp, r.hp); H.deps.set(m.id, dep.id); H.depAge.set(m.id, game.time || 0); }
    }
  }
  function mountTick(dt) {
    H.mountT -= dt; if (H.mountT > 0) return; H.mountT = 0.5;
    const D = game.deployables; if (!D) return;
    if (phaseNow() !== 'moon') { H.deps.clear(); H.depAge.clear(); return; }
    ensureDeps();
    const on = C.poweredMounts(mounts, slots());
    let dirty = false;
    for (const m of C.MOUNTS) {
      const r = mounts[m.id]; if (!r) continue;
      const dep = D.get(H.deps.get(m.id)); if (!dep || dep.dead) continue;
      if (!dep.def.ammo) dep.res = on.has(m.id) ? dep.cap : 0;
      if (Math.abs((r.hp ?? 0) - dep.hp) > 1) { r.hp = Math.round(dep.hp); dirty = true; }
    }
    const sig = [...on].join(',') + '|' + slots();
    if (sig !== H.poweredSig) { H.poweredSig = sig; publish(false); }
    if (dirty) H.saveT = 2;
  }
  function onMount(d, from) {
    if (!enabled()) return;
    const m = mountOf(String(d.m || '')), it = game.items.get(String(d.item || ''));
    const reply = (msg) => game.net.sendTo(from, 's2msg', { k: 'err', msg });
    if (!m || !it || it.holder !== from || !mountOn(m)) return;
    if (!landed()) return reply('Only while the ship is landed.');
    const type = it.def?.deploy;
    if (!type || !C.MOUNT_TYPES.includes(type)) return reply('That kit cannot be mounted on the ship.');
    if (mounts[m.id]) return reply('Mount in use');
    const pl = playerOf(from);
    if (!pl || pl.dead || Math.hypot(pl.pos.x - m.x, pl.pos.z - m.z) > 4.2 || pl.pos.y < 3.0) return;
    game.net.broadcast('it', { e: 'rm', id: it.id });
    mounts[m.id] = { ty: type, tr: it.tier || null, hp: null };
    publish();
    ensureDeps();
    game.net.broadcast('fx', { k: 'snd', s: 'lockpick_success', p: [m.x, C.mountY(m) + 0.5, m.z], v: 0.7 });
    game.net.sendTo(from, 's2msg', { k: 'mounted', type });
  }

  // ---------------------------------------------------------------- planters (host)
  const slotsP = new Map(PLANTER_SLOTS.map((s) => [s.id, { ...s }]));
  const dayKey = () => `${game.run?.runId ?? game.run?.seed ?? 0}:${game.run?.day ?? 0}`;
  function onPlanter(d, from) {
    const s = slotsP.get(String(d.id || '')); if (!s) return;
    const pl = playerOf(from); if (!pl || pl.dead || Math.hypot(pl.pos.x - s.x, pl.pos.z - s.z) > 3.4) return;
    const p = planters[s.id];
    if (d.sub === 'plant') { if (p?.pl) return; planters[s.id] = C.plantIt(p, dayKey()); publish(); game.net.sendTo(from, 's2msg', { k: 'pl', m: 'You planted a seed. It grows a little every day.' }); }
    else if (d.sub === 'water') { if (!p?.pl || p.w || C.stageOf(p.pts) >= 4) return; planters[s.id] = C.waterIt(p); publish(); game.net.sendTo(from, 's2msg', { k: 'pl', m: 'Watered.' }); }
    else if (d.sub === 'harvest') {
      if (!C.canHarvest(p)) return;
      planters[s.id] = C.harvest(p); publish();
      const n = 2 + (Math.random() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) game.items.hostSpawn(C.PLANT.fruit, new THREE.Vector3(s.x + (i - 1) * 0.16, (s.y ?? 0.5) + 0.7 + i * 0.1, s.z + 0.3), { value: 0 });
      game.net.sendTo(from, 's2msg', { k: 'pl', m: 'Fresh Hydro Apples!' });
      game.net.broadcast('fx', { k: 'snd', s: 'lockpick_success', p: [s.x, 1.0, s.z], v: 0.5 });
    }
  }
  function growPlanters() {
    const key = dayKey(); let changed = false;
    for (const id of Object.keys(planters)) { const n = C.growPlanter(planters[id], key, false); if (n !== planters[id]) { planters[id] = n; changed = true; } }
    if (changed) publish();
  }

  // ---------------------------------------------------------------- host tick + phases
  function hostTick(dt) {
    sessionsTick(dt);
    mountTick(dt);
    if (H.saveT > 0 && (H.saveT -= dt) <= 0) { try { game.profile.ship2 = { mounts, planters }; game.progress?.save?.(); } catch { /* ignore */ } }
    if (phaseNow() !== 'moon' || !enabled()) return;
    H.weatherT += dt; H.creatureT += dt;
    if (H.landAt != null && (game.time || 0) >= H.landAt) { H.landAt = null; hostRoll('landing', 1 + 2 * weatherSev()); }
    if (H.weatherT >= C.WEATHER_EVERY) { H.weatherT = 0; const sev = weatherSev(); if (sev > 0) hostRoll('weather', sev * (game.run.time > 17 * 60 ? 1.3 : 1)); }
    if (H.creatureT >= C.CREATURE_EVERY) { H.creatureT = 0; const n = creaturesAtHull(); if (n > 0) hostRoll('creature', Math.min(2.2, 0.6 + 0.4 * n)); }
    const sh = Number(game.run?.siege?.hull);
    if (Number.isFinite(sh)) {
      if (H.prevSiege == null) H.prevSiege = sh;
      const lost = H.prevSiege - sh;
      if (lost >= 10) { H.prevSiege = sh; hostRoll('siege', 1); if (lost >= 30) hostRoll('siege', 1); }
      else if (sh > H.prevSiege) H.prevSiege = sh;
    } else H.prevSiege = null;
  }
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || st.disposed) return;
    try { if (host() && game.run) hostTick(Math.min(dt, 0.25)); } catch (e) { if (!st.w1) { st.w1 = 1; console.warn('[ship2] host', e); } }
    try { clientTick(Math.min(dt, 0.1)); } catch (e) { if (!st.w2) { st.w2 = 1; console.warn('[ship2] client', e); } }
  }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g !== game || st.disposed) return;
    if (host()) {
      if (ph === 'moon') { H.weatherT = 0; H.creatureT = 0; H.prevSiege = null; H.landAt = (game.time || 0) + 3; H.deps.clear(); H.depAge.clear(); H.poweredSig = ''; }
      else { for (const id of [...H.sessions.keys()]) stopSession(id, 'phase'); H.landAt = null; }
      if (ph === 'orbit') {
        const key = dayKey();
        if (H.lastEsc !== key) {
          H.lastEsc = key; growPlanters();
          const e = C.escalate(hull, quota(), Math.random);
          if (e.changed.length) { setHull(e.st, 'escalate'); sys('Unrepaired hull damage got worse overnight.', {}, 'warn'); }
        }
      }
      if (ph === 'orbit' || ph === 'moon' || ph === 'company') { if (!game.run.s2 || !game.run.s2.pl) attach(); }
    }
  }));
  offs.push(mods.on('hostStart', (g) => { if (!g || g === game) attach(); }));
  offs.push(mods.on('registerHandlers', (Hh, g) => {
    if (g !== game) return;
    Hh('s2req', (d, from) => {
      try {
        switch (d.op) {
          case 'rstart': onStart(d, from); break;
          case 'rhold': { const s = H.sessions.get(from); if (s) s.down = !!d.down; break; }
          case 'rstop': stopSession(from, 'cancel', true); break;
          case 'mount': onMount(d, from); break;
          case 'pl': onPlanter(d, from); break;
          case 'sync': game.net.sendTo(from, 's2msg', { k: 'sync' }); break;
          default: break;
        }
      } catch (e) { console.error('s2req', e); }
    });
  }));
  // raids: a hit squad spawned while landed shoots at the ship, the faction war invasion too
  const origSquad = game.horde?.spawnHitSquad;
  if (typeof origSquad === 'function') {
    game.horde.spawnHitSquad = function (...a) {
      const r = origSquad.apply(this, a);
      try { if (host() && phaseNow() === 'moon') game.later?.(() => hostRoll('raid', 1), 20000); } catch { /* soft */ }
      return r;
    };
  }
  offs.push(mods.on('tfg:war', (d) => { if (host() && d?.invasion && phaseNow() === 'moon') hostRoll('raid', 1); }));

  // ================================================================================= client (every peer, host included)
  const shipGroup = () => game.ship?.group;
  const spotViews = new Map();              // spot id -> { model, light, k, next }
  let hullSig = '', S2 = null;
  const pullRun = () => {
    const raw = game.run?.s2; if (!raw || typeof raw !== 'object') return;
    const sig = JSON.stringify([raw.sp, raw.mt, raw.pl, raw.on, raw.ps]);
    if (sig === hullSig) return;
    hullSig = sig;
    S2 = { sp: C.sanitize(raw).sp, mt: C.sanitizeMounts(raw.mt), pl: C.sanitizePlanters(raw.pl), on: new Set(Array.isArray(raw.on) ? raw.on : []), ps: raw.ps | 0 };
    syncSpots(); syncMounts(); syncPlants();
  };
  const cState = () => S2 || { sp: [], mt: {}, pl: {}, on: new Set(), ps: 1 };
  const clientInteg = () => C.integrity({ sp: cState().sp });
  const clientTier = () => C.tierOf(clientInteg());

  function syncSpots() {
    const g = shipGroup(); if (!g) return;
    const want = new Map(cState().sp.map((p) => [p.i, p]));
    for (const [id, v] of [...spotViews]) if (!want.has(id) || want.get(id).k !== v.k) { v.model.dispose(); if (v.light) game.lights?.remove(v.light); spotViews.delete(id); }
    for (const [id, p] of want) {
      if (spotViews.has(id)) continue;
      const slot = C.slotById(p.s); if (!slot) continue;
      const model = MD.createSpotModel(p.k, slot, (p.s * 0.37) % 1);
      g.add(model.root);
      let light = null;
      if ((p.k === 'spark' || p.k === 'breach') && game.lights) light = game.lights.add({ pos: new THREE.Vector3(slot.x + slot.n[0] * 0.7, slot.y + 0.1, slot.z + slot.n[2] * 0.7), color: p.k === 'breach' ? 0xff5a20 : 0xffa030, intensity: p.k === 'breach' ? 0.9 : 0.7, distance: 5, flicker: 0.6, group: 's2hull' });
      spotViews.set(id, { model, light, k: p.k, slot, next: Math.random() * 2, id });
    }
  }
  // ---- mounts (plates on the roof)
  const mountViews = new Map();
  function buildMounts() {
    const g = shipGroup(); if (!g || mountViews.size) return;
    for (const m of C.MOUNTS) { const mm = MD.createMountModel(); mm.root.position.set(m.x, C.mountY(m), m.z); g.add(mm.root); mountViews.set(m.id, mm); }
  }
  function syncMounts() {
    buildMounts();
    const s = cState();
    for (const m of C.MOUNTS) { const v = mountViews.get(m.id); if (v) v.root.visible = mountOn(m); }
    for (const m of C.MOUNTS) mountViews.get(m.id)?.setState(!s.mt[m.id] ? 'free' : s.on.has(m.id) ? 'on' : 'off');
  }
  // ---- planters (the pots are static deco; the plants grow here)
  const plantViews = new Map();
  function syncPlants() {
    const g = shipGroup(); if (!g) return;
    const s = cState();
    for (const [id, sl] of slotsP) {
      const p = s.pl[id], stage = p?.pl ? C.stageOf(p.pts) : 0;
      let v = plantViews.get(id);
      if (v && v.stage === stage) continue;
      if (v) { v.model.dispose(); plantViews.delete(id); }
      if (stage < 1) continue;
      const model = MD.createPlantModel(stage); model.root.position.set(sl.x, sl.y ?? 0.5, sl.z); model.root.rotation.y = sl.ry || 0; g.add(model.root);
      plantViews.set(id, { model, stage });
    }
  }
  // ---- roof ladder (visual) + roof safety rails
  let ladderMesh = null;
  const railCols = [];
  function buildLadder() {
    const g = shipGroup(); if (!g || ladderMesh) return;
    const parts = [];
    for (const dx of [-0.16, 0.16]) parts.push({ g: new THREE.CylinderGeometry(0.025, 0.025, 5.9, 6), p: [LADDER.x + dx, 1.1, HULL_Z + 0.16], c: [0.6, 0.62, 0.66] });
    for (let y = -1.55; y <= 3.9; y += 0.36) parts.push({ g: new THREE.BoxGeometry(0.36, 0.03, 0.03), p: [LADDER.x, y, HULL_Z + 0.16], c: [0.7, 0.55, 0.2] });
    ladderMesh = new THREE.Mesh(bakeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
    ladderMesh.name = 'ship2_ladder'; g.add(ladderMesh);
    // rails around the roof edge so nobody walks off by accident (invisible)
    const eh = SHIP.h + 0.5, hw = SHIP.z1 + 0.25, hx = SHIP.x1 + 0.25;
    for (const [x, z, sx, sz] of [[0, hw - 0.05, 2 * hx, 0.1], [0, -hw + 0.05, 2 * hx, 0.1], [hx - 0.05, 0, 0.1, 2 * hw], [-hx + 0.05, 0, 0.1, 2 * hw]]) {
      try { railCols.push(game.physics.addStaticBox(x, eh + 0.55, z, sx / 2, 0.55, sz / 2, 0, G.STATIC, { kind: 'static' })); } catch { /* physics not ready */ }
    }
  }
  // ---- outside repair interaction
  const R = { tg: null, tool: null, need: 1, prog: 0, seed: 0, t: 0, down: false, sentDown: true, el: null, cv: null, ctx: null, txt: null, warn: 0 };
  const heldTool = () => { try { const it = game.player?.heldItem?.(); return it && ITEMS[it.type]?.s2tool ? { it, tool: ITEMS[it.type].s2tool } : null; } catch { return null; } };
  const heldKit = () => { try { const it = game.player?.heldItem?.(); return it?.def?.deploy && C.MOUNT_TYPES.includes(it.def.deploy) ? it : null; } catch { return null; } };
  const outside = () => !!game.player && !game.player.dead && !game.player.inShip;
  function startRepair(tg, ht) {
    if (!ht) { toast(t('Hold a Wrench, Welding Torch or Repair Kit first.'), 'info'); return; }
    if (game.minigame || R.tg) return;
    game.net.request('s2req', { op: 'rstart', tg, item: ht.it.id });
  }
  function ensureRingUi() {
    if (R.el || typeof document === 'undefined') return;
    R.el = hudDock('bottom', 's2-ring', 30);
    R.el.style.cssText = 'display:none;flex-direction:column;align-items:center;gap:2px;font-family:VT323,monospace;font-size:22px;color:#ffe2c0;text-shadow:0 0 6px #000;background:rgba(0,0,0,.5);padding:6px 14px;border:1px solid rgba(255,138,61,.5)';
    R.cv = document.createElement('canvas'); R.cv.width = R.cv.height = 112; R.cv.style.cssText = 'width:112px;height:112px';
    R.txt = document.createElement('div'); R.txt.style.cssText = 'text-align:center;line-height:1.05';
    R.el.append(R.cv, R.txt); R.ctx = R.cv.getContext('2d');
  }
  function drawRing() {
    const c = R.ctx; if (!c) return;
    const W = 112, cx = W / 2, cy = W / 2, r = 44, TAU = Math.PI * 2, a0 = -Math.PI / 2;
    c.clearRect(0, 0, W, W);
    c.lineWidth = 12; c.strokeStyle = '#262b31'; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke();
    const ring = C.ringAt(R.seed, R.t);
    const arc = (center, w, col) => { c.strokeStyle = col; c.beginPath(); c.arc(cx, cy, r, a0 + (center - w / 2) * TAU, a0 + (center + w / 2) * TAU); c.stroke(); };
    arc(ring.green, C.RING.green, '#3fe06e'); arc(ring.red, C.RING.red, q0() ? '#b8862a' : '#ff4a30');
    const na = a0 + ring.needle * TAU;
    c.strokeStyle = '#ffffff'; c.lineWidth = 4; c.beginPath(); c.moveTo(cx + Math.cos(na) * (r - 11), cy + Math.sin(na) * (r - 11)); c.lineTo(cx + Math.cos(na) * (r + 9), cy + Math.sin(na) * (r + 9)); c.stroke();
    const p = clamp(R.prog / R.need, 0, 1);
    c.fillStyle = '#ffb030'; c.font = 'bold 26px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(Math.round(p * 100) + '%', cx, cy);
    c.strokeStyle = '#ffb030'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, 30, a0, a0 + p * TAU); c.stroke();
    R.txt.textContent = `${t('REPAIRING')}\n`;
    R.txt.innerHTML = `${t('REPAIRING')}<br><span style="font-size:16px;opacity:.8">${t('hold E - GREEN is fast, RED is an arc flash: let go!')}</span>`;
  }
  function endRepair(sendStop) {
    if (!R.tg) return;
    if (sendStop) game.net.request('s2req', { op: 'rstop' });
    R.tg = null; R.prog = 0;
    if (R.el) R.el.style.display = 'none';
  }
  function repairTick(dt) {
    if (!R.tg) return;
    const inp = game.input;
    if (!outside() && !R.tg.startsWith('m:')) { endRepair(true); return; }
    if (game.minigame || game.player.dead || !heldTool()) { endRepair(true); return; }
    R.t += dt;
    const down = !!(inp?.isDown?.('interact') && inp.locked);
    if (down !== R.sentDown) { R.sentDown = down; game.net.request('s2req', { op: 'rhold', down }); }
    R.down = down;
    const z = C.ringAt(R.seed, R.t).zone;
    R.prog = clamp(R.prog + dt * (down ? (z === 'red' && q0() ? 0.5 : C.ZONE_RATE[z]) : -0.6), 0, R.need);       // prediction; the host's 'rp' corrects it
    ensureRingUi(); if (R.el) { R.el.style.display = 'flex'; drawRing(); }
  }

  const targetPos = (tg) => {
    if (tg.startsWith('h:')) { const sp = C.spotById({ sp: cState().sp }, tg.slice(2)); const sl = sp && C.slotById(sp.s); return sl ? V.set(sl.x + sl.n[0] * 0.5, sl.y, sl.z + sl.n[2] * 0.5) : null; }
    const m = mountOf(tg.slice(2)); return m ? V.set(m.x, C.mountY(m) + 0.6, m.z) : null;
  };
  const toolName = (tool) => t(tool === 'wrench' ? 'Wrench' : tool === 'torch' ? 'Welding Torch' : 'Repair Kit');

  offs.push(mods.on('interactables', (list, g) => {
    if (g !== game || st.disposed || !enabled() || !game.player || game.player.dead) return;
    const pl = game.player, s = cState(), cam = game.camera.position;
    if (landed() && outside() && pl.pos.y < 3.2) {
      // hull damage spots (outside)
      const ht = heldTool();
      for (const p of s.sp) {
        const sl = C.slotById(p.s); if (!sl) continue;
        const pos = new THREE.Vector3(sl.x + sl.n[0] * 0.5, sl.y, sl.z + sl.n[2] * 0.5);
        if (pos.distanceTo(cam) > 8) continue;
        const nm = t(C.KINDS[p.k].name);
        const rule = ht ? C.repairRule(ht.tool, p.k) : null;
        list.push({
          pos, r: 0.9, reach: 3.6, noLos: true,
          label: () => (rule?.ok ? tf(rule.mode === 'patch' ? 'Patch {n} ({tool}) [hold E]' : 'Repair {n} ({tool}) [hold E]', { n: nm, tool: toolName(ht.tool) }) : tf('Hull damage: {n}', { n: nm })),
          sub: () => (rule?.ok ? (rule.mode === 'patch' ? t('Only a Welding Torch seals a breach for good') : `${rule.hold.toFixed(1)} s`) : t('Needs a Wrench, Welding Torch or Repair Kit')),
          action: () => startRepair(tgtSpot(p.i), heldTool()),
        });
      }
      // roof ladder up
      list.push({ pos: new THREE.Vector3(LADDER.x, -0.7, LADDER.z + 0.35), r: 0.9, reach: 3.2, noLos: true, label: t('Climb to the roof [E]'), sub: t('Defence mounts'), action: () => climb(true) });
    }
    if (pl.pos.y > 3.2 && pl.pos.y < 8 && Math.abs(pl.pos.x) < 8 && Math.abs(pl.pos.z) < 5) {
      list.push({ pos: new THREE.Vector3(LADDER.roofX + 0.25, C.MOUNT_Y + 0.7, LADDER.roofZ + 0.3), r: 1.0, reach: 3.2, noLos: true, label: t('Climb down [E]'), action: () => climb(false) });
      const kit = heldKit(), ht = heldTool();
      for (const m of C.MOUNTS) {
        if (!mountOn(m)) continue;
        const pos = new THREE.Vector3(m.x, C.mountY(m) + 0.6, m.z);
        if (pos.distanceTo(cam) > 6) continue;
        const cur = s.mt[m.id];
        if (!cur) {
          list.push({ pos, r: 0.8, reach: 3.4, noLos: true, label: kit ? tf('Mount {n} [E]', { n: t(kit.def.name) }) : `${t('Defence mount')} ${m.label}`, sub: kit ? tf('Power {a}/{b}', { a: [...s.on].length, b: s.ps }) : t('Hold a turret, tesla, floodlight, sensor or drone kit and press E.'), action: () => { if (kit) game.net.request('s2req', { op: 'mount', m: m.id, item: kit.id }); else toast(t('Hold a turret, tesla, floodlight, sensor or drone kit and press E.'), 'info'); } });
        } else if (ht) {
          const dep = (() => { try { return game.deployables?.list?.().find((d) => Math.hypot(d.pos.x - m.x, d.pos.z - m.z) < 0.6 && d.pos.y > 3); } catch { return null; } })();
          if (dep && dep.hp < dep.maxHp * 0.98) list.push({ pos: new THREE.Vector3(m.x, C.mountY(m) + 1.0, m.z), r: 0.9, reach: 3.4, noLos: true, label: tf('Repair {n} ({tool}) [hold E]', { n: t(dep.def.name), tool: toolName(ht.tool) }), sub: `${Math.round(dep.hp)}/${dep.maxHp} HP`, action: () => startRepair(tgtMount(m.id), heldTool()) });
        }
      }
    }
    // planters
    for (const [id, sl] of slotsP) {
      const pos = new THREE.Vector3(sl.x, (sl.y ?? 0.5) + 0.55, sl.z);
      if (pos.distanceTo(cam) > 5) continue;
      const p = s.pl[id], stage = p?.pl ? C.stageOf(p.pts) : 0;
      let label, sub = '', op = null;
      if (!p?.pl) { label = t('Plant a seed [E]'); sub = t('Hydroponic planter'); op = 'plant'; }
      else if (stage >= 4) { label = t('Harvest Hydro Apples [E]'); op = 'harvest'; }
      else if (!p.w) { label = t('Water the plant [E]'); sub = `${t(['Seed', 'Sprout', 'Sapling', 'Tree', 'Fruiting'][stage])} · ${tf('ripe in about {n} days', { n: Math.max(1, Math.ceil(C.PLANT.days[4] - p.pts)) })}`; op = 'water'; }
      else { label = t('Hydroponic planter'); sub = `${t(['Seed', 'Sprout', 'Sapling', 'Tree', 'Fruiting'][stage])} · ${t('Watered - it grows faster tomorrow')}`; }
      list.push({ pos, r: 0.8, reach: 3.2, label, sub, action: () => { if (op) game.net.request('s2req', { op: 'pl', id, sub: op }); } });
    }
  }));
  function climb(up) {
    try {
      if (up) game.player.teleport(new THREE.Vector3(LADDER.roofX, C.MOUNT_Y + 0.05, LADDER.roofZ), 0);
      else {
        let y = -1.75;
        try { const hit = game.physics.raycast({ x: LADDER.x, y: 2, z: LADDER.z + 1.6 }, { x: 0, y: -1, z: 0 }, 12, G.STATIC); if (hit) y = hit.point.y; } catch { /* fallback */ }
        game.player.teleport(new THREE.Vector3(LADDER.x, y + 0.05, LADDER.z + 1.6), Math.PI);
      }
      game.psTimer = 0;
    } catch (e) { console.warn('[ship2] climb', e); }
  }

  // ---- net messages (every peer)
  function onMsg(d) {
    if (st.disposed || !d) return;
    switch (d.k) {
      case 'rs': R.tg = d.tg; R.tool = d.tool; R.need = d.need; R.seed = d.seed; R.t = 0; R.prog = 0; R.sentDown = true; R.down = true; break;
      case 'rp': if (R.tg === d.tg) R.prog = d.p * R.need; break;
      case 'rd': if (R.tg === d.tg) { R.tg = null; if (R.el) R.el.style.display = 'none'; game.audio?.ui?.('ui_quota_met', 0.5); } break;
      case 'rx': if (R.tg === d.tg || !R.tg) { const was = !!R.tg; R.tg = null; if (R.el) R.el.style.display = 'none'; if (was && d.why !== 'new' && d.why !== 'cancel') toast(t(d.why === 'tool' ? 'Hold a Wrench, Welding Torch or Repair Kit first.' : d.why === 'range' ? 'You must be outside the ship.' : 'Repair interrupted.'), 'info'); else if (!was && d.why === 'tool') toast(t('Hold a Wrench, Welding Torch or Repair Kit first.'), 'info'); } break;
      case 'shock': toast(t('Arc flash!'), 'bad'); try { game.engine?.flash?.(0xffffff, 0.25); } catch { /* cosmetic */ } break;
      case 'hit': { const p = V2.set(d.x, d.y, d.z); try { game.audio?.at?.(d.kind === 'spark' ? 'spark' : 'hit_metal', p, 1); game.particles?.burst(p, d.kind === 'leak' ? 'splash' : 'sparks', null, 1.4); } catch { /* cosmetic */ } break; }
      case 'fixed': { if (d.x !== undefined) { try { game.audio?.at?.('lockpick_success', V2.set(d.x, d.y, d.z), 0.8); game.particles?.burst(V2.set(d.x, d.y, d.z), 'sparks', null, 1.2); } catch { /* cosmetic */ } } break; }
      case 'banner': toast(t(d.text), 'warn'); break;
      case 'jam': toast(t('Door actuator jammed - sparks fly! Repair the hull damage outside, or try again.'), 'bad'); try { game.audio?.at?.('spark', V2.set(SHIP.door.x, 1.5, SHIP.z1), 1); } catch { /* cosmetic */ } break;
      case 'err': toast(t(d.msg), 'bad'); break;
      case 'mounted': toast(tf('Mounted: {n}', { n: t(game.deployables?.DEPS?.[d.type]?.name || d.type) }), 'good'); break;
      case 'pl': toast(t(d.m), 'good'); break;
      case 'sync': pullRun(); break;
      default: break;
    }
  }
  let boundNet = null;
  const bindNet = (n) => { if (!n || boundNet === n) return; boundNet?.off?.('msg:s2msg', onMsg); boundNet = n; n.on('msg:s2msg', onMsg); };
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);

  // ---- HUD: hull line, objectives, power flicker, spot particles
  let hudEl = null, hudTxt = '';
  function hudTick() {
    if (typeof document === 'undefined') return;
    if (!hudEl) { hudEl = hudDock('right', 's2-hull', 46); hudEl.style.cssText = 'font-family:VT323,monospace;font-size:22px;color:#ffd9b8;text-shadow:0 0 6px #000;text-align:right'; }
    const s = cState(), show = landed() && (s.sp.length > 0 || Object.keys(s.mt).length > 0);
    const i = clientInteg(), tr = clientTier();
    const txt = show ? [s.sp.length ? `${t('HULL')} ${Math.round(i)}%${tr >= 2 ? ' ⚠' : ''}` : '', Object.keys(s.mt).length ? `${t('DEFENCES')} ${t('POWER')} ${Math.min(s.on.size, s.ps)}/${s.ps}` : ''].filter(Boolean).join('  ·  ') : '';
    if (txt !== hudTxt) { hudTxt = txt; hudEl.textContent = txt; hudEl.style.display = txt ? '' : 'none'; }
  }
  offs.push(mods.on('objectives', (add, g) => {
    if (g !== game || st.disposed || !landed()) return;
    const s = cState(); if (!s.sp.length) return;
    add(tf('Repair the hull damage outside: {n}', { n: s.sp.length }), 'sub', false);
    if (![...(game.items?.all?.() || [])].some((it) => it.holder === game.selfId && ITEMS[it.type]?.s2tool)) add(t('Buy a Wrench at the ship terminal (Tools) to fix the hull.'), 'hint');
  }));
  const shipLights = [];
  let flickerApplied = -1;
  function flickerTick() {
    const want = C.lightFlicker(clientTier(), quota());
    if (want === flickerApplied) return;
    flickerApplied = want;
    if (!shipLights.length) for (const e of game.ship?.emitters || []) if (e.group === 'ship' && e !== game.ship.flood) shipLights.push({ e, f: e.flicker || 0 });
    for (const l of shipLights) l.e.flicker = Math.max(l.f, want);
  }
  let partT = 0;
  function clientTick(dt) {
    if (!game.ship?.group) return;
    buildMounts(); buildLadder();
    st.pullT = (st.pullT || 0) - dt;
    if (st.pullT <= 0) { st.pullT = 0.35; pullRun(); }
    const time = game.time || 0;
    for (const v of spotViews.values()) v.model.update(dt, time);
    partT -= dt;
    if (partT <= 0) {
      partT = 0.4;
      const cam = game.camera?.position;
      for (const v of spotViews.values()) {
        if (!cam || v.model.root.position.distanceTo(cam) > 28) continue;
        v.next -= 0.4;
        if (v.next > 0) continue;
        v.next = v.k === 'leak' ? 0.4 : v.k === 'spark' ? 1 + Math.random() * 1.8 : v.k === 'breach' ? 0.9 : 99;
        const wp = v.model.root.getWorldPosition(V2.set(0, 0, 0)).clone();
        try {
          if (v.k === 'spark') { game.particles?.burst(wp, 'sparks', null, 0.7); game.audio?.at?.('spark', wp, 0.5); }
          else if (v.k === 'leak') game.particles?.burst(wp, 'snowpuff', null, 0.6);
          else if (v.k === 'breach') { game.particles?.burst(wp, 'dust', null, 0.8); if (Math.random() < 0.5) game.particles?.burst(wp, 'sparks', null, 0.5); }
        } catch { /* cosmetic */ }
      }
    }
    for (const m of C.MOUNTS) { const mm = mountViews.get(m.id); if (mm) mm.ring.rotation.z += dt * 0.6; }
    repairTick(dt);
    try { hudTick(); } catch (e) { if (!st.w3) { st.w3 = 1; console.warn('[ship2] hud', e); } }
    flickerTick();
    if (R.tg && !game.input?.enabled) { /* menus open: the host cancels on release */ }
  }

  // ---- item models
  try {
    const im = mods?.itemModels;
    if (im) { im.set('s2_wrench', () => MD.createWrenchModel()); im.set('s2_torch', () => MD.createTorchModel()); im.set('s2_kit', () => MD.createRepairKitModel()); if (!im.has('fd_hydro')) im.set('fd_hydro', () => MD.createFruitModel()); }
  } catch (e) { console.warn('[ship2] item models', e); }

  const api = {
    /** host: damage the hull (source: landing | weather | creature | raid | siege | event) -> the new spot, or null (early-game caps / nothing free) */
    damage,
    /** host: forced repair of every spot (debug / tests) */
    repairAll() { if (host()) setHull(C.freshState(), 'debug'); },
    state: () => ({ hull, mounts, planters, integrity: integ(), tier: tier(), slots: slots(), sessions: H.sessions.size }),
    client: () => ({ ...cState(), integrity: clientInteg(), tier: clientTier(), spotViews: spotViews.size, mountViews: mountViews.size, plantViews: plantViews.size, ring: R.tg }),
    integrity: integ, tier,
    /** shipfaults hook: does the pre-flight check include an outer hull breach? */
    outerFaultWanted: () => enabled() && C.outerFaultWanted(hull, quota()),
    /** shipfaults hook: where the outer-fault station is (the worst spot, in front of it) */
    outerStation() { const w = C.worstSpot(hull); const sl = w && C.slotById(w.s); if (!sl) return { x: 0, y: 1.2, z: 3.95, ry: 0 }; return { x: sl.x + sl.n[0] * 0.5, y: sl.y, z: sl.z + sl.n[2] * 0.5, ry: Math.atan2(sl.n[0], sl.n[2]) }; },
    doorJam,
    /** shipyard rooms / other agents: add a planter (the pot is yours; ship2 grows the plant on it). slot = { id, x, z, y = pot top (0.5), ry } */
    addPlanterSlot(slot) { if (!slot?.id) return false; slotsP.set(slot.id, { y: 0.5, ry: 0, where: 'room', ...slot }); syncPlants(); return true; },
    removePlanterSlot(id) { slotsP.delete(id); const v = plantViews.get(id); if (v) { v.model.dispose(); plantViews.delete(id); } },
    planterSlots: () => [...slotsP.values()],
    decor: DECOR,
    dispose() {
      st.disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      boundNet?.off?.('msg:s2msg', onMsg);
      if (Object.prototype.hasOwnProperty.call(game, 'hostFinishTakeoff')) game.hostFinishTakeoff = origFinishTakeoff;
      if (origSquad && game.horde && game.horde.spawnHitSquad !== origSquad) game.horde.spawnHitSquad = origSquad;
      for (const v of spotViews.values()) { v.model.dispose(); if (v.light) game.lights?.remove(v.light); }
      spotViews.clear();
      for (const v of plantViews.values()) v.model.dispose();
      plantViews.clear();
      for (const m of mountViews.values()) m.dispose();
      mountViews.clear();
      ladderMesh?.removeFromParent(); ladderMesh?.geometry?.dispose(); ladderMesh?.material?.dispose();
      for (const c of railCols) { try { game.physics.removeCollider(c); } catch { /* ignore */ } }
      for (const l of shipLights) l.e.flicker = l.f;
      hudEl?.remove(); R.el?.remove();
      MD.disposeSpotModels();
    },
  };
  return api;
}
