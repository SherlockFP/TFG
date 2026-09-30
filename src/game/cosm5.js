// cosm5 (wave 4) - the big cosmetics drop. Docs: docs/wave4/cosm5.md
//   * 14 suits / 19 head items / 10 back items (models/cosm5_models.js) are registered into the wave-1 wardrobe registries at import
//     time (models/cosmetics.js merges them), so equip, pinfo sync, FP body and the ship mirror work with the existing code.
//   * 10 weapon skins (render/weaponskins.js) follow the HOLDER: whatever weapon you hold gets your equipped skin, on every peer.
//   * 6 emotes are pushed into emotes.js EMOTES (unlock = profile.emotes, like the meta-layer emotes).
//   * sources: rotating wardrobe shop (Clout), crate pool (cosmeticPool), boss drops ('c5drop'), secrets (RULES below).
//   * wardrobe tabs Rotation shop / Weapon skins / Emotes are plugged into ui/panels/wardrobe.js through WARDROBE_EXT.
//   * net: 'c5look' (compact look code, see cosm5_data.js encodeLook), 'c5drop' (host -> crew boss trophy).
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { addTranslations, t, tf, getLang } from '../core/i18n.js';
import { saveProfile } from '../core/save.js';
import { EMOTES, LOCKED_EMOTES, EMOTE_BY_ID, isEmoteUnlocked, unlockEmote } from './emotes.js';
import { owns as ownsWardrobe, grant as grantWardrobe, ensureWardrobeProfile } from './cosmetics.js';
import { tierDef, TIER_ORDER } from './tiers.js';
import { glowLevel } from './enhance.js';
import { createItemModel } from '../models/items.js';
import { applySkin, clearSkin, skinClock, skinOf, SKIN_IDS } from '../render/weaponskins.js';
import { WARDROBE_EXT, TABS } from '../ui/panels/wardrobe.js';
import { claimable, unlockAt } from './wallet.js';
import { installCosm5I18n } from './cosm5_i18n.js';
import { installCosm8I18n } from './cosm8_i18n.js';
import {
  C5, C5_BY_KEY, C5_BY_ID, keyOf, bySlot, BOSS_DROPS, cosmeticPool, rollCosmetic, encodeLook, decodeLook, rotationFor, offerPrice, utcDay,
} from './cosm5_data.js';

export { C5, cosmeticPool, rollCosmetic, encodeLook, decodeLook, rotationFor, BOSS_DROPS };
installCosm5I18n(addTranslations);
installCosm8I18n(addTranslations);

const SLOT_TAB = { suit: 'suit', hat: 'hat', back: 'back', skin: 'skin', emote: 'emote' };
const DUPE_COINS = { common: 30, uncommon: 60, rare: 120, epic: 240, legendary: 500, mythic: 900 };
const PREVIEW_WEAPONS = ['katana', 'plasmablade', 'bat', 'pistol', 'crowbar', 'blaster'];

