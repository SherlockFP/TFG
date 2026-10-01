// COOP 12 (wave 12, module 'coop12'; docs/wave12/coop12.md): mechanics that make friends work TOGETHER (R.E.P.O. energy). Extends carry2's helper grip, downed's revive, pings.
//   1. TEAM LIFT    four GIANT loot props (carry2 `bulky` + `giant`): solo = drag (x0.18), pair = speed by SYNC (same direction / same speed), shared bar, wobble when they fight it, falls damage it
//   2. HEAVY DOORS  a cracked vault door needs a lever held (E) while the others pass; nobody holding = 1 s alarm, then it slams. Creatures never open vault doors. Solo crews are never locked out
//   3. BUDDY BOND   40 s within 8 m -> BUDDY: revive x0.65, shared stamina regen, gold pings, tag over the buddy. Decays over ~1 min apart, never punishes
//   4. HIGH-FIVE    both hold E facing each other within 2.8 m: spark + sound + tiny morale (stamina + regen 45 s) + a nudge to the bond
// Net (prefix 'c12'): 'c12q' client -> host {op:'door'|'hf', ...}; 'c12fx' host -> all (HOST_ONLY) {k:'bond'|'hand'|'hf'|'warn'|'slam'|'first'|'smash', ...}.
import * as THREE from 'three';
import { t, tf, addTranslations } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { SCRAP_TABLE, registerItem } from './items.js';
import { MOONS } from './moons.js';
import { hudDock } from '../ui/dock.js';
import * as C from './coop12_core.js';
import { GIANT_MODELS, makeLever, makeBuddySprite } from './coop12_models.js';
import { TR, RU } from './coop12_text.js';

HOST_ONLY.add('c12fx');
addTranslations(TR, 'tr'); addTranslations(RU, 'ru');

const CSS = `.c12-box{background:#12130d;border:2px solid #ffcf4a;color:#ffe9d0;font:700 14px/1.2 var(--font2,'Arial Narrow',sans-serif);letter-spacing:.06em;text-transform:uppercase;padding:4px 12px;display:flex;flex-direction:column;gap:3px;align-items:center;min-width:250px;box-shadow:0 0 0 2px #12130d}
.c12-box i{font:600 12px/1.2 var(--font2,'Arial Narrow',sans-serif);letter-spacing:.03em;text-transform:none;color:#d8c9b4;font-style:normal;text-align:center;max-width:320px}
.c12-box u{display:block;position:relative;height:7px;width:100%;background:#2a2410;text-decoration:none}.c12-box u b{display:block;height:100%;background:#59e88a}
.c12-box u s{position:absolute;top:-2px;bottom:-2px;width:2px;background:#ffe9d0;text-decoration:none}
.c12-box.bad{border-color:#ff4a3a}.c12-box.bad u b{background:#ff4a3a}.c12-box.mid u b{background:#ffb640}
.c12-h{display:flex;justify-content:space-between;width:100%;gap:14px}
.c12-chip{background:#12130d;border:2px solid #ffcf4a;color:#ffe9d0;font:700 13px/1.1 var(--font2,'Arial Narrow',sans-serif);letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;display:flex;flex-direction:column;gap:2px}
.c12-chip em{font-style:normal;color:#ffcf4a}.c12-chip i{font:600 11px/1.1 var(--font2,'Arial Narrow',sans-serif);text-transform:none;letter-spacing:.02em;color:#d8c9b4;font-style:normal}
.kp-mk.c12-bp{filter:drop-shadow(0 0 5px #ffcf4a)}.kp-mk.c12-bp .kp-l::before{content:'\\25C6 ';color:#ffcf4a}
.c12-pop{position:fixed;left:50%;top:52%;transform:translateX(-50%);pointer-events:none;z-index:45;font-family:var(--cond,"Barlow Condensed","Arial Narrow",sans-serif);font-size:30px;color:#ff6a5a;text-shadow:0 2px 8px #000;opacity:0}`;

