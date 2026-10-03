// Sector Cycle bosses (module 'cycle'): THE LOAD BALANCER, MIDDLE MANAGER, COMMENT SECTION HYDRA (full mechanics, docs/MASTERPLAN.md 14) plus
// one shared elite-boss engine with per-theme kits for the other themes (Head Surgeon, The Host, The Excavator, The Lobby Manager) and the
// KEY HOLDER mini-boss of the Sector Core wings. The Foreman and the Legacy Bot stay in bosses.js (spawned through game.bosses).
//
//   installCycleBosses(game, { onBossKilled(c, by) }) -> { spawnBoss(type, pos, ctx), info(type), isBoss(type), aux, ui, dispose() }
//
// Host: every boss runs the same engine (aggro -> chase -> telegraphed abilities -> phase 2 at 50 % when the sector >= 3 or in a raid), stun
// immune, damage taken is scaled per instance through `c.data.takeMul` (a small wrapper around creatures.damage) - that is the whole
// mechanic of the Load Balancer (server nodes), the Manager (paper shields) and the Hydra (heads). Boss HP = base x (1 + 0.35 x sector) x crew.
// Every peer: procedural models (cycle_bossfx.js), name card + HP bar + ground telegraph rings (net type 'cyx', cycle.js routes the messages).
// Replicated state = creature snapshot `extra` flags (bit 1 engaged, 2 phase 2, 4 vulnerable, bits 3-6 aux alive, 7-10 aux total).
import * as THREE from 'three';
import { registerCreature, CREATURES } from './creatures.js';
import { BOSS_TABLE, LEGACY_BOSS, bossDmgMul, crewMul } from './cycle_core.js';
import { bossHpFor, raidCrewDmg } from './cycle_plan.js';
import { angleDiff, clamp } from '../core/util.js';
import { sysMsg } from '../core/i18n.js';
import {
  createLoadBalancerModel, createNodeModel, createManagerModel, createPaperModel, createHydraModel, createHydraHeadModel, createReplyModel,
  scaledModel, createBossUi, packFlags, F_VULN,
} from './cycle_bossfx.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- data
/** display info for the UI (name comes from CREATURES): title, rank, aux counter label, vulnerable label */
export const BOSS_INFO = {
  loadbalancer: { ...pick(BOSS_TABLE.serverfarm), aux: 'NODES', vuln: 'NODES OFFLINE' },
  middlemanager: { ...pick(BOSS_TABLE.office), aux: 'SHIELDS', vuln: 'IN A MEETING' },
  hydra: { ...pick(BOSS_TABLE.sewer), aux: 'HEADS', vuln: 'ROOT EXPOSED' },
  surgeon: { ...pick(BOSS_TABLE.hospital) },
  host: { ...pick(BOSS_TABLE.mansion) },
  excavator: { ...pick(BOSS_TABLE.mineshaft) },
  lobbymanager: { ...pick(BOSS_TABLE.backrooms) },
  keyholder: { title: 'Access Card Holder', rank: 'C', hp: 420, dmg: 30 },
  foreman: { ...pick(BOSS_TABLE.factory) },
  legacybot: { ...pick(LEGACY_BOSS) },
};
function pick(b) { return { title: b.title, rank: b.rank, hp: b.hp, dmg: b.dmg }; }
export const bossInfo = (type) => BOSS_INFO[type] || null;
export const isBossType = (type) => !!SPECS[type];

const SPECS = {
  loadbalancer: { name: 'The Load Balancer', walk: 0, run: 0, radius: 1.4, height: 4.6, xp: 1800, coin: 300, model: () => createLoadBalancerModel(),
    deathText: 'was routed to a dead server by the Load Balancer.', lore: 'Every request in this building goes through it. It sends the damage to whoever is weakest and calls that "fair". Shut its server nodes down and it has nowhere to send the load.' },
  middlemanager: { name: 'Middle Manager', walk: 2.2, run: 3.7, radius: 0.7, height: 2.8, xp: 1700, coin: 280, model: () => createManagerModel(),
    deathText: 'was let go by the Middle Manager.', lore: 'Synergy Enforcer. Calls mandatory meetings and shields himself with paperwork. Be in the circle when the meeting starts. Shred the paper, then hit him while he presents.' },
  hydra: { name: 'Comment Section Hydra', walk: 0, run: 0, radius: 2.0, height: 3.0, xp: 2000, coin: 340, model: () => createHydraModel(),
    deathText: 'was ratioed by the Comment Section Hydra.', lore: 'Cut a head off and two REPLIES take its place. The root is safe while any head is talking. Silence them all, then burn the root before they grow back.' },
  surgeon: { name: 'The Head Surgeon', walk: 2.4, run: 4.8, radius: 0.6, height: 2.7, xp: 1800, coin: 300, base: 'mannequin', scale: 1.45,
    deathText: 'was operated on by the Head Surgeon.', lore: 'Elective procedure, non-negotiable. Drags the weakest patient onto the table. Hurt him hard to free your friend.' },
  host: { name: 'The Host', walk: 2.6, run: 5.2, radius: 0.55, height: 2.6, xp: 1750, coin: 290, base: 'lurker', scale: 1.4,
    deathText: 'overstayed their welcome with The Host.', lore: 'Welcome, guest. He is delighted you came. He blinks behind you the moment you look away.' },
  excavator: { name: 'The Excavator', walk: 1.9, run: 3.4, radius: 1.0, height: 3.2, xp: 2000, coin: 330, base: 'giant', scale: 0.85,
    deathText: 'was buried by The Excavator.', lore: 'Proof of work, in person. The ground remembers every swing. Stay close to him when the quake comes: the middle is the safe place.' },
  lobbymanager: { name: 'The Lobby Manager', walk: 2.8, run: 6.0, radius: 0.6, height: 2.7, xp: 1850, coin: 310, base: 'screamer', scale: 1.6,
    deathText: 'was kicked from the lobby by The Lobby Manager.', lore: 'Level designer of the yellow rooms. When the lights go he moves. Keep your friends close and your flashlight closer.' },
  keyholder: { name: 'Key Holder', walk: 2.9, run: 6.2, radius: 0.8, height: 1.9, xp: 700, coin: 110, base: 'crawler', scale: 1.7,
    deathText: 'was denied access by a Key Holder.', lore: 'Carries the access card for the boss arena. Charges in straight lines and calls for backup.' },
};
const AUX = {
  lbnode: { name: 'Server Node', hp: 130, dmg: 0, radius: 0.6, height: 1.9, model: () => createNodeModel(), lore: 'A rack the Load Balancer sends its traffic through. Break it.' },
  mmpaper: { name: 'Paper Shield', hp: 42, dmg: 0, radius: 0.45, height: 1.8, model: () => createPaperModel(), lore: 'A stack of forms that circles the Middle Manager. Shred it.' },
  hydrahead: { name: 'Hydra Head', hp: 190, dmg: 30, walk: 2.6, run: 5.0, radius: 0.7, height: 2.7, model: () => createHydraHeadModel(), deathText: 'was ratioed by a Hydra head.', lore: 'One of many. Cut it and two replies appear. It grows back if the root survives.' },
  hydrareply: { name: 'Reply', hp: 24, dmg: 11, walk: 3.4, run: 6.6, radius: 0.35, height: 0.9, model: () => createReplyModel(), deathText: 'was replied to death.', lore: 'Fast, small, and never constructive.' },
};

