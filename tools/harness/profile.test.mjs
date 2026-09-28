// [profile] node test: nickname rules, pixel avatar encode / decode round trip, wire format, size caps.
// Run: node tools/harness/profile.test.mjs
import assert from 'node:assert/strict';
import { validateName, cleanName, nameKey, isSlur, NAME_MAX } from '../../src/core/profilename.js';
import {
  PX_LEN, PNG_MAX, PNG_SIG, blankPx, encodePx, decodePx, isPx, floodFill, lineCells, TEMPLATES, defaultPx,
  toWire, fromWire, sanitizeAvatar, isPng, frameChar, frameFromChar, FRAMES, frameUnlocked,
} from '../../src/ui/avatarpic.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// ---- names
eq(cleanName('  Bob   the   Builder  '), 'Bob the Builder', 'trim + collapse spaces');
eq(cleanName('Ali​\u0007<b>😀'), 'Alib', 'control / zero-width / emoji / punctuation stripped');
ok([...cleanName('x'.repeat(40))].length <= NAME_MAX, 'cap length');
eq(validateName('A').reason, 'short'); eq(validateName('   ').reason, 'short'); eq(validateName('').reason, 'short');
eq(validateName('x'.repeat(30)).reason, 'long');
ok(validateName('Kefal_42').ok && validateName('Ayşe Öz').ok && validateName('Игрок Один').ok, 'unicode letters are fine');
eq(validateName('nigger').reason, 'slur'); eq(validateName('N1gg3r').reason, 'slur'); eq(validateName('o.r.o.s.p.u').reason, 'slur');
eq(validateName('пидор').reason, 'slur'); eq(validateName('xxПидорxx').reason, 'slur');
ok(validateName('Sibney').ok && validateName('Raccoon').ok && validateName('Scunthorpe').ok, 'no Scunthorpe problem for short roots');
eq(validateName('Host').reason, 'reserved'); eq(validateName('4dm1n').reason, 'reserved');
eq(validateName('H0st_ ').reason, 'reserved');
eq(validateName('Kefal', { taken: ['KEFAL'] }).reason, 'taken', 'case-insensitive duplicate');
eq(validateName('K3fal', { taken: ['Kefal'] }).reason, 'taken', 'leet lookalike duplicate');
eq(validateName('Неllo', { taken: ['Hello'] }).reason, 'taken', 'cyrillic lookalike duplicate');
ok(validateName('Employee123', { taken: ['Employee847'] }).ok, 'default-style names do not collide');
ok(validateName('Kefal', { taken: ['Kefal'], own: 'Kefal' }).ok, 'own current name is not a duplicate');
ok(nameKey('Ş_ı-ğ') === nameKey('sig'), 'turkish folding');
ok(!isSlur('Kefal') && !isSlur('Employee123'));

// ---- pixel encode / decode
const arr = new Uint8Array(PX_LEN).map((_, i) => (i * 7 + (i >> 4)) & 15);
const s = encodePx(arr);
ok(s.length === 256 && isPx(s), '256 chars');
eq([...decodePx(s)], [...arr], 'round trip');
eq(decodePx('zz').length, PX_LEN, 'bad input -> blank grid');
ok(decodePx(blankPx(5)).every((v) => v === 5));
const g = new Uint8Array(PX_LEN); floodFill(g, 3, 3, 7); ok(g.every((v) => v === 7), 'fill whole blank grid');
g.fill(0); g[16 * 5 + 2] = 1; floodFill(g, 0, 0, 9); ok(g[16 * 5 + 2] === 1 && g[0] === 9);
ok(lineCells(0, 0, 15, 15).length === 16 && lineCells(2, 2, 2, 2).length === 1, 'line cells');
for (const t of TEMPLATES) ok(isPx(t.px()), 'template ' + t.id);
eq(defaultPx('Kefal'), defaultPx('kefal'), 'default avatar is deterministic (case-insensitive)');
ok(defaultPx('Kefal') !== defaultPx('Employee123') && isPx(defaultPx('')), 'default avatar differs per name');
const sym = decodePx(defaultPx('Kefal')); let symOk = true;
for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) if (sym[y * 16 + x] !== sym[y * 16 + 15 - x]) symOk = false;
ok(symOk, 'default avatar is mirrored');

// ---- wire format + caps
const px = TEMPLATES[0].px();
const av = { m: 'p', f: 'gold', px };
const w = toWire(av);
ok(w.length === 258 && w[0] === 'p', 'lite wire = 258 chars');
eq(fromWire(w), { m: 'p', f: 'gold', px }, 'wire round trip');
eq(frameFromChar(frameChar('void')), 'void');
eq(fromWire('x' + w.slice(1)), null, 'bad mode'); eq(fromWire(w.slice(0, 100)), null, 'short'); eq(fromWire(null), null);
eq(fromWire('p0' + 'g'.repeat(256)), null, 'non-hex rejected');
const png = PNG_SIG + 'A'.repeat(2000) + '==';
ok(isPng(png) && !isPng(png + '!') && !isPng('AAAA' + png) && !isPng(PNG_SIG + 'A'.repeat(PNG_MAX + 100)), 'png sanity + size cap');
const snap = sanitizeAvatar({ m: 's', f: 'nope', px, png, bg: '#102030' });
eq(snap.m, 's'); eq(snap.f, 'none', 'unknown frame -> none'); eq(snap.bg, '#102030');
eq(sanitizeAvatar({ m: 's', px, png: 'not a png' }).m, 'p', 'bad png falls back to pixel mode');
eq(sanitizeAvatar({ m: 'p', px, bg: 'red' }).bg, undefined, 'bad bg dropped');
eq(sanitizeAvatar({ px: 'short' }), null); eq(sanitizeAvatar(null), null);
const swire = toWire(snap); ok(swire[0] === 's' && swire.length === 258, 'snapshot lite wire keeps 258 chars (png travels in pf)');
eq(fromWire(swire, png).m, 's'); eq(fromWire(swire).m, 'p', 'no png yet -> thumbnail');
ok(frameUnlocked('amber', { level: 1 }) && !frameUnlocked('gold', { level: 3 }) && frameUnlocked('gold', { level: 15 }), 'level frames');
ok(!frameUnlocked('blood', {}) && frameUnlocked('blood', { achievements: { first_blood: { at: 1 } } }), 'achievement frame');
ok(FRAMES.filter((f) => !f.need).length === 4, 'four basic frames');
console.log('profile.test.mjs: ' + n + ' assertions passed');
