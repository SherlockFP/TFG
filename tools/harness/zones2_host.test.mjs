// node tools/harness/zones2_host.test.mjs
// Wave 6 ZONES v2: mock-game host flows through the real installer (zones.js + zones2.js): interior wing core + capture + trap build + trap kills + interior raiders, validated ring placer
// + walls / gates (validation, refund, raiders around them), extractor + income, generated-sector archive after a rotation, upkeep ammo, ship CRT map, translations.
import * as THREE from 'three';
import { setInteriorProbe, generateSector } from '../../src/game/moongen.js';
import { MOONS } from '../../src/game/moons.js';
import { generateLayout, INTERIOR_THEMES } from '../../src/world/facility.js';
import { Terrain, planMoon } from '../../src/world/terrain.js';
import * as Z from '../../src/game/zones_core.js';
import * as Q from '../../src/game/zones2_core.js';
import { installZones } from '../../src/game/zones.js';
import { TR, RU } from '../../src/game/zones_i18n.js';
import { inBox } from '../../src/game/siege_core.js';

setInteriorProbe((id) => INTERIOR_THEMES.includes(id));
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } };
const say = (m) => console.log('ok  ', m);

const handlers = new Map(), sent = [], later = [], listeners = {}, cmds = new Map(), netOn = {};
const mods = { on: (ev, fn) => { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); }; }, emit: (ev, ...a) => (listeners[ev] || []).forEach((f) => f(...a)), commands: cmds, api: { registerCommand: (n, fn) => cmds.set(n, fn) } };
const moon = MOONS.orkinos, seed = 8123, plan = planMoon(seed, moon), ter = new Terrain(seed, moon, plan);
const L = generateLayout(seed, moon.interior, moon.size, null);
const run = { phase: 'moon', moon: 'orkinos', seed, day: 3, daysLeft: 3, quota: 400, quotaIndex: 1, sold: 0, credits: 5000, runId: 'RUNW6', forecast: {}, time: 600, upgrades: {}, zn: null };
const net = {
  isHost: true, hostId: 'me', selfId: 'me',
  broadcast: (t, d) => { sent.push([t, d]); if (t === 'znx') netOn['msg:znx']?.(d, 'me'); },   // loop back: the host is a client too
  sendTo: (to, t, d) => { sent.push([t, d, to]); if (t === 'znx') netOn['msg:znx']?.(d, 'me'); },
  request: (a, d) => handlers.get(a)?.({ a, ...d }, 'me'), on(ev, fn) { netOn[ev] = fn; }, off() {},
};
const me = { id: 'me', pos: new THREE.Vector3(0, 0, 0), dead: false, inShip: false, zone: 'out', yaw: 0 };
const player = { indoor: false, dead: false, pos: me.pos, yaw: 0 };
const placed = [], destroyed = [], deps = new Map();
let cid = 0;
const game = {
  isHost: true, selfId: 'me', mods, net, run, config: {}, scene: new THREE.Scene(), time: 0, profile: {}, player, remotes: new Map(),
  world: { terrain: ter, outdoor: { harvest: { trees: [], rocks: [] } }, facility: { layout: L, hazards: { lasers: [] } } }, items: { hostSpawn: () => 'i' },
  creatures: {
    host: new Map(), views: new Map(), speedMul: (c, s) => s,
    attack() {}, kill(c) { c.dead = true; this.host.delete(c.id); },
    damage(id, dmg) { const c = this.host.get(id); if (!c) return; c.hp = (c.hp ?? c.maxHp) - dmg; if (c.hp <= 0) this.kill(c); },
    hostSpawn(type, pos, o = {}) { const c = { id: 'c' + ++cid, type, pos: pos.clone(), dead: false, def: { dmg: 9, siege: true }, maxHp: 50, hp: 50, state: 'run', data: {}, setState(s) { this.state = s; }, cooldown: 0, age: 5, t: 1, level: 1, dmg: 5, yaw: 0, stunT: 0, slowT: 0, zone: o.zone || 'out' }; this.host.set(c.id, c); return c; },
  },
  deployables: {
    DEPS: { turret1: { r: 0.55 }, barr_wood: { r: 1.1 }, turret2: { r: 0.55 } },
    debugPlace: (ty, x, z) => { const d = { id: 'd' + placed.length, type: ty, dead: false, def: { supply: ['x', 1], hx: 0.5, hz: 0.5, cap: 100, kind: ty.startsWith('turret') ? 'turret' : 'barricade' }, cap: 100, res: 9, on: true, pos: { x, y: 0, z } }; placed.push([ty, d]); deps.set(d.id, d); return d; },
    destroy: (id) => { destroyed.push(id); deps.delete(id); }, nearest: () => null, get: (id) => deps.get(id) || null, list: () => [...deps.values()], damage() {},
    blockers: () => [...deps.values()].filter((d) => d.type === 'barr_wood').map((d) => ({ id: d.id, type: d.type, x: d.pos.x, z: d.pos.z, hx: 1.1, hz: 0.22, yaw: 0, cost: 25 })),
  },
  broadcastRun() {}, applyRunState() {}, hostFinishTakeoff() { this.run.phase = 'orbit'; this.run.day += 1; }, hostSave() {},
  later: (fn, ms) => { later.push([fn, ms]); return later.length; }, aiPlayers: () => [me], aiPlayerById: (id) => (id === 'me' ? me : null),
  ui: { toast() {}, hud: { bigText() {} } }, sfx() {}, lore: null, horror: { plan: { traps: [] } },
};
const api = installZones(game);
ok(api && api.x2(), 'installZones returns an api with the zones2 runtime');
mods.emit('registerHandlers', (a, fn) => handlers.set(a, fn), game);
mods.emit('hostStart', game);
const X2 = api.x2();
const req = (d) => handlers.get('znreq')(d, 'me');
const denies = () => sent.filter((s) => s[0] === 'znx' && s[1].k === 'deny').map((s) => s[1].why);
const tick = (sec, dt = 0.25) => { for (let i = 0; i < sec / dt; i++) { game.time += dt; mods.emit('update', dt, game); } };

