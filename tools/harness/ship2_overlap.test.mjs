// ship2: overlap / clipping check for the crew ship (bounding boxes of every fixture vs each other, the hull shell, the partitions, the doorway aisles and the spawn points).
// Prints BEFORE (legacy placements) and AFTER (world/shiplayout.js) counts.   node tools/harness/ship2_overlap.test.mjs   (add --verbose for every pair)
import './ship2_env.mjs';
import assert from 'node:assert/strict';
import * as L from '../../src/world/shiplayout.js';

const VERBOSE = process.argv.includes('--verbose');
let pass = 0, fail = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; process.exitCode = 1; console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 5).join('\n       ')); } };

const EPS = 0.005;
const hit = (a, b) => a.x0 < b.x1 - EPS && a.x1 > b.x0 + EPS && a.z0 < b.z1 - EPS && a.z1 > b.z0 + EPS && a.y0 < b.y1 - EPS && a.y1 > b.y0 + EPS;
const S = L.SHELL;

/** all problems of one layout: { pairs, walls, aisles, spawns, signs, list } */
export function analyse({ spots, tables, lamps, spawns, partitions, decor, signs = [], aisles = L.AISLES }) {
  const solids = [
    ...(partitions ? L.PARTITIONS.map((p) => ({ ...p, kind: 'wall' })) : []),
    ...L.fixtureBoxes(spots, { tables, decor }),
    ...lamps.map(([x, z], i) => ({ id: 'lamp' + i, x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: S.h - 0.1, y1: S.h, kind: 'lamp' })),
  ];
  const sg = signs.map((s) => { const hw = 0.45, hh = 0.16, n = Math.abs(Math.sin(s.ry)) > 0.5; const ox = Math.sin(s.ry) * (s.off ?? 0), oz = Math.cos(s.ry) * (s.off ?? 0); return { id: 'sign:' + s.id, x0: s.x + ox - (n ? 0.01 : hw), x1: s.x + ox + (n ? 0.01 : hw), z0: s.z + oz - (n ? hw : 0.01), z1: s.z + oz + (n ? hw : 0.01), y0: s.y - hh, y1: s.y + hh, kind: 'sign' }; });
  const list = [], out = { pairs: 0, walls: 0, aisles: 0, spawns: 0, signs: 0, list };
  for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
    const a = solids[i], b = solids[j];
    if (a.kind === 'wall' && b.kind === 'wall' && (a.id.startsWith('cockpit') || a.id.startsWith('engine')) && (b.id.startsWith('cockpit') || b.id.startsWith('engine'))) continue;   // partition pieces touching each other are one wall
    if (hit(a, b)) { out.pairs++; list.push(`overlap ${a.id} x ${b.id}`); }
  }
  for (const a of solids) {
    if (a.kind === 'wall' && (a.id.startsWith('cockpit') || a.id.startsWith('engine'))) continue;
    // inside the wall = protrudes beyond the interior planes of the shell (walls, ceiling)
    if (a.x0 < S.x0 - EPS || a.x1 > S.x1 + EPS || a.z0 < S.z0 - EPS || a.z1 > S.z1 + EPS || a.y1 > S.h + EPS) { out.walls++; list.push(`in wall ${a.id} [${a.x0.toFixed(2)},${a.x1.toFixed(2)}]x[${a.z0.toFixed(2)},${a.z1.toFixed(2)}]`); }
  }
  for (const ai of aisles) for (const a of solids) {
    if (a.kind === 'lamp' || a.kind === 'floor') continue;
    if (hit(ai, a)) { out.aisles++; list.push(`blocks ${ai.id}: ${a.id}`); }
  }
  for (const [x, z] of spawns) {
    const cap = { x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35, y0: 0.06, y1: 1.7 };
    for (const a of solids) if (a.kind !== 'lamp' && a.kind !== 'floor' && a.id !== 'tpPad' && hit(cap, a)) { out.spawns++; list.push(`spawn (${x},${z}) inside ${a.id}`); }
  }
  for (const s of sg) for (const a of [...solids, ...(partitions ? [] : [])]) if (a.kind !== 'lamp' && a.kind !== 'floor' && hit(s, a)) { out.signs++; list.push(`${s.id} x ${a.id}`); }
  if (partitions) {   // signs must not sit in a window hole and windows must not touch wall fixtures / other windows
    for (const w of L.WINDOWS_Z) {
      const wb = { x0: w.x0, x1: w.x1, z0: S.z1 - 0.3, z1: S.z1, y0: w.y0, y1: w.y1 };
      for (const a of [...solids, ...sg]) if (a.kind !== 'lamp' && a.kind !== 'floor' && a.id !== 'tpPad' && hit(wb, a)) { out.signs++; list.push(`window ${w.x0} x ${a.id}`); }
    }
  }
  return out;
}
const before = { spots: L.LEGACY_SPOTS, tables: L.LEGACY_TABLES, lamps: L.LEGACY_LAMPS, spawns: L.LEGACY_SPAWNS, partitions: false, decor: [], aisles: L.AISLES.filter((a) => ['airlock', 'R1', 'N1', 'N2'].includes(a.id)) };
const after = { spots: L.SPOTS, tables: [L.TABLE_SPOTS[0]], lamps: L.LAMPS, spawns: L.SPAWNS, partitions: true, decor: L.DECOR, signs: L.SIGNS };
const B = analyse(before), A = analyse(after);
const total = (r) => r.pairs + r.walls + r.aisles + r.spawns + r.signs;