// ------------------------------------------------------------------------------------------------ emotes (6)
const hh = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
/** { shL, elL, shR, elR } arm pivots of an avatar (both bodies: hand -> ... -> shoulder pivot whose parent is the torso) */
function armsOf(a) {
  const P = a.parts || {};
  const chain = (hand) => { const c = []; let o = hand; while (o && o !== P.torso) { c.push(o); o = o.parent; } return c; };
  const L = chain(P.handL), R = chain(P.handR);
  const sh = (c) => (c.length >= 2 ? c[c.length - 1] : null), el = (c) => (c.length >= 3 ? c[c.length - 2] : null);
  return { shL: sh(L), elL: el(L), shR: sh(R), elR: el(R) };
}
const set = (o, x, y, z) => { if (o) o.rotation.set(x, y, z); };
const EMOTE_DEFS = {
  clockout: { base: null, face: 'normal', fx(a, root, tt) {
    const A = armsOf(a), P = a.parts, ph = tt % 3.2;
    const up = sm(ph / 0.45) * (1 - sm((ph - 0.9) / 0.35));
    set(A.shR, -2.1 * up - 0.25 * (1 - up), 0, -0.25 * up); if (A.elR) A.elR.rotation.x = -0.5 * up - 0.25 * (1 - up);
    const sigh = sm((ph - 1.5) / 0.5) * (1 - sm((ph - 2.8) / 0.35));
    if (P.torso) P.torso.rotation.x += 0.3 * sigh + 0.05 * up;
    if (P.neck) P.neck.rotation.x += 0.4 * sigh;
  } },
  clap: { base: null, face: 'happy', fx(a, root, tt) {
    const A = armsOf(a), P = a.parts, sw = 0.5 + 0.5 * Math.sin(tt * 11), k = sm(tt * 5);
    set(A.shL, -1.2 * k, 0, 0.6 - k * (0.12 + 0.42 * sw)); set(A.shR, -1.2 * k, 0, -0.6 + k * (0.12 + 0.42 * sw));
    if (A.elL) A.elL.rotation.x = -0.75 * k; if (A.elR) A.elR.rotation.x = -0.75 * k;
    if (P.neck) P.neck.rotation.x += Math.sin(tt * 5.5) * 0.08;
    root.position.y += Math.abs(Math.sin(tt * 5.5)) * 0.02;
  } },
  praise: { base: null, face: 'happy', fx(a, root, tt) {
    const A = armsOf(a), P = a.parts, k = sm(tt * 2);
    set(A.shL, -0.1 * k, 0, 0.3 + 2.3 * k); set(A.shR, -0.1 * k, 0, -0.3 - 2.3 * k);
    if (A.elL) A.elL.rotation.x = -0.25; if (A.elR) A.elR.rotation.x = -0.25;
    if (P.neck) P.neck.rotation.x -= 0.5 * k; if (P.torso) { P.torso.rotation.x -= 0.14 * k; P.torso.rotation.z += Math.sin(tt * 2.2) * 0.06 * k; }
    root.position.y += Math.sin(tt * 3) * 0.03 * k + 0.05 * k;
  } },
  buffering: { base: null, face: 'normal', fx(a, root, tt) {
    const A = armsOf(a), P = a.parts, q = Math.floor(tt * 4) / 4, q2 = Math.floor(tt * 2.5);
    set(A.shR, -0.5, 0, -0.7); if (A.elR) A.elR.rotation.x = -0.9;
    if (P.neck) { P.neck.rotation.y += (hh(q * 3.1) - 0.5) * 1.1; P.neck.rotation.z += (hh(q * 5.3) - 0.5) * 0.35; P.neck.rotation.x += 0.05; }
    if (P.torso) P.torso.rotation.z += (hh(q2 * 2.7) - 0.5) * 0.18;
    root.position.x += (hh(q2 + 9.1) - 0.5) * 0.03;
  } },
  undo: { base: null, face: 'scared', fx(a, root, tt) {
    const A = armsOf(a), P = a.parts, ph = (tt % 1.7) / 1.7, ry = root.rotation.y;
    root.rotation.y -= sm(ph) * Math.PI * 2;
    const d = -Math.sin(ph * Math.PI) * 0.4;
    root.position.x += Math.sin(ry) * d; root.position.z += Math.cos(ry) * d;
    root.position.y += Math.sin(ph * Math.PI) * 0.12;
    set(A.shR, -1.4, 0, -0.5 - Math.sin(ph * Math.PI * 2) * 0.4); if (A.elR) A.elR.rotation.x = -0.7;
    if (P.neck) P.neck.rotation.x += 0.1;
  } },
  // ---- wave 8 (cosm8_data.js)
  standup: { base: null, face: 'normal', fx(a, root, tt) {
    const A = armsOf(a), P = a.parts, k = sm(tt * 3);
    set(A.shL, 0, 0, 0.5 * k); set(A.shR, 0, 0, -0.5 * k); if (A.elL) A.elL.rotation.x = -1.0 * k; if (A.elR) A.elR.rotation.x = -1.0 * k;
    if (P.torso) P.torso.rotation.z += Math.sin(tt * 1.6) * 0.07 * k;
    if (P.neck) { P.neck.rotation.y += Math.sin(tt * 0.9) * 0.3 * k; P.neck.rotation.x += 0.05 + 0.1 * Math.max(0, Math.sin(tt * 2.3)); }
    root.position.x += Math.sin(tt * 1.6) * 0.02 * k;
  } },
  shuffle: { base: null, face: 'normal', fx(a, root, tt) {
    const A = armsOf(a), P = a.parts, k = sm(tt * 3);
    set(A.shL, -1.1 * k, 0, 0.15 * k); set(A.shR, -1.1 * k, 0, -0.15 * k);
    if (A.elL) A.elL.rotation.x = (-0.9 + Math.sin(tt * 22) * 0.12) * k; if (A.elR) A.elR.rotation.x = (-0.9 + Math.sin(tt * 22 + 2) * 0.12) * k;
    if (P.neck) P.neck.rotation.x += 0.25 * k; if (P.torso) { P.torso.rotation.y += Math.sin(tt * 4) * 0.2 * k; P.torso.rotation.z += Math.sin(tt * 4 + 1) * 0.06 * k; }
    root.position.y += Math.abs(Math.sin(tt * 4)) * 0.03 * k; root.position.x += Math.sin(tt * 4) * 0.025 * k;
  } },
  scroll: { base: null, face: 'normal', fx(a, root, tt) {
    const A = armsOf(a), P = a.parts, k = sm(tt * 3), f = (tt % 0.7) / 0.7;
    set(A.shR, -1.0 * k, 0, -0.2 * k); if (A.elR) A.elR.rotation.x = (-1.4 + 0.5 * Math.sin(f * Math.PI)) * k;
    set(A.shL, 0, 0, 0.12 * k);
    if (P.neck) { P.neck.rotation.x += 0.5 * k; P.neck.rotation.y += Math.sin(tt * 0.8) * 0.08 * k; }
    if (P.torso) P.torso.rotation.x += 0.2 * k;
    root.position.y -= 0.02 * k * Math.sin(f * Math.PI);
  } },
  shimmy: { base: null, face: 'happy', fx(a, root, tt) {
    const A = armsOf(a), P = a.parts, k = sm(tt * 4), drop = 1 - sm((tt - 3.2) / 0.5);
    set(A.shR, -0.3 * k, 0, (-1.9 + Math.sin(tt * 9) * 0.25) * k * drop - 0.2 * (1 - drop)); if (A.elR) A.elR.rotation.x = -0.4 * k * drop;
    set(A.shL, 0, 0, 0.45 * k); if (A.elL) A.elL.rotation.x = -0.9 * k;
    if (P.torso) { P.torso.rotation.z += Math.sin(tt * 16) * 0.15 * k; P.torso.rotation.y += Math.sin(tt * 8) * 0.12 * k; }
    root.position.x += Math.sin(tt * 8) * 0.025 * k; root.position.y += Math.abs(Math.sin(tt * 8)) * 0.02 * k;
  } },
  mosh: { base: null, face: 'angry', fx(a, root, tt) {
    const A = armsOf(a), P = a.parts, s = Math.sin(tt * 7), k = sm(tt * 3);
    set(A.shL, (-2.2 + s * 0.5) * k, 0, 0.3 * k); set(A.shR, (-2.2 - s * 0.5) * k, 0, -0.3 * k);
    if (A.elL) A.elL.rotation.x = -1.2 * k; if (A.elR) A.elR.rotation.x = -1.2 * k;
    if (P.neck) P.neck.rotation.x += Math.sin(tt * 14) * 0.55 * k;
    if (P.torso) P.torso.rotation.x += (0.25 + Math.sin(tt * 14) * 0.15) * k;
    root.position.y += Math.abs(s) * 0.14 * k;
  } },
  lagspike: { base: null, face: 'scared', fx(a, root, tt) {
    const n = Math.floor(tt * 6), back = n % 4 === 3, ry = root.rotation.y;
    const ox = back ? 0 : (hh(n * 1.7) - 0.5) * 0.9, oz = back ? 0 : (hh(n * 2.9) - 0.5) * 0.9;
    root.position.x += ox; root.position.z += oz;
    root.rotation.y = ry + (back ? 0 : (hh(n * 4.1) - 0.5) * 1.4);
    root.position.y += back ? 0 : hh(n * 5.7) * 0.18;
    const A = armsOf(a); set(A.shL, -0.3, 0, 0.9); set(A.shR, -0.3, 0, -0.9);
  } },
};
for (const e of bySlot('emote')) {
  if (EMOTE_BY_ID[e.id]) continue;
  const d = EMOTE_DEFS[e.id];
  const def = { id: e.id, icon: e.icon || '*', base: d.base, dur: e.dur || 3, face: d.face, lock: 'Wardrobe: ' + e.name, fx: d.fx };
  Object.defineProperty(def, 'name', { get: () => t(e.name), enumerable: true });   // wheel labels follow the language
  EMOTES.push(def); EMOTE_BY_ID[e.id] = def; LOCKED_EMOTES.push(e.id);
}

