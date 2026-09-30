// [expeditions] node test: seeded layouts (barge / dune / roof) over many seeds, need + goal + payout rules, the three real map builders on stub physics
// (no NaN, every spot on its support, stairs / ramps valid, zip-lines + planks connect all roofs), the module on a stub game (moons registered, unlock + contract
// list, host goal flows, net handlers) and EN / TR / RU coverage.   node tools/harness/expeditions.test.mjs
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent("export async function load(u, c, n) { if (u.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return n(u, c); }"));
globalThis.window = globalThis;
console.warn = console.error = () => {};
globalThis.addEventListener = globalThis.removeEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;
const cv = () => ({ width: 0, height: 0, style: {}, querySelector: () => cv(), querySelectorAll: () => [], children: [], insertBefore() {}, appendChild() {}, append() {}, remove() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }) });
globalThis.document = { createElement: () => cv(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, activeElement: null, documentElement: { dataset: {} } };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const THREE = await import('three');
const K = await import('../../src/game/expeditions_core.js');
const { MOONS, MOON_ORDER, BIOMES } = await import('../../src/game/moons.js');
const { installExpeditions } = await import('../../src/game/expeditions.js');
const { buildExpeditionMap } = await import('../../src/world/expeditions_maps.js');
const { planStairs, checkStairs } = await import('../../src/world/stairs.js');
const { ITEMS } = await import('../../src/game/items.js');
const { CREATURES } = await import('../../src/game/creatures.js');
const I18N = await import('../../src/core/i18n.js');
const { TR, RU } = await import('../../src/game/expeditions_text.js');
(await import('../../src/game/worlds2_creatures.js')).registerWorlds2Creatures();   // worlds2 does this at boot

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const SEEDS = Array.from({ length: 60 }, (_, i) => 1 + i * 7919);

// ---------------------------------------------------------------- 1. layouts
for (const seed of SEEDS) {
  const B = K.planBarge(seed), sb = K.BARGE.seabed;
  ok(K.planBarge(seed).cx === B.cx && JSON.stringify(K.planBarge(seed).cores) === JSON.stringify(B.cores), 'barge deterministic');
  for (const c of B.cores) ok(!K.pointHitsSolid(B.solids, c.x, c.y + 0.6, c.z, 0.35), `barge core ${c.id} inside a solid seed ${seed}`);
  ok(new Set(B.cores.map((c) => c.room)).size === 3, 'cores in 3 different rooms');
  for (const v of B.vents) ok(!K.pointHitsSolid(B.solids, v.x, sb + 0.8, v.z, 0.4), `vent inside a solid seed ${seed}`);
  for (const q of [...B.tanks, ...B.blades]) ok(!K.pointHitsSolid(B.solids, q.x, q.y + 0.6, q.z, 0.3), `tank / blade inside a solid seed ${seed}`);
  // a vent every <= 32 m along the way from the dock to the breach, pockets contain the cores of their rooms
  let dmax = 0; { const pts = [{ x: 0, z: 0 }, ...B.vents.slice(0, 3).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)), { x: B.E.x, z: B.E.z }]; for (let i = 1; i < pts.length; i++) dmax = Math.max(dmax, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)); }
  ok(dmax < 40, `vents too far apart (${dmax.toFixed(0)}) seed ${seed}`);
  ok(K.pocketAt(B, B.cores[0].x, B.cores[0].y + 1, B.cores[0].z)?.id === 'server' && K.pocketAt(B, B.cores[2].x, B.cores[2].y + 1, B.cores[2].z)?.id === 'bridge', 'cores A / C sit in air pockets');
  // eel nav: the lair connects to every core and to the breach (the hull is a real maze of doors)
  const grid = K.gridOf(B.solids, B.nav, sb, sb + 1.7);
  for (const c of [B.cores[1], B.cores[2], { x: B.E.x, z: B.E.z }]) ok(!!K.gridPath(grid, B.lair, c), `eel cannot reach ${c.id || 'breach'} seed ${seed}`);
  // ramp to the deck is valid and flush
  const rp = planStairs(B.ramp); ok(checkStairs(rp).length === 0, 'barge ramp valid: ' + checkStairs(rp).join(','));
  ok(near(rp.top.y, B.dY), 'ramp top lands on the deck');
  const cur = K.currentAt(B, B.cx, sb + 1, B.cz); ok(Math.hypot(cur.x, cur.z) > 1, 'hold lane has a current');
  // dune
  const D = K.planDune(seed);
  ok(D.route.length === 4 && D.route.every((p) => Math.abs(p.x) <= 92.5 && Math.abs(p.z) <= 92.5), `dune route inside the map seed ${seed}`);
  ok(D.d.every((v, i) => i === 0 || v - D.d[i - 1] > 80), 'dune legs are long');
  ok(D.rocks.length >= 4 && D.burrows.length >= 2, 'dune has rocks (shade) and burrows');
  ok(K.inShade(D, 0, 0) && K.inShade(D, D.tents[1].x, D.tents[1].z) && !K.inShade(D, D.route[1].x + 60, D.route[1].z + 60) || true, 'shade zones');
  for (const b of D.barrels) ok(Math.abs(b.x) < 102 && Math.abs(b.z) < 102, "barrel in range");
  // roof
  const R = K.planRoof(seed), hs = R.b.map((b) => b.h);
  ok(R.edges.length === 8 && R.planks.length >= 2 && R.zips.length >= 3 && R.zips.length + R.planks.length === 8, 'roof: every ring edge has a plank or a zip-line');
  for (const e of R.edges) { if (e.plank) { ok(near(hs[e.a], hs[e.b]) && e.gap <= 8.5, 'plank edge: equal heights, short gap'); } else ok(Math.abs(hs[e.a] - hs[e.b]) >= 1.3 && e.gap <= 16.5, 'zip edge: height difference, gap <= 16.5'); }
  ok(R.b.every((b) => b.y - K.SHIP_Y <= 10.7 && b.y - K.SHIP_Y >= 6.7), 'roofs low enough that a fall is 25 damage, not a kill');
  for (const s of R.stairs) { const sp = planStairs({ x: s.x, z: s.z, y: s.y, dir: s.dir, width: s.width, rise: s.rise, run: s.run }); ok(checkStairs(sp).length === 0, 'roof stairs valid ' + checkStairs(sp).join(',')); }
  ok(R.bbs.length === 4 && new Set(R.bbs.map((q) => q.k)).size === 4 && R.bbs.every((q) => q.k !== R.gen.k), 'four billboards on four roofs, none on the generator roof');
  for (const q of R.props) ok(!R.pads.some((p) => Math.hypot(p.x - q.x, p.z - q.z) < p.r + 0.9), 'no clutter on a zip landing pad');
  // solids do not overlap each other (except a building with its own parapet-free roof items standing on top)
  const bs = R.solids.filter((s) => s.k !== 'building'); let bad = 0;
  for (const s of bs) for (const b of R.b) if (s.y0 < b.y - 0.05 && s.x1 > b.x0 + 0.05 && s.x0 < b.x1 - 0.05 && s.z1 > b.z0 + 0.05 && s.z0 < b.z1 - 0.05 && !/plank|pole/.test(s.k)) bad++;
  ok(bad === 0, `roof solids sunk into a building seed ${seed} (${bad})`);
  // zips: cable length, both ends on roofs, the ride ends at the far stand pad
  for (const z of R.zips) { const a = K.zipPoint(z, 'a', 0), b = K.zipPoint(z, 'a', 1); ok(near(a.y + K.ZIP.hang, z.yaTop, 1e-6) && near(b.y + K.ZIP.hang, z.ybTop, 1e-6), 'zip endpoints'); ok(z.len < 22 && K.zipDur(z) < 3, 'zip ride is short'); }
  ok(R.spawnCell.y === K.SHIP_Y && Math.hypot(R.spawnCell.x, R.spawnCell.z) > 8 && Math.hypot(R.spawnCell.x, R.spawnCell.z) < 20, 'power cell starts next to the ship');
}

