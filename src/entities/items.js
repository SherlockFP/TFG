// World items: spawning, physics (host-authoritative, ownership transfer for grab beam),
// held/inventory state, snapshots, fragile value loss, pickup / break particles.
// ItemTools (bottom of the file) implements the special item mechanics: Extension Ladder, Signal Booster,
// Hype Inhaler, Belt Bag, Adblock Spray, and the special scrap (webcam flash, ring light, hot GPU,
// cursed chain letter, "shake" screechers). It wires itself through game.mods events
// (useItem / interactables / update / fx / registerHandlers / sessionEnd), so the Game only has to call
// items.dispose() on destroy.
import * as THREE from 'three';
import { ITEMS, itemDef, isSellable } from '../game/items.js';
import { normalizeAffix, affixValueBonus, makeAffix } from '../game/loot.js';
import { TIERS, TIER_ORDER, rollTier, tierOfItem, tierIndex } from '../game/tiers.js';
import { normalizeInv, rollsTier, TIER_VALUE_NORM } from '../game/inventory_core.js';
import { RNG } from '../core/rng.js';
import { createItemModel, createLadderModel } from '../models/items.js';
import { insideShip } from '../world/ship.js';
import { G } from '../physics/physics.js';
import { t } from '../core/i18n.js';

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

// ---- legacy belt bag (pre-wave-1 saves stored up to 4 scrap entries inside the bag item; the host dumps them) ----
export const BAG_MAX = 4;
export const BAG_WEIGHT_MUL = 0.6;
// ---- extension ladder ----
const LADDER_MIN_LEDGE = 1.0;      // m above the floor
const LADDER_MAX_LEDGE = 7.5;
const LADDER_MAX_H = 9;

// particle presets (render/particles.js burst options)
const FX_SHARDS = { count: 12, color: [0xd8f0ff, 0xffffff, 0x9fc4dc], speed: 3.2, up: 2, life: 0.7, size: 0.05, gravity: 10, drag: 1.2 };
const FX_CHIPS = { count: 8, color: [0x8a8a8a, 0xd0c8b8, 0x5a5a5a], speed: 2.4, up: 1.5, life: 0.5, size: 0.045, gravity: 9, drag: 1.5 };
const FX_DUST = { count: 10, color: [0x8a7a66, 0x6a5e50, 0xa89880], speed: 1.2, up: 0.8, life: 0.9, size: 0.12, gravity: -0.4, drag: 3 };
const FX_STEAM = { count: 3, color: [0xdddddd, 0xffffff, 0xbbbbbb], speed: 0.35, up: 1.3, life: 1.0, size: 0.1, gravity: -1.2, drag: 2 };
const FX_SPRAY = { count: 7, color: [0xe8f4ff, 0xc0ffd8, 0xffffff], speed: 4.5, up: 0.2, life: 0.45, size: 0.06, gravity: 1, drag: 2.2 };
const FX_HYPE = { count: 4, color: [0xff7ad0, 0xffc0f0, 0xffffff], speed: 0.6, up: 0.4, life: 0.6, size: 0.05, gravity: -0.5, drag: 2.5 };

const INSTANCE_TIER_KINDS = new Set(['weapon', 'armor', 'trinket', 'bag', 'tool', 'consumable', 'component']);
const finite3 = (a) => Array.isArray(a) && a.length === 3 && a.every((v) => Number.isFinite(Number(v))) ? a.map(Number) : null;

/** Sanitize legacy belt-bag contents (network / old saves). */
export function normalizeBag(bg) {
  if (!Array.isArray(bg)) return [];
  const out = [];
  for (const e of bg) {
    if (out.length >= BAG_MAX) break;
    if (!e || typeof e !== 'object' || !ITEMS[e.ty]) continue;
    const num = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : undefined);
    const v = num(e.v, 0, 100000) ?? 0;
    out.push({ ty: e.ty, v: Math.round(v), bv: Math.round(num(e.bv, 0, 100000) ?? v), b: num(e.b, 0, 100000), c: num(e.c, 0, 100000), col: e.col ? 1 : undefined });
  }
  return out;
}

/** Sanitize a deployed-ladder descriptor: { b: foot [x,y,z], h, yaw, t: top landing [x,y,z] }. */
export function sanitizeLadder(ld) {
  if (!ld || typeof ld !== 'object') return null;
  const b = finite3(ld.b), tp = finite3(ld.t);
  const h = Number(ld.h), yaw = Number(ld.yaw);
  if (!b || !tp || !Number.isFinite(h) || !Number.isFinite(yaw)) return null;
  if (h < 1 || h > LADDER_MAX_H + 0.01) return null;
  if (tp[1] - b[1] < LADDER_MIN_LEDGE - 0.05 || tp[1] - b[1] > LADDER_MAX_LEDGE + 0.2) return null;
  if (Math.hypot(tp[0] - b[0], tp[2] - b[2]) > 1.6) return null;
  return { b, h, yaw, t: tp };
}


export class WorldItem {
  constructor(mgr, data) {
    this.mgr = mgr;
    this.id = data.id;
    this.type = data.ty;
    this.def = itemDef(this.type);
    this.value = data.v ?? 0;
    this.baseValue = data.bv ?? this.value;
    this.battery = data.b ?? this.def.battery ?? null;
    this.charges = data.c ?? this.def.charges ?? null;
    this.ammo = data.am ?? this.def.ammo ?? null;
    this.on = !!data.on;
    this.holder = data.h || null;
    this.owner = data.o || null;          // physics owner peer (null = host)
    this.state = this.holder ? 'held' : 'world';
    this.label = data.lb || null;         // e.g. body name
    this.soulbound = data.sb || null;     // profile id for soulbound gear
    this.flags = data.f || 0;
    this.affix = normalizeAffix(data.af);   // weapon rarity + affixes (null = plain item)
    this.collected = !!data.col;
    this.tier = TIERS[data.tr] ? data.tr : null;   // rolled / granted item tier (tiers.js); null = derived (tierOfItem)
    this.inv = this.holder ? normalizeInv(data.iv) : null;   // null = hotbar / world; { k:'bag', x, y } | { k:'eq', s }
    this.reclaim = data.rc && typeof data.rc === 'object' && typeof data.rc.pid === 'string' ? { pid: data.rc.pid.slice(0, 64), iv: normalizeInv(data.rc.iv) } : null;
    this.bag = normalizeBag(data.bg);       // legacy belt bag contents (dumped by the host, see inventory.js)
    this.ladder = null;                     // deployed ladder descriptor (see deployLadder)
    if (this.type === 'beltbag') this.updateBagLabel();
    this.obj = this.makeVisual();
    this.obj.position.fromArray(data.p || [0, 0, 0]);
    if (data.q) this.obj.quaternion.fromArray(data.q);
    mgr.scene.add(this.obj);
    this.body = null; this.col = null;
    this.target = { p: this.obj.position.clone(), q: this.obj.quaternion.clone() };
    this.prevVel = new THREE.Vector3();
    this.impactCooldown = 0;
    this.sleepT = 0;
    if (this.state === 'world') {
      this.makeBody(data.lv);
      if (data.ld) this.deployLadder(data.ld);
    } else this.obj.visible = false;
  }

