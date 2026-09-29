// HARVESTING (wave 1, worldx; reworked in wave 5 "harvest2", docs/wave5/harvest2.md): outdoor trees and rocks are gathered by HITTING them
// with the held item (LMB swing: game.resolveMelee is wrapped, the original still runs). Axe x2 on trees, pickaxe x2 on rock, weapons x0.6,
// bare hands x0.3 (rules + host validation in harvest2_core.js). No hold-E any more: E stays for small things (herbs, item pickup).
// Host-authoritative HP per tree / rock (per map, synced + late-join sync); the tree falls with a simple rotation
// animation and drops wood, rocks drop scrap metal and now and then a data crystal.
//
//   installHarvest(game, api) -> { onMapLoaded(world), addInteractables(out), update(dt), bindNet(net), hostHit(id, dmg, by),
//                                  info(id), nearest(pos, kind), dispose() }
//
// Trees / rocks come from terrain.js (world.outdoor.harvest = { trees, rocks }): placements with { id, x, y, z, scale, rot,
// inst:[{mesh, k}] (instanced mesh slots), cols:[collider] } - identical on every peer (seeded), so ids match.
// Drops: game.crafting?.dropComponents?.(pos, 'wood' | 'metal', n) when the crafting module provides it, otherwise the
// components (comp_wood / comp_scrapmetal / comp_crystal) are spawned directly.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { ITEMS } from './items.js';
import { G } from '../physics/physics.js';
import { t, addTranslations } from '../core/i18n.js';
import { registerItem } from './items.js';
import * as C from './harvest2_core.js';

const MSG_HP = 'wxHp', MSG_FELL = 'wxFell', REQ_HIT = 'wxHit', REQ_SYNC = 'wxHSync';
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** damage multiplier of a held item against 'tree' / 'rock' (kept for other modules; see harvest2_core.js) */
export function toolPower(def, kind) { return C.multiplier(C.toolClass(def), kind); }
const hpFor = (p) => C.hpFor(p.kind, p.scale);

// ---- Axe / Pickaxe: cheap shop tools. kind 'weapon' (melee) so actions.js swings them and durability.js wears them per swing.
const TOOLS = [
  { id: 'tool_axe', name: 'Axe', kind: 'weapon', hands: 1, weight: 6, price: 40, dmg: 15, cd: 0.62, reach: 2.2, rarity: 'common', tier: 'common', shop: 'tools', value: [14, 26],
    blurb: 'Fells trees twice as fast. Wears out with use.' },
  { id: 'tool_pickaxe', name: 'Pickaxe', kind: 'weapon', hands: 1, weight: 7, price: 45, dmg: 13, cd: 0.7, reach: 2.2, rarity: 'common', tier: 'common', shop: 'tools', value: [16, 28],
    blurb: 'Cracks rocks and ore twice as fast. Wears out with use.' },
];
const TR = {
  Axe: ['Balta', 'Топор'], Pickaxe: ['Kazma', 'Кирка'],
  'Fells trees twice as fast. Wears out with use.': ['Ağaçları iki kat hızlı devirir. Kullandıkça yıpranır.', 'Рубит деревья вдвое быстрее. Изнашивается.'],
  'Cracks rocks and ore twice as fast. Wears out with use.': ['Kaya ve madeni iki kat hızlı kırar. Kullandıkça yıpranır.', 'Дробит камень и руду вдвое быстрее. Изнашивается.'],
  'Swing at it to chop': ['Kesmek için vur', 'Бейте, чтобы рубить'], 'Swing at it to mine': ['Kırmak için vur', 'Бейте, чтобы добывать'],
  'Hit it (LMB) - axe: x2': ['Vur (SOL TIK) - balta: x2', 'Бейте (ЛКМ) - топор: x2'], 'Hit it (LMB) - pickaxe: x2': ['Vur (SOL TIK) - kazma: x2', 'Бейте (ЛКМ) - кирка: x2'],
};
function toolModel() {
  return (id) => () => {
    const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9 }), steel = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.5, metalness: 0.7 });
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.62, 6), wood); h.rotation.x = Math.PI / 2; h.position.z = -0.26; g.add(h);
    if (id === 'tool_axe') { const b = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.13, 0.15), steel); b.position.set(0, 0.03, -0.53); g.add(b); }
    else { const b = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.03, 0.44), steel); b.position.set(0, 0.02, -0.5); b.rotation.x = 0.12; g.add(b); }
    return g;
  };
}

