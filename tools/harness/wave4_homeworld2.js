// Wave-4 HOMEWORLD 2 check for headless.mjs (body of an async function; see docs/wave4/homeworld2.md).
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5191 --script tools/harness/wave4_homeworld2.js --shot /tmp/h2.png --wait 4000
// Proves (each step is failure-isolated and reports numbers): land on the homeworld, build a real factory through the host protocol (miners on nodes ->
// smelters -> assembler -> export dock, poles, belts routed by BFS), run it (credits arrive in the store), room kit + tree + harvest (fruit item), a wave
// (forced) that breaks machines when lost + shield + repair, the GROUND FLICKER metric with the fix on / off, renderer.info draw calls, and a composite
// screenshot (fixed vs old ground at 3 distances, factory overview, belt close-up) painted over the page so --shot shows it.
const g = kefal.game, A = g.homeworld2, X = A?.core, out = { steps: {}, fails: [] }, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const oe = console.error.bind(console);
console.error = (...a) => { errs.push(a.map((x) => (x && x.stack) || String(x)).join(' ').slice(0, 300)); oe(...a); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ok = (c, m) => { if (!c) out.fails.push(m); return !!c; };
const step = async (name, fn) => { try { out.steps[name] = await fn(); } catch (e) { out.fails.push(name + ' THREW: ' + String((e && e.stack) || e).slice(0, 500)); } };
const tick = async (n, dt = 0.1, render = false) => { for (let i = 0; i < n; i += 60) { kefal.tick(Math.min(60, n - i), dt, render); await sleep(1); } };
const HOME_Y = -1.25;
const req = (op, d = {}) => g.net.request('h2act', { op, ...d });
const S = () => A.layout(), HW = () => g.profile.homeworld;
const okAt = (t, x, z, r = 0) => X.placementCheck(S(), HW(), t, x, z, r, { nodes: A.nodes() }).ok;
const ctr = (p) => X.centerOf(p);
const dirTo = (dx, dz) => (Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 0 : 2) : (dz >= 0 ? 1 : 3));
const place = (t, x, z, r = 0) => { const n = S().p.length; req('build', { t, x, z, r }); return S().p.length > n ? S().p[S().p.length - 1] : null; };
function roomy(t, x, z, m) { if (!m) return true; const occ = X.occupancy(S()), [w, h] = X.dims(t, 0); for (let i = -m; i < w + m; i++) for (let j = -m; j < h + m; j++) if (occ.has(X.CELL_KEY(x + i, z + j) * 4)) return false; return true; }
function spot(t, cx, cz, rmax = 14) {   // free anchor for a piece, nearest to fine cell (cx, cz); machines keep a 2-cell margin so belts fit between them
  const m = X.isMachine(t) ? 2 : 0;
  for (let rad = 0; rad <= rmax; rad++) for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) if (Math.max(Math.abs(dx), Math.abs(dz)) === rad && okAt(t, cx + dx, cz + dz, 0) && roomy(t, cx + dx, cz + dz, m)) return [cx + dx, cz + dz];
  return null;
}

