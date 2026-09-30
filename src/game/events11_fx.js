// FACILITY CRISES (wave 11, module 'events11') - looks and sounds: hack terminal, breaker panel, water volume, door straps, trending tag, screen tints, procedural sounds.
// Everything is emissive / basic material: no scene lights are ever added (the light count stays constant).
import * as THREE from 'three';
import { edgeCells } from './events11_core.js';

const TAU = Math.PI * 2;
const lcg = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const mat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const bas = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); q.position.set(x, y, z); return q; };

// ------------------------------------------------------------------------------------------------ sounds (registered through the mod API, rendered on demand)
export const SOUNDS = {
  // 2 s seamless loop: a mains hum with a cracking arc on top (the live breaker panels)
  ev_buzz: (sr) => {
    const n = Math.floor(sr * 2), out = new Float32Array(n), r = lcg(11);
    let hold = 0, held = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if (hold-- <= 0) { held = r() * 2 - 1; hold = 2 + Math.floor(r() * 9); }
      const arc = Math.sin(TAU * 4 * t) > 0.72 ? held * 0.34 : 0;
      out[i] = (Math.sin(TAU * 100 * t) * 0.32 + Math.sin(TAU * 200 * t) * 0.2 + Math.sin(TAU * 300 * t) * 0.1 + arc) * 0.6;
    }
    return out;
  },
  // 1.6 s two-tone security klaxon (loops)
  ev_klaxon: (sr) => {
    const n = Math.floor(sr * 1.6), out = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, f = t < 0.8 ? 640 : 480;
      ph += TAU * f / sr;
      const gate = Math.min(1, (t % 0.8) * 90) * Math.min(1, (0.8 - (t % 0.8)) * 60);
      out[i] = (Math.sin(ph) * 0.5 + Math.sin(ph * 2) * 0.18 + Math.sign(Math.sin(ph)) * 0.08) * gate * 0.7;
    }
    return out;
  },
  ev_beep: (sr) => {
    const n = Math.floor(sr * 0.11), out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.sin(TAU * 1320 * i / sr) * Math.min(1, i / 60) * Math.max(0, 1 - i / n) * 0.5;
    return out;
  },
  // a hack completing: three rising chirps into a chord
  ev_done: (sr) => {
    const n = Math.floor(sr * 0.9), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const chirp = t < 0.3 ? Math.sin(TAU * (600 + Math.floor(t / 0.1) * 300) * t) * 0.4 : 0;
      const chord = t >= 0.3 ? (Math.sin(TAU * 523 * t) + Math.sin(TAU * 659 * t) * 0.8 + Math.sin(TAU * 784 * t) * 0.6) * 0.16 * Math.max(0, 1 - (t - 0.3) / 0.6) : 0;
      out[i] = (chirp + chord) * Math.min(1, t * 200);
    }
    return out;
  },
  // wrong breaker: crackle, a falling thud
  ev_surge: (sr) => {
    const n = Math.floor(sr * 0.8), out = new Float32Array(n), r = lcg(5);
    let hold = 0, held = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, k = i / n;
      if (hold-- <= 0) { held = r() * 2 - 1; hold = 1 + Math.floor(r() * 14 * k); }
      out[i] = (held * 0.5 * (1 - k) + Math.sin(TAU * (180 - 130 * k) * t) * 0.45 * Math.max(0, 1 - k * 1.3)) * Math.min(1, t * 300);
    }
    return out;
  },
  // 2 s loop of deep moving water
  ev_rumble: (sr) => {
    const n = Math.floor(sr * 2), out = new Float32Array(n), r = lcg(23);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      lp += (((r() * 2 - 1) * 0.9) - lp) * 0.02;
      out[i] = (lp * 1.3 + Math.sin(TAU * 41 * t) * 0.16 + Math.sin(TAU * 2 * t) * lp * 0.4) * 0.8;
    }
    return out;
  },
  // notification ping (a viral moment picks somebody): two bright blips
  ev_ping: (sr) => {
    const n = Math.floor(sr * 0.7), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr, f = t < 0.14 ? 1318 : t < 0.42 ? 1975 : 0;
      const env = t < 0.14 ? Math.max(0, 1 - t / 0.14) : t < 0.42 ? Math.max(0, 1 - (t - 0.14) / 0.28) : 0;
      out[i] = f ? (Math.sin(TAU * f * t) * 0.4 + Math.sin(TAU * f * 2 * t) * 0.1) * env : 0;
    }
    return out;
  },
};

