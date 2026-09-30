// node tools/harness/joinplay.test.mjs                        - W9 join link + PLAY button: pure checks + source wiring (no browser)
// flock /tmp/tfg-browser.lock node tools/harness/joinplay.test.mjs --browser --port 5199 [--shot docs/wave8/qa_shots/w9_play.jpg]
//   two tabs: host `?autohost=local&code=X`, client joins from `?join=X&net=local` alone; then the main menu PLAY entry -> stream + one shot.
import fs from 'fs';
import { parseJoin, joinLinkFor, NET_MODES } from '../../src/net/joinlink.js';
import { setLang, t, tf } from '../../src/core/i18n.js';
let bad = 0, n = 0;
const chk = (c, m, note) => { n++; if (!c) { bad++; console.log('FAIL', m, note === undefined ? '' : JSON.stringify(note).slice(0, 200)); } else if (process.argv.includes('--browser')) console.log('PASS', m); };
const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// ---- link parsing / building
chk(JSON.stringify(parseJoin('?join=ab-12cd&net=local')) === '{"code":"AB-12CD","strategy":"local"}', 'parse: code upper-cased, net carried');
chk(parseJoin('?join=abc') === null && parseJoin('') === null && parseJoin('?net=local') === null, 'parse: too short / missing -> null');
chk(parseJoin('?join=ABCD&net=evil').strategy === 'nostr' && parseJoin('?join=ABCD', 'mqtt').strategy === 'mqtt', 'parse: unknown net falls back to the setting');
chk(parseJoin('?join=<b>ABCD</b>').code === 'BABCDB', 'parse: markup stripped');
const link = joinLinkFor({ net: { code: 'XK7Q', strategy: 'torrent' } }, { origin: 'https://x.io', pathname: '/tfg/' });
chk(link === 'https://x.io/tfg/?join=XK7Q&net=torrent', 'link: origin + path + code + net', link);
const back = parseJoin(link.slice(link.indexOf('?')));
chk(back.code === 'XK7Q' && back.strategy === 'torrent', 'link round-trips');
chk(joinLinkFor({ net: {} }) === '' && NET_MODES.length === 4, 'link: empty without a session');

// ---- i18n (EN + TR + RU)
for (const k of ['Copy join link', 'Join link copied', 'ADVANCED', 'LOBBY {code}', 'You are the host. Lobby code: {code}. ESC > Copy join link']) {
  setLang('tr'); const tr = t(k); setLang('ru'); const ru = t(k); setLang('en');
  chk(tr !== k && ru !== k && tr !== ru, 'i18n TR + RU: ' + k);
}
setLang('tr'); chk(tf('LOBBY {code}', { code: 'AB' }) === 'LOBİ AB', 'i18n fills {code}'); setLang('en');

