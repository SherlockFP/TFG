// node tools/harness/firstsight.test.mjs - wave 8 morning task 2: staged first sighting (firstsight_core pure maths + a stub-game host/client sim:
// placement 12-20 m in the view cone, stare -> leave -> removed, AI frozen the whole beat = no damage, one beat per landing, run memory, peak / chase veto).
import fs from 'fs';
import * as THREE from 'three';
import * as F from '../../src/game/firstsight_core.js';
import * as K from '../../src/game/crdirector_core.js';
import { starePose, STARE } from '../../src/game/creature_read.js';
import { CREATURES } from '../../src/game/creatures.js';
import { installFirstSight } from '../../src/game/firstsight.js';
let bad = 0, n = 0;
const chk = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// ---- pure: which creature, where, how long, how much zoom
const ok = () => true;
chk(F.pickType({ all: ['lm_lootmimic', 'lm_keeper', 'spider'] }, [], ok, ok) === 'lm_keeper', 'disguise skipped, pool order kept');
chk(F.pickType({ all: ['lm_keeper', 'spider'] }, ['lm_keeper'], ok, ok) === 'spider', 'met creature skipped');
chk(F.pickType({ all: ['lm_witch', 'spider'] }, [], (id) => id === 'spider', ok) === 'spider', 'zone without a ready crewmate skipped');
chk(F.poolDone({ all: ['lm_masked', 'spider'] }, ['spider'], ok) && !F.poolDone({ all: ['spider'] }, [], ok), 'poolDone');
const eye = { x: 0, y: 1.6, z: 0 }, look = { x: 0, z: -1 };
const corridor = (len) => (x, z) => (Math.abs(x) < 1 && z <= 1 && z >= -len ? 0 : null);
const s1 = F.findSpot({ eye, look, ground: corridor(16), los: ok, rnd: () => 0.5 });
chk(s1 && s1.d >= F.FS.dMin && s1.d <= F.FS.dMax && s1.wall && Math.abs(s1.a) <= 18, 'corridor: end of the corridor, 12-20 m, in the cone ' + JSON.stringify(s1));
chk(F.findSpot({ eye, look, ground: corridor(9), los: ok, rnd: () => 0 }) === null, 'short room: no spot');
const s2 = F.findSpot({ eye, look, ground: corridor(30), los: (x, y, z) => z > -14, rnd: () => 0 });
chk(s2 && s2.d >= 12 && s2.d < 14, 'blocked view: steps back toward the crewmate');
const s4 = F.findSpot({ eye, look, ground: corridor(30), los: ok, rnd: () => 0, lit: (x, z) => (Math.abs(z + 12) < 1 ? 1 : 0) });
chk(s4 && Math.abs(s4.d - 12) < 0.01, 'prefers the spot under a lamp');
const ridge = (x, z) => Math.max(0, (-z - 10) * 0.3);
const s3 = F.findSpot({ eye, look, ground: ridge, los: ok, rnd: () => 0, out: true, feetY: 0 });
chk(s3 && s3.y > 0.5 && s3.d >= 12, 'outdoors: prefers the ridge');
chk(F.beatPhase(0.2, 3) === 'in' && F.beatPhase(2, 3) === 'stare' && F.beatPhase(4, 3) === 'go', 'timeline');
chk(F.holdFor(0) === 2 && F.holdFor(1) === 4, 'hold 2-4 s');
const z13 = F.zoomFor(13.5, 2.25, 1, 72, 16 / 9), z15 = F.zoomFor(15, 2.25, 1, 72, 16 / 9);
chk(F.coverOf(13.5, 2.25, 1, 72, 16 / 9) < 0.01 && F.coverOf(13.5, 2.25, 1, 72, 16 / 9, z13) >= 0.03 && F.coverOf(15, 2.25, 1, 72, 16 / 9, z15) >= 0.028, `autofocus: >= 3 % of the frame at 12-15 m (z ${z13.toFixed(2)} / ${z15.toFixed(2)})`);
chk(F.zoomFor(13, 2, 1, 72, 16 / 9, 0.4) <= 0.55 / 0.4 + 1e-9 && F.zoomFor(13, 2, 1, 72, 16 / 9, 0, 0.05, 1) === 1, 'autofocus keeps the body in frame; zoomMax 1 = off');
const p0 = starePose(0), p1 = starePose(3);
chk(p0.pitch === 0 && Math.abs(p1.pitch - STARE.lean) < 1e-9 && p1.flare > 0, 'stare pose eases in');
chk(!K.isHunting('stare') && K.isAwake('stare'), 'stare is awake, never a hunt (no tracking cue)');
chk(K.gateOk('firstsight', 'calm', { q: 0 }, 0, 1.5) && !K.gateOk('firstsight', 'calm', { q: 0 }, 2.5, 1.5), 'the one budget gate: calm admits one body, not on top of others');

