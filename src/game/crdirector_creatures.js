// CREATURE DIRECTOR - three new creatures that change how you PLAY, not how many you fight (host AI, node-testable with a fake manager:
// tools/harness/crdirector.test.mjs). They reuse existing models and are spawned by the director (noSpawn: the vanilla tables never pick them).
//   cd_dimmer   THE DIMMER    hunts LIGHT. A lit glowstick beats a flashlight: throw one away from you, switch your torch off, walk away.
//                             It eats a flashlight (forced off ~6 s) or a stick (goes dark). Killable (90 HP), harmless to people in the dark.
//   cd_follower THE FOLLOWER  only moves while somebody WATCHES it (the inverse of the NPC). Look away and it freezes; a camera flash freezes it.
//                             The Algorithm's cameras watch too (feedcams.sees): in a camera cone it keeps coming until the camera is dead.
//                             It strikes anything that stays within arm's length, whichever way you face.
//   spider      (tuning only, no new type) Bunker-Spider rules: webs across corridors / doorways near the lair, a torn web hisses and wakes it, it
//               drops in behind you after a ceiling-dust tell, and retreats to its lair when hurt. Web glint = client tell in crdirector.js.
//   cd_auditor  THE AUDITOR   hunts whoever carries the most scrap, at a relentless walk (never sprints). Its hit makes you drop your best item.
//                             Drop the loot, hand it to a crewmate, or reach the ship (it never enters).
// All numbers obey balance_rules.js: hits 12-22 (cap 45 before quota 2), attacks go through M.attack (0.4 s wind-up gate), no grabs, no one-shots.
import * as THREE from 'three';
import { angleDiff, clamp } from '../core/util.js';

export const DIM = { senseR: 24, feedR: 1.5, stickR: 1.2, feedT: 5, darkMs: 6000, nibbleCd: 1.6, cd: 10, flee: 4, stickPref: 1.6 };
export const FOL = { seeR: 38, cone: 0.72, reach: 1.5, cd: 1.7, ramp: 6, walk: 1.2, run: 4.2 };
export const AUD = { senseR: 42, minLoot: 30, reach: 1.5, cd: 2.4, walk: 2.0, seize: 0.55, auditT: 6 };

export const DEFS = Object.freeze({
  cd_dimmer: {
    name: 'The Dimmer', model: 'yoinker', modelScale: 0.85, hp: 90, dmg: 12, walk: 2.4, run: 5.2, power: 2, xp: 150, coin: 26, zone: 'in', radius: 0.4, height: 1.0,
    maxAlive: 1, noSpawn: true, deathText: 'was left in the dark by The Dimmer.',
    lore: 'It eats light. It hunts flashlights and glowsticks, and prefers the glowstick. Throw one far away, kill your torch and walk off. In the dark it ignores you.',
  },
  cd_follower: {
    name: 'The Follower', model: 'stalker', hp: 130, dmg: 22, walk: 1.2, run: 4.2, power: 2.5, xp: 220, coin: 40, zone: 'in', radius: 0.35, height: 1.75,
    maxAlive: 1, noSpawn: true, deathText: 'stared at The Follower for too long.',
    lore: 'It only moves while somebody is looking at it. Look away and it freezes. A camera flash freezes it too. Do not stare, and do not stay within arm\'s reach.',
  },
  cd_auditor: {
    name: 'The Auditor', model: 'support', modelScale: 1.15, hp: 200, dmg: 20, walk: 2.0, run: 4.0, power: 2.5, xp: 240, coin: 44, zone: 'in', radius: 0.4, height: 1.9,
    maxAlive: 1, noSpawn: true, deathText: 'failed an audit by The Auditor.',
    lore: 'It smells value and follows whoever carries the most scrap at a steady walk. Its hit makes you drop your best item. Drop the loot, hand it off, or get to the ship.',
  },
});
export const NEW_TYPES = Object.freeze(Object.keys(DEFS));

/** sounds for the states the CreatureView plays automatically (game/sfx.js cvoice may take them over) */
export const STATES_SND = {
  cd_dimmer: { run: [['lights_buzz', 'spark'], 0.7, 0.7], feed: [['spark', 'lights_buzz'], 0.6, 0.6], attack: [['spark'], 0.7, 0.8], dead: [['power_down', 'creature_death'], 0.9] },
  cd_follower: { chase: [['mannequin_step', 'walkie_static'], 0.7, 0.7], attack: [['hit_flesh', 'lurker_snap'], 0.8], dead: [['creature_death'], 0.8] },
  cd_auditor: { run: [['coins', 'bell_ding'], 0.35, 0.7], attack: [['impact_punch', 'hit_flesh'], 0.9], audit: [['bell_ding', 'coins'], 0.7, 0.8], dead: [['creature_death'], 0.8] },
};
export const LOOPS_SND = {
  cd_dimmer: [['*', 'lights_buzz', 0.28, 0.55]],
  cd_follower: [['chase', 'walkie_static', 0.5, 0.5]],
};

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const face = (c, to) => { c.yaw = Math.atan2(to.x - c.pos.x, to.z - c.pos.z); };
const turn = (c, to, dt, rate = 6) => { c.yaw += clamp(angleDiff(c.yaw, Math.atan2(to.x - c.pos.x, to.z - c.pos.z)), -rate * dt, rate * dt); };

