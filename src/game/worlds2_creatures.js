// WAVE 3 worlds2 - planet creatures. Everything registers through registerCreature / STATE_SOUNDS / registerItem and runs inside the
// generic CreatureManager.hostUpdate, so stun, damage, snapshots, XP, balance scaling and the days-in-run factor apply like for any creature.
//   dunemaw     Dune Maw     burrower: tracks footsteps under the sand (rumble telegraph, mound), erupts with a 0.85 s warning, bites, stays exposed 3.5 s
//   tuskbeast   Tusked Beast neutral herd animal: grazes by day, paws the ground (0.8 s telegraph) and charges in a LOCKED direction when provoked,
//                            approached too long, or at night; the charge shoves the victim
//   scavraider  Hooded Scavenger Raider: blaster carbine, aims 0.85 s (raised gun) before every shot, keeps 6-15 m, reloads, alerts its camp
//   alien_npc   Cantina Alien: NEUTRAL patrons / bartender of the outpost: idle, talk, drink, wander; angry only when hit (then fights, flees when hurt)
//   prowler     Dusk Prowler night pack hunter (chaser) - the hostile side of the planet fauna after dusk
// Host-authoritative AI; Math.random is fine here (creatures are not world generation).
import * as THREE from 'three';
import { registerCreature, CREATURES } from './creatures.js';
import { chaser, STATE_SOUNDS, LOOPS } from '../entities/creatures.js';
import { registerItem, ITEMS } from './items.js';
import { angleDiff, clamp } from '../core/util.js';
import { G } from '../physics/physics.js';
import { atReady, atBegin, atStep, atCancel, atShoot, atAiming, atLocked } from './aimtell.js';   // wave 5: telegraphed aim
import { IDENT } from './identify.js';
import { CREATURE_FLAVOUR } from './components.js';
import { NO_LOOK } from '../render/tierlooks.js';

const rnd = Math.random;
const V = new THREE.Vector3();
export const W2_TYPES = new Set(['dunemaw', 'tuskbeast', 'scavraider', 'alien_npc', 'prowler']);
export const NPC_LINES = ['Buy me a drink, smuggler.', 'No blasters at the bar!', 'Two suns, one thirst.', 'Heard the dunes are moving again.', 'Nothing personal, just business.', 'Sand gets everywhere.',
  'Bzzzt - the quota is a state secret.', 'You look like a Lurker. Sit down.', 'The Maw does not like loud boots.', 'Careful, friend. Careful.'];

// ------------------------------------------------------------------------------------------------ definitions
export const DEFS = {
  dunemaw: { name: 'Dune Maw', hp: 300, dmg: 55, walk: 4.2, run: 6.6, power: 2.5, xp: 230, coin: 42, zone: 'out', radius: 1.1, height: 3.2, maxAlive: 2, drop: ['maw_pearl', 0.5],
    deathText: 'was swallowed by a Dune Maw.',
    lore: 'A burrower that hunts by vibration. When the sand starts to rumble under your boots, stop running in a straight line: it erupts 0.85 s after it reaches you. '
      + 'Crouch and walk to stay quiet. After the bite it lies exposed for a few seconds: that is your window.' },
  tuskbeast: { name: 'Tusked Beast', hp: 380, dmg: 38, walk: 1.8, run: 8.0, power: 2, xp: 170, coin: 30, zone: 'out', radius: 0.9, height: 1.95, maxAlive: 8, drop: ['beast_tusk', 0.5],
    deathText: 'was trampled by a Tusked Beast.',
    lore: 'Peaceful herd animals... by day, and if you keep your distance. Approach too long, hurt one, or stay out after dark and it paws the ground (a 0.8 s warning) '
      + 'and charges in a straight line. Sidestep. The charge shoves you.' },
  scavraider: { name: 'Scavenger Raider', hp: 70, dmg: 14, walk: 2.2, run: 4.6, power: 1.2, xp: 85, coin: 20, zone: 'out', radius: 0.42, height: 1.85, maxAlive: 10,
    deathText: 'was shot by a hooded scavenger.',
    lore: 'Hooded desert raiders with blaster carbines. They raise the gun for a moment before every shot, keep their distance and call the whole camp when they see you. '
      + 'Break line of sight, then close in. They drop blaster cells and, rarely, a Plasma Blade.' },
  alien_npc: { name: 'Cantina Alien', hp: 80, dmg: 12, walk: 1.5, run: 4.0, power: 0, xp: 0, coin: 0, zone: 'out', radius: 0.42, height: 1.75, noSpawn: true, noHunt: true,
    deathText: 'was thrown out of the cantina.',
    lore: 'Patrons and bartender of the outpost. They mind their own business. Leave them alone: hit one and the whole bar remembers.' },
  prowler: { name: 'Dusk Prowler', hp: 95, dmg: 22, walk: 2.4, run: 7.4, power: 1.6, xp: 105, coin: 20, zone: 'out', radius: 0.55, height: 1.25, maxAlive: 8, noSpawn: true,
    deathText: 'was run down by Dusk Prowlers.',
    lore: 'Lean pack hunters that come out with the dusk. Herd animals by day, killers after dark: watch the ridge line for pale eyes and keep your back to a wall.' },
};

