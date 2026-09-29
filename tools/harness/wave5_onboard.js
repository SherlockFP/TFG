// Wave 5 onboard smoke (body of an async fn for headless_shots.mjs): Hiring Day starts on a forced fresh host (?hiringday=1), the wing is built, and screenshots
// of Cell 07, the corridor (lit / blackout), the locker room and the hangar are taken. Also checks the unlock guards and that no THREE light was added.
//   flock /tmp/tfg-browser.lock node tools/harness/headless_shots.mjs --port PORT --url '/?autohost=local&code=T1&name=Tester&hiringday=1' --script tools/harness/wave5_onboard.js --shotdir /tmp/ob
const g = kefal.game, T = window.THREE, out = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ob = g.onboard;
if (!ob) return { error: 'onboard module missing' };
await wait(400);
out.active = ob.active(); out.step0 = ob.step(); out.stage = ob.stage();
const W = ob.wing();
if (!W) return { error: 'no wing', debug: ob.debug() };
out.stats = W.stats;
let lights = 0; g.scene.traverse((o) => { if (o.isLight) lights++; }); out.sceneLights = lights;
const at = (lx, lz, yaw = 0, pitch = 0) => { const o = W.origin; g.player.teleport(new T.Vector3(o.x + lx, o.y, o.z + lz), yaw); g.player.pitch = pitch; };
const shot = async (name, lx, lz, yaw, pitch) => { at(lx, lz, yaw, pitch); g.engine.fx.fade = 0; g.engine.fadeTarget = 0; for (let i = 0; i < 4; i++) kefal.tick(2, 0.05, true); await __shot(name); };
await shot('01_cell_door', 0, -2.2, 0, 0.05);
await shot('02_cell_desk', -1.5, -2.2, -Math.PI / 2, 0);
ob.note('announced'); W.doors.cell.set(true, true);
await shot('03_corridor', 0, -8, 0, 0);
await shot('04_corridor_mid', 0, -24, 0, 0);
W.setLight(0);
await shot('05_blackout', 0, -24, 0, 0);
W.showFigure(true, 0);
await shot('06_figure', 0, -46, 0, 0);
W.showFigure(false); W.setLight(1);
await shot('07_lockers', -3.6, -40, Math.PI / 2, 0);
await shot('08_cabinet', 0, -51.5, -Math.PI / 2, 0);
W.doors.hangar.set(true, true);
await shot('09_hangar', 0, -60.5, 0, 0.05);
await shot('10_ship', 0, -68, 0, 0.12);
// unlock guards
out.locked = ob.debug().lockedNow;
out.unlocks = ob.unlocks();
out.drawCalls = g.engine.sceneStats?.calls;
// finish cleanly: board through the real path
ob.force('terminal');
await wait(300);
out.afterBoard = { stage: ob.stage(), step: ob.step(), wing: !!ob.wing() };
kefal.tick(5, 0.05, true);
return out;
