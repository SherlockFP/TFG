// Interior GAMEPLAY set pieces shared by every theme (built by facility.js after the theme decoration,
// driven by the SetPieces runtime in setpieces.js: update / interactables / net / dispose).
//
//   LASER GRID     straight corridor cell with a security grid (serverfarm, office, hospital, big factories).
//                  Patterns: 'sweep' (one beam moving up and down - crouch and cross while it is high),
//                  'blink' (three beams, 1.8 s gap - time it), 'crouch' (two high beams - crouch under).
//                  Touching a live beam: 20 damage, knockback, and the ALARM: the host makes a loud noise at
//                  the grid (creatures come). A wall panel next to the grid cuts it for 90 s (host-authoritative).
//   BREAKER ROOM   a room whose lights are dead (they flicker now and then). Resetting the breaker panel turns
//                  the room lights on for everyone (permanent). Extra loot inside.
//   CAVE-IN        a cracked, dusty ceiling patch in a corridor. The first player to walk under it starts a
//                  1.3 s rumble + dust warning, then the ceiling comes down: 30 damage to anyone still under it
//                  (host stuns creatures there). Rubble stays (visual only, it never blocks the nav grid).
//   VENT SHORTCUT  two vent covers with a green LED in distant rooms, linked by a crawlspace. [E] crawls
//                  through (client side, ~0.7 s fade) and makes noise at the exit.
//   TOXIC SLUDGE   sewer sludge pits: glowing pool, slows (water zone) and burns 5 HP / 0.6 s. Loot inside.
//
// Everything is placed from ctx.rng forks (deterministic on every peer); prop overlap tests treat downloaded
// GLB props (and their crate fallbacks) as generic 2.1 m boxes so every peer agrees. Runtime state changes
// go through the host (request 'spHz' -> broadcast 'spHzB'; late joiners get 'spHzState').
import * as THREE from 'three';
import { layoutKit, SPECIAL_ROOMS, INWARD, WALL_ROT, surfacePlane, navClear } from './common.js';
import { t } from '../../core/i18n.js';

const PLAYER_R = 0.34;
const LASER_DMG = 20, LASER_CD = 1.0, LASER_OFF = 90;
const CAVE_WARN = 1.3, CAVE_DMG = 30;
const SLUDGE_DMG = 5, SLUDGE_TICK = 0.6;
const CRAWL_T = 0.75;

// laser count per theme = base + size * mul (rounded); no entry = no lasers
const LASER_RATE = { serverfarm: [2, 1.5], office: [1, 0.8], hospital: [0, 0.7], factory: [-1, 1.2] };
const CAVE_RATE = { sewer: [1, 1], mineshaft: [1, 1], backrooms: [1, 0.8], mansion: [0, 0.8], factory: [0, 0.6], office: [0, 0.4], hospital: [0, 0.5], serverfarm: [0, 0.3] };

