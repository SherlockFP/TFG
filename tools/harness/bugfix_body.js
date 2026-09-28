// Wave-2 bugfix: BODY CARRYING check (body for headless.mjs, host path). Returns { ok, failed, checks, info, errs, toasts }.
//   flock /tmp/tfg-browser.lock timeout 580 node tools/harness/headless.mjs --port 5253 --script tools/harness/bugfix_body.js
// Checks: pick up a body (2-handed slot item), ONE body only (client refusal + host refusal), bag refuses bodies,
// slower walk + no sprint, the body goes through the entrance / fire exit and back out (and a grab-beamed big item follows
// the player through doors too), drop / throw, fine reduction with the body aboard, death of the carrier, late-join rows.
const g = kefal.game, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (n = 3, render = false) => { kefal.tick(n, 1 / 30, render); await wait(12); };
const checks = {}, info = { steps: {} };
const ok = (k, v) => { checks[k] = !!v; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const p = g.player;
const step = async (name, fn) => { try { await fn(); info.steps[name] = 'done'; } catch (e) { info.steps[name] = 'THREW ' + String(e.stack || e.message).slice(0, 300); ok(name + ' ran', false); } };
const land = async (moon) => {
  g.run.daysLeft = 3; g.run.moon = moon; g.run.credits = 1000; p.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  for (let i = 0; i < 20; i++) await tick(10);
};
const bodyItems = () => [...g.items.all()].filter((it) => it.type === 'body');
const toasts = [];
const oldToast = g.ui.toast.bind(g.ui); g.ui.toast = (m, k) => { toasts.push(String(m)); return oldToast(m, k); };
const keys = new Set(); const origDown = g.input.isDown.bind(g.input);
g.input.isDown = (a) => keys.has(a) || origDown(a);
let out, fac, spawnOut, exitYaw, B1, hold;
const freeSlot = () => p.slots.findIndex((s) => !s);
const putAt = (it, pos) => { it.obj.position.copy(pos); it.body?.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true); it.body?.setLinvel({ x: 0, y: 0, z: 0 }, true); };

await land('hamsi');
out = g.world.outdoor; fac = g.world.facility; spawnOut = out.mainExit.spawn.clone(); exitYaw = out.mainExit.yaw;
p.teleport(spawnOut.clone(), exitYaw); await tick(3);
ok('landed', g.run.phase === 'moon' && !!fac && !!out);

// ---- 1) pick up: 2-handed hotbar item, selected, carried by us
await step('pickup', async () => {
  const b1 = g.items.hostSpawn('body', p.pos.clone().add(V(0, 0.6, -1.2)), { value: 0, label: 'Alice' });
  const b2 = g.items.hostSpawn('body', p.pos.clone().add(V(0, 0.6, -2.4)), { value: 0, label: 'Bob' }); await tick(6);
  B1 = g.items.get(b1); const B2 = g.items.get(b2); hold = B1;
  ok('bodies spawned', !!B1 && !!B2 && B1.state === 'world' && !!B1.body);
  g.pickup(B1); await tick(6);
  ok('body held by me', B1.holder === g.selfId && B1.state === 'held' && p.slots.includes(b1) && p.heldItem() === B1);
  ok('carriesBody()', p.carriesBody() && g.carriedBody() === B1);
  // ---- 2) ONE body only
  toasts.length = 0;
  g.pickup(B2); await tick(6);
  ok('second body refused (client)', B2.state === 'world' && B2.holder !== g.selfId && toasts.some((m) => /ONE body|BİR ceset/.test(m)));
  // host side: a raw 'pick' request for a second body must be refused as well (hacked / laggy client)
  const fs = freeSlot(); info.freeSlot = fs;
  B2.setHeld(g.selfId); p.slots[fs] = b2;   // fake a predicted pick the way a client does
  g.net.request('pick', { id: b2, slot: fs }); await tick(6);
  ok('second body refused (host)', B2.state === 'world' && !p.slots.includes(b2) && B1.holder === g.selfId && p.slots.includes(b1));
  // bag / inventory must not stash bodies
  ok('bag refuses held body', g.inventory?.addToBag?.(b1) === false && !B1.inv);
  ok('bag refuses world body', g.inventory?.addToBag?.(b2) === false && B2.state === 'world');
});

