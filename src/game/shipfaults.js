// SHIP FAULTS BEFORE TAKEOFF (wave 2, gameplay2). The ship no longer leaves instantly: pulling the lever (or the midnight autopilot)
// starts a PRE-FLIGHT CHECK that rolls 1-3 faults which block takeoff until they are fixed:
//   Fuel Line Leak (hold E, then turn the valve) · Nav Computer Reboot (type the code shown on ANOTHER screen: one reads, one types;
//   solo it is flashed for a moment) · Coolant Overheat (keep the needle in the green) · Hull Breach (plug it with a Hull Patch item or
//   hold E to weld) · Power Relay (the fuse-box wire minigame) · Thruster Jam (hit it 3 times with a melee weapon).
// Fewer faults early, more with Threat / hull damage (soft reads: game.balance.threat(), run.hullDamage, game.siege.hull).
// Stations are wall panels placed at a free spot of the ship (bounding-box search against the ship's props). HUD checklist
// "PRE-FLIGHT FAULTS 1/3", alarm loop + red strobe. Lever mode: creatures near the ship start a 75 s purge countdown; midnight
// autopilot: faults auto-resolve after 45 s WITH A PENALTY (a scrap item is sucked out, or the crew takes hull damage).
// When everything is fixed: "ignition in 3" and the ORIGINAL hostBeginTakeoff runs (instance-wrapped like rpg.js wraps hostSell).
// Host-authoritative; net type 'g2' (see gameplay2.js): requests start / fix / jam / sync, messages faults / clear / fixed / hit / bad.
import * as THREE from 'three';
import { registerItem, ITEMS, isSellable, itemDef } from './items.js';
import { addTranslations, t, tf } from '../core/i18n.js';
import { createFaultStation, PANEL } from '../models/shipfaults.js';
import { createHullPatchModel } from '../models/creeper.js';
import { insideShip } from '../world/ship.js';
import { hudDock } from '../ui/dock.js';
import { repairMul, repairTime } from './aptitudes.js';

export const FAULTS = {
  fuel: { name: 'Fuel Line Leak', hint: 'Hold E, then turn the valve', mode: 'valve', hold: 1.2, min: 1.8, easy: true },
  nav: { name: 'Nav Computer Reboot', hint: 'One reads the NAV DISPLAY, one types the code at the NAV CONSOLE', mode: 'code', min: 1.2, easy: false },
  coolant: { name: 'Coolant Overheat', hint: 'Keep the needle in the green', mode: 'needle', min: 5, easy: false },
  hull: { name: 'Hull Breach', hint: 'Plug it with a Hull Patch, or hold E to weld', mode: 'patch', hold: 8, min: 3, easy: true },
  relay: { name: 'Power Relay', hint: 'Reconnect the wires', mode: 'fuse', min: 2, easy: true },
  jam: { name: 'Thruster Jam', hint: 'Hit it 3 times with a melee weapon', mode: 'hit', need: 3, easy: true },
};
export const FAULT_IDS = Object.keys(FAULTS);
export const MIDNIGHT_S = 45;        // autopilot: faults auto-resolve (with a penalty) after this
export const PRESSURE_S = 75;        // lever mode: countdown that starts when creatures are near the ship
export const LAUNCH_S = 3;           // "ignition in 3"

// ---------------------------------------------------------------- pure logic (node-tested)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** How many faults: 1 in quota 0, 1-2 in quota 1-2, 2-3 later; Threat >= 60 (70 in quota 0) or hull damage >= 40 % (50 %) adds one; capped 1..3. */
export function rollFaultCount(quotaIndex = 0, threat = 0, hull = 0, rand = Math.random) {
  const q = Math.max(0, quotaIndex | 0);
  let n = q === 0 ? 1 : q <= 2 ? 1 + (rand() < 0.5 ? 1 : 0) : 2 + (rand() < 0.35 ? 1 : 0);
  if (q === 0 ? (threat >= 70 || hull >= 0.5) : (threat >= 60 || hull >= 0.4)) n += 1;
  if (q > 0 && (hull >= 0.75 || threat >= 90)) n += 1;
  return clamp(n, 1, 3);
}
/** which faults: unique, only the easy ones in quota 0 */
export function pickFaults(count, quotaIndex = 0, rand = Math.random) {
  const pool = FAULT_IDS.filter((id) => quotaIndex > 0 || FAULTS[id].easy);
  const out = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.min(pool.length - 1, Math.floor(rand() * pool.length)), 1)[0]);
  return out;
}
/** seconds until the automatic purge: midnight 45 s; lever mode only while creatures are near the ship */
export const deadlineSeconds = (reason, creaturesNear = 0) => (reason === 'midnight' ? MIDNIGHT_S : creaturesNear > 0 ? PRESSURE_S : null);
/** penalty for one unresolved fault when the countdown runs out */
export const penaltyKind = (hasScrap, rand = Math.random) => (hasScrap && rand() < 0.6 ? 'scrap' : 'damage');
/** hold time with the crew role's repair speed (Engineer +40 % => /1.4) */
export const holdSeconds = (base, repairBonus = 0) => repairTime(base, repairBonus);
/** 5-digit reboot code */
export const makeCode = (rand = Math.random) => String(Math.floor(rand() * 90000) + 10000);

