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
await import('../../src/world/worlds2_data.js');   // registers the fixed moons (Panelka = tower)
let BOXES = null;
const mkPhysics = () => ({ addStaticBox(x, y, z, hx, hy, hz, rot) { const b = { x, y, z, hx, hy, hz, rot }; BOXES?.push(b); return b; }, removeCollider() {} });
const { checkStairs } = await import('../../src/world/stairs.js');
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
let prisonMade = 0, towerMade = 0;
for (const theme of ['metro', 'greenhouse', 'prison', 'tower']) for (const seed of SEEDS) for (const size of SIZES) {
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
  BOXES = [];
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
  if (theme === 'prison') {
    const hub = L.rooms.find((r) => r.type === 'cellblock');
    if (!hub) okc(size < 1.0, `${tag}: no cellblock hub at size ${size}`);
    else {
      prisonMade++;
      okc(lab && lab.id === 'prison' && lab.gates.length >= 12, `${tag}: prison gates ${lab?.gates?.length}`);
      for (const pl of lab?.plans || []) okc(checkStairs(pl).length === 0, `${tag}: stairs ${checkStairs(pl).join(',')}`);
      okc(lab?.plans?.length === 2 && lab.plans[0].top.y - lab.plans[0].y > 3 && lab.plans[1].y > lab.plans[0].y, `${tag}: prison flights chain ground -> tier 1 -> tier 2`);
      okc((hub.height || 0) >= 11, `${tag}: cellblock height ${hub.height}`);
      const gk = new Set(lab.gates.map((g) => `${g.tier}|${g.x.toFixed(2)}|${g.z.toFixed(2)}`));
      okc(gk.size === lab.gates.length, `${tag}: duplicate cell gates`);
      okc(BOXES.every((b) => Number.isFinite(b.x + b.y + b.z + b.hx + b.hy + b.hz)), `${tag}: NaN collider`);
    }
  }
  if (theme === 'tower') {
    const hub = L.rooms.find((r) => r.type === 'tower');
    if (!hub) okc(size < 1.0, `${tag}: no tower hub at size ${size}`);
    else {
      towerMade++;
      okc(lab && lab.id === 'tower' && lab.gates.length === 4 && lab.ys.length === 4, `${tag}: tower lab`);
      for (const pl of lab?.plans || []) okc(checkStairs(pl).length === 0, `${tag}: stairs ${checkStairs(pl).join(',')}`);
      okc(lab?.plans?.length === 3 && lab.plans.every((pl, i) => Math.abs(pl.top.y - lab.ys[i]) < 0.01 && Math.abs(pl.y - lab.ys[i + 1]) < 0.01), `${tag}: tower flights chain L3 -> L2 -> L1 -> ground`);
      const w = lab.well;
      okc(lab.cx - lab.shaft > w.x0 + 3 && lab.cx + lab.shaft < w.x1 - 3, `${tag}: shaft not inside the well with room for the lanes`);
      // the well is really open: no collider of the ground slab / floors covers a point over the well corner (the flights are above the floor, not through it)
      const px = w.x0 + 0.3, pz = w.z0 + 0.3;
      okc(!BOXES.some((b) => Math.abs(px - b.x) < b.hx && Math.abs(pz - b.z) < b.hz && Math.abs(L.y - 0.5 - b.y) < b.hy), `${tag}: ground slab still covers the well`);
      // floors deeper = more loot
      const per = [1, 2, 3].map((k) => fac.scrapSpots.filter((sp) => sp.floor === k).length);
      okc(per[0] < per[1] && per[1] < per[2], `${tag}: loot per floor ${per} should grow with depth`);
      okc(fac.contains({ x: lab.cx, y: lab.ys[3] + 0.5, z: lab.cz }), `${tag}: facility.contains misses the lowest floor`);
      okc(lab.gates.slice(1).every((g) => !!g.col) && !lab.gates[0].col, `${tag}: gates: ground open, lower closed`);
    }
  }
  fac.dispose({ removeCollider() {} });
}
for (const theme of ['factory', 'mansion', 'mineshaft', 'office', 'serverfarm', 'sewer', 'hospital']) for (const seed of SEEDS.slice(0, 3)) {
  const L = generateLayout(seed, theme, 1.5);
  try { const fac = buildFacility(L, { physics: mkPhysics(), lightPool }); heroTotal += fac.heroes?.rooms?.length || 0; fac.dispose({ removeCollider() {} }); } catch (e) { bad(`hero ${theme}/${seed}: ${e.stack}`); }
}
okc(heroTotal >= 7, `hero rooms placed: ${heroTotal}`);
okc(MOONS.levrek.interior === 'metro' && MOONS.lufer.interior === 'greenhouse' && MOONS.cipura.interior === 'prison', 'moon mapping metro / greenhouse / prison');
okc(Object.values(MOONS).some((m) => m.interior === 'tower'), 'a moon uses the tower');
for (const id of K.LAB_IDS) okc(!!THEMES[id], `theme registered ${id}`);
const spec = { zA: 0, zB: 100, len: 24, speed: 30, warn: 7 };
okc(K.trainState({ dir: 1, t: 0 }, spec).phase === 'warn' && !K.trainState({ dir: 1, t: 0 }, spec).visible, 'train: warn phase first');
const t2 = K.trainState({ dir: 1, t: 7 + 100 / 30 }, spec);
okc(t2.visible && t2.z > 30 && t2.z < 100, 'train: passes the tunnel');
okc(K.trainState({ dir: 1, t: 60 }, spec).done, 'train: done after the pass');
okc(K.trainHits(50, { x: 10, z: 50 }, { xC: 10, len: 24, hw: 1.45 }) && !K.trainHits(50, { x: 11.7, z: 50 }, { xC: 10, len: 24, hw: 1.45 }), 'train: lane hits, wall hug is safe');
const ride = K.elevRide(7, 3, 0, 3), r1 = K.elevRide(7, 3, 0, 1);
okc(ride.dur > r1.dur && r1.stall === 0, 'elevator: longer rides take longer, 1-level rides never stall');
okc(K.elevProgress(ride, 0) === 0 && K.elevProgress({ dur: 4, stall: 3 }, 7) === 1 && K.elevProgress({ dur: 4, stall: 3 }, 3.5) === K.elevProgress({ dur: 4, stall: 3 }, 2), 'elevator: progress 0 -> 1, holds during the stall');
okc(K.lockGap(5, 0) >= K.LOCK.firstMin && K.lockGap(5, 3) >= K.LOCK.gapMin && K.lockGap(5, 3) === K.lockGap(5, 3), 'lockdown gaps deterministic + in range');
const li = new Set(); for (let i = 0; i < 400; i++) li.add(K.labInterior('run' + i, i % 5, i % 4, ['hills', 'jungle', 'moor', 'crystal'][i % 4], 1 + (i % 5), 'factory'));
okc(['metro', 'greenhouse', 'prison', 'tower'].every((id) => li.has(id)), 'labInterior rolls all four interiors');
realWarn(`labyrinths (prison ${prisonMade}, tower ${towerMade}): ${nBuilt} facilities built, ${metroMade} metro plans, ${vinesTotal} vine plugs, ${heroTotal} hero rooms, ${fails} failures`);
process.exit(fails ? 1 : 0);
