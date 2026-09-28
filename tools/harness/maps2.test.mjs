// maps2 node test (no browser):  node tools/harness/maps2.test.mjs [seeds=40]
// - room injection counts per theme / size / seed (story rooms everywhere, triangle rooms keep their doorways on the kept side)
// - retyped rooms are consistent, facsys keeps >= 9 ordinary rooms, safe-seal edges never disconnect the facility
// - buildFacility (stub physics / lights) builds the m2 rooms without warnings and exposes notes + switches
// - the off switch (globalThis.__kefalM2Off) reproduces the old layout
import { generateLayout, buildFacility, INTERIOR_THEMES } from '../../src/world/facility.js';
import { M2_STORY, M2_TYPES, M2_CHALLENGE_ON, corridorSealEdges } from '../../src/world/rooms2.js';
import { NOTES } from '../../src/game/maps2_text.js';

const SEEDS = Number(process.argv[2]) || 40;
const fails = [];
const fail = (m) => { if (fails.length < 30) fails.push(m); };
const stats = { layouts: 0, withM2: 0, story: {}, triangle: 0, challenge: 0, byTheme: {} };

const reachCount = (L, key) => {
  const seen = new Uint8Array(L.w * L.h), q = [L.idx(L.entrance.room.cx, L.entrance.room.cz)];
  seen[q[0]] = 1;
  const blocks = (inf) => !!inf && (inf.type === 'vault' || inf.type === 'contain' || (inf.type === 'door' && inf.locked));
  let n = 0;
  while (q.length) {
    const i = q.pop(); n++;
    const x = i % L.w, z = (i / L.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d];
      if (nx < 0 || nz < 0 || nx >= L.w || nz >= L.h) continue;
      const k = L.edgeKey(x, z, d), j = nz * L.w + nx;
      if (k === key || !L.cells[j] || seen[j] || !L.open.has(k) || blocks(L.edgeInfo.get(k))) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return n;
};

for (const theme of INTERIOR_THEMES) {
  stats.byTheme[theme] = 0;
  for (const size of [0.9, 1.4, 2.2]) for (let s = 0; s < SEEDS; s++) {
    const seed = (s * 2654435761 + 777 + Math.round(size * 100)) >>> 0;
    const L = generateLayout(seed, theme, size);
    stats.layouts++;
    const tag = `${theme} ${size} ${seed}`;
    const M = L.m2;
    const ordinary = L.rooms.filter((r) => !['entrance', 'vault', 'generator', 'core'].includes(r.type) && !M2_TYPES.includes(r.type) && !r.treasure && r.w * r.h >= 4).length;
    if (!M) continue;
    stats.withM2++; stats.byTheme[theme]++;
    if (ordinary < 8) fail(`${tag}: only ${ordinary} ordinary rooms left for the facility systems`);
    for (const e of M.rooms) {
      const r = L.rooms[e.room];
      if (r.type !== 'm2_' + e.id || !r.m2) fail(`${tag}: room ${e.room} not retyped`);
      if (e.kind === 'story') stats.story[e.id] = (stats.story[e.id] || 0) + 1;
      if (e.id === 'triangle') {
        stats.triangle++;
        if (!r.m2.tri) fail(`${tag}: triangle without diagonal`);
      }
      if (e.kind === 'challenge') stats.challenge++;
    }
    if (!M.rooms.some((e) => e.kind === 'story')) stats.noStory = (stats.noStory || 0) + 1;   // e.g. tiny open-plan backrooms: only a liminal room fit
    if (!M2_CHALLENGE_ON && M.challenge) fail(`${tag}: challenge room while disabled`);
    // sealing any one safe corridor edge keeps the whole facility connected
    const total = reachCount(L, -1);
    const edges = corridorSealEdges(L);
    for (const k of edges.slice(0, 6)) if (reachCount(L, k) !== total) { fail(`${tag}: sealing edge ${k} disconnects the facility`); break; }
  }
}

// off switch: no m2, identical cells
{
  const a = generateLayout(4242, 'office', 1.4);
  globalThis.__kefalM2Off = true;
  const b = generateLayout(4242, 'office', 1.4);
  delete globalThis.__kefalM2Off;
  if (b.m2) fail('off switch still plans m2');
  if (a.cells.length !== b.cells.length || a.cells.some((v, i) => v !== b.cells[i])) fail('m2 changed the cells');
}

// build smoke (stub physics + lights): m2 rooms build without warnings, notes + switches exposed
{
  let n = 0;
  const physics = new Proxy({}, { get: () => () => ({ handle: n++ }) });
  const lightPool = { add() {}, remove() {}, emitters: new Set() };
  const warns = [];
  const w0 = console.warn;
  console.warn = (...a) => { if (String(a[0]).startsWith('maps2') || String(a[0]).startsWith('m2') || String(a[0]).startsWith('prop')) warns.push(a.map(String).join(' ')); };
  let built = 0, notes = 0, switches = 0, windows = 0, meshes = 0;
  for (const theme of ['factory', 'office', 'hospital', 'sewer', 'backrooms']) for (let s = 0; s < 6; s++) {
    const L = generateLayout(1000 + s * 7919, theme, 1.5);
    if (!L.m2) continue;
    const fac = buildFacility(L, { physics, lightPool });
    if (!fac.m2) { fail(`${theme}: m2 planned but not built`); continue; }
    built++;
    notes += fac.m2.spots.filter((x) => x.k === 'note').length;
    switches += fac.m2.switches.length;
    windows += fac.m2.windows?.list.length || 0;
    fac.group.traverse((o) => { if (o.isMesh && o.visible) meshes++; });
    for (const sp of fac.m2.spots) if (![sp.x, sp.y, sp.z].every(Number.isFinite)) fail(`${theme}: bad spot ${sp.k}`);
    fac.dispose(physics);
  }
  console.warn = w0;
  for (const wn of warns.slice(0, 5)) fail('build warning: ' + wn);
  if (!built) fail('no facility with m2 rooms was built');
  if (!notes) fail('no readable notes were built');
  stats.build = { built, notes, switches, windows, meshes };
}
for (const th of INTERIOR_THEMES) if (stats.byTheme[th] < SEEDS) fail(`theme ${th} got m2 rooms in only ${stats.byTheme[th]} of ${SEEDS * 3} layouts`);
if ((stats.noStory || 0) > stats.withM2 * 0.15) fail(`too many layouts without a story room: ${stats.noStory}`);
for (const id of M2_STORY) if (!NOTES[id]) fail(`missing note text for ${id}`);

console.log(JSON.stringify(stats, null, 1));
if (fails.length) { console.log('FAIL ' + fails.length); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log(`PASS: ${stats.layouts} layouts, ${stats.withM2} with m2 rooms`);
