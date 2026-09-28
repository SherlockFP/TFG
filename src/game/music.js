// Playable musical instruments (module `music`): Acoustic Guitar, Electric Guitar, Keytar, Drum Pad.
// Installed with  this.useModule('music', installMusic)  in game.js. Docs + controls table: docs/wave2/music.md.
//
//   Hold an instrument, LMB = PLAY MODE (third-person emote camera, movement locked, strapped-on instrument visible to everybody).
//   Keys are captured in the window capture phase while playing, so notes are event-driven (no frame latency) and nothing
//   else (drop, flashlight, hotbar, ping, emote wheel...) sees them. ESC / Backspace / getting hurt / opening a panel ends it.
//   Network: one tiny message type 'mu' = { e: [[instr, note|chordId|pad, velocity, flags], ...] }, rate limited per player,
//   synthesised on every receiver at the player's position (HRTF panner, distance falloff, occlusion lowpass).
//   Game hooks: playing indoors on a moon is NOISE (game.balance.noise), AI Slop is calmed by music (hostBoomboxNear wrapper),
//   JAM SESSION chip + capped XP when 2+ players play within 8 m in the ship / at HQ, songbook follow-along with accuracy + capped XP.
import { registerItem, ITEMS, SCRAP_TABLE } from './items.js';
import { addTranslations, t } from '../core/i18n.js';
import { EMOTE_BY_ID } from './emotes.js';
import { createEngine } from '../audio/instruments.js';
import { registerInstrumentModels, createInstrumentMesh, disposeInstrumentMesh, INSTRUMENT_POSE } from '../models/instruments.js';
import { createMusicPanel } from '../ui/musicpanel.js';
import { hudDock } from '../ui/dock.js';
import * as SB from './songbook.js';

const { INSTRUMENTS, INSTRUMENT_BY_ITEM, F_CHORD, F_UP, F_ALT, F_SUS } = SB;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MSG = 'mu', REQ_SONG = 'musong';
const SEND_RATE = { rate: 16, burst: 28 }, RECV_RATE = { rate: 22, burst: 40 };
const HEAR_MAX = 62;                       // m: farther than this a remote player's notes are not synthesised at all
const NOISE_EVERY = 1600;                  // ms between creature-noise events while playing
const JAM_WINDOW = 4000, JAM_RADIUS = 8, JAM_XP_EVERY = 20, JAM_DAY_CAP = 4, SONG_DAY_CAP = 3;

// ------------------------------------------------------------------ content (module level, idempotent)
const ITEM_DEFS = [
  { id: 'guitar_acoustic', name: 'Acoustic Guitar', value: [40, 80], weight: 5, price: 90, tier: 'uncommon', tip: 'LMB to play. Keys 1-8 = chords (SHIFT = variants), LMB / Space / wheel = strum, Q = lead notes.' },
  { id: 'guitar_electric', name: 'Electric Guitar', value: [90, 150], weight: 6, price: 210, tier: 'rare', tip: 'LMB to play. Power chords through a tube amp. Loud: creatures hear it.' },
  { id: 'keytar', name: 'Keytar', value: [100, 170], weight: 7, price: 235, tier: 'rare', tip: 'LMB to play. A S D F... = piano keys (W E T Y U sharps), 1-7 = scales, Q = synth / e-piano, Space = sustain.' },
  { id: 'drumpad', name: 'Drum Pad', value: [30, 60], weight: 4, price: 65, tier: 'common', tip: 'LMB to play. A S D F J K L ; = pads, LMB = snare, RMB = kick.' },
];
// rare finds, weighted by interior theme (weights are small next to the ~100-150 total of a scrap table)
const LOOT = {
  factory: [['guitar_electric', 1], ['drumpad', 2], ['keytar', 1]],
  mansion: [['guitar_acoustic', 3], ['keytar', 1]],
  mineshaft: [['guitar_acoustic', 2], ['drumpad', 1]],
  office: [['keytar', 2], ['drumpad', 1], ['guitar_electric', 1]],
  backrooms: [['keytar', 2], ['guitar_acoustic', 1]],
  serverfarm: [['keytar', 2], ['guitar_electric', 2]],
  sewer: [['drumpad', 2], ['guitar_acoustic', 1]],
  hospital: [['guitar_acoustic', 1], ['keytar', 1]],
};
const KEY_CODES = new Set([...Object.keys(SB.PIANO_KEYS), ...SB.SCALE_HOME, ...SB.SCALE_TOP, ...Object.keys(SB.DRUM_KEYS),
  ...Array.from({ length: 10 }, (_, i) => 'Digit' + i), 'Space', 'KeyZ', 'KeyX', 'KeyQ', 'KeyB', 'KeyR', 'BracketLeft', 'BracketRight']);

const PAD_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'];
const PAD_COLORS = ['#ff5a5a', '#ffd23f', '#5ad8ff', '#5ad8ff', '#7dff9a', '#7dff9a', '#c48bff', '#ff8ad8'];

