// PET SYSTEM - pure rules and data (no THREE, no DOM: node-testable, tools/harness/pets.test.mjs). Design: docs/MASTERPLAN.md section 18.
//  - 9 species (cat dog fox bear bee owl parrot crow bot), each with a role, 3 ability slots (Lv 1 / 10 / 20), 3 evolution stages (Lv 1 / 10 / 20)
//  - XP / levels 1..30, random traits, loyalty (obedience), capture odds, egg hatching (in game days), KO / rest, skins catalogue
//  - profile.pets = { v, stable: [pet x6], active: petId|null, incubator: [egg x2], eggs: n(unused), clock: game days, skins: {cat: [ids]}, dex: {sp: true}, stats: {...} }
// All randomness takes an injected rng (() => [0,1)), so tests are deterministic and world gen is never touched.

export const MAX_STABLE = 6;
export const MAX_LEVEL = 30;
export const SHINY_CHANCE = 0.02;
export const INCUBATOR_SLOTS = 2;
export const EVO_LEVELS = [1, 10, 20];      // stage 1 / 2 / 3 start here
export const SLOT_LEVELS = [1, 10, 20];     // ability slots unlock here
export const NAME_MAX = 16;
export const MODES = ['follow', 'stay', 'fetch', 'guard'];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// ---------------------------------------------------------------------------------------------------- species
// base: level-1 stats, grow: per level. spd in m/s. fetch: fetch range in m (0 = cannot fetch). atkCd seconds.
// pal: main / sub / accent hex; shiny palette; variants (colour skins). abilities carry the numeric `fx` the sim and stats read.
export const SPECIES = {
  cat: {
    id: 'cat', name: 'Cat', role: 'scout', roleName: 'Scout', kind: 'quad', size: 0.9,
    desc: 'Silent and sharp-eyed. Senses creatures around you and marks them on your HUD.',
    base: { hp: 32, atk: 3.5, spd: 4.3 }, grow: { hp: 3.2, atk: 0.55 }, atkCd: 1.0, fetch: 0, assist: false, price: 250, eggWeight: 3,
    evo: ['Kitten', 'Cat', 'Glitch Cat'],
    pal: ['#d98a3a', '#f3dcb0', '#3a2a1a'], shiny: ['#8f5cff', '#dcc8ff', '#20ffe0'],
    variants: [{ id: 'v1', name: 'Shadow', pal: ['#2a2a34', '#55556a', '#ffd23f'] }, { id: 'v2', name: 'Snow', pal: ['#ececf0', '#ffffff', '#7ad0ff'] }],
    abilities: [
      { id: 'whisker', lv: 1, name: 'Whisker Sense', desc: 'Marks creatures within 14 m on your HUD.', fx: { sense: 14 } },
      { id: 'ninelives', lv: 10, name: 'Nine Lives', desc: 'Survives one knockout per day at 40% HP.', fx: { revive: true, sense: 17 } },
      { id: 'ghostpaws', lv: 20, name: 'Ghost Paws', desc: 'Sense range 24 m and it spots hidden traps too.', fx: { sense: 24, senseHazards: true, dodge: 0.25 } },
    ],
  },
  dog: {
    id: 'dog', name: 'Dog', role: 'fetch', roleName: 'Fetch', kind: 'quad', size: 1.0,
    desc: 'Loyal retriever. Fetches small scrap to you or the ship and barks when danger is near.',
    base: { hp: 44, atk: 4.5, spd: 4.4 }, grow: { hp: 4.0, atk: 0.65 }, atkCd: 1.15, fetch: 16, assist: true, price: 250, eggWeight: 3,
    evo: ['Pup', 'Dog', 'Server Hound'],
    pal: ['#b07840', '#f0d8a8', '#5a3a1c'], shiny: ['#ffd23f', '#fff4b8', '#ff5a3a'],
    variants: [{ id: 'v1', name: 'Husky', pal: ['#8a96a6', '#f2f4f8', '#2a3444'] }, { id: 'v2', name: 'Doberman', pal: ['#26242a', '#b06a3a', '#ff7a2a'] }],
    abilities: [
      { id: 'fetch', lv: 1, name: 'Good Boy: Fetch', desc: 'Fetches small scrap within 16 m.', fx: { fetchRange: 16, carry: 1 } },
      { id: 'watchbark', lv: 10, name: 'Watch Bark', desc: 'Barks and marks creatures within 18 m of you.', fx: { bark: 18, fetchRange: 18 } },
      { id: 'retriever', lv: 20, name: 'Server Retriever', desc: 'Carries 2 items per trip and fetches 35% faster.', fx: { carry: 2, fetchFast: 0.65, fetchRange: 22 } },
    ],
  },
  fox: {
    id: 'fox', name: 'Fox', role: 'thief', roleName: 'Thief', kind: 'quad', size: 0.95,
    desc: 'Sneaky. Steals from Collector nests and sniffs out closed chests and stashes.',
    base: { hp: 34, atk: 4.0, spd: 4.9 }, grow: { hp: 3.2, atk: 0.6 }, atkCd: 0.95, fetch: 14, assist: true, price: 500, eggWeight: 2,
    evo: ['Kit', 'Fox', 'Kitsune Router'],
    pal: ['#e0662a', '#fff0d8', '#2a1a12'], shiny: ['#5ad0ff', '#e8f8ff', '#ff5ad0'],
    variants: [{ id: 'v1', name: 'Arctic', pal: ['#e8eef4', '#ffffff', '#7a8a9a'] }, { id: 'v2', name: 'Silver', pal: ['#6a6e7a', '#dfe2ea', '#1a1a22'] }],
    abilities: [
      { id: 'sneak', lv: 1, name: 'Sneak Thief', desc: 'Steals items from nests without waking the owner.', fx: { fetchRange: 14, carry: 1, steal: true } },
      { id: 'nose', lv: 10, name: 'Nose for Secrets', desc: 'Marks closed chests and stashes within 32 m.', fx: { nose: 32 } },
      { id: 'trickster', lv: 20, name: 'Trickster', desc: '30% dodge and faster trips.', fx: { dodge: 0.3, fetchFast: 0.8 } },
    ],
  },
  bear: {
    id: 'bear', name: 'Bear', role: 'tank', roleName: 'Tank', kind: 'quad', size: 1.25,
    desc: 'Big and stubborn. Absorbs part of the damage you take and hauls heavy loot.',
    base: { hp: 80, atk: 6.0, spd: 3.4 }, grow: { hp: 6.5, atk: 0.85 }, atkCd: 1.5, fetch: 12, assist: true, price: 900, eggWeight: 2,
    evo: ['Cub', 'Bear', 'Mainframe Bear'],
    pal: ['#6a4630', '#a8794f', '#2a1a10'], shiny: ['#e8e2d0', '#ffffff', '#ff8ab8'],
    variants: [{ id: 'v1', name: 'Polar', pal: ['#eef0f2', '#ffffff', '#5a6a7a'] }, { id: 'v2', name: 'Panda', pal: ['#f0f0f0', '#2a2a2a', '#111111'] }],
    abilities: [
      { id: 'guardian', lv: 1, name: 'Guardian', desc: 'Takes 20% of the damage you receive within 6 m.', fx: { tank: 0.2 } },
      { id: 'mule', lv: 10, name: 'Pack Mule', desc: 'Drags big loot to you (slowly). +25% tank.', fx: { big: true, carry: 1, fetchRange: 12, tank: 0.25 } },
      { id: 'maul', lv: 20, name: 'Maul', desc: 'Hits 50% harder and may stun.', fx: { atkMul: 1.5, stun: 0.25, tank: 0.3 } },
    ],
  },
  bee: {
    id: 'bee', name: 'Bee Swarm', role: 'swarm', roleName: 'Swarm', kind: 'swarm', size: 0.6,
    desc: 'A buzzing swarm. Stings deal damage over time; pollen heals you a little.',
    base: { hp: 24, atk: 2.6, spd: 5.0 }, grow: { hp: 2.4, atk: 0.36 }, atkCd: 1.2, fetch: 0, assist: true, price: 300, eggWeight: 2,
    evo: ['Bee', 'Swarm', 'Hive Queen'],
    pal: ['#ffd23f', '#2a2410', '#fff2a0'], shiny: ['#ff6ab8', '#3a1030', '#ffd0ec'],
    variants: [{ id: 'v1', name: 'Hornet', pal: ['#ff9a2a', '#2a1408', '#ffd08a'] }, { id: 'v2', name: 'Mint', pal: ['#8affc0', '#103a28', '#e0fff0'] }],
    abilities: [
      { id: 'sting', lv: 1, name: 'Sting Swarm', desc: 'Stings poison for 3 ticks.', fx: { dot: true } },
      { id: 'pollen', lv: 10, name: 'Pollen', desc: 'Heals you 1 HP every 3 s while you are hurt.', fx: { pollen: 0.34 } },
      { id: 'swarm', lv: 20, name: 'Hive Mind', desc: 'Stings hit everything near the target; faster attacks.', fx: { aoe: 3, atkFast: 0.8 } },
    ],
  },
  owl: {
    id: 'owl', name: 'Owl', role: 'vision', roleName: 'Vision', kind: 'bird', size: 0.85,
    desc: 'Shares its night vision and spots valuable loot far away.',
    base: { hp: 30, atk: 3.0, spd: 4.1 }, grow: { hp: 2.8, atk: 0.45 }, atkCd: 1.3, fetch: 0, assist: false, price: null, eggWeight: 2,
    evo: ['Owlet', 'Owl', 'Archive Owl'],
    pal: ['#8a7660', '#e8dcc4', '#ffd23f'], shiny: ['#7ad0ff', '#f0fbff', '#ff5a8a'],
    variants: [{ id: 'v1', name: 'Snowy', pal: ['#f2f2f2', '#ffffff', '#ffb02a'] }, { id: 'v2', name: 'Barn', pal: ['#c89a5a', '#f6ead2', '#2a1a10'] }],
    abilities: [
      { id: 'nighteyes', lv: 1, name: 'Night Eyes', desc: 'Brightens your view in the dark while it is near.', fx: { night: true } },
      { id: 'farsight', lv: 10, name: 'Farsight', desc: 'Marks loose loot within 35 m.', fx: { farsight: 35 } },
      { id: 'silentstrike', lv: 20, name: 'Silent Strike', desc: 'Its first hit on a target does double damage; marks creatures.', fx: { firstStrike: 2, sense: 20 } },
    ],
  },
  parrot: {
    id: 'parrot', name: 'Parrot', role: 'decoy', roleName: 'Decoy', kind: 'bird', size: 0.8,
    desc: 'Mimics sounds. Aim and use ATTACK to send it to lure creatures away.',
    base: { hp: 28, atk: 2.6, spd: 4.5 }, grow: { hp: 2.6, atk: 0.4 }, atkCd: 1.3, fetch: 0, assist: false, price: null, eggWeight: 2,
    evo: ['Chick', 'Parrot', 'Voice Assistant'],
    pal: ['#ff3a3a', '#ffd23f', '#2a7aff'], shiny: ['#20e0c0', '#f0fff8', '#ff3aa8'],
    variants: [{ id: 'v1', name: 'Macaw', pal: ['#2a6aff', '#ffd23f', '#ff3a3a'] }, { id: 'v2', name: 'Cockatiel', pal: ['#c8c8d0', '#ffd23f', '#ff8a5a'] }],
    abilities: [
      { id: 'mimic', lv: 1, name: 'Mimic Call', desc: 'Decoy: lures creatures to a spot for 6 s (40 s cooldown).', fx: { decoy: 40, lure: 6 } },
      { id: 'chatter', lv: 10, name: 'Chatter', desc: 'Louder call, longer lure, 30 s cooldown.', fx: { decoy: 30, lure: 9 } },
      { id: 'polly', lv: 20, name: 'Polly Wants a Word', desc: 'The call also scares nearby creatures for 2 s.', fx: { decoy: 30, lure: 9, scare: true } },
    ],
  },
  crow: {
    id: 'crow', name: 'Crow', role: 'collector', roleName: 'Collector', kind: 'bird', size: 0.8,
    desc: 'Loves shiny things. Fetches the best loot, boosts crew loot tier luck and digs up finds.',
    base: { hp: 30, atk: 3.2, spd: 4.8 }, grow: { hp: 2.8, atk: 0.48 }, atkCd: 1.0, fetch: 16, assist: true, price: null, eggWeight: 2,
    evo: ['Fledgling', 'Crow', 'Data Raven'],
    pal: ['#26262e', '#4a4a58', '#ffd23f'], shiny: ['#ffd23f', '#fff4b8', '#ff5a3a'],
    variants: [{ id: 'v1', name: 'Magpie', pal: ['#1a1a22', '#f0f0f0', '#3a7aff'] }, { id: 'v2', name: 'Ash', pal: ['#8a8a94', '#c4c4cc', '#222'] }],
    abilities: [
      { id: 'magpie', lv: 1, name: 'Magpie Eye', desc: 'Fetches the highest-tier loot within 16 m first.', fx: { fetchRange: 16, carry: 1, pickBest: true } },
      { id: 'luck', lv: 10, name: 'Lucky Find', desc: 'Crew loot tier luck +12% and it digs up a shiny item now and then.', fx: { luck: 0.12, dig: 60 } },
      { id: 'omen', lv: 20, name: 'Omen', desc: 'Luck +25%, digs up Rare+ finds faster.', fx: { luck: 0.25, dig: 40, digTier: 'rare' } },
    ],
  },
  bot: {
    id: 'bot', name: 'Tamagotchi-bot', role: 'support', roleName: 'Support', kind: 'bot', size: 0.7,
    desc: 'A digital pet. Shields you from a hit and recharges your batteries.',
    base: { hp: 40, atk: 2.8, spd: 3.7 }, grow: { hp: 3.6, atk: 0.4 }, atkCd: 1.4, fetch: 0, assist: false, price: null, eggWeight: 3,
    evo: ['Tamagotchi', 'Mecha-gotchi', 'Cloud Companion'],
    pal: ['#9ad0ff', '#f0f8ff', '#ff5a8a'], shiny: ['#ffd23f', '#fff8d0', '#20ffe0'],
    variants: [{ id: 'v1', name: 'Mint', pal: ['#8affc0', '#f0fff8', '#ff5a8a'] }, { id: 'v2', name: 'Grape', pal: ['#b08aff', '#f4eeff', '#ffd23f'] }],
    abilities: [
      { id: 'shield', lv: 1, name: 'Firewall', desc: 'Absorbs up to 16 damage of one hit on you (60 s cooldown).', fx: { shield: 16, shieldCd: 60 } },
      { id: 'recharge', lv: 10, name: 'Recharge', desc: 'Recharges your held batteries a little every 15 s.', fx: { recharge: 0.08, shield: 24 } },
      { id: 'overclock', lv: 20, name: 'Overclock', desc: 'Shield 40 with a 40 s cooldown, and it covers nearby crew too.', fx: { shield: 40, shieldCd: 40, shareShield: true, recharge: 0.12 } },
    ],
  },
};
export const SPECIES_IDS = Object.keys(SPECIES);
export const speciesOf = (id) => SPECIES[id] || null;

