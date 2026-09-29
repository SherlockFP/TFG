// [finish] HOMEWORLD ON-SITE RAID (wave 3), installed by homeworld.js. While the crew is away a raid is the abstract RaidSim (homeworld_core.js).
// The moment the crew lands on HOME during a raid the sim becomes the DATA HOLDER and real raiders take over:
//   * siege creatures (sg_swarmer / sg_runner / sg_brute, registered by siege.js) spawn along the raid bearing and walk a siege_core FlowField
//     built from the base (walls / towers / machines are blockers, plus the crew's deployables via game.deployables.blockers())
//   * raiders attack the nearest structure in reach (sim.hp = the same building hit points the abstract sim uses), then the pad (core %),
//     and hit players / crew deployables they meet; the crew's own guns, turrets and the base towers kill them for real
//   * towers really shoot: gun / sniper tracers, tesla arcs, flame bursts, cryo slow (numbers: homeworld_raid_core.js, node-tested)
// When the crew leaves, live raiders fold back into the abstract sim (their hp is carried). Host = simulation, everybody = visuals (hwmsg fx / hp).
import * as THREE from 'three';
import { addTranslations, t } from '../core/i18n.js';
import { distToHull, FlowField, inBox, SG } from './siege_core.js';
import { HOME_Y, HOME_HALF } from '../world/homeworld_map.js';
import { BUILDINGS, isWall, RAID } from './homeworld_core.js';
import * as K from './homeworld_raid_core.js';
import { clamp, angleDiff } from '../core/util.js';

addTranslations({
  'Crew on site: raiders are real, defend the base!': 'Ekip sahada: baskıncılar gerçek, üssü savun!', 'RAIDERS INBOUND': 'BASKINCILAR GELİYOR', 'Wave {n} incoming - get to the towers.': '{n}. dalga geliyor - kulelere geç.',
  'WAVE {n} REPELLED': '{n}. DALGA PÜSKÜRTÜLDÜ', 'The raiders retreat, wounded.': 'Baskıncılar yaralı çekiliyor.', 'The pad is under attack!': 'Pist saldırı altında!',
}, 'tr');
addTranslations({
  'Crew on site: raiders are real, defend the base!': 'Экипаж на месте: рейдеры настоящие, защищайте базу!', 'RAIDERS INBOUND': 'РЕЙДЕРЫ БЛИЗКО', 'Wave {n} incoming - get to the towers.': 'Волна {n} близко - к башням.',
  'WAVE {n} REPELLED': 'ВОЛНА {n} ОТБИТА', 'The raiders retreat, wounded.': 'Рейдеры отступают ранеными.', 'The pad is under attack!': 'Площадка под атакой!',
}, 'ru');

const FX = { gun: 0, sniper: 1, tesla: 2, flame: 3, cryo: 4, mine: 5 };
const FXN = ['gun', 'sniper', 'tesla', 'flame', 'cryo', 'mine'];
const _d = { x: 0, z: 0 };
const smoke = { count: 6, color: [0x555555, 0x777777, 0x333333], speed: 0.8, up: 1.6, life: 1.1, size: 0.22, gravity: -1.5, drag: 2 };