// ---------------------------------------------------------------- tiny helpers
const yOf = (M, c) => M.game.world?.facility?.layout?.y ?? c.pos.y;
const livePlayers = (M, c) => M.playersFor(c).filter((p) => !p.inShip && !p.dead);
const hpOf = (g, id) => (id === g.selfId ? g.player?.hp : g.remotes?.get(id)?.hp) ?? 100;
function turnToward(c, x, z, dt, rate) { const want = Math.atan2(x - c.pos.x, z - c.pos.z); c.yaw += clamp(angleDiff(c.yaw, want), -rate * dt, rate * dt); }
function walkNear(M, c, x, z, r = 6) {
  const nav = M.nav(c);
  if (!nav) return { x, z };
  if (nav.walkableAt(x, z)) return { x, z };
  const g = nav.nearestWalkable(...nav.toGrid(x, z), r);
  if (!g) return null;
  const w = nav.toWorld(g[0], g[1]);
  return { x: w.x, z: w.z };
}
function randomPoint(M, c, cx, cz, r) {
  const nav = M.nav(c);
  if (nav) { const p = nav.randomWalkable(Math.random, cx, cz, Math.max(2, Math.round(r))); if (p) return p; }
  return { x: cx, z: cz };
}
const ring = (g, x, y, z, r, t, col) => g.net.broadcast('cyx', { k: 'ring', p: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)], r, t, c: col });
const snd = (g, s, c, v = 1) => g.net.broadcast('fx', { k: 'snd', s, p: [c.pos.x, c.pos.y + 1, c.pos.z], v, r: 8, m: 70 });
const nm = (type) => CREATURES[type]?.$name || CREATURES[type]?.name || type;
const say = (g, key, vars, kind = 'warn') => g.net.broadcast('sys', sysMsg(key, vars || {}, kind));

function aoe(M, c, x, z, r, dmg, slow = 0, only = null) {
  const g = M.game;
  let hit = 0;
  for (const p of livePlayers(M, c)) {
    if (only && p.id !== only) continue;
    if (Math.hypot(p.pos.x - x, p.pos.z - z) > r || Math.abs(p.pos.y - c.pos.y) > 3) continue;
    g.hostHurtPlayer(p.id, Math.round(dmg), c.type, c.id, c.pos);
    if (slow) g.hostSlowPlayer?.(p.id, slow);
    hit++;
  }
  return hit;
}
const front = (c, dist) => ({ x: c.pos.x + Math.sin(c.yaw) * dist, z: c.pos.z + Math.cos(c.yaw) * dist });

// ---------------------------------------------------------------- aux (adds)
function spawnAux(M, c, type, x, z, hp = 0, data = null) {
  const def = CREATURES[type];
  if (!def) return null;
  const hp0 = def.hp;
  if (hp > 0) def.hp = hp;
  let a = null;
  try { a = M.hostSpawn(type, new THREE.Vector3(x, yOf(M, c), z), { level: 1, elite: false, zone: 'in', state: 'idle', affix: null, data: { owner: c.id, ...(data || {}) } }); } finally { def.hp = hp0; }
  if (a) { c.data.aux.push(a.id); a.data.owner = c.id; }
  return a;
}
function auxInfo(M, c) {
  const d = c.data;
  d.aux = d.aux.filter((id) => { const a = M.host.get(id); return !!a; });
  let alive = 0;
  for (const id of d.aux) { const a = M.host.get(id); if (a && !a.dead && a.type === d.auxType) alive++; }
  return { alive, total: d.auxTotal || 0 };
}

