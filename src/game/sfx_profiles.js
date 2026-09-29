// CREATURE SOUND PROFILES (module `sfx`, docs/wave4/sfx.md): who sounds like what. Pure data + tiny pure helpers (no three / DOM).
//   VOICES[id]   = { arch, k:{tuning}, ov:{event: fn}, foot }   a recipe for the procedural synth (src/audio/creaturevoice.js)
//   PROFILES[type] = { voice, foot, pitch, vol, idle:[min,max]s, range:[ref,max]m, stride, keep:[events], human?, crowd? }
//   profileFor(type, def) always returns a COMPLETE profile (unknown / future creatures are guessed from their def stats).
import { S, Nz, Ck, Tn, Ht, Bb, Vx, swell, perc } from '../audio/creaturevoice.js';

export const SFX_EVENTS = ['idle', 'alert', 'chase', 'attack', 'hurt', 'death', 'step'];

// ------------------------------------------------------------------------------------------------ voices (recipes)
const OV = {
  // Data Hoarder: cheerful "yip-pee" (rising two-note chirp) while it minds its nest
  hoarderIdle: (k, v) => S(0.7, [
    Tn({ dur: 0.16, f: [[0, 820], [0.16, 1250]], vib: [16, 0.02], amp: swell(0.16, 0.15, 0.7) }, 0.9),
    Tn({ dur: 0.22, f: [[0, 1350], [0.22, 1900]], vib: [16, 0.02], amp: swell(0.22, 0.15, 0.7) }, 0.9, 0.2 + 0.03 * v)]),
  // Web Crawler: index run = a hard ticking train under a rising servo whine
  crawlerChase: (k, v) => S(0.9, [
    Ck({ dur: 0.9, n: 34, f: 2100, decay: 0.005, amp: 0.8 }),
    Tn({ dur: 0.9, f: [[0, 260], [0.9, 640]], wave: 'saw', lp: 2200, amp: swell(0.9, 0.1, 0.9, 0.5) }, 0.55)]),
  // NPC / mannequin: plastic joints
  npcIdle: (k, v) => S(1.2, [
    Tn({ dur: 0.9, f: [[0, 180 * [1, 0.9, 1.12][v % 3]], [0.5, 240], [0.9, 170]], wave: 'saw', vib: [11, 0.06], lp: 700, amp: swell(0.9, 0.3, 0.6, 0.35) }, 0.5),
    Ht({ dur: 0.12, kind: 'plastic', f: 1500 }, 0.6, 0.7 + 0.05 * v)]),
  npcAlert: (k, v) => S(0.4, [Ht({ dur: 0.2, kind: 'plastic', f: 1200 }, 1), Ck({ dur: 0.2, n: 5, f: 2200, decay: 0.006 }, 0.7, 0.05)]),
  npcChase: (k, v) => S(0.9, [Ck({ dur: 0.9, n: 26, f: 1700, decay: 0.008 }, 0.9), Ht({ dur: 0.1, kind: 'plastic', f: 900 }, 0.5, 0.4)]),
  npcAttack: (k, v) => S(0.3, [Ht({ dur: 0.25, kind: 'plastic', f: 900 }, 1), Nz({ dur: 0.1, hp: 2000, amp: perc(0.1, 0.3) }, 0.5)]),
  npcHurt: (k, v) => S(0.25, [Ht({ dur: 0.22, kind: 'wood', f: 320 }, 1)]),
  npcDeath: (k, v) => S(1.1, [Ht({ dur: 0.8, kind: 'glass', f: 1300, decay: 0.5 }, 0.8), Ck({ dur: 1.0, n: 22, acc: 1.7, f: 1600, decay: 0.01 }, 0.7)]),
  // Clickbait: a notification ding as the lure
  clickbaitIdle: (k, v) => S(1.0, [Ht({ dur: 0.9, kind: 'bell', f: 1318 * (v === 1 ? 0.89 : 1), decay: 0.45 }, 0.8), Ht({ dur: 0.8, kind: 'bell', f: 1760, decay: 0.4 }, 0.5, 0.12)]),
  // Spambomb: hissing fuse and a ticking that speeds up
  spambombChase: (k, v) => S(1.0, [Nz({ dur: 1.0, hp: 3000, flutter: [14, 0.5], amp: swell(1.0, 0.1, 0.9, 0.8) }, 0.6), Ck({ dur: 1.0, n: 18, acc: 0.6, f: 2600, decay: 0.006 }, 0.7)]),
  spambombAlert: (k, v) => S(0.7, [Nz({ dur: 0.7, hp: 2500, amp: swell(0.7, 0.9, 0.95, 1) }, 0.7), Tn({ dur: 0.7, f: [[0, 600], [0.7, 1500]], amp: swell(0.7, 0.5, 0.9, 0.5) }, 0.5)]),
  // Legacy Bot: a dial-up modem handshake before the rockets
  legacyAlert: (k, v) => S(1.2, [
    Tn({ dur: 1.2, f: 1400, steps: { rate: 14, set: [0.6, 0.8, 1, 1.4, 1.9] }, crush: [7, 2], amp: swell(1.2, 0.05, 0.9, 0.7) }, 0.7),
    Tn({ dur: 1.2, f: [[0, 90], [1.2, 260]], wave: 'saw', lp: 900, amp: swell(1.2, 0.2, 0.9, 0.6) }, 0.7)]),
  // Foreman: furnace roar
  foremanAlert: (k, v) => S(1.4, [
    Vx({ dur: 1.4, f0: [[0, 60], [0.5, 95], [1.4, 70]], vowels: [[0, 'o'], [0.6, 'a'], [1.4, 'o']], scale: 0.6, fry: 0.9, breath: 0.5, drive: 2, amp: swell(1.4, 0.2, 0.85) }, 0.8),
    Nz({ dur: 1.4, color: 'brown', lp: 900, amp: swell(1.4, 0.3, 0.8, 0.8) }, 0.8), Ht({ dur: 0.8, kind: 'metal', f: 110, decay: 0.7 }, 0.5, 0.3)]),
  // Excavator: pickaxe on rock
  excavatorAttack: (k, v) => S(0.7, [Ht({ dur: 0.6, kind: 'metal', f: 240, decay: 0.5 }, 1), Nz({ dur: 0.35, color: 'brown', lp: 500, amp: perc(0.35, 0.3) }, 0.8), Ht({ dur: 0.5, kind: 'thump', f: 50 }, 0.9, 0.02)]),
  // Key Holder: a ring of keys
  keysIdle: (k, v) => S(0.9, [Ck({ dur: 0.7, n: 7, f: 4200, decay: 0.03, noise: 0.2 }, 0.8), Ht({ dur: 0.6, kind: 'tin', f: 2600, decay: 0.6 }, 0.4, 0.1)]),
  // The Host: warm, hushed welcome
  hostIdle: (k, v) => S(1.6, [Vx({ dur: 1.6, f0: [[0, 170], [0.8, 190], [1.6, 165]], src: 'noise', vowels: [[0, 'o'], [0.5, 'a'], [1.0, 'e'], [1.6, 'o']], scale: 0.95, amp: swell(1.6, 0.3, 0.7, 0.9) }, 1)]),
  // Fake Exit: the door slams shut and the sign hums
  fakedoorIdle: (k, v) => S(1.4, [Tn({ dur: 1.4, f: 118, wave: 'square', lp: 500, amp: swell(1.4, 0.3, 0.7, 0.3) }, 0.5), Nz({ dur: 1.4, color: 'pink', bp: 600, q: 1.2, amp: [[0, 0], [0.4, 0.6], [0.7, 0.1], [1.0, 0.6], [1.4, 0]] }, 0.5)]),
  fakedoorAttack: (k, v) => S(0.7, [Ht({ dur: 0.6, kind: 'wood', f: 120, decay: 1.5 }, 1), Ht({ dur: 0.5, kind: 'thump', f: 55 }, 1), Nz({ dur: 0.3, bp: 1500, q: 0.8, amp: perc(0.3, 0.3) }, 0.5)]),
  // Web: a plucked silk thread
  webAlert: (k, v) => S(0.7, [Tn({ dur: 0.7, f: [[0, 900 * [1, 0.93, 1.1][v % 3]], [0.7, 860 * [1, 0.93, 1.1][v % 3]]], vib: [30, 0.02], amp: perc(0.7, 0.6) }, 0.8)]),
  // Paper Shield: rustle and shred
  paperIdle: (k, v) => S(0.9, [Nz({ dur: 0.9, bp: 4200, q: 0.7, flutter: [9, 0.9], amp: swell(0.9, 0.3, 0.6, 0.6) }, 0.8)]),
  paperAlert: (k, v) => S(0.5, [Nz({ dur: 0.5, bp: 3600, q: 0.7, flutter: [18, 0.9], amp: swell(0.5, 0.1, 0.7) }, 0.9)]),
  paperChase: (k, v) => S(0.9, [Nz({ dur: 0.9, bp: 3800, q: 0.7, flutter: [24, 0.95], amp: swell(0.9, 0.1, 0.9) }, 0.9)]),
  paperAttack: (k, v) => S(0.25, [Nz({ dur: 0.25, hp: 2500, amp: perc(0.25, 0.3) }, 1)]),
  paperHurt: (k, v) => S(0.3, [Nz({ dur: 0.3, bp: 3000, q: 0.6, flutter: [30, 0.9], amp: perc(0.3, 0.4) }, 1)]),
  paperDeath: (k, v) => S(0.8, [Nz({ dur: 0.8, bp: [[0, 4500], [0.8, 1800]], q: 0.6, flutter: [22, 0.95], amp: swell(0.8, 0.05, 0.5) }, 1)]),
  // Editor: a hard cut (film splice) instead of a voice
  editorAttack: (k, v) => S(0.35, [Ck({ dur: 0.1, n: 2, f: 4400, decay: 0.01, noise: 1 }, 1), Nz({ dur: 0.3, hp: 3000, amp: perc(0.3, 0.2) }, 0.6), Ht({ dur: 0.3, kind: 'thump', f: 70 }, 0.7)]),
};

