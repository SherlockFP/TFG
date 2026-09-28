// SIEGE core (wave 2): numbers, wave planning, rewards and the outdoor FLOW FIELD. Pure data + helpers, no DOM / game
// access (node-testable: tools/harness/wave2_siege_core.mjs). docs/wave2/siege.md has the tables and the reasoning.

export const HULL = { x0: -8.3, x1: 7.6, z0: -4.2, z1: 4.2 };   // the ship's attackable footprint (world origin, door on +z at x 2.6)
export const DOOR = { x: 2.6, halfW: 1.5, z: 3.75 };

export const TUNE = {
  minQuotaIndex: 1,          // "never before quota 2": run.quotaIndex 0 is quota #1
  prep: 60, waveCap: 75, lull: 18, spawnPerSec: 3, maxAlive: 40,
  clockSlow: 0.35,           // the day clock runs at 35 % while a siege is on (the autopilot must not leave mid-siege)
  hullMax: 100, doorHp: 260,
  nightFrom: 18 * 60, nightUntil: 22.5 * 60, nightChance: 0.012,   // per 10 s check while HUNTED (threat >= 50) => ~25 % per night
  extractionChance: 0.7, hullPatch: 10, doorPatch: 60,
  raidEvery: 9,              // s: at hull 0 a creature steals / breaks one piece of ship scrap
};

// Creature stats (registered as creatures sg_*). hull = hull integrity points per second while attacking the hull.
export const SG = {
  sg_swarmer: { name: 'Spam Swarmer', model: 'scuttler', hp: 26, dmg: 6, run: 5.0, cd: 1.0, hull: 0.14, dep: 6, reach: 1.25, radius: 0.5, height: 0.6, xp: 8, coin: 1, scale: 1 },
  sg_runner: { name: 'Doomscroller', model: 'hound', hp: 70, dmg: 14, run: 8.8, cd: 0.8, hull: 0.30, dep: 12, reach: 1.5, radius: 0.7, height: 1.1, xp: 20, coin: 3, scale: 0.9, hunt: 28 },
  sg_brute: { name: 'Buffering Blob', model: 'sludge', hp: 330, dmg: 30, run: 2.4, cd: 1.8, hull: 1.1, dep: 40, reach: 2.0, radius: 1.0, height: 1.2, xp: 60, coin: 9, scale: 1.25, deps: 12 },
  sg_boss: { name: 'Viral Behemoth', model: 'crawler', hp: 2200, dmg: 55, run: 3.4, cd: 2.0, hull: 3.0, dep: 90, reach: 2.8, radius: 1.5, height: 2.6, xp: 320, coin: 50, scale: 2.4, deps: 16 },
};

export const distToHull = (x, z) => {
  const dx = Math.max(HULL.x0 - x, 0, x - HULL.x1), dz = Math.max(HULL.z0 - z, 0, z - HULL.z1);
  return Math.hypot(dx, dz);
};
export const nearDoor = (x, z) => Math.abs(x - DOOR.x) < DOOR.halfW && z > 0 && z > HULL.z1 - 3 && Math.abs(z - DOOR.z) < 4.5;

