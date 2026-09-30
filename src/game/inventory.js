// Wave-1 INVENTORY (docs/wave1/inventory.md): Diablo-style bag grid + paper-doll equipment + item tiers.
//
// Model: bag / equipment items are ordinary world items HELD by the player (it.holder) that are not in a hotbar slot.
// Their location is it.inv = { k:'bag', x, y } | { k:'eq', s:'armor'|'trinket1'|'trinket2'|'bag' } (null = hotbar).
// The host validates every change ('inv' request: set / pick / consume) with inventory_core.validateState and
// broadcasts { e:'inv' } / { e:'held', iv } on the 'it' channel, so late joiners, saves and deaths just work.
// Clients predict their own moves and get a full resync from the host when a request is rejected.
//
// Soft interface (other modules): game.inventory = { open, close, toggle, isOpen, bagItems, hasItem, countItem,
//   consume(type, n) -> Promise<bool>, addToBag(itemId) -> bool, equipped(slot), bagSize() -> { cols, rows } }
// Cross-module events: 'tfg:invChanged' (game), 'tfg:equip' (slot, item|null, game).
import * as THREE from 'three';
import { ITEMS, isSellable } from './items.js';
import { MOONS } from './moons.js';
import { TIERS, tierIndex } from './tiers.js';
import * as C from './inventory_core.js';
import { RNG } from '../core/rng.js';
import { addTranslations, t, tf, getLang } from '../core/i18n.js';
import { insideShip } from '../world/ship.js';
import { hudDock } from '../ui/dock.js';
import { iconHTML } from '../ui/icons.js';
import { escapeHtml } from '../core/util.js';
import { ensureInventoryStyles } from '../ui/inventory_style.js';
import { InventoryPanel } from '../ui/inventory_panel.js';
import { registerGearModels } from '../models/gear.js';
import { affixDisplayName } from './loot.js';
import { createInventoryFeedback16 } from './inventory_feedback16.js';
import { createGlints } from './lootglint.js';   // [heroprops] horror-safe loot glint

export const INVENTORY_KEY = 'KeyI';

// gear loot per moon (host, 'moonPopulated'): weighted table, tier rolled with the host loot luck
const GEAR_LOOT = [['arm_hoodie', 10], ['arm_riot', 6], ['arm_kevlar', 3], ['trk_dongle', 5], ['trk_charm', 7], ['trk_amulet', 6],
  ['beltbag', 6], ['bag_fieldpack', 4], ['bag_hauler', 2]];
const VOID_CHANCE = (danger) => Math.min(0.08, 0.02 + Math.max(0, danger - 1) * 0.01);

const TR = {
  'Inventory': 'Envanter', 'INVENTORY': 'ENVANTER', 'Equipment': 'Ekipman', 'Backpack': 'Sırt çantası', 'Hotbar': 'Hızlı erişim',
  'Pockets': 'Cepler', 'Suit / Armor': 'Kıyafet / Zırh', 'Trinket I': 'Tılsım I', 'Trinket II': 'Tılsım II', 'Bag': 'Çanta', 'BAG': 'ÇANTA',
  'Sort': 'Sırala', 'Character': 'Karakter', 'Carrying': 'Taşınan', 'Armor': 'Zırh', 'Move speed': 'Hareket hızı', 'Stamina': 'Dayanıklılık',
  'Scan range': 'Tarama menzili', 'Crit chance': 'Kritik şansı', 'Crew loot luck': 'Ekip şansı', 'Bag value': 'Çanta değeri', 'Loot tiers': 'Ganimet seviyeleri',
  'Value': 'Değer', 'Weight': 'Ağırlık', 'Size': 'Boyut', 'Damage': 'Hasar', 'Cooldown': 'Bekleme', 'Reach': 'Menzil', 'Range': 'Menzil',
  'Damage reduction': 'Hasar azaltma', 'Grid': 'Izgara', 'Stashed weight': 'Çantadaki ağırlık', 'Battery': 'Pil', 'Charges': 'Şarj', 'Ammo': 'Mermi',
  'Fragile': 'Kırılgan', 'Cursed': 'Lanetli', 'Hot': 'Sıcak', 'Component': 'Parça', 'Two-handed': 'İki elli', 'Soulbound': 'Ruha bağlı', 'Key item': 'Anahtar eşya',
  'Empty the bag first.': 'Önce çantayı boşalt.', 'Hotbar full.': 'Hızlı erişim dolu.', 'Does not fit there.': 'Oraya sığmıyor.',
  'Your stuff does not fit in that bag.': 'Eşyaların o çantaya sığmıyor.', 'Wrong slot.': 'Yanlış yuva.', 'Inventory full. [I] to make room.': 'Envanter dolu. Yer açmak için [I].',
  'Too big for a bag. Carry it with the grab beam.': 'Çantaya sığmayacak kadar büyük. Çekim ışınıyla taşı.', 'That does not fit in a bag.': 'Bu çantaya sığmaz.',
  'It is humming. It will not fit in a bag.': 'Vızıldıyor. Çantaya sığmaz.', 'Fold the ladder first.': 'Önce merdiveni katla.',
  'Stashed in bag': 'Çantaya konuldu', 'move': 'taşı', 'quick-move / equip': 'hızlı taşı / kuşan', 'drop': 'yere at', 'to hotbar': 'hızlı erişime',
  'close': 'kapat', 'carried': 'taşınıyor', 'Price': 'Fiyat', 'Stun': 'Sersemletme', 'Scrap': 'Hurda', 'Valuable': 'Değerli', 'Catch': 'Av',
  'Creature drop': 'Yaratık ganimeti', 'Tool': 'Alet', 'Weapon': 'Silah', 'Consumable': 'Sarf', 'Trinket': 'Tılsım', 'Body': 'Ceset', 'Equipped': 'Kuşanıldı', 'DRAG move': 'SÜRÜKLE taşı', 'RMB quick-move / equip': 'SAĞ TIK hızlı taşı / kuşan',
  'SHIFT+CLICK drop': 'SHIFT+TIK yere at', '1-4 to hotbar': '1-4 hızlı erişime', 'I / ESC close': 'I / ESC kapat', 'Drag here to drop': 'Yere atmak için dışarı sürükle',
  'Empty - drag loot here': 'Boş - ganimeti buraya sürükle', 'Wear a bag for more room': 'Daha fazla yer için çanta tak', 'loot weight': 'ganimet ağırlığı',
  'Padded Hoodie': 'Dolgulu Kapüşonlu', 'Riot Vest': 'Çevik Kuvvet Yeleği', 'Kevlar Suit': 'Kevlar Takım', 'Lucky Dongle': 'Şanslı Dongle',
  'Energy Drink Charm': 'Enerji İçeceği Tılsımı', 'Signal Amulet': 'Sinyal Muskası', 'Field Pack': 'Arazi Çantası', 'Hauler Frame': 'Yük Çerçevesi',
  'Void Satchel': 'Boşluk Heybesi', 'Belt Bag': 'Bel Çantası', 'Common': 'Sıradan', 'Uncommon': 'Nadir Olmayan', 'Rare': 'Nadir', 'Epic': 'Destansı',
  'Legendary': 'Efsanevi', 'Mythic': 'Mitik', 'In bag': 'Çantada', 'crew luck': 'ekip şansı', 'crit': 'kritik', 'max stamina': 'maks. dayanıklılık',
  'stamina regen': 'dayanıklılık yenilenmesi', 'scan range': 'tarama menzili', 'battery life': 'pil ömrü', 'move speed': 'hareket hızı',
};

