// Bosses: THE FOREMAN - an indoor boss that guards the largest room of tier 2+ facilities.
//
//   installBosses(game) -> { hostOnMoonPopulated(), hostSpawnForeman(), update(dt), dispose() }
//
// Host: spawn roll (seeded from the run seed), AI behavior (registered with registerCreature, so it runs
// inside CreatureManager.hostUpdate like every other creature), stun resistance, loot drop on death.
// Every peer: procedural model (window.__kefalMods.creatureModels), furnace light, state sounds,
// slam telegraph ring + impact shake (fx 'bslam'), top-of-screen boss HP bar.
//
// Replicated state: the creature snapshot carries pos / yaw / state / hp and `extra`, which the Foreman
// uses as bit flags: 1 = engaged (HP bar visible), 2 = enraged (below 50 % HP).
// States: idle, walk (patrol / walking home), run (chase), windup (0.8 s slam telegraph), slam (impact +
// recovery), roar (aggro / enrage / summon), stunned, dead.
// Stun resistance lives on the boss instance (see installStunGuard): every stun source writes c.stunT and
// then calls c.setState('stunned'), and the guard decides synchronously inside that call, so a stun the
// boss is immune to never changes its state or clock and never reaches a snapshot.
import * as THREE from 'three';
import { registerCreature } from './creatures.js';
import { registerItem, ITEMS } from './items.js';
import { MOONS } from './moons.js';
import { RNG } from '../core/rng.js';
import { angleDiff } from '../core/util.js';
import { rollWeaponAffixes } from './loot.js';
import { t, addTranslations, sysMsg } from '../core/i18n.js';

addTranslations({
  'BOSS DEFEATED': 'BOSS YENİLDİ',
  'The Foreman has been decommissioned': 'Ustabaşı hizmet dışı bırakıldı',
  'The Legacy Bot has been deprecated': 'Legacy Bot kullanımdan kaldırıldı',
});
import {
  G, xf, merged, lam, bas, basI, tex, noiseFill, mk, pv, Tinter, clamp, lerp, smooth, damp, keys, rng, TAU, PI,
} from '../models/modelkit.js';

export const FOREMAN = 'foreman';
export const FOREMAN_DEF = {
  name: 'The Foreman', hp: 1100, dmg: 50, walk: 1.7, run: 3.3, power: 0, xp: 1600, coin: 260,
  zone: 'in', radius: 0.9, height: 2.8, boss: true,
  deathText: 'was flattened by the Foreman.',     // Game.deathText() falls back to CREATURES[cause].deathText
  lore: 'Site supervisor of a facility nobody remembers. His hard hat is welded to his skull and his chest still burns Company coal. '
    + 'Slow, relentless, territorial. When his arms go up, get out of the way. Below half health the furnace roars and the vents empty.',
};

const F_ENGAGED = 1, F_ENRAGED = 2;
const S_CHASE = 'run';          // same chase state name as every other creature (director, steam jets, ...)
const SLAM_TELEGRAPH = 0.8;     // s, windup before the slam lands
const SLAM_RECOVER = 0.75;      // s, stuck in the slam pose afterwards
const SLAM_KEYS = [[0, 0], [0.09, 1], [0.42, 1], [SLAM_RECOVER, 0]];   // slam pose weight over the slam state
const SLAM_RADIUS = 3;          // m, damage radius around the impact point
const SLAM_FWD = 0.9;           // m, impact point in front of the boss
const SLAM_TRIGGER = 2.4;       // m, a player this close to the boss starts a windup
const LEASH = 50;               // m from the lair centre
const AGGRO_RANGE = LEASH * 0.8; // m from the lair centre: no new aggro further out than this
const LOSE_TARGET_T = 9;        // s without a valid target -> go home
const ROAR_CD = 12;             // s between two engage roars
const SUMMON_EVERY = 20;        // s while enraged
const MAX_MINIONS = 8;
const STUN_MAX = 1.0;           // s, stuns are shortened to this...
const STUN_IMMUNE = 7;          // s ...and the boss is immune for this long afterwards
const REGEN = 0.015;            // fraction of max HP per second while not engaged
const REGEN_EVADE = 0.08;       // fraction of max HP per second while evading home after a leash reset
const HP_BAR_RANGE = 40;
const TREASURE = [['goldbar', 4], ['ring', 3], ['x_goldbars', 2], ['x_nuggets', 2], ['x_silverbar', 1], ['trophy', 1]];
// loot throw: [spawn distance, landing check distance, outward speed]; the last try is a gentle pop in place
const DROP_TRIES = [[1.1, 2.6, 2.2], [0.6, 1.3, 0.8]];

const _v = new THREE.Vector3();
const _from = new THREE.Vector3();
// per-game director (host tracking of every live Foreman), so the module-level behavior can reach it
const REG = new WeakMap();

// ============================================================================================
// Lair selection (pure, deterministic from the facility layout)
// ============================================================================================
export function findLair(fac) {
  const L = fac?.layout;
  if (!L || !L.rooms?.length) return null;
  const C = L.cell;
  let best = null, bs = -1;
  for (const r of L.rooms) {
    if (r.type === 'entrance' || r.type === 'vault' || r.type === 'generator') continue;
    const dist = L.distOf && L.idx ? Math.max(0, L.distOf[L.idx(r.cx, r.cz)] || 0) : 0;
    const score = r.w * r.h * 1000 + dist;          // largest room, ties -> farthest from the entrance
    if (score > bs) { bs = score; best = r; }
  }
  if (!best) return null;
  const cx = L.ox + (best.cx + 0.5) * C, cz = L.oz + (best.cz + 0.5) * C;
  let sx = cx, sz = cz;
  const nav = fac.nav;
  if (nav && !nav.walkableAt(cx, cz)) {
    const g = nav.nearestWalkable(...nav.toGrid(cx, cz), 6);
    if (g) { const w = nav.toWorld(g[0], g[1]); sx = w.x; sz = w.z; }
  }
  return {
    room: best.id, type: best.type, cx, cz, sx, sz,
    x0: L.ox + best.x * C + 1, x1: L.ox + (best.x + best.w) * C - 1,
    z0: L.oz + best.z * C + 1, z1: L.oz + (best.z + best.h) * C - 1,
    r: Math.max(best.w, best.h) * C * 0.5,
  };
}

// ============================================================================================
// Host AI
// ============================================================================================
function setFlags(c) { c.extra = (c.data.engaged ? F_ENGAGED : 0) | (c.data.enraged ? F_ENRAGED : 0); }

function turnToward(c, x, z, dt, rate) {
  const want = Math.atan2(x - c.pos.x, z - c.pos.z);
  c.yaw += clamp(angleDiff(c.yaw, want), -rate * dt, rate * dt);
}

function patrolPoint(c, M) {
  const L = c.data.lair, nav = M.nav(c);
  for (let i = 0; i < 8; i++) {
    const x = L.x0 + Math.random() * Math.max(0.1, L.x1 - L.x0), z = L.z0 + Math.random() * Math.max(0.1, L.z1 - L.z0);
    if (!nav || nav.walkableAt(x, z)) return { x, z };
  }
  return { x: L.sx, z: L.sz };
}

function engage(c, p, M) {
  const d = c.data;
  const first = !d.engaged;
  d.engaged = true; d.returning = false; d.evade = false; d.targetId = p.id; d.lostT = 0; d.retargetT = 1; d.progT = 0; d.stuck = 0;
  c.target = p.id;
  setFlags(c);
  if (!first) return;
  const now = M.game.time || 0;
  if (now >= (d.nextRoarT || 0)) { d.nextRoarT = now + ROAR_CD; d.roarLen = 1.0; c.setState('roar'); M.noise(c.pos, 3); }
  else c.setState(S_CHASE);
}

// Walk home. While `returning` the boss ignores hits, sight and noise until it is back inside its lair
// (MMO-style evade), so shooting a leashed boss cannot stall it in a re-engage / roar loop.
function disengage(c, M) {
  const d = c.data;
  d.engaged = false; d.targetId = null; d.lostT = 0; c.target = null; d.returning = true;
  d.evade = true;           // CreatureManager.damage() ignores hits while this is set (no free damage on a leashed boss)
  setFlags(c);
  M.goTo(c, d.lair.sx, d.lair.sz);
  c.setState('walk');
}

const lairDist = (c) => Math.hypot(c.pos.x - c.data.lair.cx, c.pos.z - c.data.lair.cz);

// ---- stun resistance --------------------------------------------------------------------------
// The first stun is cut to STUN_MAX and starts STUN_IMMUNE seconds of immunity. A stun while immune, or
// while an accepted stun is still running, is refused: stunT goes back to what it was and the state and
// its clock (e.g. a windup in progress) are untouched. Returns true when the state may become 'stunned'.
function gateStun(c, now) {
  const d = c.data;
  const end = d.stunEnd || 0;
  if (now < end) { c.stunT = Math.max(0, Math.min(c.stunT, end - now)); return false; }   // never extend
  if (now < (d.stunImmEnd || 0) || !(c.stunT > 0)) { c.stunT = 0; return false; }
  c.stunT = Math.min(c.stunT, STUN_MAX);
  d.stunEnd = now + c.stunT;
  d.stunImmEnd = now + STUN_IMMUNE;
  return true;
}

// CreatureManager.damage() and the steam jets in setpieces.js both do `c.stunT = max(c.stunT, s);
// c.setState('stunned')`. Shadowing setState on this one HostCreature gates those stuns synchronously,
// before anything can change the state, reset c.t or put 'stunned' in a snapshot.
function installStunGuard(c, game) {
  if (Object.prototype.hasOwnProperty.call(c, 'setState')) return;
  const base = Object.getPrototypeOf(c).setState;
  c.setState = function setStateStunGated(s) {
    if (s === 'stunned' && !gateStun(this, game.time || 0)) return;
    base.call(this, s);
  };
}

function pickTarget(c, players, cur) {
  let best = null, bs = -Infinity;
  for (const p of players) {
    if (p.inShip) continue;
    const dist = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
    if (dist > 40 || Math.abs(p.pos.y - c.pos.y) > 4) continue;
    // MMO-style threat: damage dealt + proximity, with some stickiness to the current target
    const score = (c.attackers.get(p.id) || 0) + (40 - dist) * 5 + (cur && p.id === cur.id ? 60 : 0);
    if (score > bs) { bs = score; best = p; }
  }
  return best;
}

function doSlam(c, M) {
  const g = M.game;
  const cx = c.pos.x + Math.sin(c.yaw) * SLAM_FWD, cz = c.pos.z + Math.cos(c.yaw) * SLAM_FWD, cy = c.pos.y;
  _from.set(c.pos.x, cy + 1.4, c.pos.z);
  for (const p of g.aiPlayers()) {
    if (p.dead || p.inShip) continue;
    const dx = p.pos.x - cx, dz = p.pos.z - cz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > SLAM_RADIUS || Math.abs(p.pos.y - cy) > 2.5) continue;
    if (g.physics?.lineOfSight && !g.physics.lineOfSight(_from, p.eye)) continue;
    const k = dist < 1.5 ? 1 : 1 - 0.45 * ((dist - 1.5) / (SLAM_RADIUS - 1.5));
    g.hostHurtPlayer(p.id, Math.round(c.dmg * k), 'foreman', c.id, c.pos);
    g.hostSlowPlayer?.(p.id, 1.2);
  }
  g.net.broadcast('fx', { k: 'bslam', p: [+cx.toFixed(2), +cy.toFixed(2), +cz.toFixed(2)], r: SLAM_RADIUS });
  M.noise(_from, 3);
}

function summonMinions(c, M) {
  const g = M.game, d = c.data;
  d.minions = d.minions.filter((id) => { const m = M.host.get(id); return m && !m.dead; });
  const room = MAX_MINIONS - d.minions.length;
  if (room <= 0) return false;
  const n = Math.min(room, 2 + Math.floor(Math.random() * 3));
  const nav = M.nav(c);
  const y = g.world.facility?.layout.y ?? c.pos.y;
  let spawned = 0;
  for (let k = 0; k < n; k++) {
    const a = Math.random() * TAU, r = 2 + Math.random() * 1.5;
    let x = c.pos.x + Math.cos(a) * r, z = c.pos.z + Math.sin(a) * r;
    if (nav && !nav.walkableAt(x, z)) {
      const w = nav.randomWalkable(Math.random, c.pos.x, c.pos.z, 3);
      if (!w) continue;
      x = w.x; z = w.z;
    }
    const m = M.hostSpawn('scuttler', new THREE.Vector3(x, y, z), { level: Math.max(1, c.level - 1), zone: 'in', state: 'idle' });
    if (!m) continue;
    spawned++;
    d.minions.push(m.id);
    if (d.targetId) { m.target = d.targetId; m.setState('run'); }
  }
  if (spawned) g.net.broadcast('fx', { k: 'snd', s: 'vent_crawl', p: [c.pos.x, c.pos.y + 0.5, c.pos.z], v: 1, r: 6, m: 50 });
  return spawned > 0;
}

function patrolTick(c, dt, M, sense) {
  const d = c.data;
  if (c.maxHp && c.hp < c.maxHp) {
    c.hp = Math.min(c.maxHp, Math.round((c.hp + c.maxHp * (d.returning ? REGEN_EVADE : REGEN) * dt) * 10) / 10);
    if (c.hp >= c.maxHp && d.enraged) { d.enraged = false; setFlags(c); }
  }
  d.calmT = Math.max(0, (d.calmT || 0) - dt);
  const home = lairDist(c);
  // walking home after a leash / lost target: evade (hits, sight and noise are ignored) until back in the lair
  if (d.returning) {
    c.target = null;
    if (home > Math.max(4, d.lair.r * 0.8)) {
      if (c.state !== 'walk' || !c.path) { M.goTo(c, d.lair.sx, d.lair.sz); c.setState('walk'); }
      if (!M.follow(c, dt, c.def.walk * 1.3, 2.5)) return;
      c.setState('idle'); d.idleFor = 1;          // arrived (or no path home): stand down
    }
    d.returning = false; d.evade = false;
    d.calmT = Math.max(d.calmT || 0, 2);
  }
  const players = M.playersFor(c);
  const aggro = home < AGGRO_RANGE;              // never pick a new fight far from the lair
  // got hit by a player -> fight back, but only when the attacker stands inside the leash: shooting the boss from
  // beyond it used to ping-pong it between its lair and the leash edge forever (the "re-engage stall")
  if (c.target) {
    let p = null;
    for (const q of players) if (q.id === c.target) { p = q; break; }
    const reach = p && Math.hypot(p.pos.x - d.lair.cx, p.pos.z - d.lair.cz) < LEASH * 0.85;
    if (aggro && p && !p.inShip && reach) { engage(c, p, M); return; }
    c.target = null;
  }
  if (sense && aggro && d.calmT <= 0) {
    for (const p of players) {
      if (p.inShip) continue;
      const dist = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
      if (Math.abs(p.pos.y - c.pos.y) > 3) continue;
      if (dist < 4.5 || (dist < 18 && M.canSee(c, p, 16, 150))) { engage(c, p, M); return; }
    }
    const n = M.hear(c, 12);
    const L = d.lair;
    if (n && Math.hypot(n.pos.x - L.cx, n.pos.z - L.cz) < L.r + 6 && c.state === 'idle') { M.goTo(c, n.pos.x, n.pos.z); c.setState('walk'); }
  }
  if (c.state === 'walk') {
    if (M.follow(c, dt, c.def.walk * 0.75, 2.5)) { c.setState('idle'); d.idleFor = 2 + Math.random() * 4; }
  } else if (c.state === 'idle') {
    if (c.t > (d.idleFor ?? 3)) { const pt = patrolPoint(c, M); M.goTo(c, pt.x, pt.z); c.setState('walk'); }
  } else c.setState('idle');
}

