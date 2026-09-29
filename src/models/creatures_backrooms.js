// creatures_backrooms.js — procedural PSX models for the Backrooms entities (module 'brcreatures', docs/wave1/brcreatures.md).
// Same contract as models/creatures.js: origin at the feet, faces +Z, metres,
//   { root, parts, height, radius, update(dt, { state, speed, t, time, progress }), setElite, setTint, setHitFlash, dispose }
//
//   br_smiler     a shadow you can barely see + a floating, glowing grin and eyes (sprites = always billboarded).
//                 states: idle/lurk, stalk, lit (flashlight on it: squints, recoils), lunge (maw opens), retreat, stunned, dead
//   br_hound      pale gaunt humanoid crawling on all fours, blind, long black hair. walk/sniff/hunt/lunge/lost/stunned/dead
//   br_partygoer  tall mustard-yellow figure, crude "=)" marker face, party hat, red balloon on a string.
//                 idle, wave, walk, rush, hug, stagger/stunned, dead (the balloon floats away)
//   br_moth       a fluttering swarm of pale moths (one InstancedMesh). orbit (around a lamp), swarm (around a head), dead
// Emissive / unlit materials only: no scene lights are ever created (AGENTS.md §7).
// Safe to import in Node (textures are null without a DOM).
import * as THREE from 'three';
import { G, xf, merged, lam, lamI, basI, tex, noiseFill, mk, pv, Tinter, clamp, lerp, smooth, damp, keys, rng, TAU, PI, HAS_DOM } from './modelkit.js';

/** set by the game module: lit(pos) -> is a flashlight pointed at this world position (client side) */
export const BR_ENV = { lit: null };

const ELITE_EYE = new THREE.Color('#ff2414');
const _v = new THREE.Vector3();

// ------------------------------------------------------------------ shared plumbing
function makeCtx(id, opts) {
  const seed = opts.seed ?? ((Math.random() * 1e9) | 0);
  const ctx = {
    id, opts, seed, rnd: rng(seed * 31 + id.length * 7919), root: new THREE.Group(), owned: [], eyes: [], W: {}, localTime: 0, walkPh: 0,
  };
  ctx.root.name = 'creature_' + id;
  ctx.ph = ctx.rnd() * TAU;
  ctx.walkPh = ctx.rnd() * TAU;
  ctx.body = pv(ctx.root, null, null, 'scaler');
  ctx.own = (x) => { ctx.owned.push(x); return x; };
  ctx.w = (key, on, rate, dt) => (ctx.W[key] = damp(ctx.W[key] ?? 0, on ? 1 : 0, rate, dt));
  ctx.gait = (speed, stride, dt) => (ctx.walkPh = (ctx.walkPh + (speed * dt / stride) * TAU) % TAU);
  ctx.eye = (color, o = {}) => {
    const m = basI(color, o);
    m.userData.baseColor = new THREE.Color(color);
    m.userData.eliteColor = ELITE_EYE.clone();
    ctx.eyes.push(m); ctx.owned.push(m);
    return m;
  };
  return ctx;
}

function finish(ctx, def) {
  const tinter = new Tinter(ctx.root);
  let elite = false;
  const api = {
    id: ctx.id, root: ctx.root, parts: { ...def.parts, eyes: ctx.eyes }, height: def.height, radius: def.radius,
    update(dt, a = {}) {
      dt = clamp(dt || 0, 0, 0.1);
      ctx.localTime += dt;
      def.update(dt, { state: a.state || 'idle', speed: a.speed ?? null, t: a.t ?? 0, time: a.time ?? ctx.localTime, progress: a.progress ?? 0 });
    },
    setElite(b) {
      elite = !!b;
      ctx.body.scale.setScalar(elite ? def.eliteScale ?? 1.12 : 1);
      for (const m of ctx.eyes) m.color.copy(elite ? m.userData.eliteColor : m.userData.baseColor);
      if (elite) tinter.setBase('#2c0606'); else if (tinter.active) tinter.setBase('#000000');
      def.onElite?.(elite);
    },
    isElite: () => elite,
    setTint(color, strong = false) {
      const col = new THREE.Color(color);
      tinter.setBase(col.clone().multiplyScalar(strong ? 0.26 : 0.13));
      for (const m of ctx.eyes) m.color.copy(col);
      def.onTint?.(col);
    },
    setHitFlash(v) { tinter.setFlash(v); def.onFlash?.(v); },
    dispose() {
      def.dispose?.();
      tinter.dispose();
      for (const x of ctx.owned) x?.dispose?.();
      ctx.owned.length = 0;
    },
  };
  if (ctx.opts.elite) api.setElite(true);
  api.update(0, { state: 'idle', time: 0 });
  return api;
}

const sprite = (ctx, map, w, h, o = {}) => {
  const m = ctx.own(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false, ...o }));
  m.userData.instance = true;
  const s = new THREE.Sprite(m);
  s.scale.set(w, h, 1);
  return s;
};

// ------------------------------------------------------------------ textures (cached, null in Node)
/** quadratic bezier point */
const qb = (p0, c, p1, t) => [(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]];

