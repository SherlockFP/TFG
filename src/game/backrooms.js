// NOCLIP -> THE BACKROOMS (module 'backrooms', installBackrooms). A pocket realm + a Level 0 moon.
//
//  * Pocket: a deterministic Level 0 maze (src/world/backrooms_plan.js + backrooms_pocket.js) built far away from
//    every map (x = +5000, facility floor height) when the first player noclips in, unloaded when it is empty.
//    Key = pocketKey(run.seed, run.day, index) -> every peer builds the same geometry; the pocket has its own NavGrid
//    and CreatureManager is taught (instance patch) to use it for creatures standing in the pocket.
//  * Entry: (a) a glitch wall patch in the facility (0-1 per day, ~35%, deterministic from the run seed); touch it or
//    walk into it; once used it stays open ~75 s so teammates can follow, then seals. (b) Falling out of the OUTDOOR
//    map: 50% chance to noclip instead of a void death. Both play a tear -> fall -> thud cinematic.
//  * Inside: HUD "LEVEL 0" + "NO SIGNAL" (walkie radio disabled), found-footage overlay, yellow haze + hum, liminal
//    loot, Almond Water becomes a drink, a green EXIT far from the landing point returns you to the facility
//    entrance. After ~4 min entities hunt (br_smiler / br_hound / br_partygoer when registered, else Lurker / Troll /
//    NPC). If the ship leaves while you are inside, you are lost ('br_lost').
//  * Level 0 moon: '∅-Level 0' (id br_level0), Backrooms interior, yellow-hazy outdoor, glitch spot guaranteed.
//
// Net (all host-authoritative; message types prefixed 'br'):
//   request 'brEnter' {r: 'spot'|'fall'|'debug'}   request 'brLeave' {r: 'exit'|'kick'}
//   host -> one peer 'brgo' {ok, k, p:[x,y,z], yaw} | {ok:false, why}
//   host -> all 'brst' {k}   (build / unload the pocket NOW, before any loot message)
//   host -> all 'brfx' {k: 'noclip'|'warn'|'hunt'|'lost', id?, p?}
//   run.br = { d: day, n: pockets opened today, k: active key|0, m: [peer ids inside], sp: 'idle'|'open'|'sealed', hunt: 0|1 }
// Soft interface: game.backrooms = { inPocket(peerId?), pocket, spot, state, enter(reason), exit() };
//   emits game.mods 'tfg:backrooms' { phase: 'enter'|'exit', who, key } on every peer.
import * as THREE from 'three';
import { buildPocket, POCKET } from '../world/backrooms_pocket.js';
import { pocketKey } from '../world/backrooms_plan.js';
import { RNG, hashString } from '../core/rng.js';
import { CREATURES } from './creatures.js';
import { ITEMS, SCRAP_TABLE, itemDef } from './items.js';
import { MOONS, BIOMES, registerMoon } from './moons.js';
import { t, tf, addTranslations } from '../core/i18n.js';
import { installBrRussian } from './br_i18n_ru.js';
import { hudDock } from '../ui/dock.js';
import { SHIP } from '../world/ship.js';
import { installBrItems, patchAlmondWater, ALMOND, BR_ITEMS } from './br_items.js';
import { registerBrSounds, GlitchPatch, NoclipOverlay, VhsOverlay, showPolaroidCard, WorldMarker } from '../render/br_fx.js';

const HUNT_AFTER = 240;        // s after the pocket opened before entities hunt
const WARN_AT = 200;
const SPOT_OPEN_S = 75;        // a used glitch spot stays open this long (followers), then seals for the day
const SPOT_CHANCE = 0.35;
const FALL_Y = -150, FALL_CHANCE = 0.5;
const LOST_CAUSE = 'br_lost';
const FOG_COL = new THREE.Color(0xa8955a), FOG_DENSITY = 0.034;
const _fogTmp = new THREE.Color();
// [registered id from the brcreatures module, existing fallback]
const HUNTERS = [['br_smiler', 'lurker'], ['br_hound', 'hound'], ['br_partygoer', 'mannequin']];

export const LEVEL0_MOON = 'br_level0';