function engagedTick(c, dt, M, sense) {
  const d = c.data;
  const players = M.playersFor(c);
  let tgt = null;
  for (const p of players) if (p.id === d.targetId && !p.inShip) { tgt = p; break; }
  d.retargetT -= dt;
  if (!tgt || d.retargetT <= 0) {
    d.retargetT = 1.2;
    const nt = pickTarget(c, players, tgt);
    if (nt) { tgt = nt; d.targetId = nt.id; }
  }
  // keep c.target on the threat target (damage() overwrites it with the last attacker; the director reads it)
  c.target = tgt ? tgt.id : null;
  if (lairDist(c) > LEASH) { disengage(c, M); return; }
  if (!tgt) {
    d.lostT += dt;
    if (d.lostT > LOSE_TARGET_T) disengage(c, M);
    else if (c.state !== 'idle') c.setState('idle');
    return;
  }
  if (sense) {
    if (M.canSee(c, tgt, 30, 360)) d.lostT = 0;
    else d.lostT += 0.25;
    if (d.lostT > LOSE_TARGET_T * 1.6) { disengage(c, M); return; }
  }
  if (d.enraged && d.summonT <= 0) {           // timer runs in foremanThink, also during slams
    d.summonT = SUMMON_EVERY;
    if (summonMinions(c, M)) { d.roarLen = 1.1; c.setState('roar'); return; }
  }
  const dist = Math.hypot(tgt.pos.x - c.pos.x, tgt.pos.z - c.pos.z);
  if (c.cooldown <= 0) {
    let near = dist < SLAM_TRIGGER && Math.abs(tgt.pos.y - c.pos.y) < 2.5;
    if (!near) for (const p of players) if (!p.inShip && Math.abs(p.pos.y - c.pos.y) < 2.5 && Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z) < SLAM_TRIGGER) { near = true; break; }
    if (near) { c.setState('windup'); return; }
  }
  if (dist < 1.7) { turnToward(c, tgt.pos.x, tgt.pos.z, dt, 3); c.setState(S_CHASE); d.progT = 0; return; }
  c.setState(S_CHASE);
  M.moveToward(c, tgt.pos, dt, d.enraged ? c.def.run : c.def.walk, d.enraged ? 4 : 2.6);
  // unreachable target (locked door, catwalk, no path): give up after ~6 s without progress
  d.progT = (d.progT || 0) + dt;
  if (d.progT >= 3) {
    const moved = d.progX === undefined ? 1 : Math.hypot(c.pos.x - d.progX, c.pos.z - d.progZ);
    d.progX = c.pos.x; d.progZ = c.pos.z; d.progT = 0;
    d.stuck = moved < 0.5 && dist > 3 ? (d.stuck || 0) + 1 : 0;
    if (d.stuck >= 2) { d.stuck = 0; d.calmT = 8; disengage(c, M); }
  }
}

export function foremanBehavior(c, dt, M) {
  const d = c.data;
  if (!d.init) {
    d.init = true; d.engaged = false; d.enraged = false; d.returning = false; d.senseT = Math.random() * 0.25; d.lostT = 0; d.retargetT = 0;
    d.summonT = 4; d.minions = []; d.idleFor = 2;
    if (!d.lair) d.lair = { cx: c.home.x, cz: c.home.z, sx: c.home.x, sz: c.home.z, x0: c.home.x - 6, x1: c.home.x + 6, z0: c.home.z - 6, z1: c.home.z + 6, r: 6 };
    setFlags(c);
    // any Foreman, however it was spawned (debug / mods), gets the stun guard, loot drop and HP bar
    const dir = REG.get(M.game);
    if (dir) dir.track(c); else installStunGuard(c, M.game);
  }
  foremanThink(c, dt, M);
}

function foremanThink(c, dt, M) {
  const d = c.data;
  // enrage at half health (once per fight; full regen resets it)
  if (!d.enraged && c.maxHp && c.hp <= c.maxHp * 0.5) {
    d.enraged = true; d.engaged = true; d.returning = false; d.evade = false;
    setFlags(c);
    d.summonT = 4; d.roarLen = 1.8;
    c.setState('roar');
    M.noise(c.pos, 4);
    M.game.net.broadcast('sys', sysMsg('The Foreman\'s furnace ROARS - it is enraged!', {}, 'bad'));
    return;
  }
  if (d.enraged && d.engaged && d.summonT > 0) d.summonT -= dt;
  // committed actions
  if (c.state === 'windup') {
    const tp = d.targetId && M.game.aiPlayerById(d.targetId);
    if (tp && c.t < SLAM_TELEGRAPH * 0.55) turnToward(c, tp.pos.x, tp.pos.z, dt, 4);
    if (c.t >= SLAM_TELEGRAPH) { doSlam(c, M); c.setState('slam'); c.cooldown = d.enraged ? 1.7 : 2.6; }
    return;
  }
  if (c.state === 'slam') { if (c.t >= SLAM_RECOVER) c.setState(d.engaged ? S_CHASE : 'idle'); return; }
  if (c.state === 'roar') { if (c.t >= (d.roarLen || 1.2)) c.setState(d.engaged ? S_CHASE : 'idle'); return; }
  if (c.state === 'stunned') c.setState(d.engaged ? S_CHASE : 'idle');   // 'stunned' left over with no stun time
  d.senseT -= dt;
  const sense = d.senseT <= 0;
  if (sense) d.senseT = 0.25;
  if (d.engaged) engagedTick(c, dt, M, sense);
  else patrolTick(c, dt, M, sense);
}

// ============================================================================================
// Procedural model: 2.8 m hunched industrial horror. Origin at the feet, faces +Z.
// update(dt, { state, speed, t, time, progress }) - progress = replicated flags (1 engaged, 2 enraged)
// ============================================================================================
let _mats = null;
function foremanMats() {
  if (_mats) return _mats;
  const vestTex = tex('fm_vest', 32, 32, (ctx, w, h, r) => {
    noiseFill(ctx, w, h, r, '#4d5238', 0.16, 2);
    ctx.fillStyle = '#b89a2a';
    ctx.fillRect(0, Math.round(h * 0.34), w, 3);
    ctx.fillRect(0, Math.round(h * 0.5), w, 3);
    ctx.fillStyle = 'rgba(20,14,8,0.45)';
    for (let i = 0; i < 10; i++) ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 2 + Math.floor(r() * 4), 1 + Math.floor(r() * 3));
  });
  const fleshTex = tex('fm_flesh', 32, 32, (ctx, w, h, r) => {
    noiseFill(ctx, w, h, r, '#a28c7c', 0.18, 2);
    ctx.strokeStyle = '#5a3434'; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath(); let x = r() * w, y = r() * h; ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += (r() - 0.5) * 10; y += r() * 8; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  });
  const hatTex = tex('fm_hat', 32, 32, (ctx, w, h, r) => {
    noiseFill(ctx, w, h, r, '#d6a21e', 0.12, 2);
    ctx.fillStyle = 'rgba(40,24,6,0.6)';
    for (let i = 0; i < 12; i++) ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 5), 1);
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(12, 12, 2, 8); ctx.fillRect(14, 15, 2, 2); ctx.fillRect(16, 13, 2, 2); ctx.fillRect(16, 17, 2, 3); // "K"
  });
  const noise = (key, base, amt) => tex('fm_' + key, 32, 32, (ctx, w, h, r) => noiseFill(ctx, w, h, r, base, amt, 2));
  _mats = {
    vest: lam('#8a8f74', { map: vestTex }),
    cover: lam('#50563f', { map: noise('cover', '#50563f', 0.16) }),
    flesh: lam('#b3a090', { map: fleshTex }),
    bone: lam('#d9d0ba'),
    hat: lam('#e3b030', { map: hatTex }),
    metal: lam('#6c6862', { map: noise('metal', '#6c6862', 0.2) }),
    rust: lam('#7b4526', { map: noise('rust', '#7b4526', 0.32) }),
    rebar: lam('#5e4230'),
    concrete: lam('#8e8b83', { map: noise('conc', '#8e8b83', 0.25) }),
    dark: lam('#1d1b19'),
  };
  return _mats;
}

const C_EMBER = new THREE.Color(0.28, 0.05, 0.01);
const C_FIRE = new THREE.Color(1.0, 0.42, 0.1);
const C_HOT = new THREE.Color(1.0, 0.88, 0.5);
const C_EYE = new THREE.Color('#ffb030');
const C_EYE_ELITE = new THREE.Color('#ff2414');
const C_LAMP = new THREE.Color('#fff2b0');

