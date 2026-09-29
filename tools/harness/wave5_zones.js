// Body for headless.mjs (wave 5 zones): land on hamsi, walk to core A, wait for the clear timer, plant the beacon, build a turret, open the sector map panel.
const g = kefal.game, errs = []; addEventListener('error', (e) => errs.push(e.message));
const out = {};
g.run.credits = 500; g.run.quotaIndex = 1; g.run.daysLeft = 3;   g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 20; i++) { kefal.tick(10, 1 / 30, false); await new Promise((r) => setTimeout(r, 10)); }
const Z = g.zones;
out.cores = Z.cores().map((c) => `${c.id}@${c.x},${c.z}`);
const A = Z.cores().find((c) => c.id === 'A');
for (const c of [...g.creatures.host.values()]) if (Math.hypot(c.pos.x - A.x, c.pos.z - A.z) < 60) g.creatures.kill(c, null, { silent: true });
g.player.teleport(new THREE.Vector3(A.x + 2, A.y + 1.5, A.z)); g.player.inShip = false;
for (let i = 0; i < 26; i++) { for (const c of [...g.creatures.host.values()]) if (Math.hypot(c.pos.x - A.x, c.pos.z - A.z) < 60) g.creatures.kill(c, null, { silent: true }); kefal.tick(30, 1 / 30, false); await new Promise((r) => setTimeout(r, 4)); }   // the clear timer needs ~25 s of sim time
out.state = JSON.stringify(g.run.zn?.m || {});
g.net.request('znreq', { op: 'plant', z: 'A' });
for (let i = 0; i < 8; i++) { kefal.tick(30, 1 / 30, false); await new Promise((r) => setTimeout(r, 10)); }   // the beacon plant takes a few seconds
out.afterPlant = JSON.stringify(g.run.zn?.m || {}); out.credits = g.run.credits;
g.net.request('znreq', { op: 'build', z: 'A', def: 'turret1' });
kefal.tick(2, 1 / 30, false);
out.deps = g.deployables?.list?.().length;
out.snap = { owned: Z.snapshot().owned, inZone: Z.snapshot().inZone };
g.ui.closePanel?.(); Z.open();
kefal.tick(1, 1 / 30, false);
out.panel = !!document.querySelector('.menu-frame.zn');
out.errs = errs;
return out;
