// Body for headless.mjs (wave 6 zones2): land on orkinos (factory moon, 2 fire exits), capture + fortify an INTERIOR wing zone (spike floor kills a creature), capture an outdoor zone, place a validated wall line + gate + ring defence,
// build an extractor, draw the ship CRT map, open the sector-map panel. The final screenshot looks at the wall line.
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port PORT --script tools/harness/wave6_zones2.js --shot /tmp/zones2.png --wait 4000
const g = kefal.game, errs = []; addEventListener('error', (e) => errs.push(e.message));
const out = {}, wait = (ms) => new Promise((r) => setTimeout(r, ms));
const step = async (sec, clearNear = null) => { for (let i = 0; i < sec; i++) { if (clearNear) for (const c of [...g.creatures.host.values()]) if (Math.hypot(c.pos.x - clearNear.x, c.pos.z - clearNear.z) < 70 && !c.data?.zt) g.creatures.kill(c, null, { silent: true }); kefal.tick(30, 1 / 30, false); await wait(4); } };
const req = (d) => g.net.request('znreq', d);
g.run.credits = 6000; g.run.quotaIndex = 1; g.run.quota = 400; g.run.daysLeft = 3; g.run.moon = 'orkinos'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
await step(20);
const Z = g.zones, X2 = Z.x2();
out.cores = Z.cores().map((c) => `${c.id}${c.in ? '*' : ''}@${Math.round(c.x)},${Math.round(c.y)},${Math.round(c.z)}`);
out.facility = !!g.world.facility?.layout;
// ---- interior wing
const W = Z.cores().find((c) => c.in);
if (W) {
  g.player.teleport(new THREE.Vector3(W.x + 1.5, W.y + 1.2, W.z)); g.player.inShip = false;
  await step(26, W);
  req({ op: 'plant', z: W.id }); await step(6, W);
  out.wingState = JSON.stringify(g.run.zn?.m?.orkinos?.[W.id] || null);
  req({ op: 'build', z: W.id, def: 't_spikes' }); await step(2, W);
  const T = X2.traps()[0];
  out.traps = X2.traps().length; out.trapViews = X2.views().size;
  if (T) {
    const c = g.creatures.hostSpawn('sg_swarmer', new THREE.Vector3(T.zone.cx, T.zone.y, T.zone.cz), { level: 1, zone: 'in', state: 'run', affix: null, variant: null });
    if (c) { c.data.zt = 1; for (let i = 0; i < 12 && !c.dead; i++) { kefal.tick(15, 1 / 30, false); await wait(4); } out.trapKilled = !!c.dead; }
    out.trapState = X2.views().get(T.uid)?.v.state;
  }
  out.playerY = Math.round(g.player.pos.y);
} else out.noInterior = 'no interior core on this landing';
// ---- outdoor zone + walls + ring defence + extractor
const A = Z.cores().find((c) => !c.in);
g.player.teleport(new THREE.Vector3(A.x + 3, A.y + 1.5, A.z)); g.player.inShip = false; g.player.yaw = 0;
await step(26, A);
req({ op: 'plant', z: A.id }); await step(6, A);
out.outState = JSON.stringify(g.run.zn?.m?.orkinos?.[A.id] || null);
req({ op: 'build', z: A.id, def: 'turret1' }); req({ op: 'build', z: A.id, def: 'barr_wood' }); await step(2, A);
const p = g.player.pos, fy = g.player.yaw + Math.PI;
req({ op: 'wall', z: A.id, n: 4, gate: 1, wx: p.x + Math.sin(fy) * 4.5, wz: p.z + Math.cos(fy) * 4.5, fy });
await step(2, A);
out.walls = JSON.stringify(X2.walls()[A.id] || []); out.wallColliders = X2.state.wCols.length; out.wallMesh = !!X2.state.wMesh;
out.deps = g.deployables?.list?.().length;
req({ op: 'mine', z: A.id }); await step(1, A);
out.miner = JSON.stringify(g.run.zn?.m?.orkinos?.[A.id]?.mn || null);
out.credits = g.run.credits;
// ---- panel + CRT
const snap = Z.snapshot();
out.snap = { owned: snap.owned, inZone: snap.inZone, income: snap.income.credits };
g.ui.closePanel?.(); Z.open(); await step(1, A);
const panel = document.querySelector('.menu-frame.zn');
out.panel = !!panel; out.panelHasWalls = !!panel && /WALLS/.test(panel.textContent) && /EXTRACTOR/.test(panel.textContent);
g.ui.closePanel?.();
out.crt = !!g.shipScreens?.extra && X2.crtDraw(g.shipScreens.extra);
// look at the wall line for the screenshot
g.player.teleport(new THREE.Vector3(p.x, p.y, p.z)); g.player.yaw = 0; g.player.pitch = -0.15;
await step(2, A);
out.errs = errs;
return out;