// ============================================================ interior wing: core inside the facility, capture, traps
api.hostComputeCores();
const spec = api.zoneSpec('orkinos'), cores = api.cores();
ok(cores.length === spec.n, `all ${spec.n} cores placed`);
const inCores = cores.filter((c) => c.in);
ok(inCores.length >= 1, `at least one wing zone has its relay INSIDE the facility (${inCores.length} of ${spec.zones.filter((z) => z.kind === 'wing').length} wings)`);
const I = X2.interior();
for (const c of inCores) {
  ok(c.y === L.y && Math.abs(c.x) < L.w * 2 && Math.abs(c.z) < L.h * 2, `${c.id}: interior core sits in the facility volume`);
  ok(I.part.cellWing[Q.cellOfPos(L, c.x, c.z)] === c.w, `${c.id}: core cell belongs to its wing`);
  ok(spec.zones.find((z) => z.id === c.id).kind === 'wing', `${c.id}: only wing zones move inside`);
}
for (const c of cores) if (!c.in) ok(c.y === ter.heightAt(c.x, c.z), 'outdoor cores stay on the terrain');
const W1 = inCores[0];
// the crew stands OUTSIDE right above the core: nothing happens (different level); inside: the scan starts
me.pos.set(W1.x + 1.5, ter.heightAt(W1.x, W1.z), W1.z); player.indoor = false;
tick(30);
ok(!(sent.find((s) => s[0] === 'znx' && s[1].k === 'st')?.[1].clr?.[W1.id] > 0), 'a crew standing above the wing does not count for the relay scan');
{ const out = []; mods.emit('interactables', out, game); ok(!out.some((o) => Math.abs(o.pos.y - W1.y) < 5), 'no interior prompt from outside'); }
me.pos.set(W1.x + 1.5, L.y + 0.2, W1.z); player.indoor = true;
tick(24);
sent.length = 0; req({ op: 'plant', z: W1.id });
ok(!denies().length, 'plant accepted inside the wing after 20 s clear: ' + denies());
{ const out = []; mods.emit('interactables', out, game); ok(out.some((o) => Math.abs(o.pos.y - W1.y) < 5), 'interior relay prompt shows inside'); }
tick(6);
const stW = api.state().m.orkinos?.[W1.id];
ok(stW?.s === 'own', 'interior zone captured the same way: ' + JSON.stringify(stW));
ok(api.snapshot().moons.find((m) => m.id === 'orkinos').zones.find((q) => q.id === W1.id).interior === true, 'snapshot marks the zone as interior');
// build rules: turret refused in a wing, trap accepted
sent.length = 0; req({ op: 'build', z: W1.id, def: 'turret1' });
ok(denies().length === 1 && !api.state().m.orkinos[W1.id].d.turret1, 'no turret in a wing: ' + denies());
let cr = run.credits;
req({ op: 'build', z: W1.id, def: 't_spikes' });
ok(api.state().m.orkinos[W1.id].d.t_spikes === 1 && run.credits === cr - Z.DEFS.t_spikes.cost, 'spike floor built: state + credits');
let tr = X2.traps();
ok(tr.length === 1 && tr[0].zid === W1.id && tr[0].type === 'spikes', 'the host planned one trap in the wing');
const T0 = tr[0];
ok(Q.validateTrap(L, I.part, W1.w, { type: T0.type, axis: T0.axis, cells: T0.cells }, { horror: [], hazards: [] }).ok, 'the placed trap passes the validator');
ok(sent.some((s) => s[0] === 'znx' && s[1].k === 'tp' && s[1].a.length === 1), 'placement list broadcast (tp)');
ok(X2.views().size === 1, 'trap view built from the host message');
// a creature walks into the lane: armed -> telegraph -> strike -> dead
const cr1 = game.creatures.hostSpawn('sg_swarmer', new THREE.Vector3(T0.zone.cx, L.y, T0.zone.cz), { zone: 'in' }); cr1.hp = 40;
let states = new Set(), steps = 0;
while (!cr1.dead && steps++ < 40) { tick(0.25); const e = X2.views().get(T0.uid); if (e) states.add(e.v.state); }
ok(cr1.dead, 'the spike floor killed the creature that walked in (' + [...states] + ')');
ok(states.has('tele') && states.has('strike'), 'the view went through warning -> strike');
// players are never hurt (creatures only)
me.pos.set(T0.zone.cx, L.y, T0.zone.cz); const hp0 = me.hp; tick(6); ok(me.hp === hp0, 'the crew is not hurt by their own trap');
me.pos.set(W1.x + 1.5, L.y + 0.2, W1.z);
// more traps: types, validator, refusal when no corridor is left
const sizes = [];
for (const d of ['t_crusher', 't_electric', 't_flame', 't_laser']) { sent.length = 0; const before = Z.defCount(api.state().m.orkinos[W1.id]); req({ op: 'build', z: W1.id, def: d }); sizes.push(Z.defCount(api.state().m.orkinos[W1.id]) - before + (denies().length ? 10 : 0)); }
ok(sizes.every((n) => n === 1 || n === 11), 'each trap build is accepted or refused cleanly: ' + sizes);
const allT = X2.traps(); const ctxs = { horror: [], hazards: [] };
allT.forEach((T, k) => ok(Q.validateTrap(L, I.part, W1.w, { type: T.type, axis: T.axis, cells: T.cells }, { ...ctxs, taken: allT.slice(0, k).map((x) => ({ cells: x.cells })) }).ok, `trap ${T.type} stays valid`));
let lastDeny = ''; for (let i = 0; i < 30 && !lastDeny; i++) { sent.length = 0; const cr2 = run.credits; req({ op: 'build', z: W1.id, def: 't_spikes' }); if (denies().length) { lastDeny = denies()[0]; ok(run.credits === cr2, 'a refused build costs nothing'); } }
ok(/corridor|slot/i.test(lastDeny), 'sooner or later the wing runs out of corridors / slots: ' + lastDeny);
// sell refunds and re-plans
{ const d = Object.keys(api.state().m.orkinos[W1.id].d).find((k) => Z.DEFS[k].in), n0 = X2.traps().length, c0 = run.credits; req({ op: 'sell', z: W1.id, def: d }); ok(X2.traps().length === n0 - 1 && run.credits === c0 + Math.floor(Z.DEFS[d].cost / 2), 'sell a trap: refund half, lane removed'); }
say('interior: relay inside the wing, capture, level check, trap build / kill / validator / sell');