export function createForemanModel(opts = {}) {
  const M = foremanMats();
  const rnd = rng((opts.seed ?? 1) * 977 + 13);
  const ph0 = rnd() * TAU;
  const root = new THREE.Group();
  root.name = 'creature_foreman';
  const BASE_SCALE = 0.92;
  const body = pv(root, null, null, 'scaler');
  body.scale.setScalar(BASE_SCALE);
  const owned = [];
  const own = (m) => { owned.push(m); return m; };
  const furnaceM = own(basI('#ff6a1a'));
  const coreM = own(basI('#ffc060'));
  const eyeM = own(basI('#ffb030'));
  const lampM = own(basI('#fff2b0'));

  // ---- hips & legs
  const hips = pv(body, [0, 1.3, 0], null, 'hips');
  mk(hips, merged('fm_pelvis', () => [xf(G.box(0.74, 0.36, 0.48), [0, 0.02, 0])]), M.cover);
  mk(hips, merged('fm_belt', () => [
    xf(G.box(0.8, 0.1, 0.54), [0, 0.16, 0]), xf(G.box(0.14, 0.18, 0.1), [0.3, 0.04, 0.26]),
    xf(G.box(0.12, 0.16, 0.1), [-0.32, 0.05, 0.24]), xf(G.box(0.1, 0.08, 0.04), [0, 0.16, 0.28]),
  ]), M.dark);
  mk(hips, merged('fm_wrench', () => [xf(G.box(0.05, 0.34, 0.02), [-0.42, -0.1, 0.12], [0, 0, 0.12]), xf(G.box(0.12, 0.06, 0.03), [-0.44, -0.28, 0.12])]), M.metal);
  const legs = [1, -1].map((s) => {
    const hip = pv(hips, [s * 0.23, -0.06, 0]);
    mk(hip, G.segY(0.62, 0.18, 0.14, 6), M.cover);
    const knee = pv(hip, [0, -0.62, 0]);
    mk(knee, G.segY(0.52, 0.14, 0.12, 6), M.cover);
    mk(knee, merged('fm_boot', () => [xf(G.box(0.27, 0.2, 0.44), [0, -0.52, 0.07]), xf(G.box(0.25, 0.08, 0.14), [0, -0.46, 0.26])]), M.dark);
    if (s < 0) {
      mk(hip, merged('fm_brace_u', () => [xf(G.box(0.04, 0.5, 0.05), [-0.17, -0.3, 0]), xf(G.box(0.06, 0.05, 0.06), [-0.17, -0.1, 0]), xf(G.box(0.06, 0.05, 0.06), [-0.17, -0.5, 0])]), M.metal);
      mk(knee, merged('fm_brace_l', () => [xf(G.box(0.04, 0.42, 0.05), [-0.14, -0.24, 0]), xf(G.box(0.06, 0.05, 0.06), [-0.14, -0.08, 0])]), M.metal);
    }
    return { hip, knee, s };
  });

  // ---- torso
  const spine = pv(hips, [0, 0.16, -0.02], null, 'spine');
  const chest = pv(spine, null, null, 'chest');
  mk(chest, G.lathe('fm_torso', [[0.02, 0], [0.38, 0], [0.5, 0.22], [0.6, 0.55], [0.62, 0.8], [0.54, 0.98], [0.3, 1.08], [0.02, 1.1]], 10), M.vest, null, null, [1, 1, 0.76]);
  mk(chest, G.sph(1, 8, 5), M.flesh, [0, 0.95, -0.18], null, [0.5, 0.3, 0.36]);   // hump
  mk(chest, merged('fm_plates', () => [
    xf(G.box(0.3, 0.22, 0.05), [0.28, 0.9, 0.36], [0.25, 0.25, 0.1]), xf(G.box(0.26, 0.2, 0.05), [-0.3, 0.86, 0.36], [0.25, -0.3, -0.12]),
    xf(G.box(0.5, 0.12, 0.05), [0, 0.28, 0.4], [-0.1, 0, 0]),
  ]), M.rust);
  // furnace in the chest
  const furn = pv(chest, [0, 0.6, 0.43], null, 'furnace');
  mk(furn, merged('fm_furnace_frame', () => [
    xf(G.box(0.46, 0.06, 0.1), [0, 0.19, 0]), xf(G.box(0.46, 0.06, 0.1), [0, -0.19, 0]),
    xf(G.box(0.06, 0.44, 0.1), [0.2, 0, 0]), xf(G.box(0.06, 0.44, 0.1), [-0.2, 0, 0]),
    xf(G.box(0.03, 0.03, 0.03), [0.2, 0.19, 0.06]), xf(G.box(0.03, 0.03, 0.03), [-0.2, 0.19, 0.06]),
    xf(G.box(0.03, 0.03, 0.03), [0.2, -0.19, 0.06]), xf(G.box(0.03, 0.03, 0.03), [-0.2, -0.19, 0.06]),
  ]), M.metal);
  mk(furn, G.box(0.36, 0.33, 0.04), furnaceM, [0, 0, -0.03]);
  mk(furn, merged('fm_coals', () => [xf(G.ico(0.06, 0), [0.08, -0.1, 0.0]), xf(G.ico(0.05, 0), [-0.07, -0.11, 0.01]), xf(G.ico(0.045, 0), [0.0, -0.08, 0.02])]), coreM);
  mk(furn, merged('fm_grate', () => [-0.12, -0.04, 0.04, 0.12].map((x) => xf(G.box(0.025, 0.36, 0.03), [x, 0, 0.045]))), M.dark);
  const hatch = pv(furn, [-0.23, 0, 0.06], null, 'hatch');
  mk(hatch, merged('fm_hatch', () => [xf(G.box(0.42, 0.4, 0.04), [0.21, 0, 0]), xf(G.box(0.06, 0.04, 0.05), [0.36, 0, 0.03])]), M.metal);
  // smokestacks on the back
  const stacks = pv(chest, [0, 0.86, -0.3], null, 'stacks');
  mk(stacks, merged('fm_stacks', () => [
    xf(G.cyl(0.075, 0.085, 0.64, 7), [0.17, 0.26, 0], [-0.22, 0, 0.12]), xf(G.cyl(0.065, 0.075, 0.52, 7), [-0.17, 0.2, 0.02], [-0.28, 0, -0.14]),
  ]), M.rust);
  mk(stacks, merged('fm_stackcaps', () => [xf(G.cyl(0.1, 0.09, 0.06, 7), [0.21, 0.58, -0.07], [-0.22, 0, 0.12]), xf(G.cyl(0.09, 0.08, 0.06, 7), [-0.2, 0.46, -0.05], [-0.28, 0, -0.14])]), M.dark);
  const puffs = [];
  for (let i = 0; i < 3; i++) {
    const m = own(new THREE.MeshBasicMaterial({ color: 0x3a3632, transparent: true, opacity: 0, depthWrite: false }));
    const mesh = mk(stacks, G.ico(0.08, 0), m);
    puffs.push({ mesh, m, ph: i / 3, x: i === 1 ? -0.2 : 0.21, y: i === 1 ? 0.5 : 0.62 });
  }

  // ---- neck & head (hard hat welded to the skull)
  const neck = pv(chest, [0, 1.02, 0.16], null, 'neck');
  mk(neck, G.segY(0.22, 0.14, 0.16, 6), M.flesh, [0, 0.18, 0]);
  const head = pv(neck, [0, 0.2, 0.05], null, 'head');
  mk(head, G.sph(0.2, 9, 7), M.bone, [0, 0.1, 0.02], null, [0.95, 1.05, 1.1]);
  mk(head, merged('fm_brow', () => [xf(G.box(0.34, 0.06, 0.1), [0, 0.15, 0.16], [0.2, 0, 0]), xf(G.box(0.08, 0.06, 0.1), [0.12, 0.03, 0.15]), xf(G.box(0.08, 0.06, 0.1), [-0.12, 0.03, 0.15])]), M.bone);
  mk(head, merged('fm_sockets', () => [xf(G.sph(0.05, 6, 4), [0.075, 0.1, 0.18], [0, 0, 0], [1, 0.8, 0.5]), xf(G.sph(0.05, 6, 4), [-0.075, 0.1, 0.18], [0, 0, 0], [1, 0.8, 0.5])]), M.dark);
  mk(head, merged('fm_pupils', () => [xf(G.sph(0.022, 5, 4), [0.075, 0.1, 0.205]), xf(G.sph(0.022, 5, 4), [-0.075, 0.1, 0.205])]), eyeM);
  const jaw = pv(head, [0, 0.0, 0.05], null, 'jaw');
  mk(jaw, merged('fm_jaw', () => [
    xf(G.box(0.24, 0.06, 0.2), [0, -0.05, 0.07]),
    ...[-0.08, -0.04, 0, 0.04, 0.08].map((x) => xf(G.box(0.025, 0.05, 0.02), [x, -0.01, 0.16])),
  ]), M.bone);
  const hat = pv(head, [0, 0.2, 0.0], [-0.1, 0, 0.07], 'hat');
  mk(hat, merged('fm_hat', () => [
    xf(G.sph(0.25, 10, 5, 0, TAU, 0, PI / 2), [0, 0, 0], [0, 0, 0], [1, 0.78, 1.1]),
    xf(G.cyl(0.32, 0.32, 0.03, 12), [0, 0.0, 0.05], [0, 0, 0], [1, 1, 1.12]),
    xf(G.box(0.05, 0.05, 0.46), [0, 0.19, 0]),
  ]), M.hat);
  mk(hat, G.tor(0.24, 0.022, 4, 12), M.dark, [0, 0.0, 0.0], [PI / 2, 0, 0], [1, 1.1, 1]);
  mk(hat, merged('fm_welds', () => [0.4, 1.9, 3.3, 4.8].map((a) => xf(G.box(0.05, 0.03, 0.03), [Math.sin(a) * 0.245, 0.005, Math.cos(a) * 0.27], [0, a, 0]))), coreM);
  mk(hat, G.cyl(0.05, 0.05, 0.05, 8), M.dark, [0, 0.1, 0.26], [PI / 2, 0, 0]);
  mk(hat, G.circle(0.04, 8), lampM, [0, 0.1, 0.29]);

  // ---- rebar arms with concrete fists
  const arms = [1, -1].map((s) => {
    const sh = pv(chest, [s * 0.62, 0.86, 0.02]);
    mk(sh, merged('fm_pauldron' + s, () => [xf(G.box(0.36, 0.14, 0.4), [s * 0.04, 0.08, 0], [0, 0, -s * 0.3]), xf(G.box(0.3, 0.1, 0.34), [s * 0.1, -0.02, 0], [0, 0, -s * 0.55])]), M.rust);
    mk(sh, G.segY(0.36, 0.11, 0.07, 6), M.flesh);
    mk(sh, merged('fm_rebar_u', () => [
      xf(G.segY(0.82, 0.03, 0.028, 4), [0.045, -0.02, 0.01], [0, 0, 0.04]), xf(G.segY(0.84, 0.028, 0.026, 4), [-0.04, -0.02, 0.03], [0.03, 0, -0.04]),
      xf(G.segY(0.8, 0.03, 0.026, 4), [0, -0.02, -0.045], [-0.04, 0, 0]),
    ]), M.rebar);
    mk(sh, merged('fm_wire_u', () => [xf(G.tor(0.07, 0.012, 3, 8), [0, -0.3, 0], [PI / 2, 0, 0]), xf(G.tor(0.065, 0.012, 3, 8), [0, -0.58, 0], [PI / 2, 0, 0.3])]), M.metal);
    const el = pv(sh, [0, -0.82, 0]);
    mk(el, merged('fm_rebar_l', () => [
      xf(G.segY(0.78, 0.028, 0.03, 4), [0.04, 0, 0.02], [0, 0, 0.05]), xf(G.segY(0.8, 0.026, 0.03, 4), [-0.04, 0, 0.02], [0, 0, -0.05]),
      xf(G.segY(0.76, 0.028, 0.03, 4), [0, 0, -0.04], [-0.05, 0, 0]),
    ]), M.rebar);
    mk(el, G.sph(0.085, 6, 4), M.concrete);
    mk(el, merged('fm_wire_l', () => [xf(G.tor(0.066, 0.012, 3, 8), [0, -0.4, 0], [PI / 2, 0, -0.2])]), M.metal);
    const fist = pv(el, [0, -0.78, 0]);
    mk(fist, merged('fm_fist', () => [xf(G.ico(0.2, 0), [0, -0.14, 0.02], [0.3, 0.5, 0.1], [1.1, 1, 1.05]), xf(G.box(0.24, 0.2, 0.26), [0.02, -0.1, 0], [0.2, 0.35, 0.1])]), M.concrete);
    mk(fist, merged('fm_fistbars', () => [
      xf(G.segY(0.3, 0.018, 0.015, 4), [0.08, -0.05, 0.05], [0.5, 0, -0.7]), xf(G.segY(0.26, 0.018, 0.015, 4), [-0.07, -0.08, -0.04], [-0.6, 0, 0.8]),
      xf(G.segY(0.22, 0.018, 0.015, 4), [0, -0.28, 0.02], [PI - 0.3, 0, 0.2]),
    ]), M.rebar);
    return { sh, el, fist, s };
  });

  const tinter = new Tinter(root);
  const W = {};
  const w = (k, on, rate, dt) => { const v = damp(W[k] ?? 0, on ? 1 : 0, rate, dt); W[k] = v; return v; };
  let walkPh = rnd() * TAU, localTime = 0, elite = false;

  const api = {
    root,
    parts: { head, eyes: [eyeM], furnace: furn, handL: arms[0].fist, hand: arms[1].fist },
    height: 2.8,
    radius: 0.9,
    update(dt, a = {}) {
      dt = clamp(dt || 0, 0, 0.1);
      localTime += dt;
      const st = a.state || 'idle';
      const t = a.t || 0;
      const time = (a.time ?? localTime) + ph0;
      const flags = (a.progress | 0);
      const deadW = w('dead', st === 'dead', 2.5, dt), deadK = smooth(deadW), alive = 1 - deadW;
      const stun = w('stun', st === 'stunned', 6, dt);
      const rageW = w('rage', flags & F_ENRAGED, 2, dt);
      const chase = w('chase', st === 'chase' || st === 'run', 4, dt);
      const roarK = w('roar', st === 'roar', 7, dt);
      // windup / slam follow the replicated state clock exactly; they only ease out when the state ends early
      const windK = W.wind = st === 'windup' ? smooth(t / SLAM_TELEGRAPH) : damp(W.wind ?? 0, 0, 14, dt);
      const slamK = W.slam = st === 'slam' ? keys(t, SLAM_KEYS) : damp(W.slam ?? 0, 0, 10, dt);
      let speed = a.speed ?? (st === 'chase' || st === 'run' ? 2.2 : st === 'walk' ? 1.3 : 0);
      if (st === 'dead' || st === 'windup' || st === 'slam' || st === 'roar') speed = 0;
      walkPh = (walkPh + (speed * dt / lerp(1.9, 2.3, chase)) * TAU) % TAU;
      const amp = clamp(speed / 1.2, 0, 1) * alive * (1 - stun);
      const sn = Math.sin(walkPh), cs = Math.cos(walkPh);
      const breath = Math.sin(time * (1.6 + rageW * 1.8));

      // legs
      for (const L of legs) {
        const p = L.s > 0 ? sn : -sn, pc = L.s > 0 ? cs : -cs;
        L.hip.rotation.set(-p * 0.42 * amp - slamK * 0.55 - windK * 0.1 - stun * 0.15, 0, L.s * 0.06);
        L.knee.rotation.x = Math.max(0, pc) * 0.6 * amp + slamK * 0.85 + windK * 0.15 + stun * 0.3 + 0.04;
      }
      hips.position.set(sn * 0.06 * amp, 1.3 - Math.abs(cs) * 0.05 * amp - slamK * 0.24 - windK * 0.05 - stun * 0.08, 0);
      // spine: hunched, arches back in the windup, folds forward on the slam
      let spx = 0.28 + chase * 0.12 + breath * 0.015;
      spx = lerp(spx, -0.24, windK);
      spx = lerp(spx, 0.78, slamK);
      spx = lerp(spx, -0.32, roarK);
      spx = lerp(spx, 0.62, stun);
      spine.rotation.set(spx, sn * 0.1 * amp, Math.sin(walkPh) * 0.05 * amp + stun * Math.sin(time * 1.3) * 0.08 + roarK * Math.sin(time * 31) * 0.02);
      chest.scale.set(1 + breath * 0.02, 1 + breath * 0.012, 1 + breath * 0.03);
      // head
      neck.rotation.set(-spx * 0.65 - roarK * 0.55 - windK * 0.15 + stun * 0.5, Math.sin(time * 0.37) * 0.35 * (1 - amp) * (1 - chase) * alive, Math.sin(time * 0.29) * 0.08);
      head.rotation.set(stun * Math.sin(time * 2.1) * 0.15, stun * Math.sin(time * 1.7) * 0.2, 0);
      jaw.rotation.x = 0.06 + roarK * 0.75 + windK * 0.35 + slamK * 0.25 + Math.max(0, Math.sin(time * 9)) * 0.06 * rageW;
      // arms
      for (const A of arms) {
        const swing = A.s > 0 ? sn : -sn;
        let sx = -0.12 + swing * 0.32 * amp + Math.sin(time * 0.9 + A.s) * 0.03;
        let sz = A.s * (0.2 + breath * 0.02);
        let ex = -0.25 - chase * 0.35;
        sx = lerp(sx, -3.25, windK); sz = lerp(sz, A.s * 0.28, windK); ex = lerp(ex, -0.6, windK);
        sx = lerp(sx, -0.95, slamK); sz = lerp(sz, A.s * 0.1, slamK); ex = lerp(ex, -0.12, slamK);
        sx = lerp(sx, -0.55, roarK); sz = lerp(sz, A.s * 1.15, roarK); ex = lerp(ex, -0.95, roarK);
        sx = lerp(sx, 0.18, stun); ex = lerp(ex, -0.05, stun);
        sx = lerp(sx, -2.3, deadK); sz = lerp(sz, A.s * 0.35, deadK); ex = lerp(ex, 0, deadK);
        A.sh.rotation.set(sx, 0, sz);
        A.el.rotation.x = ex;
        A.fist.rotation.x = -windK * 0.4 + slamK * 0.3;
      }
      // furnace & hatch
      let heat = 0.55 + 0.15 * Math.sin(time * 7.3) * Math.sin(time * 3.1) + rageW * 0.28 + windK * 0.4 + roarK * 0.45 + slamK * 0.3;
      heat = heat * alive + 0.02;
      if (heat < 0.6) furnaceM.color.lerpColors(C_EMBER, C_FIRE, heat / 0.6);
      else furnaceM.color.lerpColors(C_FIRE, C_HOT, clamp((heat - 0.6) / 0.7, 0, 1));
      coreM.color.lerpColors(C_EMBER, C_HOT, clamp(heat * 1.1 + 0.15, 0, 1));
      eyeM.color.copy(elite ? C_EYE_ELITE : C_EYE).multiplyScalar(clamp(0.35 + alive * 0.65 - stun * 0.4 + rageW * 0.2, 0, 1.2));
      const lampOn = alive > 0.5 && Math.sin(time * 5.3) * Math.sin(time * 1.7) > -0.8 ? 1 : 0.08;
      lampM.color.copy(C_LAMP).multiplyScalar(lampOn);
      hatch.rotation.y = -1.75 + Math.sin(time * 2.3) * 0.05 * amp - windK * 0.35 + roarK * Math.sin(time * 25) * 0.15 + slamK * 0.45;
      // smoke puffs from the stacks
      const puffRate = 0.45 + rageW * 0.6 + chase * 0.2;
      for (const P of puffs) {
        const u = (time * puffRate + P.ph) % 1;
        P.mesh.position.set(P.x, P.y + u * 0.8, -u * 0.25);
        P.mesh.scale.setScalar(0.6 + u * 1.8);
        P.m.opacity = (1 - u) * 0.5 * alive;
        P.mesh.visible = alive > 0.05;
      }
      // death: topple forward
      body.rotation.x = PI * 0.46 * deadK * deadK;
      body.position.y = -0.05 * deadK;
    },
    setElite(b) {
      elite = !!b;
      body.scale.setScalar(BASE_SCALE * (elite ? 1.08 : 1));
      if (elite) tinter.setBase('#2c0606');
      else if (tinter.active) tinter.setBase('#000000');
    },
    isElite: () => elite,
    setHitFlash(v) { tinter.setFlash(v); },
    dispose() {
      tinter.dispose();
      for (const m of owned) m.dispose();
      owned.length = 0;
    },
  };
  if (opts.elite) api.setElite(true);
  api.update(0, { state: 'idle', time: 0 });
  return api;
}

