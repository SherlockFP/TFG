// Wave 1 (facilitysys) path test - pure node, no browser:
//   node tools/harness/wave1_facility_paths.mjs [seeds=100]
// For every interior theme x size x seed: with every locked door treated as a wall, a BFS from the main entrance and
// the fire exits that have an outdoor twin must reach every floor cell except the intentionally sealed rooms
// (vaults, the containment chamber, treasure rooms). Every sealed room must have a reachable way to open it
// (vault keypad / containment console / key or lockpicker at a reachable door). Every facility needs >= 2 entrances
// (main + fire exit), the generator room must be reachable and every fire exit must lead somewhere outside.
import { generateLayout, INTERIOR_THEMES } from '../../src/world/facility.js';
import { facilityReach, planFacilitySystems, isSealedRoom } from '../../src/world/interiors/facsys.js';

const SEEDS = Number(process.argv[2]) || 100;
const SIZES = [0.6, 0.9, 1.2, 1.6, 2.0, 2.6];
const fails = [];
const stats = { layouts: 0, locked: 0, unlockedByRule: 0, treasure: 0, coreRooms: 0, noCore: 0, fire: 0, chains: {} };
const t0 = Date.now();

for (const theme of INTERIOR_THEMES) {
  for (const size of SIZES) {
    for (let s = 0; s < SEEDS; s++) {
      const seed = (s * 2654435761 + 12345 + Math.round(size * 1000)) >>> 0;
      const L = generateLayout(seed, theme, size);
      const tag = `${theme} size=${size} seed=${seed}`;
      stats.layouts++;
      const fail = (msg) => { fails.push(`${tag}: ${msg}`); };
      // >= 2 entrances, every fire exit leads to an outdoor exit
      if (!L.fireExits.length) fail('no fire exit (only one entrance)');
      stats.fire += L.fireExits.length;
      if (!(L.outdoorFires >= 1)) fail('outdoorFires missing');
      // BFS with locked doors = walls
      const reach = facilityReach(L);
      const sealedCells = new Set();
      for (let i = 0; i < L.w * L.h; i++) {
        if (!L.cells[i] || reach[i]) continue;
        const ri = L.roomOf[i];
        if (ri >= 0 && isSealedRoom(L.rooms[ri])) { sealedCells.add(i); continue; }
        fail(`cell ${i % L.w},${(i / L.w) | 0} (${ri >= 0 ? L.rooms[ri].type : 'corridor'}) unreachable without a key`);
        break;
      }
      // with every door open the whole facility is one piece
      const all = facilityReach(L, { blockLocked: false });
      for (let i = 0; i < L.w * L.h; i++) if (L.cells[i] && !all[i]) { fail(`cell ${i % L.w},${(i / L.w) | 0} disconnected even with all doors open`); break; }
      // every sealed room has a reachable opener
      for (const inf of L.edgeInfo.values()) {
        const sealedDoor = inf.type === 'vault' || inf.type === 'contain' || (inf.type === 'door' && inf.locked);
        if (!sealedDoor) continue;
        if (inf.type === 'door') stats.locked++;
        const aIn = reach[inf.a], bIn = inf.b >= 0 && reach[inf.b];
        const ra = L.roomOf[inf.a], rb = inf.b >= 0 ? L.roomOf[inf.b] : -1;
        const sealedSide = isSealedRoom(L.rooms[ra]) && !aIn ? ra : isSealedRoom(L.rooms[rb]) && !bIn ? rb : -1;
        if (sealedSide < 0) continue;   // both sides reachable anyway
        if (!aIn && !bIn) fail(`sealed ${L.rooms[sealedSide].type} room ${sealedSide}: its door is not reachable (no way to use a key / keypad)`);
        if (inf.type === 'door' && !inf.treasure) fail(`locked door into a non-treasure sealed room ${sealedSide}`);
      }
      stats.unlockedByRule += L.unlockedByRule || 0;
      stats.treasure += L.rooms.filter((r) => r.treasure).length;
      if (L.core) stats.coreRooms++; else stats.noCore++;
      // facility systems plan: generator reachable, puzzle rooms reachable, core present
      const P = planFacilitySystems(L);
      stats.chains[P.chain] = (stats.chains[P.chain] || 0) + 1;
      if (P.gen === null) fail('no generator room');
      else { const g = L.rooms[P.gen]; if (!reach[L.idx(g.cx, g.cz)]) fail('generator room not reachable'); }
      for (const id of [...P.rooms.panels, ...P.rooms.notes]) if (id === null || id === undefined) { if (L.rooms.length > 8) fail(`puzzle room missing (${P.chain})`); }
      else if (!reach[L.idx(L.rooms[id].cx, L.rooms[id].cz)]) fail('puzzle room not reachable');
      if (P.core !== null && P.containKey === null) fail('core room without a containment door');
    }
  }
}

const ms = Date.now() - t0;
console.log(JSON.stringify({ ...stats, avgFireExits: +(stats.fire / stats.layouts).toFixed(2), ms }, null, 1));
if (fails.length) {
  console.log(`FAIL ${fails.length} problems:`);
  for (const f of fails.slice(0, 40)) console.log('  ' + f);
  process.exit(1);
}
console.log(`PASS: ${stats.layouts} layouts (${INTERIOR_THEMES.length} themes x ${SIZES.length} sizes x ${SEEDS} seeds)`);
