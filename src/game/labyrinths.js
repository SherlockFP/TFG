// LABYRINTHS runtime (wave 8, docs/wave8/labyrinths.md): the signature mechanic of the new interiors. Geometry + colliders come from
// world/interiors/lab_themes.js (fac.lab); rules from labyrinths_core.js.
//   metro       GHOST TRAIN: the host rolls a gap (55-85 s, first one 40-60 s after landing), broadcasts 'labfx' {k:'train', dir}. Everybody runs the same
//               7 s warning (red lamps + horn at both tunnel ends), then the train sweeps the tunnel at 30 m/s. Each client damages ITSELF once per pass
//               (60 dmg + a shove) when inside the lane; the host stuns creatures in the lane. Alcoves, cross passages, station platforms and hugging the
//               tunnel wall are safe. The tunnel is also the fast way through the level.
//   greenhouse  VINE WALLS: a melee weapon swing at a vine (game.resolveMelee is wrapped) sends 'labreq' {op:'cut', id}; the host validates reach and
//               broadcasts {k:'cut', id}; collider, mesh and nav block go away for everyone (late joiners ask {op:'sync'}). SPORE VENTS: a seeded puff
//               grows around every pod on a 16 s cycle; standing in one fades in a blur overlay (backdrop-filter) + coughing.
//   prison      LOCKDOWN: the host rolls a gap (70-110 s, first 45-70 s) and broadcasts {k:'lock'}; after a 3 s siren every cell gate slams shut for 20 s
//               (instanced bars + a collider per gate, skipped where the local player stands; the nav cell behind each gate is closed too).
//   tower       ELEVATOR: 4 call panels + 4 floor buttons in the cab (interactables); the host validates and broadcasts {k:'elev', from, to, n}; every peer
//               animates the cab from the same message, a rider inside the cab is carried by per-frame teleports, gates close behind / open at the
//               destination, rides of 2+ levels can STALL for 3 s (power_down + a loud noise at the shaft top: the ride back up is louder than the way down).
// Net: 'labreq' client -> host, 'labfx' host -> everyone. Never adds THREE lights.
import * as THREE from 'three';
import { t } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { G } from '../physics/physics.js';
import { MOONS } from './moons.js';
import * as K from './labyrinths_core.js';
import './labyrinths_i18n.js';

HOST_ONLY.add('labfx');

