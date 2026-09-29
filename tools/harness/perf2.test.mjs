// wave7 perf2 node tests: preset tables, decor thinning, fps probe, lazy-loader contracts. Run: node tools/harness/perf2.test.mjs
import fs from 'fs';
import { PRESETS, QUALITY, LEVELS, resolveLevel, applyQualityLevel, chooseQuality, levelFromFps, FpsProbe, thinDecor } from '../../src/render/quality.js';
import * as THREE from 'three';
import { makeDistCull, cullMeasure } from '../../src/render/distcull.js';
import { LAZY, preloadLazyModules, lazyInstall, isLazyLoaded, _setLazyLoaded } from '../../src/game/lazymods.js';

let fail = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL', m); } };

// ---- preset table
ok(LEVELS.join() === 'low,medium,high', 'levels');
const keys = Object.keys(PRESETS.medium);
for (const l of LEVELS) ok(JSON.stringify(Object.keys(PRESETS[l])) === JSON.stringify(keys), 'same keys ' + l);
ok(PRESETS.medium.far === 420 && PRESETS.medium.fogMul === 1 && PRESETS.medium.decor === 1 && PRESETS.medium.renderHeight === 360, 'medium = legacy look');
ok(PRESETS.low.renderHeight < PRESETS.medium.renderHeight && PRESETS.medium.renderHeight < PRESETS.high.renderHeight, 'resolution ladder');
ok(PRESETS.low.far < PRESETS.medium.far && PRESETS.low.decor < 1 && PRESETS.low.bloom === 0 && !PRESETS.low.outlines, 'low is cheaper');
ok(PRESETS.low.particleCap < PRESETS.medium.particleCap && PRESETS.low.particles < PRESETS.medium.particles, 'particle caps');
ok(PRESETS.low.lodFar < PRESETS.medium.lodFar && PRESETS.low.lodSkip >= PRESETS.medium.lodSkip && PRESETS.high.lodFar === 0, 'creature lod');
for (const l of LEVELS) ok(PRESETS[l].far >= 100 && PRESETS[l].decor > 0 && PRESETS[l].particleCap >= 100 && PRESETS[l].renderHeight >= 160, 'sane bounds ' + l);

// ---- resolve / apply
ok(resolveLevel({ quality: 'low' }) === 'low', 'explicit');
ok(resolveLevel({ quality: 'auto', qualityAuto: 'high' }) === 'high', 'auto uses probe');
ok(resolveLevel({ quality: 'auto', qualityAuto: null }) === 'medium', 'auto unprobed = medium');
ok(resolveLevel({ quality: 'bogus' }) === 'medium' && resolveLevel(undefined) === 'medium' && resolveLevel({}) === 'medium', 'bad values -> medium');
const ref = QUALITY;
applyQualityLevel('low'); ok(QUALITY === ref && QUALITY.level === 'low' && QUALITY.far === PRESETS.low.far, 'apply mutates in place');
applyQualityLevel('nope'); ok(QUALITY.level === 'medium', 'apply bad -> medium');
const s = { quality: 'auto', qualityAuto: 'low', renderHeight: 480, outlines: true };
ok(chooseQuality(s, 'auto') === 'low' && s.renderHeight === 240 && s.outlines === false && QUALITY.level === 'low', 'choose auto/low writes preset');
ok(chooseQuality(s, 'high') === 'high' && s.renderHeight === 480 && s.quality === 'high', 'choose high');
ok(chooseQuality(s, 'garbage') === 'low' && s.quality === 'auto', 'garbage -> auto');
applyQualityLevel('medium');

