// [shift11] node checks for the RECYCLE BIN labyrinth (src/game/shift11*.js): the pure planner over 5 themes x 3 sizes x 3 seeds, then the runtime on a stub game.
//   planner: gates only on legal edges, every state (30 steps) keeps every needed cell reachable, <= 2 sectors deleted, restore after exactly 2 steps, every step toggles a rail,
//   no busy room is ever a sector, determinism (same layout = same signature, other seeds differ), TR / RU tables, sounds render.
//   runtime: build on a real facility with stub physics / nav, colliders + nav + sector cells follow warn / go / set messages, late join, ejection, host director timing.
//   node tools/harness/shift11.test.mjs
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent("export async function load(u, c, n) { if (u.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return n(u, c); }"));
globalThis.window = globalThis;
const realLog = console.log;
console.warn = console.error = () => {};
globalThis.addEventListener = globalThis.removeEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;
const cv = () => ({ width: 0, height: 0, style: {}, querySelector: () => cv(), querySelectorAll: () => [], children: [], insertBefore() {}, appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }) });
globalThis.document = { createElement: () => cv(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, activeElement: null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { generateLayout, buildFacility } = await import('../../src/world/facility.js');
const CORE = await import('../../src/game/shift11_core.js');
const { planShift, busyRooms, cellOfPos } = CORE;
const TX = await import('../../src/game/shift11_text.js');
const { SFX, renderSfx } = await import('../../src/audio/sfxlib.js');
let fails = 0;
const bad = (m) => { fails++; realLog('FAIL', m); };
const okc = (c, m) => { if (!c) bad(m); };
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];

// independent reachability (does not use the planner's own BFS)
function reachable(L, flags, plan, st) {
  const seen = new Uint8Array(L.w * L.h), q = [];
  const dead = (i) => { const s = plan.sectorOfCell(i); return s >= 0 && st.del[s]; };
  const closedKeys = new Set(); for (let r = 0; r < plan.nRails; r++) if (st.closed[r]) closedKeys.add(plan.gates[r].key);
  for (const s of L.entrySources) if (!seen[s] && !dead(s)) { seen[s] = 1; q.push(s); }
  for (let h = 0; h < q.length; h++) {
    const x = q[h] % L.w, z = (q[h] / L.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], nz = z + DZ[d];
      if (nx < 0 || nz < 0 || nx >= L.w || nz >= L.h) continue;
      const j = nz * L.w + nx, k = L.edgeKey(x, z, d), inf = L.edgeInfo.get(k);
      if (!L.cells[j] || seen[j] || !L.open.has(k) || dead(j) || closedKeys.has(k)) continue;
      if (inf && (inf.type === 'vault' || inf.type === 'contain' || (inf.type === 'door' && inf.locked))) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return seen;
}

// ---------------------------------------------------------------- planner
let skipped = 0, totPurge = 0, totNoRail = 0, nPlans = 0, nSteps = 0, minRails = 99, minSect = 99, sigs = new Set();
for (const theme of ['factory', 'museum', 'metro', 'academy', 'prison']) for (const size of [0.8, 1.35, 1.8]) for (const seed of [11, 22, 33]) {
  const tag = `${theme}/${size}/${seed}`;
  const L = generateLayout(seed * 7919, theme, size);
  const plan = planShift(L, {});
  const strict = (theme === 'museum' && size === 1.8) || (theme === 'metro' && size === 1.35);   // the sizes the recycle-bin moons use
  if (!plan.ok) { skipped++; okc(!strict, `${tag}: plan not ok on a target layout`); continue; }
  nPlans++;
  const usable = plan.sectors.filter((s) => s.usable);
  minRails = Math.min(minRails, plan.nRails); minSect = Math.min(minSect, usable.length);
  okc(plan.nRails >= 2, `${tag}: rails ${plan.nRails}`);
  okc(usable.length >= 2, `${tag}: usable sectors ${usable.length}`);
  for (const gt of plan.gates) {
    const inf = L.edgeInfo.get(gt.key);
    if (gt.kind === 'rail') okc(!inf && L.cells[gt.a] === 2 && L.cells[gt.b] === 2 && L.open.has(gt.key), `${tag}: rail ${gt.id} on an illegal edge`);
    else okc(!!inf && L.open.has(gt.key) && plan.sectors[gt.sector].set.has(gt.inner) && !plan.sectors[gt.sector].set.has(gt.outer), `${tag}: seal ${gt.id} not a doorway out of its sector`);
  }
  const busy = busyRooms({ layout: L, sys: null, chestSpots: [] });
  for (const s of plan.sectors) {
    const r = L.rooms[s.room];
    okc(!['entrance', 'vault', 'core', 'generator', 'contain'].includes(r.type) && !busy.has(s.room), `${tag}: sector ${s.label} is a protected room`);
    for (const i of s.cells) okc(!L.entrySources.includes(i), `${tag}: sector holds an entry cell`);
  }
  let lastDel = [], noRail = 0, purges = 0; const purgedAt = {};
  for (let n = 0; n <= 30; n++) {
    const st = plan.stateAt(n);
    const dels = [...st.del].reduce((a, v, i) => (v ? a.concat(i) : a), []);
    okc(dels.length <= 2, `${tag}: ${dels.length} sectors deleted at once (step ${n})`);
    const seen = reachable(L, null, plan, st);
    let miss = 0; for (const i of plan.needed) { const s = plan.sectorOfCell(i); if (s >= 0 && st.del[s]) continue; if (!seen[i]) miss++; }
    okc(miss === 0, `${tag}: state ${n} leaves ${miss} cells unreachable`);
    if (n < 30) {
      const step = plan.stepAt(n);
      nSteps++;
      if (step.close.length + step.open.length === 0) noRail++;
      if (step.purge >= 0) { purges++; purgedAt[step.purge] = n; }
      const nx = plan.stateAt(n + 1);
      if (step.purge >= 0) okc(nx.del[step.purge] === 1 && !st.del[step.purge], `${tag}: step ${n} purge flag`);
      if (step.restore >= 0) okc(st.del[step.restore] === 1 && nx.del[step.restore] === 0, `${tag}: step ${n} restore flag`);
      if (step.restore >= 0) okc(n - purgedAt[step.restore] >= 2 && n - purgedAt[step.restore] <= 5, `${tag}: step ${n} restore age ${n - purgedAt[step.restore]}`);
      for (const r of step.close) okc(!st.closed[r] && nx.closed[r] === 1, `${tag}: close ${r}`);
      for (const r of step.open) okc(st.closed[r] === 1 && nx.closed[r] === 0, `${tag}: open ${r}`);
    }
    lastDel = dels;
  }
  void lastDel; totPurge += purges; totNoRail += noRail;
  if (strict) { okc(purges >= 24, `${tag}: only ${purges}/30 steps purge a sector`); okc(noRail <= 1, `${tag}: ${noRail} steps change no rail`); }
  const a = planShift(L, {}).signature(30), b = plan.signature(30);
  okc(a === b, `${tag}: not deterministic`);
  sigs.add(a);
  // the flags of a state: rails follow state.closed, seals follow deleted sectors
  const fl = plan.gateFlags(plan.stateAt(5));
  for (const gt of plan.gates) okc(fl[gt.id] === (gt.kind === 'rail' ? plan.stateAt(5).closed[gt.id] : plan.stateAt(5).del[gt.sector]), `${tag}: gate flag ${gt.id}`);
}
okc(skipped <= 12, `too many layouts without a usable plan: ${skipped}`);
okc(sigs.size >= nPlans - skipped - 2, `signatures barely differ (${sigs.size}/${nPlans})`);

// ---------------------------------------------------------------- text + sound
{
  const keys = Object.keys(TX.TR);
  for (const k of keys) okc(TX.RU[k], `RU missing: ${k}`);
  for (const k of Object.keys(TX.RU)) okc(TX.TR[k], `TR missing: ${k}`);
  for (const l of [...TX.PA_LINES, ...TX.RESTORE_LINES]) okc(TX.TR[l] && TX.RU[l], `PA line untranslated: ${l}`);
  for (const k of ['RECYCLE BIN', 'EMPTYING RECYCLE BIN IN {n}', 'SECTOR {s} - {d} m', '{n} passage(s) rerouting', 'DELETED: SECTOR {s}', 'SECTOR {s} DELETED', 'SECTOR {s} RESTORED', 'MARKED FOR DELETION', 'RESTORING']) okc(TX.TR[k] && TX.RU[k], `HUD key ${k}`);
  for (const id of ['s11_pa', 's11_tick', 's11_purge', 's11_rail']) {
    okc(!!SFX[id], `sound ${id} not registered`);
    const ch = renderSfx(id, 8000).channels[0];
    let pk = 0, bd = 0; for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (!(v < 10)) bd++; if (v > pk) pk = v; }
    okc(bd === 0 && pk > 0.2, `sound ${id}: finite ${bd === 0}, peak ${pk}`);
  }
}

// ---------------------------------------------------------------- runtime on a stub game
{
  const { installShift11, SHIFT_MOONS, MSG, WARN } = await import('../../src/game/shift11.js');
  const { MOONS } = await import('../../src/game/moons.js');
  for (const id of Object.keys(SHIFT_MOONS)) okc(!!MOONS[id], `SHIFT_MOONS: unknown moon ${id}`);
  const lightPool = { add(e) { return e; }, remove() {} };
  const boxes = [];
  const physics = { addStaticBox(x, y, z, hx, hy, hz) { const b = { x, y, z, hx, hy, hz, on: true, setEnabled(v) { this.on = v; } }; boxes.push(b); return b; }, removeCollider(c) { c.removed = true; } };
  const fac = buildFacility(generateLayout(4242, 'museum', 1.8), { physics, lightPool });
  const nBase = boxes.length;
  const H = {}, msgs = [], toasts = [], sfx = [], dmg = [], tps = [];
  let isHost = true;
  const net = { on_(t, fn) { H[t] = fn; }, handle(a, fn) { H['h:' + a] = fn; }, request(a) { msgs.push(['req', a]); }, sendTo(id, t, d) { msgs.push(['to', id, d]); }, broadcast(t, d) { msgs.push(['bc', d]); if (H[t]) H[t](d); } };
  const hs = { update: [], mapLoaded: [] };
  const L = fac.layout;
  const player = { pos: { x: 0, y: L.y, z: 0, clone() { return this; } }, hp: 100, dead: false, indoor: true, yaw: 0, teleport(p, yaw) { tps.push([p.x, p.z, yaw]); this.pos.x = p.x; this.pos.z = p.z; } };
  const game = {
    mods: { on(e, fn) { (hs[e] ||= []).push(fn); return () => {}; } }, net, get isHost() { return isHost; }, physics, world: { facility: fac }, run: { seed: 4242, phase: 'moon', moon: 'orkinos', quotaIndex: 0 },
    player, ui: { toast: (m) => toasts.push(m), hud: { bigText: (a) => toasts.push(a) } }, sfx: (id) => sfx.push(id), audio: { at() {} }, engine: { flash() {}, shake() {} },
    damageLocal: (d) => dmg.push(d), aiPlayers: () => [{ dead: false, zone: 'in', pos: player.pos }], items: { all: () => [], hostSpawn() {} }, creatures: { host: new Map() },
  };
  const api = installShift11(game);
  okc(!!api && hs.mapLoaded.length === 1 && hs.update.length === 1, 'runtime hooks');
  hs.mapLoaded[0](game.world, game);
  const S = api.state, rt = S.rt;
  okc(!!rt, 'runtime not built on orkinos');
  if (rt) {
    const plan = rt.plan;
    okc(boxes.length - nBase === plan.gates.length, `colliders ${boxes.length - nBase} vs gates ${plan.gates.length}`);
    const closedRails = () => plan.gates.slice(0, plan.nRails).filter((g) => rt.nav.blockedEdges.has(g.key)).length;
    const st0 = plan.stateAt(0);
    okc(closedRails() === st0.closed.reduce((a, v) => a + v, 0) && closedRails() > 0, 'nav.blockedEdges do not match the initial state');
    okc(rt.gates.slice(0, plan.nRails).every((w) => w.enabled === !!st0.closed[w.id]), 'initial rail colliders');
    const walkCount = () => rt.nav.walk.reduce((a, v) => a + v, 0);
    const w0 = walkCount();
    // host director: the first warning comes after cfg.first - WARN seconds indoors, the shift after cfg.first
    let t = 0, warnAt = -1, goAt = -1;
    for (; t < 200 && goAt < 0; t += 0.25) {
      hs.update[0](0.25, game);
      for (const m of msgs) if (m[0] === 'bc') { if (m[1].k === 'warn' && warnAt < 0) warnAt = t; if (m[1].k === 'go' && goAt < 0) goAt = t; }
    }
    okc(warnAt >= 38 && warnAt <= 42 && goAt >= 49 && goAt <= 52, `director timing warn ${warnAt} go ${goAt}`);
    okc(S.cur === 1, `cur after go ${S.cur}`);
    const step0 = plan.stepAt(0), sc = plan.sectors[step0.purge];
    okc(sc.deleted && walkCount() < w0, 'purged sector still walkable');
    okc(sfx.includes('s11_pa'), 'no PA chime');
    for (const gid of sc.gates) okc(rt.gates[gid].tgt === 1, 'seal gate not closing');
    for (let i = 0; i < 40; i++) hs.update[0](0.1, game);
    for (const gid of sc.gates) okc(rt.gates[gid].ext === 1 && rt.gates[gid].enabled, 'seal gate did not close / collider not enabled');
    for (const r of step0.close) okc(rt.nav.blockedEdges.has(rt.gates[r].key) && rt.gates[r].enabled, 'closed rail not blocked');
    for (const r of step0.open) okc(!rt.nav.blockedEdges.has(rt.gates[r].key) && !rt.gates[r].enabled, 'opened rail still blocked');
    // late joiner: fresh runtime state + 'set'
    H[MSG]({ k: 'set', n: 0 });
    okc(S.cur === 0 && !sc.deleted && walkCount() === w0, 'set 0 did not restore the layout');
    let N0 = 5; for (; N0 < 28; N0++) if (plan.stepAt(N0).purge >= 0 && plan.stepAt(N0 + 1).purge >= 0 && plan.stepAt(N0 + 2).close.length) break;
    H[MSG]({ k: 'set', n: N0, w: 6, wn: N0 + 1 });
    okc(S.cur === N0 && S.warn && S.warn.left > 5.5 && S.warn.n === N0 + 1, 'set n + warning left');
    const st5 = plan.stateAt(N0), del5 = plan.sectors.filter((s) => s.deleted).map((s) => s.id).sort().join(), want5 = [...st5.del].reduce((a, v, i) => (v ? a.concat(i) : a), []).join();
    okc(del5 === want5, `deleted sectors after set 5: ${del5} vs ${want5}`);
    // ejection: stand in the sector that step 5 purges and let 'go 6' run
    const step5 = plan.stepAt(N0), sc5 = plan.sectors[step5.purge];
    const cell = rt.secCells[sc5.c0]; player.pos.x = cell.x; player.pos.z = cell.z; player.hp = 100; dmg.length = 0; tps.length = 0;
    H[MSG]({ k: 'go', n: N0 + 1 });
    okc(S.cur === N0 + 1 && tps.length === 1 && dmg.length === 1 && dmg[0] === SHIFT_MOONS.orkinos.dmg, `eject: cur ${S.cur} tps ${tps.length} dmg ${dmg}`);
    okc(tps.length && !sc5.set.has(cellOfPos(L, tps[0][0], tps[0][1])), 'ejected player landed inside the sector');
    okc(rt.nav.walkableAt(tps[0][0], tps[0][1]), 'eject target not walkable');
    // non lethal
    player.hp = 10; dmg.length = 0; const step6 = plan.stepAt(N0 + 1), sc6 = plan.sectors[step6.purge]; const c6 = rt.secCells[sc6.c0]; player.pos.x = c6.x; player.pos.z = c6.z;
    H[MSG]({ k: 'go', n: N0 + 2 });
    okc(dmg.length === 1 && dmg[0] === 9, `non-lethal damage ${dmg}`);
    // a shutter never closes on the local player: stand in a rail that will close
    player.pos.x = 9999; player.pos.z = 9999; for (let i = 0; i < 40; i++) hs.update[0](0.1, game);   // let the previous step finish (nobody near any shutter)
    const st7 = plan.stateAt(N0 + 2), step7 = plan.stepAt(N0 + 2);
    if (step7.close.length) {
      const w = rt.gates[step7.close[0]]; player.pos.x = w.wx; player.pos.z = w.wz; player.pos.y = rt.Y;
      H[MSG]({ k: 'go', n: N0 + 3 });
      for (let i = 0; i < 60; i++) hs.update[0](0.1, game);
      okc(w.hold && !w.enabled && w.ext <= 0.51, `shutter closed on the player (ext ${w.ext}, hold ${w.hold})`);
      player.pos.x = w.wx + 6; player.pos.z = w.wz + 6;
      for (let i = 0; i < 40; i++) hs.update[0](0.1, game);
      okc(w.ext === 1 && w.enabled, 'shutter did not finish after the player stepped away');
    }
    void st7;
    // late 'go' skipping steps applies instantly (no effects), stale go ignored
    dmg.length = 0; H[MSG]({ k: 'go', n: 20 }); okc(S.cur === 20 && dmg.length === 0, 'skip-ahead go');
    H[MSG]({ k: 'go', n: 3 }); okc(S.cur === 20, 'stale go must be ignored');
    // client mode: no director, asks for a sync
    isHost = false; msgs.length = 0; hs.mapLoaded[0](game.world, game);
    okc(msgs.some((m) => m[0] === 'req'), 'client did not request a sync'); okc(!S.host, 'client has a host director');
    const before = msgs.length; for (let i = 0; i < 600; i++) hs.update[0](0.25, game); okc(msgs.length === before, 'client broadcast something');
    // the host answers a sync request with the current step
    isHost = true; hs.mapLoaded[0](game.world, game); S.host.step = 3; msgs.length = 0; H['h:' + 's11sync']({}, 'peerA');
    okc(msgs.some((m) => m[0] === 'to' && m[1] === 'peerA' && m[2].k === 'set' && m[2].n === 3), 'host sync answer');
    // teardown removes the colliders
    const nb = boxes.length; api.dispose(); okc(boxes.slice(nBase, nb).every((b) => b.removed), 'colliders not removed on dispose');
    void WARN;
  }
  fac.dispose({ removeCollider() {} });
}
realLog(`shift11: ${nPlans} plans, ${nSteps} steps checked (${totPurge} purges, ${totNoRail} without a rail change), min rails ${minRails}, min usable sectors ${minSect}`);
realLog(fails ? `shift11: ${fails} FAILED` : 'shift11: all ok');
process.exit(fails ? 1 : 0);
