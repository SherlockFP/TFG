// CREATURE DIRECTOR (wave 8, docs/wave8/creatures_audit.md). Net prefix 'cd'. Host-authoritative.
//   HOST    one threat budget per landing. The vanilla spawners (host.js indoor/outdoor waves, director.js pressure spawns) keep choosing WHAT
//           spawns, but their requests go into a small queue and are released by phase: calm -> build -> peak -> relax, never above the cap of
//           "active threat points near the crew" (K.capOf: quota / sector / hard mode / daily event + mapmods via run.dailyEvent / game.mapmods).
//           Other systems (horde, siege, zombies, backrooms...) are not gated but COUNT: while they are on, the queue simply waits.
//           Once per peak it may add ONE of three rule-changing creatures (crdirector_creatures.js). Far idle ambient creatures are culled in relax.
//   CLIENT  telegraphs, no permanent HUD: a phase cue (sting + lights dip + one caption), a signature approach sound / eyes / dust / flicker per
//           creature type, a screen-edge pulse + thump from the creature's side when it starts tracking you, and a one-line caption naming the
//           rule the first time you meet a creature type.
// Messages (host -> peers): cd {k:'ph', p, n} phase | {k:'tr', id, ty} a hostile started tracking you | {k:'dim', to, ms} | {k:'seize', to}.
// Knobs: game.config.crdirector = false switches the whole thing off (vanilla spawning); game.crdirector.debug() for the live state.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { t, tf, sysMsg } from '../core/i18n.js';
import { CREATURES, registerCreature, canSpawnMore } from './creatures.js';
import { BEHAVIORS, STATE_SOUNDS, LOOPS } from '../entities/creatures.js';
import { MOONS } from './moons.js';
import { getMode } from './difficulty.js';
import * as K from './crdirector_core.js';
import * as N from './crdirector_creatures.js';
import { RULE_LINES } from './crdirector_i18n.js';

const TICK = 0.25;                 // s between host evaluations
const TRACK_R = 36;                // m: a hunter this close that starts tracking you triggers the edge cue
const TRACK_GAP = 1.6;             // s between two edge cues for one player
const TRACK_TYPE_GAP = 12;         // s between two cues from the same creature type for one player
const TELL_GAP = 28;               // s before the same creature repeats its signature cue
const CAPTION_R = 26;              // m: first-encounter caption distance
const CAPTION_S = 6;               // s a caption stays
const SEEN_KEY = 'tfg.cd.seen.v1';

const CSS = `.cd-cap{position:fixed;left:50%;bottom:21%;transform:translateX(-50%);max-width:min(620px,88vw);padding:6px 14px 7px;background:rgba(6,4,3,.62);border-left:3px solid #ff5a3c;color:#efe4c8;font-family:var(--cond,'Barlow Condensed','Arial Narrow',sans-serif);font-size:17px;letter-spacing:.05em;line-height:1.2;text-align:left;pointer-events:none;opacity:0;transition:opacity .35s;z-index:12}
.cd-cap.on{opacity:1}.cd-cap b{color:#ff8a5c;letter-spacing:.09em;font-weight:700}
.cd-edge{position:fixed;inset:0;pointer-events:none;z-index:11}
.cd-edge i{position:absolute;opacity:0;will-change:opacity}
.cd-edge .f{left:0;right:0;top:0;height:16%;background:linear-gradient(to bottom,rgba(255,40,20,.55),rgba(255,40,20,0))}
.cd-edge .b{left:0;right:0;bottom:0;height:16%;background:linear-gradient(to top,rgba(255,40,20,.55),rgba(255,40,20,0))}
.cd-edge .l{top:0;bottom:0;left:0;width:11%;background:linear-gradient(to right,rgba(255,40,20,.55),rgba(255,40,20,0))}
.cd-edge .r{top:0;bottom:0;right:0;width:11%;background:linear-gradient(to left,rgba(255,40,20,.55),rgba(255,40,20,0))}`;

