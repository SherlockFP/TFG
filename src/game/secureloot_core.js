// SECURED LOOT + BREACHING TOOLS: the PURE rules (no DOM, no game access; node-tested by tools/harness/secureloot.test.mjs).
// Game glue: src/game/secureloot.js. Numbers documented in docs/wave2/secureloot.md - change them HERE only.
//
//   KINDS / METHODS        container kinds and the ways to open each one (tool, time, noise, alarm risk, loot loss)
//   chooseMethod()         which method the E prompt uses for what the player holds / carries
//   methodTime()           hold seconds (tool tier speeds it up), drillDuration(), rollJams() (Payday-style jam odds)
//   planContainers()       how many / which containers a facility gets per quota (seeded, deterministic)
//   rollContents()         the (seeded) loot of a container: tier floor +1 and up, shards / tools / gear sometimes
//   registerSecureItems() / registerSecureRecipes()   the 5 tools + Code Slip + crafting recipes (idempotent)
import { CAGE_PICKS } from './lockpick2_core.js';   // [lockpick2] lockpick + titanium pick + bypasser
import { RNG, hashString } from '../core/rng.js';
import { TIER_ORDER, TIERS, tierIndex, rollTier, tierOfItem } from './tiers.js';
import { ITEMS, registerItem } from './items.js';
import { RECIPES } from './recipes.js';
import { COMPONENT_IDS } from './components.js';
import { TIER_VALUE_NORM } from './inventory_core.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const T = Object.freeze({ CUTTER: 'sl_glasscutter', BOLT: 'sl_boltcutters', HACK: 'sl_hacktool', DRILL: 'sl_drill', TORCH: 'sl_torch', NOTE: 'sl_note',
  FUEL: 'comp_fuel', EMP: 'craft_emp', PICK: 'lockpick', CROWBAR: 'crowbar' });
export const TOOL_IDS = Object.freeze([T.CUTTER, T.BOLT, T.HACK, T.DRILL, T.TORCH]);
export const MAX_PER_FACILITY = 5;
export const REACH = 3.2;          // m: interaction reach (prompt); the host accepts 5 m (lag tolerance)

// ---------------------------------------------------------------------------------------------- tools (items)
// price = Company Store credits. charges = uses (every attempt with the tool wears 1: a success, a failed minigame, a completed drill run; packing a drill up early costs nothing).
// Found copies roll a tier: speed x timeMul(tier), charges x TIERS[tier].statMul (chargesFor).
export const TOOL_DEFS = [
  { id: T.CUTTER, name: 'Glass Cutter', kind: 'tool', price: 45, weight: 2, hands: 1, charges: 6, shop: 'tools', tier: 'common', slTool: 'cutter',
    tip: 'Cuts glass display cases in 4 s, almost silently. Hold [E] at the case. 6 uses.' },
  { id: T.BOLT, name: 'Bolt Cutters', kind: 'tool', price: 60, weight: 7, hands: 1, charges: 5, shop: 'tools', tier: 'common', slTool: 'bolt', size: [1, 2],
    tip: 'Snaps chains and padlocks on cages and lockers in 3 s (medium noise). Hold [E]. 5 uses.' },
  { id: T.HACK, name: 'Hack Tool', kind: 'tool', price: 85, weight: 1, hands: 1, charges: 5, shop: 'tools', tier: 'common', slTool: 'hack',
    tip: 'Plug it into an electronic lockbox: a short timing minigame. Fail it and the alarm goes off. 5 uses.' },
  { id: T.DRILL, name: 'Breaching Drill', kind: 'tool', price: 240, weight: 24, hands: 2, charges: 3, shop: 'tools', tier: 'common', slTool: 'drill',
    tip: 'Heavy, two-handed. Set it on a safe [E]: it grinds by itself for 40-70 s, LOUD, and can jam (fix it with [E]). Defend it. 3 runs.' },
  { id: T.TORCH, name: 'Plasma Torch', kind: 'tool', price: 195, weight: 9, hands: 1, charges: 4, shop: 'tools', tier: 'common', slTool: 'torch', size: [1, 2],
    tip: 'Burns through a vault crate in 8 s (bright sparks, loud). Each cut uses one Fuel Canister. 4 uses.' },
  { id: T.NOTE, name: 'Code Slip', kind: 'tool', price: 0, weight: 0, hands: 1, tier: 'common', slNote: true,
    tip: 'A scribbled safe code. Hold it (or carry it) next to the matching safe to open it with the keypad minigame. LMB: read it.' },
];
export const TOOL_TR_KEYS = TOOL_DEFS.map((d) => d.name);

