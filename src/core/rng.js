// Deterministic seeded RNG helpers (sfc32 + string hashing).
// Every peer must generate the same world from the same seed, so world gen only uses these.

export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export class RNG {
  constructor(seed = 1) {
    if (typeof seed === 'string') seed = hashString(seed);
    this.a = seed >>> 0;
    this.b = (seed * 16807) >>> 0 || 0x9e3779b9;
    this.c = (seed ^ 0xdeadbeef) >>> 0;
    this.d = 1;
    for (let i = 0; i < 15; i++) this.next();
  }
  next() {
    let { a, b, c, d } = this;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return (t >>> 0) / 4294967296;
  }
  float(min = 0, max = 1) { return min + (max - min) * this.next(); }
  int(min, max) { return Math.floor(min + (max - min + 1) * this.next()); } // inclusive
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  weighted(entries, weightKey = 'w') {
    let total = 0;
    for (const e of entries) total += e[weightKey];
    let r = this.next() * total;
    for (const e of entries) { r -= e[weightKey]; if (r <= 0) return e; }
    return entries[entries.length - 1];
  }
  fork(salt) { return new RNG((Math.floor(this.next() * 4294967296) ^ hashString(String(salt))) >>> 0); }
  fn() { return () => this.next(); }
}

// Smooth value noise (2D), deterministic from a seed, for terrain.
export class Noise2D {
  constructor(seed) {
    const r = new RNG(seed);
    this.perm = new Uint8Array(512);
    const p = [...Array(256).keys()];
    r.shuffle(p);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.vals = new Float32Array(256);
    for (let i = 0; i < 256; i++) this.vals[i] = r.next() * 2 - 1;
  }
  lattice(ix, iz) { return this.vals[this.perm[(ix & 255) + this.perm[iz & 255]]]; }
  noise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    const a = this.lattice(ix, iz), b = this.lattice(ix + 1, iz);
    const c = this.lattice(ix, iz + 1), d = this.lattice(ix + 1, iz + 1);
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sz;
  }
  fbm(x, z, oct = 4, lac = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += this.noise(x * freq, z * freq) * amp;
      norm += amp; amp *= gain; freq *= lac;
    }
    return sum / norm;
  }
  ridged(x, z, oct = 4) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += (1 - Math.abs(this.noise(x * freq, z * freq))) * amp;
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  }
}

export function randomId(len = 8) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) s += chars[buf[i] % chars.length];
  return s;
}

export function lobbyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 6; i++) s += chars[buf[i] % chars.length];
  return s;
}
