// CREATURES11 wave 11 - definitions, host AI and registration of THE CAPTCHA, THE SHADOWBAN and THE RECOMMENDER (docs/wave11/creatures11.md).
// Runs inside the generic CreatureManager.hostUpdate (stun, damage, XP, snapshots, balance scaling, the 0.4 s balance_rules wind-up gate apply as for any creature).
// One rule each, every damage / penalty moment has a telegraph >= 0.9 s:
//   CAPTCHA      'dormant' (in a doorway) -> 'scan' 0.9 s (step back to cancel) -> 'demand' (5 s tile test, ONE answerer) -> 'off' 20 s (pass: slid aside)
//                | 'alarm' 1.0 s (fail / refuse / timeout / you hurt it) -> stun burst + loud noise -> 'reload' 8 s (gate open, it reboots).
//   SHADOWBAN    'lurk' (nearly invisible) -> 'mark' 1.2 s (the ban lands on the most isolated player) -> 'stalk' (hunts ONLY them, 25 s) -> 'windup' 1.0 s -> 'attack'
//                -> 'off' (ban over: expired, lifted by a teammate's touch, or the creature died).
//   RECOMMENDER  'hidden' (parked under the map) -> 'foretell' 2.0 s (RECOMMENDED FOR YOU frame glows on the predicted doorway) -> 'ambush' (solid, waits) -> 'windup' 0.9 s
//                -> 'attack' -> 'dismiss'. Crouching = incognito: it cannot learn from or track you. A different door / backtracking = it whiffs.
import { RNG } from '../core/rng.js';
import { registerCreature, CREATURES, EXTRA_SPAWNS } from './creatures.js';
import { STATE_SOUNDS, LOOPS } from '../entities/creatures.js';
import { IDENT } from './identify.js';
import { CREATURE_FLAVOUR } from './components.js';
import { NO_TELL } from './creature_read.js';
import { FIELD_NOTES } from './collection.js';
import { angleDiff, clamp } from '../core/util.js';
import * as C from './creatures11_core.js';

const rnd = Math.random, TC = C.TUNE.cap, TB = C.TUNE.ban, TR = C.TUNE.rec;
const { captcha: CAP, shadowban: SB, recommender: REC } = C.IDS;

/** host state shared with the installer / net layer: game, the Recommender's Habits tracker, the running ban, pending answers */
export const ST = { g: null, trk: null, ban: null, ended: null };

export const DEFS = {
  [CAP]: { name: 'The Captcha', hp: 150, dmg: 12, walk: 0, run: 0, power: 1.5, xp: 140, coin: 30, zone: 'in', radius: 0.7, height: 2.1, maxAlive: 1,
    deathText: 'failed to prove they were human to The Captcha.',
    lore: 'It plants itself in a doorway and demands PROVE YOU ARE HUMAN: step into its zone and pick the 3 right tiles in 5 seconds. '
      + 'Pass and it slides aside for 20 s; fail, refuse or run out of time and its siren winds up for a full second, then the burst stuns everyone near and the noise calls every creature around. Only one of you can answer at a time, so the others can slip past.' },
  [SB]: { name: 'The Shadowban', hp: 130, dmg: 26, walk: TB.walk, run: TB.run, power: 2, xp: 190, coin: 34, zone: 'in', radius: 0.4, height: 2.4, maxAlive: 1,
    deathText: 'was shadowbanned into silence.',
    lore: 'It picks ONE crewmate and shadowbans them: for 25 s their name, pings, voice and chat vanish for everybody else while it hunts only them. '
      + 'Find them by footsteps and flashlight and touch them: contact lifts the ban. The gavel needs a full second to fall, and the ban ends the moment it dies.' },
  [REC]: { name: 'The Recommender', hp: 110, dmg: 28, walk: 0, run: 0, power: 1.5, xp: 160, coin: 28, zone: 'in', radius: 0.6, height: 2.4, maxAlive: 1,
    deathText: 'clicked on a recommended ad.',
    lore: 'It learns which door you take next and waits behind it: a cyan RECOMMENDED FOR YOU frame glows on that doorway 2 s before it appears. '
      + 'Break your pattern: backtrack, take another door or crouch-walk (incognito) and it misses. Its window swells for nearly a second before the hit.' },
};
export const HINTS = {
  [CAP]: 'Enter its zone, tap the 3 right tiles in 5 s. Only one answers at a time; a pass opens the gate for 20 s.',
  [SB]: 'It bans one crewmate (they vanish from chat, voice and pings). Touch the banned one to lift it; the gavel is slow.',
  [REC]: 'A cyan frame on a doorway means it will be there in 2 s. Take another door, turn back or crouch to make it miss.',
};
export const NOTES = {
  [CAP]: 'It never leaves its doorway. If a teammate answers, the rest of you walk past. A wrong answer costs a stun burst and a noise that wakes the floor.',
  [SB]: 'Solo the ban is shorter. Stay close to your crew: contact lifts it and the Shadowban goes limp for a few seconds.',
  [REC]: 'It only learns from repeated routes and habits (always straight, always left). Crouching gives it nothing to learn.',
};

