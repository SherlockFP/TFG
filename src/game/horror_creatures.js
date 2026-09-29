// HORROR module - creature definitions + host AI (registered through registerCreature, so stun / snapshots / XP / balance scaling apply).
//   hr_zombie    Shambler   weak, slow, fragile, comes in groups; grabs (holds the victim, gnaws) until hit hard enough; headshots x2.2 (see horror.js)
//   hr_forger    The Forger walks to chalk arrows, scratches (audible, telegraphed) and erases / redraws them wrong; runs from light, never hunts
//   hr_ambusher  Closet Thing lives in the fake closet: lurk -> (knock: stir) -> burst -> hunt
//   hr_warden    Manor Warden axe servant of the dark oak mansion (chaser)
// Host-authoritative; Math.random is fine here (creatures are not world generation).
import * as THREE from 'three';
import { registerCreature, CREATURES } from './creatures.js';
import { chaser, STATE_SOUNDS } from '../entities/creatures.js';
import { IDENT } from './identify.js';
import { CREATURE_FLAVOUR } from './components.js';
import { NO_LOOK } from '../render/tierlooks.js';
import { angleDiff, clamp } from '../core/util.js';
import { HR_DEFS, ZOMBIE, FAKE } from './horror_core.js';

const rnd = Math.random;
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const face = (c, x, z, dt, rate = 9) => { const want = Math.atan2(x - c.pos.x, z - c.pos.z); c.yaw += clamp(angleDiff(c.yaw, want), -rate * dt, rate * dt); };
export const HR_TYPES = new Set(Object.keys(HR_DEFS));
/** runtime hooks the behaviours call into (set by horror.js): { chalk(): ChalkStore, forge(c, move), fakeDoor(idx): {x,z,fx,fz}, fakeOpened(idx, c) } */
export const HOOKS = {};

