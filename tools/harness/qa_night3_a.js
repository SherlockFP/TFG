// QA night 3, run A (FRESH profile ?hiringday=1): stream end (faces terminal, no lock prompt), tarps, real landing (warm:* times), path drone cone,
// indoor camera cone, glove (torch / shovel / pipe / scrap / pickaxe).   (prepend qa_night2_lib.js)
const dump = (k) => console.log('QA: R ' + k + ' ' + JSON.stringify(R).slice(0, 2500));
await step('stream', async () => {
  for (let i = 0; i < 40 && !document.querySelector('.ob-st'); i++) { await frames(3, false); await sleep(100); }
  if (!document.querySelector('.ob-st')) return 'NO ob-st overlay';
  for (let i = 0; i < 48 && document.querySelector('.ob-st'); i++) kefal.tick(10, 1 / 30, false);
  await frames(6);
  R.streamGone = !document.querySelector('.ob-st');
  R.yaw = +g.player.yaw.toFixed(2); R.pos = g.player.pos.toArray().map((v) => +v.toFixed(1)); R.frozen = g.player.frozen;
  R.hasUnlockText = /UNLOCKS AT/i.test(document.body.innerText);
  await shot('n3_stream_end.jpg');
});
await step('tarps', async () => {
  const sg = g.ship?.group, tarps = []; sg.traverse((o) => { if (o.userData?.hgTarp) tarps.push(o); });
  R.tarpCount = tarps.length; if (!tarps.length) return 'no tarp';
  const w = new THREE.Vector3(); tarps[0].getWorldPosition(w); const c = new THREE.Vector3(); sg.getWorldPosition(c);
  const dx = c.x - w.x, dz = c.z - w.z, dl = Math.hypot(dx, dz) || 1, px = w.x + (dx / dl) * 3.2, pz = w.z + (dz / dl) * 3.2;
  look(px, g.player.pos.y, pz, yaw2(px, pz, w.x, w.z), 0.05); await frames(6);
  R.hasUnlockText2 = /UNLOCKS AT/i.test(document.body.innerText);
  await shot('n3_tarps.jpg');
});
await step('land', async () => {
  const r = await land(null, true);
  R.warmJobs = g.landQ.last.filter((e) => /^warm/.test(e.name)).map((e) => e.name + ':' + +(+e.ms).toFixed(1));
  R.landTop = g.landQ.report().slice(0, 12).map((e) => e.name + ':' + Math.round(e.ms));
  const pi = g.perfInfo(); R.perf = { programs: pi.programs, geometries: pi.geometries, textures: pi.textures, warm: { built: pi.warm.built, ms: pi.warm.ms, programsBefore: pi.warm.programsBefore, programsAfter: pi.warm.programsAfter } };
  return r;
});
dump('land');
const out = g.world.outdoor, ent = out?.plan?.entrance;
const F2C = await import('/src/game/feedcams2_core.js');
const gy = (x, z) => out?.terrain?.heightAt?.(x, z) ?? 0;
await step('drone', async () => {
  g.player.inShip = false;
  const ds = g.feedcams2?.drones?.() || []; const d = ds.find((x) => x.day) || ds[0]; if (!d) return 'NO drone';
  const a = F2C.pathPoint(d, ent, 0.24, 0), ax = a.x, az = a.z;
  look(ax, gy(ax, az) + 0.6, az, yaw2(ax, az, ent.x, ent.z), 0.06); await frames(30);
  await shot('n3_drone.jpg');
});
await step('cam_cone', async () => {
  g.player.inShip = false;
  const plan = g.feedcams.plan(); R.nCams = plan.length; if (!plan.length) return 'no cams';
  const f = fac(), L = f.layout; let done = false;
  for (const c of plan) {
    for (const [d, lat] of [[7, 3.5], [7, -3.5], [9, 0], [5.5, 0]]) {
      for (const sgn of [1, -1]) {
        const dirx = Math.cos(c.h) * sgn, dirz = Math.sin(c.h) * sgn;
        const x = c.x + dirx * d - dirz * lat, z = c.z + dirz * d + dirx * lat;
        const n = f.nav.nearestWalkable(...f.nav.toGrid(x, z), 1); if (!n) continue;
        const w = f.nav.toWorld(n[0], n[1]); if (Math.hypot(w.x - x, w.z - z) > 0.8) continue;
        look(w.x, L.y + 0.02, w.z, yaw2(w.x, w.z, c.x, c.z), -0.12); await frames(10);
        R.cam = { i: c.i, h: +c.h.toFixed(2), d, lat, sgn, cam: [c.x, c.y, c.z].map((v) => +v.toFixed(1)), me: [w.x, w.z].map((v) => +v.toFixed(1)) };
        await shot('n3_cam_cone.jpg'); done = true; break;
      }
      if (done) break;
    }
    if (done) break;
  }
  return done;
});
async function hold(id) { const p = g.player; p.slots.fill(null); const iid = g.items.hostSpawn(id, p.pos.clone().setY(p.pos.y + 1), { holder: g.selfId }); await frames(3, false); p.slots[0] = iid; p.slot = 0; g.refreshHeldVisuals?.(); await frames(8); return iid; }
await step('glove', async () => {
  const s = roomSpot((r) => r.type !== 'entrance'); look(s.x, s.y + 0.02, s.z, yaw2(s.x, s.z, s.tx, s.tz) + 0.9, -0.28);
  g.settings.hudDensity = 'standard'; g.hudcalm?.pass?.();
  const p = g.player; p.slots.fill(null); R.torch = await torch(); await frames(6); await shot('n3_glove_torch.jpg');
  for (const [nm, ids] of [['shovel', ['shovel']], ['pipe', ['pipe']], ['scrap', ['bolt']], ['pickaxe', ['x_pickaxe', 'tool_pickaxe_steel']]]) {
    let ok = null;
    for (const id of ids) { try { await hold(id); ok = id; if (g.items.get(p.slots[0])) break; } catch (e) { R['glErr_' + id] = String(e).slice(0, 80); } }
    R['glove_' + nm] = ok && g.items.get(p.slots[0])?.type; await shot('n3_glove_' + nm + '.jpg');
  }
});
R.errs = 'see LOGS'; return R;
