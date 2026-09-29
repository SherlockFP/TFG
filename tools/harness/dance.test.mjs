// dance node tests (wave 6): keyframes for every id, translations, loop continuity, mirror halves, sync phase maths, wheel layout, favourites, search,
// net ids, shop rows, music ids, rig posing.   node tools/harness/dance.test.mjs
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const DD = await import('../../src/game/dance_data.js');
const DA = await import('../../src/game/dance.js');
const { EMOTES, EMOTE_BY_ID, emoteNetId, emoteFromNet, isEmoteUnlocked, LOCKED_EMOTES } = await import('../../src/game/emotes.js');
const { setLang, t } = await import('../../src/core/i18n.js');
const C = await import('../../src/game/cosm5_data.js');
const { SFX } = await import('../../src/audio/sfxlib.js');
const { createAvatar } = await import('../../src/models/avatar.js');

// ---- 1. every dance has keyframes, names, descriptions, valid channels
ok(DD.DANCE_LIST.length >= 16, 'at least 16 new dances (got ' + DD.DANCE_LIST.length + ')');
ok(new Set(DD.DANCE_IDS).size === DD.DANCE_IDS.length, 'ids unique');
for (const d of DD.DANCE_LIST) {
  ok(Array.isArray(d.keys) && d.keys.length >= 2, d.id + ' has keyframes');
  ok(d.en && d.tr && d.ru, d.id + ' EN/TR/RU names');
  ok(DD.DESC[d.id]?.length === 3 && DD.DESC[d.id].every(Boolean), d.id + ' EN/TR/RU description');
  setLang('tr'); ok(t(d.en) === d.tr && t(DD.DESC[d.id][0]) === DD.DESC[d.id][1], d.id + ' TR registered');
  setLang('ru'); ok(t(d.en) === d.ru && t(DD.DESC[d.id][0]) === DD.DESC[d.id][2], d.id + ' RU registered');
  setLang('en');
  ok(EMOTE_BY_ID[d.id] && EMOTES.includes(EMOTE_BY_ID[d.id]), d.id + ' registered as emote');
  ok(DD.CAT_IDS.includes(d.cat), d.id + ' category');
  ok(!d.music || SFX[d.music], d.id + ' music exists: ' + d.music);
  ok(!d.music || SFX[d.music].loop, d.id + ' music loops');
  for (const k of d.keys) for (const c of Object.keys(k)) ok(c === 'b' || c === 'e' || c in DD.CH, d.id + ' unknown channel ' + c);
  DD.compile(d);
  ok(d.beats > 0 && d.bpm > 0, d.id + ' beats/bpm');
  const cyc = d.loop ? DD.cycleSeconds(d) : (d.dur || 3);
  let finite = true, range = true;
  for (let t2 = 0; t2 <= cyc * 2.2; t2 += 0.037) {
    const p = DD.samplePose(d, t2);
    for (const [c, v] of Object.entries(p)) { if (!Number.isFinite(v)) finite = false; if (c !== 'flash' && c !== 'yaw' && Math.abs(v) > 7) range = false; }
  }
  ok(finite, d.id + ' finite samples'); ok(range, d.id + ' channel range');
  if (d.loop) {   // seamless loop: pose at 0 == pose at one full cycle
    const a = DD.samplePose(d, 0.001), b = DD.samplePose(d, DD.cycleSeconds(d) + 0.001);
    let worst = 0;
    for (const c of Object.keys(a)) if (c !== 'flash' && c !== 'yaw' && !(d.glitch && (c === 'x' || c === 'z'))) worst = Math.max(worst, Math.abs(a[c] - b[c]));
    ok(worst < 0.02, d.id + ' loops seamlessly (delta ' + worst.toFixed(3) + ')');
    ok(Math.abs(Math.sin(a.yaw || 0) - Math.sin(b.yaw || 0)) < 0.02, d.id + ' yaw wraps');
  } else ok(d.dur > 1 && d.dur < 12, d.id + ' one-shot duration');
  const de = EMOTE_BY_ID[d.id];
  ok(de.loop === !!d.loop && (d.loop ? de.dur >= 30 : de.dur === d.dur), d.id + ' loop/dur flags');
  ok(d.src === 'free' ? !de.lock : !!de.lock, d.id + ' lock flag matches source');
  ok(String(de.name).length > 2, d.id + ' name getter');
}
ok(DD.DANCE_LIST.some((d) => d.loop) && DD.DANCE_LIST.some((d) => !d.loop), 'loops and one-shots');
for (const c of DD.CAT_IDS.slice(1)) ok(EMOTES.some((e) => DD.catOf(e.id) === c), 'category populated: ' + c);
for (const e of EMOTES) ok(DD.CAT_IDS.includes(DD.catOf(e.id)), 'every emote has a category: ' + e.id);

