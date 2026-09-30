// Downloaded CC0 GLB models (public/assets/ext): preload a curated set at boot, PSX-ify their
// materials (Lambert + nearest filtering) and hand out clones synchronously during world building.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { getManifest } from '../audio/extassets.js';

const cache = new Map();   // id -> { scene, animations, size }
const matCache = new Map();

function psxMaterial(m) {
  if (!m) return m;
  if (matCache.has(m.uuid)) return matCache.get(m.uuid);
  const map = m.map || null;
  const em = m.emissiveMap || null;
  for (const t of [map, em]) {
    if (t) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 1; }
  }
  const out = new THREE.MeshLambertMaterial({
    map, color: m.color ? m.color.clone() : 0xffffff, transparent: !!m.transparent, opacity: m.opacity ?? 1,
    alphaTest: m.alphaTest || (map && m.transparent ? 0.4 : 0), side: m.side ?? THREE.FrontSide, vertexColors: !!m.vertexColors,
    emissive: m.emissive ? m.emissive.clone() : 0x000000, emissiveMap: em,
  });
  if (out.transparent && out.alphaTest > 0) out.transparent = false;
  matCache.set(m.uuid, out);
  return out;
}

export async function preloadExtModels(ids, onProgress) {
  const man = getManifest();
  if (!man?.models?.length) return;
  const loader = new GLTFLoader();
  const byId = new Map(man.models.map((m) => [m.id, m]));
  let done = 0;
  const list = ids.filter((id) => byId.has(id) && !cache.has(id));
  const queue = list.slice();
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      const entry = byId.get(id);
      try {
        const gltf = await loader.loadAsync(entry.path);
        const scene = gltf.scene;
        scene.traverse((o) => {
          if (o.isMesh) {
            o.material = Array.isArray(o.material) ? o.material.map(psxMaterial) : psxMaterial(o.material);
            o.castShadow = false; o.receiveShadow = false;
          }
        });
        const box = new THREE.Box3().setFromObject(scene);
        const size = new THREE.Vector3(); box.getSize(size);
        cache.set(id, { scene, animations: gltf.animations || [], size, min: box.min.clone(), max: box.max.clone(), entry });
      } catch (e) { console.warn('ext model failed', id, e.message); }
      done++;
      onProgress?.(done, list.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
}

export function hasExt(id) { return cache.has(id); }
export function extSize(id) { return cache.get(id)?.size || null; }

// Returns a fresh Object3D (skinned models are cloned with their skeleton).
export function extInstance(id, { scale = 1 } = {}) {
  const c = cache.get(id);
  if (!c) return null;
  const root = new THREE.Group();
  const inner = c.animations.length ? SkeletonUtils.clone(c.scene) : c.scene.clone(true);
  inner.scale.setScalar(scale);
  root.add(inner);
  root.userData.ext = id;
  root.userData.animations = c.animations;
  root.userData.inner = inner;
  // one AABB collider from the bounds (props)
  const s = c.size, mn = c.min, mx = c.max;
  root.userData.colliders = [{ c: [((mn.x + mx.x) / 2) * scale, ((mn.y + mx.y) / 2) * scale, ((mn.z + mx.z) / 2) * scale], s: [s.x * scale, s.y * scale, s.z * scale] }];
  return root;
}

// Animated instance wrapper with a creature-model-like API
export function extAnimated(id, stateClips, { scale = 1, tint = null } = {}) {
  const root = extInstance(id, { scale });
  if (!root) return null;
  const inner = root.userData.inner;
  const mixer = new THREE.AnimationMixer(inner);
  const clips = root.userData.animations;
  const byName = new Map(clips.map((c) => [c.name.toLowerCase(), c]));
  const actions = new Map();
  const find = (names) => { for (const n of names) { const c = byName.get(n.toLowerCase()) || clips.find((k) => k.name.toLowerCase().includes(n.toLowerCase())); if (c) return c; } return clips[0]; };
  let current = null, currentState = null;
  const materials = [];
  inner.traverse((o) => {
    if (!o.isMesh) return;
    o.material = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => { const k = m.clone(); if (tint) k.color.multiply(new THREE.Color(tint)); materials.push(k); return k; });
    if (o.material.length === 1) o.material = o.material[0];
    o.frustumCulled = false;
  });
  const play = (state) => {
    if (state === currentState) return;
    currentState = state;
    const names = stateClips[state] || stateClips.idle || ['idle'];
    const clip = find(names);
    if (!clip) return;
    let a = actions.get(clip);
    if (!a) { a = mixer.clipAction(clip); actions.set(clip, a); }
    const once = state === 'dead' || state === 'attack';
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    a.clampWhenFinished = once;
    if (current && current !== a) current.crossFadeTo(a, 0.2, false);
    a.play();
    current = a;
  };
  play('idle');
  const size = cache.get(id).size;
  return {
    root, parts: { head: root, eyes: [] }, height: size.y * scale, radius: Math.max(size.x, size.z) * scale * 0.4,
    update(dt, anim) {
      play(anim.state || 'idle');
      if (current) current.timeScale = anim.state === 'run' ? 1.4 : 1;
      mixer.update(dt);
    },
    setElite(v) { for (const m of materials) m.emissive?.set(v ? 0x440000 : 0x000000); },
    setHitFlash(v) { for (const m of materials) m.emissive?.setRGB(v * 0.8, 0, 0); },
    dispose() { mixer.stopAllAction(); },
  };
}

