// ELEVATOR STOP (module 'cycle3', part 'elevator'; MASTERPLAN 5.5 "Set-piece olaylar: Elevator stop"). Some facilities (50 %, seeded) hold a freight elevator pair: an elevator door in a
// room near the entrance and one in a deep room. Press E at either door and everybody standing there rides to the other one. The ride is 5.5 s; 40-60 % of the rides STOP
// BETWEEN FLOORS: the lights flicker, something knocks on the cab roof, and the crew has 45-60 s to fix the fuse panel (press the red / green / blue buttons in the order the
// panel shows; a wrong button resets it) while someone braces the door lever before each knock (an unbraced knock jolts the cab: -1 fuse step and a little damage from quota 1;
// quota 0 never hurts). Fixed = the cab resumes, arrives, and drops a few scrap; the timer runs out = the cab drops (small damage, no reward). Never lethal, never a soft lock
// (host hard cap 120 s, takeoff aborts the ride).
// The cab is a tiny sealed room built far away at x = +6400 (facility floor height, like the backrooms pocket); riders are moved in and out with the generic host 'tp' message.
// Host-authoritative: ElevatorRun (cycle3_core.js) on the host; 'c3req' ops ecall / ebtn / ebrace; 'c3s' {k:'eride'|'estate'|'estop'|'ewarn'|'eknock'|'eev'|'efail'|'earrive'}.
import * as THREE from 'three';
import { G } from '../physics/physics.js';
import { FACILITY_Y } from '../world/facility.js';
import { layoutKit, WALL_ROT, INWARD } from '../world/interiors/common.js';
import { createProp } from '../models/props.js';
import { RNG, hashString } from '../core/rng.js';
import { t, tf } from '../core/i18n.js';
import { MOONS } from './moons.js';
import { scrapTableFor } from './items.js';
import { disposeGroup, textPlane, lambert, basic, box } from './cycle3_fx.js';

export const CAB = { x: 6400, z: 0, half: 1.6, h: 2.7 };
const BTN_COL = [0xff3a3a, 0x3aff6a, 0x3a8aff], BTN_NAME = ['red', 'green', 'blue'];
const MAX_RIDE = 120, COOLDOWN = 20, MAX_REWARDS_PER_DAY = 2;

