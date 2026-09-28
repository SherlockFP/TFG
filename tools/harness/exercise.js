// TFG runtime exerciser (round 3 content). Load in a host tab:
//   const H = (await import('/tools/harness/exercise.js')).default;
//   await H.creatures(); await H.bosses(); await H.items(); await H.van(); await H.features(); await H.panels();
//   await H.sector(); await H.days(2); H.table()      // or: await H.all()
// Client tab (?autojoin=CODE&net=local&name=Client): await H.clientCheck()
// Every section records console errors/warnings, thrown exceptions, NaN positions and stuck states per row.
/* global kefal, THREE */

const IGNORE = /pointer lock|WrongDocumentError|AudioContext|autoplay|user gesture|play\(\) request|NotAllowedError/i;
const S = (window.__tfgH ||= { errs: [], ctx: 'boot', results: {}, installed: false });

function install() {
  if (S.installed) return;
  S.installed = true;
  const oe = console.error.bind(console), ow = console.warn.bind(console);
  const fmt = (a) => a.map((x) => (x instanceof Error ? x.stack || x.message : typeof x === 'object' ? safeJson(x) : String(x))).join(' ');
  console.error = (...a) => { const m = fmt(a); if (!IGNORE.test(m)) S.errs.push({ ctx: S.ctx, kind: 'error', msg: m.slice(0, 500) }); oe(...a); };
  console.warn = (...a) => { const m = fmt(a); if (!IGNORE.test(m)) S.errs.push({ ctx: S.ctx, kind: 'warn', msg: m.slice(0, 500) }); ow(...a); };
  addEventListener('error', (e) => { const m = e.message + ' @' + (e.filename || '') + ':' + e.lineno; if (!IGNORE.test(m)) S.errs.push({ ctx: S.ctx, kind: 'uncaught', msg: m }); });
  addEventListener('unhandledrejection', (e) => { const m = String(e.reason?.stack || e.reason); if (!IGNORE.test(m)) S.errs.push({ ctx: S.ctx, kind: 'reject', msg: m.slice(0, 500) }); });
}
function safeJson(x) { try { return JSON.stringify(x).slice(0, 200); } catch { return String(x); } }

const g = () => kefal.game;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const fin = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const r1 = (n) => Math.round(n * 10) / 10;

function setCtx(c) { S.ctx = c; return S.errs.length; }
function errsSince(n, kinds = ['error', 'uncaught', 'reject', 'tick']) { return S.errs.slice(n).filter((e) => kinds.includes(e.kind)); }
function warnsSince(n) { return S.errs.slice(n).filter((e) => e.kind === 'warn'); }

// advance the simulation; exceptions out of Game.update are recorded (the real loop would swallow them)
async function step(sec, dt = 1 / 30, each) {
  let n = Math.max(1, Math.round(sec / dt));
  let i = 0;
  while (n-- > 0) {
    try { kefal.tick(1, dt, false); } catch (e) { S.errs.push({ ctx: S.ctx, kind: 'tick', msg: String(e?.stack || e).slice(0, 500) }); }
    if (each) { try { each(i * dt); } catch (e) { S.errs.push({ ctx: S.ctx, kind: 'tick', msg: 'probe: ' + String(e?.stack || e).slice(0, 300) }); } }
    i++;
    if (i % 15 === 0) await sleep(0);
  }
}
async function render() { try { kefal.tick(1, 1 / 30, true); } catch (e) { S.errs.push({ ctx: S.ctx, kind: 'tick', msg: 'render: ' + String(e?.stack || e).slice(0, 400) }); } }

async function closeUI() {
  const G = g();
  for (let i = 0; i < 6; i++) {
    try { G.ui.closePanel?.(true); } catch { /* ignore */ }
    try { if (G.terminal?.active) G.terminal.close(); } catch { /* ignore */ }
    try { if (G.ui.dialogEl) { G.ui.dialogResolve?.(null); G.ui.dialogEl.remove?.(); G.ui.dialogEl = null; } } catch { /* ignore */ }
    if (!G.ui.blocksInput()) break;
    await step(0.1);
  }
}

function clearCreatures() {
  const G = g();
  for (const id of [...G.creatures.host.keys()]) G.creatures.hostRemove(id);
}
function clearHands() {
  const G = g(), p = G.player;
  for (const id of p.slots) if (id) G.net.broadcast('it', { e: 'rm', id });
  p.slot = 0;
}

async function toOrbit() {
  const G = g();
  await closeUI();
  const ph = G.run.phase;
  if (ph === 'landing') { G.hostFinishLanding(); await step(0.5); }
  if (G.run.phase === 'moon' || G.run.phase === 'company') {
    G.spawnInShip(); G.player.inShip = true;
    G.hostBeginTakeoff('lever');
    await step(0.3);
    G.hostFinishTakeoff();
    await step(1);
  } else if (G.run.phase === 'takeoff') { G.hostFinishTakeoff(); await step(1); }
  await closeUI();
}

