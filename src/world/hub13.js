import * as THREE from 'three';
import { GeoBuilder, levelMaterial } from './geobuilder.js';
import { freeTree } from '../render/textures.js';
import { BIOMES } from '../game/moons.js';
import { createDockmaster18 } from './dockmaster18.js';
import { buildDock18 } from './dock18.js';
import { dressPort14 } from './port14.js';

const freeze18=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze18(child);Object.freeze(value);}return value;};

export const HUB13_SPAWN = [0, -1.15, 23];
// Customer-facing CRT, above the physical counter; shared by E, guidance and host range.
export const HUB13_BROKER = [0, 0.70, 31.56];
export const HUB13_BOARD = [3, 0.2, 9.48];
export function buildHub13({ physics }) {
  const group = new THREE.Group(); group.name = 'relay-dock-hub';
  const gb = new GeoBuilder(), colliders = [];
  const box = (mat, x, y, z, w, h, d, shade = 0.65, collisionOnly = false) => {
    if(!collisionOnly)gb.box(mat, x, y, z, w, h, d, shade);
    colliders.push(physics.addStaticBox(x, y, z, w / 2, h / 2, d / 2));
  };
  box('concrete', 0, -2.25, 9, 100, 2, 88);
  for (const [x, z, w, d] of [[-50, 9, 0.8, 88], [50, 9, 0.8, 88], [0, -35, 100, 0.8], [0, 53, 100, 0.8]]) box('metal_dark', x, 1, z, w, 4.5, d);
  // Open-front dock office. Its central aisle faces the landing ship.
  box('metal_dark', -4.8, 3.8, 37, 16.4, 10.1, 0.6);
  box('metal_dark', 8.25, 2.2, 37, 9.5, 6.9, 0.6);
  box('metal_dark', -13, 2.5, 31, 0.6, 7.5, 12);
  box('metal_dark', 13, 2.5, 31, 0.6, 7.5, 12);
  box('metal_dark', -4.8, 9.1, 31, 17.4, 0.7, 13);
  box('metal_dark', 8.25, 5.95, 31, 9.8, 0.5, 13);
  box('metal_dark', 0, -0.65, 31, 6, 1.2, 1.3,0,true);
  box('metal_dark', 3, -0.3, 9, 1.1, 1.9, 0.8);
  // Individual cast jamb/lintel colliders; never use the whole sculpture AABB across the doorway.
  for(const x of [-11.8,11.8])box('metal_dark',x,1.9,24.45,1.35,7.5,.9,0,true);
  box('metal_dark',0,4.2,24.4,24.8,1.4,1.03,0,true);
  const service=createDockmaster18();service.position.set(0,-1.25,31);group.add(service);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.06), new THREE.MeshBasicMaterial({ color: 0x43c2bc })); screen.position.set(3, 0.35, 9.45); group.add(screen);
  const dock18=buildDock18(group,box);
  group.add(gb.build((key) => levelMaterial(key)));
  const port14=dressPort14(group,'hub',-1.25);
  const terrain = { biome: BIOMES.pier, heightAt: () => -1.25, half: 50, playHalf: 48, scale: 1, lakes: [], flood: null, lava: null, onIce: () => false, footSurface: () => 'concrete', blocked: () => false, noise2: { noise: () => 0 }, plan: { ponds: [], fires: [], lakes: [], entrance: { x: 0, z: 30 } } };
  return { group, colliders, terrain, dock18: freeze18({...dock18.metrics,assetReady:!!service.userData.assetReady,serviceName:service.name,
    routes:Object.freeze([
      Object.freeze({id:'fleet',feet:Object.freeze([[0,-1.15,23],[1.8,-1.15,23],[1.8,-1.15,29.8]]),target:HUB13_BROKER.slice()}),
      Object.freeze({id:'market',feet:Object.freeze([[0,-1.15,23],[-18,-1.15,23],[-23.8,-1.15,23],[-23.8,-1.15,32.8],[-18,-1.15,32.8]]),target:[-18,-.15,29.6]}),
      Object.freeze({id:'departure',feet:Object.freeze([[0,-1.15,23],[5.2,-1.15,23],[5.2,-1.15,11],[3,-1.15,11]]),target:HUB13_BOARD.slice()})
    ]),views:Object.freeze([
      Object.freeze({id:'arrival',feet:[0,-1.15,23],target:[-4.8,5.5,31]}),
      Object.freeze({id:'transfer-ribs',feet:[0,-1.15,18],target:[0,18,-18]}),
      Object.freeze({id:'market-front',feet:[-18,-1.15,32.8],target:[-18,1.4,27]}),
      Object.freeze({id:'east-spools',feet:[14,-1.15,14],target:[29,8.1,9]})
    ])}), vendorSpace: { pos: [-18, -1.25, 29], facing: Math.PI / 2 }, interactables: [], emitters: [], dispose(p) { port14.dispose(); for (const c of colliders) p.removeCollider(c); colliders.length = 0; group.parent?.remove(group); freeTree(group); } };
}