// ============================================================ interior raiders (live defence in the wing)
{
  api.state().pend = [{ m: 'orkinos', z: W1.id, d: run.day }];
  run.time = Z.ZN.dusk + 1; me.pos.set(W1.x + 1.5, L.y + 0.2, W1.z);
  tick(1);
  const Lv = api.live();
  ok(Lv && Lv.z === W1.id && Lv.int === true, 'live defence starts in the wing');
  tick(14);   // prep 12 s -> wave 1 spawns
  let seen = 0, inside = 0, closer = 0;
  for (let i = 0; i < 40; i++) {
    tick(0.5);
    for (const c of game.creatures.host.values()) {
      seen++;
      if (c.zone === 'in' && Math.abs(c.pos.y - L.y) < 0.01 && Q.wingAt(L, I.part, c.pos.x, c.pos.y, c.pos.z) === W1.w) inside++;
    }
  }
  ok(seen > 0 && inside >= seen * 0.9, `raiders spawn in the wing corridors and stay in it (${inside}/${seen})`);
  const fd = Q.coreDist(L, I.part, W1.w);
  const rs = [...game.creatures.host.values()]; const before = rs.map((c) => fd[Q.cellOfPos(L, c.pos.x, c.pos.z)]);
  tick(6);
  rs.forEach((c, i) => { if (!c.dead) { const a = fd[Q.cellOfPos(L, c.pos.x, c.pos.z)]; if (a >= 0 && before[i] >= 0 && a <= before[i]) closer++; } });
  ok(closer >= rs.filter((c) => !c.dead).length * 0.7, 'raiders walk the corridors towards the core (flow)');
  api.live().hp = 0; tick(1);
  ok(!api.live() && api.state().m.orkinos[W1.id].s === 'inf', 'core destroyed: the wing is infected');
  for (const c of [...game.creatures.host.values()]) game.creatures.kill(c);
  say('interior raiders: spawn in the wing, walk the flow to the core, wing lost when the core dies');
}

