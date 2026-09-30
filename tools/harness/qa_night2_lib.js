// QA night 2 shared helpers (prepend to qa_night2_a/b/c.js: cat qa_night2_lib.js qa_night2_X.js > $TMP/X.js). Normal gamma 1.0, no post brightness boost.
const g = kefal.game, R = { steps: {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const yaw2 = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
const fac = () => g.world.facility;
R.gamma = g.engine.postMat?.uniforms?.uGamma?.value;
async function frames(n, render = true) { for (let i = 0; i < n; i++) { kefal.tick(1, 1 / 30, false); if (i % 4 === 3) await sleep(4); } if (render) kefal.tick(2, 1 / 30, true); await sleep(250); kefal.tick(1, 1 / 30, true); }
async function step(name, fn) { const t = performance.now(); console.log('QA: start ' + name); try { const r = await fn(); R.steps[name] = r === undefined ? 'ok' : r; } catch (e) { R.steps[name] = 'ERR ' + String(e && e.stack || e).slice(0, 300); } R.steps[name + '_ms'] = Math.round(performance.now() - t); console.log('QA: done ' + name + ' ' + JSON.stringify(R.steps[name]).slice(0, 200) + ' ' + R.steps[name + '_ms'] + 'ms'); }
function unpause() { try { if (document.querySelector('.pause-info')) { R.pausedSeen = (R.pausedSeen || 0) + 1; g.ui.closePanel(true); } if (g.ui.clickHint) g.ui.clickHint.style.display = 'none'; } catch (e) { R.unpauseErr = String(e); } }
async function shot(name, keepPause) { if (!keepPause) unpause(); await frames(2, false); await sleep(500); if (!keepPause) unpause(); await window.__shot(name); }
function look(x, y, z, yaw, pitch = 0) { g.player.teleport(V(x, y, z), yaw); g.player.yaw = yaw; g.player.pitch = pitch; g.player.hp = g.player.maxHp || 100; }
function roomSpot(pred, fromCorner = true) {
  const f = fac(), L = f.layout, C = L.cell, rooms = L.rooms.filter(pred).sort((a, b) => b.w * b.h - a.w * a.h), r = rooms[0]; if (!r) return null;
  const cx = L.ox + (r.x + r.w / 2) * C, cz = L.oz + (r.z + r.h / 2) * C, sx = L.ox + (r.x + 0.9) * C, sz = L.oz + (r.z + r.h - 0.9) * C;
  const wk = (x, z) => { const n = f.nav.nearestWalkable(...f.nav.toGrid(x, z), 10); return n ? f.nav.toWorld(n[0], n[1]) : { x, z }; };
  const a = wk(fromCorner ? sx : cx, fromCorner ? sz : cz), b = wk(cx, cz);
  return { x: a.x, z: a.z, y: L.y, tx: b.x, tz: b.z, type: r.type, w: r.w, h: r.h };
}
async function toRoom(pred, pitch = 0.02) { const s = roomSpot(pred); if (!s) return null; look(s.x, s.y + 0.02, s.z, yaw2(s.x, s.z, s.tx, s.tz), pitch); await frames(6, false); return s; }
async function land(m, real) {
  g.run.daysLeft = 3; if (m) g.run.moon = m; g.player.inShip = true; g.hostLever(g.selfId);
  const t0 = performance.now();
  if (!real) g.hostFinishLanding();
  while ((g.run.phase !== 'moon' || g.landQ?.pending) && performance.now() - t0 < 120000) { if (!real) kefal.tick(1, 1 / 30, false); await sleep(real ? 100 : 15); }
  const f = fac();
  return { moon: g.run.moon, ms: Math.round(performance.now() - t0), phase: g.run.phase, theme: f?.layout?.theme, scrap: f?.scrapSpots?.length, terrain: !!g.world.terrain };
}
async function takeoff() { g.downed?.S.book.e.clear(); g.player.teleport(V(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); for (let i = 0; i < 20 && g.run.phase !== 'orbit'; i++) { g.hostFinishTakeoff(); await frames(6, false); await sleep(300); } return g.run.phase; }
async function torch() { const p = g.player, id = g.items.hostSpawn('flashlight', p.pos.clone().setY(p.pos.y + 1), { holder: g.selfId }); await frames(3, false); const sl = p.slots.indexOf(null); p.slots[sl] = id; p.slot = sl; g.refreshHeldVisuals?.(); const it = g.items.get(id); if (it && !it.on) g.useHeldPress(); await frames(4, false); return !!it?.on; }
function regions() {
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; const r = e.getBoundingClientRect(); return r.width > 8 && r.height > 8 && r.right > 0 && r.left < innerWidth; };
  const out = [];
  for (const e of document.querySelectorAll('.hud > *, .hud-dock-item, .objectives, .tfg-asg, .hud-tl > *')) if (!e.classList.contains('hc-off') && !e.classList.contains('visor') && vis(e)) out.push((e.dataset.dockId ? 'dock:' + e.dataset.dockId : e.className).toString().slice(0, 28));
  return [...new Set(out)];
}
function goalLines() { return [...document.querySelectorAll('.objectives *')].filter((e) => e.children.length === 0 && e.textContent.trim() && getComputedStyle(e).display !== 'none').map((e) => e.textContent.trim().slice(0, 90)); }
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
/** dark room, no torch: freeze a fan of creatures 4-7 m ahead so their eye tells can be judged */
function eyeSpawn(types) {
  const s = g.player.pos, yaw = g.player.yaw, out = [];
  types.forEach((ty, i) => {
    try {
      const d = 4.2 + (i % 3) * 1.4, side = (i - (types.length - 1) / 2) * 1.5;
      g.creatures.hostSpawn(ty, V(s.x - Math.sin(yaw) * d + Math.cos(yaw) * side, s.y, s.z - Math.cos(yaw) * d - Math.sin(yaw) * side), { level: 1 });
      out.push(ty);
    } catch (e) { out.push(ty + ':ERR ' + String(e).slice(0, 60)); }
  });
  return out;
}
function freezeCreatures(types) {
  const yaw = g.player.yaw, s = g.player.pos, cs = [...g.creatures.host.values()].filter((c) => types.includes(c.type)); let i = 0;
  for (const c of cs) {
    const d = 4.2 + (i % 3) * 1.4, side = (i - (cs.length - 1) / 2) * 1.6; i++;
    const x = s.x - Math.sin(yaw) * d + Math.cos(yaw) * side, z = s.z - Math.cos(yaw) * d - Math.sin(yaw) * side;
    c.pos.set(x, s.y, z); if (c.body?.setTranslation) c.body.setTranslation({ x, y: s.y + 0.9, z }, true); if (c.vel) c.vel.set(0, 0, 0); c.stunT = 99;
  }
  return cs.map((c) => [c.type, c.pos && [c.pos.x, c.pos.y, c.pos.z].map((v) => +v.toFixed(1))]);
}
