// MIRROR DIMENSION (wave 2, MASTERPLAN §16). Installed with `this.useModule('mirror', installMirror)` (game.js). Design + numbers: docs/wave2/mirror.md.
//
// Files: mirror.js (this: portal, membership, host director, rules, net) - mirror_waves.js / mirror_upgrades.js (pure, node-tested) -
//        mirror_creatures.js (ghost / flame fiend / copy) - mirror_combat.js (local auto-weapons, crystals, level-up) - mirror_i18n.js -
//        render/mirrorfx.js (post look + instanced visuals) - models/mirror.js (portal, creatures, silhouette) - ui/mirror_ui.js.
//
// Net (all prefixed 'mr'): request 'mr' {op: go | hit | chest | crack} (client -> host); 'mrfx' (host -> all, HOST_ONLY; every payload has k = mem |
//   mobs | items | kill | chest | chestopen | fire | burst | crack | respawn | pu | reward | shatter | lost | rescue | clear | sync).
// The host owns membership (who is inside, who is cracked), the wave director, the Reflection Meter, chests and loot flags. Everything a player
// gets inside (upgrades, crystals, level) is local to that player and gone when they leave.
//
// Hooks into shared code, all instance-level wraps that dispose() restores (no shared file besides game.js slots and engine.js [mirror] lines):
//   creatures.playersFor / hear (who a creature can target / hear), game.hostOnCreatureKilled (meter, crystals, XP only to the crew inside),
//   game.hostOnPlayerDied (cracked deaths are not real deaths), game.die (dimension death rules), game.deathText, game.pickup (dimension loot),
//   game.ui.blocksInput (level-up cards), game.input.isDown / consumeMouse (mirrored A/D and mouse X while inside).
import * as THREE from 'three';
import { HOST_ONLY } from '../net/session.js';
import { G } from '../physics/physics.js';
import { RNG, hashString } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { t, tf } from '../core/i18n.js';
import { MOONS } from './moons.js';
import { CREATURES } from './creatures.js';
import { spawnZombot } from './creatures_wave1.js';
import { registerMirrorCreatures, HOOK, isMirrorCreature } from './mirror_creatures.js';
import { MIRROR, timeLeft, overtimeLevel, timerPhase, roundIndex, glitchLevel, fmtClock, creatureLevel, spawnInterval, groupSize, activeCap, pickType, eliteChance, killValue,
  visibleTo, showsAsSilhouette, wiped, dueRespawns, rescued, hasPortal } from './mirror_waves.js';
import { meterState, meterReward, crossed, bumpTier } from './mirror_upgrades.js';
import { createCombat } from './mirror_combat.js';
import { createMirrorUI } from '../ui/mirror_ui.js';
import { installMirrorFx, MirrorVisuals } from '../render/mirrorfx.js';
import { createPortalMirror, MIRROR_CREATURE_MODELS, createSilhouette, disposeMirrorModels } from '../models/mirror.js';
import { createChestModel, setChestOpen, disposeChestModel, CHEST_HEIGHT } from '../models/chest.js';
import { fallbackChestLoot } from './chests.js';
import { rollPowerup } from './powerups.js';
import './mirror_i18n.js';

HOST_ONLY.add('mrfx');   // clients only take 'mrfx' broadcasts from the host

const PASS_DIE = new Set(['left', 'void', 'mirrorshatter', 'mirrorlost']);   // causes that skip the cracked-reflection rules
const CRACK_SECS = [30, 15, 10, 5, 4, 3, 2, 1];