// ---------------------------------------------------------------------------------------------- scaling
const CREW = [1, 1, 1.35, 1.7, 2.0];
const REASON = { extraction: 1.0, night: 0.95, breach: 1.2, contract: 1.1, debug: 1.0 };
/** wave power P = sector x crew x threat x reason (clamped) */
export function siegePower({ quotaIndex = 1, crew = 1, threat = 0, reason = 'debug' } = {}) {
  const sector = 1 + 0.1 * Math.min(14, Math.max(0, quotaIndex));
  const c = crew <= 4 ? CREW[Math.max(1, crew)] : 2.0 + 0.25 * (crew - 4);
  const th = 0.85 + 0.6 * Math.min(100, Math.max(0, threat)) / 100;
  const p = sector * c * th * (REASON[reason] || 1);
  return { sector, crew: c, threat: th, reason: REASON[reason] || 1, power: Math.min(3.4, Math.max(0.75, p)) };
}
/** 3..5 waves: 3 + one per 1.0 of power above 1.2 (rounded), +1 on a breach night, never more than fits before midnight */
export function waveCount(P, reason = 'debug', secLeft = 1e9) {
  let n = 3 + (P >= 1.6 ? 1 : 0) + (P >= 2.4 ? 1 : 0) + (reason === 'breach' && P >= 1.3 ? 1 : 0);
  n = Math.min(5, n);
  const per = TUNE.waveCap * 0.75 + TUNE.lull;
  while (n > 3 && TUNE.prep + n * per > secLeft) n--;
  return n;
}
/** what wave w (1-based) of W contains */
export function planWave(w, W, P) {
  const swarm = Math.min(40, Math.round(P * (5 + 2.5 * w)));
  const tank = w >= 2 ? Math.min(6, Math.floor(P * 0.55 * Math.pow(w - 1, 0.8) + 0.3)) : 0;
  const runner = w >= 2 ? Math.min(12, Math.round(P * (0.8 + 0.5 * w))) : 0;
  const boss = w % 3 === 0 ? 1 : 0;
  const final = w === W;
  return { w, swarm, tank: tank + (final && !boss && P >= 1.4 ? 1 : 0), runner, boss, final, total: swarm + tank + runner + boss };
}
/** boss HP scales with the crew: 2200 x (0.75 + 0.25 x crew) x (1 + 0.05 x quotaIndex) */
export const bossHp = (crew, qi) => Math.round(SG.sg_boss.hp * (0.75 + 0.25 * Math.min(4, crew)) * (1 + 0.05 * Math.min(14, qi)));

/** per-wave reward: credits + component drops (kind, n) */
export function waveReward(w, W, qi, crew) {
  const credits = Math.round((30 + 12 * qi) * (1 + 0.15 * w) * (0.85 + 0.15 * Math.min(4, crew)));
  const drops = [['metal', 2 + w], ['electronic', 1 + Math.ceil(w / 2)]];
  if (w >= 3) drops.push(['arcane', 1]);
  if (w === W) drops.push(['electronic', 2]);
  return { credits, drops };
}
/** SIEGE HELD bonus */
export function heldReward(qi, crew, hull) {
  const credits = Math.round((120 + 45 * qi) * (0.8 + 0.2 * Math.min(4, crew)) * (0.6 + 0.4 * hull / 100));
  return { credits, xp: 180 + 45 * qi, coin: 30 + 8 * qi };
}

// ---------------------------------------------------------------------------------------------- flow field
/**
 * Coarse grid around the whole play area with a Dijkstra distance field FROM the ship. Barricades / solid deployables
 * add a crossing cost (25 / 6) instead of blocking, so a fully walled ship still has a route: creatures walk up to the
 * cheapest barricade and chew through it ("nav blocking" outdoors; the facility interior uses NavGrid.blockBox).
 */