// ---------------------------------------------------------------- ability library
const abSlam = (o = {}) => ({
  id: 'slam', cd: o.cd ?? 7, windup: o.windup ?? 0.9, recover: 0.7,
  ok: (c, M, x) => x.dist < (o.range ?? 3.6),
  tele: (c, M) => { const f = front(c, 1.1); ring(M.game, f.x, c.pos.y, f.z, o.r ?? 3.3, o.windup ?? 0.9, 0xff5a2a); },
  run: (c, M) => { const f = front(c, 1.1); aoe(M, c, f.x, f.z, o.r ?? 3.3, c.dmg * (o.mul ?? 1), 1.2); M.game.net.broadcast('cyx', { k: 'shake', a: 0.5 }); snd(M.game, 'hit_metal', c, 1); },
});
const abCharge = (o = {}) => ({
  id: 'charge', cd: o.cd ?? 9, windup: 0.9, recover: 0.4,
  ok: (c, M, x) => x.dist > 5 && x.dist < 24,
  tele: (c, M, tgt) => { if (tgt) { c.data.chargeTo = { x: tgt.pos.x, z: tgt.pos.z }; ring(M.game, tgt.pos.x, c.pos.y, tgt.pos.z, 1.8, 0.9, 0xff3a3a); } },
  run: (c, M) => {
    const to = c.data.chargeTo || front(c, 6);
    const dx = to.x - c.pos.x, dz = to.z - c.pos.z, L = Math.hypot(dx, dz) || 1;
    c.data.dash = { x: dx / L, z: dz / L, t: Math.min(1.1, L / 12 + 0.2), hit: new Set() };
    c.setState('run');
  },
});
const abSummon = (o = {}) => ({
  id: 'summon', cd: o.cd ?? 16, windup: 1.1, recover: 0.5,
  ok: (c, M) => c.data.minions.filter((id) => { const m = M.host.get(id); return m && !m.dead; }).length < (o.max ?? 6),
  tele: (c, M) => ring(M.game, c.pos.x, c.pos.y, c.pos.z, 2.5, 1.1, 0x9a5aff),
  run: (c, M) => {
    const n = o.n ?? 3;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, p = walkNear(M, c, c.pos.x + Math.cos(a) * 2.6, c.pos.z + Math.sin(a) * 2.6, 3);
      if (!p) continue;
      const m = M.hostSpawn('scuttler', new THREE.Vector3(p.x, yOf(M, c), p.z), { level: Math.max(1, (c.level || 1)), zone: 'in', state: 'idle', data: { owner: c.id } });
      if (m) { c.data.minions.push(m.id); const tid = c.data.tid; if (tid) { m.target = tid; m.setState('run'); } }
    }
    snd(M.game, 'vent_crawl', c, 1);
  },
});
const abPull = () => ({
  id: 'pull', cd: 17, windup: 1.0, recover: 0.4,
  ok: (c, M, x) => x.players.length >= 1,
  tele: (c, M, tgt, cast) => { const w = weakest(M, c, livePlayers(M, c)); cast.id = w?.id || null; if (w) ring(M.game, w.pos.x, c.pos.y, w.pos.z, 2.2, 1.0, 0x66ffcc); },
  run: (c, M, tgt, cast) => {
    const p = cast.id && M.game.aiPlayerById(cast.id);
    if (!p || p.dead) return;
    c.data.pull = { id: p.id, t: 3.4, tick: 0, acc: c.data.hurtAcc || 0 };
    say(M.game, '{@n} has {@p} on the table! Hurt him to free them!', { n: nm('surgeon'), p: M.game.playerName(p.id) }, 'bad');
  },
});
const abBlink = () => ({
  id: 'blink', cd: 8, windup: 0.8, recover: 0.5,
  ok: (c, M, x) => x.dist > 4 && x.dist < 30,
  tele: (c, M, tgt, cast) => {
    if (!tgt) return;
    const back = { x: tgt.pos.x - tgt.look.x * 2.2, z: tgt.pos.z - tgt.look.z * 2.2 };
    const p = walkNear(M, c, back.x, back.z, 3) || { x: tgt.pos.x, z: tgt.pos.z };
    cast.to = p;
    ring(M.game, p.x, c.pos.y, p.z, 1.6, 0.8, 0xc47aff);
  },
  run: (c, M, tgt, cast) => {
    if (!cast.to) return;
    M.placeAt(c, cast.to.x, cast.to.z);
    c.path = null; c.dest = null;
    if (tgt) c.yaw = Math.atan2(tgt.pos.x - c.pos.x, tgt.pos.z - c.pos.z);
    if (tgt && Math.hypot(tgt.pos.x - c.pos.x, tgt.pos.z - c.pos.z) < 3.4) M.game.hostHurtPlayer(tgt.id, Math.round(c.dmg * 1.25), c.type, c.id, c.pos);
    snd(M.game, 'spark', c, 1);
  },
});
const abQuake = () => ({
  id: 'quake', cd: 13, windup: 1.4, recover: 0.9,
  ok: (c, M, x) => x.players.length >= 1,
  tele: (c, M) => { ring(M.game, c.pos.x, c.pos.y, c.pos.z, 9, 1.4, 0xd88a3a); ring(M.game, c.pos.x, c.pos.y, c.pos.z, 3.2, 1.4, 0x5aff8a); },
  run: (c, M) => {
    for (const p of livePlayers(M, c)) {
      const d = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
      if (d > 3.2 && d <= 9.5 && Math.abs(p.pos.y - c.pos.y) < 3) { M.game.hostHurtPlayer(p.id, Math.round(c.dmg * 1.1), c.type, c.id, c.pos); M.game.hostSlowPlayer?.(p.id, 1.6); }
    }
    M.game.net.broadcast('cyx', { k: 'shake', a: 0.9 }); snd(M.game, 'explosion', c, 1);
  },
});
const abDark = () => ({
  id: 'dark', cd: 20, windup: 0.9, recover: 0.5,
  ok: (c, M, x) => x.players.length >= 1,
  tele: (c, M) => ring(M.game, c.pos.x, c.pos.y, c.pos.z, 4, 0.9, 0xffe04a),
  run: (c, M) => {
    M.game.net.broadcast('cyx', { k: 'dark', t: 4 });
    c.data.hasteT = 4.5;
    say(M.game, 'THE LIGHTS GO OUT - The Lobby Manager is moving!', {}, 'bad');
  },
});
function weakest(M, c, players) {
  let best = null, bh = Infinity;
  for (const p of players) { const h = hpOf(M.game, p.id); if (h < bh) { bh = h; best = p; } }
  return best;
}