async function land(moon) {
  const G = g();
  if (G.run.phase !== 'orbit') await toOrbit();
  if (moon) G.run.moon = moon;
  if (G.run.daysLeft <= 0 && G.run.moon !== 'hq') { G.run.daysLeft = 3; G.broadcastRun(['daysLeft']); }
  G.broadcastRun(['moon']);
  G.godMode = true;
  G.spawnInShip(); G.player.inShip = true;
  G.hostLever(G.selfId);
  G.hostFinishLanding();
  await step(3);
  await closeUI();
  return G.run.phase;
}

function facilitySpot() {
  const G = g(), fac = G.world.facility;
  if (!fac) return null;
  const spots = fac.scrapSpots || [];
  const nav = fac.nav;
  for (let k = 0; k < spots.length; k++) {
    const s = spots[(k * 7 + 2) % spots.length];
    if (nav && !nav.walkableAt(s.x, s.z)) continue;
    return V(s.x, fac.layout.y, s.z);
  }
  return spots[0] ? V(spots[0].x, fac.layout.y, spots[0].z) : null;
}
// a walkable point at 4-9 m from `from` (indoor nav) or 6 m away on the terrain
function nearSpot(from, zone) {
  const G = g();
  if (zone === 'out') {
    const x = from.x + 6, z = from.z;
    return V(x, G.world.terrain?.heightAt(x, z) ?? from.y, z);
  }
  const nav = G.world.facility?.nav;
  if (!nav) return from.clone().add(V(6, 0, 0));
  let best = null;
  for (let i = 0; i < 400; i++) {
    const p = nav.randomWalkable(Math.random, from.x, from.z, 8);
    if (!p) continue;
    const d = Math.hypot(p.x - from.x, p.z - from.z);
    if (d >= 4 && d <= 9 && G.physics.lineOfSight(V(from.x, from.y + 1.2, from.z), V(p.x, from.y + 1.2, p.z))) return V(p.x, from.y, p.z);
    if (d >= 3 && d <= 12 && !best) best = V(p.x, from.y, p.z);
  }
  return best || from.clone().add(V(2, 0, 0));
}
function outdoorSpot() {
  const G = g(), x = 45, z = 12;
  return V(x, (G.world.terrain?.heightAt(x, z) ?? 0) + 0.1, z);
}

// ------------------------------------------------------------------------------------------------ creatures
async function creatures({ moon = 'hamsi', secs = 15, only = null, move = false } = {}) {
  install();
  const G = g();
  const { CREATURES } = await import('/src/game/creatures.js');
  await land(moon);
  const rows = [];
  hookHurt();
  const types = only || Object.keys(CREATURES);
  for (const type of types) {
    const def = CREATURES[type];
    const e0 = setCtx('creature:' + type);
    const row = { type, zone: def.zone, hp: def.hp, spawned: false, errors: 0, nan: false, states: '', moved: 0, hurt: 0, hits: 0, dead: false, view: false, note: '' };
    try {
      if (G.run.phase !== 'moon' || G.player.dead) { row.note += 're-landed (' + G.run.phase + '); '; await land(moon); }
      G.run.time = Math.min(G.run.time, 15 * 60);   // the day is 720 s: never let the section run into midnight
      clearCreatures(); clearHands();
      const zone = def.zone === 'out' ? 'out' : 'in';
      const at = zone === 'out' ? outdoorSpot() : facilitySpot();
      if (!at) { row.note = 'no spot'; rows.push(row); continue; }
      G.player.teleport(at.clone().add(V(0, 0.2, 0)));
      G.player.hp = G.player.maxHp;
      await step(0.2);
      const sp = nearSpot(at, zone);
      const c = G.creatures.hostSpawn(type, sp, { zone });
      if (!c) { row.note = 'hostSpawn null'; rows.push(row); continue; }
      row.spawned = true;
      const start = c.pos.clone();
      const states = new Set([c.state]);
      let maxD = 0;
      const inp = kefal.input;
      if (move) inp.down.add(inp.key('forward'));
      await step(secs, 1 / 30, () => {
        if (move) { G.player.yaw += 0.025; if (!inp.down.has(inp.key('forward'))) inp.down.add(inp.key('forward')); }
        if (!fin(c.pos)) row.nan = true;
        const v = G.creatures.views.get(c.id);
        if (v && !fin(v.pos || v.root?.position)) row.nan = true;
        states.add(c.state);
        maxD = Math.max(maxD, c.pos.distanceTo(start));
        if (!G.player.dead && G.player.pos.distanceTo(at) > 25 && c.state !== 'dead') { /* carried/moved player */ }
      });
      if (move) inp.down.clear();
      row.view = !!G.creatures.views.get(c.id);
      row.moved = r1(maxD);
      row.hurt = S.hurt.filter((h) => h.src === c.id).length;
      // kill it through the host 'hit' request path
      if (c.maxHp !== null) {
        for (let i = 0; i < 40 && !c.dead && G.creatures.host.get(c.id) === c; i++) {
          G.net.request('hit', { cid: c.id, dmg: 80, stun: 0, crit: i % 3 === 0 });
          row.hits++;
          await step(0.15);
        }
        if (!c.dead && c.data?.evade) row.note += 'evading; ';
      } else {
        G.net.request('hit', { cid: c.id, dmg: 50, stun: 1 });
        row.hits++;
        await step(0.3);
        G.creatures.kill(c, G.selfId);
        row.note += 'invulnerable (forced kill); ';
      }
      await step(1.5);
      states.add(c.state);
      row.dead = !!c.dead;
      row.states = [...states].join('>');
      if (!row.dead) row.note += 'NOT DEAD hp=' + r1(c.hp) + '; ';
      if (!fin(G.player.pos)) { row.nan = true; row.note += 'player NaN; '; }
      if (G.player.dead) { row.note += 'player died; '; }
      const moverish = (def.walk || def.run) && !def.hazard && !['editor', 'mannequin', 'stalker', 'sandkefal', 'mimicdoor'].includes(type);
      if (moverish && maxD < 0.3) row.note += 'STUCK (never moved); ';
    } catch (e) { S.errs.push({ ctx: S.ctx, kind: 'error', msg: 'harness: ' + (e?.stack || e) }); }
    const es = errsSince(e0);
    row.errors = es.length;
    if (es.length) row.firstErr = es[0].msg.split('\n').slice(0, 2).join(' | ');
    row.warns = warnsSince(e0).length;
    rows.push(row);
    if (G.player.dead) { await revive(); }
  }
  clearCreatures();
  S.results.creatures = rows;
  return rows;
}

