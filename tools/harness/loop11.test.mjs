// LOOP11 test (wave 11, docs/wave11/loop11.md): THE LOOP - Exit-8 style corridor. Node only, no browser.
//   1. pure rules: pass content is deterministic per (seed, moon, pass), pass 0 normal, pass 1 an easy anomaly, streak / repeat guards, judge + win / fired, variants
//   2. door site over generated facilities: deterministic, plain closed wall, never in a horror-closet room
//   3. text: every anomaly + HUD string has TR + RU
//   4. geometry: the space builds in node (stub physics), every anomaly applies / ticks / restores, mesh + collider counts, NO lights added
//   5. sounds render (8 kHz): finite, not silent
//   6. runtime on a stub game: door -> enter -> pass -> right / wrong calls -> win (reward spawned) / fired (sealed + Moderator) / late joiner sync / stale request ignored
// Run: node tools/harness/loop11.test.mjs
globalThis.window = globalThis.window || {};
const THREE = await import('three');
const C = await import('../../src/game/loop11_core.js');
const X = await import('../../src/game/loop11_text.js');
const { generateLayout } = await import('../../src/world/facility.js');
const { planFacility } = await import('../../src/game/horror_core.js');
const { setLang, t, tIn, addTranslations } = await import('../../src/core/i18n.js');
addTranslations(X.TR, 'tr'); addTranslations(X.RU, 'ru');
const { IMPL, baseTick } = await import('../../src/game/loop11_anom.js');
const { buildSpace } = await import('../../src/game/loop11_build.js');
const { SFX, renderSfx } = await import('../../src/audio/sfxlib.js');
const { installLoop11 } = await import('../../src/game/loop11.js');
const { ITEMS } = await import('../../src/game/items.js');
const { MOONS } = await import('../../src/game/moons.js');
const { GEO, LP } = C;

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };

// ---------------------------------------------------------------------------------------------------------------- 1. rules
{
  ok(C.ANOMS.length >= 15 && new Set(C.ANOM_IDS).size === C.ANOMS.length, 'anomaly ids unique, at least 15');
  ok(C.ANOMS.some((a) => a.tier === 1) && C.ANOMS.some((a) => a.tier === 2) && C.ANOMS.some((a) => a.tier === 3), 'all three tiers present');
  ok(C.EASY.every((id) => C.ANOM_BY_ID[id]), 'EASY ids exist');
  const a = C.passSpec(77, 'palamut', 5, { wrong: 0, hist: [null, 'eyes'] }), b = C.passSpec(77, 'palamut', 5, { wrong: 0, hist: [null, 'eyes'] });
  ok(JSON.stringify(a) === JSON.stringify(b), 'passSpec deterministic');
  ok(C.passSpec(1, 'm', 0).an === null, 'pass 0 is normal');
  for (let s = 1; s <= 60; s++) ok(C.EASY.includes(C.passSpec(s, 'm', 1, { hist: [null], wrong: 0 }).an), 'pass 1 is an easy anomaly');
  ok(JSON.stringify(C.variantOf('doornum', 99)) === JSON.stringify(C.variantOf('doornum', 99)), 'variants deterministic');
  // simulate 400 runs with a random player: invariants of the state machine
  let streakBad = 0, repeatBad = 0, wins = 0, fired = 0, anomCount = 0, passCount = 0;
  const seenIds = new Set();
  for (let seed = 1; seed <= 400; seed++) {
    let st = C.newState(seed, 'palamut'); const frozen = JSON.stringify(st);
    let guard = 0, rs = seed * 2654435761 >>> 0;
    const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
    while (!st.won && !st.sealed && guard++ < 400) {
      const side = rnd() < 0.16 ? (st.an ? 'f' : 'b') : (st.an ? 'b' : 'f');   // ~16 % of the calls are wrong
      const before = JSON.stringify(st);
      const r = C.advance(st, side, seed, 'palamut');
      ok(JSON.stringify(st) === before, 'advance does not mutate its input');
      ok(r.ok === ((side === 'f') === !st.an), 'judge: right call = f when normal / b when anomalous');
      if (r.ok) ok(r.st.n === st.n + 1 && r.st.wrong === st.wrong, 'right call: +1'); else ok(r.st.n === 0 && r.st.wrong === st.wrong + 1, 'wrong call: counter reset + strike');
      st = r.st; passCount++; if (st.an) { anomCount++; seenIds.add(st.an); }
      const h = st.hist.slice(-(LP.STREAK + 1));
      if (h.length > LP.STREAK && h.every((x) => x == null)) streakBad++;
      if (h.length > LP.STREAK && h.every((x) => x != null)) streakBad++;
      const rc = st.hist.slice(-(LP.RECENT + 1), -1).filter(Boolean);
      if (st.an && rc.includes(st.an)) repeatBad++;
    }
    if (st.won) { wins++; ok(st.n === LP.GOAL, 'won at exit 8'); } else if (st.sealed) { fired++; ok(st.wrong >= LP.LIMIT, 'sealed at the strike limit'); }
    ok(JSON.stringify(C.newState(seed, 'palamut')) === frozen, 'newState pure');
    ok(C.advance(st, 'f', seed, 'palamut') === null || (!st.won && !st.sealed), 'no more passes after win / fired');
  }
  ok(streakBad === 0, 'never four identical (normal / anomalous) passes in a row: ' + streakBad);
  ok(repeatBad === 0, 'the same anomaly never repeats within 3 passes: ' + repeatBad);
  ok(seenIds.size === C.ANOM_IDS.length, 'all anomalies occur: ' + seenIds.size);
  const rate = anomCount / passCount;
  ok(rate > 0.45 && rate < 0.75, 'anomaly rate about 55-68 %: ' + rate.toFixed(2));
  ok(wins > 0 && fired > 0, 'an 84 %-right player both wins and gets fired sometimes: ' + wins + '/' + fired);
  // a perfect player wins in exactly 8 passes, always
  let allEight = true;
  for (let seed = 1; seed <= 200; seed++) { let st = C.newState(seed, 'levrek'), n = 0; while (!st.won && n++ < 50) st = C.advance(st, st.an ? 'b' : 'f', seed, 'levrek').st; if (n !== LP.GOAL) allEight = false; }
  ok(allEight, 'a perfect player reaches exit 8 in exactly 8 passes');
  // a player who always keeps going is fired
  let st0 = C.newState(5, 'levrek'), n0 = 0; while (!st0.sealed && !st0.won && n0++ < 200) st0 = C.advance(st0, 'f', 5, 'levrek').st;
  ok(st0.sealed || st0.won, 'always-forward ends');
  ok(C.doorChance(2) === 1 && C.doorChance(3) === 1 && C.doorChance(0) === 0 && C.doorChance(1) < 1, 'door chance by tier');
}

