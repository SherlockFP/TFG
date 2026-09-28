// Node test for the DELETED USERS skeletons + the generic tier looks (no browser):  node tools/harness/skeletons.test.mjs
// Covers: skeleton defs / spawn tables / translations, the pure rules (shield arc, collapse / smash, archer wind-up + aim, tags),
// the tier look spec for all 6 tiers, the shared gear builders (triangle budget, materials, shader), the skeleton models (all states,
// bespoke tierRig) and attachTierLook on EVERY built-in creature model at every tier.
import * as THREE from 'three';
import * as D from '../../src/game/skeleton_data.js';
import * as TL from '../../src/render/tierlooks.js';
import * as SM from '../../src/models/skeletons.js';
import { createCreatureModel } from '../../src/models/creatures.js';
import { CREATURES } from '../../src/game/creatures.js';
import { ITEMS } from '../../src/game/items.js';
import { TIER_ORDER, TIERS } from '../../src/game/tiers.js';
import { registerSkeletonContent } from '../../src/game/skeletons.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } else console.log('ok  ', m); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const finiteGeo = (obj) => { let good = true; obj.traverse((o) => { if (o.isMesh) { const p = o.geometry.attributes.position.array; for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) good = false; } }); return good; };

// ------------------------------------------------------------------------------------------------ defs
registerSkeletonContent();
ok(D.SKEL_TYPES.length === 4 && D.SKEL_TYPES.every((t) => CREATURES[t]?.custom), 'four skeleton types registered through registerCreature');
for (const id of D.SKEL_TYPES) {
  const d = D.DEFS[id], c = CREATURES[id];
  ok(d && c && c.hp > 0 && c.dmg > 0 && c.walk > 0 && c.run >= c.walk && c.power > 0 && c.xp > 0 && c.radius > 0 && c.height > 0 && c.zone === 'in' && typeof c.behavior === 'function' && d.lore.length > 40 && d.deathText, `${id}: def valid (stats, zone, behaviour, lore, death text)`);
  ok(D.TR[d.name] && D.TR[d.lore] && D.TR[d.deathText], `${id}: English + Turkish name / lore / death text`);
  if (d.drop) ok(ITEMS[d.drop[0]] && d.drop[1] > 0 && d.drop[1] <= 1, `${id}: drop item ${d.drop[0]} exists`);
  ok(!d.compDrop || (d.compDrop.chance > 0 && d.compDrop.chance <= 1), `${id}: crafting component drop config sane`);
}
ok(D.DEFS.skel_walker.hp < D.DEFS.skel_knight.hp && D.DEFS.skel_swarm.hp < 15 && D.DEFS.skel_swarm.dmg <= 4, 'weak early: swarm hands are fragile, the Knight is the tank');
ok(D.SKEL_TYPES.every((t) => CREATURES[t].dmg < 25 && CREATURES[t].run < 4.6), 'base damage is low and nobody outruns a sprint (balance.scale adds sector scaling)');
const THEMES = ['mansion', 'hospital', 'backrooms', 'mineshaft', 'office', 'serverfarm', 'sewer', 'factory'];
for (const [id, e] of Object.entries(D.SPAWNS)) {
  ok(e.zone === 'in' && e.w.length === 4 && e.w.every((w) => w >= 0), `${id}: spawn weights for moon tiers 1..4`);
  ok(THEMES.every((th) => typeof e.interior[th] === 'number'), `${id}: multiplier for every interior theme`);
  const core = ['mansion', 'hospital', 'backrooms', 'mineshaft'].map((th) => e.interior[th]), rest = ['office', 'serverfarm', 'sewer', 'factory'].map((th) => e.interior[th]);
  ok(Math.min(...core) > Math.max(...rest) * 0.99 && Math.min(...core) >= 1, `${id}: mostly mansion / hospital / backrooms / mineshaft`);
}
ok(D.SPAWNS.skel_knight.w[0] === 0 && D.SPAWNS.skel_archer.w[0] === 0 && D.SPAWNS.skel_walker.w[0] > 0, 'knights and archers wait for moon tier 2; walkers appear from tier 1');
ok(D.NIGHT.from === 1110 && D.NIGHT.to > D.NIGHT.from && D.NIGHT.gapMin < D.NIGHT.gapMax, 'night window 18:30 -> late');
ok(Object.keys(D.IDENT_ROWS).length === 4 && Object.values(D.IDENT_ROWS).every((r) => ['Predator', 'Territorial', 'Swarm'].includes(r[0]) && r[1] >= 1 && r[1] <= 5 && r[2].length > 20), 'identification rows (class, stars, hint) for every skeleton');
ok(D.SKEL_GEAR && TIER_ORDER.every((t) => D.SKEL_GEAR[t]), 'bespoke skeleton gear documented for every tier');