// ============================================================ outdoor: validated ring placer + walls / gates
me.pos.set(0, 0, 0); player.indoor = false;
const A = api.cores().find((c) => !c.in && c.id === 'A') || api.cores().find((c) => !c.in);
me.pos.set(A.x + 3, A.y, A.z); me.yaw = 0; player.yaw = 0;
tick(24); sent.length = 0; req({ op: 'plant', z: A.id }); tick(5);
ok(api.state().m.orkinos?.[A.id]?.s === 'own', 'outdoor zone captured');
placed.length = 0;
cr = run.credits;
req({ op: 'build', z: A.id, def: 'turret1' }); req({ op: 'build', z: A.id, def: 'barr_wood' }); req({ op: 'build', z: A.id, def: 'spikes' });
ok(deps.size === 3, `three ring defences stand on validated spots (${deps.size}; the zone is rebuilt on every build)`);
for (const d of deps.values()) {
  ok(Math.hypot(d.pos.x - A.x, d.pos.z - A.z) <= Z.ZN.zoneR && Math.hypot(d.pos.x - A.x, d.pos.z - A.z) >= 3.2 && ter.heightAt(d.pos.x, d.pos.z) >= (ter.flood ?? -99) + 0.3, 'defence inside the ring, off the core, dry');
}
// a rock (obstacle) on every candidate spot of the next ring defence: the build is refused and refunded
const savedRocks = game.world.outdoor.harvest.rocks;
game.world.outdoor.harvest.rocks = Array.from({ length: 400 }, (_, i) => ({ x: A.x + Math.cos(i * 0.71) * (4 + (i % 9) * 2), z: A.z + Math.sin(i * 0.71) * (4 + (i % 9) * 2), scale: 4 }));
sent.length = 0; cr = run.credits; const dCount = Z.defCount(api.state().m.orkinos[A.id]);
req({ op: 'build', z: A.id, def: 'turret1' });
ok(denies().some((w) => /spot/i.test(w)) && run.credits === cr && Z.defCount(api.state().m.orkinos[A.id]) === dCount, 'no valid spot (rocks everywhere): refused, nothing charged, the zone is unchanged: ' + denies());
game.world.outdoor.harvest.rocks = savedRocks;
// walls
me.pos.set(A.x + 5, ter.heightAt(A.x + 5, A.z), A.z);
const aim = (dx, dz) => ({ wx: me.pos.x + dx, wz: me.pos.z + dz, fy: Math.atan2(dx, dz) });
cr = run.credits; sent.length = 0;
req({ op: 'wall', z: A.id, n: 4, gate: 1, ...aim(0, 6) });
const stA = api.state().m.orkinos[A.id];
ok(stA.w && stA.w.length >= 2 && stA.w.length <= 4, `a wall line was placed (${stA.w?.length} of 4 pieces fit)`);
const cost = stA.w.reduce((a, w) => a + Z.WALL.cost[w[0]], 0);
ok(run.credits === cr - cost, 'only valid pieces are charged: ' + (cr - run.credits) + ' vs ' + cost);
ok(JSON.stringify(X2.walls()[A.id]) === JSON.stringify(stA.w.filter((w) => Q.validateWall({ ...X2.wallCtx(A, []), cap: 99 }, w, { noCap: true }).ok)) || X2.walls()[A.id]?.length >= 1, 'the host publishes the pieces that fit this landing');
ok(sent.some((s) => s[0] === 'znx' && s[1].k === 'wl'), 'wall list broadcast (wl)');
ok(X2.state.wMesh && X2.state.wMesh.length === 2, 'instanced view built');
{ const sizeBefore = stA.w.length; sent.length = 0; req({ op: 'wall', z: A.id, n: 1, gate: 0, ...aim(0, 6) }); ok(stA.w.length === sizeBefore, 'the same spot again is refused (' + denies() + ')'); }
me.pos.set(A.x + 60, ter.heightAt(A.x + 60, A.z), A.z); sent.length = 0; req({ op: 'wall', z: A.id, n: 1, gate: 0, ...aim(0, 4) });
ok(denies().length === 1, 'cannot build outside the zone');
me.pos.set(A.x + 5, ter.heightAt(A.x + 5, A.z), A.z);
sent.length = 0; req({ op: 'wall', z: A.id, n: 1, gate: 0, wx: me.pos.x + 30, wz: me.pos.z, fy: 0 });
ok(denies().length === 1, 'aim point too far away is refused');
{ const c1 = run.credits, n1 = stA.w.length; req({ op: 'wsell', z: A.id }); ok(stA.w.length === n1 - 1 && run.credits > c1, 'sell the nearest wall piece: refund'); }
// walls persist across landings: new terrain -> pieces that no longer fit are dropped from the LIST for that landing, never from the state
{
  const keep = JSON.stringify(stA.w);
  const wl0 = JSON.stringify(X2.walls()[A.id]);
  const flooded = { ...ter, heightAt: (x, z) => ter.heightAt(x, z), flood: 1e6, playHalf: ter.playHalf };
  game.world.terrain = flooded; X2.hostRefreshWalls(false);
  ok((X2.walls()[A.id] || []).length === 0 && JSON.stringify(stA.w) === keep, 'a landing where the pieces would be under water: none built, none forgotten');
  game.world.terrain = ter; X2.hostRefreshWalls(false);
  ok(JSON.stringify(X2.walls()[A.id]) === wl0, 'back on dry land they are back');
}
say('outdoor: validated ring placer (refuse + refund with no spot), walls / gates (validation, charge only valid, refund, persistence)');

