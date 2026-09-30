// CREATURES12 wave 12 - definitions, host AI and registration of 404, THE COOKIE, THE ECHO CHAMBER and THE LAG SPIKE (docs/wave12/creatures12.md).
// Runs inside the generic CreatureManager.hostUpdate (stun, damage, XP, snapshots, balance scaling apply as for any creature). One rule each:
//   404      'seek' (nearest player in the facility, slow, relentless) -> 'windup' 1.0 s (static burst, step out of 3.6 m to cancel) -> 'attack' (DOWNS the target) -> 'off' 2.6 s.
//            Invisible on the client unless scanned / drone view / flashlight glitch (creatures12_fx.js); the ship radar dot is the crew's early warning.
//   COOKIE   'crawl' (hunts a player with no cookie yet) -> 'prime' 0.8 s (hops, ticks) -> 'follow' (latched on the back: every creature hears that player every 1.6 s)
//            -> dies when a teammate pulls it off (hold E) or the victim clears cookies at the ship terminal.
//   ECHO     'dormant' (listens: records the crew's sounds) -> 'feed' (replays them in a far room, weak point glowing, x2.5 damage) -> 'dormant'.
//   LAG      'fly' (drifts towards the crew) -> 'scan' 1.5 s (zone shimmers + frame-stutter) -> 'active' 12 s (6 m lag zone, applied on each client) -> 'off' 5 s.
import * as THREE from 'three';
import { registerCreature, CREATURES, EXTRA_SPAWNS } from './creatures.js';
import { STATE_SOUNDS, LOOPS } from '../entities/creatures.js';
import { IDENT } from './identify.js';
import { CREATURE_FLAVOUR } from './components.js';
import { NO_TELL } from './creature_read.js';
import { FIELD_NOTES } from './collection.js';
import { angleDiff, clamp } from '../core/util.js';
import * as C from './creatures12_core.js';

const rnd = Math.random;
const { nf: NF, cookie: CK, echo: EC, lag: LG } = C.IDS;
const TN = C.TUNE.nf, TC = C.TUNE.ck, TE = C.TUNE.echo, TL = C.TUNE.lag;

/** host state shared with the installer: the game (set by the installer) */
export const ST = { g: null };

export const DEFS = {
  [NF]: { name: '404', hp: 200, dmg: 60, walk: TN.walk, run: TN.walk, power: 2, xp: 240, coin: 42, zone: 'in', radius: 0.5, height: 2.1, maxAlive: 1,
    deathText: 'ended up as a 404: NOT FOUND.',
    lore: 'You cannot see it. Scan to make it show, or watch the ship radar and the drone feed; a flashlight beam only makes it glitch for a blink. '
      + 'It is slow but never stops, and when the screen fills with static you have one second to get out of its reach before the hit puts you on the floor.' },
  [CK]: { name: 'The Cookie', hp: 14, dmg: 1, walk: TC.walk, run: TC.run, power: 0.5, xp: 70, coin: 14, zone: 'in', radius: 0.2, height: 0.3, maxAlive: 2,
    deathText: 'accepted all cookies.',
    lore: 'A crumb that crawls up your back without a sound. While it sits there every creature in the facility knows where you are, and after six seconds a TRACKING ENABLED ribbon gives you away. '
      + 'You cannot reach it yourself: a teammate has to pull it off (hold E), or you clear cookies at the ship terminal.' },
  [EC]: { name: 'The Echo Chamber', hp: 160, dmg: 0, walk: 0, run: 0, power: 1.5, xp: 160, coin: 32, zone: 'in', radius: 0.9, height: 2.2, maxAlive: 1,
    deathText: 'followed a sound that was never there.',
    lore: 'A stationary organ in the biggest room. It records what your crew does loudly (sprinting, dropped scrap, gunshots, voices) and replays it in a far room, so creatures and crewmates go looking. '
      + 'While it replays its weak point glows: hit it then for extra damage. Walk quietly and it has nothing to play.' },
  [LG]: { name: 'The Lag Spike', hp: 90, dmg: 0, walk: TL.walk, run: TL.walk, power: 1.5, xp: 120, coin: 24, zone: 'in', radius: 0.5, height: 2.2, maxAlive: 1,
    deathText: 'was lost to lag.',
    lore: 'A floating corrupted cube. When its zone shimmers and the frame stutters, get out of the 6 m ring: inside, your position snaps back every second and a half and your steps arrive late. '
      + 'Creatures are not slowed by it. Shoot it or wait it out (12 s).' },
};
export const HINTS = {
  [NF]: 'Invisible: scan (middle mouse), the drone or the ship radar show it. Static on your screen = it is close; step out of its reach during the 1 s burst.',
  [CK]: 'Silent. A teammate pulls it off your back (hold E), or clear cookies at the ship terminal. Until then every creature hears you.',
  [EC]: 'Walk quietly near it. When its weak point glows it is replaying your noise elsewhere: hit it then, and do not follow the sound.',
  [LG]: 'Shimmer + stutter = leave the 6 m ring. Inside, you rubber-band and your input lags. Shoot the cube or wait 12 s.',
};
export const NOTES = {
  [NF]: 'Flashlight sweeps only make it glitch for 0.3 s. A scan pulse shows it for 2.5 s: use that to walk around it. It is slower than a walking crewmate.',
  [CK]: 'Check on each other: a small amber crumb on a teammate\'s back is a cookie. It never damages anyone; it makes everything else come to the victim.',
  [EC]: 'Its tape needs six loud sounds. Crouch or sneak past and it stays silent. Replays happen at least 18 m away from it.',
  [LG]: 'The zone ring on the floor is the safe boundary. Do not fight creatures inside it: rubber-banding drags you back into their reach.',
};

