#!/usr/bin/env node
// TFG i18n codemod: wraps user-visible hard-coded strings in t() / tf() / sysMsg() (AST based, position edits).
//   node tools/i18n_wrap.mjs [--apply] [--keys out.json] <file...>
// Without --apply it only prints what it would change. Contexts it rewrites (see WRAP_CALLS / WRAP_PROPS below):
//   toast('..'), ui.systemMessage(..), terminal print(..), {label:'..', sub:'..'} interactables, el('div', {}, 'Text'),
//   .textContent = '..', net.broadcast('sys', { text: `..${x}..`, kind }) -> sysMsg('.. {x} ..', { x }, kind)
// Template literals / string concatenations become tf('.. {name} ..', { name }) keys; the printed key list is what needs
// TR + RU entries (src/i18n/tr_*.js / ru_*.js). Review the diff: expressions inside ${} are passed through untouched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { parseAst } = await import('file://' + require.resolve('rolldown/parseAst'));

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ki = args.indexOf('--keys');
const KEYS_OUT = ki >= 0 ? args[ki + 1] : null;
const files = args.filter((a, i) => !a.startsWith('--') && (ki < 0 || i !== ki + 1));

const WRAP_CALLS = new Set(['toast', 'systemMessage', 'setSpectate', 'flash', 'fail', 'fizzle', 'bigText', 'showLoading', 'setStatus', 'addEvent',
  'refund', 'setHelp', 'statRow', 'hint', 'setHint', 'banner', 'announce', 'print', 'alert', 'notify', 'showMessage', 'systemLine', 'chatLine']);
const WRAP_PROPS = new Set(['label', 'sub', 'hint', 'placeholder', 'tooltip', 'caption']);
const DOM_PROPS = new Set(['textContent', 'innerText', 'title', 'placeholder']);
const EL_CALLS = new Set(['el']);