export function installInventory(game) {
  ensureInventoryStyles();
  registerGearModels();
  addTranslations(TR);
  const st = {
    disposed: false, offs: [], ver: 0, weightAt: 0, weightVer: -1, weight: 0,
    rid: 0, waiting: new Map(), pendingStash: new Map(), extraByPeer: new Map(), hostT: 0, beamT: 0, tagT: 0,
    beams: createGlints(game), time: 0, feedEl: null, luckT: -1, luck: 0,
  };
  const items = () => game.items;
  const net = () => game.net;
  const me = () => game.selfId;
  const feedback16 = createInventoryFeedback16(game);
  const bump = () => { st.ver++; };

  // ------------------------------------------------------------------ entries
  const entryOf = (it) => ({ id: it.id, def: it.def, inv: it.inv || null, tier: it.rarity(), it, value: it.value || 0 });
  function listFor(pid) {
    const out = [];
    if (!pid || !items()) return out;
    for (const it of items().all()) if (it.holder === pid) out.push(entryOf(it));
    return out;
  }
  /** my held items as entries (fresh every call: a few hundred items at most, and predictions mutate items directly) */
  function mine() { return game.net ? listFor(me()) : []; }
  const extraCols = () => C.clampInt(Number(game.rpg?.bonus?.('bagSlots')) || 0, 0, C.MAX_EXTRA_COLS);
  const hotCap = () => game.player?.slots?.length || game.config?.inventorySlots || 4;
  const gridNow = (list = mine()) => C.gridOfList(list, extraCols());
  const findEntry = (id, list = mine()) => list.find((e) => e.id === id) || null;

  // ------------------------------------------------------------------ planning (client prediction)
  const fail = (reason) => ({ ok: false, reason });
  const isBagSlot = (iv) => iv?.k === 'eq' && iv.s === 'bag';
  /** try the moves; when the equipped bag changes (swap / unequip / drop) and the stuff no longer fits, repack every
   *  bag item into the new grid. Plain drags never repack (the item must land where it was dropped). */
  function finalize(list, moves, slots = {}, extra = {}, forceRepack = false) {
    let next = C.applyMoves(list, moves);
    let why = C.validateState(next, { extraCols: extraCols(), maxHot: hotCap() });
    const bagChange = forceRepack || moves.some(([id, iv]) => isBagSlot(iv) || isBagSlot(findEntry(id, list)?.inv));
    if (why === 'does not fit' && bagChange) {
      const bagged = next.filter((e) => e.inv?.k === 'bag');
      const lay = C.packLayout(bagged, C.gridOfList(next, extraCols()));
      if (lay) {
        const mv2 = moves.filter(([id]) => !lay.has(id));
        for (const [id, iv] of lay) mv2.push([id, iv]);
        moves = mv2;
        next = C.applyMoves(list, moves);
        why = C.validateState(next, { extraCols: extraCols(), maxHot: hotCap() });
      }
      if (why === 'does not fit') return fail(forceRepack ? t('Empty the bag first.') : t('Your stuff does not fit in that bag.'));
    }
    if (why) return fail(why === 'hotbar full' ? t('Hotbar full.') : why === 'wrong slot' ? t('Wrong slot.') : why === 'not baggable' ? t('That does not fit in a bag.') : t('Does not fit there.'));
    return { ok: true, moves, slots, ...extra };
  }
  /** Where item `id` currently is, as a target-like location. */
  function srcOf(e) {
    if (e.inv) return { ...e.inv };
    return { k: 'hot', i: game.player.slots.indexOf(e.id) };
  }
  /** Move for an occupant that gets displaced into the dragged item's old location (swap). */
  function displaceTo(occ, src, moves, slots) {
    if (src.k === 'hot') { moves.push([occ.id, null]); if (src.i >= 0) slots[occ.id] = src.i; return true; }
    if (src.k === 'eq') { if (!C.fitsSlot(occ.def, src.s)) return false; moves.push([occ.id, { k: 'eq', s: src.s }]); return true; }
    moves.push([occ.id, { k: 'bag', x: src.x, y: src.y }]);
    return true;
  }

  /**
   * Plan moving item `id` to a target: { k:'bag', x, y } | { k:'eq', s } | { k:'hot', i } | { k:'world' }.
   * Returns { ok, moves:[[id, inv|null]], slots:{id: hotbarIndex}, local?, drop?, reason? }.
   */
  function planMove(id, target) {
    const list = mine();
    const e = findEntry(id, list);
    if (!e || !target) return fail(t('Does not fit there.'));
    const p = game.player;
    const src = srcOf(e);
    if (target.k === 'world') {
      const rest = list.filter((x) => x.id !== id);
      if (e.inv?.k === 'eq' && e.inv.s === 'bag' && rest.some((x) => x.inv?.k === 'bag')) {
        const r = finalize(rest, [], {}, {}, true);
        if (!r.ok) return fail(t('Empty the bag first.'));
        return { ok: true, drop: true, moves: r.moves, slots: {} };
      }
      return { ok: true, drop: true, moves: [], slots: {} };
    }
    if (target.k === 'hot') {
      if (target.i < 0 || target.i >= p.slots.length) return fail(t('Does not fit there.'));
      const occId = p.slots[target.i];
      if (occId === id) return { ok: true, moves: [], slots: {}, noop: true };
      if (src.k === 'hot') return { ok: true, local: true, moves: [], slots: { [id]: target.i, ...(occId ? { [occId]: src.i } : {}) } };
      const moves = [[id, null]], slots = { [id]: target.i };
      if (occId) {
        const occ = findEntry(occId, list);
        if (occ && !displaceTo(occ, src, moves, slots)) return fail(t('Does not fit there.'));
        const r = finalize(list, moves, slots);
        if (r.ok || !occ || src.k !== 'bag') return r;
        // occupant does not fit where the item was: any free bag spot
        const next = C.applyMoves(list, [[id, null]]);
        const spot = C.findSpot(next, C.gridOfList(next, extraCols()), C.itemSize(occ.def), occ.id);
        if (!spot) return fail(t('Does not fit there.'));
        return finalize(list, [[id, null], [occ.id, { k: 'bag', ...spot }]], { [id]: target.i });
      }
      return finalize(list, moves, slots);
    }
    if (target.k === 'eq') {
      if (!C.fitsSlot(e.def, target.s)) return fail(t('Wrong slot.'));
      const occ = list.find((x) => x.inv?.k === 'eq' && x.inv.s === target.s);
      if (occ?.id === id) return { ok: true, moves: [], slots: {}, noop: true };
      const moves = [[id, { k: 'eq', s: target.s }]], slots = {};
      if (occ) {
        const tmp = [];
        if (!displaceTo(occ, src, tmp, slots)) {
          // e.g. trinket1 <-> armor can't swap: park the occupant in the bag / hotbar
          const spot = C.findSpot(list, gridNow(list), C.itemSize(occ.def), occ.id);
          if (spot) tmp.push([occ.id, { k: 'bag', ...spot }]); else tmp.push([occ.id, null]);
        }
        moves.push(...tmp);
      }
      const r = finalize(list, moves, slots);
      if (r.ok || !occ || src.k !== 'bag') return r;
      const spot = C.findSpot(C.applyMoves(list, [[id, { k: 'eq', s: target.s }]]), gridNow(list), C.itemSize(occ.def), occ.id);
      return spot ? finalize(list, [[id, { k: 'eq', s: target.s }], [occ.id, { k: 'bag', ...spot }]]) : finalize(list, [[id, { k: 'eq', s: target.s }], [occ.id, null]]);
    }
    if (target.k === 'bag') {
      const why = C.bagRejectReason(e.it);
      if (why) return fail(why);
      const size = C.itemSize(e.def);
      // the grid after this item leaves its old place (moving the equipped bag itself into the grid shrinks it)
      const after = C.applyMoves(list, [[id, null]]);
      const grid = C.gridOfList(after, extraCols());
      const occ = C.buildOcc(after, grid);
      if (!occ) return fail(t('Does not fit there.'));
      const hit = [...C.overlapIds(occ, grid, size, target.x, target.y)];
      const moves = [[id, { k: 'bag', x: target.x, y: target.y }]], slots = {};
      if (hit.length > 1) return fail(t('Does not fit there.'));
      if (hit.length === 1) {
        const o = findEntry(hit[0], list);
        if (o && !displaceTo(o, src, moves, slots)) return fail(t('Does not fit there.'));
        const r = finalize(list, moves, slots, { swap: hit[0] });
        if (r.ok || !o) return r;
        const next = C.applyMoves(list, [[id, { k: 'bag', x: target.x, y: target.y }]]);
        const spot = C.findSpot(next, C.gridOfList(next, extraCols()), C.itemSize(o.def), o.id);
        if (spot) return finalize(list, [[id, { k: 'bag', x: target.x, y: target.y }], [o.id, { k: 'bag', ...spot }]], {}, { swap: hit[0] });
        const free = p.slots.findIndex((s) => !s);
        return free >= 0 ? finalize(list, [[id, { k: 'bag', x: target.x, y: target.y }], [o.id, null]], { [o.id]: free }, { swap: hit[0] }) : fail(t('Does not fit there.'));
      }
      return finalize(list, moves, slots);
    }
    return fail(t('Does not fit there.'));
  }

  /** Apply a plan: predict locally, then ask the host. Returns true when something was sent / done. */
  function applyPlan(plan, { silent = false } = {}) {
    if (!plan?.ok) return false;
    if (plan.noop) return true;
    const p = game.player;
    if (plan.local) {
      for (const [id, i] of Object.entries(plan.slots)) {
        const j = p.slots.indexOf(id);
        if (j >= 0 && j !== i) p.slots[j] = null;
      }
      for (const [id, i] of Object.entries(plan.slots)) p.slots[i] = id;
      game.sfx?.('inventory_switch', 0.35);
      game.refreshHeldVisuals?.();
      bump();
      return true;
    }
    if (!plan.moves.length) return true;
    let eqChanged = false;
    for (const [id, iv] of plan.moves) {
      const it = items().get(id);
      if (!it) continue;
      if (iv && it.on) game.setItemOn?.(it, false);
      if (iv?.k === 'eq' || it.inv?.k === 'eq') eqChanged = true;
      it.inv = iv ? { ...iv } : null;
      const j = p.slots.indexOf(id);
      if (iv && j >= 0) p.slots[j] = null;
    }
    for (const [id, i] of Object.entries(plan.slots || {})) {
      if (items().get(id)?.inv) continue;
      const j = p.slots.indexOf(id);
      if (j >= 0) p.slots[j] = null;
      if (!p.slots[i]) p.slots[i] = id;
    }
    st.lastReq = performance.now();
    net()?.request('inv', { op: 'set', mv: plan.moves.map(([id, iv]) => [id, iv || null]), bx: extraCols(), hs: hotCap() });
    bump();
    reconcile();
    if (!silent) game.sfx?.(eqChanged ? 'cloth_rustle' : 'inventory_switch', eqChanged ? 0.5 : 0.4);
    if (eqChanged) { game.refreshStats?.(); for (const [id, iv] of plan.moves) if (iv?.k === 'eq') game.mods?.emit('tfg:equip', iv.s, items().get(id) || null, game); }
    return true;
  }
  function doMove(id, target) {
    const plan = planMove(id, target);
    if (!plan.ok) { api.flash?.(plan.reason); return false; }
    if (plan.drop) {
      const it = items().get(id);
      if (!it) return false;
      if (plan.moves.length) applyPlan({ ok: true, moves: plan.moves, slots: {} }, { silent: true });
      game.dropItem?.(it, false);
      bump();
      return true;
    }
    return applyPlan(plan);
  }

  /** RMB / double click: equip gear, unequip to bag, bag -> hotbar, hotbar -> bag. */
  function quickMove(id) {
    const list = mine();
    const e = findEntry(id, list);
    if (!e) return false;
    const p = game.player;
    if (e.inv?.k === 'eq') {
      const after = C.applyMoves(list, [[id, null]]);
      const spot = C.findSpot(after, C.gridOfList(after, extraCols()), C.itemSize(e.def), id);
      if (spot) { const r = planMove(id, { k: 'bag', ...spot }); if (r.ok) return applyPlan(r); }
      const free = p.slots.findIndex((s) => !s);
      if (free >= 0) return doMove(id, { k: 'hot', i: free });
      api.flash?.(t('Hotbar full.'));
      return false;
    }
    if (C.isEquippable(e.def)) {
      const occ = {};
      for (const x of list) if (x.inv?.k === 'eq') occ[x.inv.s] = x.id;
      return doMove(id, { k: 'eq', s: C.slotFor(e.def, occ) });
    }
    if (e.inv?.k === 'bag') {
      const free = p.slots.findIndex((s) => !s);
      if (free < 0) { api.flash?.(t('Hotbar full.')); return false; }
      return doMove(id, { k: 'hot', i: free });
    }
    const why = C.bagRejectReason(e.it);
    if (why) { api.flash?.(why); return false; }
    const spot = C.findSpot(list, gridNow(list), C.itemSize(e.def), id);
    if (!spot) { api.flash?.(t('Does not fit there.')); return false; }
    return doMove(id, { k: 'bag', ...spot });
  }

  function sortBag() {
    const list = mine();
    const bagged = list.filter((e) => e.inv?.k === 'bag');
    if (!bagged.length) return false;
    const lay = C.packLayout(bagged, gridNow(list));
    if (!lay) return false;
    const moves = [];
    for (const [id, iv] of lay) if (!C.sameInv(findEntry(id, list)?.inv, iv)) moves.push([id, iv]);
    if (!moves.length) return true;
    return applyPlan({ ok: true, moves, slots: {} });
  }

  // ------------------------------------------------------------------ client: pickups / stash
  function pickTargetHint(it) {
    const p = game.player;
    if (!p || !it || it.state !== 'world') return false;
    const held = p.heldItem();
    const handsFull = held && held.def.hands === 2;
    const hotFull = p.slots[p.slot] && p.slots.every((s) => s);
    if (!handsFull && !hotFull && !(it.def.hands === 2 && p.slots[p.slot] && p.slots.every((s) => s))) return false;
    if (C.bagRejectReason(it)) return false;
    return !!C.findSpot(mine(), gridNow(), C.itemSize(it.def));
  }
  /** E on a world item with a full hotbar: predicted pick straight into the bag. */
  function pickToBag(it) {
    if (!it || it.state !== 'world' || C.bagRejectReason(it)) return false;
    const list = mine();
    const spot = C.findSpot(list, gridNow(list), C.itemSize(it.def));
    if (!spot) return false;
    const iv = { k: 'bag', x: spot.x, y: spot.y };
    it.predFrom = { p: it.obj.position.clone(), q: it.obj.quaternion.clone() };
    it.setHeld(me());
    it.inv = iv;
    it.predicted = true;
    it.obj.visible = false;
    game.sfx?.('item_pickup', 0.6, 0.9);
    st.lastReq = performance.now();
    net()?.request('inv', { op: 'pick', id: it.id, to: iv, bx: extraCols(), hs: hotCap() });
    bump();
    if (it.nest) game.ui?.toast(t('Something is angry...'), 'bad');
    return true;
  }
  /** A held item with no hotbar room (crafted / reclaimed / host spawn): into the bag if it fits. */
  function stashOrDrop(it) {
    if (!it || it.holder !== me()) return true;
    if (it.inv || game.player.slots.includes(it.id)) return true;
    const last = st.pendingStash.get(it.id);
    if (last && performance.now() - last < 3000) return true;
    if (C.bagRejectReason(it)) return false;
    const list = mine();
    const spot = C.findSpot(list, gridNow(list), C.itemSize(it.def), it.id);
    if (!spot) return false;
    st.pendingStash.set(it.id, performance.now());
    return applyPlan({ ok: true, moves: [[it.id, { k: 'bag', ...spot }]], slots: {} }, { silent: true });
  }
  /** Keep p.slots consistent with host state: stashed ids leave the hotbar, orphaned hotbar items get a slot. */
  function reconcile() {
    const p = game.player;
    if (!p || !game.net) return;
    const self = me();
    for (let i = 0; i < p.slots.length; i++) {
      const id = p.slots[i];
      if (!id) continue;
      const it = items().get(id);
      if (!it || it.holder !== self || it.inv) p.slots[i] = null;
    }
    for (const it of items().all()) {
      if (it.holder !== self || it.inv || p.slots.includes(it.id)) continue;
      const free = p.slots.findIndex((s) => !s);
      if (free >= 0) { p.slots[free] = it.id; continue; }
      if (!stashOrDrop(it)) game.dropItem?.(it, false);
    }
    game.refreshHeldVisuals?.();
  }
  /** Bag contents outside the grid (bag dropped by an old client, passive-tree bag columns removed...): repack, and
   *  drop whatever still does not fit. Only after the state stayed invalid for 2 checks with no request in flight
   *  (a host confirmation of an older move can make a newer prediction overlap for a moment). */
  function healBag() {
    if (st.healing || game.player?.dead) return;
    const list = listFor(me());
    const grid = C.gridOfList(list, extraCols());
    if (C.buildOcc(list, grid) || performance.now() - (st.lastReq || 0) < 2000) { st.badChecks = 0; return; }
    if (++st.badChecks < 2) return;
    st.badChecks = 0;
    st.healing = true;
    try {
      const bagged = list.filter((e) => e.inv?.k === 'bag').sort(C.sortCompare);
      const keep = [];
      for (const e of bagged) if (C.packLayout([...keep, e], grid)) keep.push(e); else game.dropItem?.(e.it, false);
      const lay = C.packLayout(keep, grid);
      if (lay) applyPlan({ ok: true, moves: [...lay.entries()], slots: {} }, { silent: true });
    } finally { st.healing = false; }
  }

  // ------------------------------------------------------------------ events from ItemManager
  function onInvEvent(d) {
    bump();
    if (d.h !== me()) return;
    reconcile();
    feedback16.changed();
    game.refreshStats?.();
    if (d.full && d.why) api.flash?.(d.why === 'hotbar full' ? t('Hotbar full.') : t('Does not fit there.'));
    game.mods?.emit('tfg:invChanged', game);
  }
  function onHeld(it, d) {
    bump();
    it.reclaim = null;
    if (d.h !== me()) return;
    st.pendingStash.delete(it.id);
    feed(it, !!it.inv);
    feedback16.confirmed(it);
    if (it.inv?.k === 'eq') game.refreshStats?.();
    game.mods?.emit('tfg:invChanged', game);
  }

  // ------------------------------------------------------------------ host
  const posOfPeer = (pid) => (pid === game.selfId ? game.player.pos : (game.remotes.get(pid)?.lastUpdate ? game.remotes.get(pid).target : game.remotes.get(pid)?.pos));
  const pidOf = (peer) => (peer === game.selfId ? game.profile?.id : game.net?.players.get(peer)?.pid || null);
  function hostResync(from, why) {
    net().sendTo(from, 'it', { e: 'inv', h: from, mv: listFor(from).map((e) => [e.id, e.inv]), full: 1, why });
  }
  function hostCheck(from, next, d) {
    const bx = C.clampInt(d?.bx ?? st.extraByPeer.get(from) ?? 0, 0, C.MAX_EXTRA_COLS);
    st.extraByPeer.set(from, bx);
    const hs = C.clampInt(d?.hs ?? (game.config?.inventorySlots || 4), 1, C.MAX_HOTBAR);
    return C.validateState(next, { extraCols: bx, maxHot: hs });
  }
  function hostInv(d, from) {
    if (!d || typeof d !== 'object' || !from || String(from).startsWith('c:')) return;
    const I = items();
    if (d.op === 'set') {
      const raw = Array.isArray(d.mv) ? d.mv.slice(0, 96) : [];
      const cur = listFor(from);
      const ids = new Set(cur.map((e) => e.id));
      const mv = [];
      for (const m of raw) if (Array.isArray(m) && typeof m[0] === 'string' && ids.has(m[0])) mv.push([m[0], C.normalizeInv(m[1])]);
      if (!mv.length) { hostResync(from, 'nothing to move'); return; }
      const why = hostCheck(from, C.applyMoves(cur, mv), d);
      if (why) { hostResync(from, why); return; }
      const out = mv.filter(([id, iv]) => !C.sameInv(I.get(id)?.inv, iv));
      for (const [id, iv] of out) { const it = I.get(id); if (iv && it?.on) { it.on = false; net().broadcast('itst', { id, on: false }); } }
      net().broadcast('it', { e: 'inv', h: from, mv: out.length ? out : mv });
    } else if (d.op === 'pick') {
      const it = I.get(d.id);
      const pfail = () => net().sendTo(from, 'pickfail', it && it.state === 'world' ? { id: d.id, p: it.obj.position.toArray(), q: it.obj.quaternion.toArray() } : { id: d.id });
      // (the host's own prediction already marked it held by the host)
      if (!it || it.carrier || (it.state !== 'world' && it.holder !== from) || (it.owner && it.owner !== from) || it.ladder) { pfail(); return; }
      const pp = posOfPeer(from);
      if (pp && pp.distanceTo(it.obj.position) > 7) { pfail(); return; }
      const iv = C.normalizeInv(d.to);
      if (!iv || (iv.k === 'bag' && C.bagRejectReason({ def: it.def, type: it.type })) || (iv.k === 'eq' && !C.fitsSlot(it.def, iv.s))) { pfail(); return; }
      if (hostCheck(from, [...listFor(from).filter((e) => e.id !== it.id), { ...entryOf(it), inv: iv }], d)) { pfail(); return; }
      it.lastHolder = from;
      net().broadcast('it', { e: 'held', id: it.id, h: from, iv });
    } else if (d.op === 'consume') {
      const ty = String(d.ty || ''), n = C.clampInt(d.n ?? 1, 1, 50);
      const have = listFor(from).filter((e) => e.it.type === ty && !e.it.soulbound && e.inv?.k !== 'eq')
        .sort((a, b) => (a.inv ? 0 : 1) - (b.inv ? 0 : 1) || tierIndex(a.tier) - tierIndex(b.tier) || a.value - b.value);
      const ok = have.length >= n;
      if (ok) for (let i = 0; i < n; i++) net().broadcast('it', { e: 'rm', id: have[i].id });
      net().sendTo(from, 'invr', { rid: d.rid, ok });
    }
  }
  /** Host: location for a new item spawned into a holder's inventory (hostSpawn opts.inv). */
  function hostPlaceFor(holder, def, want) {
    const list = listFor(holder);
    const bx = st.extraByPeer.get(holder) ?? (holder === game.selfId ? extraCols() : 0);
    const tryIv = (iv) => (iv && !C.validateState([...list, { id: '_new', def, inv: iv, tier: 'common' }], { extraCols: bx, maxHot: C.MAX_HOTBAR }) ? iv : null);
    if (want && typeof want === 'object') { const iv = tryIv(C.normalizeInv(want)); if (iv) return iv; }
    if (want === 'eq' || (want && typeof want === 'object' && want.k === 'eq')) {
      const occ = {}; for (const e of list) if (e.inv?.k === 'eq') occ[e.inv.s] = e.id;
      const s = C.slotFor(def, occ);
      const iv = s && !occ[s] ? tryIv({ k: 'eq', s }) : null;
      if (iv) return iv;
    }
    const spot = C.findSpot(list, C.gridOfList(list, bx), C.itemSize(def));
    return spot ? tryIv({ k: 'bag', ...spot }) : null;
  }
  /** Host loot luck for tier rolls: balance module + moon danger + the crew's equipped luck trinkets. */
  function hostLootLuck() {
    if (st.luckT === game.time) return st.luck;
    let crew = 0;
    for (const it of items().all()) {
      if (!it.holder || it.inv?.k !== 'eq' || !it.def.gear?.luck || String(it.holder).startsWith('c:')) continue;
      crew += it.def.gear.luck * (TIERS[it.rarity()]?.statMul || 1);
    }
    const run = game.run || {};
    const danger = game.hostData?.danger ?? ((MOONS[run.moon]?.tier || 1) + (run.quotaIndex || 0) * 0.35);
    let bal = 0;
    try { bal = Number(game.balance?.lootLuck?.()) || 0; } catch { bal = 0; }
    try { crew += Number(game.rpg?.crewLootLuck?.()) || 0; } catch { /* rpg module absent */ }   // Scavenger's Luck & tree lootLuck nodes
    st.luck = C.lootLuck({ balance: bal, danger, crewLuck: crew });
    st.luckT = game.time;
    return st.luck;
  }
  /** Host: give a (re)joining player the items they had in their bag / equipment / hotbar (saved or left behind). */
  function hostReclaim(peer, pid) {
    if (!game.isHost || !pid || !items()) return 0;
    const order = (it) => (it.reclaim.iv?.k === 'eq' ? (it.reclaim.iv.s === 'bag' ? 0 : 1) : it.reclaim.iv?.k === 'bag' ? 2 : 3);
    const cands = [...items().all()].filter((it) => it.reclaim?.pid === pid && it.state === 'world' && !it.carrier && !it.owner && insideShip(it.obj.position))
      .sort((a, b) => order(a) - order(b));
    let n = 0;
    for (const it of cands) {
      const list = listFor(peer);
      const bx = st.extraByPeer.get(peer) ?? 0;
      const ok = (iv) => !C.validateState([...list, { ...entryOf(it), inv: iv }], { extraCols: bx, maxHot: game.config?.inventorySlots || 4 });
      let iv = it.reclaim.iv;
      if (iv && !ok(iv)) {
        iv = null;
        const spot = C.bagRejectReason(it) ? null : C.findSpot(list, C.gridOfList(list, bx), C.itemSize(it.def));
        if (spot && ok({ k: 'bag', ...spot })) iv = { k: 'bag', ...spot };
      }
      if (!iv && !ok(null)) continue;   // no room anywhere: it stays in the ship
      it.reclaim = null;
      it.lastHolder = peer;
      net().broadcast('it', { e: 'held', id: it.id, h: peer, iv: iv || undefined });
      n++;
    }
    return n;
  }
  function hostOnLeave(peer, info) {
    if (!game.isHost || !info?.pid) return;
    for (const it of items().all()) if (it.state === 'world' && it.dropHolder === peer) it.reclaim = { pid: info.pid, iv: it.dropInv || null };
  }
  /** Host: extra gear loot on every moon (tiered), plus a small chance of a Void Satchel deep inside. */
  function hostMoonLoot() {
    const run = game.run, fac = game.world.facility;
    if (!run || !fac?.scrapSpots?.length) return;
    const rng = new RNG(((run.seed ^ 0x9ea5) >>> 0) || 7);
    const danger = game.hostData?.danger ?? 1;
    const spots = rng.shuffle(fac.scrapSpots.slice()).sort((a, b) => (b.dist || 0) - (a.dist || 0));
    let n = (rng.chance(0.6) ? 1 : 0) + (rng.chance(0.3) ? 1 : 0) + (danger >= 2.5 && rng.chance(0.45) ? 1 : 0);
    n = Math.min(n, spots.length);
    const table = GEAR_LOOT.map(([id, w]) => ({ id, w })).filter((e) => ITEMS[e.id]);
    for (let i = 0; i < n; i++) {
      const s = spots[Math.min(spots.length - 1, i * 2 + rng.int(0, 2))];
      items().hostSpawn(rng.weighted(table).id, new THREE.Vector3(s.x + rng.float(-0.3, 0.3), s.y + 0.5, s.z + rng.float(-0.3, 0.3)), { valueMul: 1, rollTier: true });
    }
    if (ITEMS.bag_void && rng.chance(VOID_CHANCE(danger))) {
      const s = (fac.vaultSpots?.length ? rng.pick(fac.vaultSpots) : spots[0]);
      if (s) items().hostSpawn('bag_void', new THREE.Vector3(s.x, s.y + 0.5, s.z), { valueMul: 1 });
    }
  }

  // ------------------------------------------------------------------ loot feed (left dock)
  function feed(it, toBag) {
    try {
      if (!st.feedEl?.isConnected) { st.feedEl = hudDock('left', 'tfg-inv-feed', 30); st.feedEl.classList.add('tinv-feed'); }
      const tier = it.rarity();
      const tiered = !!(it.tier || it.affix || it.def.value || it.def.tier) && tier !== 'common';
      const line = document.createElement('div');
      line.className = 'tinv-feed-line' + (tiered ? ' tier-' + tier : '');
      line.style.setProperty('--tc', tiered ? TIERS[tier].color : '#cfc6b8');
      const name = affixDisplayName(t(it.def.name), it.affix, it);
      const val = isSellable(it.def) && it.value ? ` ▮${it.value}` : '';
      line.innerHTML = `${iconHTML(it.type, 'ico')}<span><b>${escapeHtml(name)}</b>${tiered ? `<i>${escapeHtml(t(TIERS[tier].name))}</i>` : ''}<i>${escapeHtml(val)}${' · ' + escapeHtml(feedback16.location(it))}</i></span>`;
      st.feedEl.appendChild(line);
      while (st.feedEl.children.length > 4) st.feedEl.firstChild.remove();
      setTimeout(() => line.classList.add('out'), 3600);
      setTimeout(() => line.remove(), 4200);
      if (tierIndex(tier) >= tierIndex('epic') && tiered) game.sfx?.('ui_notify', 0.45, tier === 'mythic' ? 0.7 : 0.85);
    } catch (e) { console.warn('[inventory] feed', e); }
  }

  // ------------------------------------------------------------------ world tier glint (rare+ rolled items; affixed weapons keep loot.js glints)
  // [heroprops] was a tall additive pillar that read through walls; now a small periodic star on the item + a faint floor ring within 6 m / line of sight (game/lootglint.js)
  function updateBeams(dt) {
    st.time += dt;
    st.beamT -= dt;
    const I = items();
    if (!I) return;
    if (st.beamT <= 0) {
      st.beamT = 0.4;
      for (const it of I.all()) {
        if (!it.tier || it.affix || it.state !== 'world' || st.beams.has(it.id) || tierIndex(it.tier) < tierIndex('rare') || it.obj.parent !== game.scene) continue;
        st.beams.add(it.id, TIERS[it.tier].hex, it.tier);
      }
    }
    st.beams.update(dt);
  }
  function clearBeams() { st.beams.clear(); }

  // ------------------------------------------------------------------ per frame
  function update(dt) {
    if (st.disposed || !game.net) return;
    updateBeams(dt);
    // hotbar [I] tag
    st.tagT -= dt;
    if (st.tagT <= 0) {
      st.tagT = 0.5;
      const list = mine();
      const g = gridNow(list);
      const used = C.usedCells(list), cap = g.cols * g.rows;
      const bag = C.bagEntryOf(list);
      game.ui?.hud?.setBagTag?.(game.player.dead ? null : { used, cap, full: used >= cap, label: bag ? t('BAG') : t('Pockets').toLocaleUpperCase(getLang()) });
    }
    st.healT = (st.healT || 0) - dt;
    if (st.healT <= 0) { st.healT = 1; healBag(); }
    if (game.isHost) {
      st.hostT -= dt;
      if (st.hostT <= 0) {
        st.hostT = 1;
        for (const it of items().all()) if (it.bag?.length && it.type === 'beltbag') items().tools?.hostDumpLegacyBag?.(it);
      }
    }
    panel.update(dt);
  }

  // ------------------------------------------------------------------ panel + key
  const panel = new InventoryPanel(game, null);
  const onKey = (e) => {
    if (e.code !== (game.settings?.keys?.inventory || INVENTORY_KEY) || e.repeat || st.disposed || game.destroyed || !game.run || !game.net) return;
    if (game.input?.isTyping?.() || game.minigame || game.terminal?.active || game.ui?.chatOpen) return;
    const ui = game.ui;
    if (ui?.panelOpen && ui.panelOpen !== panel.el) return;
    if (game.player?.dead) return;
    e.preventDefault();
    api.toggle();
  };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);

  // ------------------------------------------------------------------ api
  const api = {
    appliesTierDamage: true,   // actions.js tierDmg owns weapon tier damage; crafting/shop wrappers stand down
    // ---- soft interface ----
    open() { if (!game.player?.dead && game.net) panel.open(); return api.isOpen(); },
    close() { panel.close(); },
    toggle() { if (api.isOpen()) api.close(); else api.open(); },
    isOpen() { return panel.isOpen(); },
    bagItems() { return mine().filter((e) => e.inv?.k === 'bag').map((e) => e.it); },
    hasItem(type) { return api.countItem(type) > 0; },
    countItem(type) { return mine().filter((e) => e.it.type === type && e.inv?.k !== 'eq').length; },
    consume(type, n = 1) {
      n = C.clampInt(n, 1, 50);
      if (!game.net || api.countItem(type) < n) return Promise.resolve(false);
      const rid = ++st.rid;
      return new Promise((resolve) => {
        st.waiting.set(rid, resolve);
        setTimeout(() => { if (st.waiting.delete(rid)) resolve(false); }, 5000);
        net().request('inv', { op: 'consume', ty: type, n, rid });
      });
    },
    addToBag(itemId) {
      const it = items()?.get(itemId);
      if (!it) return false;
      if (it.state === 'world') return pickToBag(it);
      if (it.holder !== me()) return false;
      if (it.inv?.k === 'bag') return true;
      const why = C.bagRejectReason(it);
      if (why) return false;
      const list = mine();
      const spot = C.findSpot(list, gridNow(list), C.itemSize(it.def), it.id);
      if (!spot) return false;
      const plan = planMove(it.id, { k: 'bag', ...spot });
      return plan.ok ? applyPlan(plan, { silent: true }) : false;
    },
    equipped(slot) {
      const s = slot === 'trinket' ? null : slot === 'suit' ? 'armor' : slot;
      const e = mine().find((x) => x.inv?.k === 'eq' && (s ? x.inv.s === s : C.SLOT_KIND[x.inv.s] === 'trinket'));
      return e?.it || null;
    },
    bagSize() { const g = gridNow(); return { cols: g.cols, rows: g.rows }; },
    // ---- extras (panel / actions / other modules) ----
    entries: () => mine(), grid: () => gridNow(), hotCap, extraCols, planMove, doMove, quickMove, sortBag, applyPlan,
    pickToBag, stashOrDrop, pickTargetHint, reconcile, onInvEvent, onHeld,
    /** every 'it' event (ItemManager.onEvent, before it is applied): cache version + stats when my gear may change */
    onItemEvent(d) {
      bump();
      const self = me();
      if (!self || !d) return;
      if ((d.e === 'sp' && d.h === self && d.iv?.k === 'eq') || ((d.e === 'drop' || d.e === 'rm') && items()?.get(d.id)?.holder === self && items().get(d.id).inv?.k === 'eq')) game.refreshStats?.();
    },
    equip(itemId) { const e = findEntry(itemId); if (!e || !C.isEquippable(e.def)) return false; return quickMove(itemId); },
    /** carried weight of bag contents (x bag weightMul) + worn gear; cached (called every frame by LocalPlayer) */
    stashedWeight() {
      if (!game.net) return 0;
      const now = performance.now();
      if (st.weightVer === st.ver && now - st.weightAt < 250) return st.weight;
      st.weight = C.stashedWeight(mine(), extraCols());
      st.weightAt = now; st.weightVer = st.ver;
      return st.weight;
    },
    equipBonuses: () => C.equipBonuses(mine()),
    hostLootLuck, hostPlaceFor, hostReclaim,
    /** host.js hostSave hook: extra fields for a saved ship item */
    saveFields(it) {
      const out = {};
      if (it?.tier) out.tr = it.tier;
      if (it?.plus) out.pl = it.plus;   // [forge] +N and overclocks survive saves
      if (it?.oc?.length) out.oc = [...it.oc];
      if (it?.dur != null) out.du = Math.round(it.dur * 10) / 10;   // [durability] wear + full-repair count survive saves
      if (it?.dr) out.dr = it.dr;
      const holder = it?.holder && !String(it.holder).startsWith('c:') ? it.holder : null;
      const pid = holder ? pidOf(holder) : it?.reclaim?.pid;
      if (pid) out.rc = { pid, iv: holder ? (it.inv ? { ...it.inv } : null) : (it.reclaim?.iv || null) };
      return out;
    },
    /** host.js hostInit restore hook: fields to pass through into the 'sp' event */
    loadFields(s) { return { tr: s?.tr, rc: s?.rc, pl: s?.pl, oc: s?.oc, du: s?.du, dr: s?.dr }; },   // [forge] pl / oc  [durability] du / dr
    flash: (msg) => panel.flash(msg),
    debug: () => ({ beams: st.beams.size, ver: st.ver, luck: st.luck }),
    dispose() {
      if (st.disposed) return;
      st.disposed = true;
      feedback16.dispose();
      for (const off of st.offs) off?.();
      st.offs.length = 0;
      if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
      panel.dispose();
      clearBeams();
      st.beams.dispose();
      st.feedEl?.remove();
      game.ui?.hud?.setBagTag?.(null);
      for (const r of st.waiting.values()) r(false);
      st.waiting.clear();
    },
  };
  panel.api = api;

  // ------------------------------------------------------------------ wiring
  const mods = game.mods;
  if (mods?.on) {
    st.offs.push(mods.on('netReady', (n, g) => {
      if (g !== game) return;
      n.on_('invr', (d, from) => {
        if (from !== n.hostId && !(n.isHost && from === n.selfId)) return;
        const r = st.waiting.get(d?.rid);
        if (r) { st.waiting.delete(d.rid); r(!!d.ok); }
      });
      st.offs.push(n.on('peerLeave', (id, info) => { try { hostOnLeave(id, info); } catch (e) { console.warn('[inventory] leave', e); } }));
    }));
    st.offs.push(mods.on('registerHandlers', (H, g) => { if (g === game) H('inv', (d, from) => hostInv(d, from)); }));
    st.offs.push(mods.on('update', (dt, g) => { if (g === game) update(dt); }));
    st.offs.push(mods.on('stats', (s, g) => {
      if (g !== game || !game.net) return;
      const b = C.equipBonuses(listFor(me()));
      s.armor = (s.armor || 0) + b.armor;
      s.speedMul = Math.max(0.5, (s.speedMul || 1) + b.speed);
      s.crit = (s.crit || 0) + b.crit;
      s.maxStamina = Math.round((s.maxStamina || 100) + b.stamina);
      s.staminaRegen = (s.staminaRegen || 16) * (1 + b.regenPct);
      s.scanRange = (s.scanRange || 22) + b.scan;
      s.batteryMul = (s.batteryMul || 1) + b.battery;
      s.lootLuck = (s.lootLuck || 0) + b.luck;
    }));
    st.offs.push(mods.on('useItem', (it, hk, g) => {
      if (g !== game || !it || hk.handled || !C.isEquippable(it.def)) return;
      hk.handled = true;
      api.equip(it.id);
    }));
    st.offs.push(mods.on('hostStart', (g) => { if (g === game) { const n = hostReclaim(game.selfId, game.profile?.id); if (n) game.ui?.toast(tf('Back in your inventory: {n}', { n }), 'info'); } }));
    st.offs.push(mods.on('playerJoin', (id, info, g) => { if (g === game && info?.pid) game.later(() => hostReclaim(id, info.pid), 1500); }));
    st.offs.push(mods.on('moonPopulated', (g) => { if (g === game) { try { hostMoonLoot(); } catch (e) { console.warn('[inventory] moon loot', e); } } }));
    st.offs.push(mods.on('phase', (ph, g) => { if (g === game) { bump(); if (ph === 'orbit' || ph === 'landing') clearBeams(); } }));
    st.offs.push(mods.on('localDeath', (c, g) => { if (g === game) panel.close(); }));
    st.offs.push(mods.on('sessionEnd', (g) => { if (g === game) api.dispose(); }));
  }
  // terminal: INVENTORY lists what you carry (handy for testing / over voice)
  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  if (mm?.commands && !mm.commands.has('inventory')) {
    const cmd = {
      help: 'List your hotbar, bag and equipment.',
      fn: (rest, term) => {
        const list = mine();
        const g = gridNow(list);
        const lines = [`BAG ${g.cols}x${g.rows}  used ${C.usedCells(list)}/${g.cols * g.rows}  stashed ${Math.round(api.stashedWeight())} lb`];
        for (const e of list) lines.push(`  ${(e.inv ? (e.inv.k === 'eq' ? e.inv.s.toUpperCase() : `bag ${e.inv.x},${e.inv.y}`) : 'hotbar').padEnd(10)} ${(TIERS[e.tier]?.name || '').padEnd(9)} ${e.def.name}${e.value ? '  ▮' + e.value : ''}`);
        term.print(lines.join('\n'));
      },
    };
    mm.commands.set('inventory', cmd);
    st.offs.push(() => { if (mm.commands.get('inventory') === cmd) mm.commands.delete('inventory'); });
  }
  return api;
}

