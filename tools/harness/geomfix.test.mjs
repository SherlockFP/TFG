// [geomfix] node geometry audit: builds outdoor moons + facilities with the real builders (stub physics/lights) and flags props that are
// floating / buried / intersecting solids / blocking doors + exits + the ship path / NaN or zero scale / outside the map.
//   node tools/harness/geomfix.test.mjs [--verbose] [--seeds 3]      (exit 1 when a hard category is non-zero; counts printed per category + module)
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent("export async function load(u, c, n) { if (u.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return n(u, c); }"));   // ui modules import .css
globalThis.window = globalThis;
console.warn = console.error = () => {};
globalThis.addEventListener = globalThis.removeEventListener = () => {};
const cv = () => ({ width: 0, height: 0, style: {}, querySelector: () => cv(), querySelectorAll: () => [], children: [], insertBefore() {},  appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }) });
globalThis.document = { createElement: () => cv(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, activeElement: null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const THREE = await import('three');
const { buildMoonOutdoor } = await import('../../src/world/terrain.js');
const { generateLayout, buildFacility, INTERIOR_NAMES } = await import('../../src/world/facility.js');
const { NavGrid } = await import('../../src/world/nav.js');
const { MOONS, BIOMES } = await import('../../src/game/moons.js');
const EXK = await import('../../src/game/expeditions_core.js');
await import('../../src/game/expeditions.js');   // [expeditions] registers the three custom-map moons (ex_barge / ex_dune / ex_roof)
const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const NSEED = +(argv[argv.indexOf('--seeds') + 1]) || 3;
const SEEDS = [1234, 987, 40417, 5150, 777].slice(0, NSEED);

// ---- record every prop-like object added to a parent (props are merged / hidden later, this keeps them)
let REC = null;
const _add = THREE.Object3D.prototype.add;
THREE.Object3D.prototype.add = function (...c) { if (REC) for (const o of c) if (o?.userData && (o.userData.propId || o.userData.ext)) REC.push(o); return _add.apply(this, c); };

const stat = {};   // category -> module -> count
const samples = {};
const flag = (cat, mod, msg) => {
  ((stat[cat] ||= {})[mod] ||= 0);
  stat[cat][mod]++;
  const s = (samples[cat + '|' + mod] ||= []);
  if (s.length < 4) s.push(msg);
};
const f2 = (n) => (Math.round(n * 100) / 100);
const mkPhysics = (boxes) => ({ addStaticBox(x, y, z, hx, hy, hz, rot, member, data) { const h = { x, y, z, hx, hy, hz, rot, data }; boxes.push(h); return h; }, removeCollider() {}, addStaticTrimesh() { return {}; }, addHeightfield() { return {}; } });
const lightPool = { add(e) { return e; }, remove() {} };
// which module made a prop: nearest named ancestor group / prop id fallback
const modOf = (o, fallback) => {
  for (let p = o; p; p = p.parent) if (p.name && /^(landmarks?|voyage|outposts?|biome|decor|worlds2|mapart|maps5|eggs|survival|variety|rooms2|setpieces?|elevator|chests?)/i.test(p.name)) return p.name.split(/[-:]/)[0].toLowerCase();
  return fallback;
};
const SOFT = /grass|reed|bush|flower|weed|moss|fern|mushroom|leaf|puddle|cable|wire|debris|rubble|pebble|stone_small|rock_small|vine|web|decal|poster|sign|lamp|light|bulb|panel|shelf_item|paper|book|bottle|can\b|cup/i;   // foliage / trim / mounted items: allowed to overlap or float

const boxAt = (b) => { const c = Math.abs(Math.cos(b.rot || 0)), s = Math.abs(Math.sin(b.rot || 0)), hx = c * b.hx + s * b.hz, hz = s * b.hx + c * b.hz; return { x0: b.x - hx, x1: b.x + hx, y0: b.y - b.hy, y1: b.y + b.hy, z0: b.z - hz, z1: b.z + hz }; };
const ov = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.2 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.2 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.2;
const bad = (n) => !Number.isFinite(n);
const flood = (nav, md) => {
  const st = nav.nearestWalkable(...nav.toGrid(md.x, md.z), 3); if (!st) return null;
  const seen = new Uint8Array(nav.w * nav.h), q = [st[1] * nav.w + st[0]]; seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % nav.w, z = (i / nav.w) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nav.inside(nx, nz) && !seen[nz * nav.w + nx] && nav.canStep(x, z, nx, nz)) { seen[nz * nav.w + nx] = 1; q.push(nz * nav.w + nx); } }
  }
  return (x, z) => { const [gx, gz] = nav.toGrid(x, z); return nav.isWalkable(gx, gz) && !!seen[gz * nav.w + gx]; };
};

