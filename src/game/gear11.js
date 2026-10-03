// TFG wave 11 - GEAR11 (docs/wave11/gear11.md): five new crew gadgets, each with one verb, all buyable in the Company Store.
//   DECOY SPEAKER  throwable (rides the grenades throw pipeline: KINDS.speaker); plays the thrower's LAST recorded voice clip (fake "Hey, over here!" without one)
//                  every 2.4 s for 12 s; sound-hunting creatures rush to it. Hooks in grenades.js call game.gear11.speakerDeploy / speakerPulse.
//   SCOUT DRONE    LMB flies it (camera from the drone, your body freezes and stays hittable, tether 42 m, 30 s battery = the item battery, ship charger refills),
//                  LMB again scans items + creatures in line of sight for the whole crew, E recalls. A creature touching it smashes it.
//   DOOR JAMMER    LMB at a plain door: closed + locked for 40 s (creatures + crew), beeps faster in the last 6 s, then shrieks (noise).
//   GLOW TRAIL     LMB: 2 minutes of glowing chevrons every ~3.4 m that point back the way you came; crew-shared, fade after 3 minutes.
//   ZIPLINE KIT    LMB at a wall / ceiling <= 18 m: pole + rope; E on either end to slide (Space lets go), Crouch+E retracts. One line per landing.
// Net (prefix 'g11'): request 'g11req' client -> host {op:'jam'|'trail'|'dot'|'zip'|'zipdel'|'ping'}, 'g11sync' client -> host, 'g11st' host -> all (HOST_ONLY)
//   {k:'jam'|'jamend'|'tr'|'dot'|'zip'|'zipdel'|'ping'|'snap'|'msg'}, 'g11d' pilot -> everyone (relay type: the drone pose).
// Shared-file hooks (minimal): grenades_core.js KINDS.speaker + grenades.js (BLURB.speaker, host zone case, dz pulse owner, onBoom / decoyPulse call into game.gear11).
import * as THREE from 'three';
import { t, tf, getLang, speechLang } from '../core/i18n.js';
import { registerItem, ITEMS, STORE_ITEMS } from './items.js';
import { HOST_ONLY } from '../net/session.js';
import { G } from '../physics/physics.js';
import * as C from './gear11_core.js';
import * as A from './gear11_art.js';
import './gear11_text.js';

HOST_ONLY.add('g11st');

for (const d of Object.values(C.ITEMS11)) { registerItem({ ...d }); if (!STORE_ITEMS.includes(d.id)) STORE_ITEMS.push(d.id); }

const STYLE_ID = 'g11-style';
const CSS = `
.g11-hint{position:fixed;left:50%;bottom:132px;transform:translateX(-50%);z-index:30;pointer-events:none;display:none;font:12px/1.25 monospace;letter-spacing:.05em;color:#cfc6b8;background:rgba(10,10,12,.66);border:1px solid rgba(207,198,184,.25);padding:4px 10px;text-shadow:0 1px 0 #000;text-align:center;max-width:70vw}
.g11-hint b{color:#ffd23f;font-weight:600}
.g11-chip{position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:29;pointer-events:none;display:none;font:11px/1 monospace;letter-spacing:.08em;color:#4dffb4;background:rgba(6,14,10,.66);border:1px solid rgba(77,255,180,.35);padding:3px 8px}
.g11-cam{position:fixed;inset:0;z-index:6;pointer-events:none;display:none;font:12px/1.2 monospace;color:#9fe8ff;text-shadow:0 1px 0 #000}
.g11-cam .sc{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 55%,rgba(0,12,18,.62) 100%),repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0 1px,transparent 1px 3px);mix-blend-mode:multiply}
.g11-cam .tint{position:absolute;inset:0;background:rgba(40,150,190,.10);mix-blend-mode:screen}
.g11-cam .noise{position:absolute;inset:0;opacity:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.35) 0 2px,rgba(0,0,0,.4) 2px 5px),repeating-linear-gradient(0deg,rgba(255,255,255,.25) 0 1px,rgba(0,0,0,.5) 1px 4px)}
.g11-cam .cor{position:absolute;width:34px;height:34px;border:2px solid rgba(159,232,255,.75)}
.g11-cam .c1{left:28px;top:28px;border-right:0;border-bottom:0}.g11-cam .c2{right:28px;top:28px;border-left:0;border-bottom:0}
.g11-cam .c3{left:28px;bottom:28px;border-right:0;border-top:0}.g11-cam .c4{right:28px;bottom:28px;border-left:0;border-top:0}
.g11-cam .rec{position:absolute;left:74px;top:34px;letter-spacing:.14em}.g11-cam .rec i{display:inline-block;width:9px;height:9px;border-radius:50%;background:#ff3030;margin-right:7px;animation:g11blink 1s steps(2) infinite}
.g11-cam .bat{position:absolute;right:74px;top:34px;text-align:right}
.g11-cam .bat u{display:block;width:120px;height:7px;margin-top:4px;background:rgba(0,0,0,.6);border:1px solid rgba(159,232,255,.5);text-decoration:none}.g11-cam .bat u b{display:block;height:100%;background:#9fe8ff}
.g11-cam .bat.low u b{background:#ff8a4a}.g11-cam .bat.low{color:#ff8a4a}
.g11-cam .info{position:absolute;left:74px;bottom:38px;line-height:1.5;white-space:pre}
.g11-cam .keys{position:absolute;right:74px;bottom:38px;text-align:right;line-height:1.5;opacity:.85;white-space:pre}
.g11-cam .warn{position:absolute;left:50%;top:22%;transform:translateX(-50%);color:#ff5a4a;letter-spacing:.14em;font-size:13px;display:none;animation:g11blink .7s steps(2) infinite;background:rgba(20,0,0,.55);padding:4px 10px;border:1px solid rgba(255,90,74,.6)}
.g11-cam .xh{position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border:1px solid rgba(159,232,255,.55);border-radius:50%}
@keyframes g11blink{0%{opacity:1}50%{opacity:.15}}
`;

const V3 = THREE.Vector3;
const P3 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
const fin3 = (a) => (Array.isArray(a) && a.length >= 3 && a.every(Number.isFinite) ? { x: a[0], y: a[1], z: a[2] } : null);
const fmtT = (s) => Math.floor(s / 60) + ':' + String(Math.max(0, Math.floor(s % 60))).padStart(2, '0');