/** a compact production block (smelter A + smelter B -> assembler C -> export dock U, all facing +x, belts hand-routed) anchored at fine cell (ax, az) */
function blockAt(ax, az) {
  const M = [['smelter', ax, az], ['smelter', ax, az + 6], ['assembler', ax + 8, az + 3], ['uplink', ax + 13, az + 3]];
  const B = [[ax + 2, az + 1, 0], [ax + 3, az + 1, 0], [ax + 4, az + 1, 0], [ax + 5, az + 1, 1], [ax + 5, az + 2, 1], [ax + 5, az + 3, 0], [ax + 6, az + 3, 0], [ax + 7, az + 3, 0],
    [ax + 2, az + 6, 0], [ax + 3, az + 6, 0], [ax + 4, az + 6, 0], [ax + 5, az + 6, 3], [ax + 5, az + 5, 3], [ax + 5, az + 4, 0], [ax + 6, az + 4, 0], [ax + 7, az + 4, 0],
    [ax + 10, az + 3, 0], [ax + 11, az + 3, 0], [ax + 12, az + 3, 0]];
  return { M, B };
}
function findBlock(dirx, dirz) {
  for (let R = 20; R <= 34; R += 2) for (let k = 0; k < 24; k++) {
    const a = Math.atan2(dirz, dirx) + (k % 2 ? 1 : -1) * Math.floor(k / 2 + 1) * 0.16, ax = Math.round(Math.cos(a) * R / 1.5), az = Math.round(Math.sin(a) * R / 1.5), b = blockAt(ax, az);
    if (b.M.every(([t, x, z]) => okAt(t, x, z, 0) && roomy(t, x, z, 1)) && b.B.every(([x, z]) => okAt('belt', x, z, 0))) return b;
  }
  return null;
}
function placeBlock(b) {
  const ms = b.M.map(([t, x, z]) => place(t, x, z, 0));
  for (let i = 0; i < b.B.length; i += 40) req('belts', { l: b.B.slice(i, i + 40) });
  return ms;
}
function route(src, dst) {   // BFS a belt path from the free cells in front of `src` to a free cell next to `dst`, place the belts
  const goal = new Set(), fronts = new Set(X.isMachine(dst.t) ? X.frontCells(dst).map(([x, z]) => x + ',' + z) : []);
  for (const [x, z] of X.cellsOf(dst.t, dst.x, dst.z, dst.r)) for (const [dx, dz] of X.DIR) if (!fronts.has((x + dx) + ',' + (z + dz))) goal.add((x + dx) + ',' + (z + dz));   // never feed a machine through its output side
  const own = new Set(X.cellsOf(dst.t, dst.x, dst.z, dst.r).map(([x, z]) => x + ',' + z));
  const q = [], prev = new Map(), reserved = new Set();   // the output cells of every other machine stay free
  for (const m of S().p) if (X.isMachine(m.t) && m.i !== src.i) for (const [x, z] of X.frontCells(m)) reserved.add(x + ',' + z);
  for (const [x, z] of X.frontCells(src)) if (okAt('belt', x, z)) { q.push([x, z]); prev.set(x + ',' + z, null); }
  let end = null;
  while (q.length && !end) {
    const [x, z] = q.shift();
    if (goal.has(x + ',' + z) && !own.has(x + ',' + z)) { end = [x, z]; break; }
    for (const [dx, dz] of X.DIR) { const nx = x + dx, nz = z + dz, k = nx + ',' + nz; if (prev.has(k) || reserved.has(k) || !okAt('belt', nx, nz)) continue; prev.set(k, [x, z]); q.push([nx, nz]); }
  }
  if (!end) return 0;
  const path = []; for (let c = end; c; c = prev.get(c[0] + ',' + c[1])) path.unshift(c);
  const dstCells = own; const l = [];
  path.forEach((c, i) => {
    let r;
    if (i < path.length - 1) r = dirTo(path[i + 1][0] - c[0], path[i + 1][1] - c[1]);
    else { r = 0; for (let d = 0; d < 4; d++) if (dstCells.has((c[0] + X.DIR[d][0]) + ',' + (c[1] + X.DIR[d][1]))) { r = d; break; } }
    l.push([c[0], c[1], r]);
  });
  for (let i = 0; i < l.length; i += 40) req('belts', { l: l.slice(i, i + 40) });
  return l.length;
}
function poles(points) {   // a pole every ~8 m along the polyline, on the nearest free cell
  let n = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), k = Math.max(1, Math.ceil(len / 8));
    for (let s = 1; s <= k; s++) { const px = a.x + (b.x - a.x) * s / k, pz = a.z + (b.z - a.z) * s / k, c = spot('pole', Math.round(px / 1.5), Math.round(pz / 1.5), 4); if (c && place('pole', c[0], c[1])) n++; }
  }
  return n;
}

await step('land', async () => {
  g.run.daysLeft = 3; g.run.moon = 'home'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  await tick(90, 1 / 30);
  g.player.inShip = false; g.player.teleport(V(0, HOME_Y + 0.4, 19)); await tick(5, 1 / 30);
  g.run.credits = 30000; HW().s.parts = 300; g.broadcastRun(['credits', 'hw']);
  return { phase: g.run.phase, moon: g.run.moon, api: !!A, onHome: !!g.world?.outdoor?.home, nodes: A.nodes().length, seed: S().seed };
});

