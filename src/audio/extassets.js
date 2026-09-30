// Hooks the downloaded CC0 asset packs (public/assets/ext/manifest.json) into the game:
// real recorded sounds override / extend the procedural sound library by name.
let manifest = null;

// our sound name -> external sound id(s) (arrays become _1.._N variants)
const ALIASES = {
  step_grass: ['step_leaves_1', 'step_leaves_2', 'step_leaves_3', 'step_leaves_4', 'step_leaves_5', 'step_leaves_6', 'step_leaves_7', 'step_leaves_8'],
  door_creak: 'door_creak_3',
  door_open: 'door_creak_1',
  ambience_facility: 'amb_facility_hallway',
  ambience_facility_2: 'amb_facility_research',
  ambience_mansion: 'amb_retro_2',
  ship_hum: 'scifi_ship_hum',
  wind: 'amb_wind_1',
  rain: 'amb_rain_porch_1',
  ambience_outdoor: 'scifi_strange_planet',
  orbit_ambience: 'scifi_planetarium',
  alarm_loop: 'scifi_alarm',
  ship_alarm: 'scifi_system_alert',
  power_down: 'power_down_whoosh',
  explosion: 'explosion_2',
  shotgun_fire: 'gun_shot',
  shotgun_reload: 'gun_reload',
  lurker_growl: 'mon_deep_growl',
  crawler_roar: 'mon_roar_1',
  giant_growl: 'mon_roar_3',
  hound_growl: 'mon_growl_4',
  screamer_scream: 'mon_scream',
  creature_death: 'voice_zombie_die',
  hit_metal: 'impact_metal_1',
  hit_flesh: 'impact_punch',
  item_pickup: 'pickup_2',
  chase_sting: 'sting_violin',
  death_sting: 'sting_piano_ringmod',
  ui_quota_met: 'jingle_success_2',
  ui_fired: 'jingle_fail_1',
  menu_theme: 'music_dark_ambient',
  spark: 'electric_3',
  walkie_static: 'radio_static_1',
  jumpscare: ['jumpscare_1', 'jumpscare_2', 'jumpscare_3', 'jumpscare_4'],
  distant_growl: ['mon_growl_1', 'mon_growl_2', 'mon_growl_5', 'mon_growl_7'],
  sting: ['sting_drum', 'sting_impact', 'sting_synth', 'sting_violin_glitch', 'sting_piano'],
  heavy_step: ['step_heavy_1', 'step_heavy_2', 'step_heavy_3', 'step_heavy_4'],
  // round 2: new interior themes (sounds made for TFG in tools/assets/tfg_audio.py + Quendel water, CC-BY)
  ambience_office: 'amb_office_hvac',
  ambience_backrooms: 'amb_backrooms_hum',
  ambience_serverfarm: 'amb_server_room',
  ambience_sewer: 'amb_sewer_tunnel',
  ambience_sewer_water: 'amb_sewer_water_1',
  ambience_hospital: 'amb_hospital_ward',
  heart_monitor_beep: 'sfx_heart_beep',
  flatline: 'sfx_flatline',
  phone_ring: 'sfx_phone_ring',
  dialup_modem: 'sfx_dialup_modem',
  hdd_click: 'sfx_hdd_click',
  crt_on: 'sfx_crt_on',
  crt_off: 'sfx_crt_off',
  light_flicker: 'sfx_fluoro_flicker',
  elevator_ding: 'sfx_elevator_ding',
  printer_jam: 'sfx_printer_jam',
  office_typing: 'sfx_typing',
  bios_beep: 'sfx_bios_beep',
  drip: ['sfx_drip_1', 'sfx_drip_2', 'sfx_drip_3', 'sfx_drip_4'],
  pipe_groan: ['sfx_pipe_groan_1', 'sfx_pipe_groan_2'],
};

// interior theme id -> ambience loop (aliases above). Only returned when the loop is registered, so callers
// can fall back to their own default (e.g. 'ambience_facility').
const THEME_AMBIENCE = {
  office: 'ambience_office',
  backrooms: 'ambience_backrooms', poolrooms: 'ambience_backrooms',
  serverfarm: 'ambience_serverfarm', server_farm: 'ambience_serverfarm', datacenter: 'ambience_serverfarm',
  sewer: 'ambience_sewer', sewers: 'ambience_sewer',
  hospital: 'ambience_hospital',
};
let _audio = null;   // the AudioManager registerExtSounds() filled (audio.has() drops sounds whose load failed)
/** Ambience loop name for an interior theme, or null (unknown theme, sound not shipped or failed to load). */
export function themeAmbience(theme, audio = _audio) {
  const n = THEME_AMBIENCE[theme];
  if (!n || !audio || typeof audio.has !== 'function') return null;
  return audio.has(n) ? n : null;
}