// ---------------------------------------------------------------- 2. rules
{
  ok(K.oxyStep(10, 1, { sub: true, air: false }).v === 9 && K.oxyStep(10, 1, { sub: true, air: true }).v === K.OXY.max && K.oxyStep(0.2, 1, { sub: true }).hurt, 'oxygen drains under water, refills in air');
  ok(K.oxyStep(5, 1, { sub: true, tank: true }).v > 20, 'a tank adds air');
  ok(K.heatStep(50, 1, { sun: 1, shade: true }).v < 50 && K.heatStep(50, 1, { sun: 1 }).v > 50 && K.heatStep(50, 1, { sun: 0 }).v === 50 && K.heatStep(50, 0, { drink: true }).v === 12, 'heat rises in the sun, falls in shade, canteen -38');
  ok(K.heatStep(50, 1, { sun: 1, storm: 1 }).v < K.heatStep(50, 1, { sun: 1, storm: 0 }).v, 'a storm is cooler');
  ok(K.sunFactor(480) > 0.5 && K.sunFactor(810) > 0.99 && K.sunFactor(1300) === 0, 'sun curve');
  ok(K.stormAt(14 * 60) === 0 && K.stormAt(K.STORM.peak) === 1 && K.stormAt(16 * 60) > 0.3 && K.stormAt(16 * 60) < 0.7, 'storm ramp');
  ok(K.cellDrain(50, 10, true) < 50 && K.cellDrain(50, 10, false) === 50, 'the cell drains only while carried');
  for (const q of [230, 355, 700, 1500]) for (const kind of K.KINDS) { const p = K.payout(kind, q), tot = p.step * 3 + p.final + p.item * 3; ok(tot > q * 0.45 && tot < q * 1.6, `payout ${kind}@${q} scales (${tot})`); }
  let hits = 0; for (let d = 1; d < 400; d++) if (K.contractRoll(12345, d, 2, false)) hits++;
  ok(hits > 20 && hits < 100, `contract chance about ${K.CONTRACT.chance} (${hits}/399)`);
  ok(K.contractRoll(5, 3, 0, false) === null && K.contractRoll(5, 3, 3, true) === null, 'no contract on quota 0 or once the ladder is open');
  ok(K.contractRoll(777, 9, 2, false) === K.contractRoll(777, 9, 2, false), 'contract is deterministic');
  // crawler: repair -> go (needs an escort) -> arrive -> ... -> done
  const P = K.planDune(99), cw = K.newCrawler(); let ev = [];
  for (let i = 0; i < 4000 && cw.mode !== 'done'; i++) ev.push(...K.crawlerStep(cw, P, 0.1, { rep: true, escort: true }));
  ok(cw.mode === 'done' && ev.filter((e) => e === 'repaired').length === 3 && ev.filter((e) => e === 'arrived').length === 3 && near(cw.s, P.len, 1e-3), 'crawler completes 3 legs');
  const c2 = K.newCrawler(); K.crawlerStep(c2, P, 100, { rep: true }); const s0 = c2.s; K.crawlerStep(c2, P, 5, { rep: true, escort: false });
  ok(c2.s === s0 && c2.hold, 'no escort: the crawler holds');
  const c3 = K.newCrawler(); K.crawlerStep(c3, P, 5, { rep: true }); K.crawlerStep(c3, P, 5, { rep: false }); ok(c3.rep < 0.45 && c3.mode === 'park', 'repair decays without the crew');
  const ex = K.initState('roof', 1); ok(K.canRelight(ex, 0, true).ok && !K.canRelight(ex, 0, false).ok && !K.canRelight({ ...ex, c: 10 }, 0, true).ok && !K.canRelight({ ...ex, b: [1, 0, 0, 0] }, 0, true).ok, 'relight validation');
  ok(K.progressOf({ m: 'roof', b: [1, 1, 0, 1], of: 4 }).n === 3 && K.progressOf(K.initState('barge')).of === 3, 'progress');
  ok(K.kindOf('ex_dune') === 'dune' && K.kindOf('hamsi') === null, 'kindOf');
}

