// [finish] Ship INCUBATOR prop (pets, wave 3): a glass dome on the +z wall of the ship that shows the eggs in profile.pets.incubator
// (2 slots), their hatch progress and a glow when one is ready. [E] with an egg in hand puts it in; [E] without one opens the PET panel (NEST tab).
// Purely visual + interactable: the rules stay in pets_core.js (incubate / hatchReady), the profile is the truth. One small merged
// mesh group (no lights: emissive only, the light count never changes).
import * as THREE from 'three';
import * as C from './pets_core.js';
import { G } from '../physics/physics.js';
import { t } from '../core/i18n.js';
import { SPOTS } from '../world/shiplayout.js';

export const INCUBATOR_POS = { x: SPOTS.incubator.x, z: SPOTS.incubator.z };
const EGG_COL = { pet_egg_common: '#eadfc4', pet_egg_wild: '#8fd08a', pet_egg_glitch: '#8a66ff', strange_egg: '#ff66d8' };

export function installIncubator(game, api) {
  const ship = game.ship;
  if (!ship?.group || typeof document === 'undefined') return { dispose() {} };
  const geos = [], mats = [];
  const G_ = (g) => { geos.push(g); return g; };
  const M_ = (m) => { mats.push(m); return m; };
  const root = new THREE.Group();
  root.name = 'petIncubator';
  root.position.set(INCUBATOR_POS.x, 0, INCUBATOR_POS.z);
  root.rotation.y = Math.PI;   // faces -z (into the ship)
  const metal = M_(new THREE.MeshLambertMaterial({ color: 0x3a3f46 }));
  const trim = M_(new THREE.MeshLambertMaterial({ color: 0xff8a3d, emissive: 0x552200 }));
  const glass = M_(new THREE.MeshLambertMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
  const add = (geo, mat, x, y, z, parent = root) => { const m = new THREE.Mesh(G_(geo), mat); m.position.set(x, y, z); parent.add(m); return m; };
  add(new THREE.BoxGeometry(1.0, 0.7, 0.62), metal, 0, 0.35, 0);
  add(new THREE.BoxGeometry(1.04, 0.05, 0.66), trim, 0, 0.72, 0);
  const dome = add(new THREE.SphereGeometry(0.46, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0.74, 0);
  dome.scale.set(1.05, 0.9, 0.62);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), metal, 0, 1.2, 0);
  const lampMat = M_(new THREE.MeshLambertMaterial({ color: 0xffb060, emissive: 0xff7a20 }));
  add(new THREE.SphereGeometry(0.06, 8, 6), lampMat, 0, 1.32, 0);
  // slots: egg + progress bar each
  const slots = [];
  for (let i = 0; i < C.INCUBATOR_SLOTS; i++) {
    const x = i === 0 ? -0.22 : 0.22;
    const eggMat = M_(new THREE.MeshLambertMaterial({ color: 0xeadfc4, emissive: 0x000000 }));
    const egg = add(new THREE.SphereGeometry(0.13, 12, 10), eggMat, x, 0.9, 0);
    egg.scale.set(1, 1.3, 1); egg.visible = false;
    const barMat = M_(new THREE.MeshLambertMaterial({ color: 0x66ff99, emissive: 0x114422 }));
    const bar = add(new THREE.BoxGeometry(0.36, 0.04, 0.02), barMat, x, 0.5, -0.32);
    bar.scale.x = 0.001;
    const back = add(new THREE.BoxGeometry(0.38, 0.06, 0.015), M_(new THREE.MeshLambertMaterial({ color: 0x111418 })), x, 0.5, -0.31);
    void back;
    slots.push({ egg, eggMat, bar, x });
  }
  ship.group.add(root);
  root.traverse((o) => { if (o.isMesh) o.userData.petIncubator = true; });
  let col = null;
  try { col = game.physics?.addStaticBox(INCUBATOR_POS.x, 0.4, INCUBATOR_POS.z, 0.52, 0.4, 0.33, 0, G.STATIC, { kind: 'static' }); } catch { /* physics not ready */ }

  let time = 0, sigT = 0, sig = '';
  function refresh() {
    const s = C.ensurePets(game.profile);
    const key = s.incubator.map((e) => `${e.id}:${C.eggProgress(e, s.clock).toFixed(2)}`).join('|');
    if (key === sig) return;
    sig = key;
    slots.forEach((sl, i) => {
      const e = s.incubator[i];
      sl.egg.visible = !!e;
      if (!e) { sl.bar.scale.x = 0.001; return; }
      const prog = C.eggProgress(e, s.clock);
      sl.eggMat.color.set(EGG_COL[e.item] || '#eadfc4');
      sl.bar.scale.x = Math.max(0.001, prog);
      sl.bar.position.x = sl.x - 0.18 * (1 - prog);
    });
  }
  const off = game.mods.on('update', (dt, g) => {
    if (g !== game) return;
    time += dt; sigT -= dt;
    if (sigT <= 0) { sigT = 0.5; try { refresh(); } catch { /* profile not ready */ } }
    const s = C.ensurePets(game.profile);
    slots.forEach((sl, i) => {
      const e = s.incubator[i];
      if (!e) return;
      const ready = C.eggReady(e, s.clock);
      sl.eggMat.emissive.setRGB(ready ? 0.35 + 0.25 * Math.sin(time * 6) : 0.04, ready ? 0.3 : 0.03, ready ? 0.1 : 0.02);
      sl.egg.rotation.z = Math.sin(time * (ready ? 9 : 1.4) + i) * (ready ? 0.22 : 0.05);
    });
    lampMat.emissive.setRGB(0.9 + 0.1 * Math.sin(time * 2), 0.4, 0.1);
  });
  const offI = game.mods.on('interactables', (list, g) => {
    if (g !== game || !game.player?.inShip) return;
    const held = game.player.heldItem?.();
    const egg = held && C.isEggItem(held.type) ? held : null;
    list.push({
      pos: new THREE.Vector3(INCUBATOR_POS.x, 1.0, INCUBATOR_POS.z - 0.55), r: 0.9, reach: 2.4,
      label: () => (egg ? t('Place egg [E]') : t('Incubator') + ' [E]'),
      action: () => {
        if (egg) { const r = api.incubateItem(egg); game.ui?.toast(r.ok ? t('Incubating') + ' ✓' : t(r.err), r.ok ? 'good' : 'warn'); refresh(); }
        else api.open?.('nest');
      },
    });
  });
  refresh();
  return {
    refresh,
    dispose() {
      try { off?.(); offI?.(); } catch { /* ignore */ }
      root.removeFromParent();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      if (col) { try { game.physics?.removeCollider(col); } catch { /* ignore */ } }
    },
  };
}