// ------------------------------------------------------------------------------------------------ helpers
const face = (c, x, z, dt, rate = 9) => { const want = Math.atan2(x - c.pos.x, z - c.pos.z); c.yaw += clamp(angleDiff(c.yaw, want), -rate * dt, rate * dt); };
const walkers = (c, M) => M.playersFor(c).filter((p) => !p.dead && !p.inShip);
const rrange = ([a, b]) => a + rnd() * (b - a);
const floorOf = (M, c) => M.game.world?.facility?.layout?.y ?? c.pos.y;
const fx = (M, d) => M.game.net.broadcast('c12fx', d);
const live = (M, type) => { const o = []; for (const c of M.host?.values?.() || []) if (c.type === type && !c.dead) o.push(c); return o; };
const carriedIds = (M) => { const s = new Set(); for (const k of live(M, CK)) if (k.state === 'follow' && typeof k.extra === 'string') s.add(k.extra); return s; };

// ------------------------------------------------------------------------------------------------ 404
function notFound(c, dt, M) {
  const d = c.data;
  if (!d.init) { d.init = 1; d.tid = null; d.rt = 0; c.setState('seek'); }
  const pl = walkers(c, M);
  if (c.state === 'stunned' || c.state === 'idle') c.setState('seek');
  if (c.state === 'off') { c.extra = 0; if (c.t >= TN.off) c.setState('seek'); return; }
  let tp = d.tid ? pl.find((p) => p.id === d.tid) || null : null;
  if (c.state === 'seek') {
    c.extra = 0;
    d.rt -= dt;
    if (!tp || d.rt <= 0) { d.rt = 1; const n = M.nearest(c, pl, TN.senseR); tp = n ? n.p : null; d.tid = tp ? tp.id : null; }
    if (!tp) { if (!c.path || M.follow(c, dt, c.def.walk * 0.6)) M.wander(c, 16); return; }
    face(c, tp.pos.x, tp.pos.z, dt, 6);
    const dist = Math.hypot(tp.pos.x - c.pos.x, tp.pos.z - c.pos.z);
    if (dist < TN.trigger && Math.abs(tp.pos.y - c.pos.y) < 2.2 && c.cooldown <= 0 && c.age > 1) { c.setState('windup'); return; }
    M.moveToward(c, tp.pos, dt, c.def.walk);
    return;
  }
  if (c.state === 'windup') {                                   // 1.0 s of static: everything within ~11 m sees the screen fill up
    c.extra = clamp(c.t / TN.windup, 0, 1);
    if (!tp) { c.cooldown = 1.5; c.setState('seek'); return; }
    face(c, tp.pos.x, tp.pos.z, dt, 5);
    const dist = Math.hypot(tp.pos.x - c.pos.x, tp.pos.z - c.pos.z);
    if (dist > TN.cancelR) { c.cooldown = 1.5; c.setState('seek'); return; }   // you stepped out: the burst fizzles
    if (c.t >= TN.windup) {
      if (dist <= TN.hitReach && Math.abs(tp.pos.y - c.pos.y) < 2.2) downHit(c, tp, M);
      c.cooldown = 3; c.setState('attack');
    }
    return;
  }
  if (c.state === 'attack') { c.extra = 0; if (c.t >= TN.attackT) c.setState('off'); }
}
/** the 404 hit: a lethal one (the game's downed module turns 0 HP into DOWN on Casual / Standard, death on Hard). Never a kill at the entrance / ship: there it is a normal capped hit. */
function downHit(c, p, M) {
  if (M.nearSafeZone(p)) { M.attack(c, p, c.dmg, NF, true); return; }
  M.game.hostHurtPlayer?.(p.id, 999, NF, null, c.pos);
}

