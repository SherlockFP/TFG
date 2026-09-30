// ATMOS - procedural ambience beds + slow random events (module 'atmos', docs/wave8/atmos.md). Local only, no network.
// The owner found the game's sound irritating; the mood target is a Lethal-Company interior: low hum, distant pipes, metal creaks and
// SILENCE between them so a creature's footsteps stay readable. Everything is synthesised with WebAudio (no assets):
//  * one bed per context (ship, facility themes, maze / labyrinth, backrooms, outdoors per biome / weather / night, company), crossfaded
//    over ~3 s; the bed = a few continuous layers (hum, filtered noise, fluorescent buzz, CRT whine) + a scheduler of one-shot events
//    (pipe ping, metal creak, far door, vent, drip, structural groan, relay click, light flicker, gust, insects, thunder) at 5-26 s gaps,
//    with a 25% chance of a long dead-silence gap;
//  * creature cues (mods event 'sx:cue' from the sfx module) hold the events back for a few seconds, duck music / UI / ambience and
//    pull the bed level down, so quiet steps and growls are not masked;
//  * routes through the 'amb' bus, so the new "Ambience volume" setting (settings.ambienceVolume) scales it.
// The pure rules (context, bed table, scheduling) are in atmos_core.js; the mix policy for one-shots (cooldowns, trims) in audio/mixpolicy.js.
import { addTranslations } from '../core/i18n.js';
import { hashString } from '../core/rng.js';
import { MOONS } from './moons.js';
import { contextOf, ctxKey, bedFor, pickEvent, nextGap, cueEffect } from './atmos_core.js';

addTranslations({ 'Ambience volume': 'Ortam sesi' }, 'tr');
addTranslations({ 'Ambience volume': 'Громкость атмосферы' }, 'ru');

const R = (a, b) => a + Math.random() * (b - a);

