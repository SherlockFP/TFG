// MINING core (wave 8, module `mining`; docs/wave8/mining.md): pure voxel rules - no DOM / three / game access (node-tested by tools/harness/mining.test.mjs).
// Rock is a set of small voxel volumes (0.5 m cells, 16^3 chunks). Everything that differs between peers is derived from (seed, terrain, layout), so every
// peer builds the SAME volumes; only edits (cell -> material, 0 = air) travel over the net, packed as idx * 16 + mat.
import { RNG } from '../core/rng.js';
import { toolClass } from './harvest2_core.js';

export const CELL = 0.5, CH = 16;
export const M = { AIR: 0, DIRT: 1, STONE: 2, DEEP: 3, COPPER: 4, IRON: 5, QUARTZ: 6, CRYSTAL: 7, BEDROCK: 8, BEAM: 9, TORCH: 10 };
/** n = name (i18n key), hp = hit points of one cell (Infinity = unbreakable), col = rgb, lit = unlit / glowing, drop = { item, val } (ore value tally) */
export const MATS = [
  null,
  { n: 'Dirt', hp: 12, col: [0.42, 0.31, 0.2] },
  { n: 'Stone', hp: 34, col: [0.5, 0.5, 0.52] },
  { n: 'Deep rock', hp: 80, col: [0.26, 0.27, 0.32] },
  { n: 'Copper ore', hp: 44, col: [0.78, 0.46, 0.25], drop: { item: 'ore_copper', val: 12 } },
  { n: 'Iron ore', hp: 50, col: [0.62, 0.5, 0.46], drop: { item: 'ore_iron', val: 9.5 } },
  { n: 'Quartzite', hp: 60, col: [0.86, 0.84, 0.9], drop: { item: 'ore_quartz', val: 21 } },
  { n: 'Data crystal', hp: 90, col: [0.3, 0.95, 1.0], lit: true, drop: { item: 'comp_crystal', val: 30 } },
  { n: 'Bedrock', hp: Infinity, col: [0.12, 0.12, 0.14] },
  { n: 'Support beam', hp: 25, col: [0.5, 0.33, 0.17], drop: { item: 'mn_beam', val: 0 }, support: true },
  { n: 'Torch block', hp: 6, col: [1.0, 0.72, 0.28], lit: true, drop: { item: 'mn_torch', val: 0 } },
];
/** packed-edit material code for "removed by a player" */
export const DUG = 15;
export const pack = (i, m) => i * 16 + m;
export const isOre = (m) => m >= M.COPPER && m <= M.CRYSTAL;
export const PLACEABLE = { mn_beam: M.BEAM, mn_torch: M.TORCH };

export const MN = {
  reach: 4.6,             // host: max distance sender eye -> cell centre
  minGap: 0.1,            // host: min seconds between two hit requests of one player
  noiseGap: 0.45,         // host: min seconds between two stealth noise events of one player
  valueCap: 240,          // credits of ore that may drop per moon and day (MASTERPLAN 19: never beat a scrap run)
  itemCap: 30,
  stress: 72, beamRelief: 40, warnMs: 2600, cavePlayerDmg: 8,
  baseMin: 3, baseMax: 120,
};
/** tool key -> { m: damage multiplier vs rock, noise: stealth loudness of one hit } */
export const TOOLS = {
  hand: { m: 0.3, noise: 0.15 }, weapon: { m: 0.5, noise: 0.3 }, axe: { m: 0.7, noise: 0.35 },
  pick1: { m: 2, noise: 0.5 }, pick2: { m: 3.2, noise: 0.6 }, drill: { m: 5, noise: 1.1 },
};
export const PICK_IDS = { pick1: /^(tool_pickaxe|pickaxe|x_pickaxe)$/, pick2: /^tool_pickaxe_steel$/, drill: /^tool_drill$/ };
/** tool key from a held item definition (null = bare hands) */
export function toolKey(def) {
  if (!def) return 'hand';
  const id = def.id || '';
  for (const k of Object.keys(PICK_IDS)) if (PICK_IDS[k].test(id)) return k;
  const c = toolClass(def);
  return c === 'axe' ? 'axe' : c === 'weapon' ? 'weapon' : 'hand';
}
export const cellDamage = (base, key) => Math.round(Math.min(MN.baseMax, Math.max(MN.baseMin, Number(base) || 0)) * (TOOLS[key] || TOOLS.hand).m * 10) / 10;
/** hits to break one cell (planning / tests) */
export const hitsToBreak = (mat, base, key) => Math.ceil(MATS[mat].hp / Math.max(0.1, cellDamage(base, key)));