const V = (arch, k, ov, extra) => ({ arch, k, ov, ...(extra || {}) });

export const VOICES = {
  spambot: V('chitter', { f: 3400 }),
  hoarder: V('screech', { f: 1100, fmi: 3, air: 0.1 }, { idle: OV.hoarderIdle }),
  crawlerbot: V('chitter', { f: 1900 }, { chase: OV.crawlerChase }),
  lurker: V('beast', { f: 70, sc: 0.75, fry: 0.9, br: 0.5, z: 1.3 }),
  npc: V('undead', { f: 80, voc: 0, rattle: 0.5 }, { idle: OV.npcIdle, alert: OV.npcAlert, chase: OV.npcChase, attack: OV.npcAttack, hurt: OV.npcHurt, death: OV.npcDeath }),
  slop: V('wet', { f: 80, bub: 12 }),
  popup: V('toy', { f: 523 }),
  webspider: V('chitter', { f: 2600 }),
  leecher: V('wet', { f: 190, bub: 24 }),
  screamer: V('screech', { f: 700, fmi: 6, air: 0.5, scream: 1 }),
  deepfake: V('human', { f: 130, glitch: 0.6 }),
  troll: V('beast', { f: 100, sc: 0.85, fry: 0.7 }),
  influencer: V('giant', { f: 50 }),
  worm: V('giant', { f: 30, br: 0.7 }),
  turret: V('robot', { f: 300, servo: 0.6, beep: 1.2 }),
  mine: V('robot', { f: 500, servo: 0, beep: 1.4, clang: 0.6 }),
  fakedoor: V('beast', { f: 60, sc: 0.7, fry: 0.9, z: 1.2 }, { idle: OV.fakedoorIdle, attack: OV.fakedoorAttack }),
  web: V('wet', { f: 200, bub: 8 }, { alert: OV.webAlert }),
  moderator: V('robot', { f: 150, servo: 1, beep: 1, clang: 1.2 }),
  support: V('human', { f: 230, sc: 1.15, radio: 0.3, glitch: 0.15 }),
  ticketswarm: V('glitch', { f: 600, rate: 26, bits: 6 }),
  editor: V('glitch', { f: 220, rate: 4, bits: 6 }, { attack: OV.editorAttack }),
  tama: V('screech', { f: 1600, fmi: 2, air: 0.1 }),
  parasocial: V('ghost', { f: 420 }),
  clickbait: V('glitch', { f: 880, bits: 6, rate: 7 }, { idle: OV.clickbaitIdle }),
  replyguy: V('screech', { f: 1400, fmi: 4, air: 0.4 }),
  zombot: V('undead', { f: 100 }),
  squad1: V('human', { f: 95, sc: 0.9, radio: 1 }),
  squad2: V('human', { f: 120, radio: 1 }),
  squad3: V('human', { f: 85, sc: 0.85, radio: 1, glitch: 0.2 }),
  doppel: V('human', { f: 140, glitch: 0.9 }),
  collector: V('chitter', { f: 2800 }),
  janitor: V('robot', { f: 130, servo: 1.3, beep: 0.7, clang: 0.8 }),
  nest: V('chitter', { f: 1200 }),
  bin: V('robot', { f: 110, servo: 0, beep: 0.5, clang: 1.5 }),
  smiler: V('ghost', { f: 520 }),
  palehound: V('beast', { f: 130, sc: 1, fry: 0.4 }),
  partygoer: V('toy', { f: 440 }),
  moths: V('chitter', { f: 6000 }),
  dunemaw: V('giant', { f: 38 }),
  tusk: V('beast', { f: 65, sc: 0.7, fry: 0.8 }),
  raider: V('human', { f: 105, radio: 0.3 }),
  alien: V('human', { f: 300, sc: 1.6, glitch: 0.3 }),
  prowler: V('beast', { f: 190, sc: 1.1, fry: 0.3, br: 0.4 }),
  bones: V('undead', { f: 90, voc: 0 }),
  boneknight: V('undead', { f: 70, voc: 0, rattle: 1.3 }),
  skeleton: V('undead', { f: 95 }),
  secbot: V('robot', { f: 200 }),
  wraith: V('ghost', { f: 280 }),
  fiend: V('beast', { f: 140, sc: 1, fry: 0.9, br: 0.6 }),
  foreman: V('robot', { f: 70, servo: 1.4, beep: 0, clang: 2.2 }, { alert: OV.foremanAlert }),
  legacybot: V('robot', { f: 100, servo: 1.5, beep: 1.6, clang: 2 }, { alert: OV.legacyAlert }),
  loadbalancer: V('robot', { f: 400, servo: 0.4, beep: 1.5 }),
  manager: V('human', { f: 110, radio: 0.5 }),
  hydra: V('wet', { f: 110, bub: 16 }),
  hydrahead: V('beast', { f: 120, sc: 1.1, fry: 0.9, br: 0.6 }),
  hydrareply: V('chitter', { f: 5200 }),
  surgeon: V('human', { f: 100, sc: 0.85, radio: 0.4, whisper: 1 }),
  host: V('ghost', { f: 200 }, { idle: OV.hostIdle }),
  excavator: V('giant', { f: 48 }, { attack: OV.excavatorAttack }),
  lobbymgr: V('glitch', { f: 300, rate: 16, bits: 4 }),
  keyholder: V('chitter', { f: 1700 }, { idle: OV.keysIdle }),
  lbnode: V('robot', { f: 350, servo: 1, beep: 0.3 }),
  paper: V('ghost', { f: 300 }, { idle: OV.paperIdle, alert: OV.paperAlert, chase: OV.paperChase, attack: OV.paperAttack, hurt: OV.paperHurt, death: OV.paperDeath }),
  spambomb: V('glitch', { f: 1000, bits: 6, rate: 10 }, { chase: OV.spambombChase, alert: OV.spambombAlert }),
};

