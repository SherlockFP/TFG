// (part of zones2.test.mjs: interior wings + traps; imported by it)
import { generateLayout, INTERIOR_THEMES } from '../../src/world/facility.js';
import { RNG } from '../../src/core/rng.js';
import * as H from '../../src/game/horror_core.js';
import * as Q from '../../src/game/zones2_core.js';

export function interiorTests({ ok, say, NL }) {
  const WINGS = ['entrance', 'fire0', 'fire1'];
  const themes = INTERIOR_THEMES.slice(0, 6);
  let layouts = 0, wingsMade = 0, coresMade = 0, trapsPlanned = 0, onRoute = 0, firstOn = 0, firstN = 0, entCore = 0;
  const perTrap = {};
  for (let s = 0; s < NL; s++) {
    const th = themes[s % themes.length], seed = 100 + s * 977, size = 0.8 + (s % 5) * 0.35;
    const L = generateLayout(seed, th, size, null);
    layouts++;
    const a = Q.partitionWings(L, WINGS, 'RUNA'), b = Q.partitionWings(L, WINGS, 'RUNA');
    ok(JSON.stringify(a.wings) === JSON.stringify(b.wings), `${th}/${seed}: partition deterministic`);
    const reach = H.reachableCells(L);
    let total = 0, assigned = 0;
    for (let i = 0; i < L.w * L.h; i++) if (L.cells[i] && reach[i]) { total++; if (a.cellWing[i] >= 0) assigned++; }
    ok(assigned === total, `${th}/${seed}: every reachable cell belongs to a wing (${assigned}/${total})`);
    for (let i = 0; i < L.w * L.h; i++) if (a.cellWing[i] >= 0) ok(reach[i] && L.cells[i], 'wing cells are reachable floor');
    if (a.wings[0].core) entCore++; else ok(a.wings[0].cells < 6 || !a.wings[0].anchor, `${th}/${seed}: no entrance core only when the key-free part is tiny (${a.wings[0].cells} cells)`);
    const cores = a.wings.filter((w) => w.core);
    for (const w of a.wings) {
      wingsMade++;
      if (!w.core) continue;
      coresMade++;
      const i = w.core.cell;
      ok(a.cellWing[i] === w.wi && reach[i], `${th}/${seed}: ${w.name} core is inside its wing and reachable from the entrance without a key`);
      ok(w.core.d >= 2 && w.core.y === L.y, `${th}/${seed}: ${w.name} core is not on top of the door: ${w.core.d}`);
      const room = L.rooms.find((r) => r && r.id === w.core.room);
      ok(!room || (!['vault', 'generator', 'core'].includes(room.type) && (room.type !== 'entrance' || w.wi === 0) && !room.treasure && !room.arena), `${th}/${seed}: core not in a special room`);
      ok(Q.wingAt(L, a, w.core.x, L.y, w.core.z) === w.wi && Q.wingAt(L, a, w.core.x, 0, w.core.z) === -1, 'wingAt: inside the wing at facility height only');
      const route = Q.routeCells(L, a, w.wi);
      ok(route.length >= 2 && route[0] === L.idx(w.anchor.cx, w.anchor.cz) && route[route.length - 1] === i, `${th}/${seed}: ${w.name} route anchor -> core exists`);
      const fd = Q.coreDist(L, a, w.wi);
      ok(fd[i] === 0 && route.every((c) => fd[c] >= 0), 'core distance field covers the route');
      const sp = Q.wingSpawnPoints(L, a, w.wi, fd, 4, new RNG(5));
      ok(sp.length > 0, `${th}/${seed}: ${w.name} has raider spawn points`);
      for (const p of sp.slice(0, 2)) {
        const q = { x: p.x, z: p.z };
        let steps = 0;
        for (; steps < 400; steps++) { const t = Q.flowTarget(L, fd, q.x, q.z); if (!t) break; q.x = t.x; q.z = t.z; }
        ok(steps < 400 && Q.cellOfPos(L, q.x, q.z) === i, `${th}/${seed}: raider walk ends at the core cell (${steps} cells)`);
      }
    }
    for (let x = 0; x < cores.length; x++) for (let y = x + 1; y < cores.length; y++) ok(Math.abs(cores[x].core.cx - cores[y].core.cx) + Math.abs(cores[x].core.cz - cores[y].core.cz) >= 3, 'cores apart');
    const hp = H.planFacility(L, { day: 3, quotaIndex: 1 });
    const ctx = { horror: hp.traps, hazards: [] };
    for (const w of a.wings) {
      if (!w.core) continue;
      const types = ['spikes', 'crusher', 'laser', 'flame', 'electric', 'spikes'];
      const pl = Q.planWingTraps(L, a, w.wi, types, ctx), pl2 = Q.planWingTraps(L, a, w.wi, types, ctx);
      ok(JSON.stringify(pl) === JSON.stringify(pl2), 'trap planner deterministic');
      if (pl[0]) { firstN++; if (pl[0].onRoute) firstOn++; }
      for (let k = 0; k < pl.length; k++) {
        const p = pl[k]; if (!p) continue;
        trapsPlanned++; perTrap[p.type] = (perTrap[p.type] || 0) + 1;
        if (p.onRoute) onRoute++;
        const others = pl.slice(0, k).filter(Boolean);
        ok(Q.validateTrap(L, a, w.wi, p, { ...ctx, taken: others }).ok, `${th}/${seed}: planned ${p.type} passes the validator`);
        const T = H.TRAPS[p.type];
        ok(p.cells.length >= T.minLen && p.cells.length <= T.len + 1, `${p.type} length within its table`);
        for (const [x, z] of p.cells) {
          const ii = L.idx(x, z);
          ok(reach[ii] && a.cellWing[ii] === w.wi, `${th}/${seed}: trap cell in the wing + reachable`);
          ok(H.straightAxis(L, x, z) === p.axis, `${th}/${seed}: trap on a straight hallway cell, no doorway`);
          ok(!(x === w.core.cx && z === w.core.cz), 'never on the core cell');
        }
        for (const h of hp.traps) ok(!h.cells.some((c) => p.cells.some((d) => c[0] === d[0] && c[1] === d[1])) && !p.cells.some((d) => d[0] === h.panelCell[0] && d[1] === h.panelCell[1]), 'never on a horror pay-to-arm trap or its panel');
      }
    }
  }
  ok(entCore >= layouts * 0.9, `the entrance wing has a core in ${entCore}/${layouts} layouts (the rest fall back to an outdoor annex relay)`);
  ok(coresMade >= layouts * 1.5, `cores per layout ${coresMade}/${layouts}`);
  ok(trapsPlanned > layouts && Object.keys(perTrap).length === 5, `every trap type gets placed somewhere: ${JSON.stringify(perTrap)}`);
  ok(firstOn > firstN * 0.4, `the first trap of a wing sits on the route to the core (chokepoint): ${firstOn}/${firstN}`);
  say(`interior: ${layouts} layouts, ${wingsMade} wings, ${coresMade} cores (reachable), ${trapsPlanned} traps validated (first trap on the anchor -> core route in ${firstOn}/${firstN} wings)`);

  // ---- the validator refuses bad placements
  const L = generateLayout(4242, 'factory', 1.6, null), part = Q.partitionWings(L, WINGS, 'RUNA'), wi = 0, w = part.wings[wi];
  const good = Q.planWingTraps(L, part, wi, ['spikes'], {})[0];
  ok(good && Q.validateTrap(L, part, wi, good, {}).ok, 'a planned trap validates');
  ok(!Q.validateTrap(L, part, wi, { type: 'nope', axis: 'x', cells: good.cells }, {}).ok, 'unknown type refused');
  ok(!Q.validateTrap(L, part, wi, { ...good, axis: good.axis === 'x' ? 'z' : 'x' }, {}).ok, 'wrong axis refused');
  ok(!Q.validateTrap(L, part, wi, { ...good, cells: [[good.cells[0][0], good.cells[0][1]], [good.cells[0][0] + 1, good.cells[0][1] + 1]] }, {}).ok, 'bent zone refused');
  ok(!Q.validateTrap(L, part, wi, { type: 'spikes', axis: 'x', cells: [[w.core.cx, w.core.cz]] }, {}).ok, 'core cell refused');
  ok(!Q.validateTrap(L, part, wi, good, { taken: [{ cells: good.cells }] }).ok, 'overlap with an existing zone trap refused');
  ok(!Q.validateTrap(L, part, wi, good, { horror: [{ cells: good.cells, panelCell: good.cells[0] }] }).ok, 'overlap with a horror trap refused');
  const mid = good.cells[Math.floor(good.cells.length / 2)];
  ok(!Q.validateTrap(L, part, wi, good, { hazards: [{ cx: L.ox + (mid[0] + 0.5) * H.CELL + 3, cz: L.oz + (mid[1] + 0.5) * H.CELL }] }).ok, 'stacking on a built-in laser grid refused');
  const other = part.wings.find((x) => x.wi !== wi && x.core);
  if (other) ok(!Q.validateTrap(L, part, other.wi, good, {}).ok, 'a trap of wing A is not valid in wing B');
  say('trap validator refusals');
}
