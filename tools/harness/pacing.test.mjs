// [pacing] node measure + guard: ship -> main entrance distance, map half-size, points of interest and fog reach for every regular moon
// + a few generated sector moons, built with the real terrain builder (stub physics/lights). Prints a table; exit 1 when a pacing rule breaks.
//   node tools/harness/pacing.test.mjs
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent("export async function load(u, c, n) { if (u.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return n(u, c); }"));
globalThis.window = globalThis;
console.warn = console.error = () => {};
globalThis.addEventListener = globalThis.removeEventListener = () => {};
const cv = () => ({ width: 0, height: 0, style: {}, querySelector: () => cv(), querySelectorAll: () => [], children: [], insertBefore() {}, appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }) });
globalThis.document = { createElement: () => cv(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, activeElement: null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const TER = await import('../../src/world/terrain.js');
const { buildMoonOutdoor } = TER;
const fogCapFor = TER.fogCapFor || (() => Infinity);
const { MOONS, BIOMES } = await import('../../src/game/moons.js');
const { generateSector } = await import('../../src/game/moongen.js');
const MA = await import('../../src/game/mapart_core.js');
const SO = await import('../../src/game/soul_core.js');
const MI = await import('../../src/game/mining_core.js');

const phys = () => ({ addStaticBox: () => ({}), removeCollider() {}, addStaticTrimesh: () => ({}), addHeightfield: () => ({}) });
const lightPool = { add: (e) => e, remove() {} };
const GEN = {};
for (let i = 0; i < 4; i++) for (const m of generateSector('pacing', i).moons) GEN[m.id] = m;
const regular = Object.keys(MOONS).filter((k) => !MOONS[k].company && !MOONS[k].home && !MOONS[k].customMap);
Object.assign(MOONS, GEN);
const ids = [...regular, ...Object.keys(GEN)];
const SEEDS = [1234, 40417, 5150];
const rows = [], fails = [];
const avg = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
for (const id of ids) {
  const m = MOONS[id], acc = { spawn: [], mn: 1e9, mx: 0, half: 0, play: 0, poi: [], beats: [], vis: [] };
  for (const seed of SEEDS) {
    let out;
    try { out = buildMoonOutdoor(seed, m, { physics: phys(), lightPool }); } catch (e) { fails.push(`${id}/${seed} build ${e.message}`); continue; }
    const T = out.terrain, e = out.plan.entrance, d = Math.hypot(e.x, e.z), sp = out.mainExit.spawn, ds = Math.hypot(sp.x, sp.z);
    acc.spawn.push(ds); acc.mn = Math.min(acc.mn, ds); acc.mx = Math.max(acc.mx, ds); acc.half = T.half; acc.play = T.playHalf;
    const lm = out.landmarks?.sites?.length || 0, op = out.outposts?.sites?.length || 0, fx = out.fireExits?.length || 0;
    let art = 0, beats = 0, mound = 0;
    try { art = MA.planMapArt({ seed, moonId: id, decor: BIOMES[m.biome]?.decor, biomeId: m.biome, sc: T.scale, plan: out.plan, pathPts: T.pathPts, heightAt: (x, z) => T.heightAt(x, z), ok: out.avoid, floodY: T.flood ?? null }).length; } catch { /* optional */ }
    try { beats = SO.planBeats({ seed, moonId: id, pathPts: T.pathPts, heightAt: (x, z) => T.heightAt(x, z), plan: out.plan, half: T.half, floodY: T.flood ?? null, avoid: out.avoid }).length; } catch { /* optional */ }
    try { mound = MI.planOutdoor({ seed, size: m.size || 1, tier: m.tier || 1, terrain: T, avoid: out.avoid, sites: out.landmarks?.sites || [] }).length; } catch { /* optional */ }
    acc.poi.push(lm + op + fx + art + beats + mound + 1); acc.beats.push(beats);
    const dens = Math.min(SO.PALETTES?.[id]?.fogDensity ?? BIOMES[m.biome]?.fogDensity ?? 0.015, fogCapFor(ds));
    acc.vis.push(Math.exp(-((dens * ds) ** 2)));   // share of the entrance colour still visible from the ship in clear weather
    try { out.dispose?.(phys()); } catch { /* stub */ }
  }
  const gen = !!GEN[id];
  const row = { id, gen, tier: m.tier || 1, ms: m.mapScale || 1, ent: avg(acc.spawn), min: acc.mn, max: acc.mx, half: acc.half, play: acc.play, poi: avg(acc.poi), beats: avg(acc.beats), vis: avg(acc.vis) };
  rows.push(row);
  const lim = row.tier <= 2 && !gen ? [30, 64] : [30, 78];
  if (acc.mx > lim[1] || acc.mn < lim[0]) fails.push(`${id}: ship->entrance ${acc.mn.toFixed(0)}..${acc.mx.toFixed(0)} m outside ${lim.join('-')}`);
  if (row.vis < 0.2) fails.push(`${id}: entrance only ${(row.vis * 100).toFixed(0)}% visible through clear fog`);
  if (row.poi < 8) fails.push(`${id}: only ${row.poi.toFixed(1)} points of interest`);
}
const f1 = (n) => n.toFixed(1).padStart(6);
console.log('moon'.padEnd(24) + ' tier mapSc ship>ent (min-max)   half  play   POI beats vis%');
for (const r of rows) console.log(r.id.padEnd(24) + String(r.tier).padStart(5) + r.ms.toFixed(2).padStart(6) + f1(r.ent) + `(${r.min.toFixed(0)}-${r.max.toFixed(0)})`.padStart(9) + f1(r.half) + f1(r.play) + f1(r.poi) + f1(r.beats) + (r.vis * 100).toFixed(0).padStart(5));
if (fails.length) { console.log('FAIL\n' + fails.join('\n')); process.exit(1); }
console.log(`ok: ${rows.length} moons`);
