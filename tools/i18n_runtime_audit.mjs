#!/usr/bin/env node
// TFG i18n RUNTIME audit (wave 8, i18n8). tools/i18n_audit.mjs is a static scan and cannot see dictionaries or data tables that modules
// build at import / install time. This one imports every module under src/ in node (css/assets stubbed), runs every exported install*()
// against a permissive proxy "game" (so their addTranslations() / registerItem() calls happen), then walks every exported data table and
// lists the display strings (name, desc, tip, lore, ...) that have no Turkish and/or Russian entry in the live dictionaries.
//
// Usage: node tools/i18n_runtime_audit.mjs [--json out.json] [--list tr|ru] [--file <substr>] [--max N]
//   default: summary + per-file counts;  --list tr  prints strings missing TR;  --list ru  strings that have TR but no RU
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(
  `export async function load(u,c,n){ if(/\\.(css|svg|png|jpg|glb|gltf|wav|mp3|ogg|woff2?|wasm)(\\?.*)?$/.test(u)) return {format:'module',source:'export default "";',shortCircuit:true}; return n(u,c); }`));

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const walk = (d, o = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, o); else if (p.endsWith('.js')) o.push(p); } return o; };
globalThis.window = globalThis;

function deep() {   // permissive stand-in for `game`: any property is a proxy, any call returns a proxy
  const cache = new Map();
  return new Proxy(function () {}, {
    get(_, k) { if (k === Symbol.toPrimitive) return () => 0; if (k === 'then') return undefined; if (k === Symbol.iterator) return function* () {}; if (k === 'length') return 0; if (!cache.has(k)) cache.set(k, deep()); return cache.get(k); },
    set(_, k, v) { cache.set(k, v); return true; }, apply() { return deep(); }, construct() { return deep(); }, has() { return true; },
  });
}
globalThis.document = deep();
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

const I = await import(pathToFileURL(path.join(R, 'core', 'i18n.js')).href);
const mods = [];
for (const f of walk(R).sort()) {
  if (/src\/main\.js$/.test(f.replace(/\\/g, '/'))) continue;
  try { mods.push([path.relative(R, f).replace(/\\/g, '/'), await import(pathToFileURL(f).href)]); } catch { /* not importable in node */ }
}
for (const [, m] of mods) for (const k of Object.keys(m)) if (/^install[A-Z]/.test(k) && typeof m[k] === 'function') { try { const r = m[k](deep(), {}); if (r && r.then) r.catch(() => {}); } catch { /* module needs the real engine */ } }

const FIELDS = new Set(['name', 'desc', 'tip', 'lore', 'short', 'label', 'title', 'blurb', 'hint', 'note', 'help', 'sub', 'headline', 'summary', 'flavor', 'caption', 'text', 'brief', 'goal', 'tagline', 'msg', 'reason', 'cause', 'say', 'line', 'quote', 'tag', 'kicker', 'blurb2', 'body']);
const seen = new Set(), rows = [];
function visit(v, mod, pth, depth) {
  if (!v || typeof v !== 'object' || depth > 5 || seen.has(v)) return; seen.add(v);
  if (Array.isArray(v)) { v.slice(0, 400).forEach((x) => visit(x, mod, pth, depth + 1)); return; }
  const own = !!(v.tr || v.trName || v.trDesc || v.ru);   // data that carries its own translation
  for (const k of Object.keys(v)) {
    let x; try { x = v[k]; } catch { continue; }
    if (Array.isArray(x) && FIELDS.has(k) && x.length && x.length !== 2 && x.length !== 3 && x.every((e) => typeof e === 'string')) {   // text: ['line', 'line']
      if (!own) for (const e of x) { if (/^[a-z0-9_.\-#/:]+$/.test(e) || !/[A-Za-z]{3}/.test(e)) continue; const tr = I.hasTranslation('tr', e), ru = I.hasTranslation('ru', e); if (!tr || !ru) rows.push({ mod, path: pth + '.' + k + '[]', text: e, tr, ru }); }
    } else if (typeof x === 'string' && FIELDS.has(k)) {
      if (own || /^[a-z0-9_.\-#/:]+$/.test(x) || !/[A-Za-z]{3}/.test(x)) continue;
      const tr = I.hasTranslation('tr', x), ru = I.hasTranslation('ru', x);
      if (!tr || !ru) rows.push({ mod, path: pth + '.' + k, text: x, tr, ru });
    } else if (x && typeof x === 'object') visit(x, mod, pth + '.' + k, depth + 1);
  }
}
for (const [name, m] of mods) for (const [k, v] of Object.entries(m)) if (v && typeof v === 'object') visit(v, name, k, 0);

const filt = opt('file', '');
const R2 = rows.filter((r) => !filt || r.mod.includes(filt));
const uniq = (a) => [...new Map(a.map((r) => [r.text, r])).values()];
const noTR = uniq(R2.filter((r) => !r.tr)), noRU = uniq(R2.filter((r) => r.tr && !r.ru));
if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify(R2));
const list = opt('list');
if (list) for (const r of (list === 'tr' ? noTR : noRU).slice(0, +opt('max', 1e9))) console.log(`${r.mod} ${r.path}\t${r.text}`);
else {
  console.log(`runtime data audit: ${mods.length} modules imported`);
  console.log(`  display strings without TR : ${noTR.length}`);
  console.log(`  display strings TR but no RU: ${noRU.length}`);
  const by = {}; for (const r of noTR.concat(noRU)) by[r.mod] = (by[r.mod] || 0) + 1;
  console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 40).map((e) => `  ${e[1]}\t${e[0]}`).join('\n'));
}
process.exit(0);