// Occasional positional one-shots that sell each interior (distant phone in the office, drips in the sewer,
// a heart monitor down the hospital hall...). Purely cosmetic and local to this client, so it may use
// Math.random (nothing here touches world state). [aliasName, volume, variants]
const THEME_ONESHOTS = {
  office: [['phone_ring', 0.35], ['office_typing', 0.3], ['printer_jam', 0.3], ['elevator_ding', 0.35], ['light_flicker', 0.3]],
  backrooms: [['light_flicker', 0.45], ['light_flicker', 0.45], ['phone_ring', 0.2], ['office_typing', 0.2], ['drip', 0.3, 4]],
  poolrooms: [['drip', 0.45, 4], ['drip', 0.45, 4], ['light_flicker', 0.3]],
  serverfarm: [['hdd_click', 0.45], ['bios_beep', 0.25], ['dialup_modem', 0.22], ['light_flicker', 0.3]],
  sewer: [['drip', 0.5, 4], ['drip', 0.5, 4], ['drip', 0.5, 4], ['pipe_groan', 0.4, 2]],
  hospital: [['heart_monitor_beep', 0.3], ['flatline', 0.22], ['light_flicker', 0.3], ['phone_ring', 0.2], ['elevator_ding', 0.25]],
  deadmall: [['mall_chime', 0.3], ['light_flicker', 0.35], ['light_flicker', 0.35], ['drip', 0.25, 4], ['elevator_ding', 0.2]],   // [labyr10]
  funhouse: [['fun_honk', 0.35], ['lm_giggle', 0.28], ['light_flicker', 0.3], ['drip', 0.2, 4]],   // [labyr10]
  darkweb: [['hdd_click', 0.4], ['dialup_modem', 0.22], ['drip', 0.3, 4], ['bios_beep', 0.2]],   // [labyr12]
  hotel: [['elevator_ding', 0.3], ['phone_ring', 0.18], ['light_flicker', 0.3], ['drip', 0.15, 4]],   // [labyr12]
};
const _oneShot = { t: 12, theme: null };
/** Call every frame from Game.update(dt). Plays one themed sound every ~14-35 s, 7-16 m away, while the
 *  local player is alive inside a facility whose theme has a set (see THEME_ONESHOTS). */
export function updateThemeOneShots(game, dt) {
  const p = game?.player;
  const theme = game?.world?.facility?.layout?.theme;
  const set = theme && THEME_ONESHOTS[theme];
  if (!set || !p || p.dead || !p.indoor || !game.audio || !p.pos) { _oneShot.t = Math.max(_oneShot.t, 6); return; }
  if (_oneShot.theme !== theme) { _oneShot.theme = theme; _oneShot.t = 8 + Math.random() * 10; }
  _oneShot.t -= dt;
  if (_oneShot.t > 0) return;
  _oneShot.t = 14 + Math.random() * 21;
  const [name, vol, variants] = set[(Math.random() * set.length) | 0];
  const id = variants ? `${name}_${1 + ((Math.random() * variants) | 0)}` : name;
  if (!game.audio.has?.(id)) return;
  const a = Math.random() * Math.PI * 2, d = 7 + Math.random() * 9;
  game.audio.at(id, { x: p.pos.x + Math.cos(a) * d, y: p.pos.y + 1 + Math.random() * 1.5, z: p.pos.z + Math.sin(a) * d }, vol);
}

// our texture name -> external texture id
export const TEXTURE_OVERRIDES = {
  concrete: 'px_concrete_02_grey_horlines_1',
  concrete_stained: 'hr_wall_09',
  metal_rust: 'hr_metal_07',
  metal_plate: 'hr_floor_09',
  tiles_dirty: 'hr_floor_12',
  ship_wall: 'px_metal_04_blue_09',
  ship_floor: 'px_metal_06_studs_1',
  door_metal: 'px_metal_07_blue_2',
  grass: 't1_grass_05',
  rock: 't2_stone_13',
  snow: 'px_snow_02_white_1',
  dirt: 't2_dirt_03',
  red_sand: 't3_terrain_05',
  mud: 't3_terrain_13',
  // round 2: procedural texture names used by the new interiors (src/world/interiors/*, textures.js keeps the
  // procedural versions as the fallback when ext textures are off). Also listed in manifest featured.textures.
  carpet_office: 'tfg_office_carpet',
  wall_office: 'tfg_office_wall',
  ceiling_tiles: 'tfg_office_ceiling',
  carpet_wet: 'nb_backrooms_carpet',
  wallpaper_yellow: 'nb_backrooms_wallpaper',
  ceiling_stained: 'gbr_backrooms_ceiling',
  pool_tiles: 'gbr_poolrooms_tile',
  raised_floor: 'tfg_server_floor',
  server_wall: 'tfg_server_wall',
  sewer_brick: 'tfg_sewer_brick',
  sewer_floor: 'tfg_sewer_floor',
  tiles_mint: 'tfg_hospital_tiles',
  wall_hospital: 'tfg_hospital_wall',
};

export async function loadExtManifest() {
  if (manifest) return manifest;
  try {
    manifest = await fetch('assets/ext/manifest.json').then((r) => r.json());
  } catch (e) {
    console.warn('ext manifest missing', e);
    manifest = { sounds: [], textures: [], models: [] };
  }
  return manifest;
}

export function registerExtSounds(audio) {
  if (!manifest) return;
  _audio = audio;
  const byId = new Map(manifest.sounds.map((s) => [s.id, s.path]));
  for (const [id, path] of byId) audio.registerExternal(id, path);
  for (const [ours, ext] of Object.entries(ALIASES)) {
    const list = Array.isArray(ext) ? ext : [ext];
    const found = list.filter((x) => byId.has(x));
    if (!found.length) continue;
    if (Array.isArray(ext)) found.forEach((x, i) => audio.registerExternal(`${ours}_${i + 1}`, byId.get(x)));
    else audio.registerExternal(ours, byId.get(found[0]));
  }
}

export function extTexturePath(id) {
  const t = manifest?.textures.find((x) => x.id === id);
  return t ? t.path : null;
}
export function extModelPath(id) {
  const t = manifest?.models.find((x) => x.id === id);
  return t ? t.path : null;
}
export function getManifest() { return manifest; }
