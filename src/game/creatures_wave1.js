// Wave-1 horde creatures: registrations + host behaviours (docs/wave1/horde.md). Everything here runs inside the
// generic CreatureManager.hostUpdate (registerCreature(..., behavior)), so stun, damage, snapshots, XP and the
// balance module's generic scaling apply exactly like for the built-in creatures.
//   zombot       Zombie Account: slow, weak swarm fodder (flow-field pathing indoors, bash closed doors)
//   hs_enforcer  Hit Squad knife: wind-up (0.6 s) -> locked-direction lunge
//   hs_gunner    Hit Squad pistol: laser telegraph (0.8 s) -> shot; keeps distance, reloads in cover
//   hs_leader    Hit Squad leader: barks orders, buffs the squad (faster aim / move), morale breaks when he dies
//   doppel       The Doppel: copies a real crewmate, walks like a player, strikes when close and unobserved
//   collector    skittish loot thief: carries loose scrap to its nest, drops everything when hit
//   janitor      caretaker bot: closes doors, bins dropped tools, mops blood, shoves; hostile only if attacked
//   hoardnest / janitorbin   static props (replicated like webs)
// Host-authoritative AI: Math.random is fine here (entities/creatures.js does the same); world placement that
// peers must agree on is seeded in horde.js.
import * as THREE from 'three';
import { registerCreature, CREATURES, EXTRA_SPAWNS } from './creatures.js';
import { STATE_SOUNDS, LOOPS } from '../entities/creatures.js';
import { ITEMS, registerItem, STORE_ITEMS, isSellable, scrapTableFor } from './items.js';
import { angleDiff, clamp } from '../core/util.js';
import { addTranslations } from '../core/i18n.js';
import { insideShip } from '../world/ship.js';
import { G } from '../physics/physics.js';
import { atReady, atBegin, atStep, atCancel, atShoot, atAiming } from './aimtell.js';   // wave 5: telegraphed aim (aim -> lock -> fire at the locked point)

const rnd = Math.random;
const V = new THREE.Vector3();
export const HORDE_TYPES = new Set(['zombot', 'hs_enforcer', 'hs_gunner', 'hs_leader', 'doppel', 'collector', 'janitor']);
export const SQUAD_TYPES = new Set(['hs_enforcer', 'hs_gunner', 'hs_leader']);
export const MAX_SWARM = 40;
/** host: every live horde creature (horde.js runs death hooks / cleanup off this set) */
export const TRACK = new Set();

// =====================================================================================================
// definitions
// =====================================================================================================
export const DEFS = {
  zombot: {
    name: 'Zombie Account', hp: 18, dmg: 5, walk: 1.0, run: 1.55, power: 0.6, xp: 7, coin: 1, zone: 'out', radius: 0.38, height: 1.55, maxAlive: MAX_SWARM,
    deathText: 'was swarmed by zombie accounts.',
    lore: 'Deactivated accounts that never logged out. Slow, weak, groaning, glitching... one is a joke, a botnet is not. '
      + 'They come in waves at night and when an alarm goes off. Smash them for XP and spare parts. Closed doors hold them for a moment.',
  },
  hs_enforcer: {
    name: 'Enforcer', hp: 80, dmg: 20, walk: 2.0, run: 4.6, power: 0, xp: 90, coin: 18, zone: 'out', radius: 0.36, height: 1.8, noSpawn: true,
    deathText: 'was knifed by a Hit Squad Enforcer.',
    lore: 'Faction muscle with a combat knife. When it crouches and the blade goes back, it is about to lunge in a straight line: sidestep.',
  },
  hs_gunner: {
    name: 'Gunner', hp: 65, dmg: 12, walk: 1.9, run: 3.8, power: 0, xp: 100, coin: 20, zone: 'out', radius: 0.36, height: 1.8, noSpawn: true,
    deathText: 'was shot by a Hit Squad Gunner.',
    lore: 'Keeps its distance and shoots. A laser finds you almost a second before every shot: break line of sight. It has to reload after six rounds.',
  },
  hs_leader: {
    name: 'Squad Leader', hp: 130, dmg: 10, walk: 1.8, run: 3.6, power: 0, xp: 170, coin: 36, zone: 'out', radius: 0.36, height: 1.85, noSpawn: true,
    deathText: 'was executed by a Squad Leader.',
    lore: 'Barks orders over the radio. While it lives the squad aims and moves faster. Take it down first and the rest panic.',
  },
  doppel: {
    name: 'The Doppel', hp: 110, dmg: 26, walk: 1.6, run: 5.0, power: 2, xp: 160, coin: 28, zone: 'in', radius: 0.35, height: 1.8, maxAlive: 1,
    deathText: 'trusted the wrong crewmate.',
    lore: 'It wears a crewmate perfectly: suit, name tag, voice, the way they walk. It opens doors. It tags along. When you are alone and not looking... '
      + 'It cannot fool a camera: photograph it and the picture shows what it really is.',
  },
  collector: {
    name: 'Collector', hp: 55, dmg: 8, walk: 2.2, run: 5.6, power: 0.8, xp: 45, coin: 8, zone: 'in', radius: 0.4, height: 0.95, maxAlive: 2,
    deathText: 'cornered a Collector.',
    lore: 'A skittish pack-rat bot. Steals loose scrap and hauls it to its nest, a pile of stolen loot worth finding. Hit it and it drops everything.',
  },
  janitor: {
    name: 'Janitor Bot', hp: 140, dmg: 18, walk: 1.5, run: 3.4, power: 0.6, xp: 70, coin: 12, zone: 'in', radius: 0.42, height: 1.95, maxAlive: 1,
    deathText: 'was mopped up by the Janitor Bot.',
    lore: 'Keeps the facility tidy: closes the doors you open, bins the tools you drop (check its LOST+FOUND bin), mops up blood. '
      + 'Stand in its way and it shoves you. Harmless... unless you hit it.',
  },
  hoardnest: { name: "Collector's Nest", hp: null, dmg: 0, power: 0, xp: 0, coin: 0, zone: 'in', hazard: true, noSpawn: true, radius: 0.9, height: 0.5, lore: 'Everything the Collector stole. Finders keepers.' },
  janitorbin: { name: 'LOST+FOUND Bin', hp: null, dmg: 0, power: 0, xp: 0, coin: 0, zone: 'in', hazard: true, noSpawn: true, radius: 0.5, height: 1.0, lore: 'Where the Janitor Bot puts your tools.' },
};

// spawn tables (merged by spawnTable() on top of every moon's own table). Soldiers never spawn here: invasions only.
const SPAWNS = {
  collector: { zone: 'in', w: [4, 5, 5, 6], interior: { mansion: 1.4, office: 1.3, backrooms: 1.2, sewer: 1.3, mineshaft: 0.8 } },
  janitor: { zone: 'in', w: [3, 4, 4, 5], interior: { office: 1.6, hospital: 1.6, serverfarm: 1.2, mansion: 1.2, sewer: 0.7, mineshaft: 0.5 } },
  doppel: { zone: 'in', w: [0, 3, 5, 6], interior: { mansion: 1.3, hospital: 1.3 } },
  zombot: { zone: 'out', w: [4, 5, 6, 7] },
};

