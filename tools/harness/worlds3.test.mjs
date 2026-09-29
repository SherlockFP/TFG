// WORLDS3 (wave 8) pure-node test:  node tools/harness/worlds3.test.mjs
//  1. wrong-door odds: guaranteed day 1 / every 3rd day, ~48 % overall, seeded; day-1 door is always Level 0; every world reachable on tier 3, tier 1 stays gentle
//  2. size classes: tier 1 never 'large', all three classes appear on tier 3, deterministic
//  3. facility set dressing over many layouts: every prop on plain walkable floor, no overlaps, nothing near avoid spots, and after the props
//     block the nav grid every sub-cell that was reachable from the entrance and is still walkable is STILL reachable
//  4. themed pocket dressing: deterministic, one prop per cell max, props sit on solid WALL edges, keep the landing cell / EXIT clear,
//     and the pocket nav grid keeps spawn -> EXIT reachable
//  5. i18n: every string in worlds3_text.js has EN key + TR + RU value; theme fields + item names / tips are covered
import { generateLayout, INTERIOR_THEMES } from '../../src/world/facility.js';
import { NavGrid } from '../../src/world/nav.js';
import { navClear } from '../../src/world/interiors/common.js';
import { generatePocket, pocketKey } from '../../src/world/backrooms_plan.js';
import { RNG } from '../../src/core/rng.js';
import { THEMES, THEME_IDS, W3_ITEMS, KINDS, POCKET_KINDS, doorChance, doorTheme, sizeClassFor, planDressing, planPocketDressing } from '../../src/game/worlds3_core.js';
import { TR, RU } from '../../src/game/worlds3_text.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; if (fails < 30) console.log('FAIL', m); } };

// ---- 1. door odds / themes
ok(doorChance(1, undefined) === 1 && doorChance(4, undefined) === 1 && doorChance(7, undefined) === 1, 'day 1/4/7 guaranteed');
ok(doorChance(2, undefined) === 0.22 && doorChance(3, undefined) === 0.22, 'other days 22 %');
ok(doorChance(2, 1) === 1, 'moon override 1 = always (Level 0 moon)');
let expect = 0; for (let d = 1; d <= 300; d++) expect += doorChance(d);
ok(expect / 300 > 0.45 && expect / 300 < 0.52, 'overall door rate in 45-52 % (' + (expect / 300).toFixed(3) + ')');
for (let s = 0; s < 200; s++) ok(doorTheme(s * 7919, 1, 'hamsi', 1) === 'l0', 'day-1 door is Level 0');
const seen3 = new Set(), seen1 = new Set();
for (let s = 0; s < 800; s++) { seen3.add(doorTheme(s * 104729, 2 + (s % 9), 'cipura', 3)); seen1.add(doorTheme(s * 104729, 2 + (s % 9), 'hamsi', 1)); }
ok(THEME_IDS.every((id) => seen3.has(id)), 'all six worlds reachable on tier 3: ' + [...seen3]);
ok(!seen1.has('fun') && !seen1.has('asylum'), 'tier 1 never opens onto Level Fun / Ward 13');
ok(doorTheme(5, 6, 'lufer', 2) === doorTheme(5, 6, 'lufer', 2), 'door theme deterministic');

// ---- 2. size classes
const sc1 = new Set(), sc3 = new Set();
for (let s = 0; s < 400; s++) { sc1.add(sizeClassFor(s * 31337, 'hamsi', 1).cls); sc3.add(sizeClassFor(s * 31337, 'cipura', 3).cls); }
ok(!sc1.has('large') && sc1.has('small') && sc1.has('medium'), 'tier 1: small/medium only');
ok(sc3.has('small') && sc3.has('medium') && sc3.has('large'), 'tier 3: all classes');
ok(sizeClassFor(9, 'x', 2).mul === sizeClassFor(9, 'x', 2).mul, 'size class deterministic');