// ------------------------------------------------------------------------------------------------ small canvas helpers
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(c);
  tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

// ------------------------------------------------------------------------------------------------ the hack terminal
const SCREEN = { idle: ['#3a0808', '#ff4030', 'BREACH', 'HOLD E'], work: ['#3a2c06', '#ffc830', 'HACK', '...'], done: ['#06301a', '#40ff90', 'SECURE', 'OK'] };
export function createTerminalModel() {
  const root = new THREE.Group();
  const dark = mat(0x22262c), trim = mat(0x3a4048);
  root.add(box(0.8, 0.12, 0.62, dark, 0, 0.06, 0));
  root.add(box(0.56, 1.0, 0.4, trim, 0, 0.62, 0));
  const screenMats = {};
  for (const k of Object.keys(SCREEN)) {
    const [bg, fg, l1, l2] = SCREEN[k];
    screenMats[k] = new THREE.MeshBasicMaterial({ map: canvasTex(64, 48, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = 'bold 15px monospace'; g.textAlign = 'center'; g.fillText(l1, w / 2, 21); g.font = '11px monospace'; g.fillText(l2, w / 2, 37); g.fillRect(4, 4, w - 8, 2); g.fillRect(4, h - 6, w - 8, 2); }) });
  }
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.34), screenMats.idle);
  screen.position.set(0, 0.86, 0.205); screen.rotation.x = -0.18;
  root.add(screen);
  const lampMat = bas(0xff3020);
  const lamp = box(0.14, 0.1, 0.14, lampMat, 0, 1.17, 0);
  root.add(lamp);
  root.add(box(0.46, 0.06, 0.32, dark, 0, 1.16, 0.02));
  let state = 'idle';
  const api = {
    root, anchor: 1.0,
    setState(s) { if (s === state || !screenMats[s]) return; state = s; screen.material = screenMats[s]; lampMat.color.setHex(s === 'done' ? 0x40ff90 : s === 'work' ? 0xffc830 : 0xff3020); },
    tick(dt, time) { if (state === 'idle') lampMat.color.setHex(Math.sin(time * 6) > 0 ? 0xff3020 : 0x501008); },
    dispose() { root.traverse((o) => { o.geometry?.dispose?.(); }); for (const m of Object.values(screenMats)) { m.map?.dispose(); m.dispose(); } },
  };
  return api;
}

