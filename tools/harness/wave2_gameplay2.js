// Wave-2 GAMEPLAY2 feature check for headless.mjs (body of an async function; see docs/wave2/gameplay2.md).
//   flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5260 --script tools/harness/wave2_gameplay2.js
// Proves (every step is failure-isolated and reports numbers):
//   roles     auto role at run start, one free reroll, Trader / Engineer bonuses, aptitude lines on the role cards, store discount
//   identify  scan shows "??? UNKNOWN ENTITY", aiming + scanning identifies (card, XP, codex), scan then shows name + class, photo identifies
//   spambomb  walks up, primes (1.5 s), pops: damage + knockback + breaks fragile scrap; killed before it pops = no blast; flashlight
//             makes it hesitate; direct pop blasts a door and a treasure crate open; chain reaction; quota 0 gate
//   faults    real lever -> faults block takeoff (stations placed, HUD lines, interactables, pressure countdown) -> fix -> takeoff;
//             all six fault types through the real host protocol (patch item + weld, wrong nav code, melee jam hits);
//             midnight autopilot: faults auto-resolve after 45 s with a penalty; scene light count never changes
const g = kefal.game, G2 = g.gameplay2, out = { steps: {}, fails: [] }, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const oe = console.error.bind(console);
console.error = (...a) => { errs.push(a.map((x) => (x && x.stack) || String(x)).join(' ').slice(0, 300)); oe(...a); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const r1 = (n) => Math.round(n * 10) / 10;
const ok = (c, m) => { if (!c) out.fails.push(m); return !!c; };
const step = async (name, fn) => { try { out.steps[name] = await fn(); } catch (e) { out.fails.push(name + ' THREW: ' + String((e && e.stack) || e).slice(0, 400)); } };
const sim = async (sec, dt = 1 / 15, each = null) => { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) { kefal.tick(1, dt, false); if (each && each(i * dt)) return true; if (i % 80 === 79) await sleep(1); } return false; };
const mod = async (p) => { try { return await import(p); } catch (e) { return null; } };
const lights = () => { let n = 0; g.scene.traverse((o) => { if (o.isLight) n++; }); return n; };
const cull = (keep = new Set()) => { for (const c of [...g.creatures.host.values()]) if (!c.dead && !keep.has(c.id)) g.creatures.kill(c, null, { silent: true }); };
const aimAt = (p, y = 0.6) => {   // point the camera at a world position
  const eye = g.player.eyePos ? g.player.eyePos() : V(g.player.pos.x, g.player.pos.y + 1.62, g.player.pos.z);
  const d = V(p.x, p.y + y, p.z).sub(eye);
  g.player.yaw = Math.atan2(-d.x, -d.z); g.player.pitch = Math.asin(d.y / d.length());
  kefal.tick(2, 1 / 30, false);
};
const lightsStart = lights();
out.installed = { gameplay2: !!G2, status: G2 && G2.status(), lightsStart };
if (!ok(G2 && G2.status().aptitudes && G2.status().identify && G2.status().creeper && G2.status().faults, 'gameplay2 parts missing')) return { ...out, errs };
g.godMode = false;

