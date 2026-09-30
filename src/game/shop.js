// TFG wave 1 - COMPANY STORE.
//
// game.shop = { open(category?, opts?), close(), stock(), deals(), employee(), priceOf(id), buy(lines), buyCoin(id, n), textList(), dispose() }
//
// The catalogue is DATA DRIVEN: the store lists every registered item that has a `price` (credits ▮) or a `coin` (Clout ◈)
// AND either sits in STORE_ITEMS or carries a `shop` category field. Other modules register bags / skillbooks /
// components / suits with `shop: 'bags' | 'magic' | 'components' | 'suits' | ...` and they show up by themselves.
// Optional item fields read here: tier|rarity, blurb|tip, weight, faction + minRep (soft gate via game.lore?.factionRep),
// upgradeFrom + upgradePrice (trade-in, e.g. Nail Bat), noShop.
//
// Rotation is seeded (no Math.random): DEALS = 3 discounted items per day (run.runId + run.day), EMPLOYEE OF THE MONTH = 1 item
// per quota (run.runId + run.quotaIndex), premium items have a daily stock quantity (some days they are sold out).
// Purchases are host-authoritative: the client sends {op:'cart'} through the terminal request channel, the host recomputes
// every price from the same seeded functions, takes the credits and delivers to the ship storage (the classic dropship path).
import * as THREE from 'three';
import { ITEMS, STORE_ITEMS, SHIP_UPGRADES } from './items.js';
import { TIERS, tierColor } from './tiers.js';
import { RNG, hashString } from '../core/rng.js';
import { isTrapItem, trapUnitPrice } from './difficulty.js';
import { addTranslations, t, tf } from '../core/i18n.js';
import { CRUISER } from '../entities/cruiser.js';
import { createWeaponContext, installWeapons } from './weapons.js';
import { installDeck } from './deck.js';
import { dropPoint, SPOTS } from '../world/shiplayout.js';

export const CATEGORIES = [
  { id: 'weapons', name: 'Weapons' }, { id: 'tools', name: 'Tools' }, { id: 'bags', name: 'Bags' }, { id: 'consumables', name: 'Consumables' },
  { id: 'magic', name: 'Magic' }, { id: 'components', name: 'Components' }, { id: 'suits', name: 'Suits' }, { id: 'ship', name: 'Ship' },
];
const KIND_CAT = { weapon: 'weapons', tool: 'tools', consumable: 'consumables', bag: 'bags', suit: 'suits', component: 'components', skillbook: 'magic', spell: 'magic' };
const DEAL_STEPS = [0.15, 0.2, 0.25, 0.3, 0.35];
const EOM_OFF = 0.12;
const EOM_QUOTES = [
  'Never called in sick. Never had to.', 'Sixteen consecutive quarters of exceeding expectations.', 'Says "synergy" unironically.',
  'Survived three restructurings and one incident.', 'Employee #4 does not remember why. Neither does HR.', 'Perfect attendance. Perfect compliance.',
  'Has not blinked since the reorg.', 'Their family has been notified of the honour.', 'Achieved the impossible: nobody complained.',
  'Recommended by 9 out of 10 surviving colleagues.', 'A true team player. The team has changed several times.', 'Whatever happens, they always come back.',
];

const TR = {
  'COMPANY STORE': 'ŞİRKET MAĞAZASI', Weapons: 'Silahlar', Tools: 'Aletler', Bags: 'Çantalar', Consumables: 'Sarf Malzeme', Magic: 'Büyü', Components: 'Parçalar', Suits: 'Tulumlar', Ship: 'Gemi',
  "TODAY'S DEALS": 'GÜNÜN FIRSATLARI', 'EMPLOYEE OF THE MONTH': 'AYIN ÇALIŞANI', CART: 'SEPET', 'Your cart is empty.': 'Sepetin boş.', TOTAL: 'TOPLAM', BUY: 'SATIN AL', 'CLEAR': 'TEMİZLE',
  'SOLD OUT': 'TÜKENDİ', 'NOT ENOUGH': 'YETERSİZ', 'ADD': 'EKLE', 'UPGRADE': 'YÜKSELT', 'left': 'kaldı', 'Requires': 'Gerekir',
  'OUT OF STOCK - supplier delayed': 'STOKTA YOK - tedarikçi gecikti', 'Deliveries arrive in the ship storage.': 'Teslimat gemi deposuna gelir.',
  'Ordered': 'Sipariş edildi', 'Order failed': 'Sipariş başarısız', 'Not sold here.': 'Burada satılmıyor.', 'Insufficient credits.': 'Yetersiz kredi.', 'Insufficient Clout.': 'Yetersiz Clout.',
  'STORE': 'MAĞAZA', 'Company Store [E]': 'Şirket Mağazası [E]', 'Company Store - counter [E]': 'Şirket Mağazası - tezgah [E]', 'INSTALLED': 'KURULU', 'OWNED': 'SAHİP',
  'Trade in your Baseball Bat': 'Beyzbol sopanı takas et', 'Buy for Clout?': 'Clout ile satın alınsın mı?', 'DMG': 'HSR', 'lb': 'lb', 'two-handed': 'iki elli', 'Ranged': 'Menzilli', 'Melee': 'Yakın',
};
addTranslations(TR);

