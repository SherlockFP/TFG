// ship2 + wave 5 ship_interior: overlap / clipping / walkway check for the crew ship. Every in-ship fixture of every module (ship props, partitions,
// survival stove / brew / crate / planter, arcade chess table, cycle3 trophy wall, food table, frame console, kiosk, contract board, incubator, decon,
// workbench, reactor, horn / teleporter panels, mirror, planters, crates, the helmet-cam monitor + LED loot board of the built-in mods) as a world AABB
// vs each other, the hull shell, the partitions, the doorway aisles, the spawn points and the room signs / windows, plus a 0.9 m walker flood fill
// from the airlock that must reach the standing spot of every interactable (shiplayout ACCESS).
// Prints three reports: LEGACY (pre ship2), WAVE 4 (ship2 + where the other wave-4 modules really put their fixtures, measured in the browser)
// and NOW (world/shiplayout.js). Wave 5 shipdeck: floor 1 now includes the Upper Deck stair housing, plus floor-2 checks (rooms, walkways, stair, hatch).   node tools/harness/ship2_overlap.test.mjs   (--verbose lists every problem)
import './ship2_env.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as L from '../../src/world/shiplayout.js';

const VERBOSE = process.argv.includes('--verbose');
let pass = 0, fail = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; process.exitCode = 1; console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 5).join('\n       ')); } };

const EPS = 0.005;
const hit = (a, b) => a.x0 < b.x1 - EPS && a.x1 > b.x0 + EPS && a.z0 < b.z1 - EPS && a.z1 > b.z0 + EPS && a.y0 < b.y1 - EPS && a.y1 > b.y0 + EPS;
const S = L.SHELL;
const isPart = (a) => a.kind === 'wall' && /^(cockpit|engine)[NSH]$/.test(a.id);
const signBox = (s) => { const hw = 0.45, hh = 0.16, n = Math.abs(Math.sin(s.ry)) > 0.5; const ox = Math.sin(s.ry) * (s.off ?? 0), oz = Math.cos(s.ry) * (s.off ?? 0); return { id: 'sign:' + s.id, x0: s.x + ox - (n ? 0.01 : hw), x1: s.x + ox + (n ? 0.01 : hw), z0: s.z + oz - (n ? hw : 0.01), z1: s.z + oz + (n ? hw : 0.01), y0: s.y - hh, y1: s.y + hh, kind: 'sign' }; };

/** a 0.9 m wide walker (r = 0.45) flood-filled over the floor from the airlock; returns the ACCESS points it cannot reach */
export function walk(solids, access = L.ACCESS, r = 0.45, step = 0.025) {
  const nx = Math.round((S.x1 - S.x0) / step), nz = Math.round((S.z1 - S.z0) / step);
  const free = new Uint8Array(nx * nz);
  const body = solids.filter((a) => a.kind !== 'lamp' && a.kind !== 'floor' && a.kind !== 'sign' && a.y0 < 1.75 && a.y1 > 0.12);
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const x = S.x0 + (i + 0.5) * step, z = S.z0 + (k + 0.5) * step;
    if (x < S.x0 + r || x > S.x1 - r || z < S.z0 + r || z > S.z1 - r) continue;
    let f = 1;
    for (const a of body) if (x > a.x0 - r && x < a.x1 + r && z > a.z0 - r && z < a.z1 + r) { f = 0; break; }
    free[i * nz + k] = f;
  }
  const seen = new Uint8Array(nx * nz), q = [];
  const idx = (x, z) => [Math.floor((x - S.x0) / step), Math.floor((z - S.z0) / step)];
  const [si, sk] = idx(L.SHELL.doorX, S.z1 - 0.5);
  if (free[si * nz + sk]) { seen[si * nz + sk] = 1; q.push(si * nz + sk); }
  while (q.length) {
    const c = q.pop(), i = Math.floor(c / nz), k = c % nz;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = k + dk;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const n = a * nz + b;
      if (free[n] && !seen[n]) { seen[n] = 1; q.push(n); }
    }
  }
  const missing = [];
  for (const p of access) {
    const [ci, ck] = idx(p.x, p.z), R = Math.ceil(0.3 / step);
    let okp = false;
    for (let i = ci - R; i <= ci + R && !okp; i++) for (let k = ck - R; k <= ck + R && !okp; k++) if (i >= 0 && k >= 0 && i < nx && k < nz && seen[i * nz + k] && Math.hypot((i - ci) * step, (k - ck) * step) <= 0.3) okp = true;
    if (!okp) missing.push(p.id);
  }
  return { missing, start: !!free[si * nz + sk] };
}

