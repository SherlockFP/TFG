// THE ADMINISTRATOR: an impossibly tall, thin figure in a sharp grey suit, tie and briefcase. Its face is a slightly out-of-focus
// screen whose pixels keep sliding sideways in bands (canvas texture, refreshed ~12 Hz). Calm: it never runs, it only watches.
// Original design (smooth featureless egg head with a drifting face-screen, no hair, no glasses). Plain three.js: Lambert body,
// Basic face, no lights. Front faces +z; feet at y = 0 (`setPose('sit')` folds the legs; place the root so the hips sit on the chair).
import * as THREE from 'three';

export const ADMIN = Object.freeze({ HEIGHT: 3.45, HEAD_Y: 3.22, HIP_Y: 1.6, FACE_W: 32, FACE_H: 44 });

const L = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const cylGeo = (rt, rb, len, seg = 6) => new THREE.CylinderGeometry(rt, rb, len, seg).translate(0, -len / 2, 0);   // hangs down from the origin

function faceBase() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 22;
  const x = c.getContext('2d');
  x.fillStyle = '#bdb7ae'; x.fillRect(0, 0, 16, 22);
  x.fillStyle = '#cfc9c0'; x.fillRect(2, 2, 12, 17);
  x.fillStyle = '#8f8a83'; x.fillRect(2, 5, 5, 1); x.fillRect(9, 5, 5, 1);            // brows
  x.fillStyle = '#1b1a1d'; x.fillRect(3, 8, 3, 1); x.fillRect(10, 8, 3, 1);            // eyes: two dark slits
  x.fillStyle = '#a49f97'; x.fillRect(8, 10, 1, 4);                                    // nose shadow
  x.fillStyle = '#9b958d'; x.fillRect(5, 17, 6, 1);                                    // no real mouth, just a seam
  return c;
}

