// Node test for wave 8 creature readability:  node tools/harness/creature_read.test.mjs [--table]   (--table prints the docs/wave8/creatureart.md inventory rows)
// Every hostile creature type builds a model with finite bounds, has walk / attack / death animation hooks (the model's own pose or the shared pose layer
// in game/creature_read.js) and an emissive tell material; the Dimmer / Follower / Auditor are no longer a re-skin of another creature's model.
globalThis.window = globalThis;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const R = new URL('../../src/', import.meta.url).href;
const imp = (p) => import(R + p);
const THREE = await import('three');
const { CREATURES, registerCreature } = await imp('game/creatures.js');
const mm = { creatureModels: new Map(), itemModels: new Map(), on() { return () => {}; } };
window.__kefalMods = mm;
const quiet = async (f) => { try { return await f(); } catch { return null; } };
for (const m of ['voyage', 'homeworld2_ghost', 'siege', 'bosses']) await quiet(() => imp('game/' + m + '.js'));
for (const [m, f] of [['horror_creatures', 'registerHorrorCreatures'], ['maps5_creatures', 'registerMaps5Creatures'], ['mirror_creatures', 'registerMirrorCreatures'], ['worlds2_creatures', 'registerWorlds2Creatures'],
  ['creatures_backrooms', 'registerBackroomsCreatures'], ['skeletons', 'registerSkeletonContent'], ['stealth', 'registerStealthContent']]) await quiet(async () => (await imp('game/' + m + '.js'))[f]());
for (const [m, k] of [['creeper', 'DEF'], ['creatures_wave1', 'DEFS'], ['crdirector_creatures', 'DEFS'], ['lcmonsters_ai', 'DEFS']]) await quiet(async () => {
  const X = (await imp('game/' + m + '.js'))[k]; const defs = m === 'creeper' ? { spambomb: X } : X;
  for (const [id, d] of Object.entries(defs || {})) if (!CREATURES[id]) registerCreature(id, { ...d });
});
for (const [p, f] of [['models/creatures_wave1.js', 'registerHordeModels'], ['models/creatures_backrooms.js', 'registerBackroomsModels'], ['models/skeletons.js', 'registerSkeletonModels'], ['models/creeper.js', 'registerCreeperModels']]) await quiet(async () => (await imp(p))[f]());
await quiet(async () => (await imp('models/lcmonsters_models.js')).registerLcModels(mm.creatureModels));
for (const [p, n] of [['models/maps5_models.js', 'M5_CREATURE_MODELS'], ['models/mirror.js', 'MIRROR_CREATURE_MODELS'], ['models/horror_models.js', 'HR_CREATURE_MODELS'], ['models/worlds2_models.js', 'W2_CREATURE_MODELS']])
  await quiet(async () => { for (const [id, fn] of Object.entries((await imp(p))[n])) mm.creatureModels.set(id, (T, o) => fn(o || {})); });
await quiet(async () => { const m = await imp('models/stealth_models.js'); mm.creatureModels.set('listener', (T, o) => m.createListenerModel(o || {})); });
await quiet(async () => { const m = await imp('game/bosses.js'); mm.creatureModels.set('foreman', (T, o) => m.createForemanModel(o || {})); mm.creatureModels.set('legacy', (T, o) => m.createLegacyModel(o || {})); });
const { createCreatureModel } = await imp('models/creatures.js');
const RD = await imp('game/creature_read.js');
const FC = await imp('game/feel_core.js');
const { RULES } = await imp('game/balance_rules.js');
RD.installCreatureRead({ mods: mm });   // registers the Dimmer / Follower / Auditor models

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } };
const build = (id, d, seed = 3) => (mm.creatureModels.has(id) ? mm.creatureModels.get(id)(THREE, { seed }) : createCreatureModel(d.model || id, { seed }));
const pose = (model, st, t, n = 10) => {
  for (let i = 0; i < n; i++) model.update(0.016, { state: st, speed: st === 'run' ? 5 : st === 'walk' ? 2 : 0, t: t * (i + 1) / n, time: 1.3 + t, progress: 0 });
  model.root.updateMatrixWorld(true); const a = []; model.root.traverse((o) => a.push(o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x, o.scale.y, o.scale.z)); return a;
};
const delta = (a, b) => { let s = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) s += Math.abs(a[i] - b[i]); return s; };

// ---- pure pose maths
{
  const w = RULES.windup;
  ok(RD.windupPose('attack', w * 0.5).pitch < -0.1 && RD.windupPose('attack', w * 0.5).phase === 'windup', 'attack: leans back during the 0.4 s wind-up');
  ok(RD.windupPose('attack', w + 0.1).pitch > 0.1 && RD.windupPose('attack', w + 0.1).phase === 'strike', 'attack: strikes forward right after the wind-up');
  ok(Math.abs(RD.windupPose('attack', 2).pitch) < 1e-6, 'attack: pose returns to neutral');
  ok(RD.windupPose('windup', 3).pitch < -0.1 && RD.windupPose('run', 0.2).pitch === 0, 'hold states keep the lean, locomotion states add none');
  ok(RD.bobPose(1.2, 0).dy === 0 && RD.bobPose(1.2, 3).dy > 0.01, 'bob scales with speed');
  ok(RD.flinchPitch(1) < -0.1 && RD.flinchPitch(0) === 0, 'hit flinch');
  ok(RD.sizeK(8) < 0.3 && RD.sizeK(1.0) > 1, 'big bodies lean less');
  // view layer on a fake view: wind-up, strike, dead skipped, LOD far skipped
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const view = { type: 'scuttler', def: { height: 1 }, root, pos: new THREE.Vector3(), height: 1.9, state: 'attack', stateT: 0.3, hitFlash: 0, model: { height: 1.9 }, mgr: null, _rd: { ph: 0, px: 0, pz: 0 } };
  RD.apply(view, 0.016); const back = root.rotation.x;
  view.stateT = 0.45; RD.apply(view, 0.016); const fwd = root.rotation.x;
  view.state = 'dead'; root.rotation.x = 0.77; RD.apply(view, 0.016);
  ok(back < -0.1 && fwd > 0.05 && root.rotation.x === 0.77, 'apply(): back at 0.3 s, forward at 0.45 s, leaves a dead body to feel.deathPose');
}