// ------------------------------------------------------------------------------------------------ THE DIMMER
/** nearest light the Dimmer wants: a lit glowstick lying in the world (preferred) or a player with the flashlight on. */
export function findLight(c, players, items, cfg = DIM) {
  let best = null;
  for (const it of items || []) {
    if (it.type !== 'glowstick' || !it.on || it.holder || it.state !== 'world') continue;
    const pos = it.obj?.position; if (!pos || Math.abs(pos.y - c.pos.y) > 3.5) continue;
    const d = flat(pos, c.pos);
    if (d < cfg.senseR * cfg.stickPref && (!best || d < best.d)) best = { kind: 'stick', item: it, pos, d };
  }
  if (best) return best;
  for (const p of players) {
    if (!p.flash || p.dead || p.inShip || Math.abs(p.pos.y - c.pos.y) > 3.5) continue;
    const d = flat(p.pos, c.pos);
    if (d < cfg.senseR && (!best || d < best.d)) best = { kind: 'player', p, pos: p.pos, d };
  }
  return best;
}
export function dimmerBehavior(cfgIn = {}) {
  const cfg = { ...DIM, ...cfgIn };
  return (c, dt, M) => {
    const d = c.data, g = M.game;
    const players = M.playersFor(c).filter((p) => !p.inShip);
    if (!d.init) { d.init = 1; d.eat = 0; d.cool = 0; d.nib = 0; c.setState('idle'); }
    d.cool = Math.max(0, d.cool - dt);
    if (c.state === 'flee') {
      if (c.t > cfg.flee) { c.setState('idle'); return; }
      if (!c.path || c.pathIdx >= c.path.length) M.wander(c, 16);
      M.follow(c, dt, c.def.run * 0.8);
      return;
    }
    if (c.state === 'feed') {
      const tgt = d.tgt;
      d.eat -= dt;
      if (tgt?.kind === 'player') {
        const p = players.find((q) => q.id === tgt.id);
        if (p) {
          turn(c, p.pos, dt);
          d.nib -= dt;
          if (d.nib <= 0 && flat(p.pos, c.pos) < cfg.feedR + 0.6 && c.age > 1) { d.nib = cfg.nibbleCd; M.attack(c, p, c.dmg, 'dimmer'); }   // a nibble, not a bite: only if you stand there in the dark
        }
      }
      if (d.eat <= 0) {
        if (tgt?.kind === 'stick') { const it = g.items?.get?.(tgt.id); if (it?.on) { try { g.setItemOn(it, false); } catch { /* item gone */ } } }
        d.tgt = null; d.cool = cfg.cd; c.setState('flee');
      }
      return;
    }
    const want = d.cool <= 0 ? findLight(c, players, g.items?.all?.(), cfg) : null;
    if (!want) {
      if (c.state === 'run') c.setState('idle');
      if (c.state === 'idle' && c.t > 2 + Math.random() * 3) { M.wander(c, 14); c.setState('walk'); }
      if (c.state === 'walk' && M.follow(c, dt, c.def.walk)) c.setState('idle');
      return;
    }
    const reach = want.kind === 'stick' ? cfg.stickR : cfg.feedR;
    if (want.d <= reach) {
      c.setState('feed'); d.eat = cfg.feedT;
      d.tgt = want.kind === 'stick' ? { kind: 'stick', id: want.item.id } : { kind: 'player', id: want.p.id };
      d.nib = 1.2;
      if (want.kind === 'player') { try { g.net.broadcast('cd', { k: 'dim', to: want.p.id, ms: cfg.darkMs }); } catch { /* net closing */ } }
      return;
    }
    c.setState('run');
    c.target = want.kind === 'player' ? want.p.id : null;
    M.moveToward(c, want.pos, dt, c.def.run, 7);
  };
}