// ------------------------------------------------------------------------------------------------ profile + ownership
export function ensureC5Profile(p) {
  if (!p) return p;
  ensureWardrobeProfile(p);
  if (!p.cosm5 || typeof p.cosm5 !== 'object') p.cosm5 = {};
  const c = p.cosm5;
  if (!Array.isArray(c.skins)) c.skins = [];
  if (typeof c.skin !== 'string' || (c.skin !== 'none' && !SKIN_IDS.includes(c.skin))) c.skin = 'none';
  if (!Array.isArray(c.combo)) c.combo = [];
  if (!c.flags || typeof c.flags !== 'object') c.flags = {};
  if (typeof c.spent !== 'number') c.spent = 0;
  return p;
}
export function owns5(p, e) {
  if (!p || !e) return false;
  ensureC5Profile(p);
  if (e.slot === 'skin') return e.id === 'none' || p.cosm5.skins.includes(e.id);
  if (e.slot === 'emote') return isEmoteUnlocked(p, e.id);
  return ownsWardrobe(p, e.slot, e.id);
}
/** add to the profile (no toast / save): 'new' | 'dup' | 'bad' */
export function grantC5(p, key) {
  const e = C5_BY_KEY[key];
  if (!p || !e) return 'bad';
  ensureC5Profile(p);
  if (owns5(p, e)) return 'dup';
  if (e.slot === 'skin') p.cosm5.skins.push(e.id);
  else if (e.slot === 'emote') unlockEmote(p, e.id);
  else grantWardrobe(p, e.slot, e.id);
  return 'new';
}
export const ownedKeys = (p) => new Set(C5.filter((e) => owns5(p, e)).map(keyOf));

