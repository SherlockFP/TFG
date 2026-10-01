// TREASURE CHESTS (wave 1, worldx): wood / iron / gold / void chests on landmarks (tower tops, ruin roofs, parkour ends),
// at random outdoor spots and inside facilities. Deterministic placement on every peer (seeded from the moon seed),
// host-authoritative state (opened) + late-join sync, hold-E to open (1.5 s), locked iron / gold / void chests need a key,
// a lockpick (minigame), a melee weapon (loud pry minigame) or the crowbar soft-event 'tfg:pry'.
//
//   installChests(game, api) -> {
//     list()                 [{ id, tier, kind, where, x, y, z, opened }]
//     onMapLoaded(world)     build the chest set for the map (call from the 'mapLoaded' mod event)
//     onPopulated()          host: spare keys + scrap at the landmarks (mod event 'moonPopulated')
//     addInteractables(out)  prompts (mod event 'interactables')
//     update(dt)             lid animation, beams, hold-E progress, late-join sync
//     hostOpen(id, by, opts) host: open + roll + spawn (used by the request handler, tests and other modules)
//     bindNet(net)               registers the request handlers + state message (idempotent per session)
//     dispose()
//   }
//
// Loot: game.crafting?.rollChestLoot?.(tier, rng) -> [{ type, tier }] when the crafting module provides it, otherwise the
// fallback table below (scrap by value tier, components, tools, weapons / bags / skillbooks ONLY when they exist in ITEMS).
// Items are spawned with game.items.hostSpawn(type, pos, { tier, valueMul, linvel }) so they pop out with physics.
//
// Events for other modules (game.mods.emit): 'tfg:chestOpened' { id, tier, kind, pos:[x,y,z], by }.
import { isPickType } from './lockpick2_core.js';   // [lockpick2] titanium pick / bypasser / drill also open chest locks
import * as THREE from 'three';
import { RNG, hashString } from '../core/rng.js';
import { ITEMS, scrapTableFor } from './items.js';
import { TIERS, tierOfItem, rollTier, tierIndex } from './tiers.js';
import { COMPONENT_IDS } from './components.js';
import { CHEST_TIERS, CHEST, CHEST_HEIGHT, createChestModel, setChestOpen, disposeChestModel } from '../models/chest.js';
import { G } from '../physics/physics.js';
import { MOONS } from './moons.js';
import { t } from '../core/i18n.js';

const HOLD = 1.5;
const MSG = 'wxState', REQ_OPEN = 'wxOpen', REQ_SYNC = 'wxSync';
const LOOT_TIER = { wood: ['common', 'rare'], iron: ['uncommon', 'epic'], gold: ['rare', 'legendary'], void: ['epic', 'mythic'] };
const LUCK = { wood: 0, iron: 0.12, gold: 0.28, void: 0.5 };
const easeOutBack = (x) => { const s = 1.70158, u = x - 1; return 1 + u * u * ((s + 1) * u + s); };
const TOOL_POOL = ['flashlight', 'proflash', 'medkit', 'stungrenade', 'glowstick', 'lockpick', 'adrenaline', 'walkie', 'beltbag', 'adblock', 'booster', 'inhaler', 'spraypaint', 'boombox', 'ladder', 'jetpack'];