// ------------------------------------------------------------------------------------------------ rules
ok(D.archerWindup(0) > D.archerWindup(6) && D.archerWindup(20) >= 0.6 && D.archerWindup(0) > 1, 'archer wind-up is long early, shorter later, never below 0.6 s');
ok(D.archerLead(0) < D.archerLead(6) && D.archerLead(99) <= 0.85, 'archer leads targets weakly early');
ok(D.archerCooldown(0, 0) > D.archerCooldown(8, 0) && D.archerCooldown(99, 0) >= 1.3, 'archer cooldown shrinks with sector');
ok(D.inShieldArc(0, 0, 0, 0, 5) && !D.inShieldArc(0, 0, 0, 0, -5) && !D.inShieldArc(0, 0, 0, 5, 0) && D.inShieldArc(0, 0, 0, 3, 5), 'shield arc: front yes, behind / flank no, front-diagonal yes (yaw 0 faces +z)');
ok(D.inShieldArc(Math.PI / 2, 0, 0, 5, 0) && !D.inShieldArc(Math.PI / 2, 0, 0, -5, 0), 'shield arc follows the knight yaw');
ok(D.isHeavy(5, { crit: true }) && D.isHeavy(5, { stun: 0.5 }) && D.isHeavy(40) && !D.isHeavy(12), 'heavy hit = crit / stun / big number');
let r = D.knightHit(20, { front: true });
ok(r.blocked && near(r.amount, 20 * D.TUNING.shieldChip) && !r.stagger, 'frontal hit is blocked to a chip');
r = D.knightHit(20, { front: true, heavy: true });
ok(r.blocked && r.stagger && r.amount === 10, 'heavy frontal hit staggers');
ok(!D.knightHit(20, { front: false }).blocked && !D.knightHit(20, { front: true, guardDown: true }).blocked && !D.knightHit(20, { front: true, pierce: true }).blocked, 'flank / staggered / piercing hits go through');
ok(D.walkerHit({ hp: 10, eff: 4 }).act === 'none', 'walker: normal hit');
r = D.walkerHit({ hp: 10, eff: 10 });
ok(r.act === 'collapse' && r.cap === 9, 'walker: first lethal hit collapses it at 1 HP');
ok(D.walkerHit({ hp: 1, eff: 3, collapsed: true }).act === 'smash' && D.walkerHit({ hp: 1, eff: 0, collapsed: true }).act === 'none', 'walker: any hit while collapsed smashes the skull');
ok(D.walkerHit({ hp: 10, eff: 99, rebuilt: true }).act === 'none', 'walker: after reassembling it dies normally');
ok(D.TUNING.smashWindow === 4 && D.TUNING.riseHp > 0 && D.TUNING.riseHp < 1, 'smash window 4 s, partial HP on rebuild');
// projectile: aim, fly, land on the target
{
  const from = { x: 0, y: 1.4, z: 0 }, to = { x: 9, y: 1.0, z: 4 };
  const v = D.aimVelocity(from, to);
  const p = { x: 0, y: 1.4, z: 0, vx: v.vx, vy: v.vy, vz: v.vz, t: 0 };
  let best = 1e9;
  for (let i = 0; i < 200; i++) { D.stepProjectile(p, 0.01); best = Math.min(best, Math.hypot(p.x - to.x, p.y - to.y, p.z - to.z)); }
  ok(best < 0.25, `archer aim compensates gravity (closest approach ${best.toFixed(3)} m)`);
}
{
  const a = D.tagFor(12345), b = D.tagFor(12345), c = D.tagFor(99);
  ok(a.name === b.name && a.suffix === b.suffix && a.num === b.num && D.TAG_NAMES.includes(a.name) && D.TAG_SUFFIX.includes(a.suffix) && (a.name !== c.name || a.suffix !== c.suffix), 'deleted-user tags are deterministic per seed');
  ok(D.TAG_SUFFIX.every((s) => D.TR[s]), 'tag suffixes have Turkish text');
}

