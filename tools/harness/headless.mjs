// Headless browser runner for TFG (cloud / CI sessions without a display).
// Usage:  node tools/harness/headless.mjs [--port 5173] [--url '/?autohost=local&code=T1&name=Tester'] [--script file.js] [--shot out.png] [--wait 3000]
// The script file is the BODY of an async function evaluated in the page after the game booted (kefal.game exists);
// whatever it returns is printed as JSON. Console errors/warnings + page errors are printed after it.
// Uses the globally installed playwright + the preinstalled Chromium (PLAYWRIGHT_BROWSERS_PATH), software WebGL.
// Several agents share one machine: wrap calls in  flock /tmp/tfg-browser.lock node tools/harness/headless.mjs ...
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = arg('port', '5173');
const url = arg('url', '/?autohost=local&code=T1&name=Tester');
const script = arg('script', null);
const shot = arg('shot', null);
const wait = Number(arg('wait', '3000'));
let chromium;
try { chromium = createRequire(import.meta.url)('playwright').chromium; }
catch { const root = execSync('npm root -g').toString().trim(); chromium = createRequire(root + '/')('playwright').chromium; }

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 400)); });
p.on('pageerror', (e) => logs.push('pageerror: ' + String(e.stack || e.message).slice(0, 800)));
await p.goto(`http://127.0.0.1:${port}${url}`);
await p.waitForFunction(() => window.kefal?.game, null, { timeout: 120000 }).catch(() => logs.push('TIMEOUT: kefal.game never appeared'));
await p.waitForTimeout(wait);
if (script) {
  const code = fs.readFileSync(script, 'utf8');
  try { const r = await p.evaluate(`(async()=>{${code}\n})()`); console.log(JSON.stringify(r, null, 1)); }
  catch (e) { console.log('EVAL ERROR', e.message); }
}
if (shot) await p.screenshot({ path: shot });
console.log('LOGS', JSON.stringify(logs.slice(0, 60), null, 1));
await b.close();