export function installAtmos(game) {
  const audio = game.audio;
  const offs = [];
  let disposed = false, E = null;
  const S = { key: '', ctx: { kind: 'none', sub: '' }, bed: null, old: [], evTimer: 6, quiet: 0, snapT: 0, lastDuck: -9, clock: 0, fired: 0, last: '' };

  // ------------------------------------------------------------------ audio graph
  function init() {
    const ctx = audio.ctx;
    const main = ctx.createGain(); main.gain.value = 1; main.connect(audio.buses.amb);   // trim: dips under creature cues
    const bufs = {};
    const mk = (kind) => {
      const len = Math.floor(ctx.sampleRate * 4), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
      // loop seam: short crossfade of the tail into the head
      const xf = Math.floor(ctx.sampleRate * 0.05);
      for (let i = 0; i < xf; i++) { const k = i / xf; d[len - xf + i] = d[len - xf + i] * (1 - k) + d[i] * k; }
      return b;
    };
    E = { ctx, main, noise: (k) => (bufs[k] ||= mk(k)) };
  }

  function noiseSrc(kind, t = 0, dur = 0) {
    const s = E.ctx.createBufferSource(); s.buffer = E.noise(kind); s.loop = true; s.loopEnd = 3.9;
    s.start(t || E.ctx.currentTime, Math.random() * 3.5);
    if (dur) s.stop((t || E.ctx.currentTime) + dur);
    return s;
  }
  const seedOff = () => (hashString(String(game.run?.seed ?? 1) + S.ctx.kind) % 1000) / 1000;

  function buildLayer(L, out, nodes, off) {
    const ctx = E.ctx, lg = ctx.createGain();
    const lfo = (rate, depth, param) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g).connect(param); o.start(); nodes.push(o); };
    if (L.t === 'hum') {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = L.lp; lp.connect(lg);
      const det = 1 + (off - 0.5) * 0.05;
      for (const [f, g] of L.f) {
        for (const [ratio, gm] of [[1, 1], [1.0037, 0.5]]) {   // a slightly detuned twin makes the slow beating of real mains hum
          const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * det * ratio; og.gain.value = g * gm;
          o.connect(og).connect(lp); o.start(); nodes.push(o);
        }
      }
      const depth = L.wob[1]; lg.gain.value = L.g * (1 - depth / 2); lfo(L.wob[0] * (0.8 + off * 0.4), L.g * depth / 2, lg.gain);
    } else if (L.t === 'noise') {
      const s = noiseSrc(L.n), f = ctx.createBiquadFilter(); f.type = L.ft; f.frequency.value = L.f; f.Q.value = L.q;
      s.connect(f).connect(lg); nodes.push(s);
      const [rate, fd, gd] = L.lfo; lg.gain.value = L.g * (1 - gd / 2);
      lfo(rate * (0.8 + off * 0.4), fd, f.frequency); lfo(rate * 0.7, L.g * gd / 2, lg.gain);
    } else if (L.t === 'buzz') {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = L.f * (1 + (off - 0.5) * 0.02);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = L.f * 2; bp.Q.value = 1.2;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      o.connect(bp).connect(lp).connect(lg); o.start(); nodes.push(o);
      lg.gain.value = L.g * 0.5; out.buzz = lg;
    } else if (L.t === 'tone') {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = L.f; o.connect(lg); o.start(); nodes.push(o);
      lg.gain.value = L.g; lfo(0.05, 25, o.frequency);
    }
    lg.connect(out);
  }

  function startBed(def) {
    if (!def) return null;
    const ctx = E.ctx, out = ctx.createGain(), nodes = [], off = seedOff();
    out.gain.value = 0; out.connect(E.main);
    for (const L of def.layers) { try { buildLayer(L, out, nodes, off); } catch (e) { console.warn('[atmos] layer', e); } }
    out.gain.setTargetAtTime(def.level, ctx.currentTime, 1.4);
    return { def, out, nodes };
  }
  function stopBed(b) {
    if (!b) return;
    try { b.out.gain.setTargetAtTime(0, E.ctx.currentTime, 0.9); } catch { /* ignore */ }
    S.old.push(b);
    setTimeout(() => { for (const n of b.nodes) { try { n.stop(); } catch { /* ignore */ } } try { b.out.disconnect(); } catch { /* ignore */ } S.old = S.old.filter((x) => x !== b); }, 6000);
  }

  // ------------------------------------------------------------------ one-shot events (distant, low-passed, panned, with reverb)
  function voice(dur, { pan = R(-0.8, 0.8), wet = 0.5, lp = 1600, peak = 0.3 } = {}) {
    const ctx = E.ctx, t = ctx.currentTime + 0.02;
    const g = ctx.createGain(); g.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; g.connect(f);
    let tail = f;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; f.connect(p); tail = p; }
    const bedGain = S.bed ? S.bed.def.level : 0.45;
    const o = ctx.createGain(); o.gain.value = peak * (0.6 + bedGain); tail.connect(o); o.connect(E.main);
    const wv = wet * Math.min(1.5, (game.settings?.ambienceVolume ?? 0.8) / 0.8) * 0.5;
    if (audio.reverb && wv > 0) { const w = ctx.createGain(); w.gain.value = wv; o.connect(w).connect(audio.reverb); }
    const v = { ctx, t, g, dur, env(a = 0.01, pk = 1) { g.gain.setValueAtTime(0, v.t); g.gain.linearRampToValueAtTime(pk, v.t + a); g.gain.exponentialRampToValueAtTime(0.0001, v.t + dur); } };
    return v;
  }
  const osc = (v, type, f, t0 = 0, dur = v.dur) => { const o = v.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, v.t + t0); o.start(v.t + t0); o.stop(v.t + t0 + dur + 0.05); return o; };

  const EV = {
    ping(bed) {   // a pipe / duct knocked somewhere far away: three inharmonic partials
      const f = R(130, 480), v = voice(2.4, { wet: 0.9, lp: 1300, peak: 0.32 }); v.env(0.004);
      for (const [r, gm, d] of [[1, 1, 1], [2.76, 0.5, 0.6], [5.4, 0.22, 0.3]]) {
        const o = osc(v, 'sine', f * r), g = v.ctx.createGain(); g.gain.setValueAtTime(gm, v.t); g.gain.exponentialRampToValueAtTime(0.001, v.t + d * R(1.2, 2)); o.connect(g).connect(v.g);
      }
    },
    creak(bed) {   // a stressed metal panel: a sawtooth glide with a stuttering amplitude
      const v = voice(R(1, 1.9), { wet: 0.6, lp: 1100, peak: 0.13 }); v.env(0.35);
      const f0 = R(90, 170), o = osc(v, 'sawtooth', f0); o.frequency.linearRampToValueAtTime(f0 * R(0.75, 1.3), v.t + v.dur);
      const bp = v.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(R(300, 500), v.t); bp.frequency.linearRampToValueAtTime(R(500, 900), v.t + v.dur); bp.Q.value = 6;
      const st = v.ctx.createGain(); st.gain.value = 0.6; const lf = osc(v, 'square', R(14, 28)), lg = v.ctx.createGain(); lg.gain.value = 0.4; lf.connect(lg).connect(st.gain);
      o.connect(bp).connect(st).connect(v.g);
    },
    door(bed) {   // a far door: one or two dull thuds
      const n = Math.random() < 0.5 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const v = voice(0.5, { wet: 0.9, lp: 700, peak: k ? 0.2 : 0.34 }); v.t += k * R(0.35, 1.1); v.env(0.005);
        const o = osc(v, 'sine', 95); o.frequency.exponentialRampToValueAtTime(42, v.t + 0.3); o.connect(v.g);
        const s = noiseSrc('white', v.t, 0.15), nl = v.ctx.createBiquadFilter(); nl.type = 'lowpass'; nl.frequency.value = 420; const ng = v.ctx.createGain(); ng.gain.value = 0.5; s.connect(nl).connect(ng).connect(v.g);
      }
    },
    vent(bed) {   // air moving through a duct
      const v = voice(R(1.6, 2.6), { wet: 0.5, lp: 1800, peak: 0.16 }); v.env(0.7);
      const s = noiseSrc('white', v.t, v.dur + 0.1), bp = v.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(450, v.t); bp.frequency.linearRampToValueAtTime(R(700, 1000), v.t + v.dur * 0.5); bp.frequency.linearRampToValueAtTime(420, v.t + v.dur);
      s.connect(bp).connect(v.g);
    },
    drip(bed) {
      const n = Math.random() < 0.4 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const v = voice(0.35, { wet: 1.2, lp: 3200, peak: 0.16 / (1 + k * 0.8) }); v.t += k * R(0.3, 0.8); v.env(0.002);
        const f = R(900, 1600), o = osc(v, 'sine', f); o.frequency.exponentialRampToValueAtTime(f * 0.8, v.t + 0.06); o.connect(v.g);
      }
    },
    groan(bed) {   // the building settling: slow sub-bass glide
      const v = voice(R(3, 5), { wet: 0.8, lp: 400, peak: 0.34 }); v.env(1.2);
      const f = R(38, 62), o = osc(v, 'triangle', f); o.frequency.linearRampToValueAtTime(f * R(0.7, 0.9), v.t + v.dur); o.connect(v.g);
    },
    relay(bed) {   // distant machinery: 1-3 relay clicks + solenoid thunks
      const n = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const v = voice(0.18, { wet: 0.7, lp: 2600, peak: 0.16 }); v.t += k * R(0.12, 0.5); v.env(0.002);
        const s = noiseSrc('white', v.t, 0.02), bp = v.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 2; s.connect(bp).connect(v.g);
        const o = osc(v, 'sine', 125); o.connect(v.g);
      }
    },
    flicker(bed) {   // a fluorescent tube stutters: dip the buzz layer a few times
      const bz = S.bed?.out?.buzz; if (!bz) return;
      const ctx = E.ctx; let t = ctx.currentTime + 0.05; const base = bz.gain.value;
      for (let k = 0, n = 2 + Math.floor(Math.random() * 3); k < n; k++) { bz.gain.setValueAtTime(base * R(0.05, 0.3), t); bz.gain.setValueAtTime(base, t + R(0.03, 0.09)); t += R(0.09, 0.3); }
    },
    gust(bed) {
      const v = voice(R(3.5, 6), { wet: 0.3, lp: 1500, peak: 0.2 }); v.env(1.6);
      const s = noiseSrc('brown', v.t, v.dur + 0.1), bp = v.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(260, v.t); bp.frequency.linearRampToValueAtTime(R(420, 700), v.t + v.dur * 0.4); bp.frequency.linearRampToValueAtTime(240, v.t + v.dur);
      s.connect(bp).connect(v.g);
    },
    chirps(bed) {   // far-off insects: soft chirp trains, never louder than a whisper
      const v = voice(R(2, 4), { wet: 0.2, lp: 4800, peak: 0.05 }); v.g.gain.value = 1;
      const f = R(3200, 4200), o = osc(v, 'sine', f), g = v.ctx.createGain(); g.gain.value = 0; o.connect(g).connect(v.g);
      const per = R(0.06, 0.09); let t = v.t;
      while (t < v.t + v.dur) { for (let i = 0; i < 3; i++) { const u = t + i * per; g.gain.setValueAtTime(0, u); g.gain.linearRampToValueAtTime(0.5, u + 0.006); g.gain.linearRampToValueAtTime(0, u + 0.03); } t += 3 * per + R(0.18, 0.45); }
    },
    thunder(bed) {   // distant rumble
      const v = voice(R(4, 7), { wet: 0.9, lp: 260, peak: 0.42 }); v.env(0.5);
      const s = noiseSrc('brown', v.t, v.dur + 0.1), m = v.ctx.createGain();   // two or three swells inside the decay
      m.gain.setValueAtTime(1, v.t); for (let k = 1; k < 4; k++) m.gain.linearRampToValueAtTime(R(0.4, 1), v.t + v.dur * k / 4);
      s.connect(m).connect(v.g);
    },
    // [sound2] events of the wave-8 beds
    chime(bed) {   // a far PA / school-bell chime: two soft falling notes
      const f = R(420, 640), v = voice(3, { wet: 1.1, lp: 2200, peak: 0.1 }); v.env(0.01);
      [[1, 0], [0.75, R(0.5, 0.8)]].forEach(([r, dt]) => { const o = osc(v, 'sine', f * r, dt, 2.2), g = v.ctx.createGain(); g.gain.setValueAtTime(0, v.t + dt); g.gain.linearRampToValueAtTime(1, v.t + dt + 0.01); g.gain.exponentialRampToValueAtTime(0.001, v.t + dt + 2); o.connect(g).connect(v.g); });
    },
    ice(bed) {   // cold snap: a tick of noise and a short high glide
      const v = voice(0.5, { wet: 0.9, lp: 3500, peak: 0.1 }); v.env(0.003);
      const s = noiseSrc('white', v.t, 0.12), bp = v.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = R(2200, 3400); bp.Q.value = 3; s.connect(bp).connect(v.g);
      const f = R(700, 1100), o = osc(v, 'sine', f); o.frequency.exponentialRampToValueAtTime(f * 0.5, v.t + 0.3); o.connect(v.g);
    },
    bubble(bed) {   // gurgling water: three to five rising blips
      const n = 3 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const v = voice(0.25, { wet: 0.9, lp: 1800, peak: 0.12 }); v.t += k * R(0.08, 0.3); v.env(0.004);
        const f = R(300, 800), o = osc(v, 'sine', f); o.frequency.exponentialRampToValueAtTime(f * 1.8, v.t + 0.12); o.connect(v.g);
      }
    },
    rumble(bed) {   // something huge and far away rolls past (a train in the tunnels, city traffic)
      const v = voice(R(4, 7), { wet: 0.8, lp: 180, peak: 0.34 }); v.env(1.5);
      const s = noiseSrc('brown', v.t, v.dur + 0.1); s.connect(v.g);
    },
  };

  function fire(name) {
    if (!E || !EV[name]) return false;
    try { EV[name](S.bed); S.fired++; S.last = name; return true; } catch (e) { console.warn('[atmos] event', name, e); return false; }
  }

  // ------------------------------------------------------------------ context + main loop
  function snapshot() {
    const p = game.player, run = game.run, w = game.world, tm = run?.time ?? 480;
    let level = null, backrooms = false;
    try { backrooms = !!game.backrooms?.inPocket?.(); if (backrooms || w?.facility?.layout?.theme === 'backrooms') level = game.brlevels?.levelAt?.(p?.pos) || null; } catch { /* optional */ }
    const w3 = game.worlds3;
    return {
      phase: run?.phase, inShip: !!p?.inShip, indoor: !!p?.indoor, company: !!w?.company, theme: w?.facility?.layout?.theme,
      biome: MOONS[w?.moonId]?.biome, weather: run?.weather || 'clear', night: tm > 19 * 60 || tm < 5 * 60, backrooms, level,
      pocket: w3?.pocket?.theme ?? w3?.state?.theme ?? w3?.theme ?? null,   // optional: pocket theme of the wave-8 worlds3 module
    };
  }
  function setContext(c) {
    const key = ctxKey(c);
    if (key === S.key) return;
    S.key = key; S.ctx = c;
    stopBed(S.bed);
    S.bed = startBed(bedFor(c));
    S.evTimer = Math.max(S.evTimer, 3 + Math.random() * 5);   // a settling-in silence after every change of scene
  }
  function trimBeds() {
    audio.ambTrim = { base: 0.55, buzz: 0.4, sxbed: 0.65, ship: 0.7, wind: 0.7, weather: 0.85, m5amb: 0.7, brl: 0.7, brlhum: 0.5, hwhum: 0.7 };
  }

  function tick(dt) {
    if (!audio?.ctx || !audio.ready) return;
    if (!E) { try { init(); } catch (e) { console.warn('[atmos] init', e); E = null; disposed = true; return; } trimBeds(); }
    S.clock += dt;
    const off = (game.settings?.ambienceVolume ?? 0.8) <= 0.01 || audio.ctx.state !== 'running';
    S.snapT -= dt;
    if (S.snapT <= 0) {
      S.snapT = 0.6;
      if (off) { setContext({ kind: 'none', sub: '' }); } else setContext(contextOf(snapshot()));
    }
    if (off || !S.bed) return;
    S.quiet = Math.max(0, S.quiet - dt);
    E.main.gain.setTargetAtTime(S.quiet > 0 ? 0.6 : 1, audio.ctx.currentTime, 0.5);
    if (S.quiet > 0) return;
    S.evTimer -= dt;
    if (S.evTimer <= 0) {
      const name = pickEvent(S.bed.def, Math.random());
      if (name) fire(name);
      S.evTimer = nextGap(S.bed.def, Math.random(), Math.random());
    }
  }
  offs.push(game.mods.on('update', (dt, g) => { if (g !== game || disposed) return; try { tick(dt); } catch (e) { console.warn('[atmos] tick', e); } }));

  // creature cues: keep the silence readable
  offs.push(game.mods.on('sx:cue', (cue) => {
    if (disposed || !E) return;
    const fx = cueEffect(cue); if (!fx) return;
    S.quiet = Math.max(S.quiet, fx.quiet);
    if (S.clock - S.lastDuck > 0.4) { S.lastDuck = S.clock; audio.duck?.(fx.duck, fx.hold, ['amb', 'music', 'ui']); }
  }));

  return {
    /** current context key and the bed that plays */
    get context() { return S.key; },
    get state() { return { key: S.key, fired: S.fired, last: S.last, quiet: S.quiet, evTimer: S.evTimer, bed: !!S.bed }; },
    /** force one event now (tests / chat): ping creak door vent drip groan relay flicker gust chirps thunder */
    fire,
    /** hold events back for `s` seconds (other modules: boss intros, scripted moments) */
    quietFor(s) { S.quiet = Math.max(S.quiet, +s || 0); },
    dispose() {
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      try { stopBed(S.bed); } catch { /* ignore */ }
      if (audio) audio.ambTrim = null;
    },
  };
}