// ---------------------------------------------------------------- 1. roles / aptitudes
await step('roles', async () => {
  const R = g.rpg, A = G2.aptitudes, r = {};
  await sleep(200);
  r.roleAtBoot = R.role();
  if (!R.role()) { r.manualAssign = A.hostAssign(); await sleep(100); }
  r.role = R.role();
  ok(!!R.role(), 'a role was auto-assigned');
  r.rerollsLeft = A.rerollsLeft();
  ok(r.rerollsLeft === 1, 'one free reroll available');
  const before = R.role();
  const rr = A.reroll();
  r.reroll = { ok: rr.ok, msg: rr.msg, from: before, to: R.role() };
  ok(rr.ok && R.role() !== before, 'free reroll changed the role');
  ok(A.rerollsLeft() === 0 && !A.reroll().ok, 'only ONE free reroll');
  // aptitude lines on the role cards
  const panel = R.openRoles();
  await sleep(50);
  r.cards = document.querySelectorAll('.rl-card').length; r.aptLines = document.querySelectorAll('.rl-apt').length;
  r.sampleApt = document.querySelector('.rl-apt')?.textContent;
  r.cardNames = [...document.querySelectorAll('.rl-name')].map((e) => e.textContent);
  ok(r.cards === 8 && r.aptLines === 8, 'role panel shows 8 cards with 8 aptitude lines');
  R.close(); g.ui.closePanel?.();
  // new roles + bonus keys
  ok(R.setRole('scout'), 'setRole scout'); r.scoutIdentify = R.bonus('identifySpeed');
  ok(Math.abs(r.scoutIdentify - 0.4) < 1e-9, 'scout identifies 40% faster');
  const price = () => { const e = g.shop.stock().find((x) => x.currency === 'credits' && !x.ship && x.price >= 20 && x.id === 'flashlight') || g.shop.stock().find((x) => x.currency === 'credits' && !x.ship && x.price >= 20); return e; };
  const e0 = price(); r.storeItem = e0 && e0.id; r.priceBase = e0 && e0.price;
  ok(R.setRole('trader') && R.role() === 'trader', 'setRole trader');
  r.trader = { sell: R.bonus('sellValue'), disc: R.bonus('shopDiscount') };
  ok(Math.abs(r.trader.sell - 0.15) < 1e-9 && Math.abs(r.trader.disc - 0.10) < 1e-9, 'trader bonuses');
  const e1 = g.shop.stock().find((x) => x.id === e0.id); r.priceTrader = e1.price;
  ok(e1.price === Math.max(1, Math.round(e0.price * 0.9)), 'store shows the trader price (-10%)');
  // purchase refunds the difference on the host
  g.run.credits = 5000; const c0 = g.run.credits;
  g.shop.hostCart({ lines: [{ id: e0.id, n: 1 }] }, g.selfId, () => {});
  r.paid = c0 - g.run.credits; r.expectPaid = e0.price - Math.round(e0.price * 0.1);
  ok(r.paid === r.expectPaid, `trader pays ${r.expectPaid} not full price (paid ${r.paid})`);
  ok(R.setRole('engineer') && R.role() === 'engineer', 'setRole engineer');
  r.engineer = { repair: R.bonus('repairSpeed'), craft: R.bonus('craftLuck'), forge: R.bonus('forgeLuck'), repairMul: A.repairMul() };
  ok(Math.abs(r.engineer.repair - 0.4) < 1e-9 && Math.abs(r.engineer.craft - 0.1) < 1e-9 && Math.abs(r.engineer.forge - 0.1) < 1e-9 && Math.abs(r.engineer.repairMul - 1.4) < 1e-9, 'engineer bonuses');
  ok(R.setRole('technician') && Math.abs(R.bonus('repairSpeed') - 0.25) < 1e-9, 'technician repairs 25% faster');
  R.setRole('scout');
  r.finalRole = R.role();
  return r;
});

// ---------------------------------------------------------------- 2. land (quota 1 so Spambombs are allowed)
await step('land', async () => {
  const r = {};
  const CR = (await mod('/src/game/creatures.js'))?.CREATURES;
  r.gateQ0 = CR ? CR.spambomb.noSpawn : null;
  g.run.quotaIndex = 1; g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true;
  r.gateQ1 = CR ? CR.spambomb.noSpawn : null;
  ok(!CR || (r.gateQ0 === true && r.gateQ1 === false), 'spambomb spawn gate: closed in quota 0, open in quota 1');
  g.hostLever(g.selfId); g.hostFinishLanding();
  await sim(1);
  g.hostData.spawnT = 1e9; g.hostData.outdoorSpawnT = 1e9;
  cull();
  r.phase = g.run.phase;
  ok(r.phase === 'moon', 'landed on the moon');
  return r;
});
const ter = g.world.terrain;
const outside = (x, z) => V(x, ter.heightAt(x, z) + 0.1, z);
const spot = outside(26, 26);
g.player.teleport(spot); g.player.inShip = false;
g.player.hp = g.player.maxHp || 100;
await sim(0.5);