function grinTex() {
  return tex('br_grin', 128, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const L = [6, 14], R = [122, 14], up = [64, 34], lo = [64, 70];
    c.beginPath(); c.moveTo(L[0], L[1]); c.quadraticCurveTo(up[0], up[1], R[0], R[1]); c.quadraticCurveTo(lo[0], lo[1], L[0], L[1]); c.closePath();
    c.fillStyle = '#0c0000'; c.fill();
    c.shadowColor = '#fff4c8'; c.shadowBlur = 5;
    const N = 15;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < N; i++) {
        const t0 = (i + 0.08) / N, t1 = (i + 0.92) / N, tm = (i + 0.5) / N;
        const big = 1 - Math.abs(tm - 0.5) * 1.3;
        const a = qb(L, row ? lo : up, R, t0), b = qb(L, row ? lo : up, R, t1), m = qb(L, row ? lo : up, R, tm);
        const len = (row ? 8 : 10) * big + 2;
        c.fillStyle = i % 3 === 1 ? '#e8e0c4' : '#fffbea';
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(m[0], m[1] + (row ? -len : len)); c.closePath(); c.fill();
      }
    }
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(255,240,200,0.55)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(L[0], L[1]); c.quadraticCurveTo(up[0], up[1], R[0], R[1]); c.stroke();
  }, false);
}
function mawTex() {
  return tex('br_maw', 96, 96, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    c.fillStyle = '#080000'; c.beginPath(); c.ellipse(cx, cy, 44, 38, 0, 0, TAU); c.fill();
    c.fillStyle = '#2a0204'; c.beginPath(); c.ellipse(cx, cy + 4, 20, 16, 0, 0, TAU); c.fill();
    c.shadowColor = '#fff4c8'; c.shadowBlur = 5;
    for (let ring = 0; ring < 2; ring++) {
      const n = ring ? 16 : 22, rx = ring ? 30 : 44, ry = ring ? 25 : 38, len = ring ? 9 : 13;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * TAU, a1 = ((i + 0.85) / n) * TAU, am = ((i + 0.42) / n) * TAU;
        const p0 = [cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry], p1 = [cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry];
        const tip = [cx + Math.cos(am) * (rx - len), cy + Math.sin(am) * (ry - len)];
        c.fillStyle = (i + ring) % 4 === 0 ? '#e0d6b8' : '#fffbea';
        c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.lineTo(tip[0], tip[1]); c.closePath(); c.fill();
      }
    }
  }, false);
}
function smilerEyeTex() {
  return tex('br_smeyes', 64, 16, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.shadowColor = '#fff0b0'; c.shadowBlur = 4;
    for (const [x, tilt] of [[15, -0.18], [49, 0.18]]) {
      c.save(); c.translate(x, 8); c.rotate(tilt);
      c.fillStyle = '#fffbe2';
      c.beginPath(); c.moveTo(-11, 0); c.quadraticCurveTo(0, -7, 11, 0); c.quadraticCurveTo(0, 5, -11, 0); c.fill();
      c.shadowBlur = 0; c.fillStyle = '#000'; c.fillRect(-1, -2, 3, 3);
      c.restore();
    }
  }, false);
}
function haloTex() {
  return tex('br_halo', 64, 64, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,245,210,0.9)'); g.addColorStop(0.35, 'rgba(255,235,180,0.25)'); g.addColorStop(1, 'rgba(255,230,170,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, false);
}
function partyFaceTex() {
  return tex('br_partyface', 64, 64, (c, w, h, r) => {
    noiseFill(c, w, h, r, '#e7c43a', 0.07, 2);
    c.strokeStyle = '#0a0806'; c.lineCap = 'round'; c.lineWidth = 4;
    // "=)" turned upright: two vertical bar eyes and a wide U smile, drawn with a shaky marker
    const shaky = (pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x + (r() - 0.5) * 1.6, y + (r() - 0.5) * 1.6) : c.moveTo(x, y))); c.stroke(); };
    shaky([[22, 14], [22.5, 22], [22, 30]]);
    shaky([[40, 14], [40.5, 22], [41, 30]]);
    shaky([[12, 36], [18, 46], [32, 51], [46, 46], [53, 35]]);
    // marker drips
    c.lineWidth = 1.5;
    for (const [x, y, l] of [[22, 30, 6], [41, 30, 9], [32, 51, 7], [18, 46, 4]]) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 0.3, y + l); c.stroke(); c.fillStyle = '#0a0806'; c.fillRect(x - 1, y + l - 1, 2.5, 2.5); }
  });
}
function partySkinTex() {
  return tex('br_partyskin', 32, 32, (c, w, h, r) => {
    noiseFill(c, w, h, r, '#e2bd34', 0.1, 2);
    c.fillStyle = 'rgba(120,80,10,0.18)';
    for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(r() * w, r() * h, 2 + r() * 4, 3 + r() * 6, 0, 0, TAU); c.fill(); }
  });
}
function hatTex() {
  return tex('br_hat', 32, 32, (c, w, h) => {
    const cols = ['#ff4fa8', '#3ad6ff', '#ffe23a', '#7a4dff'];
    for (let i = 0; i < 8; i++) { c.fillStyle = cols[i % 4]; c.fillRect(0, i * 4, w, 4); }
    c.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 12; i++) c.fillRect((i * 7) % w, (i * 11) % h, 1, 1);
  });
}
function paleSkinTex() {
  return tex('br_paleskin', 32, 32, (c, w, h, r) => {
    noiseFill(c, w, h, r, '#d6cfc0', 0.09, 2);
    c.strokeStyle = 'rgba(110,70,90,0.35)'; c.lineWidth = 1;
    for (let i = 0; i < 5; i++) { c.beginPath(); let x = r() * w, y = r() * h; c.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (r() - 0.5) * 10; y += r() * 7; c.lineTo(x, y); } c.stroke(); }
    c.fillStyle = 'rgba(80,60,55,0.28)'; for (let y = 3; y < h; y += 6) c.fillRect(0, y, w, 1);   // ribs
  });
}