// secret / quest rules (evaluated every ~2 s while playing)
const st = (p) => p.stats || {};
const nn = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
export const RULES = {
  'suit:algocult': { test: (p) => nn(st(p).sold) >= 20000, prog: (p) => [Math.min(20000, nn(st(p).sold)), 20000] },
  'suit:glitch': { test: (p) => !!p.cosm5?.flags?.glitch },
  'hat:firewall': { test: (p) => nn(st(p).quotasMet) >= 15, prog: (p) => [Math.min(15, nn(st(p).quotasMet)), 15] },
  'hat:blackhole': { test: (p) => p.level >= 40, prog: (p) => [Math.min(40, p.level), 40] },
  'skin:lava': { test: (p) => nn(st(p).creatureKills) >= 300, prog: (p) => [Math.min(300, nn(st(p).creatureKills)), 300] },
  'emote:undo': { test: (p) => p.level >= 15, prog: (p) => [Math.min(15, p.level), 15] },
  // wave 8 (cosm8_data.js): mod counters live in profile.cosm5.flags (game.cosm5.bump(name))
  'suit:reaper': { test: (p) => nn(st(p).quotasMet) >= 8, prog: (p) => [Math.min(8, nn(st(p).quotasMet)), 8] },
  'hat:trendcrown': { test: (p) => p.level >= 30, prog: (p) => [Math.min(30, p.level), 30] },
  'suit:chosen': { test: (p) => nn(p.cosm5?.flags?.quoted) >= 8, prog: (p) => [Math.min(8, nn(p.cosm5?.flags?.quoted)), 8] },
  'skin:voidstar': { test: (p) => nn(p.cosm5?.flags?.appraised) >= 40, prog: (p) => [Math.min(40, nn(p.cosm5?.flags?.appraised)), 40] },
  'emote:mosh': { test: (p) => nn(p.cosm5?.flags?.raved) >= 5, prog: (p) => [Math.min(5, nn(p.cosm5?.flags?.raved)), 5] },
};
export const progress5 = (p, key) => { try { return RULES[key]?.prog?.(p) || null; } catch { return null; } };

// ------------------------------------------------------------------------------------------------ shop rotation + purchase (pure: menu + game)
export function rotation(day = utcDay()) { return rotationFor(day, RNG); }
const secondsToRotation = (now = Date.now()) => 86400 - Math.floor((now / 1000) % 86400);
export function offersFor(profile, day = utcDay()) {
  const r = rotation(day);
  const mk = (key, featured) => { const e = C5_BY_KEY[key]; return e ? { ...e, key, price: offerPrice(e, featured), featured, minLevel: e.minLevel || 1, owned: owns5(profile, e) } : null; };
  return { day, offers: r.daily.map((k) => mk(k, false)).filter(Boolean), featured: r.featured ? mk(r.featured, true) : null, left: secondsToRotation() };
}
/** [followers] claim a rotation offer: it unlocks at unlockAt(price) followers and NOTHING is spent (the old `spend` option is ignored). Returns { ok, why?, key? } */
export function buyOffer(profile, key, { day = utcDay() } = {}) {
  ensureC5Profile(profile);
  const { offers, featured } = offersFor(profile, day);
  const o = offers.find((x) => x.key === key) || (featured && featured.key === key ? featured : null);
  if (!o) return { ok: false, why: 'Not in today\'s rotation' };
  if (o.owned) return { ok: false, why: 'Owned' };
  if ((profile.level || 1) < o.minLevel) return { ok: false, why: `Requires level ${o.minLevel}` };
  if (!claimable(profile.coins, o.price)) return { ok: false, why: tf('Unlocks at {n} followers', { n: unlockAt(o.price) }) };
  grantC5(profile, key);
  return { ok: true, key, price: o.price };
}

