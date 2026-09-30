// MAPART (wave 6, module 'mapart'; docs/wave6/mapart.md): the signature layer of every regular outdoor moon - The Algorithm's presence
// (watching pylons, LIVE holo-panels, camera drones, glitch scars, ad billboards) + the Company's decay (crashed pods, survey rigs, crew camps,
// warning signs, quarantine tape) + one big biome landmark + a horizon silhouette ring. Layout: mapart_core.planMapArt (seeded per moon + seed,
// every peer rebuilds it); visuals: mapart_art.js / mapart_lm.js (merged geometry, no lights).
// Three small interactions, all host-authoritative (client -> host 'mareq', host -> everyone 'mast'):
//   pylon   [E] cut the feed: the Algorithm cannot see you for 60 s = the host freezes its creature spawn timers (once per pylon)
//   billboard  shoot / hit it: the ad jingle stops for everyone, the screen shows ERROR 404
//   drone   3 hits (bullets or a jumping swing) knock a camera drone down: a crafting component drops
import * as THREE from 'three';
import { HOST_ONLY } from '../net/session.js';
import { MOONS } from './moons.js';
import { G } from '../physics/physics.js';
import { synth, sin, ex } from './combat_kit.js';
import * as C from './mapart_core.js';
import { buildArt } from './mapart_art.js';
import { buildHorizon } from './mapart_lm.js';
import { JOURNALS, tx, x, xf } from './mapart_text.js';

HOST_ONLY.add('mast');

const JINGLE = [523, 659, 784, 659, 880, 0, 784, 1047];
const SOUNDS = {
  ma_jingle: (sr) => synth(sr, 1.15, (tt) => {
    const i = Math.floor(tt / 0.13), f = JINGLE[i] || 0, l = tt - i * 0.13;
    return f ? (Math.sin(6.2832 * f * tt) > 0 ? 0.32 : -0.32) * ex(l, 9) + sin(f * 2, tt) * 0.1 * ex(l, 14) : 0;
  }),
  ma_off: (sr) => synth(sr, 0.9, (tt) => sin(220 * Math.exp(-tt * 3.4) + 40, tt) * ex(tt, 3) + (Math.random() - 0.5) * 0.25 * ex(tt, 9)),
};

