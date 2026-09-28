// ITEM DURABILITY (module `durability`): weapons and worn armour wear out. Installed with `this.useModule('durability', installDurability)`.
// Rules / numbers: src/game/durability_core.js (node-tested).  Docs: docs/wave2/durability.md.
//
// Who does what
//  * The wielder's client PREDICTS wear locally (attack edge detected from game.swingAnim, melee connect from the outgoing 'hit' / 'cbhit'
//    request, armour from the 'localHurt' event) and sends batched deltas  duw {id, w, f?}  (every 5 units / 3.5 s / item change).
//    The HOST applies them to its own copy (authoritative; when the host wields, it applies directly - no double counting).
//  * Host -> all:  dus {id, d, r, v}  item state (only when the 10 % bucket or a 25 / 10 / 0 threshold changes, on repair, on forced flush),
//                  dubrk {k:'x'|'b'|'r', id, ty, by, p}  effects + toasts: x = shattered (destroyed), b = BROKEN, r = repaired,
//                  dures {k:'ok'|'err', ...}  answer to the requester (repair panel).  Client -> host requests: duw, dukit, durep.
//  * Item fields: it.dur (null = untouched = full), it.dr (full repairs). Synced via the 'sp' event (du / dr), serialize (late join), saveFields.
//  * Broken weapons cannot attack: game.nextSwing is a getter that reports "on cooldown" while a broken weapon is held, and useHeldPress
//    is wrapped for the click sound + toast.  Broken armour gives no bonuses (inventory_core.equipBonuses).
import * as THREE from 'three';
import { addTranslations, t, tf } from '../core/i18n.js';
import { registerItem, ITEMS, STORE_ITEMS } from './items.js';
import { RECIPES } from './recipes.js';
import { SHARD_ALIASES } from './enhance.js';
import { HOST_ONLY } from '../net/session.js';
import * as D from './durability_core.js';
import { renderRepairUI, createHqRepairPanel } from '../ui/panels/repair.js';

HOST_ONLY.add('dus'); HOST_ONLY.add('dubrk'); HOST_ONLY.add('dures');   // clients only accept these from the host

// ---------------------------------------------------------------------------------------------- Repair Kit item + recipe (registered at import)
if (!ITEMS[D.KIT_ID]) {
  registerItem({ id: D.KIT_ID, name: 'Repair Kit', kind: 'consumable', price: 45, shop: 'consumables', weight: 1.5, hands: 1, crafted: true,
    tip: 'LMB: repairs your most worn weapon or armour by 40%, then it is used up. Works on broken items too.' });
}
if (!STORE_ITEMS.includes(D.KIT_ID)) STORE_ITEMS.push(D.KIT_ID);
if (!RECIPES.some((r) => r.id === D.KIT_ID)) {
  RECIPES.push({ id: D.KIT_ID, name: 'Repair Kit', cat: 'tools', out: D.KIT_ID, n: 1, in: [['comp_scrapmetal', 2], ['comp_cloth', 1], ['comp_cable', 1]], tier: null, time: 1.6,
    desc: 'Spare parts in a red box. Repairs 40% of your most worn gear in the field.' });
}

