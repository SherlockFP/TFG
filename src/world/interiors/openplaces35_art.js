// Opted open places retain native theme/economy identity. Every map owns its cloud
// geometry/material/texture; freeTree disposes them with the facility group.
import * as THREE from 'three';
import { RNG } from '../../core/rng.js';
import { addTranslations } from '../../core/i18n.js';

const PLACES = {
  courtyard: { name: 'Service Courtyard', tr: 'Servis Avlusu', ru: 'Служебный двор', floor: 'concrete_stained', wall: 'concrete' },
  concourse: { name: 'Empty Concourse', tr: 'Boş Alışveriş Holü', ru: 'Пустая торговая галерея', floor: 'marble', wall: 'wall_office' },
  reception: { name: 'Reception Atrium', tr: 'Karşılama Atriyumu', ru: 'Атриум приёмной', floor: 'carpet_office', wall: 'wall_office' },
};
addTranslations(Object.fromEntries(Object.values(PLACES).map(p => [p.name, p.tr])));
addTranslations(Object.fromEntries(Object.values(PLACES).map(p => [p.name, p.ru])), 'ru');

function admitted(L) {
  const O = L?.open35;
  return O?.version === 35 && Object.hasOwn(PLACES, O.kind) && Array.isArray(O.publicRooms) && O.publicRooms.length > 0;
}

/** Exact legacy identity; opted copies do not mutate the registered theme/style. */
export function openPlaceStyle35(baseDef, L) {
  if (!admitted(L)) return baseDef;
  const p = PLACES[L.open35.kind];
  const bare = {
    floor: p.floor, wall: p.wall, ceil: 'ceiling_tiles', base: 'metal_dark',
    lamp: null, center: null, rows: null, grid: null, wall_: [], clutter: [],
    posters: 0, webs: false, reactor: false,
  };
  // The bay's low fixture uses the existing pool, and leaves its central haul lane clear.
  const bay = { ...bare, lamp: 'wall_lamp', lampColor: 0xd9d2bc, wall_: [], clutter: [] };
  return {
    ...baseDef,
    name: p.name,
    viewFar: 96,
    atmosphere: { ...baseDef.atmosphere, fog: 0x71756f, density: .016, hemi: .22, ambient: .18 },
    style: { ...baseDef.style, rooms: { ...baseDef.style?.rooms, open35_public: bare, open35_bay: bay } },
    roomStyle35(r, original) {
      if (L.open35.publicRooms.includes(r?.id)) return bare;
      if (L.open35.bayRooms?.includes(r?.id)) return bay;
      return original;
    },
  };
}

/** Only the visual ceiling opens. The facility builder always retains its solid roof. */
export function openPlaceCeiling35(L, i) {
  return !(admitted(L) && L.cells?.[i] && Array.isArray(L.open35.skyRooms) && L.open35.skyRooms.includes(L.roomOf?.[i]));
}

// Smooth periodic value noise gives continuous grey cover across the dome's UV seam.
function cloudTexture(seed) {
  const rng = new RNG((seed ^ 0x35c10d) >>> 0);
  const fields = [4, 8, 16].map(n => ({ n, values: Float32Array.from({ length: n * n }, () => rng.next()) }));
  const smooth = t => t * t * (3 - 2 * t);
  const sample = (f, u, v) => {
    const x = u * f.n, y = v * f.n, ix = Math.floor(x), iy = Math.floor(y);
    const tx = smooth(x - ix), ty = smooth(y - iy), { n, values: g } = f;
    const a = g[(iy % n) * n + (ix % n)], b = g[(iy % n) * n + ((ix + 1) % n)];
    const c = g[((iy + 1) % n) * n + (ix % n)], d = g[((iy + 1) % n) * n + ((ix + 1) % n)];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const cover = sample(fields[0], u, v) * .6 + sample(fields[1], u, v) * .3 + sample(fields[2], u, v) * .1;
    const grey = 112 + Math.round(cover * 6) * 12, i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = grey; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.name = 'openplaces35-overcast';
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  return tex;
}

/** One bounded cloud hemisphere, independently owned by each actual facility. */
export function buildOpenPlaceSky35(ctx) {
  const L = ctx?.layout, group = ctx?.group;
  if (!admitted(L) || !group || !Array.isArray(L.open35.skyRooms)) return null;
  const existing = group.getObjectByName('openplaces35-sky');
  if (existing) return existing;
  const room = L.rooms?.find(r => L.open35.skyRooms.includes(r.id));
  if (!room) return null;
  const geometry = new THREE.SphereGeometry(42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ map: cloudTexture(L.seed >>> 0), side: THREE.BackSide, fog: false, depthWrite: false });
  material.defines = { PSX_NOSNAP: '' };
  const sky = new THREE.Mesh(geometry, material);
  sky.name = 'openplaces35-sky'; sky.userData.noMerge = true;
  sky.renderOrder = -10; sky.frustumCulled = false;
  sky.position.set(L.ox + (room.x + room.w / 2) * L.cell, (ctx.Y ?? L.y) + room.height, L.oz + (room.z + room.h / 2) * L.cell);
  group.add(sky);
  return sky;
}
