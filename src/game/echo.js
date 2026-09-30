// ECHO MODE (wave 1, "fun" module): death is not the end. A dead player keeps spectating but gets a limited pool of
// ECHO energy to haunt the living and help them:
//   1 Flicker Lights  - the lights around your crewmate (or the nearest living one) flicker for a few seconds
//   2 Knock           - a 3D knock where you look (lures creatures only when it is far from every living player)
//   3 Whisper         - a whisper from where you look
//   4 Reveal          - the creature closest to your crew gets a ghostly marker for 6 s (visible through walls)
//   5 Toggle Door     - open / close the unlocked door you look at
// Inputs (all free while dead): E = use the selected ability · 1-5 / mouse wheel / RMB = choose. LMB / Space keep cycling the
// spectated crewmate (actions.js updateSpectator) - no clash.
// Host-authoritative: energy, cooldowns, ghost check, target validation and every effect are decided on the host, which
// broadcasts the cue ('echo' host-only message); requests: net.request('echo', { op, p:[x,y,z], tid, did }).
import * as THREE from 'three';
import { G } from '../physics/physics.js';
import { HOST_ONLY } from '../net/session.js';
import { hudDock } from '../ui/dock.js';
import { fx } from './funfx.js';
import { ensureWardrobeProfile } from './cosmetics.js';
import { sysMsg, tf } from '../core/i18n.js';   // [i18n8]

HOST_ONLY.add('echo');

export const ABILITIES = [
  { id: 'flicker', name: 'Flicker Lights', cost: 30, cd: 6, icon: '💡' },
  { id: 'knock', name: 'Knock', cost: 12, cd: 2.5, icon: '✊' },
  { id: 'whisper', name: 'Whisper', cost: 18, cd: 4, icon: '🗣' },
  { id: 'reveal', name: 'Reveal', cost: 35, cd: 14, icon: '👁' },
  { id: 'door', name: 'Toggle Door', cost: 20, cd: 3, icon: '🚪' },
];
const MAX = 100, REGEN = 3.2;
const FLICKER_R = 14, FLICKER_DUR = 3.2, REVEAL_DUR = 6;
const NEAR_LIVING = 45;            // a knock / whisper / door must be within this of a living player
const LURE_MIN = 14;               // knocks only attract creatures when at least this far from every living player
const _v = new THREE.Vector3(), _d = new THREE.Vector3();

let ghostTex = null;
function revealSprite() {
  if (!ghostTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.strokeStyle = '#7fe9ff'; x.fillStyle = '#7fe9ff'; x.lineWidth = 3; x.shadowColor = '#7fe9ff'; x.shadowBlur = 6;
    x.beginPath(); x.arc(32, 32, 26, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.ellipse(32, 32, 14, 8, 0, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(32, 32, 5, 0, Math.PI * 2); x.fill();
    ghostTex = new THREE.CanvasTexture(c); ghostTex.magFilter = ghostTex.minFilter = THREE.NearestFilter; ghostTex.generateMipmaps = false;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ghostTex, transparent: true, depthTest: false, depthWrite: false, fog: false, opacity: 0.85 }));
  s.renderOrder = 999; s.scale.set(1.3, 1.3, 1);
  return s;
}

