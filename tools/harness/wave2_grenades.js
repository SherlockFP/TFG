// Wave 2 grenades feature check (body for tools/harness/headless.mjs --script):
//   flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5265 --script tools/harness/wave2_grenades.js
// Host-only run: throw path + stack, flashbang stun / blind / lose-target, smoke sight block, decoy noise, sticky damage, gravity pull,
// blackout light factor, confetti dance, glitch freeze + burst, cluster split, rare chest drop.
const g = kefal.game, errs = []; addEventListener('error', (e) => errs.push(e.message));
const out = {}, wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (n = 10, dt = 1 / 30) => { kefal.tick(n, dt, false); await wait(5); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const section = async (name, fn) => { if (g.player.dead) { out.diedBefore = name; g.player.dead = false; } g.player.hp = g.player.maxHp; g.player.stunT = 0; try { out[name] = await fn(); } catch (e) { out[name] = { error: String(e && e.stack || e).slice(0, 400) }; } };

g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 20; i++) await tick();
const s0 = g.world.facility.scrapSpots[2];
g.player.teleport(V(s0.x, s0.y + 0.2, s0.z)); await tick(15);
const GR = g.grenades;
out.installed = !!GR;
if (!GR) { out.errs = errs; return out; }

// ---- free direction: the longest clear horizontal ray from the eye
const eye = () => g.player.eyePos();
let best = { d: 0, yaw: 0 };
for (let k = 0; k < 16; k++) {
  const yaw = (k / 16) * Math.PI * 2, dir = V(-Math.sin(yaw), 0, -Math.cos(yaw));
  const h = g.physics.raycast(eye().addScaledVector(dir, 0.7), dir, 30);   // start outside the player's own capsule
  const d = h ? h.distance + 0.7 : 30;
  if (d > best.d) best = { d, yaw };
}
g.player.yaw = best.yaw; g.player.pitch = 0;
const dir = V(-Math.sin(best.yaw), 0, -Math.cos(best.yaw));
const at = (dist, up = 0) => g.player.pos.clone().addScaledVector(dir, Math.min(dist, best.d - 1)).add(V(0, up, 0));
out.free = +best.d.toFixed(1);
const clearAll = async () => { for (const c of [...g.creatures.host.values()]) g.creatures.hostRemove(c.id); await tick(2); };
const mk = async (type, dist) => { const c = g.creatures.hostSpawn(type, at(dist), { state: 'idle' }); c.age = 9; await tick(3); return c; };
const give = async (type) => { const id = g.items.hostSpawn(type, g.player.pos.clone().add(V(0, 1, 0)), { holder: g.selfId }); await tick(6); const it = g.items.get(id); const i = g.player.slots.indexOf(id); if (i >= 0) g.switchSlot(i); await tick(3); return it; };

await section('items', async () => Object.fromEntries(['flashbang', 'smokegrenade', 'decoybeacon', 'stickycharge', 'bomb_gravity', 'bomb_blackout', 'bomb_confetti', 'bomb_glitch', 'bomb_cluster', 'stungrenade', 'craft_cryo'].map((id) => { const d = g.itemDefOf(id); return [id, { kind: d.grenade, stack: d.charges ?? 1, price: d.price ?? null }]; })));

await section('throwPath', async () => {
  const it = await give('flashbang');
  const before = it.charges;
  g.useHeldPress(); const cooking = !!GR.cook.it;      // LMB press starts the cook (aim) instead of a melee swing
  GR.cook.it = null; GR.cook.kind = null;
  const ok = GR.throwHeld(0.6); await tick(3, 0.1);
  const s1 = GR.stats();
  await tick(25, 0.1);
  const s2 = GR.stats();
  const cry = await give('craft_cryo'); g.useHeldPress(); const cryoCook = GR.cook.kind; GR.cook.it = null;
  return { cooking, ok, stackBefore: before, stackAfter: it.charges, ballsInFlight: s1.balls, ballsAfter: s2.balls, cryoCook };
});

await section('flash', async () => {
  await clearAll();
  const c = await mk('scuttler', 7);
  c.target = g.selfId; c.setState('run'); c.lostT = 0;
  g.engine.fx.flash = 0;
  GR.spawn('flash', at(6.2, 1.0), V(0, 0, 0), g.selfId, 0.25);
  await tick(5, 0.1);
  return { stunT: +c.stunT.toFixed(2), blind: +(c.grBlindT || 0).toFixed(2), target: c.target, state: c.state, screenFlash: +g.engine.fx.flash.toFixed(2), playerStun: +g.player.stunT.toFixed(2) };
});

await section('smoke', async () => {
  await clearAll(); g.player.stunT = 0;
  const far = Math.min(12, best.d - 1.5), mid = far * 0.5;
  const c = await mk('scuttler', far);
  const p = g.aiPlayers().find((q) => q.id === g.selfId);
  const seen0 = g.creatures.canSee(c, p, 40, 360);
  GR.spawn('smoke', at(mid, 0.3), V(0, 0, 0), g.selfId, 0.3);
  await tick(25, 0.1);
  const start = c.pos.clone();
  c.stunT = 0; c.target = g.selfId; c.setState('run'); c.lostT = 0;
  const seen1 = g.creatures.canSee(c, g.aiPlayers().find((q) => q.id === g.selfId), 40, 360);
  for (let i = 0; i < 10; i++) { g.creatures.placeAt(c, start.x, start.z); await tick(1, 0.1); }
  return { far: +far.toFixed(1), seenBefore: seen0, seenThroughSmoke: seen1, lostT: +(c.lostT || 0).toFixed(2), stats: GR.stats() };
});

