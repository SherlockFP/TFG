// [expedfix] node test: the three expedition maps stay small (vertices, meshes, canvas textures), free what they own on dispose, and read as designed
// (barge fog thin above water + wreck silhouettes, roof ad textures shared / power-of-two).   node tools/harness/expedfix.test.mjs
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent("export async function load(u, c, n) { if (u.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return n(u, c); }"));
globalThis.window = globalThis;
console.warn = console.error = () => {};
globalThis.addEventListener = globalThis.removeEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;
const cvs = [];
const cv = () => { const o = cv0(); cvs.push(o); return o; };
const cv0 = () => ({ width: 0, height: 0, style: {}, querySelector: () => cv(), querySelectorAll: () => [], children: [], insertBefore() {}, appendChild() {}, append() {}, remove() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }) });
globalThis.document = { createElement: () => cv(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, activeElement: null, documentElement: { dataset: {} } };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const THREE = await import('three');
const K = await import('../../src/game/expeditions_core.js');
const { MOONS, BIOMES } = await import('../../src/game/moons.js');
await import('../../src/game/expeditions.js');
const { buildExpeditionMap } = await import('../../src/world/expeditions_maps.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const boxes = [];
const physics = { addStaticBox(x, y, z, hx, hy, hz, rot, member, data) { const h = { x, y, z, hx, hy, hz, rot, data }; boxes.push(h); return h; }, removeCollider() {}, addStaticTrimesh() { return {}; } };
const lightPool = { add() {}, remove() {} };
const stats = (out) => {
  let meshes = 0, verts = 0; const geos = new Set(), texs = new Set();
  out.group.traverse((o) => { if (!o.isMesh && !o.isPoints) return; meshes++; if (!geos.has(o.geometry)) { geos.add(o.geometry); verts += o.geometry.attributes.position.count; } for (const m of [].concat(o.material)) if (m.map) texs.add(m.map); });
  return { meshes, verts, geos, texs };
};
for (const kind of K.KINDS) for (const seed of [4242, 77, 9001]) {
  const moon = MOONS[K.MOON_IDS[kind]]; boxes.length = 0; cvs.length = 0;
  const out = buildExpeditionMap(kind, seed, moon, { physics, lightPool, biome: BIOMES[moon.biome] });
  const s = stats(out);
  const ads = cvs.filter((c) => c.width === 256 && c.height === 128).length, adMaps = [...new Set((out.ex.boards || []).map((b) => b.on.map).filter(Boolean))];
  ok(s.verts < 140000, `${kind}/${seed} vertex budget ${s.verts}`);
  ok(s.meshes <= 30, `${kind}/${seed} mesh count ${s.meshes}`);
  ok(cvs.every((c) => c.width <= 512 && c.height <= 512 && (c.width & (c.width - 1)) === 0 && (c.height & (c.height - 1)) === 0), `${kind}/${seed} canvases are power-of-two <= 512`);
  ok(ads <= 4, `${kind}/${seed} ad canvases drawn once per style (${ads})`);
  const dg = new Set(); for (const g of s.geos) g.addEventListener('dispose', () => dg.add(g));
  const dt = new Set(); for (const tx of [...s.texs, ...adMaps]) tx.addEventListener('dispose', () => dt.add(tx));
  out.dispose({ removeCollider() {} });
  ok(dg.size === s.geos.size, `${kind}/${seed} geometry freed on dispose ${dg.size}/${s.geos.size}`);
  ok(kind !== 'roof' || (adMaps.length > 0 && adMaps.every((tx) => dt.has(tx))), `${kind}/${seed} ad textures freed on dispose (${adMaps.length})`);
  if (kind === 'barge') {
    const w = out.ex.water.geometry; ok(w.attributes.position.count <= 4, 'barge water is a single quad');
    ok(boxes.filter((b) => b.data?.id === 'ex_wreck').length >= 4, `barge/${seed} has wreck silhouettes`);
    const P = out.ex.plan;
    ok(boxes.filter((b) => b.data?.id === 'ex_wreck').every((b) => !(b.x > P.hull.x0 - 6 && b.x < P.hull.x1 + 6 && b.z > P.hull.z0 - 6 && b.z < P.hull.z1 + 6)), `barge/${seed} wrecks clear of the hull`);
  }
}
ok(BIOMES.ex_barge.fogDensity <= 0.01, 'barge fog is thin above water (wrecks readable from the dock)');
ok(BIOMES.ex_barge.fogDensity + 0.034 >= 0.04, 'barge fog still closes in underwater');
console.log(`expedfix: ${pass + fail} checks, ${fail} failed`);
process.exit(fail ? 1 : 0);