// ------------------------------------------------------------------------------------------------ preview weapon (wardrobe turntable)
function weaponPreview(type, skin) {
  let obj = null;
  try {
    const custom = typeof window !== 'undefined' ? window.__kefalMods?.itemModels?.get(type) : null;
    obj = custom ? custom(THREE) : createItemModel(type);
  } catch { obj = null; }
  if (!obj) obj = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), new THREE.MeshLambertMaterial({ color: 0x888888 }));
  const wrap = new THREE.Group();
  const inner = new THREE.Group(); inner.add(obj); wrap.add(inner);
  const bb = new THREE.Box3().setFromObject(obj), c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
  obj.position.sub(c);
  const long = Math.max(s.x, s.y, s.z, 0.05);
  wrap.scale.setScalar(1.15 / long);
  if (s.z >= s.x && s.z >= s.y) inner.rotation.y = Math.PI / 2;       // blades point -z: turn them sideways to the camera
  else if (s.y > s.x && s.y > s.z) inner.rotation.z = Math.PI / 2 - 0.5;
  wrap.position.set(0, 1.0, 0);
  if (skin && skin !== 'none') applySkin(wrap, skin);
  return wrap;
}

// ------------------------------------------------------------------------------------------------ wardrobe tabs (plugged into ui/panels/wardrobe.js)
const wdEntry = (e, extra = {}) => ({ ...e, key: keyOf(e), name: t(e.name), desc: t(e.desc), how: t(e.how), ...extra });
let prevWeapon = PREVIEW_WEAPONS[0];
let prevProp = null, prevPropKey = '';
const showProp = (ctx, key, build) => {
  if (prevPropKey === key && prevProp && ctx.pv.prop === prevProp) return;
  prevPropKey = key; prevProp = build();
  ctx.pv.setProp?.(prevProp);
};
const clearProp = (ctx) => { if (prevProp || ctx.pv.prop) { ctx.pv.setProp?.(null); prevProp = null; prevPropKey = ''; } };
function tryEntry(ctx, e) {           // shared by the shop tab and the category tabs
  const { pv } = ctx;
  if (e.slot === 'skin') { pv.play?.('idle'); showProp(ctx, prevWeapon + '|' + e.id, () => weaponPreview(prevWeapon, e.id)); return; }
  clearProp(ctx);
  if (e.slot === 'emote') { pv.play?.(e.id); return; }
  pv.play?.('idle');
  ctx.tryOn[e.slot] = e.id; ctx.applyTry();
}
function equipEntry(ctx, e) {
  const g = ctx.game;
  if (e.slot === 'skin') {
    if (g?.cosm5) return g.cosm5.equipSkin(e.id);
    if (!owns5(ctx.profile, e)) return false;
    ensureC5Profile(ctx.profile).cosm5.skin = e.id; saveProfile(ctx.profile); return true;
  }
  if (e.slot === 'emote') { ctx.pv.play?.(e.id); return true; }
  if (g?.cosmetics) return g.cosmetics.equip(e.slot, e.id);
  if (!ownsWardrobe(ctx.profile, e.slot, e.id)) return false;
  ctx.profile[e.slot] = e.id; saveProfile(ctx.profile); return true;
}
const equippedEntry = (p, e) => (e.slot === 'skin' ? (p.cosm5?.skin || 'none') === e.id : e.slot === 'emote' ? false : (p[e.slot] || 'none') === e.id);
function weaponRow(ctx) {
  const row = document.createElement('div');
  row.className = 'wd-tabs';
  const lbl = document.createElement('span'); lbl.className = 'wd-note'; lbl.style.marginRight = '6px'; lbl.textContent = t('Preview weapon') + ':';
  row.appendChild(lbl);
  for (const w of PREVIEW_WEAPONS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn tab' + (w === prevWeapon ? ' sel' : ''); b.textContent = t(weaponName(w));
    b.dataset.nav = 'wd:pw:' + w;
    b.addEventListener('click', () => { prevWeapon = w; prevPropKey = ''; ctx.render(); });
    row.appendChild(b);
  }
  return row;
}
const WEAPON_NAMES = { katana: 'Katana', plasmablade: 'Plasma Blade', bat: 'Baseball Bat', pistol: 'Pistol', crowbar: 'Crowbar', blaster: 'Blaster Pistol' };
const weaponName = (id) => WEAPON_NAMES[id] || id;

