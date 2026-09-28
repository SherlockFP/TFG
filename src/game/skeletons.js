// SKELETONS (wave 2, module `skeletons`, docs/wave2/skeletons.md): the DELETED USERS family, skeletons of banned accounts with glitchy
// username tags floating over their skulls. Installed with this.useModule('skeletons', installSkeletons).
//   skel_walker  Bone Walker  basic melee, rattles; knocked down it lies there 4 s and reassembles ONCE unless the skull is smashed (hit it again)
//   skel_archer  Bone Archer  throws bone shards / old CDs with a visible wind-up (arm back, projectile glows), keeps 5.5-15 m
//   skel_knight  Bone Knight  shield blocks frontal hits (85 %), turns slowly (flank it), a heavy / charged hit staggers it
//   skel_swarm   Bone Swarm   tiny skull-headed hands, weak, spawn in groups
// Everything is host-authoritative and runs inside the generic CreatureManager.hostUpdate (registerCreature behaviours), so stun, XP, snapshots,
// balance.scale (HP / damage / speed / spawn), creature tiers (forge: HP / damage / XP / shards / affixes) and crafting drops (def.compDrop) apply as
// for every other creature. Skeleton-specific rules that need to sit BETWEEN a hit and the HP change (Walker collapse, Knight shield) live in an
// instance wrapper of CreatureManager.damage (restored in dispose), like creature_tiers.js does for the paywalled affix.
// Net: fx { k: 'skshot'|'skhit'|'skblock'|'skcollapse'|'sksmash'|'skrise' } (host -> all, played by every peer), no new message types, nothing saved.
import * as THREE from 'three';
import { registerCreature, CREATURES, EXTRA_SPAWNS, AFFIXES, canSpawnMore } from './creatures.js';
import { STATE_SOUNDS } from '../entities/creatures.js';
import { addTranslations, t } from '../core/i18n.js';
import { angleDiff, clamp } from '../core/util.js';
import { tierIndex } from './tiers.js';
import { EXTRA_ARMOR } from './enhance.js';
import {
  DEFS, SPAWNS, NIGHT, TUNING, TR, IDENT_ROWS, SKEL_TYPES, isSkel, archerWindup, archerLead, archerCooldown, inShieldArc, isHeavy, knightHit,
  walkerHit, stepProjectile, aimVelocity, tagFor,
} from './skeleton_data.js';
import { registerSkeletonModels, createProjectileMesh } from '../models/skeletons.js';

const rnd = Math.random;
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3();

// soft link to the identification module (src/game/identify.js, another wave-2 module): add rows to its IDENT table when it exists
let IDENT_MOD = null;
try { IDENT_MOD = Object.values(import.meta.glob('./identify.js', { eager: true }))[0] || null; } catch { IDENT_MOD = null; }

// ------------------------------------------------------------------------------------------------ registration
const BEHAVIORS = {};
let registered = false;
/** register creatures, spawn weights, state sounds and translations (idempotent) */
export function registerSkeletonContent() {
  if (registered) return;
  registered = true;
  for (const [id, def] of Object.entries(DEFS)) if (!CREATURES[id]) registerCreature(id, { ...def }, BEHAVIORS[id]);
  for (const [id, e] of Object.entries(SPAWNS)) if (!EXTRA_SPAWNS[id]) EXTRA_SPAWNS[id] = e;
  Object.assign(STATE_SOUNDS, {
    skel_walker: {
      run: [['voice_skeleton_anger', 'voice_skeleton_grunt'], 0.5, 1.15], attack: [['voice_skeleton_attack', 'voice_skeleton_anger'], 0.8, 1.0],
      collapsed: [['glass_break', 'hit_wall'], 0.7, 0.6], rise: [['voice_skeleton_grunt', 'voice_skeleton_hurt'], 0.8, 0.75],
      stunned: [['voice_skeleton_hurt', 'hit_flesh'], 0.6, 1.0], dead: [['voice_skeleton_die', 'creature_death'], 0.9, 1.0],
    },
    skel_archer: {
      draw: [['beep_3', 'turret_detect'], 0.5, 1.7], throw: [['swoosh_2', 'swing_whoosh'], 0.85, 1.1], run: [['voice_skeleton_grunt'], 0.4, 1.3],
      stunned: [['voice_skeleton_hurt', 'hit_flesh'], 0.6, 1.2], dead: [['voice_skeleton_die', 'creature_death'], 0.9, 1.15],
    },
    skel_knight: {
      attack: [['voice_skeleton_anger', 'voice_skeleton_attack'], 0.9, 0.7], run: [['voice_skeleton_grunt'], 0.5, 0.7],
      stunned: [['impact_metal_2', 'impact_metal_1'], 0.9, 0.8], dead: [['impact_metal_2', 'voice_skeleton_die'], 1.0, 0.7],
    },
    skel_swarm: {
      run: [['scuttler_hiss'], 0.25, 1.9], attack: [['scuttler_hiss'], 0.5, 1.7], dead: [['squeak', 'voice_skeleton_die'], 0.4, 1.9],
    },
  });
  addTranslations(TR);
}