// ------------------------------------------------------------------------------------------------ COOKIE
function cookie(c, dt, M) {
  const d = c.data;
  if (!d.init) { d.init = 1; d.retry = 0; d.ping = TC.ping; d.tid = null; c.setState('crawl'); }
  const all = M.playersFor({ zone: 'any' }).filter((p) => !p.dead);
  if (c.state === 'follow') { follow(c, dt, M, all); return; }
  if (c.state === 'stunned' || c.state === 'idle') c.setState('crawl');
  d.retry = Math.max(0, d.retry - dt);
  const pl = all.filter((p) => !p.inShip && p.zone === c.zone);
  const carried = carriedIds(M);
  if (c.state === 'crawl') {
    c.extra = 0;
    const tp = C.pickHost(pl, c.pos, carried);
    d.tid = tp ? tp.id : null;
    if (!tp) { if (!c.path || M.follow(c, dt, c.def.walk * 0.6)) M.wander(c, 12); return; }
    if (d.retry <= 0 && Math.hypot(tp.pos.x - c.pos.x, tp.pos.z - c.pos.z) < TC.primeR) { c.setState('prime'); return; }
    M.moveToward(c, tp.pos, dt, c.def.walk + (M.playerSpeed?.(tp) < 1 ? 0 : 0.8));
    return;
  }
  if (c.state === 'prime') {                                    // 0.8 s of hopping in place, then the leap
    c.extra = clamp(c.t / TC.prime, 0, 1);
    const tp = pl.find((p) => p.id === d.tid);
    if (!tp) { c.setState('crawl'); return; }
    face(c, tp.pos.x, tp.pos.z, dt, 10);
    if (c.t >= TC.prime) {
      if (Math.hypot(tp.pos.x - c.pos.x, tp.pos.z - c.pos.z) <= TC.latchR && !carried.has(tp.id)) { d.since = 0; c.extra = tp.id; c.setState('follow'); }
      else { d.retry = TC.retry; c.extra = 0; c.setState('crawl'); }
    }
  }
}
function follow(c, dt, M, all) {
  const d = c.data, tp = all.find((p) => p.id === c.extra);
  if (!tp) { c.extra = 0; c.setState('crawl'); return; }         // the victim died: it falls off and hunts again
  const s = C.backSpot(tp.pos, tp.look);
  c.pos.set(s.x, s.y, s.z); c.yaw = Math.atan2(tp.look.x, tp.look.z); c.zone = tp.zone; c.path = null;
  d.since = (d.since || 0) + dt;
  d.ping -= dt;
  if (d.ping <= 0) {                                            // every creature that can hear hears the victim, as if they were shouting
    d.ping = TC.ping;
    if (tp.zone === 'in' && !tp.inShip) M.noises.push({ pos: tp.pos.clone(), loud: TC.loud, t: 0.6, owner: tp.id, zone: tp.zone });
  }
}
/** host: a crewmate holds E on a cookied player. Returns true when the cookie came off. */
export function pullCookie(M, cid, from) {
  const c = M.host?.get?.(cid);
  if (!c || c.dead || c.type !== CK || c.state !== 'follow' || typeof c.extra !== 'string' || c.extra === from) return false;
  const ps = M.game.aiPlayers(), me = ps.find((p) => p.id === from), vic = ps.find((p) => p.id === c.extra);
  if (!me || me.dead || !vic || me.zone !== vic.zone || Math.hypot(me.pos.x - vic.pos.x, me.pos.z - vic.pos.z) > TC.hostPullR || Math.abs(me.pos.y - vic.pos.y) > 2.2) return false;
  const victim = c.extra;
  M.game.net.broadcast('c12fx', { k: 'pulled', by: from, v: victim });
  M.kill(c, from);
  return true;
}
/** host: a victim runs CLEAR COOKIES at the ship terminal. Returns how many came off (0 = not aboard / none attached). */
export function clearCookies(M, pid) {
  const p = M.game.aiPlayers().find((q) => q.id === pid);
  if (!p || p.dead || !p.inShip) return -1;
  let n = 0;
  for (const c of live(M, CK)) if (c.state === 'follow' && c.extra === pid) { M.kill(c, null, { silent: true }); n++; }
  if (n) M.game.net.broadcast('c12fx', { k: 'cleared', v: pid, n });
  return n;
}