// count host damage events per creature (godMode swallows the damage itself)
function hookHurt() {
  const G = g();
  S.hurt = S.hurt || [];
  if (G.__hurtHooked) return;
  G.__hurtHooked = true;
  const orig = G.hostHurtPlayer.bind(G);
  G.hostHurtPlayer = (id, dmg, cause, fromId, fromPos) => { S.hurt.push({ src: fromId, dmg, cause }); if (S.hurt.length > 5000) S.hurt.splice(0, 2500); return orig(id, dmg, cause, fromId, fromPos); };
}

async function revive() {
  const G = g();
  // simplest: take off (revive in orbit) and land again on the same moon
  const m = G.run.moon;
  await toOrbit();
  await land(m);
}

// ------------------------------------------------------------------------------------------------ bosses
async function bosses({ moon = 'palamut', secs = 15 } = {}) {
  install();
  const G = g();
  const rows = [];
  await land(moon);
  hookHurt();
  for (const kind of ['foreman', 'legacybot']) {
    const e0 = setCtx('boss:' + kind);
    const row = { type: kind, spawned: false, errors: 0, nan: false, states: '', moved: 0, hits: 0, dead: false, loot: 0, note: '' };
    try {
      clearCreatures();
      const itemsBefore = new Set([...G.items.all()].map((it) => it.id));
      const c = kind === 'foreman' ? G.bosses.hostSpawnForeman() : G.bosses.hostSpawnLegacy();
      if (!c) { row.note = 'spawn returned null (no lair/outdoor?)'; rows.push(row); continue; }
      row.spawned = true;
      const at = c.pos.clone();
      if (c.zone === 'in') { G.player.teleport(nearSpot(at, 'in').add(V(0, 0.2, 0))); }
      else { G.player.teleport(V(at.x + 10, (G.world.terrain?.heightAt(at.x + 10, at.z) ?? at.y) + 0.3, at.z)); }
      const states = new Set([c.state]);
      let maxD = 0;
      await step(secs, 1 / 30, () => { if (!fin(c.pos)) row.nan = true; states.add(c.state); maxD = Math.max(maxD, c.pos.distanceTo(at)); });
      row.moved = r1(maxD);
      row.hurt = S.hurt.filter((h) => h.src === c.id).length;
      for (let i = 0; i < 120 && !c.dead; i++) {
        if (c.data?.evade) { c.data.evade = false; row.note += 'evade reset; '; }
        G.net.request('hit', { cid: c.id, dmg: 150, crit: i % 4 === 0 });
        row.hits++;
        await step(0.1, 1 / 30, () => states.add(c.state));
      }
      await step(2);
      row.dead = !!c.dead;
      row.states = [...states].join('>');
      row.loot = [...G.items.all()].filter((it) => !itemsBefore.has(it.id)).length;
      if (!row.dead) row.note += 'NOT DEAD hp=' + r1(c.hp) + '/' + c.maxHp;
    } catch (e) { S.errs.push({ ctx: S.ctx, kind: 'error', msg: 'harness: ' + (e?.stack || e) }); }
    const es = errsSince(e0);
    row.errors = es.length; if (es.length) row.firstErr = es[0].msg.split('\n').slice(0, 2).join(' | ');
    rows.push(row);
  }
  clearCreatures();
  S.results.bosses = rows;
  return rows;
}