// ------------------------------------------------------------------------------------------------ shared host helpers
const SM = new WeakMap();   // CreatureManager -> shared scratch (rattle limiter, projectile list)
const shared = (M) => { let s = SM.get(M); if (!s) { s = { nextRattle: 0, proj: [], seq: 0 }; SM.set(M, s); } return s; };
const sectorOf = (M) => M.game.run?.quotaIndex || 0;

function faceTo(c, x, z, dt, rate) {
  const want = Math.atan2(x - c.pos.x, z - c.pos.z);
  c.yaw += clamp(angleDiff(c.yaw, want), -rate * dt, rate * dt);
}
function roam(c, dt, M, radius = 12, idleT = 3) {
  if (c.state === 'idle') { if (c.t > idleT) { M.wander(c, radius); c.setState('walk'); } }
  else if (c.state === 'walk') { if (M.follow(c, dt, c.def.walk)) c.setState('idle'); }
  else c.setState('idle');
}
function awayFrom(c, M, x, z, dist = 8) {
  const a = Math.atan2(c.pos.x - x, c.pos.z - z), nav = M.nav(c);
  if (nav) { for (let i = 0; i < 4; i++) { const w = nav.randomWalkable(rnd, c.pos.x + Math.sin(a) * dist, c.pos.z + Math.cos(a) * dist, 3 + i * 2); if (w) { M.goTo(c, w.x, w.z); return; } } }
  M.goTo(c, c.pos.x + Math.sin(a) * dist, c.pos.z + Math.cos(a) * dist);
}
/** rattle: bones clatter while moving; one voice at a time across all skeletons */
function rattle(c, M, now) {
  const s = shared(M);
  if (now < s.nextRattle || rnd() > 0.05) return;
  s.nextRattle = now + 0.5 + rnd() * 0.5;
  M.sound(c, ['hit_wall', 'impact_punch'], 0.32, 3, 1.7 + rnd() * 0.5, 22);
}
/** target selection, throttled: sight / hearing / being hit; drops the target after `lose` seconds without line of sight */
function acquire(c, dt, M, o) {
  const d = c.data, g = M.game, now = g.time || 0;
  d.think = (d.think ?? rnd() * 0.3) - dt;
  const players = M.playersFor(c).filter((p) => !p.inShip);
  let tgt = c.target ? players.find((p) => p.id === c.target) || null : null;
  if (d.think <= 0) {
    d.think = 0.3 + rnd() * 0.3;
    if (d.hitBy && now - (d.hitAt || 0) < 8) { const h = players.find((p) => p.id === d.hitBy); if (h) { tgt = h; c.target = h.id; d.lostT = 0; } }
    const near = M.nearest(c, players, o.far ?? 45);
    if (near) {
      const p = near.p;
      if (near.d < 4 || M.canSee(c, p, o.sight, o.fov) || M.hear(c, o.hearR)?.owner === p.id) { tgt = p; c.target = p.id; d.lostT = 0; }
    }
    if (tgt) {
      if (M.canSee(c, tgt, o.sight * 1.6, 360)) d.lostT = 0; else d.lostT = (d.lostT || 0) + 0.45;
      if (d.lostT > o.lose || hd(tgt.pos, c.pos) > o.leash * 1.8) { tgt = null; c.target = null; }
    }
  }
  return tgt;
}
const armorFactor = (c, opts) => {
  let f = 1 - (c.affix && AFFIXES[c.affix]?.armor || 0);
  if (c.fgAff?.includes('paywalled') && !opts?.pierce) f *= 1 - EXTRA_ARMOR;   // same numbers as game/creature_tiers.js
  return Math.max(0.05, f);
};

