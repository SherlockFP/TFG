// Wave 4 SOCIAL hub check in a real (headless) browser:  node tools/harness/wave4_social.mjs [--port 5184] [--out /tmp/dir]
// Two pages (Alice, Bob) in ONE browser context talk over the 'local' (BroadcastChannel) transport: presence, friends, DM + rate limit + XSS,
// lobby invite -> Join, walkie radio, phone notice. A third page (Carl) uses the default online strategy that cannot reach any relay in a
// sandbox: the hub must fail silently and the game must still start. Prints a JSON report; exit code 1 on failures / page errors.
import { createRequire } from 'module';
import { execSync } from 'child_process';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = arg('port', '5184');
const out = arg('out', '/tmp');
let chromium;
try { chromium = createRequire(import.meta.url)('playwright').chromium; }
catch { const root = execSync('npm root -g').toString().trim(); chromium = createRequire(root + '/')('playwright').chromium; }

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const logs = [];
const report = { checks: {}, logs };
const ok = (k, v) => { report.checks[k] = v; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { report.error = 'watchdog: run exceeded 150 s'; console.log(JSON.stringify(report, null, 1)); process.exit(2); }, 150000).unref?.();
const step = (s) => console.error('[social] ' + s);

async function open(name, extra = '') {
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') logs.push(name + ' console.error: ' + m.text().slice(0, 300)); });
  p.on('pageerror', (e) => logs.push(name + ' pageerror: ' + String(e.stack || e.message).slice(0, 600)));
  await p.goto(`http://127.0.0.1:${port}/?name=${name}${extra}`);
  await p.waitForFunction(() => window.kefal?.booted, null, { timeout: 120000 });
  await p.keyboard.press('Space');   // skip the CRT boot sequence
  await sleep(1500);
  return p;
}
const hubOf = (p, code) => p.evaluate(`(async()=>{ const h = kefal.hub; ${code} })()`);

