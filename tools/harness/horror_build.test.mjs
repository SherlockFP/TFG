// node tools/harness/horror_build.test.mjs - offline build test with stub physics / lights (no browser): pocket geometry + nav, closets, portal maths, trap visuals
// through their whole state timeline, chalk view, creature AI on a fake creature manager.
import * as THREE from 'three';
import { NavGrid } from '../../src/world/nav.js';
import { generateLayout } from '../../src/world/facility.js';
import * as C from '../../src/game/horror_core.js';
import * as MAPS from '../../src/game/horror_maps.js';
import { buildPocket, pocketOrigin } from '../../src/game/horror_pocket.js';
import { buildCloset, portalMap, toWorld, toLocal } from '../../src/game/horror_closet.js';
import { TrapView } from '../../src/game/horror_traps.js';
import { ChalkView } from '../../src/game/horror_chalk.js';
import { registerHorrorCreatures, HOOKS } from '../../src/game/horror_creatures.js';
import { CREATURES } from '../../src/game/creatures.js';
import { BEHAVIORS } from '../../src/entities/creatures.js';
import { createShamblerModel, createForgerModel, createAmbusherModel, createWardenModel, createChalkModel, createCrestModel, createHerbModel } from '../../src/models/horror_models.js';

void NavGrid;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } };
const say = (m) => console.log('ok  ', m);

const boxes = []; const removed = [];
const physics = { addStaticBox(x, y, z, hx, hy, hz, rot, member, data) { const h = { x, y, z, hx, hy, hz, data }; boxes.push(h); return h; }, removeCollider(h) { removed.push(h); } };
const lightsAdded = new Set();
const lightPool = { add(e) { lightsAdded.add(e); return e; }, remove(e) { lightsAdded.delete(e); } };

// ---------------------------------------------------------------- pockets
for (const [i, kind] of Object.keys(MAPS.POCKET_SPECS).entries()) {
  const spec = MAPS.POCKET_SPECS[kind];
  const { ox, oz } = pocketOrigin(i);
  const b0 = boxes.length;
  const pk = buildPocket(spec, { physics, lightPool, ox, oz, y: -300, seed: 1234 + i });
  ok(pk.group.children.length > 0 && boxes.length - b0 > 20, `${kind}: geometry + colliders built (${boxes.length - b0} boxes)`);
  ok(pk.contains(new THREE.Vector3(ox + 5, -299, oz + 5)) && !pk.contains(new THREE.Vector3(0, -299, 0)), `${kind}: contains()`);
  ok(lightsAdded.size > 0, `${kind}: lamps registered in the light pool`);
  // creature nav: from the tile in front of the closet to every creature / loot spot (ground floor)
  const e = pk.entry(), front = pk.tile(spec.entry.x + spec.entry.fx, spec.entry.z + spec.entry.fz);
  const spots = [...pk.spots.zombie, ...pk.spots.warden, ...pk.spots.ammo];
  for (const s of spots) { const path = pk.nav.findPath(front.x, front.z, s.x, s.z); ok(path && path.length > 0, `${kind}: nav path entry -> spot (${s.tx},${s.tz})`); }
  ok(!pk.nav.walkableAt(pk.tile(spec.entry.x, spec.entry.z).x, pk.tile(spec.entry.x, spec.entry.z).z), `${kind}: creatures never walk into the closet alcove`);
  if (kind === 'outbreak') {
    const tw = pk.spots.typewriter;
    ok(pk.spots.zombie.length === MAPS.countChars(spec.map, 'z'), 'outbreak: shambler spots');
    ok(pk.spots.pistol.length === 1 && pk.spots.ammo.length === 1 && pk.spots.herb.length >= 3 && tw && pk.spots.box, 'outbreak: sidearm, ammo, herbs, typewriter, item box');
    let inSafe = 0; for (let tx = 1; tx <= 7; tx++) for (let tz = 2; tz <= 7; tz++) { const p2 = pk.tile(tx, tz); if (pk.nav.walkableAt(p2.x, p2.z)) inSafe++; }
    ok(inSafe === 0, 'outbreak: the safe room is not walkable for creatures');
    ok(pk.spots.loot.length >= 6, 'outbreak: loot spots');
  }
  if (kind === 'mansion') {
    ok(pk.spots.secret.length === 3 && pk.spots.chest.length >= 4 && pk.spots.warden.length >= 3, 'mansion: secret doors, chests, wardens');
    const before = boxes.length, s0 = pk.spots.secret[0];
    pk.setSecretOpen(0, true);
    ok(s0.open && removed.includes(s0.col === null ? removed[removed.length - 1] : s0.col) && s0.col === null, 'mansion: secret door collider removed when opened');
    pk.update(2); ok(Math.abs(s0.obj.position.x - s0.x) + Math.abs(s0.obj.position.z - s0.z) > 1, 'mansion: bookcase slid aside');
    void before;
    ok(pk.upperY > -300 + spec.H, 'mansion: upper floor above the ground ceiling');
    ok(pk.spots.loot.some((l) => l.upper) && pk.spots.loot.some((l) => !l.upper), 'mansion: loot on both floors');
  }
  const nL = lightsAdded.size;
  pk.dispose();
  ok(lightsAdded.size < nL, `${kind}: lamps removed on dispose`);
}
say('pockets: built (' + boxes.length + ' colliders), nav paths to every spot, safe room, secret doors, dispose');

