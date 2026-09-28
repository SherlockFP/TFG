// Wave-1 "fun" module check (body for tools/harness/headless.mjs; host mode, one tab).
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5191 --script tools/harness/wave1_fun.js --shot /tmp/fun.png
// Add  --url '/?autohost=local&code=T1&name=Tester&funshot=1'  to also render the outfit sheet (front/back/face close-ups of the
// Venom Symbiote + every outfit) and POST it as a PNG dataURL to http://127.0.0.1:5291/ (see the receiver note in docs/wave1/fun.md).
// Covers: cosmetics (equip / unlock / remote sync incl. old clients), Symbiote Sample unlock, football (kick / bump / bounds /
// juggle / HQ pitch + goal), crew tasks (assignment, objectives, completion, saboteur, team bonus), echo mode (energy, flicker,
// knock, whisper, reveal, door, ghost-only), wardrobe panel DOM. Returns { ok, steps[], errs[] }.
const g = kefal.game;
const res = { ok: true, steps: [] };
const errs = [];
addEventListener('error', (e) => errs.push(String(e.message)));
addEventListener('unhandledrejection', (e) => errs.push('rej: ' + String(e.reason)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = (n = 1, dt = 1 / 60) => kefal.tick(n, dt, false);
const r2 = (v) => Math.round(v * 100) / 100;
const step = async (name, fn) => {
  try { const r = (await fn()) || {}; res.steps.push({ name, ...r }); if (r.ok === false) res.ok = false; }
  catch (e) { res.steps.push({ name, ok: false, err: String((e && e.stack) || e).slice(0, 400) }); res.ok = false; }
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const { insideShip } = await import('/src/world/ship.js');
const { SCRAP_TABLE } = await import('/src/game/items.js');
const wantShot = /funshot=1/.test(location.search);
const land = async (moon) => {
  g.run.daysLeft = 3; g.run.moon = moon; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  for (let i = 0; i < 20; i++) { tick(10, 1 / 30); await sleep(10); }
  await sleep(900); tick(20, 1 / 30);
};
const takeoff = () => { g.player.teleport(V(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); tick(30, 1 / 30); };

await step('modules', () => ({ ok: !!(g.fun && g.fun.cosmetics && g.fun.football && g.fun.tasks && g.fun.echo && g.cosmetics && g.cosmetics.equip), keys: Object.keys(g.fun || {}) }));
const fb = g.fun.football, tk = g.fun.tasks, ec = g.fun.echo, co = g.cosmetics, prof = g.profile;

// ------------------------------------------------------------------ cosmetics
await step('cosmetics.equip', () => {
  const lockedFail = co.equip('suit', 'venom') === false;
  co.unlock('suit:venom', true); co.unlock('face:led', true); co.unlock('back:monster', true); co.unlock('hat:wizard', true);
  const eq = [co.equip('suit', 'venom'), co.equip('hat', 'wizard'), co.equip('face', 'led'), co.equip('back', 'monster')];
  tick(3);
  const hd = g.helloData();
  const un = co.unlocked();
  return { ok: lockedFail && eq.every(Boolean) && hd.suit === 'venom' && hd.face === 'led' && hd.back === 'monster' && un.suit.includes('venom') && un.face.includes('led'), current: co.current(), hello: { suit: hd.suit, hat: hd.hat, face: hd.face, back: hd.back } };
});
await step('cosmetics.remote-sync', () => {
  const a = g.ensureRemote('fakeR1', { name: 'Ghosty', level: 5, suit: 'venom', hat: 'crown', face: 'gasmask', back: 'plushie' });
  const l1 = a.avatar.getLook();
  a.setInfo({ suit: 'clown', hat: 'cap', face: 'none', back: 'monster' });
  const l2 = a.avatar.getLook();
  const old = g.ensureRemote('fakeOld', { name: 'OldClient', level: 1, suit: 'orange', hat: 'cap' });   // pre-wardrobe client: no face/back fields
  const l3 = old.avatar.getLook();
  a.update(0.05); old.update(0.05);
  for (const id of ['fakeR1', 'fakeOld']) { g.remotes.get(id)?.dispose(); g.remotes.delete(id); }
  const ok = l1.suit === 'venom' && l1.hat === 'crown' && l1.face === 'gasmask' && l1.back === 'plushie' && l2.suit === 'clown' && l2.face === 'none' && l2.back === 'monster' && l3.suit === 'orange' && l3.face === 'none';
  return { ok, l1, l2, l3 };
});
await step('cosmetics.symbiote', async () => {
  const inTables = Object.values(SCRAP_TABLE).every((t) => t.some((e) => e[0] === 'symbiote'));
  const def = g.itemDefOf('symbiote');
  prof.fun.symbiote = false; prof.cosmetics.suits = prof.cosmetics.suits.filter((s) => s !== 'venom'); prof.suit = 'orange'; prof.stats.creatureKills = 0;
  g.items.hostSpawn('symbiote', V(1, 0.4, 0.5), {});
  tick(180, 1 / 60);
  const owned = co.owns('suit', 'venom');
  co.equip('suit', 'venom');
  return { ok: inTables && def.tier === 'mythic' && owned && prof.fun.symbiote === true, inTables, tier: def.tier, owned };
});

// ------------------------------------------------------------------ football (ship)
await step('football.kick+bounds', () => {
  fb.respawn('ship'); tick(90);
  const S = fb.state;
  const start = fb.position();
  g.player.teleport(V(-2.6, 0.05, 0.7), -Math.PI / 2); tick(3);
  fb.kick([1, 0.1, 0], false);
  let maxX = start.x, inside = true, maxSpeed = 0;
  for (let i = 0; i < 90; i++) { tick(1); const p = fb.position(); maxX = Math.max(maxX, p.x); inside = inside && insideShip(p, 0.1); maxSpeed = Math.max(maxSpeed, S.v.length()); }
  const end = fb.position();
  return { ok: maxX - start.x > 2.5 && inside && maxSpeed > 5, start: [r2(start.x), r2(start.y), r2(start.z)], maxX: r2(maxX), maxSpeed: r2(maxSpeed), inside };
});
await step('football.bump', () => {
  fb.respawn('ship'); tick(60);
  const x0 = fb.position().x;
  for (let i = 0; i < 46; i++) { g.player.teleport(V(-3.4 + i * 0.06, 0.05, 0.7), -Math.PI / 2); tick(1); }
  tick(20);
  return { ok: fb.position().x > x0 + 0.25, x0: r2(x0), x1: r2(fb.position().x) };
});
await step('football.oob-respawn', () => {
  fb.respawn('ship'); tick(30);
  fb.state.body.setTranslation({ x: 40, y: 5, z: 0 }, true); tick(12);
  const p = fb.position();
  return { ok: insideShip(p, 0.2), p: [r2(p.x), r2(p.y), r2(p.z)] };
});
await step('football.juggle', () => {
  fb.respawn('ship'); tick(60);
  g.player.teleport(V(-1.2, 0.05, 0.7), -Math.PI / 2); tick(3);
  const S = fb.state;
  for (let i = 0; i < 3; i++) {
    S.body.setTranslation({ x: -1.0, y: 1.7, z: 0.7 }, true); S.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    tick(20);
    fb.kick([0.1, 1, 0], false);
    tick(2);
  }
  return { ok: S.juggle >= 3, juggle: S.juggle, best: S.best };
});

// ------------------------------------------------------------------ football (HQ pitch + goal)
await step('football.hq-pitch+goal', async () => {
  await land('hq');
  const S = fb.state;
  const phase = g.run.phase, goals = fb.goals().length;
  const y0 = g.world.company?.groundY ?? -1.25;
  const c = fb.position();
  const atCentre = Math.abs(c.x + 21) < 1.6 && Math.abs(c.z - 18) < 1.6;
  // kick from the centre spot
  g.player.teleport(V(-22.4, y0 + 0.05, 18), -Math.PI / 2); tick(3);
  fb.kick([0.1, 0.1, 1], false);     // sideways along the pitch (not into a goal)
  let maxX = -99, minY = 99;
  for (let i = 0; i < 80; i++) { tick(1); const p = fb.position(); maxX = Math.max(maxX, p.z); minY = Math.min(minY, p.y); }
  // goal: drop the ball into the east goal
  S.lastBy = g.selfId;
  S.body.setTranslation({ x: -11.0, y: y0 + 0.5, z: 18 }, true); S.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  tick(6);
  const scored = S.goals === 1 && S.celebrate > 0;
  tick(230);   // celebration ends -> respawn on the centre spot
  const after = fb.position();
  return { ok: phase === 'company' && goals === 2 && atCentre && maxX - c.z > 2 && minY > y0 - 1 && scored && Math.abs(after.x + 21) < 1.6, phase, goals, atCentre, maxX: r2(maxX), scored, goalsProfile: prof.fun.goals, after: [r2(after.x), r2(after.y), r2(after.z)] };
});
await step('football.takeoff-to-ship', () => {
  takeoff(); tick(60);
  const p = fb.position();
  return { ok: g.run.phase === 'orbit' && insideShip(p, 0.2), phase: g.run.phase, p: [r2(p.x), r2(p.y), r2(p.z)] };
});

// ------------------------------------------------------------------ crew tasks
await land('hamsi');
await step('tasks.assign', () => {
  const my = tk.myTasks();
  const st = tk.stations();
  const obj = g.objectives.compute().map((o) => o.text);
  return { ok: g.run.phase === 'moon' && tk.state.active && st.length >= 5 && my.length >= 2 && my.length <= 3 && obj.some((t) => t.startsWith('TASKS')), phase: g.run.phase, stations: st.length, mine: my.map((a) => a.station.type + (a.done ? '(done)' : '')), objectives: obj.slice(0, 6) };
});
await step('tasks.complete-one', () => {
  const a = tk.myTasks()[0];
  g.player.teleport(V(a.station.x + 0.8, a.station.y + 0.1, a.station.z), 0); tick(3);
  const xp0 = prof.xp + prof.level * 1e6, n0 = prof.fun.tasks;
  tk.complete(a.station.id); tick(4);
  const now = tk.myTasks()[0];
  const obj = g.objectives.compute().map((o) => o.text);
  return { ok: now.done && prof.fun.tasks === n0 + 1 && obj.some((t) => t.startsWith('✔')), done: now.done, objectives: obj.slice(0, 5), tasksDone: prof.fun.tasks };
});
await step('tasks.saboteur', () => {
  const orig = g.run.seed;
  for (const id of ['fakeS1', 'fakeS2']) { const r = g.ensureRemote(id, { name: id, level: 1, suit: 'green', hat: 'none' }); r.applyState({ p: [0, 0, 0], y: 0, pt: 0, f: 16 }); }
  let found = false;
  for (let k = 1; k <= 60 && !found; k++) { g.run.seed = 7919 * k; tk.assignNow(); tick(1); if (tk.state.hostSab && tk.state.hostSab.pid === g.selfId) found = true; }
  const sabOk = !!tk.state.sab && tk.state.sab.need === 2;
  const mine = new Set(tk.myTasks().map((a) => a.station.id));
  const others = tk.stations().filter((s) => !mine.has(s.id));
  const pranked = [];
  for (const s of others.slice(0, 2)) {
    g.player.teleport(V(s.x + 0.8, s.y + 0.1, s.z), 0); tick(3);
    g.net.request('task', { op: 'prank', sid: s.id }); tick(3);
    pranked.push(tk.stations().find((q) => q.id === s.id).glitch > 0);
  }
  for (const id of ['fakeS1', 'fakeS2']) { g.remotes.get(id)?.dispose(); g.remotes.delete(id); }
  g.run.seed = orig;
  const sab = tk.state.sab;
  return { ok: found && sabOk && pranked.length === 2 && pranked.every(Boolean) && sab.done === 2 && sab.complete, found, pranked, sab };
});

// ------------------------------------------------------------------ echo mode (dead player helps the living)
await step('echo.abilities', async () => {
  const fac = g.world.facility;
  const door = fac.doors.find((d) => d.kind === 'door' && !d.locked && d.pos);
  if (!door) return { ok: false, err: 'no plain door in this facility' };
  const alive = g.ensureRemote('fakeE', { name: 'Alive', level: 2, suit: 'green', hat: 'none' });
  alive.applyState({ p: [door.pos.x + 2, door.pos.y, door.pos.z], y: 0, pt: 0, f: 8 }); tick(2);
  g.player.teleport(V(door.pos.x + 5, door.pos.y + 0.1, door.pos.z), 0); tick(2);
  g.damageLocal(999, 'test'); tick(10);
  const E = ec.state;
  const active = E.active && g.player.dead;
  const nearEmit = [...g.lights.emitters].filter((e) => e.pos && e.pos.distanceTo(V(door.pos.x + 2, door.pos.y + 1, door.pos.z)) < 14).length;
  const out = { active, nearEmit };
  ec.use(0); tick(3);                                        // flicker
  out.flicker = E.flick.size;
  out.recharging = ec.use(0) === false;                     // cooldown gate (client side)
  ec.use(1); tick(2);                                        // knock (aim = camera ray)
  ec.use(2); tick(2);                                        // whisper
  out.energyAfter3 = Math.round(E.energy);
  g.creatures.hostSpawn('scuttler', V(door.pos.x + 5, door.pos.y, door.pos.z + 1)); tick(3);
  E.pool.get(g.selfId).e = 100; E.energy = 100; E.cd = [0, 0, 0, 0, 0];
  ec.use(3); tick(4);                                        // reveal nearest creature
  out.marks = E.marks.length;
  E.pool.get(g.selfId).e = 100; E.energy = 100; E.cd = [0, 0, 0, 0, 0];
  const before = fac.doors.find((d) => d.id === door.id).open;
  g.net.request('echo', { op: 'door', did: door.id }); tick(4);
  out.doorToggled = fac.doors.find((d) => d.id === door.id).open !== before;
  tick(230);
  out.flickerRestored = E.flick.size === 0;
  out.hostEnergy = Math.round(E.pool.get(g.selfId)?.e ?? -1);
  g.remotes.get('fakeE')?.dispose(); g.remotes.delete('fakeE');
  g.respawn(); tick(10);
  out.inactiveAfterRespawn = !E.active;
  out.ok = active && out.recharging && out.energyAfter3 < 60 && out.marks === 1 && out.doorToggled && out.flickerRestored && out.inactiveAfterRespawn && (nearEmit === 0 || out.flicker > 0);
  return out;
});

// ------------------------------------------------------------------ team bonus at day end
await step('tasks.team-bonus', () => {
  tk.assignNow(); tick(2);
  const list = tk.myTasks();
  for (const a of list) { g.player.teleport(V(a.station.x + 0.8, a.station.y + 0.1, a.station.z), 0); tick(3); tk.complete(a.station.id); tick(3); }
  const crewDone = tk.state.crewDone;
  const credits0 = g.run.credits;
  g.player.teleport(V(0, 1, 0)); g.player.inShip = true;
  g.hostBeginTakeoff('lever'); tick(2);
  const result = tk.state.result;
  const credits1 = g.run.credits;   // right after the bonus (the day summary later deducts fines for the earlier test death)
  const extra = []; g.mods.emit('daySummary', { company: false }, extra, g);
  g.hostFinishTakeoff(); tick(30, 1 / 30);
  return { ok: crewDone && result && result.complete && result.bonus > 0 && credits1 >= credits0 + result.bonus - 1 && extra.some((h) => h.includes('TEAM BONUS')), crewDone, credits: [credits0, credits1], result, summary: extra[0] };
});

// ------------------------------------------------------------------ wardrobe panel
await step('wardrobe.panel', async () => {
  co.equip('suit', 'venom'); co.equip('hat', 'none'); co.equip('face', 'none'); co.equip('back', 'none');
  g.player.teleport(V(-3.2, 0.05, 2.4), Math.PI); tick(3);
  const list = [];
  g.mods.emit('interactables', list, g);
  const mirror = list.find((i) => typeof i.label === 'function' ? /wardrobe/i.test(i.label()) : /wardrobe/i.test(i.label || ''));
  mirror?.action?.();
  await sleep(700); tick(2);
  const { getCharPreview } = await import('/src/ui/charpreview.js');
  for (let i = 0; i < 3; i++) getCharPreview().step(0.03, performance.now() / 1000);
  const tiles = document.querySelectorAll('.wd-tile').length;
  const tabs = [...document.querySelectorAll('.wd-tabs .btn')].map((b) => b.textContent);
  document.querySelector('[data-nav="wd:tab:face"]')?.click(); await sleep(50);
  const faceTiles = document.querySelectorAll('.wd-tile').length;
  document.querySelector('[data-nav="wd:tab:suit"]')?.click(); await sleep(50);
  const venomTile = [...document.querySelectorAll('.wd-tile')].find((t) => /Venom/.test(t.textContent));
  venomTile?.click(); await sleep(50);
  const detail = document.querySelector('.wd-name')?.textContent;
  // char sheet button (character panel injection)
  g.ui.openPanel(g.ui.characterPanel(true));
  let charBtn = false;
  for (let i = 0; i < 25 && !charBtn; i++) { await sleep(120); charBtn = !!document.querySelector('[data-fun="wardrobe"]'); }
  g.ui.closePanel();
  mirror?.action?.(); await sleep(500);
  for (let i = 0; i < 3; i++) getCharPreview().step(0.03, performance.now() / 1000);
  return { ok: !!mirror && tiles >= 26 && faceTiles === 6 && /Venom/.test(detail || '') && charBtn, mirror: !!mirror, tiles, tabs, faceTiles, detail, charBtn };
});

// ------------------------------------------------------------------ outfit sheet (optional image, posted to the receiver)
if (wantShot) {
  await step('outfit-sheet', async () => {
    const A = await import('/src/models/avatar.js');
    const C = await import('/src/models/cosmetics.js');
    const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
    cv.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:720px;z-index:99999';
    document.body.appendChild(cv);
    const rr = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
    rr.setSize(1280, 720, false); rr.setScissorTest(true);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0c0f18);
    scene.add(new THREE.HemisphereLight(0xbcc8ff, 0x1c1c26, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2, 3, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fa2ff, 2.2); rim.position.set(-3, 2, -2.5); scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xffb0d0, 1.0); rim2.position.set(3, 1.5, -3); scene.add(rim2);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    const mkAv = (look) => { const a = A.createAvatar({ suitColor: '#d9642b', hat: 'none' }); a.setLook(look); a.setMouth(0.55); for (let i = 0; i < 40; i++) a.update(0.05, { time: i * 0.1, speed: 0 }); a.root.updateMatrixWorld(true); return a; };
    const view = (av, x, y, w, h, camPos, look, yaw) => {
      scene.add(av.root); av.root.rotation.y = yaw;
      cam.aspect = w / h; cam.position.set(...camPos); cam.lookAt(...look); cam.updateProjectionMatrix();
      rr.setViewport(x, 720 - y - h, w, h); rr.setScissor(x, 720 - y - h, w, h); rr.render(scene, cam);
      scene.remove(av.root);
    };
    const venom = mkAv({ suit: 'venom' }); venom.setMouth(0.3);
    view(venom, 0, 0, 320, 470, [0, 1.0, 5.4], [0, 0.98, 0], Math.PI * 0.0 + 0.0);
    view(venom, 320, 0, 320, 470, [0, 1.0, 5.4], [0, 0.98, 0], Math.PI);
    view(venom, 0, 470, 320, 250, [0.12, 1.66, 1.0], [0, 1.62, 0], 0.0);
    view(venom, 320, 470, 320, 250, [0, 1.36, 2.1], [0, 1.28, 0], 0.0);
    const outs = C.OUTFITS.slice();
    outs.forEach((o, i) => {
      const a = mkAv({ suit: o.id });
      const col = i % 4, row = Math.floor(i / 4);
      view(a, 640 + col * 160, row * 240, 160, 240, [0, 1.0, 5.6], [0, 0.95, 0], 0.5);
      a.dispose();
    });
    let posted = false;
    try { await fetch('http://127.0.0.1:5291/', { method: 'POST', mode: 'no-cors', body: cv.toDataURL('image/png') }); posted = true; } catch (e) { posted = String(e); }
    cv.remove(); rr.dispose(); venom.dispose();
    return { ok: true, posted };
  });
}

res.errs = errs.slice(0, 12);
if (errs.length) res.ok = false;
// compact report: full detail only for failing steps
const out = { ok: res.ok, passed: res.steps.filter((x) => x.ok !== false).map((x) => x.name), failed: res.steps.filter((x) => x.ok === false), errs: res.errs };
if (/verbose=1/.test(location.search)) out.detail = res.steps;   // add &verbose=1 to the --url for every step's numbers
return out;
