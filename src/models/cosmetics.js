// cosmetics.js (models) — TFG wave-1 wardrobe: outfits ("suits"), face / back accessories and extra hats.
// Pure appearance data + procedural three.js geometry. NO gameplay stats, ever.
//
// Registry:   OUTFITS (suit id -> look), FACE_ACCS, BACK_ACCS, HATS_EXTRA, ALL_COSMETICS (flat catalogue)
// Controller: createLookController(rig) is used by avatar.js. It owns everything an outfit / accessory adds to the rig
//             and can take it all off again (setOutfit / setFace / setBack / onHat / update / dispose).
// Colours of the rarity tiers come from src/game/tiers.js (wardrobe panel), not from here.
//
// Rig contract (built by avatar.js): { root, body (hips), spine, neck, head, hatSlot, legL, legR ({hip,knee,ankle}),
//   armL, armR ({sh,el,hand}), backpack (pivot), backpackGear (group: frame + tank + valve), suitMat, gloveMat,
//   bootMat, beltMat, gear: { belt, regulator, helmetbits, helmetLight, headMesh, face }, fs (face state),
//   redraw(), tinterRefresh(), getHat() }
import * as THREE from 'three';
import { G, xf, merged, lam, bas, tex, mk, pv, cached, clamp, lerp, TAU, PI } from './modelkit.js';
import { W3_OUTFITS, W3_BUILDERS } from './cosmetics_wave3.js';   // [ux] wave-3 suits
import { C5_OUTFITS, C5_SUIT_BUILDERS, C5_BACKS, C5_BACK_BUILDERS, C5_BACK_HIDES, C5_HATS, buildC5Hat } from './cosm5_models.js';   // [cosm5] wave-4 drop

// ------------------------------------------------------------------ registry
/** @typedef {{id:string,name:string,tier:string,color:string,desc:string,how:string}} OutfitDef */
export const OUTFITS = [
  { id: 'construction', name: 'Construction', tier: 'common', color: '#e9782b', desc: 'Hi-vis vest, hard hat, tool belt. Union approved.', how: 'Reach level 3' },
  { id: 'scientist', name: 'Scientist', tier: 'common', color: '#e6eaea', desc: 'Lab coat, blue gloves, goggles. For Science.', how: 'Complete 5 crew tasks' },
  { id: 'security', name: 'Security', tier: 'uncommon', color: '#22304d', desc: 'Badge, duty belt and a cap. "Ma\'am, this is a Wendy\'s."', how: 'Survive 5 days on the moons' },
  { id: 'hazmat', name: 'Hazmat', tier: 'uncommon', color: '#e6c619', desc: 'Sealed yellow suit with respirator canisters.', how: 'Land on 3 different moons' },
  { id: 'firefighter', name: 'Firefighter', tier: 'uncommon', color: '#c8a02a', desc: 'Reflective turnout coat and a red helmet.', how: 'Survive a day below 10 HP (Close Shave)' },
  { id: 'chicken', name: 'Chicken', tier: 'uncommon', color: '#f2efe6', desc: 'Cluck. It is not a costume, it is a lifestyle.', how: 'Juggle the football 10 times in a row', secret: true },
  { id: 'diver', name: 'Diver', tier: 'rare', color: '#20323d', desc: 'Wetsuit, flippers and a snorkel. Perfect for the flooded rooms.', how: 'Catch 25 phish' },
  { id: 'clown', name: 'Clown', tier: 'rare', color: '#d92b3a', desc: 'Honk. Big shoes, bigger ego.', how: 'Die 5 times (or buy it from Phish Dayı)' },
  { id: 'phish', name: 'Fish Head', tier: 'rare', color: '#4e7a94', desc: 'The fish head. It talks when you talk.', how: 'Catch a Golden Phish' },
  { id: 'astronaut', name: 'Astronaut', tier: 'epic', color: '#e8eaf0', desc: 'A small step for a content janitor.', how: 'Reach level 20' },
  { id: 'goldemp', name: 'Gold Employee', tier: 'legendary', color: '#d6a51f', desc: 'Employee of the Month, forever.', how: 'Get the "Employee of the Month" achievement' },
  { id: 'venom', name: 'Venom Symbiote', tier: 'mythic', color: '#0a0a10', desc: 'We are Venom. Glossy black, a white spider on the chest and a few restless tendrils.', how: 'Bring a Symbiote Sample home, or kill 50 creatures' },
];
OUTFITS.push(...W3_OUTFITS);   // [ux]
OUTFITS.push(...C5_OUTFITS);   // [cosm5]
export const OUTFIT_BY_ID = Object.fromEntries(OUTFITS.map((o) => [o.id, o]));

export const FACE_ACCS = [
  { id: 'none', name: 'None', tier: 'common', desc: 'Bare visor.', how: '' },
  { id: 'moustache', name: 'Fake Moustache', tier: 'common', desc: 'Distinguished. Very fake.', how: 'Complete your first crew task' },
  { id: 'gasmask', name: 'Gas Mask', tier: 'uncommon', desc: 'Two filters. Does nothing against the smell of the internet.', how: 'Reach level 8' },
  { id: 'shades', name: 'Shades', tier: 'rare', desc: 'Deal with it.', how: 'Hit the GACHA jackpot' },
  { id: 'visor', name: 'Cyber Visor', tier: 'rare', desc: 'A glowing scan band across your eyes.', how: 'Crack 5 vaults' },
  { id: 'led', name: 'LED Face', tier: 'epic', desc: 'Your visor becomes a pixel display.', how: 'Complete 15 crew tasks' },
];
export const BACK_ACCS = [
  { id: 'none', name: 'None', tier: 'common', desc: 'Standard tank.', how: '' },
  { id: 'antenna', name: 'Radio Antenna', tier: 'common', desc: 'Sways when you run. Receives nothing.', how: 'Reach level 5' },
  { id: 'o2tank', name: 'Twin O2 Tanks', tier: 'uncommon', desc: 'Two blue tanks. Twice the air, same problems.', how: 'Survive 10 days on the moons' },
  { id: 'plushie', name: 'Plush Bear', tier: 'rare', desc: 'Emotional support bear.', how: 'Meet your first quota' },
  { id: 'monster', name: 'Tiny Monster', tier: 'epic', desc: 'A small green friend that bobs along.', how: 'Kill 25 creatures' },
  ...C5_BACKS,   // [cosm5]
];
export const HATS_EXTRA = [
  { id: 'beanie', name: 'Beanie', tier: 'common', desc: 'Warm. Also a pom-pom.', how: 'Reach level 2' },
  { id: 'bucket', name: 'Bucket Hat', tier: 'common', desc: 'Peak 2019 fashion.', how: 'Log in two days in a row' },
  { id: 'headlamp', name: 'Headlamp', tier: 'uncommon', desc: 'Looks bright. Is not a light.', how: 'Repair 3 fuse boxes' },
  { id: 'wizard', name: 'Wizard Hat', tier: 'rare', desc: 'You shall not pass the quota.', how: 'Fill 25% of the Codex' },
  ...C5_HATS,   // [cosm5]
];

/** Every cosmetic as { slot, id, name, tier, desc, how, color? } (suit / hat / face / back). Hats are read from avatar.js HATS. */
export function catalogue(hats = []) {
  const out = [];
  for (const o of OUTFITS) out.push({ slot: 'suit', ...o });
  for (const h of hats) out.push({ slot: 'hat', tier: 'common', desc: '', how: '', ...h, ...(HATS_EXTRA.find((x) => x.id === h.id) || {}) });
  for (const f of FACE_ACCS) out.push({ slot: 'face', ...f });
  for (const b of BACK_ACCS) out.push({ slot: 'back', ...b });
  return out;
}