export const ITEM_DEFS = {
  maw_pearl: { id: 'maw_pearl', name: 'Maw Pearl', kind: 'scrap', weight: 4, hands: 1, value: [70, 110], tip: 'A glassy pearl from a Dune Maw. Worth a fortune to the right buyer.' },
  beast_tusk: { id: 'beast_tusk', name: 'Beast Tusk', kind: 'scrap', weight: 8, hands: 2, value: [45, 75], tip: 'A curved tusk. Heavy, but it sells.' },
};

// ------------------------------------------------------------------------------------------------ helpers
const isNight = (g) => (g.run?.time ?? 0) >= 18 * 60 || g.run?.weather === 'eclipsed';
const outdoorsPlayers = (c, M) => M.playersFor(c).filter((p) => !p.inShip && !p.dead);
const face = (c, x, z, dt, rate = 9) => { const want = Math.atan2(x - c.pos.x, z - c.pos.z); c.yaw += clamp(angleDiff(c.yaw, want), -rate * dt, rate * dt); };
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ------------------------------------------------------------------------------------------------ Dune Maw
function dunemawBehavior(c, dt, M) {
  const d = c.data;
  if (!d.init) { d.init = true; d.lost = 0; c.setState('hidden'); }
  const players = outdoorsPlayers(c, M);
  const st = c.state;
  if (st === 'hidden' || st === 'rumble' || st === 'idle' || st === 'walk' || st === 'run') {
    if (st !== 'hidden' && st !== 'rumble') c.setState('hidden');
    let prey = null, best = 1e9;
    for (const p of players) {
      const dist = flat(p.pos, c.pos);
      const felt = (p.noise || 0) > 0.12 || M.playerSpeed(p) > 1.4;
      if (dist < 36 && (felt || dist < 9) && dist < best && !(p.crouch && dist > 12)) { best = dist; prey = p; }
    }
    if (prey) {
      d.lost = 0; c.target = prey.id;
      if (c.state === 'hidden' && best < 19) { c.setState('rumble'); }
      face(c, prey.pos.x, prey.pos.z, dt, 5);
      M.moveToward(c, prey.pos, dt, best > 9 ? c.def.run : c.def.walk, 4);
      if (best < 3.4 && c.cooldown <= 0) c.setState('emerge');
    } else {
      d.lost += dt;
      if (d.lost > 6 && c.state === 'rumble') c.setState('hidden');
      if (d.lost > 3 && (!c.path || c.pathIdx >= c.path.length) && rnd() < dt * 0.3) M.wander(c, 24);
      if (c.path) M.follow(c, dt, c.def.walk * 0.6);
    }
    return;
  }
  if (st === 'emerge') {
    const p = players.find((q) => q.id === c.target) || M.nearest(c, players, 8)?.p;
    if (p) face(c, p.pos.x, p.pos.z, dt, 6);
    if (c.t >= 0.85) {
      for (const q of players) if (flat(q.pos, c.pos) < 3.6 && Math.abs(q.pos.y - c.pos.y) < 3.5) M.attack(c, q, c.dmg, 'dunemaw');
      M.game.creatures.noise(c.pos, 2.5);
      c.setState('attack'); c.cooldown = 3;
    }
    return;
  }
  if (st === 'attack') { if (c.t > 0.7) c.setState('exposed'); return; }
  if (st === 'exposed') { if (c.t > 3.5) { c.setState('hidden'); c.cooldown = 4; } }
}

