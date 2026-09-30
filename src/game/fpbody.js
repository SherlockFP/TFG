// FPBODY (wave 2): first-person feel module. Installed with `this.useModule('fpbody', installFpBody)` (game.js).
// Everything is documented in docs/wave2/fpbody.md; the four parts:
//   1. CHAT BUBBLES   text a crewmate types (or an incantation / emote) floats above THEIR head as a pixel speech bubble.
//   2. FIRST-PERSON BODY  your own avatar (no head, no arms) rendered for your own camera only: legs, boots and a bit of chest
//                     when you look down, walk / run / crouch / jump cycles, suit + wardrobe colours.
//   3. VIEW MODEL     held items are fitted to the palm from their own bounding box (fpbody_grip.js), two-handed items use both
//                     hands (arm IK in avatar.js), and the view model is drawn on top of the world (depth range) so it can
//                     never sink into a wall.
//   4. SMOOTH MOVEMENT frame-time smoothing for Game.update + the LocalPlayer camera fixes tagged `// [fpbody]`.
// Switches: game.fpbody.opts.{bubbles, body, fitGrip, vmDepth, smoothDt}; settings.chatBubbles === false / settings.fpBody === false.
import * as THREE from 'three';
import { addTranslations, t } from '../core/i18n.js';
import { createAvatar, SUIT_COLORS, VM_ARM } from '../models/avatar.js';
import { clamp, damp } from '../core/util.js';
import { itemGeom, fitGrip, poseFpBody, FP, penetration, PALM, makeDtSmoother } from './fpbody_grip.js';

addTranslations({
  'Chat bubbles': 'Sohbet baloncukları',
  'First-person body': 'Birinci şahıs vücut',
});

const FP_LAYER = 2;                 // three.js layer of the first-person body (main camera only: the ship mirror camera never enables it)
const VM_DEPTH = 0.06;              // the view model uses window depth 0..0.06 => always in front of the world
const suitCol = (id) => (SUIT_COLORS.find((s) => s.id === id) || SUIT_COLORS[0] || { color: '#d9642b' }).color;

// ------------------------------------------------------------------------------------------------ bubble drawing
const FONT = '22px VT323, "Lucida Console", monospace';
const LH = 20, PADX = 9, PADY = 6, TAIL = 7, MAXW = 210, PX_M = 0.0056;   // line height, padding, tail, max text width (px), metres per canvas px
const KINDS = {
  chat: { bg: 'rgba(7,17,13,0.88)', bd: '#7dffb0', fg: '#dcffe8' },
  spell: { bg: 'rgba(20,8,34,0.9)', bd: '#c68bff', fg: '#f0dcff' },
  emote: { bg: 'rgba(30,20,6,0.88)', bd: '#ffc85c', fg: '#ffe8b4' },
};

function wrapLines(ctx, text, maxW, maxLines) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  const fits = (s) => ctx.measureText(s).width <= maxW;
  const pushLong = (w) => {           // a single word wider than a line: break it by characters
    let piece = '';
    for (const ch of w) { if (fits(piece + ch)) piece += ch; else { lines.push(piece); piece = ch; } }
    return piece;
  };
  for (const w of words) {
    const tryLine = cur ? cur + ' ' + w : w;
    if (fits(tryLine)) cur = tryLine;
    else {
      if (cur) lines.push(cur);
      cur = fits(w) ? w : pushLong(w);
    }
    if (lines.length > maxLines) break;
  }
  if (cur && lines.length <= maxLines) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let l = lines[maxLines - 1];
    while (l.length > 1 && !fits(l + '…')) l = l.slice(0, -1);
    lines[maxLines - 1] = l.replace(/\s+$/, '') + '…';
  }
  return lines.length ? lines : [''];
}

