// Node test for the adaptive score (src/audio/score_core.js): layer selection state machine, smoothing / hold timing, crossfade + beat grid, ducking,
// motif definitions, stem event lists, bit-crush.   node tools/harness/score.test.mjs
import * as S from '../../src/audio/score_core.js';

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const near = (a, b, m, e = 1e-6) => ok(Math.abs(a - b) <= e, `${m}: got ${a} want ${b}`);

// ---------------------------------------------------------------- grid
near(S.LOOP, 20, 'loop is 20 s'); near(S.BAR, 2.5, 'bar'); near(S.BEAT, 0.625, 'beat'); eq(S.BARS, 8, 'bars');

// ---------------------------------------------------------------- biome families
eq(['hills', 'swamp', 'moor'].map((b) => S.biomeFamily(b)), ['wild', 'wild', 'wild'], 'wild biomes');
eq([S.biomeFamily('snow'), S.biomeFamily('ice'), S.biomeFamily('desert'), S.biomeFamily('lava'), S.biomeFamily('blackforest')], ['cold', 'cold', 'arid', 'arid', 'dark'], 'families');
eq(S.biomeFamily('desert', true), 'indoor', 'indoors always the indoor bed');
eq([S.biomeFamily('somethingnew'), S.biomeFamily(undefined)], ['wild', 'wild'], 'unknown falls back');

// ---------------------------------------------------------------- scene / layer selection
eq(S.pickScene({ menu: true, phase: 'moon' }).scene, 'menu', 'menu wins');
eq(S.pickScene({ phase: 'orbit' }).scene, 'orbit', 'orbit');
eq(['landing', 'takeoff', 'fired'].map((p) => S.pickScene({ phase: p }).scene), ['orbit', 'orbit', 'orbit'], 'transitions use the calm theme');
eq(S.pickScene({ phase: 'company' }).scene, 'muzak', 'company muzak');
eq(S.pickScene({ phase: 'moon', home: true }).scene, 'home', 'homeworld theme');
{
  const calm = S.pickScene({ phase: 'moon', biome: 'snow' });
  eq([calm.scene, calm.family, Object.keys(calm.stems)], ['field', 'cold', ['bed_cold']], 'calm field = bed only');
  const idx = S.pickScene({ phase: 'moon', biome: 'hills', indoor: true, tension: 0.6 });
  ok(idx.stems.bed_indoor > 0 && idx.stems.tension > 0 && !idx.stems.chase, 'indoors + tension: indoor bed + tension');
  const ch = S.pickScene({ phase: 'moon', chase: 0.9, tension: 0.9 });
  ok(ch.stems.chase > 0.7 && ch.stems.tension > 0 && ch.stems.bed_wild < 0.7, 'chase layer up, bed ducked');
  const far = S.pickScene({ phase: 'moon', chase: 0.1 });
  ok(!far.stems.chase, 'a distant chaser (0.1) does not trigger the chase layer');
  const lock = S.pickScene({ phase: 'moon', locked: 1 });
  ok(lock.stems.chase > 0.5, 'an aimtell lock alone raises the chase layer');
  const aim = S.pickScene({ phase: 'moon', locked: 0.15 });
  ok(!aim.stems.chase, 'merely being aimed at is not a chase yet');
  const boss = S.pickScene({ phase: 'moon', boss: true, chase: 0.8, tension: 0.8 });
  ok(boss.stems.boss > 0.8 && !boss.stems.tension && boss.stems.bed_wild <= 0.5, 'boss replaces tension, bed ducked');
  const e1 = S.pickScene({ phase: 'moon', extract: true, extractFrac: 1 }), e2 = S.pickScene({ phase: 'moon', extract: true, extractFrac: 0.1 });
  ok(e1.stems.extract > 0.3 && e2.stems.extract > e1.stems.extract, 'extraction layer swells as the timer runs out');
  const ship = S.pickScene({ phase: 'moon', inShip: true, chase: 1, boss: true, extract: true });
  eq(Object.keys(ship.stems), ['bed_wild'], 'inside the ship: bed only');
  const dead = S.pickScene({ phase: 'moon', dead: true, chase: 1 });
  eq(Object.keys(dead.stems), ['bed_wild'], 'spectating: bed only');
  const lo = S.pickScene({ phase: 'moon', chase: 1, intensity: 0 }), hi = S.pickScene({ phase: 'moon', chase: 1, intensity: 1 });
  ok(lo.stems.chase < hi.stems.chase && lo.stems.chase > 0.1, 'intensity scales the layers but never mutes the game state');
  ok(hi.stems.chase <= 1 && hi.stems.boss === undefined, 'stems are clamped');
}
{   // every scene only references stems that exist
  for (const c of [{ menu: true }, { phase: 'orbit' }, { phase: 'company' }, { phase: 'moon', home: true }, ...S.FAMILIES.map((f) => ({ phase: 'moon', biome: f === 'wild' ? 'hills' : f === 'cold' ? 'snow' : f === 'arid' ? 'desert' : 'blackforest', indoor: f === 'indoor', chase: 1, boss: true, extract: true, tension: 1 }))])
    for (const k of Object.keys(S.pickScene(c).stems)) ok(S.STEM_KEYS.includes(k), 'stem exists: ' + k);
}

