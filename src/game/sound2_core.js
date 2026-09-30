// SOUND PASS 2 core (pure): which sound id each wave-8 feature plays, plus the lease rule for held loops. The node test
// (tools/harness/sound2.test.mjs) checks every id exists in the sfx library / external pack and has a mix-policy category.
export const LEASE = 0.35;   // s a held loop survives without a refresh from its owner

/** feature -> sound ids it plays (loops are started with sound2.hold(), see docs/wave8/sound2.md) */
export const SOUND_MAP = Object.freeze({
  feedcams: ['cam_servo_loop', 'rec_lock', 'onair_sting', 'cam_smash', 'cam_spray', 'junction_cut', 'spark', 'taser_zap'],
  feedcams2: ['jammer_hum', 'drone_rotor', 'cam_smash', 'taser_zap', 'battery_dead', 'flashlight_click'],
  downed: ['down_thud', 'revive_loop', 'stand_up', 'heal'],
  carry2: ['carry_creak', 'fragile_crunch', 'catch_thump', 'item_pickup', 'item_drop', 'glass_break'],
  highlights: ['crt_on', 'crt_off', 'chat_blip'],
  labyrinths: ['train_horn', 'train_rumble', 'lockdown_siren', 'gate_slam', 'elevator_hum', 'elevator_stall', 'vine_cut', 'spore_puff', 'bell_ding'],
  expeditions: ['uw_loop', 'uw_bubbles', 'air_warning', 'sand_wind', 'sand_storm', 'zip_line', 'generator_loop', 'battery_charge', 'register', 'power_up'],
  lcmonsters: ['door_knock', 'light_flicker', 'heart_monitor_beep', 'lm_witch_chant', 'lm_cage_chime', 'lm_mark_bell', 'lm_giggle', 'lm_treat_jingle', 'lm_mimic_creak', 'lm_mask_laugh', 'lm_mask_weep', 'lm_rift_rumble'],
  crdirector: ['cd_dimmer_hum', 'cd_follower_static', 'cd_auditor_stamp'],
  resto: ['resto_sizzle', 'resto_bell', 'alien_chatter'],
  mining: ['mine_pick_stone', 'mine_pick_ore', 'mine_pick_crystal', 'mine_drill', 'cave_creak'],
  arcade2: ['arcade2_flap', 'arcade2_pass', 'arcade2_crash', 'arcade2_tick'],
  hubgate: ['hub_unlock', 'ui_error'],
  rewardviz: ['coin_pop'],
  repomaps: ['shift_bell', 'shelf_slide', 'glass_break'],
});

/** mining pick sound by material class ('stone' | 'ore' | 'crystal') */
export function minePick(kind) { return kind === 'crystal' ? 'mine_pick_crystal' : kind === 'ore' ? 'mine_pick_ore' : 'mine_pick_stone'; }

/** keys of held loops whose lease ran out (map values carry { until }) */
export function expired(map, now) { const out = []; for (const [k, h] of map) if (h.until < now) out.push(k); return out; }
