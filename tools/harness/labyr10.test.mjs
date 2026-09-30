// [labyr10] node checks for the Dead Mall ('deadmall') and Mirror Funhouse ('funhouse') interiors: 3 seeds x 2 sizes each
//   registry + names + ambience / oneshot / atmosphere hooks, every cell reachable (locked doors closed), fire exit, real build: hero room + guaranteed item
//   spot + scrap spots + creature spawn spots, nav paths entrance -> hero / sample spots, doorways never blocked by a solid, escalator flight (checkStairs),
//   funhouse shell + chase sets, draw-call count vs office / metro, determinism (same seed = same signature), sounds render, TR / RU strings.
//   node tools/harness/labyr10.test.mjs
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent("export async function load(u, c, n) { if (u.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return n(u, c); }"));
globalThis.window = globalThis;
const realLog = console.log;
console.warn = console.error = () => {};
globalThis.addEventListener = globalThis.removeEventListener = () => {};
const cv = () => ({ width: 0, height: 0, style: {}, querySelector: () => cv(), querySelectorAll: () => [], children: [], insertBefore() {}, appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }) });
globalThis.document = { createElement: () => cv(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, activeElement: null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { generateLayout, buildFacility } = await import('../../src/world/facility.js');
const IX = await import('../../src/world/interiors/index.js');
const { checkStairs } = await import('../../src/world/stairs.js');
const { doorLanes } = await import('../../src/world/interiors/labyr10_kit.js');
const { SFX, renderSfx } = await import('../../src/audio/sfxlib.js');
const { TR, RU, PA_MALL, PA_FUN } = await import('../../src/game/labyr10_text.js');
const { MALL_BRANDS } = await import('../../src/render/labyr10_textures.js');
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

// ---------------------------------------------------------------- registry + hooks
for (const id of ['deadmall', 'funhouse']) {
  const d = IX.getInterior(id);
  okc(IX.isInteriorTheme(id) && d.id === id, `${id}: not registered`);
  okc(IX.INTERIOR_THEMES.includes(id) && IX.INTERIOR_NAMES[id] === d.name, `${id}: name list`);
  okc(!!IX.interiorAtmosphere(id) && IX.interiorAmbience(id)?.base === `ambience_${id}`, `${id}: ambience / atmosphere`);
  okc(!!SFX[`ambience_${id}`], `${id}: ambience sound missing`);
  okc(TR[d.name] && RU[d.name] && TR[d.blurb] && RU[d.blurb], `${id}: name / blurb TR + RU`);
  for (const ty of Object.keys(d.style.rooms)) okc(!!d.style.rooms[ty].floor && !!d.style.rooms[ty].wall, `${id}: style ${ty}`);
  for (const [ty] of d.roomTypes) okc(!!d.style.rooms[ty], `${id}: roomTypes ${ty} has no style`);
}
for (const l of [...PA_MALL, ...PA_FUN]) okc(TR[l] && RU[l], `PA line without TR + RU: ${l}`);
okc(MALL_BRANDS.length === 8, 'brand list');
for (const s of ['ambience_deadmall', 'ambience_funhouse', 'mall_chime', 'fun_honk']) {
  try {
    const out = renderSfx(s, 8000), ch = out.channels[0];
    let pk = 0, bad2 = 0; for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (!Number.isFinite(a)) bad2++; else if (a > pk) pk = a; }
    okc(bad2 === 0 && pk > 0.05, `sound ${s}: silent or non-finite (peak ${pk}, bad ${bad2})`);
  } catch (e) { bad(`sound ${s} threw ${e.stack}`); }
}

// ---------------------------------------------------------------- generation + build
const SEEDS = [1234, 987, 40417], SIZES = [1.0, 1.6];
const counts = {};
const REF = {};   // mesh counts of older themes per size (same seed)
for (const size of [1.0, 1.6]) for (const ref of ['office', 'metro', 'hospital']) { const L = generateLayout(1234, ref, size); const f = buildFacility(L, { physics: mkPhysics(), lightPool }); (REF[size] ||= {})[ref] = meshCount(f); f.dispose({ removeCollider() {} }); }
const stats = { spots: 0, spawn: 0, heroItems: 0, paths: 0, minSpots: 1e9 };
for (const theme of ['deadmall', 'funhouse']) for (const seed of SEEDS) for (const size of SIZES) {
  const tag = `${theme}/${seed}/${size}`;
  const L = generateLayout(seed, theme, size);
  okc(unreached(L) === 0, `${tag}: unreachable cells ${unreached(L)}`);
  okc(L.fireExits.length >= 1, `${tag}: no fire exit`);
  const hallRooms = theme === 'deadmall' ? L.rooms.filter((r) => r.mall) : L.rooms.filter((r) => r.fun);
  okc(hallRooms.length >= 4, `${tag}: plan not drawn (${hallRooms.length} plan rooms)`);
  if (theme === 'deadmall') {
    okc(L.rooms.some((r) => r.mall === 'atrium') && L.rooms.filter((r) => r.mall === 'promenade').length === 2 && L.rooms.some((r) => r.mall === 'concourse'), `${tag}: atrium / promenade / concourse`);
    okc(L.rooms.filter((r) => r.shop).length >= 8, `${tag}: only ${L.rooms.filter((r) => r.shop).length} shops`);
  } else {
    okc(L.rooms.some((r) => r.fun === 'spin' && r.w === 1 && r.h === 8) && L.rooms.some((r) => r.fun === 'maze' && r.maze), `${tag}: spin tunnel / mirror maze`);
    okc(L.mazes.some((m) => m.type === 'fun_maze'), `${tag}: maze not in layout.mazes`);
  }
  BOXES = [];
  let fac;
  try { fac = buildFacility(L, { physics: mkPhysics(), lightPool }); } catch (e) { bad(`${tag}: build threw ${e.stack}`); continue; }
  const lab = fac.lab;
  okc(lab && lab.id === theme, `${tag}: no lab`);
  okc(BOXES.every((b) => Number.isFinite(b.x + b.y + b.z + b.hx + b.hy + b.hz)), `${tag}: NaN collider`);
  // spots
  const sp = fac.scrapSpots;
  okc(sp.length >= 20, `${tag}: only ${sp.length} scrap spots`);
  stats.spots += sp.length; stats.minSpots = Math.min(stats.minSpots, sp.length);
  const heroSpot = sp.find((s) => s.hero && s.item);
  okc(!!heroSpot && fac.nav.walkableAt(heroSpot.x, heroSpot.z), `${tag}: no walkable guaranteed hero spot`);
  if (heroSpot) stats.heroItems++;
  okc((lab?.spawnSpots?.length || 0) >= 4, `${tag}: spawn spots ${lab?.spawnSpots?.length}`);
  stats.spawn += lab?.spawnSpots?.length || 0;
  for (const s of sp) okc(Number.isFinite(s.x + s.z + s.y), `${tag}: NaN scrap spot`);
  // nav: entrance -> hero + a sample of ground spots + the fire exit
  const md = fac.mainDoor?.spawn;
  if (md) {
    if (heroSpot) { const ok = fac.nav.findPath(md.x, md.z, heroSpot.x, heroSpot.z, 90000); okc(!!ok, `${tag}: no nav path entrance -> hero spot`); stats.paths++; }
    const ground = sp.filter((s) => !s.elevated && !s.sealed);
    for (let i = 0; i < ground.length; i += Math.max(1, Math.floor(ground.length / 14))) {
      const s = ground[i];
      const starts = [md, ...fac.fireDoors.slice(0, L.outdoorFires).map((f) => f.spawn).filter(Boolean)];   // the generator's own rule: reachable from the entrance OR an outdoor-twin fire exit
      if (!starts.some((st) => fac.nav.findPath(st.x, st.z, s.x, s.z, 90000))) bad(`${tag}: no nav path to spot ${s.type} (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
      stats.paths++;
    }
    const seen0 = reach({ ...L, entrySources: [L.idx(L.entrance.room.cx, L.entrance.room.cz)] });
    for (const fd of fac.fireDoors) { const fx = fd.spawn; if (fx && seen0[fac.cellAt(fx.x, fx.z)]) { okc(!!fac.nav.findPath(md.x, md.z, fx.x, fx.z, 90000), `${tag}: nav path entrance -> fire exit`); stats.paths++; } }
  }
  // doors never blocked: (1) none of THIS theme's solids (lab.solids) stands in a doorway lane; (2) every open arch / unlocked door can be crossed on the real nav grid
  let blocked = 0, crossed = 0;
  const lanes = doorLanes(L);
  for (const c of lab.solids || []) {
    if (c.ramp || c.y + c.sy / 2 < L.y + 0.1 || c.y - c.sy / 2 > L.y + 2.4) continue;   // ramps, decks and lintels above head height are not in the way
    for (const l of lanes) if (l[2] > c.x - c.sx / 2 + 0.02 && l[0] < c.x + c.sx / 2 - 0.02 && l[3] > c.z - c.sz / 2 + 0.02 && l[1] < c.z + c.sz / 2 - 0.02) { blocked++; if (blocked < 4) bad(`${tag}: own solid in a door lane @${c.x.toFixed(1)},${c.z.toFixed(1)} ${c.sx.toFixed(1)}x${c.sy.toFixed(1)}x${c.sz.toFixed(1)}`); break; }
  }
  for (const inf of L.edgeInfo.values()) {
    if (!['arch', 'door'].includes(inf.type) || (inf.type === 'door' && inf.locked) || fac.nav.blockedEdges.has(inf.key)) continue;
    const ex = L.ox + inf.cx * L.cell, ez = L.oz + inf.cz * L.cell, ax = inf.dir === 0 ? 1 : 0, az = inf.dir === 0 ? 0 : 1;
    const path = fac.nav.findPath(ex - ax * 2.2, ez - az * 2.2, ex + ax * 2.2, ez + az * 2.2, 4000);
    let len = 0; if (path) for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    crossed++;
    if (!path || len > 11) bad(`${tag}: ${inf.type} @${ex.toFixed(1)},${ez.toFixed(1)} is blocked on the nav grid (${path ? len.toFixed(1) + ' m detour' : 'no path'})`);
  }
  stats.doors = (stats.doors || 0) + crossed;
  okc(lanes.length > 0, `${tag}: lanes`);
  // draw calls comparable to the older themes
  const mc = meshCount(fac);
  const refMax = Math.max(...Object.values(REF[size]));
  okc(mc <= refMax * 1.25, `${tag}: ${mc} meshes vs older themes ${JSON.stringify(REF[size])}`);
  counts[tag] = mc;
  if (theme === 'deadmall') {
    const st = lab.stats;
    okc(st.signs >= 6 && st.grilles >= 2 && st.live >= 2, `${tag}: shopfronts ${JSON.stringify(st)}`);
    okc(st.kiosks + st.planters + st.benches >= 6, `${tag}: slalom furniture ${st.kiosks}/${st.planters}/${st.benches}`);
    okc(lab.hero?.kind === 'fountain' && lab.neon.length >= 1, `${tag}: fountain hero / neon`);
    for (const pl of lab.plans) okc(checkStairs(pl).length === 0, `${tag}: escalator ${checkStairs(pl).join(',')}`);
    // every brand board faces INTO a hall (normal + 1.2 m lands in a promenade / concourse / atrium cell, normal - 1.2 m does not)
    {
      const inHall = (x, z) => { const gx = Math.floor((x - L.ox) / L.cell), gz = Math.floor((z - L.oz) / L.cell); const ri = gx >= 0 && gz >= 0 && gx < L.w && gz < L.h ? L.roomOf[L.idx(gx, gz)] : -1; return ri >= 0 && !!L.rooms[ri].mall && L.rooms[ri].mall !== 'anchor'; };
      let n = 0, wrong = 0;
      lab.built.traverse((m) => {
        if (!m.isMesh || !String(m.userData.levelKey).startsWith('e:ml_sign_')) return;
        const P = m.geometry.attributes.position, N = m.geometry.attributes.normal;
        for (let i = 0; i < P.count; i += 4) { if (P.getY(i) < L.y + 2.5) continue; n++; const x = P.getX(i), z = P.getZ(i), nx = N.getX(i), nz = N.getZ(i); if (!inHall(x + nx * 1.2, z + nz * 1.2) || inHall(x - nx * 1.2, z - nz * 1.2)) wrong++; }
      });
      okc(n >= 6 && wrong <= Math.ceil(n * 0.1), `${tag}: brand boards facing the wrong way (${wrong} / ${n})`);
    }
    if (lab.deck) { okc(lab.plans.length === 1 && Math.abs(lab.plans[0].top.y - lab.deck.y) < 0.02, `${tag}: escalator top does not meet the deck`); okc(sp.some((s) => s.elevated && Math.abs(s.y - lab.deck.y) < 0.01), `${tag}: no elevated deck loot`); }
    else okc(size < 1.4, `${tag}: mezzanine missing at size ${size}`);
  } else {
    const st = lab.stats;
    okc(lab.hero?.kind === 'spinning_tunnel' && lab.shell && lab.shell.geometry, `${tag}: spinning tunnel`);
    okc(lab.chase.a.length >= 1 && lab.chase.b.length >= 1 && st.bulbs >= 60, `${tag}: carnival bulbs ${st.bulbs} a${lab.chase.a.length} b${lab.chase.b.length}`);
    okc(st.murals >= 2 && st.ghosts >= 2, `${tag}: murals ${st.murals} ghosts ${st.ghosts}`);
    const r0 = lab.shell.rotation.z; lab.tick(0.5, 1.0); okc(lab.shell.rotation.z > r0, `${tag}: shell does not spin`);
  }
  // determinism: same seed, same layout + same build signature
  if (seed === SEEDS[0] && size === SIZES[0]) {
    const sig = (f) => JSON.stringify([f.layout.rooms.map((r) => [r.type, r.x, r.z, r.w, r.h]), f.scrapSpots.length, f.scrapSpots.slice(0, 6).map((s) => [+s.x.toFixed(2), +s.z.toFixed(2)]), f.lab.stats]);
    const s1 = sig(fac); fac.dispose({ removeCollider() {} });
    BOXES = [];
    const f2 = buildFacility(generateLayout(seed, theme, size), { physics: mkPhysics(), lightPool });
    okc(s1 === sig(f2), `${tag}: not deterministic`);
    f2.dispose({ removeCollider() {} });
  } else fac.dispose({ removeCollider() {} });
}
// ---------------------------------------------------------------- runtime module on a stub game (loot tables, PA, neon flicker, shell + chase tick, dispose)
{
  const { installLabyr10, MALL_SCRAP, FUN_SCRAP, MALL_BIG, FUN_BIG } = await import('../../src/game/labyr10.js');
  const { ITEMS, SCRAP_TABLE, BIG_TABLES } = await import('../../src/game/items.js');
  for (const [id] of [...MALL_SCRAP, ...FUN_SCRAP, ...MALL_BIG, ...FUN_BIG]) okc(!!ITEMS[id], `loot table item ${id} does not exist`);
  for (const theme of ['deadmall', 'funhouse']) {
    const fac = buildFacility(generateLayout(1234, theme, 1.0), { physics: mkPhysics(), lightPool });
    const hs = [], toasts = [], sfx = [];
    const game = { mods: { on(e, fn) { if (e === 'update') hs.push(fn); return () => { hs.length = 0; }; } }, run: { seed: 1234, phase: 'moon' }, world: { facility: fac }, player: { indoor: true, dead: false }, ui: { hud: { toast: (m) => toasts.push(m) } }, sfx: (id) => sfx.push(id) };
    const api = installLabyr10(game);
    okc(SCRAP_TABLE[theme]?.length > 10 && BIG_TABLES[theme]?.length > 2, `${theme}: loot tables not installed`);
    okc(hs.length === 1, `${theme}: no update hook`);
    const { bedFor, contextOf } = await import('../../src/game/atmos_core.js');
    const bed = bedFor(contextOf({ phase: 'moon', indoor: true, theme }));
    okc(bed && bed.layers.length >= 2 && bed.events.length >= 4 && bed.gap[1] > bed.gap[0], `${theme}: atmosphere bed`);
    let seenOff = false;
    for (let i = 0; i < 400; i++) { hs[0](0.5, game); if (fac.lab.neon?.some((m) => !m.visible)) seenOff = true; }
    okc(toasts.length >= 2 && sfx.length >= 2 && toasts.every((m) => m.startsWith('PA: ')), `${theme}: PA announcements ${toasts.length}`);
    if (theme === 'deadmall') okc(seenOff, 'deadmall: neon never flickers');
    else okc(fac.lab.shell.rotation.z > 10, 'funhouse: shell did not turn');
    game.player.indoor = false; const n0 = toasts.length; for (let i = 0; i < 400; i++) hs[0](0.5, game);
    okc(toasts.length === n0, `${theme}: PA while nobody is inside`);
    api.dispose(); fac.dispose({ removeCollider() {} });
  }
}
realLog(`labyr10: meshes older themes ${JSON.stringify(REF)} | ${Object.entries(counts).map(([k, v]) => k.replace(/\/\d+\//, '/') + '=' + v).join(' ')}`);
realLog(`labyr10: spots total ${stats.spots} (min ${stats.minSpots}), spawn spots ${stats.spawn}, hero item spots ${stats.heroItems}, nav paths checked ${stats.paths}, doorways crossed on the nav grid ${stats.doors}`);
realLog(fails ? `labyr10: ${fails} FAILED` : 'labyr10: all ok');
process.exit(fails ? 1 : 0);