export function registerSecureItems() {
  for (const d of TOOL_DEFS) if (!ITEMS[d.id]) registerItem({ ...d });
}
// crafting recipes (workbench, cat 'tools'): result tier rolls in `tier` [min, max]
export const TOOL_RECIPES = [
  { id: 'sl_glasscutter', name: 'Glass Cutter', cat: 'tools', out: T.CUTTER, n: 1, in: [['comp_scrapmetal', 2], ['comp_crystal', 1]], tier: ['common', 'rare'], time: 2, desc: 'A diamond wheel on a handle. Quiet glass work.' },
  { id: 'sl_boltcutters', name: 'Bolt Cutters', cat: 'tools', out: T.BOLT, n: 1, in: [['comp_scrapmetal', 4], ['comp_cable', 1]], tier: ['common', 'rare'], time: 2.2, desc: 'Long steel jaws for chains and padlocks.' },
  { id: 'sl_hacktool', name: 'Hack Tool', cat: 'tools', out: T.HACK, n: 1, in: [['comp_circuit', 2], ['comp_battery', 1], ['comp_sensor', 1]], tier: ['common', 'epic'], time: 2.6, desc: 'Skeleton keys for electronic locks.' },
  { id: 'sl_torch', name: 'Plasma Torch', cat: 'tools', out: T.TORCH, n: 1, in: [['comp_fuel', 1], ['comp_scrapmetal', 2], ['comp_coolant', 1], ['comp_circuit', 1]], tier: ['common', 'epic'], time: 3, desc: 'Cuts vault crates. Needs a Fuel Canister per cut.' },
  { id: 'sl_drill', name: 'Breaching Drill', cat: 'tools', out: T.DRILL, n: 1, in: [['comp_scrapmetal', 6], ['comp_circuit', 2], ['comp_battery', 2], ['comp_fuse', 1], ['comp_cable', 2]], tier: ['common', 'epic'], time: 3.4, desc: 'A portable safe breaker. Loud. Really loud.' },
];
export function registerSecureRecipes() {
  for (const r of TOOL_RECIPES) if (!RECIPES.some((x) => x.id === r.id)) RECIPES.push({ ...r });
}

