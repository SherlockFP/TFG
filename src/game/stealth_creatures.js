// STEALTH wave 4 - sound-hunting creatures (host AI). Only depends on the CreatureManager interface (M.hear / goTo / follow / attack ...), so
// tools/harness/stealth_listener.test.mjs drives the real state machine with a tiny fake manager.
//   listener  "The Listener": eyeless, slow and harmless-looking while it hears nothing, a sprinter the moment it hears you.
//   crawler   the existing Web Crawler, re-wired to the same brain (it used to see you from 20+ m; now it HEARS you).
// Brain (states = creature.state, also read by the models / sounds):
//   idle / walk   roam slowly. Any audible noise -> alert.                                   (speed = def.walk)
//   alert         freeze and turn its head to the sound for alertT s, then hunt.            (telegraph: click)
//   hunt          run to the LAST noise position; a newer noise re-targets it; a decoy (noise without a player) ends in inspect.
//   inspect       it reached a decoy: sniffs it for inspectT s, then searches.
//   search        creep around the last spot for searchT s (walk speed x1.3); any noise -> hunt again. Then back to roaming.
//   attack        one strike, then a short stagger and a search at the victim's position.
// Silence rule: a player is only attacked when he is noisy (body noise / voice) inside `reach`, or BUMPED (inside `bump`, whatever his noise).
//   A sneaking player (noise 0.02) is therefore heard from 0.02 * hearR = ~0.4 m: he can walk past at arm's length only if he keeps > 1 m.
import { angleDiff, clamp } from '../core/util.js';

export const LISTENER_CFG = { hearR: 22, reach: 1.6, bump: 1.05, cd: 1.7, alertT: 0.75, inspectT: 2.6, searchT: 8, huntMax: 22, searchSpeed: 1.35, noisy: 0.06 };
export const CRAWLER_CFG = { hearR: 19, reach: 1.7, bump: 1.15, cd: 1.4, alertT: 0.35, inspectT: 1.6, searchT: 6, huntMax: 18, searchSpeed: 1.5, noisy: 0.06, ramp: true };

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function soundHunter(cfgIn = {}) {
  const cfg = { ...LISTENER_CFG, ...cfgIn };
  return (c, dt, M) => {
    const d = c.data;
    const g = M.game;
    const players = M.playersFor(c).filter((p) => !p.inShip && !p.dead);
    if (!d.init) { d.init = 1; d.last = null; d.lastOwner = null; d.searchLeft = 0; d.spd = 3; c.setState('idle'); }
    d.trace = d.trace || { heard: 0 };

    // ---- 0. somebody hit it: it knows where that player stands (a loud, painful noise)
    if (d.hitBy) {
      const p = players.find((q) => q.id === d.hitBy);
      d.hitBy = null;
      if (p && (g.time || 0) - (d.hitAt || 0) < 4 && c.state !== 'attack') { noticeAt(c, d, p.pos, p.id, cfg, M); }
    }

    // ---- 1. contact: noisy player inside reach, or anybody bumped
    if (c.state !== 'attack' && c.cooldown <= 0) {
      for (const p of players) {
        const dist = flat(p.pos, c.pos);
        if (dist > cfg.reach || Math.abs(p.pos.y - c.pos.y) > 2.2) continue;
        const noisy = (p.noise || 0) > cfg.noisy || (p.voice || 0) > 0.05;
        const hunting = c.state === 'hunt' || c.state === 'search' || c.state === 'attack';
        if (dist < cfg.bump || (noisy && (hunting || dist < cfg.reach * 0.75))) {
          c.yaw = Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
          c.setState('attack'); c.cooldown = cfg.cd; c.target = p.id;
          d.last = { x: p.pos.x, z: p.pos.z }; d.lastOwner = p.id;
          M.attack(c, p, c.dmg, c.type);
          return;
        }
      }
    }
    if (c.state === 'attack') {
      if (c.t > 0.6) { d.searchLeft = cfg.searchT; d.searchGoalT = 0; c.setState('search'); }
      return;
    }

    // ---- 2. ears
    const n = M.hear(c, cfg.hearR);
    if (n) {
      d.trace.heard++;
      const moved = !d.last || flat(n.pos, d.last) > 1.5;
      if (c.state === 'idle' || c.state === 'walk') { noticeAt(c, d, n.pos, n.owner, cfg, M); return; }
      if (c.state === 'search' || c.state === 'inspect') {
        // a decoy that is still ringing where it already is: keep sniffing it; anything else (a player, a new place) is a fresh hunt
        if (n.owner == null && d.last && flat(n.pos, d.last) < 2.5) { if (c.state === 'inspect') d.inspectLeft = Math.max(d.inspectLeft, 0.9); }
        else { noticeAt(c, d, n.pos, n.owner, cfg, M, true); return; }
      }
      if (c.state === 'alert') { d.last = { x: n.pos.x, z: n.pos.z }; d.lastOwner = n.owner ?? null; }
      if (c.state === 'hunt' && moved) { d.last = { x: n.pos.x, z: n.pos.z }; d.lastOwner = n.owner; M.goToLazy(c, n.pos.x, n.pos.z, 1.5); c.t = Math.min(c.t, 1); }   // newer noise: re-target, keep running
    }

    // ---- 3. states
    if (c.state === 'alert') {
      if (d.last) c.yaw += clamp(angleDiff(c.yaw, Math.atan2(d.last.x - c.pos.x, d.last.z - c.pos.z)), -9 * dt, 9 * dt);
      if (c.t >= cfg.alertT) { c.setState('hunt'); d.spd = 3; if (d.last) M.goTo(c, d.last.x, d.last.z); }
      return;
    }
    if (c.state === 'hunt') {
      if (!d.last || c.t > cfg.huntMax) { d.searchLeft = cfg.searchT; d.searchGoalT = 0; c.setState('search'); return; }
      const run = c.def.run;
      if (cfg.ramp) d.spd = Math.min(run, (d.spd || 3) + dt * 6); else d.spd = run;
      const near = flat(c.pos, d.last) < 1.3;
      const arrived = near || M.follow(c, dt, d.spd, cfg.ramp && d.spd > 7 ? 1.6 : 8);
      if (cfg.ramp && d.last) {   // poor cornering at speed (the old crawler trait)
        const want = Math.atan2(d.last.x - c.pos.x, d.last.z - c.pos.z);
        if (Math.abs(angleDiff(c.yaw, want)) > 1.2) d.spd = Math.max(2, d.spd - dt * 12);
      }
      if (arrived) {
        if (d.lastOwner == null) { c.setState('inspect'); d.inspectLeft = cfg.inspectT; g.stealth?.onInspect?.(c, d.last); }
        else { d.searchLeft = cfg.searchT; d.searchGoalT = 0; c.setState('search'); }
      }
      return;
    }
    if (c.state === 'inspect') {
      d.inspectLeft -= dt;
      if (d.inspectLeft <= 0) { d.searchLeft = cfg.searchT * 0.7; d.searchGoalT = 0; c.setState('search'); }
      return;
    }
    if (c.state === 'search') {
      d.searchLeft -= dt;
      d.searchGoalT = (d.searchGoalT || 0) - dt;
      if (d.searchGoalT <= 0 && d.last) {
        d.searchGoalT = 2.2 + Math.random() * 1.6;
        const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 3.5;
        M.goTo(c, d.last.x + Math.cos(a) * r, d.last.z + Math.sin(a) * r);
      }
      M.follow(c, dt, c.def.walk * cfg.searchSpeed);
      if (d.searchLeft <= 0) { d.last = null; c.setState('idle'); }
      return;
    }
    // idle / walk: roam
    if (c.state === 'idle') { if (c.t > 2.5 + Math.random() * 3) { M.wander(c, 14); c.setState('walk'); } return; }
    if (c.state === 'walk') { if (M.follow(c, dt, c.def.walk)) c.setState('idle'); return; }
    c.setState('idle');
  };
}

