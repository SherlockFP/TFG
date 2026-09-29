// [labyrinths] Shared geometry kit for the four labyrinth interiors (metro / prison / greenhouse / tower) and the hero rooms.
// One LabBuilder per decorate() call: everything visual goes into ONE GeoBuilder (few draw calls), solids also create a static collider through
// ctx.addBox (tracked + released by the facility) and block the nav grid when they sit at walking height.
// Material keys:  m:<tex>            lit, textured
//                 e:<tex>:<hex>      lit + emissive tint (lamps that still read a texture)
//                 g:<hex>            unlit glow (MeshBasic, still fogged) - lamps, screens, windows
//                 t:<tex>:<hex>:<a>  transparent (glass, water, vines)
// Never adds THREE lights. Optional emitters go through the facility light pool (ctx.emitters).
import * as THREE from 'three';
import { G } from '../../physics/physics.js';
import { planStairs, emitStairs } from '../stairs.js';

const glowCache = new Map();
function glowMat(hex) {
  let m = glowCache.get(hex);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: hex }); glowCache.set(hex, m); }
  return m;
}
const CLEAR = new Map();
function clearMat(levelMaterial, tex, hex, a) {
  const k = tex + '|' + hex + '|' + a;
  let m = CLEAR.get(k);
  if (!m) { m = levelMaterial(tex || null, { transparent: true, opacity: a, color: hex, side: THREE.DoubleSide }); CLEAR.set(k, m); }
  return m;
}

export class LabBuilder {
  constructor(ctx) {
    this.ctx = ctx;
    this.Y = ctx.Y;
    this.gb = new ctx.GeoBuilder();
    this.cols = [];          // { col, x, y, z, sx, sy, sz } for every collider this builder made
    this.emitted = 0;
  }