// ------------------------------------------------------------------------------------------------ THE FOLLOWER
export function followerBehavior(cfgIn = {}) {
  const cfg = { ...FOL, ...cfgIn };
  return (c, dt, M) => {
    const d = c.data;
    const players = M.playersFor(c).filter((p) => !p.inShip);
    if (!d.init) { d.init = 1; d.creep = 0; c.setState('lurk'); }
    if (c.state === 'attack') { if (c.t > 0.7) c.setState('lurk'); return; }
    const near = M.nearest(c, players, 70);
    if (!near) { d.creep = 0; c.setState('lurk'); return; }
    const p = near.p;
    // anything within arm's length gets struck, watched or not (turning your back up close is the mistake)
    if (near.d < cfg.reach && Math.abs(p.pos.y - c.pos.y) < 2.2 && c.cooldown <= 0) {
      face(c, p.pos); c.setState('attack'); c.cooldown = cfg.cd; c.target = p.id;
      M.attack(c, p, c.dmg, c.type);
      return;
    }
    let watched = false;
    for (const q of players) if (M.isLookedAt(c, q, cfg.seeR, cfg.cone)) { watched = true; break; }
    if (!watched && M.game?.feedcams?.sees?.(c.pos)) watched = true;   // feedcams: a working camera counts as a watcher (kill the camera to freeze it)
    if (watched) {
      d.creep = Math.min(1, d.creep + dt / cfg.ramp);
      c.target = p.id; c.setState('chase');
      M.moveToward(c, p.pos, dt, cfg.walk + (cfg.run - cfg.walk) * d.creep, 6);
    } else {
      d.creep = Math.max(0, d.creep - dt * 0.5);
      c.setState('lurk'); c.target = null;
      turn(c, p.pos, dt, 2.5);   // frozen, only the head follows you
    }
  };
}

// ------------------------------------------------------------------------------------------------ THE AUDITOR
export const defaultIsLoot = (it) => !!it && it.value > 0 && !!it.def && it.def.kind !== 'tool' && it.def.kind !== 'weapon' && it.type !== 'body';
/** carried scrap value per player id (held items and bag contents both count) */
export function carriedValue(items, isLoot = defaultIsLoot) {
  const out = new Map();
  for (const it of items || []) {
    if (!it.holder || !isLoot(it)) continue;
    out.set(it.holder, (out.get(it.holder) || 0) + (it.value || 0));
  }
  return out;
}
export function auditorBehavior(cfgIn = {}) {
  const cfg = { ...AUD, ...cfgIn };
  return (c, dt, M) => {
    const d = c.data, g = M.game;
    const players = M.playersFor(c).filter((p) => !p.inShip);
    if (!d.init) { d.init = 1; d.seize = 0; c.setState('idle'); }
    if (c.state === 'attack') {
      if (d.seize > 0) {
        d.seize -= dt;
        if (d.seize <= 0) {   // the hit only lands if the target did not step away during the 0.4 s wind-up (same rule as balance_rules)
          d.seize = 0;
          const v = players.find((q) => q.id === d.seizeId);
          if (v && flat(v.pos, c.pos) <= cfg.reach + 1.3) { try { g.net.broadcast('cd', { k: 'seize', to: d.seizeId }); } catch { /* net closing */ } }
        }
      }
      if (c.t > 0.9) { c.setState('audit'); d.auditT = cfg.auditT; }
      return;
    }
    if (c.state === 'audit') {   // stands over what it made you drop, ignoring everybody, then goes back to the hunt
      d.auditT -= dt;
      if (d.auditT <= 0) c.setState('idle');
      return;
    }
    const carried = carriedValue(g.items?.all?.());
    let best = null;
    for (const p of players) {
      const v = carried.get(p.id) || 0;
      if (v < cfg.minLoot || flat(p.pos, c.pos) > cfg.senseR) continue;
      if (!best || v > best.v) best = { p, v };
    }
    if (!best) {
      c.target = null;
      if (c.state === 'run') c.setState('idle');
      if (c.state === 'idle' && c.t > 3 + Math.random() * 4) { M.wander(c, 16); c.setState('walk'); }
      if (c.state === 'walk' && M.follow(c, dt, c.def.walk)) c.setState('idle');
      return;
    }
    const p = best.p, dist = flat(p.pos, c.pos);
    c.target = p.id;
    if (dist < cfg.reach && Math.abs(p.pos.y - c.pos.y) < 2.2 && c.cooldown <= 0) {
      face(c, p.pos); c.setState('attack'); c.cooldown = cfg.cd;
      d.seize = cfg.seize; d.seizeId = p.id;
      M.attack(c, p, c.dmg, c.type);
      return;
    }
    c.setState('run');
    M.moveToward(c, p.pos, dt, cfg.walk * 1.8, 6);   // ~3.6 m/s: a steady walk, faster than a crouch-walk, slower than a sprint
  };
}