  makeVisual() {
    let obj;
    const custom = window.__kefalMods?.itemModels.get(this.type);
    try { obj = custom ? custom(window.KefalAPI.THREE) : createItemModel(this.type); } catch (e) { console.warn('item model', this.type, e); obj = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: 0x888888 })); }
    const root = new THREE.Group();
    root.add(obj);
    // center the visual on its bounding box so the physics cuboid matches
    const bb = new THREE.Box3().setFromObject(obj);
    const c = new THREE.Vector3(); bb.getCenter(c);
    const size = new THREE.Vector3(); bb.getSize(size);
    obj.position.sub(c);
    root.userData.size = size;
    root.userData.inner = obj;
    root.userData.gripOffset = c.clone();      // model origin (grip) relative to center
    root.userData.lightAnchor = obj.userData?.lightAnchor || null;
    root.userData.tip = obj.userData?.tip || null;
    root.userData.itemId = this.id;
    root.traverse((o) => { if (o.isMesh) o.userData.itemId = this.id; });
    return root;
  }

  get size() { return this.obj.userData.size; }
  /** extra carry weight on top of def.weight (belt bag contents) */
  get extraWeight() {
    if (!this.bag.length) return 0;
    let w = 0;
    for (const e of this.bag) w += itemDef(e.ty).weight || 0;
    return w * BAG_WEIGHT_MUL;
  }
  bagValue() { let v = 0; for (const e of this.bag) v += e.v || 0; return v; }
  updateBagLabel() {
    this.label = this.bag.length ? `${this.def.name} ${this.bag.length}/${BAG_MAX}` : null;
  }

  makeBody(linvel) {
    if (this.body) return;
    const s = this.size;
    const half = { x: Math.max(0.05, s.x / 2), y: Math.max(0.05, s.y / 2), z: Math.max(0.05, s.z / 2) };
    const big = this.def.kind === 'big' || this.type === 'body';
    const mass = this.def.mass ?? Math.max(0.5, (this.def.weight || 5) * 0.2);
    const { body, col } = this.mgr.physics.createItemBody(this.obj.position, this.obj.quaternion, half, mass, big, { kind: 'item', itemId: this.id });
    this.body = body; this.col = col;
    this.applyAuthority();
    if (linvel && this.isSimulatedHere()) body.setLinvel({ x: linvel[0], y: linvel[1], z: linvel[2] }, true);
    if (linvel) this.prevVel.set(linvel[0], linvel[1], linvel[2]); else this.prevVel.set(0, 0, 0);
    this.impactCooldown = 0.35;
  }
  removeBody() {
    if (!this.body) return;
    this.mgr.physics.removeBody(this.body);
    this.body = null; this.col = null;
  }
  isSimulatedHere() {
    const net = this.mgr.game.net;
    if (!net) return true;
    const owner = this.owner || net.hostId;
    return owner === net.selfId;
  }
  applyAuthority() {
    if (!this.body) return;
    if (this.ladder) { this.body.setBodyType(1, true); return; }   // deployed ladder: fixed everywhere
    const dyn = this.isSimulatedHere();
    this.body.setBodyType(dyn ? 0 : 2, true); // 0 dynamic, 2 kinematicPositionBased
    this.target.p.copy(this.obj.position); this.target.q.copy(this.obj.quaternion);
  }

  setHeld(holder) {
    if (holder && this.state === 'world' && this.obj.parent === this.mgr.scene) this.mgr.fxPickup(this);
    if (holder && this.ladder) this.foldLadder();
    this.holder = holder;
    this.state = holder ? 'held' : 'world';
    if (holder) this.removeBody(); else this.inv = null;
  }

  /** Stand the Extension Ladder up against a wall (all peers, from the host's 'ladder' event / welcome). */
  deployLadder(ld) {
    const L = sanitizeLadder(ld);
    if (!L || this.type !== 'ladder') return false;
    this.removeBody();
    if (this.ladderVis) this.foldLadder();
    this.ladder = L;
    this.obj.position.set(L.b[0], L.b[1] + L.h / 2, L.b[2]);
    this.obj.quaternion.setFromAxisAngle(UP, L.yaw);
    this.obj.scale.setScalar(1);
    const inner = this.obj.userData.inner;
    if (inner) inner.visible = false;
    const vis = createLadderModel(L.h);
    vis.position.set(0, -L.h / 2, 0);
    vis.traverse((o) => { if (o.isMesh) o.userData.itemId = this.id; });
    this.obj.add(vis);
    this.ladderVis = vis;
    const { body, col } = this.mgr.physics.createItemBody(this.obj.position, this.obj.quaternion, { x: 0.22, y: L.h / 2, z: 0.06 }, 5, false, { kind: 'ladder', itemId: this.id });
    this.body = body; this.col = col;
    body.setBodyType(1, true);
    this.target.p.copy(this.obj.position); this.target.q.copy(this.obj.quaternion);
    this.prevVel.set(0, 0, 0);
    return true;
  }
  foldLadder() {
    this.ladder = null;
    if (this.ladderVis) {
      this.ladderVis.removeFromParent();
      this.ladderVis.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      this.ladderVis = null;
    }
    const inner = this.obj.userData.inner;
    if (inner) inner.visible = true;
  }

  worldPos(out = new THREE.Vector3()) { return this.obj.getWorldPosition(out); }
  /** Display tier: rolled it.tier > weapon affix rarity > def tier > (scrap only) value-based rarity (tiers.js tierOfItem).
   *  Weapons, gear and tools never fall back to their value / class rarity: a plain store Kevlar Suit is Common. */
  rarity() {
    if (this.tier) return this.tier;
    if (INSTANCE_TIER_KINDS.has(this.def.kind)) return this.affix?.rarity || this.def.tier || 'common';
    return tierOfItem(this, this.def);
  }
  get tierColor() { return (TIERS[this.rarity()] || TIERS.common).color; }
  dispose() {
    this.removeBody();
    this.obj.removeFromParent();
    this.obj.traverse((o) => { if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.(); });
    this.ladderVis = null;
  }
}

export class ItemManager {
  constructor(game) {
    this.game = game;
    this.scene = game.engine.scene;
    this.physics = game.physics;
    this.items = new Map();
    this.nextId = 1;
    this.snapTimer = 0;
    this.tierRng = null; this.tierSeed = null;
    this.tools = null;
    try { if (game.mods?.on) this.tools = new ItemTools(game, this); } catch (e) { console.warn('item tools', e); }
  }
  get(id) { return this.items.get(id); }
  all() { return this.items.values(); }
  dispose() { this.tools?.dispose(); this.tools = null; }

