// Body of an async fn for tools/harness/headless_shots.mjs: lands on 4 base moons (hills / snow / desert / blackforest = dish / datafall / crane / monolith),
// takes 2 shots per moon (biome landmark + a pylon / billboard / drone cluster), reads renderer.info, and (MODE 'after') exercises the host rules.
//   MODE 'before' hides the signature layer (mesh.visible = false) so the same camera shows the old map; 'after' shows it.
//   flock /tmp/tfg-browser.lock node tools/harness/headless_shots.mjs --port PORT --script tools/harness/wave6_mapart.js --shotdir /tmp/ma
const MODE = (typeof window !== 'undefined' && window.__MAPART_MODE) || 'after';
const g = kefal.game, R = { mode: MODE, errs: [], moons: {} };
addEventListener('error', (e) => R.errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const T = (n, render = true) => { for (let i = 0; i < n; i++) kefal.tick(1, 1 / 30, render); };
const info = () => { kefal.tick(1, 1 / 30, true); const i = kefal.engine.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }; };
const look = (from, to, dy = 0) => { g.player.teleport(from); g.player.yaw = Math.atan2(-(to.x - from.x), -(to.z - from.z)); g.player.pitch = Math.atan2(to.y + dy - (from.y + 1.6), Math.hypot(to.x - from.x, to.z - from.z)); T(6); };
for (const m of ['hamsi', 'palamut', 'orkinos']) {
  g.run.daysLeft = 3; g.run.moon = m; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  for (let i = 0; i < 20; i++) { kefal.tick(10, 1 / 30, false); await wait(10); }
  g.player.inShip = false;
  const M = g.mapart, art = M?.art(), out = { installed: !!M, specs: M?.plan().length, family: M?.family() };
  if (art && MODE === 'before') { art.group.visible = false; const hz = g.world.outdoor.group.getObjectByName('ma-horizon'); if (hz) hz.visible = false; }
  const plan = M?.plan() || [];
  const lm = plan.find((p) => p.kind === 'landmark');
  if (lm) {
    const d = Math.hypot(lm.x, lm.z) || 1, k = (lm.r + 17) / d, px = lm.x - lm.x * k, pz = lm.z - lm.z * k;
    look(V(lm.x * (1 - k), g.world.terrain.heightAt(lm.x * (1 - k), lm.z * (1 - k)) + 0.1, lm.z * (1 - k)), V(lm.x, lm.y, lm.z), 6);
    void px; void pz;
  } else { g.player.teleport(V(0, 2, 30)); T(6); }
  out.info = info();
  await window.__shot(`${MODE}_${m}_a`);
  const py = plan.find((p) => p.kind === 'pylon'), bb = plan.find((p) => p.kind === 'billboard');
  const focus = bb || py;
  if (focus) {
    const d = Math.hypot(focus.x, focus.z) || 1, k = 1 - 13 / d;
    look(V(focus.x * k, g.world.terrain.heightAt(focus.x * k, focus.z * k) + 0.1, focus.z * k), V(focus.x, focus.y + (focus.kind === 'pylon' ? 14 : 4), focus.z), 0);
  }
  if (m !== 'palamut') await window.__shot(`${MODE}_${m}_b`);
  R.moons[m] = out;
  if (MODE === 'after' && M && m === 'hamsi') {
    // ---- host rules through the real module: pylon sabotage freezes spawn timers, billboard shot, drone knock-down + loot
    const seed = g.run.seed | 0, st = M.state(), hd = g.hostData;
    const pyl = plan.filter((p) => p.kind === 'pylon'), dr = plan.filter((p) => p.kind === 'drone'), bd = plan.filter((p) => p.kind === 'billboard');
    g.run.phase = 'moon';
    g.player.teleport(V(pyl[0].x + 1.5, pyl[0].y + 0.1, pyl[0].z));
    T(2);
    M.hostReq({ op: 'sab', id: pyl[0].id, s: seed }, g.selfId);
    const t0 = hd.spawnT, o0 = hd.outdoorSpawnT; T(30, false);
    out.rules = { offStream: M.offStream(), pylonDone: st.pylons[pyl[0].id], spawnTFrozen: Math.abs(hd.spawnT - t0) < 0.2, outdoorFrozen: Math.abs(hd.outdoorSpawnT - o0) < 0.2 };
    M.hostReq({ op: 'sab', id: pyl[0].id, s: seed }, g.selfId);   // second cut of the same pylon is refused
    const b0 = bd[0]; g.player.teleport(V(b0.x, b0.y + 0.1, b0.z - 6)); T(2);
    const cy = b0.y + 2.7 + 1.8, eye = g.camera.position;
    M.hostShot({ k: 'cb', t: 'tr', a: [eye.x, eye.y, eye.z], b: [b0.x, cy, b0.z] }, g.selfId);
    out.rules.boardSilenced = st.boards[b0.id];
    const items0 = g.items.items.size;
    const d0 = dr[0]; g.player.teleport(V(d0.x, d0.gy + 0.1, d0.z - 4)); T(2);
    const e2 = g.camera.position;
    for (let i = 0; i < 3; i++) { M.hostShot({ k: 'cb', t: 'tr', a: [e2.x, e2.y, e2.z], b: [d0.x, d0.y, d0.z] }, g.selfId); await wait(80); T(4, false); }
    out.rules.droneHp = st.drones[d0.id]; out.rules.itemsBefore = items0; out.rules.itemsAfter = g.items.items.size;
    R.hostRules = out.rules;
  }
}
R.errs = R.errs.slice(0, 8);
return R;