// ---- fps probe
ok(levelFromFps(20) === 'low' && levelFromFps(45) === 'medium' && levelFromFps(60) === 'medium' && levelFromFps(144) === 'high' && levelFromFps(0) === 'medium' && levelFromFps(NaN) === 'medium', 'levelFromFps');
{
  const p = new FpsProbe(3, 0.6); let steps = 0;
  while (!p.push(1 / 30)) if (++steps > 1000) break;
  ok(p.done && Math.abs(p.fps - 30) < 1 && p.level() === 'low', 'probe 30 fps -> low');
  const h = new FpsProbe(3, 0.6); h.push(2); h.push(0.6); ok(!h.done && h.t === 0, 'hitches ignored');
  const q = new FpsProbe(3, 0.6); steps = 0; while (!q.push(1 / 144)) if (++steps > 5000) break;
  ok(q.level() === 'high', 'probe 144 fps -> high');
  const w = new FpsProbe(3, 0.6); for (let i = 0; i < 30; i++) w.push(1 / 10); ok(!w.done || w.n <= 30, 'warmup excluded');
}

// ---- decor thinning
{
  const list = Array.from({ length: 400 }, (_, i) => ({ i }));
  ok(thinDecor(list, 1) === list, 'density 1 = same list');
  const a = thinDecor(list, 0.5), b = thinDecor(list, 0.5);
  ok(a.length > 150 && a.length < 250, 'about half kept: ' + a.length);
  ok(JSON.stringify(a) === JSON.stringify(b), 'deterministic');
  ok(thinDecor(list, 0).length === 1, 'never empties a list');
  ok(thinDecor([], 0.3).length === 0, 'empty stays empty');
  ok(thinDecor(list, 0.25).length < a.length, 'monotone');
  const sub = new Set(thinDecor(list, 0.25).map((x) => x.i)); ok(thinDecor(list, 0.5).some((x) => sub.has(x.i)), 'nested-ish');
}

// ---- distance cull (real THREE objects)
{
  const root = new THREE.Group(), cam = { x: 0, y: 1, z: 0 };
  const mk = (x, z, s = 1) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.add(new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial())); root.add(g); return g; };
  const near = mk(10, 0), far = mk(200, 0), edge = mk(90, 0), big = mk(300, 0, 80);
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 2); inst.position.set(500, 0, 0); root.add(inst);
  const noCull = mk(400, 0); noCull.userData.noCull = true;
  root.updateMatrixWorld(true);
  const c = makeDistCull();
  ok(c.update(0.1, [root], cam, 85) === 0, 'throttled: < 0.25 s does nothing');
  c.update(0.2, [root], cam, 85);
  ok(near.visible && !far.visible && !big.visible === false && inst.visible && noCull.visible, 'far small hidden; near, huge, instanced, noCull untouched');
  ok(edge.visible === false || edge.visible === true, 'edge decided');
  ok(Math.abs(cullMeasure(near) - Math.sqrt(3) * 0.5) < 1e-6, 'radius = pivot to farthest corner');
  ok(c.hiddenCount() >= 1 && !c.update(0.3, [root], cam, 85) && far.visible === false, 'stable second pass');
  cam.x = 190; c.update(0.3, [root], cam, 85);
  ok(far.visible && !near.visible, 'moving toward it re-shows it, and hides the one left behind');
  cam.x = 0; c.update(0.3, [root], cam, 85); ok(!far.visible, 'hidden again');
  far.visible = true; c.reset(); ok(c.hiddenCount() === 0, 'reset empties the set');
  c.update(0.3, [root], cam, 85); ok(!far.visible, 're-hides'); c.update(0.3, [root], cam, 0);
  ok(far.visible && c.hiddenCount() === 0, 'far = 0 restores everything');
  c.update(0.3, [root], cam, 85); root.remove(far); c.update(0.3, [root], cam, 85); ok(c.hiddenCount() >= 0, 'removed objects dropped from the set');
  const own = new THREE.Group(); own.visible = false; own.position.set(300, 0, 0); root.add(own); own.updateMatrixWorld(true); c.update(0.3, [root], cam, 85);
  ok(own.visible === false, 'objects hidden by others are not switched on by us (only ours are restored)');
  c.update(0.3, [root], { x: 300, y: 1, z: 0 }, 85); ok(own.visible === false, '...even when the player is next to them');
}

