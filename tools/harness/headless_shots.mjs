// headless.mjs variant: adds window.__shot(name) (screenshot mid-script into --shotdir) and de-duplicates console logs.
//   flock /tmp/tfg-browser.lock timeout 580 node tools/harness/headless_shots.mjs --port 5254 --script tools/harness/wave1_day.js --shotdir /tmp/shots
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = arg('port', '5173');
const url = arg('url', '/?autohost=local&code=T1&name=Tester');
const script = arg('script', null);
const shotDir = arg('shotdir', '.');
const wait = Number(arg('wait', '3000'));
let chromium;
try { chromium = createRequire(import.meta.url)('playwright').chromium; }
catch { const root = execSync('npm root -g').toString().trim(); chromium = createRequire(root + '/')('playwright').chromium; }
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const logs = new Map();
const add = (s) => logs.set(s, (logs.get(s) || 0) + 1);
p.on('console', (m) => { if (m.text().startsWith('QA:')) { console.log(m.text()); return; }   // console.log('QA: ...') in a script = live progress line
  if (m.type() === 'error' || m.type() === 'warning') add(m.type() + ': ' + m.text().slice(0, 400)); });
p.on('pageerror', (e) => add('pageerror: ' + String(e.stack || e.message).slice(0, 800)));
// name ending in .jpg -> JPEG (quality --q, default 55), else PNG
await p.exposeFunction('__shot', async (name) => { await p.screenshot(/\.jpe?g$/.test(name) ? { path: `${shotDir}/${name}`, type: 'jpeg', quality: Number(arg('q', '55')), timeout: 150000 } : { path: `${shotDir}/${name}.png` }); return true; });
await p.exposeFunction('__view', async (w, h) => { await p.setViewportSize({ width: w, height: h }); return true; });
await p.goto(`http://127.0.0.1:${port}${url}`);
await p.waitForFunction(() => window.kefal?.game, null, { timeout: 120000 }).catch(() => add('TIMEOUT: kefal.game never appeared'));
await p.waitForTimeout(wait);
if (script) {
  const code = fs.readFileSync(script, 'utf8');
  try { const r = await p.evaluate(`(async()=>{${code}\n})()`); console.log(JSON.stringify(r, null, 1)); }
  catch (e) { console.log('EVAL ERROR', e.message); }
}
console.log('LOGS', JSON.stringify([...logs].map(([s, n]) => (n > 1 ? `[x${n}] ` : '') + s).slice(0, 120), null, 1));
await b.close();
