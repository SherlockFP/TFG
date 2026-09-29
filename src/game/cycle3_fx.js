// Small shared helpers of module 'cycle3' (meshes only; no game object): disposal, canvas text planes, pulsing glow materials. Lights are never added per object
// (the scene light count is constant): glow = MeshBasicMaterial, real light = one pooled emitter at most (game.lights.add).
import * as THREE from 'three';

export function disposeGroup(g) {
  if (!g) return;
  g.removeFromParent();
  g.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (m) { for (const mm of Array.isArray(m) ? m : [m]) { mm.map?.dispose?.(); mm.dispose?.(); } } });
}
/** a plane with canvas text: draw(ctx, w, h) paints the canvas; returns the mesh (mesh.userData.tex is the texture) */
export function textPlane(wm, hm, cw, ch, draw, opts = {}) {
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  draw(cv.getContext('2d'), cw, ch);
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(wm, hm), new THREE.MeshBasicMaterial({ map: tex, transparent: !!opts.transparent, side: opts.double ? THREE.DoubleSide : THREE.FrontSide }));
  m.userData.tex = tex;
  return m;
}
/** wrap `text` to lines of at most `max` px in ctx font */
export function wrapLines(ctx, text, max) {
  const words = String(text).split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}
export const lambert = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
export const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });
export function box(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }
