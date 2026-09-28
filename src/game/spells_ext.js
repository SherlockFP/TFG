// TFG wave 2 - five new spells on top of magic.js (docs/wave2/combat.md): CHAIN LIGHTNING ("ZAP" / "ŞİMŞEK"), FROST NOVA ("FROST" / "BUZ"),
// METEOR, DECOY ("DECOY" / "KOPYA") and TOTEM. Same casting ways as every spell (voice V, chat word, hold-C wheel) because the words are
// added to magic.js's lexicon (registerSpellData) and the behaviour is attached through game.magic.ext (prep / fx / host hooks).
// Skillbooks: skillbook_zap / decoy / totem (rare), frost (epic), meteor (legendary); also sold in the Company Store Magic tab for Clout.
// Net: the stock 'spell' request (magic.js) carries the cast; host follow-ups ride 'fx' { k: 'spell', s: 'cbx', t: ... }.
import * as THREE from 'three';
import { registerItem, ITEMS } from './items.js';
import { TIERS } from './tiers.js';
import { registerSpellData } from './magic.js';
import { registerGlyph } from '../ui/panels/spellbook.js';
import { createSkillbookModel } from '../models/skillbook.js';
import { createTotemMesh } from '../models/combat_wave2.js';
import { G } from '../physics/physics.js';
import { FACILITY_Y } from '../world/facility.js';
import { addTranslations } from '../core/i18n.js';
import { clamp, fin3, arr3, synth, sin, ex, nz } from './combat_kit.js';

const NEW_SPELLS = [
  { id: 'zap', name: 'Chain Lightning', say: { en: 'ZAP', tr: 'ŞİMŞEK' }, words: { en: ['zap', 'zaps'], tr: ['şimşek', 'simsek', 'zap'] }, mana: 30, cd: 9, tier: 'rare', color: 0xb8e8ff,
    desc: 'A bolt that arcs from the first enemy you aim at through up to 4 more (26 damage, -20% per jump).' },
  { id: 'frost', name: 'Frost Nova', say: { en: 'FROST', tr: 'BUZ' }, words: { en: ['frost', 'frozen'], tr: ['buz', 'buzz'] }, mana: 35, cd: 16, tier: 'epic', color: 0x9fe8ff,
    desc: 'A ring of ice around you: everything within 7 m is slowed by 65% for 5 s.' },
  { id: 'meteor', name: 'Meteor', say: { en: 'METEOR', tr: 'METEOR' }, words: { en: ['meteor', 'meteors', 'meteorite'], tr: ['meteor', 'göktaşı', 'goktasi'] }, mana: 60, cd: 40, tier: 'legendary', color: 0xff5a1a,
    desc: 'Marks the spot you look at: 1.7 s later a meteor lands (6.5 m blast, 90 damage). Very loud.' },
  { id: 'decoy', name: 'Decoy', say: { en: 'DECOY', tr: 'KOPYA' }, words: { en: ['decoy', 'decoys'], tr: ['kopya', 'kopyala'] }, mana: 30, cd: 30, tier: 'rare', color: 0x7dffe0,
    desc: 'A fake you appears for 10 s and draws the attention of nearby creatures.' },
  { id: 'totem', name: 'Totem', say: { en: 'TOTEM', tr: 'TOTEM' }, words: { en: ['totem', 'totems'], tr: ['totem'] }, mana: 25, cd: 5, tier: 'rare', color: 0xffd27a,
    desc: 'Plants a return point where you stand. Cast again (free) to teleport back to it.' },
];
registerSpellData(NEW_SPELLS);