// ------------------------------------------------------------------------------------------------ items
async function press(btn, holdSec = 0.6) {
  const inp = kefal.input;
  inp.mouseButtons.add(btn); inp.mousePressed.add(btn);
  await step(1 / 30);
  await step(holdSec);
  inp.mouseButtons.delete(btn); inp.mouseReleased.add(btn);
  await step(0.25);
}
async function pressKey(code, holdSec = 0) {
  const inp = kefal.input;
  inp.down.add(code); inp.pressedSet.add(code);
  await step(Math.max(1 / 30, holdSec));
  inp.down.delete(code); inp.releasedSet.add(code);
  await step(1 / 30);
}

async function items({ moon = 'hamsi', only = null } = {}) {
  install();
  const G = g();
  const { ITEMS } = await import('/src/game/items.js');
  if (G.run.phase !== 'moon') await land(moon);
  let at = facilitySpot() || outdoorSpot();
  const rows = [];
  const ids = only || Object.keys(ITEMS);
  clearCreatures();
  for (const type of ids) {
    const def = ITEMS[type];
    const e0 = setCtx('item:' + type);
    const row = { type, kind: def.kind, held: false, used: '', final: '', errors: 0, nan: false, note: '' };
    const before = new Set([...G.items.all()].map((it) => it.id));
    try {
      if (G.run.phase !== 'moon' || G.player.dead) { row.note += 're-landed; '; await land(moon); at = facilitySpot() || outdoorSpot(); }
      G.run.time = Math.min(G.run.time, 15 * 60);
      await closeUI();
      clearHands();
      G.player.teleport(at.clone().add(V(0, 0.2, 0)));
      G.player.hp = G.player.maxHp;
      G.player.stamina = G.player.maxStamina || 100;
      await step(0.1);
      const id = G.items.hostSpawn(type, at.clone().add(V(0, 1, 0)), { holder: G.selfId });
      await step(0.1);
      const it = G.items.get(id);
      const slot = G.player.slots.indexOf(id);
      row.held = slot >= 0;
      if (slot >= 0 && G.player.slot !== slot) { G.player.slot = slot; G.refreshHeldVisuals(); }
      if (!row.held) row.note += 'not in slots; ';
      const snap = (x) => (x ? `b${x.battery == null ? '-' : r1(x.battery)} c${x.charges ?? '-'} a${x.ammo ?? '-'} on${x.on ? 1 : 0}` : 'gone');
      const s0 = snap(it);
      // primary (tap), primary (hold), secondary (RMB scan), reload, then drop
      await press(0, 0.1);
      await press(0, 1.2);
      await press(2, 0.1);
      await pressKey('KeyR');
      if (!fin(G.player.pos)) row.nan = true;
      const still = G.player.slots.includes(id);
      const alive = !!G.items.get(id);
      const s1 = snap(G.items.get(id));
      row.delta = s0 === s1 ? '' : s0 + ' -> ' + s1;
      row.used = !alive ? 'consumed' : !still ? 'left hand' : 'kept';
      if (still) {
        await pressKey(kefal.input.key('drop'));
        await step(0.6);
      }
      const it2 = G.items.get(id);
      row.final = !it2 ? 'gone' : it2.holder ? 'held:' + it2.holder.slice(0, 6) : it2.state || 'world';
      if (it2 && !fin(it2.obj.position)) row.nan = true;
      if (it2 && it2.holder === G.selfId) row.note += 'DROP FAILED; ';
      if (G.player.dead) row.note += 'player died; ';
      void it;
    } catch (e) { S.errs.push({ ctx: S.ctx, kind: 'error', msg: 'harness: ' + (e?.stack || e) }); }
    // cleanup everything this item produced
    kefal.input.mouseButtons.clear(); kefal.input.down.clear();
    for (const it of [...G.items.all()]) if (!before.has(it.id)) G.net.broadcast('it', { e: 'rm', id: it.id });
    G.grab?.item && G.grab.stop();
    clearCreatures();
    const es = errsSince(e0);
    row.errors = es.length; if (es.length) row.firstErr = es[0].msg.split('\n').slice(0, 2).join(' | ');
    rows.push(row);
    if (G.player.dead) await revive();
  }
  S.results.items = rows;
  return rows;
}

