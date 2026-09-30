// SWARM11 wave 11 - definitions, host AI, host bookkeeping and registration of the creature-ecology module (docs/wave11/swarm11.md).
// Everything runs inside the generic CreatureManager.hostUpdate (stun, damage, XP, snapshots, balance scaling, balance_rules 0.4 s wind-up gate apply).
// EXTENDS the wave-1 horde creatures instead of duplicating them: carry uses the same 'held' / 'drop' item messages and dropAll() of the Collector
// (creatures_wave1.js); loot rules follow its stealable(); the AutoMod is the dangerous cousin of the Janitor Bot (which only bins tools and mops trails).
//   SCRAPER   'walk' (forage / patrol) -> 'return' (carries one item, slower) -> deposits at the NEST ; 'rage' / 'windup' / 'attack' after the nest alarm.
//   NEST      'idle' / 'alarm' (1.0 s siren + red glow BEFORE the swarm moves) / 'dead'. extra = heap fill 0..1 (glow).
//   STREAMER  'walk' -> 'boot' (1.6 s ring warm-up + LIVE! jingle) -> 'live' (24 s: pulse every 1.5 s pulls calm creatures within 30 m) ; 'flee' once the ring breaks.
//   AUTOMOD   'walk' -> 'scan' (locks a target, aim beam) -> 'sweep' (2.4 s, deletes it) ; dwell meter -> 'hunt' -> 'flag' (1.3 s telegraph) -> 'delete' (heavy hit).
import * as THREE from 'three';
import { registerCreature, CREATURES, EXTRA_SPAWNS } from './creatures.js';
import { STATE_SOUNDS, LOOPS } from '../entities/creatures.js';
import { IDENT } from './identify.js';
import { CREATURE_FLAVOUR } from './components.js';
import { NO_POSE, NO_TELL } from './creature_read.js';
import { FIELD_NOTES } from './collection.js';
import { isSellable } from './items.js';
import { insideShip } from '../world/ship.js';
import { angleDiff, clamp } from '../core/util.js';
import { isHunting } from './crdirector_core.js';
import { dropAll } from './creatures_wave1.js';
import * as C from './swarm11_core.js';

const rnd = Math.random, T = C.TUNE, S = T.scr, L = T.live, MD = T.mod, V = new THREE.Vector3();
const { scraper: SCR, nest: NEST, streamer: STR, automod: MOD } = C.IDS;
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// The first sentence of `lore` IS the rule: the director shows it as the first-encounter caption.
export const DEFS = {
  [SCR]: { name: 'Scraper', hp: S.hp, dmg: S.dmg, walk: S.walk, run: S.run, power: 0.3, xp: 22, coin: 3, zone: 'in', radius: 0.35, height: 0.5, noSpawn: true, minion: true,
    deathText: 'was swarmed by Scrapers.',
    lore: 'A colony of little bots carries loose scrap back to a glowing nest, so the loot you left lying about is gone: follow the trail home. '
      + 'Hit a bot and it drops its load. Take from the nest or smash it and the whole colony wakes, so stun them or leave with the scrap.' },
  [NEST]: { name: 'Scraper Nest', hp: S.nestHp, dmg: 0, power: 0, xp: 90, coin: 25, zone: 'in', radius: 1.0, height: 1.3, noSpawn: true,
    lore: 'The colony\'s stash: the brighter it glows, the more it holds. Smash it for a bonus, but the swarm wakes up after a one second alarm.' },
  [STR]: { name: 'The Streamer', hp: L.hp, dmg: 0, walk: L.walk, run: L.run, power: 1, xp: 110, coin: 20, zone: 'in', radius: 0.4, height: 2.1,
    deathText: 'was cancelled by the Streamer.',
    lore: 'It never attacks: it goes LIVE and every calm creature within 30 m stops what it is doing and comes to watch. Do not be in the audience. '
      + 'Smash its ring light (half its health) and it flees and never streams again, or lure it far from the vault and loot while it performs.' },
  [MOD]: { name: 'AutoMod', hp: MD.hp, dmg: MD.dmg, walk: MD.walk, run: MD.run, power: 2, xp: 200, coin: 36, zone: 'in', radius: 0.55, height: 2.0, maxAlive: 1,
    deathText: 'was permanently deleted by AutoMod.',
    lore: 'It deletes what the crew leaves behind: bodies, dropped items, chalk marks and blood, so recover and stash on a timer. '
      + 'Stand beside a body too long and it flags YOU: the red lamp means the delete is one second away, so step away. Attack it and it flags you too.' },
};
export const HINTS = {
  [SCR]: 'Fragile. A hit makes it drop its load. Following one leads to the nest; grabbing from the nest wakes them all.',
  [NEST]: 'It glows brighter the more it holds. Smash it for a bonus, but expect the swarm one second later.',
  [STR]: 'Never attacks, but everything nearby comes to its stream. Break the ring light (half its health) or lure it away.',
  [MOD]: 'Do not linger next to a body. Carry it off, or step away when the red lamp flashes. It deletes dropped items too.',
};
export const NOTES = {
  [SCR]: 'They only take LOOSE scrap: a bag or the ship is safe. A stunned bot drops its item where it stands.',
  [NEST]: 'Take one item and you get the alarm. Stun the bots first, or smash the nest and grab the pile while they chase.',
  [STR]: 'Every 1.5 s a ring pulse shows how far the pull reaches (30 m). A stun grenade cuts a stream short.',
  [MOD]: 'It ignores an item you are standing next to and anything carried. Dropped items are fair game after 8 s.',
};

