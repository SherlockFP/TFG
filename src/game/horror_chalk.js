// HORROR module - CHALK marks: pooled instanced decal quads (8 tiny meshes), drawn with the chalk item (LMB arrow, crouch + LMB X), rubbed out with E.
// Host-authoritative store (horror_core.js ChalkStore: 24 per player, 160 total, fakes capped separately). Net: request 'hrReq' {op:'chalk'|'wipe'}, host -> all 'hrch'.
import * as THREE from 'three';
import { CHALK, decodeMark, encodeMark, markBasis, normalIndex, rollFor, NORMALS } from './horror_core.js';

const CAP = 200;
const _m = new THREE.Matrix4(), _c = new THREE.Color();

/** one canvas texture per glyph variant. Real strokes wobble and smudge; fakes are ruler-straight with an extra tick on the arrow head. */
function glyphTexture(kind, fake, variant) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d', { willReadFrequently: true });
  let s = 1234 + variant * 977 + (fake ? 4242 : 0) + kind * 31;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  x.clearRect(0, 0, 64, 64);
  x.strokeStyle = '#ffffff'; x.lineCap = 'round'; x.lineJoin = 'round';
  const wob = fake ? 0 : 1.6;
  const line = (ax, ay, bx, by, w) => {
    x.lineWidth = w;
    x.beginPath(); x.moveTo(ax + (rnd() - 0.5) * wob, ay + (rnd() - 0.5) * wob);
    const mx = (ax + bx) / 2 + (rnd() - 0.5) * wob * 2, my = (ay + by) / 2 + (rnd() - 0.5) * wob * 2;
    x.quadraticCurveTo(mx, my, bx + (rnd() - 0.5) * wob, by + (rnd() - 0.5) * wob); x.stroke();
  };
  const w = fake ? 5 : 6;
  if (kind === 0) {   // arrow, points up (+y of the quad)
    line(32, 58, 32, 10, w);
    line(32, 10, 18, 26, w); line(32, 10, 46, 26, w);
    if (fake) line(32, 10, 32, 30, 3.2), line(32, 19, 24, 31, 3.2);   // the extra ticks: a fake head has three prongs
  } else { line(14, 14, 50, 50, w + 1); line(50, 14, 14, 50, w + 1); }
  // chalk grain: knock random pixels out, real marks get smudged dust around the strokes
  const id = x.getImageData(0, 0, 64, 64), d = id.data;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0) { const r = rnd(); if (r < 0.2) d[i + 3] = Math.round(d[i + 3] * (0.25 + r * 2)); } else if (!fake && rnd() < 0.012) d[i + 3] = 90; }
  x.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

export class ChalkView {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group(); this.group.name = 'hr_chalk'; scene.add(this.group);
    this.geo = new THREE.PlaneGeometry(0.6, 0.6);
    this.sets = [];   // { kind, fake, variant, mesh, ids: [] }  (built on the first mark: the 8 canvas glyphs cost 0.7-2.8 s on the first landing of a session - QA night 1)
    this.byId = new Map();
    this.marks = new Map();
  }
  build() {
    if (this.sets.length) return;
    const defs = [[0, 0, 0], [0, 0, 1], [0, 0, 2], [0, 0, 3], [1, 0, 0], [1, 0, 1], [0, 1, 0], [1, 1, 0]];
    for (const [kind, fake, variant] of defs) {
      const tex = glyphTexture(kind, fake, variant);
      const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.2, depthWrite: false, emissive: 0x18181a, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      const mesh = new THREE.InstancedMesh(this.geo, mat, CAP);
      mesh.count = 0; mesh.frustumCulled = false; mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
      this.group.add(mesh);
      this.sets.push({ kind, fake, variant, mesh, ids: [] });
    }
  }
  setFor(m) {
    this.build();
    const kind = m.k, fake = m.f;
    const cands = this.sets.filter((s) => s.kind === kind && !!s.fake === !!fake);
    return cands[m.v % cands.length];
  }
  add(m) {
    if (!m || this.marks.has(m.id)) return;
    const set = this.setFor(m);
    if (set.ids.length >= CAP) return;
    this.marks.set(m.id, m);
    const slot = set.ids.length; set.ids.push(m.id); this.byId.set(m.id, set);
    this.place(set, slot, m);
    set.mesh.count = set.ids.length;
    set.mesh.instanceMatrix.needsUpdate = true; set.mesh.instanceColor.needsUpdate = true;
  }
  place(set, slot, m) {
    const B = markBasis(m.n, m.r), n = B.normal, s = m.k === 0 ? 1 : 0.95;
    _m.makeBasis(new THREE.Vector3(...B.right).multiplyScalar(s), new THREE.Vector3(...B.dir).multiplyScalar(s), new THREE.Vector3(...n));
    _m.setPosition(m.x + n[0] * 0.014, m.y + n[1] * 0.014, m.z + n[2] * 0.014);
    set.mesh.setMatrixAt(slot, _m);
    _c.setHex(m.f ? 0xe8ecf0 : CHALK.colors[m.o % CHALK.colors.length]);
    set.mesh.setColorAt(slot, _c);
  }
  remove(id) {
    const set = this.byId.get(id); if (!set) return;
    const i = set.ids.indexOf(id), last = set.ids.length - 1;
    if (i < 0) return;
    if (i !== last) { const lid = set.ids[last]; set.ids[i] = lid; this.place(set, i, this.marks.get(lid)); }
    set.ids.pop(); set.mesh.count = set.ids.length;
    set.mesh.instanceMatrix.needsUpdate = true; if (set.mesh.instanceColor) set.mesh.instanceColor.needsUpdate = true;
    this.byId.delete(id); this.marks.delete(id);
  }
  clear() { for (const id of [...this.marks.keys()]) this.remove(id); }
  nearest(x, y, z, maxD = 2.6) {
    let best = null, bd = maxD;
    for (const m of this.marks.values()) { const d = Math.hypot(m.x - x, m.y - y, m.z - z); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  count() { return this.marks.size; }
  dispose() {
    this.group.removeFromParent();
    for (const s of this.sets) { s.mesh.material.map?.dispose(); s.mesh.material.dispose(); s.mesh.dispose(); }
    this.geo.dispose();
    this.marks.clear(); this.byId.clear();
  }
}

/** client: turn the crosshair ray into a draw request. hit = physics raycast result, fwd / vel = player vectors */
export function drawRequest(hit, fwd, vel, crouch) {
  if (!hit || hit.info?.kind === 'item') return null;
  const nrm = hit.normal || { x: 0, y: 1, z: 0 };
  const n = normalIndex(nrm.x, nrm.y, nrm.z);
  // arrows point where you are heading: on a floor that is your facing; on a wall your travel direction (falls back to your view)
  const N = NORMALS[n];
  let w = [fwd.x, fwd.y, fwd.z];
  if (Math.abs(N[1]) < 0.7) {
    const sp = Math.hypot(vel.x, vel.z);
    w = sp > 0.6 ? [vel.x, 0, vel.z] : [fwd.x, 0, fwd.z];
    // looking straight at the wall: the projected direction collapses, point along the wall to the right of the view instead
    const dn = w[0] * N[0] + w[2] * N[2];
    if (Math.hypot(w[0] - N[0] * dn, w[2] - N[2] * dn) < 0.2) w = [fwd.z, 0, -fwd.x];
  }
  const r = rollFor(n, w);
  return { k: crouch ? 1 : 0, p: [hit.point.x, hit.point.y, hit.point.z], n, r };
}
export { decodeMark, encodeMark };