function auditObjects(root, ctx) {
  root.updateMatrixWorld(true);
  const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  root.traverse((o) => {
    if (o === root) return;
    o.matrixWorld.decompose(p, q, s);
    if (bad(p.x + p.y + p.z) || bad(q.x + q.y + q.z + q.w) || bad(s.x + s.y + s.z)) flag('nan', modOf(o, ctx.mod), `${o.name || o.userData.propId || o.type}`);
    else if (o.isMesh && (Math.abs(s.x) < 1e-4 || Math.abs(s.y) < 1e-4 || Math.abs(s.z) < 1e-4)) flag('zeroScale', modOf(o, ctx.mod), `${o.name || o.userData.propId || o.type} ${s.toArray().map(f2)}`);
  });
}

function auditProps(props, boxes, ctx) {
  const bb = new THREE.Box3();
  const owners = props.map((o) => { o.updateWorldMatrix(true, false); return { o, id: String(o.userData.propId || o.userData.ext), bb: new THREE.Box3().setFromObject(o).expandByScalar(0.08) }; });
  const ownerOf = (b) => owners.find((w) => w.id === b.data.id && w.bb.containsPoint(new THREE.Vector3(b.x, b.y, b.z)))?.o || b;
  const solids = boxes.filter((b) => b.data?.kind === 'prop' && b.data.id && !(b.rot && typeof b.rot === 'object') && !(Math.abs(Math.sin((b.rot || 0) * 2)) > 0.05 && Math.max(b.hx, b.hz) > 4 * Math.min(b.hx, b.hz))).map((b) => ({ b, a: boxAt(b), own: ownerOf(b) }));
  const structural = boxes.filter((b) => !(b.data?.kind === 'prop' && b.data.id) && b.data?.kind !== 'door' && !(b.rot && typeof b.rot === 'object') && !(Math.abs(Math.sin((b.rot || 0) * 2)) > 0.05 && Math.max(b.hx, b.hz) > 4 * Math.min(b.hx, b.hz)) && b.hy > 0.3).map((b) => ({ b, a: boxAt(b) }));
  for (const o of props) {
    const id = String(o.userData.propId || o.userData.ext);
    if (o.userData.mount) continue;
    o.updateWorldMatrix(true, false);
    bb.setFromObject(o);
    if (bb.isEmpty() || bad(bb.min.x + bb.max.y + bb.min.z)) { flag('nan', modOf(o, ctx.mod), id); continue; }
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    const gy = ctx.ground(cx, cz), gyo = ctx.ground(o.position.x, o.position.z);
    if (ctx.outside(cx, cz)) flag('outsideMap', modOf(o, ctx.mod), `${id} @${f2(cx)},${f2(cz)}`);
    if (SOFT.test(id)) continue;
    const anchor = Math.abs(o.position.y - gyo) < 1.5;   // only props that claim to stand on the ground (props placed on platforms / tables use their own y)
    if (anchor && bb.min.y > gyo + 0.15 && bb.min.y - gy > 0.15) flag('floating', modOf(o, ctx.mod), `${id} @${f2(o.position.x)},${f2(o.position.z)} gap ${f2(bb.min.y - gyo)}`);
    if (anchor && bb.max.y < gyo - 0.02) flag('buried', modOf(o, ctx.mod), `${id} @${f2(o.position.x)},${f2(o.position.z)} top ${f2(bb.max.y - gyo)}`);
    if (anchor && bb.max.x - bb.min.x < 14 && bb.max.z - bb.min.z < 14) {   // slope: gap under the downhill side / sunk on the uphill side (footprint samples)
      let lo = 1e9, hi = -1e9;
      for (const fx of [0, 0.5, 1]) for (const fz of [0, 0.5, 1]) { const g = ctx.ground(bb.min.x + (bb.max.x - bb.min.x) * fx, bb.min.z + (bb.max.z - bb.min.z) * fz); lo = Math.min(lo, g); hi = Math.max(hi, g); }
      const base = Math.min(o.position.y, bb.min.y + 0.05);
      if (base - lo > 0.7 && bb.min.y <= gyo + 0.15) flag('slopeGap', modOf(o, ctx.mod), `${id} @${f2(o.position.x)},${f2(o.position.z)} gap ${f2(base - lo)}`);
      if (hi - bb.max.y > -0.0 && hi - base > 1.6 && bb.max.y - hi < 1.2) flag('slopeSunk', modOf(o, ctx.mod), `${id} @${f2(o.position.x)},${f2(o.position.z)} sunk ${f2(hi - base)}`);
    }
  }
  if (ctx.visual) {   // visual footprint of loose props against walls / ceiling slabs (collider-less clutter included)
    for (const o of props) {
      const id = String(o.userData.propId || o.userData.ext);
      if (o.userData.mount || SOFT.test(id) || /door|frame|window|vent|hatch|light|lamp|stairs|pipe|sign|cable|fuse|rail|beam|column|arch/i.test(id)) continue;
      bb.setFromObject(o);
      if (bb.isEmpty()) continue;
      const ceil = ctx.ceilAt?.((bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2);
      if (ceil != null && bb.max.y > ceil + 0.15 && bb.min.y < ceil - 0.5) flag('wallOverlap', ctx.mod + ':ceiling', `${ctx.tag || ''} ${id} @${f2(o.position.x)},${f2(o.position.z)} over ${f2(bb.max.y - ceil)}`);
      const a = { x0: bb.min.x, x1: bb.max.x, y0: bb.min.y, y1: bb.max.y, z0: bb.min.z, z1: bb.max.z };
      for (const w of structural) {
        if (!ov(a, w.a)) continue;
        const dx = Math.min(a.x1, w.a.x1) - Math.max(a.x0, w.a.x0), dz = Math.min(a.z1, w.a.z1) - Math.max(a.z0, w.a.z0), dy = Math.min(a.y1, w.a.y1) - Math.max(a.y0, w.a.y0);
        if (Math.min(dx, dz) < 0.3 || dy < 0.4) continue;
        flag('wallOverlap', ctx.mod + ':visual', `${ctx.tag || ''} ${id} @${f2(o.position.x)},${f2(o.position.z)} pen ${f2(Math.min(dx, dz, dy))}`);
        break;
      }
    }
  }
  // solid vs solid (prop colliders) and solid vs structural (walls / landmarks / outposts)
  const cell = 6, grid = new Map();
  const key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
  const put = (e, list) => { for (let x = Math.floor(e.a.x0 / cell); x <= Math.floor(e.a.x1 / cell); x++) for (let z = Math.floor(e.a.z0 / cell); z <= Math.floor(e.a.z1 / cell); z++) { const k = x + ',' + z; (grid.get(k) || grid.set(k, []).get(k)).push(e); } };
  structural.forEach((e) => put(e, 'S'));
  solids.forEach((e) => put(e, 'P'));
  const seen = new Set();
  for (const e of solids) {
    const id = String(e.b.data.id || '');
    if (SOFT.test(id) || e.b.hy < 0.15) continue;
    for (let x = Math.floor(e.a.x0 / cell); x <= Math.floor(e.a.x1 / cell); x++) for (let z = Math.floor(e.a.z0 / cell); z <= Math.floor(e.a.z1 / cell); z++) {
      for (const o of grid.get(x + ',' + z) || []) {
        if (o === e || seen.has(o.b) && seen.has(e.b) || (o.own === e.own)) continue;
        if (!ov(e.a, o.a)) continue;
        const isProp = o.b.data?.kind === 'prop';
        if (isProp && (SOFT.test(String(o.b.data.id || '')) || o.b.hy < 0.15)) continue;
        if (isProp && solids.indexOf(o) < solids.indexOf(e)) continue;   // count each pair once
        // a prop stacked on / inside a bigger flat slab (tables, platforms) is fine: needs real penetration on all axes
        const dx = Math.min(e.a.x1, o.a.x1) - Math.max(e.a.x0, o.a.x0), dz = Math.min(e.a.z1, o.a.z1) - Math.max(e.a.z0, o.a.z0), dy = Math.min(e.a.y1, o.a.y1) - Math.max(e.a.y0, o.a.y0);
        if (Math.min(dx, dz) < 0.35 || dy < 0.35) continue;
        flag(isProp ? "propOverlap" : "wallOverlap", ctx.mod, `${ctx.tag || ""} ${id}${isProp ? '/' + o.b.data.id : '/' + (o.b.data?.kind || 'wall') + ' h' + f2(o.b.hy * 2)} @${f2(e.b.x)},${f2(e.b.z)} pen ${f2(Math.min(dx, dz))}${isProp && e.own.position ? " own " + [e.own.position.x, e.own.position.z, e.own.rotation.y].map(f2) + " vs " + (o.own.position ? [o.own.position.x, o.own.position.z, o.own.rotation.y].map(f2) : "?") : ""}`);
        seen.add(e.b);
      }
    }
  }
  return { solids, structural };
}


// ---------------------------------------------------------------- game modules that add things on mapLoaded (installed one by one on a stub game so children can be attributed)
const MODS = [['mapart', '../../src/game/mapart.js', 'installMapArt'], ['eggs', '../../src/game/eggs.js', 'installEggs'], ['worldx', '../../src/game/worldx.js', 'installWorldX'],
  ['survival', '../../src/game/survival.js', 'installSurvival'], ['secureloot', '../../src/game/secureloot.js', 'installSecureLoot'], ['cycle3', '../../src/game/cycle3.js', 'installCycle3'],
  ['maps2', '../../src/game/maps2.js', 'installMaps2'], ['stealth', '../../src/game/stealth.js', 'installStealth'], ['worlds2', '../../src/game/worlds2.js', 'installWorlds2'], ['soul', '../../src/game/soul.js', 'installSoul']];
function stubGame(world, boxes) {
  const listeners = {};
  const mods = { on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => {}; }, emit(ev, ...a) { for (const f of [...(listeners[ev] || [])]) f(...a); } };
  const nets = {}, Hh = {};
  const net = { connected: true, on(t, fn) { nets[t] = fn; return () => {}; }, on_(t, fn) { nets[t] = fn; }, handle(a, fn) { Hh[a] = fn; }, broadcast() {}, sendTo() {}, request() {} };
  const player = { pos: new THREE.Vector3(0, 0, 0), indoor: false, dead: false, inShip: false };
  const camera = new THREE.PerspectiveCamera();
  const game = {
    mods, net, selfId: 'me', isHost: true, remotes: new Map(), player, camera, destroyed: false, time: 100, scene: new THREE.Scene(), world,
    run: { phase: 'moon', seed: world.seed, moon: world.moonId, quotaIndex: 0, day: 1 }, hostData: { spawnT: 30, outdoorSpawnT: 20 }, profile: { eggs: null, inventory: {}, credits: 0, xp: 0 },
    ui: { toast() {}, systemMessage() {}, hud: { bigText() {} } }, sfx() {}, audio: { setAmbience() {} }, engine: { fx: {} }, anomaly: { DEFS: {} }, later() {},
    physics: mkPhysics(boxes), items: { hostSpawn() { return 'i'; } }, resolveMelee() {}, lightPool, interactablesNow() { return []; },
  };
  return { game, mods, net };
}
const REPO = '../../src/game/';
async function modulePass(out, fac, tag, ctxOut, ctxFac) {
  const results = [];
  for (const [name, path, fn] of MODS) {
    let mod; try { mod = await import(path); } catch (e) { flag('buildError', 'import:' + name, e.message.slice(0, 80)); continue; }
    if (typeof mod[fn] !== 'function') continue;
    const world = { moonId: tag.moonId, seed: tag.seed, company: null, outdoor: out, facility: fac, terrain: out?.terrain };
    const boxes = [];
    const { game, mods, net } = stubGame(world, boxes);
    const before = new Set(); out?.group.traverse((o) => before.add(o)); if (fac) fac.group.traverse((o) => before.add(o));
    const props = []; REC = props;
    let api;
    try { api = mod[fn](game); mods.emit('netReady', net, game); mods.emit('mapLoaded', world, game); } catch (e) { flag('buildError', 'module:' + name, e.message.slice(0, 100)); REC = null; continue; }
    REC = null;
    const fresh = [];
    for (const [g, ctx] of [[out?.group, ctxOut], [fac?.group, ctxFac]]) g?.traverse((o) => { if (!before.has(o) && o.parent && before.has(o.parent) && (o.isMesh || o.isGroup || o.isInstancedMesh)) fresh.push([o, ctx]); });
    results.push({ name, api, fresh, boxes, props });
    for (const [o, ctx] of fresh) auditUnit(o, ctx, name, tag);
    // plan-based checks (mapart specs / eggs plan): y against terrain
    const plan = api?.plan?.() || api?.list?.() || [];
    for (const sp of Array.isArray(plan) ? plan : []) {
      if (!sp || !Number.isFinite(sp.x)) continue;
      const ctx = (sp.where === 'facility' || !ctxOut) ? ctxFac : ctxOut; if (!ctx) continue;
      if (bad(sp.x + (sp.y ?? 0) + sp.z)) { flag('nan', name, sp.id); continue; }
      if (ctx.outside(sp.x, sp.z)) flag('outsideMap', name, `${sp.id || sp.kind} @${f2(sp.x)},${f2(sp.z)}`);
      const gy = ctx.ground(sp.x, sp.z);
      const y0 = Number.isFinite(sp.gy) ? sp.gy : sp.y;
      if (ctx === ctxOut && !Number.isFinite(sp.gy) && out?.solidAt?.(sp.x, sp.z, -0.05, Number.isFinite(y0) ? y0 : null)) flag("propOverlap", name, `${tag.moonId} ${sp.id || sp.kind} inside a solid @${f2(sp.x)},${f2(sp.z)}`);   // hovering panels / drones carry their ground y in gy
      if (Number.isFinite(y0) && y0 > gy + 1.5) flag('floating', name, `${sp.id || sp.kind} plan y ${f2(y0)} ground ${f2(gy)}`);
      if (Number.isFinite(y0) && y0 < gy - 1.2) flag('buried', name, `${sp.id || sp.kind} plan y ${f2(y0)} ground ${f2(gy)}`);
    }
    try { api?.dispose?.(); } catch { /* ignore */ }
  }
  return results;
}
const _bb = new THREE.Box3();
function auditUnit(o, ctx, name, tag) {
  o.updateWorldMatrix(true, true);
  _bb.setFromObject(o);
  if (_bb.isEmpty()) return;
  if (bad(_bb.min.x + _bb.max.x + _bb.min.y + _bb.max.y + _bb.min.z + _bb.max.z)) { flag('nan', name, o.name || o.type); return; }
  const sx = _bb.max.x - _bb.min.x, sz = _bb.max.z - _bb.min.z;
  if (sx > 40 || sz > 40) return;   // terrain-wide sheets / instanced scatter
  const gs = [];
  for (const fx of [0, 0.5, 1]) for (const fz of [0, 0.5, 1]) gs.push(ctx.ground(_bb.min.x + sx * fx, _bb.min.z + sz * fz));
  const gmax = Math.max(...gs), gmin = Math.min(...gs);
  const cx = (_bb.min.x + _bb.max.x) / 2, cz = (_bb.min.z + _bb.max.z) / 2;
  if (ctx.outside(cx, cz)) flag('outsideMap', name, `${o.name || o.type} @${f2(cx)},${f2(cz)}`);
  if (_bb.min.y > gmax + 1.5 && (_bb.max.y - _bb.min.y) < 6 && !/fauna/.test(o.name || '')) flag("floating", name, `${o.name || o.type + ":" + (o.geometry?.type || "") + ":" + (o.material?.name || "")} @${f2(cx)},${f2(cz)} gap ${f2(_bb.min.y - gmax)}`);
  if (_bb.max.y < gmin - 0.05) flag('buried', name, `${o.name || o.type} @${f2(cx)},${f2(cz)} top ${f2(_bb.max.y - gmin)}`);
}

