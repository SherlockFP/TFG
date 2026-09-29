// node tools/harness/ui3.test.mjs - UI3 unit checks that need no browser: a/an grammar, glyphify, no leftover emoji in the converted panels,
// ui3.css scoping (every rule is behind html.tfg-ui3), i18n keys for the new toast string.
import fs from 'fs';
import { aAn } from '../../src/core/util.js';
import { glyphify } from '../../src/ui/glyphs.js';
import { spreadLabels } from '../../src/ui/compass_labels.js';
import { t, tf, addTranslations } from '../../src/core/i18n.js';
let bad = 0;
const chk = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// grammar
for (const [w, a] of [['Enforcer', 'an'], ['Occultist', 'an'], ['Engineer', 'an'], ['Medic', 'a'], ['Technician', 'a'], ['Hauler', 'a'], ['Scout', 'a'], ['', 'a']]) chk(aAn(w) === a, `aAn(${w}) = ${aAn(w)}`);
const src = rd('src/game/rpg.js');
chk(!/is now a \{name\}|is now a \$\{/.test(src), 'rpg.js still prints "is now a"');
chk(/is now \{art\} \{name\}/.test(src), 'rpg.js uses the article placeholder');
const sentence = tf('{n} is now {art} {name}.', { n: 'Tester', name: 'Enforcer', art: aAn('Enforcer') });
chk(sentence === 'Tester is now an Enforcer.', 'sentence: ' + sentence);
addTranslations({ '{n} is now {art} {name}.': '{n} artık {name}.' });
for (const f of ['src/game/aptitudes.js', 'src/game/rpgctl.js']) chk(!/now a \$\{/.test(rd(f)), f + ' still has "now a ${"');

// compass labels: coinciding bearings no longer overlap, order and tape bounds are kept
{
  const W = 440, ov = (L) => { for (let i = 1; i < L.length; i++) if (L[i].tx - L[i].tw / 2 < L[i - 1].tx + L[i - 1].tw / 2) return true; return false; };
  const two = spreadLabels([{ tx: 220, tw: 80, n: 'SHIP' }, { tx: 220, tw: 100, n: 'ENTRANCE' }], W);
  chk(!ov(two), 'compass: SHIP / ENTRANCE still overlap');
  chk(two.every((l) => l.tx - l.tw / 2 >= 0 && l.tx + l.tw / 2 <= W), 'compass: label outside the tape');
  const edge = spreadLabels([{ tx: 430, tw: 90 }, { tx: 432, tw: 90 }, { tx: 20, tw: 60 }], W);
  chk(!ov(edge) && edge.every((l) => l.tx - l.tw / 2 >= 0 && l.tx + l.tw / 2 <= W), 'compass: edge case ' + JSON.stringify(edge));
  const far = [{ tx: 60, tw: 70 }, { tx: 300, tw: 70 }]; const c = JSON.stringify(far); spreadLabels(far, W);
  chk(JSON.stringify(far) === c, 'compass: far labels must not move');
}

// glyphify never touches escaped text, credit sign, or attributes without symbols
const g = glyphify('<div title="x">⚡ 3 &lt;b&gt; ▮5 ❄+2</div>');
chk((g.match(/<svg/g) || []).length === 2 && g.includes('&lt;b&gt; ▮5'), 'glyphify: ' + g);

// converted panels: no emoji left in the touched lines
const EM = /[\u{1F300}-\u{1FAFF}⚡❄⚙]/u;
for (const f of ['crafting', 'profile', 'wardrobe', 'spellbook', 'shop']) {
  const lines = rd(`src/ui/panels/${f}.js`).split('\n');
  lines.forEach((l, i) => { if (EM.test(l) && !/\/\//.test(l.split(EM)[0])) { chk(false, `${f}.js:${i + 1} still has an emoji/symbol: ${l.trim().slice(0, 80)}`); } });
}

// homeworld panels keep their symbols in the source but every innerHTML goes through glyphify()
for (const f of ['homeworld', 'homeworld2']) for (const l of rd(`src/ui/panels/${f}.js`).split('\n')) if (/mainEl\.innerHTML = /.test(l) && /[\u26A1\u2744\u2699]|= h;/.test(l) || /mainEl\.innerHTML = h;/.test(l)) chk(/glyphify\(/.test(l), f + ': innerHTML without glyphify: ' + l.trim().slice(0, 70));

// ui3.css: every top-level selector is scoped to html.tfg-ui3 (so removing the class restores the old look)
const css = rd('src/ui/ui3.css').replace(/\/\*[\s\S]*?\*\//g, '');
const topSplit = (sel) => { const out = []; let d = 0, cur = ''; for (const ch of sel) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
let depth = 0, buf = '';
for (const ch of css) {
  if (ch === '{') { if (depth === 0) { const sel = buf.trim(); if (!sel.startsWith('@media')) for (const one of topSplit(sel)) chk(/^html\.tfg-ui3[ .:#]/.test(one.trim()), 'unscoped selector: ' + one.trim().slice(0, 80)); } else if (depth === 1) { for (const one of topSplit(buf.trim())) chk(/^html\.tfg-ui3[ .:#]/.test(one.trim()), 'unscoped selector in @media: ' + one.trim().slice(0, 80)); } depth++; buf = ''; }
  else if (ch === '}') { depth--; buf = ''; }
  else buf += ch;
}
chk(!/box-shadow:\s*0 0 \d+px/.test(css), 'ui3.css adds a glow');

// ---- ARTDIR (wave 6): identity kit, scoped css, no emoji, EN/TR/RU strings, panel kinds
{
  const { wordmarkSvg, sealSvg, eyeSvg, compositionSvg } = await import('../../src/ui/logo.js');
  const { kindOf, formCode } = await import('../../src/ui/artdir.js');
  const { MEMOS, HINTS } = await import('../../src/ui/artdir_menu.js');
  const { tIn } = await import('../../src/core/i18n.js');
  for (const [n, svg] of [['wordmark', wordmarkSvg()], ['seal', sealSvg()], ['eye', eyeSvg({ live: true })], ['composition', compositionSvg(['van', 'planet', 'gear'])]]) {
    chk(svg.startsWith('<svg') && svg.endsWith('</svg>') && !EM.test(svg), 'artdir svg ' + n);
  }
  chk((compositionSvg(['van', 'planet', 'gear']).match(/<path/g) || []).length >= 6, 'composition has its glyphs');
  chk(kindOf('PAUSED').key === 'pause' && kindOf('DURAKLATILDI').key === 'pause' && kindOf('ПАУЗА').key === 'pause' && kindOf('Shop').key === 'shop', 'panel kinds EN/TR/RU');
  for (const w of ['SETTINGS', 'PAUSED', 'Shop', 'HOST GAME', 'x', '']) chk(/^TFG-\d\d-[A-H]$/.test(formCode(w)) && formCode(w) === formCode(w), 'form code ' + w + ' ' + formCode(w));
  const strs = [...MEMOS, ...Object.values(HINTS), 'TERMINATED', 'PLAY', 'OFFICE', 'MEMO', 'APPROVED', 'CLASSIFIED', 'PENDING', 'ON BREAK', 'RESTRICTED', 'ONBOARDING IN PROGRESS', 'Art direction'];
  for (const k of strs) for (const l of ['tr', 'ru']) chk(tIn(l, k) !== k, `artdir string missing ${l}: ${k}`);
  chk(MEMOS.every((m) => m.length < 90), 'memo too long for the ticker');
  chk(/tfg-artdir/.test(rd('src/ui/artdir.js')) && /artdir\.js/.test(rd('src/ui/theme.js')) && /syncArtdir\(s\)/.test(rd('src/ui/ui.js')), 'artdir hooks present');
  for (const f of ['src/ui/artdir.js', 'src/ui/artdir_menu.js', 'src/ui/logo.js', 'src/ui/artdir.css', 'src/ui/artdir_i18n.js']) chk(!EM.test(rd(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), f + ' contains an emoji');
  const acss = rd('src/ui/artdir.css').replace(/\/\*[\s\S]*?\*\//g, '');
  let d2 = 0, b2 = '';
  for (const ch of acss) {
    if (ch === '{') { if (d2 === 0) { const sel = b2.trim(); if (!sel.startsWith('@')) for (const one of topSplit(sel)) chk(/^(html\.tfg-artdir|html\.ad-calm\.tfg-artdir|:root$|\.ad-only$)/.test(one.trim()), 'artdir.css unscoped: ' + one.trim().slice(0, 70)); } d2++; b2 = ''; }
    else if (ch === '}') { d2--; b2 = ''; } else b2 += ch;
  }
  chk(!/box-shadow:\s*0 0 \d+px|text-shadow:\s*0 0 \d+px|backdrop-filter/.test(acss), 'artdir.css adds a glow / blur');
}
console.log(bad ? bad + ' FAILED' : 'ui3 OK');
process.exit(bad ? 1 : 0);
