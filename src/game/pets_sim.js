// PET SIM (module `pets`, [finish] wave 3): the pure HOST-SIDE brain of a pet. No three.js, no DOM, no game object: everything it needs
// comes through an `env` adapter (built by pets.js for the real game, by tools/harness/pets_sim.test.mjs for the tests).
// One record per owner:  rec = makeRec(ownerId, netPet, pos)  ->  stepPet(rec, env, dt) every host frame.
//
// Modes (owner commands): follow | stay | fetch | guard.   Aim command (attack key): attack a creature / parrot decoy.
// Role abilities that live here: fetch (small scrap -> owner or ship, carry 1-2, daily cap), attack (+bee DoT, owl first strike, bear stun),
// guard (holds the ship door), cat / dog / owl / fox marks, bee pollen, bot recharge + shield, bear tank share, parrot decoy, crow dig,
// cat revive, KO. Crew-wide passives (crow luck) are read from petStats by the glue.
import { petStats, MODES, obeys } from './pets_core.js';

export const SIM = {
  followDist: 2.6, followBack: 1.7, teleportDist: 30, assistR: 8, guardR: 12, reach: 1.5, reachAir: 1.9, leash: 22,
  hurtCd: 1.2, hurtFrac: 0.3, regen: 0.012, tripMax: 28, bigSlow: 0.55, bigWeight: 22, smallWeight: 4, tankRange: 6,
  senseEvery: 0.7, pollenEvery: 3, rechargeEvery: 15, shareRange: 8, decoyRange: 30, dropAt: 1.6, koCarryDrop: true,
};

const hyp = Math.hypot;
const d2 = (a, b) => hyp(a.x - b.x, a.z - b.z);

export function makeRec(owner, pet, pos = { x: 0, y: 0, z: 0 }) {
  const rec = {
    owner, pet: null, stats: null, mode: 'follow', dest: 'me', x: pos.x, y: pos.y, z: pos.z, yaw: 0, hp: 1, maxHp: 1, st: 'idle', anim: 'idle', speed: 0,
    carry: [], tgt: null, cmd: null, zone: 'out', inShip: false, ko: false, blocked: false, shield: 0, sitT: 0, atkT: 0, hurtT: 0, combatT: 99, tripT: 0,
    fetchedToday: 0, day: -1, revived: false, kills: 0, first: new Set(), decoy: null, path: null, pathIdx: 0, pdest: null, repath: 0, seen: new Set(),
    cd: { atk: 0, fetch: 0, decoy: 0, shield: 0, sense: 0, pollen: 0, dig: 0, recharge: 0, hurt: 0 },
  };
  applyPet(rec, pet, true);
  return rec;
}

/** (re)apply the owner's pet record: keeps position / carry / hp fraction across level-ups and skin changes */
export function applyPet(rec, pet, fresh = false) {
  const keepFrac = fresh ? 1 : rec.hp / Math.max(1, rec.maxHp);
  const same = rec.pet && pet && rec.pet.id === pet.id;
  rec.pet = pet;
  rec.stats = petStats(pet);
  rec.maxHp = rec.stats?.maxHp || 1;
  rec.hp = same || fresh ? Math.max(1, keepFrac * rec.maxHp) : rec.maxHp;
  if (!same && !fresh) { rec.carry.length = 0; rec.tgt = null; rec.cmd = null; rec.ko = false; rec.first.clear(); }
  if (pet?.ko) rec.ko = true;
  return rec;
}

export function setMode(rec, mode) {
  if (!MODES.includes(mode)) return false;
  rec.mode = mode;
  if (mode !== 'fetch') rec.tgt = null;
  return true;
}

/** owner command: { op:'atk', id?, p? }.  Returns a short result string for the UI / tests. */
export function command(rec, c, env) {
  if (!rec || rec.ko || !c) return 'none';
  const st = rec.stats;
  if (c.op === 'atk') {
    if (!obeys(rec.pet, env.rand || Math.random)) { env.emit?.('say', { k: 'ignore' }); return 'ignored'; }
    if (st.decoy && c.p && rec.cd.decoy <= 0) {
      rec.decoy = { x: c.p[0], y: c.p[1], z: c.p[2], t: 0, phase: 'go' };
      rec.cd.decoy = st.decoy;
      rec.tgt = null;
      return 'decoy';
    }
    if (st.decoy && rec.cd.decoy > 0) return 'cooldown';
    if (c.id) { rec.cmd = { k: 'atk', id: String(c.id), t: 12 }; return 'attack'; }
  }
  return 'none';
}