export function installEcho(game) {
  const E = {
    active: false, energy: MAX, cd: ABILITIES.map(() => 0), sel: 0,
    flick: new Map(), flickUntil: 0, marks: [],
    // host
    pool: new Map(),        // pid -> { e, t, cd:[] }
  };
  let disposed = false, boundNet = null, hintShown = false, dockT = 0;
  const offs = [];
  const dock = hudDock('bottom', 'fun-echo', 20);
  dock.style.cssText = 'display:none;font-family:VT323,monospace;color:#bff4ff;text-shadow:0 0 6px #000;background:rgba(4,12,18,.72);border:1px solid rgba(127,233,255,.45);padding:5px 10px;min-width:520px';
  dock.innerHTML = `<div class="ec-head" style="display:flex;justify-content:space-between;font-size:22px;letter-spacing:1px"><span>👻 ECHO</span><span class="ec-tip" style="opacity:.8;font-size:18px">[E] use · [1-5] / wheel / RMB choose</span></div>
    <div style="height:9px;background:rgba(255,255,255,.1);border:1px solid rgba(127,233,255,.4);margin:3px 0 5px"><div class="ec-fill" style="height:100%;width:100%;background:linear-gradient(90deg,#3fbfe0,#bff4ff);box-shadow:0 0 8px #7fe9ff"></div></div>
    <div class="ec-row" style="display:flex;gap:6px"></div>`;
  const rowEl = dock.querySelector('.ec-row'), fillEl = dock.querySelector('.ec-fill');
  const slotEls = ABILITIES.map((a, i) => {
    const d = document.createElement('div');
    d.style.cssText = 'position:relative;flex:1;border:1px solid rgba(127,233,255,.35);padding:2px 6px;font-size:18px;text-align:center;overflow:hidden;white-space:nowrap';
    d.innerHTML = `<span style="opacity:.7">${i + 1}</span> ${a.icon} ${a.name}<div class="cdv" style="position:absolute;left:0;bottom:0;height:100%;width:0;background:rgba(0,0,0,.6)"></div><div style="font-size:15px;opacity:.7">${a.cost} energy</div>`;
    rowEl.appendChild(d);
    return d;
  });
  const paint = () => {
    fillEl.style.width = Math.max(0, Math.min(1, E.energy / MAX)) * 100 + '%';
    slotEls.forEach((d, i) => {
      const a = ABILITIES[i];
      const cdv = d.querySelector('.cdv');
      cdv.style.width = a.cd > 0 ? Math.min(1, E.cd[i] / a.cd) * 100 + '%' : '0';
      d.style.background = i === E.sel ? 'rgba(127,233,255,.22)' : 'transparent';
      d.style.borderColor = i === E.sel ? '#bff4ff' : 'rgba(127,233,255,.35)';
      d.style.opacity = E.energy >= a.cost ? '1' : '0.5';
    });
  };

  const fac = () => game.world?.facility;

  // ---------------------------------------------------------------- host
  function hostPool(pid) {
    let p = E.pool.get(pid);
    if (!p) { p = { e: MAX, t: game.time, cd: ABILITIES.map(() => 0) }; E.pool.set(pid, p); }
    const dt = Math.max(0, game.time - p.t);
    p.t = game.time;
    p.e = Math.min(MAX, p.e + dt * REGEN);
    for (let i = 0; i < p.cd.length; i++) p.cd[i] = Math.max(0, p.cd[i] - dt);
    return p;
  }
  const sendEnergy = (pid, extra = {}) => { const p = hostPool(pid); game.net.sendTo(pid, 'echo', { k: 'en', e: +p.e.toFixed(1), cd: p.cd.map((x) => +x.toFixed(1)), ...extra }); };
  const deny = (pid, msg) => game.net.sendTo(pid, 'echo', { k: 'deny', msg });
  const living = () => (game.aiPlayers?.() || []).filter((p) => !p.dead);
  const finite3 = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
  const r2 = (n) => +n.toFixed(2);

  function onRequest(d, from) {
    if (!d || !game.isHost) return;
    if (d.op === 'sync') { hostPool(from); sendEnergy(from); return; }
    const idx = ABILITIES.findIndex((a) => a.id === d.op);
    if (idx < 0) return;
    const ab = ABILITIES[idx];
    const me = game.aiPlayerById?.(from);
    if (!me || !me.dead) { deny(from, 'Only the dead can echo.'); return; }
    const ph = game.run?.phase;
    if (ph !== 'moon' && ph !== 'company' && ph !== 'landing') { deny(from, 'Your echo fades in orbit.'); return; }
    const pool = hostPool(from);
    if (pool.cd[idx] > 0) { deny(from, `${ab.name} is recharging.`); return; }
    if (pool.e < ab.cost) { deny(from, 'Not enough echo energy.'); return; }
    const alive = living();
    if (!alive.length) { deny(from, 'Nobody left to haunt.'); return; }
    const nearest = (pos) => alive.reduce((b, p) => (!b || p.pos.distanceToSquared(pos) < b.pos.distanceToSquared(pos) ? p : b), null);
    const focus = alive.find((p) => p.id === d.tid) || nearest(me.pos);
    const name = game.playerName(from);
    let ok = false;
    switch (ab.id) {
      case 'flicker': {
        game.net.broadcast('echo', { k: 'flicker', p: [r2(focus.pos.x), r2(focus.pos.y + 1), r2(focus.pos.z)], by: from });
        game.net.broadcast('sys', sysMsg('👻 {name} flickers the lights near {who}.', { name, who: game.playerName(focus.id) }, 'info'));
        ok = true; break;
      }
      case 'knock':
      case 'whisper': {
        if (!finite3(d.p)) break;
        _v.fromArray(d.p);
        const close = nearest(_v);
        if (!close || close.pos.distanceTo(_v) > NEAR_LIVING) { deny(from, 'Too far from the living.'); return; }
        game.net.broadcast('echo', { k: ab.id, p: [r2(_v.x), r2(_v.y), r2(_v.z)], by: from });
        if (ab.id === 'knock' && alive.every((p) => p.pos.distanceTo(_v) > LURE_MIN)) game.creatures.noise(_v.clone(), 0.5);
        ok = true; break;
      }
      case 'reveal': {
        let best = null, bd = 1e9;
        for (const c of game.creatures.host.values()) {
          if (c.dead || c.type === 'web') continue;
          const dd = c.pos.distanceTo(focus.pos);
          if (dd < bd && dd < 45) { bd = dd; best = c; }
        }
        if (!best) { deny(from, 'No creature near your crew.'); return; }
        game.net.broadcast('echo', { k: 'reveal', cid: best.id, dur: REVEAL_DUR, by: from });
        game.net.broadcast('sys', sysMsg('👻 {name} points out something near {who}...', { name, who: game.playerName(focus.id) }, 'warn'));
        ok = true; break;
      }
      case 'door': {
        const door = game.doorById?.(d.did);
        if (!door || door.kind !== 'door' || door.locked) { deny(from, 'That door will not budge.'); return; }
        const dp = door.pos;
        if (!alive.some((p) => Math.hypot(p.pos.x - dp.x, p.pos.z - dp.z) < 30)) { deny(from, 'Too far from the living.'); return; }
        game.hostSetDoor(door.id, !door.open);
        game.net.broadcast('echo', { k: 'door', p: [r2(dp.x), r2(dp.y + 1.2), r2(dp.z)], by: from });
        ok = true; break;
      }
      default: break;
    }
    if (!ok) return;
    pool.e -= ab.cost; pool.cd[idx] = ab.cd;
    sendEnergy(from, { ok: 1, used: idx });
  }

  // ---------------------------------------------------------------- client
  function applyFlicker(pos, dur) {
    const lp = game.lights;
    if (!lp) return;
    for (const e of lp.emitters) {
      if (!e.pos || e.pos.distanceTo(pos) > FLICKER_R) continue;
      if (!E.flick.has(e)) E.flick.set(e, e.flicker || 0);
      e.flicker = 0.95;
    }
    E.flickUntil = Math.max(E.flickUntil, game.time + dur);
  }
  function restoreFlicker() {
    for (const [e, f] of E.flick) e.flicker = f;
    E.flick.clear();
  }
  function cue(pos, strength = 0.06) {
    const p = game.player;
    if (!p.dead && p.pos.distanceTo(pos) < 22) game.engine?.flash?.(0x7fe9ff, strength);
    game.particles?.burst?.(pos.clone(), { count: 10, color: [0x7fe9ff, 0xbff4ff, 0xffffff], speed: 0.8, up: 1.4, life: 1.1, size: 0.08, gravity: -1.6, drag: 2.2 });
  }
  function onMsg(d) {
    if (!d || disposed) return;
    switch (d.k) {
      case 'en':
        E.energy = d.e; if (Array.isArray(d.cd)) E.cd = d.cd.slice();
        if (d.ok) { const p = ensureWardrobeProfile(game.profile); p.fun.echoUses += 1; game.progress?.save?.(); fx(game.audio, 'fun_echo', { volume: 0.35, pitch: 1.2 }); }
        paint();
        break;
      case 'deny': game.ui?.toast?.(d.msg || 'Not now.', 'bad'); fx(game.audio, 'fun_bad', { volume: 0.4 }); break;
      case 'flicker': {
        const p = _v.fromArray(d.p).clone();
        applyFlicker(p, FLICKER_DUR);
        fx(game.audio, 'fun_echo', { pos: p, volume: 0.8, ref: 4, max: 45 });
        game.audio?.at?.('lights_buzz', p, 0.7, { refDistance: 4, maxDistance: 40 });
        cue(p, 0.08);
        break;
      }
      case 'knock': { const p = _v.fromArray(d.p).clone(); fx(game.audio, 'fun_knock', { pos: p, volume: 1, ref: 3, max: 55 }); cue(p, 0.05); break; }
      case 'whisper': { const p = _v.fromArray(d.p).clone(); game.audio?.at?.(game.audio.variant('whisper'), p, 0.95, { refDistance: 2.5, maxDistance: 40, reverb: 0.9 }); cue(p, 0.05); break; }
      case 'door': { const p = _v.fromArray(d.p).clone(); game.audio?.at?.('door_creak', p, 0.8, { refDistance: 3, maxDistance: 40 }); cue(p, 0.04); break; }
      case 'reveal': {
        const s = revealSprite();
        game.scene.add(s);
        E.marks.push({ cid: d.cid, t: d.dur || REVEAL_DUR, s });
        fx(game.audio, 'fun_echo', { volume: 0.5, pitch: 0.8 });
        if (!game.player.dead) game.ui?.toast?.('👻 An echo marks a creature nearby...', 'info');
        break;
      }
      default: break;
    }
  }

  // what the ghost is aiming at (spectator camera)
  function aimPoint() {
    const cam = game.camera;
    cam.getWorldDirection(_d);
    const hit = game.physics.raycast(cam.position, _d, 40, G.STATIC | G.DOOR);
    const dist = hit ? Math.max(0.5, hit.distance - 0.3) : 22;
    return cam.position.clone().addScaledVector(_d, dist);
  }
  function aimDoor() {
    const cam = game.camera;
    cam.getWorldDirection(_d);
    const hit = game.physics.raycast(cam.position, _d, 40, G.STATIC | G.DOOR);
    return hit?.info?.kind === 'door' ? hit.info.door : null;
  }
  function use(i) {
    const ab = ABILITIES[i];
    if (E.cd[i] > 0) { game.ui?.toast?.(tf('{@name} is recharging.', { name: ab.name }), 'bad'); fx(game.audio, 'fun_bad', { volume: 0.3 }); return false; }
    if (E.energy < ab.cost) { game.ui?.toast?.('Not enough echo energy.', 'bad'); fx(game.audio, 'fun_bad', { volume: 0.3 }); return false; }
    const req = { op: ab.id, tid: game.spectating || undefined };
    if (ab.id === 'knock' || ab.id === 'whisper') { const p = aimPoint(); req.p = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]; }
    if (ab.id === 'door') {
      const dr = aimDoor();
      if (!dr) { game.ui?.toast?.('Look at a door.', 'info'); return false; }
      req.did = dr.id;
    }
    // predict locally so the bar reacts immediately; the host's 'en' reply (synchronous on the host itself) corrects it
    E.energy = Math.max(0, E.energy - ab.cost); E.cd[i] = ab.cd;
    paint();
    game.net?.request('echo', req);
    return true;
  }

  function update(dt) {
    if (disposed) return;
    dt = Math.min(dt, 0.1);
    if (game.net && game.net !== boundNet) bindNet(game.net);
    const p = game.player, input = game.input;
    const active = !!p.dead && !!game.run && game.run.phase !== 'fired';
    if (active !== E.active) {
      E.active = active;
      dock.style.display = active ? '' : 'none';
      if (active) {
        E.energy = MAX; E.cd = ABILITIES.map(() => 0); E.sel = 0; paint();
        if (!hintShown) { hintShown = true; setTimeout(() => game.ui?.toast?.('👻 ECHO MODE: you can still help! [E] use · [1-5]/wheel/RMB choose ability', 'info'), 2600); }
        game.net?.request('echo', { op: 'sync' });
      }
    }
    // flicker restore
    if (E.flick.size && game.time > E.flickUntil) restoreFlicker();
    // creature markers follow their view
    for (let i = E.marks.length - 1; i >= 0; i--) {
      const m = E.marks[i];
      m.t -= dt;
      const v = game.creatures.views.get(m.cid);
      if (!v || m.t <= 0) { m.s.removeFromParent(); m.s.material.dispose(); E.marks.splice(i, 1); continue; }
      m.s.position.copy(v.pos); m.s.position.y += 1.7 + Math.sin(game.time * 3) * 0.08;
      m.s.material.opacity = 0.55 + 0.3 * Math.sin(game.time * 6) + Math.min(0, m.t - 1) * 0.5;
      const dd = game.camera.position.distanceTo(m.s.position);
      m.s.scale.setScalar(Math.max(0.9, Math.min(3.5, dd * 0.11)));
    }
    if (!E.active) return;
    E.syncT = (E.syncT || 0) - dt;
    if (E.syncT <= 0) { E.syncT = 3; game.net?.request('echo', { op: 'sync' }); }   // keeps the predicted bar honest
    E.energy = Math.min(MAX, E.energy + REGEN * dt);
    for (let i = 0; i < E.cd.length; i++) E.cd[i] = Math.max(0, E.cd[i] - dt);
    dockT -= dt; if (dockT <= 0) { dockT = 0.1; paint(); }
    if (!input.enabled) return;
    for (let i = 0; i < ABILITIES.length; i++) if (input.codePressed('Digit' + (i + 1))) E.sel = i;
    if (input.mouseClicked(2)) E.sel = (E.sel + 1) % ABILITIES.length;
    const w = input.consumeWheel();
    if (w) E.sel = (E.sel + (w > 0 ? 1 : ABILITIES.length - 1)) % ABILITIES.length;
    if (input.pressed('interact')) use(E.sel);
  }

  function bindNet(net) {
    if (!net || net === boundNet) return;
    boundNet = net;
    net.on_('echo', onMsg);
    net.handle('echo', onRequest);
  }
  offs.push(game.mods.on('update', (dt, g) => { if (g === game) update(dt); }));
  offs.push(game.mods.on('netReady', (net, g) => { if (g === game) bindNet(net); }));
  offs.push(game.mods.on('phase', (ph, g) => {
    if (g !== game) return;
    if (ph === 'orbit') { E.pool.clear(); restoreFlicker(); }
  }));
  if (game.net) bindNet(game.net);
  paint();

  return {
    state: E,
    abilities: ABILITIES,
    use,
    select(i) { E.sel = ((i % ABILITIES.length) + ABILITIES.length) % ABILITIES.length; paint(); },
    dispose() {
      disposed = true;
      for (const off of offs) { try { off?.(); } catch { /* ignore */ } }
      restoreFlicker();
      for (const m of E.marks) { m.s.removeFromParent(); m.s.material.dispose(); }
      E.marks.length = 0;
      if (boundNet) {
        if (boundNet.msgHandlers?.get('echo') === onMsg) boundNet.msgHandlers.delete('echo');
        if (boundNet.handlers?.get('echo') === onRequest) boundNet.handlers.delete('echo');
      }
      dock.remove();
    },
  };
}
