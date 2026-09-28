// wave1 / balance: body for  node tools/harness/headless.mjs --script tools/harness/wave1_balance.js --shot out.png
// Returns: per-quota creature multipliers, the real scale path on a spawned creature (hp / speed cap / hit cap),
// the ship door with a player standing in the doorway (OLD logic reproduced, then the fix), host door requests,
// and the Threat meter over a simulated 5 minute stay (real host frames). Ends in the moon phase at threat 62 for the screenshot.
const g = kefal.game, B = g.balance, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const r1 = (v) => Math.round(v * 100) / 100;
const out = { api: Object.fromEntries(['threat', 'lootLuck', 'scale', 'noise', 'level'].map((k) => [k, typeof B?.[k]])) };
const core = await import('/src/game/balance_core.js');
const shipMod = await import('/src/world/ship.js');

// ---- 1. per-quota multipliers through the live API (orbit -> threat 0) and at threat 60 (pure formulas)
out.quota = {};
const q0 = g.run.quotaIndex;
for (const q of [0, 1, 2, 3, 4, 6, 8, 12]) {
  g.run.quotaIndex = q;
  const s = B.scale(), t60 = core.scaleFor(q, 60);
  out.quota['q' + q] = { hp: r1(s.hp), dmg: r1(s.dmg), speed: r1(s.speed), spawn: r1(s.spawn), detect: r1(s.detect), 'dmg@T60': r1(t60.dmg), 'spawn@T60': r1(t60.spawn), luck: r1(B.lootLuck()), hitCap: core.earlyRules(q).hitCap, speedCap: B.speedCap() };
}
g.run.quotaIndex = q0;

// ---- 2. ship door with a player standing in the doorway
const door = g.ship.door, phys = g.physics, P = g.player;
const NEW_UPDATE = door.update;
const inDoorwayPos = () => new THREE.Vector3(2.6, 0.05, 3.65);
const settle = async (n = 40) => { for (let i = 0; i < n; i += 10) { kefal.tick(10, 1 / 60, false); await new Promise((r) => setTimeout(r, 0)); } };
const wipeCollider = () => { if (door.collider) { phys.removeCollider(door.collider); door.collider = null; } };
const walk = async (vz, frames = 30) => {   // push the player along z for `frames` and return how far it got
  for (let i = 0; i < 6; i++) kefal.tick(1, 1 / 60, false);   // (let a fresh teleport land first)
  const z0 = P.pos.z;
  for (let i = 0; i < frames; i++) { P.vel.set(0, P.vel.y, vz); kefal.tick(1, 1 / 60, false); }
  return r1(P.pos.z - z0);
};
out.door = {};
try {
  P.godMode = true; g.godMode = true;
  door.setOpen(true, true); await settle(10);
  out.door.startOpen = { t: door.t, collider: !!door.collider };
  P.teleport(new THREE.Vector3(0, 0.05, 0)); await settle(10);
  out.door.controlWalkInShip = { towardOutsideZ: await walk(3, 30), towardInsideZ: await walk(-3, 30) };   // free walking reference (~1 m per 30 frames)
  // OLD logic (git 126a220): collider at t < 0.6 on the way down, no check for anybody standing there
  door.update = function (dt) {
    const target = this.open ? 1 : 0;
    this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt * 1.6);
    this.leaf.position.x = 2.6 + this.t * 2.3;
    const shouldBlock = this.t < 0.6;
    if (shouldBlock && !this.collider) this.collider = phys.addStaticBox(2.6, 1.3, 3.65, 1.1, 1.3, 0.15, 0, 0x40, { kind: 'shipdoor' });
    if (!shouldBlock && this.collider) { phys.removeCollider(this.collider); this.collider = null; }
  };
  P.teleport(inDoorwayPos()); await settle(10);
  door.setOpen(false); await settle(40);
  const p = P.pos;
  out.door.OLD = {
    t: r1(door.t), colliderOnPlayer: !!door.collider && Math.abs(p.z - 3.65) < 0.5 && Math.abs(p.x - 2.6) < 1.4,
    playerPos: [r1(p.x), r1(p.y), r1(p.z)],
    walkedIntoShip: await walk(-3, 30), walkedOutside: await walk(3, 30),
    leafOpenWhenBlocking: 'collider is created at t<0.6 = leaf still ' + Math.round(0.6 * 100) + '% open',
  };
  // NEW logic
  door.update = NEW_UPDATE; wipeCollider(); door.t = 1; door.setOpen(true); await settle(10);
  P.teleport(inDoorwayPos()); await settle(10);
  door.setOpen(false); await settle(60);
  out.door.NEW_inDoorway = { t: r1(door.t), collider: !!door.collider, blocked: door.blocked, label: door.label('moon'), walkedIntoShip: await walk(-3, 30) };
  P.teleport(new THREE.Vector3(0, 0.05, 0)); await settle(80);
  out.door.NEW_afterStepAway = { t: r1(door.t), collider: !!door.collider, blocked: door.blocked, label: door.label('moon') };
  door.setOpen(true); await settle(60);
  out.door.NEW_reopened = { t: r1(door.t), collider: !!door.collider };
  // closed door with a capsule already inside it (teleport / late state): pushed out to the nearer side
  door.setOpen(false, true); await settle(20);
  P.teleport(new THREE.Vector3(2.6, 0.05, 3.62)); await settle(60);
  out.door.NEW_pushOut = { closed: !!door.collider, playerZ: r1(P.pos.z), outsideDoorPlane: P.pos.z > 3.5 };
  P.teleport(new THREE.Vector3(0, 0.05, 0)); await settle(20);
  out.door.doorwayCountsAsAboard = { onSill: shipMod.inDoorway({ x: 2.6, y: 0.05, z: 3.65 }), outside6m: shipMod.inDoorway({ x: 2.6, y: 0, z: 9 }) };
} catch (e) { out.door.error = String(e.stack || e).slice(0, 400); }
door.update = NEW_UPDATE;

