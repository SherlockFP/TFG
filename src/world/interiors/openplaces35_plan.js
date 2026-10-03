// Three bounded authored places. Native facility build/nav/cargo/lift remain owners.
import { RNG } from '../../core/rng.js';
const THEMES = Object.freeze({ courtyard: 'factory', concourse: 'greenhouse', reception: 'backrooms' });
export function planOpenPlace35(seed, theme, size, opts, { cell = 4, y = -300 } = {}) {
  const request = opts?.open35, kind = typeof request === 'string' ? request : request?.version === 35 ? request.kind : null;
  if (THEMES[kind] !== theme || opts?.arena || opts?.labyrinth || opts?.wings) return null;
  const O = { ...opts }, W = Math.round(24 + size * 14), H = W;
  const cells = new Uint8Array(W * H), roomOf = new Int16Array(W * H).fill(-1), heightOf = new Float32Array(W * H);
  const zoneMask = new Uint8Array(W * H), rooms = [], open = new Set(), edgeInfo = new Map();
  const idx = (x, z) => z * W + x;
  const edgeKey = (x, z, dir) => { if (dir === 2) { x--; dir = 0; } else if (dir === 3) { z--; dir = 1; } return ((z * W + x) << 1) | dir; };
  const addRoom = (x, z, w, h, type, role, height = 4.4) => {
    const r = { id: rooms.length, x, z, w, h, type, cx: x + Math.floor(w / 2), cz: z + Math.floor(h / 2), height, links: 0, linkKeys: [] };
    if (role) { r.open35Role = role; r.hub = role !== 'bay'; } rooms.push(r);
    for (let zz = z; zz < z + h; zz++) for (let xx = x; xx < x + w; xx++) {
      const i = idx(xx, zz);
      if (xx < 1 || zz < 1 || xx >= W - 1 || zz >= H - 1 || cells[i]) throw new Error('open35 authored room overlap');
      cells[i] = 1; roomOf[i] = r.id; heightOf[i] = height;
      if (xx < x + w - 1) open.add(edgeKey(xx, zz, 0)); if (zz < z + h - 1) open.add(edgeKey(xx, zz, 1));
    } return r;
  };
  const mid = Math.floor(W / 2), ent = addRoom(mid - 1, H - 5, 3, 3, 'entrance'), rng = new RNG((seed ^ 0x35a71e) >>> 0);
  const width = kind === 'concourse' ? Math.min(14, W - 12) : Math.min(20, W - 12), height = Math.min(kind === 'concourse' ? 18 : 16, H - 13);
  const x0 = Math.floor((W - width) / 2), x1 = x0 + width, z1 = H - 8, z0 = z1 - height, side = kind === 'concourse' ? 4 : 2, ends = 2;
  const pub = (x, z, w, h, role) => addRoom(x, z, w, h, 'open35_public', role, 7.2);
  const north = pub(x0, z0, width, ends, 'north'), south = pub(x0, z1 - ends, width, ends, 'south');
  const west = pub(x0, z0 + ends, side, height - ends * 2, 'west'), east = pub(x1 - side, z0 + ends, side, height - ends * 2, 'east');
  const central = pub(x0 + side, z0 + ends, width - side * 2, height - ends * 2, 'central');
  const approach = addRoom(ent.x, z1, ent.w, ent.z - z1, 'open35_public', 'approach'), publicRooms = [north, south, west, east, central, approach].map(r => r.id);
  // Four wide-fronted bays are places to search without a corridor maze.
  const bayOffset = rng.int(0, Math.max(0, height - 12)), bayZ = [z0 + ends + bayOffset, z1 - ends - 3], bays = [];
  for (const x of [x0 - 3, x1]) for (const z of bayZ) bays.push(addRoom(x, z, 3, 3, 'open35_bay', 'bay'));
  const generator = addRoom(x0 + 1, z0 - 2, 2, 2, 'generator', null, 4), vault = addRoom(x1 - 3, z0 - 2, 2, 2, 'vault', null, 4);
  const core = addRoom(mid - 1, z0 - 3, 3, 3, 'core', null, 5.2), special = new Set([generator.id, vault.id, core.id]), specialLinks = new Map();
  // Whole shared public frontages are plain openings; service locks retain one native door.
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const a = idx(x, z); if (!cells[a]) continue;
    for (const d of [0, 1]) {
      const nx = x + (d === 0 ? 1 : 0), nz = z + (d === 1 ? 1 : 0), b = idx(nx, nz); if (!cells[b] || roomOf[a] === roomOf[b]) continue;
      const k = edgeKey(x, z, d), sid = special.has(roomOf[a]) ? roomOf[a] : special.has(roomOf[b]) ? roomOf[b] : null;
      if (sid !== null) { const list = specialLinks.get(sid) || []; list.push({ k, d, x, z, a, b }); specialLinks.set(sid, list); } else open.add(k);
    }
  }
  for (const [id, links] of specialLinks) {
    const q = links[Math.floor(links.length / 2)], type = rooms[id].type;
    const inf = { type: type === 'core' ? 'contain' : type === 'vault' ? 'vault' : 'door', width: type === 'core' ? 3 : 2.6, doorH: type === 'core' ? 3.1 : 2.8,
      key: q.k, dir: q.d, cx: q.x + (q.d === 0 ? 1 : .5), cz: q.z + (q.d === 1 ? 1 : .5), a: q.a, b: q.b, locked: type === 'vault' };
    open.add(q.k); edgeInfo.set(q.k, inf);
  }
  const entKey = edgeKey(ent.cx, ent.z + ent.h - 1, 1);
  edgeInfo.set(entKey, { type: 'entrance', width: 3.3, doorH: 3.2, key: entKey, dir: 1, cx: ent.cx + .5, cz: ent.z + ent.h, a: idx(ent.cx, ent.z + ent.h - 1), b: -1 });
  const fireExits = [], outdoorFires = size >= 1.2 ? 2 : 1;
  for (const [r, d] of [[bays.at(-1), 0], [bays[0], 2]].slice(0, outdoorFires)) {
    const x = d === 0 ? r.x + r.w - 1 : r.x, z = r.cz, k = edgeKey(x, z, d);
    const info = { type: 'fireexit', width: 1.35, doorH: 2.35, key: k, dir: d & 1, cx: d === 0 ? x + 1 : x, cz: z + .5, a: idx(x, z), b: -1, inward: d };
    edgeInfo.set(k, info); fireExits.push({ room: r, cellX: x, cellZ: z, d, info });
  }
  for (const k of open) {
    const a = k >> 1, d = k & 1, b = a + (d === 0 ? 1 : W), ra = roomOf[a], rb = roomOf[b]; if (ra === rb || ra < 0 || rb < 0) continue;
    for (const id of [ra, rb]) { rooms[id].links++; rooms[id].linkKeys.push(k); }
  }
  const distOf = new Int32Array(W * H).fill(-1), queue = [idx(ent.cx, ent.cz)]; distOf[queue[0]] = 0;
  for (let n = 0; n < queue.length; n++) {
    const i = queue[n], x = i % W, z = Math.floor(i / W);
    for (let d = 0; d < 4; d++) {
      const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d]; if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const j = idx(nx, nz); if (!cells[j] || distOf[j] >= 0 || !open.has(edgeKey(x, z, d))) continue; distOf[j] = distOf[i] + 1; queue.push(j);
    }
  }
  if (queue.length !== cells.reduce((n, v) => n + Number(v > 0), 0) || specialLinks.size !== 3) throw new Error('open35 disconnected authored place');
  const areas = [{ id: 0, kind: 'lobby', name: 'LOBBY', rooms: publicRooms }], areaOf = new Int8Array(W * H).fill(-1);
  for (let i = 0; i < cells.length; i++) if (cells[i]) areaOf[i] = 0;
  return {
    seed, theme, size, w: W, h: H, cell, cells, roomOf, heightOf, open, rooms, edgeInfo, doors: [...edgeInfo.values()].filter(i => !['entrance', 'fireexit'].includes(i.type)), fireExits,
    entrance: { room: ent, key: entKey }, distOf, edgeKey, idx, corridorH: 4.4, plan: 'open35', zoneMask, spines: [], ox: -W * cell / 2, oz: -H * cell / 2, y,
    core, generator, outdoorFires, entrySources: [idx(ent.cx, ent.cz), ...fireExits.map(f => idx(f.cellX, f.cellZ))], unlockedByRule: 0,
    opts: O, arena: null, mazes: [], wings: [], keyRooms: [], areas, areaOf, variety: null, m2: null,
    open35: { version: 35, kind, publicRooms, skyRooms: [central.id], bayRooms: bays.map(r => r.id), height: 7.2, viewFar: 96 },
  };
}