// ---- 2. mirror halves: sample at t and t + half cycle are mirror images
for (const d of DD.DANCE_LIST.filter((x) => x.half)) {
  const T = DD.cycleSeconds(d), t0 = T * 0.13, a = DD.samplePose(d, t0), b = DD.samplePose(d, t0 + T / 2);
  ok(Math.abs((a.x ?? 0) + (b.x ?? 0)) < 0.03 && Math.abs((a.Lz ?? 0) + (b.Rz ?? 0)) < 1e-6 && Math.abs((a.Hl ?? 0) - (b.Hr ?? 0)) < 1e-6, d.id + ' second half mirrors first');
}

// ---- 3. sync phase maths
const sd = DD.DANCE_BY_ID.office_shuffle;
const D3 = [
  { id: 'a', x: 0, y: 0, z: 0, dance: sd.id, start: 10000 },
  { id: 'b', x: 2, y: 0, z: 0, dance: sd.id, start: 10500 },
  { id: 'c', x: 4.5, y: 0, z: 0, dance: sd.id, start: 10200 },           // 2.5 m from b: chained into the cluster
  { id: 'd', x: 1, y: 0, z: 0, dance: 'firewall', start: 9000 },          // other dance: no cluster
  { id: 'e', x: 30, y: 0, z: 0, dance: sd.id, start: 9000 },              // far away
];
const cl = DD.clusterDancers(D3);
ok(cl.size === 3 && cl.has('a') && cl.has('b') && cl.has('c') && !cl.has('d') && !cl.has('e'), 'cluster membership (chain within 3 m, same dance only)');
ok(cl.get('a').anchorId === 'a' && cl.get('a').offset === 0 && Math.abs(cl.get('b').offset - 0.5) < 1e-9 && Math.abs(cl.get('c').offset - 0.2) < 1e-9, 'anchor = earliest starter, offsets in seconds');
ok(cl.get('b').size === 3, 'cluster size');
const now = 20000;
const own = (id) => (now - D3.find((x) => x.id === id).start) / 1000;
for (const id of ['b', 'c']) ok(DD.phaseError(sd, own('a'), 0, own(id), cl.get(id).offset) < 1e-9, 'phase locked to anchor: ' + id);
ok(DD.phaseError(sd, own('a'), 0, own('b'), 0) > 0.01, 'without sync they would be out of phase');
ok(DD.clusterDancers([D3[0]]).size === 0, 'a lone dancer is never a cluster');
const wide = DD.clusterDancers([{ id: 'p', x: 0, y: 0, z: 0, dance: 'sync_dance', start: 1 }, { id: 'q', x: 4.5, y: 0, z: 0, dance: 'sync_dance', start: 2 }]);
ok(wide.size === 2, 'Sync Dance has a wider radius (5 m)');
ok(Math.abs(DD.approach(0, 1, 0.1, 1.2) - 0.12) < 1e-9 && DD.approach(0.99, 1, 0.1, 1.2) === 1 && Math.abs(DD.approach(1, 0, 0.5, 1.2) - 0.4) < 1e-9, 'approach eases the catch-up');
ok(DD.comboHype(1) === 0 && DD.comboHype(2) === 1 && DD.comboHype(9) === 5, 'combo hype');
const p0 = DD.phaseAt(sd, 0), p1 = DD.phaseAt(sd, DD.cycleSeconds(sd) * 3 + 0.1);
ok(p0 === 0 && p1 > 0 && p1 < 0.1, 'phaseAt wraps');

