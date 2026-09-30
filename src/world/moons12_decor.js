// MOONS12 decor (wave 12, docs/wave12/moons12.md): set dressing of CLOUD-9 ('cloud9') and DEEP CABLE ('dcable'), registered as biome decor kinds (outdoor_biomes.js registerDecor).
// terrain.js builds it for every peer from the map seed. The layout comes from game/moons12_core.js (planCloud / planCable, exposed as terrain.hook.plan, so the height field and this
// geometry always agree). Everything solid is merged through voyage_kit.Kit (2 draw calls for the shared kit) + a few standalone meshes for what the runtime animates; lights are pooled
// emitters only (constant light count). Math.random only drives visuals / audio timing.
//   cloud9  cloud sea plane + puffs, rope bridges (level collider deck), hover pads, ruined server kiosks, drifting rocks, 3 relay dishes with consoles + beams, the uplink mast, wind streaks
//   dcable  kelp of cables, air domes (glass + green pole = the tell), glass tunnels with a breach, 3 dead server hulks with a lit bay and a core cradle, bubbles + marine snow
// info handed to game/moons12.js: C.info = { kind, plan, dish[], mast, pads[], wrecks[], domes[], audio[] }
import * as THREE from 'three';
import { registerDecor, DECOR_HELPERS } from './outdoor_biomes.js';
import { Kit } from './voyage_kit.js';
import { makeCanvasTexture } from '../render/textures.js';
import { getLang } from '../core/i18n.js';
import { BASE, CLOUD, CABLE } from '../game/moons12_core.js';
import { tx } from '../game/moons12_text.js';

