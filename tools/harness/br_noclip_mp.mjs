// Multiplayer check for the Backrooms module (module 'backrooms'): host + client + late joiner in one browser
// context (network 'local' = BroadcastChannel). Pages are driven with kefal.tick, like headless.mjs.
//   flock /tmp/tfg-browser.lock node tools/harness/br_noclip_mp.mjs --port 5202
// Checks: the client noclips through the glitch wall (host-authoritative membership, same pocket key on both peers,
// loot resting on the client), the host follows through the open wall, walkies are dead between them, the client
// takes the EXIT, and a late joiner builds the same pocket before the welcome's items are created.
import { createRequire } from 'module';
import { execSync } from 'child_process';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = arg('port', '5173');
let chromium;
try { chromium = createRequire(import.meta.url)('playwright').chromium; }
catch { const root = execSync('npm root -g').toString().trim(); chromium = createRequire(root + '/')('playwright').chromium; }

// background pages must keep their timers (the local transport drops a peer after 5 s without a heartbeat)
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
// This machine is shared and slow: a synchronous map build can stall a page for > 5 s and the local transport then
// drops the peer ("The host has left"). Test-only: every page keeps peers that merely time out (a real 'bye' still
// removes them). Installed from an init script so it is in place within 100 ms of the transport being created.
await ctx.addInitScript(() => {
  setInterval(() => {
    const t = window.kefal?.game?.net?.transport;
    if (!t || t.__sticky || !t.ch) return;
    t.__sticky = true;
    const orig = t.onPeerLeave;
    t.onPeerLeave = (id) => { if (t.__bye?.has(id)) return orig?.(id); t.peers.add(id); };
    const prev = t.ch.onmessage;
    t.ch.onmessage = (ev) => { if (ev.data?.t === 'bye') (t.__bye ||= new Set()).add(ev.data.from); prev(ev); };
  }, 100);
});
const logs = [];
const watch = (p, tag) => {
  p.on('pageerror', (e) => logs.push(tag + ' pageerror: ' + String(e.stack || e.message).slice(0, 600)));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) logs.push(tag + ' console: ' + m.text().slice(0, 300)); });
  p.on('dialog', (d) => { logs.push(tag + ' dialog: ' + d.message()); d.dismiss().catch(() => {}); });
};
const code = 'BRMP' + Math.floor(Math.random() * 90 + 10);
const out = { code };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = (p, n = 2) => p.evaluate((k) => kefal.tick(k, 1 / 30, false), n);
const small = (p) => p.evaluate(async () => { const { MOONS } = await import('/src/game/moons.js'); MOONS.hamsi.brGlitch = 1; });
const all = async (pages, rounds) => { for (let i = 0; i < rounds; i++) { for (const p of pages) await tick(p); await sleep(8); } };

const host = await ctx.newPage(); watch(host, 'host');
await host.goto(`http://127.0.0.1:${port}/?autohost=local&code=${code}&name=Host`, { timeout: 120000 });
await host.waitForFunction(() => window.kefal?.game?.run && window.kefal.game.net?.isHost, null, { timeout: 120000 });
const cli = await ctx.newPage(); watch(cli, 'client');
await cli.goto(`http://127.0.0.1:${port}/?autojoin=${code}&net=local&name=Client`, { timeout: 120000 });
await cli.waitForFunction(() => window.kefal?.game?.run && window.kefal.game.net?.connected, null, { timeout: 120000 }).catch(() => { out.joinTimeout = true; });
await small(host); await small(cli);
await host.evaluate(() => { kefal.game.backrooms.debug.spotOpenS = 900; });   // the slow test machine needs longer than 75 s
out.sticky = await cli.evaluate(() => !!kefal.game?.net?.transport?.__sticky);
await all([host, cli], 20);

// host lands on 56K-Dialup with the glitch wall forced (same moon data on every peer: world gen is deterministic)
await host.evaluate(() => { const g = kefal.game; g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding(); });
await all([host, cli], 70);
out.landed = await cli.evaluate(() => (kefal.game ? { phase: kefal.game.run.phase, theme: kefal.game.world.facility?.layout?.theme, spot: !!kefal.game.backrooms.spot } : null));
if (!out.landed) {
  out.hostState = await host.evaluate(() => ({ game: !!kefal.game, phase: kefal.game?.run?.phase, peers: [...(kefal.game?.net?.transport?.peers || [])].length, sticky: !!kefal.game?.net?.transport?.__sticky }));
  out.logs = logs; console.log(JSON.stringify(out, null, 1)); await b.close(); process.exit(1);
}

