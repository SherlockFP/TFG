// Ship fault stations (wave 2, gameplay2 / shipfaults.js): small wall-mounted repair panels for the pre-flight faults.
// createFaultStation(kind) -> { root, update(dt, time, s), dispose() }, s = { active, done, hits, need, code, text, prog }.
// Local +z is the front (into the ship), the plate's back is at z = 0. All gadgets use unlit / basic-ish materials so they read in
// the ship's dim light. No lights are created here (the scene's light count never changes): the alarm strobe is an emissive lamp.
import * as THREE from 'three';
import { G, lam, basI, mk, pv } from './modelkit.js';

export const PANEL = { w: 0.9, h: 1.05, d: 0.32 };   // footprint used for the free-spot search
const HAS_DOM = typeof document !== 'undefined';

function labelTex(w = 128, h = 80) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  return { c, tex, ctx: c.getContext('2d') };
}
function txt(ctx, s, x, y, size, color, align = 'center') {
  ctx.font = `${size}px VT323, monospace`; ctx.textAlign = align; ctx.fillStyle = color; ctx.fillText(s, x, y);
}

export const KIND_TITLE = { fuel: 'FUEL LINE', nav: 'NAV CONSOLE', navd: 'NAV DISPLAY', coolant: 'COOLANT', hull: 'HULL BREACH', relay: 'POWER RELAY', jam: 'THRUSTER' };

