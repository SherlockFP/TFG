// CREATURES10 wave 10 - definitions, host AI and registration of BUFFERING, DOOMSCROLLER and RATIO (docs/wave10/creatures10.md).
// Everything runs inside the generic CreatureManager.hostUpdate (stun, damage, XP, snapshots, balance scaling, balance_rules 0.4 s wind-up gate
// apply as for any creature). One rule each, and every damage moment has a telegraph of >= 0.9 s that the player can read AND act on:
//   BUFFERING     'walk' / 'spin' (ring turns, it moves) -> 'buffer' (frozen, ring stuck) -> 'resume' (0.8 s spin-up whir, still frozen) -> 'spin'.
//   DOOMSCROLLER  'roam' (ceiling) -> 'scroll' (ticks ramp while you stand still under it) -> 'windup' (1 s: ping, red screens, hovers) -> 'drop' -> 'sprawl' -> 'climb'.
//   RATIO         'freeze' (watched) / 'creep' (unwatched) / 'rush' (the OTHER twin is watched) / 'windup' (0.9 s) / 'attack'; 'statue' with nobody near.
import * as THREE from 'three';
import { registerCreature, CREATURES, EXTRA_SPAWNS } from './creatures.js';
import { STATE_SOUNDS, LOOPS } from '../entities/creatures.js';
import { IDENT } from './identify.js';
import { CREATURE_FLAVOUR } from './components.js';
import { NO_POSE, NO_TELL } from './creature_read.js';
import { FIELD_NOTES } from './collection.js';
import { angleDiff, clamp } from '../core/util.js';
import * as C from './creatures10_core.js';

const rnd = Math.random, T = C.TUNE, TB = T.buf, TD = T.doom, TR = T.ratio, V = new THREE.Vector3();
const { buffering: BUF, doom: DOOM, ratio: RATIO } = C.IDS;

// The first sentence of `lore` IS the rule: the director shows it as the first-encounter caption (crdirector.js ruleLine).
export const DEFS = {
  [BUF]: { name: 'Buffering', hp: 210, dmg: 40, walk: 1.6, run: 4.6, power: 2, xp: 230, coin: 40, zone: 'in', radius: 0.4, height: 2.6, maxAlive: 1,
    deathText: 'was stuck at 99% by Buffering.',
    lore: 'It only moves while its loading ring spins, and every few seconds it freezes to buffer: walk past it then. '
      + 'The ring goes amber, the whir drops, and 0.8 s before it wakes up the whir climbs back. Its touch takes a big bite, and it winds up for a full second first.' },
  [DOOM]: { name: 'The Doomscroller', hp: 90, dmg: 34, walk: 2.3, run: 3.2, power: 1.5, xp: 150, coin: 26, zone: 'in', radius: 0.9, height: 0.6, maxAlive: 1,
    deathText: 'scrolled one video too long under the Doomscroller.',
    lore: 'A chain of glowing phones crawls along the ceiling and drops on anyone who stands still under it: keep moving. '
      + 'Every second you stay put its scroll-tick speeds up; a notification ping means the drop is one second away, so step out of the shadow. It lies stunned on the floor after landing: smash it.' },
  [RATIO]: { name: 'The Ratio', hp: 140, dmg: 32, walk: 1.2, run: 4.4, power: 1.25, xp: 120, coin: 20, zone: 'in', radius: 0.4, height: 1.9, maxAlive: 4,
    deathText: 'was ratioed by the twins.',
    lore: 'Two mirrored mannequins: a twin only moves while nobody is looking at it, and it RUSHES while you stare at the other one, so watch both at once. '
      + 'The red chest light means it is coming, the cold white one means it is frozen. Each twin winds up for a second before it hits.' },
};

export const HINTS = {
  [C.IDS.buffering]: 'Frozen while it buffers (ring amber, whir drops). Pass then; run when the whir climbs.',
  [C.IDS.doom]: 'Never stand still under a ceiling that ticks. Move when the ping sounds; smash it while it lies on the floor.',
  [C.IDS.ratio]: 'Look at BOTH twins: watching only one sends the other at you. Red chest = coming, white = frozen.',
};
export const NOTES = {
  [C.IDS.buffering]: 'It only bites after a full second of wind-up. In the buffer window, run PAST it, not away from it.',
  [C.IDS.doom]: 'Loot rooms are its favourite. Stand still to read a note and the ticking starts; keep walking and it never drops.',
  [C.IDS.ratio]: 'Two people: one watches each twin. Alone: back off until both fit on screen.',
};