// skillbooks (registered at import so chests, shops and saves can spawn them by id)
const BOOK_VALUE = { rare: [70, 100], epic: [115, 150], legendary: [200, 240] };
const BOOK_COIN = { rare: 400, epic: 900, legendary: 2000 };
NEW_SPELLS.forEach((sp) => {
  const bid = 'skillbook_' + sp.id;
  if (!ITEMS[bid]) registerItem({ id: bid, name: 'Skillbook: ' + sp.name, kind: 'skillbook', tier: sp.tier, spell: sp.id, value: BOOK_VALUE[sp.tier], weight: 2, hands: 1, coin: BOOK_COIN[sp.tier], shop: 'magic' });
});
const GLYPHS = {
  zap: ['......##....', '.....##.....', '....##......', '...####.....', '..######....', '.....##.....', '....##......', '...##.......', '..##........', '.##.........', '.#..........', '............'],
  frost: ['.....##.....', '..#..##..#..', '...#.##.#...', '....####....', '##..####..##', '.##########.', '.##########.', '##..####..##', '....####....', '...#.##.#...', '..#..##..#..', '.....##.....'],
  meteor: ['........##..', '.......###..', '....#.####..', '...#.#####..', '..#.######..', '.#.#######..', '#.#########.', '.##########.', '..#########.', '...#######..', '....#####...', '............'],
  decoy: ['..##....##..', '..##....##..', '.####..####.', '.####..####.', '#.##....##.#', '..##....##..', '..##....##..', '.#..#..#..#.', '.#..#..#..#.', '.#..#..#..#.', '............', '............'],
  totem: ['....####....', '...######...', '....####....', '...######...', '..########..', '...######...', '..########..', '...######...', '...######...', '..########..', '.##########.', '............'],
};
for (const [id, rows] of Object.entries(GLYPHS)) registerGlyph(id, rows);

addTranslations({
  'Chain Lightning': 'Zincir Şimşek', 'Frost Nova': 'Buz Patlaması', Meteor: 'Göktaşı', Decoy: 'Kopya', Totem: 'Totem',
  'Skillbook: Chain Lightning': 'Büyü Kitabı: Zincir Şimşek', 'Skillbook: Frost Nova': 'Büyü Kitabı: Buz Patlaması', 'Skillbook: Meteor': 'Büyü Kitabı: Göktaşı',
  'Skillbook: Decoy': 'Büyü Kitabı: Kopya', 'Skillbook: Totem': 'Büyü Kitabı: Totem',
  'A bolt that arcs from the first enemy you aim at through up to 4 more (26 damage, -20% per jump).': 'Nişan aldığın ilk düşmandan 4 düşmana daha sıçrayan şimşek (26 hasar, her sıçramada -%20).',
  'A ring of ice around you: everything within 7 m is slowed by 65% for 5 s.': 'Etrafında buz halkası: 7 m içindeki her şey 5 sn boyunca %65 yavaşlar.',
  'Marks the spot you look at: 1.7 s later a meteor lands (6.5 m blast, 90 damage). Very loud.': 'Baktığın yeri işaretler: 1.7 sn sonra göktaşı düşer (6.5 m patlama, 90 hasar). Çok gürültülü.',
  'A fake you appears for 10 s and draws the attention of nearby creatures.': '10 sn boyunca sahte bir sen belirir ve yakındaki yaratıkların dikkatini çeker.',
  'Plants a return point where you stand. Cast again (free) to teleport back to it.': 'Durduğun yere dönüş noktası diker. Tekrar okuyunca (ücretsiz) oraya ışınlanırsın.',
  'Too weak to pay the blood price.': 'Kan bedelini ödeyemeyecek kadar zayıfsın.', 'No target.': 'Hedef yok.', 'Totem planted.': 'Totem dikildi.', 'Back at the totem.': 'Totem\'e döndün.',
});