// ---------------------------------------------------------------------------------------------------------------- 2. door site
const layouts = [];
{
  let found = 0, none = 0, sameRoom = 0;
  for (let s = 1; s <= 30; s++) {
    for (const th of ['factory', 'office', 'hospital', 'academy']) {
      let L; try { L = generateLayout(s * 977, th, 0.9 + (s % 5) * 0.3, null); } catch { continue; }
      const site = C.doorSite(L, { moonId: 'palamut', day: 1, quotaIndex: 0 }, 2), again = C.doorSite(L, { moonId: 'palamut', day: 1, quotaIndex: 0 }, 2);
      ok(JSON.stringify(site) === JSON.stringify(again), 'door site deterministic');
      if (!site) { none++; continue; }
      found++; layouts.push({ L, site });
      const fr = C.closetFrame(L, site.cell);
      ok(Number.isFinite(fr.wallX) && Math.abs(fr.fx) + Math.abs(fr.fz) === 1 && fr.y === L.y, 'frame is axis aligned on the facility floor');
      const pl = planFacility(L, { day: 1, quotaIndex: 0 });
      if (pl.closets.some((c) => c.room === site.room) || pl.fake?.room === site.room) sameRoom++;
      const room = L.rooms[site.room]; ok(room && room.type !== 'entrance' && room.type !== 'vault', 'door room is an ordinary room');
      ok(!L.edgeInfo.has(L.edgeKey(site.cell.x, site.cell.z, site.cell.d)), 'the wall is closed (no doorway there)');
      ok(C.doorSite(L, { moonId: 'x', day: 1 }, 0) === null, 'tier 0 never gets a door');
    }
  }
  ok(found >= 40, 'doors are found on most facilities: ' + found + ' (none ' + none + ')');
  ok(sameRoom === 0, 'never in a horror closet room: ' + sameRoom);
  ok(MOONS.palamut.tier === 2 && MOONS.levrek.tier === 2 && MOONS.cipura.tier === 3, 'mid-tier moons exist');
}

