// WAVE 3 worlds2 (docs/wave3/worlds2.md). Installed with `this.useModule('worlds2', installWorlds2)` in game.js (slot [slot:worlds2]).
//   1. SOVIET district (biome `soviet`, fixed moon 1991-Runet Panelka): enterable panel blocks / propaganda / playgrounds (world/worlds2_soviet.js)
//      + RAID director: armed hit squads (game.horde.spawnHitSquad) raid the crew's position at intervals that shrink with the days-in-run factor.
//   2. TWIN-SUN desert (biome `twinsun`, fixed moon A2-Binary Dunes): moisture harvesters, cantina outpost with neutral alien NPCs, sand crawler wreck,
//      scavenger camps (world/worlds2_twinsun.js) + Dune Maw / Tusked Beast / Scavenger Raider / Cantina Alien (worlds2_creatures.js)
//      + Plasma Blade and Blaster Pistol (worlds2_weapons.js).
//   3. PLANET FAUNA: ambient herds + flyers on every outdoor moon (worlds2_fauna.js), hostile Dusk Prowlers after dusk (night director below).
//   4. LOOT PACING + TIME PRESSURE: indoor scrap x0.7 (progression.js BALANCE.lootCountMul, host.js), facility DECAY after mid-day (uncollected loot
//      loses value in steps, lockdown pulses), DAYS-IN-RUN difficulty (creature budget / hp / dmg / speed via balance.scale) - numbers in worlds2_core.js.
// Host-authoritative: every director runs on the host; clients only get `fx` messages (w2decay / w2big / w2bark) and the seeded map.
import * as THREE from 'three';
import { MOONS } from './moons.js';
import '../world/worlds2_biomes.js';
import { SOVIET_MOON, TWINSUN_MOON } from '../world/worlds2_data.js';
import { addTranslations, t, tf, sysMsg } from '../core/i18n.js';
import { RNG } from '../core/rng.js';
import { ITEMS, isSellable, scrapTableFor } from './items.js';
import { scrapValueMul } from './progression.js';
import { insideShip } from '../world/ship.js';
import { hudDock } from '../ui/dock.js';
import { registerWorlds2Creatures, W2_TYPES, isNight } from './worlds2_creatures.js';
import { W2_CREATURE_MODELS, W2_ITEM_MODELS } from '../models/worlds2_models.js';
import { installWorlds2Weapons } from './worlds2_weapons.js';
import { installFauna } from './worlds2_fauna.js';
import { TR, RU } from './worlds2_text.js';
import { dayFactors, DECAY, lateFraction, decayStepsPassed, decayMulAfter, raidInterval, raidSize, raidFaction, raidAngle, prowlerBudget } from './worlds2_core.js';

const SQUAD_TYPES = new Set(['hs_enforcer', 'hs_gunner', 'hs_leader']);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = Math.random;
const fmtClock = (min) => `${Math.floor(min / 60) % 24}:${String(Math.floor(min % 60)).padStart(2, '0')}`;