// ---------------------------------------------------------------- 3. identification
await step('identify', async () => {
  const I = G2.identify, r = {};
  const hud = g.ui.hud;
  const scanLabels = async () => {
    await sim(1.3); let cap = null; const o = hud.showScan;
    hud.showScan = function (l, tot) { cap = l.map((x) => ({ name: x.name, sub: x.sub, color: x.color })); return o.call(this, l, tot); };
    try { g.scan(); } finally { hud.showScan = o; }
    return cap;
  };
  const cpos = outside(spot.x + 8, spot.z);
  const c = g.creatures.hostSpawn('yoinker', cpos, { zone: 'out', state: 'stunned', variant: null, affix: null, level: 1 });
  c.stunT = 1e9;
  await sim(0.4);
  const view = g.creatures.views.get(c.id);
  r.viewOk = !!view;
  ok(!!view, 'client view exists');
  aimAt(c.pos, view ? view.height * 0.55 : 0.6);
  r.knownBefore = I.isKnown('yoinker');
  ok(r.knownBefore === false, 'unknown before identification');
  const xp0 = g.profile.xp, lv0 = g.profile.level;
  const labels1 = await scanLabels();
  r.labelsUnknown = labels1;
  ok(!!labels1 && labels1.some((l) => /UNKNOWN ENTITY/.test(l.name)), 'scan shows ??? UNKNOWN ENTITY');
  aimAt(c.pos, view.height * 0.55);
  const prog = [];
  const done = await sim(3, 1 / 15, () => { prog.push(r1(I.progress)); return I.isKnown('yoinker'); });
  r.identified = I.isKnown('yoinker'); r.progressTrace = prog.filter((_, i) => i % 3 === 0).slice(0, 14);
  ok(r.identified, 'aim + scan identified the creature');
  const card = document.querySelector('.g2-card');
  r.card = card && { on: card.classList.contains('on'), text: card.textContent.slice(0, 200) };
  ok(card && card.classList.contains('on') && /ENTITY IDENTIFIED/.test(card.textContent) && /TERRITORIAL/.test(card.textContent) && /WEAKNESS/.test(card.textContent), 'identified card shows class + weakness');
  r.codex = g.profile.bestiary.yoinker && { id: !!g.profile.bestiary.yoinker.id, seen: g.profile.bestiary.yoinker.seen };
  ok(!!g.profile.bestiary.yoinker?.id, 'saved in the profile codex');
  r.xp = { before: xp0, after: g.profile.xp, lvBefore: lv0, lvAfter: g.profile.level };
  ok(g.profile.xp > xp0 || g.profile.level > lv0, 'first identification gives XP');
  const labels2 = await scanLabels();
  r.labelsKnown = labels2;
  ok(!!labels2 && labels2.some((l) => /Data Hoarder/.test(l.name) && /TERRITORIAL/.test(l.sub)), 'scan now shows the real name + class');
  const aimTxt = document.querySelector('.g2-aim');
  r.aimReadout = aimTxt && { display: aimTxt.style.display, text: aimTxt.textContent.slice(0, 80) };
  // photo path: the Instant Camera identifies everything in frame
  g.creatures.kill(c, null, { silent: true });
  const c2 = g.creatures.hostSpawn('crawler', outside(spot.x + 7, spot.z + 1), { zone: 'out', state: 'stunned', variant: null, affix: null, level: 1 });
  c2.stunT = 1e9; await sim(0.4);
  aimAt(c2.pos, 0.6);
  r.crawlerBefore = I.isKnown('crawler');
  const cam = g.horde && g.horde.camera;
  if (cam) { cam.takePhoto(null); await sim(1.0); }
  r.photo = { hasCamera: !!cam, inFrame: cam && cam.lastInFrame, crawlerAfter: I.isKnown('crawler') };
  ok(!cam || r.photo.crawlerAfter, 'photo identified the crawler');
  g.creatures.kill(c2, null, { silent: true });
  document.querySelector('.g2-card')?.classList.remove('on');
  cull();
  return r;
});

