// npm test — runs every node test (tools/harness/*.test.mjs + tools/sim/*.test.mjs) in parallel.
// usage: node tools/harness/run_all.mjs [-j N] [--timeout S] [filter…]
//   filter = substrings; only matching file names run (e.g. `npm test -- netaudit econ`).
// Exit code 1 if any test fails or times out. Browser runs are opt-in (--browser) in each test, so none start here.
import { spawn } from 'child_process';
import { readdirSync } from 'fs';
import { cpus } from 'os';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const jobs = Math.max(1, +opt('-j', Math.max(1, cpus().length - 1)));
const timeoutS = +opt('--timeout', 300);
const filters = argv.filter((a) => !a.startsWith('-'));

const files = [join(root, 'tools/harness'), join(root, 'tools/sim')]
  .flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.test.mjs')).map((f) => join(d, f)))
  .filter((f) => !filters.length || filters.some((s) => f.includes(s)))
  .sort();

const results = [];
const t0 = Date.now();
let next = 0, done = 0;

function runOne(file) {
  return new Promise((resolve) => {
    const start = Date.now();
    const p = spawn(process.execPath, [file], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const keep = (b) => { out += b; if (out.length > 20000) out = out.slice(-12000); };
    p.stdout.on('data', keep); p.stderr.on('data', keep);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; p.kill('SIGKILL'); }, timeoutS * 1000);
    p.on('close', (code) => {
      clearTimeout(timer);
      const r = { file: relative(root, file), ok: code === 0 && !timedOut, timedOut, ms: Date.now() - start, out };
      done++;
      process.stdout.write(`${r.ok ? 'ok  ' : 'FAIL'} ${String(done).padStart(3)}/${files.length} ${r.file} (${(r.ms / 1000).toFixed(1)}s)${timedOut ? ' TIMEOUT' : ''}\n`);
      resolve(r);
    });
  });
}

async function worker() {
  while (next < files.length) results.push(await runOne(files[next++]));
}

await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker));

const fails = results.filter((r) => !r.ok);
for (const r of fails) {
  console.log(`\n── ${r.file} ${r.timedOut ? '(timeout)' : ''}`);
  console.log(r.out.trim().split('\n').slice(-15).join('\n'));
}
const slow = [...results].sort((a, b) => b.ms - a.ms).slice(0, 5).map((r) => `${r.file.replace(/^tools\/\w+\//, '')} ${(r.ms / 1000).toFixed(0)}s`);
console.log(`\n${results.length - fails.length}/${results.length} passed in ${((Date.now() - t0) / 1000).toFixed(0)}s (-j ${jobs}). slowest: ${slow.join(', ')}`);
if (fails.length) console.log('FAILED: ' + fails.map((r) => r.file.replace(/^tools\/\w+\//, '')).join(' '));
process.exit(fails.length ? 1 : 0);
