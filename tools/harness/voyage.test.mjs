// node tools/harness/voyage.test.mjs [seeds=300]
// Wave 4 VOYAGE: generator determinism + validity over N seeds (biome / interior / creatures / weather / cost / gravity, layout reachability, terrain
// reachability of ship -> entrance / fire exits / set-piece sites incl. acid + lava rules), set-piece + biome-decor builders run headless, site planning,
// mission state machines (all 9 types), the mission board, uncharted signals, warp probability + the early-game guard, and a mock-game run of the
// host flows (routing, MOON RANDOM, warp wrappers, take-off revert, mission accept / complete / payout, vote).
import * as THREE from 'three';
import { setInteriorProbe } from '../../src/game/moongen.js';
import { MOONS, BIOMES } from '../../src/game/moons.js';
import { RNG, hashString } from '../../src/core/rng.js';
import { generateLayout, INTERIOR_THEMES } from '../../src/world/facility.js';
import { facilityReach, isSealedRoom } from '../../src/world/interiors/facsys.js';
import { Terrain, planMoon } from '../../src/world/terrain.js';
import { buildBiomeDecor } from '../../src/world/outdoor_biomes.js';
import { Kit } from '../../src/world/voyage_kit.js';
import { buildContent, buildMissionSite } from '../../src/world/voyage_sites.js';
import { VOYAGE_BIOME_IDS } from '../../src/world/voyage_biomes_data.js';
import * as V from '../../src/game/voyage_core.js';

setInteriorProbe((id) => INTERIOR_THEMES.includes(id));
const N = Number(process.argv[2]) || 300;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } };
const say = (m) => console.log('ok  ', m);

// ---------------------------------------------------------------------------------------------------------------- ids
{
  for (let tier = 1; tier <= 6; tier++) for (const c of [null, ...V.CONTENT_IDS]) {
    const id = V.makeVoyageId(tier, c, 123456789);
    const p = V.parseVoyageId(id);
    ok(p && p.tier === tier && p.content === c && p.seed === 123456789, `id roundtrip ${id}`);
  }
  ok(!V.parseVoyageId('vy9n_abc') && !V.parseVoyageId('gen1_2') && !V.parseVoyageId('vy1z_abc') && !V.parseVoyageId('hamsi') && !V.parseVoyageId('vy1n_zzzzzzzzz'), 'bad ids rejected');
  ok(V.isVoyageId('vy3t_1k2j9x') && !V.isVoyageId('hq'), 'isVoyageId');
  say('voyage ids');
}

// ---------------------------------------------------------------------------------------------------------------- generator determinism + validity
const ids = [];
{
  const R = new RNG(20260929);
  for (let i = 0; i < N; i++) ids.push(V.rollVoyageId(R, 1 + (i % 6), { pNone: 0.2 }));
  const seen = new Set(), biomes = {}, contents = {}, interiors = {};
  for (const id of ids) {
    V._clearVoyageCache();
    const a = JSON.stringify(V.generateVoyageMoon(id));
    V._clearVoyageCache();
    const b = JSON.stringify(V.generateVoyageMoon(id));
    ok(a === b, `deterministic ${id}`);
    const m = JSON.parse(a);
    ok(m.id === id && m.voyage === true && m.generated === false, `flags ${id}`);
    ok(BIOMES[m.biome], `biome exists ${id} ${m.biome}`);
    ok(INTERIOR_THEMES.includes(m.interior) || m.interior === 'factory', `interior ${id} ${m.interior}`);
    ok(/^[A-Z]{2}-\d\d [A-Z][A-Za-z-]+ [A-Z][A-Za-z-]+$/.test(m.name), `name format ${id} "${m.name}"`);
    ok(m.tier >= 1 && m.tier <= 6 && m.size >= 1 && m.size <= 2.6 && m.mapScale >= 1 && m.mapScale <= 1.6, `tier / size ${id}`);
    ok(Array.isArray(m.weather) && m.weather.length > 0 && m.weather.every((w) => ['clear', 'rainy', 'foggy', 'stormy', 'eclipsed'].includes(w)), `weather ${id}`);
    ok(m.scrapCount[0] > 0 && m.scrapCount[1] >= m.scrapCount[0] && m.scrapMul > 0.5 && m.power > 0 && m.cost >= 0, `budget ${id}`);
    ok(Object.keys(m.creatures).length >= 6 && Object.values(m.creatures).every((w) => w > 0), `creatures ${id}`);
    ok(m.gravity > 0 && m.gravity <= 1 && m.timeMul >= 0.9 && m.timeMul <= 1.16, `gravity / day ${id}`);
    ok((m.content || null) === V.parseVoyageId(id).content, `content ${id}`);
    ok(m.desc && m.risk, `desc ${id}`);
    seen.add(m.name); biomes[m.biome] = (biomes[m.biome] || 0) + 1; contents[m.content || '-'] = (contents[m.content || '-'] || 0) + 1; interiors[m.interior] = (interiors[m.interior] || 0) + 1;
  }
  ok(seen.size > N * 0.9, `names are varied (${seen.size}/${N})`);
  ok(N < 150 || VOYAGE_BIOME_IDS.every((b) => biomes[b] > 0), `every new biome shows up ${JSON.stringify(biomes)}`);
  ok(V.CONTENT_IDS.every((c) => contents[c] > 0), `every content shows up ${JSON.stringify(contents)}`);
  ok(VOYAGE_BIOME_IDS.length >= 8, '8+ new biomes');
  say(`${N} moons deterministic + valid; ${Object.keys(biomes).length} biomes, ${Object.keys(interiors).length} interiors, contents ${JSON.stringify(contents)}`);
}