// ---------------------------------------------------------------------------------------------------- traits
export const TRAITS = {
  brave: { name: 'Brave', desc: '+10% damage, obeys attack orders.', atk: 1.1, obey: 0.05 },
  lazy: { name: 'Lazy', desc: '-10% speed, +10% HP, slower fetch trips.', spd: 0.9, hp: 1.1, fetchCd: 1.3 },
  greedy: { name: 'Greedy', desc: 'Prefers valuable loot, +10% XP from fetching.', greedy: true, fetchXp: 1.1 },
  loyal: { name: 'Loyal', desc: 'Loyalty grows 50% faster and never drops below 25.', loyaltyGain: 1.5, loyaltyFloor: 25, obey: 0.1 },
  curious: { name: 'Curious', desc: '+10% XP and longer senses.', xp: 1.1, sense: 1.15 },
  timid: { name: 'Timid', desc: '-5% HP, +8% speed, takes less retaliation.', hp: 0.95, spd: 1.08, retal: 0.8 },
  playful: { name: 'Playful', desc: 'Petting gives double loyalty.', petGain: 2 },
  sturdy: { name: 'Sturdy', desc: '+15% HP, -5% speed.', hp: 1.15, spd: 0.95 },
};
export const TRAIT_IDS = Object.keys(TRAITS);
export function rollTrait(rng = Math.random) { return TRAIT_IDS[Math.floor(rng() * TRAIT_IDS.length) % TRAIT_IDS.length]; }

