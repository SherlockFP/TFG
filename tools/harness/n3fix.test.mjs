// QA night 3 fixes: melee rest pose keeps the head in frame, edge markers de-overlap, levrek morning weight. node tools/harness/n3fix.test.mjs
import assert from 'node:assert/strict';
import * as THREE from 'three';
const { createItemModel } = await import('../../src/models/items.js');
const { itemDef } = await import('../../src/game/items.js');
const { itemGeom, fitGrip, MELEE_TOP } = await import('../../src/game/fpbody_grip.js');
const { spreadMarkers } = await import('../../src/ui/docklayout.js');
const C = await import('../../src/game/soul_core.js');
let pass = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { process.exitCode = 1; console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n       ')); } };

const TAN = Math.tan(36 * Math.PI / 180);
ok('melee: shovel / stop sign / pipe / bat keep their whole head below the top of the frame', () => {
  for (const id of ['shovel', 'stopsign', 'pipe', 'machete', 'crowbar', 'bat']) {
    let inner; try { inner = createItemModel(id); } catch { continue; }
    if (!inner) continue;
    const root = new THREE.Group(); root.add(inner);
    const c = new THREE.Box3().setFromObject(inner).getCenter(new THREE.Vector3()); inner.position.sub(c); root.userData.gripOffset = c.clone();
    const g = itemGeom(root), f = fitGrip(g, itemDef(id) || { kind: 'weapon', hands: 1 }, id);
    if (f.cls !== 'melee') continue;
    const p = new THREE.Vector3(); let top = -9;
    for (let i = 0; i < g.pts.length; i += 3) { p.set(g.pts[i], g.pts[i + 1], g.pts[i + 2]).applyQuaternion(f.quat).add(f.pos).add(f.hand); if (p.z < -0.08) top = Math.max(top, p.y / (-p.z * TAN)); }
    assert.ok(top <= MELEE_TOP + 0.02, `${id} top ${top.toFixed(2)}`);
    assert.ok(f.pen < 0.006, `${id} pen ${f.pen}`);
  }
});

ok('spreadMarkers: two labels on one spot are stacked, a third far one hides, none sits over the hotbar', () => {
  const hb = { left: 683, right: 1250, top: 625 };
  const a = spreadMarkers([{ x: 1246, y: 630, d: 119 }, { x: 1246, y: 630, d: 192 }, { x: 1246, y: 630, d: 300 }, { x: 1246, y: 630, d: 400 }, { x: 1246, y: 630, d: 500 }], hb);
  const vis = a.filter((m) => !m.hide);
  assert.ok(vis.length >= 2 && vis.length < 5, 'visible ' + vis.length);
  for (const m of vis) assert.ok(m.y <= hb.top - 44 + 1e-9, 'over hotbar ' + m.y);
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) assert.ok(Math.abs(vis[i].y - vis[j].y) >= 40 || Math.abs(vis[i].x - vis[j].x) >= 74, 'overlap');
  const b = spreadMarkers([{ x: 34, y: 630, d: 61 }], hb);
  assert.ok(!b[0].hide && b[0].y === 630, 'left marker untouched');
});

ok('levrek: the morning palette weight is low (neutral-warm 8:00) and reaches the biome grade keys', () => {
  assert.ok(C.PALETTES.levrek.morn < 0.4 && C.PALETTES.levrek.morn > 0.1);
  assert.ok(C.GRADE_KEYS.includes('morn'));
  assert.ok(C.PALETTES.levrek.sat <= 1.12);
});

console.log(`n3fix: ${pass} ok`);