// ---------------------------------------------------------------------------------------------------------------- damage in / out
/** Bear tank: share of a hit on the owner taken by the pet. Returns { toPlayer, toPet }. */
export function tankShare(rec, dmg, ownerPos) {
  if (!rec || rec.ko || !rec.stats?.tank || dmg >= 999 || !(dmg > 0)) return { toPlayer: dmg, toPet: 0 };
  if (d2(rec, ownerPos) > SIM.tankRange || Math.abs(rec.y - ownerPos.y) > 4) return { toPlayer: dmg, toPet: 0 };
  const toPet = dmg * rec.stats.tank;
  return { toPlayer: dmg - toPet, toPet };
}
/** Bot firewall: absorbs up to `shield` damage of one hit, then recharges. Returns the remaining damage. */
export function absorbShield(rec, dmg) {
  if (!rec || rec.ko || !rec.stats?.shield || dmg >= 999 || !(dmg > 0) || rec.cd.shield > 0) return dmg;
  const cap = rec.stats.shield;
  const soak = Math.min(cap, dmg);
  rec.cd.shield = rec.stats.shieldCd;
  return dmg - soak;
}
/** Damage the pet itself (from tank share or a creature). Returns 'ko' | 'revive' | 'hurt' | 'dodge'. */
export function hurtPet(rec, dmg, env) {
  if (rec.ko || !(dmg > 0)) return 'none';
  if (rec.stats.dodge && (env.rand || Math.random)() < rec.stats.dodge) return 'dodge';
  rec.hp -= dmg; rec.combatT = 0; rec.hurtT = 0.4;
  if (rec.hp > 0) return 'hurt';
  if (rec.stats.revive && !rec.revived) { rec.revived = true; rec.hp = rec.maxHp * 0.4; env.emit?.('revive', {}); return 'revive'; }
  rec.hp = 0; rec.ko = true; rec.st = 'ko'; rec.anim = 'ko'; rec.cmd = null; rec.tgt = null; rec.decoy = null;
  dropCarry(rec, env, 'here');
  env.emit?.('ko', {});
  return 'ko';
}

function dropCarry(rec, env, where) {
  if (!rec.carry.length) return 0;
  const n = rec.carry.length, ids = rec.carry.slice();
  rec.carry.length = 0;
  env.dropCarry?.(rec, ids, where);
  return n;
}
export const flush = (rec, env) => dropCarry(rec, env, 'here');

// ---------------------------------------------------------------------------------------------------------------- movement helpers
function move(rec, env, x, z, speed, dt) {
  const before = { x: rec.x, z: rec.z };
  const arrived = env.moveTo ? env.moveTo(rec, x, z, speed, dt) : straight(rec, x, z, speed, dt);
  const mv = d2(before, rec);
  rec.speed = dt > 0 ? mv / dt : 0;
  if (mv > 0.001) rec.yaw = Math.atan2(rec.x - before.x, rec.z - before.z);
  return arrived;
}
function straight(rec, x, z, speed, dt) {
  const dx = x - rec.x, dz = z - rec.z, d = hyp(dx, dz);
  if (d < 0.05) return true;
  const st = Math.min(d, speed * dt);
  rec.x += (dx / d) * st; rec.z += (dz / d) * st;
  return d - st < 0.25;
}
function face(rec, x, z) { rec.yaw = Math.atan2(x - rec.x, z - rec.z); }
function spdOf(rec, far, bigLoad) {
  let s = rec.stats.spd * (far > 8 ? 1.7 : 1);
  if (bigLoad) s *= SIM.bigSlow;
  return s;
}
function floorAt(rec, env, o) { return env.floorY ? env.floorY(rec.x, rec.z, rec.zone, rec.inShip, o) : o.pos.y; }
function teleportNear(rec, env, o) {
  const yaw = o.yaw || 0;
  rec.x = o.pos.x + Math.sin(yaw) * 1.4; rec.z = o.pos.z + Math.cos(yaw) * 1.4;
  rec.y = floorAt(rec, env, o);
  rec.path = null; rec.repath = 0; rec.pdest = null;
}