// ------------------------------------------------------------------------------------------------ volume
export class Vol {
  constructor(spec) {
    Object.assign(this, spec);
    this.data = new Uint8Array(this.nx * this.ny * this.nz);
    this.dug = new Uint8Array(this.data.length);     // cells a player removed (cave-in stress ignores natural caves)
    this.dmg = new Map();                            // host: idx -> accumulated damage
    this.ncx = Math.ceil(this.nx / CH); this.ncy = Math.ceil(this.ny / CH); this.ncz = Math.ceil(this.nz / CH);
  }
  idx(x, y, z) { return (y * this.nz + z) * this.nx + x; }
  inb(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz; }
  get(x, y, z) { return this.inb(x, y, z) ? this.data[(y * this.nz + z) * this.nx + x] : 0; }
  xyz(i) { const x = i % this.nx, r = (i - x) / this.nx, z = r % this.nz; return [x, (r - z) / this.nz, z]; }
  center(i, out = {}) { const [x, y, z] = this.xyz(i); out.x = this.x + (x + 0.5) * CELL; out.y = this.y + (y + 0.5) * CELL; out.z = this.z + (z + 0.5) * CELL; return out; }
  solidCount() { let n = 0; for (let i = 0; i < this.data.length; i++) if (this.data[i]) n++; return n; }
  count(m) { let n = 0; for (let i = 0; i < this.data.length; i++) if (this.data[i] === m) n++; return n; }
  /** apply packed edits (idx * 16 + mat; mat 0 = air by a cave-in, DUG = air dug by a player -> counts for cave-in stress). Returns the touched chunk indices. */
  apply(edits) {
    const ch = new Set();
    for (const e of edits) {
      const m0 = e & 15, m = m0 === DUG ? 0 : m0, i = (e - m0) / 16;
      if (i < 0 || i >= this.data.length || this.data[i] === M.BEDROCK) continue;
      this.data[i] = m; this.dmg.delete(i);
      if (m0 === DUG) this.dug[i] = 1; else if (m !== 0) this.dug[i] = 0;
      const [x, y, z] = this.xyz(i);
      const cx = Math.floor(x / CH), cy = Math.floor(y / CH), cz = Math.floor(z / CH);
      ch.add(this.chunkIdx(cx, cy, cz));
      for (const [ax, ay, az] of [[x - 1, y, z], [x + 1, y, z], [x, y - 1, z], [x, y + 1, z], [x, y, z - 1], [x, y, z + 1]]) {
        if (this.inb(ax, ay, az)) ch.add(this.chunkIdx(Math.floor(ax / CH), Math.floor(ay / CH), Math.floor(az / CH)));
      }
    }
    return ch;
  }
  chunkIdx(cx, cy, cz) { return (cy * this.ncz + cz) * this.ncx + cx; }
  chunkXyz(k) { const cx = k % this.ncx, r = (k - cx) / this.ncx, cz = r % this.ncz; return [cx, (r - cz) / this.ncz, cz]; }
  chunkCount() { return this.ncx * this.ncy * this.ncz; }
}

const hash3 = (x, y, z) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };

/** build the cells of a volume spec: { id, kind: 'mound' | 'cliff' | 'slab', x, y, z (world min corner), nx, ny, nz, seed, cave, dir, veins, crystal } */
export function genVolume(spec) {
  const v = new Vol(spec);
  const R = new RNG((spec.seed ^ 0x5a17c3) >>> 0);
  const { nx, ny, nz } = v;
  const top = new Int16Array(nx * nz);
  if (spec.kind === 'slab') {
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) v.data[v.idx(x, y, z)] = R.chance(0.22) ? M.DEEP : M.STONE;
    top.fill(ny);
  } else {
    const gw = Math.ceil(nx / 4) + 2, gh = Math.ceil(nz / 4) + 2, lat = new Float32Array(gw * gh);
    for (let i = 0; i < lat.length; i++) lat[i] = R.next();
    const noise = (x, z) => {
      const fx = x / 4, fz = z / 4, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
      const a = lat[iz * gw + ix], b = lat[iz * gw + ix + 1], c = lat[(iz + 1) * gw + ix], d = lat[(iz + 1) * gw + ix + 1];
      return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
    };
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const dx = (x + 0.5 - nx / 2) / (nx / 2), dz = (z + 0.5 - nz / 2) / (nz / 2), r2 = dx * dx + dz * dz;
      if (r2 >= 1) continue;
      const h = Math.max(2, Math.min(ny, Math.round(ny * Math.pow(1 - r2, 0.55) * (0.82 + 0.3 * noise(x, z)))));
      top[z * nx + x] = h;
      for (let y = 0; y < h; y++) {
        let m = M.STONE;
        if (y === 0) m = M.BEDROCK;
        else if (y === h - 1 && h > 3) m = M.DIRT;
        else if (h - y >= 4 && r2 < 0.55 && y < h * 0.62) m = M.DEEP;
        else if (h - y <= 3 && (hash3(x, y, z) & 7) === 0) m = M.DIRT;
        v.data[v.idx(x, y, z)] = m;
      }
    }
  }
  // cave pocket: a 3-wide, up to 4-tall tunnel from the rim, floor at the bedrock top
  let backWall = null;
  if (spec.cave && spec.kind === 'mound') {
    const along = spec.dir % 2 === 0 ? nx : nz, cross = spec.dir % 2 === 0 ? nz : nx, mid = Math.floor(cross / 2), depth = R.int(8, 11);
    const at = (t, w) => {   // t: distance from the rim, w: cross offset
      const a = spec.dir < 2 ? along - 1 - t : t;
      return spec.dir % 2 === 0 ? [a, mid + w] : [mid + w, a];
    };
    for (let t = 0; t < depth; t++) for (let w = -1; w <= 1; w++) {
      const [x, z] = at(t, w);
      const h = top[z * nx + x];
      for (let y = 1; y <= Math.min(4, h - 2); y++) v.data[v.idx(x, y, z)] = M.AIR;
    }
    const [bx, bz] = at(depth, 0);
    if (v.inb(bx, 2, bz)) backWall = [bx, 2, bz];
  }
  // ore veins: random walks; half of them start on an exposed face so a passer-by sees a glint of ore
  const surface = [], inner = [];
  for (let y = 2; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    if (!v.data[v.idx(x, y, z)]) continue;
    const air = !v.get(x - 1, y, z) || !v.get(x + 1, y, z) || !v.get(x, y, z - 1) || !v.get(x, y, z + 1) || !v.get(x, y + 1, z);
    (air ? surface : inner).push([x, y, z]);
  }
  const oreMax = spec.kind === 'cliff' ? 22 : 16;
  let ores = 0;
  const veins = spec.veins ?? (spec.kind === 'cliff' ? 5 : spec.kind === 'slab' ? 2 : 3);
  for (let n = 0; n < veins && surface.length + inner.length; n++) {
    let [x, y, z] = (n === 0 && backWall) ? backWall : (n % 2 === 0 && surface.length ? R.pick(surface) : (inner.length ? R.pick(inner) : R.pick(surface)));
    const m = R.next() < 0.4 ? M.COPPER : R.next() < 0.58 ? M.IRON : M.QUARTZ;
    const len = R.int(3, 6);
    for (let s = 0; s < len && ores < oreMax; s++) {
      const i = v.idx(x, y, z);
      if (v.inb(x, y, z) && v.data[i] >= M.DIRT && v.data[i] <= M.DEEP) { v.data[i] = m; ores++; }
      const ax = R.next() < 0.3 ? 1 : R.next() < 0.5 ? 0 : 2, sg = R.sign();
      if (ax === 0) x += sg; else if (ax === 1) y += sg; else z += sg;
      if (y < 2) y = 2;
    }
  }
  // data crystal: hidden 1-3 cells behind the surface, fully enclosed
  if (R.chance(spec.crystal ?? (spec.kind === 'cliff' ? 0.8 : spec.kind === 'slab' ? 0.35 : 0.5))) {
    for (let tries = 0; tries < 80; tries++) {
      const c = inner.length ? R.pick(inner) : null;
      if (!c) break;
      const [x, y, z] = c;
      if (v.data[v.idx(x, y, z)] < M.DIRT || v.data[v.idx(x, y, z)] > M.DEEP) continue;
      if (![[-1, 0, 0], [1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, -1], [0, 0, 1]].every(([a, b, d]) => v.get(x + a, y + b, z + d))) continue;
      let near = false;
      for (let k = 1; k <= 3 && !near; k++) near = !v.get(x - k, y, z) || !v.get(x + k, y, z) || !v.get(x, y, z - k) || !v.get(x, y, z + k) || !v.get(x, y + k, z);
      if (!near) continue;
      v.data[v.idx(x, y, z)] = M.CRYSTAL;
      const j = R.pick([[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]);
      if (v.data[v.idx(x + j[0], y, z + j[2])] && v.get(x + j[0], y, z + j[2]) < M.COPPER) v.data[v.idx(x + j[0], y, z + j[2])] = M.CRYSTAL;
      break;
    }
  }
  return v;
}

