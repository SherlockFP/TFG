// QA night 1, run A (headless_shots.mjs, 1280x720): orbit shots (hub door, unlock card, Quick Shift end), REAL landing on hamsi + levrek with the
// fall check (stand still 10 s in the ship + 6 s outside), landQ report, HUD / soul / feedcams / revive ring / lcmonsters / night vision / downed / metro.
//   flock /tmp/tfg-browser.lock timeout 590 node tools/harness/headless_shots.mjs --port PORT --script tools/harness/qa_night1_a.js --shotdir docs/wave8/qa_shots --wait 4000
const g = kefal.game, R = { steps: {}, fall: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const yaw2 = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
const fac = () => g.world.facility;
async function frames(n, render = true) { for (let i = 0; i < n; i++) { kefal.tick(1, 1 / 30, false); if (i % 4 === 3) await sleep(4); } if (render) kefal.tick(2, 1 / 30, true); await sleep(250); kefal.tick(1, 1 / 30, true); }
async function step(name, fn) { const t = performance.now(); try { const r = await fn(); R.steps[name] = r === undefined ? 'ok' : r; } catch (e) { R.steps[name] = 'ERR ' + (e && e.message || e).toString().slice(0, 200); } R.steps[name + '_ms'] = Math.round(performance.now() - t); }
function unpause() { try { if (document.querySelector('.pause-info')) { R.pausedSeen = (R.pausedSeen || 0) + 1; g.ui.closePanel(true); } if (g.ui.clickHint) g.ui.clickHint.style.display = 'none'; document.querySelectorAll('.kach-banner-host > *').forEach((e) => e.remove()); } catch (e) { R.unpauseErr = String(e); } }
async function torch() { const p = g.player, id = g.items.hostSpawn('flashlight', p.pos.clone().setY(p.pos.y + 1), { holder: g.selfId }); await frames(3, false); const sl = p.slots.indexOf(null); p.slots[sl] = id; p.slot = sl; g.refreshHeldVisuals?.(); const it = g.items.get(id); if (it && !it.on) g.useHeldPress(); await frames(4, false); return !!it?.on; }
async function shot(name) { unpause(); await frames(2, false); await sleep(500); unpause(); await window.__shot(name); }   // no extra manual renders: the RAF loop draws (software GL: one heavy frame takes seconds)
function look(x, y, z, yaw, pitch = 0) { g.player.teleport(V(x, y, z), yaw); g.player.yaw = yaw; g.player.pitch = pitch; g.player.hp = g.player.maxHp || 100; }
function roomSpot(pred, fromCorner = true) {
  const f = fac(), L = f.layout, C = L.cell, rooms = L.rooms.filter(pred).sort((a, b) => b.w * b.h - a.w * a.h), r = rooms[0]; if (!r) return null;
  const cx = L.ox + (r.x + r.w / 2) * C, cz = L.oz + (r.z + r.h / 2) * C;
  const sx = L.ox + (r.x + 0.9) * C, sz = L.oz + (r.z + r.h - 0.9) * C;
  const wk = (x, z) => { const n = f.nav.nearestWalkable(...f.nav.toGrid(x, z), 10); return n ? f.nav.toWorld(n[0], n[1]) : { x, z }; };
  const a = wk(fromCorner ? sx : cx, fromCorner ? sz : cz), b = wk(cx, cz);
  return { x: a.x, z: a.z, y: L.y, tx: b.x, tz: b.z, type: r.type, w: r.w, h: r.h };
}
async function toRoom(pred, pitch = 0.02) { const s = roomSpot(pred); if (!s) return null; look(s.x, s.y + 0.02, s.z, yaw2(s.x, s.z, s.tx, s.tz), pitch); await frames(6, false); return s; }
async function land(m, real) {
  g.run.daysLeft = 3; g.run.moon = m; g.player.inShip = true; R['landQ_' + m] = { has: !!g.landQ, enabled: g.landQ?.enabled }; const adds = []; if (g.landQ && !g.landQ.__w) { const o = g.landQ.add.bind(g.landQ); g.landQ.add = (n, f) => { adds.push(n); return o(n, f); }; g.landQ.__w = 1; } R['landQAdds_' + m] = adds; g.hostLever(g.selfId);
  const t0 = performance.now(); let minY = 1e9;
  if (!real) g.hostFinishLanding();
  while ((g.run.phase !== 'moon' || g.landQ?.pending) && performance.now() - t0 < 90000) { if (!real) kefal.tick(1, 1 / 30, false); minY = Math.min(minY, g.player.pos.y); await sleep(real ? 100 : 15); }
  const f = fac();
  return { m, ms: Math.round(performance.now() - t0), phase: g.run.phase, pending: g.landQ?.pending, minY: +minY.toFixed(2), theme: f?.layout?.theme, facChildren: f?.group?.children?.length, colliders: f?.colliders?.length, scrap: f?.scrapSpots?.length, terrain: !!g.world.terrain, landTotalMs: Math.round(g.landQ?.totalMs || 0), top5: (g.landQ?.report() || []).slice(0, 5).map((j) => j.name + ' ' + j.ms) };
}
async function takeoff() { g.downed?.S.book.e.clear(); g.player.teleport(V(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); for (let i = 0; i < 20 && g.run.phase !== 'orbit'; i++) { g.hostFinishTakeoff(); await frames(6, false); await sleep(300); } return g.run.phase; }
async function fallCheck(m, real, outside = true) {
  const info = await land(m, real); const s = [], o = [];
  info.yAtLanding = +g.player.pos.y.toFixed(2);
  for (let i = 0; i < 20; i++) { await sleep(500); s.push(+g.player.pos.y.toFixed(2)); }
  info.inShipAfter = g.player.inShip; info.dead = g.player.dead;
  if (!outside) { info.shipMinMax = [Math.min(...s), Math.max(...s)]; R.fall.push(info); return info; }
  const gy = g.world.terrain?.heightAt?.(0, 12) ?? 0; info.terrainY = +gy.toFixed(2);
  look(0, gy + 0.6, 12, 0, 0.05); g.player.inShip = false;
  for (let i = 0; i < 12; i++) { await sleep(500); o.push(+g.player.pos.y.toFixed(2)); }
  info.shipMinMax = [Math.min(...s), Math.max(...s)]; info.outMinMax = [Math.min(...o), Math.max(...o)]; info.outDead = g.player.dead; info.phaseAfter = g.run.phase;
  R.fall.push(info); return info;
}
function overlaps() {
  const els = [...document.querySelectorAll('body *')].filter((e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; if (!(cs.position === 'fixed' || cs.position === 'absolute')) return false; const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 12 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight && r.width * r.height < innerWidth * innerHeight * 0.5; });
  const out = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j]; if (a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (w > 6 && h > 6) out.push(`${(a.id || a.className || a.tagName).toString().slice(0, 30)} x ${(b.id || b.className || b.tagName).toString().slice(0, 30)} ${Math.round(w)}x${Math.round(h)}`);
  }
  return out.slice(0, 20);
}

// ---------------- orbit: hub door + unlock card + Quick Shift end
await step('orbit_hub', async () => {
  const d = g.hubgate?.door?.(); if (!d) return 'no door';
  const p = new THREE.Vector3(); d.grp.getWorldPosition(p);
  const px = p.x - 1.5, pz = p.z; look(px, g.ship.spawns?.[0]?.y ?? 0.1, pz, yaw2(px, pz, p.x, p.z), 0.0);
  g.hubgate.card('shop'); await frames(10);
  const info = { doorPos: [p.x, p.y, p.z].map((v) => +v.toFixed(2)), open: d.open, phase: g.run.phase };
  await shot('hub_door_card.jpg'); return info;
});
await step('orbit_quickend', async () => {
  g.hubgate.showEnd({ collected: 137, allDead: false, players: [{ dead: false }], leftValue: 40 }, () => {}); await frames(8);
  await shot('quick_end.jpg'); document.querySelector('.hg-end')?.remove();
});

// ---------------- hamsi: REAL landing + fall check (post perf4 landing queue)
await step('hamsi_fall', () => fallCheck('hamsi', true, true));
await step('hamsi_soul_hud', async () => {
  look(0, (g.world.terrain?.heightAt?.(0, 15) ?? 0) + 0.05, 15, 0, 0.12); await frames(30);
  R.overlapsHamsi = overlaps(); R.hudDensity = document.documentElement.dataset.hud;
  await shot('soul_hamsi_hud.jpg');
});
await step('hamsi_feedcam', async () => {
  const f = fac(), plan = g.feedcams.plan(); R.camCount = plan.length; if (!plan.length) return 'no cams';
  const c = plan.find((x) => x.tut) || plan[0]; const r0 = c.r0 || 2, d = Math.max(r0 + 2, Math.min(7, (c.R || 10) * 0.65));
  const px = c.x + Math.cos(c.h) * d, pz = c.z + Math.sin(c.h) * d;
  look(px, f.layout.y + 0.02, pz, yaw2(px, pz, c.x, c.z), -0.12);
  for (let i = 0; i < 12; i++) await frames(1, false);
  for (let i = 0; i < 14; i++) { kefal.tick(15, 1 / 30, false); await sleep(30); }
  R.fcMe = g.run.fc?.p?.[g.selfId] || null; R.onair = !!document.querySelector('.algo-live.fc-onair'); R.cam = { x: +c.x.toFixed(1), z: +c.z.toFixed(1), h: +c.h.toFixed(2), kind: c.kind, R: c.R, r0: c.r0 };
  await shot('feedcam_onair.jpg');
});
await step('hamsi_lcmonsters', async () => {
  const s = await toRoom((r) => r.type !== 'entrance'); if (!s) return 'no room';
  const a = g.lcm.debugSpawn('keeper'), b = g.lcm.debugSpawn('masked'); R.spawned = [a, b];
  await frames(20, false);
  const lm = [...g.creatures.host.values()].filter((c) => String(c.type).startsWith('lm_'));
  const yaw = g.player.yaw;
  lm.slice(0, 2).forEach((c, i) => {
    const d = 3.6 + i * 1.2, side = i ? 1.3 : -1.1; const x = s.x - Math.sin(yaw) * d + Math.cos(yaw) * side, z = s.z - Math.cos(yaw) * d - Math.sin(yaw) * side;
    c.pos.set(x, s.y, z); c.body?.setTranslation?.({ x, y: s.y + 0.9, z }, true); if (c.vel) c.vel.set(0, 0, 0); c.stunT = 99;
  });
  await frames(6, false);
  R.lm = lm.map((c) => [c.type, c.pos && [c.pos.x, c.pos.y, c.pos.z].map((v) => +v.toFixed(1))]);
  await frames(8);
  await shot('lcmonsters_keeper_masked.jpg');
  for (const c of lm) { try { c.hp = 0; c.dead = true; g.creatures.host.delete(c.id); } catch { /* ignore */ } }
});
await step('hamsi_nightvision', async () => {
  const s = await toRoom((r) => r.type !== 'entrance', 0.02); if (!s) return 'no room';
  g.hostSetPower?.(false); await frames(10, false);
  const p = g.player, id = g.items.hostSpawn('nvg1', p.pos.clone().setY(p.pos.y + 1), { holder: g.selfId }); await frames(3, false);
  const sl = p.slots.indexOf(null); p.slots[sl] = id; p.slot = sl; g.refreshHeldVisuals?.();
  g.useHeldPress(); await frames(12);
  R.nvActive = g.nvgear?.active; await shot('nightvision.jpg');
  g.useHeldPress(); g.hostSetPower?.(true); await frames(4, false);
});
await step('hamsi_takeoff', takeoff);

// ---------------- levrek: REAL landing + fall check (in ship only) + metro
await step('levrek_fall', () => fallCheck('levrek', true, false));
await step('levrek_metro', async () => {
  const f = fac(); R.metroRooms = f.layout.rooms.map((r) => r.type).slice(0, 12);
  const st = f.layout.rooms.filter((r) => /platform|station/.test(r.type))[0];
  if (st) await toRoom((r) => r === st, 0.02); else await toRoom((r) => r.type !== 'entrance');
  R.metroAt = st ? st.type : 'fallback';
  await shot('metro.jpg');
});
await step('levrek_downed', async () => {
  await toRoom((r) => r.type !== 'entrance');
  g.player.hp = 100; g.remotes.values = () => [{ id: 'bot1', dead: false, flags: 0 }].values(); try { g.damageLocal(999, 'test', null); } finally { delete g.remotes.values; }
  await frames(40); R.downedPose = { me: !!g.downed.S.me, downedFlag: g.player.downed, hp: g.player.hp, camDy: +(g.camera.position.y - g.player.pos.y).toFixed(2) };
  await shot('downed.jpg');
});
R.errs = 'see LOGS';
return R;