// existing items that had a price but no shop entry / category: give them one (data only)
for (const id of ['machete', 'sledge', 'harpoon']) if (ITEMS[id] && !ITEMS[id].shop) ITEMS[id].shop = 'weapons';
if (ITEMS.beltbag && !ITEMS.beltbag.shop) ITEMS.beltbag.shop = 'bags';

// ================================================================================================== catalogue (pure)
export const tierOfDef = (def) => {
  if (def.tier && TIERS[def.tier]) return def.tier;
  if (def.rarity && TIERS[def.rarity]) return def.rarity;
  const p = def.price || 0;
  return p >= 700 ? 'legendary' : p >= 350 ? 'epic' : p >= 150 ? 'rare' : p >= 50 ? 'uncommon' : 'common';
};
export const categoryOf = (def) => def.shop || KIND_CAT[def.kind] || 'tools';
const isPremium = (e) => !e.ship && !e.ammo && (e.price >= 250 || (e.coin >= 500) || ['epic', 'legendary', 'mythic'].includes(e.tier));

/** Every buyable thing right now: [{ id, def, name, cat, currency, base, tier, ammo, ship, ... }] (unsorted by deal / stock state). */
export function catalogEntries() {
  const out = [], seen = new Set();
  const push = (def) => {
    if (!def || seen.has(def.id) || def.noShop) return;
    const price = def.price > 0 ? def.price : 0, coin = !price && def.coin > 0 && def.shop ? def.coin : 0;
    if (!price && !coin) return;
    seen.add(def.id);
    out.push({ id: def.id, def, name: def.name, cat: categoryOf(def), currency: coin ? 'clout' : 'credits', base: coin || price, price, coin, tier: tierOfDef(def), ammo: !!def.ammoFor });
  };
  for (const id of STORE_ITEMS) push(ITEMS[id]);
  for (const def of Object.values(ITEMS)) if (def.shop) push(def);
  for (const [uid, u] of Object.entries(SHIP_UPGRADES)) {
    if (u.owned || !(u.price > 0)) continue;
    out.push({ id: 'ship:' + uid, def: null, name: u.name, cat: 'ship', currency: 'credits', base: u.price, price: u.price, coin: 0, tier: u.price >= 300 ? 'epic' : u.price >= 120 ? 'rare' : 'uncommon', ship: true, upgradeId: uid, desc: u.desc });
  }
  out.push({ id: 'ship:van', def: null, name: CRUISER.name, cat: 'ship', currency: 'credits', base: CRUISER.price, price: CRUISER.price, coin: 0, tier: 'epic', ship: true, van: true, desc: '4 seats, cargo bed, headlights, horn. Delivered next to the ship.' });
  const order = (c) => { const i = CATEGORIES.findIndex((x) => x.id === c); return i < 0 ? 99 : i; };
  out.sort((a, b) => order(a.cat) - order(b.cat) || (a.cat < b.cat ? -1 : a.cat > b.cat ? 1 : 0) || a.base - b.base);
  return out;
}
/** Categories in display order: the 8 standard ones, then any new category a module invented. */
export function categoryList(entries = catalogEntries()) {
  const list = CATEGORIES.map((c) => ({ ...c }));
  for (const e of entries) if (!list.some((c) => c.id === e.cat)) list.push({ id: e.cat, name: e.cat.charAt(0).toUpperCase() + e.cat.slice(1) });
  return list;
}