  // ---------- host API ----------
  /** Seeded tier RNG, restarted every landing (run.seed) so a day's rolls are reproducible for the host. */
  hostTierRng() {
    const seed = this.game.run?.seed ?? 1;
    if (!this.tierRng || this.tierSeed !== seed) { this.tierRng = new RNG(((seed ^ 0x71e5) >>> 0) || 1); this.tierSeed = seed; }
    return this.tierRng;
  }
  /**
   * Resolve the tier of a new item (host). opts.tier forces one (chests, shops, crafting); weapons take their affix
   * rarity (a forced uncommon+ tier on a plain weapon rolls a matching affix); scrap / drops / big valuables roll with
   * the host loot luck; store gear stays Common unless spawned as loot (opts.valueMul) or opts.rollTier.
   */
  hostResolveTier(def, opts) {
    if (opts.tier && TIERS[opts.tier]) return opts.tier;
    if (opts.af?.rarity && TIERS[opts.af.rarity]) return opts.af.rarity;
    if (def.kind === 'weapon') return null;
    if (!rollsTier(def, opts)) return null;
    const luck = opts.luck ?? this.game.inventory?.hostLootLuck?.() ?? 0;
    return rollTier(this.hostTierRng(), { luck, minTier: opts.minTier, maxTier: opts.maxTier });
  }
  hostSpawn(type, pos, opts = {}) {
    const def = itemDef(type);
    const tier = this.hostResolveTier(def, opts);
    if (tier && def.kind === 'weapon' && !def.noAffix && !opts.af && tierIndex(tier) > 0) {
      opts = { ...opts, af: makeAffix(tierIndex(tier) >= tierIndex('legendary') ? 'legendary' : tier, this.hostTierRng()) };
    }
    let v = opts.value;
    if (v === undefined && def.value) {
      const [a, b] = def.value;
      v = Math.round((a + Math.random() * (b - a)) * (opts.valueMul ?? 1));
      if (opts.af) v = Math.round(v * affixValueBonus(opts.af));
      else if (tier && def.kind !== 'weapon' && !def.tier) v = Math.max(1, Math.round(v * TIERS[tier].valueMul * TIER_VALUE_NORM));
    }
    const id = 'i' + (this.nextId++).toString(36) + Math.floor(Math.random() * 36).toString(36);
    const yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    const data = {
      id, ty: type, v: v ?? 0, bv: opts.baseValue ?? v ?? 0,
      p: [pos.x, pos.y, pos.z], q: opts.q || [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
      b: opts.battery ?? def.battery ?? undefined, c: opts.charges ?? def.charges ?? undefined, am: def.ammo ?? undefined,
      h: opts.holder || null, lb: opts.label || undefined, sb: opts.soulbound || undefined, lv: opts.linvel || undefined,
      af: opts.af || undefined, col: opts.col ? 1 : undefined, bg: opts.bag?.length ? opts.bag : undefined,
      tr: tier || undefined,
    };
    // spawn straight into the holder's bag / equipment (crafting, reclaim): opts.inv = 'bag' | 'eq' | { k, x, y } | { k:'eq', s }
    if (opts.holder && opts.inv) { const iv = this.game.inventory?.hostPlaceFor?.(opts.holder, def, opts.inv); if (iv) data.iv = iv; }
    this.game.net.broadcast('it', { e: 'sp', ...data });
    return id;
  }

  // ---------- particles ----------
  fxPickup(it) {
    const ps = this.game.particles;
    if (!ps) return;
    const p = it.obj.getWorldPosition(tmpV2);
    const col = it.def.value || it.tier || it.affix ? it.tierColor : '#cfc6b8';
    const big = it.def.kind === 'big' || (it.def.hands === 2);
    ps.burst(p, { count: big ? 14 : 8, color: [col, 0xffffff, col], speed: 1.4, up: 1.6, life: 0.55, size: 0.05, gravity: -1.5, drag: 3 });
    if (big) ps.burst(p, FX_DUST, null, 0.6);
  }
  fxBreak(it, destroyed) {
    const ps = this.game.particles;
    if (!ps) return;
    const p = it.obj.getWorldPosition(tmpV2);
    ps.burst(p, it.def.fragile ? FX_SHARDS : FX_CHIPS, null, destroyed ? 2.2 : 0.8);
    if (destroyed) ps.burst(p, FX_DUST, null, 0.8);
  }

  // move a (held) item into the world at d.p / d.q (drop + ladder events)
  placeInWorld(it, d) {
    const prevHolder = it.holder;
    it.dropHolder = prevHolder; it.dropInv = it.inv;   // inventory.js: a leaver's bag/equipment can be reclaimed on rejoin
    it.setHeld(null);
    it.owner = null;
    this.game.onItemDropped(it, prevHolder);
    it.obj.removeFromParent();
    this.scene.add(it.obj);
    it.obj.visible = true;
    if (d.p) it.obj.position.fromArray(d.p);
    if (d.q) it.obj.quaternion.fromArray(d.q);
    it.obj.scale.setScalar(1);
    it.carrier = null;
  }

  // ---------- event application (all peers) ----------
  onEvent(d) {
    this.game.inventory?.onItemEvent?.(d);   // inventory caches (weight) follow every item change
    switch (d.e) {
      case 'sp': {
        if (this.items.has(d.id)) return;
        const it = new WorldItem(this, d);
        this.items.set(d.id, it);
        if (it.holder) this.game.onItemHeld(it, it.holder, d.sl ?? null);
        break;
      }
      case 'held': {
        const it = this.items.get(d.id); if (!it) return;
        it.owner = null;
        it.setHeld(d.h);
        it.inv = normalizeInv(d.iv);
        this.game.onItemHeld(it, d.h, d.sl);
        this.game.inventory?.onHeld?.(it, d);
        break;
      }
      case 'inv': {   // host-confirmed inventory moves for one holder: { h, mv: [[id, inv|null]...], sl?: {id: slot}, full? }
        const mv = Array.isArray(d.mv) ? d.mv : [];
        for (const m of mv) {
          const it = Array.isArray(m) && this.items.get(m[0]);
          if (!it || it.holder !== d.h) continue;
          it.inv = normalizeInv(m[1]);
        }
        this.game.inventory?.onInvEvent?.(d);
        break;
      }
      case 'drop': {
        const it = this.items.get(d.id); if (!it) return;
        this.placeInWorld(it, d);
        it.makeBody(d.lv);
        if (d.nest) it.nest = d.nest;
        break;
      }
      case 'ladder': {
        const it = this.items.get(d.id); if (!it) return;
        const L = sanitizeLadder(d.ld); if (!L) return;
        this.placeInWorld(it, {});
        it.deployLadder(L);
        const base = tmpV.set(L.b[0], L.b[1] + 0.1, L.b[2]);
        this.game.particles?.burst(base, FX_DUST, null, 0.8);
        this.game.audio?.at('hit_metal', base.clone(), 0.7, { refDistance: 3 });
        this.game.audio?.at('item_drop', base.clone().setY(L.b[1] + L.h * 0.6), 0.6, { refDistance: 3 });
        break;
      }
      case 'bag': {
        const it = this.items.get(d.id); if (!it) return;
        const before = it.bag.length;
        it.bag = normalizeBag(d.bg);
        it.updateBagLabel();
        if (d.fx) { const fp = finite3(d.fx); if (fp) this.game.particles?.burst(tmpV.fromArray(fp), FX_DUST, null, 0.5); }
        if (it.holder === this.game.selfId) {
          this.game.refreshHeldVisuals?.();
          this.game.sfx?.(it.bag.length > before ? 'inventory_switch' : 'item_drop', 0.6, 0.8);
          if (it.bag.length) this.game.ui?.toast(`${t(it.def.name)} ${it.bag.length}/${BAG_MAX} · ▮${it.bagValue()}`, 'info');
        }
        break;
      }
      case 'rm': {
        const it = this.items.get(d.id); if (!it) return;
        if (it.holder) this.game.onItemDropped(it, it.holder, true);
        it.dispose();
        this.items.delete(d.id);
        this.game.grab?.onItemRemoved(d.id);
        break;
      }
      case 'val': {
        const it = this.items.get(d.id); if (!it) return;
        const lost = it.value - d.v;
        it.value = d.v;
        if (lost > 0) {
          this.game.onItemValueLost(it, lost);
          if (it.state === 'world') this.fxBreak(it, d.v <= 0);
        }
        break;
      }
      case 'own': {
        const it = this.items.get(d.id); if (!it) return;
        it.owner = d.o || null;
        const gb = this.game.grab;
        if (gb && gb.pendingRelease === d.id && it.owner === this.game.selfId && gb.item !== it) {
          gb.pendingRelease = null;
          const p = it.obj.position, q = it.obj.quaternion;
          setTimeout(() => this.game.net.request('release', { id: it.id, p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w], lv: [0, 0, 0], av: [0, 0, 0] }), 0);
        }
        if (d.p) { it.obj.position.fromArray(d.p); it.obj.quaternion.fromArray(d.q); }
        if (it.body) {
          it.body.setTranslation(it.obj.position, true);
          it.body.setRotation(it.obj.quaternion, true);
          it.applyAuthority();
          if (it.isSimulatedHere()) {
            if (d.lv) it.body.setLinvel({ x: d.lv[0], y: d.lv[1], z: d.lv[2] }, true);
            if (d.av) it.body.setAngvel({ x: d.av[0], y: d.av[1], z: d.av[2] }, true);
          }
          if (d.lv) it.prevVel.set(d.lv[0], d.lv[1], d.lv[2]);
          it.impactCooldown = 0.35;
        }
        break;
      }
      case 'tp': { // teleport (e.g. move items with vault open / sell)
        const it = this.items.get(d.id); if (!it) return;
        it.obj.position.fromArray(d.p);
        if (it.body) { it.body.setTranslation({ x: d.p[0], y: d.p[1], z: d.p[2] }, true); it.body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
        it.target.p.fromArray(d.p);
        break;
      }
      default: break;
    }
  }

  // item runtime state from the holder (on/off, battery, charges)
  onState(d) {
    const it = this.items.get(d.id); if (!it) return;
    if (d.on !== undefined) it.on = d.on;
    if (d.b !== undefined) it.battery = d.b;
    if (d.c !== undefined) it.charges = d.c;
    if (d.am !== undefined) it.ammo = d.am;
    this.game.onItemState?.(it);
  }

  // Snapshot of simulated moving items (owner sends)
  collectSnapshot(onlyOwnedBy) {
    const out = [];
    for (const it of this.items.values()) {
      if (!it.body || it.state !== 'world' || it.ladder) continue;
      const owner = it.owner || this.game.net.hostId;
      if (owner !== onlyOwnedBy) continue;
      if (it.body.isSleeping()) { if (it.sentSleep) continue; it.sentSleep = true; } else it.sentSleep = false;
      const t = it.body.translation(), r = it.body.rotation();
      out.push([it.id, +t.x.toFixed(3), +t.y.toFixed(3), +t.z.toFixed(3), +r.x.toFixed(4), +r.y.toFixed(4), +r.z.toFixed(4), +r.w.toFixed(4)]);
    }
    return out;
  }
  applySnapshot(list) {
    for (const s of list) {
      const it = this.items.get(s[0]);
      if (!it || it.state !== 'world' || it.ladder || it.isSimulatedHere()) continue;
      it.target.p.set(s[1], s[2], s[3]);
      it.target.q.set(s[4], s[5], s[6], s[7]);
      it.hasTarget = true;
    }
  }

  // per-frame: sync visuals with bodies, interpolate proxies, detect impacts for fragile items
  update(dt) {
    const game = this.game;
    for (const it of this.items.values()) {
      if (it.state !== 'world' || !it.body || it.ladder) continue;
      if (it.isSimulatedHere()) {
        const t = it.body.translation(), r = it.body.rotation();
        it.obj.position.set(t.x, t.y, t.z);
        it.obj.quaternion.set(r.x, r.y, r.z, r.w);
        // impact detection
        const v = it.body.linvel();
        tmpV.set(v.x, v.y, v.z);
        const dv = tmpV.distanceTo(it.prevVel);
        it.prevVel.copy(tmpV);
        it.impactCooldown -= dt;
        if (dv > 4.2 && it.impactCooldown <= 0) {
          it.impactCooldown = 0.25;
          game.onItemImpact(it, dv);
        }
        // fell out of the world
        if (t.y < -420) { it.body.setTranslation({ x: 0, y: 1, z: 0 }, true); it.body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
      } else {
        if (it.hasTarget) {
          it.obj.position.lerp(it.target.p, Math.min(1, dt * 14));
          it.obj.quaternion.slerp(it.target.q, Math.min(1, dt * 14));
        }
        it.body.setNextKinematicTranslation(it.obj.position);
        it.body.setNextKinematicRotation(it.obj.quaternion);
      }
    }
  }

  inShipItems() {
    const out = [];
    for (const it of this.items.values()) {
      if (it.state === 'world' && insideShip(it.obj.position)) out.push(it);
    }
    return out;
  }

  clearAll() {
    for (const it of this.items.values()) it.dispose();
    this.items.clear();
    this.tools?.onClear();
  }

  // Serialize for welcome / saves
  serialize(filter = () => true) {
    const out = [];
    for (const it of this.items.values()) {
      if (!filter(it)) continue;
      const p = it.state === 'world' ? it.obj.position : new THREE.Vector3();
      out.push({
        id: it.id, ty: it.type, v: it.value, bv: it.baseValue, p: [p.x, p.y, p.z], q: it.obj.quaternion.toArray(),
        b: it.battery ?? undefined, c: it.charges ?? undefined, am: it.ammo ?? undefined, h: it.holder || null, o: it.owner || null,
        on: it.on || undefined, lb: it.label || undefined, sb: it.soulbound || undefined, sl: it.slot ?? undefined,
        af: it.affix || undefined, col: it.collected ? 1 : undefined,
        bg: it.bag.length ? it.bag.map((e) => ({ ...e })) : undefined, ld: it.ladder || undefined,
        tr: it.tier || undefined, iv: it.holder && it.inv ? { ...it.inv } : undefined, rc: it.reclaim || undefined,
      });
    }
    return out;
  }
}

// =====================================================================================================
// ItemTools — special item mechanics (client side + small host handlers under the 'itool' request).
// =====================================================================================================
const TOOL_HINT_TYPES = new Set(['ladder', 'booster', 'inhaler', 'beltbag', 'adblock']);
const SPECIAL_HINTS = {
  hot: 'It burns while you carry it (-HP over time). Worth a fortune.',
  cursed: 'It whispers. Creatures can hear it too.',
  flash: 'LMB: blinding flash that stuns creatures in front of you.',
  glow: 'LMB toggles the ring light. Charge it on the ship.',
  shake: 'Careful: it screeches when you run or jump with it in hand.',
};
const WHISPERS = ['forward me to 10 friends...', 'you have been chosen...', "don't break the chain...", 'they left you on read...',
  'we have seen your search history...', 'engagement is love...', 'one of you is not a real crewmate...', 'like and subscribe... or else...'];
// Adblock Spray: [damage per puff, stun seconds] per creature type. Everything else shrugs it off.
const ADBLOCK = {
  scuttler: [7, 0.8], ticketswarm: [8, 0.6], clickbait: [6, 1.2], jester: [0, 1.4], replyguy: [5, 0.8],
  leech: [8, 1], spider: [4, 0.4], web: [12, 0], screamer: [3, 0.8],
};
const BOOST_EVERY = 3.2;      // s between Signal Booster pings
const BOOST_RANGE = 14;       // m
const BOOST_VIEW = 45;        // m (only peers this close see the ping)
const INHALE_RATE = 20;       // charges per second of inhaling (100 = 5 s)
const HYPE_PER_S = 5;         // hype seconds per second of inhaling
const HYPE_MAX = 30;
const HYPE_OD = 20;           // overdose threshold
const SPRAY_RATE = 10;        // charges per second (100 = 10 s)

export class ItemTools {
  constructor(game, mgr) {
    this.game = game; this.mgr = mgr;
    this.offs = [];
    this.rings = []; this.ringGeo = null;
    this.glowLights = new Map();
    this.hinted = new Set();
    this.cache = { boosters: [], glows: [], hots: [], ladders: [] };
    this.cacheT = 0;
    this.climb = null;
    this.hype = 0; this.warpOn = false; this.odT = 0;
    this.noiseT = 0; this.noiseOn = false;
    this.burnT = 0; this.hotHinted = false;
    this.whisperT = 10 + Math.random() * 6;
    this.shakeT = 0;
    this.fxT = 0; this.hitT = 0; this.sndT = 0; this.syncT = 0;
    this.lastHeldType = null;
    this.emptyShown = false;
    this.flashCd = 0;
    this.blockMsgT = new Map();
    this.sprayVoices = new Map();
    this.worldFxT = 0;
    this.disposed = false;
    const mods = game.mods;
    this.offs.push(mods.on('useItem', (it, hk, g) => { if (g === game && it && !hk.handled) this.onUse(it, hk); }));
    this.offs.push(mods.on('interactables', (out, g) => { if (g === game) this.addInteractables(out); }));
    this.offs.push(mods.on('update', (dt, g) => { if (g === game) this.update(dt); }));
    this.offs.push(mods.on('fx', (d) => { if (!game.destroyed && d && d.k === 'itool') this.onFx(d); }));
    this.offs.push(mods.on('registerHandlers', (H, g) => { if (g === game) H('itool', (d, from) => this.hostHandle(d, from)); }));
    this.offs.push(mods.on('sessionEnd', (g) => { if (g === game) this.dispose(); }));
  }

  get net() { return this.game.net; }
  toast(s, kind = 'info') { this.game.ui?.toast(t(s), kind); }
  eyeFwd() {
    const cam = this.game.camera;
    return { eye: cam.position.clone(), fwd: new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion) };
  }
  snd(a, b) { return this.game.audio?.has?.(a) ? a : b; }

  // ------------------------------------------------------------------ LMB press
  onUse(it, hk) {
    const d = it.def;
    switch (it.type) {
      case 'ladder': hk.handled = true; this.deployLadder(it); return;
      case 'booster': hk.handled = true; this.armBooster(it); return;
      case 'inhaler': case 'adblock':
        hk.handled = true;
        if ((it.charges ?? 0) <= 0) this.toast(it.type === 'inhaler' ? 'The inhaler is empty.' : 'The spray can is empty.');
        return;
      default: break;
    }
    if (d.flash) { hk.handled = true; this.flash(it); return; }
    if (d.glow) {
      hk.handled = true;
      if ((it.battery ?? 0) <= 0) { this.game.sfx?.('battery_dead', 0.5); this.toast('Battery is dead. Charge it on the ship.'); return; }
      this.game.setItemOn?.(it, !it.on);
      this.game.sfx?.('flashlight_click', 0.6);
    }
  }

  // ------------------------------------------------------------------ Extension Ladder
  deployLadder(it) {
    const g = this.game, p = g.player, ph = g.physics;
    const mask = G.STATIC | G.DOOR;
    const dir = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const origin = new THREE.Vector3(p.pos.x, p.pos.y + 1.0, p.pos.z);
    const hit = ph.raycast(origin, dir, 2.4, mask);
    if (!hit || Math.abs(hit.normal.y) > 0.5) { this.toast('Face a wall to set up the ladder.'); g.sfx?.('ui_error', 0.4); return; }
    const n = new THREE.Vector3(hit.normal.x, 0, hit.normal.z);
    if (n.lengthSq() < 1e-4) { this.toast('Face a wall to set up the ladder.'); return; }
    n.normalize();
    const into = n.clone().negate();
    const wp = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z);
    const foot = wp.clone().addScaledVector(n, 0.16);
    const down = ph.raycast(new THREE.Vector3(foot.x, origin.y + 0.3, foot.z), DOWN, 3.5, mask);
    if (!down) { this.toast('No solid floor here.'); return; }
    const floorY = down.point.y;
    let land = null;
    for (let h = 1.1; h <= LADDER_MAX_LEDGE + 0.5; h += 0.15) {
      // stop at a ceiling right above the ladder foot
      if (ph.raycast(new THREE.Vector3(foot.x, floorY + h - 0.15, foot.z), UP, 0.16, mask)) break;
      if (ph.raycast(new THREE.Vector3(foot.x, floorY + h, foot.z), into, 0.6, mask)) continue;   // still wall
      // the wall ends below this height: look for a walkable ledge just behind its face
      const probe = new THREE.Vector3(wp.x, floorY + h + 1.2, wp.z).addScaledVector(into, 0.6);
      const top = ph.raycast(probe, DOWN, 1.9, mask);
      if (!top || top.distance < 0.05 || top.normal.y < 0.6) continue;
      const tp = new THREE.Vector3(top.point.x, top.point.y, top.point.z);
      const rise = tp.y - floorY;
      if (rise < LADDER_MIN_LEDGE || rise > LADDER_MAX_LEDGE) continue;
      if (ph.raycast(tp.clone().add(new THREE.Vector3(0, 0.05, 0)), UP, 1.75, mask)) continue;   // no headroom up there
      land = tp;
      break;
    }
    if (!land) { this.toast('No ledge to climb here (needs a wall with a top).'); g.sfx?.('ui_error', 0.4); return; }
    let H = Math.min(LADDER_MAX_H, land.y - floorY + 1.0);
    const ceil = ph.raycast(new THREE.Vector3(foot.x, floorY + 0.3, foot.z), UP, H, mask);
    if (ceil) H = Math.max(land.y - floorY + 0.3, ceil.distance + 0.25);
    const ld = { b: [foot.x, floorY, foot.z], h: +H.toFixed(3), yaw: Math.atan2(n.x, n.z), t: [land.x, land.y, land.z] };
    if (!sanitizeLadder(ld)) { this.toast('No ledge to climb here (needs a wall with a top).'); return; }
    // predict like dropItem: free the slot right away
    const i = p.slots.indexOf(it.id);
    if (i >= 0) p.slots[i] = null;
    it.obj.visible = false;
    g.refreshHeldVisuals?.();
    this.net.request('itool', { op: 'ladder', id: it.id, ld });
  }

