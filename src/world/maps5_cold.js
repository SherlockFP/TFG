// MAPS5 - COLD STORAGE decor (biome `m5cold`, decor kind 'm5cold'): a frozen data vault field.
//   * SERVER STACKS (maps5_stacks.js): a roofed hall of rack aisles whose walls shift every N seconds (host-timed, telegraphed by warning strips)
//   * two CRYO CAVES: ice tunnels ending in a pod chamber (sleeping pods, a few empty ones, a "Cryo Core" prize); the host wakes some sleepers
//   * a conveyor line, broken server racks, ice crystals, snow drifts, snowfall and blizzard gusts (terrain.wx.gust drives fog / wind in worldx)
// decor.info = { kind:'m5cold', stacks, caves[], pods[{x,y,z,open,cave}], zones[], loot[], prizes[], counts }
import * as THREE from 'three';
import { planStacks, verifyStacks, STACKS, siteSeed, toWorld, toLocal } from '../game/maps5_core.js';
import { registerDecor, DECOR_HELPERS } from './outdoor_biomes.js';
import { makeBuilder, flush, findSite, placeProps, skyBox, doorSteps, TAU } from './maps5_kit.js';
import { buildStacks } from './maps5_stacks.js';

const { instanced } = DECOR_HELPERS;
const ICE = [0.72, 0.9, 1.0], ICE2 = [0.6, 0.82, 0.95];

