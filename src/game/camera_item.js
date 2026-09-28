// Instant Camera (item 'instacam', registered in creatures_wave1.js). LMB takes a photo:
//   - white flash (reuses the ItemTools 'itool' flash fx: pooled light + blind for crewmates in front),
//   - the photo is rendered from the real camera into a small render target and slides onto the HUD as a
//     polaroid for a few seconds,
//   - every mimic in frame (the Doppel and the built-in Deepfake) is drawn in its TRUE FORM (black stretched
//     silhouette + glitch slices) and the host reveals it (outline + '???' name tag) and stuns it for 3 s;
//     other creatures close to the lens are dazzled for a moment.
// Host request: 'hcam' { ids: [mimic creature ids], daze: [creature ids] } (validated: type, range).
import * as THREE from 'three';
import { t, tf, addTranslations } from '../core/i18n.js';
import { MOONS } from './moons.js';

addTranslations({
  'Out of film.': 'Film bitti.',
  "IT'S NOT {name}": '{name} DEĞİL',
  'That is not {name}!': 'Bu {name} değil!',
  'Something is wrong with this photo...': 'Bu fotoğrafta bir terslik var...',
});

const PW = 208, PH = 208;          // photo resolution (PSX-ish)
const FW = PW + 20, FH = PH + 64;  // polaroid frame
const STYLE_ID = 'horde-polaroid-style';
const CSS = `
.hpola{position:fixed;right:34px;bottom:118px;width:${FW}px;height:${FH}px;z-index:30;pointer-events:none;display:none;
  transform:translateX(150%) rotate(14deg);filter:drop-shadow(0 8px 14px rgba(0,0,0,.6))}
.hpola canvas{width:100%;height:100%;image-rendering:pixelated}
`;
// slide in (ease-out-back) -> hold -> drop out; the photo develops over 1.8 s. Driven from the game loop (update(),
// game clock), not CSS transitions, so it also plays in throttled / headless pages.
const easeOutBack = (k) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;