// ---- placement: wall panels at the first free spot (kind -> [wall, centre y, preferred coordinate along the wall])
export const SHIP_HALF = { x: 7, z: 3.5 };
export const PREFS = {
  fuel: [['-x', 0.58, -0.7], ['+x', 0.7, -1.0], ['-z', 0.7, -5.3], ['+z', 0.7, 0.2]],
  jam: [['+x', 0.68, -1.0], ['-x', 0.58, 0.0], ['+z', 0.68, 0.0], ['-z', 0.68, 2.4]],
  coolant: [['-z', 1.4, -5.3], ['+x', 1.4, -1.0], ['+z', 1.4, -0.5], ['-z', 1.4, 2.3]],
  relay: [['+x', 1.45, -1.0], ['-z', 1.45, 2.3], ['+z', 1.45, -0.5], ['-z', 1.45, -5.3]],
  hull: [['-z', 1.2, 2.3], ['+z', 1.2, 0.3], ['+x', 1.2, -1.0], ['-z', 1.2, -5.3]],
  nav: [['+z', 1.3, -4.4], ['-z', 1.3, -5.3], ['+x', 1.3, -1.0], ['+z', 1.3, 0.2]],
  navd: [['+z', 1.75, 0.1], ['-z', 1.75, 2.4], ['+x', 1.75, -1.0], ['-z', 1.75, -5.3], ['+z', 1.75, -4.4]],
};
export const WINDOW_BOX = { min: [-7.2, 1.16, -2.4], max: [-6.6, 2.8, 2.4] };   // the cockpit window (a texture, not a mesh)
export function panelPose(wall, along, y) {
  if (wall === '+z') return { x: along, y, z: SHIP_HALF.z, ry: Math.PI, wall };
  if (wall === '-z') return { x: along, y, z: -SHIP_HALF.z, ry: 0, wall };
  if (wall === '+x') return { x: SHIP_HALF.x, y, z: along, ry: -Math.PI / 2, wall };
  return { x: -SHIP_HALF.x, y, z: along, ry: Math.PI / 2, wall };
}
/** axis-aligned box of a panel at `pose` (grown by m) */
export function panelBox(pose, m = 0.04) {
  const nx = Math.round(Math.sin(pose.ry)), nz = Math.round(Math.cos(pose.ry)), hw = PANEL.w / 2, hh = PANEL.h / 2;
  const alongX = nz !== 0;
  const x0 = alongX ? pose.x - hw : Math.min(pose.x, pose.x + nx * PANEL.d), x1 = alongX ? pose.x + hw : Math.max(pose.x, pose.x + nx * PANEL.d);
  const z0 = alongX ? Math.min(pose.z, pose.z + nz * PANEL.d) : pose.z - hw, z1 = alongX ? Math.max(pose.z, pose.z + nz * PANEL.d) : pose.z + hw;
  return { min: [x0 - m, pose.y - hh - m, z0 - m], max: [x1 + m, pose.y + hh + m, z1 + m] };
}
export const boxesHit = (a, b) => a.min[0] < b.max[0] && a.max[0] > b.min[0] && a.min[1] < b.max[1] && a.max[1] > b.min[1] && a.min[2] < b.max[2] && a.max[2] > b.min[2];
/** first free spot for `kind` (obstacles: boxes of props + stations already placed); avoid = { pose, d }: keep this far from another station */
export function findFreeSpot(kind, obstacles = [], avoid = null) {
  let fallback = null;
  for (const [wall, y, pref] of PREFS[kind] || []) {
    const lo = wall === '+z' || wall === '-z' ? -SHIP_HALF.x + 0.55 : -SHIP_HALF.z + 0.55, hi = -lo;
    const cands = [];
    for (let a = lo; a <= hi + 1e-6; a += 0.25) cands.push(a);
    cands.sort((p, q) => Math.abs(p - pref) - Math.abs(q - pref));
    for (const a of cands) {
      const pose = panelPose(wall, a, y);
      fallback = fallback || pose;
      if (avoid && Math.hypot(pose.x - avoid.pose.x, pose.z - avoid.pose.z) < avoid.d) continue;
      const box = panelBox(pose);
      if (obstacles.some((o) => boxesHit(box, o))) continue;
      return { ...pose, free: true };
    }
  }
  return { ...(fallback || panelPose('+z', 0, 1.3)), free: false };
}