// ------------------------------------------------------------------------------------------------ shared host state
/** host scratch shared by the AI, the tick and the module: reset by resetHost() */
export const H = { g: null, drops: new Map(), claimed: new Set(), blood: [], bloodId: 1, bodies: [], cands: [], stats: { stolen: 0, deleted: 0, pulls: 0, flags: 0, raids: 0 }, sayT: 0 };
export function resetHost() { H.drops.clear(); H.claimed.clear(); H.blood.length = 0; H.bodies.length = 0; H.cands.length = 0; H.bloodId = 1; H.stats = { stolen: 0, deleted: 0, pulls: 0, flags: 0, raids: 0 }; }
let gateGame = null;
/** the game whose run.quotaIndex gates the generic spawners (null = blocked: nothing spawns without a run) */
export function setSwGame(g) { gateGame = g; H.g = g; }

// ------------------------------------------------------------------------------------------------ helpers
const face = (c, x, z, dt, rate = 9) => { const want = Math.atan2(x - c.pos.x, z - c.pos.z); c.yaw += clamp(angleDiff(c.yaw, want), -rate * dt, rate * dt); };
const walkers = (c, M) => M.playersFor(c).filter((p) => !p.dead && !p.inShip);
/** one-shot sound at a creature for everybody (cev 'snd' handled by CreatureManager.onEvent) */
export function csnd(M, c, names, v = 0.8, pt = 1, ref = 4, max = 40) { M.game.net.broadcast('cev', { e: 'snd', id: c.id, s: names, v, pt, ref, max }); }
/** floating speech tag over a creature (client translates the key through t()) */
export function say(g, c, key) { g.net.broadcast('swfx', { k: 'say', id: c.id, s: key }); }
function awayFrom(c, M, x, z, dist = 14) {
  const a = Math.atan2(c.pos.x - x, c.pos.z - z), nav = M.nav(c);
  if (nav) { for (let i = 0; i < 4; i++) { const w = nav.randomWalkable(rnd, c.pos.x + Math.sin(a) * dist, c.pos.z + Math.cos(a) * dist, 4 + i * 2); if (w) { M.goTo(c, w.x, w.z); return; } } }
  M.goTo(c, c.pos.x + Math.sin(a) * dist, c.pos.z + Math.cos(a) * dist);
}
function patrol(c, dt, M, speed, radius) { if (!c.path || M.follow(c, dt, speed)) M.wander(c, radius); }
const scratch = { state: '', holder: null, owner: null, carrier: null, sellable: false, big: false, type: '', soulbound: false, inShip: false, claimed: false };
/** may a bot take this item? (plain-data rule in swarm11_core.js) */
function canTake(it) {
  const p = it.obj?.position;
  if (!p || it.swHeap) return false;                          // swHeap: already stored in a nest (host-side marker)
  scratch.state = it.state; scratch.holder = it.holder; scratch.owner = it.owner; scratch.carrier = it.carrier; scratch.type = it.type;
  scratch.sellable = !!it.def && isSellable(it.def); scratch.big = it.def?.kind === 'big'; scratch.soulbound = !!it.soulbound;
  scratch.inShip = insideShip(p); scratch.claimed = H.claimed.has(it.id);
  return C.stealable(scratch);
}
const nestOf = (c, M) => { const n = c.data.nest ? M.host.get(c.data.nest) : null; return n && n.type === NEST ? n : null; };
/** host migration rebuilds creatures without their data: adopt the nearest nest */
function findNest(c, M) {
  let best = null, bd = 60;
  for (const o of M.host.values()) if (o.type === NEST && !o.dead) { const d = hd(o.pos, c.pos); if (d < bd) { bd = d; best = o; } }
  return best;
}
const scrapersOf = (M, nestId) => { const out = []; for (const o of M.host.values()) if (o.type === SCR && !o.dead && o.data.nest === nestId) out.push(o); return out; };