// ============================================================ raiders path around the wall in a live defence
{
  const st = api.state().m.orkinos[A.id]; st.s = 'own';
  st.w = [];   // a long wall across the approach from +x: 9 pieces along z, 14 m in front of the core (grid coordinates relative to the core)
  for (let gz = -8; gz <= 8; gz += 2) st.w.push([0, 9, gz, 1]);
  me.pos.set(A.x + 3, ter.heightAt(A.x + 3, A.z), A.z);
  X2.hostRefreshWalls(false);
  api.state().pend = [{ m: 'orkinos', z: A.id, d: run.day }];
  run.time = Z.ZN.dusk + 1; tick(1);
  const Lv = api.live(); ok(Lv && !Lv.int, 'outdoor live defence started');
  const boxes = Q.wallBlockers(A, X2.walls()[A.id] || []).solid;
  ok(boxes.length >= 3, 'walls are in the way (' + boxes.length + ' solid pieces fit)');
  tick(14);
  let inWall = 0, samples = 0, near = 0;
  const seenIds = new Set();
  for (let i = 0; i < 160; i++) {
    tick(0.5);
    for (const c of game.creatures.host.values()) { samples++; seenIds.add(c.id); if (boxes.some((b) => inBox(c.pos.x, c.pos.z, b, 0))) inWall++; if (Math.hypot(c.pos.x - A.x, c.pos.z - A.z) < 22) near++; }
    for (const c of [...game.creatures.host.values()]) if (Math.hypot(c.pos.x - A.x, c.pos.z - A.z) < 3) game.creatures.kill(c);
    if (!api.live()) break;
  }
  ok(samples > 50 && inWall === 0, `no raider ever stands inside a wall piece (${samples} samples)`);
  ok(near > 0, 'raiders do reach the zone');
  for (const c of [...game.creatures.host.values()]) game.creatures.kill(c);
  if (api.live()) { api.live().hp = 0; tick(1); }
  ok(X2.state.dead.size === 0, 'breached pieces are repaired for the next fight');
  say('live defence outdoors: raiders never enter a wall piece, they reach the zone by walking round / chewing');
}

