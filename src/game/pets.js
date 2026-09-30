// PET SYSTEM (module `pets`, docs/wave2/pets.md). Installed with `this.useModule('pets', installPets)`.
// [finish] wave 3: pets_sim.js (host brain) + pets_net.js (net, views, marks, carrier) now run fetch / attack / guard / role abilities and show every pet to the crew.
// STATE OF THE FIRST CUT (details in the doc): profile data + rules (pets_core.js), 9 procedural species with 3 evolution stages + shiny + skins
// (models/pets.js), the PET panel (N), eggs -> incubator (hatch after N game days), HQ pet shop, capture odds, terminal PETS, and a CLIENT-SIDE
// follower that shows your active pet next to you. NOT DONE YET: host-simulated fetch / attack / guard / role abilities and net sync of pets to the crew
// (the rules, stats and ability numbers for them already live in pets_core.js petStats()).
import * as THREE from 'three';
import { registerItem, ITEMS } from './items.js';
import { addTranslations, t, tf } from '../core/i18n.js';
import { createPetModel } from '../models/pets.js';
import * as C from './pets_core.js';
import { createPetsPanel } from '../ui/panels/pets.js';
import { installPetsNet } from './pets_net.js';
import { installIncubator } from './pets_incubator.js';   // [finish] host sim + net sync

const EGG_ITEM_DEFS = [
  { id: 'pet_egg_common', name: 'Pet Egg (Spotted)', kind: 'tool', weight: 2, hands: 1, price: 120, shop: 'pets', tip: 'Put it in the ship incubator (PET panel, N). Hatches after 2 game days.' },
  { id: 'pet_egg_wild', name: 'Pet Egg (Wild)', kind: 'tool', weight: 2, hands: 1, price: 260, shop: 'pets', tip: 'A wild egg. Hatches after 3 game days: bear, owl, parrot, crow or fox.' },
  { id: 'pet_egg_glitch', name: 'Pet Egg (Glitch)', kind: 'tool', weight: 2, hands: 1, noShop: true, tip: 'A glitched egg from a chest or a boss. Digital pets hatch from it.' },
  { id: 'pet_carrier', name: 'Pet Carrier', kind: 'tool', weight: 3, hands: 1, price: 150, shop: 'pets', tip: 'Aim at a small creature below 25% HP and use it to try to catch it. Odds depend on its tier.' },
  { id: 'pet_treat', name: 'Pet Treat', kind: 'tool', weight: 0.5, hands: 1, price: 12, shop: 'pets', tip: 'Feed it to your pet (interact) for loyalty.' },
];
for (const d of EGG_ITEM_DEFS) if (!ITEMS[d.id]) { try { registerItem(d); } catch (e) { console.warn('[pets] item', d.id, e); } }

