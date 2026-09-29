// Body for headless_menu.mjs (wave 4 'daily'): main-menu DAILY entry (NEW! badge) and the DAILY screen without a game.
//   flock /tmp/tfg-browser.lock node tools/harness/headless_menu.mjs --port 5187 --script tools/harness/wave4_daily_menu.js --shot /tmp/daily_menu.png
const app = kefal, out = {}, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
out.items = app.menu.items.map((i) => i.id);
app.menu.refreshDailyBadge();
out.badge = app.menu.dailyBadge;
app.ui.showMenu('daily');
await sleep(500);
const panel = document.querySelector('.dy');
const r = panel?.getBoundingClientRect();
out.panel = { open: !!panel, fits: !!r && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, rect: r && [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], days: document.querySelectorAll('.dy-day').length };
const claim = [...document.querySelectorAll('.dy .btn')].find((b) => /CLAIM DAY/.test(b.textContent));
out.claimButton = !!claim;
const coins0 = app.profile.coins;
claim?.click();
await sleep(300);
out.afterClaim = { coins: app.profile.coins - coins0, streak: app.profile.daily?.login?.streak, canClaimAgain: !![...document.querySelectorAll('.dy .btn')].find((b) => /CLAIM DAY/.test(b.textContent)), stash: Object.keys(app.profile.daily?.stash || {}) };
out.errs = errs;
return out;