let chain = null;
await step('power', async () => {   // the pad's shore power (classic generators) feeds the factory
  const Hc = g.homeworld.core;
  for (let n = 0; n < 2; n++) { let done = false; for (let x = -15; x < 15 && !done; x++) for (let z = -15; z < 15 && !done; z++) if (Hc.placementCheck(HW(), 'generator', x, z).ok && X.placementCheck(S(), HW(), 'belt', x * 2, z * 2, 0, { nodes: A.nodes() }).ok) { const b = HW().b.length; g.net.request('hwact', { op: 'build', t: 'generator', x, z, r: 0 }); done = HW().b.length > b; } }
  return { classic: HW().b.length, shore: Hc.powerStats(HW()) };
});
await step('factory', async () => {
  const nodes = A.nodes(), dist = (n) => Math.hypot((n.x + 1) * 1.5, (n.z + 1) * 1.5);
  const sN = nodes.filter((n) => n.res === 'scrap').sort((a, b) => dist(a) - dist(b))[0], oN = nodes.filter((n) => n.res === 'ore').sort((a, b) => dist(a) - dist(b))[0];
  const faceOrigin = (n) => dirTo(-(n.x + 1), -(n.z + 1));
  const mS = place('miner', sN.x, sN.z, faceOrigin(sN)), mO = place('miner', oN.x, oN.z, faceOrigin(oN));
  ok(mS && mO, 'miners placed on nodes (' + !!mS + ',' + !!mO + ')');
  req('up', { id: mS?.i }); req('up', { id: mO?.i });   // Mk2: 45 items / min each
  const blk = findBlock(-(sN.x + oN.x), -(sN.z + oN.z)); ok(blk, 'a free block area');
  const [Am, Bm, C, U] = placeBlock(blk); ok(Am && Bm && C && U, 'block machines');
  for (const p of [Am, Bm, C, U]) if (p) req('up', { id: p.i });
  const lo = Am.z <= Bm.z ? [Am, Bm] : [Bm, Am];   // the smelter row with the smaller z takes the node with the smaller z (routes do not cross)
  const pairs = sN.z <= oN.z ? [[mS, lo[0]], [mO, lo[1]]] : [[mO, lo[0]], [mS, lo[1]]];
  const lens = pairs.map(([m, sm]) => route(m, sm));
  ok(lens.every((n) => n > 0), 'both miner routes found: ' + lens.join(','));
  const nP = poles([{ x: 0, z: 17 }, ctr(C), ctr(Am), ctr(mS)]) + poles([ctr(C), ctr(Bm), ctr(mO)]) + poles([ctr(C), ctr(U)]);
  chain = { mS, mO, C, Am, Bm, U };
  const sim = new X.FactorySim(S(), { shore: 100, nodes: A.nodes() });
  return { pieces: S().p.length, belts: X.countOf(S(), 'belt'), poles: nP, lens, credits: g.run.credits, power: sim.powerInfo(), dockValueCap: X.DOCK_VALUE };
});

await step('run', async () => {
  const before = { cr: HW().s.cr, parts: HW().s.parts };
  await tick(2400, 0.1);   // 4 game minutes of production
  const sim = A.sim, s = HW().s;
  return { simTime: Math.round(sim.time), soldByItem: sim.sold.join(','), madeByItem: sim.made.join(','), storeCr: Math.round(s.cr * 10) / 10, storeParts: Math.round((s.parts - before.parts) * 10) / 10, s2: Math.round(s.s2 * 10) / 10, incomePerMin: Math.round(A.income() * 10) / 10, exported: Math.round(S().st.exported), power: sim.powerInfo(), states: sim.machines.map((k) => sim.st[k].p.t + ':' + sim.st[k].state).join(' '), storageXcap: HW().xcap };
});
ok((out.steps.run?.storeCr || 0) > 5, 'factory paid credits into the homeworld store: ' + out.steps.run?.storeCr);

await step('measure', async () => {
  const m = X.measureRates(S(), { shore: 100 });
  return { perMinLive: A.income(), perMinMeasured: Math.round(m.perMin * 10) / 10, cr: Math.round(m.cr * 10) / 10, parts: Math.round(m.parts * 100) / 100, offline8h: Math.round(X.offlineGain(m, 8 * 3600).cr) };
});

