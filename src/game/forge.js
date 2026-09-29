// HQ FORGE (wave 2): THE MONETIZER (+1..+9 enhancement, Pack-a-Punch sequence), the Ascension Altar (tier up), the Shard
// Exchange, six SHARD materials + Backup Drive, overclock effects, weapon glow and CREATURE TIERS.
// Installed with `this.useModule('forge', installForge)` in game.js. Design + numbers: docs/MASTERPLAN.md section 12,
// pure rules in src/game/enhance.js (node-tested), docs/wave2/forge.md for the integration notes.
//
// Net (all types prefixed 'fg', one handler each):  client -> host requests  fgenh {id, backup}  fgasc {id, sac}  fgexc {op, shard}
//                                                   host -> all messages      fgres {k:'enh'|'asc'|'exc'|'err'|'heal'|'fx', ...}  fgit {id, pl, oc, tr}
// The host pays the costs, rolls with a seeded + logged ForgeRng, mutates it.plus / it.oc / it.tier and broadcasts fgit.
import * as THREE from 'three';
import { addTranslations, t } from '../core/i18n.js';
import { registerItem, ITEMS } from './items.js';
import { HOST_ONLY } from '../net/session.js';
import * as F from './enhance.js';
import { installCreatureTiers } from './creature_tiers.js';
import { installWeaponGlow } from '../render/weaponglow.js';
import { createMonetizer, createAltar, createExchange, createForgeItemModel, FORGE_ITEM_IDS } from '../models/forge.js';
import { createForgePanel } from '../ui/panels/forge.js';
import { TIERS } from './tiers.js';
import { AFFIXES } from './creatures.js';

HOST_ONLY.add('fgit'); HOST_ONLY.add('fgres');   // clients only accept these from the host

// ---------------------------------------------------------------------------------------------- items (registered at import)
for (const s of F.SHARD_DEFS) {
  if (!ITEMS[s.id]) registerItem({ id: s.id, name: s.name, kind: 'component', component: true, value: s.value, weight: 0.3, hands: 1, tier: s.tier, forge: true, tip: 'Forge shard. Dropped by creatures of its tier. Spend it at THE MONETIZER, the Ascension Altar or the Shard Exchange (HQ).' });
}
if (!ITEMS[F.BACKUP_ID]) registerItem({ id: F.BACKUP_ID, name: 'Backup Drive', kind: 'component', component: true, value: [40, 60], weight: 0.3, hands: 1, tier: 'rare', forge: true, tip: 'Forge protection. Tick it at THE MONETIZER: a failed +6 or higher keeps its level.' });

