// TECH DEPLOYABLES (wave 2, module 'siege'): craftable / buyable kits the crew sets up around the ship (or anywhere).
//   Auto-Turret MK1-3, Tesla Coil, Barricade wood / metal, Spike Strip, Proximity Mine, Floodlight Tower, Repair Drone,
//   Motion Sensor, Shield Dome, Portable Generator, Battery Bank.
// Placement: hold the kit -> translucent ghost (green / red), R rotates, LMB places (the host validates: slope, overlap,
// walls, ship / door path, caps), E on a placed one = feed (ammo / fuel / battery) or repair (scrap metal) or pack up.
// Tier (`it.tier` of the kit) multiplies HP / damage / battery (TIERS[tier].statMul). Host authoritative: requests
// 'sgplace' / 'sgact'; host broadcasts 'sgd' {add|rm|all} and delta rows 'sgs'. Everything is removed on takeoff / dispose.
// Power: a Generator (fuel) powers everything within its radius, a Battery Bank buffers it, otherwise each powered
// deployable runs on its own cell. No wires. Barricades / solid kits block nav: the outdoor flow field (siege.js) and
// the facility NavGrid (blockBox with restore).
import * as THREE from 'three';
import { G } from '../physics/physics.js';
import { boxOccupied } from '../world/doorsafe.js';
import { FACILITY_Y } from '../world/facility.js';
import { registerItem, ITEMS } from './items.js';
import { TIERS } from './tiers.js';
import { RECIPES, BLUEPRINTS, CATS } from './recipes.js';
import { STRANGE, STRANGE_IDS } from './research.js';
import { MOONS } from './moons.js';
import { addTranslations, t, tf } from '../core/i18n.js';
import { clamp, angleDiff } from '../core/util.js';
import { ammoMul, drawMul } from './difficulty.js';
import { HULL, DOOR, distToHull, inBox } from './siege_core.js';
import { applyToDeps, pickTarget, chainTargets, shotDamage } from './defense_core.js';   // [unify] one defence table + targeting helper
import { createDeployableModel, createKitModel, createGhost, createRelicModel, staticGeometry, staticMaterial, STATIC_TYPES } from '../models/deployables.js';

// ---------------------------------------------------------------------------------------------- definitions
// hx / hz: half extents of the footprint (oriented by yaw), h: height, r: circle used for overlap checks, cost: flow-field crossing cost
export const DEPS = {
  turret1: { name: 'Auto-Turret MK1', kind: 'turret', cap: 120, ammo: true, supply: ['comp_scrapmetal', 30], price: 180, weight: 8, blurb: 'Ammo-fed sentry (scrap metal reloads it). Nearest target first.' },
  turret2: { name: 'Auto-Turret MK2', kind: 'turret', cap: 100, supply: ['comp_battery', 40], weight: 9, blurb: 'Battery / generator sentry. Faster, tougher, longer range.' },
  turret3: { name: 'Auto-Turret MK3', kind: 'turret', cap: 160, supply: ['comp_battery', 40], weight: 11, blurb: 'Triple-barrel heavy sentry. Needs power.' },
  tesla: { name: 'Tesla Coil', kind: 'tesla', cap: 100, supply: ['comp_battery', 40], weight: 10, blurb: 'Chain lightning through up to 3 creatures. Needs power.' },
  barr_wood: { name: 'Wood Barricade', kind: 'barricade', price: 40, weight: 10, blurb: 'Blocks the way. Creatures chew through it.' },
  barr_metal: { name: 'Metal Barricade', kind: 'barricade', price: 95, weight: 18, blurb: 'Heavy steel plate. Holds a lot longer.' },
  spikes: { name: 'Spike Strip', kind: 'spikes', price: 55, weight: 6, blurb: 'Slows (-50%) and cuts creatures that cross it. Wears out.' },
  mine: { name: 'Proximity Mine', kind: 'mine', price: 70, weight: 3, blurb: 'Arms after 3 s, blasts creatures (never crew) within 4 m.' },
  flood: { name: 'Floodlight Tower', kind: 'flood', cap: 200, supply: ['comp_battery', 40], price: 160, weight: 10, blurb: 'Lights up 22 m, reveals and repels dark-loving creatures.' },
  drone: { name: 'Repair Drone', kind: 'drone', cap: 120, supply: ['comp_battery', 40], weight: 4, blurb: 'Repairs deployables, the ship hull and the door.' },
  sensor: { name: 'Motion Sensor', kind: 'sensor', cap: 60, supply: ['comp_battery', 40], price: 120, weight: 3, blurb: 'Pings creatures within 40 m on your HUD.' },
  shield: { name: 'Shield Dome', kind: 'shield', cap: 150, supply: ['comp_battery', 40], weight: 9, blurb: 'Absorbs 350 damage in a 5.5 m dome, then recharges.' },
  gen: { name: 'Portable Generator', kind: 'gen', cap: 100, supply: ['comp_fuel', 50], price: 220, weight: 14, blurb: 'Burns fuel, powers everything within 14 m. No wires.' },
  bank: { name: 'Battery Bank', kind: 'bank', cap: 500, supply: ['comp_battery', 60], price: 200, weight: 12, blurb: 'Stores 500 units; a generator nearby charges it.' },
};
applyToDeps(DEPS);   // [unify] combat + footprint stats come from defense_core.js (price / weight / supply / cap / ammo stay here)
export const DEP_TYPES = Object.keys(DEPS);
const CAPS = { turret: 8, tesla: 4, barricade: 24, spikes: 8, mine: 12, flood: 4, drone: 3, sensor: 4, shield: 2, gen: 3, bank: 3 };
const TOTAL_CAP = 48;
const DARK = new Set(['screamer', 'lurker', 'stalker', 'spider', 'leech']);
const REACH = 6.5, PLACE_RANGE = 8.5;
/** upward component of a ray-hit normal (terrain trimesh winding may flip it, so its sign is ignored) */
const upN = (hit) => { const y = hit?.normal?.y ?? 1; return hit?.info?.kind === 'terrain' ? Math.abs(y) : y; };

// ---------------------------------------------------------------------------------------------- content (items / recipes / blueprints / strange finds)
const kitId = (ty) => 'dep_' + ty;
export const kitTypeOf = (itemType) => (typeof itemType === 'string' && itemType.startsWith('dep_') ? itemType.slice(4) : null);
for (const [ty, d] of Object.entries(DEPS)) {
  if (ITEMS[kitId(ty)]) continue;
  const o = { id: kitId(ty), name: d.name, kind: 'tool', weight: d.weight, hands: 1, deploy: ty, tip: `${d.blurb} Hold it: LMB places, R rotates.` };
  if (d.price) { o.price = d.price; o.shop = 'tech'; o.blurb = d.blurb; o.tier = 'common'; }
  registerItem(o);
}
const TECH_TR = {};
for (const d of Object.values(DEPS)) TECH_TR[d.name] = d.name;   // (names stay English in TR: game terms)

BLUEPRINTS.bp_siege_turret = { name: 'Turret Schematics', desc: 'Auto-Turret MK2 and MK3.', from: 'Turret Firmware Log / SIEGE flawless', icon: '🔫' };
BLUEPRINTS.bp_siege_tesla = { name: 'Tesla Schematics', desc: 'The Tesla Coil.', from: 'Resonator Coil / SIEGE flawless', icon: '⚡' };
BLUEPRINTS.bp_siege_drone = { name: 'Drone Schematics', desc: 'The Repair Drone.', from: 'Drone Chip / SIEGE flawless', icon: '🛠' };
BLUEPRINTS.bp_siege_shield = { name: 'Shield Schematics', desc: 'The Shield Dome.', from: 'Dome Prism / SIEGE flawless', icon: '🛡' };
export const SIEGE_BLUEPRINTS = ['bp_siege_turret', 'bp_siege_tesla', 'bp_siege_drone', 'bp_siege_shield'];
if (!CATS.includes('tech')) CATS.push('tech');