// ---------------------------------------------------------------- outdoor
const { generateSector } = await import('../../src/game/moongen.js');
const GEN = {};   // a few generated sectors: big mapScale + the generated-only biomes
for (let i = 0; i < 3; i++) for (const m of generateSector('geomfix', i).moons) GEN[m.id] = m;
Object.assign(MOONS, GEN);
const moonIds = Object.keys(MOONS).filter((k) => !MOONS[k].company && !MOONS[k].home && !MOONS[k].customMap);
let nMaps = 0;
for (const id of moonIds) for (const seed of SEEDS) {
  const boxes = [], props = [];
  REC = props;
  let out;
  try { out = buildMoonOutdoor(seed, MOONS[id], { physics: mkPhysics(boxes), lightPool }); } catch (e) { flag('buildError', 'outdoor', `${id}/${seed} ${e.message}`); REC = null; continue; }
  REC = null; nMaps++;
  const T = out.terrain, half = T.half + 1;
  const ctx = { tag: id + "/" + seed, mod: "outdoor", ground: (x, z) => T.heightAt(x, z), outside: (x, z) => Math.abs(x) > half || Math.abs(z) > half };
  auditObjects(out.group, ctx);
  const { solids, structural } = auditProps(props, boxes, ctx);
  // blocking: prop / structural solids sitting on the ship <-> facility path, the entrance door spawn and the fire exits
  const keep = [];
  for (const p of (T.pathPts || [])) keep.push({ x: p.x, z: p.z, r: 0.7, what: 'path' });
  keep.push({ x: out.mainExit.spawn.x, z: out.mainExit.spawn.z, r: 1.3, what: 'entrance', y: out.mainExit.spawn.y });
  for (const f of out.fireExits) keep.push({ x: f.spawn.x, z: f.spawn.z, r: 1.3, what: 'fireExit', y: f.spawn.y });
  keep.push({ x: 0, z: 0, r: 2.5, what: 'shipSpawn' });
  for (const k of keep) {
    const gy = k.y ?? T.heightAt(k.x, k.z);
    for (const e of [...solids, ...structural]) {
      const a = e.a;
      if (a.y1 < gy + 0.4 || a.y0 > gy + 1.7) continue;   // above head / buried below feet
      const dx = Math.max(a.x0 - k.x, 0, k.x - a.x1), dz = Math.max(a.z0 - k.z, 0, k.z - a.z1);
      if (Math.hypot(dx, dz) < k.r && !(e.b.data?.id && /exit|entrance|fire_exit/i.test(e.b.data.id))) {
        flag('blocking', k.what, `${id}/${seed} ${e.b.data?.id || e.b.data?.kind || 'wall'} @${f2(e.b.x)},${f2(e.b.z)}`);
        break;
      }
    }
  }
  {   // survival wild plants: seeded plan on this terrain; a plant standing inside a rock / prop / wall collider (or off the map) is a bad placement
    const SD = await import('../../src/game/survival_data.js');
    const list = SD.planPlants(seed, MOONS[id].biome, { scale: T.scale || 1, avoid: SD.plantAvoid(out), heightAt: (x, z) => T.heightAt(x, z) - 0.02 });
    for (const pl of list) {
      if (ctx.outside(pl.x, pl.z)) flag('outsideMap', 'survival', `${pl.k} @${f2(pl.x)},${f2(pl.z)}`);
      if (out.solidAt(pl.x, pl.z, -0.05, pl.y)) flag('propOverlap', 'survival', `${id}/${seed} plant ${pl.k} inside a solid @${f2(pl.x)},${f2(pl.z)}`);
    }
  }
  if (seed === SEEDS[0]) { await modulePass(out, null, { moonId: id, seed }, ctx, null); }
  auditUnits(out.group, ctx, 'outdoorUnits');
  out.dispose?.(physicsStub());
}
// ---------------------------------------------------------------- expedition moons (custom maps: Sunken Barge / Dune Relay / Rooftop Blackout City)
// every spot of the plan must stand on real support (terrain or a collider top: deck, roof, plank), inside the map; no NaN / zero scale
let nEx = 0;
for (const kind of EXK.KINDS) for (const seed of SEEDS) {
  const moon = MOONS[EXK.MOON_IDS[kind]], boxes = [];
  let out;
  try { out = moon.customMap(seed, moon, { physics: mkPhysics(boxes), lightPool, biome: BIOMES[moon.biome] }); } catch (e) { flag('buildError', 'expeditions', `${kind}/${seed} ${e.message}`); continue; }
  nEx++;
  const T = out.terrain, half = T.half + 1, ctx = { tag: kind + '/' + seed, mod: 'expeditions', ground: (x, z) => T.heightAt(x, z), outside: (x, z) => Math.abs(x) > half || Math.abs(z) > half };
  auditObjects(out.group, ctx);
  const tops = boxes.filter((b) => b.data?.kind !== 'terrain' && !(b.rot && typeof b.rot === 'object') && b.hy > 0.05);
  const support = (x, z, y) => { let best = T.heightAt(x, z); for (const b of tops) if (Math.abs(x - b.x) <= b.hx && Math.abs(z - b.z) <= b.hz) { const top = b.y + b.hy; if (top <= y + 0.06 && top > best) best = top; } return best; };
  for (const sp of EXK.spotsOf(out.ex.plan)) {
    if (bad(sp.x + sp.z + (sp.y ?? 0))) { flag('nan', 'expeditions', sp.id); continue; }
    if (ctx.outside(sp.x, sp.z)) flag('outsideMap', 'expeditions', `${kind}/${seed} ${sp.id} @${f2(sp.x)},${f2(sp.z)}`);
    if (sp.y != null) {
      const s = support(sp.x, sp.z, sp.y);
      if (sp.y - s > 0.15) flag('floating', 'expeditions', `${kind}/${seed} ${sp.id} @${f2(sp.x)},${f2(sp.z)} gap ${f2(sp.y - s)}`);
      if (sp.y < s - 0.1) flag('buried', 'expeditions', `${kind}/${seed} ${sp.id} @${f2(sp.x)},${f2(sp.z)} sunk ${f2(s - sp.y)}`);
    }
  }
  if (seed === SEEDS[0]) await modulePass(out, null, { moonId: EXK.MOON_IDS[kind], seed }, ctx, null);   // mapart / eggs / worldx / survival / worlds2 / soul on the custom map (must not crash or misplace)
  out.dispose?.(physicsStub());
}
function auditUnits(group, ctx, name) {
  const walk = (o, d) => { for (const c of o.children) { if (!c.isMesh && !(c.userData?.propId || c.userData?.ext)) auditUnit(c, ctx, modOf(c, name), null); } };
  walk(group, 0);
}
function physicsStub() { return { removeCollider() {} }; }