// ------------------------------------------------------------------------------------------------ helpers
const face = (c, x, z, dt, rate = 9) => { const want = Math.atan2(x - c.pos.x, z - c.pos.z); c.yaw += clamp(angleDiff(c.yaw, want), -rate * dt, rate * dt); };
export function csnd(M, c, names, v = 0.8, pt = 1, ref = 4, max = 45) { M.game.net.broadcast('cev', { e: 'snd', id: c.id, s: names, v, pt, ref, max }); }
const walkers = (c, M) => M.playersFor(c).filter((p) => !p.dead && !p.inShip);
const fx = (M, d) => M.game.net.broadcast('c11fx', d);
const floorOf = (M, c) => M.game.world?.facility?.layout?.y ?? c.pos.y;
const rrange = ([a, b]) => a + rnd() * (b - a);
const hurt = (M, c, p, dmg, cause) => M.game.hostHurtPlayer?.(p.id, dmg, cause, c.id, c.pos);

// ------------------------------------------------------------------------------------------------ CAPTCHA
/** the doorway on the route entrance -> generator (arch first); falls back to where it spawned */
function initGate(c, M) {
  const d = c.data, g = M.game, F = g.world?.facility, L = F?.layout;
  d.init = 1; d.slide = 0; d.cool = {}; d.res = null; d.hp = c.hp; d.tid = null; d.askT = 0;
  let info = null;
  if (L?.edgeInfo) {
    let route = null;
    try {
      const nav = F.nav, e = F.mainDoor?.pos, tg = L.generator || L.core, r = L.rooms?.[0];
      const to = tg ? { x: L.ox + (tg.cx + 0.5) * L.cell, z: L.oz + (tg.cz + 0.5) * L.cell } : null;
      if (nav && e && to) route = nav.findPath(e.x, e.z, to.x, to.z);
      void r;
    } catch { route = null; }
    try { info = C.pickGate(L, route, new RNG(c.seed >>> 0 || 1).fn(), F.mainDoor?.pos || null); } catch { info = null; }
  }
  if (info) {
    const ctr = C.doorCenter(L, info), n = C.doorNormal(info);
    d.home = { x: ctr.x, z: ctr.z }; d.n = n; c.pos.set(ctr.x, L.y, ctr.z); c.yaw = Math.atan2(n.x, n.z);
  } else { d.home = { x: c.pos.x, z: c.pos.z }; d.n = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) }; }
  d.yaw0 = c.yaw; d.fy = c.pos.y;
  c.setState('dormant');
}
function startAlarm(c, M) { c.setState('alarm'); c.extra = 1; M.noise(c.pos, 2.4); }
/** host: a client's answer to the test. Returns true when it was accepted as the answer of the current test. */
export function captchaAnswer(M, cid, pid, seed, picks, o = {}) {
  const c = M.host?.get?.(cid);
  if (!c || c.dead || c.type !== CAP || c.state !== 'demand' || c.data.tid !== pid || c.data.seed !== (seed | 0)) return false;
  const d = c.data;
  if (o.busy) d.res = 'busy';
  else if (o.cancelled || d.askT > TC.limit + TC.grace) d.res = 'fail';
  else d.res = C.checkPicks(C.captchaRound(d.seed), picks) ? 'pass' : 'fail';
  return true;
}
function captcha(c, dt, M) {
  const d = c.data;
  if (!d.init) initGate(c, M);
  const pl = walkers(c, M), tp = () => pl.find((p) => p.id === d.tid) || null;
  const open = c.state === 'off' || c.state === 'reload';
  // the slide: aside (edge-on, along the wall) while open, back to the doorway otherwise
  d.slide = clamp(d.slide + (open ? 1 : -1) * dt / TC.slideT, 0, 1);
  const e = d.slide * d.slide * (3 - 2 * d.slide);
  c.pos.set(d.home.x - d.n.z * TC.slide * e, d.fy, d.home.z + d.n.x * TC.slide * e);
  c.yaw = d.yaw0 + Math.PI / 2 * e;                            // edge-on to the doorway while it is aside
  for (const k of Object.keys(d.cool)) { d.cool[k] -= dt; if (d.cool[k] <= 0) delete d.cool[k]; }

  if (c.hp < d.hp - 0.01) { d.hp = c.hp; if (c.state !== 'alarm' && c.state !== 'reload') { startAlarm(c, M); return; } }   // hit it and the siren winds up
  d.hp = Math.min(d.hp, c.hp);
  if (c.state === 'stunned' || c.state === 'idle') c.setState(d.slide > 0.5 ? 'off' : 'dormant');

  if (c.state === 'dormant') {
    c.extra = 0;
    let best = null, bd = TC.zone;
    for (const p of pl) {
      if (d.cool[p.id] > 0) continue;
      const dd = Math.hypot(p.pos.x - d.home.x, p.pos.z - d.home.z);
      if (dd < bd && Math.abs(p.pos.y - d.fy) < 2.6) { bd = dd; best = p; }
    }
    if (best) { d.tid = best.id; c.setState('scan'); }
    return;
  }
  if (c.state === 'scan') {                                    // 0.9 s: it reads you. Step back out of 3.8 m and it gives up.
    const p = tp();
    c.extra = clamp(c.t / TC.scan, 0, 1);
    if (!p || Math.hypot(p.pos.x - d.home.x, p.pos.z - d.home.z) > TC.cancelR) { if (p) d.cool[p.id] = TC.retry; d.tid = null; c.setState('dormant'); return; }
    if (c.t >= TC.scan) {
      d.seed = (rnd() * 2147483647) | 0; d.askT = 0; d.res = null; c.setState('demand');
      fx(M, { k: 'ask', to: p.id, cid: c.id, seed: d.seed, lim: TC.limit });
    }
    return;
  }
  if (c.state === 'demand') {
    d.askT += dt; c.extra = clamp(1 - d.askT / TC.limit, 0, 1);
    const p = tp();
    if (!p) { d.tid = null; c.setState('dormant'); return; }
    if (d.res === 'busy') { d.cool[p.id] = TC.retry; d.tid = null; d.res = null; c.setState('dormant'); return; }
    if (d.res === 'pass') { fx(M, { k: 'res', to: p.id, ok: 1 }); d.open = TC.pass; d.clearT = 0; d.tid = null; d.res = null; c.setState('off'); return; }
    if (d.res === 'fail' || d.askT > TC.limit + TC.grace) { fx(M, { k: 'res', to: p.id, ok: 0 }); d.cool[p.id] = TC.retry; d.tid = null; d.res = null; startAlarm(c, M); }
    return;
  }
  if (c.state === 'off') {
    d.open -= dt; c.extra = clamp(d.open / TC.pass, 0.02, 1);
    if (d.open <= 0) {                                        // it never closes on somebody standing in the doorway
      const inDoor = pl.some((p) => Math.hypot(p.pos.x - d.home.x, p.pos.z - d.home.z) < TC.clear);
      d.clearT += dt;
      if (!inDoor || d.clearT > TC.clearMax) c.setState('dormant'); else c.extra = 0.02;
    }
    return;
  }
  if (c.state === 'alarm') {                                  // 1.0 s of siren and a red screen, then the burst
    c.extra = 1;
    if (c.t >= TC.alarm) {
      for (const p of pl) if (Math.hypot(p.pos.x - d.home.x, p.pos.z - d.home.z) <= TC.burstR) { hurt(M, c, p, TC.burstDmg, CAP); M.game.hostStunPlayer?.(p.id, TC.stun); }
      csnd(M, c, ['c11_cap_burst', 'explosion'], 1, 1, 6, 60);
      M.noise(c.pos, TC.noise);                                // every creature within earshot comes to look
      c.setState('reload'); c.extra = 0;
    }
    return;
  }
  if (c.state === 'reload') { c.extra = 0; if (c.t >= TC.reload) c.setState('dormant'); }
}