// =====================================================================================================
// SMILER
// =====================================================================================================
function buildSmiler(ctx) {
  const shade = ctx.own(lamI('#17120f', { transparent: true, opacity: 0.08, depthWrite: false }));
  const hips = pv(ctx.body, [0, 1.0, 0], null, 'hips');
  // silhouette: hunched, far too long arms, a narrow head. Almost invisible unless a flashlight finds it.
  mk(hips, merged('brs_torso', () => [
    xf(G.cyl(0.16, 0.1, 0.7, 6), [0, 0.35, 0], [0, 0, 0], [1, 1, 0.6]),
    xf(G.sph(1, 6, 4), [0, 0.72, 0.02], [0, 0, 0], [0.24, 0.07, 0.12]),
  ]), shade);
  const legs = [1, -1].map((s) => {
    const hip = pv(hips, [s * 0.1, 0, 0]);
    mk(hip, merged('brs_leg', () => [xf(G.segY(0.55, 0.05, 0.03, 5)), xf(G.segY(0.5, 0.03, 0.018, 5), [0, -0.52, 0.02])]), shade);
    return { hip, s };
  });
  const chest = pv(hips, [0, 0.68, 0], null, 'chest');
  const neck = pv(chest, [0, 0.08, 0.06]);
  mk(neck, G.segY(0.22, 0.035, 0.04, 4), shade, null, [PI, 0, 0]);
  const head = pv(neck, [0, 0.24, 0.04], null, 'head');
  mk(head, merged('brs_skull', () => [xf(G.sph(1, 7, 5), [0, 0.06, 0], [0, 0, 0], [0.16, 0.2, 0.14])]), shade);
  const arms = [1, -1].map((s) => {
    const sh = pv(chest, [s * 0.22, 0.02, 0]);
    mk(sh, merged('brs_uarm', () => [xf(G.segY(0.62, 0.035, 0.025, 5))]), shade);
    const el = pv(sh, [0, -0.62, 0]);
    mk(el, merged('brs_farm', () => [xf(G.segY(0.6, 0.025, 0.015, 5)),
      xf(G.cone(0.012, 0.3, 3), [0.03, -0.72, 0.01], [PI, 0, 0.12]), xf(G.cone(0.012, 0.34, 3), [0, -0.74, 0.02], [PI, 0, 0]), xf(G.cone(0.012, 0.3, 3), [-0.03, -0.72, 0.01], [PI, 0, -0.12])]), shade);
    return { sh, el, s };
  });
  // the face: sprites (billboards) - glowing grin, open maw, eyes, soft halo. fog:false = they burn through the haze.
  const face = pv(head, [0, 0.03, 0.2], null, 'face');
  const halo = sprite(ctx, haloTex(), 1.25, 1.0, { blending: THREE.AdditiveBlending, opacity: 0.16 });
  halo.position.set(0, 0.02, -0.05); face.add(halo);
  const grin = sprite(ctx, grinTex(), 0.66, 0.33); grin.position.set(0, -0.1, 0.02); face.add(grin);
  const maw = sprite(ctx, mawTex(), 0.62, 0.62); maw.position.set(0, -0.06, 0.03); maw.visible = false; face.add(maw);
  const eyes = sprite(ctx, smilerEyeTex(), 0.5, 0.125); eyes.position.set(0, 0.16, 0.02); face.add(eyes);
  for (const s of [halo, grin, maw, eyes]) s.renderOrder = 3;
  const faceMats = [grin.material, maw.material, eyes.material];
  const baseCol = new THREE.Color('#ffffff'), tintCol = new THREE.Color('#ffffff'), red = new THREE.Color('#ff3020');
  let blinkT = 1 + ctx.rnd() * 3, blink = 0, flash = 0, alpha = 0.08;
  const root = ctx.root;
  return {
    parts: { head, face, grin, maw, eyesSprite: eyes, shade },
    height: 1.95, radius: 0.4,
    onTint(col) { tintCol.copy(col).lerp(baseCol, 0.5); },
    onElite(e) { tintCol.set(e ? '#ffb4a4' : '#ffffff'); },
    onFlash(v) { flash = v; },
    update(dt, a) {
      const st = a.state, tm = a.time + ctx.ph * 3;
      const dead = ctx.w('dead', st === 'dead', 3, dt);
      const lit = ctx.w('lit', st === 'lit', 7, dt);
      const lunge = ctx.w('lunge', st === 'lunge' || st === 'attack', 12, dt);
      const stalk = ctx.w('stalk', st === 'stalk' || st === 'run' || st === 'walk', 3, dt);
      const retreat = ctx.w('retreat', st === 'retreat' || st === 'flee', 4, dt);
      const stun = ctx.w('stun', st === 'stunned', 6, dt);
      const speed = clamp(a.speed ?? 0, 0, 8);
      const ph = ctx.gait(speed, 1.6, dt), s = Math.sin(ph);
      // the body: drifts more than it walks
      hips.position.y = 1.0 + Math.sin(tm * 1.3) * 0.03 - dead * 0.85 - lunge * 0.12;
      hips.rotation.x = 0.35 * stalk + 0.55 * lunge - 0.25 * lit + dead * 1.3;
      for (const L of legs) L.hip.rotation.x = (L.s > 0 ? s : -s) * 0.35 * clamp(speed / 2, 0, 1) - dead * 1.2;
      chest.rotation.set(0.2 * stalk + 0.3 * lunge - 0.2 * lit, Math.sin(tm * 0.6) * 0.1, Math.sin(tm * 0.9) * 0.05 + stun * Math.sin(tm * 30) * 0.1);
      neck.rotation.set(-0.3 * stalk - 0.2 * lunge + 0.25 * lit, 0, Math.sin(tm * 0.45) * 0.28 * (1 - lunge) * (1 - dead));
      for (const A of arms) {
        const sway = Math.sin(tm * 0.8 + A.s) * 0.06;
        A.sh.rotation.set(sway - 0.2 * stalk - 1.4 * lunge - 1.6 * lit, 0, A.s * (0.08 + 0.35 * lit + 0.2 * lunge));
        A.el.rotation.set(-0.15 - 0.6 * lit - 0.3 * lunge, 0, A.s * 0.1 * lit);
      }
      // face: a slow breathing pulse; the grin squints in the light, the maw opens for the bite
      blinkT -= dt;
      if (blinkT <= 0) { blink = 0.14; blinkT = 2.5 + ctx.rnd() * 4; }
      blink = Math.max(0, blink - dt);
      const pulse = 1 + Math.sin(tm * 3.2) * 0.04 + stalk * 0.08;
      grin.scale.set(0.66 * pulse * (1 + lunge * 0.3), 0.33 * pulse * (1 - 0.45 * lit), 1);
      grin.visible = lunge < 0.5;
      maw.visible = lunge >= 0.5;
      maw.scale.setScalar(0.62 * (0.8 + lunge * 0.5 + Math.sin(tm * 40) * 0.03 * lunge));
      eyes.scale.set(0.5 * (1 + stalk * 0.12), 0.125 * (blink > 0 ? 0.12 : 1) * (1 - 0.6 * lit), 1);
      let fade = (1 - dead) * (1 - 0.55 * retreat);
      if (lit > 0.1) fade *= Math.sin(tm * 23) > 0.2 ? 1 : 0.35;             // the light makes it glitch
      for (const m of faceMats) { m.opacity = fade; m.color.copy(tintCol).lerp(red, flash * 0.8); }
      halo.material.opacity = 0.16 * fade * (1 + lunge);
      face.position.x = stun * Math.sin(tm * 47) * 0.04;
      // the silhouette only shows under a flashlight (or mid-bite)
      let want = 0.07 + lunge * 0.25;
      if (st === 'lit' || (BR_ENV.lit && BR_ENV.lit(root.getWorldPosition(_v)))) want = 0.9;
      alpha = damp(alpha, want * (1 - dead * 0.9), 6, dt);
      shade.opacity = alpha;
      shade.depthWrite = alpha > 0.5;
    },
  };
}