export function installHomeRaid(game, hw) {
  const mods = game.mods;
  const H = { active: false, members: new Map(), queue: [], spawnAcc: 0, waveN: 0, waveT: 0, waveHp0: 0, flow: null, dirty: true, flowT: 0, solid: [], tstate: K.newTowerState(), fx: [], fxT: 0, hpSent: new Map(), hpT: 0, bmap: new Map(), carry: 0, sec: 0, lastCore: 100 };
  const host = () => !!game.isHost;
  const M = () => game.creatures;
  const lvl = () => 1 + Math.floor((game.run?.quotaIndex || 0) / 5);

  // ------------------------------------------------------------------------------------------------ host: flow field / blockers
  function bstate() { const m = new Map(); for (const b of game.profile?.homeworld?.b || []) m.set(b.i, b); return m; }
  function blockers(sim) {
    const out = [];
    for (const [id, inf] of sim.info) {
      if (!sim.alive(id)) continue;
      const d = BUILDINGS[inf.t], b = H.bmap.get(id);
      if (d.trap || !b) continue;
      const wall = isWall(inf.t), n = d.size;
      out.push({ id, x: inf.x, z: inf.z, hx: wall ? 1.5 : n * 1.5 - 0.4, hz: wall ? 0.35 : n * 1.5 - 0.4, yaw: -b.r * Math.PI / 2, cost: wall ? 6 : 14, wall });
    }
    try { for (const b of game.deployables?.blockers?.() || []) out.push(b); } catch { /* deployables optional */ }
    return out;
  }
  function refreshFlow(sim, force) {
    if (!H.flow) H.flow = new FlowField(HOME_HALF + 12, 2);
    if (!(H.dirty || force)) return;
    const list = blockers(sim);
    H.flow.setBlockers(list); H.flow.compute();
    H.solid = list; H.dirty = false;
  }

  // ------------------------------------------------------------------------------------------------ host: spawning + raider AI
  function spawnOne(sim, e) {
    const c = M().hostSpawn(e.type, new THREE.Vector3(e.x, HOME_Y, e.z), { level: lvl(), zone: 'out', state: 'run', affix: null, variant: null });
    if (!c) return;
    c.data.hw = 1; c.data.tt = 0; c.data.tgt = null;
    H.members.set(c.id, true);
    H.waveHp0 += c.maxHp || 0;
  }
  function move(c, S, dx, dz, dt) {
    let speed = M().speedMul(c, S.run);
    if (c.slowT > 0) { speed *= c.slowMul || 0.55; c.slowT -= dt; }
    const l = Math.hypot(dx, dz) || 1, step = speed * dt;
    const nx = c.pos.x + (dx / l) * step, nz = c.pos.z + (dz / l) * step, r = (S.radius || 0.5) * 0.7;
    if (distToHull(nx, nz) < 0.9) return { blocked: 'ship' };
    for (const b of H.solid) if (inBox(nx, nz, b, r) && !inBox(c.pos.x, c.pos.z, b, r)) return { blocked: b };
    c.pos.x = nx; c.pos.z = nz; c.pos.y = HOME_Y;
    c.yaw += clamp(angleDiff(c.yaw, Math.atan2(dx, dz)), -9 * dt, 9 * dt);
    return null;
  }
  function stepRaider(sim, c, dt) {
    const S = SG[c.type]; if (!S) return;
    if (c.stunT > 0) return;
    const doAttack = (fn) => { if (c.age < 1) return; if (c.state !== 'attack') c.setState('attack'); if (c.cooldown <= 0) { c.cooldown = S.cd; fn(); } };
    if (c.state === 'attack' && c.t < 0.4) return;
    c.data.tt -= dt;
    if (c.data.tt <= 0) {
      c.data.tt = 0.35 + Math.random() * 0.25;
      // players first (close), then structures in reach, else the pad
      let tg = null;
      for (const p of game.aiPlayers()) if (!p.dead && !p.inShip && Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z) < (S.hunt || 4.2)) { tg = { k: 'player', id: p.id }; break; }
      if (!tg) { const b = K.pickBuildingTarget(sim, c.type, c.pos.x, c.pos.z); if (b) tg = { k: 'b', id: b.id, x: b.x, z: b.z, size: b.size }; }
      if (!tg) { const D = game.deployables, dep = D?.nearest?.(c.pos.x, c.pos.z, S.deps || 8, null); if (dep) tg = { k: 'dep', id: dep.id }; }
      c.data.tgt = tg;
    }
    const tg = c.data.tgt;
    const dmgMul = (1 + 0.1 * ((c.level || 1) - 1));
    if (tg?.k === 'player') {
      const p = game.aiPlayers().find((q) => q.id === tg.id);
      if (!p || p.dead || p.inShip) { c.data.tgt = null; c.data.tt = 0; return; }
      const dx = p.pos.x - c.pos.x, dz = p.pos.z - c.pos.z, d = Math.hypot(dx, dz);
      if (d < S.reach && Math.abs(p.pos.y - c.pos.y) < 2.6) { c.yaw = Math.atan2(dx, dz); doAttack(() => M().attack(c, p, Math.round(c.dmg), 'siege')); return; }
      if (d > 30) { c.data.tgt = null; c.data.tt = 0; return; }
      c.setState('run'); move(c, S, dx, dz, dt); return;
    }
    if (tg?.k === 'b') {
      if (!sim.alive(tg.id)) { c.data.tgt = null; c.data.tt = 0; return; }
      const dx = tg.x - c.pos.x, dz = tg.z - c.pos.z, d = Math.hypot(dx, dz) - tg.size * 1.2;
      if (d < S.reach) {
        c.yaw = Math.atan2(dx, dz);
        doAttack(() => { const r = K.hitBuilding(sim, tg.id, S.dep * K.SITE.hitMul * dmgMul); H.dirty ||= r.wrecked; markHp(sim, tg.id); });
        return;
      }
      c.setState('run'); const r = move(c, S, dx, dz, dt);
      if (r?.blocked && r.blocked !== 'ship' && r.blocked.id !== undefined && sim.info.has(r.blocked.id)) c.data.tgt = { k: 'b', id: r.blocked.id, x: r.blocked.x, z: r.blocked.z, size: BUILDINGS[sim.info.get(r.blocked.id).t].size };
      return;
    }
    if (tg?.k === 'dep') {
      const D = game.deployables, dep = D?.get?.(tg.id);
      if (!dep || dep.dead) { c.data.tgt = null; c.data.tt = 0; return; }
      const dx = dep.pos.x - c.pos.x, dz = dep.pos.z - c.pos.z, d = Math.hypot(dx, dz) - Math.max(dep.def.hx, dep.def.hz) * 0.7;
      if (d < S.reach) { c.yaw = Math.atan2(dx, dz); doAttack(() => D.damage(dep, S.dep * dmgMul)); return; }
      c.setState('run'); move(c, S, dx, dz, dt); return;
    }
    // the pad: follow the flow field, hit the core when in reach
    if (distToHull(c.pos.x, c.pos.z) <= S.reach + 0.5) {
      c.yaw = Math.atan2(-c.pos.x, -c.pos.z);
      doAttack(() => { K.hitCore(sim, S, dmgMul); });
      return;
    }
    const ok = H.flow.dirAt(c.pos.x, c.pos.z, _d);
    if (!ok) { const l = Math.hypot(c.pos.x, c.pos.z) || 1; _d.x = -c.pos.x / l; _d.z = -c.pos.z / l; }
    c.setState('run');
    const r = move(c, S, _d.x, _d.z, dt);
    if (r?.blocked && r.blocked !== 'ship' && r.blocked.id !== undefined && sim.info.has(r.blocked.id)) c.data.tgt = { k: 'b', id: r.blocked.id, x: r.blocked.x, z: r.blocked.z, size: BUILDINGS[sim.info.get(r.blocked.id).t].size };
  }

  // ------------------------------------------------------------------------------------------------ host: state changes broadcast
  function markHp(sim, id) { H.hpSent.set(id, -1); void sim; }
  function flushFx(dt) {
    H.fxT -= dt;
    if (H.fxT > 0) return;
    H.fxT = 0.1;
    if (H.fx.length) { game.net.broadcast('hwmsg', { k: 'fx', s: H.fx.splice(0, 14) }); }
  }
  function flushHp(sim, dt) {
    H.hpT -= dt;
    if (H.hpT > 0) return;
    H.hpT = 0.5;
    const out = [];
    for (const [id, h] of sim.hp) {
      const mx = sim.maxHp.get(id) || 1, pct = Math.round((h / mx) * 100);
      if (H.hpSent.get(id) !== pct) { H.hpSent.set(id, pct); out.push([id, pct]); }
    }
    const core = Math.round(sim.core);
    if (out.length || core !== H.lastCore) { H.lastCore = core; game.net.broadcast('hwmsg', { k: 'hp', h: out, core }); }
  }
  const banner = (main, sub) => game.net.broadcast('hwmsg', { k: 'banner', main, sub });

  // ------------------------------------------------------------------------------------------------ host: enter / leave / tick
  function enter(sim) {
    if (H.active) return;
    H.active = true; H.members.clear(); H.queue = []; H.tstate = K.newTowerState(); H.bmap = bstate(); H.dirty = true; H.hpSent.clear(); H.sec = 0;
    H.carry = K.enterSite(sim);
    if (game.run) game.run.siegeDay = game.run.day;   // a ship siege never starts on top of a home raid
    refreshFlow(sim, true);
    banner(t('RAIDERS INBOUND'), t('Crew on site: raiders are real, defend the base!'));
    K.setPool(sim, 0, 0, 0, 1);
  }
  function killAll(silent = true) { for (const id of [...H.members.keys()]) { const c = M().host.get(id); if (c && !c.dead) M().kill(c, null, { silent }); } H.members.clear(); H.queue = []; }
  function leave(sim) {
    if (!H.active) return;
    let hp = 0;
    for (const id of H.members.keys()) { const c = M().host.get(id); if (c && !c.dead) hp += c.hp || 0; }
    for (const e of H.queue) hp += SG[e.type].hp;
    killAll(true);
    K.leaveSite(sim, hp);
    H.active = false; H.flow = null;
  }
  function beginWave(sim) {
    const wave = K.siteWave(sim, H.carry);
    H.carry = 0;
    sim.w += 1; sim.phase = 'wave'; H.waveT = 0; H.waveN = wave.total; H.waveHp0 = 0;
    const q = [];
    for (const e of wave.list) for (let i = 0; i < e.n; i++) q.push({ type: e.type });
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    q.forEach((e, i) => { const p = K.spawnPoint(sim, i); e.x = p.x + (Math.random() - 0.5) * 4; e.z = p.z + (Math.random() - 0.5) * 4; });
    H.queue = q; H.spawnAcc = 0;
    H.waveEst = q.reduce((a, e) => a + SG[e.type].hp * (1 + 0.18 * (lvl() - 1)), 0);
    banner(`${t('WAVE')} ${sim.w}/${sim.W}`, t('Wave {n} incoming - get to the towers.').replace('{n}', String(sim.w)));
  }
  /** host tick while the crew is on HOME. Returns true when a whole second passed (the caller republishes the raid frame) */
  function tick(sim, dt) {
    if (!H.active) enter(sim);
    if (sim.done) return false;
    sim.t += dt; H.sec += dt;
    refreshFlowMaybe(sim, dt);
    if (sim.phase === 'prep' || sim.phase === 'lull') {
      sim.timer -= dt;
      if (sim.timer <= 0) { if (sim.w >= sim.W) { sim.finish(); return finish(sim); } beginWave(sim); }
    } else if (sim.phase === 'wave') {
      H.waveT += dt;
      H.spawnAcc += dt * K.SITE.spawnPerSec;
      while (H.spawnAcc >= 1 && H.queue.length && H.members.size < K.SITE.maxAlive) { H.spawnAcc -= 1; spawnOne(sim, H.queue.shift()); }
      if (!H.queue.length) H.spawnAcc = Math.min(H.spawnAcc, 1);
      const raiders = [];
      let alive = 0, hpSum = 0;
      for (const id of [...H.members.keys()]) {
        const c = M().host.get(id);
        if (!c || c.dead) { H.members.delete(id); continue; }
        try { stepRaider(sim, c, dt); } catch (e) { console.error('[hw-raid] step', e); }
        raiders.push({ id, x: c.pos.x, z: c.pos.z, hp: c.hp, maxHp: c.maxHp });
        alive++; hpSum += c.hp;
      }
      // towers + traps (host damage + fx)
      const applyHit = (h) => { const c = M().host.get(h.id); if (!c || c.dead) return; if (h.dmg > 0) M().damage(h.id, h.dmg, null, {}); if (h.slow) { c.slowT = Math.max(c.slowT || 0, 0.6); c.slowMul = 1 - h.slow; } };
      for (const s of K.towerStep(sim, H.tstate, raiders, dt, HOME_Y)) {
        for (const h of s.hits) applyHit(h);
        if (!s.quiet) H.fx.push([FX[s.t], +s.ax.toFixed(1), +s.ay.toFixed(1), +s.az.toFixed(1), +s.bx.toFixed(1), +s.bz.toFixed(1), s.arcs ? s.arcs.slice(1).flatMap((a) => [+a[0].toFixed(1), +a[1].toFixed(1)]) : undefined]);
      }
      for (const h of K.trapStep(sim, raiders, dt)) { applyHit(h); if (h.blast) H.fx.push([FX.mine, +h.blast.x.toFixed(1), HOME_Y, +h.blast.z.toFixed(1), +h.blast.x.toFixed(1), +h.blast.z.toFixed(1)]); }
      alive = 0; hpSum = 0;
      for (const [id] of H.members) { const c = M().host.get(id); if (c && !c.dead) { alive++; hpSum += c.hp; } }
      const queuedHp = H.queue.reduce((a, e) => a + SG[e.type].hp * (1 + 0.18 * (lvl() - 1)), 0);
      K.setPool(sim, alive + H.queue.length, H.waveN, hpSum + queuedHp, H.waveHp0 + queuedHp || H.waveEst || 1);
      if (!H.queue.length && !H.members.size) {
        K.waveCleared(sim, H.waveN);
        banner(t('WAVE {n} REPELLED').replace('{n}', String(sim.w)), '');
      } else if (H.waveT > K.SITE.waveTimeout && sim.w < sim.W) {   // stragglers retreat wounded (their hp carries to the next wave)
        let hp = 0; for (const id of H.members.keys()) { const c = M().host.get(id); if (c && !c.dead) hp += c.hp || 0; }
        killAll(true); H.carry += hp; sim.killed += Math.max(0, H.waveN - 1); sim.pool = null; sim.phase = 'lull'; sim.timer = 4;
        banner(t('The raiders retreat, wounded.'), '');
      }
    }
    flushFx(dt); flushHp(sim, dt);
    if (sim.core <= 0 || sim.t >= K.SITE.hardCap) { sim.finish(); return finish(sim); }
    if (H.sec >= 1) { H.sec -= 1; return true; }
    return false;
  }
  function refreshFlowMaybe(sim, dt) {
    H.flowT -= dt;
    if (H.flowT <= 0) { H.flowT = 0.6; refreshFlow(sim, false); }
    for (const [id] of sim.hp) if (!sim.alive(id) && H.solid.some((b) => b.id === id)) { H.dirty = true; break; }
  }
  function finish(sim) { killAll(true); H.active = false; H.flow = null; void sim; return true; }

  // ------------------------------------------------------------------------------------------------ client: visuals (every peer on HOME)
  const scene = game.scene;
  const tGeo = new THREE.BoxGeometry(1, 1, 1);
  const MATS = [0xffe890, 0xd8f4ff, 0x9ae8ff, 0xff9a30, 0xb8e8ff, 0xffb060].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false }));
  const free = [], live = [];
  const hpPct = new Map(), smokeT = new Map();
  const a3 = new THREE.Vector3(), b3 = new THREE.Vector3();
  function beam(a, b, mat, w, life) {
    let m = free.pop();
    if (!m) { m = new THREE.Mesh(tGeo, mat); m.frustumCulled = false; scene.add(m); }
    m.material = mat;
    const len = a.distanceTo(b) || 0.01;
    m.position.copy(a).lerp(b, 0.5); m.lookAt(b); m.scale.set(w, w, len); m.visible = true;
    live.push({ m, life });
  }
  function onFx(msg) {
    if (!Array.isArray(msg.s)) return;
    for (const e of msg.s) {
      if (!Array.isArray(e)) continue;
      const kind = FXN[e[0]];
      if (!kind) continue;
      a3.set(e[1], e[2], e[3]); b3.set(e[4], HOME_Y + 0.9, e[5]);
      const mat = MATS[e[0]];
      if (kind === 'gun') { beam(a3, b3.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4)), mat, 0.06, 0.07); sndAt('turret_fire', a3, 0.35, 1.4 + Math.random() * 0.3, e); }
      else if (kind === 'sniper') { beam(a3, b3, mat, 0.12, 0.22); sndAt('shotgun_fire', a3, 0.5, 0.7, e); }
      else if (kind === 'tesla') {
        let prev = a3.clone();
        const pts = [b3.clone()]; const arcs = e[6] || [];
        for (let i = 0; i < arcs.length; i += 2) pts.push(new THREE.Vector3(arcs[i], HOME_Y + 0.9, arcs[i + 1]));
        for (const p of pts) { const mid = prev.clone().lerp(p, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9)); beam(prev, mid, mat, 0.07, 0.15); beam(mid, p, mat, 0.07, 0.15); prev = p; }
        sndAt('taser_zap', a3, 0.45, 1, e);
      } else if (kind === 'flame') {
        for (let i = 0; i < 3; i++) beam(a3, b3.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 0.8, (Math.random() - 0.5) * 1.6)), mat, 0.18, 0.12);
        try { game.particles?.burst(b3, { count: 5, color: [0xff7a20, 0xffc040, 0xff3a10], speed: 1.6, up: 1.4, life: 0.5, size: 0.18, gravity: -2, drag: 2 }, null, 0.6); } catch { /* particles */ }
        sndAt('spark', a3, 0.25, 0.6, e);
      } else if (kind === 'cryo') beam(a3, b3, mat, 0.05, 0.12);
      else if (kind === 'mine') { try { game.particles?.burst(new THREE.Vector3(e[1], HOME_Y + 0.4, e[3]), { count: 22, color: [0xffa040, 0xffe080, 0x808080], speed: 4, up: 3, life: 0.7, size: 0.2, gravity: 6, drag: 1.5 }, null, 1); game.audio?.at?.('explosion', new THREE.Vector3(e[1], HOME_Y + 0.5, e[3]), 0.8, { refDistance: 8 }); game.engine?.shake?.(0.25); } catch { /* fx optional */ } }
    }
  }
  const sndT = new Map();
  function sndAt(name, pos, vol, pitch, e) {
    const k = `${e[1]}|${e[3]}`;
    if ((game.time || 0) - (sndT.get(k) || 0) < 0.14) return;
    sndT.set(k, game.time || 0);
    try { game.audio?.play(name, { pos: pos.clone(), volume: vol, pitch, refDistance: 6, maxDistance: 70 }); } catch { /* audio optional */ }
  }
  function onHp(msg) {
    for (const [id, pct] of msg.h || []) {
      hpPct.set(id, pct);
      const v = hw.views?.get(id);
      if (v && pct <= 0) hw.setWrecked?.(v.model, true);
    }
    if (typeof msg.core === 'number') H.coreShown = msg.core;
  }
  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) { const b = live[i]; b.life -= dt; if (b.life <= 0) { b.m.visible = false; free.push(b.m); live.splice(i, 1); } }
    // burning / smoking buildings
    if (!hpPct.size || !hw.views) return;
    for (const [id, pct] of hpPct) {
      if (pct >= 60 || pct <= 0) continue;
      const v = hw.views.get(id);
      if (!v) continue;
      const tt = (smokeT.get(id) || 0) - dt;
      if (tt > 0) { smokeT.set(id, tt); continue; }
      smokeT.set(id, 0.9 + Math.random() * 0.6);
      try { game.particles?.burst(v.model.position.clone().add(new THREE.Vector3(0, 1.5, 0)), pct < 30 ? { ...smoke, color: [0x222222, 0x444444, 0xff5a20] } : smoke, null, 0.7); } catch { /* particles */ }
    }
  }
  function clearVisuals() { hpPct.clear(); smokeT.clear(); H.coreShown = undefined; for (const b of live) { b.m.visible = false; free.push(b.m); } live.length = 0; }
  void mods;

  return {
    active: () => H.active, enter, leave, tick, killAll, onFx, onHp, update, clearVisuals, hpPct,
    state: () => ({ active: H.active, alive: H.members.size, queued: H.queue.length, wave: H.waveN }),
    dispose() { killAll(true); for (const m of [...free, ...live.map((b) => b.m)]) m.removeFromParent(); tGeo.dispose(); for (const m of MATS) m.dispose(); },
  };
}
export { RAID };
