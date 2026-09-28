// THE ALGORITHM'S REVOLVER - procedural models: a small round felt table, four stools, a hanging lamp (emissive + additive cone only, NEVER a
// scene light), a 6-chamber revolver with a turning cylinder / cocking hammer / muzzle flash, chip stacks per seat, a floating status sign and
// a wisp of smoke once the table is closed. Safe to import in node (no DOM at import).
import * as THREE from 'three';

const HAS_DOM = typeof document !== 'undefined';
const TAU = Math.PI * 2;
const AD = THREE.AdditiveBlending;
const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...o });
const bas = (color, o = {}) => new THREE.MeshBasicMaterial({ color, fog: false, ...o });
const glow = (color, o = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, blending: AD, depthWrite: false, fog: false, ...o });
function add(parent, geo, mat, p = [0, 0, 0], r = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(p[0], p[1], p[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  parent.add(m);
  return m;
}

export const ROULETTE = { tableR: 0.72, height: 0.84, seatR: 1.32, seats: 4, lampY: 2.35, chambers: 6 };
/** Chip colours by pot level 1..5 (same palette as the item tiers). */
export const CHIP_COLORS = [0x9aa39a, 0x4ecb5a, 0x3d8bff, 0xb35cff, 0xff9a1f, 0xff3b6b];
/** World-space seat position of seat i (0..3) for a table at (x, y, z) with a yaw. Pure. */
export function seatPos(x, y, z, yaw, i, out = new THREE.Vector3()) {
  const a = yaw + i * (TAU / ROULETTE.seats) + Math.PI / 4;
  return out.set(x + Math.sin(a) * ROULETTE.seatR, y, z + Math.cos(a) * ROULETTE.seatR);
}
/** Yaw a player standing at seat i must have to look at the table centre (localplayer convention: forward = (-sin yaw, -cos yaw)). Pure. */
export function seatYaw(x, z, yaw, i) {
  const p = seatPos(x, 0, z, yaw, i);
  return Math.atan2(-(x - p.x), -(z - p.z));
}

function signTexture() {
  if (!HAS_DOM) return null;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return { c, t };
}

export function createRouletteTable() {
  const group = new THREE.Group();
  group.name = 'roulette_table';
  const R = ROULETTE;
  const wood = lam(0x4a2c1a), felt = lam(0x1a5c3c), dark = lam(0x14110f), brass = lam(0xb8923a), steel = lam(0x8a9096), stoolM = lam(0x2b1c16);

  // ---- table
  add(group, new THREE.CylinderGeometry(0.16, 0.24, R.height - 0.06, 8), wood, [0, (R.height - 0.06) / 2, 0]);
  add(group, new THREE.CylinderGeometry(0.5, 0.56, 0.05, 10), dark, [0, 0.025, 0]);
  add(group, new THREE.CylinderGeometry(R.tableR + 0.05, R.tableR + 0.05, 0.06, 20), wood, [0, R.height - 0.03, 0]);
  add(group, new THREE.CylinderGeometry(R.tableR - 0.04, R.tableR - 0.04, 0.02, 20), felt, [0, R.height + 0.005, 0]);
  // seat markers on the felt (a brass dot + a ring towards each seat)
  const seatDots = [];
  for (let i = 0; i < R.seats; i++) {
    const a = i * (TAU / R.seats) + Math.PI / 4;
    add(group, new THREE.CylinderGeometry(0.022, 0.022, 0.006, 8), brass, [Math.sin(a) * (R.tableR - 0.13), R.height + 0.018, Math.cos(a) * (R.tableR - 0.13)]);
    // stool behind where the player stands
    const sx = Math.sin(a) * (R.seatR + 0.42), sz = Math.cos(a) * (R.seatR + 0.42);
    add(group, new THREE.CylinderGeometry(0.2, 0.2, 0.07, 8), stoolM, [sx, 0.5, sz]);
    add(group, new THREE.CylinderGeometry(0.04, 0.05, 0.46, 6), dark, [sx, 0.24, sz]);
    seatDots.push(a);
  }

  // ---- hanging lamp: cord + shade + hot bulb + additive cone + glow pool on the felt (all unlit, no scene light)
  const lampY = R.lampY;
  add(group, new THREE.CylinderGeometry(0.008, 0.008, 1.2, 4), dark, [0, lampY + 0.75, 0]);
  add(group, new THREE.ConeGeometry(0.28, 0.2, 10, 1, true), lam(0x2a4a3a, { side: THREE.DoubleSide }), [0, lampY + 0.1, 0]);
  const bulb = add(group, new THREE.SphereGeometry(0.06, 8, 6), bas(0xffd58a), [0, lampY - 0.02, 0]);
  const cone = add(group, new THREE.ConeGeometry(0.62, lampY - R.height - 0.05, 16, 1, true), glow(0xffc46a, { opacity: 0.075, side: THREE.DoubleSide }), [0, (lampY + R.height) / 2 - 0.02, 0]);
  const pool = add(group, new THREE.CircleGeometry(0.62, 20), glow(0xffc46a, { opacity: 0.16 }), [0, R.height + 0.026, 0], [-Math.PI / 2, 0, 0]);

  // ---- revolver (built along +z: muzzle at +z, hammer at the back, cylinder in the middle)
  const gun = new THREE.Group();
  const gunBase = new THREE.Group();   // holds the position / yaw (moves towards the shooter)
  gunBase.position.set(0, R.height + 0.045, 0);
  gunBase.add(gun);
  add(gun, new THREE.BoxGeometry(0.03, 0.03, 0.21), steel, [0, 0.02, 0.15]);            // barrel
  add(gun, new THREE.BoxGeometry(0.036, 0.055, 0.13), steel, [0, 0.005, -0.045]);       // frame
  add(gun, new THREE.BoxGeometry(0.018, 0.012, 0.13), dark, [0, 0.042, 0.13]);          // rib
  const grip = add(gun, new THREE.BoxGeometry(0.03, 0.095, 0.045), wood, [0, -0.048, -0.105], [0.35, 0, 0]);
  add(gun, new THREE.BoxGeometry(0.02, 0.01, 0.06), dark, [0, -0.035, -0.02]);           // trigger guard
  const hammer = new THREE.Group();
  hammer.position.set(0, 0.04, -0.098);
  add(hammer, new THREE.BoxGeometry(0.014, 0.04, 0.014), dark, [0, 0.016, -0.004]);
  gun.add(hammer);
  const cyl = new THREE.Group();
  cyl.position.set(0, 0.012, 0.012);
  add(cyl, new THREE.CylinderGeometry(0.043, 0.043, 0.085, 12), steel, [0, 0, 0], [Math.PI / 2, 0, 0]);
  const holes = [];
  for (let i = 0; i < R.chambers; i++) {
    const a = i * (TAU / R.chambers);
    const h = add(cyl, new THREE.CylinderGeometry(0.0125, 0.0125, 0.004, 8), bas(0x050505), [Math.sin(a) * 0.026, Math.cos(a) * 0.026, 0.0435], [Math.PI / 2, 0, 0]);
    holes.push(h);
  }
  gun.add(cyl);
  const flash = add(gun, new THREE.PlaneGeometry(0.5, 0.5), glow(0xffd28a, { opacity: 0 }), [0, 0.02, 0.36]);
  flash.rotation.y = Math.PI / 2;
  const flash2 = add(gun, new THREE.PlaneGeometry(0.5, 0.5), glow(0xff7a3a, { opacity: 0 }), [0, 0.02, 0.36]);
  flash2.rotation.set(0, 0, Math.PI / 2);
  gunBase.rotation.y = 0.6;
  group.add(gunBase);

  // ---- chips: up to 5 per seat, stacked on the felt in front of each seat
  const chipGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.009, 10);
  const chips = [];
  for (let i = 0; i < R.seats; i++) {
    const a = seatDots[i], row = [];
    for (let k = 0; k < 5; k++) {
      const m = new THREE.Mesh(chipGeo, lam(CHIP_COLORS[k + 1]));
      m.position.set(Math.sin(a) * (R.tableR - 0.26), R.height + 0.02 + k * 0.0095, Math.cos(a) * (R.tableR - 0.26));
      m.visible = false;
      group.add(m); row.push(m);
    }
    chips.push(row);
  }

  // ---- status sign (billboard)
  const st = signTexture();
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.41), new THREE.MeshBasicMaterial({ map: st?.t || null, color: st ? 0xffffff : 0x552200, transparent: true, depthWrite: false, fog: false }));
  sign.position.set(0, R.height + 0.9, 0);
  group.add(sign);
  let signKey = '';
  function drawSign(l1, l2, color) {
    const key = l1 + '|' + l2 + '|' + color;
    if (!st || key === signKey) return;
    signKey = key;
    const g = st.c.getContext('2d');
    g.clearRect(0, 0, 256, 96);
    g.fillStyle = 'rgba(8,4,10,.72)'; g.fillRect(0, 0, 256, 96);
    g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(2, 2, 252, 92);
    g.textAlign = 'center';
    g.fillStyle = color; g.font = 'bold 26px monospace'; g.fillText(l1, 128, 38);
    g.fillStyle = '#ffe8d0'; g.font = '20px monospace'; g.fillText(l2, 128, 72);
    st.t.needsUpdate = true;
  }

  // ---- smoke (closed table)
  const smoke = [];
  for (let i = 0; i < 4; i++) {
    const m = add(group, new THREE.SphereGeometry(0.05, 6, 5), glow(0x9a9a9a, { opacity: 0 }), [0, R.height + 0.1, 0.3]);
    smoke.push(m);
  }

  // ---- animation state
  const A = { cyl: 0, cylTarget: 0, cock: 0, cockTarget: 0, flash: 0, gunYaw: 0.6, gunYawTarget: 0.6, gunR: 0, gunRTarget: 0, closed: false, t: 0, snap: 0 };
  const tmp = new THREE.Vector3();
  const api = {
    group, size: R, holes,
    /** where seat i stands (local table space) */
    seatLocal(i) { const a = seatDots[i]; return tmp.set(Math.sin(a) * R.seatR, 0, Math.cos(a) * R.seatR).clone(); },
    /** aim the revolver at a seat (or back to the middle when i < 0) */
    aim(i) {
      if (i < 0) { A.gunRTarget = 0; return; }
      const a = seatDots[i];
      A.gunYawTarget = a + 0.0;   // muzzle (+z) towards the seat
      A.gunRTarget = 0.3;
    },
    /** advance the cylinder to chamber n (n * 60 degrees) */
    setChamber(n, snap = false) { A.cylTarget = n * (TAU / R.chambers); if (snap) A.cyl = A.cylTarget; },
    /** 0..1: how far the hammer is cocked (hold-to-pull feedback) */
    setCock(v) { A.cockTarget = Math.max(0, Math.min(1, v)); },
    /** muzzle flash for a live round */
    fire() { A.flash = 1; },
    /** click of an empty chamber: hammer snaps forward */
    click() { A.cock = 0; A.snap = 1; },
    setClosed(v) { A.closed = !!v; if (v) A.gunRTarget = 0.2; },
    setChips(levels) {
      for (let i = 0; i < R.seats; i++) for (let k = 0; k < 5; k++) chips[i][k].visible = k < (levels[i] || 0);
    },
    setSign: drawSign,
    setLamp(on) { bulb.material.color.setHex(on ? 0xffd58a : 0x553a20); cone.material.opacity = on ? 0.075 : 0.02; pool.material.opacity = on ? 0.16 : 0.04; },
    update(dt, time, camera) {
      A.t += dt;
      A.cyl += (A.cylTarget - A.cyl) * Math.min(1, dt * 10);
      cyl.rotation.z = A.cyl;
      A.cock += (A.cockTarget - A.cock) * Math.min(1, dt * 5);
      A.snap = Math.max(0, A.snap - dt * 9);
      hammer.rotation.x = -(A.cock * 0.9) + A.snap * 0.5;
      A.gunYaw += (A.gunYawTarget - A.gunYaw) * Math.min(1, dt * 5);
      A.gunR += (A.gunRTarget - A.gunR) * Math.min(1, dt * 5);
      gunBase.rotation.y = A.gunYaw;
      gunBase.position.set(Math.sin(A.gunYaw) * A.gunR, R.height + 0.045, Math.cos(A.gunYaw) * A.gunR);
      A.flash = Math.max(0, A.flash - dt * 4.5);
      flash.material.opacity = A.flash; flash2.material.opacity = A.flash * 0.9;
      const sc = 0.5 + (1 - A.flash) * 1.2;
      flash.scale.setScalar(sc); flash2.scale.setScalar(sc);
      // lamp sway
      cone.rotation.z = Math.sin(time * 0.9) * 0.012; cone.rotation.x = Math.cos(time * 0.7) * 0.012;
      if (camera) sign.lookAt(camera.position.x, sign.getWorldPosition(tmp).y, camera.position.z);
      for (let i = 0; i < smoke.length; i++) {
        const m = smoke[i];
        if (!A.closed) { m.material.opacity = 0; continue; }
        const ph = ((time * 0.35 + i / smoke.length) % 1);
        m.position.set(Math.sin(A.gunYaw) * A.gunR + Math.sin(ph * 5 + i) * 0.05, R.height + 0.1 + ph * 0.7, Math.cos(A.gunYaw) * A.gunR + Math.cos(ph * 4 + i) * 0.05);
        m.scale.setScalar(0.7 + ph * 2.2);
        m.material.opacity = 0.22 * (1 - ph);
      }
    },
    /** world position of the muzzle (for particles) */
    muzzleWorld(out = new THREE.Vector3()) { flash.getWorldPosition(out); return out; },
    centerWorld(out = new THREE.Vector3()) { return group.localToWorld(out.set(0, R.height + 0.1, 0)); },
    dispose() {
      group.traverse((o) => {
        if (o.geometry && o.geometry !== chipGeo) o.geometry.dispose?.();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) { m.map?.dispose?.(); m.dispose?.(); }
      });
      chipGeo.dispose();
      group.removeFromParent();
    },
  };
  void grip; void holes;
  return api;
}