const TB = ['common', 'rare'], TG = ['common', 'epic'], TA = ['uncommon', 'epic'];
const R = (id, ty, inn, n, tier, time, bp, desc) => { if (!RECIPES.some((r) => r.id === id)) RECIPES.push({ id, name: DEPS[ty].name, cat: 'tech', out: kitId(ty), n, in: inn, tier, time, bp: bp || undefined, desc }); };
R('dep_turret1', 'turret1', [['comp_scrapmetal', 4], ['comp_circuit', 1], ['comp_cable', 1]], 1, TB, 2.6, null, 'A sentry gun. Ammo: scrap metal.');
R('dep_turret2', 'turret2', [['comp_scrapmetal', 4], ['comp_circuit', 2], ['comp_sensor', 1], ['comp_battery', 1]], 1, TG, 3, 'bp_siege_turret', 'MK2: battery powered, faster, tougher.');
R('dep_turret3', 'turret3', [['comp_scrapmetal', 6], ['comp_circuit', 3], ['comp_sensor', 2], ['comp_battery', 2], ['comp_crystal', 1]], 1, TA, 3.6, 'bp_siege_turret', 'MK3: triple barrel heavy sentry.');
R('dep_tesla', 'tesla', [['comp_circuit', 2], ['comp_cable', 4], ['comp_battery', 2], ['comp_crystal', 1]], 1, TA, 3.4, 'bp_siege_tesla', 'Chain lightning coil.');
R('dep_barr_wood', 'barr_wood', [['comp_wood', 4], ['comp_scrapmetal', 1]], 2, null, 1.6, null, 'Two wooden barricades.');
R('dep_barr_metal', 'barr_metal', [['comp_scrapmetal', 6], ['comp_wood', 1]], 1, TB, 2.2, null, 'A heavy steel barricade.');
R('dep_spikes', 'spikes', [['comp_scrapmetal', 3], ['comp_cable', 1]], 2, null, 1.6, null, 'Two spike strips.');
R('dep_mine', 'mine', [['comp_circuit', 1], ['comp_chem', 1], ['comp_scrapmetal', 1], ['comp_battery', 1]], 2, TB, 1.8, null, 'Two proximity mines.');
R('dep_flood', 'flood', [['comp_battery', 2], ['comp_circuit', 1], ['comp_scrapmetal', 4], ['comp_cable', 2]], 1, TB, 2.6, null, 'A 4 m floodlight tower.');
R('dep_drone', 'drone', [['comp_circuit', 2], ['comp_sensor', 1], ['comp_scrapmetal', 2], ['comp_battery', 1], ['comp_cable', 2]], 1, TG, 3, 'bp_siege_drone', 'Repairs turrets, barricades, hull and door.');
R('dep_sensor', 'sensor', [['comp_sensor', 2], ['comp_circuit', 1], ['comp_battery', 1]], 1, TB, 2, null, 'Pings creatures on your HUD.');
R('dep_shield', 'shield', [['comp_crystal', 2], ['comp_circuit', 3], ['comp_coolant', 2], ['comp_battery', 2], ['comp_sensor', 1]], 1, TA, 3.6, 'bp_siege_shield', 'An energy dome that soaks damage.');
R('dep_gen', 'gen', [['comp_scrapmetal', 5], ['comp_fuel', 2], ['comp_cable', 2], ['comp_fuse', 1]], 1, TB, 3, null, 'Powers deployables in 14 m.');
R('dep_bank', 'bank', [['comp_battery', 4], ['comp_cable', 2], ['comp_scrapmetal', 2], ['comp_circuit', 1]], 1, TB, 2.6, null, 'Stores 500 power units.');

const STR = (id, name, bp, lore, tint) => {
  if (STRANGE[id]) return;
  STRANGE[id] = { def: { id, name, kind: 'scrap', weight: 2, hands: 1, value: [10, 24], strange: true, tier: 'epic', tip: `Sells for pennies. ANALYZE it at the workbench (unlocks: ${BLUEPRINTS[bp].name}).`, relic: tint }, xp: 200, bp, weight: 1.6, lore };
  if (!ITEMS[id]) registerItem(STRANGE[id].def);
  if (!STRANGE_IDS.includes(id)) STRANGE_IDS.push(id);
};
STR('strange_turretlog', 'Turret Firmware Log', 'bp_siege_turret', 'A perfect kill log. 0 witnesses. 0 hesitations. 0 rules of engagement.', 0xff5a3a);
STR('strange_coilcore', 'Resonator Coil', 'bp_siege_tesla', 'It hums at exactly the frequency of your fillings.', 0x50d8ff);
STR('strange_dronechip', 'Drone Chip', 'bp_siege_drone', 'A maintenance drone that never filed a ticket. Ever. It just fixed things.', 0x40e070);
STR('strange_domeprism', 'Dome Prism', 'bp_siege_shield', 'Everything you throw at it comes back as light.', 0xb35cff);

addTranslations({
  ...TECH_TR,
  tech: 'TEKNOLOJİ', Tech: 'Teknoloji', 'Turret Schematics': 'Taret Şemaları', 'Tesla Schematics': 'Tesla Şemaları', 'Drone Schematics': 'Drone Şemaları', 'Shield Schematics': 'Kalkan Şemaları',
  'Auto-Turret MK2 and MK3.': 'Otomatik Taret MK2 ve MK3.', 'The Tesla Coil.': 'Tesla Bobini.', 'The Repair Drone.': 'Tamir Dronu.', 'The Shield Dome.': 'Kalkan Kubbesi.',
  'Turret Firmware Log': 'Taret Yazılım Günlüğü', 'Resonator Coil': 'Rezonatör Bobini', 'Drone Chip': 'Dron Çipi', 'Dome Prism': 'Kubbe Prizması',
  'Place {n} [LMB]': '{n} yerleştir [LMB]', 'R rotate': 'R döndür', 'Too far': 'Çok uzak', 'Too steep or uneven': 'Zemin eğimli veya düzensiz', 'Blocked by something': 'Bir şeyin içine giriyor',
  'Too close to another deployable': 'Başka bir kuruluma çok yakın', 'Too close to the ship': 'Gemiye çok yakın', 'Keep the ship door clear': 'Gemi kapısının önünü açık bırak', 'Nothing to place on': 'Yerleştirilecek zemin yok',
  'Someone is in the way': 'Yolda biri var', 'Limit reached for this type': 'Bu türün sınırına ulaşıldı', 'Only on a moon': 'Sadece bir ayda', 'Pack up {n} [E]': '{n} topla [E]', 'Repair {n} [E]': '{n} tamir et [E]',
  'Reload {n} [E]': '{n} doldur [E]', 'Refuel {n} [E]': '{n} yakıt doldur [E]', 'Recharge {n} [E]': '{n} şarj et [E]', 'Scrap Metal x1': 'Hurda Metal x1', 'Fuel Canister x1': 'Yakıt Bidonu x1', 'Battery Cell x1': 'Pil x1',
  'destroyed': 'yok edildi', 'OFFLINE': 'KAPALI', 'AMMO': 'MERMİ', 'FUEL': 'YAKIT', 'CHARGE': 'ŞARJ', 'contacts': 'temas', 'nearest': 'en yakın', 'MOTION': 'HAREKET',
});

