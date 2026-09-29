// FACILITY SYSTEMS - build side (wave 1 "Living Facility"). The runtime (host state machine, net, HUD, puzzles,
// extraction) lives in src/game/facilitysys.js; this file only decides WHERE things are and builds the meshes.
//
//   facilityReach(L, opts)        -> Uint8Array: floor cells reachable from the entrance + fire exits with outdoor
//                                    twins; locked doors, vaults and the containment door count as walls. Pure.
//   exitField(L)                  -> Int16Array: cell steps to the nearest exit door (route marker). Pure.
//   planFacilitySystems(L)        -> pure, seeded plan: objective chain (component, puzzle), puzzle targets, which
//                                    rooms hold the voltage panels / notes / consoles / clean-air rooms, vent event.
//   planChestSpots(L, nav, vaults)-> [{x,y,z,room,tier,kind}] dead-end / treasure / vault rooms (world module chests)
//   buildFacilitySystems(ctx)     -> sys: meshes + interaction points + refresh(fac)/animate(dt, fac, game)/dispose()
//
// Everything is placed from the layout + ctx.rng forks, so every peer builds the same facility. Prop overlap
// tests treat downloaded GLB props (and their crate fallbacks) as generic boxes like hazards.js does.
// Static parts are merged per material (GeoBuilder); only levers, needles, knobs, lamps, screens, the fan, the core
// ring and the containment door leaves are separate meshes.
import * as THREE from 'three';
import { RNG } from '../../core/rng.js';
import { layoutKit, SPECIAL_ROOMS, INWARD, WALL_ROT } from './common.js';
import { G } from '../../physics/physics.js';

const UP = new THREE.Vector3(0, 1, 0);

// per theme: component the generator needs, puzzle chains it can roll, flavour name of the CORE
export const FAC_THEMES = {
  factory: { need: 'comp_fuse', chains: ['voltage', 'order'], core: 'DATA CORE' },
  mansion: { need: 'comp_fuse', chains: ['codes', 'codes', 'order'], core: 'HEART.EXE' },
  mineshaft: { need: 'comp_fuel', chains: ['order', 'voltage'], core: 'DEEP CORE' },
  office: { need: 'comp_fuse', chains: ['codes', 'order'], core: 'ROOT SERVER' },
  backrooms: { need: 'comp_battery', chains: ['voltage', 'codes'], core: 'NOCLIP CORE' },
  serverfarm: { need: 'comp_coolant', chains: ['voltage', 'order'], core: 'COLD CORE' },
  sewer: { need: 'comp_fuel', chains: ['order', 'codes'], core: 'SLUDGE CORE' },
  hospital: { need: 'comp_battery', chains: ['codes', 'voltage'], core: 'PATIENT ZERO' },
};
export const facTheme = (theme) => FAC_THEMES[theme] || FAC_THEMES.factory;
// vent failure odds per theme (gas event some time into the day)
const VENT_P = { sewer: 0.6, hospital: 0.5, mineshaft: 0.4, serverfarm: 0.3, factory: 0.3, backrooms: 0.3, office: 0.25, mansion: 0.2 };

const DXs = [1, 0, -1, 0], DZs = [0, 1, 0, -1];

/** Rooms that are sealed on purpose: vaults, the containment chamber, treasure rooms. */
export const isSealedRoom = (r) => !!r && (r.type === 'vault' || r.type === 'core' || !!r.treasure || !!r.arena);
const blocksEdge = (inf) => !!inf && (inf.type === 'vault' || inf.type === 'contain' || (inf.type === 'door' && inf.locked));

export function facilityReach(L, { blockLocked = true, sources = null } = {}) {
  const W = L.w, H = L.h;
  const seen = new Uint8Array(W * H);
  const q = new Int32Array(W * H);
  let qh = 0, qt = 0;
  const src = sources || L.entrySources || [L.idx(L.entrance.room.cx, L.entrance.room.cz)];
  for (const s of src) if (s >= 0 && !seen[s]) { seen[s] = 1; q[qt++] = s; }
  while (qh < qt) {
    const i = q[qh++], x = i % W, z = (i / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DXs[d], nz = z + DZs[d];
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const j = nz * W + nx, k = L.edgeKey(x, z, d);
      if (!L.cells[j] || seen[j] || !L.open.has(k)) continue;
      if (blockLocked && blocksEdge(L.edgeInfo.get(k))) continue;
      seen[j] = 1; q[qt++] = j;
    }
  }
  return seen;
}

export function exitField(L) {
  const W = L.w, H = L.h;
  const dist = new Int16Array(W * H).fill(-1);
  const q = new Int32Array(W * H);
  let qh = 0, qt = 0;
  const push = (i) => { if (i >= 0 && dist[i] < 0) { dist[i] = 0; q[qt++] = i; } };
  push(L.idx(L.entrance.room.cx, L.entrance.room.z + L.entrance.room.h - 1));
  for (const f of L.fireExits || []) push(L.idx(f.cellX, f.cellZ));
  while (qh < qt) {
    const i = q[qh++], x = i % W, z = (i / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DXs[d], nz = z + DZs[d];
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const j = nz * W + nx, k = L.edgeKey(x, z, d);
      if (!L.cells[j] || dist[j] >= 0 || !L.open.has(k) || blocksEdge(L.edgeInfo.get(k))) continue;
      dist[j] = dist[i] + 1; q[qt++] = j;
    }
  }
  return dist;
}

