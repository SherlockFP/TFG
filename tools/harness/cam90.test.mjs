// CAM90 tests (pure node, wave 8 night, docs/wave8/cam90.md): node tools/harness/cam90.test.mjs
//  1. the path drone: deterministic, on the ship -> entrance walk, dry-spot predicate, readable lit disc on the direct line + an always-dark flank
//  2. crdirector: ON AIR heat pulls a calm short (fair-start floors, once per calm)
//  3. module: every landing (day 1 too) gets it, expedition maps never do; the indoor tutorial camera teaches "cut the feed"; strings
import * as THREE from 'three';
import * as C from '../../src/game/feedcams2_core.js';
import * as D from '../../src/game/crdirector_core.js';
import * as K from '../../src/game/feedcams_core.js';
import { installFeedcams2 } from '../../src/game/feedcams2.js';
import { tIn } from '../../src/core/i18n.js';
import '../../src/game/crdirector_i18n.js';

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// 1. plan geometry over many seeds / entrance distances (42-75 m walks)
let litDirect = 0, n = 0;
for (let seed = 1; seed <= 40; seed++) {
  const len = 42 + (seed * 7) % 34, ang = seed * 0.83, e = { x: Math.cos(ang) * len, z: Math.sin(ang) * len };
  const a = C.planPathDrone({ entrance: e, seed, day: 1 }, 3), b = C.planPathDrone({ entrance: e, seed, day: 1 }, 3);
  ok(a.length === 1 && JSON.stringify(a) === JSON.stringify(b) && a[0].i === 3 && a[0].day, 'deterministic single path drone #' + seed);
  const d = a[0], f = (d.cx * e.x + d.cz * e.z) / (len * len);
  ok(f > 0.3 && f < 0.7 && Math.hypot(d.cx, d.cz) > 14 && Math.hypot(d.cx - e.x, d.cz - e.z) > 14, `centre sits mid-path (seed ${seed}, f ${f.toFixed(2)})`);
  let lit = false, dark = true; const off = C.blindOffset(d);
  ok(off >= 1 && off <= 14, 'blind flank is close enough to be obvious: ' + off);
  for (let t = 0; t < 130; t += 0.5) {
    const g = C.dronePos(d, t);
    for (let k = 0; k <= 20; k++) {
      const p = C.pathPoint(d, e, k / 20, 0), q = C.pathPoint(d, e, k / 20, off);
      if (C.droneSees(g, p.x, p.z, false).ok) lit = true;
      if (C.droneSees(g, q.x, q.z, false).ok) dark = false;
    }
  }
  n++; if (lit) litDirect++;
  ok(dark, 'flank route is never lit (seed ' + seed + ')');
}
ok(litDirect / n >= 0.9, `the direct line is lit for part of the lap (${litDirect}/${n})`);
const dry = (x, z) => x * 40 - z * 60 > 0;   // only one flank of the path is dry (the other one is a pond / rocks)
let dryOk = 0;
for (let seed = 1; seed <= 10; seed++) { const q = C.planPathDrone({ entrance: { x: 60, z: 40 }, seed, day: 2, ok: dry }, 0)[0]; if (dry(q.cx, q.cz)) dryOk++; }
ok(dryOk === 10, 'the ok predicate steers the drone off water / rocks (' + dryOk + '/10)');
ok(C.planPathDrone({ entrance: { x: 3, z: 1 }, seed: 1, day: 1 }).length === 0 && C.planPathDrone({}).length === 0, 'no entrance / entrance at the ship: no drone');

// 2. heat pulls the calm (host-side rule)
const st = () => ({ phase: 'calm', t: 0, len: 70, first: false, pulled: false });
let s = st(); s.t = 10;
ok(!D.heatPull(s, 90) && s.len === 70, 'not before minT');
s.t = 40; ok(!D.heatPull(s, 20), 'cold stream: no pull');
ok(D.heatPull(s, 60) && s.len === 40 + D.PULL.left && s.pulled, 'hot stream cuts the calm to PULL.left s');
ok(!D.heatPull(s, 90), 'once per calm');
s = st(); s.first = true; s.t = 60; ok(!D.heatPull(s, 100), 'the first calm keeps its safe window');
s.t = 80; s.len = 100; ok(D.heatPull(s, 100), 'first calm may be pulled late');
s = { phase: 'build', t: 30, len: 80, pulled: false }; ok(!D.heatPull(s, 100), 'only calms');
s = st(); s.t = 60; s.len = 66; ok(!D.heatPull(s, 100), 'a calm about to end is left alone');
s = st(); s.t = 30; D.heatPull(s, 80); s.t = s.len; D.step(s, 0.1, D.ctxOf({}), () => 0.5, {});
ok(s.phase === 'build' && !s.pulled, 'the pulled flag resets with the phase');

// 3. module: day 1 gets it, an expedition map does not
function mk(outdoor, run = {}) {
  const hs = new Map(), mods = { on: (ev, fn) => { (hs.get(ev) || hs.set(ev, new Set()).get(ev)).add(fn); return () => hs.get(ev)?.delete(fn); }, emit: (ev, ...a) => { for (const f of [...(hs.get(ev) || [])]) f(...a); } };
  const game = { mods, isHost: false, time: 5, selfId: 'me', run: { phase: 'moon', moon: 'hamsi', day: 1, quotaIndex: 0, seed: 7, ...run }, net: { broadcast() {}, on() {}, off() {} }, broadcastRun() {}, aiPlayers: () => [], world: { outdoor } };
  return { game, mods, api: installFeedcams2(game) };
}
const T = { heightAt: () => 2, floodY: -5 };
{
  const { game, mods, api } = mk({ plan: { entrance: { x: 50, z: 20 } }, terrain: T, group: new THREE.Group() });
  mods.emit('update', 0.1, game);
  const ds = api.drones();
  ok(ds.length === 1 && ds[0].day, 'day 1 (no night drones yet) still gets the outdoor path drone');
  api.dispose();
}
{
  const { game, mods, api } = mk({ plan: { entrance: { x: 50, z: 20 } }, terrain: T, group: new THREE.Group(), ex: { kind: 'dune' } });
  mods.emit('update', 0.1, game);
  ok(api.drones().length === 0, 'expedition maps never get the path drone');
  api.dispose();
}
ok(K.TUT_CUT > 0 && K.TUT_CUT < K.TUT_PAY, 'indoor tutorial camera pays a small cut / spray bonus');
for (const k of ["Red light = you're LIVE. Heat brings them.", 'HEAT — the stream is calling them in.', 'Same red light indoors. This time cut the feed: the junction box [E] on the wall, or spray the lens.', 'Feed cut. Nobody saw who: +▮{n}']) {
  ok(tIn('tr', k) !== k && tIn('ru', k) !== k, 'TR/RU missing: ' + k.slice(0, 40));
}

console.log(`cam90: ${fails.length ? 'FAIL' : 'ok'}`);
for (const f of fails) console.log('  x ' + f);
process.exit(fails.length ? 1 : 0);
