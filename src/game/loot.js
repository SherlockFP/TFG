// MMO-style loot: weapon rarity + affixes (prefix / suffix), hit & value math, loot beams.
//
// An affix is plain data (it travels in item spawn events and ship saves):
//   { rarity: 'uncommon'|'rare'|'epic'|'legendary', prefix: 'Sharp'|null, suffix: 'of the Deep'|null,
//     mods: { dmgPct, critPct, speedPct, lifesteal, stunChance, shock, valuePct } }
//   dmgPct / critPct / speedPct / lifesteal / stunChance / valuePct are fractions (0.12 = 12 %),
//   shock is flat bonus damage per hit.
// 'common' rolls return null (a plain weapon). Rolling is host-side only and uses the RNG it is given
// (an RNG instance from core/rng.js or any () => [0,1) function), so it is deterministic per seed.
import * as THREE from 'three';
import { RARITY } from './items.js';
import { forgeName } from './enhance.js';   // [forge]

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const AFFIX_RARITIES = ['uncommon', 'rare', 'epic', 'legendary'];
export const AFFIX_STATS = ['dmgPct', 'critPct', 'speedPct', 'lifesteal', 'stunChance', 'shock', 'valuePct'];
const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

// stat magnitude per affix tier (uncommon, rare, epic, legendary)
const MAG = {
  dmgPct: [0.10, 0.16, 0.24, 0.34],
  critPct: [0.04, 0.07, 0.10, 0.14],
  speedPct: [0.07, 0.11, 0.16, 0.22],
  lifesteal: [0.04, 0.07, 0.10, 0.14],
  stunChance: [0.08, 0.12, 0.17, 0.24],
  shock: [4, 8, 13, 20],
  valuePct: [0.15, 0.3, 0.5, 0.8],
};
// hard caps (also used to sanitize affixes coming from the network / old saves)
const CAP = { dmgPct: 1, critPct: 0.5, speedPct: 0.6, lifesteal: 0.3, stunChance: 0.5, shock: 60, valuePct: 1 };
// sell value multiplier by rarity (before valuePct). valuePct only counts at VALUE_PCT_WEIGHT and the total is
// capped at MAX_VALUE_BONUS: a found legendary weapon is a nice bonus, never a better sell than real scrap
// (the old formula reached ~4.8-6x on legendary Gilded/Greed rolls).
const RARITY_VALUE = { uncommon: 1.1, rare: 1.25, epic: 1.45, legendary: 1.7 };
const VALUE_PCT_WEIGHT = 0.6;
export const MAX_VALUE_BONUS = 2;

const STUN_SECONDS = 0.9;
const MAX_HEAL_PER_HIT = 25;

// w = pick weight, min = lowest rarity that can roll it
const PREFIXES = [
  { name: 'Sharp', stats: { dmgPct: 1 } },
  { name: 'Swift', stats: { speedPct: 1 } },
  { name: 'Keen', stats: { critPct: 1 } },
  { name: 'Vampiric', stats: { lifesteal: 1 } },
  { name: 'Humming', stats: { shock: 1 } },
  { name: 'Gilded', stats: { valuePct: 1 }, w: 0.7 },
  { name: 'Heavy', stats: { dmgPct: 0.6, stunChance: 0.7 } },
  { name: 'Brutal', stats: { dmgPct: 0.75, critPct: 0.7 }, min: 'rare' },
  { name: 'Abyssal', stats: { dmgPct: 0.8, lifesteal: 0.8 }, min: 'epic' },
  { name: 'Overclocked', stats: { speedPct: 0.8, shock: 0.8 }, min: 'epic' },
  { name: 'Algorithm-Blessed', stats: { dmgPct: 0.8, critPct: 0.6, valuePct: 1 }, min: 'legendary' },
];
const SUFFIXES = [
  { name: 'of Ruin', stats: { dmgPct: 1 } },
  { name: 'of Haste', stats: { speedPct: 1 } },
  { name: 'of Precision', stats: { critPct: 1 } },
  { name: 'of the Leech', stats: { lifesteal: 1 } },
  { name: 'of Storms', stats: { shock: 1 } },
  { name: 'of the Undertow', stats: { stunChance: 1 } },
  { name: 'of Greed', stats: { valuePct: 1 }, w: 0.7 },
  { name: 'of the Deep', stats: { critPct: 0.6, dmgPct: 0.6 }, min: 'rare' },
  { name: 'of the Night Shift', stats: { speedPct: 0.7, stunChance: 0.6 }, min: 'epic' },
  { name: 'of the Algorithm', stats: { dmgPct: 0.45, critPct: 0.45, speedPct: 0.45, lifesteal: 0.45 }, min: 'legendary' },
];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const toFn = (rng) => (typeof rng === 'function' ? rng : rng && typeof rng.next === 'function' ? () => rng.next() : Math.random);
const primary = (a) => (a ? Object.keys(a.stats)[0] : null);