export function installCoop12(game) {
  const mods = game.mods;
  if (!mods) return null;
  const offs = [], V3 = THREE.Vector3;
  let disposed = false, boundNet = null, style = null;

  // ---- items, loot, models (idempotent: every new Game re-installs the module) ------------------------------------------------
  for (const d of C.GIANT_DEFS) registerItem({ ...d });
  for (const [th, rows] of Object.entries(C.GIANT_LOOT)) {
    const tb = SCRAP_TABLE[th]; if (!tb) continue;
    for (const [id, w] of rows) if (!tb.some((e) => e[0] === id)) tb.push([id, w]);
  }
  const mm = (typeof window !== 'undefined' ? window.__kefalMods : null) || mods;
  if (mm?.itemModels) for (const id of Object.keys(GIANT_MODELS)) if (!mm.itemModels.has(id)) mm.itemModels.set(id, () => GIANT_MODELS[id]());
  if (typeof document !== 'undefined') { style = document.createElement('style'); style.textContent = CSS; document.head?.appendChild(style); }

  const S = {
    clock: 0,
    bond: new Map(),        // everyone: id -> buddy id (mirror of the host's list)
    book: new C.BondBook(), // host
    hf: new C.HighFiveBook(),   // host
    hands: new Map(),       // everyone: id -> { to, until } (a crewmate holds a hand out)
    doors: new Map(),       // host: door id -> { st, held: Map(pid -> t) }
    warn: new Map(),        // everyone: door id -> until (alarm flashing)
    levers: new Map(),      // client visuals: door id -> [Group, Group]
    fall: new Map(),        // host: item id -> fall tracker
    vel: new Map(),         // id -> velocity sample
    lift: null,             // local: { item, partner, role, sync }
    holdDoor: null, hfLocal: null, morale: 0, told: false,
    bondT: 0, doorT: 0, fallT: 0, bondSend: 0, scan: 0, boxT: 0, creakT: 1, swayT: 0, lastBox: '', lastChip: '', warned: false,
    buddyId: null, stats: { formed: 0, lost: 0, hf: 0, slams: 0, smashes: 0, holds: 0 },
  };
  const run = () => game.run, host = () => !!game.isHost;
  const onMoon = () => { const r = run(), m = r && MOONS[r.moon]; return !!m && r.phase === 'moon' && !m.company && !m.home; };
  const toast = (s, k = 'info') => { try { game.ui?.toast?.(s, k); } catch { /* ui optional */ } };
  const fx = (d) => { try { game.net.broadcast('c12fx', d); } catch { /* net closing */ } };
  const req = (d) => { try { game.net.request('c12q', d); } catch { /* net closing */ } };
  const nameOf = (id) => { try { return game.playerName?.(id) || '?'; } catch { return '?'; } };
  const remoteOf = (id) => game.remotes?.get?.(id) || null;
  const posOf = (id) => (id === game.selfId ? game.player?.pos : remoteOf(id)?.pos) || null;
  const yawOf = (id) => (id === game.selfId ? game.player?.yaw : remoteOf(id)?.yaw) || 0;
  const downed = (id) => { try { return !!game.downed?.isDowned?.(id); } catch { return false; } };
  const deadOf = (id) => (id === game.selfId ? !!game.player?.dead : !!remoteOf(id)?.dead);
  const alive = (id) => !!posOf(id) && !deadOf(id) && !downed(id);
  const playerIds = () => [game.selfId, ...(game.remotes ? [...game.remotes.keys()] : [])].filter((id) => id != null && posOf(id));
  const snd = (name, pos, vol = 0.6, pitch = 1) => { try { if (game.audio?.has && !game.audio.has(name)) return; game.audio?.at?.(name, pos, vol, { refDistance: 3, maxDistance: 40, pitch }); } catch { /* audio optional */ } };
  const multi = () => !!game.remotes && game.remotes.size > 0;

  // ---- net -----------------------------------------------------------------------------------------------------------------------
  function bindNet(net) { if (!net || boundNet === net) return; boundNet = net; net.on_('c12fx', (d) => onFx(d)); }
  offs.push(mods.on('netReady', (n, g) => { if (!g || g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  offs.push(mods.on('registerHandlers', (H, g) => { if (g === game) H('c12q', (d, from) => { try { hostReq(d, from); } catch (e) { console.warn('[coop12] req', e); } }); }));
  offs.push(mods.on('playerJoin', (id, info, g) => { if (g === game && host() && id !== game.selfId) { try { game.net.sendTo(id, 'c12fx', { k: 'bond', l: S.book.pairs() }); } catch { /* joiner gone */ } } }));
  offs.push(mods.on('hostMigrated', (g, info) => {
    if (g !== game || !info?.self || !host()) return;
    const pairs = []; for (const [a, b] of S.bond) if (String(a) < String(b)) pairs.push([a, b]);
    S.book.load(pairs);
  }));

  // ---- host: requests ----------------------------------------------------------------------------------------------------------
  const doorsOf = () => (game.world?.facility?.doors || []).filter((d) => d.kind === 'vault' && !d.contain && d.pos);
  function hostReq(d, from) {
    if (!d || !host() || !onMoon()) return;
    if (d.op === 'door') {
      const door = doorsOf().find((x) => x.id === d.id);
      if (!door || door.locked) return;
      const e = S.doors.get(door.id) || S.doors.set(door.id, { st: {}, held: new Map() }).get(door.id);
      if (!d.on) { e.held.delete(from); return; }
      if (!alive(from) || !C.holdOk(door, posOf(from), C.DOOR.holdHost)) { e.held.delete(from); return; }
      e.held.set(from, S.clock);
    } else if (d.op === 'hf') {
      const to = d.to;
      if (!d.on && d.on !== undefined) { S.hf.cancel(from); return; }
      if (!to || to === from || !alive(from) || !alive(to)) return;
      const pa = posOf(from), pb = posOf(to);
      if (Math.hypot(pa.x - pb.x, pa.z - pb.z) > C.HF.reach + 0.8) return;
      if (S.hf.offer(from, to, S.clock) === 'hand') fx({ k: 'hand', id: from, to });
      const info = { dist: Math.hypot(pa.x - pb.x, pa.z - pb.z), faceA: C.facing(yawOf(from), pa, pb), faceB: C.facing(yawOf(to), pb, pa) };
      if (S.hf.match(from, to, S.clock, info)) {
        S.stats.hf++;
        S.book.boost(from, to, 0.25);
        fx({ k: 'hf', a: from, b: to, p: [(pa.x + pb.x) / 2, (pa.y + pb.y) / 2 + 1.3, (pa.z + pb.z) / 2] });
      }
    }
  }
  /** downed.js hook: reviver time multiplier for a bonded reviver / victim pair (host) */
  const bondMul = (reviver, victim) => C.reviveMul(S.book.bonded(reviver, victim));

  // ---- host: bond ----------------------------------------------------------------------------------------------------------------
  function bondSync(to) { const d = { k: 'bond', l: S.book.pairs() }; if (to) { try { game.net.sendTo(to, 'c12fx', d); } catch { /* gone */ } } else fx(d); S.bondSend = 0; }
  function hostBond(dt) {
    S.bondT += dt; S.bondSend += dt;
    if (S.bondT >= 0.5) {
      const step = S.bondT; S.bondT = 0;
      const pl = playerIds().map((id) => { const p = posOf(id); return { id, x: p.x, y: p.y, z: p.z, frozen: deadOf(id) || downed(id) }; });
      const r = S.book.step(step, pl);
      if (r.formed.length || r.lost.length) { S.stats.formed += r.formed.length; S.stats.lost += r.lost.length; bondSync(); }
    }
    if (S.bondSend > 6 && S.book.pairs().length) bondSync();
  }

  // ---- host: heavy doors ---------------------------------------------------------------------------------------------------------
  function hostDoors(dt) {
    S.doorT += dt;
    if (S.doorT < 0.1) return;
    S.doorT = 0;
    const ids = playerIds().filter(alive);
    for (const door of doorsOf()) {
      if (door.locked) continue;
      const e = S.doors.get(door.id) || S.doors.set(door.id, { st: {}, held: new Map() }).get(door.id);
      let held = false;
      for (const [pid, at] of [...e.held]) {
        if (S.clock - at > C.DOOR.ttl || !alive(pid) || !C.holdOk(door, posOf(pid), C.DOOR.holdHost)) e.held.delete(pid); else held = true;
      }
      let near = 0, busy = false;
      for (const id of ids) {
        const p = posOf(id);
        if (Math.hypot(p.x - door.pos.x, p.z - door.pos.z) <= C.DOOR.near && Math.abs(p.y - door.pos.y) < 6) near++;
        if (C.inDoorway(door, p) && Math.abs(p.y - door.pos.y) < 3) busy = true;
      }
      if (!busy && game.items?.all) {   // a team lift close to the door keeps it open: never trap a giant in a vault
        for (const it of game.items.all()) {
          if (!it.holder || !C.isGiant(it.def)) continue;
          const p = posOf(it.holder);
          if (p && Math.hypot(p.x - door.pos.x, p.z - door.pos.z) <= C.DOOR.busyR && Math.abs(p.y - door.pos.y) < 3) { busy = true; break; }
        }
      }
      const enabled = near >= 2;
      if (enabled && !S.told) { S.told = true; fx({ k: 'first' }); }
      const act = C.doorStep(e.st, { open: !!door.open, held, busy, enabled, now: S.clock });
      if (act === 'open') { try { game.hostSetDoor(door.id, true); } catch { /* door gone */ } }
      else if (act === 'warn') fx({ k: 'warn', id: door.id });
      else if (act === 'close') { S.stats.slams++; try { game.hostSetDoor(door.id, false); } catch { /* door gone */ } fx({ k: 'slam', id: door.id }); }
    }
  }

  // ---- host: giant falls ---------------------------------------------------------------------------------------------------------
  function hostFalls(dt) {
    S.fallT += dt;
    if (S.fallT < 0.1 || !game.items?.all) return;
    const step = S.fallT; S.fallT = 0;
    for (const it of game.items.all()) {
      if (!C.isGiant(it.def) || !it.obj) continue;
      const st = S.fall.get(it.id) || S.fall.set(it.id, { armed: false }).get(it.id);
      const held = !!it.holder || it.state !== 'world';
      if (held) st.armed = true;
      const h = C.fallStep(st, it.obj.position.y, step, held);
      if (!st.armed || !(h > 0)) continue;
      const pct = C.fallPct(h);
      if (pct <= 0) continue;
      const lost = C.lossOf(it.baseValue || it.value, it.value, pct);
      if (lost <= 0) continue;
      S.stats.smashes++;
      game.hostDamageItem?.(it.id, lost);
      const p = it.obj.position, by = it.lastHolder || null;
      fx({ k: 'smash', id: it.id, n: lost, h: Math.round(h * 10) / 10, by, p: [p.x, p.y, p.z] });
      if (lost >= 10) { try { game.feedcams2?.record?.('crack', by, lost, it.def.name); } catch { /* optional */ } }
    }
  }

  // ---- everyone: effects -------------------------------------------------------------------------------------------------------
  function pop(text) {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div'); el.className = 'c12-pop'; el.textContent = text;
    (document.getElementById('ui') || document.body).appendChild(el);
    try { el.animate([{ opacity: 0, transform: 'translate(-50%,10px) scale(.8)' }, { opacity: 1, transform: 'translate(-50%,-8px) scale(1.15)', offset: 0.2 }, { opacity: 0, transform: 'translate(-50%,-52px) scale(1)' }], { duration: 1100, easing: 'ease-out' }); } catch { /* no animations */ }
    setTimeout(() => el.remove(), 1150);
  }
  const doorById = (id) => doorsOf().find((d) => d.id === id) || null;
  function onFx(d) {
    if (!d || disposed) return;
    try {
      if (d.k === 'bond') {
        const prev = S.bond;
        S.bond = new Map();
        for (const p of Array.isArray(d.l) ? d.l : []) if (Array.isArray(p) && p.length >= 2) { S.bond.set(p[0], p[1]); S.bond.set(p[1], p[0]); }
        const me = game.selfId, was = prev.get(me), now = S.bond.get(me);
        if (now && now !== was) { toast(tf('You and {name} are buddies now.', { name: nameOf(now) }), 'good'); snd('bell_ding', game.player?.pos, 0.35, 1.3); }
        else if (was && !now) toast(tf('The buddy bond with {name} faded.', { name: nameOf(was) }), 'info');
      } else if (d.k === 'hand') {
        S.hands.set(d.id, { to: d.to, until: S.clock + C.HF.handTtl });
      } else if (d.k === 'hf') {
        const p = Array.isArray(d.p) ? new V3(d.p[0], d.p[1], d.p[2]) : null;
        if (p) { snd('catch_thump', p, 0.8, 1.5); snd('coin_pop', p, 0.6, 1.2); try { game.particles?.burst?.(p, 'sparks', null, 1.2); } catch { /* particles optional */ } }
        S.hands.delete(d.a); S.hands.delete(d.b);
        const me = game.selfId;
        if (d.a === me || d.b === me) {
          S.morale = S.clock + C.HF.buffS; S.hfLocal = null;
          const P = game.player; if (P) P.stamina = Math.min(P.maxStamina, P.stamina + C.HF.stamina);
          toast(tf('HIGH FIVE! {name}. Morale up.', { name: nameOf(d.a === me ? d.b : d.a) }), 'good');
          game.engine?.punch?.(-0.02, 0, 0.03);
        }
      } else if (d.k === 'warn' || d.k === 'slam') {
        const door = doorById(d.id), p = door ? new V3(door.pos.x, door.pos.y + 1.3, door.pos.z) : null;
        if (d.k === 'warn') {
          S.warn.set(d.id, S.clock + C.DOOR.warn + 0.1);
          if (p) { snd('ui_notify', p, 0.9, 0.7); snd('door_locked', p, 0.6, 0.8); }
        } else {
          S.warn.delete(d.id);
          if (p) {
            snd('blast_door', p, 1, 1.15); snd('hit_metal', p, 0.9, 0.6);
            try { game.particles?.burst?.(p, 'sparks', null, 0.8); } catch { /* particles optional */ }
            const me = game.player?.pos; if (me && Math.hypot(me.x - p.x, me.z - p.z) < 14) { game.engine?.shake?.(0.3); toast(t('The heavy door slams shut.'), 'info'); }
          }
        }
      } else if (d.k === 'first') {
        if (multi()) toast(t('HEAVY VAULT DOOR. One of you holds the lever [E], the others go through. Let go and it slams.'), 'info');
      } else if (d.k === 'smash') {
        const p = Array.isArray(d.p) ? new V3(d.p[0], d.p[1], d.p[2]) : null;
        if (p) { if (d.n >= 25) { snd('glass_break', p, 0.9); snd('item_drop', p, 0.8, 0.7); } else snd('item_drop', p, 0.8, 0.7); }
        const it = game.items?.get?.(d.id);
        if (d.by === game.selfId || (game.player?.pos && p && game.player.pos.distanceTo(p) < 6)) {
          game.engine?.shake?.(Math.min(0.5, 0.15 + d.n / 140));
          if (d.by === game.selfId) { pop(`-▮${d.n}`); toast(tf('The {item} hit the floor hard: -▮{n}', { item: it ? t(it.def.name) : '?', n: d.n }), 'warn'); }
        }
      }
    } catch (e) { console.warn('[coop12] fx', e); }
  }

  // ---- local: team lift ---------------------------------------------------------------------------------------------------------
  const heldOf = (P) => { try { return P.heldItem?.() || null; } catch { return null; } };
  function liftInfo(P) {
    const co = game.carry2?.state?.co, held = heldOf(P);
    if (held && C.isGiant(held.def)) return { item: held, partner: co?.get(held.id) || null, role: 'carrier' };
    if (co) for (const [id, by] of co) {
      if (by !== game.selfId) continue;
      const it = game.items?.get?.(id);
      if (it && C.isGiant(it.def) && it.holder) return { item: it, partner: it.holder, role: 'helper' };
    }
    return null;
  }
  function sample(id, dt) {
    const p = posOf(id); if (!p) return null;
    const st = S.vel.get(id) || S.vel.set(id, {}).get(id);
    return C.velStep(st, p.x, p.z, dt);
  }
  function liftTick(P, dt) {
    const info = liftInfo(P);
    if (!info) {
      if (S.lift) { S.lift = null; P.carryMul = 1; P.carryTurn = 1; P.carryCancel = false; }
      S.vel.clear();
      return;
    }
    const me = sample(game.selfId, dt), other = info.partner ? sample(info.partner, dt) : null;
    const bonded = !!info.partner && S.bond.get(game.selfId) === info.partner;
    const raw = info.partner && me && other ? C.syncOf(me, other, bonded) : 0;
    const L = S.lift && S.lift.item === info.item ? S.lift : (S.lift = { item: info.item, sync: raw });
    L.partner = info.partner; L.role = info.role;
    L.sync += (raw - L.sync) * Math.min(1, dt * 6);
    if (!info.partner) {                                  // alone: a drag
      P.carryMul = C.LIFT.soloSpeed; P.carryCancel = true; P.carryTurn = C.LIFT.turnSolo;
      wobble(P, dt, 1.4, 0.6);
    } else {
      P.carryMul = C.liftSpeed(L.sync); P.carryCancel = info.role === 'carrier'; P.carryTurn = C.LIFT.turnPair * (0.65 + 0.35 * L.sync);
      wobble(P, dt, Math.max(0, C.LIFT.wobbleBelow - L.sync) * 5, 0.3);
    }
  }
  function wobble(P, dt, a, vol) {
    if (a <= 0 || P.frozen) return;
    S.swayT += dt;
    const mv = Math.min(1, Math.max(0.2, (P.hSpeed || 0) / 3)), k = a * mv, w = S.swayT * 3.1;
    game.engine?.punch?.(0.05 * dt * k * Math.cos(w * 0.7), 0, 0.18 * dt * k * Math.sin(w));
    S.creakT -= dt * mv;
    if (S.creakT <= 0 && mv > 0.5) { S.creakT = 1.3 + Math.random() * 1.2; game.sound2?.cue?.('carry_creak', null, Math.min(0.7, 0.2 + k * 0.2 * vol)); }
  }

  // ---- local: door lever + high five --------------------------------------------------------------------------------------------
  function doorTick(P, dt) {
    const h = S.holdDoor;
    if (!h) return;
    const door = doorById(h.id), down = !!game.input?.isDown?.('interact');
    if (!door || P.dead || !down || !C.holdOk(door, P.pos, C.DOOR.hold)) { req({ op: 'door', id: h.id, on: 0 }); S.holdDoor = null; return; }
    h.ping -= dt;
    if (h.ping <= 0) { h.ping = C.DOOR.ping; req({ op: 'door', id: h.id, on: 1 }); }
  }
  function hfTick(P, dt) {
    const h = S.hfLocal;
    if (!h) return;
    const p = posOf(h.to), down = !!game.input?.isDown?.('interact');
    if (!p || P.dead || !down || !alive(h.to) || S.clock - h.t0 > 4 || Math.hypot(p.x - P.pos.x, p.z - P.pos.z) > C.HF.reach + 0.8) { req({ op: 'hf', to: h.to, on: 0 }); S.hfLocal = null; return; }
    h.ping -= dt;
    if (h.ping <= 0) { h.ping = C.HF.ping; req({ op: 'hf', to: h.to, on: 1 }); }
  }
  offs.push(mods.on('interactables', (out, g) => {
    if (g !== game || disposed || !onMoon()) return;
    const P = game.player; if (!P || P.dead) return;
    // heavy vault door levers
    if (multi()) for (const door of doorsOf()) {
      if (door.locked || Math.hypot(door.pos.x - P.pos.x, door.pos.z - P.pos.z) > 7 || Math.abs(door.pos.y - P.pos.y) > 3) continue;
      let best = null, bd = 1e9;
      for (const lp of C.leverPoints(door)) { const d = Math.hypot(lp.x - P.pos.x, lp.z - P.pos.z); if (d < bd) { bd = d; best = lp; } }
      if (!best) continue;
      out.push({
        pos: new V3(best.x, door.pos.y + 1.25, best.z), r: 0.9, reach: 2.3, noLos: true,
        label: () => t(door.open ? 'Hold the lever to keep the vault door open [hold E]' : 'Hold the lever to open the vault door [hold E]'),
        sub: () => t('Heavy door: it slams shut when nobody holds the lever. Others walk through.'),
        action: () => { if (!S.holdDoor) { S.holdDoor = { id: door.id, ping: 0 }; S.stats.holds++; } },
      });
    }
    // high five
    const held = heldOf(P);
    if (!(held && held.def.hands === 2) && !S.hfLocal) {
      for (const id of game.remotes?.keys?.() || []) {
        if (!alive(id)) continue;
        const rp = posOf(id);
        if (Math.hypot(rp.x - P.pos.x, rp.z - P.pos.z) > C.HF.prompt || Math.abs(rp.y - P.pos.y) > 1.5 || !C.facing(P.yaw, P.pos, rp, 0.5)) continue;
        const hand = S.hands.get(id), offered = hand && hand.to === game.selfId && hand.until > S.clock;
        out.push({
          optionalPeer: true, pos: new V3(rp.x, rp.y + 1.2, rp.z), r: 1.0, reach: C.HF.prompt, noLos: true,
          label: () => tf(offered ? '{name} holds out a hand. High-five [hold E]' : 'High-five {name} [hold E]', { name: nameOf(id) }),
          sub: () => t('Face each other and both hold [E].'),
          action: () => { S.hfLocal = { to: id, ping: 0, t0: S.clock }; },
        });
      }
    }
  }));

  // ---- local: bond effects (stamina, tag, pings) ---------------------------------------------------------------------------------
  function bondTick(P, dt) {
    const bid = S.bond.get(game.selfId) || null;
    S.buddyId = bid;
    let regen = 0;
    if (bid && alive(bid) && !downed(game.selfId)) {
      const bp = posOf(bid);
      if (bp && Math.hypot(bp.x - P.pos.x, bp.z - P.pos.z) <= C.BOND.staminaR) regen += C.BOND.stamina;
    }
    if (S.morale > S.clock) regen += C.HF.regen;
    if (regen > 0 && (P.staminaDelay || 0) <= 0 && !P.sprinting && P.stamina < P.maxStamina) P.stamina = Math.min(P.maxStamina, P.stamina + regen * dt);
  }
  let tag = null;
  function tagTick() {
    const bid = S.buddyId, r = bid ? remoteOf(bid) : null;
    if (!tag && r) { tag = makeBuddySprite(); if (tag) game.scene?.add(tag); }
    if (!tag) return;
    const P = game.player;
    if (!r || r.dead || downed(bid) || !P) { tag.visible = false; return; }
    const d = Math.hypot(r.pos.x - P.pos.x, r.pos.z - P.pos.z);
    tag.visible = d < 30;
    tag.position.set(r.pos.x, r.pos.y + 2.35, r.pos.z);
    if (tag.material) tag.material.opacity = Math.min(1, 1.6 - d / 22);
  }
  offs.push(mods.on('ping', (d, g) => {
    if (g !== game || disposed || !d || !S.buddyId || d.from !== S.buddyId) return;   // a buddy's ping: gold marker, lives 4 s longer
    try { const pg = (game.pings?.active || []).filter((p) => p.from === d.from).pop(); if (pg?.el) { pg.el.classList.add('c12-bp'); pg.life += C.BOND.pingLife; } } catch { /* pings optional */ }
  }));

  // ---- local: HUD ----------------------------------------------------------------------------------------------------------------------
  let boxEl = null, chipEl = null;
  const setHtml = (el, prop, html) => { if (prop.v !== html) { prop.v = html; el.innerHTML = html; } };
  const boxKey = { v: '' }, chipKey = { v: '' };
  function hudTick() {
    if (typeof document === 'undefined') return;
    // bottom box: lift bar / door hold / hand offer
    let html = '', cls = 'c12-box';
    const L = S.lift;
    if (L) {
      const solo = !L.partner, s = solo ? 0 : L.sync, word = solo ? 'DRAGGING ALONE' : C.syncWord(s);
      cls += s >= 0.75 && !solo ? '' : s >= 0.45 && !solo ? ' mid' : ' bad';
      const hint = solo ? 'Alone you can only drag it. A crewmate holds [E] next to you to lift.' : s < 0.45 ? 'Walk the same way at the same speed.' : s >= 0.75 ? 'Nice. Keep the step.' : '';
      html = `<div class="c12-h"><span>${esc(t('TEAM LIFT'))}</span><span>${esc(t(word))}</span></div><u><b style="width:${Math.round(s * 100)}%"></b><s style="left:75%"></s></u>${hint ? `<i>${esc(t(hint))}</i>` : ''}`;
    } else if (S.holdDoor) {
      html = `<div class="c12-h"><span>${esc(t('HOLDING THE DOOR'))}</span></div><i>${esc(t('Stay on the lever. Your crew is passing.'))}</i>`;
    } else {
      for (const [id, h] of S.hands) if (h.until > S.clock && h.to === game.selfId && alive(id) && !S.hfLocal) { html = `<div class="c12-h"><span>${esc(tf('{name} holds out a hand. High-five [hold E]', { name: nameOf(id) }))}</span></div>`; break; }
    }
    if (html) {
      if (!boxEl) { boxEl = hudDock('bottom', 'c12_box', 6); }
      setHtml(boxEl, boxKey, `<div class="${cls}">${html}</div>`);
    } else if (boxEl && boxKey.v) { boxKey.v = ''; boxEl.innerHTML = ''; }
    // left chip: buddy + morale
    const bid = S.buddyId, mor = S.morale > S.clock;
    let chip = '';
    if (bid) chip += `<div><em>${esc(t('BUDDY'))}</em> ${esc(nameOf(bid))}</div><i>${esc(t('Buddies: faster revive, shared stamina, gold pings.'))}</i>`;
    if (mor) chip += `<div><em>${esc(t('MORALE'))}</em> ${Math.ceil(S.morale - S.clock)}s</div>`;
    if (chip) {
      if (!chipEl) chipEl = hudDock('left', 'c12_chip', 40);
      setHtml(chipEl, chipKey, `<div class="c12-chip">${chip}</div>`);
    } else if (chipEl && chipKey.v) { chipKey.v = ''; chipEl.innerHTML = ''; }
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- levers (client visuals) -----------------------------------------------------------------------------------------------------
  function leverTick(dt) {
    const show = multi() && onMoon();
    const doors = show ? doorsOf().filter((d) => !d.locked) : [];
    const seen = new Set();
    for (const door of doors) {
      seen.add(door.id);
      let pair = S.levers.get(door.id);
      if (!pair) {
        pair = C.leverPoints(door).map((lp) => {
          const g = makeLever();
          const f = C.doorFrame(door);
          g.position.set(lp.x, door.pos.y + 1.25, lp.z);
          g.rotation.y = f.nx ? (lp.side > 0 ? Math.PI / 2 : -Math.PI / 2) : (lp.side > 0 ? 0 : Math.PI);
          game.scene?.add(g);
          return g;
        });
        S.levers.set(door.id, pair);
      }
      const warn = (S.warn.get(door.id) || 0) > S.clock;
      let col = door.open ? 0x59e88a : 0xff3a2a;
      if (warn) col = Math.floor(S.clock * 8) % 2 ? 0xffb640 : 0xff3a2a;
      const holding = S.holdDoor?.id === door.id;
      for (const g of pair) { g.userData.lamp.material.color.setHex(col); g.userData.arm.rotation.x = holding || door.open ? -0.5 : 0.4; }
    }
    for (const [id, pair] of [...S.levers]) if (!seen.has(id)) { for (const g of pair) { g.removeFromParent(); g.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); } S.levers.delete(id); }
    // stock vault speed is 0.5 / s: heavy doors get a quick hold-open and a real slam
    for (const door of doors) {
      if (door.open && door.t < 1) door.t = Math.min(1, door.t + dt * C.DOOR.speedUp);
      else if (!door.open && door.t > 0) door.t = Math.max(0, door.t - dt * C.DOOR.speedUp);
    }
  }

  // ---- frame ---------------------------------------------------------------------------------------------------------------------
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    try {
      S.clock += dt;
      const P = game.player;
      if (P && !P.dead) { liftTick(P, dt); doorTick(P, dt); hfTick(P, dt); bondTick(P, dt); }
      else if (P) { if (S.lift) { S.lift = null; P.carryMul = 1; P.carryTurn = 1; P.carryCancel = false; } S.holdDoor = null; S.hfLocal = null; }
      tagTick(); leverTick(dt);
      S.boxT -= dt; if (S.boxT <= 0) { S.boxT = 0.1; hudTick(); }
      if (host() && onMoon()) { hostBond(dt); hostDoors(dt); hostFalls(dt); }
    } catch (e) { if (!S.warned) { S.warned = true; console.warn('[coop12] update', e); } }
  }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g && g !== game) return;
    if (ph !== 'moon') { S.doors.clear(); S.fall.clear(); S.warn.clear(); S.hands.clear(); S.holdDoor = null; S.hfLocal = null; S.told = false; S.vel.clear(); }
  }));

  return {
    state: S, core: C, items: C.GIANT_DEFS.map((d) => d.id), bondMul,
    isBuddy: (a, b) => (host() ? S.book.bonded(a, b) : S.bond.get(a) === b),
    /** console: kefal.game.coop12.debug.* */
    debug: {
      state: () => ({ bond: [...S.bond], lift: S.lift && { sync: +S.lift.sync.toFixed(2), partner: S.lift.partner, role: S.lift.role }, morale: Math.max(0, +(S.morale - S.clock).toFixed(1)), holdDoor: S.holdDoor, stats: S.stats, doors: [...S.doors].map(([id, e]) => ({ id, held: e.held.size, last: e.st.last })) }),
      /** spawn a giant next to you (host): kefal.game.coop12.debug.spawn('cg_like') */
      spawn: (id = 'cg_like') => { const P = game.player, f = P.forward?.(); try { return game.items.hostSpawn(id, new V3(P.pos.x + (f?.x || 0) * 2, P.pos.y + 0.8, P.pos.z + (f?.z || 0) * 2), {}); } catch (e) { return String(e); } },
      /** force the bond with a remote id (host) */
      bond: (id) => { S.book.boost(game.selfId, id, 1); S.book.step(0.5, playerIds().map((i) => ({ id: i, x: 0, y: 0, z: 0 }))); bondSync(); return S.book.pairs(); },
      giants: () => [...(game.items?.all?.() || [])].filter((it) => C.isGiant(it.def)).map((it) => ({ id: it.id, type: it.type, holder: it.holder, value: it.value })),
    },
    dispose() {
      disposed = true;
      for (const o of offs.splice(0)) { try { o?.(); } catch { /* ignore */ } }
      for (const pair of S.levers.values()) for (const g of pair) { g.removeFromParent(); g.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
      S.levers.clear();
      if (tag) { tag.removeFromParent(); tag.material?.map?.dispose?.(); tag.material?.dispose?.(); tag = null; }
      if (S.lift && game.player) { game.player.carryMul = 1; game.player.carryTurn = 1; game.player.carryCancel = false; }
      boxEl?.remove(); chipEl?.remove(); style?.remove();
    },
  };
}