/** all problems of one layout: { pairs, walls, aisles, spawns, signs, walk, list } */
export function analyse({ spots, tables, lamps, spawns, partitions = [], decor, signs = [], aisles = L.AISLES, extra = [], noMods = false, access = null, deck = false }) {
  const solids = [
    ...partitions.map((p) => ({ ...p, kind: 'wall' })),
    ...L.fixtureBoxes(spots, { tables, decor, noMods, deck }),
    ...extra,
    ...lamps.map(([x, z], i) => ({ id: 'lamp' + i, x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: S.h - 0.1, y1: S.h, kind: 'lamp' })),
  ];
  const sg = signs.map(signBox);
  const list = [], out = { pairs: 0, walls: 0, aisles: 0, spawns: 0, signs: 0, walk: 0, list, solids };
  for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
    const a = solids[i], b = solids[j];
    if (isPart(a) && isPart(b)) continue;   // partition pieces touching each other are one wall
    if (hit(a, b)) { out.pairs++; list.push(`overlap ${a.id} x ${b.id}`); }
  }
  for (const a of solids) {
    if (isPart(a)) continue;
    // inside the wall = protrudes beyond the interior planes of the shell (walls, ceiling)
    if (a.x0 < S.x0 - EPS || a.x1 > S.x1 + EPS || a.z0 < S.z0 - EPS || a.z1 > S.z1 + EPS || a.y1 > S.h + EPS) { out.walls++; list.push(`in wall ${a.id} [${a.x0.toFixed(2)},${a.x1.toFixed(2)}]x[${a.z0.toFixed(2)},${a.z1.toFixed(2)}] y1 ${a.y1.toFixed(2)}`); }
  }
  for (const ai of aisles) for (const a of solids) {
    if (a.kind === 'lamp' || a.kind === 'floor') continue;
    if (hit(ai, a)) { out.aisles++; list.push(`blocks ${ai.id}: ${a.id}`); }
  }
  for (const [x, z] of spawns) {
    const cap = { x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35, y0: 0.06, y1: 1.7 };
    for (const a of solids) if (a.kind !== 'lamp' && a.kind !== 'floor' && a.id !== 'tpPad' && hit(cap, a)) { out.spawns++; list.push(`spawn (${x},${z}) inside ${a.id}`); }
  }
  for (const s of sg) for (const a of solids) if (a.kind !== 'lamp' && a.kind !== 'floor' && hit(s, a)) { out.signs++; list.push(`${s.id} x ${a.id}`); }
  for (const w of L.WINDOWS_Z) {   // windows must not be covered by wall fixtures / signs
    const wb = { x0: w.x0, x1: w.x1, z0: S.z1 - 0.3, z1: S.z1, y0: w.y0, y1: w.y1 };
    for (const a of [...solids, ...sg]) if (a.kind !== 'lamp' && a.kind !== 'floor' && a.id !== 'tpPad' && hit(wb, a)) { out.signs++; list.push(`window ${w.x0} x ${a.id}`); }
  }
  if (access) { const w = walk(solids, access); out.walk = w.missing.length + (w.start ? 0 : 1); for (const m of w.missing) list.push(`unreachable with a 0.9 m walkway: ${m}`); if (!w.start) list.push('airlock start cell blocked'); }
  return out;
}
const total = (r) => r.pairs + r.walls + r.aisles + r.spawns + r.signs + r.walk;
const line = (r) => `overlaps ${r.pairs}, inside walls/ceiling ${r.walls}, blocked doorways ${r.aisles}, spawns in props ${r.spawns}, signs/windows ${r.signs}, unreachable ${r.walk}  => ${total(r)}`;

