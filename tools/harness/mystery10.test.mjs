// [mystery10] node test: fragment selection determinism, per-profile persistence + repair, milestone triggers (4 / 8 / 12), text tables (EN/TR/RU), wardrobe row.
// Run: node tools/harness/mystery10.test.mjs
import assert from 'node:assert/strict';
import * as C from '../../src/game/mystery10_core.js';
import { TEXT, x } from '../../src/game/mystery10_text.js';
import { terminalText } from '../../src/game/mystery10_ui.js';
import { tIn, hasTranslation } from '../../src/core/i18n.js';
import { C5_BY_KEY } from '../../src/game/cosm5_data.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// ---- selection: deterministic, rare, ordered, never a collected one, never two
const base = { runId: 'r1', moonId: 'hamsi', seed: 4242, collected: new Set(), dry: 0 };
eq(C.pickFragment(base), C.pickFragment({ ...base }), 'same inputs -> same fragment (every peer / reload agrees)');
const outdoor = (rng) => { const px = rng.float(-110, 110), pz = rng.float(-110, 110); return { x: px, y: 1, z: pz }; };
const facility = Array.from({ length: 40 }, (_, i) => ({ x: (i % 8) * 7, y: 0, z: Math.floor(i / 8) * 7, room: i, dist: i, type: 'office', sealed: i % 9 === 0 }));
const plan = (o) => C.planLanding({ runId: 'r1', moonId: 'hamsi', seed: 1, collected: new Set(), dry: 0, outdoor, facility, ...o });
eq(plan({ seed: 77, dry: 9 }), plan({ seed: 77, dry: 9 }), 'the whole plan is deterministic');
let hits = 0, tier0 = 0; const seen = new Set();
const N = 2000;
for (let s = 1; s <= N; s++) {
  const id = C.pickFragment({ ...base, seed: s * 7919 });
  if (id) { hits++; seen.add(id); if (C.tierOf(id) === 0) tier0++; ok(C.BY_ID[id], 'a real id'); }
}
ok(hits / N > 0.3 && hits / N < 0.5, `about 0.4 of landings carry one at dry 0 (${(hits / N).toFixed(2)})`);
ok(tier0 / hits > 0.7, 'a fresh profile is served the first tier (25 % may skip ahead)');
ok([...seen].every((id) => C.tierOf(id) <= 1), 'tier 3 never leaks to a fresh profile');
ok(C.chanceFor(3) > C.chanceFor(0) && C.chanceFor(99) <= C.CHANCE.max, 'dry landings raise the chance, capped');
const have = new Set(C.IDS.slice(0, 4));
for (let s = 1; s <= 300; s++) { const id = C.pickFragment({ ...base, seed: s, collected: have, dry: 9 }); ok(!id || !have.has(id), 'never re-serves a collected fragment'); }
eq(C.pickFragment({ ...base, collected: new Set(C.IDS), dry: 9 }), null, 'all twelve collected -> nothing more lies around');
// spots: facility weighted deep, exclusions, outdoor far from the ship, room only when due and outdoors
let deep = 0, inCount = 0;
for (let s = 1; s <= 400; s++) {
  const p = plan({ seed: s, dry: 9, collected: new Set(['f01', 'f02', 'f03', 'f04']) });
  if (p.frag) {
    ok([p.frag.x, p.frag.y, p.frag.z, p.frag.yaw].every(Number.isFinite), 'finite spot');
    if (p.frag.where === 'in') { inCount++; const sp = facility.find((q) => q.x === p.frag.x && q.z === p.frag.z); ok(sp && !sp.sealed, 'never a sealed room'); if (sp.dist >= 20) deep++; }
    else ok(Math.hypot(p.frag.x, p.frag.z) >= 32, 'outdoor spot is away from the ship');
  }
  ok(!p.room, 'no room unless it is due');
}
ok(inCount > 20 && deep / inCount > 0.55, `deeper facility rooms are favoured (${(deep / inCount).toFixed(2)})`);
const rp = plan({ seed: 5, room: true });
ok(rp.room && Math.hypot(rp.room.x, rp.room.z) >= 45 && Number.isFinite(rp.room.yaw), 'the room is placed far out when due');
eq(plan({ seed: 5, room: true, outdoor: null }).room, null, 'no outdoor sampler -> no room, no crash');
eq(C.planLanding({ runId: 'r', moonId: 'm', seed: 3, dry: 9, facility: null, outdoor: () => null }), { frag: null, room: null }, 'unplaceable -> nothing');