// ------------------------------------------------------------------------------------------------ profiles (one per creature type)
// idle: [min, max] seconds between ambient vocalisations while unaware (0 = none); range: [refDistance, maxDistance] m;
// keep: events whose existing recorded sound (STATE_SOUNDS) stays on top of ours; pitch: playback-rate scale of the whole voice;
// human: may say a `voice_<n>` line from a custom sound pack; crowd: many of them at once, so shared cooldowns are longer;
// stride: metres per footstep; sil: an unusually quiet footstep (0..1 volume).
const P = (voice, foot, o = {}) => ({ voice, foot, pitch: 1, vol: 1, idle: [10, 22], range: [3, 45], stride: 1.1, keep: [], ...o });

export const PROFILES = {
  // ---- base facility / outdoor creatures
  scuttler: P('spambot', 'skitter', { idle: [4, 9], range: [2, 28], stride: 0.35, crowd: true }),
  yoinker: P('hoarder', 'pad', { idle: [5, 11], range: [2, 32], stride: 0.6 }),
  crawler: P('crawlerbot', 'scuttle', { idle: [8, 16], range: [4, 55], stride: 0.9, keep: ['alert', 'chase'] }),
  lurker: P('lurker', 'bare', { idle: [12, 24], range: [2, 24], stride: 1.5, keep: ['alert', 'attack'], sil: 0.35 }),
  mannequin: P('npc', 'plastic', { idle: [9, 18], range: [3, 30], stride: 0.9 }),
  sludge: P('slop', 'squelch', { idle: [6, 12], range: [3, 30], stride: 0.7 }),
  jester: P('popup', 'shoe', { idle: [6, 13], range: [4, 50], stride: 1.0, keep: ['attack'] }),
  spider: P('webspider', 'skitter', { idle: [7, 14], range: [3, 36], stride: 0.6 }),
  leech: P('leecher', 'pad', { idle: [6, 14], range: [2, 22], stride: 0.5 }),
  screamer: P('screamer', 'bare', { idle: [10, 20], range: [3, 45], stride: 1.3, keep: ['alert'] }),
  mimic: P('deepfake', 'boot', { idle: [9, 18], range: [3, 34], stride: 1.15, human: true }),
  hound: P('troll', 'paw', { idle: [7, 14], range: [4, 60], stride: 1.0, keep: ['alert', 'chase', 'attack'] }),
  giant: P('influencer', 'stomp', { idle: [9, 17], range: [8, 120], stride: 3.2, keep: ['chase'], vol: 1.1 }),
  sandkefal: P('worm', 'rumble', { idle: [10, 20], range: [10, 110], stride: 3.5, keep: ['alert'], vol: 1.1 }),
  turret: P('turret', 'none', { idle: [5, 10], range: [3, 38], keep: ['alert'] }),
  mine: P('mine', 'none', { idle: [3, 6], range: [2, 20], keep: ['alert'] }),
  mimicdoor: P('fakedoor', 'none', { idle: [8, 15], range: [3, 26] }),
  web: P('web', 'none', { idle: [0, 0], range: [2, 20] }),
  moderator: P('moderator', 'boot', { idle: [8, 15], range: [4, 50], stride: 1.3 }),
  support: P('support', 'wheel', { idle: [6, 12], range: [3, 36], stride: 1.2, human: true }),
  ticketswarm: P('ticketswarm', 'none', { idle: [2, 4], range: [3, 40], crowd: true }),
  editor: P('editor', 'stomp', { idle: [8, 14], range: [4, 44], stride: 2.6 }),
  tamagotchi: P('tama', 'pad', { idle: [4, 8], range: [3, 40], stride: 0.5 }),
  stalker: P('parasocial', 'none', { idle: [6, 13], range: [3, 30], human: true }),
  clickbait: P('clickbait', 'pad', { idle: [6, 12], range: [3, 38], stride: 0.9 }),
  replyguy: P('replyguy', 'flap', { idle: [4, 9], range: [3, 40], stride: 0.8, crowd: true }),
  // ---- horde module
  zombot: P('zombot', 'shuffle', { idle: [5, 11], range: [3, 34], stride: 0.9, crowd: true, human: true }),
  hs_enforcer: P('squad1', 'boot', { idle: [7, 14], range: [4, 44], stride: 1.2, human: true }),
  hs_gunner: P('squad2', 'boot', { idle: [7, 14], range: [4, 44], stride: 1.2, human: true }),
  hs_leader: P('squad3', 'boot', { idle: [7, 14], range: [4, 50], stride: 1.25, human: true }),
  doppel: P('doppel', 'boot', { idle: [8, 16], range: [3, 36], stride: 1.15, human: true }),
  collector: P('collector', 'scuttle', { idle: [5, 10], range: [2, 28], stride: 0.5 }),
  janitor: P('janitor', 'wheel', { idle: [7, 14], range: [4, 40], stride: 1.3 }),
  hoardnest: P('nest', 'none', { idle: [8, 15], range: [2, 22] }),
  janitorbin: P('bin', 'none', { idle: [0, 0], range: [2, 20] }),
  // ---- backrooms (their own recorded / br_* sounds stay: keep all events, we add steps + idle)
  br_smiler: P('smiler', 'none', { idle: [8, 16], range: [3, 36], keep: ['alert', 'attack', 'hurt', 'death'] }),
  br_hound: P('palehound', 'paw', { idle: [8, 15], range: [4, 45], stride: 0.9, keep: ['alert', 'chase', 'attack'] }),
  br_partygoer: P('partygoer', 'shoe', { idle: [6, 12], range: [3, 40], stride: 1.1, keep: ['alert', 'attack', 'hurt', 'death'] }),
  br_moth: P('moths', 'none', { idle: [3, 6], range: [3, 30], crowd: true, keep: ['chase'] }),
  // ---- worlds2 outdoor
  dunemaw: P('dunemaw', 'rumble', { idle: [12, 22], range: [10, 110], stride: 3, vol: 1.1 }),
  tuskbeast: P('tusk', 'hoof', { idle: [8, 16], range: [6, 70], stride: 1.8 }),
  scavraider: P('raider', 'boot', { idle: [7, 14], range: [4, 44], stride: 1.15, human: true }),
  alien_npc: P('alien', 'pad', { idle: [6, 12], range: [3, 34], stride: 0.9, human: true }),
  prowler: P('prowler', 'paw', { idle: [9, 16], range: [3, 40], stride: 0.9, sil: 0.6 }),
  // ---- skeletons + external mod creatures
  skel_walker: P('bones', 'bone', { idle: [6, 12], range: [3, 34], stride: 0.9 }),
  skel_archer: P('bones', 'bone', { pitch: 1.25, idle: [6, 12], range: [3, 34], stride: 0.8 }),
  skel_knight: P('boneknight', 'metal', { pitch: 0.8, idle: [7, 14], range: [4, 44], stride: 1.1 }),
  skel_swarm: P('bones', 'bone', { pitch: 1.7, idle: [3, 6], range: [2, 24], stride: 0.35, crowd: true }),
  skeleton: P('skeleton', 'bone', { idle: [6, 12], range: [3, 36], stride: 0.95 }),
  robot: P('secbot', 'metal', { idle: [6, 12], range: [4, 44], stride: 1.2 }),
  // ---- siege minions (models borrowed from base creatures, so the voices are too)
  sg_swarmer: P('spambot', 'skitter', { pitch: 1.15, idle: [3, 7], range: [2, 26], stride: 0.35, crowd: true }),
  sg_runner: P('troll', 'paw', { pitch: 1.3, idle: [6, 12], range: [3, 48], stride: 1.0 }),
  sg_brute: P('slop', 'squelch', { pitch: 0.75, idle: [6, 12], range: [4, 40], stride: 1.1, vol: 1.1 }),
  sg_boss: P('influencer', 'stomp', { pitch: 0.75, idle: [8, 14], range: [8, 100], stride: 2.8, vol: 1.15 }),
  // ---- mirror dimension
  mr_ghost: P('wraith', 'none', { idle: [7, 14], range: [3, 30] }),
  mr_fiend: P('fiend', 'paw', { idle: [6, 12], range: [3, 36], stride: 1.0 }),
  mr_copy: P('deepfake', 'boot', { pitch: 0.9, idle: [8, 15], range: [3, 34], stride: 1.15, human: true }),
  // ---- bosses
  foreman: P('foreman', 'stomp', { idle: [7, 13], range: [8, 100], stride: 2.4, vol: 1.15 }),
  legacybot: P('legacybot', 'stomp', { idle: [7, 13], range: [10, 120], stride: 3.6, vol: 1.15 }),
  loadbalancer: P('loadbalancer', 'none', { idle: [4, 8], range: [6, 80], vol: 1.1 }),
  middlemanager: P('manager', 'shoe', { idle: [6, 12], range: [5, 70], stride: 1.3, human: true, vol: 1.1 }),
  hydra: P('hydra', 'none', { idle: [5, 10], range: [6, 80], vol: 1.1 }),
  hydrahead: P('hydrahead', 'none', { idle: [4, 9], range: [3, 50] }),
  hydrareply: P('hydrareply', 'skitter', { idle: [3, 6], range: [2, 24], stride: 0.35, crowd: true }),
  surgeon: P('surgeon', 'boot', { idle: [7, 13], range: [4, 60], stride: 1.3, human: true, vol: 1.1 }),
  host: P('host', 'bare', { idle: [6, 12], range: [3, 40], stride: 1.4, sil: 0.4, human: true, vol: 1.1 }),
  excavator: P('excavator', 'stomp', { idle: [7, 13], range: [8, 100], stride: 2.6, vol: 1.15 }),
  lobbymanager: P('lobbymgr', 'boot', { idle: [6, 12], range: [4, 70], stride: 1.6, vol: 1.1 }),
  keyholder: P('keyholder', 'scuttle', { idle: [5, 10], range: [4, 50], stride: 1.1 }),
  lbnode: P('lbnode', 'none', { idle: [4, 8], range: [3, 36] }),
  mmpaper: P('paper', 'none', { idle: [4, 8], range: [2, 24] }),
  // ---- gameplay2
  spambomb: P('spambomb', 'none', { idle: [4, 8], range: [3, 40] }),
};