// ------------------------------------------------------------------------------------------------ ECHO CHAMBER
function placeChamber(c, M) {
  const F = M.game.world?.facility, L = F?.layout;
  if (!L?.rooms?.length) return;
  const rm = C.bigRoom(L.rooms, L.distOf && L.idx ? (r) => Math.max(0, L.distOf[L.idx(r.cx, r.cz)] || 0) : null);
  if (!rm) return;
  let x = L.ox + (rm.cx + 0.5) * L.cell, z = L.oz + (rm.cz + 0.5) * L.cell;
  const nav = F.nav;
  try { if (nav && !nav.walkableAt(x, z)) { const g = nav.nearestWalkable(...nav.toGrid(x, z), 6); if (g) { const w = nav.toWorld(g[0], g[1]); x = w.x; z = w.z; } } } catch { /* keep the room centre */ }
  c.pos.set(x, L.y, z); c.home.copy(c.pos);
}
/** room centres the replay may fake sounds in */
function lureCandidates(M, c) {
  const F = M.game.world?.facility, L = F?.layout, out = [];
  if (!L?.rooms) return out;
  for (const r of L.rooms) {
    if (r.type === 'vault') continue;
    let x = L.ox + (r.cx + 0.5) * L.cell, z = L.oz + (r.cz + 0.5) * L.cell;
    try { const nav = F.nav; if (nav && !nav.walkableAt(x, z)) { const g = nav.nearestWalkable(...nav.toGrid(x, z), 4); if (!g) continue; const w = nav.toWorld(g[0], g[1]); x = w.x; z = w.z; } } catch { /* keep */ }
    out.push({ x, z });
  }
  return out;
}
/** wrapped CreatureManager.noise: every host noise event near a listening chamber goes onto its tape */
export function hearNoise(M, pos, loud) {
  for (const c of live(M, EC)) {
    if (c.state !== 'dormant' || !c.data.tape || c.data.cool > 0) continue;
    if (Math.hypot(pos.x - c.pos.x, pos.z - c.pos.z) < TE.ear) c.data.tape.add(C.kindOfNoise(loud), loud);
  }
}
function echo(c, dt, M) {
  const d = c.data;
  if (!d.init) { d.init = 1; d.tape = new C.Tape(); d.cool = 3; d.hp = c.hp; placeChamber(c, M); c.setState('dormant'); }
  if (c.state === 'stunned' || c.state === 'idle') c.setState(d.plan ? 'feed' : 'dormant');
  // the weak point: while it replays, hits count x2.5
  if (c.hp < d.hp - 0.01) { const drop = d.hp - c.hp; d.hp = c.hp; if (c.state === 'feed' && !d.weak) { d.weak = 1; M.damage(c.id, drop * (TE.weakMul - 1), 'weakpoint', {}); d.weak = 0; d.hp = c.hp; } }
  d.hp = Math.min(d.hp, c.hp);
  if (c.dead) return;
  const T = d.tape;
  if (c.state === 'dormant') {
    d.cool = Math.max(0, d.cool - dt);
    T.tick(dt);
    if (T.ev.length && T.t - T.ev[T.ev.length - 1].t > 40) T.clear();     // a stale tape is forgotten
    if (d.cool <= 0) {
      for (const p of walkers(c, M)) {                                   // footsteps and voice come from the players themselves; item drops / bangs arrive through hearNoise
        if (Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z) > TE.ear) continue;
        if (p.noise > 0) T.add('step', p.noise);
        if (p.voice > 0) T.add('voice', p.voice);
      }
    }
    c.extra = T.fill;
    if (d.cool <= 0 && T.ready) {
      const cands = lureCandidates(M, c), spot = C.pickLureSpot(cands, c.pos, walkers(c, M), rnd());
      if (spot) { d.spot = spot; d.plan = T.plan(); d.i = 0; c.extra = 1; c.setState('feed'); }
      else { T.clear(); d.cool = TE.cool; }
    }
    return;
  }
  if (c.state === 'feed') {                                             // replay the tape in the far room; the chamber itself is silent-ish and glows
    c.extra = 1;
    const plan = d.plan || [], y = floorOf(M, c);
    while (d.i < plan.length && plan[d.i].at <= c.t) {
      const e = plan[d.i++], j = () => (rnd() - 0.5) * 4;
      const snd = e.k === 'step' ? (rnd() < 0.5 ? 'step_concrete_1' : 'step_metal_1') : e.k === 'voice' ? 'c12_echo_voice' : e.k === 'bang' ? 'hit_metal' : 'item_drop';
      const px = d.spot.x + j(), pz = d.spot.z + j();
      M.game.net.broadcast('fx', { k: 'snd', s: snd, p: [px, y + 1, pz], v: clamp(0.45 + e.loud * 0.25, 0.4, 1), r: 4, m: 55, pt: 0.95 + rnd() * 0.1 });
      M.noises.push({ pos: new THREE.Vector3(px, y, pz), loud: clamp(e.loud * 1.4, 0.8, 3), t: 0.6, owner: 'c12_echo', zone: 'in' });
    }
    if (d.i >= plan.length && c.t >= (plan.length ? plan[plan.length - 1].at : 0) + 1) { T.clear(); d.plan = null; d.cool = TE.cool; c.extra = 0; c.setState('dormant'); }
  }
}