// ============================================================ extractor + income (within the cap)
{
  const st = api.state().m.orkinos[A.id]; st.s = 'own'; st.w = []; st.d = {};
  run.quotaIndex = 0; me.pos.set(A.x + 3, ter.heightAt(A.x + 3, A.z), A.z); run.phase = 'moon';
  sent.length = 0; req({ op: 'mine', z: A.id });
  ok(!st.mn && denies().length === 1, 'the extractor opens with quota 2: ' + denies());
  run.quotaIndex = 1; run.credits = 2000; cr = run.credits; sent.length = 0;
  req({ op: 'mine', z: A.id });
  ok(st.mn?.l === 1 && [0, 1, 2].includes(st.mn.p) && run.credits === cr - Z.minerCost(1), 'extractor built: Mk1 + node purity + cost ' + JSON.stringify(st.mn));
  req({ op: 'mine', z: A.id }); req({ op: 'mine', z: A.id }); req({ op: 'mine', z: A.id });
  ok(st.mn.l === 3, 'upgrades to Mk3, no further');
  ok(run.credits === cr - Z.minerCost(3), 'upgrade costs add up to the Mk3 price (' + (cr - run.credits) + ')');
  // income: big quota (cap not binding) -> the miner adds; small quota -> capped
  const owned = () => Z.listZones(api.state(), (id) => Z.zonesEligible(api.moonDef(id))).filter((e) => e.st.s === 'own');
  for (const e of owned()) if (!(e.m === 'orkinos' && e.z === A.id)) e.st.s = 'inf';
  run.quotaIndex = 0;   // (no counter-attack votes while the numbers are measured)
  run.quota = 4000; run.phase = 'orbit'; run.day++; const c0 = run.credits; api.dayTick(); const withMn = api.state().rep.income;
  delete st.mn; run.credits = c0; api.dayTick(); const without = api.state().rep.income;
  ok(withMn > without && api.state().rep.income <= Z.dailyCap(4000), `income with the extractor ${withMn} > without ${without} (cap ${Z.dailyCap(4000)})`);
  st.mn = { l: 3, p: 2 }; run.quota = 130; api.dayTick();
  ok(api.state().rep.income <= Z.dailyCap(130) && api.state().rep.capped, 'at quota 130 the same extractor is capped: ' + api.state().rep.income + ' <= ' + Z.dailyCap(130));
  ok(sent.some((s) => s[0] === 'znx' && s[1].k === 'algo' && s[1].kind === 'cap'), 'capped notice');
  const snap = api.snapshot().moons.find((m) => m.id === 'orkinos').zones.find((q) => q.id === A.id);
  ok(snap.mn?.l === 3 && snap.mnBonus?.credits > 0 && snap.mnCost === 0, 'snapshot exposes the extractor');
  run.quota = 400; run.quotaIndex = 1; run.phase = 'moon'; me.pos.set(A.x + 3, ter.heightAt(A.x + 3, A.z), A.z);
  const c1 = run.credits; req({ op: 'msell', z: A.id }); ok(!st.mn && run.credits === c1 + Math.floor(Z.minerCost(3) / 2), 'sell the extractor: half back');
  say('extractor: unlock, Mk1-3 cost, income within the cap, sell');
}

