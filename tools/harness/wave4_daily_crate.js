// Body for headless.mjs (wave 4 'daily'): open a legendary season crate through the panel and wait for the reveal to land.
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5187 --script tools/harness/wave4_daily_crate.js --shot /tmp/daily_crate.png --wait 4000
const g = kefal.game, out = {}, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ---- smoke: land on one moon + take off (same steps as smoke_land.js) so the daily observers see a real phase change
for (const m of ['hamsi']) {
  g.run.daysLeft = 3; g.run.moon = m; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  for (let i = 0; i < 20; i++) { kefal.tick(10, 1 / 30, false); await sleep(10); }
  out.landed = { m, theme: g.world.facility?.layout?.theme, creatures: g.creatures.host.size, phase: g.run.phase };
  g.player.teleport(new THREE.Vector3(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); kefal.tick(5, 1 / 30, false);
}
const C = await import('/src/game/daily_core.js');
// ---- the menu path: same panel + service with NO game (what the main-menu DAILY screen builds)
{
  const { createDailyService } = await import('/src/game/daily_svc.js');
  const { createDailyPanel } = await import('/src/ui/panels/daily.js');
  const svc0 = createDailyService({ profile: g.profile, ui: g.ui, audio: g.audio });
  const p0 = createDailyPanel({ ui: g.ui, svc: svc0, closeButton: g.ui.backButton(() => {}) });
  out.menuPath = { built: !!p0.el, tabs: p0.el.querySelectorAll('.tabs .btn').length, days: p0.el.querySelectorAll('.dy-day').length };
  p0.dispose();
}
const D = g.daily;
C.grantCrate(g.profile, 'season', 'harness', { tier: 'legendary' });
D.open('crates');
await sleep(300);
const btn = [...document.querySelectorAll('.dy-cr .btn')][0];
out.crateCards = document.querySelectorAll('.dy-cr').length;
btn.click();
await sleep(1200);
out.phase1 = { reveal: !!document.querySelector('.dy-rv'), crate: !!document.querySelector('.dy-crate') };
let landed = false;
for (let i = 0; i < 60 && !landed; i++) { await sleep(200); landed = !!document.querySelector('.dy-rv.win'); }
await sleep(900);
out.reelLanded = landed;
out.result = document.querySelector('.dy-res .big')?.textContent;
out.sub = document.querySelector('.dy-res .sub')?.textContent;
out.cards = document.querySelectorAll('.dy-card').length;
out.cratesLeft = C.ensureDaily(g.profile).crates.length;
out.errs = errs;
return out;
