// Wave 4 ship2 check (body for tools/harness/headless.mjs --script):
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5193 --script tools/harness/wave4_ship2.js --shot /tmp/ship2.png --wait 4000
// Land, look at the new Mini-Skeld from 3 interior spots + one outside view (collage drawn over the page so a single screenshot shows all four),
// damage the hull, repair through the host session path with a Wrench, exercise a planter + a defence mount, (the landing itself is the smoke test; tools/harness/smoke_land.js is left to the lead's batch run).
const g = kefal.game, errs = []; addEventListener('error', (e) => errs.push(e.message));
const out = {}, wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (n = 10, dt = 1 / 30, render = false) => { kefal.tick(n, dt, render); await wait(5); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
out.installed = !!g.ship2;
if (!g.ship2) { out.errs = errs; return out; }

// ---- land on a moon (the ship is at the origin; outside views need the terrain)
g.run.quotaIndex = 2; g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 14; i++) await tick(10);
out.phase = g.run.phase; out.weather = g.run.weather;
out.shipMeshes = 0; g.ship.group.traverse((o) => { if (o.isMesh) out.shipMeshes++; });
out.layout = { obstacles: g.ship.layout?.obstacles?.length, spawns: g.ship.spawns.length, emitters: g.ship.emitters.length, hasReactor: !!g.ship.group.getObjectByName('reactorCore'), nose: !!g.ship.group.getObjectByName('ship2_nose') };
out.door = { open: g.ship.door.open, t: +g.ship.door.t.toFixed(2) };

// ---- hull damage: 7 spots for the pictures
const kinds = ['spark', 'breach', 'leak', 'dent', 'spark', 'leak', 'dent'];
for (const k of kinds) g.ship2.damage('event', { kind: k });
await tick(20);
out.hull = { integrity: g.ship2.integrity(), tier: g.ship2.tier(), spots: g.run.s2.sp.length, client: g.ship2.client().spotViews, hullDamage: g.run.hullDamage };

// ---- collage: 4 views drawn into one canvas, shown over the page for the harness screenshot
const gl = g.engine.canvas, col = document.createElement('canvas');
col.width = 1280; col.height = 720; col.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:720px;z-index:99999;background:#000';
const cx = col.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, 1280, 720);
const groundY = (x, z) => { try { const h = g.physics.raycast({ x, y: 6, z }, { x: 0, y: -1, z: 0 }, 30); return h ? h.point.y : -1.8; } catch { return -1.8; } };
const view = async (i, pos, yaw, pitch = 0) => {
  g.player.teleport(pos, yaw); g.player.pitch = pitch; g.player.inShip = pos.y > -1.2 && Math.abs(pos.x) < 7.5 && Math.abs(pos.z) < 4;
  await tick(6); kefal.tick(2, 1 / 30, true);
  cx.drawImage(gl, 0, 0, gl.width, gl.height, (i % 2) * 640, Math.floor(i / 2) * 360, 640, 360);
  return g.engine.sceneStats ? { calls: g.engine.sceneStats.calls, tris: g.engine.sceneStats.tris } : null;
};
out.views = [];
out.views.push(await view(0, V(5.7, 0.05, 0.55), Math.PI / 2, 0.02));       // tail -> nose: hub, hatch, cockpit window
out.views.push(await view(1, V(-0.2, 0.05, -1.9), Math.PI, 0.05));          // hub -> south wall: mirror, store, incubator, decon, signs, windows
out.views.push(await view(2, V(3.6, 0.05, -0.7), -0.55, 0.0));              // engine room + loot bay + cargo corner
const gy = groundY(6.5, 10.5);
out.views.push(await view(3, V(6.5, gy + 0.05, 10.5), 0.5, 0.1));           // outside: door side, damage spots, ladder, open door
document.body.appendChild(col);

// ---- outside repair through the host session path (fake held wrench; the host validates holder / range / outside)
const spots = g.run.s2.sp.slice();
const wid = g.items.hostSpawn('s2_wrench', V(0, 0, 0), { holder: g.selfId });
const wit = g.items.get(wid);
out.wrenchItem = !!wit;
g.player.heldItem = () => wit;
g.input.isDown = () => true; try { Object.defineProperty(g.input, 'locked', { value: true, configurable: true }); } catch { g.input.locked = true; }
const target = spots.find((s) => s.k === 'dent') || spots[0];
const sl = g.ship2.state().hull.sp.find((s) => s.i === target.i);
const slot = { x: 0, y: 0, z: 0 };
{ const P = await import('/src/game/ship2_core.js'); const s = P.slotById(sl.s), p = P.standPoint(s); g.player.teleport(V(p[0], groundY(p[0], p[2]) + 0.05, p[2] + (s.face === '-z' ? -0.4 : 0.4)), Math.atan2(s.n[0], s.n[2]) + 0); g.player.inShip = false; slot.x = p[0]; }
await tick(4);
const before = g.ship2.integrity();
g.net.request('s2req', { op: 'rstart', tg: 'h:' + target.i, item: wid });
out.sessionStarted = g.ship2.state().sessions;
for (let i = 0; i < 300 && g.run.s2.sp.some((s) => s.i === target.i); i++) await tick(2, 1 / 20);
out.repair = { before, after: g.ship2.integrity(), gone: !g.run.s2.sp.some((s) => s.i === target.i), sessionsLeft: g.ship2.state().sessions };

// ---- planter + mount smoke
g.player.teleport(V(-0.85, 0.05, -2.4), 0); g.player.inShip = true; await tick(4);
g.net.request('s2req', { op: 'pl', id: 'planterHub', sub: 'plant' });
out.planter = g.run.s2.pl.planterHub;
out.slots = { power: g.run.s2.ps };

out.errs = errs;
return out;