await step('rooms+trees', async () => {
  let kit = null;
  for (const [x, z] of [[-24, 12], [-24, -20], [14, -24], [18, 14], [-12, 20], [4, -26], [-30, 0]]) { const n = S().p.length; req('kit', { k: 'storage', x, z }); if (S().p.length > n) { kit = [x, z]; break; } }
  const meta1 = { rooms: A.meta().rooms, storage: A.meta().storage };
  await tick(20, 0.1);
  let tree = null;
  for (const [x, z] of [[-28, 8], [-28, 12], [22, 10], [10, 24], [-20, -10], [0, -24]]) { const t = spot('tree', x, z, 6); if (t) { tree = place('tree', t[0], t[1], 0); if (tree) break; } }
  ok(kit, 'storage room kit placed'); ok(tree, 'tree planted');
  let apples = 0, before = 0, wood = 0;
  if (tree) {
    const p = S().p.find((q) => q.i === tree.i); p.a = 1500; p.f = 3;   // fast-forward the growth (real time is 15 min)
    const c = ctr(p); g.player.teleport(V(c.x + 2, HOME_Y + 0.4, c.z)); await tick(3, 0.1);
    for (const it of g.items.all()) if (it.type === 'fd_apple') before++;
    req('harvest', { id: tree.i }); await tick(10, 0.1);
    for (const it of g.items.all()) if (it.type === 'fd_apple') apples++;
    req('sell', { id: tree.i }); await tick(5, 0.1);
    for (const it of g.items.all()) if (it.type === 'comp_wood') wood++;
  }
  ok(apples - before === 3, 'harvest spawned 3 apples: ' + (apples - before));
  return { kit, meta: meta1, xcapNow: HW().xcap, apples: apples - before, wood, treeGone: !S().p.some((q) => q.t === 'tree'), foodItem: !!(g.items && (await import('/src/game/items.js')).ITEMS.fd_apple) };
});

await step('wave', async () => {
  const gate = X.waveGate(HW(), S()), value = X.baseValue(HW(), S());
  ok(gate.ok, 'wave gate open: ' + JSON.stringify(gate));
  const s = A.layout(); s.wv.armed = 1; s.wv.left = 0.5;
  const g0 = g.homeworld.raid;
  await tick(30, 0.1);
  const started = !!g.homeworld.raid;
  ok(started && !g0, 'wave started the classic raid');
  await tick(260, 0.1);   // 26 s: prep + first raiders
  const alive = [...g.creatures.host.values()].filter((c) => !c.dead && c.data?.hw).length;
  const rs = g.homeworld.raid;
  const info = { power: Math.round(X.wavePower(value, 0, 0) * 100) / 100, raidP: rs ? Math.round(rs.sim.P * 100) / 100 : null, waves: rs?.sim.W, raiders: alive, phase: rs?.sim.phase, hud: g.run.hwr?.on || !!g.run.hwr };
  if (rs) rs.sim.core = 0;   // lose it on purpose
  await tick(100, 0.1);
  const meta = A.meta();
  ok(!g.homeworld.raid, 'raid finished');
  const broken = S().p.filter((p) => p.br).length;
  const shield = Math.round(((meta.w?.shield || 0) - Date.now()) / 1000);
  ok(broken >= 1 && shield > 800, `lost wave broke machines (${broken}) and raised the shield (${shield} s)`);
  const cr0 = g.run.credits; req('repair', { id: 'all' }); await tick(5, 0.1);
  ok(!S().p.some((p) => p.br), 'repair all fixed everything');
  const before = A.sim.gain.cr; void before;
  return { ...info, broken, shieldSec: shield, wavesSurvived: meta.w?.n, repairCost: Math.round(cr0 - g.run.credits), stats: S().st };
});

