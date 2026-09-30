// Boss visuals for the Sector Cycle (module 'cycle'): procedural models (plain three.js, no canvas) + the client UI layer
// (name card, HP bar with aux counters, ground telegraph rings, darkness overlay, shake). Host logic lives in cycle_bosses.js.
// Model API is the CreatureView one: { root, parts, height, radius, update(dt, {state, speed, t, time, progress}), setElite, setHitFlash, dispose }.
// `progress` = the creature `extra` flags: bit 1 engaged, 2 phase 2, 4 vulnerable / exposed, bits 3-6 aux alive, bits 7-10 aux total.
import * as THREE from 'three';
import { t, getLang } from '../core/i18n.js';
import { CREATURES } from './creatures.js';

export const F_ENGAGED = 1, F_P2 = 2, F_VULN = 4;
export const auxAlive = (x) => (x >> 3) & 15;
export const auxTotal = (x) => (x >> 7) & 15;
export const packFlags = (engaged, p2, vuln, alive, total) => (engaged ? 1 : 0) | (p2 ? 2 : 0) | (vuln ? 4 : 0) | ((Math.min(15, alive | 0)) << 3) | ((Math.min(15, total | 0)) << 7);

// ---------------------------------------------------------------- tiny model kit
class Kit {
  constructor() { this.root = new THREE.Group(); this.mats = []; this.geos = []; this.glow = []; }
  lam(color) { const m = new THREE.MeshLambertMaterial({ color }); m.userData.instance = true; this.mats.push(m); return m; }
  bas(color) { const m = new THREE.MeshBasicMaterial({ color }); m.userData.instance = true; this.glow.push(m); return m; }
  mesh(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    this.geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    (parent || this.root).add(m);
    return m;
  }
  box(parent, w, h, d, mat, x, y, z, rx, ry, rz) { return this.mesh(parent, new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz); }
  cyl(parent, rt, rb, h, mat, x, y, z, rx, ry, rz, seg = 8) { return this.mesh(parent, new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, rx, ry, rz); }
  sph(parent, r, mat, x, y, z, sx = 1, sy = 1, sz = 1, seg = 8) { const m = this.mesh(parent, new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), mat, x, y, z); m.scale.set(sx, sy, sz); return m; }
  pivot(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); (parent || this.root).add(g); return g; }
  flash(v) { for (const m of this.mats) { if (!m.emissive) continue; m.emissive.setRGB(v, v * 0.55, v * 0.4); } }
  dispose() { for (const g of this.geos) g.dispose(); for (const m of this.mats) m.dispose(); for (const m of this.glow) m.dispose(); this.geos.length = 0; this.mats.length = 0; this.glow.length = 0; }
}
const wrapModel = (k, base, extra = {}) => ({
  root: k.root, parts: extra.parts || {}, height: base.height, radius: base.radius,
  update: extra.update || (() => {}), setElite() {}, setHitFlash: (v) => k.flash(v), setTint() {}, dispose: () => k.dispose(),
});
const st = (a) => a?.state || 'idle';