// =====================================================================================================
// HOUND (pale crawling humanoid)
// =====================================================================================================
function buildHound(ctx) {
  const skin = lam('#d6cfc0', { map: paleSkinTex() });
  const dark = lam('#221a18');
  const hair = lam('#0c0a09');
  const tooth = lam('#e8dfc8');
  const torso = pv(ctx.body, [0, 0.62, 0], null, 'torso');   // pivot at the hips, spine runs along +Z
  mk(torso, merged('brh_torso', () => [
    xf(G.cyl(0.17, 0.12, 0.72, 6), [0, 0.06, 0.34], [PI / 2 - 0.12, 0, 0], [1, 1, 0.7]),
    xf(G.sph(1, 6, 4), [0, 0.02, 0], [0, 0, 0], [0.16, 0.1, 0.13]),
  ]), skin);
  mk(torso, merged('brh_spine', () => { const a = []; for (let i = 0; i < 8; i++) a.push(xf(G.cone(0.03, 0.07, 4), [0, 0.15 + i * 0.012, 0.04 + i * 0.085], [-0.3, 0, 0])); return a; }), skin);
  const legs = [1, -1].map((s) => {
    const hip = pv(torso, [s * 0.13, 0, 0]);
    mk(hip, merged('brh_thigh', () => [xf(G.segY(0.46, 0.06, 0.04, 5))]), skin);
    const knee = pv(hip, [0, -0.46, 0]);
    mk(knee, merged('brh_shin', () => [xf(G.segY(0.44, 0.04, 0.025, 5)), xf(G.boxZ(0.07, 0.03, 0.2), [0, -0.44, -0.16])]), skin);
    return { hip, knee, s };
  });
  const chest = pv(torso, [0, 0.12, 0.7], null, 'chest');
  const arms = [1, -1].map((s) => {
    const sh = pv(chest, [s * 0.17, -0.02, 0]);
    mk(sh, merged('brh_uarm', () => [xf(G.segY(0.44, 0.045, 0.03, 5))]), skin);
    const el = pv(sh, [0, -0.44, 0]);
    mk(el, merged('brh_farm', () => [xf(G.segY(0.42, 0.03, 0.02, 5)),
      xf(G.box(0.08, 0.02, 0.06), [0, -0.43, 0.02]),
      xf(G.cone(0.01, 0.16, 3), [0.03, -0.44, 0.1], [PI / 2 + 0.2, 0, 0]), xf(G.cone(0.01, 0.18, 3), [0, -0.44, 0.11], [PI / 2 + 0.2, 0, 0]), xf(G.cone(0.01, 0.16, 3), [-0.03, -0.44, 0.1], [PI / 2 + 0.2, 0, 0])]), skin);
    return { sh, el, s };
  });
  const neck = pv(chest, [0, 0.02, 0.1]);
  mk(neck, G.segZ(0.18, 0.05, 0.045, 5), skin);
  const head = pv(neck, [0, 0, 0.2], null, 'head');
  mk(head, merged('brh_skull', () => [xf(G.sph(1, 7, 5), [0, 0.02, 0.06], [0, 0, 0], [0.11, 0.12, 0.14])]), skin);
  // blind: the eyes are sunken black pits
  mk(head, merged('brh_pits', () => [xf(G.sph(0.03, 4, 3), [0.045, 0.06, 0.17]), xf(G.sph(0.03, 4, 3), [-0.045, 0.06, 0.17])]), dark);
  const jaw = pv(head, [0, -0.04, 0.08], null, 'jaw');
  mk(jaw, merged('brh_jaw', () => [xf(G.box(0.14, 0.03, 0.13), [0, -0.015, 0.06])]), skin);
  mk(jaw, merged('brh_teeth', () => { const a = []; for (let i = 0; i < 7; i++) a.push(xf(G.cone(0.008, 0.03, 3), [(i - 3) * 0.018, 0.01, 0.12])); return a; }), tooth);
  mk(head, merged('brh_mouth', () => [xf(G.box(0.13, 0.03, 0.02), [0, -0.035, 0.18])]), dark);
  // long wet black hair hanging over the face
  const strands = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 2.2;
    const p = pv(head, [Math.sin(a) * 0.1, 0.1, 0.1 + Math.cos(a) * 0.08]);
    mk(p, G.boxY(0.035, 0.34 + (i % 3) * 0.08, 0.01), hair, null, [0, a * 0.4, 0]);
    strands.push(p);
  }
  return {
    parts: { head, jaw, torso },
    height: 0.95, radius: 0.55,
    update(dt, a) {
      const st = a.state, tm = a.time + ctx.ph * 3;
      const dead = ctx.w('dead', st === 'dead', 4, dt);
      const stun = ctx.w('stun', st === 'stunned', 6, dt);
      const hunt = ctx.w('hunt', st === 'hunt' || st === 'run', 5, dt);
      const sniff = ctx.w('sniff', st === 'sniff' || st === 'lost', 4, dt);
      const lungeT = st === 'lunge' || st === 'attack' ? a.t : -1;
      const lunge = lungeT >= 0 ? keys(lungeT, [[0, 0], [0.12, 1], [0.45, 1], [0.8, 0]]) : 0;
      const speed = clamp(a.speed ?? 0, 0, 12) * (1 - dead);
      const ph = ctx.gait(speed, lerp(0.95, 1.5, hunt), dt), s = Math.sin(ph), co = Math.cos(ph);
      const amp = clamp(speed / 1.4, 0, 1);
      const deadK = smooth(dead);
      torso.position.y = 0.62 - hunt * 0.1 + Math.abs(s) * 0.035 * amp - deadK * 0.45 - stun * 0.12 + lunge * 0.12;
      torso.rotation.set(-0.12 + hunt * 0.1 - lunge * 0.35 + deadK * 0.15, Math.sin(tm * 0.7) * 0.05 * (1 - amp), s * 0.08 * amp + deadK * 1.2);
      // diagonal gait: front-left moves with back-right
      for (const L of legs) {
        const p = L.s > 0 ? s : -s, pc = L.s > 0 ? co : -co;
        L.hip.rotation.set(0.35 + p * 0.55 * amp + lunge * 0.6 - deadK * 0.4, 0, L.s * (0.35 + 0.1 * hunt));
        L.knee.rotation.x = 1.3 + Math.max(0, pc) * 0.5 * amp - lunge * 0.8 - deadK * 0.4;
      }
      for (const A of arms) {
        const p = A.s > 0 ? -s : s, pc = A.s > 0 ? -co : co;
        A.sh.rotation.set(-0.35 - p * 0.6 * amp - lunge * 1.2 + deadK * 0.5, 0, A.s * (0.22 + 0.1 * hunt));
        A.el.rotation.x = 0.55 + Math.max(0, pc) * 0.7 * amp - lunge * 0.4 + deadK * 0.3;
      }
      // the head never stops moving: twitches, tilts to listen, snaps up to sniff
      const twitch = Math.sin(tm * 13.7) * Math.sin(tm * 2.3) > 0.72 ? Math.sin(tm * 60) * 0.25 : 0;
      neck.rotation.set(0.25 - sniff * (0.55 + Math.sin(tm * 9) * 0.12) - lunge * 0.3 + hunt * 0.15, Math.sin(tm * 1.7) * 0.35 * (1 - hunt) + twitch, Math.sin(tm * 0.9) * 0.4 * sniff + stun * Math.sin(tm * 20) * 0.3);
      head.rotation.set(0, 0, Math.sin(tm * 0.6) * 0.25 + twitch * 0.5);
      jaw.rotation.x = Math.max(lunge * 0.8, hunt * 0.25 + Math.max(0, Math.sin(tm * 3)) * 0.12, deadK * 0.5);
      for (let i = 0; i < strands.length; i++) strands[i].rotation.x = -0.1 + Math.sin(tm * 3 + i) * 0.08 * (0.3 + amp) - neck.rotation.x * 0.6;
    },
  };
}

