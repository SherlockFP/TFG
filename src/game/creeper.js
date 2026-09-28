// SPAMBOMB (wave 2, gameplay2): TFG's own take on the "creeper" - a hissing, silent-walking pop-up-ad creature.
// It walks up to you, stops, inflates for 1.5 s (rising beep + flashing, the client 'primed' telegraph) and pops:
// area damage + knockback, breaks fragile scrap, blasts nearby doors and treasure crates open, sets off other Spambombs.
// Counterplay: kill it first (34 HP), stun it, or shine your flashlight in its face - it hesitates (fuse paused, max ~1.4 s).
// Class Explosive (identify.js). Spawns indoors through EXTRA_SPAWNS and outdoors through a small host timer; never in quota 0.
// Host-authoritative: everything below runs inside CreatureManager.hostUpdate like the built-in behaviours.
import * as THREE from 'three';
import { registerCreature, CREATURES, EXTRA_SPAWNS } from './creatures.js';
import { STATE_SOUNDS, LOOPS } from '../entities/creatures.js';
import { registerCreeperModels } from '../models/creeper.js';
import { addTranslations } from '../core/i18n.js';
import { clamp } from '../core/util.js';

export const SPAMBOMB = 'spambomb';
export const FUSE_S = 1.5;          // seconds of swelling before the pop
export const PRIME_DIST = 2.6;      // m: it stops and inflates this close
export const BLAST_R = 4.4;         // m
export const HESITATE_MAX = 1.4;    // s of flashlight-induced fuse pause per Spambomb
export const MIN_QUOTA = 1;         // never spawns in quota 0

export const DEF = {
  name: 'Spambomb', hp: 34, dmg: 34, walk: 1.9, run: 4.6, power: 1.4, xp: 55, coin: 9, zone: 'in', radius: 0.42, height: 1.1, maxAlive: 3,
  deathText: 'was popped by a Spambomb.',
  lore: 'A pop-up ad that got physical. It hisses, it never footsteps, and it wants your full attention: when it stops next to you it swells for a second and a half... and POPS. '
    + 'Kill it first, stun it, or blind it with your flashlight so it hesitates. Its blast breaks fragile scrap and blows doors and crates open.',
};

/** pure: blast damage before the balance scaling (level 1 = 34) */
export const blastDamage = (level = 1) => Math.round(DEF.dmg + Math.max(0, (level | 0) - 1) * 2.5);
/** pure: may the generic spawners create one in this quota? */
export const quotaAllows = (quotaIndex) => (quotaIndex | 0) >= MIN_QUOTA;
/** pure: outdoor spawn interval in seconds (host timer), softly shortened by the balance spawn multiplier */
export const outdoorInterval = (rand, spawnMul = 1) => (52 + rand * 48) / clamp(spawnMul || 1, 0.5, 2);

addTranslations({
  Spambomb: 'Spambomba', 'was popped by a Spambomb.': 'bir Spambomba tarafından patlatıldı.',
  'A pop-up ad that got physical. It hisses, it never footsteps, and it wants your full attention: when it stops next to you it swells for a second and a half... and POPS. Kill it first, stun it, or blind it with your flashlight so it hesitates. Its blast breaks fragile scrap and blows doors and crates open.':
    'Fiziğe bürünmüş bir pop-up reklam. Tıslar, adım sesi çıkarmaz ve tüm dikkatini ister: yanında durunca bir buçuk saniye şişer... ve PATLAR. Önce öldür, sersemlet ya da el fenerini yüzüne tutup duraksat. Patlaması kırılgan hurdayı kırar, kapıları ve sandıkları açar.',
});

let gateGame = null;   // the running game: lets the generic spawn gate (`def.noSpawn`) read the quota
const V = new THREE.Vector3();
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** true when a player is shining a lit flashlight into the creature's face (hesitation trigger) */
export function litFace(c, M, players) {
  for (const p of players) {
    if (p.dead || !p.flash) continue;
    const d = p.eye.distanceTo(V.set(c.pos.x, c.pos.y + 0.5, c.pos.z));
    if (d > 11 || d < 0.3) continue;
    const dir = V.clone().sub(p.eye).normalize();
    if (dir.dot(p.look) < 0.9) continue;
    if (M.game.physics.lineOfSight(p.eye, V.set(c.pos.x, c.pos.y + 0.5, c.pos.z))) return p;
  }
  return null;
}