// ------------------------------------------------------------------------------------------------ SCRAPER
/** nest alarm rings, then every bot rages at the target: carried items are dropped where they are */
function rageColony(M, nest, pid) {
  for (const b of scrapersOf(M, nest.id)) {
    if (b.data.carry?.length) dropAll(b, M, false);
    b.data.rageT = S.rageT; b.data.tid = pid; b.data.want = null; b.setState('rage');
  }
}
function wake(M, nest, pid) {
  const d = nest.data;
  if (nest.dead || d.alarmT > 0) return;
  d.alarmT = S.alarmT; d.alarmPid = pid; nest.setState('alarm');   // STATE_SOUNDS: siren + red glow on every peer: the telegraph
  H.stats.raids++;
}
function scraper(c, dt, M) {
  const d = c.data, g = M.game;
  if (!d.init) { d.init = 1; d.rageT = 0; d.tid = null; d.scanT = rnd() * 0.8; d.want = null; d.carry = d.carry || []; d.bad = []; c.setState('walk'); }
  let nest = nestOf(c, M);
  if (!nest) { nest = findNest(c, M); d.nest = nest ? nest.id : null; }
  const home = nest && !nest.dead ? nest : null;
  if (c.state === 'stunned') c.setState(d.rageT > 0 ? 'rage' : 'walk');
  if (c.state === 'idle') c.setState(d.rageT > 0 ? 'rage' : 'walk');
  const pl = walkers(c, M);

  if (d.hitBy) {                                              // hit: drop the load, fight back, ring the alarm for the rest
    const by = d.hitBy; d.hitBy = null;
    if (d.carry.length) dropAll(c, M, false);
    if (d.want) { H.claimed.delete(d.want); d.want = null; }
    d.rageT = S.rageT; d.tid = by; if (home) wake(M, home, by);
  }
  if (c.state === 'windup') {
    const tp = pl.find((p) => p.id === d.tid);
    if (!tp) { c.setState('rage'); return; }
    face(c, tp.pos.x, tp.pos.z, dt, 6);
    if (c.t >= S.windup) {                                    // the lunge lands only on whoever is still close
      if (hd(c.pos, tp.pos) <= S.hitReach && Math.abs(tp.pos.y - c.pos.y) < 1.8) M.attack(c, tp, c.dmg, SCR);
      c.cooldown = S.cd + rnd() * 0.8; c.setState('attack');
    }
    return;
  }
  if (c.state === 'attack') { if (c.t >= S.attackT) c.setState('rage'); return; }

  if (d.rageT > 0) {
    d.rageT -= dt;
    let tp = pl.find((p) => p.id === d.tid);
    if (!tp || (home && hd(tp.pos, home.pos) > S.leash)) tp = M.nearest(c, pl, 14)?.p;
    if (!tp || d.rageT <= 0) { d.rageT = 0; d.tid = null; c.setState('walk'); return; }
    d.tid = tp.id; c.setState('rage');
    face(c, tp.pos.x, tp.pos.z, dt, 8);
    const dist = hd(c.pos, tp.pos);
    if (dist < S.reach && c.cooldown <= 0 && Math.abs(tp.pos.y - c.pos.y) < 1.8) { c.setState('windup'); return; }
    M.moveToward(c, tp.pos, dt, c.def.run);
    return;
  }
  // ---- calm colony life
  if (d.carry.length) {
    const it = g.items.get(d.carry[0]);
    if (!it || it.holder !== 'c:' + c.id) { d.carry.length = 0; return; }
    if (!home) { dropAll(c, M, false); c.setState('walk'); return; }
    c.setState('return');
    M.goToLazy(c, home.pos.x, home.pos.z, 2.5); M.follow(c, dt, c.def.walk * S.carryMul);   // static goal: no A* every second
    if (hd(c.pos, home.pos) < S.depositR) {                   // deposit: the item drops as a real item next to the nest and counts as stored
      const id = d.carry[0], a = rnd() * Math.PI * 2;
      dropAll(c, M, true, new THREE.Vector3(home.pos.x + Math.cos(a) * 1.3, home.pos.y, home.pos.z + Math.sin(a) * 1.3));   // beside the pile, not inside it
      home.data.heap = home.data.heap || [];
      if (!home.data.heap.includes(id)) home.data.heap.push(id);
      const stored = g.items.get(id); if (stored) stored.swHeap = home.id;
      H.claimed.delete(id); H.stats.stolen++;
      csnd(M, c, ['sw_scr_chirp', 'squeak'], 0.8, 1.3, 3, 30);
      c.setState('walk');
    }
    return;
  }
  d.scanT -= dt;
  const full = home && (home.data.heap?.length || 0) >= S.cap;
  if (!d.want && d.scanT <= 0 && home && !full) {
    d.scanT = 0.8 + rnd() * 0.6;
    let best = null, bd = S.forageR;
    for (const it of g.items.all()) {
      const p = it.obj?.position;
      if (!p || Math.abs(p.y - c.pos.y) > 3) continue;
      const dd = Math.hypot(p.x - c.pos.x, p.z - c.pos.z);
      if (dd < bd && !d.bad.includes(it.id) && canTake(it)) { bd = dd; best = it; }
    }
    if (best) { d.want = best.id; H.claimed.add(best.id); M.goTo(c, best.obj.position.x, best.obj.position.z); if (!c.path) { d.bad.push(best.id); H.claimed.delete(best.id); d.want = null; } else c.setState('walk'); }
  }
  if (d.want) {
    const it = g.items.get(d.want);
    if (!it || it.state !== 'world' || it.holder) { H.claimed.delete(d.want); d.want = null; return; }
    const ip = it.obj.position;
    if (hd(c.pos, ip) < S.pickR && Math.abs(ip.y - c.pos.y) < 2.5) {
      d.carry.push(it.id); it.carrier = c.id;
      g.net.broadcast('it', { e: 'held', id: it.id, h: 'c:' + c.id, sl: 0 });
      d.want = null; csnd(M, c, ['sw_scr_chirp', 'squeak'], 0.9, 0.9, 3, 30);
      return;
    }
    c.setState('walk');
    if (M.follow(c, dt, c.def.walk) && hd(c.pos, ip) > S.pickR * 2) { d.bad.push(it.id); H.claimed.delete(it.id); d.want = null; }
    return;
  }
  if (c.state !== 'walk') c.setState('walk');
  if (home && hd(c.pos, home.pos) > S.homeR) { M.goToLazy(c, home.pos.x, home.pos.z, 2.5); M.follow(c, dt, c.def.walk); return; }
  patrol(c, dt, M, c.def.walk * 0.7, 10);
}