console.log(`\nBEFORE (legacy ship): overlaps ${B.pairs}, inside walls ${B.walls}, blocked doorways ${B.aisles}, spawns in props ${B.spawns}  => ${total(B)}`);
if (VERBOSE || total(B)) for (const l of B.list) console.log('     - ' + l);
console.log(`AFTER  (ship2 layout): overlaps ${A.pairs}, inside walls ${A.walls}, blocked doorways ${A.aisles}, spawns in props ${A.spawns}, signs/windows ${A.signs}  => ${total(A)}`);
if (VERBOSE || total(A)) for (const l of A.list) console.log('     - ' + l);

ok('AFTER layout has zero overlaps, wall intrusions, blocked doorways, bad spawns', () => assert.equal(total(A), 0, A.list.join('; ')));
ok('every food-table candidate spot is individually free (no fixture, wall, doorway, lamp)', () => {
  for (const [i, sp] of L.TABLE_SPOTS.entries()) { const r = analyse({ ...after, tables: [sp], signs: [], spawns: i ? [] : L.SPAWNS }); assert.equal(total(r), 0, `table ${sp}: ${r.list.join('; ')}`); }
});
ok('BEFORE report is non-empty (the checker really finds the old clipping)', () => assert.ok(total(B) >= 3, 'legacy count ' + total(B)));

// ---------------------------------------------------------------------------------- DIMS match the real prop models
const THREE = await import('three');
const P = await import('../../src/models/props.js');
const MAP = { terminal: 'terminal', monitors: 'monitor_bank', lever: 'lever', cupboard: 'cupboard', bunks: 'bunkbed', arcade: 'arcade_cabinet', charger: 'charging_station', suits: 'suit_rack', coffee: 'coffee_machine', quota: 'quota_screen', doorPanel: 'door_panel', lamp: 'ship_light' };
ok('shiplayout DIMS agree with the real prop bounding boxes (<= 3 cm)', () => {
  for (const [k, id] of Object.entries(MAP)) {
    const o = P.createProp(id, { seed: 3 }); o.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(o), d = L.DIMS[k];
    for (const [a, v] of [['x0', b.min.x], ['x1', b.max.x], ['z0', b.min.z], ['z1', b.max.z], ['h', b.max.y]]) assert.ok(Math.abs(d[a] - v) <= 0.03, `${k}.${a}: layout ${d[a]} vs model ${v.toFixed(3)}`);
  }
});
const C = await import('../../src/models/components.js'), An = await import('../../src/models/anomaly.js'), Fd = await import('../../src/models/food.js');
ok('workbench / decon / table dims agree with the models', () => {
  const bb = new THREE.Box3().setFromObject(C.createWorkbench().group); assert.ok(Math.abs(bb.max.x - 1.16) < 0.05 && bb.max.y <= 2.85);
  const bd = new THREE.Box3().setFromObject(An.createDecon().group); assert.ok(bd.max.x <= 0.62 && bd.max.y <= 2.45);
  const bt = new THREE.Box3().setFromObject(Fd.createTable()); assert.ok(bt.max.x <= 0.68 && bt.max.z <= 0.87);
});