const PISTOL_MAG = 6;
export const ITEM_DEFS = {
  instacam: { id: 'instacam', name: 'Instant Camera', kind: 'tool', price: 45, weight: 3, hands: 1, charges: 8,
    tip: 'LMB: take a photo. Photos show things as they really are: a Doppel shows up glitched, gets exposed and stunned.' },
  hs_pistol: { id: 'hs_pistol', name: 'Squad Pistol', kind: 'weapon', weight: 4, hands: 1, dmg: 24, cd: 0.32, reach: 32, ranged: true, ammo: PISTOL_MAG, rarity: 'rare', value: [45, 80],
    tip: 'Taken from a Hit Squad. LMB fires. Empty: LMB reloads if you carry a Pistol Magazine.' },
  hs_mag: { id: 'hs_mag', name: 'Pistol Magazine', kind: 'consumable', weight: 1, hands: 1, value: [8, 14] },
};

let registered = false;
/** register creatures, items, sounds, spawn weights and translations (idempotent) */
export function registerWave1Content() {
  if (registered) return;
  registered = true;
  const BEH = { zombot: zombotBehavior, hs_enforcer: soldierBehavior, hs_gunner: soldierBehavior, hs_leader: soldierBehavior, doppel: doppelBehavior, collector: collectorBehavior, janitor: janitorBehavior, hoardnest: idleProp, janitorbin: idleProp };
  for (const [id, def] of Object.entries(DEFS)) if (!CREATURES[id]) registerCreature(id, { ...def }, BEH[id]);
  for (const [id, e] of Object.entries(SPAWNS)) if (!EXTRA_SPAWNS[id]) EXTRA_SPAWNS[id] = e;
  for (const def of Object.values(ITEM_DEFS)) if (!ITEMS[def.id]) registerItem({ ...def });
  if (!STORE_ITEMS.includes('instacam')) STORE_ITEMS.push('instacam');
  Object.assign(STATE_SOUNDS, {
    zombot: { attack: [['voice_zombie_attack', 'scuttler_hiss'], 0.6, 0.9], dead: [['voice_zombie_die', 'scuttler_death'], 0.45], bang: [['impact_punch', 'hit_wall'], 0.6, 0.8] },
    hs_enforcer: { windup: [['voice_skeleton_anger', 'lurker_growl'], 0.9, 1.3], lunge: [['swoosh_2', 'swing_whoosh'], 1.0, 0.9], stunned: ['hit_flesh', 0.6], dead: [['voice_skeleton_die', 'creature_death'], 0.9, 1.2] },
    hs_gunner: { aim: [['beep_3', 'turret_detect'], 0.55, 1.5], reload: [['gun_reload', 'shotgun_reload'], 0.9], dead: [['voice_skeleton_die', 'creature_death'], 0.9, 1.1] },
    hs_leader: { aim: [['beep_3', 'turret_detect'], 0.55, 1.2], reload: [['gun_reload', 'shotgun_reload'], 0.9], dead: [['voice_skeleton_die', 'creature_death'], 1.0, 0.9] },
    doppel: { dead: [['sting_violin_glitch', 'creature_death'], 0.9] },
    collector: { flee: [['voice_rat_scared', 'squeak'], 0.8, 1.3], fly: [['voice_rat_laughing', 'yoinker_yippee'], 0.7, 1.4], attack: [['voice_rat_attack', 'leech_screech'], 0.9], dead: [['voice_rat_die', 'creature_death'], 0.9] },
    janitor: { shove: [['impact_punch', 'hit_flesh'], 0.9], run: [['scifi_alarm_soft', 'turret_detect'], 0.8], attack: [['swoosh_1', 'swing_whoosh'], 1.0, 0.8], dead: [['power_down', 'creature_death'], 1.0] },
  });
  LOOPS.zombot = [];
  LOOPS.janitor = [['rest', 'reel_loop', 0.25, 0.6]];
  addTranslations({
    'Zombie Account': 'Zombi Hesap', Enforcer: 'Tetikçi', Gunner: 'Nişancı', 'Squad Leader': 'Tim Lideri', 'The Doppel': 'Doppel',
    Collector: 'Koleksiyoncu', 'Janitor Bot': 'Hademe Bot', "Collector's Nest": 'Koleksiyoncu Yuvası', 'LOST+FOUND Bin': 'KAYIP EŞYA Kutusu',
    'Instant Camera': 'Anlık Kamera', 'Squad Pistol': 'Tim Tabancası', 'Pistol Magazine': 'Tabanca Şarjörü',
  });
}

// =====================================================================================================
// shared helpers
// =====================================================================================================
const MGR = new WeakMap();   // CreatureManager -> shared host scratch (flow fields, swarm list, door bashing, mopped trails)
function S(M) {
  let s = MGR.get(M);
  if (!s) { s = { fields: new Map(), swarm: [], swarmT: -1, bang: new Map(), nextGroan: 0, mopped: new Set(), moppedFac: null, closed: new Map() }; MGR.set(M, s); }
  return s;
}
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function faceTo(c, x, z, dt, rate) {
  const want = Math.atan2(x - c.pos.x, z - c.pos.z);
  c.yaw += clamp(angleDiff(c.yaw, want), -rate * dt, rate * dt);
}
function track(c) { TRACK.add(c); }
function livePlayers(M, zone) { return M.game.aiPlayers().filter((p) => !p.dead && !p.inShip && (!zone || p.zone === zone)); }
function roam(c, dt, M, radius = 12, idleT = 3, state = 'walk') {
  if (c.state === 'idle') { if (c.t > idleT) { M.wander(c, radius); c.setState(state); } }
  else if (c.state === state) { if (M.follow(c, dt, c.def.walk)) c.setState('idle'); }
  else c.setState('idle');
}
function awayFrom(c, M, x, z, dist = 12) {
  const a = Math.atan2(c.pos.x - x, c.pos.z - z);
  const nav = M.nav(c);
  if (nav) { for (let i = 0; i < 4; i++) { const w = nav.randomWalkable(rnd, c.pos.x + Math.sin(a) * dist, c.pos.z + Math.cos(a) * dist, 4 + i * 2); if (w) { M.goTo(c, w.x, w.z); return; } } }
  M.goTo(c, c.pos.x + Math.sin(a) * dist, c.pos.z + Math.cos(a) * dist);
}
/** bark over the squad radio / creature speaker: floating text + chirp on every peer */
export function bark(c, M, text) { M.game.net.broadcast('fx', { k: 'hbark', id: c.id, t: String(text).slice(0, 40) }); }

/** carry helpers (multi-item, same net messages as the Data Hoarder: holder 'c:<id>') */
function takeItem(c, M, it) {
  (c.data.carry ||= []).push(it.id);
  it.carrier = c.id;
  M.game.net.broadcast('it', { e: 'held', id: it.id, h: 'c:' + c.id, sl: 0 });
}
export function dropAll(c, M, atNest = false, at = null) {
  const list = c.data.carry || [];
  c.data.carry = [];
  const base = at || c.pos;
  list.forEach((id, i) => {
    const it = M.game.items.get(id);
    if (!it) return;
    it.carrier = null;
    const a = rnd() * Math.PI * 2, r = atNest ? 0.3 + rnd() * 0.6 : 0.4 + i * 0.2;
    M.game.net.broadcast('it', { e: 'drop', id, p: [base.x + Math.cos(a) * r, base.y + 0.7 + i * 0.15, base.z + Math.sin(a) * r], q: [0, 0, 0, 1], nest: atNest ? c.id : undefined });
  });
}
function itemPos(it) { return it.obj?.position; }
function nearPlayer(M, pos, r) { for (const p of M.game.aiPlayers()) if (!p.dead && p.pos.distanceTo(pos) < r) return true; return false; }