await section('decoy', async () => {
  await clearAll();
  GR.spawn('decoy', at(4, 0.3), V(0, 0, 0), g.selfId, 0.2);
  await tick(20, 0.1);
  const zoneOn = GR.stats().zones.includes('decoy'), noises = g.creatures.noises.length;
  await tick(100, 0.1);
  return { zoneOn, noisesWhileActive: noises, zoneGone: !GR.stats().zones.includes('decoy') };
});

await section('sticky', async () => {
  await clearAll();
  const c = await mk('crawler', 6); const hp0 = c.hp;
  GR.spawn('sticky', c.pos.clone().add(V(0.25, 0.6, 0)), V(0, 0, 0), g.selfId);
  await tick(8, 0.1);
  const stuck = [...GR.balls.values()].some((b) => b.cid === c.id);
  await tick(35, 0.1);
  return { hp0, hp: c.hp, dead: c.dead, stuck };
});

await section('gravity', async () => {
  await clearAll();
  const c = await mk('scuttler', 6.5); const d0 = c.pos.distanceTo(at(3.5));
  const bolt = g.items.hostSpawn('bolt', at(5.5, 1), {}); await tick(20);
  const it = g.items.get(bolt); const b0 = it.obj.position.clone();
  GR.spawn('gravity', at(3.5, 0.2), V(0, 0, 0), g.selfId, 0.2);
  await tick(15, 0.1);
  const d1 = c.pos.distanceTo(at(3.5));
  const moved = it.obj.position.distanceTo(b0);
  const zone = GR.stats().zones.includes('grav');
  await tick(40, 0.1);
  return { creatureDistBefore: +d0.toFixed(1), creatureDistAfter: +d1.toFixed(1), lootMoved: +moved.toFixed(2), zoneActive: zone, zoneGone: !GR.stats().zones.includes('grav') };
});

await section('blackout', async () => {
  await clearAll();
  const em = [...g.lights.emitters].filter((e) => e.pos.distanceTo(g.player.pos) < 14).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos))[0];
  const f0 = em ? g.lights.groupFactor(em) : null;
  GR.spawn('blackout', at(1.5, 0.3), V(0, 0, 0), g.selfId, 0.2);
  await tick(20, 0.1);
  const f1 = em ? g.lights.groupFactor(em) : null;
  const dark = GR.stats().dark;
  const lurker = await mk('lurker', 8); const speedBase = g.creatures.speedMul({ ...lurker, type: 'scuttler', pos: lurker.pos, def: lurker.def }, 10);
  const speedDark = g.creatures.speedMul(lurker, 10);
  g.creatures.hostRemove(lurker.id);
  await tick(210, 0.1);
  return { hasEmitter: !!em, lightFactorBefore: f0, lightFactorInside: f1 == null ? null : +f1.toFixed(3), darkZones: dark, lurkerSpeed: { normalType: +speedBase.toFixed(1), darkLover: +speedDark.toFixed(1) }, darkGone: GR.stats().dark === 0, factorAfter: em ? +g.lights.groupFactor(em).toFixed(2) : null };
});

await section('confetti', async () => {
  await clearAll(); g.emote = null;
  const c = await mk('jester', 5); const c2 = await mk('scuttler', 5.5);
  GR.spawn('confetti', at(3, 0.5), V(0, 0, 0), g.selfId, 0.2);
  await tick(5, 0.1);
  return { emote: g.emote, partyStun: +c.stunT.toFixed(1), otherStun: +c2.stunT.toFixed(1), playerHp: g.player.hp };
});

await section('glitch', async () => {
  await clearAll();
  const c = await mk('scuttler', 5); const hp0 = c.hp;
  GR.spawn('glitch', at(3.5, 0.5), V(0, 0, 0), g.selfId, 0.2);
  await tick(8, 0.1);
  const frozen = c.stunT > 1 || c.state === 'stunned';
  const z = GR.stats().zones.includes('glitch'), fv = GR.stats().frozen;
  await tick(70, 0.1);
  return { frozen, zone: z, hp0, hp: c.hp, dead: c.dead, clientFrozenViewsMid: fv, clientFrozenViewsEnd: GR.stats().frozen };
});

await section('cluster', async () => {
  await clearAll();
  GR.spawn('cluster', at(4, 1.2), V(0, 0, 0), g.selfId, 0.2);
  await tick(5, 0.1);
  const minis = [...GR.balls.values()].filter((b) => b.kind === 'mini').length;
  await tick(30, 0.1);
  return { minis, remaining: GR.stats().balls };
});

await section('rareDrops', async () => {
  const before = [...g.items.all()].filter((i) => i.def.rare).length;
  for (let i = 0; i < 25; i++) g.mods.emit('tfg:chestOpened', { id: 'x' + i, tier: 'void', kind: 'random', pos: [g.player.pos.x, g.player.pos.y, g.player.pos.z], by: g.selfId });
  await tick(10);
  const after = [...g.items.all()].filter((i) => i.def.rare).map((i) => i.type);
  return { newRare: after.length - before, types: [...new Set(after)] };
});

out.errs = errs;
return out;
