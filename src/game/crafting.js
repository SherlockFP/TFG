// CRAFTING (wave 1): ship workbench, components, recipes, dismantle / analyze, crafted-item mechanics.
// Installed with `this.useModule('crafting', installCrafting)` (game.js). Everything is host-authoritative:
// clients send `craft` / `cruse` requests, the host validates the ingredients (items the player holds + items lying on /
// near the workbench), consumes them, spawns the result (with a rolled tier) and answers with a `modmsg`.
//
// game.crafting = { open(tab), close(), recipes(), rollChestLoot(tier, rng), dropComponents(pos, kind, n), dismantle(itemId),
//                   analyze(itemId), craft(recipeId), have(type), status(recipe), gasProof(), luck(), blueprints(), dispose() }
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { addTranslations, t, tf, getLang } from '../core/i18n.js';
import { ITEMS, itemDef, scrapTableFor } from './items.js';
import { MOONS } from './moons.js';
import { CREATURES } from './creatures.js';
import { TIERS, TIER_ORDER, tierIndex, rollTier, tierOfItem, tierColor } from './tiers.js';
import { COMPONENTS, COMPONENT_IDS, COMPONENT_COLOR, CREATURE_FLAVOUR, THEME_TABLES, KIND_TABLES, pickWeighted, tableFor } from './components.js';
import { resolveRecipes, recipeById, tierOdds, upgradeInfo, isUpgradable, BLUEPRINTS, CATS, finders } from './recipes.js';
import { STRANGE, STRANGE_IDS, analyzeInfo, KNOWN_REFUND, dismantleBlock, dismantleYield, unlockBlueprint, ensureBlueprints, isStrange } from './research.js';
import { COMPONENT_MODEL_IDS, createComponentModel, createWorkbench, WORKBENCH_SIZE } from '../models/components.js';
import { SHIP } from '../world/ship.js';
import { G } from '../physics/physics.js';
import { createCraftingPanel } from '../ui/panels/crafting.js';
import { SHARD_IDS } from './enhance.js';   // [forge]
import { SPOTS } from '../world/shiplayout.js';

// ---------------------------------------------------------------------------------------------- placement
const BENCH = { x: SPOTS.bench.x, z: SHIP.z0 + WORKBENCH_SIZE.d / 2 + 0.03 };   // -z wall of the ship, right of the arcade
const TOP = WORKBENCH_SIZE.top;
const BENCH_REACH = 7;            // m from the bench (host validation)
const CRAFT_CD = 0.25;            // s between requests per player
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const V3 = (p) => new THREE.Vector3(p.x, p.y, p.z);

// ---------------------------------------------------------------------------------------------- chest loot
const CHEST = {
  common:    { n: [2, 3], w: { scrap: 40, component: 42, tool: 14, weapon: 2, bag: 1, skillbook: 0.5, strange: 0.5 } },
  uncommon:  { n: [2, 4], w: { scrap: 36, component: 38, tool: 15, weapon: 5, bag: 2.5, skillbook: 2, strange: 1.5 } },
  rare:      { n: [3, 4], w: { scrap: 32, component: 34, tool: 14, weapon: 9, bag: 4, skillbook: 4, strange: 3 } },
  epic:      { n: [3, 5], w: { scrap: 28, component: 30, tool: 12, weapon: 12, bag: 6, skillbook: 7, strange: 5 } },
  legendary: { n: [4, 5], w: { scrap: 24, component: 28, tool: 10, weapon: 14, bag: 8, skillbook: 10, strange: 6 } },
  mythic:    { n: [5, 6], w: { scrap: 20, component: 26, tool: 8, weapon: 16, bag: 10, skillbook: 12, strange: 8 } },
};
const CHEST_TOOLS = [['medkit', 10], ['stungrenade', 8], ['glowstick', 10], ['lockpick', 7], ['shells', 8], ['flashlight', 6], ['walkie', 4], ['spraypaint', 4], ['adrenaline', 5], ['proflash', 3], ['booster', 3], ['adblock', 3],
  ['craft_batterypack', 4], ['craft_decoy', 3], ['craft_molotov', 3], ['craft_trap', 2], ['craft_cryo', 2], ['craft_traumakit', 1.5], ['craft_gasmask', 2]];
const avgValue = (d) => (Array.isArray(d?.value) ? (d.value[0] + d.value[1]) / 2 : 0);
const rarityIdx = (d) => tierIndex(d?.tier || d?.rarity || 'common');