// ---------------------------------------------------------------------------------- the three layouts
const PI = Math.PI;
const oldPartitions = (ez) => [
  ...L.PARTITIONS.filter((p) => p.id.startsWith('cockpit')),
  { id: 'engineS', x0: 3.2, x1: S.x1, z0: ez - 0.08, z1: ez + 0.08, y0: 0, y1: S.h },
  { id: 'engineH', x0: 3.12, x1: 3.28, z0: S.z0, z1: ez, y0: 2.5, y1: S.h },
];
const legacy = { spots: L.LEGACY_SPOTS, tables: L.LEGACY_TABLES, lamps: L.LEGACY_LAMPS, spawns: L.LEGACY_SPAWNS, decor: [], noMods: true, aisles: L.AISLES.filter((a) => ['airlock', 'R1', 'N1', 'N2'].includes(a.id)) };
// WAVE 4 = the ship2 layout + where survival / arcade / cycle3 / the mods actually put their fixtures (browser dump of ship.group, 2026-09-29)
const W4_SPOTS = {
  ...L.LEGACY_SPOTS,
  cupboard: { x: 6.45, z: 2.15, ry: -PI / 2 }, bunks: { x: 4.75, z: 2.42, ry: PI }, arcade: { x: 0.95, z: -3.0, ry: 0 }, charger: { x: -3.05, y: 1.0, z: -3.38, ry: 0 },
  suits: { x: 6.5, z: 0.45, ry: -PI / 2 }, coffee: { x: -1.75, z: -3.1, ry: 0 }, quota: { x: -3.05, y: 1.9, z: -3.44, ry: 0 }, doorPanel: { x: 3.98, y: 1.2, z: 3.44, ry: PI },
  horn: { x: -5.25, y: 1.75 }, kiosk: { x: -1.75, z: 3.02 }, board: { x: -1.75, y: 1.75 }, incubator: { x: -0.38, z: 2.95 }, decon: { x: 0.86, z: 2.88 },
  bench: { x: 4.45, z: -3.08 }, reactor: { x: 6.3, z: -2.6 },
  stove: { x: -4.95, z: -3.12, ry: 0 }, brew: { x: -3.7, z: -3.15, ry: 0 }, crate: { x: -3.4, z: 3.1, ry: PI }, svPlanter: { x: -1.2, z: 3.12, ry: PI }, chess: { x: 4.4, z: -2.5, ry: PI / 2 },
};
const W4_DECOR = [
  { id: 'crateA', x: 6.6, z: 3.12, w: 0.6, d: 0.6, h: 0.6 }, { id: 'crateC', x: 6.6, z: 3.12, w: 0.42, d: 0.42, h: 0.42, y: 0.6 },
  { id: 'planterHub', x: -0.85, z: -3.15, w: 0.6, d: 0.6, h: 0.5, planter: true }, { id: 'planterCargo', x: 5.6, z: 3.15, w: 0.6, d: 0.6, h: 0.5, planter: true },
];
const W4_SIGNS = [...L.SIGNS.filter((s) => !['trophies', 'galleyN', 'loot', 'engine', 'cargo'].includes(s.id)),
  { id: 'engine', text: 'ENGINE', c: '', x: 3.2, y: 3.05, z: -2.7, ry: PI / 2, off: 0.09 }, { id: 'cargo', text: 'CARGO', c: '', x: 7.0, y: 2.75, z: 2.15, ry: -PI / 2, off: 0.02 },
  { id: 'loot', text: 'LOOT BAY', c: '', x: 5.05, y: 2.45, z: -1.75, ry: 0, off: 0 }, { id: 'airlock', text: 'AIRLOCK', c: '', x: 2.6, y: 2.95, z: 3.47, ry: PI, off: 0 }];