  // ---- visuals (no collider) ----
  box(key, cx, cy, cz, sx, sy, sz, uv = 0.5, color) { this.gb.box(key, cx, cy, cz, sx, sy, sz, uv, color); }
  /** horizontal rect, faces up when up=true */
  floor(key, x0, z0, x1, z1, y, up = true, uv = 0.5, color) { this.gb.hrect(key, x0, z0, x1, z1, y, up, uv, color); }
  /** vertical wall face from (x0,z0) to (x1,z1); left-hand normal of the direction */
  wall(key, x0, z0, x1, z1, y0, y1, uv = 0.5, color) { this.gb.vrect(key, x0, z0, x1, z1, y0, y1, uv, color); }
  /** a box rotated about Y (visual): 4 vertical quads + top, built from the rotated footprint */
  rbox(key, cx, cy, cz, sx, sy, sz, rot, uv = 0.5, color) {
    const c = Math.cos(rot), s = Math.sin(rot), hx = sx / 2, hz = sz / 2;
    const P = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4]; this.gb.vrect(key, b[0], b[1], a[0], a[1], y0, y1, uv, color); }
    const v = (p, y) => new THREE.Vector3(p[0], y, p[1]);
    this.gb.quad(key, v(P[3], y1), v(P[2], y1), v(P[1], y1), v(P[0], y1), P.slice().reverse().map((p) => [p[0] * uv, p[1] * uv]), color);
  }

  // ---- solids ----
  /** collider only. Blocks the nav grid when it reaches walking height (y in [Y+0.2, Y+1.2]). */
  col(cx, cy, cz, sx, sy, sz, rot = 0, nav = true) {
    const c = this.ctx.addBox(cx, cy, cz, sx, sy, sz, G.STATIC, undefined, rot);
    const rec = { col: c, x: cx, y: cy, z: cz, sx, sy, sz };
    this.cols.push(rec);
    if (nav && cy - sy / 2 < this.Y + 1.2 && cy + sy / 2 > this.Y + 0.2) this.blockNav(cx, cz, sx, sz, rot);
    return rec;
  }
  blockNav(cx, cz, sx, sz, rot = 0) {
    const r = typeof rot === 'number' ? rot : 0;
    const ca = Math.abs(Math.cos(r)), sa = Math.abs(Math.sin(r));
    const hx = ca * sx / 2 + sa * sz / 2, hz = sa * sx / 2 + ca * sz / 2;
    this.ctx.nav?.blockBox(cx - hx, cz - hz, cx + hx, cz + hz, 0.12);
    this.ctx.propBoxes?.push([cx - hx, cz - hz, cx + hx, cz + hz]);
  }
  /** visual + collider */
  solid(key, cx, cy, cz, sx, sy, sz, o = {}) {
    this.gb.box(key, cx, cy, cz, sx, sy, sz, o.uv ?? 0.5, o.color);
    return this.col(cx, cy, cz, sx, sy, sz, 0, o.nav !== false);
  }
  /** slab whose TOP surface is at y (floor of a deck / dais): visual + collider, no nav block above walking height */
  slab(key, x0, z0, x1, z1, y, th = 0.25, o = {}) {
    if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return null;
    this.gb.box(key, (x0 + x1) / 2, y - th / 2, (z0 + z1) / 2, x1 - x0, th, z1 - z0, o.uv ?? 0.5, o.color);
    return this.col((x0 + x1) / 2, y - th / 2, (z0 + z1) / 2, x1 - x0, th, z1 - z0, 0, o.nav === true);
  }
  /** straight railing along an axis-aligned segment: collider 1.05 m high + posts and two bars */
  rail(x0, z0, x1, z1, y, o = {}) {
    const h = o.h ?? 1.05, th = 0.1, key = o.key || 'm:metal_dark';
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    if (len < 0.05) return;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const sx = alongX ? len : th, sz = alongX ? th : len;
    this.gb.box(key, cx, y + h - 0.04, cz, sx, 0.07, sz, 0.5);
    this.gb.box(key, cx, y + h * 0.5, cz, alongX ? len : 0.04, 0.04, alongX ? 0.04 : len, 0.5);
    const n = Math.max(2, Math.ceil(len / 1.8) + 1);
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      this.gb.box(key, alongX ? x0 + (x1 - x0) * f : cx, y + h / 2, alongX ? cz : z0 + (z1 - z0) * f, 0.07, h, 0.07, 0.5);
    }
    if (o.collide !== false) this.col(cx, y + h / 2, cz, sx, h, sz, 0, false);
  }
  /** rectangle railing (4 sides), `gaps` = array of sides to leave open: 'n' (-z) 's' (+z) 'w' (-x) 'e' (+x) */
  railRect(x0, z0, x1, z1, y, gaps = [], o = {}) {
    if (!gaps.includes('n')) this.rail(x0, z0, x1, z0, y, o);
    if (!gaps.includes('s')) this.rail(x0, z1, x1, z1, y, o);
    if (!gaps.includes('w')) this.rail(x0, z0, x0, z1, y, o);
    if (!gaps.includes('e')) this.rail(x1, z0, x1, z1, y, o);
  }
  /**
   * A straight stair flight from src/world/stairs.js (ramp collider, landings, skirts, visual steps).
   * o: planStairs options + tex. `walls`: [left, right] stepped side walls (solid, 1 m above the tread) so nobody walks off the side.
   * Returns the plan (plan.top / plan.bottom / plan.ramp ...).
   */
  stairs(o) {
    const plan = planStairs({ th: 0.2, landing: 0.6, ...o });
    const key = o.tex || 'm:metal_plate';
    emitStairs(plan, {
      vis: (s) => this.gb.box(key, s.cx, s.cy, s.cz, s.sx, s.sy, s.sz, 0.5),
      col: (b) => this.col(b.cx, b.cy, b.cz, b.sx, b.sy, b.sz, 0, false),
      ramp: (r) => { const rec = this.col(r.cx, r.cy, r.cz, r.sx, r.sy, r.sz, r.q, false); rec.ramp = true; },
    });
    // nav: the flight footprint is not walkable ground for creatures
    const [dx, dz] = plan.dir, n0 = plan.bottom.at, n1 = plan.top.at;
    const wx = Math.abs(dz) * plan.width / 2, wz = Math.abs(dx) * plan.width / 2;
    if (o.baseY != null ? o.baseY < this.Y + 1.2 : plan.y < this.Y + 1.2) {
      const x0 = Math.min(n0[0], n1[0]) - wx, x1 = Math.max(n0[0], n1[0]) + wx, z0 = Math.min(n0[1], n1[1]) - wz, z1 = Math.max(n0[1], n1[1]) + wz;
      this.ctx.nav?.blockBox(x0, z0, x1, z1, 0.05); this.ctx.propBoxes?.push([x0, z0, x1, z1]);
    }
    if (o.walls) {
      const segs = 4, sw = 0.16;
      for (const side of [-1, 1]) {
        if (!o.walls.includes(side)) continue;
        for (let k = 0; k < segs; k++) {
          const a0 = plan.run * k / segs, a1 = plan.run * (k + 1) / segs, hy = plan.y + plan.rise * (k + 1) / segs + 1.0;
          const mid = (a0 + a1) / 2, cx = plan.x + dx * mid + (-dz) * side * (plan.width / 2 + sw / 2), cz = plan.z + dz * mid + dx * side * (plan.width / 2 + sw / 2);
          const yb = o.baseY ?? plan.y - 0.1;
          const len = a1 - a0, sxx = Math.abs(dx) ? len : sw, szz = Math.abs(dz) ? len : sw;
          this.gb.box('m:metal_dark', cx, (yb + hy) / 2, cz, sxx, hy - yb, szz, 0.5);
          this.col(cx, (yb + hy) / 2, cz, sxx, hy - yb, szz, 0, false);
        }
      }
    }
    return plan;
  }

  /** merged mesh + optional transparent pieces, added to ctx.group. materialFor handles the key scheme documented above. */
  build(name) {
    const lm = this.ctx.levelMaterial;
    const built = this.gb.build((key) => {
      const p = key.split(':');
      if (p[0] === 'g') return glowMat(parseInt(p[1], 16));
      if (p[0] === 'e') return lm(p[1], { emissive: parseInt(p[2], 16) });
      if (p[0] === 't') return clearMat(lm, p[1] === '-' ? null : p[1], parseInt(p[2], 16), parseFloat(p[3]));
      return lm(p[1], {});
    });
    built.name = name;
    built.traverse((m) => { if (m.isMesh && m.userData.levelKey?.startsWith('t:')) { m.renderOrder = 2; m.userData.setPiece = true; } });
    if (built.children.length) this.ctx.group.add(built);
    return built;
  }
}

/** deterministic 0..1 hash of two ints (cheap decoration jitter that never touches the shared RNG stream order) */
export function hash2(a, b, s = 0) {
  let h = (a * 374761393 + b * 668265263 + s * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** scrap spot on an upper deck: y is the deck top. `elevated` keeps roaming creature code and jobs away from it. */
export function deckSpot(ctx, x, y, z, room, extra = {}) {
  ctx.scrapSpots.push({ x, y, z, room, type: 'lab', elevated: true, dist: 0, ...extra });
}

export const V3 = THREE.Vector3;