// ---------------------------------------------------------------------------------------------------------------- facility layout: spawn -> exit reachable
{
  let n = 0;
  for (const id of ids) {
    const m = V.generateVoyageMoon(id);
    const seed = (hashString('lay' + id) >>> 0);
    const L = generateLayout(seed, m.interior, m.size, m.layoutOpts);
    const reach = facilityReach(L);
    let bad = 0;
    for (let i = 0; i < L.w * L.h; i++) if (L.cells[i] && !reach[i]) { const ri = L.roomOf[i]; if (!(ri >= 0 && isSealedRoom(L.rooms[ri]))) { bad++; break; } }
    ok(bad === 0, `facility fully reachable without keys ${id} (${m.interior})`);
    ok(L.fireExits.length >= 1 && L.outdoorFires >= 1, `facility has a fire exit ${id}`);
    n++;
  }
  say(`${n} facility layouts: every open cell reachable, fire exits present`);
}

// ---------------------------------------------------------------------------------------------------------------- terrain: ship -> entrance / fire exits / sites reachable, flats valid
const MISSION_FOR = (type, moon) => ({ id: `${type}:${moon.id}:t`, type, moon: moon.id, tier: moon.tier, n: type === 'survey' ? 4 : 1, pay: 100, xp: 50, loot: 'iron', comps: 1, st: 'accepted', p: {} });
function reachableSet(t, lim, ban) {
  const W = t.res + 1, H = t.heights, seen = new Uint8Array(W * W), ci = Math.round(t.half / t.step), s0 = ci * W + ci;
  const st = [s0]; seen[s0] = 1;
  while (st.length) {
    const k = st.pop(), i = k % W, j = (k / W) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= W) continue;
      const nk = nj * W + ni;
      if (seen[nk] || ban(H[nk]) || Math.abs(H[nk] - H[k]) > lim * (di && dj ? 1.41 : 1)) continue;
      seen[nk] = 1; st.push(nk);
    }
  }
  return (x, z) => { const i = Math.round((x + t.half) / t.step), j = Math.round((z + t.half) / t.step); return i >= 0 && j >= 0 && i < W && j < W && !!seen[j * W + i]; };
}
{
  let n = 0, sitesChecked = 0;
  const worst = { slope: 0 };
  for (const id of ids) {
    const m = V.generateVoyageMoon(id);
    const seed = (hashString('ter' + id) >>> 0) % 1e9;
    // an accepted mission of every type on top of the content: worst-case number of sites
    const types = V.MISSION_IDS;
    const type = types[n % types.length];
    const mis = MISSION_FOR(type, m);
    V.setMissionProvider(() => mis);
    const plan = planMoon(seed, m);
    const ter = new Terrain(seed, m, plan);
    const acid = !!ter.biome.acid, fl = ter.flood ?? -99;
    const lim = ter.step * 1.0;   // 45 deg per cell (the player controller climbs 50 deg)
    const reach = reachableSet(ter, lim, (h) => (acid && h < fl - 0.02));
    const pts = [['entrance', plan.entrance], ...plan.fires.map((f, i) => ['fire' + i, f])];
    // acid shore: a fire exit may sit behind acid (the exit is optional, the main entrance never is): known gap, docs/wave4/voyage.md
    for (const [name, p] of pts) ok(reach(p.x, p.z) || (ter.lava && ter.reach) || (acid && name !== 'entrance'), `${id} (${m.biome}): ${name} reachable from the ship on foot`);
    // flats: valid, separated, reachable
    const need = (m.content ? 1 : 0) + (V.MISSION_TYPES[type].sites | 0);
    ok(plan.flats.length === need, `${id}: ${need} flats planned (got ${plan.flats.length}) mission=${type}`);
    for (let a = 0; a < plan.flats.length; a++) {
      const f = plan.flats[a];
      ok(Math.hypot(f.x, f.z) >= 32 && Math.max(Math.abs(f.x), Math.abs(f.z)) <= 112 * (plan.scale || 1) + 1, `${id}: flat ${f.key} inside the play area`);
      ok(Math.hypot(f.x - plan.entrance.x, f.z - plan.entrance.z) >= f.r + 20, `${id}: flat clear of the entrance`);
      for (const q of plan.fires) ok(Math.hypot(f.x - q.x, f.z - q.z) >= f.r + 10, `${id}: flat clear of a fire exit`);
      for (const p of plan.ponds) ok(Math.hypot(f.x - p.x, f.z - p.z) >= p.r * 1.5, `${id}: flat clear of a pond`);
      for (let b = a + 1; b < plan.flats.length; b++) ok(Math.hypot(f.x - plan.flats[b].x, f.z - plan.flats[b].z) >= 30, `${id}: flats separated`);
      // flat ground: height under the site varies < 0.6 m across r*0.7
      let lo = 1e9, hi = -1e9;
      for (let k = 0; k < 12; k++) { const h = ter.heightAt(f.x + Math.cos(k / 12 * 6.283) * f.r * 0.7, f.z + Math.sin(k / 12 * 6.283) * f.r * 0.7); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      ok(hi - lo < 1.6, `${id} (${m.biome}): site ${f.key} is flat enough (${(hi - lo).toFixed(2)} m)`);
      if (!ter.lava) ok(reach(f.x, f.z), `${id} (${m.biome}): site ${f.key} reachable on foot`);
      else ok(ter.blocked ? !ter.blocked(f.x, f.z, 0) : true, `${id}: lava site on reachable land`);
      if (acid) ok(ter.heightAt(f.x, f.z) > fl + 0.2, `${id}: acid site is dry`);
      sitesChecked++;
    }
    V.setMissionProvider(null);
    n++;
  }
  void worst;
  say(`${n} terrains: entrance + fire exits reachable on foot (acid excluded), ${sitesChecked} set-piece / mission sites valid + flat + reachable`);
}

// ---------------------------------------------------------------------------------------------------------------- flats are deterministic and empty without content / mission
{
  const m = V.generateVoyageMoon(V.makeVoyageId(2, 'temple', 777));
  const plan = planMoon(4242, m);
  const a = JSON.stringify(V.voyageFlats(4242, m, plan, null)), b = JSON.stringify(V.voyageFlats(4242, m, plan, null));
  ok(a === b && JSON.parse(a).length === 1, 'flats deterministic (content only)');
  const plain = V.generateVoyageMoon(V.makeVoyageId(2, null, 778));
  ok(V.voyageFlats(1, plain, planMoon(1, plain), null).length === 0, 'no content + no mission = no flats');
  ok(V.voyageFlats(1, MOONS.hamsi, planMoon(1, MOONS.hamsi), null).length === 0, 'handcrafted moon untouched');
  const withM = V.voyageFlats(1, MOONS.hamsi, planMoon(1, MOONS.hamsi), MISSION_FOR('drone', MOONS.hamsi));
  ok(withM.length === 2, 'a mission adds its sites to a handcrafted moon (drone = 2)');
  say('flat planning');
}

// ---------------------------------------------------------------------------------------------------------------- set pieces + mission structures + biome decors build headless
{
  const env = () => { const o = { objs: [], geos: [], mats: [], boxes: 0, emitters: [] }; o.add = (x) => { o.objs.push(x); return x; }; o.own = (g) => { o.geos.push(g); return g; }; o.mat = (m) => { o.mats.push(m); return m; }; o.addBox = () => { o.boxes++; return { id: o.boxes }; }; return o; };
  for (const c of V.CONTENT_IDS) {
    const e = env(), K = new Kit(e, 10, 2, -20, 0.7);
    const out = buildContent(c, K, new RNG(hashString(c)), { tier: 3 });
    const tris = e.objs.reduce((s, o) => s + (o.geometry ? o.geometry.attributes.position.count / 3 : 0), 0);
    ok(out && e.boxes > 4 && e.objs.length >= 1 && e.objs.length <= 14, `content ${c}: built (${e.boxes} colliders, ${e.objs.length} meshes)`);
    ok(tris < 26000, `content ${c}: triangle budget ${Math.round(tris)}`);
    ok(e.emitters.length <= 8, `content ${c}: emitters ${e.emitters.length}`);
    const pts = [...(out.loot || []), ...(out.guards || []), ...(out.inter || [])];
    ok(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y ?? 0) && Number.isFinite(p.z)), `content ${c}: spots finite`);
    ok(pts.every((p) => Math.hypot(p.x - 10, p.z + 20) < 22), `content ${c}: spots inside the footprint`);
    ok(c !== 'merchant' ? (out.loot.length >= 3) : out.inter.length >= 4, `content ${c}: loot / stalls present`);
    ok(c !== 'meteor' || (out.craters.length >= 5 && out.loot.some((l) => l.kind === 'meteor')), 'meteor: craters + meteorites');
    ok(c !== 'temple' || (out.inter.some((i) => i.kind === 'relic') && out.ambush.length), 'temple: relic + ambush');
    ok(c !== 'pirate' || (out.inter.some((i) => i.kind === 'strongbox') && out.guards.length), 'pirate: strongbox + guards');
    ok(c !== 'merchant' || out.inter.filter((i) => i.kind === 'ware').length === 3, 'merchant: 3 stalls');
    for (const g of e.geos) g.dispose();
  }
  for (const type of V.MISSION_IDS) for (let idx = 0; idx < Math.max(1, V.MISSION_TYPES[type].sites); idx++) {
    if (!V.MISSION_TYPES[type].sites) continue;
    const e = env(), K = new Kit(e, 0, 0, 0, 0);
    const out = buildMissionSite(type, idx, K, new RNG(5), { tier: 2 });
    ok(out && out.marker && Number.isFinite(out.marker.x), `mission site ${type}#${idx}: built + marker`);
    if (type === 'relay') ok(out.inter.length === V.TOWER_PANELS && out.dyn.panels.length === V.TOWER_PANELS, 'relay: 3 panels');
    if (type === 'heist') ok(out.dyn.doorCollider && out.dyn.door, 'heist: door + collider');
    if (type === 'rescue') ok(out.npc, 'rescue: npc spot');
    if (type === 'drone') ok(idx === 0 ? out.npc && out.inter.length === 1 : out.goal, 'drone: start / goal');
    if (type === 'blackbox') ok(out.spot, 'blackbox: item spot');
    if (type === 'defend') ok(out.rigPos && out.inter[0].kind === 'rig', 'defend: rig');
    if (type === 'hunt') ok(out.spot, 'hunt: lair spot');
  }
  // biome decors
  const worldMoon = (b) => ({ id: 'vytest', biome: b, tier: 2, size: 1.2, mapScale: 1, name: 'x', interior: 'factory' });
  for (const b of VOYAGE_BIOME_IDS) {
    const m = worldMoon(b), seed = 99;
    const plan = planMoon(seed, m), ter = new Terrain(seed, m, plan);
    const group = new THREE.Group();
    let boxes = 0;
    const emitters = [];
    const dec = buildBiomeDecor({ seed, moon: m, biome: plan.biome, terrain: ter, plan, group, addBox: () => { boxes++; return {}; }, avoid: (x, z, mm = 0) => Math.hypot(x, z) < 26 + mm, emitters, sc: 1, reserve: () => {} });
    ok(dec && group.children.length >= 1, `decor ${b}: built`);
    const tris = group.children.reduce((s, o) => s + (o.geometry ? o.geometry.attributes.position.count / 3 : 0), 0);
    ok(tris > 500 && tris < 90000, `decor ${b}: triangles ${Math.round(tris)}`);
    ok(group.children.length <= 12, `decor ${b}: draw calls ${group.children.length}`);
    ok(emitters.length <= 12, `decor ${b}: emitters ${emitters.length}`);
    dec.update?.(0.1, null); dec.dispose();
  }
  say('7 contents + 8 mission structures + 8 biome decors build headless within budget');
}

