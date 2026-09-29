// Body for headless.mjs (wave 8 soul): ship whiteboard + poster, then a story beat on two moons at different palettes; the 4 captures are tiled into one screenshot.
//   node tools/harness/headless.mjs --port PORT --script tools/harness/wave8_soul.js --shot out.png --wait 4000
const g = kefal.game, errs = [], V = THREE.Vector3;
addEventListener('error', (e) => errs.push(e.message));
const shots = [];
const cap = (label) => {
  kefal.tick(2, 1 / 30, true);
  const cv = g.engine.renderer.domElement;
  shots.push({ label, url: cv.toDataURL('image/jpeg', 0.82) });
};
const look = (pos, target) => {
  g.player.teleport(pos, Math.atan2(-(target.x - pos.x), -(target.z - pos.z)));
  g.player.pitch = Math.atan2(target.y - pos.y - 1.6, Math.hypot(target.x - pos.x, target.z - pos.z));
  for (let i = 0; i < 6; i++) kefal.tick(1, 1 / 30, false);
};
const S = g.soul;
const info = { soul: !!S };
// ---- ship (orbit): whiteboard, then the poster
g.player.inShip = true;
look(new V(-2.3, 0.05, -1.95), new V(-3.9, 1.6, -1.95)); cap('whiteboard');
look(new V(-5.7, 0.05, -1.9), new V(-4.1, 1.55, -1.9)); cap('poster');
// ---- moons
const land = async (m, t) => {
  g.run.daysLeft = 3; g.run.moon = m; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  for (let i = 0; i < 25; i++) { kefal.tick(10, 1 / 30, false); await new Promise((r) => setTimeout(r, 8)); }
  g.run.time = t; g.env.timeMin = t;
  const beats = S.plan(), pal = S.palette(m);
  const b = beats.find((s) => s.kind === 'sponsor') || beats[0];
  if (b) {
    const back = 9, px = b.x - Math.sin(b.yaw) * 0 + Math.sin(b.yaw) * back, pz = b.z + Math.cos(b.yaw) * back;
    look(new V(px, g.world.terrain.heightAt(px, pz) + 0.05, pz), new V(b.x, b.y + 1.6, b.z));
    g.player.inShip = false;
  }
  for (let i = 0; i < 8; i++) kefal.tick(1, 1 / 30, false);
  cap(m + ' ' + (b?.kind || 'none'));
  info[m] = { beats: beats.map((s) => s.kind + '@' + Math.round(s.s)), pal: !!pal };
  g.player.teleport(new V(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); kefal.tick(5, 1 / 30, false);
};
await land('hamsi', 17 * 60 + 40);
await land('palamut', 12 * 60);
// ---- tile the captures into the page so --shot sees all of them
const wrap = document.createElement('div');
wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:2px';
for (const s of shots) { const im = new Image(); im.src = s.url; im.style.cssText = 'width:100%;height:100%;object-fit:cover'; wrap.appendChild(im); }
document.body.appendChild(wrap);
await new Promise((r) => setTimeout(r, 600));
info.errs = errs; info.n = shots.length;
return info;