// ---- persistence + milestones
const prof = { name: 'a' };
eq(C.count(prof), 0, 'fresh profile');
const fired = [];
for (let i = 0; i < 12; i++) {
  const r = C.collect(prof, C.IDS[i], 1700000000000 + i);
  ok(r.isNew && r.count === i + 1, 'counted');
  if (r.reached.length) fired.push([i + 1, ...r.reached]);
  eq(C.collect(prof, C.IDS[i]).isNew, false, 'collecting twice is a no-op');
}
eq(fired, [[4, 4], [8, 8], [12, 12]], 'milestones fire exactly once each, at 4 / 8 / 12');
ok(C.hasPending(prof, '4') && C.hasPending(prof, 'e'), 'terminal glitch + ending are queued for orbit');
ok(C.roomDue(prof), 'the room is due after 8');
ok(C.takePending(prof, '4') && !C.takePending(prof, '4'), 'a queued effect runs once');
ok(C.takePending(prof, 'e') && C.ensure(prof).ending === 1 && !C.hasPending(prof, 'e'), 'ending consumed');
const back = JSON.parse(JSON.stringify(prof));
eq(C.count(back), 12, 'survives a save / load round trip');
ok(!C.collect(back, 'f01').isNew, 'still idempotent after reload');
const bad = { mystery: { frags: { f01: 5, zzz: 9, f02: -3 }, m: { 4: 1, 8: 1, 12: 1 }, pend: { e: 1 }, ending: 1, dry: 99, room: 1 } };
C.ensure(bad);
eq(Object.keys(bad.mystery.frags), ['f01'], 'unknown / invalid fragments are dropped');
ok(!bad.mystery.m[4] && !bad.mystery.m[8] && !bad.mystery.ending, 'milestones cannot be claimed without the fragments');
ok(bad.mystery.dry <= 9, 'dry counter clamped');
eq(C.ensure({ mystery: 'x' }).frags, {}, 'garbage is replaced');
const late = { mystery: { m: { 4: 1 }, frags: Object.fromEntries(C.IDS.slice(0, 7).map((id) => [id, 1])) } };
const r8 = C.collect(late, 'f08');
eq(r8.reached, [8], 'a joiner with 7 crosses 8 on the next shared pickup');
ok(!C.roomDue({ mystery: { frags: {}, room: 1, roomDone: 1 } }), 'a claimed room is done');
ok(C.sealedOpen(C.BY_ID.f06, 10) && !C.sealedOpen(C.BY_ID.f06, 9) && C.sealedOpen(C.BY_ID.f01, 0), 'sealed lines open at their threshold');

// ---- text: every fragment has header + body in EN / TR / RU, sealed lines exist, wardrobe row matches
for (const f of C.FRAGMENTS) {
  for (const k of [f.id + '.h', f.id + '.b']) {
    const v = TEXT[k]; ok(v && v[0] && v[1] && v[2], 'text ' + k);
    ok(v[1] !== v[0] && v[2] !== v[0], 'translated ' + k);
    ok(hasTranslation('tr', v[0]) && hasTranslation('ru', v[0]), 'registered ' + k);
    ok(tIn('tr', v[0]) === v[1] && tIn('ru', v[0]) === v[2], 'lookup ' + k);
  }
  if (f.sealAt) ok(TEXT[f.id + '.s'], 'sealed line ' + f.id);
  ok(TEXT['k.' + f.kind], 'kind label ' + f.kind);
}
for (const [k, v] of Object.entries(TEXT)) { ok(Array.isArray(v) && v.length === 3 && v.every((s) => typeof s === 'string' && s.length), 'complete row ' + k); ok(!/[\u{1F300}-\u{1FAFF}]/u.test(v.join('')), 'no emoji ' + k); }
const row = C.COSM[0];
ok(TEXT['cosm.name'][0] === row.name && TEXT['cosm.desc'][0] === row.desc && TEXT['cosm.how'][0] === row.how, 'wardrobe row strings are translated keys');
ok(C5_BY_KEY[C.HAT_KEY]?.src === 'secret', 'the hat is in the cosm5 catalogue');
ok(x('ui.title') === 'THE FIRST UPLOAD', 'x() reads EN by default');
const t1 = terminalText(prof, '');
ok(t1.includes('12/12') && !t1.includes('?'), 'terminal list shows all twelve');
ok(terminalText(prof, '4').includes('RETENTION') && terminalText({}, '4') === x('term.bad') && terminalText(prof, '99') === x('term.bad'), 'terminal reads one / rejects unknown or unrecovered');
console.log(`mystery10.test: ${n} checks OK`);