function noticeAt(c, d, pos, owner, cfg, M, retarget = false) {
  d.last = { x: pos.x, z: pos.z }; d.lastOwner = owner ?? null;
  if (retarget) { c.setState('hunt'); d.spd = 3; M.goTo(c, pos.x, pos.z); return; }   // already alert: straight back on the trail
  c.setState('alert');
  c.yaw = Math.atan2(pos.x - c.pos.x, pos.z - c.pos.z);
}

// ------------------------------------------------------------------------------------------------ definitions (registered by game/stealth.js)
export const LISTENER_DEF = {
  name: 'The Listener', hp: 170, dmg: 55, walk: 1.5, run: 8.8, power: 2.5, xp: 190, coin: 34, zone: 'in', radius: 0.5, height: 2.2, maxAlive: 2,
  drop: ['drop_lurker', 0.3],
  deathText: 'made one noise too many for The Listener.',
  lore: 'It has no eyes and does not need them. It creeps slowly through the halls, head tilted, waiting. The moment it hears you it sprints to the sound. '
    + 'Walk and it hears you at 6 m, run and it hears you at 15 m. Sneak (Alt) and it walks right past. Walls and doors muffle you. Throw something to send it the other way.',
};

/** spawn weights per moon tier 1..4 (tier 1 has none: fair early game), merged by spawnTable */
export const LISTENER_SPAWN = { zone: 'in', w: [0, 3, 5, 7], interior: { mansion: 1.4, backrooms: 1.6, sewer: 1.2, hospital: 1.3, factory: 1 } };
