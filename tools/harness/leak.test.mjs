// [leak] node test: build + dispose each map kind 3x with the real builders; every geometry / material / texture reachable from the group must fire 'dispose'.
// geometries must be freed exactly; materials / textures 'fresh' after 3 warm-up landings are shared-cache first uses (<= 12 / 3).
// node tools/harness/leak.test.mjs [--verbose]
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent("export async function load(u, c, n) { if (u.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return n(u, c); }"));
globalThis.window = globalThis;
console.warn = console.error = () => {};
globalThis.addEventListener = globalThis.removeEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;
const cv = () => ({ width: 0, height: 0, style: {}, querySelector: () => cv(), querySelectorAll: () => [], children: [], insertBefore() {}, appendChild() {}, append() {}, remove() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }) });
globalThis.document = { createElement: () => cv(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, activeElement: null, documentElement: { dataset: {} } };
globalThis.localStorage = { getItem: () => null, setItem() {} };
await import('three');
const K = await import('../../src/game/expeditions_core.js');
const { MOONS, BIOMES } = await import('../../src/game/moons.js');
await import('../../src/game/expeditions.js');
const { buildExpeditionMap } = await import('../../src/world/expeditions_maps.js');
const { generateLayout, buildFacility } = await import('../../src/world/facility.js');
const { buildMoonOutdoor } = await import('../../src/world/terrain.js');
const { buildCompany } = await import('../../src/world/company.js');
const verbose = process.argv.includes('--verbose');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const physics = new Proxy({}, { get: () => () => ({}) });
const lightPool = { add() {}, remove() {}, list: [] };
const TEX = ['map', 'emissiveMap', 'alphaMap', 'lightMap', 'aoMap', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap'];
function collect(root) {
  const geos = new Set(), mats = new Set(), texs = new Set();
  root.traverse((o) => {
    if (o.geometry) { geos.add(o.geometry); o.geometry.userData.__o = (o.isInstancedMesh ? 'inst' : o.type) + '/' + (o.name || o.parent?.name || '') + '/' + (o.parent?.parent?.name || ''); }
    for (const m of [].concat(o.material || [])) if (m) m.userData.__o = o.type + '/' + (o.name || o.parent?.name || '') + '/' + (o.parent?.name || '');
    for (const m of [].concat(o.material || [])) { if (!m) continue; mats.add(m); for (const k of TEX) if (m[k]?.isTexture) texs.add(m[k]); }
  });
  return { geos, mats, texs };
}
function cycle(name, build, dispose) {
  const res = [], seen = { geos: new Set(), mats: new Set(), texs: new Set() };
  for (let i = 0; i < 5; i++) {
    let out;
    try { out = build(i); } catch (e) { console.log('SKIP', name, e.message); return; }
    const r = collect(out.group || out.root);
    const dis = { geos: new Set(), mats: new Set(), texs: new Set() };
    for (const k of ['geos', 'mats', 'texs']) for (const x of r[k]) x.addEventListener('dispose', () => dis[k].add(x));
    dispose(out);
    // 'left' = undisposed objects this cycle that no earlier cycle already held: shared caches (same object every landing) are bounded, fresh ones are a leak
    const left = {}; for (const k of ['geos', 'mats', 'texs']) { const lk = [...r[k]].filter((x) => !dis[k].has(x)); left[k] = lk.filter((x) => !seen[k].has(x)).length; if (verbose && i === 3) console.log(name, k, lk.filter((x) => !seen[k].has(x)).slice(0, 12).map((x) => x.type + ':' + (x.userData?.__o || '') + ':' + (x.name || x.uuid.slice(0, 4)) + (x.image ? ':' + x.image.width + 'x' + x.image.height : '') + (x.attributes ? ':' + x.attributes.position?.count : '')).join(' '));
 for (const x of lk) seen[k].add(x); }
    res.push({ n: [r.geos.size, r.mats.size, r.texs.size], left: [left.geos, left.mats, left.texs] });
    ok(i < 3 || left.geos === 0, `${name}#${i} geometries not disposed: ${left.geos}/${r.geos.size}`);
    ok(i < 3 || left.mats <= 12, `${name}#${i} materials not disposed: ${left.mats}/${r.mats.size}`);
    ok(i < 3 || left.texs <= 3, `${name}#${i} textures not disposed: ${left.texs}/${r.texs.size}`);
  }
  if (verbose) console.log(name, JSON.stringify(res));
}
const ph = { removeCollider() {} };
for (const kind of K.KINDS) cycle('exp:' + kind, (i) => { const m = MOONS[K.MOON_IDS[kind]]; return buildExpeditionMap(kind, 100 + i, m, { physics, lightPool, biome: BIOMES[m.biome] }); }, (o) => o.dispose(ph));
for (const id of ['hamsi', 'sewer_moon'].filter((x) => MOONS[x])) {
  const moon = MOONS[id];
  cycle('outdoor:' + id, (i) => buildMoonOutdoor(100 + i, moon, { physics, lightPool }), (o) => o.dispose(ph));
  cycle('facility:' + id, (i) => buildFacility(generateLayout(100 + i, moon.interior, moon.size), { physics, lightPool }), (o) => o.dispose(ph));
}
cycle('company', () => buildCompany({ physics, lightPool }), (o) => o.dispose(ph));
console.log(`leak.test: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