/** Walk to the facility entrance and switch zone (soldiers / Doppel follow the crew in and out). */
function goThroughEntrance(c, M, dt, speed) {
  const g = M.game, fac = g.world.facility, out = g.world.outdoor;
  if (!fac?.mainDoor?.spawn || !out?.mainExit?.spawn) return false;
  if (c.zone === 'in') {
    const s = fac.mainDoor.spawn;
    if (hd(c.pos, s) < 1.5) {
      const e = out.mainExit.spawn;
      c.zone = 'out'; c.path = null; c.dest = null; c.pos.set(e.x, e.y, e.z); M.placeAt(c, e.x, e.z);
      g.net.broadcast('fx', { k: 'snd', s: 'door_open', p: [e.x, e.y + 1, e.z], v: 0.8 });
      return true;
    }
    c.setState('run'); M.moveToward(c, s, dt, speed);
  } else {
    const e = out.mainExit.spawn;
    if (hd(c.pos, e) < 1.8) {
      const s = fac.mainDoor.spawn;
      c.zone = 'in'; c.path = null; c.dest = null; c.pos.set(s.x, fac.layout.y, s.z);
      g.net.broadcast('fx', { k: 'snd', s: 'door_open', p: [s.x, s.y + 1, s.z], v: 0.8 });
      return true;
    }
    c.setState('run'); M.moveToward(c, e, dt, speed);
  }
  return true;
}
function otherZoneBusy(M, c) { return livePlayers(M).some((p) => p.zone !== c.zone); }

function idleProp(c) { if (c.state !== 'idle') c.setState('idle'); }

// =====================================================================================================
// ZOMBIE ACCOUNT swarm
// =====================================================================================================
const NB8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function flowField(M, p) {
  const s = S(M), nav = M.game.world.facility?.nav;
  if (!nav || typeof nav.distanceField !== 'function') return null;
  const now = M.game.time || 0;
  let f = s.fields.get(p.id);
  const age = f ? now - f.t : 99;
  if (!f || f.nav !== nav || (age > 1.0 && Math.hypot(f.x - p.pos.x, f.z - p.pos.z) > 1.5) || age > 5) {
    f = { nav, t: now, x: p.pos.x, z: p.pos.z, field: nav.distanceField(p.pos.x, p.pos.z, 80) };
    s.fields.set(p.id, f);
  }
  return f;
}
function flowStep(nav, field, x, z) {
  let [gx, gz] = nav.toGrid(x, z);
  if (!nav.isWalkable(gx, gz)) { const n = nav.nearestWalkable(gx, gz, 2); if (!n) return null; return nav.toWorld(n[0], n[1]); }
  const W = nav.w;
  let best = field[gz * W + gx], bx = -1, bz = -1;
  for (const [dx, dz] of NB8) {
    const nx = gx + dx, nz = gz + dz;
    if (!nav.inside(nx, nz)) continue;
    const v = field[nz * W + nx];
    if (!(v < best)) continue;
    if (dx && dz) { if (!nav.canStep(gx, gz, nx, gz) || !nav.canStep(gx, gz, gx, nz) || !nav.canStep(nx, gz, nx, nz) || !nav.canStep(gx, nz, nx, nz)) continue; }
    else if (!nav.canStep(gx, gz, nx, nz)) continue;
    best = v; bx = nx; bz = nz;
  }
  return bx < 0 ? null : nav.toWorld(bx, bz);
}
function swarmList(M) {
  const s = S(M), now = M.game.time || 0;
  if (s.swarmT !== now) {
    s.swarmT = now;
    s.swarm.length = 0;
    for (const c of M.host.values()) if (c.type === 'zombot' && !c.dead) s.swarm.push(c);
  }
  return s.swarm;
}
export function countSwarm(M) { let n = 0; for (const c of M.host.values()) if (c.type === 'zombot' && !c.dead) n++; return n; }

/** spawn one Zombie Account (host). opts.data.wave = wave id (hunts the crew) */
export function spawnZombot(M, pos, opts = {}) {
  if (countSwarm(M) >= MAX_SWARM) return null;
  const zone = opts.zone || (pos.y < -200 ? 'in' : 'out');
  const c = M.hostSpawn('zombot', pos, { level: opts.level || 1, elite: false, zone, variant: null, affix: null, state: opts.state || 'idle', yaw: rnd() * Math.PI * 2, data: { grouped: true, ...(opts.data || {}) } });
  if (c) { M.placeAt(c, c.pos.x, c.pos.z); track(c); }
  return c;
}