// ---- 3) slowdown + no sprint (walk straight ahead outdoors, distance per SIMULATED second)
const speedOf = async (withKeys) => {
  p.teleport(spawnOut.clone(), exitYaw); p.stamina = p.maxStamina; p.exhausted = false; await tick(4);
  for (const k of withKeys) keys.add(k);
  await tick(12); const a = p.pos.clone(), t0 = g.time; await tick(30);
  const d = p.pos.distanceTo(a), dt = g.time - t0, sprinting = p.sprinting;
  keys.clear(); await tick(4);
  return { v: +(d / Math.max(dt, 1e-3)).toFixed(2), sprinting };
};
await step('speed', async () => {
  const walkBody = await speedOf(['forward']), sprintBody = await speedOf(['forward', 'sprint']);
  g.dropHeld(false); await tick(6);
  info.afterDrop = { state: hold.state, holder: hold.holder, body: !!hold.body, slots: [...p.slots] };
  const walkFree = await speedOf(['forward']), sprintFree = await speedOf(['forward', 'sprint']);
  info.speeds = { walkBody, sprintBody, walkFree, sprintFree };
  ok('body slows walking (<70%)', walkBody.v < walkFree.v * 0.7 && walkBody.v > 1.5);
  ok('body: no sprint', !sprintBody.sprinting && sprintBody.v <= walkBody.v * 1.1 && sprintFree.sprinting && sprintFree.v > walkFree.v * 1.3);
  ok('dropped body is a world item again', hold.state === 'world' && !!hold.body && !p.slots.includes(hold.id));
});

// ---- 4) through the entrance / fire exit and back out, body in hands
await step('doors', async () => {
  p.teleport(spawnOut.clone(), exitYaw); await tick(3);
  putAt(hold, p.pos.clone().add(V(0, 0.6, -1.0))); await tick(3);
  g.pickup(hold); await tick(6);
  ok('picked again', hold.holder === g.selfId && p.carriesBody());
  g.useExit(0, true); await tick(6);
  ok('entered facility with the body', p.indoor && p.pos.y < -200 && hold.holder === g.selfId && p.slots.includes(hold.id) && p.carriesBody());
  info.indoorY = +p.pos.y.toFixed(1);
  g.useExit(0, false); await tick(6);
  ok('came back OUT with the body', !p.indoor && p.pos.y > -50 && hold.holder === g.selfId && p.slots.includes(hold.id));
  if (out.fireExits?.length && fac.fireDoors?.length) {
    g.useExit(1, true); await tick(4); const inn = p.indoor;
    g.useExit(1, false); await tick(4);
    ok('fire exit round trip with the body', inn && !p.indoor && hold.holder === g.selfId && p.slots.includes(hold.id));
  } else info.noFireExit = true;
});

// ---- 6) grab beam (big scrap / Sell Bodies carcasses) follows the player through a door
await step('beam', async () => {
  g.dropHeld(false); await tick(4);
  p.teleport(spawnOut.clone(), exitYaw); await tick(3);
  const bigId = g.items.hostSpawn('server', p.pos.clone().add(V(0, 0.8, -1.8)), { value: 100 }); await tick(6);
  const BIG = g.items.get(bigId);
  g.grab.start(BIG); await tick(10);
  ok('beam grabbed (owner = me)', g.grab.item === BIG && BIG.owner === g.selfId);
  g.useExit(0, true); await tick(6);
  const dIn = BIG.obj.position.distanceTo(p.pos);
  ok('beamed big item came through the door', g.grab.item === BIG && dIn < 4 && BIG.obj.position.y < -200);
  g.useExit(0, false); await tick(6);
  const dOut = BIG.obj.position.distanceTo(p.pos);
  ok('and back out', g.grab.item === BIG && dOut < 4 && BIG.obj.position.y > -50);
  info.beamDist = { in: +dIn.toFixed(2), out: +dOut.toFixed(2) };
  g.grab.stop(); await tick(6);
  // a body can no longer be beamed (host refuses)
  const bb = g.items.get(g.items.hostSpawn('body', p.pos.clone().add(V(0, 0.6, -1.5)), { value: 0, label: 'Zed' })); await tick(4);
  g.net.request('grab', { id: bb.id }); await tick(4);
  ok('host refuses to beam a body', !bb.owner);
});