/** Roll the contents of a chest of quality `tier`: [{ type, tier, kind }]. Uses only rng.next() (deterministic per seed). */
export function rollChestLoot(tier, rng, opts = {}) {
  const idx = tierIndex(CHEST[tier] ? tier : 'common');
  const cfg = CHEST[TIER_ORDER[idx]];
  const theme = opts.theme || 'factory';
  const n = cfg.n[0] + Math.floor(rng.next() * (cfg.n[1] - cfg.n[0] + 1));
  const cats = Object.entries(cfg.w);
  const out = [];
  const minT = TIER_ORDER[Math.max(0, idx - 2)], maxT = TIER_ORDER[Math.min(TIER_ORDER.length - 1, idx + 1)];
  for (let i = 0; i < n; i++) {
    let tot = 0; for (const [, w] of cats) tot += w;
    let r = rng.next() * tot, cat = cats[0][0];
    for (const [c, w] of cats) { r -= w; if (r <= 0) { cat = c; break; } }
    let type = null;
    if (cat === 'scrap') {
      const table = scrapTableFor(theme).filter(([id]) => ITEMS[id]);
      let best = null;
      for (let k = 0; k <= idx; k++) { const id = pickWeighted(rng, table); if (!best || avgValue(ITEMS[id]) > avgValue(ITEMS[best])) best = id; }
      type = best;
    } else if (cat === 'component') {
      const arcane = idx >= 3 && rng.next() < 0.35;
      type = pickWeighted(rng, arcane ? KIND_TABLES.arcane : (THEME_TABLES[theme] || THEME_TABLES.factory));
      // [forge] forge shards: ~1 in 3 chest components is a shard of the chest's tier or up to two below (never Source Code)
      if (rng.next() < 0.28 + idx * 0.04) type = SHARD_IDS[Math.max(0, Math.min(4, idx - Math.floor(rng.next() * 3)))];
    } else if (cat === 'tool') {
      type = pickWeighted(rng, CHEST_TOOLS.filter(([id]) => ITEMS[id]));
    } else if (cat === 'weapon') {
      const pool = Object.values(ITEMS).filter((d) => d.kind === 'weapon' && d.dmg > 0 && !d.crafted && !(d.price === 0 && d.coin) && rarityIdx(d) <= idx + 1).map((d) => [d.id, 1 + Math.max(0, 3 - Math.abs(rarityIdx(d) - idx)) * 2]);
      if (pool.length) type = pickWeighted(rng, pool);
    } else if (cat === 'bag') {
      const pool = Object.values(ITEMS).filter((d) => d.kind === 'bag' || d.bag || /(field.?pack|hauler|satchel|backpack)/i.test(d.id)).map((d) => [d.id, 1]);
      if (ITEMS.beltbag) pool.push(['beltbag', 3]);
      if (pool.length) type = pickWeighted(rng, pool);
    } else if (cat === 'skillbook') {
      const books = finders.skillbook();
      if (books.length) type = books[Math.floor(rng.next() * books.length)];
    } else if (cat === 'strange') {
      type = pickWeighted(rng, STRANGE_IDS.map((id) => [id, STRANGE[id].weight]));
    }
    if (!type || !ITEMS[type]) { cat = 'component'; type = pickWeighted(rng, THEME_TABLES[theme] || THEME_TABLES.factory); }
    out.push({ type, tier: rollTier(rng, { luck: idx * 0.15, minTier: minT, maxTier: maxT }), kind: cat });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- translations
const TR = {
  'Use WORKBENCH [E]': 'ATÖLYE MASASINI kullan [E]', 'Craft · Dismantle · Analyze': 'Üret · Söktür · Analiz Et', WORKBENCH: 'ATÖLYE MASASI',
  CRAFT: 'ÜRET', DISMANTLE: 'SÖK', ANALYZE: 'ANALİZ', UPGRADE: 'YÜKSELT', BLUEPRINTS: 'ŞEMALAR', Close: 'Kapat', Craft: 'Üret', 'ALL': 'HEPSİ',
  survival: 'HAYATTA KALMA', combat: 'SAVAŞ', tools: 'ALETLER', gear: 'EKİPMAN', arcane: 'GİZEMLİ', 'BLUEPRINT UNLOCKED': 'ŞEMA AÇILDI',
  'Scrap Metal': 'Hurda Metal', 'Wood Planks': 'Tahta', 'Copper Cable': 'Bakır Kablo', 'Battery Cell': 'Pil', Fuse: 'Sigorta', 'Circuit Board': 'Devre Kartı',
  Sensor: 'Sensör', 'Fuel Canister': 'Yakıt Bidonu', Coolant: 'Soğutucu', Chemicals: 'Kimyasal', Cloth: 'Kumaş', 'Data Crystal': 'Veri Kristali',
  Ectoplasm: 'Ektoplazma', 'Access Card': 'Erişim Kartı', 'Battery Pack': 'Pil Paketi', 'Noise Decoy': 'Gürültü Tuzağı', 'Portable Floodlight': 'Taşınabilir Projektör',
  'Ecto Lantern': 'Ekto Fener', 'Gas Mask': 'Gaz Maskesi', 'Bear Trap': 'Ayı Kapanı', Molotov: 'Molotof', 'EMP Charge': 'EMP Yükü', 'Cryo Grenade': 'Kryo Bombası',
  'Trauma Kit': 'Travma Kiti', 'Nail Bat': 'Çivili Sopa', 'Black Box': 'Kara Kutu', 'Broken AI Core': 'Bozuk YZ Çekirdeği', 'Unknown Egg': 'Bilinmeyen Yumurta', 'The Watch': 'Saat',
  Medkit: 'İlk Yardım Çantası', 'Stun Grenade': 'Sersemletici Bomba', 'Lockpicker': 'Maymuncuk', 'Glowstick Bundle': 'Işık Çubuğu Demeti', 'Duct-Tape Armor': 'Koli Bandı Zırhı',
  'Shotgun Shells': 'Pompalı Fişeği', Rounds: 'Mermi', Nails: 'Çivi', Bolts: 'Ok', 'Access Card Copy': 'Erişim Kartı Kopyası', 'Pro Flashlight': 'Pro Fener', 'Signal Booster': 'Sinyal Güçlendirici',
  'Adblock Spray': 'Reklam Engelleyici Sprey', 'Belt Bag': 'Kemer Çantası', 'Field Pack': 'Saha Çantası', 'Hauler Frame': 'Taşıyıcı Çerçeve', 'Skillbook Binding': 'Beceri Kitabı Ciltleme',
  'Masterwork Upgrades': 'Şaheser Yükseltmeler', 'Hauler Frame ': 'Taşıyıcı Çerçeve',
  // workbench panel + toasts (added in the wave-1 review: these were English-only)
  Crafted: 'Üretildi', Recharged: 'Şarj edildi', 'No battery items to recharge.': 'Şarj edilecek pilli eşya yok.',
  'New recipe available at the workbench.': 'Atölye masasında yeni bir tarif var.',
  'Gas mask on. You breathe filtered air.': 'Gaz maskesi takıldı. Filtrelenmiş hava soluyorsun.', 'Gas mask off.': 'Gaz maskesi çıkarıldı.',
  'Patched up (trauma kit).': 'Yaraların sarıldı (travma kiti).', 'Trap set.': 'Tuzak kuruldu.',
  LUCK: 'ŞANS', 'Ingredients: items you hold + items lying on the bench.': 'Malzemeler: elindeki eşyalar + tezgâhtaki eşyalar.',
  'Blueprint required': 'Şema gerekli', 'Nothing here yet.': 'Burada henüz bir şey yok.', 'Select a recipe.': 'Bir tarif seç.',
  INGREDIENTS: 'MALZEMELER', 'Credits (ship funds)': 'Kredi (gemi fonu)', Blueprint: 'Şema', KNOWN: 'BİLİNİYOR', UNKNOWN: 'BİLİNMİYOR',
  'Unlocked by analyzing': 'Analizle açılır', 'TIER CHANCE': 'SEVİYE ŞANSI', 'MISSING PARTS': 'EKSİK PARÇALAR',
  'This item has no tier.': 'Bu eşyanın seviyesi yok.', 'WORKING...': 'ÇALIŞIYOR...',
  'Pick a weapon you carry or leave on the bench.': 'Taşıdığın ya da tezgâha bıraktığın bir silah seç.',
  'No weapon in reach. Hold one or put it on the bench.': 'Erişimde silah yok. Birini tut ya da tezgâha koy.',
  'Select a weapon.': 'Bir silah seç.', 'Already at the top tier.': 'Zaten en üst seviyede.', COST: 'MALİYET', 'SUCCESS CHANCE': 'BAŞARI ŞANSI',
  'On failure the weapon is kept; parts are lost and half the credits.': 'Başarısız olursa silah kalır; parçalar ve kredilerin yarısı gider.',
  'on bench': 'tezgâhta', 'Nothing suitable in reach. Hold items or put them on the bench.': 'Erişimde uygun bir şey yok. Eşya tut ya da tezgâha koy.',
  'Select an item.': 'Bir eşya seç.', 'Turn scrap into components instead of selling it.': 'Hurdayı satmak yerine parçalara çevir.',
  'Sells for': 'Satış değeri', 'SELL / DISMANTLE / KEEP - your call.': 'SAT / SÖK / SAKLA - karar senin.', YIELDS: 'VERİR',
  'Strange items and creature drops: learn from them instead of selling them.': 'Garip eşyalar ve yaratık parçaları: satmak yerine onlardan öğren.',
  STRANGE: 'GARİP', 'creature sample': 'yaratık örneği', 'WHAT YOU MIGHT LEARN': 'ÖĞRENEBİLECEKLERİN',
  'Analyze strange items and big creature drops at the workbench to permanently unlock advanced recipes.': 'Garip eşyaları ve büyük yaratık parçalarını atölye masasında analiz ederek gelişmiş tarifleri kalıcı olarak aç.',
  'already known: parts recovered': 'zaten biliniyor: parçalar geri kazanıldı', UPGRADED: 'YÜKSELTİLDİ', FAILED: 'BAŞARISIZ', 'The weapon survived.': 'Silah sağ kurtuldu.', ERROR: 'HATA',
  'Not yet discovered.': 'Henüz keşfedilmedi.', Source: 'Kaynak', CRAFTED: 'ÜRETİLDİ', DISMANTLED: 'SÖKÜLDÜ', 'BLUEPRINT!': 'ŞEMA!', ANALYZED: 'ANALİZ EDİLDİ',
};
const trItems = () => addTranslations(TR);

// ---------------------------------------------------------------------------------------------- install
export function installCrafting(game) {
  trItems();
  const mods = game.mods;
  const offs = [];
  let disposed = false;
  const listeners = new Set();
  const armed = new Map();          // host: item id -> { kind, t, by, active? }
  const fires = [];                 // host: { p, t, r, by, acc }
  const decoys = [];                // host: { p, t, acc, id }
  const clientFx = [];              // client: visual effects { kind, p, t, ... }
  const pendingTier = new Map();    // id -> [tier, expires]
  const lastReq = new Map();        // host: player id -> time
  const stats = { populate: null, crafted: 0, dismantled: 0, analyzed: 0, upgraded: 0, drops: 0 };
  let panel = null;
  let gasWorn = false;
  let maskEl = null;
  let sharedRng = null;
  const rngShared = () => (sharedRng ||= new RNG((Math.random() * 4294967296) >>> 0));

  // ---- item models (world items + inventory icons pick them up from the mod registry)
  if (mods?.itemModels) for (const id of COMPONENT_MODEL_IDS) if (!mods.itemModels.has(id)) mods.itemModels.set(id, () => createComponentModel(id));

  // ---- workbench in the ship
  const bench = createWorkbench();
  bench.group.position.set(BENCH.x, 0, BENCH.z);
  game.ship?.group?.add(bench.group);
  const colliders = [];
  for (const [cx, cy, cz, hx, hy, hz] of bench.colliders) colliders.push(game.physics.addStaticBox(BENCH.x + cx, cy, BENCH.z + cz, hx, hy, hz, 0, G.STATIC, { kind: 'static' }));
  const lampEmitter = game.lights?.add({ pos: new THREE.Vector3(BENCH.x + bench.lampPos.x, bench.lampPos.y + 0.1, BENCH.z + bench.lampPos.z), color: 0xffd9a0, intensity: 0.85, distance: 6.5, group: 'ship' });
  const benchIP = new THREE.Vector3(BENCH.x, TOP + 0.25, BENCH.z + WORKBENCH_SIZE.d / 2 + 0.1);
  const benchCenter = new THREE.Vector3(BENCH.x, 0, BENCH.z);

  // ------------------------------------------------------------------------------------------ helpers
  const theme = () => game.world?.facility?.layout?.theme || MOONS[game.run?.moon]?.interior || 'factory';
  const luck = () => {
    let l = 0;
    try { l += Number(game.rpg?.bonus?.('craftLuck')) || 0; } catch { /* soft */ }
    try { l += (Number(game.balance?.lootLuck?.()) || 0) * 0.5; } catch { /* soft */ }
    l += (game.profile?.skills?.lck || 0) * 0.012 + Object.keys(game.profile?.blueprints || {}).length * 0.02;
    return clamp(l, 0, 1.2);
  };
  const posOf = (id) => (id === game.selfId ? game.player.pos : game.remotes.get(id)?.pos);
  const nearBench = (id) => { const p = posOf(id); return !!p && Math.hypot(p.x - BENCH.x, p.z - BENCH.z) < BENCH_REACH && p.y > -1 && p.y < 4.5; };
  const onBench = (it) => {
    const p = it.obj.position;
    return it.state === 'world' && !it.carrier && !it.owner && Math.abs(p.x - BENCH.x) < WORKBENCH_SIZE.w / 2 + 0.4 && p.z > BENCH.z - WORKBENCH_SIZE.d / 2 - 0.2 && p.z < BENCH.z + WORKBENCH_SIZE.d / 2 + 1.3 && p.y > -0.3 && p.y < 2.4;
  };
  /** every item a player can spend: what they hold (hotbar + bag) and what lies on / near the bench */
  const sourcesFor = (pid) => {
    const bench_ = [], held = [];
    for (const it of game.items.all()) {
      if (it.holder === pid) held.push(it);
      else if (onBench(it)) bench_.push(it);
    }
    return [...bench_, ...held];
  };
  const usable = (it) => !it.soulbound && it.type !== 'body' && !it.selling;
  const countIn = (src, type) => src.reduce((n, it) => n + (it.type === type && usable(it) ? 1 : 0), 0);
  const invCount = (type) => { try { const v = Number(game.inventory?.countItem?.(type)); return Number.isFinite(v) ? v : 0; } catch { return 0; } };

  /** client + host: how many of `type` this player can spend (self only on clients) */
  function have(type, pid = game.selfId) {
    const src = sourcesFor(pid);
    const n = countIn(src, type);
    return pid === game.selfId ? Math.max(n, invCount(type)) : n;
  }
  function status(r, pid = game.selfId) {
    const src = sourcesFor(pid);
    const rows = r.in.map(([id, need]) => { const h = Math.max(countIn(src, id), pid === game.selfId ? invCount(id) : 0); return { id, need, have: h, ok: h >= need }; });
    const cr = { need: r.credits || 0, have: game.run?.credits || 0 };
    cr.ok = cr.have >= cr.need;
    const bp = { need: r.bp, ok: !r.bp || !!game.profile?.blueprints?.[r.bp] };
    return { rows, credits: cr, bp, can: rows.every((x) => x.ok) && cr.ok && bp.ok };
  }

  // ------------------------------------------------------------------------------------------ host: sources / spawning
  function consume(src, list) {
    // list: [[type, n]]. Bench items first, then held. Returns false (and consumes nothing) when short.
    for (const [type, n] of list) if (countIn(src, type) < n) return false;
    for (const [type, n] of list) {
      let left = n;
      for (const it of src) {
        if (left <= 0) break;
        if (it.type !== type || !usable(it) || it._crUsed) continue;
        it._crUsed = true;
        game.net.broadcast('it', { e: 'rm', id: it.id });
        left--;
      }
    }
    return true;
  }
  function benchSpot(i, n) {
    const span = Math.min(1.0, 0.2 * n);
    const x = BENCH.x - 0.05 + (n > 1 ? -span / 2 + (span * i) / (n - 1) : 0);
    return new THREE.Vector3(x, TOP + 0.16, BENCH.z + 0.1 + (i % 2) * 0.09);
  }
  function setTier(id, tier) {
    if (!id || !tier) return;
    const it = game.items.get(id);
    if (it) it.tier = tier;
    game.net.broadcast('modmsg', { mod: 'crafting', k: 'tier', id, tier });
  }
  function spawnAtBench(type, n, tier, extra = {}) {
    const ids = [];
    for (let i = 0; i < n; i++) {
      const id = game.items.hostSpawn(type, benchSpot(i, n), { tier: tier || undefined, ...extra });
      if (id) { ids.push(id); if (tier) setTier(id, tier); }
    }
    return ids;
  }
  const reply = (to, o) => game.net.sendTo(to, 'modmsg', { mod: 'crafting', ...o });
  const fx = (o) => game.net.broadcast('fx', { k: 'crfx', ...o });
  const xpTo = (to, xp, reason) => game.net.broadcast('xp', { to, xp: Math.round(xp), coin: 0, reason });

  // ------------------------------------------------------------------------------------------ host: craft / dismantle / analyze / upgrade
  function hostMake(d, from) {
    const r = recipeById(String(d.id));
    if (!r || r.hidden) return reply(from, { k: 'err', msg: 'Unknown recipe.' });
    if (r.bp && !(Array.isArray(d.bps) && d.bps.includes(r.bp))) return reply(from, { k: 'err', msg: 'Blueprint required.' });
    const src = sourcesFor(from);
    for (const [id, n] of r.in) if (countIn(src, id) < n) return reply(from, { k: 'err', msg: 'Missing ingredients.' });
    if (r.credits && (game.run?.credits || 0) < r.credits) return reply(from, { k: 'err', msg: 'Not enough credits.' });
    let out = r.out;
    if (r.outs && r.outs.length) out = r.outs[Math.floor(rngShared().next() * r.outs.length)];
    if (!consume(src, r.in)) return reply(from, { k: 'err', msg: 'Missing ingredients.' });
    if (r.credits) { game.run.credits -= r.credits; game.broadcastRun?.(['credits']); }
    const tier = r.tier ? rollTier(rngShared(), { luck: clamp(Number(d.luck) || 0, 0, 1.2), minTier: r.tier[0], maxTier: r.tier[1] }) : null;
    const ids = spawnAtBench(out, r.n, tier);
    stats.crafted++;
    xpTo(from, 8 + (tier ? tierIndex(tier) * 5 : 0) + r.in.length * 2, 'Crafted ' + (ITEMS[out]?.name || out));
    fx({ kind: 'craft', p: [BENCH.x, TOP + 0.2, BENCH.z + 0.1], c: tier ? TIERS[tier].hex : 0xffb060 });
    reply(from, { k: 'crafted', recipe: r.id, out, n: r.n, tier, ids });
  }

  function findSource(from, id) {
    const it = game.items.get(id);
    if (!it) return null;
    if (it.holder === from || (onBench(it))) return it;
    return null;
  }
  function hostDismantle(d, from) {
    const it = findSource(from, d.id);
    if (!it) return reply(from, { k: 'err', msg: 'Item not found.' });
    const block = dismantleBlock(it);
    if (block) return reply(from, { k: 'err', msg: block });
    const yieldList = dismantleYield(it.type, { value: it.baseValue || it.value, theme: theme() });
    game.net.broadcast('it', { e: 'rm', id: it.id });
    const ids = [];
    let k = 0;
    const total = yieldList.reduce((a, [, n]) => a + n, 0);
    for (const [cid, n] of yieldList) for (let i = 0; i < n; i++) { ids.push(game.items.hostSpawn(cid, benchSpot(k++, total), {})); }
    stats.dismantled++;
    xpTo(from, 5 + total * 2, 'Dismantled ' + (it.def.name || it.type));
    fx({ kind: 'craft', p: [BENCH.x, TOP + 0.2, BENCH.z + 0.1], c: 0x9aa0a4 });
    reply(from, { k: 'dismantled', type: it.type, yields: yieldList, ids });
  }

  function hostAnalyze(d, from) {
    const it = findSource(from, d.id);
    if (!it) return reply(from, { k: 'err', msg: 'Item not found.' });
    if (it.soulbound) return reply(from, { k: 'err', msg: 'Soulbound.' });
    const info = analyzeInfo(it.type);
    if (!info) return reply(from, { k: 'err', msg: 'Nothing to learn from that.' });
    const known = !!info.bp && Array.isArray(d.bps) && d.bps.includes(info.bp);
    const bp = info.bp && !known ? info.bp : null;
    const comps = known ? [...info.comps, ...KNOWN_REFUND] : info.comps;
    const xp = known ? Math.round(info.xp * 0.6) : info.xp;
    game.net.broadcast('it', { e: 'rm', id: it.id });
    let k = 0;
    const total = comps.reduce((a, [, n]) => a + n, 0);
    for (const [cid, n] of comps) for (let i = 0; i < n; i++) game.items.hostSpawn(cid, benchSpot(k++, total), {});
    stats.analyzed++;
    xpTo(from, xp, 'Analysis: ' + (it.def.name || it.type));
    fx({ kind: 'analyze', p: [BENCH.x, TOP + 0.25, BENCH.z + 0.1], c: bp ? 0x5ab8ff : 0x9dd6ff });
    reply(from, { k: 'analyzed', type: it.type, name: info.name, bp, known, xp, comps, lore: info.lore });
  }

  function hostUpgrade(d, from) {
    const it = findSource(from, d.id);
    if (!it || !isUpgradable(it.def)) return reply(from, { k: 'err', msg: 'Pick a weapon to upgrade.' });
    const from_ = tierOfItem(it, it.def);
    const u = upgradeInfo(from_, clamp(Number(d.luck) || 0, 0, 1.2));
    if (!u) return reply(from, { k: 'err', msg: tierIndex(from_) >= 2 && from_ !== 'mythic' ? 'Workbench upgrades stop at Rare. Use the Ascension Altar at HQ.' : 'Already at the top tier.' });   // [forge] cap
    if (u.bp && !(Array.isArray(d.bps) && d.bps.includes(u.bp))) return reply(from, { k: 'err', msg: 'Blueprint required: ' + BLUEPRINTS[u.bp].name });
    const src = sourcesFor(from).filter((x) => x !== it);
    for (const [id, n] of u.in) if (countIn(src, id) < n) return reply(from, { k: 'err', msg: 'Missing ingredients.' });
    if ((game.run?.credits || 0) < u.credits) return reply(from, { k: 'err', msg: 'Not enough credits.' });
    consume(src, u.in);
    const ok = rngShared().next() < u.chance;
    game.run.credits -= ok ? u.credits : Math.ceil(u.credits / 2);
    game.broadcastRun?.(['credits']);
    let newId = null;
    if (ok) {
      // replace the weapon by an identical one one tier higher (affixes, charges and soulbinding are kept)
      const pos = benchSpot(0, 1);
      game.net.broadcast('it', { e: 'rm', id: it.id });
      newId = game.items.hostSpawn(it.type, pos, { tier: u.to, af: it.affix || undefined, value: it.value, baseValue: it.baseValue, soulbound: it.soulbound || undefined, battery: it.battery ?? undefined, charges: it.charges ?? undefined, plus: it.plus || undefined, oc: it.oc?.length ? [...it.oc] : undefined });   // [forge] keep +N / overclocks
      setTier(newId, u.to);
      stats.upgraded++;
    }
    xpTo(from, ok ? 30 + tierIndex(u.to) * 20 : 8, ok ? 'Weapon upgraded' : 'Upgrade failed');
    fx({ kind: ok ? 'craft' : 'fail', p: [BENCH.x, TOP + 0.2, BENCH.z + 0.1], c: ok ? TIERS[u.to].hex : 0xff4a3a });
    reply(from, { k: 'upgraded', ok, type: it.type, from: from_, to: u.to, chance: u.chance, id: newId });
  }

  function hostCraftRequest(d, from) {
    if (disposed) return;
    const now = performance.now() / 1000;
    if (now - (lastReq.get(from) || -9) < CRAFT_CD) return reply(from, { k: 'err', msg: 'Slow down.' });
    lastReq.set(from, now);
    if (!nearBench(from)) return reply(from, { k: 'err', msg: 'Stand at the workbench.' });
    try {
      if (d.op === 'make') hostMake(d, from);
      else if (d.op === 'dismantle') hostDismantle(d, from);
      else if (d.op === 'analyze') hostAnalyze(d, from);
      else if (d.op === 'upgrade') hostUpgrade(d, from);
    } catch (e) { console.warn('[crafting]', e); reply(from, { k: 'err', msg: 'The fabricator jammed.' }); }
  }

  // ------------------------------------------------------------------------------------------ host: crafted item mechanics
  const ARM = { craft_molotov: { kind: 'molotov', fuse: 1.4 }, craft_decoy: { kind: 'decoy', fuse: 1.0 }, craft_emp: { kind: 'emp', fuse: 1.5 }, craft_cryo: { kind: 'cryo', fuse: 1.5 }, craft_trap: { kind: 'trap', fuse: 1.2 } };
  const MECH = new Set(['turret', 'mine', 'scuttler', 'moderator', 'support', 'ticketswarm', 'editor', 'tamagotchi', 'clickbait', 'replyguy', 'mimicdoor']);
  function hostUse(d, from) {
    const it = game.items.get(d.id);
    if (!it) return;
    if (d.op === 'pack') {
      if (it.holder !== from || it.type !== 'craft_batterypack') return;
      let n = 0;
      for (const o of game.items.all()) {
        if (o.holder !== from || !o.def.battery || o === it) continue;
        o.battery = o.def.battery;
        game.net.broadcast('itst', { id: o.id, b: o.battery });
        game.onItemState?.(o);
        n++;
      }
      game.net.broadcast('it', { e: 'rm', id: it.id });
      fx({ kind: 'zap', p: [...(posOf(from)?.toArray?.() || [0, 1, 0])].map((v, i) => (i === 1 ? v + 1.2 : v)), c: 0x70ff90 });
      reply(from, { k: 'pack', n });
    } else if (d.op === 'arm') {
      const a = ARM[it.type];
      if (!a || armed.has(it.id) || (it.holder && it.holder !== from)) return;
      armed.set(it.id, { ...a, t: a.fuse, by: from });
    }
  }
  function creaturesNear(pos, r, dy = 3) {
    const out = [];
    for (const c of game.creatures.host.values()) if (!c.dead && Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) < r && Math.abs(c.pos.y - pos.y) < dy) out.push(c);
    return out;
  }
  function detonate(it, a) {
    const pos = it.obj.position.clone();
    const P = [pos.x, pos.y, pos.z];
    const rm = () => game.net.broadcast('it', { e: 'rm', id: it.id });
    if (a.kind === 'molotov') {
      rm();
      fires.push({ p: pos, t: 6, r: 3.2, by: a.by, acc: 0 });
      fx({ kind: 'fire', p: P, t: 6, r: 3.2 });
      game.net.broadcast('fx', { k: 'snd', s: 'glass_break', p: P, v: 1, r: 6 });
      game.creatures.noise(pos, 2);
    } else if (a.kind === 'decoy') {
      a.active = true; a.t = 12; a.acc = 0;
      decoys.push({ p: pos, t: 12, acc: 0, id: it.id, by: a.by });
      armed.delete(it.id);
    } else if (a.kind === 'emp') {
      rm();
      fx({ kind: 'emp', p: P, r: 10 });
      for (const c of creaturesNear(pos, 10, 5)) {
        if (MECH.has(c.type)) { c.disabledT = Math.max(c.disabledT || 0, 20); game.creatures.damage(c.id, c.maxHp === null ? 0 : 60, a.by, { stun: 8 }); }
        else game.creatures.damage(c.id, 0, a.by, { stun: 1.5 });
      }
    } else if (a.kind === 'cryo') {
      rm();
      fx({ kind: 'cryo', p: P, r: 5 });
      game.net.broadcast('fx', { k: 'snd', s: 'stun_bang', p: P, v: 0.5, r: 5 });
      for (const c of creaturesNear(pos, 5)) game.creatures.damage(c.id, 0, a.by, { stun: 5 });
    }
  }
  function hostTick(dt) {
    if (armed.size) {
      for (const [id, a] of [...armed]) {
        const it = game.items.get(id);
        if (!it) { armed.delete(id); continue; }
        if (it.state !== 'world') { if (a.kind === 'trap') { a.set = false; a.t = 1.2; } continue; }   // picked up again
        if (a.kind === 'trap') {
          a.t -= dt;
          if (a.t > 0) continue;
          a.acc = (a.acc || 0) - dt;
          if (a.acc > 0) continue;
          a.acc = 0.15;
          const hit = creaturesNear(it.obj.position, 1.05, 1.4).find((c) => !c.def?.boss && c.maxHp !== null && !c.def?.hazard);
          if (hit) {
            const p = it.obj.position;
            game.net.broadcast('it', { e: 'rm', id });
            armed.delete(id);
            fx({ kind: 'trap', p: [p.x, p.y, p.z] });
            game.net.broadcast('fx', { k: 'snd', s: 'hit_metal', p: [p.x, p.y, p.z], v: 1, r: 5 });
            game.creatures.damage(hit.id, 30, a.by, { stun: 6 });
          }
          continue;
        }
        a.t -= dt;
        if (a.t <= 0 && !a.active) { detonate(it, a); if (a.kind !== 'decoy') armed.delete(id); }
      }
    }
    for (let i = fires.length - 1; i >= 0; i--) {
      const f = fires[i];
      f.t -= dt; f.acc += dt;
      if (f.acc >= 0.5) {
        f.acc = 0;
        for (const c of creaturesNear(f.p, f.r, 2.6)) if (c.maxHp !== null && !c.def?.hazard) game.creatures.damage(c.id, 9, f.by, {});
        for (const p of game.aiPlayers()) if (!p.dead && Math.hypot(p.pos.x - f.p.x, p.pos.z - f.p.z) < f.r * 0.7 && Math.abs(p.pos.y - f.p.y) < 2) game.hostHurtPlayer(p.id, 5, 'fire', f.by, f.p);
      }
      if (f.t <= 0) fires.splice(i, 1);
    }
    for (let i = decoys.length - 1; i >= 0; i--) {
      const dcy = decoys[i];
      const it = game.items.get(dcy.id);
      dcy.t -= dt; dcy.acc -= dt;
      if (!it || it.state !== 'world') dcy.t = Math.min(dcy.t, 0);
      else dcy.p.copy(it.obj.position);
      if (dcy.acc <= 0 && dcy.t > 0) {
        dcy.acc = 1.6;
        game.creatures.noise(dcy.p, 3.2);
        game.net.broadcast('fx', { k: 'snd', s: 'phone_ring', p: [dcy.p.x, dcy.p.y + 0.2, dcy.p.z], v: 1, r: 7, m: 70 });
      }
      if (dcy.t <= 0) { if (it) game.net.broadcast('it', { e: 'rm', id: dcy.id }); armed.delete(dcy.id); decoys.splice(i, 1); }
    }
  }

  // ------------------------------------------------------------------------------------------ host: world spawns
  function onPopulated() {
    if (!game.isHost || disposed) return;
    const run = game.run, fac = game.world?.facility, moon = MOONS[run?.moon];
    if (!fac || !run || !moon) return;
    const th = fac.layout?.theme || moon.interior || 'factory';
    const rng = new RNG((run.seed ^ 0xc4af7) >>> 0);
    const table = THEME_TABLES[th] || THEME_TABLES.factory;
    const size = clamp(moon.size || 1, 0.6, 2.4);
    let count = rng.int(6, 12);
    count = clamp(Math.round(count * (0.85 + 0.15 * size)), 6, 14);
    const taken = [];
    for (const it of game.items.all()) if (it.state === 'world') taken.push(it.obj.position);
    const spots = rng.shuffle((fac.scrapSpots || []).filter((s) => !s.item));
    const placed = { components: 0, byId: {}, strange: null };
    for (const s of spots) {
      if (placed.components >= count) break;
      if (taken.some((p) => Math.abs(p.x - s.x) < 0.7 && Math.abs(p.z - s.z) < 0.7 && Math.abs(p.y - s.y) < 1.5)) continue;
      const id = pickWeighted(rng, table);
      game.items.hostSpawn(id, new THREE.Vector3(s.x, s.y + 0.4, s.z), {});
      taken.push(new THREE.Vector3(s.x, s.y, s.z));
      placed.components++; placed.byId[id] = (placed.byId[id] || 0) + 1;
    }
    // strange item: rare (30% + 4% per quota), tucked in one of the deepest rooms
    if (rng.chance(clamp(0.3 + 0.04 * (run.quotaIndex || 0), 0.3, 0.55))) {
      const deep = spots.slice().sort((a, b) => (b.dist || 0) - (a.dist || 0)).slice(0, Math.max(3, Math.ceil(spots.length * 0.25)));
      const s = deep.length ? rng.pick(deep) : null;
      if (s) {
        const id = pickWeighted(rng, STRANGE_IDS.map((k) => [k, STRANGE[k].weight]));
        game.items.hostSpawn(id, new THREE.Vector3(s.x, s.y + 0.45, s.z), { tier: ITEMS[id].tier });
        placed.strange = id;
      }
    }
    // a couple of parts lying around outside
    for (const s of (game.world?.outdoor?.outdoorScrapSpots || []).slice(3, 5)) {
      const id = pickWeighted(rng, KIND_TABLES[rng.chance(0.5) ? 'metal' : 'wood']);
      game.items.hostSpawn(id, new THREE.Vector3(s.x, s.y + 0.5, s.z), {});
      placed.components++; placed.byId[id] = (placed.byId[id] || 0) + 1;
    }
    stats.populate = placed;
  }

  function dropComponents(pos, kind = 'random', n = 1, opts = {}) {
    if (!game.isHost || !game.items || !pos) return [];
    const tbl = tableFor(kind, theme());
    const rng = opts.rng || rngShared();
    const out = [];
    for (let i = 0; i < Math.max(0, Math.floor(n)); i++) {
      const id = opts.id || pickWeighted(rng, tbl);
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.2;
      const p = new THREE.Vector3(pos.x + Math.cos(a) * 0.25, pos.y + 0.4, pos.z + Math.sin(a) * 0.25);
      const sid = game.items.hostSpawn(id, p, { linvel: [Math.cos(a) * sp, 2 + Math.random() * 1.6, Math.sin(a) * sp] });
      if (sid) out.push(sid);
    }
    stats.drops += out.length;
    return out;
  }

  function onKilled(c) {
    if (!game.isHost || !c || c.compDropped) return;
    const def = c.def || CREATURES[c.type];
    if (!def || def.noCompDrop) return;
    if (def.hazard && !['turret', 'mine'].includes(c.type)) return;
    c.compDropped = true;
    const cfg = def.compDrop || {};
    const kind = cfg.kind || CREATURE_FLAVOUR[c.type] || 'random';
    let chance = cfg.chance ?? (0.2 + Math.min(0.3, (def.power || 1) * 0.06));
    if (c.elite) chance = Math.min(0.95, chance * 1.8 + 0.1);
    if (def.boss) chance = 1;
    if (Math.random() >= chance) return;
    const n = cfg.n ?? (def.boss ? 4 : 1 + ((def.power || 1) >= 3 ? 1 : 0) + (c.elite ? 1 : 0));
    const at = c.pos.clone().add(new THREE.Vector3(0, 0.4, 0));
    dropComponents(at, kind, n);
    if (def.boss) { dropComponents(at, 'arcane', 1, { id: 'comp_crystal' }); dropComponents(at, 'arcane', 1, { id: 'comp_ecto' }); }
  }
  // wrap the host's creature-kill hook (no edit of host.js needed); restored in dispose
  const origKilled = game.hostOnCreatureKilled;
  const killWrap = function (c, by) { const r = origKilled?.call(this, c, by); try { onKilled(c, by); } catch (e) { console.warn('[crafting] kill drop', e); } return r; };
  if (typeof origKilled === 'function') game.hostOnCreatureKilled = killWrap;

  // tier stat bonus for melee weapons (only where the item carries an explicit tier and nobody else applies it)
  const origMelee = game.meleeSwing;
  const meleeWrap = function (it, power) {
    const before = this.nextSwing;
    const r = origMelee.call(this, it, power);
    try {
      if (it?.tier && TIERS[it.tier] && this.nextSwing !== before && this.pendingHit && !game.inventory?.appliesTierDamage && !game.balance?.appliesTierDamage && !game.shop?.appliesTierDamage) {
        const base = TIERS[tierOfItem({ ...it, tier: null }, it.def)]?.statMul || 1;
        const m = TIERS[it.tier].statMul / base;
        if (m > 0 && m !== 1) this.pendingHit.dmg *= m;
      }
    } catch { /* cosmetic */ }
    return r;
  };
  if (typeof origMelee === 'function') game.meleeSwing = meleeWrap;

  // ------------------------------------------------------------------------------------------ client: messages, effects, item use
  function applyPendingTier() {
    if (!pendingTier.size) return;
    const now = performance.now();
    for (const [id, [tier, exp]] of pendingTier) {
      const it = game.items.get(id);
      if (it) { it.tier = tier; pendingTier.delete(id); } else if (now > exp) pendingTier.delete(id);
    }
  }
  function onMessage(d, from) {
    if (disposed || !d || d.mod !== 'crafting') return;
    if (from !== game.net?.hostId && !(game.isHost && from === game.selfId)) return;
    if (d.k === 'tier') {
      const it = game.items.get(d.id);
      if (it) it.tier = d.tier; else pendingTier.set(d.id, [d.tier, performance.now() + 6000]);
      return;
    }
    if (d.k === 'analyzed' && d.bp) {
      const p = game.profile;
      if (unlockBlueprint(p, d.bp)) { game.progress?.save?.(); blueprintMoment(d.bp, d); }
    }
    if (d.k === 'crafted' || d.k === 'upgraded' || d.k === 'dismantled') {
      const p = game.profile;
      const cs = (p.craftStats ||= { made: 0, byId: {} });
      cs.made++;
      if (d.recipe) cs.byId[d.recipe] = (cs.byId[d.recipe] || 0) + 1;
      game.progress?.save?.();
    }
    if (d.k === 'err') game.audio?.ui?.('ui_error', 0.6);
    for (const fn of [...listeners]) { try { fn(d); } catch (e) { console.warn('[crafting] listener', e); } }
    if (!panel) toastResult(d);
  }
  function toastResult(d) {
    const ui = game.ui;
    if (d.k === 'crafted') ui?.toast(`${t('Crafted')}: ${t(ITEMS[d.out]?.name || d.out)}${d.n > 1 ? ' x' + d.n : ''}${d.tier ? ' [' + d.tier.toUpperCase() + ']' : ''}`, 'good');
    else if (d.k === 'err') ui?.toast(t(d.msg), 'bad');
    else if (d.k === 'pack') ui?.toast(d.n ? `${t('Recharged')} ${d.n}` : t('No battery items to recharge.'), d.n ? 'good' : 'info');
  }

  // "BLUEPRINT UNLOCKED": animated blueprint-paper banner
  const CSS = `.crf-bp{position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:60;pointer-events:none;min-width:360px;max-width:min(560px,92vw);padding:14px 22px 14px 18px;color:#dff2ff;
 font-family:var(--font,'VT323',monospace);border:2px solid #7fc4ff;background:#0d2f57 repeating-linear-gradient(0deg,rgba(150,205,255,.16) 0 1px,transparent 1px 14px),repeating-linear-gradient(90deg,rgba(150,205,255,.16) 0 1px,transparent 1px 14px);
 box-shadow:0 0 34px rgba(90,170,255,.55),inset 0 0 30px rgba(120,190,255,.2);animation:crfBpIn .55s cubic-bezier(.2,1.4,.4,1) both}
.crf-bp.out{animation:crfBpOut .5s ease-in both}
.crf-bp-k{font-family:var(--font2,monospace);font-size:12px;letter-spacing:3px;color:#9dd4ff;text-shadow:0 0 10px #4aa8ff}
.crf-bp-n{font-size:38px;line-height:1.05;color:#fff;text-shadow:0 0 12px #6ab8ff,2px 2px 0 #06203f;margin:4px 0 2px}
.crf-bp-d{font-size:20px;opacity:.9}.crf-bp-l{font-size:17px;opacity:.7;margin-top:6px;border-top:1px dashed rgba(150,205,255,.45);padding-top:5px}
.crf-bp-i{position:absolute;right:16px;top:10px;font-size:46px;opacity:.85;filter:drop-shadow(0 0 8px #6ab8ff)}
.crf-bp::after{content:'';position:absolute;top:0;bottom:0;width:70px;left:-90px;background:linear-gradient(90deg,transparent,rgba(190,230,255,.45),transparent);transform:skewX(-20deg);animation:crfShine 1.5s .3s ease-out both}
@keyframes crfBpIn{from{opacity:0;transform:translateX(-50%) translateY(-24px) scale(.9)}to{opacity:1;transform:translateX(-50%)}}
@keyframes crfBpOut{to{opacity:0;transform:translateX(-50%) translateY(-16px) scale(.96)}}@keyframes crfShine{to{left:110%}}
.crf-mask{position:fixed;inset:0;z-index:5;pointer-events:none;background:radial-gradient(ellipse at 50% 46%,rgba(0,0,0,0) 46%,rgba(8,14,6,.72) 100%);box-shadow:inset 0 0 90px rgba(0,0,0,.65);animation:crfBreath 3.4s ease-in-out infinite}
@keyframes crfBreath{50%{opacity:.82}}`;
  function ensureCss() {
    if (typeof document === 'undefined' || document.getElementById('crf-fx-style')) return;
    const s = document.createElement('style'); s.id = 'crf-fx-style'; s.textContent = CSS; document.head.appendChild(s);
  }
  function blueprintMoment(id) {
    const b = BLUEPRINTS[id];
    if (!b || typeof document === 'undefined') return;
    ensureCss();
    const el = document.createElement('div');
    el.className = 'crf-bp';
    el.innerHTML = `<div class="crf-bp-i">${b.icon || '📐'}</div><div class="crf-bp-k">${t('BLUEPRINT UNLOCKED')} · ${Object.keys(game.profile.blueprints || {}).length}/${Object.keys(BLUEPRINTS).length}</div><div class="crf-bp-n">${t(b.name)}</div><div class="crf-bp-d">${t(b.desc)}</div><div class="crf-bp-l">${t('New recipe available at the workbench.')}</div>`;
    (game.ui?.root || document.body).appendChild(el);
    game.audio?.ui?.('ui_levelup', 0.85);
    game.audio?.ui?.('ui_scan', 0.6);
    game.engine?.flash?.(0x6ab8ff, 0.25);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4800);
  }

  function onFx(d) {
    if (disposed || !d || d.k !== 'crfx') return;
    const pos = new THREE.Vector3().fromArray(d.p);
    const ps = game.particles;
    if (d.kind === 'craft') {
      ps?.burst(pos, { count: 16, color: [d.c || 0xffb060, 0xffffff, 0xffd090], speed: 1.6, up: 1.8, life: 0.7, size: 0.05, gravity: -1, drag: 2.5, additive: true });
      game.audio?.at('wire_connect', pos, 0.7, { refDistance: 3 });
      game.audio?.at('ui_confirm', pos, 0.5, { refDistance: 3 });
    } else if (d.kind === 'analyze') {
      ps?.burst(pos, { count: 22, color: [0x5ab8ff, 0xffffff, 0x9dd6ff], speed: 1.4, up: 2.4, life: 0.9, size: 0.05, gravity: -1.4, drag: 2, additive: true });
      game.audio?.at('ui_scan', pos, 0.7, { refDistance: 3 });
    } else if (d.kind === 'fail') {
      ps?.burst(pos, 'sparks'); game.audio?.at('ui_error', pos, 0.6, { refDistance: 3 });
    } else if (d.kind === 'fire') {
      clientFx.push({ kind: 'fire', p: pos, t: d.t || 6, r: d.r || 3, light: game.lights?.add({ pos: pos.clone().add(new THREE.Vector3(0, 0.6, 0)), color: 0xff8a30, intensity: 1.6, distance: 9, flicker: 0.5, group: 'fx' }) });
    } else if (d.kind === 'emp') {
      ps?.burst(pos, { count: 40, color: [0x50c8ff, 0xffffff, 0xb0f0ff], speed: 7, up: 1, life: 0.5, size: 0.06, gravity: 0, drag: 2.2, additive: true });
      game.audio?.at('taser_zap', pos, 1, { refDistance: 8 });
      if (pos.distanceTo(game.camera.position) < 14) game.engine?.flash?.(0x60c8ff, 0.5);
    } else if (d.kind === 'cryo') {
      ps?.burst(pos, { count: 40, color: [0xd8ffff, 0x80e0ff, 0xffffff], speed: 4, up: 1.2, life: 1, size: 0.08, gravity: 1, drag: 2, additive: true });
    } else if (d.kind === 'trap') {
      ps?.burst(pos, 'sparks');
    } else if (d.kind === 'zap') {
      ps?.burst(pos, { count: 14, color: [0x70ff90, 0xffffff], speed: 2, up: 1, life: 0.5, size: 0.05, gravity: 0, drag: 2.5, additive: true });
      game.audio?.at('spark', pos, 0.6, { refDistance: 3 });
    }
  }

  const heldOn = (type) => { for (const id of game.player.slots) { const it = id && game.items.get(id); if (it && it.type === type && it.on) return true; } return false; };
  function onUseItem(it, hk, g) {
    if (disposed || g !== game || !it || hk.handled) return;
    const net = game.net, p = game.player;
    switch (it.type) {
      case 'craft_gasmask':
        hk.handled = true;
        game.setItemOn(it, !it.on);
        game.sfx?.('cloth_rustle', 0.7);
        game.ui?.toast(it.on ? t('Gas mask on. You breathe filtered air.') : t('Gas mask off.'), 'info');
        return;
      case 'craft_batterypack':
        hk.handled = true; game.sfx?.('spark', 0.6); net.request('cruse', { op: 'pack', id: it.id }); return;
      case 'craft_traumakit':
        hk.handled = true;
        p.hp = Math.min(p.maxHp, p.hp + (it.def.heal || 100));
        game.sfx?.('heal', 0.7);
        net.request('consume', { id: it.id });
        net.send('pst', { hp: p.hp });
        game.ui?.toast(t('Patched up (trauma kit).'), 'good');
        return;
      case 'craft_trap':
        hk.handled = true;
        game.dropItem(it, false);
        net.request('cruse', { op: 'arm', id: it.id });
        game.ui?.toast(t('Trap set.'), 'info');
        return;
      case 'craft_molotov': case 'craft_decoy': case 'craft_emp': case 'craft_cryo':
        hk.handled = true;
        game.sfx?.('stun_pin', 0.6);
        game.dropItem(it, true);
        net.request('cruse', { op: 'arm', id: it.id });
        return;
      default: break;
    }
  }

  function clientUpdate(dt) {
    if (disposed) return;
    applyPendingTier();
    // gas mask (worn = on, in a hotbar slot)
    const worn = !!game.player && !game.player.dead && heldOn('craft_gasmask');
    if (worn !== gasWorn) {
      gasWorn = worn;
      if (worn && typeof document !== 'undefined') { ensureCss(); maskEl ||= Object.assign(document.createElement('div'), { className: 'crf-mask' }); (game.ui?.root || document.body).appendChild(maskEl); }
      else maskEl?.remove();
    }
    if (game.player) game.player.gasProof = gasWorn;
    for (let i = clientFx.length - 1; i >= 0; i--) {
      const f = clientFx[i];
      f.t -= dt;
      if (f.kind === 'fire') {
        f.acc = (f.acc || 0) - dt;
        if (f.acc <= 0) {
          f.acc = 0.05;
          const q = f.p.clone().add(new THREE.Vector3((Math.random() - 0.5) * f.r * 1.4, 0.1, (Math.random() - 0.5) * f.r * 1.4));
          game.particles?.burst(q, { count: 2, color: [0xff6a1a, 0xffb040, 0xffe080], speed: 0.4, up: 2.2, life: 0.6, size: 0.1, gravity: -2.5, drag: 1.5, additive: true });
        }
        if (f.light) f.light.intensity = 1.4 + Math.random() * 0.6;
      }
      if (f.t <= 0) { if (f.light) game.lights.remove(f.light); clientFx.splice(i, 1); }
    }
  }

  // ------------------------------------------------------------------------------------------ public API
  const api = {
    open(tab) {
      const ui = game.ui;
      if (!ui?.openPanel || typeof document === 'undefined') return null;
      if (ui.panelOpen && ui.panelOpen !== panel?.el) return null;
      if (panel && ui.panelOpen === panel.el) return panel;
      panel = createCraftingPanel({ game, api, tab, onClose: () => api.close() });
      ui.openPanel(panel.el);
      game.audio?.ui?.('terminal_enter', 0.5);
      return panel;
    },
    close() {
      const ui = game.ui;
      if (panel && ui?.panelOpen === panel.el) ui.closePanel();
      panel?.dispose?.();
      panel = null;
    },
    recipes() {
      const bps = game.profile?.blueprints || {};
      return resolveRecipes().map((r) => ({ ...r, locked: !!r.bp && !bps[r.bp] }));
    },
    rollChestLoot: (tier, rng, opts) => rollChestLoot(tier, rng, { theme: theme(), ...(opts || {}) }),
    dropComponents,
    /** client: ask the host to dismantle / analyze an item that is held or lying on the bench */
    dismantle(itemId) { game.net.request('craft', { op: 'dismantle', id: itemId }); },
    analyze(itemId) { game.net.request('craft', { op: 'analyze', id: itemId, bps: Object.keys(game.profile?.blueprints || {}) }); },
    upgrade(itemId) { game.net.request('craft', { op: 'upgrade', id: itemId, bps: Object.keys(game.profile?.blueprints || {}), luck: luck() }); },
    craft(recipeId) { game.net.request('craft', { op: 'make', id: recipeId, bps: Object.keys(game.profile?.blueprints || {}), luck: luck() }); },
    have, status, luck,
    /** items the local player can spend (held + on the bench), for the panel */
    carried() { return sourcesFor(game.selfId).filter(usable); },
    onBench, tierOdds, upgradeInfo, analyzeInfo, dismantleYield, dismantleBlock,
    blueprints() { return Object.keys(ensureBlueprints(game.profile)); },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    gasProof: () => gasWorn,
    isStrange,
    benchPos: () => benchCenter.clone(),
    stats, BENCH, COMPONENT_IDS, COMPONENT_COLOR,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      api.close();
      if (Object.prototype.hasOwnProperty.call(game, 'hostOnCreatureKilled') && game.hostOnCreatureKilled === killWrap) delete game.hostOnCreatureKilled;
      if (Object.prototype.hasOwnProperty.call(game, 'meleeSwing') && game.meleeSwing === meleeWrap) delete game.meleeSwing;
      for (const c of colliders) game.physics?.removeCollider(c);
      if (lampEmitter) game.lights?.remove(lampEmitter);
      for (const f of clientFx) if (f.light) game.lights?.remove(f.light);
      bench.group.removeFromParent();
      bench.dispose();
      maskEl?.remove();
      for (const n of ['craft', 'recipes']) mods?.commands?.delete(n);
      if (game.player) game.player.gasProof = false;
    },
  };

  // ------------------------------------------------------------------------------------------ hooks
  offs.push(mods.on('interactables', (out, g) => {
    if (g !== game || disposed) return;
    const p = game.player;
    if (!p || p.dead || game.minigame) return;
    if (!(p.inShip || p.pos.distanceTo(benchCenter) < 7)) return;
    out.push({ pos: benchIP, r: 1.1, reach: 3.4, label: t('Use WORKBENCH [E]'), sub: t('Craft · Dismantle · Analyze'), action: () => api.open() });
  }));
  offs.push(mods.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    H('craft', (d, from) => hostCraftRequest(d, from));
    H('cruse', (d, from) => { try { hostUse(d, from); } catch (e) { console.warn('[crafting] use', e); } });
  }));
  offs.push(mods.on('moonPopulated', (g) => { if (g === game) { try { onPopulated(); } catch (e) { console.warn('[crafting] populate', e); } } }));
  offs.push(mods.on('message', onMessage));
  offs.push(mods.on('fx', onFx));
  offs.push(mods.on('useItem', onUseItem));
  offs.push(mods.on('update', (dt, g) => { if (g !== game || disposed) return; clientUpdate(dt); if (game.isHost) hostTick(dt); }));
  offs.push(mods.on('sessionEnd', (g) => { if (g === game) api.close(); }));

  // ------------------------------------------------------------------------------------------ terminal
  const fmtIn = (r) => r.in.map(([id, n]) => `${(ITEMS[id]?.name || id).toLowerCase()} x${n}`).join(', ') + (r.credits ? `, ▮${r.credits}` : '');
  if (mods?.api?.registerCommand) {
    mods.api.registerCommand('craft', (rest, term) => {
      const list = api.recipes();
      const lines = ['WORKBENCH RECIPES  (use the workbench [E] in the ship to craft)', ''];
      for (const cat of CATS) {
        const rs = list.filter((r) => r.cat === cat);
        if (!rs.length) continue;
        lines.push(`[${cat.toLocaleUpperCase(getLang())}]`);
        for (const r of rs) {
          const st = status(r);
          const tag = r.locked ? 'LOCKED ' : st.can ? 'READY  ' : '       ';
          lines.push(` ${tag}${r.name.toLocaleUpperCase(getLang()).padEnd(20)} ${fmtIn(r)}`);
        }
      }
      lines.push('', ' UPGRADE             raise a weapon tier (components + credits, may fail)', `Blueprints: ${api.blueprints().length}/${Object.keys(BLUEPRINTS).length}   Type RECIPES <name> for details.`);
      term.print(lines.join('\n'));
    }, 'list crafting recipes');
    mods.api.registerCommand('recipes', (rest, term) => {
      const q = rest.join(' ').toLowerCase().trim();
      const list = api.recipes();
      const r = q && (list.find((x) => x.id === q || x.name.toLowerCase() === q) || list.find((x) => x.name.toLowerCase().includes(q)));
      if (!q || !r) { term.print(q ? t('No such recipe. Type CRAFT.') : tf('{n}\n\nRECIPES <name> shows details.', { n: list.map((x) => x.name.toLocaleUpperCase(getLang())).join('\n') })); return; }
      const st = status(r);
      const odds = tierOdds(r.tier, luck()).map((o) => `${o.tier} ${Math.round(o.p * 100)}%`).join(' / ');
      term.print([`${r.name.toLocaleUpperCase(getLang())} -> ${ITEMS[r.out]?.name || r.out} x${r.n}`, r.desc, '',
        ...r.in.map(([id, n], i) => ` ${(ITEMS[id]?.name || id).padEnd(18)} ${st.rows[i].have}/${n}`),
        r.credits ? ` credits            ${st.credits.have}/${r.credits}` : '', r.bp ? ` blueprint          ${BLUEPRINTS[r.bp].name} (${st.bp.ok ? 'known' : 'UNKNOWN'})` : '',
        r.tier ? ` tier chance        ${odds}` : ' (no tier)'].filter(Boolean).join('\n'));
    }, 'recipe details: RECIPES <name>');
  }
  void COMPONENTS; void V3; void tierColor; void ensureCss;
  return api;
}