// ---------------------------------------------------------------- closets + portals
{
  const L = generateLayout(4242, 'factory', 1.6, null);
  let plan = null;
  for (let s = 1; s < 60 && !(plan && plan.closets.length >= 2); s++) plan = C.planFacility(generateLayout(s * 977, 'factory', 2.0, null), { day: 3 });
  ok(plan.closets.length >= 1, 'found a plan with closets');
  void L;
  const Lx = generateLayout(1, 'factory', 2.0, null);
  for (const kind of Object.keys(MAPS.POCKET_SPECS)) {
    const cell = { x: 10, z: 10, d: 1 };
    const fr = C.closetFrame(Lx, cell);
    const view = buildCloset(fr, { style: kind === 'outbreak' ? 'quarantine' : 'plain', physics, wide: kind === 'mansion' });
    ok(view.group.children.length > 6 && !view.isOpen, `${kind} closet built, closed`);
    view.update(0.1, 0);
    view.setOpen(true); for (let i = 0; i < 40; i++) view.update(0.05, i * 0.05);
    ok(view.isOpen && view.state.open === 1, 'closet opens');
    view.setOpen(false); for (let i = 0; i < 40; i++) view.update(0.05, i * 0.05);
    ok(!view.isOpen && view.state.open === 0, 'closet closes again');
    view.dispose();
    // portal maths: A -> B -> A returns to the start; direction of travel maps onto the other closet's facing
    const spec = MAPS.POCKET_SPECS[kind], { ox, oz } = pocketOrigin(0);
    const pk = buildPocket(spec, { physics, lightPool, ox, oz, y: Lx.y, seed: 1 });
    const A = fr, B = pk.entry();
    for (const lat of [-0.6, 0, 0.5]) for (const lz of [0.3, 0.6]) {
      const p = { x: toWorld(A, lat, lz).x, y: A.y + 0.1, z: toWorld(A, lat, lz).z };
      const m = portalMap(A, B, MAPS.TILE, p);
      const lb = toLocal(B, m.x, m.z);
      ok(lb.lz >= MAPS.TILE - 0.05 && lb.lz <= MAPS.TILE + 0.7 && Math.abs(lb.lx) <= 0.72 + 1e-6, `${kind}: A -> B lands just outside the door plane (lz ${lb.lz.toFixed(2)}, lx ${lb.lx.toFixed(2)})`);
      ok(Math.abs(m.y - (B.y + 0.1)) < 1e-9, 'height above the floor preserved');
      // walking straight into the closet (against A's facing) leaves walking out along B's facing
      const v = m.vel(-A.fx * 3, -A.fz * 3);
      ok(Math.abs(v[0] - B.fx * 3) < 1e-9 && Math.abs(v[1] - B.fz * 3) < 1e-9, `${kind}: velocity turns into the pocket's facing`);
      // a player stepping back into the alcove and out again returns to the same place (within the clamp)
      const back = portalMap(B, A, C.CLOSET.d, { x: toWorld(B, lb.lx, 0.7 - (lb.lz - MAPS.TILE)).x, y: m.y, z: toWorld(B, lb.lx, 0.7 - (lb.lz - MAPS.TILE)).z });
      const la = toLocal(A, back.x, back.z);
      ok(la.lz >= C.CLOSET.d - 0.05 && la.lz <= C.CLOSET.d + 0.7, `${kind}: B -> A lands in front of the closet door`);
    }
    pk.dispose();
  }
  say('closets: build / open / close / dispose, portal maths (position, height, velocity, round trip)');
}

