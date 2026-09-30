// [soul] node test for src/game/soul_core.js + soul.js: palettes distinct, story beats (seeded, ground-snapped, spaced, clear of ship / entrance / each other, colliders finite),
// voice gate, EN/TR/RU text, ship layout wiring.   node tools/harness/soul.test.mjs
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent("export async function load(u, c, n) { if (u.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return n(u, c); }"));   // ui modules import .css
globalThis.window = globalThis;
console.warn = console.error = () => {};
globalThis.addEventListener = globalThis.removeEventListener = () => {};
const cv = () => ({ width: 0, height: 0, style: {}, querySelector: () => cv(), querySelectorAll: () => [], children: [], insertBefore() {}, appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }) });
globalThis.document = { createElement: () => cv(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, activeElement: null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const assert = (await import('node:assert/strict')).default;
const { buildMoonOutdoor } = await import('../../src/world/terrain.js');
const { MOONS, BIOMES } = await import('../../src/game/moons.js');
const C = await import('../../src/game/soul_core.js');
const { installSoul } = await import('../../src/game/soul.js');
const L = await import('../../src/world/shiplayout.js');
const { getLang, setLang } = await import('../../src/core/i18n.js');
let pass = 0, fail = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; process.exitCode = 1; console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n       ')); } };
const NAMED = ['hamsi', 'lufer', 'palamut', 'levrek', 'cipura', 'orkinos'];
const lightPool = { add(e) { return e; }, remove() {} };
const mkPhysics = (boxes) => ({ addStaticBox(x, y, z, hx, hy, hz, rot, member, data) { const b = { x, y, z, hx, hy, hz, rot, data }; boxes.push(b); return b; }, removeCollider() {}, addStaticTrimesh() { return {}; }, addHeightfield() { return {}; } });
const dist3 = (a, b) => Math.hypot((a >> 16 & 255) - (b >> 16 & 255), (a >> 8 & 255) - (b >> 8 & 255), (a & 255) - (b & 255));

ok('palettes: 7 hand-authored identities, every colour field present, no two moons look alike (sky, fog, dusk far apart)', () => {
  const ids = [...NAMED, 'hq'];
  for (const id of ids) {
    const p = C.PALETTES[id];
    assert.ok(p, id);
    for (const k of ['sky', 'fog', 'night', 'sun', 'dusk', 'fogDensity', 'hemiG', 'sat']) assert.ok(Number.isFinite(p[k]), id + '.' + k);
    assert.ok(BIOMES[p.biome], id + ' biome');
    assert.equal(MOONS[id].biome, p.biome, id + ' moon biome');
  }
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = C.PALETTES[ids[i]], b = C.PALETTES[ids[j]];
    assert.ok(dist3(a.sky, b.sky) > 60 || dist3(a.fog, b.fog) > 60, `${ids[i]} vs ${ids[j]} sky/fog too close`);
    assert.ok(dist3(a.dusk, b.dusk) > 40 || dist3(a.sun, b.sun) > 40, `${ids[i]} vs ${ids[j]} dusk/sun too close`);
  }
  const s1 = C.paletteFor('sector7', BIOMES.hills, 5), s2 = C.paletteFor('sector7', BIOMES.hills, 5), s3 = C.paletteFor('sector8', BIOMES.hills, 5);
  assert.deepEqual(s1, s2);
  assert.notDeepEqual(s1, s3);
});

ok('story beats: every named moon x 2 seeds: seeded, ground-snapped, ~18 m apart along the path, clear of ship / entrance / each other; colliders finite and grounded', () => {
  let total = 0;
  for (const id of NAMED) for (const seed of [1234, 987]) {
    const boxes = [], out = buildMoonOutdoor(seed, MOONS[id], { physics: mkPhysics(boxes), lightPool });
    const T = out.terrain, args = { seed, moonId: id, pathPts: T.pathPts, heightAt: (x, z) => T.heightAt(x, z), plan: out.plan, half: T.half, floodY: out.plan.biome?.flood ?? null, avoid: out.avoid };
    const a = C.planBeats(args), b = C.planBeats(args);
    assert.deepEqual(a, b, id + ' not deterministic');
    const prim = a.filter((s) => !s.secondary);
    assert.ok(prim.length >= 2, `${id}/${seed}: only ${prim.length} path beats`);
    assert.ok(a.length >= 3, `${id}/${seed}: only ${a.length} beats`);
    total += a.length;
    prim.sort((p, q) => p.s - q.s);
    for (let i = 1; i < prim.length; i++) assert.ok(prim[i].s - prim[i - 1].s > 3 && prim[i].s - prim[i - 1].s < 45, `${id}/${seed} spacing ${prim[i].s - prim[i - 1].s}`);
    const e = out.plan.entrance;
    for (const s of a) {
      assert.ok(Number.isFinite(s.x + s.y + s.z + s.yaw), 'nan');
      assert.ok(Math.abs(s.y - T.heightAt(s.x, s.z)) < 1e-6, 'not ground snapped');
      assert.ok(Math.hypot(s.x, s.z) > C.BEAT.shipClear, 'in the ship zone');
      assert.ok(Math.hypot(s.x - e.x, s.z - e.z) > C.BEAT.entranceClear, 'in the entrance zone');
      if (!['tracks', 'tape'].includes(s.kind)) assert.ok(T.distToPath(s.x, s.z) > 4.5, `${s.kind} ${T.distToPath(s.x, s.z).toFixed(1)} m from the path: blocks the walk`);
      for (const q of a) if (q !== s) assert.ok(Math.hypot(s.x - q.x, s.z - q.z) >= s.r + q.r + 1.4 - 1e-6, `${s.id} overlaps ${q.id}`);
    }
    // the real module on a stub game: meshes + colliders
    const listeners = {}, cols = [];
    const mods = { on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => {}; }, emit(ev, ...x) { for (const f of listeners[ev] || []) f(...x); } };
    const world = { moonId: id, seed, company: null, outdoor: out, facility: null, terrain: T };
    const game = { mods, selfId: 'me', isHost: true, world, run: { phase: 'moon', seed, day: 1 }, physics: mkPhysics(cols), ui: {}, player: { pos: { x: 0, y: 0, z: 0 } }, later() {} };
    const api = installSoul(game);
    mods.emit('mapLoaded', world, game);
    assert.ok(api.plan().length >= 2 && api.plan().length <= a.length + 1, `module plan ${api.plan().length} vs pure ${a.length}`);   // the module also dodges trees / scrap spots
    for (const s of api.plan()) { assert.ok(Math.abs(s.y - T.heightAt(s.x, s.z)) < 1e-6, 'module beat not snapped'); assert.ok(Math.hypot(s.x, s.z) > C.BEAT.shipClear); }
    assert.ok(out.group.children.some((c) => c.name === 'soul_beats'), 'no beats group');
    assert.ok(cols.length > 0, 'no colliders');
    for (const c of cols) {
      assert.ok(Number.isFinite(c.x + c.y + c.z + c.hx + c.hy + c.hz), 'collider nan');
      const gy = T.heightAt(c.x, c.z);
      assert.ok(c.y - c.hy <= gy + 0.6 && c.y + c.hy >= gy, `${id}/${seed} ${c.data?.id} collider not standing on the ground (${(c.y - c.hy - gy).toFixed(2)} / ${(c.y + c.hy - gy).toFixed(2)})`);
    }
    api.dispose();
  }
  assert.ok(total >= 30, 'few beats overall: ' + total);
});