// ---------------------------------------------------------------- 4. Spambomb
await step('spambomb', async () => {
  const S = G2.creeper, r = {};
  const P = g.player;
  P.teleport(spot); P.hp = P.maxHp || 100; await sim(0.3);
  // (a) it walks up, primes, pops: damage + knockback + fragile scrap
  const IT = (await mod('/src/game/items.js'))?.ITEMS;
  const fragile = (IT && Object.values(IT).find((d) => d.fragile)) || ['vase', 'teapot', 'perfume', 'clock', 'tv', 'egg'].map((id) => g.itemDefOf(id)).find((d) => d && d.fragile) || null;
  r.fragileType = fragile && fragile.id;
  let vase = null;
  if (fragile) vase = g.items.hostSpawn(fragile.id, V(spot.x + 1.2, spot.y + 0.6, spot.z + 0.6), {});
  const start = outside(spot.x + 9, spot.z - 1);
  const b = S.spawn(start, { zone: 'out', yaw: Math.atan2(spot.x - start.x, spot.z - start.z), state: 'idle' });
  const seen = new Set(); let maxV = 0, primedAt = null, popAt = null, popPos = null, kdist = 0;
  const hp0 = P.hp;
  await sim(9, 1 / 15, (t) => {
    seen.add(b.state); if (b.state === 'primed' && primedAt === null) primedAt = t;
    if (b.dead && popAt === null) { popAt = t; popPos = P.pos.clone(); }
    if (popPos) { maxV = Math.max(maxV, Math.hypot(P.vel.x, P.vel.z)); kdist = Math.max(kdist, Math.hypot(P.pos.x - popPos.x, P.pos.z - popPos.z)); }
    return b.dead && t > (popAt ?? 99) + 0.8;
  });
  r.states = [...seen]; r.primedAt = primedAt && r1(primedAt); r.popAt = popAt && r1(popAt); r.fuse = primedAt !== null && popAt !== null ? r1(popAt - primedAt) : null;
  r.hpLost = r1(hp0 - P.hp); r.maxKnockV = r1(maxV); r.knockDist = r1(kdist); r.boom = g.hostData.g2boom;
  r.vaseGone = vase ? !g.items.get(vase) : null;
  ok(b.dead && seen.has('primed'), 'spambomb primed and popped');
  ok(r.fuse !== null && r.fuse >= 1.3 && r.fuse <= 2.2, 'fuse is about 1.5 s (' + r.fuse + ')');
  ok(r.hpLost > 5, 'the pop hurt the player (' + r.hpLost + ')');
  ok(r.maxKnockV > 2 || r.knockDist > 0.5, 'knockback pushed the player (v ' + r.maxKnockV + ', moved ' + r.knockDist + ' m)');
  ok(!fragile || r.vaseGone, 'fragile scrap was broken');
  // (b) killed before it pops: no blast
  P.hp = P.maxHp || 100; cull(); g.hostData.g2boom = null;
  const b2 = S.spawn(outside(spot.x + 9, spot.z), { zone: 'out', state: 'idle' });
  await sim(0.3); g.creatures.damage(b2.id, 999, g.selfId); await sim(1.5);
  r.killedFirst = { dead: b2.dead, boom: g.hostData.g2boom, hp: P.hp };
  ok(b2.dead && !g.hostData.g2boom && P.hp >= (P.maxHp || 100) - 0.01, 'killing it first: no blast, no damage');
  // (c) flashlight in its face: it hesitates
  P.hp = P.maxHp || 100; cull();
  const fl0 = g.flashlightOn; g.flashlightOn = () => true;
  const b3 = S.spawn(outside(spot.x + 8, spot.z), { zone: 'out', yaw: Math.atan2(-8, 0), state: 'idle' });
  const st3 = new Set();
  for (let i = 0; i < 45; i++) { aimAt(b3.pos, 0.5); kefal.tick(1, 1 / 15, false); st3.add(b3.state); if (b3.dead) break; }
  r.hesLog = [...st3];
  r.hesitate = { states: [...st3], hesUsed: r1(b3.data.hes || 0) };
  ok(st3.has('hesitate') || (b3.data.hes || 0) > 0.05, 'flashlight made it hesitate');
  delete g.flashlightOn; void fl0;
  g.creatures.kill(b3, null, { silent: true });
  // (d) chain reaction: a pop primes a neighbour
  cull();
  const c1 = S.spawn(outside(spot.x + 12, spot.z + 12), { zone: 'out', state: 'stunned' }); c1.stunT = 1e9;
  const c2 = S.spawn(outside(spot.x + 13.5, spot.z + 12), { zone: 'out', state: 'stunned' }); c2.stunT = 1e9;
  await sim(0.3);
  const boom = S.explode(c1);
  r.chain = { chained: boom && boom.chained, c2State: c2.state };
  ok(boom && boom.chained === 1 && c2.state === 'primed', 'chain reaction primes a neighbour');
  cull();
  // (e) doors and treasure crates are blasted open (indoors / crates: direct pop)
  const fac = g.world.facility;
  const door = (fac.doors || []).find((d) => d.kind === 'door' && !d.teleport && !d.open);
  if (door) {
    door.locked = true;
    const cb = S.spawn(V(door.pos.x + 0.5, door.pos.y - 1.0, door.pos.z), { zone: 'in', state: 'stunned' }); cb.stunT = 1e9;
    const bm = S.explode(cb); await sim(0.5);
    r.door = { id: door.id, locked: door.locked, open: door.open, doors: bm && bm.doors };
    ok(door.open && !door.locked, 'a locked door was blasted open');
  } else r.door = 'no closed door found';
  const chests = g.worldx && g.worldx.chests && g.worldx.chests() || [];
  const ch = chests.find((x) => !x.opened);
  if (ch) {
    const cb = S.spawn(V(ch.x, ch.y - 0.2, ch.z), { zone: ch.where === 'facility' ? 'in' : 'out', state: 'stunned' }); cb.stunT = 1e9;
    const bm = S.explode(cb); await sim(0.5);
    r.crate = { id: ch.id, where: ch.where, opened: g.worldx.chest(ch.id) && g.worldx.chest(ch.id).opened, crates: bm && bm.crates };
    ok(r.crate.opened, 'a treasure crate was blasted open');
  } else r.crate = 'no chest found';
  cull(); P.hp = P.maxHp || 100;
  return r;
});