WARDROBE_EXT.skin = {
  label: 'Weapon skins',
  list: () => [{ slot: 'skin', id: 'none', key: 'skin:none', name: t('No skin'), tier: 'common', desc: t('Factory finish.'), how: '' }, ...bySlot('skin').map((e) => wdEntry(e))],
  owned: (p, e) => e.id === 'none' || owns5(p, e),
  equipped: equippedEntry,
  equip: equipEntry,
  buy: (ctx, e) => { const r = ctx.game?.cosm5 ? ctx.game.cosm5.buy(e.key) : buyOffer(ctx.profile, e.key); if (r.ok && !ctx.game) saveProfile(ctx.profile); return r; },
  price: (e) => (e.src === 'shop' ? e.price : 0),
  progress: (p, e) => progress5(p, e.key),
  select: (ctx, e) => tryEntry(ctx, e),
  preview: (ctx, e) => tryEntry(ctx, e),
  extra: weaponRow,
  note: () => t('Skins follow you: any weapon you hold gets your skin, for the whole crew. Forged +7 and above keep their forge glow.'),
};
WARDROBE_EXT.emote = {
  label: 'Emotes',
  list: () => bySlot('emote').map((e) => wdEntry(e)),
  owned: (p, e) => owns5(p, e),
  equipped: () => false,
  equipLabel: () => t('Play'),
  equip: equipEntry,
  buy: (ctx, e) => { const r = ctx.game?.cosm5 ? ctx.game.cosm5.buy(e.key) : buyOffer(ctx.profile, e.key); if (r.ok && !ctx.game) saveProfile(ctx.profile); return r; },
  price: (e) => (e.src === 'shop' ? e.price : 0),
  progress: (p, e) => progress5(p, e.key),
  select: (ctx, e) => tryEntry(ctx, e),
  preview: (ctx, e) => tryEntry(ctx, e),
  note: () => t('Owned emotes are in the emote wheel (hold B).'),
  alwaysEquippable: true,
};
WARDROBE_EXT.shop = {
  label: 'Rotation shop',
  list: (p) => { const o = offersFor(p); return [...(o.featured ? [wdEntry(o.featured, { price: o.featured.price, feat: true })] : []), ...o.offers.map((x) => wdEntry(x, { price: x.price }))]; },
  owned: (p, e) => owns5(p, e),
  equipped: equippedEntry,
  equip: equipEntry,
  buy: (ctx, e) => { const r = ctx.game?.cosm5 ? ctx.game.cosm5.buy(e.key) : buyOffer(ctx.profile, e.key); if (r.ok && !ctx.game) saveProfile(ctx.profile); return r; },
  price: (e) => e.price,
  select: (ctx, e) => tryEntry(ctx, e),
  preview: (ctx, e) => tryEntry(ctx, e),
  extra: (ctx) => {
    const o = offersFor(ctx.profile), row = document.createElement('div');
    row.className = 'wd-note';
    const h = Math.floor(o.left / 3600), m = Math.floor((o.left % 3600) / 60);
    row.textContent = tf('New offers in {h}h {m}m. The first tile is the weekly feature.', { h, m });
    return row;
  },
  note: () => t('Rotation is the same for every player and changes at midnight UTC.'),
  slotLabel: (e) => t({ suit: 'Suits', hat: 'Hats', back: 'Back', skin: 'Weapon skins', emote: 'Emotes' }[e.slot] || e.slot),
};
// the three original category tabs get the same preview hygiene (prop / emote off)
WARDROBE_EXT.__leave = (ctx) => { clearProp(ctx); if (ctx.pv.emote) ctx.pv.play?.('idle'); };
for (const [id, label] of [['shop', 'Rotation shop'], ['skin', 'Weapon skins'], ['emote', 'Emotes']]) if (!TABS.some((x) => x[0] === id)) TABS.push([id, label]);