const TR = {
  PETS: 'EVCİL HAYVANLAR', 'PET STABLE': 'AHIR', Stable: 'Ahır', Nest: 'Yuva', Skins: 'Görünüm', Shop: 'Dükkan', Active: 'Aktif', 'Set active': 'Aktif yap', Rename: 'İsim ver', Release: 'Bırak',
  Level: 'Seviye', Loyalty: 'Sadakat', Trait: 'Özellik', Abilities: 'Yetenekler', Evolution: 'Evrim', Close: 'Kapat', Buy: 'Satın al', Equip: 'Kuşan', Owned: 'Sahip', Locked: 'Kilitli',
  'The stable is full.': 'Ahır dolu.', 'Not enough Clout.': 'Yeterli Clout yok.', 'Not sold here.': 'Burada satılmıyor.', 'Pet Shop (HQ only)': 'Evcil Dükkanı (sadece HQ)',
  'Incubator': 'Kuluçka', 'Put egg in incubator': 'Yumurtayı kuluçkaya koy', 'An egg hatched!': 'Bir yumurta çatladı!', 'is ready again.': 'yeniden hazır.', Shiny: 'Parlak',
  'Use the egg inside the ship.': 'Yumurtayı gemide kullan.', 'The incubator is full.': 'Kuluçka dolu.', 'Incubating': 'Kuluçkada', 'day(s) left': 'gün kaldı', Empty: 'Boş',
  Cat: 'Kedi', Dog: 'Köpek', Fox: 'Tilki', Bear: 'Ayı', 'Bee Swarm': 'Arı Sürüsü', Owl: 'Baykuş', Parrot: 'Papağan', Crow: 'Karga', 'Tamagotchi-bot': 'Tamagotchi-bot',
  Scout: 'Gözcü', Fetch: 'Getirici', Thief: 'Hırsız', Tank: 'Tank', Swarm: 'Sürü', Vision: 'Görüş', Decoy: 'Yem', Collector: 'Toplayıcı', Support: 'Destek',
  Collars: 'Tasmalar', Hats: 'Şapkalar', Colours: 'Renkler', Seasonal: 'Sezonluk', 'Pet Egg (Spotted)': 'Evcil Yumurtası (Benekli)', 'Pet Egg (Wild)': 'Evcil Yumurtası (Vahşi)', 'Pet Egg (Glitch)': 'Evcil Yumurtası (Glitch)', 'Pet Carrier': 'Evcil Taşıyıcı', 'Pet Treat': 'Evcil Ödülü',
  Follow: 'Takip', Stay: 'Bekle',
};
const RU = {
  PETS: 'ПИТОМЦЫ', Stable: 'Стойло', Nest: 'Гнездо', Skins: 'Скины', Shop: 'Магазин', Active: 'Активный', 'Set active': 'Сделать активным', Rename: 'Переименовать', Release: 'Отпустить',
  Level: 'Уровень', Loyalty: 'Верность', Trait: 'Черта', Abilities: 'Способности', Evolution: 'Эволюция', Close: 'Закрыть', Buy: 'Купить', Equip: 'Надеть', Owned: 'Есть', Locked: 'Закрыто',
  'The stable is full.': 'Стойло заполнено.', 'Not enough Clout.': 'Не хватает Clout.', Cat: 'Кот', Dog: 'Собака', Fox: 'Лиса', Bear: 'Медведь', 'Bee Swarm': 'Рой пчёл', Owl: 'Сова', Parrot: 'Попугай', Crow: 'Ворона',
  'Tamagotchi-bot': 'Тамагочи-бот', 'An egg hatched!': 'Яйцо проклюнулось!', Shiny: 'Сияющий', Incubator: 'Инкубатор', 'Pet Carrier': 'Переноска', 'Pet Treat': 'Лакомство', 'Pet Egg (Spotted)': 'Яйцо питомца (пятнистое)',
  'Pet Egg (Wild)': 'Яйцо питомца (дикое)', 'Pet Egg (Glitch)': 'Яйцо питомца (глюк)',
};
addTranslations(TR, 'tr');
addTranslations(RU, 'ru');

export const PETS_KEY = 'KeyN';