// curated preload list
export const EXT_PRELOAD = [
  'tfg_dockmaster18', // original first-entry actor/desk/facade, preloaded before session start
  // scrap
  'retro_clock', 'scrap_baseball_bat', 'scrap_briefcase', 'scrap_floppy', 'scrap_multimeter', 'scrap_keyring', 'scrap_padlock',
  'scrap_heater', 'scrap_wrench', 'kk_gold_bars', 'kk_silver_bar', 'kk_gold_nuggets', 'kk_copper_nugget', 'kk_jerrycan', 'ks_chest',
  'ks_tool_axe', 'ks_tool_pickaxe', 'retro_knife', 'retro_plate', 'psx_glass_bottle', 'ks_tool_hammer',
  // facility clutter
  'psx_trash_bag', 'psx_cardboard_box', 'ind_box_wood', 'ks_box', 'kst_container', 'psx_barrel', 'retro_bucket', 'kk_parts_pile_large',
  'psx_pipes', 'psx_turbine', 'ind_metal_cabinet_1', 'ind_metal_cabinet_2', 'psx_couch', 'psx_fridge', 'psx_mattress', 'kst_bed_single',
  'ks_workbench', 'psx_transformer', 'psx_pump', 'kcv_robot_arm_a', 'kcv_conveyor_long', 'psx_shelf', 'kst_computer_system', 'ind_ventilation_1',
  // mineshaft interior props (MINESHAFT_THEME in world/mineshaft.js; missing ones fall back to crates)
  'kk_stone_chunks', 'kk_log_stack', 'ks_barrel', 'ks_box_large', 'kk_iron_bars_stack', 'kk_fuel_barrels', 'kk_pallet', 'ks_bucket',
  // outdoor landmarks
  'barrier_jersey', 'barrier_jersey_broken', 'kk_containers_a', 'kk_containers_c', 'ind_cargo_1_open', 'ind_cooling_tower',
  'ind_liquid_reservoir_2', 'kk_solarpanel', 'bollard_concrete_light', 'psx_dumpster', 'kst_skip_rocks', 'kk_lights',
  // creatures
  // outposts (src/world/outposts.js OUTPOST_EXT_MODELS)
  'ks_campfire_pit', 'ks_tent_canvas', 'kk_lander_a', 'ks_tree_log',
  'mon_skeleton', 'mon_robot',
];