// ---- 4. wheel layout
for (const n of [1, 2, 3, 5, 8]) for (let i = 0; i < n; i++) {
  const p = DD.slotPos(i, n, 100);
  ok(DD.slotAt(p.x, p.y, n) === i, `slotAt round trip n=${n} i=${i}`);
}
ok(DD.slotAt(3, 3, 8) === -1, 'dead zone');
ok(DD.slotAt(0, -100, 8) === 0 && DD.slotAt(100, 0, 8) === 2 && DD.slotAt(0, 100, 8) === 4 && DD.slotAt(-100, 0, 8) === 6, 'slot 0 is at the top, clockwise');
const allIds = EMOTES.map((e) => e.id);
const favs = DD.normFavs(null, (id) => allIds.includes(id));
ok(favs.length === DD.SLOTS, 'favourites always SLOTS entries');
const pages = DD.buildPages(allIds, favs);
ok(pages[0].cat === 'fav' && pages[0].ids.length === DD.SLOTS, 'first page = favourites');
ok(pages.every((p) => p.ids.length <= DD.SLOTS && p.ids.length > 0), 'no page exceeds 8 slots');
const flat = pages.slice(1).flatMap((p) => p.ids);
ok(flat.length === allIds.length && new Set(flat).size === allIds.length, 'every emote on exactly one category page');
const dp = pages.filter((p) => p.cat === 'dance');
ok(dp.length >= 2, 'dance category splits into pages');
ok(Math.max(...dp.map((p) => p.ids.length)) - Math.min(...dp.map((p) => p.ids.length)) <= 1, 'pages are even');
ok(DD.pageStep(0, -1, 5) === 4 && DD.pageStep(4, 1, 5) === 0, 'page wrap');
let f2 = DD.setFav(favs, 'worm', 2); ok(f2[2] === 'worm' && f2.filter((x) => x === 'worm').length === 1, 'setFav');
f2 = DD.setFav(f2, 'worm', 5); ok(f2[5] === 'worm' && f2.filter((x) => x === 'worm').length === 1 && f2[2] !== 'worm', 'setFav moves an existing favourite');
f2 = DD.toggleFav(f2, 'worm'); ok(!f2.includes('worm'), 'toggleFav removes');
const empt = DD.normFavs([null, null, null, null, null, null, null, null]); f2 = DD.toggleFav(empt, 'dance'); ok(f2[0] === 'dance', 'toggleFav fills the first empty slot');
ok(DD.normFavs(['dance', 'dance', 'nope'], (id) => id === 'dance')[1] === null, 'normFavs drops duplicates / unknown ids');
const named = EMOTES.map((e) => ({ id: e.id, name: e.name }));
ok(DD.searchEmotes(named, 'shuffle').some((e) => e.id === 'office_shuffle'), 'search by name');
ok(DD.searchEmotes(named, 'robot spread').length === 1, 'search: all terms must match');
ok(DD.searchEmotes(named, 'signal').some((e) => e.id === 'follow_me'), 'search by category');
ok(DD.searchEmotes(named, 'zzzz').length === 0 && DD.searchEmotes(named, '').length === named.length, 'search empty / no match');
ok(DD.searchEmotes([{ id: 'x', name: 'İşten Çıkarma' }], 'isten cikarma').length === 1, 'search folds Turkish diacritics');

// ---- 5. network ids degrade gracefully
for (const d of DD.DANCE_LIST) { const e = EMOTE_BY_ID[d.id]; ok(emoteNetId(e) === 'x:' + d.id && emoteFromNet('x:' + d.id) === e, d.id + ' net id round trip'); ok(emoteNetId(e).length <= 24, d.id + ' short net id'); }
ok(emoteFromNet('x:not_a_dance') === null && emoteFromNet(null) === null && emoteFromNet('') === null, 'unknown ids resolve to null (old clients show nothing)');

