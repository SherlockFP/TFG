// REPOMAPS runtime (wave 8, docs/wave8/repomaps.md): the four themed interiors (world/interiors/themes_studio.js) get their loot, signature mechanic and title card here.
//   Influencer Mansion  VIRAL items grow in value while carried (x2.5 in studio rooms, cap 140 %)      host tick, value synced with the stock `it val` message
//   Content Academy     library shelves slide on rails: bell warning, then everybody moves them        net `rmap` warn / go / set (HOST_ONLY), colliders swapped locally
//   Cold Storage        FROZEN items thaw in warm station rooms / outdoors; freezer + ice-hall floors slide (player.update wrap)
//   Museum              ART items set off the facility alarm when they take damage or break            host poll, facilitysys.force('alarm') + creature noise
// Loot is registered as normal items (fragile: lose value on bumps and drops through game/actions.js onItemImpact) and added to the per-theme SCRAP_TABLE / BIG_TABLES,
// so the stock loot placement picks it up on every peer. Net: `rmap` { k: 'warn'|'go'|'set'|'alarm', n?, p? } host -> everyone.
import * as THREE from 'three';
import { MOONS } from './moons.js';
import { SCRAP_TABLE, BIG_TABLES, registerItem } from './items.js';
import { t } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { insideShip } from '../world/ship.js';
import { G } from '../physics/physics.js';
import { STUDIO_THEMES, STUDIO_IDS } from '../world/interiors/themes_studio.js';
import { createStudioItem } from '../models/studio_items.js';
import { SHELF_W, SHELF_D, SHELF_H } from '../models/studio_props.js';
import * as C from './repomaps_core.js';

const MSG = 'rmap';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SHELF_SPEED = 1.6;   // m/s along the rail (4.4 m: about 2.7 s)

