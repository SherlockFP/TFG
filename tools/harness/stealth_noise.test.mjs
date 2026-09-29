// STEALTH wave 4 - noise rules test (pure node):  node tools/harness/stealth_noise.test.mjs
//  * loudness table: sneak << crouch << walk << sprint, surfaces (metal loud, carpet quiet), landing / item impact
//  * propagation over a REAL facility nav grid: walls attenuate, closed doors attenuate, open air does not, cap of MAX_WALLS
//  * client batcher: rate limit, duplicate merge, compact ints; host sanitizer + token bucket
import { generateLayout } from '../../src/world/facility.js';
import { NavGrid } from '../../src/world/nav.js';
import * as S from '../../src/game/stealth_core.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---- loudness
const w = S.stepLoudness({}, 'concrete'), sp = S.stepLoudness({ sprint: true }, 'concrete'), cr = S.stepLoudness({ crouch: true }, 'concrete'), sn = S.stepLoudness({ sneak: true }, 'concrete');
ok(sn < cr && cr < w && w < sp, 'order sneak < crouch < walk < sprint');
ok(sn <= 0.03 && sn > 0, 'sneak is near-zero but not literally zero');
ok(S.stepLoudness({}, 'metal') > w * 1.4, 'metal grate louder than concrete');
ok(S.stepLoudness({}, 'carpet') < w * 0.7, 'carpet quieter');
ok(S.stepLoudness({ sneak: true, wading: true }, 'water') > sn * 3, 'wading is loud even when sneaking');
ok(S.stepLoudness({}, 'concrete', 0.5) < w, 'lightfoot perk halves it');
ok(S.landLoudness(20) === 1 && S.landLoudness(1) === S.NOISE.landMin, 'landing clamps');
ok(S.itemImpactLoudness(10, true) > S.itemImpactLoudness(10, false), 'glass is louder');
ok(S.bandOf(0.02) === 'SILENT' && S.bandOf(0.3) === 'STEADY' && S.bandOf(0.7) === 'LOUD', 'bands');
// what a hearing radius means (Listener 22 m): walking 6.6 m, sprinting 15.4 m, sneaking < 0.5 m
ok(near(S.radiusOf(w, 22), 6.6) && S.radiusOf(sp, 22) > 15 && S.radiusOf(sn, 22) < 0.5, 'listener radii');

