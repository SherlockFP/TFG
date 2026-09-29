// [labyrinths] node checks for the new labyrinth interiors (metro / greenhouse) + hero rooms + moon mapping:
//   every cell reachable from the entrance (locked doors closed), a fire exit exists, tunnel / alcoves exist, ALL vine plugs closed at once keep the
//   level connected, nav path entrance -> fire exit after the real build, hero rooms appear on the older themes, pure train rules.
//   node tools/harness/labyrinths.test.mjs
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent("export async function load(u, c, n) { if (u.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return n(u, c); }"));   // ui modules import .css
globalThis.window = globalThis;
const realWarn = console.log;
console.warn = console.error = () => {};
globalThis.addEventListener = globalThis.removeEventListener = () => {};
const cv = () => ({ width: 0, height: 0, style: {}, querySelector: () => cv(), querySelectorAll: () => [], children: [], insertBefore() {}, appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }) });
globalThis.document = { createElement: () => cv(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, activeElement: null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { generateLayout, buildFacility, THEMES } = await import('../../src/world/facility.js');
const { MOONS } = await import('../../src/game/moons.js');
const K = await import('../../src/game/labyrinths_core.js');
const mkPhysics = () => ({ addStaticBox(x, y, z, hx, hy, hz, rot) { return { x, y, z, hx, hy, hz, rot }; }, removeCollider() {} });
const lightPool = { add(e) { return e; }, remove() {} };
let fails = 0;
const bad = (m) => { fails++; realWarn('FAIL', m); };
const okc = (c, m) => { if (!c) bad(m); };

// reachability over open edges from the entrance; locked / vault / contain doors closed; optional extra blocked edge keys
function reach(L, blocked = new Set()) {
  const seen = new Uint8Array(L.w * L.h), q = [...new Set(L.entrySources)];   // entrance + the fire exits that have an outdoor twin (the generator's own rule)
  for (const s of q) seen[s] = 1;
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % L.w, z = (q[i] / L.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d];
      if (nx < 0 || nz < 0 || nx >= L.w || nz >= L.h) continue;
      const k = L.edgeKey(x, z, d), j = L.idx(nx, nz), inf = L.edgeInfo.get(k);
      if (!L.cells[j] || seen[j] || !L.open.has(k) || blocked.has(k)) continue;
      if (inf && (inf.type === 'vault' || inf.type === 'contain' || (inf.type === 'door' && inf.locked))) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return seen;
}
const sealed = (L, i) => { const r = L.roomOf[i]; return r >= 0 && (['vault', 'core'].includes(L.rooms[r].type) || L.rooms[r].treasure || L.rooms[r].arena); };
const unreached = (L, seen) => { let n = 0; for (let i = 0; i < L.w * L.h; i++) if (L.cells[i] && !seen[i] && !sealed(L, i)) n++; return n; };

const SEEDS = [1234, 987, 40417, 5150, 777, 31337], SIZES = [0.8, 1.0, 1.5, 2.0];
let nBuilt = 0, metroMade = 0, vinesTotal = 0, heroTotal = 0;
for (const theme of ['metro', 'greenhouse']) for (const seed of SEEDS) for (const size of SIZES) {
  const L = generateLayout(seed, theme, size);
  const tag = `${theme}/${seed}/${size}`;
  okc(unreached(L, reach(L)) === 0, `${tag}: unreachable cells ${unreached(L, reach(L))}`);
  okc(L.fireExits.length >= 1, `${tag}: no fire exit`);
  if (theme === 'metro') {
    const tun = L.rooms.filter((r) => r.metro === 'tunnel'), al = L.rooms.filter((r) => r.metro === 'alcove');
    if (tun.length) { metroMade++; okc(al.length >= 3, `${tag}: only ${al.length} alcoves`); okc(L.rooms.filter((r) => r.metro === 'platform' || r.metro === 'terminus').length >= 2, `${tag}: stations`); }
    else okc(size < 1.0, `${tag}: metro plan skipped at size ${size}`);
  }
  let fac;
  try { fac = buildFacility(L, { physics: mkPhysics(), lightPool }); nBuilt++; } catch (e) { bad(`${tag}: build threw ${e.stack}`); continue; }
  const lab = fac.lab;
  if (theme === 'greenhouse') {
    okc(lab && lab.id === 'greenhouse', `${tag}: no greenhouse lab`);
    const keys = new Set((lab?.vines || []).map((v) => v.key));
    vinesTotal += keys.size;
    okc(unreached(L, reach(L, keys)) === 0, `${tag}: vine plugs disconnect the level`);
    okc((lab?.plan || []).every((p) => p.detour >= 10), `${tag}: vine detour < 10`);
    okc((lab?.spores || []).every((s) => Number.isFinite(s.x + s.z)), `${tag}: spore NaN`);
  }
  if (theme === 'metro' && L.rooms.some((r) => r.metro === 'tunnel')) {
    okc(lab && lab.id === 'metro' && lab.zB > lab.zA + 30, `${tag}: no metro lab / tunnel too short`);
    okc(Number.isFinite(lab?.xC), `${tag}: tunnel x NaN`);
    const md = fac.mainDoor?.spawn;
    const seen0 = reach({ ...L, entrySources: [L.idx(L.entrance.room.cx, L.entrance.room.cz)] });
    for (const fdoor of fac.fireDoors) {
      const fx = fdoor.spawn; if (!fx || !md) continue;
      if (!seen0[fac.cellAt(fx.x, fx.z)]) continue;   // only reachable from outside (the generator's own outdoor-twin rule)
      okc(fac.nav.findPath(md.x, md.z, fx.x, fx.z, 60000), `${tag}: nav path entrance -> fire exit missing`);
    }
  }
  fac.dispose({ removeCollider() {} });
}
for (const theme of ['factory', 'mansion', 'mineshaft', 'office', 'serverfarm', 'sewer', 'hospital']) for (const seed of SEEDS.slice(0, 3)) {
  const L = generateLayout(seed, theme, 1.5);
  try { const fac = buildFacility(L, { physics: mkPhysics(), lightPool }); heroTotal += fac.heroes?.rooms?.length || 0; fac.dispose({ removeCollider() {} }); } catch (e) { bad(`hero ${theme}/${seed}: ${e.stack}`); }
}
okc(heroTotal >= 7, `hero rooms placed: ${heroTotal}`);
okc(MOONS.levrek.interior === 'metro' && MOONS.lufer.interior === 'greenhouse', 'moon mapping metro / greenhouse');
for (const id of ['metro', 'greenhouse']) okc(!!THEMES[id], `theme registered ${id}`);
const spec = { zA: 0, zB: 100, len: 24, speed: 30, warn: 7 };
okc(K.trainState({ dir: 1, t: 0 }, spec).phase === 'warn' && !K.trainState({ dir: 1, t: 0 }, spec).visible, 'train: warn phase first');
const t2 = K.trainState({ dir: 1, t: 7 + 100 / 30 }, spec);
okc(t2.visible && t2.z > 30 && t2.z < 100, 'train: passes the tunnel');
okc(K.trainState({ dir: 1, t: 60 }, spec).done, 'train: done after the pass');
okc(K.trainHits(50, { x: 10, z: 50 }, { xC: 10, len: 24, hw: 1.45 }) && !K.trainHits(50, { x: 11.7, z: 50 }, { xC: 10, len: 24, hw: 1.45 }), 'train: lane hits, wall hug is safe');
realWarn(`labyrinths: ${nBuilt} facilities built, ${metroMade} metro plans, ${vinesTotal} vine plugs, ${heroTotal} hero rooms, ${fails} failures`);
process.exit(fails ? 1 : 0);