// ---------------------------------------------------------------------------------------------- text
const LINES = {
  start: ['Please place your item in the slot. Monetization is a privilege.', 'Adding a battle pass to your weapon. It will not help.', 'Your item has been selected for engagement optimization.', 'Do not remove the item. It is now content.'],
  win: ['Congratulations. You have been upsold.', 'Value has increased. So has our cut.', 'Impressive. I have noted your spending habits.', 'A premium experience. Enjoy it while it lasts.'],
  fail: ['Unfortunate. That was a limited-time offer.', 'No refunds.', 'It broke. This is called engagement.', 'Terms of service, section 9. You agreed.'],
  drop: ['The item was deprecated by one level. Section 9.', 'Downgraded. Please rate your experience.'],
  asc: ['Ascension in progress. Please do not blink.', 'Elevating your item to a higher subscription tier.'],
  ascWin: ['Promoted. You may now pay more.', 'A higher tier. A higher price.'],
  ascFail: ['The ascension was declined. Shards retained by the house.', 'Your request was ratioed.'],
};
const TR = {
  'THE MONETIZER': 'PARALAŞTIRICI', 'Use THE MONETIZER [E]': 'PARALAŞTIRICI\'yı kullan [E]', 'Ascension Altar [E]': 'Yükselme Sunağı [E]', 'Shard Exchange [E]': 'Parça Takası [E]',
  ENHANCE: 'GÜÇLENDİR', ASCEND: 'YÜKSELT', EXCHANGE: 'TAKAS', CONVERT: 'ÇEVİR', BUY: 'AL', CONFIRM: 'ONAYLA', CLOSE: 'KAPAT',
  'Scrap Shard': 'Hurda Parçası', 'Circuit Core': 'Devre Çekirdeği', 'Data Crystal': 'Veri Kristali', 'Ecto Core': 'Ekto Çekirdek', 'Algorithm Fragment': 'Algoritma Parçası', 'Source Code': 'Kaynak Kod', 'Backup Drive': 'Yedek Disk',
  Shock: 'Şok', Burn: 'Yanık', Freeze: 'Dondurma', Void: 'Boşluk', Vamp: 'Vampir', Viral: 'Viral',
  'Hits chain to 2 nearby enemies (35% damage).': 'Vuruşlar yakındaki 2 düşmana sıçrar (%35 hasar).',
  'Sets the target on fire: 30% of the hit per second for 4 s.': 'Hedefi yakar: 4 sn boyunca saniyede vuruşun %30\'u.',
  'Slows the target by 45% for 3 s.': 'Hedefi 3 sn boyunca %45 yavaşlatır.',
  'Pierces armour: +25% true damage that ignores affix armour.': 'Zırh deler: efsun zırhını yok sayan +%25 gerçek hasar.',
  'Steals 6% of damage dealt as health.': 'Verilen hasarın %6\'sını can olarak çalar.',
  'Enemies killed by you burst, hurting everything within 4 m.': 'Öldürdüklerin patlar, 4 m içindekilere zarar verir.',
  'Carry a weapon, armour or trinket to the machine.': 'Makineye bir silah, zırh ya da tılsım getir.', 'Select an item.': 'Bir eşya seç.',
  'MAXIMUM ENHANCEMENT REACHED': 'EN ÜST GÜÇLENDİRME', 'Success chance': 'Başarı şansı', Cost: 'Maliyet', Damage: 'Hasar', Stats: 'Değerler', 'On failure': 'Başarısızlıkta',
  'drops one level': 'bir seviye düşer', 'level stays the same': 'seviye aynı kalır', 'Backup Drive protects the level': 'Yedek Disk seviyeyi korur',
  'Success opens an OVERCLOCK socket (random effect)': 'Başarı bir OVERCLOCK yuvası açar (rastgele etki)', 'Use a Backup Drive': 'Yedek Disk kullan',
  'Not enough credits or shards.': 'Yeterli kredi veya parça yok.', 'The Algorithm takes a cut of every attempt. Costs are paid up front.': 'Algoritma her denemeden pay alır. Bedel peşin ödenir.',
  'MYTHIC: nothing above this.': 'MİTİK: bunun üstü yok.', 'tier is kept, materials are lost': 'tier korunur, malzemeler kaybolur', 'Sacrifice a spare': 'Yedek bir tane feda et',
  'The workbench only raises items up to Rare. Epic and above is done here.': 'Atölye masası sadece Nadir\'e kadar yükseltir. Epik ve üstü burada yapılır.',
  'Source Code cannot be traded for. It only drops from Mythic creatures and world bosses.': 'Kaynak Kod takasla alınamaz. Sadece Mitik yaratıklardan ve dünya boss\'larından düşer.',
  Forge: 'Demirhane', 'Forge shard. Dropped by creatures of its tier. Spend it at THE MONETIZER, the Ascension Altar or the Shard Exchange (HQ).': 'Demirhane parçası. Kendi tier\'ındaki yaratıklardan düşer. HQ\'daki PARALAŞTIRICI, Yükselme Sunağı veya Parça Takası\'nda harca.',
  'Forge protection. Tick it at THE MONETIZER: a failed +6 or higher keeps its level.': 'Demirhane koruması. PARALAŞTIRICI\'da seç: başarısız +6 ve üstü seviyesini korur.',
  'Workbench upgrades stop at Rare. Use the Ascension Altar at HQ.': 'Atölye yükseltmesi Nadir\'de biter. HQ\'daki Yükselme Sunağı\'nı kullan.',
  'Stand at THE MONETIZER.': 'PARALAŞTIRICI\'nın başında dur.', 'Stand at the Ascension Altar.': 'Yükselme Sunağı\'nın başında dur.', 'Stand at the Shard Exchange.': 'Parça Takası\'nın başında dur.',
  'Not enough credits.': 'Yeterli kredi yok.', 'Missing shards.': 'Parça eksik.', 'That item cannot be enhanced.': 'Bu eşya güçlendirilemez.', 'Slow down.': 'Yavaş ol.', 'The forge is busy.': 'Demirhane meşgul.',
  'FAILED': 'BAŞARISIZ', 'SUCCESS': 'BAŞARILI', 'LEVEL LOST': 'SEVİYE KAYBI', 'BACKUP DRIVE USED': 'YEDEK DİSK KULLANILDI', 'ASCENDED': 'YÜKSELDİ', 'DECLINED': 'REDDEDİLDİ',
  'SCANNING...': 'TARANIYOR...', 'MONETIZING...': 'PARALAŞTIRILIYOR...', 'INSERT ITEM': 'EŞYAYI YERLEŞTİR', 'OVERCLOCK UNLOCKED': 'OVERCLOCK AÇILDI', 'MYTHIC CREATURE': 'MİTİK YARATIK',
  'Carry a weapon, armour or trinket to the machine. ': '', 'Enhanced': 'Güçlendirildi', 'Ascended': 'Yükseltildi', 'Converted': 'Çevrildi',
};
for (const grp of Object.values(LINES)) for (const l of grp) TR[l] = TR[l] || l;
Object.assign(TR, {
  'Please place your item in the slot. Monetization is a privilege.': 'Lütfen eşyanı yuvaya koy. Paralaştırma bir ayrıcalıktır.',
  'Adding a battle pass to your weapon. It will not help.': 'Silahına savaş bileti ekliyorum. Yardımı olmayacak.',
  'Your item has been selected for engagement optimization.': 'Eşyan etkileşim optimizasyonu için seçildi.',
  'Do not remove the item. It is now content.': 'Eşyayı çıkarma. Artık o bir içerik.',
  'Congratulations. You have been upsold.': 'Tebrikler. Daha pahalısına ikna edildin.',
  'Value has increased. So has our cut.': 'Değer arttı. Bizim payımız da.',
  'Impressive. I have noted your spending habits.': 'Etkileyici. Harcama alışkanlıklarını not ettim.',
  'A premium experience. Enjoy it while it lasts.': 'Premium bir deneyim. Sürerken tadını çıkar.',
  'Unfortunate. That was a limited-time offer.': 'Ne yazık. Bu sınırlı süreli bir tekliflik.',
  'No refunds.': 'İade yok.', 'It broke. This is called engagement.': 'Bozuldu. Buna etkileşim denir.',
  'Terms of service, section 9. You agreed.': 'Hizmet şartları, madde 9. Kabul ettin.',
  'The item was deprecated by one level. Section 9.': 'Eşya bir seviye eskitildi. Madde 9.', 'Downgraded. Please rate your experience.': 'Düşürüldü. Lütfen deneyimini puanla.',
  'Ascension in progress. Please do not blink.': 'Yükselme sürüyor. Lütfen gözünü kırpma.', 'Elevating your item to a higher subscription tier.': 'Eşyan daha yüksek bir abonelik seviyesine çıkarılıyor.',
  'Promoted. You may now pay more.': 'Terfi ettin. Artık daha fazla ödeyebilirsin.', 'A higher tier. A higher price.': 'Daha yüksek tier. Daha yüksek fiyat.',
  'The ascension was declined. Shards retained by the house.': 'Yükselme reddedildi. Parçalar evde kaldı.', 'Your request was ratioed.': 'Talebin ratio yedi.',
});

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (arr, i) => arr[Math.abs(i | 0) % arr.length];
const LAMP_DIM = 0x552200, LAMP_ON = 0xffb040, LAMP_OK = 0x40ff70, LAMP_BAD = 0xff2a1a;

