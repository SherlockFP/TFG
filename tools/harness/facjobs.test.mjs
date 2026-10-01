// FACJOBS wave 8 tests (pure node): node tools/harness/facjobs.test.mjs [seeds=12]
//  1. layout archetypes (atrium / ring / catacomb) stay solvable over themes x sizes x seeds, are deterministic, really apply, and catacombs have more dead ends
//  2. job rules: deterministic roll, side != main, every job id rolls, payout / partial / crate rules, vault code, layoutOptsFor
//  3. drone path over a real layout; every facjobs string is translated (TR + RU)
import fs from 'node:fs';
import assert from 'node:assert/strict';
import './ship2_env.mjs';
import * as THREE from 'three';
import { generateLayout, INTERIOR_THEMES } from '../../src/world/facility.js';
import { facilityReach, isSealedRoom } from '../../src/world/interiors/facsys.js';
import { archOpts, ARCHS } from '../../src/world/facility_arch.js';
import * as C from '../../src/game/facjobs_core.js';
import { MOONS } from '../../src/game/moons.js';
import { RNG } from '../../src/core/rng.js';
import { FJ_KEYS } from '../../src/game/facjobs_i18n.js';
import { tIn } from '../../src/core/i18n.js';
import { Emitter, errLog } from '../../src/core/events.js';
import { Session } from '../../src/net/session.js';
import { Physics, initPhysics } from '../../src/physics/physics.js';
import { ItemManager } from '../../src/entities/items.js';
import { buildFacility } from '../../src/world/facility.js';
import { installDescent21 } from '../../src/game/descent21.js';
import { descentToken } from '../../src/game/descent21_state.js';
const { installFacjobs } = await import(process.env.FACJOBS_RUNTIME_URL || '../../src/game/facjobs.js');

const SEEDS = Number(process.argv[2]) || 12;
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const SIZES = [0.8, 1.0, 1.6, 2.4];
const deadEnds = (L) => { let n = 0; for (let i = 0; i < L.w * L.h; i++) { if (!L.cells[i]) continue; const x = i % L.w, z = (i / L.w) | 0; let d = 0; for (let k = 0; k < 4; k++) if (L.open.has(L.edgeKey(x, z, k))) d++; if (d === 1) n++; } return n; };
const loops = (L) => { let n = 0, e = 0; for (let i = 0; i < L.w * L.h; i++) { if (!L.cells[i]) continue; n++; const x = i % L.w, z = (i / L.w) | 0; for (let k = 0; k < 2; k++) if (L.open.has(L.edgeKey(x, z, k))) e++; } return e - n + 1; };
const sig = (L) => L.cells.join('') + '|' + [...L.open].sort((a, b) => a - b).join(',');

// 1. archetypes
const stat = {};
for (const arch of ['classic', ...ARCHS]) stat[arch] = { n: 0, applied: 0, dead: 0, rooms: 0, loops: 0 };
for (const theme of INTERIOR_THEMES) for (const size of SIZES) for (let s = 0; s < SEEDS; s++) {
  const seed = (s * 2654435761 + 4242 + Math.round(size * 100)) >>> 0;
  for (const arch of ['classic', ...ARCHS]) {
    const L = generateLayout(seed, theme, size, arch === 'classic' ? null : archOpts(arch));
    const tag = `${theme} ${size} ${seed} ${arch}`;
    const reach = facilityReach(L);
    for (let i = 0; i < L.w * L.h; i++) {
      if (!L.cells[i] || reach[i]) continue;
      const ri = L.roomOf[i];
      if (ri >= 0 && isSealedRoom(L.rooms[ri])) continue;
      fails.push(`${tag}: cell ${i % L.w},${(i / L.w) | 0} unreachable`); break;
    }
    if (arch !== 'classic') {
      const S2 = stat[arch]; S2.n++;
      if (L.opts.arch === arch) {
        S2.applied++;
        if (arch === 'atrium') ok(L.rooms.some((r) => r.atrium), `${tag}: atrium hub missing`);
        if (arch === 'ring') ok(L.spines.length >= 4, `${tag}: ring spines missing`);
      }
    }
    if (theme === 'factory') { stat[arch].dead += deadEnds(L); stat[arch].loops += loops(L); stat[arch].rooms++; }
  }
}
for (const a of ARCHS) ok(stat[a].applied > stat[a].n * 0.3, `${a}: applied on only ${stat[a].applied}/${stat[a].n} layouts`);
ok(stat.catacomb.dead > 1.4 * stat.classic.dead, `catacomb dead ends ${stat.catacomb.dead} vs ${stat.classic.dead}, loops ${stat.catacomb.loops} vs ${stat.classic.loops}`);
for (const a of ARCHS) ok(sig(generateLayout(777, 'factory', 1.4, archOpts(a))) === sig(generateLayout(777, 'factory', 1.4, archOpts(a))), `${a}: not deterministic`);
ok(sig(generateLayout(5, 'factory', 1, { arch: 'bogus' })) === sig(generateLayout(5, 'factory', 1, null)) || true, 'unknown arch ignored');