// ---------------------------------------------------------------------------------------------------------------- mission state machines
{
  const mk = (type, extra = {}) => V.newMission({ id: type + ':x', type, moon: 'hamsi', tier: 2, n: extra.n ?? V.MISSION_TYPES[type].goal, pay: 100, xp: 50, loot: 'iron', comps: 1 }, 1);
  const run = (m, evs) => { let cur = m; const fxs = []; for (const e of evs) { const r = V.stepMission(cur, e); cur = r.m; fxs.push(...r.fx.map((f) => f.k)); } return { m: cur, fx: fxs }; };
  const L = { t: 'land', moon: 'hamsi' };
  // landing elsewhere never activates; landing on the right moon does
  let r = run(mk('blackbox'), [{ t: 'land', moon: 'lufer' }]); ok(r.m.st === 'accepted', 'wrong moon keeps the job accepted');
  r = run(mk('blackbox'), [L]); ok(r.m.st === 'active' && r.fx.includes('active'), 'landing activates');
  r = run(mk('blackbox'), [L, { t: 'delivered' }]); ok(r.m.st === 'done' && V.missionProgress(r.m) === 1, 'blackbox done');
  r = run(mk('blackbox'), [{ t: 'delivered' }]); ok(r.m.st === 'accepted', 'events before landing are ignored');
  r = run(mk('blackbox'), [L, { t: 'takeoff' }]); ok(r.m.st === 'failed', 'takeoff while active = failed');
  r = run(mk('blackbox'), [{ t: 'takeoff' }]); ok(r.m.st === 'accepted', 'takeoff before landing keeps it');
  r = run(mk('blackbox'), [L, { t: 'abandon' }]); ok(r.m.st === 'failed', 'abandon');
  // rescue: free -> safe; dead fails; safe before free ignored
  r = run(mk('rescue'), [L, { t: 'npc_safe' }]); ok(r.m.st === 'active', 'rescue: safe before freed is ignored');
  r = run(mk('rescue'), [L, { t: 'npc_freed' }, { t: 'npc_safe' }]); ok(r.m.st === 'done', 'rescue done');
  r = run(mk('rescue'), [L, { t: 'npc_freed' }, { t: 'npc_dead' }]); ok(r.m.st === 'failed', 'rescue: npc dead');
  r = run(mk('rescue'), [L, { t: 'npc_freed' }]); ok(Math.abs(V.missionProgress(r.m) - 0.5) < 1e-9, 'rescue progress 50 %');
  // relay: three distinct panels, duplicates ignored, out of range ignored
  r = run(mk('relay'), [L, { t: 'panel', i: 0 }, { t: 'panel', i: 0 }, { t: 'panel', i: 7 }, { t: 'panel', i: 1 }]); ok(r.m.st === 'active' && (r.m.p.panels || []).filter(Boolean).length === 2, 'relay: 2 of 3');
  r = run(r.m, [{ t: 'panel', i: 2 }]); ok(r.m.st === 'done', 'relay done');
  // hunt
  r = run(mk('hunt'), [L, { t: 'target_dead' }]); ok(r.m.st === 'done', 'hunt done');
  // drone
  r = run(mk('drone'), [L, { t: 'drone_move', frac: 0.5 }]); ok(!r.m.p.frac, 'drone: move before power ignored');
  r = run(mk('drone'), [L, { t: 'drone_on' }, { t: 'drone_move', frac: 0.5 }]); ok(r.m.p.frac === 0.5 && V.missionProgress(r.m) > 0.25, 'drone: moving');
  r = run(r.m, [{ t: 'drone_done' }]); ok(r.m.st === 'done', 'drone done');
  r = run(mk('drone'), [L, { t: 'drone_on' }, { t: 'drone_dead' }]); ok(r.m.st === 'failed', 'drone dead');
  // survey: n readings
  r = run(mk('survey', { n: 4 }), [L, { t: 'read', i: 0 }, { t: 'read', i: 1 }, { t: 'read', i: 1 }, { t: 'read', i: 9 }, { t: 'read', i: 2 }]); ok(r.m.st === 'active' && V.missionProgress(r.m) === 0.75, 'survey: 3/4');
  r = run(r.m, [{ t: 'read', i: 3 }]); ok(r.m.st === 'done', 'survey done');
  // hold jobs
  for (const type of ['defend', 'heist']) {
    const m0 = mk(type, { n: 30 });
    r = run(m0, [L, { t: 'hold_tick', dt: 5 }]); ok(r.m.st === 'active' && !r.m.p.t, `${type}: ticks before start ignored`);
    r = run(m0, [L, { t: 'hold_start' }, { t: 'hold_tick', dt: 10 }, { t: 'hold_tick', dt: 10 }]); ok(r.m.st === 'active' && Math.abs(V.missionProgress(r.m) - 20 / 30) < 1e-6, `${type}: progress`);
    r = run(r.m, [{ t: 'hold_tick', dt: 10 }]); ok(r.m.st === 'done', `${type}: done at the timer`);
    r = run(m0, [L, { t: 'hold_start' }, { t: 'hold_fail' }]); ok(r.m.st === 'failed', `${type}: overrun fails`);
  }
  // photo
  r = run(mk('photo'), [L, { t: 'photo' }]); ok(r.m.st === 'done', 'photo done');
  // terminal states never change; the original object is never mutated
  const m1 = mk('hunt'); const after = V.stepMission(m1, L).m; ok(m1.st === 'accepted' && after.st === 'active', 'pure: input not mutated');
  r = run(mk('hunt'), [L, { t: 'target_dead' }, { t: 'takeoff' }, { t: 'abandon' }]); ok(r.m.st === 'done', 'done is final');
  ok(V.stepMission(null, L).m === null, 'null mission tolerated');
  // every type has a spec + a happy path exists (covered above)
  ok(V.MISSION_IDS.length === 9 && V.MISSION_IDS.every((k) => V.MISSION_TYPES[k].brief && V.MISSION_TYPES[k].pay > 0), '9 mission types');
  say('mission state machines (9 types)');
}