const planCache = new WeakMap();
export function planFacilitySystems(L) {
  let P = planCache.get(L);
  if (P) return P;
  const rng = new RNG((L.seed ^ 0x0fac5e11) >>> 0);
  const th = facTheme(L.theme);
  const chain = th.chains[rng.int(0, th.chains.length - 1)];
  const reach = facilityReach(L);
  const dist = (r) => Math.max(0, L.distOf[L.idx(r.cx, r.cz)] || 0);
  const gen = L.rooms.find((r) => r.type === 'generator') || null;
  const core = L.rooms.find((r) => r.type === 'core') || null;
  const containKey = core ? [...L.edgeInfo.values()].find((i) => i.type === 'contain')?.key ?? null : null;
  const usable = L.rooms.filter((r) => !SPECIAL_ROOMS.has(r.type) && !r.treasure && !r.arena && reach[L.idx(r.cx, r.cz)] && r.w * r.h >= 4)
    .sort((a, b) => a.id - b.id);
  const pool = rng.shuffle(usable.slice());
  const taken = new Set();
  const take = (pred, spread = 0) => {
    for (const r of pool) {
      if (taken.has(r.id) || (pred && !pred(r))) continue;
      if (spread && [...taken].some((id) => { const o = L.rooms[id]; return Math.abs(o.cx - r.cx) + Math.abs(o.cz - r.cz) < spread; })) continue;
      taken.add(r.id); return r.id;
    }
    return null;
  };
  // targets
  const volt = [rng.int(1, 9), rng.int(1, 9), rng.int(1, 9)];
  const order = rng.shuffle([0, 1, 2, 3]);
  const code = [rng.int(0, 9), rng.int(0, 9), rng.int(0, 9)].join('');
  // rooms
  const rooms = { panels: [], notes: [], security: null, vent: null, safe: [] };
  const spread = Math.max(4, Math.round(L.w / 6));
  if (chain === 'voltage') for (let i = 0; i < 3; i++) rooms.panels.push(take(null, spread) ?? take(null));
  const nNotes = chain === 'codes' ? 3 : 1;
  for (let i = 0; i < nNotes; i++) rooms.notes.push(take(null, chain === 'codes' ? spread : 0) ?? take(null));
  rooms.security = take((r) => r.type === 'security') ?? take((r) => dist(r) >= 3) ?? take(null);
  rooms.vent = take((r) => ['maintenance', 'boiler', 'server', 'pump_room', 'utility'].includes(r.type)) ?? take(null);
  const clean = take((r) => ['breakroom', 'bathroom', 'lockers', 'kitchen', 'bedroom', 'break_room'].includes(r.type)) ?? take((r) => dist(r) >= 4);
  rooms.safe = [L.entrance.room.id, clean].filter((x) => x !== null && x !== undefined);
  // late-joiner-proof seeded vent event (host decides whether it fires; the plan only proposes a time)
  const ventEvent = rng.chance(VENT_P[L.theme] ?? 0.25) ? { at: rng.int(170, 420) } : null;
  P = { theme: L.theme, need: th.need, coreName: th.core, chain, targets: { volt, order, code }, gen: gen?.id ?? null, core: core?.id ?? null, containKey, reach, rooms, ventEvent };
  planCache.set(L, P);
  return P;
}

/** Chest spots for the world module: dead-end rooms (1 way in), treasure rooms (sealed, key/lockpick) and vaults. */
export function planChestSpots(L, nav, vaultSpots = []) {
  const out = [];
  const C = L.cell;
  for (const r of L.rooms) {
    if (['entrance', 'generator', 'core', 'vault'].includes(r.type) || r.hub || r.arena) continue;   // (the boss arena is a dead end too, but no chest before the boss)
    if (!(r.treasure || r.links === 1)) continue;
    const dist = Math.max(0, L.distOf[L.idx(r.cx, r.cz)] || 0);
    if (!r.treasure && dist < 4) continue;
    // the room cell farthest from its way in
    const k = r.linkKeys?.[0];
    const ki = k !== undefined ? k >> 1 : L.idx(r.cx, r.cz);
    const kx = ki % L.w, kz = (ki / L.w) | 0;
    let best = null;
    for (let zz = r.z; zz < r.z + r.h; zz++) for (let xx = r.x; xx < r.x + r.w; xx++) {
      const d = Math.abs(xx - kx) + Math.abs(zz - kz);
      if (!best || d > best.d) best = { x: xx, z: zz, d };
    }
    let x = L.ox + (best.x + 0.5) * C, z = L.oz + (best.z + 0.5) * C;
    if (nav && !nav.walkableAt(x, z)) {
      const g = nav.nearestWalkable(...nav.toGrid(x, z), 3);
      if (!g) continue;
      const w = nav.toWorld(g[0], g[1]); x = w.x; z = w.z;
    }
    const tier = r.treasure ? (dist >= 8 ? 'epic' : 'rare') : dist >= 9 ? 'rare' : 'uncommon';
    out.push({ x, y: L.y, z, room: r.id, tier, kind: r.treasure ? 'treasure' : 'deadend', sealed: !!r.treasure });
  }
  const seenVault = new Set();
  for (const s of vaultSpots) {
    if (seenVault.has(s.room)) continue;
    seenVault.add(s.room);
    out.push({ x: s.x, y: s.y, z: s.z, room: s.room, tier: 'epic', kind: 'vault', sealed: true });
  }
  return out;
}

// ============================================================================ build
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

function makeScreen(w, h, owned) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = Math.max(32, Math.round(128 * h / w / 16) * 16);
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, fog: true });
  const geo = new THREE.PlaneGeometry(w, h);
  owned.tex.push(tex); owned.mat.push(mat); owned.geo.push(geo);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.setPiece = true;
  let last = '';
  return {
    mesh,
    draw(lines, fg = 0xffa040, bg = 0x0a0703, big = false) {
      const key = lines.join('|') + fg + '|' + bg + big;
      if (key === last) return;
      last = key;
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = hex(bg); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = hex(fg);
      ctx.textBaseline = 'top';
      const n = Math.max(1, lines.length);
      const fs = big ? Math.min(40, Math.floor(H / n) - 2) : Math.min(15, Math.floor((H - 6) / n));
      ctx.font = `bold ${fs}px monospace`;
      lines.forEach((l, i) => {
        const tw = ctx.measureText(l).width;
        ctx.fillText(l, big ? (W - tw) / 2 : 5, 3 + i * (big ? H / n : fs + 1), W - 8);
      });
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);   // scanlines
      tex.needsUpdate = true;
    },
  };
}

function paperTexture(owned) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 80;
  const g = c.getContext('2d');
  g.fillStyle = '#d9d2bd'; g.fillRect(0, 0, 64, 80);
  g.fillStyle = '#b9ae93'; g.fillRect(0, 0, 64, 6);
  g.fillStyle = '#3a3a52';
  for (let y = 12; y < 72; y += 6) { const w = 20 + ((y * 37) % 34); g.fillRect(6, y, w, 2); }
  g.strokeStyle = '#b01818'; g.lineWidth = 2; g.beginPath(); g.arc(46, 60, 9, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#6a5a3a'; g.fillRect(28, 1, 8, 4);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  owned.tex.push(t);
  return t;
}