ok('voice: <= 1 line per 45 s, silent during a chase, sale grades', () => {
  const g = C.makeGate();
  assert.ok(g.ok(100, false, false));
  g.mark(100);
  assert.ok(!g.ok(120, false, false) && !g.ok(144.9, false, false) && g.ok(145, false, false));
  assert.ok(!g.ok(500, true, false), 'chase must silence');
  assert.ok(!g.ok(500, false, true), 'busy intercom must silence');
  assert.equal(C.saleGrade(0, 100, 130), 'bad');
  assert.equal(C.saleGrade(130, 130, 130), 'good');
  assert.equal(C.saleGrade(30, 100, 130), 'ok');
  assert.equal(C.saleGrade(8, 100, 130), 'bad');
});

ok('text: every soul string has TR and RU, follows studio_style (no em dash, no "!", no emoji, <= 16 words per Algorithm line); 20+ voice lines', () => {
  let voice = 0;
  for (const [key, arr] of Object.entries(C.TX)) for (const [en, tr, ru] of arr) {
    assert.ok(en && tr && ru, `${key}: missing translation for "${en}"`);
    for (const s of [en, tr, ru]) {
      assert.ok(!/[—–!]/.test(s), `${key}: dash / exclamation in "${s}"`);
      assert.ok(!/undefined|TODO|NaN/.test(s), key);
      assert.ok(!/\p{Extended_Pictographic}/u.test(s), key + ' emoji');
    }
    if (/^(walk|b_|pa|sale_|quota_|land_)/.test(key)) { voice++; assert.ok(en.split(/\s+/).length <= 16, `${key}: line too long "${en}"`); }
  }
  assert.ok(voice >= 20, 'voice lines: ' + voice);
  const before = getLang();
  C.registerSoulText();
  setLang('tr');
  assert.equal(C.tx('sale_ok'), C.TX.sale_ok[0][1]);
  setLang('ru');
  assert.equal(C.tx('sale_ok'), C.TX.sale_ok[0][2]);
  setLang(before);
});

ok('ship soul: whiteboard stats come from the run + profile, plant follows quotas, fixtures wired into shiplayout', () => {
  const m = C.boardModel({ day: 7, quotaIndex: 3 }, { deaths: 5, bestHaul: 412, quotasMet: 9 });
  assert.deepEqual([m.days, m.dead, m.best, m.quotas], [7, 5, 412, 3]);
  assert.deepEqual(C.tallyGroups(12), [5, 5, 2]);
  assert.equal(C.plantSize(0), 0);
  assert.equal(C.plantSize(99), 6);
  assert.deepEqual(C.boardModel(null, null), { days: 0, dead: 0, best: 0, quotas: 0, lifetimeQuotas: 0 });
  const ids = L.fixtureBoxes().map((b) => b.id);
  for (const id of ['soulBoard', 'soulShelf', 'soulPoster', 'soulNote0', 'soulNote1', 'soulNote2']) assert.ok(ids.includes(id), id);
});

console.log(`\nsoul: ${pass} passed, ${fail} failed`);
