// SFX - creature voices, footsteps and biome ambience beds (module `sfx`, docs/wave4/sfx.md). Installed with `this.useModule('cvoice', installSfx) (game.cvoice; game.sfx stays the core sfx function)`.
//  1. every creature type (src/game/sfx_profiles.js) has its own procedural voice: idle / alert / chase / attack / hurt / death / footsteps, rendered
//     lazily with src/audio/creaturevoice.js (32 kHz buffers, cached per voice) and played 3D through the shared AudioManager panner (HRTF,
//     distance rolloff, wall occlusion lowpass + a level dip through walls, dull air for far sources);
//  2. it runs entirely on the client from the replicated CreatureView state (state changes, hp events, movement) - nothing is sent over the network
//     and the host simulation is untouched. Timing / pitch are seeded per creature id (a pack of Spam Bots does not chant in unison);
//  3. cooldowns per creature + per creature TYPE (crowds), a voice cap and distance gates keep it readable; the cues are meant to be LOCATABLE:
//     alerts / attacks carry far, idle calls are quiet tells, big things shake the floor with their steps;
//  4. a player's custom Sound pack (src/audio/soundpack.js) wins over the synth per event: creature_<type>_<event>, creature_any_<event>, voice_<n>;
//  5. biome / interior ambience beds are layered under the existing ambience ('sxbed' layer).
// Hooks: creatures.js CreatureView.setState -> game.cvoice.onState(view, prev, state) (returns 'own' when the stock recorded sound must not play),
// CreatureManager 'hp' -> game.cvoice.onHurt(view, d). Everything else runs from the mods 'update' event. API: see the returned object.
import * as THREE from 'three';
import { CREATURES } from './creatures.js';
import { MOONS } from './moons.js';
import { insideShip } from '../world/ship.js';
import { FACILITY_Y } from '../world/facility.js';
import { interiorFootstep } from '../world/interiors/index.js';
import { footSurface } from '../entities/localplayer.js';
import { renderCreatureSound, RENDER_SR, VARIANTS } from '../audio/creaturevoice.js';
import { renderBed, bedFor, BED_LEVEL } from '../audio/sfx_beds.js';
import {
  VOICES, profileFor, stateEvent, isIdleState, isMovingState, EVENT_COOLDOWN, EVENT_VOL, EVENT_REACH, CROWD_GAP, creatureSeed,
} from './sfx_profiles.js';

const MAX_VOICES = 10;              // simultaneous creature sounds of this layer
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SOFT_SURFACE = { grass: 0.7, snow: 0.55, mud: 0.8, carpet: 0.6, sand: 0.7, dirt: 0.8 };
const LAYER_SURFACE = new Set(['metal', 'gravel', 'water', 'wood', 'tile', 'concrete']);
const NO_SURFACE_LAYER = new Set(['none', 'flap', 'rumble', 'wheel', 'squelch']);