export class FlowField {
  constructor(half = 130, cell = 2) {
    this.cell = cell;
    this.n = Math.max(16, Math.ceil((half * 2) / cell));
    this.o = -(this.n * cell) / 2;
    const N = this.n * this.n;
    this.pen = new Float32Array(N);
    this.block = new Uint8Array(N);
    this.goal = new Uint8Array(N);
    this.dist = new Float32Array(N);
    this._hk = new Float32Array(N * 8 + 16);
    this._hi = new Int32Array(N * 8 + 16);
    this.dirty = true;
    this.setShip();
  }
  idx(x, z) {
    const gx = Math.floor((x - this.o) / this.cell), gz = Math.floor((z - this.o) / this.cell);
    if (gx < 0 || gz < 0 || gx >= this.n || gz >= this.n) return -1;
    return gz * this.n + gx;
  }
  center(i) { return { x: this.o + ((i % this.n) + 0.5) * this.cell, z: this.o + (Math.floor(i / this.n) + 0.5) * this.cell }; }
  setShip(blockPad = 1.0, ringOuter = 3.3) {
    const n = this.n;
    this.block.fill(0); this.goal.fill(0);
    for (let i = 0; i < n * n; i++) {
      const c = this.center(i), d = distToHull(c.x, c.z);
      if (d < blockPad) this.block[i] = 1;
      else if (d <= ringOuter) this.goal[i] = 1;
    }
    this.dirty = true;
  }
  /** blockers: [{ x, z, hx, hz, yaw, cost }] (oriented boxes; yaw 0 = long side along x) */
  setBlockers(list) {
    this.pen.fill(0);
    const n = this.n, h = this.cell * 0.6;
    for (const b of list) {
      const R = Math.hypot(b.hx, b.hz) + h;
      const g0 = Math.max(0, Math.floor((b.x - R - this.o) / this.cell)), g1 = Math.min(n - 1, Math.floor((b.x + R - this.o) / this.cell));
      const z0 = Math.max(0, Math.floor((b.z - R - this.o) / this.cell)), z1 = Math.min(n - 1, Math.floor((b.z + R - this.o) / this.cell));
      const cs = Math.cos(b.yaw || 0), sn = Math.sin(b.yaw || 0);
      for (let gz = z0; gz <= z1; gz++) for (let gx = g0; gx <= g1; gx++) {
        const px = this.o + (gx + 0.5) * this.cell - b.x, pz = this.o + (gz + 0.5) * this.cell - b.z;
        const lx = px * cs - pz * sn, lz = px * sn + pz * cs;   // into the box frame (yaw rotates x toward -z)
        if (Math.abs(lx) <= b.hx + h && Math.abs(lz) <= b.hz + h) this.pen[gz * n + gx] += b.cost;
      }
    }
    this.dirty = true;
  }
  compute() {
    const n = this.n, N = n * n, dist = this.dist, hk = this._hk, hi = this._hi, pen = this.pen, block = this.block;
    dist.fill(Infinity);
    let hs = 0, pk = 0;
    const push = (k, i) => {
      let c = hs++;
      while (c > 0) { const p = (c - 1) >> 1; if (hk[p] <= k) break; hk[c] = hk[p]; hi[c] = hi[p]; c = p; }
      hk[c] = k; hi[c] = i;
    };
    const pop = () => {
      const ti = hi[0]; pk = hk[0]; hs--;
      if (hs > 0) {
        const k = hk[hs], i = hi[hs];
        let c = 0;
        for (;;) {
          let l = 2 * c + 1;
          if (l >= hs) break;
          if (l + 1 < hs && hk[l + 1] < hk[l]) l++;
          if (hk[l] >= k) break;
          hk[c] = hk[l]; hi[c] = hi[l]; c = l;
        }
        hk[c] = k; hi[c] = i;
      }
      return ti;
    };
    for (let i = 0; i < N; i++) if (this.goal[i] && !block[i]) { dist[i] = 0; push(0, i); }
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];
    while (hs > 0) {
      const i = pop(), d0 = pk;
      if (d0 > dist[i]) continue;
      const x = i % n, z = (i / n) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k], nz = z + DZ[k];
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const ni = nz * n + nx;
        if (block[ni]) continue;
        if (k >= 4 && (block[z * n + nx] || block[nz * n + x])) continue;
        const nd = d0 + (k >= 4 ? 1.4142 : 1) + pen[ni];
        if (nd < dist[ni]) { dist[ni] = nd; push(nd, ni); }
      }
    }
    this.dirty = false;
  }
  /** crossing cost of the cell under (x, z) */
  penAt(x, z) { const i = this.idx(x, z); return i < 0 ? 0 : this.pen[i]; }
  distAt(x, z) { const i = this.idx(x, z); return i < 0 ? Infinity : this.dist[i]; }
  /** unit step (out.x, out.z) towards the ship along the steepest descent; false when there is nothing lower (arrived / unreachable) */
  dirAt(x, z, out) {
    const i = this.idx(x, z), n = this.n;
    if (i < 0) { const l = Math.hypot(x, z) || 1; out.x = -x / l; out.z = -z / l; return true; }
    const d0 = this.dist[i];
    const gx = i % n, gz = (i / n) | 0;
    let best = d0, bx = 0, bz = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = gx + dx, nz = gz + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const nd = this.dist[nz * n + nx];
      if (nd < best - 1e-4) { best = nd; bx = dx; bz = dz; }
    }
    if (!bx && !bz) return false;
    const cx = this.o + (gx + bx + 0.5) * this.cell, cz = this.o + (gz + bz + 0.5) * this.cell;
    const vx = cx - x, vz = cz - z, l = Math.hypot(vx, vz) || 1;
    out.x = vx / l; out.z = vz / l;
    return true;
  }
}

/** oriented box test (yaw as FlowField.setBlockers) */
export function inBox(px, pz, b, pad = 0) {
  const dx = px - b.x, dz = pz - b.z, cs = Math.cos(b.yaw || 0), sn = Math.sin(b.yaw || 0);
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  return Math.abs(lx) <= b.hx + pad && Math.abs(lz) <= b.hz + pad;
}
