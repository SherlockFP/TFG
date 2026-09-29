// Ship features: make the crew ship feel alive and make the purchasable SHIP UPGRADES actually work.
//
//   Loud Horn   ('loudhorn')   big red wall button next to the terminal -> host blasts the roof horn
//                              (fx snd 'ship_horn', heard 600 m away) + a max-loudness creature noise. 3 s cooldown.
//   Floodlight  (+'lightsplus') roof lamp; turns on while landed on a moon after 18:00 or in dark weather
//                              (eclipsed / stormy / foggy). The upgrade doubles its reach and raises its brightness.
//   Disco Ball  ('disco')      spinning mirror ball; interacting toggles party mode: colored moving lights,
//                              beams and a positional music loop.
//   Teleporter  ('teleporter') floor pad (on ship.spawns[2], where the terminal teleport op lands people) +
//                              wall button; beams the radar-tracked crewmate (or their body) back. 10 s cooldown.
//   Mirror                     Reflector on the +z wall. Shows YOUR avatar (mouth follows your voice) and crewmates.
//                              The local avatar lives on THREE layer 1, which only the mirror's camera renders.
//   Cupboard                   the cupboard doors open / close, synced.
//   Nav lights                 the hull's antenna strobe and red/green nav lights blink.
//
// Networking (host-authoritative): peers ask with game.net.request('shipf', { op }) where op is
// 'horn' | 'party' | 'cup' | 'tp' (+target, +term when typed on the terminal) | 'sync'. The host replies with
// 'shipf' messages { k: 'st' (party/cupboard state) | 'horn' | 'tp' | 'deny' | 'info' } (or a 'term' line for
// terminal requests). Late joiners send one 'sync' after the welcome.
//
// Export: installShipFeatures(game) -> { update(dt), dispose(), state }
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHIP, insideShip } from '../world/ship.js';
import { createAvatar } from '../models/avatar.js';
import { suitColor } from '../entities/remote.js';
import { t, tf, t as _t } from '../core/i18n.js';
import { SPOTS } from '../world/shiplayout.js';

const S = SHIP;
const ROOF_Y = S.h + 0.45;                 // matches ship.js (eh)
const HULL_Z1 = S.z1 + 0.25;               // outer +z hull
const MIRROR_LAYER = 1;
const MIRROR_FAR = 120;                    // reflection far plane on a moon (FogExp2 hides the cut by then)
const HORN_CD = 3;
const TP_CD = 10;
const PARTY_CD = 0.75;                     // host debounce: no strobing the party / music by spamming E
const CUP_CD = 0.35;
const DARK_WEATHER = new Set(['eclipsed', 'stormy', 'foggy']);
const EMPTY = Object.freeze({});
const ZERO3 = Object.freeze([0, 0, 0]);
const TAU = Math.PI * 2;

// flat PSX colors, baked into vertex colors of the merged static meshes
const C_DARK = 0x2c2f33, C_METAL = 0x7c8388, C_YELLOW = 0xd8b21c, C_WOOD = 0x6a4a2e;
const C_HORN = 0x9aa0a6, C_PAD = 0x1d2327, C_GLASS = 0x1c2328;

// ---- placement (inside SHIP bounds; clear of terminal, lever, door, arcade and ship.spawns) ----
// +z wall is free between the terminal (x <= -5.9) and the door (x >= 1.5); -z wall is free between the
// coffee machine (x <= -0.63) and the arcade (x >= 0.85).
const HORN_BTN = { x: SPOTS.horn.x, y: SPOTS.horn.y };                                 // +z wall, right of the terminal
const HORN_SPEAKER = new THREE.Vector3(-3.5, ROOF_Y + 0.35, 0);        // roof (sound origin)
const MIRROR = { x: SPOTS.mirror.x, y: SPOTS.mirror.y, w: 1.0, h: 1.7, range: 7 };        // +z wall, bottom 0.42 m, top 2.12 m
const TP_BTN = { x: SPOTS.tp.x, y: SPOTS.tp.y };                                     // -z wall
const DISCO = { x: 2.0, z: 0.0, cord: 0.3, r: 0.22 };                  // hangs between the centre and aft ceiling lights
// Floodlight: the roof guard rail (ship.js) runs along z = HULL_Z1 - 0.1 with its top bar at ROOF_Y + 0.9 +- 0.03,
// just in front of the lamp. The head sits high enough that the lens and bezel clear it (lens bottom ~ROOF_Y+1.15).
const FLOOD_LAMP = new THREE.Vector3(S.x1 - 1.5, ROOF_Y, HULL_Z1 - 0.3);
const FLOOD_HEAD_Y = 1.35;
const FLOOD_AIM = new THREE.Vector3(S.door.x + 0.6, -1.6, S.z1 + 7.5);  // ground in front of the door
const FLOOD_LIGHT_OFF = 1.5;              // the light-pool emitter sits this far down the beam from the lens
const FLOOD_INSIDE = 0.25;                 // per-viewer floodlight factor while the camera is deep inside the ship
const FLOOD_DOORWAY = 0.8;                 // ... and while standing in the open doorway
const LENS_OFF = 0x34342c;
const LENS_ON = 0xfff2cc;

const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// canvas label plane (browser only; returns null in Node)
function makeLabel(bag, text, w, h, { fg = '#e8e0cc', bg = '#17191b', size = 20, cw = 128, ch = 32, stripes = false } = {}) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const x = c.getContext('2d');
  if (!x) return null;
  x.fillStyle = bg; x.fillRect(0, 0, cw, ch);
  if (stripes) {
    x.fillStyle = '#d8b21c';
    for (let i = -ch; i < cw; i += 16) { x.beginPath(); x.moveTo(i, ch); x.lineTo(i + 8, ch); x.lineTo(i + 8 + ch, 0); x.lineTo(i + ch, 0); x.fill(); }
    x.fillStyle = bg; x.fillRect(4, 4, cw - 8, ch - 8);
  }
  x.font = `bold ${size}px monospace`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = fg; x.fillText(text, cw / 2, ch / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  bag.texs.push(tex);
  const geo = new THREE.PlaneGeometry(w, h); bag.geos.push(geo);
  const mat = new THREE.MeshBasicMaterial({ map: tex }); bag.mats.push(mat);
  return new THREE.Mesh(geo, mat);
}