// Trophy item model: the Foreman's hard hat (per-instance geometry, WorldItem disposes it).
let _hatMats = null;
export function createHardHatItem() {
  if (!_hatMats) _hatMats = { hat: foremanMats().hat, dark: foremanMats().dark, bone: foremanMats().bone };
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 5, 0, TAU, 0, PI / 2), _hatMats.hat);
  dome.scale.set(1, 0.8, 1.1);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.025, 12), _hatMats.hat);
  brim.scale.set(1, 1, 1.12);
  brim.position.set(0, 0, 0.03);
  const weld = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 4, 12), _hatMats.dark);
  weld.rotation.x = PI / 2;
  weld.scale.set(1, 1.1, 1);
  const bone = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.08), _hatMats.bone);   // a chunk of skull still welded on
  bone.position.set(0.05, -0.02, -0.05);
  g.add(dome, brim, weld, bone);
  return g;
}

// ============================================================================================
// LEGACY BOT - outdoor world boss (Lethal Company's Old Bird, re-themed: a beige war machine from the old web)
// Parked and powered down; boots at dusk (18:00), in an eclipse, when someone walks up to it or shoots it.
// Spotlight eye (pooled spot light) sweeps while it patrols. Attacks, all telegraphed:
//   rockets  - lock-on (red pod lasers + accelerating beeps) -> 2/3/5 rockets that land where you WERE
//              (red ground markers during the flight),
//   stomp    - one leg goes up (ground ring) -> shockwave around it.
// Phases: <60 % LEGACY MODE (faster, shorter cooldowns), <30 % KERNEL PANIC (red light, 5-rocket barrages,
// charges in). Never walks within 30 m of the ship and never targets players standing next to it.
// Replicated flags in `extra`: 1 engaged, 2 phase 2, 4 phase 3, 8 awake.
// ============================================================================================
export const LEGACY = 'legacybot';
export const LEGACY_DEF = {
  name: 'Legacy Bot', hp: 1500, dmg: 36, walk: 2.0, run: 3.2, power: 0, xp: 2400, coin: 380,
  zone: 'out', radius: 1.5, height: 6.2, boss: true,
  deathText: 'was deprecated by the Legacy Bot.',
  lore: 'A beige war machine from the old internet, parked and powered down on the moon. It boots at dusk, or when you get too close. '
    + 'Its spotlight is its eye. When the pods beep and the red lasers find you: MOVE - the rockets land where you were standing. '
    + 'Get under it and it stomps. Below 60% it enters LEGACY MODE, below 30% KERNEL PANIC.',
};
const L_ENGAGED = 1, L_P2 = 2, L_P3 = 4, L_AWAKE = 8;
const L_LOCK = [1.4, 1.15, 0.9];       // s of lock-on telegraph per phase
const L_ROCKETS = [2, 3, 5];
const L_ROCKET_CD = [6.5, 5, 3.6];
const L_ROCKET_SPEED = 20;             // m/s
const L_ROCKET_R = 3.4;                // blast radius
const L_STOMP_R = 5;
const L_STOMP_WIND = 1.0;
const L_SHIP_KEEP = 30;                // never walks closer to the ship than this
const L_TARGET_SHIP = 24;              // players this close to the ship are never targeted
const L_BAR_RANGE = 90;
const LEGACY_TREASURE = [['goldbar', 3], ['ring', 2], ['reactor', 1], ['x_goldbars', 2], ['tv', 2], ['register', 2]];
const r2 = (v) => Math.round(v * 100) / 100;

function lFlags(c) {
  const d = c.data;
  c.extra = (d.engaged ? L_ENGAGED : 0) | (d.phase >= 2 ? L_P2 : 0) | (d.phase >= 3 ? L_P3 : 0) | (d.awake ? L_AWAKE : 0);
}
function legacyTargets(c, M) { return M.playersFor(c).filter((p) => !p.inShip && Math.hypot(p.pos.x, p.pos.z) > L_TARGET_SHIP); }

function legacyEngage(c, p, M) {
  const d = c.data;
  d.engaged = true; d.tid = p.id; d.lostT = 0; c.target = p.id; d.rockT = Math.min(d.rockT, 2.5);
  lFlags(c);
  d.roarLen = 1.4; c.setState('roar');
  M.noise(c.pos, 4);
}

// heavy walker: turns in place, then strides; keeps away from the ship and the map edge
function legacyStep(c, goal, dt, M, speed) {
  turnToward(c, goal.x, goal.z, dt, 1.1);
  if (Math.abs(angleDiff(c.yaw, Math.atan2(goal.x - c.pos.x, goal.z - c.pos.z))) > 0.9) return;
  const nx = c.pos.x + Math.sin(c.yaw) * speed * dt, nz = c.pos.z + Math.cos(c.yaw) * speed * dt;
  if (Math.hypot(nx, nz) < L_SHIP_KEEP && Math.hypot(nx, nz) < Math.hypot(c.pos.x, c.pos.z)) return;
  if (Math.abs(nx) > 140 || Math.abs(nz) > 140) return;
  M.placeAt(c, nx, nz);
}

function legacyFire(c, M, p) {
  const d = c.data, g = M.game, dir = REG.get(g);
  const n = L_ROCKETS[d.phase - 1];
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const from = new THREE.Vector3(c.pos.x + rx * side * 1.5 + fx * 0.5, c.pos.y + 4.6, c.pos.z + rz * side * 1.5 + fz * 0.5);
    const spread = i === 0 ? 0 : (d.phase >= 3 ? 3.2 : 2.2);
    const a = Math.random() * TAU, r = spread * (0.5 + Math.random() * 0.5);
    const tx = p.pos.x + Math.cos(a) * r, tz = p.pos.z + Math.sin(a) * r;
    const ty = g.world.terrain?.heightAt(tx, tz) ?? p.pos.y;
    const wait = i * 0.14;
    const dur = Math.max(0.8, from.distanceTo(new THREE.Vector3(tx, ty, tz)) / L_ROCKET_SPEED) + wait;
    if (dir) dir.rockets.push({ to: new THREE.Vector3(tx, ty + 0.3, tz), t: dur, src: c.id, dmg: c.dmg });
    g.net.broadcast('fx', { k: 'lbrocket', a: [r2(from.x), r2(from.y), r2(from.z)], b: [r2(tx), r2(ty), r2(tz)], d: r2(dur), w: r2(wait), r: L_ROCKET_R });
  }
  M.noise(c.pos, 4);
}

function legacyStomp(c, M) {
  const g = M.game;
  for (const p of g.aiPlayers()) {
    if (p.dead || p.inShip) continue;
    const dist = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
    if (dist > L_STOMP_R || Math.abs(p.pos.y - c.pos.y) > 3) continue;
    const k = dist < 2 ? 1 : 1 - 0.5 * ((dist - 2) / (L_STOMP_R - 2));
    g.hostHurtPlayer(p.id, Math.round(c.dmg * 1.2 * k), LEGACY, c.id, c.pos);
    g.hostSlowPlayer?.(p.id, 1.5);
  }
  g.net.broadcast('fx', { k: 'lbstomp', p: [r2(c.pos.x), r2(c.pos.y), r2(c.pos.z)], r: L_STOMP_R });
  M.noise(c.pos, 4);
}

export function legacyBehavior(c, dt, M) {
  const d = c.data, g = M.game;
  if (!d.init) {
    d.init = true; d.phase = 1; d.engaged = false; d.rockT = 3; d.stompT = 0; d.lostT = 0; d.senseT = 0;
    d.awake = c.state !== 'dormant' && c.state !== 'boot';
    d.home = c.home.clone();
    if (d.awake) c.setState('patrol');
    const dir = REG.get(g);
    if (dir) dir.track(c); else installStunGuard(c, g);
    lFlags(c);
  }
  // phase changes (once each; the roar is the telegraph)
  if (d.awake && c.maxHp) {
    const f = c.hp / c.maxHp;
    const want = f <= 0.3 ? 3 : f <= 0.6 ? 2 : 1;
    if (want > d.phase) {
      d.phase = want; d.engaged = true; lFlags(c);
      d.roarLen = 1.8; c.setState('roar');
      M.noise(c.pos, 4);
      g.net.broadcast('sys', { text: want === 3 ? 'LEGACY BOT: KERNEL PANIC. It is firing everything it has!' : 'LEGACY BOT: LEGACY MODE ENGAGED. Faster, angrier.', kind: 'bad' });
      return;
    }
  }
  const st = c.state;
  if (st === 'dormant') {
    const run = g.run || {};
    const near = legacyTargets(c, M).some((p) => p.pos.distanceTo(c.pos) < 16);
    if (near || c.hp < c.maxHp || c.target || (run.time || 0) >= 18 * 60 || run.weather === 'eclipsed') {
      c.setState('boot');
      M.noise(c.pos, 4);
      g.net.broadcast('sys', sysMsg('Something old just powered on out there. A spotlight is sweeping the moon...', {}, 'bad'));
    }
    return;
  }
  if (!d.awake && st !== 'boot') { c.setState('boot'); return; }      // stunned while booting
  if (st === 'boot') { if (c.t >= 3.5) { d.awake = true; lFlags(c); c.setState('patrol'); } return; }
  if (st === 'roar') { if (c.t >= (d.roarLen || 1.6)) c.setState(d.engaged ? 'run' : 'patrol'); return; }
  if (st === 'lock') {
    const p = d.tid ? g.aiPlayerById(d.tid) : null;
    if (p) turnToward(c, p.pos.x, p.pos.z, dt, 1.4);
    if (c.t >= L_LOCK[d.phase - 1]) {
      if (p && !p.dead && !p.inShip && Math.hypot(p.pos.x, p.pos.z) > L_TARGET_SHIP) legacyFire(c, M, p);
      d.rockT = L_ROCKET_CD[d.phase - 1];
      c.setState('fire');
    }
    return;
  }
  if (st === 'fire') { if (c.t >= 0.7) c.setState('run'); return; }
  if (st === 'windup') { if (c.t >= L_STOMP_WIND) { legacyStomp(c, M); d.stompT = d.phase >= 2 ? 4 : 7; c.setState('stomp'); } return; }
  if (st === 'stomp') { if (c.t >= 0.8) c.setState('run'); return; }
  d.rockT -= dt; d.stompT -= dt; d.senseT -= dt;
  const players = legacyTargets(c, M);
  const spd = d.phase >= 2 ? 1.25 : 1;
  if (!d.engaged) {
    if (d.senseT <= 0) {
      d.senseT = 0.3;
      // spotlight cone (+-55 deg, 45 m, line of sight) or someone right next to it
      for (const p of players) {
        const dist = p.pos.distanceTo(c.pos);
        const inCone = Math.abs(angleDiff(c.yaw, Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z))) < 0.95;
        if (dist < 10 || (dist < 45 && inCone && M.canSee(c, p, 45, 360))) { legacyEngage(c, p, M); return; }
      }
      if (c.target) { const p = players.find((q) => q.id === c.target); if (p) { legacyEngage(c, p, M); return; } c.target = null; }
      const n = M.hear(c, 22);
      if (n && Math.hypot(n.pos.x, n.pos.z) > L_SHIP_KEEP) d.goal = n.pos.clone();
    }
    if (c.state !== 'patrol') c.setState('patrol');
    if (!d.goal || Math.hypot(c.pos.x - d.goal.x, c.pos.z - d.goal.z) < 3) {
      const a = Math.random() * TAU, r = 8 + Math.random() * 25;
      d.goal = new THREE.Vector3(d.home.x + Math.cos(a) * r, 0, d.home.z + Math.sin(a) * r);
      if (Math.hypot(d.goal.x, d.goal.z) < L_SHIP_KEEP + 5) d.goal = d.home.clone();
    }
    legacyStep(c, d.goal, dt, M, c.def.walk * spd);
    return;
  }
  let tgt = d.tid ? players.find((p) => p.id === d.tid) || null : null;
  if (d.senseT <= 0) {
    d.senseT = 0.3;
    if (!tgt || tgt.pos.distanceTo(c.pos) > 70) {
      let best = null, bd = 70;
      for (const p of players) { const dd = p.pos.distanceTo(c.pos); if (dd < bd && M.canSee(c, p, 70, 360)) { bd = dd; best = p; } }
      tgt = best; d.tid = best?.id || null;
    }
    if (tgt && M.canSee(c, tgt, 80, 360)) d.lostT = 0; else d.lostT += 0.3;
  }
  c.target = d.tid || null;
  if (!tgt || d.lostT > 12) { d.engaged = false; d.tid = null; c.target = null; d.goal = null; lFlags(c); c.setState('patrol'); return; }
  const dist = tgt.pos.distanceTo(c.pos);
  if (dist < L_STOMP_R - 0.5 && d.stompT <= 0) { c.setState('windup'); return; }
  if (d.rockT <= 0 && dist > 7 && dist < 55 && M.canSee(c, tgt, 60, 360)) { c.setState('lock'); return; }
  if (c.state !== 'run') c.setState('run');
  // keeps rocket range; charges in when panicking. Inside rocket minimum range (7 m) but outside the stomp it
  // walks in: a player parked at 5-7 m used to be completely safe (no rockets, no stomp, no movement).
  if (dist > (d.phase >= 3 ? 4 : 16) || (dist <= 7.5 && dist >= L_STOMP_R - 0.8)) legacyStep(c, tgt.pos, dt, M, c.def.run * spd);
  else turnToward(c, tgt.pos.x, tgt.pos.z, dt, 1.2);
}