// ------------------------------------------------------------------------------------------------ Tusked Beast
function tuskBehavior(c, dt, M) {
  const d = c.data, g = M.game, now = g.time || 0;
  if (!d.init) { d.init = true; d.home = c.pos.clone(); d.aggroUntil = 0; d.warn = 0; d.next = 3 + rnd() * 5; d.dir = null; }
  if (d.hitAt && d.hitAt > (d.seenHit || 0)) { d.seenHit = d.hitAt; d.aggroUntil = now + 35; }
  const players = outdoorsPlayers(c, M);
  const aggro = isNight(g) || now < d.aggroUntil;
  const st = c.state;
  if (st === 'windup') {
    const p = players.find((q) => q.id === c.target);
    if (p) face(c, p.pos.x, p.pos.z, dt, 6);
    if (c.t >= 0.8) { d.dir = [Math.sin(c.yaw), Math.cos(c.yaw)]; d.hit = false; c.setState('charge'); }
    return;
  }
  if (st === 'charge') {
    const sp = M.speedMul(c, c.def.run), step = sp * dt, dx = d.dir[0], dz = d.dir[1];
    const cy = c.pos.y + 0.8;
    const wall = g.physics.raycast({ x: c.pos.x, y: cy, z: c.pos.z }, { x: dx, y: 0, z: dz }, step + c.def.radius + 0.2, G.STATIC | G.DOOR);
    if (wall) { c.setState('stunned'); c.stunT = Math.max(c.stunT, 1.3); c.cooldown = 3; return; }
    M.placeAt(c, c.pos.x + dx * step, c.pos.z + dz * step);
    c.yaw = Math.atan2(dx, dz);
    if (!d.hit) for (const p of players) {
      if (flat(p.pos, c.pos) < 1.5 && Math.abs(p.pos.y - c.pos.y) < 2.2) {
        d.hit = true;
        M.attack(c, p, c.dmg, 'tuskbeast');
        g.net.broadcast('fx', { k: 'hshove', to: p.id, d: [+dx.toFixed(2), +dz.toFixed(2)], f: 8 });
      }
    }
    if (c.t > 1.6 || d.hit && c.t > 0.9) { c.setState('idle'); c.cooldown = d.hit ? 3.5 : 2.2; d.warn = 0; }
    return;
  }
  // grazing / walking
  let near = null, nd = 1e9;
  for (const p of players) { const dist = flat(p.pos, c.pos); if (dist < nd) { nd = dist; near = p; } }
  if (near && c.cooldown <= 0) {
    if (aggro && nd < 28 && M.canSee(c, near, 30, 220)) { c.target = near.id; c.setState('windup'); return; }
    if (!aggro && nd < 6.5) {
      d.warn += dt; c.target = near.id; face(c, near.pos.x, near.pos.z, dt, 4);
      if (c.state !== 'idle') c.setState('idle');
      if (d.warn > 2.5) { d.aggroUntil = now + 18; d.warn = 0; }
      return;
    }
  }
  d.warn = Math.max(0, d.warn - dt);
  if (st === 'walk') { if (M.follow(c, dt, c.def.walk)) c.setState('idle'); return; }
  if (c.state === 'stunned') { c.setState('idle'); return; }
  if (c.t > d.next) {
    d.next = 4 + rnd() * 7;
    if (rnd() < 0.55) { const a = rnd() * 6.28, r = 3 + rnd() * 14; M.goTo(c, d.home.x + Math.cos(a) * r, d.home.z + Math.sin(a) * r); c.setState('walk'); }
    else c.setState(rnd() < 0.6 ? 'graze' : 'idle');
  }
}