// ---------------------------------------------------------------- kits
// kit: { speed, reach, meleeMul, meleeCd, aggro, leash, focusWeak, abilities[], onInit, tick, takeMul, vuln, onPhase2, auxType }
const KITS = {
  loadbalancer: {
    speed: 0, reach: 4.8, meleeMul: 0.8, meleeCd: 3, aggro: 24, leash: 70, focusWeak: true, auxType: 'lbnode',
    onInit(c, M) {
      const n = 3 + (c.data.sector >= 2 || c.data.raid ? 1 : 0);
      c.data.auxTotal = n;
      const hp = Math.round(120 * (1 + 0.22 * (c.data.sector | 0)) * (1 + 0.15 * Math.max(0, (c.data.crew | 1) - 1)) * (c.data.hpMul || 1));
      const L = c.data.lair, R = Math.min(9, Math.max(4.5, (L.r || 8) * 0.65));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.4;
        const p = walkNear(M, c, L.cx + Math.cos(a) * R, L.cz + Math.sin(a) * R, 5);
        if (p) spawnAux(M, c, 'lbnode', p.x, p.z, hp);
      }
      c.data.auxTotal = c.data.aux.length;
    },
    takeMul(c, M) { const a = auxInfo(M, c); return a.total ? 0.2 + 0.8 * (1 - a.alive / a.total) : 1; },
    vuln(c, M) { const a = auxInfo(M, c); return a.total > 0 && a.alive === 0; },
    abilities: [
      { id: 'route', cd: 5.2, windup: 1.0, recover: 0.4, ok: (c, M, x) => x.players.length >= 1,
        tele: (c, M, tgt, cast) => { const w = weakest(M, c, livePlayers(M, c)); cast.id = w?.id || null; cast.x = w?.pos.x; cast.z = w?.pos.z; if (w) ring(M.game, w.pos.x, c.pos.y, w.pos.z, 2.4, 1.0, 0xff3a2a); c.data.lookAt = w?.id || null; },
        run: (c, M, tgt, cast) => {
          if (cast.x === undefined) return;
          // the load lands where the weakest player STOOD when the request was routed: he can dodge, his friends soak the splash
          aoe(M, c, cast.x, cast.z, 2.4, c.dmg * 1.0);
          aoe(M, c, cast.x, cast.z, 4.2, c.dmg * 0.35);
          snd(M.game, 'spark', c, 1);
        } },
      { id: 'throttle', cd: 16, windup: 0.9, recover: 0.5, ok: (c, M, x) => x.players.length >= 1,
        tele: (c, M) => ring(M.game, c.pos.x, c.pos.y, c.pos.z, 10, 0.9, 0xffcf3a),
        run: (c, M) => { aoe(M, c, c.pos.x, c.pos.z, 10.5, c.dmg * 0.2, 3.2); say(M.game, 'THROTTLED - everyone in the room is slowed!', {}, 'warn'); } },
      { id: 'reroute', cd: 21, windup: 1.2, recover: 0.5, ok: (c, M) => auxInfo(M, c).alive > 0 && c.data.minions.filter((id) => { const m = M.host.get(id); return m && !m.dead; }).length < 6,
        tele: (c, M) => ring(M.game, c.pos.x, c.pos.y, c.pos.z, 3, 1.2, 0x5aa8ff),
        run: (c, M) => { const n = Math.min(4, 1 + auxInfo(M, c).alive); for (let k = 0; k < n; k++) { const a = Math.random() * TAU, p = walkNear(M, c, c.pos.x + Math.cos(a) * 3.2, c.pos.z + Math.sin(a) * 3.2, 3); if (!p) continue; const m = M.hostSpawn('scuttler', new THREE.Vector3(p.x, yOf(M, c), p.z), { level: 1 + (c.data.sector | 0), zone: 'in', state: 'idle', data: { owner: c.id } }); if (m) { c.data.minions.push(m.id); if (c.data.tid) { m.target = c.data.tid; m.setState('run'); } } } } },
    ],
  },
  middlemanager: {
    speed: 2.3, reach: 2.4, meleeMul: 0.85, meleeCd: 1.8, aggro: 20, leash: 60, auxType: 'mmpaper',
    onInit(c, M) { c.data.auxTotal = 3; c.data.paperT = 0; c.data.meet = null; fillPapers(c, M, 3); },
    tick(c, dt, M) {
      const d = c.data;
      if (d.meet) return;
      const a = auxInfo(M, c);
      if (a.alive < 3) { d.paperT = (d.paperT || 0) + dt; if (d.paperT >= 11) { d.paperT = 0; fillPapers(c, M, 1); } } else d.paperT = 0;
    },
    takeMul(c, M) { const d = c.data; if (d.meet) return 1.5; return auxInfo(M, c).alive > 0 ? 0.35 : 1; },
    vuln(c, M) { const d = c.data; return !!d.meet || auxInfo(M, c).alive === 0; },
    abilities: [
      { id: 'meeting', cd: 24, windup: 1.6, recover: 0.2, ok: (c, M, x) => x.players.length >= 1 && !c.data.meet,
        tele: (c, M, tgt, cast) => {
          const L = c.data.lair;
          const p = randomPoint(M, c, L.cx, L.cz, Math.min(11, Math.max(5, (L.r || 8) * 0.6)));
          cast.pt = p; cast.r = 4.3;
          ring(M.game, p.x, c.pos.y, p.z, cast.r, 1.6 + MEET_T, 0xffd84a);
          say(M.game, 'MANDATORY MEETING! Gather in the marked circle before it ends!', {}, 'bad');
        },
        run: (c, M, tgt, cast) => { c.data.meet = { x: cast.pt.x, z: cast.pt.z, r: cast.r, t: MEET_T }; c.setState('roar'); } },
      { id: 'memo', cd: 4.2, windup: 0.7, recover: 0.3, ok: (c, M, x) => x.dist > 3 && x.dist < 26 && !c.data.meet,
        tele: (c, M, tgt, cast) => { if (tgt) { cast.x = tgt.pos.x; cast.z = tgt.pos.z; ring(M.game, tgt.pos.x, c.pos.y, tgt.pos.z, 1.7, 0.7, 0xf4f1e6); } },
        run: (c, M, tgt, cast) => { if (cast.x !== undefined) aoe(M, c, cast.x, cast.z, 1.7, c.dmg * 0.75); } },
    ],
  },
  hydra: {
    speed: 0, reach: 0, aggro: 26, leash: 80, auxType: 'hydrahead',
    onInit(c, M) {
      const n = c.data.sector >= 3 || c.data.raid ? 4 : 3;
      c.data.auxTotal = n; c.data.regrow = [];
      const L = c.data.lair;
      for (let i = 0; i < n; i++) spawnHead(c, M, i, n, L);
    },
    tick(c, dt, M) {
      const d = c.data;
      if (!d.regrow) return;
      for (let i = d.regrow.length - 1; i >= 0; i--) {
        d.regrow[i] -= dt;
        if (d.regrow[i] > 0) continue;
        d.regrow.splice(i, 1);
        if (!d.engaged) continue;
        const a = auxInfo(M, c);
        if (a.alive < d.auxTotal) { spawnHead(c, M, a.alive, d.auxTotal, d.lair); say(M.game, 'A head grew back!', {}, 'warn'); }
      }
    },
    takeMul(c, M) { return auxInfo(M, c).alive > 0 ? 0.12 : 1; },
    vuln(c, M) { return auxInfo(M, c).alive === 0; },
    onPhase2(c, M) { c.data.auxTotal = Math.min(5, c.data.auxTotal + 1); },
    abilities: [
      { id: 'spit', cd: 6, windup: 1.0, recover: 0.4, ok: (c, M, x) => x.players.length >= 1 && x.dist < 32,
        tele: (c, M, tgt, cast) => { if (tgt) { cast.x = tgt.pos.x; cast.z = tgt.pos.z; ring(M.game, tgt.pos.x, c.pos.y, tgt.pos.z, 2.2, 1.0, 0x7aff5a); } },
        run: (c, M, tgt, cast) => { if (cast.x !== undefined) aoe(M, c, cast.x, cast.z, 2.2, c.dmg * 0.9, 1.5); snd(M.game, 'glass_break', c, 0.7); } },
      { id: 'thrash', cd: 11, windup: 1.1, recover: 0.6, ok: (c, M, x) => x.dist < 7,
        tele: (c, M) => ring(M.game, c.pos.x, c.pos.y, c.pos.z, 6.2, 1.1, 0xff6a3a),
        run: (c, M) => { aoe(M, c, c.pos.x, c.pos.z, 6.2, c.dmg * 0.9, 1.0); M.game.net.broadcast('cyx', { k: 'shake', a: 0.6 }); } },
    ],
  },
  surgeon: { speed: 2.4, reach: 2.3, meleeMul: 0.9, meleeCd: 1.6, aggro: 18, leash: 55, focusWeak: true, abilities: [abPull(), abSlam({ mul: 0.9 }), abSummon({ n: 2, cd: 22, max: 4 })] },
  host: { speed: 2.9, reach: 2.2, meleeMul: 0.9, meleeCd: 1.5, aggro: 18, leash: 55, abilities: [abBlink(), abSlam({ cd: 8 })] },
  excavator: { speed: 2.0, reach: 2.9, meleeMul: 1.0, meleeCd: 2.0, aggro: 18, leash: 55, abilities: [abQuake(), abSlam({ r: 3.9, range: 4 })] },
  lobbymanager: { speed: 3.0, reach: 2.2, meleeMul: 0.85, meleeCd: 1.3, aggro: 20, leash: 60, abilities: [abDark(), abCharge({ cd: 8 }), abSlam({ cd: 8 })] },
  keyholder: { speed: 2.9, reach: 2.0, meleeMul: 0.8, meleeCd: 1.5, aggro: 15, leash: 45, abilities: [abCharge({ cd: 8 }), abSummon({ n: 2, cd: 18, max: 4 })] },
};
const MEET_T = 7;

