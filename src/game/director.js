// Horror Director (Left 4 Dead style): paces fear instead of damage.
//
// HOST  - once per second estimates every player's tension (0..1) from real threats: nearby and chasing
//         creatures (bosses included), low HP, facility power, being alone, night outdoors, depth inside the
//         facility. Keeps a smoothed tension plus "calm" / "high" timers per player and schedules, under
//         per-player cooldowns and a global rate limit:
//           * scares when a player has been calm for a while (cosmetic, sent to that player as 'dir'),
//           * pressure: a creature spawned out of sight (respects the indoor spawn budget and its daily curve),
//           * relief: a chaser loses interest (held off for a few seconds) and the next spawn wave is delayed
//             when tension stays maxed,
//           * one rare blackout set piece per day (power off for 6-10 s, restored unless the reactor was
//             picked up; blast doors that the power cut opened are closed again).
//         Nothing is scheduled for a player near an engaged boss: that fight is the pacing.
// CLIENT - plays the scares: phantom footsteps from behind (stop when you turn around), whispers / distant
//         screams behind the camera, vent rattles, a shadow figure down the corridor that vanishes when looked
//         at, "the facility breathes" (rumble + camera shake), heartbeat while chased, hard light flicker.
//         Plus a rare positional ambience layer (creaks, drips, distant bangs) while indoors.
//
// Never active in the ship, at Company HQ, outside the 'moon' phase or while dead/spectating. Safe when the
// facility is not loaded. Host decisions use a seeded RNG (run seed); client cosmetics are local only.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { clamp, lerp } from '../core/util.js';
import { MOONS } from './moons.js';
import { CREATURES, spawnTable, canSpawnMore } from './creatures.js';

// ---- tuning ----
const TICK = 1.0;                 // s between host tension evaluations
const LOW = 0.3;                  // below: calm
const HIGH = 0.72;                // above: very tense
const GLOBAL_GAP = 12;            // s minimum between two director events (any player)
const WINDOW = 120;               // s sliding window for the global cap (2 + players events)
const MIN_CALM_FOR_SCARE = 18;    // s of continuous calm before any scare
const SCARE_GAP = [45, 90];       // s between two scares for the same player (shrinks late in the day)
const PRESSURE_CALM = 100;        // s of calm (despite scares) before a pressure spawn
const PRESSURE_GAP = 170;         // s between pressure spawns
const PRESSURE_EXTRA = 1;         // power a pressure spawn may exceed the time-of-day spawn curve by
const RELIEF_HIGH = 24;           // s of sustained high tension before relief
const RELIEF_GAP = 75;            // s between reliefs for the same player
const RELIEF_HOLD = 6;            // s the director keeps a calmed creature off that player
const RELIEF_REASSERT = 3;        // re-calms allowed during the hold before the director gives up on it
const RELIEF_MIN_D = 3;           // m: closer than this a creature is already biting (no FOV check): leave it
const BLACKOUT_CALM = 45;         // s of calm needed for the blackout set piece
const ALONE_R = 15;               // m: no living crewmate within this = alone
const BOSS_R = 30;                // m: no scares / pressure for a player this close to an engaged boss
const INDOOR_OFFSET = 40;         // same rule as game.js: y < FACILITY_Y + 40 = inside the facility
const DEFAULT_FACILITY_Y = -300;
const FIG_DIST = [8, 13];         // m: indoor FogExp2(0.075) is ~30-60 % here, so the silhouette still reads
const FIG_VANISH_R = 5;           // m: walk this close and it is gone
const AMB_GAP = [18, 40];         // s between two ambience one-shots (rare, on top of the ambience loops)

// States that mean "not coming for anyone right now". Anything else (run, attack, chase, windup, slam, roar,
// lunge, grab, popped, winding, a mod's 'hunt'...) counts as a chase when it targets the player, or when it
// has no target and the player is close. 'sneak' (lurker) is handled on its own.
const CALM_STATES = new Set(['idle', 'walk', 'sniff', 'howl', 'box', 'box_walk', 'ceiling', 'hidden', 'calm', 'fly', 'flee',
  'stunned', 'dead', 'off', 'armed', 'patrol', 'wander', 'roam', 'sleep', 'rest', 'return', 'home', 'dormant',
  // round-3 creatures: reviewing / reloading Moderator, polite Customer Support, a crying or rocked Tamagotchi, a
  // Parasocial that is only watching, Clickbait in the brush, a booting Legacy Bot
  'scan', 'reload', 'follow', 'cry', 'rocked', 'lurk', 'hide', 'boot']);
const HAZARD_ACTIVE = new Set(['alert', 'fire', 'triggered', 'attack']);
// built-in behaviours that cope with being told to calm down (target cleared + walk away). Bosses never;
// mod creatures only when their def opts in with directorRelief (true, or a function(c, awayPoint, game)).
const RELIEF_TYPES = new Set(['scuttler', 'crawler', 'spider', 'yoinker', 'lurker', 'screamer', 'hound', 'replyguy']);
// behaviours that re-target by ear every frame (M.hear radius): heard = noise * r > distance
const HEAR_R = { hound: 26, scuttler: 14 };
const AWAY_ANGLES = [0, 0.6, -0.6, 1.2, -1.2];

// procedural / external sounds we use, decoded ahead of time the first time a facility loads
const WARM = ['heartbeat', 'whisper_1', 'whisper_2', 'whisper_3', 'drip_1', 'drip_2', 'drip_3', 'distant_bang_1', 'distant_bang_2',
  'distant_bang_3', 'vent_rattle', 'vent_crawl', 'breath_tired', 'sandkefal_rumble', 'steam_hiss', 'spark', 'scifi_sub_rumble', 'mon_scream',
  'mon_deep_growl', 'impact_generic', 'sting_violin_glitch', 'sting_piano_ringmod', 'sting_synth_glitch',
  // round-3 creature telegraphs (external one-shots decode lazily: warm them so the first one is on time)
  'sting_drum', 'beep_3', 'scifi_alarm_soft', 'ui_notify', 'voice_clown_laughing', 'voice_clown_anger', 'jumpscare_3', 'voice_rat_scared', 'voice_bat_anger'];
const IN_SCREAMS = ['mon_scream', 'mon_growl', 'mon_deep_growl', 'screamer_scream', 'voice_zombie_scared'];
const OUT_SCREAMS = ['animal_wolf', 'hound_howl', 'mon_scream', 'animal_owl', 'animal_crow'];
const STINGS = ['sting_violin_glitch', 'sting_piano_ringmod', 'sting_synth_glitch'];
// ambience layer: weights [factory, mansion]
const AMBIENCE = [
  { names: ['door_creak'], w: [2.5, 4.5], dist: [6, 16], dy: 1.2, vol: 0.32, ref: 2, max: 30, pitch: [0.8, 1.1] },
  { names: ['drip'], w: [2.5, 1.6], dist: [3, 9], dy: 2.6, vol: 0.35, ref: 1.5, max: 18, pitch: [0.9, 1.25] },
  { names: ['distant_bang'], w: [1.3, 1.0], dist: [18, 30], dy: 1.0, vol: 0.55, ref: 6, max: 90, pitch: [0.85, 1.05] },
  { names: ['steam_hiss'], w: [1.0, 0.2], dist: [6, 14], dy: 2.5, vol: 0.22, ref: 2, max: 25, pitch: [0.8, 1.0] },
  { names: ['vent_rattle'], w: [0.6, 0.4], dist: [8, 16], dy: 2.8, vol: 0.28, ref: 2, max: 25, pitch: [0.85, 1.1] },
];

