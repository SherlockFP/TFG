// LCMONSTERS wave 8 - creature + item definitions and the host AI (docs/wave8/lcmonsters.md). Everything registers through
// registerCreature / registerItem / STATE_SOUNDS / IDENT and runs inside the generic CreatureManager.hostUpdate, so stun, damage, XP,
// snapshots, balance scaling and balance_rules (0.4 s wind-up, hit cap, grab limits) apply like for any creature.
// The behaviours only decide; anything with world state (circles, marks, the rift) goes through `M.game.lcm` (lcmonsters.js).
import * as THREE from 'three';
import { registerCreature, CREATURES } from './creatures.js';
import { chaser, STATE_SOUNDS, LOOPS } from '../entities/creatures.js';
import { registerItem, ITEMS, SCRAP_TABLE } from './items.js';
import { IDENT } from './identify.js';
import { CREATURE_FLAVOUR } from './components.js';
import { G } from '../physics/physics.js';
import { angleDiff, clamp } from '../core/util.js';
import * as C from './lcmonsters_core.js';

const rnd = Math.random, T = C.TUNE, V = new THREE.Vector3(), V2 = new THREE.Vector3();
export const LC_TYPES = new Set(['lm_witch', 'lm_keeper', 'lm_treater', 'lm_hunter', 'lm_lootmimic', 'lm_masked']);

export const DEFS = {
  lm_witch: { name: 'Blood Witch', hp: 170, dmg: 0, walk: 1.7, run: 2.6, power: 0, xp: 210, coin: 38, zone: 'out', radius: 0.5, height: 2.6, maxAlive: 1, noSpawn: true, noHunt: true, noCompDrop: true,
    deathText: 'was hexed by the Blood Witch.',
    lore: 'A dusk streamer who never goes offline. She paints a blood circle around herself and stares. Stand in the circle while she can see you and the curse lands: you bleed. Break her line of sight (rocks, the ship, trees) and it fades.' },
  lm_keeper: { name: 'Lantern Keeper', hp: 120, dmg: 10, walk: 1.5, run: 2.4, power: 0, xp: 150, coin: 30, zone: 'in', radius: 0.4, height: 2.25, maxAlive: 1, noSpawn: true, noHunt: true, noCompDrop: true, drop: ['lm_lantern', 1],
    deathText: 'was marked by the Lantern Keeper.',
    lore: 'Patrols the dark halls with a lit lantern. Its light does not hurt: it MARKS you, and everything nearby comes to look. Slip behind it and snatch the lantern (E) or smash it for a fat payout.' },
  lm_treater: { name: 'Trick-or-Treater', hp: 40, dmg: 0, walk: 1.5, run: 2.5, power: 0, xp: 40, coin: 5, zone: 'in', radius: 0.4, height: 1.3, maxAlive: 1, noSpawn: true, noHunt: true, noCompDrop: true,
    deathText: 'was tricked.',
    lore: 'Knocks three times, then shuffles up holding a bucket. Take the treat (E) and it is a gamble: loot or credits... or a trick. Walking away is free.' },
  lm_hunter: { name: 'Rift Stalker', hp: T.osHunter.hp, dmg: T.osHunter.dmg, walk: 2.6, run: T.osHunter.run, power: 0, xp: 320, coin: 55, zone: 'in', radius: 0.45, height: 2.5, maxAlive: 1, noSpawn: true, noHunt: true, noCompDrop: true,
    deathText: 'was dragged through the rift.',
    lore: 'Steps out of the wall when the lights blink RUN. The lights flicker when it is near. Its petal face opens half a second before it bites: that is your window.' },
  lm_lootmimic: { name: 'Loot Mimic', hp: 90, dmg: 22, walk: 3.0, run: 6.6, power: 0, xp: 110, coin: 24, zone: 'in', radius: 0.35, height: 0.7, maxAlive: 1, noSpawn: true, noHunt: true, noCompDrop: true, noScan: true, drop: ['lm_fang', 1],
    deathText: 'was bitten by a Loot Mimic.',
    lore: 'A scrap item that is not. It breathes and twitches when nobody grabs it. Grab it and it bites. Hit it first (or take a photo) to find out.' },
  lm_masked: { name: 'Masked', hp: 150, dmg: 8, walk: 1.6, run: 4.4, power: 0, xp: 170, coin: 32, zone: 'in', radius: 0.35, height: 1.8, maxAlive: 2, noSpawn: true, noHunt: true, noCompDrop: true,
    deathText: 'was hugged by a Masked.',
    lore: 'A crewmate in the Company suit wearing a fan mask, walking slowly toward you with its arms out. Its grip is escapable (mash JUMP). If it finishes you, you wear the mask next.' },
};