// ---- stub game: host + client in one peer, a 2 m wide corridor running 16 m north (-z) with a side room east at z -15 (out of view)
function stub(o = {}) {
  const hs = new Map(), views = new Map(), msgs = [], net = { h: null, broadcast(t, d) { msgs.push([t, d]); if (t === 'fsight') this.h?.(d, 'A'); }, on(e, f) { this.h = f; }, off() { this.h = null; }, hostId: 'A' };
  const hurt = [], cues = [], taught = [];
  const walk = (x, z) => (Math.abs(x) < 1 && z <= 1 && z >= -16) || (x >= 1 && x < 6 && z <= -13 && z >= -16);
  const nav = { y: 0, walkableAt: walk, randomWalkable: (r) => ({ x: 3 + r() * 2, z: -14.5 }), findPath: (sx, sz, tx, tz) => [{ x: 0, z: -14.5 }, { x: tx, z: tz }] };
  const pl = { id: 'A', pos: new THREE.Vector3(0, 0, 0), eye: new THREE.Vector3(0, 1.6, 0), look: new THREE.Vector3(0, 0, -1), zone: 'in', dead: false, inShip: false };
  const cam = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 400); cam.position.copy(pl.eye); cam.lookAt(0, 1.6, -10); cam.updateMatrixWorld();
  const H = new Map();
  const g = {
    isHost: true, selfId: 'A', hostData: {}, config: {}, settings: {}, net, camera: cam, viewModel: { root: new THREE.Group() },
    run: { runId: 't1', day: 1, moon: 'hamsi', phase: 'moon', quotaIndex: 0 },
    player: { pos: pl.pos, dead: false, inShip: false },
    mods: { on(e, f) { H.set(e, f); return () => H.delete(e); }, emit() {} },
    world: { facility: { nav, emitters: [] } },
    physics: { lineOfSight: (a, b) => !(b.x >= 1.2 && b.z < -12.5) },   // the side room is round a corner
    aiPlayers: () => [pl], aiPlayerById: (id) => (id === 'A' ? pl : null),
    crdirector: { pool: () => ({ all: ['lm_lootmimic', 'spider'], ids: ['lm_lootmimic', 'spider'] }), phase: () => o.phase || 'calm', peakNow: () => o.phase === 'peak', canSpawn: () => true,
      stage() {}, teach: (ty) => taught.push(ty), cue: (s) => cues.push(s[0]), dip() {} },
    creatures: { host: hs, views, nextId: 1,
      hostSpawn(type, pos, op) { const c = { id: op.id || 'c' + this.nextId++, type, def: CREATURES[type], pos: pos.clone(), yaw: op.yaw, state: op.state, stunT: 0, hp: 50, maxHp: 50, dead: false, zone: op.zone, data: { ...op.data }, setState(s) { this.state = s; } };
        hs.set(c.id, c); views.set(c.id, { id: c.id, pos: c.pos, height: 1, radius: 0.9, def: c.def }); return c; },
      hostRemove(id) { hs.delete(id); views.delete(id); },
      goTo(c, x, z) { c.path = [{ x, z }]; c.pathIdx = 0; },
      follow(c, dt, sp) { const w = c.path?.[c.pathIdx]; if (!w) return true; const dx = w.x - c.pos.x, dz = w.z - c.pos.z, d = Math.hypot(dx, dz); if (d < 0.35) { c.pathIdx++; return c.pathIdx >= c.path.length; } const s = Math.min(d, sp * dt); c.pos.x += dx / d * s; c.pos.z += dz / d * s; return false; } },
  };
  if (o.hunter) hs.set('h1', { id: 'h1', type: 'crawler', def: CREATURES.crawler, pos: new THREE.Vector3(0, 0, -30), state: 'chase', dead: false, zone: 'in', data: {} });
  const api = installFirstSight(g);
  // CreatureManager.hostUpdate in miniature: a stunned creature skips its behaviour; the behaviour here bites anyone within 3 m
  const tick = (dt) => { for (const c of hs.values()) { if (c.stunT > 0) { c.stunT -= dt; continue; } if (c.id !== 'h1' && pl.pos.distanceTo(c.pos) < 3) hurt.push(c.id); } H.get('update')?.(dt, g); };
  return { g, api, pl, msgs, hurt, cues, taught, tick, hs };
}
let T = stub(), maxZoom = 1, spawnD = 0, spawnA = 99, phases = new Set(), frozen = true;
for (let i = 0; i < 300; i++) {
  if (i === 120) T.pl.pos.z = -3;   // the crewmate walks 3 m toward it mid-stare: still no bite (and not inside the 5 m abort)
  T.tick(0.05);
  const b = T.api.beat(); if (b) phases.add(b.phase);
  for (const c of T.hs.values()) if (c.data.fs) { frozen &&= c.stunT > 100; if (!spawnD) { spawnD = Math.hypot(c.pos.x, c.pos.z); spawnA = Math.abs(Math.atan2(c.pos.x, -c.pos.z)) * 180 / Math.PI; } }
  maxZoom = Math.max(maxZoom, T.api.zoom());
}
const ins = T.msgs.filter(([t, d]) => t === 'fsight' && d.k === 'in'), outs = T.msgs.filter(([t, d]) => t === 'fsight' && d.k === 'out');
chk(ins.length === 1 && ins[0][1].ty === 'spider', 'one beat, the pool creature (disguise skipped) ' + JSON.stringify(ins.map((m) => m[1].ty)));
chk(spawnD >= 12 && spawnD <= 20 && spawnA <= 18.5, `placed 12-20 m in the view cone (${spawnD.toFixed(1)} m, ${spawnA.toFixed(1)} deg)`);
chk(phases.has('in') && phases.has('stare') && phases.has('go'), 'in -> stare -> go ' + [...phases]);
chk(outs.length === 1 && outs[0][1].why === 'left' && ![...T.hs.values()].some((c) => c.data.fs), 'walks off round the corner and is removed ' + JSON.stringify(outs.map((m) => m[1].why)));
chk(frozen && T.hurt.length === 0, 'AI frozen for the whole beat: no damage');
chk(T.cues.length >= 1 && T.taught.includes('spider'), 'tell cue at the stare, rule caption follows');
chk(maxZoom > 1.5 && T.api.zoom() === 1 && T.g.camera.zoom === 1 && T.g.viewModel.root.scale.x === 1, `autofocus zooms (max ${maxZoom.toFixed(2)}) and restores the camera + hands`);
chk(JSON.stringify(T.g.run.fsSeen) === '["spider"]', 'run remembers the creature');
T.g.run.day = 2; for (let i = 0; i < 200; i++) T.tick(0.05);
chk(T.msgs.filter(([t, d]) => t === 'fsight' && d.k === 'in').length === 1, 'a met creature gets no second beat on a later landing');
T.api.dispose();
T = stub({ phase: 'peak' }); for (let i = 0; i < 200; i++) T.tick(0.05);
chk(!T.msgs.some(([t]) => t === 'fsight'), 'never at a peak'); T.api.dispose();
T = stub({ hunter: true }); for (let i = 0; i < 200; i++) T.tick(0.05);
chk(!T.msgs.some(([t]) => t === 'fsight'), 'never during a chase'); T.api.dispose();
T = stub(); for (let i = 0; i < 130; i++) T.tick(0.05);
const busy = T.api.debug(); T.pl.pos.z = -11; for (let i = 0; i < 20; i++) T.tick(0.05);
chk(busy.done && T.msgs.some(([t, d]) => t === 'fsight' && d.k === 'out' && d.why === 'abort') && T.hurt.length === 0, 'walking up to it ends the beat, no bite'); T.api.dispose();

// ---- wiring
const gs = rd('src/game/game.js'), fsrc = rd('src/game/firstsight.js') + rd('src/game/firstsight_core.js');
chk(gs.indexOf("useModule('firstSight', installFirstSight)") > gs.indexOf("useModule('lcmonsters'"), 'installed after crdirector + lcmonsters');
chk(!/Math\.random|new THREE\.\w*Light|\.visible\s*=/.test(fsrc), 'no Math.random, no lights, no visibility toggles');
chk(/canSpawn\(type, pos, 'firstsight'\)/.test(fsrc) && /stage\(id\)/.test(rd('src/game/crdirector.js')), 'one budget gate + director hooks');
console.log(`firstsight: ${n - bad}/${n} ok`);
process.exit(bad ? 1 : 0);
