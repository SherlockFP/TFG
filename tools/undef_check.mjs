#!/usr/bin/env node
// Rough "no-undef" scan (file-level scope, so it only catches identifiers that are declared NOWHERE in the file: missing imports, typos).
//   node tools/undef_check.mjs [--file <substr>]        exit code 0 always (report)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let parseAst;
try { ({ parseAst } = await import('file://' + require.resolve('rolldown/parseAst'))); } catch { ({ parseAst } = await import('rolldown/parseAst')); }
const filt = process.argv.includes('--file') ? process.argv[process.argv.indexOf('--file') + 1] : '';

const GLOBALS = new Set(('undefined NaN Infinity globalThis window document navigator console Math JSON Object Array String Number Boolean Symbol Map Set WeakMap WeakSet WeakRef Promise Date RegExp Error TypeError RangeError '
  + 'parseInt parseFloat isNaN isFinite setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame queueMicrotask performance localStorage sessionStorage indexedDB '
  + 'fetch URL URLSearchParams Blob File FileReader FormData Image Audio AudioContext OfflineAudioContext AudioBuffer AudioBufferSourceNode Float32Array Float64Array Uint8Array Uint16Array Uint32Array Int8Array Int16Array Int32Array Uint8ClampedArray ArrayBuffer DataView '
  + 'BigInt Proxy Reflect Intl TextEncoder TextDecoder atob btoa encodeURIComponent decodeURIComponent escape unescape structuredClone crypto '
  + 'HTMLElement HTMLCanvasElement HTMLImageElement HTMLInputElement Element Node Event KeyboardEvent MouseEvent PointerEvent CustomEvent EventTarget MutationObserver ResizeObserver IntersectionObserver '
  + 'CanvasRenderingContext2D OffscreenCanvas ImageData ImageBitmap createImageBitmap Path2D MediaStream MediaRecorder SpeechRecognition webkitSpeechRecognition speechSynthesis SpeechSynthesisUtterance SpeechRecognitionEvent '
  + 'WebSocket Worker BroadcastChannel RTCPeerConnection AbortController AbortSignal Response Request Headers CSS getComputedStyle matchMedia alert confirm prompt open close location history screen '
  + 'innerWidth innerHeight devicePixelRatio process require module exports __dirname __filename Buffer import arguments this super new target meta DOMParser XMLHttpRequest Gamepad navigator '
  + 'AnalyserNode GainNode BiquadFilterNode OscillatorNode PannerNode StereoPannerNode DynamicsCompressorNode ConvolverNode WaveShaperNode MediaStreamAudioSourceNode AudioParam AudioListener '
  + 'DOMException DOMRect DOMMatrix WebGLRenderingContext WebGL2RenderingContext ClipboardItem getSelection').split(/\s+/));

function walk(d, out = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p); } return out; }
function patNames(p, out) {
  if (!p) return;
  switch (p.type) {
    case 'Identifier': out.add(p.name); break;
    case 'ObjectPattern': for (const q of p.properties) patNames(q.type === 'RestElement' ? q.argument : q.value, out); break;
    case 'ArrayPattern': for (const q of p.elements) patNames(q, out); break;
    case 'AssignmentPattern': patNames(p.left, out); break;
    case 'RestElement': patNames(p.argument, out); break;
    default: break;
  }
}
function visit(n, fn, parent = null, key = '') {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { for (const x of n) visit(x, fn, parent, key); return; }
  if (typeof n.type === 'string') { if (fn(n, parent, key) === false) return; parent = n; }
  for (const k in n) { if (k === 'type' || k === 'start' || k === 'end') continue; const v = n[k]; if (v && typeof v === 'object') visit(v, fn, parent, k); }
}
let total = 0;
for (const f of walk(path.join(ROOT, 'src')).sort()) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  if (filt && !rel.includes(filt)) continue;
  let ast;
  try { ast = parseAst(fs.readFileSync(f, 'utf8')); } catch { console.log('parse failed', rel); continue; }
  const declared = new Set();
  visit(ast, (n) => {
    if (n.type === 'ImportDeclaration') for (const s of n.specifiers) declared.add(s.local.name);
    else if (n.type === 'VariableDeclarator') patNames(n.id, declared);
    else if (n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') { if (n.id) declared.add(n.id.name); }
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') { for (const p of n.params) patNames(p, declared); if (n.type === 'FunctionExpression' && n.id) declared.add(n.id.name); }
    else if (n.type === 'ClassExpression' && n.id) declared.add(n.id.name);
    else if (n.type === 'CatchClause') patNames(n.param, declared);
  });
  const src = fs.readFileSync(f, 'utf8');
  const lineOf = (pos) => src.slice(0, pos).split('\n').length;
  const seen = new Set();
  visit(ast, (n, parent, key) => {
    if (n.type !== 'Identifier') return;
    if (parent) {
      const pt = parent.type;
      if ((pt === 'MemberExpression' || pt === 'ChainExpression') && key === 'property' && !parent.computed) return;
      if ((pt === 'Property' || pt === 'PropertyDefinition' || pt === 'MethodDefinition') && key === 'key' && !parent.computed) return;
      if (pt === 'Property' && key === 'value' && parent.shorthand) { /* {a} -> a is a reference */ }
      if (pt === 'ImportSpecifier' || pt === 'ExportSpecifier' || pt === 'ImportDefaultSpecifier' || pt === 'ImportNamespaceSpecifier') return;
      if (pt === 'LabeledStatement' || pt === 'BreakStatement' || pt === 'ContinueStatement') return;
      if (pt === 'MetaProperty') return;
      if ((pt === 'VariableDeclarator' && key === 'id') || ((pt === 'FunctionDeclaration' || pt === 'FunctionExpression' || pt === 'ClassDeclaration' || pt === 'ClassExpression') && key === 'id')) return;
    }
    const nm = n.name;
    if (declared.has(nm) || GLOBALS.has(nm) || seen.has(nm)) return;
    seen.add(nm);
    total++;
    console.log(`${rel}:${lineOf(n.start)}  ${nm}`);
  });
}
console.log(`\n${total} possibly undefined identifier(s)`);