export const ITEM_DEFS = {
  lm_lantern: { id: 'lm_lantern', name: 'Keeper Lantern', kind: 'scrap', weight: 4, hands: 1, value: T.lanternValue, tier: 'rare', tip: 'Still warm. Pays well.' },
  lm_fang: { id: 'lm_fang', name: 'Mimic Fang', kind: 'scrap', weight: 2, hands: 1, value: [45, 75], tip: 'It bit back. It sells.' },
  lm_mask_smile: { id: 'lm_mask_smile', name: 'Fan Mask (smile)', kind: 'scrap', weight: 2, hands: 1, value: [78, 120], tier: 'rare', mask: true, tip: 'A streamer fan mask. It giggles. Carry it too long and it calls a friend.' },
  lm_mask_cry: { id: 'lm_mask_cry', name: 'Fan Mask (cry)', kind: 'scrap', weight: 2, hands: 1, value: [78, 120], tier: 'rare', mask: true, tip: 'A streamer fan mask. It weeps. Carry it too long and it calls a friend.' },
};

// ------------------------------------------------------------------------------------------------ helpers
const face = (c, x, z, dt, rate = 9) => { const want = Math.atan2(x - c.pos.x, z - c.pos.z); c.yaw += clamp(angleDiff(c.yaw, want), -rate * dt, rate * dt); };
const outPl = (c, M) => M.playersFor(c).filter((p) => !p.inShip && !p.dead);
/** one-shot creature sound for everyone (cev 'snd' handled by CreatureManager.onEvent) */
export function csnd(M, c, names, v = 0.8, pt = 1, ref = 4, max = 45) { M.game.net.broadcast('cev', { e: 'snd', id: c.id, s: names, v, pt, ref, max }); }
const lcm = (M) => M.game.lcm;
function idleWalk(c, dt, M, speed, radius = 14, gap = 3) {
  if (c.state === 'idle' && c.t > gap + rnd() * 3) { M.wander(c, radius); c.setState('walk'); }
  else if (c.state === 'walk' && M.follow(c, dt, speed)) c.setState('idle');
}
const eyePos = (c, y = 1.6) => V.set(c.pos.x, c.pos.y + y, c.pos.z);

// ------------------------------------------------------------------------------------------------ Blood Witch
function witch(c, dt, M) {
  const d = c.data, L = lcm(M);
  if (!d.init) { d.init = 1; d.castT = 6; d.life = 210 + rnd() * 70; c.setState('walk'); }
  d.life -= dt;
  if (d.life <= 0) { L?.despawn(c); return; }
  const n = M.nearest(c, outPl(c, M), 80);
  if (c.state === 'ritual') {
    if (n) face(c, n.p.pos.x, n.p.pos.z, dt, 4);
    if (c.t >= T.castS) { L?.circleLive(c); c.setState('walk'); d.castT = 22 + rnd() * 10; }
    return;
  }
  d.castT -= dt;
  if (n && n.d < 44 && d.castT <= 0) { c.setState('ritual'); L?.circleBegin(c); return; }
  if (!n) { idleWalk(c, dt, M, c.def.walk, 24, 4); return; }
  face(c, n.p.pos.x, n.p.pos.z, dt, 3);
  if (n.d > 20) { c.setState('walk'); M.moveToward(c, n.p.pos, dt, c.def.walk); }
  else if (n.d < 9) { c.setState('walk'); V2.set(c.pos.x * 2 - n.p.pos.x, c.pos.y, c.pos.z * 2 - n.p.pos.z); M.moveToward(c, V2, dt, c.def.walk * 1.2); }   // she keeps her distance: the circle is her weapon
  else c.setState('idle');
}