// ---- propagation over real layouts
let cases = 0, atten = 0, openOk = 0, doorOk = 0, multi = 0;
for (let seed = 1; seed <= 40; seed++) {
  const L = generateLayout(seed * 7919, seed % 2 ? 'factory' : 'office', 1.2, { variety: false });
  const nav = new NavGrid(L, 1);
  const C = L.cell;
  const wx = (x) => L.ox + x * C, wz = (z) => L.oz + z * C;
  // (a) two points 2 m apart on both sides of a plain closed wall between two floor cells
  for (let z = 1; z < L.h - 1 && cases < seed * 6; z++) for (let x = 1; x < L.w - 1 && cases < seed * 6; x++) {
    const a = L.idx(x, z), b = L.idx(x + 1, z);
    if (!L.cells[a] || !L.cells[b] || L.open.has(L.edgeKey(x, z, 0))) continue;
    const A = { x: wx(x + 1) - 1.0, y: 0, z: wz(z) + C / 2 }, B = { x: wx(x + 1) + 1.0, y: 0, z: wz(z) + C / 2 };
    const eff = S.effectiveDistance(nav, A, B);
    cases++;
    if (eff >= 2 + S.WALL_COST - 0.01) atten++;
  }
  // (b) inside one room (all inner edges open): no attenuation
  const room = L.rooms.find((r) => r.w >= 3 && r.type !== 'entrance');
  if (room) {
    const A = { x: wx(room.x) + 1, y: 0, z: wz(room.z) + 1 }, B = { x: wx(room.x + room.w) - 1, y: 0, z: wz(room.z) + 1 };
    if (near(S.effectiveDistance(nav, A, B), Math.hypot(A.x - B.x, 0))) openOk++;
  }
  // (c) a closed plain door in the line counts DOOR_COST
  for (const inf of L.edgeInfo.values()) {
    if (inf.type !== 'door' || inf.locked || inf.dir !== 0) continue;
    const ex = L.ox + inf.cx * C, ez = L.oz + inf.cz * C;
    const A = { x: ex - 1.5, y: 0, z: ez }, B = { x: ex + 1.5, y: 0, z: ez };
    const closed = S.effectiveDistance(nav, A, B, (k) => k === inf.key), opened = S.effectiveDistance(nav, A, B, () => false);
    if (near(opened, 3, 0.01) && near(closed, 3 + S.DOOR_COST, 0.01)) doorOk++;
    break;
  }
  // (d) many walls: capped
  const far = S.effectiveDistance(nav, { x: wx(1) + 2, y: 0, z: wz(1) + 2 }, { x: wx(L.w - 2), y: 0, z: wz(L.h - 2) });
  const straight = Math.hypot(wx(L.w - 2) - wx(1) - 2, wz(L.h - 2) - wz(1) - 2);
  if (far <= straight + S.MAX_WALLS * S.WALL_COST + 0.01) multi++;
}
ok(cases > 100 && atten === cases, `walls attenuate (${atten}/${cases})`);
ok(openOk >= 35, `open room: no attenuation (${openOk}/40)`);
ok(doorOk >= 30, `closed doors attenuate (${doorOk}/40)`);
ok(multi === 40, 'wall count capped');
// same 2 m distance: through a wall a walking player (0.3 x 22 = 6.6 m) is no longer heard, in the open he is
ok(2 + S.WALL_COST > S.radiusOf(w, 22) && 2 < S.radiusOf(w, 22), 'a walking player next door is not heard, in the same room he is');
ok(!Number.isNaN(S.effectiveDistance(null, { x: 0, z: 0 }, { x: 3, z: 4 })) && near(S.effectiveDistance(null, { x: 0, z: 0 }, { x: 3, z: 4 }), 5), 'no nav = open air');

// ---- batcher
const B = new S.NoiseBatcher({ perSec: 8 });
let accepted = 0;
for (let i = 0; i < 40; i++) accepted += B.add('impact', i * 5, 0, 0, 0.5, 1000 + i * 5) ? 1 : 0;   // 40 events in 200 ms at different places
ok(accepted <= 9, `client rate limit (${accepted} accepted of 40 in 0.2 s)`);
const B2 = new S.NoiseBatcher();
B2.add('door', 1, 0, 1, 0.3, 0); B2.add('door', 1.4, 0, 1, 0.6, 50);
ok(B2.q.length === 1 && B2.q[0][4] === 60, 'near-duplicates merge into the louder one');
ok(B2.drain(10) === null, 'flush interval respected');
const out = B2.drain(200);
ok(out.length === 1 && out[0].length === 5 && out[0].every(Number.isInteger), 'compact int events');
ok(!B2.add('door', NaN, 0, 0, 0.5, 300) && !B2.add('door', 0, 0, 0, 0, 300), 'invalid events dropped');
const ev = S.sanitizeEvents([[2, 100, 0, 100, 350], [3, 9999, 0, 0, 50], ['x'], [4, 0, 0, 0, 999]], { x: 10, z: 10 });
ok(ev.length === 2 && ev[0].kind === 'door' && near(ev[0].loud, 3.0) && ev[1].kind === 'impact', 'sanitize keeps the sane events, drops the far / broken ones');
ok(ev.every((e) => e.loud <= S.NOISE.stickEvent && Number.isFinite(e.x)), 'sanitized events are clamped and finite');
ok(S.sanitizeEvents('nope').length === 0 && S.sanitizeEvents(new Array(50).fill([0, 0, 0, 0, 10])).length <= 6, 'host takes at most 6 per batch');
const lim = S.makeRateLimiter(10, 12);
let allowed = 0;
for (let i = 0; i < 100; i++) allowed += lim('p1', 1000) ? 1 : 0;
ok(allowed === 12, `token bucket burst (${allowed})`);
ok(lim('p1', 2000) && lim('p2', 1000), 'bucket refills / is per sender');
ok(S.TIPS.length >= 6 && S.TIPS.every((t) => t.id && t.title && t.body), 'tips exported');

console.log(`stealth noise: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