// scratch vectors (no allocations in per-frame paths). Never handed to the audio manager directly: play() copies.
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _pos = new THREE.Vector3();

const r2 = (v) => Math.round(v * 100) / 100;

export function installDirector(game) {
  let disposed = false;
  let boundNet = null;
  let handler = null;

  // ------------------------------------------------------------------ host state
  const H = {
    t: 0, tick: 0.5, fac: undefined, seed: undefined, rng: new RNG(1),
    players: new Map(),        // id -> per-player pacing state
    seen: new Set(),
    nextGlobalT: 20, recent: [], nextPressureT: 90,
    blackoutKey: null, blackout: null,
    holds: [],                 // relief: creatures kept off a player for a few seconds
    bossEngaged: false,
    events: 0, counts: {},
  };
  // ------------------------------------------------------------------ client state
  const C = {
    t: 0, fac: undefined, warmed: false,
    hb: { level: 0, expire: 0, timer: 0 },
    steps: { active: false, i: 0, n: 0, timer: 0, interval: 0.55, dirX: 0, dirZ: 0, d0: 10, d1: 2 },
    fig: { active: false, root: null, parts: null, t: 0, life: 0, lookT: 0 },
    flick: { saved: new Map(), endT: 0 },
    br: { active: false, t: 0, dur: 0, handles: [] },
    amb: { timer: 20 },
  };

  // ------------------------------------------------------------------ shared helpers
  const net = () => game.net;
  const audio = () => game.audio;
  function indoorY() { return (game.world?.facility?.layout?.y ?? DEFAULT_FACILITY_Y) + INDOOR_OFFSET; }
  function emit(kind, to, extra) {
    H.counts[kind] = (H.counts[kind] || 0) + 1;
    try { game.mods?.emit?.('director', { kind, to, ...(extra || {}) }, game); } catch { /* mods are optional */ }
  }
  function sendTo(id, data) { const n = net(); if (n) n.sendTo(id, 'dir', data); }

  function bindNet() {
    const n = net();
    if (!n || boundNet === n) return;
    handler = (d, from) => onDirMessage(d, from);
    n.on_('dir', handler);
    boundNet = n;
  }

  // first existing sound: a base with _1.._N variants, or a plain name
  function sound(...names) {
    const a = audio();
    if (!a?.has) return null;
    for (const n of names) {
      if (a.has(n + '_1')) return a.variant(n);
      if (a.has(n)) return n;
    }
    return null;
  }
  function soundFromList(list) {
    const start = Math.floor(Math.random() * list.length);
    for (let i = 0; i < list.length; i++) { const s = sound(list[(start + i) % list.length]); if (s) return s; }
    return null;
  }
  function play(name, opts) {
    const a = audio();
    if (!a || !name) return null;
    // An external sound that is still decoding is retried later with a shallow copy of opts, so the position
    // must be our own copy, never a scratch vector that will have moved by then. (Events only, not per frame.)
    if (opts?.pos) opts = { ...opts, pos: new THREE.Vector3(opts.pos.x, opts.pos.y, opts.pos.z) };
    try { return a.play(name, opts); } catch (e) { console.warn('director sfx', name, e); return null; }
  }
  function eyeOf(p, out) { return out.set(p.pos.x, p.pos.y + (p.eye ?? 1.6), p.pos.z); }
  function fwdOf(p, out) {
    const cp = Math.cos(p.pitch || 0);
    return out.set(-Math.sin(p.yaw) * cp, Math.sin(p.pitch || 0), -Math.cos(p.yaw) * cp);
  }

  // =========================================================================================== HOST
  function stateFor(id) {
    let st = H.players.get(id);
    if (!st) {
      st = {
        tension: 0, raw: 0, calmT: 0, highT: 0, sinceScare: 0, need: H.rng.float(SCARE_GAP[0], SCARE_GAP[1]),
        chase: 0, boss: false, hbBucket: 0, hbSentT: -99, nextReliefT: 0, lastKind: null, eligible: false, indoor: false,
      };
      H.players.set(id, st);
    }
    return st;
  }

  function hostCheckMap(run) {
    const fac = game.world?.facility || null;
    if (fac === H.fac && run.seed === H.seed) return;
    H.fac = fac; H.seed = run.seed;
    H.rng = new RNG((((run.seed | 0) ^ 0x0d12ec70) >>> 0) || 1);
    H.players.clear();
    H.recent.length = 0;
    H.holds.length = 0;
    H.nextGlobalT = H.t + 25;
    H.nextPressureT = H.t + 90;
    H.blackout = null;
  }

  function hostSilence() {
    for (const [id, st] of H.players) if (st.hbBucket) sendTo(id, { k: 'hb', v: 0 });
    H.players.clear();
    H.holds.length = 0;
    H.blackout = null;
  }

  // Is creature c coming for player pid (d = distance)? Works for built-ins, bosses (target kept in
  // c.data.targetId) and mod creatures with their own state names.
  function isChasing(c, pid, d) {
    const s = c.state;
    if (s === 'sneak') return c.type === 'lurker' && c.target === pid && d < 12;
    if (CALM_STATES.has(s)) return false;
    if (s === 'latched') return c.extra === pid;
    const tgt = c.target || c.data?.targetId || null;
    if (tgt) return tgt === pid;
    return d < 14; // untargeted chasers (hound by sound, mimic, mannequin, jester): whoever is close
  }

  function anyBossEngaged() {
    const host = game.creatures?.host;
    if (!host) return false;
    for (const c of host.values()) if (!c.dead && (c.def || CREATURES[c.type])?.boss && c.data?.engaged) return true;
    return false;
  }

  function hpFrac(id) {
    if (id === game.selfId) {
      const pl = game.player;
      return clamp((pl?.hp ?? 100) / (pl?.maxHp || 100), 0, 1);
    }
    const hp = game.remotes?.get(id)?.hp ?? 100;
    return clamp(hp / Math.max(100, hp), 0, 1);
  }

  function rawTension(p, st, players, inY, night, powerOff, entrance) {
    let threat = 0, chase = 0, boss = false;
    const pIn = p.pos.y < inY;
    const host = game.creatures?.host;
    if (host) {
      for (const c of host.values()) {
        if (c.dead) continue;
        const def = c.def || CREATURES[c.type];
        if (!def) continue;
        if ((c.pos.y < inY) !== pIn) continue;
        const dx = c.pos.x - p.pos.x, dy = c.pos.y - p.pos.y, dz = c.pos.z - p.pos.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > 32) continue;
        if (def.hazard) { if (HAZARD_ACTIVE.has(c.state) && d < 12) threat += 0.35 * (1 - d / 12); continue; }
        const engagedBoss = !!def.boss && !!c.data?.engaged;
        if (engagedBoss && d < BOSS_R) boss = true;
        if (isChasing(c, p.id, d)) {
          threat += 0.55 + 0.45 * (1 - d / 32);
          chase = Math.max(chase, clamp(1 - d / 28, 0.2, 1));
        } else if (engagedBoss) threat += 0.45 * (1 - d / 40);   // a boss fight next to you is never calm
        else if (d < 16) threat += 0.28 * (1 - d / 16) * (def.hp == null ? 1.4 : 1);
      }
    }
    st.chase = chase;
    st.boss = boss;
    threat = Math.min(1, threat);
    const hpT = clamp((0.6 - hpFrac(p.id)) / 0.45, 0, 1);
    const powerT = pIn && powerOff ? 1 : 0;
    let alone = 1;
    for (const q of players) {
      if (q === p || q.dead) continue;
      if (q.pos.distanceToSquared(p.pos) < ALONE_R * ALONE_R) { alone = 0; break; }
    }
    const nightT = !pIn && night ? 1 : 0;
    const deep = pIn && entrance ? clamp(Math.hypot(p.pos.x - entrance.x, p.pos.z - entrance.z) / 70, 0, 1) : 0;
    return clamp(threat * 0.72 + hpT * 0.22 + powerT * 0.12 + alone * 0.1 + nightT * 0.14 + deep * 0.12, 0, 1);
  }

  function sendHb(id, st, level) {
    const bucket = level > 0 ? Math.max(1, Math.ceil(level * 4)) : 0;
    if (!bucket) {
      if (st.hbBucket) { st.hbBucket = 0; sendTo(id, { k: 'hb', v: 0 }); }
      return;
    }
    if (bucket !== st.hbBucket || H.t - st.hbSentT >= 2) {
      st.hbBucket = bucket; st.hbSentT = H.t;
      sendTo(id, { k: 'hb', v: r2(level) });
    }
  }

  function markEvent() {
    H.recent.push(H.t);
    H.nextGlobalT = H.t + GLOBAL_GAP * H.rng.float(1, 1.6);
    H.events++;
  }

  function hostEvaluate(run, hd) {
    const players = game.aiPlayers();
    const fac = game.world.facility || null;
    const inY = indoorY();
    const night = (run.time || 0) > 20 * 60;
    const powerOff = game.lights?.globalDim === 0;
    const dayF = clamp(((run.time || 480) - 480) / 960, 0, 1);
    const entrance = fac?.mainDoor?.pos || null;
    H.bossEngaged = anyBossEngaged();
    H.seen.clear();
    for (const p of players) {
      H.seen.add(p.id);
      const st = stateFor(p.id);
      st.eligible = !p.dead && !p.inShip;
      st.indoor = st.eligible && !!fac && p.pos.y < inY;
      if (!st.eligible) { st.tension = 0; st.calmT = 0; st.highT = 0; st.chase = 0; st.boss = false; sendHb(p.id, st, 0); continue; }
      const raw = rawTension(p, st, players, inY, night, powerOff, entrance);
      st.raw = raw;
      st.tension += (raw - st.tension) * (raw > st.tension ? 0.55 : 0.15);   // fast attack, slow release
      if (st.boss) st.calmT = 0;                                              // a boss fight is its own pacing
      else if (st.tension < LOW) st.calmT += TICK;
      else st.calmT = Math.max(0, st.calmT - TICK * 3);
      if (st.tension > HIGH) st.highT += TICK; else st.highT = Math.max(0, st.highT - TICK * 2);
      st.sinceScare += TICK;
      sendHb(p.id, st, st.chase);
    }
    for (const id of H.players.keys()) if (!H.seen.has(id)) H.players.delete(id);

    // relief is about the player's wellbeing: only its own cooldown applies
    for (const [id, st] of H.players) {
      if (st.eligible && st.highT >= RELIEF_HIGH && H.t >= st.nextReliefT) hostRelief(id, st, hd);
    }

    while (H.recent.length && H.t - H.recent[0] > WINDOW) H.recent.shift();
    if (H.t < H.nextGlobalT || H.recent.length >= 2 + players.length) return;
    if (hostTryBlackout(run)) return;
    if (hostTryPressure(run, hd)) return;
    let best = null, bestId = null;
    for (const [id, st] of H.players) {
      if (!st.eligible || st.boss || st.calmT < MIN_CALM_FOR_SCARE || st.sinceScare < st.need) continue;
      if (!best || st.calmT > best.calmT) { best = st; bestId = id; }
    }
    if (best) hostScare(bestId, best, players, fac, night, dayF);
  }

  // ---- scares ----
  function findDoor(p, fac, players) {
    let best = null, bd = 14 * 14;
    for (const d of fac?.doors || []) {
      if (d.kind !== 'door' || d.locked || d.teleport || !d.pos) continue;
      if (Math.abs(d.pos.y - p.pos.y) > 3) continue;
      const dx = d.pos.x - p.pos.x, dz = d.pos.z - p.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 9 || d2 > bd) continue;
      // never close a door on somebody standing in it
      let blocked = false;
      for (const q of players) {
        if (q.dead) continue;
        const qx = q.pos.x - d.pos.x, qz = q.pos.z - d.pos.z;
        if (qx * qx + qz * qz < 2.4 * 2.4) { blocked = true; break; }
      }
      if (blocked) continue;
      best = d; bd = d2;
    }
    return best;
  }
  function emitterNear(fac, pos, r) {
    for (const e of fac?.emitters || []) {
      if (e.group !== 'facility' || e.enabled === false || !e.pos) continue;
      if (e.pos.distanceToSquared(pos) < r * r) return true;
    }
    return false;
  }
  function nearestVent(fac, pos, r) {
    let best = null, bd = r * r;
    for (const v of fac?.ventSpots || []) {
      const dx = v.x - pos.x, dz = v.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd && Math.abs(v.y - pos.y) < 4) { bd = d2; best = v; }
    }
    return best;
  }

  function scareOptions(p, st, fac, night, players) {
    const out = [];
    if (st.indoor) {
      out.push({ k: 'fs', w: 3 }, { k: 'wh', w: 2 }, { k: 'sc', w: 1.1 }, { k: 'br', w: 1.3 }, { k: 'fig', w: 2.2 });
      const door = findDoor(p, fac, players);
      if (door) out.push({ k: 'door', w: door.open ? 2.4 : 1.2, door });
      if (game.lights?.globalDim > 0 && emitterNear(fac, p.pos, 11)) out.push({ k: 'flk', w: 2 });
      const vent = nearestVent(fac, p.pos, 16);
      if (vent) out.push({ k: 'vent', w: 2, vent });
    } else if (night) {
      out.push({ k: 'fs', w: 2 }, { k: 'wh', w: 1 }, { k: 'sc', w: 2.5 });
    }
    for (const o of out) if (o.k === st.lastKind) o.w *= 0.15;
    return out;
  }

  function execScare(o, p) {
    const k = o.k;
    if (k === 'door') {
      const d = o.door;
      const slam = d.open;
      game.hostSetDoor?.(d.id, !d.open);
      if (slam) {
        const wood = game.world.facility?.layout?.theme === 'mansion';   // mansion doors are wooden
        net().broadcast('fx', { k: 'snd', s: wood ? 'impact_generic' : 'hit_metal', p: [d.pos.x, d.pos.y + 1.2, d.pos.z], v: wood ? 0.8 : 0.9, pt: wood ? 0.7 : 0.75, r: 4, m: 50 });
      }
    } else if (k === 'flk') {
      net().broadcast('dir', { k: 'flk', p: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z)], r: 11, t: r2(H.rng.float(2, 4)) });
    } else if (k === 'vent') {
      const v = o.vent;
      sendTo(p.id, { k: 'vent', p: [r2(v.x), r2(v.y + 0.6), r2(v.z)] });
    } else sendTo(p.id, { k });
    emit(k, p.id);
  }

  function hostScare(id, st, players, fac, night, dayF) {
    const p = players.find((q) => q.id === id);
    if (!p) return;
    const opts = scareOptions(p, st, fac, night, players);
    if (!opts.length) { st.sinceScare = 0; st.need = 20; return; } // e.g. daytime outdoors: look again later
    const o = H.rng.weighted(opts);
    execScare(o, p);
    st.lastKind = o.k;
    st.sinceScare = 0;
    st.need = H.rng.float(SCARE_GAP[0], SCARE_GAP[1]) * (1 - 0.35 * dayF);
    markEvent();
  }

  // ---- relief ----
  // Can this chaser be talked out of it without the AI undoing it on the next frame?
  function reliefCandidate(c, p, d) {
    const def = c.def || CREATURES[c.type];
    if (!def || def.hazard || def.boss) return false;
    if (def.custom ? !def.directorRelief : !RELIEF_TYPES.has(c.type)) return false;
    if (d < RELIEF_MIN_D || d > 32 || !isChasing(c, p.id, d)) return false;
    const hearR = HEAR_R[c.type];
    if (hearR) {
      // listens every frame: only works while this player is quiet enough (for that distance) to go unheard,
      // otherwise it walks straight back to the noise (walk 0.3 / sprint 0.7 / crouch 0.05, voice counts too)
      const loud = Math.max(p.noise || 0, (p.voice || 0) * 0.8);
      if (loud * hearR >= d - 2) return false;
    }
    if (c.type === 'yoinker') {
      if (Array.isArray(p.heldNest) && p.heldNest.includes(c.id)) return false;   // holding its loot: re-angers at once
      const nest = c.data?.nest;
      if (nest && Math.hypot(p.pos.x - nest.x, p.pos.z - nest.z) < 6) return false;
    }
    return true;
  }

  // A walkable point ~14 m further from the player than the creature (tries a few directions); out = {x, z}.
  function awayPoint(c, ppos, out) {
    let ux = c.pos.x - ppos.x, uz = c.pos.z - ppos.z;
    const d0 = Math.hypot(ux, uz) || 1;
    ux /= d0; uz /= d0;
    // spider: back to its lair, but only when the lair is not on the player's side
    if (c.type === 'spider' && c.home) {
      const hx = c.home.x - ppos.x, hz = c.home.z - ppos.z;
      if (hx * hx + hz * hz > (d0 + 4) * (d0 + 4)) { out.x = c.home.x; out.z = c.home.z; return out; }
    }
    const nav = c.zone === 'in' ? game.world.facility?.nav : null;
    let fx = c.pos.x + ux * 14, fz = c.pos.z + uz * 14, haveFallback = !nav;
    for (const ang of AWAY_ANGLES) {
      const cs = Math.cos(ang), sn = Math.sin(ang);
      let tx = c.pos.x + (ux * cs - uz * sn) * 14, tz = c.pos.z + (ux * sn + uz * cs) * 14;
      if (nav) {
        const g = nav.nearestWalkable(...nav.toGrid(tx, tz), 6);
        if (!g) continue;
        const w = nav.toWorld(g[0], g[1]); tx = w.x; tz = w.z;
        if (!haveFallback) { fx = tx; fz = tz; haveFallback = true; }
      }
      const dx = tx - ppos.x, dz = tz - ppos.z;
      if (dx * dx + dz * dz > (d0 + 5) * (d0 + 5)) { out.x = tx; out.z = tz; return out; }
    }
    if (!haveFallback && c.home) { fx = c.home.x; fz = c.home.z; }
    out.x = fx; out.z = fz;
    return out;
  }

  function calmCreature(c, p, out) {
    awayPoint(c, p.pos, out);
    const def = c.def || CREATURES[c.type];
    c.target = null;
    c.lostT = 0;
    c.data = c.data || {};
    if (def?.custom && typeof def.directorRelief === 'function') {
      try { def.directorRelief(c, out, game); } catch (e) { console.warn('directorRelief', c.type, e); }
      return out;
    }
    if (c.type === 'lurker') { c.data.anger = 0; c.data.fleeT = 7; c.setState('flee'); }
    else if (c.type === 'screamer') { c.data.fleeT = 6; c.setState('flee'); }
    else if (c.type === 'yoinker') { c.data.angry = 0; c.data.nestT = 0; c.data.want = null; c.setState('walk'); }
    else if (RELIEF_TYPES.has(c.type)) c.setState('walk');
    else c.setState('idle');
    c.yaw = Math.atan2(c.pos.x - p.pos.x, c.pos.z - p.pos.z); // facing away: the player is out of its view cone
    game.creatures.goTo?.(c, out.x, out.z);
    return out;
  }

  function hostRelief(id, st, hd) {
    st.nextReliefT = H.t + RELIEF_GAP;
    st.highT = 0;
    if (hd) hd.spawnT = Math.max(hd.spawnT || 0, 45 + H.rng.float(0, 30));
    const p = game.aiPlayerById?.(id);
    let best = null, bestD = Infinity;
    if (p && game.creatures?.host) {
      for (const c of game.creatures.host.values()) {
        if (c.dead) continue;
        const d = c.pos.distanceTo(p.pos);
        if (d >= bestD || !reliefCandidate(c, p, d)) continue;
        bestD = d; best = c;
      }
    }
    if (best) {
      const hold = { c: best, pid: id, until: H.t + RELIEF_HOLD, pt: { x: 0, z: 0 }, dmg0: best.attackers?.get?.(id) || 0, n: 0 };
      calmCreature(best, p, hold.pt);
      H.holds.push(hold);
    }
    H.events++;
    emit('relief', id, { creature: best?.id || null });
  }

  // Went back for the player it was calmed off (saw them, heard them, re-targeted)?
  function reengaged(c, h, p, d) {
    if (isChasing(c, h.pid, d)) return true;
    const dest = c.dest;
    if (!dest) return false;
    const ax = dest.x - h.pt.x, az = dest.z - h.pt.z;
    if (ax * ax + az * az < 9) return false;               // still going where we sent it
    const bx = dest.x - p.pos.x, bz = dest.z - p.pos.z;
    return bx * bx + bz * bz < 36;                         // heading back towards the player
  }

  // Runs every frame after creatures.hostUpdate: re-asserts the relief for a few seconds, so an AI that
  // sees/hears the player again on the next frame does not undo it. Fighting back or getting bitten ends it.
  function hostUpdateHolds() {
    const host = game.creatures?.host;
    for (let i = H.holds.length - 1; i >= 0; i--) {
      const h = H.holds[i], c = h.c;
      let keep = !!host && host.get(c.id) === c && !c.dead && H.t < h.until;
      const p = keep ? game.aiPlayerById?.(h.pid) : null;
      if (keep) keep = !!p && !p.dead && !p.inShip && (c.attackers?.get?.(h.pid) || 0) <= h.dmg0;
      if (keep) {
        const dx = c.pos.x - p.pos.x, dy = c.pos.y - p.pos.y, dz = c.pos.z - p.pos.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < RELIEF_MIN_D - 0.4) keep = false;
        else if (reengaged(c, h, p, d)) {
          if (++h.n > RELIEF_REASSERT) keep = false;
          else calmCreature(c, p, h.pt);
        }
      }
      if (!keep) H.holds.splice(i, 1);
    }
  }

  // ---- pressure ----
  function hostTryPressure(run, hd) {
    if (H.t < H.nextPressureT || !hd || H.bossEngaged) return false;
    let target = null;
    for (const st of H.players.values()) if (st.eligible && st.indoor && !st.boss && st.calmT >= PRESSURE_CALM) { target = st; break; }
    if (!target) return false;
    if (typeof game.indoorBudget !== 'function' || typeof game.hostSpawnCreatureIndoor !== 'function' || !game.creatures?.host) return false;
    const budget = game.indoorBudget();
    const used = hd.powerUsed || 0;
    // Same time-of-day curve as hostSpawnWave (35 % at 8:00 -> 100 % at 14:00) plus a little extra, so early
    // pressure cannot eat the whole day's budget and starve the later waves.
    const tDay = ((run.time ?? 480) - 480) / 360;
    const cap = Math.min(budget + 0.25, budget * clamp(0.35 + 0.65 * tDay, 0, 1) + PRESSURE_EXTRA);
    if (!(used < budget) || !(used < cap)) { H.nextPressureT = H.t + 30; return false; }
    const moon = MOONS[run.moon];
    if (!moon?.creatures) return false;
    const table = spawnTable(moon, 'in', run);   // the moon's table + the global round-3 weights
    const entries = [];
    for (const id in table) {
      const def = CREATURES[id];
      if (!def || def.hazard || def.boss || def.zone === 'out' || !(def.power > 0) || !(table[id] > 0)) continue;
      if (!canSpawnMore(id, game.creatures.host)) continue;   // per-type caps (one jester, one Parasocial, ...)
      if (used + def.power > cap) continue;
      entries.push({ id, w: table[id] });
    }
    if (!entries.length) { H.nextPressureT = H.t + 30; return false; }
    const pick = H.rng.weighted(entries);
    hd.powerUsed = used + CREATURES[pick.id].power;
    if (!game.hostSpawnCreatureIndoor(pick.id)) { hd.powerUsed = used; H.nextPressureT = H.t + 10; return false; }   // no fair spot (early-game safety / players near): refund, retry soon
    H.nextPressureT = H.t + PRESSURE_GAP * H.rng.float(0.85, 1.3);
    target.calmT = 35;
    markEvent();
    emit('pressure', null, { type: pick.id });
    return true;
  }

  // ---- blackout set piece ----
  // host.js rule: the apparatus counts as pulled when a PLAYER picks it up (not a yoinker, a physics drag or a shove)
  function playerHolds(it) {
    const h = it?.holder;
    return !!h && !it.carrier && !String(h).startsWith('c:');
  }
  function apparatusInSocket() {
    const fac = game.world.facility;
    const out = [];
    if (!fac?.reactorSpot || !game.items?.all) return out;
    for (const it of game.items.all()) {
      if (it.def?.special !== 'apparatus' || it.pulled || it.holder || it.carrier || it.state !== 'world' || !it.obj) continue;
      if (it.obj.position.distanceTo(fac.reactorSpot) < 3) out.push(it.id);
    }
    return out;
  }
  // host.js only applies the "reactor pulled" rules on a pick while the power is on. While OUR blackout has the
  // lights out it cannot, so apply the same rules here at the moment of the pick (polled; only during a blackout).
  function hostWatchReactor(b, hd) {
    for (const id of b.reactors) {
      const it = game.items?.get?.(id);
      if (!it || it.pulled || !playerHolds(it)) continue;
      it.pulled = true;
      b.pulled = true;
      if (hd) hd.powerBoost = (hd.powerBoost || 0) + 3;
      net()?.broadcast('sys', { text: 'Something has been disconnected... the power is not coming back.', kind: 'bad' });
    }
  }
  // Blast doors closed at the start were forced open by the power cut (hostSetPower(false)): close them again.
  function recloseBlast(b) {
    if (!b.blast.length || typeof game.hostSetDoor !== 'function') return;
    const players = game.aiPlayers?.() || [];
    const host = game.creatures?.host;
    for (const id of b.blast) {
      const door = (b.fac.doors || []).find((d) => d.id === id);
      if (!door || !door.open || !door.pos) continue;
      let blocked = false;
      for (const q of players) {
        if (q.dead) continue;
        const qx = q.pos.x - door.pos.x, qz = q.pos.z - door.pos.z;
        if (qx * qx + qz * qz < 2.8 * 2.8 && Math.abs(q.pos.y - door.pos.y) < 3) { blocked = true; break; }
      }
      if (!blocked && host) {
        for (const c of host.values()) {
          if (c.dead || c.def?.hazard) continue;
          const cx = c.pos.x - door.pos.x, cz = c.pos.z - door.pos.z;
          if (cx * cx + cz * cz < 1.5 * 1.5 && Math.abs(c.pos.y - door.pos.y) < 3) { blocked = true; break; }
        }
      }
      if (!blocked) game.hostSetDoor(id, false);
    }
  }

  function hostTryBlackout(run) {
    if (H.blackout || H.bossEngaged || typeof game.hostSetPower !== 'function') return false;
    const fac = game.world.facility;
    if (!fac || !run.powerOn || game.lights?.globalDim === 0) return false;
    const key = run.seed + ':' + run.day;
    if (H.blackoutKey === key) return false;
    const tMin = run.time || 480;
    if (tMin < 9 * 60 || tMin > 22.5 * 60) return false;
    let calmIndoor = false;
    for (const st of H.players.values()) {
      if (!st.eligible) continue;
      if (st.chase > 0 || st.boss || st.tension > HIGH) return false;
      if (st.indoor && st.calmT >= BLACKOUT_CALM && st.tension < LOW) calmIndoor = true;
    }
    if (!calmIndoor || !H.rng.chance(1 / 45)) return false;
    return startBlackout(run);
  }
  function startBlackout(run) {
    const fac = game.world.facility;
    if (!fac || !run.powerOn) return false;
    H.blackoutKey = run.seed + ':' + run.day;
    const dur = H.rng.float(6, 10);
    const blast = [];
    for (const d of fac.doors || []) if (d.kind === 'blast' && !d.open) blast.push(d.id);
    H.blackout = { fac, startT: H.t, endT: H.t + dur, midDone: false, reactors: apparatusInSocket(), blast, pulled: false };
    game.hostSetPower(false);
    markEvent();
    H.nextGlobalT = Math.max(H.nextGlobalT, H.t + 30);
    emit('blackout', null, { dur: r2(dur) });
    return true;
  }
  function hostUpdateBlackout(run, hd) {
    const b = H.blackout;
    if (!b) return;
    if (run.phase !== 'moon' || game.world.facility !== b.fac) { H.blackout = null; return; }
    if (!run.powerOn && !b.pulled && b.reactors.length) hostWatchReactor(b, hd);   // powered again: host.js handles picks
    if (!b.midDone && H.t >= (b.startT + b.endT) / 2) {
      b.midDone = true;
      // something whispers to one of the people stuck in the dark
      const ids = [];
      for (const [id, st] of H.players) if (st.eligible && st.indoor) ids.push(id);
      if (ids.length) sendTo(ids[Math.floor(H.rng.next() * ids.length)], { k: 'wh' });
    }
    if (H.t < b.endT) return;
    H.blackout = null;
    if (!run.powerOn && !b.pulled) game.hostSetPower(true);   // (a fuse box may already have restored it)
    if (run.powerOn) recloseBlast(b);                           // reactor gone: stays dark, doors stay open (host.js rule)
  }

  // ---- host tick ----
  function hostUpdate(dt) {
    if (disposed || !game.isHost || !game.net) return;
    bindNet();
    const run = game.run, hd = game.hostData;
    if (!run || !hd) return;
    hostCheckMap(run);
    if (run.phase !== 'moon' || game.world.company) { if (H.players.size || H.blackout || H.holds.length) hostSilence(); return; }
    H.t += dt;
    hostUpdateBlackout(run, hd);
    if (H.holds.length) hostUpdateHolds();
    H.tick -= dt;
    if (H.tick > 0) return;
    H.tick = TICK;
    hostEvaluate(run, hd);
  }

  // debug / mod entry point: force an event (host only)
  function trigger(kind, playerId) {
    if (disposed || !game.isHost || !game.run || game.run.phase !== 'moon' || game.world.company) return false;
    const id = playerId || game.selfId;
    const p = game.aiPlayerById?.(id);
    if (!p) return false;
    const st = stateFor(id);
    const fac = game.world.facility || null;
    if (kind === 'blackout') { if (!fac || !game.run.powerOn || H.blackout) return false; H.blackoutKey = null; return startBlackout(game.run); }
    if (kind === 'relief') { hostRelief(id, st, game.hostData); return true; }
    if (kind === 'pressure') {
      const saved = st.calmT, savedT = H.nextPressureT;
      st.calmT = Math.max(st.calmT, PRESSURE_CALM); st.indoor = !!fac && p.pos.y < indoorY(); st.eligible = !p.dead && !p.inShip;
      H.nextPressureT = 0;
      H.bossEngaged = anyBossEngaged();
      const ok = hostTryPressure(game.run, game.hostData);
      if (!ok) { st.calmT = saved; H.nextPressureT = savedT; }
      return ok;
    }
    if (!['fs', 'wh', 'sc', 'br', 'fig', 'flk', 'vent', 'door'].includes(kind)) return false;
    const o = { k: kind };
    if (kind === 'door') { o.door = findDoor(p, fac, game.aiPlayers()); if (!o.door) return false; }
    if (kind === 'vent') { o.vent = nearestVent(fac, p.pos, 16); if (!o.vent) return false; }
    execScare(o, p);
    st.lastKind = kind; st.sinceScare = 0;
    return true;
  }

  // ========================================================================================= CLIENT
  function clientOk() {
    const run = game.run;
    if (!run || run.phase !== 'moon' || game.world?.company) return false;
    const p = game.player;
    return !!p && !p.dead && !game.spectating && !p.inShip;
  }

  function onDirMessage(d, from) {
    if (disposed || !d || typeof d !== 'object') return;
    const n = net();
    if (!n || from !== n.hostId) return; // only the host directs (host's own sendTo arrives from selfId === hostId)
    if (d.k === 'hb') {
      const prev = C.hb.level;
      C.hb.level = clamp(+d.v || 0, 0, 1);
      C.hb.expire = C.t + 3.5;
      if (prev <= 0 && C.hb.level > 0) C.hb.timer = 0.05;
      return;
    }
    if (d.k === 'flk') { startFlicker(d); return; }
    if (!clientOk()) return;
    const indoor = !!game.player.indoor && !!game.world.facility;
    switch (d.k) {
      case 'fs': if (!startSteps()) playWhisper(); break;
      case 'wh': playWhisper(); break;
      case 'sc': playScream(); break;
      case 'vent': if (indoor) playVent(d.p); break;
      case 'fig': if (!indoor || !startFigure()) playWhisper(); break;
      case 'br': if (indoor) startBreathe(); break;
      default: break;
    }
  }

  // ---- heartbeat ----
  function updateHeartbeat(dt, ok) {
    const hb = C.hb;
    if (hb.level <= 0) return;
    if (C.t > hb.expire) { hb.level = 0; return; }
    if (!ok) return;
    hb.timer -= dt;
    if (hb.timer > 0) return;
    hb.timer = lerp(1.05, 0.42, hb.level);
    play('heartbeat', { volume: 0.3 + 0.5 * hb.level, bus: 'sfx', pitch: 0.95 + hb.level * 0.12 });
  }

  // ---- phantom footsteps ----
  function startSteps() {
    const p = game.player;
    const bx = Math.sin(p.yaw), bz = Math.cos(p.yaw);       // behind = -forward
    const nav = p.indoor ? game.world.facility?.nav : null;
    const phys = game.physics;
    const tries = [0, 0.45, -0.45, 0.9, -0.9];
    for (const ang of tries) {
      const c = Math.cos(ang), s = Math.sin(ang);
      const dx = bx * c - bz * s, dz = bx * s + bz * c;
      if (nav) {
        if (!nav.walkableAt(p.pos.x + dx * 3, p.pos.z + dz * 3) || !nav.walkableAt(p.pos.x + dx * 6, p.pos.z + dz * 6)) continue;
        _a.set(p.pos.x, p.pos.y + 1, p.pos.z);
        _b.set(p.pos.x + dx * 6, p.pos.y + 1, p.pos.z + dz * 6);
        if (phys?.lineOfSight && !phys.lineOfSight(_a, _b)) continue;
      }
      const S = C.steps;
      S.active = true; S.i = 0; S.n = 6 + Math.floor(Math.random() * 4);
      S.interval = 0.5 + Math.random() * 0.12; S.timer = 0.35;
      S.dirX = dx; S.dirZ = dz; S.d0 = 9 + Math.random() * 3; S.d1 = 1.8 + Math.random() * 0.8;
      return true;
    }
    return false;
  }
  function updateSteps(dt, ok) {
    const S = C.steps;
    if (!ok) { S.active = false; return; }
    const p = game.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    if (fx * S.dirX + fz * S.dirZ > 0.35) { S.active = false; return; } // turned around: silence
    S.timer -= dt;
    if (S.timer > 0) return;
    S.timer = S.interval * (0.9 + Math.random() * 0.2);
    const f = S.n > 1 ? S.i / (S.n - 1) : 1;
    const dist = lerp(S.d0, S.d1, f);
    const side = S.i & 1 ? 0.2 : -0.2;
    _pos.set(p.pos.x + S.dirX * dist - S.dirZ * side, p.pos.y, p.pos.z + S.dirZ * dist + S.dirX * side);
    const vol = 0.2 + 0.28 * f;
    if (typeof game.footstep === 'function') game.footstep(_pos, vol, false);   // (copies the position)
    else play(sound('step_concrete'), { pos: _pos, volume: vol, occlude: true, refDistance: 1.5, maxDistance: 30 });
    if (++S.i >= S.n) S.active = false;
  }

  // ---- voices behind the camera ----
  function playWhisper() {
    const p = game.player;
    eyeOf(p, _eye);
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const side = (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.5);
    const back = 1.4 + Math.random() * 0.9;
    _pos.set(_eye.x - fx * back + fz * side, _eye.y + (Math.random() - 0.5) * 0.2, _eye.z - fz * back - fx * side);
    play(sound('whisper', 'mimic_voice_1'), { pos: _pos, volume: 0.55, refDistance: 1.1, maxDistance: 14, pitch: 0.88 + Math.random() * 0.15, reverb: 0.25, bus: 'sfx' });
  }
  function playScream() {
    const p = game.player;
    eyeOf(p, _eye);
    const name = soundFromList(p.indoor ? IN_SCREAMS : OUT_SCREAMS);
    if (!name) return;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const dist = 22 + Math.random() * 12, side = (Math.random() - 0.5) * 12;
    _pos.set(_eye.x - fx * dist + fz * side, _eye.y, _eye.z - fz * dist - fx * side);
    play(name, { pos: _pos, volume: 0.85, refDistance: 6, maxDistance: 120, occlude: true, pitch: 0.82 + Math.random() * 0.12, reverb: 0.8, bus: 'sfx' });
  }
  function playVent(p) {
    if (!Array.isArray(p)) return;
    _pos.set(+p[0] || 0, +p[1] || 0, +p[2] || 0);
    if (_pos.distanceToSquared(game.player.pos) > 30 * 30) return;
    play('vent_rattle', { pos: _pos, volume: 0.9, refDistance: 2.5, maxDistance: 35, bus: 'sfx' });
    play('vent_crawl', { pos: _pos, volume: 0.6, refDistance: 2.5, maxDistance: 35, delay: 0.8 + Math.random() * 0.8, bus: 'sfx' });
    if (Math.random() < 0.5) play('vent_rattle', { pos: _pos, volume: 0.55, refDistance: 2.5, maxDistance: 35, delay: 2.2 + Math.random(), pitch: 0.9, bus: 'sfx' });
  }

  // ---- light flicker (broadcast: everybody near sees the same lights) ----
  function startFlicker(d) {
    const fac = game.world?.facility;
    if (!fac || !Array.isArray(d.p) || game.lights?.globalDim === 0) return;
    const r = clamp(+d.r || 10, 2, 20), dur = clamp(+d.t || 3, 0.5, 6);
    _pos.set(+d.p[0] || 0, +d.p[1] || 0, +d.p[2] || 0);
    let nearest = null, nd = r * r;
    for (const e of fac.emitters || []) {
      if (e.group !== 'facility' || !e.pos) continue;
      const d2 = e.pos.distanceToSquared(_pos);
      if (d2 > r * r) continue;
      if (!C.flick.saved.has(e)) C.flick.saved.set(e, e.flicker || 0);
      e.flicker = 0.72;
      if (d2 <= nd) { nd = d2; nearest = e; }
    }
    if (!nearest) return;
    C.flick.endT = Math.max(C.flick.endT, C.t + dur);
    const pl = game.player;
    if (pl && !pl.dead && nearest.pos.distanceToSquared(pl.pos) < 30 * 30) {
      play(sound('spark'), { pos: nearest.pos, volume: 0.7, refDistance: 2, maxDistance: 25, occlude: true, bus: 'sfx' });
    }
  }
  function restoreFlicker() {
    for (const [e, f] of C.flick.saved) e.flicker = f;
    C.flick.saved.clear();
    C.flick.endT = 0;
  }

  // ---- shadow figure ----
  function buildFigure() {
    const root = new THREE.Group();
    root.name = 'director_figure';
    const body = new THREE.MeshBasicMaterial({ color: 0x030304 });   // unlit: a pure silhouette against lit areas
    const box = new THREE.BoxGeometry(1, 1, 1);
    const head = new THREE.SphereGeometry(0.15, 8, 6);
    const add = (geo, mat, x, y, z, sx, sy, sz, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.z = rz;
      root.add(m);
      return m;
    };
    add(box, body, -0.11, 0.45, 0, 0.13, 0.9, 0.15);          // legs
    add(box, body, 0.11, 0.45, 0, 0.13, 0.9, 0.15);
    add(box, body, 0, 1.22, 0, 0.44, 0.68, 0.22);             // torso
    add(box, body, -0.29, 0.98, 0, 0.08, 0.95, 0.09, 0.06);   // arms: a little too long
    add(box, body, 0.29, 0.98, 0, 0.08, 0.95, 0.09, -0.06);
    add(head, body, 0, 1.74, 0.02, 1, 1.25, 1);
    // Eyes: two screen-space points (constant pixel size, no fog), so they always cover pixels at the low
    // internal resolution and read in the black indoor fog - even with the power out.
    const eyeGeo = new THREE.BufferGeometry();
    eyeGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.065, 1.77, 0.19, 0.065, 1.77, 0.19], 3));
    const eyeM = new THREE.PointsMaterial({ color: 0xc9d4c2, size: 2, sizeAttenuation: false, fog: false });
    const eyes = new THREE.Points(eyeGeo, eyeM);
    root.add(eyes);
    root.scale.setScalar(1.12);
    root.visible = false;
    return { root, eyeM, geos: [box, head, eyeGeo], mats: [body, eyeM] };
  }
  function startFigure() {
    const p = game.player;
    const fac = game.world.facility;
    const nav = fac?.nav;
    const phys = game.physics;
    if (!p.indoor || !nav || !phys?.lineOfSight || !game.scene) return false;
    eyeOf(p, _eye);
    const floorY = fac.layout?.y ?? p.pos.y;
    const lit = (game.lights?.globalDim ?? 1) > 0;
    let bestScore = -1, bx = 0, bz = 0, found = 0;
    for (let i = 0; i < 30 && found < 6; i++) {
      const a = p.yaw + (i & 1 ? 1 : -1) * (0.2 + Math.random() * 0.35);   // 11..31 deg off-center
      const dist = FIG_DIST[0] + Math.random() * (FIG_DIST[1] - FIG_DIST[0]);
      const ux = -Math.sin(a), uz = -Math.cos(a);                          // view ray towards the spot
      const x = p.pos.x + ux * dist, z = p.pos.z + uz * dist;
      if (!nav.walkableAt(x, z)) continue;
      _b.set(x, floorY + 1.7, z);
      if (!phys.lineOfSight(_eye, _b)) continue;
      _b.y = floorY + 0.9;
      if (!phys.lineOfSight(_eye, _b)) continue;
      found++;
      let score = Math.random() * 0.5;
      if (lit) {
        // Backlit spots read best: a light beyond the figure, close to the view ray, in the same space.
        let checks = 0;
        for (const e of fac.emitters || []) {
          if (e.group !== 'facility' || e.enabled === false || !e.pos) continue;
          const wx = e.pos.x - x, wz = e.pos.z - z;
          const along = wx * ux + wz * uz;
          if (along > 0.5 && along < 12 && Math.abs(wx * uz - wz * ux) < 2.5 && checks < 2) {
            checks++;
            _a.set(x, floorY + 1.2, z);
            if (phys.lineOfSight(_a, e.pos)) { score += 2 * (1 - along / 16); break; }
          } else if (wx * wx + wz * wz < 16) score += 0.3;
        }
      }
      if (score > bestScore) { bestScore = score; bx = x; bz = z; }
    }
    if (!found) return false;
    const F = C.fig;
    if (!F.root) { F.parts = buildFigure(); F.root = F.parts.root; }
    F.parts.eyeM.size = clamp(Math.round((game.engine?.rt?.height || 360) / 150), 2, 6);
    if (F.root.parent !== game.scene) game.scene.add(F.root);
    F.root.position.set(bx, floorY, bz);
    F.root.rotation.set(0, Math.atan2(_eye.x - bx, _eye.z - bz), 0);
    F.root.visible = true;
    F.active = true; F.t = 0; F.life = 6 + Math.random() * 4; F.lookT = 0;
    return true;
  }
  function hideFigure() {
    const F = C.fig;
    F.active = false;
    if (F.root) { F.root.visible = false; F.root.removeFromParent(); }
  }
  function updateFigure(dt, indoorOk) {
    const F = C.fig;
    if (!indoorOk || !F.root) { hideFigure(); return; }
    F.t += dt;
    const p = game.player;
    eyeOf(p, _eye);
    fwdOf(p, _fwd);
    const rp = F.root.position;
    _a.set(rp.x - _eye.x, rp.y + 1.6 - _eye.y, rp.z - _eye.z);
    const d = _a.length();
    if (d < FIG_VANISH_R || F.t > F.life) { hideFigure(); return; }
    if (_a.dot(_fwd) / d > 0.984) {             // looked straight at (~10 deg): gone
      F.lookT += dt;
      if (F.lookT > 0.06) {
        _b.set(rp.x, rp.y + 1.6, rp.z);
        if (!game.physics?.lineOfSight || game.physics.lineOfSight(_eye, _b)) {
          const s = soundFromList(STINGS);
          if (s) play(s, { volume: 0.3, bus: 'sfx', noRetry: true });
          hideFigure();
          return;
        }
      }
    } else F.lookT = 0;
    F.root.rotation.y = Math.atan2(-_a.x, -_a.z);
    F.root.rotation.z = Math.sin(C.t * 1.7) * 0.03;
  }

  // ---- the facility breathes ----
  function startBreathe() {
    stopBreathe();
    const B = C.br;
    B.active = true; B.t = 0; B.dur = 3.6 + Math.random() * 1.2;
    let h = null;
    const rum = sound('scifi_sub_rumble');
    if (rum) h = play(rum, { volume: 0.0001, bus: 'sfx', noRetry: true, pitch: 0.75 });
    if (!h && audio()?.has?.('sandkefal_rumble')) h = play('sandkefal_rumble', { volume: 0.0001, bus: 'sfx', noRetry: true, pitch: 0.7 });
    if (h) { h.setVolume?.(0.75, 0.6); B.handles.push(h); }
    const br = play('breath_tired', { volume: 0.45, bus: 'sfx', pitch: 0.45, noRetry: true, reverb: 0.7 });
    if (br) B.handles.push(br);
    game.engine?.shake?.(0.25);
  }
  function updateBreathe(dt, indoorOk) {
    const B = C.br;
    B.t += dt;
    if (!indoorOk || B.t >= B.dur) { stopBreathe(); return; }
    game.engine?.shake?.(0.06 + 0.16 * Math.sin(Math.PI * clamp(B.t / B.dur, 0, 1)));
  }
  function stopBreathe() {
    const B = C.br;
    for (const h of B.handles) { try { h.stop?.(1.2); } catch { /* ignore */ } }
    B.handles.length = 0;
    B.active = false;
  }

  // ---- ambience layer (local only, rare) ----
  function updateAmbience(dt, indoorOk) {
    const A = C.amb;
    if (!indoorOk) return;
    A.timer -= dt;
    if (A.timer > 0) return;
    const mansion = game.world.facility?.layout?.theme === 'mansion' ? 1 : 0;
    const dark = game.lights?.globalDim === 0;
    A.timer = (AMB_GAP[0] + Math.random() * (AMB_GAP[1] - AMB_GAP[0])) * (mansion ? 0.85 : 1) * (dark ? 0.8 : 1);
    if (C.hb.level > 0) return;   // being chased: the real thing is loud enough
    let tot = 0;
    for (const e of AMBIENCE) tot += e.w[mansion];
    let r = Math.random() * tot, pick = AMBIENCE[0];
    for (const e of AMBIENCE) { r -= e.w[mansion]; if (r <= 0) { pick = e; break; } }
    const name = sound(...pick.names);
    if (!name) return;
    const p = game.player;
    const a = Math.random() * Math.PI * 2;
    const dist = pick.dist[0] + Math.random() * (pick.dist[1] - pick.dist[0]);
    _pos.set(p.pos.x + Math.cos(a) * dist, p.pos.y + pick.dy, p.pos.z + Math.sin(a) * dist);
    play(name, {
      pos: _pos, volume: pick.vol, refDistance: pick.ref, maxDistance: pick.max, occlude: true, bus: 'sfx',
      pitch: pick.pitch[0] + Math.random() * (pick.pitch[1] - pick.pitch[0]),
    });
  }

  function clientCheckMap() {
    const fac = game.world?.facility || null;
    if (fac === C.fac) return;
    restoreFlicker();
    hideFigure();
    stopBreathe();
    C.steps.active = false;
    C.hb.level = 0;
    C.amb.timer = 15 + Math.random() * 15;
    C.fac = fac;
    if (fac && !C.warmed && audio()?.ctx && typeof audio().warm === 'function') {
      C.warmed = true;
      audio().warm(WARM.filter((n) => audio().has(n)));
    }
  }

  function update(dt) {
    if (disposed) return;
    bindNet();
    C.t += dt;
    clientCheckMap();
    const ok = clientOk();
    const indoorOk = ok && !!game.player.indoor && !!game.world.facility;
    updateHeartbeat(dt, ok);
    if (C.steps.active) updateSteps(dt, ok);
    if (C.fig.active) updateFigure(dt, indoorOk);
    if (C.flick.saved.size && C.t >= C.flick.endT) restoreFlicker();
    if (C.br.active) updateBreathe(dt, indoorOk);
    updateAmbience(dt, indoorOk);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (boundNet && handler && boundNet.msgHandlers?.get('dir') === handler) boundNet.msgHandlers.delete('dir');
    boundNet = null; handler = null;
    restoreFlicker();
    stopBreathe();
    hideFigure();
    const parts = C.fig.parts;
    if (parts) { for (const g of parts.geos) g.dispose(); for (const m of parts.mats) m.dispose(); }
    C.fig.parts = null; C.fig.root = null;
    C.steps.active = false;
    C.hb.level = 0;
    H.players.clear();
    H.holds.length = 0;
    H.blackout = null;
  }

  bindNet();

  return {
    hostUpdate,
    update,
    dispose,
    trigger,
    tensionOf(id) { return H.players.get(id)?.tension ?? 0; },
    debug() {
      const players = [];
      for (const [id, s] of H.players) players.push({ id, tension: r2(s.tension), raw: r2(s.raw), calm: s.calmT, high: s.highT, chase: r2(s.chase), boss: s.boss, indoor: s.indoor });
      return { t: r2(H.t), events: H.events, counts: { ...H.counts }, blackout: !!H.blackout, holds: H.holds.length, bossEngaged: H.bossEngaged, players };
    },
  };
}