export function buildFacilitySystems(ctx) {
  const L = ctx.layout, K = layoutKit(L), Y = ctx.Y, C = K.C, group = ctx.group, nav = ctx.nav;
  const P = planFacilitySystems(L);
  const rng = ctx.rng;
  const gb = new ctx.GeoBuilder();
  const owned = { tex: [], mat: [], geo: [], obj: [] };
  const own = (o) => { if (o) { o.userData.setPiece = true; group.add(o); owned.obj.push(o); } return o; };
  const lm = ctx.levelMaterial;
  const physics = ctx.physics;

  // ---------------- overlap tests (prop boxes collected once; GLB props / crates = generic box on every peer)
  const boxes = [];
  for (const o of group.children) {
    const ud = o.userData;
    if (!ud || !(ud.propId || ud.ext)) continue;
    let bb;
    if (ud.ext || ud.propId === 'crate_wood') { const p = o.position; bb = new THREE.Box3(new THREE.Vector3(p.x - 1.05, p.y - 0.05, p.z - 1.05), new THREE.Vector3(p.x + 1.05, p.y + 2.7, p.z + 1.05)); }
    else { bb = new THREE.Box3().setFromObject(o); if (bb.isEmpty()) continue; }
    boxes.push(bb);
  }
  const hz = ctx.hazards;
  const busyRooms = new Set();
  for (const b of hz?.breakers || []) { busyRooms.add(b.room); boxes.push(new THREE.Box3().setFromCenterAndSize(b.panelPos, new THREE.Vector3(1, 1.4, 1))); }
  for (const g of hz?.lasers || []) boxes.push(new THREE.Box3().setFromCenterAndSize(g.panelPos, new THREE.Vector3(1, 1.4, 1)));
  for (const v of hz?.vents || []) for (const e of [v.a, v.b]) boxes.push(new THREE.Box3().setFromCenterAndSize(e.pos, new THREE.Vector3(1.4, 1.4, 1.4)));
  const hit = (x0, z0, x1, z1, y0, y1) => boxes.some((b) => !(b.max.x <= x0 || b.min.x >= x1 || b.max.z <= z0 || b.min.z >= z1 || b.max.y <= y0 || b.min.y >= y1));
  const claim = (x0, z0, x1, z1, y0, y1) => boxes.push(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)));

  // local (front = +Z) -> world boxes for 90 degree rotations
  const _v = new THREE.Vector3();
  const put = (key, o, rot, lx, ly, lz, sx, sy, sz, color) => {
    _v.set(lx, ly, lz).applyAxisAngle(UP, rot);
    const q = Math.round(rot / (Math.PI / 2)) & 1;
    gb.box(key, o.x + _v.x, o.y + _v.y, o.z + _v.z, q ? sz : sx, sy, q ? sx : sz, 1, color);
  };
  const place = (mesh, o, rot, lx, ly, lz) => {
    _v.set(lx, ly, lz).applyAxisAngle(UP, rot);
    mesh.position.set(o.x + _v.x, o.y + _v.y, o.z + _v.z);
    mesh.rotation.y = rot;
    return own(mesh);
  };
  const toWorld = (o, rot, lx, ly, lz) => { _v.set(lx, ly, lz).applyAxisAngle(UP, rot); return new THREE.Vector3(o.x + _v.x, o.y + _v.y, o.z + _v.z); };
  const solid = (o, rot, lx, ly, lz, sx, sy, sz, navBlock = true) => {
    const c = toWorld(o, rot, lx, ly, lz);
    const q = Math.round(rot / (Math.PI / 2)) & 1;
    const wx = q ? sz : sx, wz = q ? sx : sz;
    ctx.addBox(c.x, c.y, c.z, wx, sy, wz);
    if (navBlock) nav.blockBox(c.x - wx / 2, c.z - wz / 2, c.x + wx / 2, c.z + wz / 2, 0.15);
    claim(c.x - wx / 2, c.z - wz / 2, c.x + wx / 2, c.z + wz / 2, c.y - sy / 2, c.y + sy / 2);
  };

  // shared small meshes / materials
  const lampGeo = new THREE.SphereGeometry(0.05, 6, 4); owned.geo.push(lampGeo);
  const LAMP = {
    off: new THREE.MeshBasicMaterial({ color: 0x301410 }), red: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    green: new THREE.MeshBasicMaterial({ color: 0x40ff60 }), amber: new THREE.MeshBasicMaterial({ color: 0xffa020 }),
    cyan: new THREE.MeshBasicMaterial({ color: 0x40e8ff }),
  };
  owned.mat.push(...Object.values(LAMP));
  const lamp = (o, rot, lx, ly, lz, s = 1) => { const m = place(new THREE.Mesh(lampGeo, LAMP.off), o, rot, lx, ly, lz); m.scale.setScalar(s); return m; };
  const leverGeo = new THREE.BoxGeometry(0.05, 0.3, 0.05).translate(0, 0.15, 0); owned.geo.push(leverGeo);
  const knobGeo = new THREE.BoxGeometry(0.18, 0.04, 0.03).translate(0, 0, 0.03); owned.geo.push(knobGeo);
  const handleMat = new THREE.MeshLambertMaterial({ color: 0xc02020 }); owned.mat.push(handleMat);
  const steelMat = new THREE.MeshLambertMaterial({ color: 0xb0b4b0 }); owned.mat.push(steelMat);

  // wall panel spot in a room: solid wall edge, no doorway in the cell, free of props, standable in front
  const wallSpot = (roomId, w, y0, y1, r2 = rng, depth = 0.45) => {
    const r = L.rooms[roomId];
    if (!r) return null;
    const walls = r2.shuffle(K.perimeter(r).filter((e) => !K.edgeBusy(e.x, e.z, e.d) && !K.cellHasDoorway(e.x, e.z)));
    for (const e of walls) {
      for (const along of [0, -1.1, 1.1]) {
        const [px, pz] = K.wallPoint(e.x, e.z, e.d, along, 0.02);
        const [bx, bz] = K.wallPoint(e.x, e.z, e.d, along, depth);
        const [fx, fz] = K.wallPoint(e.x, e.z, e.d, along, depth + 0.7);
        const alongX = e.d === 1 || e.d === 3;   // the wall runs along x
        const hw = w / 2 + 0.12;
        const x0 = Math.min(px, bx) - (alongX ? hw : 0.05), x1 = Math.max(px, bx) + (alongX ? hw : 0.05);
        const z0 = Math.min(pz, bz) - (alongX ? 0.05 : hw), z1 = Math.max(pz, bz) + (alongX ? 0.05 : hw);
        if (hit(x0, z0, x1, z1, Y + y0, Y + y1)) continue;
        if (!nav.walkableAt(fx, fz)) continue;
        claim(x0, z0, x1, z1, Y + y0, Y + y1);
        return { o: new THREE.Vector3(px, Y, pz), rot: WALL_ROT[e.d], room: roomId, stand: new THREE.Vector3(fx, Y, fz) };
      }
    }
    return null;
  };
  // try the planned room, then any other usable room (deterministic order)
  const fallbackRooms = L.rooms.filter((r) => !SPECIAL_ROOMS.has(r.type) && !r.treasure && !r.arena && P.reach[L.idx(r.cx, r.cz)]).map((r) => r.id);
  const wallSpotAny = (roomId, w, y0, y1, avoid, depth = 0.45) => {
    const r2 = rng.fork('ws' + roomId);
    if (roomId !== null && roomId !== undefined && !busyRooms.has(roomId)) { const s = wallSpot(roomId, w, y0, y1, r2, depth); if (s) return s; }
    for (const id of fallbackRooms) { if (id === roomId || busyRooms.has(id) || avoid?.has(id)) continue; const s = wallSpot(id, w, y0, y1, r2, depth); if (s) return s; }
    return null;
  };

  const sys = {
    plan: P, chain: P.chain, need: P.need, coreName: P.coreName, targets: P.targets, theme: L.theme,
    gen: null, panels: [], breakers: null, keypad: null, contain: null, core: null, notes: [], security: null, vent: null,
    safeRooms: new Set(P.rooms.safe), emergency: [], exitField: exitField(L), layout: L, physics,
    colliders: ctx.colliders || null,
  };

  // ---------------------------------------------------------------- emergency lighting (red, off until needed)
  {
    const em = [];
    const beacon = (x, y, z) => { gb.box('beacon', x, y, z, 0.22, 0.09, 0.22, 1); };
    for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
      const i = L.idx(x, z);
      if (L.cells[i] !== 2 || (x * 3 + z * 5) % 7 !== 0) continue;
      const cx = K.wx(x) + C / 2, cz = K.wz(z) + C / 2, h = L.heightOf[i] || 3.3;
      beacon(cx, Y + h - 0.06, cz);
      em.push({ pos: new THREE.Vector3(cx, Y + h - 0.35, cz), color: 0xff2410, intensity: 0, distance: 8, group: 'fac_em', enabled: false, halo: true, ph: (x * 0.7 + z * 1.3) % 6.28 });
    }
    for (const r of L.rooms) {
      if (r.type === 'vault') continue;
      const rc = K.roomRect(r);
      const cx = (rc.x0 + rc.x1) / 2 + 0.6, cz = (rc.z0 + rc.z1) / 2 + 0.6;
      beacon(cx, Y + r.height - 0.06, cz);
      em.push({ pos: new THREE.Vector3(cx, Y + r.height - 0.4, cz), color: 0xff2410, intensity: 0, distance: 10, group: 'fac_em', enabled: false, halo: true, ph: (r.id * 1.7) % 6.28, room: r.id });
    }
    for (const e of em) ctx.emitters.push(e);
    sys.emergency = em;
  }
  sys.beaconMat = new THREE.MeshBasicMaterial({ color: 0x3a0a06 }); owned.mat.push(sys.beaconMat);

  // ---------------------------------------------------------------- generator console (generator room)
  const genRoom = P.gen !== null ? L.rooms[P.gen] : null;
  if (genRoom) {
    const rc = K.roomRect(genRoom);
    const cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2;
    const cands = [];
    for (const d of [2.3, 2.9, 1.9]) for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) cands.push([cx + ax * d, cz + az * d, ax, az]);
    let spot = null;
    for (const [x, z, ax, az] of cands) {
      const hw = az ? 0.95 : 0.6, hd = az ? 0.6 : 0.95;
      if (x - hw < rc.x0 + 0.4 || x + hw > rc.x1 - 0.4 || z - hd < rc.z0 + 0.4 || z + hd > rc.z1 - 0.4) continue;
      if (hit(x - hw, z - hd, x + hw, z + hd, Y + 0.05, Y + 1.6)) continue;
      const fx = x - ax * 1.3, fz = z - az * 1.3;   // stand between the console and the room centre
      if (!nav.walkableAt(fx, fz)) continue;
      spot = { o: new THREE.Vector3(x, Y, z), rot: Math.atan2(-ax, -az) };
      break;
    }
    if (!spot) { const ws = wallSpot(genRoom.id, 1.5, 0, 1.6, rng.fork('genwall')); if (ws) spot = { o: ws.o.clone(), rot: ws.rot, wall: true }; }
    if (spot) {
      const { o, rot } = spot;
      const z0 = spot.wall ? 0.4 : 0;   // wall-mounted: push the cabinet off the wall
      put('m:metal_dark', o, rot, 0, 0.55, z0, 1.5, 1.1, 0.8);
      put('m:hazard_stripes', o, rot, 0, 0.06, z0 + 0.405, 1.5, 0.12, 0.01);
      put('m:metal_plate', o, rot, 0, 1.13, z0 - 0.1, 1.5, 0.06, 0.6);
      put('m:metal_plate', o, rot, 0, 1.35, z0 - 0.28, 1.5, 0.4, 0.2);
      put('m:fuse_panel', o, rot, -0.42, 0.72, z0 + 0.405, 0.46, 0.5, 0.01);
      put('m:gauge', o, rot, 0.25, 1.35, z0 - 0.175, 0.26, 0.26, 0.01);
      put('m:gauge', o, rot, 0.55, 1.35, z0 - 0.175, 0.26, 0.26, 0.01);
      put('c:paint', o, rot, 0.4, 0.72, z0 + 0.42, 0.34, 0.26, 0.04, [0.18, 0.18, 0.2]);   // component slot
      put('c:paint', o, rot, 0.6, 1.16, z0 + 0.05, 0.22, 0.03, 0.22, [0.85, 0.7, 0.1]);      // overload cage base
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put('c:paint', o, rot, 0.6 + sx * 0.1, 1.24, z0 + 0.05 + sz * 0.1, 0.02, 0.14, 0.02, [0.85, 0.7, 0.1]);
      put('c:paint', o, rot, 0.6, 1.31, z0 + 0.05, 0.22, 0.02, 0.22, [0.85, 0.7, 0.1]);
      // exhaust stack + cable run
      put('m:metal_dark', o, rot, -0.6, 1.9, z0 - 0.3, 0.16, 1.0, 0.16);
      put('m:metal_dark', o, rot, 0, 0.04, z0 - 0.7, 0.12, 0.08, 0.7);
      solid(o, rot, 0, 0.75, z0, 1.5, 1.5, 0.8);
      const screen = makeScreen(0.5, 0.26, owned);
      place(screen.mesh, o, rot, -0.25, 1.35, z0 - 0.17);
      const needles = [0.25, 0.55].map((lx) => { const m = place(new THREE.Mesh(knobGeo, steelMat), o, rot, lx, 1.35, z0 - 0.2); m.scale.set(0.6, 0.6, 1); return m; });
      const lever = place(new THREE.Mesh(leverGeo, handleMat), o, rot, 0.78, 0.9, z0 + 0.1);
      lever.rotation.order = 'YXZ';
      const button = place(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10), LAMP.red), o, rot, 0.6, 1.19, z0 + 0.05);
      owned.geo.push(button.geometry);
      const slotLamp = lamp(o, rot, 0.4, 0.92, z0 + 0.44, 1.2);
      const runLamp = lamp(o, rot, -0.62, 1.12, z0 + 0.25, 1.4);
      const face = (lz) => toWorld(o, rot, 0, 1.0, z0 + lz);
      sys.gen = {
        room: genRoom.id, o, rot, screen, needles, lever, button, slotLamp, runLamp,
        pos: face(0.75), slotPos: toWorld(o, rot, 0.4, 0.75, z0 + 0.7), overloadPos: toWorld(o, rot, 0.6, 1.25, z0 + 0.45),
        firePos: toWorld(o, rot, 0, 1.2, z0),
        emitter: { pos: toWorld(o, rot, 0, 1.6, z0 + 0.6), color: 0xffa040, intensity: 0.0, distance: 7, group: 'fac_gen', enabled: true, halo: false },
      };
      ctx.emitters.push(sys.gen.emitter);
    }
  }

  // ---------------------------------------------------------------- containment chamber + door panel
  const coreRoom = P.core !== null ? L.rooms[P.core] : null;
  const containDoor = (ctx.doors || []).find((d) => d.contain);
  if (coreRoom && containDoor) {
    const inf = containDoor.info;
    const coreCell = L.roomOf[inf.a] === coreRoom.id ? inf.a : inf.b;
    const outCell = coreCell === inf.a ? inf.b : inf.a;
    const ox = L.ox + ((outCell % L.w) + 0.5) * C, oz = L.oz + (Math.floor(outCell / L.w) + 0.5) * C;
    const nx = Math.sign(ox - containDoor.pos.x), nz = Math.sign(oz - containDoor.pos.z);   // door -> outside
    const alongX = inf.dir === 1;
    const rot = Math.atan2(nx, nz);
    // mounted on the outer face of the blast-door frame post (posts sit 1.85 m either side of the door centre)
    let side = 1;
    for (const s of [1, -1]) {
      const p = toWorld(new THREE.Vector3(containDoor.pos.x + (alongX ? s * 1.85 : 0), Y, containDoor.pos.z + (alongX ? 0 : s * 1.85)), rot, 0, 0, 0.55);
      if (!hit(p.x - 0.3, p.z - 0.3, p.x + 0.3, p.z + 0.3, Y + 0.7, Y + 2.0)) { side = s; break; }
    }
    const o = new THREE.Vector3(containDoor.pos.x + (alongX ? side * 1.85 : 0), Y, containDoor.pos.z + (alongX ? 0 : side * 1.85));
    const Z = 0.3;
    put('m:metal_dark', o, rot, 0, 1.35, Z + 0.06, 0.4, 1.2, 0.12);
    put('m:hazard_stripes', o, rot, 0, 0.72, Z + 0.06, 0.4, 0.06, 0.13);
    const screen = makeScreen(0.34, 0.24, owned);
    place(screen.mesh, o, rot, 0, 1.78, Z + 0.125);
    const statusLamps = [-0.1, 0, 0.1].map((lx) => lamp(o, rot, lx, 1.6, Z + 0.13, 0.9));
    const panel = { o, rot, screen, statusLamps, pos: toWorld(o, rot, 0, 1.45, Z + 0.45), door: containDoor };
    if (P.chain === 'order') {
      panel.levers = [0, 1, 2, 3].map((i) => {
        put('m:metal_plate', o, rot, 0, 1.42 - i * 0.2, Z + 0.125, 0.3, 0.14, 0.01);
        const lv = place(new THREE.Mesh(leverGeo, handleMat), o, rot, -0.06, 1.38 - i * 0.2, Z + 0.14);
        lv.scale.set(0.8, 0.45, 0.8); lv.rotation.order = 'YXZ'; lv.rotation.x = 0.9;
        const lp = lamp(o, rot, 0.1, 1.42 - i * 0.2, Z + 0.14, 0.7);
        return { i, lever: lv, lamp: lp, pos: toWorld(o, rot, 0, 1.42 - i * 0.2, Z + 0.32) };
      });
    }
    if (P.chain === 'codes') put('m:keypad', o, rot, 0, 1.18, Z + 0.125, 0.26, 0.36, 0.01);
    sys.contain = panel;
    containDoor.containPanel = panel;
    // pedestal + containment field in the chamber
    const rc = K.roomRect(coreRoom);
    const cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2;
    const po = new THREE.Vector3(cx, Y, cz);
    put('m:metal_dark', po, 0, 0, 0.25, 0, 1.6, 0.5, 1.6);
    put('m:hazard_stripes', po, 0, 0, 0.51, 0, 1.2, 0.02, 1.2);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      put('m:metal_plate', po, 0, sx * 1.55, 1.1, sz * 1.55, 0.22, 2.2, 0.22);
      put('beacon', po, 0, sx * 1.55, 2.26, sz * 1.55, 0.16, 0.1, 0.16);
    }
    solid(po, 0, 0, 0.25, 0, 1.6, 0.5, 1.6);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) solid(po, 0, sx * 1.55, 1.1, sz * 1.55, 0.22, 2.2, 0.22);
    const ringGeo = new THREE.TorusGeometry(1.05, 0.045, 4, 24); owned.geo.push(ringGeo);
    const ring = own(new THREE.Mesh(ringGeo, LAMP.cyan)); ring.position.set(cx, Y + 1.25, cz); ring.rotation.x = Math.PI / 2;
    const ring2 = own(new THREE.Mesh(ringGeo, LAMP.cyan)); ring2.position.set(cx, Y + 1.25, cz); ring2.scale.setScalar(0.8);
    const fieldGeo = new THREE.CylinderGeometry(1.25, 1.25, 2.4, 20, 1, true); owned.geo.push(fieldGeo);
    const fieldMat = new THREE.MeshBasicMaterial({ color: 0x40d8ff, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    owned.mat.push(fieldMat);
    const field = own(new THREE.Mesh(fieldGeo, fieldMat)); field.position.set(cx, Y + 1.7, cz); field.renderOrder = 3;
    const emitter = { pos: new THREE.Vector3(cx, Y + 2.2, cz), color: 0x50e0ff, intensity: 0.9, distance: 10, group: 'fac_core', enabled: true };
    ctx.emitters.push(emitter);
    sys.core = { room: coreRoom.id, spot: new THREE.Vector3(cx, Y + 0.5, cz), ring, ring2, field, fieldMat, emitter };
  } else {
    // no chamber fitted: the core sits on an open pedestal in the deepest reachable room (field-locked)
    const deep = L.rooms.filter((r) => !SPECIAL_ROOMS.has(r.type) && !r.treasure && !r.arena && P.reach[L.idx(r.cx, r.cz)]).sort((a, b) => (L.distOf[L.idx(b.cx, b.cz)] - L.distOf[L.idx(a.cx, a.cz)]) || a.id - b.id)[0];
    if (deep) {
      const rc = K.roomRect(deep);
      const cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2;
      const po = new THREE.Vector3(cx, Y, cz);
      if (!hit(cx - 0.9, cz - 0.9, cx + 0.9, cz + 0.9, Y, Y + 1)) {
        put('m:metal_dark', po, 0, 0, 0.25, 0, 1.4, 0.5, 1.4);
        solid(po, 0, 0, 0.25, 0, 1.4, 0.5, 1.4);
      }
      const fieldGeo = new THREE.CylinderGeometry(1.0, 1.0, 2.2, 18, 1, true); owned.geo.push(fieldGeo);
      const fieldMat = new THREE.MeshBasicMaterial({ color: 0x40d8ff, transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      owned.mat.push(fieldMat);
      const field = own(new THREE.Mesh(fieldGeo, fieldMat)); field.position.set(cx, Y + 1.6, cz); field.renderOrder = 3;
      const emitter = { pos: new THREE.Vector3(cx, Y + 2.2, cz), color: 0x50e0ff, intensity: 0.8, distance: 9, group: 'fac_core', enabled: true };
      ctx.emitters.push(emitter);
      sys.core = { room: deep.id, spot: new THREE.Vector3(cx, Y + 0.5, cz), field, fieldMat, emitter, open: true };
    }
  }

  // ---------------------------------------------------------------- voltage panels (3 rooms)
  if (P.chain === 'voltage') {
    const used = new Set();
    ['A', 'B', 'C'].forEach((label, i) => {
      const s = wallSpotAny(P.rooms.panels[i], 0.6, 0.8, 2.0, used);
      if (!s) return;
      used.add(s.room);
      const { o, rot } = s;
      put('m:metal_dark', o, rot, 0, 1.35, 0.07, 0.6, 0.9, 0.14);
      put('m:hazard_stripes', o, rot, 0, 0.86, 0.07, 0.6, 0.08, 0.15);
      put('m:metal_plate', o, rot, 0, 1.12, 0.145, 0.34, 0.3, 0.01);
      const screen = makeScreen(0.42, 0.3, owned);
      place(screen.mesh, o, rot, 0, 1.6, 0.145);
      const knob = place(new THREE.Mesh(knobGeo, handleMat), o, rot, 0, 1.12, 0.15);
      const lp = lamp(o, rot, 0.22, 1.12, 0.16);
      sys.panels.push({ i, label, room: s.room, o, rot, screen, knob, lamp: lp, pos: toWorld(o, rot, 0, 1.35, 0.45) });
    });
  }

  // ---------------------------------------------------------------- notes (hint / code fragments)
  {
    const paper = paperTexture(owned);
    const paperMat = new THREE.MeshLambertMaterial({ map: paper, emissive: 0x2a261c }); owned.mat.push(paperMat);
    const noteGeo = new THREE.PlaneGeometry(0.34, 0.44); owned.geo.push(noteGeo);
    const used = new Set(sys.panels.map((p) => p.room));
    P.rooms.notes.forEach((roomId, i) => {
      const s = wallSpotAny(roomId, 0.4, 1.1, 1.8, used);
      if (!s) return;
      used.add(s.room);
      const m = place(new THREE.Mesh(noteGeo, paperMat), s.o, s.rot, 0, 1.45, 0.03);
      m.rotation.z = (rng.next() - 0.5) * 0.2;
      put('c:paint', s.o, s.rot, 0, 1.66, 0.02, 0.05, 0.05, 0.03, [0.8, 0.1, 0.1]);   // pin
      const kind = P.chain === 'codes' ? 'code' : P.chain === 'voltage' ? 'volt' : 'order';
      sys.notes.push({ i, kind, room: s.room, pos: toWorld(s.o, s.rot, 0, 1.45, 0.35), mesh: m });
    });
  }

  // ---------------------------------------------------------------- security console + vent control
  {
    const s = wallSpotAny(P.rooms.security, 1.0, 0.0, 2.0, null, 0.75);
    if (s) {
      const { o, rot } = s;
      put('m:metal_dark', o, rot, 0, 0.45, 0.3, 1.0, 0.9, 0.6);
      put('m:metal_plate', o, rot, 0, 0.93, 0.3, 1.04, 0.06, 0.64);
      put('m:metal_dark', o, rot, 0, 1.45, 0.08, 1.0, 0.9, 0.16);
      put('m:screen_terminal', o, rot, 0.3, 1.2, 0.165, 0.34, 0.22, 0.01);
      solid(o, rot, 0, 0.5, 0.3, 1.0, 1.0, 0.6);
      const screen = makeScreen(0.52, 0.36, owned);
      place(screen.mesh, o, rot, -0.12, 1.55, 0.165);
      const lp = lamp(o, rot, 0.38, 1.7, 0.17, 1.3);
      sys.security = { room: s.room, o, rot, screen, lamp: lp, pos: toWorld(o, rot, 0, 1.2, 0.85) };
    }
    const v = wallSpotAny(P.rooms.vent, 0.9, 0.3, 2.2, new Set(s ? [s.room] : []));
    if (v) {
      const { o, rot } = v;
      put('m:metal_dark', o, rot, 0, 1.3, 0.1, 0.9, 1.3, 0.2);
      put('m:vent', o, rot, 0, 1.45, 0.205, 0.7, 0.7, 0.01);
      put('m:hazard_stripes', o, rot, 0, 0.68, 0.1, 0.9, 0.06, 0.21);
      const bladeGeo = new THREE.BoxGeometry(0.62, 0.08, 0.02); owned.geo.push(bladeGeo);
      const fan = new THREE.Group();
      for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(bladeGeo, steelMat); b.rotation.z = (k / 3) * Math.PI; fan.add(b); }
      place(fan, o, rot, 0, 1.45, 0.23);
      const screen = makeScreen(0.36, 0.2, owned);
      place(screen.mesh, o, rot, 0, 0.9, 0.205);
      const lp = lamp(o, rot, 0.35, 1.9, 0.21, 1.1);
      sys.vent = { room: v.room, o, rot, fan, screen, lamp: lp, pos: toWorld(o, rot, 0, 1.2, 0.55) };
    }
  }

  // ---------------------------------------------------------------- clean-air rooms (green scrubber lamp)
  for (const id of sys.safeRooms) {
    const r = L.rooms[id];
    if (!r) continue;
    const rc = K.roomRect(r);
    const e = { pos: new THREE.Vector3((rc.x0 + rc.x1) / 2 - 0.6, Y + r.height - 0.5, (rc.z0 + rc.z1) / 2 - 0.6), color: 0x50ff70, intensity: 0.0, distance: 7, group: 'fac_safe', enabled: true, halo: true };
    ctx.emitters.push(e);
    gb.box('safe', e.pos.x, Y + r.height - 0.06, e.pos.z, 0.5, 0.08, 0.5, 1);
    (sys.safeLights ||= []).push(e);
  }

  // ---------------------------------------------------------------- merged static geometry
  const mats = {
    beacon: () => sys.beaconMat,
    safe: () => lm('paint', { color: 0x40ff60, emissive: 0x108020 }),
  };
  const built = gb.build((key) => mats[key] ? mats[key]() : key.startsWith('c:') ? lm(key.slice(2), { vertexColors: true }) : lm(key.slice(2), {}));
  if (built.children.length) { built.name = 'facsys'; own(built); for (const m of built.children) owned.geo.push(m.geometry); }

  // ======================================================================== runtime visuals
  const s3 = (m, mat) => { if (m && m.material !== mat) m.material = mat; };
  let lastSig = '';
  sys.refresh = (fac, T) => {
    // cheap: only redraws when the facility state changed
    const f = fac || {};
    const sig = JSON.stringify([f.power, f.security, f.containment, f.vent, f.stage, f.fuel, f.gen, f.wing, f.volt, f.ord, f.codes, f.ovCd > 0, f.ext ? 1 : 0, f.result, f.lang]);
    if (sig === lastSig) return;
    lastSig = sig;
    const tr = T || ((s) => s);
    const pw = f.power || 'low';
    const dead = pw === 'off';
    const g = sys.gen;
    if (g) {
      s3(g.slotLamp, f.fuel ? LAMP.green : (Math.floor(Date.now() / 500) % 2 ? LAMP.red : LAMP.off));
      s3(g.runLamp, f.gen ? (dead ? LAMP.red : LAMP.green) : LAMP.off);
      s3(g.button, f.gen && !(f.ovCd > 0) ? LAMP.red : LAMP.off);
      const need = String(sys.need || '').replace('comp_', '').toUpperCase();
      g.screen.draw(f.gen ? [tr('GENERATOR'), dead ? tr('STALLED') : pw === 'overload' ? tr('OVERLOAD!') : tr('ONLINE'), `${tr('PWR')}: ${tr(pw.toUpperCase())}`]
        : f.fuel ? [tr('GENERATOR'), tr('READY'), tr('START [E]')] : [tr('GENERATOR'), tr('OFFLINE'), `${tr('NEEDS')}: ${tr(need)}`],
      f.gen ? (dead ? 0xff4030 : 0x60ff80) : 0xffa040);
    }
    const c = sys.contain;
    if (c) {
      const lines = f.wing ? [tr('CONTAINMENT'), f.containment === 'normal' ? tr('OPEN') : tr(String(f.containment || '').toUpperCase())]
        : !f.gen ? [tr('CONTAINMENT'), tr('NO POWER')] : [tr('CONTAINMENT'), tr('WING LOCKED')];
      c.screen.draw(lines, f.wing ? 0x60ff80 : f.gen ? 0xffa040 : 0xff4030);
      c.statusLamps.forEach((l, i) => s3(l, f.wing ? LAMP.green : i === 0 && f.gen ? LAMP.amber : LAMP.off));
      for (const lv of c.levers || []) {
        const on = (f.ord || []).includes(lv.i) || f.wing;
        lv.lever.rotation.x = on ? -0.9 : 0.9;
        s3(lv.lamp, on ? LAMP.green : dead || !f.gen ? LAMP.off : LAMP.amber);
      }
    }
    sys.panels.forEach((p) => {
      const v = f.volt?.[p.i] ?? 0;
      const ok = v === sys.targets.volt[p.i];
      p.screen.draw(!f.gen || dead ? [`${tr('BUS')} ${p.label}`, '--'] : [`${tr('BUS')} ${p.label}`, String(v)], ok && f.gen && !dead ? 0x60ff80 : 0xffa040);
      p.knob.rotation.z = -(v / 9) * Math.PI * 1.5 + Math.PI * 0.75;
      s3(p.lamp, !f.gen || dead ? LAMP.off : ok ? LAMP.green : LAMP.red);
    });
    if (sys.security) {
      const sec = f.security || 'passive';
      sys.security.screen.draw([tr('SECURITY'), tr(sec.toUpperCase()), dead ? tr('NO POWER') : f.tOff > 0 ? tr('TURRETS OFFLINE') : ''], sec === 'alarm' || sec === 'lockdown' ? 0xff4030 : sec === 'active' ? 0xffa040 : 0x60ff80);
      s3(sys.security.lamp, sec === 'alarm' || sec === 'lockdown' ? LAMP.red : sec === 'active' ? LAMP.amber : LAMP.green);
    }
    if (sys.vent) {
      const vs = f.vent || 'clean';
      sys.vent.screen.draw([tr('AIR'), tr(vs.toUpperCase())], vs === 'clean' ? 0x60ff80 : 0xff4030);
      s3(sys.vent.lamp, vs === 'clean' ? LAMP.green : LAMP.red);
    }
  };

  // containment door leaves + collider (the host drives door.open through the normal 'door' message)
  const animateDoor = (d, dt) => {
    const target = d.open ? 1 : 0;
    if (d.t === target && d.applied) return;
    d.t += Math.sign(target - d.t) * Math.min(Math.abs(target - d.t), dt * 0.55);
    d.applied = true;
    const e = d.t * d.t * (3 - 2 * d.t);
    for (const leaf of [d.anchors?.leafL, d.anchors?.leafR]) {
      if (!leaf) continue;
      if (!leaf.userData.basePos) leaf.userData.basePos = leaf.position.clone();
      const off = leaf.userData.openOffset || [0, 0, 0];
      leaf.position.set(leaf.userData.basePos.x + off[0] * e, leaf.userData.basePos.y + off[1] * e, leaf.userData.basePos.z + off[2] * e);
    }
    const cols = sys.colliders;
    if (d.t > 0.45 && d.solid) {
      physics.removeCollider(d.solid);
      if (cols) { const i = cols.indexOf(d.solid); if (i >= 0) cols.splice(i, 1); }
      d.solid = null;
    } else if (d.t < 0.3 && !d.solid && d.solidArgs) {
      const a = d.solidArgs;
      d.solid = physics.addStaticBox(a[0], a[1], a[2], a[3] / 2, a[4] / 2, a[5] / 2, 0, G.STATIC, { kind: 'prop', id: 'contain_door' });
      cols?.push(d.solid);
    }
  };

  let t = 0, emOn = 0;
  sys.animate = (dt, fac, game) => {
    t += dt;
    const f = fac || {};
    const pw = f.power || 'low';
    const dead = pw === 'off';
    if (containDoor) animateDoor(containDoor, dt);
    const g = sys.gen;
    if (g) {
      const run = f.gen && !dead;
      g.lever.rotation.x += ((f.gen ? -0.9 : 0.9) - g.lever.rotation.x) * Math.min(1, dt * 6);
      g.needles.forEach((n, i) => { n.rotation.z = run ? 0.4 + Math.sin(t * (3 + i * 2.3)) * 0.12 + (pw === 'overload' ? Math.sin(t * 31) * 0.5 : 0) : -1.1; });
      g.emitter.intensity = run ? 0.5 + Math.sin(t * 8) * 0.05 : 0;
      if (!f.fuel) s3(g.slotLamp, Math.floor(t * 2) % 2 ? LAMP.red : LAMP.off);
    }
    if (sys.core) {
      const cr = sys.core;
      const present = !f.ext && f.stage !== 'done' && f.stage !== 'failed' && f.stage !== 'extract';
      if (cr.ring) { cr.ring.rotation.z += dt * (f.wing ? 1.6 : 0.5); cr.ring2.rotation.x += dt * 0.9; cr.ring2.rotation.y += dt * 0.6; cr.ring.visible = cr.ring2.visible = present; }
      cr.field.visible = present && !f.wing;
      cr.fieldMat.opacity = 0.09 + Math.sin(t * 3) * 0.04;
      cr.emitter.intensity = present ? 0.8 + Math.sin(t * 2.2) * 0.15 : (f.ext ? 0.5 + Math.sin(t * 12) * 0.4 : 0.2);
      cr.emitter.color = f.ext ? 0xff3050 : 0x50e0ff;
    }
    if (sys.vent) sys.vent.fan.rotation.z += dt * (f.vent === 'clean' ? (dead ? 0 : 4) : f.purge ? 16 : 0.6);
    for (const e of sys.safeLights || []) e.intensity = f.vent && f.vent !== 'clean' ? 0.55 + Math.sin(t * 4) * 0.1 : 0.12;
    // emergency lighting: blackout (steady dim red), alarm / lockdown / extraction (rotating beacons)
    const alarm = f.security === 'alarm' || f.security === 'lockdown' || !!f.ext;
    const want = alarm ? 1 : dead ? 0.55 : f.ev === 'unknown' ? 0 : 0;
    emOn += (want - emOn) * Math.min(1, dt * 4);
    const on = emOn > 0.02;
    const camP = game?.camera?.position;
    for (const e of sys.emergency) {
      if (e.enabled !== on) e.enabled = on;
      if (!on) continue;
      if (camP && Math.abs(e.pos.x - camP.x) + Math.abs(e.pos.z - camP.z) > 60) continue;
      const pulse = alarm ? Math.max(0, Math.sin(t * 5 + e.ph)) : 0.7;
      e.intensity = emOn * (0.25 + pulse * 1.1);
    }
    const bc = sys.beaconMat.color;
    if (on) bc.setRGB(0.25 + emOn * (alarm ? 0.75 * Math.max(0, Math.sin(t * 5)) : 0.5), 0.04, 0.02); else bc.setRGB(0.23, 0.04, 0.02);
  };

  sys.dispose = () => {
    for (const o of owned.obj) o.removeFromParent();
    for (const g of owned.geo) g.dispose();
    for (const m of owned.mat) m.dispose();
    for (const tx of owned.tex) tx.dispose();
    owned.obj.length = owned.geo.length = owned.mat.length = owned.tex.length = 0;
  };
  return sys;
}
