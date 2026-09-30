// MINING (wave 8, module `mining`; docs/wave8/mining.md): Minecraft-style digging. The Company strip-mines dead planets and The Algorithm hides
// data crystals in the rock. Outdoor moons get 2-4 rock outcrops (mound / cave pocket / cliff seam), mineshaft facilities a diggable rock face in a
// room corner. Rock = chunked voxel volumes (0.5 m cells, 16^3 chunks, greedy meshed: 1-2 draw calls per chunk, one static trimesh collider per chunk
// rebuilt when it changes). Pure rules in mining_core.js.
//
// Net (prefix mn): request  mnhit {v,c,d,s} (volume, cell, swing damage, map seed)   mnput {v,c,id,s} (place a beam / torch from the held item)   mnsync {s}
//                  host->all mnd {k:'hp'|'ed'|'warn'|'ok'|'sync', s, v, ...}  (cell diffs are packed ints idx*16+mat; the host log is replayed to late joiners)
// Host: validates range / rate, owns the cell HP, ore drops (daily value cap), stealth noise and the cave-in. Everything visual is local.
import * as THREE from 'three';
import { t, tf, addTranslations } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { ITEMS, registerItem } from './items.js';
import { MOONS } from './moons.js';
import { RECIPES } from './recipes.js';
import { G } from '../physics/physics.js';
import { createArtModel } from '../models/artpass.js';
import * as C from './mining_core.js';
import { minePick } from './sound2_core.js';   // [sound2]

HOST_ONLY.add('mnd');
const { M, MATS, MN, CELL, DUG, pack } = C;