export function installElevator(C3) {
  const { game, mods, K } = C3;
  let disposed = false, plan = null, planFac = null, doors = null, R = null, cab = null, E = null, cool = 0, snapT = 0, rewardsDay = 0, rewardsN = 0, rides = 0;
  const api0 = { forceExists: false };
  const host = () => C3.host();

  // ============================================================ the two doors (deterministic from the layout: every peer agrees)
  function computePlan() {
    const fac = game.world?.facility, run = game.run;
    if (!fac?.layout || !run) return null;
    const moon = MOONS[run.moon];
    if (!moon || moon.instance || moon.company || moon.home || fac.layout.theme === 'mineshaft') return null;
    if (!api0.forceExists && !K.elevatorExists(run.seed, C3.qi())) return null;
    const L = fac.layout, kit = layoutKit(L);
    const pick = K.pickElevatorRooms(L, kit, run.seed);
    if (!pick) return null;
    const mk = (s, tag) => {
      const [px, pz] = kit.wallPoint(s.x, s.z, s.d, 0, 0.03), [fx, fz] = kit.wallPoint(s.x, s.z, s.d, 0, 1.4);
      const [ix, iz] = INWARD[s.d];
      return { tag, room: s.room, d: s.d, cell: [s.x, s.z], wall: { x: px, z: pz }, front: { x: fx, z: fz }, yaw: Math.atan2(-ix, -iz), y: L.y, rot: WALL_ROT[s.d], kit_along: (a, o) => kit.wallPoint(s.x, s.z, s.d, a, o) };
    };
    return { a: mk(pick.a, 'a'), b: mk(pick.b, 'b'), y: L.y };
  }
  function ensurePlan() {
    const fac = game.world?.facility;
    if (fac !== planFac) { planFac = fac || null; plan = null; disposeDoors(); if (fac) { try { plan = computePlan(); } catch (e) { console.warn('[cycle3] elevator plan', e); plan = null; } if (plan) buildDoors(); } }
    return plan;
  }
  function disposeDoors() { if (doors) { disposeGroup(doors); doors = null; } }
  function buildDoors() {
    disposeDoors();
    if (!plan || !game.scene) return;
    doors = new THREE.Group(); doors.name = 'c3_elevator_doors';
    for (const s of [plan.a, plan.b]) {
      let o = null;
      try { o = createProp('elevator_door', { seed: 11 }); } catch (e) { console.warn('[cycle3] elevator prop', e); }
      if (!o) continue;
      o.position.set(s.wall.x, plan.y, s.wall.z); o.rotation.y = s.rot;
      doors.add(o);
    }
    game.scene.add(doors);
  }
  C3.mapFns.push(() => { planFac = null; });
  C3.ticks.push(() => { if (game.world?.facility !== planFac) ensurePlan(); });
  C3.phaseFns.push((ph) => { if (ph !== 'moon' && ph !== 'landing') { if (R) abortRide('phase'); planFac = null; plan = null; disposeDoors(); } });

  // ============================================================ host: a ride
  const alive = () => game.aiPlayers().filter((p) => !p.dead);
  const doorOf = (side) => (side === 'b' ? plan?.b : plan?.a);
  function startRide(side, from, force) {
    if (!host() || !ensurePlan() || R || cool > 0 || game.run?.phase !== 'moon') return false;
    const src = doorOf(side), dst = doorOf(side === 'b' ? 'a' : 'b');
    if (!src || !dst) return false;
    const riders = alive().filter((p) => p.zone === 'in' && Math.hypot(p.pos.x - src.front.x, p.pos.z - src.front.z) < K.ELEV.callRange && Math.abs(p.pos.y - plan.y) < 3.5);
    if (force) for (const p of alive()) if (!riders.some((r) => r.id === p.id)) riders.push(p);
    if (!riders.length || (from && !riders.some((p) => p.id === from))) return false;
    rides++;
    const seed = hashString(`${game.run.seed}:c3elev:${game.run.day}:${rides}`) >>> 0;
    const sim = new K.ElevatorRun({ seed, q: C3.qi(), stops: force?.stops });
    const n = riders.length;
    const dests = riders.map((p, i) => { const [x, z] = dst.kit_along((i - (n - 1) / 2) * 0.6, 1.5 + (i % 2) * 0.5); return [+x.toFixed(2), +(plan.y + 0.06).toFixed(2), +z.toFixed(2), +dst.yaw.toFixed(3)]; });
    R = { sim, riders: riders.map((p) => p.id), dests, t: 0, seed, from: src.tag, down: src.tag === 'a' };
    C3.send({ k: 'eride', id: seed, riders: R.riders, down: R.down, stops: sim.stops ? 1 : 0 });
    game.later?.(() => {
      if (!R || R.seed !== seed) return;
      R.riders.forEach((id, i) => game.net.sendTo(id, 'tp', { p: [CAB.x + (i - (n - 1) / 2) * 0.7, FACILITY_Y + 0.06, CAB.z + 0.6 + (i % 2) * 0.5], yaw: 0 }));
    }, 350);
    snapT = 0;
    return true;
  }
  C3.handle('ecall', (d, from, p) => {
    if (!p || p.dead) return;
    if (R) { C3.sayTo(from, 'The elevator is in use.', {}, 'info'); return; }
    if (cool > 0) { C3.sayTo(from, 'The elevator is recovering. Try again in a moment.', {}, 'info'); return; }
    if (!startRide(d.side === 'b' ? 'b' : 'a', from, null)) C3.sayTo(from, 'Nobody is at the elevator door.', {}, 'info');
  });
  C3.handle('ebtn', (d, from) => { if (!R || !R.riders.includes(from)) return; handle(R.sim.press(d.i | 0)); });
  C3.handle('ebrace', (d, from) => { if (!R || !R.riders.includes(from)) return; handle(R.sim.brace()); });
  function handle(events) {
    for (const ev of events) {
      if (ev.k === 'progress') C3.send({ k: 'eev', r: 'progress', prog: ev.prog });
      else if (ev.k === 'wrong') C3.send({ k: 'eev', r: 'wrong' });
      else if (ev.k === 'brace') C3.send({ k: 'eev', r: 'brace' });
      else if (ev.k === 'solved') C3.send({ k: 'eev', r: 'solved' });
      else if (ev.k === 'stop') C3.send({ k: 'estop', seq: R.sim.seq, limit: R.sim.limit });
      else if (ev.k === 'warn') C3.send({ k: 'ewarn', n: ev.n });
      else if (ev.k === 'knock') {
        C3.send({ k: 'eknock', n: ev.n, absorbed: ev.absorbed ? 1 : 0, dmg: ev.dmg || 0 });
        if (ev.dmg > 0) for (const id of R.riders) { try { game.hostHurtPlayer(id, ev.dmg, 'elevator', null); } catch { /* ignore */ } }
      } else if (ev.k === 'fail') C3.send({ k: 'efail' });
      else if (ev.k === 'arrive') { arrive(ev); return; }
    }
  }
  function arrive(ev) {
    const r = R; if (!r) return;
    const day = game.run.day | 0;
    if (day !== rewardsDay) { rewardsDay = day; rewardsN = 0; }
    r.riders.forEach((id, i) => game.net.sendTo(id, 'tp', { p: r.dests[i].slice(0, 3), yaw: r.dests[i][3] }));
    let reward = null;
    if (ev.ok && r.sim.stops && rewardsN < MAX_REWARDS_PER_DAY) {
      reward = r.sim.reward(); rewardsN++;
      const rng = new RNG((r.seed ^ 0x5c4a) >>> 0), table = scrapTableFor(game.world?.facility?.layout?.theme || MOONS[game.run.moon]?.interior).map(([id, w]) => ({ id, w }));
      const dst = r.dests[0];
      for (let i = 0; i < reward.scrap && table.length; i++) game.items.hostSpawn(rng.weighted(table).id, new THREE.Vector3(dst[0] + (i - 1) * 0.5, dst[1] + 0.8, dst[2] + 0.5), { valueMul: 1.35 });
      for (const id of r.riders) game.net.broadcast('xp', { to: id, xp: reward.xp, coin: 6, reason: 'Elevator repaired' }, true);
    }
    if (ev.dmg > 0) for (const id of r.riders) { try { game.hostHurtPlayer(id, ev.dmg, 'elevator', null); } catch { /* ignore */ } }
    C3.send({ k: 'earrive', ok: ev.ok ? 1 : 0, dmg: ev.dmg || 0, reward: reward ? reward.scrap : 0, clean: reward?.clean ? 1 : 0, stops: r.sim.stops ? 1 : 0 });
    R = null; cool = COOLDOWN;
  }
  function abortRide(why) {
    const r = R; if (!r) return;
    if (host() && plan && why === 'phase') { /* the ship leaves: riders are put back at the destination door so nobody is lost in the cab */ r.riders.forEach((id, i) => game.net.sendTo(id, 'tp', { p: r.dests[i].slice(0, 3), yaw: r.dests[i][3] })); }
    C3.send({ k: 'earrive', ok: 0, dmg: 0, reward: 0, stops: 0, aborted: 1 });
    R = null; cool = 5;
  }
  C3.ticks.push((dt) => {
    if (!host()) return;
    if (cool > 0) cool -= dt;
    if (!R) return;
    R.t += dt;
    if (R.t > MAX_RIDE) { handle([{ k: 'arrive', ok: !R.sim.stops, dmg: 0 }]); return; }
    handle(R.sim.tick(dt));
    if (!R) return;
    snapT -= dt;
    if (snapT <= 0) { snapT = R.sim.phase === 'stopped' ? 0.25 : 0.6; C3.send({ k: 'estate', s: R.sim.snap() }); }
  });

  // ============================================================ every rider: the cab
  function buildCab() {
    disposeCab();
    if (!game.scene || typeof document === 'undefined') return;
    const group = new THREE.Group(); group.position.set(CAB.x, FACILITY_Y, CAB.z);
    const H = CAB.half, hh = CAB.h, wall = lambert(0x6b6f76), dark = lambert(0x2a2c30);
    const cols = [];
    const solid = (x, y, z, sx, sy, sz, mat) => { group.add(box(sx, sy, sz, mat, x, y, z)); try { cols.push(game.physics.addStaticBox(CAB.x + x, FACILITY_Y + y, CAB.z + z, sx / 2, sy / 2, sz / 2, 0, G.STATIC)); } catch { /* physics optional in tests */ } };
    solid(0, -0.25, 0, 2 * H + 0.6, 0.5, 2 * H + 0.6, dark);               // floor
    solid(0, hh + 0.25, 0, 2 * H + 0.6, 0.5, 2 * H + 0.6, dark);           // ceiling
    solid(0, hh / 2, -H - 0.15, 2 * H + 0.6, hh, 0.3, wall);               // back (panel)
    solid(0, hh / 2, H + 0.15, 2 * H + 0.6, hh, 0.3, wall);                // front (doors)
    solid(-H - 0.15, hh / 2, 0, 0.3, hh, 2 * H, wall);                     // left
    solid(H + 0.15, hh / 2, 0, 0.3, hh, 2 * H, wall);                      // right (lever)
    for (const sx of [-0.36, 0.36]) group.add(box(0.7, 2.3, 0.05, lambert(0x8a8e96), sx, 1.15, H - 0.04));   // closed doors
    const lampMat = basic(0xfff0c8); group.add(box(1.6, 0.05, 0.6, lampMat, 0, hh - 0.03, 0));
    // fuse panel on the back wall
    group.add(box(1.7, 1.0, 0.06, lambert(0x3a3d44), 0, 1.5, -H + 0.03));
    const display = textPlane(1.5, 0.42, 300, 84, (c, w, h) => { c.fillStyle = '#04120a'; c.fillRect(0, 0, w, h); });
    display.position.set(0, 1.78, -H + 0.07); group.add(display);
    const btns = BTN_COL.map((c, i) => { const m = basic(c); const b = box(0.3, 0.3, 0.08, m, (i - 1) * 0.5, 1.22, -H + 0.09); group.add(b); return { mesh: b, mat: m }; });
    // door lever on the right wall
    group.add(box(0.1, 0.5, 0.3, lambert(0x3a3d44), H - 0.05, 1.2, 0.4));
    const lever = box(0.06, 0.06, 0.4, basic(0xffb02a), H - 0.14, 1.32, 0.4); lever.rotation.y = 0; group.add(lever);
    game.scene.add(group);
    let lamp = null;
    try { lamp = game.lights?.add?.({ pos: new THREE.Vector3(CAB.x, FACILITY_Y + hh - 0.4, CAB.z), color: 0xffe4b8, intensity: 1.15, distance: 9, group: 'c3', flicker: 0 }) || null; } catch { /* lights optional */ }
    cab = { group, cols, display, btns, lever, lamp, lampMat, t: 0, dispKey: '', darkT: 0 };
  }
  function disposeCab() {
    if (!cab) return;
    for (const c of cab.cols) { try { game.physics.removeCollider(c); } catch { /* ignore */ } }
    if (cab.lamp) { try { game.lights.remove(cab.lamp); } catch { /* ignore */ } }
    disposeGroup(cab.group);
    cab = null;
  }
  const seqChars = ['R', 'G', 'B'];
  function paintDisplay(text1, text2, seq, prog) {
    if (!cab) return;
    const key = [text1, text2, seq ? seq.join('') : '', prog].join('|') + '|' + (E?.snap?.left | 0);
    if (key === cab.dispKey) return;
    cab.dispKey = key;
    const d = cab.display, cv = d.userData.tex.image, c = cv.getContext('2d'), w = cv.width, h = cv.height;
    c.fillStyle = '#04120a'; c.fillRect(0, 0, w, h);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#5dff9a'; c.font = 'bold 22px monospace'; c.fillText(text1, w / 2, 20);
    if (seq) {
      const n = seq.length, gap = 46, x0 = w / 2 - ((n - 1) * gap) / 2;
      seq.forEach((v, i) => { c.fillStyle = '#' + BTN_COL[v].toString(16).padStart(6, '0'); c.globalAlpha = i < prog ? 0.35 : 1; c.fillRect(x0 + i * gap - 15, 40, 30, 30); c.globalAlpha = 1; if (i < prog) { c.fillStyle = '#04120a'; c.font = 'bold 22px monospace'; c.fillText('OK', x0 + i * gap, 55); } });
    } else { c.fillStyle = '#5dff9a'; c.font = '20px monospace'; c.fillText(text2 || '', w / 2, 58); }
    d.userData.tex.needsUpdate = true;
  }
  const iAmRider = () => !!E && E.riders.includes(game.selfId);

  C3.on('eride', (m) => {
    E = { id: m.id, riders: m.riders || [], down: !!m.down, stops: !!m.stops, snap: { ph: 'ride', prog: 0, len: 3, hold: 0, left: 0, knocks: 0, warn: 0 }, seq: null, t: 0, hint: 0 };
    if (!iAmRider()) return;
    buildCab();
    game.ui?.toast?.(t(E.down ? 'The elevator doors close. Descending...' : 'The elevator doors close. Ascending...'), 'info');
    game.sfx?.('elevator_ding', 0.5);
    paintDisplay(t(E.down ? 'DESCENDING' : 'ASCENDING'), '...', null, 0);
  });
  C3.on('estate', (m) => { if (!E) return; E.snap = m.s || E.snap; });
  C3.on('estop', (m) => {
    if (!E) return;
    E.seq = m.seq || null;
    if (!iAmRider()) return;
    game.ui?.hud?.bigText?.(t('ELEVATOR STOPPED'), t('Fix the fuse panel: press the buttons in the order shown. Brace the door lever before each knock.'));
    game.sfx?.('hit_metal', 0.7); game.engine?.shake?.(0.5);
    if (cab) { cab.darkT = 0.5; if (cab.lamp) cab.lamp.flicker = 0.9; }
  });
  C3.on('ewarn', () => { if (iAmRider()) { game.sfx?.('hit_metal', 0.25); game.ui?.toast?.(t('Something knocks on the cab roof...'), 'warn'); } });
  C3.on('eknock', (m) => {
    if (!iAmRider()) return;
    game.sfx?.(m.absorbed ? 'hit_metal' : 'explosion', m.absorbed ? 0.45 : 0.55); game.engine?.shake?.(m.absorbed ? 0.2 : 0.55);
    if (!m.absorbed && cab) cab.darkT = 0.7;
    game.ui?.toast?.(m.absorbed ? t('You brace the doors. The knock rattles off.') : t('The doors buckle! The fuse panel loses a step.'), m.absorbed ? 'good' : 'bad');
  });
  C3.on('eev', (m) => {
    if (!iAmRider()) return;
    if (m.r === 'wrong') { game.sfx?.('spark', 0.6); game.ui?.toast?.(t('BZZT. Wrong button: the sequence resets.'), 'bad'); }
    else if (m.r === 'progress') game.sfx?.('ui_notify', 0.5);
    else if (m.r === 'brace') game.sfx?.('door_locked', 0.5);
    else if (m.r === 'solved') { game.sfx?.('power_up', 0.8); game.ui?.hud?.bigText?.(t('FUSE FIXED'), t('The cab shudders back to life.')); if (cab?.lamp) cab.lamp.flicker = 0; }
  });
  C3.on('efail', () => { if (iAmRider()) { game.ui?.hud?.bigText?.(t('CABLE FAULT'), t('The cab drops!')); game.sfx?.('explosion', 0.7); game.engine?.shake?.(0.9); } });
  C3.on('earrive', (m) => {
    const me = iAmRider();
    if (me && !m.aborted) {
      game.sfx?.('elevator_ding', 0.7);
      game.ui?.toast?.(m.dmg > 0 ? tf('The cab slams into the bottom. -{d} HP', { d: m.dmg }) : m.reward ? tf('The doors open. The crew finds {n} scrap in the shaft.', { n: m.reward }) : t('The doors open.'), m.dmg > 0 ? 'bad' : 'good');
    }
    const old = E; E = null;
    setTimeout(() => { if (!E || E === old) disposeCab(); }, 900);
  });
  // flicker / blackout of the cab lamp (constant light count: the pooled emitter is toggled, never added / removed while riding)
  C3.ticks.push((dt) => {
    if (!cab) return;
    cab.t += dt;
    const s = E?.snap;
    const stopped = s?.ph === 'stopped' || s?.ph === 'fall';
    if (cab.darkT > 0) cab.darkT -= dt;
    const on = cab.darkT <= 0 && (!stopped || Math.sin(cab.t * 21) + Math.sin(cab.t * 8.3) > -1.2);
    if (cab.lamp) cab.lamp.enabled = on;
    cab.lampMat.color.setHex(on ? 0xfff0c8 : 0x30302c);
    if (E) {
      if (s.ph === 'stopped') paintDisplay(t('STOPPED BETWEEN FLOORS'), '', E.seq, s.prog);
      else if (s.ph === 'resume') paintDisplay(t('RESTARTING'), '...', null, 0);
      else if (s.ph === 'fall') paintDisplay(t('CABLE FAULT'), '!!!', null, 0);
      else paintDisplay(t(E.down ? 'DESCENDING' : 'ASCENDING'), '...', null, 0);
    }
    cab.btns.forEach((b, i) => b.mat.color.setHex(stopped ? BTN_COL[i] : 0x303030));
    if (cab.lever) cab.lever.rotation.z = (s?.hold || 0) * 0.9;
  });

  // ============================================================ interactables + objectives
  C3.interFns.push((list, p) => {
    if (iAmRider() && cab) {
      const s = E?.snap;
      if (s?.ph === 'stopped') {
        BTN_NAME.forEach((nm, i) => list.push({ pos: new THREE.Vector3(CAB.x + (i - 1) * 0.5, FACILITY_Y + 1.22, CAB.z - CAB.half + 0.4), r: 0.32, reach: 3.4, noLos: true, label: tf('Press the {c} button [E]', { c: t(nm) }), sub: tf('fuse {a}/{b}', { a: s.prog, b: s.len }), action: () => C3.req('ebtn', { i }) }));
        list.push({ pos: new THREE.Vector3(CAB.x + CAB.half - 0.4, FACILITY_Y + 1.2, CAB.z + 0.4), r: 0.55, reach: 3.4, noLos: true, label: t('Brace the door [E]'), sub: s.hold > 0.2 ? t('braced') : t('press before each knock'), action: () => C3.req('ebrace') });
      }
      return;
    }
    if (!plan || R || !p.indoor || game.run?.phase !== 'moon') return;
    for (const s of [plan.a, plan.b]) {
      if (Math.hypot(p.pos.x - s.front.x, p.pos.z - s.front.z) > 5) continue;
      list.push({ pos: new THREE.Vector3(s.front.x, plan.y + 1.25, s.front.z), r: 1.0, reach: 3.2, label: cool > 0 ? t('The elevator is recovering') : t('Call the freight elevator [E]'), sub: t(s.tag === 'a' ? 'Down to the deep floors' : 'Up to the lobby'), action: () => { if (cool <= 0) C3.req('ecall', { side: s.tag }); } });
    }
  });
  C3.objFns.push((add) => {
    if (!iAmRider() || !E) return;
    const s = E.snap;
    if (s.ph === 'stopped') add(tf('ELEVATOR STOPPED: fuse {a}/{b} - {s} s', { a: s.prog, b: s.len, s: s.left }), s.left < 15 ? 'warn' : 'main', false, s.prog / Math.max(1, s.len));
  });

  C3.disposers.push(() => { disposeCab(); disposeDoors(); });
  return {
    get plan() { return plan; }, get ride() { return R; }, get cab() { return cab; }, get state() { return E; },
    ensurePlan, start: (side = 'a', o = {}) => startRide(side, null, { stops: o.stops }), abort: abortRide,
    set forceExists(v) { api0.forceExists = !!v; planFac = null; },
    press: (i) => { if (R) handle(R.sim.press(i)); }, brace: () => { if (R) handle(R.sim.brace()); },
    dispose() { disposed = true; disposeCab(); disposeDoors(); },
  };
}