// ------------------------------------------------------------------------------------------------ NEST
function nestAI(c, dt, M) {
  const d = c.data, g = M.game;
  if (!d.init) {
    d.init = 1; d.heap = d.heap || []; d.guard = {}; d.alarmT = d.alarmT || 0; d.paid = 0; d.pruneT = 0; c.setState(d.alarmT > 0 ? 'alarm' : 'idle');
    for (const it of g.items.all()) { const p = it.obj?.position; if (p && it.state === 'world' && !it.holder && hd(p, c.pos) < S.depositR + 0.6 && Math.abs(p.y - c.pos.y) < 2.5 && d.heap.length < S.cap && it.def && isSellable(it.def)) { d.heap.push(it.id); it.swHeap = c.id; } }   // host migration: the pile is already there
  }
  if (c.state === 'stunned') c.setState('idle');
  if (d.hitBy) { const by = d.hitBy; d.hitBy = null; wake(M, c, by); }   // smashing (or just hitting) the nest is a raid
  d.pruneT -= dt;
  if (d.pruneT <= 0) {                                        // bounded (<= cap items): who took something?
    d.pruneT = 0.4;
    for (let i = d.heap.length - 1; i >= 0; i--) {
      const it = g.items.get(d.heap[i]), p = it?.obj?.position;
      const v = C.heapVerdict(it ? { state: it.state, holder: it.holder } : null, p ? hd(p, c.pos) : 1e9);
      if (v === 'in') continue;
      d.heap.splice(i, 1);
      if (it) delete it.swHeap;                               // no longer stored: a bot may take it again (only when it lies loose)
      if (v === 'taken') wake(M, c, it.holder);
    }
  }
  c.extra = C.heapFill(d.heap.length);
  if (d.alarmT > 0) {
    d.alarmT -= dt;
    if (d.alarmT <= 0) { rageColony(M, c, d.alarmPid); c.setState('idle'); }
    return;
  }
  if (!d.heap.length) return;                                 // nothing to guard: walking past an empty nest is free
  for (const p of M.playersFor(c)) {
    if (p.dead || p.inShip) { d.guard[p.id] = 0; continue; }
    const near = hd(p.pos, c.pos) < S.guardR && Math.abs(p.pos.y - c.pos.y) < 3;
    const m = C.guardStep(d.guard[p.id] || 0, near, dt);
    d.guard[p.id] = m;
    if (m >= 1) { d.guard[p.id] = 0; wake(M, c, p.id); break; }
  }
}