// ---------------------------------------------------------------------------------------------------- xp / levels / evolution
/** XP needed to go from level `lv` to lv+1 (lv 1..29). */
export const xpToNext = (lv) => Math.round(15 + 9 * lv + 0.6 * lv * lv);
/** total XP at the start of level lv */
export function xpAtLevel(lv) { let s = 0; for (let l = 1; l < clamp(lv, 1, MAX_LEVEL); l++) s += xpToNext(l); return s; }
export function levelFromXp(xp) {
  xp = Math.max(0, num(xp));
  let lv = 1;
  while (lv < MAX_LEVEL && xp >= xpAtLevel(lv + 1)) lv++;
  return lv;
}
export const stageForLevel = (lv) => (lv >= EVO_LEVELS[2] ? 3 : lv >= EVO_LEVELS[1] ? 2 : 1);
export const slotsForLevel = (lv) => (lv >= SLOT_LEVELS[2] ? 3 : lv >= SLOT_LEVELS[1] ? 2 : 1);
export const levelOf = (pet) => levelFromXp(pet?.xp);
export const stageOf = (pet) => stageForLevel(levelOf(pet));
export function evolutionName(sp, stage) { return SPECIES[sp]?.evo?.[clamp(stage, 1, 3) - 1] || SPECIES[sp]?.name || '?'; }
export function evolutionTree(sp) { return EVO_LEVELS.map((lv, i) => ({ stage: i + 1, lv, name: SPECIES[sp]?.evo?.[i] || '?' })); }
export const displayName = (pet) => (pet?.nm && String(pet.nm).trim()) || evolutionName(pet?.sp, stageOf(pet));
export function unlockedAbilities(pet) {
  const sp = SPECIES[pet?.sp]; if (!sp) return [];
  const lv = levelOf(pet);
  return sp.abilities.filter((a) => lv >= a.lv);
}
export function xpMultiplier(pet) {
  const tr = TRAITS[pet?.tr] || {};
  return (0.75 + 0.5 * clamp(num(pet?.ly, 50), 0, 100) / 100) * (tr.xp || 1);
}
/** Give XP (already multiplied by the caller when raw). Mutates pet.xp. Returns { gained, from, to, evolved, stage } */
export function awardXp(pet, amount, { raw = true, fetch = false } = {}) {
  if (!pet || !(amount > 0)) return { gained: 0, from: levelOf(pet), to: levelOf(pet), evolved: false, stage: stageOf(pet) };
  const tr = TRAITS[pet.tr] || {};
  let g = raw ? amount * xpMultiplier(pet) : amount;
  if (fetch && tr.fetchXp) g *= tr.fetchXp;
  g = Math.max(1, Math.round(g));
  const from = levelOf(pet), st0 = stageForLevel(from);
  const cap = xpAtLevel(MAX_LEVEL);
  pet.xp = Math.min(cap, Math.round(num(pet.xp) + g));
  const to = levelOf(pet);
  return { gained: g, from, to, evolved: stageForLevel(to) > st0, stage: stageForLevel(to) };
}