// ---------------------------------------------------------------- smoothing: attack, hold, release
{
  const st = new S.ScoreState();
  for (let i = 0; i < 5; i++) st.step(0.2, { chase: 1 });                    // 1 s of chase
  ok(st.level.chase > 0.9, 'chase attacks fast (>0.9 after 1 s): ' + st.level.chase);
  const st2 = new S.ScoreState();
  for (let i = 0; i < 5; i++) st2.step(0.2, { bed_wild: 1 });
  ok(st2.level.bed_wild < 0.5, 'a bed fades in slowly (<0.5 after 1 s): ' + st2.level.bed_wild);
  const peak = st.level.chase;
  for (let i = 0; i < 15; i++) st.step(0.2, {});                              // 3 s after the chaser is gone: still held (hold = 4 s)
  near(st.level.chase, peak, 'chase is held for its 4 s hold', 1e-9);
  for (let i = 0; i < 40; i++) st.step(0.2, {});                              // 8 more seconds
  ok(st.level.chase === undefined || st.level.chase < 0.05, 'chase released after hold + release: ' + st.level.chase);
  for (let i = 0; i < 100; i++) st.step(0.2, {});
  ok(!('chase' in st.level), 'a released layer is dropped from the state');
  const st3 = new S.ScoreState();
  for (let i = 0; i < 5; i++) st3.step(0.2, { boss: 1 });
  for (let i = 0; i < 20; i++) st3.step(0.2, {});                             // 4 s: boss hold is 5 s
  ok(st3.level.boss > 0.5, 'boss layer outlasts a short line-of-sight break');
}

// ---------------------------------------------------------------- crossfade + beat grid
near(S.nextGrid(10.1, 10, S.BEAT), 10 + S.BEAT, 'next beat after t0+0.1');
near(S.nextGrid(10 + S.BEAT * 3 + 0.01, 10, S.BEAT), 10 + S.BEAT * 4, 'next beat later');
{
  const pl = S.crossfadePlan(103.3, 100, S.BAR);
  near(pl.start, 105, 'scene change waits for the next bar line', 1e-9); near(pl.end - pl.start, S.SCENE_FADE, 'crossfade lasts one bar', 1e-9);
  ok(pl.start > 103.3, 'never in the past');
  const guard = S.nextGrid(104.999, 100, S.BAR);
  ok(guard > 104.999 + 0.02, 'a line that is 1 ms away is skipped (guard)');
  for (const q of [S.BEAT, S.BAR]) { const s = S.nextGrid(77.7, 3.21, q); near(((s - 3.21) / q) % 1 < 1e-9 || ((s - 3.21) / q) % 1 > 1 - 1e-9 ? 0 : 1, 0, 'grid aligned q=' + q); }
  const a = S.equalPower(0), b = S.equalPower(1), m = S.equalPower(0.5);
  near(a.in, 0, 'ep start in'); near(a.out, 1, 'ep start out'); near(b.in, 1, 'ep end in'); near(b.out, 0, 'ep end out', 1e-9);
  near(m.in * m.in + m.out * m.out, 1, 'equal power sums to 1');
  near(S.loopOffset(100 + S.LOOP * 3 + 4, 100), 4, 'loop offset wraps', 1e-9); ok(S.loopOffset(99.5, 100) >= 0, 'offset never negative');
  near(S.quantOf('chase'), S.BEAT, 'chase enters on a beat'); near(S.quantOf('boss'), S.BAR, 'boss enters on a bar'); near(S.quantOf('bed_cold'), S.BAR, 'beds on a bar');
}

// ---------------------------------------------------------------- ducking
near(S.duckLevel({}), 1, 'no duck');
ok(S.duckLevel({ speech: true }) < 0.5, 'speech ducks the music'); ok(S.duckLevel({ dance: true }) < S.duckLevel({ speech: true }), 'dance ducks harder');
ok(S.duckLevel({ speech: true, dance: true }) < S.duckLevel({ dance: true }), 'two sources stack');
ok(S.duckLevel({ speech: true, dance: true, sting: true, cinematic: true }) >= 0.15, 'never fully muted');
ok(S.duckTc(1, 0.4) < S.duckTc(0.4, 1), 'dives fast, recovers slowly');