export function createFaultStation(kind) {
  const root = new THREE.Group();
  root.name = 'g2fault_' + kind;
  const plate = lam('#22292f'), stripeY = lam('#c9a227'), steel = lam('#7d868d'), dark = lam('#101417');
  const lampM = basI('#ff2a2a'); lampM.userData.noTint = true;
  const geos = [], mats = [lampM];
  mk(root, G.box(PANEL.w, PANEL.h, 0.1), plate, [0, 0, 0.05]);
  for (const [x, y, w, h] of [[0, PANEL.h / 2 - 0.02, PANEL.w, 0.04], [0, -PANEL.h / 2 + 0.02, PANEL.w, 0.04], [-PANEL.w / 2 + 0.02, 0, 0.04, PANEL.h], [PANEL.w / 2 - 0.02, 0, 0.04, PANEL.h]]) mk(root, G.box(w, h, 0.12), stripeY, [x, y, 0.06]);
  const lamp = mk(root, G.cyl(0.055, 0.06, 0.05, 10), lampM, [0.34, 0.4, 0.12], [Math.PI / 2, 0, 0]);
  let scr = null;
  if (HAS_DOM) {
    scr = labelTex(128, 80);
    const sm = new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false });
    const sg = new THREE.PlaneGeometry(0.72, 0.45);
    mk(root, sg, sm, [-0.04, 0.2, 0.106]);
    mats.push(sm); geos.push(sg);
  }
  const anim = { spin: null, shake: null, leak: null, sparks: null, needleWob: 0 };
  const add = (g, m, p, r) => mk(root, g, m, p, r);
  // ---------------------------------------------------------------- gadgets
  if (kind === 'fuel') {
    add(G.cyl(0.06, 0.06, 0.86, 8), lam('#b5651d'), [0, -0.27, 0.2], [0, 0, Math.PI / 2]);
    const wheel = pv(root, [0, -0.27, 0.32]);
    mk(wheel, G.tor(0.15, 0.022, 4, 12), lam('#d33'), [0, 0, 0]);
    for (let i = 0; i < 3; i++) mk(wheel, G.box(0.3, 0.022, 0.022), lam('#d33'), [0, 0, 0], [0, 0, i * Math.PI / 3]);
    mk(root, G.cyl(0.02, 0.02, 0.14, 6), steel, [0, -0.27, 0.25], [Math.PI / 2, 0, 0]);
    anim.spin = wheel;
    const leak = pv(root, [0.3, -0.24, 0.3]);
    const lm = new THREE.MeshBasicMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.55, depthWrite: false }); mats.push(lm);
    const puffs = [0, 1, 2].map((i) => { const m = mk(leak, G.sph(0.06, 6, 4), lm, [0, i * 0.12, 0]); return m; });
    anim.leak = { g: leak, puffs };
  } else if (kind === 'coolant') {
    for (const x of [-0.34, 0.34]) add(G.cyl(0.05, 0.05, 0.7, 8), lam('#3f7fbf'), [x, -0.12, 0.16]);
    add(G.box(0.5, 0.1, 0.06), dark, [0, -0.38, 0.13]);
  } else if (kind === 'nav') {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) add(G.box(0.13, 0.1, 0.04), lam('#3a4650'), [-0.2 + c * 0.17, -0.12 - r * 0.14, 0.13]);
    add(G.box(0.72, 0.03, 0.1), dark, [0, -0.5 + 0.05, 0.14]);
  } else if (kind === 'navd') {
    add(G.box(0.3, 0.06, 0.16), dark, [0, -0.3, 0.16]);
    add(G.box(0.05, 0.28, 0.05), steel, [0, -0.18, 0.12]);
  } else if (kind === 'hull') {
    const glow = new THREE.MeshBasicMaterial({ color: '#ff7a1a' }); mats.push(glow);
    add(G.box(0.34, 0.5, 0.02), glow, [0, -0.2, 0.108]);
    const jag = lam('#0b0b0c');
    let y = -0.42;
    for (let i = 0; i < 6; i++) { add(G.box(0.16, 0.12, 0.05), jag, [(i % 2 ? 1 : -1) * 0.07, y, 0.13], [0, 0, (i % 2 ? 0.5 : -0.5)]); y += 0.09; }
    anim.patch = mk(root, G.box(0.46, 0.6, 0.04), steel, [0, -0.2, 0.15]); anim.patch.visible = false;
    for (const [x, yy] of [[-0.18, -0.45], [0.18, -0.45], [-0.18, 0.05], [0.18, 0.05]]) mk(anim.patch, G.cyl(0.02, 0.02, 0.03, 6), dark, [x, yy + 0.2, 0.025], [Math.PI / 2, 0, 0]);
  } else if (kind === 'relay') {
    add(G.box(0.62, 0.5, 0.12), lam('#4c565e'), [0, -0.2, 0.14]);
    add(G.box(0.54, 0.42, 0.02), dark, [0, -0.2, 0.205]);
    const cols = ['#e33', '#39f', '#fd3', '#3d5'];
    anim.sparks = mk(root, G.sph(0.03, 5, 4), basI('#fff5b0'), [0.12, -0.05, 0.26]);
    cols.forEach((c, i) => { const w = mk(root, G.cyl(0.012, 0.012, 0.3, 4), lam(c), [-0.18 + i * 0.12, -0.27, 0.23], [0.2 * (i % 2 ? 1 : -1), 0, 0.15 * (i - 1.5)]); w.userData.w = i; });
  } else if (kind === 'jam') {
    add(G.cyl(0.17, 0.17, 0.84, 10), lam('#5a636b'), [0, -0.18, 0.2], [0, 0, Math.PI / 2]);
    for (const x of [-0.3, 0.3]) add(G.cyl(0.18, 0.18, 0.06, 10), stripeY, [x, -0.18, 0.2], [0, 0, Math.PI / 2]);
    anim.shake = mk(root, G.sph(0.14, 7, 5), lam('#b3541e'), [0, -0.02, 0.3]);   // the wedged lump
  }
  // ---------------------------------------------------------------- state -> visuals
  let lastKey = '', t = 0;
  function draw(s, time) {
    if (!scr) return;
    const { ctx } = scr;
    const ok = !!s.done;
    ctx.fillStyle = ok ? '#06240f' : '#180606'; ctx.fillRect(0, 0, 128, 80);
    ctx.strokeStyle = ok ? '#39ff6a' : '#ff4a3a'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, 124, 76);
    const col = ok ? '#7dff9a' : Math.sin(time * 9) > 0 ? '#ff6a5a' : '#ffb0a0';
    txt(ctx, KIND_TITLE[kind] || kind.toUpperCase(), 64, 18, 22, col);
    if (kind === 'coolant' && !ok) {
      // static dial: red / green zones and a jittering needle (the live game is the minigame)
      ctx.lineWidth = 6; ctx.strokeStyle = '#3a3f45'; ctx.beginPath(); ctx.arc(64, 68, 32, Math.PI, 2 * Math.PI); ctx.stroke();
      ctx.strokeStyle = '#2fbf5a'; ctx.beginPath(); ctx.arc(64, 68, 32, Math.PI * 1.38, Math.PI * 1.62); ctx.stroke();
      ctx.strokeStyle = '#d33'; ctx.beginPath(); ctx.arc(64, 68, 32, Math.PI * 1.82, 2 * Math.PI); ctx.stroke();
      const a = Math.PI * (1.02 + 0.9 * (0.72 + Math.sin(time * 3.1) * 0.12 + Math.sin(time * 7.3) * 0.05));
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(64, 68); ctx.lineTo(64 + Math.cos(a) * 30, 68 + Math.sin(a) * 30); ctx.stroke();
      txt(ctx, 'OVERHEAT', 64, 40, 18, '#ffb0a0');
    } else if (kind === 'navd') {
      txt(ctx, ok ? 'REBOOTED' : 'REBOOT KEY', 64, 38, 18, ok ? '#7dff9a' : '#ffd9b8');
      txt(ctx, ok ? 'OK' : String(s.code || '-----').split('').join(' '), 64, 68, ok ? 34 : 38, ok ? '#7dff9a' : '#ffe08a');
    } else if (kind === 'nav') {
      txt(ctx, ok ? 'ONLINE' : 'TYPE CODE', 64, 44, 24, ok ? '#7dff9a' : '#ffd9b8');
      txt(ctx, ok ? '' : 'FROM NAV DISPLAY', 64, 66, 17, '#9fd4ff');
    } else if (kind === 'jam') {
      txt(ctx, ok ? 'CLEAR' : 'JAMMED', 64, 46, 26, ok ? '#7dff9a' : '#ffd9b8');
      const n = s.need || 3, h = s.hits || 0;
      for (let i = 0; i < n; i++) { ctx.fillStyle = i < h ? '#7dff9a' : '#553'; ctx.fillRect(38 + i * 20, 58, 14, 9); }
    } else {
      const line2 = { fuel: ok ? 'SEALED' : 'PRESSURE LOSS', hull: ok ? 'PATCHED' : 'DEPRESSURISING', relay: ok ? 'LINKED' : 'NO POWER', coolant: ok ? 'STABLE' : '' }[kind] || (ok ? 'OK' : 'FAULT');
      txt(ctx, line2, 64, 48, 24, ok ? '#7dff9a' : '#ffd9b8');
      if (!ok && s.prog > 0.01) { ctx.fillStyle = '#39ff6a'; ctx.fillRect(14, 60, 100 * Math.min(1, s.prog), 8); ctx.strokeStyle = '#39ff6a'; ctx.strokeRect(13, 59, 102, 10); }
    }
    scr.tex.needsUpdate = true;
  }
  function update(dt, time, s = {}) {
    t += dt;
    const ok = !!s.done;
    lampM.color.set(ok ? '#2aff6a' : Math.sin(time * 8) > 0 ? '#ff2a2a' : '#4a0808');
    if (anim.spin) anim.spin.rotation.z += dt * (ok ? 0 : 1.2) + (s.prog || 0) * dt * 3;
    if (anim.leak) { anim.leak.g.visible = !ok; anim.leak.puffs.forEach((p, i) => { const k = (t * 0.9 + i / 3) % 1; p.position.y = k * 0.4; p.scale.setScalar(0.5 + k * 1.4); }); }
    if (anim.patch) anim.patch.visible = ok;
    if (anim.shake) { anim.shake.visible = !ok; anim.shake.position.x = (s.hitT > 0 ? Math.sin(time * 90) * 0.03 * s.hitT : 0); }
    if (anim.sparks) anim.sparks.visible = !ok && Math.sin(time * 23) > 0.2;
    const key = `${ok}|${s.hits || 0}|${s.code || ''}|${Math.round((s.prog || 0) * 20)}`;
    const live = kind === 'coolant' && !ok;
    if (key !== lastKey || live || !ok) { const blink = Math.floor(time * 4); const k2 = key + '|' + (live || !ok ? blink : 0); if (k2 !== lastKey) { lastKey = k2; draw(s, time); } }
  }
  return {
    root, update,
    dispose() { for (const m of mats) m.dispose?.(); for (const g of geos) g.dispose?.(); scr?.tex.dispose(); root.removeFromParent(); },
  };
}
