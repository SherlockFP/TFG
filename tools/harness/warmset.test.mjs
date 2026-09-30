// wave8 perf6 node test: landing warm set plan + queue wiring + perfInfo.  node tools/harness/warmset.test.mjs   (no browser)
import fs from 'fs';
globalThis.window = globalThis.window || { __kefalMods: null };
const ctx2d = new Proxy(function () {}, { get: (t, k) => (k === 'createImageData' || k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(1 << 22) }) : k === 'measureText' ? () => ({ width: 1 }) : ctx2d), set: () => true, apply: () => ctx2d });
globalThis.document = globalThis.document || { createElement: () => ({ width: 8, height: 8, getContext: () => ctx2d, style: {} }) };
const THREE = await import('three');
const { installLandQ } = await import('../../src/game/landingq.js');
const { warmPlan, CAP_CREATURES } = await import('../../src/game/warmset_core.js');
const { installWarmSet } = await import('../../src/game/warmset.js');
const { CREATURES, spawnTable } = await import('../../src/game/creatures.js');
const { scrapTableFor, bigTableFor } = await import('../../src/game/items.js');
const { poolFor } = await import('../../src/game/threatpool.js');
const { MOONS } = await import('../../src/game/moons.js');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const deps = { CREATURES, spawnTable, scrapTableFor, bigTableFor };

// plan: pool creatures first, one per model, capped; scrap + big of the theme; deterministic
const run = { runId: 'w1', quotaIndex: 1 };
for (const id of ['hamsi', 'lufer', 'palamut']) {
  const m = MOONS[id]; if (!m) continue;
  const a = warmPlan(run, m, m.interior, deps), b = warmPlan({ ...run }, m, m.interior, deps), pool = poolFor(run, m);
  ok(JSON.stringify(a) === JSON.stringify(b), id + ' deterministic');
  ok(a.creatures.length > 0 && a.creatures.length <= CAP_CREATURES, id + ' creature count ' + a.creatures.length);
  ok(pool.ids.every((c) => a.creatures.includes(c) || !CREATURES[c]), id + ' pool residents are warmed');
  ok(new Set(a.creatures.map((c) => CREATURES[c].model || c)).size === a.creatures.length, id + ' one per model');
  const tb = new Set([...scrapTableFor(m.interior), ...bigTableFor(m.interior)].map((e) => e[0]));
  ok(a.items.length > 5 && a.items.every((i) => tb.has(i)), id + ' items come from the scrap / big tables');
}
ok(warmPlan(run, MOONS.hq, 'x', deps).items.length === 0, 'HQ (company) warms no scrap');

// queue wiring on a fake renderer: jobs run before prewarm, the group is gone after the compile, textures are initialised, perfInfo answers
{
  const scene = new THREE.Scene(); const inited = new Set(); let resolveCompile;
  const renderer = { info: { programs: [{ name: 'basic' }], memory: { geometries: 3, textures: 2 }, render: { calls: 1, triangles: 2 } }, getRenderTarget: () => null, setRenderTarget() {},
    initTexture: (t) => inited.add(t), compileAsync: () => new Promise((r) => { resolveCompile = r; renderer.info.programs.push({ name: 'lambert' }); }) };
  const game = { scene, engine: { renderer, scene, camera: new THREE.PerspectiveCamera(), rt: null }, world: {}, mods: { emit() {}, on: () => () => {} } };
  const q = installLandQ(game); q.startDelay = 0; game.landQ = q;
  game.mods.emit = (ev, reg) => { if (ev === 'warm') reg(new THREE.Texture(document.createElement('canvas'))); };
  const w = installWarmSet(game);
  const W = console.warn; console.warn = () => {};
  w.queue(q, run, MOONS.hamsi); let groupSeenAtPrewarm = false;
  q.add('prewarm', () => { groupSeenAtPrewarm = !!scene.children.find((c) => c.name === 'warmset'); q.prewarm(); });
  q.flush(); console.warn = W;
  const info = game.perfInfo();
  ok(groupSeenAtPrewarm, 'warm group is in the scene when the prewarm compile runs');
  ok(info.warm.built > 10 && info.warm.plan.creatures.length > 0, 'built ' + info.warm.built + ' instances');
  ok(inited.size > 0, 'textures initialised (' + inited.size + ')');
  ok(!!scene.children.find((c) => c.name === 'warmset'), 'group still there until the compile resolves');
  resolveCompile(); await new Promise((r) => setTimeout(r, 5));
  ok(!scene.children.find((c) => c.name === 'warmset'), 'group removed after the compile');
  const i2 = game.perfInfo();
  ok(i2.programs === 2 && i2.programNames.basic === 1 && i2.geometries === 3 && i2.warm.programsAfter === 2, 'perfInfo counters');
  // a cleared landing still removes the group
  const q2 = q; q2.startDelay = 0; game.landQ = q2; w.queue(q2, run, MOONS.hamsi); q2.flush();
  ok(scene.children.some((c) => c.name === 'warmset'), 'second landing built a group'); q2.clear();
  ok(!scene.children.some((c) => c.name === 'warmset'), 'clear() removes the warm group');
  w.dispose(); ok(!game.perfInfo, 'dispose removes perfInfo');
}
// wiring greps
{
  const g = fs.readFileSync(new URL('../../src/game/game.js', import.meta.url), 'utf8');
  ok(/this\.warmSet\?\.queue\(q, run, moon\);[^\n]*\n\s*q\.add\('prewarm'/.test(g) && /useModule\('warmSet', installWarmSet\)/.test(g), 'game.js queues the warm set right before prewarm');
}
console.log(fail ? `warmset: ${fail} FAILED` : 'warmset: all ok');
process.exit(fail ? 1 : 0);
