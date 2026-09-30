// QA night 2, run A: FRESH profile (?hiringday=1): stream overlay, tarped fixtures, route board + ALL ROUTES, real landing on the routed moon,
// path drone + cone + blind flank, TAGGED line, factory interior dim (no torch), loaner torch + Standard HUD + hold-Tab, eye tells in the dark.
//   flock /tmp/tfg-browser.lock node tools/harness/headless_shots.mjs --port PORT --url '/?autohost=local&code=T1&name=Tester&hiringday=1' --script $TMP/a.js --shotdir docs/wave8/qa_shots --wait 3000 --q 45
// (prepend qa_night2_lib.js)

// ---------------- stream overlay (LIVE, viewers, captions, chat)
await step('stream', async () => {
  for (let i = 0; i < 40 && !document.querySelector('.ob-st'); i++) { await frames(3, false); await sleep(100); }
  const has = !!document.querySelector('.ob-st'); if (!has) return 'NO ob-st overlay';
  for (let i = 0; i < 24; i++) kefal.tick(10, 1 / 30, false);   // ~8 s of stream time
  await frames(4);
  R.streamText = document.querySelector('.ob-st')?.innerText?.replace(/\s+/g, ' ').slice(0, 300);
  await shot('n2_stream.jpg');
  for (let i = 0; i < 24 && document.querySelector('.ob-st'); i++) kefal.tick(10, 1 / 30, false);
  await frames(3, false);
  return { streamGone: !document.querySelector('.ob-st'), frozen: g.player.frozen, phase: g.run.phase, moon: g.run.moon };
});

// ---------------- ship: tarped fixtures
await step('tarps', async () => {
  const sg = g.ship?.group; if (!sg) return 'no ship group';
  const tarps = []; sg.traverse((o) => { if (o.userData?.hgTarp) tarps.push(o); });
  R.tarpCount = tarps.length;
  if (!tarps.length) return 'no tarp';
  const w = new THREE.Vector3(); tarps[0].getWorldPosition(w);
  const c = new THREE.Vector3(); sg.getWorldPosition(c);
  const dx = c.x - w.x, dz = c.z - w.z, dl = Math.hypot(dx, dz) || 1;
  const px = w.x + (dx / dl) * 3.2, pz = w.z + (dz / dl) * 3.2;
  look(px, g.player.pos.y, pz, yaw2(px, pz, w.x, w.z), 0.05);
  await frames(6);
  await shot('n2_tarps.jpg');
  return { tarp: [w.x, w.y, w.z].map((v) => +v.toFixed(1)), p: [px, pz].map((v) => +v.toFixed(1)) };
});

