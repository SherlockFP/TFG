// Two-tab host migration check (LocalTransport / BroadcastChannel) in one headless browser context.
// Usage: flock /tmp/tfg-browser.lock node tools/harness/wave4_hostmig_mp.mjs [--port 5181] [--shot out.png]
// Host lands on a moon, a creature + an item exist, the host tab closes (bye), the client shows the "HOST LEFT" dialog,
// presses Continue, becomes host and keeps simulating (creatures / items present, no pageerrors).
import { createRequire } from 'module';
import { execSync } from 'child_process';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = arg('port', '5181'), shot = arg('shot', '');
let chromium;
try { chromium = createRequire(import.meta.url)('playwright').chromium; }
catch { chromium = createRequire(execSync('npm root -g').toString().trim() + '/')('playwright').chromium; }
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const logs = [], out = {};
const mk = async (url, tag) => {
  const p = await ctx.newPage();
  p.on('dialog', (d) => { logs.push(tag + ' dialog: ' + d.message()); d.dismiss().catch(() => {}); });
  p.on('pageerror', (e) => logs.push(tag + ' pageerror: ' + String(e.stack || e.message).slice(0, 400)));
  p.on('console', (m) => { if (m.type() === 'error') logs.push(tag + ' error: ' + m.text().slice(0, 300)); });
  await p.goto(`http://127.0.0.1:${port}${url}`);
  await p.waitForFunction(() => window.kefal?.game, null, { timeout: 120000 });
  return p;
};
const host = await mk('/?autohost=local&code=HMIG01&name=Host', 'host');
await host.waitForTimeout(2500);
const cli = await mk('/?autojoin=HMIG01&net=local&name=Client', 'client');
await cli.waitForFunction(() => kefal.game?.net?.connected, null, { timeout: 60000 });
const tick = (p, n) => p.evaluate((n) => { for (let i = 0; i < n; i++) kefal.tick(1, 1 / 30, false); }, n);
await host.evaluate(() => { const g = kefal.game; g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding(); });
for (let i = 0; i < 10; i++) { await tick(host, 10); await tick(cli, 10); await host.waitForTimeout(30); }
await host.evaluate(() => { const g = kefal.game; g.creatures.hostSpawn('scuttler', new THREE.Vector3(2, 1, 14), { level: 2 }); });
for (let i = 0; i < 6; i++) { await tick(host, 10); await tick(cli, 10); await host.waitForTimeout(30); }
// the crew snapshot is broadcast every 3 s of wall time
await host.waitForTimeout(3500); await tick(cli, 5);
out.before = await cli.evaluate(() => { const g = kefal.game; return { phase: g.run?.phase, host: g.isHost, hostId: g.net.hostId, creatures: g.creatures.views.size, items: g.items.items.size, epoch: g.net.hostEpoch, order: g.hostmig.state().order.length, snap: g.hostmig.state().hasSnapshot }; });
out.hostCreatures = await host.evaluate(() => kefal.game.creatures.host.size);
// the host quits: net.leave() sends 'bye' (a real tab close may not fire pagehide in headless; a crash without bye needs ~15 s LocalTransport timeout + 6 s prompt delay)
await host.evaluate(() => kefal.game.net.leave());
await host.close();
await cli.waitForFunction(() => kefal.game?.hostmig?.state().phase === 'prompt', null, { timeout: 60000 });
await tick(cli, 20);
out.dialog = await cli.evaluate(() => ({ text: document.querySelector('.hostmig')?.innerText || null, state: kefal.game.hostmig.state() }));
if (shot) await cli.screenshot({ path: shot });
await cli.evaluate(() => kefal.game.hostmig.accept());
await cli.waitForFunction(() => kefal.game?.isHost, null, { timeout: 20000 });
for (let i = 0; i < 12; i++) { await tick(cli, 10); await cli.waitForTimeout(30); }
out.after = await cli.evaluate(() => { const g = kefal.game; return { host: g.isHost, hostId: g.net.hostId, epoch: g.net.hostEpoch, creaturesHost: g.creatures.host.size, views: g.creatures.views.size, items: g.items.items.size, phase: g.run.phase, time: +g.run.time.toFixed(1), hostData: !!g.hostData, dialogGone: !document.querySelector('.hostmig'), saveSlot: g.saveSlot }; });
const t0 = out.after.time;
for (let i = 0; i < 12; i++) { await tick(cli, 30); }
out.clockAdvanced = await cli.evaluate((t0) => +(kefal.game.run.time - t0).toFixed(2), t0);
out.logs = logs.filter((l) => !/dialog: /.test(l)).slice(0, 20);
console.log(JSON.stringify(out, null, 1));
await b.close();
const bad = !out.after.host || out.after.creaturesHost < 1 || out.logs.some((l) => /pageerror/.test(l));
process.exit(bad ? 1 : 0);
