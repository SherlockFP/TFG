// TFG wave 7 - GAME FEEL (module `feel`, docs/wave7/feel.md). Installed with this.useModule('feel', installFeel) -> game.feel.
// Presentation only, no balance numbers: melee hitstop/kick/class sounds, gun muzzle flash + casings + indoor/outdoor tails,
// creature topple/dissolve deaths, low-HP heartbeat, pickup thunk + UI tick. Pure rules + sound recipes live in feel_core.js.
import * as THREE from 'three';
import * as C from './feel_core.js';

export function installFeel(game) {
  const g = game, mm = g.mods, offs = [], undo = [];
  const V = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3(0, 1, 0);
  // ---- sounds: recipes go into mods.soundGens (rendered lazily by mods.ensureSound)
  if (mm?.soundGens) for (const [n, fn] of Object.entries(C.buildRecipes())) if (!mm.soundGens.has(n)) mm.soundGens.set(n, fn);
  const snd = (name, pos, vol = 1, pitch, ref = 4) => {
    try {
      mm?.ensureSound?.(name);
      if (pos) rawAt(name, pos, vol, { refDistance: ref, maxDistance: 60, pitch, occlude: true });
      else g.audio.play(name, { volume: vol, bus: 'sfx', pitch });
    } catch { /* audio not ready */ }
  };
  const rawAt = (name, pos, vol, opts) => (origAt || g.audio.at.bind(g.audio))(name, pos, vol, opts);

  // ---- muzzle flash sprites (additive, unlit: never a scene light) + shell/smoke puffs
  let flashTex = null;
  const flashTexture = () => {
    if (flashTex) return flashTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d'), gr = c.createRadialGradient(32, 32, 1, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,220,140,0.85)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
    c.strokeStyle = 'rgba(255,240,200,0.9)'; c.lineWidth = 2;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; c.beginPath(); c.moveTo(32 - Math.cos(a) * 30, 32 - Math.sin(a) * 30); c.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); c.stroke(); }
    flashTex = new THREE.CanvasTexture(cv); flashTex.colorSpace = THREE.SRGBColorSpace;
    return flashTex;
  };
  const flashes = [];   // { spr, t, dur, size }
  const pool = [];
  function muzzleFlash(pos, size, color) {
    if (!g.scene || size <= 0) return;
    let f = pool.pop();
    if (!f) {
      const mat = new THREE.SpriteMaterial({ map: flashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false });
      f = { spr: new THREE.Sprite(mat), t: 0, dur: 0.07, size: 1 };
      f.spr.renderOrder = 8;
    }
    f.spr.material.color.set(color); f.spr.position.copy(pos);
    f.t = 0; f.size = size * (0.85 + Math.random() * 0.3); f.spr.material.rotation = Math.random() * 6.28;
    f.spr.scale.setScalar(f.size * 0.5); f.spr.material.opacity = 1;
    g.scene.add(f.spr); flashes.push(f);
  }
  const PUFF = { color: [0x8a8a86, 0x6a6a66], size: 0.16, life: 0.9, count: 4, speed: 0.5, gravity: -0.6, drag: 1.2 };
  const CASE = { color: [0xd8b04a], size: 0.035, life: 0.6, count: 2, speed: 1.6, up: 1.5, gravity: 12, drag: 0.8 };

  // ---- gun shots: observe the audio layer (one hook covers combat_weapons.js + weapons.js + remote peers)
  let origAt = null;
  const camFwd = new THREE.Vector3();
  function onGunSound(name, pos, vol) {
    const cls = C.gunClassOf(name); if (!cls || !pos || !pos.isVector3) return;
    const fx = C.GUN_FX[cls], cam = g.camera, local = cam && pos.distanceTo(cam.position) < 0.8;
    const indoor = !!(g.player?.indoor || g.player?.inShip);
    snd(C.shotName(cls), pos, Math.min(1, vol * 0.55), undefined, 6);                       // class punch layer on top of the stock sound
    snd(C.tailName(indoor, fx.tail), pos, Math.min(1, vol * (indoor ? 0.5 : 0.35)), undefined, 8);   // echo tail differs indoors / outdoors
    const at = V.copy(pos);
    if (local) {
      camFwd.set(0, 0, -1).applyQuaternion(cam.quaternion); R.crossVectors(camFwd, U).normalize();
      at.addScaledVector(camFwd, 0.75).addScaledVector(R, 0.17).addScaledVector(U, -0.13);
    }
    if (fx.flash) muzzleFlash(at, fx.flash * (local ? 0.55 : 1), fx.color);
    if (g.particles) {
      if (fx.smoke) g.particles.burst(at, PUFF, local ? camFwd : null, fx.smoke * 0.5);
      if (fx.casing && local) g.particles.burst(at.clone().addScaledVector(camFwd, -0.25), CASE, R, 1);
    }
    if (local && fx.flash > 0.5 && !indoor) g.engine?.flash?.(fx.color, 0.05 * fx.flash);   // the scene brightens a touch outdoors only
  }
  const audio = g.audio;
  if (audio && typeof audio.at === 'function') {
    origAt = audio.at.bind(audio);
    const mine = (name, pos, vol, extra) => { const r = origAt(name, pos, vol, extra); try { onGunSound(name, pos, vol ?? 1); } catch { /* fx only */ } return r; };
    audio.at = mine;
    undo.push(() => { if (audio.at === mine) audio.at = origAt; });
  }

  // ---- melee: called from combat.js / actions.js
  /** swing start: class whoosh (heavier swing = lower pitch). Returns true when handled. */
  function swing(cls, kind, weight) {
    if (!C.MELEE_CLASSES.includes(cls)) return false;
    snd(C.swingName(cls), null, kind === 'h' ? 0.75 : 0.6, C.clamp(1.15 - (weight || 5) * 0.025, 0.8, 1.2) * (kind === 'h' ? 0.85 : 1) + (Math.random() - 0.5) * 0.06);
    return true;
  }
  /** confirmed melee hit. o: { cls, dmg, heavy, crit, backstab, metal, pos } -> hitstop + class kick + surface sound + sparks. Returns true when handled. */
  function meleeHit(o) {
    const cls = C.MELEE_CLASSES.includes(o.cls) ? o.cls : 'club';
    g.hitstopT = Math.max(g.hitstopT || 0, C.hitstopSec(o.dmg, o));
    const k = C.meleeKick(cls, o);
    g.engine?.shake?.(k.shake); g.engine?.punch?.(k.pitch, 0, (Math.random() - 0.5) * 2 * k.roll);
    snd(C.impactName(cls, o.metal ? 'metal' : o.wall ? 'wall' : 'flesh'), null, o.crit ? 1 : 0.85, 0.95 + Math.random() * 0.1);
    if (o.crit) g.engine?.flash?.(0xffffff, 0.06);
    if (o.metal && o.pos && g.particles) g.particles.burst(o.pos, 'sparks', null, 0.7);
    return true;
  }
  function wallHit(cls) { snd(C.impactName(C.MELEE_CLASSES.includes(cls) ? cls : 'club', 'wall'), null, 0.6, 0.95 + Math.random() * 0.1); return true; }

  // ---- creature deaths: topple, bounce, thump, then sink + shrink (transform-only; never touches shared materials)
  const deaths = new WeakMap();
  function deathPose(v, dt) {
    if (!v?.root || C.NO_TOPPLE.has(v.type) || v.def?.boss || v.def?.hazard) return;
    let s = deaths.get(v);
    if (!s) {
      const m = v.model?.root, seed = (v.id | 0) + (v.type?.length || 0);
      s = { phase: 'fall', base: m ? m.scale.clone() : null, own: false, seed, size: C.clamp((v.height || v.model?.height || 1.2) / 1.2, 0.5, 3) };
      deaths.set(v, s); v.root.rotation.order = 'YXZ';
    }
    const p = C.deathPose(v.stateT, s.seed, s.size), m = v.model?.root;
    if (!s.own && v.stateT > 0.2 && m && Math.abs(m.rotation.x) + Math.abs(m.rotation.z) > 0.25) s.own = true;   // the model topples itself: only dissolve
    if (p.phase !== s.phase) {
      if (s.phase === 'fall' && p.phase === 'bounce' && v.audible?.()) snd('fl_body', v.pos, C.clamp(0.5 + s.size * 0.3, 0.5, 1.2), C.clamp(1.3 - s.size * 0.25, 0.7, 1.3), 5);
      s.phase = p.phase;
    }
    if (!s.own) { v.root.rotation.x = p.pitch; v.root.rotation.z = p.roll; }
    v.root.position.y += p.hop - p.sink;
    if (m && s.base) m.scale.set(s.base.x * p.scale, s.base.y * p.scale, s.base.z * p.scale);
  }

  // ---- pickup thunk + UI tick, low-HP heartbeat
  if (typeof g.pickup === 'function') {
    const orig = g.pickup;
    const mine = function (it) {
      const r = orig.call(this, it);
      try { if (it?.holder === g.selfId) { const w = it.def?.weight || 2; snd('fl_thunk', null, C.clamp(0.35 + w * 0.05, 0.35, 0.8), C.clamp(1.25 - w * 0.06, 0.7, 1.25)); snd('fl_tick', null, 0.3); } } catch { /* fx only */ }
      return r;
    };
    g.pickup = mine;
    undo.push(() => { if (g.pickup === mine) g.pickup = orig; });
  }
  let beatT = 0, lowSet = false;
  offs.push(mm?.on?.('update', (dt) => {
    for (let i = flashes.length - 1; i >= 0; i--) {   // muzzle flash: quick grow then fade
      const f = flashes[i]; f.t += dt; const u = f.t / f.dur;
      if (u >= 1) { f.spr.removeFromParent(); flashes.splice(i, 1); pool.push(f); continue; }
      f.spr.scale.setScalar(f.size * (0.5 + 0.6 * u)); f.spr.material.opacity = 1 - u * u;
    }
    const p = g.player, eng = g.engine;
    if (!p || !eng?.setLowHealth) return;
    const lvl = p.dead ? 0 : C.lowHpLevel(p.hp, p.maxHp);
    if (lvl > 0) {
      eng.setLowHealth(lvl); lowSet = true;
      beatT -= dt;
      if (beatT <= 0) { beatT = C.beatInterval(lvl); eng.beat?.(0.5 + 0.5 * lvl); snd('fl_heart', null, 0.3 + 0.45 * lvl, 0.9 + 0.2 * lvl); }
    } else if (lowSet) { eng.setLowHealth(0); lowSet = false; beatT = 0; }
  }));

  return {
    swing, meleeHit, hitstop: C.hitstopSec, wallHit, deathPose, muzzleFlash,
    dispose() {
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      for (const u of undo) u();
      for (const f of flashes) f.spr.removeFromParent();
      flashes.length = 0;
    },
  };
}