const { softPuffTexture, TAU } = DECOR_HELPERS;
const FONT = "'TFG Cyr VT','Arial Black','Arial Narrow',monospace";
const curLang = () => { try { return getLang(); } catch { return 'en'; } };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _Y = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const basic = (C, o) => C.mat(new THREE.MeshBasicMaterial({ fog: true, ...o }));
const tex = (C, w, h, draw) => { const t = makeCanvasTexture(w, h, draw); if (t) C.texs.push(t); return t; };
/** a thin beam / rod between two world points, as a standalone mesh (runtime toggles / pulses it) */
function rod(C, a, b, r, color, o = {}) {
  const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, o.seg || 6, 1, true), basic(C, { color, transparent: true, opacity: o.opacity ?? 0.85, fog: !!o.fog, depthWrite: false, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending }));
  _v.set(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
  m.quaternion.copy(_q.setFromUnitVectors(_Y, _v));
  m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  C.own(m); C.add(m);
  return m;
}
/** lowest / highest ground within r of (x, z) */
function ground(C, x, z, r) {
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i < 9; i++) { const a = (i * TAU) / 8, y = i === 8 ? C.h(x, z) : C.h(x + Math.cos(a) * r, z + Math.sin(a) * r); if (y < lo) lo = y; if (y > hi) hi = y; }
  return { lo, hi, c: C.h(x, z) };
}
/** camera-relative drifting points (bubbles / marine snow): world-fixed, wrapped around the camera */
function motes(C, o) {
  const n = o.n, box = o.box, H = o.h;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), ph = new Float32Array(n), cc = new THREE.Color();
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * box; pos[i * 3 + 1] = Math.random() * H; pos[i * 3 + 2] = (Math.random() - 0.5) * box;
    cc.set(o.colors[i % o.colors.length]); col.set([cc.r, cc.g, cc.b], i * 3); ph[i] = Math.random() * TAU;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = C.mat(new THREE.PointsMaterial({ size: o.size, vertexColors: true, transparent: true, opacity: o.opacity, depthWrite: false, fog: true, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  const pts = C.add(C.own(new THREE.Points(g, m)));
  pts.frustumCulled = false; pts.userData.noCull = true;
  let lx = null, lz = null;
  C.updaters.push((dt, t, game) => {
    const cam = game?.camera?.position;
    if (!cam) return;
    pts.visible = !(cam.y < -100 || game.env?.indoor) && !(o.only && !o.only(game));
    if (!pts.visible) return;
    pts.position.set(cam.x, cam.y - H * 0.35, cam.z);
    const mx = lx == null ? 0 : cam.x - lx, mz = lx == null ? 0 : cam.z - lz;
    lx = cam.x; lz = cam.z;
    const half = box / 2, P = pos;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      P[k] += (o.vx + Math.sin(t * 0.8 + ph[i]) * o.sway) * dt - mx;
      P[k + 1] += o.vy * dt;
      P[k + 2] += (o.vz + Math.cos(t * 0.7 + ph[i]) * o.sway) * dt - mz;
      if (P[k] > half) P[k] -= box; else if (P[k] < -half) P[k] += box;
      if (P[k + 2] > half) P[k + 2] -= box; else if (P[k + 2] < -half) P[k + 2] += box;
      if (P[k + 1] > H) P[k + 1] -= H; else if (P[k + 1] < 0) P[k + 1] += H;
    }
    g.attributes.position.needsUpdate = true;
  });
  return pts;
}

// ================================================================================================ CLOUD-9
const CL = { rock: 0x8a90a8, rockD: 0x666c84, conc: 0xb8bccc, wood: 0x8a6a4a, woodD: 0x5a4632, rope: 0xd8c8a0, steel: 0x6c7488, dark: 0x2a2f3c, white: 0xf2f4fa };
const GL = { cyan: 0x40e8ff, amber: 0xffb040, green: 0x40ff90, red: 0xff3a3a, orange: 0xffa050 };
const DISH_TOP = 7.4;    // dish centre above the island base
const MAST_H = 17;

function drawConsole(c, W, H, i, lang) {
  c.fillStyle = '#06121c'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#40e8ff'; c.font = `bold 20px ${FONT}`; c.textAlign = 'center';
  c.fillText(tx('c9_scr_head', lang), W / 2, 26);
  c.fillStyle = '#ffb040'; c.font = `bold 44px ${FONT}`;
  c.fillText(String(i + 1) + ' / 3', W / 2, 78);
  c.fillStyle = '#8fb8c8'; c.font = `14px ${FONT}`;
  c.fillText(tx('c9_scr_hold', lang), W / 2, 104);
  c.strokeStyle = '#40e8ff'; c.lineWidth = 2; c.strokeRect(4, 4, W - 8, H - 8);
}

function buildCloud(C) {
  const { R, terrain } = C;
  const P = terrain.hook?.plan;
  if (!P) return;
  const lang = curLang();
  C.info.kind = CLOUD; C.info.plan = P; C.info.dish = []; C.info.pads = []; C.info.audio = []; C.info.mast = null;
  const K = new Kit(C, 0, 0, 0, 0);
  const reserve = (x, z, r) => { try { C.reserve?.(x, z, r); } catch { /* optional */ } };
  const puff = softPuffTexture(C);

  // ---- the cloud sea: a plane that follows the camera (fog colour, a little lighter) + puffs
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), basic(C, { color: 0xffffff }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -31; sea.frustumCulled = false; C.own(sea); C.add(sea);
  const puffs = [];
  if (puff) for (let i = 0; i < 46; i++) {
    const a = R.float(0, TAU), d = R.float(20, 230), s = R.float(26, 70);
    const sp = new THREE.Sprite(C.mat(new THREE.SpriteMaterial({ map: puff, color: 0xffffff, transparent: true, opacity: R.float(0.5, 0.85), depthWrite: false, fog: true })));
    sp.position.set(Math.cos(a) * d, -31 + R.float(0.5, 5), Math.sin(a) * d); sp.scale.set(s, s * 0.55, 1);
    C.add(sp); puffs.push(sp);
  }
  const tint = new THREE.Color();
  C.updaters.push((dt, t, game) => {
    const cam = game?.camera?.position, fog = game?.scene?.fog?.color;
    if (cam) sea.position.set(cam.x, -31, cam.z);
    if (fog) { tint.copy(fog).lerp(_white, 0.45); sea.material.color.copy(tint); for (const p of puffs) p.material.color.copy(fog).lerp(_white, 0.7); }
  });

  // ---- drifting rocks (visual only, far from every island)
  for (const r of P.rocks) K.ico(r.x, r.y, r.z, r.s, CL.rock, { sy: 0.7, detail: 0, ry: r.ry });

  // ---- rope bridges: one level collider deck per bridge, planks + posts + sagging ropes merged
  for (const L of P.links) {
    reserve((L.ax + L.bx) / 2, (L.az + L.bz) / 2, L.len / 2 + 2);
    const ux = Math.sin(L.yaw), uz = Math.cos(L.yaw), px = uz, pz = -ux;
    if (L.type === 'bridge') {
      const cx = (L.ax + L.bx) / 2, cz = (L.az + L.bz) / 2;
      C.addBox(cx, BASE - 0.15, cz, 2.6, 0.3, L.len, L.yaw, { kind: 'prop', id: 'c9_bridge' });
      const N = Math.max(2, Math.round(L.len / 0.85));
      for (let i = 0; i < N; i++) {
        const s = (i + 0.5) / N * L.len - L.len / 2;
        K.box(cx + ux * s, BASE - 0.1, cz + uz * s, 2.5, 0.12, 0.62, i % 5 === 3 ? CL.woodD : CL.wood, { ry: L.yaw + R.float(-0.03, 0.03) });
      }
      const posts = Math.max(2, Math.round(L.len / 3.2));
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i <= posts; i++) {
          const s = (i / posts - 0.5) * L.len;
          K.box(cx + ux * s + px * 1.3 * side, BASE, cz + uz * s + pz * 1.3 * side, 0.16, 1.15, 0.16, CL.woodD, { ry: L.yaw });
          if (i < posts) {   // the rope between two posts hangs: 5 short pieces on a parabola
            const s2 = ((i + 1) / posts - 0.5) * L.len, span = s2 - s, seg = 5;
            for (let q = 0; q < seg; q++) {
              const u0 = q / seg, u1 = (q + 1) / seg, sag = (u) => -0.34 * 4 * u * (1 - u);
              const y0 = BASE + 1.08 + sag(u0), y1 = BASE + 1.08 + sag(u1), sl = span / seg;
              const mx = cx + ux * (s + span * (u0 + u1) / 2) + px * 1.3 * side, mz = cz + uz * (s + span * (u0 + u1) / 2) + pz * 1.3 * side;
              K.box(mx, (y0 + y1) / 2 - 0.02, mz, 0.05, 0.05, Math.hypot(sl, y1 - y0) + 0.02, CL.rope, { ry: L.yaw, rx: -Math.atan2(y1 - y0, sl) });
            }
          }
        }
      }
      for (const [ex, ez, sg] of [[L.ax, L.az, 1], [L.bx, L.bz, -1]]) {   // anchor blocks + a lantern (the tell of the crossing)
        K.box(ex - ux * 0.3 * sg, BASE - 0.5, ez - uz * 0.3 * sg, 2.9, 0.9, 0.7, CL.conc, { ry: L.yaw });
        for (const side of [-1, 1]) K.ico(ex + px * 1.3 * side, BASE + 1.45, ez + pz * 1.3 * side, 0.15, GL.amber, { glow: true });
      }
      C.emitters.push({ pos: new THREE.Vector3(cx, BASE + 1.6, cz), color: 0xffc070, intensity: 0.9, distance: 12, flicker: 0.1, group: 'outdoor' });
    } else {
      for (const pd of [L.pa, L.pb]) {
        const gy = C.h(pd.x, pd.z), ty = C.h(pd.tx, pd.tz);
        reserve(pd.x, pd.z, 4);
        K.cyl(pd.x, gy - 0.2, pd.z, 2.1, 0.45, CL.steel, { seg: 10 });
        K.cyl(pd.x, gy + 0.25, pd.z, 1.75, 0.07, GL.cyan, { seg: 10, glow: true });
        const fx = Math.sin(pd.yaw), fz = Math.cos(pd.yaw);
        for (let k = 0; k < 3; k++) K.box(pd.x + fx * (0.3 + k * 0.5), gy + 0.3, pd.z + fz * (0.3 + k * 0.5), 0.9 - k * 0.2, 0.05, 0.16, GL.cyan, { ry: pd.yaw, glow: true });
        for (const s of [-1, 1]) { K.box(pd.x - fz * 2.2 * s, gy, pd.z + fx * 2.2 * s, 0.22, 1.8, 0.22, CL.dark, { ry: pd.yaw }); K.ico(pd.x - fz * 2.2 * s, gy + 1.95, pd.z + fx * 2.2 * s, 0.2, GL.cyan, { glow: true }); }
        const col = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 6, 10, 1, true), basic(C, { color: 0x60f0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        col.position.set(pd.x, gy + 3, pd.z); col.visible = false; C.own(col); C.add(col);
        C.info.pads.push({ id: C.info.pads.length, x: pd.x, y: gy, z: pd.z, tx: pd.tx, ty, tz: pd.tz, yaw: pd.yaw, col, dist: Math.hypot(pd.tx - pd.x, pd.tz - pd.z) });
      }
      C.emitters.push({ pos: new THREE.Vector3((L.pa.x + L.pb.x) / 2, BASE + 2, (L.pa.z + L.pb.z) / 2), color: 0x60e8ff, intensity: 0.7, distance: 10, flicker: 0, group: 'outdoor' });
    }
  }

  // ---- islands: ruined kiosks + rock clusters + rim lanterns; the dish islands get their relay
  const spots = [];
  for (const o of P.islands) {
    if (o.kind === 'fire') continue;
    const n = o.kind === 'dish' ? 1 : o.kind === 'ship' ? 2 : 2;
    for (let k = 0, g = 0; k < n && g < 30; g++) {
      const a = R.float(0, TAU), d = o.r * R.float(0.35, 0.62), x = o.x + Math.cos(a) * d, z = o.z + Math.sin(a) * d;
      if (Math.hypot(x, z) < 16 || Math.hypot(x - (C.plan.entrance?.x || 0), z - (C.plan.entrance?.z || 0)) < 14) continue;
      if (o.kind === 'dish' && Math.hypot(x - o.x, z - o.z) < 8) continue;
      if (C.avoid?.(x, z, -1) && o.kind !== 'ship' && o.kind !== 'door') continue;
      if (P.dishes.some((q) => Math.hypot(x - q.console.x, z - q.console.z) < 4)) continue;
      k++;
      const gy = C.h(x, z), yaw = R.float(0, TAU), tilt = R.float(-0.12, 0.12);
      K.box(x, gy - 0.2, z, 1.7, 2.5, 1.15, CL.steel, { ry: yaw, solid: true });
      K.box(x, gy + 2.3, z, 1.9, 0.2, 1.3, CL.dark, { ry: yaw, rz: tilt });
      const sx = x + Math.sin(yaw) * 0.6, sz = z + Math.cos(yaw) * 0.6;
      K.box(sx, gy + 1.0, sz, 1.1, 0.75, 0.04, R.chance(0.5) ? 0x123048 : 0x0c3a52, { ry: yaw, glow: true });
      for (let q = 0; q < 3; q++) K.cyl(x + R.float(-1.2, 1.2), gy - 0.1, z + R.float(-1.2, 1.2), 0.05, R.float(0.8, 2), CL.dark, { seg: 4, rx: R.float(-1, 1), rz: R.float(-1, 1) });
      spots.push({ x: x + Math.sin(yaw) * 1.5, z: z + Math.cos(yaw) * 1.5 });
      reserve(x, z, 3);
    }
    for (let k = 0; k < 3; k++) {   // rock clusters near the rim: cover from the wind, and a reason to look at the horizon
      const a = R.float(0, TAU), d = o.r * R.float(0.72, 0.84), x = o.x + Math.cos(a) * d, z = o.z + Math.sin(a) * d, gy = C.h(x, z);
      if (P.links.some((L) => L.type === 'bridge' && Math.hypot(x - L.ax, z - L.az) < 5.5 || Math.hypot(x - L.bx, z - L.bz) < 5.5)) continue;
      if (P.links.some((L) => L.type === 'pad' && (Math.hypot(x - L.pa.x, z - L.pa.z) < 5 || Math.hypot(x - L.pb.x, z - L.pb.z) < 5))) continue;
      if (Math.hypot(x, z) < 16 || Math.hypot(x - (C.plan.entrance?.x || 0), z - (C.plan.entrance?.z || 0)) < 14) continue;
      const s = R.float(1.2, 2.2);
      K.cyl(x, gy - 0.5, z, s, R.float(2.5, 5), CL.rock, { rTop: s * 0.35, seg: 6, solid: true });
      K.cyl(x + R.float(-1, 1), gy - 0.5, z + R.float(-1, 1), s * 0.6, R.float(1.2, 2.6), CL.rockD, { rTop: s * 0.2, seg: 5 });
    }
  }
  spots.slice(0, 3).forEach((s) => C.scrapSpots.push(s));

  // ---- relay dishes (3) + consoles + beams; the uplink mast on the ship island
  const yTop = (i) => C.h(P.dishes[i].x, P.dishes[i].z) + DISH_TOP;
  const mastBase = C.h(P.mast.x, P.mast.z);
  const mastTop = { x: P.mast.x, y: mastBase + MAST_H, z: P.mast.z };
  P.dishes.forEach((D, i) => {
    const gy = C.h(D.x, D.z);
    reserve(D.x, D.z, 6); reserve(D.console.x, D.console.z, 3);
    K.cyl(D.x, gy - 0.3, D.z, 2.6, 1.3, CL.conc, { seg: 10, solid: true });
    K.cyl(D.x, gy + 1.0, D.z, 0.4, DISH_TOP - 1.8, CL.steel, { seg: 6 });
    for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + 0.4; K.box(D.x + Math.cos(a) * 1.8, gy + 1.0, D.z + Math.sin(a) * 1.8, 0.2, 0.9, 0.2, CL.dark, { ry: -a, rz: 0.4 }); }
    // the dish itself (rotates)
    const grp = new THREE.Group(); grp.position.set(D.x, gy + DISH_TOP, D.z);
    const elev = 0.62, RB = 3.1;
    const fdir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));   // the dish looks along +z, tilted up; its vertex sits on the mast top
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(RB, 14, 6, 0, TAU, Math.PI - 0.8, 0.8), C.mat(new THREE.MeshLambertMaterial({ color: CL.white, side: THREE.DoubleSide, flatShading: true })));
    bowl.rotation.x = Math.PI / 2 - elev; bowl.position.copy(fdir).multiplyScalar(RB); C.own(bowl); grp.add(bowl);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(RB * Math.sin(0.8), 0.09, 4, 16), C.mat(new THREE.MeshLambertMaterial({ color: CL.steel })));
    rim.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fdir); rim.position.copy(fdir).multiplyScalar(RB * (1 - Math.cos(0.8))); C.own(rim); grp.add(rim);
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.9, 5), C.mat(new THREE.MeshLambertMaterial({ color: CL.dark })));
    horn.position.copy(fdir).multiplyScalar(0.95); horn.quaternion.setFromUnitVectors(_Y, fdir); C.own(horn); grp.add(horn);
    const lampMat = basic(C, { color: GL.amber, fog: false });
    const lamp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), lampMat); lamp.position.copy(fdir).multiplyScalar(1.95); C.own(lamp); grp.add(lamp);
    C.add(grp);
    // base ring (tell: amber = still off target, green = locked)
    const ringMat = basic(C, { color: GL.amber, fog: false });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.75, 0.09, 16), ringMat); ring.position.set(D.x, gy + 1.02, D.z); C.own(ring); C.add(ring);
    // console
    const cy = D.console.yaw, cgy = C.h(D.console.x, D.console.z);
    K.box(D.console.x, cgy - 0.2, D.console.z, 1.5, 1.35, 0.85, CL.steel, { ry: cy, solid: true });
    K.box(D.console.x, cgy + 1.15, D.console.z, 1.6, 0.14, 1.0, CL.dark, { ry: cy, rx: 0.5 });
    const scr = tex(C, 192, 128, (c, W, H) => drawConsole(c, W, H, i, lang));
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.62), scr ? basic(C, { map: scr, side: THREE.DoubleSide, fog: false }) : basic(C, { color: 0x103040, fog: false }));
    sm.position.set(D.console.x + Math.sin(cy) * 0.42, cgy + 1.05, D.console.z + Math.cos(cy) * 0.42); sm.rotation.set(-0.5, cy, 0, 'YXZ'); C.own(sm); C.add(sm);
    const cLamp = basic(C, { color: GL.red, fog: false });
    const cl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), cLamp); cl.position.set(D.console.x, cgy + 1.6, D.console.z); C.own(cl); C.add(cl);
    C.emitters.push({ pos: new THREE.Vector3(D.console.x, cgy + 1.8, D.console.z), color: 0x60e8ff, intensity: 0.9, distance: 11, flicker: 0.05, group: 'outdoor' });
    // beam to the next dish focus / the mast top (hidden until the dish locks)
    const to = i < 2 ? { x: P.dishes[i + 1].x, y: yTop(i + 1), z: P.dishes[i + 1].z } : mastTop;
    const beam = rod(C, { x: D.x, y: gy + DISH_TOP, z: D.z }, to, 0.16, 0x60f0ff, { opacity: 0.8, add: true });
    beam.visible = false;
    const h = {
      i, x: D.x, y: gy, z: D.z, top: gy + DISH_TOP, grp, lamp, ring, cl, beam, console: { x: D.console.x, y: cgy + 1.2, z: D.console.z }, locked: false, ang: D.start,
      setAngle(deg) { this.ang = deg; grp.rotation.y = (deg * Math.PI) / 180; },
      setLock(v) {
        this.locked = !!v; beam.visible = !!v;
        lampMat.color.setHex(v ? GL.green : GL.amber); ringMat.color.setHex(v ? GL.green : GL.amber); cLamp.color.setHex(v ? GL.green : GL.red);
      },
    };
    h.setAngle(D.start);
    C.info.dish.push(h);
  });
  // uplink mast (ship island): lattice + a ring that lights when the whole chain is up
  {
    const m = P.mast, gy = mastBase;
    reserve(m.x, m.z, 5);
    K.cyl(m.x, gy - 0.3, m.z, 1.6, 1.0, CL.conc, { seg: 8, solid: true });
    for (let k = 0; k < 3; k++) { const a = k * TAU / 3; K.cyl(m.x + Math.cos(a) * 0.9, gy + 0.6, m.z + Math.sin(a) * 0.9, 0.12, MAST_H - 1, CL.steel, { seg: 4, rTop: 0.07 }); }
    for (let k = 1; k < 6; k++) K.cyl(m.x, gy + k * 2.6, m.z, 1.0 - k * 0.07, 0.1, CL.dark, { seg: 3 });
    const ringMat = basic(C, { color: 0x304050, fog: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.14, 4, 14), ringMat); ring.rotation.x = Math.PI / 2; ring.position.set(m.x, gy + MAST_H, m.z); C.own(ring); C.add(ring);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.14, 9, 5), ringMat); spire.position.set(m.x, gy + MAST_H + 4.5, m.z); C.own(spire); C.add(spire);
    C.emitters.push({ pos: new THREE.Vector3(m.x, gy + 3, m.z), color: 0xff5050, intensity: 0.8, distance: 12, flicker: 0.3, group: 'outdoor' });
    C.info.mast = { x: m.x, y: gy, z: m.z, top: mastTop, ring, setOn(v) { ringMat.color.setHex(v ? GL.green : 0x304050); } };
  }
  K.finish();

  // ---- wind streaks (runtime feeds game.moons12.wind = { tele, k, dx, dz }): lines that stream along the gust; visible from the telegraph on
  {
    const n = 240, box = 60, H = 26, pos = new Float32Array(n * 6), px = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { px[i * 3] = (Math.random() - 0.5) * box; px[i * 3 + 1] = Math.random() * H; px[i * 3 + 2] = (Math.random() - 0.5) * box; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lines = C.add(C.own(new THREE.LineSegments(g, C.mat(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false })))));
    lines.frustumCulled = false; lines.userData.noCull = true;
    let lx = null, lz = null;
    C.updaters.push((dt, t, game) => {
      const cam = game?.camera?.position, w = game?.moons12?.wind;
      if (!cam) return;
      const lvl = w ? Math.max(w.k, w.tele * 0.4) : 0;
      lines.visible = lvl > 0.02 && !game.env?.indoor;
      lines.material.opacity = clamp(lvl * 1.1, 0, 0.75);
      const mx = lx == null ? 0 : cam.x - lx, mz = lx == null ? 0 : cam.z - lz; lx = cam.x; lz = cam.z;
      if (!lines.visible) return;
      lines.position.set(cam.x, cam.y - H * 0.4, cam.z);
      const sp = 6 + 34 * lvl, half = box / 2, len = 0.05 + 0.04 * lvl;
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        px[k] += w.dx * sp * dt - mx; px[k + 2] += w.dz * sp * dt - mz;
        if (px[k] > half) px[k] -= box; else if (px[k] < -half) px[k] += box;
        if (px[k + 2] > half) px[k + 2] -= box; else if (px[k + 2] < -half) px[k + 2] += box;
        const o = i * 6;
        pos[o] = px[k]; pos[o + 1] = px[k + 1]; pos[o + 2] = px[k + 2];
        pos[o + 3] = px[k] - w.dx * sp * len * 3; pos[o + 4] = px[k + 1]; pos[o + 5] = px[k + 2] - w.dz * sp * len * 3;
      }
      g.attributes.position.needsUpdate = true;
    });
  }
  // ---- the relay blinks (ambience): a slow amber pulse on every unlocked dish lamp
  C.updaters.push((dt, t) => { for (const h of C.info.dish) if (!h.locked) h.lamp.visible = h.cl.visible = Math.sin(t * 5 + h.i) > -0.2; else h.lamp.visible = h.cl.visible = true; });
  for (const D of P.dishes) C.info.audio.push({ kind: 'hum', x: D.x, y: C.h(D.x, D.z) + 3, z: D.z, r: 30 });
}
const _white = new THREE.Color(0xffffff);