// ------------------------------------------------------------------------------------------------ tier look spec (all 6 tiers)
const S = TL.TIER_LOOK_SPEC;
ok(TIER_ORDER.every((t) => S[t]) && Object.keys(S).length === 6, 'look spec covers Common..Mythic');
ok(TIER_ORDER.every((t, i) => S[t].level === i), 'look levels 0..5 in tier order');
ok(!S.common.plates && !S.common.tint && !S.common.cape, 'Common = base look');
ok(S.uncommon.plates === 'scrap' && /^#[0-9a-f]{6}$/i.test(S.uncommon.tint) && parseInt(S.uncommon.tint.slice(3, 5), 16) > parseInt(S.uncommon.tint.slice(1, 3), 16) && !S.uncommon.helmet && !S.uncommon.shield, 'Uncommon = green tint + scrap plates only');
ok(S.rare.plates === 'iron' && S.rare.helmet && S.rare.shield && parseInt(S.rare.tint.slice(5, 7), 16) > parseInt(S.rare.tint.slice(1, 3), 16), 'Rare = blue tint + iron plates + helmet + shield');
ok(S.epic.runes && S.epic.eyes && S.epic.plates === 'heavy' && !S.epic.trim, 'Epic = runes + glowing eyes + heavier armour');
ok(S.legendary.trim && S.legendary.cape && S.legendary.embers && S.legendary.plates === 'gold', 'Legendary = gold trim + cape + embers');
ok(S.mythic.glitch && S.mythic.crown && S.mythic.halo && S.mythic.distortion && S.mythic.plates === 'glitch' && S.mythic.cape, 'Mythic = glitch armour + crown + halo + distortion');
ok(TIER_ORDER.slice(1).every((t) => TL.PLATE_STYLES.includes(S[t].plates) && /^#[0-9a-f]{6}$/i.test(S[t].armor) && /^#[0-9a-f]{6}$/i.test(S[t].bone)), 'plate styles + armour / bone colours valid');
ok(TIER_ORDER.slice(3).every((t) => /^#[0-9a-f]{6}$/i.test(S[t].glow)), 'Epic+ have a glow colour');
ok(TL.NO_LOOK.has('zombot') && !TL.NO_LOOK.has('scuttler'), 'instanced zombot body is the one exclusion');
ok(TIER_ORDER.every((t) => TIERS[t]), 'spec tiers exist in game/tiers.js');

// ------------------------------------------------------------------------------------------------ gear builders
const T = { style: 'humanoid', cx: 0, cy: 1.1, cz: 0, w: 0.45, h: 0.5, d: 0.25, H: 1.75 };
const B = { style: 'beast', cx: 0, cy: 0.4, cz: 0, w: 0.8, h: 0.4, d: 0.7, H: 0.7 };
const HF = { cx: 0, cy: 0.05, cz: 0, w: 0.2, h: 0.22, d: 0.22 };
let prevTris = -1;
for (const tier of TIER_ORDER) {
  const g = TL.buildAllGear(tier, T, HF, { pos: [0, 0, 0], rot: [0, 0, 0], r: 0.2 });
  const total = TL.gearTriangles(g.torso) + TL.gearTriangles(g.head) + TL.gearTriangles(g.shield) + TL.gearTriangles(g.cape?.group) + TL.gearTriangles(g.halo);
  if (tier === 'common') { ok(!g.torso && !g.head && !g.shield && !g.cape && !g.halo && total === 0, 'common: no gear'); continue; }
  ok(g.torso && finiteGeo(g.torso) && (!g.head || finiteGeo(g.head)), `${tier}: torso gear built, finite geometry`);
  ok(total < 1500 && total > prevTris, `${tier}: ${total} gear triangles (budget < 1500, grows with the tier)`);
  prevTris = total;
  ok((tier === 'uncommon') === !g.head, `${tier}: helmet only from Rare up (generic)`);
  ok(!!g.shield === (S[tier].level >= 2) && !!g.cape === S[tier].cape && !!g.halo === S[tier].halo, `${tier}: shield / cape / halo as specified`);
  const mats = new Set(); g.torso.traverse((o) => { if (o.isMesh) mats.add(o.material); });
  ok([...mats].every((m) => m.userData.noTint && m.userData.tierLook), `${tier}: gear materials are shared + marked noTint (Tinter leaves them alone)`);
  ok(g.torso.children.length <= 3, `${tier}: <= 3 merged meshes for the torso gear`);
  ok(g.torso.children.every((m) => m.userData.tierGear), `${tier}: gear meshes are tagged (excluded from bounding boxes)`);
  const g2 = TL.makeTorsoGear(tier, T);
  ok(g2.children[0].geometry === g.torso.children[0].geometry, `${tier}: identical frames share one cached geometry`);
  const gb = TL.makeTorsoGear(tier, B);
  ok(gb && finiteGeo(gb), `${tier}: beast-shaped bodies get dorsal plates`);
}
{
  const gm = TL.glitchMat();
  ok(gm.isShaderMaterial && gm.uniforms.uTime && gm.fog === true && TL.plateMat('mythic') === gm && TL.clothMat('mythic') === gm, 'mythic plates / cape share ONE animated scanline shader material');
  ok(/sin\(vP\.y/.test(gm.fragmentShader) && /uTime/.test(gm.vertexShader), 'shader has animated scanlines + vertex glitch');
  ok(TL.plateMat('rare') === TL.plateMat('rare') && TL.plateMat('rare') !== TL.plateMat('epic'), 'plate materials shared per tier');
}
{
  const f = TL.torsoFrameFromBounds(new THREE.Box3(new THREE.Vector3(-0.4, 0, -0.25), new THREE.Vector3(0.4, 1.8, 0.25)));
  ok(f.style === 'humanoid' && f.cy > 0.9 && f.cy < 1.3 && f.w < 0.8 && f.d < 0.5, 'bbox -> humanoid torso frame');
  const f2 = TL.torsoFrameFromBounds(new THREE.Box3(new THREE.Vector3(-1, 0, -0.6), new THREE.Vector3(1, 0.6, 0.6)));
  ok(f2.style === 'beast' && f2.cy > 0.2 && f2.w > 0.5, 'bbox -> beast frame for wide / low bodies');
}

// ------------------------------------------------------------------------------------------------ skeleton models
const STATES = ['idle', 'walk', 'run', 'flee', 'attack', 'draw', 'throw', 'stunned', 'collapsed', 'rise', 'dead', 'unknown'];
const MODELS = { skel_walker: SM.createBoneWalkerModel, skel_archer: SM.createBoneArcherModel, skel_knight: SM.createBoneKnightModel, skel_swarm: SM.createBoneSwarmModel };
const numsOk = (root) => { let good = true; root.traverse((o) => { for (const k of ['x', 'y', 'z']) { if (!Number.isFinite(o.position[k]) || !Number.isFinite(o.rotation[k]) || !Number.isFinite(o.scale[k])) good = false; } }); return good; };
for (const [id, make] of Object.entries(MODELS)) {
  const m = make({ seed: 5 });
  let tris = 0; m.root.traverse((o) => { if (o.isMesh) tris += o.geometry.attributes.position.count / 3; });
  ok(m.root && m.parts.head && m.height > 0.3 && m.radius > 0.1 && typeof m.tierRig === 'function' && typeof m.setTint === 'function' && typeof m.setHitFlash === 'function' && typeof m.dispose === 'function', `${id}: model contract`);
  ok(tris < 1800, `${id}: ${Math.round(tris)} triangles`);
  for (const st of STATES) for (const t of [0, 0.3, 0.9, 2]) m.update(0.03, { state: st, t, time: t + 1, speed: 3 });
  ok(numsOk(m.root), `${id}: every state animates without NaN`);
  m.setElite(true); m.setTint('#b35cff', true); m.setHitFlash(1); m.update(0.03, { state: 'idle', t: 0, time: 0, speed: 0 }); m.setElite(false);
  ok(numsOk(m.root), `${id}: elite / tint / hit flash`);
  for (const tier of TIER_ORDER.slice(1)) {
    const mm = make({ seed: 9 });
    const rig = mm.tierRig(S[tier]);
    ok(rig && rig.torso?.parent && rig.torso.frame.w > 0.05 && rig.head?.parent && rig.head.frame.w > 0.02, `${id} @ ${tier}: bespoke rig frames`);
    ok(numsOk(mm.root), `${id} @ ${tier}: rig call keeps the model valid`);
    mm.dispose();
  }
  m.dispose();
}
{
  const a = SM.createBoneArcherModel({ seed: 1 }), b = SM.createBoneArcherModel({ seed: 2 });
  a.update(0.03, { state: 'draw', t: 0.9, time: 1 }); b.update(0.03, { state: 'draw', t: 0.9, time: 1 });
  const held = (m) => { const out = []; m.root.traverse((o) => { if (o.name === 'held' && o.visible && o.material.color.g < 0.5) out.push(o); }); return out.length; };
  ok(held(a) === 1 && held(b) === 1, 'archer: the held projectile glows red during the wind-up (bone shard / CD by seed)');
  a.update(0.03, { state: 'idle', t: 0, time: 2 });
  ok(held(a) === 0, 'archer: projectile hidden again after the throw');
}
{
  const c = SM.createProjectileMesh(0), d = SM.createProjectileMesh(1);
  ok(c.geometry !== d.geometry && c.userData.tierGear && SM.createProjectileMesh(0).geometry === c.geometry, 'projectile meshes share geometry per type');
}

// ------------------------------------------------------------------------------------------------ attachTierLook on EVERY built-in creature model x all tiers
function fakeView(type, model, tier) {
  const root = model.root;
  const scene = new THREE.Group(); scene.add(root);
  return { id: 'c1', type, def: CREATURES[type] || {}, tier, model, root, pos: new THREE.Vector3(3, 0, 4), state: 'idle', radius: model.radius, height: model.height, affix: null, variant: null, alpha: 1 };
}
const bursts = { ember: 0, glitch: 0 };
const fakeGame = { time: 5, camera: { position: new THREE.Vector3(0, 1, 0) }, particles: { burst: (p, o) => { if (o === 'glitch') bursts.glitch++; else if (o?.gravity < 0 && o?.life > 1) bursts.ember++; } } };
let modelCount = 0, skipped = 0, worst = 0;
const ids = Object.keys(CREATURES).filter((k) => !CREATURES[k].hazard && !TL.NO_LOOK.has(k));
for (const id of ids) {
  let base;
  try { base = createCreatureModel(id, { seed: 3 }); } catch { skipped++; continue; }
  modelCount++;
  base.dispose();
  for (const tier of TIER_ORDER) {
    const model = createCreatureModel(id, { seed: 3 });
    const v = fakeView(id, model, tier);
    const before = new THREE.Box3().setFromObject(v.root);
    let look = null;
    try { look = TL.attachTierLook(v); } catch (e) { ok(false, `${id} @ ${tier}: attachTierLook threw ${e.message}`); continue; }
    if (tier === 'common') { if (look) ok(false, `${id}: common must not get gear`); continue; }
    if (!look || !look.objs.length) { ok(false, `${id} @ ${tier}: no gear attached`); continue; }
    const after = new THREE.Box3().setFromObject(v.root);
    const grow = Math.max(after.max.x - after.min.x, after.max.y - after.min.y, after.max.z - after.min.z) / Math.max(1e-6, Math.max(before.max.x - before.min.x, before.max.y - before.min.y, before.max.z - before.min.z));
    worst = Math.max(worst, grow);
    if (!(grow < 1.9) || !finiteGeo(v.root)) ok(false, `${id} @ ${tier}: gear sized wrongly (bbox x${grow.toFixed(2)})`);
    if (TL.attachTierLook(v) !== null) ok(false, `${id} @ ${tier}: attach must be idempotent`);
    TL.tierLooksUpdate(0.016, fakeGame);
    model.dispose();
    TL.clearTierLooks();
  }
}
ok(modelCount >= 20, `attachTierLook ran on ${modelCount} built-in creature models x 6 tiers (${skipped} without a procedural model), worst bbox growth x${worst.toFixed(2)}`);
// the skeletons take the bespoke rig path: gear is parented to bones (torso / skull / forearm), so it follows the animation
{
  let good = 0, total = 0;
  for (const [id, make] of Object.entries(MODELS)) {
    for (const tier of TIER_ORDER.slice(1)) {
      const model = make({ seed: 7 });
      const v = fakeView(id, model, tier);
      const look = TL.attachTierLook(v);
      total++;
      if (look && look.objs.length >= 1 && look.objs.every((o) => o.parent && o.parent !== v.root) && finiteGeo(v.root)) good++;
      else console.error('  bad rig look', id, tier, look?.objs.length);
      for (const st of ['walk', 'attack', 'collapsed', 'dead']) model.update(0.03, { state: st, t: 0.4, time: 2, speed: 2 });
      TL.tierLooksUpdate(0.016, fakeGame);
      TL.clearTierLooks(); model.dispose();
    }
  }
  ok(good === total, `skeleton models: bone-attached gear at every tier (${good}/${total})`);
  const kn = SM.createBoneKnightModel({ seed: 3 }); const kv = fakeView('skel_knight', kn, 'rare');
  const kl = TL.attachTierLook(kv);
  ok(kl.objs.every((o) => o.name !== 'tierShield') && !kl.objs.some((o) => o.name === 'tierHead'), 'knight keeps its own shield / helm at Rare (no double helmet or buckler)');
  const km = SM.createBoneKnightModel({ seed: 3 }); const kv2 = fakeView('skel_knight', km, 'mythic'); const kl2 = TL.attachTierLook(kv2);
  ok(kl2.objs.some((o) => o.name === 'tierHead') && kl2.halo && kl2.cape, 'knight at Mythic: crown spikes + halo + glitch cape on top of its helm');
  TL.clearTierLooks();
}
// animated bits: cape sway, halo spin, embers (Legendary), distortion (Mythic)
{
  for (const tier of ['legendary', 'mythic']) {
    const model = createCreatureModel('moderator', { seed: 3 });
    const v = fakeView('moderator', model, tier);
    const look = TL.attachTierLook(v);
    const cape0 = look.cape.p1.rotation.x;
    const halo0 = look.halo?.rotation.y ?? 0;
    for (let i = 0; i < 120; i++) { fakeGame.time += 0.016; TL.tierLooksUpdate(0.016, fakeGame); }
    ok(look.cape && look.cape.p1.rotation.x !== cape0, `${tier}: cape sways`);
    if (tier === 'mythic') ok(look.halo && look.halo.rotation.y > halo0 && bursts.glitch > 0 && TL.glitchMat().uniforms.uTime.value === fakeGame.time, 'mythic: halo spins, distortion particles, shader clock advances');
    else ok(bursts.ember > 0, 'legendary: orange embers');
    v.state = 'dead'; TL.tierLooksUpdate(0.016, fakeGame);
    ok(TL.tierLookCount() === 0, `${tier}: dead creatures stop animating`);
    TL.clearTierLooks();
  }
}
// Uncommon / Rare tint hook is called with the tier colour, Epic+ is left to creature_tiers
{
  const calls = [];
  for (const tier of ['uncommon', 'rare', 'epic']) {
    const model = createCreatureModel('scuttler', { seed: 3 });
    const orig = model.setTint; model.setTint = (c, s) => { calls.push([tier, c, s]); orig.call(model, c, s); };
    TL.attachTierLook(fakeView('scuttler', model, tier));
    TL.clearTierLooks();
  }
  ok(calls.length === 2 && calls[0][1] === S.uncommon.tint && calls[1][1] === S.rare.tint && calls.every((c) => c[2] === false), 'Uncommon / Rare body tint from the spec; Epic+ tint stays in creature_tiers');
}

console.log(fails ? `\n${fails} FAILED` : '\nall skeleton / tier look checks passed');
process.exit(fails ? 1 : 0);
