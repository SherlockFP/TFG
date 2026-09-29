// WAVE 4 maps5 (docs/wave4/maps5.md). Installed with `this.useModule('maps5', installMaps5)` in game.js.
//   ESTATE 9   (fixed moon m5est, tier 2, biome m5estate): HEDGE MAZE (fog, centre prize, the Hedge Warden), PAPER ARCHIVE (two levels, ladder, bridges), fountains, topiary
//   COLD STORAGE (fixed moon m5cold, tier 3, biome m5cold): SERVER STACKS (shifting aisles, host-timed, telegraphed), CRYO CAVES (pods, Cryo Sleepers, Cryo Core), snow / blizzard
//   9 procedural props (models/maps5_props.js, `m5:*`), 2 creatures + 5 scrap items (maps5_creatures.js, models/maps5_models.js)
// This module is the RUNTIME of those set pieces; the geometry is built by the biome decor (world/maps5_*.js) on every peer from the map seed.
//   client: zone fog / darkness + ambience while you are inside a set piece, ENTERING toasts, the archive LADDER (climb volume), stack shift telegraph + animation
//   host:   landing population (prizes, loot spots, Hedge Warden, Cryo Sleepers), the stack shift director (message `m5sw`), prize-lifted alarms
// Net: `m5sw` host -> everyone { k: 'warn' | 'go' | 'set', n: cycle step }  (HOST_ONLY); request `m5sync` (a peer asks for the current step after its map loaded).
// game.maps5.generators exposes the labyrinth planners so other modules (voyage / random moons) can reuse them.
import * as THREE from 'three';
import { MOONS } from './moons.js';
import '../world/maps5_biomes.js';
import { ESTATE_MOON, COLD_MOON } from '../world/maps5_data.js';
import { addTranslations, t, tf } from '../core/i18n.js';
import { RNG } from '../core/rng.js';
import { HOST_ONLY } from '../net/session.js';
import { ITEMS, scrapTableFor } from './items.js';
import { scrapValueMul } from './progression.js';
import { registerMaps5Creatures, M5_TYPES } from './maps5_creatures.js';
import { M5_CREATURE_MODELS, M5_ITEM_MODELS } from '../models/maps5_models.js';
import { TR, RU } from './maps5_text.js';
import * as CORE from '../world/mazegen.js';   // [unify] one maze library
import { ladderStep } from '../world/stairs.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const MSG = 'm5sw', REQ_SYNC = 'm5sync';
const CLIMB_SPEED = 3.4;