export function zombotBehavior(c, dt, M) {
  const d = c.data, g = M.game, s = S(M), now = g.time || 0;
  if (!d.init) {
    d.init = 1; track(c);
    d.think = rnd() * 0.4; d.spd = 0.85 + rnd() * 0.35; d.doorT = rnd() * 0.4;
    // a single zombie from the generic outdoor spawn calls its pack
    if (!d.grouped) { d.grouped = true; const n = 2 + ((rnd() * 3) | 0); for (let k = 0; k < n; k++) spawnZombot(M, V.set(c.pos.x + (rnd() - 0.5) * 5, c.pos.y, c.pos.z + (rnd() - 0.5) * 5).clone(), { level: c.level, zone: c.zone }); }
    if (d.wave) c.setState('run');
  }
  if (c.age < 0.85) return;   // digging out of the ground
  const list = swarmList(M);
  // target selection (throttled)
  d.think -= dt;
  const players = M.playersFor(c).filter((p) => !p.inShip);
  let tgt = c.target ? players.find((p) => p.id === c.target) || null : null;
  if (d.think <= 0) {
    d.think = 0.3 + rnd() * 0.3;
    const hunting = !!d.wave || !!d.hunt;
    const n = M.nearest(c, players, hunting ? 400 : 18);
    if (n && (hunting || n.d < 5 || (tgt && n.d < 24) || M.canSee(c, n.p, 16, 150) || (M.hear(c, 9)?.owner === n.p.id))) { tgt = n.p; c.target = n.p.id; }
    else if (!hunting) { tgt = null; c.target = null; }
  }
  // groans: one voice at a time across the whole swarm
  if (now >= s.nextGroan && tgt && rnd() < dt * 3) { s.nextGroan = now + 0.7 + rnd() * 1.1; M.sound(c, ['voice_zombie_grunt', 'voice_zombie_anger', 'scuttler_hiss'], 0.55, 3, 0.75 + rnd() * 0.45, 34); }
  if (c.state === 'attack') {
    if (!d.hit && c.t >= 0.38) {
      d.hit = true;
      const p = tgt || g.aiPlayerById(c.target);
      if (p && !p.dead && p.pos.distanceTo(c.pos) < 1.6 && Math.abs(p.pos.y - c.pos.y) < 2) M.attack(c, p, c.dmg, 'zombot');
    }
    if (c.t > 0.8) c.setState(tgt ? 'run' : 'idle');
    return;
  }
  // bash closed doors (indoors): the door gives after ~2 s of zombies pounding on it
  if (c.zone === 'in') {
    d.doorT -= dt;
    if (c.state === 'bang') {
      const door = g.doorById?.(d.door);
      if (!door || door.open) { c.setState(tgt ? 'run' : 'idle'); return; }
      const b = (s.bang.get(door.id) || 0) + dt;
      s.bang.set(door.id, b);
      if (b > 2.2) { s.bang.delete(door.id); g.hostSetDoor(door.id, true); g.net.broadcast('fx', { k: 'snd', s: 'impact_metal_1', p: [door.pos.x, door.pos.y + 1, door.pos.z], v: 1, r: 4 }); }
      if (c.t > 0.6) { c.t = 0; M.sound(c, ['impact_punch', 'hit_wall'], 0.5, 3, 0.7 + rnd() * 0.3, 30); }
      return;
    }
    if (d.doorT <= 0 && tgt) {
      d.doorT = 0.35;
      for (const door of g.world.facility?.doors || []) {
        if (door.open || door.locked || door.kind !== 'door') continue;
        if (door.pos.distanceToSquared(c.pos) < 1.3 * 1.3 && Math.abs(door.pos.y - c.pos.y) < 2) { d.door = door.id; c.setState('bang'); return; }
      }
    }
  }
  if (!tgt) { roam(c, dt, M, 8, 2 + rnd() * 3); return; }
  const dist = tgt.pos.distanceTo(c.pos);
  if (dist < 1.15 && c.cooldown <= 0 && Math.abs(tgt.pos.y - c.pos.y) < 2) {
    c.yaw = Math.atan2(tgt.pos.x - c.pos.x, tgt.pos.z - c.pos.z);
    c.setState('attack'); d.hit = false; c.cooldown = 1.2;
    return;
  }
  c.setState('run');
  // steering target: flow field indoors (one Dijkstra per hunted player, shared by the swarm), straight line outdoors
  let tx = tgt.pos.x, tz = tgt.pos.z;
  const nav = M.nav(c);
  if (nav && dist > 1.6) {
    const f = flowField(M, tgt);
    if (f) {
      d.wpT = (d.wpT || 0) - dt;
      if (!d.wp || d.wpT <= 0 || hd(c.pos, d.wp) < 0.3) { d.wp = flowStep(nav, f.field, c.pos.x, c.pos.z); d.wpT = 0.45; }
      if (d.wp) { tx = d.wp.x; tz = d.wp.z; }
    }
  }
  let dx = tx - c.pos.x, dz = tz - c.pos.z;
  const L = Math.hypot(dx, dz) || 1;
  const sp = c.def.run * d.spd * (d.speedMul || 1);
  dx = (dx / L) * sp; dz = (dz / L) * sp;
  // separation (bodies spread out instead of stacking)
  let sx = 0, sz = 0;
  for (const o of list) {
    if (o === c || o.zone !== c.zone) continue;
    const ox = c.pos.x - o.pos.x, oz = c.pos.z - o.pos.z, d2 = ox * ox + oz * oz;
    if (d2 > 0.5 || d2 < 1e-6) continue;
    const dd = Math.sqrt(d2), k = (0.72 - dd) / dd;
    sx += ox * k; sz += oz * k;
  }
  let nx = c.pos.x + (dx + sx * 2.2) * dt, nz = c.pos.z + (dz + sz * 2.2) * dt;
  if (nav && !nav.walkableAt(nx, nz)) { nx = c.pos.x + dx * dt; nz = c.pos.z + dz * dt; if (!nav.walkableAt(nx, nz)) { d.wp = null; return; } }
  const want = Math.atan2(dx, dz);
  c.yaw += clamp(angleDiff(c.yaw, want), -5 * dt, 5 * dt);
  M.placeAt(c, nx, nz);
}

// =====================================================================================================
// HIT SQUAD
// =====================================================================================================
let squadSeq = 0;
export function newSquad(faction = 0) {
  return { id: ++squadSeq, faction, members: new Set(), leader: null, contact: null, sweep: null, sweepT: 0, barkT: 4, leaderDown: false, announced: false };
}
const BARKS = {
  contact: ['CONTACT!', 'EYES ON TARGET!', 'THERE! OPEN FIRE!'],
  sweep: ['SWEEP THE ROOMS.', 'CHECK EVERY CORNER.', 'THEY ARE IN HERE SOMEWHERE.', 'STAY SHARP.'],
  push: ['FLANK LEFT!', 'PUSH! PUSH!', 'SUPPRESSING!', 'CUT THEM OFF!'],
  reload: ['RELOADING!', 'COVER ME!'],
  down: ['LEADER DOWN!', 'MAN DOWN!', 'FALL BACK!'],
};
const pick = (a) => a[(rnd() * a.length) | 0];

function sweepPoint(sq, c, M) {
  const g = M.game, now = g.time || 0;
  sq.sweepT = now + 18 + rnd() * 10;
  const players = livePlayers(M, c.zone);
  const near = M.nearest(c, players);
  if (c.zone === 'in') {
    const fac = g.world.facility, L = fac?.layout, nav = fac?.nav;
    if (!L?.rooms?.length || !nav) { sq.sweep = null; return; }
    const C = L.cell;
    const rooms = L.rooms.filter((r) => r.type !== 'vault');
    const centers = rooms.map((r) => ({ x: L.ox + (r.x + r.w / 2) * C, z: L.oz + (r.z + r.h / 2) * C }));
    let choice = null;
    if (near) {
      // they hunt the crew: usually the room of (or next to) the nearest player
      const byDist = centers.map((p) => ({ p, d: Math.hypot(p.x - near.p.pos.x, p.z - near.p.pos.z) })).sort((a, b) => a.d - b.d);
      choice = byDist[Math.min(byDist.length - 1, rnd() < 0.45 ? 0 : 1 + ((rnd() * 3) | 0))].p;
    } else choice = centers[(rnd() * centers.length) | 0];
    const w = nav.nearestWalkable(...nav.toGrid(choice.x, choice.z), 5);
    sq.sweep = w ? { ...nav.toWorld(w[0], w[1]), zone: 'in' } : null;
  } else {
    const base = near ? near.p.pos : c.pos;
    const a = rnd() * Math.PI * 2, r = near ? 6 + rnd() * 12 : 15 + rnd() * 20;
    sq.sweep = { x: base.x + Math.cos(a) * r, z: base.z + Math.sin(a) * r, zone: 'out' };
  }
}
function findCover(c, M, from) {
  const nav = M.nav(c);
  if (!nav || !from) return null;
  const g = M.game, y = c.pos.y + 1.4;
  let best = null, bd = 1e9;
  for (let i = 0; i < 12; i++) {
    const w = nav.randomWalkable(rnd, c.pos.x, c.pos.z, 7);
    if (!w) continue;
    const dd = Math.hypot(w.x - c.pos.x, w.z - c.pos.z);
    if (dd < 1.5 || dd > bd) continue;
    if (g.physics.lineOfSight(V.set(w.x, y, w.z), from)) continue;
    best = w; bd = dd;
  }
  return best;
}

function gunFire(c, M, p, leaderUp) {
  const g = M.game, d = c.data;
  d.ammo = (d.ammo ?? PISTOL_MAG) - 1;
  c.setState('fire'); c.extra = 0;
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  const muzzle = { x: c.pos.x + fx * 0.5 - fz * 0.12, y: c.pos.y + 1.42, z: c.pos.z + fz * 0.5 + fx * 0.12 };
  // wave 5 (aimtell): the bullet flies to the point locked 0.25 s ago; distance / sprint / cover / early-quota accuracy lives in aimtell_core.js;
  // the squad leader alive makes the squad a bit sharper, the 2-4 s cooldown is set by aimtell
  atShoot(c, M, p, { muzzle, dmg: c.dmg, cause: c.type, accMul: leaderUp ? 1.12 : 1 });
  void g;
}