// ============================================================ archive: a generated moon rotates out, its zones keep paying
{
  const gm = generateSector('w6arch', 1).moons[0];
  MOONS[gm.id] = gm;
  const z = api.state(), sp = Z.zoneSpec(gm, run.runId);
  Z.setZ(z, gm.id, sp.zones[0].id, { s: 'own', d: {}, up: 0 });
  run.phase = 'orbit'; run.day++; run.quota = 4000; run.quotaIndex = 0; api.dayTick();
  const withReal = api.state().rep.income, n1 = api.state().rep.n;
  ok(z.arch?.[gm.id] && JSON.stringify(z.arch[gm.id]).length < 120, 'the day tick archived the generated moon: ' + JSON.stringify(z.arch?.[gm.id]));
  delete MOONS[gm.id];   // the sector rotated
  ok(api.moonDef(gm.id)?.arch === true, 'moonDef answers from the archive after the rotation');
  run.day++; api.dayTick();
  ok(api.state().rep.n === n1 && api.state().rep.income === withReal, `owned zones still pay after the rotation (${n1} zones, ${withReal})`);
  const saved = JSON.parse(JSON.stringify(run.zn));
  ok(saved.arch[gm.id] && saved.m[gm.id], 'archive + ownership survive save / load');
  const snap = api.snapshot().moons.find((m) => m.id === gm.id);
  ok(snap && snap.away === true && snap.owned === 1, 'the sector map lists it as archived (away)');
  run.day++; run.quotaIndex = 3; api.state().pend = []; api.dayTick();
  ok(api.state().pend.every((p) => api.moonDef(p.m)), 'attacks may target archived zones (auto-resolve)');
  say('archive: recorded, answers after rotation, still pays, save-safe, listed as archived');
}