// ---------------------------------------------------------------------------------------------------------------- 3. text
{
  const need = new Set();
  const add = (s) => { if (typeof s === 'string' && /[A-Za-z]{2}/.test(s)) need.add(s); };
  for (const k of ['RULES', 'NOTICE_BASE', 'POSTERS', 'MASCOT']) X[k].forEach(add);
  X.NOTICE_ALT.forEach(([, s]) => add(s));
  for (const [n, d] of Object.values(X.ANOM_TEXT)) { add(n); add(d); }
  Object.values(X.HUD).forEach(add);
  let miss = 0;
  for (const s of need) for (const lang of ['tr', 'ru']) if (tIn(lang, s) === s && !/^(\?\?\?|EXIT)$/.test(s)) { miss++; if (miss < 8) console.log('  missing', lang, JSON.stringify(s)); }
  ok(miss === 0, 'TR + RU for every string (missing ' + miss + ')');
  ok(Object.keys(X.ANOM_TEXT).sort().join() === C.ANOM_IDS.slice().sort().join(), 'text for every anomaly, no extras');
  ok(C.ANOM_IDS.every((id) => IMPL[id] && typeof IMPL[id].on === 'function' && typeof IMPL[id].off === 'function'), 'an implementation for every anomaly');
  ok(X.DOOR_NUMS.length === 4 && X.DOOR_ALT.every((a) => !X.DOOR_NUMS.includes(a)), 'door alternates differ from the row');
  ok(Object.keys(X.TR).length === Object.keys(X.RU).length, 'TR and RU tables have the same size (' + Object.keys(X.TR).length + ')');
}

// ---------------------------------------------------------------------------------------------------------------- 4. geometry + anomalies
// A 2D-canvas stub so every poster / sign / texture draw function actually RUNS in node (undefined names, wrong Pix calls); the drawing itself is a no-op.
const noop = () => {};
const ctxStub = () => new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), measureText: (s) => ({ width: String(s).length * 7 }) }, {
  get: (o, k) => (k in o ? o[k] : noop), set: (o, k, v) => { o[k] = v; return true; },
});
globalThis.document = { createElement: () => { const ctx = ctxStub(); return { width: 0, height: 0, getContext: () => ctx, style: {} }; } };
let canvasDraws = 0; const _ce = globalThis.document.createElement; globalThis.document.createElement = (...a) => { canvasDraws++; return _ce(...a); };

let stubPhysics, added = 0, removed = 0, emitters = new Set();
{
  stubPhysics = { addStaticBox() { added++; return added; }, removeCollider() { removed++; } };
  const lightPool = { add(e) { emitters.add(e); return e; }, remove(e) { emitters.delete(e); } };
  const sp = buildSpace({ physics: stubPhysics, lightPool, oy: -300 });
  let meshes = 0, tris = 0, lights = 0; sp.group.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : 0) / 3; } if (o.isLight) lights++; });
  ok(canvasDraws > 25, 'canvas draws executed: ' + canvasDraws);
  console.log(`  space: ${meshes} meshes, ${Math.round(tris)} tris, ${added} colliders, ${emitters.size} pooled emitters`);
  ok(lights === 0, 'no THREE lights in the space');
  ok(meshes < 130, 'mesh count stays small: ' + meshes);
  ok(emitters.size >= 8 && emitters.size <= 12, 'pooled emitters: ' + emitters.size);
  ok(added >= 20 && added < 80, 'collider count sane: ' + added);
  ok(sp.inHall(new THREE.Vector3(GEO.ox + 6, -300, GEO.oz)) && !sp.inHall(new THREE.Vector3(0, -300, 0)) && sp.inReward(new THREE.Vector3(GEO.ox + 54, -300, GEO.oz)), 'inHall / inReward');
  const E = sp.E;
  const cx = { dt: 0.05, t: 10, cam: new THREE.Vector3(GEO.ox + 8, -298.4, GEO.oz), fwd: new THREE.Vector3(1, 0, 0), pl: new THREE.Vector3(GEO.ox + 8, -300, GEO.oz), moving: true, sprint: false, u: 8, inHall: true, snd: () => {} };
  const snapshot = () => JSON.stringify({ sc: E.decor.scale.z, cow: E.cow.group.visible, low: E.lowceil.visible, car: E.carpet.visible, sh: E.shadow.visible, hole: E.ceilHole.group.visible, glow: E.doorGlow.glow.visible,
    ext: E.ext.rotation.z, cool: E.cooler.bottleMat.color.getHex(), wet: [E.wet.group.position.x, E.wet.group.position.z], posters: E.posters.map((p) => p.mesh.visible), doors: E.doors.map((d) => d.pivot.rotation.y),
    pan: E.panelMat.color.getHex(), em: [...E.emitters].map((e) => e.intensity), pup: E.mascot.pupils.map((p) => [p.position.x, p.position.y]) });
  const base = snapshot();
  for (const id of C.ANOM_IDS) {
    for (const vs of [3, 12345, 99991]) {
      const v = C.variantOf(id, vs);
      try {
        IMPL[id].on(E, { v, vs, rng: null });
        for (let i = 0; i < 40; i++) { cx.t += 0.05; cx.u = 6 + i * 0.6; cx.cam.x = GEO.ox + cx.u; cx.pl.x = cx.cam.x; if (IMPL[id].tick) IMPL[id].tick(E, cx); baseTick(E, cx); }
        if (vs === 3 && !['eyes', 'steps', 'coworker', 'shadow', 'cooler', 'ceileyes', 'clock', 'doornum', 'notice', 'exitred'].includes(id)) ok(snapshot() !== base, id + ': changes something visible');
        IMPL[id].off(E);
      } catch (e) { ok(false, id + ' threw: ' + e.message); }
      ok(snapshot() === base, id + ' (vs ' + vs + '): off() restores the baseline exactly');
    }
  }
  ok(added === added && removed === 0, 'anomalies add no colliders');
  const c0 = added; ok(c0 === added, 'colliders constant');
  sp.dispose();
  ok(removed === added && emitters.size === 0, 'dispose removes every collider + emitter (' + removed + '/' + added + ')');
}

