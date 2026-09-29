// node tools/harness/ui2_glyphs.test.mjs  - glyph table sanity: every emoji maps to an existing pictogram, output is well-formed SVG.
import { glyph, glyphFromEmoji, glyphify, GLYPH_NAMES } from '../../src/ui/glyphs.js';
import fs from 'fs';
let bad = 0;
const chk = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
for (const n of GLYPH_NAMES) { const g = glyph(n); chk(/^<svg [^>]*viewBox="0 0 24 24"[^>]*><path d="[^"]+"\/><\/svg>$/.test(g), 'svg shape ' + n); }
const src = fs.readFileSync(new URL('../../src/ui/glyphs.js', import.meta.url), 'utf8');
const map = src.match(/const EMOJI = \{([\s\S]*?)\n\};/)[1];
for (const m of map.matchAll(/'([^']+)':\s*'([a-z]+)'/g)) { chk(GLYPH_NAMES.includes(m[2]), 'emoji ' + m[1] + ' -> missing ' + m[2]); chk(glyphFromEmoji(m[1]).startsWith('<svg'), 'emoji renders ' + m[1]); }
chk(glyphFromEmoji('<b>&') === '&lt;b&gt;&amp;', 'escape');
chk(glyph('nope') === '', 'unknown glyph is empty');
{ const g = glyphify('<b>⚡ 5</b> ❄\uFE0F+2 · ⚙3 🔒 ▮9 a&amp;b'); chk(!/[⚡❄⚙🔒]/u.test(g) && g.includes('▮9 a&amp;b') && (g.match(/<svg/g) || []).length === 4, 'glyphify swaps symbols, keeps the rest: ' + g); }
// every creature / codex icon used by record.js has a glyph
const rec = fs.readFileSync(new URL('../../src/ui/panels/record.js', import.meta.url), 'utf8');
for (const m of rec.matchAll(/'((?:\p{Extended_Pictographic}️?)+)'/gu)) chk(glyphFromEmoji(m[1]).startsWith('<svg'), 'record.js emoji unmapped: ' + m[1]);
console.log(bad ? bad + ' FAILED' : 'ui2 glyphs OK (' + GLYPH_NAMES.length + ' pictograms)');
process.exit(bad ? 1 : 0);