/** creature ids that are registered somewhere in the game (base table + module tables); tests check each has an explicit profile. */
export const KNOWN_TYPES = Object.keys(PROFILES);

// ------------------------------------------------------------------------------------------------ helpers
const EVENT_OF_STATE = {
  dead: 'death',
  attack: 'attack', lunge: 'attack', slam: 'attack', stab: 'attack', snip: 'attack', kick: 'attack', stomp: 'attack', shove: 'attack', grab: 'attack',
  hug: 'attack', latched: 'attack', fire: 'attack', throw: 'attack', tongue: 'attack', bang: 'attack', bark: 'attack', emerge: 'attack', popped: 'attack',
  drag: 'attack', eat: 'attack', charge: 'attack', bite: 'attack',
  roar: 'alert', angry: 'alert', howl: 'alert', scream: 'alert', aim: 'alert', windup: 'alert', morph: 'alert', reveal: 'alert', scan: 'alert',
  posture: 'alert', alert: 'alert', cry: 'alert', crouch: 'alert', primed: 'alert', triggered: 'alert', rumble: 'alert', fall: 'alert', boot: 'alert',
  run: 'chase', running: 'chase', hunt: 'chase', chase: 'chase', stalk: 'chase', fly: 'chase', swarm: 'chase',
  stunned: 'hurt', stagger: 'hurt', collapsed: 'hurt',
};
// states in which a creature is "unaware and around": ambient vocalisations + footsteps
const IDLE_STATES = new Set(['idle', 'walk', 'patrol', 'wander', 'lurk', 'sniff', 'sneak', 'flee', 'retreat', 'orbit', 'hop', 'dance', 'home', 'return', 'ceiling', 'calm',
  'rest', 'wave', 'follow', 'hesitate', 'active', 'lit', 'armed', 'talk', 'lost', 'hide', 'box_walk']);