// ------------------------------------------------------------------------------------------------ helpers
const face = (c, x, z, dt, rate = 9) => { const want = Math.atan2(x - c.pos.x, z - c.pos.z); c.yaw += clamp(angleDiff(c.yaw, want), -rate * dt, rate * dt); };
/** one-shot creature sound for everyone (cev 'snd' handled by CreatureManager.onEvent) */
export function csnd(M, c, names, v = 0.8, pt = 1, ref = 4, max = 45) { M.game.net.broadcast('cev', { e: 'snd', id: c.id, s: names, v, pt, ref, max }); }
const walkers = (c, M) => M.playersFor(c).filter((p) => !p.dead && !p.inShip);
/** wander with the nav grid; false path -> pick a new goal */
function patrol(c, dt, M, speed, radius) { if (!c.path || M.follow(c, dt, speed)) M.wander(c, radius); }

// ------------------------------------------------------------------------------------------------ BUFFERING
function buffering(c, dt, M) {
  const d = c.data;
  if (!d.init) { d.init = 1; d.dur = d.left = C.rollSpin(); d.lost = 0; d.tid = null; c.setState('walk'); }
  const pl = walkers(c, M);
  const tgt = pl.find((p) => p.id === d.tid) || null;
  if (c.state === 'stunned') c.setState('walk');   // hostUpdate resets to 'idle' after a stun; the ring keeps its own states
  if (c.state === 'idle') c.setState(tgt ? 'spin' : 'walk');

  // ---- frozen phases: nothing moves, nothing bites. The ring's glow / whir are the whole message.
  if (c.state === 'buffer') { c.extra = 1; if (c.t >= TB.buffer - TB.resume) c.setState('resume'); return; }
  if (c.state === 'resume') { c.extra = 0; if (c.t >= TB.resume) { d.dur = d.left = C.rollSpin(); c.setState(tgt ? 'spin' : 'walk'); } return; }
  if (c.state === 'windup') {
    if (!tgt) { c.setState('spin'); return; }
    face(c, tgt.pos.x, tgt.pos.z, dt, 5);
    if (c.t >= TB.windup) {
      if (c.pos.distanceTo(tgt.pos) <= TB.hitReach && Math.abs(tgt.pos.y - c.pos.y) < 2) M.attack(c, tgt, c.dmg, BUF);
      c.cooldown = TB.cd; c.setState('attack');
    }
    return;
  }
  if (c.state === 'attack') { if (c.t >= TB.attackT) c.setState(tgt ? 'spin' : 'walk'); return; }

  // ---- senses: sight (wide cone) or a loud noise; it forgets you after `lose` s
  const n = M.nearest(c, pl, TB.sight);
  if (n && M.canSee(c, n.p, TB.sight, TB.fov)) { d.tid = n.p.id; d.lost = 0; }
  else if (d.tid) { d.lost += dt; if (d.lost > TB.lose) { d.tid = null; c.setState('walk'); } }
  const heard = !d.tid ? M.hear(c, TB.hear) : null;
  if (heard) { M.goToLazy(c, heard.pos.x, heard.pos.z); c.setState('spin'); d.lost = 0; }

  // ---- the buffer clock runs while it is moving (patrolling or hunting): it visibly stalls even at a distance
  d.left -= dt;
  c.extra = C.bufferFill(d.left, d.dur);
  if (d.left <= 0) { c.setState('buffer'); c.extra = 1; return; }

  const t2 = pl.find((p) => p.id === d.tid) || null;
  if (t2) {
    c.setState('spin');
    face(c, t2.pos.x, t2.pos.z, dt, 6);
    const dist = c.pos.distanceTo(t2.pos);
    if (dist < TB.reach && c.cooldown <= 0 && Math.abs(t2.pos.y - c.pos.y) < 2) { c.setState('windup'); return; }   // 0.9 s telegraph: the ring races, the whir screams
    M.moveToward(c, t2.pos, dt, c.def.run);
  } else if (heard || c.state === 'spin') {
    if (M.follow(c, dt, c.def.run) || !c.path) c.setState('walk');
  } else patrol(c, dt, M, c.def.walk, TB.wanderR);
}