// =====================================================================================================
// PARTYGOER
// =====================================================================================================
function buildPartygoer(ctx) {
  const skin = lam('#e2bd34', { map: partySkinTex() });
  const faceM = lam('#e7c43a', { map: partyFaceTex() });
  const hatM = lam('#ff4fa8', { map: hatTex() });
  const white = lam('#fff6ea');
  const hips = pv(ctx.body, [0, 1.2, 0], null, 'hips');
  mk(hips, merged('brp_hips', () => [xf(G.sph(1, 7, 4), [0, 0, 0], [0, 0, 0], [0.2, 0.13, 0.15])]), skin);
  const legs = [1, -1].map((s) => {
    const hip = pv(hips, [s * 0.11, -0.03, 0]);
    mk(hip, merged('brp_thigh', () => [xf(G.segY(0.6, 0.07, 0.05, 6))]), skin);
    const knee = pv(hip, [0, -0.6, 0]);
    mk(knee, merged('brp_shin', () => [xf(G.segY(0.56, 0.05, 0.04, 6)), xf(G.sph(1, 6, 3), [0, -0.57, 0.05], [0, 0, 0], [0.07, 0.04, 0.13])]), skin);
    return { hip, knee, s };
  });
  const spine = pv(hips, [0, 0.05, 0], null, 'spine');
  mk(spine, merged('brp_torso', () => [
    xf(G.cyl(0.2, 0.19, 0.78, 8), [0, 0.39, 0], [0, 0, 0], [1, 1, 0.72]),
    xf(G.sph(1, 8, 4), [0, 0.8, 0], [0, 0, 0], [0.26, 0.1, 0.16]),
  ]), skin);
  const neck = pv(spine, [0, 0.86, 0]);
  mk(neck, G.segY(0.2, 0.05, 0.06, 5), skin, null, [PI, 0, 0]);
  const head = pv(neck, [0, 0.2, 0], null, 'head');
  mk(head, merged('brp_head', () => [xf(G.sph(1, 10, 7), [0, 0.2, 0], [0, 0, 0], [0.21, 0.24, 0.2])]), skin);
  // the face is a flat, slightly bulging disc with the marker "=)" on it
  mk(head, G.circle(0.19, 12), faceM, [0, 0.21, 0.198], [0, 0, 0]);
  const hat = pv(head, [0.03, 0.4, 0], [0, 0, -0.18]);
  mk(hat, G.cone(0.11, 0.34, 8), hatM, [0, 0.16, 0]);
  mk(hat, G.ico(0.045, 0), white, [0, 0.34, 0]);
  mk(hat, G.tor(0.105, 0.018, 4, 10), white, [0, 0, 0], [PI / 2, 0, 0]);
  const arms = [1, -1].map((s) => {
    const sh = pv(spine, [s * 0.27, 0.74, 0]);
    mk(sh, merged('brp_uarm', () => [xf(G.segY(0.62, 0.05, 0.04, 6)), xf(G.sph(0.06, 5, 4))]), skin);
    const el = pv(sh, [0, -0.62, 0]);
    mk(el, merged('brp_farm', () => [xf(G.segY(0.58, 0.04, 0.035, 6)), xf(G.sph(1, 6, 4), [0, -0.64, 0.02], [0, 0, 0], [0.06, 0.09, 0.045])]), skin);
    return { sh, el, s };
  });
  // balloon: tied to the left hand, bobbing on its own string
  const hand = pv(arms[1].el, [0, -0.66, 0.02]);
  const balloonRoot = new THREE.Group();   // lives in the model root (not the arm) so it keeps floating upright
  ctx.root.add(balloonRoot);
  const balloonM = ctx.own(lamI('#e8201c', { transparent: true, opacity: 1 }));
  balloonM.emissive = new THREE.Color('#3a0402');
  const balloon = mk(balloonRoot, G.sph(1, 10, 8), balloonM, [0, 0, 0], null, [0.24, 0.3, 0.24]);
  mk(balloon, G.cone(0.2, 0.25, 5), balloonM, [0, -1.05, 0], [PI, 0, 0], [1, 1, 1]);
  const strGeo = ctx.own(new THREE.BufferGeometry());
  const strPos = new Float32Array(9 * 3);
  strGeo.setAttribute('position', new THREE.BufferAttribute(strPos, 3));
  const strM = ctx.own(new THREE.LineBasicMaterial({ color: '#f4f0e6', transparent: true }));
  const string = new THREE.Line(strGeo, strM);
  string.frustumCulled = false;
  ctx.root.add(string);
  const bPos = new THREE.Vector3(-0.5, 3.1, 0.1), bVel = new THREE.Vector3(), handW = new THREE.Vector3(), inv = new THREE.Matrix4();
  let freeT = 0, first = true;
  return {
    parts: { head, balloon, hat },
    height: 2.6, radius: 0.45,
    update(dt, a) {
      const st = a.state, tm = a.time + ctx.ph * 3;
      const dead = ctx.w('dead', st === 'dead', 2.5, dt);
      const stun = ctx.w('stun', st === 'stunned' || st === 'stagger', 6, dt);
      const wave = ctx.w('wave', st === 'wave', 5, dt);
      const hug = ctx.w('hug', st === 'hug', 6, dt);
      const rush = ctx.w('rush', st === 'rush' || st === 'run', 4, dt);
      const speed = clamp(a.speed ?? 0, 0, 6) * (1 - dead);
      const ph = ctx.gait(speed, lerp(1.9, 2.3, rush), dt), s = Math.sin(ph), co = Math.cos(ph);
      const amp = clamp(speed / 1.1, 0, 1);
      const deadK = smooth(dead);
      const sway = Math.sin(tm * 0.9) * (1 - amp) * (1 - hug);
      hips.position.set(sway * 0.05, 1.2 + Math.abs(co) * 0.06 * amp - deadK * 1.0 - stun * 0.08, 0);
      hips.rotation.set(-deadK * 1.35, 0, sway * 0.06);
      for (const L of legs) {
        const p = L.s > 0 ? s : -s, pc = L.s > 0 ? co : -co;
        L.hip.rotation.set(-p * 0.5 * amp - deadK * 0.3, 0, L.s * 0.03);
        L.knee.rotation.x = Math.max(0, pc) * 0.8 * amp + deadK * 0.6;
      }
      spine.rotation.set(0.05 + rush * 0.18 + hug * 0.28 - stun * 0.3, Math.sin(tm * 0.5) * 0.08 * (1 - hug), sway * 0.1 + stun * Math.sin(tm * 11) * 0.12);
      // the head lolls; during a hug it tilts sideways and stares down at you
      neck.rotation.set(0.1 + hug * 0.35, Math.sin(tm * 0.37) * 0.25 * (1 - hug), Math.sin(tm * 0.7) * 0.18 + hug * 0.5 + wave * Math.sin(tm * 3) * 0.12);
      head.rotation.set(0, 0, 0);
      for (const A of arms) {
        const p = A.s > 0 ? s : -s;
        let sx = -p * 0.35 * amp - rush * 0.9, sz = A.s * 0.12, ex = -0.12 - rush * 0.3, ez = 0;
        if (A.s > 0) { sx = lerp(sx, -2.7, wave); sz = lerp(sz, 0.35 + Math.sin(tm * 9) * 0.45, wave); ex = lerp(ex, -0.4, wave); }   // waving arm
        sx = lerp(sx, -1.45, hug); sz = lerp(sz, -A.s * 0.35, hug); ex = lerp(ex, -0.25, hug); ez = lerp(ez, -A.s * (1.15 + Math.sin(tm * 7) * 0.08), hug);   // wrap around the victim
        sx = lerp(sx, -1.0 + Math.sin(tm * 8 + A.s) * 0.6, stun);
        A.sh.rotation.set(sx - deadK * 0.4, 0, sz);
        A.el.rotation.set(ex, 0, ez);
      }
      // balloon: spring towards a point above the hand; after death it slips away and rises
      ctx.root.updateMatrixWorld(true);
      hand.getWorldPosition(handW);
      inv.copy(ctx.root.matrixWorld).invert();
      handW.applyMatrix4(inv);
      if (st === 'dead') freeT += dt; else freeT = 0;
      if (first) { bPos.set(handW.x, handW.y + 1.1, handW.z); first = false; }
      if (freeT > 0.6) { bVel.y += dt * 0.9; bVel.x += Math.sin(tm) * dt * 0.1; bPos.addScaledVector(bVel, dt); }
      else {
        const tx = handW.x + Math.sin(tm * 0.8) * 0.12, ty = handW.y + 1.05, tz = handW.z + Math.cos(tm * 0.6) * 0.1;
        bVel.x += (tx - bPos.x) * dt * 14; bVel.y += (ty - bPos.y) * dt * 14; bVel.z += (tz - bPos.z) * dt * 14;
        bVel.multiplyScalar(Math.exp(-dt * 3.2));
        bPos.addScaledVector(bVel, dt);
      }
      balloonRoot.position.copy(bPos);
      balloonRoot.rotation.set(bVel.z * 0.3, 0, -bVel.x * 0.3);
      const fadeB = freeT > 3 ? clamp(1 - (freeT - 3) / 2, 0, 1) : 1;
      balloonM.opacity = fadeB; strM.opacity = freeT > 0.6 ? 0 : 1;
      balloonRoot.visible = fadeB > 0.01;
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        const x = lerp(handW.x, bPos.x, u) + Math.sin(u * PI) * Math.sin(tm * 2.1) * 0.05;
        const y = lerp(handW.y, bPos.y - 0.3, u) - Math.sin(u * PI) * 0.12;
        const z = lerp(handW.z, bPos.z, u);
        strPos[i * 3] = x; strPos[i * 3 + 1] = y; strPos[i * 3 + 2] = z;
      }
      strGeo.attributes.position.needsUpdate = true;
    },
    dispose() { balloonRoot.removeFromParent(); string.removeFromParent(); },
  };
}