// ------------------------------------------------------------------------------------------------ the breaker panel (load bars, lever, status lamp)
export function createBreakerModel(load) {
  const root = new THREE.Group();
  const dark = mat(0x2a2e34), trim = mat(0x494f58);
  root.add(box(1.0, 1.6, 0.26, dark, 0, 0.9, 0));
  root.add(box(0.86, 1.46, 0.05, trim, 0, 0.9, 0.14));
  // three load bars (lit = the load number) so the order can be read at a glance
  const barOn = [], bars = [];
  for (let i = 0; i < 3; i++) {
    const m = bas(0x2a2418);
    bars.push(m);
    root.add(box(0.5 - i * 0.0, 0.07, 0.03, m, 0, 1.44 - i * 0.12, 0.17));
    barOn.push(i < load);
  }
  const litHex = 0xffb030;
  bars.forEach((m, i) => m.color.setHex(barOn[2 - i] ? litHex : 0x2a2418));   // bar 0 is the top one: the fullest panel lights all three
  // lever slot + lever
  root.add(box(0.14, 0.62, 0.04, mat(0x0d0f12), 0, 0.72, 0.17));
  const lever = box(0.2, 0.2, 0.1, mat(0xd8d0c0), 0, 0.5, 0.22);
  root.add(lever);
  const lampMat = bas(0xff3020);
  root.add(box(0.2, 0.14, 0.06, lampMat, 0, 0.22, 0.17));
  let up = false, flash = 0;
  const api = {
    root, anchor: 1.0,
    setUp(v) { up = !!v; },
    surge() { flash = 0.9; },
    tick(dt, time, live) {
      const k = up ? 0.94 : 0.5;
      lever.position.y += (k - lever.position.y) * Math.min(1, dt * 12);
      flash = Math.max(0, flash - dt);
      if (flash > 0) lampMat.color.setHex(Math.sin(time * 40) > 0 ? 0xffffff : 0xff2010);
      else lampMat.color.setHex(up ? 0x40ff90 : live ? (Math.sin(time * 7) > 0 ? 0xff3020 : 0x601008) : 0x601008);
    },
    dispose() { root.traverse((o) => { o.geometry?.dispose?.(); }); },
  };
  return api;
}

// ------------------------------------------------------------------------------------------------ the water volume
let rippleTex = null;
function ripple() {
  if (rippleTex) return rippleTex;
  const r = lcg(3);
  rippleTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#5b8f96'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) { g.fillStyle = r() < 0.5 ? '#78b1b6' : '#43737c'; const x = r() * w, y = r() * h; g.fillRect(x, y, 4 + r() * 12, 1 + (r() < 0.3 ? 1 : 0)); }
  });
  rippleTex.wrapS = rippleTex.wrapT = THREE.RepeatWrapping;
  return rippleTex;
}
/** One merged mesh: a top sheet over every basin cell at local y = 1 + a curtain (y 0..1) on every open edge where the water meets a dry cell.
 *  mesh.scale.y = the water height, mesh.position.y = the floor: the surface follows the level with one uniform write. */