// ---------------------------------------------------------------------------------------------------- stats
/** All numeric stats of a pet (used by the host sim, the panel and the tests). */
export function petStats(pet) {
  const sp = SPECIES[pet?.sp];
  if (!sp) return null;
  const lv = levelOf(pet), stage = stageForLevel(lv), tr = TRAITS[pet.tr] || {};
  const fx = {};
  for (const a of unlockedAbilities(pet)) for (const [k, v] of Object.entries(a.fx || {})) {
    if (typeof v === 'number') fx[k] = Math.max(fx[k] ?? -Infinity, v); else if (typeof v === 'boolean') fx[k] = fx[k] || v; else fx[k] = v;
  }
  if (fx.fetchFast === undefined) fx.fetchFast = 1;
  const stageHp = 1 + 0.12 * (stage - 1), stageAtk = 1 + 0.1 * (stage - 1);
  const maxHp = Math.round((sp.base.hp + sp.grow.hp * (lv - 1)) * stageHp * (tr.hp || 1));
  const atk = Math.max(1, (sp.base.atk + sp.grow.atk * (lv - 1)) * stageAtk * (tr.atk || 1) * (fx.atkMul || 1));
  const spd = sp.base.spd * (tr.spd || 1) * (1 + 0.02 * (stage - 1));
  const canFetch = (sp.fetch || 0) > 0 || (fx.fetchRange || 0) > 0;
  return {
    sp: sp.id, lv, stage, maxHp, atk: +atk.toFixed(2), spd: +spd.toFixed(2),
    atkCd: +(sp.atkCd * (fx.atkFast || 1)).toFixed(2),
    canFetch, fetchRange: canFetch ? Math.max(sp.fetch || 0, fx.fetchRange || 0) : 0,
    carry: fx.carry || (canFetch ? 1 : 0), big: !!fx.big,
    fetchCd: +(8 * (tr.fetchCd || 1) * (fx.fetchFast || 1)).toFixed(2),
    sense: (fx.sense || 0) * (tr.sense || 1), senseHazards: !!fx.senseHazards,
    dodge: fx.dodge || 0, revive: !!fx.revive, steal: !!fx.steal, nose: fx.nose || 0, bark: fx.bark || 0,
    tank: fx.tank || 0, stun: fx.stun || 0, dot: !!fx.dot, pollen: fx.pollen || 0, aoe: fx.aoe || 0,
    night: !!fx.night, farsight: fx.farsight || 0, firstStrike: fx.firstStrike || 1,
    decoy: fx.decoy || 0, lure: fx.lure || 0, scare: !!fx.scare,
    luck: fx.luck || 0, dig: fx.dig || 0, digTier: fx.digTier || 'uncommon', pickBest: !!fx.pickBest,
    shield: fx.shield || 0, shieldCd: fx.shieldCd || 60, shareShield: !!fx.shareShield, recharge: fx.recharge || 0,
    assist: !!sp.assist, greedy: !!tr.greedy, retal: tr.retal || 1, fetchDaily: 6 + Math.floor(lv / 3),
  };
}