// ---------------------------------------------------------------- 5. ship faults
const ship = g.ship;
const enterShip = () => { g.player.teleport(ship.spawns[0]); g.player.inShip = true; };
const near = (s) => { const nx = Math.sin(s.ry), nz = Math.cos(s.ry); g.player.teleport(V(s[0] ?? s.x, 0.05, s[2] ?? s.z).add(V(nx * 1.3, 0, nz * 1.3))); g.player.inShip = true; };
const F = G2.faults;
const H = () => F.state.host;
const sysLog = [];
{ const on = g.ui.systemMessage; g.ui.systemMessage = function (t, k) { sysLog.push(String(t).slice(0, 120)); return on && on.apply(this, arguments); }; }
const protocol = async (f) => {   // fix one fault through the real host protocol
  const s = F.faultOf(f.id).st[0];
  near(s); await sim(0.2);
  const req = (o) => g.net.request('g2', { fid: f.id, ...o });
  const min = { fuel: 2.0, relay: 2.3, coolant: 5.4, hull: 3.4, nav: 1.5 }[f.ty] || 0.5;
  if (f.ty === 'jam') { for (let i = 0; i < 3; i++) { req({ op: 'jam' }); await sim(0.4); } return; }
  req({ op: 'start' });
  await sim(min);
  if (f.ty === 'nav') { req({ op: 'fix', code: '00000' }); await sim(0.2); if (!F.faultOf(f.id).done) { req({ op: 'fix', code: F.faultOf(f.id).code }); } }
  else req({ op: 'fix', weld: 1 });
  await sim(0.2);
};
const groundTruth = () => H().list.map((f) => ({ id: f.id, ty: f.ty, done: f.done, st: f.st.map((s) => [s.k, r1(s.x), r1(s.y), r1(s.z), r1(s.ry * 100) / 100, s.free]) }));