// ------------------------------------------------------------------------------------------------ Shambler
function zombieBehavior(c, dt, M) {
  const d = c.data, g = M.game, now = g.time || 0;
  if (!d.init) { d.init = true; d.home = c.pos.clone(); d.lost = 0; d.next = 2 + rnd() * 5; d.moan = 3 + rnd() * 8; c.setState('idle'); }
  const players = M.playersFor(c).filter((p) => !p.inShip);
  d.moan -= dt;
  const st = c.state;
  const target = () => players.find((q) => q.id === c.target);
  // ---- gnawing: holds the victim in place until it is hurt hard enough, or lets go after a while
  if (st === 'grab') {
    const p = target(), G = d.grab;
    if (!p || !G || p.dead) { d.grab = null; c.setState('idle'); return; }
    G.t += dt; G.tick -= dt;
    face(c, p.pos.x, p.pos.z, dt, 12);
    const front = new THREE.Vector3(c.pos.x + Math.sin(c.yaw) * 0.85, p.pos.y, c.pos.z + Math.cos(c.yaw) * 0.85);
    G.hold -= dt;
    if (G.hold <= 0) { G.hold = 0.22; g.hostHoldPlayer(p.id, front); g.hostSlowPlayer(p.id, 0.5); }
    if (G.tick <= 0) { G.tick = ZOMBIE.grabTick; M.attack(c, p, ZOMBIE_TICK(c), 'hr_zombie'); }
    const shoved = (G.hp0 - c.hp) >= c.maxHp * ZOMBIE.breakHit;
    if (shoved || G.t >= ZOMBIE.grabSec) {
      d.grab = null; c.cooldown = shoved ? 2.4 : 1.4; c.setState(shoved ? 'stunned' : 'idle');
      if (shoved) c.stunT = Math.max(c.stunT, 0.7);
      g.hostSlowPlayer(p.id, 0.3);
    }
    return;
  }
  if (d.hitAt && d.hitAt > (d.seenHit || 0)) { d.seenHit = d.hitAt; if (d.hitBy && players.find((q) => q.id === d.hitBy)) { c.target = d.hitBy; c.setState('run'); alertPack(c, M, d.hitBy); } }
  // ---- acquire
  if (st === 'idle' || st === 'walk') {
    for (const p of players) {
      if (M.canSee(c, p, 11, 150)) { c.target = p.id; c.setState('run'); d.lost = 0; alertPack(c, M, p.id); return; }
    }
    const n = M.hear(c, 12);
    if (n && st !== 'run') { M.goToLazy(c, n.pos.x, n.pos.z, 3); c.setState('walk'); }
    if (c.state === 'walk' && M.follow(c, dt, c.def.walk)) c.setState('idle');
    if (c.state === 'idle' && c.t > d.next) { d.next = 3 + rnd() * 7; if (rnd() < 0.5) { const a = rnd() * 6.28, r = 1 + rnd() * 4; M.goTo(c, d.home.x + Math.cos(a) * r, d.home.z + Math.sin(a) * r); c.setState('walk'); } }
    if (d.moan <= 0 && players.length && M.canSee(c, players[0], 30, 360)) { d.moan = 6 + rnd() * 10; M.sound(c, ['creature_hurt', 'lurker_growl'], 0.25, 3, 0.55, 30); }
    return;
  }
  if (st === 'run' || st === 'attack') {
    const p = target();
    if (!p) { c.target = null; c.setState('idle'); return; }
    const dist = flat(p.pos, c.pos);
    if (M.canSee(c, p, 16, 360)) d.lost = 0; else d.lost += dt;
    if (d.lost > 7 || dist > 40) { c.target = null; c.setState('idle'); return; }
    if (dist < ZOMBIE.grabRange && Math.abs(p.pos.y - c.pos.y) < 1.8 && c.cooldown <= 0 && !p.latched) {
      c.setState('attack'); c.yaw = Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
      if (c.t >= 0) { d.grab = { t: 0, tick: 0, hold: 0, hp0: c.hp }; c.setState('grab'); M.attack(c, p, c.dmg, 'hr_zombie'); M.sound(c, ['creature_hurt', 'hit_flesh'], 0.6, 3, 0.6, 30); }
      return;
    }
    if (st === 'attack' && c.t < 0.35) return;
    c.setState('run');
    M.moveToward(c, p.pos, dt, c.def.run, 5);
  }
}
const ZOMBIE_TICK = (c) => Math.max(2, Math.round(ZOMBIE.grabDmg * (c.dmg / HR_DEFS.hr_zombie.dmg)));
function alertPack(c, M, pid) {
  for (const o of M.host.values()) if (o !== c && o.type === 'hr_zombie' && !o.dead && (o.state === 'idle' || o.state === 'walk') && flat(o.pos, c.pos) < 12) { o.target = pid; o.setState('run'); o.data.lost = 0; }
}

