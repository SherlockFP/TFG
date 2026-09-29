// Prelude prepended to every wave4_checkup step (see wave4_checkup_run.mjs). Declares helpers in the step's scope.
const g = kefal.game;
if (!window.__ckErrs) {
  window.__ckErrs = [];
  addEventListener('error', (e) => window.__ckErrs.push('E: ' + e.message));
  addEventListener('unhandledrejection', (e) => window.__ckErrs.push('R: ' + String(e.reason?.stack || e.reason).slice(0, 300)));
  const ce = console.error; console.error = (...a) => { window.__ckErrs.push('console.error: ' + a.map((x) => String(x?.stack || x)).join(' ').slice(0, 400)); ce(...a); };
}
const errs = window.__ckErrs;
const errMark = errs.length;
const newErrs = () => [...new Set(errs.slice(errMark))].slice(0, 20);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (n = 10, render = false, dt = 1 / 30) => { kefal.tick(n, dt, render); await sleep(4); };
const r1 = (x) => Math.round(x * 10) / 10;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const shot = async (n) => { kefal.tick(1, 1 / 60, true); try { if (window.__shot) await window.__shot(n); } catch (e) { /* */ } };
const key = (code, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true }));
const press = async (code) => { key(code, 'keydown'); await tick(1); key(code, 'keyup'); await tick(1); };
const finite = (v) => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const junk = (s) => { const m = String(s || '').match(/undefined|NaN|\[object|null\b|\{\{|\$\{/g); return m ? [...new Set(m)] : null; };
const nanScan = (tag) => {
  const bad = [];
  if (!finite(g.player.pos)) bad.push(tag + ': player pos ' + JSON.stringify(g.player.pos));
  for (const c of g.creatures.host.values()) if (!finite(c.pos)) bad.push(tag + ': creature ' + c.type + ' pos');
  for (const v of g.creatures.views?.values?.() || []) if (v.obj && !finite(v.obj.position)) bad.push(tag + ': cview ' + v.type);
  for (const it of g.items.all()) if (it.obj && !finite(it.obj.position)) bad.push(tag + ': item ' + it.type + ' pos');
  if (!Number.isFinite(g.player.hp)) bad.push(tag + ': hp ' + g.player.hp);
  if (!Number.isFinite(g.run.credits)) bad.push(tag + ': credits');
  const cam = kefal.engine.camera; if (!finite(cam.position)) bad.push(tag + ': camera');
  return bad;
};
const desc = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.dataset?.dockId ? '[' + el.dataset.dockId + ']' : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
const isHidden = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05 || e.classList.contains('hidden')) return true; } return false; };
// overlapping visible text leaves inside root (text-bearing elements whose boxes intersect and neither contains the other)
const textOverlaps = (root = document.getElementById('ui'), minArea = 40) => {
  if (!root) return [];
  const leaves = [...root.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.textContent || '').trim() && !isHidden(e));
  const L = leaves.map((el) => ({ el, r: el.getBoundingClientRect() })).filter((x) => x.r.width > 2 && x.r.height > 2 && x.r.bottom > 0 && x.r.top < innerHeight);
  const hits = [];
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j];
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 3 && h > 3 && w * h > minArea) hits.push({ a: desc(a.el) + ' "' + a.el.textContent.trim().slice(0, 24) + '"', b: desc(b.el) + ' "' + b.el.textContent.trim().slice(0, 24) + '"', area: Math.round(w * h) });
    if (hits.length > 25) return hits;
  }
  return hits;
};
const offscreen = (root) => [...(root || document.getElementById('ui')).querySelectorAll('*')].filter((e) => !isHidden(e) && (e.textContent || '').trim()).map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.width > 4 && (r.right > innerWidth + 2 || r.bottom > innerHeight + 2 || r.left < -2 || r.top < -2)).slice(0, 8).map(({ e, r }) => desc(e) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
const stats = () => { kefal.tick(1, 1 / 30, true); const i = kefal.engine.renderer.info; return { ...(kefal.engine.sceneStats || {}), calls: kefal.engine.sceneStats?.calls ?? i.render.calls, tris: kefal.engine.sceneStats?.tris ?? i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, progs: i.programs?.length }; };
const land = async (moon, ticks = 20) => {
  g.ui.closePanel?.();
  g.run.daysLeft = Math.max(1, g.run.daysLeft || 3); g.run.moon = moon; g.player.inShip = true;
  g.hostLever(g.selfId); g.hostFinishLanding?.();
  for (let i = 0; i < ticks; i++) { kefal.tick(10, 1 / 30, false); await sleep(6); }
  return { phase: g.run.phase, moon: g.run.moon, theme: g.world.facility?.layout?.theme, creatures: g.creatures.host.size, items: [...g.items.all()].length };
};
const takeoff = async () => {
  g.ui.closePanel?.();
  g.player.teleport(V(0, 1, 0)); g.player.inShip = true;
  g.hostBeginTakeoff('lever'); g.hostFinishTakeoff?.();
  for (let i = 0; i < 6; i++) { kefal.tick(10, 1 / 30, false); await sleep(6); }
  return { phase: g.run.phase, day: g.run.day, daysLeft: g.run.daysLeft };
};
const panelInfo = () => { const pe = g.ui.panelOpen; if (!pe) return null; const b = pe.getBoundingClientRect(); return { cls: desc(pe), rect: [b.left, b.top, b.right, b.bottom].map(Math.round), fits: b.right <= innerWidth + 2 && b.bottom <= innerHeight + 2 && b.left >= -2 && b.top >= -2, junk: junk(pe.innerText), sample: (pe.innerText || '').replace(/\s+/g, ' ').slice(0, 100), overlaps: textOverlaps(pe).slice(0, 6) }; };