export function installWorlds2(game) {
  const g = game, mods = game.mods;
  if (!mods) return null;
  registerWorlds2Creatures();
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  const offs = [];
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };

  // ---- models (creatures + items) ---------------------------------------------------------------------------------------
  const mm = (typeof window !== 'undefined' ? window.__kefalMods : null) || mods;
  if (mm?.creatureModels) for (const id of W2_TYPES) if (!mm.creatureModels.has(id)) mm.creatureModels.set(id, (T, o) => W2_CREATURE_MODELS[id](o || {}));
  if (mm?.itemModels) for (const [id, fn] of Object.entries(W2_ITEM_MODELS)) if (!mm.itemModels.has(id)) mm.itemModels.set(id, () => fn());

  const weapons = installWorlds2Weapons(g);
  const fauna = installFauna(g);
  const S = {
    host: null,                 // per-landing host state (reset in moonPopulated)
    bubbles: [],                // client: floating NPC barks
    box: null, boxEl: null, boxT: 0,
    raidSquads: [],             // host: squads whose contact is refreshed for a while (a raid knows where you are)
    stats: { decays: 0, raids: 0, lockdowns: 0, prowlers: 0, npcs: 0 },
  };
  const run = () => g.run;
  const moonOf = () => MOONS[g.run?.moon];
  const isMoonPhase = () => run()?.phase === 'moon' && !moonOf()?.company && !moonOf()?.home && !moonOf()?.expedition;   // [expeditions] the special moons have their own rules
  const hostOn = () => g.isHost && isMoonPhase() && !!g.world?.outdoor;
  const say = (key, vars, kind = 'info') => g.net?.broadcast?.('sys', sysMsg(key, vars, kind));
  const big = (a, b, vars) => g.net?.broadcast?.('fx', { k: 'w2big', a, b, v: vars || undefined });
  const snd = (name, pos, vol = 1) => g.net?.broadcast?.('fx', { k: 'snd', s: name, p: pos ? [pos.x, pos.y, pos.z] : [0, 2, 0], v: vol, r: 30, m: 400 });

  // ==================================================================================== 4. days-in-run difficulty (balance.scale wrapper)
  const B = g.balance;
  const origScale = B?.scale, origHit = B?.hitDamage;
  const scaleCache = new WeakMap();
  function dayScale(kind = 'creature') {
    const s = origScale.call(B, kind);
    const r = run();
    if (!r || !isMoonPhase()) return s;
    const f = dayFactors(r.day), late = lateFraction(r.time) * (r.day >= 2 ? 1 : 0);
    const key = f.extra * 1000 + Math.round(late * 20);
    const c = scaleCache.get(s);
    if (c && c.key === key) return c.val;
    const cr = kind !== 'hazard' && kind !== 'boss';
    const val = Object.freeze({ ...s, spawn: s.spawn * f.spawn * (1 + late * DECAY.lateSpawn), pace: s.pace * (1 + late * DECAY.latePace),
      hp: cr ? s.hp * f.hp : s.hp, dmg: cr ? s.dmg * f.dmg : s.dmg, speed: cr ? s.speed * f.speed : s.speed });
    scaleCache.set(s, { key, val });
    return val;
  }
  if (B && typeof origScale === 'function') {
    B.scale = dayScale;
    if (typeof origHit === 'function') B.hitDamage = function (dmg, c) {
      const r = run();
      if (dmg > 0 && dmg < 999 && r && isMoonPhase() && !c?.def?.hazard && !c?.def?.boss) dmg = Math.max(1, Math.round(dmg * dayFactors(r.day).dmg));
      return origHit.call(B, dmg, c);
    };
  }

  // ==================================================================================== host: per-landing state
  const newHost = () => ({ step: decayStepsPassed(run()?.time ?? 480), lock: DECAY.lockdownAt.map(() => false), raid: { next: null, k: 0, warned: false }, night: false, nightWait: 0, key: `${run()?.seed}:${run()?.moon}` });
  function hostPopulate() {
    if (!g.isHost || !hostOn()) return;
    const r = run(), moon = moonOf();
    S.host = newHost();
    S.raidSquads.length = 0;
    const out = g.world.outdoor, info = out?.decor?.info || null;
    const rng = new RNG(((r.seed | 0) ^ 0x5a5ed) >>> 0);
    const theme = g.world.facility?.layout?.theme || moon.interior;
    const table = scrapTableFor(theme).map(([id, w]) => ({ id, w }));
    const valueMul = (moon.scrapMul || 1) * scrapValueMul(r.quotaIndex) * 0.9;
    const spawnLoot = (s, mul = 1, prize = false) => {
      const id = prize ? rng.pick(['goldbar', 'ring', 'figurine', 'trophy']) : rng.weighted(table).id;
      if (ITEMS[id]) g.items.hostSpawn(id, new THREE.Vector3(s.x, s.y + 0.5, s.z), { valueMul: valueMul * mul });
    };
    // decor loot (Soviet flats + roofs, crawler, camps): fewer than the old flat 100 %, part of the -30 % loot rule
    if (info?.loot) for (const s of info.loot) {
      if (s.kind === 'roof' || s.kind === 'prize') { if (rng.chance(0.65)) spawnLoot(s, 1.4, true); }
      else if (rng.chance(0.62)) spawnLoot(s, 1.0);
    }
    const M = g.creatures;
    const heightAt = (x, z) => g.world.terrain?.heightAt(x, z) ?? 0;
    // ---- twin-sun population: cantina patrons (neutral), scavenger camps, tusk herds, buried maws
    if (info?.kind === 'twinsun') {
      if (info.cantina) info.cantina.npcSpots.forEach((sp, i) => {
        const c = M.hostSpawn('alien_npc', new THREE.Vector3(sp.x, sp.y, sp.z), { zone: 'out', level: 1, elite: false, state: 'idle', yaw: sp.yaw, seed: 100 + i * 7 + ((r.seed >> 3) & 15), data: { role: sp.role }, variant: null, affix: null });
        if (c) S.stats.npcs++;
      });
      for (const cp of info.camps || []) {
        const n = 2 + (rng.chance(0.4) ? 1 : 0) + (moon.tier >= 3 ? 1 : 0);
        for (let i = 0; i < n; i++) M.hostSpawn('scavraider', new THREE.Vector3(cp.x + rng.float(-3, 3), heightAt(cp.x, cp.z), cp.z + rng.float(-3, 3)), { zone: 'out', level: 1 + Math.floor((r.quotaIndex || 0) / 3), state: 'idle', seed: 5 + i, yaw: rng.float(0, 6.28) });
      }
      const herds = 2 + (moon.tier >= 3 ? 1 : 0);
      for (let h = 0; h < herds; h++) {
        const a = rng.float(0, 6.28), d = rng.float(48, 95), hx = Math.cos(a) * d, hz = Math.sin(a) * d;
        if (out.avoid?.(hx, hz, 4)) continue;
        for (let i = 0; i < rng.int(3, 4); i++) M.hostSpawn('tuskbeast', new THREE.Vector3(hx + rng.float(-4, 4), heightAt(hx, hz), hz + rng.float(-4, 4)), { zone: 'out', level: 1, state: 'idle', seed: rng.int(1, 99) });
      }
      for (let i = 0; i < (moon.tier >= 3 ? 2 : 1); i++) {
        const a = rng.float(0, 6.28), d = rng.float(60, 100), x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (!out.avoid?.(x, z, 3)) M.hostSpawn('dunemaw', new THREE.Vector3(x, heightAt(x, z), z), { zone: 'out', level: 1 + Math.floor((r.quotaIndex || 0) / 3), state: 'hidden' });
      }
    }
    // days-in-run notice
    const f = dayFactors(r.day);
    if (f.extra > 0) g.later?.(() => { if (isMoonPhase()) say('Day {d}: the sector is getting harder (+{p}% creatures).', { d: r.day, p: Math.round((f.spawn - 1) * 100) }, 'warn'); }, 4000);
  }

  // ==================================================================================== host: time pressure (decay + lockdown)
  function applyDecay(step) {
    const list = [];
    for (const it of g.items.all()) {
      if (it.collected || it.soulbound || it.type === 'body' || !it.def || !isSellable(it.def)) continue;
      if (it.holder) { const p = g.aiPlayerById?.(it.holder); if (!p || p.inShip) continue; }
      else if (it.state !== 'world' || insideShip(it.obj.position)) continue;
      const nv = Math.max(1, Math.round(it.value * DECAY.mul));
      if (nv >= it.value) continue;
      it.value = nv; list.push([it.id, nv]);
    }
    S.stats.decays++;
    g.net.broadcast('fx', { k: 'w2decay', v: list, step, of: DECAY.steps.length, left: Math.round(decayMulAfter(step) * 100), p: Math.round((1 - DECAY.mul) * 100) });
  }
  function anyInside() { return (g.aiPlayers?.() || []).some((p) => !p.dead && !p.inShip && p.zone === 'in'); }
  function hostTimePressure() {
    const r = run(), H = S.host;
    if (!H) return;
    const steps = decayStepsPassed(r.time);
    while (H.step < steps) { H.step++; applyDecay(H.step); }
    DECAY.lockdownAt.forEach((at, i) => {
      if (r.time >= at && !H.lock[i]) {
        H.lock[i] = true;
        if (anyInside() && g.facilitysys?.force?.('lockdown')) { S.stats.lockdowns++; big('FACILITY LOCKDOWN', 'Blast doors are sealing. Get out or hold on.'); }
      }
    });
  }

  // ==================================================================================== host: raids (Soviet moon + any moon with `raid`)
  const livePlayers = () => (g.aiPlayers?.() || []).filter((p) => !p.dead && !p.inShip);
  function liveSquadSize() { let n = 0; for (const c of g.creatures.host.values()) if (!c.dead && SQUAD_TYPES.has(c.type)) n++; return n; }
  function raidTarget(k) {
    const out = g.world.outdoor, terrain = g.world.terrain;
    const outside = livePlayers().filter((p) => p.zone === 'out');
    let cx, cz, tgt = null;
    if (outside.length) { tgt = outside[0]; cx = outside.reduce((a, p) => a + p.pos.x, 0) / outside.length; cz = outside.reduce((a, p) => a + p.pos.z, 0) / outside.length; }
    else { const e = out?.mainExit?.pos; if (!e) return null; cx = e.x; cz = e.z; tgt = livePlayers()[0] || null; }
    const lim = (terrain?.playHalf ?? 130) - 10;
    const a = raidAngle(run().seed, run().moon, k);
    for (let i = 0; i < 6; i++) {
      const d = (outside.length ? 44 : 22) + rnd() * 14, aa = a + i * 0.7;
      const x = clamp(cx + Math.cos(aa) * d, -lim, lim), z = clamp(cz + Math.sin(aa) * d, -lim, lim);
      if (!out.avoid || !out.avoid(x, z, 1)) return { x, z, y: terrain.heightAt(x, z), tgt };
    }
    return null;
  }
  function launchRaid() {
    const r = run(), moon = moonOf(), cfg = moon.raid, H = S.host;
    if (!g.horde?.spawnHitSquad) return false;
    if (liveSquadSize() >= 6 || !livePlayers().length) return false;
    const pos = raidTarget(H.raid.k);
    if (!pos) return false;
    const faction = raidFaction(cfg, r.seed, moon.id, H.raid.k), n = raidSize(cfg, r.day);
    const squad = g.horde.spawnHitSquad(faction, new THREE.Vector3(pos.x, pos.y, pos.z), n);
    if (!squad.length) return false;
    S.stats.raids++;
    big('RAID!', '{n} hostiles on your position', { n: squad.length });
    snd('ship_alarm', new THREE.Vector3(pos.x, 2, pos.z), 0.7);
    // the raid knows where you are: refresh the squad contact for 40 s
    S.raidSquads.push({ sq: squad[0].data.squad, until: (g.time || 0) + 40, next: 0 });
    return true;
  }
  function hostRaids() {
    const moon = moonOf(), cfg = moon?.raid, H = S.host;
    if (!cfg || !H) return;
    const moonT = g.hostData?.moonT || 0, R = H.raid;
    if (R.next == null) R.next = cfg.first;
    if (!R.warned && moonT >= R.next - 20) {
      R.warned = true;
      big('RAID INBOUND', 'Armed squad approaching your position!');
      snd('ship_alarm', null, 0.6);
    }
    if (moonT >= R.next) {
      if (launchRaid()) { R.k++; R.next = moonT + raidInterval(cfg, run().day) * (0.85 + rnd() * 0.3); R.warned = false; }
      else { R.next = moonT + 25; R.warned = true; }
    }
    // raids know where the crew is
    const now = g.time || 0;
    for (let i = S.raidSquads.length - 1; i >= 0; i--) {
      const q = S.raidSquads[i];
      if (now > q.until) { S.raidSquads.splice(i, 1); continue; }
      if (now < q.next) continue;
      q.next = now + 3.5;
      const near = livePlayers().sort((a, b) => a.pos.distanceTo(new THREE.Vector3(0, 0, 0)) - b.pos.distanceTo(new THREE.Vector3(0, 0, 0)))[0];
      if (near && q.sq) q.sq.contact = { pid: near.id, pos: near.pos.clone(), t: now, zone: near.zone, heard: true };
    }
  }

  // ==================================================================================== host: night director (hostile fauna)
  function hostNight() {
    const H = S.host, moon = moonOf(), r = run();
    if (!H || H.night || !(moon.tier >= 2) || r.time < 18 * 60 + 20 || !g.creatures) return;
    const outside = livePlayers().filter((p) => p.zone === 'out');
    if (!outside.length) return;   // wait until someone is out there
    H.night = true;
    const budget = prowlerBudget(moon.tier, r.day);
    const terrain = g.world.terrain, lim = (terrain?.playHalf ?? 130) - 10;
    let made = 0;
    const packs = Math.max(1, Math.round(budget / 3));
    for (let pk = 0; pk < packs && made < budget; pk++) {
      const c0 = outside[pk % outside.length].pos, a = rnd() * 6.28, d = 48 + rnd() * 22;
      const px = clamp(c0.x + Math.cos(a) * d, -lim, lim), pz = clamp(c0.z + Math.sin(a) * d, -lim, lim);
      for (let i = 0; i < 3 && made < budget; i++) {
        const c = g.creatures.hostSpawn('prowler', new THREE.Vector3(px + (rnd() - 0.5) * 5, terrain.heightAt(px, pz), pz + (rnd() - 0.5) * 5), { zone: 'out', level: 1 + Math.floor((r.quotaIndex || 0) / 3), state: 'idle', seed: made });
        if (c) made++;
      }
    }
    S.stats.prowlers += made;
    if (made) { say('Something howls in the dusk.', {}, 'warn'); snd('hound_howl', null, 0.6); }
  }

  // ==================================================================================== client: fx handlers (banner / decay / barks)
  function bubbleFor(id, text) {
    const v = g.creatures.views.get(id);
    if (!v || typeof document === 'undefined') return;
    const c = document.createElement('canvas'); c.width = 256; c.height = 40;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(8,10,14,0.78)'; ctx.fillRect(0, 4, 256, 32);
    ctx.fillStyle = '#e8b040'; ctx.fillRect(0, 4, 4, 32);
    ctx.font = "20px 'TFG Cyr VT', VT323, monospace"; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.fillText(text, 130, 26, 244);
    const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthTest: false }));
    sp.scale.set(1.9, 0.3, 1); sp.renderOrder = 6;
    g.scene.add(sp);
    S.bubbles.push({ sp, v, t: 0 });
  }
  on('fx', (d) => {
    if (!d || typeof d.k !== 'string' || d.k.slice(0, 2) !== 'w2') return;
    if (d.k === 'w2bark') bubbleFor(d.id, t(String(d.t || '').slice(0, 60)));
    else if (d.k === 'w2big') g.ui?.hud?.bigText?.(t(String(d.a || '')), d.v ? tf(String(d.b || ''), d.v) : t(String(d.b || '')));
    else if (d.k === 'w2decay') {
      if (!g.isHost) for (const [id, v] of Array.isArray(d.v) ? d.v : []) { const it = g.items.get(id); if (it && Number.isFinite(v)) it.value = v; }
      g.ui?.hud?.bigText?.(t('FACILITY DECAY'), tf('Uncollected loot lost {p}% of its value ({left}% left). Get it to the ship.', { p: d.p | 0, left: d.left | 0 }));
      try { g.audio?.play?.('power_down', { volume: 0.5, bus: 'sfx' }); } catch { /* ignore */ }
    }
  });

  // ==================================================================================== client: loot-value clock widget
  function ensureBox() {
    if (S.box || typeof document === 'undefined') return;
    S.box = hudDock('right', 'w2clock', 12);
    S.box.style.cssText = 'display:none;padding:3px 8px;background:rgba(6,4,3,.55);border-right:3px solid #e8a040;font-family:var(--cond,"Arial Narrow",sans-serif);text-transform:uppercase;letter-spacing:1.4px;font-size:12px;color:#f2d8b0;pointer-events:none;text-align:right;line-height:1.35';
  }
  function updateBox(dt) {
    S.boxT -= dt;
    if (S.boxT > 0) return;
    S.boxT = 0.5;
    ensureBox();
    if (!S.box) return;
    const r = run();
    if (!isMoonPhase() || !r || r.time < 13 * 60 || g.world?.company) { if (S.box.style.display !== 'none') S.box.style.display = 'none'; return; }
    const rate = (g.config?.dayLengthSec || 720) / (16 * 60);   // real seconds per game minute
    const n = decayStepsPassed(r.time), val = Math.round(decayMulAfter(n) * 100);
    const nextAt = DECAY.steps.find((s) => s > r.time);
    const lockAt = DECAY.lockdownAt.find((s) => s > r.time);
    const mmss = (min) => { const s = Math.max(0, Math.round((min - r.time) * rate)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    let html = n === 0 ? `${t('LOOT VALUE')} 100% <span style="opacity:.6">(${t('decay starts')} ${mmss(DECAY.steps[0])})</span>` : `${t('LOOT VALUE')} <b style="color:${val < 80 ? '#ff7a4a' : '#ffd070'}">${val}%</b>`;
    if (nextAt && n > 0) html += `<br><span style="opacity:.7">${t('next drop')} ${mmss(nextAt)}</span>`;
    if (lockAt && r.time > 16 * 60) html += `<br><span style="opacity:.7">${t('lockdown')} ${mmss(lockAt)}</span>`;
    S.box.innerHTML = html;
    if (S.box.style.display !== 'block') S.box.style.display = 'block';
  }
  function updateBubbles(dt) {
    for (let i = S.bubbles.length - 1; i >= 0; i--) {
      const b = S.bubbles[i];
      b.t += dt;
      if (b.t > 3.6 || !b.v || b.v.state === 'dead') { b.sp.removeFromParent(); b.sp.material.map?.dispose(); b.sp.material.dispose(); S.bubbles.splice(i, 1); continue; }
      b.sp.position.set(b.v.pos.x, b.v.pos.y + (b.v.height || 1.8) + 0.35 + Math.min(0.2, b.t * 0.1), b.v.pos.z);
      b.sp.material.opacity = b.t > 3 ? 1 - (b.t - 3) / 0.6 : 1;
    }
  }

  // ==================================================================================== drops (wrapped host hook, restored in dispose)
  const origKilled = g.hostOnCreatureKilled;
  function w2Killed(c, by) {
    const r = origKilled?.call(g, c, by);
    try {
      if (!g.isHost || !c) return r;
      const at = c.pos.clone().add(new THREE.Vector3(0, 0.7, 0));
      const spawn = (id, p = 1) => { if (rnd() < p && ITEMS[id]) g.items.hostSpawn(id, at.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.7, 0.2, (rnd() - 0.5) * 0.7)), {}); };
      if (c.type === 'scavraider') { spawn('blastercell', 0.45); spawn('blaster', 0.08); spawn('plasmablade', 0.04); if (rnd() < 0.4) g.hostSpawnRandomScrap?.(at); }
      else if (c.type === 'alien_npc') { if (rnd() < 0.3) g.hostSpawnRandomScrap?.(at); }
      else if (c.type === 'prowler') { if (rnd() < 0.15) g.crafting?.dropComponents?.(at, 'organic', 1); }
    } catch (e) { console.warn('[worlds2] drops', e); }
    return r;
  }
  if (typeof origKilled === 'function') g.hostOnCreatureKilled = w2Killed;

  // ==================================================================================== events
  on('mapLoaded', (world) => {
    const fx = g.engine?.fx; if (fx) fx.warp = 0;
    try { fauna.build(world); } catch (e) { console.warn('[worlds2] fauna', e); }
    S.host = null;
    for (const b of S.bubbles.splice(0)) { b.sp.removeFromParent(); b.sp.material.dispose(); }
  });
  on('moonPopulated', () => { try { hostPopulate(); } catch (e) { console.warn('[worlds2] populate', e); } });
  on('phase', () => { S.raidSquads.length = 0; if (run()?.phase !== 'moon') S.host = null; });
  let hostT = 0;
  on('update', (dt) => {
    for (const fn of [fauna.update, updateBubbles, updateBox]) { try { fn(dt); } catch (e) { if (!S.warned) { S.warned = true; console.warn('[worlds2] update', e); } } }   // cosmetics must never break the frame loop
    if (g.isHost && S.host && hostOn()) {
      hostT -= dt;
      if (hostT <= 0) { hostT = 0.5; try { hostTimePressure(); hostRaids(); hostNight(); } catch (e) { console.warn('[worlds2] host tick', e); } }
    }
  });

  const api = {
    weapons, fauna, stats: S.stats,
    /** debug / tests (host): start a raid now (Soviet moon or any moon with a `raid` config) */
    raidNow() { if (!S.host) return false; return launchRaid(); },
    /** debug / tests (host): run the next facility decay step now */
    decayNow() { if (!S.host) return false; S.host.step = Math.min(DECAY.steps.length, S.host.step + 1); applyDecay(S.host.step); return true; },
    /** current days-in-run factors */
    factors: () => dayFactors(run()?.day),
    moons: { SOVIET_MOON, TWINSUN_MOON },
    state: S,
    dispose() {
      for (const off of offs.splice(0)) { try { off(); } catch { /* ignore */ } }
      if (B && B.scale === dayScale) B.scale = origScale;
      if (B && typeof origHit === 'function' && Object.prototype.hasOwnProperty.call(B, 'hitDamage')) B.hitDamage = origHit;
      if (typeof origKilled === 'function' && g.hostOnCreatureKilled === w2Killed) { if (Object.prototype.hasOwnProperty.call(g, 'hostOnCreatureKilled')) delete g.hostOnCreatureKilled; }
      weapons?.dispose?.(); fauna.dispose();
      for (const b of S.bubbles.splice(0)) { b.sp.removeFromParent(); b.sp.material.dispose(); }
      S.box?.remove(); S.box = null;
    },
  };
  void fmtClock;
  return api;
}
