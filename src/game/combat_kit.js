// TFG wave 2 - combat kit: the shared plumbing every combat_* / spells_ext / role_skills module uses (own net kind 'cb',
// procedural sounds, small VFX toolkit, host-side helpers: area damage, knockback "fling", slow, bleed, timers).
//
// Net: requests are 'cb*' (cbhit, cbparry, cbshot, cbboom, cbgrav, cbskill); broadcasts ride the stock 'fx' channel as
// { k: 'cb', t: <sub type>, ... } and are dispatched to kit.onFx(t, fn) handlers on every peer (sender included).
import * as THREE from 'three';
import { G } from '../physics/physics.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const TAU = Math.PI * 2;
export const UP = new THREE.Vector3(0, 1, 0);
export const fin3 = (a) => (Array.isArray(a) && a.length >= 3 && a.every(Number.isFinite) ? new THREE.Vector3(a[0], a[1], a[2]) : null);
export const arr3 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
export const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');

// ---------------------------------------------------------------- procedural sound helpers (mono Float32Array generators)
let _seed = 0x2545f491;
const rnd = () => { _seed = (Math.imul(_seed, 1664525) + 1013904223) >>> 0; return _seed / 4294967296; };
export const nz = () => rnd() * 2 - 1;
export const sin = (f, t) => Math.sin(TAU * f * t);
export const ex = (t, k) => Math.exp(-t * k);
export function synth(sr, dur, fn) {
  const n = Math.max(1, Math.floor(sr * dur));
  const b = new Float32Array(n);
  let peak = 1e-6;
  for (let i = 0; i < n; i++) { const v = fn(i / sr, i); b[i] = v; const a = Math.abs(v); if (a > peak) peak = a; }
  const k = 0.9 / peak, fade = Math.min(n, Math.floor(sr * 0.006));
  for (let i = 0; i < n; i++) { b[i] *= k; if (i > n - fade) b[i] *= (n - i) / fade; }
  return b;
}

// creatures that must never be shoved around
const IMMOVABLE = new Set(['sandkefal', 'giant', 'web', 'mimicdoor', 'turret', 'mine']);
export const movable = (c) => !!c && !c.dead && !c.def?.boss && !c.def?.hazard && !IMMOVABLE.has(c.type) && !(c.type === 'leech' && (c.state === 'ceiling' || c.extra));