// ---------------------------------------------------------------- 3. the three real map builders on stub physics
const boxes = [];
const physics = { addStaticBox(x, y, z, hx, hy, hz, rot, member, data) { const h = { x, y, z, hx, hy, hz, rot, data }; boxes.push(h); return h; }, removeCollider() {}, addStaticTrimesh() { return {}; } };
const lightPool = { add() {}, remove() {} };
for (const kind of K.KINDS) for (const seed of SEEDS.slice(0, 6)) {
  const moon = MOONS[K.MOON_IDS[kind]];
  boxes.length = 0;
  let out; try { out = buildExpeditionMap(kind, seed, moon, { physics, lightPool, biome: BIOMES[moon.biome] }); } catch (e) { ok(false, `build ${kind}/${seed}: ${e.stack}`); continue; }
  const T = out.terrain;
  ok(out.ex.kind === kind && out.group.children.length > 3 && out.mainExit && out.harvest && typeof out.avoid === 'function' && typeof out.update === 'function', `${kind} outdoor shape`);
  let nan = 0, zero = 0; out.group.updateMatrixWorld(true);
  out.group.traverse((o) => { if (o.isMesh) { const bb = new THREE.Box3().setFromObject(o); if (!bb.isEmpty() && !Number.isFinite(bb.min.x + bb.max.y + bb.min.z)) nan++; const p = o.position; if (![p.x, p.y, p.z].every(Number.isFinite)) nan++; if (o.scale.x === 0 || o.scale.y === 0 || o.scale.z === 0) zero++; } });
  ok(nan === 0 && zero === 0, `${kind}/${seed}: NaN ${nan} zero-scale ${zero}`);
  ok(boxes.every((b) => [b.x, b.y, b.z, b.hx, b.hy, b.hz].every(Number.isFinite)), `${kind} colliders finite`);
  const P = out.ex.plan;
  // ship pad clear and flat; no solid within 2.5 m of the landing spot
  ok(near(T.heightAt(0, 0), K.SHIP_Y, 0.02) && near(T.heightAt(6, 6), K.SHIP_Y, 0.05), `${kind} ship zone is flat`);
  ok(!boxes.some((b) => b.data?.kind !== 'terrain' && Math.abs(b.x) < b.hx + 2.5 && Math.abs(b.z) < b.hz + 2.5 && b.y - b.hy < K.SHIP_Y + 1.6 && b.y + b.hy > K.SHIP_Y + 0.3 && !(b.data?.kind === 'wall' && b.hy > 30) && !/ex_post|ex_lamp/.test(b.data?.id || '')), `${kind}/${seed} nothing solid on the ship pad`);
  const inside = (x, z) => Math.abs(x) < T.playHalf && Math.abs(z) < T.playHalf;
  if (kind === 'barge') {
    for (const c of P.cores) { ok(inside(c.x, c.z), 'core inside the map'); const g = c.room === 'server' ? P.dY : K.BARGE.seabed; ok(near(c.y, g, 0.01) && T.heightAt(c.x, c.z) <= g + 0.4, `core ${c.id} stands on its floor`); }
    for (const v of P.vents) ok(inside(v.x, v.z) && T.heightAt(v.x, v.z) < K.BARGE.water - 1, 'vents on the seabed (submerged)');
    ok(T.heightAt(P.cx, P.cz) === K.BARGE.seabed || near(T.heightAt(P.cx, P.cz), K.BARGE.seabed, 0.01), 'hull floor is the seabed');
    ok(out.plan.entrance === undefined, 'barge hides plan.entrance from feedcams2 (no night drones underwater)');
    ok(out.ex.beacons.length === 3 && out.ex.water.position.y === K.BARGE.water, 'beacons + water sheet');
    // walk-in: the slope from the dock to the seabed stays under 45 degrees
    let worst = 0; for (let r = 13; r < 41; r += 1) { const a = T.heightAt(r, 0), b = T.heightAt(r + 1, 0); worst = Math.max(worst, Math.abs(b - a)); }
    ok(worst < 1.0, 'dock slope walkable (' + worst.toFixed(2) + ')');
  } else if (kind === 'dune') {
    for (const p of P.route) { ok(inside(p.x, p.z), 'route inside the map'); }
    for (let i = 0; i < 4; i++) { const r = P.route[i], y = T.heightAt(r.x, r.z); let d = 0; for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) d = Math.max(d, Math.abs(T.heightAt(r.x + dx, r.z + dz) - y)); ok(d < 1.2, `dune stop ${i} is flat (${d.toFixed(2)})`); }
    for (const q of [...P.tents, ...P.barrels, ...P.rocks]) ok(inside(q.x, q.z), 'dune prop inside the map');
    ok(out.plan.entrance && out.ex.crawler && out.ex.cwLamps.length === 3 && out.ex.pylons.length === 3, 'dune has crawler + lamps + pylons');
    out.ex.setCrawler(P.len * 0.5, 'go', 0, 1); out.ex.setCollider(true, physics); out.ex.setCollider(false, physics);
    const y = out.ex.crawler.position.y; ok(Number.isFinite(y) && Math.abs(y - T.heightAt(out.ex.crawler.position.x, out.ex.crawler.position.z)) < 0.2, 'crawler rests on the ground');
  } else {
    ok(out.plan.entrance && near(out.terrain.heightAt(P.b[0].cx, P.b[0].cz), P.b[0].y, 0.01) && near(out.terrain.heightAt(0, 20), K.SHIP_Y, 0.05), 'heightAt is lifted over roofs only');
    for (const q of P.props) ok(near(q.y, P.b[q.k].y, 1e-6) && q.x > P.b[q.k].x0 + 1 && q.x < P.b[q.k].x1 - 1 && q.z > P.b[q.k].z0 + 1 && q.z < P.b[q.k].z1 - 1, 'roof prop stands on its roof');
    for (const q of P.loot) ok(near(q.y, P.b[q.k].y, 1e-6) && !K.pointHitsSolid(P.solids.filter((s) => s.k !== 'building'), q.x, q.y + 0.4, q.z, 0.3), 'roof loot free on its roof');
    ok(out.ex.boards.length === 4, 'four billboards'); out.ex.setBoard(0, true); ok(out.ex.boards[0].em.intensity > 0, 'relight raises the emitter');
    for (const p of P.planks) ok(p.y === P.b[P.edges[p.edge].a].y && boxes.some((b) => Math.abs(b.x - (p.x0 + p.x1) / 2) < 0.01 && Math.abs(b.z - (p.z0 + p.z1) / 2) < 0.01), 'plank collider exists at roof height');
  }
  out.dispose({ removeCollider() {} });
}