// ------------------------------------------------------------------ small geometry helpers
/** open cylinder arc centred on +Z (a band that hugs the front of the visor) */
const arcBand = (key, r, h, arc, y = 0) => cached('arc|' + key, () => new THREE.CylinderGeometry(r, r, h, 14, 1, true, -arc / 2, arc).translate(0, y, 0));
/** torso-following ring (torso is an octagon squashed to 0.66 in z; radius grows with height) */
const rTorso = (y) => 0.22 + 0.06 * y;
const torsoRing = (y, h, grow = 0.012) => xf(G.cyl(rTorso(y + h / 2) + grow, rTorso(y - h / 2) + grow, h, 8, true), [0, y, 0], [0, PI / 8, 0], [1, 1, 0.665]);
/** a panel that follows the curved front (side 1) or back (side -1) of the torso: canvas-textured decal */
const torsoPanel = (key, w, h, side = 1, zOff = 0.008) => cached('tp|' + key + '|' + side + '|' + w + '|' + h, () => {
  const g = new THREE.PlaneGeometry(w, h, 8, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = clamp(Math.abs(p.getX(i)) / 0.25, 0, 0.985);
    p.setZ(i, 0.158 * Math.sqrt(1 - t * t) + zOff);
  }
  if (side < 0) g.rotateY(PI);
  g.computeVertexNormals();
  return g;
});

// ------------------------------------------------------------------ textures (cached canvases)
function drawSpider(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  const leg = (pts, w0, w1) => {
    for (let i = 0; i < pts.length - 1; i++) {
      ctx.lineWidth = lerp(w0, w1, i / (pts.length - 1));
      ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke();
    }
  };
  const S = w / 64;
  for (const side of [-1, 1]) {
    const m = (x, y) => [32 + side * (x - 32) * S, y * S];
    leg([m(34, 22), m(41, 9), m(53, 2)], 3.6 * S, 1.4 * S);          // front leg, up and out over the shoulder
    leg([m(35, 27), m(50, 17), m(62, 17)], 3.6 * S, 1.4 * S);        // upper side leg
    leg([m(35, 33), m(52, 31), m(62, 43)], 3.6 * S, 1.4 * S);        // lower side leg
    leg([m(34, 40), m(45, 49), m(53, 63)], 3.6 * S, 1.4 * S);        // rear leg
  }
  // body: small head, thorax, long abdomen
  ctx.beginPath(); ctx.ellipse(32 * S, 18 * S, 3 * S, 3.4 * S, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(32 * S, 21 * S); ctx.lineTo(36.5 * S, 29 * S); ctx.lineTo(32 * S, 33 * S); ctx.lineTo(27.5 * S, 29 * S); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(32 * S, 31 * S); ctx.lineTo(37 * S, 40 * S); ctx.lineTo(32 * S, 57 * S); ctx.lineTo(27 * S, 40 * S); ctx.closePath(); ctx.fill();
}
const spiderTex = () => tex('cs_spider', 64, 64, drawSpider, false);
const venomTex = () => tex('cs_venomSheen', 32, 32, (ctx, w, h, r) => {
  ctx.fillStyle = '#0c0c14'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { const a = r(); ctx.fillStyle = a > 0.5 ? '#101018' : '#08080e'; ctx.fillRect((r() * w) | 0, (r() * h) | 0, 2, 2); }
  ctx.strokeStyle = 'rgba(70,84,140,0.55)'; ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) { let x = r() * w, y = r() * h; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 7; y += 2 + r() * 4; ctx.lineTo(x, y); } ctx.stroke(); }
  // glossy streak (the u coordinate wraps around every limb, so it reads as a wet highlight on the lit side)
  ctx.fillStyle = 'rgba(70,88,150,0.45)'; ctx.fillRect(16, 0, 5, h);
  ctx.fillStyle = 'rgba(150,170,235,0.75)'; ctx.fillRect(19, 0, 2, h);
  ctx.fillStyle = 'rgba(235,242,255,0.9)'; ctx.fillRect(20, 5, 1, 7); ctx.fillRect(20, 19, 1, 5);
});
const clownTex = () => tex('cs_clownDots', 32, 32, (ctx, w, h) => {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f5d02a';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const cx = x * 8 + (y % 2) * 4 + 3, cy = y * 8 + 4; ctx.fillRect(cx, cy, 3, 3); }
  ctx.fillStyle = '#2a56c9';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const cx = x * 8 + (y % 2) * 4 + 7, cy = y * 8 + 8; ctx.fillRect(cx % w, cy % h, 2, 2); }
});
const scaleTex = () => tex('cs_fishScale', 32, 32, (ctx, w, h, r) => {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(0,30,50,0.32)'; ctx.lineWidth = 1;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 6; x++) { const cx = x * 6 + (y % 2) * 3, cy = y * 4; ctx.beginPath(); ctx.arc(cx, cy + 4, 3.2, PI, TAU); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; for (let i = 0; i < 14; i++) ctx.fillRect((r() * w) | 0, (r() * h) | 0, 2, 1);
});
const featherTex = () => tex('cs_feather', 32, 32, (ctx, w, h, r) => {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  for (let i = 0; i < 40; i++) { const x = (r() * w) | 0, y = (r() * h) | 0; ctx.fillRect(x, y, 3, 1); }
});
const trefoilTex = () => tex('cs_trefoil', 32, 32, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(16, 16, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e6c619';
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3 - PI / 2; ctx.beginPath(); ctx.moveTo(16, 16); ctx.arc(16, 16, 11, a - 0.5, a + 0.5); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(16, 16, 3, 0, TAU); ctx.fill();
}, false);
const patchTex = () => tex('cs_tfgpatch', 24, 24, (ctx, w, h) => {
  ctx.fillStyle = '#10141c'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 1; ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  ctx.fillStyle = '#ff8a3d'; ctx.font = '11px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TFG', w / 2, h / 2 + 1);
}, false);

const decalMats = new Map();
/** unlit alpha-tested decal material (emblems, patches): stays readable in the dark facilities */
function decalMat(key, map, color = 0xffffff) {
  let m = decalMats.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial({ map, color, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, fog: false }); m.userData.noTint = true; decalMats.set(key, m); }
  return m;
}
const flat = (c) => lam(c);
const emis = (c, e) => lam(c, { emissive: e });

// ------------------------------------------------------------------ hats (extra)
export function buildHatExtra(id) {
  const g = new THREE.Group();
  g.name = 'hat_' + id;
  const add = (key, mat, parts) => mk(g, merged('hat_' + id + '_' + key, parts), mat);
  switch (id) {
    case 'beanie':
      add('a', flat('#c0392b'), () => [xf(G.sph(0.178, 8, 4, 0, TAU, 0, PI / 2), [0, -0.07, 0], [0, 0, 0], [1, 0.85, 1])]);
      add('b', flat('#e8d6b0'), () => [xf(G.cyl(0.176, 0.18, 0.05, 8, true), [0, -0.085, 0]), xf(G.tor(0.175, 0.02, 3, 10), [0, -0.11, 0], [PI / 2, 0, 0])]);
      add('c', flat('#f0efe8'), () => [xf(G.ico(0.045, 0), [0, 0.09, 0])]);
      break;
    case 'bucket':
      add('a', flat('#7a8b5c'), () => [xf(G.cyl(0.13, 0.17, 0.13, 9), [0, -0.02, 0]), xf(G.cyl(0.26, 0.24, 0.018, 10), [0, -0.085, 0], [0.05, 0, 0])]);
      add('b', flat('#3d4a2e'), () => [xf(G.cyl(0.171, 0.172, 0.02, 9, true), [0, -0.055, 0])]);
      break;
    case 'headlamp':
      add('a', flat('#2b2f36'), () => [xf(G.tor(0.17, 0.014, 3, 12), [0, -0.1, 0], [PI / 2, 0, 0]), xf(G.box(0.09, 0.07, 0.06), [0, -0.09, 0.17])]);
      add('b', bas('#fff6b0'), () => [xf(G.cyl(0.028, 0.028, 0.02, 8), [0, -0.09, 0.205], [PI / 2, 0, 0])]);
      g.userData.bob = false;
      break;
    case 'wizard':
      add('a', flat('#43307a'), () => [xf(G.cone(0.13, 0.36, 8), [0, 0.15, 0], [0, 0, 0.08]), xf(G.cyl(0.25, 0.25, 0.018, 10), [0, -0.05, 0])]);
      add('b', flat('#f5d02a'), () => [xf(G.box(0.03, 0.03, 0.03), [0.06, 0.07, 0.11], [0, 0.4, 0.6]), xf(G.box(0.03, 0.03, 0.03), [-0.07, 0.14, 0.08], [0.3, 0.2, 0.7]), xf(G.box(0.028, 0.028, 0.028), [0.02, 0.2, -0.1], [0.5, 0.3, 0.1]), xf(G.cyl(0.135, 0.15, 0.03, 8, true), [0, -0.02, 0])]);
      break;
    default: { const h = buildC5Hat(id); if (h) return h; break; }   // [cosm5]
  }
  return g;
}

