// SCORE engine (wave 7): plays the adaptive music. Attached to the AudioManager as `audio.score` (see audio.js init). Docs: docs/wave7/score.md.
//   score.setMenu(bool)        the title screen (called through audio.playMusic('menu_theme'))
//   score.setContext(ctx|null) the game snapshot from src/game/score.js at 4 Hz (see pickScene in score_core.js); null = not in a game
//   score.setFlags({speech, dance})   duck sources
//   score.sting(id, vol)       one-shot motif variant (intercom, live, vote, hype1..3, glitch, punish, co_hq, co_shop, co_pa)
// Budget: every stem is rendered ONCE (OfflineAudioContext, async, lazily, one at a time) and then looped by an AudioBufferSourceNode; a 5 Hz timer
// only moves GainNodes. All stems of a scene share one clock (t0) so layers stay in phase; entries snap to the next beat / bar and scene changes
// crossfade (equal power) over one bar, starting on the current bar line.
import { LOOP, BEAT, SCENE_FADE, STEM_GAIN, ScoreState, pickScene, nextGrid, quantOf, loopOffset, equalPower, duckLevel, duckTc, stemsForScene, VARIANTS } from './score_core.js';
import { renderStem, renderMotif, canRender } from './score_stems.js';

const TICK_MS = 200;
const MAX_CACHE = 9;
const ZERO_STOP = 25;          // s a muted layer keeps running before its source is stopped
const curve = (fn) => Float32Array.from({ length: 24 }, (_, i) => fn(i / 23));

export class Score {
  constructor(audio) {
    this.a = audio;
    this.menu = false; this.gctx = null; this.flags = { speech: false, dance: false, cinematic: false };
    this.buffers = new Map(); this.loading = new Map(); this.motifs = new Map(); this.motifLoading = new Map();
    this.scene = null; this.old = []; this.wantId = null; this.pendingId = null;
    this.timer = null; this.failUntil = 0; this.duck = 1; this.stingUntil = 0; this.lastSting = new Map(); this.queue = Promise.resolve();
    this.out = null; this.stingOut = null; this.levels = {};
  }

  // ---------------------------------------------------------------- inputs
  get ctx() { return this.a.ctx; }
  get enabled() { return !!(this.a.ctx && this.a.buses && this.a.settings.dynamicMusic !== false && canRender()); }
  /** audio.playMusic(name) asks first: true = the score plays it (dynamic music on), false = legacy looping sfx. */
  claim(name) {
    const me = name === 'menu_theme' && this.enabled;
    this.setMenu(me);
    return me;
  }
  setMenu(on) { this.menu = !!on; this._wake(); }
  setContext(c) { this.gctx = c || null; this._wake(); }
  setFlags(f) { Object.assign(this.flags, f); }
  stop() { this._retire(this.scene, 0.6); this.scene = null; this.wantId = null; this._sleep(); }

  _wake() { if (!this.timer && this.a.ctx) this.timer = setInterval(() => { try { this._tick(TICK_MS / 1000); } catch (e) { console.warn('score tick', e); } }, TICK_MS); }
  _sleep() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  _ensureOut() {
    if (this.out || !this.a.ctx || !this.a.buses) return;
    const ctx = this.a.ctx;
    this.out = ctx.createGain(); this.out.connect(this.a.buses.music);
    this.stingOut = ctx.createGain(); this.stingOut.gain.value = 0.9; this.stingOut.connect(this.a.buses.music);
  }