const runKey = (run) => String(run?.runId ?? 'legacy');
/** Today's deals: { id: offFraction }. Pure function of run.runId + run.day. */
export function dealsFor(run, entries = catalogEntries()) {
  const rng = new RNG(hashString(`${runKey(run)}:deals:${run?.day | 0}`));
  const pool = entries.filter((e) => e.currency === 'credits' && !e.ship && !e.ammo && e.base >= 10 && e.base <= 700).sort((a, b) => (a.id < b.id ? -1 : 1));
  const out = {};
  rng.shuffle(pool);
  for (const e of pool.slice(0, 3)) out[e.id] = rng.pick(DEAL_STEPS);
  return out;
}
/** Employee of the Month: { id, quote } (once per quota). Never a deal item, never ammo / ship. */
export function employeeFor(run, entries = catalogEntries()) {
  const deals = dealsFor(run, entries);
  const rng = new RNG(hashString(`${runKey(run)}:eom:${run?.quotaIndex | 0}`));
  const pool = entries.filter((e) => e.currency === 'credits' && !e.ship && !e.ammo && !deals[e.id] && ['uncommon', 'rare', 'epic', 'legendary'].includes(e.tier)).sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!pool.length) return null;
  const e = rng.pick(pool);
  return { id: e.id, quote: rng.pick(EOM_QUOTES), off: EOM_OFF };
}
/** Daily quantity of premium items: { id: qty } (0 = sold out today). */
export function dailyQty(run, entries = catalogEntries()) {
  const rng = new RNG(hashString(`${runKey(run)}:stock:${run?.day | 0}`));
  const out = {};
  for (const e of entries.slice().sort((a, b) => (a.id < b.id ? -1 : 1))) if (isPremium(e)) out[e.id] = rng.chance(0.85) ? rng.int(1, 3) : 0;
  return out;
}
/** [hardmode] trap / turret kits bought today (any kind): every one raises the next kit's price (difficulty.js priceMul) */
export const trapsBoughtToday = (run) => {
  const sold = run?.shop && run.shop.d === run.day ? run.shop.sold : null;
  let n = 0;
  if (sold) for (const [id, c] of Object.entries(sold)) if (isTrapItem(ITEMS[id])) n += c | 0;
  return n;
};
export const soldToday = (run, id) => (run?.shop && run.shop.d === run.day ? run.shop.sold?.[id] || 0 : 0);

/** Full priced stock for the run: entries + { price, off, deal, eom, qty (null = unlimited), left, soldOut, locked, lockReason }. */
export function stockFor(run, lore = null, tierLock = null) {
  const entries = catalogEntries();
  const deals = dealsFor(run, entries), eom = employeeFor(run, entries), qty = dailyQty(run, entries);
  return entries.map((e) => {
    let off = 0, kind = null;
    if (e.currency === 'credits' && !e.ship) {
      if (deals[e.id]) { off = deals[e.id]; kind = 'deal'; }
      else if (eom?.id === e.id) { off = eom.off; kind = 'eom'; }
    }
    let price = e.currency === 'clout' ? e.base : Math.max(1, Math.round(e.base * (1 - off)));
    const priceBase = price;
    if (e.currency === 'credits' && isTrapItem(e.def)) price = trapUnitPrice(price, trapsBoughtToday(run), 1);   // [hardmode] kit price rises with today's purchases
    const q = qty[e.id] ?? null;
    const left = q == null ? null : Math.max(0, q - soldToday(run, e.id));
    const owned = e.upgradeId ? !!run?.upgrades?.[e.upgradeId] : e.van ? !!run?.cruiser : false;
    let locked = false, lockReason = '';
    const d = e.def;
    if (d?.faction && lore?.factionRep) {
      const rep = Number(lore.factionRep(d.faction));
      const need = d.minRep ?? -20;
      if (Number.isFinite(rep) && rep < need) { locked = true; lockReason = `${t('Requires')} ${d.faction} ${need}`; }
    }
    if (!locked && tierLock) { const why = tierLock(e); if (why) { locked = true; lockReason = why; } }
    return { ...e, price, priceBase, off, dealKind: kind, eomQuote: kind === 'eom' ? eom.quote : '', qty: q, left, soldOut: (left !== null && left <= 0) || owned, owned, locked, lockReason };
  });
}