// ------------------------------------------------------------------------------------------------ The Forger
function forgerBehavior(c, dt, M) {
  const d = c.data, g = M.game, now = g.time || 0;
  if (!d.init) { d.init = true; d.home = c.pos.clone(); d.next = 8 + rnd() * 10; d.job = null; d.flee = 0; d.scr = 0; c.setState('idle'); }
  const players = M.playersFor(c).filter((p) => !p.inShip);
  const st = c.state;
  // light and eyes scare it: a player who looks at it from close range makes it bolt for a few seconds
  let seen = null;
  for (const p of players) if (flat(p.pos, c.pos) < 9 && M.isLookedAt(c, p, 9, 0.8)) { seen = p; break; }
  if (seen && st !== 'flee') { d.flee = 5 + rnd() * 3; d.job = null; c.setState('flee'); const ax = c.pos.x + (c.pos.x - seen.pos.x) * 3, az = c.pos.z + (c.pos.z - seen.pos.z) * 3; M.goTo(c, ax, az); }
  if (st === 'flee') {
    d.flee -= dt;
    if (M.follow(c, dt, c.def.run) || d.flee <= 0) { c.setState('idle'); d.next = 10 + rnd() * 12; }
    return;
  }
  // cornered: a weak scratch
  for (const p of players) if (flat(p.pos, c.pos) < 1.3 && c.cooldown <= 0 && c.hp < c.maxHp) { c.cooldown = 1.5; c.setState('attack'); M.attack(c, p, c.dmg, 'hr_forger'); return; }
  if (st === 'attack') { if (c.t > 0.5) c.setState('idle'); return; }
  const store = HOOKS.chalk?.();
  if (st === 'scratch') {
    d.scr -= dt;
    face(c, d.job.x, d.job.z, dt, 4);
    if ((d.scrSnd = (d.scrSnd || 0) - dt) <= 0) { d.scrSnd = 0.55; M.sound(c, ['spider_skitter', 'cloth_rustle'], 0.22, 2.5, 1.7 + rnd() * 0.3, 18); }
    if (d.scr <= 0) {
      const mv = HOOKS.forge?.(c, d.job);
      void mv;
      d.job = null; c.setState('walk'); const a = rnd() * 6.28; M.goTo(c, c.pos.x + Math.cos(a) * 9, c.pos.z + Math.sin(a) * 9);
      d.next = 22 + rnd() * 25;
    }
    return;
  }
  if (st === 'walk' && d.job) {
    if (M.follow(c, dt, c.def.walk) || flat(c.pos, d.job) < 1.6) { c.setState('scratch'); d.scr = 2.6 + rnd() * 1.2; d.scrSnd = 0; }
    return;
  }
  if (st === 'walk') { if (M.follow(c, dt, c.def.walk * 0.8)) c.setState('idle'); return; }
  d.next -= dt;
  if (d.next <= 0 && store) {
    const real = store.all().filter((m) => !m.f && m.k === 0);
    if (real.length) {
      // prefer the marks the crew laid most recently and nearest to a player
      const near = players.length ? players[Math.floor(rnd() * players.length)].pos : c.pos;
      real.sort((a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z));
      const m = real[Math.floor(rnd() * Math.min(3, real.length))];
      d.job = { id: m.id, x: m.x, z: m.z };
      M.goTo(c, m.x, m.z); c.setState('walk');
    } else d.next = 12;
  } else if (d.next <= 0) d.next = 12;
  void now;
}

// ------------------------------------------------------------------------------------------------ Closet Thing (fake closet ambusher)
const ambushChase = chaser({ sight: 20, fov: 200, hearR: 20, reach: 1.6, cd: 1.1, leash: 34 });
function ambusherBehavior(c, dt, M) {
  const d = c.data, g = M.game;
  if (!d.init) { d.init = true; c.setState(c.state === 'idle' ? 'lurk' : c.state); d.dir = null; }
  const door = HOOKS.fakeDoor?.(d.closet);
  const players = M.playersFor(c).filter((p) => !p.inShip);
  if (c.state === 'lurk') {
    c.cooldown = Math.max(c.cooldown, 0.5);
    // a fake closet is patient: it stays put until the door is opened, knocked on, or hooked
    if (d.op) {
      const oc = d.op; d.op = null;
      d.lunge = oc.lunge; d.lethal = oc.lethal; d.opener = oc.by; d.mode = oc.mode;
      c.setState(oc.mode === 'open' ? 'burst' : 'stir');
      if (door && oc.mode === 'open') HOOKS.fakeOpened?.(d.closet, c, oc.mode);   // knock / hook: the door stays shut until it bursts
    }
    return;
  }
  if (c.state === 'stir') {
    if (door) face(c, c.pos.x + door.fx, c.pos.z + door.fz, dt, 4);
    if ((d.stirSnd = (d.stirSnd || 0) - dt) <= 0) { d.stirSnd = 0.4; M.sound(c, ['spider_skitter', 'door_creak'], 0.5, 3, 0.7, 24); }
    if (c.t >= (d.lunge || FAKE.hookLunge)) { c.setState('burst'); if (door) HOOKS.fakeOpened?.(d.closet, c, d.mode || 'hook', true); }
    return;
  }
  if (c.state === 'burst') {
    if (door) { c.yaw = Math.atan2(door.fx, door.fz); }
    if (!d.hit && c.t >= 0.12) {
      d.hit = true;
      for (const p of players) {
        const dx = p.pos.x - c.pos.x, dz = p.pos.z - c.pos.z, dist = Math.hypot(dx, dz);
        const fwd = door ? (dx * door.fx + dz * door.fz) / (dist || 1) : 1;
        if (dist > FAKE.lungeReach + 0.6 || fwd < 0.35 || Math.abs(p.pos.y - c.pos.y) > 2.2) continue;
        if (d.lethal !== false && d.mode !== 'knock') M.attack(c, p, 999, 'hr_ambusher');
        else { M.attack(c, p, 25, 'hr_ambusher'); g.hostStunPlayer(p.id, 0.6); }
      }
      M.noise(c.pos, 3);
    }
    // the lunge carries it out of the closet
    if (door && c.t < 0.5) M.placeAt(c, c.pos.x + door.fx * 3.6 * dt, c.pos.z + door.fz * 3.6 * dt);
    if (c.t > 0.7) { c.setState('run'); c.target = (players.find((p) => p.id === d.opener) || M.nearest(c, players, 30)?.p)?.id || null; }
    return;
  }
  ambushChase(c, dt, M);
}