// ------------------------------------------------------------------------------------------------ Scavenger Raider
function raiderBehavior(c, dt, M) {
  const d = c.data, g = M.game, now = g.time || 0;
  if (!d.init) { d.init = true; d.home = c.pos.clone(); d.mag = 5; d.aimT = 0; d.reload = 0; d.lost = 0; }
  const players = outdoorsPlayers(c, M);
  if (d.hitAt && d.hitAt > (d.seenHit || 0)) { d.seenHit = d.hitAt; if (d.hitBy) { d.alert = { id: d.hitBy, t: now }; } }
  const st = c.state;
  if (st !== 'aim' && atAiming(c)) atCancel(c, M);   // wave 5 aimtell: interrupted -> drop the aim + the group slot
  const target = () => players.find((q) => q.id === c.target);
  if (st === 'reload') { d.reload -= dt; if (d.reload <= 0) { d.mag = 5; c.setState('aim'); d.aimT = 0.3; } return; }
  if (st === 'attack') { if (c.t > 0.18) { c.setState('aim'); d.aimT = 0.4; } return; }
  if (st === 'aim' || st === 'run') {
    const p = target();
    if (!p) { c.setState('idle'); return; }
    const dist = flat(p.pos, c.pos), see = M.canSee(c, p, 26, 360);
    d.lost = see ? 0 : d.lost + dt;
    if (d.lost > 4 || dist > 46) { c.target = null; c.setState('idle'); return; }
    const frozen = atLocked(c);   // wave 5: during the 0.25 s lock it neither turns nor moves (no tracking)
    if (!frozen) face(c, p.pos.x, p.pos.z, dt, 9);
    // range keeping
    if (frozen) { /* stand still while the laser is white */ }
    else if (dist < 5.5) { const ax = c.pos.x + (c.pos.x - p.pos.x), az = c.pos.z + (c.pos.z - p.pos.z); M.goTo(c, ax, az); M.follow(c, dt, c.def.run * 0.8); }
    else if (dist > 15 || !see) M.moveToward(c, p.pos, dt, c.def.run * 0.9);
    if (dist < 1.8 && c.cooldown <= 0) { c.cooldown = 1.2; M.attack(c, p, Math.round(c.dmg * 1.1), 'scavraider'); return; }
    if (!see) { if (c.state !== 'run') c.setState('run'); return; }
    if (c.state !== 'aim') { c.setState('aim'); d.aimT = 0; }
    // wave 5 (aimtell): 'aim' is the posture; the laser only shows once atBegin succeeded (group limit 1-2, 2-4 s cooldown between shots)
    if (!atAiming(c)) { if (atReady(c, M)) atBegin(c, M, p, { state: 'aim' }); return; }
    const ev = atStep(c, dt, M, p);
    if (ev === 'fire') {
      const fwd = V.set(Math.sin(c.yaw), 0, Math.cos(c.yaw));
      atShoot(c, M, p, { muzzle: { x: c.pos.x + fwd.x * 0.7, y: c.pos.y + 1.35, z: c.pos.z + fwd.z * 0.7 }, dmg: c.dmg, cause: 'scavraider', noise: 2 });
      d.mag--; c.setState('attack');
      if (d.mag <= 0) { d.reload = 2.2; c.setState('reload'); }
    }
    return;
  }
  // patrol / idle
  for (const p of players) {
    if (M.canSee(c, p, 24, 130)) {
      c.target = p.id; c.setState('aim'); d.aimT = 0;
      for (const o of g.creatures.host.values()) if (o !== c && o.type === 'scavraider' && !o.dead && o.pos.distanceTo(c.pos) < 26) { o.data.alert = { id: p.id, t: now }; }   // the camp answers
      return;
    }
  }
  if (d.alert && now - d.alert.t < 12) {
    const p = players.find((q) => q.id === d.alert.id);
    if (p) { c.target = p.id; c.setState('run'); return; }
  }
  const n = M.hear(c, 16);
  if (n && st !== 'walk') { M.goToLazy(c, n.pos.x, n.pos.z); c.setState('walk'); }
  if (st === 'walk') { if (M.follow(c, dt, c.def.walk)) c.setState('idle'); return; }
  if (c.t > 4 + rnd() * 5) { const a = rnd() * 6.28, r = 2 + rnd() * 9; M.goTo(c, d.home.x + Math.cos(a) * r, d.home.z + Math.sin(a) * r); c.setState('walk'); }
}