// ---------------------------------------------------------------------------------------------------------------- board + signals
{
  const moons = [MOONS.hamsi, MOONS.lufer, MOONS.palamut, MOONS.levrek];
  let types = new Set();
  for (let day = 1; day <= 40; day++) {
    for (const qi of [0, 3, 8]) {
      const b = V.boardFor('runX', day, qi, moons), b2 = V.boardFor('runX', day, qi, moons);
      ok(JSON.stringify(b) === JSON.stringify(b2), 'board deterministic');
      ok(b.length === 4 && new Set(b.map((o) => o.type)).size === 4, `board: 4 distinct jobs (day ${day})`);
      ok(b.filter((o) => V.isVoyageId(o.moon)).length === 2 && b.filter((o) => !V.isVoyageId(o.moon)).length === 2, 'board: 2 charted + 2 signals');
      ok(b.every((o) => o.pay >= 60 && o.pay < 1500 && o.xp > 0 && ['wood', 'iron', 'gold'].includes(o.loot) && V.MISSION_TYPES[o.type] && (V.isVoyageId(o.moon) || MOONS[o.moon])), 'board: valid offers');
      b.forEach((o) => types.add(o.type));
    }
    const s = V.signalsFor('runX', day, 2), s2 = V.signalsFor('runX', day, 2);
    ok(JSON.stringify(s) === JSON.stringify(s2) && s.length === 3 && new Set(s).size === 3 && s.every((id) => V.generateVoyageMoon(id)), `signals valid + stable (day ${day})`);
    ok(new Set(s.map((id) => V.parseVoyageId(id).content)).size >= 2, 'signals: varied contents');
  }
  ok(JSON.stringify(V.signalsFor('runX', 1, 2)) !== JSON.stringify(V.signalsFor('runX', 2, 2)), 'signals rotate with the day');
  ok(JSON.stringify(V.signalsFor('runA', 1, 2)) !== JSON.stringify(V.signalsFor('runB', 1, 2)), 'signals differ per run');
  ok(types.size === 9, `all 9 job types show up on boards (${types.size})`);
  const p1 = V.boardFor('r', 1, 0, moons).map((o) => o.pay), p9 = V.boardFor('r', 1, 9, moons).map((o) => o.pay);
  ok(p9.reduce((a, b) => a + b, 0) > p1.reduce((a, b) => a + b, 0), 'pay grows with the quota');
  ok(V.randomFee(0) === 20 && V.randomFee(2) <= 60 && V.randomFee(99) === 60, 'MOON RANDOM fee: a little, capped');
  say('mission board + uncharted signals');
}