// ------------------------------------------------------------------------------------------------ SHADOWBAN
function shadowban(c, dt, M) {
  const d = c.data;
  if (!d.init) { d.init = 1; d.rest = 10 + rnd() * 8; d.tid = null; c.setState('lurk'); }
  const pl = walkers(c, M);
  const mine = ST.ban && ST.ban.cid === c.id ? ST.ban : null;
  const tp = d.tid ? pl.find((p) => p.id === d.tid) || null : null;
  if (c.state === 'stunned' || c.state === 'idle') c.setState(mine ? 'stalk' : 'lurk');

  if (c.state === 'lurk') {
    c.extra = 0;
    if (!c.path || M.follow(c, dt, c.def.walk)) M.wander(c, 16);
    d.rest -= dt;
    if (d.rest <= 0 && !ST.ban) {
      const cands = pl.filter((p) => Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z) < TB.markR && Math.abs(p.pos.y - c.pos.y) < 3);
      const tg = C.pickBanTarget(cands.map((p) => ({ id: p.id, pos: p.pos })), c.pos);
      if (tg) { d.tid = tg.id; c.setState('mark'); }
    }
    return;
  }
  if (c.state === 'mark') {                                   // 1.2 s: the sign flares, the target's screen says it
    c.extra = 0.5;
    if (!tp) { d.tid = null; c.setState('lurk'); return; }
    face(c, tp.pos.x, tp.pos.z, dt, 8);
    if (c.t >= TB.mark && !ST.ban) {
      ST.ban = C.newBan(tp.id, c.id, pl.length <= 1);
      fx(M, { k: 'sb', id: tp.id, left: ST.ban.left, cid: c.id });
      c.setState('stalk');
    }
    return;
  }
  if (c.state === 'off') { c.extra = 0; if (c.t >= TB.off) { d.rest = rrange(TB.rest); d.tid = null; c.setState('lurk'); } return; }
  if (!mine && c.state !== 'attack') { d.tid = null; c.setState('off'); return; }   // lifted / expired: it goes limp
  if (!tp) { if (ST.ban === mine) ST.ban.left = 0; return; }   // the target died / boarded: banTick ends it
  c.extra = 1;
  if (c.state === 'windup') {
    face(c, tp.pos.x, tp.pos.z, dt, 5);
    if (c.t >= TB.windup) {
      if (c.pos.distanceTo(tp.pos) <= TB.hitReach && Math.abs(tp.pos.y - c.pos.y) < 2) M.attack(c, tp, c.dmg, SB);
      c.cooldown = TB.cd; c.setState('attack');
    }
    return;
  }
  if (c.state === 'attack') { if (c.t >= TB.attackT) c.setState(mine ? 'stalk' : 'off'); return; }
  // stalk: only ever the banned one
  face(c, tp.pos.x, tp.pos.z, dt, 6);
  if (c.pos.distanceTo(tp.pos) < TB.reach && c.cooldown <= 0 && Math.abs(tp.pos.y - c.pos.y) < 2) { c.setState('windup'); return; }
  M.moveToward(c, tp.pos, dt, c.def.run);
}
/** host, every frame: the ban clock, the touch that lifts it, a dead creature or player. Broadcast heartbeat for late joiners. */
export function banTick(dt, g) {
  const b = ST.ban;
  if (!b) return;
  const M = g.creatures, c = M?.host?.get?.(b.cid);
  const ps = g.aiPlayers();
  const me = ps.find((p) => p.id === b.id);
  const touching = !!me && !me.dead && ps.some((q) => q.id !== b.id && !q.dead && !q.inShip && q.zone === me.zone && Math.hypot(q.pos.x - me.pos.x, q.pos.z - me.pos.z) < TB.touch && Math.abs(q.pos.y - me.pos.y) < 1.8);
  let r = C.banStep(b, dt, touching);
  if (!r && (!c || c.dead)) r = 'dead';
  if (!r && (!me || me.dead || me.inShip)) r = 'end';
  b.hb = (b.hb || 0) - dt;
  if (!r) { if (b.hb <= 0) { b.hb = 2; g.net.broadcast('c11fx', { k: 'sb', id: b.id, left: +b.left.toFixed(1), cid: b.cid }); } return; }
  ST.ban = null; ST.ended = { id: b.id, why: r, cid: b.cid };
  g.net.broadcast('c11fx', { k: 'sb', id: null, why: r, was: b.id });
  if (r === 'lift' && c && !c.dead) c.setState('off');
}