export const BEHAVIORS_NEW = Object.freeze({ cd_dimmer: dimmerBehavior(), cd_follower: followerBehavior(), cd_auditor: auditorBehavior() });

// ------------------------------------------------------------------------------------------------ WEB SPIDER tuning (existing creature)
export const SPI = { webs: 3, webR: 9, ambushR: 6.5, tele: 0.9, drop: 2.4, ambushCd: 35, retreatAt: 0.5, retreatS: 7 };

/** walkable spots 3-10 m from `o`, narrowest first (few walkable cells around = corridor / doorway); >= 3 m apart */
export function chokeSpots(nav, o, n, rnd = Math.random) {
  const cands = [];
  for (let i = 0; i < 30; i++) {
    const p = nav.randomWalkable(rnd, o.x, o.z, SPI.webR);
    if (!p) continue;
    const d = Math.hypot(p.x - o.x, p.z - o.z);
    if (d < 3 || d > 10) continue;
    const [gx, gz] = nav.toGrid(p.x, p.z);
    let open = 0;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if ((dx || dz) && nav.isWalkable(gx + dx, gz + dz)) open++;
    cands.push({ p, open });
  }
  cands.sort((a, b) => a.open - b.open);
  const out = [];
  for (const c of cands) {
    if (out.every((q) => Math.hypot(q.x - c.p.x, q.z - c.p.z) > 3)) out.push(c.p);
    if (out.length >= n) break;
  }
  return out;
}
export function spiderBehavior(orig, cfgIn = {}) {
  const cfg = { ...SPI, ...cfgIn };
  return (c, dt, M) => {
    if (c.variant === 'hunter') return orig(c, dt, M);   // hunters roam and hunt: unchanged
    const d = c.data, g = M.game;
    if (!d.webs) {   // webs across the corridors / doorways around the lair instead of random floor spots
      d.webs = true;
      const nav = M.nav(c);
      for (const p of nav ? chokeSpots(nav, c.pos, cfg.webs) : []) M.hostSpawn('web', new THREE.Vector3(p.x, c.pos.y, p.z), { data: { owner: c.id } });
    }
    if (d.retreatT > 0) {   // hurt: back to the lair, ignoring everybody, then it can be woken again
      d.retreatT -= dt; c.target = null; d.alarm = null; d.amb = 0;
      c.setState('run');
      const arrived = M.moveToward(c, c.home, dt, c.def.run * 0.9, 8);
      if (arrived || d.retreatT <= 0) { d.retreatT = 0; c.setState('idle'); d.ambAt = (g.time || 0); }
      return;
    }
    if (c.maxHp && c.hp < c.maxHp * cfg.retreatAt && !d.retreated && (c.state === 'run' || c.state === 'attack')) { d.retreated = true; d.retreatT = cfg.retreatS; return; }
    if (d.amb > 0) {   // ceiling-dust tell is playing (client side); then it lands 2.4 m from you, out of your view cone
      d.amb -= dt;
      if (d.amb <= 0) {
        const p = M.game.aiPlayerById?.(d.ambP);
        if (p && !p.dead && !p.inShip) {
          const back = Math.atan2(-p.look.x, -p.look.z), nav = M.nav(c);
          for (const off of [0, 0.9, -0.9, 1.8, -1.8]) {
            const x = p.pos.x + Math.sin(back + off) * cfg.drop, z = p.pos.z + Math.cos(back + off) * cfg.drop;
            if (nav && !nav.walkableAt(x, z)) continue;
            M.placeAt(c, x, z); c.path = null; c.dest = null; break;
          }
          c.target = p.id; c.setState('run');
        } else c.setState('idle');
      }
      return;
    }
    if ((c.state === 'idle' || c.state === 'walk') && (g.time || 0) - (d.ambAt ?? -99) > cfg.ambushCd) {
      const near = M.nearest(c, M.playersFor(c).filter((q) => !q.inShip), cfg.ambushR);
      if (near) {
        d.amb = cfg.tele; d.ambP = near.p.id; d.ambAt = g.time || 0; c.setState('idle');
        try { g.net.broadcast('fx', { k: 'snd', s: 'vent_rattle', p: [near.p.pos.x, near.p.pos.y + 2.7, near.p.pos.z], v: 0.9 }); } catch { /* net closing */ }
        return;
      }
    }
    return orig(c, dt, M);
  };
}
/** a torn / touched web twangs where it is, so the trip is audible even when the spider is out of earshot */
export function webBehavior(orig) {
  return (c, dt, M) => { const was = c.data.alerted; orig(c, dt, M); if (c.data.alerted !== was) M.sound(c, 'vent_rattle', 0.8, 3, 1.5, 30); };
}
