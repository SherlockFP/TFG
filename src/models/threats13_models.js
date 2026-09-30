import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { IDS, TUNE } from '../game/threats13_core.js';
export function createThreat13Model(kind) {
  const root = new THREE.Group(), geos = [], mats = [];
  const mat = (color, glow = false) => { const m = glow ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }) : new THREE.MeshLambertMaterial({ color, flatShading: true }); mats.push(m); return m; };
  const add = (sx, sy, sz, x, y, z, m) => { const g = sy < 0.04 ? new THREE.BoxGeometry(sx, sy, sz) : new RoundedBoxGeometry(sx, sy, sz, 1, Math.min(sx, sy, sz) * 0.22); geos.push(g); const o = new THREE.Mesh(g, m); o.position.set(x, y, z); root.add(o); return o; };
  const printer = kind === IDS.printer, bodyMat = mat(printer ? 0x68645b : 0x54575a), glowMat = mat(printer ? 0xd4a26b : 0xb9bba1, true);
  const body = add(printer ? 1.1 : 0.65, printer ? 1.2 : 0.8, 0.7, 0, printer ? 0.75 : 1.1, 0, bodyMat);
  add(0.55, 0.12, 0.08, 0, printer ? 1.15 : 1.15, 0.4, glowMat);
  for (const x of [-0.4, 0.4]) add(0.14, 0.3, 0.5, x, 0.15, 0, bodyMat);
  if (printer) { add(0.85, 0.08, 0.75, 0, 1.42, -0.15, mat(0xc6bfac)); add(0.75, 0.6, 0.06, 0, 0.72, 0.4, mat(0xc6bfac)); }
  const lane = printer ? add(TUNE.laneWidth * 2, 0.025, TUNE.laneLength, 0, 0.045, TUNE.laneLength / 2, mat(0xff5c24, true)) : null;
  if (lane) lane.visible = false;
  return { root, parts: { body }, height: 1.6, radius: 0.6,
    update(dt, a) { const tell = a.state === 'windup' || a.state === 'scan'; glowMat.opacity = tell ? 0.55 + Math.sin((a.time || 0) * 15) * 0.35 : 0.35; if (lane) lane.visible = a.state === 'windup'; if (!printer) body.position.y = 1.1 + Math.sin((a.time || 0) * 3) * 0.12; },
    setElite() {}, setTint() {}, setHitFlash(v) { bodyMat.emissive.setRGB(v * 0.8, v * 0.15, v * 0.05); },
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); }
  };
}
export function registerThreat13Models(registry) { if (registry) for (const id of Object.values(IDS)) registry.set(id, () => createThreat13Model(id)); }
