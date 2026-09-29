// EGGS (wave 4, module 'eggs'; docs/wave4/eggs.md): rare seeded secrets on moons + facilities, tied to the main-menu Cell secrets
// (src/ui/menueggs.js) through profile.eggs (rules: eggs_core.js, node-tested by tools/harness/eggs.test.mjs).
//   graffiti wall . shrine (offering -> short buff) . hidden vending machine . previous-crew corpse + diary . rubber duck (counted across runs)
//   frozen employee statue (turns its head when you do not look) . payphone (XP) . dead-drop duffel bag
// Placement is deterministic per (moon, seed) on every peer (planEggs); models are one merged mesh each, no lights. Everything that grants
// something is host-authoritative: client -> host request 'eggreq' {op:'use', id, s, item?}; host -> everyone 'eggst' {s, id, k:'gone'} / {s, list};
// host -> the user 'eggfx' {s, k, id, ...}. Late joiners ask 'eggsync'. Discoveries are written to the LOCAL profile of whoever triggered them.
import * as THREE from 'three';
import { HOST_ONLY } from '../net/session.js';
import { RNG, hashString } from '../core/rng.js';
import { t } from '../core/i18n.js';
import { saveProfile } from '../core/save.js';
import { MOONS } from './moons.js';
import { ITEMS } from './items.js';
import { G } from '../physics/physics.js';
import { applyBuffStats } from './food_data.js';
import { createEggModel } from './eggs_models.js';
import { x, xf } from './eggs_text.js';
import * as C from './eggs_core.js';

HOST_ONLY.add('eggst'); HOST_ONLY.add('eggfx');
const REACH = 5.5;

