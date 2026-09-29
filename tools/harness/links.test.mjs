// Wave 7 "links" node tests: voyage patron tags, story mission shift, hub zone board, zones2 wall ghost helpers, algo2 ghost clamp, roledays minimap.
// Run: node tools/harness/links.test.mjs
import * as V from '../../src/game/voyage_core.js';
import * as C from '../../src/game/story_core.js';
import * as HC from '../../src/net/hub_core.js';
import * as Q from '../../src/game/zones2_core.js';
import * as Z from '../../src/game/zones_core.js';
import * as A from '../../src/game/algo2_core.js';
import * as R from '../../src/game/roledays_core.js';
import { RNG } from '../../src/core/rng.js';

let checks = 0, fails = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } };

// ---- 1. voyage patrons
ok(V.MISSION_IDS.every((id) => ['company', 'algorithm'].includes(V.missionPatron(id))), 'every mission type has a patron');
ok(V.MISSION_IDS.some((id) => V.missionPatron(id) === 'company') && V.MISSION_IDS.some((id) => V.missionPatron(id) === 'algorithm'), 'both patrons appear');
const board = V.boardFor('RUN1', 3, 1, [{ id: 'a', tier: 1 }, { id: 'b', tier: 2 }, { id: 'c', tier: 3 }]);
ok(board.length === 4 && board.every((o) => o.patron === V.missionPatron(o.type)), 'board offers carry the patron');
ok(V.newMission(board[0], 3).patron === board[0].patron, 'accepted mission keeps the patron');
{ const s = C.emptyState('k'); const m = C.applyMission(s, 'company'); ok(s.a < 0 && s.done.company === 1 && m.a1 === s.a, 'company mission: meter to Company, done++');
  const s2 = C.emptyState('k'); C.applyMission(s2, 'algorithm'); ok(s2.a === C.AL.missionShift.algorithm && s2.done.algorithm === 1, 'algorithm mission shift');
  ok(C.applyMission(C.emptyState('k'), 'nobody') === null, 'unknown patron ignored');
  ok(C.AL.missionShift.company < C.AL.contractShift.company && C.AL.missionShift.algorithm < C.AL.contractShift.algorithm, 'missions weigh less than contracts'); }

// ---- 3. hub zone board
{ const b = HC.validateBeacon({ id: 'abcd1234', n: 'Alice', zs: [3, 120, 5] });
  ok(b && b.zs.join() === '3,120,5', 'zs accepted');
  ok(!HC.validateBeacon({ id: 'abcd1234', n: 'Alice', zs: [0, 50, 0] }).zs, 'no zones -> no zs');
  ok(!HC.validateBeacon({ id: 'abcd1234', n: 'Alice', zs: [1, 2] }).zs && !HC.validateBeacon({ id: 'abcd1234', n: 'Alice', zs: 'x' }).zs, 'bad zs dropped');
  const big = HC.validateBeacon({ id: 'abcd1234', n: 'Alice', zs: [1e12, -5, 'q'] }); ok(!big.zs || big.zs.every((v) => v >= 0 && v <= 99999), 'zs clamped');
  const rows = HC.zoneRank([{ n: 'B', zs: [2, 50, 1] }, { n: 'A', zs: [2, 90, 0] }, { n: 'C', zs: [5, 10, 0] }, { n: 'D' }]);
  ok(rows.map((r) => r.n).join('') === 'CAB', 'ranked by zones, income, defences: ' + rows.map((r) => r.n)); }

// ---- 4. zones2 wall ghost
{ const core = { x: 40, z: -22 }, flat = { heightAt: () => 0 }, slope = { heightAt: (x) => 10 - x * 0.5 };
  const hit = Q.aimGround(flat, { x: 0, y: 1.7, z: 0 }, { x: 0.6, y: -0.5, z: 0.62 }, 12);
  ok(hit && Math.abs(hit.y) < 1e-9 && hit.z > 2 && hit.x > 2, 'aim ray meets flat ground');
  ok(Q.aimGround(flat, { x: 0, y: 1.7, z: 0 }, { x: 1, y: 0.2, z: 0 }, 12) === null, 'looking up: no aim');
  ok(Q.aimGround(slope, { x: 0, y: 1.7, z: 0 }, { x: 1, y: 0, z: 0 }, 40) !== null, 'ray meets a slope');
  for (const gate of [0, 1]) for (const rot of [0, 1]) for (const [ax, az] of [[43.2, -19.9], [35.1, -25.4], [40, -22.7]]) {
    const p = Q.ghostPiece(core, { x: ax, z: az }, rot, gate), q = Q.ghostRequest(core, p), sn = Q.snapPiece(core, q.wx, q.wz, Math.abs(Math.sin(q.fy)) > Math.abs(Math.cos(q.fy)) ? 1 : 0);
    ok(p[0] === gate && sn.gx === p[1] && sn.gz === p[2] && sn.r === p[3], `ghost -> request -> host snap round trip (${gate},${rot},${ax},${az})`);
  }
  // the request piece validates like the ghost did
  const ctx = { core, zoneR: Z.ZN.zoneR, ter: null, cores: [], obstacles: [], circles: [], people: [], existing: [], cap: 5 };
  const p = Q.ghostPiece(core, { x: core.x + 6, z: core.z }, 1, 0); ok(Q.validateWall(ctx, p).ok, 'ghost piece 6 m from the core is valid');
  ok(!Q.validateWall(ctx, Q.ghostPiece(core, { x: core.x + 0.4, z: core.z }, 0, 0)).ok, 'ghost on the core is refused'); }

