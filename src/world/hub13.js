import * as THREE from 'three';
import { GeoBuilder, levelMaterial } from './geobuilder.js';
import { freeTree } from '../render/textures.js';
import { BIOMES } from '../game/moons.js';
import { dressPort14 } from './port14.js';

export const HUB13_SPAWN = [0, -1.15, 23];
export const HUB13_BROKER = [0, 0.2, 30];
export const HUB13_BOARD = [3, 0.2, 9.48];
export function buildHub13({ physics }) {
  const group = new THREE.Group(); group.name = 'relay-dock-hub';
  const gb = new GeoBuilder(), colliders = [];
  const box = (mat, x, y, z, w, h, d, shade = 0.65) => {
    gb.box(mat, x, y, z, w, h, d, shade);
    colliders.push(physics.addStaticBox(x, y, z, w / 2, h / 2, d / 2));
  };
  box('concrete', 0, -2.25, 9, 100, 2, 88);
  for (const [x, z, w, d] of [[-50, 9, 0.8, 88], [50, 9, 0.8, 88], [0, -35, 100, 0.8], [0, 53, 100, 0.8]]) box('metal_dark', x, 1, z, w, 4.5, d);
  // Open-front dock office. Its central aisle faces the landing ship.
  box('metal_dark', 0, 2.5, 37, 26, 7.5, 0.6);
  box('metal_dark', -13, 2.5, 31, 0.6, 7.5, 12);
  box('metal_dark', 13, 2.5, 31, 0.6, 7.5, 12);
  box('metal_rust', 0, 6.5, 31, 27, 0.7, 13);
  box('hazard_stripes', 0, -0.65, 31, 6, 1.2, 1.3);
  box('metal_dark', 3, -0.3, 9, 1.1, 1.9, 0.8);
  // Dockmaster behind the desk, rather than an invisible menu hotspot.
  const skin = new THREE.MeshLambertMaterial({ color: 0xbba78c });
  const suit = new THREE.MeshLambertMaterial({ color: 0x437084 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1, 0.45), suit); torso.position.set(0, 0, 32); group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.44), skin); head.position.set(0, 0.8, 32); group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.15, 0.52), suit); cap.position.set(0, 1.12, 32); group.add(cap);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.06), new THREE.MeshBasicMaterial({ color: 0x43c2bc })); screen.position.set(3, 0.35, 9.45); group.add(screen);
  // Boarding approach remains unobstructed. Separate gantries give the dock a skyline.
  for (const x of [-29, 29]) {
    box('metal_rust', x, 7, -8, 1.4, 16.5, 1.4);
    box('metal_rust', x, 7, 17, 1.4, 16.5, 1.4);
    box('hazard_stripes', x, 15, 4.5, 3, 1.5, 28);
    box('metal_dark', x, -0.7, 4, 14, 1, 22);
    // Drydock engine stacks are separated from traversable service lanes.
    for (const z of [-3, 5, 13]) box('metal_rust', x, 0.9, z, 6, 3.4, 4);
  }
  group.add(gb.build((key) => levelMaterial(key)));
  const port14=dressPort14(group,'hub',-1.25);
  const terrain = { biome: BIOMES.pier, heightAt: () => -1.25, half: 50, playHalf: 48, scale: 1, lakes: [], flood: null, lava: null, onIce: () => false, footSurface: () => 'concrete', blocked: () => false, noise2: { noise: () => 0 }, plan: { ponds: [], fires: [], lakes: [], entrance: { x: 0, z: 30 } } };
  return { group, colliders, terrain, vendorSpace: { pos: [-18, -1.25, 29], facing: Math.PI / 2 }, interactables: [], emitters: [], dispose(p) { port14.dispose(); for (const c of colliders) p.removeCollider(c); colliders.length = 0; group.parent?.remove(group); freeTree(group); } };
}
