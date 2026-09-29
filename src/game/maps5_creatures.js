// MAPS5 (wave 4) - the two creatures native to the new zones + their scrap. Everything registers through registerCreature / registerItem and runs inside
// the generic CreatureManager.hostUpdate (stun, damage, hp scaling, snapshots, xp, balance scale, days-in-run factor all apply). Host-authoritative;
// Math.random is fine here (creature AI is not world generation). Both are spawned by game/maps5.js at landing (`noSpawn`), never by the generic spawner.
//
//   m5warden  HEDGE WARDEN (Estate 9, tier 2): a topiary figure with shears. Sleeps as a statue in the hedge-maze centre chamber. It wakes when a player
//             stays within 3.4 m for 0.6 s, when the Topiary Heart (the prize) is lifted, when it is hit, or on a loud noise next to it. WAKE = 1.4 s telegraph
//             (eyes glow, shears clack), then it hunts along the MAZE (BFS route through the hedge corridors, never through hedges) at run 5.2 m/s (a sprint is
//             8.2 m/s, so it can be outrun), winds up 0.7 s (shears raised) before every cut (32 dmg, cooldown 1.6 s). It never leaves the maze area by more than
//             ~14 m. When nobody is in the maze for 22 s it walks home and freezes into a statue again.
//   m5sleeper CRYO SLEEPER (Cold Storage, tier 3): a frozen subscriber standing in an open cryo pod (ice shell). Wakes when a player is within 4.2 m, when it is
//             hit, or when the cave's Cryo Core is lifted. THAW = 1.3 s (shell cracks), then a slow stiff hunter (run 4.4 m/s), 0.6 s wind-up, 26 dmg + a 1.2 s chill
//             (slow) on hit. Leashed to 28 m around its pod; loses interest after 9 s and walks back to freeze again.
import * as THREE from 'three';
import { registerCreature, CREATURES } from './creatures.js';
import { STATE_SOUNDS } from '../entities/creatures.js';
import { registerItem, ITEMS } from './items.js';
import { angleDiff, clamp } from '../core/util.js';
import { IDENT } from './identify.js';
import { CREATURE_FLAVOUR } from './components.js';
import { NO_LOOK } from '../render/tierlooks.js';

const rnd = Math.random;
export const M5_TYPES = new Set(['m5warden', 'm5sleeper']);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const face = (c, x, z, dt, rate = 9) => { const want = Math.atan2(x - c.pos.x, z - c.pos.z); c.yaw += clamp(angleDiff(c.yaw, want), -rate * dt, rate * dt); };
const outdoorPlayers = (c, M) => M.playersFor(c).filter((p) => !p.inShip && !p.dead);

export const DEFS = {
  m5warden: { name: 'Hedge Warden', hp: 260, dmg: 32, walk: 2.4, run: 5.2, power: 2.4, xp: 230, coin: 40, zone: 'out', radius: 0.6, height: 2.3, maxAlive: 2, noSpawn: true, drop: ['m5_shears', 0.5],
    deathText: 'was pruned by the Hedge Warden.',
    lore: 'The estate gardener never stopped working. It stands very still among the topiary of the hedge maze until you take something that is not yours, or stay too close for too long. '
      + 'Then the shears start to clack: you have a moment. It follows the corridors, never the hedges, and it winds up before every cut. Outrun it, or hit it while it swings.' },
  m5sleeper: { name: 'Cryo Sleeper', hp: 170, dmg: 26, walk: 1.4, run: 4.4, power: 1.8, xp: 150, coin: 26, zone: 'out', radius: 0.5, height: 1.95, maxAlive: 5, noSpawn: true, drop: ['m5_frostfilm', 0.35],
    deathText: 'was thawed out by a Cryo Sleeper.',
    lore: 'A subscriber who paid to wait for the next season. The ice cracks when you come close, or when someone lifts a Cryo Core from its chamber. Slow, stiff and cold to the touch: '
      + 'its blow chills you. Keep moving, do not fight it in a dead end.' },
};

export const ITEM_DEFS = {
  m5_heart: { id: 'm5_heart', name: 'Topiary Heart', kind: 'scrap', weight: 12, hands: 1, value: [150, 220], tip: 'The heart of the hedge maze, carved by a gardener who loved it too much. Someone is very attached to it.' },
  m5_ledger: { id: 'm5_ledger', name: 'Master Ledger', kind: 'scrap', weight: 22, hands: 2, value: [190, 260], tip: 'Every draft the owner never posted, bound in leather. The Archive would pay a lot for it.' },
  m5_cryocore: { id: 'm5_cryocore', name: 'Cryo Core', kind: 'scrap', weight: 26, hands: 2, value: [200, 280], fragile: 0.25, tip: 'The coolant heart of a cryo bay. Heavy and delicate. The sleepers notice when it is gone.' },
  m5_shears: { id: 'm5_shears', name: 'Golden Shears', kind: 'scrap', weight: 6, hands: 1, value: [60, 100], tip: 'Ceremonial shears with a very sharp opinion about hedges.' },
  m5_frostfilm: { id: 'm5_frostfilm', name: 'Frost Film Reel', kind: 'scrap', weight: 3, hands: 1, value: [30, 50], tip: 'Season 9, episode 1. Frozen before it aired.' },
};

