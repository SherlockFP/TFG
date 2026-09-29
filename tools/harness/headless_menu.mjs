// Headless runner for the MAIN MENU (headless.mjs waits for kefal.game, which never exists at "/").
// Usage:  flock /tmp/tfg-browser.lock node tools/harness/headless_menu.mjs --port 5258 --script tools/harness/menu_feature.js \
//            [--url2 '/?autohost=local&code=T1&name=Tester' --script2 tools/harness/smoke_land.js]
// Script 1 runs at "/" once kefal.menu exists; script 2 (optional) runs in a fresh load of url2 once kefal.game exists.
// Script files are the BODY of an async function evaluated in the page; whatever they return is printed as JSON.
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = arg('port', '5173');
let chromium;
try { chromium = createRequire(import.meta.url)('playwright').chromium; }
catch { const root = execSync('npm root -g').toString().trim(); chromium = createRequire(root + '/')('playwright').chromium; }

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 400)); });
p.on('pageerror', (e) => logs.push('pageerror: ' + String(e.stack || e.message).slice(0, 800)));
const run = async (label, url, ready, scriptFile) => {
  await p.goto(`http://127.0.0.1:${port}${url}`);
  await p.waitForFunction(ready, null, { timeout: 120000 }).catch(() => logs.push(`TIMEOUT (${label}): page never became ready`));
  await p.waitForTimeout(1500);
  if (!scriptFile) return;
  try { const r = await p.evaluate(`(async()=>{${fs.readFileSync(scriptFile, 'utf8')}\n})()`); console.log(label, JSON.stringify(r, null, 1)); }
  catch (e) { console.log(label, 'EVAL ERROR', e.message); }
};
await run('MENU', arg('url', '/'), () => window.kefal?.menu?.room, arg('script', null));
if (arg('shot', null)) await p.screenshot({ path: arg('shot') });   // [eggs] optional screenshot of the state the script left behind
if (arg('url2', null)) await run('GAME', arg('url2'), () => window.kefal?.game, arg('script2', null));
console.log('LOGS', JSON.stringify(logs.slice(0, 60), null, 1));
await b.close();
