// VOYAGE kit: a tiny merged-geometry builder used by every set piece / biome decor of the wave-4 voyage system.
// Boxes / cylinders / cones / icospheres are baked (vertex colours) into TWO meshes: a lit one (Lambert, flat shaded) and a glow one (Basic,
// fog aware, "emissive"), so a whole set piece is 2 draw calls. Colliders go through env.addBox (static boxes, Y rotation only), lights through
// env.emitters (the constant-count light pool, never new THREE lights).
//   env = { add(obj3d), own(geometry), mat(material), addBox(x,y,z,sx,sy,sz,rotY,data), emitters:[], colliders? }
// Local frame: origin (ox, oy, oz), rotated by `yaw`. All primitives are placed with y = BOTTOM of the shape.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _s = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();

export class Kit {
  constructor(env, ox = 0, oy = 0, oz = 0, yaw = 0) {
    this.env = env; this.ox = ox; this.oy = oy; this.oz = oz; this.yaw = yaw;
    this.co = Math.cos(yaw); this.si = Math.sin(yaw);
    this.B = { lit: { p: [], n: [], c: [] }, glow: { p: [], n: [], c: [] } };
    _s.makeRotationY(yaw); _s.setPosition(ox, oy, oz);
    this.site = _s.clone();
    this.meshes = [];
  }
  wx(x, z) { return this.ox + x * this.co + z * this.si; }
  wz(x, z) { return this.oz - x * this.si + z * this.co; }
  /** world position of a local point */
  at(x, y, z) { return { x: this.wx(x, z), y: this.oy + y, z: this.wz(x, z) }; }

  _bake(geo, x, y, z, color, o) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    _q.setFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'));
    _m.compose(_p.set(x, y, z), _q, o.s ? _one.clone().setScalar(o.s) : _one);
    _m.premultiply(this.site);
    g.applyMatrix4(_m);
    const B = o.glow ? this.B.glow : this.B.lit;
    const pa = g.attributes.position.array, na = g.attributes.normal.array, n = pa.length / 3;
    for (let i = 0; i < pa.length; i++) { B.p.push(pa[i]); B.n.push(na[i]); }
    _c.set(color);
    const j = o.glow ? 1 : 0.9 + Math.random() * 0.2;
    for (let i = 0; i < n; i++) B.c.push(_c.r * j, _c.g * j, _c.b * j);
    if (g !== geo) g.dispose();
    geo.dispose();
  }
  /** box, (x, y, z) = bottom centre. o: { ry, rx, rz, glow, solid, data } */
  box(x, y, z, w, h, d, color, o = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(0, h / 2, 0);
    this._bake(geo, x, y, z, color, o);
    if (o.solid && !o.rx && !o.rz) this.env.addBox(this.wx(x, z), this.oy + y + h / 2, this.wz(x, z), w, h, d, this.yaw + (o.ry || 0), o.data || null);
  }
  /** cylinder / cone (rTop 0). (x, y, z) = bottom centre. solid = one box around it. */
  cyl(x, y, z, rBot, h, color, o = {}) {
    const geo = new THREE.CylinderGeometry(o.rTop ?? rBot, rBot, h, o.seg || 8);
    geo.translate(0, h / 2, 0);
    this._bake(geo, x, y, z, color, o);
    if (o.solid) { const r = Math.max(rBot, o.rTop ?? rBot) * 1.6; this.env.addBox(this.wx(x, z), this.oy + y + h / 2, this.wz(x, z), r, h, r, this.yaw + (o.ry || 0), o.data || null); }
  }
  cone(x, y, z, r, h, color, o = {}) { this.cyl(x, y, z, r, h, color, { ...o, rTop: 0 }); }
  /** icosahedron centred at (x, y, z) (crystals, meteorites, relics) */
  ico(x, y, z, r, color, o = {}) {
    const geo = new THREE.IcosahedronGeometry(r, o.detail || 0);
    if (o.sy) geo.scale(1, o.sy, 1);
    this._bake(geo, x, y, z, color, o);
  }
  /** a light-pool emitter at a local point */
  light(x, y, z, color, intensity = 1.4, distance = 12, flicker = 0) {
    this.env.emitters.push({ pos: new THREE.Vector3(this.wx(x, z), this.oy + y, this.wz(x, z)), color, intensity, distance, flicker, group: 'outdoor' });
  }
  /** standalone mesh (dynamic colour / visibility) in world space */
  mesh(geo, color, x, y, z, o = {}) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: o.opacity != null, opacity: o.opacity ?? 1, fog: true, depthWrite: o.opacity == null });
    const mesh = new THREE.Mesh(geo, mat);
    const p = this.at(x, y, z);
    mesh.position.set(p.x, p.y, p.z); mesh.rotation.set(o.rx || 0, this.yaw + (o.ry || 0), o.rz || 0);
    this.env.add(mesh); this.env.own(geo); this.env.mat(mat);
    return mesh;
  }
  /** bake the accumulated geometry into the two meshes and add them to the scene */
  finish() {
    for (const [name, B] of Object.entries(this.B)) {
      if (!B.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
      g.computeBoundingSphere();
      const mat = name === 'lit' ? new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }) : new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
      const mesh = new THREE.Mesh(g, mat);
      this.env.add(mesh); this.env.own(g); this.env.mat(mat);
      this.meshes.push(mesh);
      B.p = []; B.n = []; B.c = [];
    }
    return this.meshes;
  }
}

/** Convenience: wall along local X or Z with gaps. axis 'x' = wall runs along X at z = pos; 'z' = runs along Z at x = pos.
 *  gaps: [[from, to], ...] (in the running coordinate); returns nothing (segments are added to the kit). */
export function wallWithGaps(k, axis, pos, a0, a1, h, thick, color, gaps = [], o = {}) {
  const cuts = [a0, ...gaps.flat(), a1];
  for (let i = 0; i < cuts.length; i += 2) {
    const s0 = cuts[i], s1 = cuts[i + 1];
    if (s1 - s0 < 0.05) continue;
    const mid = (s0 + s1) / 2, len = s1 - s0;
    if (axis === 'z') k.box(pos, 0, mid, thick, h, len, color, { solid: true, ...o });
    else k.box(mid, 0, pos, len, h, thick, color, { solid: true, ...o });
  }
  // lintel above each gap so a doorway reads as a doorway
  if (o.lintel) for (const [g0, g1] of gaps) {
    const mid = (g0 + g1) / 2, len = g1 - g0;
    if (axis === 'z') k.box(pos, o.lintel, mid, thick, h - o.lintel, len, color, { solid: true });
    else k.box(mid, o.lintel, pos, len, h - o.lintel, thick, color, { solid: true });
  }
}

/** Seeded deterministic float helper for builders (mulberry32 over an integer) */
export function hash01(n) { let t = (n + 0x6d2b79f5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
