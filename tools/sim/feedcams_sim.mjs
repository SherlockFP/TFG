// FEEDCAMS tuning sim (wave 8, docs/wave8/feedcams2.md): one facility day, a crew of 2, the REAL camera plan (feedcams_core.planCams on
// real generateLayout interiors), the REAL sight / meter / heat / tax maths. Only the players are modelled:
//   careful   plans around camera coverage (+cost per watched cell), crouches under cameras, waits for a sweep to pass (max 6 s)
//   average   shortest path, crouches in watched rooms, never waits
//   sloppy    shortest path at a jog, never crouches, never waits
//   showman   careful with small scrap, but walks big scrap (>= SHOW.min) straight through a cone on purpose ("go live on purpose")
// Line of sight = grid walk through open cell edges (doors count as open, props ignored: slightly pessimistic for the crew).
// Usage: node tools/sim/feedcams_sim.mjs [seeds=24] [key=value ...]   e.g. acquire=2.5 tax=0.3 hold=6 decay=0.4
import { generateLayout } from '../../src/world/facility.js';
import { ITEMS, scrapTableFor, bigTableFor } from '../../src/game/items.js';
import { RNG } from '../../src/core/rng.js';
import * as K from '../../src/game/feedcams_core.js';
import { SHOW } from '../../src/game/feedcams2_core.js';

const args = process.argv.slice(2);
const SEEDS = Number(args.find((a) => /^\d+$/.test(a))) || 24;
for (const a of args) { const m = /^(\w+)=([\d.]+)$/.exec(a); if (m && m[1] in K.FC) K.FC[m[1]] = +m[2]; else if (m && m[1] in SHOW) SHOW[m[1]] = +m[2]; }
const TAG = !args.includes('notag');   // tagged trip: once live, everything you bring home on that trip pays the tax (clear it by killing the camera that tagged you)
const SPOTS = !args.includes('nospots');   // [camloot] pass the loot spots to planCams (cameras guard the money); 'nospots' = the wave-8 plan
const CUTS = !args.includes('nocuts');   // careful / showman crews use the junction box (sim of the wave-9 counter trade)
const WAVEC = Number(args.find((a) => a.startsWith('wavecost='))?.slice(9) ?? 40);   // [camloot] s each crewmate loses per creature wave (heat >= FC.heat.wave, every waveEvery s): fleeing / fighting instead of looting
const LOOT = 4;   // s spent in the room per item (looking, picking up, checking the scanner)
const FC = K.FC, DT = 0.1, DAY = 540;   // s of facility time per crewmate per day (a 12-min day minus the walks outside)
const SPEED = { careful: 5.0, crouch: 2.6, average: 5.0, sloppy: 7.4 };   // localplayer.js: walk 5, crouch 2.6, sprint 8.2 (sloppy sprints ~75 % of the time)
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
const avgVal = (id) => { const v = ITEMS[id]?.value; return Array.isArray(v) ? (v[0] + v[1]) / 2 : 10; };