export function installBackrooms(game) {
  const api = window.KefalAPI;
  installBrItems();
  registerBrSounds(api);
  registerLevel0Moon(api);
  addTranslations(TR);
  installBrRussian();
  api?.registerCommand?.('noclip', (rest, term) => term.print(t("You can't do that from here. Try a wall.")), '???');

  const offs = [];
  const on = (ev, fn) => { const off = game.mods?.on?.(ev, fn); if (typeof off === 'function') offs.push(off); };
  const S = {
    pocket: null, builtKey: 0,
    spot: null, spotFac: null, patch: null, spotHum: null, touchT: 0,
    cine: null, go: null,
    camIn: false, savedFog: undefined, enteredAt: 0, lk: 1, fog: { fog: 0xa8955a, density: FOG_DENSITY },
    lastY: 0, outdoorT: -99, lastFallRoll: null, forceFall: null,
    overlay: null, vhs: null, dock: null, hudT: 0, marker: null, keyCd: 0,
    lostT: -1, members: '', myLines: new Set(), spotOpenS: SPOT_OPEN_S,
    host: { t0: 0, nextSpawn: 0, warned: false, spawned: new Set(), outT: new Map(), emptyT: 0, cleanT: 0, sealTimer: null, loot: 0 },
  };
  const run = () => game.run;
  const br = () => { const r = game.run; return r?.br && r.br.d === r.day ? r.br : null; };
  const members = () => (br()?.k ? br().m || [] : []);
  const posInPocket = (pos) => !!(S.pocket && pos && S.pocket.contains(pos));
  const posOf = (id) => (id === game.selfId ? game.player.pos : game.remotes.get(id)?.pos);
  const spotState = () => br()?.sp || 'idle';
  const fromHost = (from) => (from === game.selfId ? !!game.isHost : !!game.net && from === game.net.hostId);
  const ensureSound = (n) => { try { window.__kefalMods?.ensureSound(n); } catch { /* ignore */ } };
  const playSound = (n, v = 0.8, extra = {}) => { ensureSound(n); return game.audio.play(n, { volume: v, bus: 'sfx', ...extra }); };
  const playAt = (n, pos, v = 0.8, extra = {}) => { ensureSound(n); return game.audio.play(n, { pos, volume: v, bus: 'sfx', refDistance: 2, maxDistance: 40, ...extra }); };

  // ---------------------------------------------------------------- pocket lifecycle (every peer)
  function ensurePocket(key) {
    key = (key || 0) >>> 0;
    if (key === S.builtKey) return S.pocket;
    if (S.pocket) {
      // never leave anybody standing in a pocket that is about to vanish
      if (S.pocket.contains(game.player.pos) && !game.player.dead) sendHome('kick');
      S.pocket.dispose();
      S.pocket = null;
    }
    S.builtKey = 0;
    if (!key) return null;
    try {
      S.pocket = buildPocket(key, { physics: game.physics, lightPool: game.lights });
      game.scene.add(S.pocket.group);
      S.builtKey = key;
    } catch (e) { console.warn('backrooms pocket', e); S.pocket = null; }
    return S.pocket;
  }

  // ---------------------------------------------------------------- the glitch spot (deterministic per facility & day)
  function computeSpot() {
    disposeSpot();
    const fac = game.world.facility, r = run();
    if (!fac || !r || game.world.company) return;
    const rng = new RNG(((r.seed >>> 0) ^ 0xb4c7f00d ^ Math.imul((r.day | 0) + 1, 0x9e3779b1)) >>> 0);
    const chance = game.w3?.spotChance ? game.w3.spotChance(r, MOONS[r.moon]?.brGlitch) : (MOONS[r.moon]?.brGlitch ?? SPOT_CHANCE);   // [worlds3] 100 % day 1 / every 3rd day
    S.spotRoll = rng.next();
    if (S.spotRoll >= chance) return;
    let cands = (fac.wallSpots || []).filter((s) => (s.dist ?? 9) >= 2);
    if (!cands.length) cands = fac.wallSpots || [];   // [worlds3] a guaranteed door must not fail on a tiny facility
    if (!cands.length) return;
    const s = cands[Math.floor(rng.next() * cands.length)];
    const normal = new THREE.Vector3(Math.sin(s.rotY), 0, Math.cos(s.rotY));
    S.spot = { pos: new THREE.Vector3(s.x, s.y, s.z), normal, room: s.room, dist: s.dist };
    S.spotFac = fac;
    try { S.patch = new GlitchPatch(game.scene, S.spot.pos, normal, game.lights); } catch (e) { console.warn('glitch patch', e); }
  }
  function disposeSpot() {
    S.patch?.dispose(); S.patch = null;
    S.spot = null; S.spotFac = null;
    S.spotHum?.stop(0.3); S.spotHum = null;
  }
  function spotTick(dt) {
    if (S.spotFac && S.spotFac !== game.world.facility) disposeSpot();
    if (!S.spot) return;
    const sp = spotState();
    S.patch?.update(dt, { open: sp === 'open', sealed: sp === 'sealed' });
    const p = game.player, s = S.spot;
    const d = p.pos.distanceTo(s.pos);
    const hum = !p.dead && p.indoor && !posInPocket(p.pos) && d < 22 && sp !== 'sealed';
    if (hum && !S.spotHum) S.spotHum = playAt('br_glitch_hum', s.pos.clone().setY(s.pos.y + 1.2), 0.55, { loop: true, refDistance: 1.4, maxDistance: 22 });
    else if (!hum && S.spotHum) { S.spotHum.stop(0.5); S.spotHum = null; }
    // walking into the patch noclips you (pressed against it for a moment)
    if (!S.cine && !p.dead && sp !== 'sealed' && d < 1.8) {
      const rx = p.pos.x - s.pos.x, rz = p.pos.z - s.pos.z;
      const along = rx * s.normal.x + rz * s.normal.z;
      const lat = Math.abs(rx * s.normal.z - rz * s.normal.x);
      if (along < 0.62 && lat < 0.72 && Math.abs(p.pos.y - s.pos.y) < 1.5) {
        S.touchT += dt;
        game.engine.fx.noise = Math.max(game.engine.fx.noise, Math.min(0.35, S.touchT));
        if (S.touchT > 0.35) { S.touchT = 0; startNoclip('spot'); }
      } else S.touchT = 0;
    } else S.touchT = 0;
  }

  // ---------------------------------------------------------------- noclip cinematic (local)
  function startNoclip(reason) {
    const p = game.player, r = run();
    if (S.cine || p.dead || !r || r.phase !== 'moon' || !game.net) return false;
    if (reason === 'spot' && (!S.spot || spotState() === 'sealed')) return false;
    if (posInPocket(p.pos)) return false;
    S.go = null;
    S.cine = { t: 0, st: 0, lt: 0, stage: 'tear', reason, hold: reason === 'fall' ? p.pos.clone() : null, teleported: false, warp0: 0 };
    game.grab?.stop?.();
    game.closeMinigame?.();
    p.frozen = true;
    S.overlay = S.overlay || new NoclipOverlay();
    S.overlay.show(true);
    playSound('br_tear', 0.9);
    game.engine.shake(0.35);
    game.net.request('brEnter', { r: reason, p: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)] });
    return true;
  }
  function cineTick(dt) {
    const c = S.cine;
    if (!c) return;
    const p = game.player, eng = game.engine, fx = eng.fx;
    c.t += dt;
    if (p.dead) { endCine(false); return; }
    if (c.hold) { p.teleport(c.hold); p.vel.set(0, 0, 0); }   // fell off the map: hang in the void until the host answers
    if (S.go && S.go.ok === false) { endCine(false, S.go.why); return; }
    if (c.stage === 'tear') {
      const k = Math.min(1, c.t / 0.95);
      fx.noise = Math.max(fx.noise, 0.12 + k * 0.5);
      fx.warp = Math.max(fx.warp || 0, k * 3);
      eng.shake(0.1 + k * 0.25);
      S.overlay.draw('tear', k, c.t);
      if (c.t >= 0.95) { c.stage = 'fall'; eng.fadeTarget = 1; playSound('br_fall', 0.8); }
    } else if (c.stage === 'fall') {
      c.st += dt;
      fx.noise = Math.max(0, 0.6 - c.st);
      fx.warp = Math.max(0, 3 - c.st * 4);
      S.overlay.draw('fall', 1, c.st);
      if (!c.teleported && S.go?.ok && S.pocket && S.pocket.key === S.go.k) {
        c.hold = null;
        p.teleport(new THREE.Vector3().fromArray(S.go.p), S.go.yaw ?? p.yaw);
        p.pitch = 0;
        game.psTimer = 0;
        c.teleported = true;
        c.landAt = Math.max(c.st + 0.9, 1.3);
        S.enteredAt = game.time;
        game.updateAmbience();
      }
      if (!c.teleported && c.st > 7) { endCine(false, 'timeout'); return; }
      if (c.teleported && c.st >= c.landAt) { c.stage = 'land'; landThud(); }
    } else if (c.stage === 'land') {
      c.lt += dt;
      S.overlay.draw('land', Math.max(0, 1 - c.lt / 0.7), c.lt);
      if (c.lt > 0.7) endCine(true);
    }
  }
  function landThud() {
    const p = game.player, eng = game.engine;
    eng.fadeTarget = 0; eng.fx.fade = 0.4;
    game.sfx('land_hard', 0.95);
    eng.shake(0.8); eng.punch?.(-0.09, 0, (Math.random() - 0.5) * 0.08);
    p.landVel = (p.landVel || 0) + 2.2;
    try { game.footstep(p.pos, 0.8, true); } catch { /* ignore */ }
    game.ui.hud?.bigText(game.w3?.title?.() || t('LEVEL 0'), t('You noclipped out of reality.'));
  }
  function endCine(ok, why) {
    const p = game.player, eng = game.engine;
    p.frozen = false;
    eng.fadeTarget = 0;
    eng.fx.noise = 0; eng.fx.warp = 0;
    S.overlay?.show(false);
    const wasHold = S.cine?.hold;
    S.cine = null; S.go = null;
    if (ok) return;
    if (wasHold && !p.dead) p.teleport(wasHold);   // (falls resume: the void still wins)
    const msg = why === 'sealed' ? 'The wall is just a wall again.' : why === 'phase' ? 'Reality holds. For now.' : 'The wall pushes you back.';
    if (!p.dead) game.ui.toast(t(msg), 'info');
  }

  // ---------------------------------------------------------------- leaving
  function exitDestination() {
    const fac = game.world.facility;
    if (fac?.mainDoor?.spawn) return { p: fac.mainDoor.spawn.clone(), yaw: fac.mainDoor.faceYaw ?? 0 };
    const p = new THREE.Vector3(SHIP.door.x, 0, SHIP.z1 + 3);
    p.y = (game.world.terrain?.heightAt?.(p.x, p.z) ?? 0) + 0.2;
    return { p, yaw: 0 };
  }
  function sendHome(why) {
    const p = game.player;
    const d = exitDestination();
    game.grab?.stop?.();
    game.engine.flash(0x000000, 1);
    p.teleport(d.p, d.yaw); p.pitch = 0;
    game.psTimer = 0;
    game.net?.request('brLeave', { r: why });
    S.enteredAt = 0;
    game.updateAmbience();
  }
  function exitPocket() {
    const p = game.player;
    if (!posInPocket(p.pos) || p.dead || S.cine) return;
    playSound('br_exit', 0.9);
    sendHome('exit');
    game.ui.hud?.bigText(t('EXIT'), t('Reality resumes. Mostly.'));
  }

  // ---------------------------------------------------------------- host: membership, loot, hunts, lost
  function ensureRunBr() {
    const r = run();
    if (!r.br || r.br.d !== r.day) r.br = { d: r.day, n: 0, k: 0, m: [], sp: 'idle', hunt: 0 };
    return r.br;
  }
  function hostEnter(from, reason, claimed) {
    const r = run();
    const deny = (why) => game.net.sendTo(from, 'brgo', { ok: false, why });
    if (!r || r.phase !== 'moon' || !game.world.facility || game.world.company) return deny('phase');
    const ap = game.aiPlayerById(from);
    if (!ap || ap.dead) return deny('dead');
    // each peer owns its own position: trust the position sent with the request when it is close to what we last saw
    const cp = Array.isArray(claimed) && claimed.length === 3 && claimed.every(Number.isFinite) ? new THREE.Vector3(...claimed) : null;
    const pos = cp && cp.distanceTo(ap.pos) < 30 ? cp : ap.pos;
    const b = ensureRunBr();
    if (reason === 'spot') {
      if (!S.spot || b.sp === 'sealed') return deny('sealed');
      if (Math.hypot(pos.x - S.spot.pos.x, pos.z - S.spot.pos.z) > 6 || Math.abs(pos.y - S.spot.pos.y) > 4) return deny('far');
    } else if (reason === 'debug') { if (from !== game.selfId) return deny('reason'); }
    else if (reason !== 'fall') return deny('reason');
    if (!b.k) {
      b.n = (b.n | 0) + 1;
      b.k = pocketKey(r.seed, r.day, b.n);
      b.m = []; b.hunt = 0; b.th = reason === 'fall' ? 0 : (game.w3?.doorTheme?.() || 0); b.lk = 0;   // [worlds3] themed pocket
      Object.assign(S.host, { t0: game.time, warned: false, nextSpawn: 0, emptyT: 0, cleanT: 1 });
      S.host.spawned.clear(); S.host.outT.clear();
      ensurePocket(b.k);
      game.broadcastRun(['br']);                         // run.br first, then 'brst': clients never see a stale key
      game.net.broadcast('brst', { k: b.k });          // every peer builds now, before any loot arrives
      hostSpawnLoot();
    }
    if (!S.pocket) return deny('build');
    if (!b.m.includes(from)) b.m.push(from);
    if (reason === 'spot' && b.sp === 'idle') {
      b.sp = 'open';
      clearTimeout(S.host.sealTimer);
      S.host.sealTimer = game.later(() => { const bb = br(); if (bb && bb.sp === 'open') { bb.sp = 'sealed'; game.broadcastRun(['br']); } }, S.spotOpenS * 1000);
    }
    const pk = S.pocket;
    let spawn, yaw = Math.random() * Math.PI * 2;
    if (reason === 'fall') spawn = pk.landings[Math.floor(Math.random() * pk.landings.length)] || pk.spawn;
    else { const i = b.m.length - 1, a = i * 2.1; spawn = pk.spawn.clone().add(new THREE.Vector3(Math.cos(a) * (i ? 1.3 : 0), 0, Math.sin(a) * (i ? 1.3 : 0))); }
    S.host.emptyT = 0;
    game.broadcastRun(['br']);
    game.net.sendTo(from, 'brgo', { ok: true, k: b.k, p: [spawn.x, spawn.y, spawn.z], yaw });
    game.net.broadcast('brfx', { k: 'noclip', id: from, p: [pos.x, pos.y, pos.z], r: reason });
  }
  function hostLeave(from, why) {
    const b = br();
    if (!b?.k) return;
    const i = b.m.indexOf(from);
    if (i < 0) return;
    b.m.splice(i, 1);
    game.broadcastRun(['br']);
    if (why === 'exit') game.net.broadcast('xp', { to: from, xp: 90 + (run().quotaIndex | 0) * 15, coin: 12, reason: 'Escaped the Backrooms' });
  }
  function hostUnload() {
    const b = br(), pk = S.pocket;
    if (pk) {
      for (const c of [...game.creatures.host.values()]) if (pk.contains(c.pos)) game.creatures.hostRemove(c.id);
      for (const it of [...game.items.all()]) if (it.state === 'world' && !it.holder && pk.contains(it.obj.position)) game.net.broadcast('it', { e: 'rm', id: it.id });
    }
    if (b) { b.k = 0; b.m = []; b.hunt = 0; game.broadcastRun(['br']); }
    S.host.spawned.clear();
    game.net.broadcast('brst', { k: 0 });
  }
  function weightedPick(tbl) {
    let tot = 0;
    for (const [, w] of tbl) tot += w;
    let x = Math.random() * tot;
    for (const [id, w] of tbl) { x -= w; if (x <= 0) return id; }
    return tbl[tbl.length - 1]?.[0];
  }
  function hostSpawnLoot() {
    const pk = S.pocket;
    if (!pk) return 0;
    patchAlmondWater();
    const r = run();
    const spots = pk.loot.slice().sort(() => Math.random() - 0.5);
    const list = [];
    if (ITEMS[ALMOND]) for (let i = 0, n = 2 + (Math.random() < 0.5 ? 1 : 0); i < n; i++) list.push(ALMOND);
    list.push('br_carpet'); if (Math.random() < 0.6) list.push('br_carpet');
    list.push('br_polaroid'); if (Math.random() < 0.4) list.push('br_polaroid');
    const tbl = (SCRAP_TABLE.backrooms || []).filter(([id]) => ITEMS[id] && !BR_ITEMS.includes(id) && id !== ALMOND);
    for (let i = 0; i < 3 && tbl.length; i++) list.push(weightedPick(tbl));
    const valueMul = (1 + (r.quotaIndex | 0) * 0.12) * (game.w3?.lootHook?.(list, br()?.th, pk, spots) ?? 1);   // [worlds3] themed loot table
    let n = 0;
    const put = (type, s) => { if (!s || !ITEMS[type]) return; const id = game.items.hostSpawn(type, new THREE.Vector3(s.x, pk.y + 0.35, s.z), { valueMul }); n++; try { game.rewardviz?.pocketItem(id); } catch { /* cosmetic */ } };
    // the valuable ones wait in the dark
    const darkFirst = () => { const j = spots.findIndex((s) => s.dark); return spots.splice(j >= 0 ? j : 0, 1)[0]; };
    put('br_exitsign', darkFirst());
    if (Math.random() < 0.3) put('br_levelkey', darkFirst());
    for (const type of list) put(type, spots.shift());
    S.host.loot = n;
    return n;
  }
  function pickHunter() {
    { const ov = game.w3?.pickHunter?.(br()?.th); if (ov) return ov; }   // [worlds3] per-world hunters
    const reg = HUNTERS.filter(([id]) => CREATURES[id]).map(([id]) => id);
    const pool = reg.length ? reg : HUNTERS.map(([, f]) => f).filter((id) => CREATURES[id]);
    // weighted: Smilers and Pale Hounds are the pocket's hunters, the Partygoer (a Level Fun native) only strays in now and then
    const W = { br_smiler: 45, br_hound: 40, br_partygoer: 15 };
    const tot = pool.reduce((a, id) => a + (W[id] || 30), 0);
    let roll = Math.random() * tot, id = pool[0] || 'lurker';
    for (const c of pool) { roll -= W[c] || 30; if (roll <= 0) { id = c; break; } }
    return { id, dark: id === 'br_smiler' || id === 'lurker' };
  }
  function hostSpawnHunter(ids, forceType) {
    const pk = S.pocket;
    if (!pk) return null;
    const nav = pk.nav;
    const pl = (ids || members()).map((id) => game.aiPlayerById(id)).filter((p) => p && !p.dead);
    if (!pl.length) return null;
    const fields = pl.map((p) => nav.distanceField(p.pos.x, p.pos.z, 40));
    const pick = forceType ? { id: forceType, dark: false } : pickHunter();
    if (!CREATURES[pick.id]) return null;
    let best = null;
    for (let k = 0; k < 60 && !best; k++) {
      const w = nav.randomWalkable(Math.random);
      if (!w) continue;
      let dmin = Infinity;
      for (const f of fields) dmin = Math.min(dmin, nav.fieldAt(f, w.x, w.z));
      if (dmin < 14) continue;
      if (pick.dark && k < 35 && !pk.isDark(w.x, w.z)) continue;
      best = w;
    }
    if (!best) return null;
    const c = game.creatures.hostSpawn(pick.id, new THREE.Vector3(best.x, pk.y, best.z), { zone: 'in', level: game.rollLevel?.() || 1, data: { brPocket: 1 } });
    if (c) S.host.spawned.add(c.id);
    return c;
  }
  function hostTick(dt) {
    const b = br(), r = run();
    if (!b?.k || !S.pocket) return;
    S.host.cleanT -= dt;
    if (S.host.cleanT <= 0) {
      S.host.cleanT = 1;
      const before = b.m.length;
      b.m = b.m.filter((id) => {
        const ap = game.aiPlayerById(id);
        if (!ap || ap.dead) return false;
        // left without a brLeave (ship teleporter beam, desync): dropped after ~6 s outside the pocket
        const tOut = posInPocket(ap.pos) ? 0 : (S.host.outT.get(id) || 0) + 1;
        S.host.outT.set(id, tOut);
        return tOut < 6;
      });
      if (b.m.length !== before) game.broadcastRun(['br']);
    }
    if (!b.m.length) {
      S.host.emptyT += dt;
      if (S.host.emptyT > 4 && b.sp !== 'open') hostUnload();   // kept while followers can still come through the wall
      return;
    }
    S.host.emptyT = 0;
    if (r.phase !== 'moon') return;
    const age = game.time - S.host.t0;
    const huntAfter = game.w3?.huntAfter?.() ?? HUNT_AFTER;   // [worlds3] Level Fun: the party starts early
    if (age > Math.min(WARN_AT, huntAfter - 20) && !S.host.warned) { S.host.warned = true; game.net.broadcast('brfx', { k: 'warn' }); }
    if (age > huntAfter) {
      if (!b.hunt) { b.hunt = 1; game.broadcastRun(['br']); game.net.broadcast('brfx', { k: 'hunt' }); S.host.nextSpawn = 0; }
      S.host.nextSpawn -= dt;
      if (S.host.nextSpawn <= 0) {
        { const he = game.w3?.huntEvery?.(); S.host.nextSpawn = he ? he[0] + Math.random() * (he[1] - he[0]) : 32 + Math.random() * 20; }
        for (const id of [...S.host.spawned]) { const c = game.creatures.host.get(id); if (!c || c.dead) S.host.spawned.delete(id); }
        const cap = Math.min(5, 1 + b.m.length + Math.floor((age - huntAfter) / 150) + (game.w3?.huntCap?.() ?? 0));
        if (S.host.spawned.size < cap) hostSpawnHunter(b.m);
      }
    }
  }

  // ---------------------------------------------------------------- local presentation
  function envTick(dt) {
    const cam = game.camera.position;
    const inside = !!S.pocket && S.pocket.contains(cam);
    const env = game.env, L = game.lights;
    if (inside !== S.camIn) {
      S.camIn = inside;
      if (inside) { S.savedFog = env.interiorFog; if (!S.enteredAt) S.enteredAt = game.time; }
      else { env.interiorFog = S.savedFog !== undefined ? S.savedFog : (game.world.facility?.atmosphere || null); L.ambient.color.set(0xffffff); S.savedFog = undefined; }
      game.updateAmbience();
      if (!game.liminal?.vhs && !game.liminal) { S.vhs = S.vhs || new VhsOverlay(); S.vhs.show(inside); }   // the liminal module owns the footage look when installed
      dockShow(inside);
    }
    if (!inside) return;
    const pk = S.pocket;
    if (S.lostT >= 0) { S.lostT += dt; pk.setLight(Math.max(0.03, 1 - S.lostT / 3)); }
    else {
      // the whole level browns out for a blink now and then (cosmetic, local)
      S.flickT = (S.flickT ?? 25 + Math.random() * 40) - dt;
      if (S.flickT <= 0) { S.flickT = 30 + Math.random() * 60; S.flickLeft = 0.35 + Math.random() * 0.5; playSound('light_flicker', 0.5); }
      if (S.flickLeft > 0) { S.flickLeft -= dt; pk.setLight(S.flickLeft > 0 ? (Math.random() < 0.5 ? 0.35 : 0.8) : 1); }
    }
    const k = pk.lightAt(cam.x, cam.z) * (pk.lightLevel ?? 1);
    S.lk += (k - S.lk) * Math.min(1, dt * 3);
    const lk3 = game.w3?.look?.();   // [worlds3] themed pocket palette (null = Level 0 yellow)
    S.fog.fog = (lk3 ? _fogTmp.set(lk3.fog) : _fogTmp.copy(FOG_COL)).multiplyScalar(0.18 + 0.82 * S.lk).getHex();
    S.fog.density = (lk3?.dens ?? FOG_DENSITY) * (1.25 - 0.25 * S.lk);
    env.interiorFog = S.fog;
    // non-baked things (creatures, items, crewmates) get a flat warm fill that follows the local light
    L.hemi.intensity = 0.04 + 0.55 * S.lk;
    if (lk3) { L.hemi.color.setRGB(...lk3.hemi); L.hemi.groundColor.setRGB(...lk3.hemiG); } else { L.hemi.color.setRGB(1, 0.94, 0.78); L.hemi.groundColor.setRGB(0.36, 0.3, 0.14); }
    L.ambient.intensity = 0.02 + 0.12 * S.lk; if (lk3) L.ambient.color.setRGB(...lk3.amb); else L.ambient.color.setRGB(1, 0.92, 0.7);
    S.vhs?.update(dt, game.time - (S.enteredAt || game.time));
  }
  function pocketAmbience() {
    const a = game.audio;
    ensureSound('br_hum');
    a.setAmbience('base', a.has('ambience_backrooms') ? 'ambience_backrooms' : 'ambience_facility', 0.5);
    a.setAmbience('buzz', 'br_hum', 0.2 * (S.pocket?.lightLevel ?? 1));
    a.setEnvironment?.('facility');
  }
  function dockShow(on2) {
    // bottom-left, right above the camcorder "PLAY" counter: reads as part of the found-footage OSD
    if (on2 && !S.dock) { S.dock = hudDock('left', 'br_level0', 3); S.hudT = 0; S.dockHtml = ''; }
    else if (!on2 && S.dock) { S.dock.remove(); S.dock = null; }
  }
  function hudTick(dt) {
    if (!S.dock) return;
    S.hudT -= dt;
    if (S.hudT > 0) return;
    S.hudT = 0.3;
    const b = br(), p = game.player;
    const walkie = p.slots.some((id) => { const it = id && game.items.get(id); return it?.type === 'walkie' && it.on; });
    const blink = Math.floor(game.time * 2) % 2 === 0;
    const hunting = !!b?.hunt, lost = S.lostT >= 0;
    const html = `<div style="background:linear-gradient(270deg,rgba(40,32,6,0),rgba(40,32,6,0.66));padding:6px 30px 7px 12px;text-align:left;font-family:monospace">
      <div style="font:700 26px/1 monospace;letter-spacing:6px;color:#ffe27a;text-shadow:0 0 10px rgba(255,210,80,0.55),2px 2px 0 #000">${game.w3?.title?.() || t('LEVEL 0')}</div>
      <div style="font:13px/1.35 monospace;color:#e9dca8;opacity:0.85">${game.w3?.sub?.() || t('"The Lobby"')} · ${t('∞ sq mi')}</div>
      <div style="font:700 14px/1.4 monospace;color:${walkie && blink ? '#ff5a4a' : '#b8a67a'}">⌁ ${t('NO SIGNAL')}</div>
      <div style="font:700 13px/1.4 monospace;color:${lost ? '#ff3a2a' : hunting ? (blink ? '#ff5a4a' : '#ff9a5a') : '#9fb89a'}">${lost ? t('THE SHIP HAS LEFT') : hunting ? t('ENTITIES: HUNTING') : t('ENTITIES: DORMANT')}</div>
    </div>`;
    if (html !== S.dockHtml) { S.dock.innerHTML = html; S.dockHtml = html; }
  }
  function markerTick(dt) {
    if (S.keyCd > 0) S.keyCd -= dt;
    if (!S.marker) return;
    const pk = S.pocket;
    if (!pk || !posInPocket(game.player.pos)) { S.marker.dispose(); S.marker = null; return; }
    const d = Math.round(game.player.pos.distanceTo(pk.exit.signPos));
    if (!S.marker.update(dt, game.camera, pk.exit.signPos, `▲<br>${tf('EXIT {d} m', { d })}`)) S.marker = null;
  }
  function fallTick() {
    const p = game.player, r = run();
    const y = p.pos.y;
    if (!r || p.dead || S.cine || r.phase !== 'moon' || !game.world.outdoor || game.world.company) { S.lastY = y; return; }
    if (y > -60 && !p.inShip) S.outdoorT = game.time;
    if (S.lastY > FALL_Y && y <= FALL_Y && S.lastY - y < 8 && p.vel.y < -5 && game.time - S.outdoorT < 15 && !posInPocket(p.pos)) {
      const roll = S.forceFall ?? (Math.random() < FALL_CHANCE);
      S.lastFallRoll = roll;
      if (roll) startNoclip('fall');
    }
    S.lastY = y;
  }
  function memberEvents() {
    const cur = members().join(',');
    if (cur === S.members) return;
    const prev = S.members ? S.members.split(',') : [];
    const now = cur ? cur.split(',') : [];
    for (const id of now) if (!prev.includes(id)) game.mods?.emit('tfg:backrooms', { phase: 'enter', who: id, key: br()?.k || 0 });
    for (const id of prev) if (!now.includes(id)) game.mods?.emit('tfg:backrooms', { phase: 'exit', who: id, key: S.builtKey });
    S.members = cur;
  }
  function onFx(d) {
    if (!d) return;
    const inside = posInPocket(game.player.pos) && !game.player.dead;
    if (d.k === 'noclip') {
      if (d.id === game.selfId || !Array.isArray(d.p)) return;
      const pos = new THREE.Vector3().fromArray(d.p);
      if (pos.distanceTo(game.player.pos) < 40) { playAt('br_tear', pos.clone().setY(pos.y + 1), 0.8); game.particles?.burst(pos.clone().setY(pos.y + 1.1), 'sparks', null, 1.6); }
      game.ui.chatMessage?.(null, `${game.playerName(d.id)} ${t('slipped through the wall.')}`, false, 'info');
    } else if (d.k === 'warn' && inside) {
      game.ui.toast(t('You are not alone on this level.'), 'bad');
      const a = Math.random() * Math.PI * 2;
      game.audio.at(game.audio.variant('distant_growl'), game.player.pos.clone().add(new THREE.Vector3(Math.cos(a) * 18, 1, Math.sin(a) * 18)), 0.7);
    } else if (d.k === 'hunt' && inside) {
      game.ui.toast(t('The entities are awake. Keep moving.'), 'bad');
      game.audio.play(game.audio.variant('sting'), { volume: 0.7, bus: 'sfx' });
    } else if (d.k === 'lost' && inside) {
      S.lostT = 0;
      game.audio.play('power_down', { volume: 0.9, bus: 'sfx' });
      game.ui.hud?.bigText(t('THE SHIP HAS LEFT'), t('You are lost in the Backrooms.'));
    }
  }

  // ---------------------------------------------------------------- items
  function drinkAlmond(it) {
    const p = game.player;
    const d = itemDef(it.type).drink || { hp: 25, calm: 20 };
    p.hp = Math.min(p.maxHp || 100, p.hp + (d.hp || 25));
    p.stamina = p.maxStamina; p.exhausted = false;
    game.engine.fx.noise = 0; game.engine.fx.blind = 0;
    game.sfx('heal', 0.6);
    game.net.request('consume', { id: it.id });
    game.net.send('pst', { hp: Math.round(p.hp) });
    game.ui.toast(t('Almond Water. You feel... okay.'), 'good');
    game.mods?.emit('tfg:calm', { who: game.selfId, t: d.calm || 20 });
  }
  function showPhoto(it) {
    const seed = hashString('polaroid|' + it.id);
    game.sfx('flashlight_click', 0.6);
    try { if (game.liminal?.showPhoto) { game.liminal.showPhoto(seed); return; } } catch (e) { console.warn('liminal photo', e); }
    showPolaroidCard(seed, t);
  }
  function useLevelKey() {
    if (S.keyCd > 0) return;
    S.keyCd = 6;
    if (!posInPocket(game.player.pos) || !S.pocket) { game.ui.toast(t('The key is cold. It only works in there.'), 'info'); return; }
    game.sfx('keypad_beep_2', 0.7);
    game.ui.toast(t('The key hums toward the EXIT.'), 'good');
    S.marker?.dispose();
    S.marker = new WorldMarker('▲', '#3dff85', 9);
  }

  // ---------------------------------------------------------------- patches on game instances (restored on dispose)
  const patches = [];
  const patch = (obj, key, make) => { if (!obj) return; const prev = obj[key]; const own = Object.prototype.hasOwnProperty.call(obj, key); const fn = make(prev); obj[key] = fn; patches.push(() => { if (obj[key] === fn) { if (own) obj[key] = prev; else delete obj[key]; } }); };
  // creatures standing in the pocket use the pocket nav, only see pocket players and stay on its floor
  const M = game.creatures;
  patch(M, 'nav', (prev) => function (c) { return S.pocket && c && S.pocket.contains(c.pos) ? S.pocket.nav : prev.call(this, c); });
  patch(M, 'playersFor', (prev) => function (c) {
    const list = prev.call(this, c);
    if (!S.pocket || !c) return list;
    const inP = S.pocket.contains(c.pos);
    return list.filter((p) => S.pocket.contains(p.pos) === inP);
  });
  patch(M, 'placeAt', (prev) => function (c, x, z) {
    const inP = S.pocket && c && S.pocket.contains(c.pos);
    prev.call(this, c, x, z);
    if (inP) c.pos.y = POCKET.y;
  });
  // walkies have no signal in (or into) the Backrooms
  patch(game, 'hasActiveWalkie', (prev) => function (peerId) {
    if (S.pocket && (posInPocket(game.player.pos) || posInPocket(posOf(peerId)))) return false;
    return prev.call(this, peerId);
  });
  patch(game, 'deathText', (prev) => function (cause) { return cause === LOST_CAUSE ? t('got lost in the Backrooms.') : prev.call(this, cause); });
  patch(game, 'updateAmbience', (prev) => function () { prev.call(this); if (S.camIn && !game.player.dead) pocketAmbience(); });
  // damp carpet under the feet
  patch(game, 'footstep', (prev) => function (pos, vol, local) {
    if (!S.pocket || !pos || !S.pocket.contains(pos)) return prev.call(this, pos, vol, local);
    const wet = S.pocket.plan.puddles.some((q) => Math.hypot((pos.x - q.x) / q.rx, (pos.z - q.z) / q.rz) < 1);
    const name = game.audio.variant(wet ? 'step_water' : 'step_carpet');
    if (local) game.audio.play(name, { volume: vol * 0.85, bus: 'sfx', pitch: 0.92 + Math.random() * 0.12 });
    else game.audio.at(name, pos.clone().setY(pos.y + 0.1), vol, { occlude: true, refDistance: 1.5, maxDistance: 30 });
  });
  // objectives: hide facility-only hints (rooms 5000 m away) while inside
  if (game.objectives?.compute) patch(game.objectives, 'compute', (prev) => function () {
    const out = prev.call(this);
    if (!posInPocket(game.player.pos)) return out;
    return out.filter((o) => o.kind === 'main' || o.kind === 'warn' || o.kind === 'bounty' || S.myLines.has(o.text));
  });

  // ---------------------------------------------------------------- mod events
  on('netReady', (net) => {
    net.on_('brst', (d, from) => { if (fromHost(from)) ensurePocket(d?.k || 0); });
    net.on_('brgo', (d, from) => { if (fromHost(from)) S.go = d || null; });
    net.on_('brfx', (d, from) => { if (fromHost(from)) onFx(d); });
  });
  on('registerHandlers', (H) => {
    H('brEnter', (d, from) => hostEnter(from, d?.r, d?.p));
    H('brLeave', (d, from) => hostLeave(from, d?.r));
  });
  on('mapLoaded', () => {
    computeSpot();
    const b = br();
    if (b?.k) ensurePocket(b.k);       // late joiner: build before the welcome's items are created
  });
  on('phase', (ph) => {
    if (ph === 'orbit' || ph === 'fired') {
      if (game.isHost && run()?.br) { run().br = null; game.broadcastRun(['br']); }
      ensurePocket(0); disposeSpot(); S.lostT = -1;
      if (S.pocket === null && S.lk !== 1) S.lk = 1;
    }
    if (ph === 'landing') { S.lostT = -1; S.lastY = game.player.pos.y; }
    if (game.isHost && ph === 'takeoff') {
      const b = br();
      if (b?.k && b.m.length) {
        game.net.broadcast('brfx', { k: 'lost' });
        const ids = b.m.slice();
        game.later(() => {
          for (const id of ids) { const ap = game.aiPlayerById(id); if (ap && !ap.dead && posInPocket(ap.pos)) game.hostHurtPlayer(id, 999, LOST_CAUSE); }
        }, 3200);
      }
    }
  });
  on('interactables', (out) => {
    const p = game.player;
    if (p.dead || S.cine) return;
    if (S.pocket && posInPocket(p.pos)) {
      const ex = S.pocket.exit;
      const lock = game.w3?.exitLock?.();   // [worlds3] Ward 13: the EXIT is locked until the ward key is picked up
      out.push({ pos: ex.interact, r: 0.9, reach: 2.6, label: lock ? t('EXIT (locked)') : t('Take the EXIT [E]'), sub: lock || t('Back to the facility entrance'), action: () => { if (lock) { game.ui.toast(lock, 'bad'); game.sfx?.('door_locked', 0.6); } else exitPocket(); } });
      return;
    }
    const s = S.spot;
    if (s && p.indoor && spotState() !== 'sealed' && p.pos.distanceTo(s.pos) < 4) {
      out.push({ pos: s.pos.clone().setY(s.pos.y + 1.2), r: 0.9, reach: 2.4, label: game.w3?.doorLabel?.() || t('Touch the wall [E]'), sub: game.w3?.doorSub ? game.w3.doorSub(spotState() === 'open') : (spotState() === 'open' ? t('It is open. Someone went through.') : t('The wallpaper is humming.')), action: () => startNoclip('spot') });
    }
  });
  on('useItem', (it, hk) => {
    if (!it || hk.handled) return;
    if (it.type === ALMOND) { hk.handled = true; drinkAlmond(it); }
    else if (it.type === 'br_polaroid') { hk.handled = true; showPhoto(it); }
    else if (it.type === 'br_levelkey') { hk.handled = true; useLevelKey(it); }
  });
  on('objectives', (add, g, phase) => {
    if ((phase !== 'moon' && phase !== 'takeoff') || game.player.dead || !posInPocket(game.player.pos)) return;
    const line = (txt, kind) => { S.myLines.add(txt); add(txt, kind); };
    line(t('Find the green EXIT sign'), 'main');
    line(t('NO SIGNAL: walkies are dead on this level'), 'hint');
    if (br()?.hunt) line(t('Something is hunting on this level'), 'warn');
    if (phase === 'takeoff') line(t('The ship is leaving without you'), 'warn');
  });
  on('update', (dt) => {
    if (!run()) return;
    try {
      const b = br();
      const want = b?.k && (run().phase === 'moon' || run().phase === 'takeoff') ? b.k : 0;
      if (want !== S.builtKey && !(want && !game.world.facility)) ensurePocket(want);
      S.pocket?.update(dt);
      spotTick(dt);
      cineTick(dt);
      fallTick();
      envTick(dt);
      hudTick(dt);
      markerTick(dt);
      memberEvents();
      if (game.isHost) hostTick(dt);
    } catch (e) { if (!S.errLogged) { S.errLogged = true; console.error('backrooms', e); } }
  });

  function dispose() {
    for (const off of offs.splice(0)) { try { off(); } catch { /* ignore */ } }
    for (const un of patches.splice(0).reverse()) { try { un(); } catch { /* ignore */ } }
    clearTimeout(S.host.sealTimer);
    if (S.cine) { game.player.frozen = false; S.cine = null; }
    S.spotHum?.stop(0.1);
    disposeSpot();
    if (S.pocket) { S.pocket.dispose(); S.pocket = null; S.builtKey = 0; }
    S.overlay?.dispose(); S.vhs?.dispose(); S.marker?.dispose(); S.dock?.remove();
    S.overlay = S.vhs = S.marker = S.dock = null;
  }

  return {
    get pocket() { return S.pocket; },
    get spot() { return S.spot; },
    get state() { return br(); },
    /** is a peer (default: me) inside the Backrooms pocket? (host membership, or my own position) */
    inPocket(peerId) {
      const id = peerId || game.selfId;
      if (members().includes(id)) return true;
      return posInPocket(posOf(id));
    },
    /** local: noclip now ('spot' needs the glitch wall, 'fall', 'debug' = host-only test entry) */
    enter(reason = 'debug') { return startNoclip(reason); },
    /** local: take the EXIT (only works while inside) */
    exit() { exitPocket(); },
    /** host test hooks */
    hostSpawnHunter: (type) => (game.isHost ? hostSpawnHunter(null, type) : null),
    debug: S,
    dispose,
  };
}