// ------------------------------------------------------------------------------------------------ Cantina Alien (neutral)
function alienBehavior(c, dt, M) {
  const d = c.data, g = M.game, now = g.time || 0;
  if (!d.init) { d.init = true; d.home = c.pos.clone(); d.next = 2 + rnd() * 5; d.barkT = 0; d.mad = 0; d.role = d.role || 'patron'; }
  if (d.hitAt && d.hitAt > (d.seenHit || 0)) { d.seenHit = d.hitAt; d.mad = 30; d.madBy = d.hitBy; }
  d.mad = Math.max(0, d.mad - dt);
  d.barkT -= dt;
  const players = outdoorsPlayers(c, M);
  if (d.mad > 0) {
    // provoked: fight the attacker; run for the door when badly hurt
    const p = players.find((q) => q.id === d.madBy) || M.nearest(c, players, 30)?.p;
    if (c.hp < c.maxHp * 0.35 && p) { c.setState('flee'); const ax = c.pos.x + (c.pos.x - p.pos.x), az = c.pos.z + (c.pos.z - p.pos.z); M.goToLazy(c, ax, az, 4); M.follow(c, dt, c.def.run); return; }
    if (!p) { d.mad = 0; return; }
    const dist = flat(p.pos, c.pos);
    face(c, p.pos.x, p.pos.z, dt, 8);
    if (dist < 1.4 && c.cooldown <= 0) { c.setState('attack'); c.cooldown = 1.1; M.attack(c, p, c.dmg, 'alien_npc'); }
    else if (dist >= 1.4) { c.setState('angry'); M.moveToward(c, p.pos, dt, c.def.run); }
    return;
  }
  if (c.state === 'angry' || c.state === 'attack' || c.state === 'flee') c.setState('idle');
  // greet a nearby player once in a while
  const near = M.nearest(c, players, 5);
  if (near && d.barkT <= 0) {
    d.barkT = 14 + rnd() * 10;
    face(c, near.p.pos.x, near.p.pos.z, dt, 12);
    g.net.broadcast('fx', { k: 'w2bark', id: c.id, t: NPC_LINES[(rnd() * NPC_LINES.length) | 0] });
    c.setState('talk'); c.t = 0;
  }
  if (c.state === 'talk') { if (near) face(c, near.p.pos.x, near.p.pos.z, dt, 5); if (c.t > 3.5) c.setState('idle'); return; }
  if (c.state === 'walk') { if (M.follow(c, dt, c.def.walk * 0.7)) c.setState('idle'); return; }
  if (c.t > d.next) {
    d.next = 4 + rnd() * 8;
    if (d.role === 'bartender') { c.setState(rnd() < 0.5 ? 'talk' : 'idle'); return; }
    const r = rnd();
    if (r < 0.3) { const a = rnd() * 6.28, rr = 0.8 + rnd() * 2.2; M.goTo(c, d.home.x + Math.cos(a) * rr, d.home.z + Math.sin(a) * rr); c.setState('walk'); }
    else c.setState(r < 0.55 ? 'drink' : r < 0.8 ? 'talk' : 'idle');
  }
}

