// Backrooms loot (module 'backrooms'): Almond Water becomes a drink, plus four liminal items with tiers.
// Registered at runtime (registerItem + a model factory in the mod item-model registry), so no shared table file
// is edited. Behaviour on use lives in game/backrooms.js (useItem hook).
import * as THREE from 'three';
import { ITEMS, SCRAP_TABLE, registerItem } from './items.js';
import { extTexturePath } from '../audio/extassets.js';
import { exitSignTexture } from '../world/backrooms_pocket.js';
import { paintLiminalPhoto } from '../render/liminal_photo.js';

export const BR_ITEMS = Object.freeze(['br_polaroid', 'br_exitsign', 'br_levelkey', 'br_carpet']);
export const ALMOND = 'x_almondwater';

const DEFS = [
  { id: 'br_polaroid', name: 'Liminal Polaroid', kind: 'scrap', value: [45, 95], weight: 0.5, hands: 1, tier: 'rare', strange: true, noclip: true,
    tip: 'LMB: look at the photo. It shows a place you have not been. Yet.' },
  { id: 'br_exitsign', name: 'EXIT Sign', kind: 'scrap', value: [110, 190], weight: 9, hands: 1, tier: 'epic', noclip: true,
    tip: 'Still glowing. It does not need power.' },
  { id: 'br_levelkey', name: 'Level Key', kind: 'scrap', value: [180, 300], weight: 1, hands: 1, tier: 'legendary', noclip: true,
    tip: 'LMB inside the Backrooms: it hums toward the EXIT.' },
  { id: 'br_carpet', name: 'Damp Carpet Sample', kind: 'scrap', value: [3, 11], weight: 3, hands: 1, tier: 'common', junk: true, noclip: true,
    tip: 'It is wet. It has always been wet.' },
];

// ------------------------------------------------------------------ models (built with the THREE the mod API hands in)
let photoTex = null, carpetTex = null, signTex = null;
const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
function boxMesh(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }

function polaroidModel() {
  if (!photoTex) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 52;
    paintLiminalPhoto(c, 1337, { stamp: false });
    photoTex = new THREE.CanvasTexture(c); photoTex.colorSpace = THREE.SRGBColorSpace; photoTex.magFilter = THREE.NearestFilter;
  }
  const g = new THREE.Group();
  g.add(boxMesh(0.11, 0.006, 0.13, lam(0xeeeadf)));
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.094, 0.082), new THREE.MeshLambertMaterial({ map: photoTex, emissive: 0x222014 }));
  photo.rotation.x = -Math.PI / 2; photo.position.set(0, 0.0035, -0.012);
  g.add(photo);
  return g;
}
function exitSignModel() {
  if (!signTex) signTex = exitSignTexture();
  const body = new THREE.MeshBasicMaterial({ color: 0x0b4a22 });
  const face = new THREE.MeshBasicMaterial({ map: signTex });
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.24, 0.09), [body, body, body, body, face, face]);
  const g = new THREE.Group(); g.add(m);
  // two broken-off mounting wires
  const wire = lam(0x222222);
  g.add(boxMesh(0.008, 0.08, 0.008, wire, -0.22, 0.16, 0)); g.add(boxMesh(0.008, 0.06, 0.008, wire, 0.2, 0.15, 0));
  return g;
}
function levelKeyModel() {
  const brass = lam(0xc8a24a, { emissive: 0x2a1e04 });
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 6, 12), brass);
  ring.position.set(-0.07, 0, 0); g.add(ring);
  g.add(boxMesh(0.1, 0.012, 0.012, brass, 0.0, 0, 0));
  g.add(boxMesh(0.012, 0.022, 0.012, brass, 0.03, -0.014, 0)); g.add(boxMesh(0.012, 0.03, 0.012, brass, 0.046, -0.018, 0));
  // paper tag
  const tag = boxMesh(0.05, 0.028, 0.003, lam(0xf1d86a), -0.12, -0.02, 0);
  tag.rotation.z = 0.5; g.add(tag);
  return g;
}
function carpetModel() {
  if (!carpetTex) {
    const p = extTexturePath('tfg_backrooms_carpet');
    carpetTex = p ? new THREE.TextureLoader().load(p) : null;
    if (carpetTex) { carpetTex.colorSpace = THREE.SRGBColorSpace; carpetTex.magFilter = THREE.NearestFilter; }
  }
  const g = new THREE.Group();
  const top = new THREE.MeshLambertMaterial({ map: carpetTex, color: carpetTex ? 0xd8c890 : 0x9a7f3c });
  const side = lam(0x5a4822);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.3), [side, side, top, side, side, side]));
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.12), [side, side, top, side, side, side]);
  flap.position.set(0, 0.03, -0.09); flap.rotation.x = 0.35; g.add(flap);
  return g;
}
const MODELS = { br_polaroid: polaroidModel, br_exitsign: exitSignModel, br_levelkey: levelKeyModel, br_carpet: carpetModel };

/** Register the items (idempotent: every new Game re-installs the module). */
export function installBrItems() {
  const mm = window.__kefalMods;
  for (const d of DEFS) {
    registerItem({ ...d });
    mm?.itemModels?.set(d.id, () => MODELS[d.id]());
  }
  // a little liminal junk also turns up in the normal Backrooms interior
  const tbl = SCRAP_TABLE.backrooms;
  if (tbl && !tbl.some((e) => e[0] === 'br_carpet')) tbl.push(['br_carpet', 3], ['br_polaroid', 1]);
  patchAlmondWater();
}

/** Almond Water: keeps its value (still sellable scrap) but LMB drinks it (handled in game/backrooms.js). */
export function patchAlmondWater() {
  const d = ITEMS[ALMOND];
  if (!d) return false;
  d.drink = { hp: 25, stamina: true, calm: 20 };
  d.tier = d.tier || 'uncommon';
  d.tip = 'LMB: drink (+25 HP, stamina, calms you). Or sell it.';
  return true;
}