export function installCamera(game) {
  let rt = null, cam = null, buf = null, el = null, canvas = null, lastT = -9, disposed = false, anim = null;
  const offs = [];
  const silMat = new THREE.MeshBasicMaterial({ color: '#050506' });
  const api = { lastPhoto: null, lastInFrame: [], takePhoto, update: animate, dispose, get showing() { return !!anim; } };

  function ensureDom() {
    if (el || typeof document === 'undefined') return;
    if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); }
    el = document.createElement('div');
    el.className = 'hpola';
    el.style.pointerEvents = 'none';   // '#ui > *' would re-enable it
    canvas = document.createElement('canvas');
    canvas.width = FW; canvas.height = FH;
    el.appendChild(canvas);
    (document.getElementById('ui') || document.body).appendChild(el);
  }
  const isMimic = (v) => v && v.state !== 'dead' && (v.type === 'mimic' || v.hType === 'doppel' || v.type === 'doppel');

  function takePhoto(it) {
    if (disposed) return null;
    const now = game.time || 0;
    if (now - lastT < 1.1) return null;
    if (it && (it.charges ?? 0) <= 0) { game.ui?.toast(t('Out of film.'), 'info'); game.sfx?.('battery_dead', 0.5); return null; }
    lastT = now;
    if (it) { it.charges = (it.charges ?? 1) - 1; game.net?.broadcast('itst', { id: it.id, c: it.charges }); }
    const eye = game.camera.getWorldPosition(new THREE.Vector3());
    const q = game.camera.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    if (!cam) cam = new THREE.PerspectiveCamera(60, 1, 0.05, 400);
    cam.fov = Math.min(75, game.camera.fov || 70); cam.near = game.camera.near; cam.far = game.camera.far;
    cam.position.copy(eye); cam.quaternion.copy(q);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    // who is in frame (projected box in photo pixels)
    const inFrame = [];
    const tmp = new THREE.Vector3();
    for (const v of game.creatures?.views?.values() || []) {
      if (v.state === 'dead' || v.hidden || !v.root?.visible) continue;
      const h = v.height || 1.5, r = v.radius || 0.4;
      const c = tmp.set(v.pos.x, v.pos.y + h * 0.55, v.pos.z);
      const dist = c.distanceTo(eye);
      if (dist > 34) continue;
      const ndc = c.clone().project(cam);
      if (ndc.z > 1 || Math.abs(ndc.x) > 1.08 || Math.abs(ndc.y) > 1.08) continue;
      if (!game.physics.lineOfSight(eye, c)) continue;
      const top = new THREE.Vector3(v.pos.x, v.pos.y + h + 0.1, v.pos.z).project(cam), bot = new THREE.Vector3(v.pos.x, v.pos.y, v.pos.z).project(cam);
      const side = new THREE.Vector3(r, 0, 0).applyQuaternion(q).add(v.pos).project(cam);
      const cx = (ndc.x * 0.5 + 0.5) * PW, hw = Math.max(6, Math.abs(side.x - bot.x) * 0.5 * PW * 1.6);
      const y0 = (1 - (top.y * 0.5 + 0.5)) * PH, y1 = (1 - (bot.y * 0.5 + 0.5)) * PH;
      inFrame.push({ v, id: v.id, mimic: isMimic(v), dist, box: [cx - hw, Math.min(y0, y1), cx + hw, Math.max(y0, y1)] });
    }
    api.lastInFrame = inFrame.map((f) => ({ id: f.id, type: f.v.hType || f.v.type, mimic: f.mimic, dist: +f.dist.toFixed(1) }));
    let photo = null;
    try { photo = renderPhoto(inFrame); } catch (e) { console.warn('[camera] photo', e); }
    if (photo) showPolaroid(photo, inFrame);
    // flash (everyone sees the light; crewmates in front get dazzled) + host reveal / daze
    game.net?.broadcast('fx', { k: 'itool', t: 'flash', p: eye.toArray(), d: fwd.toArray(), by: game.selfId });
    game.engine.flash(0xffffff, 0.5);
    game.sfx?.('ui_click', 0.6);
    const ids = inFrame.filter((f) => f.mimic).map((f) => f.id);
    const daze = inFrame.filter((f) => !f.mimic && f.dist < 7 && !f.v.def?.boss && !f.v.def?.hazard).map((f) => f.id);
    if (ids.length || daze.length) game.net?.request('hcam', { ids, daze });
    return api.lastInFrame;
  }

  // -------------------------------------------------------------- render + develop
  function renderPhoto(inFrame) {
    const r = game.engine?.renderer, scene = game.scene;
    if (!r || !scene || typeof document === 'undefined') return null;
    if (!rt) {
      rt = new THREE.WebGLRenderTarget(PW, PH, { depthBuffer: true });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      buf = new Uint8Array(PW * PH * 4);
    }
    // true forms: mimics become stretched black silhouettes, their name tags vanish
    const swaps = [], scales = [];
    for (const f of inFrame) {
      if (!f.mimic) continue;
      scales.push([f.v.root, f.v.root.scale.clone()]);
      f.v.root.scale.multiply(new THREE.Vector3(0.82, 1.24, 0.82));
      f.v.root.traverse((o) => {
        if (o.isSprite) { swaps.push([o, null, o.visible]); o.visible = false; }
        else if (o.isMesh) { swaps.push([o, o.material]); o.material = silMat; }
      });
    }
    const L = game.lights;
    const prev = { rt: r.getRenderTarget(), camVis: game.camera.visible, ai: L?.ambient?.intensity, hi: L?.hemi?.intensity, ac: L?.ambient?.color.clone() };
    try {
      if (L?.ambient) { L.ambient.intensity = Math.max(prev.ai, 0.75); L.ambient.color.set(0xfff2e0); }   // the flash lights the scene
      if (L?.hemi) L.hemi.intensity = Math.max(prev.hi, 0.6);
      game.camera.visible = false;   // hides the view model / held item (children of the main camera)
      r.setRenderTarget(rt);
      r.clear();
      r.render(scene, cam);
      r.readRenderTargetPixels(rt, 0, 0, PW, PH, buf);
    } finally {
      r.setRenderTarget(prev.rt);
      game.camera.visible = prev.camVis;
      if (L?.ambient) { L.ambient.intensity = prev.ai; L.ambient.color.copy(prev.ac); }
      if (L?.hemi) L.hemi.intensity = prev.hi;
      for (const [o, m, vis] of swaps) { if (m) o.material = m; else o.visible = vis; }
      for (const [root, s] of scales) root.scale.copy(s);
    }
    // develop: flip rows, warm instant-film grade, vignette, grain
    const pc = document.createElement('canvas'); pc.width = PW; pc.height = PH;
    const ctx = pc.getContext('2d');
    const img = ctx.createImageData(PW, PH);
    const o = img.data;
    for (let y = 0; y < PH; y++) {
      const src = (PH - 1 - y) * PW * 4, dst = y * PW * 4;
      for (let x = 0; x < PW; x++) {
        const i = src + x * 4, j = dst + x * 4;
        const dx = x / PW - 0.5, dy = y / PH - 0.5, vig = 1 - Math.min(0.55, (dx * dx + dy * dy) * 1.5);
        const n = (Math.random() - 0.5) * 16;
        o[j] = Math.min(255, (buf[i] * 1.08 + 10) * vig + n);
        o[j + 1] = Math.min(255, (buf[i + 1] * 1.0 + 5) * vig + n);
        o[j + 2] = Math.min(255, (buf[i + 2] * 0.86) * vig + n);
        o[j + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // glitch the true forms: sliced, RGB split, static
    for (const f of inFrame) {
      if (!f.mimic) continue;
      const [x0, y0, x1, y1] = f.box.map((v) => Math.round(v));
      const w = Math.max(4, x1 - x0), h = Math.max(4, y1 - y0);
      for (let k = 0; k < 14; k++) {
        const sy = y0 + Math.random() * h, sh = 2 + Math.random() * 6, dx = (Math.random() - 0.5) * w * 0.9;
        ctx.drawImage(pc, x0, sy, w, sh, x0 + dx, sy, w, sh);
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,0,70,0.28)'; ctx.fillRect(x0 - 4, y0, w, h);
      ctx.fillStyle = 'rgba(0,255,220,0.22)'; ctx.fillRect(x0 + 4, y0 + 2, w, h);
      ctx.globalCompositeOperation = 'source-over';
      for (let k = 0; k < 120; k++) { const g = (Math.random() * 255) | 0; ctx.fillStyle = `rgba(${g},${g},${g},0.6)`; ctx.fillRect(x0 + Math.random() * w, y0 + Math.random() * h, 2, 1); }
      ctx.fillStyle = '#ff2a3a'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
      ctx.fillText('???', x0 + w / 2, Math.max(14, y0 - 3));
    }
    return pc;
  }

  function showPolaroid(pc, inFrame) {
    ensureDom();
    if (!el) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f1ece0'; ctx.fillRect(0, 0, FW, FH);
    ctx.fillStyle = 'rgba(0,0,0,0.06)'; for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * FW, Math.random() * FH, 2, 2);
    ctx.fillStyle = '#111'; ctx.fillRect(9, 9, PW + 2, PH + 2);
    ctx.drawImage(pc, 10, 10);
    const mim = inFrame.find((f) => f.mimic);
    ctx.textAlign = 'center';
    if (mim) {
      const nm = (mim.v.name && mim.v.name !== '???' ? mim.v.name : t('crewmate')).toUpperCase().slice(0, 16);
      ctx.fillStyle = '#b3101c'; ctx.font = 'bold 18px VT323, monospace';
      ctx.fillText(tf("IT'S NOT {name}", { name: nm }), FW / 2, PH + 36);
      ctx.fillStyle = '#6a5a4a'; ctx.font = '13px VT323, monospace'; ctx.fillText(t('Something is wrong with this photo...'), FW / 2, PH + 54);
    } else {
      const run = game.run || {};
      const tm = Math.round(run.time ?? 480), hh = String(Math.floor(tm / 60) % 24).padStart(2, '0'), mm = String(tm % 60).padStart(2, '0');
      ctx.fillStyle = '#3a3440'; ctx.font = '18px VT323, monospace';
      ctx.fillText(`${MOONS[run.moon]?.short || 'TFG'} · ${hh}:${mm}`, FW / 2, PH + 40);
    }
    try { api.lastPhoto = canvas.toDataURL('image/png'); } catch { api.lastPhoto = null; }
    anim = { t0: game.time || 0 };
    animate();
  }
  function animate() {
    if (!el || !anim) return;
    const t = (game.time || 0) - anim.t0;   // game clock: real time in play, consistent with kefal.tick in harnesses
    let x = 0, y = 0, rot = -4;
    if (t < 0.5) { const k = easeOutBack(t / 0.5); x = 150 * (1 - k); rot = 14 - 18 * k; }
    else if (t > 5.6) { const k = Math.min(1, (t - 5.6) / 0.6) ** 2; y = 160 * k; rot = -4 + 14 * k; }
    if (t > 6.3) { el.style.display = 'none'; el.classList.remove('in'); anim = null; return; }
    el.style.display = 'block';
    el.classList.add('in');
    el.style.transform = `translate(${x.toFixed(1)}%, ${y.toFixed(1)}%) rotate(${rot.toFixed(2)}deg)`;
    const dev = Math.min(1, t / 1.8);
    canvas.style.filter = dev >= 1 ? 'none' : `brightness(${(2.4 - 1.4 * dev).toFixed(2)}) contrast(${(0.35 + 0.65 * dev).toFixed(2)}) sepia(${(0.7 * (1 - dev)).toFixed(2)})`;
  }

  // -------------------------------------------------------------- host
  function hostHandle(d, from) {
    const g = game, M = g.creatures;
    const pos = from === g.selfId ? g.player.pos : g.remotes.get(from)?.pos;
    if (!pos || !d || typeof d !== 'object') return;
    for (const id of (Array.isArray(d.ids) ? d.ids : []).slice(0, 6)) {
      const c = M.host.get(id);
      if (!c || c.dead || (c.type !== 'doppel' && c.type !== 'mimic') || c.pos.distanceTo(pos) > 36) continue;
      c.data.revealed = true;
      c.stunT = Math.max(c.stunT || 0, 3);
      c.setState('stunned');
      c.extra = c.type === 'doppel' ? 'R:' + (c.data.victim || '') : 'R';
      const nm = c.type === 'doppel' ? g.playerName(c.data.victim) : c.name;
      g.net.broadcast('fx', { k: 'hreveal', id: c.id, by: from, nm: nm || '' });
      g.net.broadcast('xp', { to: from, xp: 40, reason: 'Mimic exposed' });
    }
    for (const id of (Array.isArray(d.daze) ? d.daze : []).slice(0, 8)) {
      const c = M.host.get(id);
      if (!c || c.dead || c.def?.boss || c.def?.hazard || c.maxHp === null || c.pos.distanceTo(pos) > 8.5) continue;
      c.stunT = Math.max(c.stunT || 0, 0.7);
      c.setState('stunned');
    }
  }

  const mods = game.mods;
  if (mods?.on) {
    offs.push(mods.on('useItem', (it, hk, g) => { if (g === game && it && !hk.handled && it.type === 'instacam') { hk.handled = true; takePhoto(it); } }));
    offs.push(mods.on('registerHandlers', (H, g) => { if (g === game) H('hcam', hostHandle); }));
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const off of offs) { try { off(); } catch { /* ignore */ } }
    anim = null;
    rt?.dispose(); rt = null;
    silMat.dispose();
    el?.remove(); el = null;
  }
  return api;
}
