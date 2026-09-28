// Proximity voice chat over WebRTC media streams + mouth-flap levels + walkie-talkie radio path
// + "skinwalker" voice clip capture (creatures replay short clips of crewmates' voices).
import * as THREE from 'three';

function rms(analyser, buf) {
  analyser.getFloatTimeDomainData(buf);
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

export class VoiceChat {
  constructor(game) {
    this.game = game;
    this.audio = game.audio;
    this.settings = game.settings;
    this.peers = new Map();       // peerId -> nodes
    this.mic = null;
    this.localLevel = 0;
    this.transmitting = false;
    this.clips = new Map();       // ownerId -> [AudioBuffer]
    this.clipTimer = 0;
    this.buf = new Float32Array(512);
    this.enabled = false;
    this.micError = null;
  }

  async startMic() {
    if (this.mic || !this.settings.micEnabled) return;
    this.micError = null;
    const ctx = this.audio.ctx;
    if (!ctx || !navigator.mediaDevices?.getUserMedia) { this.micError = 'not supported here'; return; }
    try {
      const constraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
      if (this.settings.micDevice) constraints.audio.deviceId = { exact: this.settings.micDevice };
      this.rawStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      console.warn('mic unavailable', e);
      this.micError = e.message || String(e);
      return;
    }
    const src = ctx.createMediaStreamSource(this.rawStream);
    this.micGain = ctx.createGain();
    this.micGain.gain.value = this.settings.micGain;
    this.gate = ctx.createGain();
    this.gate.gain.value = 0;
    this.localAnalyser = ctx.createAnalyser();
    this.localAnalyser.fftSize = 512;
    this.dest = ctx.createMediaStreamDestination();
    src.connect(this.micGain);
    this.micGain.connect(this.localAnalyser);
    this.micGain.connect(this.gate).connect(this.dest);
    this.mic = this.dest.stream;
    this.game.net?.addStream(this.mic);
    this.enabled = true;
    this.setupRecorder();
  }

  stopMic() {
    if (this.mic) { this.game.net?.removeStream(this.mic); }
    this.rawStream?.getTracks().forEach((t) => t.stop());
    this.mic = null; this.rawStream = null; this.enabled = false;
    try { this.recorder?.stop(); } catch { /* ignore */ }
    this.recorder = null;
  }

  // Record short clips while the local player talks (for skinwalker mimicry)
  setupRecorder() {
    if (typeof MediaRecorder === 'undefined' || !this.rawStream) return;
    const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported?.(m));
    if (!mime) return;
    this.recMime = mime;
    this.recording = false;
    this.recStart = 0;
  }
  beginClip() {
    if (!this.recMime || this.recording || !this.rawStream) return;
    try {
      const chunks = [];
      const rec = new MediaRecorder(this.rawStream, { mimeType: this.recMime, audioBitsPerSecond: 24000 });
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        this.recording = false;
        const blob = new Blob(chunks, { type: this.recMime });
        if (blob.size < 2000 || blob.size > 90000) return;
        const ab = await blob.arrayBuffer();
        this.game.net?.sendBinary(ab, { kind: 'clip', owner: this.game.net.selfId });
        this.storeClip(this.game.net?.selfId, ab.slice(0));
      };
      rec.start();
      this.recorder = rec;
      this.recording = true;
      this.recStart = performance.now();
      setTimeout(() => { try { rec.state !== 'inactive' && rec.stop(); } catch { /* ignore */ } }, 1400 + Math.random() * 1400);
    } catch (e) { this.recMime = null; }
  }
  async storeClip(owner, ab) {
    try {
      const buf = await this.audio.ctx.decodeAudioData(ab);
      if (!this.clips.has(owner)) this.clips.set(owner, []);
      const list = this.clips.get(owner);
      list.push(buf);
      if (list.length > 6) list.shift();
    } catch { /* undecodable */ }
  }
  onBinary(ab, from, meta) {
    if (meta?.kind === 'clip') this.storeClip(meta.owner || from, ab);
  }
  // play a random crewmate voice clip at a world position (used by mimics / skinwalker mod)
  playClip(pos, preferOwner) {
    const owners = [...this.clips.keys()].filter((k) => this.clips.get(k).length);
    if (!owners.length) return this.audio.at(this.audio.variant('mimic_voice', 2), pos, 0.9, { occlude: true });
    const owner = preferOwner && this.clips.has(preferOwner) ? preferOwner : owners[Math.floor(Math.random() * owners.length)];
    const list = this.clips.get(owner);
    const buf = list[Math.floor(Math.random() * list.length)];
    const ctx = this.audio.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.94 + Math.random() * 0.08;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400;
    const g = ctx.createGain(); g.gain.value = 1.2;
    const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.refDistance = 2.5; p.maxDistance = 40; p.rolloffFactor = 1.1;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    src.connect(lp).connect(g).connect(p).connect(this.audio.buses.voice);
    src.start();
    return { owner };
  }

  addPeerStream(stream, peerId) {
    const ctx = this.audio.ctx;
    this.removePeer(peerId);
    // Chrome needs the remote stream attached to a media element for WebAudio to receive data
    const el = new Audio();
    el.muted = true; el.srcObject = stream;
    el.play().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 18000;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
    panner.refDistance = 2.2; panner.maxDistance = 45; panner.rolloffFactor = 1.35;
    // walkie radio path
    const radioGain = ctx.createGain(); radioGain.gain.value = 0;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 1.1;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3); }
    shaper.curve = curve;
    src.connect(analyser);
    src.connect(gain).connect(lp).connect(panner).connect(this.audio.buses.voice);
    src.connect(bp).connect(shaper).connect(radioGain).connect(this.audio.buses.voice);
    this.peers.set(peerId, { el, src, analyser, gain, lp, panner, radioGain, level: 0, occl: 0, occlT: Math.random() * 0.2 });
  }

  removePeer(peerId) {
    const p = this.peers.get(peerId);
    if (!p) return;
    try { p.src.disconnect(); p.gain.disconnect(); p.panner.disconnect(); p.radioGain.disconnect(); } catch { /* ignore */ }
    p.el.srcObject = null;
    this.peers.delete(peerId);
  }

  setMuted(m) { this.muted = m; }

  update(dt, input) {
    const g = this.game;
    // transmit gating
    if (this.mic) {
      const lvl = rms(this.localAnalyser, this.buf);
      const ptt = this.settings.voiceMode === 'ptt';
      const pressing = input.isDown('ptt') || (input.textFocus ? false : false);
      const talking = !this.muted && (ptt ? pressing : lvl > 0.012);
      this.transmitting = talking;
      const t = this.audio.ctx.currentTime;
      this.gate.gain.setTargetAtTime(talking || (!ptt && !this.muted) ? 1 : 0, t, 0.03);
      this.localLevel = talking ? Math.min(1, lvl * 9) : 0;
      // capture a skinwalker clip now and then while talking
      this.clipTimer -= dt;
      if (talking && lvl > 0.03 && this.clipTimer <= 0 && !this.recording) { this.clipTimer = 20 + Math.random() * 25; this.beginClip(); }
    } else this.localLevel = 0;

    const me = g.player;
    const listenerDead = me?.dead;
    const myWalkie = g.hasActiveWalkie?.(g.net?.selfId);
    const tmp = new THREE.Vector3();
    for (const [peerId, p] of this.peers) {
      const rp = g.remotes?.get(peerId);
      p.level = Math.min(1, rms(p.analyser, this.buf) * 9);
      if (!rp) { p.gain.gain.value = 0; p.radioGain.gain.value = 0; continue; }
      rp.voiceLevel = p.level;
      rp.headPos(tmp);
      const t = this.audio.ctx.currentTime;
      p.panner.positionX.setTargetAtTime(tmp.x, t, 0.03);
      p.panner.positionY.setTargetAtTime(tmp.y, t, 0.03);
      p.panner.positionZ.setTargetAtTime(tmp.z, t, 0.03);
      // audibility: living can't hear the dead; the dead hear everyone
      let vol = 1;
      if (rp.dead && !listenerDead) vol = 0;
      if (listenerDead) { p.panner.refDistance = 1000; } else p.panner.refDistance = 2.2;
      p.gain.gain.setTargetAtTime(vol * (this.settings.voiceVolume ?? 1) * (rp.localVolume ?? 1), t, 0.05);
      // occlusion (walls)
      p.occlT -= dt;
      if (p.occlT <= 0 && !listenerDead) {
        p.occlT = 0.2;
        const occl = g.occlusionAt ? g.occlusionAt(tmp) : 0;
        p.lp.frequency.setTargetAtTime(occl > 0.5 ? 900 : occl > 0 ? 2500 : 18000, t, 0.1);
      }
      // walkie
      const radio = !rp.dead && !listenerDead && myWalkie && g.hasActiveWalkie?.(peerId) && me.pos.distanceTo(rp.pos) > 8;
      p.radioGain.gain.setTargetAtTime(radio ? 0.9 : 0, t, 0.05);
      // noise for creatures (voice attracts hounds etc.) is computed by the speaker's own client
    }
  }
}