export function soldierBehavior(c, dt, M) {
  const d = c.data, g = M.game, now = g.time || 0;
  const sq = d.squad || (d.squad = newSquad(d.faction || 0));
  if (!d.init) {
    d.init = 1; track(c);
    sq.members.add(c.id);
    if (c.type === 'hs_leader') sq.leader = c.id;
    d.ammo = PISTOL_MAG; d.perceiveT = rnd() * 0.3;
    d.offset = { x: (rnd() - 0.5) * 5, z: (rnd() - 0.5) * 5 };
    c.setState('patrol');
  }
  const leader = sq.leader ? M.host.get(sq.leader) : null;
  const leaderUp = !!leader && !leader.dead;
  const buff = leaderUp && c.type !== 'hs_leader' ? 1.15 : 1;
  const st = c.state;
  if (st !== 'aim') { c.extra = 0; if (atAiming(c)) atCancel(c, M); }   // interrupted (hit, fled, reload): drop the aim + release the group slot
  // ---- committed actions
  if (st === 'windup') {
    const p = g.aiPlayerById(c.target);
    if (p) faceTo(c, p.pos.x, p.pos.z, dt, 7);
    if (c.t >= (leaderUp ? 0.48 : 0.6)) { d.lx = Math.sin(c.yaw); d.lz = Math.cos(c.yaw); d.hit = false; c.setState('lunge'); }
    return;
  }
  if (st === 'lunge') {
    const nx = c.pos.x + d.lx * 8.5 * dt, nz = c.pos.z + d.lz * 8.5 * dt;
    const nav = M.nav(c);
    if (!nav || nav.walkableAt(nx, nz)) M.placeAt(c, nx, nz); else c.t = 99;
    if (!d.hit) for (const p of M.playersFor(c)) if (p.pos.distanceTo(c.pos) < 1.35 && Math.abs(p.pos.y - c.pos.y) < 2) { d.hit = true; M.attack(c, p, c.dmg, c.type); break; }
    if (c.t >= 0.32) c.setState('recover');
    return;
  }
  if (st === 'recover') { if (c.t > 0.7) c.setState('run'); return; }
  if (st === 'aim') {
    const p = g.aiPlayerById(c.target);
    if (!p || p.dead || p.inShip || p.zone !== c.zone) { atCancel(c, M); c.extra = 0; c.setState('run'); return; }
    const ev = atStep(c, dt, M, p, { face: (q) => faceTo(c, p.pos.x, p.pos.z, q, 6) });   // aim (laser synced through c.extra) -> lock -> fire
    if (ev === 'fire') gunFire(c, M, p, leaderUp);
    return;
  }
  if (st === 'fire') { if (c.t > 0.25) c.setState('run'); return; }
  if (st === 'reload') { if (c.t > 2.2) { d.ammo = PISTOL_MAG; c.setState('run'); } return; }
  if (st === 'bark') { if (c.t > 0.9) c.setState('run'); return; }
  if (d.fleeT > 0) { d.fleeT -= dt; c.setState('flee'); if (!c.path || M.follow(c, dt, c.def.run)) d.fleeT = 0; return; }
  // ---- perception
  d.perceiveT -= dt;
  if (d.perceiveT <= 0) {
    d.perceiveT = 0.25 + rnd() * 0.15;
    let seen = null, bd = 1e9;
    for (const p of M.playersFor(c)) {
      if (p.inShip) continue;
      const dd = p.pos.distanceTo(c.pos);
      if (dd < bd && M.canSee(c, p, 26, 150)) { bd = dd; seen = p; }
    }
    d.seen = seen ? seen.id : null;
    if (seen) {
      sq.contact = { pid: seen.id, pos: seen.pos.clone(), t: now, zone: c.zone };
      if (!sq.announced || now - (sq.lastContactBark || 0) > 20) { sq.announced = true; sq.lastContactBark = now; bark(c, M, pick(BARKS.contact)); }
    } else {
      const n = M.hear(c, 20);
      if (n && (!sq.contact || now - sq.contact.t > 3)) sq.contact = { pid: n.owner || null, pos: n.pos.clone(), t: now, zone: c.zone, heard: true };
    }
    if (d.hitBy) {
      const a = g.aiPlayerById(d.hitBy);
      if (a) { sq.contact = { pid: a.id, pos: a.pos.clone(), t: now, zone: a.zone }; if (c.type !== 'hs_enforcer' && rnd() < 0.4) d.cover = findCover(c, M, a.eye); }
      d.hitBy = null;
    }
  }
  if (sq.contact && now - sq.contact.t > 25) sq.contact = null;
  // leader: orders
  if (c.type === 'hs_leader') {
    sq.barkT -= dt;
    if (sq.barkT <= 0) { sq.barkT = 7 + rnd() * 6; bark(c, M, pick(sq.contact ? BARKS.push : BARKS.sweep)); if (sq.contact && !d.seen) { c.setState('bark'); return; } }
  }
  // ---- follow the crew between the facility and the outside
  const inZone = M.playersFor(c).some((p) => !p.inShip);
  d.emptyT = inZone ? 0 : (d.emptyT || 0) + dt;
  if (d.emptyT > 6 && otherZoneBusy(M, c)) { goThroughEntrance(c, M, dt, c.def.run * buff); return; }
  // ---- cover (gunners, after a hit or to reload)
  if (d.cover) {
    c.setState('run');
    if (M.moveToward(c, V.set(d.cover.x, c.pos.y, d.cover.z).clone(), dt, c.def.run * buff) || hd(c.pos, d.cover) < 0.6 || c.t > 5) { d.cover = null; if (d.ammo <= 0) { d.coverTried = false; c.setState('reload'); bark(c, M, pick(BARKS.reload)); } }
    return;
  }
  const tgt = d.seen ? g.aiPlayerById(d.seen) : null;
  // empty magazine: reload behind cover when there is some, else right here
  if (c.type !== 'hs_enforcer' && d.ammo <= 0) {
    if (tgt && !d.coverTried) { d.coverTried = true; d.cover = findCover(c, M, tgt.eye); if (d.cover) return; }
    d.coverTried = false; c.setState('reload'); bark(c, M, pick(BARKS.reload)); return;
  }
  if (tgt) {
    const dist = tgt.pos.distanceTo(c.pos);
    c.target = tgt.id;
    if (c.type === 'hs_enforcer') {
      if (dist < 4.2 && c.cooldown <= 0 && Math.abs(tgt.pos.y - c.pos.y) < 2) { c.setState('windup'); c.cooldown = 2.4; return; }
      c.setState('run');
      M.moveToward(c, tgt.pos, dt, c.def.run * buff);
      return;
    }
    // gunner / leader: keep distance, shoot with a laser telegraph, reload in cover
    const minR = c.type === 'hs_leader' ? 7 : 5, maxR = c.type === 'hs_leader' ? 17 : 14;
    if (dist < minR) {
      if (c.state !== 'run' || !c.path || c.t > 1.2) { awayFrom(c, M, tgt.pos.x, tgt.pos.z, 6); c.setState('run'); }
      M.follow(c, dt, c.def.run * buff);
      return;
    }
    if (dist > maxR) { c.setState('run'); M.moveToward(c, tgt.pos, dt, c.def.run * buff); return; }
    if (atReady(c, M) && atBegin(c, M, tgt, { state: 'aim', mul: leaderUp && c.type !== 'hs_leader' ? 0.9 : 1 })) return;   // group limit: 1-2 shooters aim at once
    if (c.state !== 'idle') c.setState('idle');
    faceTo(c, tgt.pos.x, tgt.pos.z, dt, 5);
    return;
  }
  // ---- converge on the last contact / noise, else sweep rooms
  const ct = sq.contact && sq.contact.zone === c.zone ? sq.contact : null;
  if (ct) {
    c.setState('run');
    const goal = V.set(ct.pos.x + d.offset.x * 0.5, c.pos.y, ct.pos.z + d.offset.z * 0.5).clone();
    if (M.moveToward(c, goal, dt, c.def.run * 0.85 * buff) || hd(c.pos, goal) < 1.2) { if (ct.heard || now - ct.t > 6) sq.contact = null; }
    return;
  }
  if (!sq.sweep || sq.sweep.zone !== c.zone || now > sq.sweepT) sweepPoint(sq, c, M);
  if (!sq.sweep) { roam(c, dt, M, 12, 2, 'patrol'); return; }
  c.setState('patrol');
  const goal = V.set(sq.sweep.x + d.offset.x, c.pos.y, sq.sweep.z + d.offset.z).clone();
  if (M.moveToward(c, goal, dt, c.def.walk * buff) || hd(c.pos, goal) < 1.5) sq.sweepT = Math.min(sq.sweepT, now + 1.5 + rnd() * 2);
}

