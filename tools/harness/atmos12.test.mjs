// atmos12 node checks (interior atmosphere pass): the pure plan is deterministic and stays on the floor, every registered interior theme has a profile,
// the art builder produces finite geometry within the draw-call / triangle budget, and the lamp-linked colour groups react to power / flicker.
//   node tools/harness/atmos12.test.mjs
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent("export async function load(u, c, n) { if (u.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return n(u, c); }"));
globalThis.window = globalThis;
const realWarn = console.log;
console.warn = console.error = () => {};
globalThis.addEventListener = globalThis.removeEventListener = () => {};
const cv = () => ({ width: 0, height: 0, style: {}, querySelector: () => cv(), querySelectorAll: () => [], children: [], insertBefore() {}, appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }) });
globalThis.document = { createElement: () => cv(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, activeElement: null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { generateLayout, buildFacility } = await import('../../src/world/facility.js');
const { INTERIOR_THEMES } = await import('../../src/world/interiors/index.js');
await import('../../src/world/worlds2_data.js');
const C = await import('../../src/game/atmos12_core.js');
const A = await import('../../src/game/atmos12_art.js');
const lightPool = { add(e) { return e; }, remove() {} };
const physics = { addStaticBox(x, y, z, hx, hy, hz, rot) { return { x, y, z, hx, hy, hz, rot }; }, removeCollider() {} };
let fails = 0;
const bad = (m) => { fails++; realWarn('FAIL', m); };
const okc = (c, m) => { if (!c) bad(m); };

// pure curves + profile table
for (let t = 0; t < 30; t += 0.37) { const b = C.breath(t, 6, 1.3); okc(b >= 0 && b <= 1, `breath ${b}`); }
okc(C.lampFactor({ enabled: false }, 3) === 0, 'disabled lamp = 0');
okc(C.lampFactor({ enabled: true, flicker: 0 }, 3) === 1, 'steady lamp = 1');
for (const id of INTERIOR_THEMES) okc(!!C.PROFILES[id], `profile for ${id}`);
for (const [id, p] of Object.entries(C.PROFILES)) {
  okc(p.tint.every((x) => x > 0.7 && x < 1.2), `${id}: tint out of range`);
  for (const k of Object.keys(p.decals)) okc(C.KIND[k] !== undefined, `${id}: unknown decal kind ${k}`);
}

const rows = [];
for (const theme of INTERIOR_THEMES) for (const seed of [1234, 40417]) {
  const tag = `${theme}/${seed}`;
  let fac;
  try { fac = buildFacility(generateLayout(seed, theme, 1.0), { physics, lightPool }); } catch (e) { bad(`${tag}: build ${e.stack}`); continue; }
  const L = fac.layout;
  const a = C.planAtmos(fac, 0, 1), b = C.planAtmos(fac, 0, 1);
  okc(a.sig === b.sig && a.decals.length === b.decals.length, `${tag}: plan not deterministic`);
  okc(a.decals.length >= 8, `${tag}: only ${a.decals.length} decals`);
  okc(a.decals.length <= 360, `${tag}: too many decals ${a.decals.length}`);
  okc(a.lamps.length >= 1, `${tag}: no lamps`);
  okc(a.lamps.length <= 150, `${tag}: lamps ${a.lamps.length}`);
  for (const d of a.decals) {
    const cx = Math.floor((d.x - L.ox) / L.cell), cz = Math.floor((d.z - L.oz) / L.cell);
    okc(cx >= 0 && cz >= 0 && cx < L.w && cz < L.h && L.cells[cz * L.w + cx] > 0, `${tag}: decal ${d.k} outside floor (${cx},${cz})`);
    okc(Number.isFinite(d.w) && Number.isFinite(d.d) && d.w > 0 && d.d > 0 && C.KIND[d.k] !== undefined, `${tag}: bad decal`);
  }
  for (const v of a.vents) okc(v.y > L.y + 2 && v.y < L.y + 10, `${tag}: vent y ${v.y - L.y}`);
  for (const d of a.drips) okc(d.y > L.y + 2, `${tag}: drip y`);
  const lo = C.planAtmos(fac, 0, 0.4);
  okc(lo.decals.length <= a.decals.length, `${tag}: low quality has more decals`);
  // art with a flat-floor env, then power cut / flicker rewrites
  const art = A.buildAtmos(a, { emitters: fac.emitters, floorAt: () => L.y, Y: L.y });
  for (const m of [art.decals, art.light]) if (m) for (const attr of Object.values(m.geometry.attributes)) okc(attr.array.every(Number.isFinite), `${tag}: non-finite vertex data`);
  art.update(1, 1, 1);
  const sum = () => { let s = 0; if (art.light) for (const g of art.groups) if (g.kind === 1) for (let j = g.v0 * 3; j < (g.v0 + g.nv) * 3; j++) s += art.light.geometry.attributes.color.array[j]; return s; };
  const lit = sum();
  art.update(1.02, 0, 1.05);
  const dark = sum();
  okc(!art.light || dark < lit * 0.2 || lit === 0, `${tag}: power cut did not dim the shafts (${lit} -> ${dark})`);
  okc(art.stats.tris < 30000, `${tag}: ${art.stats.tris} triangles`);
  rows.push(`${theme.padEnd(10)} s${seed} decals ${String(art.stats.decals).padStart(3)} (-${art.stats.dropped}) shafts ${String(art.stats.shafts).padStart(3)} glints ${String(art.stats.glints).padStart(2)} vents ${a.vents.length} drips ${a.drips.length} broken ${a.broken.length} win ${a.windows.length} tris ${art.stats.tris}`);
  art.dispose();
  fac.dispose({ removeCollider() {} });
}
realWarn(rows.join('\n'));
realWarn(fails ? `atmos12: ${fails} FAILED` : `atmos12: all ok (${rows.length} facilities)`);
process.exit(fails ? 1 : 0);