  // ---------------------------------------------------------------- stem cache (render once, loop forever)
  _load(key) {
    if (this.buffers.has(key)) return Promise.resolve(this.buffers.get(key));
    if (this.loading.has(key)) return this.loading.get(key);
    const p = renderStem(key).then((b) => { this.loading.delete(key); if (b) { this.buffers.set(key, b); this._evict(); } return b; }).catch((e) => { this.loading.delete(key); console.warn('stem render', key, e); return null; });
    this.loading.set(key, p);
    return p;
  }
  _evict() {
    if (this.buffers.size <= MAX_CACHE) return;
    const live = new Set(this.scene ? [...this.scene.nodes.keys()] : []);
    for (const k of this.buffers.keys()) { if (this.buffers.size <= MAX_CACHE) break; if (!live.has(k)) this.buffers.delete(k); }
  }
  /** pre-render the other layers of a scene one at a time (async native rendering; the main thread only builds the node graph) */
  _prerender(scene, family) {
    for (const key of stemsForScene(scene, family)) this.queue = this.queue.then(() => new Promise((r) => setTimeout(r, 250))).then(() => this._load(key)).catch(() => {});
  }

  // ---------------------------------------------------------------- the tick (5 Hz)
  _tick(dt) {
    const a = this.a, ctx = a.ctx;
    if (!ctx) return;
    if (!this.enabled) {
      if (this.scene) { this._retire(this.scene, 1.5); this.scene = null; this.wantId = null; }
      if (this.menu && !a.music) { this.menu = false; a.playMusic('menu_theme', 0.5); }   // dynamic music switched off on the title screen: legacy loop takes over
      if (!this.old.length) this._sleep();
      return;
    }
    this._ensureOut();
    const now = ctx.currentTime;
    if (this.menu && a.music) { a.music.stop(1.5); a.music = null; }                        // dynamic music switched on on the title screen
    const pick = this.menu || this.gctx ? pickScene({ ...(this.gctx || {}), menu: this.menu, intensity: a.settings.musicIntensity ?? 0.7 }) : { scene: 'off', family: null, stems: {} };
    const id = pick.scene + ':' + (pick.family || '');
    // ---- scene change
    if (id !== (this.scene?.id || 'off:') && id !== this.pendingId && Date.now() >= this.failUntil) {
      this.wantId = id;
      if (pick.scene === 'off') { this._retire(this.scene, SCENE_FADE); this.scene = null; this.pendingId = null; if (!this.old.length) this._sleep(); }
      else {
        this.pendingId = id;
        const first = Object.keys(pick.stems)[0];
        this._load(first).then((buf) => {
          if (this.pendingId !== id) return;
          this.pendingId = null;
          if (!buf) { this.failUntil = Date.now() + 10000; return; }   // render failed: do not retry every tick
          if (this.wantId !== id) return;
          this._enter(id, pick);
        });
      }
    }
    // ---- follow the layers
    const sc = this.scene;
    if (sc && sc.id === id) {
      this.levels = sc.state.step(dt, pick.stems);
      this._apply(sc, this.levels, now);
    }
    // ---- duck: Algorithm speech / dance music / a sting that is ringing
    const target = duckLevel({ speech: this.flags.speech, dance: this.flags.dance, sting: now < this.stingUntil, cinematic: this.flags.cinematic });
    if (Math.abs(target - this.duck) > 0.01) { this.out.gain.setTargetAtTime(target, now, duckTc(this.duck, target)); this.duck = target; }
  }

  _enter(id, pick) {
    const ctx = this.a.ctx, now = ctx.currentTime;
    const prev = this.scene;
    const start = prev ? nextGrid(now, prev.t0, SCENE_FADE) : now + 0.06;      // bar line of the running scene (same tempo everywhere)
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(this.out);
    bus.gain.setValueAtTime(0, start);
    bus.gain.setValueCurveAtTime(curve((p) => equalPower(p).in), start, prev ? SCENE_FADE : 1.5);
    const sc = { id, scene: pick.scene, family: pick.family, t0: start, bus, nodes: new Map(), state: new ScoreState() };
    sc.state.level = { ...pick.stems };
    this.scene = sc;
    if (prev) { this._retire(prev, SCENE_FADE, start); this.scene = sc; }
    this._apply(sc, sc.state.level, now, true);
    this._prerender(pick.scene, pick.family);
  }

