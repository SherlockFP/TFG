// Wave 4 horror feature check (body for tools/harness/headless.mjs --script). NOT run by the author (owner budget rule) - the lead batches browser checks:
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port PORT --script tools/harness/wave4_horror.js --shot /tmp/horror.png --wait 4000
// Host-only run: land on a big factory, find the generated closets / traps, arm a trap and lure a shambler into it, cross a closet into a pocket and back, draw chalk,
// read the fake closet's tells. Returns key numbers; the screenshot shows the last thing looked at (a pocket by default).
const g = kefal.game, errs = []; addEventListener('error', (e) => errs.push(e.message));
const out = {}, wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (n = 10, dt = 1 / 30) => { kefal.tick(n, dt, false); await wait(5); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// a moon big enough to hold set pieces; day 3 so the fake closet may appear
g.run.daysLeft = 3; g.run.day = 3; g.run.quotaIndex = 1; g.run.moon = 'orkinos'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 25; i++) await tick();
const H = g.horror;
out.installed = !!H;
if (!H) { out.errs = errs; return out; }
out.stats = H.stats();
out.theme = g.world.facility?.layout?.theme;

// ---- traps: arm the first one for free, put a shambler in the lane, watch it die
const T = H.traps[0];
if (T) {
  g.run.credits = 500;
  g.player.teleport(V(T.panel.x + T.panel.nx * 1.5, T.zone.y + 0.1, T.panel.z + T.panel.nz * 1.5));
  await tick(10);
  const before = g.run.credits;
  g.net.request('hrReq', { op: 'arm', i: T.uid });
  out.trap = { type: T.desc.type, state: T.st.s, paid: before - g.run.credits, price: T.view.price };
  const z = g.creatures.hostSpawn('hr_zombie', V(T.zone.cx, T.zone.y, T.zone.cz), { zone: 'in', state: 'idle', variant: null, affix: null });
  for (let i = 0; i < 80 && !z.dead; i++) await tick(2, 0.1);
  out.trap.killed = !!z.dead; out.trap.refund = g.run.credits - (before - out.trap.paid); out.trap.finalState = T.st.s;
  g.player.teleport(V(T.zone.cx, T.zone.y + 0.1, T.zone.cz + 6)); await tick(10);
}

// ---- closets + pockets: open the first real closet, walk in, come back out
const c = H.closets.find((x) => !x.fake && x.kind !== 'outbreak');
if (c) {
  const w = (lx, lz) => { const f = c.frame; return V(f.wallX + lx * f.fz + lz * f.fx, f.y, f.wallZ - lx * f.fx + lz * f.fz); };
  g.player.teleport(w(0, 2.4), Math.atan2(c.frame.fx, c.frame.fz) + Math.PI); g.player.pitch = 0; await tick(10);
  g.net.request('hrReq', { op: 'door', i: c.id, o: 1 });
  await tick(30);
  const open = c.view.isOpen;
  g.player.teleport(w(0, 0.6), g.player.yaw); await tick(6);
  out.closet = { kind: c.kind, open, inPocket: c.pocket.contains(g.player.pos), y: +g.player.pos.y.toFixed(2), title: c.pocket.spec.title, floorM2: c.pocket.spec.map.join('').replace(/[# ]/g, '').length * 4 };
  await tick(20);
  const shot = { x: g.player.pos.x, z: g.player.pos.z };
  g.player.pitch = -0.1;
  out.pocketSpots = { loot: c.pocket.spots.loot.length, lamps: c.pocket.spots.lamp.length, zombies: c.pocket.spots.zombie.length };
  out.playerAt = shot;
}

// ---- chalk: give a stick, draw on the floor, check the pool + limits
{
  const id = g.items.hostSpawn('hr_chalk', g.player.pos.clone().add(V(0, 1, 0)), { holder: g.selfId }); await tick(6);
  const it = g.items.get(id); const slot = g.player.slots.indexOf(id); if (slot >= 0) g.switchSlot(slot); await tick(3);
  g.player.pitch = -1.2;
  const marks0 = H.chalk?.count() || 0;
  for (let i = 0; i < 6; i++) { g.useHeldPress(); await tick(8, 0.1); }
  out.chalk = { held: it?.type, marksAdded: (H.chalk?.count() || 0) - marks0, total: H.chalk?.count() || 0, cap: 24 };
}

// ---- fake closet tells
const f = H.closets.find((x) => x.fake);
out.fake = f ? { open: f.view.isOpen, hasCreature: [...g.creatures.host.values()].some((x) => x.type === 'hr_ambusher' && x.state === 'lurk'), forgedArrows: H.store.all().filter((m) => m.f).length } : null;
out.credits = g.run.credits;
out.errs = errs;
return out;