export function installRepomaps(game) {
  const g = game, mods = game.mods;
  if (!mods) return null;
  HOST_ONLY.add(MSG);
  const offs = [];
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };

  // ---- items, loot tables, models (idempotent: every new Game re-installs the module) --------------------------------------
  for (const d of C.ITEM_DEFS) registerItem({ ...d });
  for (const id of STUDIO_IDS) { SCRAP_TABLE[id] = C.scrapTableOf(id); BIG_TABLES[id] = C.bigTableOf(id); }
  const mm = (typeof window !== 'undefined' ? window.__kefalMods : null) || mods;
  if (mm?.itemModels) for (const d of C.ITEM_DEFS) if (!mm.itemModels.has(d.id)) mm.itemModels.set(d.id, () => createStudioItem(d.id));

  const S = {
    theme: null, card: 0, tip: 0,
    step: 0, stepT: 0, warned: false, retry: 0, syncT: 0, shelves: [],
    acc: 0, art: new Map(), lastAlarm: -99, stats: { alarms: 0, shifts: 0, thawed: 0, viral: 0 },
  };
  const run = () => g.run;
  const isMoon = () => run()?.phase === 'moon' && !MOONS[run()?.moon]?.company && !MOONS[run()?.moon]?.home;
  const fac = () => g.world?.facility || null;
  const say = (a, b) => g.ui?.hud?.bigText?.(t(a), b ? t(b) : '');
  const snd = (name, pos, vol = 0.6) => { try { if (g.audio?.has && !g.audio.has(name)) return; g.audio?.at?.(name, pos, vol, { refDistance: 3, maxDistance: 45 }); } catch { /* audio optional */ } };

  /** room type under a world position: string (room), null (corridor) or undefined (outside the station) */
  function roomTypeAt(p) {
    const F = fac(), L = F?.layout;
    if (!F || !L || !p || !F.contains?.(p)) return undefined;
    const i = F.cellAt(p.x, p.z), r = i >= 0 ? L.roomOf[i] : -1;
    return r >= 0 ? L.rooms[r]?.type || null : null;
  }

  // ---- net ---------------------------------------------------------------------------------------------------------------
  let bound = null;
  function bindNet(net) {
    if (!net || bound === net) return;
    bound = net;
    net.on_(MSG, (d) => onMsg(d));
  }
  function onMsg(d) {
    if (!d || typeof d.k !== 'string') return;
    if (d.k === 'alarm') { if (Array.isArray(d.p)) snd('glass_break', new THREE.Vector3(d.p[0], d.p[1], d.p[2]), 0.9); say('EXHIBIT ALARM', 'Something in the museum was bumped. Expect company.'); return; }
    if (!S.shelves.length) return;
    const n = clamp(d.n | 0, 0, 1e7);
    if (d.k === 'set') { if (n !== S.step) applyStep(n, true); return; }
    if (d.k === 'warn') {
      g.ui?.toast?.(t('CLASS BELL: the shelves are about to shift'), 'warn');
      const s = S.shelves[0]; if (s) snd('bell', new THREE.Vector3(s.x[0], s.y + 1.5, s.z), 0.8);
      return;
    }
    if (d.k === 'go') applyStep(n, false);
  }

  // ---- sliding library shelves -----------------------------------------------------------------------------------------
  function placeCollider(s) {
    const F = fac();
    if (!F || s.col) return;
    try {
      s.col = g.physics.addStaticBox(s.cur, s.y + SHELF_H / 2, s.z, SHELF_W / 2, SHELF_H / 2, SHELF_D / 2, 0, G.STATIC, { kind: 'prop', id: 'st:rail_shelf' });
      F.colliders?.push(s.col);   // facility teardown removes it with the rest
    } catch (e) { console.warn('[repomaps] shelf collider', e); }
  }
  function dropCollider(s) {
    if (!s.col) return;
    try { g.physics.removeCollider(s.col); const a = fac()?.colliders; const i = a ? a.indexOf(s.col) : -1; if (i >= 0) a.splice(i, 1); } catch { /* already gone */ }
    s.col = null;
  }
  function applyStep(n, instant) {
    S.step = n;
    for (const s of S.shelves) {
      s.tgt = C.shelfAt(s.at0, n);
      if (instant) { dropCollider(s); s.cur = s.x[s.tgt]; s.obj.position.x = s.cur; s.obj.updateMatrixWorld(true); placeCollider(s); s.moving = false; }
      else if (Math.abs(s.cur - s.x[s.tgt]) > 0.01) { dropCollider(s); s.moving = true; snd('door_close', new THREE.Vector3(s.cur, s.y + 1, s.z), 0.7); }
    }
    if (!instant) S.stats.shifts++;
  }
  function slide(dt) {
    for (const s of S.shelves) {
      if (!s.moving) continue;
      const goal = s.x[s.tgt], d = goal - s.cur, stepLen = SHELF_SPEED * dt;
      if (Math.abs(d) <= stepLen) { s.cur = goal; s.moving = false; s.obj.position.x = goal; s.obj.updateMatrixWorld(true); placeCollider(s); }
      else { s.cur += Math.sign(d) * stepLen; s.obj.position.x = s.cur; s.obj.updateMatrixWorld(true); }
    }
  }
  function hostShelves(dt) {
    if (!S.shelves.length || !isMoon()) return;
    const players = (g.aiPlayers?.() || []).filter((p) => !p.dead && !p.inShip && p.zone === 'in');
    if (!players.length) return;   // frozen and identical everywhere while nobody is inside
    S.stepT += dt; S.syncT += dt;
    if (S.syncT > 25) { S.syncT = 0; g.net.broadcast(MSG, { k: 'set', n: S.step }); }
    if (!S.warned && S.stepT >= C.SHELF_STEP - C.SHELF_WARN) { S.warned = true; g.net.broadcast(MSG, { k: 'warn', n: S.step + 1 }); }
    if (S.stepT < C.SHELF_STEP) return;
    const next = S.step + 1;
    const blocked = S.shelves.some((s) => C.shelfBlocked({ x: s.x[C.shelfAt(s.at0, next)], z: s.z, hw: SHELF_W / 2, hd: SHELF_D / 2 }, players.map((p) => p.pos)));
    if (blocked) { S.stepT = C.SHELF_STEP - 2; return; }   // somebody stands in the track: try again in 2 s
    S.stepT = 0; S.warned = false;
    g.net.broadcast(MSG, { k: 'go', n: next });
  }

  // ---- host: viral growth / thaw / exhibit alarm ----------------------------------------------------------------------------
  const val = (it, v) => { v = Math.round(v); if (v !== it.value) g.net.broadcast('it', { e: 'val', id: it.id, v }); };
  function hostItems(dt) {
    if (!S.theme || !isMoon()) return;
    S.acc += dt;
    const F = fac();
    if (S.theme === 'museum') { S.artT = (S.artT || 0) + dt; if (S.artT >= 0.25) { S.artT = 0; museumTick(); } }
    if (S.acc < 4) return;   // coarse ticks: values are integers (a base-45 item gains ~1 per tick) and every change shows a float text on the peers
    const step = S.acc; S.acc = 0;
    for (const it of g.items.items.values()) {
      const def = it.def;
      if (!def || !(it.value > 0)) continue;
      if (def.viral && it.holder) {
        const ap = g.aiPlayerById?.(it.holder);
        if (!ap || ap.dead) continue;
        const studio = roomTypeAt(ap.pos) === 'studio';
        const nv = C.viralNext(it.value, it.baseValue, step, studio);
        if (nv > it.value) { val(it, nv); S.stats.viral++; }
      } else if (def.frozen && F) {
        const ap = it.holder ? g.aiPlayerById?.(it.holder) : null;
        const pos = ap ? ap.pos : it.obj.position;
        let zone;
        if (ap ? ap.inShip : insideShip(pos)) zone = 'ship';
        else { const rt = roomTypeAt(pos); zone = rt === undefined ? 'outside' : C.zoneOf(rt, STUDIO_THEMES.colddata.COLD_ROOMS); }
        const nv = C.thawNext(it.value, it.baseValue, step, zone);
        if (nv < it.value) { val(it, nv); S.stats.thawed++; }
      }
    }
  }
  function museumTick() {
    const seen = new Set();
    for (const it of g.items.items.values()) {
      if (!it.def?.art) continue;
      seen.add(it.id);
      const prev = S.art.get(it.id);
      const cur = { value: it.value, world: it.state === 'world', pos: it.obj.position.clone() };
      if (C.artBumped(prev, cur)) alarm(cur.pos);
      S.art.set(it.id, cur);
    }
    for (const [id, prev] of S.art) if (!seen.has(id)) { S.art.delete(id); if (C.artBumped(prev, null) && prev.pos) alarm(prev.pos); }   // vanished from the floor = broken
  }
  function alarm(pos) {
    const now = g.time || 0;
    if (now - S.lastAlarm < C.ALARM_COOLDOWN) return;
    S.lastAlarm = now; S.stats.alarms++;
    let ok = false;
    try { ok = !!g.facilitysys?.force?.('alarm'); } catch { ok = false; }
    try { g.creatures?.noise?.(pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), 2.6); } catch { /* creatures optional */ }
    g.net.broadcast(MSG, { k: 'alarm', p: [pos.x, pos.y, pos.z], f: ok ? 1 : 0 });
  }

  // ---- ice: freezer / ice-hall floors slide (same blend as worldx frozen lakes) -----------------------------------------------
  const P = g.player;
  const hadOwn = Object.prototype.hasOwnProperty.call(P, 'update');
  const origUpdate = P.update;
  let live = true;
  const wrapped = function (dt, input) {
    const ice = live && S.theme === 'colddata' && this.indoor && this.grounded && !this.dead && STUDIO_THEMES.colddata.ICE_ROOMS.includes(roomTypeAt(this.pos));
    const vx = this.vel.x, vz = this.vel.z;
    const r = origUpdate.call(this, dt, input);
    if (ice && this.grounded) {
      const k = clamp(C.ICE_SLIDE * dt * 60, 0.03, 0.4);
      this.vel.x = vx + (this.vel.x - vx) * k;
      this.vel.z = vz + (this.vel.z - vz) * k;
    }
    return r;
  };
  P.update = wrapped;

  // ---- events -----------------------------------------------------------------------------------------------------------------
  on('netReady', (net) => bindNet(net));
  if (g.net) bindNet(g.net);
  on('mapLoaded', (world) => {
    const th = world?.facility?.layout?.theme;
    S.theme = STUDIO_IDS.includes(th) ? th : null;
    S.step = 0; S.stepT = 0; S.warned = false; S.syncT = 0; S.acc = 0; S.art.clear(); S.lastAlarm = -99;
    S.shelves = (world?.facility?.layout?.stShelves || []).map((s) => ({ ...s, at0: s.at, tgt: s.at, moving: false, col: s.col || null }));
    S.card = S.theme ? 3.2 : 0; S.tip = S.theme ? 9 : 0;
  });
  on('phase', () => { if (run()?.phase !== 'moon') { S.card = 0; S.tip = 0; } });
  on('update', (dt) => {
    try {
      if (S.card > 0 && isMoon()) { S.card -= dt; if (S.card <= 0) { const d = STUDIO_THEMES[S.theme]; if (d) g.ui?.hud?.bigText?.(t(d.name).toLocaleUpperCase(), t(d.blurb)); } }
      if (S.tip > 0 && isMoon() && S.card <= 0) { S.tip -= dt; if (S.tip <= 0) { const d = STUDIO_THEMES[S.theme]; if (d) g.ui?.toast?.(t(d.sig), 'info'); } }
      if (S.shelves.length) slide(dt);
      if (g.isHost) { hostShelves(dt); hostItems(dt); }
    } catch (e) { console.warn('[repomaps] update', e); }
  });

  return {
    themes: STUDIO_THEMES, state: S, items: C.ITEM_DEFS.map((d) => d.id),
    roomTypeAt,
    /** debug / tests (host): shift the shelves now */
    shiftNow() { if (!g.isHost || !S.shelves.length) return false; S.stepT = 0; S.warned = false; g.net.broadcast(MSG, { k: 'go', n: S.step + 1 }); return S.step + 1; },
    dispose() {
      live = false;
      for (const off of offs.splice(0)) { try { off(); } catch { /* ignore */ } }
      if (P.update === wrapped) { if (hadOwn) P.update = origUpdate; else delete P.update; }
      for (const s of S.shelves) s.col = null;
    },
  };
}