try {
// 1) the client noclips through the wall
await cli.evaluate(() => {
  const g = kefal.game, s = g.backrooms.spot;
  g.player.teleport(s.pos.clone().addScaledVector(s.normal, 1.3), Math.atan2(s.normal.x, s.normal.z));
});
await all([host, cli], 8);   // the host sees the client walk up to the wall
out.clientEnter = await cli.evaluate(() => ({ started: kefal.game.backrooms.enter('spot') }));
for (let i = 0; i < 80; i++) { await all([host, cli], 1); if (!(await cli.evaluate(() => !!kefal.game.backrooms.debug.cine))) break; }
await all([host, cli], 20);
const cid = await cli.evaluate(() => kefal.game.selfId);
const hid = await host.evaluate(() => kefal.game.selfId);
out.afterClientEnter = {
  host: await host.evaluate((id) => { const B = kefal.game.backrooms; return { members: B.state?.m, key: B.pocket?.key, clientInside: B.inPocket(id), sp: B.state?.sp }; }, cid),
  client: await cli.evaluate(() => {
    const g = kefal.game, B = g.backrooms, pk = B.pocket;
    const loot = pk ? [...g.items.all()].filter((it) => it.state === 'world' && pk.contains(it.obj.position)) : [];
    return { inPocket: B.inPocket(), key: pk?.key, y: +g.player.pos.y.toFixed(2), loot: loot.length, lootOnFloor: loot.filter((it) => Math.abs(it.obj.position.y - pk.y) < 1.2).length, dock: !!document.querySelector('[data-dock-id="br_level0"]') };
  }),
};

// 2) the host follows through the (now open) wall
await host.evaluate(() => {
  const g = kefal.game, s = g.backrooms.spot;
  g.player.teleport(s.pos.clone().addScaledVector(s.normal, 1.3), Math.atan2(s.normal.x, s.normal.z));
});
await all([host, cli], 4);
await host.evaluate(() => kefal.game.backrooms.enter('spot'));
for (let i = 0; i < 80; i++) { await all([host, cli], 1); if (!(await host.evaluate(() => !!kefal.game.backrooms.debug.cine))) break; }
await all([host, cli], 20);
out.bothInside = {
  host: await host.evaluate((id) => { const g = kefal.game, B = g.backrooms; const r = g.remotes.get(id); return { inPocket: B.inPocket(), members: B.state?.m?.length, clientAvatarInPocket: !!(r && B.pocket.contains(r.pos)), walkieToClient: g.hasActiveWalkie(id) }; }, cid),
  client: await cli.evaluate((id) => { const g = kefal.game; const r = g.remotes.get(id); return { hostAvatarInPocket: !!(r && g.backrooms.pocket?.contains(r.pos)), members: g.backrooms.state?.m?.length }; }, hid),
};

// 3) a late joiner while the pocket is live
const late = await ctx.newPage(); watch(late, 'late');
await late.goto(`http://127.0.0.1:${port}/?autojoin=${code}&net=local&name=Late`, { timeout: 120000 });
await late.waitForFunction(() => window.kefal?.game?.net, null, { timeout: 120000 }).catch(() => {});
for (let i = 0; i < 60; i++) { await all([host, cli], 1); if (await late.evaluate(() => !!(kefal.game?.run && kefal.game.net?.connected))) break; await sleep(300); }
out.lateNet = await late.evaluate(() => ({ connected: !!kefal.game?.net?.connected, hostId: kefal.game?.net?.hostId || null, peers: [...(kefal.game?.net?.transport?.peers || [])].length }));
out.hostNet = await host.evaluate(() => ({ players: kefal.game.net.players.size, peers: [...kefal.game.net.transport.peers].length }));
await all([host, cli, late], 30);
out.lateJoiner = await late.evaluate(() => {
  const g = kefal.game, B = g.backrooms, pk = B.pocket;
  const loot = pk ? [...g.items.all()].filter((it) => it.state === 'world' && pk.contains(it.obj.position)) : [];
  return { key: pk?.key || 0, members: B.state?.m?.length, loot: loot.length, lootOnFloor: loot.filter((it) => Math.abs(it.obj.position.y - pk.y) < 1.2).length };
});
out.hostKey = await host.evaluate(() => kefal.game.backrooms.pocket?.key);

// 4) the client takes the EXIT
await cli.evaluate(() => kefal.game.backrooms.exit());
await all([host, cli, late], 20);
out.afterClientExit = {
  host: await host.evaluate((id) => ({ members: kefal.game.backrooms.state?.m, clientInside: kefal.game.backrooms.inPocket(id) }), cid),
  client: await cli.evaluate(() => ({ inPocket: kefal.game.backrooms.inPocket(), atEntrance: kefal.game.world.facility.mainDoor.spawn.distanceTo(kefal.game.player.pos) < 2, dock: !!document.querySelector('[data-dock-id="br_level0"]') })),
};
} catch (e) { out.error = String(e.message).slice(0, 300); }
out.logs = logs.slice(0, 30);
console.log(JSON.stringify(out, null, 1));
await b.close();
