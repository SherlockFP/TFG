// HORROR module - trap VISUALS (client, every peer) + the wall PANEL. Emissive / basic materials only: no THREE lights are ever added.
// A TrapView is driven by the replicated state (s, and the local time the state was entered). The host runs the state machine and the damage (horror.js).
import * as THREE from 'three';
import { TRAPS, laserFrac } from './horror_core.js';
import { t } from '../core/i18n.js';
import { sigHex } from '../core/a11y_core.js';   // [a11y] colour-blind palette

const basic = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, transparent: o.op != null, opacity: o.op ?? 1, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !o.add && o.op == null, side: o.side ?? THREE.FrontSide, fog: o.fog !== false });
const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const STATE_COLORS = { idle: '#7a8088', armed: '#43d17a', tele: '#ffb02e', strike: '#ff4a3a', cool: '#ffb02e', spent: '#7a8088' };

export class TrapView {
  /** zone = { cx, cz, axis, len, wid, y }; ceilH = height of the corridor; panel = { x, y, z, nx, nz } (wall normal into the corridor) */
  constructor(desc, zone, ceilH, panel, seed = 1) {
    this.desc = desc; this.zone = zone; this.ceilH = ceilH; this.type = desc.type; this.T = TRAPS[desc.type];
    this.state = 'idle'; this.t0 = 0; this.clock = 0; this.charges = 0; this.price = this.T.price; this.left = 0;
    this.group = new THREE.Group(); this.group.name = 'hr_trap_' + desc.type;
    this.disposables = [];
    this.seed = seed;
    const z = zone;
    this.root = new THREE.Group();
    this.root.position.set(z.cx, z.y, z.cz);
    this.root.rotation.y = z.axis === 'x' ? 0 : -Math.PI / 2;   // local +x = along the corridor, towards +world axis
    this.group.add(this.root);
    this.build();
    this.buildPanel(panel);
  }
  mk(geo, mat) { this.disposables.push(geo); if (!this.disposables.includes(mat)) this.disposables.push(mat); return new THREE.Mesh(geo, mat); }
  box(parent, mat, sx, sy, sz, x, y, z) { const m = this.mk(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(x, y, z); parent.add(m); return m; }

  build() {
    const { len, wid } = this.zone, H = this.ceilH, hl = len / 2, hw = wid / 2;
    const R = this.root;
    const housing = lam(0x2a2d33), led = basic(sigHex('ok', '#43d17a')), ledR = basic(sigHex('laser', '#ff3a2a'));
    this.led = led; this.ledMats = { led, ledR };
    this.parts = {};
    const P = this.parts;
    if (this.type === 'laser') {
      // emitter housings on both side walls at both ends + a status LED strip
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { this.box(R, housing, 0.16, H - 0.1, 0.2, sx * hl, (H - 0.1) / 2 + 0.05, sz * (hw - 0.05)); }
      this.box(R, led, 0.06, 0.06, 0.06, -hl, 1.3, -hw + 0.15); this.box(R, led, 0.06, 0.06, 0.06, hl, 1.3, hw - 0.15);
      const beamM = basic(sigHex('laser'), { add: true, op: 0.9 }); P.beamM = beamM;
      P.wall = new THREE.Group(); R.add(P.wall);
      const bars = 9;
      for (let i = 0; i < bars; i++) this.box(P.wall, beamM, 0.05, 0.05, wid - 0.3, 0, 0.25 + i * ((H - 0.5) / (bars - 1)), 0);
      for (let i = 0; i < 6; i++) this.box(P.wall, beamM, 0.05, H - 0.4, 0.05, 0, (H - 0.4) / 2 + 0.2, -hw + 0.4 + i * ((wid - 0.8) / 5));
      P.wall.visible = false;
      // faint standing grid at the far end while armed (telegraph of the danger)
      const dimM = basic(sigHex('laserDim'), { add: true, op: 0.25 }); P.dimM = dimM;
      P.grid = new THREE.Group(); R.add(P.grid);
      for (let i = 0; i < 4; i++) this.box(P.grid, dimM, 0.03, 0.03, wid - 0.4, hl - 0.05, 0.6 + i * 0.7, 0);
      P.grid.visible = false;
      P.cut = this.mk(new THREE.PlaneGeometry(wid, H), basic(0xffffff, { add: true, op: 0, side: THREE.DoubleSide })); P.cut.rotation.y = Math.PI / 2; P.cut.position.set(hl, H / 2, 0); R.add(P.cut);
    } else if (this.type === 'crusher') {
      const slabM = lam(0x3a3d44), stripe = basic(0xd6b520);
      P.slab = new THREE.Group(); R.add(P.slab);
      this.box(P.slab, slabM, len - 0.3, 0.42, wid - 0.3, 0, 0, 0);
      for (let i = 0; i < 7; i++) this.box(P.slab, i % 2 ? basic(0x1a1a1a) : stripe, 0.32, 0.03, wid - 0.34, -hl + 0.4 + i * ((len - 0.8) / 6), -0.22, 0);
      P.slab.position.y = H - 0.22;
      this.box(R, housing, len, 0.12, wid, 0, H - 0.06, 0);   // the ceiling frame the slab hides in
      P.shadow = this.mk(new THREE.PlaneGeometry(len - 0.4, wid - 0.4), basic(0xff2a1a, { op: 0, add: true, side: THREE.DoubleSide })); P.shadow.rotation.x = -Math.PI / 2; P.shadow.position.y = 0.03; R.add(P.shadow);
      P.dust = this.mk(new THREE.PlaneGeometry(len, wid), basic(0xc8bca8, { op: 0, add: true, side: THREE.DoubleSide })); P.dust.rotation.x = -Math.PI / 2; P.dust.position.y = 0.1; R.add(P.dust);
    } else if (this.type === 'spikes') {
      const plate = lam(0x33363b), hole = basic(0x0a0a0a);
      const nx = Math.max(2, Math.floor(len / 0.7)), nz = 5;
      this.box(R, plate, len - 0.2, 0.03, wid - 0.4, 0, 0.02, 0);
      const cone = new THREE.ConeGeometry(0.075, 0.9, 5); this.disposables.push(cone);
      const sm = new THREE.MeshLambertMaterial({ color: 0xa8a8a0, flatShading: true }); this.disposables.push(sm);
      P.inst = new THREE.InstancedMesh(cone, sm, nx * nz); P.n = nx * nz; P.nx = nx; P.nz = nz;
      P.inst.frustumCulled = false; R.add(P.inst);
      P.pos = [];
      for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) { const x = -hl + 0.5 + i * ((len - 1) / Math.max(1, nx - 1)), zz = -hw + 0.6 + k * ((wid - 1.2) / (nz - 1)); P.pos.push([x, zz]); this.box(R, hole, 0.14, 0.005, 0.14, x, 0.04, zz); }
      P.m = new THREE.Matrix4(); this.setSpikes(0);
    } else if (this.type === 'electric') {
      const plate = lam(0x4a4030);
      this.box(R, plate, len - 0.1, 0.03, wid - 0.3, 0, 0.02, 0);
      for (let i = 0; i < 9; i++) this.box(R, i % 2 ? basic(0x1a1a1a) : basic(0xd6b520), 0.3, 0.032, wid - 0.34, -hl + 0.3 + i * ((len - 0.6) / 8), 0.025, 0);
      P.glow = this.mk(new THREE.PlaneGeometry(len - 0.2, wid - 0.4), basic(0x6ac8ff, { add: true, op: 0, side: THREE.DoubleSide })); P.glow.rotation.x = -Math.PI / 2; P.glow.position.y = 0.06; R.add(P.glow);
      P.arcs = new THREE.Group(); R.add(P.arcs);
      const arcM = basic(0xc8f0ff, { add: true, op: 0.95 }); P.arcM = arcM;
      for (let i = 0; i < 6; i++) { const a = this.box(P.arcs, arcM, 0.04, 0.04, 1.2, 0, 0.3, 0); a.userData.k = i; }
      P.arcs.visible = false;
      for (const sz of [-1, 1]) this.box(R, housing, 0.4, 0.5, 0.25, sz * hl * 0, 0.25, sz * (hw - 0.05));   // terminals on the side walls
    } else if (this.type === 'flame') {
      P.fl = [];
      const nozM = lam(0x50403a);
      const n = Math.max(2, Math.floor(len / 1.6));
      const flameM = basic(0xff8a2a, { add: true, op: 0.8 }), coreM = basic(0xffe08a, { add: true, op: 0.85 });
      const cone = new THREE.ConeGeometry(0.28, 1, 6); this.disposables.push(cone);
      for (const sz of [-1, 1]) for (let i = 0; i < n; i++) {
        const x = -hl + 0.6 + i * ((len - 1.2) / Math.max(1, n - 1));
        this.box(R, nozM, 0.34, 0.34, 0.3, x, 0.55, sz * (hw - 0.06));
        const f = new THREE.Mesh(cone, flameM); f.position.set(x, 0.55, sz * (hw - 0.4)); f.rotation.x = sz * Math.PI / 2 * 0.0; f.visible = false; f.userData.sz = sz; f.userData.x = x; R.add(f);
        const c2 = new THREE.Mesh(cone, coreM); c2.scale.set(0.5, 0.7, 0.5); c2.position.copy(f.position); c2.visible = false; c2.userData = { sz, x, core: true }; R.add(c2);
        P.fl.push(f, c2);
        const pilot = this.box(R, basic(0xff7a1a), 0.05, 0.05, 0.05, x, 0.62, sz * (hw - 0.2)); pilot.userData.pilot = true; P.pilots = P.pilots || []; P.pilots.push(pilot);
      }
      this.disposables.push(flameM, coreM);
      P.haze = this.mk(new THREE.PlaneGeometry(len, wid), basic(0xff8a3a, { add: true, op: 0, side: THREE.DoubleSide })); P.haze.rotation.x = Math.PI / 2; P.haze.position.y = H - 0.15; R.add(P.haze);
    }
  }
  setSpikes(k) {
    const P = this.parts; if (!P.inst) return;
    for (let i = 0; i < P.n; i++) {
      const [x, z] = P.pos[i];
      const wob = k > 0 && k < 1 ? (Math.sin(i * 12.9) * 0.5 + 0.5) * 0.12 : 0;
      const h = clamp(k + wob * (k > 0.5 ? -1 : 1), 0, 1);
      P.m.makeScale(1, Math.max(0.01, h), 1); P.m.setPosition(x, 0.04 + 0.45 * h, z);
      P.inst.setMatrixAt(i, P.m);
    }
    P.inst.instanceMatrix.needsUpdate = true;
  }
  /** state change from the host (or local prediction) */
  setState(s, c = 0, left = 0, price = null) {
    if (s !== this.state) { this.state = s; this.t0 = this.clock; }
    this.charges = c; this.left = left;
    if (price != null) this.price = price;
    this.panelDirty = true;
  }
  update(dt, camPos) {
    this.clock += dt;
    const P = this.parts, T = this.T, st = this.state, el = this.clock - this.t0, Hh = this.ceilH;
    const near = camPos ? Math.hypot(camPos.x - this.zone.cx, camPos.z - this.zone.cz) < 40 : true;
    this.group.visible = near;
    if (!near) return;
    const blink = Math.sin(this.clock * 9) > 0;
    const armedLike = st === 'armed' || st === 'cool';
    if (this.ledMats) this.ledMats.led.color.setHex(st === 'strike' ? 0xff3a2a : st === 'tele' ? (blink ? 0xffb02e : 0x332200) : armedLike ? 0x43d17a : 0x2a2f33);
    switch (this.type) {
      case 'laser': {
        P.grid.visible = st === 'armed' || st === 'tele';
        P.dimM.opacity = st === 'tele' ? (blink ? 0.7 : 0.15) : 0.22 + Math.sin(this.clock * 3) * 0.05;
        P.wall.visible = st === 'strike';
        if (st === 'strike') { const f = laserFrac(el, T.strike); P.wall.position.x = -this.zone.len / 2 + f * this.zone.len; P.beamM.opacity = 0.85 + Math.sin(this.clock * 60) * 0.1; }
        P.cut.material.opacity = st === 'strike' && el > T.strike - 0.15 ? clamp((el - (T.strike - 0.15)) / 0.15, 0, 1) * 0.5 : Math.max(0, P.cut.material.opacity - dt * 3);
        break;
      }
      case 'crusher': {
        let y = Hh - 0.22, sh = 0, dust = P.dust.material.opacity;
        if (st === 'tele') { const k = clamp(el / T.tele, 0, 1); y = Hh - 0.22 - k * 0.18 + Math.sin(this.clock * 55) * 0.012 * k; sh = (blink ? 0.55 : 0.2) * (0.4 + k * 0.6); }
        else if (st === 'strike') { const k = clamp(el / 0.12, 0, 1); y = lerp(Hh - 0.4, 0.22, k * k); sh = 0.5; if (k >= 1) dust = 0.5; }
        else if (st === 'cool') { const k = clamp(el / T.cd, 0, 1); y = lerp(0.22, Hh - 0.22, k); dust = Math.max(0, 0.5 - k * 1.3); }
        P.slab.position.y = y; P.shadow.material.opacity = sh; P.dust.material.opacity = Math.max(0, dust - dt * 0.4);
        break;
      }
      case 'spikes': {
        let k = 0;
        if (st === 'tele') k = 0.08 + Math.sin(this.clock * 40) * 0.03;
        else if (st === 'strike') k = clamp(el / 0.1, 0, 1);
        else if (st === 'cool') k = clamp(1 - el / T.cd, 0, 1) * 0.9;
        if (k !== P.lastK) { P.lastK = k; this.setSpikes(k); }
        break;
      }
      case 'electric': {
        const live = st === 'strike';
        P.glow.material.opacity = live ? 0.35 + Math.random() * 0.35 : st === 'tele' ? (blink ? 0.25 : 0.05) : 0;
        P.arcs.visible = live || (st === 'tele' && blink);
        if (P.arcs.visible && (P.arcT = (P.arcT || 0) - dt) <= 0) {
          P.arcT = 0.05;
          for (const a of P.arcs.children) { a.position.set((Math.random() - 0.5) * (this.zone.len - 0.6), 0.1 + Math.random() * 0.5, (Math.random() - 0.5) * (this.zone.wid - 0.6)); a.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); a.scale.set(1, 1, 0.4 + Math.random() * 1.2); }
        }
        break;
      }
      case 'flame': {
        const live = st === 'strike', tele = st === 'tele';
        for (const f of P.fl) {
          f.visible = live || (tele && !f.userData.core && blink && false);
          if (live) { const k = clamp(el / 0.15, 0, 1), fl = 0.8 + Math.random() * 0.5; f.scale.set((f.userData.core ? 0.5 : 1) * fl, (f.userData.core ? 1.7 : 2.4) * k * fl, (f.userData.core ? 0.5 : 1) * fl); f.rotation.x = f.userData.sz * Math.PI / 2; f.position.z = f.userData.sz * (this.zone.wid / 2 - 0.4 - k * 1.1 * (f.userData.core ? 0.5 : 1)); }
        }
        for (const p of P.pilots || []) p.material.color.setHex(tele ? (blink ? 0xffe08a : 0xff7a1a) : 0xff7a1a);
        P.haze.material.opacity = live ? 0.16 + Math.random() * 0.1 : 0;
        break;
      }
      default: break;
    }
    if (this.panelDirty || (this.left > 0 && (this.panelT = (this.panelT || 0) - dt) <= 0)) { this.panelT = 1; this.drawPanel(); }
  }
  buildPanel(pn) {
    if (typeof document === 'undefined' || !pn) return;
    this.panelPos = pn;
    const c = document.createElement('canvas'); c.width = 192; c.height = 256; this.panelCanvas = c;
    const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; this.panelTex = tex;
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const g = new THREE.Group(); g.position.set(pn.x, pn.y, pn.z); g.rotation.y = Math.atan2(pn.nx, pn.nz);
    const back = this.mk(new THREE.BoxGeometry(0.62, 0.8, 0.07), lam(0x2a2d33)); g.add(back);
    const face = this.mk(new THREE.PlaneGeometry(0.5, 0.66), mat); face.position.z = 0.04; g.add(face);
    const btn = this.mk(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), basic(0xff3a2a)); btn.rotation.x = Math.PI / 2; btn.position.set(0, -0.36, 0.05); g.add(btn);
    this.disposables.push(mat, tex);
    this.group.add(g);
    this.drawPanel();
  }
  drawPanel() {
    const c = this.panelCanvas; if (!c) return;
    this.panelDirty = false;
    const x = c.getContext('2d'), st = this.state;
    x.fillStyle = '#0a0d10'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = STATE_COLORS[st] || '#888'; x.fillRect(0, 0, c.width, 34);
    x.font = "22px 'TFG Cyr VT', VT323, monospace"; x.textAlign = 'center'; x.fillStyle = '#0a0d10';
    x.fillText(t(TRAP_STATE_LABEL[st] || 'OFFLINE'), c.width / 2, 25, 180);
    x.fillStyle = '#e8eef4'; x.font = "26px 'TFG Cyr VT', VT323, monospace";
    x.fillText(t(this.T.name).toUpperCase(), c.width / 2, 68, 180);
    x.fillStyle = '#9aa4ae'; x.font = "18px 'TFG Cyr VT', VT323, monospace";
    const lines = [];
    if (st === 'idle' || st === 'spent') { lines.push(t('PRICE')); }
    else lines.push(t('CHARGES') + ' ' + this.charges);
    x.fillText(lines[0], c.width / 2, 100, 180);
    x.fillStyle = st === 'idle' || st === 'spent' ? '#ffd870' : '#43d17a'; x.font = "44px 'TFG Cyr VT', VT323, monospace";
    x.fillText(st === 'idle' || st === 'spent' ? '▮ ' + this.price : Math.max(0, Math.ceil(this.left)) + 's', c.width / 2, 150, 180);
    x.fillStyle = '#7a8088'; x.font = "16px 'TFG Cyr VT', VT323, monospace";
    const hint = st === 'idle' || st === 'spent' ? t('PRESS TO ARM') : st === 'armed' ? t('LURE THEM IN') : st === 'tele' ? t('CLEAR THE LANE') : st === 'strike' ? '!!!' : '...';
    x.fillText(hint, c.width / 2, 190, 180);
    x.fillStyle = 'rgba(255,255,255,0.05)'; for (let y = 0; y < c.height; y += 4) x.fillRect(0, y, c.width, 1);
    this.panelTex.needsUpdate = true;
  }
  dispose() {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose?.();
    this.disposables.length = 0;
  }
}
const lerp = (a, b, k) => a + (b - a) * k;
const TRAP_STATE_LABEL = { idle: 'OFFLINE', armed: 'ARMED', tele: 'WARNING', strike: 'ACTIVE', cool: 'RECHARGE', spent: 'DEPLETED' };
