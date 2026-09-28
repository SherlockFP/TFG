// Wardrobe logic (wave 1, "fun" module): ownership, unlock rules, equip + appearance sync, the Symbiote Sample drop.
//
// Appearance is DATA ONLY (no stats): profile.suit / .hat (existing) + profile.face / .back (new), owned lists in
// profile.cosmetics { suits, hats, faces, backs }. The network payload is helloData() ('pinfo' / 'hello'); the new
// fields `face` and `back` are ignored by old clients (they keep the suit colour / hat they know).
//
// Soft interface (game.cosmetics): unlocked() -> { suit:[ids], hat:[], face:[], back:[] } · equip(slot, id) -> bool ·
// current() -> { suit, hat, face, back } · plus owns / unlock / catalog / price / open (the wardrobe panel).
import { SUIT_COLORS, HATS } from '../models/avatar.js';
import { OUTFITS, OUTFIT_BY_ID, FACE_ACCS, BACK_ACCS, HATS_EXTRA, catalogue } from '../models/cosmetics.js';
import { MARKET } from './progression.js';
import { registerItem, SCRAP_TABLE } from './items.js';
import { tierColor, tierDef, TIER_ORDER } from './tiers.js';
import { saveProfile } from '../core/save.js';
import { addTranslations } from '../core/i18n.js';

export const SLOTS = ['suit', 'hat', 'face', 'back'];
const LIST_KEY = { suit: 'suits', hat: 'hats', face: 'faces', back: 'backs' };
const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

// Clout prices (◈). Everything else is earned (achievement / milestone / secret).
export const PRICES = {
  'suit:construction': 120, 'suit:hazmat': 300, 'suit:clown': 450,
  'hat:beanie': 80, 'hat:bucket': 90, 'hat:headlamp': 260, 'hat:wizard': 700,
  'face:moustache': 60, 'face:gasmask': 220, 'face:shades': 350,
  'back:antenna': 100, 'back:o2tank': 260, 'back:plushie': 420,
};
const MIN_LEVEL = { 'suit:clown': 5, 'suit:hazmat': 4, 'hat:wizard': 10, 'face:shades': 6, 'back:plushie': 6 };

addTranslations({
  WARDROBE: 'GARDIROP', 'WARDROBE [E]': 'GARDIROP [E]', Suits: 'Tulumlar', Hats: 'Şapkalar', Face: 'Yüz', Back: 'Sırt', Equip: 'Kuşan', Equipped: 'Kuşanıldı',
  Owned: 'Sahip', Locked: 'Kilitli', 'Try on': 'Dene', Unlock: 'Açılış', 'NEW COSMETIC': 'YENİ KOZMETİK', 'Symbiote Sample': 'Symbiote Örneği',
  'Open wardrobe [E]': 'Gardırobu aç [E]', 'Bare visor.': 'Çıplak vizör.', Buy: 'Satın al', 'Not enough Clout': 'Yeterli Clout yok',
  'Drag to rotate': 'Döndürmek için sürükle', None: 'Yok', 'Standard tank.': 'Standart tüp.',
});

// ------------------------------------------------------------------ registry (one flat table)
const ENTRIES = new Map();
function buildEntries() {
  ENTRIES.clear();
  for (const c of catalogue(HATS)) {
    if (c.id === 'none') continue;   // the 'no accessory' tile is added by the wardrobe itself
    const key = c.slot + ':' + c.id;
    ENTRIES.set(key, { ...c, key, price: PRICES[key] || 0, minLevel: MIN_LEVEL[key] || 1, shop: PRICES[key] ? 'suits' : undefined, coin: PRICES[key] || undefined });
  }
  // stock hats keep their old tiers by price (black market): map them to tiers for the wardrobe grid
  const HAT_TIER = { cap: 'common', cone: 'common', bunny: 'uncommon', kefal: 'rare', crown: 'legendary', tophat: 'rare', headphones: 'uncommon', propeller: 'uncommon', hardhat: 'common', chef: 'uncommon', party: 'rare', halo: 'epic', horns: 'epic', antenna: 'rare' };
  for (const [id, tier] of Object.entries(HAT_TIER)) { const e = ENTRIES.get('hat:' + id); if (e) { e.tier = tier; e.how = 'Black Market (HQ) or achievement rewards'; e.desc = e.desc || 'Headwear. Fashion is survival.'; } }
}
buildEntries();
export const entry = (slot, id) => ENTRIES.get(slot + ':' + id) || null;
export const entriesFor = (slot) => [...ENTRIES.values()].filter((e) => e.slot === slot);
/** plain colour suits (the classic swatches) as wardrobe entries */
export function colourSuits() { return SUIT_COLORS.filter((s) => !s.outfit).map((s) => ({ slot: 'suit', id: s.id, name: s.name, tier: s.reward ? 'epic' : 'common', color: s.color, colour: true, key: 'suit:' + s.id, desc: 'A plain colour suit.', how: 'Black Market at HQ (Phish Dayı) or achievement rewards' })); }