/** A short list of stat pills for a card. */
export function statsOf(def) {
  if (!def) return [];
  const out = [];
  if (def.kind === 'weapon') {
    out.push([t('DMG'), def.dmg]);
    if (def.cd) out.push(['DPS', Math.round((def.dmg / def.cd) * (def.wfire === 'deck' ? 3 : 1))]);
    out.push([def.ranged ? t('Ranged') : t('Melee'), def.ranged ? `${def.reach} m` : `${def.reach} m`]);
    if (def.ammo && def.ammo > 1) out.push(['MAG', def.ammo]);
    if (def.stun) out.push(['STUN', `${def.stun}s`]);
    if (def.hands === 2) out.push([t('two-handed'), '']);
  } else {
    if (def.heal) out.push(['HEAL', def.heal]);
    if (def.charges) out.push(['CHG', def.charges]);
    if (def.battery) out.push(['BAT', def.battery]);
  }
  if (def.weight) out.push([t('lb'), def.weight]);
  return out;
}

// ================================================================================================== kiosk meshes
function screenTexture(lines) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (rows, tt = 0) => {
    const x = c.getContext('2d');
    x.fillStyle = '#080502'; x.fillRect(0, 0, 256, 160);
    x.fillStyle = '#ff8a3d'; x.font = 'bold 22px monospace'; x.textAlign = 'center';
    x.fillText('COMPANY STORE', 128, 30);
    x.fillStyle = '#a8531f'; x.fillRect(16, 38, 224, 2);
    x.font = '15px monospace'; x.textAlign = 'left';
    rows.slice(0, 6).forEach((r, i) => { x.fillStyle = r.hot ? '#ffd23f' : '#ffb070'; x.fillText(r.text.slice(0, 26), 16, 62 + i * 19); });
    x.fillStyle = 'rgba(255,138,61,.5)'; x.fillRect(0, (tt * 40) % 160, 256, 2);   // scan bar
    tex.needsUpdate = true;
  };
  draw(lines);
  return { tex, draw };
}
function buildKiosk({ mini = false } = {}) {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x24262b }), trim = new THREE.MeshLambertMaterial({ color: 0xc8581c }), metal = new THREE.MeshLambertMaterial({ color: 0x3a3d44 });
  const scr = screenTexture([{ text: 'LOADING DEALS...' }]);
  const screenMat = new THREE.MeshBasicMaterial({ map: scr.tex });
  const s = mini ? 0.55 : 1;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.9, 0.42), dark); base.position.set(0, 0.45, 0);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.06, 0.46), trim); cab.position.set(0, 0.93, 0);
  const crt = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.46, 0.34), metal); crt.position.set(0, 1.2, -0.02); crt.rotation.x = -0.12;
  const scrn = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.31), screenMat); scrn.position.set(0, 1.2, 0.152); scrn.rotation.x = -0.12;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.1, 0.05), trim); sign.position.set(0, 1.55, 0.02);
  const key = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.14), metal); key.position.set(0, 0.98, 0.16); key.rotation.x = 0.15;
  g.add(base, cab, crt, scrn, sign, key);
  g.scale.setScalar(s);
  g.userData.screen = scr;
  return g;
}

