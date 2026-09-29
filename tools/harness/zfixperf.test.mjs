// node tools/harness/zfixperf.test.mjs - wave 5 zfixperf: SWARM robustness (main-scene attach, cap = nearest, new poses,
// dispose/re-init, per-frame dedupe) and the gpusweep sweep (removed geometries / textures get disposed, live ones survive).
import * as THREE from 'three';
import { SwarmRenderer } from '../../src/models/creatures_wave1.js';
import { collectResources, sweepRemoved } from '../../src/game/gpusweep.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } else console.log('ok  ', m); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ SWARM
const S = new SwarmRenderer();
const scene = new THREE.Scene();
const other = new THREE.Scene();
const mk = (x, z, scn = scene) => { const m = S.createModel({ seed: 1 + ((x * 7 + z) | 0) }); m.root.position.set(x, 0, z); scn.add(m.root); return m; };
const models = [];
for (let i = 0; i < 6; i++) models.push(mk(i * 2, 0));
S.update(0.016, scene, new THREE.Vector3(0, 0, 0));
ok(S.ready && S.scene === scene && S.torso.parent === scene, 'attaches to the main scene passed by the manager');
ok(S.torso.count === 6 && S.limbs.count === 24, 'draws 6 bodies (4 limbs each)');
// several zombies parented elsewhere than the main scene still render in the main scene (same world)
const grp = new THREE.Group(); scene.add(grp);
const mg = S.createModel({ seed: 99 }); grp.add(mg.root);
await wait(3);
S.update(0.016, scene, null);
ok(S.torso.count === 7, 'a body nested under another group of the scene is drawn too');
// dedupe: a second update in the same ms is ignored
const before = S.lastT;
S.update(5, scene, null);
ok(S.lastT === before || performance.now() - before >= 2, 'second update within 2 ms is deduped');
// poses
const finiteAll = () => { for (const m of [S.torso, S.head, S.limbs]) for (const v of m.instanceMatrix.array.slice(0, m.count * 16)) if (!Number.isFinite(v)) return false; return true; };
for (const st of ['idle', 'walk', 'run', 'attack', 'bang', 'stunned', 'crawl', 'grab', 'getup', 'dead']) {
  for (const md of models) md.update(0.016, { state: st, t: 0.3, speed: 1.5, time: 1 });
  await wait(3);
  S.update(0.05, scene, null);
  ok(S.torso.count >= 6 && finiteAll(), `pose '${st}' produces finite matrices`);
}
// crawl differs from run (body is lower)
const hipOf = (st) => { for (const md of models) md.update(0.016, { state: st, t: 0.3, speed: 1.5, time: 1 }); S.update(0.05, scene, null); return S.torso.instanceMatrix.array[13]; };
await wait(3); const yRun = hipOf('run'); await wait(3); const yCrawl = hipOf('crawl');
ok(yCrawl < yRun - 0.2, `crawl torso (${yCrawl.toFixed(2)}) sits lower than run (${yRun.toFixed(2)})`);
// hidden roots are not drawn
models[0].root.visible = false; await wait(3); S.update(0.02, scene, null);
ok(S.torso.count === 6, 'invisible root is skipped');
models[0].root.visible = true;
// cap: keep the nearest bodies
const S2 = new SwarmRenderer(); const sc2 = new THREE.Scene();
const many = []; for (let i = 0; i < 100; i++) { const m = S2.createModel({ seed: i + 1 }); m.root.position.set(i, 0, 0); sc2.add(m.root); many.push(m); }
S2.update(0.016, sc2, new THREE.Vector3(0, 0, 0));
ok(S2.torso.count === 72, `cap keeps 72 of 100 (got ${S2.torso.count})`);
const xs = []; const tm = new THREE.Matrix4(), p = new THREE.Vector3(); for (let i = 0; i < S2.torso.count; i++) { S2.torso.getMatrixAt(i, tm); xs.push(p.setFromMatrixPosition(tm).x); }
ok(Math.max(...xs) < 75, 'the drawn bodies are the nearest ones');
// dispose + re-init: recs survive, meshes come back
S.dispose();
ok(!S.ready, 'dispose frees the GPU side');
await wait(3); S.update(0.016, scene, null);
ok(S.ready && S.torso.count === 7 && S.torso.parent === scene, 're-init after dispose redraws the surviving bodies');
// scene switch: leftovers of the old scene are pruned, not drawn
const S3 = new SwarmRenderer(); const a = new THREE.Scene(), b = new THREE.Scene();
const ma = S3.createModel({ seed: 5 }); a.add(ma.root); S3.update(0.016, a, null);
const mb = S3.createModel({ seed: 6 }); b.add(mb.root); await wait(3); S3.update(0.016, b, null);
ok(S3.torso.count === 1 && S3.torso.parent === b && S3.recs.size === 1, 'stale body of an old scene is dropped on scene switch');

// ------------------------------------------------------------------ gpusweep
const root = new THREE.Scene();
const keepG = new THREE.BoxGeometry(1, 1, 1), goneG = new THREE.BoxGeometry(2, 2, 2), sharedG = new THREE.BoxGeometry(3, 3, 3);
sharedG.userData.shared = true;
const texA = new THREE.Texture(), texB = new THREE.Texture(), rt = new THREE.Texture(); rt.isRenderTargetTexture = true;
const keepM = new THREE.MeshBasicMaterial({ map: texA }), goneM = new THREE.MeshBasicMaterial({ map: texB }), rtM = new THREE.MeshBasicMaterial({ map: rt });
const meshes = [new THREE.Mesh(keepG, keepM), new THREE.Mesh(goneG, goneM), new THREE.Mesh(sharedG, rtM)];
for (const m of meshes) root.add(m);
const known = { geos: new Set(), texs: new Set() };
collectResources(root, known.geos, known.texs);
ok(known.geos.size === 3 && known.texs.size === 3, 'collectResources sees geometries + textures');
const disposed = [];
for (const [n, o] of [['keepG', keepG], ['goneG', goneG], ['sharedG', sharedG], ['texA', texA], ['texB', texB], ['rt', rt]]) o.addEventListener('dispose', () => disposed.push(n));
root.remove(meshes[1]); root.remove(meshes[2]);
const r = sweepRemoved(known, root);
ok(r.geos === 1 && disposed.includes('goneG') && !disposed.includes('keepG') && !disposed.includes('sharedG'), 'removed geometry disposed, live + shared geometry kept');
ok(disposed.includes('texB') && !disposed.includes('texA') && !disposed.includes('rt'), 'removed texture disposed, live + render-target texture kept');
ok(known.geos.size === 0, 'remembered sets cleared after a sweep');

console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