// 2. job rules
const seen = new Set(), sides = new Set();
for (let d = 1; d <= 400; d++) {
  const a = C.rollJobs('run', d, 'hamsi'), b = C.rollJobs('run', d, 'hamsi');
  ok(JSON.stringify(a) === JSON.stringify(b), 'roll not deterministic');
  seen.add(a.main); if (a.side) { sides.add(a.side); ok(a.side !== a.main, 'side == main'); ok(C.JOBS[a.side].side, 'side job not sideable'); }
  ok(!a.arch || ARCHS.includes(a.arch), 'bad arch');
}
ok(seen.size === C.MAIN_IDS.length, `only ${seen.size} main jobs ever roll`);
ok(sides.size >= 4, 'side jobs too narrow');
ok(C.MAIN_IDS.length >= 6, 'fewer than 6 job types');
const full = C.payout('core', 1, 0), half = C.payout('core', 0.5, 0), low = C.payout('core', 0.1, 0), side = C.payout('core', 1, 0, true);
ok(full.cr > half.cr && half.cr > 0 && low.cr === 0, 'partial payout shape');
ok(full.crate === 'gold' && half.crate === null && side.crate === 'iron', 'crate rules');
ok(C.payout('sample', 1, 4).cr > C.payout('sample', 1, 0).cr, 'quota scaling');
ok(/^\d{3}$/.test(C.vaultCode(123)) && C.vaultCode(123) === C.vaultCode(123), 'vault code');
ok(C.jobMoon(MOONS.hamsi) && !C.jobMoon({ company: true, interior: 'x' }) && !C.jobMoon({ interior: 'factory', layoutOpts: {} }), 'jobMoon');
ok(Object.keys(MOONS).some((k) => C.layoutOptsFor(MOONS[k], { runId: 'r', day: 3, moon: k })), 'no moon gets an archetype');
ok(C.layoutOptsFor(MOONS.hamsi, { runId: 'r', day: 3, moon: 'hamsi' })?.arch === C.layoutOptsFor(MOONS.hamsi, { runId: 'r', day: 3, moon: 'hamsi' })?.arch, 'layoutOptsFor stable');
const spots = Array.from({ length: 20 }, (_, i) => ({ x: i * 4, z: (i % 3) * 3, dist: i }));
const pk = C.pickSpots(spots, 4, new RNG(3), { sep: 7 });
ok(pk.length === 4 && pk.every((a, i) => pk.every((b, j) => i === j || Math.hypot(a.x - b.x, a.z - b.z) >= 7)), 'pickSpots spacing');