// ================================================================================================== install
export function installShop(game) {
  const g = game, mm = game.mods;
  const ctx = createWeaponContext(game);
  const weapons = installWeapons(game, ctx);
  const deck = installDeck(game, ctx);
  const offs = [];
  const lore = () => g.lore || null;
  const api = { panel: null };

  const stock = () => (g.run ? stockFor(g.run, lore(), g.hubgate?.shopLock) : []);   // [hubgate] rare+ stock opens after quota 1
  const byId = (id) => stock().find((e) => e.id === id) || null;
  Object.assign(api, {
    stock, byId, categories: () => categoryList(),
    deals: () => stock().filter((e) => e.dealKind === 'deal'),
    employee: () => stock().find((e) => e.dealKind === 'eom') || null,
    priceOf: (id) => byId(id)?.price ?? null,
    /** credit-priced, non-ship stock (the terminal BUY command) */
    buyables: () => stock().filter((e) => !e.ship && e.currency === 'credits'),
    open(category, opts = {}) {
      if (!g.run) return;
      g.ui.openShop(g, category, opts);
    },
    close() { if (api.panel) g.ui.closePanel(); },
    isOpen: () => !!api.panel,
    buy(lines) { g.net.request('term', { cmd: { op: 'cart', lines } }); },
    buyCoin(id, n = 1) {
      const e = byId(id);
      if (!e || e.currency !== 'clout') return false;
      const cost = e.price * n;
      if (!g.progress.spendCoins(cost)) { g.ui.sfx('ui_error'); g.ui.toast(t('Insufficient Clout.'), 'bad'); return false; }
      g.net.request('term', { cmd: { op: 'coinbuy', id, n } });
      return true;
    },
    /** lines for the terminal STORE LIST (text purists) */
    textList() {
      const out = ['Company Store. Delivery is instant. The fee is not mentioned.', 'Type STORE for the store screen. BUY <item> [n] still works here.', ''];
      const st = stock();
      const deals = st.filter((e) => e.dealKind === 'deal'), eom = st.find((e) => e.dealKind === 'eom');
      if (deals.length) out.push("TODAY'S DEALS: " + deals.map((e) => `${e.name} -${Math.round(e.off * 100)}%`).join(', '));
      if (eom) out.push(`EMPLOYEE OF THE MONTH: ${eom.name} (-${Math.round(eom.off * 100)}%)`);
      if (deals.length || eom) out.push('');
      for (const c of categoryList()) {
        const list = st.filter((e) => e.cat === c.id && !e.owned);
        if (!list.length) continue;
        out.push(c.name.toUpperCase() + ':');
        for (const e of list) {
          const p = e.currency === 'clout' ? `◈${e.price}` : `▮${e.price}`;
          out.push(`* ${e.name.padEnd(20)} ${p}${e.off ? `  (was ▮${e.base}, -${Math.round(e.off * 100)}%)` : ''}${e.soldOut ? '  [SOLD OUT]' : e.left != null && e.left <= 2 ? `  [${e.left} left]` : ''}${e.locked ? '  [LOCKED]' : ''}`);
        }
        out.push('');
      }
      out.push('Personal gear, armor and cosmetics: visit Phish Dayı at 0-Algorithm HQ.');
      return out;
    },
  });

  // ---------------------------------------------------------------- host: purchases
  const ship = () => g.ship;
  function deliver(id, n) {
    for (let i = 0; i < n; i++) {
      const pos = dropPoint(i);   // [ship2] the loot bay (world/shiplayout.js)
      g.items.hostSpawn(id, pos, { value: 0 });
    }
    void ship;
  }
  function result(from, ok, msg, extra = {}) { g.net.sendTo(from, 'fx', { k: 'sh', t: 'shopres', ok, msg, credits: g.run?.credits, ...extra }); }
  api.hostCart = (cmd, from, reply) => {
    const run = g.run;
    const fail = (msg) => { reply(msg, true); result(from, false, msg); };
    if (!run || !Array.isArray(cmd.lines) || !cmd.lines.length || cmd.lines.length > 14) return fail(t('Nothing to order.'));
    const st = new Map(stockFor(run, lore(), g.hubgate?.shopLock).map((e) => [e.id, e]));   // [hubgate] the host enforces the lock too (the client store only greys the card)
    const plan = [];
    let total = 0;
    const taken = new Map();
    let trapTaken = 0;
    for (const raw of cmd.lines) {
      const e = st.get(String(raw?.id));
      if (!e || e.currency !== 'credits') return fail(t('Not sold here.'));
      if (e.locked) return fail(e.lockReason || t('Not sold here.'));
      let n = e.ship ? 1 : Math.max(1, Math.min(10, raw.n | 0 || 1));
      if (e.soldOut) return fail(tf('{name}: SOLD OUT today.', { name: e.name }));
      if (e.left != null) n = Math.min(n, e.left - (taken.get(e.id) || 0));
      if (n <= 0) return fail(tf('{name}: SOLD OUT today.', { name: e.name }));
      let unit = e.price, trade = null;
      if (isTrapItem(e.def)) { unit = trapUnitPrice(e.priceBase, trapsBoughtToday(run) + trapTaken, n); trapTaken += n; }   // [hardmode] rising kit price within one order too
      if (raw.trade && e.def?.upgradeFrom && e.def.upgradePrice > 0) {
        trade = [...g.items.all()].find((it) => it.type === e.def.upgradeFrom && it.holder === from && !it.affix);
        if (trade) { unit = e.def.upgradePrice; n = 1; }
      }
      taken.set(e.id, (taken.get(e.id) || 0) + n);
      total += unit * n;
      plan.push({ e, n, unit, trade });
    }
    if (run.credits < total) return fail(`${t('Insufficient credits.')} (▮${total} > ▮${run.credits})`);
    // ship items are their own transactions (van / upgrades run their existing host logic); items go first
    const itemLines = plan.filter((p) => !p.e.ship), shipLines = plan.filter((p) => p.e.ship);
    const itemTotal = itemLines.reduce((s, p) => s + p.unit * p.n, 0);
    const done = [];
    if (itemLines.length) {
      run.credits -= itemTotal;
      run.shop = run.shop && run.shop.d === run.day ? run.shop : { d: run.day, sold: {} };
      for (const p of itemLines) {
        if (p.trade) g.net.broadcast('it', { e: 'rm', id: p.trade.id });
        deliver(p.e.id, p.n);
        run.shop.sold[p.e.id] = (run.shop.sold[p.e.id] || 0) + p.n;
        done.push(`${p.n}x ${p.e.name}${p.trade ? ' (trade-in)' : ''}`);
      }
      run.shop = { d: run.shop.d, sold: { ...run.shop.sold } };
      g.net.broadcast('fx', { k: 'snd', s: 'dropship', p: [5, 2, -1], v: 0.8 });
    }
    for (const p of shipLines) {
      if (p.e.van) {
        if (g.cruiser?.hostBuy) { g.cruiser.hostBuy(from, (text, err) => reply(text, err)); done.push(p.e.name); }
      } else {
        const u = SHIP_UPGRADES[p.e.upgradeId];
        if (!u || run.upgrades?.[p.e.upgradeId] || run.credits < u.price) { reply(`${p.e.name}: unavailable.`, true); continue; }
        run.credits -= u.price;
        run.upgrades = { ...run.upgrades, [p.e.upgradeId]: true };
        g.net.broadcast('sys', { text: `Ship upgrade installed: ${u.name}`, kind: 'good' });
        done.push(p.e.name);
      }
    }
    g.broadcastRun(['credits', 'shop', 'upgrades']);
    const msg = `Ordered ${done.join(', ')}. Your new balance is ▮${run.credits}.\nYour order has been delivered to the ship's storage.`;
    reply(msg);
    result(from, true, msg, { total, done });
  };
  api.hostCoin = (cmd, from, reply) => {
    const run = g.run;
    const e = run ? stockFor(run, lore(), g.hubgate?.shopLock).find((x) => x.id === String(cmd.id)) : null;
    const n = Math.max(1, Math.min(3, cmd.n | 0 || 1));
    const refund = (why) => { reply(why, true); result(from, false, why, { refund: e ? e.price * n : 0 }); };
    if (!e || e.currency !== 'clout' || e.ship) return refund(t('Not sold here.'));
    if (e.soldOut) return refund(tf('{name}: SOLD OUT today.', { name: e.name }));
    if (e.left != null && n > e.left) return refund(tf('{name}: only {left} left.', { name: e.name, left: e.left }));
    if (e.locked) return refund(e.lockReason || t('Not sold here.'));
    deliver(e.id, n);
    run.shop = run.shop && run.shop.d === run.day ? run.shop : { d: run.day, sold: {} };
    run.shop = { d: run.shop.d, sold: { ...run.shop.sold, [e.id]: (run.shop.sold[e.id] || 0) + n } };
    g.broadcastRun(['shop']);
    g.net.broadcast('fx', { k: 'snd', s: 'dropship', p: [5, 2, -1], v: 0.8 });
    const msg = `Ordered ${n}x ${e.name} (◈${e.price * n}). Delivered to the ship's storage.`;
    reply(msg);
    result(from, true, msg, { coin: true });
  };

  // ---------------------------------------------------------------- client: purchase results
  ctx.onFx('shopres', (d) => {
    if (d.refund) { g.progress.p.coins += d.refund; g.progress.save(); g.ui.hud?.setCoins?.(g.progress.p.coins, d.refund); }
    g.ui.toast(t(d.ok ? 'Ordered' : 'Order failed') + (d.ok ? '' : ': ' + t(String(d.msg || ''))), d.ok ? 'good' : 'bad');
    if (d.ok) g.audio.ui('ui_buy', 0.7); else g.ui.sfx('ui_error');
    api.panel?.onResult?.(d);
  });

  // ---------------------------------------------------------------- kiosks (ship + HQ counter) and their prompts
  const S = { x: SPOTS.kiosk.x, z: SPOTS.kiosk.z };   // [ship2] shiplayout
  let shipKiosk = null;
  try {
    shipKiosk = buildKiosk();
    shipKiosk.position.set(S.x, 0, S.z); shipKiosk.rotation.y = Math.PI;
    g.ship?.group?.add(shipKiosk);
    g.physics.addStaticBox(S.x, 0.75, S.z, 0.34, 0.75, 0.24, 0);
  } catch (e) { console.warn('[shop] ship kiosk', e); shipKiosk = null; }
  let hqKiosk = null, hqPos = null, hqHost = null;
  offs.push(mm.on('mapLoaded', (world) => {
    const co = world?.company;
    if (!co?.group || co.group.userData.tfgStore) { if (co?.group?.userData.tfgStore) { hqKiosk = co.group.userData.tfgStore; } return; }
    try {
      const dz = co.dropZone || new THREE.Vector3(0, -0.15, -35);
      hqKiosk = buildKiosk({ mini: true });
      hqKiosk.position.set(dz.x - 2.3, dz.y, dz.z + 0.25); hqKiosk.rotation.y = 0;
      co.group.add(hqKiosk); co.group.userData.tfgStore = hqKiosk;
      hqHost = co.group;
    } catch (e) { console.warn('[shop] hq kiosk', e); }
  }));
  offs.push(mm.on('interactables', (list, gg) => {
    if (gg !== g || !g.run) return;
    const p = g.player;
    if (shipKiosk && (p.inShip || p.pos.lengthSq() < 144)) list.push({ pos: new THREE.Vector3(S.x, 1.15, S.z - 0.3), r: 0.8, label: t('Company Store [E]'), action: () => api.open() });
    const co = g.world.company;
    if (co?.group?.userData.tfgStore && g.run.phase === 'company') {
      const k = co.group.userData.tfgStore;
      hqPos = k.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.7, 0));
      list.push({ pos: hqPos, r: 0.9, reach: 3, label: t('Company Store - counter [E]'), action: () => api.open() });
    }
  }));
  // kiosk screens show today's deals
  let screenT = 0, screenKey = '';
  ctx.update((dt) => {
    screenT -= dt;
    if (screenT > 0) return;
    screenT = 0.25;
    const screens = [shipKiosk, hqKiosk].filter(Boolean).map((k) => k.userData.screen);
    if (!screens.length || !g.run) return;
    const d = g.run.day + ':' + (g.run.runId || '');
    const tt = g.time;
    if (d !== screenKey) {
      screenKey = d;
      const st = stock();
      const rows = [{ text: "TODAY'S DEALS", hot: true }, ...st.filter((e) => e.dealKind === 'deal').map((e) => ({ text: `-${Math.round(e.off * 100)}% ${e.name}` })), ...(st.find((e) => e.dealKind === 'eom') ? [{ text: 'STAR EMPLOYEE:', hot: true }, { text: st.find((e) => e.dealKind === 'eom').name }] : [])];
      screens.forEach((s) => { s.rows = rows; });
    }
    for (const s of screens) if (s.rows) s.draw(s.rows, tt);
  });

  // ---------------------------------------------------------------- terminal commands (soft)
  try { window.KefalAPI?.registerCommand?.('deals', () => { const c = g.terminal; c.print(api.textList().slice(3, 8).join('\n') || t('No deals today.')); }, 'today\'s Company Store deals'); } catch { /* ignore */ }

  return Object.assign(api, {
    weapons, deck, ctx,
    dispose() {
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      try { window.KefalAPI && mm.commands?.delete('deals'); } catch { /* ignore */ }
      api.close();
      weapons.dispose(); deck.dispose(); ctx.dispose();
      if (shipKiosk) { shipKiosk.removeFromParent(); shipKiosk.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      void hqHost; void tierColor;
    },
  });
}