// ---------------------------------------------------------------- THE LOAD BALANCER (server-rack colossus)
export function createLoadBalancerModel() {
  const k = new Kit();
  const dark = k.lam('#2a2f37'), mid = k.lam('#414852'), cable = k.lam('#15181c'), metal = k.lam('#68707c');
  const ledG = k.bas('#3dff7a'), ledR = k.bas('#ff3b2a'), ledY = k.bas('#ffcf3a');
  const body = k.pivot(null, 0, 0, 0);
  k.box(body, 2.1, 0.5, 1.6, dark, 0, 0.25, 0);
  const rack = k.box(body, 1.9, 3.0, 1.35, mid, 0, 2.0, 0);
  k.box(body, 1.7, 2.7, 0.06, dark, 0, 2.0, 0.7);
  const leds = [];
  for (let i = 0; i < 8; i++) {
    const m = k.bas(i % 3 === 0 ? '#ff3b2a' : '#3dff7a');
    leds.push({ m, mesh: k.box(body, 1.3, 0.09, 0.05, m, 0, 0.95 + i * 0.32, 0.75), ph: i * 0.7 });
  }
  const fan = k.pivot(body, 0, 2.3, 0.75);
  k.cyl(fan, 0.5, 0.5, 0.06, metal, 0, 0, 0, Math.PI / 2, 0, 0, 12);
  for (let i = 0; i < 4; i++) k.box(fan, 0.85, 0.09, 0.03, dark, 0, 0, 0.04, 0, 0, i * Math.PI / 4);
  const head = k.pivot(body, 0, 3.75, 0);
  k.box(head, 1.0, 1.1, 0.7, dark, 0, 0, 0);
  const lamp = [ledR, ledY, ledG].map((m, i) => k.mesh(head, new THREE.CircleGeometry(0.17, 10), m, 0, 0.32 - i * 0.32, 0.36));
  const arms = [-1, 0, 1].map((s, i) => {
    const p = k.pivot(body, s * 1.15, 3.0, s === 0 ? -0.6 : 0);
    k.cyl(p, 0.11, 0.11, 1.9, cable, 0, -0.9, 0, 0, 0, 0, 6);
    k.box(p, 0.34, 0.3, 0.34, metal, 0, -1.9, 0);
    return { p, s, i };
  });
  const api = wrapModel(k, { height: 4.6, radius: 1.4 }, {
    parts: { head },
    update(dt, a) {
      const time = a?.time || 0, s = st(a), prog = a?.progress | 0;
      const engaged = prog & F_ENGAGED, p2 = prog & F_P2, vuln = prog & F_VULN;
      fan.rotation.z += dt * (engaged ? 6 : 1.5);
      leds.forEach((l, i) => { const on = vuln ? Math.sin(time * 9 + l.ph) > 0.85 : Math.sin(time * (engaged ? 7 : 2) + l.ph) > -0.3; l.mesh.visible = on; l.m.color.set(p2 ? '#ff3b2a' : i % 3 === 0 ? '#ff3b2a' : '#3dff7a'); });
      const cast = s === 'windup', slam = s === 'slam';
      arms.forEach(({ p, s: sd, i }) => { p.rotation.z = (cast ? -0.9 * (sd || 1) : 0.15 * (sd || 1)) + Math.sin(time * 1.6 + i) * 0.08; p.rotation.x = slam ? 0.7 : Math.sin(time * 1.1 + i) * 0.1; });
      const phase = cast ? 0 : vuln ? 2 : engaged ? 1 : 2;   // red while casting, green idle, yellow when a node dropped
      lamp.forEach((m, i) => { m.visible = i === phase || (p2 && Math.sin(time * 12) > 0); });
      head.rotation.y = Math.sin(time * 0.7) * 0.4 * (engaged ? 0.4 : 1);
      body.position.y = s === 'dead' ? -0.4 : 0;
      body.rotation.z = s === 'dead' ? 0.25 : 0;
      void rack;
    },
  });
  return api;
}

// ---------------------------------------------------------------- server node (Load Balancer add)
export function createNodeModel() {
  const k = new Kit();
  const dark = k.lam('#252a31'), mid = k.lam('#3a414b'), led = k.bas('#ff3b2a'), ok = k.bas('#3dff7a');
  k.box(null, 0.95, 1.9, 0.8, mid, 0, 0.95, 0);
  k.box(null, 0.8, 0.12, 0.05, dark, 0, 1.55, 0.42); k.box(null, 0.8, 0.12, 0.05, dark, 0, 1.2, 0.42); k.box(null, 0.8, 0.12, 0.05, dark, 0, 0.85, 0.42);
  const l1 = k.box(null, 0.5, 0.07, 0.03, led, 0, 1.55, 0.45), l2 = k.box(null, 0.5, 0.07, 0.03, ok, 0, 1.2, 0.45);
  return wrapModel(k, { height: 1.9, radius: 0.6 }, { update(dt, a) { const time = a?.time || 0; const dead = st(a) === 'dead'; l1.visible = !dead && Math.sin(time * 6) > -0.2; l2.visible = !dead && Math.sin(time * 3) > 0; k.root.rotation.z = dead ? 0.5 : 0; } });
}