// ------------------------------------------------------------------------------------------------ van
function termCapture(G) {
  const out = [];
  const t = G.terminal;
  const orig = t.print.bind(t);
  t.print = (text, cls) => { out.push(String(text)); return orig(text, cls); };
  return { out, restore: () => { t.print = orig; } };
}
async function van({ moon = 'hamsi' } = {}) {
  install();
  const G = g();
  const rows = [];
  const add = (stepName, ok, info = '', e0) => { const es = e0 == null ? [] : errsSince(e0); rows.push({ step: stepName, ok: !!ok, info, errors: es.length, firstErr: es[0]?.msg.split('\n')[0] }); };
  if (G.run.phase !== 'moon') await land(moon);
  clearCreatures();
  const cr = G.cruiser;
  if (!cr) { add('cruiser installed', false); S.results.van = rows; return rows; }
  // fresh ownership so BUY works
  if (G.run.cruiser) { G.run.cruiser = null; G.broadcastRun(['cruiser']); await step(0.3); }
  G.run.credits = Math.max(G.run.credits, 2000); G.broadcastRun(['credits']);
  let e0 = setCtx('van:buy');
  const cap = termCapture(G);
  G.terminal.exec('buy van');
  const pend = G.terminal.pending?.op;
  G.terminal.exec('confirm');
  await step(0.2);
  cap.restore();
  add('BUY VAN -> CONFIRM', !!G.run.cruiser, `pending=${pend}; ${cap.out.slice(-1)[0]?.slice(0, 80) || ''}`, e0);
  e0 = setCtx('van:delivery');
  await step(5);
  add('delivered (drop landed)', cr.present && !cr.state.drop, `pos=${cr.state.pos.toArray().map(r1)}`, e0);
  // enter as driver
  e0 = setCtx('van:enter');
  const sp = cr.state.pos;
  G.player.teleport(V(sp.x + 2.5, sp.y + 0.3, sp.z));
  await step(0.2);
  cr.enter(0);
  await step(0.5);
  add('enter driver seat', cr.seated && cr.seat === 0, `seat=${cr.seat}`, e0);
  // drive 5 s forward, 2 s left
  e0 = setCtx('van:drive');
  const inp = kefal.input;
  const p0 = cr.state.pos.clone();
  let vmax = 0, nan = false;
  inp.down.add(inp.key('forward'));
  await step(5, 1 / 60, () => { vmax = Math.max(vmax, Math.abs(cr.speed)); if (!fin(cr.state.pos) || !fin(G.player.pos)) nan = true; });
  inp.down.add(inp.key('left'));
  await step(2, 1 / 60, () => { vmax = Math.max(vmax, Math.abs(cr.speed)); if (!fin(cr.state.pos)) nan = true; });
  inp.down.clear();
  inp.down.add(inp.key('back'));
  await step(1.5, 1 / 60);
  inp.down.clear();
  await step(1.5, 1 / 60);
  const dist = cr.state.pos.distanceTo(p0);
  const camOk = G.player.pos.distanceTo(cr.state.pos) < 4;
  add('drive 5 s + steer', dist > 5 && !nan, `moved=${r1(dist)}m vmax=${r1(vmax * 3.6)}km/h up=${r1(new THREE.Vector3(0, 1, 0).applyQuaternion(cr.state.quat).y)} playerNearVan=${camOk}`, e0);
  e0 = setCtx('van:exit');
  cr.exit();
  await step(0.5);
  add('exit', !cr.seated && fin(G.player.pos) && G.player.pos.distanceTo(cr.state.pos) < 6, `d=${r1(G.player.pos.distanceTo(cr.state.pos))}`, e0);
  // load scrap
  e0 = setCtx('van:load');
  const { ITEMS } = await import('/src/game/items.js');
  const scrapType = Object.keys(ITEMS).find((k) => ITEMS[k].kind === 'scrap' && ITEMS[k].hands !== 2) || 'airhorn';
  clearHands();
  const sid = G.items.hostSpawn(scrapType, G.player.pos.clone().add(V(0, 1, 0)), { holder: G.selfId });
  await step(0.1);
  G.net.request('van', { op: 'load', id: sid });
  await step(0.5);
  const n1 = cr.cargoCount;
  add('load scrap into bed', n1 >= 1 && !G.player.slots.includes(sid), `${scrapType} cargo=${n1}`, e0);
  // drive with cargo: the item must ride along
  e0 = setCtx('van:cargo-drive');
  const itp0 = G.items.get(sid)?.obj.position.clone();
  cr.enter(0); await step(0.4);
  inp.down.add(inp.key('forward')); await step(3, 1 / 60); inp.down.clear(); await step(1.5, 1 / 60);
  const itp1 = G.items.get(sid)?.obj.position.clone();
  const lp = itp1 ? itp1.clone().sub(cr.state.pos).length() : -1;
  add('cargo rides along', itp0 && itp1 && itp1.distanceTo(itp0) > 3 && lp < 4, `itemMoved=${itp0 && itp1 ? r1(itp1.distanceTo(itp0)) : '-'} distToVan=${r1(lp)}`, e0);
  cr.exit(); await step(0.4);
  // unload into hand
  e0 = setCtx('van:unload');
  G.player.teleport(G.items.get(sid).obj.position.clone().add(V(1.5, 0, 0)));
  await step(0.1);
  clearHands();
  G.net.request('van', { op: 'unload', id: sid, slot: 0 });
  await step(0.3);
  add('unload to hand', G.player.slots.includes(sid) && cr.cargoCount === 0, `cargo=${cr.cargoCount}`, e0);
  clearHands();
  // terminal VAN status
  e0 = setCtx('van:term');
  const cap2 = termCapture(G); G.terminal.exec('van'); G.terminal.exec('store'); cap2.restore();
  add('terminal VAN/STORE', cap2.out.some((l) => /Parked|UPLINK/i.test(l)), cap2.out[0]?.slice(0, 80), e0);
  // takeoff far from ship -> lost; near -> docked. Drive it back next to the ship first (teleport)
  e0 = setCtx('van:takeoff');
  if (cr.state.body) { cr.state.pos.set(12, cr.state.pos.y, 12); const h = G.world.terrain?.heightAt(12, 12) ?? 0; cr.state.pos.y = h + 1.2; cr.state.body.setTranslation(cr.state.pos, true); }
  await step(1);
  await toOrbit();
  add('takeoff docks the van', !!G.run.cruiser && !cr.present, `run.cruiser=${safeJson(G.run.cruiser)}`, e0);
  e0 = setCtx('van:relanding');
  await land(moon);
  await step(1);
  add('redeploys on next landing', cr.present, `pos=${cr.present ? cr.state.pos.toArray().map(r1) : '-'}`, e0);
  S.results.van = rows;
  return rows;
}