  addInteractables(out) {
    const g = this.game, p = g.player;
    if (!p || p.dead || this.climb) return;
    for (const it of this.cache.ladders) {
      const L = it.ladder;
      if (!L || it.state !== 'world') continue;
      const nx = Math.sin(L.yaw), nz = Math.cos(L.yaw);
      const dBase = Math.hypot(p.pos.x - L.b[0], p.pos.z - L.b[2]);
      if (dBase < 2.3 && Math.abs(p.pos.y - L.b[1]) < 1.6) {
        out.push({
          pos: new THREE.Vector3(L.b[0] + nx * 0.08, L.b[1] + Math.min(L.h - 0.2, 1.3), L.b[2] + nz * 0.08), r: 0.75, reach: 2.6, noLos: true,
          label: () => (p.crouch ? t('Fold the ladder [E]') : t('Climb ladder [E]')),
          sub: () => (p.crouch ? '' : t('Crouch + [E] folds it')),
          action: () => { if (p.crouch) g.pickup?.(it); else this.startClimb(it, true); },
        });
      }
      const dTop = Math.hypot(p.pos.x - L.t[0], p.pos.z - L.t[2]);
      if (dTop < 1.9 && Math.abs(p.pos.y - L.t[1]) < 1.2) {
        out.push({ pos: new THREE.Vector3(L.b[0], L.t[1] + 0.7, L.b[2]), r: 0.9, reach: 2.8, noLos: true, label: t('Climb down [E]'), action: () => this.startClimb(it, false) });
      }
    }
  }