export function createAdministrator({ seed = 1 } = {}) {
  const root = new THREE.Group(); root.name = 'administrator';
  const suit = L(0x6b7079), trous = L(0x585c64), shirt = L(0xd8d5ce), tie = L(0x4a1620), skin = L(0xb8b0a6), shoe = L(0x111114);
  const leather = L(0x2a1d16), metal = new THREE.MeshBasicMaterial({ color: 0xb9bcc2 });
  const own = [suit, trous, shirt, tie, skin, shoe, leather, metal];
  const geos = [];
  const G = (g) => { geos.push(g); return g; };
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(G(geo), mat); m.position.set(x, y, z); parent.add(m); return m; };

  // ---- legs (hip pivots so the seated pose can fold them)
  const hips = new THREE.Group(); hips.position.y = ADMIN.HIP_Y; root.add(hips);
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.1 * sx, 0, 0); hips.add(hip);
    add(hip, cylGeo(0.062, 0.05, 0.8), trous);
    const knee = new THREE.Group(); knee.position.y = -0.8; hip.add(knee);
    add(knee, cylGeo(0.05, 0.04, 0.8), trous);
    add(knee, new THREE.BoxGeometry(0.12, 0.07, 0.32), shoe, 0, -0.83, 0.09);
    legs.push({ hip, knee });
  }
  // ---- torso: long waist + broad chest, shirt V, tie
  const torso = new THREE.Group(); hips.add(torso);
  add(torso, new THREE.BoxGeometry(0.31, 0.52, 0.2), suit, 0, 0.26, 0);
  add(torso, new THREE.BoxGeometry(0.45, 0.66, 0.25), suit, 0, 0.84, 0);
  add(torso, new THREE.BoxGeometry(0.54, 0.09, 0.27), suit, 0, 1.15, 0);                 // shoulder line
  const vee = new THREE.Mesh(G(new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); s.moveTo(-0.09, 0.3); s.lineTo(0.09, 0.3); s.lineTo(0, -0.28); s.closePath(); return s; })())), shirt);
  vee.position.set(0, 0.86, 0.128); torso.add(vee);
  add(torso, new THREE.BoxGeometry(0.05, 0.62, 0.012), tie, 0, 0.8, 0.135);
  add(torso, new THREE.BoxGeometry(0.075, 0.07, 0.02), tie, 0, 1.12, 0.135);
  for (const sx of [-1, 1]) add(torso, new THREE.BoxGeometry(0.06, 0.4, 0.014), L(0x565a62), 0.12 * sx, 0.9, 0.132);   // lapels
  // ---- neck + egg head + face screen
  add(torso, cylGeo(0.045, 0.05, 0.28), skin, 0, 1.35, 0);
  const head = new THREE.Group(); head.position.y = ADMIN.HEAD_Y - ADMIN.HIP_Y; torso.add(head);
  const egg = add(head, new THREE.SphereGeometry(1, 12, 10), skin); egg.scale.set(0.132, 0.19, 0.15);
  const fc = document.createElement('canvas'); fc.width = ADMIN.FACE_W; fc.height = ADMIN.FACE_H;
  const fctx = fc.getContext('2d');
  const ftex = new THREE.CanvasTexture(fc);
  ftex.magFilter = THREE.NearestFilter; ftex.minFilter = THREE.NearestFilter; ftex.colorSpace = THREE.SRGBColorSpace;
  const fmat = new THREE.MeshBasicMaterial({ map: ftex });
  own.push(fmat);
  const face = add(head, new THREE.PlaneGeometry(0.245, 0.336), fmat, 0, 0.0, 0.152);
  const base = faceBase();
  // ---- arms + briefcase (right hand)
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.27 * sx, 1.12, 0); torso.add(sh);
    sh.rotation.z = 0.05 * sx;
    add(sh, cylGeo(0.042, 0.036, 0.78), suit);
    const el = new THREE.Group(); el.position.y = -0.78; el.rotation.x = -0.12; sh.add(el);
    add(el, cylGeo(0.036, 0.03, 0.82), suit);
    add(el, new THREE.BoxGeometry(0.075, 0.2, 0.045), skin, 0, -0.9, 0);
    arms.push({ sh, el });
  }
  const bcase = new THREE.Group(); arms[1].el.add(bcase); bcase.position.set(0.01, -1.12, 0.02);
  add(bcase, new THREE.BoxGeometry(0.55, 0.38, 0.12), leather);
  add(bcase, new THREE.BoxGeometry(0.2, 0.05, 0.05), metal, 0, 0.22, 0);
  add(bcase, new THREE.BoxGeometry(0.06, 0.05, 0.13), metal, -0.16, 0.05, 0);
  add(bcase, new THREE.BoxGeometry(0.06, 0.05, 0.13), metal, 0.16, 0.05, 0);

  let pose = 'stand', t = 0, faceT = 0, agit = 0, headYaw = 0, sitBase = null;
  let s0 = ((seed * 2654435761) >>> 0) || 1;
  const rnd = () => { s0 = (s0 + 0x6D2B79F5) | 0; let z = Math.imul(s0 ^ (s0 >>> 15), 1 | s0); z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z; return ((z ^ (z >>> 14)) >>> 0) / 4294967296; };

  function drawFace(gl) {
    const W = fc.width, H = fc.height;
    fctx.imageSmoothingEnabled = true;
    fctx.drawImage(base, 0, 0, W, H);   // 16x22 -> 32x44 bilinear = "slightly out of focus"
    // sliding pixel bands
    const bands = 2 + Math.floor(rnd() * 3 + gl * 4);
    for (let i = 0; i < bands; i++) {
      const y = Math.floor(rnd() * (H - 4)), h = 1 + Math.floor(rnd() * (3 + gl * 4));
      const dx = Math.round((rnd() - 0.5) * (4 + gl * 14));
      if (!dx) continue;
      fctx.drawImage(fc, 0, y, W, h, dx, y, W, h);
      fctx.drawImage(fc, 0, y, W, h, dx + (dx > 0 ? -W : W), y, W, h);
    }
    // faint scan lines + a drifting bright pixel or two
    fctx.fillStyle = 'rgba(20,20,26,0.10)';
    for (let y = 0; y < H; y += 3) fctx.fillRect(0, y, W, 1);
    fctx.fillStyle = 'rgba(230,236,255,0.35)';
    for (let i = 0; i < 2 + gl * 8; i++) fctx.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), 1 + Math.floor(rnd() * 3), 1);
    ftex.needsUpdate = true;
  }
  drawFace(0);

  const api = {
    root, head, face, pose: () => pose, bcase, heightOf: () => ADMIN.HEIGHT,
    /** 'stand' | 'sit' (thighs forward, shins down; the briefcase goes on the table in front) */
    setPose(p) {
      pose = p;
      const sit = p === 'sit';
      for (const l of legs) { l.hip.rotation.x = sit ? -Math.PI / 2 : 0; l.knee.rotation.x = sit ? Math.PI / 2 : 0; }
      for (const a of arms) { a.sh.rotation.x = sit ? -0.55 : 0; a.el.rotation.x = sit ? -1.0 : -0.12; }
      if (sit) { sitBase = bcase.parent; root.add(bcase); bcase.position.set(0.5, 0.6 + 0.22, 0.85); bcase.rotation.set(0, 0.25, 0); }
      else if (sitBase) { arms[1].el.add(bcase); bcase.position.set(0.01, -1.12, 0.02); bcase.rotation.set(0, 0, 0); sitBase = null; }
    },
    /** lookAt: world Vector3 the head turns toward (or null), agit 0..1 = how badly the face is glitching (looked at / talking) */
    update(dt, time, o = {}) {
      t += dt;
      agit += ((o.agit || 0) - agit) * Math.min(1, dt * 3);
      const sway = Math.sin(t * 0.7) * 0.012;
      torso.rotation.z = sway; torso.rotation.x = Math.sin(t * 0.5 + 1) * 0.008;
      if (o.lookAt) {
        const wp = root.getWorldPosition(new THREE.Vector3());
        const want = Math.atan2(o.lookAt.x - wp.x, o.lookAt.z - wp.z) - root.rotation.y;
        let d = Math.atan2(Math.sin(want), Math.cos(want)); d = Math.max(-0.9, Math.min(0.9, d));
        headYaw += (d - headYaw) * Math.min(1, dt * 1.5);
      }
      head.rotation.y = headYaw;
      // out-of-focus flicker: the whole figure shivers a hair, harder while it is looked at
      const j = (0.004 + agit * 0.02);
      hips.position.x = (Math.sin(t * 61) * Math.sin(t * 7.3)) * j;
      faceT -= dt;
      if (faceT <= 0 && o.near !== false) { faceT = 0.06 + rnd() * 0.06 + (1 - agit) * 0.04; drawFace(agit); }
    },
    headWorld(out = new THREE.Vector3()) {
      root.updateMatrixWorld(true);
      return head.getWorldPosition(out);
    },
    dispose() {
      root.removeFromParent();
      for (const g of geos) g.dispose();
      for (const m of own) { m.map?.dispose?.(); m.dispose(); }
    },
  };
  return api;
}