// ============================================================ upkeep ammo
{
  const st = api.state().m.orkinos[A.id]; st.s = 'own'; st.d = { turret2: 1 }; st.w = []; st.up = 0; st.dry = 0; st.am = 0.5;
  run.phase = 'moon'; me.pos.set(A.x + 3, ter.heightAt(A.x + 3, A.z), A.z); run.quotaIndex = 2;
  placed.length = 0; api.materialize();
  const t2 = placed.find((p) => p[0] === 'turret2')?.[1];
  ok(t2 && t2.res === 50, 'a half-paid upkeep = a half-full turret when the zone is rebuilt: ' + t2?.res);
  st.am = 1; placed.length = 0; api.materialize();
  ok(placed.find((p) => p[0] === 'turret2')[1].res === 100, 'fully paid = full ammo');
  st.dry = 1; st.am = 0; placed.length = 0; api.materialize();
  ok(placed.find((p) => p[0] === 'turret2')[1].res === 0, 'unpaid = an empty turret');
  // live: an empty turret gets refilled out of the zone's ammo reserve
  st.dry = 0; st.am = 1; st.s = 'own'; placed.length = 0; api.materialize();
  const tt = placed.find((p) => p[0] === 'turret2')[1]; tt.res = 5;
  api.state().pend = [{ m: 'orkinos', z: A.id, d: run.day }]; run.time = Z.ZN.dusk + 1; tick(1);
  const Lv = api.live(); ok(Lv, 'live defence for the ammo test');
  const reserve = X2.ammoReserve(st); ok(Lv.ammo === reserve && reserve >= 4, 'reserve = what the upkeep bought: ' + reserve);
  tick(14 + 8);
  ok(tt.res > 5 && Lv.ammo === reserve - 1, `the low turret was refilled from the reserve (res ${tt.res}, reserve ${Lv.ammo}/${reserve})`);
  api.live().hp = 0; tick(1);
  say('upkeep ammo: partial / full / empty on rebuild, refills during the defence');
}

// ============================================================ ship CRT
{
  const calls = { text: 0, fill: 0, orig: 0 };
  const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (...a) => { if (k === 'fillText') calls.text++; if (k === 'fillRect' || k === 'arc') calls.fill++; void a; }), set: (o, k, v) => { o[k] = v; return true; } });
  const scr = { extra: { c: { width: 160, height: 120 }, ctx, t: { needsUpdate: false } }, drawExtra() { calls.orig++; } };
  game.shipScreens = scr;
  tick(0.5);
  ok(scr.drawExtra !== undefined && Object.prototype.hasOwnProperty.call(scr, 'drawExtra'), 'the vitals monitor draw is wrapped on the instance');
  run.phase = 'orbit'; run.moon = 'orkinos';
  ok(X2.crtDraw(scr.extra) === true && scr.extra.t.needsUpdate && calls.text >= 6 && calls.fill > 10, `the sector map is drawn on the ship monitor (${calls.text} texts, ${calls.fill} shapes)`);
  const z = api.state(); const saveM = z.m; z.m = {};
  ok(X2.crtDraw(scr.extra) === false, 'no zones yet: the monitor keeps the crew vitals');
  z.m = saveM;
  api.dispose();
  ok(!Object.prototype.hasOwnProperty.call(scr, 'drawExtra') || scr.drawExtra.name !== 'w', 'dispose restores the monitor');
  say('ship CRT: sector map on the vitals monitor (renderer shared with the panel), restored on dispose');
}

// ============================================================ translations
{
  const trK = Object.keys(TR).sort().join('|'), ruK = Object.keys(RU).sort().join('|');
  ok(trK === ruK, 'TR and RU have the same keys: ' + Object.keys(TR).filter((k) => !(k in RU)).concat(Object.keys(RU).filter((k) => !(k in TR))).join(' / '));
  const need = ['Laser Grid', 'Zone Wall', 'Zone Gate', 'No valid spot for this defence here.', 'Already a piece here.', 'EXTRACTOR', 'WALLS', 'ARCHIVED', 'Water: nothing stands here.', 'Too steep or uneven.', 'Traps only work inside a facility wing.', 'Facility wing: traps on the corridors, always armed, they only hurt creatures.', 'Build an extractor'];
  for (const k of need) ok(TR[k] && RU[k], 'EN / TR / RU: ' + k);
  const reasons = ['Not a valid piece.', 'Too close to the core.', 'Outside the zone.', 'Too close to another core.', 'Outside the map.', 'Too close to the ship.', 'Keep the ship door clear.', 'Unsafe ground.', 'Blocked by a rock or tree.', 'Too close to another defence.', 'Blocked by something.', 'No free wall slots: upgrade the zone.', 'Blocked by a wall.', 'Too far.', 'Someone is in the way.', 'No wall piece within reach.', 'No valid corridor left in this wing.'];
  for (const k of reasons) ok(TR[k] && RU[k], 'every placement / build refusal is translated: ' + k);
  say('translations EN / TR / RU');
}

console.log(`\n${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