export function installGear11(game) {
  const g = game, mods = game.mods, scene = game.scene;
  const offs = [], undo = [], timers = [];
  let disposed = false, T = 0, netRef = null;
  const warned = new Set();
  const safe = (label, fn, a, b) => { try { return fn(a, b); } catch (e) { if (!warned.has(label)) { warned.add(label); console.warn('[gear11] ' + label, e); } } };
  function wrap(obj, name, make) {
    const raw = obj?.[name];
    if (typeof raw !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name);
    const mine = make(raw.bind(obj));
    obj[name] = mine;
    undo.push(() => { if (obj[name] === mine) { if (had) obj[name] = raw; else delete obj[name]; } });
  }
  const later = (fn, ms) => { const id = setTimeout(() => { const i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1); if (!disposed) fn(); }, ms); timers.push(id); };
  const toast = (s, kind) => g.ui?.toast?.(t(s), kind);
  const me = () => g.selfId;
  const posOf = (id) => (id === g.selfId ? g.player?.pos : g.remotes?.get?.(id)?.pos) || null;
  const nameOf = (id) => g.net?.players?.get?.(id)?.name || '';

  // ---------------------------------------------------------------- assets
  if (mods?.soundGens) for (const [n, fn] of Object.entries(A.SOUNDS)) if (!mods.soundGens.has(n)) mods.soundGens.set(n, fn);
  if (mods?.itemModels) for (const [id, fn] of Object.entries(A.ITEM_MODELS)) if (!mods.itemModels.has(id)) mods.itemModels.set(id, () => fn());
  const _sp = new V3();
  const snd = (name, pos, vol = 1, pitch, o = {}) => {
    try {
      mods?.ensureSound?.(name);
      if (pos) g.audio.at(name, pos.isVector3 ? pos : _sp.set(pos.x, pos.y, pos.z), vol, { refDistance: o.ref ?? 4, maxDistance: o.max ?? 60, pitch, occlude: o.occlude !== false });
      else g.audio.play(name, { volume: vol, bus: 'sfx', pitch });
    } catch { /* audio not ready */ }
  };

  // ---------------------------------------------------------------- DOM (hint, trail chip, drone camera overlay)
  let hintEl = null, chipEl = null, camEl = null, camRef = {};
  function ensureDom() {
    if (hintEl || typeof document === 'undefined') return;
    if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); }
    const host = document.getElementById('ui') || document.body;
    const mk = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; host.appendChild(d); return d; };
    hintEl = mk('g11-hint'); chipEl = mk('g11-chip');
    camEl = mk('g11-cam', '<div class="tint"></div><div class="sc"></div><div class="noise"></div><div class="cor c1"></div><div class="cor c2"></div><div class="cor c3"></div><div class="cor c4"></div><div class="xh"></div>'
      + '<div class="rec"><i></i><span data-k="rec"></span></div><div class="bat"><span data-k="bat"></span><u><b></b></u></div><div class="info" data-k="info"></div><div class="keys" data-k="keys"></div><div class="warn" data-k="warn"></div>');
    camRef = { rec: camEl.querySelector('[data-k=rec]'), bat: camEl.querySelector('.bat'), batT: camEl.querySelector('[data-k=bat]'), batB: camEl.querySelector('.bat b'), info: camEl.querySelector('[data-k=info]'),
      keys: camEl.querySelector('[data-k=keys]'), warn: camEl.querySelector('[data-k=warn]'), noise: camEl.querySelector('.noise') };
  }
  const setText = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };

  // ================================================================================================== state
  const jams = new Map();          // every peer: doorId -> { end, mesh, beepT }
  const dots = [];                 // every peer: { x, y, z, h, ci, born, by }
  let trailMesh = null, trailDirty = true, trailAcc = 0;
  const zip = { on: false, a: null, b: null, n: null, by: null, ropeG: null, post: null, bracket: null };
  const pings = [];                // { mesh, born }
  const speakers = [];             // { mesh, until, bubbleT }
  const remoteDrones = new Map();  // peerId -> { mesh, seen, moving, humT }
  const host = { jams: new Map(), zip: null, dots: [], active: new Map(), lastDot: new Map(), lastPing: new Map(), lastUse: new Map() };
  const S = { look: { x: 0, y: 0 }, trailUntil: 0, lastDrop: null, ride: null, cushion: 0, pilot: null, click: 0, scanReq: false, hintKey: '', hintT: 0, snapAsked: 0 };

  // ================================================================================================== host helpers
  const consumeCharge = (it) => {
    const left = it.charges ?? 1;
    if (left > 1) { it.charges = left - 1; netRef.broadcast('itst', { id: it.id, c: it.charges }); } else netRef.broadcast('it', { e: 'rm', id: it.id });
  };
  const reply = (to, m) => netRef.sendTo(to, 'g11st', { k: 'msg', m });
  const heldOk = (d, from, type) => { const it = g.items.get(d?.id); return it && it.holder === from && it.type === type ? it : null; };
  const rateOk = (from, key, gap) => { const k = from + key; if (T - (host.lastUse.get(k) ?? -9) < gap) return false; host.lastUse.set(k, T); return true; };

  function hostReq(d, from) {
    if (!g.isHost || disposed || !d) return;
    switch (d.op) {
      case 'jam': return hostJam(d, from);
      case 'trail': return hostTrail(d, from);
      case 'dot': return hostDot(d, from);
      case 'zip': return hostZip(d, from);
      case 'zipdel': return hostZipDel(d, from);
      case 'ping': return hostPing(d, from);
      default: break;
    }
  }
  function hostJam(d, from) {
    const it = heldOk(d, from, 'doorjammer');
    if (!it || !rateOk(from, 'jam', 0.5)) return;
    const door = g.doorById(d.door);
    const at = posOf(from);
    if (!door || !C.canJam(door) || host.jams.has(door.id) || (at && Math.hypot(door.pos.x - at.x, door.pos.z - at.z) > C.JAM.reach + 2)) { reply(from, 'jamno'); return; }
    consumeCharge(it);
    if (door.open) g.hostSetDoor(door.id, false, true);
    door.locked = true; door.jam = T + C.JAM.sec;
    netRef.broadcast('door', { id: door.id, open: false, locked: true, silent: true });
    host.jams.set(door.id, { end: T + C.JAM.sec, by: from });
    netRef.broadcast('g11st', { k: 'jam', id: door.id, sec: C.JAM.sec, by: from });
    g.creatures?.noise?.(door.pos.clone(), 0.5);
  }
  function hostJamTick() {
    for (const [id, j] of [...host.jams]) {
      if (T < j.end) continue;
      host.jams.delete(id);
      const door = g.doorById(id);
      if (door) { door.locked = false; door.jam = 0; netRef.broadcast('door', { id, open: false, locked: false, silent: true }); g.creatures?.noise?.(door.pos.clone(), C.JAM.endNoise); }
      netRef.broadcast('g11st', { k: 'jamend', id });
    }
  }
  function hostTrail(d, from) {
    const it = heldOk(d, from, 'glowspray');
    if (!it || !rateOk(from, 'tr', 0.6)) return;
    if ((host.active.get(from) ?? 0) > T) { reply(from, 'trailon'); return; }
    consumeCharge(it);
    host.active.set(from, T + C.TRAIL.sec); host.lastDot.delete(from);
    netRef.broadcast('g11st', { k: 'tr', by: from, sec: C.TRAIL.sec });
  }
  function hostDot(d, from) {
    const p = fin3(d.p), at = posOf(from);
    if (!p || !at || !Number.isFinite(d.h)) return;
    if (!C.dotOk(host.lastDot.get(from), p, at, host.active.get(from) ?? 0, T)) return;
    host.lastDot.set(from, p);
    const dot = { by: from, p: P3(p), h: +d.h.toFixed(2), t: T };
    host.dots.push(dot);
    if (host.dots.length > C.TRAIL.max) host.dots.shift();
    netRef.broadcast('g11st', { k: 'dot', by: from, p: dot.p, h: dot.h });
  }
  function hostZip(d, from) {
    const it = heldOk(d, from, 'ziplinekit');
    if (!it || !rateOk(from, 'zip', 0.8)) return;
    const a = fin3(d.a), b = fin3(d.b), n = fin3(d.n), at = posOf(from);
    if (host.zip) { reply(from, 'zipexists'); return; }
    if (!a || !b || !n || !at) return;
    const v = C.validateAnchor(a, b, n);
    if (!v.ok || Math.hypot(a.x - at.x, a.z - at.z) > 3.2 || Math.abs((a.y - C.ZIP.postH) - at.y) > 1.6) { reply(from, v.reason === 'floor' ? 'zipfloor' : v.reason === 'far' ? 'zipfar' : 'zipno'); return; }
    if (!g.physics.lineOfSight(new V3(a.x, a.y, a.z), new V3(b.x, b.y, b.z), G.STATIC)) { reply(from, 'zipno'); return; }
    consumeCharge(it);
    host.zip = { a: P3(a), b: P3(b), n: P3(n), by: from };
    netRef.broadcast('g11st', { k: 'zip', ...host.zip });
  }
  function hostZipDel(d, from) {
    const z = host.zip, at = posOf(from);
    if (!z || !at || !rateOk(from, 'zipdel', 0.6)) return;
    const ea = Math.hypot(z.a[0] - at.x, z.a[2] - at.z) < 3.4 && Math.abs(z.a[1] - C.ZIP.hang - at.y) < 3;
    const eb = Math.hypot(z.b[0] - at.x, z.b[2] - at.z) < 3.4 && Math.abs(z.b[1] - C.ZIP.hang - at.y) < 3.5;
    if (!ea && !eb) return;
    const floor = new V3(z.a[0], z.a[1] - C.ZIP.postH + 0.5, z.a[2]);
    host.zip = null;
    netRef.broadcast('g11st', { k: 'zipdel' });
    try { g.items.hostSpawn('ziplinekit', floor, {}); } catch (e) { console.warn('[gear11] kit respawn', e); }
  }
  function hostPing(d, from) {
    if (!rateOk(from, 'ping', 1.2) || !Array.isArray(d.l)) return;
    const o = fin3(d.o); if (!o) return;
    const l = [];
    for (const r of d.l.slice(0, C.DRONE.maxPings)) { const p = fin3(r?.slice?.(1)); if (p && (r[0] === 'c' || r[0] === 'i')) l.push([r[0], ...P3(p)]); }
    netRef.broadcast('g11st', { k: 'ping', by: from, o: P3(o), l });
  }
  function hostSync(from) {
    const jl = [...host.jams].map(([id, j]) => ({ id, left: +(j.end - T).toFixed(1), by: j.by }));
    const act = {}; for (const [id, u] of host.active) if (u > T) act[id] = +(u - T).toFixed(1);
    netRef.sendTo(from, 'g11st', { k: 'snap', jams: jl, zip: host.zip, dots: host.dots.map((x) => ({ by: x.by, p: x.p, h: x.h, age: +(T - x.t).toFixed(1) })), act });
  }

  // ================================================================================================== client: apply host state
  function onState(d) {
    if (!d || disposed) return;
    switch (d.k) {
      case 'jam': addJam(d.id, d.sec, d.by); break;
      case 'jamend': endJam(d.id, true); break;
      case 'tr': onTrailOn(d); break;
      case 'dot': addDot(d.by, d.p, d.h, 0); break;
      case 'zip': setZip(d); break;
      case 'zipdel': clearZip(true); break;
      case 'ping': onPing(d); break;
      case 'msg': toast(MSG[d.m] || d.m, 'bad'); break;
      case 'snap': applySnap(d); break;
      default: break;
    }
  }
  const MSG = {
    jamno: 'That door cannot be jammed.', trailon: 'Your trail is already glowing.', zipexists: 'A zipline is already rigged on this landing. Retract it first (Crouch + E).',
    zipfloor: 'Aim at a wall or the ceiling, not the floor.', zipfar: 'Too far. The anchor must be within 18 m.', zipno: 'No clear line to that spot.',
  };
  function applySnap(d) {
    for (const j of d.jams || []) addJam(j.id, j.left, j.by, true);
    if (d.zip) setZip(d.zip, true);
    for (const x of d.dots || []) addDot(x.by, x.p, x.h, x.age || 0, true);
    for (const [id, left] of Object.entries(d.act || {})) if (id === me()) { S.trailUntil = T + left; }
    trailDirty = true;
  }
  function resetAll() {
    for (const id of [...jams.keys()]) endJam(id, false);
    dots.length = 0; trailDirty = true;
    clearZip(false);
    for (const p of pings) { scene.remove(p.mesh); p.mesh.userData.dispose?.(); }
    pings.length = 0;
    host.jams.clear(); host.zip = null; host.dots.length = 0; host.active.clear(); host.lastDot.clear();
    S.trailUntil = 0; S.lastDrop = null;
    if (S.ride) endRide('reset');
    if (S.pilot) endDrone('lost');
  }

  // ================================================================================================== DOOR JAMMER
  function addJam(id, sec, by, quiet) {
    const door = g.doorById?.(id);
    if (!door || jams.has(id)) return;
    door.locked = true; door.jam = 1;
    const mesh = A.buildJammerMesh();
    mesh.position.set(door.pos.x, door.pos.y + 1.15, door.pos.z);
    mesh.rotation.y = door.rotY || 0;
    scene.add(mesh);
    jams.set(id, { end: T + sec, mesh, beepT: 0, door });
    if (!quiet) { snd('g11_jam', new V3(door.pos.x, door.pos.y + 1.2, door.pos.z), 1, 1, { ref: 6, max: 50 }); if (by === me()) toast('Door jammed for 40 s.', 'good'); }
  }
  function endJam(id, loud) {
    const j = jams.get(id);
    if (!j) return;
    jams.delete(id);
    j.door.jam = 0;
    scene.remove(j.mesh); j.mesh.userData.dispose?.();
    if (loud) snd('g11_beep_end', new V3(j.door.pos.x, j.door.pos.y + 1.2, j.door.pos.z), 1.5, 1, { ref: 9, max: 90, occlude: false });
  }
  function jamsView(dt) {
    for (const [id, j] of jams) {
      const left = j.end - T;
      const blink = left <= C.JAM.warn ? Math.sin(T * (18 - left * 2)) > 0 : Math.sin(T * 3) > 0.6;
      j.mesh.userData.ledMat.color.setHex(blink ? 0xff4030 : 0x501410);
      j.beepT -= dt;
      if (left <= C.JAM.warn && j.beepT <= 0) { j.beepT = C.jamBeepGap(left); snd('g11_beep', new V3(j.door.pos.x, j.door.pos.y + 1.2, j.door.pos.z), 0.7, 1 + (C.JAM.warn - left) * 0.04, { ref: 5, max: 40 }); }
      if (left < -3 && !g.isHost) endJam(id, false);   // the host's 'jamend' never arrived
    }
  }
  function tryJam(it) {
    const p = g.player;
    const door = C.pickDoor(g.world?.facility?.doors, p.pos, p.forward(), C.JAM.reach);
    if (!door) { toast('Aim at a plain door within 3 m.'); g.sfx?.('door_locked', 0.4); return; }
    netRef.request('g11req', { op: 'jam', id: it.id, door: door.id });
  }

  // ================================================================================================== GLOW TRAIL
  function ensureTrail() {
    if (trailMesh) return;
    trailMesh = A.buildTrailMesh();
    scene.add(trailMesh);
  }
  function addDot(by, p, h, age, quiet) {
    if (!Array.isArray(p) || p.length < 3) return;
    ensureTrail();
    dots.push({ x: p[0], y: p[1], z: p[2], h: h || 0, ci: C.trailColorIdx(by), born: T - (age || 0), by });
    if (dots.length > C.TRAIL.max) dots.shift();
    trailDirty = true;
    void quiet;
  }
  function onTrailOn(d) {
    const at = d.by === me() ? g.player.pos : posOf(d.by);
    if (at) snd('g11_spray', new V3(at.x, at.y + 1.1, at.z), 0.8, 1, { ref: 4, max: 30 });
    if (d.by === me()) { S.trailUntil = T + d.sec; S.lastDrop = null; toast('Glow trail on for 2 minutes.', 'good'); }
    else toast(tf('{name} is marking a glow trail.', { name: nameOf(d.by) || 'Crew' }), 'info');
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V3(), _pp = new V3(), _up = new V3(0, 1, 0), _c = new THREE.Color();
  function trailView(dt) {
    const p = g.player;
    // owner: drop a dot every ~3.4 m while the spray lasts
    if (S.trailUntil > T && p && !p.dead && p.grounded && !S.ride && !S.pilot) {
      const cur = { x: p.pos.x, y: p.pos.y + 0.05, z: p.pos.z };
      if (C.trailShouldDrop(S.lastDrop, cur)) {
        const h = S.lastDrop ? C.backHeading(cur, S.lastDrop) : p.yaw;
        S.lastDrop = cur;
        netRef.request('g11req', { op: 'dot', p: P3(cur), h });
      }
    }
    trailAcc -= dt;
    if (!trailMesh || (!trailDirty && trailAcc > 0)) return;
    trailAcc = 0.25; trailDirty = false;
    let w = 0;
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i], a = C.dotAlpha(T - d.born);
      if (a <= 0) continue;
      dots[w++] = d;
      const s = (0.55 + 0.45 * a) * 1.7;
      _q.setFromAxisAngle(_up, d.h);
      _m.compose(_pp.set(d.x, d.y, d.z), _q, _s.set(s, 1, s));
      trailMesh.setMatrixAt(w - 1, _m);
      const glow = a * (0.78 + 0.22 * Math.sin(T * 3 + i * 0.7));
      _c.setHex(A_COL[d.ci] ?? 0x4dffb4).multiplyScalar(glow);
      trailMesh.setColorAt(w - 1, _c);
    }
    dots.length = w;
    trailMesh.count = w;
    trailMesh.instanceMatrix.needsUpdate = true;
    if (trailMesh.instanceColor) trailMesh.instanceColor.needsUpdate = true;
  }
  const A_COL = C.TRAIL_COLORS;
  function tryTrail(it) {
    if (S.trailUntil > T) { toast('Your trail is already glowing.'); return; }
    netRef.request('g11req', { op: 'trail', id: it.id });
  }

  // ================================================================================================== ZIPLINE
  function setZip(d, quiet) {
    clearZip(false);
    const a = fin3(d.a), b = fin3(d.b), n = fin3(d.n);
    if (!a || !b) return;
    zip.on = true; zip.a = a; zip.b = b; zip.n = n || { x: 0, y: 0, z: 1 }; zip.by = d.by;
    zip.post = A.buildZipPost(); zip.post.position.set(a.x, a.y - C.ZIP.postH, a.z);
    zip.bracket = A.buildZipBracket(); zip.bracket.position.set(b.x, b.y, b.z);
    zip.bracket.lookAt(b.x + zip.n.x, b.y + zip.n.y, b.z + zip.n.z);
    zip.ropeG = A.buildZipRope(a, b);
    scene.add(zip.post, zip.bracket, zip.ropeG);
    if (!quiet) snd('g11_zipshot', new V3(a.x, a.y, a.z), 1, 1, { ref: 6, max: 60 });
  }
  function clearZip(loud) {
    if (loud && zip.on) snd('g11_zipclick', new V3(zip.a.x, zip.a.y - 1, zip.a.z), 0.9, 0.8, { ref: 5, max: 40 });
    for (const k of ['post', 'bracket', 'ropeG']) { if (zip[k]) { scene.remove(zip[k]); zip[k].userData.dispose?.(); zip[k] = null; } }
    zip.on = false;
    if (S.ride && loud) endRide('cut');
  }
  function tryZip(it) {
    const p = g.player;
    if (zip.on) { toast(MSG.zipexists); return; }
    const eye = p.eyePos(), f = p.forward();
    const hit = g.physics.raycast(eye, f, C.ZIP.range + 0.6, G.STATIC, p.col);
    if (!hit) { toast('Nothing to anchor to. Aim at a wall or the ceiling within 18 m.'); return; }
    const nrm = hit.normal || { x: 0, y: 0, z: 1 };
    const b = { x: eye.x + f.x * hit.distance + nrm.x * 0.08, y: eye.y + f.y * hit.distance + nrm.y * 0.08, z: eye.z + f.z * hit.distance + nrm.z * 0.08 };
    // the pole stands ~0.9 m in front of you (never inside a wall)
    const fh = new V3(f.x, 0, f.z).normalize();
    const wall = g.physics.raycast({ x: p.pos.x, y: p.pos.y + 1, z: p.pos.z }, fh, 1.2, G.STATIC | G.DOOR, p.col);
    const off = Math.max(0.25, Math.min(0.9, (wall ? wall.distance : 1.2) - 0.35));
    const a = { x: p.pos.x + fh.x * off, y: p.pos.y + C.ZIP.postH, z: p.pos.z + fh.z * off };
    const v = C.validateAnchor(a, b, nrm);
    if (!v.ok) { toast(v.reason === 'floor' ? MSG.zipfloor : v.reason === 'far' ? MSG.zipfar : v.reason === 'near' ? 'Too close. Pick a spot at least 3 m away.' : MSG.zipno); return; }
    if (!g.physics.lineOfSight(new V3(a.x, a.y, a.z), new V3(b.x, b.y, b.z), G.STATIC)) { toast(MSG.zipno); return; }
    netRef.request('g11req', { op: 'zip', id: it.id, a: P3(a), b: P3(b), n: P3(nrm) });
  }
  function mount(end) {
    const p = g.player;
    if (!zip.on || S.ride || S.pilot || p.dead || p.latched || p.downed || g.cruiser?.seated) return;
    const L = Math.hypot(zip.b.x - zip.a.x, zip.b.y - zip.a.y, zip.b.z - zip.a.z);
    S.ride = { dir: end === 'a' ? 1 : -1, u: end === 'a' ? 0 : 1, L, speed: C.zipSpeed(p.carryWeight?.() ?? 0, !!p.bodyCarry, p.carryMul || 1), hp: p.hp, whirT: 0, t0: T };
    snd('g11_zipclick', null, 0.7, 1);
    toast('Sliding. Space lets go.', 'info');
  }
  function endRide(why) {
    if (!S.ride) return;
    S.ride = null;
    S.cushion = T + C.ZIP.cushionSec;
    if (why !== 'reset') snd('g11_zipclick', null, 0.6, 0.85);
  }
  function rideUpdate(dt) {
    const p = g.player, r = S.ride;
    if (S.cushion > T && !r && p && !p.grounded) { p.vel.y = Math.max(p.vel.y, -9); p.minVelY = Math.max(p.minVelY, -9); }
    if (!r) return;
    if (!zip.on || p.dead || p.latched || p.downed || p.hp < r.hp - 0.5) { endRide('hurt'); return; }
    r.hp = Math.min(r.hp, p.hp) + 0;
    if (g.input.pressed('jump') && T - r.t0 > 0.4) { endRide('release'); return; }
    r.u += r.dir * r.speed * dt / r.L;
    const done = (r.dir > 0 && r.u >= 1) || (r.dir < 0 && r.u <= 0);
    r.u = Math.min(1, Math.max(0, r.u));
    const mid = C.zipPoint(zip.a, zip.b, r.u);
    const gh = g.physics.raycast({ x: mid.x, y: mid.y - C.ZIP.hang + 1.2, z: mid.z }, { x: 0, y: -1, z: 0 }, 6, G.STATIC, p.col);
    const floorY = gh ? mid.y - C.ZIP.hang + 1.2 - gh.distance : null;
    const feet = C.hangFeet(zip.a, zip.b, r.u, floorY);
    const cam = g.camera;
    _pp.copy(p.pos);
    p.teleport(new V3(feet.x, feet.y, feet.z));
    cam.position.x += p.pos.x - _pp.x; cam.position.y += p.pos.y - _pp.y; cam.position.z += p.pos.z - _pp.z;
    p.fallStartY = null;
    r.whirT -= dt;
    if (r.whirT <= 0) { r.whirT = 0.36; snd('g11_ziprun', new V3(mid.x, mid.y, mid.z), 0.5, 0.9 + r.speed * 0.02, { ref: 5, max: 40 }); }
    if (done) endRide('arrived');
  }
  function zipView() {
    if (!zip.on) return;
    zip.ropeG.userData.stripe.color.setHex(0xff8a30).multiplyScalar(0.75 + 0.25 * Math.sin(T * 4));
  }
  function zipInteractables(list) {
    if (!zip.on || S.ride || S.pilot) return;
    const p = g.player;
    const ends = [['a', zip.a.x, zip.a.y - C.ZIP.postH + 1.45, zip.a.z], ['b', zip.b.x + zip.n.x * 0.5, zip.b.y - C.ZIP.hang + 1.4, zip.b.z + zip.n.z * 0.5]];
    for (const [end, x, y, z] of ends) {
      if (Math.hypot(x - p.pos.x, z - p.pos.z) > 6) continue;
      list.push({
        pos: new V3(x, y, z), r: 0.9, reach: 3.0,
        label: () => (g.input.isDown('crouch') ? t('Retract zipline [Crouch + E]') : t('Ride zipline [E]')),
        sub: () => t('Crouch + E retracts it'),
        action: () => { if (g.input.isDown('crouch')) netRef.request('g11req', { op: 'zipdel' }); else mount(end); },
      });
    }
  }

  // ================================================================================================== SCOUT DRONE
  const ray = (ox, oy, oz, dx, dy, dz, len) => {
    const h = g.physics.raycast({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz }, len, G.STATIC | G.DOOR);
    return h ? { distance: h.distance, nx: h.normal?.x ?? 0, ny: h.normal?.y ?? 0, nz: h.normal?.z ?? 0 } : null;
  };
  let lookApplied = null;
  function setLook(on) {
    const u = g.engine?.postMat?.uniforms;
    if (!u || on === !!lookApplied) return;
    if (on) {
      if (g.anomaly?.buffs?.has?.('m_nv')) return;
      lookApplied = { g: 1.25, v: 1.35, s: 0.45 };
      u.uGamma.value *= lookApplied.g; u.uVignette.value *= lookApplied.v; u.uSat.value *= lookApplied.s;
    } else {
      const f = lookApplied; lookApplied = null;
      u.uGamma.value /= f.g; u.uVignette.value /= f.v; u.uSat.value /= f.s;
    }
  }
  function startDrone(it) {
    const p = g.player;
    if (S.pilot || S.ride || p.dead || p.latched || p.downed || g.cruiser?.seated || g.minigame || g.terminal?.active) return;
    if ((it.battery ?? 0) < C.DRONE.minBattery) { g.sfx?.('battery_dead', 0.5); toast('Drone battery low. Charge it at the ship charger.'); return; }
    const eye = p.eyePos(), f = p.forward();
    const start = eye.clone().addScaledVector(f, 0.7); start.y += 0.15;
    const blocked = ray(eye.x, eye.y, eye.z, f.x, f.y, f.z, 0.75);
    if (blocked) start.copy(eye);
    ensureDom();
    S.pilot = { it, d: C.newDrone(start, p.yaw, p.pitch * 0.5), hp: p.hp, prevFrozen: p.frozen, prevBody: g.fpbody?.opts?.body, sendT: 0, noiseT: 0.5, humT: 0, scanCd: 0, link: 1, warnT: 0, hostile: false, roll: 0, speed: 0 };
    p.frozen = true;
    if (g.fpbody?.opts) g.fpbody.opts.body = false;
    g.setItemOn(it, true);
    setLook(true);
    camEl.style.display = 'block';
    snd('g11_drone_on', null, 0.7, 1);
    toast('Drone online. Your body is exposed - watch it.', 'info');
  }
  function endDrone(why) {
    const P = S.pilot;
    if (!P) return;
    S.pilot = null;
    const p = g.player;
    p.frozen = !!P.prevFrozen;
    if (g.fpbody?.opts && P.prevBody != null) g.fpbody.opts.body = P.prevBody;
    setLook(false);
    if (camEl) camEl.style.display = 'none';
    const it = g.items.get(P.it.id);
    if (it && it.on) g.setItemOn(it, false);
    if (why === 'smashed' && it) { it.battery = 0; g.net.send('itst', { id: it.id, b: 0 }); }
    netRef?.send('g11d', { m: -1 });
    // the view snaps back: restore the camera from the body next frame (player.update rewrites it), plus a flash
    g.engine?.flash?.(why === 'recall' ? 0x0a1418 : 0x203038, why === 'recall' ? 0.25 : 0.55);
    snd(why === 'smashed' ? 'g11_static' : 'g11_drone_off', null, why === 'smashed' ? 0.9 : 0.7, 1);
    if (why === 'hit') toast('Your body was hit. Drone link cut!', 'bad');
    else if (why === 'smashed') toast('Drone destroyed. Its battery is fried.', 'bad');
    else if (why === 'battery') toast('Drone battery empty. Recalled.', 'bad');
  }
  function bodyThreat(P, p) {
    let near = false;
    for (const v of g.creatures?.views?.values?.() || []) {
      if (v.state === 'dead' || v.private) continue;
      if (Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z) < 9 && Math.abs(v.pos.y - p.pos.y) < 3) { near = true; break; }
    }
    P.hostile = near;
  }
  function droneUpdate(dt) {
    const P = S.pilot;
    if (!P) return;
    const p = g.player, input = g.input, it = g.items.get(P.it.id);
    if (!it || it.holder !== me()) { endDrone('lost'); return; }
    if (!it.on) { endDrone((it.battery ?? 0) <= 0.05 ? 'battery' : 'recall'); return; }
    if (p.dead || p.latched || p.downed || g.terminal?.active || g.minigame) { endDrone('lost'); return; }
    if (p.hp < P.hp - 0.5) { endDrone('hit'); return; }
    P.hp = Math.min(P.hp, p.hp);
    if (input.pressed('interact')) { endDrone('recall'); return; }
    const d = P.d;
    d.yaw -= S.look.x; d.pitch = Math.max(-1.35, Math.min(1.35, d.pitch - S.look.y));
    S.look.x = 0; S.look.y = 0;
    const on = input.enabled;
    const axes = { f: on ? (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0) : 0, s: on ? (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0) : 0, u: on ? (input.isDown('jump') ? 1 : 0) - (input.isDown('crouch') ? 1 : 0) : 0 };
    P.speed = C.stepDrone(d, axes, dt, ray, on && input.isDown('sprint'));
    P.link = C.tether(d, { x: p.pos.x, y: p.pos.y + 1, z: p.pos.z });
    P.roll += ((-axes.s * 0.07) - P.roll) * Math.min(1, dt * 6);
    const cam = g.camera;
    cam.position.set(d.x, d.y, d.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(d.pitch, d.yaw, P.roll);
    g.viewModel?.setVisible?.(false);
    // scan (the LMB press arrives through the useItem hook)
    P.scanCd = Math.max(0, P.scanCd - dt);
    if (S.scanReq) { S.scanReq = false; if (P.scanCd <= 0) droneScan(P, it); }
    // sound: the hum draws sound-hunting creatures a little (the drone is a decoy too), and the crew hears it
    P.noiseT -= dt; P.humT -= dt;
    if (P.speed > 1.5 && P.noiseT <= 0) { P.noiseT = C.DRONE.noiseEvery; netRef.request('noise', { p: P3(d), loud: C.DRONE.noiseLoud }); }
    if (P.humT <= 0) { P.humT = 0.45; snd('g11_drone_hum', null, 0.16 + Math.min(0.2, P.speed * 0.03), 1); }
    // pose to the crew
    P.sendT -= dt;
    if (P.sendT <= 0) { P.sendT = 1 / C.DRONE.sendHz; netRef.send('g11d', { p: P3(d), y: +d.yaw.toFixed(2), m: P.speed > 0.6 ? 1 : 0 }); }
    // creatures: a touch smashes it. the body's own threat is shown on the HUD (telegraph)
    P.warnT -= dt;
    if (P.warnT <= 0) { P.warnT = 0.3; bodyThreat(P, p); }
    for (const v of g.creatures?.views?.values?.() || []) {
      if (v.state === 'dead' || v.private || v.def?.hazard) continue;
      if (C.droneHit(d, { x: v.pos.x, y: v.pos.y + Math.min(v.def?.height || 1.2, 2.2) * 0.5, z: v.pos.z })) { endDrone('smashed'); return; }
    }
    droneHud(P, it, p);
  }
  function droneScan(P, it) {
    const d = P.d, dp = new V3(d.x, d.y, d.z), cands = [];
    for (const x of g.items.all()) {
      if (x.state !== 'world' || x.type === 'body' || !x.obj || !(x.value > 0 || x.def?.kind === 'big')) continue;
      cands.push({ k: 'i', x: x.obj.position.x, y: x.obj.position.y, z: x.obj.position.z });
    }
    for (const v of g.creatures?.views?.values?.() || []) {
      if (v.state === 'dead' || v.private) continue;
      cands.push({ k: 'c', x: v.pos.x, y: v.pos.y + Math.min(v.def?.height || 1.2, 2.2) * 0.5, z: v.pos.z });
    }
    const los = (o, c) => g.physics.lineOfSight(dp, new V3(c.x, c.y, c.z), G.STATIC | G.DOOR);
    const hits = C.pickTargets(cands, d, los);
    P.scanCd = C.DRONE.scanCd;
    it.battery = Math.max(0, (it.battery ?? 0) - C.DRONE.scanCost);
    if (!hits.length) { toast('Scan: nothing in sight.'); return; }
    netRef.request('g11req', { op: 'ping', o: P3(d), l: hits.map((h) => [h.k, +h.x.toFixed(2), +h.y.toFixed(2), +h.z.toFixed(2)]) });
  }
  function onPing(d) {
    const o = fin3(d.o);
    if (o) snd('g11_scan', new V3(o.x, o.y, o.z), 0.9, 1, { ref: 8, max: 70, occlude: false });
    for (const r of d.l || []) {
      const mesh = A.buildPingMesh(r[0]);
      mesh.position.set(r[1], r[2], r[3]);
      scene.add(mesh);
      pings.push({ mesh, born: T, k: r[0] });
    }
    while (pings.length > 24) { const x = pings.shift(); scene.remove(x.mesh); x.mesh.userData.dispose?.(); }
    if (d.by !== me()) toast(tf('{name}\'s drone scan: {n} marked.', { name: nameOf(d.by) || 'Crew', n: (d.l || []).length }), 'info');
    else toast(tf('Scan marked {n} for the crew.', { n: (d.l || []).length }), 'good');
  }
  function pingsView() {
    const cam = g.camera.position;
    for (let i = pings.length - 1; i >= 0; i--) {
      const p = pings[i], age = T - p.born;
      if (age > C.DRONE.pingSec) { scene.remove(p.mesh); p.mesh.userData.dispose?.(); pings.splice(i, 1); continue; }
      const dist = cam.distanceTo(p.mesh.position);
      p.mesh.scale.setScalar(Math.min(4, Math.max(1, dist * 0.07)) * (0.85 + 0.15 * Math.sin(T * 6 + i)));
      p.mesh.rotation.y = T * 2.2;
      p.mesh.material.opacity = age > C.DRONE.pingSec - 2 ? Math.max(0, (C.DRONE.pingSec - age) / 2) * 0.92 : 0.92;
    }
  }
  function droneHud(P, it, p) {
    const cap = ITEMS.scoutdrone.battery || 30, b = it.battery ?? 0, dist = Math.hypot(P.d.x - p.pos.x, P.d.y - p.pos.y, P.d.z - p.pos.z);
    setText(camRef.rec, t('DRONE CAM'));
    setText(camRef.batT, tf('BATTERY {s} s', { s: Math.ceil(b) }));
    camRef.batB.style.width = Math.max(0, Math.min(100, (b / cap) * 100)) + '%';
    camRef.bat.classList.toggle('low', b < 8);
    setText(camRef.info, tf('LINK {q}%', { q: Math.round(P.link * 100) }) + '\n' + tf('BODY {m} m', { m: Math.round(dist) }) + '\n' + (P.scanCd > 0 ? tf('SCAN {s} s', { s: Math.ceil(P.scanCd) }) : t('SCAN READY')));
    setText(camRef.keys, t('WASD fly / Space up / C down') + '\n' + t('LMB scan / E recall'));
    camRef.noise.style.opacity = String(Math.max(0, (1 - P.link) * 0.7) + (g.settings?.reduceMotion ? 0 : (P.link < 0.3 ? Math.random() * 0.12 : 0)));
    camRef.warn.style.display = P.hostile ? 'block' : 'none';
    setText(camRef.warn, t('HOSTILE NEAR YOUR BODY'));
  }
  // other peers' drones
  function onDronePose(d, from) {
    if (!d || from === me()) return;
    if (d.m < 0) { removeRemoteDrone(from); return; }
    const p = fin3(d.p); if (!p) return;
    let r = remoteDrones.get(from);
    if (!r) { r = { mesh: A.buildDroneMesh(1), seen: T, moving: false, humT: 0, tx: p.x, ty: p.y, tz: p.z, yaw: 0 }; r.mesh.position.set(p.x, p.y, p.z); scene.add(r.mesh); remoteDrones.set(from, r); }
    r.tx = p.x; r.ty = p.y; r.tz = p.z; r.yaw = Number(d.y) || 0; r.moving = d.m === 1; r.seen = T;
  }
  function removeRemoteDrone(id) {
    const r = remoteDrones.get(id);
    if (!r) return;
    scene.remove(r.mesh); r.mesh.userData.dispose?.(); remoteDrones.delete(id);
  }
  function remoteDronesView(dt) {
    for (const [id, r] of remoteDrones) {
      if (T - r.seen > 2) { removeRemoteDrone(id); continue; }
      const k = 1 - Math.exp(-12 * dt), m = r.mesh;
      m.position.x += (r.tx - m.position.x) * k; m.position.y += (r.ty - m.position.y) * k; m.position.z += (r.tz - m.position.z) * k;
      m.rotation.y += (r.yaw + Math.PI - m.rotation.y) * k;
      for (const rot of m.userData.rotors) rot.rotation.y += dt * (r.moving ? 60 : 38);
      m.userData.ledMat.color.setHex(Math.sin(T * 7) > 0 ? 0xff3030 : 0x401010);
      r.humT -= dt;
      if (r.humT <= 0) { r.humT = 0.45; snd('g11_drone_hum', m.position, 0.35, r.moving ? 1.1 : 0.95, { ref: 3, max: 30 }); }
    }
  }

  // ================================================================================================== DECOY SPEAKER (called from grenades.js)
  let bubbleTex = null, bubbleLang = '';
  function bubbleSprite() {
    const lang = getLang();
    if (!bubbleTex || bubbleLang !== lang) {
      bubbleTex?.dispose?.();
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
      const c = cv.getContext('2d');
      c.fillStyle = 'rgba(12,12,16,.85)'; c.fillRect(0, 0, 256, 64); c.strokeStyle = '#ffd23f'; c.lineWidth = 3; c.strokeRect(2, 2, 252, 60);
      c.fillStyle = '#ffd23f'; c.font = 'bold 22px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t(C.SPEAKER_PHRASE), 128, 34);
      bubbleTex = new THREE.CanvasTexture(cv); bubbleTex.magFilter = THREE.NearestFilter; bubbleLang = lang;
    }
    const mat = new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, depthWrite: false, fog: false });
    const s = new THREE.Sprite(mat); s.scale.set(1.5, 0.375, 1); s.visible = false; s.renderOrder = 5;
    return s;
  }
  function speakerDeploy(pos, dur) {
    if (disposed) return;
    const mesh = A.buildSpeakerMesh();
    mesh.position.copy(pos); mesh.position.y -= 0.05;
    const bub = bubbleSprite(); bub.position.set(0, 1.25, 0); mesh.add(bub);
    scene.add(mesh);
    speakers.push({ mesh, bub, until: T + dur, pulse: 0, bubT: 0 });
    snd('g11_speaker_on', pos, 0.9, 1, { ref: 5, max: 45 });
  }
  function playLastClip(pos, owner) {
    const v = g.voice, ctx = g.audio?.ctx, list = v?.clips?.get?.(owner);
    if (!ctx || !list?.length || !g.audio.buses?.voice) return false;
    const buf = list[list.length - 1];
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = 0.97 + Math.random() * 0.06;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    const gn = ctx.createGain(); gn.gain.value = 1.5;
    const pn = ctx.createPanner(); pn.panningModel = 'HRTF'; pn.refDistance = 3; pn.maxDistance = 55; pn.rolloffFactor = 1.05;
    pn.positionX.value = pos.x; pn.positionY.value = pos.y; pn.positionZ.value = pos.z;
    src.connect(lp).connect(gn).connect(pn).connect(g.audio.buses.voice);
    src.start();
    return true;
  }
  function fakeVoice(pos) {
    try { snd(g.audio.variant('mimic_voice', 2), pos, 0.9, 0.9, { ref: 5, max: 50 }); } catch { /* audio not ready */ }
    // a cheap robot "Hey, over here!" through the browser voice, quieter with distance (not spatial: a crude but readable tell)
    try {
      const ss = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
      const d = g.camera.position.distanceTo(pos);
      if (!ss || d > 22 || g.settings?.muted) return;
      ss.cancel();
      const u = new SpeechSynthesisUtterance(t(C.SPEAKER_PHRASE)); u.lang = speechLang(); u.rate = 1.15; u.pitch = 0.5; u.volume = Math.max(0.05, 0.85 * (1 - d / 22));
      ss.speak(u);
    } catch { /* no speech synthesis */ }
  }
  function speakerPulse(pos, owner) {
    if (disposed) return;
    let sp = null, bd = 3;
    for (const s of speakers) { const d = s.mesh.position.distanceTo(pos); if (d < bd) { bd = d; sp = s; } }
    const real = owner != null && playLastClip(pos, owner);
    if (!real) fakeVoice(pos);
    if (sp) { sp.pulse = 1; if (!real) sp.bubT = 1.6; }
  }
  function speakersView(dt) {
    for (let i = speakers.length - 1; i >= 0; i--) {
      const s = speakers[i];
      if (T >= s.until) { scene.remove(s.mesh); s.mesh.userData.dispose?.(); s.bub.material.dispose(); speakers.splice(i, 1); continue; }
      s.pulse = Math.max(0, s.pulse - dt * 2.5); s.bubT = Math.max(0, s.bubT - dt);
      s.mesh.userData.cone.scale.setScalar(1 + s.pulse * 0.35);
      s.mesh.userData.ledMat.color.setHex(Math.sin(T * 9) > 0 ? 0x40ffb0 : 0x104030);
      s.bub.visible = s.bubT > 0;
    }
  }

  // ================================================================================================== item use + interactions
  function onUseItem(it, hk, gg) {
    if (gg !== g || hk.handled || disposed) return;
    if (S.pilot) { hk.handled = true; S.scanReq = true; return; }
    if (S.ride) { hk.handled = true; return; }
    if (!it || !netRef) return;
    if (!C.ITEM_IDS.includes(it.type)) return;
    hk.handled = true;
    if (T - S.click < 0.35) return;
    S.click = T;
    switch (it.type) {
      case 'doorjammer': tryJam(it); break;
      case 'glowspray': tryTrail(it); break;
      case 'ziplinekit': tryZip(it); break;
      case 'scoutdrone': startDrone(it); break;
      default: break;
    }
  }
  offs.push(mods.on('useItem', (it, hk, gg) => { safe('useItem', () => onUseItem(it, hk, gg)); }));
  offs.push(mods.on('interactables', (list, gg) => { if (gg === g && !disposed) safe('interactables', zipInteractables, list); }));
  wrap(g.input, 'consumeMouse', (raw) => () => { const r = raw(); if (S.pilot) { S.look.x += r.dx; S.look.y += r.dy; } return r; });
  wrap(g, 'findInteraction', (raw) => () => (S.pilot || S.ride ? null : raw()));
  wrap(g, 'doorInteraction', (raw) => (door) => {
    const j = door && jams.get(door.id);
    if (j) return { label: t('Jammed shut'), sub: tf('Opens in {s} s', { s: Math.max(1, Math.ceil(j.end - T)) }), action: () => g.audio?.at?.('door_locked', new V3(door.pos.x, door.pos.y + 1, door.pos.z), 0.8) };
    return raw(door);
  });

  // ================================================================================================== HUD hint
  const HINTS = {
    doorjammer: '<b>[LMB]</b> jam the door in front of you (40 s)',
    scoutdrone: '<b>[LMB]</b> launch the drone - your body stays put',
    glowspray: '<b>[LMB]</b> spray a glow trail (2 min)',
    ziplinekit: '<b>[LMB]</b> aim at a wall / ceiling (18 m) to rig a zipline',
    decoyspeaker: 'hold <b>[LMB]</b> to aim, release to throw - it plays your voice',
  };
  function hintView(dt) {
    ensureDom();
    S.hintT -= dt;
    if (S.hintT > 0) return;
    S.hintT = 0.2;
    const p = g.player, held = p?.heldItem?.();
    let key = '';
    if (S.ride) key = 'ride';
    else if (!S.pilot && held && HINTS[held.type]) key = held.type;
    if (key !== S.hintKey) {
      S.hintKey = key;
      hintEl.style.display = key ? 'block' : 'none';
      if (key) hintEl.innerHTML = key === 'ride' ? t('<b>[Space]</b> let go') : t(HINTS[key]);
    }
    const tl = S.trailUntil - T;
    if (tl > 0 && !S.pilot) { chipEl.style.display = 'block'; setText(chipEl, tf('GLOW TRAIL {t}', { t: fmtT(tl) })); } else chipEl.style.display = 'none';
  }

  // ================================================================================================== net + frame
  function bindNet(net) {
    netRef = net;
    net.relayTypes?.add?.('g11d');
    net.on_('g11st', (d) => safe('g11st', onState, d));
    net.on_('g11d', (d, from) => safe('g11d', onDronePose, d, from));
    net.handle('g11req', (d, from) => safe('g11req', hostReq, d, from));
    net.handle('g11sync', (d, from) => { if (g.isHost) safe('g11sync', hostSync, from); });
  }
  offs.push(mods.on('netReady', (net) => bindNet(net)));
  if (g.net && g.net !== netRef) { try { bindNet(g.net); } catch { /* the netReady hook binds it */ } }
  offs.push(mods.on('facilityWillChange',(w,gg)=>{if(gg!==g)return;for(const id of host.jams.keys()){const door=g.doorById?.(id);if(door){door.locked=false;door.jam=0;}}host.jams.clear();for(const id of [...jams.keys()]){const j=jams.get(id);if(j?.door)j.door.locked=false;endJam(id,false);}}));
  offs.push(mods.on('mapLoaded', (world, gg) => {
    if (gg !== g) return;
    resetAll();
    S.snapAsked = 0;
    if (!g.isHost) later(() => { if (netRef?.connected) netRef.request('g11sync', {}); }, 1800);
  }));
  offs.push(mods.on('update', (dt, gg) => {
    if (gg !== g || disposed) return;
    T += dt;
    if (g.isHost && netRef) safe('hostJam', hostJamTick);
    safe('jams', jamsView, dt);
    safe('trail', trailView, dt);
    safe('zip', zipView);
    safe('ride', rideUpdate, dt);
    safe('drone', droneUpdate, dt);
    safe('rdrones', remoteDronesView, dt);
    safe('pings', pingsView);
    safe('speakers', speakersView, dt);
    safe('hint', hintView, dt);
  }));

  // ================================================================================================== debug
  const fwdPos = () => { const p = g.player, f = p.forward(); f.y = 0; f.normalize(); return p.pos.clone().addScaledVector(f, 1.2).add(new V3(0, 0.6, 0)); };
  const api = {
    speakerDeploy, speakerPulse,
    get state() { return { jams: jams.size, dots: dots.length, zip: zip.on, pilot: !!S.pilot, ride: !!S.ride, pings: pings.length, speakers: speakers.length, remoteDrones: remoteDrones.size, trailLeft: Math.max(0, +(S.trailUntil - T).toFixed(1)) }; },
    debug: {
      /** kefal.game.gear11.debug.give() - spawns all five gadgets + a decoy speaker in front of you (host) */
      give(types = [...C.ITEM_IDS, 'decoyspeaker']) { if (!g.isHost) return 'host only'; for (const ty of types) g.items.hostSpawn(ty, fwdPos().add(new V3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8)), {}); return types; },
      jamNearest() { const d = C.pickDoor(g.world?.facility?.doors, g.player.pos, g.player.forward(), 8) || (g.world?.facility?.doors || []).find((x) => C.canJam(x)); if (!d || !g.isHost) return null; host.jams.set(d.id, { end: T + C.JAM.sec, by: me() }); d.locked = true; netRef.broadcast('door', { id: d.id, open: false, locked: true, silent: true }); netRef.broadcast('g11st', { k: 'jam', id: d.id, sec: C.JAM.sec, by: me() }); return d.id; },
      /** visual + voice only (5 pulses here); the real path is throwing a 'decoyspeaker' item (grenades zone + creature noise) */
      speaker() { const p = fwdPos(); speakerDeploy(p, 12); for (let i = 0; i < 5; i++) later(() => speakerPulse(p, me()), 600 + i * 2400); return P3(p); },
      trailOn() { host.active.set(me(), T + C.TRAIL.sec); netRef.broadcast('g11st', { k: 'tr', by: me(), sec: C.TRAIL.sec }); return 'trail on'; },
      zip() { if (!g.isHost) return 'host only'; const p = g.player, f = p.forward(); const eye = p.eyePos(); const h = g.physics.raycast(eye, f, 18, G.STATIC, p.col); if (!h) return 'aim at a wall'; const n = h.normal; const b = eye.clone().addScaledVector(f, h.distance).addScaledVector(new V3(n.x, n.y, n.z), 0.08); const a = fwdPos(); a.y = p.pos.y + C.ZIP.postH; host.zip = { a: P3(a), b: P3(b), n: P3(n), by: me() }; netRef.broadcast('g11st', { k: 'zip', ...host.zip }); return host.zip; },
      drone() { const it = [...g.items.all()].find((x) => x.type === 'scoutdrone' && x.holder === me()); if (!it) return 'hold a scoutdrone (debug.give())'; startDrone(it); return 'piloting'; },
      ping() { const p = g.player; netRef.broadcast('g11st', { k: 'ping', by: me(), o: P3(p.eyePos()), l: [['i', p.pos.x + 3, p.pos.y + 1, p.pos.z], ['c', p.pos.x - 3, p.pos.y + 1, p.pos.z + 2]] }); return 'pinged'; },
    },
    dispose() {
      disposed = true;
      resetAll();
      for (const id of [...remoteDrones.keys()]) removeRemoteDrone(id);
      for (const s of speakers) { scene.remove(s.mesh); s.mesh.userData.dispose?.(); }
      speakers.length = 0;
      if (trailMesh) { scene.remove(trailMesh); trailMesh.userData.dispose?.(); trailMesh = null; }
      bubbleTex?.dispose?.(); bubbleTex = null;
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      for (const u of undo) { try { u(); } catch { /* ignore */ } }
      for (const id of timers) clearTimeout(id);
      for (const el of [hintEl, chipEl, camEl]) el?.remove();
      hintEl = chipEl = camEl = null;
    },
  };
  return api;
}
