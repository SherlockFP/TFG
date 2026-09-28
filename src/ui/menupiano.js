// The dusty upright piano behind the chair: 3D model with animated keys, a WebAudio synth (additive "string" wave + felt hammer
// thud + damper release + sustain pedal) and a tune matcher for the secret melodies. Pure logic (KEYMAP / TuneMatcher) has no DOM.
import * as THREE from 'three';

// DAW-style layout: A S D F G H J K = white keys C D E F G A B C, W E T Y U = the black keys between them.
export const KEYMAP = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12,
};
export const KEY_LABELS = { 0: 'A', 1: 'W', 2: 'S', 3: 'E', 4: 'D', 5: 'F', 6: 'T', 7: 'G', 8: 'Y', 9: 'H', 10: 'U', 11: 'J', 12: 'K' };
export const MIDI_LOW = 48;   // C3 (model + playable range C3..C6)
export const MIDI_HIGH = 84;  // C6
export const midiOf = (code, octave) => (code in KEYMAP ? 12 * (octave + 1) + KEYMAP[code] : -1);
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
export const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

// Secret melodies (pitch classes: octave does not matter).
export const TUNES = [
  { id: 'lullaby', pcs: [0, 0, 7, 7, 9, 9, 7] },             // C C G G A A G   (A A G G H H G on the keys)
  { id: 'cursed', pcs: [0, 6, 0, 6, 0] },                    // the devil's interval, three times
  { id: 'elise', pcs: [4, 3, 4, 3, 4, 11, 2, 0, 9] },        // E D# E D# E B D C A
];
export class TuneMatcher {
  constructor(tunes = TUNES, gap = 3.2) { this.tunes = tunes; this.gap = gap; this.buf = []; this.last = -99; }
  push(midi, now) {
    if (now - this.last > this.gap) this.buf.length = 0;
    this.last = now;
    this.buf.push(((midi % 12) + 12) % 12);
    if (this.buf.length > 12) this.buf.shift();
    for (const tn of this.tunes) {
      const n = tn.pcs.length;
      if (this.buf.length >= n && tn.pcs.every((p, i) => this.buf[this.buf.length - n + i] === p)) { this.buf.length = 0; return tn; }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------- synth
export class PianoSynth {
  constructor(audio) { this.audio = audio; this.voices = new Map(); this.sustain = false; this.out = null; }
  ready() {
    const a = this.audio;
    if (!a?.ctx || !a.buses) return false;
    if (a.ctx.state === 'suspended') a.resume?.();
    if (!this.out) {
      const ctx = a.ctx;
      this.out = ctx.createGain(); this.out.gain.value = 0.55;
      this.out.connect(a.buses.sfx);
      if (a.reverb) { const send = ctx.createGain(); send.gain.value = 0.32; this.out.connect(send); send.connect(a.reverb); }
      const amps = [0, 1, 0.52, 0.34, 0.22, 0.15, 0.1, 0.07, 0.045, 0.03, 0.02];
      this.wave = ctx.createPeriodicWave(new Float32Array(amps.length), Float32Array.from(amps));
      const len = Math.floor(ctx.sampleRate * 0.06);
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    return true;
  }
  noteOn(midi, vel = 0.8) {
    if (!this.ready()) return false;
    const ctx = this.audio.ctx;
    this.stopVoice(midi, 0.05);
    if (this.voices.size >= 14) { const first = this.voices.keys().next().value; this.stopVoice(first, 0.12); }
    const t = ctx.currentTime;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const k = Math.min(1, Math.max(0, (midi - 36) / 60));          // 0 = low, 1 = high
    const v = vel * (0.92 + Math.random() * 0.16);
    const peak = 0.34 * v;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.setTargetAtTime(peak * 0.0001, t + 0.03, 1.5 - k * 1.05);   // long ring for bass, short for treble
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(15000, f * (9 + v * 6)), t);
    lp.frequency.setTargetAtTime(Math.max(500, f * 2.4), t + 0.005, 0.55);
    lp.Q.value = 0.4;
    lp.connect(g); g.connect(this.out);
    const oscs = [];
    for (const det of [-3.2, 3.2]) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(this.wave);
      o.frequency.value = f;
      o.detune.value = det + (Math.random() - 0.5) * 1.5;
      o.connect(lp); o.start(t); o.stop(t + 9);
      oscs.push(o);
    }
    // felt hammer: a short band-passed noise burst plus a soft low knock
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(4000, f * 3 + 300); bp.Q.value = 0.9;
    const ng = ctx.createGain(); ng.gain.value = 0.16 * v;
    n.connect(bp); bp.connect(ng); ng.connect(this.out); n.start(t);
    const knock = ctx.createOscillator(); knock.type = 'sine'; knock.frequency.setValueAtTime(Math.max(60, f * 0.5), t);
    const kg = ctx.createGain(); kg.gain.setValueAtTime(0.1 * v, t); kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    knock.connect(kg); kg.connect(this.out); knock.start(t); knock.stop(t + 0.08);
    this.voices.set(midi, { g, oscs, held: true, t });
    return true;
  }
  stopVoice(midi, rel = 0.25) {
    const v = this.voices.get(midi);
    if (!v) return;
    this.voices.delete(midi);
    const ctx = this.audio.ctx; const t = ctx.currentTime;
    try {
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(Math.max(0.0001, v.g.gain.value), t);
      v.g.gain.setTargetAtTime(0, t, rel / 3);
      for (const o of v.oscs) o.stop(t + rel * 2.5 + 0.1);
    } catch { /* ignore */ }
  }
  noteOff(midi) {
    const v = this.voices.get(midi);
    if (!v) return;
    v.held = false;
    if (!this.sustain) this.stopVoice(midi, 0.28);
  }
  setSustain(on) {
    this.sustain = on;
    if (!on) for (const [m, v] of [...this.voices]) if (!v.held) this.stopVoice(m, 0.35);
  }
  releaseAll() {
    this.sustain = false;
    for (const m of [...this.voices.keys()]) this.stopVoice(m, 0.3);
  }
  dispose() { this.releaseAll(); try { this.out?.disconnect(); } catch { /* ignore */ } this.out = null; }
}

// ---------------------------------------------------------------------------------------------------------- 3D model
function sheetTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#d9d0b4'; x.fillRect(0, 0, 128, 96);
  x.fillStyle = 'rgba(90,70,40,0.25)'; for (let i = 0; i < 40; i++) x.fillRect(Math.random() * 128, Math.random() * 96, 3 + Math.random() * 10, 1);
  x.strokeStyle = '#3a3226'; x.lineWidth = 1;
  for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(8, 44 + i * 5); x.lineTo(120, 44 + i * 5); x.stroke(); }
  x.fillStyle = '#2a241c'; x.font = 'bold 9px monospace'; x.textAlign = 'center'; x.fillText('LULLABY (for the copy)', 64, 14);
  // C C G G A A G on a treble staff (C4 sits on a ledger line under the staff, G4 on the 2nd line, A4 in the 2nd space)
  const ys = { 0: 68, 7: 59, 9: 56.5 };
  [0, 0, 7, 7, 9, 9, 7].forEach((pc, i) => {
    const nx = 20 + i * 14;
    x.beginPath(); x.ellipse(nx, ys[pc], 3.2, 2.4, -0.3, 0, Math.PI * 2); x.fill();
    x.fillRect(nx + 2.6, ys[pc] - 13, 1, 13);
    if (pc === 0) { x.fillRect(nx - 5, ys[pc], 10, 1); }
  });
  x.fillStyle = 'rgba(150,40,30,0.5)'; x.fillRect(96, 70, 12, 9);   // a coffee (blood?) stain
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
  return tex;
}