// ------------------------------------------------------------------------------------------------ BONE WALKER
BEHAVIORS.skel_walker = function walkerBehavior(c, dt, M) {
  const d = c.data, g = M.game, now = g.time || 0;
  if (!d.init) { d.init = 1; d.spd = 0.9 + rnd() * 0.25; }
  // lying in a heap: the smash window (a hit within it is turned into a kill by the damage wrapper); afterwards it rebuilds itself, once
  if (c.state === 'collapsed') {
    if (c.t >= TUNING.smashWindow) {
      d.rebuilt = true;
      c.hp = Math.max(c.hp, Math.ceil((c.maxHp || 1) * TUNING.riseHp));
      c.setState('rise');
      g.net.broadcast('fx', { k: 'skrise', id: c.id });
    }
    return;
  }
  if (c.state === 'rise') {
    if (c.t >= TUNING.riseTime) { c.cooldown = 0.6; c.setState('idle'); }
    return;
  }
  const tgt = acquire(c, dt, M, { sight: 15, fov: 130, hearR: 14, leash: 28, lose: 5 });
  if (c.state === 'attack') {
    if (!d.hit && c.t >= 0.42) {
      d.hit = true;
      const p = tgt || g.aiPlayerById(c.target);
      if (p && !p.dead && hd(p.pos, c.pos) < 1.9 && Math.abs(p.pos.y - c.pos.y) < 2.2) M.attack(c, p, c.dmg, 'skel_walker');
    }
    if (c.t > 0.85) c.setState(tgt ? 'run' : 'idle');
    return;
  }
  if (!tgt) { roam(c, dt, M, 12, 2 + rnd() * 3); if (c.state === 'walk') rattle(c, M, now); return; }
  const dist = hd(tgt.pos, c.pos);
  if (dist < 1.45 && c.cooldown <= 0 && Math.abs(tgt.pos.y - c.pos.y) < 2.2) {
    c.yaw = Math.atan2(tgt.pos.x - c.pos.x, tgt.pos.z - c.pos.z);
    c.setState('attack'); d.hit = false; c.cooldown = 1.5;
    return;
  }
  c.setState('run');
  M.moveToward(c, tgt.pos, dt, c.def.run * d.spd);
  rattle(c, M, now);
};

// ------------------------------------------------------------------------------------------------ BONE ARCHER
function archerFire(c, tgt, M) {
  const g = M.game, S = shared(M), d = c.data;
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  _a.set(c.pos.x + fx * 0.35, c.pos.y + 1.4, c.pos.z + fz * 0.35);
  // lead the target by its measured velocity (weak early), aim at the chest
  const now = g.time || 0, tp = d.tp;
  let vx = 0, vz = 0;
  if (tp && now - tp.t > 0.05) { vx = (tgt.pos.x - tp.x) / (now - tp.t); vz = (tgt.pos.z - tp.z) / (now - tp.t); }
  const flight = Math.min(1.2, hd(tgt.pos, c.pos) / TUNING.archerSpeed) * archerLead(sectorOf(M));
  _b.set(tgt.pos.x + vx * flight, tgt.pos.y + (tgt.crouch ? 0.6 : 1.05), tgt.pos.z + vz * flight);
  const v = aimVelocity(_a, _b);
  const pr = { id: ++S.seq, shooter: c.id, x: _a.x, y: _a.y, z: _a.z, vx: v.vx, vy: v.vy, vz: v.vz, t: 0, ty: c.seed % 2, dmg: c.dmg, zone: c.zone };
  S.proj.push(pr);
  g.net.broadcast('fx', { k: 'skshot', id: pr.id, a: [+_a.x.toFixed(2), +_a.y.toFixed(2), +_a.z.toFixed(2)], v: [+v.vx.toFixed(2), +v.vy.toFixed(2), +v.vz.toFixed(2)], ty: pr.ty });
}
BEHAVIORS.skel_archer = function archerBehavior(c, dt, M) {
  const d = c.data, g = M.game, now = g.time || 0;
  if (!d.init) { d.init = 1; d.spd = 0.95 + rnd() * 0.15; c.cooldown = 1 + rnd() * 1.5; }
  if (c.state === 'throw') { if (c.t > 0.4) c.setState('idle'); return; }
  const tgt = acquire(c, dt, M, { sight: 22, fov: 150, hearR: 14, leash: 30, lose: 6 });
  if (c.state === 'draw') {
    if (!tgt || c.age < 1) { c.setState('idle'); return; }
    // the aim tracks the target until 65 % of the wind-up, then it is locked: that is the dodge window
    if (c.t < d.windup * 0.65) { faceTo(c, tgt.pos.x, tgt.pos.z, dt, 3.4); d.tp = { x: tgt.pos.x, z: tgt.pos.z, t: now }; }
    if (c.t >= d.windup) { archerFire(c, tgt, M); c.cooldown = archerCooldown(sectorOf(M), rnd()); c.setState('throw'); }
    return;
  }
  if (!tgt) { roam(c, dt, M, 12, 2 + rnd() * 3); if (c.state === 'walk') rattle(c, M, now); return; }
  const dist = hd(tgt.pos, c.pos);
  d.losT = (d.losT || 0) - dt;
  if (d.losT <= 0) { d.losT = 0.25; d.los = M.canSee(c, tgt, 26, 360); }
  if (dist < TUNING.archerMin) {                                   // too close: back away (melee flail only when cornered)
    if (dist < 1.5 && (d.cornered || 0) > 0.7 && c.cooldown <= 0) {
      c.yaw = Math.atan2(tgt.pos.x - c.pos.x, tgt.pos.z - c.pos.z); c.setState('attack'); c.cooldown = 1.3; M.attack(c, tgt, Math.max(1, Math.round(c.dmg * 0.6)), 'skel_archer'); d.cornered = 0;
      return;
    }
    if (c.state === 'attack') { if (c.t > 0.5) c.setState('flee'); return; }
    const px = c.pos.x, pz = c.pos.z;
    d.awayT = (d.awayT || 0) - dt;
    if (c.state !== 'flee' || d.awayT <= 0 || !c.path) { awayFrom(c, M, tgt.pos.x, tgt.pos.z, 8); d.awayT = 1.2; }
    c.setState('flee');
    const done = M.follow(c, dt, c.def.run * d.spd);
    d.cornered = hd({ x: px, z: pz }, c.pos) < c.def.run * dt * 0.25 ? (d.cornered || 0) + dt : 0;
    if (done) d.awayT = 0;
    rattle(c, M, now);
    return;
  }
  d.cornered = 0;
  if (dist > TUNING.archerMax || !d.los) {                          // out of range / no line of sight: close in
    c.setState('run');
    M.moveToward(c, tgt.pos, dt, c.def.run * d.spd);
    rattle(c, M, now);
    return;
  }
  faceTo(c, tgt.pos.x, tgt.pos.z, dt, 5);
  if (c.cooldown <= 0 && c.age >= 1) {
    d.windup = archerWindup(sectorOf(M), tierIndex(c.tier || 'common'));
    d.tp = { x: tgt.pos.x, z: tgt.pos.z, t: now };
    c.setState('draw');
    return;
  }
  c.setState('idle');
};