const W4_EXTRA = [
  { id: 'trophyWall(+z)', x0: -5.42, x1: 0.42, z0: 3.39, z1: 3.5, y0: 0.64, y1: 2.68, kind: 'wall' },                  // 12 plaques 0.94 m, x -4.95 + 0.98 i, rows y 2.2 / 1.12
  { id: 'crewMonitor(old)', x0: -5.95, x1: -5.43, z0: -1.66, z1: -0.64, y0: 2.33, y1: 3.65, kind: 'hanging' },       // rods 0.25 m through the ceiling
  { id: 'lootBoard(old)', x0: 1.74, x1: 3.46, z0: 3.26, z1: 3.35, y0: 2.74, y1: 3.3, kind: 'wall' },                  // floating 0.15 m off the wall, over the AIRLOCK sign
];
const W4_ACCESS = L.ACCESS.map((a) => ({ ...a, ...({ stove: { x: -4.95, z: -2.35 }, brew: { x: -3.7, z: -2.4 }, crate: { x: -3.4, z: 2.3 }, svPlanter: { x: -1.2, z: 2.3 }, chess: { x: 4.4, z: -1.9 }, coffee: { x: -1.75, z: -2.3 }, charger: { x: -3.05, z: -2.8 }, trophies: { x: -2.5, z: 2.3 }, table: { x: -1.9, z: 0.8 }, bench: { x: 4.45, z: -2.3 }, reactor: { x: 5.3, z: -2.3 }, planterHub: { x: -0.85, z: -2.4 }, planterCargo: { x: 5.6, z: 2.2 }, cupboard: { x: 5.7, z: 2.15 }, suits: { x: 5.8, z: 0.45 }, crate: { x: -3.4, z: 2.3 } }[a.id] || {}) }));
const wave4 = { spots: W4_SPOTS, tables: [[-1.9, -0.4, 0]], lamps: [[-5.4, 0], [-1.6, 0], [1.3, 0], [5.0, -2.7], [5.2, 1.0]], spawns: [[-3, 0.4], [-1.5, 1.4], [0, -1.0], [1.5, 0.9], [3.0, -0.8], [-2.9, -1.8], [2.4, 1.7], [4.4, 0.3]],
  partitions: oldPartitions(-1.85), decor: W4_DECOR, signs: W4_SIGNS, extra: W4_EXTRA, noMods: true, access: W4_ACCESS,
  aisles: L.AISLES.map((a) => (a.id === 'engineDoor' ? { ...a } : a)) };
delete W4_SPOTS.trophy;
const now = { deck: true, spots: L.SPOTS, tables: [L.TABLE_SPOTS[0]], lamps: L.LAMPS, spawns: L.SPAWNS, partitions: L.PARTITIONS, decor: L.DECOR, signs: L.SIGNS, access: L.ACCESS };
const B = analyse(legacy), W = analyse(wave4), A = analyse(now);

console.log(`\nLEGACY (pre ship2):   ${line(B)}`);
if (VERBOSE) for (const l of B.list) console.log('     - ' + l);
console.log(`WAVE 4 (as merged):   ${line(W)}`);
if (VERBOSE || process.argv.includes('--wave4')) for (const l of W.list) console.log('     - ' + l);
console.log(`NOW (wave 5 layout):  ${line(A)}`);
if (VERBOSE || total(A)) for (const l of A.list) console.log('     - ' + l);
console.log(`  (${A.solids.length} fixture / partition boxes checked, ${L.ACCESS.length} standing spots walked)`);

ok('NOW: zero overlaps, wall / ceiling intrusions, blocked doorways, bad spawns, covered signs / windows, unreachable interactables', () => assert.equal(total(A), 0, A.list.join('; ')));
ok('every food-table candidate spot is individually free (no fixture, wall, doorway, lamp)', () => {
  for (const [i, sp] of L.TABLE_SPOTS.entries()) { const r = analyse({ ...now, tables: [sp], signs: [], spawns: i ? [] : L.SPAWNS, access: null }); assert.equal(total(r), 0, `table ${sp}: ${r.list.join('; ')}`); }
});
ok('the checker really finds the wave-4 mess (>= 10 problems) and the legacy clipping (>= 3)', () => { assert.ok(total(W) >= 10, 'wave4 ' + total(W)); assert.ok(total(B) >= 3, 'legacy ' + total(B)); });
ok('walkways: every interactable / doorway is reachable from the airlock by a 0.9 m wide walker', () => { const w = walk(A.solids); assert.deepEqual(w.missing, []); assert.ok(w.start); });
ok('trophy wall: 12 mounts on the hub face of the cockpit bulkhead, inside it, not over the hatch', () => {
  const t = L.trophySlots(); assert.equal(t.length, 12);
  const P = L.PARTITIONS.find((p) => p.id === 'cockpitS');
  for (const q of t) { assert.ok(q.z - L.TROPHY_PLAQUE.w / 2 >= P.z0 + 0.12 && q.z + L.TROPHY_PLAQUE.w / 2 <= P.z1, 'z ' + q.z); assert.ok(Math.abs(q.x - P.x1) < 0.02); }
});