function world(seed, size) {
  const L = generateLayout(seed * 977 + size * 100, 'factory', size, null);
  const cx = (x) => L.ox + (x + 0.5) * L.cell, cz = (z) => L.oz + (z + 0.5) * L.cell;
  const gx = (x) => Math.floor((x - L.ox) / L.cell), gz = (z) => Math.floor((z - L.oz) / L.cell);
  const walk = (x, z) => x >= 0 && z >= 0 && x < L.w && z < L.h && !!L.cells[L.idx(x, z)];
  const step = (a, b) => {   // can sight / a walker pass from cell a to the 4-neighbour b
    for (let d = 0; d < 4; d++) if (a[0] + DX[d] === b[0] && a[1] + DZ[d] === b[1]) return L.open.has(L.edgeKey(a[0], a[1], d)) && walk(b[0], b[1]);
    return false;
  };
  function los(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25);
    let pc = [gx(ax), gz(az)];
    for (let i = 1; i <= n; i++) {
      const c = [gx(ax + (bx - ax) * i / n), gz(az + (bz - az) * i / n)];
      if (c[0] === pc[0] && c[1] === pc[1]) continue;
      if (c[0] !== pc[0] && c[1] !== pc[1]) {
        const m1 = [c[0], pc[1]], m2 = [pc[0], c[1]];
        if (!((step(pc, m1) && step(m1, c)) || (step(pc, m2) && step(m2, c)))) return false;
      } else if (!step(pc, c)) return false;
      pc = c;
    }
    return true;
  }
  // loot: small scrap + a few big items on walkable cells away from the entrance
  const rng = new RNG(seed * 7 + 1), cells = [];
  for (let z = 0; z < L.h; z++) for (let x = 0; x < L.w; x++) if (walk(x, z) && (L.distOf[L.idx(x, z)] | 0) > 2) cells.push([x, z]);
  const small = scrapTableFor('factory').map(([id, w]) => ({ id, w })), big = bigTableFor('factory').map(([id, w]) => ({ id, w }));
  const loot = [];
  const nS = Math.round(10 + 6 * size), nB = Math.round(1 + size);
  const deep = cells.slice().sort((a, b) => L.distOf[L.idx(b[0], b[1])] - L.distOf[L.idx(a[0], a[1])]).slice(0, Math.ceil(cells.length * 0.3));   // [camloot] the good stuff (big scrap) lies deep
  for (let i = 0; i < nS + nB; i++) { const pool = i >= nS ? deep : cells, c = pool[rng.int(0, pool.length - 1)], id = rng.weighted(i < nS ? small : big).id; loot.push({ c, v: Math.round(avgVal(id)), big: i >= nS }); }
  const spots = loot.map((o) => ({ room: L.rooms.find((r) => o.c[0] >= r.x && o.c[0] < r.x + r.w && o.c[1] >= r.z && o.c[1] < r.z + r.h)?.id ?? -1, dist: L.distOf[L.idx(o.c[0], o.c[1])] | 0 }));
  const cams = K.planCams(L, { seed: seed * 31, day: 5, quotaIndex: 2, size, spots: SPOTS ? spots : null });
  // watched cells: some point of the sweep envelope sees the cell centre
  const watched = new Set(), covers = new Map();   // covers: cell -> [camera index] (the counter model cuts the ones that guard the cell it wants to work in)
  for (let z = 0; z < L.h; z++) for (let x = 0; x < L.w; x++) {
    if (!walk(x, z)) continue;
    for (const c of cams) {
      const px = cx(x), pz = cz(z), d = Math.hypot(px - c.x, pz - c.z);
      if (d > c.R || d < c.r0 * 0.5) continue;
      if (Math.abs(K.angDiff(c.h, Math.atan2(pz - c.z, px - c.x))) > c.amp + c.fov / 2) continue;
      if (los(c.x, c.z, px, pz)) { watched.add(L.idx(x, z)); const k = L.idx(x, z); if (!covers.has(k)) covers.set(k, []); covers.get(k).push(c.i); }
    }
  }
  const ent = [L.entrance.room.cx, L.entrance.room.cz];
  function path(from, to, avoid) {   // Dijkstra over cells; avoid = extra cost per watched cell
    const N = L.w * L.h, dist = new Float64Array(N).fill(1e9), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    const s = L.idx(from[0], from[1]), t = L.idx(to[0], to[1]);
    dist[s] = 0;
    for (;;) {
      let u = -1, best = 1e9;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0 || u === t) break;
      done[u] = 1;
      const ux = u % L.w, uz = (u / L.w) | 0;
      for (let d = 0; d < 4; d++) {
        const v = [ux + DX[d], uz + DZ[d]];
        if (!step([ux, uz], v)) continue;
        const vi = L.idx(v[0], v[1]), w = 1 + (avoid && watched.has(vi) ? avoid : 0);
        if (dist[u] + w < dist[vi]) { dist[vi] = dist[u] + w; prev[vi] = u; }
      }
    }
    const out = [];
    for (let c = t; c >= 0; c = prev[c]) { out.push([c % L.w, (c / L.w) | 0]); if (c === s) break; }
    return out.reverse();
  }
  return { L, cams, covers, cx, cz, gx, gz, los, watched, ent, path, loot };
}