/** host: projectile simulation (independent of the shooter: a dead Archer's CD still flies) */
function hostProjectiles(M, dt) {
  const g = M.game, S = shared(M);
  if (!S.proj.length) return;
  for (let i = S.proj.length - 1; i >= 0; i--) {
    const p = S.proj[i];
    let end = null, hitPlayer = null;
    const steps = Math.max(1, Math.ceil(dt / 0.03)), sdt = dt / steps;
    for (let s = 0; s < steps && !end; s++) {
      _a.set(p.x, p.y, p.z);
      stepProjectile(p, sdt);
      _b.set(p.x, p.y, p.z);
      if (!g.physics.lineOfSight(_a, _b)) { end = 'w'; break; }
      for (const pl of g.aiPlayers()) {
        if (pl.dead || pl.inShip || pl.zone !== p.zone) continue;
        const dx = pl.pos.x - p.x, dz = pl.pos.z - p.z;
        if (dx * dx + dz * dz < 0.42 * 0.42 && p.y > pl.pos.y - 0.1 && p.y < pl.pos.y + (pl.crouch ? 1.15 : 1.85)) { hitPlayer = pl; end = 'p'; break; }
      }
    }
    if (!end && p.t > TUNING.archerLife) end = 'x';
    if (!end) continue;
    S.proj.splice(i, 1);
    if (hitPlayer) {
      const shooter = M.host.get(p.shooter);
      if (shooter && !shooter.dead) M.attack(shooter, hitPlayer, p.dmg, 'skel_archer');
      else g.hostHurtPlayer(hitPlayer.id, p.dmg, 'skel_archer', null, _b);
    }
    g.net.broadcast('fx', { k: 'skhit', id: p.id, p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], h: end, ty: p.ty });
  }
}

// ------------------------------------------------------------------------------------------------ BONE KNIGHT
BEHAVIORS.skel_knight = function knightBehavior(c, dt, M) {
  const d = c.data, g = M.game, now = g.time || 0;
  if (!d.init) { d.init = 1; d.spd = 0.92 + rnd() * 0.16; }
  const tgt = acquire(c, dt, M, { sight: 16, fov: 120, hearR: 15, leash: 30, lose: 7 });
  if (c.state === 'attack') {
    if (tgt && c.t < 0.55) faceTo(c, tgt.pos.x, tgt.pos.z, dt, TUNING.knightTurn);
    if (!d.hit && c.t >= 0.55) {
      d.hit = true;
      if (tgt && hd(tgt.pos, c.pos) < 2.1 && Math.abs(tgt.pos.y - c.pos.y) < 2.2 && inShieldArc(c.yaw, c.pos.x, c.pos.z, tgt.pos.x, tgt.pos.z, 55)) M.attack(c, tgt, c.dmg, 'skel_knight');
    }
    if (c.t > 1.0) c.setState(tgt ? 'run' : 'idle');
    return;
  }
  if (!tgt) { roam(c, dt, M, 10, 3 + rnd() * 3); if (c.state === 'walk') rattle(c, M, now); return; }
  const dist = hd(tgt.pos, c.pos);
  if (dist < 1.7 && c.cooldown <= 0 && inShieldArc(c.yaw, c.pos.x, c.pos.z, tgt.pos.x, tgt.pos.z, 45)) { c.setState('attack'); d.hit = false; c.cooldown = 1.7; return; }
  if (dist < 1.7) { c.setState('idle'); faceTo(c, tgt.pos.x, tgt.pos.z, dt, TUNING.knightTurn); return; }   // in reach but not facing: turn (slowly)
  c.setState('run');
  M.moveToward(c, tgt.pos, dt, c.def.run * d.spd, TUNING.knightTurn);
  rattle(c, M, now);
};