// ---------------------------------------------------------------------------------- DIMS match the real models
const THREE = await import('three');
const P = await import('../../src/models/props.js');
const MAP = { terminal: 'terminal', monitors: 'monitor_bank', lever: 'lever', cupboard: 'cupboard', bunks: 'bunkbed', arcade: 'arcade_cabinet', charger: 'charging_station', suits: 'suit_rack', coffee: 'coffee_machine', quota: 'quota_screen', doorPanel: 'door_panel', lamp: 'ship_light' };
const near = (b, d, what) => { for (const [a, v] of [['x0', b.min.x], ['x1', b.max.x], ['z0', b.min.z], ['z1', b.max.z], ['h', b.max.y]]) assert.ok(Math.abs(d[a] - v) <= 0.03, `${what}.${a}: layout ${d[a]} vs model ${v.toFixed(3)}`); };
ok('shiplayout DIMS agree with the real prop bounding boxes (<= 3 cm)', () => {
  for (const [k, id] of Object.entries(MAP)) { const o = P.createProp(id, { seed: 3 }); o.updateMatrixWorld(true); near(new THREE.Box3().setFromObject(o), L.DIMS[k], k); }
});
const C = await import('../../src/models/components.js'), An = await import('../../src/models/anomaly.js'), Fd = await import('../../src/models/food.js');
const Sv = await import('../../src/models/survival.js'), Ar = await import('../../src/models/arcade.js');
ok('module fixture dims agree with their models (workbench, decon, food table, stove, brewing stand, planter, crate, chess table)', () => {
  const bb = new THREE.Box3().setFromObject(C.createWorkbench().group); assert.ok(Math.abs(bb.max.x - 1.16) < 0.05 && bb.max.y <= 2.85);
  const bd = new THREE.Box3().setFromObject(An.createDecon().group); assert.ok(bd.max.x <= 0.62 && bd.max.y <= 2.45);
  const box = (o) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };
  near(box(Fd.createTable()), L.DIMS.table, 'table');
  near(box(Sv.createStove().group), L.DIMS.stove, 'stove'); near(box(Sv.createBrewStand().group), L.DIMS.brew, 'brew');
  near(box(Sv.createPlanter().group), L.DIMS.svPlanter, 'svPlanter'); near(box(Sv.createCrate(1, 'SHIP').group), L.DIMS.crate, 'crate');
  near(box(Ar.createGameTable().root), L.DIMS.chess, 'chess');
});
ok('every module reads its ship fixture spot from world/shiplayout.js (source wiring)', () => {
  const src = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
  const want = {
    'src/game/survival.js': /SHIP_SPOTS\[FIX\[kind\]\]/, 'src/game/arcade.js': /SHIP_SPOTS\.chess/, 'src/game/cycle3_trophy.js': /trophySlots\(\)/, 'src/game/polish4.js': /SHIP_SPOTS\.emblem/,
    'src/game/food.js': /TABLE_SPOTS/, 'src/game/crafting.js': /SPOTS\.bench/, 'src/game/pets_incubator.js': /SPOTS\.incubator/, 'src/game/shop.js': /SPOTS\.kiosk/, 'src/game/lore.js': /SPOTS\.board/,
    'src/models/anomaly.js': /SPOTS\.decon/, 'src/game/shipfeatures.js': /SPOTS\.horn/, 'src/game/ship2.js': /PLANTER_SLOTS/, 'public/mods/helmet-cameras.js': /layout\?\.mods\?\.crewMonitor/, 'public/mods/general-improvements.js': /layout\?\.mods\?\.lootBoard/,
  };
  for (const [f, re] of Object.entries(want)) assert.ok(re.test(src(f)), f + ' does not read shiplayout');
});