function fillPapers(c, M, n) {
  const d = c.data;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    spawnAux(M, c, 'mmpaper', c.pos.x + Math.cos(a) * 2.4, c.pos.z + Math.sin(a) * 2.4, Math.round(42 * (1 + 0.2 * (d.sector | 0))));
  }
}
function spawnHead(c, M, i, n, L) {
  const a = (i / Math.max(1, n)) * TAU + 0.8;
  const p = walkNear(M, c, c.pos.x + Math.cos(a) * 4.2, c.pos.z + Math.sin(a) * 4.2, 5) || { x: c.pos.x, z: c.pos.z };
  const hp = Math.round(190 * (1 + 0.28 * (c.data.sector | 0)) * (1 + 0.18 * Math.max(0, (c.data.crew | 1) - 1)) * (c.data.hpMul || 1));
  const h = spawnAux(M, c, 'hydrahead', p.x, p.z, hp);
  if (h) h.dmg = Math.round(c.dmg * 0.8);
  void L;
  return h;
}

// ---------------------------------------------------------------- engine
function installGuard(c) {
  if (Object.prototype.hasOwnProperty.call(c, 'setState')) return;
  const base = Object.getPrototypeOf(c).setState;
  c.setState = function setStateStunImmune(s) { if (s === 'stunned') { this.stunT = 0; return; } base.call(this, s); };
}
function initBoss(c, M, kit) {
  const d = c.data;
  d.init = true; d.engaged = false; d.p2 = false; d.cd = {}; d.age = 0; d.aux = d.aux || []; d.minions = []; d.takeMul = 1; d.hurtAcc = d.hurtAcc || 0;
  d.meleeCd = 0; d.lostT = 0; d.retT = 0; d.tid = null; d.auxType = kit.auxType || null; d.auxTotal = d.auxTotal || 0; d.hasteT = 0;
  if (!d.lair) d.lair = { cx: c.home.x, cz: c.home.z, r: 10 };
  for (const ab of kit.abilities) d.cd[ab.id] = ab.cd * 0.6;
  installGuard(c);
  kit.onInit?.(c, M);
}
function setFlags(c, M, kit) {
  const d = c.data;
  const a = d.auxType ? auxInfo(M, c) : { alive: 0, total: 0 };
  const vuln = kit.vuln ? kit.vuln(c, M) : false;
  d.vuln = vuln;
  c.extra = packFlags(d.engaged, d.p2, vuln, a.alive, d.auxTotal || a.total);
}
function pickTarget(c, M, players, kit, dt) {
  const d = c.data;
  const cur = players.find((p) => p.id === d.tid);
  d.retT -= dt;
  if (cur && d.retT > 0) return cur;
  d.retT = 1.2;
  if (kit.focusWeak && Math.random() < 0.6) { const w = weakest(M, c, players); if (w) { d.tid = w.id; return w; } }
  let best = null, bs = -Infinity;
  for (const p of players) {
    const dist = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
    const score = (c.attackers.get(p.id) || 0) + (50 - dist) * 5 + (cur && p.id === cur.id ? 60 : 0);
    if (score > bs) { bs = score; best = p; }
  }
  d.tid = best?.id || null;
  return best;
}
function engage(c, M, p) {
  const d = c.data;
  d.engaged = true; d.returning = false; d.evade = false; d.tid = p.id; d.lostT = 0; c.target = null;
  M.noise(c.pos, 3);
  if (!d.quiet) M.game.net.broadcast('cyx', { k: 'card', ty: c.type });
  c.setState('roar');
}
function disengage(c, M, kit) {
  const d = c.data;
  d.engaged = false; d.tid = null; d.cast = null; d.dash = null; d.pull = null; d.meet = null; d.returning = true; d.evade = true; c.target = null;
  M.goTo(c, d.lair.cx, d.lair.cz);
  c.setState('walk');
  void kit;
}