export function installMapArt(game) {
  const mods = game.mods;
  if (!mods) return null;
  const offs = [], cols = [];
  let map = null, disposed = false, lastNet = null, syncAsked = false, offEnd = 0, hostShotT = new Map();
  const players = [];
  const _f = new THREE.Vector3(), _v = new THREE.Vector3();
  const say = (s, kind = 'info') => { try { game.ui?.toast?.(s, kind); } catch { /* ui optional */ } };
  const chat = (s) => { try { game.ui?.systemMessage?.(s, 'info'); } catch { /* ui optional */ } };
  const posOf = (from) => (from === game.selfId ? game.player?.pos : game.remotes?.get(from)?.pos);
  const snd = (name, pos, vol = 0.8) => { try { mods.ensureSound?.(name); if (pos) game.audio?.at?.(name, pos, vol, { refDistance: 6, maxDistance: 70 }); else game.audio?.play?.(name, { volume: vol }); } catch { /* audio optional */ } };
  if (mods.soundGens) for (const [n, fn] of Object.entries(SOUNDS)) if (!mods.soundGens.has(n)) mods.soundGens.set(n, fn);

  // ------------------------------------------------------------------ build
  function clear() {
    if (map) { try { map.art.dispose(); } catch { /* ignore */ } try { map.horizon?.geometry.dispose(); map.horizon?.material.dispose(); map.horizon?.removeFromParent(); } catch { /* ignore */ } }
    for (const c of cols.splice(0)) { try { game.physics.removeCollider(c); } catch { /* gone with the world */ } }
    map = null; syncAsked = false; offEnd = 0; hostShotT.clear();
  }
  function onMapLoaded(world) {
    clear();
    const out = world?.outdoor, moon = MOONS[world?.moonId];
    if (disposed || !out || !moon || world.company || moon.customMap || !out.plan || !out.terrain?.heightAt || !out.group) return;
    const terrain = out.terrain, plan = out.plan, b = plan.biome || {};
    const trees = (out.harvest?.trees || []).concat(out.harvest?.rocks || []);
    const scrap = out.decor?.scrapSpots || [];
    const extraOk = (px, pz, r) => {
      if (terrain.lavaDepthAt && terrain.lavaDepthAt(px, pz) > -0.6) return false;
      if (out.solidAt && out.solidAt(px, pz, Math.min(r, 2.5))) return false;   // [pacing] compact maps are denser: keep off rocks / POI solids too
      for (const t of trees) if (Math.abs(t.x - px) < r + 2 && Math.abs(t.z - pz) < r + 2 && Math.hypot(t.x - px, t.z - pz) < r + 1.6) return false;
      for (const s of scrap) if (Math.hypot(s.x - px, s.z - pz) < r + 3) return false;
      return true;
    };
    const specs = C.planMapArt({
      seed: world.seed | 0, moonId: world.moonId, decor: b.decor, biomeId: moon.biome, sc: terrain.scale || 1, plan, pathPts: terrain.pathPts,
      heightAt: (px, pz) => terrain.heightAt(px, pz), ok: out.avoid || null, extraOk, floodY: b.flood ?? null,
    });
    if (!specs.length) return;
    const accent = b.grid ?? b.planet ?? 0x2af4ff;
    const art = buildArt(specs, { h: (px, pz) => terrain.heightAt(px, pz), seed: world.seed | 0, accent });
    out.group.add(art.group);
    for (const c of art.colliders) {
      try { cols.push(game.physics.addStaticBox(c.x, c.y, c.z, c.sx / 2, c.sy / 2, c.sz / 2, c.ry, G.STATIC, c.data || { kind: 'prop' })); } catch (e) { console.warn('[mapart] collider', e); }
    }
    const fam = C.familyOf(b.decor, moon.biome);
    let horizon = null;
    try { horizon = buildHorizon(fam, world.seed | 0, terrain.scale || 1); out.group.add(horizon); } catch (e) { console.warn('[mapart] horizon', e); }
    map = { key: `${world.moonId}|${world.seed}`, seed: world.seed | 0, out, specs, art, horizon, fam, st: C.newState(specs), byId: new Map(specs.map((s) => [s.id, s])), tune: 0 };
  }

  // ------------------------------------------------------------------ host rules
  function hostReq(d, from) {
    if (!game.isHost || !map || !d || d.s !== map.seed || game.run?.phase !== 'moon') return;
    const pp = posOf(from);
    if (!pp) return;
    const P = [pp.x, pp.y, pp.z], net = game.net, now = game.time;
    if (d.op === 'sab') {
      const p = map.art.pylons.get(d.id);
      if (!p || !C.inReach(P, [p.pos.x, p.pos.y, p.pos.z], C.REACH.use + 1.5)) return;
      const r = C.sabotage(map.st, d.id, now);
      if (!r.ok) return;
      net.broadcast('mast', { s: map.seed, k: 'off', id: d.id, sec: Math.round(r.sec) });
    } else if (d.op === 'hit') {
      const t = d.k === 'd' ? map.art.drones.get(d.id) : map.art.boards.get(d.id);
      if (!t) return;
      const c = t.pos;
      if (!C.inReach(P, [c.x, c.y, c.z], C.REACH.melee + 2.5)) return;
      applyHit(d.k, d.id);
    }
  }
  function applyHit(k, id) {
    const net = game.net;
    if (k === 'd') {
      const r = C.hitDrone(map.st, id);
      if (!r.ok) return;
      net.broadcast('mast', { s: map.seed, k: 'drone', id, hp: r.hp });
      if (r.dead) {
        const dr = map.art.drones.get(id), at = new THREE.Vector3(dr.pos.x, map.byId.get(id).gy + 0.5, dr.pos.z);
        try { game.items?.hostSpawn?.(C.droneLoot(map.seed, id), at, { linvel: [0, 1.2, 0] }); } catch (e) { console.warn('[mapart] loot', e); }
      }
    } else {
      const r = C.hitBoard(map.st, id);
      if (r.ok) net.broadcast('mast', { s: map.seed, k: 'board', id });
    }
  }
  /** every peer sees every shooter's tracer ('fx' cb/tr {a: muzzle, b: end}); the host tests the segment against the live targets */
  function hostShot(d, from) {
    if (!game.isHost || !map || game.run?.phase !== 'moon' || !Array.isArray(d.a) || !Array.isArray(d.b)) return;
    const pp = posOf(from);
    if (!pp || Math.hypot(pp.x - d.a[0], pp.y - d.a[1], pp.z - d.a[2]) > 6) return;
    const now = game.time;
    if (now - (hostShotT.get(from) ?? -9) < 0.05) return;
    hostShotT.set(from, now);
    if (Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1], d.b[2] - d.a[2]) > C.REACH.shot + 10) return;
    for (const [id, dr] of map.art.drones) if (!dr.dead && C.segNear(d.a, d.b, [dr.pos.x, dr.pos.y, dr.pos.z], 1.4)) applyHit('d', id);
    for (const [id, bb] of map.art.boards) if (!bb.silenced && !map.st.boards[id] && C.segNear(d.a, d.b, [bb.pos.x, bb.pos.y, bb.pos.z], 3.0)) applyHit('b', id);
  }

  // ------------------------------------------------------------------ client
  function onState(d) {
    if (!map || !d || d.s !== map.seed) return;
    const art = map.art;
    switch (d.k) {
      case 'off': {
        art.setPylonOff(d.id, true);
        offEnd = Math.max(offEnd, game.time + (+d.sec || C.OFF_SEC));
        const p = art.pylons.get(d.id);
        snd('ma_off', p?.pos, 0.9);
        say(xf('m.off', { s: Math.round(+d.sec || C.OFF_SEC) }), 'good');
        chat(x('m.off.chat'));
        break;
      }
      case 'drone': {
        const dr = art.drones.get(d.id);
        if (!dr) break;
        dr.hp = d.hp;
        if (d.hp <= 0) { art.knockDrone(d.id); snd('hit_metal', dr.pos, 0.9); say(x('m.drone'), 'good'); }
        else { art.hitDroneFx(d.id); snd('hit_metal', dr.pos, 0.6); }
        break;
      }
      case 'board': {
        art.setBoardSilenced(d.id);
        const b = art.boards.get(d.id);
        snd('hit_metal', b?.pos, 0.8);
        break;
      }
      case 'sync': {
        for (const id of d.py || []) art.setPylonOff(id, true);
        for (const id of d.bd || []) art.setBoardSilenced(id);
        for (const [id, hp] of Object.entries(d.dr || {})) { const dr = art.drones.get(id); if (dr) { dr.hp = hp; if (hp <= 0) art.knockDrone(id); } }
        if (d.off > 0) offEnd = game.time + d.off;
        break;
      }
      default:
    }
  }
  function bindNet(net) {
    lastNet = net;
    net.on_('mast', (d) => onState(d));
    net.handle('mareq', (d, from) => hostReq(d, from));
    net.handle('masync', (d, from) => {
      if (!game.isHost || !map || d.s !== map.seed) return;
      const st = map.st, now = game.time;
      game.net.sendTo(from, 'mast', { s: map.seed, k: 'sync', py: Object.keys(st.pylons).filter((i) => st.pylons[i]), bd: Object.keys(st.boards).filter((i) => st.boards[i]), dr: st.drones, off: Math.round(C.offLeft(st, now)) });
    });
  }
  const request = (extra) => game.net.request('mareq', { s: map.seed, ...extra });

  // ---- prompts
  offs.push(mods.on('interactables', (list, g) => {
    if (g !== game || !map) return;
    const p = game.player;
    if (!p || p.dead || p.indoor) return;
    for (const [id, py] of map.art.pylons) {
      const dx = p.pos.x - py.pos.x, dz = p.pos.z - py.pos.z;
      if (dx * dx + dz * dz > 49) continue;
      list.push({ pos: py.pos, r: 1.4, reach: 3.2, label: py.off ? x('p.sab.done') : x('p.sab'), sub: '', action: () => { if (py.off) say(x('p.sab.done'), 'warn'); else request({ op: 'sab', id }); } });
    }
    for (const c of map.art.camps.values()) {
      const dx = p.pos.x - c.pos.x, dz = p.pos.z - c.pos.z;
      if (dx * dx + dz * dz > 25) continue;
      list.push({ pos: c.pos, r: 1.0, reach: 2.8, label: x('j.read'), sub: '', action: () => {
        const txt = tx(JOURNALS[c.spec.journal % JOURNALS.length]);
        game.ui?.hud?.bigText?.(x('j.title'), txt); chat(txt); game.sfx?.('item_pickup', 0.3);
      } });
    }
  }));

  // ---- melee: a swing that lands on a low drone / billboard is a hit request (the original swing still runs)
  function onSwing(h) {
    if (!map || game.player?.indoor) return;
    const eye = game.camera.position, fwd = _f.set(0, 0, -1).applyQuaternion(game.camera.quaternion);
    const reach = (h?.reach || 2.4) + 0.5, a = [eye.x, eye.y, eye.z], b = [eye.x + fwd.x * reach, eye.y + fwd.y * reach, eye.z + fwd.z * reach];
    for (const [id, dr] of map.art.drones) if (!dr.dead && C.segNear(a, b, [dr.pos.x, dr.pos.y, dr.pos.z], 1.3)) { request({ op: 'hit', k: 'd', id }); return; }
    for (const [id, bb] of map.art.boards) if (!bb.silenced && C.segNear(a, b, [bb.pos.x, bb.pos.y, bb.pos.z], 2.6)) { request({ op: 'hit', k: 'b', id }); return; }
  }
  const origMelee = game.resolveMelee;
  if (typeof origMelee === 'function') game.resolveMelee = function (h) { try { onSwing(h); } catch (e) { console.warn('[mapart] swing', e); } return origMelee.call(this, h); };

  offs.push(mods.on('fx', (d, from) => { if (d && d.k === 'cb' && d.t === 'tr') { try { hostShot(d, from); } catch (e) { console.warn('[mapart] shot', e); } } }));

  // ---- per frame
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed || !map) return;
    if (game.world?.outdoor !== map.out) { clear(); return; }
    const p = game.player, now = game.time;
    if (!syncAsked && !game.isHost && game.net?.connected && game.run?.phase === 'moon') { syncAsked = true; game.net.request('masync', { s: map.seed }); }
    if (offEnd && now >= offEnd) { offEnd = 0; say(x('m.off.end'), 'warn'); }
    // host: while any pylon is cut the creature spawn timers stand still (host.js subtracts dt each frame, we add it back)
    if (game.isHost && game.run?.phase === 'moon' && C.offActive(map.st, now)) {
      const hd = game.hostData;
      if (hd) { hd.spawnT = (hd.spawnT || 0) + dt; hd.outdoorSpawnT = (hd.outdoorSpawnT || 0) + dt; }
    }
    if (!p || p.indoor) return;
    players.length = 0;
    if (!p.dead) players.push(p.pos);
    for (const r of game.remotes?.values?.() || []) if (r.pos && !r.dead) players.push(r.pos);
    map.art.update(dt, now, game.camera, players);
    // horizon follows the fog colour (day / night / weather) so the skyline always reads as distant dark shapes
    if (map.horizon) {
      const fog = game.scene?.fog;
      if (fog?.color) { map.horizon.material.color.copy(fog.color).multiplyScalar(0.5); }
    }
    // ad jingles: nearby, un-silenced billboards hum their tune every ~10 s
    for (const b of map.art.boards.values()) {
      if (b.silenced) continue;
      const dx = p.pos.x - b.pos.x, dz = p.pos.z - b.pos.z;
      if (dx * dx + dz * dz > 1600) continue;
      b.jingleT -= dt;
      if (b.jingleT <= 0) { b.jingleT = 9 + Math.random() * 6; snd('ma_jingle', b.pos, 0.55); }
    }
  }));
  offs.push(mods.on('netReady', (net) => bindNet(net)));
  offs.push(mods.on('mapLoaded', (world, g) => { if (g === game) onMapLoaded(world); }));
  if (game.net && game.net !== lastNet) { try { bindNet(game.net); } catch { /* netReady binds it */ } }

  return {
    /** current layout: [{ id, kind, x, y, z, ... }] */
    plan: () => map?.specs || [],
    state: () => map?.st || null,
    art: () => map?.art || null,
    offStream: () => !!map && C.offActive(map.st, game.time),
    family: () => map?.fam || null,
    hostReq, hostShot, onMapLoaded,
    dispose() {
      disposed = true;
      clear();
      for (const off of offs.splice(0)) { try { off?.(); } catch { /* ignore */ } }
      if (game.resolveMelee !== origMelee && Object.prototype.hasOwnProperty.call(game, 'resolveMelee')) delete game.resolveMelee;
    },
  };
}