/** an ice tunnel + pod chamber; local +z = mouth, chamber at -z. Returns { pods, prize, contains, mouth } */
function buildCave(C, S, site, R, out, idx) {
  const f = { x: site.x, z: site.z, rot: site.rot };
  const y0 = site.y0;
  S.frame(f.x, f.z, f.rot);
  const b0 = S.B.boxes;
  const TW = 5.2, TL0 = -6, TL1 = 13, CH = 14, CZ0 = -21, CZ1 = -6, HT = 4.4, HC = 5.6, WT = 1.2;
  // floor slab (foundation reaches the low terrain), roof slabs, walls (tunnel + chamber), end wall
  S.solid('ice', 0, site.yLo - 0.8, (CZ0 + TL1) / 2, CH + 2.6, y0 - site.yLo + 0.8, TL1 - CZ0 + 2.4, { uv: 0.3, tint: 0.85, color: ICE2 });
  S.solid('ice', 0, y0 + HT, (TL0 + TL1) / 2, TW + 2 * WT, 0.9, TL1 - TL0 + WT, { uv: 0.3, tint: 0.9, color: ICE });
  S.solid('ice', 0, y0 + HC, (CZ0 + CZ1) / 2, CH + 2 * WT, 0.9, CZ1 - CZ0 + 2 * WT, { uv: 0.3, tint: 0.9, color: ICE });
  for (const sx of [-1, 1]) {
    S.solid('ice', sx * (TW / 2 + WT / 2), y0, (TL0 + TL1) / 2, WT, HT, TL1 - TL0, { uv: 0.35, tint: 0.85 + 0.1 * R.next(), color: ICE });
    S.solid('ice', sx * (CH / 2 + WT / 2), y0, (CZ0 + CZ1) / 2, WT, HC, CZ1 - CZ0 + 2 * WT, { uv: 0.35, tint: 0.85 + 0.1 * R.next(), color: ICE });
  }
  S.solid('ice', 0, y0, CZ0 - WT / 2, CH + 2 * WT, HC, WT, { uv: 0.35, tint: 0.8, color: ICE2 });
  // chamber shoulders where the tunnel meets the wider chamber
  for (const sx of [-1, 1]) S.solid('ice', sx * (TW / 2 + (CH - TW) / 4 + WT / 2 - 0.6), y0, CZ1 + WT / 2, (CH - TW) / 2 + WT, HC, WT, { uv: 0.35, tint: 0.85, color: ICE });
  // glowing strips along the ceiling (emissive, no scene light)
  for (let z = TL1 - 1; z > CZ0 + 1; z -= 3.2) S.vis('glow', 0, (z < CZ1 ? y0 + HC : y0 + HT) - 0.06, z, 0.5, 0.06, 1.8, { col: false, color: [0.4, 0.8, 1], bottom: false });
  for (const sx of [-1, 1]) S.vis('glow', sx * (CH / 2 - 0.15), y0 + 0.9, (CZ0 + CZ1) / 2, 0.06, 0.08, CZ1 - CZ0 - 2, { col: false, color: [0.2, 0.6, 0.9], bottom: false });
  // pods: along both chamber walls, facing inward, plus two on the end wall
  const pods = [];
  const sleepers = new Set(R.shuffle(Array.from({ length: 10 }, (_, k) => k)).slice(0, 2));   // two open pods per cave hold a frozen Cryo Sleeper (spawned by the host)
  let pi = 0;
  const addPod = (lx, lz, ry) => {
    const sleeper = sleepers.has(pi++), open = sleeper || R.chance(0.1);
    const [wx, wz] = toWorld(f, lx, lz);
    out.props.push({ id: open ? 'm5:cryo_pod_open' : 'm5:cryo_pod', x: wx, y: y0, z: wz, ry: ry + f.rot });
    pods.push({ x: wx, y: y0, z: wz, open, sleeper, cave: idx, ry: ry + f.rot });
  };
  for (let k = 0; k < 4; k++) for (const sx of [-1, 1]) addPod(sx * (CH / 2 - 0.62), CZ1 - 2.2 - k * 3.2, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
  addPod(-2.6, CZ0 + 0.7, 0); addPod(2.6, CZ0 + 0.7, 0);
  // the prize on a plinth in the middle of the chamber
  const pz = (CZ0 + CZ1) / 2;
  S.solid('metal', 0, y0, pz, 1.1, 1.0, 1.1, { uv: 0.6, tint: 0.7, color: [0.8, 0.9, 1] });
  S.vis('glow', 0, y0 + 1.03, pz, 0.6, 0.05, 0.6, { col: false, color: [0.4, 1, 1] });
  const [px, pzw] = toWorld(f, 0, pz);
  const [mx, mz] = toWorld(f, 0, TL1 + 0.5);
  // mouth: hazard posts + steps down to the snow
  for (const sx of [-1, 1]) S.solid('hazard', sx * (TW / 2 - 0.1), y0, TL1 - 0.2, 0.4, HT, 0.5, { uv: 0.5, tint: 0.9 });
  doorSteps(S, C, y0, 0, TL1 + 0.3, 1, TW - 0.6);
  // lights: mouth + chamber
  S.light(0, y0 + HC - 0.7, pz, 0x6ad0ff, 0.9, 12, 0.08);
  S.light(0, y0 + HT - 0.7, 3, 0x6ad0ff, 0.7, 10, 0.05);
  // stalactites (instanced cones) are collected by the caller through out.spikes
  for (let i = 0; i < 5; i++) { const [sxw, szw] = toWorld(f, R.float(-TW / 2 + 0.4, TW / 2 - 0.4), TL1 - R.float(0, 1.2)); out.spikes.push({ x: sxw, y: y0 + HT - 0.7, z: szw, ry: 0, rx: Math.PI, sx: 0.28, sy: R.float(0.7, 1.4), sz: 0.28 }); }
  const cave = {
    kind: 'cave', frame: f, y0, pods, prize: { x: px, y: y0 + 1.15, z: pzw }, mouth: { x: mx, y: y0, z: mz }, colliders: S.B.boxes - b0,
    contains(wx, wz, y = y0 + 1) { const [lx, lz] = toLocal(f, wx, wz); return lz > CZ0 - WT && lz < TL1 - 0.3 && Math.abs(lx) < CH / 2 + WT && y > y0 - 1 && y < y0 + HC + 1; },
  };
  return cave;
}

export function buildColdVault(C) {
  const { R, terrain, sc } = C;
  const { gb, B, S } = makeBuilder(C, 0xc01d5a);
  const info = C.info;
  const out = { props: [], info, boxes: 0, spikes: [] };
  Object.assign(info, { kind: 'm5cold', loot: [], prizes: [], zones: [], pods: [], caves: [], counts: {} });
  const taken = [];
  const claim = (s, r) => { taken.push({ x: s.x, z: s.z, r }); C.reserve?.(s.x, s.z, r); };
  const mapSeed = C.seed | 0;

  // ---- server stacks hall
  const hallR = Math.hypot(STACKS.cols, STACKS.rows) * STACKS.pitch / 2 + 4;
  const hs = findSite(C, taken, hallR, 2.4);
  if (hs) {
    hs.rot = R.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    claim(hs, hallR);
    const plan = planStacks(siteSeed(mapSeed, 'stacks'));
    const v = verifyStacks(plan);
    if (!v.ok) console.warn('m5 stacks plan', v.errors);
    try {
      const rt = buildStacks(C, S, hs, plan, out);
      info.zones.push({ id: 'stacks', x: hs.x, z: hs.z, contains: (x, z, y) => rt.contains(x, z, y), fog: 3.4, dark: 0.3, tint: 0x0a1822 });
      info.prizes.push({ ...rt.core, y: rt.core.y + 1.1, item: 'm5_cryocore', zone: 'stacks' });
      if (C.scrapSpots.length < 2) C.scrapSpots.push({ x: rt.gates[0].x, z: rt.gates[0].z });
      // small loot in the aisles: dead ends of the current phase are not stable, so pick fixed cells far from both gates
      const cells = [];
      for (let i = 0; i < plan.cols * plan.rows; i++) cells.push(i);
      cells.sort((a, b) => Math.abs((b % plan.cols) - plan.cols / 2) + Math.abs(((b / plan.cols) | 0) - plan.rows / 2) - Math.abs((a % plan.cols) - plan.cols / 2) - Math.abs(((a / plan.cols) | 0) - plan.rows / 2) || a - b);
      for (const i of cells.slice(0, 4)) {
        const lx = ((i % plan.cols) + 0.5) * STACKS.pitch - (plan.cols * STACKS.pitch) / 2, lz = (((i / plan.cols) | 0) + 0.5) * STACKS.pitch - (plan.rows * STACKS.pitch) / 2;
        const [wx, wz] = toWorld(rt.frame, lx, lz);
        info.loot.push({ x: wx, y: rt.y0 + 0.4, z: wz, kind: 'aisle' });
      }
    } catch (e) { console.warn('m5 stacks', e); }
  }
  // ---- cryo caves
  const nCave = 1 + (sc > 1.05 ? 1 : 0);
  for (let i = 0; i < nCave; i++) {
    const s = findSite(C, taken, 20, 2.6);
    if (!s) continue;
    s.rot = R.float(0, TAU);
    claim(s, 20);
    try {
      const cave = buildCave(C, S, s, R, out, i);
      info.caves.push(cave);
      info.pods.push(...cave.pods);
      info.zones.push({ id: 'cave', x: s.x, z: s.z, contains: (x, z, y) => cave.contains(x, z, y), fog: 2.4, dark: 0.45, tint: 0x0c2030 });
      info.prizes.push({ ...cave.prize, item: 'm5_cryocore', zone: 'cave' });
      cave.pods.filter((p) => p.open && !p.sleeper).forEach((p) => info.loot.push({ x: p.x, y: p.y + 0.5, z: p.z, kind: 'pod' }));
      if (C.scrapSpots.length < 2) C.scrapSpots.push({ x: cave.mouth.x, z: cave.mouth.z });
    } catch (e) { console.warn('m5 cave', e); }
  }
  // ---- conveyor line + broken racks + ice crystals
  const cs = findSite(C, taken, 12, 2.0, 250);
  if (cs) {
    claim(cs, 12);
    const a0 = R.pick([0, Math.PI / 2]) + R.float(-0.15, 0.15), ca = Math.cos(a0), sa = Math.sin(a0);
    for (let k = -1; k <= 1; k++) { const x = cs.x + ca * k * 4.2, z = cs.z + sa * k * 4.2; out.props.push({ id: 'm5:conveyor', x, y: C.h(x, z) - 0.02, z, ry: -a0 }); }
    info.loot.push({ x: cs.x, y: cs.y0 + 1.6, z: cs.z, kind: 'conveyor' });
  }
  for (let i = 0; i < Math.round(9 * sc); i++) { const p = C.spot(2, 12); if (p) out.props.push({ id: 'm5:broken_rack', x: p.x, y: C.h(p.x, p.z) - 0.05, z: p.z, ry: R.float(0, TAU) }); }
  for (let i = 0; i < Math.round(16 * sc); i++) { const p = C.spot(2, 12); if (p) out.props.push({ id: 'm5:ice_cluster', x: p.x, y: C.h(p.x, p.z) - 0.1, z: p.z, ry: R.float(0, TAU) }); }
  // ---- snow drifts + spikes + snowfall + blizzard gusts
  const drift = new THREE.SphereGeometry(1, 7, 4).scale(1, 0.32, 1), drifts = [];
  for (let i = 0; i < Math.round(80 * sc * sc); i++) {
    const x = R.float(-C.lim, C.lim), z = R.float(-C.lim, C.lim);
    if (C.avoid(x, z, -2)) continue;
    drifts.push({ x, y: C.h(x, z) - 0.05, z, ry: R.float(0, TAU), sx: R.float(1.5, 4.2), sy: R.float(0.8, 1.5), sz: R.float(1.2, 3.0) });
  }
  instanced(C, drift, C.mat(new THREE.MeshLambertMaterial({ color: 0xe6f0f8 })), drifts);
  instanced(C, new THREE.ConeGeometry(0.6, 1, 5).translate(0, 0.5, 0), C.mat(new THREE.MeshBasicMaterial({ color: 0xa8dcf4 })), out.spikes);
  skyBox(C, { n: 900, size: 0.12, color: 0xf6fbff, wind: [1.7, 0.6], fall: 1.7, jitter: 0.5 });
  C.terrain.wx = C.terrain.wx || {};
  C.updaters.push((dt, t) => { C.terrain.wx.gust = Math.min(1, Math.max(0, Math.sin(t * 0.21) * Math.sin(t * 0.07 + 1.3)) * 1.6 * (C.moon?.blizzard ? 1.6 : 1)); });
  // ---- flush
  out.boxes += placeProps(C, out.props);
  const mesh = flush(C, gb, B);
  info.drawCalls = mesh.children.length;
  info.counts = { colliders: B.boxes + out.boxes + (info.stacks?.walls.length || 0), props: out.props.length, pods: info.pods.length, loot: info.loot.length, merged: mesh.children.length };
  void terrain;
}

registerDecor('m5cold', buildColdVault);