// ------------------------------------------------------------------------------------------------ BONE SWARM
BEHAVIORS.skel_swarm = function swarmBehavior(c, dt, M) {
  const d = c.data, g = M.game;
  if (!d.init) {
    d.init = 1; d.spd = 0.85 + rnd() * 0.4; d.ph = rnd() * 6.28;
    if (!d.grouped) {   // a single generic spawn calls its group
      d.grouped = true;
      const n = 2 + ((rnd() * 3) | 0);
      for (let k = 0; k < n; k++) {
        if (!canSpawnMore('skel_swarm', M.host)) break;
        const o = M.hostSpawn('skel_swarm', new THREE.Vector3(c.pos.x + (rnd() - 0.5) * 1.6, c.pos.y, c.pos.z + (rnd() - 0.5) * 1.6), { level: c.level, zone: c.zone, data: { grouped: true } });
        if (o) M.placeAt(o, o.pos.x, o.pos.z);
      }
    }
  }
  const tgt = acquire(c, dt, M, { sight: 13, fov: 200, hearR: 12, leash: 26, lose: 4 });
  if (c.state === 'attack') {
    if (!d.hit && c.t >= 0.22) {
      d.hit = true;
      const p = tgt || g.aiPlayerById(c.target);
      if (p && !p.dead && hd(p.pos, c.pos) < 1.3 && Math.abs(p.pos.y - c.pos.y) < 2) M.attack(c, p, c.dmg, 'skel_swarm');
    }
    if (c.t > 0.6) c.setState(tgt ? 'run' : 'idle');
    return;
  }
  if (!tgt) { roam(c, dt, M, 8, 1.5 + rnd() * 2); return; }
  const dist = hd(tgt.pos, c.pos);
  if (dist < 0.95 && c.cooldown <= 0 && Math.abs(tgt.pos.y - c.pos.y) < 2) {
    c.yaw = Math.atan2(tgt.pos.x - c.pos.x, tgt.pos.z - c.pos.z);
    c.setState('attack'); d.hit = false; c.cooldown = 1.0;
    return;
  }
  c.setState('run');
  // scuttle: weave a little around the straight line so a group spreads out
  const now = g.time || 0, side = Math.sin(now * 6 + d.ph) * (dist > 2.5 ? 0.9 : 0.2);
  const ax = tgt.pos.x - c.pos.x, az = tgt.pos.z - c.pos.z, L = Math.hypot(ax, az) || 1;
  _p.set(tgt.pos.x - (az / L) * side, tgt.pos.y, tgt.pos.z + (ax / L) * side);
  M.moveToward(c, _p, dt, c.def.run * d.spd);
};

// ------------------------------------------------------------------------------------------------ client: name tags ("DELETED USERS")
const TAG_FONT = '24px VT323, monospace';
const tagTexCache = new Map();
function scramble(s, r) { const glyphs = '#@%&$?!*01'; let o = ''; for (let i = 0; i < s.length; i++) o += r() < 0.28 && s[i] !== '_' ? glyphs[(r() * glyphs.length) | 0] : s[i]; return o; }
/** 3 frames per tag: clean, RGB split, sliced + scrambled (cached, shared by every skeleton with the same name) */
function tagTexture(key, l1, l2, frame, color = '#bff6ff') {
  const k = `${key}|${frame}`;
  let tx = tagTexCache.get(k);
  if (tx) return tx;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 48;
  const x = cv.getContext('2d');
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  let seed = 7 + frame * 13 + key.length; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const line = (dx, dy, c1, c2, a = 1) => {
    x.globalAlpha = a;
    x.font = TAG_FONT; x.lineWidth = 4; x.strokeStyle = 'rgba(0,0,0,.85)'; x.strokeText(frame === 2 ? scramble(l1, r) : l1, 128 + dx, 22 + dy);
    x.fillStyle = c1; x.fillText(frame === 2 ? scramble(l1, r) : l1, 128 + dx, 22 + dy);
    x.font = '17px VT323, monospace'; x.lineWidth = 3; x.strokeText(l2, 128 + dx, 41 + dy); x.fillStyle = c2; x.fillText(l2, 128 + dx, 41 + dy);
    x.globalAlpha = 1;
  };
  if (frame === 1) { x.globalCompositeOperation = 'lighter'; line(-2, 0, '#ff2a5a', '#ff2a5a', 0.9); line(2, 0, '#20ffe0', '#20ffe0', 0.9); x.globalCompositeOperation = 'source-over'; }
  else line(0, 0, color, '#ff6a7a');
  if (frame === 2) for (let i = 0; i < 4; i++) { const y = (r() * 40) | 0, h = 3 + ((r() * 6) | 0); x.drawImage(cv, 0, y, 256, h, (r() - 0.5) * 30, y, 256, h); }
  tx = new THREE.CanvasTexture(cv);
  tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.colorSpace = THREE.SRGBColorSpace; tx.generateMipmaps = false;
  tagTexCache.set(k, tx);
  return tx;
}