const prowlerChase = chaser({ sight: 26, fov: 170, hearR: 22, reach: 1.5, cd: 1.1, leash: 30 });
function prowlerBehavior(c, dt, M) {
  // day: harmless herd-followers that wander (they never start a hunt before dusk); night: full chaser
  if (!isNight(M.game) && c.state !== 'attack' && c.state !== 'run') { if (c.state === 'idle' && c.t > 3 + rnd() * 4) { M.wander(c, 16); c.setState('walk'); } if (c.state === 'walk' && M.follow(c, dt, c.def.walk)) c.setState('idle'); return; }
  prowlerChase(c, dt, M);
}

// ------------------------------------------------------------------------------------------------ registration
let registered = false;
export function registerWorlds2Creatures() {
  if (registered) return;
  registered = true;
  const BEH = { dunemaw: dunemawBehavior, tuskbeast: tuskBehavior, scavraider: raiderBehavior, alien_npc: alienBehavior, prowler: prowlerBehavior };
  for (const [id, def] of Object.entries(DEFS)) if (!CREATURES[id]) registerCreature(id, { ...def }, BEH[id]);
  for (const def of Object.values(ITEM_DEFS)) if (!ITEMS[def.id]) registerItem({ ...def });
  Object.assign(STATE_SOUNDS, {
    dunemaw: { emerge: [['sandkefal_roar'], 1.0, 1.2], dead: [['creature_death'], 1.0, 0.7] },
    tuskbeast: { windup: [['hound_growl', 'lurker_growl'], 0.9, 0.55], charge: [['giant_growl', 'hound_growl'], 0.9, 0.8], dead: [['creature_death'], 1.0, 0.6], stunned: ['hit_flesh', 0.7, 0.7] },
    scavraider: { aim: [['beep_3', 'turret_detect'], 0.5, 1.4], reload: [['gun_reload', 'shotgun_reload'], 0.8], dead: [['voice_skeleton_die', 'creature_death'], 0.9, 1.1] },
    alien_npc: { talk: [['mimic_voice_1', 'squeak'], 0.5, 0.7], angry: [['yoinker_angry', 'lurker_growl'], 0.8, 1.2], attack: [['hit_flesh'], 0.7], dead: [['creature_death'], 0.8, 1.2] },
    prowler: { run: [['hound_growl'], 0.9, 1.3], attack: [['hound_bark'], 1.0, 1.3], dead: [['creature_death'], 0.9, 1.2] },
  });
  LOOPS.dunemaw = [['rumble', 'sandkefal_rumble', 0.55, 1.4]];
  // scanner rows (identify.js) + which components a kill drops (components.js)
  Object.assign(IDENT, {
    dunemaw: ['Predator', 4, 'Hunts by footsteps: crouch and walk. When it erupts you have 3.5 s to hit it.'],
    tuskbeast: ['Territorial', 3, 'Peaceful until provoked or after dark. Sidestep the straight-line charge.'],
    scavraider: ['Predator', 2, 'Raises its gun for a moment before every shot. Break line of sight, then close in.'],
    alien_npc: ['Territorial', 1, 'Neutral. Leave the patrons alone or the whole bar fights back.'],
    prowler: ['Predator', 3, 'Pack hunters after dusk. Keep your back to a wall.'],
  });
  NO_LOOK.add('dunemaw'); NO_LOOK.add('alien_npc');   // no armour plates on the segmented worm / the neutral bar patrons
  Object.assign(CREATURE_FLAVOUR, { dunemaw: 'organic', tuskbeast: 'organic', scavraider: 'electronic', alien_npc: 'organic', prowler: 'organic' });
}
export { isNight };
