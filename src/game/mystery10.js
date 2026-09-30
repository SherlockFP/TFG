// THE FIRST UPLOAD (wave 10, module 'mystery10'; docs/wave10/mystery10.md): a cross-moon mystery. Twelve fragments of what The Algorithm was before it woke up
// (a child's first video, a voicemail, a moderator ticket...) lie on the moons as small glowing floppy disks. 0-1 per landing, deep facility rooms and far outdoor
// spots first. The HOST chooses and spawns (rules: mystery10_core.js, node-tested by tools/harness/mystery10.test.mjs); whoever picks one up shares it: every peer
// writes it into its OWN profile (profile.mystery). Milestones (once per profile): 4 the ship terminal glitches and prints a message (in orbit), 8 a room that should not
// exist stands on the next landing (+ a hat), 12 the ending scene + the title "First Viewer" (in orbit).
// Net (prefix 'myst'): 'mystreq' client -> host {op:'take'|'room', s, id?}, 'mystst' host -> all {k:'plan'|'got', ...} (HOST_ONLY), 'mystfx' host -> one player {k:'reward'|'again'|'gone'},
//   'mystsync' late joiners ask for the plan. Reading: terminal UPLOAD [n], the codex (J) tab "First Upload".
import * as THREE from 'three';
import { HOST_ONLY } from '../net/session.js';
import { saveProfile } from '../core/save.js';
import { G } from '../physics/physics.js';
import { MOONS } from './moons.js';
import * as C from './mystery10_core.js';
import { x, xf } from './mystery10_text.js';
import * as UI from './mystery10_ui.js';
import { createFragmentModel, createRoomModel } from '../models/mystery10_models.js';

HOST_ONLY.add('mystst'); HOST_ONLY.add('mystfx');
const REACH = 6;            // m, host-side distance check for a pickup
const HUM_ON = 22, HUM_OFF = 28;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ procedural sounds (registered through the mod API, rendered on demand)
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const SOUNDS = {
  // 2 s seamless loop: a floppy drive left running, two beating sines and a tick of digital dust
  myst_hum: (sr) => {
    const n = Math.floor(sr * 2), out = new Float32Array(n), r = lcg(31);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const v = Math.sin(TAU * 98 * t) * 0.3 + Math.sin(TAU * 147.5 * t) * 0.18 * (0.6 + 0.4 * Math.sin(TAU * 1 * t)) + Math.sin(TAU * 392 * t) * 0.03;
      out[i] = (v + (r() < 0.0015 ? (r() * 2 - 1) * 0.5 : 0)) * 0.55;
    }
    return out;
  },
  // pickup: a dial-up chirp folding into a soft chord
  myst_pick: (sr) => {
    const n = Math.floor(sr * 1.1), out = new Float32Array(n), r = lcg(7);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, k = t / 1.1;
      const f = t < 0.3 ? 1400 + 900 * Math.sin(TAU * 11 * t) * (r() < 0.5 ? 1 : -1) : 520 + (1 - k) * 100;
      ph += TAU * f / sr;
      const env = Math.min(1, t * 60) * (t < 0.3 ? 0.5 : Math.max(0, 1 - (t - 0.3) / 0.8) * 0.6);
      out[i] = (Math.sin(ph) * 0.6 + (t >= 0.3 ? Math.sin(ph * 1.5) * 0.25 + Math.sin(ph * 2) * 0.1 : (r() * 2 - 1) * 0.2)) * env;
    }
    return out;
  },
  // terminal glitch: gated static, stutter and a falling carrier
  myst_glitch: (sr) => {
    const n = Math.floor(sr * 1.4), out = new Float32Array(n), r = lcg(99);
    let hold = 0, held = 0, gate = 1;
    for (let i = 0; i < n; i++) {
      const t = i / sr, k = i / n;
      if (i % Math.floor(sr * 0.05) === 0) gate = r() < 0.65 ? 1 : 0.1;
      if (hold-- <= 0) { held = r() * 2 - 1; hold = 3 + Math.floor(r() * 30 * (1 - k)); }
      const carrier = Math.sin(TAU * (700 - 520 * k) * t) * 0.3;
      out[i] = Math.max(-1, Math.min(1, (held * 0.5 + carrier) * gate * Math.min(1, t * 40) * (1 - k * 0.6)));
    }
    return out;
  },
};