// ---------------------------------------------------------------- MIDDLE MANAGER
export function createManagerModel() {
  const k = new Kit();
  const suit = k.lam('#454e63'), pants = k.lam('#2f3645'), shirt = k.lam('#d8d8d0'), tie = k.lam('#b3242c'), skin = k.lam('#e0c0a4'), mask = k.lam('#f2efe6'), dark = k.lam('#1a1a1a'), brown = k.lam('#5a3a22');
  const eyeG = k.bas('#ffe28a');
  const hips = k.pivot(null, 0, 1.25, 0);
  const legs = [-1, 1].map((s) => { const p = k.pivot(hips, s * 0.24, 0, 0); k.box(p, 0.28, 1.2, 0.3, pants, 0, -0.6, 0); k.box(p, 0.32, 0.14, 0.5, dark, 0, -1.22, 0.08); return p; });
  const torso = k.pivot(hips, 0, 0.1, 0);
  k.box(torso, 1.0, 1.2, 0.55, suit, 0, 0.6, 0);
  k.box(torso, 0.34, 0.9, 0.05, shirt, 0, 0.7, 0.29);
  const tieM = k.box(torso, 0.2, 1.15, 0.06, tie, 0, 0.35, 0.33); tieM.scale.set(1, 1, 1);
  k.box(torso, 0.06, 0.06, 0.02, dark, -0.34, 0.95, 0.29);
  const arms = [-1, 1].map((s) => { const p = k.pivot(torso, s * 0.66, 1.05, 0); k.box(p, 0.24, 1.05, 0.26, suit, 0, -0.5, 0); k.box(p, 0.22, 0.22, 0.24, skin, 0, -1.12, 0); return p; });
  const case_ = k.box(arms[1], 0.2, 0.5, 0.7, brown, 0.1, -1.4, 0.1);
  const head = k.pivot(torso, 0, 1.45, 0);
  k.sph(head, 0.34, skin, 0, 0.1, 0, 1, 1.1, 0.95);
  k.box(head, 0.56, 0.62, 0.06, mask, 0, 0.12, 0.32);
  k.box(head, 0.32, 0.05, 0.02, dark, 0, -0.06, 0.36); k.box(head, 0.05, 0.1, 0.02, dark, 0.17, -0.02, 0.36); k.box(head, 0.05, 0.1, 0.02, dark, -0.17, -0.02, 0.36);
  k.box(head, 0.1, 0.05, 0.02, eyeG, 0.12, 0.2, 0.36); k.box(head, 0.1, 0.05, 0.02, eyeG, -0.12, 0.2, 0.36);
  k.box(head, 0.6, 0.06, 0.4, dark, 0, 0.42, 0.02);   // comb-over
  return wrapModel(k, { height: 2.8, radius: 0.7 }, {
    parts: { head },
    update(dt, a) {
      const time = a?.time || 0, s = st(a), prog = a?.progress | 0;
      const walking = s === 'run' || s === 'walk';
      const w = walking ? Math.sin(time * (s === 'run' ? 8 : 5)) : 0;
      legs[0].rotation.x = w * 0.6; legs[1].rotation.x = -w * 0.6;
      arms[0].rotation.x = -w * 0.5; arms[1].rotation.x = w * 0.3;
      if (s === 'roar') { arms[0].rotation.z = 1.9; arms[1].rotation.z = -1.9; arms[0].rotation.x = 0; head.rotation.x = -0.3; } else if (s === 'windup') { arms[1].rotation.x = -2.0; arms[0].rotation.z = 0; head.rotation.x = 0.2; } else if (s === 'slam') { arms[1].rotation.x = 0.8; head.rotation.x = 0.3; } else { arms[0].rotation.z = 0; arms[1].rotation.z = 0; head.rotation.x = 0; }
      tieM.scale.y = 1 + (prog & F_VULN ? 0.15 * Math.sin(time * 14) : 0);
      hips.position.y = 1.25 + Math.abs(w) * 0.05;
      hips.rotation.x = s === 'dead' ? -1.3 : 0;
      void case_;
    },
  });
}

// ---------------------------------------------------------------- paper shield sheet (Middle Manager add)
export function createPaperModel() {
  const k = new Kit();
  const paper = k.lam('#f4f1e6'), ink = k.lam('#3a3a3a');
  const sheet = k.pivot(null, 0, 1.3, 0);
  k.box(sheet, 0.7, 0.9, 0.04, paper, 0, 0, 0);
  for (let i = 0; i < 4; i++) k.box(sheet, 0.5, 0.04, 0.05, ink, 0, 0.3 - i * 0.18, 0.01);
  return wrapModel(k, { height: 1.8, radius: 0.45 }, { update(dt, a) { const time = a?.time || 0; sheet.rotation.y = time * 1.6; sheet.rotation.z = Math.sin(time * 3) * 0.12; sheet.position.y = 1.3 + Math.sin(time * 2.2) * 0.08; } });
}