// ---------------------------------------------------------------------------------------------- text
const TR = {
  'Repair Kit': 'Tamir Kiti', 'Mechanic: repair gear [E]': 'Tamirci: eşyaları onar [E]', MECHANIC: 'TAMİRCİ', REPAIR: 'TAMİR', BROKEN: 'KIRIK', Durability: 'Dayanıklılık',
  'LMB: repairs your most worn weapon or armour by 40%, then it is used up. Works on broken items too.': 'Sol tık: en yıpranmış silahını veya zırhını %40 onarır, sonra tükenir. Kırık eşyalarda da işe yarar.',
  'Spare parts in a red box. Repairs 40% of your most worn gear in the field.': 'Kırmızı kutuda yedek parçalar. En yıpranmış eşyanın %40\'ını sahada onarır.',
  'Your {n} broke!': '{n} eşyan kırıldı!', 'Your {n} is BROKEN! Repair it at a workbench.': '{n} KIRILDI! Atölye masasında onar.',
  'Your {n} is getting worn ({p}%).': '{n} yıpranıyor (%{p}).', 'Your {n} is about to break! ({p}%)': '{n} neredeyse kırılacak! (%{p})',
  '{n} is BROKEN. Repair it first.': '{n} KIRIK. Önce onar.', 'Nothing needs repairing.': 'Onarılacak bir şey yok.', 'Nothing to repair.': 'Onarılacak bir şey yok.',
  'That item cannot be repaired.': 'Bu eşya onarılamaz.', 'Missing parts.': 'Parça eksik.', 'Not enough credits.': 'Yeterli kredi yok.', 'Slow down.': 'Yavaş ol.',
  'Stand at the workbench.': 'Atölye masasının başında dur.', 'Stand at the mechanic bench.': 'Tamirci tezgâhının başında dur.', 'The mechanic works at HQ.': 'Tamirci HQ\'da çalışır.',
  'Repaired {n}: {a}/{b}': '{n} onarıldı: {a}/{b}', 'Repaired {n} (+40%)': '{n} onarıldı (+%40)', 'REPAIRED': 'ONARILDI', 'FAILED': 'BAŞARISIZ',
  'Shatters at 0 durability': '0 dayanıklılıkta parçalanır', 'Breaks at 0: repair it': '0\'da kırılır: onarılabilir', 'worn out by repairs': 'onarımlarla yıprandı',
  'RESTORES': 'YENİLENİR', COST: 'BEDEL', 'Back to {d}/{d} (100%)': '{d}/{d} değerine döner (%100)',
  'A full repair wears the item out a little: max durability {a} -> {b} (-5%, never below 60%).': 'Tam onarım eşyayı biraz eskitir: azami dayanıklılık {a} -> {b} (-%5, en fazla %60\'a kadar).',
  'A small repair does not age the item.': 'Küçük onarım eşyayı eskitmez.', 'broken item': 'kırık eşya', 'Credits (ship funds)': 'Kredi (gemi fonu)',
  'Select a damaged weapon or armour.': 'Hasarlı bir silah ya da zırh seç.', 'Pay credits, get the item back as new. No parts needed.': 'Kredi öde, eşya yeni gibi geri gelsin. Parça gerekmez.',
  'Bring parts and a little credit: restores 100%.': 'Parça ve biraz kredi getir: %100 onarır.',
  'The HQ mechanic repairs for credits only (a bit pricier). A Repair Kit restores 40% anywhere.': 'HQ tamircisi sadece kredi ile onarır (biraz pahalı). Tamir Kiti her yerde %40 onarır.',
  'Credits only. Repairs restore 100% of the (slightly aged) maximum.': 'Sadece kredi. Onarım (biraz yıpranmış) azami değerin %100\'ünü geri getirir.', Close: 'Kapat',
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (a) => Array.isArray(a) && a.length >= 3 && a.slice(0, 3).every(Number.isFinite);

// ---------------------------------------------------------------------------------------------- HQ mechanic bench model
function createMechanicBench() {
  const g = new THREE.Group(); g.name = 'repairbench';
  const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
  const wood = M(0x6a4426), steel = M(0x8b9199), dark = M(0x2a2c30), red = M(0xb02a1a), grey = M(0x555a60);
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  box(2.2, 0.14, 0.95, wood, 0, 0.95, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.12, 0.9, 0.12, dark, sx * 1.0, 0.45, sz * 0.4);
  box(2.0, 0.08, 0.8, dark, 0, 0.32, 0);
  box(0.34, 0.14, 0.24, steel, -0.6, 1.09, 0.05); box(0.16, 0.16, 0.18, steel, -0.6, 1.2, 0.05); box(0.62, 0.11, 0.26, steel, -0.6, 1.33, 0.05);
  box(0.24, 0.22, 0.22, red, 0.75, 1.13, 0.12); box(0.05, 0.05, 0.34, grey, 0.75, 1.25, 0.32);
  box(0.5, 0.22, 0.3, red, 0.15, 1.13, 0.05); box(0.12, 0.04, 0.05, grey, 0.15, 1.27, 0.05);
  box(2.2, 1.15, 0.06, dark, 0, 1.95, -0.4);
  for (const [x, w, h] of [[-0.8, 0.09, 0.5], [-0.35, 0.07, 0.42], [0.1, 0.1, 0.36], [0.55, 0.07, 0.5], [0.9, 0.08, 0.4]]) { box(w, h, 0.05, steel, x, 1.95, -0.34); box(w * 2.4, 0.09, 0.05, grey, x, 1.95 + h / 2, -0.34); }
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = '#1a0d04'; c.fillRect(0, 0, 256, 64); c.strokeStyle = '#ff8a3d'; c.lineWidth = 4; c.strokeRect(3, 3, 250, 58);
  c.fillStyle = '#ffb060'; c.font = 'bold 34px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('REPAIRS', 128, 34);
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  box(1.5, 0.375, 0.05, new THREE.MeshBasicMaterial({ map: tex }), 0, 2.85, -0.36);
  g.userData.colliders = [[0, 0.55, 0, 1.1, 0.55, 0.48]];
  return g;
}
function createKitModel() {
  const g = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: 0xc03020 }), white = new THREE.MeshLambertMaterial({ color: 0xf2efe6 }), grey = new THREE.MeshLambertMaterial({ color: 0x8b9199 });
  const b = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  b(0.3, 0.16, 0.18, red, 0, 0, 0); b(0.12, 0.02, 0.04, grey, 0, 0.09, 0); b(0.1, 0.02, 0.1, white, 0, 0.085, 0.0); b(0.03, 0.02, 0.1, white, 0, 0.09, 0);
  b(0.3, 0.03, 0.2, grey, 0, -0.085, 0);
  return g;
}