// ------------------------------------------------------------------------------------------------ RECOMMENDER
const parkY = (M, c) => floorOf(M, c) - 80;
function park(c, M) { c.pos.y = parkY(M, c); c.extra = 0; }
/** doorway geometry of a prediction: centre, the far side (the side the player is going to) */
function doorSpot(L, ex) {
  const ctr = C.doorCenter(L, ex.info), n = C.doorNormal(ex.info);
  return { x: ctr.x, z: ctr.z, fx: ctr.x + n.x * ex.sign * TR.far, fz: ctr.z + n.z * ex.sign * TR.far };
}
function dismiss(c, M, why) { c.data.why = why; c.extra = 0; c.setState('dismiss'); }
function recommender(c, dt, M) {
  const d = c.data, g = M.game, trk = ST.trk, L = g.world?.facility?.layout;
  if (!d.init) { d.init = 1; d.rest = 10 + rnd() * 8; d.scan = 0; d.tid = null; park(c, M); c.setState('hidden'); }
  const pl = walkers(c, M), tp = d.tid ? pl.find((p) => p.id === d.tid) || null : null;
  if (c.state === 'stunned' || c.state === 'idle') { if (d.tid) dismiss(c, M, 'stun'); else { park(c, M); c.setState('hidden'); } }
  if (c.state === 'hidden') {
    park(c, M);
    d.rest = Math.max(0, d.rest - dt); d.scan -= dt;
    if (d.rest > 0 || d.scan > 0 || !trk || !L || trk.L !== L) return;
    d.scan = 0.4;
    let best = null, bd = 1e9;
    for (const p of pl) {
      if (p.crouch || p.zone !== 'in') continue;                 // crouching = incognito: it neither learns from nor tracks you
      const pred = trk.predict(p.id, p.pos); if (!pred) continue;
      const spot = doorSpot(L, pred.exit), sp = M.pvel?.get?.(p.id)?.sp ?? 0;
      const dist = Math.hypot(p.pos.x - spot.x, p.pos.z - spot.z);
      if (sp < TR.moveMin || dist > clamp(sp * TR.glowK, TR.glowMin, TR.glowMax) || dist < 1.2) continue;
      if (dist < bd) { bd = dist; best = { p, pred, spot }; }
    }
    if (best) {
      d.tid = best.p.id; d.pred = best.pred; d.spot = best.spot; d.ev0 = trk.lastEvent(best.p.id)?.n ?? 0;
      trk.markShown(best.p.id, best.pred);
      c.pos.set(best.spot.x, floorOf(M, c), best.spot.z); c.yaw = Math.atan2(best.p.pos.x - best.spot.x, best.p.pos.z - best.spot.z);
      c.setState('foretell');
    }
    return;
  }
  // who crossed what since the prediction: the exact predicted doorway = "they came through"; any other = they broke the pattern
  const crossed = () => { const ev = d.tid ? trk?.lastEvent(d.tid) : null; return ev && ev.n > d.ev0 ? (ev.id === d.pred.exit.id ? 'hit' : 'miss') : null; };
  if (c.state === 'foretell') {
    c.extra = clamp(c.t / TR.glow, 0, 1);
    if (!tp || tp.crouch) { dismiss(c, M, 'incognito'); return; }
    const x = crossed();
    if (x === 'miss') { dismiss(c, M, 'miss'); return; }
    if (Math.hypot(tp.pos.x - d.spot.x, tp.pos.z - d.spot.z) > TR.glowMax + 6) { dismiss(c, M, 'away'); return; }
    if (c.t >= TR.glow) { c.pos.set(d.spot.fx, floorOf(M, c), d.spot.fz); c.extra = 0; c.setState('ambush'); }
    return;
  }
  if (c.state === 'ambush') {
    c.extra = 0;
    if (!tp || tp.crouch) { dismiss(c, M, 'incognito'); return; }
    face(c, tp.pos.x, tp.pos.z, dt, 8);
    const x = crossed(), dist = Math.hypot(tp.pos.x - c.pos.x, tp.pos.z - c.pos.z);
    if (x === 'miss') { dismiss(c, M, 'miss'); return; }
    if ((dist < TR.trigger || (x === 'hit' && dist < 9)) && Math.abs(tp.pos.y - c.pos.y) < 2.2) { c.setState('windup'); return; }
    if (c.t >= TR.wait) dismiss(c, M, 'timeout');
    return;
  }
  if (c.state === 'windup') {                                 // 0.9 s: the window swells and the close box flashes
    c.extra = 0;
    if (!tp) { dismiss(c, M, 'gone'); return; }
    face(c, tp.pos.x, tp.pos.z, dt, 6);
    if (c.t >= TR.windup) {
      if (Math.hypot(tp.pos.x - c.pos.x, tp.pos.z - c.pos.z) <= TR.hitReach && Math.abs(tp.pos.y - c.pos.y) < 2.2) M.attack(c, tp, c.dmg, REC);
      c.cooldown = 3; c.setState('attack');
    }
    return;
  }
  if (c.state === 'attack') { if (c.t >= TR.attackT) dismiss(c, M, 'done'); return; }
  if (c.state === 'dismiss') { c.extra = 0; if (c.t >= TR.dismiss) { d.tid = null; d.pred = null; d.rest = rrange(TR.rest); park(c, M); c.setState('hidden'); } }
}

