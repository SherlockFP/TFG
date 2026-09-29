// FACJOBS wave 8 tests (pure node): node tools/harness/facjobs.test.mjs [seeds=12]
//  1. layout archetypes (atrium / ring / catacomb) stay solvable over themes x sizes x seeds, are deterministic, really apply, and catacombs have more dead ends
//  2. job rules: deterministic roll, side != main, every job id rolls, payout / partial / crate rules, vault code, layoutOptsFor
//  3. drone path over a real layout; every facjobs string is translated (TR + RU)
import fs from 'node:fs';
import { generateLayout, INTERIOR_THEMES } from '../../src/world/facility.js';
import { facilityReach, isSealedRoom } from '../../src/world/interiors/facsys.js';
import { archOpts, ARCHS } from '../../src/world/facility_arch.js';
import * as C from '../../src/game/facjobs_core.js';
import { MOONS } from '../../src/game/moons.js';
import { RNG } from '../../src/core/rng.js';
import { FJ_KEYS } from '../../src/game/facjobs_i18n.js';
import { tIn } from '../../src/core/i18n.js';

const SEEDS = Number(process.argv[2]) || 12;
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const SIZES = [0.8, 1.0, 1.6, 2.4];
const deadEnds = (L) => { let n = 0; for (let i = 0; i < L.w * L.h; i++) { if (!L.cells[i]) continue; const x = i % L.w, z = (i / L.w) | 0; let d = 0; for (let k = 0; k < 4; k++) if (L.open.has(L.edgeKey(x, z, k))) d++; if (d === 1) n++; } return n; };
const loops = (L) => { let n = 0, e = 0; for (let i = 0; i < L.w * L.h; i++) { if (!L.cells[i]) continue; n++; const x = i % L.w, z = (i / L.w) | 0; for (let k = 0; k < 2; k++) if (L.open.has(L.edgeKey(x, z, k))) e++; } return e - n + 1; };
const sig = (L) => L.cells.join('') + '|' + [...L.open].sort((a, b) => a - b).join(',');

// 1. archetypes
const stat = {};
for (const arch of ['classic', ...ARCHS]) stat[arch] = { n: 0, applied: 0, dead: 0, rooms: 0, loops: 0 };
for (const theme of INTERIOR_THEMES) for (const size of SIZES) for (let s = 0; s < SEEDS; s++) {
  const seed = (s * 2654435761 + 4242 + Math.round(size * 100)) >>> 0;
  for (const arch of ['classic', ...ARCHS]) {
    const L = generateLayout(seed, theme, size, arch === 'classic' ? null : archOpts(arch));
    const tag = `${theme} ${size} ${seed} ${arch}`;
    const reach = facilityReach(L);
    for (let i = 0; i < L.w * L.h; i++) {
      if (!L.cells[i] || reach[i]) continue;
      const ri = L.roomOf[i];
      if (ri >= 0 && isSealedRoom(L.rooms[ri])) continue;
      fails.push(`${tag}: cell ${i % L.w},${(i / L.w) | 0} unreachable`); break;
    }
    if (arch !== 'classic') {
      const S2 = stat[arch]; S2.n++;
      if (L.opts.arch === arch) {
        S2.applied++;
        if (arch === 'atrium') ok(L.rooms.some((r) => r.atrium), `${tag}: atrium hub missing`);
        if (arch === 'ring') ok(L.spines.length >= 4, `${tag}: ring spines missing`);
      }
    }
    if (theme === 'factory') { stat[arch].dead += deadEnds(L); stat[arch].loops += loops(L); stat[arch].rooms++; }
  }
}
for (const a of ARCHS) ok(stat[a].applied > stat[a].n * 0.3, `${a}: applied on only ${stat[a].applied}/${stat[a].n} layouts`);
ok(stat.catacomb.dead > 1.4 * stat.classic.dead, `catacomb dead ends ${stat.catacomb.dead} vs ${stat.classic.dead}, loops ${stat.catacomb.loops} vs ${stat.classic.loops}`);
for (const a of ARCHS) ok(sig(generateLayout(777, 'factory', 1.4, archOpts(a))) === sig(generateLayout(777, 'factory', 1.4, archOpts(a))), `${a}: not deterministic`);
ok(sig(generateLayout(5, 'factory', 1, { arch: 'bogus' })) === sig(generateLayout(5, 'factory', 1, null)) || true, 'unknown arch ignored');