// ------------------------------------------------------------------------------------------------ DOOMSCROLLER
function doomscroller(c, dt, M) {
  const d = c.data, g = M.game;
  const fac = g.world?.facility;
  if (!d.init) { d.init = 1; d.floorY = fac?.layout?.y ?? c.pos.y; d.m = {}; d.tick = 0; d.lock = new THREE.Vector3(); d.vy = 0; c.setState('roam'); }
  const ceilAt = (x, z) => C.ceilingY(fac?.layout, x, z, d.floorY) - TD.hang;
  const pl = walkers(c, M);
  if (c.state === 'stunned' || c.state === 'idle') c.setState(c.pos.y < ceilAt(c.pos.x, c.pos.z) - 0.2 ? 'climb' : 'roam');

  // ---- the fall: locked spot, gravity, one hit at the impact for whoever is still there
  if (c.state === 'windup') {
    c.extra = 1;
    c.pos.x += (d.lock.x - c.pos.x) * Math.min(1, dt * 4); c.pos.z += (d.lock.z - c.pos.z) * Math.min(1, dt * 4);   // hovers over the locked spot, it does not track you
    if (c.t >= TD.windup) { c.setState('drop'); d.vy = 0; }
    return;
  }
  if (c.state === 'drop') {
    d.vy += TD.fall * dt; c.pos.y -= d.vy * dt;
    if (c.pos.y <= d.floorY) {
      c.pos.y = d.floorY;
      let best = null, bd = TD.hitR;
      for (const p of pl) { const dd = Math.hypot(p.pos.x - d.lock.x, p.pos.z - d.lock.z); if (dd < bd && Math.abs(p.pos.y - d.floorY) < 1.7) { bd = dd; best = p; } }
      if (best) M.attack(c, best, c.dmg, DOOM);   // c.t is the fall time (>= 0.4 s): balance_rules lets it through at once
      d.m = {}; c.extra = 0; c.setState('sprawl');
    }
    return;
  }
  if (c.state === 'sprawl') { if (c.t >= TD.sprawl) { d.y0 = c.pos.y; c.setState('climb'); } return; }
  if (c.state === 'climb') {
    const top = ceilAt(c.pos.x, c.pos.z), u = clamp(c.t / TD.climb, 0, 1);
    if (d.y0 === undefined) d.y0 = c.pos.y;
    c.pos.y = d.y0 + (top - d.y0) * u * u * (3 - 2 * u);
    if (u >= 1) { c.pos.y = top; d.y0 = undefined; c.setState('roam'); }
    return;
  }

  // ---- on the ceiling: keep the hang height, then read the dwell meters
  c.pos.y = ceilAt(c.pos.x, c.pos.z);
  let top = 0, topP = null;
  const ids = new Set();
  for (const p of pl) {
    ids.add(p.id);
    const dist = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
    const under = dist < TD.under && Math.abs(p.pos.y - d.floorY) < 3;
    const sp = M.pvel?.get?.(p.id)?.sp ?? 0;
    const m = C.dwellStep(d.m[p.id] || 0, under, sp < TD.still, dt);
    d.m[p.id] = m;
    if (m > top) { top = m; topP = p; }
  }
  for (const id of Object.keys(d.m)) if (!ids.has(id)) delete d.m[id];
  c.extra = top;

  if (top >= 1 && topP) { d.lock.set(topP.pos.x, d.floorY, topP.pos.z); d.m[topP.id] = 0; c.extra = 1; c.setState('windup'); return; }   // 1.0 s: ping + red screens; step out and it lands on nothing
  if (top > TD.focusMin) {
    if (c.state !== 'scroll') c.setState('scroll');
    d.tick -= dt;
    if (d.tick <= 0) { d.tick = C.tickInterval(top); csnd(M, c, ['c10_scroll_tick', 'lockpick_click'], C.tickVolume(top), C.tickPitch(top), 3, 34); }   // the scroll-tick ramps up: the telegraph of the whole attack
    face(c, topP.pos.x, topP.pos.z, dt, 2);
    return;                                                                           // it stops moving and waits for you to keep standing
  }
  if (c.state !== 'roam') c.setState('roam');
  // camping is what it hunts: the stillest crewmate in range, else the nearest; it never leaves the nav grid (ceiling above a floor path)
  let goal = null, gs = 1e9;
  for (const p of pl) {
    const dist = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
    if (dist > TD.sense) continue;
    const sp = M.pvel?.get?.(p.id)?.sp ?? 3;
    const s = dist + Math.min(sp, 3) * 6;
    if (s < gs) { gs = s; goal = p; }
  }
  if (goal) M.moveToward(c, goal.pos, dt, c.def.walk); else patrol(c, dt, M, c.def.walk, 18);
  c.pos.y = ceilAt(c.pos.x, c.pos.z);
}

