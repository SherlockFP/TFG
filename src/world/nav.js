// Grid navigation for the facility interior: 1 m sub-cells inside 4 m layout cells.
// Movement between sub-cells in different layout cells requires the layout edge to be open.
// A* with a binary heap on typed arrays.

export class NavGrid {
  constructor(layout, res = 1) {
    this.layout = layout;
    this.res = res;
    this.sub = Math.round(layout.cell / res);          // sub-cells per layout cell
    this.w = layout.w * this.sub;
    this.h = layout.h * this.sub;
    this.ox = layout.ox; this.oz = layout.oz; this.y = layout.y;
    this.walk = new Uint8Array(this.w * this.h);
    for (let z = 0; z < this.h; z++) {
      for (let x = 0; x < this.w; x++) {
        const cx = Math.floor(x / this.sub), cz = Math.floor(z / this.sub);
        if (layout.cells[cz * layout.w + cx] > 0) this.walk[z * this.w + x] = 1;
      }
    }
    this.blockedEdges = new Set();   // dynamic: closed blast doors etc (layout edge keys)
    const n = this.w * this.h;
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closedStamp = new Uint32Array(n);
    this.curStamp = 1;
    this.heap = new Int32Array(n);
  }

  blockBox(minX, minZ, maxX, maxZ, pad = 0.25) {
    const x0 = Math.floor((minX - pad - this.ox) / this.res), x1 = Math.floor((maxX + pad - this.ox) / this.res);
    const z0 = Math.floor((minZ - pad - this.oz) / this.res), z1 = Math.floor((maxZ + pad - this.oz) / this.res);
    for (let z = Math.max(0, z0); z <= Math.min(this.h - 1, z1); z++) {
      for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) {
        // only block if the box covers most of the sub-cell center
        const cx = this.ox + (x + 0.5) * this.res, cz = this.oz + (z + 0.5) * this.res;
        if (cx >= minX - pad && cx <= maxX + pad && cz >= minZ - pad && cz <= maxZ + pad) this.walk[z * this.w + x] = 0;
      }
    }
  }

  toGrid(x, z) {
    return [Math.floor((x - this.ox) / this.res), Math.floor((z - this.oz) / this.res)];
  }
  toWorld(gx, gz) { return { x: this.ox + (gx + 0.5) * this.res, z: this.oz + (gz + 0.5) * this.res }; }
  inside(gx, gz) { return gx >= 0 && gz >= 0 && gx < this.w && gz < this.h; }
  isWalkable(gx, gz) { return this.inside(gx, gz) && this.walk[gz * this.w + gx] === 1; }
  walkableAt(x, z) { const [gx, gz] = this.toGrid(x, z); return this.isWalkable(gx, gz); }

  // can we step from sub-cell a to orthogonal neighbor b?
  canStep(ax, az, bx, bz) {
    if (!this.isWalkable(bx, bz)) return false;
    const s = this.sub;
    const acx = Math.floor(ax / s), acz = Math.floor(az / s), bcx = Math.floor(bx / s), bcz = Math.floor(bz / s);
    if (acx === bcx && acz === bcz) return true;
    const L = this.layout;
    let key;
    if (bcx > acx) key = L.edgeKey(acx, acz, 0);
    else if (bcx < acx) key = L.edgeKey(acx, acz, 2);
    else if (bcz > acz) key = L.edgeKey(acx, acz, 1);
    else key = L.edgeKey(acx, acz, 3);
    if (!L.open.has(key)) return false;
    if (this.blockedEdges.has(key)) return false;
    const info = L.edgeInfo.get(key);
    if (info && info.width < L.cell - 0.5) {
      // only through the doorway: the sub-cells in the middle of the edge
      const along = bcx !== acx ? az % s : ax % s;
      const half = Math.max(1, Math.round(info.width / 2 / this.res));
      const mid = s / 2;
      if (along < mid - half || along >= mid + half) return false;
    }
    return true;
  }

  nearestWalkable(gx, gz, maxR = 4) {
    if (this.isWalkable(gx, gz)) return [gx, gz];
    for (let r = 1; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        if (this.isWalkable(gx + dx, gz + dz)) return [gx + dx, gz + dz];
      }
    }
    return null;
  }

  // Returns array of world {x,z} waypoints (smoothed) or null
  findPath(sx, sz, tx, tz, maxIter = 12000) {
    let s = this.nearestWalkable(...this.toGrid(sx, sz));
    let t = this.nearestWalkable(...this.toGrid(tx, tz));
    if (!s || !t) return null;
    const W = this.w;
    const start = s[1] * W + s[0], goal = t[1] * W + t[0];
    if (start === goal) return [{ x: tx, z: tz }];
    this.curStamp++;
    if (this.curStamp > 4e9) { this.stamp.fill(0); this.closedStamp.fill(0); this.curStamp = 1; }
    const st = this.curStamp;
    const g = this.g, f = this.f, parent = this.parent, heap = this.heap;
    let hs = 0;
    const h = (i) => { const x = i % W, z = (i / W) | 0; const dx = Math.abs(x - t[0]), dz = Math.abs(z - t[1]); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); };
    const push = (i) => {
      let k = hs++; heap[k] = i;
      while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[heap[k]]) break; const tmp = heap[p]; heap[p] = heap[k]; heap[k] = tmp; k = p; }
    };
    const pop = () => {
      const top = heap[0]; heap[0] = heap[--hs];
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < hs && f[heap[l]] < f[heap[m]]) m = l;
        if (r < hs && f[heap[r]] < f[heap[m]]) m = r;
        if (m === k) break;
        const tmp = heap[m]; heap[m] = heap[k]; heap[k] = tmp; k = m;
      }
      return top;
    };
    g[start] = 0; f[start] = h(start); parent[start] = -1; this.stamp[start] = st; push(start);
    let iter = 0, found = false;
    const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    while (hs > 0 && iter++ < maxIter) {
      const cur = pop();
      if (cur === goal) { found = true; break; }
      if (this.closedStamp[cur] === st) continue;
      this.closedStamp[cur] = st;
      const cx = cur % W, cz = (cur / W) | 0;
      for (const [dx, dz, cost] of NB) {
        const nx = cx + dx, nz = cz + dz;
        if (dx !== 0 && dz !== 0) {
          if (!this.canStep(cx, cz, cx + dx, cz) || !this.canStep(cx, cz, cx, cz + dz)) continue;
          if (!this.canStep(cx + dx, cz, nx, nz) || !this.canStep(cx, cz + dz, nx, nz)) continue;
        } else if (!this.canStep(cx, cz, nx, nz)) continue;
        const ni = nz * W + nx;
        if (this.closedStamp[ni] === st) continue;
        const ng = g[cur] + cost;
        if (this.stamp[ni] !== st || ng < g[ni]) {
          this.stamp[ni] = st; g[ni] = ng; f[ni] = ng + h(ni); parent[ni] = cur; push(ni);
        }
      }
    }
    if (!found) return null;
    const cellsPath = [];
    for (let i = goal; i !== -1; i = parent[i]) cellsPath.push(i);
    cellsPath.reverse();
    // string-pull smoothing with grid line-of-sight
    const pts = [];
    let anchor = 0;
    for (let i = 2; i < cellsPath.length; i++) {
      if (!this.gridLOS(cellsPath[anchor], cellsPath[i])) {
        pts.push(cellsPath[i - 1]);
        anchor = i - 1;
      }
    }
    pts.push(goal);
    const out = pts.map((i) => this.toWorld(i % W, (i / W) | 0));
    out[out.length - 1] = { x: tx, z: tz };
    if (!this.walkableAt(tx, tz)) out[out.length - 1] = this.toWorld(t[0], t[1]);
    return out;
  }

  // Bresenham-style walk checking steps
  gridLOS(a, b) {
    const W = this.w;
    let x0 = a % W, z0 = (a / W) | 0;
    const x1 = b % W, z1 = (b / W) | 0;
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    let guard = 0;
    while ((x0 !== x1 || z0 !== z1) && guard++ < 400) {
      const e2 = 2 * err;
      let nx = x0, nz = z0;
      if (e2 > -dz) { err -= dz; nx += sx; }
      if (e2 < dx) { err += dx; nz += sz; }
      if (nx !== x0 && nz !== z0) {
        if (!this.canStep(x0, z0, nx, z0) || !this.canStep(nx, z0, nx, nz)) return false;
        if (!this.canStep(x0, z0, x0, nz) || !this.canStep(x0, nz, nx, nz)) return false;
      } else if (!this.canStep(x0, z0, nx, nz)) return false;
      x0 = nx; z0 = nz;
    }
    return true;
  }

  // Walking distance (metres, 8-connected, respects doorways/blocked edges) from a world point to every
  // reachable sub-cell, up to maxDist. Unreached cells stay Infinity. Used for spawn fairness near exits.
  distanceField(x, z, maxDist = 60) {
    const n = this.w * this.h, W = this.w;
    const dist = new Float32Array(n).fill(Infinity);
    const s = this.nearestWalkable(...this.toGrid(x, z));
    if (!s) return dist;
    const start = s[1] * W + s[0];
    dist[start] = 0;
    // small binary heap on (dist, index)
    const heap = [start];
    const less = (a, b) => dist[a] < dist[b];
    const push = (i) => { heap.push(i); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (!less(heap[k], heap[p])) break; [heap[k], heap[p]] = [heap[p], heap[k]]; k = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === k) break; [heap[k], heap[m]] = [heap[m], heap[k]]; k = m; } } return top; };
    const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    const done = new Uint8Array(n);
    while (heap.length) {
      const cur = pop();
      if (done[cur]) continue;
      done[cur] = 1;
      const cd = dist[cur];
      if (cd > maxDist) break;
      const cx = cur % W, cz = (cur / W) | 0;
      for (const [dx, dz, cost] of NB) {
        const nx = cx + dx, nz = cz + dz;
        if (dx !== 0 && dz !== 0) {
          if (!this.canStep(cx, cz, cx + dx, cz) || !this.canStep(cx, cz, cx, cz + dz)) continue;
          if (!this.canStep(cx + dx, cz, nx, nz) || !this.canStep(cx, cz + dz, nx, nz)) continue;
        } else if (!this.canStep(cx, cz, nx, nz)) continue;
        const ni = nz * W + nx;
        const nd = cd + cost * this.res;
        if (nd < dist[ni]) { dist[ni] = nd; push(ni); }
      }
    }
    return dist;
  }
  // look up a distanceField() result at a world position (Infinity when off-grid / unreachable)
  fieldAt(field, x, z) {
    const g = this.nearestWalkable(...this.toGrid(x, z), 2);
    return g ? field[g[1] * this.w + g[0]] : Infinity;
  }

  randomWalkable(rng, nearX, nearZ, radius) {
    for (let i = 0; i < 60; i++) {
      let gx, gz;
      if (nearX !== undefined) {
        const [cx, cz] = this.toGrid(nearX, nearZ);
        gx = cx + Math.round((rng() * 2 - 1) * radius); gz = cz + Math.round((rng() * 2 - 1) * radius);
      } else { gx = Math.floor(rng() * this.w); gz = Math.floor(rng() * this.h); }
      if (this.isWalkable(gx, gz)) return this.toWorld(gx, gz);
    }
    return null;
  }
}