export function createKit(game) {
  const g = game, mm = game.mods;
  const K = {
    g, mm, disposed: false,
    offs: [], updaters: [], hostH: [], fxH: new Map(), patches: [], anims: [], timers: [], moveMods: [], rmbHooks: [],
    flings: [], bleeds: new Map(), bleedFx: new Map(), warned: new Set(),
  };
  const scene = g.scene;
  const posV = new THREE.Vector3();

  // ---------------------------------------------------------------- registration
  K.on = (ev, fn) => { const off = mm?.on?.(ev, fn); if (off) K.offs.push(off); return off; };
  K.update = (fn) => { K.updaters.push(fn); };
  K.hostOn = (action, fn) => { K.hostH.push([action, fn]); };
  K.onFx = (t, fn) => { K.fxH.set(t, fn); };
  K.fx = (t, d) => { g.net?.broadcast('fx', { ...d, k: 'cb', t }); };
  K.sounds = (map) => { if (mm?.soundGens) for (const [n, fn] of Object.entries(map)) if (!mm.soundGens.has(n)) mm.soundGens.set(n, fn); };
  K.models = (map) => { if (mm?.itemModels) for (const [id, fn] of Object.entries(map)) if (!mm.itemModels.has(id)) mm.itemModels.set(id, () => fn()); };
  K.wrap = (obj, name, make) => {
    const orig = obj?.[name];
    if (typeof orig !== 'function') return;
    const mine = make(orig.bind(obj));
    obj[name] = mine;
    K.patches.push(() => { if (obj[name] === mine) obj[name] = orig; });
  };
  /** movement modifier: fn(dt) -> { speed?, carry?, vel?: {x, z} } | null, applied around LocalPlayer.update */
  K.moveMod = (fn) => { K.moveMods.push(fn); };
  /** RMB hook (the melee module owns scan-as-tap): fn(heldItem) -> true when it used the click */
  K.onRmb = (fn) => { K.rmbHooks.push(fn); };
  K.after = (sec, fn) => { K.timers.push({ t: g.time + sec, fn }); };
  K.safe1 = (label, fn, a, ctx) => { try { return fn.call(ctx, a); } catch (e) { if (!K.warned.has(label)) { K.warned.add(label); console.warn('[combat] ' + label, e); } } };   // [perf5] no closure per call in the per-frame loop
  K.safe = (label, fn) => { try { return fn(); } catch (e) { if (!K.warned.has(label)) { K.warned.add(label); console.warn('[combat] ' + label, e); } } };

  // ---------------------------------------------------------------- audio
  K.snd = (name, pos, vol = 1, pitch, opts = {}) => {
    try {
      mm?.ensureSound?.(name);
      if (pos) g.audio.at(name, pos.isVector3 ? pos : posV.fromArray(pos), vol, { refDistance: opts.ref ?? 4, maxDistance: opts.max ?? 60, pitch, occlude: opts.occlude !== false });
      else g.audio.play(name, { volume: vol, bus: 'sfx', pitch });
    } catch { /* audio not ready */ }
  };
  K.bsnd = (name, pos, vol = 1, pitch) => K.fx('snd', { s: name, p: arr3(pos), v: vol, pt: pitch });
  K.onFx('snd', (d) => { const p = fin3(d.p); if (p && typeof d.s === 'string') K.snd(d.s, p, clamp(Number(d.v) || 1, 0, 2), d.pt); });

  // ---------------------------------------------------------------- VFX (unlit / additive: never adds a scene light)
  K.anim = (dur, upd, end) => { K.anims.push({ t: 0, dur, upd, end }); };
  K.mesh = (geo, color, opacity = 0.6, extra = {}) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, ...extra }));
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  K.kill = (m) => { if (!m) return; m.removeFromParent(); m.geometry?.dispose?.(); m.material?.dispose?.(); };
  K.ring = (pos, color, r0, r1, dur, orient = true) => {
    const m = K.mesh(new THREE.RingGeometry(0.85, 1, 32), color, 0.75);
    m.position.copy(pos);
    if (orient === true) m.rotation.x = -Math.PI / 2; else if (orient?.isVector3) m.lookAt(pos.clone().add(orient));
    K.anim(dur, (u) => { m.scale.setScalar(r0 + (r1 - r0) * (1 - Math.pow(1 - u, 2))); m.material.opacity = 0.75 * (1 - u); }, () => K.kill(m));
  };
  K.sphere = (pos, color, r0, r1, dur, opacity = 0.5) => {
    const m = K.mesh(new THREE.SphereGeometry(1, 12, 8), color, opacity);
    m.position.copy(pos);
    K.anim(dur, (u) => { m.scale.setScalar(r0 + (r1 - r0) * (1 - Math.pow(1 - u, 2))); m.material.opacity = opacity * (1 - u); }, () => K.kill(m));
  };
  K.beam = (a, b, color, dur = 0.2, width = 0.03) => {
    const len = a.distanceTo(b);
    if (len < 0.05) return;
    const m = K.mesh(new THREE.BoxGeometry(1, 1, 1), color, 0.9);
    m.scale.set(width, width, len);
    m.position.copy(a).lerp(b, 0.5);
    m.lookAt(b);
    K.anim(dur, (u) => { m.material.opacity = 0.9 * (1 - u); }, () => K.kill(m));
  };
  /** jagged lightning through the given points */
  K.bolt = (pts, color, dur = 0.3, jag = 0.22) => {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], n = Math.max(2, Math.ceil(a.distanceTo(b) / 0.8));
      for (let k = 0; k < n; k++) {
        const p = a.clone().lerp(b, k / n);
        if (k > 0) p.add(new THREE.Vector3((Math.random() - 0.5) * jag * 2, (Math.random() - 0.5) * jag * 2, (Math.random() - 0.5) * jag * 2));
        out.push(p);
      }
    }
    out.push(pts[pts.length - 1].clone());
    for (const [c, dy] of [[0xffffff, 0], [color, 0.03]]) {
      const geo = new THREE.BufferGeometry().setFromPoints(out.map((p) => p.clone().setY(p.y + dy)));
      const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      l.frustumCulled = false; scene.add(l);
      K.anim(dur, (u) => { l.material.opacity = 1 - u; }, () => { l.removeFromParent(); geo.dispose(); l.material.dispose(); });
    }
  };
  K.burst = (pos, preset, dir, mul = 1) => g.particles?.burst(pos, preset, dir || null, mul);
  K.shake = (pos, amt, range = 18) => { const d = pos.distanceTo(g.camera.position); if (d < range) g.engine.shake(amt * (1 - d / range)); };
  K.toast = (s, kind) => g.ui?.toast?.(s, kind);

  // ---------------------------------------------------------------- lookups
  K.posOf = (id) => (id === g.selfId ? g.player.pos : g.remotes.get(id)?.pos || null);
  K.headOf = (id) => g.playerHeadById?.(id) || null;
  K.eye = () => ({ eye: g.camera.position.clone(), dir: new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion).normalize() });

  // ---------------------------------------------------------------- host helpers
  const ctrOf = (c) => new THREE.Vector3(c.pos.x, c.pos.y + Math.min(c.def?.height || 1.2, 2.4) * 0.5, c.pos.z);
  K.ctrOf = ctrOf;
  /** host: living creatures whose body is within R of pos (optionally with line of sight) */
  K.creaturesIn = (pos, R, { los = false, skipWeb = true } = {}) => {
    const out = [], up = pos.clone().setY(pos.y + 0.3);
    for (const c of g.creatures.host.values()) {
      if (c.dead || (skipWeb && c.type === 'web')) continue;
      const ctr = ctrOf(c), d = ctr.distanceTo(pos);
      if (d > R + (c.def?.radius || 0.5)) continue;
      if (los && !g.physics.lineOfSight(up, ctr, G.STATIC | G.DOOR)) continue;
      out.push({ c, d, ctr });
    }
    return out;
  };
  K.hurt = (c, dmg, from, opts = {}) => { if (c && !c.dead && (dmg > 0 || opts.stun)) g.creatures.damage(c.id, Math.round(dmg), from, opts); };
  K.stun = (c, secs, from) => { if (c && !c.dead && secs > 0) g.creatures.damage(c.id, 0, from, { stun: secs }); };
  K.slow = (c, secs, mul) => { if (!c || c.dead) return; c.cbSlowT = Math.max(c.cbSlowT || 0, secs); c.cbSlowMul = Math.min(c.cbSlowMul || 1, c.def?.boss ? Math.max(mul, 0.65) : mul); };
  /** knock a creature along (vx, vz) m/s, decaying; wall / edge = slam damage */
  K.fling = (c, vx, vz, from, o = {}) => {
    if (!movable(c)) return;
    K.flings = K.flings.filter((q) => q.c !== c);
    K.flings.push({ c, vx, vz, t: 0, from, slam: o.slam ?? 10, slammed: false, hitOthers: !!o.hitOthers, life: o.life ?? 0.85 });
  };
  K.bleed = (c, dps, secs, from) => {
    if (!c || c.dead || c.maxHp === null) return;
    K.bleeds.set(c.id, { t: secs, dps, from, acc: 0 });
    K.fx('bleed', { cid: c.id, t: secs });
  };
  /** host: radial blast on creatures with falloff, LOS, knockback and noise. o: { R, dmg, from, knock, stun, minFall, noise, direct, slam } */
  K.explode = (pos, o) => {
    const R = o.R, minFall = o.minFall ?? 0.35;
    for (const { c, d, ctr } of K.creaturesIn(pos, R, { los: false })) {
      const isDirect = o.direct && c.id === o.direct;
      if (!isDirect && !g.physics.lineOfSight(pos.clone().setY(pos.y + 0.3), ctr, G.STATIC | G.DOOR)) continue;
      const f = 1 - (1 - minFall) * clamp(isDirect ? 0 : d / R, 0, 1);
      K.hurt(c, o.dmg * f * (isDirect ? 1.25 : 1), o.from, { stun: o.stun || 0 });
      if (!c.dead && o.knock) {
        const dx = c.pos.x - pos.x, dz = c.pos.z - pos.z, L = Math.hypot(dx, dz) || 1;
        const heavy = clamp(1 / (0.55 + (c.def?.radius || 0.5)), 0.5, 1.3);
        K.fling(c, (dx / L) * o.knock * f * heavy, (dz / L) * o.knock * f * heavy, o.from, { slam: o.slam ?? 12 });
      }
    }
    g.creatures.noise(pos, o.noise ?? 3.5);
    g.net.broadcast('fx', { k: 'explode', p: arr3(pos) });
  };

  const hostTick = (dt) => {
    // flings
    if (K.flings.length) {
      const lim = g.world.terrain?.playHalf;
      for (const q of K.flings) {
        const c = q.c;
        if (c.dead || g.creatures.host.get(c.id) !== c) { q.done = true; continue; }
        q.t += dt;
        const sp = Math.hypot(q.vx, q.vz);
        if (sp < 0.4 || q.t > q.life) { q.done = true; continue; }
        const step = sp * dt, ux = q.vx / sp, uz = q.vz / sp, nx = c.pos.x + ux * step, nz = c.pos.z + uz * step, r = c.def?.radius || 0.45;
        const cy = c.pos.y + Math.min(1.0, (c.def?.height || 1.2) * 0.5);
        const hit = g.physics.raycast({ x: c.pos.x, y: cy, z: c.pos.z }, { x: ux, y: 0, z: uz }, step + r, G.STATIC | G.DOOR);
        const nav = g.creatures.nav(c);
        const out = c.zone !== 'in' && lim && (Math.abs(nx) > lim || Math.abs(nz) > lim);
        if (hit || (nav && !nav.walkableAt(nx, nz)) || (c.zone === 'in' && !nav) || out) {
          if (!q.slammed && sp > 5) { q.slammed = true; K.hurt(c, q.slam, q.from, { stun: 1.2 }); K.fx('slam', { p: arr3(new THREE.Vector3(c.pos.x, cy, c.pos.z)) }); }
          q.done = true; continue;
        }
        g.creatures.placeAt(c, nx, nz);
        c.path = null; c.dest = null; c.repath = 0;
        const k = Math.exp(-4.5 * dt); q.vx *= k; q.vz *= k;
      }
      K.flings = K.flings.filter((q) => !q.done);
    }
    // bleeds
    for (const [cid, b] of K.bleeds) {
      const c = g.creatures.host.get(cid);
      if (!c || c.dead) { K.bleeds.delete(cid); continue; }
      b.t -= dt; b.acc += dt;
      if (b.acc >= 0.5) { b.acc -= 0.5; K.hurt(c, Math.max(1, b.dps * 0.5), b.from, {}); }
      if (b.t <= 0) K.bleeds.delete(cid);
    }
    // slows tick down
    for (const c of g.creatures.host.values()) if (c.cbSlowT > 0) { c.cbSlowT -= dt; if (c.cbSlowT <= 0) c.cbSlowMul = 1; }
  };
  // every creature step funnels through follow(): slowed creatures move slower
  K.wrap(g.creatures, 'follow', (orig) => function (c, dt, speed, turn) {
    if (c.cbSlowT > 0) speed *= c.cbSlowMul || 0.5;
    return orig(c, dt, speed, turn);
  });

  // client: bleeding creatures drip
  let bleedT = 0;
  K.onFx('bleed', (d) => { if (typeof d.cid === 'string') K.bleedFx.set(d.cid, g.time + clamp(Number(d.t) || 3, 0, 12)); });
  const bleedTick = (dt) => {
    bleedT -= dt;
    if (bleedT > 0) return;
    bleedT = 0.22;
    for (const [cid, until] of K.bleedFx) {
      const v = g.creatures.views.get(cid);
      if (!v || v.state === 'dead' || g.time > until) { K.bleedFx.delete(cid); continue; }
      K.burst(v.pos.clone().setY(v.pos.y + (v.height || 1.2) * 0.5), { count: 2, color: [0x8a0d0d, 0xb31a12], speed: 0.5, up: 0.4, life: 0.5, size: 0.05, gravity: 9, drag: 1.5 }, null, 1);
    }
  };
  K.onFx('slam', (d) => { const p = fin3(d.p); if (p) { K.burst(p, 'dust', null, 1.4); K.snd('hit_wall', p, 0.9); K.shake(p, 0.25, 12); } });

  // ---------------------------------------------------------------- one update loop, one 'fx' listener, one host-handler hook
  K.on('update', (dt, gg) => {
    if (gg !== g || K.disposed) return;
    for (let i = 0; i < K.updaters.length; i++) K.safe1('update', K.updaters[i], dt);
    for (let i = K.anims.length - 1; i >= 0; i--) {
      const a = K.anims[i];
      a.t += dt;
      const u = Math.min(1, a.t / a.dur);
      K.safe1('anim', a.upd, u, a);
      if (u >= 1) { K.anims.splice(i, 1); K.safe('animend', () => a.end?.()); }
    }
    for (let i = K.timers.length - 1; i >= 0; i--) if (g.time >= K.timers[i].t) { const tm = K.timers.splice(i, 1)[0]; K.safe('timer', tm.fn); }
    if (g.isHost) K.safe1('host', hostTick, dt);
    bleedTick(dt);
  });
  K.on('fx', (d, from) => { if (d?.k === 'cb') K.safe('fx:' + d.t, () => K.fxH.get(d.t)?.(d, from)); });
  K.on('registerHandlers', (H) => { for (const [a, fn] of K.hostH) H(a, fn); });
  K.on('netReady', (net) => { try { net.relayTypes?.add?.('fx'); } catch { /* relayed by default */ } });
  K.on('phase', () => { K.flings.length = 0; K.bleeds.clear(); K.bleedFx.clear(); K.timers.length = 0; });

  // ---------------------------------------------------------------- movement modifiers around LocalPlayer.update
  K.wrap(g.player, 'update', (orig) => function (dt, input) {
    const s = g.stats;
    const sm0 = s.speedMul, cr0 = s.carryRelief;
    let sm = 1, cr = 0, vel = null;
    for (const f of K.moveMods) { const r = f(dt); if (!r) continue; if (r.speed) sm *= r.speed; if (r.carry) cr += r.carry; if (r.vel) vel = r.vel; }
    if (sm !== 1) s.speedMul = sm0 * sm;
    if (cr) s.carryRelief = (cr0 || 0) + cr;
    if (vel) { this.vel.x = vel.x; this.vel.z = vel.z; }
    try { return orig(dt, input); } finally { s.speedMul = sm0; s.carryRelief = cr0; }
  });

  K.dispose = () => {
    if (K.disposed) return;
    K.disposed = true;
    for (const off of K.offs) { try { off(); } catch { /* ignore */ } }
    for (const undo of K.patches.reverse()) { try { undo(); } catch { /* ignore */ } }
    for (const a of K.anims) { try { a.end?.(); } catch { /* ignore */ } }
    K.anims.length = 0; K.flings.length = 0; K.bleeds.clear(); K.bleedFx.clear(); K.timers.length = 0;
  };
  return K;
}