const MOVING_STATES = new Set(['walk', 'patrol', 'wander', 'lurk', 'sneak', 'flee', 'retreat', 'home', 'return', 'run', 'running', 'hunt', 'chase', 'stalk', 'follow', 'charge', 'box_walk', 'hop', 'rise', 'lunge', 'swarm', 'orbit']);
export const stateEvent = (state) => EVENT_OF_STATE[state] || null;
export const isIdleState = (state) => IDLE_STATES.has(state);
export const isMovingState = (state) => MOVING_STATES.has(state);

/** minimum seconds between two sounds of one event on one creature */
export const EVENT_COOLDOWN = { idle: 4, alert: 1.2, chase: 3.2, attack: 0.35, hurt: 0.3, death: 0, step: 0 };
/** playback level of each event (1 = full) and how far it carries relative to the profile range */
export const EVENT_VOL = { idle: 0.55, alert: 1, chase: 0.8, attack: 1, hurt: 0.85, death: 1, step: 0.55 };
export const EVENT_REACH = { idle: 0.55, alert: 1, chase: 0.8, attack: 0.9, hurt: 0.6, death: 0.9, step: 0.35 };
/** global (all creatures of one type) minimum gap for the same event: swarms must not become a wall of noise */
export const CROWD_GAP = { idle: 0.9, alert: 0.5, chase: 1.1, attack: 0.18, hurt: 0.12, death: 0.08, step: 0.06 };