// ---------------------------------------------------------------------------------------------- install
export function installDurability(game) {
  addTranslations(TR);
  const mm = game.mods;
  const offs = [];
  const undo = [];
  let disposed = false;
  const tmpV = new THREE.Vector3();
  const stats = { wearSent: 0, states: 0, broken: 0, destroyed: 0, repaired: 0 };
  const api = { D, stats, debug: { skipNear: false } };
  if (mm?.itemModels && !mm.itemModels.has(D.KIT_ID)) mm.itemModels.set(D.KIT_ID, () => createKitModel());

  // ------------------------------------------------------------------ helpers
  const net = () => game.net;
  const selfId = () => game.selfId;
  const posOf = (id) => (id === game.selfId ? game.player?.pos : game.remotes.get(id)?.pos);
  const held = () => game.player?.heldItem?.() || null;
  const name = (it) => t(it?.def?.name || it?.type || 'Item');
  const toast = (s, kind) => { try { game.ui?.toast?.(s, kind); } catch { /* ui not ready */ } };
  const sfx = (n, v = 0.6, p = 1) => { try { game.sfx?.(n, v, p); } catch { /* audio not ready */ } };
  const isWeapon = (it) => { const k = it && D.durKind(it.def); return k === 'melee' || k === 'ranged'; };
  const weaponBroken = (it) => isWeapon(it) && D.isBroken(it);
  const heldBy = (pid) => { const out = []; for (const it of game.items.all()) if (it.holder === pid) out.push(it); return out; };
  const nearBench = (pid) => {
    if (api.debug.skipNear) return true;
    const B = game.crafting?.BENCH, p = posOf(pid);
    return !!B && !!p && Math.hypot(p.x - B.x, p.z - B.z) < 7.5 && p.y > -1 && p.y < 4.5;
  };
  const stations = () => game.world?.company?.group?.userData?.tfgRepair || null;
  const nearHq = (pid) => {
    if (api.debug.skipNear) return true;
    const s = stations(), p = posOf(pid);
    if (!s || !p) return false;
    s.getWorldPosition(tmpV);
    return Math.hypot(p.x - tmpV.x, p.z - tmpV.z) < 7.5 && Math.abs(p.y - tmpV.y) < 4;
  };
  const onBench = (it) => { try { return !!game.crafting?.onBench?.(it); } catch { return false; } };
  const typesFor = (id) => [id, ...(SHARD_ALIASES[id] || [])];
  const usable = (it) => !it.soulbound && !it._duUsed && it.type !== 'body' && !it.selling;
  /** spendable copies of an item id: held by pid (hotbar + bag) and, for bench repairs, lying on the workbench */
  const sources = (pid, bench) => { const out = heldBy(pid); if (bench) for (const it of game.items.all()) if (!it.holder && onBench(it)) out.push(it); return out; };
  const count = (id, pid = game.selfId, bench = true) => { const ts = typesFor(id); let n = 0; for (const it of sources(pid, bench)) if (ts.includes(it.type) && usable(it)) n++; return n; };
  const take = (pid, id, n, bench) => {
    const ts = typesFor(id), out = [];
    for (const it of sources(pid, bench)) { if (out.length >= n) break; if (ts.includes(it.type) && usable(it)) out.push(it); }
    return out.length >= n ? out : null;
  };
  const removeItems = (list) => { for (const it of list) { it._duUsed = true; net().broadcast('it', { e: 'rm', id: it.id }); } };
  /** every durable item the local player carries (hotbar + bag + worn), plus bench items for the workbench tab */
  const carried = () => {
    const out = [];
    for (const it of game.items.all()) if (D.durKind(it.def) && (it.holder === game.selfId || onBench(it)) && !it.soulbound) out.push(it);
    return out;
  };

  // ------------------------------------------------------------------ client: local wear (prediction) + batched flush
  const pend = new Map();   // item id -> { w, t0 }
  function flush(id, forced) {
    const p = pend.get(id);
    if (!p) return;
    pend.delete(id);
    if (game.isHost || !net()) return;
    stats.wearSent++;
    net().request('duw', { id, w: Math.round(p.w * 10) / 10, f: forced ? 1 : undefined });
  }
  function crackSfx(it, cur, max) {
    const st = D.stateOf(cur, max);
    if (st === 'worn' && Math.random() < 0.3) sfx('glowstick_crack', 0.22, 0.75 + Math.random() * 0.25);
    else if (st === 'critical' && Math.random() < 0.75) sfx('glowstick_crack', 0.4, 0.65 + Math.random() * 0.3);
  }
  function feedback(it, r, max) {
    if (!r.changed) return;
    const pct = Math.round((r.dur / max) * 100);
    if (r.after === 'worn') { toast(tf('Your {n} is getting worn ({p}%).', { n: name(it), p: pct })); sfx('glowstick_crack', 0.45, 0.8); }
    else if (r.after === 'critical') { toast(tf('Your {n} is about to break! ({p}%)', { n: name(it), p: pct }), 'bad'); sfx('glowstick_crack', 0.6, 0.65); }
    if (it.def?.kind === 'armor') game.refreshStats?.();
  }
  /** wear an item the LOCAL player uses. ev: 'swing' | 'hit' | 'shot' | 'pry' | 'dmg' */
  function wear(it, amount, ev) {
    if (!it || !(amount > 0) || disposed) return;
    const max = D.itemMax(it), cur = D.itemDur(it);
    if (!max || cur <= 0) return;
    if (game.isHost) { hostApply(it, amount, game.selfId, true); if (ev === 'hit' || ev === 'shot') crackSfx(it, D.itemDur(it), max); return; }
    const r = D.applyWear(cur, max, amount);
    it.dur = r.dur;
    feedback(it, r, max);
    if (ev === 'hit' || ev === 'shot') crackSfx(it, r.dur, max);
    const p = pend.get(it.id) || { w: 0, t0: performance.now() };
    p.w += amount; pend.set(it.id, p);
    if (r.zero || p.w >= D.FLUSH_WEAR) flush(it.id, r.zero);
  }

  // attack detection: every swing / shot / throw sets game.swingAnim (melee 1, guns 0.6) - a rising edge = one attack
  let prevSA = 0, swingPending = null, lastHeldId = null, lastClick = 0, lastClickToast = 0;
  function onAttack() {
    const it = held();
    const k = it && D.durKind(it.def);
    if (k === 'melee') { wear(it, D.wearFor('melee', 'swing'), 'swing'); swingPending = { id: it.id, t: game.time }; }
    else if (k === 'ranged') { swingPending = null; wear(it, D.wearFor('ranged', 'shot'), 'shot'); }
    else swingPending = null;
  }
  function onRequest(a, d) {
    if (a === 'hit' || a === 'cbhit') {
      if (a === 'hit' && !(d?.dmg > 0)) return;
      const sp = swingPending, it = held();
      if (!sp || !it || it.id !== sp.id || game.time - sp.t > 2) return;
      swingPending = null;
      wear(it, D.wearFor('melee', 'hit'), 'hit');
    } else if (a === 'wpry' || (a === 'opCrate' && d?.pry)) {
      const it = game.items.get(String(a === 'wpry' ? d?.wid : d?.pry));
      if (it && it.holder === game.selfId) wear(it, D.wearFor('melee', 'pry'), 'pry');
    }
  }
  const hookNet = (n) => {
    const orig = n.request;
    const mine = function (a, data) { try { onRequest(a, data); } catch (e) { console.warn('[durability] request hook', e); } return orig.call(this, a, data); };
    n.request = mine;
    undo.push(() => { if (n.request === mine) delete n.request; });
  };
  offs.push(mm.on('localHurt', (d, g) => {
    if (g !== game || !d || !(d.dmg > 0)) return;
    const arm = game.inventory?.equipped?.('armor');
    if (arm && D.durKind(arm.def) === 'armor') wear(arm, D.wearFor('armor', 'dmg', d.dmg), 'dmg');
  }));
  offs.push(mm.on('update', (dt, g) => {
    if (g && g !== game) return;
    if (disposed || !game.player) return;
    const sa = game.swingAnim || 0;
    if (sa > prevSA + 0.12 && !game.player.dead) { try { onAttack(); } catch (e) { console.warn('[durability] attack', e); } }
    prevSA = sa;
    // flush pending wear: item change, timeout
    const hid = held()?.id || null;
    if (pend.size) {
      const now = performance.now();
      for (const [id, p] of [...pend]) {
        const it = game.items.get(id);
        const inUse = it && (it.id === hid || game.inventory?.equipped?.('armor') === it);
        if (!it || !inUse || now - p.t0 > D.FLUSH_MS) flush(id, hid !== lastHeldId || !inUse);
      }
    }
    lastHeldId = hid;
  }));

  // ------------------------------------------------------------------ broken weapons cannot attack
  let realNext = game.nextSwing || 0;
  Object.defineProperty(game, 'nextSwing', {
    configurable: true, enumerable: true,
    get() { const it = held(); return it && weaponBroken(it) ? Math.max(realNext, (game.time || 0) + 0.25) : realNext; },
    set(v) { realNext = v; },
  });
  undo.push(() => { const v = realNext; delete game.nextSwing; game.nextSwing = v; });
  const origPress = game.useHeldPress;
  const pressWrap = function (...args) {
    const it = held();
    if (it && weaponBroken(it)) {
      const now = performance.now();
      if (now - lastClick > 350) { lastClick = now; sfx('ui_error', 0.35, 0.7); sfx('glowstick_crack', 0.35, 0.6); }
      if (now - lastClickToast > 2500) { lastClickToast = now; toast(tf('{n} is BROKEN. Repair it first.', { n: name(it) }), 'bad'); }
      return undefined;
    }
    return origPress.apply(this, args);
  };
  if (typeof origPress === 'function') { game.useHeldPress = pressWrap; undo.push(() => { if (game.useHeldPress === pressWrap) delete game.useHeldPress; }); }

  // ------------------------------------------------------------------ Repair Kit (LMB)
  offs.push(mm.on('useItem', (it, hk, g) => {
    if (g !== game || hk.handled || !it || it.type !== D.KIT_ID) return;
    hk.handled = true;
    useKit(it);
  }));
  function useKit(kit) {
    const cands = carried().filter((x) => x !== kit && x.holder === game.selfId);
    const target = D.mostWorn(cands);
    if (!target) { toast(t('Nothing needs repairing.')); sfx('ui_error', 0.3, 0.9); return; }
    sfx('hit_metal', 0.35, 1.5);
    net().request('dukit', { kit: kit.id, id: target.id });
  }

  // ------------------------------------------------------------------ host: wear, break, repair
  const posFor = (it, holder) => {
    if (it.state === 'world') return [it.obj.position.x, it.obj.position.y + 0.3, it.obj.position.z];
    const p = posOf(holder) || posOf(it.holder) || game.player?.pos;
    return p ? [p.x, p.y + 0.9, p.z] : [0, 1, 0];
  };
  function hostApply(it, amount, holder, local, force) {
    const max = D.itemMax(it), cur = D.itemDur(it);
    if (!max || cur <= 0) return;
    const r = D.applyWear(cur, max, amount);
    it.dur = r.dur;
    if (local) feedback(it, r, max);
    if (r.zero) return hostZero(it, holder);
    if (force || D.shouldBroadcast(cur, r.dur, max)) { stats.states++; net().broadcast('dus', { id: it.id, d: r.dur, r: it.dr || undefined }); }
  }
  function hostZero(it, holder) {
    const info = D.durInfo(it), p = posFor(it, holder);
    if (info.outcome === 'destroy') {
      stats.destroyed++;
      net().broadcast('dubrk', { k: 'x', id: it.id, ty: it.type, by: holder, p });
      net().broadcast('it', { e: 'rm', id: it.id });
      const scrap = ITEMS.shard_scrap ? 'shard_scrap' : 'comp_scrapmetal';
      try { game.items.hostSpawn(scrap, { x: p[0], y: p[1] + 0.2, z: p[2] }, {}); } catch (e) { console.warn('[durability] scrap drop', e); }
    } else {
      stats.broken++;
      it.dur = 0;
      it.value = D.brokenValue(it.value);
      net().broadcast('dus', { id: it.id, d: 0, r: it.dr || undefined, v: it.value });
      net().broadcast('dubrk', { k: 'b', id: it.id, ty: it.type, by: holder, p });
    }
  }
  function hostWear(d, from) {
    if (!game.isHost || disposed) return;
    const it = game.items.get(String(d?.id));
    if (!it || !D.durKind(it.def) || (it.holder !== from && it.lastHolder !== from)) return;
    const cap = D.durKind(it.def) === 'armor' ? 60 : 25;
    const w = Math.min(cap, Number(d.w));
    if (!(w > 0)) return;
    hostApply(it, w, from, false, !!d.f);
  }
  const reply = (to, o) => net().sendTo(to, 'dures', o);
  const lastReq = new Map();
  function gate(from) {
    if (!game.isHost || disposed) return false;
    const now = performance.now() / 1000;
    if (now - (lastReq.get(from) || -9) < 0.35) { reply(from, { k: 'err', msg: 'Slow down.' }); return false; }
    lastReq.set(from, now);
    return true;
  }
  const applyRepairState = (it, dur, repairs) => {
    const wasBroken = D.isBroken(it);
    it.dur = dur; it.dr = repairs;
    if (wasBroken && dur > 0) it.value = D.repairedValue(it.value);
    net().broadcast('dus', { id: it.id, d: dur, r: repairs || undefined, v: wasBroken ? it.value : undefined });
    if (it.def?.kind === 'armor') game.refreshStats?.();
    stats.repaired++;
  };
  function hostRepair(d, from) {
    if (!gate(from)) return;
    const via = d?.via === 'hq' ? 'hq' : 'bench';
    if (via === 'bench' ? !nearBench(from) : !(game.run?.phase === 'company' && nearHq(from))) return reply(from, { k: 'err', msg: via === 'bench' ? 'Stand at the workbench.' : 'Stand at the mechanic bench.' });
    const it = game.items.get(String(d?.id));
    if (!it || (it.holder !== from && !(via === 'bench' && !it.holder && onBench(it)))) return reply(from, { k: 'err', msg: 'That item cannot be repaired.' });
    const plan = D.repairPlan(it, via);
    if (!plan.ok) return reply(from, { k: 'err', msg: plan.reason });
    if ((game.run?.credits || 0) < plan.credits) return reply(from, { k: 'err', msg: 'Not enough credits.' });
    const bench = via === 'bench', mats = [];
    const fail = (msg) => { for (const m of mats) m._duUsed = false; return reply(from, { k: 'err', msg }); };
    for (const [id, n] of plan.comps) { const got = take(from, id, n, bench); if (!got) return fail('Missing parts.'); for (const g of got) g._duUsed = true; mats.push(...got); }
    if (plan.shard) { const got = take(from, plan.shard, 1, bench); if (!got) return fail('Missing parts.'); mats.push(...got); }
    for (const m of mats) m._duUsed = false;   // removeItems flags them again
    game.run.credits -= plan.credits; game.broadcastRun?.(['credits']);
    removeItems(mats);
    const before = D.itemDur(it);
    applyRepairState(it, plan.newDur, plan.newRepairs);
    const p = posFor(it, from);
    net().broadcast('dubrk', { k: 'r', id: it.id, ty: it.type, by: from, p });
    reply(from, { k: 'ok', via, id: it.id, ty: it.type, from: Math.round(before), to: Math.round(plan.newDur), max: Math.round(plan.newMax), credits: plan.credits });
  }
  function hostKit(d, from) {
    if (!gate(from)) return;
    const kit = game.items.get(String(d?.kit)), it = game.items.get(String(d?.id));
    if (!kit || kit.holder !== from || kit.type !== D.KIT_ID || kit._duUsed) return reply(from, { k: 'err', msg: 'That item cannot be repaired.' });
    if (!it || it === kit || it.holder !== from) return reply(from, { k: 'err', msg: 'That item cannot be repaired.' });
    const k = D.kitRepair(it);
    if (!k) return reply(from, { k: 'err', msg: 'Nothing to repair.' });
    kit._duUsed = true;
    net().broadcast('it', { e: 'rm', id: kit.id });
    const before = D.itemDur(it);
    applyRepairState(it, k.dur, it.dr | 0);
    net().broadcast('dubrk', { k: 'r', id: it.id, ty: it.type, by: from, p: posFor(it, from) });
    reply(from, { k: 'ok', via: 'kit', id: it.id, ty: it.type, from: Math.round(before), to: Math.round(k.dur), max: Math.round(k.max) });
  }
  offs.push(mm.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    H('duw', hostWear); H('dukit', hostKit); H('durep', hostRepair);
  }));

  // ------------------------------------------------------------------ client: messages from the host
  let uiCtx = null;   // last workbench tab / hq panel render callback (result stamp)
  const fxBurst = (pos, o) => { try { game.particles?.burst(pos, o); } catch { /* particles not ready */ } };
  const at = (n, pos, v, pitch) => { try { game.audio?.at?.(n, pos, v, { refDistance: 5, maxDistance: 60, pitch }); } catch { /* audio not ready */ } };
  function onBreak(d) {
    if (disposed || !d || !fin(d.p)) return;
    const pos = new THREE.Vector3(d.p[0], d.p[1], d.p[2]);
    const mine = d.by === game.selfId;
    const nm = t(ITEMS[d.ty]?.name || d.ty);
    if (d.k === 'x') {
      fxBurst(pos, { count: 28, color: [0xc8ccd0, 0x8a8f96, 0xffd9a0], speed: 3.4, up: 2.2, life: 0.75, size: 0.06, gravity: 7, drag: 1.4 });
      at('glass_break', pos, 0.85, 0.8); at('hit_metal', pos, 0.6, 0.6);
      if (mine) { toast(tf('Your {n} broke!', { n: nm }), 'bad'); game.engine?.shake?.(0.25); }
    } else if (d.k === 'b') {
      fxBurst(pos, { count: 16, color: [0xff5a4a, 0xffb060, 0x8a8f96], speed: 2.6, up: 1.6, life: 0.55, size: 0.055, gravity: 6, drag: 1.6 });
      at('hit_metal', pos, 0.7, 0.55); at('glowstick_crack', pos, 0.8, 0.6);
      if (mine) { toast(tf('Your {n} is BROKEN! Repair it at a workbench.', { n: nm }), 'bad'); game.engine?.shake?.(0.2); }
    } else if (d.k === 'r') {
      fxBurst(pos, { count: 18, color: [0xffd23f, 0xffffff, 0xff8a3d], speed: 2.4, up: 1.8, life: 0.5, size: 0.05, gravity: 5, drag: 1.8 });
      at('hit_metal', pos, 0.6, 1.3);
    }
  }
  function onRes(d) {
    if (disposed || !d) return;
    if (d.k === 'err') { sfx('ui_error', 0.5); toast(t(String(d.msg || 'Slow down.')), 'bad'); if (uiCtx) { uiCtx.stamp({ text: t('FAILED'), sub: t(String(d.msg || '')), bad: true }); } return; }
    if (d.k === 'ok') {
      const nm = t(ITEMS[d.ty]?.name || d.ty);
      game.audio?.ui?.('ui_buy', 0.7);
      toast(d.via === 'kit' ? tf('Repaired {n} (+40%)', { n: nm }) : tf('Repaired {n}: {a}/{b}', { n: nm, a: d.to, b: d.max }), 'good');
      if (uiCtx) uiCtx.stamp({ text: t('REPAIRED'), sub: `${nm} ${d.to}/${d.max}`, color: '#7dff7d' });
    }
  }
  offs.push(mm.on('netReady', (n, g) => {
    if (g && g !== game) return;
    hookNet(n);
    n.on_('dus', (d) => {
      const it = game.items.get(d?.id);
      if (!it) return;
      if (Number.isFinite(d.d)) { const p = pend.get(it.id); it.dur = d.d <= 0 ? 0 : Math.max(0, d.d - (p?.w || 0)); }
      if (Number.isFinite(d.r)) it.dr = clamp(d.r | 0, 0, 20);
      if (Number.isFinite(d.v)) it.value = d.v;
      if (it.def?.kind === 'armor' && it.holder === game.selfId) game.refreshStats?.();
    });
    n.on_('dubrk', (d) => onBreak(d));
    n.on_('dures', (d) => onRes(d));
  }));

  // ------------------------------------------------------------------ HQ mechanic station
  function build(co) {
    if (!co?.group || co.group.userData.tfgRepair) return;
    try {
      const y = co.groundY ?? -1.25;
      const bench = createMechanicBench();
      bench.position.set(-14.4, y, -36.9);
      co.group.add(bench);
      for (const [cx, cy, cz, hx, hy, hz] of bench.userData.colliders) co.colliders?.push(game.physics.addStaticBox(bench.position.x + cx, bench.position.y + cy, bench.position.z + cz, hx, hy, hz, 0));
      co.group.userData.tfgRepair = bench;
    } catch (e) { console.warn('[durability] station', e); }
  }
  offs.push(mm.on('mapLoaded', (world, g) => { if (g && g !== game) return; if (world?.company) build(world.company); }));
  let hqPanel = null;
  function openHq() {
    if (disposed || !stations()) return;
    const ui = game.ui;
    const ctl = createHqRepairPanel({ game, dura: api, onClose: () => ui.closePanel() });
    uiCtx = { stamp: (s) => { ctl.state.stamp = s; ctl.refresh(); } };
    ui.openPanel(ctl.el);
    hqPanel = ctl;
    ui.onPanelClose = () => { ctl.dispose(); if (hqPanel === ctl) { hqPanel = null; uiCtx = null; } return false; };
    game.audio?.play?.('ui_confirm', { volume: 0.6, bus: 'ui' });
  }
  offs.push(mm.on('interactables', (list, g) => {
    if (g !== game || !game.run || game.run.phase !== 'company') return;
    const s = stations();
    if (!s) return;
    const p = s.getWorldPosition(new THREE.Vector3()); p.y += 1.2; p.z += 0.9;
    list.push({ pos: p, r: 1.5, reach: 3.6, label: t('Mechanic: repair gear [E]'), action: () => openHq() });
  }));

  // ------------------------------------------------------------------ public api
  const wbState = { sel: null, stamp: null, busy: false };
  Object.assign(api, {
    carried, count, wear, hostApply, info: (it) => D.durInfo(it),
    requestRepair: (id, via = 'bench') => net()?.request('durep', { id, via }),
    requestKit: (kit, id) => net()?.request('dukit', { kit, id }),
    useKit, openHq,
    /** crafting panel REPAIR tab (called from ui/panels/crafting.js): renders into `body`, `onChange` re-renders the panel */
    renderRepairTab(body, onChange) {
      uiCtx = { stamp: (s) => { wbState.stamp = s; onChange?.(); } };
      return renderRepairUI(body, { game, dura: api, mode: 'bench', state: wbState, onChange: () => onChange?.() });
    },
    flushAll: () => { for (const id of [...pend.keys()]) flush(id, true); },
    pending: () => new Map(pend),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      for (const u of undo.reverse()) { try { u(); } catch { /* ignore */ } }
      if (hqPanel) { try { game.ui.closePanel(); } catch { /* ignore */ } }
      const s = stations();
      if (s) { s.removeFromParent(); s.traverse((x) => { if (x.geometry) x.geometry.dispose(); }); try { delete game.world.company.group.userData.tfgRepair; } catch { /* map gone */ } }
    },
  });
  return api;
}
