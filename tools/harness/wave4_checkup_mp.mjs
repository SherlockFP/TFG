// Wave-4 checkup: two-tab MP stability (host + client over BroadcastChannel) with the REAL render loops running.
//   flock /tmp/tfg-browser.lock node tools/harness/wave4_checkup_mp.mjs --port 5190 [--secs 60] [--shot out.png]
// Host lands on 56K-Dialup and walks; every 10 s both tabs report connection state, remotes, net stats and message rates.
// Reports stalls / lost / reconnects / rejoins / graceExpired (the "friends drop" counters) and per-type msg rates.
import { createRequire } from 'module';
import { execSync } from 'child_process';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = arg('port', '5173');
const SECS = Number(arg('secs', '60'));
const shot = arg('shot', null);
let chromium;
try { chromium = createRequire(import.meta.url)('playwright').chromium; }
catch { chromium = createRequire(execSync('npm root -g').toString().trim() + '/')('playwright').chromium; }
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
const logs = new Map();
const add = (s) => logs.set(s, (logs.get(s) || 0) + 1);
const mk = async (url, tag) => {
  const p = await ctx.newPage();
  p.on('dialog', (d) => { add(tag + ' dialog: ' + d.message()); d.dismiss().catch(() => {}); });
  p.on('pageerror', (e) => add(tag + ' pageerror: ' + String(e.stack || e.message).slice(0, 500)));
  p.on('console', (m) => { if (m.type() === 'error') add(tag + ' error: ' + m.text().slice(0, 300)); });
  await p.goto(`http://127.0.0.1:${port}${url}`);
  await p.waitForFunction(() => window.kefal?.game, null, { timeout: 120000 });
  return p;
};
const host = await mk('/?autohost=local&code=CKMP01&name=Host', 'host');
await host.waitForTimeout(2000);
const cli = await mk('/?autojoin=CKMP01&net=local&name=Client', 'client');
const joined = await cli.waitForFunction(() => kefal.game?.net?.connected && kefal.game.remotes.size > 0, null, { timeout: 60000 }).then(() => true).catch(() => false);
const snap = (p) => p.evaluate(() => {
  const g = kefal.game; if (!g) return { gone: true };
  const s = g.net.stats;
  return { t: performance.now(), connected: !!g.net.connected, remotes: g.remotes.size, phase: g.run?.phase, moon: g.run?.moon, sent: s.sent, recv: s.recv, packetsOut: s.packetsOut, packetsIn: s.packetsIn, bytesOut: s.bytesOut, bytesIn: s.bytesIn,
    lost: s.lost, reconnects: s.reconnects, rejoins: s.rejoins, dropped: s.dropped, stalls: s.stalls, graceExpired: s.graceExpired, byType: { ...s.byType },
    pos: g.player.pos.toArray().map((v) => Math.round(v * 10) / 10), remotePos: [...g.remotes.values()].map((r) => r.target?.toArray?.().map((v) => Math.round(v * 10) / 10)), hp: g.player.hp };
});
await host.evaluate(() => { const g = kefal.game; g.net.measureBytes = true; g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding(); });
await cli.evaluate(() => { kefal.game.net.measureBytes = true; });
await host.waitForTimeout(5000);
// host walks a circle in real time (its own rAF loop runs; the walk is a timer so both tabs keep their real loops)
await host.evaluate(() => { let i = 0; window.__walk = setInterval(() => { const p = kefal.game?.player; if (!p) return; i++; p.inShip = false; p.teleport(new THREE.Vector3(Math.cos(i / 12) * 6, (kefal.game.world.terrain?.heightAt?.(Math.cos(i / 12) * 6, 12 + Math.sin(i / 12) * 6) ?? 0) + 0.3, 12 + Math.sin(i / 12) * 6)); }, 100); });
const samples = [];
const h0 = await snap(host), c0 = await snap(cli);
let hp = h0, cp = c0;
for (let t = 10; t <= SECS; t += 10) {
  await host.waitForTimeout(10000);
  const h = await snap(host), c = await snap(cli);
  const dt = (h.t - hp.t) / 1000 || 10;
  samples.push({ t, host: { conn: h.connected, remotes: h.remotes, msgOut: +((h.sent - hp.sent) / dt).toFixed(1), pktOut: +((h.packetsOut - hp.packetsOut) / dt).toFixed(1), KBout: +((h.bytesOut - hp.bytesOut) / dt / 1024).toFixed(2), lost: h.lost, stalls: h.stalls, graceExp: h.graceExpired },
    client: { conn: c.connected, remotes: c.remotes, phase: c.phase, msgIn: +((c.recv - cp.recv) / dt).toFixed(1), msgOut: +((c.sent - cp.sent) / dt).toFixed(1), KBin: +((c.bytesIn - cp.bytesIn) / dt / 1024).toFixed(2), lost: c.lost, stalls: c.stalls, reconnects: c.reconnects, rejoins: c.rejoins, sawHostAt: c.remotePos?.[0], hostAt: h.pos } });
  hp = h; cp = c;
}
const h1 = hp, c1 = cp, T = (h1.t - h0.t) / 1000;
const types = (a, z) => Object.fromEntries(Object.entries(z.byType).map(([k, v]) => [k, +((v - (a.byType[k] || 0)) / T).toFixed(1)]).filter(([, v]) => v > 0.05).sort((x, y) => y[1] - x[1]));
if (shot) { try { await cli.screenshot({ path: shot, timeout: 60000 }); } catch (e) { add('shot fail ' + e.message.slice(0, 60)); } }
console.log(JSON.stringify({ joined, secs: +T.toFixed(1), samples, hostTypesPerSec: types(h0, h1), clientTypesPerSec: types(c0, c1), end: { host: { lost: h1.lost, stalls: h1.stalls, graceExpired: h1.graceExpired, dropped: h1.dropped, remotes: h1.remotes }, client: { lost: c1.lost, stalls: c1.stalls, reconnects: c1.reconnects, rejoins: c1.rejoins, dropped: c1.dropped, remotes: c1.remotes, phase: c1.phase } }, logs: [...logs].map(([s, n]) => (n > 1 ? `[x${n}] ` : '') + s).slice(0, 40) }, null, 1));
await b.close();