// ------------------------------------------------------------------ loot
function toolTier(def) {
  const p = def.price ?? 40;
  return p < 25 ? 'common' : p < 60 ? 'uncommon' : p < 130 ? 'rare' : p < 400 ? 'epic' : 'legendary';
}
function pools() {
  const P = { scrap: [], comp: [], tool: [], gear: [] };
  for (const [id, d] of Object.entries(ITEMS)) {
    if (d.kind === 'scrap' && d.value && id !== 'key' && d.hands === 1 && !d.cursed) P.scrap.push({ id, tier: tierOfItem(null, d) });
    else if (d.kind === 'weapon') P.gear.push({ id, tier: TIERS[d.rarity] ? d.rarity : 'common' });
    else if (/^(skillbook|bag_|spellbook|blueprint)/.test(id)) P.gear.push({ id, tier: TIERS[d.tier] ? d.tier : 'rare' });
  }
  for (const id of COMPONENT_IDS) if (ITEMS[id] && !ITEMS[id].keyItem) P.comp.push({ id, tier: TIERS[ITEMS[id].tier] ? ITEMS[id].tier : 'common' });
  for (const id of TOOL_POOL) if (ITEMS[id]) P.tool.push({ id, tier: toolTier(ITEMS[id]) });
  return P;
}
function pickNear(list, tier, rng) {
  if (!list.length) return null;
  const want = tierIndex(tier);
  let best = 99, pick = [];
  for (const e of list) {
    const d = Math.abs(tierIndex(e.tier) - want) + (tierIndex(e.tier) > want ? 0.5 : 0);   // prefer not to exceed the rolled tier
    if (d < best) { best = d; pick = [e]; } else if (d === best) pick.push(e);
  }
  return rng.pick(pick);
}
/** Default chest loot (used when game.crafting.rollChestLoot is absent / returns nothing). */
export function fallbackChestLoot(tierId, rng) {
  const T = CHEST_TIERS[tierId] || CHEST_TIERS.wood, [lo, hi] = LOOT_TIER[tierId] || LOOT_TIER.wood;
  const P = pools();
  const n = rng.int(T.items[0], T.items[1]);
  const out = [];
  let scrapN = 0;
  for (let i = 0; i < n; i++) {
    const tier = rollTier(rng, { luck: LUCK[tierId] || 0, minTier: lo, maxTier: hi });
    const cats = [{ c: 'scrap', w: 26 }, { c: 'comp', w: 36 }, { c: 'tool', w: 14 }, { c: 'gear', w: 16 + tierIndex(tier) * 3 }].filter((e) => P[e.c].length && !(e.c === 'scrap' && scrapN >= 2));
    if (!cats.length) break;
    const cat = rng.weighted(cats.map((e) => ({ ...e }))).c;
    const e = pickNear(P[cat], tier, rng);
    if (!e) continue;
    if (cat === 'scrap') scrapN++;
    out.push({ type: e.id, tier: cat === 'gear' || cat === 'tool' ? e.tier : tier });
  }
  return out;
}