// ---------------------------------------------------------------- trap visuals through the whole state timeline
{
  for (const type of C.TRAP_IDS) {
    const zone = { cx: 0, cz: 0, axis: 'x', len: 8, wid: 3.7, y: -300 };
    const v = new TrapView({ id: 1, type, axis: 'x' }, zone, 3.3, { x: 0, y: -298.7, z: 2, nx: 0, nz: -1 }, 5);
    ok(v.group.children.length > 0, `${type} trap view built`);
    const T = C.TRAPS[type];
    for (const st of ['idle', 'armed', 'tele', 'strike', 'cool', 'spent']) {
      v.setState(st, 2, 30, T.price);
      for (let i = 0; i < 12; i++) v.update(T.strike / 12, new THREE.Vector3(2, -299, 0));
    }
    if (type === 'laser') { v.setState('strike', 1, 0); v.update(0.9, null); ok(v.parts.wall.visible && v.parts.wall.position.x > -4 && v.parts.wall.position.x < 4, 'laser wall sweeps through the zone'); }
    if (type === 'crusher') { v.setState('strike', 1, 0); v.update(0.3, null); ok(v.parts.slab.position.y < 1, 'crusher slab is down'); v.setState('armed', 1, 10); v.update(0.1, null); ok(v.parts.slab.position.y > 2.9, 'crusher slab is up while armed'); }
    v.dispose();
  }
  say('traps: 5 visuals survive every state');
}

// ---------------------------------------------------------------- chalk view
{
  const scene = new THREE.Scene();
  const cv = new ChalkView(scene);
  for (let i = 0; i < 60; i++) cv.add(C.decodeMark(C.encodeMark({ id: i + 1, o: i % 6, k: i % 2, x: i * 0.3, y: -300, z: 1, n: 2, r: i % 32, f: i % 7 === 0 ? 1 : 0, v: i % 4 })));
  ok(cv.count() === 60, 'chalk view holds 60 marks');
  const total = cv.sets.reduce((n, s) => n + s.mesh.count, 0);
  ok(total === 60, 'instance counts add up');
  cv.remove(5); cv.remove(7); cv.remove(999);
  ok(cv.count() === 58 && cv.sets.reduce((n, s) => n + s.mesh.count, 0) === 58, 'marks can be rubbed out (swap-remove keeps the pool dense)');
  const m = new THREE.Matrix4(); const near = cv.marks.get(20);
  cv.setFor(near).mesh.getMatrixAt(cv.setFor(near).ids.indexOf(20), m);
  const pos = new THREE.Vector3().setFromMatrixPosition(m);
  ok(Math.abs(pos.x - near.x) < 0.02 && Math.abs(pos.y - (near.y + 0.014)) < 1e-3, 'instance matrix sits on the mark');
  ok(cv.nearest(6, -300, 1, 1)?.id != null, 'nearest lookup');
  cv.clear(); ok(cv.count() === 0, 'clear');
  cv.dispose();
  say('chalk view: instanced pools add / remove / clear');
}

// ---------------------------------------------------------------- models
{
  for (const [n, fn] of Object.entries({ shambler: createShamblerModel, forger: createForgerModel, ambusher: createAmbusherModel, warden: createWardenModel })) {
    const m = fn({ seed: 3 });
    for (const st of ['idle', 'walk', 'run', 'attack', 'grab', 'scratch', 'flee', 'stir', 'burst', 'lurk', 'stunned', 'dead']) for (let i = 0; i < 3; i++) m.update(0.05, { state: st, t: i * 0.2, time: i });
    m.setHitFlash(0.5); m.setElite(true); m.setTint(0xff0000, true);
    ok(m.root.children.length >= 3 && m.height > 1.5, `${n} model animates every state`);
    m.dispose();
  }
  for (const fn of [createChalkModel, createCrestModel, createHerbModel]) ok(fn().children.length >= 2, 'item model');
  say('models: 4 creatures x 12 states, 3 items');
}