// ---------------------------------------------------------------------------------------------- install
export function installForge(game) {
  addTranslations(TR);
  const mm = game.mods;
  const offs = [];
  let disposed = false;
  const seed = ((Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const rng = new F.ForgeRng(seed);
  const stats = { enhanced: 0, ascended: 0, exchanged: 0, shardDrops: 0 };
  const api = { seed, rng, stats, log: rng.log, F, debug: { skipNear: false } };
  const tiers = installCreatureTiers(game, api);
  const glow = installWeaponGlow(game);
  let panel = null;
  const lastReq = new Map();
  const tmpV = new THREE.Vector3();

  // item models (world + inventory icons read the mod registry)
  if (mm?.itemModels) for (const id of FORGE_ITEM_IDS) if (!mm.itemModels.has(id)) mm.itemModels.set(id, () => createForgeItemModel(id));

  // ------------------------------------------------------------------ inventory helpers (host + client)
  const posOf = (id) => (id === game.selfId ? game.player.pos : game.remotes.get(id)?.pos);
  const heldBy = (pid) => { const out = []; for (const it of game.items.all()) if (it.holder === pid) out.push(it); return out; };
  const usable = (it) => !it.soulbound && !it._fgUsed && it.type !== 'body';
  const typesFor = (id) => [id, ...(F.SHARD_ALIASES[id] || [])];
  /** how many of a shard / material this player carries (hotbar + bag); crafting's comp_crystal counts as Data Crystal */
  const count = (id, pid = game.selfId) => { const ts = typesFor(id); let n = 0; for (const it of heldBy(pid)) if (ts.includes(it.type) && usable(it)) n++; return n; };
  const take = (pid, id, n, except = null) => {
    const ts = typesFor(id), out = [];
    for (const it of heldBy(pid)) { if (out.length >= n) break; if (it !== except && ts.includes(it.type) && usable(it)) out.push(it); }
    return out.length >= n ? out : null;
  };
  const remove = (list) => { for (const it of list) { it._fgUsed = true; game.net.broadcast('it', { e: 'rm', id: it.id }); } };
  const myItems = () => heldBy(game.selfId).filter((it) => F.canEnhance(it.def) && !it._fgUsed);

  // ------------------------------------------------------------------ HQ stations
  const stations = () => game.world?.company?.group?.userData?.tfgForge || null;
  function build(co) {
    if (!co?.group || co.group.userData.tfgForge) return;
    try {
      const y = co.groundY ?? -1.25;
      const mach = createMonetizer(), altar = createAltar(), exch = createExchange();
      mach.position.set(-10.2, y, -36.9); altar.position.set(-6.4, y, -35.5); exch.position.set(8.4, y, -36.8);
      co.group.add(mach, altar, exch);
      for (const o of [mach, altar, exch]) for (const [cx, cy, cz, hx, hy, hz] of o.userData.colliders) co.colliders?.push(game.physics.addStaticBox(o.position.x + cx, o.position.y + cy, o.position.z + cz, hx, hy, hz, 0));
      const e1 = game.lights.add({ pos: new THREE.Vector3(-10.2, y + 2.4, -35.6), color: 0xff8a3d, intensity: 1.0, distance: 9, group: 'company' });
      const e2 = game.lights.add({ pos: new THREE.Vector3(-6.4, y + 1.9, -35.5), color: 0xb35cff, intensity: 0.9, distance: 8, group: 'company' });
      co.emitters?.push(e1, e2);
      co.group.userData.tfgForge = { mach, altar, exch, e1, e2, y, e1Base: 1.0, e2Base: 0.9 };
    } catch (e) { console.warn('[forge] stations', e); }
  }
  offs.push(mm.on('mapLoaded', (world, g) => { if (g && g !== game) return; if (world?.company) build(world.company); }));
  const stationPos = (key, out = new THREE.Vector3()) => { const s = stations(); return s?.[key] ? s[key].getWorldPosition(out) : null; };
  const near = (pid, key) => {
    if (api.debug.skipNear) return true;
    const sp = stationPos(key, tmpV), p = posOf(pid);
    return !!sp && !!p && Math.hypot(p.x - sp.x, p.z - sp.z) < 7.5 && Math.abs(p.y - sp.y) < 4;
  };

  // ------------------------------------------------------------------ interactables + panel
  function open(tab = 'enhance') {
    if (!stations() || disposed || game.onboard?.deny?.('forge')) return;   // [onboard] gifted at quota 1
    const ui = game.ui;
    const ctl = createForgePanel(ui, game, api, { tab });
    ui.openPanel(ctl.el);
    panel = ctl;
    ui.onPanelClose = () => { ctl.dispose(); if (panel === ctl) panel = null; return false; };
    game.audio?.play?.('ui_confirm', { volume: 0.6, bus: 'ui' });
  }
  const closePanel = () => { if (panel) game.ui.closePanel(); };
  offs.push(mm.on('interactables', (list, gg) => {
    if (gg !== game || !game.run || game.run.phase !== 'company') return;
    const s = stations();
    if (!s) return;
    const add = (key, dy, label, tab) => {
      const p = s[key].getWorldPosition(new THREE.Vector3()); p.y += dy; p.z += 0.9;
      list.push({ pos: p, r: 1.5, reach: 3.6, label: t(label), action: () => open(tab) });
    };
    add('mach', 1.2, 'Use THE MONETIZER [E]', 'enhance');
    add('altar', 0.9, 'Ascension Altar [E]', 'ascend');
    add('exch', 1.1, 'Shard Exchange [E]', 'exchange');
  }));

  // ------------------------------------------------------------------ client requests
  const req = (a, d) => game.net.request(a, d);
  Object.assign(api, {
    count, myItems, open, close: closePanel, isOpen: () => !!panel, stations, stationPos,
    enhanceInfo: F.enhanceInfo, ascendInfo: F.ascendInfo,
    requestEnhance: (id, o = {}) => req('fgenh', { id, backup: o.backup ? 1 : 0, fl: Math.round((Number(game.rpg?.bonus?.('forgeLuck')) || 0) * 1000) / 1000 }),   // Engineer aptitude
    requestAscend: (id, sac = null) => req('fgasc', { id, sac: sac || undefined }),
    requestExchange: (o) => req('fgexc', o),
    force: (...v) => rng.force(...v),
    // creature tier hooks used by entities/creatures.js
    creatureOpts: tiers.creatureOpts, dropOpts: tiers.dropOpts,
  });

  // ------------------------------------------------------------------ host: resolution
  const reply = (to, o) => game.net.sendTo(to, 'fgres', o);
  const err = (to, msg) => reply(to, { k: 'err', msg });
  const syncItem = (it) => game.net.broadcast('fgit', { id: it.id, pl: it.plus || 0, oc: it.oc || [], tr: it.tier || undefined });
  const xpTo = (to, xp, reason) => game.net.broadcast('xp', { to, xp: Math.round(xp), coin: 0, reason });
  function gate(from, key, msgNear) {
    if (!game.isHost || disposed || game.run?.phase !== 'company') return false;
    const now = performance.now() / 1000;
    if (now - (lastReq.get(from) || -9) < 0.35) { err(from, 'Slow down.'); return false; }
    lastReq.set(from, now);
    if (!near(from, key)) { err(from, msgNear); return false; }
    return true;
  }
  const payCredits = (n) => { game.run.credits -= n; game.broadcastRun?.(['credits']); };

  function hostEnhance(d, from) {
    if (!gate(from, 'mach', 'Stand at THE MONETIZER.')) return;
    const it = game.items.get(String(d.id));
    if (!it || it.holder !== from || !F.canEnhance(it.def)) return err(from, 'That item cannot be enhanced.');
    if (it._fgBusy) return err(from, 'The forge is busy.');
    const cur = it.plus | 0;
    const info = F.enhanceInfo(cur);
    if (!info) return err(from, 'That item cannot be enhanced.');
    if ((game.run?.credits || 0) < info.credits) return err(from, 'Not enough credits.');
    const mats = take(from, info.mat[0], info.mat[1], it);
    if (!mats) return err(from, 'Missing shards.');
    const drives = d.backup && info.failDrops ? take(from, F.BACKUP_ID, 1) : null;
    payCredits(info.credits);
    remove(mats);
    const luck = Math.max(0, Math.min(0.15, Number(d.fl) || 0));   // role aptitude (Engineer +10%), co-op trust, capped
    const roll = Math.max(0, rng.next('enhance') - luck);
    const res = F.resolveEnhance(cur, roll, { backup: !!drives });
    if (res.backupUsed && drives) remove(drives);
    it.plus = res.to;
    let newOc = null;
    if (res.ok) {
      if (F.overclockSlots(res.to, it.def) > (it.oc?.length || 0)) { newOc = F.rollOverclock(rng, it.oc || []); if (newOc) it.oc = [...(it.oc || []), newOc]; }
    } else if (res.dropped) it.oc = F.trimOverclocks(it.oc, res.to, it.def);
    syncItem(it);
    stats.enhanced++;
    xpTo(from, 6 + res.to * 3 + (res.ok ? 6 : 0), res.ok ? 'Enhanced' : 'Enhancement failed');
    game.net.broadcast('fgres', { k: 'enh', by: from, id: it.id, type: it.type, from: cur, to: res.to, ok: res.ok, dropped: res.dropped, backupUsed: res.backupUsed, oc: newOc, chance: info.chance, ln: Math.floor(rng.next('line') * 1000) });
    it._fgBusy = true; game.later?.(() => { it._fgBusy = false; }, 3400);
  }

  function hostAscend(d, from) {
    if (!gate(from, 'altar', 'Stand at the Ascension Altar.')) return;
    const it = game.items.get(String(d.id));
    if (!it || it.holder !== from || !F.canEnhance(it.def)) return err(from, 'That item cannot be enhanced.');
    if (it._fgBusy) return err(from, 'The forge is busy.');
    const tier = it.rarity();
    let sac = d.sac ? game.items.get(String(d.sac)) : null;
    if (sac && (sac === it || sac.holder !== from || sac.type !== it.type || sac.soulbound || sac.plus > 0)) sac = null;
    const info = F.ascendInfo(tier, { sacrifice: !!sac });
    if (!info) return err(from, 'That item cannot be enhanced.');
    if ((game.run?.credits || 0) < info.credits) return err(from, 'Not enough credits.');
    const mats = take(from, info.mat[0], info.mat[1], it);
    if (!mats) return err(from, 'Missing shards.');
    payCredits(info.credits);
    remove(mats);
    if (sac) remove([sac]);
    const res = F.resolveAscend(tier, rng.next('ascend'), { sacrifice: !!sac });
    if (res.ok) { it.tier = res.to; syncItem(it); }
    stats.ascended++;
    xpTo(from, res.ok ? 40 + F.SHARD_IDS.length * 5 : 10, res.ok ? 'Ascended' : 'Ascension failed');
    game.net.broadcast('fgres', { k: 'asc', by: from, id: it.id, type: it.type, from: tier, to: res.to, ok: res.ok, chance: info.chance, ln: Math.floor(rng.next('line') * 1000) });
    it._fgBusy = true; game.later?.(() => { it._fgBusy = false; }, 3400);
  }

  function hostExchange(d, from) {
    if (!gate(from, 'exch', 'Stand at the Shard Exchange.')) return;
    const s = stations();
    const at = tmpV.set(0, 0, 0);
    let outId = null, mats = null;
    if (d.op === 'backup') {
      mats = take(from, F.BACKUP_COST.id, F.BACKUP_COST.n);
      if (!mats) return err(from, 'Missing shards.');
      outId = F.BACKUP_ID;
    } else {
      const rule = F.exchangeRule(String(d.shard));
      if (!rule) return err(from, 'Missing shards.');
      mats = take(from, rule.from, rule.n);
      if (!mats) return err(from, 'Missing shards.');
      outId = rule.to;
    }
    remove(mats);
    if (s?.exch) { at.copy(s.exch.userData.out); s.exch.localToWorld(at); }
    game.items.hostSpawn(outId, new THREE.Vector3(at.x, at.y + 0.1, at.z), { linvel: [0, 0.6, 1.4] });
    stats.exchanged++;
    reply(from, { k: 'exc', to: outId });
  }

  // ------------------------------------------------------------------ host: overclock effects (wrap of the 'hit' handler)
  function swungWeapon(from) {
    if (from === game.selfId) return game.player.heldItem?.() || null;
    const r = game.remotes.get(from);
    if (!r?.heldType) return null;
    for (const it of game.items.all()) if (it.holder === from && !it.inv && it.type === r.heldType && it.def.kind === 'weapon') return it;
    return null;
  }
  function onHit(from, w, c, before) {
    if (!w || !c || !w.oc?.length || c.maxHp === null) return;
    const dealt = Math.max(0, before - Math.max(0, c.hp));
    const M = game.creatures;
    const fx = (kind, p) => game.net.broadcast('fgres', { k: 'fx', kind, p });
    for (const oc of w.oc) {
      if (oc === 'shock' && dealt > 0) {
        const hits = [];
        for (const o of M.host.values()) {
          if (hits.length >= 2) break;
          if (o === c || o.dead || o.maxHp === null || o.pos.distanceTo(c.pos) > 5) continue;
          M.damage(o.id, Math.max(3, dealt * 0.35), from, { pierce: false });
          hits.push([+o.pos.x.toFixed(2), +(o.pos.y + 0.8).toFixed(2), +o.pos.z.toFixed(2)]);
        }
        if (hits.length) fx('shock', [[+c.pos.x.toFixed(2), +(c.pos.y + 0.8).toFixed(2), +c.pos.z.toFixed(2)], ...hits]);
      } else if (oc === 'burn' && !c.dead) {
        const first = !c.fgBurn;
        c.fgBurn = { t: 4, k: 0.5, dps: Math.max(1, (dealt || 4) * 0.3), by: from };
        if (first) fx('burn', [[+c.pos.x.toFixed(2), +(c.pos.y + 0.6).toFixed(2), +c.pos.z.toFixed(2)]]);
      } else if (oc === 'freeze' && !c.dead) {
        c.slowT = Math.max(c.slowT || 0, 3); c.slowMul = 0.55;
        fx('freeze', [[+c.pos.x.toFixed(2), +(c.pos.y + 0.6).toFixed(2), +c.pos.z.toFixed(2)]]);
      } else if (oc === 'void' && dealt > 0 && !c.dead) {
        const armor = (c.affix ? AFFIXES[c.affix]?.armor || 0 : 0);
        M.damage(c.id, (dealt * 0.25) / Math.max(0.2, 1 - armor), from, { pierce: true });
        fx('void', [[+c.pos.x.toFixed(2), +(c.pos.y + 0.8).toFixed(2), +c.pos.z.toFixed(2)]]);
      } else if (oc === 'vamp' && dealt > 0) {
        reply(from, { k: 'heal', n: Math.min(6, Math.max(1, dealt * 0.06)) });
      }
    }
  }
  offs.push(mm.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    H('fgenh', hostEnhance); H('fgasc', hostAscend); H('fgexc', hostExchange);
    const orig = game.net.handlers.get('hit');
    if (orig) {
      H('hit', (d, from) => {
        let w = null, c = null, before = 0;
        try {
          c = game.creatures.host.get(d.cid);
          w = c && !c.dead ? swungWeapon(from) : null;
          if (w?.oc?.includes('viral')) c.fgViral = from;   // creature_tiers.onKilled bursts the corpse
          before = c ? c.hp : 0;
        } catch (e) { w = null; }
        orig(d, from);
        try { onHit(from, w, c, before); } catch (e) { console.warn('[forge] overclock', e); }
      });
    }
  }));
  function hostTick(dt) {
    tiers.hostTick(dt);
    const M = game.creatures;
    for (const c of M.host.values()) {
      const b = c.fgBurn;
      if (!b || c.dead) { if (b) c.fgBurn = null; continue; }
      b.t -= dt; b.k -= dt;
      if (b.k <= 0) { b.k = 0.5; M.damage(c.id, b.dps * 0.5, b.by, { pierce: true }); }
      if (b.t <= 0) c.fgBurn = null;
    }
  }

  // ------------------------------------------------------------------ client: messages
  const seq = { active: false, t: 0, dur: 3.1, d: null, revealed: false, beepT: 0, beepN: 0, kind: 'enh' };
  const snd = (name, vol = 0.7, pitch = 1) => {
    const p = stationPos(seq.kind === 'asc' ? 'altar' : 'mach', tmpV);
    game.audio?.play?.(name, p ? { pos: p.clone(), volume: vol, pitch, refDistance: 6, maxDistance: 80 } : { volume: vol, pitch, bus: 'sfx' });
  };
  offs.push(mm.on('netReady', (net, g) => {
    if (g && g !== game) return;
    net.on_('fgit', (d) => {
      const it = game.items.get(d?.id);
      if (!it) return;
      it.plus = clamp(d.pl | 0, 0, F.MAX_PLUS);
      it.oc = Array.isArray(d.oc) ? d.oc.filter((x) => typeof x === 'string').slice(0, 2) : [];
      if (d.tr && TIERS[d.tr]) it.tier = d.tr;
      game.refreshStats?.();   // equipped armour / trinkets: +N and tier change the derived stats
    });
    net.on_('fgres', (d) => onRes(d));
  }));
  function onRes(d) {
    if (disposed || !d) return;
    if (d.k === 'err') { game.ui?.sfx?.('ui_error'); game.ui?.toast?.(t(String(d.msg || 'Slow down.')), 'bad'); return; }
    if (d.k === 'heal') {
      const p = game.player;
      if (p && !p.dead && p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + d.n); game.net.send('pst', { hp: Math.round(p.hp) }); }
      return;
    }
    if (d.k === 'exc') { game.audio?.ui?.('ui_buy', 0.7); game.ui?.toast?.(`${t('Converted')}: ${t(ITEMS[d.to]?.name || d.to)}`, 'good'); panel?.onResult?.(d); return; }
    if (d.k === 'fx') { fxAt(d.kind, d.p); return; }
    if (d.k === 'enh' || d.k === 'asc') startSeq(d);
  }
  const fxColor = { shock: 0x8fe8ff, burn: 0xff8a1a, freeze: 0x9fdcff, void: 0xb35cff };
  function fxAt(kind, list) {
    if (!game.particles || !Array.isArray(list)) return;
    for (const p of list) {
      if (!Array.isArray(p) || p.length < 3) continue;
      tmpV.set(p[0], p[1], p[2]);
      game.particles.burst(tmpV, { count: kind === 'freeze' ? 8 : 6, color: [fxColor[kind] || 0xffffff, 0xffffff], speed: 2.2, up: 1.4, life: 0.5, size: 0.06, gravity: kind === 'burn' ? -1 : 4, drag: 2 });
    }
    if (kind === 'shock') game.audio?.play?.('zap', { pos: tmpV.clone(), volume: 0.5, refDistance: 3 });
  }

  // ------------------------------------------------------------------ client: THE MONETIZER sequence
  function startSeq(d) {
    const s = stations();
    if (!s) return;
    seq.active = true; seq.t = 0; seq.d = d; seq.revealed = false; seq.beepT = 0.4; seq.beepN = 0; seq.kind = d.k;
    if (d.by === game.selfId) closePanel();
    snd('power_up', 0.8, 1);
    game.lore?.say?.(t(pick(d.k === 'asc' ? LINES.asc : LINES.start, d.ln)), { mood: 'amused' });
  }
  function reveal() {
    const d = seq.d, s = stations();
    seq.revealed = true;
    if (!d || !s) return;
    const mine = d.by === game.selfId;
    const nm = t(ITEMS[d.type]?.name || d.type);
    const center = d.k === 'asc' ? s.altar.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.6, 0.4)) : s.mach.getWorldPosition(new THREE.Vector3()).add(s.mach.userData.cradle);
    const col = d.k === 'asc' ? (TIERS[d.to]?.hex || 0xffffff) : d.ok ? 0xffd060 : 0xff3a2a;
    if (d.ok) {
      game.particles?.burst(center, { count: 40, color: [col, 0xffffff, 0xffe9a0], speed: 4.5, up: 3, life: 0.9, size: 0.09, gravity: 5, drag: 1.2 });
      snd('slot_jackpot', 0.9, 1); if ((d.to || 0) >= 5 || d.k === 'asc') snd('level_up_jingle', 0.8, 1);
      game.engine?.shake?.(0.3);
      if (d.k === 'enh') game.lore?.say?.(t(pick(LINES.win, d.ln + 1)), { mood: 'ecstatic' });
      else game.lore?.say?.(t(pick(LINES.ascWin, d.ln + 1)), { mood: 'ecstatic' });
    } else {
      game.particles?.burst(center, { count: 24, color: [0xff3a2a, 0x330000, 0xffa040], speed: 3, up: 1.2, life: 0.7, size: 0.08, gravity: 6, drag: 1.5 });
      snd('slot_lose', 0.9, 0.9); snd('power_down', 0.7, 1); snd('ui_error', 0.5, 0.7);
      game.engine?.shake?.(0.5);
      game.lore?.say?.(t(pick(d.dropped ? LINES.drop : d.k === 'asc' ? LINES.ascFail : LINES.fail, d.ln + 2)), { mood: 'delighted' });
    }
    if (mine || (game.player.pos.distanceTo(center) < 14)) {
      const hud = game.ui?.hud;
      if (d.k === 'enh') {
        hud?.bigText(d.ok ? `+${d.to} ${t('SUCCESS')}` : d.dropped ? `${t('LEVEL LOST')} +${d.to}` : d.backupUsed ? t('BACKUP DRIVE USED') : t('FAILED'),
          `${nm}${d.oc ? ' · ' + t('OVERCLOCK UNLOCKED') + ': ' + t(F.OVERCLOCKS[d.oc]?.name || d.oc) : ''}`);
      } else hud?.bigText(d.ok ? `${t('ASCENDED')}: ${t(TIERS[d.to]?.name || d.to)}` : t('DECLINED'), nm);
    }
  }
  const lastScreen = { t: 0, x: 0 };
  const cOn = new THREE.Color(LAMP_ON);
  function machineIdle(s, dt) {
    const time = game.time || 0;
    const mach = s.mach.userData;
    // idle: lamps breathe, slow screen refresh
    for (let i = 0; i < mach.lamps.length; i++) mach.lamps[i].color.setHex(LAMP_DIM).lerp(cOn, 0.15 + 0.15 * Math.sin(time * 1.5 + i));
    mach.body.position.set(0, 0, 0); mach.body.rotation.z = 0;
    const rows = [{ text: t('INSERT ITEM'), big: true, color: '#ffd23f' }, { text: '+1 ... +9', color: '#ffb070' }, { text: t('THE ALGORITHM TAKES A CUT'), color: '#a8531f' }];
    lastScreen.t -= dt;
    if (lastScreen.t <= 0) { lastScreen.t = 0.25; mach.screen.draw(rows, time); }
  }
  function updateStations(dt) {
    const s = stations();
    if (!s) return;
    const time = game.time || 0;
    // altar: orbiting shards (always), fast spin during an ascension
    const asc = seq.active && seq.kind === 'asc';
    const sp = asc ? 4 + seq.t * 5 : 0.8;
    s.altar.userData.crystals.forEach((m, i) => {
      const a = time * sp + m.userData.phase;
      m.position.set(Math.cos(a) * 0.62, 1.15 + Math.sin(time * 1.7 + m.userData.phase) * 0.08 + (asc ? seq.t * 0.15 : 0), Math.sin(a) * 0.62);
      m.rotation.y += dt * 2.2; m.rotation.x += dt * 0.9;
    });
    s.altar.userData.core.rotation.y += dt * 1.4;
    s.altar.userData.ringMat.opacity = asc ? 0.9 + 0.1 * Math.sin(time * 30) : 0.55 + 0.25 * Math.sin(time * 1.3);
    s.e2.intensity = s.e2Base * (asc ? 1.5 + Math.sin(time * 24) * 0.8 : 1);
    // exchange screen
    lastScreen.x -= dt;
    if (lastScreen.x <= 0) {
      lastScreen.x = 0.5;
      const rows = [{ text: t('5 LOW -> 1 HIGH'), big: true, color: '#7dffd8' }, ...F.SHARD_DEFS.slice(0, 4).map((sd) => ({ text: `${t(sd.name)}`.slice(0, 22), color: sd.color }))];
      s.exch.userData.screen.draw(rows, time);
    }
    // machine
    if (!(seq.active && seq.kind === 'enh')) { machineIdle(s, dt); s.e1.intensity = s.e1Base; return; }
    const m = s.mach.userData, p = seq.t / seq.dur;
    const roll = seq.t < seq.dur - 0.45;
    const amp = roll ? 0.012 + p * 0.05 : Math.max(0, 0.06 - (seq.t - (seq.dur - 0.45)) * 0.15);
    m.body.position.set((Math.random() - 0.5) * amp, 0, (Math.random() - 0.5) * amp * 0.6); m.body.rotation.z = (Math.random() - 0.5) * amp * 0.5;
    const chase = Math.floor(seq.t * (6 + p * 14));
    for (let i = 0; i < m.lamps.length; i++) {
      const on = roll ? (chase + i) % m.lamps.length === 0 : true;
      const c = roll ? (on ? LAMP_ON : LAMP_DIM) : (seq.d?.ok ? LAMP_OK : LAMP_BAD);
      m.lamps[i].color.setHex(c);
    }
    m.glow.color.setHex(roll ? (Math.floor(seq.t * 12) % 2 ? 0xffe090 : 0xff8a3d) : (seq.d?.ok ? LAMP_OK : LAMP_BAD));
    s.e1.intensity = s.e1Base * (roll ? 1.4 + Math.sin(seq.t * 40) * 0.9 * p : (seq.d?.ok ? 3 : 2) * Math.max(0.2, 1 - (seq.t - (seq.dur - 0.45)) * 1.5));
    lastScreen.t -= dt;
    if (lastScreen.t <= 0) {
      lastScreen.t = 0.08;
      const bar = Math.min(10, Math.floor(p * 11));
      const rows = roll
        ? [{ text: seq.t < 1.1 ? t('SCANNING...') : t('MONETIZING...'), big: true, color: '#ffd23f' }, { text: '[' + '#'.repeat(bar) + '.'.repeat(10 - bar) + ']', color: '#ffb070' }, { text: `${Math.round(seq.d?.chance * 100)}%  +${(seq.d?.from || 0) + 1}`, color: '#ff8a3d' }]
        : [{ text: seq.d?.ok ? `+${seq.d.to} ${t('SUCCESS')}` : t('FAILED'), big: true, color: seq.d?.ok ? '#7dff7d' : '#ff6b5a' }, { text: seq.d?.dropped ? t('LEVEL LOST') : '', color: '#ff6b5a' }];
      m.screen.draw(rows, time, roll ? 0 : 0.6);
    }
  }
  function updateSeq(dt) {
    if (!seq.active) return;
    seq.t += dt;
    const s = stations();
    if (!s) { seq.active = false; return; }
    const center = seq.kind === 'asc' ? s.altar.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.4, 0)) : s.mach.getWorldPosition(new THREE.Vector3()).add(s.mach.userData.cradle);
    if (seq.t < seq.dur - 0.45) {
      // drum roll: beeps accelerate, pitch climbs; sparks fly from the cradle / altar
      seq.beepT -= dt;
      if (seq.beepT <= 0) {
        const p = seq.t / seq.dur;
        seq.beepT = Math.max(0.07, 0.36 - p * 0.3); seq.beepN++;
        snd(seq.kind === 'asc' ? 'charge' : 'mine_beep', 0.5, 0.8 + p * 0.9);
        game.particles?.burst(center, { count: 3, color: [0xffc060, 0xffffff], speed: 2.4, up: 1.5, life: 0.4, size: 0.05, gravity: 6, drag: 1.5 });
      }
      if (seq.kind === 'enh' && Math.random() < dt * 4) snd('spark', 0.3, 0.8 + Math.random() * 0.6);
      if (game.player.pos.distanceTo(center) < 9) game.engine?.shake?.(0.05 + (seq.t / seq.dur) * 0.12);
    } else if (!seq.revealed) reveal();
    if (seq.t >= seq.dur + 1.3) seq.active = false;   // the result stays on the machine screen for a moment
  }

  // ------------------------------------------------------------------ frame
  offs.push(mm.on('update', (dt, g) => {
    if (g && g !== game) return;
    if (disposed) return;
    try {
      updateSeq(dt);
      updateStations(dt);
      tiers.clientUpdate(dt);
      glow.update(dt);
      if (game.isHost) hostTick(dt);
    } catch (e) { if (!api._warned) { api._warned = true; console.warn('[forge] update', e); } }
  }));

  Object.assign(api, {
    glow, tiers, hostEnhance, hostAscend, hostExchange, seq, LINES,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      closePanel();
      tiers.dispose(); glow.dispose();
      const s = stations();
      if (s) for (const o of [s.mach, s.altar, s.exch]) { o.removeFromParent(); o.traverse((x) => { if (x.geometry) x.geometry.dispose(); }); }
    },
  });
  return api;
}
