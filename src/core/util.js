import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export function dampAngle(a, b, lambda, dt) { return a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt)); }

export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
export function dist3(a, b) { const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }

export function fmtMoney(v) { return '▮' + Math.round(v).toLocaleString('en-US'); }

export function fmtClock(minutes) {
  // minutes since 00:00
  let h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  let hh = h % 12; if (hh === 0) hh = 12;
  return `${hh}:${String(Math.floor(m / 5) * 5).padStart(2, '0')} ${ampm}`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Round numbers for compact network payloads
export const r2 = (v) => Math.round(v * 100) / 100;
export const r3 = (v) => Math.round(v * 1000) / 1000;

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.();
  });
}

const _box = new THREE.Box3();
export function boundsOf(obj) {
  _box.makeEmpty();
  obj.updateMatrixWorld(true);
  _box.setFromObject(obj);
  return _box.clone();
}

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return e;
}

/** English indefinite article for a noun: aAn("Enforcer") -> "an", aAn("Medic") -> "a". */
export const aAn = (w) => (/^[aeiou]/i.test(String(w || "")) ? "an" : "a");