// ------------------------------------------------------------------------------------------------ STREAMER
function pulse(c, M) {
  const g = M.game, now = g.time || 0;
  M.noises.push({ pos: new THREE.Vector3(c.pos.x, c.pos.y + 1, c.pos.z), loud: L.loud, t: 0.6, owner: null, zone: c.zone });   // creatures that listen (M.hear) are drawn too
  let go = L.budget, n = 0;
  for (const o of M.host.values()) {
    if (o === c || o.dead || o.zone !== c.zone) continue;
    if (!C.attractable(o.type, o.def, o.state, isHunting) || !C.inPullRange(c.pos.x, c.pos.y, c.pos.z, o.pos.x, o.pos.y, o.pos.z)) continue;
    n++;
    o.data.swPull = now;
    if (o.state === 'idle') o.setState('walk');
    if (go > 0 && (!o.dest || hd(o.dest, c.pos) > 3.5)) { go--; M.goTo(o, c.pos.x + (rnd() - 0.5) * 6, c.pos.z + (rnd() - 0.5) * 6); }
  }
  c.data.pulled = n; H.stats.pulls++;
  csnd(M, c, ['sw_live_ping', 'chat_blip'], 0.55, 1, 6, 60);
}
function breakRing(c, M) {
  const d = c.data;
  d.broken = true; d.cool = 1e9;
  c.setState('flee'); d.fleeT = L.fleeT;
  const by = [...c.attackers.keys()].pop();
  const p = by ? M.game.aiPlayerById(by) : null;
  if (p) awayFrom(c, M, p.pos.x, p.pos.z, 16);
  M.game.net.broadcast('swfx', { k: 'ring', id: c.id });
}
function streamer(c, dt, M) {
  const d = c.data;
  if (!d.init) { d.init = 1; d.cool = 5 + rnd() * 6; d.walkT = 0; d.pulseT = 0; d.broken = false; d.fleeT = 0; c.setState('walk'); }
  if (!d.broken && C.ringBreaks(c.hp, c.maxHp)) breakRing(c, M);
  c.extra = C.ringExtra(c.hp, c.maxHp, d.broken);
  if (c.state === 'stunned' || c.state === 'idle') {           // a stun grenade cuts the stream short; it gets its bearings first
    if (d.wasLive) { d.cool = Math.max(d.cool, 8); d.wasLive = false; }
    d.bootSent = 0;
    c.setState(d.broken ? 'flee' : 'walk'); d.walkT = 0;
  }
  const pl = walkers(c, M);
  if (c.state === 'flee') {
    d.fleeT -= dt;
    const arrived = M.follow(c, dt, c.def.run);
    if (d.fleeT <= 0 || arrived) { d.fleeT = 0; c.setState('walk'); d.walkT = 0; }
    return;
  }
  if (c.state === 'boot') {                                    // telegraph: the ring warms up, LIVE! jingle (STATE_SOUNDS). It stands still.
    if (!d.bootSent) { d.bootSent = 1; M.game.net.broadcast('swfx', { k: 'live', p: [+c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2)] }); }
    if (c.t >= L.bootT) { c.setState('live'); d.pulseT = 0; d.wasLive = true; d.bootSent = 0; say(M.game, c, 'LIVE!'); }
    return;
  }
  if (c.state === 'live') {
    d.pulseT -= dt;
    if (d.pulseT <= 0) { d.pulseT = L.pulse; pulse(c, M); }
    if (c.t >= L.liveT) { d.wasLive = false; d.cool = C.nextCooldown(rnd()); d.walkT = 0; c.setState('walk'); }
    return;
  }
  // ---- walking: drawn to noise (so the crew can lure it), else wanders; goes live when the cooldown is over
  d.cool -= dt; d.walkT += dt;
  const n = d.broken ? null : M.hear(c, L.hear);
  if (c.state !== 'walk') c.setState('walk');
  if (n) {
    M.goToLazy(c, n.pos.x, n.pos.z, 4); M.follow(c, dt, c.def.walk);
    if (d.cool <= 0 && hd(n.pos, c.pos) < L.standOff) c.setState('boot');
    return;
  }
  if (!d.broken && d.cool <= 0 && d.walkT > 6 && (pl.length || d.walkT > 12)) { c.setState('boot'); return; }
  patrol(c, dt, M, c.def.walk, 16);
}

// ------------------------------------------------------------------------------------------------ AUTOMOD
function tgtPos(g, t) {
  if (!t) return null;
  if (t.kind === 'body' || t.kind === 'item') {
    const it = g.items.get(t.id);
    if (!it || it.state !== 'world' || it.holder || it.carrier) return null;
    return it.obj.position;
  }
  if (t.kind === 'chalk') { const m = g.horror?.store?.marks?.get?.(t.id); return m ? V.set(m.x, m.y, m.z) : null; }
  if (t.kind === 'blood') { const b = H.blood.find((q) => q.id === t.id); return b ? V.set(b.x, b.y, b.z) : null; }
  return null;
}
export function addBloodStain(g, x, y, z, size) {
  const r = C.addBlood(H.blood, x, y, z, size, H.bloodId++);
  if (r.removed) g.net.broadcast('swfx', { k: 'brm', id: r.removed.id });
  const b = r.added || r.updated;
  if (b) g.net.broadcast('swfx', { k: 'blood', id: b.id, p: [+b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2)], s: +b.s.toFixed(2) });
}
function deleteTarget(c, M, t) {
  const g = M.game;
  let name = '', mine = '';
  if (t.kind === 'body' || t.kind === 'item') {
    const it = g.items.get(t.id); if (!it) return;
    name = t.kind === 'body' ? it.label || 'body' : it.def?.name || it.type; mine = it.dropHolder || '';
    g.net.broadcast('it', { e: 'rm', id: t.id }); H.drops.delete(t.id);
  } else if (t.kind === 'chalk') {
    const st = g.horror?.store;
    if (st?.remove?.(t.id)) g.net.broadcast('hrch', { a: [], rm: [t.id] });
  } else if (t.kind === 'blood') {
    const i = H.blood.findIndex((q) => q.id === t.id);
    if (i >= 0) { H.blood.splice(i, 1); g.net.broadcast('swfx', { k: 'brm', id: t.id }); }
  }
  H.stats.deleted++;
  csnd(M, c, ['sw_mod_delete', 'impact_punch'], 0.7, 1.25, 4, 40);
  g.net.broadcast('swfx', { k: 'del', p: [+c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2)], kind: t.kind, n: name, o: mine });
}
function automod(c, dt, M) {
  const d = c.data, g = M.game;
  if (!d.init) { d.init = 1; d.dwell = {}; d.scanT = rnd(); d.tgt = null; d.aimT = 0; d.foe = null; d.foeT = 0; c.extra = 0; c.setState('walk'); }
  if (c.state === 'stunned' || c.state === 'idle') { d.tgt = null; c.setState('walk'); }
  const pl = walkers(c, M);
  if (d.hitBy) { d.foe = d.hitBy; d.hitBy = null; d.foeT = 14; d.tgt = null; if (c.state === 'sweep' || c.state === 'scan' || c.state === 'walk') { c.setState('hunt'); say(g, c, 'FLAGGED'); } }

  // ---- dwell meters: lingering beside a body while the AutoMod is around
  let top = 0, topP = null;
  for (const p of pl) {
    let nb = false;
    for (const b of H.bodies) if (Math.hypot(b.x - p.pos.x, b.z - p.pos.z) < MD.bodyR && Math.abs(b.y - p.pos.y) < 2.5) { nb = true; break; }
    const aware = hd(c.pos, p.pos) < MD.awareR;
    const m = C.dwellStep(d.dwell[p.id] || 0, nb, aware, dt);
    d.dwell[p.id] = m;
    if (m > top) { top = m; topP = p; }
  }
  if (c.state !== 'sweep') c.extra = top;
  if (top >= 1 && topP && !d.foe && c.cooldown <= 0 && c.state !== 'flag' && c.state !== 'delete') { d.foe = topP.id; d.foeT = 12; d.dwell[topP.id] = 0; d.tgt = null; c.setState('hunt'); say(g, c, 'FLAGGED'); H.stats.flags++; }

  // ---- the strike: flag (1.3 s stationary telegraph) -> delete
  if (c.state === 'flag') {
    const p = pl.find((q) => q.id === d.foe);
    c.extra = clamp(c.t / MD.flagT, 0, 1);
    if (!p) { d.foe = null; c.setState('walk'); return; }
    face(c, p.pos.x, p.pos.z, dt, 5);
    if (c.t >= MD.flagT) {
      if (hd(c.pos, p.pos) <= MD.hitReach && Math.abs(p.pos.y - c.pos.y) < 2) M.attack(c, p, c.dmg, MOD);
      c.cooldown = MD.cd; d.foe = null; c.setState('delete');
    }
    return;
  }
  if (c.state === 'delete') { c.extra = 0; if (c.t >= MD.strikeT) c.setState('walk'); return; }
  if (c.state === 'hunt') {
    d.foeT -= dt;
    const p = pl.find((q) => q.id === d.foe);
    if (!p || d.foeT <= 0 || hd(c.pos, p.pos) > 34) { d.foe = null; c.setState('walk'); return; }
    face(c, p.pos.x, p.pos.z, dt, 6);
    if (hd(c.pos, p.pos) < 2.4 && c.cooldown <= 0) { c.setState('flag'); return; }
    if (hd(c.pos, p.pos) > 1.8) M.moveToward(c, p.pos, dt, c.def.run);
    return;
  }

  // ---- housekeeping: pick a target, walk there, sweep it away
  if (c.state === 'sweep') {
    const p = tgtPos(g, d.tgt);
    if (!p) { d.tgt = null; c.setState('walk'); return; }
    face(c, p.x, p.z, dt, 6);
    c.extra = clamp(c.t / MD.sweepT, 0, 1);
    if (c.t >= MD.sweepT) { deleteTarget(c, M, d.tgt); d.tgt = null; c.setState('walk'); }
    return;
  }
  if (c.state === 'scan') {
    const p = tgtPos(g, d.tgt);
    if (!p) { d.tgt = null; c.setState('walk'); return; }
    d.aimT -= dt;
    if (d.aimT <= 0) { d.aimT = MD.aimEvery; g.net.broadcast('swfx', { k: 'aim', id: c.id, p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], kind: d.tgt.kind }); }
    if (hd(c.pos, p) < MD.reach) { c.setState('sweep'); g.net.broadcast('swfx', { k: 'aim', id: c.id, p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], kind: d.tgt.kind }); return; }
    M.moveToward(c, V.set(p.x, c.pos.y, p.z), dt, c.def.walk * 1.4);
    if (!c.path && !c.dest) d.tgt = null;
    return;
  }
  d.scanT -= dt;
  if (d.scanT <= 0) {
    d.scanT = MD.scanEvery + rnd() * 0.4;
    const t = C.pickTarget(H.cands, c.pos.x, c.pos.y, c.pos.z);
    if (t) { d.tgt = t; d.aimT = 0; c.setState('scan'); return; }
  }
  if (c.state !== 'walk') c.setState('walk');
  patrol(c, dt, M, c.def.walk, 18);
}

export const BEH = { [SCR]: scraper, [NEST]: nestAI, [STR]: streamer, [MOD]: automod };

// ------------------------------------------------------------------------------------------------ host tick (0.25 s): items, bodies, drop tracking, nest payout
const pd = (players, x, z) => { let m = 1e9; for (const p of players) { const d = Math.hypot(p.pos.x - x, p.pos.z - z); if (d < m) m = d; } return m; };
export function hostTick(g) {
  const M = g.creatures;
  if (!M?.host) return;
  const now = g.time || 0;
  const players = g.aiPlayers().filter((p) => !p.dead);
  // ---- items: bodies + player-dropped items (AutoMod candidates); a dropped item is timed from the first tick it lay still
  H.bodies.length = 0; H.cands.length = 0;
  for (const it of g.items.all()) {
    const p = it.obj?.position;
    if (!p) continue;
    if (it.type === 'body') { if (it.state === 'world' && !it.holder && !insideShip(p)) { const o = { kind: 'body', id: it.id, x: p.x, y: p.y, z: p.z }; H.bodies.push(o); H.cands.push(o); } continue; }
    const dh = it.dropHolder;
    if (!dh || String(dh).startsWith('c:') || it.state !== 'world' || it.holder || it.carrier || it.soulbound || insideShip(p)) { if (H.drops.has(it.id)) H.drops.delete(it.id); continue; }
    if (!H.drops.has(it.id)) H.drops.set(it.id, now);
    if (C.itemCleanable(now, H.drops.get(it.id), pd(players, p.x, p.z))) H.cands.push({ kind: 'item', id: it.id, x: p.x, y: p.y, z: p.z });
  }
  if (H.drops.size > 400) H.drops.clear();
  const marks = g.horror?.store?.marks;
  if (marks) for (const m of marks.values()) if (!m.f) H.cands.push({ kind: 'chalk', id: m.id, x: m.x, y: m.y, z: m.z });
  for (const b of H.blood) H.cands.push({ kind: 'blood', id: b.id, x: b.x, y: b.y, z: b.z });
  // ---- scrapers: a stunned / dead bot drops its load where it stands (a hit is handled by its own AI tick)
  for (const c of M.host.values()) {
    if (c.type !== SCR || !c.data.carry?.length) continue;
    if (c.dead || c.stunT > 0) { dropAll(c, M, false); }
  }
  for (const id of H.claimed) { const it = g.items.get(id); if (!it || it.state !== 'world' || it.holder) H.claimed.delete(id); }
  // ---- a smashed nest pays out once: bonus scrap pops out, the colony rages at whoever did it
  for (const c of M.host.values()) {
    if (c.type !== NEST || !c.dead || c.data.paid) continue;
    c.data.paid = 1;
    const n = c.data.heap?.length || 0, bonus = C.bonusCount(n);
    for (let i = 0; i < bonus; i++) { const a = rnd() * Math.PI * 2; try { g.hostSpawnRandomScrap?.(new THREE.Vector3(c.pos.x + Math.cos(a) * 1.1, c.pos.y + 0.8 + i * 0.25, c.pos.z + Math.sin(a) * 1.1)); } catch { /* optional */ } }
    g.net.broadcast('fx', { k: 'snd', s: 'glass_break', p: [c.pos.x, c.pos.y + 1, c.pos.z], v: 1, r: 5, m: 45 });
    g.net.broadcast('swfx', { k: 'raid', p: [+c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2)], n: bonus });
    const by = [...c.attackers.keys()].pop();
    if (by) for (const b of scrapersOf(M, c.id)) { if (b.data.carry?.length) dropAll(b, M, false); b.data.rageT = S.rageT; b.data.tid = by; b.data.want = null; b.setState('rage'); }
    for (const id of c.data.heap || []) { const it = g.items.get(id); if (it) delete it.swHeap; }
    c.data.heap = [];
  }
}

// ------------------------------------------------------------------------------------------------ colony spawn (host, seeded)
/** nest in a small side room away from the entrance + the bots around it. rng = RNG (src/core/rng.js) seeded by the run; returns { nest, bots } or null */
export function spawnColony(g, rng, quotaIndex = 0) {
  const M = g.creatures, fac = g.world?.facility, Ly = fac?.layout, nav = fac?.nav;
  if (!M?.hostSpawn || !Ly?.rooms?.length || !nav) return null;
  const door = fac.mainDoor?.pos, cell = Ly.cell;
  const rooms = Ly.rooms.filter((r) => !['entrance', 'vault', 'generator'].includes(r.type)).sort((a, b) => a.w * a.h - b.w * b.h);
  const small = rooms.slice(0, Math.max(1, Math.ceil(rooms.length * 0.6)));
  const pool = rng.shuffle(small.slice());
  let spot = null;
  for (const r of pool) {
    const x = Ly.ox + (r.x + 0.5 + rng.next() * Math.max(0, r.w - 1)) * cell, z = Ly.oz + (r.z + 0.5 + rng.next() * Math.max(0, r.h - 1)) * cell;
    const w = nav.nearestWalkable(...nav.toGrid(x, z), 3);
    if (!w) continue;
    const p = nav.toWorld(w[0], w[1]);
    if (door && Math.hypot(p.x - door.x, p.z - door.z) < T.colony.doorDist) continue;
    spot = new THREE.Vector3(p.x, Ly.y, p.z); break;
  }
  if (!spot) return null;
  const nest = M.hostSpawn(NEST, spot, { zone: 'in', state: 'idle', variant: null, affix: null, level: 1, yaw: rng.next() * 6.28 });
  if (!nest) return null;
  const bots = [], n = C.colonySize(rng.next(), quotaIndex), fn = rng.fn();
  for (let i = 0; i < n; i++) {
    const w = nav.randomWalkable(fn, spot.x, spot.z, 3.5);
    const b = M.hostSpawn(SCR, new THREE.Vector3(w ? w.x : spot.x + (i - n / 2) * 0.5, Ly.y, w ? w.z : spot.z + 1), { zone: 'in', state: 'walk', variant: null, affix: null, level: 1, data: { nest: nest.id }, yaw: rng.next() * 6.28 });
    if (b) bots.push(b);
  }
  return { nest, bots };
}