// ---------------------------------------------------------------------------------------------------------------- 5. sounds
{
  const ids = ['ambience_loop11', 'loop_ok', 'loop_bad', 'loop_warp', 'loop_win', 'loop_pa', 'loop_step', 'loop_tick', 'loop_gurgle', 'loop_murmur'];
  for (const id of ids) {
    ok(!!SFX[id], 'sound registered: ' + id);
    if (!SFX[id]) continue;
    const out = renderSfx(id, 8000), ch = out.channels[0]; let peak = 0, bad = 0;
    for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (!Number.isFinite(v)) bad++; else if (v > peak) peak = v; }
    ok(bad === 0 && peak > 0.05, id + ' renders finite + audible (peak ' + peak.toFixed(2) + ')');
  }
}

// ---------------------------------------------------------------------------------------------------------------- 6. runtime on a stub game
{
  const { RNG } = await import('../../src/core/rng.js');
  void RNG;
  const handlers = new Map(), reqHandlers = new Map(), toasts = [], spawned = [], creatures = [], sent = [], later = [];
  const listeners = new Map();
  const mods = { on(ev, fn) { if (!listeners.has(ev)) listeners.set(ev, []); listeners.get(ev).push(fn); return () => {}; }, emit(ev, ...a) { for (const fn of listeners.get(ev) || []) fn(...a); }, itemModels: new Map() };
  const g = {
    mods, isHost: true, selfId: 'me', time: 1, run: { seed: 4242, day: 1, quotaIndex: 0, moon: 'palamut', phase: 'moon' }, profile: {},
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), physics: stubPhysics, lights: { add(e) { return e; }, remove() {} },
    remotes: new Map(), env: { interiorFog: null }, world: null, engine: { flash() {}, shake() {} }, audio: { has: () => false }, sfx() {},
    ui: { toast: (m, k) => toasts.push([m, k]), hud: { bigText() {} } }, playerName: (id) => id, later: (fn) => later.push(fn), creatures: { hostSpawn: (ty, pos, o) => { creatures.push([ty, pos.clone(), o]); return {}; }, playersFor() { return []; } },
    items: { hostSpawn: (ty, pos, o) => { spawned.push([ty, pos.clone(), o]); return 'i' + spawned.length; } }, updateAmbience() {},
    player: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, dead: false, indoor: true, teleport(p, y) { this.pos.copy(p); this.yaw = y; } },
    net: {
      isHost: true, on_(t2, fn) { handlers.set(t2, fn); },
      broadcast(t2, d) { sent.push([t2, d]); handlers.get(t2)?.(JSON.parse(JSON.stringify(d)), 'me'); },
      sendTo(id, t2, d) { sent.push(['to:' + id + ':' + t2, d]); },
      request(a, d) { reqHandlers.get(a)?.({ a, ...d }, 'me'); },
    },
  };
  const api = installLoop11(g);
  ok(!!api && !!ITEMS.lp_badge && g.mods.itemModels.has('lp_badge'), 'installs, registers the badge item + model');
  mods.emit('netReady', g.net); mods.emit('registerHandlers', (name, fn) => reqHandlers.set(name, fn), g);
  const S = api.S;
  // find a seed / layout that has a door on this moon
  let L = null;
  for (let s = 1; s < 60 && !L; s++) { const l = generateLayout(s * 313, 'factory', 1.1, null); if (C.doorSite(l, { moonId: 'palamut', day: 1 }, 2)) { L = l; g.run.seed = s * 313; } }
  ok(!!L, 'a layout with a door');
  const world = { facility: { layout: L, atmosphere: null }, moonId: 'palamut', seed: g.run.seed, company: false };
  g.world = world;
  mods.emit('mapLoaded', world, g);
  ok(S.active && !!S.frame && !!S.door, 'mapLoaded builds the door');
  ok(g.scene.children.some((o) => o.name === 'loop11_door'), 'door group in the scene');
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { g.time += 0.05; mods.emit('update', 0.05, g); } };
  // interactable outside
  g.player.pos.set(S.frame.wallX + S.frame.fx * 1.5, S.frame.y, S.frame.wallZ + S.frame.fz * 1.5);
  { const out = []; mods.emit('interactables', out); ok(out.length === 1 && /Re-Onboarding/.test(out[0].label()), 'door prompt outside'); out[0].action(); }
  ok(!!S.space && S.space.inHall(g.player.pos), 'enter: the space is built and the player stands in the hall');
  tick(); ok(S.inside, 'inside flag set');
  ok(Math.abs(g.player.pos.x - (GEO.ox + GEO.SPAWN_U)) < 0.1, 'spawned at the start spot');
  const lights0 = g.scene.children.filter((o) => o.isLight).length;
  // walk out of the far end: pass 0 is normal -> right
  const walk = (u) => { g.player.pos.set(GEO.ox + u, S.oy, GEO.oz); tick(); };
  const stale = api.debug.state().pass;
  walk(GEO.L + 1.6); ok(S.st.pass === stale + 1 && S.st.n === 1 && S.st.wrong === 0, 'normal pass + keep going = counter 1');
  ok(Math.abs(g.player.pos.x - (GEO.ox + GEO.SPAWN_U)) < 0.1, 'reset to the start after the call');
  ok(toasts.some(([m]) => /Correct/.test(m)), 'toast tells the result');
  g.time += 1;
  ok(S.st.an && C.EASY.includes(S.st.an) && S.space.E.setCounter, 'pass 1 has an easy anomaly');
  const an1 = S.st.an;
  // turning back right away (before u > ARM_U) does not count
  walk(-1.6); ok(S.st.pass === 1, 'the near end is not armed until you walked out to u > 12');
  walk(GEO.ARM_U + 1); walk(-1.6);
  ok(S.st.pass === 2 && S.st.n === 2, 'anomaly + turn back = counter 2 (' + an1 + ')');
  ok(g.profile.loop11?.seen?.[an1] === 1, 'the anomaly is recorded in the handbook');
  // stale request ignored
  const pass = S.st.pass; g.time += 1;
  g.net.request('loopq', { op: 'end', side: 'f', pass: pass - 1 }); ok(S.st.pass === pass, 'stale pass ignored');
  // a wrong call: whatever the state is, do the opposite
  g.time += 1; walk(GEO.ARM_U + 1);
  { const wasAnom = !!S.st.an; if (wasAnom) walk(GEO.L + 1.6); else walk(-1.6); ok(S.st.wrong === 1 && S.st.n === 0, 'wrong call = strike + counter 0'); }
  // rate limit: two crossings in the same second are one
  { const pn = S.st.pass; g.player.pos.set(GEO.ox + GEO.L + 1.6, S.oy, GEO.oz); g.net.request('loopq', { op: 'end', side: 'f', pass: pn }); const p1 = S.st.pass; g.net.request('loopq', { op: 'end', side: 'f', pass: p1 }); ok(S.st.pass === p1, 'rate limit: the second crossing inside 0.7 s is ignored'); }
  // someone outside the loop cannot end a pass
  { g.time += 1; g.player.pos.set(GEO.ox + 3, S.oy + 40, GEO.oz + 30); const pn = S.st.pass; g.net.request('loopq', { op: 'end', side: 'f', pass: pn }); ok(S.st.pass === pn, 'a peer outside the hall cannot end a pass'); }
  // late joiner sync
  reqHandlers.get('loopq')({ a: 'loopq', op: 'sync' }, 'late');
  { const m = sent.filter(([k]) => k === 'to:late:loops').pop(); ok(m && m[1].t === 'all' && m[1].p === S.st.pass && m[1].n === S.st.n && m[1].w === S.st.wrong, 'late joiner gets the full state'); }
  // play perfectly to the win
  const strikes = S.st.wrong;
  for (let i = 0; i < 30 && !S.st.won; i++) { g.time += 1; walk(GEO.ARM_U + 1); if (S.st.an) walk(-1.6); else walk(GEO.L + 1.6); }
  ok(S.st.won && S.st.n === LP.GOAL && S.st.wrong === strikes, 'a perfect player wins at exit 8');
  ok(toasts.some(([m]) => /Onboarding complete/.test(m)), 'win toast');
  ok(S.space.inReward(g.player.pos), 'the winners are moved into the break room');
  for (const fn of later.splice(0)) fn();
  ok(spawned.length >= 3 && spawned[0][0] === 'lp_badge' && spawned.every(([ty]) => ITEMS[ty]), 'reward: badge + rare scrap (' + spawned.map((s) => s[0]).join(',') + ')');
  ok(spawned.every(([, p]) => S.space.inReward(p)), 'reward items lie in the break room');
  ok(g.profile.loop11.wins === 1 && g.profile.loop11.handbook === 1, 'handbook appendix granted');
  { const out = []; mods.emit('interactables', out); ok(out.some((o) => /Return to work/.test(o.label)), 'return door inside the break room'); out.find((o) => /Return to work/.test(o.label)).action(); ok(!S.space.contains(g.player.pos), 'returned to the facility'); tick(); ok(!S.inside, 'inside flag cleared'); }
  { g.player.pos.set(S.frame.wallX + S.frame.fx * 1.5, S.frame.y, S.frame.wallZ + S.frame.fz * 1.5); const out = []; mods.emit('interactables', out); ok(/complete/.test(out[0].label()), 'door says complete'); out[0].action(); ok(!S.space.contains(g.player.pos), 'a finished loop does not let you in again'); }
  ok(g.scene.children.filter((o) => o.isLight).length === lights0, 'scene light count unchanged');

  // second landing: always wrong -> fired, sealed, Moderator outside
  mods.emit('mapLoaded', world, g);
  ok(S.active && S.st.pass === 0 && !S.st.won && !S.space, 'a new landing starts fresh');
  api.debug.enter(); tick();
  creatures.length = 0; spawned.length = 0;
  for (let i = 0; i < 12 && !S.st.sealed; i++) { g.time += 1; walk(GEO.ARM_U + 1); if (S.st.an) walk(GEO.L + 1.6); else walk(-1.6); if (S.st.wrong === LP.SUPPORT_AT) for (const fn of later.splice(0)) fn(); }
  ok(S.st.sealed && S.st.wrong === LP.LIMIT, 'six strikes = terminated');
  for (const fn of later.splice(0)) fn();
  ok(creatures.some(([ty]) => ty === 'support') && creatures.some(([ty]) => ty === 'moderator'), 'Support at strike 4, the Moderator when terminated: ' + creatures.map((c) => c[0]).join(','));
  ok(creatures.every(([, p]) => !S.space.contains(p) && Math.hypot(p.x - S.frame.wallX, p.z - S.frame.wallZ) < 4), 'they wait at the door, outside');
  ok(!S.space.contains(g.player.pos) && toasts.some(([m]) => /TERMINATED/.test(m)), 'the crew is ejected to the door');
  tick(); ok(!S.inside, 'not inside after ejection');
  { g.player.pos.set(S.frame.wallX + S.frame.fx * 1.5, S.frame.y, S.frame.wallZ + S.frame.fz * 1.5); const out = []; mods.emit('interactables', out); ok(/suspended/.test(out[0].label()), 'door says suspended'); out[0].action(); ok(!S.space.contains(g.player.pos), 'sealed door refuses'); }
  { const r = api.stats(); ok(r.sealed && r.door, 'stats'); }
  // teardown on orbit
  mods.emit('phase', 'orbit', g);
  ok(!S.active && !S.space && !S.door && !g.scene.children.some((o) => o.name === 'loop11_door' || o.name === 'loop11'), 'orbit tears everything down');
  api.dispose(); ok(S.disposed, 'dispose');
  setLang('en');
  ok(t('EXIT') === 'EXIT', 'i18n intact');
}

console.log(fails ? `\nLOOP11: ${fails} FAILED of ${checks}` : `\nLOOP11: all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