// ------------------------------------------------------------------------------------------------ placement plans
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** outdoor volumes. ctx: { seed, size, tier, terrain:{heightAt, playHalf, flood}, avoid(x,z,m), sites:[{x,z,radius}] } -> specs (pure, deterministic) */
export function planOutdoor(ctx) {
  const R = new RNG((ctx.seed ^ 0x6d1e5a) >>> 0), T = ctx.terrain;
  const want = clamp(2 + ((ctx.size || 1) >= 1.2 ? 1 : 0) + ((ctx.tier || 1) >= 3 ? 1 : 0), 2, 4);
  const lim = (T.playHalf || 130) * 0.85, out = [];
  const flood = T.flood ?? -1e9;
  for (let n = 0, tries = 0; n < want && tries < 80; tries++) {
    const kind = n === 0 || R.chance(0.6) ? 'mound' : 'cliff';
    const nx = kind === 'mound' ? R.int(20, 28) : R.int(28, 36), nz = kind === 'mound' ? R.int(20, 28) : R.int(10, 14), ny = kind === 'mound' ? R.int(11, 15) : R.int(16, 20);
    let x, z;
    const sites = ctx.sites || [];
    if (sites.length && tries % 3 !== 2) {
      const s = R.pick(sites), a = R.float(0, Math.PI * 2), d = (s.radius || 8) + R.float(13, 26);
      x = s.x + Math.cos(a) * d; z = s.z + Math.sin(a) * d;
    } else { const a = R.float(0, Math.PI * 2), d = R.float(50, lim); x = Math.cos(a) * d; z = Math.sin(a) * d; }
    const hx = nx * CELL / 2, hz = nz * CELL / 2, rad = Math.hypot(hx, hz) + 2;
    if (Math.abs(x) + hx > lim || Math.abs(z) + hz > lim || ctx.avoid(x, z, rad)) continue;
    if (out.some((o) => Math.hypot(o.x + o.nx * CELL / 2 - x, o.z + o.nz * CELL / 2 - z) < rad + Math.hypot(o.nx, o.nz) * CELL / 2 + 8)) continue;
    let lo = 1e9, hi = -1e9;
    for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const h = T.heightAt(x + a * hx * 0.8, z + b * hz * 0.8); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    if (hi - lo > 1.8 || lo < flood + 0.6) continue;
    // cave mouth faces the lowest edge
    const edges = [T.heightAt(x + hx, z), T.heightAt(x, z + hz), T.heightAt(x - hx, z), T.heightAt(x, z - hz)];
    const dir = edges.indexOf(Math.min(...edges));
    out.push({ id: out.length, kind, x: x - hx, y: lo - CELL, z: z - hz, nx, ny, nz, seed: (R.next() * 4294967296) >>> 0, cave: kind === 'mound' && R.chance(0.6) && edges[dir] < lo + 1.0, dir });
    n++;
  }
  return out;
}