// ------------------------------------------------------------------------------------------------ RATIO
function watchedBy(cc, players, M) { for (const p of players) if (M.isLookedAt(cc, p, TR.watchDist, TR.cone)) return true; return false; }
function spawnTwin(c, M) {
  const nav = M.nav?.(c);
  for (let i = 0; i < 8; i++) {
    let x, z;
    const p = nav?.randomWalkable ? nav.randomWalkable(rnd, c.pos.x, c.pos.z, TR.twinMax) : null;
    if (p) { x = p.x; z = p.z; } else { const a = rnd() * Math.PI * 2, r = TR.twinMin + rnd() * 3; x = c.pos.x + Math.cos(a) * r; z = c.pos.z + Math.sin(a) * r; if (nav) continue; }
    const dd = Math.hypot(x - c.pos.x, z - c.pos.z);
    if (dd < TR.twinMin || dd > TR.twinMax) continue;
    const t = M.hostSpawn(RATIO, V.set(x, c.pos.y, z).clone(), { zone: c.zone, level: c.level, seed: (c.seed ^ 1) >>> 0, data: { second: 1, init: 1, twin: c.id, w: 0 }, yaw: c.yaw });
    if (t) { c.data.twin = t.id; return true; }
  }
  return false;
}
function ratio(c, dt, M) {
  const d = c.data;
  if (!d.init) {
    d.init = 1; d.w = 0; c.setState('statue');
    if (!d.second && !d.twin) {
      // host migration rebuilds both twins without their data: pair with a lone Ratio instead of spawning a third body
      let mate = null; for (const o of M.host?.values?.() || []) if (o !== c && o.type === RATIO && !o.dead && !o.data.twin) { mate = o; break; }
      if (mate) { d.twin = mate.id; mate.data.twin = c.id; } else { d.needTwin = 1; d.tries = 0; d.twinT = 0.3; }
    }
  }
  if (c.state === 'stunned' || c.state === 'idle') c.setState('freeze');
  const pl = walkers(c, M);
  if (d.needTwin) {
    d.twinT -= dt;
    if (d.twinT <= 0) { d.twinT = 0.8; if (spawnTwin(c, M) || ++d.tries >= TR.twinTries) d.needTwin = 0; }   // a lone twin (no spot found) is just a slow mannequin
  }
  const twin = d.twin ? M.host?.get?.(d.twin) : null;
  const alive = !!twin && !twin.dead;
  const self = watchedBy(c, pl, M);
  d.w = self ? TR.grace : Math.max(0, d.w - dt);
  const other = alive ? (watchedBy(twin, pl, M) || (twin.data?.w || 0) > 0) : false;

  if (c.state === 'windup') {                       // the tell is a full 0.9 s of raised arms; it only counts while nobody looks at it
    if (d.w > 0) { c.setState('freeze'); return; }
    const tp = pl.find((p) => p.id === d.tid);
    if (!tp) { c.setState('creep'); return; }
    face(c, tp.pos.x, tp.pos.z, dt, 5);
    if (c.t >= TR.windup) {
      if (c.pos.distanceTo(tp.pos) <= TR.hitReach && Math.abs(tp.pos.y - c.pos.y) < 2) M.attack(c, tp, c.dmg, RATIO);
      c.cooldown = TR.cd; c.setState('attack');
    }
    return;
  }
  if (c.state === 'attack') { if (c.t >= TR.attackT) c.setState('freeze'); return; }

  const n = M.nearest(c, pl, TR.sense);
  if (!n) { c.extra = 0; if (c.state !== 'statue') c.setState('statue'); return; }
  d.tid = n.p.id;
  const mode = C.ratioMode(d.w > 0, other, alive);
  c.extra = mode === 'rush' ? 1 : mode === 'creep' ? 0.5 : 0;     // model: chest light colour / arm pose
  if (c.state !== mode) c.setState(mode);
  if (mode === 'freeze') return;                                    // watched: stone. Not even a turn.
  face(c, n.p.pos.x, n.p.pos.z, dt, 7);
  if (n.d < TR.reach && c.cooldown <= 0 && Math.abs(n.p.pos.y - c.pos.y) < 2) { c.setState('windup'); return; }
  M.moveToward(c, n.p.pos, dt, mode === 'rush' ? c.def.run : c.def.walk);
}