const SOUNDS = {
  spell_zap: (sr) => synth(sr, 0.5, (t) => (nz() * ex(t, 12) * 1.2 + sin(1900 - 900 * t, t) * ex(t, 6) * 0.5) * (t < 0.02 ? t / 0.02 : 1) + sin(50, t) * ex(t, 8) * 0.5),
  spell_frost: (sr) => synth(sr, 0.9, (t) => { const u = t / 0.9; return (sin(1400 + 1600 * u, t) * 0.4 + nz() * 0.5 * (1 - u)) * Math.sin(Math.PI * Math.min(1, u * 1.2)) * ex(t, 2.2) + sin(90, t) * ex(t, 7) * 0.6; }),
  spell_meteor: (sr) => synth(sr, 1.9, (t) => { const u = t / 1.7; const fall = t < 1.7 ? sin(1100 * (1 - u) + 90, t) * u * u * 0.6 + nz() * u * u * 0.3 : 0; const boom = t > 1.7 ? (sin(45, t) * 1.3 + nz() * 0.9) * ex(t - 1.7, 5) : 0; return fall + boom; }),
  spell_decoy: (sr) => synth(sr, 0.5, (t) => (sin(500 + 900 * t, t) + sin(760 + 700 * t, t) * 0.7) * ex(t, 6) * Math.min(1, t * 30)),
  spell_totem: (sr) => synth(sr, 0.7, (t) => (sin(110, t) * 0.9 + sin(220, t) * 0.4 + sin(660, t) * 0.25 * ex(t, 5)) * ex(t, 4.5) * Math.min(1, t * 40)),
};

const FLASH = (c) => ({ count: 12, color: [c, 0xffffff], speed: 3.4, up: 1.2, life: 0.5, size: 0.06, gravity: -1, drag: 2.5 });