// ------------------------------------------------------------------------------------------------ Hedge Warden
/** the maze this warden belongs to (decor info of the current map) */
const hedgeOf = (M) => M.game.world?.outdoor?.decor?.info?.hedge || null;
/** BFS route through the maze corridors as { x, z } waypoints; the first waypoint (the cell centre behind us) is dropped when we already passed it */
function mazePath(H, c, to) {
  const route = H.route([c.pos.x, c.pos.z], [to.x, to.z]);
  if (!route) return null;
  let r = route;
  if (r.length > 1 && Math.hypot(c.pos.x - r[1][0], c.pos.z - r[1][1]) < Math.hypot(r[0][0] - r[1][0], r[0][1] - r[1][1])) r = r.slice(1);
  const out = r.map(([x, z]) => ({ x, z }));
  out.push({ x: to.x, z: to.z });
  return out;
}
function wardenBehavior(c, dt, M) {
  const d = c.data, g = M.game, H = hedgeOf(M);
  if (!d.init) { d.init = true; d.home = d.home || { x: c.pos.x, z: c.pos.z }; d.near = 0; d.lost = 0; d.repath = 0; d.hitSeen = 0; c.setState('statue'); }
  if (!H) return;
  const players = outdoorPlayers(c, M);
  const inMaze = (p) => flat(p.pos, H.frame) < H.radius + 3;
  const st = c.state;
  if (d.hitAt && d.hitAt > d.hitSeen) { d.hitSeen = d.hitAt; d.alarm = true; }
  if (st === 'statue') {
    c.stunT = Math.max(c.stunT || 0, 0);
    let near = null, nd = 1e9;
    for (const p of players) { const dist = flat(p.pos, c.pos); if (dist < nd) { nd = dist; near = p; } }
    d.near = near && nd < 3.4 ? d.near + dt : Math.max(0, d.near - dt * 2);
    const noise = M.hear(c, 9);
    if (d.alarm || d.near > 0.6 || (noise && noise.loud > 0.9 && flat(noise.pos, c.pos) < 8)) { d.alarm = false; c.target = near?.id || null; d.awake = true; c.setState('wake'); g.creatures.noise?.(c.pos, 1.2); }
    return;
  }
  if (st === 'wake') { if (c.t >= 1.4) { c.setState('run'); d.lost = 0; } return; }
  if (st === 'windup') {
    const p = players.find((q) => q.id === c.target);
    if (p) face(c, p.pos.x, p.pos.z, dt, 8);
    if (c.t >= 0.7) {
      for (const q of players) if (flat(q.pos, c.pos) < 2.7 && Math.abs(q.pos.y - c.pos.y) < 2.4) M.attack(c, q, c.dmg, 'm5warden');
      c.setState('attack'); c.cooldown = 1.6;
    }
    return;
  }
  if (st === 'attack') { if (c.t > 0.45) c.setState('run'); return; }
  if (st === 'stunned') { d.alarm = false; if (!d.awake) { d.awake = true; c.setState('wake'); } else c.setState('run'); return; }
  // ---- hunting / returning (states run, walk)
  let prey = null, pd = 1e9;
  for (const p of players) { if (!inMaze(p)) continue; const dist = flat(p.pos, c.pos); if (dist < pd) { pd = dist; prey = p; } }
  if (prey) {
    d.lost = 0; c.target = prey.id;
    if (pd < 2.1 && c.cooldown <= 0) { c.setState('windup'); return; }
    d.repath -= dt;
    if (d.repath <= 0 || !c.path) {
      d.repath = 0.5;
      const path = mazePath(H, c, prey.pos);
      if (path) { c.path = path; c.pathIdx = 0; }
    }
    if (c.state !== 'run') c.setState('run');
    M.follow(c, dt, c.def.run, 10);
    return;
  }
  d.lost += dt;
  if (d.lost > 22 || !players.some(inMaze)) {   // nobody in the maze: walk home and freeze
    const away = flat(c.pos, d.home);
    if (away < 0.7) { c.path = null; d.awake = false; c.setState('statue'); c.yaw = d.homeYaw ?? c.yaw; return; }
    d.repath -= dt;
    if (d.repath <= 0 || !c.path) { d.repath = 1.2; c.path = mazePath(H, c, d.home) || [{ x: d.home.x, z: d.home.z }]; c.pathIdx = 0; }
    if (c.state !== 'walk') c.setState('walk');
    M.follow(c, dt, c.def.walk * 1.2, 8);
    return;
  }
  if (c.state !== 'idle') c.setState('idle');   // lost sight for a moment: stand and listen
}