// ---- source wiring
const M = rd('src/main.js'), P = rd('src/ui/ui.js'), C = rd('src/ui/crtmenu.js'), T = rd('src/game/terminal.js'), H = rd('src/game/hubgate.js'), HO = rd('src/game/host.js');
chk(/parseJoin\(location\.search/.test(M) && /joinGame\(j\)/.test(M), 'main.js joins from ?join=');
chk(/copyJoinLink\(this, g\)/.test(P) && /Copy join link/.test(P), 'Pause menu has Copy join link');
chk(/term-code/.test(T) && /copyJoinLink/.test(T), 'terminal header shows the lobby code');
chk(/Copy join link/.test(H) && /'info', 9000/.test(H) && /9000/.test(HO), 'Quick Shift + host toasts mention the link and stay 9 s');
const items = C.slice(C.indexOf('setItems()'), C.indexOf('refreshDailyBadge'));
chk(/items = \[\{ id: 'play'/.test(items) && !/id: 'continue'/.test(items), 'PLAY is the first menu entry');
chk(/if \(open\) items\.push\(\{ id: 'daily'/.test(items) && /if \(open\) items\.push\(\{ id: 'hub'/.test(items), 'DAILY + HUB only when unlocked');
chk(/it\.id === 'play'[\s\S]{0,100}showMenu\('browser'\)/.test(C) && !/id: '(host|quick|browser)'/.test(items), 'one PLAY entry opens the server browser');
chk(/checked: true/.test(P.slice(P.indexOf('screen_host()'), P.indexOf('screen_host()') + 900)) && /host-adv/.test(P), 'host form: public by default, advanced options retained');

// menu items for a fresh vs veteran profile (pure)
const K = await import('../../src/game/onboard_core.js');
const fresh = { name: 'x', level: 1 }; K.decideMode(fresh);
chk(fresh.unlocks.mode === 'all' && K.isOpen('shop', fresh.unlocks, null), 'fresh profile: DAILY + HUB feature gate is open');
fresh.unlocks.q = 1; chk(K.isOpen('shop', fresh.unlocks, null), 'quota progress retains immediate menu access');

if (process.argv.includes('--browser')) {
  const { createRequire } = await import('module'); const { execSync } = await import('child_process');
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const port = arg('port', '5199'), shot = arg('shot', '');
  let chromium;
  try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = createRequire(execSync('npm root -g').toString().trim() + '/')('playwright').chromium; }
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1024, height: 576 } });
  const logs = [];
  const mk = async (url, tag, waitGame = true) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => logs.push(tag + ' pageerror: ' + String(e.stack || e.message).slice(0, 300)));
    p.on('dialog', (d) => { logs.push(tag + ' dialog: ' + d.message().slice(0, 100)); d.dismiss().catch(() => {}); });
    await p.goto(`http://127.0.0.1:${port}${url}`);
    await p.waitForFunction(() => window.kefal?.booted, null, { timeout: 120000 });
    if (waitGame) await p.waitForFunction(() => window.kefal?.game, null, { timeout: 120000 });
    return p;
  };
  const CODE = 'JP' + (Date.now() % 100000);
  const only = process.argv.includes('--play-only');   // re-take the PLAY shot without the two-tab part
  const host = only ? null : await mk(`/?autohost=local&code=${CODE}`, 'host');
  await host?.waitForTimeout(2000);
  if (!only) {
  const cli = await mk(`/?join=${CODE}&net=local`, 'client');   // the URL alone: no autojoin, no manual net pick
  await cli.waitForFunction(() => kefal.game?.net?.connected, null, { timeout: 60000 }).catch(() => logs.push('client never connected'));
  await host.waitForTimeout(1500);
  const st = { cli: await cli.evaluate(() => ({ host: kefal.game.isHost, code: kefal.game.net.code, net: kefal.game.net.strategy, remotes: kefal.game.remotes.size })), hostRemotes: await host.evaluate(() => kefal.game.remotes.size), link: await host.evaluate(async () => (await import('/src/net/joinlink.js')).joinLinkFor(kefal.game)) };
  chk(!st.cli.host && st.cli.code === CODE && st.cli.net === 'local' && st.cli.remotes >= 1 && st.hostRemotes >= 1, 'two-tab: client joined from ?join=&net= alone', st);
  chk(st.link.includes(`join=${CODE}`) && st.link.includes('net=local'), 'host link carries code + net', st.link);
  const pause = await host.evaluate(() => { kefal.game.ui.openPause(); const bs = [...document.querySelectorAll('.pause-info ~ .menu-list .btn, .menu-list .btn')].map((e) => e.textContent); kefal.game.ui.closePanel(true); return bs; });
  chk(pause.includes('Copy join link'), 'Pause menu lists Copy join link', pause);
  const term = await host.evaluate(() => { const g = kefal.game; g.terminal.open(); const s = g.terminal.codeEl?.textContent || ''; g.terminal.close(); return s; });
  chk(term.includes(CODE), 'terminal header shows the lobby code', term);
  }
  // PLAY is the single gateway; host creation lives beside the browser.
  const pm = await mk('/', 'menu', false);
  await pm.evaluate(() => { kefal.settings.netStrategy = 'local'; });
  const first = await pm.evaluate(() => kefal.menu.items[0]?.id);
  chk(first === 'play', 'menu: first entry is PLAY', first);
  await pm.evaluate(() => kefal.menu.activate(0));
  const pl = await pm.evaluate(() => ({ screen: kefal.ui.currentScreen, hasGame: !!kefal.game, hostButton: [...document.querySelectorAll('.lb-top button')].some((b) => b.textContent === 'HOST GAME') }));
  chk(pl.screen === 'browser' && !pl.hasGame && pl.hostButton, 'PLAY opens server browser with host button', pl);
  if (shot) { await pm.evaluate(() => { kefal.tick(2, 1 / 30, true); try { kefal.game.engine.renderer.getContext().finish(); } catch { /* no gl */ } }); await pm.waitForTimeout(700); await pm.screenshot({ path: shot, type: 'jpeg', quality: 40, timeout: 150000 }); }
  console.log('LOGS', JSON.stringify(logs.filter((l) => !/nostr|WebSocket|wss:/i.test(l)).slice(0, 10)));
  chk(!logs.some((l) => /pageerror/.test(l)), 'no page errors');
  await b.close();
}
console.log(bad ? `joinplay: ${bad}/${n} FAILED` : `joinplay: ${n} checks OK`);
process.exit(bad ? 1 : 0);
