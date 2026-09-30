// cosm5 node tests: data integrity, builders for every id, sync encode/decode roundtrip, skins on real weapon models, shop rotation,
// grant / buy / rules, emotes, i18n coverage, first-person clip check.   node tools/harness/cosm5.test.mjs
const warn = console.warn; let warned = 0; console.warn = (...a) => { warned++; warn(...a); };
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const THREE = await import('three');
const D = await import('../../src/game/cosm5_data.js');
const M = await import('../../src/models/cosm5_models.js');
const { OUTFIT_BY_ID, BACK_ACCS } = await import('../../src/models/cosmetics.js');
const { createAvatar, HATS, SUIT_COLORS } = await import('../../src/models/avatar.js');
const { TIER_ORDER } = await import('../../src/game/tiers.js');
const { RNG } = await import('../../src/core/rng.js');
const W = await import('../../src/render/weaponskins.js');
const C = await import('../../src/game/cosm5.js');
const { EMOTE_BY_ID, EMOTES, isEmoteUnlocked } = await import('../../src/game/emotes.js');
const { hasTranslation } = await import('../../src/core/i18n.js');
const { createItemModel } = await import('../../src/models/items.js');
const { createPlasmaBladeModel, createBlasterModel } = await import('../../src/models/worlds2_models.js');
const cos = await import('../../src/game/cosmetics.js');

// ---- 1. data integrity
const ids = D.C5.map((e) => e.id), keys = D.C5.map(D.keyOf);
ok(new Set(ids).size === ids.length, 'ids unique across slots');
ok(new Set(keys).size === keys.length, 'keys unique');
const cnt = (s) => D.bySlot(s).length;
ok(cnt('suit') >= 20 && cnt('hat') >= 25 && cnt('back') >= 14 && cnt('skin') === 18 && cnt('emote') === 11, `counts suit ${cnt('suit')} hat ${cnt('hat')} back ${cnt('back')} skin ${cnt('skin')} emote ${cnt('emote')}`);
for (const e of D.C5) {
  ok(TIER_ORDER.includes(e.tier), 'tier ' + e.id);
  ok(['shop', 'crate', 'boss', 'secret'].includes(e.src), 'src ' + e.id);
  ok(e.name && e.desc && e.how, 'text ' + e.id);
  if (e.src === 'shop') ok(e.price > 0, 'price ' + e.id);
  if (e.src === 'boss') ok(e.boss && D.BOSS_DROPS[e.boss]?.includes(D.keyOf(e)), 'boss ' + e.id);
}
for (const s of ['shop', 'crate', 'boss', 'secret']) ok(D.C5.some((e) => e.src === s), 'has source ' + s);

// ---- 2. every id resolves to a builder / registry entry
for (const e of D.bySlot('suit')) { ok(!!M.C5_SUIT_BUILDERS[e.id], 'suit builder ' + e.id); ok(!!OUTFIT_BY_ID[e.id], 'outfit registered ' + e.id); ok(SUIT_COLORS.some((s) => s.id === e.id), 'suit colour row ' + e.id); }
for (const e of D.bySlot('hat')) { const h = M.buildC5Hat(e.id); ok(h && h.children.length > 0, 'hat builder ' + e.id); ok(HATS.some((x) => x.id === e.id), 'hat in HATS ' + e.id); }
for (const e of D.bySlot('back')) { ok(typeof M.C5_BACK_BUILDERS[e.id] === 'function', 'back builder ' + e.id); ok(BACK_ACCS.some((x) => x.id === e.id), 'back registered ' + e.id); }
for (const e of D.bySlot('skin')) ok(W.SKIN_IDS.includes(e.id), 'skin id ' + e.id);
ok(W.SKIN_IDS.length === 18 && W.SKIN_IDS.every((s) => D.C5_BY_ID[s]?.slot === 'skin'), 'skin tables agree');
for (const e of D.bySlot('emote')) { const d = EMOTE_BY_ID[e.id]; ok(d && typeof d.fx === 'function' && EMOTES.includes(d), 'emote ' + e.id); ok(!isEmoteUnlocked({ emotes: [] }, e.id), 'emote locked by default ' + e.id); ok(isEmoteUnlocked({ emotes: [e.id] }, e.id), 'emote unlock ' + e.id); }
for (const id of M.C5_HAT_IDS) ok(D.C5_BY_ID[id]?.slot === 'hat', 'hat builder has data ' + id);
for (const id of Object.keys(M.C5_SUIT_BUILDERS)) ok(D.C5_BY_ID[id]?.slot === 'suit', 'suit builder has data ' + id);
for (const id of Object.keys(M.C5_BACK_BUILDERS)) ok(D.C5_BY_ID[id]?.slot === 'back', 'back builder has data ' + id);
for (const e of [...D.bySlot('suit'), ...D.bySlot('hat'), ...D.bySlot('back')]) ok(!!cos.entry(e.slot, e.id), 'wardrobe entry ' + D.keyOf(e));