// ---------------- terminal: route board + ALL ROUTES
await step('board', async () => {
  g.player.teleport(V(0, g.player.pos.y, 0)); g.terminal.open(); await frames(6);
  R.cards = g.routeboard?.cards?.(); R.boardVisible = !!g.routeboard?.visible?.();
  R.boardText = document.querySelector('.rb')?.innerText?.replace(/\s+/g, ' ').slice(0, 500);
  const rb = document.querySelector('.rb'); if (rb) { const r = rb.getBoundingClientRect(); R.rbRect = [r.left, r.top, r.width, r.height].map(Math.round); const sc = document.querySelector('.term-screen'); if (sc) { const s2 = sc.getBoundingClientRect(); R.screenRect = [s2.left, s2.top, s2.width, s2.height].map(Math.round); R.rbOverflow = rb.scrollHeight > rb.clientHeight + 2; } }
  await shot('n2_board.jpg', true);
  const inp = g.terminal.inp || document.querySelector('.term-screen input');
  (g.terminal.el || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  if (inp) inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  await frames(6);
  R.allText = document.querySelector('.term-screen')?.innerText?.replace(/\s+/g, ' ').slice(-700);
  await shot('n2_allroutes.jpg', true);
  g.terminal.close(); await frames(3, false);
  return { moon: g.run.moon, phase: g.run.phase };
});

// ---------------- real landing on the routed moon (fresh profile: loaner torch, firstrun budget, path drone)
await step('land', async () => { R.hasLoanerMod = !!g.loaner; return land(null, true); });
await step('ship_hud', async () => { await frames(20); R.regionsShip = regions(); R.goalsShip = goalLines(); R.toasts = [...document.querySelectorAll('.toast')].map((e) => e.textContent.slice(0, 80)); await shot('n2_landed_ship.jpg'); });
await step('loaner', async () => {
  const items = [...g.items.items.values()]; R.itemTypes = items.map((i) => i.type + ':' + (i.label || '')).slice(0, 12);
  const it = items.find((i) => /loaner/i.test(i.label || '')) || items.find((i) => i.type === 'flashlight');
  R.loaner = it ? { id: it.id, label: it.label, battery: it.battery } : null;
  if (it) { g.pickup(it); await frames(3, false); const p = g.player, sl = p.slots.indexOf(it.id); R.slot = sl; if (sl >= 0) { p.slot = sl; g.refreshHeldVisuals?.(); } }
  return R.loaner;
});

// ---------------- outdoors: path drone, cone, blind flank
const out = g.world.outdoor, ent = out?.plan?.entrance;
R.entrance = ent && [ent.x, ent.z].map((v) => +v.toFixed(1)); R.entranceDist = ent && Math.round(Math.hypot(ent.x, ent.z));
const F2C = await import('/src/game/feedcams2_core.js');
const gy = (x, z) => out?.terrain?.heightAt?.(x, z) ?? 0;
await step('drone', async () => {
  g.player.inShip = false;
  const ds = g.feedcams2?.drones?.() || []; R.drones = ds.map((d) => ({ i: d.i, day: d.day, side: +d.side.toFixed(1), rx: +d.rx.toFixed(1), f: +(Math.hypot(d.cx, d.cz) / Math.hypot(ent.x, ent.z)).toFixed(2) }));
  const d = ds.find((x) => x.day); if (!d) return 'NO path drone';
  R.blindOff = F2C.blindOffset(d);
  // 1: on the direct line at t 0.28, looking along the walk toward the entrance (cone / disc ahead)
  const a = F2C.pathPoint(d, ent, 0.24, 0), ax = a.x, az = a.z;
  look(ax, gy(ax, az) + 0.6, az, yaw2(ax, az, ent.x, ent.z), 0.06); await frames(30);
  await shot('n2_drone.jpg');
  // 2: blind flank: same t, lateral offset
  const b = F2C.pathPoint(d, ent, 0.24, R.blindOff), bx = b.x, bz = b.z;
  look(bx, gy(bx, bz) + 0.6, bz, yaw2(bx, bz, ent.x, ent.z), 0.06); await frames(12);
  R.metersFlank = g.run.fc?.p?.[g.selfId] || null;
  await shot('n2_blind_flank.jpg');
  // 3: stand in the disc: tag
  const dp = g.feedcams2.state?.dr; R.dr = dp && Object.keys(dp).length;
  look(ax, gy(ax, az) + 0.6, az, yaw2(ax, az, ent.x, ent.z), 0.06);
  let tagged = false, n = 0;
  for (; n < 500 && !tagged; n++) { g.feedcams.expose(g.selfId, 3, 'd0'); kefal.tick(3, 1 / 30, false); const p = g.run.fc?.p?.[g.selfId]; tagged = !!(p && p[2]); if (n % 20 === 19) await sleep(5); }
  R.tagTicks = n; R.fcMe = g.run.fc?.p?.[g.selfId] || null;
  await frames(20); R.goalsTagged = goalLines();
  await shot('n2_tagged.jpg');
  return { tagged };
});
await step('untag', async () => { try { g.feedcams.untag?.(g.selfId); } catch (e) { R.untagErr = String(e); } g.player.teleport(V(0, g.player.pos.y + 0.1, 0)); await frames(10, false); return g.run.fc?.p?.[g.selfId] || null; });

// ---------------- factory interior: dim, then loaner torch + Standard HUD + Tab card
await step('interior_dim', async () => {
  g.player.inShip = false;
  const s = await toRoom((r) => r.type !== 'entrance'); if (!s) return 'no room';
  R.roomType = s.type; await frames(10);
  await shot('n2_dim_factory.jpg');
});
await step('torch_hud', async () => {
  const p = g.player, it = g.items.get(p.slots[p.slot]); R.holding = it && it.type;
  if (it && !it.on) g.useHeldPress(); await frames(6);
  R.torchOn = !!it?.on; R.battery = it && +(+it.battery).toFixed(1);
  g.settings.hudDensity = 'standard'; g.hudcalm?.pass?.(); await sleep(6500); await frames(4, false); g.hudcalm?.pass?.(); await frames(4);
  R.regionsStd = regions(); R.goalsStd = goalLines(); R.overlapsStd = overlaps();
  await shot('n2_hud_walk_torch.jpg');
  g.hudcalm?.showTab?.(true); await frames(5); await shot('n2_tab_card.jpg'); g.hudcalm?.showTab?.(false); await frames(2, false);
});
await step('eyes', async () => {
  const it = g.items.get(g.player.slots[g.player.slot]); if (it?.on) g.useHeldPress(); await frames(4, false);
  const types = ['hound', 'stalker', 'mannequin', 'crawler']; R.spawn = eyeSpawn(types); await frames(10, false);
  R.frozen = freezeCreatures(types); await frames(14);
  await shot('n2_eyes_dark.jpg');
  for (const c of [...g.creatures.host.values()]) { try { c.hp = 0; c.dead = true; g.creatures.host.delete(c.id); } catch { /* ignore */ } }
});
R.errs = 'see LOGS';
return R;