export const BEH = { [CAP]: captcha, [SB]: shadowban, [REC]: recommender };

// ------------------------------------------------------------------------------------------------ registration
let registered = false;
let gateGame = null;
/** the game whose run.quotaIndex gates the generic spawners (null = blocked: nothing spawns without a run) */
export function setC11Game(g) { gateGame = g; ST.g = g; }
export function registerC11Content() {
  if (!registered) {
    registered = true;
    for (const [id, def] of Object.entries(DEFS)) if (!CREATURES[id]) registerCreature(id, { ...def }, BEH[id]);
    for (const [id, e] of Object.entries(C.TUNE.spawn)) if (!EXTRA_SPAWNS[id]) EXTRA_SPAWNS[id] = { ...e };
    Object.assign(STATE_SOUNDS, {
      [CAP]: { scan: [['c11_cap_scan', 'light_flicker'], 0.8, 1], demand: [['c11_cap_ask', 'chat_blip'], 0.9, 1], off: [['c11_cap_pass', 'bell_ding'], 0.8, 1], alarm: [['c11_cap_alarm', 'lockdown_siren'], 1, 1], dead: [['glass_break', 'creature_death'], 0.9, 1], stunned: ['hit_flesh', 0.6, 0.8] },
      [SB]: { mark: [['c11_sb_mark', 'lurker_snap'], 1, 1], windup: [['c11_sb_wind', 'lurker_growl'], 0.9, 1], attack: [['c11_sb_hit', 'hit_flesh'], 1, 1], off: [['c11_sb_lift', 'chat_blip'], 0.7, 1], dead: [['creature_death'], 0.8, 0.8], stunned: ['hit_flesh', 0.6, 0.8] },
      [REC]: { foretell: [['c11_rec_glow', 'light_flicker'], 0.7, 1], ambush: [['c11_rec_ding', 'chat_blip'], 1, 1], windup: [['c11_rec_wind', 'chat_blip'], 1, 1], attack: [['hit_flesh', 'lurker_snap'], 0.9, 1], dismiss: [['c11_rec_gone', 'light_flicker'], 0.7, 1], dead: [['glass_break', 'creature_death'], 0.9, 1] },
    });
    Object.assign(LOOPS, {
      [CAP]: [['dormant', 'c11_cap_hum', 0.2, 1]],
      [SB]: [['lurk', 'c11_sb_hum', 0.18, 1], ['stalk', 'c11_sb_hum', 0.3, 1]],
    });
    Object.assign(IDENT, { [CAP]: ['Territorial', 3, HINTS[CAP]], [SB]: ['Stalker', 4, HINTS[SB]], [REC]: ['Anomaly', 4, HINTS[REC]] });
    Object.assign(CREATURE_FLAVOUR, { [CAP]: 'electronic', [SB]: 'arcane', [REC]: 'electronic' });
    for (const id of C.ALL_IDS) NO_TELL.add(id);   // the emissive tell is part of each model (screen / sign / frame)
    Object.assign(FIELD_NOTES, NOTES);
  }
  // generic spawners (host.js / director.js -> canSpawnMore -> def.noSpawn): not in the first quotas
  for (const id of C.ALL_IDS) {
    const def = CREATURES[id];
    if (def && !Object.getOwnPropertyDescriptor(def, 'noSpawn')?.get) Object.defineProperty(def, 'noSpawn', { enumerable: true, configurable: true, get: () => !gateGame || !C.quotaAllows(id, gateGame.run?.quotaIndex) });
  }
}