// ---------------------------------------------------------------- model (6.2 m, origin at the feet, faces +Z)
function legacyScreenTex(mode) {
  return tex('lb_scr_' + mode, 48, 32, (c, w, h) => {
    if (mode === 'bsod') {
      c.fillStyle = '#1030b0'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e8e8ff'; c.fillRect(4, 4, 18, 3); for (let y = 11; y < 28; y += 4) c.fillRect(4, y, 16 + ((y * 7) % 22), 2);
      c.fillRect(34, 10, 3, 3); c.fillRect(34, 17, 3, 3); c.beginPath(); c.arc(40, 22, 5, PI, TAU); c.lineWidth = 2; c.strokeStyle = '#e8e8ff'; c.stroke();
    } else if (mode === 'on') {
      c.fillStyle = '#041008'; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(40,255,90,0.12)'; for (let y = 0; y < h; y += 2) c.fillRect(0, y, w, 1);
      c.fillStyle = '#40ff70';
      const g = { L: ['100', '100', '100', '100', '111'], E: ['111', '100', '110', '100', '111'], G: ['111', '100', '101', '101', '111'], A: ['010', '101', '111', '101', '101'], C: ['111', '100', '100', '100', '111'], Y: ['101', '101', '010', '010', '010'] };
      [...'LEGACY'].forEach((ch, i) => g[ch].forEach((row, y) => [...row].forEach((b, x) => { if (b === '1') c.fillRect(3 + i * 7 + x * 2, 7 + y * 2, 2, 2); })));
      c.fillRect(3, 22, 30, 2); c.fillRect(3, 26, 12, 2); c.fillRect(38, 26, 4, 4);
    } else { c.fillStyle = '#0a0c0a'; c.fillRect(0, 0, w, h); c.fillStyle = '#1a201a'; c.fillRect(6, 6, 8, 3); }
  }, false);
}
let _lbMats = null;
function legacyMats() {
  if (_lbMats) return _lbMats;
  const noise = (key, base, amt) => tex('lb_' + key, 32, 32, (ctx, w, h, r) => noiseFill(ctx, w, h, r, base, amt, 2));
  const beigeTex = tex('lb_beige', 32, 32, (ctx, w, h, r) => {
    noiseFill(ctx, w, h, r, '#c9bd98', 0.08, 2);
    ctx.fillStyle = 'rgba(120,70,30,0.45)'; for (let i = 0; i < 10; i++) ctx.fillRect((r() * w) | 0, (r() * h) | 0, 1 + ((r() * 4) | 0), 1 + ((r() * 6) | 0));
    ctx.fillStyle = 'rgba(60,50,40,0.35)'; ctx.fillRect(0, h - 3, w, 1); ctx.fillRect(w - 3, 0, 1, h);
  });
  _lbMats = {
    beige: lam('#c9bd98', { map: beigeTex }), grey: lam('#7a7a74', { map: noise('grey', '#7a7a74', 0.18) }),
    dark: lam('#2a2a2a'), rust: lam('#7b4526', { map: noise('rust', '#7b4526', 0.3) }), black: lam('#0e0e0e'),
    scrOff: bas('#ffffff', { map: legacyScreenTex('off') }), scrOn: bas('#ffffff', { map: legacyScreenTex('on') }), scrBsod: bas('#ffffff', { map: legacyScreenTex('bsod') }),
  };
  return _lbMats;
}
const _lbV = new THREE.Vector3();
export function createLegacyModel(opts = {}) {
  const M = legacyMats();
  const rnd = rng((opts.seed ?? 1) * 733 + 29);
  const ph0 = rnd() * TAU;
  const root = new THREE.Group();
  root.name = 'creature_legacybot';
  const body = pv(root, null, null, 'scaler');
  const owned = [];
  const own = (m) => { owned.push(m); return m; };
  const lensM = own(basI('#fff2c0'));
  const podLaserM = own(basI('#ff1a10', { transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  podLaserM.userData.noTint = true;
  const ventM = own(basI('#ff7020'));
  const hips = pv(body, [0, 2.9, 0], null, 'hips');
  // ---- digitigrade legs
  const legs = [1, -1].map((s) => {
    const hip = pv(hips, [s * 0.95, 0, 0]);
    mk(hip, merged('lb_hipjoint', () => [xf(G.cyl(0.32, 0.32, 0.4, 8), [0, 0, 0], [0, 0, PI / 2])]), M.grey);
    mk(hip, merged('lb_thigh', () => [xf(G.segY(1.6, 0.26, 0.2, 6)), xf(G.box(0.36, 0.9, 0.3), [0, -0.6, 0.1])]), M.beige);
    const knee = pv(hip, [0, -1.6, 0]);
    mk(knee, merged('lb_knee', () => [xf(G.sph(0.24, 7, 5)), xf(G.segY(1.7, 0.18, 0.14, 6)), xf(G.cyl(0.05, 0.05, 1.4, 5), [0.2, -0.8, -0.1])]), M.grey);
    const ank = pv(knee, [0, -1.7, 0]);
    mk(ank, merged('lb_foot', () => [xf(G.box(0.8, 0.22, 1.3), [0, -0.1, 0.25]), xf(G.box(0.25, 0.16, 0.45), [0.28, -0.14, 1.0], [0.2, 0.2, 0]), xf(G.box(0.25, 0.16, 0.45), [-0.28, -0.14, 1.0], [0.2, -0.2, 0]), xf(G.box(0.3, 0.16, 0.4), [0, -0.14, -0.5])]), M.dark);
    return { hip, knee, ank, s };
  });
  // ---- torso: a beige tower PC with a CRT chest
  const torso = pv(hips, [0, 0.25, 0], null, 'torso');
  mk(torso, merged('lb_torso', () => [xf(G.box(2.3, 1.7, 1.9), [0, 0.95, 0]), xf(G.box(2.0, 0.3, 1.6), [0, 0.0, 0])]), M.beige);
  mk(torso, merged('lb_details', () => [
    xf(G.box(0.7, 0.05, 0.02), [-0.6, 0.35, 0.96]), xf(G.box(0.7, 0.05, 0.02), [-0.6, 0.5, 0.96]),     // floppy / CD slots
    xf(G.box(0.12, 0.12, 0.03), [0.85, 0.4, 0.96]), ...[0, 1, 2, 3, 4].map((i) => xf(G.box(1.9, 0.04, 0.02), [0, 1.55 - i * 0.07, -0.96])),
    xf(G.box(0.2, 1.2, 0.2), [1.2, 1.0, -0.6]), xf(G.box(0.2, 1.2, 0.2), [-1.2, 1.0, -0.6]),
  ]), M.dark);
  mk(torso, merged('lb_bezel', () => [xf(G.box(1.2, 0.95, 0.12), [0.25, 1.05, 0.98])]), M.grey);
  const screen = mk(torso, G.plane(1.0, 0.72), M.scrOff, [0.25, 1.05, 1.05]);
  mk(torso, merged('lb_rust', () => [xf(G.box(0.5, 0.3, 0.02), [-0.8, 1.5, 0.96]), xf(G.box(0.3, 0.5, 0.02), [1.16, 0.6, 0.3], [0, PI / 2, 0])]), M.rust);
  // exhaust stacks + vent glow + smoke puffs
  mk(torso, merged('lb_stacks', () => [xf(G.cyl(0.14, 0.16, 1.0, 7), [0.6, 2.1, -0.75]), xf(G.cyl(0.14, 0.16, 0.8, 7), [-0.6, 2.0, -0.75])]), M.rust);
  mk(torso, G.box(1.4, 0.2, 0.02), ventM, [0, 0.35, -0.97]);
  const puffs = [];
  for (let i = 0; i < 4; i++) {
    const m = own(new THREE.MeshBasicMaterial({ color: 0x3a3632, transparent: true, opacity: 0, depthWrite: false }));
    puffs.push({ mesh: mk(torso, G.ico(0.16, 0), m), m, ph: i / 4, x: i % 2 ? -0.6 : 0.6 });
  }
  // ---- head with the spotlight eye
  const head = pv(torso, [0, 1.85, 0.1], null, 'head');
  mk(head, merged('lb_head', () => [xf(G.box(0.95, 0.6, 0.85), [0, 0.3, 0]), xf(G.cyl(0.03, 0.03, 0.8, 4), [0.35, 0.95, -0.2]), xf(G.sph(0.06, 4, 3), [0.35, 1.35, -0.2])]), M.grey);
  mk(head, merged('lb_hood', () => [xf(G.cyl(0.3, 0.34, 0.3, 10, true), [0, 0.3, 0.52], [PI / 2, 0, 0])]), M.dark);
  const lens = mk(head, G.circle(0.28, 12), lensM, [0, 0.3, 0.6]);
  const lensTip = new THREE.Object3D(); lensTip.position.set(0, 0.3, 0.75); head.add(lensTip);
  // ---- rocket pods
  const pods = [1, -1].map((s) => {
    const arm = pv(torso, [s * 1.35, 1.25, 0.1]);
    mk(arm, merged('lb_podarm', () => [xf(G.cyl(0.2, 0.2, 0.4, 8), [0, 0, 0], [0, 0, PI / 2])]), M.grey);
    const pod = pv(arm, [s * 0.45, 0, 0]);
    mk(pod, merged('lb_pod', () => [xf(G.box(0.75, 0.75, 1.3), [0, 0, 0.1])]), M.beige);
    mk(pod, merged('lb_tubes', () => { const a = []; for (let i = 0; i < 6; i++) a.push(xf(G.circle(0.1, 6), [(i % 3 - 1) * 0.22, (i < 3 ? 0.16 : -0.16), 0.76])); return a; }), M.black);
    const laser = mk(pod, G.boxZ(0.03, 0.03, 1), podLaserM, [0, 0, 0.78]);
    laser.visible = false;
    return { arm, pod, laser, s };
  });
  const tinter = new Tinter(root);
  const W = {};
  const w = (k, on, rate, dt) => { const v = damp(W[k] ?? 0, on ? 1 : 0, rate, dt); W[k] = v; return v; };
  let walkPh = rnd() * TAU, localTime = 0, elite = false;
  const api = {
    root,
    parts: { head, eyes: [lensM], lens: lensTip, pods: pods.map((p) => p.pod) },
    height: 6.2, radius: 1.5,
    lookLocal: null,          // model-local point the eye / pods track (set by the boss client)
    update(dt, a = {}) {
      dt = clamp(dt || 0, 0, 0.1);
      localTime += dt;
      const st = a.state || 'idle', t = a.t || 0;
      const time = (a.time ?? localTime) + ph0;
      const flags = a.progress | 0;
      const deadW = w('dead', st === 'dead', 1.6, dt), deadK = smooth(deadW), alive = 1 - deadW;
      const awake = st === 'boot' ? smooth(clamp((t - 0.8) / 2.5, 0, 1)) : st === 'dormant' ? 0 : 1;
      const sleepK = W.sleep = damp(W.sleep ?? (st === 'dormant' ? 1 : 0), 1 - awake, 3, dt);
      const stun = w('stun', st === 'stunned', 5, dt);
      const lockK = w('lock', st === 'lock', 8, dt);
      const roarK = w('roar', st === 'roar', 6, dt);
      const p3 = (flags & L_P3) !== 0;
      const windK = W.wind = st === 'windup' ? smooth(t / L_STOMP_WIND) : damp(W.wind ?? 0, 0, 12, dt);
      const stompK = W.stomp = st === 'stomp' ? keys(t, [[0, 1], [0.1, 1], [0.8, 0]]) : damp(W.stomp ?? 0, 0, 10, dt);
      let speed = a.speed ?? (st === 'run' ? 3 : st === 'patrol' ? 2 : 0);
      if (['dormant', 'boot', 'lock', 'fire', 'windup', 'stomp', 'roar', 'dead'].includes(st)) speed = 0;
      walkPh = (walkPh + (speed * dt / 3.2) * TAU) % TAU;
      const amp = clamp(speed / 1.5, 0, 1) * alive * (1 - stun);
      const sn = Math.sin(walkPh), cs = Math.cos(walkPh);
      // legs: standing pose (-0.6, 1.3, -0.7) folded to sit when dormant; right leg lifts for the stomp
      legs.forEach((L, i) => {
        const p = L.s > 0 ? sn : -sn, pc = L.s > 0 ? cs : -cs;
        let hx = -0.6 - p * 0.35 * amp, kx = 1.3 + Math.max(0, pc) * 0.5 * amp, ax = -0.7 - Math.max(0, pc) * 0.2 * amp;
        hx = lerp(hx, -1.3, sleepK); kx = lerp(kx, 2.4, sleepK); ax = lerp(ax, -1.1, sleepK);
        if (i === 1) { hx -= windK * 0.9 - stompK * 0.2; kx += windK * 0.6; }
        hx = lerp(hx, -1.2, deadK); kx = lerp(kx, 2.2, deadK);
        L.hip.rotation.set(hx - stun * 0.2, 0, L.s * 0.05);
        L.knee.rotation.x = kx + stun * 0.3;
        L.ank.rotation.x = ax;
      });
      hips.position.set(sn * 0.12 * amp, lerp(2.9, 1.45, sleepK) - Math.abs(cs) * 0.1 * amp - stompK * 0.35 + windK * 0.1 - stun * 0.25 - deadK * 1.3, 0);
      torso.rotation.set(lerp(0.05, 0.25, sleepK) + stompK * 0.18 - windK * 0.1 + stun * 0.2 + roarK * Math.sin(time * 30) * 0.03, sn * 0.05 * amp, sn * 0.04 * amp + roarK * Math.sin(time * 23) * 0.04 + deadK * 0.5);
      // screen: off -> boot flicker -> LEGACY -> blue screen when panicking / dead
      const flick = st === 'boot' ? Math.sin(t * 37) * Math.sin(t * 13) > 0.2 - t * 0.2 : true;
      screen.material = st === 'dormant' || !flick ? M.scrOff : (p3 || st === 'dead' || (roarK > 0.5 && Math.sin(time * 20) > 0)) ? M.scrBsod : M.scrOn;
      // eye / head look
      const look = api.lookLocal;
      let hy = Math.sin(time * 0.6) * 0.8 * (1 - lockK), hp = 0.15;
      if (look && awake > 0.5) { _lbV.copy(look); hy = clamp(Math.atan2(_lbV.x, _lbV.z), -1.2, 1.2); hp = clamp(-Math.atan2(_lbV.y - 5.3, Math.hypot(_lbV.x, _lbV.z)), -0.5, 0.8); }
      head.rotation.set(lerp(hp, 0.5, sleepK) + deadK * 0.4, lerp(hy, 0, sleepK), roarK * Math.sin(time * 17) * 0.1);
      const lensOn = alive * awake * (st === 'boot' ? (flick ? 1 : 0.1) : 1);
      lensM.color.set(p3 || lockK > 0.5 ? '#ff4030' : '#fff2c0').multiplyScalar(clamp(0.08 + lensOn, 0, 1.2));
      ventM.color.set('#ff7020').multiplyScalar(0.1 + awake * alive * (0.6 + roarK * 0.6 + Math.sin(time * 4) * 0.1));
      // pods aim at the look target while locking; recoil on fire
      const fireK = st === 'fire' ? keys(t, [[0, 1], [0.15, 0.4], [0.7, 0]]) : 0;
      for (const P of pods) {
        let py = 0, pp = -0.1 + sleepK * 0.4;
        if (look && lockK > 0.01) {
          _lbV.copy(look).sub(P.arm.position).sub(torso.position).sub(hips.position);
          py = clamp(Math.atan2(_lbV.x, _lbV.z), -0.6, 0.6); pp = clamp(-Math.atan2(_lbV.y, Math.hypot(_lbV.x, _lbV.z)), -0.9, 0.5);
          P.laser.scale.set(1, 1, Math.min(60, _lbV.length()));
        }
        P.pod.rotation.set(lerp(-0.1, pp, lockK) - fireK * 0.35, lerp(0, py, lockK), 0);
        P.pod.position.z = -fireK * 0.25;
        P.laser.visible = st === 'lock' && alive > 0.5 && !!look && Math.sin(t * (10 + t * 25)) > -0.3;
      }
      // smoke
      const rate = 0.3 + awake * 0.5 + roarK + (p3 ? 0.6 : 0);
      for (const P of puffs) {
        const u = (time * rate + P.ph) % 1;
        P.mesh.position.set(P.x, 2.6 + u * 1.6, -0.75 - u * 0.4);
        P.mesh.scale.setScalar(0.6 + u * 2.4);
        P.m.opacity = (1 - u) * 0.45 * awake * alive;
        P.mesh.visible = P.m.opacity > 0.01;
      }
      body.rotation.z = deadK * 0.35;
    },
    setElite(b) { elite = !!b; body.scale.setScalar(elite ? 1.08 : 1); },
    isElite: () => elite,
    setHitFlash(v) { tinter.setFlash(v); },
    dispose() { tinter.dispose(); for (const m of owned) m.dispose(); owned.length = 0; },
  };
  if (opts.elite) api.setElite(true);
  api.update(0, { state: 'dormant', time: 0 });
  return api;
}

// Trophy: the Legacy Bot's core (a glowing beige CPU block)
export function createLegacyCoreItem() {
  const M = legacyMats();
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.42), M.beige);
  const chip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.22), M.dark);
  chip.position.y = 0.11;
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.12), new THREE.MeshBasicMaterial({ color: 0x40ff70 }));
  glow.position.y = 0.14;
  const pins = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.46), M.grey);
  pins.position.y = -0.1;
  g.add(box, chip, glow, pins);
  return g;
}