// ---- 5. algo2 ghost clamp: nav with a wall column at x in [10, 12)
{ const nav = { res: 1, ox: 0, oz: 0, w: 40, h: 40, toGrid: (x, z) => [Math.floor(x), Math.floor(z)], toWorld: (gx, gz) => ({ x: gx + 0.5, z: gz + 0.5 }),
    isW: (gx, gz) => gx >= 0 && gz >= 0 && gx < 40 && gz < 40 && !(gx >= 10 && gx < 12 && gz !== 30), // a wall with a gap at z 30
    walkableAt(x, z) { const [a, b] = this.toGrid(x, z); return this.isW(a, b); },
    nearestWalkable(gx, gz, r = 3) { if (this.isW(gx, gz)) return [gx, gz]; for (let k = 1; k <= r; k++) for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx++) if ((Math.abs(dx) === k || Math.abs(dz) === k) && this.isW(gx + dx, gz + dz)) return [gx + dx, gz + dz]; return null; } };
  const anchor = [20, 0, 5.5];
  // recorded: walks straight through the wall from x 5 to x 20 at z 5.5 (relative samples, last = anchor)
  const tr = []; for (let i = 0; i <= 30; i++) tr.push([-15 + i * 0.5 - 0, 0, 0, 0]);
  const out = A.clampTrack(tr, anchor, nav);
  ok(out.length === tr.length && out[out.length - 1][0] === 0, 'same length, anchor untouched');
  let bad = 0; for (const s of out) if (!nav.walkableAt(anchor[0] + s[0], anchor[2] + s[2])) bad++;
  ok(bad === 0, 'no clamped sample stands in a wall: ' + bad);
  let cross = 0; for (let i = 1; i < out.length; i++) { const a = out[i - 1], b = out[i]; for (let k = 1; k < 8; k++) { const f = k / 8; if (!nav.walkableAt(anchor[0] + a[0] + (b[0] - a[0]) * f, anchor[2] + a[2] + (b[2] - a[2]) * f)) cross++; } }
  ok(cross === 0, 'no step crosses a wall: ' + cross);
  ok(out[0][0] >= -8.6, 'the part behind the wall holds at the wall instead of passing it: ' + out[0][0]);
  const free = []; for (let i = 0; i <= 10; i++) free.push([-i * 0.4 + 4, 0, 0, 0.5]);
  const o2 = A.clampTrack(free, anchor, nav); ok(o2.every((s, i) => Math.abs(s[0] - free[i][0]) < 1e-9 && Math.abs(s[2] - free[i][2]) < 1e-9 && s[3] === free[i][3]), 'a clear track is unchanged');
  ok(A.clampTrack(tr, anchor, null) === tr, 'no nav: unchanged'); }

// ---- 6. roledays minimap
{ const nav = { w: 300, h: 200, res: 1, ox: -50, oz: -30, walk: new Uint8Array(300 * 200) };
  for (let z = 50; z < 60; z++) for (let x = 100; x < 140; x++) nav.walk[z * 300 + x] = 1;
  const B = R.bakeGrid(nav, 128);
  ok(B.f === 3 && B.w === 100 && B.h === 67 && B.data.length === B.w * B.h, 'bake downsamples to <= 128: ' + [B.f, B.w, B.h]);
  ok(B.data[Math.floor(55 / 3) * B.w + Math.floor(120 / 3)] === 1 && B.data[0] === 0, 'walkable pixel set, empty pixel clear');
  const p = R.mapPoint(B, nav, 70, 25); ok(p.inside && Math.abs(p.px - 40) < 0.01 && Math.abs(p.py - 18.33) < 0.05, 'world -> pixel');
  const q = R.mapPoint(B, nav, -500, 900); ok(!q.inside && q.px === 0 && q.py === B.h - 1, 'off-map point clamps to the border');
  ok(R.bakeGrid(null) === null && R.bakeGrid({ w: 0, h: 0, walk: new Uint8Array(0) }) === null, 'bad nav -> null');
  const nav1 = { holder: 'p1', card: 'navigator' };
  ok(R.showMinimap(nav1, 'p1') === true && R.showMinimap(nav1, 'p2') === false, 'only the navigator sees the minimap');
  for (const id of Object.keys(R.CARDS)) if (id !== 'navigator') ok(R.showMinimap({ card: id, holder: 'p1', all: false }, 'p1') === false, `card ${id} has no minimap`);
  ok(R.showMinimap(null, 'p1') === false, 'no card, no minimap'); }

void RNG;
console.log(`${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