// ---------------------------------------------------------------------------------------------------- loyalty
export const LOYALTY = { start: { hatch: 60, adopt: 50, capture: 25, gift: 55 }, pet: 3, treat: 12, food: 6, play: 4, decay: 2, floor: 5 };
export function obeyChance(loyalty, trait) {
  const tr = TRAITS[trait] || {};
  const base = 0.4 + 0.6 * clamp(num(loyalty, 50) / 80, 0, 1);
  return clamp(base + (tr.obey || 0), 0.25, 1);
}
/** Does the pet obey this command right now? (rng injected) */
export function obeys(pet, rng = Math.random) { return rng() < obeyChance(pet?.ly, pet?.tr); }
export function addLoyalty(pet, kind) {
  const tr = TRAITS[pet?.tr] || {};
  let d = LOYALTY[kind] || 0;
  if (kind === 'pet' && tr.petGain) d *= tr.petGain;
  if (d > 0 && tr.loyaltyGain) d *= tr.loyaltyGain;
  pet.ly = clamp(Math.round(num(pet.ly, 50) + d), 0, 100);
  return pet.ly;
}
export const moodOf = (pet) => { const l = num(pet?.ly, 50); return l >= 80 ? 'devoted' : l >= 55 ? 'happy' : l >= 30 ? 'neutral' : 'restless'; };

// ---------------------------------------------------------------------------------------------------- capture (Pet Carrier)
export const CAPTURE = {
  scuttler: { sp: 'bot', base: 0.55 }, yoinker: { sp: 'fox', base: 0.45 }, hound: { sp: 'dog', base: 0.4 }, crawler: { sp: 'cat', base: 0.3 },
  ticketswarm: { sp: 'bee', base: 0.5 }, replyguy: { sp: 'parrot', base: 0.5 }, screamer: { sp: 'owl', base: 0.3 }, leech: { sp: 'crow', base: 0.5 },
  clickbait: { sp: 'bear', base: 0.2 }, tamagotchi: { sp: 'bot', base: 0.35 }, mimic: { sp: 'parrot', base: 0.25 }, lurker: { sp: 'owl', base: 0.12 },
};
export const CAPTURE_TIER_MUL = { common: 1, uncommon: 0.8, rare: 0.55, epic: 0.3, legendary: 0.12, mythic: 0.05 };
export const CAPTURE_HP = 0.25;
export function captureChance({ type, hpFrac = 1, tier = 'common', elite = false, level = 1, bonus = 0 } = {}) {
  const c = CAPTURE[type];
  if (!c || !(hpFrac <= CAPTURE_HP)) return 0;
  const hpBonus = 1 - clamp(hpFrac, 0, CAPTURE_HP); // 0.75 at 25% hp .. 1 at 0
  const p = c.base * (CAPTURE_TIER_MUL[tier] ?? 1) * hpBonus * (elite ? 0.4 : 1) / (1 + 0.06 * (Math.max(1, level) - 1)) + bonus;
  return clamp(p, 0.02, 0.85);
}
export const captureSpecies = (type) => CAPTURE[type]?.sp || null;

// ---------------------------------------------------------------------------------------------------- eggs
export const EGG_ITEMS = {
  pet_egg_common: { name: 'Pet Egg (Spotted)', pool: { dog: 3, cat: 3, fox: 2, bee: 2 }, days: 2, shinyMul: 1 },
  pet_egg_wild: { name: 'Pet Egg (Wild)', pool: { bear: 2, owl: 2, parrot: 2, crow: 2, fox: 1 }, days: 3, shinyMul: 1.5 },
  pet_egg_glitch: { name: 'Pet Egg (Glitch)', pool: { bot: 3, crow: 1, owl: 1, parrot: 1 }, days: 3, shinyMul: 2 },
  strange_egg: { name: 'Unknown Egg', pool: { bot: 3, owl: 1, crow: 1, parrot: 1, cat: 1 }, days: 4, shinyMul: 3 },
};
export const isEggItem = (type) => !!EGG_ITEMS[type];
export function rollWeighted(pool, rng = Math.random) {
  const ents = Object.entries(pool || {});
  let tot = 0; for (const [, w] of ents) tot += w;
  let r = rng() * tot;
  for (const [k, w] of ents) { r -= w; if (r < 0) return k; }
  return ents.length ? ents[ents.length - 1][0] : null;
}
export const rollShiny = (rng = Math.random, mul = 1) => rng() < SHINY_CHANCE * mul;
export function rollEggSpecies(itemType, rng = Math.random) { const e = EGG_ITEMS[itemType]; return e ? rollWeighted(e.pool, rng) : null; }
export function hatchDays(itemType) { return EGG_ITEMS[itemType]?.days || 3; }
/** progress 0..1 of an incubating egg */
export function eggProgress(egg, clock) { return clamp((num(clock) - num(egg?.start)) / Math.max(1, num(egg?.need, 3)), 0, 1); }
export const eggReady = (egg, clock) => eggProgress(egg, clock) >= 1;
export function daysLeft(egg, clock) { return Math.max(0, Math.ceil(num(egg?.start) + num(egg?.need, 3) - num(clock))); }