// ------------------------------------------------------------------ the look controller
export function createLookController(rig) {
  const state = { outfit: 'none', face: 'none', back: 'none' };
  const headgear = pv(rig.head, [0, 0.295, 0], null, 'headgear');   // outfit headgear (hidden when a hat is worn)
  let baseFaceStyle = rig.fs.style;
  let baseVisor = rig.fs.visor;
  let baseEye = rig.fs.eye;
  const outfitOwn = [], outfitAnims = [], faceOwn = [], faceAnims = [], backOwn = [], backAnims = [];

  // [avatar2] rig.attach = scaled child frames of the real pivots (rounded avatar): builders see those instead, so the classic coordinates fit
  const view = rig.attach ? Object.assign(Object.create(rig), rig.attach) : rig;
  const ctxFor = (ownList, animList) => ({
    rig: view,
    mesh(parent, key, mat, geos, p, r) { const m = mk(parent, merged('cs_' + key, geos), mat, p, r); ownList.push(m); return m; },
    raw(parent, geo, mat, p, r, s) { const m = mk(parent, geo, mat, p, r, s); ownList.push(m); return m; },
    group(parent, p, r) { const g = pv(parent, p, r); ownList.push(g); return g; },
    anim(fn) { animList.push(fn); },
  });
  const clear = (ownList, animList) => {
    for (const o of ownList) o.removeFromParent();
    ownList.length = 0; animList.length = 0;
  };

  // ---------------------------------------------------------------- outfits
  function resetBase() {
    rig.suitMat.emissive.setRGB(0, 0, 0);
    rig.suitMat.userData.baseEmissive?.setRGB(0, 0, 0);
    rig.gloveMat.color.set(rig.defaults?.glove || '#2a2622'); rig.bootMat.color.set(rig.defaults?.boot || '#2a2622'); rig.beltMat.color.set(rig.defaults?.belt || '#3b3026');   // [avatar2] defaults
    rig.spine.scale.set(1, 1, 1); rig.neck.scale.set(1, 1, 1);
    const g = rig.gear;
    g.belt.visible = true; g.regulator.visible = true; g.helmetbits.visible = true; g.helmetLight.visible = true;
    g.headMesh.visible = true; g.face.visible = true;
    rig.fs.style = baseFaceStyle; rig.fs.visor = baseVisor; rig.fs.eye = baseEye;
  }

  function setOutfit(id, baseColor) {
    if (id === state.outfit) return;
    clear(outfitOwn, outfitAnims);
    resetBase();
    state.outfit = id;
    const def = OUTFIT_BY_ID[id];
    if (def) {
      const b = BUILDERS[id];
      const fabric = b?.fabric?.();
      if (fabric) rig.suitMat.map = fabric;
      rig.suitMat.color.set(b?.tint || def.color);
      if (b?.emissive) { rig.suitMat.emissive.set(b.emissive); rig.suitMat.userData.baseEmissive?.set(b.emissive); }
      if (b?.glove) rig.gloveMat.color.set(b.glove);
      if (b?.boot) rig.bootMat.color.set(b.boot);
      if (b?.belt) rig.beltMat.color.set(b.belt);
      if (b?.scale) { rig.spine.scale.set(...b.scale); rig.neck.scale.set(1 / b.scale[0], 1 / b.scale[1], 1 / b.scale[2]); }
      const hide = b?.hide || [];
      for (const k of ['belt', 'regulator', 'helmetbits', 'helmetLight', 'headMesh', 'face']) if (hide.includes(k)) rig.gear[k].visible = false;
      if (b?.face) rig.fs.style = b.face;
      if (b?.visor) rig.fs.visor = b.visor;
      if (b?.eye) rig.fs.eye = b.eye;
      try { b?.build?.(ctxFor(outfitOwn, outfitAnims), headgear); } catch (e) { console.warn('[cosmetics] outfit', id, e); }
    } else {
      rig.suitMat.map = rig.baseMap;
      rig.suitMat.color.set(baseColor || '#d9642b');
    }
    syncGear();
    applyFace();
    onHat(rig.getHat());
    rig.redraw();
    rig.tinterRefresh();
  }

  function syncGear() {
    const hideTank = BACK_HIDES_TANK.has(state.back) || !!BUILDERS[state.outfit]?.hide?.includes('backpack');
    rig.backpackGear.visible = !hideTank;
  }

  function onHat(hatId) { headgear.visible = !hatId || hatId === 'none'; }

  // ---------------------------------------------------------------- face accessories
  function applyFace() {
    clear(faceOwn, faceAnims);
    rig.fs.led = state.face === 'led';
    const b = FACE_BUILDERS[state.face];
    if (b && rig.gear.face.visible) { try { const cx = ctxFor(faceOwn, faceAnims); b(cx, cx.rig); } catch (e) { console.warn('[cosmetics] face', state.face, e); } }
    rig.redraw();
  }
  function setFace(id) {
    id = FACE_ACCS.some((f) => f.id === id) ? id : 'none';
    if (id === state.face) return;
    state.face = id;
    applyFace();
    rig.tinterRefresh();
  }

  // ---------------------------------------------------------------- back accessories
  function setBack(id) {
    id = BACK_ACCS.some((f) => f.id === id) ? id : 'none';
    if (id === state.back) return;
    clear(backOwn, backAnims);
    state.back = id;
    syncGear();
    const b = BACK_BUILDERS[id];
    if (b) { try { const cx = ctxFor(backOwn, backAnims); b(cx, cx.rig); } catch (e) { console.warn('[cosmetics] back', id, e); } }
    rig.tinterRefresh();
  }

  function update(dt, time, a, mouth) {
    for (const f of outfitAnims) f(dt, time, a, mouth);
    for (const f of faceAnims) f(dt, time, a, mouth);
    for (const f of backAnims) f(dt, time, a, mouth);
  }
  function dispose() { clear(outfitOwn, outfitAnims); clear(faceOwn, faceAnims); clear(backOwn, backAnims); headgear.removeFromParent(); }

  return { setOutfit, setFace, setBack, onHat, update, dispose, state, headgear, get faceAccIsLed() { return state.face === 'led'; } };
}

// ------------------------------------------------------------------ outfit builders
const BACK_HIDES_TANK = new Set(['o2tank']);

/** thin ring around a limb / torso segment */
const limbRing = (r, h, y, s = 5) => xf(G.cyl(r, r, h, s, true), [0, y, 0]);