// ---------------------------------------------------------------------------------------------- items
const ORES = [
  { id: 'ore_copper', name: 'Copper Ore', value: [9, 15], tier: 'common', weight: 3, tip: 'Raw copper from the rock. Sell it, or smelt it at the workbench.' },
  { id: 'ore_iron', name: 'Iron Ore', value: [7, 12], tier: 'common', weight: 4, tip: 'Heavy raw iron. Sell it, or smelt it at the workbench.' },
  { id: 'ore_quartz', name: 'Quartzite', value: [16, 26], tier: 'uncommon', weight: 2, tip: 'Clear quartzite. Sells well; two make a sensor at the workbench.' },
];
const TOOLDEFS = [
  { id: 'tool_pickaxe_steel', name: 'Steel Pickaxe', kind: 'weapon', hands: 1, weight: 8, price: 140, dmg: 17, cd: 0.6, reach: 2.3, rarity: 'uncommon', tier: 'uncommon', shop: 'tools', value: [40, 60],
    blurb: 'Digs 60% faster than the basic pickaxe. Wears out with use.' },
  { id: 'tool_drill', name: 'Mining Drill', kind: 'weapon', hands: 1, weight: 10, price: 380, dmg: 12, cd: 0.25, reach: 2.3, rarity: 'rare', tier: 'rare', shop: 'tools', value: [90, 140],
    blurb: 'Chews a cell every hit, but the whole level hears it. Wears out fast.' },
  { id: 'mn_beam', name: 'Support Beam', kind: 'tool', hands: 1, weight: 4, price: 12, mn: 'beam', rarity: 'common', tier: 'common', shop: 'tools', value: [4, 8],
    tip: 'LMB on rock: place a timber support in a tunnel. Stops cave-ins nearby.' },
  { id: 'mn_torch', name: 'Torch Block', kind: 'tool', hands: 1, weight: 1, price: 8, mn: 'torch', rarity: 'common', tier: 'common', shop: 'tools', value: [2, 5],
    tip: 'LMB on rock: place a glowing block. Lights the tunnel without a lamp.' },
];
const SMELT = [
  { id: 'mn_smelt_iron', name: 'Smelt Iron', cat: 'tools', out: 'comp_scrapmetal', n: 3, in: [['ore_iron', 1]], tier: null, time: 1.4, desc: 'One iron ore, three scrap metal.' },
  { id: 'mn_smelt_copper', name: 'Draw Copper', cat: 'tools', out: 'comp_cable', n: 2, in: [['ore_copper', 1]], tier: null, time: 1.4, desc: 'One copper ore, two copper cables.' },
  { id: 'mn_smelt_quartz', name: 'Cut Quartz', cat: 'tools', out: 'comp_sensor', n: 1, in: [['ore_quartz', 2]], tier: null, time: 1.8, desc: 'Two quartzite, one sensor.' },
];
const TR = {
  'Copper Ore': ['Bakır Cevheri', 'Медная руда'], 'Iron Ore': ['Demir Cevheri', 'Железная руда'], Quartzite: ['Kuvarsit', 'Кварцит'],
  'Steel Pickaxe': ['Çelik Kazma', 'Стальная кирка'], 'Mining Drill': ['Maden Matkabı', 'Буровая дрель'], 'Support Beam': ['Destek Kirişi', 'Опорная балка'], 'Torch Block': ['Meşale Bloğu', 'Блок-факел'],
  'Raw copper from the rock. Sell it, or smelt it at the workbench.': ['Kayadan çıkan ham bakır. Sat ya da tezgâhta işle.', 'Сырая медь. Продайте или переплавьте на верстаке.'],
  'Heavy raw iron. Sell it, or smelt it at the workbench.': ['Ağır ham demir. Sat ya da tezgâhta işle.', 'Тяжёлое сырое железо. Продайте или переплавьте на верстаке.'],
  'Clear quartzite. Sells well; two make a sensor at the workbench.': ['Berrak kuvarsit. İyi para eder; ikisi tezgâhta bir sensör yapar.', 'Чистый кварцит. Хорошо продаётся; два дают датчик на верстаке.'],
  'Digs 60% faster than the basic pickaxe. Wears out with use.': ['Temel kazmadan %60 hızlı kazar. Kullandıkça yıpranır.', 'Копает на 60% быстрее обычной кирки. Изнашивается.'],
  'Chews a cell every hit, but the whole level hears it. Wears out fast.': ['Her vuruşta bir hücre yer, ama tüm kat duyar. Çabuk yıpranır.', 'Прогрызает клетку за удар, но слышит весь уровень. Быстро изнашивается.'],
  'LMB on rock: place a timber support in a tunnel. Stops cave-ins nearby.': ['Kayaya SOL TIK: tünele ahşap destek koy. Yakındaki göçükleri önler.', 'ЛКМ по камню: поставить опору в туннеле. Предотвращает обвалы рядом.'],
  'LMB on rock: place a glowing block. Lights the tunnel without a lamp.': ['Kayaya SOL TIK: parlayan blok koy. Tüneli lambasız aydınlatır.', 'ЛКМ по камню: поставить светящийся блок. Освещает туннель без лампы.'],
  'Smelt Iron': ['Demir Eritme', 'Плавка железа'], 'One iron ore, three scrap metal.': ['Bir demir cevheri, üç hurda metal.', 'Одна железная руда, три металлолома.'],
  'Draw Copper': ['Bakır Çekme', 'Волочение меди'], 'One copper ore, two copper cables.': ['Bir bakır cevheri, iki bakır kablo.', 'Одна медная руда, два медных кабеля.'],
  'Cut Quartz': ['Kuvars Kesme', 'Огранка кварца'], 'Two quartzite, one sensor.': ['İki kuvarsit, bir sensör.', 'Два кварцита, один датчик.'],
  Dirt: ['Toprak', 'Земля'], Stone: ['Taş', 'Камень'], 'Deep rock': ['Derin kaya', 'Глубинная порода'], 'Copper ore': ['Bakır cevheri', 'Медная руда'], 'Iron ore': ['Demir cevheri', 'Железная руда'],
  'Data crystal': ['Veri kristali', 'Дата-кристалл'], Bedrock: ['Ana kaya', 'Коренная порода'], 'Support beam': ['Destek kirişi', 'Опорная балка'], 'Torch block': ['Meşale bloğu', 'Блок-факел'],
  'Hit it (LMB) with a pickaxe': ['Kazmayla vur (SOL TIK)', 'Бейте киркой (ЛКМ)'], Unbreakable: ['Kırılmaz', 'Неразрушимо'],
  'Place {n} [LMB]': ['{n} koy [SOL TIK]', 'Поставить: {n} [ЛКМ]'], 'Nothing to place it on': ['Koyacak yer yok', 'Некуда поставить'],
  'The ceiling groans - place a support beam!': ['Tavan inliyor - destek kirişi koy!', 'Потолок стонет - поставьте опорную балку!'],
  'Cave-in!': ['Göçük!', 'Обвал!'], 'Ore extracted': ['Cevher çıkarıldı', 'Руда добыта'], 'Rock': ['Kaya', 'Порода'],
};

