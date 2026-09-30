// [labyr12] node checks for the Dark Web ('darkweb') and the Overload Hotel ('hotel') interiors: 3 seeds x 2 sizes each
//   registry / names / atmosphere / sounds / TR + RU, pure rules (pulse maths, elevator timing, moon pool), every cell reachable, real build (hero spots, nav paths, doors never blocked,
//   mesh count, determinism), dark web echo shell + trim + darkness, hotel stairs (checkStairs, headroom under every slab, holes), elevator gates + cab, DND doors, keys, hero suite,
//   and the runtime module on a stub game (noise -> pulse, knock cooldown per player, elevator warn / ride / arrive, rider carried, outsider left behind, DND unlock with a key, late-join state).
//   node tools/harness/labyr12.test.mjs
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent("export async function load(u, c, n) { if (u.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return n(u, c); }"));
globalThis.window = globalThis;
const realLog = console.log;
console.warn = console.error = () => {};
globalThis.addEventListener = globalThis.removeEventListener = () => {};
const cv = () => ({ width: 0, height: 0, style: {}, querySelector: () => cv(), querySelectorAll: () => [], children: [], insertBefore() {}, appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }) });
globalThis.document = { createElement: () => cv(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, activeElement: null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const THREE = await import('three');
const { generateLayout, buildFacility } = await import('../../src/world/facility.js');
const IX = await import('../../src/world/interiors/index.js');
const { checkStairs } = await import('../../src/world/stairs.js');
const { doorLanes } = await import('../../src/world/interiors/labyr10_kit.js');
const { SFX, renderSfx } = await import('../../src/audio/sfxlib.js');
const { TR, RU } = await import('../../src/game/labyr12_text.js');
const C12 = await import('../../src/game/labyr12_core.js');
const { LAB12_HINT, KNOCK, HZ } = C12;
let BOXES = null;
const mkPhysics = () => ({ addStaticBox(x, y, z, hx, hy, hz, rot) { const b = { x, y, z, hx, hy, hz, rot }; BOXES?.push(b); return b; }, removeCollider() {} });
const lightPool = { add(e) { return e; }, remove() {} };
let fails = 0;
const bad = (m) => { fails++; realLog('FAIL', m); };
const okc = (c, m) => { if (!c) bad(m); };

function reach(L) {
  const seen = new Uint8Array(L.w * L.h), q = [...new Set(L.entrySources)];
  for (const s of q) seen[s] = 1;
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % L.w, z = (q[i] / L.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d];
      if (nx < 0 || nz < 0 || nx >= L.w || nz >= L.h) continue;
      const k = L.edgeKey(x, z, d), j = L.idx(nx, nz), inf = L.edgeInfo.get(k);
      if (!L.cells[j] || seen[j] || !L.open.has(k)) continue;
      if (inf && (inf.type === 'vault' || inf.type === 'contain' || (inf.type === 'door' && inf.locked))) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return seen;
}
const sealed = (L, i) => { const r = L.roomOf[i]; return r >= 0 && (['vault', 'core'].includes(L.rooms[r].type) || L.rooms[r].treasure || L.rooms[r].arena); };
const unreached = (L) => { const s = reach(L); let n = 0; for (let i = 0; i < L.w * L.h; i++) if (L.cells[i] && !s[i] && !sealed(L, i)) n++; return n; };
const meshCount = (fac) => { let n = 0; fac.group.traverse((o) => { if (o.isMesh || o.isInstancedMesh) n++; }); return n; };

// ---------------------------------------------------------------- registry + hooks + strings + sounds
for (const id of ['darkweb', 'hotel']) {
  const d = IX.getInterior(id);
  okc(IX.isInteriorTheme(id) && d.id === id, `${id}: not registered`);
  okc(IX.INTERIOR_THEMES.includes(id) && IX.INTERIOR_NAMES[id] === d.name, `${id}: name list`);
  okc(!!IX.interiorAtmosphere(id) && IX.interiorAmbience(id)?.base === `ambience_${id}`, `${id}: ambience / atmosphere`);
  okc(!!SFX[`ambience_${id}`], `${id}: ambience sound missing`);
  okc(TR[d.name] && RU[d.name] && TR[d.blurb] && RU[d.blurb], `${id}: name / blurb TR + RU`);
  okc(TR[LAB12_HINT[id]] && RU[LAB12_HINT[id]], `${id}: mechanic hint TR + RU`);
  for (const ty of Object.keys(d.style.rooms)) okc(!!d.style.rooms[ty].floor && !!d.style.rooms[ty].wall, `${id}: style ${ty}`);
  for (const [ty] of d.roomTypes) okc(!!d.style.rooms[ty], `${id}: roomTypes ${ty} has no style`);
}
{
  const atm = IX.interiorAtmosphere('darkweb');
  okc(atm.hemi <= 0.02 && atm.ambient === 0 && atm.density >= 0.08, 'darkweb: not dark enough (hemi / ambient / fog)');
  okc(Object.entries(IX.getInterior('darkweb').style.rooms).every(([k, s]) => /^(m2_|lim_)/.test(k) || !s.lamp), 'darkweb: a room style carries a lamp');
}
for (const k of Object.keys(TR)) okc(RU[k], `RU missing: ${k}`);
for (const k of Object.keys(RU)) okc(TR[k], `TR missing: ${k}`);
for (const s of ['ambience_darkweb', 'ambience_hotel', 'dw_ping', 'hz_chime']) {
  try {
    const out = renderSfx(s, 8000), ch = out.channels[0];
    let pk = 0, bad2 = 0; for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (!Number.isFinite(a)) bad2++; else if (a > pk) pk = a; }
    okc(bad2 === 0 && pk > 0.05, `sound ${s}: silent or non-finite (peak ${pk}, bad ${bad2})`);
  } catch (e) { bad(`sound ${s} threw ${e.stack}`); }
}

// ---------------------------------------------------------------- pure rules
{
  okc(C12.pulseRadius(0.7) < C12.pulseRadius(1.4) && C12.pulseRadius(99) <= 26 && C12.pulseRadius(0) >= 8, 'pulseRadius monotone / capped');
  okc(!C12.drawsPulse(0.3) && C12.drawsPulse(0.7) && C12.drawsPulse(KNOCK.loud), 'drawsPulse thresholds (walking step no, sprint step yes)');
  const R = C12.pulseRadius(1.4);
  okc(C12.echoLight(R * 0.5, R, 0.05) < 0.1, 'echo: the front has not reached far walls yet');
  const front = 0.5 * KNOCK.speed;
  okc(C12.echoLight(front, R, 0.5) > 0.5, 'echo: the ring is bright at the wave front');
  okc(C12.echoLight(3, R, 0.5) > 0 && C12.echoLight(3, R, 0.5) < C12.echoLight(front, R, 0.5), 'echo: behind the ring is dimmer than the ring');
  okc(C12.echoLight(3, R, KNOCK.life) === 0 && C12.echoLight(3, R, 5) === 0, 'echo: a pulse ends after its life');
  for (let n = 0; n < 40; n++) for (const [a, b] of [[0, 1], [1, 0], [0, 2], [2, 1]]) { const r = C12.hzRide(1234, n, a, b); okc(r.warn === 3 && r.dur >= 5 && r.dur <= 8, `ride ${a}->${b} #${n}: dur ${r.dur}`); }
  okc(JSON.stringify(C12.hzRide(9, 3, 0, 2)) === JSON.stringify(C12.hzRide(9, 3, 0, 2)), 'ride deterministic');
  okc(C12.hzProgress(6, 0) === 0 && C12.hzProgress(6, 6) === 1 && C12.hzProgress(6, 3) === 0.5 && C12.hzProgress(6, 99) === 1, 'hzProgress');
  let dark = 0, hot = 0, t1 = 0, old = 0;
  for (let i = 0; i < 400; i++) {
    const a = C12.labInterior12('run' + i, i % 7, i % 3, i % 2 ? 'datascape' : 'snow', 3, 'factory');
    if (a === 'darkweb') dark++; else if (a === 'hotel') hot++;
    if (C12.labInterior12('run' + i, 1, 1, 'snow', 1, 'factory')) t1++;
    if (C12.labInterior12('run' + i, 1, 1, 'snow', 3, 'metro')) old++;
    okc(C12.labInterior12('run' + i, 2, 1, 'snow', 3, 'office') === C12.labInterior12('run' + i, 2, 1, 'snow', 3, 'office'), 'labInterior12 deterministic');
  }
  okc(dark > 10 && hot > 10 && t1 === 0 && old === 0, `moon pool: darkweb ${dark} hotel ${hot} tier1 ${t1} over-a-lab ${old}`);
}

// ---------------------------------------------------------------- generation + build
const SEEDS = [1234, 987, 40417], SIZES = [1.0, 1.6];
const counts = {}, REF = {};
for (const size of SIZES) for (const ref of ['office', 'metro', 'hospital']) { const L = generateLayout(1234, ref, size); const f = buildFacility(L, { physics: mkPhysics(), lightPool }); (REF[size] ||= {})[ref] = meshCount(f); f.dispose({ removeCollider() {} }); }
const stats = { spots: 0, spawn: 0, heroItems: 0, paths: 0, elevated: 0, doors: 0, segs: 0 };
let sample = { darkweb: null, hotel: null };
for (const theme of ['darkweb', 'hotel']) for (const seed of SEEDS) for (const size of SIZES) {
  const tag = `${theme}/${seed}/${size}`;
  const L = generateLayout(seed, theme, size);
  okc(unreached(L) === 0, `${tag}: unreachable cells ${unreached(L)}`);
  okc(L.fireExits.length >= 1, `${tag}: no fire exit`);
  const hubType = theme === 'darkweb' ? 'dw_market' : 'hotel_core';
  okc(L.rooms.some((r) => r.type === hubType && r.hub), `${tag}: no ${hubType} hub`);
  BOXES = [];
  let fac;
  try { fac = buildFacility(L, { physics: mkPhysics(), lightPool }); } catch (e) { bad(`${tag}: build threw ${e.stack}`); continue; }
  const lab = fac.lab;
  okc(lab && lab.id === theme, `${tag}: no lab`);
  if (!lab) continue;
  okc(BOXES.every((b) => Number.isFinite(b.x + b.y + b.z + b.hx + b.hy + b.hz)), `${tag}: NaN collider`);
  let lights = 0; fac.group.traverse((o) => { if (o.isLight) lights++; }); okc(lights === 0, `${tag}: ${lights} THREE lights in the facility group`);
  // spots
  const sp = fac.scrapSpots;
  okc(sp.length >= 20, `${tag}: only ${sp.length} scrap spots`);
  stats.spots += sp.length;
  for (const s of sp) okc(Number.isFinite(s.x + s.z + s.y), `${tag}: NaN scrap spot`);
  okc((lab.spawnSpots?.length || 0) >= 4, `${tag}: spawn spots ${lab.spawnSpots?.length}`);
  stats.spawn += lab.spawnSpots?.length || 0;
  const heroes = sp.filter((s) => s.hero && s.item);
  okc(heroes.length >= 1, `${tag}: no guaranteed hero item spot`);
  stats.heroItems += heroes.length;
  const md = fac.mainDoor?.spawn;
  if (md) {
    const starts = [md, ...fac.fireDoors.slice(0, L.outdoorFires).map((f) => f.spawn).filter(Boolean)];   // the generator's own rule: reachable from the entrance OR an outdoor-twin fire exit
    for (const h of heroes.filter((s) => !s.elevated)) { okc(fac.nav.walkableAt(h.x, h.z) && starts.some((st) => fac.nav.findPath(st.x, st.z, h.x, h.z, 90000)), `${tag}: no nav path to hero spot ${h.item}`); stats.paths++; }
    const lockedRoom = (s) => { const ci = fac.cellAt(s.x, s.z), ri = ci >= 0 ? L.roomOf[ci] : -1; return ri >= 0 && !!(L.rooms[ri].treasure || L.rooms[ri].arena); };   // treasure rooms are locked on purpose (blood-trail spots may sit there)
    const ground = sp.filter((s) => !s.elevated && !s.sealed && !lockedRoom(s));
    for (let i = 0; i < ground.length; i += Math.max(1, Math.floor(ground.length / 14))) {
      const s = ground[i];
      if (!starts.some((st) => fac.nav.findPath(st.x, st.z, s.x, s.z, 90000))) bad(`${tag}: no nav path to spot ${s.type} (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
      stats.paths++;
    }
  }
  // doors never blocked: (1) none of THIS theme's ground-level solids stands in a doorway lane; (2) every open arch / unlocked door can be crossed on the nav grid
  let blocked = 0, crossed = 0;
  const lanes = doorLanes(L);
  for (const c of lab.solids || []) {
    if (c.ramp || c.y + c.sy / 2 < L.y + 0.1 || c.y - c.sy / 2 > L.y + 2.4) continue;
    for (const l of lanes) if (l[2] > c.x - c.sx / 2 + 0.02 && l[0] < c.x + c.sx / 2 - 0.02 && l[3] > c.z - c.sz / 2 + 0.02 && l[1] < c.z + c.sz / 2 - 0.02) { blocked++; if (blocked < 4) bad(`${tag}: own solid in a door lane @${c.x.toFixed(1)},${c.z.toFixed(1)}`); break; }
  }
  for (const inf of L.edgeInfo.values()) {
    if (!['arch', 'door'].includes(inf.type) || (inf.type === 'door' && inf.locked) || fac.nav.blockedEdges.has(inf.key)) continue;
    const ex = L.ox + inf.cx * L.cell, ez = L.oz + inf.cz * L.cell, ax = inf.dir === 0 ? 1 : 0, az = inf.dir === 0 ? 0 : 1;
    const path = fac.nav.findPath(ex - ax * 2.2, ez - az * 2.2, ex + ax * 2.2, ez + az * 2.2, 4000);
    let len = 0; if (path) for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    crossed++;
    if (!path || len > 11) bad(`${tag}: ${inf.type} @${ex.toFixed(1)},${ez.toFixed(1)} is blocked on the nav grid (${path ? len.toFixed(1) + ' m detour' : 'no path'})`);
  }
  stats.doors += crossed;
  const mc = meshCount(fac), refMax = Math.max(...Object.values(REF[size]));
  okc(mc <= refMax * 1.25, `${tag}: ${mc} meshes vs older themes ${JSON.stringify(REF[size])}`);
  counts[tag] = mc;

  if (theme === 'darkweb') {
    const st = lab.stats, E = lab.echo;
    okc(E && E.segments >= 2000 && E.walls >= 150 && E.doors >= 10, `${tag}: echo shell ${JSON.stringify(st)}`);
    okc(E.mesh.geometry.attributes.position.count === E.segments * 2 && E.mesh.isLineSegments && E.mesh.material.depthTest && !E.mesh.material.depthWrite, `${tag}: echo mesh setup`);
    okc(E.mat.uniforms.uLife.value === KNOCK.life && E.mat.uniforms.uSpeed.value === KNOCK.speed, `${tag}: shader constants match the rules`);
    E.setPulses([1, 2, 3, 4, 5].map((n) => ({ x: n, y: 0, z: n, age: 0.1 * n, radius: 20 })));
    okc(E.mat.uniforms.uP.value.filter((v) => v.w >= 0).length === 4, `${tag}: setPulses takes 4`);
    E.setPulses([]); okc(E.mat.uniforms.uP.value.every((v) => v.w < 0), `${tag}: setPulses clears`);
    okc(st.strips >= 20 && st.frames >= 10 && st.cables >= 5, `${tag}: trim ${JSON.stringify(st)}`);
    okc(lab.chase.a.length >= 1 && lab.chase.b.length >= 1, `${tag}: packet sets`);
    lab.tick(0, 0.0); const a0 = lab.chase.a[0].visible; lab.tick(0, 0.5); okc(lab.chase.a[0].visible !== a0, `${tag}: packets do not crawl`);
    okc(lab.hero?.kind === 'auction' && heroes.some((h) => h.item === 'goldbar' && h.type === 'dw_hero'), `${tag}: auction hero / gold bar`);
    okc(lab.hero?.stalls >= 2, `${tag}: market stalls ${lab.hero?.stalls}`);
    stats.segs += E.segments;
  } else {
    const st = lab.stats, Y = L.y;
    okc(lab.plans.length === 3 && lab.plans.every((p) => checkStairs(p).length === 0), `${tag}: stairs ${lab.plans.map((p) => checkStairs(p).join(',')).join('|')}`);
    for (let k = 1; k <= 3; k++) {
      const pl = lab.plans[k - 1], h = lab.holes[k];
      okc(Math.abs(pl.top.y - lab.ys[k]) < 0.02 && Math.abs(pl.y - lab.ys[k - 1]) < 0.02, `${tag}: flight ${k} does not join level ${k - 1} to ${k}`);
      okc(pl.top.at[0] >= h[0] - 0.01 && pl.top.at[0] <= h[2] + 0.01 && Math.abs(pl.top.at[1] - (h[1] + h[3]) / 2) < 0.05, `${tag}: flight ${k} top is not inside the hole of slab ${k}`);
      // headroom: everywhere the ramp passes under slab k (outside the hole) there must be 2.1 m of air
      for (let a = 0; a <= pl.run; a += 0.2) {
        const x = pl.x + pl.dir[0] * a, z = pl.z + pl.dir[1] * a, y = pl.y + pl.rise * a / pl.run;
        const inHole = x >= h[0] && x <= h[2] && z >= h[1] && z <= h[3];
        if (!inHole && y + 2.1 > lab.ys[k] - 0.3 + 1e-6) { bad(`${tag}: flight ${k} hits its head under slab ${k} at a=${a.toFixed(1)}`); break; }
      }
      okc(h[0] > lab.cx - 9 && h[2] < lab.cx + 9, `${tag}: hole ${k} outside the core`);
      // the top landing can be left sideways: nothing (rail, wall, furniture) stands within 0.6 m of it at walking height
      {
        const tx = pl.top.at[0], tz = pl.top.at[1], x0 = Math.min(tx, tx + pl.dir[0] * 0.6), x1 = Math.max(tx, tx + pl.dir[0] * 0.6);
        for (const c of lab.solids) {
          if (c.ramp || c.y + c.sy / 2 < lab.ys[k] + 0.25 || c.y - c.sy / 2 > lab.ys[k] + 1.6) continue;
          if (c.x + c.sx / 2 > x0 + 0.02 && c.x - c.sx / 2 < x1 - 0.02 && c.z + c.sz / 2 > tz - 1.35 && c.z - c.sz / 2 < tz + 1.35) { bad(`${tag}: something blocks the top landing of flight ${k} @${c.x.toFixed(2)},${c.z.toFixed(2)} ${c.sx.toFixed(2)}x${c.sy.toFixed(2)}x${c.sz.toFixed(2)}`); break; }
        }
      }
    }
    okc(lab.gates.length === HZ.stops && lab.gates[0].col === null && lab.gates.slice(1).every((g) => g.col && g.mesh.visible) && !lab.gates[0].mesh.visible, `${tag}: gates`);
    okc(lab.cab && Math.abs(lab.cab.position.y - lab.ys[0]) < 1e-6, `${tag}: cab not at the lobby`);
    okc(lab.cabX - lab.cabHalf[0] > lab.shaft.x0 && lab.cabX + lab.cabHalf[0] < lab.shaft.x1 && lab.cabZ - lab.cabHalf[1] > lab.shaft.z0 && lab.cabZ + lab.cabHalf[1] < lab.shaft.z1, `${tag}: cab does not fit the shaft`);
    okc(lab.dnd.length >= 5 && lab.dnd.every((q) => q.col && q.pivot && q.leaf && !q.open), `${tag}: DND doors ${lab.dnd.length}`);
    okc(new Set(lab.dnd.map((q) => q.room)).size === lab.dnd.length, `${tag}: duplicate room numbers`);
    const elevated = sp.filter((s) => s.elevated);
    stats.elevated += elevated.length;
    okc(elevated.length >= 12 && [1, 2, 3].every((k) => elevated.some((s) => s.level === k)), `${tag}: elevated spots ${elevated.length}`);
    okc(elevated.filter((s) => s.dnd != null).length >= 3, `${tag}: DND loot spots ${elevated.filter((s) => s.dnd != null).length}`);
    okc(sp.filter((s) => s.hero && s.item === 'key').length >= 2, `${tag}: master keys ${sp.filter((s) => s.hero && s.item === 'key').length}`);
    okc(sp.some((s) => s.hero && s.item === 'ring' && s.level === 3 && s.elevated), `${tag}: hidden suite hero ring`);
    okc(lab.hero?.kind === 'suite' && lab.hero.room === 1313, `${tag}: hero suite`);
    okc(lab.flick.length >= 5, `${tag}: hidden floor sconces ${lab.flick.length}`);
    okc(st.plaques >= 4 && st.guests >= 4 && st.sealed >= 20 && st.open >= 8, `${tag}: rooms ${JSON.stringify(st)}`);
    okc(lab.lobby.placed >= 1, `${tag}: lobby furniture ${lab.lobby.placed}`);
    okc(Math.abs(fac.layout.rooms.find((r) => r.type === 'hotel_core').height - HZ.floorH * HZ.levels) < 1e-6, `${tag}: hub height`);
    void Y;
  }
  if (seed === SEEDS[0] && size === SIZES[0]) sample[theme] = { fac, L, lab };
  // determinism: same seed, same layout + same build signature
  if (seed === SEEDS[0] && size === SIZES[0]) {
    const sig = (f) => JSON.stringify([f.layout.rooms.map((r) => [r.type, r.x, r.z, r.w, r.h]), f.scrapSpots.length, f.scrapSpots.slice(0, 8).map((s) => [+s.x.toFixed(2), +s.z.toFixed(2), s.item || '']), f.lab.stats]);
    const s1 = sig(fac);
    BOXES = [];
    const f2 = buildFacility(generateLayout(seed, theme, size), { physics: mkPhysics(), lightPool });
    okc(s1 === sig(f2), `${tag}: not deterministic`);
    f2.dispose({ removeCollider() {} });
  } else fac.dispose({ removeCollider() {} });
}

// ---------------------------------------------------------------- runtime module on a stub game
function mkGame(fac, { host = true, selfId = 'me', seed = 1234 } = {}) {
  const handlers = new Map(), listeners = new Map(), H = new Map(), out = { fx: [], all: [], sent: [], toasts: [], sfx: [], audio: [], noises: [], removed: [], added: [] };
  const net = {
    isHost: host, selfId,
    on(type, fn) { listeners.set(type, fn); }, off() {},
    request(a, d) { const fn = handlers.get(a); if (fn) fn({ a, ...d }, selfId); },
    broadcast(t, d) { out.all.push([t, d]); if (t === 'lab12fx') out.fx.push(d); const fn = listeners.get('msg:' + t); if (fn) fn(d); },
    sendTo(id, t, d) { out.sent.push([id, t, d]); },
  };
  const mods = { on(e, fn) { (H.get(e) || H.set(e, []).get(e)).push(fn); return () => {}; } };
  const player = { pos: new THREE.Vector3(), dead: false, indoor: true, teleports: 0, held: null, teleport(v) { this.pos.copy(v); this.teleports++; }, heldItem() { return this.held; } };
  const items = new Map();
  const game = {
    mods, net, isHost: host, selfId, run: { seed, phase: 'moon', moon: 'x' }, world: { facility: fac }, player, remotes: new Map(), items: { get: (id) => items.get(id) },
    creatures: { noise(pos, loud, owner) { out.noises.push([pos, loud, owner]); } },
    physics: { addStaticBox() { const c = { id: out.added.length }; out.added.push(c); return c; }, removeCollider(c) { out.removed.push(c); } },
    ui: { hud: { toast: (m) => out.toasts.push(m) } }, sfx: (id) => out.sfx.push(id), audio: { at: (id, pos, v) => out.audio.push(id) },
    input: { enabled: true, pressed: null, codePressed(c) { return this.pressed === c; } },
  };
  return { game, net, H, handlers, out, items, player, listeners };
}
function boot(g, install) {
  const api = install(g.game);
  for (const fn of g.H.get('registerHandlers') || []) fn((name, f) => g.handlers.set(name, f), g.game);
  const upd = (dt) => { for (const fn of g.H.get('update') || []) fn(dt, g.game); };
  const inter = () => { const o = []; for (const fn of g.H.get('interactables') || []) fn(o, g.game); return o; };
  return { api, upd, inter };
}
{
  const { installLabyr12 } = await import('../../src/game/labyr12.js');
  const { ITEMS, SCRAP_TABLE, BIG_TABLES } = await import('../../src/game/items.js');
  const M12 = await import('../../src/game/labyr12.js');
  for (const [id] of [...M12.DARK_SCRAP, ...M12.HOTEL_SCRAP, ...M12.DARK_BIG, ...M12.HOTEL_BIG]) okc(!!ITEMS[id], `loot table item ${id} does not exist`);
  for (const hi of ['goldbar', 'key', 'ring', ...['perfume', 'painting', 'trophy', 'tv', 'lamp', 'bell']]) okc(!!ITEMS[hi], `guaranteed item ${hi} does not exist`);
  for (const theme of ['darkweb', 'hotel']) {
    const { bedFor, contextOf } = await import('../../src/game/atmos_core.js');
    const bed = bedFor(contextOf({ phase: 'moon', indoor: true, theme }));
    okc(bed && bed.layers.length >= 2 && bed.events.length >= 4 && bed.gap[1] > bed.gap[0], `${theme}: atmosphere bed`);
  }

  // ------------- dark web
  {
    const { fac } = sample.darkweb;
    const g = mkGame(fac), { api, upd } = boot(g, installLabyr12), lab = fac.lab;
    const origNoise = g.game.creatures.noise;
    okc(SCRAP_TABLE.darkweb?.length > 10 && BIG_TABLES.darkweb?.length >= 3 && SCRAP_TABLE.hotel?.length > 10, 'loot tables not installed');
    const LH = (await import('../../src/game/labyrinths_core.js')).LAB_HINT;
    okc(LH.darkweb === LAB12_HINT.darkweb && LH.hotel === LAB12_HINT.hotel && !!LH.tower, 'mechanic hints not merged into LAB_HINT (landing card + terminal)');
    upd(0.1);
    okc(g.game.creatures.noise !== origNoise, 'creatures.noise not wrapped on the host');
    const pos = new THREE.Vector3(3, 5, 7), n = () => g.out.fx.filter((d) => d.k === 'p').length;
    g.game.creatures.noise(pos, 0.3, 'x'); okc(n() === 0, 'a walking step (0.3) drew a pulse');
    g.game.creatures.noise(pos, 0.7, 'x'); okc(n() === 1, 'a sprint step (0.7) drew no pulse');
    g.game.creatures.noise(pos, 3, 'x'); okc(n() === 1, 'two noises in one instant were not merged');
    okc(g.out.noises.length === 3 && g.out.noises.every((q) => q[0] === pos), 'the original creatures.noise did not run for every noise');
    upd(0.5); g.game.creatures.noise(pos, 3, 'x'); okc(n() === 2, 'a gunshot after 0.5 s drew no pulse');
    okc(api.state.pulses === 2, `pulses on this peer ${api.state.pulses}`);
    upd(0.05); okc(lab.echo.mat.uniforms.uP.value.some((v) => v.w >= 0), 'echo uniforms not fed');
    upd(2.0); okc(api.state.pulses === 0 && lab.echo.mat.uniforms.uP.value.every((v) => v.w < 0), 'pulses did not expire');
    // knock: per-player cooldown, alerts creatures once, exactly one pulse
    g.player.pos.set(10, -290, 10);
    const before = g.out.noises.length;
    g.net.request('lab12req', { op: 'knock' });
    okc(n() === 3 && g.out.noises.length === before + 1 && g.out.noises.at(-1)[1] === KNOCK.loud, 'knock: one pulse + one loud noise');
    upd(1.0); g.net.request('lab12req', { op: 'knock' }); okc(n() === 3, 'knock: cooldown ignored');
    g.game.remotes.set('peer', { pos: new THREE.Vector3(12, -290, 12) });
    api.hostKnock('peer'); okc(n() === 4, 'knock: a second player must have their own cooldown');
    upd(2.0); api.hostKnock('me'); okc(n() === 5, 'knock: cooldown never ends');
    // input key
    g.game.input.pressed = KNOCK.key; upd(3.0); okc(n() === 6, 'key M does not knock');
    g.game.input.pressed = KNOCK.key; upd(0.1); okc(n() === 6, 'key M: local cooldown ignored');
    g.game.input.pressed = null;
    // not in the dark web / not on the moon: nothing
    g.game.run.phase = 'orbit'; g.game.creatures.noise(pos, 3, 'x'); okc(n() === 6, 'pulse outside the moon phase');
    g.game.run.phase = 'moon';
    okc(typeof api.debug.info === 'function' && api.debug.info().id === 'darkweb', 'debug.info');
    api.dispose(); okc(g.game.creatures.noise === origNoise, 'dispose did not unwrap creatures.noise');
  }

  // ------------- hotel
  {
    const { fac, lab: lab0 } = sample.hotel;
    const lab = fac.lab;
    okc(lab === lab0, 'sample lab');
    const g = mkGame(fac), { api, upd, inter } = boot(g, installLabyr12);
    let E = api._state.elev;
    const inCab = () => g.player.pos.set(lab.cabX + 0.3, lab.ys[0] + 0.05, lab.cabZ - 0.2);
    inCab(); upd(0.05); E = api._state.elev;
    // the call panel + the cab buttons show up
    let it = inter();
    okc(it.length === 3, `interactables in the cab at the lobby: ${it.length} (want 2 buttons + the dead one)`);
    okc(it.some((q) => /13/.test(q.label())), 'the missing floor 13 button');
    g.net.request('lab12req', { op: 'go', to: 0 }); okc(g.out.fx.length === 0, 'go to the same level accepted');
    g.net.request('lab12req', { op: 'go', to: 5 }); okc(g.out.fx.length === 0, 'go to an unknown level accepted');
    g.net.request('lab12req', { op: 'go', to: 2 });
    const go = g.out.fx.find((d) => d.k === 'go');
    okc(go && go.from === 0 && go.to === 2 && go.warn === 3 && go.dur >= 5 && go.dur <= 8, `go message ${JSON.stringify(go)}`);
    okc(E.phase === 'warn', 'phase after go: ' + E.phase);
    g.net.request('lab12req', { op: 'go', to: 1 }); okc(g.out.fx.filter((d) => d.k === 'go').length === 1, 'a second go during the warning was accepted');
    okc(g.out.toasts.some((m) => /Doors closing/.test(m)), 'no door warning toast');
    // warn: 3 s, chime x3, doors still open; then ride
    let t = 0, addedAtWarn = g.out.added.length;
    while (t < 2.9) { upd(0.05); t += 0.05; }
    okc(E.phase === 'warn' && g.out.audio.filter((a) => a === 'hz_chime').length === 3, `warn phase ${E.phase}, chimes ${g.out.audio.filter((a) => a === 'hz_chime').length}`);
    okc(g.out.added.length === addedAtWarn && !lab.gates[0].mesh.visible, 'doors closed before the warning ended');
    while (E.phase === 'warn' && t < 5) { upd(0.05); t += 0.05; }
    okc(E.phase === 'ride' && E.rider === true, 'no ride / rider after the warning');
    okc(lab.gates[0].mesh.visible && g.out.added.length === addedAtWarn + 1, 'the doors did not close (mesh + collider)');
    okc(g.out.noises.some((q) => q[1] === HZ.noise), 'the motor made no noise');
    let prev = lab.cab.position.y, mono = true, ride = 0, tp0 = g.player.teleports;
    while (E.phase === 'ride' && ride < 12) { upd(0.05); ride += 0.05; if (lab.cab.position.y < prev - 1e-9) mono = false; prev = lab.cab.position.y; if (E.phase === 'ride') okc(Math.abs(g.player.pos.y - (lab.cab.position.y + 0.03)) < 1e-6, 'the rider is not on the car'); }
    okc(mono && Math.abs(ride - go.dur) < 0.2, `ride ${ride.toFixed(2)} s vs ${go.dur}`);
    okc(E.phase === 'idle' && E.at === 2 && Math.abs(lab.cab.position.y - lab.ys[2]) < 1e-6 && g.player.teleports > tp0 + 20, 'did not arrive on level 2');
    okc(!lab.gates[2].mesh.visible && lab.gates[2].col === null && g.out.removed.includes(lab.gates[2].col) === false, 'the destination door did not open');
    okc(lab.gates[2].ind.color.getHex() === 0x33ff66 && lab.gates[0].ind.color.getHex() === 0xff3322, 'indicator lamps');
    okc(g.out.audio.includes('bell_ding'), 'no arrival bell');
    // a player left outside: called from the lobby ring, not in the cab
    g.player.pos.set(lab.gateX - 3, lab.ys[0] + 0.05, lab.gateZ + 3); const tp1 = g.player.teleports;
    upd(0.05); it = inter();
    okc(it.length === 1 && /Call/.test(it[0].label()), `call panel interactables at the lobby: ${it.length}`);
    g.net.request('lab12req', { op: 'go', to: 0 });
    okc(g.out.fx.filter((d) => d.k === 'go').length === 2, 'the call from outside was refused');
    t = 0; while (E.phase !== 'idle' && t < 30) { upd(0.05); t += 0.05; }
    okc(E.at === 0 && g.player.teleports === tp1, 'an outsider was carried by the car');
    okc(g.out.toasts.some((m) => /left without you/.test(m)) === false, 'left-behind toast fired for a car that was called TO the player (should not: they are outside on purpose)' + ' - informational');
    // a far away player cannot call the car
    g.player.pos.set(lab.gateX + 40, lab.ys[0], lab.gateZ); g.net.request('lab12req', { op: 'go', to: 1 }); okc(g.out.fx.filter((d) => d.k === 'go').length === 2, 'a far player called the car');

    // DND doors: key required, consumed on the host, reach checked
    const dd = lab.dnd[0], key = { id: 'k1', type: 'key', holder: 'me' };
    g.items.set('k1', key); g.items.set('m1', { id: 'm1', type: 'mug', holder: 'me' }); g.items.set('k2', { id: 'k2', type: 'key', holder: 'peer' });
    g.player.pos.set(dd.x, dd.y + 0.05, dd.z + 1.0);
    g.player.held = null; upd(0.05); it = inter();
    okc(it.some((q) => /DO NOT DISTURB/.test(q.label())), 'no DND prompt without a key');
    g.player.held = key; upd(0.05); it = inter();
    okc(it.some((q) => /Unlock the room/.test(q.label())), 'no unlock prompt with a key');
    g.net.request('lab12req', { op: 'dnd', id: dd.id, key: 'm1' }); okc(!dd.open, 'a mug opened a DND door');
    g.net.request('lab12req', { op: 'dnd', id: dd.id, key: 'k2' }); okc(!dd.open, 'someone else\'s key opened a DND door');
    g.net.request('lab12req', { op: 'dnd', id: dd.id }); okc(!dd.open, 'no key opened a DND door');
    g.player.pos.set(dd.x + 30, dd.y, dd.z); g.net.request('lab12req', { op: 'dnd', id: dd.id, key: 'k1' }); okc(!dd.open, 'a far player opened a DND door');
    g.player.pos.set(dd.x, dd.y + 0.05, dd.z + 1.0);
    const col0 = dd.col;
    g.net.request('lab12req', { op: 'dnd', id: dd.id, key: 'k1' });
    okc(dd.open && dd.col === null && g.out.removed.includes(col0), 'the key did not open the door / remove its collider');
    okc(g.out.all.some(([ty, d]) => ty === 'it' && d.e === 'rm' && d.id === 'k1'), 'the key was not consumed');
    for (let i = 0; i < 20; i++) upd(0.05);
    okc(Math.abs(dd.pivot.rotation.y - (dd.th0 + dd.swing)) < 1e-6, 'the door did not swing open');
    g.net.request('lab12req', { op: 'dnd', id: dd.id, key: 'k1' }); okc(g.out.all.filter(([ty, d]) => ty === 'it').length === 1, 'an open door took a second key');
    // late join: the host answers a sync with the current state
    g.net.request('lab12req', { op: 'sync' });   // (from the host itself)
    api.hostReq({ op: 'sync' }, 'peer2');
    const st = g.out.sent.find(([id, ty]) => id === 'peer2' && ty === 'lab12fx');
    okc(st && st[2].k === 'hstate' && st[2].at === E.at && st[2].dnd.includes(dd.id), `sync reply ${JSON.stringify(st)}`);
    // a fresh client applies it
    const fac2 = buildFacility(generateLayout(1234, 'hotel', 1.0), { physics: mkPhysics(), lightPool });
    const g2 = mkGame(fac2, { host: false, selfId: 'peer2' }), b2 = boot(g2, installLabyr12);
    g2.player.pos.set(fac2.lab.cx, fac2.lab.ys[0], fac2.lab.cz + 6); b2.upd(0.05);
    okc(g2.out.fx.length === 0 && !g2.out.all.length, 'client broadcast something');
    b2.api.onFx({ k: 'hstate', at: 2, n: 3, dnd: [0] });
    okc(Math.abs(fac2.lab.cab.position.y - fac2.lab.ys[2]) < 1e-6 && fac2.lab.dnd[0].open && !fac2.lab.gates[2].mesh.visible && fac2.lab.gates[0].mesh.visible, 'late-join state not applied');
    b2.api.dispose(); fac2.dispose({ removeCollider() {} });
    api.dispose();
  }
  // a hotel / dark web module must stay silent in other interiors
  {
    const L = generateLayout(77, 'office', 1.0), fac = buildFacility(L, { physics: mkPhysics(), lightPool });
    const g = mkGame(fac), { api, upd } = boot(g, installLabyr12);
    upd(0.1); g.game.creatures.noise(new THREE.Vector3(), 3, 'x'); g.net.request('lab12req', { op: 'knock' }); g.net.request('lab12req', { op: 'go', to: 1 });
    okc(g.out.fx.length === 0 && g.out.toasts.length === 0, 'the module reacted inside an office');
    api.dispose(); fac.dispose({ removeCollider() {} });
  }
}
for (const k of ['darkweb', 'hotel']) try { sample[k]?.fac?.dispose({ removeCollider() {} }); } catch { /* already gone */ }
realLog(`labyr12: meshes older themes ${JSON.stringify(REF)} | ${Object.entries(counts).map(([k, v]) => k.replace(/\/\d+\//, '/') + '=' + v).join(' ')}`);
realLog(`labyr12: spots total ${stats.spots}, elevated ${stats.elevated}, spawn spots ${stats.spawn}, hero item spots ${stats.heroItems}, nav paths ${stats.paths}, doorways crossed ${stats.doors}, echo segments ${stats.segs}`);
realLog(fails ? `labyr12: ${fails} FAILED` : 'labyr12: all ok');
process.exit(fails ? 1 : 0);