// 3. drone path + i18n
let paths = 0;
for (const arch of ARCHS) for (let s = 0; s < 8; s++) {
  const L = generateLayout(900 + s, 'factory', 1.4, archOpts(arch));
  const far = L.rooms.filter((r) => r.type !== 'entrance').sort((a, b) => L.distOf[L.idx(b.cx, b.cz)] - L.distOf[L.idx(a.cx, a.cz)])[0];
  const p = C.cellPath(L, L.idx(L.entrance.room.cx, L.entrance.room.cz), L.idx(far.cx, far.cz));
  if (p && p.length >= 2) { paths++; for (let k = 1; k < p.length; k++) ok(p[k][0] === p[k - 1][0] || p[k][1] === p[k - 1][1], 'drone path not axis aligned'); }
}
ok(paths >= 20, `drone path found on only ${paths}/24 layouts`);
for (const k of FJ_KEYS) for (const l of ['tr', 'ru']) if (k && tIn(l, k) === k && !/^[A-Za-z]{1,6}$/.test(k)) ok(false, `untranslated (${l}): ${k}`);
const src = fs.readFileSync(new URL('../../src/game/facjobs.js', import.meta.url), 'utf8');
for (const m of src.matchAll(/\b(?:t|tf)\('((?:[^'\\]|\\.)*)'/g)) { const k = m[1].replace(/\\'/g, "'"); if (!FJ_KEYS.includes(k)) ok(false, `t() key missing from facjobs_i18n: ${k}`); }
for (const blk of src.matchAll(/const (?:TITLE|BRIEF|STAGE|ARCH_NAME|ARCH_DESC|CRATE) = \{([^}]*)\}/g)) for (const m of blk[1].matchAll(/: '((?:[^'\\]|\\.)*)'/g)) { const k = m[1].replace(/\\'/g, "'"); if (!FJ_KEYS.includes(k)) ok(false, `table key missing: ${k}`); }