function bossTick(c, dt, M, kit) {
  const d = c.data, g = M.game;
  if (!d.init) initBoss(c, M, kit);
  d.age += dt; c.stunT = 0;
  for (const k in d.cd) d.cd[k] -= dt;
  d.meleeCd -= dt;
  if (d.hasteT > 0) d.hasteT -= dt;
  kit.tick?.(c, dt, M);
  d.takeMul = kit.takeMul ? kit.takeMul(c, M) : 1;
  setFlags(c, M, kit);
  const players = livePlayers(M, c);
  const home = Math.hypot(c.pos.x - d.lair.cx, c.pos.z - d.lair.cz);
  // ---- not engaged: heal, watch, walk home after a leash reset
  if (!d.engaged) {
    if (c.maxHp && c.hp < c.maxHp) c.hp = Math.min(c.maxHp, Math.round((c.hp + c.maxHp * (d.returning ? 0.08 : 0.02) * dt) * 10) / 10);
    if (d.returning) {
      c.target = null;
      if (home > 4 && kit.speed > 0) { if (c.state !== 'walk' || !c.path) { M.goTo(c, d.lair.cx, d.lair.cz); c.setState('walk'); } if (!M.follow(c, dt, kit.speed * 1.4, 3)) return; }
      d.returning = false; d.evade = false; c.setState('idle');
    }
    let trig = !!c.target && players.some((p) => p.id === c.target);
    if (!trig) for (const p of players) {
      const dist = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
      if (Math.abs(p.pos.y - c.pos.y) > 4) continue;
      if (dist < (kit.aggro || 16) * 0.55 || (dist < (kit.aggro || 16) && M.canSee(c, p, kit.aggro || 16, 360)) || Math.hypot(p.pos.x - d.lair.cx, p.pos.z - d.lair.cz) < (d.lair.r || 8) * 0.8) { trig = true; break; }
    }
    if (trig && d.age > 1.2) { const p = players.find((q) => q.id === c.target) || players[0]; if (p) { engage(c, M, p); return; } }
    if (c.state !== 'idle' && c.state !== 'walk') c.setState('idle');
    return;
  }
  // ---- engaged
  if (!players.length) { d.lostT += dt; if (d.lostT > 10) { disengage(c, M, kit); return; } } else d.lostT = 0;
  if (home > (kit.leash || 60)) { disengage(c, M, kit); return; }
  const tgt = players.length ? pickTarget(c, M, players, kit, dt) : null;
  c.target = tgt ? tgt.id : null;
  // phase 2
  if (!d.p2 && c.maxHp && c.hp <= c.maxHp * 0.5 && d.phase2On) {
    d.p2 = true;
    for (const k in d.cd) d.cd[k] = Math.min(d.cd[k], 2);
    kit.onPhase2?.(c, M);
    g.net.broadcast('cyx', { k: 'p2', ty: c.type });
    say(g, '{@n} enters PHASE 2!', { n: nm(c.type) }, 'bad');
    d.roarLen = 1.3; c.setState('roar');
    setFlags(c, M, kit);
    return;
  }
  // committed states
  if (c.state === 'roar') { if (c.t >= (d.roarLen || 1.0) && !d.meet) c.setState('run'); if (!d.meet) return; }
  if (d.meet) {
    const m = d.meet;
    m.t -= dt;
    if (tgt) turnToward(c, tgt.pos.x, tgt.pos.z, dt, 2);
    if (m.t <= 0) {
      let punished = 0;
      for (const p of players) {
        if (Math.hypot(p.pos.x - m.x, p.pos.z - m.z) <= m.r + 0.4) continue;
        g.hostHurtPlayer(p.id, Math.round(c.dmg * 1.15), c.type, c.id, c.pos); g.hostSlowPlayer?.(p.id, 2.5); punished++;
      }
      say(g, punished ? 'MEETING ADJOURNED - {n} attendee(s) were written up!' : 'MEETING ADJOURNED - perfect attendance.', { n: punished }, punished ? 'bad' : 'good');
      d.meet = null; d.cd.meeting = 24 * (d.p2 ? 0.7 : 1); c.setState('run');
    }
    return;
  }
  if (c.state === 'windup') {
    const cast = d.cast;
    if (!cast) { c.setState('run'); return; }
    const tp = cast.id && g.aiPlayerById(cast.id);
    if (tp || tgt) turnToward(c, (tp || tgt).pos.x, (tp || tgt).pos.z, dt, 4);
    if (c.t >= cast.ab.windup) {
      try { cast.ab.run(c, M, tp || tgt, cast); } catch (e) { console.error('boss ability', c.type, cast.ab.id, e); }
      d.recover = cast.ab.recover ?? 0.6;
      d.cast = null;
      if (c.state === 'windup') c.setState('slam');
    }
    return;
  }
  if (c.state === 'slam') { if (c.t >= (d.recover ?? 0.6)) c.setState('run'); return; }
  // charge (dash)
  if (d.dash) {
    const ds = d.dash;
    ds.t -= dt;
    const nx = c.pos.x + ds.x * 13 * dt, nz = c.pos.z + ds.z * 13 * dt;
    const nav = M.nav(c);
    if (nav && !nav.walkableAt(nx, nz)) ds.t = 0; else M.placeAt(c, nx, nz);
    c.yaw = Math.atan2(ds.x, ds.z);
    for (const p of players) {
      if (ds.hit.has(p.id) || Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z) > 1.7 || Math.abs(p.pos.y - c.pos.y) > 2.5) continue;
      ds.hit.add(p.id); g.hostHurtPlayer(p.id, Math.round(c.dmg * 1.2), c.type, c.id, c.pos); g.hostSlowPlayer?.(p.id, 1.0);
    }
    if (ds.t <= 0) { d.dash = null; c.setState('slam'); d.recover = 0.5; }
    return;
  }
  // held player (Head Surgeon): pulled to the table for a few seconds, freed early by damage
  if (d.pull) {
    const pl = d.pull;
    pl.t -= dt; pl.tick -= dt;
    const p = g.aiPlayerById(pl.id);
    if (!p || p.dead || pl.t <= 0 || (d.hurtAcc - pl.acc) >= c.maxHp * 0.1) {
      if (p && !p.dead && pl.t > 0) say(g, '{@p} was freed!', { p: g.playerName(pl.id) }, 'good');
      d.pull = null;
    } else if (pl.tick <= 0) {
      pl.tick = 0.45;
      const f = front(c, 1.7);
      g.hostHoldPlayer?.(p.id, new THREE.Vector3(f.x, p.pos.y, f.z));
      g.hostHurtPlayer(p.id, Math.round(c.dmg * 0.14), c.type, c.id, c.pos);
    }
  }
  if (!tgt) { if (c.state !== 'idle') c.setState('idle'); return; }
  const dist = Math.hypot(tgt.pos.x - c.pos.x, tgt.pos.z - c.pos.z);
  // choose an ability
  const ctx = { tgt, dist, players };
  for (const ab of kit.abilities) {
    if (d.cd[ab.id] > 0 || (ab.ok && !ab.ok(c, M, ctx))) continue;
    d.cd[ab.id] = ab.cd * (d.p2 ? 0.75 : 1);
    d.cast = { ab, id: null };
    c.setState('windup');
    try { ab.tele?.(c, M, tgt, d.cast); } catch (e) { console.error('boss tele', c.type, ab.id, e); }
    return;
  }
  // melee / chase
  if (kit.reach && dist < kit.reach && Math.abs(tgt.pos.y - c.pos.y) < 2.6) {
    turnToward(c, tgt.pos.x, tgt.pos.z, dt, 5);
    if (d.meleeCd <= 0) { c.setState('attack'); d.meleeCd = kit.meleeCd || 1.5; M.attack(c, tgt, Math.round(c.dmg * (kit.meleeMul || 0.8)), c.type); }
    else if (c.state === 'attack' && c.t > 0.45) c.setState('run');
    return;
  }
  if (c.state === 'attack' && c.t < 0.4) return;
  if (kit.speed > 0) {
    c.setState('run');
    M.moveToward(c, tgt.pos, dt, kit.speed * (d.p2 ? 1.2 : 1) * (d.hasteT > 0 ? 1.6 : 1), 4);
  } else { turnToward(c, tgt.pos.x, tgt.pos.z, dt, 2.2); if (c.state !== 'idle') c.setState('idle'); }
}
const engineFor = (kit) => (c, dt, M) => bossTick(c, dt, M, kit);