// ---------------------------------------------------------------- ground flicker: metric with the fix ON / OFF + composite screenshot
const engine = g.engine, cv = engine.renderer?.domElement || engine.canvas;
const tile = document.createElement('canvas'); tile.width = 640; tile.height = 360; const tx = tile.getContext('2d', { willReadFrequently: true });
const look = (px, py, pz, lx, ly, lz) => {
  g.player.teleport(V(px, py - 1.62, pz)); const d = V(lx - px, ly - py, lz - pz);
  g.player.yaw = Math.atan2(-d.x, -d.z); g.player.pitch = Math.asin(d.y / d.length());
};
const shot = () => { kefal.tick(1, 1 / 120, true); tx.drawImage(cv, 0, 0, 640, 360); return tx.getImageData(0, 0, 640, 360); };
function flicker(px, py, pz, lx, ly, lz) {   // fraction of ground pixels that flip between frames when the camera moves 0.7 mm
  let flips = 0, total = 0, prev = null;
  for (let i = 0; i < 8; i++) {
    look(px + 0.0007 * i, py, pz, lx, ly, lz); const im = shot();
    if (prev) for (let y = 180; y < 360; y += 2) for (let x = 0; x < 640; x += 2) { const k = (y * 640 + x) * 4; const d = Math.abs(im.data[k] - prev.data[k]) + Math.abs(im.data[k + 1] - prev.data[k + 1]) + Math.abs(im.data[k + 2] - prev.data[k + 2]); total++; if (d > 90) flips++; }
    prev = im;
  }
  return Math.round(flips / Math.max(1, total) * 10000) / 100;
}
function setFix(on) {
  const o = g.world.outdoor;
  o.group.traverse((m) => {
    if (!m.isMesh && !m.isLineSegments) return;
    const mat = m.material; if (!mat || Array.isArray(mat)) return;
    if (m.geometry?.type === 'PlaneGeometry' && m.geometry.parameters.width > 100 || m.geometry?.type === 'CircleGeometry' && m.geometry.parameters.radius === 14.5 || m.geometry?.type === 'RingGeometry') {
      if (!m.userData.h2fix) m.userData.h2fix = { d: mat.defines ? { ...mat.defines } : {}, po: mat.polygonOffset, y: m.position.y };
      const f = m.userData.h2fix;
      mat.defines = on ? f.d : {}; mat.polygonOffset = on ? f.po : false; mat.needsUpdate = true;
      if (m.geometry.type === 'CircleGeometry') m.position.y = on ? f.y : HOME_Y + 0.03;
    }
  });
  const glow = o.group.children.find((c) => c.material && c.material.vertexColors && c.geometry?.attributes?.color && c.geometry.attributes.position.count > 100 && c.material.type === 'MeshBasicMaterial');
  if (glow) { glow.material.defines = on ? { PSX_NOSNAP: '' } : {}; glow.material.needsUpdate = true; }
}
await step('flicker', async () => {
  g.ui?.hud?.hide?.();
  const res = {};
  const views = [[10, 'near'], [35, 'mid'], [80, 'far']];
  for (const [d, name] of views) {
    setFix(true); await tick(2, 1 / 60, true); const a = flicker(0, HOME_Y + 1.7, d, 0, HOME_Y, d - 30);   // grazing view of the pad + ground
    setFix(false); await tick(2, 1 / 60, true); const b = flicker(0, HOME_Y + 1.7, d, 0, HOME_Y, d - 30);
    res[name] = { fixedPct: a, oldPct: b };
  }
  setFix(true);
  ok(res.mid.fixedPct <= res.mid.oldPct + 0.01 && res.far.fixedPct <= res.far.oldPct + 0.01, 'fix does not flicker more than the old ground: ' + JSON.stringify(res));
  ok(res.near.fixedPct < 0.5 && res.mid.fixedPct < 0.5 && res.far.fixedPct < 0.5, 'fixed ground is stable (<0.5 % flipping pixels at 3 distances)');
  return res;
});