// ---------------------------------------------------------------- facilities
const themes = Object.keys(INTERIOR_NAMES);
let nFac = 0;
for (const theme of themes) for (const seed of SEEDS.slice(0, 2)) for (const size of [0.8, 1.4]) {
  const boxes = [], props = [];
  REC = props;
  let fac;
  try { const L = generateLayout(seed, theme, size); fac = buildFacility(L, { physics: mkPhysics(boxes), lightPool }); } catch (e) { flag('buildError', 'facility', `${theme}/${seed} ${e.message}`); REC = null; continue; }
  REC = null; nFac++;
  const L = fac.layout, Y = L.y, C = L.cell;
  const ctx = { ceilAt: (x, z) => { const gx = Math.floor((x - L.ox) / C), gz = Math.floor((z - L.oz) / C); return gx >= 0 && gz >= 0 && gx < L.w && gz < L.h && L.cells[L.idx(gx, gz)] ? Y + L.heightOf[L.idx(gx, gz)] : null; }, visual: true, tag: theme + '/' + seed, mod: 'facility:' + theme, ground: () => Y, outside: (x, z) => x < L.ox - 2 || z < L.oz - 2 || x > L.ox + L.w * C + 2 || z > L.oz + L.h * C + 2 };
  auditObjects(fac.group, ctx);
  if (seed === SEEDS[0] && size > 1) await modulePass(null, fac, { moonId: Object.keys(MOONS).find((k) => MOONS[k].interior === theme) || 'hamsi', seed }, null, ctx);
  const { solids, structural } = auditProps(props.filter((o) => o.position.y < Y + 1.2), boxes, ctx);
  // doors: nothing solid within the door swing / walking lane (0.9 m each side of the leaf line, door width wide)
  for (const d of fac.doors) {
    if (d.kind === 'blast' && d.open === false && false) continue;
    const along = Math.abs(Math.cos(d.rotY || 0)) > 0.7;   // door leaf runs along X or Z
    const hw = (d.width || 1.6) / 2, depth = 1.2;
    const a = { x0: d.pos.x - (along ? hw : depth), x1: d.pos.x + (along ? hw : depth), z0: d.pos.z - (along ? depth : hw), z1: d.pos.z + (along ? depth : hw), y0: Y + 0.3, y1: Y + 1.6 };
    for (const e of solids) {
      if (!ov(e.a, { ...a })) continue;
      if (/door|frame|exit|keypad|hatch/i.test(String(e.b.data.id || ''))) continue;
      flag('blocking', 'doors:' + theme, `${theme}/${seed} ${e.b.data.id} at door ${d.kind} @${f2(d.pos.x)},${f2(d.pos.z)}`);
      break;
    }
  }
  // navigation: a door reachable on the bare layout grid but not on the prop-blocked grid means a solid prop sealed a corridor
  try {
    const md = fac.mainDoor?.spawn || fac.mainDoor?.pos;
    if (md) {
      const bare = new NavGrid(L); for (const k of fac.nav.blockedEdges) bare.blockedEdges.add(k);
      const rBare = flood(bare, md), rNav = flood(fac.nav, md);
      for (const d of fac.doors) {
        const side = (r) => [[1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]].some(([dx, dz]) => r(d.pos.x + dx, d.pos.z + dz));
        if (rBare && rNav && side(rBare) && !side(rNav)) flag('blocking', 'sealed:' + theme, `${theme}/${seed} door ${d.kind} @${f2(d.pos.x)},${f2(d.pos.z)}`);
      }
    }
  } catch (e) { flag('buildError', 'nav', e.message); }
  fac.dispose(physicsStub());
}

// ---------------------------------------------------------------- report
const cats = ['nan', 'zeroScale', 'floating', 'buried', 'slopeGap', 'slopeSunk', 'outsideMap', 'propOverlap', 'wallOverlap', 'blocking', 'buildError'];
console.log(`geomfix: ${nMaps} outdoor maps, ${nEx} expedition maps, ${nFac} facilities, seeds ${SEEDS.join(',')}`);
let hard = 0;
for (const c of cats) {
  const m = stat[c] || {};
  const tot = Object.values(m).reduce((a, b) => a + b, 0);
  if (['nan', 'zeroScale', 'buildError'].includes(c)) hard += tot;
  console.log(`${c.padEnd(12)} ${String(tot).padStart(5)}  ${Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${v}`).join(' ')}`);
  if (VERBOSE) for (const [k] of Object.entries(m)) for (const s of samples[c + '|' + k] || []) console.log('     ', k, s);
}
process.exit(hard ? 1 : 0);