// Black market (existing Phish Dayı panel lists MARKET.cosmetics entries "suit:id" / "hat:id"); face / back are bought in the wardrobe.
for (const [key, coin] of Object.entries(PRICES)) {
  const [slot] = key.split(':');
  if ((slot === 'suit' || slot === 'hat') && !MARKET.cosmetics.some((c) => c.id === key)) MARKET.cosmetics.push({ id: key, coin, minLevel: MIN_LEVEL[key], shop: 'suits' });
}

// ------------------------------------------------------------------ Symbiote Sample (strange mythic drop)
export const SYMBIOTE_ID = 'symbiote';
registerItem({
  id: SYMBIOTE_ID, name: 'Symbiote Sample', kind: 'scrap', value: [260, 340], weight: 9, hands: 1, tier: 'mythic', strange: true,
  tip: 'A jar of something black that looks back. Bring it home and it may choose you.',
});
for (const t of Object.values(SCRAP_TABLE)) if (Array.isArray(t) && !t.some((e) => e[0] === SYMBIOTE_ID)) t.push([SYMBIOTE_ID, 0.35]);

// ------------------------------------------------------------------ profile helpers
export function ensureWardrobeProfile(p) {
  if (!p) return p;
  if (!p.cosmetics || typeof p.cosmetics !== 'object') p.cosmetics = { suits: ['orange'], hats: ['none'] };
  for (const k of ['suits', 'hats', 'faces', 'backs']) if (!Array.isArray(p.cosmetics[k])) p.cosmetics[k] = k === 'suits' ? ['orange'] : ['none'];
  for (const k of ['faces', 'backs']) if (!p.cosmetics[k].includes('none')) p.cosmetics[k].unshift('none');
  if (typeof p.face !== 'string') p.face = 'none';
  if (typeof p.back !== 'string') p.back = 'none';
  if (!p.fun || typeof p.fun !== 'object') p.fun = {};
  const f = p.fun;
  for (const k of ['tasks', 'taskDays', 'bonuses', 'goals', 'juggleBest', 'echoUses', 'pranks']) if (typeof f[k] !== 'number' || !isFinite(f[k])) f[k] = 0;
  if (typeof f.symbiote !== 'boolean') f.symbiote = false;
  return p;
}
export function owns(p, slot, id) {
  if (!id || (id === 'none' && slot !== 'suit')) return true;
  const list = p?.cosmetics?.[LIST_KEY[slot]];
  return !!list && list.includes(id);
}
export function grant(p, slot, id) {
  ensureWardrobeProfile(p);
  const list = p.cosmetics[LIST_KEY[slot]];
  if (!list || list.includes(id)) return false;
  list.push(id);
  return true;
}
/** { suit, hat, face, back } of a profile / info object (safe defaults) */
export const lookOf = (p) => ({ suit: p?.suit || 'orange', hat: p?.hat || 'none', face: p?.face || 'none', back: p?.back || 'none' });