// ---- 3. sync code roundtrip
const rnd = new RNG(5);
for (let i = 0; i < 400; i++) {
  const pick = (s) => (rnd.chance(0.25) ? (s === 'skin' ? 'none' : 'orange') : rnd.pick(D.ID_TABLE[s]));
  const look = { suit: pick('suit'), hat: pick('hat'), back: pick('back'), skin: pick('skin') };
  const code = D.encodeLook(look), dec = D.decodeLook(code);
  ok(code.length <= 16, 'code short ' + code);
  ok(!!dec, 'decodes ' + code);
  for (const s of ['suit', 'hat', 'back', 'skin']) ok(dec[s] === (D.ID_TABLE[s].includes(look[s]) ? look[s] : null), `roundtrip ${s} ${code}`);
}
for (const s of ['suit', 'hat', 'back', 'skin']) for (const id of D.ID_TABLE[s]) ok(D.decodeLook(D.encodeLook({ [s]: id }))[s] === id, 'single ' + id);
for (const g of [null, undefined, 5, '', 'x', 'a.1.2.3', 'b.1.1.1.1', 'a.zz.1.1.1', 'a.1.1.1.1.1', 'a.-1.0.0.0', 'a.1.1.1.' + 'z'.repeat(40), {}]) ok(D.decodeLook(g) === null || typeof D.decodeLook(g) === 'object', 'garbage safe');
ok(D.decodeLook('a.zz.1.1.1')?.suit === null, 'out of range index -> null');
ok(D.decodeLook('b.1.1.1.1') === null && D.decodeLook('a.1.2') === null, 'bad version / shape -> null');

// ---- 4. avatars: every cosmetic builds, animates, stays cheap; first-person clip check
const av = createAvatar({});
const tris = (root) => { let n = 0; root.traverse((o) => { if (o.isMesh && o.visible) { const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return n; };
const base = tris(av.root);
for (const e of D.C5) {
  if (!['suit', 'hat', 'back'].includes(e.slot)) continue;
  let n0 = 0, n1 = 0; av.root.traverse(() => n0++);
  av.setLook({ [e.slot]: e.id });
  av.update(0.016, { speed: 3, time: 1.3 }); av.update(0.016, { speed: 0, time: 2.1 });
  av.root.traverse(() => n1++);
  ok(n1 > n0, 'adds nodes ' + e.id);
  ok(tris(av.root) - base < 3500, `triangle budget ${e.id} +${Math.round(tris(av.root) - base)}`);
  av.root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(av.root), sz = bb.getSize(new THREE.Vector3());
  ok(isFinite(sz.x) && sz.y < 3.4 && sz.x < 2.2, `sane bounds ${e.id} ${sz.x.toFixed(2)}x${sz.y.toFixed(2)}`);
  av.setLook({ suit: 'orange', hat: 'none', back: 'none' });
}
// FP body: head / neck / backpack / arms are hidden by fpbody_grip.poseFpBody; nothing else may come within 0.16 m of the eye
const { poseFpBody, FP } = await import('../../src/game/fpbody_grip.js');
for (const e of D.bySlot('suit')) {
  const a = createAvatar({}); a.setLook({ suit: e.id });
  a.update(0.016, { speed: 0, time: 1 }); poseFpBody(a);
  a.root.position.set(0, 0, -FP.back);   // the body stands behind the camera; the camera looks along +z of the avatar
  a.root.updateMatrixWorld(true);
  const eye = new THREE.Vector3(0, 1.6, 0); let minD = 9, worst = '', nVis = 0;
  a.root.traverse((o) => {
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent) if (p.visible === false) return;
    nVis++;
    const pos = o.geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 2) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); const d = v.distanceTo(eye); if (d < minD) { minD = d; worst = o.geometry.uuid.slice(0, 4); } }
  });
  ok(nVis > 4, 'FP body keeps some visible meshes ' + e.id);
  if (process.env.COSM5_VERBOSE) console.log('fp', e.id, nVis, minD.toFixed(3));
  ok(minD > 0.16, `FP clip ${e.id} min dist ${minD.toFixed(3)} (${worst})`);
}
{
  const a = createAvatar({}); a.setLook({ hat: 'crt', back: 'jetpack' }); poseFpBody(a);
  const vis = []; a.root.traverse((o) => { if (o.isMesh) { let hid = false; for (let p = o; p; p = p.parent) if (p.visible === false) hid = true; if (!hid) vis.push(o); } });
  const under = (root) => vis.some((o) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; });
  ok(!under(a.parts.hatSlot), 'hat hidden in FP body');
  ok(!under(a.parts.backpack), 'back items hidden in FP body');
}