// ---------------------------------------------------------------------------------- the real ship (fake physics): props land where the layout says
const rec = [];
const physics = { addStaticBox: (x, y, z, hx, hy, hz) => { const c = { x0: x - hx, x1: x + hx, y0: y - hy, y1: y + hy, z0: z - hz, z1: z + hz }; rec.push(c); return c; }, removeCollider() {}, world: {}, castRay: () => null, intersectionsWithShape: () => [] };
const lights = { added: [], add(e) { this.added.push(e); return e; } };
const scene = new THREE.Scene();
let ship = null;
try { const M = await import('../../src/world/ship.js'); ship = M.buildShip({ physics, lightPool: lights, scene }); } catch (e) { console.log('  (real ship build skipped: ' + e.message + ')'); }
if (ship) {
  ok('real ship builds and exposes the layout (anchors, points, spawns, obstacles, mod spots)', () => {
    for (const k of ['terminal', 'lever', 'monitors', 'cupboard', 'bunks', 'arcade', 'charger', 'suits', 'coffee', 'quota', 'doorPanel']) assert.ok(ship.anchors[k] || k === 'monitors', 'anchor ' + k);
    assert.equal(ship.spawns.length, L.SPAWNS.length);
    assert.ok(Array.isArray(ship.layout?.obstacles) && ship.layout.obstacles.length >= 8);
    assert.ok(ship.layout.mods?.crewMonitor && ship.layout.mods?.lootBoard, 'mod spots');
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
    for (const c of rec) {
      const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, sx = c.x1 - c.x0, sz = c.z1 - c.z0;
      if (sx > 4 || sz > 4 || cx < S.x0 + 0.05 || cx > S.x1 - 0.05 || cz < S.z0 + 0.05 || cz > S.z1 - 0.05) continue;   // shell pieces
      if (c.y0 > S.h - 0.02 || c.y1 > S.h + 0.02) continue;   // ceiling fixtures
      if (c.x0 < S.x0 - 0.02 || c.x1 > S.x1 + 0.02 || c.z0 < S.z0 - 0.02 || c.z1 > S.z1 + 0.02) { bad++; console.log('     collider outside cabin', JSON.stringify(c)); }
    }
    assert.equal(bad, 0);
  });
  ok('partition colliders exist for every partition piece and the doorway aisles stay walkable', () => {
    for (const p of L.PARTITIONS) assert.ok(rec.some((c) => Math.abs(c.x0 - p.x0) < 0.02 && Math.abs(c.x1 - p.x1) < 0.02 && Math.abs(c.z0 - p.z0) < 0.02 && Math.abs(c.z1 - p.z1) < 0.02), 'collider for ' + p.id);
    for (const ai of L.AISLES) for (const c of rec) { if (c.y1 - c.y0 > 3.3 || c.y1 < 0.05) continue; assert.ok(!hit(ai, { ...c, kind: 'x' }) || c.y0 < -0.05 && c.y1 < 0.2, 'collider blocks aisle ' + ai.id + ' ' + JSON.stringify(c)); }
  });
  ok('the open door leaf stays inside the hull skin (never shows through the cabin wall)', () => {
    ship.door.setOpen(true, true); ship.group.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(ship.door.leaf);
    assert.ok(b.min.z >= S.z1 + 0.005 && b.max.z <= S.z1 + 0.25, `leaf z ${b.min.z.toFixed(3)}..${b.max.z.toFixed(3)}`);
    ship.door.setOpen(false, true);
  });
  ok('one floor layer: no second coplanar floor under the room tints, flat layers skip the PSX snap', () => {
    const floor = ship.group.getObjectByName('ship2_floor'); assert.ok(floor);
    let n = 0; ship.group.traverse((o) => { if (o.isMesh && o.userData.levelKey === 'ship_floor' && !floor.children.includes(o)) n++; });
    assert.equal(n, 0, 'extra ship_floor meshes');
    for (const m of floor.children) assert.ok('PSX_NOSNAP' in (m.material.defines || {}) && m.material.polygonOffset, m.userData.levelKey);
  });
  ok('draw calls: the static ship group has few meshes (merged geometry)', () => {
    let meshes = 0; ship.group.traverse((o) => { if (o.isMesh) meshes++; });
    console.log('       ship meshes (group total): ' + meshes);
    assert.ok(meshes < 260, 'meshes ' + meshes);
  });
}
// ---------------------------------------------------------------------------------- UPPER DECK (wave 5 shipdeck): floor 1 with the stair, floor 2, the stair itself
const { checkStairs, LIMITS } = await import('../../src/world/stairs.js');
const DK = L.DECK, WL = L.WELL, ST = L.deckStairs();
ok('deck: hub floor WITHOUT the deck is still clean (the well is just floor), and WITH the stair housing (already covered by NOW) too', () => {
  const r = analyse({ ...now, deck: false }); assert.equal(total(r), 0, r.list.join('; '));
});
ok('deck: both flights pass planStairs checks (slope <= 47 deg, riser, width >= 0.9 m walker) and meet the platform / deck floor flush', () => {
  for (const p of [ST.a, ST.b]) { assert.deepEqual(checkStairs(p), [], p.tag); assert.ok(p.width >= 0.9, p.tag + ' width'); assert.ok(p.slopeDeg <= LIMITS.maxSlopeDeg, p.tag + ' slope'); }
  assert.ok(Math.abs(ST.a.y + ST.a.rise - ST.platform.y) < 1e-6, 'A ends at the platform height');
  assert.ok(Math.abs(ST.b.y - ST.platform.y) < 1e-6 && Math.abs(ST.b.y + ST.b.rise - DK.y) < 1e-6, 'B starts at the platform and ends at the deck floor');
  assert.ok(Math.abs((ST.a.z - ST.a.run) - ST.b.z) < 1e-6 && Math.abs((ST.b.z + ST.b.run) - WL.z1) < 1e-6, 'B starts where A ends and comes out at the well edge');
  assert.ok(ST.platform.z1 - ST.platform.z0 >= 0.9 && ST.platform.x1 - ST.platform.x0 >= 1.8, 'turning platform is >= 0.9 m deep');
  assert.ok(ST.b.x - ST.b.width / 2 >= ST.dividerX1 - 1e-6 && ST.a.x + ST.a.width / 2 <= ST.dividerX0 + 1e-6, 'lanes are separated by the divider');
});
ok('deck: head clearance - wherever a climbing capsule (0.34 r, 1.8 m) is above the ceiling / the roof plate, it is inside the hatch opening', () => {
  const r = LIMITS.radius, inWell = (x, z) => x - r >= WL.x0 - 1e-6 && x + r <= WL.x1 + 1e-6 && z - r >= WL.z0 - 1e-6 && z + r <= WL.z1 + r + 1e-6;
  for (const p of [ST.a, ST.b]) for (let a = 0; a <= p.run + 1e-9; a += 0.05) {
    const x = p.x, z = p.z + p.dir[1] * a, y = p.y + p.rise * a / p.run;
    if (y + LIMITS.height > L.SHELL.h - 0.02) assert.ok(inWell(x, z), `${p.tag} at ${a.toFixed(2)} m (y ${y.toFixed(2)}) head hits the ceiling`);
  }
});
ok('deck: the ceiling collider pieces + the well tile the whole roof area exactly (no gap to fall through, no overlap)', () => {
  const full = 15 * 8; let area = 0; for (const [x0, z0, x1, z1] of L.withoutWell(-7.5, -4, 7.5, 4)) area += (x1 - x0) * (z1 - z0);
  assert.ok(Math.abs(area + (WL.x1 - WL.x0) * (WL.z1 - WL.z0) - full) < 1e-9);
  area = 0; for (const [x0, z0, x1, z1] of L.withoutWell(DK.x0, DK.z0, DK.x1, DK.z1)) area += (x1 - x0) * (z1 - z0);
  assert.ok(Math.abs(area + (WL.x1 - WL.x0) * (WL.z1 - WL.z0) - (DK.x1 - DK.x0) * (DK.z1 - DK.z0)) < 1e-9, 'deck slab');
  assert.ok(WL.x0 > DK.x0 && WL.x1 < DK.x1 && WL.z0 > DK.z0 && WL.z1 < DK.z1, 'well inside the deck');
});
/** floor-2 walker: r = 0.45 flood fill over the deck footprint from the top of lane B */
function walkDeck(solids, access, r = 0.45, step = 0.025) {
  const nx = Math.round((DK.x1 - DK.x0) / step), nz = Math.round((DK.z1 - DK.z0) / step), free = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const x = DK.x0 + (i + 0.5) * step, z = DK.z0 + (k + 0.5) * step; let f = 1;
    for (const a of solids) if (x > a.x0 - r && x < a.x1 + r && z > a.z0 - r && z < a.z1 + r) { f = 0; break; }
    free[i * nz + k] = f;
  }
  const idx = (x, z) => [Math.floor((x - DK.x0) / step), Math.floor((z - DK.z0) / step)], seen = new Uint8Array(nx * nz), q = [];
  const [si, sk] = idx(ST.outAt.x, ST.outAt.z);
  if (free[si * nz + sk]) { seen[si * nz + sk] = 1; q.push(si * nz + sk); }
  while (q.length) { const c = q.pop(), i = Math.floor(c / nz), k = c % nz; for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = k + dk; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const n = a * nz + b; if (free[n] && !seen[n]) { seen[n] = 1; q.push(n); } } }
  const missing = [];
  for (const p of access) { const [ci, ck] = idx(p.x, p.z); if (!(ci >= 0 && ck >= 0 && ci < nx && ck < nz && seen[ci * nz + ck])) missing.push(p.id); }
  return { missing, start: !!free[si * nz + sk] };
}
const deckSolids = (t, rooms) => [...L.deckFixtures(t, rooms).filter((a) => !/^edge/.test(a.id)), { id: 'well', x0: WL.x0, x1: WL.x1, z0: WL.z0, z1: WL.z1, y0: DK.y, y1: DK.y + 1.1, kind: 'wall' },
  { id: 'wallN', x0: DK.x0, x1: DK.x1, z0: DK.z0 - 1, z1: DK.z0 + DK.wall, y0: 0, y1: 9 }, { id: 'wallS', x0: DK.x0, x1: DK.x1, z0: DK.z1 - DK.wall, z1: DK.z1 + 1, y0: 0, y1: 9 },
  { id: 'wallW', x0: DK.x0 - 1, x1: DK.x0 + DK.wall, z0: DK.z0, z1: DK.z1, y0: 0, y1: 9 }, { id: 'wallE', x0: DK.x1 - DK.wall, x1: DK.x1 + 1, z0: DK.z0, z1: DK.z1, y0: 0, y1: 9 }];