// ------------------------------------------------------------------ manager
export function installChests(game, api) {
  const chests = new Map();       // id -> chest
  let map = null;                 // { key, seed, where: Set }
  let hold = null;                // { key, chest, mode, t, tick }
  let syncAsked = false;
  let time = 0;
  const cols = [];                // facility colliders (outdoor ones live in world.outdoor.colliders)
  const _v = new THREE.Vector3();

  const posOf = (from) => (from === game.selfId ? game.player?.pos : game.remotes?.get(from)?.pos);
  const snd = (name, p, vol = 0.8) => { try { game.audio?.at?.(name, p, vol, { occlude: true, refDistance: 2.5 }); } catch { /* audio is optional */ } };

  const lifecycleOff=game.mods?.on?.('facilityWillChange',(w,g)=>{
    if(g!==game)return;
    for(const [id,c] of chests)if(c.where==='facility'){disposeChestModel(c.model);if(c.light)game.lights?.remove(c.light);if(hold?.chest===c)hold=null;chests.delete(id);}
    for(const c of cols.splice(0))game.physics.removeCollider(c);
  });
  function clear() {
    for (const c of chests.values()) {
      disposeChestModel(c.model);
      if (c.light) game.lights?.remove(c.light);
    }
    chests.clear();
    for (const c of cols.splice(0)) game.physics.removeCollider(c);
    map = null; hold = null; syncAsked = false;
  }

  function spawnChest(spec, where, parent, colList) {
    const T = CHEST_TIERS[spec.tier] || CHEST_TIERS.wood;
    const model = createChestModel(T.id, { beamHeight: 16 });
    model.root.position.set(spec.x, spec.y, spec.z);
    model.root.rotation.y = spec.yaw || 0;
    parent.add(model.root);
    // solid body: players and popped-out loot collide with it
    const col = game.physics.addStaticBox(spec.x, spec.y + CHEST_HEIGHT / 2, spec.z, CHEST.W / 2, CHEST_HEIGHT / 2, CHEST.D / 2, spec.yaw || 0, G.STATIC, { kind: 'chest', id: spec.id });
    colList.push(col);
    const fwd = _v.set(Math.sin(spec.yaw || 0), 0, Math.cos(spec.yaw || 0));
    const c = {
      id: spec.id, tier: T.id, kind: spec.kind || 'random', where, x: spec.x, y: spec.y, z: spec.z, yaw: spec.yaw || 0, T, model,
      opened: false, claimed: false, anim: false, t: 0, phase: (hashString(spec.id) % 628) / 100, light: null, beamT: 1,
      pos: new THREE.Vector3(spec.x + fwd.x * (CHEST.D / 2 + 0.08), spec.y + CHEST_HEIGHT * 0.6, spec.z + fwd.z * (CHEST.D / 2 + 0.08)),
    };
    if (T.light > 0 && game.lights) {
      c.light = { pos: new THREE.Vector3(spec.x, spec.y + 1.1, spec.z), color: T.glow, intensity: T.light, distance: 9 + T.light * 3, flicker: 0.06, group: 'chest' };
      game.lights.add(c.light);
    }
    chests.set(c.id, c);
    return c;
  }

  // ---- map build: landmark chests + random outdoor chests + facility chests (all deterministic) --------------------------
  function outdoorSpecs(world) {
    if (world.moonId === '__relay13') return []; // A social dock has no random expedition loot or Terrain path API.
    const out = world.outdoor, terrain = out.terrain, moon = MOONS[world.moonId] || {};
    const specs = (out.landmarks?.chests || []).map((c) => ({ ...c, y: c.y }));
    const R = new RNG(((world.seed | 0) ^ 0xc4e57) >>> 0);
    const sc = terrain.scale || 1, tier = moon.tier || 1, depth = moon.generated ? (moon.sector | 0) : 0;
    const n = 2 + Math.round((sc - 1) * 3) + (tier >= 3 ? 1 : 0);
    const avoid = out.avoid || (() => false);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 40; k++) {
        const x = R.float(-112, 112) * sc, z = R.float(-112, 112) * sc;
        if (avoid(x, z, 5) || terrain.distToPath(x, z) < 8) continue;
        if (specs.some((s) => Math.hypot(s.x - x, s.z - z) < 14)) continue;
        const roll = R.next();
        const tid = roll < 0.05 + Math.min(0.1, depth * 0.02) ? 'gold' : roll < 0.3 + tier * 0.03 ? 'iron' : 'wood';
        specs.push({ id: 'o' + i, x, y: terrain.heightAt(x, z), z, yaw: R.float(0, Math.PI * 2), tier: tid, kind: 'random' });
        break;
      }
    }
    return specs;
  }
  function facilitySpecs(world) {
    const fac = world.facility, moon = MOONS[world.moonId] || {};
    const R = new RNG(((world.seed | 0) ^ 0xfac35) >>> 0);
    if (Array.isArray(fac.chestSpots) && fac.chestSpots.length) {
      // the facility module knows best where a chest fits: { x, y, z, room, tier? (chest tier id or a rarity hint) }
      return fac.chestSpots.slice(0, 4).map((s, i) => ({
        id: 'f' + i, x: s.x, y: s.y, z: s.z, yaw: s.yaw ?? R.float(0, Math.PI * 2), kind: 'facility',
        tier: CHEST_TIERS[s.tier] ? s.tier : s.tier === 'legendary' || s.tier === 'mythic' ? 'gold' : s.tier === 'epic' || s.tier === 'rare' ? 'iron' : 'wood',
      }));
    }
    // fallback: dead-end scrap spots (far from the entrance, not in corridors)
    const spots = (fac.scrapSpots || []).filter((s) => s.room >= 0 && Number.isFinite(s.x) && Number.isFinite(s.z)).sort((a, b) => (b.dist || 0) - (a.dist || 0));
    const n = Math.min(spots.length, 1 + (moon.size > 1.4 ? 1 : 0) + ((moon.tier || 1) >= 3 ? 1 : 0));
    const out = [];
    const used = [];
    for (const s of spots) {
      if (out.length >= n) break;
      if (used.some((u) => Math.hypot(u.x - s.x, u.z - s.z) < 12)) continue;
      used.push(s);
      const i = out.length;
      out.push({ id: 'f' + i, x: s.x, y: s.y, z: s.z, yaw: R.float(0, Math.PI * 2), kind: 'facility', tier: i === 0 && (s.dist || 0) >= 7 && R.chance(0.6 + (moon.tier || 1) * 0.05) ? 'iron' : 'wood' });
    }
    return out;
  }

  function onMapLoaded(world) {
    clear();
    if (!world?.outdoor || !world.moonId || world.company) return;
    map = { key: `${world.moonId}|${world.seed}`, seed: world.seed | 0, outdoor: world.outdoor };
    try {
      const outdoor = outdoorSpecs(world);
      for (const s of outdoor) spawnChest(s, 'outdoor', world.outdoor.group, world.outdoor.colliders);
    } catch (e) { console.warn('outdoor chests', e); }
    try {
      if (!(game.run?.descent21?.depth|0) && world.facility?.group) for (const s of facilitySpecs(world)) spawnChest(s, 'facility', world.facility.group, cols);
    } catch (e) { console.warn('facility chests', e); }
  }

  // ---- host: keys + landmark scrap ---------------------------------------------------------------------------------
  function onPopulated() {
    if (!game.isHost || !map) return;
    const world = game.world, run = game.run, moon = MOONS[run.moon] || {};
    const R = new RNG(((run.seed | 0) ^ 0x4e75) >>> 0);
    const lm = world.outdoor?.landmarks;
    const locked = [...chests.values()].filter((c) => c.T.lock).length;
    const ground = (lm?.scrapSpots || []).filter((s) => !s.top);
    // spare keys near the landmarks' bases so a locked chest is never a dead end (a lockpick / weapon also works)
    const nKeys = Math.ceil(locked / 2);
    for (let i = 0; i < nKeys && ground.length; i++) {
      const s = ground[R.int(0, ground.length - 1)];
      game.items.hostSpawn('key', new THREE.Vector3(s.x + R.float(-0.4, 0.4), s.y + 0.5, s.z + R.float(-0.4, 0.4)));
    }
    // a little scrap up on the landmarks (the climb is the price)
    const table = scrapTableFor(world.facility?.layout?.theme || moon.interior).map(([id, w]) => ({ id, w })).filter((e) => ITEMS[e.id] && e.id !== 'key');
    const valueMul = (moon.scrapMul || 1) * (1 + (run.quotaIndex || 0) * 0.06) * 0.8;
    let n = 0;
    for (const s of lm?.scrapSpots || []) {
      if (n >= 6 || !table.length || !R.chance(0.6)) continue;
      game.items.hostSpawn(R.weighted(table).id, new THREE.Vector3(s.x, s.y + 0.5, s.z), { valueMul: valueMul * (s.top ? 1.3 : 1) });
      n++;
    }
  }

  // ---- host: opening ------------------------------------------------------------------------------------------------
  function rollLoot(c, rng) {
    let list = null;
    try { list = game.crafting?.rollChestLoot?.(c.tier, rng); } catch (e) { console.warn('rollChestLoot', e); }
    if (Array.isArray(list)) list = list.filter((e) => e && ITEMS[e.type]);
    if (!Array.isArray(list) || !list.length) list = fallbackChestLoot(c.tier, rng);
    return list;
  }
  function hostOpen(id, by = null, opts = {}) {
    if (!game.isHost || !map) return false;
    const c = chests.get(id);
    if (!c || c.claimed) return false;
    c.claimed = true;
    const run = game.run, moon = MOONS[run.moon] || {};
    const rng = new RNG((Math.random() * 4294967296) >>> 0);
    const loot = rollLoot(c, rng);
    const valueMul = (moon.scrapMul || 1) * (1 + (run.quotaIndex || 0) * 0.06) * 0.85;
    loot.forEach((e, i) => {
      const a = (i / Math.max(1, loot.length)) * Math.PI * 2 + rng.float(0, 1);
      const pos = new THREE.Vector3(c.x + Math.cos(a) * 0.15, c.y + CHEST_HEIGHT + 0.35 + i * 0.12, c.z + Math.sin(a) * 0.15);
      game.items.hostSpawn(e.type, pos, { tier: e.tier, valueMul, linvel: [Math.cos(a) * rng.float(1.1, 1.9), rng.float(3.2, 4.6), Math.sin(a) * rng.float(1.1, 1.9)] });
    });
    game.net.broadcast(MSG, { s: map.seed, id: c.id, by: by || game.selfId });
    if (by) game.net.broadcast('xp', { to: by, xp: c.T.xp + (run.quotaIndex || 0) * 4, coin: Math.round(c.T.xp / 8), reason: c.T.name + ' opened' });
    if (opts.noisy) { game.creatures?.noise?.(new THREE.Vector3(c.x, c.y + 0.5, c.z), 3); game.net.broadcast('fx', { k: 'snd', s: 'hit_metal', p: [c.x, c.y + 0.5, c.z], v: 1, r: 6, m: 70 }); }
    game.mods?.emit('tfg:chestOpened', { id: c.id, tier: c.tier, kind: c.kind, pos: [c.x, c.y, c.z], by: by || game.selfId, loot: loot.map((e) => e.type) });
    return true;
  }
  function onOpenRequest(d, from) {
    if (!game.isHost || game.run?.phase !== 'moon' || !map || d.s !== map.seed) return;
    const c = chests.get(d.id);
    if (!c || c.claimed) return;
    const p = posOf(from);
    if (!p || Math.hypot(p.x - c.x, p.z - c.z) > 5 || Math.abs(p.y - c.y) > 4) return;
    const held = (itemId, ok) => { const it = itemId && game.items.get(itemId); return it && it.holder === from && ok(it) ? it : null; };
    let noisy = false;
    if (c.T.lock) {
      if (d.key) {
        const k = held(d.key, (it) => it.type === 'key');
        if (!k) return;
        game.net.broadcast('it', { e: 'rm', id: k.id });
      } else if (d.pick) { if (!held(d.pick, (it) => isPickType(it.type))) return; }
      else if (d.pry) { if (!held(d.pry, (it) => { const df = it.def || ITEMS[it.type]; return df?.kind === 'weapon' && !df?.ranged; })) return; noisy = true; }
      else if (d.viaEvent) noisy = true;   // crowbar soft-event 'tfg:pry' (the sender is next to the chest, checked above)
      else return;
    }
    hostOpen(c.id, from, { noisy });
  }
  function onState(d) {
    if (!map || !d || d.s !== map.seed) return;
    if (Array.isArray(d.list)) { for (const id of d.list) setOpened(id, false); return; }
    if (d.id) setOpened(d.id, true);
  }
  function setOpened(id, animate) {
    const c = chests.get(id);
    if (!c || c.opened) return;
    c.opened = true; c.claimed = true;
    if (animate) { c.anim = true; c.t = 0; snd('door_creak', c.pos, 0.9); snd('ui_notify', c.pos, 0.5); }
    else { c.t = 1; setChestOpen(c.model, 1); c.beamT = 0; }
    if (c.model.beam) c.model.beam.userData.fade = animate ? 1 : 0;
    if (c.light) c.light.intensity = 0.15;
  }

  function bindNet(net) {
    net.on_(MSG, (d) => onState(d));
    net.handle(REQ_OPEN, (d, from) => onOpenRequest(d, from));
    net.handle(REQ_SYNC, (d, from) => {
      if (!game.isHost || !map || d.s !== map.seed) return;
      const list = [...chests.values()].filter((c) => c.claimed).map((c) => c.id);
      if (list.length) game.net.sendTo(from, MSG, { s: map.seed, list });
    });
  }

  // ---- client: prompts + hold ---------------------------------------------------------------------------------------
  function modeFor(c, held, def) {
    if (!c.T.lock) return 'open';
    if (held?.type === 'key') return 'key';
    if (isPickType(held?.type)) return 'pick';
    if (def && def.kind === 'weapon' && !def.ranged) return 'pry';
    return 'none';
  }
  function bar(f) { const n = Math.round(f * 10); return '[' + '#'.repeat(n) + '-'.repeat(10 - n) + ']'; }
  function addInteractables(out) {
    const p = game.player;
    if (!p || p.dead || !map) return;
    let held, def;
    for (const c of chests.values()) {
      if (c.opened || c.claimed) continue;
      if ((c.where === 'facility') !== !!p.indoor) continue;
      const dx = p.pos.x - c.x, dz = p.pos.z - c.z;
      if (dx * dx + dz * dz > 30 || Math.abs(p.pos.y - c.y) > 4) continue;
      if (held === undefined) { held = p.heldItem?.() || null; def = held ? ITEMS[held.type] : null; }
      const mode = modeFor(c, held, def);
      const key = c.id + ':' + mode;
      const name = t(c.T.name);
      let label, sub = '';
      if (mode === 'none') { label = t('Locked') + ' ' + name; sub = t('Needs a key, a lockpicker, a melee weapon or a crowbar'); }
      else {
        label = () => (hold && hold.key === key ? `${t('Opening')} ${name} ${bar(hold.t / HOLD)}` : `${t('Open')} ${name} [${t('hold E')}]`);
        sub = mode === 'key' ? t('Uses the key') : mode === 'pick' ? t('Lockpick minigame') : mode === 'pry' ? t('Pry it open - loud!') : '';
      }
      const action = mode === 'none' ? () => snd('door_locked', c.pos, 0.7) : Object.assign(() => { hold = { key, chest: c, mode, t: 0, tick: 0 }; }, { __wx: key });
      out.push({ pos: c.pos, r: 0.9, reach: 2.6, label, sub, action });
    }
  }
  function finish(H) {
    const c = H.chest;
    if (!c || c.opened || c.claimed) return;
    const p = game.player, held = p.heldItem?.();
    const send = (extra) => game.net.request(REQ_OPEN, { id: c.id, s: map.seed, ...extra });
    if (H.mode === 'open') send({});
    else if (H.mode === 'key' && held?.type === 'key') send({ key: held.id });
    else if ((H.mode === 'pick' && isPickType(held?.type)) || (H.mode === 'pry' && held)) {
      const pry = H.mode === 'pry', tool = held;
      game.openMinigame('lockpick', { difficulty: Math.min(0.95, c.T.difficulty + (pry ? 0.2 : 0)) }, (res) => {
        if (res.cancelled) return;
        if (res.success) send(pry ? { pry: tool.id } : { pick: tool.id });
        if (pry) {
          if (!res.success) { game.net.request('noise', { p: [c.x, c.y + 0.5, c.z], loud: 1.6 }); game.net.broadcast('fx', { k: 'snd', s: 'hit_metal', p: [c.x, c.y + 0.5, c.z], v: 0.9, r: 5, m: 60 }); }
          return;
        }
        tool.charges = Math.max(0, (tool.charges ?? 3) - 1);
        if (tool.charges <= 0) game.net.request('consume', { id: tool.id }); else game.net.broadcast('itst', { id: tool.id, c: tool.charges });
      });
    }
  }
  /** crowbar soft-event: { pos:[x,y,z] | Vector3 | {x,y,z} } near a locked chest (falls back to the player position) */
  function onPry(info) {
    const p = game.player;
    if (!p || !map || p.dead) return;
    const raw = info?.pos ?? info;
    const at = Array.isArray(raw) ? _v.fromArray(raw) : raw && Number.isFinite(raw.x) ? _v.set(raw.x, raw.y ?? p.pos.y, raw.z) : _v.copy(p.pos);
    let best = null, bd = 3.4 * 3.4;
    for (const c of chests.values()) {
      if (c.opened || c.claimed || !c.T.lock) continue;
      const d = (c.x - at.x) ** 2 + (c.z - at.z) ** 2;
      if (d < bd && Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 5) { best = c; bd = d; }
    }
    if (best) game.net.request(REQ_OPEN, { id: best.id, s: map.seed, viaEvent: true });
  }

  function update(dt) {
    time += dt;
    if (!map) return;
    // the map this set was built for is gone (landing on another moon / next day / orbit)?
    if (game.world?.outdoor !== map.outdoor || !game.world?.moonId) { clear(); return; }
    if (!syncAsked && !game.isHost && game.net?.connected && game.run?.phase === 'moon') { syncAsked = true; game.net.request(REQ_SYNC, { s: map.seed }); }
    // hold-E progress
    if (hold) {
      const tgt = game.interactTarget;
      const ok = game.input?.isDown('interact') && tgt?.action?.__wx === hold.key && !game.player.dead && !hold.chest.opened;
      if (!ok) hold = null;
      else {
        hold.t += dt;
        const k = Math.floor(hold.t / 0.3);
        if (k !== hold.tick) { hold.tick = k; game.sfx?.('lockpick_click', 0.25, 0.9 + 0.1 * (k % 3)); }
        if (hold.t >= HOLD) { const H = hold; hold = null; finish(H); }
      }
    }
    const cam = game.camera?.position;
    for (const c of chests.values()) {
      const m = c.model;
      if (c.anim) {
        c.t = Math.min(1, c.t + dt / 0.75);
        setChestOpen(m, easeOutBack(c.t));
        if (c.t >= 1) c.anim = false;
      }
      if (m.beam) {
        const near = !cam || (cam.x - c.x) ** 2 + (cam.z - c.z) ** 2 < 130 * 130;
        const fade = c.opened ? Math.max(0, (m.beam.userData.fade ?? 0) - dt * 0.8) : 1;
        m.beam.userData.fade = fade;
        m.beam.visible = near && fade > 0.01;
        if (m.beam.visible) m.beam.material.opacity = m.beam.userData.baseOpacity * fade * (0.7 + 0.3 * Math.sin(time * 2.2 + c.phase));
      }
      if (c.light && !c.opened) c.light.intensity = c.T.light * (0.85 + 0.15 * Math.sin(time * 3 + c.phase));
    }
  }

  return {
    list: () => [...chests.values()].map((c) => ({ id: c.id, tier: c.tier, kind: c.kind, where: c.where, x: c.x, y: c.y, z: c.z, opened: c.opened })),
    get: (id) => chests.get(id) || null,
    onMapLoaded, onPopulated, addInteractables, update, hostOpen, onPry, bindNet, onState,
    dispose() { lifecycleOff?.();clear(); },
  };
}