// ---------------------------------------------------------------- COMMENT SECTION HYDRA (root mass + heads)
export function createHydraModel() {
  const k = new Kit();
  const flesh = k.lam('#4d6b45'), dark = k.lam('#25341f'), vein = k.lam('#7a4a55');
  const core = k.bas('#ff8a2a'), coreOff = k.bas('#6a3a1a');
  const mound = k.sph(null, 1.9, flesh, 0, 0.8, 0, 1, 0.55, 1, 9);
  const stumps = [0, 1, 2, 3].map((i) => { const a = i * Math.PI / 2 + 0.4; const p = k.pivot(null, Math.cos(a) * 1.15, 0.9, Math.sin(a) * 1.15); k.cyl(p, 0.22, 0.34, 0.7, dark, 0, 0.3, 0, 0.2 * Math.cos(a), 0, 0.2 * Math.sin(a), 7); return p; });
  const rootBulb = k.sph(null, 0.5, core, 0, 1.55, 0, 1, 1, 1, 8);
  const bulbOff = k.sph(null, 0.5, coreOff, 0, 1.55, 0, 1, 1, 1, 8);
  for (let i = 0; i < 7; i++) { const a = i * 0.9; k.box(null, 0.12, 0.05, 1.3, vein, Math.cos(a) * 1.4, 0.35, Math.sin(a) * 1.4, 0, -a, 0); }
  return wrapModel(k, { height: 3.0, radius: 2.0 }, {
    update(dt, a) {
      const time = a?.time || 0, prog = a?.progress | 0, vuln = !!(prog & F_VULN);
      rootBulb.visible = vuln; bulbOff.visible = !vuln;
      rootBulb.scale.setScalar(1 + Math.sin(time * 9) * 0.12);
      mound.scale.set(1 + Math.sin(time * 1.3) * 0.03, 0.55 + Math.sin(time * 1.9) * 0.03, 1);
      stumps.forEach((p, i) => { p.rotation.z = Math.sin(time * 1.5 + i) * 0.1; });
      k.root.rotation.z = st(a) === 'dead' ? 0.4 : 0;
    },
  });
}
export function createHydraHeadModel() {
  const k = new Kit();
  const flesh = k.lam('#55764c'), belly = k.lam('#a9c48a'), dark = k.lam('#1d2a19'), eye = k.bas('#ffe35a'), bubble = k.lam('#f2f2f2'), ink = k.lam('#222');
  const neck = k.pivot(null, 0, 0, 0);
  k.cyl(neck, 0.34, 0.46, 1.0, flesh, 0, 0.5, 0, 0, 0, 0, 7);
  const n2 = k.pivot(neck, 0, 1.0, 0.05); n2.rotation.x = 0.35;
  k.cyl(n2, 0.28, 0.34, 0.9, flesh, 0, 0.45, 0, 0, 0, 0, 7);
  const head = k.pivot(n2, 0, 0.95, 0.1);
  k.box(head, 0.7, 0.5, 0.9, flesh, 0, 0.05, 0.2);
  const jaw = k.pivot(head, 0, -0.18, 0.1);
  k.box(jaw, 0.62, 0.14, 0.75, belly, 0, 0, 0.3);
  k.box(head, 0.1, 0.12, 0.08, eye, 0.22, 0.25, 0.5); k.box(head, 0.1, 0.12, 0.08, eye, -0.22, 0.25, 0.5);
  k.box(head, 0.5, 0.06, 0.03, dark, 0, -0.02, 0.66);
  const talk = k.pivot(head, 0.55, 0.65, 0.2);
  k.box(talk, 0.6, 0.4, 0.04, bubble, 0, 0, 0); k.box(talk, 0.34, 0.05, 0.05, ink, 0, 0.06, 0.01); k.box(talk, 0.24, 0.05, 0.05, ink, -0.05, -0.06, 0.01);
  return wrapModel(k, { height: 2.7, radius: 0.7 }, {
    parts: { head },
    update(dt, a) {
      const time = a?.time || 0, s = st(a);
      const atk = s === 'attack';
      jaw.rotation.x = atk ? 0.7 : Math.sin(time * 2.4) * 0.1;
      neck.rotation.x = atk ? 0.6 : Math.sin(time * 1.4) * 0.15;
      neck.rotation.z = Math.sin(time * 0.9) * 0.2;
      talk.rotation.y = time * 0.8;
      k.root.scale.y = s === 'dead' ? 0.3 : 1;
    },
  });
}
export function createReplyModel() {
  const k = new Kit();
  const bubble = k.lam('#e8f0ff'), ink = k.lam('#2a3550'), leg = k.lam('#3a3a3a');
  const b = k.pivot(null, 0, 0.55, 0);
  k.box(b, 0.5, 0.36, 0.14, bubble, 0, 0, 0); k.box(b, 0.14, 0.14, 0.14, bubble, -0.12, -0.24, 0);
  k.box(b, 0.3, 0.04, 0.16, ink, 0, 0.05, 0.01); k.box(b, 0.2, 0.04, 0.16, ink, -0.04, -0.05, 0.01);
  const l1 = k.box(null, 0.06, 0.3, 0.06, leg, 0.1, 0.15, 0), l2 = k.box(null, 0.06, 0.3, 0.06, leg, -0.1, 0.15, 0);
  return wrapModel(k, { height: 0.9, radius: 0.35 }, { update(dt, a) { const time = a?.time || 0, w = Math.sin(time * 16) * 0.5; l1.rotation.x = w; l2.rotation.x = -w; b.position.y = 0.55 + Math.abs(w) * 0.05; k.root.rotation.z = st(a) === 'dead' ? 1.4 : 0; } });
}