// ---------------------------------------------------------------------------------------------- nav blocking (facility interior) with restore
const navRefs = new WeakMap();   // nav -> { ref: Map idx -> count, owned: Set idx }
function navCells(nav, b) {
  const out = [], R = Math.hypot(b.hx, b.hz) + 0.4;
  const [g0, z0] = nav.toGrid(b.x - R, b.z - R), [g1, z1] = nav.toGrid(b.x + R, b.z + R);
  for (let gz = Math.max(0, z0); gz <= Math.min(nav.h - 1, z1); gz++) for (let gx = Math.max(0, g0); gx <= Math.min(nav.w - 1, g1); gx++) {
    const c = nav.toWorld(gx, gz);
    if (inBox(c.x, c.z, b, 0.35)) out.push(gz * nav.w + gx);
  }
  return out;
}
function navBlock(nav, b) {
  let s = navRefs.get(nav); if (!s) navRefs.set(nav, s = { ref: new Map(), owned: new Set() });
  const cells = navCells(nav, b);
  for (const i of cells) {
    const n = s.ref.get(i) || 0;
    if (n === 0 && nav.walk[i] === 1) { nav.walk[i] = 0; s.owned.add(i); }
    s.ref.set(i, n + 1);
  }
  return cells;
}
function navRestore(nav, cells) {
  const s = navRefs.get(nav);
  if (!s || !cells) return;
  for (const i of cells) {
    const n = (s.ref.get(i) || 1) - 1;
    if (n <= 0) { s.ref.delete(i); if (s.owned.delete(i)) nav.walk[i] = 1; } else s.ref.set(i, n);
  }
}