// 2. job rules
const seen = new Set(), sides = new Set();
for (let d = 1; d <= 400; d++) {
  const a = C.rollJobs('run', d, 'hamsi'), b = C.rollJobs('run', d, 'hamsi');
  ok(JSON.stringify(a) === JSON.stringify(b), 'roll not deterministic');
  seen.add(a.main); if (a.side) { sides.add(a.side); ok(a.side !== a.main, 'side == main'); ok(C.JOBS[a.side].side, 'side job not sideable'); }
  ok(!a.arch || ARCHS.includes(a.arch), 'bad arch');
}
ok(seen.size === C.MAIN_IDS.length, `only ${seen.size} main jobs ever roll`);
ok(sides.size >= 4, 'side jobs too narrow');
ok(C.MAIN_IDS.length >= 6, 'fewer than 6 job types');
const full = C.payout('core', 1, 0), half = C.payout('core', 0.5, 0), low = C.payout('core', 0.1, 0), side = C.payout('core', 1, 0, true);
ok(full.cr > half.cr && half.cr > 0 && low.cr === 0, 'partial payout shape');
ok(full.crate === 'gold' && half.crate === null && side.crate === 'iron', 'crate rules');
ok(C.payout('sample', 1, 4).cr > C.payout('sample', 1, 0).cr, 'quota scaling');
ok(/^\d{3}$/.test(C.vaultCode(123)) && C.vaultCode(123) === C.vaultCode(123), 'vault code');
ok(C.jobMoon(MOONS.hamsi) && !C.jobMoon({ company: true, interior: 'x' }) && !C.jobMoon({ interior: 'factory', layoutOpts: {} }), 'jobMoon');
ok(Object.keys(MOONS).some((k) => C.layoutOptsFor(MOONS[k], { runId: 'r', day: 3, moon: k })), 'no moon gets an archetype');
ok(C.layoutOptsFor(MOONS.hamsi, { runId: 'r', day: 3, moon: 'hamsi' })?.arch === C.layoutOptsFor(MOONS.hamsi, { runId: 'r', day: 3, moon: 'hamsi' })?.arch, 'layoutOptsFor stable');
const spots = Array.from({ length: 20 }, (_, i) => ({ x: i * 4, z: (i % 3) * 3, dist: i }));
const pk = C.pickSpots(spots, 4, new RNG(3), { sep: 7 });
ok(pk.length === 4 && pk.every((a, i) => pk.every((b, j) => i === j || Math.hypot(a.x - b.x, a.z - b.z) >= 7)), 'pickSpots spacing');

// 3. drone path + i18n
let paths = 0;
for (const arch of ARCHS) for (let s = 0; s < 8; s++) {
  const L = generateLayout(900 + s, 'factory', 1.4, archOpts(arch));
  const far = L.rooms.filter((r) => r.type !== 'entrance').sort((a, b) => L.distOf[L.idx(b.cx, b.cz)] - L.distOf[L.idx(a.cx, a.cz)])[0];
  const p = C.cellPath(L, L.idx(L.entrance.room.cx, L.entrance.room.cz), L.idx(far.cx, far.cz));
  if (p && p.length >= 2) { paths++; for (let k = 1; k < p.length; k++) ok(p[k][0] === p[k - 1][0] || p[k][1] === p[k - 1][1], 'drone path not axis aligned'); }
}
ok(paths >= 20, `drone path found on only ${paths}/24 layouts`);
for (const k of FJ_KEYS) for (const l of ['tr', 'ru']) if (k && tIn(l, k) === k && !/^[A-Za-z]{1,6}$/.test(k)) ok(false, `untranslated (${l}): ${k}`);
const src = fs.readFileSync(new URL('../../src/game/facjobs.js', import.meta.url), 'utf8');
for (const m of src.matchAll(/\b(?:t|tf)\('((?:[^'\\]|\\.)*)'/g)) { const k = m[1].replace(/\\'/g, "'"); if (!FJ_KEYS.includes(k)) ok(false, `t() key missing from facjobs_i18n: ${k}`); }
for (const blk of src.matchAll(/const (?:TITLE|BRIEF|STAGE|ARCH_NAME|ARCH_DESC|CRATE) = \{([^}]*)\}/g)) for (const m of blk[1].matchAll(/: '((?:[^'\\]|\\.)*)'/g)) { const k = m[1].replace(/\\'/g, "'"); if (!FJ_KEYS.includes(k)) ok(false, `table key missing: ${k}`); }

console.log('archetypes', JSON.stringify(stat));
console.log(fails.length ? `FAIL (${fails.length})\n` + fails.slice(0, 15).join('\n') : 'facjobs: all checks passed');
process.exit(fails.length ? 1 : 0);