// =====================================================================================================
// MOTH SWARM
// =====================================================================================================
const MOTHS = 22;
function mothGeo() {
  return merged('brm_moth', () => {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.02, 0.07, 0.01, 0.03, 0.06, 0, -0.04, 0, 0, 0.02, 0.06, 0, -0.04, 0.02, 0, -0.05], 3));
    wing.computeVertexNormals();
    const w2 = wing.clone().scale(-1, 1, 1);
    // flip the winding of the mirrored wing so both are visible from above (the material is double sided anyway)
    return [wing, w2, xf(G.box(0.012, 0.012, 0.06))];
  });
}
function buildMoth(ctx) {
  const mat = ctx.own(lamI('#c9bc9c', { side: THREE.DoubleSide }));
  mat.emissive = new THREE.Color('#2a2418');
  const inst = new THREE.InstancedMesh(mothGeo(), mat, MOTHS);
  inst.frustumCulled = false;
  ctx.body.add(inst);
  const M = [];
  for (let i = 0; i < MOTHS; i++) M.push({ a: ctx.rnd() * TAU, b: ctx.rnd() * TAU, r: 0.35 + ctx.rnd() * 0.75, sp: 0.8 + ctx.rnd() * 1.6, h: (ctx.rnd() - 0.5) * 0.7, flap: ctx.rnd() * TAU, fall: 0, fy: 0 });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  let cy = 2.3;
  return {
    parts: { swarm: inst },
    height: 2.7, radius: 0.8,
    update(dt, a) {
      const st = a.state, tm = a.time + ctx.ph;
      const dead = st === 'dead';
      const swarm = ctx.w('swarm', st === 'swarm' || st === 'attack', 3, dt);
      const scatter = ctx.w('scatter', st === 'scatter' || st === 'stunned', 5, dt);
      cy = damp(cy, lerp(2.35, 1.55, swarm), 3, dt);
      for (let i = 0; i < MOTHS; i++) {
        const o = M[i];
        o.a += dt * o.sp * (1 + swarm * 1.4 + scatter * 2);
        o.flap += dt * (28 + o.sp * 10);
        const r = o.r * (1 + scatter * 1.6) * lerp(1, 0.75, swarm) + Math.sin(tm * 1.7 + o.b) * 0.12;
        if (dead) { o.fall = Math.min(1, o.fall + dt * (0.8 + o.sp * 0.3)); }
        else o.fall = Math.max(0, o.fall - dt);
        const x = Math.cos(o.a) * r, z = Math.sin(o.a * 1.13 + o.b) * r;
        const y = lerp(cy + o.h + Math.sin(o.a * 2.3 + o.b) * 0.18, 0.03, smooth(o.fall));
        p.set(x, y, z);
        e.set(0, -o.a + (o.fall > 0.9 ? 0 : Math.sin(o.flap) * 0.2), 0);
        q.setFromEuler(e);
        const flap = o.fall > 0.95 ? 1 : Math.abs(Math.cos(o.flap));
        sc.set(0.25 + flap * 0.85, 1, 1);
        m4.compose(p, q, sc);
        inst.setMatrixAt(i, m4);
      }
      inst.instanceMatrix.needsUpdate = true;
    },
  };
}