for (const d of ORES) if (!ITEMS[d.id]) registerItem({ ...d, kind: 'component', component: true, hands: 1 });
for (const d of TOOLDEFS) if (!ITEMS[d.id]) registerItem({ ...d });
for (const r of SMELT) if (!RECIPES.some((x) => x.id === r.id)) RECIPES.push({ ...r });

// ---------------------------------------------------------------------------------------------- item models (tiny procedural)
function toolModel(id) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9 }), steel = new THREE.MeshStandardMaterial({ color: id === 'tool_pickaxe_steel' ? 0xc9d2d8 : 0x8a9096, roughness: 0.4, metalness: 0.8 });
  const g = new THREE.Group();
  if (id === 'mn_beam') { const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), wood); b.rotation.x = Math.PI / 2; g.add(b); return g; }
  if (id === 'mn_torch') { const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0xffb84a })); g.add(b); return g; }
  if (id === 'tool_drill') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.34), new THREE.MeshStandardMaterial({ color: 0xe0a020, roughness: 0.6 })); body.position.z = -0.16; g.add(body);
    const bit = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 6), steel); bit.rotation.x = -Math.PI / 2; bit.position.z = -0.47; g.add(bit);
    return g;
  }
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.62, 6), wood); h.rotation.x = Math.PI / 2; h.position.z = -0.26; g.add(h);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.03, 0.44), steel); b.position.set(0, 0.02, -0.5); b.rotation.x = 0.12; g.add(b);
  return g;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function installMining(game) {
  addTranslations(Object.fromEntries(Object.entries(TR).map(([k, v]) => [k, v[0]])), 'tr');
  addTranslations(Object.fromEntries(Object.entries(TR).map(([k, v]) => [k, v[1]])), 'ru');
  if (game.mods?.itemModels) for (const id of ['tool_pickaxe_steel', 'tool_drill', 'mn_beam', 'mn_torch']) if (!game.mods.itemModels.has(id)) game.mods.itemModels.set(id, () => createArtModel(id) || toolModel(id));   // [artpass] pick + drill are art-pass models

  const offs = [];
  const saved = new Map();          // 'seed|moon|day' -> per-volume packed edit logs (tunnels stay for the day, also across a leave / return)
  const V = new THREE.Vector3(), F = new THREE.Vector3(), E = new THREE.Vector3();
  const matLit = new THREE.MeshLambertMaterial({ vertexColors: true }), matGlow = new THREE.MeshBasicMaterial({ vertexColors: true });
  let map = null, time = 0, disposed = false, syncAsked = false, boundNet = null;
  const peerHit = new Map(), peerNoise = new Map();   // host: rate limits
  const warns = [];                 // client: running dust falls { pos, until, next }
  let cracks = null;                // crack overlay pool

  const posOf = (id) => (id === game.selfId ? game.player?.pos : game.remotes?.get(id)?.pos);
  const eyeOf = (id) => { if (id === game.selfId) return game.camera.position; const p = posOf(id); return p ? E.set(p.x, p.y + 1.5, p.z) : null; };
  const heldDefOf = (id) => (id === game.selfId ? game.player?.heldItem?.()?.def : ITEMS[game.remotes?.get(id)?.heldType]) || null;
  const allIds = () => [game.selfId, ...(game.remotes ? [...game.remotes.keys()] : [])];

  // ---------------------------------------------------------------------------------------------- cracks (one shared pool of translucent cells)
  function ensureCracks() {
    if (cracks) return cracks;
    const mats = [1, 2, 3].map((s) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const c = cv.getContext('2d'); c.strokeStyle = 'rgba(8,6,6,0.9)'; c.lineWidth = 2;
      let seed = 7 + s * 13; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let b = 0; b < 2 + s * 3; b++) { c.beginPath(); let x = 32, y = 32; c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 30; y += (rnd() - 0.5) * 30; c.lineTo(x, y); } c.stroke(); }
      const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter;
      return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    });
    const geo = new THREE.BoxGeometry(CELL * 1.02, CELL * 1.02, CELL * 1.02), pool = [];
    for (let i = 0; i < 20; i++) { const m = new THREE.Mesh(geo, mats[0]); m.visible = false; m.userData = { v: -1, c: -1, t: 0 }; game.scene.add(m); pool.push(m); }
    return (cracks = { mats, geo, pool });
  }
  function setCrack(cv, i, pct) {
    const P = ensureCracks();
    let m = P.pool.find((q) => q.visible && q.userData.v === cv.vol.id && q.userData.c === i) || P.pool.find((q) => !q.visible) || P.pool.reduce((a, b) => (a.userData.t < b.userData.t ? a : b));
    cv.vol.center(i, V); m.position.copy(V);
    m.material = P.mats[clamp(Math.floor(pct / 34), 0, 2)]; m.visible = true; m.userData = { v: cv.vol.id, c: i, t: time };
  }
  const clearCrack = (cv, i) => { if (cracks) for (const q of cracks.pool) if (q.visible && q.userData.v === cv.vol.id && q.userData.c === i) q.visible = false; };

  // ---------------------------------------------------------------------------------------------- volumes: meshes + colliders
  function makeMesh(buf, mat, cv) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buf.p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(buf.n, 3)); g.setAttribute('color', new THREE.BufferAttribute(buf.c, 3));
    g.setIndex(new THREE.BufferAttribute(buf.i, 1)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; cv.group.add(m);
    return m;
  }
  function buildChunk(cv, k) {
    const old = cv.chunks.get(k);
    if (old) { for (const m of old.meshes) { m.removeFromParent(); m.geometry.dispose(); } dropCollider(cv, old.col); }
    const [cx, cy, cz] = cv.vol.chunkXyz(k);
    const r = C.meshChunk(cv.vol, cx, cy, cz), meshes = [];
    if (r.a) meshes.push(makeMesh(r.a, matLit, cv));
    if (r.b) meshes.push(makeMesh(r.b, matGlow, cv));
    let col = null;
    if (r.a || r.b) {
      const parts = [r.a, r.b].filter(Boolean), nv = parts.reduce((s, q) => s + q.p.length, 0), ni = parts.reduce((s, q) => s + q.i.length, 0);
      const verts = new Float32Array(nv), idx = new Uint32Array(ni);
      let vo = 0, io = 0;
      for (const q of parts) {
        for (let j = 0; j < q.p.length; j += 3) { verts[vo + j] = q.p[j] + cv.vol.x; verts[vo + j + 1] = q.p[j + 1] + cv.vol.y; verts[vo + j + 2] = q.p[j + 2] + cv.vol.z; }
        for (let j = 0; j < q.i.length; j++) idx[io + j] = q.i[j] + vo / 3;
        vo += q.p.length; io += q.i.length;
      }
      try { col = game.physics.addStaticTrimesh(verts, idx, { kind: 'mine', vid: cv.vol.id, k }); cv.colParent?.push(col); } catch (e) { console.warn('[mining] collider', e); }
    }
    cv.chunks.set(k, { meshes, col });
  }
  function dropCollider(cv, col) {
    if (!col) return;
    game.physics.removeCollider(col);
    const a = cv.colParent, i = a ? a.indexOf(col) : -1; if (i >= 0) a.splice(i, 1);
  }
  const markDirty = (cv, set) => { for (const k of set) cv.dirty.add(k); };

  function load(world) {
    clear();
    const moon = MOONS[world.moonId] || null;
    const vols = [], out = { seed: world.seed | 0, key: `${world.seed}|${world.moonId}|${game.run?.day ?? 0}`, outdoor: world.outdoor, facility: world.facility, vols, tally: { value: 0, items: 0 } };
    try {
      let specs = [], parent = null;
      if (world.outdoor?.terrain?.heightAt && world.outdoor.avoid && world.moonId && !moon?.customMap) {
        parent = world.outdoor;
        specs = C.planOutdoor({ seed: world.seed, size: moon?.size || 1, tier: moon?.tier || 1, terrain: world.terrain || world.outdoor.terrain, avoid: world.outdoor.avoid, sites: world.outdoor.landmarks?.sites || [] });
      }
      const L = world.facility?.layout;
      if (L?.theme === 'mineshaft') { parent = world.facility; specs = specs.concat(C.planIndoor({ seed: world.seed, layout: L, doors: world.facility.doors || [] }).map((s, n) => ({ ...s, id: specs.length + n }))); }
      if (!parent && !specs.length) { map = null; return; }
      for (const s of specs) {
        const parentOf = s.kind === 'slab' ? world.facility : world.outdoor;
        const vol = C.genVolume(s), group = new THREE.Group();
        group.position.set(vol.x, vol.y, vol.z); (parentOf?.group || game.scene).add(group);
        vols.push({ vol, group, chunks: new Map(), dirty: new Set(), pct: new Map(), colParent: parentOf?.colliders || null });
      }
    } catch (e) { console.warn('[mining] plan', e); }
    map = out;
    if (!saved.has(out.key)) { saved.set(out.key, vols.map(() => [])); if (saved.size > 6) saved.delete(saved.keys().next().value); }
    out.log = saved.get(out.key);
    vols.forEach((cv, v) => { if (out.log[v]?.length) cv.vol.apply(out.log[v]); });
    for (const cv of vols) for (let k = 0; k < cv.vol.chunkCount(); k++) buildChunk(cv, k);
  }
  function clear() {
    if (!map) return;
    for (const cv of map.vols) {
      for (const ch of cv.chunks.values()) { for (const m of ch.meshes) m.geometry.dispose(); if (ch.col) dropCollider(cv, ch.col); }
      cv.group.removeFromParent();
    }
    if (cracks) for (const q of cracks.pool) q.visible = false;
    warns.length = 0; peerHit.clear(); peerNoise.clear(); syncAsked = false; map = null;
  }

  // ---------------------------------------------------------------------------------------------- effects (all peers)
  const fx = (cv, i) => { cv.vol.center(i, V); game.particles?.burst?.(V, 'landpuff', null, 0.9); };
  function hitFx(cv, i, m) {
    cv.vol.center(i, V);
    try {   // [sound2] pick / drill sound per material (the drill only reads as a drill for the local player's own hits)
      const drill = game.player?.heldItem?.()?.type === 'tool_drill' && game.player.pos.distanceTo(V) < 4;
      game.audio?.at?.(drill ? 'mine_drill' : minePick(m === M.CRYSTAL ? 'crystal' : m >= M.COPPER && m <= M.QUARTZ ? 'ore' : 'stone'), V, 0.6, { refDistance: 4, maxDistance: 55 });
    } catch { /* audio optional */ }
    game.particles?.burst?.(V, m >= M.COPPER && m <= M.CRYSTAL ? 'sparks' : 'landpuff', null, 0.45);
  }

  // ---------------------------------------------------------------------------------------------- host: damage, drops, cave-in
  function hostEdit(cv, edits, extra = {}) {
    game.net.broadcast('mnd', { k: 'ed', s: map.seed, v: cv.vol.id, e: edits, ...extra });
  }
  function drops(cv, i, m, by) {
    const def = MATS[m]?.drop;
    if (!def || !C.oreDropOk(map.tally, m)) return;
    if (def.val) { map.tally.value += def.val; map.tally.items++; game.net.broadcast('mnd', { k: 'ore', s: map.seed, o: Math.round(map.tally.value), n: Math.round(def.val) }); }   // [rewardviz] ore counter
    cv.vol.center(i, V);
    const p = posOf(by); if (p) { F.set(p.x - V.x, 0, p.z - V.z).normalize().multiplyScalar(0.35); V.add(F); }
    try { game.items.hostSpawn(def.item, V.clone(), { tier: m === M.CRYSTAL ? 'rare' : undefined, linvel: [F.x * 3, 2.2, F.z * 3] }); } catch (e) { console.warn('[mining] drop', e); }
    if (def.val && by) game.net.broadcast('xp', { to: by, xp: m === M.CRYSTAL ? 25 : m === M.QUARTZ ? 8 : 5, coin: 0, reason: 'Ore extracted' });
  }
  function hostBreak(cv, i, by) {
    const m = cv.vol.data[i];
    hostEdit(cv, [pack(i, DUG)], { b: m });
    drops(cv, i, m, by);
    const [x, y, z] = cv.vol.xyz(i);
    if (!cv.warn && C.isUnstable(cv.vol, x, y, z)) {
      cv.warn = { i };
      game.net.broadcast('mnd', { k: 'warn', s: map.seed, v: cv.vol.id, c: i, ms: MN.warnMs });
      game.later(() => collapse(cv, i), MN.warnMs);
    }
  }
  function collapse(cv, i) {
    if (disposed || !map || !map.vols.includes(cv)) return;
    const [x, y, z] = cv.vol.xyz(i);
    const cells = C.isUnstable(cv.vol, x, y, z) ? C.collapseCells(cv.vol, x, y, z) : [];
    if (!cells.length) { game.net.broadcast('mnd', { k: 'ok', s: map.seed, v: cv.vol.id }); cv.warn = null; return; }
    hostEdit(cv, cells.map((c) => pack(c, 0)), { cave: 1 });
    for (const id of allIds()) {
      const p = posOf(id); if (!p) continue;
      for (const c of cells) {
        cv.vol.center(c, V);
        if (Math.hypot(p.x - V.x, p.z - V.z) < 1.1 && p.y < V.y + 0.4 && p.y > V.y - 2.4) { game.hostHurtPlayer?.(id, MN.cavePlayerDmg, 'cave-in', null, V.clone()); break; }
      }
    }
    game.later(() => { cv.warn = null; }, 2500);
  }
  function onHit(d, from) {
    if (!game.isHost || game.run?.phase !== 'moon' || !map || d?.s !== map.seed) return;
    const cv = map.vols[d.v | 0]; if (!cv) return;
    const i = d.c | 0, m = cv.vol.data[i];
    if (!m || m === M.BEDROCK || i < 0) return;
    const eye = eyeOf(from); if (!eye) return;
    cv.vol.center(i, V);
    if (eye.distanceTo(V) > MN.reach) return;
    if (time - (peerHit.get(from) ?? -9) < MN.minGap) return;
    peerHit.set(from, time);
    const key = C.toolKey(heldDefOf(from)), dmg = C.cellDamage(d.d, key), hp = MATS[m].hp, acc = (cv.vol.dmg.get(i) || 0) + dmg;
    if (time - (peerNoise.get(from) ?? -9) >= MN.noiseGap) { peerNoise.set(from, time); try { game.stealth?.hostNoiseAt?.(V.clone(), C.TOOLS[key].noise, 'use'); } catch { /* stealth optional */ } }
    if (acc >= hp) hostBreak(cv, i, from);
    else { cv.vol.dmg.set(i, acc); game.net.broadcast('mnd', { k: 'hp', s: map.seed, v: cv.vol.id, c: i, p: Math.floor(acc / hp * 100) }); }
  }
  function onPut(d, from) {
    if (!game.isHost || game.run?.phase !== 'moon' || !map || d?.s !== map.seed) return;
    const cv = map.vols[d.v | 0], it = game.items?.get?.(d.id), mat = C.PLACEABLE[it?.type];
    if (!cv || !mat || it.holder !== from) return;
    const i = d.c | 0; if (i < 0 || i >= cv.vol.data.length || cv.vol.data[i]) return;
    const [x, y, z] = cv.vol.xyz(i);
    if (![[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => cv.vol.get(x + a, y + b, z + c))) return;   // must touch rock
    cv.vol.center(i, V);
    const eye = eyeOf(from); if (!eye || eye.distanceTo(V) > MN.reach + 0.5) return;
    for (const id of allIds()) { const p = posOf(id); if (p && Math.abs(p.x - V.x) < 0.6 && Math.abs(p.z - V.z) < 0.6 && p.y < V.y + 0.3 && p.y > V.y - 1.9) return; }   // not inside a player
    game.net.broadcast('it', { e: 'rm', id: it.id });
    hostEdit(cv, [pack(i, mat)], { pl: 1 });
  }

  // ---------------------------------------------------------------------------------------------- net (all peers)
  function onMnd(d) {
    if (!map || d.s !== map.seed) return;
    if (d.k === 'ore') { map.oreSeen = d.o | 0; try { game.rewardviz?.reward('ore', d.n); } catch { /* cosmetic */ } return; }
    if (d.k === 'sync') { for (const [v, arr] of Object.entries(d.l || {})) { const cv = map.vols[v]; if (!cv) continue; map.log[v] = arr.slice(); markDirty(cv, cv.vol.apply(arr)); } return; }
    const cv = map.vols[d.v]; if (!cv) return;
    if (d.k === 'hp') {
      const m = cv.vol.data[d.c]; cv.pct.set(d.c, d.p);
      if (m) { setCrack(cv, d.c, d.p); hitFx(cv, d.c, m); }
    } else if (d.k === 'ed') {
      (map.log[d.v] ||= []).push(...d.e);
      markDirty(cv, cv.vol.apply(d.e));
      let n = 0;
      for (const e of d.e) {
        const i = (e - (e & 15)) / 16; clearCrack(cv, i); cv.pct.delete(i);
        if (d.b && n++ < 2) { hitFx(cv, i, d.b); fx(cv, i); }
        if (d.cave && n++ < 5) fx(cv, i);
        if (d.pl && n++ < 1) { cv.vol.center(i, V); try { game.audio?.at?.('hit_wall', V, 0.5, { refDistance: 4, maxDistance: 30, pitch: 1.3 }); } catch { /* audio optional */ } }
      }
      if (d.cave) { cv.vol.center((d.e[0] - (d.e[0] & 15)) / 16, V); try { game.audio?.at?.('hit_wall', V, 1, { refDistance: 8, maxDistance: 70, pitch: 0.55 }); game.audio?.at?.('cave_creak', V, 0.8, { refDistance: 8, maxDistance: 70, delay: 0.05 }); } catch { /* audio optional */ } if (game.player?.pos.distanceTo(V) < 14) { game.engine?.shake?.(0.3); game.ui?.toast?.(t('Cave-in!'), 'bad'); } }
    } else if (d.k === 'warn') {
      cv.vol.center(d.c, V); V.y += 1.2;
      warns.push({ pos: V.clone(), until: time + d.ms / 1000, next: 0, v: d.v });
      try { game.audio?.at?.('cave_creak', V, 0.9, { refDistance: 8, maxDistance: 45 }); } catch { /* audio optional */ }
      if (game.player && game.player.pos.distanceTo(V) < 10) game.ui?.toast?.(t('The ceiling groans - place a support beam!'), 'bad');
    } else if (d.k === 'ok') { warns.length = 0; }
  }
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet = net;
    net.on_('mnd', onMnd);
  }
  offs.push(game.mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  offs.push(game.mods.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    H('mnhit', (d, from) => { try { onHit(d, from); } catch (e) { console.error('mnhit', e); } });
    H('mnput', (d, from) => { try { onPut(d, from); } catch (e) { console.error('mnput', e); } });
    H('mnsync', (d, from) => {
      if (!game.isHost || !map || d?.s !== map.seed) return;
      const l = {}; map.log.forEach((arr, v) => { if (arr?.length) l[v] = arr; });
      if (Object.keys(l).length) game.net.sendTo(from, 'mnd', { k: 'sync', s: map.seed, l });
    });
  }));

  // ---------------------------------------------------------------------------------------------- client: aiming, swing, placing, prompts
  function aim(reach) {
    if (!map) return null;
    const eye = game.camera.position;
    F.set(0, 0, -1).applyQuaternion(game.camera.quaternion);
    let best = null;
    for (const cv of map.vols) {
      const v = cv.vol, cx = v.x + v.nx * CELL / 2, cy = v.y + v.ny * CELL / 2, cz = v.z + v.nz * CELL / 2;
      if (Math.hypot(eye.x - cx, eye.y - cy, eye.z - cz) > Math.hypot(v.nx, v.ny, v.nz) * CELL / 2 + reach + 1) continue;
      const h = C.raycast(v, eye.x, eye.y, eye.z, F.x, F.y, F.z, reach);
      if (h && (!best || h.t < best.t)) best = { ...h, cv };
    }
    return best;
  }
  function onSwing(h) {
    const p = game.player;
    if (!map || !p || p.dead || p.inShip || game.run?.phase !== 'moon') return;
    const a = aim(Math.min(MN.reach - 0.4, (h?.reach || 2.4) + 0.4));
    if (!a || a.cv.vol.data[a.i] === M.BEDROCK) return;
    if (game.creatures?.raycast?.(game.camera.position, F, a.t)) return;   // a creature in front wins
    const held = p.heldItem?.();
    game.net.request('mnhit', { s: map.seed, v: a.cv.vol.id, c: a.i, d: Math.round(Number(h?.dmg) || held?.def?.dmg || 5) });
    game.swingAnim = Math.max(game.swingAnim || 0, 0.6);
    game.engine?.punch?.(0.012, 0, 0);
  }
  const orig = game.resolveMelee;
  const wrapper = function (h) { if (!disposed) { try { onSwing(h); } catch (e) { console.warn('[mining] swing', e); } } return orig.call(this, h); };
  if (typeof orig === 'function') game.resolveMelee = wrapper;

  offs.push(game.mods.on('useItem', (it, hk, g) => {
    if (disposed || g !== game || hk.handled || !it?.def?.mn || !map) return;
    hk.handled = true;
    const a = aim(4.2), n = a?.n;
    if (!a || !n || (!n[0] && !n[1] && !n[2])) { game.ui?.toast?.(t('Nothing to place it on'), 'bad'); return; }
    const x = a.x + n[0], y = a.y + n[1], z = a.z + n[2], v = a.cv.vol;
    if (!v.inb(x, y, z) || v.get(x, y, z)) { game.ui?.toast?.(t('Nothing to place it on'), 'bad'); return; }
    game.net.request('mnput', { s: map.seed, v: v.id, c: v.idx(x, y, z), id: it.id });
  }));
  offs.push(game.mods.on('interactables', (list, g) => {
    if (disposed || g !== game || !map || game.run?.phase !== 'moon') return;
    const p = game.player; if (!p || p.dead || p.inShip) return;
    const a = aim(3.4); if (!a) return;
    const m = a.cv.vol.data[a.i], held = p.heldItem?.();
    const pct = a.cv.pct.get(a.i) || 0;
    a.cv.vol.center(a.i, V);
    if (held?.def?.mn) { list.push({ pos: V.clone(), r: 0.9, reach: 3.4, label: tf('Place {n} [LMB]', { n: t(held.def.name) }), sub: '', action: () => {} }); return; }
    list.push({ pos: V.clone(), r: 0.9, reach: 3.4, label: `${t(MATS[m].n)}${pct ? ' ' + pct + '%' : ''}`, sub: MATS[m].hp === Infinity ? t('Unbreakable') : t('Hit it (LMB) with a pickaxe') + (C.isOre(m) ? ' · ' + tf('ORE {a}/{b} today', { a: map.oreSeen ?? Math.round(map.tally.value), b: MN.valueCap }) : ''), action: () => {} });
  }));

  offs.push(game.mods.on('mapLoaded', (w, g) => { if (g === game) load(w); }));
  offs.push(game.mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    time += dt;
    if (!map) return;
    if (game.world.outdoor !== map.outdoor || game.world.facility !== map.facility) { clear(); return; }
    if (!syncAsked && !game.isHost && game.net?.connected && game.run?.phase === 'moon') { syncAsked = true; game.net.request('mnsync', { s: map.seed }); }
    let budget = 3;
    for (const cv of map.vols) for (const k of cv.dirty) { if (budget-- <= 0) break; cv.dirty.delete(k); buildChunk(cv, k); }
    for (let i = warns.length - 1; i >= 0; i--) {
      const w = warns[i];
      if (time >= w.until) { warns.splice(i, 1); continue; }
      if (time >= w.next) { w.next = time + 0.35; game.particles?.burst?.(w.pos, 'landpuff', null, 0.5); }
    }
    if (cracks) for (const q of cracks.pool) if (q.visible && time - q.userData.t > 25) q.visible = false;
  }));

  return {
    /** debug / tests: volumes, host actions */
    volumes: () => map?.vols.map((cv) => cv.vol) || [],
    stats: () => map && { seed: map.seed, vols: map.vols.length, tally: map.tally, colliders: map.vols.reduce((n, cv) => n + [...cv.chunks.values()].filter((c) => c.col).length, 0), cells: map.vols.reduce((n, cv) => n + cv.vol.solidCount(), 0) },
    hostBreak: (v, i, by = game.selfId) => { const cv = map?.vols[v]; if (game.isHost && cv && cv.vol.data[i]) hostBreak(cv, i, by); },
    aim,
    dispose() {
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      if (game.resolveMelee === wrapper) game.resolveMelee = orig;
      if (cracks) { for (const q of cracks.pool) q.removeFromParent(); cracks.geo.dispose(); for (const m of cracks.mats) { m.map?.dispose(); m.dispose(); } cracks = null; }
      clear(); matLit.dispose(); matGlow.dispose();
    },
  };
}
