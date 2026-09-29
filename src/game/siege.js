// SIEGE (wave 2, module 'siege'): tower-defense event. Creatures pour out of the facility and the map edges, walk to the ship
// and attack deployables (the crew's defences), players outside and the ship itself. 60 s prep siren, 3-5 waves (fodder swarm,
// slow tank, fast runners, a mini-boss every 3rd wave), Ship Hull Integrity 0-100 and a door with its own HP.
// At hull 0 creatures steal / break scrap inside the ship (a loss, never a game over). Per-wave rewards, SIEGE HELD bonus + XP +
// Clout, flawless = a rare blueprint. Numbers / reasoning: docs/wave2/siege.md, pure part: siege_core.js.
// Triggers: extraction aftermath, night + Threat >= HUNTED (small chance), Breach Night (last quota day), contract hook
// game.mods.emit('tfg:siege', { reason: 'contract' }, game). Never before quota 2, max 1 per day.
// Host state lives in game.run.siege (generic run sync); everything is cleaned up on takeoff / dispose.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { t, tf, addTranslations } from '../core/i18n.js';
import { registerCreature } from './creatures.js';
import { MOONS } from './moons.js';
import { FACILITY_Y } from '../world/facility.js';
import { insideShip } from '../world/ship.js';
import { clamp, angleDiff } from '../core/util.js';
import { unlockBlueprint } from './research.js';
import { BLUEPRINTS } from './recipes.js';
import {
  HULL, DOOR, TUNE, SG, FlowField, distToHull, nearDoor, siegePower, waveCount, planWave, waveReward, heldReward, inBox,
} from './siege_core.js';
import { installDeployables, SIEGE_BLUEPRINTS, DEPS } from './deployables.js';
import { createSiegeHud } from '../ui/siegehud.js';

// ---------------------------------------------------------------------------------------------- creatures (registered on every peer)
for (const [id, s] of Object.entries(SG)) {
  registerCreature(id, {
    name: s.name, model: s.model, modelScale: s.scale, hp: s.hp, dmg: s.dmg, walk: s.run * 0.6, run: s.run, power: 0, xp: s.xp, coin: s.coin,
    zone: 'out', radius: s.radius, height: s.height, noSpawn: true, noHunt: true, noCompDrop: true, siege: true,
    lore: 'Overflow from the facility. It wants the ship, and anything you built to stop it.',
  }, () => {});   // driven by siege.js (behaviour is a no-op for the generic creature loop)
}

addTranslations({
  'SIEGE INCOMING': 'KUŞATMA GELİYOR', 'SIEGE HELD': 'KUŞATMA PÜSKÜRTÜLDÜ', 'SIEGE BREACHED': 'KUŞATMA YARILDI', SIEGE: 'KUŞATMA', HULL: 'GÖVDE', DOOR: 'KAPI', PREP: 'HAZIRLIK', WAVE: 'DALGA', LULL: 'ARA', ALIVE: 'KALAN',
  'Build your defences. Close the ship door if you are not ready.': 'Savunmanı kur. Hazır değilsen gemi kapısını kapat.', 'Creatures are pouring out of the facility!': 'Yaratıklar tesisten dışarı taşıyor!',
  'WAVE {n} CLEARED': '{n}. DALGA TEMİZLENDİ', 'FINAL WAVE': 'SON DALGA', 'MINI-BOSS': 'MİNİ PATRON', 'HULL BREACHED - creatures are tearing into the ship!': 'GÖVDE YARILDI - yaratıklar gemiyi parçalıyor!',
  'The door is broken - repair it with scrap metal first.': 'Kapı kırıldı - önce hurda metalle tamir et.', 'Patch hull [E]': 'Gövdeyi yamala [E]', 'Repair door [E]': 'Kapıyı tamir et [E]', 'Scrap Metal x1': 'Hurda Metal x1',
  'Hull integrity': 'Gövde bütünlüğü', 'Bring Scrap Metal': 'Hurda Metal getir', 'lost to the raiders': 'yağmacılara kaptırıldı', 'BLUEPRINT UNLOCKED': 'ŞEMA AÇILDI', 'FLAWLESS': 'KUSURSUZ', 'BREACH NIGHT': 'YARILMA GECESİ', 'DOOR BROKEN': 'KAPI KIRILDI', 'Repair it with scrap metal.': 'Hurda metalle tamir et.',
  'SIEGE: prep - build defences ({s} s)': 'KUŞATMA: hazırlık - savunma kur ({s} sn)', 'SIEGE wave {a}/{b}: {n} creatures left': 'KUŞATMA {a}/{b}. dalga: {n} yaratık kaldı', 'SIEGE: next wave in {s} s': 'KUŞATMA: sonraki dalga {s} sn sonra',
  'No siege in progress.': 'Devam eden kuşatma yok.', 'Next risk': 'Sonraki risk', 'Status': 'Durum',
});

