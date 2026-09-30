// LOOP11 - builds the far-away re-onboarding corridor (and the break room behind exit 8) as ONE small space: merged static geometry, a handful of dynamic props the
// anomalies toggle (loop11_anom.js), pooled emitters only (constant light count), colliders for walls / floor / ceiling. Local space: u along the hall from its west
// end, v across, y up from the floor; world = (ox + u, oy + y, oz + v). Same geometry on every peer (nothing here is random).
import * as THREE from 'three';
import { GeoBuilder, levelMaterial } from '../world/geobuilder.js';
import { makeCanvasTexture } from '../render/textures.js';
import { installLoop11Textures } from '../render/loop11_textures.js';
import { G } from '../physics/physics.js';
import { upperT, t } from '../core/i18n.js';
import { GEO, REWARD_SPOTS } from './loop11_core.js';
import { RULES, NOTICE_BASE, NOTICE_ALT, POSTERS, MASCOT, DOOR_NUMS, HUD } from './loop11_text.js';

const { L, W, H, STUB, GAP, GAP_H, R } = GEO;
const HW = W / 2;
const V3 = THREE.Vector3;
const grey = (k) => [k, k, k];
const FONT = (px) => `bold ${px}px "Courier New", monospace`;

/** wrapped, centred text block on a canvas; returns the y below the block */
function paragraph(ctx, text, cx, y, maxW, px, color, lh = 1.18) {
  ctx.font = FONT(px); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const words = String(text).split(' '); let line = '';
  const flush = () => { if (line) { ctx.fillText(line, cx, y); y += px * lh; line = ''; } };
  for (const w of words) { const probe = line ? line + ' ' + w : w; if (line && ctx.measureText(probe).width > maxW) { flush(); line = w; } else line = probe; }
  flush();
  return y;
}
const tex = (w, h, draw) => makeCanvasTexture(w, h, draw);