// ------------------------------------------------------------------------------------------------ Lantern Keeper
function keeper(c, dt, M) {
  const d = c.data, L = lcm(M);
  if (!d.init) { d.init = 1; d.life = 300; d.beamT = 0.5; d.dir = rnd() < 0.5 ? 1 : -1; d.clink = 2; c.setState('walk'); }
  d.life -= dt;
  if (d.life <= 0 || (c.state === 'dark' && c.t > 40)) { L?.despawn(c); return; }
  if (c.state === 'dark') { idleWalk(c, dt, M, 1.1, 12, 2); return; }
  if (c.state === 'idle') { c.yaw += 0.55 * d.dir * dt; if (c.t > 3 + rnd()) { d.dir = -d.dir; M.wander(c, 18); c.setState('walk'); } }
  else if (M.follow(c, dt, c.def.walk)) c.setState('idle');
  d.clink -= dt;
  if (d.clink <= 0) { d.clink = 3.4 + rnd() * 1.6; csnd(M, c, ['glass', 'bell_ding'], 0.32, 1.9, 3, 30); }   // telegraph: a faint chime of the lantern cage
  d.beamT -= dt;
  if (d.beamT <= 0) {
    d.beamT = 0.2;
    const o = eyePos(c, 1.3);
    for (const p of M.playersFor(c)) {
      if (p.inShip || p.dead || Math.abs(p.pos.y - c.pos.y) > 3) continue;
      if (C.inBeam(c.pos.x, c.pos.z, c.yaw, p.pos.x, p.pos.z) && M.game.physics.lineOfSight(o, p.eye, G.STATIC | G.DOOR)) { L?.mark(p.id, c); M.game.feedcams?.expose?.(p.id, Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z), 'k'); }   // the beam is a mobile camera (feedcams2)
    }
  }
}

// ------------------------------------------------------------------------------------------------ Trick-or-Treater
function treater(c, dt, M) {
  const d = c.data, L = lcm(M);
  if (!d.init) { d.init = 1; d.life = T.treatStay; d.knocks = 0; c.setState('knock'); }
  if (c.state === 'done') { if (c.t > 2.4) L?.despawn(c); return; }
  d.life -= dt;
  if (d.life <= 0) { L?.despawn(c); return; }
  const n = M.nearest(c, M.playersFor(c).filter((p) => !p.dead && !p.inShip), 60);
  if (c.state === 'knock') {
    if (n) face(c, n.p.pos.x, n.p.pos.z, dt, 6);
    if (d.knocks < 3 && c.t > 0.5 + d.knocks * 0.85) { d.knocks++; csnd(M, c, ['door_knock', 'lockpick_click', 'hit_flesh'], 1, 0.45, 8, 55); }   // KNOCK KNOCK KNOCK: the telegraph
    if (c.t > 3.6) c.setState('walk');
    return;
  }
  if (!n) return;
  face(c, n.p.pos.x, n.p.pos.z, dt, 6);
  if (c.state === 'idle') { if (n.d > T.treatReach + 0.8) c.setState('walk'); return; }   // holds the bucket out until you step away
  if (n.d <= T.treatReach - 0.6) { c.setState('idle'); csnd(M, c, ['mimic_voice_1', 'whisper'], 0.5, 1.5, 4, 25); return; }
  c.setState('walk'); M.moveToward(c, n.p.pos, dt, c.def.walk);
}

// ------------------------------------------------------------------------------------------------ Rift Stalker
const hunterChase = chaser({ sight: 30, fov: 220, hearR: 24, reach: 1.8, cd: 1.5, leash: 40 });
function hunter(c, dt, M) {
  const d = c.data, L = lcm(M);
  if (!d.init) { d.init = 1; d.lostT = 0; c.setState('emerge'); }
  if (c.state === 'emerge') { if (c.t > 1.2) c.setState('run'); return; }
  const pl = M.playersFor(c).filter((p) => !p.inShip && !p.dead);
  d.lostT = pl.length && M.nearest(c, pl, 50) ? 0 : d.lostT + dt;
  if (d.lostT > T.osChaseMax) { L?.despawn(c); return; }
  if (!c.target && c.state !== 'attack') { const n = M.nearest(c, pl, 45); if (n) { c.target = n.p.id; c.setState('run'); } }   // it always finds somebody: the rift is a personal invitation
  hunterChase(c, dt, M);
}