// ------------------------------------------------------------------ unlock rules (evaluated every ~2 s while playing)
const fun = (p) => p.fun || {};
const st = (p) => p.stats || {};
const RULES = {
  'suit:construction': { test: (p) => p.level >= 3 },
  'suit:scientist': { test: (p) => fun(p).tasks >= 5, prog: (p) => [fun(p).tasks, 5] },
  'suit:security': { test: (p) => n(st(p).daysSurvived) >= 5, prog: (p) => [n(st(p).daysSurvived), 5] },
  'suit:hazmat': { test: (p) => (st(p).moonsVisited || []).length >= 3, prog: (p) => [(st(p).moonsVisited || []).length, 3] },
  'suit:firefighter': { test: (p) => n(st(p).closeShaves) >= 1 || !!p.achievements?.close_shave },
  'suit:chicken': { test: (p) => fun(p).juggleBest >= 10, prog: (p) => [fun(p).juggleBest, 10] },
  'suit:diver': { test: (p) => n(st(p).fish) >= 25, prog: (p) => [n(st(p).fish), 25] },
  'suit:clown': { test: (p) => n(st(p).deaths) >= 5, prog: (p) => [n(st(p).deaths), 5] },
  'suit:phish': { test: (p) => n(st(p).shinyFish) >= 1 },
  'suit:astronaut': { test: (p) => p.level >= 20, prog: (p) => [p.level, 20] },
  'suit:goldemp': { test: (p) => !!p.achievements?.quota_10 },
  'suit:venom': { test: (p) => fun(p).symbiote || n(st(p).creatureKills) >= 50, prog: (p) => [Math.min(50, n(st(p).creatureKills)), 50] },
  'hat:beanie': { test: (p) => p.level >= 2 },
  'hat:bucket': { test: (p) => n(p.login?.best) >= 2 },
  'hat:headlamp': { test: (p) => n(st(p).fuses) >= 3, prog: (p) => [n(st(p).fuses), 3] },
  'hat:wizard': { test: (p) => n(p.codex?.pct) >= 25 },
  'face:moustache': { test: (p) => fun(p).tasks >= 1 },
  'face:gasmask': { test: (p) => p.level >= 8 },
  'face:shades': { test: (p) => n(st(p).jackpots) >= 1 },
  'face:visor': { test: (p) => n(st(p).vaults) >= 5, prog: (p) => [n(st(p).vaults), 5] },
  'face:led': { test: (p) => fun(p).tasks >= 15, prog: (p) => [fun(p).tasks, 15] },
  'back:antenna': { test: (p) => p.level >= 5 },
  'back:o2tank': { test: (p) => n(st(p).daysSurvived) >= 10, prog: (p) => [n(st(p).daysSurvived), 10] },
  'back:plushie': { test: (p) => n(st(p).quotasMet) >= 1 },
  'back:monster': { test: (p) => n(st(p).creatureKills) >= 25, prog: (p) => [Math.min(25, n(st(p).creatureKills)), 25] },
};
/** progress [have, need] toward an earnable cosmetic, or null */
export function progressOf(p, key) { try { return RULES[key]?.prog?.(p) || null; } catch { return null; } }
export function ruleMet(p, key) { try { return !!RULES[key]?.test(p); } catch { return false; } }