export function installSpellsExt(g, K) {
  const magic = g.magic;
  if (!magic?.ext) return null;
  const ext = magic.ext;
  K.sounds(SOUNDS);
  // skillbook models
  NEW_SPELLS.forEach((sp, i) => { const bid = 'skillbook_' + sp.id; if (K.mm?.itemModels && !K.mm.itemModels.has(bid)) K.mm.itemModels.set(bid, (T) => createSkillbookModel(T, { cover: TIERS[sp.tier]?.hex ?? 0x6a3fb0, rune: sp.color, glyph: 8 + i })); });
  const S = (id) => magic.SPELLS[id];
  const floorAt = (x, y, z, up = 0.6, depth = 8) => { const h = g.physics.raycast({ x, y: y + up, z }, { x: 0, y: -1, z: 0 }, depth, G.STATIC | G.DOOR); return h ? h.point.y : y; };
  const decoyVis = new Map();      // did -> { mesh, until, t }
  const totems = new Map();        // caster id -> { mesh, t }
  let myTotem = null;              // { pos } of this player's own totem
  const hostDecoys = new Map();    // 'decoy:<did>' -> { pos, until, hp, did }
  let aiCache = null;

  // ================================================================== CHAIN LIGHTNING
  const zapHost = (from, eye, dir, pw) => {
    const live = [...g.creatures.host.values()].filter((c) => !c.dead && !c.def?.hazard && c.type !== 'web' && c.maxHp !== null);
    let first = null, best = 0.93;
    for (const c of live) {
      const ctr = K.ctrOf(c), to = ctr.clone().sub(eye), d = to.length();
      if (d > 24 || d < 0.3) continue;
      const dot = to.divideScalar(d).dot(dir);
      if (dot < best || !g.physics.lineOfSight(eye, ctr, G.STATIC | G.DOOR)) continue;
      best = dot; first = { c, ctr };
    }
    const pts = [eye.clone().addScaledVector(dir, 0.5)];
    if (!first) {
      const wall = g.physics.raycast(eye, dir, 16, G.STATIC | G.DOOR);
      pts.push(wall ? new THREE.Vector3(wall.point.x, wall.point.y, wall.point.z) : eye.clone().addScaledVector(dir, 12));
    } else {
      const hit = new Set([first.c.id]);
      let cur = first;
      pts.push(cur.ctr);
      for (let i = 0; i < 5; i++) {
        K.hurt(cur.c, 26 * pw * Math.pow(0.8, i), from, { stun: 0.4 });
        let next = null, bd = 6.5;
        for (const c of live) {
          if (hit.has(c.id) || c.dead) continue;
          const ctr = K.ctrOf(c), d = ctr.distanceTo(cur.ctr);
          if (d < bd && g.physics.lineOfSight(cur.ctr, ctr, G.STATIC | G.DOOR)) { bd = d; next = { c, ctr }; }
        }
        if (!next) break;
        hit.add(next.c.id); pts.push(next.ctr); cur = next;
      }
    }
    g.creatures.noise(eye, 2);
    g.net.broadcast('fx', { k: 'spell', s: 'cbx', t: 'zap', pts: pts.map(arr3) });
  };
  ext.set('zap', {
    fx(d, local) {
      const p = fin3(d.p), dir = fin3(d.d);
      if (local) { K.snd('spell_zap', null, 0.9); g.engine.flash?.(0xb8e8ff, 0.22); g.engine.punch?.(0.03, 0, 0); g.engine.shake(0.15); } else if (p) K.snd('spell_zap', p, 0.9);
      if (p && dir) K.burst(p.clone().addScaledVector(dir, 0.7), FLASH(0xb8e8ff), dir, 1);
    },
    host(d, from, eye, dir, pw) { if (dir) zapHost(from, eye, dir, pw); },
  });

  // ================================================================== FROST NOVA
  ext.set('frost', {
    fx(d, local) {
      const p = fin3(d.p);
      if (!p) return;
      const feet = p.clone().setY(p.y - 1.4);
      K.ring(feet.clone().setY(feet.y + 0.08), S('frost').color, 0.4, 7, 0.7);
      K.sphere(feet.clone().setY(feet.y + 0.5), 0xcff4ff, 0.5, 6.5, 0.5, 0.25);
      K.burst(feet.clone().setY(feet.y + 0.6), { count: 44, color: [0x9fe8ff, 0xffffff, 0x5ab8ff], speed: 6, up: 1.5, life: 0.9, size: 0.07, gravity: 2, drag: 2 }, null, 1);
      if (local) { K.snd('spell_frost', null, 0.9); g.engine.flash?.(0x9fe8ff, 0.3); g.engine.shake(0.15); } else K.snd('spell_frost', p, 0.9);
    },
    host(d, from, eye, dir, pw) {
      const ids = [];
      for (const { c } of K.creaturesIn(eye.clone().setY(eye.y - 1.2), 7, { los: false })) {
        if (c.def?.hazard) continue;
        K.slow(c, 5, 0.35); K.hurt(c, 8 * pw, from, { stun: 0.5 }); ids.push(c.id);
      }
      if (ids.length) g.net.broadcast('fx', { k: 'spell', s: 'cbx', t: 'frost', ids: ids.slice(0, 24) });
    },
  });

  // ================================================================== METEOR
  const spawnMeteorVis = (at, delay) => {
    const mark = K.mesh(new THREE.RingGeometry(0.9, 1, 32), 0xff5a1a, 0.8);
    mark.rotation.x = -Math.PI / 2; mark.position.copy(at).setY(at.y + 0.06);
    const core = K.mesh(new THREE.SphereGeometry(1, 10, 8), 0xffe08a, 1, { blending: THREE.NormalBlending });
    const glow = K.mesh(new THREE.SphereGeometry(1, 10, 8), 0xff5a1a, 0.4);
    K.anim(delay, (u) => {
      mark.scale.setScalar(6.5 * (0.6 + 0.4 * Math.sin(u * 22) * 0.3 + 0.4 * u)); mark.material.opacity = 0.35 + 0.45 * u;
      const h = 34 * (1 - u * u);
      core.position.copy(at).setY(at.y + h); glow.position.copy(core.position);
      core.scale.setScalar(0.5 + u * 0.5); glow.scale.setScalar(1.3 + u);
      if (Math.random() < 0.6) K.burst(core.position, { count: 2, color: [0xff7a2a, 0xffe08a, 0x552010], speed: 1, up: 0.5, life: 0.5, size: 0.14, gravity: -1, drag: 2 }, null, 1);
    }, () => { K.kill(mark); K.kill(core); K.kill(glow); });
  };
  ext.set('meteor', {
    prep(fx, { eye, dir }) {
      const wall = g.physics.raycast(eye, dir, 45, G.STATIC | G.DOOR);
      const cr = g.creatures.raycast(eye, dir, wall ? wall.distance : 45);
      let at = null;
      if (cr) at = eye.clone().addScaledVector(dir, cr.t); else if (wall) at = new THREE.Vector3(wall.point.x, wall.point.y, wall.point.z);
      if (!at) return 'No target.';
      at.y = floorAt(at.x, at.y, at.z, 0.5, 8);
      fx.at = arr3(at);
      return null;
    },
    fx(d, local) {
      const at = fin3(d.at), p = fin3(d.p);
      if (!at) return;
      spawnMeteorVis(at, 1.7);
      K.snd('spell_meteor', at, 1, 1, { ref: 8, max: 120 });
      if (local) { g.engine.flash?.(0xff7a2a, 0.25); g.engine.punch?.(0.04, 0, 0); }
      void p;
    },
    host(d, from, eye, dir, pw) {
      const at = fin3(d.at);
      if (!at || at.distanceTo(eye) > 55) return false;
      g.creatures.noise(at, 2.5);
      K.after(1.7, () => {
        K.explode(at, { R: 6.5, dmg: 90 * pw, from, knock: 16, stun: 1.2, minFall: 0.4, noise: 4, slam: 25 });
        g.net.broadcast('fx', { k: 'spell', s: 'cbx', t: 'meteorhit', p: arr3(at) });
      });
      return undefined;
    },
  });

  // ================================================================== DECOY
  const mkDecoyMesh = (color) => {
    const grp = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const part = (w, h, d, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, 0); grp.add(m); };
    part(0.5, 0.75, 0.26, 0, 1.15); part(0.32, 0.32, 0.32, 0, 1.75); part(0.16, 0.7, 0.18, -0.36, 1.15); part(0.16, 0.7, 0.18, 0.36, 1.15); part(0.2, 0.8, 0.2, -0.13, 0.4); part(0.2, 0.8, 0.2, 0.13, 0.4);
    grp.userData.mat = mat;
    grp.userData.dispose = () => { mat.dispose(); grp.traverse((m) => m.geometry?.dispose?.()); };
    g.scene.add(grp);
    return grp;
  };
  const removeDecoyVis = (did, pop) => {
    const v = decoyVis.get(did);
    if (!v) return;
    if (pop) K.burst(v.mesh.position.clone().setY(v.mesh.position.y + 1), FLASH(0x7dffe0), null, 1.5);
    v.mesh.removeFromParent(); v.mesh.userData.dispose();
    decoyVis.delete(did);
  };
  const hostRemoveDecoy = (key, pop) => {
    const d = hostDecoys.get(key);
    if (!d) return;
    hostDecoys.delete(key); aiCache = null;
    g.net.broadcast('fx', { k: 'spell', s: 'cbx', t: 'decoyoff', did: d.did, pop: pop ? 1 : 0 });
    for (const c of g.creatures.host.values()) if (c.target === key) { c.target = null; if (c.state === 'run') c.setState('idle'); }
  };
  ext.set('decoy', {
    prep(fx) {
      const p = g.player, f = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      let dist = 2.6;
      const w = g.physics.raycast({ x: p.pos.x, y: p.pos.y + 1, z: p.pos.z }, f, dist + 0.5, G.STATIC | G.DOOR);
      if (w) dist = Math.max(0.8, w.distance - 0.5);
      const x = p.pos.x + f.x * dist, z = p.pos.z + f.z * dist;
      fx.at = arr3(new THREE.Vector3(x, floorAt(x, p.pos.y, z, 1.2, 4), z));
      fx.did = Math.random().toString(36).slice(2, 8);
      fx.yaw = +p.yaw.toFixed(2);
      return null;
    },
    fx(d, local) {
      const at = fin3(d.at);
      if (!at || typeof d.did !== 'string') return;
      removeDecoyVis(d.did, false);
      const mesh = mkDecoyMesh(S('decoy').color);
      mesh.position.copy(at); mesh.rotation.y = Number(d.yaw) || 0;
      decoyVis.set(d.did, { mesh, until: g.time + 10, t: 0 });
      K.burst(at.clone().setY(at.y + 1), FLASH(0x7dffe0), null, 1.4);
      if (local) { K.snd('spell_decoy', null, 0.8); g.engine.flash?.(0x7dffe0, 0.2); } else K.snd('spell_decoy', at, 0.8);
    },
    host(d, from) {
      const at = fin3(d.at);
      if (!at || typeof d.did !== 'string') return false;
      const bp = K.posOf(from);
      if (bp && bp.distanceTo(at) > 8) return false;
      for (const [k, v] of hostDecoys) if (v.owner === from) hostRemoveDecoy(k, false);   // one decoy per caster
      hostDecoys.set('decoy:' + d.did.slice(0, 8), { pos: at.clone(), until: g.time + 10, hp: 80, did: d.did, owner: from });
      aiCache = null;
      g.creatures.noise(at, 2);
      return undefined;
    },
  });
  // the decoy is a fake PLAYER for the creature AI (host): aiPlayers() appends it, hurting it hurts the decoy
  K.wrap(g, 'aiPlayers', (orig) => function () {
    const base = orig();
    if (!g.isHost || !hostDecoys.size) return base;
    if (aiCache && aiCache.t === g.time && aiCache.base === base) return aiCache.out;
    const out = base.slice();
    for (const [id, d] of hostDecoys) {
      out.push({ id, pos: d.pos.clone(), eye: d.pos.clone().setY(d.pos.y + 1.6), look: new THREE.Vector3(0, 0, -1), dead: false, crouch: false, zone: d.pos.y < FACILITY_Y + 40 ? 'in' : 'out',
        inShip: false, noise: 1.4, voice: 0.6, flash: true, latched: false, heldNest: null, decoy: true });
    }
    aiCache = { t: g.time, base, out };
    return out;
  });
  const isDecoy = (id) => typeof id === 'string' && id.startsWith('decoy:');
  K.wrap(g, 'hostHurtPlayer', (orig) => function (id, dmg, cause, fromId, fromPos) {
    if (isDecoy(id)) {
      const d = hostDecoys.get(id);
      if (d) { d.hp -= Math.min(dmg, 999); if (d.hp <= 0) hostRemoveDecoy(id, true); }
      return undefined;
    }
    return orig(id, dmg, cause, fromId, fromPos);
  });
  for (const name of ['hostStunPlayer', 'hostSlowPlayer', 'hostHoldPlayer']) K.wrap(g, name, (orig) => function (id, ...a) { return isDecoy(id) ? undefined : orig(id, ...a); });
  K.wrap(g, 'hostLatch', (orig) => function (c, id, on) { return isDecoy(id) ? undefined : orig(c, id, on); });

  // ================================================================== TOTEM
  const setTotem = (id, at) => {
    clearTotem(id);
    const mesh = createTotemMesh(S('totem').color);
    mesh.position.copy(at);
    g.scene.add(mesh);
    totems.set(id, { mesh, t: 0 });
  };
  const clearTotem = (id) => { const o = totems.get(id); if (!o) return; o.mesh.removeFromParent(); o.mesh.userData.dispose(); totems.delete(id); };
  ext.set('totem', {
    cost: () => (myTotem ? 0 : S('totem').mana),
    prep(fx) {
      const p = g.player;
      if (myTotem) {
        const to = myTotem.pos.clone();
        fx.recast = 1; fx.q = arr3(to); fx.at = arr3(p.pos);
        p.teleport(to); g.psTimer = 0;
        myTotem = null;
        return null;
      }
      fx.at = arr3(p.pos);
      myTotem = { pos: p.pos.clone() };
      return null;
    },
    fx(d, local) {
      const at = fin3(d.at), q = fin3(d.q), col = S('totem').color;
      if (!at) return;
      if (d.recast) {
        K.burst(at.clone().setY(at.y + 1), FLASH(col), null, 1.4); if (q) K.burst(q.clone().setY(q.y + 1), FLASH(col), null, 1.4);
        if (q) K.ring(q.clone().setY(q.y + 0.08), col, 0.3, 2.4, 0.5);
        clearTotem(d.c);
        if (local) { K.snd('spell_totem', null, 0.9); g.engine.flash?.(col, 0.3); g.ui?.toast?.('Back at the totem.', 'good'); } else if (q) K.snd('spell_totem', q, 0.8);
      } else {
        setTotem(d.c, at);
        K.ring(at.clone().setY(at.y + 0.08), col, 0.2, 2.2, 0.6);
        if (local) { K.snd('spell_totem', null, 0.8); g.ui?.toast?.('Totem planted.', 'good'); } else K.snd('spell_totem', at, 0.8);
      }
    },
  });

  // ================================================================== follow-ups from the host (every peer)
  ext.set('cbx', {
    fx(d) {
      if (d.t === 'zap') {
        const pts = (d.pts || []).map(fin3).filter(Boolean);
        if (pts.length < 2) return;
        K.bolt(pts, S('zap').color, 0.32);
        for (const p of pts.slice(1)) { K.burst(p, FLASH(0xb8e8ff), null, 1); K.snd('spell_zap', p, 0.5, 1.3); }
        K.shake(pts[1], 0.15, 12);
      } else if (d.t === 'frost') {
        for (const id of d.ids || []) {
          const v = g.creatures.views.get(id);
          if (v) K.burst(v.pos.clone().setY(v.pos.y + (v.height || 1) * 0.5), { count: 16, color: [0x9fe8ff, 0xffffff], speed: 1.6, up: 1, life: 0.9, size: 0.07, gravity: 1, drag: 2 }, null, 1);
        }
      } else if (d.t === 'meteorhit') {
        const p = fin3(d.p);
        if (!p) return;
        K.ring(p.clone().setY(p.y + 0.1), 0xff7a2a, 0.5, 8, 0.6); K.ring(p.clone().setY(p.y + 0.1), 0xffe08a, 0.3, 5, 0.4);
        K.sphere(p.clone().setY(p.y + 1), 0xff7a2a, 1, 6.5, 0.5, 0.5);
        K.burst(p.clone().setY(p.y + 0.5), { count: 60, color: [0xff6a20, 0xffb040, 0x402010], speed: 9, up: 5, life: 1.2, size: 0.13, gravity: 8, drag: 1.2 }, null, 1.5);
        K.shake(p, 1.2, 30);
        const dist = p.distanceTo(g.camera.position);
        if (dist < 30) g.engine.flash?.(0xffb060, clamp(0.6 - dist / 50, 0, 0.6));
      } else if (d.t === 'decoyoff') removeDecoyVis(String(d.did), !!d.pop);
    },
  });

  // ================================================================== per frame (visuals + host decoy upkeep) and clean-up
  K.update((dt) => {
    for (const [did, v] of decoyVis) {
      v.t += dt;
      if (g.time > v.until) { removeDecoyVis(did, true); continue; }
      v.mesh.position.y += Math.sin(v.t * 3) * 0.0015;
      v.mesh.userData.mat.opacity = 0.35 + 0.2 * Math.abs(Math.sin(v.t * 9)) * (g.time > v.until - 1.5 ? 0.5 : 1);
    }
    for (const o of totems.values()) { o.t += dt; o.mesh.userData.cap.rotation.y += dt * 2; o.mesh.userData.cap.position.y = 1.25 + Math.sin(o.t * 2) * 0.06; o.mesh.userData.ring.rotation.y -= dt * 1.2; }
    if (g.isHost && hostDecoys.size) for (const [k, d] of hostDecoys) if (g.time > d.until) hostRemoveDecoy(k, true);
  });
  K.on('phase', () => { myTotem = null; for (const id of [...totems.keys()]) clearTotem(id); for (const id of [...decoyVis.keys()]) removeDecoyVis(id, false); hostDecoys.clear(); aiCache = null; });
  K.on('localDeath', () => { myTotem = null; });

  return {
    hostDecoys, totem: () => myTotem,
    dispose() {
      for (const id of ['zap', 'frost', 'meteor', 'decoy', 'totem', 'cbx']) ext.delete(id);
      for (const id of [...totems.keys()]) clearTotem(id);
      for (const id of [...decoyVis.keys()]) removeDecoyVis(id, false);
      hostDecoys.clear();
    },
  };
}
