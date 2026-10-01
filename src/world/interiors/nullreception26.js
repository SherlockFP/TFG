// Original liminal facility: the dead network keeps a waiting room for every
// message that never reached a recipient. Native facility layout/nav owns access.
import * as THREE from 'three';
import { GeoBuilder } from '../geobuilder.js';
import { layoutKit, WALL_ROT } from './common.js';
import { getLang, onLangChange } from '../../core/i18n.js';

const roomStyle = (floor = 'tiles_dirty') => ({
  floor, wall: 'wall_office', ceil: 'ceiling_tiles', lamp: 'wall_lamp',
  center: null, wall_: [], clutter: [], posters: 0,
});
const roomTypes = ['entrance', 'ticket_hall', 'return_office', 'receipt_store', 'waiting_hall', 'storage', 'generator', 'vault', 'nest'];
const rooms = Object.fromEntries(roomTypes.map(type => [type, roomStyle(type === 'receipt_store' ? 'carpet_office' : 'tiles_dirty')]));
rooms.generator = { ...roomStyle('concrete'), wall_: ['generator', 'fuse_box'], reactor: true };
rooms.vault = roomStyle('metal_plate');
rooms.nest = { ...roomStyle('carpet_office'), lamp: null };

export const NULL_RECEPTION26 = {
  id: 'nullreception',
  name: 'Null Reception',
  blurb: 'Undelivered messages took a number. No number has been called. Loud steps leave a delayed receipt.',
  style: { corridor: { floor: 'tiles_dirty', wall: 'wall_office', ceil: 'ceiling_tiles', base: 'metal_dark' }, rooms },
  roomTypes: [['return_office', 4], ['receipt_store', 3], ['waiting_hall', 3, true], ['storage', 1]],
  roomHeight: type => type === 'ticket_hall' ? 4.4 : 3.8,
  layout: {
    plan: 'wings', doorP: .2, blastP: 0, loops: .42, bigChance: .25,
    corridorH: 3.6, hub: { type: 'ticket_hall', w: 4, h: 4 },
    hubAlways: true, roomMul: .75, lockedP: 0,
  },
  lamps: { corridor: 'wall_lamp', every: 4, color: 0xd7cdb5, flicker: .035 },
  lampColor: 0xd7cdb5,
  posters: [], landmarks: [], doorProp: 'door_single', corridorScrap: .07,
  noFlood: roomTypes,
  footstep: { tiles_dirty: 'tile', carpet_office: 'carpet', concrete: 'concrete', metal_plate: 'metal' },
  ambience: { base: 'ambience_facility', vol: .25, buzz: 'lights_buzz', buzzVol: .07, env: 'facility' },
  atmosphere: { fog: 0x242729, density: .022 },
  decorate,
};

const SIGNS = {
  en: ['NULL RECEPTION', 'LOUD SOUNDS RETURN', 'Leave an echo, then walk quietly.', 'Messages retained. Recipients missing.'],
  tr: ['BOŞ KARŞILAMA', 'GÜRÜLTÜ GERİ DÖNER', 'Yankı bırak, sonra sessizce yürü.', 'İletiler saklandı. Alıcılar kayıp.'],
  ru: ['ПУСТАЯ ПРИЁМНАЯ', 'ШУМ ВОЗВРАЩАЕТСЯ', 'Оставьте эхо, затем идите тихо.', 'Сообщения сохранены. Адресаты пропали.'],
};