export function buildPiano() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x2b170d });
  const woodLight = new THREE.MeshLambertMaterial({ color: 0x3b2314 });
  const dust = new THREE.MeshBasicMaterial({ color: 0x9a948a, transparent: true, opacity: 0.16, depthWrite: false });
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
  box(1.52, 1.05, 0.5, wood, 0, 0.62, -0.06);                 // cabinet
  box(1.58, 0.05, 0.56, woodLight, 0, 1.17, -0.06);            // lid
  const dustPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.52), dust); dustPlane.rotation.x = -Math.PI / 2; dustPlane.position.set(0, 1.2, -0.06); g.add(dustPlane);
  box(1.46, 0.05, 0.36, wood, 0, 0.665, 0.37);                 // key bed
  box(1.5, 0.11, 0.03, woodLight, 0, 0.735, 0.555);            // key slip
  for (const sx of [-0.73, 0.73]) box(0.06, 0.12, 0.36, wood, sx, 0.72, 0.37);   // cheeks
  for (const sx of [-0.66, 0.66]) box(0.08, 0.62, 0.4, wood, sx, 0.31, 0.02);    // legs
  for (const sx of [-0.4, 0.4]) box(0.06, 0.02, 0.1, new THREE.MeshLambertMaterial({ color: 0x8a6a2a }), sx, 0.03, 0.42);   // brass pedals
  // sheet music on the desk
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), new THREE.MeshBasicMaterial({ map: sheetTexture() }));
  sheet.position.set(0, 0.98, 0.2); sheet.rotation.x = -0.18; g.add(sheet);
  // keys (C3..C6): pivot at the back edge so pressing tips the front down
  const whites = []; for (let m = MIDI_LOW; m <= MIDI_HIGH; m++) if (!isBlack(m)) whites.push(m);
  const ww = 1.4 / whites.length;
  const wMat = new THREE.MeshLambertMaterial({ color: 0xd8d0b8 });
  const bMat = new THREE.MeshLambertMaterial({ color: 0x0c0a0a });
  const keys = new Map();
  const x0 = -0.7;
  const mk = (m, w, l, h, y, mat, x) => {
    const piv = new THREE.Group(); piv.position.set(x, y, 0.29);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat); mesh.position.set(0, -h / 2, l / 2); piv.add(mesh);
    g.add(piv); keys.set(m, { piv, cur: 0, target: 0 });
  };
  let wi = 0;
  for (let m = MIDI_LOW; m <= MIDI_HIGH; m++) {
    if (!isBlack(m)) { mk(m, ww - 0.004, 0.24, 0.024, 0.716, wMat, x0 + (wi + 0.5) * ww); wi++; }
  }
  wi = 0;
  for (let m = MIDI_LOW; m <= MIDI_HIGH; m++) {
    if (!isBlack(m)) { wi++; continue; }
    mk(m, ww * 0.56, 0.14, 0.03, 0.748, bMat, x0 + wi * ww);
  }
  return {
    group: g,
    press(midi, on) { const k = keys.get(midi); if (k) k.target = on ? 0.075 : 0; },
    update(dt) {
      for (const k of keys.values()) {
        if (k.cur === k.target) continue;
        k.cur += (k.target - k.cur) * Math.min(1, dt * 26);
        if (Math.abs(k.target - k.cur) < 0.0005) k.cur = k.target;
        k.piv.rotation.x = k.cur;
      }
    },
    dispose() { g.traverse((o) => { o.geometry?.dispose?.(); if (o.material?.map) o.material.map.dispose(); }); },
  };
}

export function buildStool() {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), new THREE.MeshLambertMaterial({ color: 0x4a1f1a }));
  seat.position.y = 0.48; g.add(seat);
  const leg = new THREE.MeshLambertMaterial({ color: 0x2b170d });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.46, 0.04), leg); l.position.set(Math.cos(a) * 0.14, 0.23, Math.sin(a) * 0.14); g.add(l);
  }
  return g;
}