// ------------------------------------------------------------------------------------------------ Loot Mimic
function lootMimic(c, dt, M) {
  const d = c.data, L = lcm(M);
  if (!d.init) { d.init = 1; d.creak = 8 + rnd() * 10; d.home = c.pos.clone(); c.setState('idle'); }
  const pl = M.playersFor(c).filter((p) => !p.dead && !p.inShip);
  if (!d.woke) {
    if (c.hp < c.maxHp) { d.woke = true; d.awake = 0; }                       // hit first (or shot / stunned / grenaded): the disguise is over
    else {
      d.creak -= dt;
      const n = M.nearest(c, pl, 14);
      if (d.creak <= 0 && n) { d.creak = 14 + rnd() * 16; csnd(M, c, ['door_creak_1', 'door_creak', 'squeak'], 0.26, 1.7, 2, 14); }   // audio tell (the visual tell is breathing + a twitch)
      return;
    }
  }
  d.awake = (d.awake || 0) + dt;
  const p = pl.find((q) => q.id === d.tid) || M.nearest(c, pl, 32)?.p;
  if (!p || p.pos.distanceTo(c.pos) > 40 || (d.awake > 16 && p.pos.distanceTo(c.pos) > 14)) { d.woke = false; d.tid = null; c.target = null; c.setState('idle'); return; }   // loses you: goes back to being loot
  d.tid = p.id;
  const dist = p.pos.distanceTo(c.pos);
  face(c, p.pos.x, p.pos.z, dt, 12);
  if (dist < (d.first ? 1.5 : 2.3) && Math.abs(p.pos.y - c.pos.y) < 2) {
    if (c.cooldown <= 0) { c.setState('attack'); c.cooldown = 1.3; d.first = 1; M.attack(c, p, c.dmg, 'lm_lootmimic'); }
    else if (c.state === 'attack' && c.t > 0.6) c.setState('run');
    return;
  }
  if (c.state === 'attack' && c.t < 0.45) return;
  c.setState('run'); M.moveToward(c, p.pos, dt, c.def.run);
}

// ------------------------------------------------------------------------------------------------ Masked
function masked(c, dt, M) {
  const d = c.data, L = lcm(M);
  if (!d.init) { d.init = 1; d.voiceT = 4 + rnd() * 6; d.life = 400; c.setState('walk'); }
  d.life -= dt;
  if (d.life <= 0) { L?.despawn(c); return; }
  d.voiceT -= dt;
  const pl = M.playersFor(c).filter((p) => !p.dead && !p.inShip);
  const nn = M.nearest(c, pl, 40);
  if (d.voiceT <= 0 && nn) { d.voiceT = 7 + rnd() * 9; csnd(M, c, [c.seed % 2 ? 'mimic_voice_2' : 'mimic_voice_1'], 0.4, c.seed % 2 ? 1.25 : 0.7, 3, 26); }   // laughing (smile) / crying (cry): the tell
  if (c.state === 'grab') {
    const p = pl.find((q) => q.id === c.target);
    const free = !p || M.game.balRules?.book?.isFree?.(p.id, M.game.time);
    if (free || c.t > T.holdSafe) { c.target = null; c.cooldown = 4; c.setState('walk'); return; }
    M.game.hostHoldPlayer(p.id, p.pos);                                            // balance_rules caps the hold at 3.2 s + 4 s immunity; JUMP x5 breaks it
    d.tick = (d.tick || 0) - dt;
    if (d.tick <= 0) { d.tick = 0.9; M.attack(c, p, c.dmg, 'lm_masked'); L?.maskedHit(p.id); }
    return;
  }
  const n = M.nearest(c, pl, 22);
  if (!n || !M.canSee(c, n.p, 22, 150)) { d.seen = Math.max(0, (d.seen || 0) - dt); if (d.seen <= 0) idleWalk(c, dt, M, c.def.walk, 16, 3); return; }
  d.seen = 6;                                                                        // remembers you for a while
  face(c, n.p.pos.x, n.p.pos.z, dt, 5);
  if (n.d < 1.35 && c.cooldown <= 0 && Math.abs(n.p.pos.y - c.pos.y) < 2) { c.target = n.p.id; c.setState('grab'); d.tick = 0.4; L?.maskedHit(n.p.id); return; }
  c.setState(n.d < 7 ? 'run' : 'walk');                                              // walks slowly at you, arms out, then a stiff jog (4.4 m/s: slower than a sprint)
  M.moveToward(c, n.p.pos, dt, n.d < 7 ? c.def.run : c.def.walk * 1.5);
}

