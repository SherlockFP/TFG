// warmset.js - wave 8 perf6: the landing WARM SET + kefal.game.perfInfo().
// Problem (docs/wave8/perf6.md): landQ.prewarm compiles only the materials in the scene at that moment, so the first creature / scrap / VFX
// of a run compiled its shader + uploaded its textures mid-frame (30-200 ms spikes). Now, as landing jobs queued BEFORE 'prewarm', one
// instance of every creature model the moon can spawn (threat pool + spawn tables), every scrap / big item of its interior theme and the common
// VFX materials (additive cone / beam, muzzle sprite, strap line, web / label plane, instanced lamp ...) is built in a hidden group far below the
// map; the prewarm compile then sees them, renderer.initTexture uploads their textures, and after the compile the group is removed.
// Materials are NOT disposed (that would free the very programs we just compiled); only unshared geometry is.
// Modules can add their own: game.mods.on('warm', (reg, game) => reg(objectOrTexture)).
import * as THREE from 'three';
import { CREATURES, spawnTable } from './creatures.js';
import { scrapTableFor, bigTableFor } from './items.js';
import { createCreatureModel } from '../models/creatures.js';
import { createItemModel, hasItemModel } from '../models/items.js';
import { warmPlan, makeFrameRing, pushFrame, frameStats } from './warmset_core.js';
import { errLog } from '../core/events.js';   // [errbudget]

const TEX_KEYS = ['map', 'emissiveMap', 'alphaMap', 'lightMap', 'aoMap', 'normalMap', 'bumpMap'];
const FAR_Y = -4000;

/** the generic VFX materials (same program parameters as feedcams cone / drone beam / crdirector eyes / feel muzzle / carry strap / web plane / feedcams boxes) */
export function vfxObjects(canvasTex) {
  const out = [];
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  tri.setAttribute('color', new THREE.BufferAttribute(new Float32Array(12).fill(1), 4));   // rgba: the cone's vertex alpha
  const tri3 = tri.clone(); tri3.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(1), 3));
  const add = { transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false };
  const po = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  out.push(new THREE.Mesh(tri, new THREE.MeshBasicMaterial({ vertexColors: true, ...add, ...po })));                       // feedcams floor cone
  out.push(new THREE.Mesh(new THREE.ConeGeometry(1, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c8, ...add })));   // drone beam / crdirector eyes
  out.push(new THREE.Mesh(new THREE.CircleGeometry(1, 8), new THREE.MeshBasicMaterial({ color: 0xfff0c8, ...add, ...po })));     // drone disc / downed ring
  out.push(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: canvasTex, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, fog: true })));   // web / label plane
  out.push(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false })));   // creature tell mark
  out.push(new THREE.Mesh(tri3, new THREE.MeshLambertMaterial({ vertexColors: true })));                                   // feedcams junction boxes
  out.push(new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshLambertMaterial({ vertexColors: true }), 1));   // feedcams camera body
  const il = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }), 1); il.setColorAt(0, new THREE.Color(0xff2020)); out.push(il);   // camera / drone lamp
  out.push(new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false })));   // muzzle flash
  out.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), new THREE.LineBasicMaterial({ color: 0xf2c230, fog: false })));   // carry strap
  for (const o of out) o.frustumCulled = false;
  return out;
}