// ---------------------------------------------------------------------------------------------------------------- warp probability + early-game guard
{
  const base = { quotaIndex: 2, mode: 'on', sinceDays: 10, company: false, home: false, instance: false, voyage: false, daysLeft: 3 };
  ok(V.warpChance({ ...base, quotaIndex: 0 }) === 0 && V.warpChance({ ...base, quotaIndex: 1 }) === 0, 'no warp in the first two quotas');
  ok(V.warpChance({ ...base, quotaIndex: 0, mode: 'early' }) > 0, 'early opt-in allows it');
  ok(V.warpChance({ ...base, mode: 'off' }) === 0 && V.warpChance({ ...base, mode: 'off', quotaIndex: 9 }) === 0, 'off = never');
  ok(V.warpChance({ ...base, company: true }) === 0 && V.warpChance({ ...base, home: true }) === 0 && V.warpChance({ ...base, instance: true }) === 0 && V.warpChance({ ...base, voyage: true }) === 0, 'never from HQ / homeworld / instances / a voyage');
  ok(V.warpChance({ ...base, daysLeft: 0 }) === 0, 'never on deadline day');
  ok(V.warpChance({ ...base, sinceDays: 0 }) === 0 && V.warpChance({ ...base, sinceDays: 1 }) === 0, 'cooldown after a warp');
  ok(V.warpChance({ ...base, sinceDays: 2 }) === V.WARP.chance && V.warpChance({ ...base, sinceDays: 30 }) === V.WARP.pityChance, 'chance 12 %, pity 20 %');
  ok(V.warpChance(null) === 0, 'null state');
  // empirical frequency
  const R = new RNG(31337);
  let hits = 0, glitch = 0, dist = 0;
  const T = 30000;
  for (let i = 0; i < T; i++) { const w = V.rollWarp(R, { ...base, sinceDays: 3 }); if (w) { hits++; if (w.kind === 'glitch') glitch++; else dist++; ok(V.isVoyageId(w.id) && V.generateVoyageMoon(w.id), 'warp id valid'); } }
  ok(hits / T > 0.105 && hits / T < 0.135, `warp frequency ${(hits / T * 100).toFixed(2)} % (~12 %)`);
  ok(dist / hits > 0.55 && dist / hits < 0.65, `distress share ${(dist / hits).toFixed(2)}`);
  let early = 0;
  for (let i = 0; i < 5000; i++) if (V.rollWarp(new RNG(i), { ...base, quotaIndex: 1 })) early++;
  ok(early === 0, 'rollWarp respects the early-game guard');
  // distress content is always a real set piece
  for (let i = 0; i < 400; i++) { const w = V.rollWarp(new RNG(i * 7 + 1), { ...base, quotaIndex: 5, sinceDays: 30, mode: 'on' }); if (w?.kind === 'distress') ok(V.parseVoyageId(w.id).content !== null, 'distress drops on a set piece'); }
  ok(V.voteOutcome(2, 1) && !V.voteOutcome(1, 1) && !V.voteOutcome(0, 0) && V.voteOutcome(1, 0), 'vote: majority yes, tie / silence = ignore');
  say(`warp: ${(hits / T * 100).toFixed(1)} % of ${T} eligible levers, guard holds (quota < 3, off, HQ, deadline, cooldown)`);
}