export function installLabyrinths(game) {
  const mods = game.mods;
  if (!mods) return null;
  const offs = [];
  let disposed = false, boundNet = null, overlay = null, coughT = 0, clock = 0, syncAsked = null;
  const S = { fac: null, n: 0, next: 0, train: null, spore: 0, lock: null, lockN: 0, lockNext: 0, elev: { at: 0, moving: false, n: 0, t: 0 } };
  const run = () => game.run;
  const host = () => !!game.isHost;
  const fac = () => game.world?.facility || null;
  const lab = () => fac()?.lab || null;
  const toast = (m, kind = 'info') => { try { game.ui?.hud?.toast?.(m, kind); } catch { /* hud optional */ } };
  const fx = (d) => { try { game.net.broadcast('labfx', d); } catch { /* net closing */ } };
  const V3 = THREE.Vector3;

  // ------------------------------------------------------------------------------------------------ net
  function onFx(d) {
    const L = lab();
    if (!L || !d) return;
    if (d.k === 'train' && L.id === 'metro') startTrain(d.dir < 0 ? -1 : 1);
    else if (d.k === 'cut' && L.id === 'greenhouse') applyCut(L, d.id);
    else if (d.k === 'lock' && L.id === 'prison') startLock();
    else if (d.k === 'elev' && L.id === 'tower') startElev(d);
    else if (d.k === 'state' && L.id === 'greenhouse') for (const id of d.cut || []) applyCut(L, id, true);
    else if (d.k === 'estate' && L.id === 'tower') applyElevState(L, d);
  }
  function posOf(id) {
    if (id === game.selfId) return game.player?.pos;
    return game.remotes?.get?.(id)?.pos || null;
  }
  function hostReq(d, from) {
    const L = lab();
    if (!host() || !L || !d || run()?.phase !== 'moon') return;
    if (d.op === 'cut' && L.id === 'greenhouse') {
      const v = L.vines[d.id | 0];
      const p = posOf(from);
      if (!v || v.cut || !p || Math.hypot(p.x - v.x, p.z - v.z) > K.VINE.reach + 3.5) return;
      fx({ k: 'cut', id: v.id });
    } else if (d.op === 'elev' && L.id === 'tower') {
      const to = d.to | 0;
      if (S.elev.moving || to < 0 || to >= K.ELEV.levels || to === S.elev.at) return;
      const pp = posOf(from);   // must stand in the cab or at a call panel (loose reach, lag tolerant)
      const nearCab = pp && Math.hypot(pp.x - L.cx, pp.z - L.cz) <= 4 && Math.abs(pp.y - L.ys[S.elev.at]) < 3;
      const nearPanel = pp && L.ys.some((y) => Math.hypot(pp.x - (L.cx + 1.6), pp.z - (L.cz + L.shaft + 0.5)) <= 5 && Math.abs(pp.y - y) < 3);
      if (!nearCab && !nearPanel) return;
      const ride = K.elevRide(run()?.seed ?? 0, S.elev.n, S.elev.at, to);
      fx({ k: 'elev', from: S.elev.at, to, n: S.elev.n, dur: ride.dur, stall: ride.stall });
    } else if (d.op === 'sync' && L.id === 'tower') {
      if (!S.elev.moving && S.elev.at) { try { game.net.sendTo(from, 'labfx', { k: 'estate', at: S.elev.at, n: S.elev.n }); } catch { /* peer gone */ } }
    } else if (d.op === 'sync' && L.id === 'greenhouse') {
      const cut = L.vines.filter((v) => v.cut).map((v) => v.id);
      if (cut.length) { try { game.net.sendTo(from, 'labfx', { k: 'state', cut }); } catch { /* peer gone */ } }
    }
  }
  const bindNet = (net) => { if (!net || boundNet === net) return; boundNet = net; net.on('msg:labfx', onFx); };
  offs.push(mods.on('registerHandlers', (H, g) => { if (g === game) H('labreq', (d, from) => { try { hostReq(d, from); } catch (e) { console.warn('[labyrinths] req', e); } }); }));
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);

  // ------------------------------------------------------------------------------------------------ metro: the ghost train
  function startTrain(dir) {
    const L = lab();
    if (!L || L.id !== 'metro') return;
    S.train = { dir, t: 0, hit: false, horn: false };
  }
  function trainSpec(L) { return { zA: L.zA, zB: L.zB, len: L.len, speed: K.TRAIN.speed, warn: K.TRAIN.warn, xC: L.xC, hw: L.hw }; }
  function tickMetro(dt, L) {
    const p = game.player, spec = trainSpec(L);
    if (host()) {
      S.next -= dt;
      if (!S.train && S.next <= 0) { fx({ k: 'train', dir: S.n % 2 ? -1 : 1 }); S.n++; S.next = K.trainGap(run()?.seed ?? 0, S.n) + 12 + (L.zB - L.zA) / K.TRAIN.speed; }
    }
    const tr = S.train;
    if (!tr) { L.train.visible = false; L.warn.color.setHex(0x140000); return; }
    tr.t += dt;
    const st = K.trainState(tr, spec);
    if (st.phase === 'warn') {
      L.warn.color.setHex(Math.sin(tr.t * 9) > 0 ? 0xff2a1a : 0x2a0000);
      if (!tr.horn && tr.t > 0.2) {
        tr.horn = true; toast(t('GHOST TRAIN INBOUND - get into an alcove!'), 'warn');
        for (const z of [L.zA + 2, L.zB - 2]) { try { game.audio?.at?.('ship_horn', new V3(L.xC, L.y + 2, z), 1, { maxDistance: 140 }); } catch { /* audio optional */ } }
      }
      return;
    }
    if (st.done) { S.train = null; L.train.visible = false; L.warn.color.setHex(0x140000); return; }
    L.warn.color.setHex(0x140000);
    L.train.visible = true; L.train.position.set(L.xC, L.y, st.z); L.train.rotation.y = tr.dir < 0 ? Math.PI : 0;
    const near = Math.abs(((p?.pos?.z) ?? 1e9) - st.z);
    if (near < 30) { try { game.engine?.shake?.(Math.min(0.35, (30 - near) / 90)); } catch { /* engine optional */ } }
    if (p && !p.dead && !tr.hit && Math.abs(p.pos.y - L.y) < 3.2 && p.pos.z > L.zA - 1 && p.pos.z < L.zB + 1 && K.trainHits(st.z, p.pos, spec)) {
      tr.hit = true;
      game.damageLocal?.(K.TRAIN.dmg, 'train');
      if (p.vel) { const side = p.pos.x >= L.xC ? 1 : -1; p.vel.x += side * K.TRAIN.knock; p.vel.y += 3; }
    }
    if (host()) {
      const list = game.creatures?.host;
      if (list?.size) for (const c of list.values()) {
        if (c.dead || c.zone !== 'in' || !c.def || c.def.hazard || (c.data?.trainCd || 0) > clock) continue;
        if (Math.abs(c.pos.x - L.xC) < L.hw + 0.4 && Math.abs(c.pos.z - st.z) < L.len / 2) { if (c.data) c.data.trainCd = clock + 6; c.stunT = Math.max(c.stunT || 0, 3); c.setState?.('stunned'); }
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ greenhouse: vines + spores
  function applyCut(L, id, quiet) {
    const v = L.vines[id | 0];
    if (!v || v.cut) return;
    v.cut = true; v.mesh.visible = false;
    try { game.physics?.removeCollider(v.col); } catch { /* already gone */ }
    fac()?.nav?.blockedEdges?.delete(v.key);
    if (quiet) return;
    try { game.particles?.burst(new V3(v.x, v.y, v.z), 'goo', null, 1.6); game.sfx?.('cloth_rustle', 0.8, 0.8); } catch { /* fx optional */ }
    if (Math.hypot((game.player?.pos.x ?? 1e9) - v.x, (game.player?.pos.z ?? 1e9) - v.z) < 9) toast(t('Vine wall cut. A shortcut opens.'), 'good');
  }
  /** melee swing: does the view ray hit an intact vine wall? */
  function tryCut(h) {
    const L = lab();
    if (!L || L.id !== 'greenhouse' || !L.vines.length || !game.camera) return;
    const held = game.player?.heldItem?.(), def = held?.def || held;
    if (!def || def.kind !== 'weapon' || def.ammo !== undefined || def.battery) return;   // a melee weapon in hand
    const eye = game.camera.position, fwd = new V3(0, 0, -1).applyQuaternion(game.camera.quaternion);
    const reach = Math.max(K.VINE.reach, (h?.reach || 2) + 0.4);
    let best = null;
    for (const v of L.vines) {
      if (v.cut) continue;
      const hx = v.sx / 2, hz = v.sz / 2, hy = 1.6;
      let t0 = 0, t1 = reach;
      for (const [o, dd, c, half] of [[eye.x, fwd.x, v.x, hx], [eye.y, fwd.y, L.y + hy, hy], [eye.z, fwd.z, v.z, hz]]) {
        if (Math.abs(dd) < 1e-6) { if (Math.abs(o - c) > half) { t1 = -1; break; } continue; }
        let a = (c - half - o) / dd, b = (c + half - o) / dd;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) { t1 = -1; break; }
      }
      if (t1 >= 0 && t0 <= reach && (!best || t0 < best.t)) best = { v, t: t0 };
    }
    if (best) { try { game.net.request('labreq', { op: 'cut', id: best.v.id }); } catch { /* net closing */ } }
  }
  const origMelee = game.resolveMelee;
  if (typeof origMelee === 'function') game.resolveMelee = function (h) { try { tryCut(h); } catch (e) { console.warn('[labyrinths] cut', e); } return origMelee.call(this, h); };

  function ensureOverlay() {
    if (overlay || typeof document === 'undefined') return overlay;
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:40;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,rgba(150,200,60,.10),rgba(90,150,40,.34));transition:opacity .12s linear';
    document.body.appendChild(overlay);
    return overlay;
  }
  function tickGreenhouse(dt, L) {
    const p = game.player, rt = run()?.time;
    const base = typeof rt === 'number' ? rt * ((game.config?.dayLengthSec || 720) / 960) : clock;
    let k = 0;
    for (const s of L.spores) {
      const u = ((base + s.phase) % K.SPORE.period) / K.SPORE.life;
      if (u >= 1) { s.puff.visible = false; s.pod.scale.setScalar(1); continue; }
      const e = Math.min(1, u * 5) * Math.pow(1 - u, 0.6);
      s.puff.visible = true; s.puff.scale.setScalar(0.4 + u * K.SPORE.radius); s.puff.material.opacity = 0.34 * e;
      s.pod.scale.setScalar(1 + 0.6 * Math.sin(u * 3));
      if (p && !p.dead && Math.abs(p.pos.y - s.y) < 3.5) {
        const dd = Math.hypot(p.pos.x - s.x, p.pos.z - s.z), rad = 0.4 + u * K.SPORE.radius;
        if (dd < rad) k = Math.max(k, e * (1 - dd / rad * 0.5));
      }
    }
    const ov = k > 0.02 || overlay ? ensureOverlay() : null;
    if (ov) {
      ov.style.opacity = String(Math.min(1, k * 1.4));
      ov.style.backdropFilter = ov.style.webkitBackdropFilter = k > 0.02 ? `blur(${(K.SPORE.blur * k).toFixed(1)}px) saturate(.8)` : 'none';
    }
    if (k > 0.3) { coughT -= dt; if (coughT <= 0) { coughT = 1.6; try { game.sfx?.('breath_heavy', 0.4); } catch { /* audio optional */ } if (!S.sporeToast) { S.sporeToast = true; toast(t('Spores! Your vision blurs.'), 'warn'); } } }
  }

  // ------------------------------------------------------------------------------------------------ prison: lockdown
  const gateCols = [];
  function setGates(L, closed) {
    const p = game.player, navw = fac()?.nav;
    for (const c of gateCols.splice(0)) { try { game.physics?.removeCollider(c.col); } catch { /* gone */ } if (navw && c.ni >= 0) navw.walk[c.ni] = c.prev; }
    L.gates.forEach((g, i) => {
      L.inst.setMatrixAt(i, closed ? L.openM[i] : L.zeroM);
      if (!closed) return;
      const near = p && Math.abs(p.pos.y - g.y) < 2.5 && Math.hypot(p.pos.x - g.x, p.pos.z - g.z) < 0.9;
      if (!near) {
        const hx = g.axis === 'x' ? 0.6 : 0.05, hz = g.axis === 'x' ? 0.05 : 0.6;
        try { gateCols.push({ col: game.physics.addStaticBox(g.x, g.y + 1.15, g.z, hx, 1.15, hz, 0, G.STATIC, { kind: 'static' }), ni: -1 }); } catch { /* physics optional */ }
      }
      if (navw) {   // close the nav cell in front of the gate's inner side: creatures cannot walk into a locked cell
        const [gx, gz] = navw.toGrid(g.x + (g.axis === 'z' ? (g.x < L.rc.x0 + 6 ? -0.9 : 0.9) : 0), g.z + (g.axis === 'x' ? (g.z < L.rc.z0 + 6 ? -0.9 : 0.9) : 0));
        if (navw.inside(gx, gz)) { const ni = gz * navw.w + gx; gateCols.push({ col: null, ni, prev: navw.walk[ni] }); navw.walk[ni] = 0; }
      }
    });
    L.inst.instanceMatrix.needsUpdate = true;
  }
  function startLock() { S.lock = { t: 0, on: false, siren: 0 }; }
  function tickPrison(dt, L) {
    if (host()) {
      S.lockNext -= dt;
      if (!S.lock && S.lockNext <= 0) { fx({ k: 'lock' }); S.lockN++; S.lockNext = K.lockGap(run()?.seed ?? 0, S.lockN) + K.LOCK.sec + K.LOCK.warn; }
    }
    const lk = S.lock;
    if (!lk) { L.alarm.color.setHex(0x2a0000); return; }
    lk.t += dt;
    L.alarm.color.setHex(Math.sin(lk.t * 8) > 0 ? 0xff2a1a : 0x300000);
    lk.siren -= dt;
    if (lk.t < K.LOCK.warn + K.LOCK.sec && lk.siren <= 0) { lk.siren = 2.4; try { game.sfx?.('ship_alarm', 0.55); } catch { /* audio optional */ } }
    if (!lk.on && lk.t >= K.LOCK.warn) { lk.on = true; setGates(L, true); try { game.sfx?.('blast_door', 0.8); } catch { /* audio optional */ } toast(t('LOCKDOWN - the cell doors slam shut for 20 s'), 'warn'); }
    if (lk.t >= K.LOCK.warn + K.LOCK.sec) { setGates(L, false); S.lock = null; L.alarm.color.setHex(0x2a0000); try { game.sfx?.('door_open', 0.6); } catch { /* audio optional */ } }
    else if (lk.t < 0.3 && !lk.warned) { lk.warned = true; toast(t('LOCKDOWN INBOUND - get out of the cells!'), 'warn'); }
  }

  // ------------------------------------------------------------------------------------------------ tower: elevator
  const gateColT = new Map();
  function gateSet(L, level, closed) {
    const g = L.gates[level], key = level;
    g.mesh.visible = closed; g.ind.color.setHex(closed ? 0xff3322 : 0x33ff66);
    const cur = gateColT.get(key) ?? g.col;
    if (closed && !cur) {
      const p = game.player;
      const near = p && Math.abs(p.pos.y - g.y) < 2.5 && Math.hypot(p.pos.x - g.x, p.pos.z - g.z) < 0.9;
      if (!near) { try { gateColT.set(key, game.physics.addStaticBox(g.x, g.y + g.sy / 2, g.z, g.sx / 2, g.sy / 2, g.sz / 2, 0, G.STATIC, { kind: 'static' })); } catch { /* physics optional */ } }
    } else if (!closed && cur) { try { game.physics?.removeCollider(cur); } catch { /* gone */ } gateColT.set(key, null); if (g.col === cur) g.col = null; }
  }
  /** late join: park the cab + gates where the host's elevator is (a ride that is running right now finishes for the joiner on the next call) */
  function applyElevState(L, d) {
    const E = S.elev, at = d.at | 0;
    if (E.moving || at < 0 || at >= K.ELEV.levels) return;
    E.at = at; E.n = d.n | 0; L.cab.position.y = L.ys[at];
    for (let k = 0; k < K.ELEV.levels; k++) gateSet(L, k, k !== at);
  }
  function startElev(d) {
    const L = lab(), E = S.elev;
    if (!L || L.id !== 'tower' || E.moving) return;
    E.moving = true; E.t = 0; E.from = d.from | 0; E.to = d.to | 0; E.ride = { dur: d.dur, stall: d.stall || 0 }; E.n = (d.n | 0) + 1; E.rider = false; E.stalled = false;
    gateSet(L, E.from, true);
    const p = game.player;
    if (p && !p.dead && Math.abs(p.pos.x - L.cx) < 1.9 && Math.abs(p.pos.z - L.cz) < 1.9 && Math.abs(p.pos.y - L.ys[E.from]) < 1.6) E.rider = true;
    try { game.sfx?.('lever_pull', 0.6); } catch { /* audio optional */ }
  }
  function tickTower(dt, L) {
    const E = S.elev, p = game.player;
    if (!E.moving) return;
    E.t += dt;
    const total = E.ride.dur + E.ride.stall, pr = K.elevProgress(E.ride, Math.min(E.t, total));
    const y = L.ys[E.from] + (L.ys[E.to] - L.ys[E.from]) * pr;
    L.cab.position.y = y;
    if (E.ride.stall && !E.stalled && E.t >= E.ride.dur / 2) {
      E.stalled = true; try { game.sfx?.('power_down', 0.8); } catch { /* audio optional */ }
      if (E.rider) { toast(t('The elevator stalls...'), 'warn'); try { game.net.request('noise', { p: [L.cx, L.ys[0] + 1, L.cz], loud: 0.9 }); } catch { /* net closing */ } }
    }
    L.cabLamp.color.setHex(E.stalled && E.t < E.ride.dur / 2 + E.ride.stall && Math.sin(E.t * 14) > 0 ? 0x223344 : 0xdff4ff);
    if (E.rider && p && !p.dead) {
      const hx = Math.max(L.cx - 1.3, Math.min(L.cx + 1.3, p.pos.x)), hz = Math.max(L.cz - 1.3, Math.min(L.cz + 1.3, p.pos.z));
      p.teleport(new V3(hx, y + 0.03, hz));
    }
    if (E.t >= total) {
      E.moving = false; E.at = E.to; L.cab.position.y = L.ys[E.to];
      gateSet(L, E.to, false); L.cabLamp.color.setHex(0xdff4ff);
      try { game.sfx?.('bell_ding', 0.7); } catch { /* audio optional */ }
    }
  }
  offs.push(mods.on('interactables', (out, g) => {
    if (g !== game || disposed) return;
    const L = lab(), p = game.player;
    if (!L || L.id !== 'tower' || !p || p.dead || run()?.phase !== 'moon') return;
    const E = S.elev, req = (to) => { try { game.net.request('labreq', { op: 'elev', to }); } catch { /* net closing */ } };
    if (E.moving) return;
    for (let k = 0; k < K.ELEV.levels; k++) {
      if (k === E.at || Math.abs(p.pos.y - L.ys[k]) > 2.5 || Math.hypot(p.pos.x - L.cx, p.pos.z - L.cz) > 9) continue;
      out.push({ pos: new V3(L.cx + 1.6, L.ys[k] + 1.2, L.cz + L.shaft + 0.5), r: 0.6, reach: 2.4, label: () => t('Call the elevator [E]'), sub: () => t('Floor') + ' ' + K.ELEV.labels[k], action: () => req(k) });
    }
    if (Math.abs(p.pos.x - L.cx) < 1.9 && Math.abs(p.pos.z - L.cz) < 1.9 && Math.abs(p.pos.y - L.ys[E.at]) < 1.6) {
      for (let k = 0; k < K.ELEV.levels; k++) {
        if (k === E.at) continue;
        out.push({ pos: new V3(L.cx + (k - 1.5) * 0.4, L.ys[E.at] + 1.3, L.cz - 1.55), r: 0.16, reach: 2.6, label: () => t('Floor') + ' ' + K.ELEV.labels[k] + ' [E]', sub: () => (k > E.at ? t('Down') : t('Up')), action: () => req(k) });
      }
    }
  }));

  // ------------------------------------------------------------------------------------------------ landing card row
  function briefRow() {
    const r = run();
    if (!r || r.phase !== 'landing' || typeof document === 'undefined') return;
    const hint = K.LAB_HINT[MOONS[r.moon]?.interior];
    const grid = hint && document.querySelector('.br-card .br-grid');
    if (!grid || grid.querySelector('.lab-row')) return;
    const d = document.createElement('div'); d.className = 'lab-row';
    const a = document.createElement('span'); a.textContent = t('HAZARD');
    const b = document.createElement('b'); b.textContent = t(hint); b.style.cssText = 'font-size:.85em;text-align:right';
    d.append(a, b); grid.appendChild(d);
  }

  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    clock += dt;
    briefRow();
    const F = fac(), L = F?.lab || null;
    if (F !== S.fac) {   // a new facility: reset the per-day state (the first train comes 40-60 s after the day starts)
      for (const c of gateCols.splice(0)) { try { game.physics?.removeCollider(c.col); } catch { /* gone */ } }
      for (const c of gateColT.values()) { try { game.physics?.removeCollider(c); } catch { /* gone */ } }
      gateColT.clear(); S.lock = null; S.lockN = 0; S.lockNext = K.lockGap(run()?.seed ?? 0, 0); S.elev = { at: 0, moving: false, n: 0, t: 0 };
      S.fac = F; S.train = null; S.n = 0; S.next = K.trainGap(run()?.seed ?? 0, 0); S.sporeToast = false; syncAsked = null;
      if (overlay) { overlay.style.opacity = '0'; overlay.style.backdropFilter = 'none'; }
    }
    if (!L || run()?.phase !== 'moon') { if (overlay) overlay.style.opacity = '0'; return; }
    if (L.id === 'metro') tickMetro(dt, L);
    else if (L.id === 'prison') tickPrison(dt, L);
    else if (L.id === 'tower') { if (!syncAsked && !host()) { syncAsked = true; try { game.net.request('labreq', { op: 'sync' }); } catch { /* net closing */ } } tickTower(dt, L); }
    else if (L.id === 'greenhouse') {
      if (!syncAsked && !host()) { syncAsked = true; try { game.net.request('labreq', { op: 'sync' }); } catch { /* net closing */ } }
      tickGreenhouse(dt, L);
    }
  }));

  return {
    /** test hooks */
    _state: S, startTrain, applyCut, tryCut,
    dispose() {
      disposed = true;
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      try { boundNet?.off?.('msg:labfx', onFx); } catch { /* ignore */ }
      if (game.resolveMelee && origMelee) game.resolveMelee = origMelee;
      for (const c of gateCols.splice(0)) { try { game.physics?.removeCollider(c.col); } catch { /* gone */ } }
      for (const c of gateColT.values()) { try { game.physics?.removeCollider(c); } catch { /* gone */ } }
      overlay?.remove(); overlay = null;
    },
  };
}