function humanText(s) {
  if (typeof s !== 'string') return false;
  s = s.replace(/\{\w+\}/g, '').trim();
  if (s.length < 2 || !/[A-Za-z]{2}/.test(s)) return false;
  if (/^(https?:|data:|\.{0,2}\/|#[0-9a-f]{3,8}$|rgba?\(|var\()/i.test(s)) return false;
  if (/[;{}]/.test(s) && /:/.test(s)) return false;
  if (!/\s/.test(s)) {
    if (/[_.\/\\\d]/.test(s.replace(/^\d+/, ''))) return false;
    if (/^[a-z]+[A-Z]\w*$/.test(s)) return false;
    return /^[A-Z][a-z]{2,}[!?.]?$/.test(s) || /^[A-Z]{3,}[!?.]?$/.test(s) || /^[A-Z][a-z]+$/.test(s);
  }
  if (/^[\w.\-#:\[\]="'>+~*,()\s%]+$/.test(s) && !/[A-Z]/.test(s) && !/[.!?…]$/.test(s)) return false;
  return true;
}
const calleeName = (c) => (c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : null);
const quote = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '') + "'";
const isStr = (n) => n && n.type === 'Literal' && typeof n.value === 'string';

const allKeys = [];
const skippedAll = [];
let totalEdits = 0;

for (const f of files) {
  const file = path.resolve(ROOT, f);
  const src = fs.readFileSync(file, 'utf8');
  let ast;
  try { ast = parseAst(src); } catch (e) { console.error('parse failed', f, e.message.split('\n')[0]); continue; }
  const edits = [];        // {start,end,text}
  const covered = [];      // ranges already claimed
  const claim = (n) => { covered.push([n.start, n.end]); };
  const isClaimed = (n) => covered.some(([a, b]) => n.start >= a && n.end <= b);
  const srcOf = (n) => src.slice(n.start, n.end);
  const lineOf = (pos) => src.slice(0, pos).split('\n').length;
  let needT = false, needTf = false, needSys = false;

  function varName(expr, used) {
    let base = 'v';
    let e = expr;
    if (e.type === 'ChainExpression') e = e.expression;
    if (e.type === 'Identifier') base = e.name;
    else if (e.type === 'MemberExpression' && !e.computed && e.property.type === 'Identifier') base = e.property.name;
    else if (e.type === 'CallExpression') { const cn = calleeName(e.callee); base = cn && /name/i.test(cn) ? 'name' : cn && !['round', 'floor', 'ceil', 'max', 'min', 'abs', 'toFixed', 'padEnd', 'padStart', 'join', 'map', 'toUpperCase', 'toLowerCase'].includes(cn) ? cn : 'n'; }
    else base = 'n';
    base = base.replace(/[^A-Za-z0-9_]/g, '') || 'v';
    if (/^\d/.test(base)) base = 'n' + base;
    let name = base, i = 2;
    while (used.has(name)) name = base + i++;
    used.add(name);
    return name;
  }

  // Build {key, vars:[{name, code}]} from a template literal or a '+' chain. sys=true -> {@x} for display names.
  function buildTemplate(node, sys) {
    const used = new Set();
    let key = '';
    const vars = [];
    const pushExpr = (e) => {
      const name = varName(e, used);
      const isName = sys && e.type === 'MemberExpression' && !e.computed && e.property.name === 'name' && !/playerName|profile|info|remote|player/i.test(srcOf(e));
      key += isName ? `{@${name}}` : `{${name}}`;
      vars.push({ name, code: isName ? `${srcOf(e.object)}.$name ?? ${srcOf(e)}` : srcOf(e) });
    };
    if (node.type === 'TemplateLiteral') {
      node.quasis.forEach((q, i) => { key += q.value.cooked ?? q.value.raw; if (i < node.expressions.length) pushExpr(node.expressions[i]); });
    } else {
      const parts = [];
      const flat = (n) => { if (n.type === 'BinaryExpression' && n.operator === '+') { flat(n.left); flat(n.right); } else parts.push(n); };
      flat(node);
      for (const p of parts) { if (isStr(p)) key += p.value; else if (p.type === 'TemplateLiteral' && p.expressions.length === 0) key += p.quasis[0].value.cooked; else pushExpr(p); }
    }
    return { key, vars };
  }

  let curParents = [];
  const FUNCS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
  const patNames = (p, out) => {
    if (!p) return;
    if (p.type === 'Identifier') out.add(p.name);
    else if (p.type === 'ObjectPattern') for (const x of p.properties) patNames(x.type === 'RestElement' ? x.argument : x.value, out);
    else if (p.type === 'ArrayPattern') for (const x of p.elements) patNames(x, out);
    else if (p.type === 'AssignmentPattern') patNames(p.left, out);
    else if (p.type === 'RestElement') patNames(p.argument, out);
  };
  // is `name` declared in a scope enclosing the current edit (other than the module import)?
  function shadowed(name) {
    for (const n of curParents) {
      const d = new Set();
      if (FUNCS.has(n.type)) { for (const p of n.params) patNames(p, d); if (n.id && n.type === 'FunctionExpression') d.add(n.id.name); }
      if (n.type === 'BlockStatement' || n.type === 'Program') for (const st of n.body) { if (st.type === 'VariableDeclaration') for (const dec of st.declarations) patNames(dec.id, d); if (st.type === 'FunctionDeclaration' && st.id) d.add(st.id.name); }
      if (n.type === 'ForStatement' && n.init?.type === 'VariableDeclaration') for (const dec of n.init.declarations) patNames(dec.id, d);
      if ((n.type === 'ForOfStatement' || n.type === 'ForInStatement') && n.left.type === 'VariableDeclaration') for (const dec of n.left.declarations) patNames(dec.id, d);
      if (n.type === 'CatchClause') patNames(n.param, d);
      if (n.type === 'Program') continue;
      if (d.has(name)) return true;
    }
    return false;
  }
  const inFunction = () => curParents.some((n) => FUNCS.has(n.type));
  const skipped = [];
  let aliasT = false, aliasTf = false, aliasSys = false;
  const T = () => (shadowed('t') ? (aliasT = true, '_t') : 't');
  const TF = () => (shadowed('tf') ? (aliasTf = true, '_tf') : 'tf');
  const SYS = () => (shadowed('sysMsg') ? (aliasSys = true, '_sysMsg') : 'sysMsg');
  function blocked(node, key) {
    if (/^TFG\b|\bfps\b/.test(key)) return true;
    if (!inFunction()) { skipped.push({ file: f, line: lineOf(node.start), key, why: 'module-level (evaluated before the language is set)' }); return true; }
    return false;
  }

  function record(key, node, kind) { allKeys.push({ key, file: f, line: lineOf(node.start), kind }); }

  function wrapExpr(n, kind = 'text') {
    if (!n || isClaimed(n)) return;
    switch (n.type) {
      case 'Literal':
        if (isStr(n) && humanText(n.value) && !blocked(n, n.value)) { edits.push({ start: n.start, end: n.end, text: `${T()}(${quote(n.value)})` }); needT = true; record(n.value, n, kind); claim(n); }
        return;
      case 'TemplateLiteral': {
        if (n.expressions.length === 0) {
          const v = n.quasis[0].value.cooked;
          if (humanText(v) && !blocked(n, v)) { edits.push({ start: n.start, end: n.end, text: `${T()}(${quote(v)})` }); needT = true; record(v, n, kind); claim(n); }
          return;
        }
        const { key, vars } = buildTemplate(n, false);
        if (!humanText(key) || blocked(n, key)) return;
        edits.push({ start: n.start, end: n.end, text: `${TF()}(${quote(key)}, { ${vars.map((v) => (v.name === v.code ? v.name : `${v.name}: ${v.code}`)).join(', ')} })` });
        needTf = true; record(key, n, kind); claim(n);
        return;
      }
      case 'BinaryExpression': {
        if (n.operator !== '+') return;
        const { key, vars } = buildTemplate(n, false);
        const hasLit = (function has(x) { return x.type === 'BinaryExpression' && x.operator === '+' ? has(x.left) || has(x.right) : isStr(x); })(n);
        if (!hasLit || !humanText(key) || !vars.length || blocked(n, key)) {
          // '+' chain of only literals / no variables: wrap the literals separately
          const walk = (x) => { if (x.type === 'BinaryExpression' && x.operator === '+') { walk(x.left); walk(x.right); } else wrapExpr(x, kind); };
          walk(n); return;
        }
        edits.push({ start: n.start, end: n.end, text: `${TF()}(${quote(key)}, { ${vars.map((v) => (v.name === v.code ? v.name : `${v.name}: ${v.code}`)).join(', ')} })` });
        needTf = true; record(key, n, kind); claim(n);
        return;
      }
      case 'ConditionalExpression': wrapExpr(n.consequent, kind); wrapExpr(n.alternate, kind); return;
      case 'LogicalExpression': wrapExpr(n.right, kind); return;
      case 'ArrowFunctionExpression':
        if (n.body.type !== 'BlockStatement') wrapExpr(n.body, kind);
        else for (const st of n.body.body) if (st.type === 'ReturnStatement') wrapExpr(st.argument, kind);
        return;
      default:
    }
  }

  // sys broadcast: net.broadcast('sys', { text: X, kind: K })  ->  net.broadcast('sys', sysMsg(key, vars, K))
  function sysConvert(call) {
    const objArg = call.arguments.find((a) => a.type === 'ObjectExpression');
    if (!objArg) return false;
    const textProp = objArg.properties.find((p) => p.type === 'Property' && !p.computed && p.key.name === 'text');
    if (!textProp) return false;
    const v = textProp.value;
    const kindProp = objArg.properties.find((p) => p.type === 'Property' && !p.computed && p.key.name === 'kind');
    let key, vars = [];
    if (isStr(v)) { key = v.value; }
    else if (v.type === 'TemplateLiteral' && v.expressions.length) { ({ key, vars } = buildTemplate(v, true)); }
    else if (v.type === 'TemplateLiteral') key = v.quasis[0].value.cooked;
    else if (v.type === 'BinaryExpression' && v.operator === '+') { ({ key, vars } = buildTemplate(v, true)); if (!vars.length) return false; }
    else return false;
    if (!humanText(key) || blocked(call, key)) return false;
    const other = objArg.properties.filter((p) => p !== textProp && p !== kindProp);
    if (other.length) return false;   // keep exotic payloads untouched
    const kindCode = kindProp ? srcOf(kindProp.value) : "'info'";
    edits.push({ start: objArg.start, end: objArg.end, text: `${SYS()}(${quote(key)}, { ${vars.map((x) => (x.name === x.code ? x.name : `${x.name}: ${x.code}`)).join(', ')} }, ${kindCode})`.replace('{  }', '{}') });
    needSys = true; record(key, objArg, 'sys'); claim(objArg);
    return true;
  }

  (function walk(node, parents) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const x of node) walk(x, parents); return; }
    if (typeof node.type === 'string') {
      curParents = parents;
      if (node.type === 'CallExpression') {
        const name = calleeName(node.callee);
        const first = node.arguments[0];
        if ((name === 'broadcast' || name === 'sendTo') && node.arguments.some((a) => isStr(a) && a.value === 'sys')) { sysConvert(node); }
        else if (name && WRAP_CALLS.has(name) && !(name === 'print' && node.callee.type === 'Identifier')) {
          for (const a of (name === 'print' || name === 'toast' || name === 'systemMessage' ? [first] : node.arguments)) wrapExpr(a, 'call:' + name);
        } else if (name && EL_CALLS.has(name) && node.callee.type === 'Identifier') {
          node.arguments.slice(2).forEach((a) => wrapExpr(a, 'el'));
          const attrs = node.arguments[1];
          if (attrs?.type === 'ObjectExpression') for (const p of attrs.properties) if (p.type === 'Property' && !p.computed && ['title', 'placeholder'].includes(p.key.name)) wrapExpr(p.value, 'el-attr');
        }
      } else if (node.type === 'Property' && !node.computed && node.key.type === 'Identifier' && WRAP_PROPS.has(node.key.name) && parents.at(-1)?.type === 'ObjectExpression') {
        wrapExpr(node.value, 'prop:' + node.key.name);
      } else if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && DOM_PROPS.has(node.left.property?.name) && node.operator === '=') {
        wrapExpr(node.right, 'dom:' + node.left.property.name);
      }
      parents = parents.concat(node);
    }
    for (const k in node) { if (k !== 'type' && k !== 'start' && k !== 'end') { const v = node[k]; if (v && typeof v === 'object') walk(v, parents); } }
  })(ast, []);

  skippedAll.push(...skipped);
  if (!edits.length) { console.log(f + ': nothing'); continue; }
  edits.sort((a, b) => b.start - a.start);
  // drop nested edits (outer already replaced)
  const kept = [];
  for (const e of edits) { if (!kept.some((k) => e.start >= k.start && e.end <= k.end && (e.start !== k.start || e.end !== k.end))) kept.push(e); }
  let out = src;
  for (const e of kept) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  totalEdits += kept.length;
  console.log(`${f}: ${kept.length} edits${needT ? ' t' : ''}${needTf ? ' tf' : ''}${needSys ? ' sysMsg' : ''}`);
  if (APPLY) {
    // import
    const need = [needT && 't', needTf && 'tf', needSys && 'sysMsg', aliasT && 't as _t', aliasTf && 'tf as _tf', aliasSys && 'sysMsg as _sysMsg'].filter(Boolean);
    const m = out.match(/import \{([^}]*)\} from '((?:\.\.?\/)+)core\/i18n\.js';/);
    if (m) {
      const names = m[1].split(',').map((x) => x.trim()).filter(Boolean);
      for (const n of need) if (!names.includes(n)) names.push(n);
      out = out.replace(m[0], `import { ${names.join(', ')} } from '${m[2]}core/i18n.js';`);
    } else if (need.length) {
      const rel = path.relative(path.dirname(file), path.join(ROOT, 'src/core/i18n.js')).replace(/\\/g, '/');
      const imp = `import { ${need.join(', ')} } from '${rel.startsWith('.') ? rel : './' + rel}';\n`;
      // after the last top-level import
      // after the last top-level import declaration (ast positions refer to the ORIGINAL source; edits after imports shift nothing before them)
      let last = 0;
      for (const st of ast.body) if (st.type === 'ImportDeclaration') last = st.end;
      const nl = out.indexOf('\n', last);
      last = nl < 0 ? out.length : nl + 1;
      out = out.slice(0, last) + imp + out.slice(last);
    }
    fs.writeFileSync(file, out);
  }
}
if (skippedAll.length) console.log('SKIPPED (' + skippedAll.length + '): ' + skippedAll.map((x) => `${x.file}:${x.line} [${x.why}] ${JSON.stringify(x.key.slice(0, 50))}`).join('\n  '));
console.log(`${totalEdits} edits in ${files.length} files, ${allKeys.length} keys${APPLY ? ' (applied)' : ' (dry run)'}`);
if (KEYS_OUT) fs.writeFileSync(KEYS_OUT, JSON.stringify(allKeys, null, 1));
