// Instance runtime for the Sector Cycle (module 'cycle'): what happens INSIDE a Sector Core / S-rank Glitch Gate / Corrupted Keystone / Raid facility.
// Host only (clients read the mirrored `run.cycle.live` object). Pure planning lives in cycle_plan.js, bosses in cycle_bosses.js, the run state
// machine in cycle_core.js, the wrappers around host.js in cycle.js. One `cur` instance exists while the ship stands on such a moon.
//
//   populate(moon)        after host.js filled the moon: elites per wing, key holders, the arena boss (or raid bosses), arena lock
//   onCreatureKilled(c)   boss bookkeeping, access cards, keystone enemy forces, VIRAL spread
//   tick(dt)              day clock clamp (no time pressure), arena auto-open, keystone timer + spawner, recall cap, threat ramp
//   arenaUnlock(d, from)  'unlock' handler for the arena door: access cards (corecard items) only
//   finish(reason)        takeoff: returns { kind, success, ... } and applies rewards (keystone level, raid weekly lock, gate chest)
import * as THREE from 'three';
import { RNG, hashString } from '../core/rng.js';
import { MOONS } from './moons.js';
import { ITEMS, registerItem } from './items.js';
import { CREATURES, spawnTable } from './creatures.js';
import { rollWeaponAffixes } from './loot.js';
import { sysMsg } from '../core/i18n.js';
import { TUNE, BOSS_TABLE, bossFor, bossDmgMul } from './cycle_core.js';
import * as P from './cycle_plan.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- items
export const CARD = 'corecard';
export const trophyId = (type) => `trophy_${type}`;
const TROPHY_TYPES = ['foreman', 'loadbalancer', 'middlemanager', 'hydra', 'surgeon', 'host', 'excavator', 'lobbymanager', 'legacybot'];
export function registerInstanceItems() {
  if (!ITEMS[CARD]) registerItem({ id: CARD, name: 'Arena Access Card', kind: 'tool', price: 0, weight: 0, hands: 1, value: [0, 0], tip: 'Dropped by the Key Holders. Use it on the locked boss arena door.' });
  for (const t of TROPHY_TYPES) {
    const id = trophyId(t);
    if (!ITEMS[id]) registerItem({ id, name: `${(BOSS_TABLE[Object.keys(BOSS_TABLE).find((k) => BOSS_TABLE[k].id === t)]?.name) || (t === 'legacybot' ? 'Legacy Bot' : t)} Trophy`, kind: 'drop', value: [260, 380], weight: 6, hands: 1, tip: 'A boss trophy. Sells well, looks better on the Trophy Hall.' });
  }
}
export function cardModel() {
  const g = new THREE.Group();
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.22), new THREE.MeshLambertMaterial({ color: 0xf0eee4 }));
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.032, 0.05), new THREE.MeshBasicMaterial({ color: 0x222222 }));
  stripe.position.z = -0.06;
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.034, 0.05), new THREE.MeshBasicMaterial({ color: 0x3dff7a }));
  led.position.set(0.11, 0, 0.05);
  g.add(card, stripe, led);
  return g;
}
export function trophyModel(color = 0xe8b830) {
  const g = new THREE.Group();
  const gold = new THREE.MeshLambertMaterial({ color });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.34), new THREE.MeshLambertMaterial({ color: 0x3a2a1a }));
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.2, 8), gold); stem.position.y = 0.14;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.07, 0.22, 10), gold); cup.position.y = 0.34;
  g.add(base, stem, cup);
  return g;
}

// ---------------------------------------------------------------- helpers
const withDefHp = (type, hp, fn) => {
  const def = CREATURES[type];
  const hp0 = def.hp;
  def.hp = Math.max(1, Math.round(hp));
  try { return fn(); } finally { def.hp = hp0; }
};
const bossBase = (type) => { const e = Object.values(BOSS_TABLE).find((b) => b.id === type); return e ? e.hp : type === 'legacybot' ? 1500 : 1000; };
const mineWeek = () => P.weekKey(Date.now());