  startClimb(it, up) {
    const g = this.game, p = g.player, L = it.ladder;
    if (!L || p.dead) return;
    const nx = Math.sin(L.yaw), nz = Math.cos(L.yaw);
    const bottom = new THREE.Vector3(L.b[0] + nx * 0.42, L.b[1] + 0.02, L.b[2] + nz * 0.42);
    const railTop = new THREE.Vector3(bottom.x, L.t[1] + 0.2, bottom.z);
    const top = new THREE.Vector3(L.t[0], L.t[1] + 0.05, L.t[2]);
    const climbDur = Math.max(0.5, (L.t[1] - L.b[1]) / 3.4);
    const pts = up ? [p.pos.clone(), bottom, railTop, top] : [p.pos.clone(), railTop, bottom];
    const durs = up ? [0.18, climbDur, 0.3] : [0.25, climbDur];
    this.climb = { it, pts, durs, seg: 0, t: 0, stepT: 0 };
    p.frozen = true;
    p.teleport(p.pos.clone(), L.yaw);
    g.sfx?.('hit_metal', 0.35, 1.2);
  }
  updateClimb(dt) {
    const c = this.climb, g = this.game, p = g.player;
    if (!c) return;
    if (p.dead || !c.it.ladder || !this.mgr.items.has(c.it.id)) { this.climb = null; p.frozen = false; return; }
    c.t += dt;
    while (c.seg < c.durs.length && c.t >= c.durs[c.seg]) { c.t -= c.durs[c.seg]; c.seg++; }
    if (c.seg >= c.durs.length) {
      p.teleport(c.pts[c.pts.length - 1].clone());
      p.frozen = false;
      this.climb = null;
      g.sfx?.('land_soft', 0.4);
      return;
    }
    const u = c.t / c.durs[c.seg];
    const e = u * u * (3 - 2 * u);
    p.teleport(tmpV.copy(c.pts[c.seg]).lerp(c.pts[c.seg + 1], e).clone());
    c.stepT -= dt;
    if (c.stepT <= 0 && Math.abs(c.pts[c.seg + 1].y - c.pts[c.seg].y) > 0.8) {
      c.stepT = 0.3;
      const s = this.snd('step_metal_' + (1 + Math.floor(Math.random() * 6)), 'hit_metal');
      g.audio?.play(s, { volume: s === 'hit_metal' ? 0.18 : 0.5, bus: 'sfx', pitch: 0.9 + Math.random() * 0.25 });
    }
  }