// ---- every hostile type
const HAZ_OK = new Set(['mimicdoor', 'web']);   // fixtures with no creature model builder (their views are the hand-made doors / webs in entities/creatures.js)
const rows = [];
let n = 0;
for (const [id, d] of Object.entries(CREATURES)) {
  if (HAZ_OK.has(id)) continue;
  let model = null;
  try { model = build(id, d); } catch (e) { ok(false, `${id}: model builds (${e.message})`); continue; }
  n++;
  const box = new THREE.Box3().setFromObject(model.root);
  const finite = [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite);
  if (id !== 'zombot') ok(finite && box.max.y > box.min.y && Number.isFinite(model.height) && model.height > 0, `${id}: model has finite bounds`);   // zombot = instanced swarm renderer
  const tell = RD.ensureTell(model, id, d);
  const tellOk = ['eyes', 'bright', 'added'].includes(tell) || (tell === 'exempt' && (d.hazard || RD.NO_TELL.has(id)));
  ok(tellOk, `${id}: emissive tell (${tell})`);
  if (tell === 'eyes') ok(model.parts.eyes.some((m) => RD.lum(m.userData.baseColor || m.color) >= 0.3), `${id}: at least one eye material is bright enough to glow in the dark`);
  if (tell === 'added') ok(model.parts.tell[0].material.isMeshBasicMaterial && model.parts.tell[0].material.fog === false, `${id}: added tell is unlit and ignores fog`);
  const base = pose(model, 'idle', 0.5);
  const own = { walk: delta(base, pose(model, 'walk', 0.4)), attack: delta(base, pose(model, 'attack', 0.4)), dead: delta(base, pose(model, 'dead', 1.2, 30)) };
  const layer = !RD.NO_POSE.has(id) && !d.hazard && !d.boss;
  const EXEMPT = { sandkefal: 'buried worm: rumble / emerge states', zombot: 'instanced swarm renderer animates its own instances', spambomb: 'swell-then-pop (primed), no melee' };
  if (id === 'spambomb') ok(delta(base, pose(model, 'primed', 1.0)) > 0.05, 'spambomb: primed swell is animated');
  if (d.walk > 0 && !d.hazard && !EXEMPT[id]) ok(layer ? RD.bobPose(1, 2.4).dy > 0 : own.walk > 0.05, `${id}: walk hook`);
  if (!d.hazard && d.dmg > 0 && !EXEMPT[id]) ok(layer ? RD.windupPose('attack', 0.3).pitch < 0 : own.attack > 0.05 || d.boss, `${id}: attack wind-up hook`);
  const deathHook = own.dead > 0.05 || (!FC.NO_TOPPLE.has(id) && !d.boss && !d.hazard);
  ok(deathHook || d.hazard || d.boss || id === 'hoardnest' || id === 'janitorbin', `${id}: death pose hook (own ${own.dead.toFixed(2)}, feel.deathPose ${!FC.NO_TOPPLE.has(id)})`);
  rows.push({ id, model: mm.creatureModels.has(id) ? 'reg' : d.model || id, tell, layer, own, hz: !!d.hazard });
  model.dispose?.();
}
ok(n >= 60, `covered ${n} creature types`);

// ---- the Creature Director monsters are distinct models now
const tris = (m) => { let t = 0; m.root.traverse((o) => { if (o.isMesh) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return t; };
for (const [id, base] of [['cd_dimmer', 'yoinker'], ['cd_follower', 'stalker'], ['cd_auditor', 'support']]) {
  const v = build(id, CREATURES[id]), b = createCreatureModel(base, { seed: 3 });
  ok(mm.creatureModels.has(id), `${id}: own model registered`);
  ok(tris(v) > tris(b) + 20 && v.parts.tell?.length >= 1, `${id}: extra silhouette geometry and a built-in tell`);
  ok(v.parts.tell.every((m) => (m.isMeshBasicMaterial || m.color) && Math.max(m.color.r, m.color.g, m.color.b) > 0.6), `${id}: tell is bright`);
  for (const st of ['idle', 'walk', 'run', 'attack', 'hurt', 'dead', 'feed', 'chase', 'audit']) v.update(0.016, { state: st, speed: 2, t: 0.3, time: 2, progress: 0 });
  const bb = new THREE.Box3().setFromObject(v.root), b2 = new THREE.Box3().setFromObject(b.root);
  ok(Number.isFinite(bb.max.y) && bb.max.y > b2.max.y * 0.99, `${id}: finite bounds, at least as tall as ${base}`);
  v.setElite(true); v.setTint('#ffb347', true); v.setHitFlash(0.5); v.dispose();
}

if (process.argv.includes('--table')) for (const r of rows) console.log(`| ${r.id} | ${r.model} | ${r.tell} | ${r.layer ? 'yes' : 'own'} | ${r.own.walk.toFixed(1)} / ${r.own.attack.toFixed(1)} / ${r.own.dead.toFixed(1)} |`);
console.log(fails ? `${fails} FAILED` : `creature_read: all ok (${n} types)`);
process.exit(fails ? 1 : 0);