// ------------------------------------------------------------------------------------------------ Cryo Sleeper
/** the cave floor is a raised slab: outdoor movement snaps to the terrain, so put the sleeper back on the slab while it is inside the cave */
function sleeperBehavior(c, dt, M) {
  sleeperCore(c, dt, M);
  const cv = M.game.world?.outdoor?.decor?.info?.caves?.[c.data.cave];
  if (cv && cv.contains(c.pos.x, c.pos.z, cv.y0 + 1)) c.pos.y = cv.y0;
}
function sleeperCore(c, dt, M) {
  const d = c.data, g = M.game;
  if (!d.init) { d.init = true; d.pod = d.pod || { x: c.pos.x, z: c.pos.z }; d.lost = 0; d.hitSeen = 0; c.setState('dormant'); }
  const players = outdoorPlayers(c, M);
  const st = c.state;
  if (d.hitAt && d.hitAt > d.hitSeen) { d.hitSeen = d.hitAt; d.alarm = true; }
  if (st === 'dormant') {
    let near = null, nd = 1e9;
    for (const p of players) { const dist = flat(p.pos, c.pos); if (dist < nd) { nd = dist; near = p; } }
    if (d.alarm || (near && nd < 4.2)) { d.alarm = false; c.target = near?.id || null; d.awake = true; c.setState('thaw'); g.creatures.noise?.(c.pos, 0.8); }
    return;
  }
  if (st === 'thaw') { if (c.t >= 1.3) { c.setState('run'); d.lost = 0; } return; }
  if (st === 'windup') {
    const p = players.find((q) => q.id === c.target);
    if (p) face(c, p.pos.x, p.pos.z, dt, 7);
    if (c.t >= 0.6) {
      for (const q of players) if (flat(q.pos, c.pos) < 2.2 && Math.abs(q.pos.y - c.pos.y) < 2.4 && M.attack(c, q, c.dmg, 'm5sleeper') !== false) g.hostSlowPlayer?.(q.id, 1.2);
      c.setState('attack'); c.cooldown = 1.5;
    }
    return;
  }
  if (st === 'attack') { if (c.t > 0.4) c.setState('run'); return; }
  if (st === 'stunned') { d.alarm = false; if (!d.awake) { d.awake = true; c.setState('thaw'); } else c.setState('run'); return; }
  if (st === 'freeze') { if (c.t > 1.5) { d.awake = false; c.setState('dormant'); } return; }
  // hunting (run) / walking home (walk)
  let prey = null, pd = 1e9;
  for (const p of players) { const dist = flat(p.pos, c.pos); if (dist < pd && flat(p.pos, d.pod) < 28) { pd = dist; prey = p; } }
  if (prey && st !== 'walk') {
    d.lost = M.canSee(c, prey, 22, 360) ? 0 : d.lost + dt;
    if (d.lost > 9) { c.target = null; c.setState('walk'); M.goTo(c, d.pod.x, d.pod.z); return; }
    c.target = prey.id;
    if (pd < 1.7 && c.cooldown <= 0) { c.setState('windup'); return; }
    if (c.state !== 'run') c.setState('run');
    M.moveToward(c, prey.pos, dt, c.def.run);
    return;
  }
  if (st === 'run' && !prey) { c.setState('walk'); M.goTo(c, d.pod.x, d.pod.z); return; }
  if (st === 'walk') {
    if (M.follow(c, dt, c.def.walk * 1.4) || flat(c.pos, d.pod) < 0.8) { c.path = null; c.setState('freeze'); }
    else if (prey && pd < 6) { c.setState('run'); }
    return;
  }
  c.setState('freeze');
}

// ------------------------------------------------------------------------------------------------ registration
let registered = false;
export function registerMaps5Creatures() {
  if (registered) return;
  registered = true;
  const BEH = { m5warden: wardenBehavior, m5sleeper: sleeperBehavior };
  for (const [id, def] of Object.entries(DEFS)) if (!CREATURES[id]) registerCreature(id, { ...def }, BEH[id]);
  for (const def of Object.values(ITEM_DEFS)) if (!ITEMS[def.id]) registerItem({ ...def });
  Object.assign(STATE_SOUNDS, {
    m5warden: { wake: [['metal_hit', 'door_creak'], 0.8, 1.2], windup: [['metal_hit', 'hit_metal'], 0.7, 1.4], run: [['hound_growl'], 0.5, 0.6], dead: [['creature_death'], 0.9, 0.7] },
    m5sleeper: { thaw: [['glass_break', 'ice_1'], 0.9, 0.9], windup: [['hit_flesh'], 0.5, 0.6], run: [['lurker_growl'], 0.5, 0.5], dead: [['glass_break', 'creature_death'], 0.9, 0.8] },
  });
  Object.assign(IDENT, {
    m5warden: ['Stalker', 3, 'Statue until provoked. It follows the maze corridors and winds up before each cut: outrun it or hit it mid-swing.'],
    m5sleeper: ['Territorial', 3, 'Frozen in its pod until you come close or the Cryo Core moves. Slow and stiff; its blow chills you.'],
  });
  NO_LOOK.add('m5warden'); NO_LOOK.add('m5sleeper');
  Object.assign(CREATURE_FLAVOUR, { m5warden: 'organic', m5sleeper: 'organic' });
}
void THREE; void rnd;