export const BEH = { [BUF]: buffering, [DOOM]: doomscroller, [RATIO]: ratio };

// ------------------------------------------------------------------------------------------------ registration
let registered = false;
let gateGame = null;
/** the game whose run.quotaIndex gates the generic spawners (null = blocked: nothing spawns without a run) */
export function setC10Game(g) { gateGame = g; }
/** creatures, spawn weights + quota gate, sounds / loops, scanner + codex rows (idempotent). */
export function registerC10Content() {
  if (!registered) {
    registered = true;
    for (const [id, def] of Object.entries(DEFS)) if (!CREATURES[id]) registerCreature(id, { ...def }, BEH[id]);
    for (const [id, e] of Object.entries(T.spawn)) if (!EXTRA_SPAWNS[id]) EXTRA_SPAWNS[id] = { ...e };
    Object.assign(STATE_SOUNDS, {
      [BUF]: { buffer: [['c10_buf_down', 'light_flicker'], 0.85, 1], resume: [['c10_buf_up', 'light_flicker'], 0.85, 1], windup: [['c10_buf_wind', 'lurker_growl'], 1, 1], attack: [['lurker_snap', 'hit_flesh'], 1, 0.8], dead: [['creature_death'], 1, 0.7], stunned: ['hit_flesh', 0.7, 0.7] },
      [DOOM]: { windup: [['c10_notif', 'chat_blip'], 1, 1], sprawl: [['c10_scroll_drop', 'creature_death'], 1, 1], dead: [['glass_break', 'creature_death'], 0.9, 1], stunned: ['hit_flesh', 0.7, 1.2] },
      [RATIO]: { freeze: [['c10_ratio_clack'], 0.7, 1], windup: [['c10_ratio_wind', 'lurker_growl'], 0.9, 1], attack: [['lurker_snap', 'hit_flesh'], 1, 0.9], dead: [['creature_death'], 0.9, 1.1], stunned: ['hit_flesh', 0.7, 1] },
    });
    Object.assign(LOOPS, {
      [BUF]: [['walk', 'c10_buf_spin', 0.22, 1], ['spin', 'c10_buf_spin', 0.32, 1], ['windup', 'c10_buf_spin', 0.4, 1]],   // silent while buffering: the quiet IS the window
      [DOOM]: [['roam', 'c10_scroll_crawl', 0.2, 1]],
      [RATIO]: [['creep', 'c10_ratio_creak', 0.14, 1], ['rush', 'c10_ratio_creak', 0.3, 1.25]],
    });
    Object.assign(IDENT, {
      [BUF]: ['Anomaly', 3, HINTS[BUF]],
      [DOOM]: ['Predator', 3, HINTS[DOOM]],
      [RATIO]: ['Stalker', 4, HINTS[RATIO]],
    });
    Object.assign(CREATURE_FLAVOUR, { [BUF]: 'electronic', [DOOM]: 'electronic', [RATIO]: 'wood' });
    for (const id of [BUF, DOOM, RATIO]) NO_TELL.add(id);   // their emissive tell is part of the model (ring / screens / chest light)
    NO_POSE.add(DOOM);                                       // the chain owns its transform
    Object.assign(FIELD_NOTES, NOTES);
  }
  // generic spawners (host.js / director.js -> canSpawnMore -> def.noSpawn): not in the first quotas. The twin is spawned by the module itself, so it is unaffected.
  for (const id of C.ALL_IDS) {
    const def = CREATURES[id];
    if (def && !Object.getOwnPropertyDescriptor(def, 'noSpawn')?.get) Object.defineProperty(def, 'noSpawn', { enumerable: true, configurable: true, get: () => !gateGame || !C.quotaAllows(id, gateGame.run?.quotaIndex) });
  }
}