addTranslations({
  'Fuel Line Leak': 'Yakıt Hattı Sızıntısı', 'Nav Computer Reboot': 'Navigasyon Bilgisayarı Yeniden Başlatma', 'Coolant Overheat': 'Soğutucu Aşırı Isınma',
  'Hull Breach': 'Gövde Yarığı', 'Power Relay': 'Güç Rölesi', 'Thruster Jam': 'İtici Sıkışması',
  'Hold E, then turn the valve': 'E tuşunu basılı tut, sonra vanayı çevir', 'One reads the NAV DISPLAY, one types the code at the NAV CONSOLE': 'Biri NAV EKRANINDAKİ kodu okur, biri NAV KONSOLUNA yazar',
  'Keep the needle in the green': 'İbreyi yeşil bölgede tut', 'Plug it with a Hull Patch, or hold E to weld': 'Gövde Yaması ile kapat ya da E basılı tutup kaynak yap',
  'Reconnect the wires': 'Kabloları yeniden bağla', 'Hit it 3 times with a melee weapon': 'Yakın dövüş silahıyla 3 kez vur',
  'PRE-FLIGHT FAULTS': 'UÇUŞ ÖNCESİ ARIZALAR', 'PRE-FLIGHT COMPLETE - ignition in {n}': 'UÇUŞ ÖNCESİ KONTROL TAMAM - ateşleme {n}',
  'PURGE IN {n}s': 'TAHLİYE {n} sn', 'creatures near the ship': 'gemiye yakın yaratık', 'Hull Patch': 'Gövde Yaması', 'Plugs a hull breach.': 'Gövde yarığını kapatır.',
  'Wrong code.': 'Yanlış kod.', 'Read the code out loud to whoever types it.': 'Kodu yazan kişiye yüksek sesle oku.', 'Hit it with a melee weapon.': 'Yakın dövüş silahıyla vur.',
  'NAV DISPLAY': 'NAV EKRANI', 'NAV CONSOLE': 'NAV KONSOLU', 'Take off is blocked: fix the faults first.': 'Kalkış engellendi: önce arızaları gider.',
});

// ---------------------------------------------------------------- item: Hull Patch (also buyable in the Company Store)
export function registerFaultItems() {
  if (!ITEMS.hullpatch) registerItem({ id: 'hullpatch', name: 'Hull Patch', kind: 'tool', price: 18, weight: 2, hands: 1, rarity: 'common', tip: 'Plugs a hull breach.' });
  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  if (mm?.itemModels && !mm.itemModels.has('hullpatch')) mm.itemModels.set('hullpatch', () => createHullPatchModel());
}
registerFaultItems();