export function installMirror(game) {
  registerMirrorCreatures();
  const mods = game.mods;
  const offs = [], restores = [], timers = new Set();
  let disposed = false;
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, ms); timers.add(id); return id; };
  const S = {
    inside: false, cracked: false, members: new Map(), mobs: new Map(), items: new Set(), itemSeen: new Map(), chests: new Map(), portal: null, portalKey: null, forced: null,
    mapReady: false, meterV: 0, enterT: 0, respawnAt: 0, lastLeft: 999, lastOt: 0, haul: new Set(), fires: [], rings: [], whisperT: 0, sils: new Map(), passDie: false, burnT: 0, uiT: 0,
    hostM: new Map(), hostChests: new Map(), chestN: 0, hostDirty: false, splashT: 0,
  };
  const M = game.creatures;
  const selfId = () => game.selfId;
  const isHost = () => !!game.isHost;
  const isMob = (id) => S.mobs.has(id) || !!M.views.get(id)?.def?.mirror;

  // ---------------------------------------------------------------- helpers
  function wrap(obj, key, make) {
    const orig = obj?.[key];
    if (typeof orig !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, key);
    const w = make(orig);
    obj[key] = w;
    restores.push(() => { if (obj[key] === w) { if (had) obj[key] = orig; else delete obj[key]; } });
  }
  const snd = (names, vol = 0.6, at = null, pitch) => {
    const a = game.audio;
    for (const n of names) {
      if (!a?.has?.(n)) continue;
      try { if (at) a.at(n, at, vol, { refDistance: 6, pitch }); else a.play(n, { volume: vol, bus: 'sfx', pitch }); } catch { /* audio is optional */ }
      return;
    }
  };
  const toast = (text, kind = 'info') => { try { game.ui?.toast?.(text, kind); } catch { /* ui optional */ } };
  const fxAll = (d) => game.net?.broadcast('mrfx', d);
  const fxTo = (id, d) => game.net?.sendTo(id, 'mrfx', { ...d, to: id });
  const netReq = (op, data = {}) => game.net?.request('mr', { op, ...data });

  // ---------------------------------------------------------------- systems
  const mui = createMirrorUI();
  const fx = installMirrorFx(game.engine);
  const vis = new MirrorVisuals(game.scene);
  const combat = createCombat({ game, vis, ui: mui, netReq, snd, toast, isMob });
  const mm = window.__kefalMods?.creatureModels ? window.__kefalMods : mods;
  if (mm?.creatureModels) for (const [id, fn] of Object.entries(MIRROR_CREATURE_MODELS)) if (!mm.creatureModels.has(id)) mm.creatureModels.set(id, (T, o) => fn(o || {}));

  // ================================================================ portal (deterministic on every peer)
  function planPortal() {
    const w = game.world, run = game.run, moon = MOONS[run?.moon];
    if (!w?.terrain || !w.outdoor || w.company || !moon) return null;
    const rng = new RNG(((run.seed ^ 0x51ab1e) >>> 0) ^ hashString('mirror:' + run.moon));
    if (!hasPortal(run.quotaIndex || 0, moon, rng.next())) return null;
    const terr = w.terrain, out = w.outdoor, half = (terr.playHalf ?? 130) - 16;
    for (let i = 0; i < 120; i++) {
      const a = rng.float(0, Math.PI * 2), d = rng.float(40, Math.max(60, half * 0.85));
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (out.avoid?.(x, z, 6)) continue;                                   // path, entrance, fires, ponds, landmarks
      if (terr.distToPath && terr.distToPath(x, z) < 24) continue;          // well away from the ship <-> facility path
      const y = terr.heightAt(x, z);
      if ([[3, 0], [-3, 0], [0, 3], [0, -3]].some(([dx, dz]) => Math.abs(terr.heightAt(x + dx, z + dz) - y) > 0.9)) continue;
      const hit = game.physics.raycast({ x, y: y + 20, z }, { x: 0, y: -1, z: 0 }, 40, G.STATIC);
      if (hit && Math.abs(20 - hit.distance) > 0.8) continue;               // a tree / rock / prop is standing there
      return { x, y, z, yaw: Math.atan2(-x, -z) };
    }
    return null;
  }
  function buildPortal(spec) {
    const model = createPortalMirror();
    model.root.position.set(spec.x, spec.y, spec.z);
    model.root.rotation.y = spec.yaw;
    game.scene.add(model.root);
    const cy = Math.cos(spec.yaw), sy = Math.sin(spec.yaw), cols = [];
    for (const [lx, ly, lz, hx, hy, hz] of model.colliderBoxes) {
      try { cols.push(game.physics.addStaticBox(spec.x + lx * cy + lz * sy, spec.y + ly, spec.z - lx * sy + lz * cy, hx, hy, hz, spec.yaw)); } catch (e) { console.warn('[mirror] collider', e); }
    }
    S.portal = { ...spec, model, cols };
  }
  function disposePortal() {
    const P = S.portal;
    if (!P) return;
    for (const c of P.cols) { try { game.physics.removeCollider(c); } catch { /* gone */ } }
    P.model.dispose();
    S.portal = null;
  }
  function syncPortal() {
    const ph = game.run?.phase, w = game.world;
    const want = ph === 'moon' && S.mapReady && w?.terrain && w.outdoor && !w.company;
    if (!want) { if (S.portal) disposePortal(); S.portalKey = null; return; }
    const key = `${game.run.seed}:${game.run.moon}:${w.moonId}:${S.forced ? 'f' : ''}`;
    if (S.portalKey === key) return;
    S.portalKey = key;
    if (S.portal) disposePortal();
    const spec = S.forced || planPortal();
    if (spec) buildPortal(spec);
  }
  const portalFront = (dist = 2.6) => {
    const P = S.portal;
    if (!P) return game.player.pos.clone();
    const x = P.x + Math.sin(P.yaw) * dist, z = P.z + Math.cos(P.yaw) * dist;
    return new THREE.Vector3(x, game.world.terrain?.heightAt(x, z) ?? P.y, z);
  };
  function animatePortal(dt) {
    const P = S.portal;
    if (!P) return;
    P.model.update(game.time, S.inside ? 1 : Math.min(1, S.members.size));
    const d = Math.hypot(game.player.pos.x - P.x, game.player.pos.z - P.z);
    if (d < 30 && game.time > S.whisperT) {
      S.whisperT = game.time + 5 + Math.random() * 6;
      snd([`whisper_${1 + Math.floor(Math.random() * 3)}`, 'whisper_1'], 0.5, new THREE.Vector3(P.x, P.y + 2, P.z));
    }
    void dt;
  }

  // ================================================================ membership + local enter / exit
  function applyMem(d) {
    const was = S.inside;
    S.members = new Map((d.ids || []).map((id) => [id, (d.dead || []).includes(id)]));
    const now = S.members.has(selfId());
    if (now && !was) enterLocal(); else if (!now && was) exitLocal('exit');
  }
  function enterLocal() {
    S.inside = true; S.cracked = false; S.enterT = game.time; S.lastLeft = 999; S.lastOt = 0; S.haul.clear(); S.fires.length = 0; S.burnT = 0;
    combat.reset();
    mui.show(true);
    fx.set(true, 0);
    game.engine.flash?.(0xd8c8ff, 1.0);
    snd(['glass_break', 'ui_notify'], 0.5, null, 0.7);
    toast(t('YOU STEPPED THROUGH'), 'warn');
    later(() => { if (S.inside) toast(t('The screen is mirrored. So are your controls.'), 'info'); }, 1800);
  }
  function exitLocal(kind, keepUi = false) {
    if (!S.inside) return;
    S.inside = false; S.cracked = false; S.haul.clear(); S.fires.length = 0;
    combat.reset();
    fx.set(false);
    if (!keepUi) mui.show(false);
    game.engine.flash?.(0xd8c8ff, 0.8);
    snd(['glass_break'], 0.35, null, 1.3);
    if (kind === 'exit') toast(t('BACK IN THE REAL WORLD'), 'good');
    else if (kind === 'rescue') toast(t('The mirror pulled you out.'), 'good');
  }
  function reviveAtPortal(hpFrac) {
    const p = game.player;
    p.dead = false; p.hp = Math.max(1, Math.round(game.stats.maxHp * hpFrac)); p.stamina = game.stats.maxStamina; p.latched = null;
    game.engine.fx.blind = 0; game.engine.fx.noise = 0;
    if (S.portal) p.teleport(portalFront(2.8), S.portal.yaw);
    game.net.send('pst', { dead: false, hp: p.hp });
    game.ui.hud?.setDead(false);
    game.spectating = null;
    mui.showCracked(null);
    S.cracked = false;
  }
  function respawnLocal() {
    if (!game.player.dead || !S.inside) return;
    reviveAtPortal(MIRROR.RESPAWN_HP);
    game.engine.flash?.(0xb48cff, 0.8);
    snd(['ui_levelup', 'heal'], 0.6);
    toast(t('CRACKED REFLECTION') + ' - OK', 'good');
  }
  /** local cracked death: sit out one round, drop the dimension loot at the mirror (the host respawns us while a crewmate lives) */
  function crackLocal(cause) {
    const p = game.player;
    p.dead = true; p.hp = 0;
    game.grab?.stop?.(); game.closeMinigame?.(); game.terminal?.close?.();
    const at = portalFront(2.4), ids = [];
    let k = 0;
    for (const id of [...S.haul]) {
      const it = game.items.get(id);
      if (!it || it.holder !== selfId()) continue;
      const a = k++ * 2.399;
      const pos = at.clone().add(new THREE.Vector3(Math.cos(a) * 0.7, 0.8 + (k % 4) * 0.1, Math.sin(a) * 0.7));
      game.net.request('drop', { id, p: pos.toArray(), q: [0, 0, 0, 1], lv: [0, 1, 0] });
      const si = p.slots.indexOf(id); if (si >= 0) p.slots[si] = null;
      ids.push(id);
    }
    S.haul.clear();
    game.inventory?.close?.(); game.refreshHeldVisuals?.();
    game.sfx?.('death', 0.9);
    game.engine.fx.blind = 0; game.engine.flash?.(0x550000, 0.9);
    game.net.send('pst', { dead: true, cause: 'mirrorcrack', pos: p.pos.toArray() });
    netReq('crack', { ids });
    S.cracked = true; S.respawnAt = game.time + MIRROR.RESPAWN_S;
    game.ui.hud?.setDead(true, t('You cracked. Your reflection reforms soon.'), '');
    game.spectateIdx = 0; game.deadT = 0; p.latched = null;
    void cause;
  }
  /** SHATTERED (wipe) / LOST (day ended): a real death; SHATTERED also loses everything collected in the dimension */
  function endLocal(kind) {
    if (!S.inside) return;
    const p = game.player;
    if (kind === 'shatter') {
      for (const id of [...S.haul]) {
        const it = game.items.get(id);
        if (!it || it.holder !== selfId()) continue;
        const si = p.slots.indexOf(id); if (si >= 0) p.slots[si] = null;
        game.net.request('consume', { id });
      }
      game.refreshHeldVisuals?.();
    }
    exitLocal(kind, true);
    mui.root.classList.add('on');
    mui.showSplash(kind === 'shatter' ? t('SHATTERED') : t('LOST IN THE REFLECTION'), t('The mirror keeps what it collected.'));
    game.engine.flash?.(0xffffff, 1);
    snd(['glass_break'], 0.9, null, 0.6);
    later(() => { mui.hideSplash(); mui.show(false); }, 3200);
    S.passDie = true;
    try { p.dead = false; p.hp = 1; game.die(kind === 'shatter' ? 'mirrorshatter' : 'mirrorlost'); } finally { S.passDie = false; }
  }

  // ================================================================ host: membership requests
  const hostList = () => [...S.hostM.values()].map((m) => ({ id: m.id, dead: m.dead, respawnAt: m.respawnAt }));
  const broadcastMem = () => fxAll({ k: 'mem', ids: [...S.hostM.keys()], dead: [...S.hostM.values()].filter((m) => m.dead).map((m) => m.id) });
  function unflagHeldBy(id) {
    const rm = [];
    for (const iid of S.items) { const it = game.items.get(iid); if (it && it.holder === id) rm.push(iid); }
    if (rm.length) { for (const i of rm) S.items.delete(i); fxAll({ k: 'items', rm }); }
  }
  function removeMember(id) { S.hostM.delete(id); unflagHeldBy(id); }
  function hostGo(d, from) {
    const run = game.run;
    if (!run || run.phase !== 'moon' || !S.portal) return;
    const ap = game.aiPlayerById(from);
    if (!ap || ap.dead) return;
    if (d.enter) {
      if (S.hostM.has(from)) return;
      if (Math.hypot(ap.pos.x - S.portal.x, ap.pos.z - S.portal.z) > MIRROR.ENTER_RANGE + 3) return;
      S.hostM.set(from, { id: from, t0: game.time, dead: false, respawnAt: 0, spawnT: 2.5 });
      S.hostDirty = true;
      broadcastMem();
    } else {
      const m = S.hostM.get(from);
      if (!m || m.dead) return;
      const saved = rescued(hostList(), from);
      removeMember(from);
      for (const id of saved) { removeMember(id); fxTo(id, { k: 'rescue' }); }   // the last living member walked out: pull cracked crewmates out alive
      broadcastMem();
    }
  }
  function hostHit(d, from) {
    const m = S.hostM.get(from);
    if (!m || m.dead || !Array.isArray(d.h)) return;
    const ap = game.aiPlayerById(from);
    if (!ap) return;
    const now = game.time;
    if (!m.dw || now - m.dw.t0 >= 1) m.dw = { t0: now, sum: 0 };
    for (const e of d.h.slice(0, 14)) {
      const id = String(e?.[0]), dmg = clamp(Number(e?.[1]) || 0, 0, 60);
      const c = M.host.get(id);
      if (!c || c.dead || !isMirrorCreature(c) || dmg <= 0) continue;
      if (Math.hypot(c.pos.x - ap.pos.x, c.pos.z - ap.pos.z) > 26) continue;
      if (m.dw.sum + dmg > 1800) break;                                    // damage budget per second (anti-cheat)
      m.dw.sum += dmg;
      M.damage(id, dmg, from, {});
    }
  }
  function hostCrack(d, from) {
    const m = S.hostM.get(from);
    if (!m || m.dead) return;
    m.dead = true; m.respawnAt = game.time + MIRROR.RESPAWN_S;
    if (Array.isArray(d.ids)) {
      const rm = d.ids.map(String).filter((id) => S.items.has(id)).slice(0, 40);
      for (const id of rm) S.items.delete(id);                              // dropped at the mirror: normal loot again
      if (rm.length) fxAll({ k: 'items', rm });
    }
    fxAll({ k: 'crack', id: from, in: MIRROR.RESPAWN_S });
    broadcastMem();
  }
  function hostChest(d, from) {
    const m = S.hostM.get(from), c = S.hostChests.get(String(d.id));
    if (!m || m.dead || !c || c.opened) return;
    const ap = game.aiPlayerById(from);
    if (!ap || Math.hypot(ap.pos.x - c.x, ap.pos.z - c.z) > 5 || Math.abs(ap.pos.y - c.y) > 4) return;
    c.opened = true;
    const run = game.run, moon = MOONS[run.moon] || {};
    const rng = new RNG((Math.random() * 4294967296) >>> 0);
    let list = null;
    try { list = game.crafting?.rollChestLoot?.(c.tier, rng); } catch (e) { console.warn('[mirror] rollChestLoot', e); }
    if (!Array.isArray(list) || !list.length) list = fallbackChestLoot(c.tier, rng);
    const valueMul = (moon.scrapMul || 1) * (1 + (run.quotaIndex || 0) * 0.06) * 1.15;
    const ids = [];
    list.forEach((e, i) => {
      const a = (i / Math.max(1, list.length)) * Math.PI * 2 + rng.float(0, 1);
      const tier = bumpTier(e.tier || 'common', () => rng.next(), c.luck);
      const id = game.items.hostSpawn(e.type, new THREE.Vector3(c.x + Math.cos(a) * 0.15, c.y + CHEST_HEIGHT + 0.35 + i * 0.12, c.z + Math.sin(a) * 0.15),
        { tier, valueMul, linvel: [Math.cos(a) * rng.float(1.1, 1.9), rng.float(3.2, 4.6), Math.sin(a) * rng.float(1.1, 1.9)] });
      if (id) { S.items.add(id); ids.push(id); }
    });
    if (ids.length) fxAll({ k: 'items', add: ids });
    fxAll({ k: 'chestopen', id: c.id, by: from });
    game.net.broadcast('xp', { to: from, xp: 50 + (run.quotaIndex || 0) * 6, coin: 8, reason: 'Reflection Chest' });
  }

  // ================================================================ host: director
  const countMobs = () => { let n = 0; for (const c of M.host.values()) if (!c.dead && isMirrorCreature(c)) n++; return n; };
  function spawnPos(ap, ghostish) {
    const w = game.world, terr = w.terrain, fac = w.facility;
    for (let k = 0; k < 8; k++) {
      if (ap.zone === 'in' && fac?.nav && !ghostish) {
        const wk = fac.nav.randomWalkable(Math.random, ap.pos.x, ap.pos.z, 15);
        if (!wk || Math.hypot(wk.x - ap.pos.x, wk.z - ap.pos.z) < 7) continue;
        return new THREE.Vector3(wk.x, fac.layout.y, wk.z);
      }
      const a = Math.random() * Math.PI * 2, r = (ghostish ? 13 : 15) + Math.random() * 11;
      let x = ap.pos.x + Math.cos(a) * r, z = ap.pos.z + Math.sin(a) * r;
      if (ap.zone === 'in') return new THREE.Vector3(x, ap.pos.y, z);       // wraiths phase through the facility walls
      const lim = (terr?.playHalf ?? 130) - 4;
      x = clamp(x, -lim, lim); z = clamp(z, -lim, lim);
      if (Math.hypot(x, z) < 12) continue;                                   // not on top of the ship
      return new THREE.Vector3(x, ghostish ? ap.pos.y : (terr ? terr.heightAt(x, z) : ap.pos.y), z);
    }
    return null;
  }
  function spawnMob(ap, round, ot) {
    let type = pickType(Math.random, round, ot);
    if (type === 'zombot' && !CREATURES.zombot) type = 'mr_ghost';
    const level = creatureLevel(game.run.quotaIndex || 0, round, ot);
    const elite = Math.random() < eliteChance(ot), ghostish = type === 'mr_ghost';
    const pos = spawnPos(ap, ghostish);
    if (!pos) return null;
    let c = null;
    if (type === 'zombot') c = spawnZombot(M, pos, { zone: ap.zone, level, state: 'run', data: { mirror: 1, wave: 90000 } });
    else c = M.hostSpawn(type, pos, { level, elite, zone: ghostish ? 'any' : ap.zone, state: 'run' });
    if (c) { c.data.mirror = 1; S.mobs.set(c.id, game.time); }
    return c;
  }
  function spotNear(ap, rmin, rmax) {
    const fac = game.world.facility, terr = game.world.terrain;
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2, r = rmin + Math.random() * (rmax - rmin);
      const x = ap.pos.x + Math.cos(a) * r, z = ap.pos.z + Math.sin(a) * r;
      if (ap.zone === 'in') { if (fac?.nav?.walkableAt?.(x, z)) return { x, y: fac.layout.y, z }; continue; }
      if (terr && Math.hypot(x, z) > 12) return { x, y: terr.heightAt(x, z), z };
    }
    return { x: ap.pos.x + 2.5, y: ap.pos.y, z: ap.pos.z };
  }
  function giveReward(k) {
    const R = meterReward(k);
    const alive = [...S.hostM.values()].filter((m) => !m.dead);
    if (!alive.length) return;
    const ap = game.aiPlayerById(alive[Math.floor(Math.random() * alive.length)].id);
    if (!ap) return;
    const spot = spotNear(ap, 3.5, 6.5), id = 'mc' + (++S.chestN), yaw = Math.random() * Math.PI * 2;
    S.hostChests.set(id, { id, x: spot.x, y: spot.y, z: spot.z, tier: R.chest, luck: R.luck, opened: false });
    fxAll({ k: 'chest', id, p: [spot.x, spot.y, spot.z], tier: R.chest, yaw });
    if (R.powerup) for (const m of alive) fxTo(m.id, { k: 'pu', id: rollPowerup(Math.random) });
    fxAll({ k: 'reward', n: k + 1, tier: R.chest });
  }
  function burst(c) {
    const pos = c.pos.clone(), r = 3.2, dmg = Math.round(c.dmg * 1.6);
    fxAll({ k: 'burst', p: [pos.x, pos.y, pos.z], r });
    game.later(() => {
      for (const p of game.aiPlayers()) {
        if (p.dead || !S.hostM.has(p.id)) continue;
        const d = p.pos.distanceTo(pos);
        if (d <= r) game.hostHurtPlayer(p.id, Math.round(dmg * (1 - 0.5 * d / r)), 'mr_fiend', c.id, pos);
      }
    }, 500);
  }
  function onMobKilled(c) {
    const val = killValue(c.type, !!c.elite), before = S.meterV;
    S.meterV += val;
    fxAll({ k: 'kill', p: [+c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2)], x: val, g: c.elite ? 1 : 0, m: S.meterV });
    for (const k of crossed(before, S.meterV)) giveReward(k);
    if (c.type === 'mr_fiend') burst(c);
  }
  function resetDimension() {
    S.hostDirty = false; S.meterV = 0;
    for (const c of [...M.host.values()]) if (isMirrorCreature(c) && !c.dead) M.kill(c, null, { silent: true });
    for (const id of S.items) game.net.broadcast('it', { e: 'rm', id });   // dimension loot lying around is lost with the dimension
    S.items.clear(); S.hostChests.clear();
    fxAll({ k: 'clear' });
  }
  function endAll(kind) {
    const ids = [...S.hostM.keys()];
    fxAll({ k: kind, ids });
    S.hostM.clear();
    broadcastMem();
    resetDimension();
  }
  function hostTick(dt) {
    const run = game.run;
    if (!run) return;
    if (!S.hostM.size) { if (S.hostDirty) resetDimension(); return; }
    if (run.phase !== 'moon') { endAll('lost'); return; }               // day over: everybody still inside is lost in the reflection
    const now = game.time, list = hostList();
    if (wiped(list)) { endAll('shatter'); return; }                      // everyone inside dead at once: SHATTERED
    for (const id of dueRespawns(list, now)) { const m = S.hostM.get(id); if (m) { m.dead = false; fxAll({ k: 'respawn', id }); broadcastMem(); } }
    const alive = [...S.hostM.values()].filter((m) => !m.dead);
    let spawnMul = 1;
    try { spawnMul = game.balance?.scale?.('creature')?.spawn ?? 1; } catch { /* balance optional */ }
    for (const m of alive) {
      m.spawnT -= dt;
      if (m.spawnT > 0) continue;
      const tIn = now - m.t0, round = roundIndex(tIn), ot = overtimeLevel(tIn);
      m.spawnT = spawnInterval(round, ot) * (0.85 + Math.random() * 0.3);
      const live = countMobs(), cap = activeCap(round, ot, alive.length);
      const ap = game.aiPlayerById(m.id);
      if (live >= cap || !ap || ap.dead) continue;
      const n = Math.min(cap - live, groupSize(round, ot, spawnMul)), added = [];
      for (let i = 0; i < n; i++) { const c = spawnMob(ap, round, ot); if (c) added.push(c.id); }
      if (added.length) fxAll({ k: 'mobs', add: added });
    }
  }
  HOOK.targets = (c) => M.playersFor(c).filter((p) => !p.inShip);
  HOOK.fire = (pos) => fxAll({ k: 'fire', p: [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)] });

  // ================================================================ client: fx messages
  function addChest(d) {
    if (S.chests.has(d.id)) return;
    const model = createChestModel(d.tier || 'iron', { beamHeight: 14 });
    model.root.position.set(d.p[0], d.p[1], d.p[2]);
    model.root.rotation.y = d.yaw || 0;
    model.root.visible = S.inside;
    game.scene.add(model.root);
    S.chests.set(d.id, { id: d.id, pos: new THREE.Vector3(d.p[0], d.p[1], d.p[2]), tier: d.tier, model, opened: false, t: 0 });
  }
  function clearChests() { for (const c of S.chests.values()) { c.model.root.removeFromParent(); disposeChestModel(c.model); } S.chests.clear(); }
  function onFx(d) {
    switch (d.k) {
      case 'mem': applyMem(d); break;
      case 'mobs': for (const id of d.add || []) S.mobs.set(id, game.time); break;
      case 'items': for (const id of d.add || []) S.items.add(id); for (const id of d.rm || []) { S.items.delete(id); const it = game.items.get(id); if (it?.obj) it.obj.visible = true; } break;
      case 'kill': {
        S.meterV = d.m || S.meterV;
        if (S.inside) { combat.addCrystal(new THREE.Vector3().fromArray(d.p), d.x, d.g); snd(['spark'], 0.15, new THREE.Vector3().fromArray(d.p), 1.6); }
        break;
      }
      case 'chest': addChest(d); break;
      case 'chestopen': { const c = S.chests.get(d.id); if (c && !c.opened) { c.opened = true; c.anim = true; c.t = 0; snd(['door_creak', 'ui_notify'], 0.6, c.pos); } break; }
      case 'fire': if (S.inside) { if (S.fires.length >= 56) S.fires.shift(); S.fires.push({ x: d.p[0], y: d.p[1], z: d.p[2], life: 4.5, max: 4.5 }); } break;
      case 'burst': if (S.inside) { S.rings.push({ x: d.p[0], y: d.p[1], z: d.p[2], r: d.r || 3, life: 0.6, max: 0.6, color: 0xff7a1a }); game.particles?.burst?.(new THREE.Vector3().fromArray(d.p).add(new THREE.Vector3(0, 0.6, 0)), 'sparks', null, 1.4); snd(['explosion', 'hit_metal'], 0.4, new THREE.Vector3().fromArray(d.p), 1.3); } break;
      case 'crack': if (d.id === selfId()) { S.respawnAt = game.time + (d.in || MIRROR.RESPAWN_S); S.cracked = true; } else if (S.inside) toast(`${game.playerName(d.id)}: ${t('CRACKED REFLECTION')}`, 'warn'); break;
      case 'respawn': if (d.id === selfId()) respawnLocal(); break;
      case 'pu': if (S.inside && game.anomaly?.grant) { try { game.anomaly.grant(d.id); } catch (e) { console.warn('[mirror] power-up', e); } } break;
      case 'reward': if (S.inside) { toast(t('REFLECTION REWARD: chest + power-up'), 'good'); snd(['ui_levelup'], 0.6); game.engine.flash?.(0xffe36a, 0.3); } break;
      case 'shatter': case 'lost': if ((d.ids || []).includes(selfId())) endLocal(d.k); break;
      case 'rescue': if (S.inside) { if (game.player.dead) reviveAtPortal(0.6); exitLocal('rescue'); } break;
      case 'clear': clearChests(); S.fires.length = 0; S.items.clear(); S.mobs.clear(); S.meterV = 0; vis.clear(); break;
      case 'sync': {
        for (const id of d.mobs || []) S.mobs.set(id, game.time);
        for (const id of d.items || []) S.items.add(id);
        for (const c of d.chests || []) addChest(c);
        S.meterV = d.v || 0;
        applyMem(d);
        break;
      }
      default: break;
    }
  }

  // ================================================================ client: per-frame visibility (creatures, items, crewmates)
  function patchViews() {
    for (const v of M.views.values()) {
      if (v._mr) continue;
      v._mr = 1;
      const base = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(v), 'hidden')?.get;
      const mob = () => isMob(v.id);
      Object.defineProperty(v, 'hidden', { configurable: true, get() { return !visibleTo(mob(), S.inside) || (base ? base.call(v) : false); } });
      const aud = v.audible.bind(v);
      v.audible = () => visibleTo(mob(), S.inside) && aud();
      if (!visibleTo(mob(), S.inside)) for (const h of v.loops.values()) h.stop(0.1);
    }
    for (const v of M.views.values()) {
      const show = visibleTo(isMob(v.id), S.inside);
      if (!show && v.root.parent) v.root.removeFromParent();
      else if (show && !v.root.parent) M.scene.add(v.root);
    }
    if (S.mobs.size > 200) for (const [id, t0] of S.mobs) if (!M.views.has(id) && game.time - t0 > 8) S.mobs.delete(id);
  }
  function updateItems() {
    for (const id of S.items) {
      const it = game.items.get(id);
      if (!it) { const t0 = S.itemSeen.get(id) ?? game.time; S.itemSeen.set(id, t0); if (game.time - t0 > 6) { S.items.delete(id); S.itemSeen.delete(id); } continue; }
      if (it.holder) { if (it.holder === selfId() && S.inside) S.haul.add(id); continue; }
      if (it.obj) it.obj.visible = S.inside;
    }
  }
  function updateRemotes() {
    for (const r of game.remotes.values()) {
      const inMir = S.members.has(r.id), sil = showsAsSilhouette(S.inside, inMir) && !r.dead;
      let s = S.sils.get(r.id);
      if (sil) {
        if (!s) { s = createSilhouette(); game.scene.add(s); S.sils.set(r.id, s); }
        s.visible = true; s.position.copy(r.pos); s.rotation.y = r.yaw + Math.PI;
        r.root.visible = false; r._mrHid = true;
      } else {
        if (s) s.visible = false;
        if (r._mrHid) { r.root.visible = !r.dead; r._mrHid = false; }
      }
    }
    for (const [id, s] of S.sils) if (!game.remotes.has(id)) { s.removeFromParent(); S.sils.delete(id); }
  }

  // ================================================================ client: inside tick
  function insideTick(dt) {
    const p = game.player, now = game.time;
    const tIn = now - S.enterT, left = timeLeft(tIn), ot = overtimeLevel(tIn), ph = timerPhase(tIn);
    mui.setTimer(fmtClock(left), ph, ot);
    fx.set(true, glitchLevel(tIn));
    mui.setCrack(ph === 'warn' ? (1 - left / MIRROR.WARN_S) * 0.85 : ph === 'overtime' ? 0.9 : 0);
    for (const s of CRACK_SECS) if (left <= s && S.lastLeft > s) { snd(['glass_break'], 0.25 + (30 - s) * 0.02, null, 0.8 + (30 - s) * 0.02); if (s === 30) toast(t('The mirror is cracking...'), 'warn'); }
    if (ot > S.lastOt) { S.lastOt = ot; snd(['ship_alarm', 'glass_break'], 0.5, null, 0.9); game.engine.shake?.(0.4); if (ot === 1) toast(t('OVERTIME! The waves escalate every 20 s.'), 'bad'); }
    S.lastLeft = left;
    if (p.dead) { mui.showCracked(S.cracked ? Math.max(0, S.respawnAt - now) : null); vis.setAura(0, 0, 0, 0); }
    else { mui.showCracked(null); combat.update(dt, game.input); }
    // burning trails
    for (let i = S.fires.length - 1; i >= 0; i--) { S.fires[i].life -= dt; if (S.fires[i].life <= 0) S.fires.splice(i, 1); }
    S.burnT -= dt;
    if (S.burnT <= 0 && !p.dead) {
      for (const f of S.fires) {
        if (Math.hypot(p.pos.x - f.x, p.pos.z - f.z) < 0.95 && Math.abs(p.pos.y - f.y) < 1.4) { S.burnT = 0.5; game.onHurt({ dmg: 5 + Math.min(6, game.run?.quotaIndex || 0), cause: 'mr_fiend', p: null }); break; }
      }
    }
    vis.drawFire(S.fires.map((f) => ({ x: f.x, y: f.y, z: f.z, f: f.life / f.max })), now);
    for (let i = S.rings.length - 1; i >= 0; i--) { S.rings[i].life -= dt; if (S.rings[i].life <= 0) S.rings.splice(i, 1); }
    vis.drawRings(S.rings.map((r) => ({ x: r.x, y: r.y, z: r.z, r: r.r, f: r.life / r.max, color: r.color })));
    S.uiT -= dt;
    if (S.uiT <= 0) { S.uiT = 0.2; const ms = meterState(S.meterV); mui.setMeter({ v: S.meterV, ...ms }, combat.level, Math.floor(combat.xp), combat.xpNeed()); }
  }
  function animateChests(dt) {
    for (const c of S.chests.values()) {
      c.model.root.visible = S.inside;
      if (c.anim) { c.t = Math.min(1, c.t + dt * 1.6); setChestOpen(c.model, c.t); if (c.t >= 1) c.anim = false; }
      if (c.model.beam) c.model.beam.visible = S.inside && !c.opened;
    }
  }
  function update(dt) {
    if (disposed) return;
    syncPortal();
    animatePortal(dt);
    patchViews();
    updateItems();
    updateRemotes();
    animateChests(dt);
    if (S.inside) insideTick(dt);
    else { vis.setAura(0, 0, 0, 0); if (S.fires.length) { S.fires.length = 0; } }
    if (isHost()) hostTick(dt);
  }

  // ================================================================ hooks into the shared game
  wrap(M, 'playersFor', (orig) => function (c) {
    const l = orig.call(this, c);
    const mir = isMirrorCreature(c);
    if (!S.hostM.size && !mir) return l;
    return l.filter((p) => S.hostM.has(p.id) === mir);                    // dimension creatures target only players inside; normal ones only players outside
  });
  wrap(M, 'hear', (orig) => function (c, radius) {
    if (!S.hostM.size) return orig.call(this, c, radius);
    const saved = this.noises, mir = isMirrorCreature(c);
    this.noises = saved.filter((n) => !n.owner || S.hostM.has(n.owner) === mir);
    try { return orig.call(this, c, radius); } finally { this.noises = saved; }
  });
  wrap(game, 'hostOnCreatureKilled', (orig) => function (c, by) {
    if (!isMirrorCreature(c)) return orig.call(this, c, by);
    const had = Object.prototype.hasOwnProperty.call(this, 'aiPlayers'), saved = this.aiPlayers;
    this.aiPlayers = () => saved.call(this).filter((p) => S.hostM.has(p.id));   // XP / coins only for the crew inside
    try { orig.call(this, c, by); } finally { if (had) this.aiPlayers = saved; else delete this.aiPlayers; }
    try { onMobKilled(c); } catch (e) { console.warn('[mirror] kill', e); }
  });
  wrap(game, 'hostOnPlayerDied', (orig) => function (id, d) { if (d?.cause === 'mirrorcrack') return undefined; return orig.call(this, id, d); });
  wrap(game, 'die', (orig) => function (cause) {
    if (S.inside && !S.passDie && !this.player.dead && !PASS_DIE.has(cause)) { crackLocal(cause); return undefined; }
    return orig.call(this, cause);
  });
  wrap(game, 'deathText', (orig) => function (cause) {
    if (cause === 'mirrorshatter') return t('was shattered in the mirror.');
    if (cause === 'mirrorlost') return t('was lost in the reflection.');
    if (cause === 'mirrorcrack') return t('cracked in the mirror.');
    return orig.call(this, cause);
  });
  wrap(game, 'pickup', (orig) => function (it) {
    if (it && S.items.has(it.id) && !S.inside && !it.holder) return undefined;   // dimension loot cannot be touched from outside
    return orig.call(this, it);
  });
  wrap(game.ui, 'blocksInput', (orig) => function () { return mui.cardsOpen || orig.call(this); });
  wrap(game.input, 'isDown', (orig) => function (action) {
    if (S.inside && !fx.broken && (action === 'left' || action === 'right')) action = action === 'left' ? 'right' : 'left';   // mirrored A / D
    return orig.call(this, action);
  });
  wrap(game.input, 'consumeMouse', (orig) => function () {
    const r = orig.call(this);
    if (S.inside && !fx.broken) r.dx = -r.dx;                              // mirrored mouse X
    return r;
  });

  offs.push(mods.on('stats', (s, g) => { if (g === game && S.inside) combat.stats(s); }));
  offs.push(mods.on('localHurt', (d, g) => { if (g === game && S.inside && d) combat.hurt(d); }));
  offs.push(mods.on('update', (dt, g) => { if (g === game) update(dt); }));
  offs.push(mods.on('mapLoaded', (w, g) => { if (g === game) { S.mapReady = true; S.portalKey = null; } }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g !== game) return;
    if (ph !== 'moon' && ph !== 'landing') {
      S.mapReady = false;
      if (ph === 'takeoff') { clearChests(); S.fires.length = 0; return; }   // the host's 'lost' message follows: whoever is still inside dies in the reflection
      if (S.inside) { exitLocal('exit'); }
      clearChests(); S.fires.length = 0; S.items.clear(); S.mobs.clear(); S.meterV = 0; S.members.clear(); vis.clear();
      if (ph === 'orbit') { S.hostM.clear(); S.hostChests.clear(); S.hostDirty = false; }
    }
  }));
  offs.push(mods.on('interactables', (out, g) => {
    if (g !== game) return;
    const p = game.player;
    if (!p || p.dead || p.inShip) return;
    const P = S.portal;
    if (P && game.run?.phase === 'moon') {
      out.push({ pos: new THREE.Vector3(P.x + Math.sin(P.yaw) * 0.4, P.y + 2.0, P.z + Math.cos(P.yaw) * 0.4), r: 1.8, reach: 3.8, noLos: true,
        label: S.inside ? t('Step back through the mirror [E]') : t('Step into the mirror [E]'), sub: S.inside ? '' : t('DANGER: endless waves. 3:00 to get out.'),
        action: () => netReq('go', { enter: !S.inside }) });
    }
    if (S.inside) for (const c of S.chests.values()) if (!c.opened) out.push({ pos: c.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), r: 1.0, reach: 3, label: t('Open reflection chest [E]'), sub: c.tier, action: () => netReq('chest', { id: c.id }) });
  }));
  offs.push(mods.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    H('mr', (d, from) => {
      if (!d || typeof d !== 'object') return;
      if (d.op === 'go') hostGo(d, from);
      else if (d.op === 'hit') hostHit(d, from);
      else if (d.op === 'chest') hostChest(d, from);
      else if (d.op === 'crack') hostCrack(d, from);
    });
  }));
  offs.push(mods.on('netReady', (net, g) => {
    if (g !== game) return;
    net.on_('mrfx', (d) => { if (!d || typeof d !== 'object') return; if (d.to && d.to !== selfId()) return; try { onFx(d); } catch (e) { console.warn('[mirror] fx', d.k, e); } });
    offs.push(net.on('peerLeave', (id) => { if (isHost() && S.hostM.has(id)) { removeMember(id); broadcastMem(); } }));
  }));
  offs.push(mods.on('playerJoin', (id, info, g) => {
    if (g !== game || !isHost() || !S.hostM.size) return;
    game.net.sendTo(id, 'mrfx', { k: 'sync', ids: [...S.hostM.keys()], dead: [...S.hostM.values()].filter((m) => m.dead).map((m) => m.id), mobs: [...S.mobs.keys()], items: [...S.items], v: S.meterV,
      chests: [...S.hostChests.values()].filter((c) => !c.opened).map((c) => ({ id: c.id, p: [c.x, c.y, c.z], tier: c.tier, yaw: 0 })) });
  }));
  offs.push(mods.on('sessionEnd', (g) => { if (g === game) api.dispose(); }));

  // ================================================================ public API (debug + tests)
  const api = {
    S, ui: mui, fx, vis, combat,
    get inside() { return S.inside; }, get portal() { return S.portal; }, get members() { return [...S.members.keys()]; },
    /** tests / debug: put the portal at a spot on every peer (host only sees its own copy) */
    forcePortal(x, z, yaw) {
      const terr = game.world?.terrain;
      S.mapReady = true; S.forced = { x, y: terr ? terr.heightAt(x, z) : 0, z, yaw: yaw ?? Math.atan2(-x, -z) };
      S.portalKey = null; syncPortal();
      return S.portal;
    },
    enter() { netReq('go', { enter: true }); },
    exit() { netReq('go', { enter: false }); },
    hostMobs() { return [...M.host.values()].filter((c) => !c.dead && isMirrorCreature(c)).map((c) => c.type); },
    debug() {
      return { inside: S.inside, cracked: S.cracked, members: [...S.members.entries()], hostM: [...S.hostM.values()].map((m) => ({ id: m.id, dead: m.dead, t: +(game.time - m.t0).toFixed(1) })),
        mobs: countMobs(), views: [...M.views.values()].filter((v) => isMob(v.id)).length, items: S.items.size, chests: S.chests.size, meter: S.meterV, level: combat.level, xp: combat.xp,
        owned: { ...combat.owned }, crystals: combat.C.crystals.length, bolts: combat.C.bolts.length, fires: S.fires.length, uMir: game.engine.postMat.uniforms.uMir.value.toArray(), portal: !!S.portal, choosing: combat.choosing };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const r of game.remotes?.values?.() || []) if (r._mrHid) { r.root.visible = !r.dead; r._mrHid = false; }
      for (const s of S.sils.values()) s.removeFromParent();
      for (const v of M.views.values()) { if (!v.root.parent) M.scene.add(v.root); }
      HOOK.targets = () => []; HOOK.fire = () => {};
      disposePortal(); clearChests();
      combat.dispose(); vis.dispose(); fx.dispose(); mui.dispose();
      disposeMirrorModels();
    },
  };
  return api;
}