function pickWeighted(list, weightOf, r) {
  let tot = 0;
  for (const e of list) tot += weightOf(e);
  let x = r() * tot;
  for (const e of list) { x -= weightOf(e); if (x <= 0) return e; }
  return list[list.length - 1];
}

/** Loot level from facility danger (tier + quotaIndex * 0.35): 1 on a starter moon, ~9 on late Orkinos runs. */
export function lootLevelFor(danger) {
  return Math.max(1, Math.round(1 + (Math.max(1, danger || 1) - 1) * 2));
}

/** Rarity weights at a loot level. Higher level shifts weight from common toward epic / legendary. */
export function rarityWeights(level = 1, luck = 0) {
  const s = clamp((level || 1) - 1, 0, 30);
  const lk = 1 + clamp(luck || 0, 0, 2);
  return {
    common: Math.max(8, 64 - s * 5.5),
    uncommon: 25 + s * 1.2,
    rare: (8.5 + s * 1.9) * Math.sqrt(lk),
    epic: (2.2 + s * 1.0) * lk,
    legendary: (0.3 + s * 0.35) * lk,
  };
}

/** Roll a rarity name. opts.minRarity drops everything below it, opts.luck (0..2) favours high rarities. */
export function rollRarity(level, rng, opts = {}) {
  const r = toFn(rng);
  const w = rarityWeights(level, opts.luck);
  const min = RANK[opts.minRarity] ?? 0;
  const list = RARITY_ORDER.filter((k) => RANK[k] >= min);
  return pickWeighted(list, (k) => w[k], r);
}

function pickAffix(pool, rarity, r, avoidStat) {
  const rank = RANK[rarity];
  const ok = pool.filter((a) => (RANK[a.min] ?? 1) <= rank && (!avoidStat || primary(a) !== avoidStat));
  const list = ok.length ? ok : pool.filter((a) => (RANK[a.min] ?? 1) <= rank);
  // affixes exclusive to the rolled rarity are more likely (they are the "named" ones players hunt for)
  return pickWeighted(list, (a) => (a.w ?? 1) * (a.min && a.min === rarity ? 2.5 : 1), r);
}

function emptyMods() { return { dmgPct: 0, critPct: 0, speedPct: 0, lifesteal: 0, stunChance: 0, shock: 0, valuePct: 0 }; }

/** Build an affix of a given rarity (host). Exposed for guaranteed drops and tests. */
export function makeAffix(rarity, rng) {
  if (!RARITY_VALUE[rarity]) return null;
  const r = toFn(rng);
  const tier = RANK[rarity] - 1;
  let prefix = null, suffix = null;
  if (rarity === 'uncommon') {
    if (r() < 0.5) prefix = pickAffix(PREFIXES, rarity, r); else suffix = pickAffix(SUFFIXES, rarity, r);
  } else {
    prefix = pickAffix(PREFIXES, rarity, r);
    suffix = pickAffix(SUFFIXES, rarity, r, primary(prefix));
  }
  const mods = emptyMods();
  for (const a of [prefix, suffix]) {
    if (!a) continue;
    for (const [stat, mult] of Object.entries(a.stats)) mods[stat] += MAG[stat][tier] * mult * (0.85 + 0.3 * r());
  }
  if (rarity === 'legendary') mods.valuePct += 0.25;
  for (const k of AFFIX_STATS) {
    let v = mods[k];
    if (!v) continue;
    v = k === 'shock' ? Math.max(1, Math.round(v)) : Math.max(0.01, Math.round(v * 100) / 100);
    mods[k] = Math.min(CAP[k], v);
  }
  return { rarity, prefix: prefix ? prefix.name : null, suffix: suffix ? suffix.name : null, mods };
}

/**
 * Roll affixes for a weapon def at a loot level. Returns null for non-weapons and 'common' rolls.
 * opts: { minRarity, luck }
 */
export function rollWeaponAffixes(def, level = 1, rng, opts = {}) {
  if (!def || def.kind !== 'weapon' || def.noAffix) return null;
  const r = toFn(rng);
  const rarity = rollRarity(level, r, opts);
  if (rarity === 'common') return null;
  return makeAffix(rarity, r);
}

