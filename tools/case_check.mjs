// Case-sensitivity check for relative imports (Windows/macOS resolve 'Foo.js' for 'foo.js', Linux - e.g. the Render
// build - does not). Also flags imports of files that are not tracked by git (they exist locally but not in a clone).
// Usage: node tools/case_check.mjs   (exit 1 on problems)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const tracked = new Set(execSync('git ls-files', { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').filter(Boolean));
const dirCache = new Map();
const listDir = (d) => { if (!dirCache.has(d)) { try { dirCache.set(d, fs.readdirSync(d)); } catch { dirCache.set(d, null); } } return dirCache.get(d); };
// true when every path segment exists with exactly this case
function exactCase(abs) {
  const rel = path.relative(root, abs).split(path.sep);
  let cur = root;
  for (const seg of rel) { const names = listDir(cur); if (!names || !names.includes(seg)) return false; cur = path.join(cur, seg); }
  return true;
}
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (/\.(m?js|css|html)$/.test(e.name)) files.push(p); } })(path.join(root, 'src'));
for (const extra of ['index.html', 'vite.config.js']) if (fs.existsSync(path.join(root, extra))) files.push(path.join(root, extra));
const RE = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|import\s+|export\s[^'"]*?from\s*|new URL\(\s*|url\(\s*)['"]([^'"]+)['"]/g;
let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(RE)) {
    const spec = m[1];
    if (!spec.startsWith('.') && !spec.startsWith('/src/')) continue;
    const abs = spec.startsWith('/src/') ? path.join(root, spec) : path.resolve(path.dirname(f), spec.split('?')[0]);
    if (!fs.existsSync(abs)) continue;   // dynamic template / runtime asset paths: not ours to judge
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (!exactCase(abs)) { bad++; console.log(`CASE  ${path.relative(root, f)} -> ${spec}`); }
    else if (fs.statSync(abs).isFile() && !tracked.has(rel)) { bad++; console.log(`UNTRACKED  ${path.relative(root, f)} -> ${spec}`); }
  }
}
console.log(bad ? `case_check: ${bad} problem(s)` : `case_check: ok (${files.length} files)`);
process.exit(bad ? 1 : 0);