/** an existing creature model scaled up (generic bosses): the hit box grows with it */
export function scaledModel(baseId, scale, opts = {}) {
  const make = (typeof window !== 'undefined' && window.KefalAPI?.createCreatureModel) || null;
  if (!make) throw new Error('no creature model factory');
  const m = make(baseId, opts);
  m.root.scale.multiplyScalar(scale);
  m.height = (m.height || 1.8) * scale;
  m.radius = (m.radius || 0.5) * scale;
  return m;
}

// ---------------------------------------------------------------- client UI layer
const STYLE_ID = 'cy-boss-style';
const CSS = `
.cy-bar{position:absolute;top:62px;left:50%;transform:translateX(-50%);width:min(620px,66vw);text-align:center;pointer-events:none;z-index:9;transition:opacity .35s;opacity:1;font-family:var(--font2,monospace)}
.cy-bar.cy-off{opacity:0}
.cy-name{font-size:14px;color:#ffe3b0;letter-spacing:2px;text-shadow:0 0 8px rgba(255,140,40,.7),2px 2px 0 #000;margin-bottom:5px;white-space:nowrap}
.cy-rank{display:inline-block;margin-left:8px;padding:0 6px;border:1px solid #ffb35a;color:#ffb35a;font-size:11px}
.cy-p2{display:none;margin-left:8px;color:#ff5a3a;animation:cyBlink .7s infinite}
.cy-bar.p2 .cy-p2{display:inline}
.cy-track{position:relative;height:14px;border:2px solid #8c4a22;background:rgba(18,8,4,.85);box-shadow:0 0 12px rgba(255,90,20,.3);overflow:hidden}
.cy-fill,.cy-chip{position:absolute;left:0;top:0;bottom:0;width:100%;transform-origin:0 50%}
.cy-chip{background:#ffe2b0;opacity:.8}
.cy-fill{background:linear-gradient(#ff8a2a,#a3300a)}
.cy-bar.vuln .cy-fill{background:linear-gradient(#5fe0ff,#1a6f9a)}
.cy-bar.p2 .cy-fill{background:linear-gradient(#ff3a2a,#600000)}
.cy-mark{position:absolute;left:50%;top:0;bottom:0;width:2px;background:#fff;opacity:.4}
.cy-aux{font-size:12px;color:#cfe;letter-spacing:1px;margin-top:4px;text-shadow:1px 1px 0 #000}
.cy-card{position:absolute;left:50%;top:26%;transform:translateX(-50%);text-align:center;pointer-events:none;z-index:12;opacity:0;font-family:var(--font2,monospace);white-space:nowrap}
.cy-card.on{animation:cyCard 3.4s ease-out forwards}
.cy-card-name{font-size:34px;color:#fff;letter-spacing:6px;text-shadow:0 0 14px #ff5a1a,3px 3px 0 #000}
.cy-card-title{font-size:15px;color:#ffcf9a;letter-spacing:4px;margin-top:6px;text-shadow:2px 2px 0 #000}
.cy-card-intro{font-size:13px;color:#e8d6c0;letter-spacing:1px;margin-top:6px;font-style:italic;text-shadow:2px 2px 0 #000}
.cy-card-intro:empty{display:none}
.cy-card-rank{display:inline-block;margin-top:8px;padding:1px 12px;border:2px solid #ff8a3a;color:#ff8a3a;font-size:16px;letter-spacing:3px}
.cy-dark{position:absolute;inset:0;background:radial-gradient(circle,rgba(0,0,0,.35),rgba(0,0,0,.97));pointer-events:none;z-index:8;opacity:0;transition:opacity .25s}
.cy-strip{position:absolute;left:50%;bottom:118px;transform:translateX(-50%);pointer-events:none;z-index:9;font-family:var(--font2,monospace);font-size:13px;letter-spacing:2px;color:#ffe3b0;text-shadow:1px 1px 0 #000;text-align:center}
@keyframes cyCard{0%{opacity:0;transform:translateX(-50%) scale(1.25)}12%{opacity:1;transform:translateX(-50%) scale(1)}80%{opacity:1}100%{opacity:0}}
@keyframes cyBlink{50%{opacity:.35}}
`;