export function installEggs(game) {
  const mods = game.mods;
  if (!mods) return null;
  const offs = [];
  const eggs = new Map();           // id -> { spec, model, gone, pos(anchor), phase }
  const cols = [];
  let map = null, time = 0, syncAsked = false, disposed = false, lastNet = null;
  const injected = [];
  const _v = new THREE.Vector3(), _f = new THREE.Vector3();
  const posOf = (from) => (from === game.selfId ? game.player?.pos : game.remotes?.get(from)?.pos);
  const say = (s, kind = 'info') => { try { game.ui?.toast?.(s, kind); } catch { /* ui optional */ } };
  const chat = (s) => { try { game.ui?.systemMessage?.(s, 'info'); } catch { /* ui optional */ } };
  const profile = () => game.profile;

  // ---- buffs (the anomaly registry is the one buff system): three shrine blessings
  const DEFS = game.anomaly?.DEFS;
  if (DEFS) {
    for (const s of C.SHRINE_TIERS) {
      DEFS[s.id] = { good: true, glyph: 'SHR', color: '#ffd35a', name: x('b.name'), desc: x('b.desc'), speed: s.speed, armor: s.armor, maxHp: s.maxHp, food: true, dur: 0, stats: (st) => applyBuffStats(s, st) };
      injected.push(s.id);
    }
  }

  // ---- profile
  function discoverLocal(id) {
    const p = profile();
    if (!p || !C.discover(p, id)) return false;
    try { saveProfile(p); } catch { /* storage may be unavailable */ }
    game.sfx?.('ui_notify', 0.5);
    say(xf('found', { name: x('n.' + id), a: C.foundCount(p), b: C.TOTAL_EGGS }), 'good');
    return true;
  }
  function saveLocal() { try { saveProfile(profile()); } catch { /* ignore */ } }

  // ---- map build
  function clear() {
    for (const e of eggs.values()) { try { e.model?.dispose(); } catch { /* ignore */ } }
    eggs.clear();
    for (const c of cols.splice(0)) { try { game.physics.removeCollider(c); } catch { /* already gone with the world */ } }
    map = null; syncAsked = false;
  }
  function outdoorSampler(world) {
    const terrain = world.outdoor.terrain;
    if (!terrain || typeof terrain.heightAt !== 'function') return null;
    const sc = terrain.scale || 1, avoid = world.outdoor.avoid || (() => false);
    return (rng) => {
      const px = rng.float(-112, 112) * sc, pz = rng.float(-112, 112) * sc;
      if (avoid(px, pz, 5) || (terrain.distToPath && terrain.distToPath(px, pz) < 6)) return null;
      if (terrain.lavaDepthAt && terrain.lavaDepthAt(px, pz) > -0.6) return null;
      if (terrain.lakes?.length && terrain.onIce?.(px, pz)) return null;
      const y = terrain.heightAt(px, pz);
      if (Math.abs(terrain.heightAt(px + 1.2, pz) - terrain.heightAt(px - 1.2, pz)) > 1.0 || Math.abs(terrain.heightAt(px, pz + 1.2) - terrain.heightAt(px, pz - 1.2)) > 1.0) return null;   // no slopes
      return { x: px, y, z: pz };
    };
  }
  function buildEgg(spec, world) {
    const seed = hashString(`${world.moonId}|${world.seed | 0}|${spec.id}`);
    const model = createEggModel(spec.kind, { text: spec.kind === 'graffiti' ? x('g.' + C.graffitiVariant(world.seed)) : '', seed });
    if (!model) return;
    model.root.position.set(spec.x, spec.y, spec.z);
    model.root.rotation.y = spec.yaw;
    const parent = spec.where === 'facility' ? world.facility?.group : world.outdoor?.group;
    if (!parent) { model.dispose(); return; }
    parent.add(model.root);
    if (model.col) {
      try { cols.push(game.physics.addStaticBox(spec.x, spec.y + (model.col.y || model.col.hy), spec.z, model.col.hx, model.col.hy, model.col.hz, spec.yaw, G.STATIC, { kind: 'egg', id: spec.id })); } catch (e) { console.warn('[eggs] collider', e); }
    }
    const ay = { graffiti: 0.7, shrine: 0.8, vending: 1.0, diary: 0.3, duck: 0.3, statue: 1.2, payphone: 1.2, stash: 0.4 }[spec.kind] || 0.6;
    eggs.set(spec.id, { spec, model, gone: false, used: false, pos: new THREE.Vector3(spec.x, spec.y + ay, spec.z) });
  }
  function onMapLoaded(world) {
    clear();
    if (disposed || !world?.outdoor || !world.moonId || world.company || !MOONS[world.moonId]) return;
    const moon = MOONS[world.moonId];
    const outdoor = (() => { try { return outdoorSampler(world); } catch { return null; } })();
    const fac = world.facility?.group && Array.isArray(world.facility.scrapSpots) ? world.facility.scrapSpots.filter((s) => s.room >= 0 && Number.isFinite(s.x)) : null;
    map = { key: `${world.moonId}|${world.seed}`, seed: world.seed | 0, outdoor: world.outdoor };
    let plan = [];
    try { plan = C.planEggs({ seed: world.seed | 0, moonId: world.moonId, tier: moon.tier || 1, sector: moon.sector | 0, outdoor, facility: fac }); } catch (e) { console.warn('[eggs] plan', e); }
    for (const spec of plan) { try { buildEgg(spec, world); } catch (e) { console.warn('[eggs] build', spec.kind, e); } }
    map.plan = plan;
  }

  // ---- host: use requests
  function spawnFront(e, dy = 0.9, spread = 0.9) {
    const a = e.spec.yaw, fx = Math.sin(a), fz = Math.cos(a);
    return new THREE.Vector3(e.spec.x + fx * spread, e.spec.y + dy, e.spec.z + fz * spread);
  }
  function hostUse(d, from) {
    if (!game.isHost || !map || d.s !== map.seed || game.run?.phase !== 'moon') return;
    const e = eggs.get(d.id);
    if (!e) return;
    const pp = posOf(from);
    if (!pp || Math.hypot(pp.x - e.spec.x, pp.z - e.spec.z) > REACH || Math.abs(pp.y - e.spec.y) > 4) return;
    const net = game.net, base = { s: map.seed, id: e.spec.id };
    const gone = () => { e.gone = true; net.broadcast('eggst', { ...base, k: 'gone' }); };
    const rng = new RNG(hashString('use|' + map.seed + '|' + e.spec.id));
    switch (e.spec.kind) {
      case 'duck':
        if (e.gone) { net.sendTo(from, 'eggfx', { ...base, k: 'gone' }); return; }
        gone(); net.sendTo(from, 'eggfx', { ...base, k: 'duck' });
        return;
      case 'shrine': {
        e.by = e.by || new Set();
        if (e.by.has(from)) { net.sendTo(from, 'eggfx', { ...base, k: 'used' }); return; }
        const it = d.item ? game.items.get(d.item) : null;
        if (!it || it.holder !== from || !(it.value > 0)) return;
        const tier = C.shrineTier(it.value);
        e.by.add(from);
        net.broadcast('it', { e: 'rm', id: it.id });
        net.sendTo(from, 'eggfx', { ...base, k: 'bless', b: tier.id, sec: tier.sec });
        net.broadcast('fx', { k: 'snd', s: 'ui_confirm', p: [e.spec.x, e.spec.y + 1, e.spec.z], v: 0.7, r: 8, m: 60 });
        return;
      }
      case 'vending': {
        if (e.gone) { net.sendTo(from, 'eggfx', { ...base, k: 'gone' }); return; }
        const type = C.vendingItem(map.seed, C.VENDING_POOL.filter((id) => ITEMS[id]));
        gone();
        if (type) game.items.hostSpawn(type, spawnFront(e, 0.6, 0.85), { linvel: [Math.sin(e.spec.yaw) * 1.2, 1.5, Math.cos(e.spec.yaw) * 1.2] });
        net.sendTo(from, 'eggfx', { ...base, k: 'vend' });
        net.broadcast('fx', { k: 'snd', s: 'register', p: [e.spec.x, e.spec.y + 1, e.spec.z], v: 0.8, r: 8, m: 60 });
        return;
      }
      case 'stash': {
        if (e.gone) { net.sendTo(from, 'eggfx', { ...base, k: 'gone' }); return; }
        gone();
        const pool = C.STASH_POOL.filter((id) => ITEMS[id]);
        const n = 1 + (rng.chance(0.5) ? 1 : 0);
        for (let i = 0; i < n && pool.length; i++) game.items.hostSpawn(rng.pick(pool), spawnFront(e, 0.5 + i * 0.15, 0.7 + i * 0.25), { linvel: [rng.float(-1, 1), 2.2, rng.float(-1, 1)] });
        try { game.hostSpawnRandomScrap?.(spawnFront(e, 0.9, 0.5)); } catch { /* optional */ }
        net.sendTo(from, 'eggfx', { ...base, k: 'stash' });
        return;
      }
      case 'payphone': {
        e.by = e.by || new Set();
        if (e.by.has(from)) { net.sendTo(from, 'eggfx', { ...base, k: 'used' }); return; }
        e.by.add(from);
        net.broadcast('xp', { to: from, xp: 30 + (game.run?.quotaIndex | 0) * 4, coin: 6, reason: x('m.payphone.xp') });
        net.sendTo(from, 'eggfx', { ...base, k: 'phone' });
        return;
      }
      default:
    }
  }

  // ---- client: messages
  function onState(d) {
    if (!map || !d || d.s !== map.seed) return;
    const set = (id) => { const e = eggs.get(id); if (!e) return; e.gone = true; if (e.spec.kind === 'duck') e.model.root.visible = false; };
    if (Array.isArray(d.list)) { d.list.forEach(set); return; }
    if (d.id) { set(d.id); }
  }
  function onFx(d) {
    if (!map || !d || d.s !== map.seed) return;
    const p = profile(), e = eggs.get(d.id);
    switch (d.k) {
      case 'duck': {
        const n = C.bump(p, 'duck'); saveLocal();
        discoverLocal('duck');
        game.sfx?.('ui_click', 0.6);
        say(xf('m.duck.ok', { n }), 'good');
        const ms = { 3: 'm.duck.m3', 7: 'm.duck.m7', 12: 'm.duck.m12' }[n];
        if (ms) chat(x(ms));
        break;
      }
      case 'bless': {
        const s = C.SHRINE_TIERS.find((q) => q.id === d.b) || C.SHRINE_TIERS[0];
        try { game.anomaly?.buffs?.add?.(s.id, Math.max(10, Math.min(300, +d.sec || s.sec))); } catch (err) { console.warn('[eggs] buff', err); }
        if (e) e.used = true;
        game.sfx?.('ui_levelup', 0.5);
        say(xf('m.shrine.ok', { sp: Math.round(s.speed * 100), ar: Math.round(s.armor * 100), hp: s.maxHp ? xf('m.shrine.hp', { n: s.maxHp }) : '', s: s.sec }), 'good');
        discoverLocal('shrine');
        break;
      }
      case 'vend': say(x('m.vending.ok'), 'good'); discoverLocal('vending'); break;
      case 'stash': say(x('m.stash.ok'), 'good'); discoverLocal('stash'); break;
      case 'phone': if (e) e.used = true; say(x('m.payphone.ok'), 'good'); discoverLocal('payphone'); break;
      case 'used': say(e?.spec.kind === 'payphone' ? x('m.payphone.used') : x('m.shrine.used'), 'warn'); break;
      case 'gone': say(e?.spec.kind === 'duck' ? x('m.duck.gone') : e?.spec.kind === 'vending' ? x('m.vending.empty') : x('m.stash.empty'), 'warn'); break;
      default:
    }
  }
  function bindNet(net) {
    lastNet = net;
    net.on_('eggst', (d) => onState(d));
    net.on_('eggfx', (d) => onFx(d));
    net.handle('eggreq', (d, from) => hostUse(d, from));
    net.handle('eggsync', (d, from) => {
      if (!game.isHost || !map || d.s !== map.seed) return;
      const list = [...eggs.values()].filter((e) => e.gone).map((e) => e.spec.id);
      if (list.length) game.net.sendTo(from, 'eggst', { s: map.seed, list });
    });
  }

  // ---- interaction prompts
  const request = (e, extra = {}) => game.net.request('eggreq', { op: 'use', id: e.spec.id, s: map.seed, ...extra });
  function actionFor(e) {
    const p = game.player;
    switch (e.spec.kind) {
      case 'graffiti': return { label: x('m.graffiti'), action: () => {
        const txt = x('g.' + C.graffitiVariant(map.seed));
        game.ui?.hud?.bigText?.(txt, x('g.sub')); chat(txt); discoverLocal('graffiti'); game.sfx?.('ui_click', 0.3);
      } };
      case 'diary': return { label: x('m.diary'), action: () => {
        const txt = x('d.' + C.diaryVariant(map.seed));
        game.ui?.hud?.bigText?.(x('n.diary'), txt); chat(txt); discoverLocal('diary'); game.sfx?.('item_pickup', 0.3);
      } };
      case 'statue': return { label: x('m.statue'), action: () => { const txt = x('m.statue.body'); game.ui?.hud?.bigText?.(x('n.statue'), txt); chat(txt); discoverLocal('statue'); } };
      case 'duck': return { label: e.gone ? x('m.duck.gone') : x('m.duck'), action: () => { if (e.gone) say(x('m.duck.gone'), 'warn'); else request(e); } };
      case 'vending': return { label: e.gone ? x('m.vending.empty') : x('m.vending'), action: () => request(e) };
      case 'stash': return { label: e.gone ? x('m.stash.empty') : x('m.stash'), action: () => request(e) };
      case 'payphone': return { label: e.used ? x('m.payphone.used') : x('m.payphone'), action: () => { if (e.used) say(x('m.payphone.used'), 'warn'); else request(e); } };
      case 'shrine': {
        const held = p.heldItem?.();
        const ok = held && (held.value | 0) > 0;
        return {
          label: e.used ? x('m.shrine.empty') : ok ? xf('m.shrine.offer', { item: t(ITEMS[held.type]?.name || held.type) }) : x('m.shrine.empty'),
          action: () => { if (e.used) say(x('m.shrine.used'), 'warn'); else if (!ok) say(x('m.shrine.need'), 'warn'); else request(e, { item: held.id }); },
        };
      }
      default: return null;
    }
  }
  offs.push(mods.on('interactables', (list, g) => {
    if (g !== game || !map || !eggs.size) return;
    const p = game.player;
    if (!p || p.dead) return;
    for (const e of eggs.values()) {
      if ((e.spec.where === 'facility') !== !!p.indoor) continue;
      const dx = p.pos.x - e.spec.x, dz = p.pos.z - e.spec.z;
      if (dx * dx + dz * dz > 36 || Math.abs(p.pos.y - e.spec.y) > 4) continue;
      const a = actionFor(e);
      if (a) list.push({ pos: e.pos, r: 1.0, reach: 2.7, label: a.label, sub: '', action: a.action });
    }
  }));

  // ---- per frame
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed || !map) return;
    if (game.world?.outdoor !== map.outdoor || !game.world?.moonId) { clear(); return; }
    time += dt;
    if (!syncAsked && !game.isHost && game.net?.connected && game.run?.phase === 'moon') { syncAsked = true; game.net.request('eggsync', { s: map.seed }); }
    const cam = game.camera;
    let ctx = null;
    for (const e of eggs.values()) {
      const m = e.model;
      if (!m.tick) continue;
      const dx = (cam?.position.x ?? 0) - e.spec.x, dz = (cam?.position.z ?? 0) - e.spec.z;
      if (dx * dx + dz * dz > 3600) continue;   // 60 m
      if (!ctx && cam) { cam.getWorldDirection(_f); ctx = { cam: cam.position, fwd: { x: _f.x, z: _f.z } }; const l = Math.hypot(_f.x, _f.z) || 1; ctx.fwd.x /= l; ctx.fwd.z /= l; }
      m.tick(dt, time, m, ctx);
    }
  }));
  offs.push(mods.on('netReady', (net) => bindNet(net)));
  offs.push(mods.on('mapLoaded', (world, g) => { if (g === game) onMapLoaded(world); }));
  if (game.net && game.net !== lastNet) { try { bindNet(game.net); } catch { /* the netReady hook binds it */ } }

  // ---- terminal: EGGS (counts only, no spoilers)
  const cmd = (rest, term) => {
    const p = profile(), e = C.ensureEggs(p);
    term.print(xf('secrets', { a: C.foundCount(p), b: C.TOTAL_EGGS }) + ` | ${xf('duck.count', { n: e.n.duck })}`);
    term.print(C.ALL_EGGS.filter((id) => e.found[id]).map((id) => x('n.' + id)).join(', ') || '-');
  };
  try { window.KefalAPI?.registerCommand?.('eggs', cmd, 'secrets found so far (menu cell + moons)'); } catch { /* optional */ }

  const api = {
    /** [{ id, kind, where, x, y, z, gone }] for the current map */
    list: () => [...eggs.values()].map((e) => ({ id: e.spec.id, kind: e.spec.kind, where: e.spec.where, x: e.spec.x, y: e.spec.y, z: e.spec.z, gone: e.gone })),
    plan: () => map?.plan || [],
    /** debug / harness: the runtime model of an egg */
    model: (id) => eggs.get(id)?.model || null,
    progress: () => ({ found: C.foundCount(profile()), total: C.TOTAL_EGGS }),
    /** debug / harness: place an egg of `kind` at a world position of the current map (not part of the seeded plan) */
    debugSpawn(kind, px, py, pz, where = 'outdoor', yaw = 0) {
      const w = game.world;
      if (!map || !w?.outdoor) return null;
      const spec = { id: 'dbg' + eggs.size, kind, where, x: px, y: py, z: pz, yaw };
      buildEgg(spec, w);
      return spec.id;
    },
    hostUse, onMapLoaded, discoverLocal,
    dispose() {
      disposed = true;
      clear();
      for (const off of offs.splice(0)) { try { off?.(); } catch { /* ignore */ } }
      if (DEFS) for (const id of injected) delete DEFS[id];
      try { if (window.KefalAPI) mods.commands?.delete('eggs'); } catch { /* ignore */ }
    },
  };
  return api;
}
