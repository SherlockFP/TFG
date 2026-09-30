// Mix policy (wave 8 'atmos'): pure rules the AudioManager consults for every one-shot. Loudness trims per category (the
// procedural library has 15-20 dB of spread between its quietest steps and its loudest beeps / stings), same-sound cooldowns
// and voice caps (no stacking machine-gun blips), random pitch / volume variation (kills repetition) and a low-pass for
// harsh, high-frequency-heavy sounds. Numbers come from a render audit, see docs/wave8/atmos.md.
// rule = { gain, cool (s between two starts of the same key), max (concurrent voices of the same key), vary: [pitch, volume] (+-fraction), lp (Hz), key }
export const BUS_TRIM = { sfx: 1, music: 0.85, voice: 1, ui: 0.65, amb: 1 };

export const RULES = [
  [/^ui_hover$/, { gain: 0.5, cool: 0.09, max: 2, vary: [0.05, 0.15], lp: 6500, key: 'ui_tick' }],
  [/^ui_(click|chat|notify|scan)$/, { gain: 0.7, cool: 0.06, max: 2, vary: [0.03, 0.1], lp: 7000 }],
  [/^ui_(error|fired|confirm|levelup|quota_met|buy)$/, { gain: 0.55, cool: 0.15, max: 2, lp: 8000 }],
  [/^(keypad_beep_\d|mine_beep|terminal_(key_\d|enter|error)|scan_blip)/, { gain: 0.55, cool: 0.07, max: 3, vary: [0.03, 0.1], lp: 7000, key: 'beep' }],
  [/^arcade_/, { gain: 0.6, cool: 0.05, max: 4, lp: 8000 }],
  [/^step_/, { cool: 0.045, max: 6, vary: [0.06, 0.12], key: 'step' }],
  [/^(item_pickup|item_drop|item_throw|hit_(wall|metal|flesh)|land_(soft|hard)|door_(open|close|locked|creak)|cloth_rustle|swing_whoosh|jump|inventory_switch|flashlight_click)/, { cool: 0.05, max: 3, vary: [0.05, 0.1] }],
  [/^(jester_pop|clownhorn|airhorn|yoinker_yippee|ship_alarm|alarm_loop|steam_hiss|glass_break|squeak)/, { gain: 0.72, cool: 0.4, max: 2, lp: 7500 }],
  [/^(screamer_scream|leech_screech|spider_hiss|scuttler_hiss|spray_paint|spark|coins)/, { gain: 0.8, cool: 0.25, max: 2, lp: 7500 }],
  [/^(crickets|rain|spider_skitter|reel_loop|walkie_static)$/, { lp: 5500 }],
  [/^heartbeat$/, { max: 1, cool: 0.4 }],
  [/^(drip_\d|distant_bang_\d|vent_rattle|whisper_\d)/, { cool: 0.8, max: 1, vary: [0.08, 0.2], key: 'ambient_one_shot' }],
  // [sound2] wave-8 sounds: every id gets a category (cat) so the mix stays readable: loops sit under cues, stings and creature cues own the space
    [/^(cam_servo_loop|rec_lock|jammer_hum|drone_rotor|revive_loop|train_rumble|elevator_hum|uw_loop|sand_wind|sand_storm|generator_loop)$/, { cat: 'loop', gain: 1, cool: 0.5, max: 2 }],
    [/^(onair_sting|hub_unlock|lockdown_siren|air_warning|lm_mark_bell|shift_bell|battery_charge)$/, { cat: 'sting', gain: 0.8, cool: 1.2, max: 1, lp: 8000 }],
  [/^train_horn$/, { cat: 'sting', gain: 0.8, cool: 0.05, max: 2, lp: 8000 }],   // one horn at each tunnel end
    [/^lm_rift_rumble$/, { cat: 'creature_cue', gain: 0.9, cool: 4, max: 1, lp: 6000 }],
    [/^(door_knock|light_flicker|heart_monitor_beep|lm_(witch_chant|cage_chime|giggle|treat_jingle|mimic_creak|mask_laugh|mask_weep)|cd_(dimmer_hum|follower_static|auditor_stamp))$/, { cat: 'creature_cue', gain: 0.9, cool: 0.3, max: 2, vary: [0.03, 0.06], lp: 7500 }],
    [/^(mine_pick_stone|mine_pick_ore|mine_pick_crystal)$/, { cat: 'mining', cool: 0.08, max: 3, vary: [0.07, 0.12] }],
    [/^mine_drill$/, { cat: 'mining', gain: 0.8, cool: 0.25, max: 2, vary: [0.04, 0.08], lp: 6500 }],
    [/^(down_thud|stand_up|carry_creak|fragile_crunch|catch_thump|cam_smash|cam_spray|junction_cut|gate_slam|elevator_stall|vine_cut|spore_puff|zip_line|uw_bubbles|cave_creak|shelf_slide)$/, { cat: 'foley', cool: 0.12, max: 3, vary: [0.05, 0.1], lp: 8000 }],
    [/^chat_blip$/, { cat: 'ui_soft', gain: 0.5, cool: 0.35, max: 1, vary: [0.08, 0.15], lp: 5000 }],
    [/^(crt_on|crt_off|coin_pop)$/, { cat: 'ui_soft', gain: 0.6, cool: 0.08, max: 2, vary: [0.04, 0.1], lp: 7000 }],
    [/^arcade2_/, { cat: 'minigame', gain: 0.6, cool: 0.04, max: 4, lp: 8000 }],
    [/^alien_chatter$/, { cat: 'resto', gain: 0.6, cool: 2.5, max: 1, vary: [0.15, 0.2], lp: 6000 }],
    [/^resto_(sizzle|bell)$/, { cat: 'resto', gain: 0.6, cool: 1, max: 1, vary: [0.04, 0.1], lp: 7500 }],
];
const DEFAULT = { cool: 0.02, max: 8 };
const cache = new Map();
export function policyFor(name) {
  let r = cache.get(name);
  if (r) return r;
  r = { gain: 1, cool: DEFAULT.cool, max: DEFAULT.max, vary: null, lp: 0, key: name };
  for (const [re, rule] of RULES) if (re.test(name)) { r = { ...r, ...rule, key: rule.key || name }; break; }
  cache.set(name, r);
  return r;
}

/** Cooldown gate: allow(key, now, cool) -> true when a sound of this key may start; records the start. */
export class Gate {
  constructor() { this.last = new Map(); }
  allow(key, now, cool) {
    const l = this.last.get(key);
    if (l !== undefined && now - l < cool) return false;
    this.last.set(key, now);
    if (this.last.size > 400) for (const [k, v] of this.last) if (now - v > 30) this.last.delete(k);
    return true;
  }
}

/** random +-fraction jitter around 1 (rand in 0..1) */
export const jitter = (frac, rand) => 1 + (rand * 2 - 1) * frac;

/** cutoff (Hz) for a source `dist` metres away: bright close by, duller in the distance, never below 2.5 kHz */
export function distanceCutoff(dist, base = 18000) {
  if (!(dist > 12)) return base;
  return Math.min(base, Math.max(2500, 16000 * Math.exp(-(dist - 12) / 45)));
}