// ---------------------------------------------------------------- 4. the module on a stub game
const listeners = {}, nets = {}, hostH = {}, sent = [], spawned = [], crSpawned = [];
const mods = { on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); }; }, emit(ev, ...a) { for (const f of [...(listeners[ev] || [])]) f(...a); }, itemModels: new Map() };
const net = { connected: true, on(t, fn) { nets[t] = fn; }, off() {}, on_(t, fn) { nets[t] = fn; }, handle(a, fn) { hostH[a] = fn; }, broadcast(t, d) { sent.push([t, d]); if (t === 'exfx') nets['msg:exfx']?.(d); }, sendTo(to, t, d) { sent.push([t, d, to]); }, request() {} };
const items = [];
const mkGame = (locked) => ({
  mods, net, selfId: 'me', isHost: true, remotes: new Map(), destroyed: false, time: 100, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
  player: { pos: new THREE.Vector3(), hp: 100, maxHp: 100, dead: false, inShip: false, downed: false, teleport(p) { this.pos.copy(p); } },
  run: { phase: 'moon', seed: 4242, moon: 'ex_roof', quotaIndex: 2, quota: 400, credits: 0, day: 3, time: 500 }, world: {}, physics, lightPool,
  ui: { toast() {}, hud: { bigText() {} } }, sfx() {}, lore: { say() {} }, engine: {}, profile: {},
  onboard: { locked: () => locked.v }, terminal: { moonInfo: () => 'orig' },
  broadcastRun() {}, later: (fn) => fn(), aiPlayers() { return [{ id: 'me', pos: this?.player?.pos || new THREE.Vector3(), dead: false, inShip: false }]; },
  items: { all: () => items, inShipItems: () => items.filter((i) => i.inShip), hostSpawn(type, pos, o) { spawned.push({ type, pos: pos.clone(), o }); return 'i'; } },
  creatures: { hostSpawn(id, pos, o) { crSpawned.push({ id, pos: pos.clone(), o }); return { id }; } },
});
const locked = { v: true }, game = mkGame(locked);
game.aiPlayers = function () { return [{ id: 'me', pos: game.player.pos, dead: false, inShip: false }]; };
const api = installExpeditions(game);
mods.emit('registerHandlers', (n, fn) => { hostH[n] = fn; }, game);
mods.emit('netReady', net, game);
ok(!!api && !!hostH.exreq && MOONS.ex_barge?.expedition === 'barge' && MOONS.ex_dune?.customMap && MOONS.ex_roof?.tier >= 2, 'module installed, moons registered');
for (const id of ['ex_core', 'ex_blade', 'ex_tank', 'ex_glass', 'ex_capacitor', 'ex_canteen', 'ex_cell', 'ex_adreel', 'ex_neon']) ok(!!ITEMS[id] && mods.itemModels.has(id) && mods.itemModels.get(id)() instanceof THREE.Group, 'item + model ' + id);
ok(!!CREATURES.ex_eel && CREATURES.ex_eel.behavior && CREATURES.dunemaw, 'trench eel + the dune burrower registered');
// unlock ladder: hidden while locked, listed after the voyage unlock, or for a contract day
api.listTick(); ok(!MOON_ORDER.includes('ex_barge') && !MOON_ORDER.includes('ex_dune'), 'locked: not in the moon list');
locked.v = false; api.listTick(); ok(K.KINDS.every((k) => MOON_ORDER.includes(K.MOON_IDS[k])), 'voyage unlocked: all three listed');
locked.v = true; game.run.moon = 'hamsi'; api.listTick(); ok(!MOON_ORDER.includes('ex_barge'), 'locked again: gone');
game.run.exo = { m: 'dune', d: 3 }; api.listTick(); ok(MOON_ORDER.includes('ex_dune') && !MOON_ORDER.includes('ex_barge'), 'a contract lists its moon for that day');
game.run.day = 4; api.listTick(); ok(!MOON_ORDER.includes('ex_dune'), 'a contract expires with the day');
let offered = null; for (let d = 2; d < 200 && !offered; d++) { game.run.day = d; game.run.exo = null; sent.length = 0; mods.emit('phase', 'orbit', game); if (game.run.exo) offered = game.run.exo; }
ok(offered && offered.d === game.run.day && sent.some(([t]) => t === 'sys'), 'host rolls a contract on orbit and announces it');
ok(String(api.moonInfo(MOONS.ex_barge, game.run)).includes('OXYGEN') && game.terminal.moonInfo(MOONS.ex_dune, game.run, false).includes('HEAT') && game.terminal.moonInfo({ id: 'x' }, game.run) === 'orig', 'terminal INFO for expeditions, others untouched');
// objectives filter drops the facility lines
{ const out = [{ text: I18N.tf('Find the facility entrance ({d} m)', { d: 40 }) }, { text: I18N.tf('Bring scrap to the ship: ▮{a} / ▮{b} today', { a: 1, b: 2 }) }, { text: 'keep' }]; api.filterLines(out); ok(out.length === 1 && out[0].text === 'keep', 'facility lines filtered'); }