// ---- 5. weapon skins on real models
const models = { plasma: createPlasmaBladeModel(), blaster: createBlasterModel() };
for (const id of ['katana', 'bat', 'pistol', 'crowbar']) { try { models[id] = createItemModel(id); } catch (e) { models[id] = null; } }
const mats = (root) => { const a = []; root.traverse((o) => { if (o.isMesh) a.push(o.material); }); return a; };
for (const [name, m] of Object.entries(models)) {
  if (!m) continue;
  const before = mats(m);
  ok(before.length > 0, 'model has meshes ' + name);
  for (const s of W.SKIN_IDS) {
    const n = W.applySkin(m, s);
    ok(n > 0, `skin ${s} applies to ${name}`);
    ok(W.skinOf(m) === s, `skinOf ${s} ${name}`);
    W.applySkin(m, W.SKIN_IDS[(W.SKIN_IDS.indexOf(s) + 3) % 10]);       // re-skin on top of a skin
    W.clearSkin(m);
    const after = mats(m);
    ok(after.length === before.length && after.every((x, i) => x === before[i]), `clear restores originals ${s} ${name}`);
  }
}
for (const [kind, lib] of [['lambert', THREE.ShaderLib.lambert], ['basic', THREE.ShaderLib.basic]]) {
  for (const inc of ['#include <common>', '#include <color_fragment>']) ok(lib.fragmentShader.includes(inc), `${kind} fragment has ${inc}`);
  ok(lib.vertexShader.includes('#include <begin_vertex>') && lib.vertexShader.includes('#include <common>'), kind + ' vertex includes');
}
ok(THREE.ShaderLib.lambert.fragmentShader.includes('#include <emissivemap_fragment>'), 'lambert emissive include');
for (const kind of ['lambert', 'basic']) {
  const Mat = kind === 'lambert' ? THREE.MeshLambertMaterial : THREE.MeshBasicMaterial;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new Mat({ color: 0x888888 }));
  const g = new THREE.Group(); g.add(mesh); W.applySkin(g, 'lava');
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib[kind].vertexShader, fragmentShader: THREE.ShaderLib[kind].fragmentShader };
  mesh.material.onBeforeCompile(sh, null);
  ok(sh.fragmentShader.includes('c5skin(vC5') && sh.vertexShader.includes('vC5 = position') && sh.uniforms.uC5T === W.skinClock, `patch ${kind}`);
  ok(sh.fragmentShader.includes('#define C5P 6'), 'pattern define');
}
{
  const pm = createPlasmaBladeModel(); W.applySkin(pm, 'holo');
  let add = 0; pm.traverse((o) => { if (o.isMesh && o.material.blending === THREE.AdditiveBlending) { add++; ok(o.material.color.getHex() === W.SKIN_ACCENT.holo, 'halo tinted'); } });
  ok(add >= 1, 'plasma blade has halo meshes');
}

// ---- 6. rotation + pool + boss drops
const r1 = D.rotationFor(20000, RNG), r2 = D.rotationFor(20000, RNG), r3 = D.rotationFor(20001, RNG);
ok(JSON.stringify(r1) === JSON.stringify(r2), 'rotation deterministic');
ok(r1.daily.length === 8 && new Set(r1.daily).size === 8, 'rotation 8 unique');
ok(r1.daily.every((k) => D.C5_BY_KEY[k]?.src === 'shop'), 'rotation only shop items');
ok(JSON.stringify(r1.daily) !== JSON.stringify(r3.daily), 'rotation changes daily');
ok(r1.featured && D.C5_BY_KEY[r1.featured].src === 'crate', 'weekly feature');
const seen = new Set(); for (let d = 20000; d < 20030; d++) D.rotationFor(d, RNG).daily.forEach((k) => seen.add(k));
ok(seen.size >= D.C5.filter((e) => e.src === 'shop').length - 2, `rotation covers the shop over a month (${seen.size})`);
for (const t of ['common', 'uncommon', 'rare', 'epic']) ok(D.cosmeticPool(t).length > 0, 'pool ' + t);
ok(D.cosmeticPool('common').every((e) => e.tier === 'common' && ['shop', 'crate'].includes(D.C5_BY_KEY[e.key].src)), 'pool filter');
ok(D.cosmeticPool('epic', { slot: 'hat' }).every((e) => e.slot === 'hat'), 'pool slot filter');
ok(D.cosmeticPool('mythic').length === 0 && D.rollCosmetic(new RNG(1), 'mythic'), 'mythic falls back to a lower tier');
ok(!D.cosmeticPool('epic').some((e) => D.C5_BY_KEY[e.key].src === 'boss' || D.C5_BY_KEY[e.key].src === 'secret'), 'pool never hands out trophies');
for (const b of Object.keys(D.BOSS_DROPS)) ok(D.BOSS_DROPS[b].every((k) => D.C5_BY_KEY[k]), 'boss table ' + b);