// ============================================================================================
// installBosses
// ============================================================================================
const STYLE_ID = 'kc-boss-style';
const CSS = `
.kc-boss{position:absolute;top:16px;left:50%;transform:translateX(-50%);width:min(560px,62vw);text-align:center;pointer-events:none;transition:opacity .35s;opacity:1}
.kc-boss.kc-off{opacity:0}
.kc-boss-name{font-family:var(--font2,monospace);font-size:13px;color:#ffcf9a;letter-spacing:2px;text-shadow:0 0 8px rgba(255,90,20,.7),2px 2px 0 #000;margin-bottom:6px;white-space:nowrap}
.kc-boss-lv{color:#fff;opacity:.75;margin-left:8px}
.kc-boss-tag{color:#ff4a3a;margin-left:8px;display:none;animation:kcBossBlink .6s infinite}
.kc-boss.rage .kc-boss-tag{display:inline}
.kc-boss-bar{position:relative;height:14px;border:2px solid #a8531f;background:rgba(20,6,2,.82);box-shadow:0 0 12px rgba(255,80,20,.35);overflow:hidden}
.kc-boss-fill,.kc-boss-chip{position:absolute;left:0;top:0;bottom:0;width:100%;transform-origin:0 50%}
.kc-boss-chip{background:#ffe2b0;opacity:.85}
.kc-boss-fill{background:linear-gradient(#ff6a1a,#a3200a)}
.kc-boss.rage .kc-boss-fill{background:linear-gradient(#ff2a1a,#5a0000)}
.kc-boss-mark{position:absolute;left:50%;top:0;bottom:0;width:2px;background:#fff;opacity:.45}
.kc-boss-num{font-size:18px;color:#fff;margin-top:1px;text-shadow:0 0 4px #000}
@keyframes kcBossBlink{50%{opacity:.35}}
`;

function registerContent() {
  registerCreature(FOREMAN, { ...FOREMAN_DEF }, foremanBehavior);
  if (!ITEMS.foreman_hat) registerItem({ id: 'foreman_hat', name: "Foreman's Hard Hat", kind: 'drop', value: [190, 290], weight: 9, hands: 1 });
  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  if (mm?.creatureModels) mm.creatureModels.set(FOREMAN, (_T, o) => createForemanModel(o || {}));
  if (mm?.itemModels && !mm.itemModels.has('foreman_hat')) mm.itemModels.set('foreman_hat', () => createHardHatItem());
  registerCreature(LEGACY, { ...LEGACY_DEF }, legacyBehavior);
  if (!ITEMS.legacy_core) registerItem({ id: 'legacy_core', name: 'Legacy Core', kind: 'drop', value: [300, 460], weight: 14, hands: 1 });
  if (mm?.creatureModels) mm.creatureModels.set(LEGACY, (_T, o) => createLegacyModel(o || {}));
  if (mm?.itemModels && !mm.itemModels.has('legacy_core')) mm.itemModels.set('legacy_core', () => createLegacyCoreItem());
}

function pickBossWeapon(r) {
  const list = Object.values(ITEMS).filter((d) => d.kind === 'weapon' && !d.ranged && Array.isArray(d.value) && d.value[1] > 0 && d.dmg > 0);
  if (!list.length) return ITEMS.stopsign ? 'stopsign' : ITEMS.machete ? 'machete' : null;
  return r.weighted(list.map((d) => ({ id: d.id, w: d.dmg }))).id;
}