// ---------------------------------------------------------------------------------------------- tiers -> speed / wear
/** Tool speed multiplier on hold times (Common 1.0 ... Mythic 0.63). */
export const timeMul = (tier) => 1 / (1 + 0.12 * tierIndex(tier));
/** Charges of a found / crafted tool of this tier (store copies are Common = base charges). */
export const chargesFor = (def, tier) => Math.max(1, Math.ceil((def?.charges || 1) * (TIERS[tier]?.statMul || 1)));
/** Drill run time in seconds: 70 s Common ... 40 s Mythic. */
export const drillDuration = (tier) => clamp(70 - 6 * tierIndex(tier), 40, 70);
/** Chance that a run jams at least once: 25 % Common, 2 % less per tier (15 % Mythic). */
export const jamOdds = (tier) => clamp(0.25 - 0.02 * tierIndex(tier), 0.1, 0.25);
export const FIX_TIME = 1.4;       // s holding [E] to clear a jam
export const CHEW_RANGE = 3.2;     // m: a creature this close to a running drill may jam it
export const CHEW_CHANCE = 0.35;   // per 2 s check
/** Progress fractions (0..1) at which the drill jams during ONE run: [] (75 %), [f] or [f, g] (a second jam is half as likely). */
export function rollJams(rng, tier) {
  const p1 = jamOdds(tier), out = [];
  if (rng.next() < p1) {
    const f = rng.float(0.2, 0.8);
    out.push(f);
    if (f < 0.72 && rng.next() < p1 * 0.5) out.push(rng.float(f + 0.12, 0.92));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- containers
// hold = seconds to open with the tool at Common tier (see METHODS); `size` = [w, h, d] of the model / collider.
export const KINDS = {
  case:    { id: 'case', name: 'Glass Display Case', xp: 26, size: [0.95, 1.55, 0.95], floor: 1, luck: 0.10, n: [1, 1] },
  safe:    { id: 'safe', name: 'Safe', xp: 44, size: [0.8, 0.9, 0.7], floor: 2, luck: 0.18, n: [2, 3] },
  cage:    { id: 'cage', name: 'Locked Cage', xp: 30, size: [1.3, 1.7, 0.8], floor: 1, luck: 0.12, n: [2, 3] },
  lockbox: { id: 'lockbox', name: 'Electronic Lockbox', xp: 40, size: [0.85, 0.6, 0.6], floor: 2, luck: 0.16, n: [2, 3] },
  vault:   { id: 'vault', name: 'Vault Crate', xp: 90, size: [1.4, 1.0, 1.0], floor: 3, luck: 0.32, n: [3, 5] },
};
export const KIND_IDS = Object.keys(KINDS);
const VARIANT_NAME = { wall: 'Wall Safe', floor: 'Floor Safe', cage: 'Locked Cage', locker: 'Chained Locker' };
export const nameOf = (kind, variant) => (kind === 'safe' ? VARIANT_NAME[variant === 'wall' ? 'wall' : 'floor'] : kind === 'cage' ? VARIANT_NAME[variant === 'locker' ? 'locker' : 'cage'] : KINDS[kind]?.name || kind);
export const ALL_NAMES = ['Glass Display Case', 'Wall Safe', 'Floor Safe', 'Locked Cage', 'Chained Locker', 'Electronic Lockbox', 'Vault Crate'];

const isMelee = (d) => !!d && d.kind === 'weapon' && !d.ranged;
export { isMelee };

/**
 * Ways to open a container, in priority order. Fields:
 *   tools / melee / pry   which held or carried item does it (tools = item ids; melee = any non-ranged weapon; pry = def.pry, i.e. the crowbar)
 *   base        hold seconds at Common tier (tools: x timeMul; 'bash': x bashMul(weapon)); minigame methods have no hold
 *   noise       { burst } one loud bang at the start, and / or { loud, every } pulses (creatures.noise units, balance.noise -> Threat)
 *   alarmP      chance the facility alarm goes off when it opens (crude ways only) ; failAlarm: a failed minigame raises it
 *   loss        { p, mul } chance PER ITEM that a crude opening damages it (value x mul)
 *   crude       the loud fallback (never impossible); passive = knowledge, works from the pack (Code Slip)
 */
export const METHODS = {
  case: [
    { id: 'cutter', tools: [T.CUTTER], base: 4, noise: { loud: 0.2, every: 1.5 }, wear: 1 },
    { id: 'smash', melee: true, base: 0.4, noise: { burst: 3.2 }, alarmP: 0.35, loss: { p: 0.3, mul: 0.5 }, crude: true },
    { id: 'fists', fists: true, base: 6, noise: { loud: 1.2, every: 1.0 }, alarmP: 0.1, loss: { p: 0.3, mul: 0.5 }, crude: true },
  ],
  safe: [
    { id: 'code', tools: [T.NOTE], minigame: 'safe', passive: true, wear: 0, consume: true, failAlarm: true },
    { id: 'drill', tools: [T.DRILL], drill: true, noise: { burst: 1.5, loud: 0.9, every: 2.0 }, wear: 1 },
    { id: 'bash', melee: true, base: 32, noise: { loud: 1.9, every: 1.1 }, alarmP: 0.3, loss: { p: 0.35, mul: 0.7 }, crude: true },
  ],
  cage: [
    { id: 'bolt', tools: [T.BOLT], base: 3, noise: { loud: 0.6, every: 1.5 }, wear: 1 },
    { id: 'pick', tools: CAGE_PICKS, minigame: 'lockpick', noise: { loud: 0.25, every: 2 }, wear: 1 },
    { id: 'pry', pry: true, base: 6, noise: { loud: 1.1, every: 0.9 }, alarmP: 0.05, crude: true },
    { id: 'bash', melee: true, base: 14, noise: { loud: 1.9, every: 1.1 }, alarmP: 0.15, crude: true },
  ],
  lockbox: [
    { id: 'hack', tools: [T.HACK], minigame: 'hack', failAlarm: true, wear: 1 },
    { id: 'emp', tools: [T.EMP], base: 1.5, noise: { burst: 0.7 }, consume: true },
    { id: 'bash', melee: true, base: 20, noise: { loud: 1.9, every: 1.1 }, alarmP: 0.35, loss: { p: 0.4, mul: 0.5 }, crude: true },
  ],
  vault: [
    { id: 'torch', tools: [T.TORCH], base: 8, noise: { loud: 1.0, every: 1.6 }, needs: T.FUEL, sparks: true, wear: 1 },
    { id: 'pry', pry: true, base: 25, noise: { loud: 1.6, every: 1.0 }, alarmP: 0.3, crude: true },
    { id: 'bash', melee: true, base: 60, noise: { loud: 2.0, every: 1.0 }, alarmP: 0.5, crude: true },
  ],
};
export const methodOf = (kind, id) => (METHODS[kind] || []).find((m) => m.id === id) || null;
/** Heavy weapons (sledge, weight >= 15 / knock) break things faster, tiny ones slower. */
export const bashMul = (def) => (!def ? 1 : def.pry ? 0.5 : (def.knock >= 2 || def.weight >= 15) ? 0.6 : (def.dmg || 20) < 16 ? 1.25 : 1);

function matchesItem(m, def) {
  if (!def) return false;
  if (m.melee) return isMelee(def);
  if (m.pry) return (def.pry || 0) > 0;
  if (m.tools) return m.tools.includes(def.id);
  return false;
}
export const itemMatches = matchesItem;

/**
 * Decide what [E] does. `held` = { def, tier?, it? } | null (the selected hotbar item), `owned` = the other items the player carries
 * (same shape; include fuel / EMP / matching Code Slips). Rules: (1) a Code Slip in the pack always counts (knowledge); (2) what you HOLD wins;
 * (3) otherwise the best method a carried tool allows (proper tools before crude melee); (4) bare hands only where METHODS lists `fists`.
 * Returns { method, entry, aux, missing } - method null when nothing works (`missing` lists what the prompt should ask for).
 */
export function chooseMethod(kind, held, owned = [], opts = {}) {
  const list = METHODS[kind] || [];
  const all = held ? [held, ...owned] : owned.slice();
  const hasAux = (m) => !m.needs || all.find((e) => e.def?.id === m.needs) || null;
  const missing = [];
  const tryEntry = (m, e) => {
    if (!matchesItem(m, e.def)) return null;
    const aux = hasAux(m);
    if (!aux) { missing.push({ method: m.id, need: m.needs }); return null; }
    return { method: m, entry: e, aux: aux === true ? null : aux, missing };
  };
  for (const m of list) if (m.passive) { for (const e of all) { const r = tryEntry(m, e); if (r) return r; } }
  if (held) for (const m of list) { const r = tryEntry(m, held); if (r) return r; }
  for (const m of list) { if (m.crude) continue; for (const e of owned) { const r = tryEntry(m, e); if (r) return r; } }
  for (const m of list) { if (!m.crude || m.fists) continue; for (const e of owned) { const r = tryEntry(m, e); if (r) return r; } }
  if (!opts.noFists) { const f = list.find((m) => m.fists); if (f) return { method: f, entry: null, aux: null, missing }; }
  return { method: null, entry: null, aux: null, missing };
}

/** Hold seconds for a method with this tool tier / weapon (0 = no hold: minigame or instant drill placement). */
export function methodTime(m, { tier = 'common', def = null } = {}) {
  if (!m || m.minigame || m.drill) return 0;
  let t = m.base || 0;
  if (m.crude) { if (m.id === 'bash') t *= bashMul(def); }
  else if (m.tools) t *= timeMul(tier);
  return Math.round(t * 100) / 100;
}
/** Chance the facility alarm rings when the container opens (crude ways) or a minigame fails. */
export const alarmChance = (m) => (m ? m.alarmP || 0 : 0);

/** Noise events of a method: { burst, loud, every } in creatures.noise units (balance.noise feeds Threat: loud x 1.4 per event). */
export const noiseOf = (m) => (m?.noise ? { burst: m.noise.burst || 0, loud: m.noise.loud || 0, every: m.noise.every || 0 } : { burst: 0, loud: 0, every: 0 });
/** Total noise events of a hold / drill of `sec` seconds (burst + pulses); the balance table uses it. */
export function noiseEvents(m, sec) {
  const n = noiseOf(m);
  const pulses = n.every > 0 && n.loud > 0 ? Math.floor(sec / n.every) : 0;
  return { events: (n.burst > 0 ? 1 : 0) + pulses, loudSum: n.burst + pulses * n.loud };
}
/** Threat added by a noise event (balance_core THREAT.noiseEvent: below 0.45 nothing, else 1.4 x loud, capped 6). */
export const threatOfNoise = (loud) => (loud >= 0.45 ? Math.min(6, loud * 1.4) : 0);

// ---------------------------------------------------------------------------------------------- planning
/** Kind weights per quota index (sector): early = glass cases + cages, deeper = safes, lockboxes, vault crates. */
export function kindWeights(quota, { hasVault = false } = {}) {
  const q = Math.max(0, quota | 0);
  return {
    case: Math.max(8, 62 - q * 14),
    cage: 24 - Math.min(q, 4),
    lockbox: q < 1 ? 0 : 14 + q * 2,
    safe: q < 1 ? 0 : 12 + q * 4,
    vault: q < 3 ? 0 : 4 + (q - 3) * 3 + (hasVault ? 8 : 0),
  };
}
/** How many containers a facility gets: quota 0 -> 0..1 (mostly 1), then 1-2, 2-3, 2-4, 3-5; big facilities +1 (never above 5). */
export function containerCount(rng, quota, size = 1) {
  const q = Math.max(0, quota | 0);
  let n;
  if (q === 0) n = rng.chance(0.9) ? 1 : 0;
  else if (q === 1) n = 1 + (rng.chance(0.5) ? 1 : 0);
  else if (q === 2) n = 2 + (rng.chance(0.4) ? 1 : 0);
  else if (q === 3) n = 2 + rng.int(0, 2);
  else n = 3 + rng.int(0, 2);
  if (q >= 1 && size >= 1.6) n += 1;
  return clamp(n, 0, q === 0 ? 1 : MAX_PER_FACILITY);
}
/**
 * The container list of a facility: [{ kind, variant }]. Pure + seeded (same rng state -> same plan).
 * ctx: { quota, size, hasVault, hasWalls (wall spots exist) }.
 */
export function planContainers(rng, ctx = {}) {
  const q = Math.max(0, ctx.quota | 0);
  const n = containerCount(rng, q, ctx.size || 1);
  const W = kindWeights(q, ctx);
  const out = [];
  let vaults = 0;
  for (let i = 0; i < n; i++) {
    const entries = Object.entries(W).filter(([k, w]) => w > 0 && !(k === 'vault' && vaults >= (q >= 5 ? 2 : 1))).map(([k, w]) => ({ k, w }));
    const kind = rng.weighted(entries).k;
    if (kind === 'vault') vaults++;
    let variant = null;
    if (kind === 'safe') variant = ctx.hasWalls !== false && rng.chance(0.55) ? 'wall' : 'floor';
    else if (kind === 'cage') variant = rng.chance(0.5) ? 'cage' : 'locker';
    out.push({ kind, variant });
  }
  return out;
}
/** 4-digit safe code (deterministic per world seed + container id). */
export function safeCode(seed, id) { return String(hashString(`code:${seed | 0}:${id}`) % 10000).padStart(4, '0'); }
/** Does this safe get a Code Slip lying somewhere in the facility? (65 %) */
export const hasCodeSlip = (seed, id) => hashString(`slip:${seed | 0}:${id}`) % 100 < 65;

// ---------------------------------------------------------------------------------------------- loot
const TOOL_LOOT = [['medkit', 8], ['stungrenade', 6], ['glowstick', 6], ['lockpick', 9], ['proflash', 3], ['booster', 3], ['adblock', 3], ['adrenaline', 4], ['craft_emp', 3],
  [T.CUTTER, 3.2], [T.BOLT, 3], [T.HACK, 2.6], [T.TORCH, 1.2], [T.DRILL, 0.9], ['craft_batterypack', 3], ['craft_decoy', 2.5], ['craft_cryo', 2]];
const CAT_W = {
  case:    { scrap: 74, gear: 16, tool: 5, shard: 5 },
  cage:    { scrap: 36, comp: 28, tool: 14, gear: 14, shard: 8 },
  safe:    { scrap: 42, comp: 16, shard: 16, gear: 16, tool: 10 },
  lockbox: { comp: 38, shard: 22, tool: 18, scrap: 12, gear: 10 },
  vault:   { scrap: 30, gear: 22, shard: 20, comp: 14, tool: 14 },
};
/** Tier floor of the loot: Uncommon (cases, cages) / Rare (safes, lockboxes) / Epic (vault crates); cases + cages step up to Rare from quota 3, everything one more from quota 6 (max Epic). */
export const floorTier = (kind, quota) => {
  const b = KINDS[kind]?.floor ?? 1, q = quota | 0;
  return TIER_ORDER[clamp(b + (q >= 3 && b <= 1 ? 1 : 0) + (q >= 6 ? 1 : 0), 1, 3)];
};
const mid = (d) => (Array.isArray(d?.value) ? (d.value[0] + d.value[1]) / 2 : d?.price ? d.price * 0.4 : 8);

/** Loot pools from the item registry: { scrap, comp, shard, tool, gear } of { id, tier }. */
export function buildCatalog(items = ITEMS) {
  const P = { scrap: [], comp: [], shard: [], tool: [], gear: [] };
  for (const [id, d] of Object.entries(items)) {
    if (id.startsWith('x_')) continue;   // downloaded-model items (extcontent.js) register asynchronously: they could differ between peers
    if (d.kind === 'scrap' && d.value && id !== 'key' && d.hands === 1 && !d.cursed && !d.special && !d.strange && !d.core) P.scrap.push({ id, tier: tierOfItem(null, d) });
    else if (d.kind === 'weapon' && !d.crafted && !(d.price === 0 && d.coin) && d.dmg > 0) P.gear.push({ id, tier: TIERS[d.rarity] ? d.rarity : 'common' });
    else if (/^(skillbook|bag_|spellbook|blueprint)/.test(id)) P.gear.push({ id, tier: TIERS[d.tier] ? d.tier : 'rare' });
    else if (/^shard_/.test(id) && d.forge) P.shard.push({ id, tier: TIERS[d.tier] ? d.tier : 'common' });
  }
  for (const id of COMPONENT_IDS) if (items[id] && !items[id].keyItem) P.comp.push({ id, tier: TIERS[items[id].tier] ? items[id].tier : 'common' });
  for (const [id] of TOOL_LOOT) if (items[id]) P.tool.push({ id, tier: 'common' });
  return P;
}
function pickNear(list, tier, rng) {
  if (!list.length) return null;
  const want = tierIndex(tier);
  let best = 99, pick = [];
  for (const e of list) {
    const d = Math.abs(tierIndex(e.tier) - want) + (tierIndex(e.tier) > want ? 0.5 : 0);
    if (d < best) { best = d; pick = [e]; } else if (d === best) pick.push(e);
  }
  return rng.pick(pick);
}
function pickTool(list, rng) {
  const w = TOOL_LOOT.filter(([id]) => list.some((e) => e.id === id)).map(([id, w]) => ({ id, w }));
  return w.length ? rng.weighted(w).id : null;
}
/**
 * The (seeded) contents of a container: [{ type, tier }]. Tier floor = one above the average loot roll (Uncommon for cases / cages,
 * Rare for safes / lockboxes, Epic for vault crates), +1 from quota 3. Scrap is best-of-2 (case, vault: best-of-3) by value.
 * Shards / tools / gear show up sometimes; a vault crate always holds a Rare+ gear piece.
 */
export function rollContents(kind, rng, { quota = 0, catalog } = {}) {
  const K = KINDS[kind];
  if (!K) return [];
  const P = catalog || buildCatalog();
  const floor = floorTier(kind, quota);
  const cap = TIER_ORDER[Math.min(5, tierIndex(floor) + 3)];
  const n = rng.int(K.n[0], K.n[1]);
  const W = CAT_W[kind];
  const out = [];
  let scrapN = 0, gearN = 0;
  const bestOf = kind === 'case' || kind === 'vault' ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const tier = rollTier(rng, { luck: K.luck + Math.min(0.2, (quota | 0) * 0.02), minTier: floor, maxTier: cap });
    const cats = Object.entries(W).filter(([c]) => P[c]?.length && !(c === 'scrap' && scrapN >= 2 && n > 2)).map(([c, w]) => ({ c, w }));
    if (!cats.length) break;
    const cat = rng.weighted(cats).c;
    let type = null, outTier = tier;
    if (cat === 'scrap') {
      let best = null;
      for (let k = 0; k < bestOf; k++) { const e = rng.pick(P.scrap); if (!best || mid(ITEMS[e.id]) > mid(ITEMS[best.id])) best = e; }
      type = best.id; scrapN++;
    } else if (cat === 'tool') { type = pickTool(P.tool, rng); outTier = tier; }
    else { const e = pickNear(P[cat], tier, rng); type = e?.id; if (cat === 'gear') gearN++; if (cat === 'comp') outTier = null; }
    if (!type) continue;
    out.push({ type, tier: outTier });
  }
  if (kind === 'vault' && !gearN && P.gear.length) {
    const e = pickNear(P.gear, TIER_ORDER[Math.max(3, tierIndex(floor))], rng);
    if (e) out[out.length - 1] = { type: e.id, tier: e.tier };
  }
  return out;
}
/** Sell value + utility value estimate of rolled contents (balance table): scrap counts fully, other items at 50 % of their store price / value. */
export function valueOfContents(list, valueMul = 1) {
  let sell = 0, util = 0;
  for (const e of list) {
    const d = ITEMS[e.type];
    if (!d) continue;
    const tv = e.tier && !d.tier && d.kind !== 'weapon' ? (TIERS[e.tier]?.valueMul || 1) * TIER_VALUE_NORM : 1;
    if (d.kind === 'scrap' || d.kind === 'drop' || d.kind === 'big') sell += mid(d) * tv * valueMul;
    else util += (d.price ? d.price * 0.5 : mid(d)) * (e.tier && TIERS[e.tier] ? TIERS[e.tier].statMul : 1);
  }
  return { sell, util };
}
/** Seed of a container's loot RNG (same on every peer). */
export const lootSeed = (worldSeed, id) => hashString(`sl:${worldSeed | 0}:${id}`);
export { RNG, tierIndex, TIER_ORDER };