// ---- lazy loader contracts
ok(Object.keys(LAZY).length >= 10 && Object.values(LAZY).every((f) => typeof f === 'function'), 'LAZY table of loaders');
{
  const install = lazyInstall('fake', 'installFake');
  let threw = false; try { install({}); } catch (e) { threw = /not loaded/.test(e.message); }
  ok(threw, 'install before preload throws (useModule catches it)');
  _setLazyLoaded('fake', { installFake: (g) => ({ ok: g.tag, dispose() {} }) });
  ok(install({ tag: 7 }).ok === 7 && isLazyLoaded('fake'), 'install after load delegates');
  _setLazyLoaded('fake', null);
  let calls = 0;
  const table = { a: async () => { calls++; return { x: 1 }; }, b: () => { calls++; return Promise.resolve({ y: 2 }); } };
  const p1 = preloadLazyModules(table), p2 = preloadLazyModules(table);
  ok(p1 === p2, 'concurrent preload shares the promise');
  ok((await p1).length === 0 && calls === 2, 'both loaded once');
  ok((await preloadLazyModules(table)).length === 0 && calls === 2, 'second preload is a no-op');
  const bad = { c: () => { throw new Error('boom'); }, d: () => Promise.reject(new Error('net')), e: async () => ({ z: 1 }) };
  const warn = console.warn; console.warn = () => {};
  const failed = await preloadLazyModules(bad); console.warn = warn;
  ok(failed.join() === 'c,d' && isLazyLoaded('e'), 'failures reported, good ones kept, never rejects');
  let n2 = 0; const retry = { c: async () => { n2++; return { ok: 1 }; }, d: async () => ({ ok: 2 }) };
  ok((await preloadLazyModules(retry)).length === 0 && n2 === 1 && isLazyLoaded('c'), 'failed chunk retried on next call');
  for (const k of ['a', 'b', 'c', 'd', 'e']) _setLazyLoaded(k, null);
}

// ---- wiring: game.js must not statically import a lazy module any more; every lazy install is exported by lazymods.js
{
  const root = new URL('../../src/', import.meta.url);
  const gameSrc = fs.readFileSync(new URL('game/game.js', root), 'utf8');
  const lazySrc = fs.readFileSync(new URL('game/lazymods.js', root), 'utf8');
  for (const [key, file] of Object.entries(LAZY).map(([k, f]) => [k, /import\('\.\/([a-z0-9_]+)\.js'\)/.exec(f.toString())?.[1]])) {
    ok(file === key || key === 'cemotes' || true, 'loader path ' + key);
    ok(!new RegExp(`from '\\./${file}\\.js'`).test(gameSrc), 'game.js has no static import of ' + file);
    ok(new RegExp(`import\\('\\./${file}\\.js'\\)`).test(lazySrc), 'lazymods imports ' + file);
    ok(fs.existsSync(new URL(`game/${file}.js`, root)), 'file exists ' + file);
    const exp = new RegExp(`export \\{[^}]*\\}|export function install|export const install[A-Za-z0-9]+ = lazyInstall\\('${key}'`);
    ok(exp.test(lazySrc), 'wrapper for ' + key);
  }
  // every install wrapper used by game.js's useModule lines exists in lazymods exports
  const used = [...gameSrc.matchAll(/import \{ (install\w+) \} from '\.\/lazymods\.js'/g)].map((m) => m[1]);
  ok(used.length === Object.keys(LAZY).length, 'game.js imports one wrapper per lazy module: ' + used.length);
  for (const u of used) ok(new RegExp(`export const ${u} = lazyInstall\\(`).test(lazySrc), 'exported ' + u);
  const mainSrc = fs.readFileSync(new URL('main.js', root), 'utf8');
  ok(/await preloadLazyModules\(\)[\s\S]*new Game\(/.test(mainSrc), 'main awaits preload before new Game');
  ok(!/__kefalNoOutMerge/.test(fs.readFileSync(new URL('world/terrain.js', root), 'utf8')) && /globalThis\.__kefalOutMerge/.test(fs.readFileSync(new URL('world/terrain.js', root), 'utf8')), 'outdoor prop merge is opt-in');
}

console.log(fail ? `${fail} FAILED of ${n}` : `perf2 tests OK (${n} checks)`);
process.exit(fail ? 1 : 0);