// ------------------------------------------------------------------------------------------------ LAG SPIKE
function lag(c, dt, M) {
  const d = c.data;
  if (!d.init) { d.init = 1; d.cool = 4 + rnd() * 4; c.setState('fly'); }
  if (c.state === 'stunned' || c.state === 'idle') { d.cool = Math.max(d.cool, 3); c.setState('fly'); }
  const pl = walkers(c, M);
  const near = pl.some((p) => Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z) < TL.trigger && Math.abs(p.pos.y - c.pos.y) < TL.zoneDy);
  if (c.state === 'fly') {
    d.cool = Math.max(0, d.cool - dt); c.extra = 0;
    if (!c.path || M.follow(c, dt, c.def.walk)) {
      const n = M.nearest(c, pl, 60);
      if (n && rnd() < 0.7) M.goTo(c, n.p.pos.x + (rnd() - 0.5) * 8, n.p.pos.z + (rnd() - 0.5) * 8); else M.wander(c, 14);
    }
  }
  const nx = C.lagNext({ state: c.state, t: c.t, cool: d.cool }, near, TL);
  if (nx) { if (nx === 'off') d.cool = rrange(TL.rest); c.setState(nx); }
  if (c.state === 'scan') c.extra = clamp(c.t / TL.shimmer, 0, 1);
  else if (c.state === 'active') c.extra = clamp(1 - c.t / TL.active, 0.02, 1);
  else if (c.state === 'off') c.extra = 0;
}