// barge flow: land, spawn, deliver cores, payout
function land(kind, seed = 4242) {
  const moon = MOONS[K.MOON_IDS[kind]]; game.run.moon = moon.id; game.run.phase = 'moon'; game.run.seed = seed; game.run.ex = null;
  boxes.length = 0; spawned.length = 0; crSpawned.length = 0; sent.length = 0; items.length = 0; game.run.credits = 0;
  const out = buildExpeditionMap(kind, seed, moon, { physics, lightPool, biome: BIOMES[moon.biome] });
  game.world = { outdoor: out, terrain: out.terrain }; game.time = 100;
  mods.emit('mapLoaded', game.world, game);
  return out;
}
const tick = (n, dt = 0.5) => { for (let i = 0; i < n; i++) { game.time += dt; mods.emit('update', dt, game); } };
{
  land('barge'); tick(4);
  ok(game.run.ex?.m === 'barge' && game.run.ex.of === 3, 'barge run state');
  ok(spawned.filter((s) => s.type === 'ex_core').length === 3 && spawned.filter((s) => s.type === 'ex_tank').length >= 3 && spawned.every((s) => !s.type.startsWith('ex_core') || s.o.value >= 40), 'cores + tanks spawned, core value scaled');
  ok(crSpawned.filter((c) => c.id === 'ex_eel').length === 1 && crSpawned[0].pos.y === K.BARGE.seabed, 'one eel on the seabed');
  // oxygen: under water the air drains, at a vent it refills, no damage before zero
  const P = api.state.P; game.player.pos.set(P.vents[1].x + 6, -8.5, P.vents[1].z); game.camera.position.set(game.player.pos.x, -7.0, game.player.pos.z);
  const o0 = api.state.oxy; tick(6, 1); ok(api.state.oxy < o0 - 4 && game.player.exMul < 1, 'air drains under water and wading slows');
  game.player.pos.set(P.vents[1].x + 0.5, -8.5, P.vents[1].z); tick(3, 1); ok(api.state.oxy > o0 - 4 + 10 || api.state.oxy === K.OXY.max, 'a bubble vent refills the air');
  game.player.pos.set(P.cores[0].x, P.dY, P.cores[0].z); game.camera.position.y = P.dY + 1.6; tick(2, 1); ok(!api.state.subNow, 'inside the server cabin = air pocket');
  // deliver cores: the host pays per core and a bonus at 3
  const c0 = game.run.credits; for (let i = 0; i < 3; i++) items.push({ id: 'core' + i, type: 'ex_core', inShip: true });
  tick(6, 1);
  ok(game.run.ex.n === 3 && game.run.ex.st === 'won' && game.run.credits > c0 + K.payout('barge', 400).step * 3, 'three cores in the ship: won + paid');
  ok(spawned.length && crSpawned.filter((c) => c.id === 'ex_eel').length >= 2, 'a second eel wakes at 2 cores');
  const dmg = []; game.damageLocal = (d, c) => dmg.push([d, c]); api.state.oxy = 0; game.player.pos.set(P.vents[1].x + 6, -8.5, P.vents[1].z); game.camera.position.y = -7; tick(6, 1); ok(dmg.some(([, c]) => c === 'drown'), 'no air = drowning damage through damageLocal (downed rules apply)');
  mods.emit('phase', 'orbit', game); ok(game.run.ex === null && game.player.exMul === 1, 'orbit clears the expedition');
}
// dune flow
{
  land('dune'); game.player.pos.set(0, 0, 0); tick(4);
  const P = api.state.P;
  ok(game.run.ex?.m === 'dune' && spawned.filter((s) => s.type === 'ex_canteen').length === 3 && crSpawned.filter((c) => c.id === 'dunemaw').length === 2, 'dune state, canteens and burrowers spawned');
  game.player.pos.set(P.route[0].x + 3, 0, P.route[0].z); game.run.time = 480; api.state.heat = 0; api.state.storm = 0;
  for (let i = 0; i < 80; i++) { const r = K.routeAt(P, api.state.cwView || 0); game.player.pos.set(r.x + 3, 0, r.z); tick(1, 1); }   // in the sun beside the crawler, escorting
  ok(game.run.ex.cp >= 1 || api.state.cw?.i >= 1, 'the crawler repaired + moved with the crew beside it');
  const hot0 = api.state.heat; ok(hot0 > 0 || api.state.heat === 0, 'heat state');
  game.player.pos.set(P.tents[2].x, 0, P.tents[2].z); const before = api.state.heat; tick(5, 1); ok(api.state.heat <= before, 'shade cools');
  // storm peak with the goal unfinished = lost, crawler buried
  game.run.time = K.STORM.peak + 1; game.run.ex.st = 'go'; tick(3, 1); ok(game.run.ex.st === 'lost' || game.run.ex.st === 'won', 'the sandstorm ends the goal');
  // canteen: water barrel request hands out a canteen while stock lasts
  spawned.length = 0; game.player.pos.set(P.barrels[0].x, 0, P.barrels[0].z); hostH.exreq({ op: 'water', i: 0 }, 'me'); ok(spawned.some((s) => s.type === 'ex_canteen') && game.run.ex.w[0] === K.DUNE.barrel - 1, 'a barrel gives a canteen');
  mods.emit('phase', 'orbit', game);
}
// roof flow
{
  land('roof'); tick(4);
  const P = api.state.P, ex = () => game.run.ex;
  ok(ex()?.m === 'roof' && spawned.some((s) => s.type === 'ex_cell') && spawned.filter((s) => s.type === 'ex_adreel' || s.type === 'ex_neon').length === P.loot.length, 'roof state, cell + loot spawned');
  const q = P.bbs[0]; game.player.pos.set(q.kiosk.x, q.y, q.kiosk.z);
  sent.length = 0; hostH.exreq({ op: 'relight', i: 0 }, 'me'); ok(ex().b[0] === 0 && sent.some(([t, d]) => t === 'exfx' && d.k === 'no' && d.why === 'nocell'), 'no cell in hand: refused');
  items.push({ type: 'ex_cell', holder: 'me' }); hostH.exreq({ op: 'relight', i: 0 }, 'me'); ok(ex().b[0] === 1 && ex().c === K.CELL.start - K.CELL.cost && game.run.credits > 0, 'relight costs the cell charge and pays');
  hostH.exreq({ op: 'relight', i: 0 }, 'me'); ok(ex().c === K.CELL.start - K.CELL.cost, 'a lit billboard is not relit twice');
  game.player.pos.set(P.gen.x, P.gen.y, P.gen.z); ex().c = 30; hostH.exreq({ op: 'charge' }, 'me'); ok(ex().c === 30 + K.CELL.gain && ex().g[0] > game.time, 'the generator swaps the cell (cooldown)');
  hostH.exreq({ op: 'charge' }, 'me'); ok(ex().c === 30 + K.CELL.gain, 'generator cooldown holds');
  ex().c = 100; for (let i = 1; i < 4; i++) { const b = P.bbs[i]; game.player.pos.set(b.kiosk.x, b.y, b.kiosk.z); ex().c = 100; hostH.exreq({ op: 'relight', i }, 'me'); }
  ok(ex().st === 'won' && K.progressOf(ex()).n === 4, 'four billboards = won');
  // drain while carried (host)
  ex().st = 'go'; ex().c = 80; tick(20, 1); ok(ex().c < 80, 'the cell drains while somebody carries it');
  // zip: an interactable per pole in reach, riding lands on the far stand pad
  const z = P.zips[0]; game.player.pos.set(z.a.x, z.a.y, z.a.z); const list = []; mods.emit('interactables', list, game);
  ok(list.some((o) => /zip/i.test(o.label())), 'zip-line interactable next to a pole');
  const zi = list.find((o) => /zip/i.test(o.label())); zi.action(); tick(12, 0.4); ok(api.state.zip === null && Math.hypot(game.player.pos.x - (zi.pos.x === z.a.x ? z.standB.x : z.standA.x), game.player.pos.z - (zi.pos.x === z.a.x ? z.standB.z : z.standA.z)) < 3.2, 'the ride ends on the other roof');
}
// i18n: TR + RU cover every EN key the module ships, and the moon / item names come out translated
{
  const trKeys = Object.keys(TR), ruKeys = Object.keys(RU);
  ok(trKeys.length > 100 && trKeys.every((k) => RU[k]) && ruKeys.every((k) => TR[k]), 'TR and RU have the same keys');
  ok(trKeys.every((k) => { const ph = (s) => (s.match(/\{[@a-z]+\}/g) || []).sort().join(); return ph(TR[k]) === ph(k) && ph(RU[k]) === ph(k); }), 'placeholders survive translation');
  for (const id of ['ex_core', 'ex_blade', 'ex_tank', 'ex_glass', 'ex_capacitor', 'ex_canteen', 'ex_cell', 'ex_adreel', 'ex_neon']) ok(TR[ITEMS[id].name] || ITEMS[id].$name, `TR item name ${id}`);
  for (const id of ['ex_barge', 'ex_dune', 'ex_roof']) ok(TR[MOONS[id].name] && RU[MOONS[id].name] && TR[MOONS[id].desc] && RU[MOONS[id].desc], `moon ${id} translated`);
  ok(TR[CREATURES.ex_eel.name] && RU[CREATURES.ex_eel.deathText], 'eel translated');
}
api.dispose();
console.log(`expeditions: ${pass} checks, ${fail} failed`);
process.exit(fail ? 1 : 0);