export function installCrdirector(game) {
  const mods = game.mods;
  const offs = [], undo = [];
  let disposed = false, boundNet = null;
  const host = () => !!game.isHost;
  const enabled = () => game.config?.crdirector !== false;
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const S = {
    st: null, q: [], acc: 0, now: 0, rng: new RNG(1), landing: false, residents: 0, orig: {},
    bursts: new Map(), evt: false, evtT: -99, lastStage: 0, newThisLanding: 0, newThisCycle: 0, cullT: 0, trk: new Map(), trkGap: new Map(),
    stats: { spawned: 0, queued: 0, dropped: 0, released: 0, culled: 0, peaks: 0, featured: 0 },
    // client
    told: new Map(), typeTell: new Map(), anyTell: -99, seen: loadSeen(), capT: 0, capCool: 0, scanT: 0, edge: { f: 0, b: 0, l: 0, r: 0 }, edgeSet: { f: -1, b: -1, l: -1, r: -1 },
    darkUntil: 0, cues: 0, flick: { saved: new Map(), endT: 0 }, decorated: new WeakSet(), eyes: new Map(), phCaps: 0,
  };
  let capEl = null, edgeEl = null, edgeKids = null, style = null;

  // ------------------------------------------------------------------ registry: three new creatures + spider tuning
  for (const [id, def] of Object.entries(N.DEFS)) if (!CREATURES[id]) registerCreature(id, { ...def }, N.BEHAVIORS_NEW[id]);
  for (const id of N.NEW_TYPES) {
    STATE_SOUNDS[id] = STATE_SOUNDS[id] || N.STATES_SND[id] || {};
    if (N.LOOPS_SND[id]) LOOPS[id] = LOOPS[id] || N.LOOPS_SND[id];
  }
  wrap(BEHAVIORS, 'spider', (o) => N.spiderBehavior(o));
  wrap(BEHAVIORS, 'web', (o) => N.webBehavior(o));

  function wrap(obj, name, make) {
    if (!obj || typeof obj[name] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w;
    undo.push(() => { if (obj[name] === w) { if (had) obj[name] = orig; else delete obj[name]; } });
  }
  function loadSeen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch { return {}; } }
  function saveSeen() { try { localStorage.setItem(SEEN_KEY, JSON.stringify(S.seen)); } catch { /* private mode */ } }

  // ================================================================== HOST
  const run = () => game.run;
  const onMoon = () => { const r = run(); const m = r && MOONS[r.moon]; return !!m && r.phase === 'moon' && !m.company && !m.home; };
  function ctxNow() {
    const r = run(), moon = MOONS[r.moon] || {};
    const mm = game.mapmods;
    const mmMul = typeof mm?.threatMul === 'function' ? mm.threatMul() : (Number(mm?.threatMul) || 1);   // optional (wave 8 mapmods); dailyEvent.dangerMul already carries its numbers
    let pressure = 1; try { pressure = game.balance?.scale?.().spawn || 1; } catch { /* balance optional */ }
    pressure *= K.feedMul(S.st?.phase, S.fh);   // feedcams: ON AIR heat raises the next peak, an off-feed crew gets a calmer build
    return K.ctxOf({ q: r.quotaIndex | 0, tier: moon.tier, hard: getMode() === 'hard', danger: (game.config?.dangerMul || 1) * (r.dailyEvent?.dangerMul || 1) * (mmMul || 1), pressure });
  }
  const send = (d, to) => { try { if (to) game.net.sendTo(to, 'cd', d); else game.net.broadcast('cd', d); } catch { /* net closing */ } };
  const crewNow = () => (game.aiPlayers?.() || []).map((p) => ({ id: p.id, x: p.pos.x, z: p.pos.z, zone: p.zone, dead: !!p.dead || !!p.inShip, inShip: !!p.inShip, p }));
  function hostCreatures() {
    const out = [];
    for (const c of game.creatures.host.values()) out.push({ id: c.id, type: c.type, def: c.def, state: c.state, dead: c.dead, x: c.pos.x, z: c.pos.z, zone: c.zone, age: c.age, c });
    return out;
  }
  function startLanding() {
    if (!run()) return;
    const c = ctxNow();
    S.rng = new RNG(((run().seed | 0) ^ 0xcd11 ^ ((run().day | 0) * 7919)) >>> 0);
    S.st = K.newState(c, () => S.rng.float(0, 1));
    S.q.length = 0; S.now = 0; S.acc = 0; S.trk.clear(); S.trkGap.clear(); S.bursts.clear(); S.evt = false; S.evtT = -99;
    S.fh = null; S.fhNow = 0;
    S.residents = K.residentsFor(c.q); S.newThisLanding = 0; S.newThisCycle = 0; S.lastStage = 0; S.cullT = 0;
    S.stats = { spawned: 0, queued: 0, dropped: 0, released: 0, culled: 0, peaks: 0, featured: 0 };
    send({ k: 'ph', p: 'calm', n: 0 });
  }
  const costFor = (type) => { const d = CREATURES[type]; const c = K.costOf(type, d); return type === 'scuttler' ? c * K.packMax(run().quotaIndex | 0) : c; };   // a Spam Bot pack costs per body
  const OUT_COST = 1.5;

  const isEventCreature = (c) => !!(c.data && (c.data.sg || c.data.zl || c.data.wave != null)) || K.SIEGE_TYPES.includes(c.type);
  function overCap(M, type, opts) {
    const q = run().quotaIndex | 0, caps = K.sourceCaps(q), d = opts?.data;
    const count = (f) => { let n = 0; for (const c of M.host.values()) if (!c.dead && f(c)) n++; return n; };
    if (type === 'zombot') {
      if (d?.ambient) return count((c) => c.type === 'zombot' && c.data?.ambient) >= K.ambientZombieCap(q);
      if (d?.wave != null) {
        const now = game.time || 0, b = S.bursts.get(d.wave);
        if (!b || now - b.t > 3) S.bursts.set(d.wave, { t: now, n: 0 });
        const bb = S.bursts.get(d.wave);
        if (bb.n >= caps.swarmBurst || count((c) => c.type === 'zombot' && c.data?.wave != null) >= caps.swarmAlive) return true;
        bb.n++; bb.t = now;
      }
      return false;
    }
    if (type === 'hr_zombie') return count((c) => c.type === 'hr_zombie') >= caps.shambler;
    if (type === 'hr_warden') return count((c) => c.type === 'hr_warden') >= caps.warden;
    if (K.SIEGE_TYPES.includes(type)) return count((c) => K.SIEGE_TYPES.includes(c.type)) >= caps.siegeAlive;
    return false;
  }
  function installWrappers() {
    const g = game;
    S.orig.indoor = g.hostSpawnCreatureIndoor?.bind(g);
    S.orig.outdoor = g.hostSpawnOutdoor?.bind(g);
    wrap(g, 'hostPopulateMoon', (orig) => function (...a) {
      if (!enabled() || !host()) return orig.apply(this, a);
      try { startLanding(); S.landing = true; } catch (e) { console.warn('[crdirector] start', e); }
      try { return orig.apply(this, a); } finally { S.landing = false; }
    });
    // SET-PIECE crowds (audit: the real "too many"): per-source caps by quota. spawnZombot / the horror + siege spawners already handle a null spawn;
    // events keep their banners and rewards, they are just smaller (K.sourceCaps). Wave zombies are limited per burst AND alive, ambient groups alive.
    wrap(g.creatures, 'hostSpawn', (orig) => function (type, pos, opts) {
      if (enabled() && S.st && host() && !S.bypassCaps) {
        try { if (overCap(this, type, opts)) { S.stats.dropped++; return null; } } catch (e) { console.warn('[crdirector] cap', e); }
      }
      const c = orig.call(this, type, pos, opts);
      if (c && S.st && isEventCreature(c)) S.evtT = S.now;
      return c;
    });
    wrap(g, 'hostSpawnCreatureIndoor', (orig) => function (type) {
      if (!enabled() || !S.st || !host() || S.bypass) return orig.call(this, type);
      try {
        if (S.landing && S.residents > 0) {   // a few residents keep the first minutes alive
          S.residents--;
          const before = new Set(game.creatures.host.keys());
          const r = orig.call(this, type); claim(before); return r;
        }
        K.enqueue(S.q, { zone: 'in', type, cost: costFor(type), tries: 0 }, S.now); S.stats.queued++;
        return true;
      } catch (e) { console.warn('[crdirector] queue', e); return orig.call(this, type); }
    });
    wrap(g, 'hostSpawnOutdoor', (orig) => function (...a) {
      if (!enabled() || !S.st || !host() || S.bypass) return orig.apply(this, a);
      try {
        if (S.q.filter((e) => e.zone === 'out').length >= 2) { S.stats.dropped++; return; }
        K.enqueue(S.q, { zone: 'out', cost: OUT_COST, tries: 0 }, S.now); S.stats.queued++;
      } catch (e) { console.warn('[crdirector] queue', e); return orig.apply(this, a); }
    });
  }

  /** mark what just spawned as director-owned and trim Spam Bot packs; returns the number of bodies kept */
  function claim(before) {
    let n = 0, packs = 0; const pm = K.packMax(run().quotaIndex | 0);
    for (const [id, c] of [...game.creatures.host]) {
      if (before.has(id)) continue;
      if (c.type === 'scuttler' && ++packs > pm) { game.creatures.hostRemove(id); continue; }   // small crews meet smaller packs
      c.data.crd = 1; n++;
    }
    return n;
  }
  function spawnEntry(e) {
    const before = new Set(game.creatures.host.keys());
    let ok = false;
    try {
      S.bypass = true;
      if (e.zone === 'in') { if (canSpawnMore(e.type, game.creatures.host)) ok = !!S.orig.indoor?.(e.type); }
      else { S.orig.outdoor?.(); ok = true; }
    } catch (err) { console.warn('[crdirector] release', err); } finally { S.bypass = false; }
    return claim(before) > 0 && ok;
  }
  function release(act, crew) {
    if (!S.q.length) return;
    const open = (z) => crew.some((p) => !p.dead && !p.inShip && p.zone === z);
    const i = K.pickRelease(S.q, S.st, ctxNow(), act.sum, (e) => e.cost, open, act.n);
    if (i < 0) return;
    const e = S.q.splice(i, 1)[0];
    S.st.gapT = K.gapFor(S.st.phase);
    if (spawnEntry(e)) { S.stats.released++; S.stats.spawned++; return; }
    if (++e.tries < 3) S.q.push(e); else S.stats.dropped++;   // no fair spot right now (early-game safety / crew close): try again later
  }

  /** once per peak: ONE rule-changing creature, if there is room in the budget */
  function pickNew(crew) {
    const q = run().quotaIndex | 0;
    if (q < 1 || S.newThisLanding >= 2 || S.newThisCycle >= 1) return null;
    const alive = new Set(); for (const c of game.creatures.host.values()) if (!c.dead) alive.add(c.type);
    const carried = N.carriedValue([...(game.items?.all?.() || [])]);
    const lit = crew.some((c) => c.p.flash) || [...(game.items?.all?.() || [])].some((it) => it.type === 'glowstick' && it.on);
    const w = [
      ['cd_dimmer', lit ? 2 : 0.6], ['cd_follower', 1.2],
      ['cd_auditor', [...carried.values()].some((v) => v >= N.AUD.minLoot) ? 2.5 : 0],
    ].filter(([id, x]) => x > 0 && !alive.has(id) && CREATURES[id]);
    let tot = 0; for (const [, x] of w) tot += x;
    if (!tot) return null;
    let r = S.rng.float(0, tot);
    for (const [id, x] of w) { r -= x; if (r <= 0) return id; }
    return w[0][0];
  }
  function spawnNew(type, crew) {
    const fac = game.world?.facility;
    if (!fac || !CREATURES[type]) return false;
    const inside = crew.filter((c) => !c.dead && c.zone === 'in');
    if (!inside.length) return false;
    const early = game.hostEarlySafeFilter?.(30);
    const spots = (fac.ventSpots?.length ? fac.ventSpots : (fac.scrapSpots || []).filter((s) => !s.elevated)) || [];
    const ok = spots.filter((s) => inside.every((c) => Math.hypot(c.x - s.x, c.z - s.z) > 16) && (!early || early(s)));
    if (!ok.length) return false;
    const s = ok[Math.floor(S.rng.float(0, ok.length))];
    const c = game.creatures.hostSpawn(type, new THREE.Vector3(s.x, s.y, s.z), { level: game.rollLevel?.() || 1, elite: false, zone: 'in', state: 'idle', variant: null, affix: null });
    if (!c) return false;
    c.data.crd = 1;
    if (s.obj) game.net.broadcast('fx', { k: 'snd', s: 'vent_crawl', p: [s.x, s.y + 0.5, s.z], v: 0.9 });
    S.newThisLanding++; S.newThisCycle++; S.stats.featured++; S.stats.spawned++;
    return true;
  }

  function onPhase(ph, crew, active, cap, evt = false) {
    send({ k: 'ph', p: ph, n: S.st.cycle });
    try { mods?.emit?.('crdirector', { kind: 'phase', phase: ph, cycle: S.st.cycle }, game); } catch { /* mods optional */ }
    if (ph === 'build') S.newThisCycle = 0;
    if (ph === 'peak' && !evt) {
      S.stats.peaks++;
      const type = pickNew(crew);
      if (type && active + K.costOf(type, CREATURES[type]) <= cap * 1.15) spawnNew(type, crew);
    }
  }
  function hpFrac(id) {
    if (id === game.selfId) { const pl = game.player; return Math.max(0, Math.min(1, (pl?.hp ?? 100) / (pl?.maxHp || 100))); }
    return Math.max(0, Math.min(1, (game.remotes?.get(id)?.hp ?? 100) / 100));
  }
  const stressed = (crew) => crew.some((c) => !c.dead && hpFrac(c.id) < K.TUNE.stressHp);
  /** relax: quietly remove ambient creatures that nobody is near, so the level does not fill up over the day */
  function cull(crew) {
    if (S.now - S.cullT < K.TUNE.cullGap) return;
    S.cullT = S.now;
    const amb = [...game.creatures.host.values()].filter((c) => !c.dead && c.data.crd && K.isCounted(c.type, c.def));
    if (amb.length <= S.residents + 1) return;
    for (const c of amb) {
      if (c.data.carry || (c.state !== 'idle' && c.state !== 'walk') || c.age < K.TUNE.cullAge) continue;
      const far = crew.every((p) => p.dead || p.zone !== c.zone || Math.hypot(p.x - c.pos.x, p.z - c.pos.z) > K.TUNE.cullFar);
      if (!far) continue;
      game.creatures.hostRemove(c.id); S.stats.culled++;
      return;
    }
  }
  /** who is being tracked: tell that player from which side (edge pulse + thump on their screen) */
  function tracking(crew, list) {
    const live = new Set();
    for (const e of list) {
      const c = e.c;
      if (c.dead || !K.isCounted(c.type, c.def) || !K.isHunting(c.state)) continue;
      live.add(c.id);
      let to = c.target && crew.find((p) => p.id === c.target && !p.dead);
      if (!to) {
        let bd = TRACK_R;
        for (const p of crew) { if (p.dead || (c.zone !== 'any' && p.zone !== c.zone)) continue; const d = Math.hypot(p.x - c.pos.x, p.z - c.pos.z); if (d < bd) { bd = d; to = p; } }
      }
      if (!to || Math.hypot(to.x - c.pos.x, to.z - c.pos.z) > TRACK_R) continue;
      const key = c.state + '|' + to.id, prev = S.trk.get(c.id);
      if (prev && prev.key === key && S.now - prev.t < 18) continue;
      if (S.now - (S.trkGap.get(to.id) || -99) < TRACK_GAP || S.now - (S.trkGap.get(to.id + '|' + c.type) || -99) < TRACK_TYPE_GAP) continue;   // a swarm cues once, not per body
      S.trk.set(c.id, { key, t: S.now }); S.trkGap.set(to.id, S.now); S.trkGap.set(to.id + '|' + c.type, S.now);
      send({ k: 'tr', id: c.id, ty: c.type }, to.id);
    }
    for (const id of S.trk.keys()) if (!live.has(id)) S.trk.delete(id);
  }

  function hostUpdate(dt) {
    if (!enabled() || !onMoon() || !game.hostData) { if (S.st && !onMoon()) { S.st = null; S.q.length = 0; } return; }
    if (!S.st) { startLanding(); S.st.len = Math.min(S.st.len, 45); }   // joined mid-day / host migration: short calm, then the normal cycle
    S.acc += dt;
    if (S.acc < TICK) return;
    const step = S.acc; S.acc = 0; S.now += step;
    const crew = crewNow(), list = hostCreatures();
    const c = ctxNow(), cap = K.capOf(c);
    const act = K.activeThreat(list, crew);
    const stage = game.hostData.pressureStage | 0;
    if (stage > S.lastStage) { S.lastStage = stage; if (S.st.phase === 'calm' || S.st.phase === 'relax') { S.st.phase = 'calm'; S.st.len = S.st.t; } }   // a greedy haul calls the next wave early
    // an event (horde swarm, siege, raid wave) IS the peak: announce it as one, keep ambient spawns quiet meanwhile, relax when the last body is gone
    let evtAlive = false;
    for (const e of list) if (!e.dead && isEventCreature(e.c)) { evtAlive = true; break; }
    if (evtAlive || S.now - S.evtT < 6) {
      if (!S.evt) { S.evt = true; if (S.st.phase !== 'peak') { S.st.phase = 'peak'; S.st.t = 0; S.st.len = 240; S.st.overT = 0; onPhase('peak', crew, act.sum, cap, true); } }
    } else if (S.evt) { S.evt = false; if (S.st.phase === 'peak') S.st.len = S.st.t; }
    const ph = K.step(S.st, step, c, () => S.rng.float(0, 1), { active: act.sum, cap, stress: !S.evt && stressed(crew), evt: S.evt });
    if (ph === 'calm' && S.fh > 0) S.st.len *= K.feedCalmMul(S.fh);   // a hot stream calls the next wave sooner
    if (ph === 'relax' && S.fh != null) S.fh = S.fhNow;               // the peak spent the heat memory
    if (ph) onPhase(ph, crew, act.sum, cap);
    K.expire(S.q, S.now);
    if (!S.evt) release(act, crew);
    if (S.st.phase === 'relax') cull(crew);
    tracking(crew, list);
  }

  // ================================================================== CLIENT
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:cd', onMsg);
    boundNet = net; net.on('msg:cd', onMsg);
  }
  function onMsg(m, from) {
    if (disposed || !m || typeof m.k !== 'string') return;
    if (from !== game.selfId && from !== game.net?.hostId) return;   // host-authoritative: ignore anybody else
    if (m.k === 'ph') onPhaseCue(m.p, m.n | 0);
    else if (m.k === 'tr') onTrack(m);
    else if (m.k === 'dim') { if (m.to === game.selfId) onDim(+m.ms || 6000); }
    else if (m.k === 'seize') { if (m.to === game.selfId) onSeize(); }
  }
  function audio() { return game.audio; }
  function pickSound(list) {
    const a = audio(); if (!a?.has) return null;
    for (const n of list) { if (a.has(n)) return n; if (a.has(n + '_1')) return a.variant?.(n) || n + '_1'; }
    return null;
  }
  function play(list, opts) {
    const a = audio(); const n = pickSound(list);
    if (!a || !n) return null;
    if (opts?.pos) opts = { ...opts, pos: new THREE.Vector3(opts.pos.x, opts.pos.y, opts.pos.z) };
    try { return a.play(n, opts); } catch { return null; }
  }
  const localOk = () => !!run() && run().phase === 'moon' && !!game.player && !game.player.dead && !game.player.inShip;

  function ensureUi() {
    if (capEl || typeof document === 'undefined') return;
    style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    const root = document.getElementById('ui') || document.body;
    capEl = document.createElement('div'); capEl.className = 'cd-cap'; root.appendChild(capEl);
    edgeEl = document.createElement('div'); edgeEl.className = 'cd-edge';
    edgeKids = {};
    for (const k of ['f', 'b', 'l', 'r']) { const i = document.createElement('i'); i.className = k; edgeEl.appendChild(i); edgeKids[k] = i; }
    root.appendChild(edgeEl);
  }
  function caption(text) {
    ensureUi(); if (!capEl) return;
    if (game.onboard?.fr?.lease?.('caption', CAPTION_S, 1) === false) return;   // [firstrun] never on top of the touchdown card
    const i = text.indexOf(' — ');
    capEl.textContent = '';
    if (i > 0) { const b = document.createElement('b'); b.textContent = text.slice(0, i); capEl.appendChild(b); capEl.appendChild(document.createTextNode(text.slice(i))); }
    else capEl.textContent = text;
    capEl.classList.add('on'); S.capT = CAPTION_S; S.capCool = CAPTION_S + 2;
  }
  function pulse(edge, s = 1) { S.edge[edge] = Math.max(S.edge[edge], s); ensureUi(); }
  function forwardXZ() {
    const v = new THREE.Vector3(0, 0, -1).applyQuaternion(game.camera.quaternion);
    return [v.x, v.z];
  }

  /** facility lights dip around the player (same emitter trick as the horror director) */
  function dipLights(dur = 1.4, r = 12) {
    const fac = game.world?.facility; const p = game.player?.pos;
    if (!fac || !p || game.lights?.globalDim === 0) return;
    for (const e of fac.emitters || []) {
      if (e.group !== 'facility' || !e.pos || e.pos.distanceToSquared(p) > r * r) continue;
      if (!S.flick.saved.has(e)) S.flick.saved.set(e, e.flicker || 0);
      e.flicker = 0.72;
    }
    S.flick.endT = Math.max(S.flick.endT, nowMs() + dur * 1000);
  }
  function restoreLights() { for (const [e, f] of S.flick.saved) e.flicker = f; S.flick.saved.clear(); S.flick.endT = 0; }

  function onPhaseCue(ph, n) {
    if (!localOk()) return;
    if (ph === 'build') {
      play(['sting_synth', 'sting_piano', 'lights_buzz'], { volume: 0.45, pitch: 0.7, bus: 'music' });
      dipLights(1.6); pulse('f', 0.35);
      if (S.phCaps < 2) { S.phCaps++; caption(t('TRAFFIC SPIKE — something is coming.')); }
    } else if (ph === 'peak') {
      play(['chase_sting', 'sting_impact'], { volume: 0.55, pitch: 0.85, bus: 'music' });
      if (S.phCaps < 3) { S.phCaps++; caption(t('PEAK TRAFFIC — hold your ground.')); }
    } else if (ph === 'relax' && S.phCaps < 4 && n <= 2) {
      play(['breath_tired'], { volume: 0.3, pitch: 0.8 });
      S.phCaps++; caption(t('The static settles. Breathe.'));
    }
  }
  function onTrack(m) {
    if (!localOk()) return;
    const v = game.creatures?.views?.get(m.id);
    if (!v || v.state === 'dead' || v.hidden) return;
    const cam = game.camera.position, [fx, fz] = forwardXZ();
    const edge = K.edgeOf(v.pos.x - cam.x, v.pos.z - cam.z, fx, fz);
    pulse(edge, 0.85);
    const dx = v.pos.x - cam.x, dz = v.pos.z - cam.z, d = Math.hypot(dx, dz) || 1;
    play(['heartbeat'], { pos: { x: cam.x + (dx / d) * 3, y: cam.y, z: cam.z + (dz / d) * 3 }, volume: 0.6, pitch: 1.15, refDistance: 2, maxDistance: 16 });
    S.cues++;
  }
  function onDim(ms) {
    const p = game.player; if (!p || p.dead) return;
    for (const id of p.slots || []) {
      const it = id && game.items?.get?.(id);
      if (it && (it.type === 'flashlight' || it.type === 'proflash') && it.on) { try { game.setItemOn(it, false); } catch { /* item gone */ } }
    }
    S.darkUntil = nowMs() + ms;
    play(['spark', 'power_down'], { volume: 0.7 });
    try { game.ui?.hud?.toast?.(t('It ate the light. Wait...'), 'bad'); } catch { /* hud optional */ }
  }
  function onSeize() {
    const p = game.player; if (!p || p.dead) return;
    let best = null;
    for (const id of p.slots || []) { const it = id && game.items?.get?.(id); if (it && N.defaultIsLoot(it) && (!best || it.value > best.value)) best = it; }
    if (!best) return;
    try { game.dropItem(best, false); game.ui?.hud?.toast?.(t('AUDITED — you dropped your best item.'), 'bad'); } catch { /* item gone */ }
  }
  wrap(game, 'toggleFlashlight', (orig) => function (...a) {
    if (S.darkUntil > nowMs()) { try { game.ui?.hud?.toast?.(t('It ate the light. Wait...'), 'bad'); } catch { /* hud optional */ } return; }
    return orig.apply(this, a);
  });

  function ruleLine(type, v) {
    const r = RULE_LINES[type];
    if (r) return t(r[0]);
    const lore = String(v.def?.lore || '').split(/(?<=[.!?])\s/)[0] || '';
    return tf('{name} — {rule}', { name: String(v.def?.name || type).toUpperCase(), rule: lore });
  }
  // eyes: two emissive quads on the model, no lights (light count is constant)
  const EYE_GEO = new THREE.PlaneGeometry(0.075, 0.032);
  const eyeMats = new Map();
  function eyeMat(color) {
    let m = eyeMats.get(color);
    if (!m) { m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }); eyeMats.set(color, m); }
    return m;
  }
  function setEyes(v, color, on, time) {
    let e = S.eyes.get(v.id);
    if (!on || !color) { if (e) e.g.visible = false; return; }
    if (!e) {
      const g = new THREE.Group();
      for (const s of [-1, 1]) { const m = new THREE.Mesh(EYE_GEO, eyeMat(color)); m.position.set(s * 0.085, 0, 0); g.add(m); }
      g.position.set(0, (v.model?.height || v.height || 1.6) * 0.86, (v.model?.radius || v.def?.radius || 0.35) * 0.9);
      g.renderOrder = 3;
      v.root.add(g); e = { g, root: v.root }; S.eyes.set(v.id, e);
    }
    e.g.visible = true;
    e.g.scale.setScalar(0.9 + Math.sin(time * 5 + v.id.length) * 0.1);
  }
  const WEB_TEX = { t: null };
  function decorate(v) {
    if (S.decorated.has(v)) return;
    S.decorated.add(v);
    try {
      if (v.type === 'web' && typeof document !== 'undefined') {   // strands that stay visible in the dark (unlit): a web you can READ across a corridor
        if (!WEB_TEX.t) {
          const cv = document.createElement('canvas'); cv.width = cv.height = 64;
          const x = cv.getContext('2d'); x.strokeStyle = 'rgba(232,244,255,0.95)'; x.lineWidth = 1;
          for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; x.beginPath(); x.moveTo(32, 32); x.lineTo(32 + Math.cos(a) * 31, 32 + Math.sin(a) * 31); x.stroke(); }
          for (const r of [9, 18, 27]) { x.beginPath(); x.arc(32, 32, r, 0, Math.PI * 2); x.stroke(); }
          WEB_TEX.t = new THREE.CanvasTexture(cv); WEB_TEX.t.magFilter = THREE.NearestFilter; WEB_TEX.t.minFilter = THREE.NearestFilter;
        }
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.3), new THREE.MeshBasicMaterial({ map: WEB_TEX.t, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, fog: true }));
        m.position.y = 1.1; v.root.add(m); v._cdGlint = m;
      }
      const tint = { cd_dimmer: '#ffb347', cd_follower: '#f4f4f4', cd_auditor: '#d9c25a' }[v.type];
      if (tint) v.model?.setTint?.(tint, true);
    } catch (e) { console.warn('[crdirector] decorate', e); }
  }

  function scan(dt) {
    const views = game.creatures?.views; if (!views || !game.camera) return;
    const cam = game.camera.position, time = nowMs() / 1000;
    const ok = localOk();
    let dimmerNear = false;
    for (const v of views.values()) {
      decorate(v);
      if (v._cdGlint) v._cdGlint.material.opacity = 0.38 + Math.sin(time * 1.7 + v.pos.x) * 0.12;
      if (!ok || v.state === 'dead' || v.hidden) { setEyes(v, null, false, time); continue; }
      const def = v.def || {};
      if (def.hazard || !K.isCounted(v.type, def)) continue;
      if (!K.isAwake(v.state)) { setEyes(v, null, false, time); continue; }
      const d = Math.hypot(v.pos.x - cam.x, v.pos.z - cam.z), tell = K.tellOf(v.type);
      if (Math.abs(v.pos.y - cam.y) > 9 && !def.boss && d > 12) continue;   // another floor
      setEyes(v, tell.eye, !!tell.eye && d < 26 && (K.isHunting(v.state) || v.type === 'cd_follower'), time);
      if (v.type === 'cd_dimmer' && d < 14) dimmerNear = true;
      if (d > tell.r) continue;
      const last = S.told.get(v.id) || -99;
      if (time - last > TELL_GAP && time - (S.typeTell.get(v.type) || -99) > 5 && time - S.anyTell > 1.2) {
        S.told.set(v.id, time); S.typeTell.set(v.type, time); S.anyTell = time;
        play(tell.s, { pos: v.pos, volume: tell.v, pitch: tell.p, refDistance: 4, maxDistance: tell.r * 1.6, occlude: true });
        if (tell.fx === 'flicker') dipLights(1.1, 9);
        else if (tell.fx === 'dust') { try { game.particles?.burst(new THREE.Vector3(cam.x + (v.pos.x - cam.x) * 0.15, cam.y + 1.6, cam.z + (v.pos.z - cam.z) * 0.15), 'dust', null, 1.2); } catch { /* particles optional */ } }
      }
      if (d < CAPTION_R && S.capCool <= 0 && !S.seen[v.type] && !(game.profile?.bestiary?.[v.type]?.kills > 0)) {
        S.seen[v.type] = 1; saveSeen(); caption(ruleLine(v.type, v));
      } else if (d < CAPTION_R && !S.seen[v.type] && game.profile?.bestiary?.[v.type]?.kills > 0) { S.seen[v.type] = 1; saveSeen(); }
    }
    if (dimmerNear && S.flick.endT - nowMs() < 400) dipLights(0.7, 8);
    if (S.told.size > 64) for (const [id, tt] of S.told) if (time - tt > 120) S.told.delete(id);
    for (const [id, e] of S.eyes) if (!views.has(id)) { e.root?.remove?.(e.g); S.eyes.delete(id); }
    void dt;
  }
  function clientUpdate(dt) {
    if (S.capT > 0) { S.capT -= dt; if (S.capT <= 0 && capEl) capEl.classList.remove('on'); }
    S.capCool = Math.max(0, S.capCool - dt);
    for (const k of ['f', 'b', 'l', 'r']) {
      if (S.edge[k] > 0) S.edge[k] = Math.max(0, S.edge[k] - dt * 1.7);
      const v = Math.round(S.edge[k] * 100) / 100;
      if (edgeKids && S.edgeSet[k] !== v) { S.edgeSet[k] = v; edgeKids[k].style.opacity = String(v); }
    }
    if (S.flick.saved.size && nowMs() >= S.flick.endT) restoreLights();
    S.scanT -= dt;
    if (S.scanT <= 0) { S.scanT = 0.25; try { scan(0.25); } catch (e) { console.warn('[crdirector] scan', e); } }
  }

  // ================================================================== wiring
  if (mods?.on) {
    offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
    offs.push(mods.on('update', (dt, g) => {
      if (g !== game || disposed) return;
      bindNet(game.net);
      if (host()) { try { hostUpdate(dt); } catch (e) { console.warn('[crdirector] host', e); S.bypass = false; } }
      clientUpdate(dt);
    }));
    offs.push(mods.on('phase', (ph, g) => { if (g === game && ph !== 'moon') { S.st = null; S.q.length = 0; S.told.clear(); S.phCaps = 0; restoreLights(); } }));
  }
  if (game.net) bindNet(game.net);
  installWrappers();

  return {
    /** may a spawner add `cost` threat points right now? (advisory: modules that spawn hostiles by themselves can ask) */
    ask(cost = 1) { return !enabled() || !S.st || K.mayRelease({ ...S.st, gapT: 0 }, ctxNow(), K.activeThreat(hostCreatures(), crewNow()).sum, cost); },
    cap() { return K.capOf(ctxNow()); },
    /** lcmonsters / any scripted spawner: false = veto (the crew is already carrying more than 1.6 x the cap) */
    canSpawn(type, pos) {
      if (!enabled() || !S.st || !host()) return true;
      const cost = K.costOf(type, CREATURES[type]) || 1;
      return K.activeThreat(hostCreatures(), crewNow()).sum + cost <= K.capOf(ctxNow()) * 1.6;
    },
    /** siege.js: wave power / count ceilings for the current quota */
    siegeCaps() { return enabled() && S.st ? K.siegeCaps(run().quotaIndex | 0) : null; },
    phase() { return S.st?.phase || null; },
    /** feedcams (host, 10 Hz): current ON AIR heat 0-100; the director remembers the highest value since the last peak */
    onFeedHeat(h) { if (!S.st) return; S.fhNow = +h || 0; S.fh = Math.max(S.fh ?? 0, S.fhNow); },
    debug() { return { phase: S.st?.phase, t: S.st ? Math.round(S.st.t) : 0, len: S.st ? Math.round(S.st.len) : 0, cycle: S.st?.cycle, queue: S.q.map((e) => e.type || e.zone), stats: { ...S.stats }, cues: S.cues }; },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of offs) { try { o(); } catch { /* ignore */ } }
      for (const u of undo.reverse()) { try { u(); } catch { /* ignore */ } }
      boundNet?.off?.('msg:cd', onMsg); boundNet = null;
      restoreLights();
      for (const e of S.eyes.values()) e.root?.remove?.(e.g);
      S.eyes.clear();
      capEl?.remove(); edgeEl?.remove(); style?.remove();
      for (const m of eyeMats.values()) m.dispose();
      EYE_GEO.dispose();
      S.q.length = 0; S.st = null;
    },
  };
}