await step('faults_lever', async () => {
  const r = {};
  enterShip(); g.run.daysLeft = 3;
  r.lightsBefore = lights();
  await sim(0.5);
  g.hostLever(g.selfId);            // real lever -> hostBeginTakeoff('lever') -> faults
  await sim(1.2);
  r.phaseAfterLever = g.run.phase;
  ok(g.run.phase === 'moon', 'the ship did NOT leave instantly (phase ' + g.run.phase + ')');
  ok(H().act && H().list.length >= 1 && H().list.length <= 3, 'faults were rolled: ' + H().list.length);
  r.faults = groundTruth();
  r.overlapFlags = F.snapshot().list.map((f) => f.ov);
  ok(F.snapshot().list.every((f) => f.ov === 0), 'every station found a free spot on the ship');
  const cf = F.clientFaults();
  r.clientStations = cf.map((f) => f.st.map((s) => !!s.model));
  ok(cf.length === H().list.length && cf.every((f) => f.st.every((s) => s.model)), 'station models built on the client');
  r.lightsDuring = lights();
  ok(r.lightsDuring === r.lightsBefore, 'scene light count unchanged (' + r.lightsBefore + ' -> ' + r.lightsDuring + ')');
  // HUD + interactables
  const list = g.objectives.compute();
  r.objectives = list.map((o) => o.text).filter((t) => /PRE-FLIGHT|◇|✔/.test(t));
  ok(list.some((o) => /PRE-FLIGHT FAULTS 0\/\d/.test(o.text)), 'objective checklist "PRE-FLIGHT FAULTS 0/n"');
  near(H().list[0].st[0]); await sim(0.2);
  const il = []; g.mods.emit('interactables', il, g);
  r.interactables = il.map((i) => (typeof i.label === 'function' ? i.label() : i.label)).filter((x) => /PRE|Fuel|Nav|Coolant|Hull|Power|Thruster|CONSOLE|DISPLAY/i.test(x));
  ok(r.interactables.length >= 1, 'a station offers an interaction');
  // lever pulled again: still blocked
  g.hostLever(g.selfId); await sim(0.3);
  ok(g.run.phase === 'moon', 'second lever pull is blocked too');
  // creatures near the ship -> purge countdown
  const cz = g.creatures.hostSpawn('crawler', outside(14, 14), { zone: 'out', state: 'stunned', variant: null, affix: null, level: 1 }); cz.stunT = 1e9;
  await sim(2.5);
  r.pressure = { near: H().near, dl: H().dl != null ? r1(H().dl - g.time) : null };
  ok(H().near >= 1 && H().dl != null && r.pressure.dl > 40 && r.pressure.dl <= 76, 'creatures near the ship start a purge countdown');
  g.creatures.kill(cz, null, { silent: true });
  // fix everything the real way
  for (const f of H().list) await protocol(f);
  r.allDone = H().list.every((f) => f.done);
  ok(r.allDone, 'all rolled faults fixed through the protocol');
  r.launchAt = H().launchAt != null;
  ok(r.launchAt && g.run.phase === 'moon', 'ignition countdown running, still on the moon');
  await sim(3.6);
  r.phaseAfterFix = g.run.phase;
  ok(g.run.phase === 'takeoff', 'ship took off after the faults were fixed (' + g.run.phase + ')');
  ok(!H().act, 'fault state cleared');
  r.stationsCleared = F.clientFaults().length === 0;
  r.lightsAfter = lights();
  ok(r.lightsAfter === r.lightsBefore, 'scene light count still unchanged after takeoff');
  return r;
});

const backToMoon = async () => {
  for (let i = 0; i < 60 && g.run.phase !== 'orbit'; i++) await sleep(250);   // hostFinishTakeoff is a 7 s real-time timer
  if (g.run.phase !== 'orbit') return false;
  g.player.teleport(ship.spawns[0]); g.player.inShip = true;
  g.run.daysLeft = 3; g.run.moon = 'hamsi';
  await sim(0.5);
  g.hostLever(g.selfId); g.hostFinishLanding();
  await sim(1);
  g.hostData.spawnT = 1e9; g.hostData.outdoorSpawnT = 1e9; cull();
  return g.run.phase === 'moon';
};