export function installBosses(game) {
  registerContent();
  const offs = [];
  let disposed = false;

  // ---------------- host state
  let boss = null;          // HostCreature of the Foreman spawned by the moon roll (or the debug spawn)
  let legacy = null;        // HostCreature of the Legacy Bot world boss
  const tracked = new Set(); // every live boss HostCreature on this host (stun guard, loot drop)
  const rockets = [];       // Legacy Bot rockets in flight (host): { to, t, src, dmg }
  let spawnKey = null;

  // ---------------- client state
  let view = null, lastState = null, lastFlags = 0, scanT = 0, stepT = 0, stingAt = 0;
  let light = null, loop = null;
  let ring = null, ringFill = null, dust = null, dustT = 1, dustR = SLAM_RADIUS;
  let lastBarType = null, lastBarView = null;
  let bar = null, barShown = false, deadT = 0, diedVisible = false, chip = 1, chipHold = 0, lastFill = -1, lastChip = -1, lastNum = '', lastRage = false, lastLv = -1;
  let styleEl = null;

  const audio = () => game.audio;
  const cam = () => game.camera.position;
  const has = (n) => { try { return !!audio()?.has?.(n); } catch { return false; } };
  const pickSnd = (names) => { for (const n of names) if (has(n)) return n; return names[names.length - 1]; };
  const sndAt = (names, v, vol = 1, extra = {}) => audio()?.play?.(pickSnd(names), { follow: v.root, volume: vol, occlude: true, refDistance: 4, maxDistance: 60, ...extra });

  // ---------------------------------------------------------------- host
  const isLive = (c) => !!c && !c.dead && game.creatures.host.get(c.id) === c;
  function track(c) {
    if (disposed || !c) return;
    installStunGuard(c, game);
    tracked.add(c);
  }

  function hostSpawnForeman(r) {
    if (disposed) return null;
    if (isLive(boss)) return boss;              // one Foreman per facility: never orphan a live one
    for (const c of tracked) if (isLive(c) && c.type === FOREMAN) { boss = c; return c; }
    const run = game.run, moon = MOONS[run?.moon], fac = game.world.facility;
    if (!fac || !moon) return null;
    const lair = findLair(fac);
    if (!lair) return null;
    const level = Math.max(1, (moon.tier || 2) * 2 - 1 + (run.quotaIndex || 0));
    const yaw = r ? r.float(0, TAU) : 0;
    const c = game.creatures.hostSpawn(FOREMAN, new THREE.Vector3(lair.sx, fac.layout.y, lair.sz), { level, elite: false, zone: 'in', state: 'idle', yaw, data: { lair } });
    if (!c) return null;
    boss = c;
    track(c);
    game.net.broadcast('sys', sysMsg('Seismic sensors: something heavy is pacing deep inside the facility...', {}, 'info'));
    return c;
  }

  function hostOnMoonPopulated() {
    if (disposed || !game.isHost) return false;
    const run = game.run, moon = MOONS[run?.moon];
    if (!run || run.phase !== 'moon' || !moon || moon.company || !game.world.facility) return false;
    const key = run.seed + ':' + run.moon;
    if (spawnKey === key) return false;      // idempotent (event + explicit hook may both call this)
    spawnKey = key;
    boss = null; legacy = null; rockets.length = 0;
    const legacyUp = hostRollLegacy(run, moon);   // outdoor world boss: its own seeded roll
    const force = !!game.config?.forceBoss;
    if ((moon.tier || 0) < 2 && !force) return legacyUp;
    const r = new RNG((run.seed ^ 0xb055f00d) >>> 0);
    const chance = game.config?.bossChance ?? Math.min(0.75, 0.2 + 0.05 * (run.quotaIndex || 0));
    if (!(r.next() < chance) && !force) return legacyUp;
    return !!hostSpawnForeman(r) || legacyUp;
  }

  function hostRollLegacy(run, moon) {
    if (!game.world.outdoor) return false;
    const force = !!game.config?.forceLegacy;
    if ((moon.tier || 0) < 2 && !force) return false;
    const r = new RNG((run.seed ^ 0x1e9ac7b0) >>> 0);
    const chance = game.config?.legacyChance ?? Math.min(0.45, 0.12 + 0.03 * (run.quotaIndex || 0) + ((moon.tier || 0) >= 3 ? 0.08 : 0));
    if (!(r.next() < chance) && !force) return false;
    return !!hostSpawnLegacy(r);
  }

  // parked far from the ship, preferably next to a distant outpost; dormant until dusk
  function hostSpawnLegacy(r) {
    if (disposed) return null;
    if (isLive(legacy)) return legacy;
    for (const c of tracked) if (isLive(c) && c.type === LEGACY) { legacy = c; return c; }
    const run = game.run, moon = MOONS[run?.moon], out = game.world.outdoor;
    if (!out || !moon || moon.company) return null;
    const rr = r || new RNG((Date.now() ^ 0x1e9a) >>> 0);
    let x, z;
    const sites = (out.outposts?.sites || []).filter((s2) => Number.isFinite(s2.x) && Math.hypot(s2.x, s2.z) > 60);
    if (sites.length) { const s2 = sites[Math.floor(rr.next() * sites.length)]; const a = rr.float(0, TAU); x = s2.x + Math.cos(a) * 12; z = s2.z + Math.sin(a) * 12; }
    else { const a = rr.float(0, TAU), dd = rr.float(80, 110); x = Math.cos(a) * dd; z = Math.sin(a) * dd; }
    x = clamp(x, -125, 125); z = clamp(z, -125, 125);
    if (Math.hypot(x, z) < 60) { const k = 60 / Math.max(1, Math.hypot(x, z)); x *= k; z *= k; }
    const y = game.world.terrain?.heightAt(x, z) ?? 0;
    const level = Math.max(1, (moon.tier || 2) * 2 + (run.quotaIndex || 0));
    const c = game.creatures.hostSpawn(LEGACY, new THREE.Vector3(x, y, z), { level, elite: false, zone: 'out', state: 'dormant', yaw: rr.float(0, TAU), variant: null, affix: null });
    if (!c) return null;
    legacy = c;
    track(c);
    game.net.broadcast('sys', sysMsg('Long-range scan: a decommissioned war machine is parked on this moon. Do not wake it before you have to.', {}, 'info'));
    return c;
  }

  function hostDropLoot(c) {
    const run = game.run || {}, moon = MOONS[run.moon];
    const r = new RNG(((run.seed || 1) ^ 0xd20b1007 ^ (c.seed || 0)) >>> 0);
    const valueMul = (moon?.scrapMul || 1) * (1 + (run.quotaIndex || 0) * 0.06) * 1.2;
    const total = 3 + r.int(0, 2);
    const drops = [];
    const wType = pickBossWeapon(r);
    if (wType) drops.push({ type: wType, af: rollWeaponAffixes(ITEMS[wType], (c.level || 1) + 3, r, { minRarity: 'rare', luck: 0.5 }) });
    if (ITEMS.foreman_hat) drops.push({ type: 'foreman_hat' });
    const pool = TREASURE.filter(([id]) => ITEMS[id]).map(([id, w]) => ({ id, w }));
    while (drops.length < total && pool.length) drops.push({ type: r.weighted(pool).id });
    const nav = game.world.facility?.nav || null;
    const ids = [];
    drops.forEach((dr, i) => {
      const a = (i / drops.length) * TAU + r.float(-0.3, 0.3);
      const ca = Math.cos(a), sa = Math.sin(a);
      // throw it outward only where both the spawn point and the landing point are open floor in view of the
      // body; otherwise pop it gently in place (a boss killed against a wall must not fling loot into the void)
      let off = 0.25, spd = 0;
      for (const [r0, land, s] of DROP_TRIES) {
        if (dropClear(c, ca, sa, r0, land, nav)) { off = r0; spd = s; break; }
      }
      const pos = new THREE.Vector3(c.pos.x + ca * off, c.pos.y + 0.9, c.pos.z + sa * off);
      ids.push(game.items.hostSpawn(dr.type, pos, { valueMul, af: dr.af || undefined, linvel: [ca * spd, spd > 0 ? 3.5 : 2.5, sa * spd] }));
    });
    scheduleLootCheck(ids, c);
    const who = topDamage(c);
    game.net.broadcast('sys', sysMsg('THE FOREMAN has been decommissioned!{who} His stash spills across the floor.', { who }, 'good'));
    game.net.broadcast('fx', { k: 'bdead', n: 'The Foreman has been decommissioned', p: [+c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2)] });
  }

  function topDamage(c) {
    let mvp = null, top = 0;
    for (const [id, dmg] of c.attackers) if (dmg > top && typeof id === 'string' && game.aiPlayerById?.(id)) { top = dmg; mvp = id; }
    return mvp ? ` Top damage: ${game.playerName(mvp)} (${Math.round(top)}).` : '';
  }

  // Boss loot must never end up inside a wall or under the floor / terrain: 2.5 s after the drop every item that
  // flew too far, sank or landed outside the walkable area is put back next to the body.
  function scheduleLootCheck(ids, c) {
    const home = c.pos.clone();
    const fac = c.zone === 'in' ? game.world.facility : null;
    const check = () => {
      if (disposed) return;
      ids.forEach((id, i) => {
        const it = game.items.get?.(id);
        if (!it || it.state !== 'world' || it.holder || !it.obj) return;
        const p = it.obj.position;
        let bad = Math.hypot(p.x - home.x, p.z - home.z) > 9 || p.y < home.y - 1.5;
        if (fac?.nav && !fac.nav.walkableAt(p.x, p.z) && fac.nav.walkableAt(home.x, home.z)) bad = true;
        if (!fac) { const h = game.world.terrain?.heightAt?.(p.x, p.z); if (Number.isFinite(h) && p.y < h - 0.8) bad = true; }
        if (!bad) return;
        const a = (i / Math.max(1, ids.length)) * TAU;
        game.net.broadcast('it', { e: 'tp', id, p: [+(home.x + Math.cos(a) * 0.45).toFixed(2), +(home.y + 0.8).toFixed(2), +(home.z + Math.sin(a) * 0.45).toFixed(2)] });
      });
    };
    if (typeof game.later === 'function') game.later(check, 2500); else setTimeout(check, 2500);
  }

  function hostDropLegacyLoot(c) {
    const run = game.run || {}, moon = MOONS[run.moon];
    const r = new RNG(((run.seed || 1) ^ 0x1e9ac0de ^ (c.seed || 0)) >>> 0);
    const valueMul = (moon?.scrapMul || 1) * (1 + (run.quotaIndex || 0) * 0.06) * 1.35;
    const drops = [];
    const wType = pickBossWeapon(r);
    if (wType) drops.push({ type: wType, af: rollWeaponAffixes(ITEMS[wType], (c.level || 1) + 5, r, { minRarity: 'epic', luck: 0.7 }) });
    if (ITEMS.legacy_core) drops.push({ type: 'legacy_core' });
    const pool = LEGACY_TREASURE.filter(([id]) => ITEMS[id]).map(([id, wt]) => ({ id, w: wt }));
    const total = 4 + r.int(0, 2);
    while (drops.length < total && pool.length) drops.push({ type: r.weighted(pool).id });
    const ids = [];
    drops.forEach((dr, i) => {
      const a = (i / drops.length) * TAU + r.float(-0.3, 0.3);
      const pos = new THREE.Vector3(c.pos.x + Math.cos(a) * 1.2, c.pos.y + 1.6, c.pos.z + Math.sin(a) * 1.2);
      ids.push(game.items.hostSpawn(dr.type, pos, { valueMul, af: dr.af || undefined, linvel: [Math.cos(a) * 3, 4, Math.sin(a) * 3] }));
    });
    scheduleLootCheck(ids, c);
    game.net.broadcast('sys', sysMsg('THE LEGACY BOT has been deprecated!{topDamage} Its core and cargo are scattered around the wreck.', { topDamage: topDamage(c) }, 'good'));
    game.net.broadcast('fx', { k: 'bdead', n: 'The Legacy Bot has been deprecated', p: [+c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2)] });
  }

  function dropClear(c, ca, sa, r0, land, nav) {
    const x = c.pos.x + ca * r0, z = c.pos.z + sa * r0;
    const lx = c.pos.x + ca * land, lz = c.pos.z + sa * land;
    if (nav && (!nav.walkableAt(x, z) || !nav.walkableAt(lx, lz))) return false;
    const ph = game.physics;
    if (!ph?.lineOfSight) return true;
    _from.set(c.pos.x, c.pos.y + 0.9, c.pos.z);
    _v.set(lx, c.pos.y + 0.9, lz);
    return ph.lineOfSight(_from, _v);
  }

  function hostTick(dt) {
    // Legacy Bot rockets: land where the target was when they were fired (the ground marker showed it)
    for (let i = rockets.length - 1; i >= 0; i--) {
      const rk = rockets[i];
      rk.t -= dt;
      if (rk.t > 0) continue;
      rockets.splice(i, 1);
      if (game.run?.phase === 'moon') game.creatures.blast?.(rk.to, L_ROCKET_R, rk.dmg, rk.src, LEGACY);
    }
    for (const c of tracked) {
      if (game.creatures.host.get(c.id) !== c) { tracked.delete(c); if (boss === c) boss = null; if (legacy === c) legacy = null; continue; }
      const d = c.data;
      if (c.dead) {
        if (!d.looted) { d.looted = true; if (c.type === LEGACY) hostDropLegacyLoot(c); else hostDropLoot(c); }
        continue;
      }
      // safety net for a stun written straight into c.stunT without setState('stunned'): the guard never saw
      // it, so clamp it to the accepted stun window (normally a no-op)
      if (c.stunT > 0) {
        const left = (d.stunEnd || 0) - (game.time || 0);
        if (c.stunT > left + 0.05) c.stunT = Math.max(0, left);
      }
    }
  }

  // ---------------------------------------------------------------- client visuals
  function ensureStyle() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }
  function ensureBar() {
    if (bar || typeof document === 'undefined') return bar;
    ensureStyle();
    const el = document.createElement('div');
    el.className = 'kc-boss kc-off';
    el.innerHTML = '<div class="kc-boss-name"><span class="kc-boss-title">THE FOREMAN</span><span class="kc-boss-lv"></span><span class="kc-boss-tag">ENRAGED</span></div>'
      + '<div class="kc-boss-bar"><div class="kc-boss-chip"></div><div class="kc-boss-fill"></div><div class="kc-boss-mark"></div></div><div class="kc-boss-num"></div>';
    (game.ui?.hud?.el || document.body).appendChild(el);
    const q = (s) => el.querySelector(s);
    bar = { el, title: q('.kc-boss-title'), lv: q('.kc-boss-lv'), tag: q('.kc-boss-tag'), fill: q('.kc-boss-fill'), chip: q('.kc-boss-chip'), num: q('.kc-boss-num') };
    lastBarType = null;
    return bar;
  }

  function ensureRing() {
    if (ring) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3010, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    ring = new THREE.Mesh(new THREE.RingGeometry(SLAM_RADIUS - 0.14, SLAM_RADIUS, 36).rotateX(-PI / 2), mat);
    const fmat = new THREE.MeshBasicMaterial({ color: 0xff5020, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    ringFill = new THREE.Mesh(new THREE.CircleGeometry(SLAM_RADIUS, 36).rotateX(-PI / 2), fmat);
    ring.add(ringFill);
    ring.visible = false;
    ring.renderOrder = 3;
    game.scene.add(ring);
  }
  function ensureDust() {
    if (dust) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0xb8a58a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    dust = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 28).rotateX(-PI / 2), mat);
    dust.visible = false;
    game.scene.add(dust);
  }

  function attachView(v) {
    view = v; lastState = v.state; lastFlags = v.extra | 0; stepT = 0;
    light = game.lights?.add({ pos: new THREE.Vector3().copy(v.pos), color: 0xff6a1a, intensity: 1.0, distance: 8, group: 'boss', flicker: 0.12 }) || null;
    if (v.state !== 'dead') loop = audio()?.play?.('lights_buzz', { loop: true, follow: v.root, pitch: 0.45, volume: 0.7, occlude: true, refDistance: 3, maxDistance: 32 }) || null;
  }
  function dropView() {
    if (light) { game.lights?.remove(light); light = null; }
    loop?.stop?.(0.3); loop = null;
    if (ring) ring.visible = false;
    view = null; lastState = null;
  }
  function findView() {
    for (const v of game.creatures.views.values()) if (v.type === FOREMAN) return v;
    return null;
  }

  function onState(v, prev, st) {
    const d = v.pos.distanceTo(cam());
    if (st === 'roar') {
      sndAt(['mon_roar_1', 'giant_growl'], v, 1, { maxDistance: 90 });
      if (d < 16) game.engine?.shake?.(clamp(0.7 - d / 25, 0.1, 0.6));
    } else if (st === 'windup') {
      sndAt(['steam_hiss'], v, 1);
      sndAt(['mon_growl_3', 'giant_growl'], v, 0.8);
    } else if ((st === S_CHASE || st === 'chase') && (prev === 'idle' || prev === 'walk')) {
      sndAt(['mon_deep_growl', 'giant_growl'], v, 0.8);
    } else if (st === 'stunned') {
      sndAt(['hit_metal'], v, 0.9, { pitch: 0.6 });
    } else if (st === 'dead') {
      sndAt(['creature_death'], v, 1, { pitch: 0.6 });
      sndAt(['power_down'], v, 0.8);
      loop?.stop?.(1.5); loop = null;
    }
  }

  function tickView(v, dt) {
    const flags = v.extra | 0;
    const dead = v.state === 'dead';
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    if (v.state !== lastState) { const prev = lastState; lastState = v.state; onState(v, prev, v.state); }
    if ((flags & F_ENGAGED) && !(lastFlags & F_ENGAGED) && !dead && game.time >= stingAt && v.pos.distanceTo(cam()) < 30) {
      stingAt = game.time + 25;
      audio()?.play?.('chase_sting', { volume: 0.75, bus: 'music' });
    }
    lastFlags = flags;
    const chasing = v.state === S_CHASE || v.state === 'chase';
    // furnace light
    if (light) {
      light.pos.set(v.pos.x + fx * 0.7, v.pos.y + 1.75, v.pos.z + fz * 0.7);
      const windK = v.state === 'windup' ? clamp(v.stateT / SLAM_TELEGRAPH, 0, 1) : 0;
      const target = dead ? 0 : 0.9 + ((flags & F_ENRAGED) ? 0.5 : 0) + windK * 1.3 + (v.state === 'roar' ? 0.8 : 0);
      light.intensity = damp(light.intensity, target, dead ? 0.8 : 6, dt);
      light.color = (flags & F_ENRAGED) ? 0xff4010 : 0xff6a1a;
    }
    // heavy footsteps
    if (!dead && (v.state === 'walk' || chasing)) {
      stepT -= dt;
      if (stepT <= 0) {
        stepT = chasing ? ((flags & F_ENRAGED) ? 0.48 : 0.66) : 0.9;
        audio()?.play?.('giant_step', { follow: v.root, volume: 0.5, pitch: 1.25, occlude: true, refDistance: 3, maxDistance: 45 });
        const d = v.pos.distanceTo(cam());
        if (d < 9) game.engine?.shake?.(0.06 + (9 - d) * 0.01);
      }
    }
    // slam telegraph ring
    if (v.state === 'windup') {
      ensureRing();
      const k = clamp(v.stateT / SLAM_TELEGRAPH, 0, 1);
      ring.visible = true;
      ring.position.set(v.pos.x + fx * SLAM_FWD, v.pos.y + 0.04, v.pos.z + fz * SLAM_FWD);
      ringFill.scale.setScalar(Math.max(0.02, k));
      ring.material.opacity = 0.35 + 0.35 * Math.abs(Math.sin(game.time * 14));
    } else if (ring) ring.visible = false;
  }

  function tickDust(dt) {
    if (!dust || !dust.visible) return;
    dustT += dt;
    const k = clamp(dustT / 0.55, 0, 1);
    dust.scale.setScalar(0.5 + k * (dustR + 0.8));
    dust.material.opacity = (1 - k) * 0.55;
    if (k >= 1) dust.visible = false;
  }

  // ---------------------------------------------------------------- Legacy Bot (client)
  let lview = null, lLast = null, lScanT = 0, lStepT = 0, lBeepT = 0, lLight = null, lLoop = null, lRing = null, lRingFill = null;
  const lRockets = [];
  let rocketGeo = null, rocketMat = null, flameMat = null, markerGeo = null;
  const _look = new THREE.Vector3(), _lens = new THREE.Vector3(), _ltgt = new THREE.Vector3();

  function lFind() { for (const v of game.creatures.views.values()) if (v.type === LEGACY) return v; return null; }
  function lAttach(v) {
    lview = v; lLast = v.state; lStepT = 0;
    lLight = game.lights?.add({ pos: v.pos.clone(), color: 0xfff0c8, intensity: 0, distance: 12, group: 'boss', flicker: 0.05 }) || null;
  }
  function lDetach() {
    if (lLight) { game.lights?.remove(lLight); lLight = null; }
    lLoop?.stop?.(0.5); lLoop = null;
    if (lRing) lRing.visible = false;
    lview = null; lLast = null;
  }
  // nearest living player (self or remote) to p within r: where the eye / pods point once engaged
  function nearestPlayerPos(p, r, out) {
    let best = r * r, found = false;
    const me = game.player;
    if (me && !me.dead) { const d2 = me.pos.distanceToSquared(p); if (d2 < best) { best = d2; out.copy(me.pos); found = true; } }
    for (const rm of game.remotes?.values?.() || []) {
      if (rm.dead) continue;
      const d2 = rm.pos.distanceToSquared(p);
      if (d2 < best) { best = d2; out.copy(rm.pos); found = true; }
    }
    return found;
  }
  function lOnState(v, prev, st) {
    const d = v.pos.distanceTo(cam());
    if (st === 'boot') {
      sndAt(['scifi_wake_up', 'power_up'], v, 1, { maxDistance: 160, refDistance: 10 });
      sndAt(['scifi_alarm', 'alarm_loop'], v, 0.7, { maxDistance: 160, refDistance: 10 });
    } else if (st === 'roar') {
      const f = v.extra | 0;
      sndAt([(f & L_P3) ? 'vo_nightmare_mode' : (f & L_P2) ? 'vo_malfunction' : 'mon_roar_2', 'mon_roar_2', 'giant_growl'], v, 1, { maxDistance: 160, refDistance: 10 });
      sndAt(['steam_hiss'], v, 0.9, { refDistance: 6 });
      if (d < 30) game.engine?.shake?.(clamp(0.8 - d / 40, 0.1, 0.6));
    } else if (st === 'lock') {
      lBeepT = 0;
    } else if (st === 'fire') {
      sndAt(['harpoon_fire', 'shotgun_fire'], v, 1, { pitch: 0.55, maxDistance: 140, refDistance: 8 });
    } else if (st === 'windup') {
      sndAt(['steam_hiss'], v, 1, { pitch: 0.7, refDistance: 6 });
    } else if (st === 'stunned') {
      sndAt(['hit_metal'], v, 1, { pitch: 0.45, refDistance: 6 });
    } else if (st === 'dead') {
      sndAt(['vo_deactivated', 'power_down'], v, 1, { maxDistance: 160, refDistance: 10 });
      sndAt(['explosion'], v, 0.8, { refDistance: 8 });
    }
  }
  function lTick(v, dt) {
    const flags = v.extra | 0;
    const awake = (flags & L_AWAKE) !== 0 || v.state === 'boot';
    const dead = v.state === 'dead';
    if (v.state !== lLast) { const prev = lLast; lLast = v.state; lOnState(v, prev, v.state); }
    // engine hum
    if (awake && !dead && !lLoop) lLoop = audio()?.play?.('jetpack', { loop: true, follow: v.root, pitch: 0.42, volume: 0.55, occlude: true, refDistance: 6, maxDistance: 90 }) || null;
    if ((!awake || dead) && lLoop) { lLoop.stop?.(1.2); lLoop = null; }
    // where the eye looks: sweep while patrolling, the nearest player once engaged
    const engaged = (flags & L_ENGAGED) !== 0 && !dead;
    const lensObj = v.model?.parts?.lens;
    if (lensObj) lensObj.getWorldPosition(_lens); else _lens.set(v.pos.x, v.pos.y + 5.3, v.pos.z);
    let haveTgt = false;
    if (engaged && nearestPlayerPos(v.pos, 75, _ltgt)) { _ltgt.y += 1.2; haveTgt = true; }
    if (!haveTgt) {
      const a = v.yaw + Math.sin(game.time * 0.6) * 0.8;
      _ltgt.set(v.pos.x + Math.sin(a) * 26, v.pos.y, v.pos.z + Math.cos(a) * 26);
      const h = game.world.terrain?.heightAt?.(_ltgt.x, _ltgt.z);
      if (Number.isFinite(h)) _ltgt.y = h;
    }
    if (v.model) {
      v.root.updateMatrixWorld();
      v.model.lookLocal = awake && !dead ? v.root.worldToLocal(_look.copy(_ltgt)) : null;
    }
    // the spotlight: one pooled spot light (the local flashlight keeps priority 0)
    if (awake && !dead) {
      const p3 = (flags & L_P3) !== 0;
      game.lights?.requestSpot?.({ pos: _lens.clone(), target: _ltgt.clone(), priority: 1.2, intensity: engaged ? 70 : 45, distance: 70, angle: 0.3, penumbra: 0.35, color: p3 || v.state === 'lock' ? 0xff5040 : 0xfff2d0 });
    }
    if (lLight) {
      lLight.pos.copy(_lens);
      lLight.intensity = damp(lLight.intensity, awake && !dead ? 0.9 : 0, 3, dt);
      lLight.color = (flags & L_P3) ? 0xff4030 : 0xfff0c8;
    }
    // lock-on beeps accelerate until the pods fire
    if (v.state === 'lock') {
      lBeepT -= dt;
      if (lBeepT <= 0) {
        lBeepT = Math.max(0.07, 0.3 - v.stateT * 0.22);
        audio()?.play?.(pickSnd(['beep_5', 'mine_beep']), { follow: v.root, volume: 0.9, pitch: 1.2 + v.stateT * 0.4, refDistance: 8, maxDistance: 120 });
      }
    }
    // footsteps that shake the ground
    if (!dead && awake && (v.state === 'run' || v.state === 'patrol')) {
      lStepT -= dt;
      if (lStepT <= 0) {
        lStepT = v.state === 'run' ? 0.8 : 1.05;
        audio()?.play?.('giant_step', { follow: v.root, volume: 0.9, pitch: 0.7, occlude: true, refDistance: 8, maxDistance: 110 });
        const d = v.pos.distanceTo(cam());
        if (d < 22) game.engine?.shake?.(0.08 + (22 - d) * 0.012);
      }
    }
    // stomp telegraph ring
    if (v.state === 'windup' && !dead) {
      if (!lRing) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xff3010, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
        lRing = new THREE.Mesh(new THREE.RingGeometry(L_STOMP_R - 0.2, L_STOMP_R, 40).rotateX(-PI / 2), mat);
        lRingFill = new THREE.Mesh(new THREE.CircleGeometry(L_STOMP_R, 40).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5020, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
        lRing.add(lRingFill);
        lRing.renderOrder = 3;
        game.scene.add(lRing);
      }
      lRing.visible = true;
      lRing.position.set(v.pos.x, v.pos.y + 0.08, v.pos.z);
      lRingFill.scale.setScalar(Math.max(0.02, clamp(v.stateT / L_STOMP_WIND, 0, 1)));
      lRing.material.opacity = 0.35 + 0.35 * Math.abs(Math.sin(game.time * 14));
    } else if (lRing) lRing.visible = false;
  }

  // rockets: a small body with a flame flying a lofted arc; a red marker pulses where it will land
  function spawnRocket(d) {
    if (!Array.isArray(d.a) || !Array.isArray(d.b)) return;
    if (!rocketGeo) {
      rocketGeo = new THREE.CylinderGeometry(0.09, 0.12, 0.7, 6).rotateX(PI / 2);
      rocketMat = new THREE.MeshLambertMaterial({ color: 0xd8ccb0 });
      flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
      markerGeo = new THREE.RingGeometry(0.75, 1, 28).rotateX(-PI / 2);
    }
    const a = new THREE.Vector3().fromArray(d.a), b = new THREE.Vector3().fromArray(d.b);
    const mesh = new THREE.Mesh(rocketGeo, rocketMat);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 6).rotateX(-PI / 2), flameMat);
    flame.position.z = -0.55;
    mesh.add(flame);
    mesh.visible = false;
    const mm = new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
    const marker = new THREE.Mesh(markerGeo, mm);
    const rr = +d.r || L_ROCKET_R;
    marker.scale.setScalar(rr);
    marker.position.set(b.x, b.y + 0.08, b.z);
    game.scene.add(mesh, marker);
    const w = clamp(+d.w || 0, 0, 2), dur = clamp((+d.d || 1) - w, 0.3, 6);
    lRockets.push({ mesh, flame, marker, a, b, t: -w, dur, launched: false, rr });
  }
  function tickRockets(dt) {
    for (let i = lRockets.length - 1; i >= 0; i--) {
      const r = lRockets[i];
      r.t += dt;
      r.marker.material.opacity = 0.35 + 0.35 * Math.abs(Math.sin(game.time * 12));
      if (r.t < 0) continue;
      if (!r.launched) {
        r.launched = true; r.mesh.visible = true;
        audio()?.at?.(pickSnd(['swoosh_3', 'swing_whoosh']), r.a.clone(), 1, { pitch: 0.6, refDistance: 8, maxDistance: 120 });
      }
      const k = clamp(r.t / r.dur, 0, 1);
      const prev = r.mesh.position.clone();
      r.mesh.position.lerpVectors(r.a, r.b, k);
      r.mesh.position.y += Math.sin(k * PI) * Math.min(8, r.a.distanceTo(r.b) * 0.2);
      if (k > 0.01) r.mesh.lookAt(r.mesh.position.clone().add(r.mesh.position.clone().sub(prev)));
      r.flame.scale.setScalar(0.8 + Math.random() * 0.5);
      r.marker.scale.setScalar(r.rr * (1 - k * 0.3));
      if (k >= 1) {
        r.mesh.removeFromParent(); r.marker.removeFromParent();
        r.flame.geometry.dispose(); r.marker.material.dispose();
        lRockets.splice(i, 1);
      }
    }
  }
  function clearRockets() {
    for (const r of lRockets) { r.mesh.removeFromParent(); r.marker.removeFromParent(); r.flame.geometry.dispose(); r.marker.material.dispose(); }
    lRockets.length = 0;
  }

  function tickBar(v, dt) {
    let show = false;
    if (v) {
      const near = v.pos.distanceTo(cam()) < (v.type === LEGACY ? L_BAR_RANGE : HP_BAR_RANGE);
      if (v.state === 'dead') {
        if (deadT === 0) diedVisible = barShown;     // keep the bar up briefly only if it was up at the kill
        deadT += dt;
        show = diedVisible && near && deadT < 3.5;
      } else {
        deadT = 0;
        show = near && ((v.extra | 0) & F_ENGAGED) !== 0;
      }
    } else deadT = 0;
    if (show && !bar) ensureBar();
    if (!bar) return;
    if (show !== barShown) {
      barShown = show;
      bar.el.classList.toggle('kc-off', !show);
      if (show) { chip = 1; lastFill = -1; lastChip = -1; game.progress?.see?.(v.type); }
    }
    if (!show) return;
    if (v.type !== lastBarType) {
      lastBarType = v.type;
      bar.title.textContent = String(v.def?.name || v.type).toUpperCase();
      lastRage = null;
    }
    const max = v.maxHp || 1;
    const hp = clamp(v.hp ?? max, 0, max);
    const f = hp / max;
    if (f < chip) { chipHold -= dt; if (chipHold <= 0) chip = Math.max(f, chip - dt * 0.4); } else { chip = f; chipHold = 0.5; }
    if (Math.abs(f - lastFill) > 0.001) { if (f < lastFill) chipHold = Math.max(chipHold, 0.45); lastFill = f; bar.fill.style.transform = `scaleX(${f.toFixed(4)})`; }
    if (Math.abs(chip - lastChip) > 0.001) { lastChip = chip; bar.chip.style.transform = `scaleX(${chip.toFixed(4)})`; }
    const dead = v.state === 'dead';
    const num = dead ? (v.type === LEGACY ? 'DEPRECATED' : 'DECOMMISSIONED') : `${Math.ceil(hp)} / ${max}`;
    if (num !== lastNum) { lastNum = num; bar.num.textContent = num; }
    const fl = v.extra | 0;
    const tag = dead ? '' : v.type === LEGACY ? ((fl & L_P3) ? 'KERNEL PANIC' : (fl & L_P2) ? 'LEGACY MODE' : '') : ((fl & F_ENRAGED) ? 'ENRAGED' : '');
    if (tag !== lastRage) { lastRage = tag; bar.el.classList.toggle('rage', !!tag); if (bar.tag) bar.tag.textContent = tag; }
    if (v.level !== lastLv) { lastLv = v.level; bar.lv.textContent = 'Lv.' + v.level; }
  }

  function onFx(d) {
    if (disposed || !d) return;
    if ((d.k === 'bslam' || d.k === 'lbstomp') && Array.isArray(d.p)) {
      _v.fromArray(d.p);
      const big = d.k === 'lbstomp';
      const dist = _v.distanceTo(cam());
      if (dist < (big ? 30 : 20)) game.engine?.shake?.(clamp((big ? 1.8 : 1.4) - dist / (big ? 14 : 9), 0.08, 1.3));
      if (dist < (big ? 7 : 5)) game.engine?.flash?.(0xff9040, 0.22);
      // own vectors: AudioManager keeps `pos` and replays a still-loading external one-shot later with it
      audio()?.at?.('explosion', _v.clone(), big ? 0.9 : 0.55, { occlude: true, refDistance: big ? 7 : 4, maxDistance: big ? 120 : 70 });
      audio()?.at?.(pickSnd(['impact_metal_2', 'hit_metal']), _v.clone(), 1, { occlude: true, refDistance: 3, pitch: big ? 0.4 : 0.55 });
      ensureDust();
      dustR = big ? (+d.r || L_STOMP_R) : SLAM_RADIUS;
      dust.position.set(_v.x, _v.y + 0.05, _v.z);
      dust.visible = true; dustT = 0;
    } else if (d.k === 'lbrocket') {
      spawnRocket(d);
    } else if (d.k === 'bdead' && Array.isArray(d.p)) {
      _v.fromArray(d.p);
      if (_v.distanceTo(cam()) < 90) {
        game.ui?.hud?.bigText?.(t('BOSS DEFEATED'), t(typeof d.n === 'string' ? d.n.slice(0, 60) : 'The Foreman has been decommissioned'));
        audio()?.play?.('quota_jingle', { volume: 0.7, bus: 'music' });
      }
    }
  }

  function update(dt) {
    if (disposed) return;
    if (game.isHost) hostTick(dt);
    let v = view;
    if (v && game.creatures.views.get(v.id) !== v) { dropView(); v = null; }
    if (!v) {
      scanT -= dt;
      if (scanT <= 0) { scanT = 0.5; v = findView(); if (v) attachView(v); }
    }
    if (v) tickView(v, dt);
    let lv = lview;
    if (lv && game.creatures.views.get(lv.id) !== lv) { lDetach(); lv = null; }
    if (!lv) {
      lScanT -= dt;
      if (lScanT <= 0) { lScanT = 0.5; lv = lFind(); if (lv) lAttach(lv); }
    }
    if (lv) lTick(lv, dt);
    if (!game.world?.moonId && lRockets.length) clearRockets();
    tickRockets(dt);
    tickDust(dt);
    // one HP bar: the nearest engaged boss (or the one that just died)
    let bv = null, bd = Infinity;
    for (const c of [v, lv]) {
      if (!c || !(((c.extra | 0) & F_ENGAGED) || c.state === 'dead')) continue;
      const dd = c.pos.distanceTo(cam());
      if (dd < bd) { bd = dd; bv = c; }
    }
    bv = bv || v || lv;
    if (bv !== lastBarView) { lastBarView = bv; deadT = 0; }
    tickBar(bv, dt);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const off of offs) { try { off(); } catch { /* ignore */ } }
    offs.length = 0;
    dropView();
    lDetach();
    clearRockets();
    for (const m of [ring, dust, lRing]) {
      if (!m) continue;
      m.removeFromParent();
      m.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    }
    ring = ringFill = dust = lRing = lRingFill = null;
    rocketGeo?.dispose(); rocketMat?.dispose(); flameMat?.dispose(); markerGeo?.dispose();
    rocketGeo = rocketMat = flameMat = markerGeo = null;
    bar?.el.remove(); bar = null;
    styleEl?.remove(); styleEl = null;
    boss = null; legacy = null; rockets.length = 0;
    tracked.clear();
    if (REG.get(game) === director) REG.delete(game);
  }

  const director = { track, rockets };
  REG.set(game, director);

  if (game.mods?.on) {
    offs.push(game.mods.on('update', (dt, g) => { if (g === game) update(dt); }));
    offs.push(game.mods.on('moonPopulated', (g) => { if (g === game) hostOnMoonPopulated(); }));
    offs.push(game.mods.on('fx', (d) => onFx(d)));
    offs.push(game.mods.on('sessionEnd', (g) => { if (g === game) dispose(); }));
  }

  return {
    hostOnMoonPopulated,
    hostSpawnForeman: () => (game.isHost ? hostSpawnForeman(new RNG((Date.now() ^ 0x5eed) >>> 0)) : null),
    hostSpawnLegacy: () => (game.isHost ? hostSpawnLegacy(new RNG((Date.now() ^ 0x1e9a) >>> 0)) : null),
    get legacy() { return legacy; },
    update,                 // only needed when the game has no mod manager (listeners are used otherwise)
    onFx,
    dispose,
    get boss() { return boss; },
  };
}