const fmt = (n) => Math.round(n);
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export function installSiege(game) {
  const mods = game.mods;
  const offs = [];
  let disposed = false, boundNet = null;
  const host = () => !!game.isHost;
  const hud = createSiegeHud(game);
  const api = { hud };
  let state = null;                 // host: mirror of run.siege (same object)
  let flow = null, blockersDirty = false, flowT = 0, solid = [];
  let plan = [], queue = [], spawnAcc = 0, waveT = 0, rng = null, sirenH = null, raidT = 0, doneT = 0, checkT = 0, nightAcc = 0, syncT = 0, hullShakeT = 0;
  const members = new Map();       // creature id -> true
  const stats = { started: 0, held: 0, lost: 0, raided: 0, kills: 0 };
  const pendingTimers = [];
  const bd = () => { try { return game.balance?.scale?.().dmg || 1; } catch { return 1; } };

  // ------------------------------------------------------------------------------------------ ship hull / door
  api.onDepsChanged = () => { blockersDirty = true; };
  api.repairShip = (amount) => {
    if (!state || !host() || state.phase === 'done') return false;
    let any = false;
    if (state.hull < TUNE.hullMax) { state.hull = Math.min(TUNE.hullMax, state.hull + amount); any = true; }
    if (state.doorHp < state.doorMax) { state.doorHp = Math.min(state.doorMax, state.doorHp + amount * 2.6); if (state.doorBroken && state.doorHp > state.doorMax * 0.25) state.doorBroken = false; any = true; }
    return any;
  };
  function hitShip(c, S, mult = 1) {
    if (!state) return;
    let amt = S.hull * S.cd * (1 + 0.1 * ((c.level || 1) - 1)) * mult;
    const soaked = api.deployables?.absorb(c.pos, amt * 12);
    if (soaked !== undefined) amt = soaked / 12;
    if (amt <= 0) return;
    const door = nearDoor(c.pos.x, c.pos.z);
    const doorOpen = game.ship.door.open;
    if (door && !doorOpen && !state.doorBroken) {
      state.doorHp -= amt * 2.6;
      if (state.doorHp <= 0) {
        state.doorHp = 0; state.doorBroken = true; state.flawless = false;
        game.net.broadcast('door', { id: 'ship', open: true });
        game.net.broadcast('sgx', { k: 'banner', main: t('DOOR BROKEN'), sub: t('Repair it with scrap metal.'), kind: 'bad' });
      }
    } else {
      const before = state.hull;
      state.hull = Math.max(0, state.hull - amt * (door && doorOpen ? 1.4 : 1));
      state.hullMin = Math.min(state.hullMin, state.hull);
      if (state.hull < TUNE.hullMax - 15) state.flawless = false;
      if (before > 0 && state.hull <= 0) game.net.broadcast('sgx', { k: 'banner', main: t('HULL BREACHED - creatures are tearing into the ship!'), sub: '', kind: 'bad' });
    }
    if (game.time - hullShakeT > 0.6) { hullShakeT = game.time; game.net.broadcast('sgx', { k: 'hull', hull: fmt(state.hull) }); }
  }
  function raid() {
    // hull at 0: something drags a piece of scrap out of the ship (steal or smash it). A loss, never a game over.
    const items = game.items.inShipItems().filter((it) => !it.soulbound && it.type !== 'body' && it.def.kind !== 'tool' && !it.holder);
    if (!items.length) return;
    const it = items[Math.floor(Math.random() * items.length)];
    game.net.broadcast('it', { e: 'rm', id: it.id });
    stats.raided++; state.raided = (state.raided || 0) + 1;
    const p = it.obj.position;
    game.net.broadcast('fx', { k: 'snd', s: 'glass_break', p: [p.x, p.y, p.z], v: 0.9 });
    game.net.broadcast('sys', { text: `${game.itemDefOf?.(it.type)?.name || it.type} ${t('lost to the raiders')}`, kind: 'bad' });
  }
  const scrapHeld = (from) => { for (const it of game.items.all()) if (it.holder === from && it.type === 'comp_scrapmetal' && !it._sgUsed) return it; return null; };
  function hostPatch(d, from) {
    if (!host() || !state || state.phase === 'done') return;
    const pp = from === game.selfId ? game.player.pos : game.remotes.get(from)?.pos;
    if (!pp || Math.hypot(pp.x - DOOR.x, pp.z - 4) > 9) return;
    const s = scrapHeld(from); if (!s) return;
    if (d.what === 'door' && state.doorHp < state.doorMax) { state.doorHp = Math.min(state.doorMax, state.doorHp + TUNE.doorPatch); if (state.doorBroken && state.doorHp > state.doorMax * 0.25) state.doorBroken = false; }
    else if (d.what === 'hull' && state.hull < TUNE.hullMax) state.hull = Math.min(TUNE.hullMax, state.hull + TUNE.hullPatch);
    else return;
    s._sgUsed = true; game.net.broadcast('it', { e: 'rm', id: s.id });
    game.net.broadcast('fx', { k: 'snd', s: 'spark', p: [DOOR.x, 1.3, 4], v: 0.7 });
  }

  // ------------------------------------------------------------------------------------------ spawning
  function spawnPoints(wave) {
    const out = game.world?.outdoor, terr = game.world?.terrain;
    const pts = [];
    if (out?.mainExit?.spawn) pts.push({ x: out.mainExit.spawn.x, z: out.mainExit.spawn.z, fac: true });
    for (const fe of out?.fireExits || []) if (fe?.spawn) pts.push({ x: fe.spawn.x, z: fe.spawn.z, fac: true });
    const far = pts.filter((p) => Math.hypot(p.x, p.z) > 30);
    const half = terr?.playHalf ?? 130, R = clamp(half * 0.72, 55, 110);
    const a0 = rng.float(0, Math.PI * 2);
    const edges = [0, 2.1, 4.2].map((o) => ({ x: Math.cos(a0 + o + wave * 0.9) * R, z: Math.sin(a0 + o + wave * 0.9) * R, fac: false }));
    const pick = [];
    if (far.length) pick.push(far[wave % far.length]);
    if (far.length > 1 && wave % 2 === 0) pick.push(far[(wave + 1) % far.length]);
    pick.push(edges[0], edges[1]);
    if (wave >= 3) pick.push(edges[2]);
    return pick;
  }
  function planQueue(w) {
    const wp = plan[w - 1];
    const pts = spawnPoints(w);
    const list = [];
    const level = 1 + Math.floor((game.run.quotaIndex || 0) / 5);
    const push = (type, n, lv = level) => { for (let i = 0; i < n; i++) list.push({ type, level: lv }); };
    push('sg_swarmer', wp.swarm); push('sg_brute', wp.tank); push('sg_runner', wp.runner);
    // shuffle (seeded) so tanks / runners are spread through the drip, boss last
    for (let i = list.length - 1; i > 0; i--) { const j = rng.int(0, i); [list[i], list[j]] = [list[j], list[i]]; }
    if (wp.boss) list.push({ type: 'sg_boss', level: clamp(state.crew, 1, 4) });
    list.forEach((e, i) => { const p = pts[i % pts.length]; e.x = p.x + rng.float(-4, 4); e.z = p.z + rng.float(-4, 4); e.fac = p.fac; });
    return list;
  }
  function spawnOne(e) {
    const terr = game.world?.terrain;
    const y = terr?.heightAt?.(e.x, e.z) ?? 0;
    const c = game.creatures.hostSpawn(e.type, new THREE.Vector3(e.x, y, e.z), { level: e.level, zone: 'out', state: 'run', affix: null, variant: null });
    if (!c) return;
    c.data.sg = 1; c.data.tt = 0; c.data.tgt = null;
    members.set(c.id, true);
  }

  // ------------------------------------------------------------------------------------------ creature AI (host)
  const _d = { x: 0, z: 0 };
  function pickTarget(c, S) {
    const M = game.creatures, players = game.aiPlayers().filter((p) => !p.dead && p.zone === 'out' && !p.inShip);
    let bp = null, bpd = 1e9;
    for (const p of players) { const d = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z); if (d < bpd) { bpd = d; bp = p; } }
    const doorOpen = game.ship.door.open || (state && state.doorBroken);
    // hurt by a player recently -> hit back
    if (c.data.hitBy && game.time - (c.data.hitAt || 0) < 4) { const hp = players.find((p) => p.id === c.data.hitBy); if (hp && Math.hypot(hp.pos.x - c.pos.x, hp.pos.z - c.pos.z) < 9) return { k: 'player', id: hp.id }; }
    if (S.hunt && bp && bpd < S.hunt) return { k: 'player', id: bp.id };
    if (bp && bpd < 4.2) return { k: 'player', id: bp.id };
    // a creature standing in the doorway of an open door goes for the crew inside
    if (doorOpen && nearDoor(c.pos.x, c.pos.z)) {
      for (const p of game.aiPlayers()) if (!p.dead && p.inShip && Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z) < 6) return { k: 'player', id: p.id };
    }
    const D = api.deployables;
    if (D) {
      const kinds = c.type === 'sg_brute' ? ['barricade', 'turret', 'tesla'] : c.type === 'sg_boss' ? ['turret', 'tesla', 'shield', 'barricade', 'gen', 'bank', 'flood', 'drone'] : c.type === 'sg_runner' ? ['turret', 'tesla', 'drone', 'sensor'] : ['turret', 'tesla', 'barricade', 'flood', 'gen', 'bank', 'drone', 'shield'];
      const dep = D.nearest(c.pos.x, c.pos.z, S.deps || 8, kinds);
      if (dep) return { k: 'dep', id: dep.id };
    }
    void M;
    return { k: 'ship' };
  }
  function move(c, S, dx, dz, dt, slowMul = 1) {
    const M = game.creatures;
    let speed = M.speedMul(c, S.run) * slowMul;
    if (c.slowT > 0) speed *= c.slowMul || 0.55;
    if (c.affix === 'viral') speed *= 1.2;
    const l = Math.hypot(dx, dz) || 1;
    const step = speed * dt;
    const nx = c.pos.x + (dx / l) * step, nz = c.pos.z + (dz / l) * step;
    const r = (S.radius || 0.5) * 0.7;
    if (distToHull(nx, nz) < 0.9) return { blocked: 'ship' };
    for (const b of solid) if (inBox(nx, nz, b, r) && !inBox(c.pos.x, c.pos.z, b, r)) return { blocked: b };
    c.pos.x = nx; c.pos.z = nz;
    const terr = game.world?.terrain;
    if (terr) c.pos.y = terr.heightAt(nx, nz);
    const want = Math.atan2(dx, dz);
    c.yaw += clamp(angleDiff(c.yaw, want), -9 * dt, 9 * dt);
    return null;
  }
  function stepCreature(c, dt) {
    const S = SG[c.type]; if (!S) return;
    if (c.stunT > 0) return;
    const M = game.creatures;
    const doAttack = (fn) => {
      if (c.age < 1) return;
      if (c.state !== 'attack') c.setState('attack');
      if (c.cooldown <= 0) { c.cooldown = S.cd; fn(); }
    };
    c.data.tt -= dt;
    if (c.data.tt <= 0) {
      c.data.tt = 0.35 + Math.random() * 0.25;
      c.data.tgt = pickTarget(c, S);
    }
    const tg = c.data.tgt || { k: 'ship' };
    if (c.state === 'attack' && c.t < 0.4) return;   // hit animation
    if (tg.k === 'player') {
      const p = game.aiPlayers().find((q) => q.id === tg.id);
      if (!p || p.dead) { c.data.tgt = null; c.data.tt = 0; return; }
      const dx = p.pos.x - c.pos.x, dz = p.pos.z - c.pos.z, d = Math.hypot(dx, dz);
      if (p.inShip && !(game.ship.door.open || state.doorBroken)) { c.data.tgt = null; c.data.tt = 0; return; }
      if (d < S.reach + (p.inShip ? 1.7 : 0) && Math.abs(p.pos.y - c.pos.y) < 2.6) { c.yaw = Math.atan2(dx, dz); doAttack(() => M.attack(c, p, Math.round(c.dmg), 'siege')); return; }
      if (d > 40) { c.data.tgt = null; c.data.tt = 0; return; }
      c.setState('run');
      const r = move(c, S, dx, dz, dt);
      if (r?.blocked && r.blocked !== 'ship') c.data.tgt = { k: 'dep', id: r.blocked.id };
      return;
    }
    if (tg.k === 'dep') {
      const D = api.deployables, dep = D?.get(tg.id);
      if (!dep || dep.dead) { c.data.tgt = null; c.data.tt = 0; return; }
      const dx = dep.pos.x - c.pos.x, dz = dep.pos.z - c.pos.z, d = Math.hypot(dx, dz) - Math.max(dep.def.hx, dep.def.hz) * 0.7;
      if (d < S.reach) { c.yaw = Math.atan2(dx, dz); doAttack(() => D.damage(dep, S.dep * bd() * (1 + 0.1 * ((c.level || 1) - 1)))); return; }
      c.setState('run');
      const r = move(c, S, dx, dz, dt);
      if (r?.blocked && r.blocked !== 'ship') c.data.tgt = { k: 'dep', id: r.blocked.id };
      return;
    }
    // ship: follow the flow field, hit the hull when close enough
    const dh = distToHull(c.pos.x, c.pos.z);
    if (dh <= S.reach + 0.5) {
      // face the hull
      c.yaw = Math.atan2(-c.pos.x, -c.pos.z);
      doAttack(() => hitShip(c, S));
      return;
    }
    let ok = flow.dirAt(c.pos.x, c.pos.z, _d);
    if (!ok) { const l = Math.hypot(c.pos.x, c.pos.z) || 1; _d.x = -c.pos.x / l; _d.z = -c.pos.z / l; }
    c.setState('run');
    const r = move(c, S, _d.x, _d.z, dt);
    if (r?.blocked && r.blocked !== 'ship') c.data.tgt = { k: 'dep', id: r.blocked.id };
  }

  // ------------------------------------------------------------------------------------------ state machine
  function crewCount() { return clamp(game.aiPlayers().filter((p) => !p.dead).length || 1, 1, 8); }
  function sync(keys = ['siege']) { try { game.broadcastRun(keys); } catch { /* not ready */ } }
  function eligible(reason, force) {
    const run = game.run;
    if (!host() || !run || state) return false;
    if (run.phase !== 'moon' || MOONS[run.moon]?.company || !game.world?.terrain) return false;
    if (force) return true;
    if ((run.quotaIndex || 0) < TUNE.minQuotaIndex) return false;
    if (run.siegeDay === run.day) return false;
    if (!game.aiPlayers().some((p) => !p.dead)) return false;
    return true;
  }
  function start(opts = {}) {
    const reason = opts.reason || 'debug';
    if (!eligible(reason, opts.force !== false && reason === 'debug' ? true : !!opts.force)) return false;
    const run = game.run;
    const crew = crewCount();
    const threat = Number(game.balance?.threat?.() ?? run.threat ?? 0) || 0;
    const sc = siegePower({ quotaIndex: run.quotaIndex || 0, crew, threat, reason });
    const sgCap = opts.power || opts.waves ? null : game.crdirector?.siegeCaps?.();   // [crdirector] early sieges are smaller and shorter
    const P = sgCap ? Math.min((opts.power || 1) * sc.power, sgCap.power) : (opts.power || 1) * sc.power;
    const rate = (16 * 60) / (game.config.dayLengthSec || 720);
    const secLeft = (1436 - (run.time || 480)) / (rate * TUNE.clockSlow);
    const W = opts.waves || Math.min(waveCount(P, reason, secLeft), sgCap ? sgCap.waves : 5);
    rng = new RNG(hashStr(`${run.runId || run.seed}:siege:${run.day}:${stats.started}`));
    plan = []; for (let w = 1; w <= W; w++) plan.push(planWave(w, W, P));
    queue = []; members.clear(); spawnAcc = 0; waveT = 0; raidT = 0; doneT = 0;
    const half = (game.world?.terrain?.playHalf ?? 130) + 10;
    flow = new FlowField(half, 2);
    blockersDirty = true; flowT = 0; refreshFlow(true);
    const doorMax = Math.round(TUNE.doorHp * (0.8 + 0.2 * crew));
    state = run.siege = {
      id: stats.started + 1, reason, phase: 'prep', t: opts.prep ?? TUNE.prep, wave: 0, waves: W, alive: 0, total: 0, hull: TUNE.hullMax, hullMin: TUNE.hullMax,
      doorHp: doorMax, doorMax, doorBroken: false, flawless: true, power: +P.toFixed(2), crew, raided: 0, result: null,
    };
    run.siegeDay = run.day;
    stats.started++;
    sync(['siege', 'siegeDay']);
    game.net.broadcast('sgx', { k: 'banner', main: t('SIEGE INCOMING'), sub: reason === 'breach' ? t('BREACH NIGHT') : t('Build your defences. Close the ship door if you are not ready.'), kind: 'siege' });
    game.net.broadcast('sys', { text: `${t('SIEGE INCOMING')} - ${W} waves, ${Math.round(state.t)} s`, kind: 'bad' });
    mods?.emit('tfg:siegeState', { phase: 'prep', waves: W, reason }, game);
    return true;
  }
  function refreshFlow(force) {
    if (!flow || !(blockersDirty || force)) return;
    const list = api.deployables ? api.deployables.blockers() : [];
    flow.setBlockers(list);
    flow.compute();
    solid = list;
    blockersDirty = false;
  }
  function beginWave(w) {
    state.wave = w; state.phase = 'wave'; waveT = 0;
    queue = planQueue(w);
    state.total = queue.length; state.alive = queue.length;
    const wp = plan[w - 1];
    const sub = `${t('WAVE')} ${w}/${state.waves}${wp.boss ? ' · ' + t('MINI-BOSS') : ''}${wp.final ? ' · ' + t('FINAL WAVE') : ''}`;
    game.net.broadcast('sgx', { k: 'banner', main: `${t('WAVE')} ${w}`, sub, kind: 'wave' });
    if (queue.some((e) => e.fac)) game.net.broadcast('sys', { text: t('Creatures are pouring out of the facility!'), kind: 'warn' });
    sync();
    mods?.emit('tfg:siegeState', { phase: 'wave', wave: w, waves: state.waves }, game);
  }
  function dropComps(kind, n) {
    const y = (game.world?.terrain?.heightAt?.(DOOR.x + 1.5, HULL.z1 + 3.5) ?? 0) + 0.7;
    const at = new THREE.Vector3(DOOR.x + 1.5, y, HULL.z1 + 3.5);
    try { game.crafting?.dropComponents?.(at, kind, n); } catch (e) { console.warn('[siege] drop', e); }
  }
  function clearedWave(w) {
    const run = game.run, qi = run.quotaIndex || 0;
    const r = waveReward(w, state.waves, qi, state.crew);
    run.credits = (run.credits || 0) + r.credits; sync(['credits']);
    for (const [k, n] of r.drops) dropComps(k, n);
    const players = game.aiPlayers();
    for (const p of players) if (!p.dead) game.net.broadcast('xp', { to: p.id, xp: 40 + 8 * qi + 10 * w, coin: 4 + w, reason: `${tf('WAVE {n} CLEARED', { n: w })}` });
    game.net.broadcast('sgx', { k: 'banner', main: tf('WAVE {n} CLEARED', { n: w }), sub: `+▮${r.credits} · ${r.drops.reduce((a, [, n]) => a + n, 0)} parts`, kind: 'good' });
    if (w >= state.waves) return finish('held');
    state.phase = 'lull'; state.t = TUNE.lull;
    // the crew patches the hull a little between waves
    state.hull = Math.min(TUNE.hullMax, state.hull + 6);
    sync();
  }
  function finish(result) {
    if (!state || state.phase === 'done') return;
    const run = game.run, qi = run.quotaIndex || 0;
    const left = [...members.keys()];
    for (const id of left) { const c = game.creatures.host.get(id); if (c && !c.dead) game.creatures.kill(c, null, { silent: true }); }
    members.clear(); queue = [];
    state.phase = 'done'; state.alive = 0; state.t = 8;
    if (result === 'held' && state.hull <= 0) result = 'breached';
    state.result = result;
    if (result === 'held') {
      stats.held++;
      const r = heldReward(qi, state.crew, state.hull);
      run.credits = (run.credits || 0) + r.credits; sync(['credits']);
      for (const p of game.aiPlayers()) game.net.broadcast('xp', { to: p.id, xp: r.xp, coin: r.coin, reason: t('SIEGE HELD') });
      dropComps('arcane', 2);
      const flawless = state.flawless && state.hull >= TUNE.hullMax - 15 && !state.doorBroken;
      game.net.broadcast('sgx', { k: 'banner', main: t('SIEGE HELD'), sub: `+▮${r.credits} · +${r.xp} XP · +◈${r.coin}${flawless ? ' · ' + t('FLAWLESS') : ''}`, kind: 'good' });
      game.net.broadcast('sys', { text: `${t('SIEGE HELD')} +▮${r.credits}`, kind: 'good' });
      if (flawless) game.net.broadcast('sgx', { k: 'bp' });
    } else if (result === 'breached') {
      stats.lost++;
      game.net.broadcast('sgx', { k: 'banner', main: t('SIEGE BREACHED'), sub: `${state.raided || 0} ${t('lost to the raiders')}`, kind: 'bad' });
    }
    sync();
    mods?.emit('tfg:siegeState', { phase: 'done', result, waves: state.waves }, game);
  }
  function abort() {
    if (!state) return;
    for (const id of [...members.keys()]) { const c = game.creatures.host.get(id); if (c && !c.dead) game.creatures.kill(c, null, { silent: true }); }
    members.clear(); queue = [];
    state = null; flow = null;
    if (game.run) { game.run.siege = null; sync(); }
    mods?.emit('tfg:siegeState', { phase: 'aborted' }, game);
  }
  function tryStart(reason, d) {
    if (!eligible(reason, !!d?.force)) return false;
    return start({ reason, waves: d?.waves, power: d?.power, prep: d?.prep, force: !!d?.force });
  }

  function hostTick(dt) {
    const run = game.run;
    if (!run) return;
    if (!state) {
      // trigger checks once a second
      checkT -= dt; if (checkT > 0 || run.phase !== 'moon') return;
      checkT = 1;
      if (!eligible('night')) return;
      const time = run.time || 0;
      if (run.daysLeft === 1 && time >= TUNE.nightFrom && time < 22 * 60) { tryStart('breach'); return; }
      const threat = Number(game.balance?.threat?.() ?? run.threat ?? 0) || 0;
      if (threat >= 50 && time >= TUNE.nightFrom && time < TUNE.nightUntil) {
        nightAcc += 1;
        if (nightAcc >= 10) { nightAcc = 0; if (Math.random() < TUNE.nightChance) tryStart('night'); }
      }
      return;
    }
    if (run.phase !== 'moon') { abort(); return; }
    // the day clock crawls while the siege is on, and never reaches midnight until it is over
    if (state.phase !== 'done') {
      const rate = (16 * 60) / (game.config.dayLengthSec || 720);
      run.time -= dt * rate * (1 - TUNE.clockSlow);
      if (run.time > 1436) run.time = 1436;
      const hd = game.hostData;
      if (hd) { hd.spawnT = Math.max(hd.spawnT || 0, 10); hd.outdoorSpawnT = Math.max(hd.outdoorSpawnT || 0, 10); }
    }
    flowT -= dt;
    if (flowT <= 0) { flowT = 0.3; refreshFlow(false); }
    if (state.phase === 'prep') {
      state.t -= dt;
      if (state.t <= 0) beginWave(1);
    } else if (state.phase === 'wave') {
      waveT += dt;
      spawnAcc += dt * TUNE.spawnPerSec;
      while (spawnAcc >= 1 && queue.length && members.size < TUNE.maxAlive) { spawnAcc -= 1; spawnOne(queue.shift()); }
      if (!queue.length) spawnAcc = Math.min(spawnAcc, 1);
      for (const id of [...members.keys()]) {
        const c = game.creatures.host.get(id);
        if (!c || c.dead) { members.delete(id); stats.kills++; continue; }
        try { stepCreature(c, dt); } catch (e) { console.error('[siege] step', e); }
      }
      state.alive = members.size + queue.length;
      if (!queue.length && members.size === 0) clearedWave(state.wave);
      else if (state.wave >= state.waves && waveT > TUNE.waveCap + 45) clearedWave(state.wave);   // stragglers: they retreat, the wave counts
    } else if (state.phase === 'lull') {
      for (const id of [...members.keys()]) {   // leftovers of the last wave keep attacking
        const c = game.creatures.host.get(id);
        if (!c || c.dead) { members.delete(id); continue; }
        try { stepCreature(c, dt); } catch (e) { console.error('[siege] step', e); }
      }
      state.alive = members.size;
      state.t -= dt;
      if (state.t <= 0) beginWave(state.wave + 1);
    } else if (state.phase === 'done') {
      state.t -= dt;
      if (state.t <= 0) { state = null; flow = null; run.siege = null; sync(); }
      return;
    }
    // wave timer cap: the next wave does not wait for stragglers forever
    if (state.phase === 'wave' && state.wave < state.waves && waveT > TUNE.waveCap && !queue.length) { clearedWave(state.wave); }
    // hull 0: raiders
    if (state.hull <= 0 && state.phase !== 'done') {
      raidT += dt;
      if (raidT >= TUNE.raidEvery) { raidT = 0; if ([...members.keys()].some((id) => { const c = game.creatures.host.get(id); return c && distToHull(c.pos.x, c.pos.z) < 6; })) raid(); }
    }
    syncT -= dt;
    if (syncT <= 0) { syncT = 0.5; state.hull = +state.hull.toFixed(1); state.doorHp = Math.round(state.doorHp); }
  }

  // ------------------------------------------------------------------------------------------ net (clients + host share the sgx handler)
  function onSgx(m, from) {
    if (disposed || !m || (from !== game.selfId && from !== game.net?.hostId)) return;
    if (m.k === 'banner') { hud.banner(m.main, m.sub, m.kind); if (m.kind === 'siege') { game.audio?.play('ship_alarm', { volume: 0.8, bus: 'sfx' }); game.engine?.shake?.(0.3); } }
    else if (m.k === 'hull') {
      const p = game.player;
      game.audio?.play('hit_metal', { volume: 0.5, bus: 'sfx', pitch: 0.7 + Math.random() * 0.2 });
      if (p?.inShip) game.engine?.shake?.(0.18);
    } else if (m.k === 'bp') {
      const have = game.profile?.blueprints || {};
      const bp = SIEGE_BLUEPRINTS.find((id) => !have[id]);
      if (bp && unlockBlueprint(game.profile, bp)) {
        game.progress?.save?.();
        hud.banner(t('BLUEPRINT UNLOCKED'), t(BLUEPRINTS[bp]?.name || bp), 'good');
        game.audio?.ui?.('ui_levelup', 0.85);
      }
    }
  }
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:sgx', onSgx);
    boundNet = net; net.on('msg:sgx', onSgx);
  }
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  offs.push(mods.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    const prev = game.net.handlers.get('shipdoor');
    H('shipdoor', (d, from) => {
      if (state && state.doorBroken && d && d.open === false && state.phase !== 'done') { game.net.sendTo(from, 'sys', { text: t('The door is broken - repair it with scrap metal first.'), kind: 'bad' }); return; }
      prev?.(d, from);
    });
    H('sgpatch', (d, from) => { try { hostPatch(d, from); } catch (e) { console.error('sgpatch', e); } });
  }));
  offs.push(mods.on('tfg:extraction', (d, g) => {
    if (g && g !== game) return;
    if (!host() || d?.phase !== 'end') return;
    if (game.run?.phase !== 'moon' || Math.random() >= TUNE.extractionChance) return;
    game.later(() => { if (!disposed) tryStart('extraction'); }, 20000);
  }));
  offs.push(mods.on('tfg:siege', (d, g) => { if ((!g || g === game) && host()) tryStart(d?.reason || 'contract', d); }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g !== game) return;
    if (ph !== 'moon') { hud.reset(); if (host() && state) abort(); }
  }));
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    if (host() && game.run?.phase === 'moon') { try { hostTick(dt); } catch (e) { console.error('[siege] host', e); } }
    hud.update(dt, game.run?.siege || null);
    // siren: on while the prep countdown runs
    const s = game.run?.siege;
    if (s && s.phase === 'prep' && !sirenH) { sirenH = game.audio?.play('alarm_loop', { volume: 0.35, loop: true, bus: 'sfx' }) || null; }
    if ((!s || s.phase !== 'prep') && sirenH) { try { sirenH.stop(0.4); } catch { /* ignore */ } sirenH = null; }
  }));
  // hull / door patch points on the ship's outside + objective lines
  offs.push(mods.on('interactables', (list, g) => {
    if (g !== game || game.run?.phase !== 'moon') return;
    const s = game.run?.siege; if (!s || s.phase === 'done' || game.player.dead) return;
    const p = game.player;
    if (Math.hypot(p.pos.x - DOOR.x, p.pos.z - 4) > 12 || p.pos.y < -50) return;
    const has = api.deployables?.hasItem?.('comp_scrapmetal');
    if (s.hull < TUNE.hullMax) list.push({ pos: new THREE.Vector3(-1.4, 1.3, 3.95), r: 1.2, reach: 4, label: has ? t('Patch hull [E]') : `${t('Hull integrity')} ${fmt(s.hull)}%`, sub: has ? t('Scrap Metal x1') : t('Bring Scrap Metal'), action: () => { if (has) game.net.request('sgpatch', { what: 'hull' }); } });
    if (s.doorHp < s.doorMax) list.push({ pos: new THREE.Vector3(DOOR.x, 1.3, 3.95), r: 1.0, reach: 4, label: has ? t('Repair door [E]') : `${t('DOOR')} ${fmt((s.doorHp / s.doorMax) * 100)}%`, sub: has ? t('Scrap Metal x1') : t('Bring Scrap Metal'), action: () => { if (has) game.net.request('sgpatch', { what: 'door' }); } });
  }));
  offs.push(mods.on('objectives', (add, g, phase) => {
    const s = game.run?.siege;
    if (!s || phase !== 'moon') return;
    if (s.phase === 'prep') add(tf('SIEGE: prep - build defences ({s} s)', { s: Math.max(0, Math.ceil(hud.timeLeft(s))) }), 'warn');
    else if (s.phase === 'wave') add(tf('SIEGE wave {a}/{b}: {n} creatures left', { a: s.wave, b: s.waves, n: s.alive }), 'warn', false, s.total ? 1 - s.alive / s.total : 0);
    else if (s.phase === 'lull') add(tf('SIEGE: next wave in {s} s', { s: Math.max(0, Math.ceil(hud.timeLeft(s))) }), 'warn');
  }));

  // ------------------------------------------------------------------------------------------ terminal
  function riskLines() {
    const run = game.run, out = [];
    if (!run) return ['SIEGE: no run.'];
    const qi = run.quotaIndex || 0, time = run.time || 0;
    const threat = Number(game.balance?.threat?.() ?? run.threat ?? 0) || 0;
    const late = time >= TUNE.nightFrom;
    const blocked = qi < TUNE.minQuotaIndex ? 'not before quota 2' : run.siegeDay === run.day ? 'already had one today' : null;
    let risk = 'LOW';
    if (!blocked) {
      if (run.daysLeft === 1) risk = 'HIGH (BREACH NIGHT: last quota day, from 18:00)';
      else if (threat >= 50 && late) risk = 'MEDIUM (night + HUNTED)';
      else if (threat >= 50) risk = 'RISING (HUNTED: after 18:00 a siege can start)';
      else if (run.fac?.extraction) risk = 'HIGH (extraction alarm: a siege may follow)';
    }
    out.push(`${t('Next risk')}: ${blocked ? 'NONE - ' + blocked : risk}`);
    out.push('Triggers: extraction aftermath (70%), night + Threat >= HUNTED (small chance), BREACH NIGHT (last quota day 18:00), contract hook.');
    out.push('Rules: first siege at quota 2, max 1 per day, 60 s prep, 3-5 waves, mini-boss every 3rd wave.');
    return out;
  }
  try {
    window.KefalAPI?.registerCommand?.('siege', (rest, term, g) => {
      const s = g.run?.siege;
      const lines = ['SIEGE // ship defence'];
      if (s) {
        lines.push(`${t('Status')}: ${s.phase.toUpperCase()}${s.phase === 'prep' || s.phase === 'lull' ? ` ${Math.ceil(hud.timeLeft(s))} s` : ''}  wave ${s.wave}/${s.waves}  creatures ${s.alive}`);
        lines.push(`${t('HULL')} ${fmt(s.hull)}%   ${t('DOOR')} ${fmt((s.doorHp / s.doorMax) * 100)}%${s.doorBroken ? ' (BROKEN)' : ''}   reason ${s.reason}   power x${s.power}`);
        if (s.result) lines.push(`Result: ${s.result.toUpperCase()}`);
      } else lines.push(t('No siege in progress.'));
      lines.push('', ...riskLines());
      lines.push('', 'Deployables: craft them at the workbench (tab TECH) or buy from the store (tab TECH). Hold a kit: LMB place, R rotate, E pack up / repair / feed.');
      term.print(lines.join('\n'));
    }, 'siege status and the next risk');
  } catch (e) { console.warn('siege command', e); }

  Object.defineProperty(api, 'state', { get: () => game.run?.siege || null });
  Object.defineProperty(api, 'flow', { get: () => flow });
  Object.assign(api, {
    stats, plan: () => plan,
    /** debug / tests (host): start a siege now. opts: { prep, waves, power, reason } */
    start: (opts = {}) => start({ ...opts, force: true }),
    /** host: abort without rewards (creatures removed) */
    stop: () => abort(),
    /** debug: skip the prep countdown */
    skipPrep() { if (state?.phase === 'prep') state.t = 0; },
    tryStart,
    riskLines,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      boundNet?.off?.('msg:sgx', onSgx);
      if (sirenH) { try { sirenH.stop(0.1); } catch { /* ignore */ } sirenH = null; }
      for (const id of [...members.keys()]) { const c = game.creatures?.host?.get(id); if (c && !c.dead) game.creatures.kill(c, null, { silent: true }); }
      members.clear();
      api.deployables?.dispose();
      if (game.deployables === api.deployables) game.deployables = null;
      hud.dispose();
      try { mods?.commands?.delete?.('siege'); } catch { /* ignore */ }
      for (const id of pendingTimers) clearTimeout(id);
    },
  });
  api.deployables = installDeployables(game, api);
  game.deployables = api.deployables;
  void DEPS; void insideShip; void FACILITY_Y;
  return api;
}
