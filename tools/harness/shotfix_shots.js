// shotfix shots (based on hud6_shots.js) (headless_shots.mjs, 1280x720, ONE run): greenhouse (lufer) with a lit torch at NORMAL gamma.
//   hud6_full.jpg      Full density = the old always-on layout ("before" for the HUD)
//   hud6_standard.jpg  Standard = 6 always-on areas
//   hud6_tab.jpg       hold-Tab FULL STATUS card (both currencies live here)
//   hud6_torch.jpg     Standard, looking at a wall / floor: the torch viewmodel + pool
//   flock /tmp/tfg-browser.lock timeout 590 node tools/harness/headless_shots.mjs --port PORT --script tools/harness/hud6_shots.js --shotdir docs/wave8/qa_shots --wait 4000 --q 42
window.__skipFull = true;
const g = kefal.game, R = { steps: {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const yaw2 = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
const fac = () => g.world.facility;
async function frames(n, render = true) { for (let i = 0; i < n; i++) { kefal.tick(1, 1 / 30, false); if (i % 4 === 3) await sleep(4); } if (render) kefal.tick(2, 1 / 30, true); await sleep(250); kefal.tick(1, 1 / 30, true); }
function unpause() { try { if (document.querySelector('.pause-info')) g.ui.closePanel(true); if (g.ui.clickHint) g.ui.clickHint.style.display = 'none'; } catch { /* ignore */ } }
async function shot(name) { unpause(); await frames(2, false); await sleep(500); unpause(); await window.__shot(name); }
function look(x, y, z, yaw, pitch = 0) { g.player.teleport(V(x, y, z), yaw); g.player.yaw = yaw; g.player.pitch = pitch; g.player.hp = g.player.maxHp || 100; }
async function torch() { const p = g.player, id = g.items.hostSpawn('flashlight', p.pos.clone().setY(p.pos.y + 1), { holder: g.selfId }); await frames(3, false); const sl = p.slots.indexOf(null); p.slots[sl] = id; p.slot = sl; g.refreshHeldVisuals?.(); const it = g.items.get(id); if (it && !it.on) g.useHeldPress(); await frames(4, false); return !!it?.on; }
function roomSpot(pred) {
  const f = fac(), L = f.layout, C = L.cell, rooms = L.rooms.filter(pred).sort((a, b) => b.w * b.h - a.w * a.h), r = rooms[0]; if (!r) return null;
  const cx = L.ox + (r.x + r.w / 2) * C, cz = L.oz + (r.z + r.h / 2) * C, sx = L.ox + (r.x + 0.9) * C, sz = L.oz + (r.z + r.h - 0.9) * C;
  const wk = (x, z) => { const n = f.nav.nearestWalkable(...f.nav.toGrid(x, z), 10); return n ? f.nav.toWorld(n[0], n[1]) : { x, z }; };
  const a = wk(sx, sz), b = wk(cx, cz);
  return { x: a.x, z: a.z, y: L.y, tx: b.x, tz: b.z };
}
function regions() {   // what is really on screen: .hud direct blocks + visible dock items, skipping the always-hidden ones
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; const r = e.getBoundingClientRect(); return r.width > 8 && r.height > 8 && r.right > 0 && r.left < innerWidth; };
  const out = [];
  for (const e of document.querySelectorAll('.hud > *, .hud-dock-item, .objectives, .tfg-asg, .hud-tl > *')) if (!e.classList.contains('hc-off') && !e.classList.contains('visor') && vis(e)) out.push((e.dataset.dockId ? 'dock:' + e.dataset.dockId : e.className).toString().slice(0, 28));
  return [...new Set(out)];
}
const st = async (name, fn) => { console.log('QA: start ' + name + ' ' + Math.round(performance.now() / 1000)); try { const r = await fn(); R.steps[name] = r === undefined ? 'ok' : r; } catch (e) { R.steps[name] = 'ERR ' + String(e && e.message || e).slice(0, 200); } };

await st('land', async () => {
  g.run.daysLeft = 3; g.run.moon = 'lufer'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  const t0 = performance.now(); while ((g.run.phase !== 'moon' || g.landQ?.pending) && performance.now() - t0 < 90000) { kefal.tick(1, 1 / 30, false); await sleep(15); }
  return g.run.phase;
});
await st('spot', async () => {
  const rooms = fac().layout.rooms, hub = rooms.find((r) => r.hub) || rooms.find((r) => /platform|station/.test(r.type)) || null;
  const s = roomSpot(hub ? (r) => r === hub : (r) => r.type !== 'entrance'); look(s.x, s.y + 0.02, s.z, yaw2(s.x, s.z, s.tx, s.tz), 0.03);
  R.torch = await torch(); g.profile.coins = (g.profile.coins || 0) + 3; g.ui.hud.setCoins(g.profile.coins, 3);   // a Clout change: row shows both for ~6 s
});
await st('torch', async () => {
  g.settings.hudDensity = 'standard'; g.hudcalm.pass();
  const s = roomSpot((r) => r.type !== 'entrance'); look(s.x, s.y + 0.02, s.z, yaw2(s.x, s.z, s.tx, s.tz) + 0.9, -0.28); await frames(10); await shot('shotfix_torch.jpg');
});
await st('crt', async () => {
  const a2 = g.algo2, gl = a2?.debug?.glitches?.() || []; R.glitches = gl.map((x) => x.type);
  const f = gl.find((x) => x.type === 'freeze') || gl[0]; if (!f) return 'no glitch';
  const ang = 0.6; look(f.x + Math.sin(ang) * 3.2, f.y + 0.02, f.z + Math.cos(ang) * 3.2, Math.atan2(-(f.x - (f.x + Math.sin(ang) * 3.2)), -(f.z - (f.z + Math.cos(ang) * 3.2))), -0.15);
  await frames(10); await shot('shotfix_crt.jpg');
});
return R;