addTranslations({
  'Instrument volume': 'Enstrüman sesi',
  'Acoustic Guitar': 'Akustik Gitar', 'Electric Guitar': 'Elektro Gitar', Keytar: 'Klavyeli Gitar (Keytar)', 'Drum Pad': 'Davul Pedi', Music: 'Müzik',
  'LMB to play. Keys 1-8 = chords (SHIFT = variants), LMB / Space / wheel = strum, Q = lead notes.': 'Sol tık ile çal. 1-8 = akorlar (SHIFT = varyasyon), sol tık / Space / tekerlek = çalma, Q = tek nota.',
  'LMB to play. Power chords through a tube amp. Loud: creatures hear it.': 'Sol tık ile çal. Lambalı amfiden power akorlar. Gürültülü: yaratıklar duyar.',
  'LMB to play. A S D F... = piano keys (W E T Y U sharps), 1-7 = scales, Q = synth / e-piano, Space = sustain.': 'Sol tık ile çal. A S D F... = piyano tuşları (W E T Y U diyez), 1-7 = ölçüler, Q = synth / e-piyano, Space = sustain.',
  'LMB to play. A S D F J K L ; = pads, LMB = snare, RMB = kick.': 'Sol tık ile çal. A S D F J K L ; = pedler, sol tık = trampet, sağ tık = kick.',
  '[LMB] Play {n}': '[Sol tık] {n} çal', 'ESC / Backspace = stop': 'ESC / Backspace = bırak', LOUD: 'GÜRÜLTÜ', CHORD: 'AKOR', LEAD: 'TEK NOTA', PIANO: 'PİYANO',
  'Piano (chromatic)': 'Piyano (kromatik)', Major: 'Majör', Minor: 'Minör', Pentatonic: 'Pentatonik', Blues: 'Blues', 'Harmonic minor': 'Harmonik minör', Dorian: 'Dorian',
  SYNTH: 'SENTEZ', 'E-PIANO': 'E-PİYANO', SUSTAIN: 'SUSTAIN', 'JAM SESSION': 'JAM SEANSI', DONE: 'BİTTİ', Kick: 'Kick', Snare: 'Trampet', 'Hi-hat': 'Hi-hat', 'Open hat': 'Açık hat',
  Tom: 'Tom', 'Mid tom': 'Orta tom', 'Floor tom': 'Yer tomu', Crash: 'Crash',
  'Keys 1-8 chords (SHIFT = variants) · LMB / Space / wheel = strum · Q = lead notes · Z / X = octave · 0 = songbook': 'Tuş 1-8 akor (SHIFT = varyasyon) · sol tık / Space / tekerlek = çal · Q = tek nota · Z / X = oktav · 0 = şarkı defteri',
  'A S D F... = notes (W E T Y U O P sharps) · Q = chords · Z / X = octave · 0 = songbook · [ ] = song': 'A S D F... = notlar (W E T Y U O P diyez) · Q = akor · Z / X = oktav · 0 = şarkı defteri · [ ] = şarkı',
  '1-7 scale · A S D F... notes · Q synth / e-piano · Space sustain · Z / X octave · 0 songbook · [ ] song': '1-7 ölçü · A S D F... notlar · Q synth / e-piyano · Space sustain · Z / X oktav · 0 şarkı defteri · [ ] şarkı',
  'A S D F J K L ; or 1-8 = pads · LMB snare · RMB kick · Space kick · wheel hi-hat': 'A S D F J K L ; veya 1-8 = pedler · sol tık trampet · sağ tık kick · Space kick · tekerlek hi-hat',
  'play the next note': 'sıradaki notayı çal', 'Songbook: {n}': 'Şarkı defteri: {n}', 'Songbook off': 'Şarkı defteri kapalı', 'No songs for the drum pad.': 'Davul pedi için şarkı yok.',
  '{s}: {p}% accuracy': '{s}: %{p} doğruluk', 'You were startled!': 'Irkildin!', 'Cannot play right now.': 'Şu an çalınamaz.', 'Jam session! +{x} XP': 'Jam seansı! +{x} XP',
  'Song played': 'Şarkı çalındı', 'Jam session': 'Jam seansı',
});

let registered = false;
function registerContent() {
  if (registered) return;
  registered = true;
  for (const d of ITEM_DEFS) if (!ITEMS[d.id]) registerItem({ ...d, kind: 'scrap', hands: 1, shop: 'music' });
  for (const [theme, list] of Object.entries(LOOT)) {
    const tbl = SCRAP_TABLE[theme];
    if (tbl && !tbl.some((e) => e[0] === list[0][0])) for (const e of list) tbl.push([e[0], e[1]]);
  }
  // one emote per instrument: gives the third-person camera, the avatar pose and the network state (ps.e = 'x:mu_gac') for free
  for (const ins of INSTRUMENTS) {
    EMOTE_BY_ID['mu_' + ins.id] = {
      id: 'mu_' + ins.id, name: ins.name, icon: '🎸', base: ins.kind === 'drums' ? 'sit' : null, dur: 36000, face: 'happy', musicItem: ins.item,
      fx(a, root, tt) { playFx(a, root, tt, ins); },
    };
  }
}

// ------------------------------------------------------------------ avatar animation (runs for local + remote avatars, from the emote fx hook)
const HIT_MS = 170;
function armsOf(a) {
  const hl = a.parts?.handL, hr = a.parts?.handR;
  return { L: hl && { el: hl.parent, sh: hl.parent?.parent }, R: hr && { el: hr.parent, sh: hr.parent?.parent } };
}
const pulseOf = (m, k = 'hit') => (m && m[k] ? Math.exp(-(performance.now() - m[k]) / HIT_MS) : 0);
function playFx(a, root, tt, ins) {
  const m = a._mu, { L, R } = armsOf(a), p = pulseOf(m), pl = pulseOf(m, 'hitL'), pr = pulseOf(m, 'hitR');
  const neck = a.parts?.neck, torso = a.parts?.torso;
  const bob = Math.sin(tt * 3.2) * 0.02;
  if (neck) neck.rotation.x += 0.05 + p * 0.16;
  if (torso) { torso.rotation.z += bob + (m?.side ? 0.04 : -0.04) * p; torso.rotation.x += p * 0.05; }
  root.position.y += p * 0.025;
  if (ins.kind === 'chord') {
    if (L?.sh) { L.sh.rotation.set(-1.15, 0, 0.55); L.el.rotation.x = -0.4 - pl * 0.1; }                    // fretting hand up the neck
    if (R?.sh) { R.sh.rotation.set(-0.55 + (m?.up ? -1 : 1) * p * 0.55, 0, -0.3); R.el.rotation.x = -1.15 + p * 0.35; }   // strumming arm
  } else if (ins.kind === 'keys') {
    if (L?.sh) { L.sh.rotation.set(-1.05 - pl * 0.22, 0, 0.18); L.el.rotation.x = -0.95 + pl * 0.2; }
    if (R?.sh) { R.sh.rotation.set(-1.05 - pr * 0.22, 0, -0.18); R.el.rotation.x = -0.95 + pr * 0.2; }
  } else {
    if (L?.sh) { L.sh.rotation.set(-1.0 - pl * 0.5, 0, 0.2); L.el.rotation.x = -0.7 + pl * 0.3; }
    if (R?.sh) { R.sh.rotation.set(-1.0 - pr * 0.5, 0, -0.2); R.el.rotation.x = -0.7 + pr * 0.3; }
  }
}
function markHit(avatar, ev) {
  if (!avatar) return;
  const m = avatar._mu || (avatar._mu = { side: 0, up: false });
  const now = performance.now();
  m.hit = now; m.side ^= 1;
  m[m.side ? 'hitR' : 'hitL'] = now;
  m.up = !!(ev[3] & F_UP) && !!(ev[3] & F_CHORD);
}