// ---------------------------------------------------------------------------------------------------------
// Round 2: models for the new interior themes (office / backrooms / serverfarm / sewer / hospital) and
// outdoor dressing. 'tfg_*' are custom props authored in Blender for TFG (tools/blender/tfg_props.py);
// kf_* = Kenney Furniture Kit, tb_* = Tiltamoose PSX boxes, car_* = GGBot PSX cars, hb_* = KayKit Halloween.
// Every id is in public/assets/ext/manifest.json (+Y up, metres, origin bottom-centre, front +Z).
export const EXT_SETS = Object.freeze({
  office: ['tfg_cubicle_desk', 'tfg_cubicle_wall', 'tfg_copier', 'tfg_crt_monitor', 'tfg_filing_boxes', 'tfg_keyboard', 'tfg_router',
    'kf_office_chair', 'kf_desk', 'kf_desk_corner', 'kf_computer_screen', 'kf_laptop', 'kf_computer_mouse', 'kf_bookcase_doors',
    'kf_coat_rack', 'kf_trashcan', 'kf_potted_plant', 'kf_plant_small', 'kf_coffee_machine', 'kf_microwave', 'kf_fridge_large',
    'kf_sofa', 'kf_lounge_chair', 'kf_coffee_table', 'kf_ceiling_fan', 'kf_floor_lamp', 'kf_side_drawers', 'kf_box_closed', 'kf_box_open',
    'kf_tv_vintage', 'kf_radio', 'kf_speaker'],
  backrooms: ['tfg_backrooms_pillar', 'tfg_troffer_light', 'tfg_stack_chair', 'tfg_almond_water', 'tfg_crt_monitor', 'tfg_cubicle_wall'],
  serverfarm: ['tfg_server_rack', 'tfg_server_rack_open', 'tfg_crac_unit', 'tfg_ups_cabinet', 'tfg_server_blade', 'tfg_crt_stack', 'tfg_router'],
  sewer: ['tfg_sewer_pipe', 'tfg_sewer_valve', 'tfg_sewer_outflow', 'tfg_sewer_grate', 'tfg_sewer_ladder'],
  hospital: ['tfg_hospital_bed', 'tfg_gurney', 'tfg_iv_stand', 'tfg_wheelchair', 'tfg_med_cabinet', 'tfg_heart_monitor',
    'tfg_privacy_curtain', 'kf_washer', 'kf_bathroom_sink', 'kf_toilet', 'kf_mirror', 'kf_bench_cushion'],
  storage: ['tb_box_large', 'tb_box_small', 'tb_box_wrapped', 'tb_box_ammo', 'tb_crate', 'tb_crate_b', 'tb_milk_crate', 'tb_locker', 'tb_container'],
  wrecks: ['car_sedan', 'car_sedan_snow', 'car_hatch', 'car_coupe', 'car_van', 'car_wagon', 'car_police', 'car_taxi', 'car_pickup', 'car_compact'],
  graveyard: ['hb_gravestone', 'hb_gravemarker_a', 'hb_gravemarker_b', 'hb_grave_a', 'hb_grave_destroyed', 'hb_coffin', 'hb_coffin_decorated',
    'hb_crypt', 'hb_arch_gate', 'hb_fence', 'hb_fence_broken', 'hb_fence_pillar', 'hb_lantern_standing', 'hb_post_lantern', 'hb_post_skull',
    'hb_shrine_candles', 'hb_bench', 'hb_pillar', 'hb_tree_dead_large', 'hb_tree_dead_medium', 'hb_skull', 'hb_skull_candle', 'hb_ribcage',
    'hb_bone', 'hb_candle_triple'],
});