/** Sanitize an affix received from the network / a save. Returns a fresh object or null. */
export function normalizeAffix(af) {
  if (!af || typeof af !== 'object' || !RARITY_VALUE[af.rarity]) return null;
  const str = (s) => (typeof s === 'string' && s.length ? s.slice(0, 32) : null);
  const mods = emptyMods();
  const src = af.mods && typeof af.mods === 'object' ? af.mods : {};
  for (const k of AFFIX_STATS) {
    const v = Number(src[k]);
    if (Number.isFinite(v) && v > 0) mods[k] = Math.min(CAP[k], v);
  }
  return { rarity: af.rarity, prefix: str(af.prefix), suffix: str(af.suffix), mods };
}

/** "Sharp Machete of the Deep" */
export function affixDisplayName(baseName, affix, it = null) {
  let s = baseName;
  if (affix) {
    if (affix.prefix) s = affix.prefix + ' ' + s;
    if (affix.suffix) s = s + ' ' + affix.suffix;
  }
  return it && (it.plus || it.oc?.length) ? forgeName(s, it.plus || 0, it.oc) : s;   // [forge] "+7 Katana ⚡"
}

/** Compact name for tight UI (inventory slots): "Sharp Machete" or "Machete of Haste". */
export function affixShortName(baseName, affix) {
  if (!affix) return baseName;
  return affix.prefix ? affix.prefix + ' ' + baseName : affix.suffix ? baseName + ' ' + affix.suffix : baseName;
}

export function affixColor(affix) {
  return (affix && RARITY[affix.rarity]?.color) || RARITY.common.color;
}

/** Sell value multiplier (1 for plain items). Applied once, when the host spawns the item. */
export function affixValueBonus(affix) {
  if (!affix || !RARITY_VALUE[affix.rarity]) return 1;
  const pctBonus = Math.min(CAP.valuePct, Math.max(0, Number(affix.mods?.valuePct) || 0)) * VALUE_PCT_WEIGHT;
  return Math.min(MAX_VALUE_BONUS, RARITY_VALUE[affix.rarity] * (1 + pctBonus));
}

/** Weapon cooldown with the affix attack speed. */
export function affixCooldown(affix, cd) {
  const s = affix?.mods?.speedPct || 0;
  return s > 0 ? cd / (1 + s) : cd;
}

const pct = (v) => Math.round(v * 100);
/** Short stat lines for tooltips / scan, e.g. ['+24% damage', '7% lifesteal']. opts.rarity prepends the rarity name. */
export function describeAffix(affix, opts = {}) {
  const out = [];
  if (!affix) return out;
  if (opts.rarity) out.push(RARITY[affix.rarity]?.name || affix.rarity);
  const m = affix.mods || {};
  if (m.dmgPct) out.push(`+${pct(m.dmgPct)}% damage`);
  if (m.critPct) out.push(`+${pct(m.critPct)}% crit`);
  if (m.speedPct) out.push(`+${pct(m.speedPct)}% speed`);
  if (m.lifesteal) out.push(`${pct(m.lifesteal)}% lifesteal`);
  if (m.stunChance) out.push(`${pct(m.stunChance)}% stun`);
  if (m.shock) out.push(`+${m.shock} shock`);
  if (m.valuePct) out.push(`+${pct(m.valuePct * VALUE_PCT_WEIGHT)}% value`);
  return out;
}

const NO_EFFECTS = Object.freeze([]);
/**
 * Apply an affix to a hit rolled by the local player.
 *   hit: { dmg, crit, cd, stun? }  (dmg already includes the base crit doubling)
 * Returns { dmg, crit, cd, stun, heal, shock, effects } where effects are on-hit extras:
 *   { type: 'heal', amount } | { type: 'stun', t } | { type: 'shock', dmg }
 * heal is meant to be applied only when the hit lands (see applyAffixEffects).
 */
export function applyAffixes(affix, hit, rng = Math.random) {
  const base = { dmg: hit.dmg || 0, crit: !!hit.crit, cd: hit.cd || 0, stun: hit.stun || 0, heal: 0, shock: 0, effects: NO_EFFECTS };
  const m = affix?.mods;
  if (!m) return base;
  const r = toFn(rng);
  let dmg = base.dmg * (1 + (m.dmgPct || 0));
  let crit = base.crit;
  if (!crit && m.critPct > 0 && r() < m.critPct) { crit = true; dmg *= 2; }
  const shock = m.shock || 0;
  dmg += shock;
  const effects = [];
  let stun = base.stun;
  if (m.stunChance > 0 && r() < m.stunChance) { stun = Math.max(stun, STUN_SECONDS); effects.push({ type: 'stun', t: STUN_SECONDS }); }
  if (shock) effects.push({ type: 'shock', dmg: shock });
  let heal = 0;
  if (m.lifesteal > 0) {
    heal = Math.min(MAX_HEAL_PER_HIT, Math.round(dmg * m.lifesteal * 10) / 10);
    if (heal > 0) effects.push({ type: 'heal', amount: heal });
  }
  return { dmg, crit, cd: affixCooldown(affix, base.cd), stun, heal, shock, effects };
}