export function createInstances(ctx) {
  const game = ctx.game;
  const bosses = ctx.bosses;
  let cur = null;
  const host = () => !!game.isHost;
  const fac = () => game.world?.facility || null;
  const say = (key, vars, kind) => game.net.broadcast('sys', sysMsg(key, vars || {}, kind || 'info'));
  const cyx = (d) => game.net.broadcast('cyx', d);
  const rndFor = (salt) => new RNG((hashString(String(game.run?.seed) + ':' + salt)) >>> 0);
  const nm = (type) => CREATURES[type]?.$name || CREATURES[type]?.name || type;

  function walkable(x, z) {
    const nav = fac()?.nav;
    if (!nav) return { x, z };
    if (nav.walkableAt(x, z)) return { x, z };
    const g = nav.nearestWalkable(...nav.toGrid(x, z), 6);
    if (!g) return { x, z };
    const w = nav.toWorld(g[0], g[1]);
    return { x: w.x, z: w.z };
  }
  function roomPos(room, jitter = 0) {
    const L = fac().layout, c = P.roomCenter(L, room);
    const rr = L.rooms[room];
    const j = jitter ? { x: (Math.random() - 0.5) * Math.min(jitter, rr.w * L.cell * 0.5), z: (Math.random() - 0.5) * Math.min(jitter, rr.h * L.cell * 0.5) } : { x: 0, z: 0 };
    const w = walkable(c.x + j.x, c.z + j.z);
    return new THREE.Vector3(w.x, L.y, w.z);
  }
  function lairOf(roomId) {
    const L = fac().layout, r = L.rooms[roomId], c = roomPos(roomId);
    return { cx: c.x, cz: c.z, sx: c.x, sz: c.z, x0: L.ox + r.x * L.cell + 1, x1: L.ox + (r.x + r.w) * L.cell - 1, z0: L.oz + r.z * L.cell + 1, z1: L.oz + (r.z + r.h) * L.cell - 1, r: Math.max(r.w, r.h) * L.cell * 0.5, room: r.id, type: r.type };
  }
  const crewCount = () => Math.max(1, game.aiPlayers().length);
  const arenaDoor = () => (fac()?.doors || []).find((d) => d.info?.arena) || null;

  // ------------------------------------------------------------ live mirror (clients read run.cycle.live)
  function live() { const cy = ctx.cy(); if (!cy) return null; if (!cy.live) cy.live = {}; return cy.live; }
  function pushLive(extra = {}, now = false) {
    const lv = live(); if (!lv || !cur) return;
    Object.assign(lv, {
      k: cur.kind, keys: cur.keysUsed, keysNeed: cur.plan.keys, locked: cur.plan.lockedArena && cur.keysUsed < cur.plan.keys, boss: cur.finalType, bossDead: cur.finalDead,
      mids: cur.bosses.filter((b) => b.role === 'mid' || b.role === 'keyholder').map((b) => (b.dead ? 1 : 0)), forces: cur.ks ? Math.min(100, Math.round(cur.ks.forces / cur.ks.need * 100)) : undefined,
      left: cur.ks ? Math.max(0, Math.ceil(cur.ks.limit - cur.ks.t)) : undefined, level: cur.ks?.level, expired: cur.ks?.expired || undefined, guardian: cur.ks?.guardian ? 1 : 0,
      diff: cur.diff, red: cur.red ? 1 : undefined,
    }, extra);
    if (now) game.broadcastRun(['cycle']);
  }

  // ------------------------------------------------------------ spawning
  function eligibleElites(moon) {
    const t = spawnTable(moon, 'in', game.run);
    return Object.entries(t).filter(([id]) => {
      const d = CREATURES[id];
      return d && d.hp && !d.hazard && !d.boss && !d.noSpawn && !d.siege && !d.cyAux && d.zone !== 'out' && (d.dmg || 0) < 90 && !['mimic', 'leech', 'jester', 'yoinker', 'scuttler', 'sludge'].includes(id);
    }).map(([id, w]) => ({ id, w }));
  }
  function spawnElite(moon, roomId, table, rng, extraLevel = 1) {
    if (!table.length) return null;
    const id = rng.weighted(table).id;
    const pos = roomPos(roomId, 6);
    return game.creatures.hostSpawn(id, pos, { level: Math.max(1, (game.rollLevel?.() || 1) + extraLevel), elite: true, zone: 'in' });
  }
  function spawnBossAt(type, roomId, extra) {
    const lair = lairOf(roomId);
    const pos = new THREE.Vector3(lair.sx, fac().layout.y, lair.sz);
    const sector = extra.sector | 0, crew = extra.crew | 0;
    const hp = P.bossHpFor({ hp: bossBase(type) }, { sector, crew, raid: !!extra.raid, hpMul: extra.hpMul || 1 });
    const bs = game.balance?.scale?.('boss');
    const comp = bs && bs.hp > 0 ? bs.hp : 1;
    let c = null;
    if (type === 'foreman') {
      c = withDefHp('foreman', hp / comp, () => game.creatures.hostSpawn('foreman', pos, { level: 1, elite: false, zone: 'in', state: 'idle', affix: null, yaw: Math.random() * TAU, data: { lair } }));
      if (c) c.dmg = Math.round(CREATURES.foreman.dmg * bossDmgMul(sector) * (extra.dmgMul || 1));
    } else if (type === 'legacybot') {
      c = withDefHp('legacybot', hp / comp, () => game.bosses?.hostSpawnLegacy?.());
      if (c) { c.dmg = Math.round(CREATURES.legacybot.dmg * bossDmgMul(sector) * (extra.dmgMul || 1)); c.setState('boot'); }
    } else c = bosses.spawnBoss(type, pos, { ...extra, lair });
    return c;
  }
  function addBoss(c, type, role) {
    if (!c) return null;
    const b = { id: c.id, type, role, dead: false };
    cur.bosses.push(b);
    return b;
  }

  // ------------------------------------------------------------ populate
  function populate(moon) {
    cur = null;
    const f = fac();
    if (!host() || !f || !f.layout) return null;
    const kind = moon.core ? 'core' : moon.gate ? 'gate' : moon.raid ? 'raid' : moon.keystone ? 'keystone' : null;
    if (!kind) return null;
    const run = game.run, cy = ctx.cy(), L = f.layout;
    const crew = crewCount();
    const sector = kind === 'core' ? cy.sector | 0 : Math.max(0, run.quotaIndex | 0);
    const opts = moon.layoutOpts || {};
    const legacy = (kind === 'core' && bossFor(moon.interior, sector).id === 'legacybot') || (kind === 'gate' && !!moon.legacyGate);
    const raidD = kind === 'raid' ? (P.RAID_DIFFS[moon.raidDiff] || P.RAID_DIFFS.normal) : null;
    const plan = P.planContent(L, { sector, crew, keys: legacy ? 0 : (opts.keys ?? 1), kind, perWing: raidD ? P.raidElites(crew, moon.raidDiff) : undefined });
    cur = {
      kind, moon, L, plan, sector, crew, bosses: [], finalDead: false, finalType: null, keysUsed: 0, elapsed: 0, recallAt: kind === 'raid' ? 2700 : kind === 'keystone' ? 99999 : TUNE.coreRecallSec,
      diff: moon.raidDiff || null, red: !!ctx.gate?.()?.red, ks: null, rng: rndFor('inst' + kind), threatT: 0, openedByTimer: false, week: cy.inst?.wk || mineWeek(),
    };
    const rng = cur.rng;
    const table = eligibleElites(moon);
    // ---- arena lock
    const door = arenaDoor();
    if (door) {
      if (!plan.lockedArena && door.locked) { door.locked = false; game.net.broadcast('door', { id: door.id, open: false, locked: false, silent: true }); }
      else if (plan.lockedArena && !door.locked) door.locked = true;
    }
    // ---- bosses
    if (kind === 'core' || kind === 'gate') {
      const gate = kind === 'gate' ? ctx.gate?.() : null;
      let b = kind === 'core' ? bossFor(moon.interior, sector) : (moon.legacyGate ? { id: 'legacybot' } : BOSS_TABLE[moon.interior] || BOSS_TABLE.factory);
      if (b.id === 'legacybot') b = { ...b, id: 'legacybot' };
      cur.finalType = b.id;
      const extra = { sector, crew, hpMul: gate?.hpMul || 1, dmgMul: 1, role: 'final' };
      let c = spawnBossAt(b.id, plan.bossRoom, extra);
      if (!c && b.id === 'legacybot') { b = BOSS_TABLE[moon.interior] || BOSS_TABLE.factory; cur.finalType = b.id; c = spawnBossAt(b.id, plan.bossRoom, extra); }
      addBoss(c, b.id, 'final');
      for (const k of plan.keyHolders) {
        const kc = bosses.spawnBoss('keyholder', roomPos(k.room), { sector, crew, role: 'keyholder', lair: lairOf(k.room) });
        addBoss(kc, 'keyholder', 'keyholder');
      }
    } else if (kind === 'raid') {
      const list = P.raidBosses(String(run.runId ?? 'legacy'), cur.week);   // [mid1, mid2, final]
      const hpMul = raidD.hp, dmgMul = raidD.dmg;
      cur.finalType = list[2].id;
      addBoss(spawnBossAt(list[2].id, plan.bossRoom, { sector, crew, raid: true, hpMul, dmgMul, role: 'final' }), list[2].id, 'final');
      plan.keyHolders.slice(0, 2).forEach((k, i) => addBoss(spawnBossAt(list[i].id, k.room, { sector, crew, raid: true, hpMul: hpMul * 0.7, dmgMul, role: 'mid' }), list[i].id, 'mid'));
    } else if (kind === 'keystone') {
      const level = ctx.cy().inst?.level || 2;
      cur.ks = { level, limit: P.keystoneTime(moon.size, level), t: 0, forces: 0, need: P.keystoneForces(level, moon.size), guardian: null, expired: false, knobs: P.keystoneKnobs(level), spawnT: 6, viralBudget: 60 };
      cur.finalType = (BOSS_TABLE[moon.interior] || BOSS_TABLE.factory).id;
      ctx.applyKnobs?.(cur.ks.knobs, true);
      // demonetized: scrap already lying around is worth less
      if (cur.ks.knobs.lootMul !== 1) for (const it of game.items.all()) if (it.state === 'world' && it.value > 0 && !it.soulbound && it.type !== 'body') game.net.broadcast('it', { e: 'val', id: it.id, v: Math.max(1, Math.round(it.value * cur.ks.knobs.lootMul)) });
    }
    // ---- elites (wings + labyrinth)
    const list = kind === 'keystone' ? plan.elites.filter((_, i) => i % 3 === 0) : plan.elites;
    for (const e of list) spawnElite(moon, e.room, table, rng, 1 + (kind === 'raid' ? 1 : 0));
    pushLive({}, true);
    // announce
    if (kind === 'core' || kind === 'gate') {
      say('{@n}: the boss waits in the arena. {k} access card(s) needed - the Key Holders carry them.', { n: nm(cur.finalType), k: plan.keys }, 'warn');
    } else if (kind === 'raid') say('THE ALGORITHM\'S CORE: {a} bosses. Crew {n}: boss health x{m}.', { a: cur.bosses.length, n: crew, m: P.raidCrewMul(crew) }, 'warn');
    else say('CORRUPTED KEYSTONE +{l}: clear the enemy forces, then the Guardian. You have {m} minutes.', { l: cur.ks.level, m: Math.round(cur.ks.limit / 60) }, 'warn');
    return cur;
  }

  // ------------------------------------------------------------ drops
  function throwItem(type, pos, i, n, opts = {}) {
    const a = (i / Math.max(1, n)) * TAU + Math.random() * 0.4;
    const p = new THREE.Vector3(pos.x + Math.cos(a) * 0.9, pos.y + 1.0, pos.z + Math.sin(a) * 0.9);
    return game.items.hostSpawn(type, p, { linvel: [Math.cos(a) * 2, 3.2, Math.sin(a) * 2], ...opts });
  }
  function dropCard(c, b) {
    if (!ITEMS[CARD]) return;
    throwItem(CARD, c.pos, 0, 1);
    b.card = true;
    say('{@n} dropped an ARENA ACCESS CARD!', { n: nm(b.type) }, 'good');
  }
  function weaponPool() {
    const list = Object.values(ITEMS).filter((d) => d.kind === 'weapon' && !d.ranged && Array.isArray(d.value) && d.value[1] > 0 && d.dmg > 0);
    return list.length ? list : (ITEMS.machete ? [ITEMS.machete] : []);
  }
  /** chest content: { weapons, minRarity, shards:[[id,n]], scrap, trophy } - guaranteed Legendary+ for cores (design 14) */
  function dropChest(c, spec) {
    const run = game.run, r = rndFor('chest' + c.id);
    const moon = cur?.moon;
    const valueMul = (moon?.scrapMul || 1) * (1 + (run.quotaIndex || 0) * 0.06) * 1.3;
    const drops = [];
    const pool = weaponPool();
    for (let i = 0; i < (spec.weapons || 0) && pool.length; i++) {
      const w = pool[Math.floor(r.next() * pool.length)];
      drops.push({ type: w.id, af: rollWeaponAffixes(w, (c.level || 1) + 6 + (run.quotaIndex || 0), r, { minRarity: spec.minRarity || 'epic', luck: 1 }) });
    }
    for (const [id, n] of spec.shards || []) if (ITEMS[id]) for (let i = 0; i < n; i++) drops.push({ type: id });
    for (const [id, n] of spec.scrap || []) if (ITEMS[id]) for (let i = 0; i < n; i++) drops.push({ type: id });
    if (spec.trophy && ITEMS[trophyId(spec.trophy)]) drops.push({ type: trophyId(spec.trophy) });
    const ids = drops.map((dr, i) => throwItem(dr.type, c.pos, i, drops.length, { valueMul, af: dr.af || undefined }));
    // never leave loot in a wall / under the floor: after a moment anything that sank or flew off goes back next to the body
    const home = c.pos.clone();
    game.later?.(() => {
      for (const id of ids) {
        const it = id && game.items.get?.(id);
        if (!it || it.state !== 'world' || it.holder || !it.obj) continue;
        const q = it.obj.position;
        if (q.y < home.y - 1.5 || Math.hypot(q.x - home.x, q.z - home.z) > 10) game.net.broadcast('it', { e: 'tp', id, p: [+home.x.toFixed(2), +(home.y + 0.8).toFixed(2), +home.z.toFixed(2)] });
      }
    }, 2500);
    cyx({ k: 'chest', p: [+c.pos.x.toFixed(1), +c.pos.y.toFixed(1), +c.pos.z.toFixed(1)] });
  }
  function coreChest(c, sector, gate, first) {
    const spec = { weapons: 1, minRarity: 'legendary', shards: [['shard_algo', 1 + Math.floor(sector / 2)], ['shard_ecto', 2]], scrap: [['goldbar', 2 + Math.min(3, sector)], ['x_goldbars', 1]], trophy: c.type };
    if (sector >= 2) spec.shards.push(['shard_source', 1]);
    if (first) spec.shards.push(['shard_algo', 1]);
    if (gate) { spec.weapons += gate.chests > 1 ? 1 : 0; spec.scrap.push(['goldbar', 2 * (gate.chests || 1)]); }
    dropChest(c, spec);
  }

  // ------------------------------------------------------------ kills
  function bossDown(b, c) {
    b.dead = true;
    if (b.role === 'keyholder' || b.role === 'mid') { dropCard(c, b); pushLive({}, true); return; }
    // final / guardian
    cur.finalDead = true;
    if (cur.kind === 'keystone') {
      if (!cur.ks.expired) dropChest(c, { weapons: Math.min(3, 1 + Math.floor(cur.ks.level / 5)), minRarity: P.keystoneReward(cur.ks.level, 1).minRarity, scrap: [['goldbar', 1 + Math.floor(cur.ks.level / 3)]], trophy: null });
      say('THE GUARDIAN IS DOWN! Get to the ship.', {}, 'good');
    } else if (cur.kind === 'raid') {
      const D = P.RAID_DIFFS[cur.diff] || P.RAID_DIFFS.normal;
      const first = !ctx.raidLocked?.(cur.diff);
      const R = P.raidReward(cur.diff, cur.crew, first);
      if (first) dropChest(c, { weapons: D.chests, minRarity: R.minRarity, shards: [[R.shard, R.shards]], scrap: [['goldbar', 2 + D.tierAdd * 2], ['x_goldbars', 1 + D.tierAdd]], trophy: c.type });
      else say('WEEKLY LOCK: the {@d} raid chest was already claimed this week. Credits and XP still count.', { d: D.name }, 'info');
      say('THE ALGORITHM\'S CORE HAS BEEN CLEARED!', {}, 'good');
    } else {
      const gate = cur.kind === 'gate' ? ctx.gate?.() : null;
      const first = cur.kind === 'core' && !ctx.cy().firstKills?.[cur.moon.interior];
      coreChest(c, cur.sector, gate, first);
      say('{@n} has been defeated! The BOSS CHEST spills across the floor.', { n: nm(b.type) }, 'good');
    }
    cyx({ k: 'bossdown', ty: b.type });
    pushLive({}, true);
    ctx.onFinalDead?.(cur);
  }
  function onCreatureKilled(c) {
    if (!cur || !host()) return;
    const b = cur.bosses.find((x) => x.id === c.id);
    if (b) { bossDown(b, c); return; }
    const ks = cur.ks;
    if (!ks || ks.expired || ks.guardian || c.zone !== 'in' || c.def?.cyAux || c.def?.boss || c.def?.hazard) return;
    ks.forces += P.killPoints(c.def?.power, c.elite);
    if (ks.knobs.spread && c.def?.power >= 1 && ks.viralBudget > 0 && c.type !== 'scuttler') {
      ks.viralBudget -= 2;
      for (let k = 0; k < ks.knobs.spread; k++) game.creatures.hostSpawn('scuttler', c.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0, (Math.random() - 0.5) * 1.4)), { level: 1, zone: 'in' });
    }
    if (ks.forces >= ks.need) spawnGuardian();
  }
  function spawnGuardian() {
    const ks = cur.ks;
    if (ks.guardian) return;
    const type = cur.finalType;
    const level = ks.level;
    const c = spawnBossAt(type, cur.plan.bossRoom, { sector: cur.sector, crew: cur.crew, hpMul: 0.6 + 0.06 * (level - 1), dmgMul: 0.8 + 0.03 * level, role: 'guardian' });
    ks.guardian = c ? c.id : 'x';
    addBoss(c, type, 'guardian');
    say('ENEMY FORCES AT 100%. THE GUARDIAN ({@n}) AWAKENS IN THE ARENA!', { n: nm(type) }, 'bad');
    cyx({ k: 'banner', main: 'THE GUARDIAN AWAKENS', sub: '' });
    pushLive({}, true);
    if (!c) { ks.guardian = null; cur.finalDead = true; ctx.onFinalDead?.(cur); }   // could not spawn (should never happen): count it as cleared, never soft-lock
  }

  // ------------------------------------------------------------ arena door (access cards)
  function arenaUnlock(d, from, door) {
    if (!cur || !door) return false;
    const it = d.key ? game.items.get(d.key) : null;
    if (!it || it.holder !== from || it.type !== CARD) { game.net.sendTo(from, 'sys', sysMsg('The arena lock needs the ACCESS CARDS from the Key Holders ({a}/{b}).', { a: cur.keysUsed, b: cur.plan.keys }, 'bad')); return true; }
    game.net.broadcast('it', { e: 'rm', id: it.id });
    cur.keysUsed += 1;
    if (cur.keysUsed >= cur.plan.keys) {
      door.locked = false;
      game.hostSetDoor(door.id, true);
      game.net.broadcast('door', { id: door.id, open: true, locked: false, silent: false });
      say('ACCESS GRANTED - the boss arena is open.', {}, 'good');
    } else say('ACCESS CARD {a}/{b} accepted.', { a: cur.keysUsed, b: cur.plan.keys }, 'info');
    pushLive({}, true);
    return true;
  }
  function forceOpenArena(why) {
    const door = arenaDoor();
    if (!door || !door.locked) return;
    door.locked = false;
    game.net.broadcast('door', { id: door.id, open: true, locked: false, silent: false });
    say(why === 'timer' ? 'SECURITY OVERRIDE: the boss arena door has been unlocked.' : 'The arena lock gives way.', {}, 'warn');
    if (cur) { cur.keysUsed = cur.plan.keys; pushLive({}, true); }
  }

  // ------------------------------------------------------------ tick
  function tick(dt) {
    if (!cur || !host()) return;
    const run = game.run;
    if (run.phase !== 'moon') return;
    cur.elapsed += dt;
    if (run.time > 990) run.time = 990;   // no time pressure: the day clock never reaches dusk / midnight inside an instance
    const door = arenaDoor();
    if (door?.locked && cur.plan.lockedArena && cur.elapsed >= TUNE.arenaAutoOpenSec && !cur.openedByTimer) { cur.openedByTimer = true; forceOpenArena('timer'); }
    // Threat ramps up in the cores ("zaman baskisi yok, ama Threat hizli artar")
    if (cur.kind !== 'keystone') {
      cur.threatT += dt;
      if (cur.threatT >= 60) { cur.threatT = 0; game.hostData.powerBoost = (game.hostData.powerBoost || 0) + 0.5; game.hostSpawnWave?.(1); }
    }
    const ks = cur.ks;
    if (ks && !ks.expired) {
      ks.t += dt;
      if (Math.floor(ks.t) !== Math.floor(ks.t - dt)) pushLive();
      if (ks.t >= ks.limit && !cur.finalDead) {
        ks.expired = true;
        cur.recallAt = Math.min(cur.recallAt, cur.elapsed + 300);
        say('THE KEYSTONE IS DEPLETED! The facility is destabilising - get out before the recall.', {}, 'bad');
        cyx({ k: 'banner', main: 'KEYSTONE DEPLETED', sub: '', kind: 'bad' });
        pushLive({}, true);
      }
      if (!ks.guardian && !cur.finalDead) {
        ks.spawnT -= dt;
        if (ks.spawnT <= 0) { ks.spawnT = P.KS.spawnEvery; keystoneWave(); }
      }
    }
    if (cur.elapsed > cur.recallAt && !cur.recalled) {
      cur.recalled = true;
      say('AUTOPILOT RECALL: this run is over. Return to the ship.', {}, 'bad');
      game.hostBeginTakeoff?.('recall');
    }
  }
  function keystoneWave() {
    const ks = cur.ks;
    let alive = 0;
    for (const c of game.creatures.host.values()) if (!c.dead && c.zone === 'in' && !c.def.hazard && !c.def.cyAux && !c.def.boss) alive++;
    const cap = 14 + ks.level;
    const n = Math.min(cap - alive, 3 + Math.floor(ks.level / 3));
    if (n <= 0) return;
    const table = Object.entries(spawnTable(cur.moon, 'in', game.run)).filter(([id]) => { const d = CREATURES[id]; return d && !d.hazard && !d.boss && !d.noSpawn && d.hp && (d.dmg || 0) < 90 && !['mimic', 'jester', 'leech'].includes(id) && d.zone !== 'out'; });
    let spawned = 0;
    for (let i = 0; i < n * 3 && spawned < n; i++) {
      const w = table.reduce((s, [, x]) => s + x, 0);
      let r = Math.random() * w, id = table[0]?.[0];
      for (const [k, x] of table) { r -= x; if (r <= 0) { id = k; break; } }
      if (id && game.hostSpawnCreatureIndoor?.(id)) spawned++;
    }
  }

  // ------------------------------------------------------------ finish (takeoff)
  function finish(reason) {
    const c = cur;
    if (!c) return null;
    cur = null;
    const res = { kind: c.kind, success: c.finalDead, reason, level: c.ks?.level, diff: c.diff, boss: c.finalType, crew: c.crew, sector: c.sector };
    if (c.kind === 'keystone') {
      const ks = c.ks;
      const success = c.finalDead && !ks.expired;
      const left = Math.max(0, ks.limit - ks.t);
      const r = P.keystoneResult(ks.level, left / ks.limit, success);
      res.success = success; res.next = r.next; res.up = r.up; res.depleted = r.depleted; res.left = Math.round(left); res.limit = ks.limit;
      ctx.applyKnobs?.(null, false);
    }
    game.hostData.powerBoost = 0;
    return res;
  }
  function abort() { if (cur?.ks) ctx.applyKnobs?.(null, false); cur = null; }

  return {
    populate, onCreatureKilled, tick, arenaUnlock, finish, abort, forceOpenArena,
    get cur() { return cur; },
    hud() { return cur ? { kind: cur.kind, keys: cur.keysUsed, keysNeed: cur.plan.keys, boss: cur.finalType, bossDead: cur.finalDead, forces: cur.ks ? cur.ks.forces / cur.ks.need : null, left: cur.ks ? cur.ks.limit - cur.ks.t : null } : null; },
  };
}