const BUILDERS = {
  // ---------------------------------------------------------------- VENOM
  venom: {
    tint: '#ffffff', fabric: venomTex, emissive: '#0a0c18', glove: '#07070c', boot: '#07070c',
    scale: [1.12, 1.03, 1.1], hide: ['backpack', 'belt', 'regulator', 'helmetbits', 'helmetLight'],
    face: 'venom', eye: '#ffffff',
    build(c) {
      const { spine, armL, armR, head, legL, legR } = c.rig;
      // white spider emblem: chest + back, unlit so it reads in the dark
      const em = decalMat('spider', spiderTex(), 0xf2f5ff);
      const front = c.raw(spine, torsoPanel('spider', 0.4, 0.42, 1, 0.03), em, [0, 0.29, 0]);
      const back = c.raw(spine, torsoPanel('spider', 0.4, 0.42, -1, 0.012), em, [0, 0.29, 0]);
      front.renderOrder = back.renderOrder = 1;
      // black shoulder bulk + collar so the silhouette is heavier than the stock suit
      c.mesh(spine, 'vn_bulk', lam('#0a0a12', { emissive: '#06070d' }), () => [
        xf(G.sph(0.115, 6, 4), [0.3, 0.44, 0], [0, 0, 0], [1, 0.8, 1]), xf(G.sph(0.115, 6, 4), [-0.3, 0.44, 0], [0, 0, 0], [1, 0.8, 1]),
        xf(G.cyl(0.16, 0.2, 0.09, 8), [0, 0.52, 0], [0, PI / 8, 0], [1, 1, 0.7]),
      ]);
      // claws: four black cones below each glove
      for (const arm of [armL, armR]) c.mesh(arm.el, 'vn_claws', lam('#050508'), () => [0, 1, 2, 3].map((i) => xf(G.cone(0.014, 0.09, 4), [(i - 1.5) * 0.026, -0.42, 0.03], [PI - 0.15, 0, 0])));
      // restless tendrils: 3 per side, 4 segments each, wobbling
      const mat = lam('#0c0c18', { emissive: '#0a0d1e' });
      const tips = lam('#1c2450', { emissive: '#222c66' });   // dark blue tips: glossy, not white spikes
      const chains = [];
      const spec = [
        { x: 0.15, y: 0.44, z: -0.13, ax: -0.45, az: -0.3, len: 0.14 },
        { x: 0.25, y: 0.4, z: -0.12, ax: -0.3, az: -0.7, len: 0.13 },
        { x: 0.1, y: 0.3, z: -0.15, ax: -0.85, az: -0.12, len: 0.12 },
      ];
      spec.forEach((sp, k) => {
        for (const side of [1, -1]) {
          let parent = c.group(spine, [sp.x * side, sp.y, sp.z], [sp.ax, 0, sp.az * side]);
          const segs = [];
          for (let i = 0; i < 4; i++) {
            const len = sp.len * (1 - i * 0.12), r0 = 0.032 * (1 - i * 0.2), r1 = 0.032 * (1 - (i + 1) * 0.2);
            const pivot = pv(parent, i === 0 ? null : [0, sp.len * (1 - (i - 1) * 0.12), 0]);
            c.raw(pivot, cached('vn_tend|' + len.toFixed(3) + r0.toFixed(3), () => new THREE.CylinderGeometry(Math.max(0.006, r1), r0, len, 5, 1).translate(0, len / 2, 0)), i === 3 ? tips : mat);
            segs.push(pivot);
            parent = pivot;
          }
          chains.push({ segs, ph: k * 1.7 + (side > 0 ? 0 : 0.9), side });
        }
      });
      c.anim((dt, t, a) => {
        const sp = clamp((a?.speed || 0) / 4, 0, 1);
        for (const ch of chains) {
          for (let i = 0; i < ch.segs.length; i++) {
            const w = Math.sin(t * (2.2 + sp * 1.6) + ch.ph + i * 0.9);
            ch.segs[i].rotation.x = (i === 0 ? 0 : 0.28 + 0.12 * w) + 0.06 * Math.sin(t * 1.3 + ch.ph);
            ch.segs[i].rotation.z = ch.side * 0.16 * Math.sin(t * 1.7 + ch.ph * 1.3 + i * 0.7) * (1 + sp * 0.6);
          }
        }
      });
      // tiny white eye-glow strips on the visor rim are drawn on the face canvas
      void head; void legL; void legR;
    },
  },

  // ---------------------------------------------------------------- HAZMAT
  hazmat: {
    tint: '#e6c619', glove: '#141414', boot: '#141414', hide: ['helmetbits'],
    build(c) {
      const { spine, head, armL, armR, legL, legR } = c.rig;
      const blk = flat('#181818');
      c.mesh(spine, 'hz_bands', blk, () => [torsoRing(0.06, 0.07), torsoRing(0.5, 0.05, 0.02)]);
      for (const arm of [armL, armR]) {
        c.mesh(arm.sh, 'hz_uarm', blk, () => [limbRing(0.083, 0.045, -0.2)]);
        c.mesh(arm.el, 'hz_farm', blk, () => [limbRing(0.072, 0.045, -0.08)]);
      }
      for (const leg of [legL, legR]) {
        c.mesh(leg.hip, 'hz_thigh', blk, () => [limbRing(0.096, 0.05, -0.28)]);
        c.mesh(leg.knee, 'hz_shin', blk, () => [limbRing(0.084, 0.05, -0.14)]);
      }
      const tre = c.raw(spine, torsoPanel('trefoil', 0.2, 0.2, 1, 0.03), decalMat('trefoil', trefoilTex()), [0, 0.3, 0]);
      tre.renderOrder = 1;
      // respirator canisters on both sides of the visor
      c.mesh(head, 'hz_filters', blk, () => [xf(G.cyl(0.04, 0.04, 0.08, 8), [0.15, 0.06, 0.1], [0, 0, PI / 2 - 0.3]), xf(G.cyl(0.04, 0.04, 0.08, 8), [-0.15, 0.06, 0.1], [0, 0, -PI / 2 + 0.3])]);
      c.mesh(head, 'hz_filters2', flat('#c9ccd1'), () => [xf(G.cyl(0.032, 0.032, 0.02, 8), [0.195, 0.05, 0.1], [0, 0, PI / 2 - 0.3]), xf(G.cyl(0.032, 0.032, 0.02, 8), [-0.195, 0.05, 0.1], [0, 0, -PI / 2 + 0.3])]);
    },
  },

  // ---------------------------------------------------------------- CLOWN
  clown: {
    tint: '#ffffff', fabric: clownTex, glove: '#f4f4f4', boot: '#2a56c9',
    build(c, headgear) {
      const { spine, head, legL, legR } = c.rig;
      const gold = flat('#f5d02a'), white = flat('#f4f2ec'), red = flat('#e0202a');
      c.mesh(spine, 'cl_ruff', white, () => [xf(G.tor(0.2, 0.05, 4, 10), [0, 0.53, 0], [PI / 2, 0, 0], [1, 0.75, 1])]);
      c.mesh(spine, 'cl_ruff2', gold, () => [xf(G.tor(0.21, 0.025, 3, 10), [0, 0.5, 0], [PI / 2, 0, 0], [1, 0.75, 1])]);
      c.mesh(spine, 'cl_buttons', gold, () => [0.44, 0.3, 0.16].map((y) => xf(G.ico(0.032, 0), [0, y, 0.16])));
      c.mesh(spine, 'cl_bow', red, () => [xf(G.cone(0.05, 0.09, 4), [0.06, 0.48, 0.16], [0, 0, -PI / 2]), xf(G.cone(0.05, 0.09, 4), [-0.06, 0.48, 0.16], [0, 0, PI / 2]), xf(G.ico(0.025, 0), [0, 0.48, 0.17])]);
      // red nose + green afro
      c.mesh(head, 'cl_nose', red, () => [xf(G.ico(0.038, 1), [0, 0.13, 0.183])]);
      c.mesh(head, 'cl_wig', flat('#4cc94c'), () => [xf(G.ico(0.09, 0), [0.15, 0.19, -0.02]), xf(G.ico(0.09, 0), [-0.15, 0.19, -0.02]), xf(G.ico(0.1, 0), [0, 0.2, -0.14]), xf(G.ico(0.075, 0), [0.11, 0.1, -0.13]), xf(G.ico(0.075, 0), [-0.11, 0.1, -0.13])]);
      // big shoes
      for (const leg of [legL, legR]) c.mesh(leg.ankle, 'cl_shoes', flat('#2a56c9'), () => [xf(G.box(0.17, 0.1, 0.4), [0, -0.05, 0.14]), xf(G.sph(0.09, 6, 4), [0, -0.05, 0.34], [0, 0, 0], [1, 0.8, 0.8])]);
      // ruff-like tiny top hat replaced by a flower when no hat (headgear)
      c.mesh(headgear, 'cl_flower', flat('#ff5fa0'), () => [xf(G.ico(0.03, 0), [0.07, 0.03, 0.05]), xf(G.ico(0.03, 0), [0.1, 0.03, 0.02]), xf(G.ico(0.03, 0), [0.07, 0.03, -0.01])]);
    },
  },

  // ---------------------------------------------------------------- ASTRONAUT
  astronaut: {
    tint: '#e8eaf0', glove: '#f6f6f6', boot: '#c9ccd4', visor: '#a27a1e', eye: '#1a1408', hide: ['backpack', 'helmetbits'],
    build(c) {
      const { spine, head, armL, armR, backpack, legL, legR } = c.rig;
      const orange = flat('#e8590c'), grey = flat('#3a3f48'), silver = flat('#b9bec9');
      c.mesh(spine, 'as_ring', silver, () => [xf(G.tor(0.19, 0.035, 4, 12), [0, 0.53, 0], [PI / 2, 0, 0], [1, 0.7, 1])]);
      c.mesh(spine, 'as_stripe', orange, () => [torsoRing(0.42, 0.05, 0.014)]);
      c.mesh(spine, 'as_ctrl', grey, () => [xf(G.box(0.2, 0.12, 0.05), [0, 0.28, 0.16])]);
      c.mesh(spine, 'as_lights', bas('#ff4b3a'), () => [xf(G.box(0.03, 0.03, 0.01), [-0.06, 0.3, 0.19])]);
      c.mesh(spine, 'as_lights2', bas('#4bff7a'), () => [xf(G.box(0.03, 0.03, 0.01), [0, 0.3, 0.19])]);
      c.mesh(spine, 'as_lights3', bas('#4ba8ff'), () => [xf(G.box(0.03, 0.03, 0.01), [0.06, 0.3, 0.19])]);
      for (const arm of [armL, armR]) {
        c.mesh(arm.sh, 'as_sh', orange, () => [limbRing(0.083, 0.04, -0.03)]);
        c.mesh(arm.el, 'as_wr', silver, () => [limbRing(0.07, 0.035, -0.22)]);
      }
      for (const leg of [legL, legR]) c.mesh(leg.knee, 'as_knee', silver, () => [limbRing(0.09, 0.05, -0.02)]);
      c.raw(armR.sh, cached('as_patchgeo', () => new THREE.PlaneGeometry(0.075, 0.075)), decalMat('patch', patchTex()), [-0.085, -0.14, 0], [0, -PI / 2, 0]);
      // life support pack
      c.mesh(backpack, 'as_pack', flat('#e2e4ea'), () => [xf(G.box(0.36, 0.5, 0.2), [0, 0, -0.1]), xf(G.box(0.3, 0.06, 0.16), [0, 0.28, -0.1])]);
      c.mesh(backpack, 'as_pack2', orange, () => [xf(G.box(0.36, 0.06, 0.205), [0, -0.1, -0.1])]);
      c.mesh(backpack, 'as_ant', silver, () => [xf(G.cyl(0.006, 0.01, 0.25, 4), [0.12, 0.42, -0.1])]);
      // helmet brim glint: gold reflective visor drawn on the canvas via fs.visor
      void head;
    },
  },

  // ---------------------------------------------------------------- DIVER
  diver: {
    tint: '#20323d', glove: '#10181c', boot: '#10181c', hide: ['helmetbits'],
    build(c) {
      const { spine, head, armL, armR, legL, legR } = c.rig;
      const yel = flat('#f1c40f');
      c.mesh(spine, 'dv_stripe', yel, () => [xf(G.box(0.04, 0.42, 0.02), [0.22, 0.27, 0.08], [0, 0.4, 0]), xf(G.box(0.04, 0.42, 0.02), [-0.22, 0.27, 0.08], [0, -0.4, 0])]);
      for (const arm of [armL, armR]) {
        c.mesh(arm.sh, 'dv_uarm', yel, () => [limbRing(0.082, 0.04, -0.06)]);
        c.mesh(arm.el, 'dv_farm', yel, () => [limbRing(0.07, 0.03, -0.05)]);
      }
      for (const leg of [legL, legR]) {
        c.mesh(leg.knee, 'dv_shin', yel, () => [limbRing(0.083, 0.04, -0.1)]);
        c.mesh(leg.ankle, 'dv_fin', flat('#f1c40f'), () => [xf(G.box(0.17, 0.025, 0.42), [0, -0.085, 0.24]), xf(G.box(0.07, 0.03, 0.05), [0, -0.075, 0.03])]);
      }
      c.mesh(armL.el, 'dv_gauge', flat('#20242a'), () => [xf(G.box(0.07, 0.045, 0.07), [0, -0.14, 0.02])]);
      c.mesh(armL.el, 'dv_gauge2', bas('#40e0ff'), () => [xf(G.box(0.04, 0.005, 0.04), [0, -0.121, 0.02])]);
      // snorkel on the right side of the helmet + strap
      c.mesh(head, 'dv_snork', flat('#f1c40f'), () => [xf(G.cyl(0.014, 0.014, 0.34, 6), [0.16, 0.14, 0.03]), xf(G.cyl(0.014, 0.014, 0.1, 6), [0.13, -0.02, 0.08], [PI / 2 - 0.1, 0, 0.5]), xf(G.box(0.03, 0.03, 0.03), [0.16, 0.315, 0.03])]);
      c.mesh(head, 'dv_snork2', flat('#1a1a1a'), () => [xf(G.tor(0.168, 0.01, 3, 12), [0, 0.19, 0], [PI / 2, 0, 0])]);
    },
  },

  // ---------------------------------------------------------------- CHICKEN
  chicken: {
    tint: '#f6f3ea', fabric: featherTex, glove: '#e39b1f', boot: '#e39b1f', hide: ['backpack', 'helmetbits'],
    build(c, headgear) {
      const { spine, head, body, armL, armR } = c.rig;
      const orange = flat('#e39b1f'), red = flat('#d82a20'), white = flat('#f6f3ea');
      c.mesh(head, 'ck_beak', orange, () => [xf(G.cone(0.05, 0.13, 4), [0, 0.105, 0.2], [PI / 2, PI / 4, 0], [1, 1, 0.75])]);
      c.mesh(head, 'ck_wattle', red, () => [xf(G.sph(0.028, 5, 4), [0, 0.055, 0.19], [0, 0, 0], [0.8, 1.4, 0.8])]);
      c.mesh(headgear, 'ck_comb', red, () => [xf(G.sph(0.038, 5, 4), [0, -0.01, 0.06]), xf(G.sph(0.044, 5, 4), [0, 0.0, 0.0]), xf(G.sph(0.036, 5, 4), [0, -0.02, -0.06])]);
      c.mesh(head, 'ck_tufts', white, () => [xf(G.ico(0.05, 0), [0.16, 0.12, 0.0]), xf(G.ico(0.05, 0), [-0.16, 0.12, 0.0])]);
      c.mesh(spine, 'ck_breast', white, () => [xf(G.ico(0.12, 0), [0, 0.28, 0.1], [0, 0, 0], [1.25, 1.1, 0.7]), xf(G.ico(0.08, 0), [0, 0.43, 0.06], [0, 0, 0], [1.4, 0.9, 0.9])]);
      // wing tufts + tail feathers
      for (const arm of [armL, armR]) c.mesh(arm.sh, 'ck_wing', white, () => [xf(G.ico(0.07, 0), [0, -0.05, 0], [0, 0, 0], [0.9, 1.6, 0.9])]);
      c.mesh(body, 'ck_tail', white, () => [-2, -1, 0, 1, 2].map((i) => xf(G.cone(0.055, 0.34, 4), [i * 0.06, 0.24 - Math.abs(i) * 0.02, -0.26], [-0.9 + Math.abs(i) * 0.05, 0, -i * 0.3], [1, 1, 0.35])));
      c.mesh(body, 'ck_tail2', red, () => [xf(G.cone(0.04, 0.24, 4), [0, 0.22, -0.28], [-1.05, 0, 0], [1, 1, 0.3])]);
    },
  },

  // ---------------------------------------------------------------- FISH HEAD
  phish: {
    tint: '#7ea6bd', fabric: scaleTex, glove: '#2a3d4a', boot: '#2a3d4a', hide: ['helmetbits', 'helmetLight', 'headMesh', 'face'],
    build(c, headgear) {
      const { head, body } = c.rig;
      const skin = lam('#9ab7c9', { emissive: '#101a20' }), lip = flat('#d9b25f'), dark = flat('#141c22'), fin = flat('#e0703a');
      c.mesh(head, 'fh_head', skin, () => [xf(G.sph(0.2, 9, 7), [0, 0.135, 0.03], [0, 0, 0], [0.98, 1.02, 1.28])]);
      c.mesh(head, 'fh_belly', flat('#e8f0f4'), () => [xf(G.sph(0.17, 8, 5), [0, 0.06, 0.06], [0, 0, 0], [0.9, 0.6, 1.2])]);
      c.mesh(head, 'fh_eyes', flat('#f4f8f8'), () => [xf(G.sph(0.06, 8, 6), [0.15, 0.19, 0.11]), xf(G.sph(0.06, 8, 6), [-0.15, 0.19, 0.11])]);
      c.mesh(head, 'fh_pupils', dark, () => [xf(G.sph(0.03, 6, 5), [0.195, 0.19, 0.125]), xf(G.sph(0.03, 6, 5), [-0.195, 0.19, 0.125])]);
      c.mesh(head, 'fh_gills', dark, () => [0, 1, 2].flatMap((i) => [xf(G.box(0.014, 0.075, 0.02), [0.198 - i * 0.004, 0.1, -0.06 - i * 0.03], [0, 0, -0.2]), xf(G.box(0.014, 0.075, 0.02), [-0.198 + i * 0.004, 0.1, -0.06 - i * 0.03], [0, 0, 0.2])]));
      c.mesh(head, 'fh_lip_up', lip, () => [xf(G.sph(0.075, 7, 5), [0, 0.115, 0.29], [0, 0, 0], [1.5, 0.55, 0.85])]);
      const jaw = c.group(head, [0, 0.085, 0.2]);
      c.mesh(jaw, 'fh_lip_lo', lip, () => [xf(G.sph(0.07, 7, 5), [0, -0.012, 0.09], [0, 0, 0], [1.45, 0.5, 0.85])]);
      c.mesh(jaw, 'fh_mouth', flat('#5a1420'), () => [xf(G.box(0.14, 0.02, 0.1), [0, 0.02, 0.05])]);
      c.mesh(headgear, 'fh_fin', fin, () => [xf(G.cone(0.09, 0.22, 3), [0, 0.03, -0.06], [-0.3, 0, 0], [0.25, 1, 1]), xf(G.cone(0.06, 0.15, 3), [0, 0.0, 0.03], [0.1, 0, 0], [0.25, 1, 1])]);
      // tail fin on the pelvis
      c.mesh(body, 'fh_tail', fin, () => [xf(G.cone(0.1, 0.34, 3), [0, 0.05, -0.28], [-PI / 2 + 0.15, 0, 0], [0.3, 1, 1]), xf(G.cone(0.09, 0.26, 3), [0, 0.18, -0.36], [-PI / 2 - 0.5, 0, 0], [0.3, 1, 1]), xf(G.cone(0.09, 0.26, 3), [0, -0.08, -0.36], [-PI / 2 + 0.8, 0, 0], [0.3, 1, 1])]);
      c.anim((dt, t, a, mouth) => { jaw.rotation.x = clamp(mouth || 0, 0, 1) * 0.55 + Math.sin(t * 1.4) * 0.02; });
    },
  },

  // ---------------------------------------------------------------- FIREFIGHTER
  firefighter: {
    tint: '#c8a02a', glove: '#5b1d16', boot: '#1a1a1a', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR, legL, legR } = c.rig;
      const refl = lam('#d4dadc', { emissive: '#565b5c' });
      c.mesh(spine, 'ff_bands', refl, () => [torsoRing(0.14, 0.06), torsoRing(0.4, 0.06)]);
      for (const arm of [armL, armR]) {
        c.mesh(arm.sh, 'ff_uarm', refl, () => [limbRing(0.083, 0.05, -0.16)]);
        c.mesh(arm.el, 'ff_farm', refl, () => [limbRing(0.072, 0.045, -0.12)]);
      }
      for (const leg of [legL, legR]) {
        c.mesh(leg.hip, 'ff_thigh', refl, () => [limbRing(0.097, 0.05, -0.24)]);
        c.mesh(leg.knee, 'ff_shin', refl, () => [limbRing(0.085, 0.05, -0.2)]);
      }
      c.mesh(spine, 'ff_clasps', flat('#3a3a3a'), () => [0.12, 0.26, 0.4].map((y) => xf(G.box(0.05, 0.03, 0.02), [0, y, 0.155])));
      c.mesh(spine, 'ff_pouch', flat('#1a1a1a'), () => [xf(G.box(0.06, 0.1, 0.09), [0.245, 0.03, 0.04]), xf(G.box(0.06, 0.1, 0.09), [-0.245, 0.03, 0.04])]);
      // helmet: red dome, long back brim, gold shield
      c.mesh(headgear, 'ff_helmet', flat('#c22a1f'), () => [xf(G.sph(0.19, 8, 4, 0, TAU, 0, PI / 2), [0, -0.075, 0], [0, 0, 0], [1, 0.85, 1.08]), xf(G.box(0.36, 0.014, 0.16), [0, -0.09, -0.19], [0.25, 0, 0]), xf(G.box(0.3, 0.014, 0.1), [0, -0.085, 0.2], [-0.15, 0, 0]), xf(G.box(0.04, 0.05, 0.36), [0, 0.03, -0.02])]);
      c.mesh(headgear, 'ff_shield', lam('#f0c040', { emissive: '#3a2a00' }), () => [xf(G.box(0.08, 0.075, 0.012), [0, -0.03, 0.185], [-0.15, 0, 0])]);
    },
  },

  // ---------------------------------------------------------------- SCIENTIST
  scientist: {
    tint: '#e6eaea', glove: '#3f8fbf', boot: '#dcdcdc',
    build(c) {
      const { spine, head } = c.rig;
      const white = flat('#eef1f1');
      const [cr0, cr1, cl, cy] = c.rig.dims?.coat || [0.29, 0.33, 0.6, -0.27];   // [avatar2] shorter coat on the bean
      c.mesh(spine, 'sc_coat' + (c.rig.dims ? '2' : ''), white, () => [xf(G.cyl(cr0, cr1, cl, 8, true), [0, cy, 0], [0, PI / 8, 0], [1, 1, 0.72]), xf(G.box(0.2, 0.1, 0.03), [0.085, 0.42, 0.155], [0, 0, 0.5]), xf(G.box(0.2, 0.1, 0.03), [-0.085, 0.42, 0.155], [0, 0, -0.5])]);
      c.mesh(spine, 'sc_pocket', flat('#dfe4e4'), () => [xf(G.box(0.1, 0.09, 0.02), [0.12, 0.14, 0.16])]);
      c.mesh(spine, 'sc_pens', flat('#2050c8'), () => [xf(G.box(0.012, 0.06, 0.012), [0.1, 0.2, 0.17])]);
      c.mesh(spine, 'sc_pens2', flat('#d02828'), () => [xf(G.box(0.012, 0.06, 0.012), [0.135, 0.2, 0.17])]);
      c.mesh(spine, 'sc_badge', flat('#bfd8ff'), () => [xf(G.box(0.07, 0.05, 0.012), [-0.1, 0.3, 0.165])]);
      // goggles pushed up on the helmet
      c.mesh(head, 'sc_strap', flat('#2a2d33'), () => [xf(G.tor(0.17, 0.014, 3, 12), [0, 0.24, 0], [PI / 2, 0, 0])]);
      c.mesh(head, 'sc_lens', lam('#6cc4ff', { emissive: '#0c3a58' }), () => [xf(G.cyl(0.04, 0.04, 0.02, 8), [0.06, 0.255, 0.165], [PI / 2 - 0.5, 0, 0]), xf(G.cyl(0.04, 0.04, 0.02, 8), [-0.06, 0.255, 0.165], [PI / 2 - 0.5, 0, 0])]);
      c.mesh(head, 'sc_rim', flat('#2a2d33'), () => [xf(G.tor(0.04, 0.008, 3, 8), [0.06, 0.255, 0.168], [-0.9, 0, 0]), xf(G.tor(0.04, 0.008, 3, 8), [-0.06, 0.255, 0.168], [-0.9, 0, 0])]);
    },
  },

  // ---------------------------------------------------------------- SECURITY
  security: {
    tint: '#22304d', glove: '#111111', boot: '#111111', belt: '#101010',
    build(c, headgear) {
      const { spine, armL, armR } = c.rig;
      c.mesh(spine, 'sec_badge', lam('#f0c020', { emissive: '#3a2c00' }), () => [xf(G.cyl(0.032, 0.032, 0.012, 5), [-0.1, 0.36, 0.158], [PI / 2, 0, 0])]);
      c.mesh(spine, 'sec_strap', flat('#e8e8e8'), () => [xf(G.box(0.03, 0.34, 0.012), [0.1, 0.28, 0.152], [0, 0, 0.2])]);
      for (const arm of [armL, armR]) c.mesh(arm.sh, 'sec_epaulette', flat('#e8e8e8'), () => [xf(G.box(0.1, 0.03, 0.09), [0, 0.04, 0])]);
      c.mesh(spine, 'sec_duty', flat('#101010'), () => [xf(G.box(0.07, 0.12, 0.09), [0.245, 0.03, 0.04]), xf(G.box(0.06, 0.1, 0.09), [-0.245, 0.03, 0.04]), xf(G.box(0.1, 0.09, 0.04), [0.1, 0.0, 0.17])]);
      c.mesh(spine, 'sec_radio', flat('#2c3036'), () => [xf(G.box(0.05, 0.1, 0.03), [0.1, 0.4, 0.152])]);
      // peaked cap
      c.mesh(headgear, 'sec_cap', flat('#1a2540'), () => [xf(G.cyl(0.18, 0.19, 0.09, 9), [0, -0.055, 0]), xf(G.cyl(0.2, 0.19, 0.03, 9), [0, -0.005, 0]), xf(G.box(0.22, 0.014, 0.12), [0, -0.075, 0.2], [0.18, 0, 0])]);
      c.mesh(headgear, 'sec_capbadge', flat('#f0c020'), () => [xf(G.box(0.04, 0.04, 0.01), [0, -0.04, 0.195])]);
    },
  },

  // ---------------------------------------------------------------- CONSTRUCTION
  construction: {
    tint: '#e9782b', glove: '#6b5a3a', boot: '#3d3226',
    build(c, headgear) {
      const { spine, armL, armR, legL, legR } = c.rig;
      const refl = lam('#e2e65a', { emissive: '#4a4c10' });
      c.mesh(spine, 'co_bands', refl, () => [torsoRing(0.1, 0.05), torsoRing(0.4, 0.05)]);
      c.mesh(spine, 'co_straps', refl, () => [xf(G.box(0.045, 0.32, 0.012), [0.11, 0.26, 0.158]), xf(G.box(0.045, 0.32, 0.012), [-0.11, 0.26, 0.158])]);
      for (const arm of [armL, armR]) c.mesh(arm.el, 'co_arm', refl, () => [limbRing(0.072, 0.04, -0.1)]);
      for (const leg of [legL, legR]) c.mesh(leg.knee, 'co_leg', refl, () => [limbRing(0.085, 0.04, -0.15)]);
      c.mesh(spine, 'co_belt', flat('#6b4a2a'), () => [xf(G.box(0.06, 0.1, 0.09), [0.245, 0.03, 0.04]), xf(G.box(0.06, 0.1, 0.09), [-0.245, 0.03, 0.04]), xf(G.box(0.03, 0.2, 0.03), [0.26, -0.08, 0.04], [0, 0, 0.12])]);
      c.mesh(headgear, 'co_hat', flat('#f2c418'), () => [xf(G.sph(0.18, 8, 3, 0, TAU, 0, PI / 2), [0, -0.06, 0], [0, 0, 0], [1, 0.7, 1.05]), xf(G.cyl(0.22, 0.22, 0.014, 10), [0, -0.055, 0.02]), xf(G.box(0.035, 0.05, 0.3), [0, 0.06, 0])]);
    },
  },

  // ---------------------------------------------------------------- GOLD EMPLOYEE
  goldemp: {
    tint: '#d6a51f', emissive: '#3a2600', glove: '#f3e2a0', boot: '#8a6410',
    build(c) {
      const { spine } = c.rig;
      c.mesh(spine, 'ge_tie', flat('#b3202a'), () => [xf(G.box(0.045, 0.3, 0.014), [0, 0.3, 0.156], [0, 0, 0]), xf(G.cone(0.03, 0.07, 3), [0, 0.12, 0.158], [PI, 0, 0]), xf(G.box(0.06, 0.05, 0.02), [0, 0.46, 0.155])]);
      c.mesh(spine, 'ge_collar', flat('#fff6d0'), () => [xf(G.box(0.1, 0.05, 0.02), [0.05, 0.5, 0.15], [0, 0, 0.5]), xf(G.box(0.1, 0.05, 0.02), [-0.05, 0.5, 0.15], [0, 0, -0.5])]);
      c.mesh(spine, 'ge_plaque', lam('#fff0a0', { emissive: '#665500' }), () => [xf(G.box(0.09, 0.05, 0.012), [-0.1, 0.36, 0.16])]);
      c.mesh(spine, 'ge_belt', lam('#fff0a0', { emissive: '#443500' }), () => [xf(G.box(0.09, 0.06, 0.02), [0, 0.03, 0.168])]);
      // glints
      const glints = [];
      const gm = bas('#fffbe0');
      for (let i = 0; i < 4; i++) glints.push(c.raw(spine, G.box(0.02, 0.02, 0.02), gm, [0, 0.3, 0]));
      c.anim((dt, t) => {
        glints.forEach((g, i) => {
          const a = t * 0.9 + i * 1.57;
          g.position.set(Math.sin(a) * 0.26, 0.28 + Math.sin(t * 1.3 + i * 2) * 0.22, Math.cos(a) * 0.19);
          g.scale.setScalar(Math.max(0, Math.sin(t * 3 + i * 1.9)) * 1.6);
          g.rotation.set(t * 2 + i, t * 3, 0);
        });
      });
    },
  },
};