// ---------------------------------------------------------------------------------------------------------------- targeting
function creatureById(env, id) { const list = env.creatures || []; for (const c of list) if (c.id === id) return c; return null; }
function pickAssist(rec, env, center, radius, o) {
  let best = null, bd = radius;
  for (const c of env.creatures || []) {
    if (c.dead || c.hazard || c.maxHp == null || (c.hp != null && c.hp <= 0) || c.boss || c.friendly) continue;
    if (c.zone && o.zone && c.zone !== o.zone) continue;
    const dPet = hyp(c.x - center.x, c.z - center.z);
    if (dPet > bd || Math.abs(c.y - center.y) > 4) continue;
    const threat = c.target === o.id || hyp(c.x - o.pos.x, c.z - o.pos.z) < 6 || rec.mode === 'guard';
    if (!threat || !c.active) continue;
    bd = dPet; best = c;
  }
  return best;
}

function attackStep(rec, env, c, dt) {
  const air = rec.stats.sp === 'owl' || rec.stats.sp === 'parrot' || rec.stats.sp === 'crow' || rec.stats.sp === 'bee';
  const reach = air ? SIM.reachAir : SIM.reach;
  const d = hyp(c.x - rec.x, c.z - rec.z);
  rec.st = 'attack';
  if (d > reach * 0.85 && rec.mode !== 'stay') { move(rec, env, c.x, c.z, spdOf(rec, 99, false), dt); }
  else { face(rec, c.x, c.z); rec.speed = 0; }
  if (d > reach + 0.6 || rec.cd.atk > 0) return;
  const st = rec.stats;
  rec.cd.atk = st.atkCd; rec.atkT = 0.5;
  let dmg = st.atk;
  if (st.firstStrike > 1 && !rec.first.has(c.id)) { dmg *= st.firstStrike; rec.first.add(c.id); if (rec.first.size > 30) rec.first.clear(); }
  const trait = rec.pet?.tr;
  const stun = st.stun && (env.rand || Math.random)() < st.stun ? 1.2 : 0;
  const res = env.hit?.(rec, c.id, dmg, { dot: st.dot, aoe: st.aoe, stun, trait }) || {};
  if (res.killed) { rec.kills++; rec.tgt = null; rec.cmd = null; env.emit?.('kill', { type: c.type, lv: c.level || 1 }); }
}

