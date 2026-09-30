#!/usr/bin/env node
// TFG i18n audit. Static (AST) scan of src/ for:
//   1. keys used through t() / tf() / tfIn() / sysMsg() and whether TR and RU translations exist
//   2. inline {en, tr, ru} tables, L({...}) calls and [en, tr] pair arrays that lack a Russian entry
//   3. likely user-visible hard-coded strings that are NOT wrapped (toast/print/... calls, name/desc/label/... properties,
//      textContent/innerHTML literals, 'sys' broadcasts)
//
// Usage:  node tools/i18n_audit.mjs [--verbose] [--json] [--file <substr>] [--only missing|unwrapped] [--max N]
//   default output: summary + per-file counts + the first 6 examples per file
//   --dump     JSON of every key needing RU (with TR text + source)
//   --all      also scan src/render, src/audio, src/physics (ignored by default: shaders / textures / sound ids)
//   --gaps     JSON of keys that have a TR but no RU twin and vice versa
//   --verbose  every finding      --file  only files whose path contains <substr>      --max  examples per file
// Exit code is 0 always (it is a report). Dictionaries are read from src/core/i18n.js (TR table), every
// addTranslations({...}[, 'ru']) call in src/, and the pure-data files src/i18n/tr*.js / ru*.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let parseAst;
try { ({ parseAst } = await import(pathToUrl(require.resolve('rolldown/parseAst')))); }
catch { ({ parseAst } = await import('rolldown/parseAst')); }
function pathToUrl(p) { return 'file://' + p; }

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const VERBOSE = flag('verbose'), JSON_OUT = flag('json');
const FILE_FILTER = opt('file', ''), ONLY = opt('only', ''), MAX = +opt('max', VERBOSE ? 1e9 : 6);

// ------------------------------------------------------------------ files
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
const SRC = path.join(ROOT, 'src');
const IGNORE = /^src\/(render|audio|physics)\//;   // shaders, procedural textures, sound ids: no UI text (use --all to include)
const allFiles = walk(SRC).filter((f) => flag('all') || !IGNORE.test(path.relative(ROOT, f).replace(/\\/g, '/'))).sort();
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');

// Files that are dictionaries / data-only (their strings are the translations themselves).
const isDictFile = (f) => /^src\/i18n\/(tr|ru)[^/]*\.js$/.test(rel(f));

// ------------------------------------------------------------------ helpers
const TRCHARS = /[çğıöşüÇĞİÖŞÜ]/;
const CYR = /[Ѐ-ӿ]/;
function strOf(n) {
  if (!n) return null;
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n.type === 'TemplateLiteral') return n.quasis.map((q) => q.value.cooked ?? q.value.raw).join('{}');
  return null;
}
const isStaticStr = (n) => n && ((n.type === 'Literal' && typeof n.value === 'string') || (n.type === 'TemplateLiteral' && n.expressions.length === 0));
const staticStr = (n) => (n.type === 'Literal' ? n.value : n.quasis[0].value.cooked ?? n.quasis[0].value.raw);
const keyName = (k) => (!k ? null : k.type === 'Identifier' ? k.name : k.type === 'Literal' ? String(k.value) : null);
function calleeName(c) {
  if (!c) return null;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && !c.computed) return c.property.name;
  return null;
}
function lineOf(src, pos) { let n = 1; for (let i = 0; i < pos && i < src.length; i++) if (src.charCodeAt(i) === 10) n++; return n; }