// ---- 7. profile: grant, buy, rules
const P = () => ({ level: 20, coins: 5000, stats: { sold: 0, quotasMet: 0, creatureKills: 0 }, emotes: [], cosmetics: { suits: ['orange'], hats: ['none'] } });
{
  const p = P();
  for (const e of D.C5) ok(C.grantC5(p, D.keyOf(e)) === 'new' && C.owns5(p, e) && C.grantC5(p, D.keyOf(e)) === 'dup', 'grant ' + e.id);
  ok(C.grantC5(p, 'suit:nope') === 'bad', 'grant unknown');
  const q = P(), day = 20123, rot = C.offersFor(q, day);
  ok(rot.offers.length === 8 && rot.featured, 'offers');
  const o = rot.offers[0];
  q.coins = 1e6; const before = q.coins;
  const r = C.buyOffer(q, o.key, { day });
  ok(r.ok && q.coins === before && C.owns5(q, D.C5_BY_KEY[o.key]), 'claim ok: followers are never spent');
  ok(!C.buyOffer(q, o.key, { day }).ok, 'no double buy');
  ok(!C.buyOffer(q, 'suit:eoty', { day }).ok, 'not in rotation');
  const poor = P(); poor.coins = 1; ok(/^Unlocks at \d+ followers$/.test(C.buyOffer(poor, rot.offers[1].key, { day }).why), 'below the follower milestone');
  const low = P(); low.level = 1; const lv = rot.offers.find((x) => x.minLevel > 1); if (lv) ok(/Requires level/.test(C.buyOffer(low, lv.key, { day }).why), 'level gate');
  const rich = P(); rich.stats = { sold: 25000, quotasMet: 20, creatureKills: 400 }; rich.level = 45; rich.cosm5 = { flags: { glitch: true, quoted: 9, appraised: 45, raved: 6 } };
  for (const [k, r0] of Object.entries(C.RULES)) { ok(r0.test(rich), 'rule met ' + k); if (k !== 'emote:undo') ok(!r0.test(P()), 'rule not met at start ' + k); }
}
for (const k of Object.keys(C.RULES)) ok(!!D.C5_BY_KEY[k], 'rule key resolves ' + k);

// ---- 8. emotes run on both bodies
for (const cls of [false, true]) {
  const a = createAvatar({ classic: cls });
  for (const e of D.bySlot('emote')) {
    const def = EMOTE_BY_ID[e.id], root = a.root;
    for (const tt of [0.1, 0.6, 1.3, 2.4, 3.9]) {
      root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
      a.update(0.016, { speed: 0, emote: def.base, time: tt });
      def.fx(a, root, tt, def.dur);
      ok([root.position.x, root.position.y, root.position.z, root.rotation.x, root.rotation.y, root.rotation.z].every(Number.isFinite), `emote finite ${e.id} classic=${cls}`);
      ok(Math.abs(root.position.x) < 1.2 && Math.abs(root.position.z) < 1.2 && root.position.y < 1.2, `emote stays near ${e.id}`);
    }
    ok(typeof def.name === 'string' && def.name.length > 0, 'emote name getter ' + e.id);
  }
}

// ---- 9. i18n
for (const e of D.C5) for (const f of [e.name, e.desc, e.how]) for (const l of ['tr', 'ru']) ok(hasTranslation(l, f), `i18n ${l}: ${f.slice(0, 40)}`);
for (const s of ['Rotation shop', 'Weapon skins', 'Emotes', 'Preview weapon', 'No skin', 'Play', 'Common', 'Legendary', 'Mythic', 'NEW COSMETIC']) for (const l of ['tr', 'ru']) ok(hasTranslation(l, s), `i18n ${l}: ${s}`);

ok(warned === 0, 'no console.warn (' + warned + ')');
console.log(bad ? `FAILED (${bad})` : `cosm5: all ok (${D.C5.length} cosmetics)`);
process.exit(bad ? 1 : 0);