/** A complete profile for any creature type; falls back to size / stats guesses for unknown ones. */
export function profileFor(type, def = null) {
  const p = PROFILES[type];
  if (p) return p;
  const d = def || {};
  const big = (d.height || 1.5) > 3.5 || (d.radius || 0.5) > 1.2;
  const hazard = d.hazard || (d.walk == null && d.run == null);
  const boss = !!d.boss;
  const arch = boss || big ? 'influencer' : hazard ? 'turret' : (d.hp ?? 100) > 150 ? 'troll' : (d.hp ?? 100) < 50 ? 'spambot' : 'deepfake';
  return P(arch, boss || big ? 'stomp' : hazard ? 'none' : (d.height || 1.5) < 0.8 ? 'skitter' : 'boot', {
    idle: hazard ? [6, 12] : [8, 16], range: boss || big ? [8, 100] : [3, 40], stride: big ? 3 : 1.1, fallback: true,
  });
}

/** pure: seeded per-creature variation {pitch, gap} so two creatures of one type do not sound identical (stable per creature id) */
export function creatureSeed(id, type) {
  let h = 2166136261;
  for (const c of `${type}:${id}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  h >>>= 0;
  const r = (n) => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296 * n; };
  return { pitch: 0.92 + r(0.16), gap: 0.85 + r(0.3), phase: r(1), r };
}