// ---------------------------------------------------------------------------------------------------------------- fetch
function isBigItem(it) { return !!it.big; }
function fetchCandidates(rec, env, o) {
  const st = rec.stats, out = [];
  const range = st.fetchRange || 0;
  for (const it of env.findItems?.(rec) || []) {
    if (rec.carry.includes(it.id) || (env.claimed?.(it.id, rec))) continue;
    if (it.nest && !st.steal) continue;
    if (isBigItem(it) && !st.big) continue;
    if ((it.weight || 0) > (st.big ? SIM.bigWeight : SIM.smallWeight) && !it.nest) continue;
    if (hyp(it.x - o.pos.x, it.z - o.pos.z) > range || Math.abs(it.y - o.pos.y) > 4.5) continue;
    out.push(it);
  }
  return out;
}
function pickItem(rec, list) {
  const st = rec.stats;
  let best = null, bs = Infinity;
  for (const it of list) {
    let score = hyp(it.x - rec.x, it.z - rec.z);
    if (st.pickBest) score -= (it.tier || 0) * 10 + (it.val || 0) * 0.05;
    else if (st.steal && it.nest) score -= 12;
    if (score < bs) { bs = score; best = it; }
  }
  return best;
}
function destPoint(rec, env, o) {
  if (rec.dest === 'ship' && env.shipPoint && env.shipReachable !== false) return { x: env.shipPoint.x, z: env.shipPoint.z, ship: true };
  return { x: o.pos.x, z: o.pos.z, ship: false };
}
function fetchStep(rec, env, o, dt) {
  const st = rec.stats;
  rec.tripT += dt;
  // carrying: bring it home
  if (rec.carry.length && (rec.carry.length >= st.carry || !rec.tgt)) {
    const dp = destPoint(rec, env, o);
    rec.st = 'carry';
    const far = hyp(dp.x - rec.x, dp.z - rec.z);
    if (far > SIM.dropAt) { move(rec, env, dp.x, dp.z, spdOf(rec, far, rec.carry.some((id) => env.isBig?.(id))), dt); if (rec.tripT < SIM.tripMax * 2) return true; }
    const n = rec.carry.length, ids = rec.carry.slice();
    rec.carry.length = 0;
    env.dropCarry?.(rec, ids, dp.ship ? 'ship' : 'owner');
    rec.fetchedToday += n; rec.cd.fetch = st.fetchCd; rec.tgt = null; rec.tripT = 0;
    env.emit?.('fetched', { n, ship: dp.ship });
    return true;
  }
  if (rec.cd.fetch > 0 || rec.fetchedToday >= st.fetchDaily) return false;
  // outbound
  if (!rec.tgt) {
    const list = fetchCandidates(rec, env, o);
    if (!list.length) { rec.cd.fetch = 2.5; return false; }
    if (!obeys(rec.pet, env.rand || Math.random)) { rec.cd.fetch = 9; env.emit?.('say', { k: 'ignore' }); return false; }
    const it = pickItem(rec, list);
    rec.tgt = it.id; rec.tripT = 0;
    if (env.claim) env.claim(it.id, rec);
  }
  const it = (env.findItems?.(rec) || []).find((q) => q.id === rec.tgt);
  if (!it || rec.tripT > SIM.tripMax) { if (env.release) env.release(rec.tgt, rec); rec.tgt = null; rec.cd.fetch = 3; if (rec.carry.length) return fetchStep(rec, env, o, 0); return false; }
  rec.st = 'fetch';
  const d = hyp(it.x - rec.x, it.z - rec.z);
  if (d > 1.1) { move(rec, env, it.x, it.z, spdOf(rec, d, false), dt); return true; }
  if (env.take?.(rec, it.id)) {
    rec.carry.push(it.id);
    if (it.nest) env.emit?.('say', { k: 'stole' });
    rec.tgt = null;
    if (rec.carry.length < st.carry) {   // a second item close by?
      const more = fetchCandidates(rec, env, o).filter((q) => hyp(q.x - rec.x, q.z - rec.z) < 7);
      if (more.length && rec.carry.length < st.carry) { const q = pickItem(rec, more); rec.tgt = q.id; env.claim?.(q.id, rec); }
    }
  } else { env.release?.(rec.tgt, rec); rec.tgt = null; rec.cd.fetch = 3; }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------- passives
function passives(rec, env, o, dt) {
  const st = rec.stats, cd = rec.cd;
  if (cd.sense <= 0 && (st.sense || st.bark || st.nose || st.farsight)) {
    cd.sense = SIM.senseEvery;
    const marks = [];
    const R = Math.max(st.sense || 0, st.bark || 0);
    if (R > 0) for (const c of env.creatures || []) {
      if (c.dead || (c.hp != null && c.hp <= 0)) continue;
      if (c.hazard && !st.senseHazards) continue;
      if (c.zone && o.zone && c.zone !== o.zone) continue;
      if (hyp(c.x - o.pos.x, c.z - o.pos.z) > R || Math.abs(c.y - o.pos.y) > 12) continue;
      marks.push([+c.x.toFixed(1), +c.y.toFixed(1), +c.z.toFixed(1), c.hazard ? 'h' : 'c']);
      if (st.bark && !c.hazard && !rec.seen.has(c.id) && c.active) { rec.seen.add(c.id); env.emit?.('bark', { x: c.x, z: c.z }); }
    }
    if (st.farsight) for (const it of env.looseLoot?.(rec) || []) {
      if (hyp(it.x - o.pos.x, it.z - o.pos.z) <= st.farsight && Math.abs(it.y - o.pos.y) < 20) marks.push([+it.x.toFixed(1), +it.y.toFixed(1), +it.z.toFixed(1), 'l']);
    }
    if (st.nose) for (const ch of env.chests?.(rec) || []) {
      if (!ch.opened && hyp(ch.x - o.pos.x, ch.z - o.pos.z) <= st.nose) marks.push([+ch.x.toFixed(1), +ch.y.toFixed(1), +ch.z.toFixed(1), 'k']);
    }
    if (rec.seen.size > 60) rec.seen.clear();
    env.emit?.('mk', { list: marks.slice(0, 24) });
  }
  if (st.pollen && cd.pollen <= 0 && d2(rec, o.pos) < SIM.tankRange + 2) { cd.pollen = 1 / st.pollen; env.emit?.('heal', { n: 1 }); }
  if (st.recharge && cd.recharge <= 0) { cd.recharge = SIM.rechargeEvery; env.emit?.('recharge', { f: st.recharge }); }
  if (st.dig && cd.dig <= 0) { cd.dig = st.dig * (0.8 + 0.4 * (env.rand || Math.random)()); if ((rec.digsToday || 0) < 4) { rec.digsToday = (rec.digsToday || 0) + 1; env.dig?.(rec, st.digTier); } }
}

function creaturesHurtPet(rec, env, dt) {
  if (rec.cd.hurt > 0) return;
  for (const c of env.creatures || []) {
    if (c.dead || c.hazard || !c.active || !(c.dmg > 0) || c.friendly) continue;
    if (hyp(c.x - rec.x, c.z - rec.z) > 1.6 || Math.abs(c.y - rec.y) > 2.5) continue;
    rec.cd.hurt = SIM.hurtCd;
    const r = hurtPet(rec, Math.max(1, c.dmg * SIM.hurtFrac), env);
    if (r === 'ko') return;
    break;
  }
}

// ---------------------------------------------------------------------------------------------------------------- the step
export function stepPet(rec, env, dt) {
  if (!rec || !rec.stats) return rec;
  const o = env.owner;
  const cd = rec.cd;
  for (const k in cd) if (cd[k] > 0) cd[k] -= dt;
  if (rec.atkT > 0) rec.atkT -= dt;
  if (rec.hurtT > 0) rec.hurtT -= dt;
  rec.combatT += dt;
  if (env.day !== undefined && env.day !== rec.day) { rec.day = env.day; rec.fetchedToday = 0; rec.revived = false; rec.digsToday = 0; }
  if (rec.ko) { rec.st = 'ko'; rec.anim = 'ko'; rec.speed = 0; return rec; }
  if (!o) { rec.anim = 'idle'; return rec; }
  const st = rec.stats;
  const guardOk = rec.mode === 'guard' && env.guardPoint;

  // leaving the owner's zone / a huge distance: catch up (guarding pets stay at the ship)
  if (!guardOk) {
    const far = hyp(o.pos.x - rec.x, o.pos.z - rec.z);
    const inSame = rec.zone === o.zone && rec.inShip === !!o.inShip;
    if (!inSame || far > SIM.teleportDist || Math.abs(o.pos.y - rec.y) > 6) {
      // the ship door is the only way in / out on foot: walk to it when close, else snap
      rec.zone = o.zone; rec.inShip = !!o.inShip;
      teleportNear(rec, env, o);
    }
  } else if (rec.zone !== 'out') { rec.zone = 'out'; rec.inShip = false; if (env.guardPoint) { rec.x = env.guardPoint.x; rec.z = env.guardPoint.z; rec.y = env.guardPoint.y ?? rec.y; } }
  rec.y += (floorAt(rec, env, o) - rec.y) * Math.min(1, dt * 8);
  if (rec.blocked) { rec.anim = 'idle'; rec.speed = 0; return rec; }

  passives(rec, env, o, dt);
  creaturesHurtPet(rec, env, dt);
  if (rec.ko) return rec;

  rec.speed = 0;
  // parrot decoy trip
  if (rec.decoy) {
    const dc = rec.decoy;
    rec.st = 'decoy';
    if (dc.phase === 'go') {
      const arrived = move(rec, env, dc.x, dc.z, spdOf(rec, 99, false), dt);
      if (arrived || hyp(dc.x - rec.x, dc.z - rec.z) < 1.5 || (dc.t += dt) > 8) { dc.phase = 'call'; dc.t = 0; env.decoy?.(rec, dc, st.lure, st.scare); }
    } else {
      dc.t += dt;
      if (dc.t > 0.6 && dc.t - dt <= 0.6) rec.atkT = 0.4;
      if (dc.t < st.lure) { if (Math.floor(dc.t * 2) !== Math.floor((dc.t - dt) * 2)) env.decoy?.(rec, dc, st.lure, false); }
      else rec.decoy = null;
    }
    finishAnim(rec);
    return rec;
  }

  // target selection
  let tgt = null;
  if (rec.cmd) {
    rec.cmd.t -= dt;
    const c = creatureById(env, rec.cmd.id);
    if (!c || c.dead || (c.hp != null && c.hp <= 0) || rec.cmd.t <= 0 || d2(c, o.pos) > SIM.leash + 8) rec.cmd = null; else tgt = c;
  }
  if (!tgt && st.assist && rec.mode !== 'stay') {
    const center = guardOk ? env.guardPoint : o.pos;
    const r = guardOk ? SIM.guardR : SIM.assistR;
    tgt = pickAssist(rec, env, center, r, o);
    if (tgt && d2(tgt, o.pos) > SIM.leash && !guardOk) tgt = null;
  }
  if (!tgt && guardOk) tgt = pickAssist(rec, env, env.guardPoint, SIM.guardR, o);
  if (!tgt && rec.mode === 'stay') { const c = pickAssist(rec, env, rec, SIM.reach + 1, o); if (c && st.assist) tgt = c; }

  if (tgt) { if (rec.tgt && !String(rec.tgt).startsWith('c')) env.release?.(rec.tgt, rec); attackStep(rec, env, tgt, dt); finishAnim(rec); return rec; }
  if (rec.st === 'attack') rec.st = 'idle';

  // modes
  if (rec.mode === 'stay') { rec.st = 'idle'; finishAnim(rec); return rec; }
  if (guardOk) {
    rec.st = 'guard';
    const gp = env.guardPoint;
    if (d2(rec, gp) > 2.2) move(rec, env, gp.x, gp.z, spdOf(rec, d2(rec, gp), false), dt);
    finishAnim(rec);
    return rec;
  }
  if (rec.mode === 'fetch' && st.canFetch) { if (fetchStep(rec, env, o, dt)) { finishAnim(rec); return rec; } }
  else if (rec.carry.length) dropCarry(rec, env, rec.dest === 'ship' && env.shipPoint ? 'ship' : 'owner');

  // follow: stay behind-right of the owner, sit when idle for a while
  rec.st = 'follow';
  const yaw = o.yaw || 0;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);   // owner forward
  const tx = o.pos.x - fx * SIM.followBack + fz * 0.7, tz = o.pos.z - fz * SIM.followBack - fx * 0.7;
  const far = hyp(o.pos.x - rec.x, o.pos.z - rec.z);
  if (far > SIM.followDist) { move(rec, env, tx, tz, spdOf(rec, far, false), dt); rec.sitT = 0; }
  else rec.sitT += dt;
  finishAnim(rec);
  return rec;
}

function finishAnim(rec) {
  if (rec.ko) { rec.anim = 'ko'; return; }
  if (rec.atkT > 0) rec.anim = 'attack';
  else if (rec.speed > 5.5) rec.anim = 'run';
  else if (rec.speed > 0.25) rec.anim = 'walk';
  else rec.anim = rec.sitT > 5 ? 'sit' : 'idle';
}

export const ANIM_CODES = ['idle', 'walk', 'run', 'sit', 'attack', 'ko', 'happy', 'sleep'];
export const animCode = (a) => Math.max(0, ANIM_CODES.indexOf(a));
export const MODE_CODES = MODES;
