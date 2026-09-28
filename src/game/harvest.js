// HARVESTING (wave 1, worldx): outdoor trees and rocks can be chopped / mined. Hold E on one with a melee weapon or tool
// (chop progress), or simply swing a weapon at it (LMB: game.resolveMelee is wrapped, the original still runs).
// Host-authoritative HP per tree / rock (per map, synced + late-join sync); the tree falls with a simple rotation
// animation and drops wood, rocks drop scrap metal and now and then a data crystal.
//
//   installHarvest(game, api) -> { onMapLoaded(world), addInteractables(out), update(dt), bindNet(net), hostHit(id, dmg, by),
//                                  info(id), nearest(pos, kind), dispose() }
//
// Trees / rocks come from terrain.js (world.outdoor.harvest = { trees, rocks }): placements with { id, x, y, z, scale, rot,
// inst:[{mesh, k}] (instanced mesh slots), cols:[collider] } - identical on every peer (seeded), so ids match.
// Drops: game.crafting?.dropComponents?.(pos, 'wood' | 'metal', n) when the crafting module provides it, otherwise the
// components (comp_wood / comp_scrapmetal / comp_crystal) are spawned directly.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { ITEMS } from './items.js';
import { G } from '../physics/physics.js';
import { t } from '../core/i18n.js';

const MSG_HP = 'wxHp', MSG_FELL = 'wxFell', REQ_HIT = 'wxHit', REQ_SYNC = 'wxHSync';
const CHOP_EVERY = 0.5;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** damage multiplier of a held item against 'tree' / 'rock' (0 = cannot harvest with it) */
export function toolPower(def, kind) {
  if (!def) return 0;
  const id = def.id || '';
  const melee = def.kind === 'weapon' && !def.ranged;
  const tool = /axe|hatchet|saw|pick|hammer|crowbar|shovel|wrench/.test(id) || melee;
  if (!tool) return 0;
  if (kind === 'tree') return /axe|hatchet|saw/.test(id) ? 3 : /machete/.test(id) ? 1.4 : 1;
  return /pick|sledge|hammer/.test(id) ? 2.6 : /crowbar|shovel/.test(id) ? 0.9 : 0.55;
}
const hpFor = (p) => (p.kind === 'tree' ? 50 + 30 * p.scale : 90 + 50 * p.scale);