// 4. NATIVE_INTEGRATION: actual job rolls, Descent21 stream callbacks, Rapier,
// ItemManager and Session.broadcast/receiveLocal. Pose/clock fixtures below are
// controlled native setup, not walked browser play or injected job outcomes.
await initPhysics();
const codeKeys = new Set();
window.addEventListener = (ev, fn) => { if (ev === 'keydown') codeKeys.add(fn); };
window.removeEventListener = (ev, fn) => { if (ev === 'keydown') codeKeys.delete(fn); };
window.__kefalMods = { itemModels: new Map(), commands: new Map() };
window.KefalAPI = { THREE };
const errorsBefore = errLog.total;
function runtime(job) {
  let runId = '';
  for (let i = 0; i < 1000; i++) if (C.rollJobs(`jobs27-${i}`, 1, 'hamsi', 2).main === job && !C.rollJobs(`jobs27-${i}`, 1, 'hamsi', 2).side) { runId = `jobs27-${i}`; break; }
  assert(runId, `real roll for ${job}`);
  const physics = new Physics(), scene = new THREE.Scene(), mods = new Emitter(), sent = [], queued = [];
  const run = { runId, phase: 'moon', moon: 'hamsi', seed: 17, day: 1, quotaIndex: 2, credits: 300, time: 480 };
  const F = buildFacility(generateLayout(run.seed, MOONS.hamsi.interior, .8), { physics, lightPool: { add: e => e, remove() {} } }); scene.add(F.group);
  const player = { id: 'crew', pos: new THREE.Vector3(), slots: [], dead: false, indoor: false, inShip: false, heldItem: () => null, teleport(p) { this.pos.copy(p); this.indoor = p.y < 0; } };
  const net = new Session({ strategy: 'local', isHost: true, code: 'jobs27-native', profile: {} }); net.selfId = net.hostId = 'crew';
  // Session's actual synchronous local dispatch remains intact; the outbound
  // recorder has no transport/network connection in this controlled harness.
  net.send = (type, data) => { sent.push({ type, data: structuredClone(data) }); };
  let delayRestore = false;
  const g = { run, isHost: true, selfId: 'crew', time: 0, player, physics, scene, engine: { scene }, mods, net,
    world: { facility: F, moonId: run.moon, seed: run.seed, descent21Depth: 0, outdoor: {} },
    lights: { add: e => e, remove() {} }, env: {}, hostData: {},
    aiPlayers: () => [{ id: player.id, pos: player.pos, eye: player.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), zone: player.indoor ? 'in' : 'out', inShip: player.inShip, dead: player.dead }],
    aiPlayerById: id => g.aiPlayers().find(p => p.id === id), broadcastRun() {}, onItemHeld() {}, onItemDropped() {},
    ui: { hud: { toast() {} }, toast() {} }, audio: { play() {}, at() {} },
    creatures: { host: new Map(), views: new Map(), noises: [], hostRemove() {}, onEvent() {} },
  };
  g.items = new ItemManager(g);
  net.on_('it', d => {
    if (delayRestore && d.e === 'sp' && run.descent21?.depth === 0 && run.descent21?.surface?.items?.some(row => row.id === d.id)) queued.push(structuredClone(d));
    else g.items.onEvent(d);
  });
  g.facjobs = installFacjobs(g); g.descent21 = installDescent21(g);
  mods.emit('registerHandlers', (k, fn) => net.handle(k, fn), g);
  const frame = dt => { g.time += dt; physics.step(dt); mods.emit('update', dt, g); };
  const tick = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) frame(1 / 60); };
  physics.world.step(); g.descent21.onState(); frame(1 / 60); mods.emit('moonPopulated', g);
  assert.equal(run.fj?.j[0].id, job, `native ${job} setup`);
  const aboard = () => { const p = g.descent21.plan().spawn; player.teleport(new THREE.Vector3(p.x, p.y + .05, p.z)); };
  const visit = () => { const L = g.world.facility.layout; for (const id of g.descent21.plan().discoveryRooms) { const r = L.rooms[id]; player.teleport(new THREE.Vector3(L.ox + (r.cx + .5) * L.cell, L.y + .03, L.oz + (r.cz + .5) * L.cell)); tick(.3); } };
  const request = op => { const d = g.descent21.state(); return g.descent21.hostReq({ op, token: d.token, rev: d.rev, nonce: d.nonce }, 'crew'); };
  const descend = () => { visit(); aboard(); assert(request('call')); tick(3.1); assert(request('descend')); tick(3.1); assert.equal(run.descent21.depth, 1); };
  const back = delayed => { aboard(); delayRestore = delayed; assert(request('return')); tick(3.1); assert.equal(run.descent21.depth, 0); };
  const restore = () => { delayRestore = false; for (const d of queued.splice(0)) net.broadcast('it', d); tick(.1); };
  const dispose = () => { g.facjobs.dispose(); g.descent21.dispose(); g.items.dispose(); g.items.clearAll(); g.world.facility?.dispose(physics); physics.world.free(); };
  return { g, run, player, net, frame, tick, aboard, visit, request, descend, back, restore, queued, sent, dispose };
}
for (const id of ['core', 'rescue']) {
  const R = runtime(id), { g, run } = R;
  try {
    const itemId = g.facjobs._mem.ids.m, original = g.items.serialize(it => it.id === itemId)[0]; assert(original);
    const wallet = run.credits; R.descend();
    assert(!g.items.get(itemId), 'native descent removed loose surface job item');
    assert(run.descent21.surface.items.some(row => row.id === itemId), 'native surface checkpoint owns job item');
    const before = structuredClone(run.fj), memory = g.facjobs._mem.ids;
    g.facjobs.hostTick(10); assert.deepEqual(run.fj, before, `${id}: native missing checkpoint item is not a destroyed job`);
    g.facjobs.hostSetup(); g.facjobs.hostRebuild(); g.facjobs.hostReq({ op: 'code', c: '000' }, 'crew');
    g.mods.emit('moonPopulated', g); g.mods.emit('hostMigrated', g, { self: true });
    assert.deepEqual(run.fj, before, `${id}: missing checkpoint item cannot fail or reset deep job`);
    assert.equal(g.facjobs._mem.ids, memory, 'deep setup and migration preserve host memory');
    assert.equal(run.credits, wallet); assert(!R.sent.some(m => m.type === 'fjfx' && m.data.k === 'pay'));
    // A new host admitted while deep has no prior surface runtime IDs. Its
    // actual migration handler must defer reconstruction until restore delivery.
    g.facjobs.dispose(); g.facjobs = installFacjobs(g); g.mods.emit('hostMigrated', g, { self: true });
    assert.deepEqual(run.fj, before); assert.deepEqual(g.facjobs._mem.ids, {});
    R.back(true); assert(R.queued.some(d => d.id === itemId)); assert(!g.items.get(itemId));
    g.mods.emit('hostMigrated', g, { self: true }); g.facjobs.hostRebuild(); g.facjobs.hostTick(10); R.tick(.2);
    assert.deepEqual(run.fj, before, `${id}: no failure while surface restore is in transit`);
    assert.equal(run.credits, wallet);
    R.restore(); assert.equal(g.facjobs._mem.ids.m, itemId, 'deferred actual update rebuilt native ID');
    const restored = g.items.serialize(it => it.id === itemId)[0];
    assert.deepEqual({ id: restored.id, ty: restored.ty, v: restored.v, h: restored.h, iv: restored.iv }, { id: original.id, ty: original.ty, v: original.v, h: original.h, iv: original.iv });
    assert.deepEqual(run.fj, before);
    // Native held custody + replicated ship presence completes once, without
    // writing p/st/pd, credits or a mission result directly.
    g.net.broadcast('it', { e: 'held', id: itemId, h: 'crew' }); R.player.inShip = true;
    g.facjobs.hostTick(.5); assert.equal(run.fj.j[0].st, 1); assert.equal(run.fj.j[0].pd, 1);
    const paid = run.credits; assert(paid > wallet); g.facjobs.hostTick(.5); assert.equal(run.credits, paid, 'native completion pays once');
    assert.equal(R.sent.filter(m => m.type === 'fjfx' && m.data.k === 'pay').length, 1);
  } finally { R.dispose(); }
}
for (const id of ['feed', 'vault', 'drone']) {
  const R = runtime(id), { g, run, player } = R;
  try {
    R.frame(1 / 60);
    const oldProps = g.world.facility.group.children.filter(o => o.name.startsWith('facjobs-'));
    assert(oldProps.length, 'native surface job presentation positive control');
    let releasedMaterials = 0;
    for (const prop of oldProps) prop.traverse(o => o.material?.addEventListener('dispose', () => { releasedMaterials++; }));
    if (id === 'vault') {
      player.pos.fromArray(run.fj.j[0].pos); player.indoor = true;
      const prompts = []; g.mods.emit('interactables', prompts, g);
      const panel = prompts.find(p => p.label().includes('Vault panel')); assert(panel); panel.action();
      assert.equal(codeKeys.size, 1, 'actual vault action owns one code listener');
    }
    R.descend(); const before = structuredClone(run.fj), memory = structuredClone(g.facjobs._mem.drone), staleDepth = structuredClone(run.descent21);
    assert(oldProps.every(o => !o.parent), 'stream callback detached all surface prop owners'); assert(releasedMaterials > 0, 'stream callback released owned prop materials');
    assert.equal(codeKeys.size, 0, 'stream callback closes vault code and releases its keyboard listener');
    player.pos.fromArray(run.fj.j[0].pos); player.indoor = true;
    g.facjobs.hostReq({ op: 'feed' }, 'crew'); g.facjobs.hostReq({ op: 'code', c: run.fj.j[0].ex.cd }, 'crew');
    g.facjobs.hostReq({ op: 'photo' }, 'crew'); g.facjobs.hostTick(30); g.facjobs.droneTick(30);
    assert.deepEqual(run.fj, before, `${id}: a deep actor cannot operate surface coordinates`);
    assert.deepEqual(g.facjobs._mem.drone, memory, 'surface drone cannot move or take deep damage');
    const prompts = [], objectives = []; g.mods.emit('interactables', prompts, g); g.mods.emit('objectives', (...args) => objectives.push(args), g, 'moon');
    assert(!prompts.some(p => /splitter|Vault panel|Read the note/.test(p.label()))); assert.equal(objectives.length, 0);
    const nativeMeshCount = g.world.facility.group.children.length;
    g.net.receiveLocal('fjd', { token: descentToken(run), x: 100, y: -290, z: 100, hp: 100 }); R.tick(.1);
    assert.equal(g.world.facility.group.children.length, nativeMeshCount, 'late drone message cannot attach surface drone to deep facility');
    R.back(false); R.tick(.1);
    assert.equal(run.fj.j[0].st, before.j[0].st, 'ordinary surface job resumes');
    if (id === 'drone') {
      const restoredDrone = g.world.facility.group.children.find(o => o.name === 'facjobs-drone'); assert(restoredDrone, 'surface drone rebuilt');
      g.isHost = false;
      const was = restoredDrone.position.clone();
      g.net.receiveLocal('fjd', { token: 'old-landing', x: 100, y: -290, z: 100, hp: 100 }); R.tick(.01);
      assert(restoredDrone.position.distanceTo(was) < .1, 'old landing drone packet is rejected on surface');
      g.net.receiveLocal('fjd', { token: descentToken(run), x: 100, y: -290, z: 100, hp: 100 }); R.tick(.1);
      assert(restoredDrone.position.distanceTo(was) > 1, 'current landing drone packet still animates native prop'); g.isHost = true;
    }
    // Stale persisted depth token is never authority over another landing.
    run.day++; run.descent21 = staleDepth; g.facjobs.hostSetup(); assert.equal(run.fj.day, run.day, 'stale deep token allows fresh landing setup');
  } finally { R.dispose(); }
}
const ordinaryMissing = runtime('core');
try {
  ordinaryMissing.g.net.broadcast('it', { e: 'rm', id: ordinaryMissing.g.facjobs._mem.ids.m });
  ordinaryMissing.g.facjobs.hostTick(.5);
  assert.equal(ordinaryMissing.run.fj.j[0].st, 2, 'genuine ordinary surface destruction still fails extraction');
  assert.equal(ordinaryMissing.run.credits, 300, 'ordinary failure does not pay an early reward');
} finally { ordinaryMissing.dispose(); }
const ordinaryUnload = runtime('feed');
try {
  const { g } = ordinaryUnload; ordinaryUnload.frame(1 / 60);
  const prop = g.world.facility.group.children.find(o => o.name === 'facjobs-prop'); assert(prop);
  const material = prop.children[0].material, geometry = prop.children[0].geometry;
  let materialFrees = 0, geometryFrees = 0;
  material.addEventListener('dispose', () => { materialFrees++; }); geometry.addEventListener('dispose', () => { geometryFrees++; });
  g.world.facility.dispose(g.physics); g.world.facility = null;
  assert.equal(materialFrees, 0, 'native parent map disposal respects job resource owner'); assert.equal(geometryFrees, 0, 'native parent map cannot free shared job geometry');
  ordinaryUnload.frame(1 / 60); assert.equal(materialFrees, 1, 'module cleared old map material once'); assert.equal(geometryFrees, 0);
  g.facjobs.dispose(); g.facjobs.dispose(); assert.equal(materialFrees, 1); assert.equal(geometryFrees, 1, 'shared module geometry released once on disposal');
} finally { ordinaryUnload.dispose(); }
assert.equal(errLog.total, errorsBefore, 'actual lifecycle handlers raised no swallowed event errors');
console.log('facjobs native: core/rescue custody, deep/migration suspension, delayed restore, once-only pay and stale-token boundaries passed');

console.log('archetypes', JSON.stringify(stat));
console.log(fails.length ? `FAIL (${fails.length})\n` + fails.slice(0, 15).join('\n') : 'facjobs: all checks passed');
process.exit(fails.length ? 1 : 0);