function day(W, policy) {
  const { cams, covers, cx, cz, los, watched, ent, path, L } = W;
  const camOff = cams.map(() => 0);   // [camloot] s until a cut camera reboots
  const loot = W.loot.map((o) => ({ ...o, taken: false }));
  const crew = [0, 1].map((i) => ({ i, t: i * 20, x: cx(ent[0]), z: cz(ent[1]), plan: [], bag: [], m: 0, pk: 0, air: 0, wait: 0, done: false }));
  let cuts = 0, h = 0, waveAt = 0, waves = 0, hMax = 0, live = 0, airS = 0, over30 = 0, reach65 = 0, haul = 0, cut = 0, shown = 0, shownCut = 0, jukes = 0;
  const seen = (p, t, crouch) => {
    let best = null, n = 0;
    for (const c of cams) {
      if (camOff[c.i] > t) continue;
      const yaw = K.camYaw(c, t), q = K.inCone(c, yaw, p.x, p.z, crouch);
      if (q.ok && los(c.x, c.z, p.x, p.z)) { n++; if (!best || q.d < best.d) best = q; }
    }
    return best ? { d: best.d, n } : null;
  };
  const big = (p) => p.bag.some((o) => o.big), home = (p) => big(p) || p.bag.length >= 3;
  const show = (p) => policy === 'showman' && p.bag.some((o) => o.v >= SHOW.min);
  const avoid = (p) => (policy === 'careful' || (policy === 'showman' && !show(p)) ? 4 : 0);
  const next = (p) => {
    let bi = -1, bd = 1e9;
    if (!home(p)) loot.forEach((o, k) => { if (!o.taken && !o.claim && !(o.big && p.bag.length)) { const d = Math.hypot(o.c[0] - W.gx(p.x), o.c[1] - W.gz(p.z)); if (d < bd) { bd = d; bi = k; } } });
    if (p.bag.length && (bi < 0 || bd > 6 || home(p))) { p.goal = null; p.plan = path([W.gx(p.x), W.gz(p.z)], ent, avoid(p)); return; }   // full, or nothing close: bring it home (up to 3 small items or one big)
    if (bi < 0) { p.done = true; return; }
    loot[bi].claim = true; p.goal = bi;
    p.plan = path([W.gx(p.x), W.gz(p.z)], loot[bi].c, avoid(p));
  };
  for (let t = 0; t < DAY + 40; t += DT) {
    let nAir = 0;
    for (const p of crew) {
      if (p.done) continue;
      const busy = t < p.t, outside = busy && p.out;
      if (outside) { p.m = Math.max(0, p.m - FC.decay * DT); p.air = 0; continue; }
      if (!busy && !p.plan.length) {
        p.out = false;
        const at = [W.gx(p.x), W.gz(p.z)];
        if (p.bag.length && p.goal == null && at[0] === ent[0] && at[1] === ent[1]) {   // at the entrance: the walk to the ship (camera-free outdoors in the day)
          for (const o of p.bag) { const tx = o.mark || (TAG && p.tag) ? K.taxOf(o.v).cut : 0; haul += o.v; cut += tx; if (tx && o.v >= SHOW.min) { shown++; shownCut += tx; } }
          p.bag = []; p.t = t + 30; p.out = true; p.tag = false;
          if (t > DAY - 60) { p.done = true; continue; }
        } else if (p.goal != null && at[0] === loot[p.goal].c[0] && at[1] === loot[p.goal].c[1]) { loot[p.goal].taken = true; p.bag.push({ v: loot[p.goal].v, big: loot[p.goal].big, mark: false }); p.goal = null; p.t = t + LOOT; }
        next(p); if (p.done || p.out) continue;
      }
      const tgt = p.plan[0] || [W.gx(p.x), W.gz(p.z)], tx = cx(tgt[0]), tz = cz(tgt[1]), lv = (k) => (covers.get(k) || []).some((i) => camOff[i] <= t), cov = lv(L.idx(tgt[0], tgt[1])) || lv(L.idx(W.gx(p.x), W.gz(p.z)));
      const careful = policy === 'careful' || (policy === 'showman' && !show(p));
      const crouch = (careful || policy === 'average') && cov;
      // [camloot] counter: a careful crew that is about to WORK in a guarded room (loot stops last LOOT s) cuts its junction box first: walk there + a CUT_HOLD s hold, the lens reboots after 90-120 s
      if (CUTS && careful && p.goal != null && p.plan.length <= 2 && p.cutFor !== p.goal && t >= p.t) {
        p.cutFor = p.goal;
        const g = loot[p.goal].c;
        for (const i of covers.get(L.idx(g[0], g[1])) || []) {
          if (camOff[i] > t) continue;
          const c = cams[i], dj = Math.hypot(c.jb.x - p.x, c.jb.z - p.z);
          if (dj > 16) continue;
          const cost = FC.cutHold + dj / SPEED.careful + Math.min(dj, 6) / SPEED.careful;   // there, hold, and back into the room
          camOff[i] = t + cost + K.rebootIn(0.5); p.t = t + cost; cuts++;
        }
      }
      let sp = policy === 'sloppy' || show(p) ? SPEED.sloppy : crouch ? SPEED.crouch : policy === 'average' ? SPEED.average : SPEED.careful;
      if (big(p)) sp = Math.min(sp, SPEED.careful * 0.8);   // two hands, heavy: no sprint
      // careful: do not step into a cone that is there now or sweeping in; showman with big scrap: stand in the cone until live
      const here = seen(p, t, crouch);
      if (careful && cov && !here && p.wait < 6) {
        const d = Math.hypot(tx - p.x, tz - p.z), s = Math.min(1, sp * 0.6 / Math.max(0.01, d)), q = { x: p.x + (tx - p.x) * s, z: p.z + (tz - p.z) * s };
        if (seen(q, t, true) || seen(q, t + 0.6, true) || seen(q, t + 1.2, true)) { p.wait += DT; sp = 0; } else p.wait = 0;
      } else if (!here) p.wait = 0;
      if (show(p) && here && p.air <= t) sp = 0;   // pose for the camera
      if (t < p.t || !p.plan.length) sp = 0;       // looting: standing in the room
      const d = Math.hypot(tx - p.x, tz - p.z), mv = sp * DT;
      if (d <= mv) { p.x = tx; p.z = tz; p.plan.shift(); } else { p.x += (tx - p.x) / d * mv; p.z += (tz - p.z) / d * mv; }
      // meter
      const x = seen(p, t, crouch), r = K.meterStep(p.m, x ? K.exposureRate(x.d, crouch, x.n, sp >= FC.sprintV) : 0, DT, p.pk);
      p.m = r.m; p.pk = r.pk;
      if (r.live) { p.air = t + FC.hold; live++; h = Math.min(FC.heat.max, h + FC.heat.spike); } else if (p.m >= 1) p.air = t + FC.hold;
      if (p.air && t >= p.air) { p.air = 0; p.m = Math.min(p.m, 0.5); }
      if (r.juke) jukes++;
      if (p.air > t) { nAir++; p.tag = true; for (const o of p.bag) o.mark = true; }
    }
    airS += nAir * DT;
    h = K.heatStep(h, nAir, DT); hMax = Math.max(hMax, h);
    if (h >= FC.heat.ping) over30 += DT;
    if (h >= FC.heat.wave) { reach65 = 1; if (t >= waveAt) { waveAt = t + FC.heat.waveEvery; waves++; for (const p of crew) if (!p.done && !p.out) p.t = Math.max(p.t, t) + WAVEC; } }
  }
  return { haul, cut, cuts, waves, live, airS, hMax, over30, reach65, shown, shownCut, jukes, n: loot.filter((o) => o.taken).length };
}