export const BEH = { [NF]: notFound, [CK]: cookie, [EC]: echo, [LG]: lag };

// ------------------------------------------------------------------------------------------------ registration
let registered = false, gateGame = null;
/** the game whose run.quotaIndex gates the generic spawners (null = blocked: nothing spawns without a run) */
export function setC12Game(g) { gateGame = g; ST.g = g; }
export function registerC12Content() {
  if (!registered) {
    registered = true;
    for (const [id, def] of Object.entries(DEFS)) if (!CREATURES[id]) registerCreature(id, { ...def }, BEH[id]);
    for (const [id, e] of Object.entries(C.TUNE.spawn)) if (!EXTRA_SPAWNS[id]) EXTRA_SPAWNS[id] = { ...e };
    Object.assign(STATE_SOUNDS, {
      [NF]: { windup: [['c12_404_burst', 'lockdown_siren'], 1, 1], attack: [['c12_404_hit', 'hit_flesh'], 1, 1], off: [['c12_404_gone', 'light_flicker'], 0.6, 1], dead: [['c12_404_die', 'creature_death'], 0.9, 1], stunned: ['hit_flesh', 0.6, 0.8] },
      [CK]: { prime: [['c12_cookie_tick', 'chat_blip'], 0.5, 1], follow: [['c12_cookie_latch', 'hit_flesh'], 0.22, 1.2], dead: [['c12_cookie_crumb', 'glass_break'], 0.7, 1] },
      [EC]: { feed: [['c12_echo_play', 'lurker_growl'], 1, 1], dormant: [['c12_echo_done', 'light_flicker'], 0.5, 1], dead: [['c12_echo_die', 'creature_death'], 0.9, 1], stunned: ['hit_flesh', 0.6, 0.8] },
      [LG]: { scan: [['c12_lag_stutter', 'light_flicker'], 1, 1], active: [['c12_lag_on', 'lockdown_siren'], 0.9, 1], off: [['c12_lag_off', 'light_flicker'], 0.7, 1], dead: [['c12_lag_die', 'glass_break'], 0.8, 1], stunned: ['hit_flesh', 0.6, 0.8] },
    });
    Object.assign(LOOPS, {
      [NF]: [['seek', 'c12_404_hiss', 0.34, 1]],
      [EC]: [['dormant', 'c12_echo_hum', 0.22, 1], ['feed', 'c12_echo_wail', 0.4, 1]],
      [LG]: [['fly', 'c12_lag_hum', 0.2, 1], ['active', 'c12_lag_zone', 0.34, 1]],
    });
    Object.assign(IDENT, { [NF]: ['Anomaly', 5, HINTS[NF]], [CK]: ['Parasite', 2, HINTS[CK]], [EC]: ['Anomaly', 3, HINTS[EC]], [LG]: ['Anomaly', 3, HINTS[LG]] });
    Object.assign(CREATURE_FLAVOUR, { [NF]: 'electronic', [CK]: 'organic', [EC]: 'organic', [LG]: 'electronic' });
    for (const id of C.ALL_IDS) NO_TELL.add(id);   // the emissive tell is part of each model
    Object.assign(FIELD_NOTES, NOTES);
  }
  // generic spawners (host.js / director.js -> canSpawnMore -> def.noSpawn): not in the first quotas
  for (const id of C.ALL_IDS) {
    const def = CREATURES[id];
    if (def && !Object.getOwnPropertyDescriptor(def, 'noSpawn')?.get) Object.defineProperty(def, 'noSpawn', { enumerable: true, configurable: true, get: () => !gateGame || !C.quotaAllows(id, gateGame.run?.quotaIndex) });
  }
}