export function spambombBehavior(c, dt, M) {
  const g = M.game, d = c.data;
  if (!d.init) { d.init = 1; d.fuse = 0; d.hes = 0; d.lost = 0; d.idleT = 1 + Math.random() * 2; }
  const players = M.playersFor(c).filter((p) => !p.inShip);   // never in the ship
  const st = c.state;

  if (st === 'primed') {
    const tgt = players.find((p) => p.id === c.target) || M.nearest(c, players)?.p;
    const lit = litFace(c, M, players);
    if (lit && d.hes < HESITATE_MAX) { d.hes += dt; }                     // flashlight in its face: the fuse pauses
    else d.fuse += dt;
    if (tgt && d.fuse > 0.25) { c.yaw = Math.atan2(tgt.pos.x - c.pos.x, tgt.pos.z - c.pos.z); if (hd(tgt.pos, c.pos) > 1.2) { c.path = null; M.placeAt(c, c.pos.x + Math.sin(c.yaw) * 0.9 * dt, c.pos.z + Math.cos(c.yaw) * 0.9 * dt); } }
    if (d.fuse >= FUSE_S) explode(c, M);
    return;
  }
  if (st === 'hesitate') {
    d.hes += dt;
    const lit = litFace(c, M, players);
    if ((!lit && c.t > 0.5) || d.hes >= HESITATE_MAX || c.t > 1.1) c.setState(c.target ? 'run' : 'idle');
    return;
  }
  // ---- acquire
  if (st === 'idle' || st === 'walk') {
    for (const p of players) if (M.canSee(c, p, 13, 120)) { c.target = p.id; c.setState('run'); d.lost = 0; return; }
    const n = M.hear(c, 14);
    if (n) { M.goToLazy(c, n.pos.x, n.pos.z); c.setState('walk'); }
    if (c.state === 'idle' && c.t > d.idleT) { M.wander(c, 12); c.setState('walk'); d.idleT = 1.5 + Math.random() * 3; }
    if (c.state === 'walk' && M.follow(c, dt, c.def.walk)) c.setState('idle');
    return;
  }
  // ---- chase
  if (st === 'run') {
    const p = players.find((q) => q.id === c.target);
    if (!p) { c.target = null; c.setState('idle'); return; }
    if (M.canSee(c, p, 22, 360)) d.lost = 0; else d.lost += dt;
    if (d.lost > 5) { c.target = null; c.setState('idle'); return; }
    const dist = p.pos.distanceTo(c.pos);
    if (d.hes < HESITATE_MAX && dist > PRIME_DIST + 0.6 && litFace(c, M, [p])) { c.setState('hesitate'); M.sound(c, ['scuttler_hiss', 'creature_hurt'], 0.8, 3, 1.3); return; }
    if (dist < PRIME_DIST && Math.abs(p.pos.y - c.pos.y) < 2.2 && c.age > 1.2) {
      c.setState('primed'); d.fuse = 0; d.hes = Math.min(d.hes, HESITATE_MAX * 0.5);
      M.sound(c, ['mine_click', 'scuttler_click'], 1, 3, 1.25);
      return;
    }
    M.moveToward(c, p.pos, dt, c.def.run);
  }
}

/** the pop: damage (LOS-checked, falloff), knockback, fragile scrap, doors, crates, chain reaction */
export function explode(c, M) {
  const g = M.game, d = c.data;
  if (d.popped) return;
  d.popped = true;
  const at = c.pos.clone(); at.y += 0.35;
  M.blast(at, BLAST_R, blastDamage(c.level), c.id, SPAMBOMB);          // players (also the explosion fx + noise)
  const out = { broke: 0, doors: 0, crates: 0, chained: 0, kb: 0 };
  // knockback (client applies it on 'g2' {k:'kb'})
  for (const p of g.aiPlayers()) {
    if (p.dead || p.inShip) continue;
    const dx = p.pos.x - at.x, dz = p.pos.z - at.z, dist = Math.hypot(dx, dz);
    if (dist > BLAST_R) continue;
    const k = Math.max(0.05, dist);
    g.net.sendTo(p.id, 'g2', { k: 'kb', d: [+(dx / k).toFixed(2), +(dz / k).toFixed(2)], f: +(3 + 8 * (1 - dist / BLAST_R)).toFixed(1) });
    out.kb++;
  }
  // fragile scrap breaks (value -> 0 removes it with the glass sound)
  for (const it of g.items.all()) {
    if (it.state !== 'world' || !it.def?.fragile || it.holder) continue;
    if (it.obj.position.distanceTo(at) > BLAST_R * 0.9) continue;
    g.hostDamageItem(it.id, Math.max(1, it.value)); out.broke++;
  }
  // doors: locked or shut ordinary doors are blown open (vault doors keep their safe)
  for (const dr of g.world.facility?.doors || []) {
    if (dr.kind === 'vault' || dr.teleport || !dr.pos || dr.pos.distanceTo(at) > BLAST_R * 0.85) continue;
    if (dr.open && !dr.locked) continue;
    dr.locked = false; g.hostSetDoor(dr.id, true); out.doors++;
  }
  // treasure crates (worldx chests)
  try {
    for (const ch of g.worldx?.chests?.() || []) {
      if (ch.opened || Math.hypot(ch.x - at.x, ch.z - at.z) > BLAST_R * 0.9 || Math.abs(ch.y - at.y) > 3) continue;
      g.worldx.openChest(ch.id); out.crates++;
    }
  } catch (e) { console.warn('[spambomb] crates', e); }
  // other creatures: hurt + stunned, other Spambombs are set off (chain reaction)
  for (const o of [...M.host.values()]) {
    if (o === c || o.dead || o.def.hazard || o.def.boss) continue;
    const dist = o.pos.distanceTo(at);
    if (dist > BLAST_R) continue;
    if (o.type === SPAMBOMB) { if (o.state !== 'primed') { o.setState('primed'); o.data.fuse = FUSE_S * 0.55; out.chained++; } continue; }
    if (o.maxHp) M.damage(o.id, blastDamage(c.level) * 0.7 * (1 - dist / BLAST_R), 'explosion', { stun: 1.2 });
  }
  g.hostData && (g.hostData.g2boom = out);
  g.mods?.emit('tfg:spambomb', { pos: at, ...out }, g);
  M.kill(c, null, { silent: true });
  return out;
}