// ------------------------------------------------------------------ the Level 0 moon
function registerLevel0Moon(api) {
  if (!BIOMES.br_liminal) {
    BIOMES.br_liminal = {
      ...BIOMES.moor,
      name: 'Liminal Flats', ground: 'grass_dry', ground2: 'mud', rock: 'rock',
      tint: 0xd8c27c, pathTint: 0xb9a262, rockTint: 0xb4a474,
      sky: 0xcbb46c, fog: 0xc0a862, fogDensity: 0.03, night: 0x221c08, sun: 0xfff0c0,
      height: 6, rough: 0.35, trees: 'dead_tree', treeDensity: 0.12, treeTint: 0x8a7a4a, noBushes: true, planet: 0xd8c060,
      poi: ['lamp_post', 'fence_segment', 'ruined_wall', 'power_pylon', 'fence_segment', 'lamp_post', 'ext:bollard_concrete_light', 'ext:barrier_jersey'],
      landmarks: ['power_pylon', 'ext:kk_lights'],
    };
  }
  const def = {
    id: LEVEL0_MOON, name: '∅-Level 0', short: 'Level 0', tier: 3, cost: 404, biome: 'br_liminal', interior: 'backrooms', size: 1.6,
    desc: 'A moon that should not be on the map. The facility never ends and the hum never stops. The walls are thin here.',
    weather: ['foggy', 'foggy', 'clear', 'eclipsed'], scrapCount: [18, 24], scrapMul: 1.3, power: 6, outdoorPower: 3,
    // br_* ids only spawn once the entities module registered them (the host filters unknown ids at spawn time)
    creatures: { lurker: 16, mannequin: 14, screamer: 10, jester: 5, spider: 5, scuttler: 8, leech: 6, mimic: 5, sludge: 4, br_smiler: 18, br_partygoer: 8, br_hound: 8, turret: 2, mine: 5 },
    outdoor: { hound: 10, mimic: 3 },
    brGlitch: 1,          // the glitch wall is always there on this moon
  };
  if (api?.registerMoon) api.registerMoon(def); else registerMoon(def);
  return MOONS[LEVEL0_MOON];
}

