// Node test for the pure parts of the Backrooms pocket + liminal work (no browser):
//   node tools/harness/br_pocket.test.mjs
// - generatePocket(key): deterministic, every cell reachable, EXIT reachable on a solid wall and never in a dark zone, loot slots
// - pocketKey: differs per index/day
// - paintLiminalPhoto: all five scenes paint through a mock 2D context, deterministic per seed, develop/stamp options work
import { generatePocket, pocketKey, EDGE } from '../../src/world/backrooms_plan.js';
import { paintLiminalPhoto, sceneOf, SCENES, photoStamp } from '../../src/render/liminal_photo.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };

// ---- pocket plan
const sig = (p) => JSON.stringify([p.W, p.H, p.spawnCell, p.exit.cell, p.exit.d, Array.from(p.V), Array.from(p.Hz), p.loot.map((l) => [l.cell, l.x.toFixed(3), l.z.toFixed(3)]), p.troffers.length]);
ok(sig(generatePocket(12345)) === sig(generatePocket(12345)), 'plan is deterministic');
ok(sig(generatePocket(12345)) !== sig(generatePocket(12346)), 'different keys differ');
ok(pocketKey(7, 3, 0) === pocketKey(7, 3, 0) && pocketKey(7, 3, 0) !== pocketKey(7, 3, 1) && pocketKey(7, 3, 0) !== pocketKey(7, 4, 0), 'pocketKey depends on seed/day/index');
let exitFar = 0, exitDarkBad = 0, unreach = 0;
for (let k = 1; k <= 300; k++) {
  const p = generatePocket(pocketKey(k * 977, k % 9, k % 3));
  for (let i = 0; i < p.W * p.H; i++) if (p.dist[i] < 0) unreach++;
  if (p.dist[p.exit.cell] < 6) exitFar++;
  if (p.dark[p.exit.cell]) exitDarkBad++;
  ok(p.typeOf(p.exit.edge) === EDGE.WALL, 'exit sits on a solid wall (key ' + k + ')');
  ok(p.loot.length === 18 && p.landings.length >= 1, 'loot / landing slots (key ' + k + ')');
  ok(p.spawn.x > 4000, 'pocket is far from every map');
}
ok(unreach === 0, 'every cell reachable from the landing cell (' + unreach + ')');
ok(exitFar === 0, 'EXIT is at least 6 cells away');
ok(exitDarkBad === 0, 'EXIT cell is never dark');

// ---- painter with a recording mock context (no canvas in node)
function mockCanvas(W = 280, H = 220) {
  const log = [];
  const data = new Uint8ClampedArray(W * H * 4).fill(128);
  const grad = { addColorStop: (o, c) => log.push('stop' + o + c) };
  const g = new Proxy({}, {
    get(_, k) {
      if (k === 'getImageData') return () => ({ data, width: W, height: H });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      return (...a) => log.push(k + a.map((x) => (typeof x === 'number' ? x.toFixed(2) : '')).join(','));
    },
    set(_, k, v) { log.push('set' + String(k) + String(v)); return true; },
  });
  return { width: W, height: H, getContext: () => g, log, data };
}
for (const scene of SCENES) {
  const a = mockCanvas(), b = mockCanvas();
  const ra = paintLiminalPhoto(a, 4242, { scene });
  paintLiminalPhoto(b, 4242, { scene });
  ok(ra.scene === scene && a.log.length > 60, 'scene paints: ' + scene + ' (' + a.log.length + ' ops)');
  ok(a.log.join('|') === b.log.join('|'), 'scene is deterministic: ' + scene);
}
const seen = new Set();
for (let s = 1; s < 400; s++) seen.add(sceneOf((s * 2654435761) >>> 0));
ok(seen.size === SCENES.length, 'sceneOf reaches every scene');
{
  const a = mockCanvas(), b = mockCanvas();
  paintLiminalPhoto(a, 99, { develop: 0.05, stamp: false });
  paintLiminalPhoto(b, 99, {});
  ok(!a.log.some((l) => l.startsWith('fillText')) && b.log.some((l) => l.startsWith('fillText')), 'stamp option');
  ok(a.data[0] !== b.data[0], 'develop changes the pixels');
  ok(/^[A-Z]{3} \d\d 19\d\d {2}\d\d:\d\d [AP]M$/.test(photoStamp(99)), 'stamp format ' + photoStamp(99));
}
console.log(fails ? `${fails} FAILED` : 'br_pocket: all ok');
process.exit(fails ? 1 : 0);