// ------------------------------------------------------------------ install
export function installMusic(game) {
  registerContent();
  const mods = game.mods, offs = [];
  const on = (ev, fn) => { if (mods?.on) offs.push(mods.on(ev, fn)); };
  let disposed = false;
  registerInstrumentModels();

  const st = {
    playing: false, inst: null, item: null, def: null, mode: 'chord', octave: 4, chordOct: 0, chordSlot: 0, scale: 0, patch: 'synth', sustain: false, shift: false,
    prevFrozen: false, wasLocked: false, lastWheel: 0, lastNoise: 0, noiseDue: false, hurtGrace: 0, viewSig: '',
    guide: { on: false, songIdx: 0, idx: 0, hits: 0, misses: 0, done: false, bad: 0 },
    jam: [], jamT: {}, jamCalc: 0, hostTick: 0, hintKey: '', voiceGc: 0,
  };
  const sendLimiter = SB.createRateLimiter(SEND_RATE);
  const recvLimiters = new Map();
  const recent = new Map();                       // peer id -> { t, pos:[x,y,z], ts:[ms...] } (jam + noise bookkeeping, every peer)
  const attached = new Map();                     // avatar -> { item, mesh }
  const grants = new Map();                       // host: 'day|id|kind' -> count
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, ms); timers.add(id); };
  const me = () => game.selfId;

  // ---------------------------------------------------------------- audio graph (created lazily: needs the unlocked AudioContext)
  let au = null;
  const vol = () => clamp(Number(game.settings?.instrumentVolume ?? 0.8), 0, 1.5);
  function ensureAudio() {
    const a = game.audio, ctx = a?.ctx;
    if (!ctx || !a.master) return false;
    if (au && au.ctx === ctx) return true;
    au = null;
    const bus = ctx.createGain();
    bus.gain.value = vol();
    bus.connect(a.master);
    if (a.reverb) { const send = ctx.createGain(); send.gain.value = 0.2; bus.connect(send).connect(a.reverb); }
    const local = ctx.createGain();
    local.connect(bus);
    au = { ctx, bus, local, eng: createEngine(ctx), voices: new Map(), vol: vol() };
    return true;
  }
  function voiceFor(id) {
    let v = au.voices.get(id);
    if (v) return v;
    const ctx = au.ctx;
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(), pan = ctx.createPanner();
    lp.type = 'lowpass'; lp.frequency.value = 18000;
    pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 3.5; pan.maxDistance = 70; pan.rolloffFactor = 1.15;
    g.connect(lp).connect(pan).connect(au.bus);
    v = { g, lp, pan };
    au.voices.set(id, v);
    return v;
  }
  function placeVoice(v, pos) {
    const x = pos.x, y = pos.y + 1.2, z = pos.z, tt = au.ctx.currentTime;
    if (v.pan.positionX) { v.pan.positionX.setValueAtTime(x, tt); v.pan.positionY.setValueAtTime(y, tt); v.pan.positionZ.setValueAtTime(z, tt); }
    else v.pan.setPosition(x, y, z);
    let occ = 0;
    try { occ = game.audio.occluder?.({ x, y, z }) || 0; } catch { /* optional */ }
    v.lp.frequency.setTargetAtTime(occ > 0.5 ? 900 : occ > 0 ? 2600 : 18000, tt, 0.05);
  }
  /** synthesise one wire event into `dest` */
  function synth(ev, dest, when = 0) {
    if (!au) return;
    const [code, n, vel, f] = ev, ins = INSTRUMENTS[code], eng = au.eng;
    if (ins.kind === 'drums') eng.drum(n, vel, { dest, when });
    else if (f & F_CHORD) {
      const c = SB.decodeChord(n);
      if (c) eng.strum(ins.voice, SB.chordNotes(c.root, c.q, c.oct, ins.voicing), vel, { dest, when, up: !!(f & F_UP) });
    } else if (ins.kind === 'chord') eng.note(ins.voice, n, vel, { dest, when, feedback: true });
    else eng.note('synth', n, vel, { dest, when, piano: !!(f & F_ALT), sustain: !!(f & F_SUS) });
  }

  // ---------------------------------------------------------------- bookkeeping (jam session, host hearing)
  function seen(id, pos) {
    const now = performance.now();
    let r = recent.get(id);
    if (!r) recent.set(id, r = { t: now, pos: [0, 0, 0], ts: [] });
    r.t = now; r.pos = [pos.x, pos.y, pos.z];
    r.ts.push(now);
    while (r.ts.length && now - r.ts[0] > JAM_WINDOW) r.ts.shift();
    if (r.ts.length > 40) r.ts.splice(0, r.ts.length - 40);
  }
  function jamIds() {
    const now = performance.now();
    return SB.jamGroup([...recent].map(([id, r]) => ({ id, pos: r.pos, t: r.t, n: r.ts.filter((x) => now - x < JAM_WINDOW).length })), now, { windowMs: JAM_WINDOW, radius: JAM_RADIUS, minNotes: 3 });
  }
  const musicNear = (pos, r) => { const now = performance.now(); for (const v of recent.values()) if (now - v.t < 3500 && Math.hypot(v.pos[0] - pos.x, v.pos[1] - pos.y, v.pos[2] - pos.z) < r) return true; return false; };

  // ---------------------------------------------------------------- sending / local events
  const outQ = [];
  let flushPending = false;
  function flush() {
    flushPending = false;
    while (outQ.length) game.net?.send?.(MSG, { e: outQ.splice(0, SB.MU_MAX_BATCH) });
  }
  function emit(ev) {
    if (!st.playing || !sendLimiter.allow(performance.now())) return false;
    if (!ensureAudio()) game.audio?.resume?.();
    else { if (au.ctx.state === 'suspended') game.audio.resume?.(); synth(ev, au.local, 0); }
    outQ.push(ev);
    if (!flushPending) { flushPending = true; queueMicrotask(flush); }
    markHit(game.emotes?.avatar, ev);
    seen(me(), game.player.pos);
    st.noiseDue = true;
    mods?.emit('tfg:music', { by: me(), instrument: st.inst.id, ev }, game);
    return true;
  }
  function noiseTick() {
    const now = performance.now(), p = game.player;
    if (!st.noiseDue || now - st.lastNoise < NOISE_EVERY) return;
    st.noiseDue = false;
    if (p.inShip || game.run?.phase !== 'moon') return;             // the ship and HQ are safe stages
    st.lastNoise = now;
    const amt = st.inst.noise * (p.indoor ? 1 : 0.7);
    try { if (game.balance?.noise) game.balance.noise(p.eyePos(), amt); else game.net?.request?.('noise', { p: p.eyePos().toArray(), loud: amt }); } catch (e) { console.warn('[music] noise', e); }
  }

  // ---------------------------------------------------------------- playing
  const insCode = () => st.inst.code;
  function playNoteKey(code, accent) {
    const ins = st.inst;
    let n = SB.keyToMidi(code, st.octave, ins.kind === 'keys' ? st.scale : 0);
    if (n == null || n < ins.range[0] || n > ins.range[1]) return;
    const f = ins.kind === 'keys' ? (st.patch === 'piano' ? F_ALT : 0) | (st.sustain ? F_SUS : 0) : 0;
    if (emit([insCode(), n, accent ? 118 : 96, f])) { panel.press(code); judge(n); }
  }
  function strum(up, vel = 100) {
    const s = st.shift ? SB.CHORD_SLOTS_SHIFT[st.chordSlot] : SB.CHORD_SLOTS[st.chordSlot];
    strumChord(s.root, s.q, up, vel);
  }
  function strumChord(root, q, up, vel = 100) {
    emit([insCode(), SB.encodeChord(root, q, st.chordOct), vel, F_CHORD | (up ? F_UP : 0)]);
  }
  function selectChord(i) {
    st.chordSlot = i;
    const s = st.shift ? SB.CHORD_SLOTS_SHIFT[i] : SB.CHORD_SLOTS[i];
    panel.press(SB.CHORD_SLOTS[i].key); panel.setChordCurrent(SB.CHORD_SLOTS[i].key);
    strumChord(s.root, s.q, false, 104);
  }
  function hitPad(pad, vel = 104) { if (emit([insCode(), pad, vel, 0])) panel.pressPad(pad); }
  function shiftOctave(d) {
    const ins = st.inst;
    if (ins.kind === 'chord' && st.mode === 'chord') st.chordOct = clamp(st.chordOct + d, -1, 1);
    else if (ins.kind === 'drums') return;
    else st.octave = clamp(st.octave + d, ins.kind === 'keys' ? 1 : 2, ins.kind === 'keys' ? 6 : 5);
    refreshView(true);
  }
  function toggleMode() {
    const ins = st.inst;
    if (ins.kind === 'chord') { st.mode = st.mode === 'chord' ? 'lead' : 'chord'; if (st.mode === 'chord') guideOff(); }
    else if (ins.kind === 'keys') st.patch = st.patch === 'synth' ? 'piano' : 'synth';
    refreshView(true);
  }
  function setScale(i) { if (st.inst.kind !== 'keys' || i < 0 || i >= SB.SCALES.length) return; st.scale = i; if (i !== 0) guideOff(); refreshView(true); }

  // ---------------------------------------------------------------- songbook (follow along: play the highlighted note; any octave counts)
  const song = () => SB.SONGS[st.guide.songIdx];
  function bestOctave(s) {
    let best = st.octave, bestN = -1;
    for (let o = st.inst.kind === 'keys' ? 1 : 2; o <= (st.inst.kind === 'keys' ? 6 : 5); o++) {
      let c = 0; for (const [m] of s.notes) if (SB.midiToKey(m, o, 0)) c++;
      if (c > bestN) { bestN = c; best = o; }
    }
    return best;
  }
  function guideOn() {
    const ins = st.inst;
    if (ins.kind === 'drums') { game.ui.toast(t('No songs for the drum pad.')); return; }
    if (ins.kind === 'chord') st.mode = 'lead';
    if (ins.kind === 'keys') st.scale = 0;
    Object.assign(st.guide, { on: true, idx: 0, hits: 0, misses: 0, done: false, bad: 0 });
    st.octave = bestOctave(song());
    game.ui.toast(t('Songbook: {n}').replace('{n}', song().title), 'info');
    refreshView(true);
  }
  function guideOff() { if (!st.guide.on) return; st.guide.on = false; }
  function toggleGuide() { if (st.guide.on) { guideOff(); game.ui.toast(t('Songbook off')); refreshView(true); } else guideOn(); }
  function cycleSong(d) {
    st.guide.songIdx = (st.guide.songIdx + d + SB.SONGS.length) % SB.SONGS.length;
    if (st.guide.on) guideOn(); else { Object.assign(st.guide, { idx: 0, hits: 0, misses: 0, done: false }); }
  }
  function judge(midi) {
    const g = st.guide;
    if (!g.on || g.done) return;
    const s = song(), j = SB.judgeNote(s, g.idx, midi);
    if (j.hit) {
      g.hits++; g.idx++;
      if (g.idx >= s.notes.length) finishSong();
    } else { g.misses++; g.bad = performance.now(); }
  }
  function finishSong() {
    const g = st.guide, acc = SB.accuracy(g.hits, g.misses);
    g.done = true;
    game.ui.toast(t('{s}: {p}% accuracy').replace('{s}', song().title).replace('{p}', Math.round(acc * 100)), 'good');
    game.audio?.ui?.('ui_levelup', 0.5);
    if (acc >= 0.7) game.net?.request?.(REQ_SONG, { sid: song().id, acc: +acc.toFixed(3) });
    later(() => { if (st.guide.on && st.guide.done) Object.assign(st.guide, { idx: 0, hits: 0, misses: 0, done: false }); }, 3200);
  }
  function songView() {
    const g = st.guide;
    if (!g.on || !st.playing) return null;
    const s = song(), from = Math.max(0, g.idx - 1), lo = SB.keyToMidi('KeyA', st.octave, 0);
    const notes = [];
    for (let i = from; i < Math.min(s.notes.length, from + 9); i++) {
      const m = s.notes[i][0], k = SB.midiToKey(m, st.octave, 0);
      notes.push({ name: SB.noteName(m), key: k ? SB.KEY_LABEL[k] : (m < lo ? 'Z <' : '> X'), state: i < g.idx ? 'done' : i === g.idx ? 'cur' : 'next' });
    }
    return { title: `${g.songIdx + 1}/${SB.SONGS.length} ${s.title}`, pos: Math.min(g.idx, s.notes.length), total: s.notes.length, acc: g.hits + g.misses ? SB.accuracy(g.hits, g.misses) : null, done: g.done, notes, hint: g.done ? '' : 'play the next note', bad: performance.now() - g.bad < 220 ? 1 : 0 };
  }

  // ---------------------------------------------------------------- panel / view model
  const panel = createMusicPanel();
  const jamBox = hudDock('right', 'mu_jam', 12);
  jamBox.style.display = 'none';
  const hintBox = hudDock('bottom', 'mu_hint', 31);
  hintBox.style.display = 'none';
  const hintStyle = 'font-family:var(--font,monospace);color:#ffd9a0;background:rgba(10,6,3,.7);border:1px solid rgba(255,170,80,.4);padding:3px 10px;font-size:14px;letter-spacing:1px';

  function pianoKeys(oct, scaleIdx) {
    const whites = [], blacks = [];
    const offs = [['KeyA', 0], ['KeyS', 2], ['KeyD', 4], ['KeyF', 5], ['KeyG', 7], ['KeyH', 9], ['KeyJ', 11], ['KeyK', 12], ['KeyL', 14], ['Semicolon', 16]];
    for (const [c] of offs) whites.push({ code: c, label: SB.KEY_LABEL[c], note: SB.noteName(SB.keyToMidi(c, oct, scaleIdx)) });
    for (const [c, o] of [['KeyW', 1], ['KeyE', 3], ['KeyT', 6], ['KeyY', 8], ['KeyU', 10], ['KeyO', 13], ['KeyP', 15]]) {
      blacks.push({ code: c, label: SB.KEY_LABEL[c], note: SB.noteName(SB.keyToMidi(c, oct, scaleIdx)), black: true, after: offs.findIndex(([, w]) => w === o - 1) });
    }
    return [...whites, ...blacks];
  }
  function buildView() {
    const ins = st.inst;
    if (!ins) return null;
    const chips = [];
    const v = { name: ins.name, kind: ins.kind, chips, hint: '' };
    const phaseMoon = moonLoud();
    if (ins.kind === 'chord' && st.mode === 'chord') {
      chips.push({ text: 'CHORD' }, { text: `OCT ${st.chordOct > 0 ? '+' : ''}${st.chordOct}` });
      v.chords = SB.CHORD_SLOTS.map((s, i) => ({ code: s.key, name: SB.chordName(s.root, s.q), alt: SB.chordName(SB.CHORD_SLOTS_SHIFT[i].root, SB.CHORD_SLOTS_SHIFT[i].q), cur: i === st.chordSlot }));
      v.hint = 'Keys 1-8 chords (SHIFT = variants) · LMB / Space / wheel = strum · Q = lead notes · Z / X = octave · 0 = songbook';
    } else if (ins.kind === 'chord') {
      chips.push({ text: 'LEAD' }, { text: `OCT ${st.octave}` });
      v.piano = pianoKeys(st.octave, 0);
      v.hint = 'A S D F... = notes (W E T Y U O P sharps) · Q = chords · Z / X = octave · 0 = songbook · [ ] = song';
    } else if (ins.kind === 'keys') {
      const sc = SB.SCALES[st.scale];
      chips.push({ text: sc.steps ? sc.name : 'PIANO' }, { text: st.patch === 'piano' ? 'E-PIANO' : 'SYNTH' }, { text: `OCT ${st.octave}` });
      if (st.sustain) chips.push({ text: 'SUSTAIN' });
      if (!sc.steps) v.piano = pianoKeys(st.octave, 0);
      else {
        const row = (codes) => codes.map((c) => ({ code: c, label: SB.KEY_LABEL[c], note: SB.noteName(SB.keyToMidi(c, st.octave, st.scale)) }));
        v.rows = [row(SB.SCALE_TOP), row(SB.SCALE_HOME)];
      }
      v.hint = '1-7 scale · A S D F... notes · Q synth / e-piano · Space sustain · Z / X octave · 0 songbook · [ ] song';
    } else {
      v.pads = SB.DRUM_PADS.map((p, i) => ({ idx: i, name: p.name, code: PAD_KEYS[i], label: SB.KEY_LABEL[PAD_KEYS[i]], color: PAD_COLORS[i] }));
      v.hint = 'A S D F J K L ; or 1-8 = pads · LMB snare · RMB kick · Space kick · wheel hi-hat';
    }
    if (phaseMoon) chips.push({ text: 'LOUD', cls: 'warn' });
    if (st.jam.length > 1 && st.jam.includes(me())) chips.push({ text: `JAM SESSION x${st.jam.length}`, cls: 'jam' });
    return v;
  }
  const moonLoud = () => game.run?.phase === 'moon' && !game.player.inShip;
  const viewSig = () => [st.inst.id, st.mode, st.octave, st.chordOct, st.scale, st.patch, st.sustain, moonLoud(), st.jam.length > 1 && st.jam.includes(me()) ? st.jam.length : 0, st.chordSlot].join('|');
  function refreshView(force) {
    if (!st.playing) return;
    const sig = viewSig();
    if (!force && sig === st.viewSig) return;
    st.viewSig = sig;
    const v = buildView();
    v.sig = sig;
    panel.render(v, true);
  }

  // ---------------------------------------------------------------- input capture (play mode only)
  const swallow = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
  const typing = () => { try { return !!game.input?.isTyping?.(); } catch { return false; } };
  function onKeyDown(e) {
    if (!st.playing || typing()) return;
    if (e.code === 'Backspace') { swallow(e); exit('key'); return; }
    if (!KEY_CODES.has(e.code)) { if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { st.shift = true; panel.setShift(true); } return; }
    swallow(e);
    if (e.repeat) return;
    st.shift = !!e.shiftKey; panel.setShift(st.shift);
    handleKey(e.code, !!e.shiftKey);
  }
  function onKeyUp(e) {
    if (!st.playing) return;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { st.shift = false; panel.setShift(false); return; }
    if (!KEY_CODES.has(e.code)) return;
    game.input?.down?.delete(e.code);                      // a key held when play mode began must not stay "down" for the game
    if (e.code === 'Space') st.sustain = false;
    swallow(e);
  }
  function onMouseDown(e) {
    if (!st.playing || (e.button !== 0 && e.button !== 2) || typing()) return;
    swallow(e);
    const ins = st.inst;
    if (ins.kind === 'chord') strum(e.button === 2, 100);
    else if (ins.kind === 'drums') hitPad(e.button === 2 ? 0 : 1, 108);
  }
  function onWheel(e) {
    if (!st.playing) return;
    e.stopImmediatePropagation();
    const now = performance.now(), ins = st.inst;
    if (ins.kind === 'chord') { if (now - st.lastWheel < 70) return; st.lastWheel = now; strum(e.deltaY < 0, 78); }
    else if (ins.kind === 'drums') { if (now - st.lastWheel < 60) return; st.lastWheel = now; hitPad(2, 84); }
    else if (now - st.lastWheel > 260) { st.lastWheel = now; shiftOctave(e.deltaY < 0 ? 1 : -1); }
  }
  function handleKey(code, shift) {
    const ins = st.inst;
    switch (code) {
      case 'KeyZ': shiftOctave(-1); return;
      case 'KeyX': shiftOctave(1); return;
      case 'KeyQ': toggleMode(); return;
      case 'Digit0': toggleGuide(); return;
      case 'BracketLeft': cycleSong(-1); return;
      case 'BracketRight': cycleSong(1); return;
      case 'Space':
        if (ins.kind === 'chord') strum(false, 100);
        else if (ins.kind === 'drums') hitPad(0, 108);
        else { st.sustain = true; refreshView(); }
        return;
      default: break;
    }
    if (ins.kind === 'drums') { if (code in SB.DRUM_KEYS) hitPad(SB.DRUM_KEYS[code], shift ? 122 : 104); return; }
    if (ins.kind === 'chord' && st.mode === 'chord') { const i = SB.CHORD_SLOTS.findIndex((s) => s.key === code); if (i >= 0) selectChord(i); return; }
    if (ins.kind === 'keys' && /^Digit[1-7]$/.test(code)) { setScale(Number(code.slice(5)) - 1); return; }
    if (code in SB.PIANO_KEYS || SB.SCALE_HOME.includes(code) || SB.SCALE_TOP.includes(code)) playNoteKey(code, shift);
  }

  const capture = { capture: true };
  let listening = false;
  function listen(on_) {
    if (on_ === listening) return;
    listening = on_;
    const f = on_ ? 'addEventListener' : 'removeEventListener';
    window[f]('keydown', onKeyDown, capture); window[f]('keyup', onKeyUp, capture);
    window[f]('mousedown', onMouseDown, capture); window[f]('wheel', onWheel, { capture: true, passive: true });
  }

  // pre-render the guitar strings of every chord slot in idle slices, so the first strum does not hitch the frame
  function warm() {
    const ins = st.inst;
    if (!au || !ins || ins.kind !== 'chord') return;
    const list = [], have = new Set();
    for (const slots of [SB.CHORD_SLOTS, SB.CHORD_SLOTS_SHIFT]) for (const s of slots) for (const n of SB.chordNotes(s.root, s.q, 0, ins.voicing)) if (!have.has(n)) { have.add(n); list.push(n); }
    let i = 0;
    const step = () => {
      if (!st.playing || !au || st.inst !== ins) return;
      for (let k = 0; k < 2 && i < list.length; k++) { try { au.eng.ksBuffer(ins.voice, list[i++]); } catch { i = list.length; } }
      if (i < list.length) later(step, 40);
    };
    later(step, 30);
  }

  // ---------------------------------------------------------------- enter / exit
  function canPlay() {
    const p = game.player;
    return !!p && !p.dead && p.grounded !== false && !game.minigame && !game.terminal?.active && !game.cruiser?.seated && !game.emotes?.current && !game.ui?.blocksInput?.();
  }
  function enter(it) {
    const ins = it && INSTRUMENT_BY_ITEM[it.type];
    if (!ins || st.playing) return false;
    if (!canPlay()) { game.ui.toast(t('Cannot play right now.')); return false; }
    const def = EMOTE_BY_ID['mu_' + ins.id], p = game.player;
    game.emotes.play(def);
    if (game.emotes.current !== def) return false;
    Object.assign(st, { playing: true, inst: ins, item: it, def, mode: ins.kind === 'chord' ? 'chord' : 'lead', octave: ins.baseOct, chordOct: 0, scale: 0, sustain: false, shift: false, wasLocked: !!game.input?.locked, hurtGrace: performance.now() + 400 });
    st.prevFrozen = !!p.frozen;
    p.frozen = true;
    p.vel?.set?.(0, p.vel.y, 0);
    for (const c of KEY_CODES) game.input?.down?.delete(c);
    sendLimiter.reset();
    game.audio?.resume?.(); ensureAudio(); warm();
    listen(true);
    panel.show(); panel.setShift(false); st.viewSig = '';
    refreshView(true);
    mods?.emit('tfg:musicStart', { by: me(), instrument: ins.id }, game);
    return true;
  }
  function exit(reason) {
    if (!st.playing) return;
    st.playing = false;
    listen(false);
    flush();
    const p = game.player;
    p.frozen = st.prevFrozen;
    if (game.emotes?.current === st.def) game.emotes.stop();
    guideOff();
    panel.hide(); panel.renderSong(null);
    game.input?.mouseButtons?.delete?.(0); game.input?.mouseButtons?.delete?.(2);
    if (reason === 'hurt') game.ui.toast(t('You were startled!'), 'bad');
    st.inst = null; st.item = null; st.def = null;
  }

  // ---------------------------------------------------------------- avatar instrument meshes (local emote avatar + remote avatars)
  function attach(avatar, itemId) {
    const cur = attached.get(avatar);
    if (cur && cur.item === itemId) return;
    if (cur) detach(avatar);
    const parent = avatar.parts?.torso;
    if (!parent) return;
    const mesh = createInstrumentMesh(itemId), pose = INSTRUMENT_POSE[itemId];
    if (pose) { mesh.position.set(...pose.pos); mesh.rotation.set(...pose.rot); mesh.scale.setScalar(pose.scale); }
    parent.add(mesh);
    attached.set(avatar, { item: itemId, mesh });
  }
  function detach(avatar) {
    const cur = attached.get(avatar);
    if (!cur) return;
    disposeInstrumentMesh(cur.mesh);
    attached.delete(avatar);
    if (avatar._mu) avatar._mu = null;
  }
  function updateMeshes() {
    const live = new Set();
    if (st.playing && game.emotes?.avatar) { attach(game.emotes.avatar, st.inst.item); live.add(game.emotes.avatar); }
    for (const r of game.remotes.values()) {
      const item = r.emoteDef?.musicItem;
      if (!item || r.dead) continue;
      attach(r.avatar, item); live.add(r.avatar);
      for (const it of game.items.all()) if (it.holder === r.id && it.type === item) it.obj.visible = false;   // the strapped-on copy replaces the held one
    }
    for (const av of [...attached.keys()]) if (!live.has(av)) detach(av);
  }

  // ---------------------------------------------------------------- network in
  function bindNet(net) {
    net.relayTypes?.add?.(MSG);
    net.on_(MSG, (d, from) => {
      if (disposed || from === me() || !d || !Array.isArray(d.e)) return;
      const r = game.remotes.get(from);
      if (!r || r.dead) return;
      let lim = recvLimiters.get(from);
      if (!lim) recvLimiters.set(from, lim = SB.createRateLimiter(RECV_RATE));
      const now = performance.now();
      for (const raw of d.e.slice(0, SB.MU_MAX_BATCH)) {
        const ev = SB.sanitizeEvent(raw);
        if (!ev) continue;
        if (!lim.allow(now)) break;
        seen(from, r.pos);
        markHit(r.avatar, ev);
        if (r.pos.distanceTo(game.camera.position) > HEAR_MAX || !ensureAudio()) continue;
        const v = voiceFor(from);
        placeVoice(v, r.pos);
        synth(ev, v.g, 0);
      }
    });
    offs.push(net.on?.('peerLeave', (id) => { recvLimiters.delete(id); recent.delete(id); const v = au?.voices.get(id); if (v) { try { v.g.disconnect(); v.lp.disconnect(); v.pan.disconnect(); } catch { /* gone */ } au.voices.delete(id); } }));
  }
  on('netReady', (net, g) => { if (g === game) bindNet(net); });
  if (game.net) { try { bindNet(game.net); } catch (e) { console.warn('[music] bindNet', e); } }

  // ---------------------------------------------------------------- host: rewards, calm slop
  const dayKey = () => `${game.run?.runId ?? 'r'}:${game.run?.day ?? game.run?.daysLeft ?? 0}`;
  const grant = (id, kind, cap) => { const k = `${dayKey()}|${id}|${kind}`, n = grants.get(k) || 0; if (n >= cap) return false; grants.set(k, n + 1); return true; };
  on('registerHandlers', (H, g) => {
    if (g !== game) return;
    H(REQ_SONG, (d, from) => {
      const acc = Number(d?.acc);
      if (!(acc >= 0.7 && acc <= 1) || !SB.SONGS.some((s) => s.id === d.sid) || !grant(from, 'song', SONG_DAY_CAP)) return;
      game.net.broadcast('xp', { to: from, xp: Math.round(8 + 16 * acc), coin: 1, reason: t('Song played') });
    });
  });
  const origBoombox = game.hostBoomboxNear;
  if (typeof origBoombox === 'function') {
    game.hostBoomboxNear = function musicBoombox(pos, r) { return origBoombox.call(this, pos, r) || musicNear(pos, r); };   // AI Slop is calmed by live music too
  }
  // Belt and braces: while playing, the game's own per-frame actions (drop / throw / hotbar / interact / melee) run with input disabled,
  // even if some other listener let a key reach Input. Instance-level wrapper, removed on dispose.
  const origLocalActions = game.localActions;
  if (typeof origLocalActions === 'function') {
    game.localActions = function musicLocalActions(dt, input) {
      if (!st.playing || !input) return origLocalActions.call(this, dt, input);
      const was = input.enabled;
      input.enabled = false;
      try { return origLocalActions.call(this, dt, input); } finally { input.enabled = was; this.ui?.hud?.setPrompt?.(null); }
    };
  }
  function hostJamTick(dt) {
    const ph = game.run?.phase;
    if (!game.isHost || (ph !== 'orbit' && ph !== 'company')) return;
    const ids = st.jam;
    for (const id of Object.keys(st.jamT)) if (!ids.includes(id)) delete st.jamT[id];
    for (const id of ids) {
      st.jamT[id] = (st.jamT[id] || 0) + dt;
      if (st.jamT[id] < JAM_XP_EVERY) continue;
      st.jamT[id] = 0;
      if (!grant(id, 'jam', JAM_DAY_CAP)) continue;
      const xp = 6 + 2 * clamp(ids.length - 2, 0, 3);
      game.net.broadcast('xp', { to: id, xp, coin: 0, reason: t('Jam session') });
    }
  }

  // ---------------------------------------------------------------- per frame
  function update(dt) {
    if (disposed) return;
    const now = performance.now(), p = game.player;
    if (au) {
      const v = vol();
      if (v !== au.vol) { au.vol = v; au.bus.gain.setTargetAtTime(v, au.ctx.currentTime, 0.05); }
      st.voiceGc -= dt;
      if (st.voiceGc <= 0) { st.voiceGc = 3; for (const [id, vc] of au.voices) if (!game.remotes.has(id)) { try { vc.g.disconnect(); vc.lp.disconnect(); vc.pan.disconnect(); } catch { /* gone */ } au.voices.delete(id); } }
    }
    // end conditions
    if (st.playing) {
      if (game.input?.locked) st.wasLocked = true;
      const held = p.heldItem?.();
      if (p.dead || held !== st.item || game.emotes?.current !== st.def || game.minigame || game.terminal?.active || game.ui?.blocksInput?.() || (st.wasLocked && !game.input?.locked)) exit('state');
    }
    // jam session (every peer computes the chip; the host also pays out)
    st.jamCalc -= dt;
    if (st.jamCalc <= 0) {
      st.jamCalc = 0.5;
      const prev = st.jam.length;
      st.jam = jamIds();
      for (const [id, r] of recent) if (now - r.t > 30000) recent.delete(id);
      hostJamTick(0.5);
      const on_ = st.jam.length > 1 && st.jam.includes(me());
      const txt = on_ ? `${t('JAM SESSION')} x${st.jam.length}` : '';
      if (txt !== jamBox.dataset.txt) {
        jamBox.dataset.txt = txt;
        jamBox.style.display = on_ ? '' : 'none';
        jamBox.innerHTML = on_ ? `<div style="font-family:var(--font,monospace);color:#b8ffc9;background:rgba(6,20,10,.75);border:1px solid #7dff9a;padding:4px 12px;font-size:17px;letter-spacing:2px;text-shadow:0 0 10px rgba(80,255,140,.6)">${txt}</div>` : '';
        if (on_ && prev < 2) game.audio?.ui?.('ui_confirm', 0.4);
      }
    }
    if (st.playing) {
      noiseTick();
      updateMeshes();
      refreshView(false);
      panel.renderSong(songView());
    } else if (attached.size || [...game.remotes.values()].some((r) => r.emoteDef?.musicItem)) updateMeshes();
    // "[LMB] Play X" hint while an instrument is in hand
    const h = !st.playing && !p.dead ? p.heldItem?.() : null;
    const ins = h && INSTRUMENT_BY_ITEM[h.type];
    const key = ins ? ins.id : '';
    if (key !== st.hintKey) {
      st.hintKey = key;
      hintBox.style.display = ins ? '' : 'none';
      hintBox.innerHTML = ins ? `<div style="${hintStyle}">${t('[LMB] Play {n}').replace('{n}', t(ins.name))}</div>` : '';
    }
  }

  on('useItem', (it, hk, g) => {
    if (g !== game || hk.handled || !it || !INSTRUMENT_BY_ITEM[it.type]) return;
    hk.handled = true;
    if (!st.playing) enter(it);
  });
  on('localHurt', (d, g) => { if (g === game && st.playing && performance.now() > st.hurtGrace && (d?.dmg ?? 1) > 0) exit('hurt'); });
  on('localDeath', (c, g) => { if (g === game) exit('death'); });
  on('update', (dt, g) => { if (g === game) update(dt); });
  on('phase', (ph, g) => { if (g === game && (ph === 'landing' || ph === 'takeoff' || ph === 'fired')) exit('phase'); });

  const api = {
    /** true while the local player is in play mode */
    get playing() { return st.playing; },
    state: () => ({ playing: st.playing, instrument: st.inst?.id || null, mode: st.mode, octave: st.octave, chordOct: st.chordOct, chordSlot: st.chordSlot, scale: st.scale, patch: st.patch,
      guide: { ...st.guide }, jam: [...st.jam], queued: outQ.length }),
    enter, exit,
    /** simulate a key press in play mode (tests / gamepad bridges) */
    press(code, shift = false) { if (st.playing) handleKey(code, shift); },
    strum, hitPad,
    recent: () => [...recent].map(([id, r]) => ({ id, n: r.ts.length, pos: r.pos })),
    songs: SB.SONGS, songbook: SB,
    dispose() {
      disposed = true;
      exit('dispose');
      listen(false);
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const off of offs) { try { off?.(); } catch { /* ignore */ } }
      for (const av of [...attached.keys()]) detach(av);
      if (typeof origBoombox === 'function') delete game.hostBoomboxNear;
      if (typeof origLocalActions === 'function') delete game.localActions;
      panel.dispose(); jamBox.remove(); hintBox.remove();
      if (au) { for (const v of au.voices.values()) { try { v.g.disconnect(); v.lp.disconnect(); v.pan.disconnect(); } catch { /* gone */ } } try { au.bus.disconnect(); au.local.disconnect(); } catch { /* gone */ } au.eng.dispose(); au = null; }
    },
  };
  return api;
}
