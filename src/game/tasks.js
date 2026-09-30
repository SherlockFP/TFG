// CREW TASKS (wave 1, "fun" module) — Among-Us-style busywork inside the facility.
//
// Every landing on a moon with a facility, the host picks 5-8 task STATIONS (seeded RNG: run seed + day, positions from the
// facility's own floor spots) and gives every player 2-3 of them. Task types:
//   Fix Wiring   -> the fuse-box wire minigame            Upload Data  -> hold [E] 6 s at a terminal
//   Calibrate    -> the lockpick dial minigame            Clean Vent   -> hold [E] 4 s at a duct unit
//   Swipe Card   -> a timing-bar minigame (minigames/swipe.js)
// Completing a task pays a little XP / Clout; when EVERY (living) crewmate has finished their list the crew gets a
// TEAM BONUS (credits + XP) as the ship takes off. With 3+ players one random player also gets a secret SABOTEUR side
// task (prank two stations: harmless-funny glitches, +Clout, revealed in the day summary).
//
// Authority: the host assigns, validates every completion (assignment, distance, station not glitching) and pays.
// Net (host-only message type 'task'): { k:'set' (full state) | 'asg' | 'done' | 'all' | 'glitch' | 'sab' | 'result' | 'clear' };
// requests 'task': { op:'done'|'prank'|'sync', sid }.
import * as THREE from 'three';
import { G, xf, merged, lam, bas, mk, pv } from '../models/modelkit.js';
import { RNG, hashString } from '../core/rng.js';
import { MINIGAMES } from '../minigames/index.js';
import { createSwipe } from '../minigames/swipe.js';
import { HOST_ONLY } from '../net/session.js';
import { hudDock } from '../ui/dock.js';
import { spreadMarkers, hotbarRect } from '../ui/docklayout.js';
import { escapeHtml } from '../core/util.js';
import { toScreen, fx } from './funfx.js';
import { ensureWardrobeProfile } from './cosmetics.js';
import { t, tf } from '../core/i18n.js';

HOST_ONLY.add('task');
MINIGAMES.swipe = MINIGAMES.swipe || createSwipe;

export const TASK_TYPES = {
  wiring: { name: 'Fix Wiring', mode: 'mini', mini: 'fuse', color: '#ffd23f', icon: '⚡', xp: 30, diff: 0.3 },
  upload: { name: 'Upload Data', mode: 'hold', hold: 6, color: '#5adfff', icon: '⇪', xp: 25 },
  calibrate: { name: 'Calibrate Sensor', mode: 'mini', mini: 'lockpick', color: '#c44dff', icon: '◎', xp: 35, diff: 0.25 },
  vent: { name: 'Clean Vent', mode: 'hold', hold: 4, color: '#7dff9a', icon: '✱', xp: 20 },
  swipe: { name: 'Swipe Card', mode: 'mini', mini: 'swipe', color: '#ff9a4a', icon: '▤', xp: 25, diff: 0.3 },
};
const TYPE_ORDER = Object.keys(TASK_TYPES);
const PRANK_HOLD = 3, PRANK_NEED = 2, GLITCH_S = 25;
const MIN_SPACING = 9;            // m between stations
const USE_RANGE = 3.2;            // m: hold / interact range
const DONE_RANGE = 7;             // m: host validation range

// ------------------------------------------------------------------ station visuals
const screenCache = new Map();
function screenMat(type, state) {
  const key = type + ':' + state;
  let m = screenCache.get(key);
  if (m) return m;
  const c = document.createElement('canvas'); c.width = 128; c.height = 88;
  const x = c.getContext('2d');
  const def = TASK_TYPES[type];
  x.fillStyle = state === 'done' ? '#06240f' : state === 'glitch' ? '#2a0606' : '#061018'; x.fillRect(0, 0, 128, 88);
  x.strokeStyle = state === 'done' ? '#39ff6a' : state === 'glitch' ? '#ff3b3b' : def.color; x.lineWidth = 3; x.strokeRect(3, 3, 122, 82);
  x.fillStyle = x.strokeStyle; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (state === 'glitch') {
    for (let i = 0; i < 9; i++) { x.globalAlpha = 0.25 + (i % 3) * 0.2; x.fillRect(6, 8 + i * 9, 116, 3); }
    x.globalAlpha = 1; x.font = '26px monospace'; x.fillText('ERROR', 64, 36); x.font = '30px monospace'; x.fillText('🤡', 64, 62);
  } else if (state === 'done') {
    x.font = '38px monospace'; x.fillText('✔', 64, 32); x.font = '18px monospace'; x.fillText('DONE', 64, 66);
  } else {
    x.font = '34px monospace'; x.fillText(def.icon, 64, 28); x.font = '15px monospace'; x.fillText(def.name.toUpperCase(), 64, 60);
    x.font = '13px monospace'; x.globalAlpha = 0.75; x.fillText(def.mode === 'hold' ? 'HOLD [E]' : 'PRESS [E]', 64, 76);
  }
  const tx = new THREE.CanvasTexture(c); tx.magFilter = tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false; tx.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.MeshBasicMaterial({ map: tx, fog: true });
  screenCache.set(key, m);
  return m;
}
const sharedGeo = (g) => { g.userData.shared = true; return g; };
const SCREEN_GEO = sharedGeo(new THREE.PlaneGeometry(0.44, 0.3));
const MARKER_GEO = sharedGeo(new THREE.OctahedronGeometry(0.1, 0));