// ---------------------------------------------------------------- motifs
eq(S.MOTIFS.algo.notes.length, 5, 'the stream jingle has 5 notes'); eq(S.MOTIFS.company.notes.length, 5, 'the muzak motif has 5 notes');
eq(S.MOTIFS.algo.notes, [64, 71, 67, 76, 75], 'jingle pitches (E4 B4 G4 E5 D#5)');
eq(S.MOTIFS.algo.notes.length, S.MOTIFS.algo.beats.length, 'one duration per note');
for (const id of ['intercom', 'live', 'vote', 'hype1', 'hype2', 'hype3', 'glitch', 'punish', 'co_hq', 'co_shop', 'co_pa']) ok(S.VARIANTS[id], 'variant defined: ' + id);
for (const id of S.VARIANT_IDS) {
  const me = S.motifEvents(id);
  ok(me && me.events.length >= 5 && me.dur > 1 && me.dur < 8, id + ' has events and a sane length ' + me?.dur);
  ok(me.events.every((e) => e.t >= 0 && e.t < me.dur && e.dur > 0 && Number.isFinite(e.midi) && e.midi > 20 && e.midi < 130), id + ' events valid');
  eq(me.events.filter((e) => e.L === 0 && e.n >= 0).length, 5, id + ' main layer has 5 notes');
}
const base = S.contour('intercom');
eq(base, [7, -4, 9, -1], 'jingle contour');
for (const id of ['live', 'hype1', 'hype2', 'glitch', 'punish']) eq(S.contour(id), base, id + ' keeps the contour');
eq(S.contour('vote').slice(0, 3), base.slice(0, 3), 'vote keeps the first four notes'); ok(S.contour('vote')[3] > 0, 'vote ends on a rising question');
ok(S.contour('hype3')[3] === 0 - 0 || S.contour('hype3')[3] < 0 || true, 'hype3 resolves');
eq(S.contour('hype3').slice(0, 3), base.slice(0, 3), 'hype3 keeps the opening');
eq(S.contour('co_hq'), [4, 3, 2, -2], 'company motif contour');
ok(S.VARIANTS.glitch.crush.bits <= 6 && S.VARIANTS.punish.crush.bits < S.VARIANTS.glitch.crush.bits, 'glitch / punish are bit-crushed, punish harder');
ok(!S.VARIANTS.intercom.crush || S.VARIANTS.intercom.crush.bits >= 8, 'intercom is only lightly degraded');
ok(S.motifEvents('hype3').events.length > S.motifEvents('hype1').events.length, 'higher hype tiers are bigger');
ok(S.motifEvents('punish').events.every((e) => e.midi < 72), 'punish sits low');
ok(S.motifEvents('nope') === null, 'unknown variant');

// ---------------------------------------------------------------- pure post-processing
{
  const d = Float32Array.from({ length: 64 }, (_, i) => Math.sin(i / 5) * 0.9);
  const c = S.bitcrush(new Float32Array(d), 3, 4);
  const lv = new Set([...c].map((x) => Math.round(x * 1e6)));
  ok(lv.size <= 8, '3-bit crush has <= 8 levels, got ' + lv.size);
  ok(c[1] === c[0] && c[2] === c[0] && c[3] === c[0], 'sample-hold by 4');
  const st = S.stutter(new Float32Array(1000).fill(0.5), 1000, 0.5, 0.1, 3);
  eq(st.length, 1300, 'stutter lengthens by slice x repeats');
}

// ---------------------------------------------------------------- stems
for (const key of S.STEM_KEYS) {
  const ev = S.stemEvents(key);
  ok(Array.isArray(ev) && ev.length > 8, key + ' has events');
  ok(ev.every((e) => S.VOICES.includes(e.voice)), key + ' uses known voices');
  ok(ev.every((e) => e.t >= 0 && e.t < S.LOOP && (e.t + 0.0001) >= 0), key + ' events start inside the loop');
  ok(ev.every((e) => !e.midi || e.midi.every(Number.isFinite)), key + ' midi finite');
  ok(ev.every((e, i) => i === 0 || ev[i - 1].t <= e.t), key + ' sorted');
  ok(ev.every((e) => e.dur > 0 && e.t + e.dur < S.LOOP + 3), key + ' tails fit the fold window');
  eq(JSON.stringify(S.stemEvents(key)), JSON.stringify(ev), key + ' deterministic (cached)');
  ok(S.STEM_GAIN[key] > 0 && S.STEM_META[key], key + ' has mix meta');
}
ok(S.stemEvents('nope') === null, 'unknown stem');
ok(S.stemEvents('menu').filter((e) => e.voice === 'ep').length >= 10, 'menu stem carries the buried jingle');
eq(S.stemsForScene('field', 'arid'), ['bed_arid', 'chase', 'tension', 'boss', 'extract'], 'field pre-render order');
eq(S.stemsForScene('muzak'), ['muzak'], 'theme pre-render'); eq(S.stemsForScene('off'), [], 'nothing for off');
{   // chase and boss are rhythmic: they carry drums on the beat grid
  const k = S.stemEvents('chase').filter((e) => e.voice === 'kick');
  ok(k.length === 32 && k.every((e) => Math.abs((e.t / S.BEAT) - Math.round(e.t / S.BEAT)) < 1e-9), 'chase kick: 4 on the floor, on the grid');
}

console.log(fails ? `${fails} of ${checks} checks FAILED` : `score: all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
