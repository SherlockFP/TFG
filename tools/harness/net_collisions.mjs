// Lists every net message-type (on_) and host-request (handle / H) registration in src/ and reports collisions:
// Session.on_ / Session.handle use a Map, so a second registration of the same type SILENTLY REPLACES the first
// (the earlier module never hears the message). Also flags handlers that wrap net.handlers.get('x') (intentional chains)
// and message types longer than Trystero's 32-byte action limit (only the envelope 'm'/'b' are actions, so just informational).
// run: node tools/harness/net_collisions.mjs   (exit 1 when an unwrapped collision exists)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../../src', import.meta.url).pathname);
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })(root);

const reg = { on_: new Map(), handle: new Map() };
const add = (kind, key, file, line) => { const m = reg[kind]; if (!m.has(key)) m.set(key, []); m.get(key).push(`${path.relative(root, file)}:${line}`); };
const wrapped = new Set();

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const consts = new Map();
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])([^'"`\n]+)\2/g)) consts.set(m[1], m[3]);
  // local aliases: const H = (a, fn) => net.handle(a, fn)
  const aliases = new Set(['handle']);
  for (const m of src.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*\w+\s*,\s*\w+\s*\)\s*=>\s*[\w.$?]*\.handle\(/g)) aliases.add(m[1]);
  for (const m of src.matchAll(/registerHandlers['"]\s*,\s*\(?\s*([A-Za-z_$][\w$]*)/g)) aliases.add(m[1]);   // mods.on('registerHandlers', (H, g) => H('x', fn))
  const lines = src.split('\n');
  lines.forEach((ln, i) => {
    for (const m of ln.matchAll(/\bon_\??\.?\(\s*(['"`])([^'"`]+)\1|\bon_\??\.?\(\s*([A-Za-z_$][\w$.]*)\s*[,)]/g)) {
      const key = m[2] || consts.get(m[3]) || `<${m[3]}>`;
      add('on_', key, file, i + 1);
    }
    for (const a of aliases) {
      const re = new RegExp(`(?<![\\w$.])${a === 'handle' ? '(?:\\.|\\?\\.)handle' : a}\\??\\.?\\(\\s*(?:(['"\`])([^'"\`]+)\\1|([A-Za-z_$][\\w$.]*)\\s*[,)])`, 'g');
      for (const m of ln.matchAll(re)) {
        if (m[2] === undefined && m[3] === undefined) continue;
        const key = m[2] || consts.get(m[3]) || `<${m[3]}>`;
        add('handle', key, file, i + 1);
      }
    }
    for (const m of ln.matchAll(/\bhostOn\(\s*(['"`])([^'"`]+)\1/g)) add('handle', m[2], file, i + 1);   // combat_kit / weapons hostOn(action, fn) helpers
    for (const m of ln.matchAll(/handlers\.get\(\s*['"]([^'"]+)['"]\s*\)/g)) wrapped.add(m[1]);
  });
}

let bad = 0;
for (const kind of ['on_', 'handle']) {
  const label = kind === 'on_' ? "net.on_('type')  broadcast/message handlers" : "net.handle('action') / H('action')  host request handlers";
  console.log(`\n== ${label}: ${reg[kind].size} distinct`);
  for (const [k, where] of [...reg[kind]].sort()) {
    if (where.length < 2 || k.startsWith('<')) continue;                 // dynamic keys (wrapper definitions) cannot be judged
    if (kind === 'on_' && k === 'g2') { console.log(`  same-fn double registration ${k}: ${where.join('  ')}  (gameplay2 binds on netReady AND immediately - harmless)`); continue; }
    const chain = kind === 'handle' && wrapped.has(k);
    console.log(`  ${chain ? 'CHAIN?' : 'COLLISION'} ${k}: ${where.join('  ')}`);
    if (!chain) bad++;
  }
}
const both = [...reg.on_.keys()].filter((k) => reg.handle.has(k));
console.log(`\n(message types that are also request actions - fine, separate maps: ${both.join(', ') || 'none'})`);
console.log(`unwrapped collisions: ${bad}`);
process.exit(bad ? 1 : 0);