// =====================================================================================================
// THE DOPPEL
// =====================================================================================================
function pickVictim(c, M) {
  const ps = M.game.aiPlayers().filter((p) => !p.dead);
  const v = ps.length ? ps[(rnd() * ps.length) | 0] : null;
  c.data.victim = v ? v.id : null;
}
function crewNear(M, p, r) { let n = 0; for (const q of M.game.aiPlayers()) if (q.id !== p.id && !q.dead && q.pos.distanceTo(p.pos) < r) n++; return n; }

export function doppelBehavior(c, dt, M) {
  const d = c.data, g = M.game, now = g.time || 0;
  if (!d.init) { d.init = 1; track(c); c.affix = null; pickVictim(c, M); d.voiceT = 4 + rnd() * 6; d.huntT = 0; c.setState('idle'); }
  if (!d.victim || !g.aiPlayerById(d.victim)) pickVictim(c, M);
  c.extra = (d.revealed ? 'R:' : '') + (d.victim || '');
  const players = M.playersFor(c).filter((p) => !p.inShip);
  // it talks with the victim's recorded voice (voice.js skinwalker clips)
  d.voiceT -= dt;
  if (d.voiceT <= 0) {
    d.voiceT = 9 + rnd() * 13;
    if (!d.revealed && M.nearest(c, players, 26)) g.net.broadcast('fx', { k: 'hdvoice', id: c.id, clip: d.victim || null });
  }
  if (c.state === 'attack') {
    if (!d.hit && c.t >= 0.32) {
      d.hit = true;
      const p = g.aiPlayerById(c.target);
      if (p && !p.dead && p.pos.distanceTo(c.pos) < 1.9) { M.attack(c, p, c.dmg, 'doppel'); d.huntT = 6; }
    }
    if (c.t > 0.6) c.setState('run');
    return;
  }
  const n = M.nearest(c, players, 45);
  if (!n) {
    d.emptyT = (d.emptyT || 0) + dt;
    if (d.emptyT > 10 && otherZoneBusy(M, c)) { goThroughEntrance(c, M, dt, c.def.walk * 1.6); return; }
    roam(c, dt, M, 14, 3); return;
  }
  d.emptyT = 0;
  const p = n.p;
  c.target = p.id;
  const observed = players.some((q) => M.isLookedAt(c, q, 24, 0.86));
  // exposed (photographed) or already struck: hostile chase
  d.huntT = Math.max(0, d.huntT - dt);
  if (d.revealed || d.huntT > 0) {
    if (n.d < 1.4 && c.cooldown <= 0) { c.yaw = Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z); d.hit = false; c.setState('attack'); c.cooldown = 1.1; return; }
    c.setState('run');
    M.moveToward(c, p.pos, dt, c.def.run);
    return;
  }
  // disguised: tag along like a crewmate; strike only when close, the victim is alone and nobody is looking
  const alone = crewNear(M, p, 8) === 0;
  if (n.d < 1.6 && !observed && alone && c.cooldown <= 0 && c.age > 4) { c.yaw = Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z); d.hit = false; c.setState('attack'); c.cooldown = 1.4; return; }
  if (observed) {
    // act natural: stop and look back, or wander off casually
    if (n.d < 3.5) { if (c.state !== 'idle') c.setState('idle'); faceTo(c, p.pos.x, p.pos.z, dt, 3); return; }
    if (c.state === 'walk' && c.path) { M.follow(c, dt, c.def.walk); return; }
    if (c.state !== 'idle' || c.t > 2.5) { if (rnd() < 0.5) { M.wander(c, 6); c.setState('walk'); } else c.setState('idle'); }
    return;
  }
  if (alone) {   // stalk from behind at a jog
    const behind = p.pos.clone().addScaledVector(p.look.clone().setY(0).normalize(), -1.1);
    c.setState('walk');
    M.moveToward(c, n.d > 6 ? p.pos : behind, dt, n.d > 6 ? c.def.walk * 2 : c.def.walk * 1.7);
    return;
  }
  // with the group: follow at a teammate's distance
  if (n.d > 6) { c.setState('walk'); M.moveToward(c, p.pos, dt, c.def.walk * 1.3); }
  else if (c.state !== 'idle') c.setState('idle');
}