// ------------------------------------------------------------------------------------------------ install
export function installSkeletons(game) {
  registerSkeletonContent();
  registerSkeletonModels();
  const offs = [], restores = [];
  const mods = game.mods;
  const on = (ev, fn) => { if (mods?.on) offs.push(mods.on(ev, fn)); };
  const M = game.creatures;
  const S = { disposed: false, shots: new Map(), tags: new Map(), nightT: 30 + rnd() * 30, stats: { collapses: 0, smashes: 0, rises: 0, blocks: 0, staggers: 0, shots: 0, night: 0 } };
  const isHost = () => !!game.isHost;
  const sector = () => game.run?.quotaIndex || 0;
  const balanceSpawnMul = () => { try { return clamp(Number(game.balance?.scale?.('creature')?.spawn ?? 1) || 1, 0.25, 3); } catch { return 1; } };
  const livePlayers = (zone) => game.aiPlayers().filter((p) => !p.dead && !p.inShip && (!zone || p.zone === zone));

  if (IDENT_MOD?.IDENT) for (const [id, row] of Object.entries(IDENT_ROWS)) if (!IDENT_MOD.IDENT[id]) IDENT_MOD.IDENT[id] = row;

  // ---- host: skeleton rules between a hit and the HP change (instance wrapper, restored in dispose)
  function wrapMethod(obj, name, make) {
    const orig = obj[name], hadOwn = Object.prototype.hasOwnProperty.call(obj, name);
    const w = make(orig);
    obj[name] = w;
    restores.push(() => { if (obj[name] === w) { if (hadOwn) obj[name] = orig; else delete obj[name]; } });
  }
  wrapMethod(M, 'damage', (orig) => function (id, amount, by, opts = {}) {
    const c = this.host.get(id);
    if (c && !c.dead && amount > 0 && !S.disposed) {
      if (c.type === 'skel_walker') {
        const f = armorFactor(c, opts);
        const r = walkerHit({ hp: c.hp, eff: amount * f, rebuilt: !!c.data.rebuilt, collapsed: c.state === 'collapsed' });
        if (r.act === 'smash') {                                   // second hit within the window: the skull goes for good
          S.stats.smashes++;
          game.net.broadcast('fx', { k: 'sksmash', id });
          return orig.call(this, id, (c.hp + 5) / f, by, { ...opts, stun: 0 });
        }
        if (r.act === 'collapse') {                                // lethal blow #1: it falls apart instead of dying
          S.stats.collapses++;
          const res = orig.call(this, id, r.cap / f, by, { ...opts, stun: 0 });
          if (!c.dead) {
            c.stunT = 0; c.path = null; c.dest = null; c.target = null; c.setState('collapsed');
            game.net.broadcast('fx', { k: 'skcollapse', id });
          }
          return res;
        }
        if (c.state === 'collapsed' && opts.stun) opts = { ...opts, stun: 0 };
      } else if (c.type === 'skel_knight') {
        const ap = typeof by === 'string' ? game.aiPlayerById?.(by)?.pos : null;
        const front = !!ap && inShieldArc(c.yaw, c.pos.x, c.pos.z, ap.x, ap.z);
        const guardDown = c.state === 'stunned' || c.stunT > 0;
        const r = knightHit(amount, { front, guardDown, heavy: isHeavy(amount, opts), pierce: !!opts.pierce });
        if (r.blocked) {
          amount = r.amount;
          opts = { ...opts, stun: r.stagger ? Math.max(opts.stun || 0, TUNING.staggerT) : 0 };
          if (r.stagger) S.stats.staggers++; else S.stats.blocks++;
          game.net.broadcast('fx', { k: 'skblock', id, h: r.stagger ? 1 : 0 });
        }
      }
    }
    return orig.call(this, id, amount, by, opts);
  });

  // ---- host: night skeletons outdoors (18:30 - 23:30, only while someone is outside)
  function hostNight(dt) {
    const run = game.run;
    if (run?.phase !== 'moon' || !game.world?.terrain) return;
    const tm = run.time ?? 480;
    if (!(tm >= NIGHT.from && tm < NIGHT.to)) return;
    S.nightT -= dt;
    if (S.nightT > 0) return;
    const mul = balanceSpawnMul();
    S.nightT = (NIGHT.gapMin + rnd() * (NIGHT.gapMax - NIGHT.gapMin)) / mul;
    const outside = livePlayers('out');
    if (!outside.length) return;
    let alive = 0;
    for (const c of M.host.values()) if (!c.dead && c.zone === 'out' && isSkel(c.type)) alive++;
    if (alive >= Math.round((NIGHT.capBase + sector()) * mul)) return;
    const anchor = outside[(rnd() * outside.length) | 0];
    const lim = (game.world.terrain.playHalf ?? 130) - 6;
    let x = 0, z = 0, ok = false;
    for (let i = 0; i < 6 && !ok; i++) {
      const a = rnd() * Math.PI * 2, r = NIGHT.farMin + rnd() * (NIGHT.farMax - NIGHT.farMin);
      x = clamp(anchor.pos.x + Math.cos(a) * r, -lim, lim); z = clamp(anchor.pos.z + Math.sin(a) * r, -lim, lim);
      ok = Math.hypot(x, z) > 20;
    }
    if (!ok) return;
    const level = 1 + Math.floor(sector() / 2), roll = rnd();
    const at = (dx, dz) => new THREE.Vector3(x + dx, game.world.terrain.heightAt(x + dx, z + dz), z + dz);
    const make = (type, dx, dz) => { const c = M.hostSpawn(type, at(dx, dz), { level, zone: 'out', yaw: rnd() * 6.28 }); if (c) { M.placeAt(c, c.pos.x, c.pos.z); S.stats.night++; } return c; };
    if (roll < 0.55) { const n = 2 + ((rnd() * 2) | 0); for (let i = 0; i < n; i++) make('skel_walker', (rnd() - 0.5) * 5, (rnd() - 0.5) * 5); }
    else if (roll < 0.8) make('skel_swarm', 0, 0);
    else { make('skel_archer', 0, 0); make('skel_walker', 2, 1); if (sector() >= 2) make('skel_knight', -2, 2); }
  }

  // ---- client: fx (projectiles, block sparks, collapse / rise / smash)
  function snd(names, pos, vol = 0.8, pitch = 1) {
    const a = game.audio;
    if (!a?.at) return;
    const n = (Array.isArray(names) ? names : [names]).find((q) => a.has?.(q));
    if (n) a.at(n, pos ? pos.clone() : null, vol, { pitch, occlude: !!pos, refDistance: 3, maxDistance: 45 });
  }
  const viewPos = (v, dy) => _p.set(v.pos.x, v.pos.y + dy, v.pos.z);
  function onFx(d) {
    if (S.disposed || !d || typeof d !== 'object' || typeof d.k !== 'string' || !d.k.startsWith('sk')) return;
    switch (d.k) {
      case 'skshot': {
        if (!Array.isArray(d.a) || !Array.isArray(d.v) || S.shots.has(d.id)) break;
        const mesh = createProjectileMesh(d.ty);
        mesh.position.fromArray(d.a);
        game.scene.add(mesh);
        S.shots.set(d.id, { mesh, p: { x: d.a[0], y: d.a[1], z: d.a[2], vx: d.v[0], vy: d.v[1], vz: d.v[2], t: 0 }, ty: d.ty ? 1 : 0 });
        S.stats.shots++;
        _a.fromArray(d.a); snd(['swoosh_2', 'swing_whoosh'], _a, 0.7, 1.3);
        break;
      }
      case 'skhit': {
        const sh = S.shots.get(d.id);
        if (sh) { sh.mesh.removeFromParent(); S.shots.delete(d.id); }
        if (Array.isArray(d.p)) {
          _a.fromArray(d.p);
          if (d.h === 'p' || d.h === 'w') { game.particles?.burst(_a, d.ty ? 'glitch' : 'dust', null, d.ty ? 0.35 : 0.6); snd(d.ty ? ['glass_break', 'hit_metal'] : ['hit_wall', 'impact_punch'], _a, 0.7, d.ty ? 1.4 : 1.6); }
        }
        break;
      }
      case 'skblock': {
        const v = M.views.get(d.id);
        if (!v) break;
        v.model?.onBlock?.();
        viewPos(v, 1.1);
        game.particles?.burst(_p, 'sparks', null, d.h ? 1.6 : 0.8);
        snd(['impact_metal_1', 'hit_metal'], _p, d.h ? 1 : 0.7, d.h ? 0.7 : 1.2);
        break;
      }
      case 'skcollapse': { const v = M.views.get(d.id); if (v) { viewPos(v, 0.5); game.particles?.burst(_p, 'dust', null, 1.4); } break; }
      case 'skrise': { const v = M.views.get(d.id); if (v) { viewPos(v, 0.4); game.particles?.burst(_p, 'dust', null, 0.8); } break; }
      case 'sksmash': { const v = M.views.get(d.id); if (v) { viewPos(v, 0.4); game.particles?.burst(_p, 'death', null, 0.7); snd(['glass_break', 'hit_wall'], _p, 0.9, 1.2); } break; }
      default: break;
    }
  }
  function shotsTick(dt) {
    for (const [id, sh] of S.shots) {
      stepProjectile(sh.p, dt);
      const p = sh.p;
      sh.mesh.position.set(p.x, p.y, p.z);
      if (sh.ty) sh.mesh.rotation.z += dt * 22; else { sh.mesh.rotation.y = Math.atan2(p.vx, p.vz); sh.mesh.rotation.x = -Math.atan2(p.vy, Math.hypot(p.vx, p.vz)); }
      if (p.t > TUNING.archerLife + 0.5) { sh.mesh.removeFromParent(); S.shots.delete(id); }
    }
  }

  // ---- client: username tags over the skulls (glitch every so often; a collapsed Walker says SMASH THE SKULL)
  function tagsTick(dt) {
    if (typeof document === 'undefined') return;
    const cam = game.camera?.position;
    for (const v of M.views.values()) {
      if (v.type === 'skel_swarm' || !isSkel(v.type) || S.tags.has(v.id) || v.state === 'dead') continue;
      const tg = tagFor(v.tagSeed ?? (v.tagSeed = hashId(v.id)));
      const key = `${tg.name}|${tg.suffix}`;
      const l1 = tg.name, l2 = t(tg.suffix);
      const mat = new THREE.SpriteMaterial({ map: tagTexture(key, l1, l2, 0), transparent: true, depthWrite: false, fog: false });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(1.7, 0.32, 1); sp.center.set(0.5, 0); sp.renderOrder = 4;
      game.scene.add(sp);
      S.tags.set(v.id, { v, sp, key, l1, l2, frame: 0, next: rnd() * 2, smash: false });
    }
    for (const [id, tg] of S.tags) {
      const v = tg.v;
      if (M.views.get(id) !== v || v.state === 'dead') { tg.sp.removeFromParent(); tg.sp.material.dispose(); S.tags.delete(id); continue; }
      const d = cam ? v.pos.distanceTo(cam) : 0;
      const a = v.hidden || !v.root.visible ? 0 : clamp((26 - d) / 8, 0, 1);
      tg.sp.visible = a > 0.02; tg.sp.material.opacity = a;
      if (!tg.sp.visible) continue;
      tg.sp.position.set(v.pos.x, v.pos.y + (v.state === 'collapsed' ? 0.9 : (v.height || 1.75) + 0.25 + (v.tier && v.tier !== 'common' ? 0.55 : 0)), v.pos.z);
      const smash = v.state === 'collapsed';
      tg.next -= dt;
      if (smash !== tg.smash) { tg.smash = smash; tg.frame = 0; tg.next = 0; }
      if (tg.next <= 0) {
        if (smash) { tg.frame = (tg.frame + 1) % 2; tg.next = 0.14; tg.sp.material.map = tagTexture('smash', t('Smash the skull!'), '', tg.frame === 0 ? 0 : 1, '#ffd0a0'); }
        else if (tg.frame !== 0) { tg.frame = 0; tg.next = 0.4 + rnd() * 2.2; tg.sp.material.map = tagTexture(tg.key, tg.l1, tg.l2, 0); }
        else { tg.frame = 1 + ((rnd() * 2) | 0); tg.next = 0.06 + rnd() * 0.1; tg.sp.material.map = tagTexture(tg.key, tg.l1, tg.l2, tg.frame); }
        tg.sp.material.needsUpdate = false;
      }
    }
  }
  function hashId(id) { let h = 2166136261; for (let i = 0; i < String(id).length; i++) h = Math.imul(h ^ String(id).charCodeAt(i), 16777619); return h >>> 0; }

  // ---- wiring
  function update(dt) {
    if (S.disposed) return;
    if (isHost()) { try { hostProjectiles(M, dt); hostNight(dt); } catch (e) { console.warn('[skeletons] host', e); } }
    shotsTick(dt);
    try { tagsTick(dt); } catch (e) { console.warn('[skeletons] tags', e); }
  }
  on('update', (dt, g) => { if (g === game) update(dt); });
  on('fx', (d) => onFx(d));
  on('phase', (ph, g) => { if (g === game) { S.nightT = 25 + rnd() * 30; shared(M).proj.length = 0; } });
  on('sessionEnd', (g) => { if (g === game) dispose(); });

  function dispose() {
    if (S.disposed) return;
    S.disposed = true;
    for (const off of offs) { try { off(); } catch { /* ignore */ } }
    offs.length = 0;
    for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
    restores.length = 0;
    for (const sh of S.shots.values()) sh.mesh.removeFromParent();
    S.shots.clear();
    for (const tg of S.tags.values()) { tg.sp.removeFromParent(); tg.sp.material.dispose(); }
    S.tags.clear();
    shared(M).proj.length = 0;
  }

  return {
    types: SKEL_TYPES,
    /** host: spawn a skeleton (harness / debug). opts: { tier, zone, level, ... } */
    spawn(type, pos, opts = {}) {
      if (!isHost() || !CREATURES[type]) return null;
      const c = M.hostSpawn(type, pos, { level: 1, zone: 'in', ...opts });
      if (c) M.placeAt(c, c.pos.x, c.pos.z);
      return c;
    },
    stats: () => ({ ...S.stats, shots: S.shots.size, tags: S.tags.size, proj: shared(M).proj.length }),
    update,
    dispose,
  };
}
