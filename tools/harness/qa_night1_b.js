// QA night 1, run B (headless_shots.mjs): unlock card + one shot per themed interior / new labyrinth moon (helpers as in qa_night1_a.js).
//   flock /tmp/tfg-browser.lock timeout 590 node tools/harness/headless_shots.mjs --port PORT --script tools/harness/qa_night1_b.js --shotdir docs/wave8/qa_shots --wait 4000
const g = kefal.game, R = { steps: {}, fall: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const yaw2 = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
const fac = () => g.world.facility;
async function frames(n, render = true) { for (let i = 0; i < n; i++) { kefal.tick(1, 1 / 30, false); if (i % 4 === 3) await sleep(4); } if (render) kefal.tick(2, 1 / 30, true); await sleep(250); kefal.tick(1, 1 / 30, true); }
async function step(name, fn) { const t = performance.now(); console.log('QA: start ' + name); try { const r = await fn(); R.steps[name] = r === undefined ? 'ok' : r; } catch (e) { R.steps[name] = 'ERR ' + (e && e.message || e).toString().slice(0, 200); } R.steps[name + '_ms'] = Math.round(performance.now() - t); console.log('QA: done ' + name + ' ' + JSON.stringify(R.steps[name]).slice(0, 120) + ' ' + R.steps[name + '_ms'] + 'ms'); }
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


const pick = String(window.__qa || '').split(',');
// ---------------- run B step 0 (still in orbit): unlock card + Hub door, shot right away (the card lasts ~5 s)
if (pick.includes('card')) await step('orbit_card', async () => {
  const d = g.hubgate?.door?.(); if (!d) return 'no door';
  const p = new THREE.Vector3(); d.grp.getWorldPosition(p);
  const px = p.x - 1.5, pz = p.z; look(px, 0.1, pz, yaw2(px, pz, p.x, p.z), 0.0); await frames(4, false);
  R.cardRet = g.hubgate.card('shop'); kefal.tick(3, 1 / 30, true); await sleep(200); R.bigDom = (() => { const e = document.querySelector('.hud-big'); return e && { cls: e.className, txt: e.textContent.slice(0, 60), disp: getComputedStyle(e).display, op: getComputedStyle(e).opacity, r: JSON.stringify(e.getBoundingClientRect()) }; })(); unpause(); await window.__shot('hub_door_card.jpg');
});
// ---------------- one interior shot per themed / new-labyrinth moon (instant landing: hostFinishLanding flushes the queue), + soul palette outdoors on orkinos
const ALL = { levrek: 'metro.jpg', cipura: 'prison.jpg', lufer: 'greenhouse.jpg', w2sov: 'tower.jpg', m5est: 'influencer.jpg', palamut: 'academy.jpg', m5cold: 'colddata.jpg', orkinos: 'museum.jpg' };
const WANT = Object.fromEntries(Object.entries(ALL).filter(([m]) => pick.includes(m)));
for (const [m, file] of Object.entries(WANT)) {
  await step(m, async () => {
    const info = await land(m, false); R['land_' + m] = info;
    if (g.run.phase !== 'moon') return 'phase ' + g.run.phase;
    const f = fac(); if (!f) return 'no facility';
    const rooms = f.layout.rooms; R['rooms_' + m] = rooms.map((r) => r.type).filter((v, i, a) => a.indexOf(v) === i).slice(0, 14);
    if (m === 'orkinos') {   // soul palette (day, outdoors) first
      look(0, (g.world.terrain?.heightAt?.(0, 15) ?? 0) + 0.05, 15, 0, 0.1); await frames(30); await shot('soul_orkinos.jpg');
    }
    const hub = rooms.find((r) => r.hub) || rooms.find((r) => /platform|station/.test(r.type)) || null;
    await toRoom(hub ? (r) => r === hub : (r) => r.type !== 'entrance', 0.03);
    R['at_' + m] = hub ? hub.type : 'largest';
    R['torch_' + m] = await torch();
    const U = g.engine.postMat.uniforms, g0 = U.uGamma.value; U.uGamma.value = g0 * 2.8;   // QA: interiors are pitch dark; brightness x2.8 so the geometry can be judged
    await frames(12, false); await shot(file); U.uGamma.value = g0;
    R['pos_' + m] = [g.player.pos.x, g.player.pos.y, g.player.pos.z].map((v) => +v.toFixed(1)); R['dead_' + m] = g.player.dead;
    R['takeoff_' + m] = await takeoff();
  });
}
R.errs = 'see LOGS';
return R;
