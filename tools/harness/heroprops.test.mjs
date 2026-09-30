// Hero props + horror-safe loot glint + route card label (wave 8, docs/wave8/heroprops.md): node tools/harness/heroprops.test.mjs
import assert from 'node:assert/strict';
const cv = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }), style: {}, addEventListener() {} });
globalThis.document = { createElement: () => cv(), body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, getElementById: () => null };
globalThis.window = globalThis; globalThis.localStorage = { getItem: () => null, setItem() {} };
try { globalThis.navigator = { userAgent: 'node' }; } catch { /* read-only */ }
globalThis.OffscreenCanvas = class { constructor() { return cv(); } };
const THREE = await import('three');
const A = await import('../../src/models/artpass.js');
const GL = await import('../../src/game/lootglint.js');
const { MOONS } = await import('../../src/game/moons.js');
const { interiorName } = await import('../../src/ui/hud.js');
let fail = 0;
const ok = (n, fn) => { try { fn(); console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n    ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n    ')); } };
const tris = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };
const size = (o) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());

ok('hero props: real models (not the old 5-box placeholders), bulky sizes kept, pipe stays a tool with a tip', () => {
  for (const [id, min] of [['cy_vending', 300], ['cy_rack', 300], ['cy_statue', 250]]) {
    const o = A.createArtModel(id), s = size(o);
    assert.ok(tris(o) >= min && tris(o) <= 1600, `${id} tris ${tris(o)}`);
    assert.ok(s.y > 0.85 && s.y < 1.1 && s.x < 0.75 && s.z < 0.6, `${id} size ${s.x} ${s.y} ${s.z}`);   // old boxes: ~0.5 x 0.9 x 0.4
  }
  const p = A.createArtModel('pipe'), b = new THREE.Box3().setFromObject(p);
  assert.equal(p.userData.kind, 'tool'); assert.ok(p.userData.tip && p.userData.tip.position.z < -0.5, 'tip'); assert.ok(b.min.z < -0.5 && b.max.z > 0.1 && b.max.z < 0.25, `pipe z ${b.min.z} ${b.max.z}`);
});
ok('glint: periodic flash (on ~0.5 s, off otherwise), rarer = faster, both ranges gated by line of sight', () => {
  let on = 0; for (let t = 0; t < 4; t += 0.05) if (GL.glintFlash(t, 0.3, 4) > 0.01) on++;
  assert.ok(on >= 8 && on <= 12, 'on frames ' + on);
  assert.ok(GL.GLINT.mythic.period < GL.GLINT.rare.period);
  assert.deepEqual(GL.glintVisibility(5, true), { star: true, ring: true });
  assert.deepEqual(GL.glintVisibility(10, true), { star: true, ring: false });
  assert.deepEqual(GL.glintVisibility(3, false), { star: false, ring: false });
  assert.deepEqual(GL.glintVisibility(40, true), { star: false, ring: false });
});
ok('glint set: small star on the item, ring only close + in LOS, follows / cleans up, no lights', () => {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(); cam.position.set(0, 1.6, 0);
  const obj = new THREE.Group(); obj.position.set(0, 0.2, -3); scene.add(obj);
  const it = { id: 'x1', state: 'world', obj, size: { y: 0.3 } };
  let blocked = false;
  const game = { scene, camera: cam, items: { get: (id) => (id === 'x1' ? it : null) }, physics: { raycast: () => (blocked ? { info: {} } : null) } };
  const g = GL.createGlints(game); g.add('x1', 0x3d8bff, 'rare'); assert.equal(g.size, 1);
  const grp = () => scene.children.find((c) => c !== obj);
  for (let i = 0; i < 60; i++) g.update(0.05);
  assert.ok(grp().children[1].visible, 'ring within 6 m with LOS');
  blocked = true; for (let i = 0; i < 20; i++) g.update(0.05);
  assert.ok(!grp().children[1].visible && !grp().children[0].visible, 'nothing through a wall');
  blocked = false; obj.position.z = -10; for (let i = 0; i < 20; i++) g.update(0.05);
  assert.ok(!grp().children[1].visible, 'no ring at 10 m');
  let maxStar = 0; for (let i = 0; i < 200; i++) { g.update(0.05); if (grp().children[0].visible) maxStar = Math.max(maxStar, grp().children[0].scale.x); }
  assert.ok(maxStar > 0.05 && maxStar < 0.5, 'small star ' + maxStar);
  let lights = 0; scene.traverse((o) => { if (o.isLight) lights++; }); assert.equal(lights, 0);
  it.state = 'held'; g.update(0.5); assert.equal(g.size, 0); g.dispose();
});
ok('route card: 56K-Dialup names its real place, not the generic Data Center', () => {
  assert.equal(interiorName(MOONS.hamsi), 'Abandoned Web Host');
  assert.equal(interiorName({ interior: 'factory' }), 'Data Center');
});
process.exit(fail ? 1 : 0);
