// UI2 screenshot runner: main menu + in-run HUD + panels, ONE browser launch (hold the shared lock once). Usage:
//   flock /tmp/tfg-browser.lock node tools/harness/ui2_shots.mjs --port 5194 --out DIR [--sizes 1280x720,1920x1080] [--both] [--only menu,hud,inv,shop,roles,panels]
// --both captures every state twice: theme on ("after_*") and theme off ("before_*", html.tfg-ui removed), on the same page state.
// Each shot is DIR/<after|before>_<WxH>_<name>.jpg. Prints page errors.
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = arg('port', '5173'), out = arg('out', '.'), tag = arg('tag', 'after');
const sizes = arg('sizes', '1280x720').split(',').map((s) => s.split('x').map(Number));
const only = arg('only', '') ? arg('only').split(',') : null;
const both = process.argv.includes('--both');
let chromium;
try { chromium = createRequire(import.meta.url)('playwright').chromium; }
catch { const root = execSync('npm root -g').toString().trim(); chromium = createRequire(root + '/')('playwright').chromium; }
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: sizes[0][0], height: sizes[0][1] } });
const logs = [];
p.on('console', (m) => { if (m.type() === 'error') logs.push('error: ' + m.text().slice(0, 300)); });
p.on('pageerror', (e) => logs.push('pageerror: ' + String(e.stack || e.message).slice(0, 600)));
const want = (n) => !only || only.includes(n);
let cur = sizes[0].join('x');
const snap = (pre, name) => p.screenshot({ path: `${out}/${pre}_${cur}_${name}.jpg`, type: 'jpeg', quality: 72 });
const shot = async (name) => {
  await p.waitForTimeout(300);
  await snap(both ? 'after' : tag, name);
  if (both) {
    await p.evaluate(() => document.documentElement.classList.remove('tfg-ui'));
    await p.waitForTimeout(200);
    await snap('before', name);
    await p.evaluate(() => document.documentElement.classList.add('tfg-ui'));
  }
  console.log('shot', cur, name);
};
const resize = async ([w, h]) => { await p.setViewportSize({ width: w, height: h }); cur = w + 'x' + h; await p.waitForTimeout(500); };
const ev = async (code) => { try { return await p.evaluate(`(async()=>{${code}\n})()`); } catch (e) { console.log('EVAL ERROR', e.message.slice(0, 300)); } };

if (want('menu')) {
  await p.goto(`http://127.0.0.1:${port}/`);
  await p.waitForFunction(() => window.kefal?.menu?.room, null, { timeout: 120000 }).catch(() => logs.push('TIMEOUT menu'));
  await p.waitForTimeout(1200);
  await ev(`kefal.menu.room.skipBoot?.(); for(let i=0;i<40;i++) kefal.menu.update(1/30);`);
  for (const sz of sizes) {
    await resize(sz);
    await ev(`kefal.ui.showMenu('title')`); await shot('menu_title');
    await ev(`kefal.ui.showMenu('host')`); await shot('menu_host');
    if (sz === sizes[0]) { await ev(`kefal.ui.showMenu('character')`); await shot('menu_character'); }
  }
  await resize(sizes[0]);
}
if (['hud', 'inv', 'shop', 'roles', 'panels'].some(want)) {
  await p.goto(`http://127.0.0.1:${port}/?autohost=local&code=T1&name=Tester`);
  await p.waitForFunction(() => window.kefal?.game, null, { timeout: 120000 }).catch(() => logs.push('TIMEOUT game'));
  await p.waitForTimeout(3500);
  await ev(`const g=kefal.game; g.run.credits=4200; try{ g.profile.coins=900; g.profile.level=7; }catch{}
    g.run.daysLeft=3; g.run.moon='hamsi'; g.player.inShip=true; g.hostLever(g.selfId); g.hostFinishLanding();
    for (let i=0;i<30;i++){ kefal.tick(10,1/30,false); await new Promise(r=>setTimeout(r,10)); }
    g.player.inShip=false; kefal.tick(20,1/30,false);`);
  for (const sz of sizes) {
    await resize(sz);
    if (want('hud')) { await ev(`kefal.tick(6,1/30,false)`); await shot('hud'); }
    if (want('inv')) { await ev(`kefal.game.inventory?.open()`); await shot('inventory'); await ev(`kefal.game.inventory?.close()`); }
    if (want('shop')) { await ev(`kefal.game.ui.openShop(kefal.game)`); await shot('shop'); await ev(`kefal.game.ui.closePanel(true)`); }
    if (want('roles')) { await ev(`kefal.game.rpg?.openRoles()`); await shot('roles'); await ev(`kefal.game.ui.closePanel(true)`); }
  }
  await resize(sizes[0]);
  if (want('panels')) {
    const list = [['tree', 'kefal.game.rpg?.open()'], ['market', 'kefal.game.ui.openMarket(kefal.game)'], ['pause', 'kefal.game.ui.openPause()'],
      ['shipyard', 'kefal.game.shipyard?.open?.()'], ['pets', 'kefal.game.pets?.open?.()'], ['crafting', 'kefal.game.crafting?.open?.()'],
      ['bounties', 'kefal.game.ui.openBounties(kefal.game)']];
    for (const [n, code] of list) { await ev(code); await shot('panel_' + n); await ev(`kefal.game.ui.closePanel(true)`); }
  }
}
console.log('LOGS', JSON.stringify(logs.slice(0, 30), null, 1));
await b.close();