// ------------------------------------------------------------------------------------------------ Manor Warden
const wardenChase = chaser({ sight: 15, fov: 130, hearR: 17, reach: 1.9, cd: 1.5, leash: 26 });
function wardenBehavior(c, dt, M) { wardenChase(c, dt, M); }

// ------------------------------------------------------------------------------------------------ registration
let registered = false;
export function registerHorrorCreatures() {
  if (registered) return;
  registered = true;
  const BEH = { hr_zombie: zombieBehavior, hr_forger: forgerBehavior, hr_ambusher: ambusherBehavior, hr_warden: wardenBehavior };
  for (const [id, def] of Object.entries(HR_DEFS)) {
    if (CREATURES[id]) continue;
    const d = { ...def };
    if (id === 'hr_zombie') d.drop = ['fd_herb', 0.1];
    if (id === 'hr_warden') d.drop = ['rounds', 0.06];
    registerCreature(id, d, BEH[id]);
  }
  Object.assign(STATE_SOUNDS, {
    hr_zombie: { run: [['creature_hurt', 'lurker_growl'], 0.4, 0.55], grab: [['creature_hurt', 'hit_flesh'], 0.5, 0.6], dead: [['creature_death'], 0.7, 0.75], stunned: [['hit_flesh'], 0.6, 0.7] },
    hr_forger: { flee: [['screamer_scream', 'creature_hurt'], 0.35, 1.9], dead: [['creature_death'], 0.7, 1.4] },
    hr_ambusher: { stir: [['door_creak', 'spider_skitter'], 0.6, 0.6], burst: [['giant_growl', 'lurker_snap', 'crawler_roar'], 1.0, 0.85], run: [['hound_growl', 'lurker_growl'], 0.8, 0.75], dead: [['creature_death'], 0.9, 0.6] },
    hr_warden: { run: [['hound_growl', 'lurker_growl'], 0.5, 0.9], attack: [['swing_whoosh'], 0.9, 0.8], dead: [['creature_death'], 0.8, 0.9] },
  });
  Object.assign(IDENT, {
    hr_zombie: ['Undead', 1, 'Slow and brittle, always in a pack. A hit shoves it off when it grabs. Aim high: headshots do more than double.'],
    hr_forger: ['Prankster', 2, 'Scratches out and redraws chalk arrows. Its arrows have a third tick on the head. Bright light makes it run.'],
    hr_ambusher: ['Ambusher', 4, 'Not a cabinet. Knock first (crouch + E) or hook the door open from a distance. Never open it from right in front.'],
    hr_warden: ['Guard', 2, 'Axe servant of the dark oak house. Patient. Outrun it or trade shots from behind cover.'],
  });
  NO_LOOK.add('hr_zombie'); NO_LOOK.add('hr_forger'); NO_LOOK.add('hr_ambusher'); NO_LOOK.add('hr_warden');
  Object.assign(CREATURE_FLAVOUR, { hr_zombie: 'organic', hr_forger: 'organic', hr_ambusher: 'organic', hr_warden: 'organic' });
}