/** mineshaft volumes: a rock face in the corner of ore-vein / cavern rooms. ctx: { seed, layout:{rooms, ox, oz, cell, y, entrance, core, generator, arena}, doors:[{pos}] } */
export function planIndoor(ctx) {
  const L = ctx.layout, R = new RNG((ctx.seed ^ 0x51ab7) >>> 0), out = [];
  const C = L.cell || 4, W = 6, D = 6;
  const ok = (r) => (r.w * r.h >= 2) && ['ore_vein', 'cavern', 'minecart_depot', 'crew_quarters', 'supply_cache'].includes(r.type) && !r.maze
    && r.id !== L.entrance?.room && r !== L.core && r !== L.generator && r !== L.arena && r.id !== L.core?.id && r.id !== L.generator?.id;
  const rooms = (L.rooms || []).filter(ok).sort((a, b) => (a.type === 'ore_vein' ? 0 : 1) - (b.type === 'ore_vein' ? 0 : 1) || a.id - b.id);
  const want = clamp(1 + (R.chance(0.5) ? 1 : 0), 1, 2);
  for (const r of rooms) {
    if (out.length >= want) break;
    const rx0 = L.ox + r.x * C, rz0 = L.oz + r.z * C, rx1 = rx0 + r.w * C, rz1 = rz0 + r.h * C, sx = W * CELL, sz = D * CELL, inset = 0.7;
    const corners = [[rx0 + inset, rz0 + inset], [rx1 - inset - sx, rz0 + inset], [rx0 + inset, rz1 - inset - sz], [rx1 - inset - sx, rz1 - inset - sz]];
    const start = R.int(0, 3);
    for (let k = 0; k < 4; k++) {
      const [cx, cz] = corners[(start + k) % 4];
      const blocked = (ctx.doors || []).some((d) => d.pos && d.pos.x > cx - 2.4 && d.pos.x < cx + sx + 2.4 && d.pos.z > cz - 2.4 && d.pos.z < cz + sz + 2.4);
      if (blocked) continue;
      const ny = clamp(Math.floor(((r.height || 4) - 0.7) / CELL), 4, 6);
      out.push({ id: out.length, kind: 'slab', x: cx, y: L.y, z: cz, nx: W, ny, nz: D, seed: (R.next() * 4294967296) >>> 0, cave: false, dir: 0 });
      break;
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ greedy meshing
const VAR = [0.9, 1.0, 1.08];
const newBuf = () => ({ p: [], n: [], c: [], i: [] });
const fin = (b) => (b.i.length ? { p: new Float32Array(b.p), n: new Float32Array(b.n), c: new Float32Array(b.c), i: new Uint32Array(b.i) } : null);

/** greedy mesh of one 16^3 chunk -> { a: lit (Lambert) buffers | null, b: unlit (glowing) buffers | null }, positions in volume-local metres.
 *  A face belongs to the chunk that owns the solid cell behind it, so neighbouring chunks never duplicate faces. */
export function meshChunk(vol, cx, cy, cz) {
  const out = { a: newBuf(), b: newBuf() };
  const base = [cx * CH, cy * CH, cz * CH];
  const size = [Math.min(CH, vol.nx - base[0]), Math.min(CH, vol.ny - base[1]), Math.min(CH, vol.nz - base[2])];
  const pos = [0, 0, 0];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, w = (d + 2) % 3, su = size[u], sw = size[w];
    const mask = new Int32Array(su * sw);
    for (let s = -1; s < size[d]; s++) {
      let n = 0;
      for (let j = 0; j < sw; j++) for (let i = 0; i < su; i++, n++) {
        pos[d] = base[d] + s; pos[u] = base[u] + i; pos[w] = base[w] + j;
        const a = vol.get(pos[0], pos[1], pos[2]);
        pos[d] += 1;
        const b = vol.get(pos[0], pos[1], pos[2]);
        let k = 0;
        if ((a !== 0) !== (b !== 0)) {
          const side = a !== 0 ? 0 : 1, own = a !== 0 ? a : b;
          if ((side === 0 && s >= 0) || (side === 1 && s < size[d] - 1)) {
            const gx = pos[0] - (side === 0 ? (d === 0 ? 1 : 0) : 0), gy = pos[1] - (side === 0 ? (d === 1 ? 1 : 0) : 0), gz = pos[2] - (side === 0 ? (d === 2 ? 1 : 0) : 0);
            const variant = own <= M.DEEP ? hash3(gx, gy, gz) % 3 : 1;
            k = ((own * 3 + variant) << 1 | side) + 1;
          }
        }
        mask[n] = k;
      }
      n = 0;
      for (let j = 0; j < sw; j++) for (let i = 0; i < su;) {
        const k = mask[n];
        if (!k) { i++; n++; continue; }
        let ww = 1;
        while (i + ww < su && mask[n + ww] === k) ww++;
        let hh = 1;
        outer: for (; j + hh < sw; hh++) for (let q = 0; q < ww; q++) if (mask[n + q + hh * su] !== k) break outer;
        const kk = k - 1, side = kk & 1, mv = kk >> 1, variant = mv % 3, mat = (mv - variant) / 3, def = MATS[mat];
        const buf = def.lit ? out.b : out.a, o = buf.p.length / 3;
        const plane = (base[d] + s + 1) * CELL, u0 = (base[u] + i) * CELL, w0 = (base[w] + j) * CELL, u1 = u0 + ww * CELL, w1 = w0 + hh * CELL;
        const corner = (uu, vv) => { const p = [0, 0, 0]; p[d] = plane; p[u] = uu; p[w] = vv; return p; };
        const vs = [corner(u0, w0), corner(u1, w0), corner(u1, w1), corner(u0, w1)];
        const nrm = [0, 0, 0]; nrm[d] = side ? -1 : 1;
        const shade = def.lit ? 1 : (d === 1 ? (side ? 0.6 : 1.0) : d === 0 ? 0.84 : 0.74) * VAR[variant];
        for (const p of vs) { buf.p.push(p[0], p[1], p[2]); buf.n.push(nrm[0], nrm[1], nrm[2]); buf.c.push(def.col[0] * shade, def.col[1] * shade, def.col[2] * shade); }
        if (side === 0) buf.i.push(o, o + 1, o + 2, o, o + 2, o + 3); else buf.i.push(o, o + 2, o + 1, o, o + 3, o + 2);
        for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) mask[n + x + y * su] = 0;
        i += ww; n += ww;
      }
    }
  }
  return { a: fin(out.a), b: fin(out.b) };
}

// ------------------------------------------------------------------------------------------------ ray (voxel DDA)
/** first solid cell along a world ray inside `vol`: { i, x, y, z, n:[nx,ny,nz], t } or null. n = normal of the face that was entered */
export function raycast(vol, ox, oy, oz, dx, dy, dz, maxDist) {
  const o = [(ox - vol.x) / CELL, (oy - vol.y) / CELL, (oz - vol.z) / CELL], d = [dx, dy, dz], dim = [vol.nx, vol.ny, vol.nz], max = maxDist / CELL;
  let t0 = 0, t1 = max;
  const n0 = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < 0 || o[a] > dim[a]) return null; continue; }
    let ta = (0 - o[a]) / d[a], tb = (dim[a] - o[a]) / d[a];
    if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) { t0 = ta; n0.fill(0); n0[a] = d[a] > 0 ? -1 : 1; }
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  const p = [o[0] + d[0] * (t0 + 1e-5), o[1] + d[1] * (t0 + 1e-5), o[2] + d[2] * (t0 + 1e-5)];
  const c = [Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])];
  for (let a = 0; a < 3; a++) c[a] = clamp(c[a], 0, dim[a] - 1);
  const step = d.map((v) => (v > 0 ? 1 : -1)), tD = d.map((v) => (Math.abs(v) < 1e-9 ? Infinity : Math.abs(1 / v)));
  const tM = c.map((ci, a) => (Math.abs(d[a]) < 1e-9 ? Infinity : ((d[a] > 0 ? ci + 1 : ci) - p[a]) / d[a]));
  let t = t0, n = n0;
  for (let guard = 0; guard < 400; guard++) {
    if (vol.data[vol.idx(c[0], c[1], c[2])]) return { i: vol.idx(c[0], c[1], c[2]), x: c[0], y: c[1], z: c[2], n, t: t * CELL };
    const a = tM[0] < tM[1] ? (tM[0] < tM[2] ? 0 : 2) : (tM[1] < tM[2] ? 1 : 2);
    t = t0 + tM[a]; if (t > t1) return null;
    c[a] += step[a]; tM[a] += tD[a];
    if (c[a] < 0 || c[a] >= dim[a]) return null;
    n = [0, 0, 0]; n[a] = -step[a];
  }
  return null;
}