export function installWarmSet(game) {
  const ring = makeFrameRing();   // [fastmenu] last 600 frame times
  const offFrame = game.mods?.on?.('update', (dt, g) => { if (g === game && !(typeof document !== 'undefined' && document.hidden)) pushFrame(ring, performance.now()); });
  const S = { group: null, tex: new Set(), built: [], ms: 0, plan: null, programsBefore: null, programsAfter: null };
  const rend = () => game.engine?.renderer || null;
  const progCount = () => rend()?.info?.programs?.length ?? 0;

  function ensureGroup() {
    if (S.group) return S.group;
    S.group = new THREE.Group(); S.group.name = 'warmset'; S.group.position.set(0, FAR_Y, 0);
    game.scene?.add(S.group);
    return S.group;
  }
  /** put an object under the hidden group and remember its textures for the upload */
  function hold(obj, tag) {
    if (!obj) return;
    if (obj.isTexture) { S.tex.add(obj); return; }
    ensureGroup().add(obj);
    obj.traverse?.((o) => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) for (const k of TEX_KEYS) { const x = m?.[k]; if (x && x.isTexture) S.tex.add(x); }
    });
    S.built.push(tag || 'x');
  }
  function upload() {
    const r = rend();
    if (!r?.initTexture) { S.tex.clear(); return 0; }
    let n = 0;
    for (const t of S.tex) { try { if (t.image && !t.isRenderTargetTexture && !t.isCompressedTexture) { r.initTexture(t); n++; } } catch { /* ignore */ } }
    S.tex.clear();
    return n;
  }
  function creature(id) {
    const def = CREATURES[id], custom = window.__kefalMods?.creatureModels?.get?.(id);
    const model = custom ? custom(window.KefalAPI?.THREE || THREE, { elite: false, seed: 1 }) : createCreatureModel(def?.model || id, { elite: false, seed: 1 });
    hold(model?.root, 'c:' + id);
  }
  function item(id) {
    const custom = window.__kefalMods?.itemModels?.get?.(id);
    if (!custom && !hasItemModel(id)) return;
    hold(custom ? custom(window.KefalAPI?.THREE || THREE) : createItemModel(id), 'i:' + id);
  }
  function canvasTex() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 8;
    const c = cv.getContext('2d'); if (c) { c.fillStyle = '#fff'; c.fillRect(0, 0, 8, 8); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  /** remove the hidden group after the compile (materials stay alive on purpose: disposing them would release the compiled programs) */
  function cleanup() {
    const g = S.group; S.group = null;
    if (g) {
      g.removeFromParent();
      g.traverse((o) => { if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.(); });
    }
    S.tex.clear();
    S.programsAfter = progCount();
  }

  /** queue the warm jobs on landing queue `q` (call BEFORE q.add('prewarm')). Everything runs as small jobs; errors are per job. */
  function queue(q, run, moon) {
    if (!q || game.warmSetEnabled === false || !moon || moon.company) return;
    S.built = []; S.ms = 0; S.plan = null; S.programsBefore = null; S.programsAfter = null;
    q.afterPrewarm?.push(cleanup);
    const timed = (fn) => () => { const t = performance.now(); try { fn(); } finally { S.ms += performance.now() - t; } };
    q.add('warm:plan', timed(() => {
      S.programsBefore = progCount();
      const theme = game.world?.facility?.layout?.theme || moon.interior;
      const plan = warmPlan(run, moon, theme, { CREATURES, spawnTable, scrapTableFor, bigTableFor });
      S.plan = plan;
      q.addNext('warm:vfx', timed(() => { const ct = canvasTex(); S.tex.add(ct); for (const o of vfxObjects(ct)) hold(o, 'vfx'); game.mods?.emit?.('warm', hold, game); upload(); }));
      for (const id of plan.creatures) q.addNext('warm:c:' + id, timed(() => { creature(id); upload(); }));
      for (const id of plan.items) q.addNext('warm:i:' + id, timed(() => { item(id); upload(); }));
    }));
  }

  /** kefal.game.perfInfo(): renderer counters + program names (how many unique shaders exist) + what the warm set built */
  game.perfInfo = () => {
    const r = rend(), i = r?.info;
    const names = {};
    for (const p of i?.programs || []) names[p.name] = (names[p.name] || 0) + 1;
    return {
      programs: i?.programs?.length ?? null, programNames: names, geometries: i?.memory?.geometries ?? null, textures: i?.memory?.textures ?? null,
      frameMs: frameStats(ring),   // [fastmenu] p50/p95/p99 frame ms + 1%-low fps over the last 600 frames
      calls: i?.render?.calls ?? null, triangles: i?.render?.triangles ?? null,
      errors: { total: errLog.total, last: errLog.ring.map((k) => ({ k, n: errLog.counts.get(k) || 0 })) },   // [errbudget]
      warm: { built: S.built.length, models: S.built.slice(0, 80), ms: Math.round(S.ms * 10) / 10, programsBefore: S.programsBefore, programsAfter: S.programsAfter, plan: S.plan },
    };
  };
  return { queue, cleanup, plan: () => S.plan, hold, dispose() { cleanup(); try { offFrame?.(); } catch { /* ignore */ } delete game.perfInfo; } };
}