export function createBossUi(game, bossInfo) {
  const offs = [];
  let disposed = false, bar = null, card = null, dark = null, styleEl = null;
  const rings = [];      // { mesh, t, life }
  let ringGeo = null;
  let chip = 1, chipHold = 0, lastId = null, darkT = 0;
  const ui = () => document.getElementById('ui');
  function ensure() {
    if (bar || typeof document === 'undefined' || !ui()) return;
    if (!document.getElementById(STYLE_ID)) { styleEl = document.createElement('style'); styleEl.id = STYLE_ID; styleEl.textContent = CSS; document.head.appendChild(styleEl); }
    bar = document.createElement('div'); bar.className = 'cy-bar cy-off';
    bar.innerHTML = '<div class="cy-name"><span class="cy-n"></span><span class="cy-rank"></span><span class="cy-p2"></span></div><div class="cy-track"><div class="cy-chip"></div><div class="cy-fill"></div><div class="cy-mark"></div></div><div class="cy-aux"></div>';
    ui().appendChild(bar);
    card = document.createElement('div'); card.className = 'cy-card';
    card.innerHTML = '<div class="cy-card-name"></div><div class="cy-card-title"></div><div class="cy-card-intro"></div><div class="cy-card-rank"></div>';
    ui().appendChild(card);
    dark = document.createElement('div'); dark.className = 'cy-dark'; ui().appendChild(dark);
  }
  const q = (el, s) => el.querySelector(s);
  function showCard(ty) {
    ensure(); if (!card) return;
    const info = bossInfo(ty), def = CREATURES[ty];
    if (!info || !def) return;
    const th = game.bossDress?.infoOf?.(ty);   // wave 8 night: themed boss name / title / intro (bossdress.js)
    q(card, '.cy-card-name').textContent = String(th ? th.name : def.name).toLocaleUpperCase(getLang());
    q(card, '.cy-card-title').textContent = th ? th.title : t(info.title);
    q(card, '.cy-card-intro').textContent = th ? th.intro : '';
    q(card, '.cy-card-rank').textContent = t('RANK') + ' ' + info.rank;
    card.classList.remove('on'); void card.offsetWidth; card.classList.add('on');
    try { game.audio?.play?.('ship_alarm', { volume: 0.5, bus: 'sfx' }); } catch { /* ignore */ }
    game.engine?.shake?.(0.5);
  }
  function addRing(p, r, life, col = 0xff5a2a) {
    if (!p || !Number.isFinite(p[0]) || !game.scene) return;
    ringGeo = ringGeo || new THREE.RingGeometry(0.86, 1, 40);
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.add(fill);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p[0], (p[1] || 0) + 0.08, p[2]);
    mesh.scale.set(r, r, 1);
    mesh.renderOrder = 3;
    game.scene.add(mesh);
    rings.push({ mesh, t: life, life });
    while (rings.length > 14) dropRing(0);
  }
  function dropRing(i) { const r = rings[i]; if (!r) return; r.mesh.removeFromParent(); r.mesh.material.dispose(); r.mesh.children[0]?.geometry?.dispose(); r.mesh.children[0]?.material?.dispose(); rings.splice(i, 1); }
  function onMsg(m, from) {
    if (disposed || !m || (from !== game.selfId && from !== game.net?.hostId)) return;
    if (m.k === 'card') showCard(m.ty);
    else if (m.k === 'ring') addRing(m.p, Math.max(0.5, Math.min(40, +m.r || 3)), Math.max(0.2, Math.min(20, +m.t || 1)), m.c);
    else if (m.k === 'dark') { darkT = Math.max(darkT, Math.min(8, +m.t || 3)); }
    else if (m.k === 'shake') game.engine?.shake?.(Math.max(0, Math.min(1.5, +m.a || 0.4)));
  }
  function update(dt) {
    if (disposed) return;
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t -= dt;
      if (r.t <= 0) { dropRing(i); continue; }
      const k = 1 - r.t / r.life;
      r.mesh.material.opacity = 0.25 + 0.5 * Math.abs(Math.sin(k * 14)) * (0.4 + k);
    }
    if (darkT > 0) { darkT -= dt; ensure(); if (dark) dark.style.opacity = darkT > 0.4 ? '1' : '0'; } else if (dark && dark.style.opacity !== '0') dark.style.opacity = '0';
    // one bar: the nearest engaged boss view (or the one that just died)
    let bv = null, bd = 1e9;
    const cam = game.camera?.position;
    for (const v of game.creatures?.views?.values?.() || []) {
      if (!v.def?.cyBoss || !cam) continue;
      const on = ((v.extra | 0) & F_ENGAGED) || v.state === 'dead';
      if (!on) continue;
      const d = v.pos.distanceTo(cam);
      if (d < bd && d < 110) { bd = d; bv = v; }
    }
    if (!bv) { if (bar) bar.classList.add('cy-off'); lastId = null; return; }
    ensure(); if (!bar) return;
    if (bv.id !== lastId) { lastId = bv.id; chip = 1; chipHold = 0; q(bar, '.cy-n').textContent = String(game.bossDress?.nameOf?.(bv.type) || bv.def.name).toLocaleUpperCase(getLang()); const info = bossInfo(bv.type); q(bar, '.cy-rank').textContent = info ? info.rank : ''; q(bar, '.cy-p2').textContent = t('PHASE 2'); }
    const f = bv.maxHp ? Math.max(0, Math.min(1, bv.hp / bv.maxHp)) : 0;
    if (f >= chip) chip = f; else { chipHold += dt; if (chipHold > 0.5) chip = Math.max(f, chip - dt * 0.45); }
    if (f < chip - 0.001 && chipHold === 0) chipHold = 0.0001;
    if (f >= chip - 0.001) chipHold = 0;
    q(bar, '.cy-fill').style.transform = `scaleX(${f.toFixed(3)})`;
    q(bar, '.cy-chip').style.transform = `scaleX(${chip.toFixed(3)})`;
    const x = bv.extra | 0;
    bar.classList.toggle('p2', !!(x & F_P2));
    bar.classList.toggle('vuln', !!(x & F_VULN));
    bar.classList.remove('cy-off');
    const info = bossInfo(bv.type);
    const total = auxTotal(x), alive = auxAlive(x);
    q(bar, '.cy-aux').textContent = bv.state === 'dead' ? t('DEFEATED') : info?.aux ? `${t(info.aux)} ${alive}/${total}${x & F_VULN ? '  -  ' + t(info.vuln || 'VULNERABLE') : ''}` : (x & F_VULN ? t(info?.vuln || 'VULNERABLE') : '');
  }
  function bindNet(net) { if (net) { net.off?.('msg:cyx', onMsg); net.on('msg:cyx', onMsg); } }
  return {
    update, bindNet, onMsg, addRing, showCard,
    dispose() {
      disposed = true;
      for (let i = rings.length - 1; i >= 0; i--) dropRing(i);
      ringGeo?.dispose(); ringGeo = null;
      bar?.remove(); card?.remove(); dark?.remove(); styleEl?.remove(); bar = card = dark = styleEl = null;
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
    },
  };
}