function buildStation(type) {
  const def = TASK_TYPES[type];
  const g = new THREE.Group();
  g.name = 'station_' + type;
  mk(g, merged('st_base', () => [xf(G.box(0.56, 0.86, 0.4), [0, 0.43, 0]), xf(G.box(0.7, 0.06, 0.5), [0, 0.03, 0])]), lam('#2b3138'));
  const head = pv(g, [0, 1.02, -0.02], [-0.5, 0, 0]);
  mk(head, merged('st_head', () => [xf(G.box(0.5, 0.36, 0.06))]), lam('#1c2126'));
  const screen = new THREE.Mesh(SCREEN_GEO, screenMat(type, 'idle'));
  screen.position.set(0, 0, 0.033); head.add(screen);
  mk(g, merged('st_ring_' + type, () => [xf(G.tor(0.5, 0.02, 3, 16), [0, 0.04, 0], [Math.PI / 2, 0, 0])]), bas(def.color));
  switch (type) {
    case 'wiring':
      mk(g, merged('st_w1', () => [xf(G.box(0.02, 0.4, 0.02), [0.3, 0.6, 0.1]), xf(G.box(0.02, 0.32, 0.02), [0.34, 0.55, 0.12])]), bas('#ff3b3b'));
      mk(g, merged('st_w2', () => [xf(G.box(0.02, 0.36, 0.02), [-0.3, 0.6, 0.1]), xf(G.box(0.02, 0.3, 0.02), [-0.34, 0.5, 0.12])]), bas('#3f8cff'));
      mk(g, merged('st_w3', () => [xf(G.box(0.02, 0.28, 0.02), [0.26, 0.5, 0.14])]), bas('#ffd23f'));
      break;
    case 'vent':
      mk(g, merged('st_vent', () => [0, 1, 2, 3, 4, 5].map((i) => xf(G.box(0.4, 0.025, 0.02), [0, 0.2 + i * 0.09, 0.205]))), lam('#0d1013'));
      mk(g, merged('st_vent2', () => [xf(G.cyl(0.1, 0.1, 0.02, 8), [0.25, 1.2, 0], [Math.PI / 2, 0, 0])]), lam('#4b5259'));
      break;
    case 'calibrate':
      mk(g, merged('st_dish', () => [xf(G.cyl(0.012, 0.012, 0.42), [0.2, 1.3, 0]), xf(G.sph(0.14, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), [0.2, 1.52, 0], [-0.9, 0, 0])]), lam('#a9b1b8'));
      break;
    case 'swipe':
      mk(g, merged('st_slot', () => [xf(G.box(0.3, 0.05, 0.05), [0, 0.76, 0.21])]), bas('#0a0c0e'));
      mk(g, merged('st_card', () => [xf(G.box(0.12, 0.1, 0.01), [0.08, 0.86, 0.215], [0, 0, 0.2])]), lam('#d8dde0'));
      break;
    default:
      mk(g, merged('st_ant', () => [xf(G.cyl(0.01, 0.01, 0.36), [-0.22, 1.28, 0]), xf(G.ico(0.03, 0), [-0.22, 1.5, 0])]), bas('#5adfff'));
  }
  const marker = new THREE.Mesh(MARKER_GEO, new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color), fog: false, transparent: true, opacity: 0.9 }));
  marker.scale.set(1, 1.5, 1); marker.position.y = 2.0; marker.visible = false;
  g.add(marker);
  g.userData = { screen, marker, type, state: 'idle' };
  return g;
}