export function installHarvest(game, api) {
  const state = new Map();      // id -> { hp, max, fallen }
  const falling = [];           // running fall animations
  let map = null;               // { seed, outdoor, byId }
  let hold = null;              // { key, id, t, next }
  let syncAsked = false;
  const lastHit = new Map();    // host: 'from|id' -> time
  let time = 0;
  const _v = new THREE.Vector3(), _f = new THREE.Vector3();
  const posOf = (from) => (from === game.selfId ? game.player?.pos : game.remotes?.get(from)?.pos);

  function clear() {
    for (const f of falling.splice(0)) f.group.removeFromParent();
    state.clear(); lastHit.clear();
    map = null; hold = null; syncAsked = false;
  }
  function onMapLoaded(world) {
    clear();
    const h = world?.outdoor?.harvest;
    if (!h) return;
    const byId = new Map();
    for (const p of h.trees.concat(h.rocks)) byId.set(p.id, p);
    map = { seed: world.seed | 0, outdoor: world.outdoor, byId };
  }
  const st = (p) => { let s = state.get(p.id); if (!s) { const max = hpFor(p); s = { hp: max, max, fallen: false }; state.set(p.id, s); } return s; };

  // ---- fall (all peers) -------------------------------------------------------------------------------------------
  function fell(p, ang, animate) {
    const s = st(p);
    if (s.fallen) return;
    s.fallen = true; s.hp = 0; p.fallAng = ang;
    for (const c of p.cols || []) { game.physics.removeCollider(c); const i = map.outdoor.colliders.indexOf(c); if (i >= 0) map.outdoor.colliders.splice(i, 1); }
    p.cols = [];
    const g = new THREE.Group();
    g.position.set(p.x, p.y, p.z);
    const inv = new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z), m4 = new THREE.Matrix4();
    for (const { mesh, k } of p.inst || []) {
      mesh.getMatrixAt(k, m4);
      const child = new THREE.Mesh(mesh.geometry, mesh.material);
      child.matrixAutoUpdate = false;
      child.matrix.copy(inv).multiply(m4);
      g.add(child);
      mesh.setMatrixAt(k, ZERO);
      mesh.instanceMatrix.needsUpdate = true;
    }
    map.outdoor.group.add(g);
    if (p.kind === 'rock') {
      // rocks just crumble: the shell shrinks away while a dust puff hides the swap
      falling.push({ group: g, t: 0, dur: 0.6, rock: true, p });
    } else {
      falling.push({ group: g, t: animate ? 0 : 1, dur: 1.3, axis: new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang)), p, dust: false });
      if (!animate) g.quaternion.setFromAxisAngle(new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang)), Math.PI / 2 * 0.97);
    }
    if (animate) {
      _v.set(p.x, p.y + 1, p.z);
      try { game.audio?.at?.(p.kind === 'tree' ? 'door_creak' : 'hit_metal', _v, 0.9, { refDistance: 6, maxDistance: 70 }); } catch { /* audio optional */ }
    }
  }

  // ---- host ----------------------------------------------------------------------------------------------------------
  function drops(p, by) {
    const R = new RNG((Math.random() * 4294967296) >>> 0);
    const pos = new THREE.Vector3(p.x, p.y + 0.9, p.z);
    const kind = p.kind === 'tree' ? 'wood' : 'metal';
    const n = p.kind === 'tree' ? R.int(2, 4) + (p.scale > 1.15 ? 1 : 0) : R.int(1, 3);
    let handled = false;
    if (typeof game.crafting?.dropComponents === 'function') {
      try { game.crafting.dropComponents(pos, kind, n); handled = true; } catch (e) { console.warn('dropComponents', e); }
    }
    if (!handled) {
      const id = p.kind === 'tree' ? 'comp_wood' : 'comp_scrapmetal';
      if (ITEMS[id]) for (let i = 0; i < n; i++) {
        const a = R.float(0, Math.PI * 2);
        game.items.hostSpawn(id, pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.5, i * 0.15, Math.sin(a) * 0.5)), { linvel: [Math.cos(a) * 1.6, R.float(2.2, 3.4), Math.sin(a) * 1.6] });
      }
    }
    if (p.kind === 'rock' && ITEMS.comp_crystal && R.chance(0.07)) game.items.hostSpawn('comp_crystal', pos, { tier: 'rare', linvel: [R.float(-1, 1), 3, R.float(-1, 1)] });
    if (by) game.net.broadcast('xp', { to: by, xp: p.kind === 'tree' ? 6 : 9, coin: 0, reason: p.kind === 'tree' ? 'Timber!' : 'Rock cracked' });
  }
  function hostHit(id, dmg, by = null) {
    if (!game.isHost || !map) return null;
    const p = map.byId.get(id);
    if (!p) return null;
    const s = st(p);
    if (s.fallen) return s;
    s.hp -= clamp(Number(dmg) || 0, 0, 200);
    if (s.hp <= 0) {
      const ang = Math.atan2(p.x - (posOf(by)?.x ?? 0), p.z - (posOf(by)?.z ?? 0));   // falls away from the chopper
      game.net.broadcast(MSG_FELL, { s: map.seed, id, a: +ang.toFixed(2) });
      drops(p, by);
      game.mods?.emit('tfg:harvested', { id, kind: p.kind, pos: [p.x, p.y, p.z], by });
    } else game.net.broadcast(MSG_HP, { s: map.seed, id, hp: Math.round(s.hp) });
    return s;
  }
  function onHitRequest(d, from) {
    if (!game.isHost || game.run?.phase !== 'moon' || !map || d.s !== map.seed) return;
    const p = map.byId.get(d.id);
    if (!p) return;
    const pp = posOf(from);
    if (!pp || Math.hypot(pp.x - p.x, pp.z - p.z) > 6 || Math.abs(pp.y - p.y) > 6) return;
    const k = from + '|' + d.id;
    if (time - (lastHit.get(k) ?? -9) < 0.15) return;
    lastHit.set(k, time);
    hostHit(d.id, d.d, from);
  }
  function bindNet(net) {
    net.on_(MSG_HP, (d) => {
      if (!map || d.s !== map.seed) return;
      const p = map.byId.get(d.id);
      if (!p) return;
      const s = st(p);
      s.hp = d.hp;
      _v.set(p.x, p.y + 1.2, p.z);
      try { game.audio?.at?.(p.kind === 'tree' ? 'hit_wall' : 'hit_metal', _v, 0.55, { refDistance: 4, maxDistance: 50, pitch: 0.9 + Math.random() * 0.2 }); } catch { /* audio optional */ }
      game.particles?.burst?.(_v, 'landpuff', null, 0.5);
    });
    net.on_(MSG_FELL, (d) => {
      if (!map || d.s !== map.seed) return;
      if (Array.isArray(d.list)) { for (const e of d.list) { const p = map.byId.get(e.id); if (p) fell(p, e.a, false); } return; }
      const p = map.byId.get(d.id);
      if (p) fell(p, d.a || 0, true);
    });
    net.handle(REQ_HIT, (d, from) => onHitRequest(d, from));
    net.handle(REQ_SYNC, (d, from) => {
      if (!game.isHost || !map || d.s !== map.seed) return;
      const list = [];
      for (const [id, s] of state) if (s.fallen) list.push({ id, a: map.byId.get(id)?.fallAng ?? 0 });
      if (list.length) game.net.sendTo(from, MSG_FELL, { s: map.seed, list });
    });
  }

  // ---- client: prompts, hold-E, swings -------------------------------------------------------------------------------
  function aimed() {
    const p = game.player;
    if (!p || p.dead || p.indoor || p.inShip || !map) return null;
    const eye = game.camera.position;
    _f.set(0, 0, -1).applyQuaternion(game.camera.quaternion);
    const hit = game.physics.raycast(eye, _f, 3.4, G.STATIC | G.DOOR, p.col);
    const kind = hit?.info?.kind;
    if (kind !== 'tree' && kind !== 'rock') return null;
    const pl = map.byId.get(hit.info.hid);
    if (!pl || st(pl).fallen) return null;
    return { p: pl, point: hit.point, dist: hit.distance };
  }
  const bar = (f) => { const n = Math.round(clamp(f, 0, 1) * 10); return '[' + '#'.repeat(n) + '-'.repeat(10 - n) + ']'; };
  function addInteractables(out) {
    const a = aimed();
    if (!a) return;
    const held = game.player.heldItem?.();
    const def = held ? ITEMS[held.type] : null;
    const power = toolPower(def, a.p.kind);
    const nm = a.p.kind === 'tree' ? t('tree') : t('rock');
    const s = st(a.p), key = 'h:' + a.p.id;
    const pos = new THREE.Vector3(a.point.x, a.point.y, a.point.z);
    if (power <= 0) { out.push({ pos, r: 0.9, reach: 3.4, label: `${nm[0].toUpperCase() + nm.slice(1)}`, sub: t('Hold a melee weapon or tool (E / swing) to harvest'), action: () => {} }); return; }
    out.push({
      pos, r: 0.9, reach: 3.4,
      label: () => `${a.p.kind === 'tree' ? t('Chop') : t('Mine')} ${nm} ${bar(1 - s.hp / s.max)} [${t('hold E')}]`,
      sub: a.p.kind === 'tree' ? t('Drops wood') : t('Drops scrap metal, sometimes a crystal'),
      action: Object.assign(() => { hold = { key, id: a.p.id, t: 0, next: 0 }; }, { __wx: key }),
    });
  }
  function sendHit(id, dmg) { game.net.request(REQ_HIT, { id, s: map.seed, d: Math.round(dmg) }); }
  function update(dt) {
    time += dt;
    if (!map) return;
    if (game.world?.outdoor !== map.outdoor) { clear(); return; }
    if (!syncAsked && !game.isHost && game.net?.connected && game.run?.phase === 'moon') { syncAsked = true; game.net.request(REQ_SYNC, { s: map.seed }); }
    if (hold) {
      const tgt = game.interactTarget;
      const p = map.byId.get(hold.id);
      if (!game.input?.isDown('interact') || tgt?.action?.__wx !== hold.key || game.player.dead || !p || st(p).fallen) hold = null;
      else {
        hold.t += dt;
        if (hold.t >= hold.next) {
          hold.next = hold.t + CHOP_EVERY;
          const held = game.player.heldItem?.(), def = held ? ITEMS[held.type] : null;
          const dmg = (def?.dmg || 10) * 0.5 * toolPower(def, p.kind);
          sendHit(p.id, Math.max(3, dmg));
          game.swingAnim = Math.max(game.swingAnim || 0, 0.6);
          game.engine?.punch?.(0.012, 0, 0);
        }
      }
    }
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      if (f.rock) {
        f.t += dt / f.dur;
        f.group.scale.setScalar(Math.max(0.001, 1 - f.t * f.t));
        if (f.t >= 1) { f.group.removeFromParent(); falling.splice(i, 1); }
        continue;
      }
      if (f.t < 1) {
        f.t = Math.min(1, f.t + dt / f.dur);
        const x = f.t;
        // accelerate, thump, tiny rebound
        const th = (Math.PI / 2) * 0.97 * (x < 0.85 ? (x / 0.85) ** 2 : 1 - Math.sin((x - 0.85) / 0.15 * Math.PI) * 0.03);
        f.group.quaternion.setFromAxisAngle(f.axis, th);
        if (x >= 0.85 && !f.dust) { f.dust = true; _v.set(f.p.x, f.p.y + 0.3, f.p.z).addScaledVector(new THREE.Vector3(f.axis.z, 0, -f.axis.x).multiplyScalar(-1), 4); game.particles?.burst?.(_v, 'landpuff', null, 1.6); game.engine?.shake?.(0.12); }
      }
    }
  }
  /** melee swing hook: a swing that lands on a tree / rock counts as a chop (the original resolveMelee still runs) */
  function onSwing(h) {
    const a = aimed();
    if (!a || a.dist > (h?.reach || 2.4) + 0.4) return;
    const held = game.player.heldItem?.(), def = held ? ITEMS[held.type] : null;
    const power = toolPower(def, a.p.kind);
    if (power <= 0) return;
    sendHit(a.p.id, Math.max(4, (Number(h?.dmg) || def?.dmg || 10) * power));
  }

  const orig = game.resolveMelee;
  if (typeof orig === 'function') game.resolveMelee = function (h) { try { onSwing(h); } catch (e) { console.warn('harvest swing', e); } return orig.call(this, h); };

  return {
    onMapLoaded, addInteractables, update, bindNet, hostHit,
    info: (id) => { const p = map?.byId.get(id); return p ? { ...st(p), kind: p.kind, x: p.x, y: p.y, z: p.z } : null; },
    nearest(pos, kind = 'tree') {
      let best = null, bd = 1e9;
      for (const p of map?.byId.values() || []) { if (p.kind !== kind || st(p).fallen) continue; const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2; if (d < bd) { bd = d; best = p; } }
      return best ? { id: best.id, x: best.x, y: best.y, z: best.z } : null;
    },
    dispose() { if (game.resolveMelee !== orig && Object.prototype.hasOwnProperty.call(game, 'resolveMelee')) delete game.resolveMelee; clear(); },
  };
}