// ---------------------------------------------------------------------------------------------------- state / stable
export const DEFAULT_NAMES = {
  cat: ['Miso', 'Pixel', 'Nyan', 'Byte', 'Luna'], dog: ['Rex', 'Biscuit', 'Cookie', 'Patch', 'Bolt'], fox: ['Ember', 'Vixen', 'Ninja', 'Rusty', 'Kit'],
  bear: ['Bruno', 'Teddy', 'Grizz', 'Waffles', 'Boss'], bee: ['Buzz', 'Honey', 'Zed', 'Waggle', 'Nectar'], owl: ['Hoot', 'Sage', 'Ollie', 'Archie', 'Lens'],
  parrot: ['Polly', 'Echo', 'Kiwi', 'Mango', 'Tweet'], crow: ['Raven', 'Onyx', 'Poe', 'Shiny', 'Jet'], bot: ['Beep', 'Gotchi', 'Bit', 'Pip', 'Nano'],
};
export function defaultName(sp, rng = Math.random) { const l = DEFAULT_NAMES[sp] || ['Pet']; return l[Math.floor(rng() * l.length) % l.length]; }
export function cleanName(s) { return String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX); }
export function newId(rng = Math.random) { return 'p' + Math.floor(rng() * 36 ** 6).toString(36).padStart(6, '0') + Math.floor((rng() * 36 ** 3)).toString(36); }
export const DEFAULT_SKIN = { c: 'none', h: 'none', v: 'base', s: 'none' };

export function newPetsState() {
  return { v: 1, stable: [], active: null, incubator: [], clock: 0, skins: { c: ['none', 'red'], h: ['none'], v: ['base'], s: ['none'] }, dex: {}, stats: { hatched: 0, adopted: 0, captured: 0, evolved: 0, fetched: 0, kills: 0 }, dest: 'me' };
}
export function makePet({ sp, source = 'adopt', rng = Math.random, name = null, shiny = null, trait = null, mul = 1 } = {}) {
  if (!SPECIES[sp]) return null;
  return {
    id: newId(rng), sp, nm: cleanName(name) || defaultName(sp, rng), xp: 0, sh: (shiny === null ? rollShiny(rng, mul) : !!shiny) ? 1 : 0,
    tr: TRAITS[trait] ? trait : rollTrait(rng), ly: LOYALTY.start[source] ?? 50, sk: { ...DEFAULT_SKIN }, hf: 1, ko: 0, rest: 0, kills: 0, born: 0, src: source,
  };
}
export function sanitizePet(raw) {
  if (!raw || typeof raw !== 'object' || !SPECIES[raw.sp]) return null;
  const sk = raw.sk && typeof raw.sk === 'object' ? raw.sk : {};
  const sid = (cat, v, d) => (skinDef(cat, String(v ?? '')) ? String(v) : d);
  return {
    id: String(raw.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 14) || newId(),
    sp: raw.sp, nm: cleanName(raw.nm) || SPECIES[raw.sp].name, xp: clamp(Math.round(num(raw.xp)), 0, xpAtLevel(MAX_LEVEL)),
    sh: raw.sh ? 1 : 0, tr: TRAITS[raw.tr] ? raw.tr : 'brave', ly: clamp(Math.round(num(raw.ly, 50)), 0, 100),
    sk: { c: sid('c', sk.c, 'none'), h: sid('h', sk.h, 'none'), v: sid('v', sk.v, 'base'), s: sid('s', sk.s, 'none') },
    hf: clamp(num(raw.hf, 1), 0, 1), ko: raw.ko ? 1 : 0, rest: Math.max(0, Math.round(num(raw.rest))), kills: Math.max(0, Math.round(num(raw.kills))), born: Math.max(0, Math.round(num(raw.born))),
    src: typeof raw.src === 'string' ? raw.src.slice(0, 10) : 'adopt',
  };
}
/** Normalise profile.pets in place (idempotent, never saves). */
export function ensurePets(profile) {
  if (!profile || typeof profile !== 'object') return newPetsState();
  let s = profile.pets;
  if (!s || typeof s !== 'object' || Array.isArray(s)) s = profile.pets = newPetsState();
  const d = newPetsState();
  s.v = 1;
  s.stable = (Array.isArray(s.stable) ? s.stable : []).map(sanitizePet).filter(Boolean).slice(0, MAX_STABLE);
  s.incubator = (Array.isArray(s.incubator) ? s.incubator : []).filter((e) => e && typeof e === 'object' && typeof e.item === 'string').slice(0, INCUBATOR_SLOTS)
    .map((e) => ({ id: String(e.id || newId()).slice(0, 14), item: e.item, start: Math.max(0, num(e.start)), need: clamp(Math.round(num(e.need, 3)), 1, 9) }));
  s.clock = Math.max(0, Math.round(num(s.clock)));
  s.skins = s.skins && typeof s.skins === 'object' ? s.skins : {};
  for (const c of SKIN_CATS) { const a = Array.isArray(s.skins[c]) ? s.skins[c].filter((x) => typeof x === 'string' && skinDef(c, x)) : []; s.skins[c] = [...new Set([...d.skins[c], ...a])]; }
  s.dex = s.dex && typeof s.dex === 'object' ? s.dex : {};
  s.stats = { ...d.stats, ...(s.stats && typeof s.stats === 'object' ? s.stats : {}) };
  s.dest = s.dest === 'ship' ? 'ship' : 'me';
  if (s.active && !s.stable.some((p) => p.id === s.active)) s.active = null;
  if (!s.active && s.stable.length) s.active = s.stable[0].id;
  return s;
}
/** [perf5] ensurePets re-sanitises every stable pet + the skin sets on EVERY call and the pets modules called it several times per frame:
 *  this returns a getter that re-normalises at most every `ttl` seconds of game time (same object, same in-place semantics in between). */