export function installMystery10(game) {
  const mods = game.mods;
  if (!mods) return null;
  const offs = [], timers = [];
  const cols = [];
  let map = null, time = 0, disposed = false, lastNet = null, syncAsked = 0, syncT = 0, plannedAt = -1;
  let state = null;                 // { key, s, frag: spec|null, room: spec|null }
  let frag = null;                  // { spec, model, gone, pos }
  let room = null;                  // { spec, model, cols, by:Set, pos, seen }
  const hums = new Map();           // id -> { h, pos }
  let readerEl = null;
  const _v = new THREE.Vector3();
  const profile = () => game.profile;
  const say = (s, kind = 'info') => { try { game.ui?.toast?.(s, kind); } catch { /* ui optional */ } };
  const later = (fn, ms) => { const id = setTimeout(() => { const i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1); if (!disposed) fn(); }, ms); timers.push(id); return id; };
  const save = () => { try { game.progress?.save?.() ?? saveProfile(game.profile); } catch { /* storage may be unavailable */ } };
  const posOf = (from) => (from === game.selfId ? game.player?.pos : game.remotes?.get(from)?.pos);
  const nameOf = (id) => { try { return game.playerName(id); } catch { return 'Someone'; } };
  const snd = (name, opts = {}) => { try { return mods.api?.playSound?.(name, opts) || null; } catch { return null; } };
  const runKey = () => String(game.run?.runId ?? 'legacy');

  // ---- sounds
  const soundNames = [];
  if (mods.api?.registerSound) for (const [name, gen] of Object.entries(SOUNDS)) { try { mods.api.registerSound(name, gen); soundNames.push(name); } catch { /* optional */ } }

  // ------------------------------------------------------------------ map build / clear
  function clearFrag() {
    if (!frag) return;
    try { frag.model.root.parent?.remove(frag.model.root); frag.model.dispose(); } catch { /* ignore */ }
    stopHum('frag'); frag = null;
  }
  function clearRoom() {
    if (!room) return;
    try { room.model.root.parent?.remove(room.model.root); room.model.dispose(); } catch { /* ignore */ }
    for (const c of room.cols) { try { game.physics.removeCollider(c); } catch { /* gone with the world */ } }
    stopHum('room'); room = null;
  }
  function clear() { clearFrag(); clearRoom(); for (const k of [...hums.keys()]) stopHum(k); map = null; state = null; syncAsked = 0; plannedAt = -1; }
  function onMapLoaded(world) {
    clear();
    if (disposed || !world?.outdoor || !world.moonId || world.company || !MOONS[world.moonId]) return;
    map = { key: `${runKey()}|${world.moonId}|${world.seed | 0}`, seed: world.seed | 0, moonId: world.moonId, outdoor: world.outdoor, world, t0: time, planned: false };
  }
  function outdoorSampler(world) {
    const terrain = world.outdoor.terrain;
    if (!terrain || typeof terrain.heightAt !== 'function') return null;
    const sc = terrain.scale || 1, avoid = world.outdoor.avoid || (() => false);
    return (rng, r = 1.2) => {
      const px = rng.float(-112, 112) * sc, pz = rng.float(-112, 112) * sc;
      if (avoid(px, pz, r + 3) || (terrain.distToPath && terrain.distToPath(px, pz) < r + 3)) return null;
      if (terrain.lavaDepthAt && terrain.lavaDepthAt(px, pz) > -0.6) return null;
      if (terrain.lakes?.length && terrain.onIce?.(px, pz)) return null;
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < 9; k++) {
        const a = (k / 8) * TAU, rr = k ? r : 0, y = terrain.heightAt(px + Math.cos(a) * rr, pz + Math.sin(a) * rr);
        if (y < lo) lo = y; if (y > hi) hi = y;
      }
      if (hi - lo > (r > 3 ? 0.4 : 1.0)) return null;
      return { x: px, y: r > 3 ? hi : terrain.heightAt(px, pz), z: pz };
    };
  }

  // ------------------------------------------------------------------ build what the host announced
  function buildFrag(spec, gone) {
    clearFrag();
    if (!map || !spec || gone) return;
    const parent = spec.where === 'in' ? map.world.facility?.group : map.world.outdoor?.group;
    if (!parent) return;
    const model = createFragmentModel();
    model.root.position.set(spec.x, spec.y, spec.z);
    model.root.rotation.y = spec.yaw || 0;
    parent.add(model.root);
    frag = { spec, model, gone: false, pos: new THREE.Vector3(spec.x, spec.y + model.anchor, spec.z) };
  }
  function buildRoom(spec) {
    clearRoom();
    if (!map || !spec) return;
    const parent = map.world.outdoor?.group;
    if (!parent) return;
    const model = createRoomModel();
    model.root.position.set(spec.x, spec.y, spec.z);
    model.root.rotation.y = spec.yaw || 0;
    parent.add(model.root);
    const cs = Math.cos(spec.yaw || 0), sn = Math.sin(spec.yaw || 0), rc = [];
    for (const b of model.boxes) {
      const wx = spec.x + b.x * cs + b.z * sn, wz = spec.z - b.x * sn + b.z * cs;
      try { rc.push(game.physics.addStaticBox(wx, spec.y + b.y, wz, b.hx, b.hy, b.hz, spec.yaw || 0, G.STATIC, { kind: 'myst_room' })); } catch (e) { console.warn('[mystery10] collider', e); }
    }
    const [dx, dy, dz] = model.desk;
    room = { spec, model, cols: rc, by: new Set(), seen: false, pos: new THREE.Vector3(spec.x + dx * cs + dz * sn, spec.y + dy, spec.z - dx * sn + dz * cs) };
  }
  function applyState(d) {
    if (!map || !d || d.key !== map.key) return;
    state = d;
    map.planned = true;
    buildFrag(d.frag, d.gone);
    buildRoom(d.room);
  }

  // ------------------------------------------------------------------ HOST: plan a landing
  function hostPlan() {
    const p = profile(), run = game.run, world = map.world;
    if (!p || !run) return;
    const my = (run.myst = run.myst && typeof run.myst === 'object' ? run.myst : { plans: {} });
    my.plans = my.plans || {};
    let plan = my.plans[map.key];
    if (!plan) {
      const eggs = (() => { try { return game.eggs?.list?.() || []; } catch { return []; } })();
      const fac = world.facility?.group && Array.isArray(world.facility.scrapSpots) ? world.facility.scrapSpots : null;
      const outdoor = (() => { try { return outdoorSampler(world); } catch { return null; } })();
      try {
        plan = C.planLanding({ runId: runKey(), moonId: map.moonId, seed: map.seed, collected: C.collectedSet(p), dry: C.ensure(p).dry, room: C.roomDue(p), outdoor, facility: fac, avoid: eggs.map((e) => ({ x: e.x, z: e.z, r: 6 })) });
      } catch (e) { console.warn('[mystery10] plan', e); plan = { frag: null, room: null }; }
      my.plans[map.key] = plan;
      const keys = Object.keys(my.plans); for (const k of keys.slice(0, Math.max(0, keys.length - 8))) delete my.plans[k];
      C.bumpDry(p, !!plan.frag); save();
    }
    const m = C.ensure(p);
    const out = { key: map.key, s: map.seed, frag: plan.frag && !C.has(p, plan.frag.id) ? plan.frag : null, room: plan.room && !m.roomDone ? plan.room : null };
    map.planned = true;
    game.net.broadcast('mystst', { k: 'plan', ...out });
  }

  // ------------------------------------------------------------------ HOST: requests
  function hostReq(d, from) {
    if (!game.isHost || !map || !state || d.s !== map.seed || game.run?.phase !== 'moon') return;
    const net = game.net, pp = posOf(from);
    if (!pp) return;
    if (d.op === 'take') {
      if (!frag) { if (state.gone) net.sendTo(from, 'mystfx', { k: 'gone', s: map.seed }); return; }
      if (frag.gone) { net.sendTo(from, 'mystfx', { k: 'gone', s: map.seed }); return; }
      const sp = frag.spec;
      if (Math.hypot(pp.x - sp.x, pp.z - sp.z) > REACH || Math.abs(pp.y - sp.y) > 4) return;
      frag.gone = true; state.gone = true;
      net.broadcast('mystst', { k: 'got', s: map.seed, key: map.key, id: sp.id, by: from, name: nameOf(from) });
      net.broadcast('xp', { to: from, xp: 20 + (game.run?.quotaIndex | 0) * 3, coin: 4, reason: x('pick.xp') });
      net.broadcast('fx', { k: 'snd', s: 'ui_confirm', p: [sp.x, sp.y + 0.5, sp.z], v: 0.5, r: 8, m: 60 });
    } else if (d.op === 'room') {
      if (!room) return;
      if (Math.hypot(pp.x - room.pos.x, pp.z - room.pos.z) > 5 || Math.abs(pp.y - room.pos.y) > 3.5) return;
      const first = !room.by.has(from);
      room.by.add(from);
      const p = profile(), m = C.ensure(p);
      if (first && !m.roomDone) { m.roomDone = 1; save(); }   // the room stops standing on future landings once anyone has been inside
      net.sendTo(from, 'mystfx', { k: first ? 'reward' : 'again', s: map.seed });
    }
  }

  // ------------------------------------------------------------------ CLIENT: results
  function openReader(id, fresh = false) {
    const ui = game.ui;
    if (!ui?.openPanel) return;
    const p = profile();
    try { readerEl?._stop?.(); } catch { /* ignore */ }
    C.markSeen(p, id);
    readerEl = UI.createReader({ id, profile: p, fresh, onClose: () => ui.closePanel(), onGo: (nid) => openReader(nid, false) });
    game.terminal?.close?.();
    ui.openPanel(readerEl);
    game.sfx?.('terminal_enter', 0.4);
  }
  function onGot(d) {
    if (!d?.id || !C.BY_ID[d.id]) return;
    if (frag && frag.spec.id === d.id) { frag.gone = true; clearFrag(); }
    if (state && d.key === state.key) state.gone = true;
    const p = profile();
    const r = C.collect(p, d.id);
    if (r.isNew) save();
    const mine = d.by === game.selfId;
    if (mine) {
      snd('myst_pick', { volume: 0.7 });
      if (r.isNew) say(xf('pick.toast', { n: r.count }), 'good'); else say(x('pick.dup'), 'info');
      openReader(d.id, true);
    } else if (r.isNew) {
      say(xf('pick.crew', { name: d.name || 'Someone', n: r.count }), 'info');
      game.sfx?.('ui_notify', 0.4);
    }
    if (r.reached.includes(8)) later(() => say(x('m8.toast'), 'warn'), mine ? 7000 : 2500);
        mods.emit('tfg:mystery', { k: 'got', id: d.id, n: r.count, by: d.by }, game);
  }
  function onFx(d) {
    if (!d || !map || d.s !== map.seed) return;
    if (d.k === 'gone') { say(x('pick.gone'), 'warn'); return; }
    if (d.k === 'reward' || d.k === 'again') {
      const p = profile();
      game.ui?.hud?.bigText?.(x('room.spot'), x('room.tv'));
      game.sfx?.('ui_levelup', 0.5);
      if (d.k === 'again' || (p && game.cosm5?.owns?.(C.HAT_KEY))) { say(x('room.have'), 'info'); return; }
      try { game.cosm5?.reward?.(C.HAT_KEY); } catch (e) { console.warn('[mystery10] cosm', e); }
      later(() => say(x('room.reward'), 'good'), 2500);
    }
  }

  // ------------------------------------------------------------------ orbit: the queued milestone effects (4: terminal glitch, e: the ending)
  function glitchTerminal() {
    const term = game.terminal;
    snd('myst_glitch', { volume: 0.8 });
    try { game.engine?.shake?.(0.35); } catch { /* ignore */ }
    say(x('m4.toast'), 'warn');
    const lines = ['', x('m4.glitch'), '', ...x('m4.msg').split('\n')];
    if (!term) return;
    const el = term.el;
    if (!term.active) { for (const l of lines) term.print(l, 'myst'); return; }
    UI.jitterTerminal(el);
    // the terminal is open: the message writes itself over a few scrambled frames
    const G0 = '#%&@?/\\<>=+*ÖÇ01';
    let li = 0;
    const one = () => {
      if (disposed || li >= lines.length) return;
      const real = lines[li++], ent = { text: '', cls: 'myst' };
      term.lines.push(ent);
      let k = 0;
      const tick = () => {
        if (disposed) return;
        k = Math.min(real.length, k + 2);
        ent.text = real.slice(0, k) + (k < real.length ? G0[(Math.random() * G0.length) | 0] : '');
        term.render();
        if (k < real.length) later(tick, 28); else later(one, real ? 160 : 60);
      };
      tick();
    };
    one();
    later(() => term.game?.shipScreens?.markTerminalDirty?.(), 300);
  }
  function fireOrbit(force = false) {
    if (disposed || (!force && game.run?.phase !== 'orbit')) return;
    const p = profile();
    if (C.hasPending(p, '4')) {
      C.takePending(p, '4'); save();
      glitchTerminal();
      if (C.hasPending(p, 'e')) later(() => fireOrbit(force), 16000);
      return;
    }
    if (C.hasPending(p, 'e')) {
      C.takePending(p, 'e'); save();
      const sc = UI.playEnding({
        sfx: (k) => { if (k === 'term') game.sfx?.('terminal_enter', 0.5); else snd('myst_pick', { volume: 0.5 }); },
        onTitle: () => {
          const pr = profile(); if (!pr) return;
          if (!Array.isArray(pr.titles)) pr.titles = [];
          const ttl = C.TITLE;
          if (!pr.titles.includes(ttl)) pr.titles.push(ttl);
          if (!pr.title) pr.title = ttl;
          save();
          say(xf('end.title.unlock', { t: x('end.title') }), 'good');
          game.sfx?.('level_up_jingle', 0.6);
        },
      });
      sc.done.then(() => { try { game.terminal?.print(x('end.after'), 'myst'); say(x('end.done'), 'info'); } catch { /* ignore */ } });
    }
  }
  offs.push(mods.on('phase', (ph, g) => {
    if (g !== game || disposed) return;
    if (ph === 'orbit') later(fireOrbit, 5000);
  }));
  if (game.run?.phase === 'orbit') later(fireOrbit, 6000);

  // ------------------------------------------------------------------ net
  function bindNet(net) {
    lastNet = net;
    net.on_('mystst', (d) => { if (d?.k === 'plan') applyState(d); else if (d?.k === 'got') onGot(d); });
    net.on_('mystfx', (d) => onFx(d));
    net.handle('mystreq', (d, from) => hostReq(d, from));
    net.handle('mystsync', (d, from) => {
      if (!game.isHost || !map || !state || d.s !== map.seed) return;
      net.sendTo(from, 'mystst', { k: 'plan', key: state.key, s: state.s, frag: state.frag, room: state.room, gone: !!state.gone });
    });
  }
  offs.push(mods.on('netReady', (net) => bindNet(net)));
  if (game.net && game.net !== lastNet) { try { bindNet(game.net); } catch { /* the netReady hook binds it */ } }
  offs.push(mods.on('mapLoaded', (world, g) => { if (g === game) onMapLoaded(world); }));

  // the host keeps `state` too (its own broadcast comes back through applyState)
  const request = (op, extra = {}) => game.net.request('mystreq', { op, s: map.seed, ...extra });

  // ------------------------------------------------------------------ interaction
  offs.push(mods.on('interactables', (list, g) => {
    if (g !== game || !map) return;
    const p = game.player;
    if (!p || p.dead) return;
    if (frag && !frag.gone && (frag.spec.where === 'in') === !!p.indoor) {
      const dx = p.pos.x - frag.spec.x, dz = p.pos.z - frag.spec.z;
      if (dx * dx + dz * dz < 36 && Math.abs(p.pos.y - frag.spec.y) < 4) list.push({ pos: frag.pos, r: 0.9, reach: 2.8, label: x('pick.label'), sub: '', action: () => request('take') });
    }
    if (room && !p.indoor) {
      const dx = p.pos.x - room.pos.x, dz = p.pos.z - room.pos.z;
      if (dx * dx + dz * dz < 25 && Math.abs(p.pos.y - room.pos.y) < 3.5) {
        const have = !!game.cosm5?.owns?.(C.HAT_KEY);
        list.push({ pos: room.pos, r: 1.0, reach: 2.6, label: have ? x('room.label.done') : x('room.label'), sub: '', action: () => request('room') });
      }
    }
  }));

  // ------------------------------------------------------------------ hum (positional loops, only near) + per-frame
  function startHum(id, pos, pitch, vol) {
    if (hums.has(id)) return;
    const h = snd('myst_hum', { pos, loop: true, volume: vol, pitch, refDistance: 1.6, maxDistance: 26, rolloff: 1.5, occlude: true, reverb: 0.3 });
    hums.set(id, { h, pos });
  }
  function stopHum(id) { const e = hums.get(id); if (!e) return; try { e.h?.stop?.(0.3); } catch { /* ignore */ } hums.delete(id); }
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed || !map) return;
    if (game.world?.outdoor !== map.outdoor || !game.world?.moonId) { clear(); return; }
    time += dt;
    const p = game.player, phase = game.run?.phase;
    // host: plan once the map has settled (eggs / soul placed their things first)
    if (game.isHost && !map.planned && phase === 'moon' && time - map.t0 > 1.5 && game.net) { try { hostPlan(); } catch (e) { console.warn('[mystery10] hostPlan', e); map.planned = true; } }
    // client: ask for the plan (retry a few times)
    if (!game.isHost && !map.planned && game.net?.connected && phase === 'moon' && syncAsked < 6 && time - syncT > 3) { syncT = time; syncAsked++; game.net.request('mystsync', { s: map.seed }); }
    if (!p) return;
    const px = p.pos.x, pz = p.pos.z;
    if (frag && !frag.gone) {
      const dx = px - frag.spec.x, dz = pz - frag.spec.z, d2 = dx * dx + dz * dz;
      if (d2 < 3600) frag.model.tick(dt, time);
      if (d2 < HUM_ON * HUM_ON) startHum('frag', frag.pos, 1, 0.5); else if (d2 > HUM_OFF * HUM_OFF) stopHum('frag');
    }
    if (room) {
      const dx = px - room.pos.x, dz = pz - room.pos.z, d2 = dx * dx + dz * dz;
      room.model.tick(dt, time, { near: d2 < 22 * 22 });
      if (d2 < HUM_ON * HUM_ON) startHum('room', room.pos, 0.72, 0.42); else if (d2 > HUM_OFF * HUM_OFF) stopHum('room');
      if (!room.seen && d2 < 38 * 38) { room.seen = true; game.ui?.hud?.bigText?.(x('room.spot'), ''); game.sfx?.('ui_notify', 0.5); }
    }
  }));

  // ------------------------------------------------------------------ terminal + codex
  const cmdNames = [];
  if (mods.api?.registerCommand) {
    mods.api.registerCommand('upload', (rest, term) => term.print(UI.terminalText(profile(), rest?.[0]), 'myst'), x('term.help'));
    cmdNames.push('upload');
  }
  const codex = {
    id: 'myst',
    label: (p) => `${x('ui.tab')} ${C.count(p)}/${C.TOTAL}`,
    render(body, p) {
      const box = document.createElement('div');   // the tab owns this box only: the codex header + chips above it stay
      body.appendChild(box);
      const show = (el) => { box.replaceChildren(); box.appendChild(el); };
      const open = (id) => { C.markSeen(p, id); show(UI.createReader({ id, profile: p, onClose: draw, onGo: open })); };
      function draw() { box.replaceChildren(); UI.renderIndex(box, p, { onOpen: open }); }
      draw();
    },
  };
  if (typeof window !== 'undefined') { (window.__tfgCodexExt = window.__tfgCodexExt || []).push(codex); }

  // ------------------------------------------------------------------ the API (also for the lead's console tests)
  const api = {
    core: C,
    state: () => state,
    count: () => C.count(profile()),
    list: () => (frag ? [{ id: frag.spec.id, where: frag.spec.where, x: frag.spec.x, y: frag.spec.y, z: frag.spec.z, gone: frag.gone }] : []),
    open: (id) => openReader(id, false),
    /** host: give the whole crew fragment `id` right now (as if picked up by the host) */
    grant(id) { if (game.isHost && C.BY_ID[id]) game.net.broadcast('mystst', { k: 'got', s: map?.seed | 0, key: map?.key || '', id, by: game.selfId, name: nameOf(game.selfId) }); },
    /** host, on a moon: put fragment `id` (and the room when `withRoom`) in front of the player. */
    spawnHere(id = 'f01', withRoom = false) {
      if (!game.isHost || !map || !game.player) return null;
      const pp = game.player.pos, yaw = game.player.yaw || 0, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const heightAt = map.outdoor?.terrain?.heightAt;
      const at = (d) => { const px = pp.x + fx * d, pz = pp.z + fz * d; return { x: px, z: pz, y: heightAt ? heightAt(px, pz) : pp.y - 1.5 }; };
      const f = at(3), r = at(12);
      const out = { key: map.key, s: map.seed, frag: { id, where: game.player.indoor ? 'in' : 'out', x: f.x, y: game.player.indoor ? pp.y - 1.3 : f.y, z: f.z, yaw: 0 }, room: withRoom ? { x: r.x, y: r.y + 0.05, z: r.z, yaw: Math.round((yaw + Math.PI) / (Math.PI / 2)) * (Math.PI / 2) } : null };
      game.net.broadcast('mystst', { k: 'plan', ...out });
      return out;
    },
    /** run a queued orbit effect now (also away from orbit, for testing): fire('4') the terminal glitch, fire('e') the ending scene */
    fire(k = '4') { const m = C.ensure(profile()); m.pend[k === 'e' ? 'e' : '4'] = 1; fireOrbit(true); },
    reset() { const p = profile(); if (p) { delete p.mystery; C.ensure(p); save(); } },
    hostPlan, hostReq, onMapLoaded, glitchTerminal,
    dispose() {
      disposed = true;
      clear();
      for (const t of timers.splice(0)) clearTimeout(t);
      for (const off of offs.splice(0)) { try { off?.(); } catch { /* ignore */ } }
      try { readerEl?._stop?.(); } catch { /* ignore */ }
      for (const n of cmdNames) { try { mods.commands?.delete(n); } catch { /* ignore */ } }
      for (const n of soundNames) { try { mods.soundGens?.delete(n); } catch { /* ignore */ } }
      if (typeof window !== 'undefined' && window.__tfgCodexExt) window.__tfgCodexExt = window.__tfgCodexExt.filter((e) => e !== codex);
    },
  };
  return api;
}