// ------------------------------------------------------------------------------------------------ cave-in rules
/** how much "undermined" volume is around cell (x,y,z): player-dug cells in a 7x5x7 box minus relief from support beams inside it */
export function stress(vol, x, y, z) {
  let dug = 0, beams = 0;
  for (let yy = y - 1; yy <= y + 3; yy++) for (let zz = z - 3; zz <= z + 3; zz++) for (let xx = x - 3; xx <= x + 3; xx++) {
    if (!vol.inb(xx, yy, zz)) continue;
    const i = vol.idx(xx, yy, zz);
    if (vol.dug[i] && !vol.data[i]) dug++; else if (vol.data[i] === M.BEAM) beams++;
  }
  return dug - beams * MN.beamRelief;
}
export const isUnstable = (vol, x, y, z) => stress(vol, x, y, z) > MN.stress;
/** cells that fall (<= 14): the two solid layers above the dug spot inside a 3x3 footprint, never bedrock / beams */
export function collapseCells(vol, x, y, z) {
  let ty = y + 1;
  while (ty < vol.ny && !vol.get(x, ty, z)) ty++;
  const out = [];
  if (ty >= vol.ny) return out;
  for (let yy = ty; yy < Math.min(vol.ny, ty + 2); yy++) for (let zz = z - 1; zz <= z + 1; zz++) for (let xx = x - 1; xx <= x + 1; xx++) {
    const m = vol.get(xx, yy, zz);
    if (m && m !== M.BEDROCK && m !== M.BEAM && out.length < 14) out.push(vol.idx(xx, yy, zz));
  }
  return out;
}

/** ore drop bookkeeping (host): allow a drop while the per-day value / item caps are not reached. state = { value, items } */
export function oreDropOk(state, mat) {
  const d = MATS[mat]?.drop;
  if (!d) return false;
  if (!d.val) return true;   // beams / torches come back for free
  return state.value + d.val <= MN.valueCap + 8 && state.items < MN.itemCap;
}

/** balance helper: expected max ore credits of a plan (all ore mined) vs the daily cap */
export function planOreValue(vols) { let v = 0; for (const vol of vols) for (let m = M.COPPER; m <= M.CRYSTAL; m++) v += vol.count(m) * MATS[m].drop.val; return v; }