export function petStateMemo(getProfile, getNow, ttl = 0.25) {
  let at = -1e9, val = null;
  return () => {
    const p = getProfile(), n = getNow();
    if (val && p && p.pets === val && Number.isFinite(n) && n >= at && n - at < ttl) return val;
    val = ensurePets(p); at = Number.isFinite(n) ? n : -1e9; return val;
  };
}
export const findPet = (state, id) => state.stable.find((p) => p.id === id) || null;
export const activePet = (state) => (state.active ? findPet(state, state.active) : null);
export function adoptPet(state, pet) {
  if (!pet) return { ok: false, err: 'Invalid pet.' };
  if (state.stable.length >= MAX_STABLE) return { ok: false, err: 'The stable is full.' };
  pet.born = state.clock;
  state.stable.push(pet);
  state.dex[pet.sp] = 1;
  if (pet.sh) state.dex[pet.sp + ':shiny'] = 1;
  if (!state.active) state.active = pet.id;
  return { ok: true };
}
export function releasePet(state, id) {
  const i = state.stable.findIndex((p) => p.id === id);
  if (i < 0) return false;
  state.stable.splice(i, 1);
  if (state.active === id) state.active = state.stable[0]?.id || null;
  return true;
}
export function renamePet(state, id, name) {
  const p = findPet(state, id), n = cleanName(name);
  if (!p || !n) return false;
  p.nm = n;
  return true;
}
export function setActive(state, id) {
  const p = findPet(state, id);
  if (!p) return { ok: false, err: 'No such pet.' };
  if (p.ko && state.clock < p.rest) return { ok: false, err: 'It is resting.' };
  state.active = id;
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------- incubator
export function incubate(state, itemType) {
  if (!EGG_ITEMS[itemType]) return { ok: false, err: 'That is not an egg.' };
  if (state.incubator.length >= INCUBATOR_SLOTS) return { ok: false, err: 'The incubator is full.' };
  const egg = { id: newId(), item: itemType, start: state.clock, need: hatchDays(itemType) };
  state.incubator.push(egg);
  return { ok: true, egg };
}
/** Hatch every ready egg that fits in the stable. Returns [{ egg, pet }] (eggs that do not fit stay in the incubator). */
export function hatchReady(state, rng = Math.random) {
  const out = [];
  for (const egg of [...state.incubator]) {
    if (!eggReady(egg, state.clock)) continue;
    if (state.stable.length >= MAX_STABLE) break;
    const sp = rollEggSpecies(egg.item, rng);
    const pet = makePet({ sp, source: 'hatch', rng, mul: EGG_ITEMS[egg.item]?.shinyMul || 1 });
    if (!pet) continue;
    state.incubator.splice(state.incubator.indexOf(egg), 1);
    adoptPet(state, pet);
    state.stats.hatched++;
    out.push({ egg, pet });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- days / KO / rest
/** A game day passed: eggs age, loyalty drifts, knocked-out pets recover. */
export function advanceDays(state, n = 1) {
  const rested = [];
  for (let i = 0; i < Math.max(0, n | 0); i++) {
    state.clock++;
    for (const p of state.stable) {
      const tr = TRAITS[p.tr] || {};
      const floor = Math.max(LOYALTY.floor, tr.loyaltyFloor || 0);
      if (p.ly > floor) p.ly = Math.max(floor, p.ly - LOYALTY.decay);
      if (p.ko && state.clock >= p.rest) { p.ko = 0; p.hf = 1; rested.push(p.id); }
      else if (!p.ko && p.hf < 1) p.hf = 1;
    }
  }
  return { rested };
}
export function knockOut(state, pet) { pet.ko = 1; pet.rest = state.clock + 1; pet.hf = 0; pet.ly = clamp(pet.ly - 1, 0, 100); return pet; }
export const isResting = (state, pet) => !!pet?.ko && state.clock < pet.rest;

// ---------------------------------------------------------------------------------------------------- skins
export const SKIN_CATS = ['c', 'h', 'v', 's'];
export const SKIN_CAT_NAMES = { c: 'Collars', h: 'Hats', v: 'Colours', s: 'Seasonal' };
export const SKINS = {
  c: [
    { id: 'none', name: 'No collar' }, { id: 'red', name: 'Red collar', color: '#d33' }, { id: 'blue', name: 'Blue collar', color: '#38f', cost: 60 },
    { id: 'bell', name: 'Bell collar', color: '#e8c030', cost: 120 }, { id: 'spike', name: 'Spiked collar', color: '#555', cost: 250 },
    { id: 'neon', name: 'Neon collar', color: '#20ffe0', cost: 400 }, { id: 'gold', name: 'Golden collar', color: '#ffd23f', ach: 'packrat' },
    { id: 'bandana', name: 'Bandana', color: '#e0402a', ach: 'first_blood' },
  ],
  h: [
    { id: 'none', name: 'No hat' }, { id: 'party', name: 'Party hat', cost: 100 }, { id: 'bow', name: 'Bow', cost: 120 }, { id: 'cap', name: 'Cap', cost: 150 },
    { id: 'headphones', name: 'Headphones', cost: 300 }, { id: 'helmet', name: 'Hard hat', ach: 'first_scrap' }, { id: 'tophat', name: 'Top hat', ach: 'quota_5' },
    { id: 'halo', name: 'Halo', ach: 'veteran' }, { id: 'crown', name: 'Crown', ach: 'monster_hunter' },
  ],
  v: [{ id: 'base', name: 'Natural' }, { id: 'v1', name: 'Variant 1', cost: 200 }, { id: 'v2', name: 'Variant 2', cost: 350 }],
  s: [
    { id: 'none', name: 'None' }, { id: 'halloween', name: 'Halloween', cost: 200, months: [10] }, { id: 'winter', name: 'Winter', cost: 200, months: [12, 1] },
    { id: 'spring', name: 'Spring', cost: 200, months: [3, 4, 5] }, { id: 'summer', name: 'Summer', cost: 200, months: [6, 7, 8] },
  ],
};
export function skinDef(cat, id) { return (SKINS[cat] || []).find((s) => s.id === id) || null; }
/** name of a colour variant for a species (colour skins depend on the species) */
export function colourName(sp, id) { return id === 'base' ? 'Natural' : SPECIES[sp]?.variants.find((v) => v.id === id)?.name || id; }
/** Palette of a pet: shiny wins, then the colour skin, then the base. */
export function palOf(pet) {
  const sp = SPECIES[pet?.sp]; if (!sp) return ['#888', '#ccc', '#222'];
  if (pet.sh) return sp.shiny;
  const v = pet.sk?.v && pet.sk.v !== 'base' ? sp.variants.find((x) => x.id === pet.sk.v) : null;
  return v ? v.pal : sp.pal;
}
/** { ok, why: 'owned'|'buy'|'ach'|'season'|'locked', cost } for a skin. ctx = { state, profile, now: Date } */
export function skinAccess({ state, profile, now = new Date() }, cat, id) {
  const d = skinDef(cat, id);
  if (!d) return { ok: false, why: 'locked' };
  if (!d.cost && !d.ach && !d.months) return { ok: true, why: 'owned', cost: 0 };
  if ((state.skins[cat] || []).includes(id)) return { ok: true, why: 'owned', cost: 0 };
  if (d.ach) return profile?.achievements?.[d.ach] ? { ok: true, why: 'owned', cost: 0 } : { ok: false, why: 'ach', ach: d.ach };
  if (d.months && !d.months.includes(now.getMonth() + 1)) return { ok: false, why: 'season', cost: d.cost };
  return { ok: false, why: 'buy', cost: d.cost || 0 };
}
export function buySkin(ctx, cat, id) {
  const a = skinAccess(ctx, cat, id);
  if (a.ok) return { ok: true, cost: 0 };
  if (a.why !== 'buy') return { ok: false, err: a.why === 'season' ? 'Out of season.' : 'Locked.' };
  const coins = num(ctx.profile?.coins);
  if (coins < a.cost) return { ok: false, err: 'Not enough Clout.' };
  ctx.profile.coins = coins - a.cost;
  ctx.state.skins[cat].push(id);
  return { ok: true, cost: a.cost };
}
export function equipSkin(ctx, petId, cat, id) {
  const pet = findPet(ctx.state, petId);
  if (!pet || !skinDef(cat, id)) return { ok: false, err: 'Invalid.' };
  if (!skinAccess(ctx, cat, id).ok) return { ok: false, err: 'Not unlocked.' };
  pet.sk[cat] = id;
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------- shop
/** Species sold at the HQ Pet Shop for Clout. */
export const SHOP_SPECIES = SPECIES_IDS.filter((id) => SPECIES[id].price);
export function buyPet(ctx, sp, rng = Math.random) {
  const d = SPECIES[sp];
  if (!d?.price) return { ok: false, err: 'Not sold here.' };
  if (ctx.state.stable.length >= MAX_STABLE) return { ok: false, err: 'The stable is full.' };
  if (num(ctx.profile?.coins) < d.price) return { ok: false, err: 'Not enough Clout.' };
  const pet = makePet({ sp, source: 'adopt', rng });
  ctx.profile.coins -= d.price;
  adoptPet(ctx.state, pet);
  ctx.state.stats.adopted++;
  return { ok: true, pet, cost: d.price };
}

/** Compact network form of the active pet (owner -> host sync). Sanitised again by the host. */
export function netPet(pet) { return pet ? { ...pet, sk: { ...pet.sk } } : null; }