// ------------------------------------------------------------------ face accessory builders (attach to the head pivot)
const FACE_BUILDERS = {
  gasmask(c, rig) {
    const head = rig.faceHead || rig.head;   // [avatar2]
    c.mesh(head, 'gm_snout', flat('#454d3e'), () => [xf(G.sph(0.095, 8, 5), [0, 0.078, 0.14], [0, 0, 0], [1.1, 0.85, 0.85])]);
    c.mesh(head, 'gm_can', flat('#23272b'), () => [xf(G.cyl(0.042, 0.042, 0.08, 8), [0.062, 0.062, 0.215], [PI / 2, 0, 0]), xf(G.cyl(0.042, 0.042, 0.08, 8), [-0.062, 0.062, 0.215], [PI / 2, 0, 0]), xf(G.tor(0.17, 0.011, 3, 12), [0, 0.1, 0], [PI / 2, 0, 0])]);
    c.mesh(head, 'gm_cap', flat('#b9a83a'), () => [xf(G.cyl(0.03, 0.03, 0.012, 8), [0.062, 0.062, 0.258], [PI / 2, 0, 0]), xf(G.cyl(0.03, 0.03, 0.012, 8), [-0.062, 0.062, 0.258], [PI / 2, 0, 0])]);
  },
  visor(c, rig) {
    const head = rig.faceHead || rig.head;   // [avatar2]
    c.raw(head, arcBand('cv', 0.185, 0.05, 2.1, 0.163), bas('#28e6ff'), [0, 0, 0]);
    c.raw(head, arcBand('cv2', 0.187, 0.012, 2.1, 0.163), bas('#e6ffff'), [0, 0, 0]);
    c.mesh(head, 'cv_brk', flat('#1c2026'), () => [xf(G.box(0.02, 0.07, 0.03), [0.15, 0.163, 0.11], [0, 0.9, 0]), xf(G.box(0.02, 0.07, 0.03), [-0.15, 0.163, 0.11], [0, -0.9, 0])]);
  },
  shades(c, rig) {
    const head = rig.faceHead || rig.head;   // [avatar2]
    c.raw(head, arcBand('sh', 0.184, 0.06, 2.0, 0.165), lam('#0a0a0c'), [0, 0, 0]);
    c.mesh(head, 'sh_bridge', flat('#0a0a0c'), () => [xf(G.box(0.02, 0.012, 0.012), [0, 0.185, 0.175]), xf(G.box(0.012, 0.012, 0.22), [0.165, 0.185, 0.03]), xf(G.box(0.012, 0.012, 0.22), [-0.165, 0.185, 0.03])]);
  },
  moustache(c, rig) {
    const m = flat('#171310');
    c.mesh(rig.faceHead || rig.head, 'mo_a', m, () => [
      xf(G.box(0.05, 0.02, 0.014), [0.032, 0.122, 0.176], [0, -0.25, -0.12]), xf(G.box(0.05, 0.02, 0.014), [-0.032, 0.122, 0.176], [0, 0.25, 0.12]),
      xf(G.box(0.03, 0.016, 0.014), [0.075, 0.13, 0.16], [0, -0.7, 0.6]), xf(G.box(0.03, 0.016, 0.014), [-0.075, 0.13, 0.16], [0, 0.7, -0.6]),
      xf(G.box(0.03, 0.016, 0.012), [0.098, 0.146, 0.148], [0, -0.9, 0.9]), xf(G.box(0.03, 0.016, 0.012), [-0.098, 0.146, 0.148], [0, 0.9, -0.9]),
    ]);
  },
  led() { /* drawn on the visor canvas (fs.led) */ },
};