function makeBubble(text, kind, colorCss) {
  const K = KINDS[kind] || KINDS.chat;
  const clean = String(text).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) || '...';
  const c = document.createElement('canvas');
  let ctx = c.getContext('2d');
  ctx.font = FONT;
  const lines = wrapLines(ctx, clean, MAXW, 2);
  let tw = 0;
  for (const l of lines) tw = Math.max(tw, ctx.measureText(l).width);
  const W = Math.max(44, Math.ceil(tw) + PADX * 2), H = lines.length * LH + PADY * 2 + TAIL;
  c.width = W; c.height = H;
  ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  const bd = colorCss || K.bd, bh = H - TAIL;
  // body with pixel-notched corners
  ctx.fillStyle = bd;
  ctx.fillRect(2, 0, W - 4, bh); ctx.fillRect(0, 2, W, bh - 4);
  ctx.fillStyle = K.bg;
  ctx.fillRect(3, 2, W - 6, bh - 4); ctx.fillRect(2, 3, W - 4, bh - 6);
  // stepped tail
  ctx.fillStyle = bd;
  const cx = Math.floor(W / 2);
  ctx.fillRect(cx - 4, bh, 8, 2); ctx.fillRect(cx - 3, bh + 2, 6, 2); ctx.fillRect(cx - 1, bh + 4, 3, 3);
  ctx.fillStyle = K.bg;
  ctx.fillRect(cx - 3, bh, 6, 2); ctx.fillRect(cx - 2, bh + 2, 4, 2);
  // text (1 px drop shadow keeps it readable on the noisy PSX backdrop)
  lines.forEach((l, i) => {
    const x = Math.round((W - ctx.measureText(l).width) / 2), y = PADY + i * LH;
    ctx.fillStyle = '#000'; ctx.fillText(l, x + 1, y + 1);
    ctx.fillStyle = K.fg; ctx.fillText(l, x, y);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false, fog: false, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  sprite.center.set(0.5, 0);              // anchored at the tail so it scales / stacks upwards
  sprite.renderOrder = 30;
  sprite.frustumCulled = false;
  const w = W * PX_M, h = H * PX_M;
  return { sprite, tex, mat, w, h, lines, text: clean, kind, life: 0, ttl: 5, y: 0, alpha: 0 };
}

// ------------------------------------------------------------------------------------------------ module
export function installFpBody(game) {
  const S = {
    disposed: false,
    opts: { bubbles: game.settings?.chatBubbles !== false, body: game.settings?.fpBody !== false, fitGrip: true, vmDepth: true, smoothDt: true, freezeBody: false },
    offs: [], undo: [], t: 0,
  };
  const opts = S.opts;
  const scene = game.scene, camera = game.camera, renderer = game.engine?.renderer;
  const warned = new Set();
  const warn = (k, e) => { if (!warned.has(k)) { warned.add(k); console.warn('fpbody ' + k, e); } };
  const on = (ev, fn) => { const off = game.mods?.on?.(ev, fn); if (off) S.offs.push(off); };

  // ================================================================================================= 1. chat bubbles
  const ents = new Map();               // peer id -> { g (group in the scene), list (newest first), occ, occT, occTarget }
  const emoteSeen = new Map();
  const MAX_STACK = 3, GAP = 0.05, BASE_Y = 2.44;

  function entOf(id) {
    let e = ents.get(id);
    if (!e) { e = { id, g: new THREE.Group(), list: [], occ: 1, occT: 0, occTarget: 1 }; e.g.name = 'chatBubbles'; scene.add(e.g); ents.set(id, e); }
    return e;
  }
  function dropBubble(e, b) {
    e.g.remove(b.sprite); b.tex.dispose(); b.mat.dispose();
  }
  function removeEnt(id) {
    const e = ents.get(id); if (!e) return;
    for (const b of e.list) dropBubble(e, b);
    scene.remove(e.g); ents.delete(id);
  }
  /** Show `text` above crewmate `id`. kind: 'chat' | 'spell' | 'emote'. Returns true when a bubble was created. */
  function say(id, text, kind = 'chat', colorCss) {
    if (S.disposed || !opts.bubbles || !text) return false;
    if (!game.remotes.get(id)) return false;
    try {
      const e = entOf(id);
      const b = makeBubble(text, kind, colorCss);
      b.ttl = clamp(4.2 + b.text.length * 0.045, 5, 9);
      e.list.unshift(b); e.g.add(b.sprite);
      while (e.list.length > MAX_STACK) dropBubble(e, e.list.pop());
      return true;
    } catch (err) { warn('bubble', err); return false; }
  }
  function updateBubbles(dt) {
    if (!opts.bubbles) { for (const id of [...ents.keys()]) removeEnt(id); return; }
    const cam = camera.position;
    for (const r of game.remotes.values()) {          // emote text: a new emote id above the crewmate
      const prev = emoteSeen.get(r.id);
      if (prev === undefined) { emoteSeen.set(r.id, r.emoteNet || null); continue; }
      if ((r.emoteNet || null) !== prev) {
        emoteSeen.set(r.id, r.emoteNet || null);
        if (r.emoteNet && r.emoteDef && !r.dead) say(r.id, `* ${t(r.emoteDef.name)} *`, 'emote');
      }
    }
    for (const id of [...emoteSeen.keys()]) if (!game.remotes.has(id)) emoteSeen.delete(id);
    for (const [id, e] of ents) {
      const r = game.remotes.get(id);
      if (!r || !e.list.length) { if (!r || S.t - (e.idleSince ?? S.t) > 1) removeEnt(id); else e.idleSince ??= S.t; continue; }
      e.idleSince = undefined;
      e.g.position.set(r.pos.x, r.pos.y + BASE_Y, r.pos.z);
      const d = cam.distanceTo(e.g.position);
      const hide = r.dead || d > 25;
      // walls between us and them (cheap ray every 0.3 s; the distance fade below is the fallback)
      e.occT -= dt;
      if (e.occT <= 0 && !hide) { e.occT = 0.3; try { e.occTarget = game.physics.lineOfSight(cam, e.g.position) ? 1 : 0; } catch { e.occTarget = 1; } }
      e.occ = damp(e.occ, e.occTarget, 9, dt);
      const dist = 1 - clamp((d - 17) / 8, 0, 1);
      const k = clamp(d / 7, 1, 2.1);                   // far bubbles grow so they stay readable
      let y = 0;
      for (let i = 0; i < e.list.length; i++) {
        const b = e.list[i];
        b.life += dt;
        const pop = clamp(b.life / 0.14, 0, 1);
        const a = pop * clamp((b.ttl - b.life) / 0.7, 0, 1) * dist * e.occ * (hide ? 0 : 1);
        b.alpha = a;
        b.y = i === 0 && b.life < dt * 1.5 ? y : damp(b.y, y, 14, dt);
        b.sprite.position.set(0, b.y, 0);
        const s = k * (0.86 + 0.14 * pop);
        b.sprite.scale.set(b.w * s, b.h * s, 1);
        b.mat.opacity = a;
        b.sprite.visible = a > 0.02;
        y += b.h * k + GAP;
      }
      for (let i = e.list.length - 1; i >= 0; i--) if (e.list[i].life >= e.list[i].ttl) dropBubble(e, e.list.splice(i, 1)[0]);
    }
  }
  // chat (text was already rewritten to "WORD!" by magic.js for typed incantations, its name gets a star)
  on('chat', (d, from) => {
    try {
      if (!d || typeof d.text !== 'string' || from === game.selfId || d.n === 'TFG') return;
      const spell = typeof d.n === 'string' && d.n.startsWith('✦');
      say(from, spell ? '✦ ' + d.text : d.text, spell ? 'spell' : 'chat');
    } catch (e) { warn('chat', e); }
  });
  // spoken / cast incantations of others arrive as HUD float texts ("✦ FIRE!"): show them in the bubble instead
  const hud = game.ui?.hud;
  if (hud && typeof hud.floatText === 'function') {
    const orig = hud.floatText.bind(hud);
    hud.floatText = (pos, text, color, big) => {
      try {
        if (opts.bubbles && typeof text === 'string' && text.charCodeAt(0) === 0x2726 && pos) {
          let best = null, bd = 0.6;
          for (const r of game.remotes.values()) { const d = Math.hypot(pos.x - r.pos.x, pos.z - r.pos.z); if (d < bd) { bd = d; best = r; } }
          if (best && say(best.id, text, 'spell', typeof color === 'string' ? color : undefined)) return null;
        }
      } catch (e) { warn('float', e); }
      return orig(pos, text, color, big);
    };
    S.undo.push(() => { delete hud.floatText; });
  }

  // ================================================================================================= 2. first-person body
  let body = null;                       // { av, root }
  let bodySuit = null, lookT = 0, crouchW = 0, yawOff = 0, bodyErr = false;
  const _f = new THREE.Vector3();
  function ensureBody() {
    if (body || bodyErr) return body;
    try {
      const prof = game.profile || {};
      const av = createAvatar({ suitColor: suitCol(prof.suit), hat: 'none' });
      av.root.name = 'fpbody';
      av.setLook?.({ suit: prof.suit });
      av.root.traverse((o) => { o.layers.set(FP_LAYER); o.frustumCulled = false; });
      av.root.visible = false;
      scene.add(av.root);
      camera.layers.enable(FP_LAYER);
      body = { av, root: av.root };
      bodySuit = prof.suit;
      // compile the shaders now so the first look down does not hitch
      try { av.root.visible = true; renderer?.compile?.(av.root, camera, scene); } catch { /* optional */ }
      av.root.visible = false;
    } catch (e) { bodyErr = true; warn('body', e); body = null; }
    return body;
  }
  function updateBody(dt) {
    const p = game.player;
    const show = opts.body && p && !p.dead && !game.emotes?.active && !game.cruiser?.seated && game.settings?.fpBody !== false;
    if (!show) { if (body) body.root.visible = false; return; }
    if (!ensureBody()) return;
    const { av, root } = body;
    lookT -= dt;
    if (lookT <= 0) {                     // wardrobe changes (suit colour / outfit)
      lookT = 0.5;
      const prof = game.profile;
      if (prof && prof.suit !== bodySuit) { bodySuit = prof.suit; try { av.setLook?.({ suit: prof.suit }); root.traverse((o) => { o.layers.set(FP_LAYER); o.frustumCulled = false; }); } catch (e) { warn('look', e); } }
    }
    root.visible = true;
    const yaw = p.yaw;
    // legs turn a little towards the strafe direction
    const vx = p.vel.x, vz = p.vel.z, sp = Math.hypot(vx, vz);
    let target = 0;
    if (sp > 0.8 && p.grounded) {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      target = clamp(Math.atan2(vx * rx + vz * rz, Math.abs(vx * fx + vz * fz)), -0.7, 0.7);
    }
    yawOff = damp(yawOff, target, 9, dt);
    _f.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    root.position.set(p.pos.x - _f.x * FP.back, p.pos.y + (p.stepOff || 0), p.pos.z - _f.z * FP.back);
    root.rotation.y = yaw + Math.PI - yawOff;
    crouchW = damp(crouchW, p.crouch ? 1 : 0, 12, dt);
    if (!opts.freezeBody) {
      av.update(dt, {
        speed: Math.min(p.hSpeed || 0, 9), crouch: !!p.crouch, sprint: !!p.sprinting, grounded: p.grounded !== false || (p.airT || 0) < 0.12,
        carry2h: false, holding: false, dead: false, emote: null, swing: 0, lookPitch: 0, climbing: false, time: game.time,
      });
    }
    poseFpBody(av, crouchW);
  }
  /** debug / harness: how much of the body is inside the camera frustum right now */
  function bodyInfo() {
    if (!body) return { built: false };
    const cam = camera; cam.updateMatrixWorld(true);
    const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const vis = (o) => { for (let n = o; n; n = n.parent) if (n.visible === false) return false; return true; };
    let meshes = 0, inView = 0, verts = 0, vin = 0;
    const v = new THREE.Vector3(), m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    body.root.updateMatrixWorld(true);
    const names = [];
    body.root.traverse((o) => {
      if (!o.isMesh || !vis(o)) return;
      meshes++;
      const b = new THREE.Box3().setFromObject(o);
      if (fr.intersectsBox(b)) { inView++; if (names.length < 8) names.push(o.parent?.name || o.name || 'mesh'); }
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); const c = new THREE.Vector4(v.x, v.y, v.z, 1).applyMatrix4(m); verts++; if (c.w > 0.05 && Math.abs(c.x) <= c.w && Math.abs(c.y) <= c.w) vin++; }
    });
    const P = body.av.parts;
    let minD = 9; const cp = cam.getWorldPosition(new THREE.Vector3());
    body.root.traverse((o) => { if (!o.isMesh || !vis(o)) return; const pos = o.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); minD = Math.min(minD, v.distanceTo(cp)); } });
    return { built: true, visible: body.root.visible, meshes, meshesInView: inView, vertsInViewPct: +(100 * vin / Math.max(1, verts)).toFixed(1), headHidden: P.neck ? P.neck.visible === false : P.head?.visible === false, backpackHidden: P.backpack?.visible === false, minCameraDist: +minD.toFixed(3), layer: FP_LAYER, cameraSeesLayer: camera.layers.isEnabled(FP_LAYER), inViewParts: names };
  }

  // ================================================================================================= 3. view model
  const gl = renderer?.getContext?.();
  let ranged = false;
  const inVm = (o) => { for (let n = o; n; n = n.parent) if (n === game.viewModel?.root || n === game._hand) return true; return false; };
  // (a mesh keeps its hooks after the item is dropped: the depth range only applies while it is still part of the view model)
  const vmBefore = function (r, sc, cam) { if (cam === camera && opts.vmDepth && inVm(this)) { gl.depthRange(0, VM_DEPTH); ranged = true; } };
  const vmAfter = function () { if (ranged) { gl.depthRange(0, 1); ranged = false; } };
  function hookDepth(root) {
    if (!gl || !root) return;
    root.traverse((o) => {
      if (o.userData._fpd) return;
      if (o.isMesh || o.isLine || o.isPoints || o.isSprite) { o.userData._fpd = true; o.onBeforeRender = vmBefore; o.onAfterRender = vmAfter; }
    });
  }
  const geomCache = new Map(), fitCache = new Map();
  const keyOf = (it, def) => `${it.type}|${def?.kind}|${def?.hands}|${def?.ranged ? 1 : 0}`;
  /** actions.js refreshHeldVisuals hook: place a held item (visual root parented to the right hand). Returns true when placed. */
  function placeHeld(it, def) {
    if (!opts.fitGrip || S.disposed) return false;
    try {
      const key = keyOf(it, def);
      let fit = fitCache.get(key);
      if (!fit) {
        let geom = geomCache.get(it.type);
        if (!geom) { geom = itemGeom(it.obj); geomCache.set(it.type, geom); }
        fit = fitGrip(geom, def, it.type);
        fitCache.set(key, fit);
      }
      it.obj.position.copy(fit.pos);
      it.obj.quaternion.copy(fit.quat);
      it.obj.userData._fpFit = key;
      hookDepth(it.obj);
      return true;
    } catch (e) { warn('place ' + it.type, e); return false; }
  }
  // [feelfix2] a bulky two-hand item (vending machine, rack, statue, core) is drawn semi-transparent (cloned materials) and a little smaller
  // while it is the held item, so it never blinds the player; everything is restored the moment it is no longer held.
  const cloneMat = (m) => { const c = m.clone(); c.transparent = true; c.opacity = Math.min(m.opacity ?? 1, 0.6); return c; };
  function unghost() {
    const g = S.gh; S.gh = null;
    if (!g) return;
    for (const [m, orig, clone] of g.list) { m.material = orig; for (const c of [].concat(clone)) c.dispose?.(); }
    g.it.obj.scale.copy(g.sc0);
  }
  function ghostTick() {
    const p = game.player;
    const it = p && !p.dead ? p.heldItem?.() : null;
    const fit = it?.obj ? fitCache.get(it.obj.userData?._fpFit) : null;
    const want = fit?.ghost ? it : null;
    if (S.gh && S.gh.it !== want) unghost();
    if (!want || S.gh) return;
    const list = [];
    want.obj.traverse((o) => { if (o.isMesh && o.material) { const clone = Array.isArray(o.material) ? o.material.map(cloneMat) : cloneMat(o.material); list.push([o, o.material, clone]); o.material = clone; } });
    S.gh = { it: want, list, sc0: want.obj.scale.clone() };
    want.obj.scale.setScalar((fit.scale || 1) * S.gh.sc0.x);
  }
  /** view model hand targets (camera space) for the held item, or null */
  function gripOf(it) {
    if (!it || !opts.fitGrip) return null;
    const key = it.obj?.userData?._fpFit;
    return key ? fitCache.get(key)?.grip || null : null;
  }
  /** Remote avatars: keep the item in front of the hand (the old code had the grip offset sign wrong and centred scrap inside the glove). */
  function placeRemoteHeld(it, hand) {
    try {
      const g = it.obj.userData.gripOffset;
      const sz = it.obj.userData.size;
      if (g && g.lengthSq() > 0.0004) { it.obj.position.copy(g).applyQuaternion(it.obj.quaternion); return true; }   // tools: origin = grip
      if (sz) { it.obj.position.set(0, 0.02, -Math.min(0.32, sz.z * 0.5) - 0.03); return true; }
    } catch (e) { warn('remote place', e); }
    return false;
  }
  /** Live check of the item held right now: penetration into the real arm geometry, near-plane / frustum visibility, hand contact. */
  function checkHeld(it) {
    const vm = game.viewModel;
    if (!vm || !it?.obj) return null;
    camera.updateMatrixWorld(true); vm.root.updateMatrixWorld(true); it.obj.updateMatrixWorld(true);
    const inv = camera.matrixWorldInverse;
    const toCam = (o) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const armOf = (hand) => { const el = hand.parent, sh = el?.parent; if (!el || !sh) return null; const h = toCam(hand), e = toCam(el), s = toCam(sh); const w = e.clone().lerp(h, VM_ARM.cuff / VM_ARM.L2); return [{ a: e, b: w, r: VM_ARM.rFore }, { a: s, b: e, r: VM_ARM.rUpper }]; };
    const leftShown = !!vm.handL?.parent?.parent?.parent?.visible;      // hand -> elbow -> shoulder -> base (hidden while the left arm is away)
    const caps = [...(armOf(vm.handR) || []), ...(leftShown ? armOf(vm.handL) || [] : [])];
    const geom = geomCache.get(it.type) || itemGeom(it.obj);
    const m = new THREE.Matrix4().multiplyMatrices(inv, it.obj.matrixWorld);
    const p = new THREE.Vector3(), box = new THREE.Box3();
    let behind = 0, n = 0;
    const pts = geom.pts;
    const camPts = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i += 3) { p.set(pts[i], pts[i + 1], pts[i + 2]).applyMatrix4(m); camPts[i] = p.x; camPts[i + 1] = p.y; camPts[i + 2] = p.z; box.expandByPoint(p); n++; if (p.z > -0.06) behind++; }
    const idq = new THREE.Quaternion(), zero = new THREE.Vector3();
    const pen = penetration(camPts, idq, zero, zero, caps.map((c) => ({ a: c.a, b: c.b, r: c.r })));
    const proj = camera.projectionMatrix;
    const ctr = box.getCenter(new THREE.Vector3()).applyMatrix4(proj);
    let corners = 0;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) { const c = new THREE.Vector3(x, y, z); if (z < -0.05) { c.applyMatrix4(proj); if (Math.abs(c.x) <= 1 && Math.abs(c.y) <= 1) corners++; } }
    const hp = toCam(vm.handR).add(PALM);
    const palm = box.distanceToPoint(hp);
    const fit = fitCache.get(it.obj.userData._fpFit);
    return { type: it.type, cls: fit?.cls || null, penetrationCm: +(pen * 100).toFixed(1), behindNearPct: +(100 * behind / Math.max(1, n)).toFixed(1), centreNdc: [+ctr.x.toFixed(2), +ctr.y.toFixed(2)], cornersInFrustum: corners, palmToItemCm: +(palm * 100).toFixed(1), boxCam: [box.min.toArray().map((v) => +v.toFixed(2)), box.max.toArray().map((v) => +v.toFixed(2))], visibleFlag: it.obj.visible && vm.root.visible };
  }

  // ================================================================================================= 4. smooth movement
  // Frame-time smoothing (makeDtSmoother in fpbody_grip.js): rAF timestamps jitter by a couple of ms, which used to turn 1:1 into camera
  // displacement jitter and into 0 / 1 / 2 fixed physics steps per frame; real hitches pass through untouched.
  const smoother = makeDtSmoother();
  const smoothDt = (raw) => (opts.smoothDt ? smoother(raw) : raw);
  const origUpdate = game.update, hadOwn = Object.prototype.hasOwnProperty.call(game, 'update');
  game.update = function (dt) { return origUpdate.call(game, smoothDt(dt)); };
  S.undo.push(() => { if (hadOwn) game.update = origUpdate; else delete game.update; });

  // ================================================================================================= wiring
  let hookT = 0;
  on('update', (dt) => {
    if (S.disposed) return;
    S.t += dt;
    try { updateBubbles(dt); } catch (e) { warn('bubbles', e); }
    try { updateBody(dt); } catch (e) { warn('bodyUpdate', e); }
    try { ghostTick(); } catch (e) { warn('ghost', e); }
    hookT -= dt;
    if (hookT <= 0) { hookT = 2; try { hookDepth(game.viewModel?.root); hookDepth(game._hand); } catch (e) { warn('hook', e); } }
  });
  try { hookDepth(game.viewModel?.root); } catch (e) { warn('hook0', e); }

  return {
    opts, say, placeHeld, gripOf, placeRemoteHeld, checkHeld, bodyInfo, smoothDt,
    bubbles(id) { const e = ents.get(id); return e ? e.list.map((b) => ({ text: b.text, lines: b.lines.length, kind: b.kind, alpha: +b.alpha.toFixed(2), life: +b.life.toFixed(2), ttl: +b.ttl.toFixed(1), w: +b.w.toFixed(2), h: +b.h.toFixed(2), visible: b.sprite.visible })) : []; },
    bubbleSprites() { let n = 0; scene.traverse((o) => { if (o.isSprite && o.parent?.name === 'chatBubbles') n++; }); return n; },
    get body() { return body; },
    dispose() {
      S.disposed = true;
      try { unghost(); } catch { /* ignore */ }
      for (const off of S.offs) { try { off(); } catch { /* ignore */ } }
      for (const u of S.undo) { try { u(); } catch { /* ignore */ } }
      for (const id of [...ents.keys()]) removeEnt(id);
      if (body) { body.root.removeFromParent(); body.av.dispose?.(); body = null; }
      try { camera.layers.disable(FP_LAYER); } catch { /* ignore */ }
      const un = (root) => root?.traverse((o) => { if (o.userData._fpd) { o.onBeforeRender = THREE.Object3D.prototype.onBeforeRender; o.onAfterRender = THREE.Object3D.prototype.onAfterRender; delete o.userData._fpd; } });
      try { un(game.viewModel?.root); un(game._hand); } catch { /* ignore */ }
      try { gl?.depthRange(0, 1); } catch { /* ignore */ }
    },
  };
}