export function installSfx(game) {
  const audio = game.audio;
  const offs = [];
  const st = new WeakMap();                       // CreatureView -> runtime state
  const crowdLast = new Map();                    // `${type}|${event}` -> clock of the last sound
  const live = new Set();                         // handles of this layer (voice cap)
  const listeners = new Set();
  let clock = 0, disposed = false, surfaceResolver = null;
  let bed = { name: null, timer: 0 };
  const stats = { played: 0, skipped: 0, byEvent: {}, lastCue: null };
  const primed = new Set();
  const queue = [];                                // render jobs (one per idle slice)
  let queueBusy = false;

  const pack = () => (audio?.pack && audio.pack.enabled ? audio.pack : null);

  // ------------------------------------------------------------------ buffers (procedural)
  function ensure(vid, event, variant) {
    if (!audio?.ctx) return null;
    const name = `sx:${vid}:${event}:${variant}`;
    if (audio.buffers.has(name)) return audio.buffers.get(name) ? name : null;
    try {
      const voice = event === 'step' ? { foot: vid.slice(5) } : VOICES[vid];
      if (!voice) { audio.buffers.set(name, null); return null; }
      const data = renderCreatureSound(voice, event, variant, RENDER_SR, vid);
      const buf = audio.ctx.createBuffer(1, data.length, RENDER_SR);
      buf.copyToChannel(data, 0);
      audio.buffers.set(name, buf);
      return name;
    } catch (e) { console.warn('[sfx] render', name, e); audio.buffers.set(name, null); return null; }
  }
  const jobFor = (vid, event, variant) => () => ensure(vid, event, variant);
  /** render this creature's sounds ahead of time, one small job per idle slice (the first play must not hitch) */
  function prime(type, def) {
    const p = profileFor(type, def);
    const jobs = [];
    if (!primed.has(p.voice)) { primed.add(p.voice); for (const ev of ['idle', 'alert', 'chase', 'attack', 'hurt', 'death']) jobs.push(jobFor(p.voice, ev, 0)); }
    const fid = 'foot:' + p.foot;
    if (p.foot !== 'none' && !primed.has(fid)) { primed.add(fid); jobs.push(jobFor(fid, 'step', 0), jobFor(fid, 'step', 1)); }
    queue.push(...jobs);
    if (!queueBusy && queue.length) { queueBusy = true; pump(); }
  }
  function pump() {
    if (disposed) return;
    const job = queue.shift();
    if (!job) { queueBusy = false; return; }
    try { job(); } catch { /* one bad recipe must not stop the rest */ }
    const next = () => pump();
    if (typeof requestIdleCallback === 'function') requestIdleCallback(next, { timeout: 250 }); else setTimeout(next, 16);
  }

  // ------------------------------------------------------------------ helpers
  function state(view) {
    let s = st.get(view);
    if (s) return s;
    const seed = creatureSeed(view.id, view.type);
    s = { seed, r: seed.r, last: {}, pitch: seed.pitch, gap: seed.gap, lastPos: view.pos.clone(), stepDist: 0, nextVoc: 0, nextChase: 0, born: clock, prof: null };
    s.prof = profileFor(view.type, view.def || CREATURES[view.type]);
    const [a, b] = s.prof.idle;
    s.nextVoc = clock + (b > 0 ? (a + (b - a) * seed.phase) * s.gap : 1e9);
    s.nextChase = clock + 3 * s.gap;
    st.set(view, s);
    prime(view.type, view.def || CREATURES[view.type]);
    return s;
  }
  const canHear = (view) => !disposed && audio?.ctx && !view.hidden && view.audible?.() !== false && view.root?.visible !== false;
  const listener = () => audio.listenerPos;

  /** Which surface is under `pos` (same rules as game.footstep, minus the audio). hook: setSurfaceResolver(fn(pos) -> 'metal' | 'grass' | ...) */
  function surfaceAt(pos) {
    try {
      if (surfaceResolver) { const r = surfaceResolver(pos); if (r) return r; }
      let surf = 'concrete';
      const w = game.world;
      if (insideShip(pos)) surf = 'metal';
      else if (pos.y < FACILITY_Y + 40) surf = interiorFootstep(w.facility, pos) || (w.facility?.layout?.theme === 'mansion' ? 'wood' : 'concrete');
      else if (w.company) surf = 'concrete';
      else if (w.terrain) {
        const g = w.terrain.biome?.ground || '';
        surf = w.terrain.footSurface?.(pos) || (g === 'snow' ? 'snow' : g === 'mud' ? 'mud' : g.includes('sand') ? 'sand' : 'grass');
      }
      return footSurface(game, pos, surf) || surf;
    } catch { return 'concrete'; }
  }

  /**
   * Play one creature sound. Returns true when something was (or would have been, if only distance / cooldown stopped it) started.
   * opts: keep (the stock sound plays too: lower our level), force (ignore cooldowns), pos (override position), volume (extra multiplier)
   */
  function play(view, event, opts = {}) {
    if (!canHear(view)) return false;
    const s = state(view), prof = s.prof;
    const pos = opts.pos || view.pos;
    const L = listener();
    const dx = pos.x - L.x, dy = pos.y - L.y, dz = pos.z - L.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const background = event === 'idle' || event === 'chase' || event === 'step';
    const reach = prof.range[1] * EVENT_REACH[event] * (event === 'idle' ? 0.8 : 1);
    if (dist > reach) { stats.skipped++; return false; }
    if (!opts.force) {
      const cd = EVENT_COOLDOWN[event] * s.gap * (event === 'hurt' ? 2 : 1);
      if (cd && clock - (s.last[event] ?? -99) < cd) return false;
      const ck = view.type + '|' + event, gap = CROWD_GAP[event] * (prof.crowd ? 2.2 : 1);
      if (gap && clock - (crowdLast.get(ck) ?? -99) < gap) return false;
      if (live.size >= MAX_VOICES && (event === 'idle' || event === 'chase' || event === 'step')) { stats.skipped++; return false; }
    }
    s.last[event] = clock; crowdLast.set(view.type + '|' + event, clock);
    // what to play: pack file > voice line (humanoids) > synth
    const pk = pack();
    let name = null, fromPack = false;
    if (pk) {
      name = pk.pick(`creature_${view.type}_${event}`, s.r) || pk.pick(`creature_any_${event}`, s.r);
      if (!name && prof.human && (event === 'alert' || event === 'chase' || event === 'idle') && s.r() < (event === 'alert' ? 0.4 : event === 'chase' ? 0.2 : 0.15)) name = pk.pick('voice', s.r);
      fromPack = !!name;
    }
    let variant = 0;
    if (!name) {
      variant = Math.floor(s.r() * (event === 'step' ? 2 : VARIANTS)) % (event === 'step' ? 2 : VARIANTS);
      const vid = event === 'step' ? 'foot:' + prof.foot : prof.voice;
      if (event === 'step' && prof.foot === 'none') return false;
      name = ensure(vid, event, variant) || ensure(vid, event, 0);
      if (!name) return false;
    }
    // level: profile x event x per-creature wobble, dipped a little through walls, quieter when the stock sound plays too
    let vol = EVENT_VOL[event] * prof.vol * (opts.volume ?? 1) * (0.9 + 0.2 * s.r());
    if (opts.keep) vol *= 0.6;
    // Background creatures recede when the room fills; attack/alert tells retain their level.
    if (background) vol *= Math.max(0.4, 1 / Math.sqrt(1 + live.size * 0.65));
    if (event === 'step' && prof.sil) vol *= prof.sil;
    let occl = 0;
    try { occl = audio.occluder ? audio.occluder(pos) || 0 : 0; } catch { occl = 0; }
    vol *= 1 - 0.4 * occl;
    let pitch = prof.pitch * s.pitch * (0.97 + 0.06 * s.r());
    if (event === 'step') pitch *= clamp(1.5 / Math.max(0.5, prof.stride), 0.55, 1.45);   // big things = lower, slower steps
    if (fromPack) pitch = 1;
    const staticPos = !!opts.pos || event === 'step';
    const h = audio.play(name, {
      pos: staticPos ? (opts.pos ? pos : pos.clone()) : undefined, follow: staticPos ? undefined : view.root, volume: vol, pitch, occlude: true,
      lowpass: dist > 22 ? clamp(9000 - dist * 90, 2200, 9000) : undefined,
      refDistance: prof.range[0], maxDistance: Math.max(reach, prof.range[0] + 5), rolloff: event === 'step' ? 1.6 : 1.25, reverb: event === 'step' ? 0.25 : 0.5,
    });
    if (!h) return false;
    live.add(h);
    const done = () => live.delete(h);
    h.src.addEventListener?.('ended', done);
    setTimeout(done, 4000).unref?.();
    // footsteps also get the floor's own texture (existing step_<surface> samples) at a low level
    if (event === 'step' && !fromPack && !NO_SURFACE_LAYER.has(prof.foot)) {
      const surf = surfaceAt(view.pos);
      const soft = SOFT_SURFACE[surf];
      if (LAYER_SURFACE.has(surf) || soft) {
        const sn = audio.variant('step_' + surf);
        if (audio.has(sn)) audio.play(sn, { pos, volume: vol * 0.45 * (soft || 1), pitch: pitch * 0.9, occlude: true, refDistance: prof.range[0] * 0.6, maxDistance: reach, reverb: 0.2 });
      }
    }
    stats.played++; stats.byEvent[event] = (stats.byEvent[event] || 0) + 1;
    stats.lastCue = { id: view.id, type: view.type, event, dist: +dist.toFixed(1), t: clock };
    if (listeners.size) for (const fn of listeners) { try { fn(stats.lastCue, view); } catch { /* observer bugs stay local */ } }
    game.mods?.emit?.('sx:cue', stats.lastCue, view);
    return true;
  }

  // ------------------------------------------------------------------ hooks called by creatures.js
  function onState(view, prev, stt) {
    try {
      // These machines own their precise wind-up cues; a generic robot voice would mask counterplay.
      if (view.type === 'c13_printer' || view.type === 'c13_checksum' || view.type === 'e14_warden') return false;
      const ev = stateEvent(stt);
      if (!ev || disposed || !audio?.ctx) return false;
      const s = state(view);
      if (ev === 'chase') s.nextChase = clock + (3.5 + 3 * s.r()) * s.gap;
      if (!canHear(view)) return false;
      const keep = s.prof.keep.includes(ev);
      const pk = pack();
      const custom = !!(pk && (pk.has(`creature_${view.type}_${ev}`) || pk.has(`creature_any_${ev}`)));
      play(view, ev, { keep: keep && !custom });
      return keep && !custom ? false : 'own';
    } catch (e) { console.warn('[sfx] onState', e); return false; }
  }
  function onHurt(view, d) {
    try {
      if (!d?.dmg || view.state === 'dead' || (view.hp !== null && view.hp <= 0)) return;
      const s = state(view);
      play(view, 'hurt', { keep: s.prof.keep.includes('hurt') });
    } catch (e) { console.warn('[sfx] onHurt', e); }
  }

  // ------------------------------------------------------------------ per-frame: ambient calls, chase calls, footsteps, beds
  function tickCreatures(dt) {
    const M = game.creatures;
    if (!M?.views?.size || !audio?.ctx) return;
    const L = listener();
    for (const view of M.views.values()) {
      if (!view.root || view.state === 'dead') continue;
      const s = state(view);
      const p = view.pos;
      // -- footsteps: distance travelled (the view position is smoothed, so this is the real on-screen stride)
      const mx = p.x - s.lastPos.x, mz = p.z - s.lastPos.z;
      const moved = Math.sqrt(mx * mx + mz * mz);
      s.lastPos.copy(p);
      if (s.prof.foot !== 'none' && moved < 4 && moved > 0.002 && dt > 0 && (isMovingState(view.state) || moved / dt > 0.9)) {
        s.stepDist += moved;
        if (s.stepDist >= s.prof.stride * s.gap) {
          s.stepDist = 0;
          const ddx = p.x - L.x, ddz = p.z - L.z;
          if (ddx * ddx + ddz * ddz < 55 * 55 && play(view, 'step')) { /* played */ }
        }
      }
      // -- ambient calls while unaware, repeated calls while hunting
      if (clock >= s.nextVoc && s.prof.idle[1] > 0) {
        const [a, b] = s.prof.idle;
        s.nextVoc = clock + (a + (b - a) * s.r()) * s.gap;
        if (isIdleState(view.state)) play(view, 'idle');
      }
      if (clock >= s.nextChase && stateEvent(view.state) === 'chase') {
        s.nextChase = clock + (3.5 + 3 * s.r()) * s.gap;
        play(view, 'chase');
      }
    }
  }

  function tickBed(dt) {
    bed.timer -= dt;
    if (bed.timer > 0) return;
    bed.timer = 1;
    if (!audio?.ctx) return;
    let want = null;
    const p = game.player, ph = game.run?.phase;
    if (p && !p.inShip && ph && ph !== 'orbit') {
      const w = game.world;
      if (p.indoor) want = bedFor({ indoor: true, interior: w.facility?.layout?.theme });
      else if (w.company) want = 'pier';
      else want = bedFor({ biome: MOONS[w.moonId]?.biome, ground: w.terrain?.biome?.ground });
    }
    const vol = want ? (BED_LEVEL[want] ?? 0.5) * 0.6 : 0;
    const cur = audio.ambience.get('sxbed');
    if (want === bed.name && (!want || (cur && !cur.stopped))) return;
    bed.name = want;
    if (!want) { audio.setAmbience('sxbed', null, 0, 2); return; }
    // pack override for the bed (amb_<bed>.ogg) or the procedural loop
    const pk = pack();
    let name = pk?.pick('amb_' + want) || null;
    if (!name) {
      name = `sx:bed:${want}`;
      if (!audio.buffers.has(name)) {
        try {
          const data = renderBed(want, 22050);
          const buf = audio.ctx.createBuffer(1, data.length, 22050);
          buf.copyToChannel(data, 0);
          audio.buffers.set(name, buf);
        } catch (e) { console.warn('[sfx] bed', want, e); audio.buffers.set(name, null); bed.name = null; return; }
      }
    }
    audio.setAmbience('sxbed', name, vol, 3);
  }

  offs.push(game.mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    clock += dt;
    try { tickCreatures(dt); } catch (e) { console.warn('[sfx] tick', e); }
    try { tickBed(dt); } catch (e) { console.warn('[sfx] bed tick', e); }
  }));
  // a changed pack (import / clear / toggle) must re-pick the ambience bed
  if (audio?.pack) offs.push(audio.pack.onChange(() => { bed.name = null; bed.timer = 0; }));

  // ------------------------------------------------------------------ chat command: /sfx [play <type> <event> | pack | stats]
  const cmds = game.mods?.chatCommands;
  const say = (m) => { try { game.ui?.systemMessage ? game.ui.systemMessage(m) : game.ui?.toast?.(m); } catch { /* ignore */ } };
  cmds?.set?.('sfx', {
    owner: null,
    fn: (args) => {
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'play') {
        const type = args[1] || 'lurker', event = args[2] || 'alert';
        const v = { id: 'test', type, def: CREATURES[type], pos: game.player.pos.clone().add(new THREE.Vector3(0, 0, -6)), root: { visible: true }, hidden: false, audible: () => true, state: 'idle', hp: 1 };
        say(play(v, event, { force: true, pos: v.pos }) ? `sfx ${type}/${event}` : 'sfx: nothing played (unknown event?)');
      } else if (sub === 'pack') {
        const pk = audio?.pack; say(pk ? `pack: ${pk.count} files, ${pk.enabled ? 'on' : 'off'}` : 'pack: not ready');
      } else say(`sfx: played ${stats.played}, skipped ${stats.skipped}. /sfx play <type> <event> | /sfx pack`);
    },
  });

  return {
    /** play one of a creature's sounds at its own position (view = CreatureView); returns true when started */
    play,
    /** play a creature sound for a type at a position without a view (tests, other modules); event = idle|alert|chase|attack|hurt|death|step */
    playType(type, event, pos, opts = {}) {
      const v = { id: opts.id || 'x' + type, type, def: CREATURES[type], pos, root: { visible: true }, hidden: false, audible: () => true, state: 'idle', hp: 1 };
      return play(v, event, { force: true, pos, ...opts });
    },
    onState, onHurt,
    /** override how the floor under a creature is classified: fn(pos) -> 'metal' | 'grass' | ... | null */
    setSurfaceResolver(fn) { surfaceResolver = typeof fn === 'function' ? fn : null; },
    surfaceAt,
    /** observe every creature cue (id, type, event, dist): (cue, view) => void; returns an unsubscribe. Also emitted as mods event 'sx:cue'. */
    onCue(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    prime,
    stats, profileFor,
    get bed() { return bed.name; },
    dispose() {
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      for (const h of live) h.stop?.(0.05);
      live.clear();
      try { audio?.setAmbience?.('sxbed', null, 0, 1); } catch { /* ignore */ }
      cmds?.delete?.('sfx');
    },
  };
}