// ------------------------------------------------------------------ the per-game controller
export function installCosmetics(game) {
  const profile = () => game.profile;
  ensureWardrobeProfile(profile());
  let last = '';
  let checkT = 1.2;
  let disposed = false;
  const offs = [];

  const current = () => lookOf(profile());
  const unlocked = () => {
    const p = ensureWardrobeProfile(profile());
    return { suit: [...p.cosmetics.suits], hat: [...p.cosmetics.hats], face: [...p.cosmetics.faces], back: [...p.cosmetics.backs] };
  };
  const isOwned = (slot, id) => owns(profile(), slot, id);

  function pushLook(force) {
    const p = profile();
    const key = [p.suit, p.hat, p.face, p.back].join('|');
    if (key === last && !force) return;
    last = key;
    const look = lookOf(p);
    try { game.viewModel?.setLook?.(look); } catch { /* ignore */ }
    try { game.emotes?.avatar?.setLook?.(look); } catch { /* ignore */ }
    try {
      if (game.net && typeof game.helloData === 'function') { const hd = game.helloData(); game.net.helloData = hd; game.net.send('pinfo', hd); }
    } catch { /* not in a session yet */ }
  }

  function equip(slot, id) {
    if (!SLOTS.includes(slot)) return false;
    const p = ensureWardrobeProfile(profile());
    if (slot === 'suit' && !SUIT_COLORS.some((s) => s.id === id)) return false;
    if (slot === 'hat' && !HATS.some((h) => h.id === id)) return false;
    if (slot === 'face' && !FACE_ACCS.some((f) => f.id === id)) return false;
    if (slot === 'back' && !BACK_ACCS.some((f) => f.id === id)) return false;
    if (!owns(p, slot, id)) return false;
    p[slot] = id;
    game.progress?.save?.();
    pushLook(true);
    game.sfx?.('item_pickup', 0.5);
    return true;
  }

  function unlock(key, quiet) {
    const [slot, id] = key.split(':');
    const p = ensureWardrobeProfile(profile());
    if (!grant(p, slot, id)) return false;
    game.progress?.save?.();
    if (!quiet) announce(key);
    return true;
  }
  function announce(key) {
    const e = ENTRIES.get(key);
    if (!e) return;
    const td = tierDef(e.tier);
    game.ui?.toast?.(`NEW COSMETIC: ${e.name} (${td.name})`, 'good');
    game.sfx?.(TIER_ORDER.indexOf(e.tier) >= 3 ? 'level_up_jingle' : 'ui_confirm', 0.6);
    if (TIER_ORDER.indexOf(e.tier) >= 4) game.ui?.hud?.bigText?.(e.name.toUpperCase(), `${td.name} ${e.slot} unlocked - open the WARDROBE (ship mirror / suit rack)`);
    game.mods?.emit('tfg:cosmeticUnlocked', e, game);
  }

  function buy(key) {
    const e = ENTRIES.get(key);
    if (!e || !e.price) return { ok: false, why: 'Not for sale' };
    const p = ensureWardrobeProfile(profile());
    if (owns(p, e.slot, e.id)) return { ok: false, why: 'Owned' };
    if (p.level < (e.minLevel || 1)) return { ok: false, why: `Requires level ${e.minLevel}` };
    if (!game.progress.spendCoins(e.price)) return { ok: false, why: 'Not enough Clout' };
    unlock(key, true);
    game.audio?.ui?.('ui_buy', 0.7);
    return { ok: true };
  }

  function scanUnlocks() {
    const p = ensureWardrobeProfile(profile());
    // the Symbiote Sample counts once it is aboard the ship (the whole crew present unlocks it)
    if (!fun(p).symbiote) {
      try { for (const it of game.items.inShipItems()) if (it.type === SYMBIOTE_ID) { p.fun.symbiote = true; break; } } catch { /* items not ready */ }
    }
    for (const [key, r] of Object.entries(RULES)) {
      const [slot, id] = key.split(':');
      if (owns(p, slot, id)) continue;
      if (ruleMet(p, key)) unlock(key);
    }
  }

  offs.push(game.mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    pushLook(false);
    checkT -= dt;
    if (checkT <= 0) { checkT = 2; scanUnlocks(); }
  }));
  // late joiners: everybody re-announces their look shortly after someone connects (welcome rosters only carry suit + hat)
  const resend = () => { setTimeout(() => { if (!disposed) pushLook(true); }, 1500); };
  offs.push(game.mods.on('playerJoin', (id, info, g) => { if (g === game) resend(); }));
  offs.push(game.mods.on('netReady', (net, g) => {
    if (g !== game) return;
    resend();
    try { net.on?.('peerHello', resend); } catch { /* ignore */ }
  }));
  pushLook(true);

  const api = {
    unlocked, equip, current, owns: isOwned, unlock, buy, price: (key) => ENTRIES.get(key)?.price || 0, entry: (slot, id) => entry(slot, id),
    catalog: () => [...colourSuits(), ...ENTRIES.values()], entriesFor,
    open: () => {},   // replaced by fun.js (wardrobe panel)
    refresh: () => pushLook(true),
    dispose() { disposed = true; for (const off of offs) { try { off?.(); } catch { /* ignore */ } } },
  };
  game.cosmetics = api;
  return api;
}

export { OUTFITS, OUTFIT_BY_ID, tierColor };