function decorate(ctx) {
  const { layout: L, Y, group } = ctx, K = layoutKit(L);
  const root = new THREE.Group(); root.name = 'nullreception26'; group.add(root);
  const gb = new GeoBuilder(), palette = { ivory: 0xbdb6a3, steel: 0x777d7b, dark: 0x333b3e, ochre: 0xa18857 };
  const mats = [], geometries = [], signAnchors = [], receipts = [];
  const box = (key, x, y, z, w, h, d) => gb.box(key, x, y, z, w, h, d, .2);
  let windows = 0;
  for (const r of L.rooms) {
    if (['generator', 'vault', 'nest'].includes(r.type) || r.maze || r.arena || r.type.startsWith('m2_')) continue;
    const edges = K.solidWalls(r).filter((e, i) => i % 2 === 0).slice(0, 2);
    for (const e of edges) {
      if (windows >= 36) break;
      // Empty service windows and receipt slots are only16cm deep against a
      // solid native wall. No free-standing invisible obstacle is introduced.
      const [x, z] = K.wallPoint(e.x, e.z, e.d, 0, .085), alongX = e.d === 1 || e.d === 3;
      const w = alongX ? 2.55 : .08, d = alongX ? .08 : 2.55;
      box('dark', x, Y + 1.9, z, w, 1.4, d);
      for (const offset of [-1.31, 1.31]) {
        box('ivory', x + (alongX ? offset : 0), Y + 1.9, z + (alongX ? 0 : offset), alongX ? .09 : .16, 1.6, alongX ? .16 : .09);
      }
      for (const height of [1.09, 2.72]) box('steel', x, Y + height, z, alongX ? 2.72 : .16, .08, alongX ? .16 : 2.72);
      const [sx, sz] = K.wallPoint(e.x, e.z, e.d, .84, .145);
      box('ochre', sx, Y + 1.15, sz, alongX ? .24 : .03, .07, alongX ? .03 : .24);
      const [px, pz] = K.wallPoint(e.x, e.z, e.d, -.84, .14);
      box('ivory', px, Y + 1.54, pz, alongX ? .27 : .025, .37, alongX ? .025 : .27);
      receipts.push(Object.freeze({ room: r.id, x: px, y: Y + 1.54, z: pz }));
      windows++;
    }
    if (r.type === 'ticket_hall' || r.type === 'waiting_hall') {
      const R = K.roomRect(r), x = (R.x0 + R.x1) / 2, z = (R.z0 + R.z1) / 2;
      // Repeated abandoned queue rails are suspended above standing headroom.
      // The floor stays continuous and the real lift placement remains clear.
      for (let n = -1; n <= 1; n++) {
        box('steel', x, Y + 3.35, z + n * 1.9, Math.min(8.5, r.w * K.C - 1), .10, .17);
        box('ochre', x + (n + 1) * .7 - .7, Y + 3.20, z + n * 1.9, .36, .22, .035);
      }
    }
    if (['entrance', 'ticket_hall'].includes(r.type)) {
      const e = K.solidWalls(r)[0];
      if (e) { const [x, z] = K.wallPoint(e.x, e.z, e.d, 0, .19); signAnchors.push(Object.freeze({ x, y: Y + 1.85, z, yaw: WALL_ROT[e.d], room: r.id })); }
    }
  }
  root.add(gb.build(key => {
    const mat = new THREE.MeshLambertMaterial({ color: palette[key], vertexColors: true, flatShading: true });
    mat.userData.shared = true; mats.push(mat); return mat;
  }));

  // Headless native builds retain the same physical layout; a real browser adds
  // one owned nearest-filtered atlas reused by the two eye-height wall signs.
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (canvas) { canvas.width = 512; canvas.height = 256; }
  const context = canvas?.getContext?.('2d') || null;
  const texture = context ? new THREE.CanvasTexture(canvas) : null;
  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false; texture.userData.keep = true;
  }
  const mat = new THREE.MeshBasicMaterial({ map: texture, color: texture ? 0xffffff : palette.ivory, toneMapped: false });
  mat.userData.shared = true; mats.push(mat);
  for (const p of signAnchors.slice(0, 2)) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 1.52), mat);
    sign.position.set(p.x, p.y, p.z); sign.rotation.y = p.yaw; root.add(sign);
  }
  let signDraws = 0, previousLang = '';
  const draw = () => {
    const language = getLang();
    if (!context || language === previousLang) return;
    previousLang = language; signDraws++;
    const lines = SIGNS[language] || SIGNS.en;
    context.fillStyle = '#30383b'; context.fillRect(0, 0, 512, 256);
    context.textAlign = 'center'; context.fillStyle = '#d3cbb6';
    context.font = 'bold 28px sans-serif'; context.fillText(lines[0], 256, 45, 480);
    context.fillStyle = '#b99c63'; context.font = 'bold 22px sans-serif'; context.fillText(lines[1], 256, 102, 480);
    context.fillStyle = '#d3cbb6'; context.font = '20px sans-serif'; context.fillText(lines[2], 256, 149, 480);
    context.font = '18px sans-serif'; context.fillText(lines[3], 256, 212, 480);
    texture.needsUpdate = true;
  };
  draw(); const offLanguage = onLangChange(draw);
  let batches = 0, triangles = 0;
  root.traverse(obj => {
    if (!obj.geometry) return;
    obj.geometry.userData.shared = true; geometries.push(obj.geometry); batches++;
    triangles += (obj.geometry.index?.count || obj.geometry.attributes.position.count) / 3;
  });
  let disposed = false;
  return { lab: {
    id: 'nullreception', receipts: Object.freeze(receipts), signs: Object.freeze(signAnchors.slice(0, 2)),
    metrics: { batches, triangles, emitters: 0, colliders: 0, atlasPixels: texture ? 512 * 256 : 0, get signDraws() { return signDraws; } },
    dispose() {
      if (disposed) return; disposed = true; offLanguage(); texture?.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of mats) material.dispose(); root.removeFromParent();
    },
  } };
}