// ================================================================================================ DEEP CABLE
const DC = { hull: 0x2a3c44, hullD: 0x1a2830, rack: 0x33464e, steel: 0x50666e, glass: 0x66d8d0, kelp: 0x0e2c30, kelpB: 0x1a4a44, curb: 0x4a606a, dark: 0x0c1a20 };
const DG = { teal: 0x30e0c0, green: 0x40ff90, red: 0xff3040, amber: 0xffb040, cyan: 0x40e8ff, orange: 0xff8030 };

function buildCable(C) {
  const { R, terrain } = C;
  const P = terrain.hook?.plan;
  if (!P) return;
  C.info.kind = CABLE; C.info.plan = P; C.info.wrecks = []; C.info.domes = []; C.info.audio = [];
  const K = new Kit(C, 0, 0, 0, 0);
  const reserve = (x, z, r) => { try { C.reserve?.(x, z, r); } catch { /* optional */ } };

  // ---- kelp of cables: bundles of thin dark strands, a few with a live tip
  for (const k of P.kelp) {
    const gy = C.h(k.x, k.z);
    for (let i = 0; i < k.n; i++) {
      const a = k.ry + (i * TAU) / k.n, off = R.float(0.1, 0.7), h = k.h * R.float(0.7, 1.1);
      K.cyl(k.x + Math.cos(a) * off, gy - 0.3, k.z + Math.sin(a) * off, 0.07, h, R.chance(0.5) ? DC.kelp : DC.kelpB, { rTop: 0.03, seg: 4, rx: R.float(-0.22, 0.22), rz: R.float(-0.22, 0.22) });
      if (R.chance(0.3)) K.ico(k.x + Math.cos(a) * off, gy + h * 0.96, k.z + Math.sin(a) * off, 0.1, R.chance(0.5) ? DG.teal : DG.cyan, { glow: true });
    }
  }

  // ---- air domes: glass hemisphere + ribs + an airlock arch + a green pole (the tell: safe air) + a shield hum
  const glass = C.mat(new THREE.MeshBasicMaterial({ color: DC.glass, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, fog: true }));
  const ribMat = C.mat(new THREE.MeshLambertMaterial({ color: DC.steel }));
  for (const d of P.domes) {
    const gy = BASE;
    reserve(d.x, d.z, d.r + 4);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(d.r, 18, 8, 0, TAU, 0, Math.PI / 2), glass); shell.position.set(d.x, gy, d.z); C.own(shell); C.add(shell);
    for (let k = 0; k < 2; k++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(d.r, 0.12, 4, 20, Math.PI), ribMat); rib.position.set(d.x, gy, d.z); rib.rotation.y = (k * Math.PI) / 2 + 0.3; C.own(rib); C.add(rib); }
    const eq = new THREE.Mesh(new THREE.TorusGeometry(d.r, 0.16, 4, 24), ribMat); eq.rotation.x = Math.PI / 2; eq.position.set(d.x, gy + 0.08, d.z); C.own(eq); C.add(eq);
    K.cyl(d.x, gy - 0.4, d.z, 0.28, d.r + 2.6, DC.steel, { seg: 6 });                       // pole
    K.ico(d.x, gy + d.r + 2.9, d.z, 0.42, DG.green, { glow: true });                        // green tell at the top
    K.cyl(d.x, gy + d.r + 0.2, d.z, 0.34, 0.12, DG.green, { seg: 6, glow: true });
    for (let k = 0; k < 3; k++) { const a = R.float(0, TAU), rr = R.float(2.2, d.r - 2); K.ico(d.x + Math.cos(a) * rr, gy + 2.6, d.z + Math.sin(a) * rr, 0.16, 0xc8fff4, { glow: true }); K.box(d.x + Math.cos(a) * rr, gy, d.z + Math.sin(a) * rr, 1.6, 0.5, 0.5, DC.curb, { ry: a }); }
    // airlock arches toward each tunnel that ends here
    for (const T of P.tunnels) for (const [ex, ez, ox, oz] of [[T.ax, T.az, T.bx, T.bz], [T.bx, T.bz, T.ax, T.az]]) {
      if (Math.hypot(ex - d.x, ez - d.z) > d.r + 0.6) continue;
      const dx = ox - ex, dz = oz - ez, dl = Math.hypot(dx, dz), ux = dx / dl, uz = dz / dl;
      const yaw = Math.atan2(ux, uz);
      for (const s of [-1, 1]) K.box(ex - uz * 2.7 * s, gy, ez + ux * 2.7 * s, 0.4, 3.6, 0.4, DC.steel, { ry: yaw });
      K.box(ex, gy + 3.5, ez, 5.8, 0.4, 0.4, DC.steel, { ry: yaw });
      K.box(ex + ux * 0.1, gy + 3.2, ez + uz * 0.1, 4.6, 0.12, 0.12, DG.green, { ry: yaw, glow: true });
    }
    C.emitters.push({ pos: new THREE.Vector3(d.x, gy + 3.2, d.z), color: 0x9ff8e8, intensity: 1.1, distance: 18, flicker: 0.04, group: 'outdoor' });
    C.info.domes.push({ id: d.id, x: d.x, y: gy, z: d.z, r: d.r });
    if (d.kind === 'wreck') C.scrapSpots.push({ x: d.x + 2.5, z: d.z + 2 });
    C.info.audio.push({ kind: 'hum', x: d.x, y: gy + 2, z: d.z, r: 26 });
  }
  C.scrapSpots.push({ x: P.hub.x - 3, z: P.hub.z + 3 });

  // ---- glass tunnels (two pieces per tunnel around the breach): tube + running lights; the breach ends spark
  const tubeMat = C.mat(new THREE.MeshBasicMaterial({ color: DC.glass, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, fog: true }));
  for (const T of P.tunnels) {
    const dx = T.bx - T.ax, dz = T.bz - T.az, ux = dx / T.len, uz = dz / T.len, px = uz, pz = -ux;
    const at = (u) => ({ x: T.ax + dx * u, z: T.az + dz * u });
    const BR = T.breach;
    for (const [u0, u1] of BR ? [[0, BR[0]], [BR[1], 1]] : [[0, 1]]) {
      const L = (u1 - u0) * T.len; if (L < 1) continue;
      const m = at((u0 + u1) / 2);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, L, 12, 1, true), tubeMat);
      tube.quaternion.setFromUnitVectors(_Y, _v.set(ux, 0, uz)); tube.position.set(m.x, BASE + 0.6, m.z); C.own(tube); C.add(tube);
      const n = Math.max(1, Math.round(L / 5));
      for (let i = 0; i < n; i++) {
        const q = at(u0 + ((i + 0.5) / n) * (u1 - u0));
        for (const s of [-1, 1]) K.box(q.x + px * 2.15 * s, BASE, q.z + pz * 2.15 * s, 0.14, 0.12, 2.4, DG.teal, { ry: T.yaw, glow: true });
        K.box(q.x, BASE + 3.0, q.z, 5.2, 0.1, 0.3, DC.steel, { ry: T.yaw + Math.PI / 2 });    // rib
      }
    }
    for (const u of BR || []) {   // breach ends: shards, sparks, hazard posts
      const q = at(u), sg = u === BR[0] ? 1 : -1;
      for (let k = 0; k < 4; k++) K.box(q.x + px * R.float(-2, 2), BASE, q.z + pz * R.float(-2, 2), 0.1, R.float(1.2, 2.6), 0.6, 0x9ee8e0, { ry: T.yaw + R.float(-0.4, 0.4), rz: R.float(-0.5, 0.5) });
      K.ico(q.x + ux * 0.5 * sg, BASE + 1.4, q.z + uz * 0.5 * sg, 0.24, DG.orange, { glow: true });
      for (const s of [-1, 1]) K.box(q.x + px * 2.6 * s + ux * 0.8 * sg, BASE, q.z + pz * 2.6 * s + uz * 0.8 * sg, 0.3, 1.3, 0.3, DG.amber, { ry: T.yaw, glow: true });
      C.emitters.push({ pos: new THREE.Vector3(q.x, BASE + 1.6, q.z), color: 0xff8a40, intensity: 0.8, distance: 10, flicker: 0.6, group: 'outdoor' });
    }
    if (BR) C.info.audio.push({ kind: 'spark', x: T.ax + dx * (BR[0] + BR[1]) / 2, y: BASE + 1.5, z: T.az + dz * (BR[0] + BR[1]) / 2, r: 24 });
  }

  // ---- dead server hulks: a lit bay on the hub side with a core cradle (the runtime hides the column when the core is gone)
  for (const w of P.wrecks) {
    const g = ground(C, w.x, w.z, w.len * 0.3), y0 = g.lo - 0.6, W = new Kit(C, w.x, y0, w.z, w.yaw), len = w.len, wid = w.wid, hei = w.hei;
    reserve(w.x, w.z, len * 0.6);
    const hp = () => (R.chance(0.5) ? DC.hull : DC.hullD);
    W.box(0, 0, -4, wid, hei, len - 8, DC.hull, { solid: true });                                   // stern + body
    W.box(0, hei, -4, wid * 0.7, 0.9, len - 12, DC.hullD);                                         // deck plate
    for (const s of [-1, 1]) W.box((wid / 2 - 0.7) * s, 0, len / 2 - 4, 1.4, hei * 0.8, 8, DC.hull, { solid: true });   // bay walls
    W.box(0, hei * 0.8, len / 2 - 4, wid, 0.9, 8, DC.hullD, { solid: true });                       // bay roof
    for (const s of [-1, 1]) W.box((wid / 2 - 1.5) * s, 0, len / 2, 0.16, hei * 0.8, 0.16, DG.cyan, { glow: true });   // lit mouth
    W.box(0, hei * 0.8 - 0.2, len / 2, wid - 3, 0.16, 0.16, DG.cyan, { glow: true });
    W.cyl(0, 0, len / 2 - 4, 1.3, 0.5, DC.steel, { seg: 10 });                                       // cradle
    W.cyl(0, 0.5, len / 2 - 4, 1.05, 0.06, DG.cyan, { seg: 10, glow: true });
    for (let k = 0; k < 26; k++) {   // racks and blades poking out of the deck, broken masts
      const x = R.float(-wid * 0.34, wid * 0.34), z = R.float(-len / 2 + 3, len / 2 - 12);
      W.box(x, hei + 0.9, z, R.float(0.4, 1.4), R.float(1, 4), R.float(0.3, 1.0), R.chance(0.6) ? DC.rack : hp(), { ry: R.float(0, TAU), rx: R.float(-0.3, 0.3), rz: R.float(-0.3, 0.3) });
    }
    for (let k = 0; k < 90; k++) {   // dying LEDs on both flanks
      const s = R.chance(0.5) ? 1 : -1, z = R.float(-len / 2 + 1, len / 2 - 9), y = R.float(hei * 0.25, hei * 0.9);
      W.box((wid / 2 + 0.06) * s, y, z, 0.1, 0.25, 0.25, R.pick([DG.teal, DG.teal, DG.red, DG.amber]), { glow: true });
    }
    for (let k = 0; k < 10; k++) { const s = R.chance(0.5) ? 1 : -1, x = (wid / 2 - 0.3) * s, z = R.float(-len / 2, len / 2 - 10); W.cyl(x, 0, z, 0.08, hei * R.float(0.7, 1.1), DC.kelp, { rTop: 0.05, seg: 4, rz: 0.35 * s, rx: R.float(-0.2, 0.2) }); }   // cables hanging to the mud
    W.box(0, -0.6, -len / 2 + 2, wid * 0.9, hei * 0.5, 6, DC.hullD, { rz: 0.18, ry: 0.3 });        // cracked stern
    W.finish();
    const cx = w.core.x, cz = w.core.z;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 16, 6, 1, true), basic(C, { color: 0x40e8ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    col.position.set(cx, y0 + 8.5, cz); C.own(col); C.add(col);
    C.emitters.push({ pos: new THREE.Vector3(cx, y0 + hei * 0.55, cz), color: 0x40e8ff, intensity: 1.3, distance: 16, flicker: 0.05, group: 'outdoor' });
    C.info.wrecks.push({ id: w.id, x: w.x, z: w.z, y: y0, core: { x: cx, y: y0 + 0.9, z: cz }, col });
    C.info.audio.push({ kind: 'groan', x: w.x, y: y0 + 4, z: w.z, r: 40 });
  }
  K.finish();

  // ---- bubbles + marine snow (local to the camera, only while the player is out in the water: the runtime sets game.moons12.wet)
  const wet = (game) => !!game?.moons12?.wet;
  motes(C, { n: 200, box: 40, h: 18, colors: [0xbff4f0, 0x8ee0e0], size: 0.13, opacity: 0.55, additive: false, vx: 0, vy: 1.1, vz: 0, sway: 0.35, only: wet });
  motes(C, { n: 380, box: 46, h: 20, colors: [0x9ad8d4, 0x6ab8b8], size: 0.09, opacity: 0.7, additive: false, vx: 0.25, vy: -0.12, vz: 0.1, sway: 0.2, only: wet });
  let sndT = 8;
  C.updaters.push((dt, t, game) => {
    const cam = game?.camera?.position;
    if (!cam || game.env?.indoor || game.player?.indoor) return;
    sndT -= dt; if (sndT > 0) return;
    sndT = 12 + Math.random() * 20;
    const near = C.info.audio.filter((a) => (cam.x - a.x) ** 2 + (cam.z - a.z) ** 2 < a.r * a.r * 1.6);
    if (!near.length) return;
    const a = near[Math.floor(Math.random() * near.length)], au = game.audio;
    _v.set(a.x, a.y, a.z);
    try {
      if (a.kind === 'groan' && au?.has?.('pipe_groan')) au.at('pipe_groan', _v.clone(), 0.55);
      else if (a.kind === 'spark' && au?.has?.('spark')) au.at('spark', _v.clone(), 0.5);
      else if (a.kind === 'hum' && au?.has?.('hdd_click')) au.at('hdd_click', _v.clone(), 0.35);
    } catch { /* audio optional */ }
  });
}

registerDecor('cloud9', buildCloud);
registerDecor('dcable', buildCable);