await step('composite', async () => {
  const comp = document.createElement('canvas'); comp.width = 1280; comp.height = 720; const cx = comp.getContext('2d');
  const grab = (px, py, pz, lx, ly, lz, ox, oy, label, fixOn = true) => { setFix(fixOn); look(px, py, pz, lx, ly, lz); kefal.tick(2, 1 / 120, true); cx.drawImage(cv, ox, oy, 640, 360); cx.fillStyle = '#000a'; cx.fillRect(ox, oy, 640, 22); cx.fillStyle = '#7fe8ff'; cx.font = '16px monospace'; cx.fillText(label, ox + 6, oy + 16); };
  const c = ctr(chain.C);
  const info = {};
  grab(0, HOME_Y + 1.7, 35, 0, HOME_Y, 5, 0, 0, 'FIXED ground, 35 m, grazing', true);
  grab(0, HOME_Y + 1.7, 35, 0, HOME_Y, 5, 640, 0, 'OLD ground (fix off), same view', false);
  setFix(true);
  grab(c.x * 0.4, HOME_Y + 28, c.z * 0.4 + 26, c.x, HOME_Y, c.z, 0, 360, 'factory overview', true);
  info.calls = g.engine.renderer.info.render.calls; info.tris = g.engine.renderer.info.render.triangles; info.geometries = g.engine.renderer.info.memory.geometries;
  const h = ctr(chain.Am);
  grab(h.x + 5, HOME_Y + 4, h.z + 6, h.x, HOME_Y + 0.6, h.z, 640, 360, 'belts + items + machines', true);
  info.drawCallsView = A.stats().drawCalls; info.items = A.stats().items;
  comp.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:720px;z-index:99999;image-rendering:pixelated';
  document.body.appendChild(comp);
  return info;
});

// ---------------------------------------------------------------- ghost raid: choose a rival, route, land, sentries + guards exist, crack the vault, loot, leave
await step('ghost', async () => {
  g.player.teleport(V(0, 0.4, 0)); g.player.inShip = true;
  g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); await tick(20, 1 / 30);
  ok(g.run.phase === 'orbit', 'back in orbit: ' + g.run.phase);
  const list = A.ghosts(), tgt = list.find((x) => x.id.startsWith('rival1'));
  ok(list.length >= 5 && tgt, 'ghost targets listed: ' + list.map((x) => x.id).join(','));
  req('gtarget', { id: tgt.id }); await tick(2, 1 / 30);
  const cr0 = g.run.credits;
  req('ghostgo'); await tick(2, 1 / 30);
  ok(g.run.moon === 'h2raid' && g.run.h2g?.b?.length > 5, 'routed to the ghost moon with a snapshot: ' + g.run.moon);
  g.hostLever(g.selfId); g.hostFinishLanding(); await tick(150, 1 / 30);
  const cnt = () => { let s = 0, u = 0; for (const c of g.creatures.host.values()) if (!c.dead) { if (c.type === 'h2_sentry') s++; else if (c.type === 'h2_guard') u++; } return { sentries: s, guards: u }; };
  const spawned = cnt();
  ok(spawned.sentries >= 3 && spawned.guards >= 2, 'ghost defenders spawned ' + JSON.stringify(spawned));
  const OFFZ = X.GHOST.off.z;
  g.player.inShip = false; g.player.teleport(V(0, HOME_Y + 0.4, OFFZ + 4)); await tick(3, 1 / 30);
  // an attacker fights back: kill the guards, keep hp up so the channel is not interrupted by the harness
  for (const c of [...g.creatures.host.values()]) if (c.type === 'h2_guard') g.creatures.kill(c, null, { silent: true });
  const hpBefore = g.player.hp;
  for (let i = 0; i < 10; i++) { g.player.hp = g.player.maxHp || 100; await tick(30, 1 / 30); }
  const hurt = (g.player.maxHp || 100) - hpBefore;
  req('gcrack'); let done = false;
  for (let i = 0; i < 20 && !done; i++) { g.player.hp = g.player.maxHp || 100; await tick(30, 1 / 30); done = g.run.credits > cr0; }
  const s = A.layout();
  ok(done, 'vault cracked, loot paid: +' + (g.run.credits - cr0));
  ok(Object.keys(s.g.raided).length >= 1, 'cooldown recorded: ' + JSON.stringify(s.g.raided));
  const off = [...g.creatures.host.values()].filter((c) => c.type === 'h2_sentry' && c.data.off).length;
  g.player.teleport(V(0, 0.4, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); await tick(20, 1 / 30);
  ok(g.run.moon === 'home' && !g.run.h2g, 'route restored after the raid: ' + g.run.moon);
  return { spawned, sentriesOffAfterWin: off, credits: g.run.credits - cr0, moonAfter: g.run.moon, playerHpLoss: hurt, ghostWins: s.st.ghostWins };
});
out.errs = errs.filter((e) => !/AudioContext|ResizeObserver|autoplay|favicon|WebGL|GPU stall|ReadPixels/i.test(e));
ok(out.errs.length === 0, 'no page errors: ' + out.errs.slice(0, 3).join(' | '));
return out;