// ---------------------------------------------------------------- aux behaviours
function auxOwner(c, M) { const o = M.host.get(c.data.owner); return o && !o.dead ? o : null; }
function meleeChase(c, dt, M, o) {
  const d = c.data;
  const own = auxOwner(c, M);
  if (!own) { M.kill(c, null, { silent: true }); return; }
  const players = livePlayers(M, c).filter((p) => Math.hypot(p.pos.x - own.pos.x, p.pos.z - own.pos.z) < (o.leash || 16));
  const tgt = M.nearest(c, players, 30)?.p;
  if (!tgt) {
    const hd = Math.hypot(c.pos.x - own.pos.x, c.pos.z - own.pos.z);
    if (hd > 4) { M.moveToward(c, own.pos, dt, c.def.walk, 6); c.setState('walk'); } else c.setState('idle');
    return;
  }
  const dist = Math.hypot(tgt.pos.x - c.pos.x, tgt.pos.z - c.pos.z);
  if (dist < (o.reach || 1.7)) {
    turnToward(c, tgt.pos.x, tgt.pos.z, dt, 8);
    if (c.cooldown <= 0) { c.setState('attack'); c.cooldown = o.cd || 1.3; M.attack(c, tgt, c.dmg, c.type); } else if (c.state === 'attack' && c.t > 0.4) c.setState('run');
    return;
  }
  if (c.state === 'attack' && c.t < 0.35) return;
  c.setState('run');
  M.moveToward(c, tgt.pos, dt, c.def.run, 6);
  void d;
}
const paperBehavior = (c, dt, M) => {
  const own = auxOwner(c, M);
  if (!own) { M.kill(c, null, { silent: true }); return; }
  const d = c.data;
  if (d.ang === undefined) { const sib = own.data.aux.indexOf(c.id); d.ang = (sib < 0 ? 0 : sib) * (TAU / 3); }
  d.ang += dt * 1.5;
  M.placeAt(c, own.pos.x + Math.cos(d.ang) * 2.4, own.pos.z + Math.sin(d.ang) * 2.4);
  c.yaw = d.ang;
};
const idleBehavior = (c) => { if (c.state !== 'idle' && c.state !== 'dead') c.setState('idle'); };

// ---------------------------------------------------------------- install
function wrapMethod(obj, name, make) {
  if (!obj || typeof obj[name] !== 'function') return () => {};
  const hadOwn = Object.prototype.hasOwnProperty.call(obj, name);
  const orig = obj[name];
  const w = make(orig);
  obj[name] = w;
  return () => { if (obj[name] === w) { if (hadOwn) obj[name] = orig; else delete obj[name]; } };
}