// ---------------------------------------------------------------------------------------------- instanced pools (barricades, spikes, mines: one draw call per type)
class InstPool {
  constructor(scene, type, cap = 48) {
    this.type = type;
    this.mesh = new THREE.InstancedMesh(staticGeometry(type), staticMaterial, cap);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.list = [];
    scene.add(this.mesh);
  }
  add(dep, pos, yaw) {
    const i = this.list.length;
    if (i >= this.mesh.instanceMatrix.count) return -1;
    this.list.push(dep);
    this.place(dep, i, pos, yaw);
    this.mesh.count = this.list.length;
    return i;
  }
  place(dep, i, pos, yaw) {
    const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    this.mesh.setMatrixAt(i, m); this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.setColorAt(i, new THREE.Color(1, 1, 1)); if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  tint(dep, f) {
    const i = this.list.indexOf(dep); if (i < 0) return;
    const k = 0.45 + 0.55 * clamp(f, 0, 1);
    this.mesh.setColorAt(i, new THREE.Color(k, k * (0.85 + 0.15 * f), k * (0.8 + 0.2 * f)));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  remove(dep) {
    const i = this.list.indexOf(dep); if (i < 0) return;
    const last = this.list.length - 1;
    if (i !== last) {
      const m = new THREE.Matrix4(); this.mesh.getMatrixAt(last, m); this.mesh.setMatrixAt(i, m);
      const c = new THREE.Color(); this.mesh.getColorAt?.(last, c); this.mesh.setColorAt(i, c);
      this.list[i] = this.list[last]; this.list[i]._inst = i;
    }
    this.list.pop();
    this.mesh.count = this.list.length;
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.dispose?.(); }
}

// ---------------------------------------------------------------------------------------------- one deployable (host + clients)
let _n = 1;
class Dep {
  constructor(d) {
    this.id = d.id; this.type = d.ty; this.def = DEPS[d.ty];
    this.tier = d.tr || null;
    this.mul = TIERS[this.tier]?.statMul || 1;
    this.owner = d.o || null;
    this.pos = new THREE.Vector3(d.x, d.y, d.z);
    this.yaw = d.yaw || 0;
    this.maxHp = Math.round(this.def.hp * this.mul);
    this.hp = d.hp ?? this.maxHp;
    this.cap = this.def.cap ? Math.round(this.def.cap * this.mul) : 0;
    this.poolMax = this.def.pool ? Math.round(this.def.pool * this.mul) : 0;
    this.res = d.res ?? (this.def.ammo ? this.cap : this.def.kind === 'gen' ? this.cap * 0.6 : this.cap * (this.def.kind === 'bank' ? 0.25 : 0.7));
    this.aux = d.aux ?? this.poolMax;
    this.aim = d.yaw || 0; this.viewAim = this.aim;
    this.on = this.def.kind === 'barricade' || this.def.kind === 'spikes' || this.def.kind === 'mine' ? true : this.res > 0;
    this.target = false; this.busy = false;
    this.shots = 0; this.shotsSeen = 0; this.tx = 0; this.ty = 0; this.tz = 0;
    this.cd = 0; this.retarget = Math.random() * 0.3; this.tgt = null; this.arm = this.def.arm || 0; this.hitT = 9; this.load = 0; this.healT = 0;
    this.dead = false; this.dirty = true;
    this.center = new THREE.Vector3(this.pos.x, this.pos.y + this.def.h * 0.5, this.pos.z);
    this.model = null; this.inst = -1; this.pool = null; this.collider = null; this.navCells = null; this.light = null; this.bar = null; this.t = Math.random() * 10; this.flashT = 0;
  }
  get box() { return { x: this.pos.x, z: this.pos.z, hx: this.def.hx, hz: this.def.hz, yaw: this.yaw }; }
  pack() { return { id: this.id, ty: this.type, tr: this.tier || undefined, o: this.owner, x: +this.pos.x.toFixed(2), y: +this.pos.y.toFixed(2), z: +this.pos.z.toFixed(2), yaw: +this.yaw.toFixed(3), hp: Math.round(this.hp), res: Math.round(this.res * 10) / 10, aux: Math.round(this.aux) }; }
  row() {
    return [this.id, Math.round(this.hp), Math.round(this.res * 10) / 10, +this.aim.toFixed(2), (this.on ? 1 : 0) | (this.target ? 2 : 0) | (this.busy ? 4 : 0), this.shots, +this.tx.toFixed(1), +this.ty.toFixed(1), +this.tz.toFixed(1), Math.round(this.aux)];
  }
  applyRow(r) {
    this.hp = r[1]; this.res = r[2]; this.aim = r[3]; const f = r[4]; this.on = !!(f & 1); this.target = !!(f & 2); this.busy = !!(f & 4);
    this.shots = r[5]; this.tx = r[6]; this.ty = r[7]; this.tz = r[8]; this.aux = r[9];
  }
}

// ---------------------------------------------------------------------------------------------- install
export function installDeployables(game, siege) {
  const mods = game.mods;
  const offs = [];
  const deps = new Map();            // id -> Dep
  const pools = new Map();           // static type -> InstPool
  const tracers = [];                // pooled tracer meshes
  const tracerLive = [];
  let disposed = false, boundNet = null;
  let rowT = 0, aiT = 0, adjT = 0, xpT = 0, sensorT = 0, lastPlaceT = 0, nextId = 1;
  const xpBank = new Map();
  const scene = game.scene;
  const UP = new THREE.Vector3(0, 1, 0);
  const host = () => !!game.isHost;
  const posOf = (id) => (id === game.selfId ? game.player.pos : game.remotes.get(id)?.pos);

  // item models (world items + icons)
  for (const ty of DEP_TYPES) { const id = kitId(ty); if (mods?.itemModels && !mods.itemModels.has(id)) mods.itemModels.set(id, () => createKitModel(ty)); }
  for (const [id, s] of Object.entries(STRANGE)) if (s.def?.relic && mods?.itemModels && !mods.itemModels.has(id)) mods.itemModels.set(id, () => createRelicModel(s.def.relic));

  // tracer pool
  const tGeo = new THREE.BoxGeometry(1, 1, 1);
  const tMat = new THREE.MeshBasicMaterial({ color: 0xffe890, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const aMat = new THREE.MeshBasicMaterial({ color: 0x9ae8ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  function beam(a, b, mat, w, life) {
    let m = tracers.pop();
    if (!m) { m = new THREE.Mesh(tGeo, mat); m.frustumCulled = false; scene.add(m); }
    m.material = mat;
    const len = a.distanceTo(b) || 0.01;
    m.position.copy(a).lerp(b, 0.5); m.lookAt(b); m.scale.set(w, w, len); m.visible = true;
    tracerLive.push({ m, life });
  }
  function updateBeams(dt) {
    for (let i = tracerLive.length - 1; i >= 0; i--) {
      const b = tracerLive[i]; b.life -= dt;
      if (b.life <= 0) { b.m.visible = false; tracers.push(b.m); tracerLive.splice(i, 1); }
    }
  }

  // ------------------------------------------------------------------------------------------ views
  function poolFor(type) { let p = pools.get(type); if (!p) pools.set(type, p = new InstPool(scene, type)); return p; }
  function mount(d) {
    const def = d.def;
    if (STATIC_TYPES.includes(d.type)) {
      d.pool = poolFor(d.type);
      d.inst = d.pool.add(d, d.pos, d.yaw);
      if (d.inst >= 0) d.pool.tint(d, d.hp / d.maxHp);
    } else {
      d.model = createDeployableModel(d.type, { radius: def.range });
      d.model.root.position.copy(d.pos); d.model.root.rotation.y = d.type.startsWith('turret') ? 0 : d.yaw;
      scene.add(d.model.root);
      if (d.type === 'flood') d.light = game.lights?.add({ pos: new THREE.Vector3(d.pos.x, d.pos.y + 3.7, d.pos.z), color: 0xfff0d0, intensity: 3.4, distance: 26, group: 'sg', enabled: d.on });
    }
    if (def.solid && game.physics) {
      const hy = Math.max(0.3, def.h / 2);
      d.collider = game.physics.addStaticBox(d.pos.x, d.pos.y + hy, d.pos.z, def.hx, hy, def.hz, d.yaw, G.STATIC, { kind: 'dep', depId: d.id });
    }
    if (def.cost && d.pos.y < FACILITY_Y + 40 && game.world?.facility?.nav) d.navCells = navBlock(game.world.facility.nav, d.box), d.navRef = game.world.facility.nav;
  }
  function unmount(d) {
    if (d.pool) { d.pool.remove(d); d.pool = null; }
    if (d.model) { d.model.root.removeFromParent(); d.model.dispose?.(); d.model = null; }
    if (d.light) { game.lights?.remove(d.light); d.light = null; }
    if (d.collider) { game.physics?.removeCollider(d.collider); d.collider = null; }
    if (d.navCells && d.navRef) { navRestore(d.navRef, d.navCells); d.navCells = null; }
    if (d.bar) { for (const m of d.bar) { m.removeFromParent(); m.material.dispose(); } d.bar = null; }
  }
  const barGeo = new THREE.PlaneGeometry(1, 0.1);
  function updateBar(d) {
    const f = clamp(d.hp / d.maxHp, 0, 1);
    const need = f < 0.995 && game.camera.position.distanceToSquared(d.pos) < 900;
    if (!need) { if (d.bar) for (const m of d.bar) m.visible = false; return; }
    if (!d.bar) {
      const bg = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x160a0a, depthTest: false, transparent: true, opacity: 0.8 }));
      const fg = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x40e070, depthTest: false }));
      bg.renderOrder = 8; fg.renderOrder = 9; bg.frustumCulled = fg.frustumCulled = false;
      scene.add(bg, fg); d.bar = [bg, fg];
    }
    const [bg, fg] = d.bar; bg.visible = fg.visible = true;
    const w = Math.max(0.9, d.def.hx * 1.6), y = d.pos.y + d.def.h + 0.35;
    bg.position.set(d.pos.x, y, d.pos.z); bg.scale.set(w, 1, 1); bg.quaternion.copy(game.camera.quaternion);
    fg.scale.set(w * f, 0.75, 1); fg.quaternion.copy(game.camera.quaternion);
    fg.position.set(d.pos.x, y, d.pos.z).addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(game.camera.quaternion), -(w * (1 - f)) / 2);
    fg.material.color.setHex(f > 0.55 ? 0x40e070 : f > 0.25 ? 0xffb040 : 0xff3a2a);
  }
  const _mz = new THREE.Vector3(), _tt = new THREE.Vector3();
  function viewUpdate(d, dt) {
    d.t += dt;
    if (d.pool) { if (d.hp !== d._hpSeen) { d._hpSeen = d.hp; if (d.inst >= 0) d.pool.tint(d, d.hp / d.maxHp); } updateBar(d); return; }
    const m = d.model; if (!m) return;
    d.viewAim += angleDiff(d.viewAim, d.aim) * Math.min(1, dt * 14);
    m.update(dt, { aim: d.viewAim, on: d.on, target: d.target, t: d.t, pool: d.aux, poolMax: d.poolMax, charge: d.cap ? d.res / d.cap : 1, busy: d.busy });
    if (d.light) d.light.enabled = d.on;
    if (d.shots > d.shotsSeen) {
      const n = Math.min(3, d.shots - d.shotsSeen); d.shotsSeen = d.shots;
      if (m.fire) m.fire();
      if (d.def.kind === 'turret' && d.target) {
        _mz.copy(m.muzzle || d.center).applyAxisAngle(UP, d.viewAim).add(d.pos);
        _tt.set(d.tx, d.ty, d.tz);
        for (let i = 0; i < n; i++) beam(_mz, _tt.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3)), tMat, 0.05, 0.07);
        if (game.time - (d._sndT || 0) > 0.16) { d._sndT = game.time; game.audio?.play('turret_fire', { pos: d.center, volume: 0.35, pitch: 1.5 + Math.random() * 0.3, refDistance: 6, maxDistance: 60, occlude: true }); }
      }
    }
    updateBar(d);
  }
  function viewsUpdate(dt) { for (const d of deps.values()) viewUpdate(d, dt); updateBeams(dt); }

  // ------------------------------------------------------------------------------------------ add / remove (all peers)
  function addLocal(pd) {
    if (deps.has(pd.id) || !DEPS[pd.ty]) return null;
    const d = new Dep(pd);
    deps.set(d.id, d);
    try { mount(d); } catch (e) { console.warn('[deployables] mount', e); }
    siege?.onDepsChanged?.();
    mods?.emit('tfg:deployable', { e: 'add', id: d.id, type: d.type }, game);
    return d;
  }
  function removeLocal(id, why) {
    const d = deps.get(id); if (!d) return;
    d.dead = true;
    if (why === 'destroyed') { game.particles?.burst(d.center, 'sparks', null, 1.4); game.particles?.burst(d.center, 'death', null, 0.7); game.audio?.play('glass_break', { pos: d.center, volume: 0.7, refDistance: 6, maxDistance: 50 }); }
    unmount(d);
    deps.delete(id);
    siege?.onDepsChanged?.();
    mods?.emit('tfg:deployable', { e: 'rm', id, type: d.type, why }, game);
  }
  function clearAll() { for (const id of [...deps.keys()]) removeLocal(id, 'clear'); for (const p of pools.values()) p.dispose(); pools.clear(); }

  // ------------------------------------------------------------------------------------------ validation (client ghost + host)
  const staticHit = (x, y, z, hx, hh, hz) => boxOccupied(game.physics, x, y, z, hx, hh, hz, G.STATIC | G.DOOR);
  function validate(type, x, y, z, yaw, ctx = {}) {
    const def = DEPS[type];
    if (!def) return { ok: false, why: 'Blocked by something' };
    if (game.run?.phase !== 'moon') return { ok: false, why: 'Only on a moon' };
    if (ctx.from) { const pp = posOf(ctx.from); if (!pp || Math.hypot(pp.x - x, pp.z - z) > PLACE_RANGE + 1.5 || Math.abs(pp.y - y) > 4) return { ok: false, why: 'Too far' }; }
    // count caps
    let total = 0, same = 0;
    for (const d of deps.values()) { total++; const k = d.def.kind; if (k === def.kind) same++; }
    if (total >= TOTAL_CAP || same >= (CAPS[def.kind] || 8)) return { ok: false, why: 'Limit reached for this type' };
    // ship / door path (outdoors only)
    if (y > FACILITY_Y + 40) {
      if (distToHull(x, z) < 1.4) return { ok: false, why: 'Too close to the ship' };
      if (Math.abs(x - DOOR.x) < 2.6 && z > HULL.z1 - 1 && z < 11) return { ok: false, why: 'Keep the ship door clear' };
    }
    // overlap with other deployables (circles)
    for (const d of deps.values()) if (Math.hypot(d.pos.x - x, d.pos.z - z) < d.def.r + def.r - 0.15 && Math.abs(d.pos.y - y) < 2.5) return { ok: false, why: 'Too close to another deployable' };
    // inside walls / rocks: a box lifted 0.35 m off the floor must be free (sampled along the long side of long types)
    const hh = Math.max(0.22, Math.min(0.6, def.h / 2 - 0.2));
    const along = def.hx > def.hz * 1.6 ? [-0.65, 0, 0.65] : [0];
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    for (const a of along) {
      const px = x + a * def.hx * cs, pz = z - a * def.hx * sn;
      const half = along.length > 1 ? Math.max(0.3, def.hz + 0.1) : Math.max(0.25, def.r * 0.8);
      if (staticHit(px, y + 0.35 + hh, pz, half, hh, half)) return { ok: false, why: 'Blocked by something' };
    }
    if (def.solid && boxOccupied(game.physics, x, y + 0.9, z, def.r + 0.25, 0.9, def.r + 0.25, G.PLAYER | G.REMOTE)) return { ok: false, why: 'Someone is in the way' };
    return { ok: true, why: '' };
  }
  /** host: snap to the floor under (x, z) and check the slope */
  function groundAt(x, y, z) {
    const hit = game.physics.raycast({ x, y: y + 1.2, z }, { x: 0, y: -1, z: 0 }, 3.2, G.STATIC | G.DOOR);
    if (!hit) return null;
    if (upN(hit) < 0.72 || hit.info?.kind === 'dep') return { bad: true };
    return { y: hit.point.y };
  }

  // ------------------------------------------------------------------------------------------ host: place / act
  const holderItem = (from, type) => { for (const it of game.items.all()) if (it.holder === from && it.type === type && !it._sgUsed) return it; return null; };
  function consumeItem(it) { it._sgUsed = true; game.net.broadcast('it', { e: 'rm', id: it.id }); }
  function hostPlace(d, from) {
    if (!host() || !d) return;
    const it = game.items.get(String(d.id));
    const reply = (msg) => game.net.sendTo(from, 'sgd', { e: 'err', msg });
    if (!it || it.holder !== from || !it.def?.deploy || it._sgUsed) return;
    const type = it.def.deploy;
    let x = Number(d.x), y = Number(d.y), z = Number(d.z), yaw = Number(d.yaw) || 0;
    if (![x, y, z].every(Number.isFinite)) return;
    const gr = groundAt(x, y, z);
    if (!gr || gr.bad) return reply('Too steep or uneven');
    y = gr.y;
    const v = validate(type, x, y, z, yaw, { from });
    if (!v.ok) return reply(v.why);
    consumeItem(it);
    const dep = addLocal({ id: 'd' + (nextId++).toString(36), ty: type, tr: it.tier || null, o: from, x, y, z, yaw });
    if (!dep) return;
    game.net.broadcast('sgd', { e: 'add', d: dep.pack() }, false);
    game.net.broadcast('fx', { k: 'snd', s: 'lockpick_success', p: [x, y + 0.5, z], v: 0.7 });
  }
  function destroy(d, why = 'destroyed') {
    if (!host() || d.dead) return;
    game.net.broadcast('sgd', { e: 'rm', id: d.id, why }, false);
    removeLocal(d.id, why);
  }
  const supplyKind = (d) => (d.def.supply ? d.def.supply[0] : null);
  function hostAct(a, from) {
    if (!host() || !a) return;
    const d = deps.get(String(a.id)); if (!d || d.dead) return;
    const pp = posOf(from);
    if (!pp || pp.distanceTo(d.center) > REACH + d.def.h * 0.5) return;
    const spark = () => game.net.broadcast('fx', { k: 'snd', s: 'spark', p: [d.center.x, d.center.y, d.center.z], v: 0.6 });
    if (a.op === 'pack') {
      const frac = d.hp / d.maxHp;
      const at = new THREE.Vector3(pp.x, pp.y + 0.7, pp.z);
      if (frac >= 0.25) game.items.hostSpawn(kitId(d.type), at, { tier: d.tier || undefined, value: 0 });
      else for (let i = 0; i < 2; i++) game.items.hostSpawn('comp_scrapmetal', at.clone().add(new THREE.Vector3(i * 0.2, 0, 0)), {});
      destroy(d, 'pack');
    } else if (a.op === 'repair') {
      const s = holderItem(from, 'comp_scrapmetal'); if (!s || d.hp >= d.maxHp) return;
      consumeItem(s); d.hp = Math.min(d.maxHp, d.hp + d.maxHp * 0.35); spark();
    } else if (a.op === 'supply') {
      const kind = supplyKind(d); if (!kind || d.res >= d.cap - 1) return;
      const s = holderItem(from, kind); if (!s) return;
      consumeItem(s); d.res = Math.min(d.cap, d.res + d.def.supply[1]); d.on = d.res > 0; spark();
    }
  }

  // ------------------------------------------------------------------------------------------ host: simulation
  const gens = [], banks = [], shields = [];
  const creatureList = [];
  function refreshLists() {
    gens.length = 0; banks.length = 0; shields.length = 0; creatureList.length = 0;
    for (const d of deps.values()) { d.load = 0; if (d.def.kind === 'gen') gens.push(d); else if (d.def.kind === 'bank') banks.push(d); else if (d.def.kind === 'shield') shields.push(d); }
    for (const c of game.creatures.host.values()) if (!c.dead && c.def && !c.def.hazard && c.maxHp !== null && c.state !== 'hidden') creatureList.push(c);
  }
  function supplier(d, need) {
    for (const s of gens) if (s.res > 0.05 && s.pos.distanceTo(d.pos) <= s.def.range) return s;
    for (const s of banks) if (s.res >= need && s.pos.distanceTo(d.pos) <= s.def.range) return s;
    return null;
  }
  /** try to spend `amt` power units for d (grid first, then its own cell) */
  function draw(d, amt) {
    const s = supplier(d, amt);
    if (s) { if (s.def.kind === 'gen') s.load += amt; else s.res -= amt; return true; }
    if (d.cap && !d.def.ammo && d.res >= amt) { d.res -= amt; return true; }
    return false;
  }
  const canDraw = (d, amt) => !!supplier(d, amt) || (!!d.cap && !d.def.ammo && d.res >= amt);
  function creatureTargets(from, range, pred) {
    return pickTarget(creatureList, from, range, { dy: range * 0.6 + 3, pred });
  }
  function creditKill(d, c) {
    if (!c.dead || !d.owner) return;
    xpBank.set(d.owner, (xpBank.get(d.owner) || 0) + Math.max(1, Math.round((c.xp || 10) * 0.25)));
  }
  function hurtCreature(d, c, dmg) {
    game.creatures.damage(c.id, dmg, 'sgdep', {});
    creditKill(d, c);
  }
  function losClear(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz);
    if (L < 0.5) return true;
    const hit = game.physics.raycast(a, { x: dx / L, y: dy / L, z: dz / L }, L - 0.4, G.STATIC | G.DOOR);
    return !hit || hit.info?.kind === 'dep';
  }
  function simTurret(d, dt) {
    const def = d.def;
    d.cd -= dt; d.retarget -= dt;
    if (d.retarget <= 0) {
      d.retarget = 0.18 + Math.random() * 0.08;
      const from = { x: d.pos.x, y: d.pos.y + 1, z: d.pos.z };
      d.tgt = null;
      const best = pickTarget(creatureList, d.pos, def.range, { dy: 6, pred: (c) => losClear(from, { x: c.pos.x, y: c.pos.y + Math.min(c.def.height || 1, 2) * 0.55, z: c.pos.z }) });
      d.tgt = best ? best.id : null;
    }
    const c = d.tgt ? game.creatures.host.get(d.tgt) : null;
    if (!c || c.dead) { d.tgt = null; d.target = false; d.aim += dt * 0.35 * Math.sin(d.t * 0.3 + 1); return; }
    d.target = true;
    const want = Math.atan2(c.pos.x - d.pos.x, c.pos.z - d.pos.z), diff = angleDiff(d.aim, want);
    d.aim += clamp(diff, -def.turn * dt, def.turn * dt);
    const ay = c.pos.y + Math.min(c.def.height || 1, 2) * 0.55;
    d.tx = c.pos.x; d.ty = ay; d.tz = c.pos.z;
    const ready = Math.abs(angleDiff(d.aim, want)) < 0.14 && d.cd <= 0;
    if (!ready) return;
    if (def.ammo) { if (d.res < 1) { d.on = false; return; } d.res = Math.max(0, d.res - ammoMul()); d.on = true; }   // [hardmode] x1.5 / x2 ammo per shot from quota 3
    else { if (!draw(d, def.draw * drawMul())) { d.on = false; return; } d.on = true; }
    d.cd = 1 / def.rate; d.shots++;
    hurtCreature(d, c, shotDamage(def, d.mul));
  }
  function simTesla(d, dt) {
    d.cd -= dt;
    if (d.cd > 0) return;
    const c0 = creatureTargets(d.pos, d.def.range);
    if (!c0) { d.target = false; return; }
    if (!draw(d, d.def.draw)) { d.on = false; return; }
    d.on = true; d.target = true; d.cd = d.def.cd; d.shots++;
    const pts = [[d.pos.x, d.pos.y + 1.95, d.pos.z]];
    let dmg = d.def.dmg * d.mul;
    for (const cur of chainTargets(c0, creatureList, d.def.chain, 6, { dy: 6.6 })) {
      pts.push([cur.pos.x, cur.pos.y + Math.min(1.6, (cur.def.height || 1) * 0.6), cur.pos.z]);
      hurtCreature(d, cur, dmg);
      dmg *= d.def.fall;
    }
    game.net.broadcast('sgd', { e: 'zap', pts }, true);
  }
  function simMine(d, dt) {
    if (d.arm > 0) { d.arm -= dt; d.on = d.arm <= 0; return; }
    const c = creatureTargets(d.pos, d.def.trig, (x) => Math.abs(x.pos.y - d.pos.y) < 2.5);
    if (!c) return;
    for (const o of creatureList) {
      const dd = o.pos.distanceTo(d.pos);
      if (dd > d.def.blast) continue;
      hurtCreature(d, o, d.def.dmg * d.mul * (1 - 0.6 * dd / d.def.blast));
    }
    game.net.broadcast('sgd', { e: 'boom', p: [d.pos.x, d.pos.y + 0.2, d.pos.z], r: d.def.blast }, true);
    destroy(d, 'spent');
  }
  function simSpikes(d, dt) {
    let n = 0;
    for (const c of creatureList) {
      if (Math.abs(c.pos.y - d.pos.y) > 2 || !inBox(c.pos.x, c.pos.z, d.box, 0.15)) continue;
      n++;
      c.slowT = Math.max(c.slowT || 0, 0.5); c.slowMul = d.def.slow;
      hurtCreature(d, c, d.def.dps * d.mul * dt);
    }
    if (n) { d.hp -= 1.2 * n * dt; d.dirty = true; if (d.hp <= 0) destroy(d, 'destroyed'); }
  }
  function simFlood(d, dt) {
    d.on = draw(d, d.def.drawS * dt);
    if (!d.on) return;
    if (game.time - (d._rep || 0) < 0.5) return;
    d._rep = game.time;
    for (const c of creatureList) {
      if (!(DARK.has(c.type) || c.affix === 'shadowbanned')) continue;
      if (Math.hypot(c.pos.x - d.pos.x, c.pos.z - d.pos.z) > d.def.range || Math.abs(c.pos.y - d.pos.y) > 6) continue;
      c.scaredT = 1.4; c.scareFrom = { x: d.pos.x, z: d.pos.z }; c.target = null;
    }
  }
  function simDrone(d, dt) {
    d.on = draw(d, d.def.drawS * dt * (d.busy ? 1 : 0.2));
    if (!d.on) return;
    d.healT -= dt;
    if (d.healT > 0) return;
    d.healT = 0.5;
    let any = false;
    for (const o of deps.values()) {
      if (o === d || o.hp >= o.maxHp || o.pos.distanceTo(d.pos) > d.def.range) continue;
      o.hp = Math.min(o.maxHp, o.hp + d.def.heal * d.mul * 0.5); any = true;
    }
    if (siege && d.pos.y > FACILITY_Y + 40 && distToHull(d.pos.x, d.pos.z) < d.def.range + 4) any = siege.repairShip(d.def.hullHeal * d.mul * 0.5) || any;
    d.busy = any;
  }
  function simShield(d, dt) {
    d.hitT += dt;
    d.on = draw(d, d.def.drawS * dt) && (d.aux > 0 || d.res > 0);
    if (d.on && d.hitT > 4 && d.aux < d.poolMax) { if (draw(d, 1.5 * dt)) d.aux = Math.min(d.poolMax, d.aux + d.def.regen * d.mul * dt); }
    else if (!d.on && d.aux <= 0 && d.hitT > 6) d.aux = Math.min(d.poolMax, d.aux + 3 * dt);
  }
  function simGen(d, dt) {
    const burn = (d.def.burn + d.load * 0.02) * dt;
    d.res = Math.max(0, d.res - burn);
    d.on = d.res > 0;
  }
  function simBank(d, dt) {
    for (const g of gens) if (g.res > 0 && g.pos.distanceTo(d.pos) <= g.def.range && d.res < d.cap) { d.res = Math.min(d.cap, d.res + 8 * dt); g.load += 8 * dt; }
    d.on = d.res > 0.5;
  }
  function simSensor(d, dt) { d.on = draw(d, d.def.drawS * dt); }
  /** damage a deployable (creatures). A shield dome covering it soaks the hit first. */
  function damage(id, amount) {
    const d = typeof id === 'string' ? deps.get(id) : id;
    if (!d || d.dead || !(amount > 0)) return 0;
    if (d.def.kind !== 'shield') amount = absorb(d.pos, amount);
    if (amount <= 0) return 0;
    d.hp -= amount; d.hitT = 0;
    if (d.hp <= 0) destroy(d, 'destroyed');
    return amount;
  }
  /** a shield dome within range eats the damage (hull / door hits use this too). Returns what is left. */
  function absorb(pos, amount) {
    for (const s of shields) {
      if (!s.on || s.aux <= 0 || s.pos.distanceTo(pos) > s.def.range) continue;
      const take = Math.min(s.aux, amount);
      s.aux -= take; s.hitT = 0; amount -= take;
      game.net.broadcast('sgd', { e: 'shield', id: s.id }, true);
      if (amount <= 0) break;
    }
    return amount;
  }
  function hostUpdate(dt) {
    refreshLists();
    for (const d of deps.values()) {
      if (d.dead) continue;
      switch (d.def.kind) {
        case 'turret': simTurret(d, dt); d.on = d.def.ammo ? d.res >= 1 : (d.res >= d.def.draw || !!supplier(d, d.def.draw)); break;
        case 'tesla': simTesla(d, dt); d.on = d.res >= d.def.draw || !!supplier(d, d.def.draw); break;
        case 'mine': simMine(d, dt); break;
        case 'spikes': simSpikes(d, dt); break;
        case 'flood': simFlood(d, dt); break;
        case 'drone': simDrone(d, dt); break;
        case 'shield': simShield(d, dt); break;
        case 'gen': simGen(d, dt); break;
        case 'bank': simBank(d, dt); break;
        case 'sensor': simSensor(d, dt); break;
        default: break;
      }
      // trickle-charge own cells from a generator in range
      if (d.cap && !d.def.ammo && d.def.kind !== 'gen' && d.def.kind !== 'bank' && d.res < d.cap) { for (const g of gens) if (g.res > 0 && g.pos.distanceTo(d.pos) <= g.def.range) { d.res = Math.min(d.cap, d.res + 4 * dt); g.load += 4 * dt; break; } }
      if (d.target && !d.tgt && d.def.kind === 'turret') d.target = false;
    }
    // creatures that reach a deployable chew on it (everything that is not a siege creature; those use damage() directly)
    adjT -= dt;
    if (adjT <= 0) {
      adjT = 0.5;
      for (const c of creatureList) {
        if (c.type.startsWith('sg_') || c.state === 'idle' || c.state === 'stunned' || c.state === 'dead') continue;
        for (const d of deps.values()) {
          if (Math.abs(d.pos.y - c.pos.y) > 2.5 || Math.hypot(d.pos.x - c.pos.x, d.pos.z - c.pos.z) > d.def.r + (c.def.radius || 0.5) + 0.5) continue;
          damage(d, Math.min(35, (c.dmg || 10) * 0.5));
          break;
        }
      }
    }
    // delta rows to clients + XP shares
    rowT -= dt;
    if (rowT <= 0 && deps.size) {
      rowT = 0.2;
      const rows = []; for (const d of deps.values()) rows.push(d.row());
      try { game.net.sendRows('sgs', rows, { eps: 0.05 }); } catch { /* net not ready */ }
    }
    xpT -= dt;
    if (xpT <= 0) { xpT = 5; for (const [o, xp] of xpBank) game.net.broadcast('xp', { to: o, xp, coin: 0, reason: 'Deployable kills', silentSmall: true }); xpBank.clear(); }
  }

  // ------------------------------------------------------------------------------------------ client: net
  const onSgd = (m, from) => {
    if (disposed || !m || (from !== game.selfId && from !== game.net?.hostId)) return;
    if (m.e === 'add') { if (!host()) addLocal(m.d); }
    else if (m.e === 'rm') { if (!host()) removeLocal(m.id, m.why); }
    else if (m.e === 'all') { if (!host()) for (const pd of m.list || []) addLocal(pd); }
    else if (m.e === 'zap') {
      const p = (m.pts || []).map((a) => new THREE.Vector3(a[0], a[1], a[2]));
      for (let i = 1; i < p.length; i++) {
        const a = p[i - 1], b = p[i], mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.7));
        beam(a, mid, aMat, 0.09, 0.16); beam(mid, b, aMat, 0.09, 0.16);
        game.particles?.burst(b, { count: 6, color: [0x70e0ff, 0xffffff], speed: 2, up: 1, life: 0.35, size: 0.05, gravity: 0, drag: 2, additive: true });
      }
      if (p[0]) game.audio?.play('taser_zap', { pos: p[0], volume: 0.8, refDistance: 7, maxDistance: 70, occlude: true });
    } else if (m.e === 'boom') {
      const p = new THREE.Vector3(m.p[0], m.p[1], m.p[2]);
      game.particles?.burst(p, { count: 34, color: [0xff9a3a, 0xffe090, 0x60381a], speed: 5, up: 3, life: 0.6, size: 0.1, gravity: 4, drag: 1.5 }, null, 1);
      game.audio?.play('explosion', { pos: p, volume: 0.9, refDistance: 8, maxDistance: 90, occlude: true });
      game.engine?.shake?.(Math.max(0, 0.35 - p.distanceTo(game.camera.position) / 30));
    } else if (m.e === 'shield') {
      deps.get(m.id)?.model?.fire?.();
    } else if (m.e === 'err') {
      game.ui?.toast(t(m.msg), 'bad');
    }
  };
  const onSgs = (rows, from) => {
    if (disposed || host() || !Array.isArray(rows) || from !== game.net?.hostId) return;
    for (const r of rows) { const d = deps.get(r[0]); if (d) d.applyRow(r); }
  };
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:sgd', onSgd); boundNet?.off?.('msg:sgs', onSgs);
    boundNet = net;
    net.on('msg:sgd', onSgd); net.on('msg:sgs', onSgs);
  }
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  offs.push(mods.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    H('sgplace', (d, from) => { try { hostPlace(d, from); } catch (e) { console.error('sgplace', e); } });
    H('sgact', (d, from) => { try { hostAct(d, from); } catch (e) { console.error('sgact', e); } });
  }));
  offs.push(mods.on('playerJoin', (id, info, g) => {
    if (g !== game || !host()) return;
    game.later(() => { if (deps.size) game.net.sendTo(id, 'sgd', { e: 'all', list: [...deps.values()].map((d) => d.pack()) }); }, 1800);
  }));

  // ------------------------------------------------------------------------------------------ client: placement ghost + prompts
  const ps = { type: null, ghost: null, rot: 0, ok: false, why: '', x: 0, y: 0, z: 0, yaw: 0, valid: false };
  const heldKit = () => { const it = game.player?.heldItem?.(); return it?.def?.deploy ? it : null; };
  function hideGhost() { if (ps.ghost) { ps.ghost.root.removeFromParent(); ps.ghost.dispose(); ps.ghost = null; ps.type = null; } siege?.hud?.setPlace(null); }
  function placementUpdate() {
    const p = game.player, it = heldKit();
    if (!it || !p || p.dead || game.minigame || game.terminal?.active || game.run?.phase !== 'moon') { if (ps.ghost) hideGhost(); return; }
    const type = it.def.deploy;
    if (ps.type !== type) { hideGhost(); ps.type = type; ps.rot = 0; ps.ghost = createGhost(type, { radius: DEPS[type].range }); ps.ghost.range(type === 'shield' ? DEPS[type].range : 0); scene.add(ps.ghost.root); }
    if (game.input?.enabled && game.input.codePressed('KeyR')) ps.rot += Math.PI / 8;
    const eye = game.camera.position, fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(game.camera.quaternion);
    const mask = G.STATIC | G.DOOR;
    let px = null, py = 0, pz = 0, steep = false;
    const hit = game.physics.raycast(eye, fwd, PLACE_RANGE, mask, p.col);
    if (hit) {
      px = hit.point.x; py = hit.point.y; pz = hit.point.z;
      if (upN(hit) < 0.5) {
        const ox = px + hit.normal.x * 0.7, oz = pz + hit.normal.z * 0.7;
        const dn = game.physics.raycast({ x: ox, y: py + 1, z: oz }, { x: 0, y: -1, z: 0 }, 3, mask);
        if (dn && upN(dn) >= 0.72) { px = ox; py = dn.point.y; pz = oz; } else steep = true;
      } else if (upN(hit) < 0.72) steep = true;
    } else {
      const fx = eye.x + fwd.x * 6.5, fz = eye.z + fwd.z * 6.5;
      const dn = game.physics.raycast({ x: fx, y: eye.y, z: fz }, { x: 0, y: -1, z: 0 }, 9, mask);
      if (dn && upN(dn) >= 0.72) { px = fx; py = dn.point.y; pz = fz; } else if (dn) { px = fx; py = dn.point.y; pz = fz; steep = true; }
    }
    if (px === null) { ps.ghost.root.visible = false; ps.valid = false; siege?.hud?.setPlace(`${t('Nothing to place on')}`, false); return; }
    ps.ghost.root.visible = true;
    const yaw = p.yaw + Math.PI + ps.rot;
    ps.ghost.root.position.set(px, py, pz);
    if (type.startsWith('turret')) { ps.ghost.model.head.rotation.y = yaw; ps.ghost.root.rotation.y = 0; } else ps.ghost.root.rotation.y = yaw;
    let v = steep ? { ok: false, why: 'Too steep or uneven' } : validate(type, px, py, pz, yaw, {});
    if (v.ok && Math.hypot(p.pos.x - px, p.pos.z - pz) < 0.9 && DEPS[type].solid) v = { ok: false, why: 'Too close to another deployable' };
    ps.ok = v.ok; ps.valid = v.ok; ps.x = px; ps.y = py; ps.z = pz; ps.yaw = yaw;
    ps.ghost.set(v.ok);
    siege?.hud?.setPlace(v.ok ? `${tf('Place {n} [LMB]', { n: t(DEPS[type].name) })}  ·  ${t('R rotate')}` : t(v.why), v.ok);
  }
  offs.push(mods.on('useItem', (it, hk, g) => {
    if (disposed || g !== game || hk.handled || !it?.def?.deploy) return;
    hk.handled = true;
    if (game.time - lastPlaceT < 0.4) return;
    lastPlaceT = game.time;
    if (!ps.ghost || !ps.valid) { game.ui?.toast(ps.ghost ? t('Blocked by something') : t('Only on a moon'), 'bad'); return; }
    game.net.request('sgplace', { id: it.id, x: ps.x, y: ps.y, z: ps.z, yaw: ps.yaw });
  }));

  const hasItem = (type) => {
    for (const id of game.player.slots || []) { const it = id && game.items.get(id); if (it?.type === type) return true; }
    try { if (Number(game.inventory?.countItem?.(type)) > 0) return true; } catch { /* soft */ }
    for (const it of game.items.all()) if (it.holder === game.selfId && it.type === type) return true;
    return false;
  };
  offs.push(mods.on('interactables', (list, g) => {
    if (disposed || g !== game || game.run?.phase !== 'moon') return;
    const p = game.player; if (!p || p.dead) return;
    for (const d of deps.values()) {
      if (d.def.kind === 'mine' || Math.abs(d.pos.y - p.pos.y) > 5 || Math.hypot(d.pos.x - p.pos.x, d.pos.z - p.pos.z) > 6) continue;
      const nm = t(d.def.name);
      const sk = supplyKind(d);
      let label, sub, op;
      if (sk && d.res < d.cap * 0.75 && hasItem(sk)) { op = 'supply'; label = tf(sk === 'comp_fuel' ? 'Refuel {n} [E]' : sk === 'comp_scrapmetal' ? 'Reload {n} [E]' : 'Recharge {n} [E]', { n: nm }); sub = t(sk === 'comp_fuel' ? 'Fuel Canister x1' : sk === 'comp_scrapmetal' ? 'Scrap Metal x1' : 'Battery Cell x1'); }
      else if (d.hp < d.maxHp * 0.98 && hasItem('comp_scrapmetal')) { op = 'repair'; label = tf('Repair {n} [E]', { n: nm }); sub = t('Scrap Metal x1'); }
      else { op = 'pack'; label = tf('Pack up {n} [E]', { n: nm }); sub = `${Math.round(d.hp)}/${d.maxHp} HP${d.cap && d.def.kind !== 'bank' ? ` · ${d.def.ammo ? t('AMMO') : d.def.kind === 'gen' ? t('FUEL') : t('CHARGE')} ${Math.round(d.res)}/${d.cap}` : ''}`; }
      list.push({ pos: d.center, r: Math.max(0.7, d.def.hx + 0.2), reach: 3.4, label, sub, action: () => game.net.request('sgact', { id: d.id, op }) });
    }
  }));

  // reveal dark creatures inside a lit floodlight radius (isLitByFlashlight is what the Screamer / shadow fade reads)
  const origLit = game.isLitByFlashlight;
  const litWrap = function (pos, range) {
    for (const d of deps.values()) if (d.type === 'flood' && d.on && Math.hypot(pos.x - d.pos.x, pos.z - d.pos.z) < d.def.range) return true;
    return origLit.call(this, pos, range);
  };
  if (typeof origLit === 'function') game.isLitByFlashlight = litWrap;

  // phase: everything is packed away by the takeoff (or a new landing)
  offs.push(mods.on('phase', (ph, g) => { if (g === game && ph !== 'moon') { clearAll(); hideGhost(); } }));
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    try { placementUpdate(); } catch (e) { console.warn('[deployables] ghost', e); }
    viewsUpdate(dt);
    if (host() && game.run?.phase === 'moon') { try { hostUpdate(dt); } catch (e) { console.error('[deployables] host', e); } }
    sensorT -= dt;
    if (sensorT <= 0) { sensorT = 0.5; try { sensorReadout(); } catch { /* cosmetic */ } }
  }));

  // motion sensors: contacts within any powered sensor's radius (and within 60 m of the local player) -> HUD text
  const sensorInfo = { n: 0, near: 0, dir: '' };
  const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  function sensorReadout() {
    const p = game.player;
    let n = 0, nearD = 1e9, nearC = null;
    const ss = [...deps.values()].filter((d) => d.type === 'sensor' && d.on);
    if (ss.length && p) {
      for (const v of game.creatures.views.values()) {
        if (v.state === 'dead' || v.hidden || v.def?.hazard) continue;
        if (!ss.some((s) => Math.hypot(v.pos.x - s.pos.x, v.pos.z - s.pos.z) <= s.def.range)) continue;
        n++;
        const dd = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
        if (dd < nearD) { nearD = dd; nearC = v; }
      }
    }
    sensorInfo.n = n; sensorInfo.near = Math.round(nearD); sensorInfo.has = ss.length > 0;
    if (nearC) { const a = Math.atan2(nearC.pos.x - p.pos.x, -(nearC.pos.z - p.pos.z)); sensorInfo.dir = COMPASS[(Math.round(a / (Math.PI / 4)) + 8) % 8]; }
    if (n > (sensorInfo.last || 0) && ss.length) game.audio?.play('scan_blip', { volume: 0.25, bus: 'sfx' });
    sensorInfo.last = n;
    siege?.hud?.setSensor(ss.length ? (n ? `${t('MOTION')}: ${n} ${t('contacts')} · ${t('nearest')} ${sensorInfo.near} m ${sensorInfo.dir}` : `${t('MOTION')}: 0 ${t('contacts')}`) : null);
  }

  return {
    deps, DEPS, validate,
    list: () => [...deps.values()],
    get: (id) => deps.get(id),
    damage, absorb, destroy: (id, why) => { const d = deps.get(id); if (d) destroy(d, why); },
    /** oriented boxes that slow / block creatures outdoors: [{ id, x, z, hx, hz, yaw, cost, type }] */
    blockers() {
      const out = [];
      for (const d of deps.values()) if (d.def.cost && d.pos.y > FACILITY_Y + 40) out.push({ id: d.id, type: d.type, kind: d.def.kind, x: d.pos.x, z: d.pos.z, hx: d.def.hx, hz: d.def.hz, yaw: d.yaw, cost: d.def.cost });
      return out;
    },
    /** nearest live deployable to (x, z) within maxD, optionally of the given kinds */
    nearest(x, z, maxD, kinds) {
      let best = null, bd = maxD;
      for (const d of deps.values()) {
        if (d.dead || (kinds && !kinds.includes(d.def.kind)) || d.pos.y < FACILITY_Y + 40) continue;
        const dd = Math.hypot(d.pos.x - x, d.pos.z - z) - Math.max(d.def.hx, d.def.hz) * 0.5;
        if (dd < bd) { bd = dd; best = d; }
      }
      return best;
    },
    sensor: sensorInfo,
    kitId, hasItem,
    /** debug / tests (host): place a deployable straight away (no kit, no validation beyond the ground snap) */
    debugPlace(type, x, z, yaw = 0, tier = null, y = null) {
      if (!host() || !DEPS[type]) return null;
      const gy = y ?? groundAt(x, 20, z)?.y ?? game.world?.terrain?.heightAt?.(x, z) ?? 0;
      const dep = addLocal({ id: 'd' + (nextId++).toString(36), ty: type, tr: tier, o: game.selfId, x, y: gy, z, yaw });
      if (dep) game.net.broadcast('sgd', { e: 'add', d: dep.pack() }, false);
      return dep;
    },
    clear: clearAll,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      boundNet?.off?.('msg:sgd', onSgd); boundNet?.off?.('msg:sgs', onSgs);
      hideGhost();
      clearAll();
      for (const m of tracers) m.removeFromParent();
      for (const b of tracerLive) b.m.removeFromParent();
      tGeo.dispose(); tMat.dispose(); aMat.dispose(); barGeo.dispose();
      if (Object.prototype.hasOwnProperty.call(game, 'isLitByFlashlight') && game.isLitByFlashlight === litWrap) delete game.isLitByFlashlight;
    },
  };
}

void MOONS;