// ------------------------------------------------------------------------------------------------ features / mods
async function features() {
  install();
  const G = g();
  const mm = G.mods;
  if (G.run.phase !== 'moon') await land('hamsi');
  const rows = [];
  const fake = { out: [], print(t) { this.out.push(String(t)); } };
  for (const d of mm.features()) {
    const e0 = setCtx('feature:' + d.id);
    const was = mm.featureOn(d.id);
    try {
      if (d.scope === 'local') { mm.setEnabled(d.id, false); await step(1); mm.setEnabled(d.id, true); await step(1); }
      else {
        mm.featuresCommand([d.id, 'off'], fake, G); await step(1.5);
        const off = !mm.featureOn(d.id);
        mm.featuresCommand([d.id, 'on'], fake, G); await step(1.5);
        if (!off) fake.out.push('did not switch off');
      }
    } catch (e) { S.errs.push({ ctx: S.ctx, kind: 'error', msg: 'harness: ' + (e?.stack || e) }); }
    const es = errsSince(e0);
    rows.push({ id: d.id, scope: d.scope || 'crew', was, now: mm.featureOn(d.id), errors: es.length, firstErr: es[0]?.msg.split('\n')[0] });
  }
  // optional mods: list + errors recorded at load
  rows.push({ id: '(mod load errors)', errors: (mm.errors || []).length, firstErr: (mm.errors || [])[0] });
  S.results.features = rows;
  return rows;
}