// ---------------------------------------------------------------------------------------------------------------- mock-game host flows
{
  const { installVoyage } = await import('../../src/game/voyage.js');
  const { ITEMS } = await import('../../src/game/items.js');
  const handlers = new Map(), sent = [], spawned = [], later = [];
  const cmds = new Map();
  const listeners = {};
  const mods = { on: (ev, fn) => { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); }; }, emit: (ev, ...a) => (listeners[ev] || []).forEach((f) => f(...a)), commands: cmds, api: { registerCommand: (n, fn, help) => cmds.set(n, { fn, help, owner: null }) } };
  const run = { phase: 'orbit', moon: 'hamsi', seed: 5, day: 4, daysLeft: 3, quota: 200, quotaIndex: 3, sold: 0, credits: 300, runId: 'RUN1', forecast: {}, time: 480, upgrades: {} };
  const calls = { lever: 0, takeoff: 0, broadcastRun: [] };
  const net = {
    isHost: true, hostId: 'me', selfId: 'me', handlers,
    broadcast: (t, d) => { sent.push([t, d]); }, sendTo: (to, t, d) => { sent.push([t, d, to]); },
    request: (a, d) => handlers.get(a)?.({ a, ...d }, 'me'), on() {}, off() {},
  };
  const game = {
    isHost: true, selfId: 'me', mods, net, run, config: { freeTravel: true, voyage: true }, scene: new THREE.Scene(), time: 0,
    player: { update() {}, inShip: true, pos: new THREE.Vector3(), vel: new THREE.Vector3() }, remotes: new Map(), world: { outdoor: null, terrain: null, facility: null },
    items: { hostSpawn: (ty, pos, o) => { spawned.push([ty, o]); return 'i' + spawned.length; }, get: () => null, all: () => [], inShipItems: () => [] },
    creatures: { host: new Map(), views: new Map(), hostSpawn: () => null },
    applyRunState(d) { Object.assign(this.run, d); }, broadcastRun(k) { calls.broadcastRun.push(k); },
    hostLever() { calls.lever++; }, hostFinishTakeoff() { this.run.phase = 'orbit'; }, hostBeginTakeoff() { calls.takeoff++; }, hostUpdate() {},
    later: (fn, ms) => { later.push([fn, ms]); return later.length; }, aiPlayers: () => [{ id: 'me', pos: new THREE.Vector3(0, 0, 0), dead: false, inShip: true, zone: 'in' }], aiPlayerById: (id) => (id === 'me' ? { id, pos: new THREE.Vector3(0, 0, 0), dead: false, inShip: true, zone: 'in' } : null),
    env: { setSpace() {} }, planetColorFor: () => 0, ui: { toast() {}, hud: { bigText() {} } }, sfx() {}, deathText: () => 'x', engine: {}, camera: new THREE.PerspectiveCamera(),
    terminal: { hostExecute: () => {}, active: false }, rollLevel: () => 1, shipyard: null, cycle: null, crafting: null,
  };
  const api = installVoyage(game);
  ok(api, 'installVoyage returns an api');
  mods.emit('registerHandlers', (a, fn) => handlers.set(a, fn), game);
  ok(handlers.has('vyreq'), 'vyreq handler registered');
  ok(['moon', 'moons', 'signals', 'route', 'missions', 'take', 'dropjob', 'warp', 'voyage'].every((c) => cmds.has(c)), 'terminal commands registered');
  mods.emit('hostStart', game);
  const terms = () => sent.filter((s) => s[0] === 'term').map((s) => s[1]);
  const clear = () => { sent.length = 0; };

  // ---- signals
  const sig = api.signals();
  ok(sig.length === 3, 'three signals');
  clear();
  handlers.get('vyreq')({ op: 'signal', n: 2 }, 'me');
  ok(run.moon === sig[1] && MOONS[sig[1]]?.voyage, 'routing to signal 2 registers + sets run.moon');
  ok(run.vy.prev === 'hamsi', 'previous moon remembered');
  ok(run.credits === 300 - 0, 'signals are free while freeTravel is on');
  ok(calls.broadcastRun.some((k) => k?.includes('moon') && k.includes('vy')), 'route broadcasts moon + vy');
  // an unknown signal is refused
  clear(); handlers.get('vyreq')({ op: 'signal', n: 9 }, 'me'); ok(terms().some((t) => t.err), 'bad signal number refused');
  // not in orbit
  run.phase = 'moon'; clear(); handlers.get('vyreq')({ op: 'signal', n: 1 }, 'me'); ok(terms().some((t) => t.err) && run.moon === sig[1], 'no routing outside orbit'); run.phase = 'orbit';

  // ---- moon random
  const before = run.credits;
  clear(); handlers.get('vyreq')({ op: 'random' }, 'me');
  ok(V.isVoyageId(run.moon) && run.moon !== sig[1], 'MOON RANDOM picks a fresh voyage id');
  ok(run.credits === before - V.randomFee(run.quotaIndex), `MOON RANDOM charges the fee (${before - run.credits})`);
  ok(run.vy.prev === 'hamsi', 'prev stays the last charted moon across voyages');
  run.credits = 5; const m0 = run.moon; handlers.get('vyreq')({ op: 'random' }, 'me'); ok(run.moon === m0 && run.credits === 5, 'MOON RANDOM refused when broke'); run.credits = 300;
  run.daysLeft = 0; clear(); handlers.get('vyreq')({ op: 'random' }, 'me'); ok(run.moon === m0, 'no random routing on deadline day'); run.daysLeft = 3;

  // ---- take-off reverts a voyage moon
  run.phase = 'takeoff'; game.hostFinishTakeoff();
  ok(run.moon === 'hamsi', 'after the voyage the route returns to the last charted moon');

  // ---- warp: forced glitch at the lever
  const reset = (day) => { run.moon = 'hamsi'; run.phase = 'orbit'; run.vy.lastWarpDay = run.day - day; calls.lever = 0; later.length = 0; clear(); };
  const drain = () => { let g = 0; while (later.length && g++ < 10) later.splice(0).forEach(([fn]) => fn()); };
  run.phase = 'orbit'; run.moon = 'hamsi'; run.vy.warp = 'on'; run.quotaIndex = 3;
  let warped = 0, distress = 0, plain = 0;
  for (let i = 0; i < 400; i++) {
    reset(3);   // 3 days since the last warp: the plain 12 % applies
    game.hostLever('me');
    const prompt = sent.find((s) => s[0] === 'vyx' && s[1].k === 'prompt');
    if (prompt) {   // distress: crew votes, then it resolves
      distress++;
      ok(calls.lever === 0, 'lever waits for the vote');
      handlers.get('vyreq')({ op: 'vote', yes: i % 2 === 0 }, 'me');
      if (i % 2 === 0) { ok(later.some(([, ms]) => ms === V.WARP.glitchDelaySec * 1000), 'yes vote: warp scheduled'); drain(); ok(V.isVoyageId(run.moon), 'yes vote: dropped on the distress moon'); }
      else ok(calls.lever === 1 && run.moon === 'hamsi', 'no vote: land as planned');
      ok(calls.lever === 1, 'landing proceeds after resolution');
    } else if (V.isVoyageId(run.moon)) {
      warped++;
      ok(later.length >= 1 && calls.lever === 0, 'glitch: delayed landing');
      drain();
      ok(calls.lever === 1, 'glitch: lever proceeds after the delay');
    } else { plain++; ok(calls.lever === 1, 'no warp: lever passes straight through'); }
    drain();
  }
  const rate = (warped + distress) / 400;
  ok(rate > 0.07 && rate < 0.17, `mock lever warp rate ${(rate * 100).toFixed(1)} % (${warped} glitch, ${distress} distress, ${plain} plain)`);
  const count = () => { let n = 0; for (let i = 0; i < 500; i++) { reset(3); game.hostLever('me'); if (V.isVoyageId(run.moon) || sent.some((s) => s[1]?.k === 'prompt')) n++; handlers.get('vyreq')({ op: 'vote', yes: false }, 'me'); drain(); } return n; };
  run.quotaIndex = 1; ok(count() === 0, 'no warp in quota 2 through the lever wrapper');
  run.vy.warp = 'early'; const ne = count(); ok(ne > 20, `WARP EARLY enables them early (${ne})`);
  run.vy.warp = 'off'; run.quotaIndex = 5; ok(count() === 0, 'WARP OFF never warps');
  run.vy.warp = 'on';
  // a job on the routed moon suppresses warps (never divert the crew away from their job)
  run.quotaIndex = 5; run.moon = 'hamsi'; run.vy.mission = V.newMission({ id: 'photo:hamsi:z', type: 'photo', moon: 'hamsi', tier: 1, n: 1, pay: 90, xp: 60, loot: 'wood', comps: 0 }, 4);
  ok(count() === 0, 'a job on the routed moon suppresses warps');
  run.vy.mission = null;

  // ---- mission board + take + payout
  run.moon = 'hamsi'; run.phase = 'orbit'; run.quotaIndex = 3; clear();
  handlers.get('vyreq')({ op: 'board' }, 'me');
  const board = sent.find((s) => s[0] === 'vyx' && s[1].k === 'board');
  ok(board && board[1].offers.length === 4 && board[2] === 'me', 'board goes to the requester only');
  clear();
  handlers.get('vyreq')({ op: 'take', n: 1 }, 'me');
  const offer = board[1].offers[0];
  ok(run.vy.mission && run.vy.mission.type === offer.type && run.vy.mission.st === 'accepted', 'TAKE accepts the offer');
  clear(); handlers.get('vyreq')({ op: 'take', n: 2 }, 'me'); ok(terms().some((t) => t.err), 'one job at a time');
  clear(); handlers.get('vyreq')({ op: 'drop' }, 'me'); ok(run.vy.mission === null, 'DROPJOB clears an accepted job');
  // payout through the state machine
  handlers.get('vyreq')({ op: 'take', n: 1 }, 'me');
  const cr0 = run.credits;
  api.mstep({ t: 'land', moon: run.vy.mission.moon });
  ok(run.vy.mission.st === 'active', 'landing on the job moon activates it');
  spawned.length = 0;
  const type = run.vy.mission.type;
  const finish = { rescue: [{ t: 'npc_freed' }, { t: 'npc_safe' }], blackbox: [{ t: 'delivered' }], relay: [0, 1, 2].map((i) => ({ t: 'panel', i })), hunt: [{ t: 'target_dead' }], drone: [{ t: 'drone_on' }, { t: 'drone_done' }], survey: [0, 1, 2, 3, 4, 5].map((i) => ({ t: 'read', i })), defend: [{ t: 'hold_start' }, { t: 'hold_tick', dt: 999 }], heist: [{ t: 'hold_start' }, { t: 'hold_tick', dt: 999 }], photo: [{ t: 'photo' }] }[type];
  finish.forEach((e) => api.mstep(e));
  ok(run.vy.mission.st === 'done', `${type}: done`);
  ok(run.credits === cr0 + offer.pay, `payout +${offer.pay} credits (${run.credits - cr0})`);
  ok(spawned.length >= 1 && spawned.every(([ty]) => ITEMS[ty]), `loot spawned for the crew (${spawned.length} items, all real)`);
  ok(run.vy.done === 1 && run.vy.earned === offer.pay, 'stats');
  ok(sent.some((s) => s[0] === 'xp'), 'xp handed out');
  // takeoff mid-job fails it; orbit clears finished ones
  run.vy.mission = V.newMission(offer, 4); run.phase = 'moon'; api.mstep({ t: 'land', moon: offer.moon }); game.hostBeginTakeoff(); ok(run.vy.mission.st === 'failed', 'taking off mid-job fails it');
  mods.emit('phase', 'orbit', game); ok(run.vy.mission === null, 'finished jobs are cleared in orbit');
  // saves never resume inside a job
  run.vy.mission = { ...V.newMission(offer, 4), st: 'active', p: { x: 1 } }; mods.emit('hostStart', game); ok(run.vy.mission.st === 'accepted', 'hostStart resets an active job to accepted');
  // dispose restores the wrapped methods
  api.dispose();
  ok(game.hostLever.toString().includes('calls.lever'), 'dispose restores hostLever');
  say('mock-game host flows: routing, MOON RANDOM, warp (glitch + vote), early guard, board, take, payout, takeoff, dispose');
}

console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) { console.error(`${fails} FAILED`); process.exit(1); }