export function installPets(game) {
  const mods = game.mods;
  const offs = [];
  const S = { view: null, sig: '', lastDay: null, disposed: false, panelEl: null, hatchT: 0, speed: 0, last: new THREE.Vector3(), yaw: 0 };
  const state = C.petStateMemo(() => game.profile, () => game.time);   // [perf5] was a full re-sanitise per call, several per frame
  const save = () => { try { game.progress?.save?.(); } catch { /* profile save is best effort */ } };
  const say = (text, kind = 'info') => { try { game.ui?.toast(text, kind); } catch { /* ui optional */ } };
  const atHq = () => game.run?.phase === 'company';
  const ctx = () => ({ state: state(), profile: game.profile, now: new Date() });

  // ------------------------------------------------------------------ actions (all local: the profile is yours)
  const api = {
    state, ctx, atHq,
    active: () => C.activePet(state()),
    open(tab = 'stable') {
      if (typeof document === 'undefined' || !game.ui?.openPanel || game.onboard?.deny?.('pets')) return null;   // [onboard] gifted at quota 2
      const ctl = createPetsPanel({ game, api, tab });
      S.panelEl = ctl.el;
      game.ui.openPanel(ctl.el);
      game.ui.onPanelClose = () => { ctl.dispose?.(); S.panelEl = null; return false; };
      return ctl;
    },
    close() { if (S.panelEl && game.ui?.panelOpen === S.panelEl) game.ui.closePanel(); },
    toggle() { if (S.panelEl && game.ui?.panelOpen === S.panelEl) api.close(); else if (!game.ui?.panelOpen) api.open(); },
    setActive(id) { const r = C.setActive(state(), id); if (r.ok) { save(); rebuildView(); } return r; },
    rename(id, name) { const ok = C.renamePet(state(), id, name); if (ok) { save(); rebuildView(); } return ok; },
    release(id) { const ok = C.releasePet(state(), id); if (ok) { save(); rebuildView(); } return ok; },
    buyPet(sp) {
      if (!atHq()) return { ok: false, err: 'Pet Shop (HQ only)' };
      const r = C.buyPet(ctx(), sp);
      if (r.ok) { save(); rebuildView(); say(tf('Adopted {n}!', { n: r.pet.nm }), 'good'); }
      return r;
    },
    buySkin(cat, id) { const r = C.buySkin(ctx(), cat, id); if (r.ok) save(); return r; },
    equip(petId, cat, id) { const r = C.equipSkin(ctx(), petId, cat, id); if (r.ok) { save(); rebuildView(); } return r; },
    /** put a carried egg item into the incubator (must be aboard the ship) */
    incubateItem(it) {
      const p = game.player;
      if (!it || !C.isEggItem(it.type)) return { ok: false, err: 'That is not an egg.' };
      if (!p.inShip) return { ok: false, err: 'Use the egg inside the ship.' };
      const r = C.incubate(state(), it.type);
      if (!r.ok) return r;
      try { game.net.request('consume', { id: it.id }); } catch { /* single player without net */ }
      save();
      return r;
    },
    hatchCheck() {
      const res = C.hatchReady(state());
      for (const { pet } of res) {
        say(`${t('An egg hatched!')} ${t(C.SPECIES[pet.sp].name)}${pet.sh ? ' ✦' : ''}`, 'good');
        game.audio?.ui?.('ui_confirm', 0.7);
      }
      if (res.length) { save(); rebuildView(); }
      return res;
    },
    /** Pet Treats the local player carries (PET panel FEED button) */
    treats() { let n = 0; for (const it of game.items?.all?.() || []) if (it.holder === game.selfId && it.type === 'pet_treat') n++; return n; },
    /** feed one carried Pet Treat to a stable pet (loyalty) - same effect as using the treat on the active pet */
    feed(id) {
      const pet = C.findPet(state(), id);
      if (!pet) return { ok: false, err: 'Empty' };
      const it = (game.items?.all?.() || []).find((i) => i.holder === game.selfId && i.type === 'pet_treat');
      if (!it) return { ok: false, err: 'You need a Pet Treat.' };
      C.addLoyalty(pet, 'treat'); save();
      try { game.net.request('consume', { id: it.id }); } catch { /* ignore */ }
      say(`${pet.nm} ♥`, 'good');
      return { ok: true };
    },
    /** dev / tests: give XP (raw) to the active pet, returns { from, to, evolved } */
    giveXp(n, id = null) {
      const s = state(), pet = id ? C.findPet(s, id) : C.activePet(s);
      if (!pet) return null;
      const r = C.awardXp(pet, n, { raw: false });
      if (r.evolved) s.stats.evolved++;
      save(); rebuildView();
      if (r.to > r.from) say(tf('{n} reached level {l}!', { n: pet.nm, l: r.to }), 'good');
      if (r.evolved) say(tf('{n} evolved into {e}!', { n: pet.nm, e: C.evolutionName(pet.sp, r.stage) }), 'good');
      return r;
    },
    stats: () => { const p = api.active(); return p ? C.petStats(p) : null; },
    view: () => S.view,
  };

  // ------------------------------------------------------------------ the follower (client side, your own pet only)
  function labelOf(pet) { return `${pet.sp}|${C.stageOf(pet)}|${pet.sh}|${pet.sk.c}|${pet.sk.h}|${pet.sk.v}|${pet.sk.s}`; }
  function removeView() {
    if (!S.view) return;
    S.view.model.dispose();
    S.view = null; S.sig = '';
  }
  function rebuildView() {
    if (S.disposed) return;
    if (S.netOn) { removeView(); api.net?.sendSync?.(true); return; }   // [finish] the host-driven view (pets_net.js) replaces the local follower
    const pet = api.active();
    if (!pet || C.isResting(state(), pet) || !game.run || typeof document === 'undefined') { removeView(); return; }
    const sig = labelOf(pet);
    if (S.view && S.sig === sig) return;
    removeView();
    try {
      const model = createPetModel(pet.sp, C.stageOf(pet), { shiny: !!pet.sh, skin: { c: pet.sk.c, h: pet.sk.h, v: pet.sk.v, s: pet.sk.s } });
      game.engine.scene.add(model.root);
      const p = game.player.pos;
      model.root.position.set(p.x - 1.5, p.y, p.z - 1.5);
      S.view = { model, pos: model.root.position, anim: 'idle', idleT: 0 };
      S.sig = sig;
    } catch (e) { console.warn('[pets] view', e); S.view = null; }
  }
  const _f = new THREE.Vector3(), _t = new THREE.Vector3();
  function tickView(dt) {
    const v = S.view, p = game.player;
    if (!v || !p) return;
    const blocked = !!(game.mirror?.active || game.boardgame?.active || game.petsBlocked);   // dimension events that forbid pets: it waits
    v.model.root.visible = !blocked;
    _f.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    _t.set(p.pos.x - _f.x * 1.7 + _f.z * 0.7, p.pos.y, p.pos.z - _f.z * 1.7 - _f.x * 0.7);
    const dx = _t.x - v.pos.x, dz = _t.z - v.pos.z, d = Math.hypot(dx, dz);
    const far = Math.hypot(p.pos.x - v.pos.x, p.pos.z - v.pos.z);
    let anim = 'idle', speed = 0;
    if (far > 24 || Math.abs(p.pos.y - v.pos.y) > 4) { v.pos.copy(_t); }
    else if (far > 2.6) {
      const st = C.petStats(api.active());
      speed = Math.min(d, (st?.spd || 4) * (far > 8 ? 1.7 : 1) * dt) / Math.max(dt, 1e-4);
      const step = Math.min(d, speed * dt);
      v.pos.x += (dx / d) * step; v.pos.z += (dz / d) * step;
      v.pos.y += (p.pos.y - v.pos.y) * Math.min(1, dt * 6);
      S.yaw = Math.atan2(dx, dz);
      anim = speed > 5.5 ? 'run' : 'walk';
      v.idleT = 0;
    } else { v.idleT += dt; anim = v.idleT > 5 ? 'sit' : 'idle'; v.pos.y += (p.pos.y - v.pos.y) * Math.min(1, dt * 6); }
    let dy = S.yaw - v.model.root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    v.model.root.rotation.y += dy * Math.min(1, dt * 10);
    v.model.update(dt, { anim, speed, mood: C.moodOf(api.active()) });
  }

  // ------------------------------------------------------------------ per-frame: game days (eggs / rest / loyalty), follower
  function tickDays(dt) {
    const day = game.run?.day;
    if (!Number.isFinite(day)) return;
    if (S.lastDay === null || day < S.lastDay) S.lastDay = day;
    if (day > S.lastDay) {
      const s = state();
      const r = C.advanceDays(s, day - S.lastDay);
      S.lastDay = day;
      for (const id of r.rested) { const p = C.findPet(s, id); if (p) say(`${p.nm} ${t('is ready again.')}`, 'good'); }
      save();
      api.hatchCheck();
      rebuildView();
    }
    S.hatchT -= dt;
    if (S.hatchT <= 0) { S.hatchT = 5; if (state().incubator.length) api.hatchCheck(); }
  }
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || S.disposed) return;
    try { tickDays(dt); if (!S.netOn) { if (!S.view && S.hatchT > 4.9) rebuildView(); tickView(dt); } } catch (e) { if (!api._warned) { api._warned = true; console.warn('[pets]', e); } }
  }));
  offs.push(mods.on('phase', (ph, g) => { if (g === game) setTimeout(rebuildView, 400); }));
  offs.push(mods.on('mapLoaded', (w, g) => { if (g === game) rebuildView(); }));

  // ------------------------------------------------------------------ using items: eggs (incubate), treat (feed)
  offs.push(mods.on('useItem', (it, hk, g) => {
    if (g !== game || !it || hk.handled) return;
    if (C.isEggItem(it.type)) { hk.handled = true; const r = api.incubateItem(it); say(r.ok ? t('Incubating') + ' ✓' : t(r.err), r.ok ? 'good' : 'warn'); return; }
    if (it.type === 'pet_treat') {
      hk.handled = true;
      const pet = api.active();
      if (!pet) { say(t('Empty'), 'warn'); return; }
      C.addLoyalty(pet, 'treat'); save();
      try { game.net.request('consume', { id: it.id }); } catch { /* ignore */ }
      say(`${pet.nm} ♥`, 'good');
    }
  }));

  // ------------------------------------------------------------------ key N + terminal
  const onKey = (e) => {
    if (e.code !== (game.settings?.keys?.pets || PETS_KEY) || e.repeat || e.defaultPrevented || S.disposed || game.destroyed || !game.run) return;
    if (game.input?.isTyping?.() || game.minigame || game.terminal?.active || game.ui?.chatOpen || game.music?.playing) return;
    const ui = game.ui;
    if (ui?.panelOpen && ui.panelOpen !== S.panelEl) return;
    e.preventDefault();
    api.toggle();
  };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);
  const cmd = (rest, term) => {
    const [w, ...a] = String(rest || '').trim().split(/\s+/);
    const s = state();
    const line = (p, i) => `${i + 1}) ${p.nm} - ${C.evolutionName(p.sp, C.stageOf(p))} Lv${C.levelOf(p)}${p.sh ? ' *SHINY*' : ''}${p.id === s.active ? ' [ACTIVE]' : ''}${C.isResting(s, p) ? ' (resting)' : ''}`;
    switch ((w || '').toLowerCase()) {
      case 'mode': { const m = (a[0] || '').toLowerCase(); term.print(api.setMode?.(m) ? `Pet mode: ${m}` : `PETS MODE <${C.MODES.join('|')}> (now: ${api.mode?.()})  keys: O cycle, Shift+O deliver, L command`); return; }
      case 'dest': { const d = (a[0] || '').toLowerCase() === 'ship' ? 'ship' : 'me'; api.setDest?.(d); term.print(`Fetch delivery: ${d}`); return; }
      case 'open': case 'panel': api.open(); term.print('PET panel: N'); return;
      case 'active': { const p = s.stable[(Number(a[0]) || 0) - 1]; term.print(p ? (api.setActive(p.id).ok ? `${p.nm} is now your active pet.` : 'It is resting.') : 'PETS ACTIVE <number>'); return; }
      case 'name': { const p = s.stable[(Number(a[0]) || 0) - 1]; term.print(p && api.rename(p.id, a.slice(1).join(' ')) ? 'Renamed.' : 'PETS NAME <number> <name>'); return; }
      case 'adopt': { const r = api.buyPet((a[0] || '').toLowerCase()); term.print(r.ok ? `Adopted ${r.pet.nm}.` : (r.err || 'PETS ADOPT <cat|dog|fox|bee|bear> (HQ only)')); return; }
      default: term.print([`PETS ${s.stable.length}/${C.MAX_STABLE} | eggs incubating: ${s.incubator.length}/${C.INCUBATOR_SLOTS} | panel: N`, ...s.stable.map(line), '>PETS ACTIVE <n> | NAME <n> <name> | ADOPT <species> (HQ) | MODE <follow|stay|fetch|guard> | DEST <me|ship> | OPEN']);
    }
  };
  try { window.KefalAPI?.registerCommand?.('pets', cmd, 'your pets: list, set active, rename, adopt (HQ), open the PET panel (N)'); } catch { /* optional */ }

  offs.push(mods.on('interactables', (list, g) => {
    const v = S.netOn ? api.net?.ownView?.() : S.view;   // [finish]
    if (g !== game || !game.run || !v || !api.active()) return;
    const p = game.player;
    if (v.pos.distanceTo(p.pos) > 3.2 || !v.model.root.visible) return;
    const pet = api.active(), held = p.heldItem?.();
    const treat = held?.type === 'pet_treat';
    list.push({
      pos: new THREE.Vector3(v.pos.x, v.pos.y + 0.5, v.pos.z), r: 1.3, reach: 3.2,
      label: treat ? tf('Feed {n} [E]', { n: pet.nm }) : tf('Pet {n} [E]', { n: pet.nm }),
      action: () => { if (treat) { C.addLoyalty(pet, 'treat'); try { game.net.request('consume', { id: held.id }); } catch { /* ignore */ } } else C.addLoyalty(pet, 'pet'); save(); say(`${pet.nm} ♥ (${pet.ly})`, 'good'); },
    });
  }));

  // [finish] net + host sim + views + carrier
  let netPart = null;
  try { netPart = installPetsNet(game, api, S, { save, say }); S.netOn = true; api.refresh = rebuildView; } catch (e) { console.warn('[pets] net part', e); S.netOn = false; }

  let incubator = null;
  try { incubator = installIncubator(game, api); } catch (e) { console.warn('[pets] incubator', e); }   // [finish] ship prop

  return Object.assign(api, {
    dispose() {
      try { incubator?.dispose?.(); } catch { /* ignore */ }
      try { netPart?.dispose?.(); } catch { /* ignore */ }
      S.disposed = true;
      removeView();
      for (const off of offs) { try { off?.(); } catch { /* ignore */ } }
      if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
      try { window.KefalAPI && mods.commands?.delete('pets'); } catch { /* ignore */ }
    },
  });
}
