// [finish] MAPS2 WORLD (wave 3): the shared plumbing of the maps2 runtime parts (challenge rooms, Collapse / Migration events, stateful furniture).
//  * one net type `m2s` (host -> all state events, also delivered to the host itself) + request handler `m2` (client -> host ops)
//  * barriers (rubble / shutters): mesh + static collider + nav edge block, identical on every peer, animated drop
//  * host bookkeeping mirrored in game.run.m2s ({ sealed, used, done }) so late joiners rebuild the day's state on 'mapLoaded'
//  * small host helpers (loot drops, credits, creature spawns, banners)
// Everything lives in the facility built by world/facility.js (fac.m2 = spots + props); nothing here runs without a facility.
import * as THREE from 'three';
import { G } from '../physics/physics.js';
import { createRubble } from '../models/props2.js';
import { corridorSealEdges, sealInfo } from '../world/rooms2.js';
import { layoutKit } from '../world/interiors/common.js';
import { ITEMS, scrapTableFor } from './items.js';
import { CREATURES } from './creatures.js';

const DUST = { count: 26, color: [0x8a8478, 0xa89f90, 0x6a645a], speed: 3.2, up: 2.2, life: 0.9, size: 0.16, gravity: 4, drag: 2 };

export function createWorld(game, api) {
  const mods = game.mods;
  const offs = [];
  const W = {
    game, api, disposed: false,
    epoch:0,F: null, spots: [], byKey: new Map(), bar: new Map(), boundNet: null,
    hs: { sealed: {}, used: {}, done: {} },   // host mirror (also what run.m2s carries); sealed: id -> edge descriptor
    handlers: new Map(),                        // request op -> fn(d, from)
    stateFns: new Map(),                        // m2s kind -> fn(d)
    tickFns: [], mapFns: [], popFns: [], interFns: [],
  };
  let streaming=false;
  const deep = () => streaming || (game.run?.descent21?.depth|0)>0;
  const host = () => !!game.isHost && !deep();
  W.host = host;
  W.V = THREE.Vector3;

  // ------------------------------------------------------------------------------------------------ facility + spots
  W.fac = () => (!deep() && game.world?.facility?.layout ? game.world.facility : null);
  W.spotList = (k, room) => W.spots.filter((s) => s.k === k && (room === undefined || s.room === room));
  W.roomOf = (id) => W.F?.m2?.rooms?.find((r) => r.room === id) || null;
  W.challenge = () => W.F?.m2?.challenge || null;
  W.inRoom = (p, r, pad = 0) => !!r && p.pos.x > r.x0 - pad && p.pos.x < r.x1 + pad && p.pos.z > r.z0 - pad && p.pos.z < r.z1 + pad && Math.abs(p.pos.y - r.y) < 6;
  W.anchorColor = (obj, name, hex) => { const a = obj?.userData?.anchors?.[name]; const m = a?.children?.[0]?.material; if (m?.color) m.color.setHex(hex); return !!m; };
  W.sealEdges = () => {
    const F = W.F;
    if (!F) return [];
    if (F.m2?.sealEdges?.length) return F.m2.sealEdges;
    try { const K = layoutKit(F.layout); return corridorSealEdges(F.layout).map((k) => sealInfo(F.layout, K, k)); } catch { return []; }
  };

  // ------------------------------------------------------------------------------------------------ net
  W.send = (d) => { try { game.net.broadcast('m2s', d); } catch { /* net closing */ } };
  W.request = (op, d = {}) => { try { game.net.request('m2', { op, ...d }); } catch { /* net closing */ } };
  W.on = (kind, fn) => W.stateFns.set(kind, fn);
  W.handle = (op, fn) => W.handlers.set(op, fn);
  function onState(d, from) {
    if (W.disposed || deep() || !d || (from !== game.net?.hostId && from !== game.selfId)) return;
    try { W.stateFns.get(d.k)?.(d); } catch (e) { console.warn('[maps2] state', d.k, e); }
  }
  function bind(net) {
    if (!net || W.boundNet === net) return;
    W.boundNet?.off?.('msg:m2s', onState);
    W.boundNet = net; net.on('msg:m2s', onState);
  }
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bind(n); }));
  if (game.net) bind(game.net);
  offs.push(mods.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    H('m2', (d, from) => {
      if (!host() || !d) return;
      const p = game.aiPlayerById?.(from);
      if (!p || p.dead) return;
      try { W.handlers.get(d.op)?.(d, from, p); } catch (e) { console.error('m2', d.op, e); }
    });
  }));
  // host mirror -> run.m2s (late join + rebuild)
  W.persist = () => {
    if (!host() || !game.run) return;
    game.run.m2s = { sealed: Object.values(W.hs.sealed), used: Object.keys(W.hs.used), done: Object.keys(W.hs.done) };
    try { game.broadcastRun(['m2s']); } catch { /* not ready */ }
  };

  // ------------------------------------------------------------------------------------------------ text / fx helpers
  W.banner = (main, sub = '', kind = 'wave') => W.send({ k: 'banner', main, sub, kind });
  W.say = (text, kind = 'info') => { try { game.net.broadcast('sys', { text, kind }); } catch { /* ignore */ } };
  W.snd = (s, p, v = 0.8) => { try { game.net.broadcast('fx', { k: 'snd', s, p: [p.x, p.y, p.z], v }); } catch { /* ignore */ } };
  W.dust = (pos, mul = 1) => { try { game.particles?.burst(pos, DUST, null, mul); } catch { /* particles optional */ } };
  W.on('banner', (d) => { try { game.ui?.hud?.bigText?.(d.main, d.sub); } catch { /* hud optional */ } });
  W.on('shake', (d) => { try { const p = game.player?.pos; if (!p || !d.p || Math.hypot(p.x - d.p[0], p.z - d.p[2]) < (d.r || 30)) game.engine?.shake?.(d.n || 0.4); } catch { /* engine optional */ } });

  // ------------------------------------------------------------------------------------------------ barriers (rubble / shutters)
  // e: { key, x, z, dir, w, h, y, shutter?, seed? }  dir 0 = the wall runs along z (edge between (x,z) and (x+1,z))
  W.barrier = (id, e, instant = false) => {
    const F = W.F;
    if (!F || W.bar.has(id) || !e) return null;
    const obj = createRubble(Math.max(1.2, e.w), Math.max(2, e.h), e.seed || 1, !!e.shutter);
    obj.position.set(e.x, e.y + (instant ? 0 : 3.2), e.z);
    obj.rotation.y = e.dir === 0 ? Math.PI / 2 : 0;
    F.group.add(obj);
    let col = null;
    try {
      const hx = e.dir === 0 ? 0.4 : e.w / 2, hz = e.dir === 0 ? e.w / 2 : 0.4;
      col = game.physics?.addStaticBox(e.x, e.y + e.h / 2, e.z, hx, e.h / 2, hz, 0, G.STATIC, { kind: 'prop', id: 'm2seal' });
    } catch { /* physics optional (tests) */ }
    const had = F.nav?.blockedEdges?.has(e.key);
    if (e.key !== undefined) F.nav?.blockedEdges?.add(e.key);
    const b = { id, obj, col, e, had, fall: instant ? 0 : 1, y0: e.y };
    W.bar.set(id, b);
    return b;
  };
  W.unbarrier = (id) => {
    const b = W.bar.get(id);
    if (!b) return;
    W.bar.delete(id);
    b.obj.removeFromParent();
    if (b.col) { try { game.physics?.removeCollider(b.col); } catch { /* ignore */ } }
    if (b.e.key !== undefined && !b.had) W.F?.nav?.blockedEdges?.delete(b.e.key);
  };
  W.on('seal', (d) => {
    if (d.on === false) { W.unbarrier(d.id); return; }
    W.barrier(d.id, d.e, !!d.instant);
  });
  W.tickFns.push((dt) => {
    for (const b of W.bar.values()) {
      if (b.fall <= 0) continue;
      b.fall = Math.max(0, b.fall - dt * 2.2);
      const ease = b.fall * b.fall;
      b.obj.position.y = b.y0 + 3.2 * ease;
      if (b.fall === 0) {
        W.dust(new THREE.Vector3(b.e.x, b.y0 + 0.5, b.e.z), 1);
        try { const p = game.player?.pos; if (p && Math.hypot(p.x - b.e.x, p.z - b.e.z) < 30) game.engine?.shake?.(0.5); game.audio?.at?.('hit_metal', new THREE.Vector3(b.e.x, b.y0 + 1, b.e.z), 0.9, { refDistance: 6 }); } catch { /* audio optional */ }
      }
    }
  });
  /** host: seal an edge for everybody (also remembered for late joiners) */
  W.hostSeal = (id, e, persist = true) => {
    if (!host()) return;
    W.send({ k: 'seal', id, e, on: true });
    if (persist) { W.hs.sealed[id] = { id, e }; W.persist(); }
  };
  W.hostUnseal = (id) => {
    if (!host()) return;
    W.send({ k: 'seal', id, on: false });
    delete W.hs.sealed[id];
    W.persist();
  };
  W.hostDone = (room) => { W.hs.done[room] = 1; W.persist(); };
  W.isDone = (room) => !!W.hs.done[room];

  // ------------------------------------------------------------------------------------------------ host helpers
  W.alive = () => game.aiPlayers().filter((p) => !p.dead);
  W.indoors = () => game.aiPlayers().filter((p) => !p.dead && p.zone === 'in');
  W.nearSpot = (p, s, r = 4.5) => Math.hypot(p.pos.x - s.x, p.pos.z - s.z) <= r && Math.abs(p.pos.y - s.y) < 4;
  const scrapIds = () => scrapTableFor(W.F?.layout?.theme || 'factory').filter(([id]) => ITEMS[id] && id !== 'key' && ITEMS[id].kind === 'scrap' && (ITEMS[id].weight || 1) <= 30);
  W.loot = (at, n, minTier = 'rare') => {
    const table = scrapIds();
    if (!table.length) return;
    const tot = table.reduce((a, [, w]) => a + w, 0);
    for (let i = 0; i < n; i++) {
      let r = Math.random() * tot, id = table[0][0];
      for (const [k, w] of table) { r -= w; if (r <= 0) { id = k; break; } }
      const a = i * 2.1 + Math.random();
      game.items.hostSpawn(id, new THREE.Vector3(at.x + Math.cos(a) * 0.7, at.y + 0.8 + i * 0.15, at.z + Math.sin(a) * 0.7), { minTier });
    }
  };
  W.credits = (n) => { if (!game.run) return; game.run.credits = Math.max(0, (game.run.credits || 0) + n); try { game.broadcastRun(['credits']); } catch { /* ignore */ } };
  W.hurt = (id, dmg, cause) => { try { game.hostHurtPlayer(id, dmg, cause, null, null); } catch { /* ignore */ } };
  /** hostile 'in' creatures usable by the challenge rooms */
  W.spawn = (type, x, y, z, opts = {}) => {
    if (!CREATURES[type]) return null;
    try {
      const level = 1 + Math.floor((game.run?.quotaIndex || 0) / 4);
      const c = game.creatures.hostSpawn(type, new THREE.Vector3(x, y, z), { level, zone: 'in', state: 'run', ...opts });
      if (c) c.data.m2 = 1;
      return c;
    } catch (e) { console.warn('[maps2] spawn', type, e); return null; }
  };
  W.noise = (x, y, z, loud = 3.5) => { try { game.creatures.noise(new THREE.Vector3(x, y, z), loud); } catch { /* ignore */ } };
  W.crew = () => Math.max(1, Math.min(8, W.alive().length));
  W.day = () => game.run?.day || 0;

  // ------------------------------------------------------------------------------------------------ map lifecycle
  function onMap() {
    for (const id of [...W.bar.keys()]) W.unbarrier(id);
    W.F = null; W.spots = []; W.byKey.clear();
    const F = W.fac();
    if (!F) { W.hs = { sealed: {}, used: {}, done: {} }; for (const f of W.mapFns) { try { f(null); } catch { /* ignore */ } } return; }
    W.F = F;
    W.spots = F.m2?.spots || [];
    const seen = {};
    for (const s of W.spots) { const k = `${s.k}:${s.room}`; s.n = seen[k] = (seen[k] ?? -1) + 1; s.id = `${k}:${s.n}`; W.byKey.set(s.id, s); }
    // rebuild the day's state from the host mirror (run.m2s): every peer, late joiners too
    const st = game.run?.m2s;
    W.hs = { sealed: {}, used: {}, done: {} };
    if (st) {
      for (const s of st.sealed || []) { if (s?.e) { W.hs.sealed[s.id] = s; W.barrier(s.id, s.e, true); } }
      for (const u of st.used || []) W.hs.used[u] = 1;
      for (const d of st.done || []) W.hs.done[d] = 1;
    }
    for (const f of W.mapFns) { try { f(F); } catch (e) { console.warn('[maps2] map', e); } }
  }
  offs.push(mods.on('mapLoaded', (w, g) => { if (g === game) { streaming=false; if(!deep())onMap(); } }));
  offs.push(mods.on('facilityWillChange', (w,g) => { if(g!==game)return; streaming=true;W.epoch++; for(const id of [...W.bar.keys()])W.unbarrier(id); W.F=null;W.spots=[];W.byKey.clear(); }));
  offs.push(mods.on('facilityChanged', (w,g) => { if(g!==game)return;streaming=false;if(!deep())onMap(); }));
  offs.push(mods.on('moonPopulated', (g) => {
    if (g !== game || !host() || !W.F) return;
    W.hs = { sealed: {}, used: {}, done: {} };
    if (game.run) delete game.run.m2s;
    W.persist();
    for (const f of W.popFns) { try { f(); } catch (e) { console.warn('[maps2] populate', e); } }
  }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g !== game || !host()) return;
    if (ph === 'landing' || ph === 'takeoff' || ph === 'orbit') { W.hs = { sealed: {}, used: {}, done: {} }; if (game.run && game.run.m2s) { delete game.run.m2s; try { game.broadcastRun(['m2s']); } catch { /* ignore */ } } }
  }));
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || W.disposed || deep()) return;
    for (const f of W.tickFns) { try { f(dt); } catch (e) { if (!W._warned) { W._warned = 1; console.warn('[maps2] tick', e); } } }
  }));
  offs.push(mods.on('interactables', (list, g) => {
    if (g !== game || W.disposed || deep() || !W.F || !game.player?.indoor || game.player.dead) return;
    try { for (const f of W.interFns) f(list, game.player); } catch (e) { console.warn('[maps2] interactables', e); }
  }));
  if (W.fac()) onMap();

  W.dispose = () => {
    W.disposed = true;
    for (const off of offs) { try { off?.(); } catch { /* ignore */ } }
    W.boundNet?.off?.('msg:m2s', onState);
    for (const id of [...W.bar.keys()]) W.unbarrier(id);
  };
  return W;
}
