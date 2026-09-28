// Node test for the `music` module's pure logic: note maths, chord spelling, layouts, songbook data, wire format,
// rate limiter, jam detector and the Karplus-Strong renderer (pitch accuracy). Run: node tools/harness/music.test.mjs
import assert from 'node:assert/strict';
import {
  midiToFreq, noteName, parseNote, pitchClass, SCALES, scaleNote, keyToMidi, midiToKey, PIANO_KEYS, SCALE_HOME,
  CHORD_QUALITIES, CHORD_SLOTS, CHORD_SLOTS_SHIFT, chordName, chordSpelling, chordNotes, encodeChord, decodeChord,
  DRUM_KEYS, DRUM_PADS, INSTRUMENTS, SONGS, songRange, songBeats, judgeNote, accuracy,
  sanitizeEvent, createRateLimiter, jamGroup, F_CHORD, F_ALT, F_SUS, MU_MAX_BATCH,
} from '../../src/game/songbook.js';
import { renderKS, stringParams, distortionCurve } from '../../src/audio/instruments.js';

let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('ok  ' + name); } catch (e) { console.error('FAIL ' + name + '\n  ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n  ')); process.exitCode = 1; } };

t('note frequencies (A4 = 440, C4 = 261.63, octaves double)', () => {
  assert.equal(midiToFreq(69), 440);
  assert.ok(Math.abs(midiToFreq(60) - 261.6256) < 1e-3);
  assert.ok(Math.abs(midiToFreq(81) / midiToFreq(69) - 2) < 1e-9);
  assert.ok(Math.abs(midiToFreq(40) - 82.4069) < 1e-3);          // low E of a guitar
  assert.ok(Math.abs(midiToFreq(64) - 329.6276) < 1e-3);         // high E string open (E4)
});
t('note names + parsing round trip', () => {
  assert.equal(noteName(60), 'C4'); assert.equal(noteName(61), 'C#4'); assert.equal(noteName(69), 'A4'); assert.equal(noteName(40), 'E2');
  assert.equal(parseNote('C4'), 60); assert.equal(parseNote('D#5'), 75); assert.equal(parseNote('Bb3'), 58); assert.equal(parseNote('x'), null);
  for (let m = 24; m < 108; m++) assert.equal(parseNote(noteName(m)), m);
  assert.equal(pitchClass(-1), 11);
});
t('chord spelling', () => {
  const by = (r, q) => chordSpelling(r, CHORD_QUALITIES.findIndex((x) => x.id === q)).join(' ');
  assert.equal(by(0, 'maj'), 'C E G'); assert.equal(by(9, 'min'), 'A C E'); assert.equal(by(7, '7'), 'G B D F');
  assert.equal(by(4, '7'), 'E G# B D'); assert.equal(by(2, 'min'), 'D F A'); assert.equal(by(5, 'maj7'), 'F A C E'); assert.equal(by(11, 'dim'), 'B D F');
});
t('chord slots 1-8 and SHIFT variants', () => {
  assert.deepEqual(CHORD_SLOTS.map((s) => chordName(s.root, s.q)), ['C', 'G', 'Am', 'F', 'Dm', 'Em', 'E7', 'D']);
  assert.deepEqual(CHORD_SLOTS_SHIFT.map((s) => chordName(s.root, s.q)), ['Cm', 'G7', 'A7', 'Fm', 'D7', 'E', 'Em7', 'Dm']);
  assert.deepEqual(CHORD_SLOTS.map((s) => s.key), Array.from({ length: 8 }, (_, i) => 'Digit' + (i + 1)));
});
t('chord voicings: every slot, both voicings, in range, root first, pitch classes right', () => {
  for (const slots of [CHORD_SLOTS, CHORD_SLOTS_SHIFT]) for (const s of slots) for (const v of ['acoustic', 'power']) for (const oct of [-1, 0, 1]) {
    const notes = chordNotes(s.root, s.q, oct, v);
    assert.ok(notes.length >= 4 && notes.length <= 6, `${chordName(s.root, s.q)} ${v} has ${notes.length} notes`);
    assert.equal(pitchClass(notes[0]), s.root, 'root first');
    assert.ok(notes.every((n) => n >= 28 && n <= 96));
    const allowed = new Set(CHORD_QUALITIES[s.q].iv.map((i) => (s.root + i) % 12));
    if (v === 'power') allowed.add((s.root + 7) % 12);
    assert.ok(notes.every((n) => allowed.has(pitchClass(n))), 'only chord tones');
    assert.ok(notes.every((n, i) => i === 0 || n >= notes[i - 1]), 'low to high');
  }
  assert.equal(chordNotes(0, 0, 0, 'acoustic').length, 6);   // C major: 6 strings
  assert.equal(chordNotes(0, 0, 0, 'power').length, 5);
  assert.deepEqual(chordNotes(0, 0, 0, 'acoustic').slice(0, 3), [48, 55, 60]);   // C3 G3 C4
  assert.deepEqual(chordNotes(4, 1, 0, 'acoustic')[0], 40);  // E minor starts on the low E string
});
t('chord id encode / decode', () => {
  for (let q = 0; q < CHORD_QUALITIES.length; q++) for (let r = 0; r < 12; r++) for (const o of [-1, 0, 1]) {
    const id = encodeChord(r, q, o), d = decodeChord(id);
    assert.deepEqual(d, { root: r, q, oct: o });
  }
  assert.equal(decodeChord(9999), null); assert.equal(decodeChord(-5), null);
});
t('typing-piano layout (C4 at A) and scale locks', () => {
  assert.equal(keyToMidi('KeyA', 4), 60); assert.equal(keyToMidi('KeyW', 4), 61); assert.equal(keyToMidi('KeyK', 4), 72); assert.equal(keyToMidi('Semicolon', 4), 76);
  assert.equal(keyToMidi('KeyA', 3), 48); assert.equal(keyToMidi('KeyZ', 4), null);
  assert.equal(Object.keys(PIANO_KEYS).length, 17);
  const major = SCALES.findIndex((s) => s.id === 'major'), pent = SCALES.findIndex((s) => s.id === 'pent'), blues = SCALES.findIndex((s) => s.id === 'blues');
  assert.deepEqual(SCALE_HOME.slice(0, 8).map((c) => keyToMidi(c, 4, major)), [60, 62, 64, 65, 67, 69, 71, 72]);
  assert.equal(keyToMidi('KeyW', 4, major), 72);            // top row continues one scale up
  assert.deepEqual(SCALE_HOME.slice(0, 6).map((c) => keyToMidi(c, 4, pent)), [60, 62, 64, 67, 69, 72]);
  assert.equal(scaleNote(SCALES[blues].steps, 6, 60), 72);
  for (let s = 1; s < SCALES.length; s++) for (const c of SCALE_HOME) { const n = keyToMidi(c, 4, s); assert.ok(n >= 60 && n <= 100); }
  assert.equal(midiToKey(64, 4, 0), 'KeyD'); assert.equal(midiToKey(70, 4, 0), 'KeyU'); assert.equal(midiToKey(20, 4, 0), null);
  // every note of every scale-lock row stays inside the scale
  for (let s = 1; s < SCALES.length; s++) for (const c of [...SCALE_HOME]) assert.ok(SCALES[s].steps.includes(pitchClass(keyToMidi(c, 4, s)) - 0), `${SCALES[s].id} ${c}`);
});
t('drum layout: 8 pads, keys map into range', () => {
  assert.equal(DRUM_PADS.length, 8);
  for (const v of Object.values(DRUM_KEYS)) assert.ok(v >= 0 && v < 8);
  assert.equal(new Set(Object.values(DRUM_KEYS)).size, 8);
});
t('instrument table', () => {
  assert.deepEqual(INSTRUMENTS.map((i) => i.item), ['guitar_acoustic', 'guitar_electric', 'keytar', 'drumpad']);
  INSTRUMENTS.forEach((i, idx) => assert.equal(i.code, idx));
});
t('songbook data validity', () => {
  assert.ok(SONGS.length >= 3);
  const okBeats = new Set([0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]);
  for (const s of SONGS) {
    assert.ok(s.id && s.title && s.bpm >= 60 && s.bpm <= 160, s.id);
    assert.ok(s.notes.length >= 20, s.id + ' too short');
    for (const [m, b] of s.notes) { assert.ok(Number.isInteger(m) && m >= 40 && m <= 92, s.id + ' note ' + m); assert.ok(okBeats.has(b), s.id + ' beat ' + b); }
    const [lo, hi] = songRange(s);
    assert.ok(hi - lo <= 24, s.id + ' range');
    assert.ok(songBeats(s) % 0.5 === 0, s.id + ' beats ' + songBeats(s));
    assert.ok(Array.isArray(s.chords) && s.chords.length > 0);
  }
  const ode = SONGS.find((s) => s.id === 'ode');
  assert.deepEqual(ode.notes.slice(0, 5).map((n) => noteName(n[0])), ['E4', 'E4', 'F4', 'G4', 'G4']);
  assert.equal(songBeats(ode), 64);
  const elise = SONGS.find((s) => s.id === 'elise');
  assert.deepEqual(elise.notes.slice(0, 9).map((n) => noteName(n[0])).join(' '), 'E5 D#5 E5 D#5 E5 B4 D5 C5 A4');
  assert.equal(new Set(SONGS.map((s) => s.id)).size, SONGS.length);
});
t('follow-along judging', () => {
  const s = SONGS[0];
  assert.deepEqual(judgeNote(s, 0, 64), { hit: true, perfect: true });
  assert.deepEqual(judgeNote(s, 0, 76), { hit: true, perfect: false });   // wrong octave still counts
  assert.equal(judgeNote(s, 0, 65).hit, false);
  assert.equal(judgeNote(s, 9999, 60).hit, false);
  assert.equal(accuracy(9, 1), 0.9); assert.equal(accuracy(0, 0), 0);
});
t('wire format sanitising', () => {
  assert.deepEqual(sanitizeEvent([2, 60, 100, 0]), [2, 60, 100, 0]);
  assert.deepEqual(sanitizeEvent([2, 60, 900, 0]), [2, 60, 127, 0]);           // velocity clamped
  assert.equal(sanitizeEvent([2, 5, 100, 0]), null);                            // note below the keytar range
  assert.equal(sanitizeEvent([9, 60, 100, 0]), null);                           // unknown instrument
  assert.equal(sanitizeEvent([0, 'x', 100, 0]), null);
  assert.equal(sanitizeEvent([0, 60.5, 100, 0]), null);
  assert.equal(sanitizeEvent(null), null); assert.equal(sanitizeEvent([1, 2]), null);
  assert.equal(sanitizeEvent([3, 8, 100, 0]), null); assert.deepEqual(sanitizeEvent([3, 7, 100, 3]), [3, 7, 100, 0]);
  assert.deepEqual(sanitizeEvent([0, encodeChord(9, 1, 0), 90, F_CHORD]), [0, encodeChord(9, 1, 0), 90, F_CHORD]);
  assert.equal(sanitizeEvent([2, encodeChord(9, 1, 0), 90, F_CHORD]), null);    // keytar has no chords
  assert.equal(sanitizeEvent([0, 9999, 90, F_CHORD]), null);
  assert.equal(sanitizeEvent([2, 60, 90, F_ALT | F_SUS])[3], F_ALT | F_SUS);
  assert.ok(MU_MAX_BATCH >= 8);
});
t('rate limiter: burst, sustained rate, refill', () => {
  const rl = createRateLimiter({ rate: 10, burst: 20 });
  let ok = 0;
  for (let i = 0; i < 40; i++) if (rl.allow(1000)) ok++;
  assert.equal(ok, 20);                                     // burst only
  assert.equal(rl.allow(1000), false);
  assert.equal(rl.allow(1100), true);                       // 0.1 s -> 1 token
  assert.equal(rl.allow(1100), false);
  ok = 0; for (let i = 0; i < 50; i++) if (rl.allow(3100)) ok++;   // 2 s idle refills 20 (capped by burst)
  assert.equal(ok, 20);
  // sustained flood at 100 Hz for 5 s passes ~ rate * 5 + burst
  const fl = createRateLimiter({ rate: 10, burst: 20 }); let n = 0;
  for (let i = 0; i < 500; i++) if (fl.allow(i * 10)) n++;
  assert.ok(n >= 65 && n <= 75, 'sustained ' + n);
});
t('jam session detector', () => {
  const now = 100000;
  const P = (id, x, dt = 500, n = 6) => ({ id, pos: [x, 0, 0], t: now - dt, n });
  assert.deepEqual(jamGroup([P('a', 0), P('b', 5)], now).sort(), ['a', 'b']);
  assert.deepEqual(jamGroup([P('a', 0), P('b', 12)], now), []);                       // too far apart
  assert.deepEqual(jamGroup([P('a', 0), P('b', 5, 9000)], now), []);                  // b stopped playing
  assert.deepEqual(jamGroup([P('a', 0), P('b', 5, 500, 1)], now), []);                // one stray note is not a jam
  assert.deepEqual(jamGroup([P('a', 0)], now), []);
  assert.deepEqual(jamGroup([P('a', 0), P('b', 7), P('c', 14), P('d', 60)], now).sort(), ['a', 'b', 'c']);   // chain a-b-c
  assert.deepEqual(jamGroup([{ id: 'a', pos: { x: 0, y: 0, z: 0 }, t: now, n: 5 }, { id: 'b', pos: { x: 3, y: 0, z: 4 }, t: now, n: 5 }], now).length, 2);
});

