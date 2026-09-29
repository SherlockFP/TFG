// POLISH4 (wave 4; docs/wave4/polish4.md): small gaps + fixes.
//   1. Pet egg drops (chests / creatures, seeded, day cap + pity) -> the existing incubator / hatch flow (pets.js).
//   2. Shipyard: ship decals + floor furniture with a placement mode (terminal DECAL / FURNITURE), Workshop craft luck.
//   3. Cantina barter: rotating stock per neutral alien (E), host-validated.
//   4. Dune Maw cannot be damaged while buried; raid / hit squads flank and route around obstacles (outdoors).
// Net: request  p4act {op}  (ship decor) / p4bt {npc,i,item} (barter)  ->  host message  p4msg {k,...}.  Deco state rides in profile.shipyard.deco -> run.sy.
import * as THREE from 'three';
import { t, tf, addTranslations, sysMsg } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { G } from '../physics/physics.js';
import { ITEMS } from './items.js';
import { CREATURES } from './creatures.js';
import { insideShip } from '../world/ship.js';
import { createBarterPanel } from '../ui/panels/polish4_barter.js';
import * as P from './polish4_core.js';
import { TR_P4, RU_P4 } from './polish4_i18n.js';
import { SPOTS as SHIP_SPOTS } from '../world/shiplayout.js';

HOST_ONLY.add('p4msg');
addTranslations(TR_P4, 'tr');   // (checked against the live tables: fills gaps only, nothing existing is overridden)
addTranslations(RU_P4, 'ru');

const SQUAD = new Set(['hs_enforcer', 'hs_gunner', 'hs_leader']);
const HAS_DOM = typeof document !== 'undefined';