// ---- 7) throw / drop and death of the carrier
await step('drop-death', async () => {
  p.teleport(spawnOut.clone(), exitYaw); p.dead = false; await tick(3);
  const C = g.items.get(g.items.hostSpawn('body', p.pos.clone().add(V(0, 0.6, -1.2)), { value: 0, label: 'Carol' })); await tick(6);
  g.pickup(C); await tick(6);
  ok('Carol held', C.holder === g.selfId && p.slots.includes(C.id));
  g.dropHeld(true); await tick(1);   // "throw" must be a plain drop
  const v = C.body?.linvel(); const spd = v ? Math.hypot(v.x, v.y, v.z) : -1;
  info.throwSpeed = +spd.toFixed(2);
  ok('throw = gentle drop (body)', C.state === 'world' && spd >= 0 && spd < 3.5 && !p.slots.includes(C.id));
  await tick(20);
  g.pickup(C); await tick(6);
  const nBefore = bodyItems().length;
  g.die('test'); await tick(8);
  ok('carrier died: body dropped, not lost', C.state === 'world' && !p.slots.includes(C.id) && g.items.get(C.id) === C);
  ok('carrier died: own body spawned too', bodyItems().length === nBefore + 1);
  p.dead = false; p.hp = p.maxHp;
});

// ---- 8) late join: rows a joining peer receives while somebody carries a body
await step('late-join', async () => {
  p.teleport(spawnOut.clone(), exitYaw); await tick(3);
  const D = g.items.get(g.items.hostSpawn('body', p.pos.clone().add(V(0, 0.6, -1.2)), { value: 0, label: 'Dave' })); await tick(6);
  g.pickup(D); await tick(6);
  const ser = g.items.serialize().find((e) => e.id === D.id);
  info.serialized = { h: ser?.h, ty: ser?.ty, lb: ser?.lb };
  ok('welcome data: body held by the carrier', ser?.h === g.selfId && ser?.ty === 'body' && ser?.lb === 'Dave');
  const before = g.items.items.size;
  g.items.onEvent({ e: 'sp', ...ser, h: 'peer-x', id: 'late1' });   // what a joining client builds when somebody else carries it
  const L = g.items.get('late1');
  ok('late joiner item is held (no physics body)', !!L && L.state === 'held' && L.holder === 'peer-x' && !L.body);
  g.items.onEvent({ e: 'rm', id: 'late1' });
  ok('late item cleanup', g.items.items.size === before);
  g.dropHeld(false); await tick(4);
});

// ---- 5) fine reduction: a body carried into the ship counts as delivered (last: ends the day twice)
await step('fine', async () => {
  const name = 'Alice';
  const finish = async (carry) => {
    g.run.credits = 1000;
    g.hostData.dayStats.deaths.length = 0; g.hostData.dayStats.deaths.push({ id: 'ghost', name, cause: 'test' });
    for (const it of bodyItems()) if (it.label === name && it !== hold) g.net.broadcast('it', { e: 'rm', id: it.id });
    if (carry) {
      if (hold.holder !== g.selfId) { putAt(hold, p.pos.clone().add(V(0, 0.6, -1.0))); await tick(3); g.pickup(hold); await tick(6); }
    } else {
      if (hold.holder === g.selfId) { g.dropHeld(false); await tick(6); }
      putAt(hold, V(60, 1, 60)); await tick(3);
    }
    p.teleport(V(0, 0.2, 0), Math.PI / 2); p.inShip = true; await tick(4);
    info.carryState = { carry, holder: hold.holder, inShip: p.inShip };
    g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); await tick(5);
    return 1000 - g.run.credits;
  };
  p.teleport(spawnOut.clone(), exitYaw); await tick(3);
  const fineAboard = await finish(true);
  ok('bodies removed at takeoff', bodyItems().length === 0);
  await land('hamsi');
  const nb = g.items.get(g.items.hostSpawn('body', V(60, 1, 60), { value: 0, label: name })); hold = nb; await tick(4);
  const fineLeft = await finish(false);
  info.fines = { bodyAboard: fineAboard, bodyLeftBehind: fineLeft };
  ok('fine with the body aboard is smaller (5% vs 15%)', fineAboard > 0 && fineAboard < fineLeft && fineAboard === 50 && fineLeft === 150);
});

await tick(4, true);
const okAll = Object.values(checks).every(Boolean) && Object.values(info.steps).every((s) => s === 'done');
return { ok: okAll, failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), checks, info, errs, toasts: toasts.slice(-6) };