// ---- Karplus-Strong renderer
function estimateFreq(x, fs, f0) {
  // normalised autocorrelation around the expected period, parabolic interpolation on the peak
  const seg = x.subarray(Math.floor(fs * 0.08), Math.floor(fs * 0.08) + 8192);
  const lo = Math.floor(fs / f0 * 0.93), hi = Math.ceil(fs / f0 * 1.07);
  let best = -1, bl = lo; const ac = {};
  for (let lag = lo - 1; lag <= hi + 1; lag++) {
    let s = 0; for (let i = 0; i < seg.length - lag; i++) s += seg[i] * seg[i + lag];
    ac[lag] = s;
  }
  for (let lag = lo; lag <= hi; lag++) if (ac[lag] > best) { best = ac[lag]; bl = lag; }
  const a = ac[bl - 1], b = ac[bl], c = ac[bl + 1];
  const off = 0.5 * (a - c) / (a - 2 * b + c);
  return fs / (bl + off);
}
t('Karplus-Strong pitch accuracy (within 6 cents) at 44.1k and 48k', () => {
  for (const fs of [44100, 48000]) for (const midi of [40, 45, 52, 57, 64, 69, 76, 84]) for (const voice of ['ks', 'ksdist']) {
    const f0 = midiToFreq(midi);
    const x = renderKS({ fs, freq: f0, seed: midi, ...stringParams(voice, midi) });
    const f = estimateFreq(x, fs, f0);
    const cents = 1200 * Math.log2(f / f0);
    assert.ok(Math.abs(cents) < 6, `${voice} ${noteName(midi)} @${fs}: ${cents.toFixed(2)} cents`);
  }
});
t('Karplus-Strong: finite, bounded, decays, deterministic, fades to zero', () => {
  const p = { fs: 44100, freq: midiToFreq(52), dur: 2.5, t60: 2.5, seed: 7 };
  const a = renderKS(p), b = renderKS(p);
  let peak = 0, early = 0, late = 0;
  for (let i = 0; i < a.length; i++) { assert.ok(Number.isFinite(a[i])); peak = Math.max(peak, Math.abs(a[i])); assert.equal(a[i], b[i]); }
  assert.ok(peak <= 1.0001 && peak > 0.3, 'peak ' + peak);
  for (let i = 0; i < 4000; i++) { early += a[4000 + i] ** 2; late += a[44100 + 4000 + i] ** 2; }
  assert.ok(late < early * 0.7 && late > 0, 'decay');
  assert.ok(Math.abs(a[a.length - 1]) < 1e-3);
  const c = renderKS({ ...p, seed: 8 });
  assert.ok(a.some((v, i) => v !== c[i]), 'seed changes the pluck');
});
t('electric strings ring longer than acoustic; low notes longer than high', () => {
  const rms = (x, s, n) => { let e = 0; for (let i = 0; i < n; i++) e += x[s + i] ** 2; return Math.sqrt(e / n); };
  const ac = renderKS({ fs: 44100, freq: midiToFreq(52), seed: 1, ...stringParams('ks', 52) });
  const el = renderKS({ fs: 44100, freq: midiToFreq(52), seed: 1, ...stringParams('ksdist', 52) });
  assert.ok(rms(el, 44100 * 2, 4000) > rms(ac, 44100 * 2, 4000));
  assert.ok(stringParams('ks', 40).t60 > stringParams('ks', 80).t60);
});
t('distortion curve is odd, monotonic, bounded', () => {
  const c = distortionCurve(3.4, 513);
  assert.equal(c.length, 513);
  for (let i = 1; i < c.length; i++) assert.ok(c[i] >= c[i - 1] - 1e-9);
  assert.ok(Math.abs(c[0] + 1) < 1e-6 && Math.abs(c[512] - 1) < 1e-6 && Math.abs(c[256]) < 1e-6);
});

console.log(`\n${pass} tests passed` + (process.exitCode ? ' (with failures)' : ''));
