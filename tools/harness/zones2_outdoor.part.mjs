// (part of zones2.test.mjs: outdoor wall validation, ring spots, raider pathing, archive, miners + income; imported by it)
import { generateSector } from '../../src/game/moongen.js';
import { MOONS, MOON_ORDER } from '../../src/game/moons.js';
import { RNG, hashString } from '../../src/core/rng.js';
import { Terrain, planMoon } from '../../src/world/terrain.js';
import { inBox, distToHull, FlowField } from '../../src/game/siege_core.js';
import * as Z from '../../src/game/zones_core.js';
import * as Q from '../../src/game/zones2_core.js';

export function outdoorTests({ ok, say }) {
  const moons = MOON_ORDER.map((id) => MOONS[id]).filter((m) => Z.zonesEligible(m));
  for (const m of generateSector('zt', 2).moons) moons.push(MOONS[m.id] || m);
  const W = Z.WALL;

  // ============================================================ wall placement validation on real terrain (+ fake rocks / trees)
  let okPieces = 0, badPieces = 0, terrains = 0, rejectedBy = {};
  for (const m of moons.slice(0, 14)) {
    terrains++;
    const seed = (hashString('zw' + m.id) >>> 0) % 1e9, plan = planMoon(seed, m), ter = new Terrain(seed, m, plan);
    const spec = Z.zoneSpec(m, 'RUNA'), cores = Z.placeCores(spec, plan, Z.coreProbe(ter), ter.playHalf, 'RUNA').filter((c) => c.x !== null);
    const rng = new RNG(hashString('rocks' + m.id));
    const core = cores[0];
    const obstacles = [];
    for (let i = 0; i < 40; i++) obstacles.push({ x: core.x + rng.float(-22, 22), z: core.z + rng.float(-22, 22), r: rng.float(0.5, 1.6) });
    const ctx = { core, zoneR: Z.ZN.zoneR, ter, cores, obstacles, circles: [], existing: [], cap: 999 };
    const kept = [];
    for (let gx = -16; gx <= 16; gx += 2) for (let gz = -16; gz <= 16; gz += 2) for (const r of [0, 1]) {
      const p = [(gx + gz) % 4 === 0 ? 1 : 0, gx, gz, r];
      const v = Q.validateWall({ ...ctx, existing: kept }, p);
      const b = Q.pieceBox(core, p);
      // independent re-check of everything the validator promises
      const pts = [-1, -0.5, 0, 0.5, 1].map((t) => (r ? { x: b.x, z: b.z + t * b.hx } : { x: b.x + t * b.hx, z: b.z }));
      if (v.ok) {
        okPieces++; kept.push(p);
        ok(Math.abs(b.x - (core.x + gx * W.fc)) < 1e-9 && Math.abs(b.z - (core.z + gz * W.fc)) < 1e-9, `${m.id}: piece centre snaps to the ${W.fc} m grid`);
        const hs = pts.map((q) => ter.heightAt(q.x, q.z));
        ok(Math.max(...hs) - Math.min(...hs) <= W.maxSlope + 1e-9, `${m.id}: valid piece stands on gentle ground (${(Math.max(...hs) - Math.min(...hs)).toFixed(2)} m)`);
        ok(ter.flood == null || hs.every((h) => h >= ter.flood + 0.3), `${m.id}: valid piece is not in water`);
        ok(pts.every((q) => distToHull(q.x, q.z) >= W.shipKeep), `${m.id}: valid piece keeps off the ship`);
        ok(!obstacles.some((o) => inBox(o.x, o.z, b, o.r + 0.25 - 1e-6)), `${m.id}: valid piece does not clip a rock / tree`);
        const dc = Math.hypot(b.x - core.x, b.z - core.z);
        ok(dc >= W.minCore && dc <= Z.ZN.zoneR - 1, `${m.id}: valid piece is inside the zone ring, off the core`);
        ok(cores.every((c) => c === core || Math.hypot(c.x - b.x, c.z - b.z) >= W.coreClear), `${m.id}: valid piece off other cores`);
        ok(v.y >= Math.max(...hs) - 1e-9, 'reports the highest ground');
      } else { badPieces++; rejectedBy[v.why] = (rejectedBy[v.why] || 0) + 1; }
    }
    // kept pieces never overlap each other
    for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) {
      const a = Q.pieceBox(core, kept[i]), b = Q.pieceBox(core, kept[j]);
      const A = a.yaw ? [a.x - a.hz + 0.08, a.x + a.hz - 0.08, a.z - a.hx + 0.2, a.z + a.hx - 0.2] : [a.x - a.hx + 0.2, a.x + a.hx - 0.2, a.z - a.hz + 0.08, a.z + a.hz - 0.08];
      const B = b.yaw ? [b.x - b.hz + 0.08, b.x + b.hz - 0.08, b.z - b.hx + 0.2, b.z + b.hx - 0.2] : [b.x - b.hx + 0.2, b.x + b.hx - 0.2, b.z - b.hz + 0.08, b.z + b.hz - 0.08];
      ok(!(A[0] < B[1] && B[0] < A[1] && A[2] < B[3] && B[2] < A[3]), `${m.id}: kept pieces do not overlap`);
    }
    // a rock dropped on a valid piece invalidates it; the same for a deployable circle and for a physics hit
    if (kept.length) {
      const p = kept[0], b = Q.pieceBox(core, p), others = kept.slice(1);
      ok(Q.validateWall({ ...ctx, existing: others, obstacles: [{ x: b.x, z: b.z, r: 0.8 }] }, p).why === 'Blocked by a rock or tree.', `${m.id}: a rock on the piece refuses it`);
      ok(!Q.validateWall({ ...ctx, existing: others, circles: [{ x: b.x, z: b.z, r: 0.5 }] }, p).ok, `${m.id}: a turret on the piece refuses it`);
      ok(!Q.validateWall({ ...ctx, existing: others, solid: () => true }, p).ok, `${m.id}: a static collider (physics) refuses it`);
      ok(!Q.validateWall({ ...ctx, existing: kept }, p).ok, `${m.id}: the same piece twice refused`);
      ok(Q.validateWall({ ...ctx, existing: kept, cap: kept.length }, [0, 30, 30, 0]).ok === false, 'far piece refused');
    }
  }
  ok(okPieces > 100 && badPieces > 50, `wall validator both accepts and rejects: ${okPieces} ok, ${badPieces} refused ${JSON.stringify(rejectedBy)}`);
  ok(Object.keys(rejectedBy).length >= 4, 'several rejection reasons occur: ' + Object.keys(rejectedBy).join(' | '));
  say(`wall placement: ${terrains} terrains, ${okPieces} valid pieces re-checked independently, ${badPieces} refused`);

  // ---- fixed rules on flat ground (fake terrain)
  {
    const flat = { heightAt: () => 5, flood: null, playHalf: 130 }, core = { x: 60, z: 40 };
    const base = { core, zoneR: 24, ter: flat, cores: [core], existing: [], cap: 3 };
    ok(Q.validateWall(base, [0, 4, 0, 0]).ok, 'flat ground: piece ok');
    ok(Q.validateWall({ ...base, people: [{ x: core.x + 6, z: core.z + 0.2 }] }, [0, 4, 0, 0]).why === 'Someone is in the way.', 'a player standing there refuses the piece (no collider inside a capsule)');
    ok(Q.validateWall({ ...base, people: [{ x: core.x + 12, z: core.z + 6 }] }, [0, 4, 0, 0]).ok, 'a player standing elsewhere does not');
    ok(Q.validateWall(base, [0, 1, 0, 0]).why === 'Too close to the core.', 'too close to the core');
    ok(Q.validateWall(base, [0, 30, 0, 0]).why === 'Outside the zone.', 'outside the zone');
    ok(!Q.validateWall({ ...base, core: { x: 2, z: 2 }, cores: [] }, [0, 5, 0, 0]).ok, 'next to the ship refused');
    ok(Q.validateWall({ ...base, ter: { ...flat, flood: 5.2 } }, [0, 4, 0, 0]).why === 'Water: nothing stands here.', 'water refused');
    const slope = { heightAt: (x) => x * 0.5, flood: null, playHalf: 130 };
    ok(Q.validateWall({ ...base, ter: slope }, [0, 4, 0, 0]).why === 'Too steep or uneven.', 'slope refused');
    ok(Q.validateWall({ ...base, existing: [[0, 4, 0, 0], [0, 6, 0, 0], [0, 8, 0, 0]] }, [0, 4, 3, 0]).why === 'No free wall slots: upgrade the zone.', 'slot cap');
    ok(Q.validateWall({ ...base, existing: [[0, 4, 0, 0]], cap: 9 }, [0, 4, 0, 0]).why === 'Already a piece here.', 'duplicate refused');
    ok(Q.validateWall({ ...base, existing: [[0, 4, 0, 0]], cap: 9 }, [0, 6, 0, 0]).ok, 'adjacent piece (2 grid cells = one length) fits');
    ok(Q.validateWall({ ...base, existing: [[0, 4, 0, 0]], cap: 9 }, [0, 5, 1, 1]).ok, 'a perpendicular piece can corner-join (L joint)');
    ok(Q.validateWall({ ...base, existing: [[0, 4, 0, 0]], cap: 9 }, [0, 5, 0, 0]).why === 'Already a piece here.', 'half-overlapping piece refused');
    ok(!Q.validateWall(base, [2, 4, 0, 0]).ok && !Q.validateWall(base, [0, 4.5, 0, 0]).ok, 'bad piece data refused');
    const line = Q.wallLine(core, core.x + 8, core.z, Math.PI / 2, 4, 1);
    ok(line.length === 4 && line.every((p) => p[3] === 1) && line.filter((p) => p[0] === 1).length === 1, 'wall line: 4 pieces, one gate, facing +x -> runs along z');
    ok(line.every((p, i) => i === 0 || (p[2] - line[i - 1][2] === 2 && p[1] === line[0][1])), 'wall line pieces are one length apart on the grid');
    const fit = Q.fitWalls({ ...base, cap: 99 }, [...line, [0, 4, 0, 0]]);
    ok(fit.kept.length >= 4, 'fitWalls keeps what fits');
    const fit2 = Q.fitWalls({ ...base, cap: 99, ter: { ...flat, flood: 9 } }, line);
    ok(fit2.kept.length === 0 && fit2.dropped.length === 4, 'fitWalls drops pieces that no longer fit a new landing (water)');
    say('wall placement rules (fixed cases)');
  }

  // ============================================================ ring defences: validated spots
  {
    let found = 0, tried = 0;
    for (const m of moons.slice(0, 10)) {
      const seed = (hashString('zr' + m.id) >>> 0) % 1e9, plan = planMoon(seed, m), ter = new Terrain(seed, m, plan);
      const spec = Z.zoneSpec(m, 'RUNA'), cores = Z.placeCores(spec, plan, Z.coreProbe(ter), ter.playHalf, 'RUNA').filter((c) => c.x !== null);
      const core = cores[0], rng = new RNG(hashString('rr' + m.id));
      const obstacles = []; for (let i = 0; i < 60; i++) obstacles.push({ x: core.x + rng.float(-20, 20), z: core.z + rng.float(-20, 20), r: rng.float(0.6, 1.8) });
      const placed = [];
      for (let k = 0; k < 8; k++) {
        tried++;
        const outer = k % 2 === 0;
        const spot = Q.ringSpots(core, `${m.id}:A`, k, outer).find((s) => Q.checkSpot({ core, cores, ter, obstacles, placed, walls: [] }, s.x, s.z, 0.6).ok);
        if (!spot) continue;
        found++; placed.push({ x: spot.x, z: spot.z, r: 0.6 });
        ok(Math.hypot(spot.x - core.x, spot.z - core.z) <= Z.ZN.zoneR && Math.hypot(spot.x - core.x, spot.z - core.z) >= 3.2, `${m.id}: ring spot is inside the zone`);
        ok(!obstacles.some((o) => Math.hypot(o.x - spot.x, o.z - spot.z) < o.r + 0.6), `${m.id}: ring spot does not clip a rock / tree`);
        ok(ter.flood == null || ter.heightAt(spot.x, spot.z) >= ter.flood + 0.35, `${m.id}: ring spot is dry`);
        ok(distToHull(spot.x, spot.z) >= 2.6, `${m.id}: ring spot off the ship`);
      }
      for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) ok(Math.hypot(placed[i].x - placed[j].x, placed[i].z - placed[j].z) >= 1.2, 'ring spots do not stack');
    }
    ok(found >= tried * 0.7, `the search usually finds a valid spot: ${found}/${tried}`);
    const c0 = { x: 50, z: 50 }, flat = { heightAt: () => 3, flood: null, playHalf: 130 };
    ok(!Q.checkSpot({ core: c0, cores: [c0], ter: flat, obstacles: [{ x: 56, z: 50, r: 1 }], placed: [], walls: [] }, 56, 50).ok, 'rock refused');
    ok(!Q.checkSpot({ core: c0, cores: [c0], ter: flat, obstacles: [], placed: [], walls: [Q.pieceBox(c0, [0, 4, 0, 0])] }, c0.x + 6, c0.z).ok, 'a wall piece refuses the spot');
    ok(!Q.checkSpot({ core: c0, cores: [c0], ter: flat, obstacles: [], placed: [], walls: [], solid: () => true }, 58, 50).ok, 'physics hit refuses the spot');
    say(`ring defences: validated spot search found ${found}/${tried}`);
  }

  // ============================================================ raider pathing around a barricade (flow field aimed at the core)
  {
    const core = { x: 50, z: 10 };
    const simulate = (pieces, extra, start, opts = {}) => {
      const dead = new Set();
      let wb, solid, flow;
      const rebuild = () => { wb = Q.wallBlockers(core, pieces, dead); solid = [...wb.solid, ...extra.filter((b) => b.solid !== false)]; flow = Q.coreFlow(130, core, [...wb.flow, ...extra]); };
      rebuild();
      const pos = { x: start.x, z: start.z }, d = { x: 0, z: 0 };
      const log = { steps: 0, blocked: [], chewed: [], maxDev: 0, ok: false, gateSeen: false };
      for (; log.steps < 4000; log.steps++) {
        if (Math.hypot(pos.x - core.x, pos.z - core.z) < 4.2) { log.ok = true; break; }
        if (!flow.dirAt(pos.x, pos.z, d)) { const l = Math.hypot(core.x - pos.x, core.z - pos.z) || 1; d.x = (core.x - pos.x) / l; d.z = (core.z - pos.z) / l; }
        const r = Q.moveRaider(pos, d, 0.25, 0.4, solid);
        if (r?.blocked) {
          if (opts.chew && r.blocked !== 'ship' && r.blocked.wall !== undefined) { dead.add(r.blocked.wall); log.chewed.push(r.blocked.wall); rebuild(); continue; }
          log.blocked.push(r.blocked.id || r.blocked); break;
        }
        for (const b of wb.flow) if (b.type === 'gate' && inBox(pos.x, pos.z, b, 0)) log.gateSeen = true;
        log.maxDev = Math.max(log.maxDev, Math.abs(pos.z - start.z));
      }
      return log;
    };
    const start = { x: 100, z: 10 };
    // a wall line across the straight route (x = 75, z from -6 to +26) with open ground beyond its ends
    const wall = [];
    for (let gz = -4; gz <= 16; gz += 2) wall.push([0, Math.round((75 - core.x) / W.fc), Math.round((core.z - 8) / W.fc) + gz - 0, 1]);
    const straightHits = wall.some((p) => { const b = Q.pieceBox(core, p); let hit = false; for (let t = 0; t <= 1; t += 0.01) if (inBox(start.x + (core.x - start.x) * t, start.z + (core.z - start.z) * t, b, 0.3)) hit = true; return hit; });
    ok(straightHits, 'v1 straight-line movement WOULD run into the wall (the wall is really in the way)');
    const a = simulate(wall, [], start);
    ok(a.ok && a.blocked.length === 0, `the raider reaches the core without touching the wall: ${a.steps} steps, blocked ${a.blocked}`);
    ok(a.maxDev > 6, `it walked AROUND the wall (lateral detour ${a.maxDev.toFixed(1)} m)`);
    // deployable barricade (blockers() shape of deployables.js): cost 25, solid
    const bar = { id: 'dB', x: 75, z: 10, hx: 1.1, hz: 0.22, yaw: Math.PI / 2, cost: 25 };
    const b = simulate([], [bar], start);
    ok(b.ok && b.blocked.length === 0 && b.maxDev > 0.8, `and around a single barricade (${b.steps} steps, detour ${b.maxDev.toFixed(1)} m)`);
    // a fully closed ring of walls with one gate: the flow field funnels through the gate
    // a square ring (24 m wide) of 3 m pieces; the east side has a gate in the middle (pieces cross at the corners = sealed)
    const ring = [];
    for (let i = -8; i <= 8; i += 2) { ring.push([0, i, 8, 0], [0, i, -8, 0], [i === 0 ? 1 : 0, 8, i, 1], [0, -8, i, 1]); }
    const g = simulate(ring, [], { x: core.x + 45, z: core.z + 30 });
    // gate at angle 0 = east side of the ring; approach from the north-east: must walk to the gate
    ok(g.ok && g.blocked.length === 0 && g.gateSeen, `a closed ring with one gate: the raider funnels through the gate (${g.steps} steps, gate seen ${g.gateSeen})`);
    const closed = ring.map((p) => (p[0] === 1 ? [0, p[1], p[2], p[3]] : p));
    const c = simulate(closed, [], { x: core.x + 45, z: core.z + 30 }, { chew: true });
    ok(c.ok && c.chewed.length >= 1 && c.chewed.length <= 2, `a fully closed ring cannot stop them forever: they chew through ${c.chewed.length} wall(s) and arrive (${c.steps} steps)`);
    // wall blockers: gates are not solid, walls are; dead pieces vanish
    const wb = Q.wallBlockers(core, [[0, 4, 0, 0], [1, 8, 0, 0]], new Set());
    ok(wb.flow.length === 2 && wb.solid.length === 1 && wb.flow[1].cost < wb.flow[0].cost, 'walls solid + costly, gates open + cheap');
    ok(Q.wallBlockers(core, [[0, 4, 0, 0]], new Set([0])).flow.length === 0, 'a breached wall no longer blocks');
    say(`raider pathing: goes around a wall line (${a.steps} steps, detour ${a.maxDev.toFixed(0)} m), funnels through a gate, chews through a closed ring`);
    // flow field cost per compute stays cheap
    const t0 = Date.now(); for (let i = 0; i < 5; i++) Q.coreFlow(130, core, Q.wallBlockers(core, ring).flow); const per = (Date.now() - t0) / 5;
    ok(per < 120, `flow field recompute ${per.toFixed(1)} ms`);
  }

  // ============================================================ archive: generated-sector zones survive the rotation
  {
    const sec = generateSector('zarch', 1), gm = sec.moons[0];
    const zn = Z.ensureState(null, 'RUNA');
    const spec = Z.zoneSpec(gm, 'RUNA');
    Z.setZ(zn, gm.id, spec.zones[0].id, { s: 'own', d: { barr_wood: 1 }, up: 1 });
    Z.setZ(zn, gm.id, spec.zones[1].id, { s: 'inf', d: {}, up: 0 });
    Z.setZ(zn, 'hamsi', 'A', { s: 'own', d: {}, up: 0 });
    ok(Q.archiveMoon(zn, gm, 1) === true && Q.archiveMoon(zn, gm, 3) === false, 'archive once (idempotent afterwards)');
    ok(zn.arch[gm.id].q === 1, 'the archive keeps the sector it was first archived in');
    const back = JSON.parse(JSON.stringify(zn));
    ok(JSON.stringify(back) === JSON.stringify(zn), 'archive is JSON-safe (saves with the run)');
    ok(Object.keys(zn.arch[gm.id]).length <= 6 && JSON.stringify(zn.arch[gm.id]).length < 120, 'record is compact: ' + JSON.stringify(zn.arch[gm.id]));
    const stub = Q.archivedMoon(back, gm.id);
    ok(stub && stub.arch && Z.zonesEligible(stub), 'archived moon is eligible for zones (away)');
    ok(JSON.stringify(Z.zoneSpec(stub, 'RUNA').zones) === JSON.stringify(spec.zones), 'the zone spec of the stub equals the real moon\'s (same ids, threat, unlocks)');
    const st0 = Z.getZ(zn, gm.id, spec.zones[0].id);
    ok(JSON.stringify(Z.zoneIncome(stub, spec.zones[0], st0)) === JSON.stringify(Z.zoneIncome(gm, spec.zones[0], st0)), 'income of the stub equals the real moon\'s');
    // "rotation": the real moon is gone from the registry; only the archive remains
    const moonDef = (id) => MOONS[id] && !MOONS[id].stale ? MOONS[id] : Q.archivedMoon(back, id);
    const own = Z.listZones(back, (id) => Z.zonesEligible(moonDef(id))).filter((e) => e.active && e.st.s === 'own');
    ok(own.length === 2, 'both owned zones are still active after the sector rotated');
    const inc = Z.capIncome(own.flatMap((e) => Z.incomeRows(moonDef(e.m), Z.zoneSpec(moonDef(e.m), 'RUNA').zones.find((q) => q.id === e.z), e.st)), 400);
    ok(inc.credits > 0, 'and they still pay');
    ok(Z.pickAttacks(back, 2, new RNG(3), (id) => Z.zonesEligible(moonDef(id))).length >= 1, 'they can still be attacked (auto-resolve)');
    // prune: entries without zones go; the cap drops the oldest
    zn.arch.dead = { n: 'x', t: 1, b: 'hills', s: 1, ms: 1, q: 0 };
    ok(Q.pruneArchive(zn) === 1 && !zn.arch.dead && zn.arch[gm.id], 'unowned records are pruned');
    for (let i = 0; i < 30; i++) { zn.m['m' + i] = { A: { s: 'own', d: {}, up: 0 } }; zn.arch['m' + i] = { n: 'm', t: 1, b: 'hills', s: 1, ms: 1, q: i }; }
    Q.pruneArchive(zn, 24);
    ok(Object.keys(zn.arch).length === 24 && !zn.arch.m0 && zn.arch.m29, 'cap keeps the newest 24 records');
    say('archive: compact, JSON-safe, spec + income identical after rotation, prune + cap');
  }

  // ============================================================ miners, walls in the numbers, interior trap defs, income under the cap
  {
    const m = MOONS.hamsi, spec = Z.zoneSpec(m, 'RUNA'), z0 = spec.zones[0], z1 = spec.zones[1];
    ok(Z.minerCost(2) / Z.minerCost(1) > 1.8 && Z.minerCost(3) / Z.minerCost(1) > 3.4 && Z.minerUpCost(1) === Z.minerCost(2) - Z.minerCost(1), 'miner Mk costs follow homeworld2 (x1 / 1.9 / 3.6)');
    const base = Z.zoneIncome(m, z0, { up: 0 });
    ok(base.mn === null, 'no miner, no bonus');
    const p = [0, 1, 2].map((pu) => Z.zoneIncome(m, z0, { up: 0, mn: { l: 1, p: pu } }).mn.credits);
    ok(p[0] < p[1] && p[1] < p[2] && p[2] / p[1] > 1.5, 'node purity impure < normal < pure (x0.5 / 1 / 1.6): ' + p);
    const l = [1, 2, 3].map((lv) => Z.zoneIncome(m, z0, { up: 0, mn: { l: lv, p: 1 } }).mn);
    ok(l[0].credits < l[1].credits && l[1].credits < l[2].credits && l[2].mat === 2 && l[0].mat === 1 && l[0].matId === Z.matOf(m), 'higher Mk digs more and yields a biome material');
    ok([0, 1, 2].every((pu) => [0, 1, 2].includes(Z.minerPurity('RUNA', 'hamsi', 'A') + 0 * pu)) && Z.minerPurity('RUNA', 'hamsi', 'A') === Z.minerPurity('RUNA', 'hamsi', 'A'), 'purity is deterministic');
    const spread = new Set(); for (let i = 0; i < 40; i++) spread.add(Z.minerPurity('R' + i, 'hamsi', 'A'));
    ok(spread.size === 3, 'all purities occur');
    // the daily cap still binds: income with miners never exceeds it; below the cap, miners raise income
    const stA = { s: 'own', d: {}, up: 0 }, stM = { s: 'own', d: {}, up: 0, mn: { l: 2, p: 2 } };
    const rows = (st1, st2, mm) => [...Z.incomeRows(mm, z0, st1), ...Z.incomeRows(mm, z1, st2)];
    const noMn = Z.capIncome(rows(stA, stA, m), 1200), withMn = Z.capIncome(rows(stM, stM, m), 1200);
    ok(!noMn.capped && !withMn.capped && withMn.credits > noMn.credits && withMn.credits === withMn.gross, `under the cap miners raise income: ${noMn.credits} -> ${withMn.credits} (cap ${withMn.cap})`);
    const capped = Z.capIncome(rows(stM, stM, MOONS.cipura), 130);
    ok(capped.capped && capped.credits <= Z.dailyCap(130), `at a small quota the same miners are capped: ${capped.gross} gross -> ${capped.credits} (cap ${capped.cap})`);
    for (const q of [130, 400, 1200, 4000]) ok(Z.capIncome(rows(stM, stM, MOONS.cipura), q).credits <= Z.dailyCap(q), `miners never break the cap at quota ${q}`);
    const many = []; for (let i = 0; i < 6; i++) many.push(...Z.incomeRows(m, z0, stM));
    const mm = Z.capIncome(many, 4000), total = Object.values(mm.mats).reduce((a, b) => a + b, 0);
    ok(total <= Z.MINER.matCapMax && total > Z.ZN.matCapPerDay, `miners raise the material cap a little (${total} <= ${Z.MINER.matCapMax}, base ${Z.ZN.matCapPerDay})`);
    ok(mm.mats[Z.matOf(m)] > 0, 'the material is the biome material');
    ok(Z.upkeepOf(stM) === Z.minerUpkeep(stM.mn) && Z.minerUpkeep(stM.mn) > Z.minerUpkeep({ l: 1 }), 'miner upkeep grows with the Mk');
    // an extractor pays back within a sane time (not a free lunch, not useless) when the cap is not binding
    const net = Z.zoneIncome(m, z0, stM).mn.credits - Z.minerUpkeep(stM.mn), payback = (Z.minerCost(2)) / Math.max(0.1, net);
    ok(net > 0 && payback > 5 && payback < 60, `miner Mk2 net ${net}/day, pays back in ${payback.toFixed(0)} days`);
    // walls in the numbers
    const wst = { d: {}, w: [[0, 4, 0, 0], [1, 8, 0, 0]] };
    ok(Z.wallPower(wst) === W.power[0] + W.power[1] && Z.wallCount(wst) === 2 && Z.wallUpkeep(wst) === W.upkeepGate, 'wall power / count / upkeep');
    ok(Z.wallPower({ w: Array.from({ length: 200 }, () => [0, 0, 0, 0]) }) === W.powerMax, 'wall power is capped');
    ok(Z.defencePower(wst) > Z.defencePower({ d: {} }) && Z.wallCap({ up: 2 }) === W.baseCap + 2 * W.capPerUp, 'walls add defence power; cap grows with the zone level');
    // interior trap defs
    ok(Z.TRAP_DEF_IDS.length === 5 && Z.TRAP_DEF_IDS.every((k) => Z.DEFS[k].in && Z.DEFS[k].trap), 'five interior trap defences');
    for (const k of Z.TRAP_DEF_IDS) ok(Z.DEFS[k].cost > 30 && Z.DEFS[k].power > 5 && Z.DEFS[k].upkeep >= 2, `${k}: priced, powerful, has upkeep`);
    const own = { s: 'own', d: {}, up: 0 };
    ok(Z.canBuild({ def: 't_spikes', st: own, dist: 3, quotaIndex: 0, credits: 500, interior: true }).ok, 'a trap can be built in a wing');
    ok(!Z.canBuild({ def: 't_spikes', st: own, dist: 3, quotaIndex: 0, credits: 500, interior: false }).ok, 'not outdoors');
    ok(!Z.canBuild({ def: 'turret1', st: own, dist: 3, quotaIndex: 0, credits: 500, interior: true }).ok, 'no turret in a wing');
    ok(!Z.canBuild({ def: 't_laser', st: own, dist: 3, quotaIndex: 0, credits: 500, interior: true }).ok && Z.canBuild({ def: 't_laser', st: own, dist: 3, quotaIndex: 1, credits: 500, interior: true }).ok, 'laser grid unlocks with the quota');
    ok(Z.DEF_IDS.every((k) => !Z.DEFS[k].in), 'the outdoor list has no traps');
    // upkeep -> ammo fraction
    const r = Z.payUpkeep(20, [{ key: 'a', st: { d: { turret1: 2, barr_wood: 1 } } }, { key: 'b', st: { d: { tesla: 1 } } }, { key: 'c', st: { d: {} } }]);
    ok(r.frac.a === 1 && r.frac.c === 1 && r.frac.b > 0 && r.frac.b <= 0.5 && r.paid === 14 && r.left === 6, 'upkeep: paid zones full ammo, unpaid zone a partial load, funds unchanged: ' + JSON.stringify(r.frac));
    say('miners (purity, Mk, cap, materials), walls in the numbers, interior trap defences, upkeep ammo fractions');
  }
}
