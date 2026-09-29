// Wave-4 checkup runner: ONE browser session, several step scripts in order, a screenshot after each step.
//   flock /tmp/tfg-browser.lock node tools/harness/wave4_checkup_run.mjs --port 5190 --steps a.js,b.js --shotdir /tmp/shots [--url ...] [--live]
// Every step file is the BODY of an async function; tools/harness/wave4_checkup_lib.js is prepended (helpers on window.__ck).
// By default the rAF render loop is frozen (swiftshader frames take seconds and starve page.screenshot); steps drive the sim
// with kefal.tick(n, dt, render) and the runner renders one frame before each screenshot. --live keeps the real loop.
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = arg('port', '5173');
const url = arg('url', '/?autohost=local&code=T1&name=Tester');
const steps = (arg('steps', '') || '').split(',').filter(Boolean);
const shotDir = arg('shotdir', '.');
const wait = Number(arg('wait', '3000'));
const live = process.argv.includes('--live');
let chromium;
try { chromium = createRequire(import.meta.url)('playwright').chromium; }
catch { const root = execSync('npm root -g').toString().trim(); chromium = createRequire(root + '/')('playwright').chromium; }
const lib = fs.readFileSync(new URL('./wave4_checkup_lib.js', import.meta.url), 'utf8');
const t0 = Date.now();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const logs = new Map();
let cur = 'boot';
const add = (s) => { const k = '[' + cur + '] ' + s; logs.set(k, (logs.get(k) || 0) + 1); };
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') add(m.type() + ': ' + m.text().slice(0, 400)); });
p.on('pageerror', (e) => add('pageerror: ' + String(e.stack || e.message).slice(0, 900)));
p.on('dialog', (d) => { add('dialog: ' + d.message()); d.dismiss().catch(() => {}); });
await p.exposeFunction('__shot', async (name) => { try { await p.screenshot({ path: `${shotDir}/${name}.png`, timeout: 60000 }); return true; } catch (e) { add('shot fail ' + name + ' ' + e.message.slice(0, 80)); return false; } });
// real (trusted) input for pointer-lock / user-activation checks: window.__click(x, y), window.__press('Escape')
await p.exposeFunction('__click', async (x, y) => { await p.mouse.click(x, y); return true; });
await p.exposeFunction('__press', async (k) => { await p.keyboard.press(k); return true; });
await p.goto(`http://127.0.0.1:${port}${url}`);
await p.waitForFunction(() => window.kefal?.game || window.kefal?.menu, null, { timeout: 180000 }).catch(() => add('TIMEOUT: kefal never booted'));
await p.waitForTimeout(wait);
if (!live) await p.evaluate(() => { const a = window.kefal; a.__realLoop = a.loop; a.loop = function (now) { requestAnimationFrame((t) => this.loop(t)); this.last = now; this.input?.endFrame?.(); }; });
console.log('booted in', ((Date.now() - t0) / 1000).toFixed(1), 's');
for (const s of steps) {
  cur = path.basename(s, '.js');
  const code = lib + '\n' + fs.readFileSync(s, 'utf8');
  const ts = Date.now();
  try { const r = await p.evaluate(`(async()=>{${code}\n})()`); console.log('== ' + cur, ((Date.now() - ts) / 1000).toFixed(1) + 's\n' + JSON.stringify(r, null, 1)); }
  catch (e) { console.log('== ' + cur + ' EVAL ERROR', e.message.slice(0, 600)); }
  try { await p.evaluate(() => kefal.tick(1, 1 / 60, true)); await p.screenshot({ path: `${shotDir}/${cur}.png`, timeout: 60000 }); } catch (e) { add('final shot fail ' + e.message.slice(0, 80)); }
}
console.log('LOGS', JSON.stringify([...logs].map(([s, n]) => (n > 1 ? `[x${n}] ` : '') + s).slice(0, 150), null, 1));
console.log('total', ((Date.now() - t0) / 1000).toFixed(1), 's');
await b.close();
