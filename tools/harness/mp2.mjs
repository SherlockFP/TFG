// Two-tab local multiplayer check (host + client over BroadcastChannel) in one headless browser context.
// Usage: flock /tmp/tfg-browser.lock node tools/harness/mp2.mjs [--port 5173]
// Lands on a moon, walks the host around, and reports what the client sees + network rates on both sides.
import { createRequire } from 'module';
import { execSync } from 'child_process';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = arg('port', '5173');
let chromium;
try { chromium = createRequire(import.meta.url)('playwright').chromium; }
catch { chromium = createRequire(execSync('npm root -g').toString().trim() + '/')('playwright').chromium; }
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
const logs = [];
const mk = async (url, tag) => {
  const p = await ctx.newPage();
  p.on('dialog', (d) => { logs.push(tag + ' dialog: ' + d.message()); d.dismiss().catch(() => {}); });
  p.on('pageerror', (e) => logs.push(tag + ' pageerror: ' + String(e.stack || e.message).slice(0, 400)));
  p.on('console', (m) => { if (m.type() === 'error') logs.push(tag + ' error: ' + m.text().slice(0, 300)); });
  await p.goto(`http://127.0.0.1:${port}${url}`);
  await p.waitForFunction(() => window.kefal?.game, null, { timeout: 120000 });
  return p;
};
const host = await mk('/?autohost=local&code=MP2TST&name=Host', 'host');
await host.waitForTimeout(2500);
const cli = await mk('/?autojoin=MP2TST&net=local&name=Client', 'client');
await cli.waitForFunction(() => kefal.game?.net?.connected, null, { timeout: 60000 }).catch(async () => logs.push('client never connected: ' + await cli.evaluate(() => JSON.stringify({ g: !!kefal.game, menu: document.querySelector('.menu')?.innerText?.slice(0, 200), dlg: document.body.innerText.slice(0, 300) }))));
if (!(await cli.evaluate(() => !!kefal.game))) { console.log(JSON.stringify(logs, null, 1)); await b.close(); process.exit(1); }
// both tabs are hidden-ish in headless; drive the sim manually on both
const tick = (p, n) => p.evaluate((n) => { for (let i = 0; i < n; i++) kefal.tick(1, 1 / 30, false); }, n);
const hs = await host.evaluate(() => ({ g: !!kefal.game, txt: document.body.innerText.slice(0, 300) }));
if (!hs.g) { console.log(JSON.stringify({ hostGone: hs, logs }, null, 1)); await b.close(); process.exit(1); }
await host.evaluate(() => { const g = kefal.game; g.net.measureBytes = true; g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding(); });
await cli.evaluate(() => { kefal.game.net.measureBytes = true; });
for (let i = 0; i < 12; i++) { await tick(host, 10); await tick(cli, 10); await host.waitForTimeout(30); }
const s0 = await host.evaluate(() => ({ ...kefal.game.net.stats, byType: { ...kefal.game.net.stats.byType } }));
const c0 = await cli.evaluate(() => ({ ...kefal.game.net.stats, byType: { ...kefal.game.net.stats.byType } }));
// 10 simulated seconds: host walks in a circle outside, client idles
const SEC = 10;
for (let i = 0; i < SEC * 3; i++) {
  await host.evaluate((i) => { const p = kefal.game.player; p.teleport(new THREE.Vector3(Math.cos(i / 6) * 6, 1, 12 + Math.sin(i / 6) * 6)); kefal.tick(10, 1 / 30, false); }, i);
  await tick(cli, 10);
}
const s1 = await host.evaluate(() => ({ ...kefal.game.net.stats, byType: { ...kefal.game.net.stats.byType } }));
const c1 = await cli.evaluate(() => ({ ...kefal.game.net.stats, byType: { ...kefal.game.net.stats.byType } }));
const seen = await cli.evaluate(() => {
  const g = kefal.game, r = [...g.remotes.values()][0];
  const hp = r ? r.target.toArray().map((v) => +v.toFixed(1)) : null;
  return { phase: g.run?.phase, remotes: g.remotes.size, hostPosSeen: hp, creatureViews: g.creatures.views.size, items: g.items.items.size };
});
const truth = await host.evaluate(() => { const g = kefal.game; return { pos: g.player.pos.toArray().map((v) => +v.toFixed(1)), creatures: g.creatures.host.size, items: g.items.items.size }; });
const rate = (a, b, k) => +((b[k] - a[k]) / SEC).toFixed(1);
const types = (a, b) => Object.fromEntries(Object.entries(b.byType).map(([k, v]) => [k, +((v - (a.byType[k] || 0)) / SEC).toFixed(1)]).filter(([, v]) => v > 0));
console.log(JSON.stringify({
  host: { msgsPerSec: rate(s0, s1, 'sent'), packetsOutPerSec: rate(s0, s1, 'packetsOut'), KBoutPerSec: +((s1.bytesOut - s0.bytesOut) / SEC / 1024).toFixed(2), types: types(s0, s1) },
  client: { msgsPerSec: rate(c0, c1, 'sent'), packetsOutPerSec: rate(c0, c1, 'packetsOut'), KBoutPerSec: +((c1.bytesOut - c0.bytesOut) / SEC / 1024).toFixed(2), KBinPerSec: +((c1.bytesIn - c0.bytesIn) / SEC / 1024).toFixed(2), types: types(c0, c1) },
  clientSees: seen, hostTruth: truth, logs: logs.slice(0, 20),
}, null, 1));
await b.close();