// ---------------------------------------------------------------- game glue
export function installShipFaults(game, ctx = {}) {
  const offs = [];
  const st = { disposed: false };
  const F = { act: false, why: null, list: [], dl: null, launchAt: null, near: 0, calm: 0, pT: 0, snapT: 0, starts: new Map(), hitCd: new Map(), bypass: false, remindT: -99, penalties: [] };   // host
  const C = { act: false, why: null, faults: new Map(), dlAt: null, launchAt: null, near: 0, hold: null, alarm: null, holdEl: null, sync: 0 };   // every peer (client view)
  const V = new THREE.Vector3(), V2 = new THREE.Vector3(), Q = new THREE.Quaternion();
  const me = () => game.selfId;
  const toast = (s, k = 'info') => { try { game.ui?.toast?.(s, k); } catch { /* ignore */ } };
  const sys = (text, kind = 'info') => game.net?.broadcast('sys', { text, kind });
  const apt = () => game.gameplay2?.aptitudes;
  const inShipNow = () => !!game.player && !game.player.dead && game.player.inShip;
  const enabled = () => game.config?.shipFaults !== false;
  const softHull = () => {
    let h = Number(game.run?.hullDamage);
    if (!Number.isFinite(h)) { const s = game.siege; h = typeof s?.hullDamage === 'function' ? Number(s.hullDamage()) : Number(s?.hullDamage ?? s?.hull ?? 0); }
    if (!Number.isFinite(h) || h < 0) return 0;
    return h > 1 ? clamp(h / 100, 0, 1) : h;
  };
  const threat = () => { try { return Number(game.balance?.threat?.()) || Number(game.run?.threat) || 0; } catch { return 0; } };

  // ================================================================ HOST
  const origTakeoff = game.hostBeginTakeoff;
  function snapshot() {
    const now = game.time || 0;
    return {
      k: 'faults', act: F.act ? 1 : 0, why: F.why, dl: F.dl != null ? +Math.max(0, F.dl - now).toFixed(1) : null, near: F.near, ln: F.launchAt != null ? +Math.max(0, F.launchAt - now).toFixed(1) : null,
      list: F.list.map((f) => ({ i: f.id, ty: f.ty, d: f.done ? 1 : 0, p: +f.prog.toFixed(2), h: f.hits, c: f.code, ov: f.st.some((s) => !s.free) ? 1 : 0, s: f.st.map((s) => [s.k, +s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2), +s.ry.toFixed(3)]) })),
    };
  }
  const bcast = () => { game.net.broadcast('g2', snapshot()); F.snapT = 2.5; };

  function collectObstacles() {
    const out = [WINDOW_BOX];
    const b = new THREE.Box3();
    const grp = game.ship?.group;
    if (!grp) return out;
    grp.updateMatrixWorld(true);
    grp.traverse((o) => {
      if (!o.isMesh || o.userData?.g2 || o.visible === false) return;
      b.setFromObject(o);
      if (b.isEmpty()) return;
      const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
      if (Math.max(sx, sy, sz) > 5.5) return;                                        // the shell (floor, walls, ceiling)
      if (b.min.x < -7.4 || b.max.x > 7.4 || b.min.z < -3.9 || b.max.z > 3.9 || b.max.y < 0.05 || b.min.y > 3.3) return;   // outside the cabin
      out.push({ min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] });
    });
    return out;
  }
  function place(types) {
    const obstacles = collectObstacles();
    const list = [];
    const put = (kind, avoid) => {
      const spot = findFreeSpot(kind, obstacles, avoid);
      obstacles.push(panelBox(spot, 0.12));
      return { k: kind === 'navd' ? 'aux' : 'main', ...spot };
    };
    types.forEach((ty, i) => {
      const f = { id: 'f' + i, ty, done: false, prog: 0, hits: 0, code: ty === 'nav' ? makeCode() : null, st: [] };
      const main = put(ty);
      f.st.push(main);
      if (ty === 'nav') f.st.push(put('navd', { pose: main, d: 3.4 }));
      list.push(f);
    });
    return list;
  }
  function begin(reason, only = null) {   // `only`: force the fault types (tests / debug)
    const run = game.run, q = run.quotaIndex | 0;
    const th = threat(), hull = softHull();
    const types = Array.isArray(only) && only.length ? only.filter((x) => FAULTS[x]) : pickFaults(rollFaultCount(q, th, hull), q);
    F.act = true; F.why = reason; F.list = place(types); F.launchAt = null; F.near = 0; F.calm = 0; F.pT = 0; F.starts.clear(); F.hitCd.clear();
    F.dl = reason === 'midnight' ? (game.time || 0) + MIDNIGHT_S : null;
    const hp = F.list.find((f) => f.ty === 'hull');
    if (hp) spawnPatch(hp);
    bcast();
    sys(reason === 'midnight'
      ? `AUTOPILOT: ${F.list.length} pre-flight fault${F.list.length > 1 ? 's' : ''}! Departure in ${MIDNIGHT_S} s - repair what you can, the rest will cost you.`
      : `PRE-FLIGHT CHECK: ${F.list.length} fault${F.list.length > 1 ? 's' : ''} block takeoff. Fix them all!`, 'bad');
    game.net.broadcast('fx', { k: 'snd', s: 'ship_alarm', p: [0, 2, 0], v: 1, r: 30, m: 200 });
    game.mods?.emit('tfg:faults', { reason, types, threat: th, hull }, game);
    return F.list;
  }
  function spawnPatch(f) {
    try {
      const have = game.items.all().some((it) => it.type === 'hullpatch' && (it.holder || insideShip(it.obj.position)));
      if (have) return;
      const s = f.st[0], nx = Math.sin(s.ry), nz = Math.cos(s.ry);
      game.items.hostSpawn('hullpatch', new THREE.Vector3(s.x + nx * 0.8, 1.3, s.z + nz * 0.8), {});
    } catch (e) { console.warn('[faults] patch spawn', e); }
  }
  function clearHost() {
    if (!F.act && !F.list.length) return;
    F.act = false; F.list = []; F.dl = null; F.launchAt = null; F.starts.clear();
    game.net?.broadcast('g2', { k: 'clear' });
  }
  function launch() {
    const why = F.why || 'lever';
    clearHost();
    F.bypass = true;
    try { origTakeoff.call(game, why); } finally { F.bypass = false; }
  }
  function fixed(f, by) {
    if (f.done) return;
    f.done = true; f.prog = 1;
    const q = game.run?.quotaIndex | 0;
    if (by) game.net.broadcast('xp', { to: by, xp: 30 + q * 8, coin: 4, reason: `Ship fault: ${FAULTS[f.ty].name}` });
    game.net.broadcast('g2', { k: 'fixed', i: f.id, ty: f.ty, by });
    game.mods?.emit('tfg:faultFixed', f.ty, by, game);
    if (F.list.every((x) => x.done)) {
      F.launchAt = (game.time || 0) + LAUNCH_S;
      sys('PRE-FLIGHT COMPLETE. Ignition in 3...', 'good');
    }
    bcast();
  }
  function expire() {
    const left = F.list.filter((f) => !f.done);
    for (const f of left) {
      const scrap = game.items.inShipItems().filter((it) => isSellable(it.def) && !it.soulbound && it.type !== 'body');
      if (penaltyKind(scrap.length > 0) === 'scrap') {
        const it = scrap[Math.floor(Math.random() * scrap.length)];
        game.net.broadcast('it', { e: 'rm', id: it.id });
        sys(`The ${it.def.name} (▮${it.value}) was sucked out through the ${FAULTS[f.ty].name}!`, 'bad');
        F.penalties.push({ ty: f.ty, kind: 'scrap', item: it.type, value: it.value });
      } else {
        for (const p of game.aiPlayers()) if (!p.dead && p.inShip) game.hostHurtPlayer(p.id, 14, 'shipfault', null, null);
        sys(`Hull stress from the ${FAULTS[f.ty].name}: everybody aboard is hurt.`, 'bad');
        F.penalties.push({ ty: f.ty, kind: 'damage' });
      }
      try { game.siege?.damageHull?.(0.06); } catch { /* soft */ }
    }
    if (left.length) game.net.broadcast('fx', { k: 'snd', s: 'glass_break', p: [0, 2, 0], v: 1, r: 12, m: 100 });
    launch();
  }
  function countNear() {
    let n = 0;
    for (const c of game.creatures.host.values()) {
      if (c.dead || c.def.hazard) continue;
      if (Math.hypot(c.pos.x, c.pos.z) < 45 && Math.abs(c.pos.y) < 25) n++;
    }
    return n;
  }
  function hostTick(dt) {
    if (!F.act) return;
    const now = game.time || 0;
    F.snapT -= dt;
    if (F.snapT <= 0) bcast();
    if (F.launchAt != null) { if (now >= F.launchAt) launch(); return; }
    F.pT -= dt;
    if (F.pT <= 0) {
      F.pT = 1;
      const n = countNear();
      if (n !== F.near) { F.near = n; if (F.snapT > 0.5) F.snapT = 0.4; }
      if (n > 0 && F.dl == null) { F.dl = now + PRESSURE_S; F.calm = 0; sys(`${n} creature${n > 1 ? 's' : ''} near the ship! Emergency purge in ${PRESSURE_S} s.`, 'bad'); bcast(); }
      else if (n === 0 && F.dl != null && F.why === 'lever') { if (++F.calm >= 12) { F.dl = null; F.calm = 0; sys('The ship is quiet again. Purge cancelled.', 'info'); bcast(); } }
      else F.calm = 0;
    }
    if (F.dl != null && now >= F.dl) expire();
  }

  // ---- host requests (dispatched from gameplay2.js: op start | fix | jam | sync)
  function station(f, k = 'main') { return f.st.find((s) => s.k === k) || f.st[0]; }
  function nearStation(pl, f, r = 6.5) { const s = station(f); return pl && !pl.dead && pl.inShip && V.set(s.x, s.y, s.z).distanceTo(V2.set(pl.pos.x, pl.pos.y + 1.0, pl.pos.z)) <= r; }
  function onRequest(d, from) {
    if (!game.isHost) return;
    if (d.op === 'sync') { game.net.sendTo(from, 'g2', snapshot()); return; }
    if (!F.act || F.launchAt != null) return;
    const f = F.list.find((x) => x.id === String(d.fid));
    const pl = game.aiPlayerById(from);
    if (!f || f.done || !nearStation(pl, f)) return;
    const spec = FAULTS[f.ty], now = game.time || 0, key = from + ':' + f.id;
    if (d.op === 'start') { F.starts.set(key, now); return; }
    if (d.op === 'jam') {
      if (f.ty !== 'jam' || now - (F.hitCd.get(key) || -9) < 0.28) return;
      F.hitCd.set(key, now);
      f.hits++; f.prog = f.hits / spec.need;
      game.net.broadcast('g2', { k: 'hit', i: f.id, n: f.hits, at: station(f).x });
      if (f.hits >= spec.need) fixed(f, from); else bcast();
      return;
    }
    if (d.op !== 'fix') return;
    const started = F.starts.get(key);
    if (started == null) return;
    const el = now - started;
    if (f.ty === 'nav') {
      if (el < spec.min) return;
      if (String(d.code) !== f.code) { game.net.sendTo(from, 'g2', { k: 'bad', i: f.id }); return; }
    } else if (f.ty === 'hull' && d.item) {
      const it = game.items.get(String(d.item));
      if (!it || it.type !== 'hullpatch' || it.holder !== from || el < 0.5) return;
      game.net.broadcast('it', { e: 'rm', id: it.id });
    } else if (el < spec.min * (f.ty === 'hull' ? 1 / repairMul(apt()?.bonusOf(from, 'repairSpeed')) : 1) * 0.85) return;
    fixed(f, from);
  }

  // ---- wrap the original takeoff: faults first (alldead skips them)
  if (typeof origTakeoff === 'function') {
    game.hostBeginTakeoff = function (reason) {
      const ph = this.run?.phase;
      if ((ph !== 'moon' && ph !== 'company') || reason === 'alldead' || F.bypass || !enabled()) return origTakeoff.call(this, reason);
      if (F.act) {
        const now = game.time || 0;
        if (reason === 'lever' && now - F.remindT > 3) { F.remindT = now; const n = F.list.filter((f) => !f.done).length; if (n) sys(`Takeoff blocked: ${n} fault${n > 1 ? 's' : ''} left.`, 'bad'); }
        return;
      }
      begin(reason);
    };
  }
  offs.push(game.mods.on('update', (dt, g) => { if (g === game && game.isHost) { try { hostTick(Math.min(dt, 0.25)); } catch (e) { if (!st.w1) { st.w1 = 1; console.warn('[faults] host', e); } } } }));
  offs.push(game.mods.on('phase', (ph, g) => { if (g !== game) return; if (ph !== 'moon' && ph !== 'company') { if (game.isHost) clearHost(); clearClient(); } }));

  // ================================================================ CLIENT (every peer, host included)
  function ensureStation(cf, s) {
    if (s.model || !game.ship?.group) return;
    try {
      s.model = createFaultStation(s.k === 'aux' ? 'navd' : cf.ty);
      s.model.root.traverse((o) => { o.userData.g2 = true; });
      s.model.root.position.set(s.x, s.y, s.z); s.model.root.rotation.y = s.ry;
      game.ship.group.add(s.model.root);
      if (s.k === 'main' && game.lights) s.light = game.lights.add({ pos: new THREE.Vector3(s.x + Math.sin(s.ry) * 0.5, s.y + 0.3, s.z + Math.cos(s.ry) * 0.5), color: 0xff2a2a, intensity: 1.1, distance: 4.5, group: 'g2fault' });
    } catch (e) { console.warn('[faults] station', e); }
  }
  function dropStation(s) { if (s.light) game.lights?.remove(s.light); s.model?.dispose(); s.model = null; s.light = null; }
  function clearClient() {
    for (const cf of C.faults.values()) for (const s of cf.st) dropStation(s);
    C.faults.clear(); C.act = false; C.dlAt = null; C.launchAt = null; C.hold = null;
    C.alarm?.stop?.(0.4); C.alarm = null;
    if (C.holdEl) C.holdEl.style.display = 'none';
  }
  function applySnap(d) {
    if (!d.act) { clearClient(); return; }
    const first = !C.act;
    C.act = true; C.why = d.why; C.near = d.near || 0;
    C.dlAt = d.dl != null ? (game.time || 0) + d.dl : null;
    C.launchAt = d.ln != null ? (game.time || 0) + d.ln : null;
    const seen = new Set();
    for (const e of d.list || []) {
      seen.add(e.i);
      let cf = C.faults.get(e.i);
      if (!cf) { cf = { id: e.i, ty: e.ty, st: e.s.map((a) => ({ k: a[0], x: a[1], y: a[2], z: a[3], ry: a[4], model: null, light: null })), hitT: 0 }; C.faults.set(e.i, cf); }
      cf.done = !!e.d; cf.prog = e.p || 0; cf.hits = e.h || 0; cf.code = e.c || null; cf.ov = e.ov;
    }
    for (const [id, cf] of [...C.faults]) if (!seen.has(id)) { for (const s of cf.st) dropStation(s); C.faults.delete(id); }
    for (const cf of C.faults.values()) for (const s of cf.st) ensureStation(cf, s);
    if (first) {
      const n = C.faults.size;
      try { game.ui?.hud?.bigText?.(t('PRE-FLIGHT FAULTS'), `${n} ${n > 1 ? 'systems' : 'system'} failing`); } catch { /* ignore */ }
      if (game.audio && !C.alarm) C.alarm = game.audio.play('alarm_loop', { loop: true, pos: new THREE.Vector3(0, 2.2, 0), volume: 0.3, refDistance: 6, maxDistance: 40 }) || null;
    }
  }
  function onMsg(d) {
    if (st.disposed) return;
    if (d.k === 'faults') applySnap(d);
    else if (d.k === 'clear') clearClient();
    else if (d.k === 'fixed') {
      const nm = FAULTS[d.ty]?.name || d.ty;
      toast(`✔ ${t(nm)} — ${d.by ? game.playerName(d.by) : ''}`, 'good');
      game.audio?.ui?.('ui_quota_met', 0.4);
    } else if (d.k === 'hit') {
      const cf = C.faults.get(d.i); if (cf) cf.hitT = 0.5;
      try { game.audio?.at?.('hit_metal', V.set(cf?.st[0].x || 0, 1, cf?.st[0].z || 0), 0.9); } catch { /* ignore */ }
    } else if (d.k === 'bad') { toast(t('Wrong code.'), 'bad'); game.audio?.ui?.('ui_error', 0.6); }
  }

  // ---- local interaction
  function heldType() { try { return game.player.heldItem?.()?.type || null; } catch { return null; } }
  function heldId() { try { return game.player.heldItem?.()?.id || null; } catch { return null; } }
  const q = () => game.run?.quotaIndex | 0;
  const diff = (base) => clamp(base + q() * 0.04 - (apt()?.bonusOf?.(me(), 'minigameEase') || 0), 0, 0.8);
  const crewAboard = () => (inShipNow() ? 1 : 0) + [...game.remotes.values()].filter((r) => !r.dead && insideShip(r.pos)).length;
  function fixReq(f, extra = {}) { game.net.request('g2', { op: 'fix', fid: f.id, ...extra }); }
  function mini(kind, opts, f, extraOf) {
    game.openMinigame(kind, opts, (res) => {
      if (res?.success) fixReq(f, extraOf ? extraOf(res) : {});
      else if (!res?.cancelled) { toast('Repair failed - try again.', 'bad'); game.audio?.ui?.('ui_error', 0.5); }
    });
  }
  function startHold(f, seconds, label, done) {
    game.net.request('g2', { op: 'start', fid: f.id });
    C.hold = { fid: f.id, need: Math.max(0.3, seconds), t: 0, label, done };
  }
  function use(cf, s) {
    if (!inShipNow() || game.minigame || C.launchAt != null) return;
    const spec = FAULTS[cf.ty], mul = apt()?.repairMul?.(me()) || 1;
    game.net.request('g2', { op: 'start', fid: cf.id });
    switch (spec.mode) {
      case 'valve': startHold(cf, spec.hold / mul, t(spec.name), () => mini('g2valve', { difficulty: diff(0.3) }, cf)); break;
      case 'fuse': mini('fuse', { difficulty: diff(0.3) }, cf); break;
      case 'needle': mini('g2needle', { difficulty: diff(0.3) }, cf); break;
      case 'code':
        if (s.k === 'aux') { toast(t('Read the code out loud to whoever types it.'), 'info'); break; }
        mini('g2code', { len: 5, show: crewAboard() < 2 ? cf.code : null, difficulty: 0.3 }, cf, (r) => ({ code: r.text }));
        break;
      case 'patch':
        if (heldType() === 'hullpatch') startHold(cf, 1.0, t('Hull Patch'), () => fixReq(cf, { item: heldId() }));
        else startHold(cf, holdSecondsOf(spec.hold, mul), t(spec.name), () => fixReq(cf, { weld: 1 }));
        break;
      case 'hit': toast(t('Hit it with a melee weapon.'), 'info'); break;
      default: break;
    }
  }
  const holdSecondsOf = (base, mul) => base / mul;
  function addInteractables(list) {
    if (!C.act || !inShipNow() || game.minigame) return;
    const cam = game.camera.position;
    for (const cf of C.faults.values()) {
      if (cf.done) continue;
      const spec = FAULTS[cf.ty];
      for (const s of cf.st) {
        const pos = new THREE.Vector3(s.x + Math.sin(s.ry) * 0.5, s.y, s.z + Math.cos(s.ry) * 0.5);
        if (pos.distanceTo(cam) > 7) continue;
        const aux = s.k === 'aux';
        list.push({
          pos, r: 0.9, reach: 3.0,
          label: () => (aux ? `${t('NAV DISPLAY')}: ${t('Read the code out loud to whoever types it.')}` : cf.ty === 'jam' ? `${t(spec.name)}: ${t(spec.hint)} (${cf.hits}/${spec.need})` : cf.ty === 'nav' ? `${t('NAV CONSOLE')} [E]` : cf.ty === 'hull' ? `${t(spec.name)}: ${heldType() === 'hullpatch' ? 'hold [E] to apply the patch' : t(spec.hint)}` : `${t(spec.name)}: ${spec.mode === 'valve' ? t(spec.hint) : '[E]'}`),
          sub: () => `⚠ ${t('PRE-FLIGHT FAULTS')}`,
          action: () => use(cf, s),
        });
      }
    }
  }
  offs.push(game.mods.on('interactables', (list, g) => { if (g === game) addInteractables(list); }));
  offs.push(game.mods.on('objectives', (add, g) => {
    if (g !== game || !C.act) return;
    const all = [...C.faults.values()], done = all.filter((f) => f.done).length, n = all.length;
    add(`${t('PRE-FLIGHT FAULTS')} ${done}/${n}`, 'main', done === n && n > 0, n ? done / n : 0);
    for (const f of all) add(`${f.done ? '✔' : '◇'} ${t(FAULTS[f.ty].name)}${f.done ? '' : ' — ' + t(FAULTS[f.ty].hint)}`, 'sub', f.done);
    const now = game.time || 0;
    if (C.launchAt != null) add(tf('PRE-FLIGHT COMPLETE - ignition in {n}', { n: Math.max(0, Math.ceil(C.launchAt - now)) }), 'hint');
    else if (C.dlAt != null) add(`${tf('PURGE IN {n}s', { n: Math.max(0, Math.ceil(C.dlAt - now)) })}${C.near ? ` · ${C.near} ${t('creatures near the ship')}` : ''}`, 'warn');
  }));

  // ---- Thruster Jam: a melee swing that lands on the jam station (fists do not count)
  const origMelee = game.resolveMelee;
  if (typeof origMelee === 'function') {
    game.resolveMelee = function (h) {
      try {
        if (C.act && inShipNow()) {
          const held = this.player.heldItem?.(), def = held ? itemDef(held.type) : null;
          if (def && def.kind === 'weapon' && !def.ranged) {
            this.camera.getWorldPosition(V); const fwd = V2.set(0, 0, -1).applyQuaternion(this.camera.getWorldQuaternion(Q));
            for (const cf of C.faults.values()) {
              if (cf.ty !== 'jam' || cf.done) continue;
              const s = cf.st[0], to = new THREE.Vector3(s.x, s.y - 0.1, s.z).sub(V), dist = to.length();
              if (dist > (h.reach || 2) + 1.0 || to.normalize().dot(fwd) < 0.8) continue;
              this.net.request('g2', { op: 'jam', fid: cf.id });
              cf.hitT = 0.5;
              break;
            }
          }
        }
      } catch (e) { console.warn('[faults] melee', e); }
      return origMelee.call(this, h);
    };
  }

  // ---- frame: station visuals, hold progress, strobe
  function ensureHoldDom() {
    if (C.holdEl || typeof document === 'undefined') return;
    C.holdEl = hudDock('bottom', 'g2-hold', 31);
    C.holdEl.style.cssText = 'font-family:VT323,monospace;font-size:24px;color:#ffd9b8;text-shadow:0 0 6px #000;display:none;background:rgba(0,0,0,.55);padding:2px 12px;border:1px solid rgba(255,138,61,.5);min-width:260px;text-align:center';
  }
  function update(dt) {
    if (st.disposed) return;
    if (game.net && !game.isHost && !st.synced && (st.syncT = (st.syncT || 0) + dt) > 1.4) { st.synced = true; game.net.request('g2', { op: 'sync' }); }
    if (!C.act) return;
    const time = game.time || 0;
    for (const cf of C.faults.values()) {
      cf.hitT = Math.max(0, cf.hitT - dt);
      for (const s of cf.st) {
        s.model?.update(dt, time, { done: cf.done, hits: cf.hits, need: FAULTS[cf.ty].need, code: cf.code, prog: cf.prog, hitT: cf.hitT });
        if (s.light) s.light.intensity = cf.done ? 0 : 0.25 + 1.5 * Math.max(0, Math.sin(time * 8));
      }
    }
    // hold interaction (progress dock)
    ensureHoldDom();
    const h = C.hold, input = game.input;
    if (h) {
      const cf = C.faults.get(h.fid);
      const near = cf && V.set(cf.st[0].x, cf.st[0].y, cf.st[0].z).distanceTo(game.camera.position) < 4.2;
      if (!cf || cf.done || game.player.dead || game.minigame || !near) C.hold = null;
      else if (input.isDown('interact') && input.locked) { h.t += dt; if (h.t >= h.need) { const d = h.done; C.hold = null; d?.(); } }
      else { h.t -= dt * 2.5; if (h.t <= 0) C.hold = null; }
    }
    const hh = C.hold;
    const txt = hh ? `${hh.label.toUpperCase()}  ${'█'.repeat(Math.round(hh.t / hh.need * 16)).padEnd(16, '░')}  ${Math.min(hh.need, hh.t).toFixed(1)}/${hh.need.toFixed(1)}s (hold E)` : '';
    if (C.holdEl && C.holdEl.textContent !== txt) { C.holdEl.textContent = txt; C.holdEl.style.display = txt ? '' : 'none'; }
  }
  offs.push(game.mods.on('update', (dt, g) => { if (g === game) { try { update(Math.min(dt, 0.1)); } catch (e) { if (!st.w2) { st.w2 = 1; console.warn('[faults] client', e); } } } }));

  return {
    onRequest, onMsg, snapshot, begin, launch, expire, state: { host: F, client: C }, FAULTS,
    active: () => F.act || C.act,
    remaining: () => F.list.filter((f) => !f.done).length,
    /** debug / tests: complete every fault right now (host) */
    fixAll(by) { for (const f of F.list) fixed(f, by || game.selfId); },
    faultOf: (id) => F.list.find((f) => f.id === id),
    clientFaults: () => [...C.faults.values()],
    dispose() {
      st.disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      if (Object.prototype.hasOwnProperty.call(game, 'hostBeginTakeoff')) game.hostBeginTakeoff = origTakeoff;
      if (Object.prototype.hasOwnProperty.call(game, 'resolveMelee')) game.resolveMelee = origMelee;
      clearClient();
      C.holdEl?.remove();
    },
  };
}