export function createWaterMesh(L, basin, edges, floorY) {
  const pos = [], uv = [], idx = [], C = L.cell;
  const quad = (a, b, c, d, ua, ub, uc, ud) => { const o = pos.length / 3; pos.push(...a, ...b, ...c, ...d); uv.push(...ua, ...ub, ...uc, ...ud); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  for (const c of basin) {
    const x0 = L.ox + (c % L.w) * C, z0 = L.oz + ((c / L.w) | 0) * C, x1 = x0 + C, z1 = z0 + C, s = 0.25;
    quad([x0, 1, z0], [x0, 1, z1], [x1, 1, z1], [x1, 1, z0], [x0 * s, z0 * s], [x0 * s, z1 * s], [x1 * s, z1 * s], [x1 * s, z0 * s]);
  }
  for (const e of edges) {
    const [a, b] = edgeCells(e.key, L.w);
    const cell = Math.min(a, b), horiz = (e.key & 1) === 1;   // dir 1 = the +z neighbour: the edge runs along x
    const x0 = L.ox + (cell % L.w) * C, z0 = L.oz + ((cell / L.w) | 0) * C;
    const mid = 0.5;
    if (horiz) quad([x0, 0, z0 + C], [x0, 1, z0 + C], [x0 + C, 1, z0 + C], [x0 + C, 0, z0 + C], [0, 0], [0, mid], [1, mid], [1, 0]);
    else quad([x0 + C, 0, z0], [x0 + C, 1, z0], [x0 + C, 1, z0 + C], [x0 + C, 0, z0 + C], [0, 0], [0, mid], [1, mid], [1, 0]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const map = ripple().clone(); map.needsUpdate = true; map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const m = new THREE.MeshBasicMaterial({ map, color: 0x9fc4c8, transparent: true, opacity: 0.66, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.y = floorY; mesh.scale.y = 0.001; mesh.renderOrder = 3; mesh.frustumCulled = false;
  return {
    mesh,
    setLevel(h, time) { mesh.visible = h > 0.02; mesh.scale.y = Math.max(0.001, h); map.offset.set(time * 0.03, time * 0.019); },
    dispose() { mesh.removeFromParent(); geo.dispose(); m.dispose(); map.dispose(); },
  };
}

// ------------------------------------------------------------------------------------------------ door straps (sealed doors)
export function createSealStraps(doors, floorY) {
  const geo = new THREE.BoxGeometry(1, 0.1, 0.42), m = bas(0xff3020), m2 = bas(0x200806);
  const group = new THREE.Group(), byId = new Map();
  for (const d of doors) {
    const g = new THREE.Group();
    g.position.set(d.pos.x, floorY ?? d.pos.y, d.pos.z);
    g.rotation.y = d.rotY || 0;
    const w = Math.max(0.8, (d.width || 1.35) - 0.06);
    for (const h of [0.75, 1.65]) { const s = new THREE.Mesh(geo, m); s.scale.x = w; s.position.y = h; g.add(s); const s2 = new THREE.Mesh(geo, m2); s2.scale.set(w * 1.02, 1.5, 1.02); s2.position.y = h; g.add(s2); }
    group.add(g); byId.set(d.id, g);
  }
  return {
    group,
    free(id) { const g = byId.get(id); if (g) { g.removeFromParent(); byId.delete(id); } },
    tick(time) { m.color.setHex(Math.sin(time * 5) > -0.2 ? 0xff3020 : 0x8a1a10); },
    dispose() { group.removeFromParent(); geo.dispose(); m.dispose(); m2.dispose(); },
  };
}

// ------------------------------------------------------------------------------------------------ the TRENDING tag (a billboard over the chosen player)
export function createTrendTag(label) {
  const tex = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#ff2f8a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#12020a'; g.fillRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#ff5fa8'; g.font = 'bold 30px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('▲ ' + label, w / 2, h / 2 + 2);
  });
  const sm = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sp = new THREE.Sprite(sm);
  sp.scale.set(1.7, 0.42, 1); sp.renderOrder = 20;
  return { sprite: sp, dispose() { sp.removeFromParent(); tex.dispose(); sm.dispose(); } };
}

// ------------------------------------------------------------------------------------------------ screen tints (DOM, below the HUD dock)
export function createOverlays() {
  if (typeof document === 'undefined') return null;
  const st = document.createElement('style');
  st.textContent = '.ev11-ov{position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;transition:opacity .25s linear}'
    + '.ev11-wet{background:radial-gradient(ellipse at 50% 60%,rgba(30,90,96,.35),rgba(8,40,52,.72))}'
    + '.ev11-dark{background:radial-gradient(ellipse at 50% 50%,rgba(20,10,0,0) 30%,rgba(18,8,0,.75) 100%)}'
    + '.ev11-vir{box-shadow:inset 0 0 110px 14px rgba(255,47,138,.55)}'
    + '@keyframes ev11p{0%,100%{opacity:var(--a)}50%{opacity:calc(var(--a)*.55)}}.ev11-vir.on{animation:ev11p 1.1s ease-in-out infinite}';
  document.head.appendChild(st);
  const mk = (cls) => { const d = document.createElement('div'); d.className = 'ev11-ov ' + cls; (document.getElementById('ui') || document.body).appendChild(d); return d; };
  const wet = mk('ev11-wet'), dark = mk('ev11-dark'), vir = mk('ev11-vir');
  return {
    wet(k) { wet.style.opacity = String(Math.max(0, Math.min(1, k))); },
    dark(k) { dark.style.opacity = String(Math.max(0, Math.min(1, k))); },
    viral(on) { vir.style.setProperty('--a', '1'); vir.style.opacity = on ? '1' : '0'; vir.classList.toggle('on', !!on); },
    dispose() { wet.remove(); dark.remove(); vir.remove(); st.remove(); },
  };
}