// ---- 3. land on the first moon, check the scale path on a real creature
let sec = 'land';
try {
  g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.run.quotaIndex = 0; P.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  for (let i = 0; i < 20; i++) { kefal.tick(10, 1 / 30, false); await new Promise((r) => setTimeout(r, 10)); }
  out.phase = g.run.phase; out.theme = g.world.facility?.layout?.theme;
  // host door request handling: state-set semantics + duplicate requests dropped
  sec = 'doorRequests';
  let doorMsgs = 0; const onDoor0 = g.onDoor.bind(g); g.onDoor = (d) => { if (d.id === 'ship') doorMsgs++; return onDoor0(d); };
  door.setOpen(true, true); await settle(10);
  g.net.request('shipdoor', { open: true }); g.net.request('shipdoor', { open: true });   // already open: dropped
  g.net.request('shipdoor', { open: false }); g.net.request('shipdoor', { open: true }); g.net.request('shipdoor', { open: false });   // race: last one wins
  await settle(70);
  out.doorRequests = { finalOpen: door.open, finalT: r1(door.t), broadcasts: doorMsgs, expected: 'closed, 3 broadcasts (false,true,false)' };
  g.onDoor = onDoor0;
  door.setOpen(true, true);
  sec = 'creature';
  const fac = g.world.facility, s = fac.scrapSpots[2];
  P.teleport(new THREE.Vector3(s.x, s.y + 0.2, s.z)); kefal.tick(30, 1 / 30, false);
  const pos = new THREE.Vector3(s.x + 6, s.y, s.z);
  const cr = g.creatures.hostSpawn('crawler', pos, { level: 1, zone: 'in', variant: null, affix: null });
  const lk = g.creatures.hostSpawn('lurker', pos.clone().add(new THREE.Vector3(2, 0, 0)), { level: 1, zone: 'in', variant: null, affix: null });
  const hurts = [];
  const send0 = g.net.sendTo.bind(g.net); g.net.sendTo = (to, type, d) => { if (type === 'hurt') { hurts.push(d.dmg); return; } return send0(to, type, d); };
  g.hostHurtPlayer(g.selfId, cr.dmg, 'crawler', cr.id, cr.pos);
  g.hostHurtPlayer(g.selfId, 999, 'lurker', lk.id, lk.pos);
  g.hostHurtPlayer(g.selfId, 999, 'left');                 // not a creature: never scaled
  g.net.sendTo = send0;
  out.creature = {
    crawlerMaxHp: cr.maxHp, crawlerBaseHp: 160, crawlerRunSpeed: r1(g.creatures.speedMul(cr, cr.def.run)), crawlerBaseRun: cr.def.run,
    crawlerHitTaken: hurts[0], crawlerHitBase: cr.dmg, lurkerHitTaken: hurts[1], lurkerHitBase: 999, leftBehindHit: hurts[2],
  };
  g.creatures.hostRemove(cr.id); g.creatures.hostRemove(lk.id);

  // ---- 4. threat over a simulated 5 minute stay (real host frames, godMode so the crew survives whatever spawns)
  sec = 'threat';
  B.reset();
  const trace = [{ t: 0, T: B.threat() }];
  const dt = 0.2;
  for (let step = 1; step <= 10; step++) {
    for (let i = 0; i < 30; i++) { kefal.tick(5, dt, false); }
    trace.push({ t: step * 30, T: r1(B.threat()), lv: B.level().id, spawnMul: r1(B.scale().spawn) });
    if (step % 2 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  out.stay5min = { trace, creaturesAlive: g.creatures.host.size, debug: (({ base, spike, insideT, parts, ctx }) => ({ base: r1(base), spike: r1(spike), insideT: r1(insideT), parts, ctx }))(B.debug()) };
  // noise events feed the meter: a shotgun blast (loud 3) and an explosion (4)
  const before = B.threat(); B.noise(P.pos, 3); B.noise(P.pos, 4); kefal.tick(4, 0.25, false);
  out.noiseEvents = { before: r1(before), after: r1(B.threat()) };
  // ---- 5. leave the meter at HUNTED for the screenshot
  B.set(62); g.godMode = true;
  for (let i = 0; i < 6; i++) kefal.tick(5, 1 / 30, true);
  const hud = document.querySelector('.tfg-threat');
  out.hud = hud ? { visible: !hud.classList.contains('off'), name: hud.querySelector('.tt-name')?.textContent, val: hud.querySelector('.tt-val')?.textContent, level: B.level().id, classes: hud.className } : null;
  out.finalScale = (({ hp, dmg, speed, spawn, detect, pace, hunt }) => ({ hp: r1(hp), dmg: r1(dmg), speed: r1(speed), spawn: r1(spawn), detect: r1(detect), pace: r1(pace), hunt: r1(hunt) }))(B.scale());
  out.lootLuck = r1(B.lootLuck());
} catch (e) { out.error = sec + ': ' + String(e.stack || e).slice(0, 500); }
out.errs = errs;
return out;