// =====================================================================================================
// COLLECTOR
// =====================================================================================================
function pickNestSpot(c, M) {
  const fac = M.game.world.facility, L = fac?.layout, nav = fac?.nav;
  const door = fac?.mainDoor?.pos;
  if (L?.rooms?.length && nav) {
    const C = L.cell;
    const rooms = L.rooms.filter((r) => !['entrance', 'vault', 'generator'].includes(r.type));
    for (let i = 0; i < 16 && rooms.length; i++) {
      const r = rooms[(rnd() * rooms.length) | 0];
      const x = L.ox + (r.x + 0.5 + rnd() * Math.max(0, r.w - 1)) * C, z = L.oz + (r.z + 0.5 + rnd() * Math.max(0, r.h - 1)) * C;
      const w = nav.nearestWalkable(...nav.toGrid(x, z), 3);
      if (!w) continue;
      const p = nav.toWorld(w[0], w[1]);
      if (door && Math.hypot(p.x - door.x, p.z - door.z) < 14) continue;
      return new THREE.Vector3(p.x, L.y, p.z);
    }
  }
  return c.home.clone();
}
function weightedScrap(theme) {
  const t = scrapTableFor(theme).filter(([id]) => ITEMS[id] && ITEMS[id].kind === 'scrap');
  let tot = 0; for (const [, w] of t) tot += w;
  let r = rnd() * tot;
  for (const [id, w] of t) { r -= w; if (r <= 0) return id; }
  return t[0]?.[0] || 'bolt';
}
function stealable(it, c, M) {
  if (it.state !== 'world' || it.owner || it.carrier || it.holder || it.type === 'body' || it.def.kind === 'big' || !isSellable(it.def) || it.soulbound) return false;
  const p = itemPos(it);
  if (!p || insideShip(p) || Math.abs(p.y - c.pos.y) > 3) return false;
  if (c.data.nest && hd(p, c.data.nest) < 2.6) return false;   // already in the pile
  return !nearPlayer(M, p, 2.5);
}
export function collectorBehavior(c, dt, M) {
  const d = c.data, g = M.game, now = g.time || 0;
  if (!d.init) {
    d.init = 1; track(c); d.carry = []; d.searchT = 1 + rnd();
    d.nest = pickNestSpot(c, M);
    const nest = M.hostSpawn('hoardnest', d.nest.clone(), { zone: 'in', state: 'idle', variant: null, affix: null, yaw: rnd() * 6.28 });
    d.nestId = nest?.id || null;
    // the pile already holds a little stolen loot
    const theme = g.world.facility?.layout?.theme;
    const vm = 1 + (g.run?.quotaIndex || 0) * 0.08;
    for (let i = 0, n = 1 + ((rnd() * 3) | 0); i < n; i++) g.items.hostSpawn(weightedScrap(theme), new THREE.Vector3(d.nest.x + (rnd() - 0.5) * 1.2, d.nest.y + 0.7, d.nest.z + (rnd() - 0.5) * 1.2), { valueMul: vm });
    c.setState('idle');
  }
  const players = M.playersFor(c).filter((p) => !p.inShip);
  // hit: drops everything and bolts; the third hit in a row corners it (it bites back)
  if (d.hitBy) {
    const by = g.aiPlayerById(d.hitBy);
    d.hitBy = null;
    if (d.carry.length) { dropAll(c, M, false); M.sound(c, ['voice_rat_hurt', 'creature_hurt'], 0.9, 3, 1.3); }
    d.hits = now - (d.lastHit || -99) < 4 ? (d.hits || 0) + 1 : 1; d.lastHit = now;
    if (by && d.hits >= 3 && by.pos.distanceTo(c.pos) < 2 && c.cooldown <= 0) { c.target = by.id; c.setState('attack'); d.bit = false; c.cooldown = 1.2; return; }
    if (by) awayFrom(c, M, by.pos.x, by.pos.z, 12);
    c.setState('flee'); d.fleeT = 3;
    return;
  }
  const st = c.state;
  if (st === 'attack') {
    if (!d.bit && c.t > 0.25) { d.bit = true; const p = g.aiPlayerById(c.target); if (p && p.pos.distanceTo(c.pos) < 1.7) M.attack(c, p, c.dmg, 'collector'); }
    if (c.t > 0.6) { const p = g.aiPlayerById(c.target); if (p) awayFrom(c, M, p.pos.x, p.pos.z, 12); c.setState('flee'); d.fleeT = 2.5; }
    return;
  }
  if (st === 'home') { if (c.t > 0.9) c.setState('idle'); return; }
  if (st === 'flee') { d.fleeT -= dt; if (M.follow(c, dt, c.def.run) || d.fleeT <= 0) c.setState(d.carry.length ? 'fly' : 'idle'); return; }
  // skittish: backs off from anyone who gets close
  d.fleeCd = Math.max(0, (d.fleeCd || 0) - dt);
  const n = M.nearest(c, players, 6);
  if (n && n.d < 4.2 && d.fleeCd <= 0) { awayFrom(c, M, n.p.pos.x, n.p.pos.z, 10); c.setState('flee'); d.fleeT = 2; d.fleeCd = 2.5; return; }
  // carrying: grab one more if it is right here, then run home
  if (d.carry.length) {
    if (d.carry.length < 2 && !d.second) {
      d.second = true;
      for (const it of g.items.all()) { const p = itemPos(it); if (p && p.distanceTo(c.pos) < 3 && stealable(it, c, M)) { takeItem(c, M, it); break; } }
    }
    if (st !== 'fly') c.setState('fly');
    if (M.moveToward(c, d.nest, dt, c.def.run * 0.75) || hd(c.pos, d.nest) < 1.3) {
      if (hd(c.pos, d.nest) < 2) { dropAll(c, M, true, d.nest); c.setState('home'); M.sound(c, ['voice_rat_laughing', 'yoinker_yippee'], 0.8, 3, 1.3); d.second = false; }
    }
    return;
  }
  if (d.want) {
    const it = g.items.get(d.want);
    if (!it || !stealable(it, c, M)) { d.want = null; c.setState('idle'); return; }
    if (itemPos(it).distanceTo(c.pos) < 1.3) { takeItem(c, M, it); d.want = null; M.sound(c, ['pickup_2', 'item_pickup'], 0.8, 3, 1.4); return; }
    c.setState('walk');
    if (M.moveToward(c, itemPos(it), dt, c.def.walk)) d.want = null;
    return;
  }
  d.searchT -= dt;
  if (d.searchT <= 0) {
    d.searchT = 2 + rnd();
    let best = null, bd = 26;
    for (const it of g.items.all()) {
      const p = itemPos(it);
      if (!p) continue;
      const dd = p.distanceTo(c.pos);
      if (dd < bd && stealable(it, c, M) && !(d.bad || []).includes(it.id)) { bd = dd; best = it; }
    }
    if (best) { d.want = best.id; M.goTo(c, itemPos(best).x, itemPos(best).z); if (!c.path) { (d.bad ||= []).push(best.id); d.want = null; } else { c.setState('walk'); return; } }
  }
  roam(c, dt, M, 12, 2.5);
}

