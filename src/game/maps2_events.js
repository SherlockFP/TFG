// [finish] MAPS2 SET-PIECE EVENTS (wave 3): COLLAPSE and MIGRATION on facility moons.
//   COLLAPSE   a corridor somewhere in the facility caves in (rubble drops, collider + nav edge block on every peer). Only non-bridge edges
//              are ever chosen (world/rooms2.js corridorSealEdges), so the facility stays fully connected: a detour, never a softlock.
//   MIGRATION  the facility's creatures are drawn to a far room (host noise pulses at the target for ~45 s) and a small herd spawns on the
//              far side of the map and marches with them. Crew that stays away sneaks past; crew that walks into the target meets them all.
// One event per day at most, never before quota 2 (early-game comfort), fired 70-260 s into the day while somebody is inside.
// Numbers: maps2_rules.js EVENTS (node-tested).
import * as THREE from 'three';
import { t, tf } from '../core/i18n.js';
import { layoutKit } from '../world/interiors/common.js';
import * as R from './maps2_rules.js';
import './maps2_text2.js';

export function installEvents(game, W) {
  const H = { kind: null, t: 0, ran: false, mig: null, collapses: 0 };
  const host = () => W.host();

  W.popFns.push(() => {
    H.kind = null; H.ran = false; H.mig = null; H.collapses = 0;
    const F = W.F;
    const ok = !!F && (game.run?.phase === 'moon' || game.run?.phase === 'landing') && (F.layout?.rooms?.length || 0) >= 8;
    H.kind = R.rollEvent(Math.random, game.run?.quotaIndex || 0, ok);
    if (game.run?.forceM2Event) H.kind = game.run.forceM2Event;   // debug / tests
    H.t = R.EVENTS.startMin + Math.random() * (R.EVENTS.startMax - R.EVENTS.startMin);
  });
  W.mapFns.push(() => { H.mig = null; });

  function collapse() {
    const F = W.F;
    if (!F) return false;
    if (Object.keys(W.hs.sealed).some((k) => k.startsWith('collapse:') || k.startsWith('treasure:'))) return false;   // never two permanent seals in one day (two non-bridge edges could still disconnect)
    const edges = W.sealEdges();
    const players = W.indoors().map((p) => ({ x: p.pos.x, z: p.pos.z }));
    const e = R.pickCollapseEdge(edges, players, Math.random);
    if (!e) return false;
    const id = 'collapse:' + e.key;
    W.hostSeal(id, { ...e, seed: (e.key * 7 + 3) >>> 0 });
    H.collapses++;
    W.banner(t('COLLAPSE'), t('A corridor collapsed somewhere in the facility.'), 'bad');
    W.send({ k: 'shake', n: 0.6, p: [e.x, e.y, e.z], r: 60 });
    W.say(t('A corridor collapsed somewhere in the facility.'), 'warn');
    W.snd('hit_metal', { x: e.x, y: e.y + 1, z: e.z }, 1);
    return true;
  }

  function roomsWithCenters() {
    const F = W.F, L = F?.layout;
    if (!L) return [];
    const K = layoutKit(L);
    return L.rooms.filter((r) => r.w * r.h >= 4 && r.type !== 'vault' && r.type !== 'generator' && r.type !== 'core' && r.type !== 'nest' && !r.m2ch && !r.m2)
      .map((r) => { const rc = K.roomRect(r); return { id: r.id, cx: (rc.x0 + rc.x1) / 2, cz: (rc.z0 + rc.z1) / 2, y: L.y }; });
  }
  function migration() {
    const F = W.F;
    if (!F) return false;
    const rooms = roomsWithCenters();
    const players = W.indoors().map((p) => ({ x: p.pos.x, z: p.pos.z }));
    if (rooms.length < 4 || !players.length) return false;
    const target = R.pickFarRoom(rooms, players, Math.random);
    if (!target) return false;
    const origins = rooms.filter((r) => r !== target && Math.hypot(r.cx - target.cx, r.cz - target.cz) > 20);
    const from = origins.length ? origins[Math.floor(Math.random() * origins.length)] : null;
    const [lo, hi] = R.EVENTS.migrateSpawn;
    const n = lo + Math.floor(Math.random() * (hi - lo + 1));
    const ids = [];
    if (from) for (let i = 0; i < n; i++) {
      const type = i === 0 && (game.run?.quotaIndex || 0) >= 4 ? 'crawler' : 'scuttler';
      const c = W.spawn(type, from.cx + (Math.random() - 0.5) * 3, from.y, from.cz + (Math.random() - 0.5) * 3, { state: 'walk' });
      if (c) { ids.push(c.id); try { game.creatures.goTo(c, target.cx, target.cz); } catch { /* nav optional */ } }
    }
    H.mig = { target, t: R.EVENTS.migrateFor, beat: 0, ids };
    const dx = target.cx - players[0].x, dz = target.cz - players[0].z;
    const dir = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : (dz > 0 ? 'south' : 'north');
    W.banner(t('MIGRATION'), t('The creatures are on the move.'), 'bad');
    W.say(tf('Something big is drawing them to the {where}.', { where: t(dir) }), 'warn');
    W.send({ k: 'shake', n: 0.4, p: [target.cx, target.y, target.cz], r: 80 });
    return true;
  }

  W.tickFns.push((dt) => {
    if (!host()) return;
    if (H.kind && !H.ran && game.run?.phase === 'moon') {
      H.t -= dt;
      if (H.t <= 0) {
        if (W.indoors().length) { H.ran = true; const k = H.kind; try { if (k === 'collapse') collapse(); else if (k === 'migration') migration(); } catch (e) { console.warn('[maps2] event', k, e); } }
        else H.t = 8;
      }
    }
    const M = H.mig;
    if (M) {
      M.t -= dt; M.beat -= dt;
      if (M.beat <= 0) { M.beat = 1.5; W.noise(M.target.cx, M.target.y + 1, M.target.cz, 3.8); }
      if (M.t <= 0) H.mig = null;
    }
  });

  return { state: () => ({ kind: H.kind, ran: H.ran, migrating: !!H.mig, t: Math.round(H.t) }), force: (k) => { H.kind = k; H.t = 0; H.ran = false; }, dispose() { H.mig = null; } };
}