try {
  const A = await open('Alice'), B = await open('Bob');
  for (const p of [A, B]) await p.evaluate(() => { kefal.settings.netStrategy = 'local'; kefal.hub.sync(); });
  await sleep(3500);
  const ids = {};
  ids.a = await A.evaluate(() => kefal.profile.id); ids.b = await B.evaluate(() => kefal.profile.id);
  ok('presence', await A.evaluate(() => ({ status: kefal.hub.status, online: kefal.hub.online().map((e) => e.n) })));

  // friends + DM
  await hubOf(A, `h.addFriend('${ids.b}', 'Bob');`);
  ok('dm1', await hubOf(A, `return h.sendDm('${ids.b}', 'hello Bob');`));
  await sleep(600);
  ok('bobHistory', await B.evaluate((a) => ({ hist: kefal.hub.history(a), unread: kefal.hub.totalUnread(), toasts: document.querySelectorAll('.hub-toast').length }), ids.a));
  // rate limit: 12 fast sends
  ok('rate', await hubOf(A, `let n = 0, blocked = 0; for (let i = 0; i < 12; i++) { const r = h.sendDm('${ids.b}', 'spam ' + i); if (r.ok) n++; else if (r.reason === 'rate') blocked++; } return { sent: n, blocked };`));
  // XSS attempt injected straight into Bob's receive path (Alice's own send limiter would block a 5th DM)
  ok('xssSend', await B.evaluate((a) => { const pid = [...kefal.hub.presence.map.keys()][0]; kefal.hub._onMsg({ t: 'sodm', d: { x: '<img src=x onerror="window.__xss=1"><b>bold</b>', id: a, n: 'Alice' } }, pid); return kefal.hub.history(a).length; }, ids.a));
  await sleep(300);
  step('xss');
  await B.bringToFront();
  await B.evaluate(() => { kefal.ui.showMenu('hub'); });
  await sleep(1800);
  ok('xssSafe', await B.evaluate(() => { document.querySelector('.hub-row')?.click(); return { xss: window.__xss === undefined, imgs: document.querySelectorAll('.hub-log img, .hub-toast img').length, bolds: document.querySelectorAll('.hub-log b:not(:first-child)').length }; }));
  await B.bringToFront(); await sleep(400);
  await B.screenshot({ path: out + '/social_bob_hub.png' });

  // hub panel on Alice with Bob selected
  await A.bringToFront();
  await A.evaluate(() => { kefal.ui.showMenu('hub'); });
  await sleep(1800);
  await A.evaluate(() => { document.querySelector('.hub-tabs .btn:nth-child(3)')?.click(); });
  await sleep(200);
  await A.evaluate(() => { document.querySelector('.hub-row')?.click(); });
  await sleep(300);
  ok('alicePanel', await A.evaluate(() => ({ rows: document.querySelectorAll('.hub-row').length, log: document.querySelector('.hub-log')?.textContent.slice(0, 120) })));
  await A.bringToFront(); await sleep(400);
  await A.screenshot({ path: out + '/social_alice_hub.png' });

  // in-run: Alice hosts, invites Bob, Bob joins from the invite toast
  await B.evaluate(() => kefal.ui.showMenu('title'));
  await B.bringToFront();
  step('host');
  await A.evaluate(() => { kefal.hostGame({ strategy: 'local', isPublic: false, slot: 3, lobbyName: 'Test crew', maxPlayers: 4, code: 'SOC123' }); return 1; });
  step('alice hosted?');
  await sleep(3000);
  ok('aliceRun', await A.evaluate(() => ({ ctx: kefal.hub.ctx, social: !!kefal.game?.social, state: kefal.game?.social?.state(), st: kefal.hub.beaconData().st })));
  await A.evaluate(() => kefal.hub._sendBeacon()); await sleep(1200);   // a beacon carrying st=lobby reaches Bob
  ok('bobSeesAlice', await B.evaluate(() => kefal.hub.online().map((e) => e.n + ':' + e.st)));
  ok('invite', await hubOf(A, `return h.invite('${ids.b}');`));
  await sleep(700);
  ok('bobInviteToast', await B.evaluate(() => ({ toasts: document.querySelectorAll('.hub-toast.inv').length, pending: kefal.hub.pendingInvite && kefal.hub.pendingInvite.code })));
  await B.screenshot({ path: out + '/social_bob_invite.png' });
  await B.evaluate(() => { [...document.querySelectorAll('.hub-toast.inv .btn')].find((x) => /join/i.test(x.textContent))?.click(); });
  await sleep(6000);
  ok('bobJoined', await B.evaluate(() => ({ game: !!kefal.game, players: kefal.game?.net?.players?.size, ctx: kefal.hub.ctx, social: !!kefal.game?.social })));

  // phone: DM in-run + radio
  ok('dmInRun', await hubOf(B, `return h.sendDm('${ids.a}', 'ship phone test');`));
  await sleep(600);
  ok('alicePhone', await A.evaluate(() => ({ lines: kefal.game.social.state().lines, text: document.querySelector('[data-dock-id="social-phone"]')?.textContent })));
  await A.screenshot({ path: out + '/social_alice_phone.png' });
  for (const p of [A, B]) await p.evaluate(() => { kefal.game.hasActiveWalkie = () => true; });
  await A.evaluate(() => { const g = kefal.game; g.social.tune([...g.net.players.keys()].find((k) => k !== g.selfId)); g.social.radioSend('radio check <b>one</b>'); });
  await sleep(700);
  ok('bobRadio', await B.evaluate(() => ({ text: document.querySelector('[data-dock-id="social-phone"]')?.textContent, chat: [...document.querySelectorAll('#chat-log .chat-line, .chat-line')].map((x) => x.textContent).slice(-2), bold: document.querySelectorAll('[data-dock-id="social-phone"] b b').length })));
  await B.screenshot({ path: out + '/social_bob_radio.png' });
  // chat commands exist
  ok('commands', await A.evaluate(() => ['w', 'r', 'rad', 'tune', 'accept', 'decline', 'invite', 'hub'].map((c) => kefal.mods.chatCommands.has(c))));

  // failing hub: Carl uses the default online strategy; nothing can connect in the sandbox
  step('carl');
  const C = await open('Carl');
  await sleep(1500);
  ok('carlMenu', await C.evaluate(() => ({ status: kefal.hub.status, strat: kefal.settings.netStrategy })));
  await C.evaluate(() => { kefal.ui.showMenu('hub'); });
  await sleep(500);
  await C.screenshot({ path: out + '/social_carl_offline.png' });
  await C.evaluate(() => { kefal.hostGame({ strategy: 'local', isPublic: false, slot: 3, lobbyName: 'Carl crew', maxPlayers: 4, code: 'CARL01' }); return 1; });
  await sleep(3500);
  ok('carlGame', await C.evaluate(() => ({ game: !!kefal.game, social: !!kefal.game?.social, hub: kefal.hub.status })));
  // leave games: hub returns to the menu context
  await B.evaluate(() => kefal.leaveGame()); await A.evaluate(() => kefal.leaveGame());
  await sleep(1500);
  ok('afterLeave', await A.evaluate(() => ({ ctx: kefal.hub.ctx, status: kefal.hub.status, social: !!kefal.game })));
} catch (e) {
  report.error = String(e.stack || e).slice(0, 800);
}
console.log(JSON.stringify(report, null, 1));
await b.close();
process.exit(report.error || logs.some((l) => /pageerror/.test(l)) ? 1 : 0);