// =====================================================================================================
// item models (drops)
// =====================================================================================================
export function createToothItem() {
  const g = new THREE.Group();
  const bone = lam('#f4eedc');
  mk(g, merged('bri_tooth', () => [xf(G.cone(0.035, 0.16, 5), [0, 0.02, 0], [PI, 0, 0.18]), xf(G.cyl(0.036, 0.03, 0.05, 5), [0.01, 0.12, 0])]), bone);
  mk(g, G.sph(1, 5, 4), lam('#5a1010'), [0.012, 0.155, 0], null, [0.04, 0.025, 0.035]);
  return g;
}
export function createPartyHatItem() {
  const g = new THREE.Group();
  mk(g, G.cone(0.12, 0.34, 8), lam('#ff4fa8', { map: hatTex() }), [0, 0.17, 0]);
  mk(g, G.ico(0.05, 0), lam('#fff6ea'), [0, 0.35, 0]);
  mk(g, G.tor(0.115, 0.02, 4, 10), lam('#fff6ea'), [0, 0.01, 0], [PI / 2, 0, 0]);
  return g;
}
export function createFingerItem() {
  const g = new THREE.Group();
  const skin = lam('#d6cfc0', { map: paleSkinTex() });
  mk(g, merged('bri_finger', () => [xf(G.cyl(0.018, 0.022, 0.12, 5), [0, 0.06, 0]), xf(G.cyl(0.016, 0.018, 0.1, 5), [0, 0.16, 0.012], [0.25, 0, 0]), xf(G.cyl(0.013, 0.015, 0.07, 5), [0, 0.24, 0.035], [0.5, 0, 0])]), skin);
  mk(g, G.box(0.02, 0.04, 0.012), lam('#15100c'), [0, 0.265, 0.056], [0.5, 0, 0]);
  return g;
}
export function createMothDustItem() {
  const g = new THREE.Group();
  mk(g, G.cyl(0.06, 0.06, 0.13, 8), lam('#b8d4d0', { transparent: true, opacity: 0.45 }), [0, 0.065, 0]);
  const dust = lam('#fff1b0'); dust.emissive = new THREE.Color('#7a6a20');
  mk(g, G.cyl(0.05, 0.05, 0.07, 8), dust, [0, 0.04, 0]);
  mk(g, G.cyl(0.064, 0.064, 0.025, 8), lam('#6a4a2a'), [0, 0.14, 0]);
  return g;
}