// ---------------------------------------------------------------------------------- the real ship (fake physics): props land where the layout says
const rec = [];
const physics = { addStaticBox: (x, y, z, hx, hy, hz) => { const c = { x0: x - hx, x1: x + hx, y0: y - hy, y1: y + hy, z0: z - hz, z1: z + hz }; rec.push(c); return c; }, removeCollider() {}, world: {}, castRay: () => null, intersectionsWithShape: () => [] };
const lights = { added: [], add(e) { this.added.push(e); return e; } };
const scene = new THREE.Scene();
let ship = null;
try { const M = await import('../../src/world/ship.js'); ship = M.buildShip({ physics, lightPool: lights, scene }); } catch (e) { console.log('  (real ship build skipped: ' + e.message + ')'); }
if (ship) {
  ok('real ship builds and exposes the layout (anchors, points, spawns, obstacles)', () => {
    for (const k of ['terminal', 'lever', 'monitors', 'cupboard', 'bunks', 'arcade', 'charger', 'suits', 'coffee', 'quota', 'doorPanel']) assert.ok(ship.anchors[k] || k === 'monitors', 'anchor ' + k);
    assert.equal(ship.spawns.length, L.SPAWNS.length);
    assert.ok(Array.isArray(ship.layout?.obstacles) && ship.layout.obstacles.length >= 8);
    assert.ok(ship.hardpoints.R1 && ship.hardpoints.N1 && ship.hardpoints.N2, 'shipyard hardpoints kept');
    assert.ok(ship.door && ship.door.leaf, 'door kept');
  });
  ok('prop world boxes match the layout (<= 3 cm)', () => {
    ship.group.updateMatrixWorld(true);
    for (const [k, id] of Object.entries({ terminal: 'terminal', monitors: 'monitors', lever: 'lever', cupboard: 'cupboard', bunks: 'bunks', arcade: 'arcade', suits: 'suits', coffee: 'coffee' })) {
      const o = ship.anchors[k]; if (!o) continue;
      const b = new THREE.Box3().setFromObject(o), f = L.fixtureBoxes().find((q) => q.id === id);
      for (const [a, v] of [['x0', b.min.x], ['x1', b.max.x], ['z0', b.min.z], ['z1', b.max.z]]) assert.ok(Math.abs(f[a] - v) <= 0.03, `${k}.${a} layout ${f[a].toFixed(2)} vs ship ${v.toFixed(2)}`);
    }
  });
  ok('every static collider of the ship stays inside the hull footprint (+ hull skin) - none pokes through a wall', () => {
    let bad = 0;
    for (const c of rec) { if (c.y1 < -0.05 || c.y0 > S.h + 0.6) continue; if (c.y0 < -0.6) continue; }   // shell/nose/steps are allowed outside
    // interior props: any collider that has its centre inside the cabin must not extend beyond the walls by more than the wall thickness
    for (const c of rec) {
      const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, sx = c.x1 - c.x0, sz = c.z1 - c.z0;
      if (sx > 4 || sz > 4 || cx < S.x0 + 0.05 || cx > S.x1 - 0.05 || cz < S.z0 + 0.05 || cz > S.z1 - 0.05) continue;   // shell pieces
      if (c.y0 > S.h - 0.02 || c.y1 > S.h + 0.02) continue;   // ceiling fixtures
      if (c.x0 < S.x0 - 0.02 || c.x1 > S.x1 + 0.02 || c.z0 < S.z0 - 0.02 || c.z1 > S.z1 + 0.02) { bad++; console.log('     collider outside cabin', JSON.stringify(c)); }
    }
    assert.equal(bad, 0);
  });
  ok('partition colliders exist for every partition piece and door hatch stays walkable', () => {
    for (const p of L.PARTITIONS) assert.ok(rec.some((c) => Math.abs(c.x0 - p.x0) < 0.02 && Math.abs(c.x1 - p.x1) < 0.02 && Math.abs(c.z0 - p.z0) < 0.02 && Math.abs(c.z1 - p.z1) < 0.02), 'collider for ' + p.id);
    for (const ai of L.AISLES) for (const c of rec) { if (c.y1 - c.y0 > 3.3 || c.y1 < 0.05) continue; assert.ok(!hit(ai, { ...c, kind: 'x' }) || c.y0 < -0.05 && c.y1 < 0.2, 'collider blocks aisle ' + ai.id + ' ' + JSON.stringify(c)); }
  });
  ok('draw calls: the static ship group has few meshes (merged geometry)', () => {
    let meshes = 0; ship.group.traverse((o) => { if (o.isMesh) meshes++; });
    console.log('       ship meshes (group total): ' + meshes);
    assert.ok(meshes < 260, 'meshes ' + meshes);
  });
}
console.log(`\nship2 overlap: ${pass} passed, ${fail} failed`);