const POL = ['careful', 'average', 'sloppy', 'showman'];
const tot = Object.fromEntries(POL.map((p) => [p, { haul: 0, cut: 0, cuts: 0, waves: 0, live: 0, airS: 0, hMax: 0, over30: 0, reach65: 0, shown: 0, shownCut: 0, jukes: 0, n: 0, days: 0 }]));
let camsN = 0, cov = 0, cellsN = 0;
for (const size of [1.0, 1.5]) for (let s = 1; s <= SEEDS; s++) {
  const W = world(s, size);
  camsN += W.cams.length; cov += W.watched.size;
  for (let z = 0; z < W.L.h; z++) for (let x = 0; x < W.L.w; x++) if (W.L.cells[W.L.idx(x, z)]) cellsN++;
  for (const p of POL) { const r = day(W, p), T = tot[p]; for (const k in r) T[k] += r[k]; T.days++; }
}
const f = (x, d = 1) => x.toFixed(d);
console.log(`feedcams sim: ${SEEDS * 2} layouts, ${f(camsN / SEEDS / 2)} cams/day, ${f(100 * cov / cellsN)} % of cells watched | acquire ${FC.acquire} decay ${FC.decay} hold ${FC.hold} tax ${FC.tax} crouchMul ${FC.crouchMul} show>=${SHOW.min}`);
console.log('policy    haul/day    net  items  taxed%  waves  cuts  live/day  airS/day  heatMax  s>=30  days>=70  jukes  showcases(cut)');
for (const p of POL) {
  const T = tot[p], D = T.days;
  console.log(`${p.padEnd(9)} ${f(T.haul / D, 0).padStart(8)} ${f((T.haul - T.cut) / D, 0).padStart(6)} ${f(T.n / D).padStart(6)} ${f(100 * T.cut / Math.max(1, T.haul)).padStart(7)} ${f(T.waves / D).padStart(6)} ${f(T.cuts / D).padStart(5)} ${f(T.live / D).padStart(9)} ${f(T.airS / D, 0).padStart(9)} ${f(T.hMax / D, 0).padStart(8)} ${f(T.over30 / D, 0).padStart(6)} ${f(100 * T.reach65 / D, 0).padStart(8)}% ${f(T.jukes / D).padStart(6)}  ${f(T.shown / D)} (${f(T.shownCut / D, 0)})`);
}
const net = (p) => (tot[p].haul - tot[p].cut) / tot[p].days;
console.log(`net gap: careful vs sloppy ${f(100 * (net('careful') / net('sloppy') - 1))} % (target >= 15) | careful vs average ${f(100 * (net('careful') / net('average') - 1))} % | showman vs careful ${f(100 * (net('showman') / net('careful') - 1))} % (going live on purpose: cheaper than -30, dearer than 0)`);