// =====================================================================================================
// JANITOR BOT
// =====================================================================================================
const TOOL_KINDS = new Set(['tool', 'weapon', 'consumable', 'component']);
function binnable(it, c, M) {
  if (it.state !== 'world' || it.owner || it.carrier || it.holder || it.soulbound || it.type === 'body' || !TOOL_KINDS.has(it.def.kind)) return false;
  const p = itemPos(it);
  if (!p || insideShip(p) || Math.abs(p.y - c.pos.y) > 3) return false;
  if (hd(p, c.data.bin) < 2) return false;
  return !nearPlayer(M, p, 3);
}
function janitorTask(c, M) {
  const d = c.data, g = M.game, s = S(M), now = g.time || 0;
  const fac = g.world.facility;
  if (s.moppedFac !== fac) { s.moppedFac = fac; s.mopped.clear(); s.closed.clear(); }
  // 1) dropped tools -> bin
  let best = null, bd = 22;
  for (const it of g.items.all()) { const p = itemPos(it); if (!p) continue; const dd = p.distanceTo(c.pos); if (dd < bd && binnable(it, c, M)) { bd = dd; best = it; } }
  if (best) return { k: 'tool', id: best.id };
  // 2) doors somebody left open (not while a player stands in them; a door re-opened after it closed it is left alone)
  let door = null; bd = 22;
  for (const dr of fac?.doors || []) {
    if (!dr.open || dr.locked || dr.kind !== 'door' || dr.teleport) continue;
    if (now - (s.closed.get(dr.id) || -999) < 45) continue;
    const dd = dr.pos.distanceTo(c.pos);
    if (dd < bd && Math.abs(dr.pos.y - c.pos.y) < 3 && !nearPlayer(M, dr.pos, 3)) { bd = dd; door = dr; }
  }
  if (door) return { k: 'door', id: door.id };
  // 3) blood trails
  const trails = fac?.setPieces?.trails || [];
  for (let i = 0; i < trails.length; i++) {
    if (s.mopped.has(i)) continue;
    const t = trails[i];
    if (Math.hypot(t.from[0] - c.pos.x, t.from[1] - c.pos.z) < 30) return { k: 'mop', i, from: t.from, to: t.to };
  }
  return null;
}
export function janitorBehavior(c, dt, M) {
  const d = c.data, g = M.game, s = S(M), now = g.time || 0;
  if (!d.init) {
    d.init = 1; track(c); d.carry = []; d.hostile = 0; d.taskT = 0.5;
    const nav = M.nav(c);
    const w = nav?.randomWalkable(rnd, c.pos.x, c.pos.z, 2);
    d.bin = w ? new THREE.Vector3(w.x, c.pos.y, w.z) : c.home.clone();
    const bin = M.hostSpawn('janitorbin', d.bin.clone(), { zone: 'in', state: 'idle', variant: null, affix: null, yaw: rnd() * 6.28 });
    d.binId = bin?.id || null;
    c.setState('idle');
  }
  if (d.hitBy) {
    if (d.hostile <= 0) { bark(c, M, pick(['VIOLATION LOGGED.', 'THAT IS NOT VERY TIDY.', 'INITIATING CLEANUP.'])); M.noise(c.pos, 2); }
    d.foe = d.hitBy; d.hitBy = null; d.hostile = 25; d.task = null;
    if (d.carry.length) dropAll(c, M, false);
  }
  d.hostile = Math.max(0, d.hostile - dt);
  const st = c.state;
  if (st === 'attack') {
    if (!d.hit && c.t >= 0.45) { d.hit = true; const p = g.aiPlayerById(c.target); if (p && p.pos.distanceTo(c.pos) < 2.2 && Math.abs(angleDiff(c.yaw, Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z))) < 1.2) M.attack(c, p, c.dmg, 'janitor'); }
    if (c.t > 0.9) c.setState('run');
    return;
  }
  if (d.hostile > 0) {
    const players = M.playersFor(c).filter((p) => !p.inShip);
    const p = players.find((q) => q.id === d.foe) || M.nearest(c, players, 20)?.p;
    if (!p) { d.hostile = 0; c.setState('idle'); return; }
    c.target = p.id;
    if (p.pos.distanceTo(c.pos) < 1.7 && c.cooldown <= 0) { c.yaw = Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z); d.hit = false; c.setState('attack'); c.cooldown = 1.3; return; }
    c.setState('run'); M.moveToward(c, p.pos, dt, c.def.run);
    if (d.hostile <= 0.05) bark(c, M, 'RESUMING DUTIES.');
    return;
  }
  c.target = null;
  if (st === 'shove') { if (c.t > 0.5) c.setState('idle'); return; }
  if (st === 'home') { if (c.t > 0.9) { dropAll(c, M, false, d.bin); c.setState('idle'); } return; }
  // shove players standing in its way
  d.shoveCd = Math.max(0, (d.shoveCd || 0) - dt);
  if (st === 'patrol' || st === 'return' || st === 'walk') {
    let blocker = null;
    for (const p of M.playersFor(c)) {
      const dx = p.pos.x - c.pos.x, dz = p.pos.z - c.pos.z, dd = Math.hypot(dx, dz);
      if (dd < 1.05 && Math.abs(p.pos.y - c.pos.y) < 1.5 && Math.abs(angleDiff(c.yaw, Math.atan2(dx, dz))) < 0.9) { blocker = p; break; }
    }
    d.blockT = blocker ? (d.blockT || 0) + dt : 0;
    if (blocker && d.blockT > 0.6 && d.shoveCd <= 0) {
      d.shoveCd = 3; d.blockT = 0;
      const dx = blocker.pos.x - c.pos.x, dz = blocker.pos.z - c.pos.z, L = Math.hypot(dx, dz) || 1;
      g.net.broadcast('fx', { k: 'hshove', id: c.id, to: blocker.id, d: [+(dx / L).toFixed(3), +(dz / L).toFixed(3)], f: 6.5 });
      bark(c, M, pick(['EXCUSE ME.', 'PARDON.', 'COMING THROUGH.', 'MIND THE WET FLOOR.']));
      c.setState('shove');
      return;
    }
  }
  // carrying tools: bin them
  if (d.carry.length && (d.carry.length >= 2 || !d.task || d.task.k !== 'tool')) {
    c.setState('return');
    if (M.moveToward(c, d.bin, dt, c.def.walk) || hd(c.pos, d.bin) < 1.3) { if (hd(c.pos, d.bin) < 2) c.setState('home'); }
    return;
  }
  d.taskT -= dt;
  if (!d.task || d.taskT <= 0) { d.taskT = 4; d.task = janitorTask(c, M); }
  const task = d.task;
  if (!task) { roam(c, dt, M, 14, 3, 'patrol'); return; }
  if (task.k === 'tool') {
    const it = g.items.get(task.id);
    if (!it || !binnable(it, c, M)) { d.task = null; return; }
    c.setState('patrol');
    if (itemPos(it).distanceTo(c.pos) < 1.3) { takeItem(c, M, it); d.task = null; M.sound(c, ['pickup_3', 'item_pickup'], 0.7, 3, 0.8); return; }
    M.moveToward(c, itemPos(it), dt, c.def.walk);
    return;
  }
  if (task.k === 'door') {
    const door = g.doorById?.(task.id);
    if (!door || !door.open || nearPlayer(M, door.pos, 2.2)) { d.task = null; return; }
    if (!task.stand) {
      const a = Math.atan2(c.pos.x - door.pos.x, c.pos.z - door.pos.z);
      const nav = M.nav(c);
      const x = door.pos.x + Math.sin(a) * 1.2, z = door.pos.z + Math.cos(a) * 1.2;
      const w = nav?.nearestWalkable(...nav.toGrid(x, z), 2);
      task.stand = w ? nav.toWorld(w[0], w[1]) : { x, z };
    }
    c.setState('patrol');
    if (M.moveToward(c, V.set(task.stand.x, c.pos.y, task.stand.z).clone(), dt, c.def.walk) || hd(c.pos, task.stand) < 0.7) {
      faceTo(c, door.pos.x, door.pos.z, 1, 99);
      g.hostSetDoor(door.id, false);
      s.closed.set(door.id, now);
      d.task = null; c.setState('idle');
    }
    return;
  }
  if (task.k === 'mop') {
    const from = V.set(task.from[0], c.pos.y, task.from[1]).clone(), to = new THREE.Vector3(task.to[0], c.pos.y, task.to[1]);
    if (!task.started) {
      c.setState('patrol');
      if (M.moveToward(c, from, dt, c.def.walk) || hd(c.pos, from) < 1) { task.started = true; M.goTo(c, to.x, to.z); c.setState('rest'); task.fxT = 0; }
      return;
    }
    c.setState('rest');
    task.fxT -= dt;
    if (task.fxT <= 0) { task.fxT = 0.5; g.net.broadcast('fx', { k: 'hmop', p: [+c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2)], r: 1.1 }); }
    if (M.follow(c, dt, 0.8) || hd(c.pos, to) < 0.6) {
      g.net.broadcast('fx', { k: 'hmop', p: [to.x, to.y, to.z], r: 1.4 });
      s.mopped.add(task.i); d.task = null; c.setState('idle');
    }
  }
}