// ------------------------------------------------------------------------------------------------ the per-game controller
export function installCosm5(game) {
  const offs = [];
  let disposed = false;
  const profile = () => ensureC5Profile(game.profile);
  ensureC5Profile(game.profile);
  const peerLooks = new Map();     // peer id -> { suit, hat, back, skin } (decoded 'c5look')
  let lastCode = '', scanT = 1.5, skinT = 0.2, sendT = 1.0, retryT = 1;
  let clockT = 0;
  const skinState = new WeakMap();  // Item -> applied skin id | null

  const lookOfSelf = () => { const p = profile(); return { suit: p.suit, hat: p.hat, back: p.back, skin: p.cosm5.skin }; };
  const codeOfSelf = () => encodeLook(lookOfSelf());

  // -------- grants, announcements
  function announce(key, how) {
    const e = C5_BY_KEY[key]; if (!e) return;
    const td = tierDef(e.tier);
    game.ui?.toast?.(`${t('NEW COSMETIC')}: ${t(e.name)} (${t(td.name)})`, 'good');
    game.sfx?.(TIER_ORDER.indexOf(e.tier) >= 3 ? 'level_up_jingle' : 'ui_confirm', 0.6);
    if (TIER_ORDER.indexOf(e.tier) >= 4) game.ui?.hud?.bigText?.(t(e.name).toLocaleUpperCase(getLang()), `${t(td.name)} ${how ? t(how) : t('cosmetic')} - ${t('open the WARDROBE')}`);
    game.mods?.emit('tfg:cosmeticUnlocked', { ...e, key, slot: e.slot }, game);
  }
  function grant(key, { quiet = false, how = '' } = {}) {
    const r = grantC5(profile(), key);
    if (r === 'new') { game.progress?.save?.() ?? saveProfile(game.profile); if (!quiet) announce(key, how); }
    return r;
  }
  /** reward helper for crates / daily rewards: grants the key, or pays a Clout refund when it is a duplicate. -> { key, dup, coins } */
  function reward(key, { quiet = false } = {}) {
    const e = C5_BY_KEY[key];
    if (!e) return { key, dup: false, coins: 0, bad: true };
    const r = grant(key, { quiet, how: 'reward' });
    if (r !== 'dup') return { key, dup: false, coins: 0 };
    const coins = DUPE_COINS[e.tier] || 30;
    game.progress?.addCoins?.(coins, 'Duplicate cosmetic');
    if (!quiet) game.ui?.toast?.(tf('{name} (duplicate): +{coins} Followers', { name: t(e.name), coins }), 'info');
    return { key, dup: true, coins };
  }
  function buy(key) {
    const r = buyOffer(game.profile, key);
    if (r.ok) { game.progress?.save?.(); game.audio?.ui?.('ui_buy', 0.7); announce(key, 'shop'); }
    return r;
  }
  function equipSkin(id) {
    const p = profile();
    if (id !== 'none' && !p.cosm5.skins.includes(id)) return false;
    p.cosm5.skin = id;
    game.progress?.save?.() ?? saveProfile(game.profile);
    sendLook(true);
    game.sfx?.('item_pickup', 0.5);
    return true;
  }

  // -------- secrets: emote combo (three different cosm5 emotes within 25 s = Glitch) + the rule table
  const emoteIds = new Set(bySlot('emote').map((e) => e.id));
  const em = game.emotes;
  if (em && typeof em.play === 'function') {
    const orig = em.play;
    em.play = function (def) {
      const r = orig.call(this, def);
      try {
        if (def && emoteIds.has(def.id)) {
          const c = profile().cosm5, now = Date.now();
          c.combo = c.combo.filter((x) => now - x.t < 25000 && x.id !== def.id); c.combo.push({ id: def.id, t: now });
          if (c.combo.length >= 3 && !c.flags.glitch) { c.flags.glitch = true; game.progress?.save?.(); scanT = 0; }
        }
      } catch { /* optional */ }
      return r;
    };
    offs.push(() => { em.play = orig; });
  }
  function scan() {
    const p = profile();
    for (const [key, r] of Object.entries(RULES)) {
      const e = C5_BY_KEY[key];
      if (!e || owns5(p, e)) continue;
      let ok = false; try { ok = !!r.test(p); } catch { ok = false; }
      if (ok) grant(key, { how: 'secret' });
    }
  }

  // -------- boss trophies: host -> everybody ('c5drop')
  const origKilled = game.hostOnCreatureKilled;
  if (typeof origKilled === 'function') {
    game.hostOnCreatureKilled = function (c, by) {
      const r = origKilled.call(this, c, by);
      try { if (game.isHost && c && BOSS_DROPS[c.type] && !c._c5drop) { c._c5drop = true; game.net?.broadcast('c5drop', { ty: c.type }); } } catch (e) { console.warn('[cosm5] boss drop', e); }
      return r;
    };
    offs.push(() => { if (game.hostOnCreatureKilled !== origKilled) game.hostOnCreatureKilled = origKilled; });
  }
  function onDrop(d) {
    const keys = BOSS_DROPS[d?.ty];
    if (!keys) return;
    for (const k of keys) grant(k, { how: 'boss drop' });
  }

  // -------- look sync ('c5look')
  function sendLook(force) {
    const code = codeOfSelf();
    if (code === lastCode && !force) return;
    lastCode = code;
    try { game.net?.send?.('c5look', code); } catch { /* not in a session */ }
    peerLooks.set(game.selfId, decodeLook(code));
  }
  function applyPeer(id) {
    const l = peerLooks.get(id), r = game.remotes?.get?.(id);
    if (!l || !r?.avatar?.setLook) return true;
    const o = {};
    if (l.suit) o.suit = l.suit; if (l.hat) o.hat = l.hat; if (l.back) o.back = l.back;
    if (Object.keys(o).length) { try { r.avatar.setLook(o); } catch { /* ignore */ } }
    return true;
  }
  function bindNet(net) {
    net.relayTypes?.add?.('c5look');
    net.on_('c5look', (code, from) => {
      if (!from || from === game.selfId) return;
      const d = decodeLook(code); if (!d) return;
      peerLooks.set(from, d);
      applyPeer(from);
    });
    net.on_('c5drop', (d) => onDrop(d));
  }
  offs.push(game.mods.on('netReady', (net, g) => { if (g === game) { bindNet(net); lastCode = ''; sendT = 0.5; } }));
  offs.push(game.mods.on('playerJoin', (id, info, g) => { if (g === game) { lastCode = ''; sendT = 1.5; } }));
  if (game.net?.on_) bindNet(game.net);

  // -------- weapon skins follow the holder
  const isWeapon = (it) => it?.def?.kind === 'weapon' && it.obj?.userData?.inner;
  function skinFor(it) {
    if (!it.holder) return undefined;                                    // in the world: keep whatever it had
    if (it.holder === game.selfId) { const s = profile().cosm5.skin; return s === 'none' ? null : s; }
    const s = peerLooks.get(it.holder)?.skin;
    return s || null;
  }
  function syncSkins() {
    const items = game.items; if (!items) return;
    for (const it of items.all()) {
      if (!isWeapon(it)) continue;
      const want = skinFor(it);
      if (want === undefined) continue;
      if (glowLevel(it.plus || 0) >= 3) continue;                       // forge camo shader owns the materials
      if ((skinState.get(it) ?? null) === want) continue;
      const inner = it.obj.userData.inner;
      if (want) applySkin(inner, want); else clearSkin(inner);
      skinState.set(it, want);
    }
  }

  offs.push(game.mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    clockT += dt; skinClock.value = clockT;
    scanT -= dt; if (scanT <= 0) { scanT = 2; try { scan(); } catch (e) { console.warn('[cosm5] scan', e); } }
    skinT -= dt; if (skinT <= 0) { skinT = 0.25; try { syncSkins(); } catch (e) { console.warn('[cosm5] skins', e); } }
    sendT -= dt; if (sendT <= 0) { sendT = 1; sendLook(false); }
    retryT -= dt; if (retryT <= 0) { retryT = 1.5; for (const id of peerLooks.keys()) if (id !== game.selfId) applyPeer(id); }
  }));

  const api = {
    catalog: () => C5.slice(), entry: (key) => C5_BY_KEY[key] || null, owns: (key) => owns5(profile(), C5_BY_KEY[key]), ownedKeys: () => ownedKeys(profile()),
    bump: (flag, n = 1) => { const c = profile().cosm5; c.flags[flag] = nn(c.flags[flag]) + n; scanT = 0; game.progress?.save?.(); return c.flags[flag]; },   // wave 8: mod counters
    grant: (key, o) => grant(key, o), reward, buy, equipSkin, skin: () => profile().cosm5.skin,
    offers: () => offersFor(profile()), rotation, cosmeticPool, rollCosmetic, encodeLook, decodeLook, code: codeOfSelf, peerLooks,
    skinOfItem: (it) => skinOf(it?.obj?.userData?.inner), scan, syncSkins,
    dispose() {
      disposed = true;
      for (const off of offs.splice(0)) { try { off?.(); } catch { /* ignore */ } }
      try { for (const it of game.items?.all?.() || []) if (skinState.get(it)) clearSkin(it.obj?.userData?.inner); } catch { /* ignore */ }
    },
  };
  game.cosm5 = api;
  return api;
}