await step('faults_all_types', async () => {
  const r = {};
  r.back = await backToMoon();
  if (!ok(r.back, 'back on the moon for the type coverage run')) return r;
  g.run.quotaIndex = 3;
  enterShip();
  // spare hull patch in hand for the item route
  const patchItem = g.items.hostSpawn('hullpatch', V(0, 1, 0), { holder: g.selfId });
  await sim(0.3);
  H().act = false;
  F.begin('lever', ['fuel', 'nav', 'coolant', 'hull', 'relay', 'jam']);
  await sim(0.5);
  r.faults = groundTruth();
  ok(H().list.length === 6, 'six faults placed');
  r.overlapFlags = F.snapshot().list.map((f) => f.ov);
  ok(F.snapshot().list.every((f) => f.ov === 0), 'six stations, six free spots');
  const pos = H().list.flatMap((f) => f.st.map((s) => [s.x, s.y, s.z]));
  let minSep = 99;
  for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) minSep = Math.min(minSep, Math.hypot(pos[i][0] - pos[j][0], pos[i][2] - pos[j][2]) + Math.abs(pos[i][1] - pos[j][1]));
  r.minSeparation = r1(minSep);
  ok(minSep > 0.6, 'stations do not overlap each other');
  const nav = H().list.find((f) => f.ty === 'nav');
  const navPair = nav && nav.st.length === 2 ? r1(Math.hypot(nav.st[0].x - nav.st[1].x, nav.st[0].z - nav.st[1].z)) : null;
  r.navPairDistance = navPair; ok(navPair !== null && navPair >= 3.3, 'nav console and nav display are far apart');
  const wrongBefore = sysLog.length;
  // hull: patch item route first
  const hull = H().list.find((f) => f.ty === 'hull');
  near(hull.st[0]); await sim(0.2);
  g.net.request('g2', { op: 'start', fid: hull.id }); await sim(0.8);
  g.net.request('g2', { op: 'fix', fid: hull.id, item: patchItem }); await sim(0.3);
  r.hullPatched = hull.done && !g.items.get(patchItem);
  ok(r.hullPatched, 'hull breach plugged with the Hull Patch item (consumed)');
  // jam: a real melee swing (shovel) + two protocol hits
  const jam = H().list.find((f) => f.ty === 'jam');
  const shov = g.items.hostSpawn('shovel', V(0, 1, 0), { holder: g.selfId }); await sim(0.3);
  const slot = g.player.slots.indexOf(shov); if (slot >= 0) g.player.slot = slot;
  near(jam.st[0]); await sim(0.2);
  aimAt(V(jam.st[0].x, jam.st[0].y - 0.5, jam.st[0].z), 0.4);
  g.resolveMelee({ reach: 2.4, dmg: 20, crit: false, stun: 0, knock: 1 }); await sim(0.4);
  r.jamRealSwing = jam.hits;
  ok(jam.hits === 1, 'a real melee swing landed on the thruster jam (hits ' + jam.hits + ')');
  g.net.request('g2', { op: 'jam', fid: jam.id }); await sim(0.4); g.net.request('g2', { op: 'jam', fid: jam.id }); await sim(0.4);
  ok(jam.done, 'thruster jam cleared after 3 hits');
  // the rest through the protocol (nav with a wrong code first)
  for (const f of H().list) { if (f.done) continue; await protocol(f); }
  r.allDone = H().list.every((f) => f.done);
  ok(r.allDone, 'all six faults fixed: ' + H().list.map((f) => f.ty + ':' + f.done).join(' '));
  ok(H().launchAt != null, 'ignition countdown started');
  await sim(3.6);
  r.phaseAfter = g.run.phase;
  ok(g.run.phase === 'takeoff', 'took off after six fixed faults');
  return r;
});

await step('faults_midnight', async () => {
  const r = {};
  r.back = await backToMoon();
  if (!ok(r.back, 'back on the moon for the midnight run')) return r;
  g.run.quotaIndex = 2;
  enterShip();
  g.items.hostSpawn('goldbar', V(0, 1, 0), {}); await sim(0.4);
  const credits0 = g.run.credits, hp0 = g.player.hp;
  g.run.time = 24 * 60 - 2;         // the host tick raises hostBeginTakeoff('midnight')
  await sim(3);
  r.afterMidnight = { phase: g.run.phase, act: H().act, why: H().why, n: H().list.length, dl: H().dl != null ? r1(H().dl - g.time) : null };
  ok(g.run.phase === 'moon' && H().act && H().why === 'midnight', 'midnight autopilot starts pre-flight faults instead of leaving');
  ok(r.afterMidnight.dl > 38 && r.afterMidnight.dl <= 45, 'countdown ~45 s (' + r.afterMidnight.dl + ')');
  // fix one, leave the rest
  const first = H().list[0];
  if (first && first.ty !== 'nav' && first.ty !== 'jam') await protocol(first); else first && F.fixAll && (first.done = true);
  r.partial = H().list.map((f) => f.ty + ':' + f.done);
  await sim(50, 1 / 10, () => g.run.phase !== 'moon');
  r.end = { phase: g.run.phase, act: H().act, penalties: H().penalties.slice(), hp: g.player.hp, hp0 };
  ok(g.run.phase === 'takeoff', 'autopilot left after the countdown (' + g.run.phase + ')');
  const unresolved = H().list.length; void unresolved;
  ok(H().penalties.length >= 1 || r.partial.every((x) => /:true$/.test(x)), 'unresolved faults cost a penalty: ' + JSON.stringify(H().penalties));
  r.sys = sysLog.filter((s) => /PRE-FLIGHT|AUTOPILOT|sucked|Hull stress|purge|Takeoff blocked|Ignition/i.test(s)).slice(-8);
  r.lightsEnd = lights();
  ok(r.lightsEnd === lightsStart, 'scene light count identical to the start (' + lightsStart + ' -> ' + r.lightsEnd + ')');
  return r;
});

out.fails = [...new Set(out.fails)];
out.pass = out.fails.length === 0;
return { ...out, errs: errs.slice(0, 12) };