  _retire(sc, fade, at) {
    if (!sc) return;
    const ctx = this.a.ctx, now = ctx.currentTime, start = at ?? now;
    sc.bus.gain.cancelScheduledValues(now);
    sc.bus.gain.setValueAtTime(at ? 1 : sc.bus.gain.value, start);
    sc.bus.gain.setValueCurveAtTime(curve((p) => equalPower(p).out), start, Math.max(0.05, fade));
    this.old.push(sc);
    setTimeout(() => {
      for (const n of sc.nodes.values()) { try { n.src.stop(); } catch { /* already stopped */ } }
      try { sc.bus.disconnect(); } catch { /* gone */ }
      this.old = this.old.filter((s) => s !== sc);
    }, (start - now + fade + 0.3) * 1000);
  }

  _apply(sc, levels, now, entering = false) {
    const ctx = this.a.ctx;
    const keys = new Set([...Object.keys(levels), ...sc.nodes.keys()]);
    for (const key of keys) {
      const lv = levels[key] || 0, target = lv * (STEM_GAIN[key] || 0.8);
      let n = sc.nodes.get(key);
      if (!n) {
        if (lv < 0.01) continue;
        const buf = this.buffers.get(key);
        if (!buf) { this._load(key); continue; }
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        const gn = ctx.createGain(); gn.gain.value = 0; src.connect(gn).connect(sc.bus);
        const when = entering && sc.nodes.size === 0 ? Math.max(sc.t0, now + 0.02) : nextGrid(now, sc.t0, BEAT);
        src.start(when, loopOffset(when, sc.t0));
        n = { src, gain: gn, last: 0, zero: null };
        sc.nodes.set(key, n);
        gn.gain.setValueAtTime(0, now);
        gn.gain.setTargetAtTime(target, when, 0.12);
        n.last = target;
        continue;
      }
      if (target === 0) {
        if (n.zero === null) n.zero = now;
        else if (now - n.zero > ZERO_STOP && n.last === 0) { try { n.src.stop(); } catch { /* ok */ } sc.nodes.delete(key); continue; }
      } else n.zero = null;
      if (Math.abs(target - n.last) < 0.02 && !(target === 0 && n.last !== 0)) continue;
      const rising = target > n.last && n.last < 0.03;
      const at = rising ? nextGrid(now, sc.t0, quantOf(key)) : now;      // layers enter on the next beat / bar, everything else follows immediately
      const p = n.gain.gain;
      p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.setTargetAtTime(target, at, rising ? 0.12 : 0.25);
      n.last = target;
    }
  }

  // ---------------------------------------------------------------- stingers (the stream jingle and friends)
  sting(id, vol = 1) {
    if (!VARIANTS[id] || !this.a.ctx || !this.a.buses || !canRender()) return false;
    const nowMs = Date.now();
    if (nowMs - (this.lastSting.get(id) || 0) < 2500) return false;
    this.lastSting.set(id, nowMs);
    this._ensureOut();
    const play = (buf) => {
      const ctx = this.a.ctx;
      if (!buf || Date.now() - nowMs > 2500) return;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const gn = ctx.createGain(); gn.gain.value = Math.max(0, Math.min(1.5, vol));
      src.connect(gn).connect(this.stingOut); src.start();
      this.stingUntil = Math.max(this.stingUntil, ctx.currentTime + buf.duration * 0.7);
      if (this.scene || this.menu) this._wake();
    };
    if (this.motifs.has(id)) { play(this.motifs.get(id)); return true; }
    if (!this.motifLoading.has(id)) this.motifLoading.set(id, renderMotif(id).then((b) => { this.motifs.set(id, b); this.motifLoading.delete(id); return b; }).catch(() => { this.motifLoading.delete(id); return null; }));
    this.motifLoading.get(id).then(play);
    return true;
  }

  snapshot() { return { scene: this.scene?.id || null, levels: { ...this.levels }, duck: this.duck, cached: [...this.buffers.keys()], menu: this.menu, loop: LOOP }; }
  dispose() { this._sleep(); this._retire(this.scene, 0.2); this.scene = null; }
}