  // ------------------------------------------------------------------ Signal Booster
  armBooster(it) {
    const g = this.game;
    if (!it.on) g.setItemOn?.(it, true);
    g.sfx?.(this.snd('beep_2', 'mine_beep'), 0.6);
    g.dropItem?.(it, true);
    this.toast('Signal Booster armed. It pings scrap and creatures nearby.', 'good');
  }
  pulseBooster(it) {
    const g = this.game;
    const pos = it.obj.position;
    if (g.isHost) g.creatures?.noise?.(pos.clone(), 0.3);
    if (g.camera.position.distanceTo(pos) > BOOST_VIEW) return;
    g.audio?.at(this.snd('beep_3', 'mine_beep'), pos.clone(), 0.55, { refDistance: 3, maxDistance: 40 });
    this.spawnRing(pos, BOOST_RANGE, 0x6affb0);
    const hud = g.ui?.hud;
    if (!hud) return;
    const scrap = [];
    for (const o of this.mgr.items.values()) {
      if (o === it || o.state !== 'world' || !isSellable(o.def)) continue;
      const d = o.obj.position.distanceTo(pos);
      if (d < BOOST_RANGE) scrap.push([d, o]);
    }
    scrap.sort((a, b) => a[0] - b[0]);
    for (const [, o] of scrap.slice(0, 10)) {
      const v = Math.max(5, Math.round(o.value / 5) * 5);
      hud.floatText(o.obj.position.clone().add(new THREE.Vector3(0, 0.45, 0)), `▮${v}`, o.tierColor);
    }
    let n = 0;
    for (const v of g.creatures?.views?.values() || []) {
      if (n >= 6) break;
      if (v.state === 'dead' || v.hidden || v.type === 'web' || v.type === 'mimicdoor') continue;
      if (v.pos.distanceTo(pos) > BOOST_RANGE) continue;
      n++;
      hud.floatText(v.pos.clone().add(new THREE.Vector3(0, (v.height || 1.5) + 0.3, 0)), `⚠ ${v.type === 'mimic' ? '???' : v.def?.name || '???'}`, '#ff5a5a');
    }
  }
  spawnRing(pos, radius, color) {
    if (!this.ringGeo) { this.ringGeo = new THREE.RingGeometry(0.92, 1, 40); this.ringGeo.rotateX(-Math.PI / 2); }
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.position.copy(pos); m.position.y += 0.05;
    m.renderOrder = 3;
    m.frustumCulled = false;
    this.game.scene.add(m);
    this.rings.push({ m, mat, t: 0, dur: 1.15, r: radius });
  }
  updateRings(dt) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const u = Math.min(1, r.t / r.dur);
      r.m.scale.setScalar(0.2 + (1 - (1 - u) * (1 - u)) * r.r);
      r.mat.opacity = 0.7 * (1 - u);
      if (u >= 1) { r.m.removeFromParent(); r.mat.dispose(); this.rings.splice(i, 1); }
    }
  }

  // ------------------------------------------------------------------ legacy Belt Bag contents
  /** Host: spill the scrap entries an old-save Belt Bag still carries (the bag itself is now a wearable grid bag). */
  hostDumpLegacyBag(bag, pos) {
    const g = this.game, items = this.mgr;
    if (!g.isHost || !bag?.bag?.length) return;
    const p = pos ? pos.clone() : (bag.holder ? (bag.holder === g.selfId ? g.player.pos : g.remotes.get(bag.holder)?.pos)?.clone()?.add(new THREE.Vector3(0, 1, 0)) : bag.obj.position.clone()) || new THREE.Vector3(0, 1, 0);
    const list = bag.bag;
    bag.bag = [];
    list.forEach((e, i) => {
      const off = new THREE.Vector3(((i % 2) - 0.5) * 0.22, 0.2 + i * 0.1, (Math.floor(i / 2) - 0.5) * 0.22);
      items.hostSpawn(e.ty, p.clone().add(off), { value: e.v, baseValue: e.bv, battery: e.b, charges: e.c, col: e.col, linvel: [off.x * 2, 0.5, off.z * 2] });
    });
    g.net.broadcast('it', { e: 'bag', id: bag.id, bg: [] });
  }

  // ------------------------------------------------------------------ Webcam flash
  flash(it) {
    const g = this.game;
    if (g.time < this.flashCd) return;
    if ((it.charges ?? 0) <= 0) { this.toast('The webcam flash is burnt out.'); g.sfx?.('battery_dead', 0.5); return; }
    this.flashCd = g.time + 0.9;
    it.charges -= 1;
    this.net.broadcast('itst', { id: it.id, c: it.charges });
    const { eye, fwd } = this.eyeFwd();
    this.net.broadcast('fx', { k: 'itool', t: 'flash', p: eye.toArray(), d: fwd.toArray(), by: g.selfId });
    for (const v of g.creatures?.views?.values() || []) {
      if (v.state === 'dead' || v.hidden || v.def?.hazard || v.def?.boss) continue;
      const c = v.pos.clone().add(new THREE.Vector3(0, (v.height || 1.5) * 0.6, 0));
      const to = c.clone().sub(eye);
      const dd = to.length();
      if (dd > 9 || to.normalize().dot(fwd) < 0.78) continue;
      if (!g.physics.lineOfSight(eye, c)) continue;
      this.net.request('hit', { cid: v.id, dmg: 0, stun: 2.2, kb: 0.5 });
      g.ui?.hud?.floatText(c, t('BLINDED'), '#ffffff');
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    if (this.disposed) return;
    const g = this.game, p = g.player;
    if (!p) return;
    this.cacheT -= dt;
    if (this.cacheT <= 0) this.refreshCache();
    this.updateRings(dt);
    this.updateClimb(dt);
    this.updateGlows(dt);
    // boosters (every peer runs its own ping clock; pings are cosmetic except the host's noise)
    for (const it of this.cache.boosters) {
      if (!it.on || it.state !== 'world') { it._ping = null; continue; }
      if (it._ping == null) it._ping = 0.7;
      it._ping -= dt;
      if (it._ping <= 0) { it._ping = BOOST_EVERY; this.pulseBooster(it); }
    }
    // hot items lying around steam a little
    this.worldFxT -= dt;
    if (this.worldFxT <= 0) {
      this.worldFxT = 0.4;
      for (const it of this.cache.hots) {
        if (it.state !== 'world' || it.obj.position.distanceTo(g.camera.position) > 20) continue;
        g.particles?.burst(it.obj.position.clone().add(new THREE.Vector3(0, 0.08, 0)), FX_STEAM);
      }
    }
    this.updateHype(dt);
    if (p.dead || !g.net) { this.lastHeldType = null; return; }
    const held = p.heldItem();
    this.hintFor(held);
    const lmb = !!(held && g.input?.mouseDown(0) && !g.minigame);
    this.updateInhaler(dt, held, lmb);
    this.updateSpray(dt, held, lmb);
    if (!lmb) this.emptyShown = false;
    this.updateCarried(dt, held);
    // periodic charge sync for the continuous tools
    this.syncT -= dt;
    if (this.syncT <= 0 && this.dirty) {
      this.syncT = 0.8;
      const it = this.dirty; this.dirty = null;
      if (this.mgr.items.has(it.id)) this.net.broadcast('itst', { id: it.id, c: Math.round(it.charges) });
    }
  }

  refreshCache() {
    this.cacheT = 0.5;
    const c = this.cache;
    c.boosters.length = 0; c.glows.length = 0; c.hots.length = 0; c.ladders.length = 0;
    for (const it of this.mgr.items.values()) {
      if (it.type === 'booster') c.boosters.push(it);
      else if (it.ladder) c.ladders.push(it);
      if (it.def.glow) c.glows.push(it);
      if (it.def.hot) c.hots.push(it);
    }
  }

  hintFor(held) {
    const type = held?.type || null;
    if (type === this.lastHeldType) return;
    this.lastHeldType = type;
    if (!held || this.hinted.has(type)) return;
    const d = held.def;
    let tip = null;
    if (TOOL_HINT_TYPES.has(type) || ((d.kind === 'bag' || d.kind === 'armor' || d.kind === 'trinket') && d.tip)) tip = d.tip;
    else for (const k of Object.keys(SPECIAL_HINTS)) if (d[k]) { tip = SPECIAL_HINTS[k]; break; }
    if (!tip) return;
    this.hinted.add(type);
    this.game.ui?.toast(`💡 ${t(d.name)}: ${t(tip)}`, 'info');
  }

  updateInhaler(dt, held, lmb) {
    if (held?.type !== 'inhaler' || !lmb) return;
    const g = this.game, p = g.player;
    if ((held.charges ?? 0) <= 0) {
      if (!this.emptyShown) { this.emptyShown = true; this.toast('The inhaler is empty.'); }
      return;
    }
    this.drain(held, INHALE_RATE * dt);
    this.hype = Math.min(HYPE_MAX, this.hype + HYPE_PER_S * dt);
    p.stamina = Math.min(p.maxStamina, p.stamina + 60 * dt);
    this.sndT -= dt;
    if (this.sndT <= 0) { this.sndT = 0.55; g.audio?.play('steam_hiss', { volume: 0.3, bus: 'sfx', pitch: 1.8 }); }
    this.fxT -= dt;
    if (this.fxT <= 0) {
      this.fxT = 0.08;
      const { eye, fwd } = this.eyeFwd();
      g.particles?.burst(eye.addScaledVector(fwd, 0.35).add(new THREE.Vector3(0, -0.12, 0)), FX_HYPE);
    }
    if (held.charges <= 0) {
      this.net.broadcast('itst', { id: held.id, c: 0 });
      this.dirty = null;
      this.toast('Hype Inhaler is empty. Tossed it.', 'info');
      this.net.request('consume', { id: held.id });
    }
  }

  /** continuous charge use: float accumulator, integer charges for the HUD / network */
  drain(it, amt) {
    let f = it._fuel;
    if (f == null || Math.ceil(f - 1e-6) !== it.charges) f = it.charges ?? 0;   // charges changed elsewhere (network / charger)
    f = Math.max(0, f - amt);
    it._fuel = f;
    const c = Math.ceil(f - 1e-6);
    if (c !== it.charges) { it.charges = c; this.dirty = it; }
  }

  updateHype(dt) {
    const g = this.game, p = g.player;
    if (p.dead && this.hype > 0) this.hype = 0;
    if (this.hype > 0) {
      this.hype = Math.max(0, this.hype - dt);
      p.speedBoost = Math.max(p.speedBoost || 0, 0.25);
      const od = this.hype > HYPE_OD;
      g.engine.fx.warp = Math.min(od ? 1.8 : 1, this.hype / 6);
      this.warpOn = true;
      if (od) {
        this.odT -= dt;
        if (this.odT <= 0) {
          this.odT = 0.9;
          g.audio?.play('heartbeat', { volume: 0.5, bus: 'sfx', pitch: 1.3 });
          if (p.hp > 20) { p.hp = Math.max(20, p.hp - 2); this.net?.send('pst', { hp: Math.round(p.hp) }); }
          g.engine.hurt?.(0.12);
        }
      }
    } else if (this.warpOn) {
      g.engine.fx.warp = 0;
      this.warpOn = false;
      this.odT = 0;
    }
  }

  updateSpray(dt, held, lmb) {
    if (held?.type !== 'adblock' || !lmb) return;
    const g = this.game;
    if ((held.charges ?? 0) <= 0) {
      if (!this.emptyShown) { this.emptyShown = true; this.toast('The spray can is empty.'); }
      return;
    }
    this.drain(held, SPRAY_RATE * dt);
    const { eye, fwd } = this.eyeFwd();
    this.fxT -= dt;
    if (this.fxT <= 0) {
      this.fxT = 0.18;
      const tip = held.obj.userData.tip ? held.obj.userData.tip.getWorldPosition(new THREE.Vector3()) : eye.clone().addScaledVector(fwd, 0.5);
      this.net.broadcast('fx', { k: 'itool', t: 'spray', p: tip.toArray().map((v) => +v.toFixed(3)), d: fwd.toArray().map((v) => +v.toFixed(3)), by: g.selfId });
    }
    this.hitT -= dt;
    if (this.hitT <= 0) {
      this.hitT = 0.3;
      for (const v of g.creatures?.views?.values() || []) {
        if (v.state === 'dead' || v.hidden) continue;
        const c = v.pos.clone().add(new THREE.Vector3(0, Math.min(1.2, (v.height || 1.5) * 0.5), 0));
        const to = c.clone().sub(eye);
        const dd = to.length();
        if (dd > 4.8 || to.normalize().dot(fwd) < 0.8) continue;
        if (!g.physics.lineOfSight(eye, c)) continue;
        const e = ADBLOCK[v.type];
        const now = g.time;
        if (e) {
          this.net.request('hit', { cid: v.id, dmg: e[0], stun: e[1], kb: 0.7 });
          if ((this.blockMsgT.get(v.id) || 0) < now) { this.blockMsgT.set(v.id, now + 1.2); g.ui?.hud?.floatText(c, t('BLOCKED'), '#8fe8ff'); }
        } else if (!v.def?.hazard && (this.blockMsgT.get(v.id) || 0) < now) {
          this.blockMsgT.set(v.id, now + 2.5);
          g.ui?.hud?.floatText(c, t('IMMUNE'), '#9a9a9a');
        }
      }
    }
    if (held.charges <= 0) { this.net.broadcast('itst', { id: held.id, c: 0 }); this.dirty = null; this.toast('The spray can is empty.'); }
  }

  // effects of what the local player is carrying (hot, cursed, shake)
  updateCarried(dt, held) {
    const g = this.game, p = g.player;
    let hot = null, cursed = null;
    for (const id of p.slots) {
      const it = id && this.mgr.get(id);
      if (!it) continue;
      if (it.def.hot && !hot) hot = it;
      if (it.def.cursed && !cursed) cursed = it;
    }
    // Overclocked GPU: burns while carried
    if (hot) {
      const H = hot.def.hot;
      this.burnT += dt;
      if (this.burnT >= H.every) {
        this.burnT = 0;
        if (p.hp > H.floor) {
          p.hp = Math.max(H.floor, p.hp - H.dmg);
          this.net.send('pst', { hp: Math.round(p.hp) });
          g.engine.hurt?.(0.1);
          g.audio?.play('steam_hiss', { volume: 0.18, bus: 'sfx', pitch: 1.4 });
        }
      }
      if (hot === held) {
        this.steamT = (this.steamT || 0) - dt;
        if (this.steamT <= 0) { this.steamT = 0.3; g.particles?.burst(hot.obj.getWorldPosition(new THREE.Vector3()), FX_STEAM); }
      }
    } else this.burnT = 0;
    // Cursed Chain Letter: whispers + draws creatures
    if (cursed) {
      this.whisperT -= dt;
      if (this.whisperT <= 0) {
        this.whisperT = 9 + Math.random() * 9;
        const { eye, fwd } = this.eyeFwd();
        const behind = eye.clone().addScaledVector(fwd, -1.2).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.2, (Math.random() - 0.5) * 1.5));
        this.net.broadcast('fx', { k: 'itool', t: 'whisper', p: behind.toArray().map((v) => +v.toFixed(2)), by: g.selfId });
        this.net.request('noise', { p: p.pos.toArray(), loud: 0.5 });
        g.ui?.toast(`"${t(WHISPERS[Math.floor(Math.random() * WHISPERS.length)])}"`, 'bad');
        this.noiseT = 0.7;
      }
    } else this.whisperT = Math.max(this.whisperT, 6);
    if (this.noiseT > 0) {
      this.noiseT -= dt;
      g.engine.fx.noise = Math.max(0, 0.4 * (this.noiseT / 0.7));
      this.noiseOn = true;
    } else if (this.noiseOn) { g.engine.fx.noise = 0; this.noiseOn = false; }
    // screechers (Dial-up Modem, Pocket Pet): running / jumping with one in hand makes it scream
    const sh = held?.def.shake;
    if (sh && (p.sprinting || Math.abs(p.vel?.y || 0) > 3.2)) {
      this.shakeT += dt;
      if (this.shakeT > 0.9) {
        this.shakeT = 0;
        const eye = p.eyePos();
        this.net.broadcast('fx', { k: 'snd', s: held.def.useSound || 'walkie_static', p: eye.toArray(), v: 0.9, r: 5 });
        this.net.request('noise', { p: eye.toArray(), loud: sh.loud });
        g.ui?.hud?.floatText(eye.addScaledVector(p.forward(), 0.8), t('*SCREEEE*'), '#ffd23f');
      }
    } else this.shakeT = Math.max(0, this.shakeT - dt * 0.5);
  }

  // Ring Light glow: one pooled light per lit ring light (constant light COUNT is handled by the LightPool)
  updateGlows() {
    const g = this.game;
    for (const it of this.cache.glows) {
      const want = it.on && (it.battery ?? 0) > 0 && this.mgr.items.has(it.id);
      let L = this.glowLights.get(it.id);
      if (want && !L) {
        const gl = it.def.glow;
        L = g.lights.add({ pos: new THREE.Vector3(), color: gl.color, intensity: gl.intensity, distance: gl.distance, group: 'items' });
        this.glowLights.set(it.id, L);
      } else if (!want && L) { g.lights.remove(L); this.glowLights.delete(it.id); L = null; }
      if (!L) continue;
      if (it.holder === g.selfId) {
        const { eye, fwd } = this.eyeFwd();
        L.pos.copy(eye).addScaledVector(fwd, 0.6);
      } else {
        const a = it.obj.userData.lightAnchor;
        (a || it.obj).getWorldPosition(L.pos);
      }
      L.intensity = it.def.glow.intensity * ((it.battery ?? 0) < 20 ? 0.5 + Math.random() * 0.4 : 1);
    }
    for (const [id, L] of this.glowLights) {
      const it = this.mgr.items.get(id);
      if (!it || !it.on) { g.lights.remove(L); this.glowLights.delete(id); }
    }
  }

  // ------------------------------------------------------------------ fx (all peers, including the sender)
  onFx(d) {
    const g = this.game;
    const p = finite3(d.p);
    if (!p) return;
    const pos = new THREE.Vector3().fromArray(p);
    if (d.t === 'spray') {
      const dir = finite3(d.d);
      g.particles?.burst(pos, FX_SPRAY, dir ? new THREE.Vector3().fromArray(dir) : null);
      const last = this.sprayVoices.get(d.by) || 0;
      if (g.time - last > 0.35) { this.sprayVoices.set(d.by, g.time); g.audio?.at('spray_paint', pos, 0.45, { refDistance: 2, maxDistance: 25, pitch: 0.8 }); }
    } else if (d.t === 'flash') {
      g.audio?.at('safe_click', pos.clone(), 0.9, { refDistance: 3 });
      g.audio?.at('flashlight_click', pos.clone(), 0.7, { refDistance: 3 });
      const L = g.lights.add({ pos: pos.clone(), color: 0xffffff, intensity: 7, distance: 14, group: 'fx' });
      setTimeout(() => g.lights?.remove(L), 140);
      if (d.by === g.selfId) { g.engine.flash(0xffffff, 0.22); return; }
      const eye = g.player.eyePos();
      const dist = pos.distanceTo(eye);
      const dir = finite3(d.d);
      if (dist < 12 && dir && g.physics.lineOfSight(pos, eye)) {
        const toMe = eye.clone().sub(pos).normalize();
        const aimed = toMe.dot(new THREE.Vector3().fromArray(dir));
        const facing = pos.clone().sub(eye).normalize().dot(g.player.forward());
        if (aimed > 0.6 && facing > 0.3) g.engine.flash(0xffffff, 0.75 * (1 - dist / 12));
      }
    } else if (d.t === 'whisper') {
      g.audio?.at(this.snd('eerie', 'mimic_voice_2'), pos, 0.55, { refDistance: 1.5, maxDistance: 16, pitch: 0.75 });
    }
  }

  // ------------------------------------------------------------------ host handlers ('itool' request)
  hostHandle(d, from) {
    const g = this.game, items = this.mgr;
    if (!d || typeof d !== 'object') return;
    const posOf = (id) => (id === g.selfId ? g.player.pos : g.remotes.get(id)?.pos);
    const pp = posOf(from);
    if (d.op === 'ladder') {
      const it = items.get(d.id);
      if (!it || it.type !== 'ladder' || it.holder !== from) return;
      const ld = sanitizeLadder(d.ld);
      if (!ld) return;
      if (pp && Math.hypot(pp.x - ld.b[0], pp.z - ld.b[2]) > 4) return;
      it.lastHolder = from;
      g.net.broadcast('it', { e: 'ladder', id: it.id, ld });
    }
  }

  onClear() {
    for (const L of this.glowLights.values()) this.game.lights?.remove(L);
    this.glowLights.clear();
    const c = this.cache;
    c.boosters.length = 0; c.glows.length = 0; c.hots.length = 0; c.ladders.length = 0;
    if (this.climb) { this.climb = null; if (this.game.player) this.game.player.frozen = false; }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs) off?.();
    this.offs.length = 0;
    for (const r of this.rings) { r.m.removeFromParent(); r.mat.dispose(); }
    this.rings.length = 0;
    this.ringGeo?.dispose(); this.ringGeo = null;
    this.onClear();
    const fx = this.game.engine?.fx;
    if (fx) { if (this.warpOn) fx.warp = 0; if (this.noiseOn) fx.noise = 0; }
    this.warpOn = false; this.noiseOn = false;
  }
}