async function panels() {
  install();
  const G = g();
  const rows = [];
  const tryIt = async (name, fn) => {
    const e0 = setCtx('panel:' + name);
    let ok = true, info = '';
    try { info = (await fn()) || ''; } catch (e) { ok = false; S.errs.push({ ctx: S.ctx, kind: 'error', msg: 'harness: ' + (e?.stack || e) }); }
    await step(0.2);
    await closeUI();
    const es = errsSince(e0);
    rows.push({ panel: name, ok: ok && !es.length, info: String(info).slice(0, 80), errors: es.length, firstErr: es[0]?.msg.split('\n')[0] });
  };
  for (const tab of ['codex', 'mastery', 'rebirth', 'weekly', 'crew']) {
    await tryIt('record:' + tab, async () => { const rec = G.meta.open(tab); await render(); return rec?.el ? rec.el.textContent.length + ' chars' : 'no el'; });
  }
  await tryIt('record: J key', async () => { dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', key: 'j' })); await step(0.1); return 'panelOpen=' + !!G.ui.panelOpen; });
  await tryIt('mods screen', async () => {
    const { buildModsScreen } = await import('/src/mods/modscreen.js');
    const el = buildModsScreen(G.mods, G.ui);
    document.body.appendChild(el);
    let clicks = 0;
    for (const b of el.querySelectorAll('button, .tab, .btn, [data-tab]')) { if (/back|close|import|remove|reload|delete/i.test(b.textContent)) continue; try { b.click(); clicks++; } catch (e) { console.error(e); } if (clicks > 40) break; }
    el.remove();
    return 'clicked ' + clicks;
  });
  // restore any feature a click in the mods screen may have flipped
  for (const d of G.mods.features()) if (!G.mods.isEnabled(d.id)) G.mods.setEnabled(d.id, true);
  const cmds = ['help', 'moons', 'sector', 'map', 'info 1', 'store', 'features', 'van', 'record', 'scan', 'weekly', 'codex', 'bestiary', 'upgrades', 'daily'];
  for (const c of cmds) {
    await tryIt('terminal:' + c, async () => {
      const cap = termCapture(G);
      try { G.terminal.exec(c); } finally { cap.restore(); }
      await sleep(5);
      const errLine = cap.out.find((l) => /error|undefined|NaN|\[object/i.test(l));
      if (errLine) console.error('terminal output: ' + errLine.slice(0, 160));
      return cap.out.join(' / ').slice(0, 80);
    });
  }
  S.results.panels = rows;
  return rows;
}

// ------------------------------------------------------------------------------------------------ sector rotation
async function sector() {
  install();
  const G = g();
  const rows = [];
  const { MOONS } = await import('/src/game/moons.js');
  await toOrbit();
  const e0 = setCtx('sector:rotate');
  const q0 = G.run.quotaIndex || 0;
  G.run.quotaIndex = q0 + 1;
  G.broadcastRun(['quotaIndex']);
  await step(1.5);
  const gen = Object.keys(MOONS).filter((k) => k.startsWith('gen' + (q0 + 1) + '_'));
  rows.push({ step: 'rotate to sector ' + (q0 + 1), ok: gen.length >= 3, info: gen.join(','), errors: errsSince(e0).length });
  for (const m of gen) {
    const e1 = setCtx('sector:land:' + m);
    let info = '';
    try {
      await land(m);
      await step(2);
      const s = facilitySpot();
      if (s) { G.player.teleport(s.clone().add(V(0, 0.2, 0))); await step(1); }
      await render();
      info = `phase=${G.run.phase} theme=${G.world.facility?.layout?.theme} biome=${MOONS[m]?.biome} cre=${G.creatures.host.size} items=${G.items.items.size} calls=${kefal.engine.sceneStats?.calls ?? '-'}`;
      await toOrbit();
    } catch (e) { S.errs.push({ ctx: S.ctx, kind: 'error', msg: 'harness: ' + (e?.stack || e) }); }
    const es = errsSince(e1);
    rows.push({ step: 'land ' + m, ok: !es.length, info, errors: es.length, firstErr: es[0]?.msg.split('\n')[0] });
  }
  S.results.sector = rows;
  return rows;
}

// ------------------------------------------------------------------------------------------------ full days
async function days(n = 2, { moon = null } = {}) {
  install();
  const G = g();
  const rows = [];
  const { isSellable } = await import('/src/game/items.js');
  for (let d = 0; d < n; d++) {
    const e0 = setCtx('day' + d + ':moon');
    let info = '';
    try {
      await toOrbit();
      const target = moon || G.run.moon === 'hq' ? (moon || 'hamsi') : G.run.moon;
      if (G.run.daysLeft <= 0) { G.run.daysLeft = 2; G.broadcastRun(['daysLeft']); }
      await land(target);
      clearCreatures();
      // collect: every sellable item lying on the moon goes into the ship storage
      let k = 0, value = 0;
      for (const it of [...G.items.all()]) {
        if (it.state !== 'world' || it.holder || !isSellable(it.def) || it.soulbound) continue;
        if (k >= 12) break;
        const p = [3.2 + (k % 4) * 0.6, 1.4, -2.2 + Math.floor(k / 4) * 0.6];
        G.net.broadcast('it', { e: 'tp', id: it.id, p });
        value += it.value; k++;
      }
      await step(2);
      const credits0 = G.run.credits, day0 = G.run.day;
      await toOrbit();
      info = `moon=${target} collected=${k} (▮${value}) day ${day0}->${G.run.day} daysLeft=${G.run.daysLeft} shipItems=${G.items.inShipItems().length}`;
      void credits0;
    } catch (e) { S.errs.push({ ctx: S.ctx, kind: 'error', msg: 'harness: ' + (e?.stack || e) }); }
    let es = errsSince(e0);
    rows.push({ step: 'day ' + (d + 1) + ' moon', ok: !es.length, info, errors: es.length, firstErr: es[0]?.msg.split('\n')[0] });
    // sell at HQ
    const e1 = setCtx('day' + d + ':hq');
    info = '';
    try {
      const phaseOk = await land('hq');
      const co = G.world.company;
      const zone = co?.interactables.find((i) => i.type === 'sellzone');
      const ship = G.items.inShipItems().filter((it) => isSellable(it.def) && !it.soulbound);
      let k = 0;
      for (const it of ship) { G.net.broadcast('it', { e: 'tp', id: it.id, p: [zone.pos.x + ((k % 3) - 1) * 0.4, zone.pos.y + 0.6, zone.pos.z + (Math.floor(k / 3) % 2) * 0.3] }); k++; }
      await step(1.5);
      const c0 = G.run.credits, sold0 = G.run.sold;
      G.hostSell(G.selfId);
      for (let i = 0; i < 40 && G.run.credits === c0; i++) { await sleep(100); await step(0.1); }
      info = `phase=${phaseOk} onCounter=${k} credits ${c0}->${G.run.credits} sold ${sold0}->${G.run.sold}`;
      await toOrbit();
    } catch (e) { S.errs.push({ ctx: S.ctx, kind: 'error', msg: 'harness: ' + (e?.stack || e) }); }
    es = errsSince(e1);
    rows.push({ step: 'day ' + (d + 1) + ' sell at HQ', ok: !es.length && /credits (\d+)->(\d+)/.test(info) && +info.match(/credits (\d+)->(\d+)/)[2] > +info.match(/credits (\d+)->(\d+)/)[1], info, errors: es.length, firstErr: es[0]?.msg.split('\n')[0] });
  }
  S.results.days = rows;
  return rows;
}

// ------------------------------------------------------------------------------------------------ 2-player
// host side: spawn things next to the client so the client tab can check them
async function hostForClient() {
  install();
  const G = g();
  const [cid, r] = [...G.remotes.entries()][0] || [];
  if (!cid) return 'no client connected';
  if (G.run.phase !== 'moon') await land('hamsi');
  await step(1);
  const at = r.pos.clone();
  const zone = at.y < -100 ? 'in' : 'out';
  const c = G.creatures.hostSpawn(zone === 'in' ? 'scuttler' : 'replyguy', nearSpot(at, zone), { zone });
  const iid = G.items.hostSpawn('shovel', at.clone().add(V(0, 1, 0)), { holder: cid });
  await step(1);
  return { cid, creature: c?.id, item: iid, van: G.cruiser?.present, zone };
}
async function clientCheck() {
  install();
  const G = g();
  const e0 = setCtx('client');
  const out = { isHost: G.isHost, phase: G.run?.phase, views: G.creatures.views.size, items: G.items.items.size, van: G.cruiser?.present };
  await step(1);
  const nanViews = [...G.creatures.views.values()].filter((v) => !fin(v.pos || v.root?.position)).length;
  out.nanViews = nanViews;
  const held = G.player.heldItem?.();
  out.held = held?.type || null;
  if (held) { await press(0, 0.1); await step(0.5); }
  const v = [...G.creatures.views.values()].find((x) => x.state !== 'dead');
  if (v) { G.net.request('hit', { cid: v.id, dmg: 400 }); await sleep(300); await step(0.3); out.hitState = v.state; out.hitHp = v.hp; }
  if (G.cruiser?.present) {
    const sp = G.cruiser.state.pos;
    G.player.teleport(V(sp.x + 2.5, sp.y + 0.3, sp.z)); await step(0.3);
    G.cruiser.enter(1); await sleep(300); await step(0.5);
    out.vanSeat = G.cruiser.seat;
    G.cruiser.exit(); await sleep(200); await step(0.3);
  }
  const es = errsSince(e0);
  out.errors = es.length; out.firstErr = es[0]?.msg.split('\n')[0];
  S.results.client = out;
  return out;
}

// ------------------------------------------------------------------------------------------------ report
function table(section) {
  const secs = section ? [section] : Object.keys(S.results);
  const lines = [];
  for (const s of secs) {
    const rows = S.results[s];
    if (!rows) continue;
    if (!Array.isArray(rows)) { lines.push(`## ${s}: ${safeJson(rows)}`); continue; }
    const bad = rows.filter((r) => r.errors || r.nan || r.ok === false || /STUCK|NOT DEAD|FAILED|null/.test(r.note || ''));
    lines.push(`## ${s}: ${rows.length} rows, ${bad.length} flagged`);
    for (const r of bad) lines.push('  ' + safeJson(r));
  }
  return lines.join('\n');
}
function errors(filter) { return S.errs.filter((e) => !filter || e.ctx.includes(filter)); }

async function all() {
  await creatures(); await bosses(); await items(); await van(); await features(); await panels(); await sector(); await days(2);
  return table();
}

const H = { install, creatures, bosses, items, van, features, panels, sector, days, hostForClient, clientCheck, table, errors, all, step, land, toOrbit, state: S };
window.H = H;
install();
export default H;