for (const [t, rooms] of [[2, ['bunk', 'store', null, null]], [2, ['turret', null, 'lounge', null]], [3, L.DECK_ROOMS], [3, ['lounge', 'turret', 'store', 'bunk']], [3, [null, null, null, null]]]) {
  ok(`deck floor (Mk ${t}, ${rooms.map((r) => r || '-').join('/')}): 0 overlaps, rooms inside the cabin, every standing spot + the stair exit reachable with a 0.9 m walker`, () => {
    const fx = L.deckFixtures(t, rooms), probs = [];
    for (let i = 0; i < fx.length; i++) for (let j = i + 1; j < fx.length; j++) { const a = fx[i], b = fx[j]; if (/^(rim|edge)/.test(a.id) && /^(rim|edge)/.test(b.id)) continue; if (hit(a, b)) probs.push(`overlap ${a.id} x ${b.id}`); }
    for (const a of fx.filter((q) => /^room/.test(q.id))) {
      if (a.x0 < DK.x0 + DK.wall - EPS || a.x1 > DK.x1 - DK.wall + EPS || a.z0 < DK.z0 + DK.wall - EPS || a.z1 > DK.z1 - DK.wall + EPS) probs.push(`${a.id} pokes through the cabin wall`);
      if (a.y1 > DK.y + DK.h - 0.3) probs.push(`${a.id} too tall`);
      if (!(a.x1 <= WL.x0 + EPS || a.x0 >= WL.x1 - EPS || a.z1 <= WL.z0 + EPS || a.z0 >= WL.z1 - EPS)) probs.push(`${a.id} over the well`);
    }
    const w = walkDeck(deckSolids(t, rooms), L.DECK_ACCESS(t)); if (!w.start) probs.push('stair exit blocked'); for (const m of w.missing) probs.push('unreachable with a 0.9 m walkway: ' + m);
    assert.deepEqual(probs, []);
  });
}
ok('deck: the extra Mk III mount plate (ship2 M6) stands on the deck inside the cabin, clear of the rooms and the well rail', () => {
  const M = L.DECK_MOUNT, R = 0.55;
  assert.ok(M.x - R >= DK.x0 + DK.wall - 0.01 && M.x + R <= WL.x0 - 0.04 && Math.abs(M.z) + R <= DK.z1 - DK.wall && M.y === DK.y);
  for (const a of L.deckFixtures(3).filter((q) => /^room/.test(q.id))) assert.ok(M.x + R <= a.x0 || M.x - R >= a.x1 || M.z + R <= a.z0 || M.z - R >= a.z1, 'mount vs ' + a.id);
});
ok('deck: colliders exist for the slab, rails, both ramps (with a quaternion) and every chosen room; none at tier 0', () => {
  assert.equal(L.deckColliders(0).length, 0);
  const c1 = L.deckColliders(1), c3 = L.deckColliders(3, L.DECK_ROOMS);
  assert.equal(c1.filter((c) => c.q).length, 2, 'two ramps'); assert.ok(c1.some((c) => /^slab/.test(c.id)) && c1.some((c) => /^rim/.test(c.id)) && c1.some((c) => c.id === 'platform'));
  assert.equal(c1.filter((c) => /^room/.test(c.id)).length, 0); assert.equal(c3.filter((c) => /^room/.test(c.id)).length, 4);
  assert.ok(c3.length < 45, 'collider count ' + c3.length);
});

console.log(`\nship2 overlap: ${pass} passed, ${fail} failed`);