export const BEH = { lm_witch: witch, lm_keeper: keeper, lm_treater: treater, lm_hunter: hunter, lm_lootmimic: lootMimic, lm_masked: masked };

// ------------------------------------------------------------------------------------------------ registration
let registered = false;
export function registerLcContent() {
  if (registered) return;
  registered = true;
  for (const [id, def] of Object.entries(DEFS)) if (!CREATURES[id]) registerCreature(id, { ...def }, BEH[id]);
  for (const def of Object.values(ITEM_DEFS)) if (!ITEMS[def.id]) registerItem({ ...def });
  for (const tbl of Object.values(SCRAP_TABLE)) if (Array.isArray(tbl) && !tbl.some((e) => e[0] === 'lm_mask_smile')) tbl.push(['lm_mask_smile', 0.9], ['lm_mask_cry', 0.9]);
  Object.assign(STATE_SOUNDS, {
    lm_witch: { ritual: [['whisper', 'mimic_voice_1'], 0.9, 0.55], dead: [['creature_death'], 1, 0.6], stunned: ['hit_flesh', 0.7, 0.7] },
    lm_keeper: { dark: [['glass_break', 'glass'], 0.8, 0.8], dead: [['glass_break', 'creature_death'], 0.9, 0.7], stunned: ['hit_flesh', 0.7, 0.7] },
    lm_treater: { dead: [['creature_death'], 0.7, 1.4] },
    lm_hunter: { emerge: [['mon_scream', 'jester_scream'], 0.9, 0.7], attack: [['lurker_growl', 'hound_growl'], 1, 0.7], run: [['hound_growl'], 0.7, 0.55], dead: [['creature_death'], 1, 0.6], stunned: ['hit_flesh', 0.7, 0.7] },
    lm_lootmimic: { attack: [['lurker_snap', 'hound_bark'], 1, 1.25], run: [['hound_growl'], 0.6, 1.5], dead: [['creature_death'], 0.8, 1.3], stunned: ['hit_flesh', 0.7, 1] },
    lm_masked: { grab: [['mimic_voice_2', 'whisper'], 0.9, 0.6], dead: [['creature_death'], 0.8, 0.9], stunned: ['hit_flesh', 0.7, 0.8] },
  });
  LOOPS.lm_witch = [['ritual', 'heartbeat', 0.8, 0.75]];
  LOOPS.lm_hunter = [['*', 'lights_buzz', 0.32, 0.6]];
  Object.assign(IDENT, {
    lm_witch: ['Stalker', 3, 'Her circle only works while she can see you. Break line of sight (rock, ship, tree).'],
    lm_keeper: ['Stalker', 3, 'Its light only marks you. Circle behind it and snatch the lantern (E) for loot.'],
    lm_treater: ['Anomaly', 1, 'Harmless until you take the treat. Walking away is free.'],
    lm_hunter: ['Predator', 4, 'Lights flicker when it is near. Its petals open 0.5 s before the bite.'],
    lm_lootmimic: ['Mimic', 2, 'Loot that breathes and twitches. Hit it first, or photograph it.'],
    lm_masked: ['Mimic', 3, 'Slow. Mash JUMP to break its grip. If it finishes you, you wear the mask.'],
  });
  Object.assign(CREATURE_FLAVOUR, { lm_witch: 'organic', lm_keeper: 'organic', lm_treater: 'organic', lm_hunter: 'organic', lm_lootmimic: 'organic', lm_masked: 'organic' });
}