// ------------------------------------------------------------------ back accessory builders (attach to the backpack pivot)
const BACK_BUILDERS = {
  o2tank(c, rig) {
    const bp = rig.backpack;
    c.mesh(bp, 'o2_frame', flat('#2a2622'), () => [xf(G.box(0.34, 0.46, 0.05)), xf(G.box(0.3, 0.05, 0.14), [0, -0.21, -0.06])]);
    c.mesh(bp, 'o2_tanks', flat('#cfd6dc'), () => [xf(G.cyl(0.075, 0.075, 0.42, 8, true), [0.095, 0, -0.14]), xf(G.cyl(0.075, 0.075, 0.42, 8, true), [-0.095, 0, -0.14])]);
    c.mesh(bp, 'o2_caps', flat('#2f6fd0'), () => [xf(G.sph(0.075, 8, 3, 0, TAU, 0, PI / 2), [0.095, 0.21, -0.14]), xf(G.sph(0.075, 8, 3, 0, TAU, 0, PI / 2), [-0.095, 0.21, -0.14]), xf(G.cyl(0.076, 0.076, 0.07, 8, true), [0.095, -0.165, -0.14]), xf(G.cyl(0.076, 0.076, 0.07, 8, true), [-0.095, -0.165, -0.14])]);
    c.mesh(bp, 'o2_valve', flat('#7d8184'), () => [xf(G.box(0.14, 0.05, 0.05), [0, 0.27, -0.14]), xf(G.cyl(0.02, 0.02, 0.06, 6), [0, 0.3, -0.14])]);
  },
  antenna(c, rig) {
    const pivot = c.group(rig.backpack, [0.13, 0.22, -0.12], [0, 0, 0]);
    c.raw(pivot, cached('ant_rod', () => new THREE.CylinderGeometry(0.005, 0.01, 0.6, 4).translate(0, 0.3, 0)), flat('#9aa0a6'));
    c.raw(pivot, G.ico(0.024, 0), bas('#ff3030'), [0, 0.6, 0]);
    c.raw(pivot, G.cyl(0.03, 0.03, 0.03, 6), flat('#2a2f36'), [0, 0.01, 0]);
    c.anim((dt, t, a) => { const sp = clamp((a?.speed || 0) / 4, 0, 1); pivot.rotation.z = -0.1 + Math.sin(t * 5.5) * 0.05 * (0.4 + sp); pivot.rotation.x = -0.08 - sp * 0.25 + Math.sin(t * 4.1) * 0.04 * sp; });
  },
  plushie(c, rig) {
    const pivot = c.group(rig.backpack, [-0.09, -0.16, -0.25], [0, PI, 0]);
    const brown = flat('#a9713e'), tan = flat('#e2c08d'), blk = bas('#101010');
    c.raw(pivot, G.sph(0.075, 7, 5), brown, [0, 0, 0], null, [1, 1.1, 0.9]);
    c.raw(pivot, G.sph(0.058, 7, 5), brown, [0, 0.11, 0]);
    c.raw(pivot, G.sph(0.022, 5, 4), brown, [0.045, 0.16, 0]);
    c.raw(pivot, G.sph(0.022, 5, 4), brown, [-0.045, 0.16, 0]);
    c.raw(pivot, G.sph(0.027, 5, 4), tan, [0, 0.095, 0.05]);
    c.raw(pivot, G.box(0.014, 0.014, 0.014), blk, [0.022, 0.125, 0.052]);
    c.raw(pivot, G.box(0.014, 0.014, 0.014), blk, [-0.022, 0.125, 0.052]);
    c.raw(pivot, G.cap(0.026, 0.06, 2, 5), brown, [0.085, 0.02, 0.02], [0, 0, -0.6]);
    c.raw(pivot, G.cap(0.026, 0.06, 2, 5), brown, [-0.085, 0.02, 0.02], [0, 0, 0.6]);
    c.raw(pivot, G.cap(0.03, 0.05, 2, 5), brown, [0.04, -0.09, 0.02], [0.5, 0, 0]);
    c.raw(pivot, G.cap(0.03, 0.05, 2, 5), brown, [-0.04, -0.09, 0.02], [0.5, 0, 0]);
    c.raw(pivot, G.box(0.012, 0.09, 0.012), flat('#3a2a1a'), [0, 0.19, 0.0]);
    c.anim((dt, t, a) => { const sp = clamp((a?.speed || 0) / 4, 0, 1); pivot.rotation.z = Math.sin(t * 6) * 0.12 * sp + Math.sin(t * 1.5) * 0.03; });
  },
  monster(c, rig) {
    const pivot = c.group(rig.backpack, [0.02, 0.33, -0.1]);
    const green = flat('#5ecb4e'), dark = flat('#2f7a2a'), white = bas('#ffffff'), blk = bas('#101010');
    const body = pv(pivot, [0, 0.07, 0]);
    c.raw(body, G.sph(0.08, 8, 6), green, [0, 0, 0], null, [1, 0.9, 0.95]);
    c.raw(body, G.cone(0.02, 0.05, 4), dark, [0.045, 0.075, 0], [0, 0, -0.4]);
    c.raw(body, G.cone(0.02, 0.05, 4), dark, [-0.045, 0.075, 0], [0, 0, 0.4]);
    const eye = pv(body, [0, 0.015, 0.068]);
    c.raw(eye, G.sph(0.035, 6, 5), white, [0, 0, 0]);
    c.raw(eye, G.sph(0.017, 5, 4), blk, [0, 0, 0.026]);
    c.raw(body, G.box(0.045, 0.008, 0.01), dark, [0, -0.035, 0.077]);
    c.raw(body, G.cap(0.014, 0.03, 2, 4), green, [0.085, -0.02, 0.01], [0, 0, -0.8]);
    c.raw(body, G.cap(0.014, 0.03, 2, 4), green, [-0.085, -0.02, 0.01], [0, 0, 0.8]);
    c.raw(body, G.sph(0.022, 5, 4), dark, [0.035, -0.075, 0.02]);
    c.raw(body, G.sph(0.022, 5, 4), dark, [-0.035, -0.075, 0.02]);
    let blinkT = 2;
    c.anim((dt, t, a) => {
      const sp = clamp((a?.speed || 0) / 4, 0, 1);
      const b = Math.abs(Math.sin(t * (3.4 + sp * 3)));
      body.position.y = 0.07 + b * (0.014 + sp * 0.03);
      body.scale.set(1 + (1 - b) * 0.05, 1 - (1 - b) * 0.07, 1 + (1 - b) * 0.05);
      body.rotation.y = Math.sin(t * 0.8) * 0.5;
      blinkT -= dt; if (blinkT < 0) blinkT = 1.5 + Math.random() * 3;
      eye.scale.y = blinkT < 0.12 ? 0.1 : 1;
    });
  },
};

/** { tint, map, emissive, glove } of an outfit (first-person sleeves use it) */
export function outfitLook(id) {
  const b = BUILDERS[id];
  const def = OUTFIT_BY_ID[id];
  return { tint: b?.tint || def?.color, map: b?.fabric ? b.fabric() : null, emissive: b?.emissive || null, glove: b?.glove || null };
}
export const FACE_ACC_BY_ID = Object.fromEntries(FACE_ACCS.map((f) => [f.id, f]));
export const BACK_ACC_BY_ID = Object.fromEntries(BACK_ACCS.map((f) => [f.id, f]));
export { spiderTex, venomTex };

Object.assign(BUILDERS, W3_BUILDERS);   // [ux]

Object.assign(BUILDERS, C5_SUIT_BUILDERS);   // [cosm5]
Object.assign(BACK_BUILDERS, C5_BACK_BUILDERS);
for (const id of C5_BACK_HIDES) BACK_HIDES_TANK.add(id);