// ------------------------------------------------------------------ registry
const BUILDERS = { br_smiler: buildSmiler, br_hound: buildHound, br_partygoer: buildPartygoer, br_moth: buildMoth };
export const BR_MODEL_IDS = Object.keys(BUILDERS);

/** createBackroomsModel(id, { elite, seed }) -> model api (see header) */
export function createBackroomsModel(id, opts = {}) {
  const build = BUILDERS[id];
  if (!build) throw new Error('Unknown backrooms model: ' + id);
  const ctx = makeCtx(id, opts);
  return finish(ctx, build(ctx, opts));
}

/** registers creature + item models in the mod registries (window.__kefalMods); idempotent */
export function registerBackroomsModels() {
  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  if (!mm?.creatureModels) return false;
  for (const id of BR_MODEL_IDS) if (!mm.creatureModels.has(id)) mm.creatureModels.set(id, (_T, o) => createBackroomsModel(id, o || {}));
  if (mm.itemModels) {
    const items = { br_tooth: createToothItem, br_partyhat: createPartyHatItem, br_finger: createFingerItem, br_mothdust: createMothDustItem };
    for (const [id, fn] of Object.entries(items)) if (!mm.itemModels.has(id)) mm.itemModels.set(id, () => fn());
  }
  return true;
}
void HAS_DOM;