// mirror-tile texture for the disco ball (browser only)
function discoTiles(bag) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const x = c.getContext('2d');
  if (!x) return null;
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const v = 150 + (((i * 7 + j * 13) % 5) * 22);
    x.fillStyle = `rgb(${v},${v},${Math.min(255, v + 12)})`; x.fillRect(i * 4, j * 4, 4, 4);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(i * 4, j * 4 + 3, 4, 1); x.fillRect(i * 4 + 3, j * 4, 1, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  bag.texs.push(tex);
  return tex;
}

// Bake static parts into ONE geometry (one draw call per prop). Each part's geometry is consumed.
// part: { g: geometry, c?: hex color (-> vertex colors), p?: [x,y,z], r?: [rx,ry,rz], o?: euler order, m?: Matrix4 applied last }
const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _be = new THREE.Euler(), _bp = new THREE.Vector3();
const _bs = new THREE.Vector3(1, 1, 1), _bc = new THREE.Color();
function bakeParts(parts) {
  let list = [];
  for (const part of parts) {
    const g = part.g, p = part.p || ZERO3, r = part.r || ZERO3;
    _bm.compose(_bp.set(p[0], p[1], p[2]), _bq.setFromEuler(_be.set(r[0], r[1], r[2], part.o || 'XYZ')), _bs);
    g.applyMatrix4(_bm);
    if (part.m) g.applyMatrix4(part.m);
    if (part.c !== undefined) {
      _bc.setHex(part.c);                                // sRGB hex -> linear, like material.color
      const n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = _bc.r; a[i * 3 + 1] = _bc.g; a[i * 3 + 2] = _bc.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    list.push(g);
  }
  if (list.some((g) => !g.index) && list.some((g) => g.index)) {
    list = list.map((g) => { if (!g.index) return g; const n = g.toNonIndexed(); g.dispose(); return n; });
  }
  const out = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  if (!out) throw new Error('shipfeatures: geometry merge failed');
  out.computeBoundingSphere();
  return out;
}

function setLayerDeep(obj, layer) { obj.traverse((o) => o.layers.set(layer)); }

export function installShipFeatures(game) {
  const ship = game.ship;
  const lights = game.lights;
  const bag = { geos: [], mats: [], texs: [] };
  const G = (g) => { bag.geos.push(g); return g; };
  const M = (m) => { bag.mats.push(m); return m; };
  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); parent.add(o); return o; };
  const root = new THREE.Group();
  root.name = 'shipFeatures';
  (ship.group || game.scene).add(root);

  // ---------------------------------------------------------------- shared parts
  const matVC = M(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const matVC2 = M(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));   // open cones
  const baked = (parts, parent, mat = matVC) => mesh(G(bakeParts(parts)), mat, parent);
  const btnGeo = G(new THREE.CylinderGeometry(0.085, 0.092, 0.05, 16)); btnGeo.rotateX(Math.PI / 2);   // axis -> +z
  const panelParts = () => [
    { g: new THREE.BoxGeometry(0.34, 0.5, 0.04), c: C_DARK, p: [0, 0, 0.02] },
    { g: new THREE.CylinderGeometry(0.12, 0.12, 0.014, 16), c: C_YELLOW, p: [0, -0.06, 0.047], r: [Math.PI / 2, 0, 0] },
  ];

  // replicated state (host-authoritative) and local presentation timers
  const st = { party: false, cup: false };
  const hostCd = { horn: 0, tp: 0, party: 0, cup: 0 };   // host clock (game.time) when each becomes ready again
  let time = 0, hornCd = 0, tpCd = 0, hornPress = 0, tpPress = 0, tpFlash = 0, cupT = 0, partyT = 0;
  let boundNet = null, synced = false, disposed = false, partyApplied = false, errors = 0;
  let music = null, musicRetry = 0, floodOn = false, floodFlickerT = 0, floodF = 1;

  // ---------------------------------------------------------------- 1) Loud Horn
  const hornGroup = new THREE.Group(); hornGroup.name = 'loudHorn'; hornGroup.visible = false;
  root.add(hornGroup);
  const hornPanel = new THREE.Group();
  hornPanel.position.set(HORN_BTN.x, HORN_BTN.y, S.z1);
  hornPanel.rotation.y = Math.PI;                       // local +z points into the ship (-z world)
  hornGroup.add(hornPanel);
  baked(panelParts(), hornPanel);
  const hornBtnMat = M(new THREE.MeshLambertMaterial({ color: 0xd01818, emissive: 0x300000 }));
  const hornBtn = mesh(btnGeo, hornBtnMat, hornPanel, 0, -0.06, 0.075);
  const hornLbl = makeLabel(bag, 'HORN', 0.28, 0.08, { stripes: true, fg: '#ff4a3a' });
  if (hornLbl) { hornLbl.position.set(0, 0.17, 0.041); hornPanel.add(hornLbl); }
  // roof speaker (two trumpets)
  const speaker = new THREE.Group();
  speaker.position.set(HORN_SPEAKER.x, ROOF_Y, HORN_SPEAKER.z);
  hornGroup.add(speaker);
  const trumpet = () => {
    const g = new THREE.CylinderGeometry(0.2, 0.05, 0.5, 8, 1, true);
    g.rotateZ(-Math.PI / 2); g.translate(0.25, 0, 0);   // narrow end at origin, bell toward +x
    return g;
  };
  baked([
    { g: new THREE.BoxGeometry(0.36, 0.14, 0.3), c: C_DARK, p: [0, 0.07, 0] },
    { g: new THREE.CylinderGeometry(0.04, 0.04, 0.2, 6), c: C_METAL, p: [0, 0.22, 0] },
    { g: trumpet(), c: C_HORN, p: [0.04, 0.33, 0] },
    { g: trumpet(), c: C_HORN, p: [-0.04, 0.33, 0], r: [0, Math.PI, 0] },
  ], speaker, matVC2);
  const hornIP = new THREE.Vector3(HORN_BTN.x, HORN_BTN.y - 0.06, S.z1 - 0.1);

  // ---------------------------------------------------------------- 2) Floodlight lamp
  const flood = ship.flood || null;
  const floodBase = flood ? { d: flood.distance ?? 34, i: flood.intensity ?? 2.2, f: flood.flicker || 0, pos: flood.pos.clone(), halo: flood.halo } : null;
  const lamp = new THREE.Group(); lamp.name = 'floodLamp';
  lamp.position.copy(FLOOD_LAMP);
  root.add(lamp);
  const lampHead = new THREE.Group();
  lampHead.position.set(0, FLOOD_HEAD_Y, 0);
  lamp.add(lampHead);
  root.updateMatrixWorld(true);
  lampHead.lookAt(FLOOD_AIM);                          // +z (lens) aims at the ground in front of the door
  lampHead.updateMatrix();
  lampHead.updateMatrixWorld(true);
  const poleH = FLOOD_HEAD_Y - 0.1;
  baked([
    { g: new THREE.CylinderGeometry(0.05, 0.07, poleH, 6), c: C_DARK, p: [0, poleH / 2, 0] },
    { g: new THREE.BoxGeometry(0.56, 0.05, 0.08), c: C_METAL, p: [0, poleH, 0] },
    { g: new THREE.BoxGeometry(0.46, 0.32, 0.26), c: C_DARK, p: [0, 0, -0.02], m: lampHead.matrix },
    { g: new THREE.BoxGeometry(0.5, 0.36, 0.04), c: C_METAL, p: [0, 0, 0.12], m: lampHead.matrix },
  ], lamp);
  const lensMat = M(new THREE.MeshBasicMaterial({ color: LENS_OFF }));
  mesh(G(new THREE.PlaneGeometry(0.4, 0.26)), lensMat, lampHead, 0, 0, 0.145);
  const floodBeamMat = M(new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const floodBeamGeo = G(new THREE.CylinderGeometry(2.4, 0.14, 9, 12, 1, true));
  floodBeamGeo.rotateX(Math.PI / 2); floodBeamGeo.translate(0, 0, 4.65);   // narrow end at the lens, wide end forward
  const floodBeam = mesh(floodBeamGeo, floodBeamMat, lampHead);
  floodBeam.visible = false;
  const lampWorld = new THREE.Vector3(0, 0, 0.145).applyMatrix4(lampHead.matrixWorld);          // lens centre
  const floodDir = new THREE.Vector3(0, 0, 1).transformDirection(lampHead.matrixWorld);
  // the emitter starts at the lamp: a point on the beam axis, so the lit pool lines up with the lens
  if (flood) flood.pos.copy(lampWorld).addScaledVector(floodDir, FLOOD_LIGHT_OFF);

  // ---------------------------------------------------------------- 3) Disco ball
  const discoGroup = new THREE.Group(); discoGroup.name = 'discoBall'; discoGroup.visible = false;
  discoGroup.position.set(DISCO.x, S.h, DISCO.z);
  root.add(discoGroup);
  baked([
    { g: new THREE.CylinderGeometry(0.06, 0.06, 0.03, 8), c: C_DARK, p: [0, -0.015, 0] },
    { g: new THREE.CylinderGeometry(0.007, 0.007, DISCO.cord, 4), c: C_METAL, p: [0, -DISCO.cord / 2, 0] },
  ], discoGroup);
  const spinner = new THREE.Group();
  spinner.position.y = -DISCO.cord - DISCO.r;
  discoGroup.add(spinner);
  const ballMat = M(new THREE.MeshLambertMaterial({ color: 0xc4ccd4, emissive: 0x000000, flatShading: true, map: discoTiles(bag) }));
  mesh(G(new THREE.IcosahedronGeometry(DISCO.r, 1)), ballMat, spinner);
  const discoBeamMat = M(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const beamParts = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.CylinderGeometry(0.015, 0.4, 3.4, 6, 1, true);
    g.translate(0, -1.7, 0);                             // tip at the ball, widening downward
    beamParts.push({ g, r: [0.65 + (i % 2) * 0.4, (i / 6) * TAU, 0], o: 'YXZ' });
  }
  const discoBeams = mesh(G(bakeParts(beamParts)), discoBeamMat, spinner);   // 6 beams, one draw call
  discoBeams.visible = false;
  const ballCenter = new THREE.Vector3(DISCO.x, S.h - DISCO.cord - DISCO.r, DISCO.z);
  const partyColors = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
  // halo: false -> no floating light-pool halo sprites orbiting the cabin; the light reads as coming from the ball
  const partyEmitters = partyColors.map((c) => lights.add({ pos: ballCenter.clone(), color: c, intensity: 1.5, distance: 7.5, group: 'ship', enabled: false, halo: false }));
  // ceiling lights get dimmed while partying (restored afterwards). Written only when the party state changes.
  const dimmed = new Map();
  for (const e of ship.emitters || []) if (e !== flood && e.group === 'ship' && e.pos && e.pos.y > S.h - 0.8) dimmed.set(e, e.intensity ?? 1);

  // ---------------------------------------------------------------- 4) Teleporter
  const tpGroup = new THREE.Group(); tpGroup.name = 'teleporter'; tpGroup.visible = false;
  root.add(tpGroup);
  const padPos = (ship.spawns?.[2] || new THREE.Vector3(0, 0, -1)).clone();
  padPos.y = 0;
  const pad = new THREE.Group();
  pad.position.copy(padPos);
  tpGroup.add(pad);
  baked([
    { g: new THREE.CylinderGeometry(0.64, 0.68, 0.024, 20), c: C_DARK, p: [0, 0.012, 0] },
    { g: new THREE.CircleGeometry(0.46, 20), c: C_PAD, p: [0, 0.026, 0], r: [-Math.PI / 2, 0, 0] },
  ], pad);
  const padRingGeo = G(new THREE.RingGeometry(0.47, 0.6, 24)); padRingGeo.rotateX(-Math.PI / 2);
  const padRingMat = M(new THREE.MeshBasicMaterial({ color: 0x2a8fb0 }));
  mesh(padRingGeo, padRingMat, pad, 0, 0.027, 0);
  const tpBeamMat = M(new THREE.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const tpBeam = mesh(G(new THREE.CylinderGeometry(0.52, 0.58, 2.8, 16, 1, true)), tpBeamMat, pad, 0, 1.4, 0);
  tpBeam.visible = false;
  const padLight = lights.add({ pos: new THREE.Vector3(padPos.x, 0.9, padPos.z), color: 0x7fdcff, intensity: 0, distance: 6, group: 'ship', enabled: false });
  const tpPanel = new THREE.Group();
  tpPanel.position.set(TP_BTN.x, TP_BTN.y, S.z0);      // -z wall, local +z already points into the ship
  tpGroup.add(tpPanel);
  baked(panelParts(), tpPanel);
  const tpBtnMat = M(new THREE.MeshLambertMaterial({ color: 0x1f8fd0, emissive: 0x001828 }));
  const tpBtn = mesh(btnGeo, tpBtnMat, tpPanel, 0, -0.06, 0.075);
  const tpLampMat = M(new THREE.MeshBasicMaterial({ color: 0x30ff60 }));
  mesh(G(new THREE.BoxGeometry(0.05, 0.03, 0.02)), tpLampMat, tpPanel, 0.12, -0.2, 0.045);
  const tpLbl = makeLabel(bag, 'TELEPORT', 0.28, 0.08, { stripes: true, fg: '#7fdcff', size: 17 });
  if (tpLbl) { tpLbl.position.set(0, 0.17, 0.041); tpPanel.add(tpLbl); }
  const tpIP = new THREE.Vector3(TP_BTN.x, TP_BTN.y - 0.06, S.z0 + 0.1);

  // ---------------------------------------------------------------- 5) Mirror
  const mirror = new THREE.Group(); mirror.name = 'mirror';
  mirror.position.set(MIRROR.x, MIRROR.y, S.z1);
  mirror.rotation.y = Math.PI;                         // faces into the ship (-z)
  root.add(mirror);
  const fw = MIRROR.w + 0.12, fy = MIRROR.h / 2 + 0.03, fx = MIRROR.w / 2 + 0.03;
  baked([
    { g: new THREE.BoxGeometry(fw, 0.06, 0.05), c: C_WOOD, p: [0, fy, 0.025] },
    { g: new THREE.BoxGeometry(fw, 0.06, 0.05), c: C_WOOD, p: [0, -fy, 0.025] },
    { g: new THREE.BoxGeometry(0.06, MIRROR.h, 0.05), c: C_WOOD, p: [fx, 0, 0.025] },
    { g: new THREE.BoxGeometry(0.06, MIRROR.h, 0.05), c: C_WOOD, p: [-fx, 0, 0.025] },
    { g: new THREE.PlaneGeometry(MIRROR.w, MIRROR.h), c: C_GLASS, p: [0, 0, 0.01] },   // dark glass while not reflecting
  ], mirror);
  const plaque = makeLabel(bag, 'LOOKING GOOD!', 0.5, 0.09, { fg: '#ffd27a', bg: '#2a2016', size: 14 });
  if (plaque) { plaque.position.set(0, -MIRROR.h / 2 - 0.14, 0.012); mirror.add(plaque); }
  const rtH = 256;
  const rtWidth = (aspect) => Math.min(512, Math.max(128, Math.round(rtH * (aspect || 16 / 9))));
  const reflector = new Reflector(G(new THREE.PlaneGeometry(MIRROR.w, MIRROR.h)), {
    textureWidth: rtWidth(game.camera?.aspect), textureHeight: rtH, clipBias: 0.003, multisample: 0,
    color: new THREE.Color(0.46, 0.48, 0.5),           // linear ~0.5 = neutral overlay, slightly dim like old glass
  });
  reflector.name = 'mirrorGlass';
  reflector.position.z = 0.016;
  reflector.visible = false;
  const rtTex = reflector.getRenderTarget().texture;
  rtTex.minFilter = THREE.NearestFilter; rtTex.magFilter = THREE.NearestFilter; rtTex.generateMipmaps = false;
  // Our own virtual camera (instead of camera.clone(), which would also clone the view model): it renders
  // layer 0 (the world) + layer 1 (the local player's mirror-only avatar). The main camera keeps layer 0 only.
  const mirrorCam = new THREE.PerspectiveCamera();
  mirrorCam.layers.enable(MIRROR_LAYER);
  reflector.getReflectionCamera = () => mirrorCam;
  // On a moon the main camera's far plane is 420 m; the reflection only needs the ship and a little of the
  // outside through the window, so it is rendered from a proxy of the main camera with a shorter far plane
  // (frustum culling then skips distant terrain / props in the reflection pass).
  const farCam = new THREE.PerspectiveCamera();
  function reflectionSource(camera) {
    if (!camera.isPerspectiveCamera || camera.far <= MIRROR_FAR || game.env?.mode === 'space') return camera;
    if (farCam.fov !== camera.fov || farCam.aspect !== camera.aspect || farCam.near !== camera.near
      || farCam.zoom !== camera.zoom || farCam.far !== MIRROR_FAR || farCam.view !== camera.view) {
      farCam.fov = camera.fov; farCam.aspect = camera.aspect; farCam.near = camera.near; farCam.zoom = camera.zoom;
      farCam.filmGauge = camera.filmGauge; farCam.filmOffset = camera.filmOffset; farCam.view = camera.view;
      farCam.far = MIRROR_FAR;
      farCam.updateProjectionMatrix();
    }
    farCam.matrixWorld.copy(camera.matrixWorld);
    return farCam;
  }
  // hide the first-person arms / held item while the mirror renders (they hang off the camera)
  const reflectorBeforeRender = reflector.onBeforeRender;
  reflector.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
    const vm = game.viewModel?.root, hand = game._hand;
    const vmVis = vm ? vm.visible : false, handVis = hand ? hand.visible : false;
    if (vm) vm.visible = false;
    if (hand) hand.visible = false;
    try { reflectorBeforeRender.call(this, renderer, scene, reflectionSource(camera), geometry, material, group); }
    finally { if (vm) vm.visible = vmVis; if (hand) hand.visible = handVis; }
  };
  mirror.add(reflector);
  // keep the reflection's aspect in step with the window
  const onEngineResize = (w, h) => { if (!disposed && w > 0 && h > 0) reflector.getRenderTarget().setSize(rtWidth(w / h), rtH); };
  const resizeHooks = Array.isArray(game.engine?.onResize) ? game.engine.onResize : null;
  if (resizeHooks) resizeHooks.push(onEngineResize);
  const mirrorCenter = new THREE.Vector3(MIRROR.x, MIRROR.y, S.z1);
  let av = null, avFailed = false, avSuit = null, avHat = null;
  const anim = { speed: 0, crouch: false, sprint: false, grounded: true, carry2h: false, holding: false, dead: false, emote: null, swing: 0, lookPitch: 0, climbing: false, time: 0 };

  // ---------------------------------------------------------------- 6) Cupboard doors
  const cupAnchors = ship.anchors?.cupboard?.userData?.anchors || {};
  const doors = [];
  for (const [name, def] of [['doorL', -1.9], ['doorR', 1.9]]) {
    const h = cupAnchors[name];
    if (h) doors.push({ h, base: h.rotation.y, open: h.userData?.openAngle ?? def });
  }
  const cupPos = ship.points?.cupboard ? ship.points.cupboard.clone() : null;

  // ---------------------------------------------------------------- nav lights
  const nav = (ship.group?.userData?.navLights || []).map((o) => ({ o, v: o.visible }));

  // ---------------------------------------------------------------- interactables (via mods hook)
  const request = (op, extra) => { if (game.net) game.net.request('shipf', extra ? { op, ...extra } : { op }); };
  const click = (pos) => game.audio?.at?.('ui_click', pos, 0.7, { refDistance: 1.5, maxDistance: 15 });
  const iaHorn = {
    pos: hornIP, r: 0.3,
    label: () => (hornCd > 0 ? t('Loud Horn (recharging...)') : t('Sound the LOUD HORN [E]')),
    action: () => {
      if (hornCd > 0) { game.sfx?.('ui_error', 0.35); return; }
      click(hornIP); request('horn');
    },
  };
  const iaTp = {
    pos: tpIP, r: 0.3,
    label: () => {
      if (tpCd > 0) return `Teleporter recharging... ${Math.ceil(tpCd)}s`;
      const t = pickTarget();
      return t ? tf('Teleport {n} to the ship [E]', { n: game.playerName?.(t) || 'crewmate' }) : _t('Teleporter (no crewmates)');
    },
    action: () => {
      if (tpCd > 0) { game.sfx?.('ui_error', 0.35); return; }
      const t = pickTarget();
      if (!t) { game.ui?.toast?.(_t('No crewmate to teleport.')); game.sfx?.('ui_error', 0.35); return; }
      click(tpIP); request('tp', { target: t });
    },
  };
  const iaDisco = {
    pos: ballCenter, r: 0.45, reach: 3.2,
    label: () => (st.party ? t('Disco ball: stop the party [E]') : t('Disco ball: start the party [E]')),
    action: () => { click(ballCenter); request('party'); },
  };
  const iaCup = cupPos && doors.length ? {
    pos: cupPos, r: 0.7,
    label: () => (st.cup ? t('Close cupboard [E]') : t('Open cupboard [E]')),
    action: () => request('cup'),
  } : null;

  function addInteractables(list) {
    const p = game.player;
    if (!p || p.dead || !p.inShip) return;
    const up = game.run?.upgrades || EMPTY;
    if (up.loudhorn) list.push(iaHorn);
    if (up.teleporter) list.push(iaTp);
    if (up.disco) list.push(iaDisco);
    if (iaCup) list.push(iaCup);
  }

  // radar target (a crewmate, not me) -> else the first crewmate outside the ship -> else the first crewmate
  function pickTarget() {
    const rt = game.terminal?.radarTarget;
    if (rt && rt !== game.selfId && game.remotes.has(rt)) return rt;
    let first = null;
    for (const r of game.remotes.values()) {
      if (!first) first = r.id;
      if (!r.dead && !insideShip(r.pos)) return r.id;
    }
    return first;
  }

  // ---------------------------------------------------------------- networking
  function peerInShip(id) {
    if (id === game.selfId) return !!game.player?.inShip;
    const r = game.remotes.get(id);
    return !!r && insideShip(r.pos, 0.6);
  }
  function stateMsg(withCooldowns) {
    const m = { k: 'st', party: st.party, cup: st.cup };
    if (withCooldowns) {
      m.hc = +Math.max(0, hostCd.horn - game.time).toFixed(1);
      m.tc = +Math.max(0, hostCd.tp - game.time).toFixed(1);
    }
    return m;
  }
  // host -> one peer: a refusal (bad) or notice. Requests typed on the terminal get a terminal line instead of a toast.
  function tell(to, msg, bad, term) {
    if (term) game.net.sendTo(to, 'term', { to, text: msg, err: !!bad, cls: bad ? 'err' : '' });
    else game.net.sendTo(to, 'shipf', { k: bad ? 'deny' : 'info', msg });
  }

  // a dead crewmate's body: one lying outside the ship (beamable), or why there is none
  function findBody(name) {
    const res = { far: null, aboard: false, carried: false };
    for (const it of game.items?.all?.() || []) {
      if (it.type !== 'body' || it.label !== name) continue;
      if (it.state !== 'world') { res.carried = true; continue; }          // held (e.g. by a creature)
      if (insideShip(it.obj.position)) { res.aboard = true; continue; }
      if (it.owner) { res.carried = true; continue; }                      // being dragged by a crewmate
      if (!res.far) res.far = it;
    }
    return res;
  }

  function hostTeleport(target, from, term) {
    const run = game.run, net = game.net, up = run.upgrades || EMPTY;
    if (!up.teleporter) { if (term) tell(from, 'Requires the Teleporter upgrade.', true, term); return; }
    if (!peerInShip(from)) return;                      // the button and the terminal are both aboard
    if (run.phase !== 'moon' && run.phase !== 'company') { tell(from, 'The teleporter only works while landed.', true, term); return; }
    const left = hostCd.tp - game.time;
    if (left > 0) { tell(from, `Teleporter recharging (${Math.ceil(left)}s).`, true, term); return; }
    const isHostSelf = target === game.selfId;
    const r = isHostSelf ? null : game.remotes.get(target);
    if (!target || target === from || (!r && !isHostSelf)) { tell(from, term ? 'Target lost.' : 'No crewmate to teleport.', true, term); return; }
    const name = game.playerName?.(target) || 'crewmate';
    const dead = isHostSelf ? !!game.player.dead : !!r.dead;
    if (dead) {
      // beam the body item back (reduces the death fine)
      const b = findBody(name);
      if (!b.far) {
        tell(from, b.aboard ? `${name}'s body is already aboard.` : b.carried ? `Can't lock on: ${name}'s body is being carried.` : `No signal from ${name}.`, true, term);
        return;
      }
      net.broadcast('it', { e: 'tp', id: b.far.id, p: [padPos.x, 0.7, padPos.z] });
      net.broadcast('fx', { k: 'snd', s: 'teleport', p: [padPos.x, 1, padPos.z], v: 1 });
      tell(from, `Beaming ${name}'s body aboard.`, false, term);
    } else {
      if (insideShip(isHostSelf ? game.player.pos : r.pos, 0.3)) { tell(from, `${name} is already aboard.`, true, term); return; }
      // the existing terminal host op, run for the real requester so its 'Teleporting...' reply reaches them
      if (game.terminal?.hostExecute) game.terminal.hostExecute({ op: 'teleport', target }, from);
      else net.request('term', { cmd: { op: 'teleport', target } });
    }
    hostCd.tp = game.time + TP_CD;
    net.broadcast('shipf', { k: 'tp', t: target });
  }

  // host: request handler
  function onRequest(d, from) {
    if (disposed || !d || !game.isHost || !game.run) return;
    const run = game.run, net = game.net, up = run.upgrades || EMPTY;
    switch (d.op) {
      case 'sync': net.sendTo(from, 'shipf', stateMsg(true)); return;
      case 'horn': {
        if (!up.loudhorn || !peerInShip(from)) return;
        if (game.time < hostCd.horn) { tell(from, 'The Loud Horn is recharging.', true, false); return; }
        hostCd.horn = game.time + HORN_CD;
        const p = HORN_SPEAKER;
        net.broadcast('fx', { k: 'snd', s: 'ship_horn', p: [p.x, p.y, p.z], v: 1, r: 40, m: 600 });
        game.creatures?.noise?.(p, 4);
        net.broadcast('shipf', { k: 'horn' });
        return;
      }
      case 'party': {
        if (!up.disco || !peerInShip(from)) return;
        if (game.time < hostCd.party) return;             // debounce: ignore E-spam
        hostCd.party = game.time + PARTY_CD;
        st.party = !st.party;
        net.broadcast('shipf', stateMsg(false));
        return;
      }
      case 'cup': {
        if (!peerInShip(from) || game.time < hostCd.cup) return;
        hostCd.cup = game.time + CUP_CD;
        st.cup = !st.cup;
        const m = stateMsg(false); m.snd = 1;
        net.broadcast('shipf', m);
        return;
      }
      case 'tp': hostTeleport(typeof d.target === 'string' ? d.target : '', from, !!d.term); return;
      default:
    }
  }

  // everyone: host messages
  function onMsg(d, from) {
    if (disposed || !d || typeof d !== 'object') return;
    const hostId = game.net?.hostId;
    if (hostId && from !== hostId) return;              // only the host speaks for the ship
    switch (d.k) {
      case 'st': {
        const cupChanged = !!d.cup !== st.cup;
        st.party = !!d.party; st.cup = !!d.cup;
        if (typeof d.hc === 'number') hornCd = Math.max(hornCd, d.hc);
        if (typeof d.tc === 'number') tpCd = Math.max(tpCd, d.tc);
        if (cupChanged && d.snd && cupPos) game.audio?.at?.(st.cup ? 'door_open' : 'door_close', cupPos, 0.45, { refDistance: 1.5, maxDistance: 20, pitch: 1.25 });
        break;
      }
      case 'horn':
        hornPress = 1; hornCd = HORN_CD;
        if (game.player?.inShip) game.engine?.shake?.(0.25);
        break;
      case 'tp':
        tpPress = 1; tpFlash = 1; tpCd = TP_CD;
        if (d.t === game.selfId) game.engine?.flash?.(0x9fe8ff, 0.7);
        break;
      case 'deny':
        if (d.msg) game.ui?.toast?.(t(String(d.msg).slice(0, 90)), 'bad');
        game.sfx?.('ui_error', 0.35);
        break;
      case 'info':
        if (d.msg) game.ui?.toast?.(t(String(d.msg).slice(0, 90)), 'info');
        break;
      default:
    }
  }

  function bindNet(net) {
    if (!net || net === boundNet) return;
    boundNet = net;
    net.on_('shipf', onMsg);
    net.handle('shipf', onRequest);
  }

  const offs = [];
  if (game.mods?.on) {
    offs.push(game.mods.on('interactables', (list, g) => { if (g === game && !disposed) addInteractables(list); }));
    offs.push(game.mods.on('netReady', (net, g) => { if (g === game && !disposed) bindNet(net); }));
  }
  if (game.net) bindNet(game.net);

  // ---------------------------------------------------------------- per-frame
  function updateHorn(dt) {
    hornPress = Math.max(0, hornPress - dt / 0.35);
    hornBtn.position.z = 0.075 - 0.024 * Math.sin(hornPress * Math.PI * 0.5);
    const glow = hornCd > 0 ? 0.04 : 0.12 + 0.08 * Math.sin(time * 3);
    hornBtnMat.emissive.setRGB(glow + hornPress * 0.5, 0, 0);
    speaker.scale.setScalar(1 + 0.12 * hornPress);
  }

  function updateTeleporter(dt, owned) {
    tpPress = Math.max(0, tpPress - dt / 0.35);
    tpFlash = Math.max(0, tpFlash - dt / 1.4);
    tpBtn.position.z = 0.075 - 0.024 * Math.sin(tpPress * Math.PI * 0.5);
    const ready = tpCd <= 0;
    tpLampMat.color.setRGB(ready ? 0.2 : 1, ready ? 1 : 0.15, ready ? 0.35 : 0.1);
    const pulse = ready ? 0.55 + 0.25 * Math.sin(time * 2.2) : 0.18;
    const f = tpFlash;
    padRingMat.color.setRGB(0.16 * pulse + f, 0.56 * pulse + f, 0.7 * pulse + f);
    tpBtnMat.emissive.setRGB(0, 0.05 * pulse + 0.3 * tpPress, 0.1 * pulse + 0.4 * tpPress);
    tpBeam.visible = owned && f > 0;
    tpBeamMat.opacity = 0.5 * f;
    tpBeam.scale.set(1 - 0.35 * (1 - f), 1, 1 - 0.35 * (1 - f));
    padLight.enabled = owned && f > 0;
    padLight.intensity = 2.8 * f;
  }

  function applyParty(on) {
    partyApplied = on;
    for (const e of partyEmitters) e.enabled = on;
    for (const [e, base] of dimmed) e.intensity = on ? base * 0.3 : base;
    discoBeams.visible = on;
    if (on) { partyT = 0; musicRetry = 0; }
    else {
      ballMat.emissive.setRGB(0, 0, 0);
      if (music) { music.stop(0.4); music = null; }
    }
  }

  function updateParty(dt, on) {
    spinner.rotation.y += dt * (on ? 1.8 : 0.2);
    if (on !== partyApplied) applyParty(on);
    if (!on) return;
    partyT += dt;
    for (let i = 0; i < 3; i++) {
      partyColors[i].setHSL((partyT * 0.22 + i / 3) % 1, 1, 0.55);
      const a = partyT * 1.25 + i * (TAU / 3);
      const r = 2.1 + Math.sin(partyT * 0.9 + i) * 0.5;
      partyEmitters[i].pos.set(DISCO.x + Math.cos(a) * r, 2.0 + Math.sin(partyT * 2 + i) * 0.35, DISCO.z + Math.sin(a) * r * 0.8);
    }
    ballMat.emissive.copy(partyColors[Math.floor(partyT * 4) % 3]).multiplyScalar(0.45);
    discoBeamMat.color.copy(partyColors[1]);
    discoBeamMat.opacity = 0.13 + 0.06 * Math.sin(partyT * 8);
    if (!music || music.stopped) {
      music = null;
      musicRetry -= dt;
      if (musicRetry <= 0) {
        musicRetry = 1;                                  // audio not ready yet / was stopped: retry every second
        music = game.audio?.play?.('boombox_2', { loop: true, pos: ballCenter, volume: 0.6, refDistance: 3, maxDistance: 45, occlude: true }) || null;
      }
    }
  }

  // Per-viewer floodlight factor. The light pool has no shadows and Lambert walls don't block light, so at full
  // strength the floodlight would brighten the ship interior through the hull. Deep inside it drops to
  // FLOOD_INSIDE; in the open doorway (where you actually see its light pool) it stays close to full.
  function floodViewerFactor(cam) {
    if (!cam || !insideShip(cam)) return 1;
    const open = ship.door ? Math.min(1, Math.max(0, ship.door.t ?? 1)) : 1;
    const dx = cam.x - S.door.x, dz = S.z1 - cam.z;
    const near = 1 - smooth01((Math.sqrt(dx * dx + dz * dz) - 0.6) / 2.4);
    return FLOOD_INSIDE + (FLOOD_DOORWAY - FLOOD_INSIDE) * open * near;
  }

  function updateFlood(dt, run, up) {
    if (!flood) return;
    const plus = !!up.lightsplus;
    const want = !!run && run.phase === 'moon' && ((run.time ?? 480) > 18 * 60 || DARK_WEATHER.has(run.weather));
    if (want !== floodOn) {
      floodOn = want;
      flood.enabled = want;
      floodFlickerT = want ? 0.8 : 0;
      flood.flicker = want ? 0.8 : floodBase.f;
      lensMat.color.setHex(want ? LENS_ON : LENS_OFF);
      floodBeam.visible = want;
      if (want) {
        floodF = floodViewerFactor(game.camera?.position);   // no fade-in from a stale factor
        game.audio?.at?.('flashlight_click', lampWorld, 0.8, { refDistance: 6, maxDistance: 60, pitch: 0.55 });
      }
    }
    if (!floodOn) return;
    const cam = game.camera?.position;
    const fT = floodViewerFactor(cam);
    floodF += (fT - floodF) * Math.min(1, dt * 4);
    if (Math.abs(fT - floodF) < 0.002) floodF = fT;
    // written only when the value actually changes (other code may tint / scale ship emitters too)
    const dist = floodBase.d * (plus ? 2 : 1);
    const inten = floodBase.i * (plus ? 1.45 : 1) * floodF;
    if (flood.distance !== dist) flood.distance = dist;
    if (flood.intensity !== inten) flood.intensity = inten;
    // the light pool's halo sprite is drawn flat at the emitter's depth; seen from inside the ship it could show
    // through the +z hull at grazing angles, so it is only shown to viewers outside
    const halo = !cam || !insideShip(cam);
    if (flood.halo !== halo) flood.halo = halo;
    if (floodFlickerT > 0) {
      floodFlickerT = Math.max(0, floodFlickerT - dt);
      flood.flicker = floodFlickerT > 0 ? 0.8 : floodBase.f;
      const on = floodFlickerT <= 0 || Math.sin(time * 47) > 0;
      lensMat.color.setHex(on ? LENS_ON : LENS_OFF);
      floodBeam.visible = on;
    }
    if (floodOn) floodBeamMat.opacity = plus ? 0.075 : 0.05;
  }

  function updateCupboard(dt) {
    const target = st.cup ? 1 : 0;
    if (cupT === target) return;
    cupT += Math.sign(target - cupT) * Math.min(Math.abs(target - cupT), dt * 2.4);
    const e = cupT * cupT * (3 - 2 * cupT);
    for (const d of doors) d.h.rotation.y = d.base + d.open * e;
  }

  function updateNav() {
    if (!nav.length) return;
    const strobe = (time % 1.6) < 0.12;
    const slow = (time % 2.4) < 1.9;
    for (let i = 0; i < nav.length; i++) nav[i].o.visible = nav[i].v && (i === 2 ? strobe : slow);
  }

  function ensureAvatar() {
    if (av || avFailed) return av;
    try {
      avSuit = game.profile?.suit; avHat = game.profile?.hat || 'none';
      av = createAvatar({ suitColor: suitColor(avSuit), hat: avHat });
    } catch (e) {
      console.warn('mirror avatar', e);
      avFailed = true; av = null;
      return null;
    }
    setLayerDeep(av.root, MIRROR_LAYER);
    av.root.name = 'mirrorSelf';
    av.root.visible = false;
    game.scene.add(av.root);
    return av;
  }

  function updateMirror(dt) {
    const p = game.player, cam = game.camera;
    const active = !!p && !p.dead && !!p.inShip && !!cam && cam.position.distanceToSquared(mirrorCenter) < MIRROR.range * MIRROR.range;
    reflector.visible = active;
    if (!active) { if (av) av.root.visible = false; return; }
    const a = ensureAvatar();
    if (!a) return;
    const prof = game.profile || EMPTY;
    if (prof.suit !== avSuit) { avSuit = prof.suit; a.setSuitColor(suitColor(avSuit)); }
    const hat = prof.hat || 'none';
    if (hat !== avHat) { avHat = hat; a.setHat(hat); setLayerDeep(a.root, MIRROR_LAYER); }
    a.setLook?.(prof);   // wardrobe outfit / face / back (keeps the mirror layer for new parts)
    a.root.visible = true;
    a.root.position.copy(p.pos);
    a.root.rotation.y = p.yaw + Math.PI;               // avatar faces +Z, camera yaw 0 faces -Z
    const held = game.heldDefCache || null;
    anim.speed = Math.min(p.hSpeed || 0, 9);
    anim.crouch = !!p.crouch;
    anim.sprint = !!p.sprinting;
    anim.grounded = p.grounded !== false;
    anim.carry2h = !!held && (held.hands === 2 || held.kind === 'big' || held.kind === 'body');
    anim.holding = !!held;
    anim.emote = game.emote || null;
    anim.swing = game.swingAnim > 0 ? 1 - game.swingAnim : 0;
    anim.lookPitch = p.pitch || 0;
    anim.time = game.time;
    a.update(dt, anim);
    a.setMouth(game.voice?.localLevel || 0);
  }

  // Build the mirror body now and compile every new shader while the game is loading, so the first look into
  // the mirror doesn't hitch (the Reflector's ShaderMaterial is otherwise compiled on first sight).
  ensureAvatar();
  const renderer = game.engine?.renderer;
  if (renderer?.compile && game.camera && game.scene) {
    try {
      renderer.compile(root, game.camera, game.scene);
      if (av) renderer.compile(av.root, game.camera, game.scene);
    } catch (e) { console.warn('ship features precompile', e); }
  }

  function step(dt) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    time += dt;
    if (game.net && game.net !== boundNet) bindNet(game.net);
    if (!synced && boundNet && !game.isHost && boundNet.connected && game.run) { synced = true; request('sync'); }
    const run = game.run;
    const up = run?.upgrades || EMPTY;
    if (st.party && !up.disco && game.isHost && game.net) { st.party = false; game.net.broadcast('shipf', stateMsg(false)); }
    hornCd = Math.max(0, hornCd - dt);
    tpCd = Math.max(0, tpCd - dt);
    hornGroup.visible = !!up.loudhorn;
    tpGroup.visible = !!up.teleporter;
    discoGroup.visible = !!up.disco;
    updateHorn(dt);
    updateTeleporter(dt, !!up.teleporter);
    updateParty(dt, !!(st.party && up.disco));
    updateFlood(dt, run, up);
    updateCupboard(dt);
    updateNav();
    updateMirror(dt);
  }

  // never let a ship-feature bug stall Game.update (netSend, HUD, audio run after this)
  function update(dt) {
    if (disposed) return;
    try { step(dt); } catch (e) { if (errors++ < 3) console.warn('ship features update', e); }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const off of offs) { try { off?.(); } catch { /* ignore */ } }
    if (boundNet) {
      if (boundNet.msgHandlers?.get('shipf') === onMsg) boundNet.msgHandlers.delete('shipf');
      if (boundNet.handlers?.get('shipf') === onRequest) boundNet.handlers.delete('shipf');
      boundNet = null;
    }
    if (resizeHooks) { const i = resizeHooks.indexOf(onEngineResize); if (i >= 0) resizeHooks.splice(i, 1); }
    if (music) { music.stop(0.1); music = null; }
    for (const [e, base] of dimmed) e.intensity = base;
    for (const e of partyEmitters) lights.remove(e);
    lights.remove(padLight);
    if (flood) {
      flood.distance = floodBase.d; flood.intensity = floodBase.i; flood.flicker = floodBase.f;
      flood.pos.copy(floodBase.pos); flood.enabled = false;
      if (floodBase.halo === undefined) delete flood.halo; else flood.halo = floodBase.halo;
    }
    for (const d of doors) d.h.rotation.y = d.base;
    for (const n of nav) n.o.visible = n.v;
    root.removeFromParent();
    reflector.dispose();                                 // render target + its shader material
    for (const g of bag.geos) g.dispose();
    for (const m of bag.mats) m.dispose();
    for (const t of bag.texs) t.dispose();
    if (av) { av.root.removeFromParent(); av.dispose?.(); av = null; }
  }

  return { update, dispose, state: st };
}