export function installPolish4(game) {
  const mods = game.mods;
  const offs = [];
  const undo = [];
  let disposed = false;
  const host = () => !!game.isHost;
  const run = () => game.run;
  const posOf = (id) => (id === game.selfId ? game.player?.pos : game.remotes?.get(id)?.pos) || null;
  const toast = (m, k = 'info') => game.ui?.toast?.(m, k);
  const S = {
    pity: 0, seed: null, eggDay: new Map(), stats: { eggs: 0, barters: 0, decor: 0, mawGuards: 0, detours: 0, flanks: 0 },
    sold: new Map(),          // barter offerKey -> purchases made (host truth, mirrored to clients by p4msg 'sold')
    lastReq: new Map(),
  };

  // ============================================================================================ 1. pet egg drops (host)
  function dropEgg(item, pos, why) {
    if (!item || !ITEMS[item] || !game.items?.hostSpawn) return false;
    const day = run()?.day | 0, n = S.eggDay.get(day) || 0;
    if (n >= P.EGG_DAY_CAP) return false;
    S.eggDay.set(day, n + 1); S.pity = 0; S.stats.eggs++;
    game.items.hostSpawn(item, new THREE.Vector3(pos.x, pos.y + 0.6, pos.z), { linvel: [(Math.random() - 0.5) * 1.2, 3, (Math.random() - 0.5) * 1.2] });
    game.net.broadcast('sys', sysMsg('A pet egg dropped! Hatch it in the ship incubator.', {}, 'good'));
    void why;
    return true;
  }
  function eggCtx() {
    const r = run();
    if (!r) return null;
    if (S.seed !== r.seed) { S.seed = r.seed; S.pity = 0; S.eggDay.clear(); S.sold.clear(); }
    return { seed: r.seed | 0, day: r.day | 0 };
  }
  offs.push(mods.on('tfg:chestOpened', (d) => {
    if (!host() || disposed || !d?.pos) return;
    const c = eggCtx(); if (!c) return;
    const item = P.rollChestEgg({ ...c, id: d.id, tier: d.tier, pity: S.pity });
    if (item) dropEgg(item, { x: d.pos[0], y: d.pos[1] + 0.7, z: d.pos[2] }, 'chest');
  }));
  const origKilled = game.hostOnCreatureKilled;
  function killWrap(c, by) {
    const r = origKilled?.call(this, c, by);
    try {
      if (!disposed && host() && c && !c.p4Egg && c.pos) {
        c.p4Egg = true;
        const ctx = eggCtx(), def = c.def || CREATURES[c.type];
        if (ctx && def) {
          const item = P.rollCreatureEgg({ ...ctx, c: { type: c.type, id: c.id, boss: !!def.boss, elite: !!c.elite, tier: c.tier, hazard: !!def.hazard || def.hp == null }, pity: S.pity });
          if (item) dropEgg(item, c.pos, 'kill');
        }
      }
    } catch (e) { console.warn('[polish4] egg drop', e); }
    return r;
  }
  if (typeof origKilled === 'function') { game.hostOnCreatureKilled = killWrap; undo.push(() => { if (game.hostOnCreatureKilled === killWrap) { if (Object.prototype.hasOwnProperty.call(game, 'hostOnCreatureKilled')) delete game.hostOnCreatureKilled; } }); }
  offs.push(mods.on('phase', (ph, g) => { if (g !== game || !host() || ph !== 'moon') return; if (eggCtx()) S.pity = Math.min(6, S.pity + 1); }));

  // ============================================================================================ 2a. Workshop craft luck
  const rpg = game.rpg;
  if (rpg && typeof rpg.bonus === 'function') {
    const origBonus = rpg.bonus;
    const wrapped = function (key, ...a) {
      const v = origBonus.call(this, key, ...a);
      if (key === 'craftLuck' && !disposed) { try { return (Number(v) || 0) + (Number(game.shipyard?.effects?.().craftLuck) || 0); } catch { /* soft */ } }
      return v;
    };
    rpg.bonus = wrapped;
    undo.push(() => { if (rpg.bonus === wrapped) rpg.bonus = origBonus; });
  }

  // ============================================================================================ 4a. Dune Maw: no damage while buried (host)
  let mgrWrapped = null;
  function wrapManager() {
    const M = game.creatures;
    if (!M || mgrWrapped === M) return;
    mgrWrapped = M;
    const origDamage = M.damage;
    M.damage = function (id, amount, by, opts) {
      if (!disposed && amount > 0) {
        const c = this.host?.get(id);
        if (c && c.type === 'dunemaw' && (c.state === 'hidden' || c.state === 'rumble')) { S.stats.mawGuards++; return; }
      }
      return origDamage.call(this, id, amount, by, opts);
    };
    // ---------------------------------------------------------------------------------- 4b. squads route around obstacles outdoors
    const origGoTo = M.goTo;
    M.goTo = function (c, x, z) {
      origGoTo.call(this, c, x, z);
      try {
        if (disposed || !c || c.zone !== 'out' || !SQUAD.has(c.type) || !c.path || c.path.length !== 1) return;
        const ter = game.world?.terrain;
        const clear = (a, b) => {
          const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
          if (L < 1.5) return true;
          const y = Math.max(ter?.heightAt?.(a.x, a.z) ?? c.pos.y, ter?.heightAt?.(b.x, b.z) ?? c.pos.y) + 1.4;
          return !game.physics.raycast({ x: a.x, y, z: a.z }, { x: dx / L, y: 0, z: dz / L }, L, G.STATIC | G.DOOR);
        };
        const wp = P.detourPath({ x: c.pos.x, z: c.pos.z }, { x, z }, clear);
        if (wp && wp.length) { c.path = [...wp, c.path[0]]; c.pathIdx = 0; S.stats.detours++; }
      } catch { /* keep the straight line */ }
    };
    undo.push(() => { if (M.damage && Object.prototype.hasOwnProperty.call(M, 'damage')) delete M.damage; if (Object.prototype.hasOwnProperty.call(M, 'goTo')) delete M.goTo; });
  }
  // squad flank: the soldier behaviour aims at contact + offset*0.5; swing gunners wide to alternating sides while the crew is far
  const behaviours = [];
  for (const type of SQUAD) {
    const def = CREATURES[type];
    if (!def || typeof def.behavior !== 'function') continue;
    const orig = def.behavior;
    def.behavior = function (c, dt, M) { try { if (!disposed) flankPre(c, M); } catch { /* cosmetic tactic */ } return orig.call(this, c, dt, M); };
    behaviours.push([def, orig, def.behavior]);
  }
  undo.push(() => { for (const [def, orig, mine] of behaviours) if (def.behavior === mine) def.behavior = orig; });
  function flankPre(c, M) {
    const d = c.data, sq = d?.squad;
    if (!sq || !d.init) return;
    const ct = sq.contact;
    if (!d.p4Base) d.p4Base = { x: d.offset?.x || 0, z: d.offset?.z || 0 };
    if (!ct || ct.zone !== c.zone || d.seen || c.zone !== 'out' || sq.members.size < 2) {
      if (d.p4Flank) { d.offset = { ...d.p4Base }; d.p4Flank = false; }
      return;
    }
    const now = game.time || 0;
    if (!sq.p4c || now - sq.p4c.t > 0.5) {
      let x = 0, z = 0, n = 0;
      for (const id of sq.members) { const o = M.host.get(id); if (o && !o.dead) { x += o.pos.x; z += o.pos.z; n++; } }
      sq.p4c = { t: now, x: n ? x / n : c.pos.x, z: n ? z / n : c.pos.z, ids: [...sq.members].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })) };
    }
    const idx = Math.max(0, sq.p4c.ids.indexOf(c.id));
    const dist = Math.hypot(c.pos.x - ct.pos.x, c.pos.z - ct.pos.z);
    const f = P.flankOffset({ centre: sq.p4c, contact: ct.pos, idx, role: c.type, dist });
    d.offset = { x: d.p4Base.x + f.x * 2, z: d.p4Base.z + f.z * 2 };   // (the soldier AI halves the offset)
    if (!d.p4Flank) S.stats.flanks++;
    d.p4Flank = true;
  }

  // ============================================================================================ 3. cantina barter
  const has = (id) => !!ITEMS[id];
  const priceOf = (id) => ITEMS[id]?.price ?? ITEMS[id]?.value?.[0] ?? 40;
  const offersFor = (npc) => P.barterOffers({ seed: run()?.seed | 0, day: run()?.day | 0, npc, role: 'patron', has, priceOf })
    .map((o) => ({ ...o, left: Math.max(0, o.qty - (S.sold.get(P.offerKey(run()?.day, npc, o.i)) || 0)) }));
  const nearNpc = () => {
    const me = game.player?.pos, M = game.creatures;
    if (!me || !M?.views) return null;
    let best = null, bd = 3.4;
    for (const v of M.views.values()) {
      if (v.type !== 'alien_npc' || v.state === 'dead') continue;
      const d = Math.hypot(v.pos.x - me.x, v.pos.z - me.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  };
  let panel = null, panelNpc = null;
  const scrapFor = (min) => {
    let best = null;
    for (const it of game.items.all()) {
      if (it.holder !== game.selfId || it.def?.kind !== 'scrap' || it.soulbound || it.def?.cursed) continue;
      const v = Number(it.value) || 0;
      if (v >= min && (!best || v < best.value)) best = it;
    }
    return best;
  };
  function openBarter(npc) {
    if (!HAS_DOM || !game.ui?.openPanel || game.ui.panelOpen) return;
    panelNpc = npc;
    panel = createBarterPanel({
      offers: () => offersFor(panelNpc),
      credits: () => Math.floor(run()?.credits || 0),
      scrap: scrapFor,
      buy: (o, itemId) => game.net.request('p4bt', { npc: panelNpc, i: o.i, item: itemId || null }),
      close: () => game.ui.closePanel(),
    });
    game.ui.openPanel(panel.el);
    game.ui.onPanelClose = () => { panel?.dispose(); panel = null; return false; };
  }
  offs.push(mods.on('interactables', (out, g) => {
    if (g !== game || disposed || game.player?.dead || game.minigame) return;
    const v = nearNpc();
    if (!v) return;
    out.push({ pos: v.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), r: 1.1, reach: 3.4, label: t('Barter [E]'), sub: t('Cantina Alien'), action: () => openBarter(v.id) });
  }));
  function hostBarter(d, from) {
    if (!host() || disposed || !d) return;
    const err = (why) => reply(from, { k: 'err', why });
    const tt = game.time || 0;
    if (tt - (S.lastReq.get(from) || -9) < 0.3) return;
    S.lastReq.set(from, tt);
    const r = run(), c = game.creatures?.host?.get(String(d.npc)) || game.creatures?.host?.get(Number(d.npc));
    const p = posOf(from);
    if (!r || r.phase !== 'moon' || !c || c.dead || c.type !== 'alien_npc' || !p) return err('The alien is not interested.');
    if (Math.hypot(c.pos.x - p.x, c.pos.z - p.z) > 4.6) return err('Get closer.');
    if ((c.data?.mad || 0) > 0) return err('The alien is not in the mood.');
    const offer = offersFor(c.id).find((o) => o.i === (d.i | 0));
    if (!offer || offer.left <= 0) return err('Sold out.');
    if (offer.kind === 'buy') {
      if ((r.credits || 0) < offer.price) return err('Not enough credits.');
      r.credits -= offer.price;
      try { game.broadcastRun?.(['credits']); } catch { /* not networked */ }
    } else {
      const it = game.items.get(String(d.item || ''));
      if (!it || it.holder !== from || it.def?.kind !== 'scrap' || it.soulbound || it._p4Used || (Number(it.value) || 0) < offer.min) return err('Hand over a scrap item that is worth enough.');
      it._p4Used = true;
      game.net.broadcast('it', { e: 'rm', id: it.id });
    }
    const key = P.offerKey(r.day, c.id, offer.i);
    S.sold.set(key, (S.sold.get(key) || 0) + 1);
    S.stats.barters++;
    const at = new THREE.Vector3(p.x, p.y + 1.1, p.z);
    game.items.hostSpawn(offer.item, at, { linvel: [0, 1.5, 0] });
    game.net.broadcast('p4msg', { k: 'sold', key, n: S.sold.get(key) });
    reply(from, { k: 'ok', item: offer.item });
  }
  const reply = (to, o) => { if (to === game.selfId) onMsg(o); else game.net.sendTo(to, 'p4msg', o); };

  // ============================================================================================ 2b. ship decals + furniture
  const groupOf = () => game.ship?.group || null;
  const deco = { cur: P.blankDeco(), sig: '', group: null, decalMat: null, furn: [], disp: [] };
  const curDeco = () => P.sanitizeDeco(run()?.sy?.deco);
  const paintOf = () => run()?.sy?.paint || { c1: 'orange', c2: 'slate' };
  const paintHex = (id) => { try { return game.shipyard?.core?.paintHex?.(id) ?? 0xc8581c; } catch { return 0xc8581c; } };
  const css = (hex) => '#' + Number(hex).toString(16).padStart(6, '0');

  function decalTexture(id, col) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const paper = '#ece4d0', ink = '#12151a';
    g.lineJoin = 'round'; g.lineCap = 'round';
    const poly = (pts, fill, stroke) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 6; g.stroke(); } };
    if (id === 'skull') {
      g.fillStyle = paper; g.strokeStyle = ink; g.lineWidth = 6;
      g.beginPath(); g.arc(64, 54, 38, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillRect(42, 78, 44, 28); g.strokeRect(42, 78, 44, 28);
      g.fillStyle = ink; g.beginPath(); g.arc(48, 56, 10, 0, 7); g.arc(80, 56, 10, 0, 7); g.fill();
      poly([[64, 66], [58, 80], [70, 80]], ink);
      for (const x of [52, 64, 76]) g.fillRect(x - 1, 88, 3, 16);
    } else if (id === 'bolt') {
      poly([[78, 6], [30, 74], [58, 74], [46, 122], [100, 50], [70, 50]], col, ink);
    } else if (id === 'star') {
      const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 26 : 58; pts.push([64 + Math.cos(a) * r, 66 + Math.sin(a) * r]); }
      poly(pts, col, ink);
    } else if (id === 'eye') {
      g.fillStyle = paper; g.strokeStyle = ink; g.lineWidth = 6;
      g.beginPath(); g.moveTo(6, 64); g.quadraticCurveTo(64, 0, 122, 64); g.quadraticCurveTo(64, 128, 6, 64); g.fill(); g.stroke();
      g.fillStyle = col; g.beginPath(); g.arc(64, 64, 26, 0, 7); g.fill(); g.stroke();
      g.fillStyle = ink; g.beginPath(); g.arc(64, 64, 11, 0, 7); g.fill();
    } else if (id === 'fish') {
      g.fillStyle = col; g.strokeStyle = ink; g.lineWidth = 6;
      g.beginPath(); g.ellipse(58, 64, 46, 30, 0, 0, 7); g.fill(); g.stroke();
      poly([[98, 64], [124, 38], [124, 90]], col, ink);
      g.fillStyle = paper; g.beginPath(); g.arc(36, 56, 8, 0, 7); g.fill(); g.fillStyle = ink; g.beginPath(); g.arc(34, 56, 4, 0, 7); g.fill();
    } else if (id === 'tfg') {
      g.fillStyle = ink; g.fillRect(6, 34, 116, 60); g.strokeStyle = col; g.lineWidth = 5; g.strokeRect(9, 37, 110, 54);
      g.fillStyle = paper; g.font = 'bold 40px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TFG', 64, 66);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    return tex;
  }

  function clearDeco() {
    for (const f of deco.furn) { for (const col of f.cols) { try { game.physics?.removeCollider(col); } catch { /* */ } } }
    deco.furn = [];
    if (deco.group) { deco.group.removeFromParent(); deco.group = null; }
    for (const d of deco.disp.splice(0)) { try { d.dispose?.(); } catch { /* */ } }
  }
  const lm = (hex, emissive) => new THREE.MeshLambertMaterial({ color: hex, emissive: emissive || 0x000000 });
  function furnModel(id) {
    const g = new THREE.Group(), F = P.FURN[id], [w, h, d] = F.size, disp = [];
    const box = (bw, bh, bd, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat); m.position.set(x, y, z); g.add(m); disp.push(m.geometry, mat); return m; };
    if (id === 'rug') { box(w, h, d, lm(F.color), 0, h / 2, 0); box(w - 0.3, h + 0.004, d - 0.3, lm(0xd8b04a), 0, h / 2, 0); box(w - 0.7, h + 0.008, d - 0.7, lm(F.color), 0, h / 2, 0); }
    else if (id === 'plant') { box(0.34, 0.34, 0.34, lm(0x8a5a3a), 0, 0.17, 0); for (let i = 0; i < 5; i++) { const a = i * 1.26; box(0.14, 0.62, 0.14, lm(F.color), Math.cos(a) * 0.1, 0.62, Math.sin(a) * 0.1).rotation.set(Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4); } }
    else if (id === 'beanbag') { box(w, h * 0.7, d, lm(F.color), 0, h * 0.35, 0); box(w * 0.7, h * 0.55, d * 0.7, lm(0xe8802c), 0, h * 0.72, 0); }
    else if (id === 'shelf') { box(w, h, d, lm(F.color), 0, h / 2, 0); for (const y of [0.4, 0.8, 1.2]) box(w - 0.06, 0.04, d + 0.04, lm(0x3a2f22), 0, y, 0.0); box(0.3, 0.22, 0.3, lm(0x8a7a5a), -0.25, 0.53, 0.02); box(0.22, 0.3, 0.26, lm(0xb04a3a), 0.2, 0.95, 0.02); }
    else if (id === 'lamp') { box(0.3, 0.05, 0.3, lm(0x2a2c30), 0, 0.025, 0); box(0.05, 1.4, 0.05, lm(0x2a2c30), 0, 0.75, 0); const sh = box(0.34, 0.3, 0.34, new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), 0, 1.55, 0); void sh; }
    else { box(w, 0.12, d, lm(F.color), 0, 0.06, 0); box(w * 0.7, h - 0.2, d * 0.7, lm(0xd8d8e0), 0, 0.12 + (h - 0.2) / 2, 0); box(w * 0.9, 0.06, d * 0.9, lm(0xd8b020), 0, h - 0.02, 0); }
    return { group: g, disp };
  }
  function buildDeco(cur) {
    const grp = groupOf();
    if (!grp || !HAS_DOM) return;
    clearDeco();
    deco.group = new THREE.Group(); deco.group.name = 'polish4_deco';
    // decal on both hull sides
    if (cur.decal !== 'none') {
      const col = css(paintHex(paintOf().c1));
      // [wave5] spot from world/shiplayout.js: on the +z side it used to sit on top of the KC-07 hull number (x -5.4 .. -2.2)
      const E = SHIP_SPOTS.emblem;
      const tex = decalTexture(cur.decal, col), mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.08 }), geo = new THREE.PlaneGeometry(E.s, E.s);
      deco.disp.push(tex, mat, geo);
      for (const sg of [1, -1]) { const m = new THREE.Mesh(geo, mat); m.position.set(sg > 0 ? E.x : E.xNeg, E.y, sg * E.zOut); m.rotation.y = sg > 0 ? 0 : Math.PI; m.userData.p4 = 1; deco.group.add(m); }
    }
    for (const f of cur.furn) {
      const model = furnModel(f.id);
      model.group.position.set(f.x, 0, f.z); model.group.rotation.y = -f.r * Math.PI / 2;
      model.group.traverse((o) => { o.userData.p4 = 1; });
      deco.group.add(model.group); deco.disp.push(...model.disp);
      const cols = [], def = P.FURN[f.id];
      if (!def.flat) { const [hx, hz] = P.halfExtents(f.id, f.r); try { cols.push(game.physics.addStaticBox(f.x, def.size[1] / 2, f.z, hx, def.size[1] / 2, hz, 0, G.STATIC, { kind: 'static' })); } catch { /* physics optional */ } }
      deco.furn.push({ ...f, cols });
    }
    grp.add(deco.group);
  }
  function syncDeco(force) {
    if (!HAS_DOM || disposed) return;
    const cur = curDeco();
    const sig = JSON.stringify(cur) + '|' + paintOf().c1;
    if (!force && sig === deco.sig) return;
    if (!groupOf()) return;
    deco.sig = sig; deco.cur = cur;
    try { buildDeco(cur); } catch (e) { console.warn('[polish4] deco', e); }
  }

  // ---- obstacles (props of the cabin), same idea as the ship-fault panel placer
  function obstacles() {
    const out = [], b = new THREE.Box3(), grp = groupOf();
    if (!grp) return out;
    grp.updateMatrixWorld(true);
    grp.traverse((o) => {
      if (!o.isMesh || o.userData?.p4 || o.visible === false || o.userData?.g2) return;
      b.setFromObject(o);
      if (b.isEmpty()) return;
      const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
      if (Math.max(sx, sy, sz) > 5.5) return;
      if (b.min.x < -6.9 || b.max.x > 6.9 || b.min.z < -3.4 || b.max.z > 3.4 || b.max.y < 0.15 || b.min.y > 1.9) return;
      out.push({ x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z });
    });
    return out;
  }
  const blockedBy = (obs) => (bx) => obs.some((o) => bx.x - bx.hx < o.x1 - 0.02 && bx.x + bx.hx > o.x0 + 0.02 && bx.z - bx.hz < o.z1 - 0.02 && bx.z + bx.hz > o.z0 + 0.02);

  // ---- host: p4act
  const aboard = (id) => { const p = posOf(id); return !!p && insideShip(p); };
  function hostAct(d, from) {
    if (!host() || disposed || !d || typeof d.op !== 'string') return;
    const tt = game.time || 0;
    if (tt - (S.lastReq.get('a' + from) || -9) < 0.25) return;
    S.lastReq.set('a' + from, tt);
    const err = (why) => reply(from, { k: 'err', why });
    const r = run(), prof = game.profile;
    if (!game.shipyard || !r || !prof?.shipyard) return err('The shipyard is offline.');
    if (!aboard(from)) return err('You need to be aboard the ship.');
    if (!['orbit', 'company', 'moon'].includes(r.phase)) return err('Not while the ship is flying.');
    const s = prof.shipyard;
    s.deco = P.sanitizeDeco(s.deco);
    const wallet = { cr: r.credits || 0 };
    let res, msg;
    if (d.op === 'decal') { res = P.trySetDecal(s.deco, wallet, String(d.id)); msg = { k: 'ok', what: 'decal' }; }
    else if (d.op === 'place') { res = P.tryPlace(s.deco, wallet, { id: String(d.id), x: Number(d.x), z: Number(d.z), r: d.r | 0 }, blockedBy(obstacles())); msg = { k: 'ok', what: 'place' }; }
    else if (d.op === 'remove') { res = P.tryRemove(s.deco, wallet, d.i); msg = { k: 'ok', what: 'remove' }; }
    else return;
    if (!res.ok) return err(res.why || 'Nothing changed.');
    r.credits = wallet.cr;
    r.sy = prof.shipyard;
    S.stats.decor++;
    try { game.broadcastRun(['sy', 'credits']); game.progress?.save?.(); } catch (e) { console.warn('[polish4] commit', e); }
    game.net.broadcast('p4msg', msg);
    syncDeco(true);
  }

  // ---- client: placement mode (ghost + R rotate + LMB place + RMB cancel)
  const pm = { on: false, id: null, r: 0, ghost: null, obs: null, ok: false, x: 0, z: 0, hint: null };
  function setHint(text, bad) {
    if (!HAS_DOM) return;
    if (!text) { pm.hint?.remove(); pm.hint = null; return; }
    if (!pm.hint) { pm.hint = document.createElement('div'); pm.hint.id = 'p4-hint'; document.body.appendChild(pm.hint); }
    pm.hint.textContent = text; pm.hint.classList.toggle('bad', !!bad);
  }
  if (HAS_DOM && !document.getElementById('tfg-p4-style')) {
    const st = document.createElement('style'); st.id = 'tfg-p4-style';
    st.textContent = '#p4-hint{position:fixed;left:50%;bottom:22%;transform:translateX(-50%);padding:4px 16px;background:rgba(6,4,3,.72);border-left:3px solid #e8a040;color:#f2d8b0;font-family:var(--font,"VT323",monospace);font-size:22px;letter-spacing:1px;pointer-events:none;z-index:40}#p4-hint.bad{border-left-color:#ff5a4a;color:#ffb0a0}';
    document.head.appendChild(st); undo.push(() => st.remove());
  }
  function startPlace(id) {
    stopPlace();
    if (!P.FURN[id] || !groupOf()) return false;
    pm.on = true; pm.id = id; pm.r = 0; pm.obs = obstacles();
    const m = furnModel(id);
    m.group.traverse((o) => { if (o.isMesh) { o.userData.p4 = 1; o.material = new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.5, depthWrite: false }); } });
    pm.ghost = m; game.scene.add(m.group);
    return true;
  }
  function stopPlace() {
    if (pm.ghost) { pm.ghost.group.removeFromParent(); pm.ghost = null; }
    pm.on = false; pm.id = null; setHint(null);
  }
  function placeUpdate() {
    if (!pm.on) return;
    const inp = game.input, p = game.player;
    if (!p || p.dead || game.ui?.panelOpen || game.terminal?.active || !p.inShip) { stopPlace(); return; }
    if (inp.mouseClicked(2)) { stopPlace(); return; }
    if (inp.codePressed('KeyR')) pm.r = (pm.r + 1) % 4;
    const eye = game.camera.position, fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(game.camera.quaternion);
    if (fwd.y > -0.03) { pm.ghost.group.visible = false; setHint(t('Aim at the floor'), true); return; }
    const k = -eye.y / fwd.y;
    if (!(k > 0 && k < 9)) { pm.ghost.group.visible = false; setHint(t('Aim at the floor'), true); return; }
    pm.x = Math.round((eye.x + fwd.x * k) * 20) / 20; pm.z = Math.round((eye.z + fwd.z * k) * 20) / 20;
    const f = { id: pm.id, x: pm.x, z: pm.z, r: pm.r };
    const c = P.canPlace(deco.cur, f, blockedBy(pm.obs));
    pm.ok = c.ok && (run()?.credits || 0) >= P.FURN[pm.id].cr;
    const g = pm.ghost.group;
    g.visible = true; g.position.set(pm.x, 0.01, pm.z); g.rotation.y = -pm.r * Math.PI / 2;
    g.traverse((o) => { if (o.isMesh) o.material.color.setHex(pm.ok ? 0x66ff88 : 0xff5a4a); });
    setHint(pm.ok ? `${t(P.FURN[pm.id].name)} ▮${P.FURN[pm.id].cr} · [LMB] · [R] ${t('rotate')} · [RMB] ${t('leave')}` : t(c.ok ? 'Not enough credits.' : c.why), !pm.ok);
    if (inp.mouseClicked(0) && pm.ok) game.net.request('p4act', { op: 'place', id: pm.id, x: pm.x, z: pm.z, r: pm.r });
  }

  // ---- terminal commands
  function cmdDecal(rest, term) {
    const q = rest[0];
    const id = q ? P.findDecal(q) : null;
    if (!id) {
      term.print([`${t('DECALS')}  (${t('current')}: ${t(P.DECALS.find((d) => d.id === deco.cur.decal)?.name || 'No decal')})`, ...P.DECALS.map((d) => `  ${t(d.name)}${d.cr ? `  ▮${d.cr}` : ''}`), t('DECAL <name>: paint an emblem on both hull sides (aboard the ship).')].join('\n'));
      return;
    }
    game.net.request('p4act', { op: 'decal', id });
    term.print(t('Sent to the shipyard.'));
  }
  function cmdFurn(rest, term) {
    const w = String(rest[0] || '').toLowerCase();
    if (w === 'place' || w === 'add' || w === 'buy') {
      const id = P.findFurn(rest.slice(1).join(' '));
      if (!id) { term.print(t('Unknown furniture. Type FURNITURE.'), 'err'); return; }
      if (!game.player?.inShip) { term.print(t('You need to be aboard the ship.'), 'err'); return; }
      if (!startPlace(id)) { term.print(t('Cannot place that here.'), 'err'); return; }
      try { term.close(); } catch { /* */ }
      return;
    }
    if (w === 'remove' || w === 'sell') {
      const i = (parseInt(rest[1], 10) || 0) - 1;
      game.net.request('p4act', { op: 'remove', i });
      term.print(t('Sent to the shipyard.'));
      return;
    }
    const lines = [`${t('FURNITURE')}  ${deco.cur.furn.length}/${P.MAX_FURN}`, ...P.FURN_IDS.map((id) => `  ${t(P.FURN[id].name)}  ▮${P.FURN[id].cr}`)];
    if (deco.cur.furn.length) lines.push('', ...deco.cur.furn.map((f, i) => `  ${i + 1}. ${t(P.FURN[f.id].name)}  (${f.x.toFixed(1)}, ${f.z.toFixed(1)})`));
    lines.push('', t('FURNITURE PLACE <name> (aim, R rotates, LMB places) · FURNITURE REMOVE <n> (half refund)'));
    term.print(lines.join('\n'));
  }
  const reg = mods.api?.registerCommand || (typeof window !== 'undefined' ? window.KefalAPI?.registerCommand : null);
  if (reg) {
    try {
      reg.call(mods.api || window.KefalAPI, 'decal', cmdDecal, t('DECAL: paint an emblem on the ship hull'));
      reg.call(mods.api || window.KefalAPI, 'furniture', cmdFurn, t('FURNITURE: place furniture in the ship'));
    } catch { /* terminal optional */ }
  }

  // ============================================================================================ messages / net / update
  function onMsg(m) {
    if (disposed || !m) return;
    if (m.k === 'err') { toast(t(String(m.why || 'Nothing changed.')), 'bad'); return; }
    if (m.k === 'sold') { S.sold.set(String(m.key), m.n | 0); panel?.refresh(); return; }
    if (m.k === 'ok') {
      game.audio?.play?.('ui_buy', { volume: 0.6, bus: 'ui' });
      if (m.item) { toast(`${t(ITEMS[m.item]?.name || m.item)} ✓`, 'good'); panel?.refresh(); }
      return;
    }
  }
  offs.push(mods.on('netReady', (net, g) => { if (g === game) net.on_('p4msg', (m) => onMsg(m)); }));
  offs.push(mods.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    H('p4act', (d, from) => { try { hostAct(d, from); } catch (e) { console.warn('[polish4] act', e); } });
    H('p4bt', (d, from) => { try { hostBarter(d, from); } catch (e) { console.warn('[polish4] barter', e); } });
  }));
  let syncT = 0;
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    try {
      wrapManager();
      syncT -= dt;
      if (syncT <= 0) { syncT = 0.5; syncDeco(false); if (panel) panel.refresh(); }
      placeUpdate();
    } catch (e) { if (!S.warned) { S.warned = true; console.warn('[polish4] update', e); } }
  }));
  offs.push(mods.on('mapLoaded', (w, g) => { if (g === game) { deco.sig = ''; wrapManager(); } }));
  offs.push(mods.on('phase', (ph, g) => { if (g === game && pm.on && ph !== 'moon' && ph !== 'orbit' && ph !== 'company') stopPlace(); }));

  const api = {
    state: S, deco, core: P,
    /** debug / tests (host): roll + drop an egg now, ignoring the day cap */
    forceEgg(item = 'pet_egg_common', pos = new THREE.Vector3(0, 1, 3)) { S.eggDay.clear(); return dropEgg(item, pos, 'debug'); },
    hostBarter, hostAct, offersFor, openBarter, startPlace, stopPlace, syncDeco,
    dispose() {
      if (disposed) return; disposed = true;
      for (const o of offs.splice(0)) { try { o?.(); } catch { /* */ } }
      for (const u of undo.splice(0)) { try { u(); } catch { /* */ } }
      stopPlace(); clearDeco();
      try { game.ui?.panelOpen === panel?.el && game.ui.closePanel(); } catch { /* */ }
      panel?.dispose();
      for (const n of ['decal', 'furniture']) { try { mods.api?.commands?.delete?.(n); mods.commands?.delete?.(n); } catch { /* */ } }
    },
  };
  void tf;
  return api;
}