// ---------------------------------------------------------------- creature AI on a fake manager
{
  registerHorrorCreatures();
  ok(['hr_zombie', 'hr_forger', 'hr_ambusher', 'hr_warden'].every((id) => CREATURES[id]?.behavior && CREATURES[id].custom), 'creatures registered with behaviours');
  const log = { hurt: [], hold: [], sounds: 0, noise: 0 };
  const game = { time: 0, hostHoldPlayer: (id, p) => log.hold.push(id), hostSlowPlayer() {}, hostStunPlayer() {}, aiPlayerById: () => null, creatures: null };
  const mk = (type, x, z, o = {}) => {
    const def = CREATURES[type];
    const c = { id: 'c' + Math.random(), type, def, pos: new THREE.Vector3(x, -300, z), yaw: 0, state: o.state || 'idle', t: 0, data: { ...(o.data || {}) }, hp: def.hp, maxHp: def.hp, dmg: def.dmg, cooldown: 0, stunT: 0, age: 5, target: null, path: null, dest: null, level: 1, dead: false, attackers: new Map() };
    c.setState = (s) => { if (s !== c.state) { c.state = s; c.t = 0; } };
    return c;
  };
  const player = (id, x, z) => ({ id, pos: new THREE.Vector3(x, -300, z), eye: new THREE.Vector3(x, -298.4, z), look: new THREE.Vector3(0, 0, -1), dead: false, crouch: false, zone: 'in', inShip: false });
  const M = {
    game, host: new Map(), noises: [], players: [],
    playersFor() { return this.players; }, canSee: (c, p, r) => Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < r, hear: () => null,
    follow(c, dt, speed) { const p = c.path?.[0]; if (!p) return true; const d = Math.hypot(p.x - c.pos.x, p.z - c.pos.z); if (d < 0.2) { c.path.shift(); return !c.path.length; } c.pos.x += (p.x - c.pos.x) / d * speed * dt; c.pos.z += (p.z - c.pos.z) / d * speed * dt; return false; },
    goTo(c, x, z) { c.path = [{ x, z }]; c.dest = { x, z }; }, goToLazy(c, x, z) { this.goTo(c, x, z); }, moveToward(c, t, dt, sp) { this.goTo(c, t.x, t.z); return this.follow(c, dt, sp); },
    wander(c) { this.goTo(c, c.pos.x + 2, c.pos.z); }, placeAt(c, x, z) { c.pos.x = x; c.pos.z = z; },
    attack(c, p, dmg, cause) { log.hurt.push({ id: p.id, dmg, cause }); }, sound() { log.sounds++; }, noise() { log.noise++; },
    nearest(c, list) { let b = null, bd = 1e9; for (const p of list) { const d = p.pos.distanceTo(c.pos); if (d < bd) { bd = d; b = p; } } return b ? { p: b, d: bd } : null; },
    isLookedAt: () => false, speedMul: (c, s) => s,
  };
  game.creatures = M;
  const step = (c, n, dt = 0.05) => { for (let i = 0; i < n; i++) { c.t += dt; c.cooldown = Math.max(0, c.cooldown - dt); game.time += dt; CREATURES[c.type].behavior(c, dt, M); } };
  // Shambler: sees a player, walks up, grabs (hold + gnaw ticks), lets go after grabSec, or when hit hard enough
  {
    const z = mk('hr_zombie', 0, 0), p = player('p1', 6, 0);
    M.players = [p]; M.host.set(z.id, z);
    step(z, 4);
    ok(z.state === 'run' && z.target === 'p1', 'shambler notices the player and shambles after them');
    const v0 = z.pos.x; step(z, 20);
    ok(z.pos.x > v0 && z.pos.x - v0 < 3, `shambler is slow (${(z.pos.x - v0).toFixed(1)} m in 1 s)`);
    p.pos.set(z.pos.x + 0.9, -300, z.pos.z); step(z, 3);
    ok(z.state === 'grab' && log.hurt.length >= 1 && log.hurt[0].cause === 'hr_zombie' && log.hold.length >= 1, 'shambler grabs: hold + first bite');
    const n0 = log.hurt.length; step(z, 30);
    ok(log.hurt.length > n0, 'gnaw ticks while held');
    let held = 0; z.state = 'grab'; z.data.grab = { t: 0, tick: 0.8, hold: 0, hp0: z.hp }; while (z.state === 'grab' && held < 100) { step(z, 1); held++; }
    ok(held * 0.05 >= C.ZOMBIE.grabSec - 0.1 && held * 0.05 <= C.ZOMBIE.grabSec + 0.2, `a grab lasts ${(held * 0.05).toFixed(2)} s (grabSec ${C.ZOMBIE.grabSec})`);
    // a solid hit shoves it off immediately
    const z2 = mk('hr_zombie', 0, 0), p2 = player('p2', 0.8, 0); M.players = [p2]; z2.target = 'p2'; z2.state = 'run'; step(z2, 3);
    ok(z2.state === 'grab', 'second zombie grabs');
    z2.hp -= z2.maxHp * 0.25; step(z2, 2);
    ok(z2.state === 'stunned' || z2.state === 'idle', 'a real hit breaks the grab');
    // pack alert: a neighbour joins in
    const a = mk('hr_zombie', 0, 0), b = mk('hr_zombie', 3, 0), pp = player('p3', 7, 0); M.players = [pp]; M.host.clear(); M.host.set(a.id, a); M.host.set(b.id, b);
    step(a, 3); ok(b.state === 'run', 'the pack alerts its neighbours');
  }
  // Ambusher: lurks until the door is worked; hand open = immediate lethal lunge (999), knock = non-lethal
  {
    HOOKS.fakeDoor = () => ({ x: 0, z: 1.4, fx: 0, fz: 1 });
    let opened = 0; HOOKS.fakeOpened = () => { opened++; };
    const a = mk('hr_ambusher', 0, 0.7, { state: 'lurk', data: { closet: 100 } }), p = player('p1', 0, 2.0);
    M.players = [p]; log.hurt.length = 0;
    step(a, 20); ok(a.state === 'lurk' && !log.hurt.length, 'the Closet Thing waits inside');
    a.data.op = { mode: 'open', by: 'p1', lunge: C.FAKE.handLunge, lethal: true };
    step(a, 6); ok(a.state === 'burst' && opened === 1, 'opening by hand: burst at once');
    step(a, 6); ok(log.hurt.some((h) => h.dmg === 999 && h.cause === 'hr_ambusher'), 'opening by hand while standing in front is lethal');
    step(a, 20); ok(a.state === 'run' || a.state === 'attack', 'afterwards it hunts');
    const b = mk('hr_ambusher', 0, 0.7, { state: 'lurk', data: { closet: 100 } }); log.hurt.length = 0; opened = 0;
    b.data.op = { mode: 'knock', by: 'p1', lunge: C.FAKE.knockAnswer, lethal: false };
    step(b, 4); ok(b.state === 'stir' && opened === 0, 'knock: it stirs (scratching), the door stays shut until it bursts');
    step(b, 40); ok(['burst', 'run', 'attack'].includes(b.state) && opened === 1, 'then it bursts out (door flies open) and hunts');
    ok(!log.hurt.some((h) => h.dmg === 999), 'a knock never produces the lethal lunge');
  }
  // Forger: walks to a chalk arrow, scratches, forges through the hook; bolts when looked at
  {
    const store = new C.ChalkStore(); store.add({ o: 0, k: 0, x: 8, y: -300, z: 0, n: 2, r: 4, f: 0, v: 0 }, 1);
    HOOKS.chalk = () => store; let forged = 0; HOOKS.forge = (c, job) => { forged++; return null; };
    const f = mk('hr_forger', 0, 0); M.players = [player('p1', 40, 40)]; step(f, 1); f.data.next = 0.1;
    step(f, 8); ok(f.state === 'walk' && f.data.job, 'the Forger heads for the nearest arrow');
    step(f, 200, 0.1); ok(forged === 1 && log.sounds > 0, 'it scratches (audible) and then forges once');
    const f2 = mk('hr_forger', 0, 0); M.players = [player('p2', 3, 0)]; M.isLookedAt = () => true; step(f2, 2);
    ok(f2.state === 'flee', 'looked at: it runs'); M.isLookedAt = () => false;
  }
  // Warden: chases like any chaser
  {
    const w = mk('hr_warden', 0, 0), p = player('p1', 5, 0); M.players = [p]; step(w, 8);
    ok(w.state === 'run' || w.state === 'attack', 'the warden hunts what it sees');
    ok(typeof BEHAVIORS.scuttler === 'function', 'base behaviours are untouched');
  }
  say('creature AI: shambler grab / break / pack alert, closet thing lurk / lunge / knock, forger scratch + forge + flee, warden');
}

console.log(fails ? `\n${fails} FAILED of ${checks} checks` : `\nall ${checks} checks passed`);
process.exit(fails ? 1 : 0);
