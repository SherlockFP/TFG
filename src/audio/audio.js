// Audio manager: WebAudio graph with buses, 3D positional sounds (HRTF), reverb send,
// occlusion lowpass, music/ambience crossfades. Sounds come from the procedural sfxlib
// (rendered lazily to AudioBuffers) and optionally from external files (ext assets).
import * as THREE from 'three';

let sfxlib = null;

function makeImpulse(ctx, seconds, decay, bright = 1) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const n = Math.random() * 2 - 1;
      lp += (n - lp) * (0.25 + 0.7 * bright * (1 - t));
      d[i] = lp * Math.pow(1 - t, decay) * (i < rate * 0.01 ? i / (rate * 0.01) : 1);
    }
  }
  return buf;
}

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.buffers = new Map();
    this.pending = new Map();
    this.external = new Map();     // name -> url (overrides/additions from ext assets)
    this.handles = new Set();
    this.listenerPos = new THREE.Vector3();
    this.ready = false;
    this.maxVoices = 56;
    this.ambience = new Map();
    this.music = null;
    this.env = 'none';
    this.occluder = null;          // fn(pos) -> 0..1 occlusion
    this.occlTimer = 0;
  }

  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 12; this.comp.ratio.value = 5;
    this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
    this.master.connect(this.comp).connect(ctx.destination);
    this.buses = {};
    for (const b of ['sfx', 'music', 'voice', 'ui', 'amb']) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.buses[b] = g;
    }
    // reverb send
    this.reverb = ctx.createConvolver();
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0;
    this.reverb.connect(this.reverbGain).connect(this.master);
    this.irs = {
      facility: makeImpulse(ctx, 2.6, 2.2, 0.7),
      mansion: makeImpulse(ctx, 1.8, 2.6, 0.5),
      ship: makeImpulse(ctx, 0.7, 3.5, 0.9),
      outdoor: makeImpulse(ctx, 1.4, 4.0, 0.4),
      company: makeImpulse(ctx, 3.2, 2.0, 0.6),
    };
    this.reverb.buffer = this.irs.ship;
    // output meter (used by the "test sound" button and the blocked-audio indicator)
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 1024;
    this.comp.connect(this.meter);
    this.meterBuf = new Float32Array(1024);
    this.applyVolumes();
    if (this.settings.outputDevice) this.setOutputDevice(this.settings.outputDevice);
    try { sfxlib = await import('./sfxlib.js'); } catch (e) { console.warn('sfxlib not available', e); }
    this.ready = true;
    // warm up common sounds in idle time
    const warm = ['ui_click', 'ui_hover', 'ui_confirm', 'step_metal_1', 'step_metal_2', 'step_concrete_1', 'step_concrete_2', 'item_pickup', 'item_drop', 'ui_scan', 'ship_hum', 'door_open', 'door_close', 'swing_whoosh',
      'jump', 'land_soft', 'cloth_rustle', 'scan_blip', 'heartbeat', 'hit_wall', 'step_carpet_1', 'step_tile_1', 'step_gravel_1'];
    this.warm(warm);
    this.warmExternal();
  }

  // decode all external (downloaded) sounds that override our names, a few at a time
  warmExternal() {
    const names = [...this.external.keys()].filter((n) => /^(step_|door_|ambience_|ship_hum|wind|rain|menu_theme|orbit_ambience|hit_|item_pickup|lurker|crawler|giant|hound|screamer|creature_)/.test(n));
    let active = 0;
    const next = () => {
      while (active < 6 && names.length) {
        const n = names.shift();
        if (this.buffers.has(n)) continue;
        this.getBuffer(n);
        const p = this.pending.get(n);
        if (!p) continue;
        active++;
        p.finally(() => { active--; next(); });
      }
    };
    next();
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') return this.ctx.resume().catch(() => {});
    return Promise.resolve();
  }
  // 'none' (not created yet), 'running', 'suspended', 'interrupted', 'closed'
  state() { return this.ctx ? this.ctx.state : 'none'; }

  // Output level of the whole mix (RMS)
  outputLevel() {
    if (!this.meter) return 0;
    this.meter.getFloatTimeDomainData(this.meterBuf);
    let s = 0;
    for (let i = 0; i < this.meterBuf.length; i++) s += this.meterBuf[i] * this.meterBuf[i];
    return Math.sqrt(s / this.meterBuf.length);
  }

  canChooseOutput() { return !!(this.ctx ? this.ctx.setSinkId : window.AudioContext?.prototype?.setSinkId); }
  async setOutputDevice(id) {
    if (!this.ctx?.setSinkId) return false;
    try { await this.ctx.setSinkId(id || ''); return true; } catch (e) { console.warn('setSinkId failed', e); return false; }
  }

  testSound() {
    this.resume();
    this.play('ui_levelup', { volume: 0.9, bus: 'ui' });
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.masterVolume;
    this.buses.sfx.gain.value = s.sfxVolume;
    this.buses.amb.gain.value = s.sfxVolume * 0.9;
    this.buses.ui.gain.value = s.sfxVolume;
    this.buses.music.gain.value = s.musicVolume;
    this.buses.voice.gain.value = s.voiceVolume;
  }

  setEnvironment(env) {
    if (!this.ctx || this.env === env) return;
    this.env = env;
    const ir = this.irs[env];
    const t = this.ctx.currentTime;
    if (ir) {
      this.reverb.buffer = ir;
      const lvl = { facility: 0.55, mansion: 0.45, ship: 0.18, outdoor: 0.12, company: 0.5 }[env] ?? 0.2;
      this.reverbGain.gain.setTargetAtTime(lvl, t, 0.3);
    } else this.reverbGain.gain.setTargetAtTime(0, t, 0.3);
  }

  registerExternal(name, url) { this.external.set(name, url); }

  warm(names) {
    const run = () => {
      const n = names.shift();
      if (!n) return;
      this.getBuffer(n);
      if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 200 });
      else setTimeout(run, 30);
    };
    run();
  }

  has(name) { return !!(sfxlib?.SFX?.[name]) || this.external.has(name); }

  getBuffer(name) {
    if (this.buffers.has(name)) return this.buffers.get(name);
    if (!this.ctx) return null;
    if (this.external.has(name)) {
      if (!this.pending.has(name)) {
        const p = fetch(this.external.get(name)).then((r) => r.arrayBuffer()).then((ab) => this.ctx.decodeAudioData(ab))
          .then((buf) => { this.buffers.set(name, buf); return buf; })
          .catch(() => { this.external.delete(name); return null; });
        this.pending.set(name, p);
      }
      return null;
    }
    if (!sfxlib || !sfxlib.SFX[name]) return null;
    try {
      const r = sfxlib.renderSfx(name, this.ctx.sampleRate);
      const buf = this.ctx.createBuffer(r.channels.length, r.channels[0].length, r.sampleRate);
      r.channels.forEach((ch, i) => buf.copyToChannel(ch, i));
      this.buffers.set(name, buf);
      return buf;
    } catch (e) {
      console.warn('sfx render failed', name, e);
      this.buffers.set(name, null);
      return null;
    }
  }

  meta(name) { return sfxlib?.SFX?.[name] || {}; }

  // Variation helper: "step_metal" -> random existing step_metal_N
  variant(base, count) {
    if (!count) {
      count = 0;
      while (this.has(`${base}_${count + 1}`)) count++;
      if (!count) return base;
    }
    return `${base}_${1 + Math.floor(Math.random() * count)}`;
  }

  /**
   * play(name, opts)
   * opts: pos (Vector3-like) for 3D, volume, pitch (rate), loop, bus, refDistance, maxDistance,
   *       rolloff, occlude, reverb (send amount 0..1), delay, follow (Object3D to follow)
   */
  play(name, opts = {}) {
    if (!this.ctx || !name) return null;
    if (this.handles.size >= this.maxVoices) {
      // steal the oldest non-looping one
      for (const h of this.handles) { if (!h.loop) { h.stop(0.02); break; } }
    }
    const buf = this.getBuffer(name);
    if (!buf) {
      // external still loading: retry shortly for one-shots
      const p = this.pending.get(name);
      if (p && !opts._retried && !opts.loop && !opts.noRetry) p.then(() => this.play(name, { ...opts, _retried: true }));
      return null;
    }
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!opts.loop;
    const pitch = opts.pitch ?? 1;
    src.playbackRate.value = pitch;
    const gain = ctx.createGain();
    const baseVol = (opts.volume ?? 1) * (this.meta(name).vol ?? 1);
    gain.gain.value = baseVol;
    let node = src;
    let lowpass = null;
    if (opts.occlude || opts.lowpass) {
      lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = opts.lowpass || 20000;
      node.connect(lowpass); node = lowpass;
    }
    node.connect(gain);
    let panner = null;
    if (opts.pos || opts.follow) {
      panner = ctx.createPanner();
      panner.panningModel = opts.hrtf === false ? 'equalpower' : 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = opts.refDistance ?? 2;
      panner.maxDistance = opts.maxDistance ?? 60;
      panner.rolloffFactor = opts.rolloff ?? 1.2;
      const p = opts.pos || opts.follow.getWorldPosition(new THREE.Vector3());
      panner.positionX.value = p.x; panner.positionY.value = p.y; panner.positionZ.value = p.z;
      gain.connect(panner);
      panner.connect(this.buses[opts.bus || 'sfx']);
      const send = opts.reverb ?? 0.6;
      if (send > 0) {
        const sg = ctx.createGain(); sg.gain.value = send;
        panner.connect(sg).connect(this.reverb);
      }
    } else {
      gain.connect(this.buses[opts.bus || 'ui']);
      const send = opts.reverb ?? 0;
      if (send > 0) { const sg = ctx.createGain(); sg.gain.value = send; gain.connect(sg).connect(this.reverb); }
    }
    const when = ctx.currentTime + (opts.delay || 0);
    src.start(when, opts.offset || 0);
    const h = {
      name, src, gain, panner, lowpass, loop: src.loop, follow: opts.follow || null, occlude: !!opts.occlude,
      baseVol, occl: 0,
      stopped: false,
      stop: (fade = 0.08) => {
        if (h.stopped) return;
        h.stopped = true;
        const t = ctx.currentTime;
        try {
          gain.gain.cancelScheduledValues(t);
          gain.gain.setValueAtTime(gain.gain.value, t);
          gain.gain.linearRampToValueAtTime(0, t + fade);
          src.stop(t + fade + 0.02);
        } catch { /* ignore */ }
        this.handles.delete(h);
      },
      setPos: (p) => {
        if (!panner) return;
        const t = ctx.currentTime;
        panner.positionX.setTargetAtTime(p.x, t, 0.03);
        panner.positionY.setTargetAtTime(p.y, t, 0.03);
        panner.positionZ.setTargetAtTime(p.z, t, 0.03);
      },
      setVolume: (v, tc = 0.05) => { h.baseVol = v; gain.gain.setTargetAtTime(v, ctx.currentTime, tc); },
      setPitch: (r) => { src.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.05); },
    };
    src.onended = () => { h.stopped = true; this.handles.delete(h); };
    this.handles.add(h);
    return h;
  }

  // Convenience: 3D one-shot
  at(name, pos, volume = 1, extra = {}) { return this.play(name, { pos, volume, ...extra }); }
  ui(name, volume = 0.7) { return this.play(name, { volume, bus: 'ui' }); }

  setAmbience(layer, name, volume = 0.5, fade = 2) {
    if (!this.ctx) return;
    this.wantedAmb = this.wantedAmb || new Map();
    this.wantedAmb.set(layer, name);
    const cur = this.ambience.get(layer);
    if (cur && cur.name === name) { cur.setVolume(volume, fade / 3); return; }
    if (cur) cur.stop(fade);
    this.ambience.delete(layer);
    if (!name) return;
    const h = this.play(name, { loop: true, volume: 0.0001, bus: 'amb' });
    if (h) { h.setVolume(volume, fade / 3); this.ambience.set(layer, h); return; }
    const p = this.pending.get(name);
    if (p) p.then(() => { if (this.wantedAmb.get(layer) === name && !this.ambience.get(layer)) this.setAmbience(layer, name, volume, fade); });
  }
  stopAllAmbience(fade = 1) { for (const [, h] of this.ambience) h.stop(fade); this.ambience.clear(); }

  playMusic(name, volume = 0.6, fade = 2) {
    if (!this.ctx) return;
    if (this.music && this.music.name === name) return;
    if (this.music) this.music.stop(fade);
    this.music = null;
    this.wantedMusic = name;
    if (!name) return;
    const h = this.play(name, { loop: true, volume: 0.0001, bus: 'music' });
    if (h) { h.setVolume(volume, fade / 3); this.music = h; return; }
    const p = this.pending.get(name);
    if (p) p.then(() => { if (this.wantedMusic === name && !this.music) this.playMusic(name, volume, fade); });
  }

  update(dt, camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    camera.getWorldPosition(this.listenerPos);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(this.listenerPos.x, t, 0.01);
      l.positionY.setTargetAtTime(this.listenerPos.y, t, 0.01);
      l.positionZ.setTargetAtTime(this.listenerPos.z, t, 0.01);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.01); l.forwardY.setTargetAtTime(fwd.y, t, 0.01); l.forwardZ.setTargetAtTime(fwd.z, t, 0.01);
      l.upX.setTargetAtTime(up.x, t, 0.01); l.upY.setTargetAtTime(up.y, t, 0.01); l.upZ.setTargetAtTime(up.z, t, 0.01);
    } else {
      l.setPosition(this.listenerPos.x, this.listenerPos.y, this.listenerPos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
    const tmp = new THREE.Vector3();
    this.occlTimer -= dt;
    const doOccl = this.occlTimer <= 0;
    if (doOccl) this.occlTimer = 0.15;
    for (const h of this.handles) {
      if (h.follow) { h.follow.getWorldPosition(tmp); h.setPos(tmp); }
      if (doOccl && h.occlude && h.lowpass && this.occluder && h.panner) {
        const p = { x: h.panner.positionX.value, y: h.panner.positionY.value, z: h.panner.positionZ.value };
        const o = this.occluder(p);
        h.occl = o;
        h.lowpass.frequency.setTargetAtTime(o > 0.5 ? 700 : o > 0 ? 2200 : 18000, t, 0.08);
      }
    }
  }

  stopAll() {
    for (const h of [...this.handles]) h.stop(0.05);
    this.ambience.clear();
    this.wantedAmb?.clear();
    this.wantedMusic = null;
    this.music = null;
  }
}