/** register the creature, its model, sounds, spawn weights (idempotent). */
export function registerSpambomb() {
  if (!CREATURES[SPAMBOMB]) {
    registerCreature(SPAMBOMB, { ...DEF }, spambombBehavior);
    // generic spawn gate (host.js / director.js call canSpawnMore -> def.noSpawn): no Spambombs in quota 0
    Object.defineProperty(CREATURES[SPAMBOMB], 'noSpawn', { enumerable: true, configurable: true, get: () => !quotaAllows(gateGame?.run?.quotaIndex) });
  }
  if (!EXTRA_SPAWNS[SPAMBOMB]) EXTRA_SPAWNS[SPAMBOMB] = { zone: 'in', w: [3, 4, 5, 6], interior: { office: 1.3, serverfarm: 1.3, mansion: 0.9, mineshaft: 0.7 } };
  STATE_SOUNDS[SPAMBOMB] = STATE_SOUNDS[SPAMBOMB] || {
    hesitate: [['scuttler_hiss', 'creature_hurt'], 0.7, 1.4], primed: [['mine_click', 'scuttler_click'], 0.9, 1.2],
    dead: [['scuttler_death', 'creature_death'], 0.8, 0.9],
  };
  LOOPS[SPAMBOMB] = LOOPS[SPAMBOMB] || [['walk', 'walkie_static', 0.16, 1.7], ['run', 'walkie_static', 0.24, 1.9], ['primed', 'walkie_static', 0.3, 2.2]];   // the hiss (procedural static, pitched up)
  registerCreeperModels();
}

export function installCreeper(game) {
  gateGame = game;
  registerSpambomb();
  const offs = [];
  let timer = 30 + Math.random() * 40;
  const spawnOutdoor = (force = false) => {
    const w = game.world;
    if (!game.isHost || game.run?.phase !== 'moon' || !w?.terrain || !w.outdoor) return null;
    if (!force && !quotaAllows(game.run.quotaIndex)) return null;
    let alive = 0;
    for (const c of game.creatures.host.values()) if (c.type === SPAMBOMB && !c.dead && c.zone === 'out') alive++;
    if (alive >= 2) return null;
    const outs = game.aiPlayers().filter((p) => !p.dead && p.zone === 'out' && !p.inShip);
    if (!outs.length) return null;
    const pl = outs[Math.floor(Math.random() * outs.length)];
    const lim = (w.terrain.playHalf ?? 130) - 4;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2, r = 36 + Math.random() * 24;
      const x = clamp(pl.pos.x + Math.cos(a) * r, -lim, lim), z = clamp(pl.pos.z + Math.sin(a) * r, -lim, lim);
      if (Math.hypot(x, z) < 30) continue;
      const ent = w.outdoor.mainExit?.pos;
      if (ent && Math.hypot(x - ent.x, z - ent.z) < 18) continue;
      const pos = new THREE.Vector3(x, w.terrain.heightAt(x, z), z);
      return game.creatures.hostSpawn(SPAMBOMB, pos, { zone: 'out', level: game.rollLevel?.() || 1, elite: false });
    }
    return null;
  };
  offs.push(game.mods.on('update', (dt, g) => {
    if (g !== game || !game.isHost || game.run?.phase !== 'moon') return;
    if ((game.run.time || 0) < 10 * 60 || (game.run.time || 0) > 22.5 * 60) return;
    timer -= dt;
    if (timer > 0) return;
    timer = outdoorInterval(Math.random(), game.balance?.scale?.('creature')?.spawn);
    try { spawnOutdoor(); } catch (e) { console.warn('[spambomb] outdoor spawn', e); }
  }));
  return {
    spawnOutdoor, def: DEF, explode: (c) => explode(c, game.creatures),
    /** debug / tests */
    spawn(pos, opts = {}) { return game.creatures.hostSpawn(SPAMBOMB, pos, { level: 1, affix: null, variant: null, ...opts }); },
    dispose() { for (const o of offs) { try { o?.(); } catch { /* ignore */ } } if (gateGame === game) gateGame = null; },
  };
}