export function installHarvest(game, api) {
  const state = new Map();      // id -> { hp, max, fallen }
  const falling = [];           // running fall animations
  let map = null;               // { seed, outdoor, byId }
  const wobbles = [];           // running hit-wobbles { p, t, orig:[Matrix4] }
  let syncAsked = false;
  const lastHit = new Map();    // host: 'from|id' -> time
  const peerHit = new Map();    // host: 'from' -> time of the last hit request (spam guard)
  const tr = { tr: {}, ru: {} };
  for (const [k, [a, b]] of Object.entries(TR)) { tr.tr[k] = a; tr.ru[k] = b; }
  addTranslations(tr.tr, 'tr'); addTranslations(tr.ru, 'ru');
  for (const d of TOOLS) {
    if (!ITEMS[d.id]) registerItem({ ...d });
    if (game.mods?.itemModels && !game.mods.itemModels.has(d.id)) game.mods.itemModels.set(d.id, toolModel()(d.id));
  }
  let time = 0;
  const _v = new THREE.Vector3(), _f = new THREE.Vector3();
  const posOf = (from) => (from === game.selfId ? game.player?.pos : game.remotes?.get(from)?.pos);

  function clear() {
    for (const f of falling.splice(0)) f.group.removeFromParent();
    wobbles.length = 0;
    state.clear(); lastHit.clear(); peerHit.clear();
    map = null; syncAsked = false;
  }
  function onMapLoaded(world) {
    clear();
    const h = world?.outdoor?.harvest;
    if (!h) return;
    const byId = new Map();
    for (const p of h.trees.concat(h.rocks)) byId.set(p.id, p);
    map = { seed: world.seed | 0, outdoor: world.outdoor, byId };
  }
  const st = (p) => { let s = state.get(p.id); if (!s) { const max = hpFor(p); s = { hp: max, max, fallen: false }; state.set(p.id, s); } return s; };

  // ---- hit wobble (all peers): the instanced tree sways around its base / the rock squashes for ~0.3 s ----------------
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Matrix4();
  function endWobble(p) {
    const i = wobbles.findIndex((w) => w.p === p);
    if (i < 0) return;
    const w = wobbles[i];
    (p.inst || []).forEach(({ mesh, k }, n) => { if (w.orig[n]) { mesh.setMatrixAt(k, w.orig[n]); mesh.instanceMatrix.needsUpdate = true; } });
    wobbles.splice(i, 1);
  }
  function startWobble(p, ang) {
    const cur = wobbles.find((w) => w.p === p);
    if (cur) { cur.t = 0; cur.ang = ang; return; }
    if (!p.inst?.length) return;
    const orig = p.inst.map(({ mesh, k }) => { const m = new THREE.Matrix4(); mesh.getMatrixAt(k, m); return m; });
    wobbles.push({ p, t: 0, ang, orig });
  }
  function stepWobbles(dt) {
    for (let i = wobbles.length - 1; i >= 0; i--) {
      const w = wobbles[i], p = w.p;
      w.t += dt / 0.35;
      const a = C.wobble(w.t, p.kind === 'tree' ? 0.06 : 0.08);
      (p.inst || []).forEach(({ mesh, k }, n) => {
        const o = w.orig[n]; if (!o) return;
        if (p.kind === 'tree') {   // rotate about the trunk base, perpendicular to the hit direction
          _e.set(Math.cos(w.ang) * a, 0, -Math.sin(w.ang) * a); _q.setFromEuler(_e);
          _m.makeTranslation(p.x, p.y, p.z).multiply(_s.makeRotationFromQuaternion(_q)).multiply(_s.makeTranslation(-p.x, -p.y, -p.z)).multiply(o);
        } else {                    // rock: squash and stretch around its base
          _m.makeTranslation(p.x, p.y, p.z).multiply(_s.makeScale(1 + a, 1 - a * 1.2, 1 + a)).multiply(_s.makeTranslation(-p.x, -p.y, -p.z)).multiply(o);
        }
        mesh.setMatrixAt(k, w.t >= 1 ? o : _m); mesh.instanceMatrix.needsUpdate = true;
      });
      if (w.t >= 1) wobbles.splice(i, 1);
    }
  }

  // ---- fall (all peers) -------------------------------------------------------------------------------------------
  function fell(p, ang, animate) {
    const s = st(p);
    if (s.fallen) return;
    endWobble(p);
    s.fallen = true; s.hp = 0; p.fallAng = ang;
    for (const c of p.cols || []) { game.physics.removeCollider(c); const i = map.outdoor.colliders.indexOf(c); if (i >= 0) map.outdoor.colliders.splice(i, 1); }
    p.cols = [];
    const g = new THREE.Group();
    g.position.set(p.x, p.y, p.z);
    const inv = new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z), m4 = new THREE.Matrix4();
    for (const { mesh, k } of p.inst || []) {
      mesh.getMatrixAt(k, m4);
      const child = new THREE.Mesh(mesh.geometry, mesh.material);
      child.matrixAutoUpdate = false;
      child.matrix.copy(inv).multiply(m4);
      g.add(child);
      mesh.setMatrixAt(k, ZERO);
      mesh.instanceMatrix.needsUpdate = true;
    }
    map.outdoor.group.add(g);
    if (p.kind === 'rock') {
      // rocks just crumble: the shell shrinks away while a dust puff hides the swap
      falling.push({ group: g, t: 0, dur: 0.6, rock: true, p });
    } else {
      falling.push({ group: g, t: animate ? 0 : 1, dur: 1.3, axis: new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang)), p, dust: false });
      if (!animate) g.quaternion.setFromAxisAngle(new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang)), Math.PI / 2 * 0.97);
    }
    if (animate) {
      _v.set(p.x, p.y + 1, p.z);
      try { game.audio?.at?.(p.kind === 'tree' ? 'door_creak' : 'hit_metal', _v, 0.9, { refDistance: 6, maxDistance: 70 }); } catch { /* audio optional */ }
    }
  }

  // ---- host ----------------------------------------------------------------------------------------------------------
  function drops(p, by) {
    const R = new RNG((Math.random() * 4294967296) >>> 0);
    const pos = new THREE.Vector3(p.x, p.y + 0.9, p.z);
    const kind = p.kind === 'tree' ? 'wood' : 'metal';
    const n = p.kind === 'tree' ? R.int(2, 4) + (p.scale > 1.15 ? 1 : 0) : R.int(1, 3);
    let handled = false;
    if (typeof game.crafting?.dropComponents === 'function') {
      try { game.crafting.dropComponents(pos, kind, n); handled = true; } catch (e) { console.warn('dropComponents', e); }
    }
    if (!handled) {
      const id = p.kind === 'tree' ? 'comp_wood' : 'comp_scrapmetal';
      if (ITEMS[id]) for (let i = 0; i < n; i++) {
        const a = R.float(0, Math.PI * 2);
        game.items.hostSpawn(id, pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.5, i * 0.15, Math.sin(a) * 0.5)), { linvel: [Math.cos(a) * 1.6, R.float(2.2, 3.4), Math.sin(a) * 1.6] });
      }
    }
    if (p.kind === 'rock' && ITEMS.comp_crystal && R.chance(0.07)) game.items.hostSpawn('comp_crystal', pos, { tier: 'rare', linvel: [R.float(-1, 1), 3, R.float(-1, 1)] });
    if (by) game.net.broadcast('xp', { to: by, xp: p.kind === 'tree' ? 6 : 9, coin: 0, reason: p.kind === 'tree' ? 'Timber!' : 'Rock cracked' });
  }
  function hostHit(id, dmg, by = null) {
    if (!game.isHost || !map) return null;
    const p = map.byId.get(id);
    if (!p) return null;
    const s = st(p);
    if (s.fallen || s.dying) return s;   // dying: the kill is broadcast but has not looped back yet (no double drops)
    s.hp -= clamp(Number(dmg) || 0, 0, 200);
    if (s.hp <= 0) {
      s.dying = true;
      const ang = Math.atan2(p.x - (posOf(by)?.x ?? 0), p.z - (posOf(by)?.z ?? 0));   // falls away from the chopper
      game.net.broadcast(MSG_FELL, { s: map.seed, id, a: +ang.toFixed(2) });
      drops(p, by);
      game.mods?.emit('tfg:harvested', { id, kind: p.kind, pos: [p.x, p.y, p.z], by });
    } else game.net.broadcast(MSG_HP, { s: map.seed, id, hp: Math.round(s.hp), a: +Math.atan2(p.x - (posOf(by)?.x ?? 0), p.z - (posOf(by)?.z ?? 0)).toFixed(2) });
    return s;
  }
  /** client hit request: { s: map seed, id, d: base melee damage of the swing, c: tool class 'axe'|'pick'|'weapon'|'hand' }.
   *  The host owns the multiplier (harvest2_core.hitDamage) and validates distance + rate. */
  function onHitRequest(d, from) {
    if (!game.isHost || game.run?.phase !== 'moon' || !map || !d || d.s !== map.seed) return;
    const p = map.byId.get(d.id);
    if (!p) return;
    const k = from + '|' + d.id;
    const v = C.validateHit({ now: time, peerLast: peerHit.get(from), pairLast: lastHit.get(k), pos: posOf(from), target: p, fallen: st(p).fallen });
    if (!v.ok) return;
    peerHit.set(from, time); lastHit.set(k, time);
    const cls = ['axe', 'pick', 'weapon', 'hand'].includes(d.c) ? d.c : 'hand';
    hostHit(d.id, C.hitDamage(d.d, cls, p.kind), from);
  }
  function bindNet(net) {
    net.on_(MSG_HP, (d) => {
      if (!map || d.s !== map.seed) return;
      const p = map.byId.get(d.id);
      if (!p) return;
      const s = st(p);
      s.hp = d.hp;
      _v.set(p.x, p.y + 1.2, p.z);
      try { game.audio?.at?.(p.kind === 'tree' ? 'hit_wall' : 'hit_metal', _v, 0.55, { refDistance: 4, maxDistance: 50, pitch: 0.9 + Math.random() * 0.2 }); } catch { /* audio optional */ }
      game.particles?.burst?.(_v, p.kind === 'tree' ? 'landpuff' : 'sparks', null, 0.5);
      startWobble(p, d.a || 0);
    });
    net.on_(MSG_FELL, (d) => {
      if (!map || d.s !== map.seed) return;
      if (Array.isArray(d.list)) { for (const e of d.list) { const p = map.byId.get(e.id); if (p) fell(p, e.a, false); } return; }
      const p = map.byId.get(d.id);
      if (p) fell(p, d.a || 0, true);
    });
    net.handle(REQ_HIT, (d, from) => onHitRequest(d, from));
    net.handle(REQ_SYNC, (d, from) => {
      if (!game.isHost || !map || d.s !== map.seed) return;
      const list = [];
      for (const [id, s] of state) if (s.fallen) list.push({ id, a: map.byId.get(id)?.fallAng ?? 0 });
      if (list.length) game.net.sendTo(from, MSG_FELL, { s: map.seed, list });
    });
  }

  // ---- client: prompt + swings -------------------------------------------------------------------------------
  function aimed() {
    const p = game.player;
    if (!p || p.dead || p.indoor || p.inShip || !map) return null;
    const eye = game.camera.position;
    _f.set(0, 0, -1).applyQuaternion(game.camera.quaternion);
    const hit = game.physics.raycast(eye, _f, 3.4, G.STATIC | G.DOOR, p.col);
    const kind = hit?.info?.kind;
    if (kind !== 'tree' && kind !== 'rock') return null;
    const pl = map.byId.get(hit.info.hid);
    if (!pl || st(pl).fallen) return null;
    return { p: pl, point: hit.point, dist: hit.distance };
  }
  function addInteractables(out) {
    const a = aimed();
    if (!a) return;
    const nm = a.p.kind === 'tree' ? t('tree') : t('rock');
    const s = st(a.p);
    const pos = new THREE.Vector3(a.point.x, a.point.y, a.point.z);
    const pct = Math.round(clamp(1 - s.hp / s.max, 0, 1) * 100);
    // hint only (no E action): the hit itself is the interaction
    out.push({ pos, r: 0.9, reach: 3.4, label: `${nm[0].toUpperCase() + nm.slice(1)}${pct ? ' ' + pct + '%' : ''}`,
      sub: a.p.kind === 'tree' ? t('Hit it (LMB) - axe: x2') : t('Hit it (LMB) - pickaxe: x2'), action: () => {} });
  }
  function sendHit(id, base, cls) { game.net.request(REQ_HIT, { id, s: map.seed, d: Math.round(base), c: cls }); }
  function update(dt) {
    time += dt;
    if (!map) return;
    if (game.world?.outdoor !== map.outdoor) { clear(); return; }
    if (!syncAsked && !game.isHost && game.net?.connected && game.run?.phase === 'moon') { syncAsked = true; game.net.request(REQ_SYNC, { s: map.seed }); }
    stepWobbles(dt);
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      if (f.rock) {
        f.t += dt / f.dur;
        f.group.scale.setScalar(Math.max(0.001, 1 - f.t * f.t));
        if (f.t >= 1) { f.group.removeFromParent(); falling.splice(i, 1); }
        continue;
      }
      if (f.t < 1) {
        f.t = Math.min(1, f.t + dt / f.dur);
        const x = f.t;
        // accelerate, thump, tiny rebound
        const th = (Math.PI / 2) * 0.97 * (x < 0.85 ? (x / 0.85) ** 2 : 1 - Math.sin((x - 0.85) / 0.15 * Math.PI) * 0.03);
        f.group.quaternion.setFromAxisAngle(f.axis, th);
        if (x >= 0.85 && !f.dust) { f.dust = true; _v.set(f.p.x, f.p.y + 0.3, f.p.z).addScaledVector(new THREE.Vector3(f.axis.z, 0, -f.axis.x).multiplyScalar(-1), 4); game.particles?.burst?.(_v, 'landpuff', null, 1.6); game.engine?.shake?.(0.12); }
      }
    }
  }
  /** melee swing hook: a swing that lands on a tree / rock is a harvest hit (the original resolveMelee still runs).
   *  Any held item works (bare hands x0.3, weapons x0.6, axe / pickaxe x2 on their target); a creature in front of the target wins. */
  function onSwing(h) {
    const a = aimed();
    if (!a || a.dist > (h?.reach || 2.4) + 0.4) return;
    const held = game.player.heldItem?.(), def = held ? ITEMS[held.type] : null;
    const cr = game.creatures?.raycast?.(game.camera.position, _f.set(0, 0, -1).applyQuaternion(game.camera.quaternion), a.dist);
    if (cr) return;
    const cls = C.toolClass(def);
    sendHit(a.p.id, Number(h?.dmg) || def?.dmg || 5, cls);
    game.swingAnim = Math.max(game.swingAnim || 0, 0.6);
    game.engine?.punch?.(0.012, 0, 0);
  }

  const orig = game.resolveMelee;
  if (typeof orig === 'function') game.resolveMelee = function (h) { try { onSwing(h); } catch (e) { console.warn('harvest swing', e); } return orig.call(this, h); };

  return {
    onMapLoaded, addInteractables, update, bindNet, hostHit,
    info: (id) => { const p = map?.byId.get(id); return p ? { ...st(p), kind: p.kind, x: p.x, y: p.y, z: p.z } : null; },
    nearest(pos, kind = 'tree') {
      let best = null, bd = 1e9;
      for (const p of map?.byId.values() || []) { if (p.kind !== kind || st(p).fallen) continue; const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2; if (d < bd) { bd = d; best = p; } }
      return best ? { id: best.id, x: best.x, y: best.y, z: best.z } : null;
    },
    dispose() { if (game.resolveMelee !== orig && Object.prototype.hasOwnProperty.call(game, 'resolveMelee')) delete game.resolveMelee; clear(); },
  };
}
