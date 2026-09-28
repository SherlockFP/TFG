// FPBODY wave-2 browser verification script (body for tools/harness/headless_shots.mjs --script). WRITTEN BUT NOT RUN: the lead cancelled the headless run
// (machine overloaded), so everything in docs/wave2/fpbody.md was measured with the node harnesses (fpbody_offline / fpbody_body_offline / fpbody_smoke /
// fpbody_walk_offline / fpbody_stall_offline) instead. Run it before trusting the visuals:
//   flock /tmp/tfg-browser.lock timeout 580 node tools/harness/headless_shots.mjs --port 5264 --script tools/harness/fpbody.js --shotdir /tmp/fpbody
const g = kefal.game, p = g.player, out = { errs: [] }, errs = out.errs;
addEventListener('error', (e) => errs.push('window.error ' + e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const tick = (n = 1, dt = 1 / 60, render = false) => kefal.tick(n, dt, render);
const step = async (label, fn) => { try { await fn(); } catch (e) { errs.push(label + ': ' + String((e && e.stack) || e).slice(0, 500)); } };
const keys = new Set();
const origDown = g.input.isDown.bind(g.input);
g.input.isDown = (a) => keys.has(a) || origDown(a);
const shot = async (name) => { await wait(1300); try { await window.__shot(name); } catch (e) { errs.push('shot ' + name + ': ' + e); } };
const round = (v, d = 3) => (Number.isFinite(v) ? +v.toFixed(d) : v);
out.installed = !!g.fpbody;
out.frozen = p.frozen; if (p.frozen) p.frozen = false;
out.phase = g.run?.phase;

// ------------------------------------------------------------------------------------------------ 1. chat bubbles
await step('bubbles', async () => {
  const B = g.fpbody;
  p.teleport(V(0, 0.05, 0), 0); await tick(5);
  const r = g.ensureRemote('peerB', { name: 'Bob', level: 4, suit: 'orange' });
  r.applyState({ p: [p.pos.x + 1.5, p.pos.y, p.pos.z - 3.5], y: 0, pt: 0, f: 0 }); r.pos.copy(r.target);
  await tick(3);
  g.onChat({ text: 'hello crew, has anyone seen the boss?', n: 'Bob' }, 'peerB');
  g.onChat({ text: 'this one is a really long message that has to wrap onto two lines and then be cut off with an ellipsis because nobody reads walls of text above a head', n: 'Bob' }, 'peerB');
  g.onChat({ text: 'ZAP!', n: '✦ Bob' }, 'peerB');                 // what magic.js rewrites a typed spell word to
  await tick(8);
  out.bubbles = { list: B.bubbles('peerB'), sprites: B.bubbleSprites(), chatLogLines: document.querySelectorAll('.chat-line').length };
  // spell heard from a crewmate arrives as a HUD float text at their head
  const head = r.headPos(V()); head.y += 0.5;
  g.ui.hud.floatText(head, '✦ FIREBALL!', '#ff8844', true); await tick(3);
  const floatsNow = document.querySelectorAll('.float-text').length;
  // emote text
  r.applyState({ p: [r.target.x, r.target.y, r.target.z], y: 0, pt: 0, f: 0, e: 'dance' }); await tick(4);
  out.bubblesAfter = { list: B.bubbles('peerB').map((b) => `${b.kind}:${b.text.slice(0, 24)}`), spellAsFloatText: floatsNow };
  // distance fade
  const near = B.bubbles('peerB').map((b) => b.alpha);
  r.applyState({ p: [p.pos.x + 40, p.pos.y, p.pos.z], y: 0, pt: 0, f: 0 }); r.pos.copy(r.target); await tick(6);
  out.bubbleDistance = { near, at40m: B.bubbles('peerB').map((b) => ({ alpha: b.alpha, visible: b.visible })) };
  r.applyState({ p: [p.pos.x + 1.5, p.pos.y, p.pos.z - 3.5], y: 0, pt: 0, f: 0 }); r.pos.copy(r.target); await tick(6);
  // fade out + removal (5-9 s)
  const t0 = B.bubbles('peerB').length; let firstGone = null;
  for (let i = 0; i < 700; i++) { tick(1, 1 / 60); if (firstGone === null && B.bubbles('peerB').length < t0) firstGone = round(i / 60, 1); }
  out.bubbleExpiry = { before: t0, firstGoneAfterS: firstGone, after: B.bubbles('peerB').length, spritesLeft: B.bubbleSprites() };
  // stacked burst
  for (let i = 0; i < 5; i++) g.onChat({ text: 'msg ' + i, n: 'Bob' }, 'peerB');
  await tick(20);
  out.bubbleStack = B.bubbles('peerB').map((b) => b.text);
  g.remotes.get('peerB')?.dispose(); g.remotes.delete('peerB');
  await tick(60);
  out.bubblesAfterLeave = B.bubbleSprites();
});

// ------------------------------------------------------------------------------------------------ 2. first-person body
await step('body', async () => {
  const B = g.fpbody;
  const region = (name, ks, frames, pitch) => {
    p.pitch = pitch; for (const k of ks) keys.add(k);
    let minD = 9, inView = 0, best = null;
    for (let i = 0; i < frames; i++) { tick(1, 1 / 60); if (i > 12 && i % 6 === 0) { const b = B.bodyInfo(); minD = Math.min(minD, b.minCameraDist); if (!best || b.vertsInViewPct > best.vertsInViewPct) best = b; } }
    for (const k of ks) keys.delete(k);
    return { minCameraDist: round(minD), bodyVertsInViewPct: best?.vertsInViewPct, meshesInView: best ? best.meshesInView + '/' + best.meshes : null, headHidden: best?.headHidden, backpackHidden: best?.backpackHidden, speed: round(p.hSpeed, 2) };
  };
  p.teleport(V(-5.5, 0.05, 0), -Math.PI / 2);   // yaw -90 deg: facing +x along the ship
  await tick(10);
  out.body = { idle_pitchDown: region('idle', [], 30, -1.2) };
  out.body.walk_pitchDown = region('walk', ['forward'], 50, -1.2);
  out.body.sprint_pitchDown = region('sprint', ['forward', 'sprint'], 50, -1.2);
  p.teleport(V(-5.5, 0.05, 0), -Math.PI / 2); await tick(6);
  out.body.crouch_pitchDown = region('crouch', ['crouch'], 40, -1.2);
  await tick(30);
  p.teleport(V(-5.5, 0.05, 0), -Math.PI / 2); await tick(6);
  // jump: sample while airborne
  p.pitch = -1.2; g.input.pressed = ((o) => (a) => (a === 'jump' ? true : o(a)))(g.input.pressed.bind(g.input)); let airMin = 9, airFrames = 0;
  for (let i = 0; i < 40; i++) { tick(1, 1 / 60); if (!p.grounded) { airFrames++; airMin = Math.min(airMin, B.bodyInfo().minCameraDist); } }
  delete g.input.pressed;
  out.body.jump_pitchDown = { airFrames, minCameraDist: airMin === 9 ? null : round(airMin) };
  out.body.layers = { fpLayer: B.bodyInfo().layer, mainCameraSeesIt: B.bodyInfo().cameraSeesLayer };
  // mirror camera layers (must not render the first-person body)
  out.body.mirrorSafe = 'the mirror camera enables layers 0+1 only';
  // cost of the module (update() with the body on vs off), same ship view
  p.pitch = 0;
  const time = (n) => { const t0 = performance.now(); for (let i = 0; i < n; i++) g.update(1 / 60); return (performance.now() - t0) / n; };
  time(20);
  const on = time(120); B.opts.body = false; B.opts.bubbles = false; const off = time(120); B.opts.body = true; B.opts.bubbles = true;
  out.body.cpuMsPerFrame = { withBody: round(on, 2), withoutBody: round(off, 2) };
  // screenshot 1: looking down at the legs, mid-stride
  p.teleport(V(-3.5, 0.05, 0.8), -Math.PI / 2); p.stamina = 100; await tick(6);
  p.pitch = -1.1; keys.add('forward'); tick(26, 1 / 60); keys.delete('forward'); B.opts.freezeBody = true; tick(3, 1 / 60);
  out.body.shot1 = { yaw: round(p.yaw), pitch: p.pitch, info: B.bodyInfo() };
  await shot('legs');
  B.opts.freezeBody = false;
});

// ------------------------------------------------------------------------------------------------ 3. held items
await step('held', async () => {
  const B = g.fpbody;
  p.teleport(V(0, 0.05, 0), 0); p.pitch = 0; await tick(6);
  const rows = [];
  const give = async (type) => {
    const id = g.items.hostSpawn(type, p.pos.clone().add(V(0, 1, 0)), { holder: g.selfId, value: 10 }); await tick(6);
    const it = g.items.get(id); const i = it ? p.slots.indexOf(id) : -1;
    if (i >= 0) g.switchSlot(i);
    return { id, it, i };
  };
  const types = ['mug', 'bell', 'flashlight', 'walkie', 'boombox', 'shovel', 'pipe', 'machete', 'shotgun', 'harpoon', 'sledge', 'register', 'tv', 'lamp', 'axle', 'stackeddeck', 'fish_kefal', 'rod'];
  for (const type of types) {
    try {
      const { id, it, i } = await give(type);
      if (!it || i < 0) { rows.push(type + ': not held (' + (it ? 'no slot' : 'unknown type') + ')'); continue; }
      await tick(45, 1 / 60);                         // arms slide in and settle
      const r = B.checkHeld(it);
      rows.push(r);
      g.net.broadcast('it', { e: 'rm', id }); await tick(4);
      p.slots.forEach((s, k) => { if (s === id) p.slots[k] = null; });
    } catch (e) { rows.push(type + ': ERR ' + e); }
  }
  out.held = rows.map((r) => (typeof r === 'string' ? r : `${r.type}(${r.cls}) pen=${r.penetrationCm}cm behindNear=${r.behindNearPct}% ctrNDC=${r.centreNdc} corners=${r.cornersInFrustum}/8 palm=${r.palmToItemCm}cm shown=${r.visibleFlag}`));
  out.heldSummary = { checked: rows.filter((r) => typeof r !== 'string').length, maxPenCm: Math.max(0, ...rows.filter((r) => typeof r !== 'string').map((r) => r.penetrationCm)), anyBehindNear: rows.some((r) => typeof r !== 'string' && r.behindNearPct > 0), allCentreInView: rows.filter((r) => typeof r !== 'string').every((r) => Math.abs(r.centreNdc[0]) < 1 && Math.abs(r.centreNdc[1]) < 1) };
});

// ------------------------------------------------------------------------------------------------ 4. view model over the world (depth pass) + screenshot 2
await step('depth', async () => {
  const B = g.fpbody;
  p.teleport(V(-1.0, 0.05, -2.85), 0); p.pitch = 0; await tick(4);           // 0.65 m from the ship's -z wall, looking at it
  const wallAhead = g.physics.raycast(g.camera.position, V(0, 0, -1), 5, 0x41);
  const id = g.items.hostSpawn('register', p.pos.clone().add(V(0, 1, 0)), { holder: g.selfId, value: 50 }); await tick(6);
  const it = g.items.get(id); const i = p.slots.indexOf(id); if (i >= 0) g.switchSlot(i);
  await tick(50, 1 / 60);
  const gl = g.engine.renderer.getContext(); const orig = gl.depthRange.bind(gl); const calls = [];
  gl.depthRange = (a, b) => { calls.push([round(a, 2), round(b, 2)]); return orig(a, b); };
  kefal.tick(1, 1 / 60, true);
  B.opts.vmDepth = false; const calls0 = calls.length; kefal.tick(1, 1 / 60, true); const offCalls = calls.length - calls0; B.opts.vmDepth = true;
  gl.depthRange = orig;
  out.depth = { wallDistance: wallAhead ? round(wallAhead.distance, 2) : null, depthRangeCallsWithPass: calls0, ranged: calls.slice(0, calls0).filter((c) => c[1] < 1).length, resets: calls.slice(0, calls0).filter((c) => c[1] === 1).length, callsWithPassDisabled: offCalls, check: it ? B.checkHeld(it) : null };
  await tick(20, 1 / 60);
  await shot('held');
});

// ------------------------------------------------------------------------------------------------ 5. movement smoothness (legacy vs fixed)
await step('stutter', async () => {
  const B = g.fpbody;
  // held item off, empty hands
  for (let k = 0; k < p.slots.length; k++) if (p.slots[k]) { g.net.broadcast('it', { e: 'rm', id: p.slots[k] }); p.slots[k] = null; }
  await tick(5); g.refreshHeldVisuals();
  // longest straight, flat, obstacle-free run inside the ship (three rays: centre and +-0.32 m to each side, at knee and chest height)
  const ph = g.physics, mask = 0x41;
  let best = { d: 0 };
  for (let x = -6.4; x <= 6.4; x += 0.8) for (let z = -3.0; z <= 3.0; z += 0.75) for (let k = 0; k < 16; k++) {
    const a = k * Math.PI / 8, dx = Math.cos(a), dz = Math.sin(a);
    let d = 40;
    for (const h of [0.35, 1.0]) for (const lat of [-0.32, 0, 0.32]) {
      const o = V(x - dz * lat, h, z + dx * lat);
      const hit = ph.raycast(o, V(dx, 0, dz), 40, mask); if (hit) d = Math.min(d, hit.distance);
    }
    if (d > best.d) best = { d, x, z, a };
  }
  out.corridor = { freeMetres: round(best.d, 2), from: [round(best.x, 2), round(best.z, 2)], headingDeg: round(best.a * 180 / Math.PI, 0) };
  const dirx = Math.cos(best.a), dirz = Math.sin(best.a), yaw = Math.atan2(-dirx, -dirz);
  const start = V(best.x + dirx * 0.4, 0.05, best.z + dirz * 0.4);
  const runFrames = Math.max(60, Math.floor(((best.d - 1.6) / 5.0) * 60));
  let seed = 20260928; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const mkDts = (jitterMs, spikeP) => { const a = []; for (let i = 0; i < 3 * runFrames; i++) { let dt = 1 / 60 + (rnd() - 0.5) * 2 * jitterMs / 1000; if (spikeP && rnd() < spikeP) dt = 0.03 + rnd() * 0.012; a.push(dt); } return a; };
  const stats = (arr) => { const n = arr.length, m = arr.reduce((x, y) => x + y, 0) / n, sd = Math.sqrt(arr.reduce((x, y) => x + (y - m) ** 2, 0) / n); const s = [...arr].sort((x, y) => x - y); const med = s[n >> 1]; return { n, mean: round(m, 4), std: round(sd, 4), cvPct: round(100 * sd / m, 2), min: round(s[0], 4), max: round(s[n - 1], 4), off15pct: arr.filter((v) => Math.abs(v - med) > 0.15 * med).length, off30pct: arr.filter((v) => Math.abs(v - med) > 0.3 * med).length }; };
  const runVariant = (label, dts, { legacy, lipAt, lipH }) => {
    B.opts.smoothDt = !legacy; p.fpLegacy = legacy;
    const fwd = [], lat = [], yy = [], steps = [], gnd = []; let lipCol = null, lipRec = [];
    const world = ph.world, wstep = world.step.bind(world); let nSteps = 0; world.step = () => { nSteps++; return wstep(); };
    keys.add('forward');
    for (let run = 0; run < 3; run++) {
      if (lipAt) lipCol = ph.addStaticBox(start.x + dirx * lipAt, lipH / 2, start.z + dirz * lipAt, 0.25, lipH / 2, 3.4, Math.atan2(-dirz, dirx));
      p.teleport(start.clone(), yaw); p.vel.set(0, 0, 0); p.pitch = 0; p.stamina = 100;
      for (let i = 0; i < 6; i++) g.update(1 / 60);
      let prev = g.camera.position.clone(), prevY = prev.y, prevPY = p.pos.y, prevDy = 0;
      for (let i = 0; i < runFrames; i++) {
        nSteps = 0; g.update(dts[run * runFrames + i]);
        const c = g.camera.position, dx = c.x - prev.x, dz = c.z - prev.z;
        if (i >= 45) { fwd.push(dx * dirx + dz * dirz); lat.push(dx * -dirz + dz * dirx); yy.push(c.y - prevY); steps.push(nSteps); gnd.push(p.grounded ? 1 : 0); }
        if (lipAt) lipRec.push({ dy: c.y - prevY, pdy: p.pos.y - prevPY });
        prev = c.clone(); prevY = c.y; prevPY = p.pos.y;
      }
      if (lipCol) { ph.world.removeCollider(lipCol, true); lipCol = null; }
    }
    keys.delete('forward'); delete world.step;
    const sc = { 0: 0, 1: 0, 2: 0, 3: 0 }; for (const s of steps) sc[Math.min(3, s)]++;
    const dy2 = []; for (let i = 2; i < yy.length; i++) dy2.push(Math.abs(yy[i] - yy[i - 1]));
    const res = { label, forwardPerFrame_m: stats(fwd), lateralAbsMax_m: round(Math.max(...lat.map(Math.abs)), 4), camYdeltaAbsMax_m: round(Math.max(...yy.map(Math.abs)), 4), camYdelta2AbsMax_m: round(Math.max(0, ...dy2), 4), physicsStepsPerFrame: sc, groundedFramesPct: round(100 * gnd.reduce((a, b) => a + b, 0) / gnd.length, 1) };
    if (lipAt) { const m = (k) => Math.max(...lipRec.map((r) => Math.abs(r[k]))); res.lip = { heightM: lipH, maxCameraJumpPerFrame_m: round(m('dy'), 4), maxFeetJumpPerFrame_m: round(m('pdy'), 4) }; }
    return res;
  };
  const fixed = mkDts(0, 0), jit = mkDts(2.5, 0), jitSpike = mkDts(2.5, 0.02);
  out.stutter = {
    fixedDt_legacy: runVariant('fixed 60 Hz, legacy', fixed, { legacy: true }),
    fixedDt_new: runVariant('fixed 60 Hz, fixed', fixed, { legacy: false }),
    jitter2p5ms_legacy: runVariant('+-2.5 ms jitter, legacy', jit, { legacy: true }),
    jitter2p5ms_new: runVariant('+-2.5 ms jitter, fixed', jit, { legacy: false }),
    jitterAndSpikes_legacy: runVariant('+-2.5 ms jitter + 2% 30-42 ms spikes, legacy', jitSpike, { legacy: true }),
    jitterAndSpikes_new: runVariant('+-2.5 ms jitter + 2% 30-42 ms spikes, fixed', jitSpike, { legacy: false }),
  };
  // ledges: a 1.5 cm lip ... 10 cm step across the corridor
  out.lips = {};
  for (const h of [0.015, 0.03, 0.06, 0.10]) {
    out.lips['h' + h + '_legacy'] = runVariant('lip ' + h, fixed, { legacy: true, lipAt: 4.0, lipH: h }).lip;
    out.lips['h' + h + '_new'] = runVariant('lip ' + h, fixed, { legacy: false, lipAt: 4.0, lipH: h }).lip;
  }
  B.opts.smoothDt = true; p.fpLegacy = false;
});

for (const k of keys) keys.delete(k);
out.warnings = 'see LOGS';
return out;