// Extra decoration merged into the facility room styles (facility.js THEMES, which also holds the
// src/world/interiors styles): { theme: { roomType: { wall_|clutter|center: ['ext:id', ...] } } }.
// Same rules as facility.js EXT_ADD: the lists are static, so every peer rolls the same random sequence,
// and a model that failed to load falls back to a crate. 'center' entries are ALL placed (2.6 m apart),
// so they are only added to rooms whose centre is otherwise empty.
const X = (...ids) => ids.map((id) => 'ext:' + id);
export const EXT_THEME_PROPS = {
  office: {
    entrance: { wall_: X('kf_sofa', 'kf_potted_plant', 'kf_coat_rack'), clutter: X('kf_trashcan') },
    cubicles: { wall_: X('tfg_cubicle_wall', 'tfg_copier', 'kf_bookcase_doors'), clutter: X('tfg_filing_boxes', 'kf_office_chair', 'kf_trashcan', 'tb_box_small') },
    conference: { wall_: X('kf_potted_plant', 'kf_coat_rack', 'kf_speaker'), clutter: X('kf_office_chair') },
    manager: { wall_: X('kf_bookcase_doors', 'kf_floor_lamp', 'tfg_crt_stack'), clutter: X('kf_office_chair', 'kf_plant_small') },
    break_room: { wall_: X('kf_fridge_large', 'kf_lounge_chair'), clutter: X('kf_trashcan', 'tfg_stack_chair') },
    copy_room: { wall_: X('tfg_copier', 'tfg_filing_boxes'), clutter: X('tb_box_small', 'kf_box_open', 'tfg_filing_boxes') },
    server_closet: { wall_: X('tfg_server_rack', 'tfg_ups_cabinet'), clutter: X('tb_box_small') },
    storage: { wall_: X('tb_locker'), clutter: X('tb_box_large', 'tb_box_small', 'kf_box_closed', 'tfg_filing_boxes') },
    elevator_hub: { wall_: X('kf_sofa', 'kf_potted_plant'), clutter: X('kf_trashcan') },
    nest: { clutter: X('tfg_crt_monitor', 'kf_office_chair', 'tfg_filing_boxes') },
  },
  backrooms: {
    entrance: { clutter: X('tfg_stack_chair') },
    yellow_room: { center: X('tfg_backrooms_pillar'), clutter: X('tfg_stack_chair') },
    office_void: { wall_: X('tfg_cubicle_wall', 'tfg_cubicle_desk'), clutter: X('tfg_stack_chair', 'kf_office_chair', 'tfg_crt_monitor') },
    supply_room: { wall_: X('tb_locker'), clutter: X('tb_box_large', 'tb_box_small', 'kf_box_closed') },
    dark_zone: { center: X('tfg_backrooms_pillar'), clutter: X('tfg_stack_chair') },
    nest: { clutter: X('tfg_crt_monitor', 'tfg_stack_chair') },
  },
  serverfarm: {
    entrance: { wall_: X('kf_potted_plant', 'kf_sofa'), clutter: X('kf_trashcan') },
    rack_hall: { wall_: X('tfg_server_rack', 'tfg_server_rack_open', 'tfg_ups_cabinet'), clutter: X('tfg_server_blade', 'tb_box_small') },
    cooling_plant: { wall_: X('tfg_crac_unit') },
    noc: { wall_: X('tfg_server_rack', 'tfg_crt_stack'), clutter: X('kf_office_chair', 'tfg_crt_monitor') },
    tape_library: { wall_: X('tfg_ups_cabinet', 'tb_locker'), clutter: X('tb_box_small', 'tfg_filing_boxes') },
    battery_room: { wall_: X('tfg_ups_cabinet', 'tfg_ups_cabinet') },
    loading_dock: { wall_: X('tb_crate'), clutter: X('tb_crate', 'tb_crate_b', 'tb_box_large', 'tb_milk_crate') },
    security: { wall_: X('tfg_server_rack', 'tb_locker'), clutter: X('kf_office_chair') },
    core_chamber: { wall_: X('tfg_server_rack_open') },
    nest: { clutter: X('tfg_server_blade', 'tfg_crt_monitor') },
  },
  sewer: {
    entrance: { wall_: X('tfg_sewer_ladder', 'tb_locker'), clutter: X('tb_milk_crate') },
    junction: { wall_: X('tfg_sewer_pipe', 'tfg_sewer_valve', 'tfg_sewer_outflow'), clutter: X('tfg_sewer_grate') },
    pump_room: { wall_: X('tfg_sewer_valve', 'tfg_sewer_pipe') },
    cistern: { wall_: X('tfg_sewer_outflow', 'tfg_sewer_ladder') },
    overflow: { wall_: X('tfg_sewer_pipe', 'tfg_sewer_outflow'), clutter: X('tfg_sewer_grate') },
    sludge_pit: { wall_: X('tfg_sewer_outflow') },
    storm_drain: { wall_: X('tfg_sewer_ladder', 'tfg_sewer_pipe'), clutter: X('tfg_sewer_grate', 'tb_milk_crate') },
    maintenance: { wall_: X('tfg_sewer_valve', 'tb_locker'), clutter: X('tb_crate', 'tb_box_ammo') },
    camp: { wall_: X('kf_tv_vintage', 'tfg_crt_monitor'), clutter: X('tb_milk_crate', 'kf_box_open', 'tb_box_wrapped') },
    nest: { clutter: X('hb_ribcage', 'hb_bone') },
  },
  hospital: {
    entrance: { wall_: X('kf_bench_cushion', 'kf_potted_plant'), clutter: X('tfg_wheelchair') },
    ward: { wall_: X('tfg_heart_monitor', 'tfg_iv_stand', 'tfg_privacy_curtain', 'tfg_med_cabinet'), clutter: X('tfg_iv_stand', 'tfg_gurney') },
    patient_room: { wall_: X('tfg_hospital_bed', 'tfg_heart_monitor', 'tfg_privacy_curtain'), clutter: X('tfg_wheelchair') },
    operating: { wall_: X('tfg_heart_monitor', 'tfg_med_cabinet', 'tfg_iv_stand') },
    morgue: { wall_: X('tfg_gurney'), clutter: X('tfg_gurney') },
    pharmacy: { wall_: X('tfg_med_cabinet', 'tfg_med_cabinet'), clutter: X('tb_box_small', 'kf_box_closed') },
    nurse_station: { wall_: X('tfg_med_cabinet', 'kf_side_drawers'), clutter: X('kf_office_chair', 'kf_trashcan') },
    restroom: { wall_: X('kf_bathroom_sink') },
    isolation: { clutter: X('tfg_wheelchair') },
    nest: { clutter: X('tfg_gurney', 'tfg_iv_stand') },
  },
  // a little of the new kit also shows up in the original three interiors
  factory: {
    office: { wall_: X('tfg_cubicle_wall'), clutter: X('tfg_filing_boxes', 'kf_trashcan') },
    server: { wall_: X('tfg_server_rack', 'tfg_ups_cabinet') },
    security: { wall_: X('tfg_ups_cabinet') },
    lab: { wall_: X('tfg_heart_monitor', 'tfg_iv_stand') },
    breakroom: { wall_: X('kf_fridge_large'), clutter: X('kf_trashcan') },
    storage: { clutter: X('tb_box_large', 'tb_crate', 'tb_milk_crate') },
    lockers: { wall_: X('tb_locker') },
    nest: { clutter: X('tfg_crt_monitor') },
  },
  mansion: {
    library: { wall_: X('kf_floor_lamp') },
    study: { clutter: X('kf_floor_lamp') },
    bedroom: { wall_: X('kf_side_drawers') },
  },
  mineshaft: {
    crew_quarters: { clutter: X('tb_box_ammo', 'tb_milk_crate') },
    supply_cache: { clutter: X('tb_crate', 'tb_box_large') },
  },
};

const _applied = new WeakSet();
/** Merge EXT_THEME_PROPS into a facility THEMES table ({ id: { corridor, rooms } }). Idempotent per room
 *  style object; unknown themes / room types are skipped. Call once after every theme is registered. */
export function applyExtThemeProps(themes) {
  if (!themes) return 0;
  let n = 0;
  for (const [theme, rooms] of Object.entries(EXT_THEME_PROPS)) {
    const t = themes[theme];
    if (!t?.rooms) continue;
    for (const [room, add] of Object.entries(rooms)) {
      const st = t.rooms[room];
      if (!st || _applied.has(st)) continue;
      _applied.add(st);
      for (const [k, list] of Object.entries(add)) st[k] = [...(st[k] || []), ...list];
      n++;
    }
  }
  return n;
}

// round-2 models are preloaded with the rest (all small: ~100 GLBs, ~2.5 MB total)
{
  const seen = new Set(EXT_PRELOAD);
  for (const list of Object.values(EXT_SETS)) for (const id of list) if (!seen.has(id)) { seen.add(id); EXT_PRELOAD.push(id); }
}