let registered = false;
function registerContent() {
  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  if (!registered) {
    registered = true;
    for (const [type, s] of Object.entries(SPECS)) {
      const info = BOSS_INFO[type];
      registerCreature(type, { name: s.name, hp: info.hp, dmg: info.dmg, walk: s.walk, run: s.run, power: 0, xp: s.xp, coin: s.coin, zone: 'in', radius: s.radius, height: s.height, boss: true, cyBoss: true, noSpawn: true, noHunt: true, deathText: s.deathText, lore: s.lore }, engineFor(KITS[type]));
    }
    for (const [type, s] of Object.entries(AUX)) {
      registerCreature(type, { name: s.name, hp: s.hp, dmg: s.dmg, walk: s.walk || 0, run: s.run || 0, power: 0, xp: type === 'hydrahead' ? 120 : 20, coin: type === 'hydrahead' ? 20 : 3, zone: 'in', radius: s.radius, height: s.height, noSpawn: true, noHunt: true, cyAux: true, deathText: s.deathText, lore: s.lore },
        type === 'hydrahead' ? (c, dt, M) => meleeChase(c, dt, M, { reach: 1.9, cd: 1.3, leash: 15 }) : type === 'hydrareply' ? (c, dt, M) => meleeChase(c, dt, M, { reach: 1.2, cd: 1.0, leash: 30 }) : type === 'mmpaper' ? paperBehavior : idleBehavior);
    }
  }
  if (mm?.creatureModels) {
    for (const [type, s] of Object.entries(SPECS)) mm.creatureModels.set(type, (T, o) => (s.model ? s.model(o) : scaledModel(s.base, s.scale, o || {})));
    for (const [type, s] of Object.entries(AUX)) mm.creatureModels.set(type, (T, o) => s.model(o));
  }
}

export function installCycleBosses(game, hooks = {}) {
  registerContent();
  const offs = [];
  let disposed = false;
  const M = game.creatures;
  const ui = createBossUi(game, bossInfo);

  // per-instance damage scaling: takeMul (nodes / shields / heads) and the surgeon's "hurt him to free your friend" accumulator
  offs.push(wrapMethod(M, 'damage', (orig) => function damageScaled(id, amount, by, opts = {}) {
    const c = this.host.get(id);
    if (c && !c.dead && c.data && (c.def?.cyBoss || c.def?.cyAux) && c.maxHp) {
      const mul = c.data.takeMul;
      if (typeof mul === 'number' && mul !== 1) amount *= mul;
      if (c.def.cyBoss) c.data.hurtAcc = (c.data.hurtAcc || 0) + amount;
    }
    return orig.call(this, id, amount, by, opts);
  }));

  function onKilled(c, by) {
    if (disposed || !game.isHost) return;
    const d = c.data || {};
    if (c.def?.cyBoss) { hooks.onBossKilled?.(c, by); return; }
    if (c.type === 'lbnode') {
      const own = d.owner && M.host.get(d.owner);
      if (own && !own.dead) { const a = auxInfo(M, own); game.net.broadcast('sys', sysMsg('SERVER NODE OFFLINE ({a}/{b} left)', { a: a.alive, b: a.total }, 'good')); }
    } else if (c.type === 'mmpaper') {
      // nothing: the boss respawns paper on a timer
    } else if (c.type === 'hydrahead') {
      const own = d.owner && M.host.get(d.owner);
      if (!own || own.dead) return;
      for (let k = 0; k < 2; k++) {
        const a = Math.random() * TAU, p = walkNear(M, c, c.pos.x + Math.cos(a) * 1.4, c.pos.z + Math.sin(a) * 1.4, 3) || { x: c.pos.x, z: c.pos.z };
        const r = spawnAux(M, own, 'hydrareply', p.x, p.z, Math.round(24 * (1 + 0.2 * (own.data.sector | 0))));
        if (r) { r.dmg = Math.round(own.dmg * 0.3); if (own.data.tid) { r.target = own.data.tid; r.setState('run'); } }
      }
      (own.data.regrow = own.data.regrow || []).push(14);
      const a = auxInfo(M, own);
      game.net.broadcast('sys', sysMsg('A head is cut - two REPLIES take its place! ({a} heads left)', { a: a.alive }, a.alive ? 'warn' : 'good'));
      if (!a.alive) game.net.broadcast('sys', sysMsg('THE ROOT IS EXPOSED - burn it before the heads grow back!', {}, 'good'));
    }
  }
  offs.push(wrapMethod(game, 'hostOnCreatureKilled', (orig) => function onKilledWrapped(c, by) {
    const r = orig.call(this, c, by);
    try { onKilled(c, by); } catch (e) { console.error('cycle boss kill', e); }
    return r;
  }));

  const api = {
    ui,
    info: bossInfo,
    isBoss: isBossType,
    /** spawn a boss (host). ctx { sector, crew, raid, hpMul, dmgMul, lair:{cx,cz,r}, quiet } -> HostCreature | null */
    spawnBoss(type, pos, ctx = {}) {
      const spec = SPECS[type];
      if (!spec || !game.isHost) return null;
      const def = CREATURES[type];
      const sector = ctx.sector | 0, crew = Math.max(1, ctx.crew | 0 || 1);
      const info = BOSS_INFO[type];
      const hp = type === 'keyholder'
        ? Math.round(info.hp * (1 + 0.3 * sector) * Math.min(3, 1 + 0.45 * (crew - 1)) * (ctx.hpMul || 1))
        : bossHpFor({ hp: info.hp }, { sector, crew, raid: !!ctx.raid, hpMul: ctx.hpMul || 1 });
      const bs = game.balance?.scale?.('boss');
      const comp = bs && bs.hp > 0 ? bs.hp : 1;   // baked into every boss HP by the generic creature path: cancel it, the formula is the design
      const hp0 = def.hp;
      def.hp = Math.max(1, Math.round(hp / comp));
      let c = null;
      try { c = game.creatures.hostSpawn(type, pos, { level: 1, elite: false, zone: 'in', state: 'idle', affix: null, yaw: ctx.yaw ?? 0, data: { ...ctx, sector, crew, phase2On: !!(ctx.phase2 ?? (sector >= 3 || ctx.raid)) } }); } finally { def.hp = hp0; }
      if (!c) return null;
      c.dmg = Math.round(info.dmg * bossDmgMul(sector) * (ctx.dmgMul || 1) * (ctx.raid ? raidCrewDmg(crew) : 1));
      installGuard(c);
      return c;
    },
    dispose() { if (disposed) return; disposed = true; for (const o of offs) { try { o(); } catch { /* ignore */ } } offs.length = 0; ui.dispose(); },
  };
  void crewMul;
  return api;
}

// test hooks
export const _internals = { KITS, SPECS, AUX, bossTick, initBoss, auxInfo };