// ------------------------------------------------------------------ the module
export function installTasks(game) {
  const T = {
    day: -1, active: false,
    stations: new Map(),                // sid -> { id, type, x, y, z, ry, room, obj, glitch }
    assign: new Map(),                  // pid -> [{ sid, done }]
    crewDone: false, paid: false,
    hostSab: null,                      // host: { pid, need, done, sids:Set, complete } (the truth)
    sab: null,                          // this peer's own secret side task (saboteur only): { need, done, complete }
    result: null,
  };
  let disposed = false, boundNet = null, hold = null, prankT = 0;
  const offs = [];
  const dock = hudDock('bottom', 'fun-task', 30);
  dock.style.cssText = 'font-family:VT323,monospace;font-size:24px;color:#bff4ff;text-shadow:0 0 6px #000;display:none;background:rgba(0,0,0,.55);padding:2px 12px;border:1px solid rgba(120,220,255,.4);min-width:260px;text-align:center';
  const marks = document.createElement('div');
  marks.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;overflow:hidden';
  (document.getElementById('ui') || document.body).appendChild(marks);
  const markEls = new Map();
  const sp = { x: 0, y: 0, behind: false, cx: 0, cy: 0, cz: 0 };
  const _p = new THREE.Vector3();

  const me = () => game.selfId;
  const myList = () => T.assign.get(me()) || [];
  const stationOf = (sid) => T.stations.get(sid);
  const fac = () => game.world?.facility;
  const roomName = (s) => (s.room ? String(s.room).replace(/[_-]+/g, ' ') : '');

  // ---------------------------------------------------------------- building stations (all peers)
  function buildStations() {
    const f = fac();
    if (!f || !T.active) return;
    for (const s of T.stations.values()) {
      if (s.obj && s.obj.parent) continue;
      s.obj = buildStation(s.type);
      s.obj.position.set(s.x, s.y, s.z);
      s.obj.rotation.y = s.ry;
      f.group.add(s.obj);
    }
    refreshVisuals();
  }
  function clearStations() {
    for (const s of T.stations.values()) { s.obj?.removeFromParent(); s.obj = null; }
    T.stations.clear(); T.assign.clear();
    T.active = false; hold = null; T.sab = null; T.hostSab = null;
    for (const e of markEls.values()) e.remove();
    markEls.clear();
  }
  function refreshVisuals() {
    const mine = new Map(myList().map((a) => [a.sid, a]));
    for (const s of T.stations.values()) {
      if (!s.obj) continue;
      const a = mine.get(s.id);
      const done = a?.done;
      const st = s.glitch > 0 ? 'glitch' : done ? 'done' : 'idle';
      if (s.obj.userData.state !== st) { s.obj.userData.state = st; s.obj.userData.screen.material = screenMat(s.type, st); }
      s.obj.userData.marker.visible = !!a && !done && !game.player.dead;
    }
  }

  // ---------------------------------------------------------------- host: assignment
  function hostAssign() {
    if (!game.isHost || disposed) return;
    const f = fac(), run = game.run;
    if (!f || !run || run.phase !== 'moon') return;
    clearStations();
    const rng = new RNG(hashString(`${run.seed}:${run.day}:crewtasks`));
    const pids = [...new Set([game.selfId, ...game.remotes.keys()])].filter(Boolean).sort();
    const spots = (f.scrapSpots || []).filter((s) => Number.isFinite(s.x + s.y + s.z) && (s.dist ?? 0) >= 0);
    if (spots.length < 4) return;
    const want = Math.max(5, Math.min(8, pids.length * 2 + 2));
    rng.shuffle(spots);
    const picked = [], usedRooms = new Set();
    for (const pass of [0, 1]) {
      for (const s of spots) {
        if (picked.length >= want) break;
        if (pass === 0 && usedRooms.has(s.room)) continue;
        if (picked.some((q) => Math.hypot(q.x - s.x, q.z - s.z) < MIN_SPACING)) continue;
        picked.push(s); usedRooms.add(s.room);
      }
    }
    if (picked.length < 3) return;
    const types = [];
    while (types.length < picked.length) types.push(...rng.shuffle(TYPE_ORDER.slice()));
    picked.forEach((s, i) => {
      const id = 's' + i;
      T.stations.set(id, { id, type: types[i], x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2), ry: +(rng.next() * Math.PI * 2).toFixed(2), room: s.type || '', glitch: 0, obj: null });
    });
    T.day = run.day; T.active = true; T.crewDone = false; T.paid = false; T.result = null;
    for (const pid of pids) hostGive(pid, rng);
    // secret saboteur (3+ players)
    if (pids.length >= 3) {
      const pid = rng.pick(pids);
      T.hostSab = { pid, need: PRANK_NEED, done: 0, sids: new Set(), complete: false };
    }
    buildStations();                       // the host never processes its own 'set' broadcast (clients rebuild from it)
    broadcastAll();
    if (T.hostSab) game.net.sendTo(T.hostSab.pid, 'task', { k: 'sab', need: T.hostSab.need, done: 0, complete: false });
    game.net.broadcast('sys', { text: 'CREW TASKS assigned - finish yours for the team bonus. Check the objectives list.', kind: 'info' });
  }
  function hostGive(pid, rng) {
    const ids = [...T.stations.keys()];
    const n = Math.min(ids.length, 2 + (rng.chance(0.5) ? 1 : 0));
    const mine = [];
    const bag = rng.shuffle(ids.slice());
    const seenTypes = new Set();
    for (const sid of bag) { if (mine.length >= n) break; const ty = T.stations.get(sid).type; if (seenTypes.has(ty) && bag.length > n + 1) continue; seenTypes.add(ty); mine.push({ sid, done: false }); }
    for (const sid of bag) { if (mine.length >= n) break; if (!mine.some((a) => a.sid === sid)) mine.push({ sid, done: false }); }
    T.assign.set(pid, mine);
  }
  function snapshot() {
    return {
      day: T.day,
      st: [...T.stations.values()].map((s) => ({ i: s.id, ty: s.type, x: s.x, y: s.y, z: s.z, ry: s.ry, rm: s.room, g: s.glitch > 0 ? +s.glitch.toFixed(1) : 0 })),
      asg: Object.fromEntries([...T.assign].map(([pid, l]) => [pid, l.map((a) => [a.sid, a.done ? 1 : 0])])),
      all: T.crewDone ? 1 : 0,
    };
  }
  function broadcastAll() { game.net.broadcast('task', { k: 'set', ...snapshot() }); }

  // ---------------------------------------------------------------- host: requests
  function onRequest(d, from) {
    if (!d || !game.isHost || !T.active) return;
    if (d.op === 'sync') { game.net.sendTo(from, 'task', { k: 'set', ...snapshot() }); const hs = T.hostSab; if (hs?.pid === from) game.net.sendTo(from, 'task', { k: 'sab', need: hs.need, done: hs.done, complete: hs.complete }); return; }
    const s = T.stations.get(String(d.sid));
    const pl = game.aiPlayerById?.(from);
    if (!s || !pl || pl.dead) return;
    if (Math.hypot(pl.pos.x - s.x, pl.pos.z - s.z) > DONE_RANGE || Math.abs(pl.pos.y - s.y) > 3.5) return;
    if (d.op === 'done') {
      const a = (T.assign.get(from) || []).find((q) => q.sid === s.id);
      if (!a || a.done || s.glitch > 0) return;
      a.done = true;
      const def = TASK_TYPES[s.type];
      game.net.broadcast('task', { k: 'done', pid: from, sid: s.id });
      game.net.broadcast('xp', { to: from, xp: def.xp + (game.run.quotaIndex || 0) * 5, coin: 3, reason: `Task: ${def.name}` });
      hostCheckAll();
    } else if (d.op === 'prank') {
      const hs = T.hostSab;
      if (!hs || hs.pid !== from || hs.complete || s.glitch > 0 || hs.sids.has(s.id)) return;
      hs.sids.add(s.id); hs.done += 1;
      s.glitch = GLITCH_S;
      game.net.broadcast('task', { k: 'glitch', sid: s.id, dur: GLITCH_S });
      if (hs.done >= hs.need) {
        hs.complete = true;
        game.net.broadcast('xp', { to: from, xp: 40, coin: 15, reason: 'Sabotage complete' });
      }
      game.net.sendTo(from, 'task', { k: 'sab', need: hs.need, done: hs.done, complete: hs.complete });
    }
  }
  function livingPids() { return (game.aiPlayers?.() || []).filter((p) => !p.dead).map((p) => p.id); }
  function tally(living) {
    let done = 0, total = 0;
    for (const [pid, list] of T.assign) { if (living && !living.includes(pid)) continue; for (const a of list) { total++; if (a.done) done++; } }
    return { done, total };
  }
  function hostCheckAll() {
    if (T.crewDone) return;
    const { done, total } = tally(livingPids());
    if (total > 0 && done >= total) {
      T.crewDone = true;
      game.net.broadcast('task', { k: 'all' });
    }
  }
  function hostSettle() {
    if (!game.isHost || !T.active || T.paid) return;
    T.paid = true;
    const living = livingPids();
    const { done, total } = tally(living);
    const complete = total > 0 && done >= total && living.length > 0;
    const run = game.run;
    let bonus = 0;
    if (complete) {
      bonus = 50 + 15 * (run.quotaIndex || 0) + 10 * living.length;
      run.credits = (run.credits || 0) + bonus;
      game.broadcastRun?.(['credits']);
      game.net.broadcast('xp', { xp: 60 + 15 * (run.quotaIndex || 0), coin: 10, reason: 'Crew tasks complete' });
    }
    const hs = T.hostSab;
    const sab = hs ? { name: game.playerName(hs.pid), done: hs.done, need: hs.need, complete: hs.complete } : null;
    game.net.broadcast('task', { k: 'result', complete, bonus, done, total, sab });
    game.net.broadcast('sys', { text: complete ? `ALL CREW TASKS DONE! Team bonus ▮${bonus}.` : `Crew tasks: ${done}/${total} - no team bonus today.`, kind: complete ? 'good' : 'info' });
  }

  // ---------------------------------------------------------------- client: messages
  function onMsg(d) {
    if (!d || disposed) return;
    switch (d.k) {
      case 'set': {
        if (game.isHost) return;
        const keepSab = T.sab;             // a re-broadcast (someone joined) must not wipe the secret side task
        clearStations();
        T.sab = keepSab;
        T.active = true; T.day = d.day; T.crewDone = !!d.all; T.result = null;
        for (const s of d.st || []) T.stations.set(s.i, { id: s.i, type: TASK_TYPES[s.ty] ? s.ty : 'upload', x: s.x, y: s.y, z: s.z, ry: s.ry, room: s.rm || '', glitch: s.g || 0, obj: null });
        for (const [pid, list] of Object.entries(d.asg || {})) T.assign.set(pid, list.map(([sid, dn]) => ({ sid, done: !!dn })));
        buildStations();
        break;
      }
      case 'done': {
        const a = (T.assign.get(d.pid) || []).find((q) => q.sid === d.sid);
        if (a) a.done = true;
        if (d.pid === me()) taskDoneLocal(stationOf(d.sid));
        else if (d.pid) game.ui?.toast?.(tf('{name} finished a task ({d}/{n})', { name: game.playerName(d.pid), ...counts(d.pid) }), 'info');
        refreshVisuals();
        break;
      }
      case 'all': T.crewDone = true; game.ui?.hud?.bigText?.(t('ALL TASKS DONE'), t('Team bonus is paid at day end')); fx(game.audio, 'fun_ok', { volume: 0.8 }); break;
      case 'glitch': {
        const s = stationOf(d.sid);
        if (!s) break;
        s.glitch = d.dur || GLITCH_S;
        if (s.obj) fx(game.audio, 'fun_glitch', { pos: new THREE.Vector3(s.x, s.y + 1, s.z), volume: 0.9, ref: 3, max: 45 });
        game.particles?.burst?.(new THREE.Vector3(s.x, s.y + 1, s.z), { count: 12, color: [0xff3b3b, 0xffd23f], speed: 2.2, up: 1.4, life: 0.7, size: 0.05, gravity: 5, drag: 1.5 });
        refreshVisuals();
        break;
      }
      case 'sab': T.sab = { need: d.need, done: d.done, complete: !!d.complete }; if (!d.done && !d.complete) game.ui?.toast?.('🤡 SECRET SIDE TASK: prank 2 stations (hold E). Do not get caught.', 'info'); else if (d.complete) game.ui?.toast?.('🤡 Sabotage complete! +Clout at day end.', 'good'); break;
      case 'result': T.result = d; if (d.complete && game.profile) { const p = ensureWardrobeProfile(game.profile); p.fun.bonuses += 1; game.progress?.save?.(); } break;
      case 'clear': clearStations(); break;
      default: break;
    }
  }
  function counts(pid) {
    const l = T.assign.get(pid) || [];
    return { d: l.filter((a) => a.done).length, n: l.length };
  }
  function taskDoneLocal(s) {
    const p = ensureWardrobeProfile(game.profile);
    p.fun.tasks += 1;
    game.progress?.save?.();
    if (s) game.ui?.toast?.(`✔ ${TASK_TYPES[s.type].name} - ${counts(me()).d}/${counts(me()).n}`, 'good');
    fx(game.audio, 'fun_ok', { volume: 0.7 });
    game.mods?.emit('tfg:taskDone', s, game);
  }

  // ---------------------------------------------------------------- local: interacting
  function startTask(s) {
    const a = myList().find((q) => q.sid === s.id);
    if (!a || a.done || s.glitch > 0 || game.player.dead || game.minigame) return;
    const def = TASK_TYPES[s.type];
    if (def.mode === 'hold') { hold = { sid: s.id, need: def.hold, t: 0, kind: 'task', last: 0 }; return; }
    const diff = (def.diff || 0.3) + Math.min(0.3, (game.run?.quotaIndex || 0) * 0.04);
    game.openMinigame(def.mini, { difficulty: diff, noEase: false, noXp: true }, (res) => {
      if (res?.success) game.net.request('task', { op: 'done', sid: s.id });
      else if (!res?.cancelled) { game.ui?.toast?.('Task failed - try again.', 'bad'); fx(game.audio, 'fun_bad', { volume: 0.5 }); }
    });
  }
  function startPrank(s) {
    if (!T.sab || T.sab.complete || s.glitch > 0 || game.player.dead || hold) return;
    hold = { sid: s.id, need: PRANK_HOLD, t: 0, kind: 'prank', last: 0 };
  }
  function addInteractables(list) {
    const p = game.player;
    if (!T.active || p.dead || !p.indoor || game.run?.phase !== 'moon') return;
    const mine = new Map(myList().map((a) => [a.sid, a]));
    for (const s of T.stations.values()) {
      if (_p.set(s.x, s.y + 1.0, s.z).distanceTo(game.camera.position) > 6) continue;
      const a = mine.get(s.id);
      const def = TASK_TYPES[s.type];
      if (a && !a.done) {
        list.push({
          pos: _p.clone(), r: 0.85, reach: USE_RANGE,
          label: () => (s.glitch > 0 ? `${def.name}: station glitching... (${Math.ceil(s.glitch)}s)` : def.mode === 'hold' ? `${def.name}: hold [E] ${def.hold}s` : `${def.name} [E]`),
          sub: () => `${def.icon} crew task`,
          action: () => startTask(s),
        });
      } else if (T.sab && !T.sab.complete && s.glitch <= 0) {
        list.push({ pos: _p.clone(), r: 0.85, reach: USE_RANGE, label: () => '🤡 Prank this station: hold [E] 3s', sub: () => 'secret', action: () => startPrank(s) });
      }
    }
  }

  // ---------------------------------------------------------------- frame
  function update(dt) {
    if (disposed) return;
    dt = Math.min(dt, 0.1);
    if (game.net && game.net !== boundNet) bindNet(game.net);
    const p = game.player, input = game.input;
    // glitch timers + marker animation
    for (const s of T.stations.values()) {
      if (s.glitch > 0) { s.glitch = Math.max(0, s.glitch - dt); if (s.glitch === 0) refreshVisuals(); }
      const m = s.obj?.userData.marker;
      if (m?.visible) { m.rotation.y += dt * 1.6; m.position.y = 2.0 + Math.sin(game.time * 2.2 + s.x) * 0.08; }
    }
    // hold interaction
    if (hold) {
      const s = stationOf(hold.sid);
      const near = s && _p.set(s.x, s.y + 1, s.z).distanceTo(game.camera.position) < USE_RANGE + 0.6;
      if (!s || p.dead || game.minigame || !near || (s.glitch > 0 && hold.kind === 'task')) { hold = null; }
      else if (input.isDown('interact') && input.locked) {
        hold.t += dt;
        hold.last += dt;
        if (hold.last > 0.9) { hold.last = 0; fx(game.audio, 'fun_ok', { volume: 0.12, pitch: 1.4 + hold.t / hold.need * 0.5 }); }
        if (hold.t >= hold.need) {
          const h = hold; hold = null;
          if (h.kind === 'task') game.net.request('task', { op: 'done', sid: h.sid });
          else game.net.request('task', { op: 'prank', sid: h.sid });
        }
      } else { hold.t -= dt * 2.5; if (hold.t <= 0) hold = null; }
    }
    const txt = hold ? `${hold.kind === 'prank' ? '🤡 SABOTAGING' : TASK_TYPES[stationOf(hold.sid)?.type]?.name.toUpperCase() || 'TASK'}  ${'█'.repeat(Math.round(hold.t / hold.need * 16)).padEnd(16, '░')}  ${Math.min(hold.need, hold.t).toFixed(1)}/${hold.need}s (hold E)` : '';
    if (dock.textContent !== txt) { dock.textContent = txt; dock.style.display = txt ? '' : 'none'; }
    // task visuals follow the local list (done state changes) at a low rate
    refreshT -= dt; if (refreshT <= 0) { refreshT = 0.5; refreshVisuals(); }
    updateMarks();
  }
  let refreshT = 0;

  // screen-edge markers for my unfinished stations (the compass only exists outdoors)
  function updateMarks() {
    const p = game.player;
    const show = T.active && !p.dead && p.indoor && game.run?.phase === 'moon' && !game.ui?.hud?.el?.classList?.contains('hidden') && !game.minigame;
    const want = new Set();
    if (show) {
      const W = window.innerWidth, H = window.innerHeight;
      // [shotfix] one-goal rule: a named world label floats only for the nearest open task AND only while tasks own the ONE goal
      // (objectives.goalSrc); every other open task is a small icon + distance on the screen edge, never mid-view, never cut off.
      const isGoal = game.objectives?.goalSrc === 'tasks';
      const pend = [];
      let nearest = null, nd = 1e9;
      const cam = game.camera.position;
      for (const a of myList()) {
        if (a.done) continue;
        const s = stationOf(a.sid);
        if (!s) continue;
        const dd = Math.hypot(s.x - cam.x, s.z - cam.z);
        if (dd < nd) { nd = dd; nearest = a.sid; }
      }
      for (const a of myList()) {
        if (a.done) continue;
        const s = stationOf(a.sid);
        if (!s) continue;
        const def = TASK_TYPES[s.type];
        const named = isGoal && a.sid === nearest;
        _p.set(s.x, s.y + 2.1, s.z);
        const d = _p.distanceTo(game.camera.position);
        if (d < 3) continue;
        toScreen(_p, game.camera, W, H, sp);
        const mx = named ? 90 : 34;   // keeps the text inside the screen
        let x = sp.x, y = sp.y, edge = false;
        if (sp.behind) { x = sp.cx < 0 ? mx : W - mx; y = H - 90; edge = true; }
        else if (x < mx || x > W - mx || y < 24 || y > H - 24) { x = Math.min(W - mx, Math.max(mx, x)); y = Math.min(H - 90, Math.max(24, y)); edge = true; }
        if (!named && !edge) continue;   // on-screen and not the goal: the station's own marker is enough
        pend.push({ sid: a.sid, x, y, d, def, named, edge, first: named });
      }
      // [n3fix] edge markers never stack on each other or sit over the hotbar
      spreadMarkers(pend, hotbarRect());
      for (const m of pend) {
        if (m.hide) continue;
        const { sid, x, y, d, def, named, edge } = m;
        let e = markEls.get(sid);
        if (!e) {
          e = document.createElement('div');
          e.style.cssText = 'position:absolute;transform:translate(-50%,-50%);font-family:VT323,monospace;font-size:20px;text-shadow:0 0 4px #000,0 0 8px #000;white-space:nowrap;text-align:center';
          marks.appendChild(e); markEls.set(sid, e);
        }
        e.style.left = x + 'px'; e.style.top = y + 'px'; e.style.color = def.color; e.style.opacity = edge ? '0.75' : '0.95';
        const html = `${def.icon} ${named ? def.name : ''}<br><span style="font-size:16px;color:#fff">${Math.round(d)} m</span>`;
        if (e._html !== html) { e.innerHTML = html; e._html = html; }
        want.add(sid);
      }
    }
    for (const [sid, e] of markEls) if (!want.has(sid)) { e.remove(); markEls.delete(sid); }
  }

  // ---------------------------------------------------------------- hooks
  function bindNet(net) {
    if (!net || net === boundNet) return;
    boundNet = net;
    net.on_('task', onMsg);
    net.handle('task', onRequest);
    if (!game.isHost) setTimeout(() => { if (!disposed) net.request('task', { op: 'sync' }); }, 1200);
  }
  offs.push(game.mods.on('update', (dt, g) => { if (g === game) update(dt); }));
  offs.push(game.mods.on('netReady', (net, g) => { if (g === game) bindNet(net); }));
  offs.push(game.mods.on('mapLoaded', (world, g) => { if (g === game && T.active) buildStations(); }));
  offs.push(game.mods.on('moonPopulated', (g) => { if (g === game) hostAssign(); }));
  offs.push(game.mods.on('playerJoin', (id, info, g) => {
    if (g !== game || !game.isHost || !T.active) return;
    setTimeout(() => {
      if (disposed || !T.active || T.assign.has(id)) return;
      hostGive(id, new RNG(hashString(`${game.run.seed}:${game.run.day}:join:${id}`)));
      broadcastAll();
    }, 1800);
  }));
  offs.push(game.mods.on('phase', (ph, g) => {
    if (g !== game) return;
    if (ph === 'takeoff') hostSettle();
    else if (ph === 'landing') { clearStations(); T.result = null; }
    else if (ph === 'orbit' || ph === 'company') { const keep = T.result; clearStations(); T.result = keep; }
  }));
  offs.push(game.mods.on('localDeath', (cause, g) => { if (g === game) { hold = null; refreshVisuals(); } }));
  offs.push(game.mods.on('interactables', (list, g) => { if (g === game) addInteractables(list); }));
  offs.push(game.mods.on('objectives', (add, g, ph) => {
    if (g !== game || !T.active || ph !== 'moon') return;
    const list = myList();
    if (list.length) {
      const done = list.filter((a) => a.done).length;
      const all = tally(null);
      add(tf('TASKS {a}/{b} · crew {c}/{d}', { a: done, b: list.length, c: all.done, d: all.total }), 'main', done === list.length, list.length ? done / list.length : 0);
      const cam = game.camera.position;
      for (const a of list) {
        const s = stationOf(a.sid);
        if (!s) continue;
        const d = Math.round(Math.hypot(s.x - cam.x, s.z - cam.z));
        add(`${a.done ? '✔' : '◇'} ${TASK_TYPES[s.type].name}${a.done ? '' : ` — ${roomName(s) ? roomName(s) + ' · ' : ''}${d} m`}`, 'sub', a.done);
      }
    }
    if (T.crewDone) add(t('All crew tasks done - team bonus at day end!'), 'sub', true);
    if (T.sab && !T.sab.complete && T.sab.need) add(tf('🤡 SECRET: prank {n} stations (hold E) · {d}/{n}', { n: T.sab.need, d: T.sab.done || 0 }), 'hint');
  }));
  offs.push(game.mods.on('daySummary', (d, extra, g) => {
    if (g !== game || !T.result || d.company) return;
    const r = T.result;
    let html = r.total ? `<b>CREW TASKS</b> ${r.done}/${r.total} ${r.complete ? `✔ TEAM BONUS ▮${r.bonus}` : '— no team bonus'}` : '';
    if (r.sab) html += `<br><b>🤡 SABOTEUR REVEALED</b> ${escapeHtml(r.sab.name)} pranked ${r.sab.done}/${r.sab.need} stations${r.sab.complete ? ' (+◈15)' : ''}`;
    if (html) extra.push(html);
    if (T.sab?.complete && r.sab?.name === game.profile?.name) { const p = ensureWardrobeProfile(game.profile); p.fun.pranks += 1; game.progress?.save?.(); }
  }));
  if (game.net) bindNet(game.net);
  if (fac() && T.active) buildStations();

  return {
    state: T,
    types: TASK_TYPES,
    myTasks: () => myList().map((a) => ({ ...a, station: stationOf(a.sid) })),
    stations: () => [...T.stations.values()],
    /** debug / tests: force an assignment now (host) */
    assignNow: hostAssign,
    complete(sid) { game.net?.request('task', { op: 'done', sid }); },
    dispose() {
      disposed = true;
      for (const off of offs) { try { off?.(); } catch { /* ignore */ } }
      if (boundNet) {
        if (boundNet.msgHandlers?.get('task') === onMsg) boundNet.msgHandlers.delete('task');
        if (boundNet.handlers?.get('task') === onRequest) boundNet.handlers.delete('task');
      }
      clearStations();
      dock.remove(); marks.remove();
    },
  };
}