// ------------------------------------------------------------------------------------------------ registration
let registered = false;
/** creatures, spawn weights + quota gate, sounds / loops, scanner + codex rows (idempotent). */
export function registerSw11Content() {
  if (!registered) {
    registered = true;
    for (const [id, def] of Object.entries(DEFS)) if (!CREATURES[id]) registerCreature(id, { ...def }, BEH[id]);
    for (const [id, e] of Object.entries(T.spawn)) if (!EXTRA_SPAWNS[id]) EXTRA_SPAWNS[id] = { ...e };
    Object.assign(STATE_SOUNDS, {
      [SCR]: { windup: [['sw_scr_wind', 'lurker_growl'], 0.8, 1.2], attack: [['lurker_snap', 'hit_flesh'], 0.7, 1.4], rage: [['sw_scr_chirp', 'squeak'], 0.7, 0.7], dead: [['sw_scr_pop', 'creature_death'], 0.8, 1.3], stunned: ['hit_flesh', 0.6, 1.4] },
      [NEST]: { alarm: [['sw_scr_alarm', 'scifi_alarm_soft'], 1, 1], dead: [['glass_break', 'creature_death'], 1, 0.8] },
      [STR]: { boot: [['sw_live_jingle', 'chat_blip'], 1, 1], flee: [['sw_ring_break', 'glass_break'], 1, 1], dead: [['sw_ring_break', 'glass_break'], 0.9, 0.8], stunned: ['hit_flesh', 0.6, 1] },
      [MOD]: { scan: [['sw_mod_lock', 'beep_3'], 0.6, 1], flag: [['sw_mod_flag', 'scifi_alarm_soft'], 1, 1], delete: [['sw_mod_delete', 'impact_punch'], 1, 1], dead: [['power_down', 'creature_death'], 1, 0.9], stunned: ['hit_flesh', 0.6, 0.8] },
    });
    Object.assign(LOOPS, {
      [SCR]: [['walk', 'sw_scr_skitter', 0.16, 1], ['return', 'sw_scr_skitter', 0.2, 0.85], ['rage', 'sw_scr_skitter', 0.3, 1.3]],
      [NEST]: [['idle', 'sw_nest_hum', 0.14, 1], ['alarm', 'sw_nest_hum', 0.3, 1.5]],
      [STR]: [['live', 'sw_live_hum', 0.3, 1]],
      [MOD]: [['walk', 'sw_mod_hum', 0.16, 1], ['scan', 'sw_mod_hum', 0.2, 1.15], ['sweep', 'sw_mod_sweep', 0.4, 1], ['hunt', 'sw_mod_hum', 0.28, 1.3]],
    });
    Object.assign(IDENT, { [SCR]: ['Swarm', 2, HINTS[SCR]], [NEST]: ['Territorial', 1, HINTS[NEST]], [STR]: ['Anomaly', 3, HINTS[STR]], [MOD]: ['Predator', 3, HINTS[MOD]] });
    Object.assign(CREATURE_FLAVOUR, { [SCR]: 'electronic', [NEST]: 'electronic', [STR]: 'electronic', [MOD]: 'electronic' });
    for (const id of C.ALL_IDS) NO_TELL.add(id);   // their emissive tell (lamp / ring / glow) is part of the model
    NO_POSE.add(NEST);
    Object.assign(FIELD_NOTES, NOTES);
  }
  // generic spawners (host.js / director.js -> canSpawnMore -> def.noSpawn): the Streamer and the AutoMod not in the first quota. Scrapers / nest: module only.
  for (const id of [STR, MOD]) {
    const def = CREATURES[id];
    if (def && !Object.getOwnPropertyDescriptor(def, 'noSpawn')?.get) Object.defineProperty(def, 'noSpawn', { enumerable: true, configurable: true, get: () => !gateGame || !C.quotaAllows(id, gateGame.run?.quotaIndex) });
  }
}