// A string worth translating: sentence / label, not an id, path, selector or CSS.
function humanText(s) {
  if (typeof s !== 'string') return false;
  s = s.trim();
  if (s.length < 2 || !/[A-Za-z]{2}/.test(s)) return false;
  if (/^(https?:|data:|\.{0,2}\/|#[0-9a-f]{3,8}$|rgba?\(|hsla?\(|var\(|@)/i.test(s)) return false;
  if (/[;{}]/.test(s) && /:/.test(s)) return false;                     // css / js snippet
  if (/^[\w.\-#:\[\]="'>+~*,()\s%]+$/.test(s) && !/[A-Z]/.test(s) && !/[.!?…]$/.test(s)) return false; // lowercase tokens / selectors
  if (!/\s/.test(s)) {                                                    // single token
    if (/[_.\/\\\d]/.test(s.replace(/^\d+/, ''))) return false;
    if (/^[a-z]+[A-Z]\w*$/.test(s)) return false;                         // camelCase id
    return /^[A-Z][a-z]{2,}$/.test(s) || /^[A-Z]{3,}[!?.]?$/.test(s);
  }
  if (/^[\W\d_]+$/.test(s)) return false;
  const words = s.split(/\s+/).filter((w) => /[A-Za-z]{2}/.test(w));
  return words.length >= 2 || /[A-Z]/.test(s[0]);
}

// ------------------------------------------------------------------ pass 1: dictionaries + usage
const TR = new Map(), RU = new Map();          // key -> where
const VALUES = new Map();                       // dictionary -> Map(key -> translated text)
const used = new Map();                         // key -> [{file,line,dynamic}]
const dynamicKeys = [];                         // t(`...${x}`) / t(variable)
const localTables = [];                         // {en,tr[,ru]} objects, L({..}), [en,tr] pairs
const findings = [];                            // unwrapped visible strings
const notes = { dynamicDicts: [] };

const SINK_CALLS = new Set(['toast', 'systemMessage', 'print', 'reply', 'say', 'flash', 'fail', 'fizzle', 'setStatus', 'addEvent', 'showLoading',
  'refund', 'setHelp', 'setSpectate', 'statRow', 'row', 'panelHead', 'textC', 'textS', 'text', 'fillText', 'banner', 'button', 'notify', 'alert', 'confirm',
  'prompt', 'announce', 'hint', 'setHint', 'showMessage', 'message', 'chatLine', 'addChat', 'log_', 'pushLine', 'popup', 'title', 'caption', 'label', 'headline',
  'showBanner', 'bigMessage', 'showBig', 'cinematic', 'setTitle', 'setText', 'setLabel', 'tag', 'warnUser', 'info', 'shout', 'subtitle']);
const IGNORE_CALLS = new Set(['warn', 'error', 'log', 'debug', 'trace', 'assert', 'querySelector', 'querySelectorAll', 'closest', 'matches', 'getElementById',
  'addEventListener', 'removeEventListener', 'setAttribute', 'getAttribute', 'hasAttribute', 'removeAttribute', 'add', 'remove', 'toggle', 'contains', 'replace', 'replaceAll',
  'split', 'join', 'startsWith', 'endsWith', 'includes', 'indexOf', 'test', 'exec', 'match', 'emit', 'on', 'on_', 'once', 'off', 'request', 'handle', 'broadcast',
  'sendTo', 'send', 'dispatchEvent', 'CustomEvent', 'Error', 'sfx', 'play', 'variant', 'load', 'createElement', 'createElementNS', 'getItem', 'setItem', 'removeItem',
  'padStart', 'padEnd', 'localeCompare', 'toLowerCase', 'toUpperCase', 'has', 'get', 'set', 'delete', 'require', 'import', 'fetch', 'open', 'appendChild', 'style',
  'setProperty', 'getPropertyValue', 'registerItem', 'registerCreature', 'is', 'isType', 'kind', 'op', 'terminalCommand', 'command', 'addCommand', 'defineProperty', 'font',
  'fillStyle', 'strokeStyle', 'measureText', 'createLinearGradient', 'addColorStop', 'define', 'ensure', 'hook', 'mod', 'feature', 'createTexture', 'tex', 'mat', 'colorCss',
  'stat', 'lang', 'testId', 'hasFeature', 'getFeature', 'featureOn', 'modOn', 'sound', 'soundAt', 'playAt', 'loop', 'stopLoop', 'setLoop', 'cue', 'trigger', 'call', 'run',
  'action', 'bind', 'unbind', 'key', 'keydown', 'code', 'phase', 'setPhase', 'assertEq', 'equal', 'type', 'flagFor', 'seed', 'hash', 'hashString', 'RNG', 'pick', 'chance']);
const NAME_PROPS = new Set(['text', 'label', 'name', 'title', 'desc', 'description', 'msg', 'message', 'hint', 'tip', 'tooltip', 'placeholder', 'caption', 'flavor',
  'blurb', 'short', 'cause', 'reason', 'help', 'sub', 'subtitle', 'headline', 'lore', 'body', 'story', 'brief', 'goal', 'note', 'summary', 'tagline', 'prompt', 'say', 'line', 'quote']);
const DOM_PROPS = new Set(['textContent', 'innerText', 'title', 'placeholder', 'alt', 'ariaLabel']);
const WRAPPERS = new Set(['t', 'tf', 'tIn', 'tfIn', 'L', 'LA', 'sysMsg', 'sysText', 'hasTranslation', 'tl', 'tr_', 'T_', 'trKey', 'dn']);

function loadDictObject(obj, target, where, fileSrc, topConsts) {
  // obj: ObjectExpression (or Identifier resolved through topConsts). Returns count added.
  if (!obj) return 0;
  if (obj.type === 'Identifier') {
    const r = topConsts.get(obj.name);
    if (r) return loadDictObject(r, target, where, fileSrc, topConsts);
    const P0 = parsed.find((x) => x.consts === topConsts), im = P0?.imports?.get(obj.name), Q = im && parsed.find((x) => x.r === im.file), c = Q?.consts?.get(im.name);
    if (c) return loadDictObject(c, target, Q.r, Q.src, Q.consts);   // imported dictionary constant (spread or direct)
    return (notes.dynamicDicts.push(where + ' ' + obj.name), 0);
  }
  if (obj.type !== 'ObjectExpression') { notes.dynamicDicts.push(where + ' <' + obj.type + '>'); return 0; }
  let n = 0;
  for (const p of obj.properties) {
    if (p.type === 'SpreadElement') { n += loadDictObject(p.argument, target, where, fileSrc, topConsts); continue; }
    const k = p.computed ? (isStaticStr(p.key) ? staticStr(p.key) : null) : keyName(p.key);
    const v = p.value;
    if (k === null || !isStaticStr(v)) continue;
    if (!target.has(k)) { target.set(k, where + ':' + lineOf(fileSrc, p.start)); VALUES.set(target, (VALUES.get(target) || new Map()).set(k, staticStr(v))); }
    n++;
  }
  return n;
}

function topLevelConsts(ast) {
  const m = new Map();
  for (const st of ast.body) {
    const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
    if (d && d.type === 'VariableDeclaration') for (const dec of d.declarations) if (dec.id.type === 'Identifier' && dec.init) m.set(dec.id.name, dec.init);
  }
  return m;
}

const parsed = [];
for (const f of allFiles) {
  const src = fs.readFileSync(f, 'utf8');
  let ast;
  try { ast = parseAst(src); } catch (e) { console.error('parse failed:', rel(f), String(e.message).split('\n')[0]); continue; }
  parsed.push({ f, r: rel(f), src, ast });
}

for (const P of parsed) {
  const consts = topLevelConsts(P.ast);
  P.consts = consts;
  P.imports = new Map();
  for (const st of P.ast.body) {
    if (st.type !== 'ImportDeclaration' || typeof st.source?.value !== 'string' || !st.source.value.startsWith('.')) continue;
    const file = rel(path.resolve(path.dirname(P.f), st.source.value));
    for (const sp of st.specifiers || []) if (sp.type === 'ImportSpecifier') P.imports.set(sp.local.name, { file, name: sp.imported?.name ?? sp.imported?.value ?? sp.local.name });
  }
  const dictFile = isDictFile(P.f);
  const isCore = P.r === 'src/core/i18n.js';
  if (isCore && consts.has('TR')) loadDictObject(consts.get('TR'), TR, P.r, P.src, consts);
  if (dictFile) {
    const lang = /\/ru[^/]*\.js$/.test(P.r) ? RU : TR;
    for (const st of P.ast.body) {
      let d = st.type === 'ExportDefaultDeclaration' ? st.declaration : st.type === 'ExportNamedDeclaration' ? st.declaration : null;
      if (!d) continue;
      if (d.type === 'VariableDeclaration') for (const dec of d.declarations) loadDictObject(dec.init, lang, P.r, P.src, consts);
      else loadDictObject(d, lang, P.r, P.src, consts);
    }
  }
}

// walker with parent chain
function walkAst(node, visit, parents = []) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) walkAst(x, visit, parents); return; }
  if (typeof node.type === 'string') {
    if (visit(node, parents) === false) return;
    parents = parents.concat(node);
  }
  for (const k in node) {
    if (k === 'type' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (v && typeof v === 'object') walkAst(v, visit, parents);
  }
}

for (const P of parsed) {
  walkAst(P.ast, (n) => {
    if (n.type !== 'CallExpression') return;
    const name = calleeName(n.callee);
    if (name === 'addTranslations' && !isCoreDef(P)) {
      const lang = n.arguments[1] && isStaticStr(n.arguments[1]) ? staticStr(n.arguments[1]) : 'tr';
      const target = lang === 'ru' ? RU : TR;
      const a = n.arguments[0];
      if (a && a.type === 'CallExpression') notes.dynamicDicts.push(P.r + ':' + lineOf(P.src, n.start) + ' (computed)');
      else if (a && a.type === 'Identifier') {
        // an imported dictionary constant (addTranslations(TR_FOO) with `import { TR_FOO } from './foo_i18n.js'`): follow the import
        if (!P.consts.has(a.name) && P.imports?.has(a.name)) {
          const im = P.imports.get(a.name), Q = parsed.find((x) => x.r === im.file);
          if (Q?.consts) { const c = Q.consts.get(im.name); if (c) loadDictObject(c, target, Q.r, Q.src, Q.consts); else notes.dynamicDicts.push(P.r + ' ' + a.name); }
          else notes.dynamicDicts.push(P.r + ' ' + a.name);
        } else loadDictObject(a, target, P.r, P.src, P.consts);
      }
      else loadDictObject(a, target, P.r, P.src, P.consts);
    }
  });
}
// Install-time tables shaped { 'English key': ['Turkish', 'Русский'] } (mining, harvest, dance_data ...): the addTranslations() call builds them at
// runtime, so recognise the shape itself: a property whose value is a [tr, ru] string pair with Cyrillic in the second entry.
for (const P of parsed) {
  walkAst(P.ast, (n) => {
    if (n.type !== 'Property' && n.type !== 'ObjectProperty') return;
    const k = n.computed ? (isStaticStr(n.key) ? staticStr(n.key) : null) : keyName(n.key), v = n.value;
    if (k === null || !v || v.type !== 'ArrayExpression' || v.elements.length !== 2 || !v.elements.every(isStaticStr)) return;
    const [a, b] = v.elements.map(staticStr);
    if (CYR.test(b) && !CYR.test(a)) { if (!TR.has(k)) TR.set(k, P.r + ':pair'); if (!RU.has(k)) RU.set(k, P.r + ':pair'); }
  });
}
function isCoreDef(P) { return P.r === 'src/core/i18n.js'; }

// ------------------------------------------------------------------ pass 2: usage + unwrapped strings
const push = (P, node, kind, text, extra = '') => findings.push({ file: P.r, line: lineOf(P.src, node.start), kind, text, extra });

for (const P of parsed) {
  if (isDictFile(P.f) || P.r === 'src/core/i18n.js') continue;
  const seen = new Set();          // nodes already classified (wrapped etc.)
  const inDictArg = new Set();     // string nodes that are dictionary keys/values
  // mark addTranslations args
  walkAst(P.ast, (n) => {
    if (n.type === 'CallExpression' && calleeName(n.callee) === 'addTranslations') { markAll(n, inDictArg); return false; }
  });
  function markAll(n, set) { walkAst(n, (x) => { set.add(x); }); }

  // dictionary-ish objects defined at top level and later passed to addTranslations(TR): skip strings inside them
  for (const st of P.ast.body) {
    const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
    if (d && d.type === 'VariableDeclaration') for (const dec of d.declarations) {
      if (dec.id.type === 'Identifier' && /^(TR|RU|DICT|TRANS|TRANSLATIONS|TR_[A-Z_]+|RU_[A-Z_]+|[A-Z_]*_(TR|RU))$/.test(dec.id.name)) markAll(dec, inDictArg);
    }
  }

  walkAst(P.ast, (n, parents) => {
    const parent = parents[parents.length - 1];
    if (inDictArg.has(n)) return false;
    // ----- wrapper calls: collect keys
    if (n.type === 'CallExpression') {
      const name = calleeName(n.callee);
      if ((name === 't' || name === 'tf' || name === 'tIn' || name === 'tfIn' || name === 'sysMsg') && n.callee.type === 'Identifier') {
        const a = n.arguments[name === 'tIn' || name === 'tfIn' ? 1 : 0];
        if (a && isStaticStr(a)) {
          const k = staticStr(a);
          if (!used.has(k)) used.set(k, []);
          used.get(k).push({ file: P.r, line: lineOf(P.src, n.start) });
        } else if (a) {
          dynamicKeys.push({ file: P.r, line: lineOf(P.src, n.start), kind: a.type });
        }
        for (const x of n.arguments) seen.add(x);
        // the first arg is wrapped; other args (vars) still scanned
        return;
      }
      if (name === 'L' && n.callee.type === 'Identifier' && n.arguments[0]?.type === 'ObjectExpression') {
        const o = n.arguments[0];
        const keys = new Set(o.properties.map((p) => keyName(p.key)));
        localTables.push({ file: P.r, line: lineOf(P.src, n.start), kind: 'L()', en: keys.has('en'), tr: keys.has('tr'), ru: keys.has('ru'),
          text: strOf(o.properties.find((p) => keyName(p.key) === 'en')?.value) || '' });
        markAll(o, seen);
        return false;
      }
      if (name === 'LA' && n.callee.type === 'Identifier' && n.arguments[0]?.type === 'ArrayExpression') {
        const a = n.arguments[0].elements;
        localTables.push({ file: P.r, line: lineOf(P.src, n.start), kind: 'LA()', en: true, tr: a.length > 1, ru: a.length > 2, text: strOf(a[0]) || '' });
        markAll(n.arguments[0], seen);
        return false;
      }
    }
    // ----- {en:'..', tr:'..'} objects (local tables)
    if (n.type === 'ObjectExpression') {
      const keys = new Map(n.properties.filter((p) => p.type === 'Property').map((p) => [keyName(p.key), p.value]));
      if (keys.has('en') && keys.has('tr') && isStaticStr(keys.get('en'))) {
        const enS = staticStr(keys.get('en'));
        localTables.push({ file: P.r, line: lineOf(P.src, n.start), kind: '{en,tr}', en: true, tr: true, ru: keys.has('ru') || RU.has(enS), text: enS, trText: isStaticStr(keys.get('tr')) ? staticStr(keys.get('tr')) : null });
        markAll(n, seen); return false;
      }
    }
    // ----- [en, tr] pair arrays
    if (n.type === 'ArrayExpression' && n.elements.length === 2 && n.elements.every((e) => e && isStaticStr(e))) {
      const a = staticStr(n.elements[0]), b = staticStr(n.elements[1]);
      if (parent && parent.type === 'Property' && ['tr', 'ru'].includes(keyName(parent.key))) { markAll(n, seen); return false; }   // {..., tr: [name, desc]} is TR-only data
      const inA = parent && parent.type === 'CallExpression' && calleeName(parent.callee) === 'A';   // achievements: A(id, icon, tier, en name, en desc, [trName, trDesc], ...)
      if (inA) {
        for (const i of [3, 4]) { const en = parent.arguments[i]; if (isStaticStr(en)) localTables.push({ file: P.r, line: lineOf(P.src, en.start), kind: 'A(name/desc)', en: true, tr: true, ru: RU.has(staticStr(en)), text: staticStr(en) }); }
        markAll(parent, seen);
      }
      if (!inA && a !== b && TRCHARS.test(b) && !TRCHARS.test(a) && !CYR.test(b)) {
        localTables.push({ file: P.r, line: lineOf(P.src, n.start), kind: '[en,tr]', en: true, tr: true, ru: RU.has(a), text: a, trText: b });
        markAll(n, seen); return false;
      }
    }
    // ----- literals
    if ((n.type === 'Literal' && typeof n.value === 'string') || n.type === 'TemplateLiteral') {
      if (seen.has(n)) return;
      const text = strOf(n);
      if (text === null) return;
      // import/export specifiers, object keys, switch cases, comparisons
      if (parent) {
        if (parent.type === 'ImportDeclaration' || parent.type === 'ExportNamedDeclaration' || parent.type === 'ExportAllDeclaration' || parent.type === 'ImportExpression') return;
        if (parent.type === 'Property' && parent.key === n) return;
        if (parent.type === 'SwitchCase' && parent.test === n) return;
        if (parent.type === 'BinaryExpression' && /^[!=]==?$/.test(parent.operator)) return;
        if (parent.type === 'MemberExpression' && parent.computed) return;
        if (parent.type === 'NewExpression') return;
      }
      // HTML: text nodes between tags
      if (/<[a-zA-Z][^>]*>/.test(text) || (n.type === 'TemplateLiteral' && />[^<>]*[A-Za-z]{3}[^<>]*</.test(text))) {
        for (const seg of text.split(/<[^>]*>/)) {
          const s = seg.replace(/\{\}/g, ' ').replace(/&\w+;/g, ' ').trim();
          if (s && humanText(seg.replace(/\{\}/g, '{x}').trim()) && !/^[{x}\s]+$/.test(seg)) push(P, n, 'html', seg.trim().slice(0, 120));
        }
        return;
      }
      if (!humanText(text)) return;
      // context
      const callParent = parent && parent.type === 'CallExpression' && parent.arguments.includes(n) ? parent : null;
      if (callParent) {
        const cn = calleeName(callParent.callee);
        if (cn && WRAPPERS.has(cn)) return;
        if (cn && IGNORE_CALLS.has(cn)) return;
        if (cn === 'addTranslations') return;
        if (parent.callee?.type === 'MemberExpression' && ['console'].includes(parent.callee.object?.name)) return;
        const sink = cn && SINK_CALLS.has(cn);
        push(P, n, sink ? 'sink:' + cn : 'call:' + cn, text.slice(0, 120));
        return;
      }
      if (parent && parent.type === 'Property' && parent.value === n) {
        const kn = keyName(parent.key);
        if (kn && NAME_PROPS.has(kn)) {
          // 'sys' broadcast payload?
          push(P, n, 'prop:' + kn, text.slice(0, 120));
        }
        return;
      }
      if (parent && parent.type === 'AssignmentExpression' && parent.right === n && parent.left.type === 'MemberExpression') {
        const pn = parent.left.property?.name;
        if (DOM_PROPS.has(pn)) push(P, n, 'dom:' + pn, text.slice(0, 120));
        return;
      }
      if (parent && (parent.type === 'ArrayExpression')) {
        const gp = parents[parents.length - 2];
        if (gp && gp.type === 'CallExpression' && calleeName(gp.callee) === 'push' && humanText(text)) push(P, n, 'push', text.slice(0, 120));
        else if (gp && gp.type === 'Property' && keyName(gp.key) && NAME_PROPS.has(keyName(gp.key))) push(P, n, 'prop:' + keyName(gp.key), text.slice(0, 120));
        return;
      }
      if (parent && (parent.type === 'ReturnStatement' || parent.type === 'ConditionalExpression' || parent.type === 'LogicalExpression' || parent.type === 'BinaryExpression' || parent.type === 'TemplateLiteral' || parent.type === 'VariableDeclarator')) {
        if (text.length >= 6 && / /.test(text) && /[A-Za-z]{3}/.test(text) && (parent.type !== 'BinaryExpression' || parent.operator === '+')) push(P, n, 'expr', text.slice(0, 120));
      }
    }
  });
}

// ------------------------------------------------------------------ report
const keysUsed = [...used.keys()];
// Dictionaries that modules build at import time (ROWS tables, builders): import every pure-data *_i18n / *_text file in node, which fills the
// real runtime tables, then count what hasTranslation() sees. Files that need the DOM/three are skipped (the static scan covers them).
{
  const I = await import(pathToUrl(path.join(SRC, 'core', 'i18n.js')));
  for (const f of walk(SRC).filter((f) => /(_i18n\w*|_text\d?|_data|ru_gap8_\w+|passivetree_i18n)\.js$/.test(f))) {
    try {
      const m = await import(pathToUrl(f));
      const d = m.buildDictionaries ? m.buildDictionaries() : {};
      for (const [o, T] of [[d.tr, 'tr'], [m.TR, 'tr'], [m.C3_TR, 'tr'], [m.A11Y_TR, 'tr'], [d.ru, 'ru'], [m.RU, 'ru'], [m.C3_RU, 'ru'], [m.A11Y_RU, 'ru']]) {
        if (o && typeof o === 'object') for (const k of Object.keys(o)) { const M = T === 'tr' ? TR : RU; if (!M.has(k)) M.set(k, rel(f)); }
      }
    } catch (e) { /* not importable in node */ }
  }
  for (const k of new Set([...keysUsed, ...TR.keys(), ...RU.keys()])) { if (!TR.has(k) && I.hasTranslation('tr', k)) TR.set(k, 'runtime'); if (!RU.has(k) && I.hasTranslation('ru', k)) RU.set(k, 'runtime'); }
}
const missTR = keysUsed.filter((k) => !TR.has(k) && !/^[^A-Za-z]*$/.test(k));
const missRU = keysUsed.filter((k) => !RU.has(k) && !/^[^A-Za-z]*$/.test(k));
const ltMissRU = localTables.filter((x) => !x.ru);
const ltMissTR = localTables.filter((x) => !x.tr);
// dictionary coverage: TR keys without RU (definitions that exist for TR but not RU)
const trNoRu = [...TR.keys()].filter((k) => !RU.has(k));
const localEn = new Set(localTables.map((x) => x.text));
const ruNoTr = [...RU.keys()].filter((k) => !TR.has(k) && !localEn.has(k));

if (flag('gaps')) { console.log(JSON.stringify({ trNoRu: trNoRu.map((k) => [k, TR.get(k)]), ruNoTr: ruNoTr.map((k) => [k, RU.get(k)]) }, null, 1)); process.exit(0); }   // --gaps: the twin-less keys with their TR/RU source

// unwrapped findings that are actually covered by both dictionaries (data strings translated through t() elsewhere) -> "covered"
const localEnAll = new Set(localTables.map((x) => x.text));
const unwrapped = findings.filter((x) => !((TR.has(x.text) || localEnAll.has(x.text)) && RU.has(x.text)));
const covered = findings.length - unwrapped.length;

const inFilter = (r) => !FILE_FILTER || r.includes(FILE_FILTER);
const byFile = new Map();
for (const x of unwrapped) if (inFilter(x.file)) { if (!byFile.has(x.file)) byFile.set(x.file, []); byFile.get(x.file).push(x); }

if (flag('dump')) {   // --dump : every key that needs RU (TR dictionary keys + used t() keys), with its TR text and location
  const trv = VALUES.get(TR) || new Map();
  const keys = new Set([...TR.keys(), ...keysUsed]);
  const rows = [];
  for (const k of keys) if (!RU.has(k) && /[A-Za-z]/.test(k)) rows.push({ key: k, tr: trv.get(k) || null, where: TR.get(k) || (used.get(k) || [{}])[0].file });
  const have = new Set(rows.map((r) => r.key));
  for (const x of localTables) if (!x.ru && x.text && !have.has(x.text) && /[A-Za-z]/.test(x.text)) { have.add(x.text); rows.push({ key: x.text, tr: x.trText || null, where: x.file + ':' + x.line, local: x.kind }); }
  console.log(JSON.stringify(rows, null, 1));
  process.exit(0);
}
if (JSON_OUT) {
  console.log(JSON.stringify({
    dict: { tr: TR.size, ru: RU.size, dynamic: notes.dynamicDicts.length },
    keysUsed: keysUsed.length, missingTR: missTR, missingRU: missRU, dynamicKeys,
    localTables: { total: localTables.length, missingRU: ltMissRU, missingTR: ltMissTR },
    unwrapped: unwrapped.filter((x) => inFilter(x.file)).map((x) => ({ ...x, hasTR: TR.has(x.text) || localEnAll.has(x.text), hasRU: RU.has(x.text) })),
  }, null, 1));
  process.exit(0);
}

const out = [];
const P_ = (s = '') => out.push(s);
P_('TFG i18n audit');
P_('==============');
P_(`dictionaries : TR ${TR.size} keys | RU ${RU.size} keys  (${notes.dynamicDicts.length} computed/unresolved addTranslations args)`);
P_(`t()/tf() keys: ${keysUsed.length} distinct literal keys, ${dynamicKeys.length} dynamic calls (t(variable) / template with \${})`);
P_(`MISSING TR   : ${missTR.length} keys used via t()/tf() without TR`);
P_(`MISSING RU   : ${missRU.length} keys used via t()/tf() without RU`);
P_(`local tables : ${localTables.length} ({en,tr}/L()/[en,tr]) -> ${ltMissTR.length} without TR, ${ltMissRU.length} without RU`);
P_(`dict gaps    : ${trNoRu.length} TR keys have no RU twin; ${ruNoTr.length} RU keys have no TR twin`);
P_(`UNWRAPPED    : ${unwrapped.length} likely user-visible hard-coded strings in ${byFile.size} files (${covered} more are covered by dictionaries)`);
P_('');
if (ONLY !== 'unwrapped') {
  const show = (label, arr, fmt) => { if (!arr.length) return; P_(`-- ${label} (${arr.length})`); for (const x of arr.slice(0, VERBOSE ? 1e9 : Math.max(MAX * 5, 30))) P_('  ' + fmt(x)); if (!VERBOSE && arr.length > Math.max(MAX * 5, 30)) P_('  ...'); P_(''); };
  const where = (k) => used.get(k).slice(0, 1).map((u) => `${u.file}:${u.line}`).join('');
  const missBoth = missTR.filter((k) => missRU.includes(k));
  show('keys missing TR', missTR.filter((k) => inFilter(used.get(k)[0].file)), (k) => `${where(k)}  ${JSON.stringify(k.slice(0, 100))}`);
  show('keys missing RU', missRU.filter((k) => inFilter(used.get(k)[0].file)), (k) => `${where(k)}  ${JSON.stringify(k.slice(0, 100))}`);
  show('local tables missing RU', ltMissRU.filter((x) => inFilter(x.file)), (x) => `${x.file}:${x.line} ${x.kind} ${JSON.stringify(x.text.slice(0, 80))}`);
  show('local tables missing TR', ltMissTR.filter((x) => inFilter(x.file)), (x) => `${x.file}:${x.line} ${x.kind} ${JSON.stringify(x.text.slice(0, 80))}`);
  show('dynamic t() keys (cannot be verified statically)', dynamicKeys.filter((x) => inFilter(x.file)), (x) => `${x.file}:${x.line} ${x.kind}`);
  void missBoth;
}
if (ONLY !== 'missing') {
  P_('-- unwrapped user-visible strings per file');
  const rows = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [file, list] of rows) {
    P_(`${String(list.length).padStart(4)}  ${file}`);
    for (const x of list.slice(0, MAX)) P_(`        :${x.line} [${x.kind}] ${JSON.stringify(x.text)}`);
    if (list.length > MAX) P_(`        ... +${list.length - MAX} more (use --verbose --file ${path.basename(file)})`);
  }
}
console.log(out.join('\n'));