const _fxPos = new THREE.Vector3();
/**
 * Client-side on-hit feedback for a landed affixed hit (local player only): lifesteal heals,
 * shock / stun float text + spark sound. view = the CreatureView that was hit (may be null).
 */
export function applyAffixEffects(game, res, view) {
  if (!res || !res.effects || !res.effects.length) return;
  const p = game.player;
  const living = view && view.maxHp !== null && view.maxHp !== undefined && !view.def?.hazard;
  if (view) _fxPos.copy(view.pos).y += (view.height || 1.5) + 0.5;
  for (const e of res.effects) {
    if (e.type === 'heal' && living && p && !p.dead && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + e.amount);
      game.net?.send('pst', { hp: Math.round(p.hp) });
      if (view) game.ui?.hud?.floatText(_fxPos, `+${Math.round(e.amount)} HP`, '#7dff7d');
    } else if (e.type === 'shock' && view) {
      game.audio?.at?.('spark', _fxPos, 0.6, { refDistance: 2 });
      game.ui?.hud?.floatText(_fxPos, `⚡${e.dmg}`, '#8fe8ff');
    } else if (e.type === 'stun' && view && view.maxHp !== null) {
      game.ui?.hud?.floatText(_fxPos, 'STUN', '#ffd23f');
    }
  }
}

// ------------------------------------------------------------------------------------------
// Loot beams: a soft vertical light column over affixed items lying in the world (client side).
// ------------------------------------------------------------------------------------------
const BEAM_OPACITY = { uncommon: 0.16, rare: 0.24, epic: 0.3, legendary: 0.4 };

/**
 * installLootFx(game) -> { update(dt), dispose() }
 * Subscribes itself to game.mods 'update' (and auto-disposes on 'sessionEnd'); when the game has no
 * mod manager, call update(dt) every frame yourself.
 */
export function installLootFx(game) {
  const beams = new Map();          // item id -> mesh
  let geo = null;
  const mats = {};
  let scanT = 0, time = 0, disposed = false;
  const offs = [];

  const ensureRes = () => {
    if (geo) return;
    geo = new THREE.CylinderGeometry(0.05, 0.13, 2.6, 6, 1, true).translate(0, 1.3, 0);
    geo.userData.shared = true;     // never disposed by item disposal
    for (const r of AFFIX_RARITIES) {
      mats[r] = new THREE.MeshBasicMaterial({
        color: RARITY[r].color, transparent: true, opacity: BEAM_OPACITY[r], depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
    }
  };
  const removeBeam = (id, mesh) => { mesh.removeFromParent(); beams.delete(id); };

  const api = {
    update(dt) {
      if (disposed) return;
      time += dt;
      scanT -= dt;
      const items = game.items;
      if (!items) return;
      if (scanT <= 0) {
        scanT = 0.4;
        for (const it of items.all()) {
          if (!it.affix || it.state !== 'world' || beams.has(it.id) || !RARITY[it.affix.rarity]) continue;
          ensureRes();
          const m = new THREE.Mesh(geo, mats[it.affix.rarity] || mats.uncommon);
          m.frustumCulled = true;
          m.renderOrder = 2;
          game.scene.add(m);
          beams.set(it.id, m);
        }
      }
      for (const [id, m] of beams) {
        const it = items.get(id);
        if (!it || it.state !== 'world' || !it.affix || it.obj.parent !== game.scene) { removeBeam(id, m); continue; }
        m.position.copy(it.obj.position);
        m.position.y -= (it.size?.y || 0.3) * 0.5;
      }
      if (geo) {
        const pulse = 0.75 + 0.25 * Math.sin(time * 3.2);
        for (const r of AFFIX_RARITIES) mats[r].opacity = BEAM_OPACITY[r] * (r === 'legendary' ? 0.8 + 0.4 * Math.sin(time * 5.1) : pulse);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of offs) off();
      offs.length = 0;
      for (const m of beams.values()) m.removeFromParent();
      beams.clear();
      geo?.dispose();
      for (const r of Object.keys(mats)) mats[r].dispose();
      geo = null;
    },
  };
  if (game.mods?.on) {
    offs.push(game.mods.on('update', (dt, g) => { if (g === game) api.update(dt); }));
    offs.push(game.mods.on('sessionEnd', (g) => { if (g === game) api.dispose(); }));
  }
  return api;
}