// ------------------------------------------------------------------ Turkish strings
const TR = {
  'LEVEL 0': 'SEVİYE 0',
  'You noclipped out of reality.': 'Gerçeklikten noclip yaptın.',
  'Touch the wall [E]': 'Duvara dokun [E]',
  'The wallpaper is humming.': 'Duvar kâğıdı vızıldıyor.',
  'It is open. Someone went through.': 'Açık. Biri içinden geçti.',
  'Take the EXIT [E]': "ÇIKIŞ'tan geç [E]",
  'EXIT (locked)': 'ÇIKIŞ (kilitli)',
  'Back to the facility entrance': 'Tesis girişine dönüş',
  'EXIT': 'ÇIKIŞ',
  'EXIT {d} m': 'ÇIKIŞ {d} m',
  'Reality resumes. Mostly.': 'Gerçeklik devam ediyor. Çoğunlukla.',
  'The wall is just a wall again.': 'Duvar yine sadece bir duvar.',
  'The wall pushes you back.': 'Duvar seni geri itiyor.',
  'Reality holds. For now.': 'Gerçeklik dayanıyor. Şimdilik.',
  'Find the green EXIT sign': 'Yeşil ÇIKIŞ tabelasını bul',
  'NO SIGNAL: walkies are dead on this level': 'SİNYAL YOK: telsizler bu seviyede ölü',
  'Something is hunting on this level': 'Bu seviyede bir şey avlanıyor',
  'The ship is leaving without you': 'Gemi sensiz kalkıyor',
  'You are not alone on this level.': 'Bu seviyede yalnız değilsin.',
  'The entities are awake. Keep moving.': 'Varlıklar uyandı. Hareket etmeye devam et.',
  'THE SHIP HAS LEFT': 'GEMİ KALKTI',
  'You are lost in the Backrooms.': "Arka Odalar'da kayboldun.",
  'got lost in the Backrooms.': "Arka Odalar'da kayboldu.",
  'slipped through the wall.': 'duvarın içinden kaydı.',
  'Almond Water. You feel... okay.': 'Badem Suyu. Kendini... iyi hissediyorsun.',
  'The key hums toward the EXIT.': "Anahtar ÇIKIŞ'a doğru vızıldıyor.",
  'The key is cold. It only works in there.': 'Anahtar soğuk. Sadece orada çalışıyor.',
  'NO SIGNAL': 'SİNYAL YOK',
  'ENTITIES: DORMANT': 'VARLIKLAR: UYKUDA',
  'ENTITIES: HUNTING': 'VARLIKLAR: AVDA',
  '"The Lobby"': '"Lobi"',
  '∞ sq mi': '∞ mil²',
  'Escaped the Backrooms': "Arka Odalar'dan kaçtın",
  "You can't do that from here. Try a wall.": 'Buradan yapamazsın. Bir duvarı dene.',
  'Liminal Polaroid': 'Liminal Polaroid',
  'EXIT Sign': 'ÇIKIŞ Tabelası',
  'Level Key': 'Seviye Anahtarı',
  'Damp Carpet Sample': 'Nemli Halı Numunesi',
  'Almond Water': 'Badem Suyu',
  'LMB: look at the photo. It shows a place you have not been. Yet.': 'Sol tık: fotoğrafa bak. Hiç gitmediğin bir yeri gösteriyor. Henüz.',
  'Still glowing. It does not need power.': 'Hâlâ parlıyor. Elektriğe ihtiyacı yok.',
  'LMB inside the Backrooms: it hums toward the EXIT.': "Arka Odalar'da sol tık: ÇIKIŞ'a doğru vızıldar.",
  'It is wet. It has always been wet.': 'Islak. Hep ıslaktı.',
  'LMB: drink (+25 HP, stamina, calms you). Or sell it.': 'Sol tık: iç (+25 can, dayanıklılık, sakinleştirir). Ya da sat.',
  'Liminal Flats': 'Liminal Düzlükler',
  'A moon that should not be on the map. The facility never ends and the hum never stops. The walls are thin here.': 'Haritada olmaması gereken bir ay. Tesis hiç bitmiyor, uğultu hiç susmuyor. Burada duvarlar ince.',
  'level 0 - day ?': 'seviye 0 - gün ?',
  'who took this': 'bunu kim çekti',
  'it was already here': 'zaten buradaydı',
  "don't go back in": 'geri girme',
  'this is my house now': 'burası artık benim evim',
  'the hum stopped once': 'uğultu bir kez durdu',
  'found it in my pocket': 'cebimde buldum',
  'exit was here yesterday': 'çıkış dün buradaydı',
};