export function installMaps5(game) {
  const g = game, mods = game.mods;
  if (!mods) return null;
  registerMaps5Creatures();
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  // (literal copies of the two ladder prompts so tools/i18n_audit.mjs can see them; the full tables are in maps5_text.js)
  addTranslations({ 'Climb the ladder [E]': 'Merdivene tırman [E]', 'Face the ladder: hold [W] to climb, [S] to go down': 'Merdivene dön: tırmanmak için [W], inmek için [S] basılı tut' });
  addTranslations({ 'Climb the ladder [E]': 'Подняться по лестнице [E]', 'Face the ladder: hold [W] to climb, [S] to go down': 'Повернись к лестнице: [W] вверх, [S] вниз' }, 'ru');
  HOST_ONLY.add(MSG);
  const offs = [];
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };

  // ---- models ---------------------------------------------------------------------------------------------------------
  const mm = (typeof window !== 'undefined' ? window.__kefalMods : null) || mods;
  if (mm?.creatureModels) for (const id of M5_TYPES) if (!mm.creatureModels.has(id)) mm.creatureModels.set(id, (T, o) => M5_CREATURE_MODELS[id](o || {}));
  if (mm?.itemModels) for (const [id, fn] of Object.entries(M5_ITEM_MODELS)) if (!mm.itemModels.has(id)) mm.itemModels.set(id, () => fn());

  const S = {
    info: null,                 // decor info of the current map (m5 moons only)
    zone: null, zf: 0, lastZone: null, ambKey: null,
    climb: false, climbInfo: null,
    host: null,                 // per-landing host state
    stats: { shifts: 0, warns: 0, prizes: 0, wardens: 0, sleepers: 0, climbs: 0 },
    hintT: 0, bound: null, wasClimbing: false,
  };
  const run = () => g.run;
  const moonOf = () => MOONS[g.run?.moon];
  const isM5Moon = () => { const m = moonOf(); return !!m && (m.id === ESTATE_MOON || m.id === COLD_MOON || !!m.m5); };
  const isMoonPhase = () => run()?.phase === 'moon' && !moonOf()?.company && !moonOf()?.home;
  const infoNow = () => { const i = g.world?.outdoor?.decor?.info; return i && (i.kind === 'm5estate' || i.kind === 'm5cold') ? i : null; };
  const stacksNow = () => infoNow()?.stacks || null;
  const say = (a, b, v) => g.ui?.hud?.bigText?.(t(a), v ? tf(b, v) : t(b));

  // ==================================================================================== stack shifts (net)
  function bindNet(net) {
    if (!net || S.bound === net) return;
    S.bound = net;
    net.on_(MSG, (d) => onSwitch(d));
    net.handle(REQ_SYNC, (d, from) => {
      if (!g.isHost) return;
      net.sendTo(from, MSG, { k: 'set', n: S.host?.step | 0 });
    });
  }
  function nearHall(radius = 70) {
    const st = stacksNow(), p = g.player;
    return !!st && !!p && !p.dead && flat(p.pos, st.frame) < radius;
  }
  function onSwitch(d) {
    const st = stacksNow();
    if (!st || !d || typeof d.k !== 'string') return;
    const n = clamp(d.n | 0, 0, 1e7);
    if (d.k === 'set') { st.goTo(n, true); return; }
    if (d.k === 'warn') {
      const changed = st.warn(n);
      S.stats.warns++;
      if (changed.length && nearHall()) { say('AISLES SHIFTING', 'Server racks are repositioning. Watch the amber strips.'); try { g.audio?.play?.(g.audio.has?.('alarm') ? 'alarm' : 'beep_3', { volume: 0.35, bus: 'sfx' }); } catch { /* audio optional */ } }
    } else if (d.k === 'go') {
      const before = st.walls.filter((w) => w.tgt !== st.targetsAt(n)[w.i]).slice(0, 3);
      st.goTo(n, false);
      S.stats.shifts++;
      if (nearHall(60)) for (const w of before) { try { g.audio?.at?.(g.audio.has?.('hydraulic') ? 'hydraulic' : 'door_close', new THREE.Vector3(w.wx, st.y0 + 1.4, w.wz), 0.7, { refDistance: 3, maxDistance: 40 }); } catch { /* audio optional */ } }
    }
  }
  function hostStacksTick(dt) {
    const st = stacksNow(), H = S.host;
    if (!st || !H) return;
    const players = (g.aiPlayers?.() || []).filter((p) => !p.dead && !p.inShip);
    const near = players.some((p) => flat(p.pos, st.frame) < 55);
    if (near) H.t += dt;   // the aisles only rearrange while somebody is around: the state is otherwise frozen and identical on every peer
    const need = H.step === 0 && !H.moved ? 30 : st.plan.interval;
    if (!H.warned && H.t >= need - st.plan.warn) { H.warned = true; g.net.broadcast(MSG, { k: 'warn', n: H.step + 1 }); }
    if (H.t >= need) { H.step++; H.t = 0; H.warned = false; H.moved = true; g.net.broadcast(MSG, { k: 'go', n: H.step }); }
  }

  // ==================================================================================== client: zones (fog, darkness, ambience, toasts)
  const _c = new THREE.Color();
  const ZONE_TOAST = { hedge: 'ENTERING: HEDGE MAZE', archive: 'ENTERING: PAPER ARCHIVE', stacks: 'ENTERING: SERVER STACKS', cave: 'ENTERING: CRYO CAVE' };
  const ZONE_AMB = { stacks: ['ambience_serverfarm', 0.4], cave: ['ambience_serverfarm', 0.3], archive: ['ambience_mansion', 0.3], hedge: ['ambience_mansion', 0.14] };
  function updateZones(dt) {
    const info = infoNow(), p = g.player, a = g.audio;
    let z = null;
    if (info && p && !p.dead && !p.inShip && !p.indoor) for (const zz of info.zones) if (zz.contains(p.pos.x, p.pos.z, p.pos.y)) { z = zz; break; }
    if (z) S.zone = z;
    S.zf = clamp(S.zf + (z ? 1 : -1) * dt * 2.2, 0, 1);
    if (z && z.id !== S.lastZone) { S.lastZone = z.id; if (ZONE_TOAST[z.id]) g.ui?.toast?.(t(ZONE_TOAST[z.id]), 'info'); } else if (!z) S.lastZone = null;
    if (S.zone && S.zf > 0.01) {
      const Z = S.zone, f = S.zf, sc = g.engine?.scene, L = g.lights;
      if (sc?.fog) {
        sc.fog.density *= 1 + ((Z.fog || 1) - 1) * f;
        if (Z.tint != null) { sc.fog.color.lerp(_c.set(Z.tint), 0.85 * f); sc.background?.copy?.(sc.fog.color); }
      }
      if (L && Z.dark != null) { const k = 1 - (1 - Z.dark) * f; if (L.hemi) L.hemi.intensity *= k; if (L.sun) L.sun.intensity *= k; }
    }
    // ambience layer (the base layers belong to game.updateAmbience)
    const want = z && ZONE_AMB[z.id] ? ZONE_AMB[z.id] : null;
    const key = want ? want.join(':') : '';
    if (a && key !== S.ambKey) { S.ambKey = key; try { a.setAmbience?.('m5amb', want ? want[0] : null, want ? want[1] : 0, 1.5); } catch { /* audio optional */ } }
  }

  // ==================================================================================== the archive ladder (climb volume)
  const P = g.player;
  const origUpdate = P.update;
  const wrapped = function (dt, input) {
    try {
      const L = infoNow()?.archive?.ladder;
      if (L && !this.dead && !this.inShip && !this.frozen && !this.indoor) {
        // shared ladder rules (world/stairs.js ladderStep): grab facing the ladder, climb at CLIMB_SPEED, let go at the foot / outside the volume
        const r = ladderStep(L, { climbing: S.climb }, { pos: this.pos, yaw: this.yaw, up: input.isDown('forward') || input.isDown('jump'), down: input.isDown('back') || input.isDown('crouch'), grounded: this.grounded }, CLIMB_SPEED, dt);
        if (r.climbing && !S.climb) S.stats.climbs++;
        S.climb = r.climbing;
        if (r.vy !== null) { this.vel.y = r.vy; this.minVelY = 0; this.fallStartY = null; this.airT = 0; }
      } else S.climb = false;
    } catch (e) { S.climb = false; if (!S.warned) { S.warned = true; console.warn('[maps5] ladder', e); } }
    return origUpdate.call(this, dt, input);
  };
  P.update = wrapped;

  on('interactables', (list) => {
    try {
      const L = infoNow()?.archive?.ladder, p = g.player;
      if (!L || !p || p.dead || p.inShip || p.indoor) return;
      if (Math.hypot(p.pos.x - L.x, p.pos.z - L.z) > 3.2 || p.pos.y > L.top) return;
      const V = p.pos.constructor;
      list.push({ pos: new V(L.x, p.pos.y + 0.9, L.z), r: 0.6, reach: 2.6, label: () => (S.climb ? t('Face the ladder: hold [W] to climb, [S] to go down') : t('Climb the ladder [E]')), action: () => { if (!S.climb) S.stats.climbs++; S.climb = true; } });
    } catch (e) { console.warn('[maps5] interactables', e); }
  });

  // ==================================================================================== objectives (nearest lead)
  const HINTS = { hedge: 'The hedge maze hides a prize in its centre. Something guards it.', archive: 'Paper Archive: take the ladder up, cross the bridge, find the Master Ledger.', stacks: 'Server Stacks: the aisles shift every 45 s. Watch the amber strips.', cave: 'Cryo cave: a Cryo Core waits in the chamber. The sleepers will wake.' };
  on('objectives', (add, g2, phase) => {
    try {
      const info = infoNow(), p = g.player;
      if (phase !== 'moon' || !info || !p || p.indoor || p.dead) return;
      let best = null;
      for (const z of info.zones) { const d = Math.hypot(z.x - p.pos.x, z.z - p.pos.z); if (!best || d < best.d) best = { z, d }; }
      if (best && best.d < 110) add(t(HINTS[best.z.id] || ''), 'sub');
    } catch { /* hint is optional */ }
  });

  // ==================================================================================== host: landing population
  function hostPopulate() {
    if (!g.isHost || !isMoonPhase()) return;
    const info = infoNow();
    S.host = { step: 0, t: 0, warned: false, moved: false, prizes: [], key: `${run()?.seed}:${run()?.moon}`, tick: 0 };
    if (!info) return;
    const r = run(), moon = moonOf(), M = g.creatures;
    const rng = new RNG(((r.seed | 0) ^ 0x5a5ed5) >>> 0);
    const theme = g.world.facility?.layout?.theme || moon.interior;
    const table = scrapTableFor(theme).map(([id, w]) => ({ id, w }));
    const valueMul = (moon.scrapMul || 1) * scrapValueMul(r.quotaIndex) * 0.9;
    const V = (o, dy = 0.5) => new THREE.Vector3(o.x, o.y + dy, o.z);
    for (const pz of info.prizes) {
      if (!ITEMS[pz.item]) continue;
      const id = g.items.hostSpawn(pz.item, V(pz, 0.15), { valueMul: valueMul * 0.95 });
      S.host.prizes.push({ id, pos: { x: pz.x, y: pz.y, z: pz.z }, zone: pz.zone, item: pz.item });
      S.stats.prizes++;
    }
    for (const s of info.loot) {   // small loot: part of the -28 % loot budget, so only some spots fill up
      if (!rng.chance(0.6)) continue;
      const id = rng.weighted(table).id;
      if (ITEMS[id]) g.items.hostSpawn(id, V(s, 0.3), { valueMul });
    }
    const lvl = 1 + Math.floor((r.quotaIndex || 0) / 3);
    const h = info.hedge;
    if (h && M) {
      const sp = h.wardenSpot, yaw = Math.atan2(h.centre.x - sp.x, h.centre.z - sp.z);
      const c = M.hostSpawn('m5warden', new THREE.Vector3(sp.x, sp.y, sp.z), { zone: 'out', level: lvl, state: 'statue', yaw, seed: rng.int(1, 99), data: { home: { x: sp.x, z: sp.z }, homeYaw: yaw } });
      if (c) S.stats.wardens++;
    }
    if (info.pods && M) {
      for (const pod of info.pods) {
        if (!pod.sleeper) continue;
        const fx = Math.sin(pod.ry), fz = Math.cos(pod.ry), x = pod.x + fx * 0.9, z = pod.z + fz * 0.9;
        const c = M.hostSpawn('m5sleeper', new THREE.Vector3(x, pod.y, z), { zone: 'out', level: lvl, state: 'dormant', yaw: pod.ry, seed: rng.int(1, 99), data: { pod: { x, z }, cave: pod.cave } });
        if (c) S.stats.sleepers++;
      }
    }
  }
  function hostAlarms() {
    const H = S.host;
    if (!H) return;
    for (const pz of H.prizes) {
      if (pz.taken) continue;
      const it = g.items.get?.(pz.id);
      if (!it) continue;
      const moved = it.obj?.position ? Math.hypot(it.obj.position.x - pz.pos.x, it.obj.position.z - pz.pos.z) > 1.8 || Math.abs(it.obj.position.y - pz.pos.y) > 1.5 : false;
      if (!(it.holder || it.state !== 'world' || moved)) continue;
      pz.taken = true;
      if (pz.zone === 'hedge') { for (const c of g.creatures.host.values()) if (c.type === 'm5warden' && !c.dead) { c.data.alarm = true; c.data.hitBy = null; } }
      else if (pz.zone === 'cave') {
        const cave = (infoNow()?.caves || []).findIndex((cv) => Math.hypot(cv.prize.x - pz.pos.x, cv.prize.z - pz.pos.z) < 3);
        for (const c of g.creatures.host.values()) if (c.type === 'm5sleeper' && !c.dead && (cave < 0 || c.data.cave === cave)) c.data.alarm = true;
      } else if (pz.zone === 'stacks' && S.host) { const st = stacksNow(); if (st) H.t = Math.max(H.t, st.plan.interval - st.plan.warn - 0.1); }   // lifting the Cold Core starts an immediate reshuffle
    }
  }

  // ==================================================================================== events
  on('netReady', (net) => bindNet(net));
  if (g.net) bindNet(g.net);
  on('mapLoaded', (world) => {
    S.info = world?.outdoor?.decor?.info || null;
    S.host = null; S.zone = null; S.zf = 0; S.lastZone = null; S.climb = false;
    try { g.audio?.setAmbience?.('m5amb', null); S.ambKey = ''; } catch { /* audio optional */ }
    if (infoNow()?.stacks && !g.isHost && g.net) { try { g.net.request(REQ_SYNC, {}); } catch { /* host answers later */ } }
  });
  on('moonPopulated', () => { try { hostPopulate(); } catch (e) { console.warn('[maps5] populate', e); } });
  on('phase', () => { if (run()?.phase !== 'moon') S.host = null; });
  on('update', (dt) => {
    try {
      if (isM5Moon()) updateZones(dt);
      else if (S.ambKey) { S.ambKey = ''; g.audio?.setAmbience?.('m5amb', null); }
      if (g.isHost && S.host && isMoonPhase()) {
        hostStacksTick(dt);
        S.host.tick -= dt;
        if (S.host.tick <= 0) { S.host.tick = 0.5; hostAlarms(); }
      }
    } catch (e) { if (!S.warnedU) { S.warnedU = true; console.warn('[maps5] update', e); } }   // cosmetics / director must never break the frame loop
  });

  const api = {
    generators: { planHedge: CORE.planHedge, planStacks: CORE.planStacks, planArchive: CORE.planArchive, verifyStacks: CORE.verifyStacks, archiveSolve: CORE.archiveSolve, wallLattice: CORE.wallLattice, mazeRoute: CORE.mazeRoute, carveTree: CORE.carveTree, bfs: CORE.bfs },
    moons: { ESTATE_MOON, COLD_MOON },
    info: infoNow,
    stacks: stacksNow,
    state: S,
    /** debug / tests (host): run a stack shift now (warn + go in one call) */
    shiftNow() { const st = stacksNow(); if (!st || !S.host || !g.isHost) return false; S.host.step++; S.host.moved = true; g.net.broadcast(MSG, { k: 'go', n: S.host.step }); return S.host.step; },
    dispose() {
      for (const off of offs.splice(0)) { try { off(); } catch { /* ignore */ } }
      if (P.update === wrapped && Object.prototype.hasOwnProperty.call(P, 'update')) delete P.update;
      try { g.audio?.setAmbience?.('m5amb', null); } catch { /* ignore */ }
    },
  };
  return api;
}