// ---- 3. facility dressing
const overlap = (a, b, pad = 0) => a.x0 - pad < b.x1 && a.x1 + pad > b.x0 && a.z0 - pad < b.z1 && a.z1 + pad > b.z0;
const themes = INTERIOR_THEMES.filter((t) => !['backrooms', 'sewer', 'mineshaft'].includes(t));
let layouts = 0, props = 0, roomsWith = 0, roomsAll = 0;
for (const theme of themes) for (const size of [0.8, 1.3, 2.0]) for (let s = 0; s < 14; s++) {
  const seed = (s * 2654435761 + 977 + Math.round(size * 1000)) >>> 0;
  const L = generateLayout(seed, theme, size);
  const nav = new NavGrid(L, 1);
  const ent = L.rooms.find((r) => r.type === 'entrance') || L.rooms[0];
  const before = nav.distanceField(ent.cx * L.cell + L.ox + L.cell / 2, ent.cz * L.cell + L.oz + L.cell / 2, 1e5);
  const avoid = [{ x: L.ox + ent.cx * L.cell + 2, z: L.oz + ent.cz * L.cell + 2, r: 3 }];
  const plan = planDressing(L, new RNG((L.seed ^ 0x3d55a1) >>> 0), { clear: (x0, z0, x1, z1) => navClear(nav, x0, z0, x1, z1, 0), avoid });
  const again = planDressing(L, new RNG((L.seed ^ 0x3d55a1) >>> 0), { clear: (x0, z0, x1, z1) => navClear(nav, x0, z0, x1, z1, 0), avoid });
  const tag = `${theme} size=${size} seed=${seed}`;
  ok(JSON.stringify(plan) === JSON.stringify(again), 'deterministic ' + tag);
  layouts++; props += plan.length;
  const solid = plan.filter((p) => KINDS[p.kind].solid);
  for (const p of plan) {
    ok(navClear(nav, p.rect.x0, p.rect.z0, p.rect.x1, p.rect.z1, 0), 'prop on plain floor ' + tag + ' ' + p.kind);
    ok(!avoid.some((a) => overlap(p.rect, { x0: a.x - a.r, x1: a.x + a.r, z0: a.z - a.r, z1: a.z + a.r })), 'prop clear of avoid spots ' + tag);
  }
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) ok(!overlap(solid[i].rect, solid[j].rect), 'no overlapping solid props ' + tag);
  for (const p of solid) nav.blockBox(p.rect.x0, p.rect.z0, p.rect.x1, p.rect.z1, 0.05);
  const after = nav.distanceField(ent.cx * L.cell + L.ox + L.cell / 2, ent.cz * L.cell + L.oz + L.cell / 2, 1e5);
  let lost = 0;
  for (let i = 0; i < after.length; i++) if (before[i] < Infinity && nav.walk[i] === 1 && after[i] === Infinity) lost++;
  ok(lost === 0, `props never cut the level (${lost} cells cut) ${tag}`);
  const withProps = new Set(plan.map((p) => p.room));
  for (const r of L.rooms) if (['office', 'storage', 'breakroom', 'security', 'lab', 'maintenance', 'lockers'].includes(r.type)) { roomsAll++; if (withProps.has(r.id)) roomsWith++; }
}
ok(props / layouts > 6, 'facilities are actually dressed (avg ' + (props / layouts).toFixed(1) + ' props per layout)');
ok(roomsWith / Math.max(1, roomsAll) > 0.6, 'most dressable rooms get a prop (' + roomsWith + '/' + roomsAll + ')');

// ---- 4. pocket dressing
let pocketProps = 0;
for (const th of THEME_IDS) for (let k = 1; k <= 25; k++) {
  const P = generatePocket(pocketKey(k * 977, k % 9, k % 3));
  const a = planPocketDressing(P, new RNG(k * 13 + 1), th), b = planPocketDressing(P, new RNG(k * 13 + 1), th);
  ok(JSON.stringify(a) === JSON.stringify(b), `pocket dressing deterministic ${th} ${k}`);
  if (th === 'l0') { ok(a.length === 0, 'Level 0 keeps its own dressing'); continue; }
  pocketProps += a.length;
  const cells = new Set(a.map((p) => p.cell));
  ok(cells.size === a.length, 'one prop per cell');
  ok(!cells.has(P.spawnCell), 'landing cell clear');
  for (const p of a) {
    const near = Math.hypot(p.x - P.exit.x, p.z - P.exit.z);
    ok(near > 2.4, `EXIT clear (${near.toFixed(1)} m) ${th} ${k}`);
    ok(POCKET_KINDS[p.kind], 'known pocket kind ' + p.kind);
  }
  const nav = new NavGrid(P.layout, 1);
  const from = { x: P.spawn.x, z: P.spawn.z };
  const before = nav.distanceField(from.x, from.z, 1e5);
  for (const p of a) if (POCKET_KINDS[p.kind].solid) nav.blockBox(p.rect.x0, p.rect.z0, p.rect.x1, p.rect.z1, 0.05);
  const after = nav.distanceField(from.x, from.z, 1e5);
  let lost = 0;
  for (let i = 0; i < after.length; i++) if (before[i] < Infinity && nav.walk[i] === 1 && after[i] === Infinity) lost++;
  ok(lost === 0, `pocket props never cut the maze (${lost}) ${th} ${k}`);
  const [gx, gz] = nav.toGrid(P.exit.x + P.exit.nx * 0.8, P.exit.z + P.exit.nz * 0.8);
  ok(after[gz * nav.w + gx] < Infinity, `spawn -> EXIT still reachable ${th} ${k}`);
}
ok(pocketProps > 300, 'pockets get props (' + pocketProps + ')');

// ---- 5. i18n
const strings = new Set();
for (const id of THEME_IDS) { const T = THEMES[id]; strings.add(T.title); strings.add(T.sub); strings.add(T.hint); }
for (const it of W3_ITEMS) { strings.add(it.name); strings.add(it.tip); }
for (const s of strings) {
  if (s === 'LEVEL 0' || s === '"The Lobby"') continue;   // already translated by backrooms.js
  ok(TR[s] && TR[s] !== s, 'TR missing: ' + s);
  ok(RU[s] && RU[s] !== s, 'RU missing: ' + s);
}
ok(Object.keys(TR).length === Object.keys(RU).length, 'TR and RU have the same keys');
for (const it of W3_ITEMS) ok(it.box.length >= 2 && it.value[0] < it.value[1], 'item ' + it.id);
ok(W3_ITEMS.some((i) => i.id === 'w3_wardkey'), 'ward key item');

console.log(fails ? `\n${fails} FAILED` : `\nworlds3: all ok (${layouts} layouts, ${props} facility props, ${pocketProps} pocket props)`);
process.exit(fails ? 1 : 0);