// ---- 6. shop / crate rows + unlocks
const rows = DD.shopRows();
ok(rows.length >= 6, 'some dances are shop / crate items (' + rows.length + ')');
for (const r of rows) { ok(C.C5_BY_KEY['emote:' + r.id], r.id + ' row in cosm5'); ok(LOCKED_EMOTES.includes(r.id), r.id + ' locked until owned'); ok(!isEmoteUnlocked({ emotes: [] }, r.id) && isEmoteUnlocked({ emotes: [r.id] }, r.id), r.id + ' unlock via profile.emotes'); }
ok(C.cosmeticPool('rare', { slot: 'emote' }).some((x) => x.id === 'worm'), 'worm is in the rare emote crate pool');
ok(C.C5.filter((e) => e.slot === 'emote' && e.src === 'shop').length >= 5, 'emote shop rotation has candidates');
ok(isEmoteUnlocked({}, 'office_shuffle') && isEmoteUnlocked({}, 'thumbs_up'), 'most dances are free');
ok(rows.length < DD.DANCE_LIST.length / 2 + 1, 'paid dances are the minority');

// ---- 7. rig posing (real avatar): no NaN, arms move, blend in / out
const av = createAvatar({ suitColor: 0xff8800, hat: 'none' });
ok(!!av.limbs && !!av.limbs.hipL && !!av.limbs.shR, 'avatar2 exposes limbs');
const reset = (emote = null, time = 1) => { av.root.position.set(0, 0, 0); av.root.rotation.set(0, 0, 0); av.update(0.05, { speed: 0, grounded: true, emote, lookPitch: 0, time }); };
for (const d of DD.DANCE_LIST) {
  const def = EMOTE_BY_ID[d.id];
  let good = true;
  for (const tt of [0.05, 0.4, 1.3, 2.9]) {
    reset(def.base, tt); av.root.rotation.y = 0.7;
    DA.applyDance(av, av.root, d, tt, def.dur);
    const vals = [av.root.position.x, av.root.position.y, av.root.position.z, av.root.rotation.x, av.root.rotation.y, av.limbs.shL.rotation.z, av.limbs.shR.rotation.x, av.parts.torso.rotation.x, av.parts.neck.rotation.y];
    if (vals.some((v) => !Number.isFinite(v))) good = false;
  }
  ok(good, d.id + ' poses the rig without NaN');
}
{
  const d = DD.DANCE_BY_ID.need_help, def = EMOTE_BY_ID.need_help;
  reset(); const idle = av.limbs.shL.rotation.z;
  DA.applyDance(av, av.root, d, 0, def.dur); ok(Math.abs(av.limbs.shL.rotation.z - idle) < 1e-6, 'weight 0 at t=0 keeps the idle pose');
  reset(); DA.applyDance(av, av.root, d, 1.5, def.dur); ok(av.limbs.shL.rotation.z > 2, 'Send Help raises the arms overhead');
  reset(); DA.applyDance(av, av.root, d, def.dur, def.dur); ok(Math.abs(av.limbs.shL.rotation.z - idle) < 1e-6, 'one-shot fades back to idle at its end');
}
{
  reset(); DA.applyDance(av, av.root, DD.DANCE_BY_ID.layoff_flop, 3.0, 5); ok(av.root.rotation.x < -1.2, 'Layoff Flop falls backwards');
  reset(); DA.applyDance(av, av.root, DD.DANCE_BY_ID.worm, 1.0, 45); ok(av.root.rotation.x > 1.2, 'Worm goes face down');
  const d = DD.DANCE_BY_ID.office_shuffle, def = EMOTE_BY_ID.office_shuffle;
  const pose = (tt) => { reset(); DA.applyDance(av, av.root, d, tt, def.dur); return av.root.position.x; };
  ok(Math.abs(pose(2.0) - pose(2.0 + DD.cycleSeconds(d))) < 1e-6, 'full cycle later = same pose');
}
if (bad) { console.log('dance test: ' + bad + ' FAILED'); process.exit(1); }
console.log('dance test: all passed (' + DD.DANCE_LIST.length + ' dances)');