function hash01(a, b) {
  let h = Math.imul((a | 0) ^ 0x27d4eb2d, 0x9e3779b1) ^ Math.imul(((b | 0) + 0x165667b1) | 0, 0x85ebca77);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const pretty = (t) => String(t || 'room').replace(/_/g, ' ');
const inRect = (rc, x, z, m = 0) => x > rc.x0 - m && x < rc.x1 + m && z > rc.z0 - m && z < rc.z1 + m;
const _v = new THREE.Vector3();

export class Hazards {
  constructor(ctx) {
    this.layout = ctx.layout;
    this.Y = ctx.Y;
    this.lasers = [];
    this.breakers = [];
    this.caves = [];
    this.vents = [];
    this.sludge = [];
    this.owned = [];
    this.geometries = [];
    this.materials = [];
    this.lightPool = ctx.lightPool;
    this.game = null;
    this.crawl = null;
    this.hitCd = 0;
    this.sludgeT = 0;
    this.pending = new Map();     // requests sent, waiting for the host (key -> time sent; no spam)
    this.disposed = false;
  }

  own(obj) { if (obj) this.owned.push(obj); return obj; }

  // ------------------------------------------------------------------ per frame (from SetPieces.update)
  update(dt, clock, cam, game, live) {
    if (this.disposed) return;
    this.game = game;
    const p = game.player;
    const lp = p && !p.dead && p.indoor !== false ? p : null;
    this.hitCd = Math.max(0, this.hitCd - dt);
    for (const g of this.lasers) this.updateLaser(g, dt, clock, cam, game, lp, live);
    for (const b of this.breakers) this.updateBreaker(b, dt, clock, cam, game);
    for (const c of this.caves) this.updateCave(c, dt, clock, cam, game, lp, live);
    if (this.sludge.length) this.updateSludge(dt, clock, cam, game, lp, live);
    if (this.crawl) this.updateCrawl(dt, game);
  }

  // ------------------------------------------------------------------ lasers
  beamState(g, clock) {
    const off = g.offUntil > clock;
    const t = ((clock + g.phase) % g.period + g.period) % g.period;
    if (g.pattern === 'sweep') return { on: !off, ys: [0.95 + 0.72 * Math.sin((t / g.period) * Math.PI * 2)], warn: false };
    if (g.pattern === 'crouch') return { on: !off, ys: [1.3, 1.65], warn: false };
    // blink: gap of 1.8 s at the start of each period, flicker warning 0.5 s before the beams return
    const gap = t < 1.8;
    const warn = t > 1.3 && t < 1.8;
    return { on: !off && !gap, ys: [0.3, 0.9, 1.5], warn: !off && warn };
  }

  updateLaser(g, dt, clock, cam, game, lp, live) {
    const st = this.beamState(g, clock);
    const flick = st.warn && Math.floor(clock * 14) % 2 === 0;
    for (let k = 0; k < g.beams.length; k++) {
      const m = g.beams[k];
      const y = st.ys[k];
      const vis = (st.on || flick) && y !== undefined;
      if (m.visible !== vis) m.visible = vis;
      if (vis) m.position.y = this.Y + y;
    }
    g.alarmT = Math.max(0, (g.alarmT || 0) - dt);
    g.mat.color.setHex(g.alarmT > 0 && Math.floor(clock * 10) % 2 ? 0xffffff : 0xff2030);
    if (g.e) { g.e.enabled = g.offUntil <= clock; g.e.intensity = g.alarmT > 0 ? 1.6 : 0.55; }
    if (!lp || !live || !st.on || this.hitCd > 0) return;
    // local player vs beam plane
    const along = g.axis === 'x' ? lp.pos.x - g.cx : lp.pos.z - g.cz;
    const lat = g.axis === 'x' ? lp.pos.z - g.cz : lp.pos.x - g.cx;
    if (Math.abs(along) > PLAYER_R + 0.05 || Math.abs(lat) > g.half + 0.2) return;
    const feet = lp.pos.y - this.Y, head = feet + (lp.crouch ? 1.12 : 1.8);
    if (!st.ys.some((y) => y > feet - 0.02 && y < head)) return;
    this.hitCd = LASER_CD;
    _v.set(g.cx, this.Y + 1, g.cz);
    game.damageLocal?.(LASER_DMG, 'laser', _v.clone());
    game.engine?.flash?.(0xff2030, 0.35);
    const s = along >= 0 ? 1 : -1;
    if (lp.vel) { if (g.axis === 'x') lp.vel.x += s * 4; else lp.vel.z += s * 4; }
    game.audio?.play('taser_zap', { volume: 0.7 });
    this.request(game, { k: 'trip', i: g.i });
  }

  // ------------------------------------------------------------------ breaker rooms
  updateBreaker(b, dt, clock, cam, game) {
    if (b.lever) b.lever.rotation.x += ((b.on ? -0.9 : 0.9) - b.lever.rotation.x) * 0.2;
    if (b.on) return;
    // dead room: now and then one fixture sputters back for a split second (same on every peer)
    const cyc = Math.floor((clock + b.phase) / b.period);
    if (cyc !== b.cycle) {
      b.cycle = cyc;
      if (b.flash) { b.flash.enabled = false; b.flash = null; }
      if (hash01(cyc, b.seed) < 0.55 && b.emitters.length && (this.lightPool?.globalDim ?? 1) > 0.05) {
        b.flash = b.emitters[Math.floor(hash01(b.seed, cyc) * b.emitters.length)];
        b.flash.enabled = true;
        b.flashT = 0.08 + hash01(cyc, 7) * 0.12;
        if (cam && b.flash.pos.distanceToSquared(cam) < 22 * 22) {
          game.audio?.play('spark', { pos: b.flash.pos, volume: 0.45, refDistance: 2, maxDistance: 22, occlude: true, bus: 'sfx' });
          game.particles?.burst(b.flash.pos, 'sparks');
        }
      }
    }
    if (b.flash) { b.flashT -= dt; if (b.flashT <= 0) { b.flash.enabled = false; b.flash = null; } }
  }

  // ------------------------------------------------------------------ cave-ins
  updateCave(c, dt, clock, cam, game, lp, live) {
    if (c.state === 0) {
      if (!lp || !live || this.isPending('cave' + c.i)) return;
      if (inRect(c.trigger, lp.pos.x, lp.pos.z) && Math.abs(lp.pos.y - this.Y) < 2) this.request(game, { k: 'cave', i: c.i });
      return;
    }
    if (c.state === 1) {
      const near = cam && Math.hypot(cam.x - c.cx, cam.z - c.cz) < 16;
      c.dustT -= dt;
      if (near && c.dustT <= 0) {
        c.dustT = 0.12;
        _v.set(c.cx + (Math.random() - 0.5) * 2.4, c.ceil - 0.1, c.cz + (Math.random() - 0.5) * 2.4);
        game.particles?.burst(_v, 'dust', new THREE.Vector3(0, -1, 0));
        if (lp && Math.hypot(lp.pos.x - c.cx, lp.pos.z - c.cz) < 8) game.engine?.shake(0.12);
      }
      if (clock >= c.t) {
        c.state = 2;
        c.fallT = 0;
        for (const ch of c.chunks) ch.mesh.visible = true;
        if (near) {
          game.audio?.play('explosion', { pos: new THREE.Vector3(c.cx, this.Y + 1, c.cz), volume: 0.45, pitch: 0.6, refDistance: 3, maxDistance: 40, occlude: true, bus: 'sfx' });
          game.audio?.play('hit_metal', { pos: new THREE.Vector3(c.cx, this.Y + 1, c.cz), volume: 0.6, pitch: 0.5, refDistance: 3, maxDistance: 30, occlude: true, bus: 'sfx' });
        }
        c.hitPending = true;
        if (game.isHost) this.hostStunUnder(c, game);
      }
      return;
    }
    // falling / landed chunks
    if (c.fallT < 1) {
      c.fallT = Math.min(1, c.fallT + dt / 0.35);
      const k = c.fallT * c.fallT;
      for (const ch of c.chunks) {
        ch.mesh.position.y = ch.y0 + (ch.y1 - ch.y0) * k;
        ch.mesh.rotation.set(ch.rx * c.fallT, ch.ry, ch.rz * c.fallT);
      }
      if (c.fallT >= 1) {
        if (cam && Math.hypot(cam.x - c.cx, cam.z - c.cz) < 16) {
          for (let n = 0; n < 4; n++) game.particles?.burst(new THREE.Vector3(c.cx + (Math.random() - 0.5) * 2.5, this.Y + 0.2, c.cz + (Math.random() - 0.5) * 2.5), 'dust');
          if (lp && Math.hypot(lp.pos.x - c.cx, lp.pos.z - c.cz) < 10) game.engine?.shake(0.6);
        }
        if (c.hitPending && lp && inRect(c.impact, lp.pos.x, lp.pos.z) && Math.abs(lp.pos.y - this.Y) < 2) {
          game.damageLocal?.(CAVE_DMG, 'collapse', new THREE.Vector3(c.cx, c.ceil, c.cz));
        }
        c.hitPending = false;
      }
    }
  }

  hostStunUnder(c, game) {
    const list = game.creatures?.host;
    if (!list) return;
    for (const cr of list.values()) {
      if (cr.dead || cr.zone !== 'in' || !cr.def || cr.def.hazard) continue;
      if (!inRect(c.impact, cr.pos.x, cr.pos.z, 0.3)) continue;
      cr.stunT = Math.max(cr.stunT || 0, 2);
      cr.setState?.('stunned');
    }
  }

  // ------------------------------------------------------------------ sludge
  updateSludge(dt, clock, cam, game, lp, live) {
    for (const s of this.sludge) {
      // bubbling surface (cosmetic, near the camera only)
      if (cam && Math.abs(cam.x - s.cx) < 18 && Math.abs(cam.z - s.cz) < 18) {
        s.bubbleT -= dt;
        if (s.bubbleT <= 0) {
          s.bubbleT = 0.25 + Math.random() * 0.4;
          _v.set(s.rect.x0 + Math.random() * (s.rect.x1 - s.rect.x0), s.y + 0.02, s.rect.z0 + Math.random() * (s.rect.z1 - s.rect.z0));
          game.particles?.burst(_v, 'goo', new THREE.Vector3(0, 1, 0), 0.4);
        }
        if (s.mesh) { s.t += dt; const u = s.mesh.geometry.attributes.uv; if (u && s.base) { for (let i = 0; i < u.count; i++) u.setXY(i, s.base[i * 2] + s.t * 0.02, s.base[i * 2 + 1] + Math.sin(s.t * 0.7 + i) * 0.01); u.needsUpdate = true; } }
      }
    }
    if (!lp || !live) return;
    let inside = null;
    for (const s of this.sludge) if (inRect(s.rect, lp.pos.x, lp.pos.z) && lp.pos.y < s.y + 0.4) { inside = s; break; }
    if (!inside) { this.sludgeT = 0; return; }
    this.sludgeT -= dt;
    if (this.sludgeT <= 0) {
      this.sludgeT = SLUDGE_TICK;
      game.damageLocal?.(SLUDGE_DMG, 'toxic', null);
      game.engine?.flash?.(0x60ff40, 0.12);
    }
  }

  // ------------------------------------------------------------------ vent crawl (client side)
  startCrawl(v, from, game) {
    if (this.crawl || !game?.player || game.player.dead) return;
    const to = from === v.a ? v.b : v.a;
    this.crawl = { t: 0, to, done: false };
    game.audio?.play('vent_crawl', { volume: 0.8 });
    game.net?.request?.('noise', { p: from.pos.toArray(), loud: 0.5 });
  }
  updateCrawl(dt, game) {
    const c = this.crawl;
    c.t += dt;
    const p = game.player;
    if (!p || p.dead) { this.crawl = null; return; }
    if (c.t < CRAWL_T) { game.engine?.flash?.(0x000000, 1); if (p.vel) p.vel.set(0, 0, 0); return; }
    if (!c.done) {
      c.done = true;
      p.teleport(c.to.spawn.clone(), c.to.yaw);
      game.audio?.play('vent_rattle', { volume: 0.7 });
      game.net?.request?.('noise', { p: c.to.pos.toArray(), loud: 0.6 });
    }
    if (c.t > CRAWL_T + 0.05) this.crawl = null;
  }

  // ------------------------------------------------------------------ interactables
  pushInteractables(list, game) {
    const p = game?.player;
    if (this.disposed || !p || p.dead || !p.indoor) return;
    const near = (pos, r2 = 16) => p.pos.distanceToSquared(pos) < r2;
    for (const g of this.lasers) if (g.ip && near(g.ip.pos)) list.push(g.ip);
    for (const b of this.breakers) if (b.ip && !b.on && near(b.ip.pos)) list.push(b.ip);
    for (const v of this.vents) for (const end of [v.a, v.b]) if (end.ip && near(end.ip.pos)) list.push(end.ip);
  }
  bindInteractables(game, clockFn) {
    for (const g of this.lasers) {
      g.ip = {
        pos: g.panelPos, r: 0.5, reach: 2.2,
        label: () => t(g.offUntil > clockFn() ? 'Laser grid (offline)' : 'Cut the laser grid power [E]'),
        sub: () => (g.offUntil > clockFn() ? `${t('Rebooting in')} ${Math.ceil(g.offUntil - clockFn())}s` : t('Security override - 90 seconds')),
        action: () => { if (g.offUntil <= clockFn()) this.request(game, { k: 'laser', i: g.i }); },
      };
    }
    for (const b of this.breakers) {
      b.ip = {
        pos: b.panelPos, r: 0.5, reach: 2.2,
        label: () => t('Reset the breaker [E]'), sub: () => t('Restores the lights in this room'),
        action: () => { if (!b.on) this.request(game, { k: 'breaker', i: b.i }); },
      };
    }
    for (const v of this.vents) {
      for (const [end, other] of [[v.a, v.b], [v.b, v.a]]) {
        end.ip = {
          pos: end.ipPos, r: 0.6, reach: 2.2,
          label: () => t('Crawl through the vent [E]'), sub: () => `${t('Shortcut to:')} ${pretty(other.roomType)}`,
          action: () => this.startCrawl(v, end, game),
        };
      }
    }
  }

  isPending(key) { const t = this.pending.get(key); return t !== undefined && performance.now() - t < 3000; }
  request(game, d) {
    const key = d.k + d.i;
    if (d.k !== 'trip' && this.isPending(key)) return;
    this.pending.set(key, performance.now());
    game.net?.request?.('spHz', { s: this.layout.seed >>> 0, ...d });
  }

  // ------------------------------------------------------------------ host / net
  // host: validate a request and broadcast the resulting state change
  hostRequest(d, from, game, clock) {
    const pl = game.aiPlayerById?.(from);
    if (!pl || pl.dead || !pl.pos) return;
    const i = d.i | 0;
    const nearTo = (pos, r) => pl.pos.distanceToSquared(pos) < r * r;
    const s = this.layout.seed >>> 0;
    if (d.k === 'laser') {
      const g = this.lasers[i];
      if (!g || g.offUntil > clock || !nearTo(g.panelPos, 5)) return;
      game.net.broadcast('spHzB', { s, k: 'laser', i, u: +(clock + LASER_OFF).toFixed(2) });
    } else if (d.k === 'trip') {
      const g = this.lasers[i];
      if (!g || !nearTo(new THREE.Vector3(g.cx, this.Y, g.cz), 5) || (g.lastTrip || -1e9) > clock - 3) return;
      g.lastTrip = clock;
      game.creatures?.noise?.(new THREE.Vector3(g.cx, this.Y + 1, g.cz), 3);
      game.net.broadcast('spHzB', { s, k: 'trip', i });
    } else if (d.k === 'breaker') {
      const b = this.breakers[i];
      if (!b || b.on || !nearTo(b.panelPos, 5)) return;
      game.net.broadcast('spHzB', { s, k: 'breaker', i });
    } else if (d.k === 'cave') {
      const c = this.caves[i];
      if (!c || c.state !== 0 || !nearTo(new THREE.Vector3(c.cx, this.Y, c.cz), 6)) return;
      c.state = 1;   // host locks it right away (two requests in one frame)
      game.net.broadcast('spHzB', { s, k: 'cave', i, t: +(clock + CAVE_WARN).toFixed(2) });
    }
  }
  apply(d, game, clock) {
    const i = d.i | 0;
    this.pending.delete(d.k + i);
    if (d.k === 'laser') {
      const g = this.lasers[i];
      if (!g) return;
      g.offUntil = +d.u || 0;
      game.audio?.play('power_down', { pos: g.panelPos, volume: 0.6, refDistance: 2, maxDistance: 24, occlude: true, bus: 'sfx' });
    } else if (d.k === 'trip') {
      const g = this.lasers[i];
      if (!g) return;
      g.alarmT = 3;
      game.audio?.play('turret_detect', { pos: new THREE.Vector3(g.cx, this.Y + 2, g.cz), volume: 0.9, refDistance: 4, maxDistance: 50, occlude: false, bus: 'sfx' });
    } else if (d.k === 'breaker') {
      const b = this.breakers[i];
      if (!b || b.on) return;
      this.setBreaker(b, true);
      game.audio?.play('power_up', { pos: b.panelPos, volume: 0.8, refDistance: 3, maxDistance: 30, occlude: true, bus: 'sfx' });
      game.audio?.play('lever_pull', { pos: b.panelPos, volume: 0.6, refDistance: 2, maxDistance: 16, occlude: true, bus: 'sfx' });
    } else if (d.k === 'cave') {
      const c = this.caves[i];
      if (!c || c.state === 2) return;
      c.state = 1;
      c.t = +d.t || clock;
      c.dustT = 0;
      if (game.camera && game.camera.position.distanceTo(new THREE.Vector3(c.cx, this.Y + 1, c.cz)) < 30) {
        game.audio?.play('sandkefal_rumble', { pos: new THREE.Vector3(c.cx, c.ceil, c.cz), volume: 0.8, pitch: 1.35, refDistance: 3, maxDistance: 30, occlude: true, bus: 'sfx' });
      }
    }
  }
  setBreaker(b, on) {
    b.on = on;
    if (b.flash) { b.flash = null; }
    for (const e of b.emitters) e.enabled = on;
  }
  // state for a late joiner
  syncState(clock) {
    return {
      l: this.lasers.filter((g) => g.offUntil > clock).map((g) => [g.i, +g.offUntil.toFixed(2)]),
      b: this.breakers.filter((b) => b.on).map((b) => b.i),
      c: this.caves.filter((c) => c.state).map((c) => [c.i, c.state, +(c.t || 0).toFixed(2)]),
    };
  }
  applySync(st, clock) {
    for (const [i, u] of st?.l || []) { const g = this.lasers[i | 0]; if (g) g.offUntil = +u || 0; }
    for (const i of st?.b || []) { const b = this.breakers[i | 0]; if (b) this.setBreaker(b, true); }
    for (const [i, state, t] of st?.c || []) {
      const c = this.caves[i | 0];
      if (!c) continue;
      if (state === 2 || (+t || 0) <= clock) {
        c.state = 2; c.fallT = 1; c.hitPending = false;
        for (const ch of c.chunks) { ch.mesh.visible = true; ch.mesh.position.y = ch.y1; ch.mesh.rotation.set(ch.rx, ch.ry, ch.rz); }
      } else { c.state = 1; c.t = +t; c.dustT = 0; }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const o of this.owned) o.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.owned.length = 0; this.geometries.length = 0; this.materials.length = 0;
    for (const g of this.lasers) g.ip = null;
    for (const b of this.breakers) b.ip = null;
    for (const v of this.vents) { v.a.ip = null; v.b.ip = null; }
    this.crawl = null; this.game = null;
  }
}

// ======================================================================================= build
export function buildHazards(ctx) {
  const L = ctx.layout, K = layoutKit(L), Y = ctx.Y, C = K.C, group = ctx.group, nav = ctx.nav;
  const theme = L.theme, size = L.size || 1;
  const hz = new Hazards(ctx);
  const rng = ctx.rng;
  const rLaser = rng.fork('laser'), rBreak = rng.fork('breaker'), rCave = rng.fork('cave'), rVent = rng.fork('vent'), rSludge = rng.fork('sludge');
  const gb = new ctx.GeoBuilder();
  const used = new Set();          // layout cells taken by a hazard
  const sp = ctx.setPieces;

  // placed-prop footprints (GLB props and crates: generic box so every peer agrees)
  const boxCache = new Map();
  const propBox = (o) => {
    let bb = boxCache.get(o);
    if (bb === undefined) {
      if (o.userData.ext || o.userData.propId === 'crate_wood') {
        const p = o.position;
        bb = new THREE.Box3(new THREE.Vector3(p.x - 1.05, p.y - 0.05, p.z - 1.05), new THREE.Vector3(p.x + 1.05, p.y + 2.7, p.z + 1.05));
      } else { bb = new THREE.Box3().setFromObject(o); if (bb.isEmpty()) bb = null; }
      boxCache.set(o, bb);
    }
    return bb;
  };
  const propHit = (x0, z0, x1, z1, y0, y1) => {
    for (const o of group.children) {
      const ud = o.userData;
      if (!ud || !(ud.propId || ud.ext)) continue;
      const p = o.position;
      if (p.x < x0 - 4 || p.x > x1 + 4 || p.z < z0 - 4 || p.z > z1 + 4) continue;
      const bb = propBox(o);
      if (!bb) continue;
      if (bb.max.x <= x0 || bb.min.x >= x1 || bb.max.z <= z0 || bb.min.z >= z1 || bb.max.y <= y0 || bb.min.y >= y1) continue;
      return true;
    }
    return false;
  };
  const ventHit = (x0, z0, x1, z1) => (sp?.vents || []).some((v) => v.rect && v.rect.x0 < x1 && v.rect.x1 > x0 && v.rect.z0 < z1 && v.rect.z1 > z0);
  const hasZone = (x0, z0, x1, z1) => (ctx.zones || []).some((z) => z.min && z.max && z.min[0] < x1 && z.max[0] > x0 && z.min[1] < z1 && z.max[1] > z0 && z.type !== 'dark');
  const rate = (tbl) => { const r = tbl[theme]; return r ? Math.max(0, Math.round(r[0] + size * r[1])) : 0; };
  const far = (x, z, list, d) => list.every((q) => Math.abs(q[0] - x) + Math.abs(q[1] - z) >= d);

  // ---------------------------------------------------------------------------- laser grids
  {
    const want = rate(LASER_RATE);
    const cand = [];
    for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
      const i = L.idx(x, z);
      if (L.cells[i] !== 2 || L.distOf[i] <= 4 || K.cellHasDoorway(x, z)) continue;
      const ax = K.straightAxis(x, z);
      if (ax) cand.push([x, z, ax]);
    }
    rLaser.shuffle(cand);
    const placed = [];
    for (const [x, z, ax] of cand) {
      if (placed.length >= want) break;
      if (!far(x, z, placed, 6)) continue;
      const rc = K.cellRect(x, z);
      if (ventHit(rc.x0, rc.z0, rc.x1, rc.z1) || hasZone(rc.x0, rc.z0, rc.x1, rc.z1)) continue;
      const cx = rc.x0 + C / 2, cz = rc.z0 + C / 2;
      // beams must not cut through a prop (pipes, lamps are above 2 m)
      const bx0 = ax === 'x' ? cx - 0.2 : rc.x0, bx1 = ax === 'x' ? cx + 0.2 : rc.x1, bz0 = ax === 'x' ? rc.z0 : cz - 0.2, bz1 = ax === 'x' ? rc.z1 : cz + 0.2;
      if (propHit(bx0, bz0, bx1, bz1, Y + 0.05, Y + 1.9)) continue;
      // override panel on one side wall, 1.5 m before the beams
      const r = rLaser.fork('g' + placed.length);
      const sideD = ax === 'x' ? (r.chance(0.5) ? 1 : 3) : (r.chance(0.5) ? 0 : 2);
      const offAlong = r.sign() * 1.45;
      const [ix, iz] = INWARD[sideD];
      const [ecx, ecz] = K.edgeCenter(x, z, sideD);
      const px = ecx + (ax === 'x' ? offAlong : 0) + ix * 0.06, pz = ecz + (ax === 'z' ? offAlong : 0) + iz * 0.06;
      if (propHit(px - 0.35, pz - 0.35, px + 0.35, pz + 0.35, Y + 0.8, Y + 1.8)) continue;
      const pattern = theme === 'serverfarm' ? r.pick(['sweep', 'blink', 'crouch', 'sweep']) : r.pick(['blink', 'crouch', 'sweep']);
      const g = {
        i: hz.lasers.length, x, z, axis: ax, cx, cz, half: C / 2 - 0.15, pattern,
        period: pattern === 'blink' ? r.float(4.2, 5.6) : r.float(2.6, 3.8), phase: r.float(0, 10),
        offUntil: -1e9, beams: [], mat: null, e: null, panelPos: new THREE.Vector3(px + ix * 0.2, Y + 1.35, pz + iz * 0.2), ip: null, alarmT: 0,
      };
      // emitter posts on both walls
      for (const d of ax === 'x' ? [1, 3] : [0, 2]) {
        const [qx, qz] = K.edgeCenter(x, z, d), [jx, jz] = INWARD[d];
        const ppx = qx + jx * 0.08, ppz = qz + jz * 0.08;
        gb.box('post', ppx, Y + 1.05, ppz, 0.16, 2.1, 0.16, 1);
        gb.box('led', ppx + jx * 0.085, Y + 1.05, ppz + jz * 0.085, ax === 'x' ? 0.05 : 0.01, 1.9, ax === 'x' ? 0.01 : 0.05, 1);
      }
      // hazard floor stripe under the grid
      if (ax === 'x') gb.hrect('f:hazard_stripes', cx - 0.25, rc.z0 + 0.1, cx + 0.25, rc.z1 - 0.1, Y + 0.008, true, 1);
      else gb.hrect('f:hazard_stripes', rc.x0 + 0.1, cz - 0.25, rc.x1 - 0.1, cz + 0.25, Y + 0.008, true, 1);
      // panel
      gb.box('panel', px, Y + 1.35, pz, ax === 'x' ? 0.5 : 0.1, 0.6, ax === 'x' ? 0.1 : 0.5, 1);
      gb.box('led', px + ix * 0.055, Y + 1.5, pz + iz * 0.055, ax === 'x' ? 0.3 : 0.01, 0.08, ax === 'x' ? 0.01 : 0.3, 1);
      // beams (own material so the alarm can flash them)
      g.mat = new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
      hz.materials.push(g.mat);
      const n = pattern === 'sweep' ? 1 : pattern === 'crouch' ? 2 : 3;
      const geo = ax === 'x' ? new THREE.BoxGeometry(0.035, 0.035, C - 0.3) : new THREE.BoxGeometry(C - 0.3, 0.035, 0.035);
      hz.geometries.push(geo);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(geo, g.mat);
        m.position.set(cx, Y + 1, cz);
        m.renderOrder = 3;
        m.userData.setPiece = true;
        group.add(m); hz.own(m);
        g.beams.push(m);
      }
      g.e = { pos: new THREE.Vector3(cx, Y + 1.2, cz), color: 0xff2030, intensity: 0.55, distance: 5, group: 'facility', halo: false };
      ctx.emitters.push(g.e);
      hz.lasers.push(g);
      placed.push([x, z]);
      used.add(L.idx(x, z));
    }
  }

  // ---------------------------------------------------------------------------- breaker rooms
  if (theme !== 'mineshaft') {   // mine walls are buried in rock decoration
    const want = size >= 1.6 ? 2 : 1;
    const cand = rBreak.shuffle(L.rooms.filter((r) => !SPECIAL_ROOMS.has(r.type) && !r.arena && !r.maze && !r.hub && r.type !== 'nest' && K.roomDist(r) >= 4 && r.w * r.h >= 4));
    for (const r of cand) {
      if (hz.breakers.length >= want) break;
      const rc = K.roomRect(r);
      const ems = ctx.emitters.filter((e) => e.group === 'facility' && e.enabled !== false && inRect(rc, e.pos.x, e.pos.z, -0.05) && e.pos.y < Y + r.height + 0.1);
      if (ems.length < 2) continue;
      const rr = rBreak.fork('r' + r.id);
      const walls = rr.shuffle(K.perimeter(r).filter((e) => !K.edgeBusy(e.x, e.z, e.d) && !K.cellHasDoorway(e.x, e.z)));
      let panel = null;
      for (const w of walls) {
        const along = rr.sign() * 1.4;
        const [px, pz] = K.wallPoint(w.x, w.z, w.d, along, 0.07);
        if (propHit(px - 0.4, pz - 0.4, px + 0.4, pz + 0.4, Y + 0.7, Y + 1.9)) continue;
        panel = { w, px, pz };
        break;
      }
      if (!panel) continue;
      const { w, px, pz } = panel;
      const [ix, iz] = INWARD[w.d];
      const alongX = w.d === 1 || w.d === 3;
      gb.box('panel', px, Y + 1.3, pz, alongX ? 0.55 : 0.12, 0.75, alongX ? 0.12 : 0.55, 1);
      gb.box('ledy', px + ix * 0.065, Y + 1.62, pz + iz * 0.065, alongX ? 0.4 : 0.01, 0.06, alongX ? 0.01 : 0.4, 1);
      // lever (animated)
      const pivot = new THREE.Group();
      pivot.position.set(px + ix * 0.1, Y + 1.25, pz + iz * 0.1);
      pivot.rotation.y = WALL_ROT[w.d];
      const lg = new THREE.BoxGeometry(0.05, 0.28, 0.05).translate(0, 0.14, 0.03);
      const kg = new THREE.BoxGeometry(0.1, 0.07, 0.07).translate(0, 0.29, 0.03);
      hz.geometries.push(lg, kg);
      const lm = new THREE.MeshLambertMaterial({ color: 0x303030 }), km = new THREE.MeshLambertMaterial({ color: 0xc02020 });
      hz.materials.push(lm, km);
      const lever = new THREE.Group();
      lever.add(new THREE.Mesh(lg, lm), new THREE.Mesh(kg, km));
      lever.rotation.x = 0.9;
      pivot.add(lever);
      pivot.userData.setPiece = true;
      group.add(pivot); hz.own(pivot);
      const b = {
        i: hz.breakers.length, room: r.id, emitters: ems, on: false, lever, ip: null,
        panelPos: new THREE.Vector3(px + ix * 0.25, Y + 1.35, pz + iz * 0.25),
        period: rr.float(2.5, 5), phase: rr.float(0, 5), seed: rr.int(1, 0x7ffffff), cycle: null, flash: null, flashT: 0,
      };
      for (const e of ems) { e.enabled = false; e.flicker = Math.max(e.flicker || 0, 0.15); }
      ctx.zones.push({ type: 'dark', pos: new THREE.Vector3((rc.x0 + rc.x1) / 2, Y + 1, (rc.z0 + rc.z1) / 2), radius: Math.hypot(rc.x1 - rc.x0, rc.z1 - rc.z0) / 2, cells: [], room: r.id, breaker: b.i });
      // bonus loot in the dark
      for (let k = 0; k < 3; k++) ctx.scrapSpots.push({ x: rr.float(rc.x0 + 0.9, rc.x1 - 0.9), y: Y, z: rr.float(rc.z0 + 0.9, rc.z1 - 0.9), room: r.id, type: r.type, dist: K.roomDist(r) });
      hz.breakers.push(b);
    }
  }

  // ---------------------------------------------------------------------------- cave-ins
  {
    const want = rate(CAVE_RATE);
    const cand = [];
    for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
      const i = L.idx(x, z);
      if (L.cells[i] !== 2 || L.distOf[i] <= 5 || used.has(i) || K.cellHasDoorway(x, z)) continue;
      cand.push([x, z]);
    }
    rCave.shuffle(cand);
    const placed = [];
    const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
    hz.geometries.push(chunkGeo);
    const chunkMat = ctx.levelMaterial(theme === 'backrooms' ? 'ceiling_stained' : theme === 'sewer' ? 'sewer_brick' : theme === 'mineshaft' ? 'rock' : 'concrete_dark', {});
    for (const [x, z] of cand) {
      if (placed.length >= want) break;
      if (!far(x, z, placed, 7)) continue;
      const rc = K.cellRect(x, z), i = L.idx(x, z);
      if (ventHit(rc.x0, rc.z0, rc.x1, rc.z1)) continue;   // never stack a cave-in on a steam jet
      const ceil = Y + (L.heightOf[i] || 3.3);
      const cx = rc.x0 + C / 2, cz = rc.z0 + C / 2;
      const r = rCave.fork('c' + placed.length);
      // cracked ceiling patch + a few loose bits hanging (the tell)
      gb.hrect('crack', cx - 1.4, cz - 1.4, cx + 1.4, cz + 1.4, ceil - 0.012, false, 0.6, [0.45, 0.42, 0.4]);
      for (let k = 0; k < 4; k++) gb.box('crack', cx + r.float(-1, 1), ceil - 0.08, cz + r.float(-1, 1), r.float(0.15, 0.35), 0.12, r.float(0.15, 0.35), 1, [0.5, 0.48, 0.45]);
      const c = {
        i: hz.caves.length, x, z, cx, cz, ceil, state: 0, t: 0, dustT: 0, fallT: 0, hitPending: false, chunks: [],
        trigger: { x0: rc.x0 + 0.7, z0: rc.z0 + 0.7, x1: rc.x1 - 0.7, z1: rc.z1 - 0.7 },
        impact: { x0: rc.x0 + 0.25, z0: rc.z0 + 0.25, x1: rc.x1 - 0.25, z1: rc.z1 - 0.25 },
      };
      const n = 7;
      for (let k = 0; k < n; k++) {
        const s = r.float(0.3, 0.75);
        const m = new THREE.Mesh(chunkGeo, chunkMat);
        m.scale.set(s * r.float(0.8, 1.4), s * r.float(0.5, 0.9), s * r.float(0.8, 1.4));
        const px = cx + r.float(-1.3, 1.3), pz = cz + r.float(-1.3, 1.3);
        m.position.set(px, ceil - s / 2, pz);
        m.visible = false;
        m.userData.setPiece = true;
        group.add(m); hz.own(m);
        c.chunks.push({ mesh: m, y0: ceil - s / 2, y1: Y + m.scale.y / 2 - 0.02, rx: r.float(-0.5, 0.5), ry: r.float(0, Math.PI), rz: r.float(-0.5, 0.5) });
      }
      hz.caves.push(c);
      placed.push([x, z]);
      used.add(i);
    }
  }

  // ---------------------------------------------------------------------------- vent shortcuts
  if (theme !== 'mineshaft') {
    const want = size >= 1.6 ? 2 : 1;
    const ends = [];
    for (const r of rVent.shuffle(L.rooms.filter((q) => !SPECIAL_ROOMS.has(q.type) && !q.arena && !q.maze && K.roomDist(q) >= 2))) {
      const rr = rVent.fork('v' + r.id);
      for (const w of rr.shuffle(K.solidWalls(r))) {
        if (K.cellHasDoorway(w.x, w.z)) continue;
        const along = rr.sign() * 1.35;
        const [px, pz] = K.wallPoint(w.x, w.z, w.d, along, 0.06);
        const [sx, sz] = K.wallPoint(w.x, w.z, w.d, along, 1.15);
        if (propHit(px - 0.5, pz - 0.5, px + 0.5, pz + 0.5, Y + 0.05, Y + 1.2)) continue;
        if (!nav.walkableAt(sx, sz) || !navClear(nav, sx - 0.3, sz - 0.3, sx + 0.3, sz + 0.3, 0)) continue;
        ends.push({ r, w, px, pz, sx, sz });
        break;
      }
    }
    const minD = Math.max(8, Math.round(K.W / 4));
    const taken = new Set();
    for (let a = 0; a < ends.length && hz.vents.length < want; a++) {
      if (taken.has(a)) continue;
      for (let b = a + 1; b < ends.length; b++) {
        if (taken.has(b)) continue;
        const A = ends[a], B = ends[b];
        if (Math.abs(A.r.cx - B.r.cx) + Math.abs(A.r.cz - B.r.cz) < minD) continue;
        taken.add(a); taken.add(b);
        const mk = (E) => {
          const [ix, iz] = INWARD[E.w.d];
          ctx.placeProp('vent_cover', E.px, Y + 0.3, E.pz, WALL_ROT[E.w.d]);
          // green "crawlspace" LED above the vent (tells it apart from the creature vents)
          gb.box('ledg', E.px + ix * 0.03, Y + 1.1, E.pz + iz * 0.03, E.w.d % 2 ? 0.25 : 0.03, 0.06, E.w.d % 2 ? 0.03 : 0.25, 1);
          return {
            room: E.r.id, roomType: E.r.type, pos: new THREE.Vector3(E.px, Y + 0.5, E.pz),
            ipPos: new THREE.Vector3(E.px + ix * 0.35, Y + 0.65, E.pz + iz * 0.35),
            spawn: new THREE.Vector3(E.sx, Y + 0.05, E.sz), yaw: Math.atan2(-ix, -iz), ip: null,
          };
        };
        hz.vents.push({ i: hz.vents.length, a: mk(A), b: mk(B) });
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------- toxic sludge
  for (const r of L.rooms) {
    if (r.type !== 'sludge_pit') continue;
    const rc = K.roomRect(r);
    const pit = { x0: rc.x0 + 1.5, z0: rc.z0 + 1.5, x1: rc.x1 - 1.5, z1: rc.z1 - 1.5 };
    if (pit.x1 - pit.x0 < 2 || pit.z1 - pit.z0 < 2) continue;
    const y = Y + 0.16;
    const mesh = surfacePlane(group, ctx.levelMaterial, 'sludge', pit, y, { opacity: 0.92, color: 0xb8ff90, emissive: 0x1f4a0c, uv: 0.35 });
    hz.own(mesh); hz.geometries.push(mesh.geometry);
    const u = mesh.geometry.attributes.uv;
    const base = new Float32Array(u.count * 2);
    for (let k = 0; k < u.count; k++) { base[k * 2] = u.getX(k); base[k * 2 + 1] = u.getY(k); }
    u.setUsage(THREE.DynamicDrawUsage);
    // rim
    for (const [a, b, c2, d] of [[pit.x0, pit.z0, pit.x1, pit.z0 + 0.15], [pit.x0, pit.z1 - 0.15, pit.x1, pit.z1], [pit.x0, pit.z0, pit.x0 + 0.15, pit.z1], [pit.x1 - 0.15, pit.z0, pit.x1, pit.z1]]) gb.box('rim', (a + c2) / 2, Y + 0.06, (b + d) / 2, c2 - a, 0.12, d - b, 1);
    ctx.zones.push({ type: 'water', min: [pit.x0, pit.z0], max: [pit.x1, pit.z1], y, room: r.id });
    ctx.zones.push({ type: 'toxic', min: [pit.x0, pit.z0], max: [pit.x1, pit.z1], y, room: r.id });
    ctx.emitters.push({ pos: new THREE.Vector3((pit.x0 + pit.x1) / 2, Y + 0.9, (pit.z0 + pit.z1) / 2), color: 0x70ff40, intensity: 0.9, distance: 10, group: 'facility', flicker: 0.08 });
    const rs = rSludge.fork('s' + r.id);
    for (let k = 0; k < 2; k++) ctx.scrapSpots.push({ x: rs.float(pit.x0 + 0.6, pit.x1 - 0.6), y: Y, z: rs.float(pit.z0 + 0.6, pit.z1 - 0.6), room: r.id, type: 'sludge', dist: K.roomDist(r) });
    hz.sludge.push({ i: hz.sludge.length, rect: pit, y, cx: (pit.x0 + pit.x1) / 2, cz: (pit.z0 + pit.z1) / 2, mesh, base, t: 0, bubbleT: 0 });
  }

  // ---------------------------------------------------------------------------- merged static parts
  const lm = ctx.levelMaterial;
  const mats = {
    post: () => lm('metal_dark', {}),
    panel: () => lm('hazard_stripes', {}),
    led: () => lm('paint', { color: 0xff3030, emissive: 0xc01010 }),
    ledy: () => lm('paint', { color: 0xffc030, emissive: 0xa06000 }),
    ledg: () => lm('paint', { color: 0x40ff60, emissive: 0x10a020 }),
    crack: () => lm('concrete_dark', { vertexColors: true }),
    rim: () => lm('concrete_dark', {}),
  };
  const built = gb.build((key) => (mats[key] ? mats[key]() : lm(key.split(':')[1], { vertexColors: key.startsWith('f:') })));
  if (built.children.length) { built.name = 'hazards'; built.userData.setPiece = true; group.add(built); hz.own(built); for (const m of built.children) hz.geometries.push(m.geometry); }
  return hz;
}