export function buildSpace(o) {
  const { physics, lightPool, oy } = o;
  const ox = o.ox ?? GEO.ox, oz = o.oz ?? GEO.oz;
  installLoop11Textures();
  const group = new THREE.Group(); group.name = 'loop11'; group.position.set(ox, oy, oz);
  const colliders = [], emitters = [], disposables = [];
  const track = (x) => { if (x) disposables.push(x); return x; };
  const wpos = (u, y, v) => new V3(ox + u, oy + y, oz + v);
  const addBox = (u0, u1, v0, v1, y0, y1, data = null) => {
    if (!physics) return;
    colliders.push(physics.addStaticBox(ox + (u0 + u1) / 2, oy + (y0 + y1) / 2, oz + (v0 + v1) / 2, (u1 - u0) / 2, (y1 - y0) / 2, (v1 - v0) / 2, 0, G.STATIC, data));
  };
  const lam = (c, extra = {}) => track(new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...extra }));
  const basic = (c, extra = {}) => track(new THREE.MeshBasicMaterial({ color: c, ...extra }));
  const boxMesh = (parent, m, sx, sy, sz, x, y, z) => { const g = new THREE.BoxGeometry(sx, sy, sz); const me = new THREE.Mesh(g, m); me.position.set(x, y, z); parent.add(me); return me; };
  const planeMesh = (parent, m, w, h, x, y, z, ry = 0) => { const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); me.position.set(x, y, z); me.rotation.y = ry; parent.add(me); return me; };
  const lamTex = (tx, extra = {}) => track(new THREE.MeshLambertMaterial({ map: track(tx), color: 0xffffff, ...extra }));
  const panelMat = basic(0xf2f6e8);
  const levelMat = (key) => levelMaterial(key.split(':')[1], { vertexColors: true });

  // ------------------------------------------------------------------------------------------------------------------ static merged shell
  const gb = new GeoBuilder(), gbP = new GeoBuilder(), gbD = new GeoBuilder();
  const K = (n) => 'w:' + n;
  // hall floor / ceiling / long walls
  gb.hrect(K('lp_floor'), 0, -HW, L, HW, 0, true, 0.5, grey(1));
  gb.hrect(K('lp_ceil'), 0, -HW, L, HW, H, false, 0.5, grey(0.95));
  const UVW = 1 / 2.7;
  gb.vrect(K('lp_wall'), 0, -HW, L, -HW, 0, H, UVW, grey(0.98));         // north wall (faces +v)
  gb.vrect(K('lp_wall'), L, HW, 0, HW, 0, H, UVW, grey(0.98));           // south wall (faces -v)
  // end walls with a dark doorway each (west faces +u, east faces -u): two side pieces + a lintel
  const gh = GAP / 2;
  gb.vrect(K('lp_wall'), 0, -gh, 0, -HW, 0, H, UVW, grey(0.98), 0);
  gb.vrect(K('lp_wall'), 0, HW, 0, gh, 0, H, UVW, grey(0.98), 0);
  gb.vrect(K('lp_wall'), 0, gh, 0, -gh, GAP_H, H, UVW, grey(0.98), 0);
  gb.vrect(K('lp_wall'), L, -HW, L, -gh, 0, H, UVW, grey(0.98), 0);
  gb.vrect(K('lp_wall'), L, gh, L, HW, 0, H, UVW, grey(0.98), 0);
  gb.vrect(K('lp_wall'), L, -gh, L, gh, GAP_H, H, UVW, grey(0.98), 0);
  // the dark stubs behind the ends
  const stubH = GAP_H;
  for (const east of [false, true]) {
    const a = east ? L : -STUB, b = east ? L + STUB : 0;
    gb.hrect(K('lp_void'), a, -gh, b, gh, 0, true, 1, grey(1));
    gb.hrect(K('lp_void'), a, -gh, b, gh, stubH, false, 1, grey(1));
    gb.vrect(K('lp_void'), a, -gh, b, -gh, 0, stubH, 1, grey(1));          // faces +v
    gb.vrect(K('lp_void'), b, gh, a, gh, 0, stubH, 1, grey(1));            // faces -v
    if (east) gb.vrect(K('lp_void'), b, -gh, b, gh, 0, stubH, 1, grey(1)); else gb.vrect(K('lp_void'), a, gh, a, -gh, 0, stubH, 1, grey(1));
  }
  // skirting + door frames of the two gaps + light housings
  for (const s of [-1, 1]) gb.box(K('lp_trim'), L / 2, 0.06, s * (HW - 0.02), L, 0.12, 0.04, 1, grey(1));
  for (const east of [false, true]) {
    const x = east ? L - 0.03 : 0.03;
    gb.box(K('lp_trim'), x, GAP_H / 2, -gh - 0.04, 0.06, GAP_H, 0.08, 1, grey(1));
    gb.box(K('lp_trim'), x, GAP_H / 2, gh + 0.04, 0.06, GAP_H, 0.08, 1, grey(1));
    gb.box(K('lp_trim'), x, GAP_H + 0.04, 0, 0.06, 0.08, GAP + 0.16, 1, grey(1));
  }
  const LIGHT_U = []; for (let i = 0; i < 8; i++) LIGHT_U.push(3.5 + i * 4);
  for (const u of LIGHT_U) {
    gb.box(K('lp_trim'), u, H - 0.01, 0, 1.4, 0.03, 0.6, 1, grey(1));
    gbP.hrect('panel', u - 0.6, -0.2, u + 0.6, 0.2, H - 0.03, false, 1, grey(1));
    if (lightPool) { const e = { pos: new V3(ox + u, oy + H - 0.25, oz), color: 0xeaf4e6, intensity: 0.85, distance: 9.5, flicker: 0, group: 'loop11', base: 0.85 }; lightPool.add(e); emitters.push(e); }
  }
  // hall colliders
  addBox(-STUB - 0.3, L + STUB + 0.3, -HW - 0.5, HW + 0.5, -1, 0);
  addBox(-STUB - 0.3, L + STUB + 0.3, -HW - 0.5, HW + 0.5, H, H + 0.5);
  addBox(-0.5, L + 0.5, -HW - 0.5, -HW, -1, H + 0.5); addBox(-0.5, L + 0.5, HW, HW + 0.5, -1, H + 0.5);
  for (const east of [false, true]) {
    const a = east ? L : -0.5, b = east ? L + 0.5 : 0;
    addBox(a, b, -HW - 0.5, -gh, -1, H + 0.5); addBox(a, b, gh, HW + 0.5, -1, H + 0.5); addBox(a, b, -gh, gh, GAP_H, H + 0.5);
    const s0 = east ? L : -STUB, s1 = east ? L + STUB : 0;
    addBox(s0, s1, -gh - 0.5, -gh, -1, H); addBox(s0, s1, gh, gh + 0.5, -1, H);
    addBox(east ? s1 : s0 - 0.5, east ? s1 + 0.5 : s0, -gh - 0.5, gh + 0.5, -1, H);
    addBox(s0, s1, -gh, gh, stubH, H);
  }

  // ------------------------------------------------------------------------------------------------------------------ decor group (mirrored as a whole by the "mirror" anomaly)
  const decor = new THREE.Group(); decor.name = 'loop11_decor'; group.add(decor);
  const E = { decor, panelMat, emitters, ceilU: LIGHT_U, ox, oz };
  // ---- Kip the Kefal poster (north wall, u = 10)
  {
    const g = new THREE.Group(); g.position.set(10, 1.5, -HW + 0.025); decor.add(g);
    const px = 1.2, py = 1.6;
    const tx = tex(120, 160, (c) => {
      c.fillStyle = '#f0d25a'; c.fillRect(0, 0, 120, 160); c.strokeStyle = '#3a2a10'; c.lineWidth = 4; c.strokeRect(2, 2, 116, 156);
      c.fillStyle = '#5a86b8'; c.beginPath(); c.ellipse(60, 84, 44, 28, 0, 0, 6.3); c.fill();               // body
      c.beginPath(); c.moveTo(98, 84); c.lineTo(118, 62); c.lineTo(118, 106); c.closePath(); c.fill();     // tail
      c.fillStyle = '#c9dbe8'; c.beginPath(); c.ellipse(58, 96, 34, 12, 0, 0, 6.3); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(38, 72, 13, 0, 6.3); c.fill(); c.beginPath(); c.arc(68, 72, 13, 0, 6.3); c.fill();   // eye whites (pupils are separate)
      c.strokeStyle = '#1a2a3a'; c.lineWidth = 2; c.beginPath(); c.arc(38, 72, 13, 0, 6.3); c.stroke(); c.beginPath(); c.arc(68, 72, 13, 0, 6.3); c.stroke();
      c.strokeStyle = '#1a2a3a'; c.beginPath(); c.arc(52, 96, 12, 0.2, 2.9); c.stroke();                      // smile
      paragraph(c, upperT(MASCOT[0]), 60, 8, 108, 12, '#3a2a10'); paragraph(c, upperT(MASCOT[1]), 60, 128, 108, 12, '#3a2a10');
    });
    planeMesh(g, lamTex(tx), px, py, 0, 0, 0);
    const pm = basic(0x10141c); const pupils = [];
    const eyes = [[38, 72], [68, 72]];
    for (const [ex, ey] of eyes) {
      const pl = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12), pm);
      const bx = (ex / 120 - 0.5) * px, by = (0.5 - ey / 160) * py;
      pl.position.set(bx, by, 0.006); pl.userData.base = [bx, by]; g.add(pl); pupils.push(pl);
    }
    E.mascot = { group: g, pupils, eyeR: 0.13 };
  }
  // ---- notice board (north wall, u = 14.5)
  {
    const g = new THREE.Group(); g.position.set(14.5, 1.5, -HW + 0.02); decor.add(g);
    let cvs = null, tx2 = null;
    tx2 = tex(176, 120, (c) => { cvs = c; });
    const draw = (alt) => {
      if (!cvs) return;
      const lines = NOTICE_BASE.slice();
      if (alt >= 0) { const [li, txt] = NOTICE_ALT[alt % NOTICE_ALT.length]; lines[li] = txt; }
      cvs.fillStyle = '#e8e6da'; cvs.fillRect(0, 0, 176, 120); cvs.strokeStyle = '#6a5a3a'; cvs.lineWidth = 6; cvs.strokeRect(3, 3, 170, 114);
      cvs.fillStyle = '#b02020'; cvs.fillRect(10, 10, 156, 22); paragraph(cvs, upperT(lines[0]), 88, 14, 150, 15, '#f4f0e0');
      let y = 38; for (let i = 1; i < 4; i++) y = paragraph(cvs, t(lines[i]), 88, y, 150, 11, '#22201a', 1.2) + 4;
      tx2.needsUpdate = true;
    };
    draw(-1);
    planeMesh(g, lamTex(tx2), 1.25, 0.85, 0, 0, 0);
    E.notice = { set: draw };
  }
  // ---- water cooler (north wall, u = 18.5)
  {
    const g = new THREE.Group(); g.position.set(18.5, 0, -HW + 0.3); decor.add(g);
    boxMesh(g, lam(0xd8d8cc), 0.42, 0.95, 0.4, 0, 0.475, 0);
    boxMesh(g, lam(0x2a6a9a), 0.3, 0.06, 0.02, 0, 0.78, 0.2); boxMesh(g, lam(0xb02020), 0.05, 0.06, 0.03, 0.08, 0.72, 0.2);
    const bm = lam(0x8fc8ff, { transparent: true, opacity: 0.8, emissive: 0x10303f });
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.46, 10), bm); bottle.position.set(0, 1.2, 0); g.add(bottle);
    E.cooler = { bottleMat: bm, group: g };
  }
  // ---- fire extinguisher (north wall, u = 23)
  {
    const g = new THREE.Group(); g.position.set(23, 1.1, -HW + 0.13); decor.add(g);
    boxMesh(g, lam(0x1a1a1a), 0.2, 0.05, 0.06, 0, 0.05, -0.09); boxMesh(g, lam(0x1a1a1a), 0.2, 0.05, 0.06, 0, -0.1, -0.09);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.46, 10), lam(0xc01818)); g.add(cyl);
    boxMesh(g, lam(0x222222), 0.1, 0.07, 0.1, 0, 0.27, 0); boxMesh(g, lam(0x222222), 0.14, 0.03, 0.03, 0.06, 0.32, 0);
    boxMesh(g, lam(0x222222), 0.03, 0.2, 0.03, 0.12, 0.2, 0.04);
    boxMesh(g, lam(0xe8e0d0), 0.14, 0.12, 0.005, 0, 0.02, 0.087);
    const ptex = tex(64, 24, (c) => { c.fillStyle = '#b01818'; c.fillRect(0, 0, 64, 24); paragraph(c, upperT(HUD.fire), 32, 5, 60, 14, '#fff'); });
    planeMesh(decor, lamTex(ptex), 0.34, 0.13, 23, 1.65, -HW + 0.02);
    E.ext = g;
  }
  // ---- wall clock (north wall, u = 27)
  {
    const g = new THREE.Group(); g.position.set(27, 1.95, -HW + 0.03); decor.add(g);
    const ft = tex(64, 64, (c) => {
      c.fillStyle = '#f2efe4'; c.beginPath(); c.arc(32, 32, 31, 0, 6.3); c.fill(); c.strokeStyle = '#1a1a1a'; c.lineWidth = 3; c.beginPath(); c.arc(32, 32, 30, 0, 6.3); c.stroke();
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, r0 = i % 3 ? 24 : 21; c.lineWidth = i % 3 ? 2 : 3; c.beginPath(); c.moveTo(32 + Math.sin(a) * r0, 32 - Math.cos(a) * r0); c.lineTo(32 + Math.sin(a) * 28, 32 - Math.cos(a) * 28); c.stroke(); }
    });
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), lamTex(ft)); g.add(face);
    const hand = (len, w, col, z, ang) => { const p = new THREE.Group(); p.position.z = z; g.add(p); const m = boxMesh(p, basic(col), w, len, 0.004, 0, len / 2 - 0.02, 0); void m; p.rotation.z = ang; return p; };
    hand(0.16, 0.022, 0x151515, 0.004, -2.1); hand(0.22, 0.014, 0x151515, 0.006, -3.6);
    const sec = hand(0.26, 0.007, 0xd02020, 0.008, 0);
    boxMesh(g, basic(0xd02020), 0.03, 0.03, 0.004, 0, 0, 0.01);
    E.clock = { sec, group: g };
  }
  // ---- office doors + plaques (south wall, u = 9 14 19 24), frames merged, leaves dynamic
  {
    E.doors = []; E.plaques = [];
    const doorMat = levelMaterial('lp_door', {});
    DOOR_NUMS.forEach((num, i) => {
      const u = 9 + i * 5;
      gbD.box(K('lp_trim'), u - 0.56, 1.08, HW - 0.03, 0.07, 2.16, 0.07, 1, grey(1));
      gbD.box(K('lp_trim'), u + 0.56, 1.08, HW - 0.03, 0.07, 2.16, 0.07, 1, grey(1));
      gbD.box(K('lp_trim'), u, 2.18, HW - 0.03, 1.19, 0.07, 0.07, 1, grey(1));
      gbD.box(K('lp_void'), u, 1.05, HW - 0.015, 1.02, 2.1, 0.02, 1, grey(1));
      // leaf hinged at its -u edge; closed it lies flat against the wall
      const piv = new THREE.Group(); piv.position.set(u - 0.5, 0, HW - 0.05); decor.add(piv);
      boxMesh(piv, doorMat, 1.0, 2.1, 0.05, 0.5, 1.05, 0);
      boxMesh(piv, lam(0xc8c0a0), 0.05, 0.05, 0.08, 0.86, 1.0, -0.03);
      E.doors.push({ pivot: piv, u });
      let cvs2 = null; const ptx = tex(72, 28, (c) => { cvs2 = c; });
      const set = (txt) => { if (!cvs2) return; cvs2.fillStyle = '#26302c'; cvs2.fillRect(0, 0, 72, 28); cvs2.strokeStyle = '#a8a08a'; cvs2.lineWidth = 3; cvs2.strokeRect(1.5, 1.5, 69, 25); paragraph(cvs2, txt, 36, 5, 68, 18, '#efe9d2'); ptx.needsUpdate = true; };
      set(num);
      planeMesh(decor, lamTex(ptx), 0.38, 0.15, u, 2.36, HW - 0.02, Math.PI);
      E.plaques.push({ set });
    });
    // the red spill behind a door that is left open (visible only with the "ajar" anomaly)
    const rm = basic(0xff2a1a, { transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.5), rm); glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.014, HW - 0.7); glow.visible = false; decor.add(glow);
    const strip = boxMesh(decor, basic(0xff3020), 0.05, 2.0, 0.01, 0, 1.05, HW - 0.024); strip.visible = false;
    E.doorGlow = { glow, strip };
  }
  // ---- three safety posters (south wall) + the paler patch each leaves when it is missing
  {
    E.posters = [];
    const patchM = lam(0xe6e0c6);
    POSTERS.forEach((txt, i) => {
      const u = 11.5 + i * 5;
      const patch = planeMesh(decor, patchM, 0.62, 0.86, u, 1.5, HW - 0.012, Math.PI);
      const tx = tex(96, 128, (c) => {
        c.fillStyle = ['#f4e9b0', '#dcebf4', '#f0d8d8'][i]; c.fillRect(0, 0, 96, 128); c.strokeStyle = '#2a2a2a'; c.lineWidth = 4; c.strokeRect(2, 2, 92, 124);
        c.fillStyle = ['#c07a10', '#2a5a8a', '#a02828'][i]; c.fillRect(8, 8, 80, 34); paragraph(c, upperT(i === 0 ? 'SAFETY' : i === 1 ? 'REMINDER' : 'NOTE'), 48, 17, 78, 14, '#fff');
        paragraph(c, t(txt), 48, 52, 84, 12, '#1a1a1a', 1.25);
        c.fillStyle = '#1a1a1a'; c.beginPath(); c.arc(48, 108, 9, 0, 6.3); c.fill(); c.fillStyle = '#f4e9b0'; c.fillRect(40, 106, 16, 3);
      });
      const mesh = planeMesh(decor, lamTex(tx), 0.55, 0.75, u, 1.5, HW - 0.02, Math.PI);
      E.posters.push({ mesh, patch });
    });
  }
  // ---- wet floor sign (yellow A-frame)
  {
    const g = new THREE.Group(); decor.add(g);
    const yel = lam(0xe8c820);
    const tx = tex(64, 96, (c) => { c.fillStyle = '#e8c820'; c.fillRect(0, 0, 64, 96); c.fillStyle = '#1a1a1a'; c.fillRect(0, 0, 64, 6); paragraph(c, upperT('WET'), 32, 12, 60, 16, '#1a1a1a'); paragraph(c, upperT('FLOOR'), 32, 30, 60, 16, '#1a1a1a'); c.beginPath(); c.moveTo(18, 84); c.lineTo(46, 84); c.lineTo(38, 58); c.lineTo(30, 58); c.closePath(); c.fill(); });
    const ftx = lamTex(tx);
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * 0.12, 0.3, 0); leg.rotation.z = s * 0.24; g.add(leg);
      boxMesh(leg, yel, 0.02, 0.6, 0.36, 0, 0, 0);
      const fm = planeMesh(leg, ftx, 0.34, 0.5, s * 0.011, 0.02, 0, s * Math.PI / 2);
      void fm;
    }
    boxMesh(g, yel, 0.06, 0.04, 0.36, 0, 0.6, 0);
    g.position.set(15.5, 0, HW - 0.9); g.rotation.y = 0.3;
    E.wet = { group: g, base: { u: 15.5, v: HW - 0.9, ry: 0.3 } };
  }
  // ---- the extra colleague (hidden until the anomaly)
  {
    const g = new THREE.Group(); g.visible = false; decor.add(g);
    const shirt = lam(0x5f7fa8), pants = lam(0x2a2a34), skin = lam(0xddd0bc);
    boxMesh(g, pants, 0.15, 0.85, 0.17, -0.09, 0.425, 0); boxMesh(g, pants, 0.15, 0.85, 0.17, 0.09, 0.425, 0);
    boxMesh(g, shirt, 0.42, 0.62, 0.22, 0, 1.16, 0);
    boxMesh(g, shirt, 0.09, 0.6, 0.11, -0.26, 1.13, 0); boxMesh(g, shirt, 0.09, 0.6, 0.11, 0.26, 1.13, 0);
    boxMesh(g, skin, 0.2, 0.24, 0.21, 0, 1.6, 0); boxMesh(g, lam(0x1a1410), 0.22, 0.09, 0.23, 0, 1.75, -0.01);
    boxMesh(g, lam(0x3a8a4a), 0.03, 0.32, 0.01, 0, 1.28, 0.12);
    boxMesh(g, basic(0xf0f0e8), 0.11, 0.14, 0.01, 0, 1.08, 0.125);
    g.position.set(28.4, 0, HW - 0.6);
    E.cow = { group: g, base: { u: 28.4, v: HW - 0.6 } };
  }
  // ---- lowered ceiling block, carpet stain, shadow, ceiling hole (all hidden until their anomaly)
  {
    const lm = levelMaterial('lp_ceil', {});
    const low = new THREE.Group(); low.visible = false; decor.add(low);
    boxMesh(low, lm, 1, 0.45, W - 0.04, 0, 2.475, 0).name = 'blk';
    for (let i = 0; i < 4; i++) { const q = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.4), panelMat); q.rotation.x = Math.PI / 2; q.position.set(i * 3.4 - 5.1, 2.245, 0); low.add(q); }
    E.lowceil = low;
    const ctx = tex(128, 128, (c) => {
      c.fillStyle = 'rgba(0,0,0,0)'; c.clearRect(0, 0, 128, 128);
      for (let i = 0; i < 90; i++) { const a = i * 2.399, r = 8 + ((i * 37) % 47), x = 64 + Math.cos(a) * r * 0.9, y = 64 + Math.sin(a) * r * 0.9; c.fillStyle = `rgba(${52 + (i % 5) * 6},4,6,${0.5 + (i % 4) * 0.12})`; c.beginPath(); c.arc(x, y, 6 + (i % 7) * 2, 0, 6.3); c.fill(); }
    });
    const cm = basic(0xffffff, { map: track(ctx), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const st = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), cm); st.rotation.x = -Math.PI / 2; st.position.set(15, 0.013, 0); st.visible = false; decor.add(st);
    E.carpet = st;
    const stx = tex(64, 128, (c) => {
      c.clearRect(0, 0, 64, 128); c.fillStyle = '#050506';
      c.beginPath(); c.arc(32, 16, 11, 0, 6.3); c.fill();                                                      // head
      c.beginPath(); c.moveTo(12, 118); c.lineTo(16, 42); c.lineTo(48, 42); c.lineTo(52, 118); c.closePath(); c.fill();   // body
      c.fillRect(20, 30, 24, 14);
    });
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.9), basic(0xffffff, { map: track(stx), transparent: true, opacity: 0.9, depthWrite: false }));
    sh.visible = false; decor.add(sh); E.shadow = sh;
    const hole = new THREE.Group(); hole.visible = false; decor.add(hole);
    const hm = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.72), basic(0x020203)); hm.rotation.x = Math.PI / 2; hm.position.y = H - 0.012; hole.add(hm);
    const em = basic(0xf4f4ff); const eyes = [];
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.035), em); e.rotation.x = Math.PI / 2; e.position.set(0.02, H - 0.022, s * 0.11); hole.add(e); eyes.push(e); }
    boxMesh(hole, lm, 0.72, 0.03, 0.72, 0.55, H - 0.02, 0.28).rotation.y = 0.5;   // the tile that fell out, leaning on the frame
    E.ceilHole = { group: hole, eyes };
  }
  decor.add(gbD.build(levelMat));

  // ------------------------------------------------------------------------------------------------------------------ fixed pieces outside decor (rule poster, staff door, signs)
  const fixed = new THREE.Group(); group.add(fixed);
  {   // the rule poster (north wall, u = 7)
    const tx = tex(150, 200, (c) => {
      c.fillStyle = '#efeadb'; c.fillRect(0, 0, 150, 200); c.strokeStyle = '#1e3a2a'; c.lineWidth = 6; c.strokeRect(3, 3, 144, 194);
      c.fillStyle = '#1e3a2a'; c.fillRect(8, 8, 134, 40); paragraph(c, upperT(RULES[0]), 75, 12, 128, 14, '#f0e8c8', 1.15);
      let y = 58; for (let i = 1; i <= 3; i++) y = paragraph(c, upperT(RULES[i]), 75, y, 132, 12, i === 3 ? '#a01818' : '#1a1a1a', 1.22) + 8;
      paragraph(c, t(RULES[4]), 75, 176, 132, 8, '#5a5a50');
    });
    planeMesh(fixed, lamTex(tx), 1.3, 1.73, 7, 1.5, -HW + 0.02);
    E.rule = { pos: wpos(7, 1.5, -HW + 0.5) };
  }
  {   // staff exit door (south wall, u = 3.2)
    const u = 3.2, dm = levelMaterial('lp_door', {});
    const g = new THREE.Group(); g.position.set(u, 0, HW - 0.03); fixed.add(g);
    boxMesh(g, lam(0x2a3a52), 0.07, 2.16, 0.07, -0.56, 1.08, 0); boxMesh(g, lam(0x2a3a52), 0.07, 2.16, 0.07, 0.56, 1.08, 0); boxMesh(g, lam(0x2a3a52), 1.19, 0.07, 0.07, 0, 2.18, 0);
    boxMesh(g, dm, 1.0, 2.1, 0.05, 0, 1.05, -0.01);
    const sx = tex(96, 28, (c) => { c.fillStyle = '#1e5a9a'; c.fillRect(0, 0, 96, 28); c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(2, 2, 92, 24); paragraph(c, upperT(HUD.staff), 48, 8, 90, 12, '#fff'); });
    planeMesh(g, basic(0xffffff, { map: track(sx) }), 0.6, 0.18, 0, 2.38, -0.02, Math.PI);
    E.staff = { pos: wpos(u, 1.2, HW - 0.5) };
  }
  // counter sign hanging over the hall (u = 10.5): green box, "EXIT" + the number of passes survived
  {
    let cc = null; const ctx2 = tex(128, 80, (c) => { cc = c; });
    const draw = (n) => {
      if (!cc) return;
      cc.fillStyle = '#0e6a3a'; cc.fillRect(0, 0, 128, 80); cc.strokeStyle = '#d8f4e0'; cc.lineWidth = 4; cc.strokeRect(3, 3, 122, 74);
      cc.textAlign = 'center'; cc.textBaseline = 'top'; cc.fillStyle = '#d8f4e0'; cc.font = FONT(18); cc.fillText(upperT(HUD.sign), 64, 8);
      cc.font = FONT(48); cc.fillText(String(n), 64, 28); ctx2.needsUpdate = true;
    };
    draw(0);
    const sm = basic(0xffffff, { map: track(ctx2) });
    const sg = new THREE.Group(); sg.position.set(10.5, 2.2, 0); fixed.add(sg);
    planeMesh(sg, sm, 0.72, 0.45, -0.006, 0, 0, -Math.PI / 2);   // faces -u (read while walking away from the start)
    planeMesh(sg, sm, 0.72, 0.45, 0.006, 0, 0, Math.PI / 2);     // faces +u (read while walking back)
    boxMesh(sg, lam(0x2a2a2a), 0.02, 0.25, 0.02, 0, 0.35, 0.25); boxMesh(sg, lam(0x2a2a2a), 0.02, 0.25, 0.02, 0, 0.35, -0.25);
    E.setCounter = draw;
  }
  {   // EXIT signs above the two dark doorways; the far one has a red twin for the "exitred" anomaly
    const mk = (bg, txt) => tex(96, 30, (c) => { c.fillStyle = bg; c.fillRect(0, 0, 96, 30); c.strokeStyle = '#f0fff0'; c.lineWidth = 2; c.strokeRect(2, 2, 92, 26); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f4fff4'; c.font = FONT(20); c.fillText(txt, 48, 16); });
    const label = upperT(HUD.sign);
    const green = track(mk('#0e7a3c', label)), red = track(mk('#a01414', label));
    const fm = basic(0xffffff, { map: green });
    planeMesh(fixed, fm, 0.9, 0.26, L - 0.02, GAP_H + 0.17, 0, -Math.PI / 2);
    const nm = basic(0xffffff, { map: green });
    planeMesh(fixed, nm, 0.9, 0.26, 0.02, GAP_H + 0.17, 0, Math.PI / 2);
    E.exitFar = { mat: fm, green, red };
  }
  group.add(gbP.build(() => panelMat));
  group.add(gb.build(levelMat));

  // ------------------------------------------------------------------------------------------------------------------ the break room behind exit 8
  {
    const rg = new THREE.Group(); rg.name = 'loop11_room'; group.add(rg);
    const b = new GeoBuilder(), bp = new GeoBuilder();
    const { u0, u1, hw, H: RH } = R;
    b.hrect(K('wood_planks'), u0, -hw, u1, hw, 0, true, 0.5, grey(0.85));
    b.hrect(K('ceiling_tiles'), u0, -hw, u1, hw, RH, false, 0.5, grey(0.9));
    b.vrect(K('wall_office'), u0, -hw, u1, -hw, 0, RH, 0.4, grey(0.85)); b.vrect(K('wall_office'), u1, hw, u0, hw, 0, RH, 0.4, grey(0.85));
    b.vrect(K('wall_office'), u0, hw, u0, -hw, 0, RH, 0.4, grey(0.85)); b.vrect(K('wall_office'), u1, -hw, u1, hw, 0, RH, 0.4, grey(0.85));
    b.box(K('wood_dark'), u0 + 7, 0.43, -0.3, 3.4, 0.06, 1.15, 0.5, grey(0.8));                                   // conference table top
    for (const [du, dv] of [[-1.5, -0.4], [1.5, -0.4], [-1.5, 0.4], [1.5, 0.4]]) b.box(K('wood_dark'), u0 + 7 + du, 0.2, -0.3 + dv, 0.12, 0.4, 0.12, 0.5, grey(0.7));
    b.box(K('carpet_red'), u0 + 3.0, 0.02, 0.0, 2.2, 0.03, 1.6, 0.5, grey(0.9));                                    // welcome mat under the spawn
    for (const cv of [-3.1, 3.1]) { b.box(K('wood_dark'), u0 + 9.5, 0.28, cv, 2.2, 0.56, 0.8, 0.5, grey(0.7)); b.box(K('carpet_red'), u0 + 9.5, 0.72, cv + Math.sign(cv) * 0.3, 2.2, 0.5, 0.2, 0.5, grey(0.7)); }   // couches
    b.box(K('metal_plate'), u1 - 0.4, 0.5, 2.2, 0.6, 1.0, 2.0, 0.5, grey(0.8));                                    // counter with the coffee machine
    b.box(K('metal_dark'), u1 - 0.4, 1.2, 2.2, 0.4, 0.4, 0.5, 0.5, grey(0.6));
    for (const eu of [u0 + 3, u0 + 7, u0 + 10]) {
      b.box(K('metal_dark'), eu, RH - 0.02, 0, 1.4, 0.03, 0.6, 1, grey(1));
      bp.hrect('panel', eu - 0.6, -0.2, eu + 0.6, 0.2, RH - 0.04, false, 1, grey(1));
      if (lightPool) { const e = { pos: new V3(ox + eu, oy + RH - 0.3, oz), color: 0xffd9a0, intensity: 1.0, distance: 11, flicker: 0, group: 'loop11', base: 1.0 }; lightPool.add(e); emitters.push(e); }
    }
    rg.add(bp.build(() => panelMat)); rg.add(b.build(levelMat));
    const rtx = tex(160, 200, (c) => {
      c.fillStyle = '#f0e8c8'; c.fillRect(0, 0, 160, 200); c.strokeStyle = '#8a6a1a'; c.lineWidth = 6; c.strokeRect(3, 3, 154, 194);
      paragraph(c, upperT(HUD.rewardPoster), 80, 12, 140, 16, '#5a3a08');
      c.fillStyle = '#5a86b8'; c.beginPath(); c.ellipse(80, 108, 46, 30, 0, 0, 6.3); c.fill(); c.beginPath(); c.moveTo(120, 108); c.lineTo(146, 82); c.lineTo(146, 134); c.closePath(); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(60, 96, 11, 0, 6.3); c.fill(); c.fillStyle = '#10141c'; c.beginPath(); c.arc(62, 97, 5, 0, 6.3); c.fill();
      c.strokeStyle = '#1a2a3a'; c.lineWidth = 2; c.beginPath(); c.arc(72, 120, 12, 0.2, 2.9); c.stroke();
      paragraph(c, t(HUD.rewardPoster2), 80, 158, 140, 10, '#3a2a10');
    });
    planeMesh(rg, lamTex(rtx), 1.0, 1.25, u0 + 9.5, 1.7, -hw + 0.02);
    const dtx = tex(128, 40, (c) => { c.fillStyle = '#1a5a30'; c.fillRect(0, 0, 128, 40); c.strokeStyle = '#d8f4e0'; c.lineWidth = 3; c.strokeRect(2, 2, 124, 36); paragraph(c, upperT(HUD.rewardTitle), 64, 6, 120, 14, '#d8f4e0'); paragraph(c, t(HUD.rewardSub), 64, 24, 120, 8, '#b8e0c0'); });
    planeMesh(rg, basic(0xffffff, { map: track(dtx) }), 1.1, 0.34, u0 + 0.03, 2.25, 2.4, Math.PI / 2);
    boxMesh(rg, lam(0x2a5a3a), 0.06, 2.1, 1.0, u0 + 0.04, 1.05, 2.4);
    addBox(u0 - 0.5, u1 + 0.5, -hw - 0.5, hw + 0.5, -1, 0); addBox(u0 - 0.5, u1 + 0.5, -hw - 0.5, hw + 0.5, RH, RH + 0.5);
    addBox(u0 - 0.5, u1 + 0.5, -hw - 0.5, -hw, -1, RH + 0.5); addBox(u0 - 0.5, u1 + 0.5, hw, hw + 0.5, -1, RH + 0.5);
    addBox(u0 - 0.5, u0, -hw - 0.5, hw + 0.5, -1, RH + 0.5); addBox(u1, u1 + 0.5, -hw - 0.5, hw + 0.5, -1, RH + 0.5);
    addBox(u0 + 5.3, u0 + 8.7, -0.9, 0.3, 0, 0.5); addBox(u0 + 8.4, u0 + 10.6, -3.5, -2.7, 0, 0.95); addBox(u0 + 8.4, u0 + 10.6, 2.7, 3.5, 0, 0.95);
    addBox(u1 - 0.7, u1, 1.2, 3.2, 0, 1.4);
    E.roomDoor = { pos: wpos(u0 + 0.5, 1.2, 2.4) };
    E.rewardSpots = REWARD_SPOTS.map(([u, v, y]) => wpos(u, y, v));
  }

  // ------------------------------------------------------------------------------------------------------------------ api
  const inU = (p, a, b, hv) => p.x - ox >= a && p.x - ox <= b && Math.abs(p.z - oz) <= hv && p.y - oy > -3 && p.y - oy < 12;
  const api = {
    group, E, ox, oy, oz,
    world: (u, y, v) => wpos(u, y, v),
    local: (p) => ({ u: p.x - ox, v: p.z - oz }),
    inHall: (p) => inU(p, -STUB - 0.6, L + STUB + 0.6, HW + 0.8),
    inReward: (p) => inU(p, R.u0 - 0.6, R.u1 + 0.6, R.hw + 0.8),
    contains(p) { return api.inHall(p) || api.inReward(p); },
    dispose() {
      if (physics) for (const c of colliders) physics.removeCollider(c);
      colliders.length = 0;
      for (const e of emitters) lightPool?.remove(e);
      emitters.length = 0;
      group.traverse((m) => { if (m.geometry) m.geometry.dispose(); });
      for (const d of disposables) d.dispose?.();
      group.removeFromParent();
    },
  };
  return api;
}
