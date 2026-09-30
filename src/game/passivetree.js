// PASSIVE TREE: roles + the Path-of-Exile-style constellation (pure data + pure logic, no DOM / three / game imports).
//
// Consumers: progression.js (derivedStats folds treeBonus() into the shared stat block), profile.js (state migration),
// rpgctl.js (allocate / refund / role operations), rpg.js (runtime: game.rpg, net sync, dynamic keystones),
// ui/panels/passivetree.js + roles.js (rendering) and tools/harness/wave1_tree.mjs (validation).
//
// Save format (profile.rpg):  { v: 1, role: 'scout'|null, nodes: ['scout_s1', ...], kit: {pid->day}, migrated: {...} }
//   - `nodes` never contains the start node of the CHOSEN role (it is implicit and free); the start nodes of the other
//     five roles are ordinary 1-point connector nodes.
//   - every allocated node must be connected to the role start through allocated nodes (validated on load).
//
// Bonus units (the values `game.rpg.bonus(key)` returns, sum of role + allocated nodes + dynamic keystones):
//   'pct'  keys are FRACTIONS (0.03 = +3 %), 'flat' keys are absolute numbers (maxMana +5, stamina +5, carry +8 lb ...).
//   noise: negative = quieter.  cooldown: positive = shorter cooldowns (0.12 = -12 %).

import { getLang } from '../core/i18n.js';   // [i18n8] only for the Turkish percent order (%3)
export const TREE_VERSION = 1;

// ---------------------------------------------------------------- bonus keys
export const KEYS = {
  maxHp:         { unit: 'flat', label: 'Max Health' },
  maxHpPct:      { unit: 'pct',  label: 'Max Health' },
  stamina:       { unit: 'flat', label: 'Max Stamina' },
  staminaRegen:  { unit: 'pct',  label: 'Stamina Regeneration' },
  carry:         { unit: 'flat', label: 'Carry Capacity', suffix: ' lb' },
  moveSpeed:     { unit: 'pct',  label: 'Movement Speed' },
  jump:          { unit: 'pct',  label: 'Jump Height' },
  meleeDmg:      { unit: 'pct',  label: 'Melee Damage' },
  rangedDmg:     { unit: 'pct',  label: 'Ranged Damage' },
  crit:          { unit: 'pct',  label: 'Critical Chance' },
  armor:         { unit: 'pct',  label: 'Damage Reduction' },
  scrapValue:    { unit: 'pct',  label: 'Scrap Value' },
  lootLuck:      { unit: 'pct',  label: 'Loot Luck' },
  craftLuck:     { unit: 'pct',  label: 'Crafting Luck' },
  scanRange:     { unit: 'flat', label: 'Scan Range', suffix: ' m' },
  interactSpeed: { unit: 'pct',  label: 'Interaction Speed' },
  reviveSpeed:   { unit: 'pct',  label: 'Revive Speed' },
  minigameEase:  { unit: 'pct',  label: 'Minigame Ease' },
  batteryLife:   { unit: 'pct',  label: 'Battery Life' },
  noise:         { unit: 'pct',  label: 'Noise', lowerBetter: true },
  maxMana:       { unit: 'flat', label: 'Max Mana' },
  manaRegen:     { unit: 'pct',  label: 'Mana Regeneration' },
  spellPower:    { unit: 'pct',  label: 'Spell Power' },
  cooldown:      { unit: 'pct',  label: 'Cooldown Reduction' },
  bagSlots:      { unit: 'flat', label: 'Bag Column', one: 'Bag Column', many: 'Bag Columns' },
  xpGain:        { unit: 'pct',  label: 'XP Gain' },
  cloutGain:     { unit: 'pct',  label: 'Clout Gain' },
};
export const KEY_IDS = Object.keys(KEYS);

const trim = (n) => String(Math.round(n * 10) / 10);
/** One stat line, e.g. formatBonus('moveSpeed', 0.03) -> { text: '+3% Movement Speed', good: true }. */
export function formatBonus(key, v) {
  const k = KEYS[key];
  if (!k || !v) return null;
  const good = k.lowerBetter ? v < 0 : v > 0;
  const sign = v > 0 ? '+' : '-';
  const a = Math.abs(v);
  let text;
  if (k.unit === 'pct') text = getLang() === 'tr' ? `${sign}%${trim(a * 100)} ${k.label}` : `${sign}${trim(a * 100)}% ${k.label}`;
  else if (k.many) text = `${sign}${trim(a)} ${a === 1 ? k.one : k.many}`;
  else text = `${sign}${trim(a)}${k.suffix || ''} ${k.label}`;
  return { key, text, good };
}
/** All stat lines of a bonus map (stable order = KEYS order). */
export function bonusLines(b) {
  const out = [];
  for (const key of KEY_IDS) { const l = b && b[key] ? formatBonus(key, b[key]) : null; if (l) out.push(l); }
  return out;
}

// ---------------------------------------------------------------- roles
export const ROLE_ORDER = ['scout', 'enforcer', 'occultist', 'medic', 'technician', 'hauler'];
export const ROLES = {
  scout: {
    name: 'Scout', color: '#4fd8ff', icon: 'eye', kit: 'walkie', tag: 'Fast. Far-sighted. Travels light.',
    desc: 'Reads the map before it reads you. A quicker stride and a longer scan, but a small pack.',
    bonus: { moveSpeed: 0.06, scanRange: 4, carry: -6 },
    post: { moveSpeed: 0.02 },
  },
  enforcer: {
    name: 'Enforcer', color: '#ff4d3d', icon: 'blades', kit: 'stungrenade', tag: 'Hits first. Hits harder.',
    desc: 'Front-line muscle: melee and ranged damage and a fatter health bar.',
    bonus: { meleeDmg: 0.10, rangedDmg: 0.06, maxHp: 15 },
    post: { meleeDmg: 0.03 },
  },
  occultist: {
    name: 'Occultist', color: '#b06bff', icon: 'moon', kit: 'glowstick', tag: 'Talks to the machine.',
    desc: 'A deeper mana well, stronger spells and faster recovery. Frail if anything gets close.',
    bonus: { maxMana: 25, manaRegen: 0.15, spellPower: 0.10, maxHp: -10 },
    post: { maxMana: 4 },
  },
  medic: {
    name: 'Field Medic', color: '#55f08a', icon: 'cross', kit: 'medkit', tag: 'Nobody gets deplatformed on shift.',
    desc: 'Revives crewmates fast and shrugs off a little more punishment.',
    bonus: { reviveSpeed: 0.30, maxHp: 10, staminaRegen: 0.05 },
    post: { maxHp: 5 },
  },
  technician: {
    name: 'Technician', color: '#5b8cff', icon: 'gear', kit: 'lockpick', tag: 'Has root access to everything.',
    desc: 'Faster interaction with facility systems, easier hacking minigames, better scanning.',
    bonus: { interactSpeed: 0.15, minigameEase: 0.06, scanRange: 2 },
    post: { interactSpeed: 0.04 },
  },
  hauler: {
    name: 'Hauler', color: '#ff6bb0', icon: 'crate', kit: 'beltbag', tag: 'If it is heavy, it is mine.',
    desc: 'Carries more, runs a little longer and squeezes extra value out of every piece of scrap.',
    bonus: { carry: 14, stamina: 8, scrapValue: 0.03 },
    post: { carry: 6 },
  },
};
export const roleDef = (id) => ROLES[id] || null;

// ---------------------------------------------------------------- keystones
export const KEYSTONES = {
  bloodmagic: {
    name: 'Blood Magic', icon: 'drop', b: { spellPower: 0.25 },
    text: ['Spells cost Health instead of Mana.', 'Your Mana bar is disabled.'],
    tip: 'The machine wants a sacrifice. You have plenty of blood.',
  },
  packmule: {
    name: 'Pack Mule', icon: 'mule', b: {},
    text: ['Carried weight never slows you down.', 'You can no longer sprint.'],
    tip: 'Slow and steady wins the quota.',
  },
  glasscannon: {
    name: 'Glass Cannon', icon: 'shard', b: { meleeDmg: 0.4, rangedDmg: 0.4, spellPower: 0.4, maxHpPct: -0.3 },
    tip: 'One good hit ends the argument. Either direction.',
  },
  ghoststep: {
    name: 'Ghost Step', icon: 'ghost', b: { stamina: -20, noise: -0.25 },
    text: ['Sprinting makes no noise.'],
    tip: 'Nothing on the feed. Nothing on the radar.',
  },
  scavengersluck: {
    name: "Scavenger's Luck", icon: 'coin', b: { lootLuck: 0.25, scrapValue: -0.10 },
    tip: 'Better drops. Worse haggling.',
  },
  ironlungs: {
    name: 'Iron Lungs', icon: 'lungs', b: { stamina: 40, staminaRegen: 0.5, maxHpPct: -0.12 },
    tip: 'Breathe like a server rack. Bleed like a soft drink.',
  },
  adrenalinejunkie: {
    name: 'Adrenaline Junkie', icon: 'bolt', b: { maxHpPct: -0.15 },
    text: ['Below 40% Health: +30% Movement Speed, +25% Melee Damage, +25% Stamina Regeneration.'],
    tip: 'Pain is just content.',
  },
  lonewolf: {
    name: 'Lone Wolf', icon: 'wolf', b: {},
    text: ['No crewmate within 30 m: +20% Damage, +8% Movement Speed.', 'A crewmate within 10 m: -15% Damage.'],
    tip: 'Comms are for people who need backup.',
  },
};

// ---------------------------------------------------------------- the constellation
// Six sector templates (one per role) around a centre, bridged at the sector borders. Polar layout: `a` = degrees from
// the sector centre line, `r` = radius. Small nodes are one stat, hybrids at the borders carry two.
// Slot order for the 12 small nodes: s1 s2 s3 s4 (spine) l1 l2 l3 l4 (left arm) r1 r2 r3 r4 (right arm).
const SMALL_NAMES = {
  maxHp: 'Thick Skin', stamina: 'Deep Breath', staminaRegen: 'Second Wind', carry: 'Strong Back', moveSpeed: 'Quick Feet',
  jump: 'Spring Step', meleeDmg: 'Heavy Hands', rangedDmg: 'Steady Aim', crit: 'Keen Edge', armor: 'Padding', scrapValue: 'Haggler',
  lootLuck: 'Lucky Find', craftLuck: 'Tinkerer', scanRange: 'Long Sight', interactSpeed: 'Nimble Fingers', reviveSpeed: 'Bedside Manner',
  minigameEase: 'Steady Nerves', batteryLife: 'Power Saver', noise: 'Soft Steps', maxMana: 'Mana Well', manaRegen: 'Deep Focus',
  spellPower: 'Resonance', cooldown: 'Quick Recall', bagSlots: 'Extra Pockets', xpGain: 'Grinder', cloutGain: 'Side Hustle',
};

const SECTORS = {
  scout: {
    smalls: [{ moveSpeed: 0.03 }, { stamina: 5 }, { scanRange: 2 }, { moveSpeed: 0.03 },
      { stamina: 5 }, { noise: -0.05 }, { scanRange: 2 }, { jump: 0.04 },
      { moveSpeed: 0.03 }, { staminaRegen: 0.06 }, { lootLuck: 0.03 }, { noise: -0.05 }],
    notables: [
      { name: 'Trailblazer', b: { moveSpeed: 0.06, stamina: 10 }, tip: 'First on the moon, first back on the ship.' },
      { name: 'Eagle Eye', b: { scanRange: 6, lootLuck: 0.05 }, tip: 'Sees the shiny thing before the shiny thing sees you.' },
      { name: 'Featherfoot', b: { noise: -0.15, jump: 0.08, moveSpeed: 0.03 }, tip: 'The floor forgets you were there.' },
    ],
    keystone: 'ghoststep',
  },
  enforcer: {
    smalls: [{ meleeDmg: 0.04 }, { maxHp: 5 }, { meleeDmg: 0.04 }, { crit: 0.01 },
      { maxHp: 5 }, { meleeDmg: 0.04 }, { armor: 0.01 }, { maxHp: 5 },
      { rangedDmg: 0.04 }, { meleeDmg: 0.04 }, { rangedDmg: 0.04 }, { crit: 0.01 }],
    notables: [
      { name: 'Brawler', b: { meleeDmg: 0.12, maxHp: 10 }, tip: 'Diplomacy has a reach of about two metres.' },
      { name: 'Bulwark', b: { maxHp: 25, armor: 0.04 }, tip: 'Take the hit. Keep the scrap.' },
      { name: 'Marksman', b: { rangedDmg: 0.12, crit: 0.03 }, tip: 'Range is just a polite way to say no.' },
    ],
    keystone: 'glasscannon',
  },
  occultist: {
    smalls: [{ maxMana: 5 }, { manaRegen: 0.05 }, { spellPower: 0.04 }, { cooldown: 0.03 },
      { maxMana: 5 }, { spellPower: 0.04 }, { manaRegen: 0.05 }, { maxMana: 5 },
      { spellPower: 0.04 }, { cooldown: 0.03 }, { maxMana: 5 }, { manaRegen: 0.05 }],
    notables: [
      { name: 'Deep Well', b: { maxMana: 25, manaRegen: 0.10 }, tip: 'There is always more where that came from.' },
      { name: 'Arcane Lattice', b: { spellPower: 0.15, cooldown: 0.05 }, tip: 'Every word lands a little harder.' },
      { name: 'Quickened Sigils', b: { cooldown: 0.12, moveSpeed: 0.02 }, tip: 'Speak fast. Speak first.' },
    ],
    keystone: 'bloodmagic',
  },
  medic: {
    smalls: [{ maxHp: 5 }, { reviveSpeed: 0.08 }, { maxHp: 5 }, { reviveSpeed: 0.08 },
      { staminaRegen: 0.06 }, { maxHp: 5 }, { reviveSpeed: 0.08 }, { bagSlots: 1, rare: 'Medical Bag' },
      { armor: 0.01 }, { maxHp: 5 }, { craftLuck: 0.04 }, { reviveSpeed: 0.08 }],
    notables: [
      { name: 'Steady Hands', b: { reviveSpeed: 0.35 }, tip: 'Breathe in. Compress. Breathe out.' },
      { name: 'Triage', b: { maxHp: 20, reviveSpeed: 0.10 }, tip: 'You first. Then me. Then the scrap.' },
      { name: 'Field Pharmacist', b: { craftLuck: 0.08, maxHp: 10, staminaRegen: 0.10 }, tip: 'A little of this, a little of that.' },
    ],
    keystone: 'ironlungs',
  },
  technician: {
    smalls: [{ interactSpeed: 0.06 }, { minigameEase: 0.04 }, { interactSpeed: 0.06 }, { batteryLife: 0.06 },
      { stamina: 5 }, { scanRange: 2 }, { interactSpeed: 0.06 }, { bagSlots: 1, rare: 'Toolbelt' },
      { minigameEase: 0.04 }, { batteryLife: 0.06 }, { craftLuck: 0.04 }, { interactSpeed: 0.06 }],
    notables: [
      { name: 'Overclock', b: { interactSpeed: 0.20, batteryLife: 0.10 }, tip: 'Warranty void. Doors open faster.' },
      { name: 'Root Access', b: { minigameEase: 0.12, scanRange: 3 }, tip: 'sudo open door.' },
      { name: 'Scrap Recycler', b: { craftLuck: 0.10, scrapValue: 0.05 }, tip: 'Nothing is trash if you squint.' },
    ],
    keystone: 'scavengersluck',
  },
  hauler: {
    smalls: [{ carry: 8 }, { scrapValue: 0.05 }, { carry: 8 }, { maxHp: 5 },
      { stamina: 5 }, { carry: 8 }, { scrapValue: 0.05 }, { bagSlots: 1, rare: 'Extra Pocket' },
      { carry: 8 }, { maxHp: 5 }, { scrapValue: 0.05 }, { stamina: 5 }],
    notables: [
      { name: 'Iron Back', b: { carry: 20, maxHp: 10 }, tip: 'Lift with your legs. Or your feelings.' },
      { name: 'Bulk Buyer', b: { scrapValue: 0.10, lootLuck: 0.05 }, tip: 'The Company loves volume.' },
      { name: 'Long Haul', b: { stamina: 15, staminaRegen: 0.10, carry: 8 }, tip: 'Just one more trip.' },
    ],
    keystone: 'packmule',
  },
};

// Inner ring: one small per role at the sector centre line + a hybrid at every border.
const RING_ROLE = { scout: { moveSpeed: 0.02 }, enforcer: { meleeDmg: 0.03 }, occultist: { maxMana: 4 }, medic: { maxHp: 4 }, technician: { interactSpeed: 0.04 }, hauler: { carry: 5 } };
const RING_BORDER = [
  { name: 'Vanguard Link', b: { moveSpeed: 0.02, meleeDmg: 0.02 } },
  { name: 'Ritual Muscle', b: { spellPower: 0.03, maxHp: 3, xpGain: 0.02 } },
  { name: 'Healing Circle', b: { maxMana: 3, maxHp: 3 } },
  { name: 'Ward Rounds', b: { reviveSpeed: 0.05, interactSpeed: 0.03, xpGain: 0.02 } },
  { name: 'Cargo Systems', b: { interactSpeed: 0.03, carry: 4 } },
  { name: 'Route Planning', b: { carry: 4, moveSpeed: 0.02, xpGain: 0.02 } },
];
const BRIDGE = [
  { name: 'Skirmisher', b: { moveSpeed: 0.02, rangedDmg: 0.02 } },
  { name: 'Battle Trance', b: { maxHp: 5, spellPower: 0.03 } },
  { name: 'Mending Chant', b: { manaRegen: 0.05, maxHp: 5 } },
  { name: 'Lab Assistant', b: { reviveSpeed: 0.06, craftLuck: 0.03 } },
  { name: 'Forklift Cert', b: { scrapValue: 0.03, interactSpeed: 0.04 } },
  { name: 'Pathfinder', b: { lootLuck: 0.03, carry: 5 } },
];
const BRIDGE_OUTER = [
  { name: 'Flanker', b: { moveSpeed: 0.03, meleeDmg: 0.03 } },
  { name: 'Blood Rite', b: { spellPower: 0.04, maxHp: 6, cloutGain: 0.03 } },
  { name: 'Grim Apothecary', b: { maxMana: 6, reviveSpeed: 0.05 } },
  { name: 'Jury Rig', b: { interactSpeed: 0.05, batteryLife: 0.06, xpGain: 0.02 } },
  { name: 'Scrapyard Deal', b: { scrapValue: 0.04, carry: 6 } },
  { name: 'Wayfarer', b: { stamina: 8, scanRange: 2 } },
];
// keystones that sit on a border (between border k and k+1): [border index] -> keystone id
const BORDER_KEYSTONE = { 0: 'adrenalinejunkie', 5: 'lonewolf' };

const NODE_COST = { small: 1, notable: 1, keystone: 2, start: 1 };
const REFUND_COST = { small: 10, notable: 25, keystone: 60, start: 10 };
export const nodeCost = (n) => NODE_COST[n.type] || 1;
/** Clout price of refunding one node (free for nodes allocated this session, see rpgctl). */
export const refundCost = (n) => REFUND_COST[n.type] || 10;

export const NODES = [];
export const NODE = {};
export const EDGES = [];
export const ADJ = {};

const rad = (d) => (d * Math.PI) / 180;
function addNode(id, type, ang, r, name, b, extra = {}) {
  if (NODE[id]) throw new Error('duplicate node ' + id);
  const n = { id, type, x: Math.round(Math.cos(rad(ang)) * r * 10) / 10, y: Math.round(Math.sin(rad(ang)) * r * 10) / 10, ang, r, name, b: b || {}, flags: [], text: [], tip: '', role: null, cost: 0, ...extra };
  n.cost = NODE_COST[type] || 1;
  NODES.push(n); NODE[id] = n; ADJ[id] = [];
  return n;
}
function link(a, b) {
  if (!NODE[a] || !NODE[b]) throw new Error(`bad edge ${a} - ${b}`);
  if (a === b || ADJ[a].includes(b)) return;
  ADJ[a].push(b); ADJ[b].push(a); EDGES.push([a, b]);
}
const primaryKey = (b) => Object.keys(b)[0];

(function build() {
  ROLE_ORDER.forEach((role, k) => {
    const cA = -90 + 60 * k;                                    // sector centre angle
    const S = SECTORS[role];
    const P = (a, r) => [cA + a, r];
    // start + inner ring node
    addNode(`start_${role}`, 'start', ...P(0, 165), `${ROLES[role].name} Post`, ROLES[role].post, { role, sector: role });
    addNode(`c_${role}`, 'small', ...P(0, 112), SMALL_NAMES[primaryKey(RING_ROLE[role])], RING_ROLE[role], { role, sector: role, ring: true });
    // spine, left arm, right arm
    const spine = [[0, 215], [0, 265], null, [0, 378], [0, 434]];
    const left = [[-14, 207], [-19, 252], null, [-19, 360], [-11, 412]];
    const right = [[14, 207], [19, 252], null, [19, 360], [11, 412]];
    const slots = [['s', spine], ['l', left], ['r', right]];
    let si = 0;
    for (const [pre, pts] of slots) {
      let idx = 1;
      for (const pt of pts) {
        if (!pt) continue;                                        // the notable slot
        const b = { ...S.smalls[si] }; const rare = b.rare; delete b.rare;
        addNode(`${role}_${pre}${idx}`, 'small', ...P(...pt), rare || SMALL_NAMES[primaryKey(b)], b, { role, sector: role, rare: !!rare });
        idx++; si++;
      }
    }
    // notables
    const nSpine = S.notables[0], nL = S.notables[1], nR = S.notables[2];
    addNode(`${role}_n1`, 'notable', ...P(0, 322), nSpine.name, nSpine.b, { role, sector: role, tip: nSpine.tip });
    addNode(`${role}_nl`, 'notable', ...P(-21, 305), nL.name, nL.b, { role, sector: role, tip: nL.tip });
    addNode(`${role}_nr`, 'notable', ...P(21, 305), nR.name, nR.b, { role, sector: role, tip: nR.tip });
    // sector keystone
    const kd = KEYSTONES[S.keystone];
    addNode(S.keystone, 'keystone', ...P(0, 505), kd.name, kd.b, { role, sector: role, flags: [S.keystone], text: kd.text || [], tip: kd.tip, icon: kd.icon });
  });
  // border nodes (between sector k and k+1)
  ROLE_ORDER.forEach((role, k) => {
    const bA = -90 + 60 * k + 30;
    const rb = RING_BORDER[k], br = BRIDGE[k], ob = BRIDGE_OUTER[k];
    addNode(`ib_${k}`, 'small', bA, 112, rb.name, rb.b, { role: null, sector: `${role}|${ROLE_ORDER[(k + 1) % 6]}`, ring: true });
    addNode(`br_${k}`, 'small', bA, 252, br.name, br.b, { role: null, sector: `${role}|${ROLE_ORDER[(k + 1) % 6]}` });
    addNode(`ob_${k}`, 'small', bA, 318, ob.name, ob.b, { role: null, sector: `${role}|${ROLE_ORDER[(k + 1) % 6]}` });
    const ks = BORDER_KEYSTONE[k];
    if (ks) { const kd = KEYSTONES[ks]; addNode(ks, 'keystone', bA, 396, kd.name, kd.b, { role: null, sector: `${role}|${ROLE_ORDER[(k + 1) % 6]}`, flags: [ks], text: kd.text || [], tip: kd.tip, icon: kd.icon }); }
  });
  // edges
  ROLE_ORDER.forEach((role, k) => {
    const nx = ROLE_ORDER[(k + 1) % 6];
    const id = (s) => `${role}_${s}`;
    link(`start_${role}`, `c_${role}`);
    for (const s of ['s1', 'l1', 'r1']) link(`start_${role}`, id(s));
    link(id('l1'), id('s1')); link(id('r1'), id('s1'));
    link(id('s1'), id('s2')); link(id('s2'), id('n1')); link(id('n1'), id('s3')); link(id('s3'), id('s4')); link(id('s4'), SECTORS[role].keystone);
    link(id('l1'), id('l2')); link(id('l2'), id('nl')); link(id('nl'), id('l3')); link(id('l3'), id('l4')); link(id('l4'), id('s4'));
    link(id('r1'), id('r2')); link(id('r2'), id('nr')); link(id('nr'), id('r3')); link(id('r3'), id('r4')); link(id('r4'), id('s4'));
    // inner ring: c_k - ib_k - c_{k+1}
    link(`c_${role}`, `ib_${k}`); link(`ib_${k}`, `c_${nx}`);
    // bridges: right arm of k <-> left arm of k+1
    link(id('r2'), `br_${k}`); link(`br_${k}`, `${nx}_l2`);
    link(id('r3'), `ob_${k}`); link(`ob_${k}`, `${nx}_l3`);
    link(`br_${k}`, `ob_${k}`);
    const ks = BORDER_KEYSTONE[k];
    if (ks) link(`ob_${k}`, ks);
  });
})();

export const START_ID = (role) => `start_${ROLES[role]?.home || role}`;   // `home`: wave-2 roles (Trader / Engineer) share a tree post
export const NODE_COUNT = NODES.length;
export const KEYSTONE_NODES = NODES.filter((n) => n.type === 'keystone');
/** Radius that contains the whole tree (renderer fit). */
export const TREE_RADIUS = Math.max(...NODES.map((n) => Math.hypot(n.x, n.y))) + 60;

// ---------------------------------------------------------------- state helpers
export function emptyRpgState() { return { v: TREE_VERSION, role: null, nodes: [], kit: {} }; }

/** Set of allocated node ids for a state, INCLUDING the implicit start of the chosen role. */
export function allocatedSet(state) {
  const s = new Set();
  if (!state) return s;
  if (state.role && ROLES[state.role]) s.add(START_ID(state.role));
  for (const id of state.nodes || []) if (NODE[id]) s.add(id);
  return s;
}

/** Nodes of `ids` that are reachable from `startId` walking only through `ids` (BFS). */
export function reachableFrom(startId, ids) {
  const seen = new Set();
  if (!ids.has(startId)) return seen;
  const q = [startId]; seen.add(startId);
  while (q.length) {
    const cur = q.pop();
    for (const nb of ADJ[cur]) if (ids.has(nb) && !seen.has(nb)) { seen.add(nb); q.push(nb); }
  }
  return seen;
}

/** Drop unknown / duplicate / disconnected nodes from a state in place. Returns the removed ids. */
export function pruneState(state) {
  const removed = [];
  const role = state.role && ROLES[state.role] ? state.role : null;
  state.role = role;
  const seen = new Set();
  const list = [];
  for (const id of Array.isArray(state.nodes) ? state.nodes : []) {
    if (typeof id !== 'string' || !NODE[id] || seen.has(id) || (role && id === START_ID(role))) { if (typeof id === 'string' && !(role && id === START_ID(role))) removed.push(id); continue; }
    seen.add(id); list.push(id);
  }
  if (!role) { removed.push(...list); state.nodes = []; return removed; }
  const all = new Set([START_ID(role), ...list]);
  const ok = reachableFrom(START_ID(role), all);
  state.nodes = list.filter((id) => ok.has(id));
  for (const id of list) if (!ok.has(id)) removed.push(id);
  return removed;
}

/** Total skill points spent in the tree (role start is free). */
export function treeSpent(state) {
  let n = 0;
  for (const id of state?.nodes || []) if (NODE[id]) n += nodeCost(NODE[id]);
  return n;
}

/** Sum of every bonus (role base + allocated nodes) as { key: number }; every KEYS key is present (0 when unused). */
export function treeBonus(state) {
  const out = {};
  for (const k of KEY_IDS) out[k] = 0;
  if (!state) return out;
  const role = state.role && ROLES[state.role] ? ROLES[state.role] : null;
  if (role) for (const [k, v] of Object.entries(role.bonus)) out[k] = (out[k] || 0) + v;
  for (const id of state.nodes || []) {
    const n = NODE[id];
    if (!n) continue;
    for (const [k, v] of Object.entries(n.b)) out[k] = (out[k] || 0) + v;
  }
  return out;
}

/** Keystone / special flags of the allocated nodes. */
export function treeFlags(state) {
  const f = new Set();
  for (const id of state?.nodes || []) { const n = NODE[id]; if (n) for (const x of n.flags) f.add(x); }
  return f;
}
/** Normalise a keystone reference: 'Blood Magic', 'blood_magic', 'BLOODMAGIC' -> 'bloodmagic'. */
export const normId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------------------------------------------------------------- allocation logic (pure: nothing is mutated)
/**
 * Cheapest way to allocate `id`: Dijkstra from every allocated node through unallocated ones.
 * Returns { ok, reason, path: [ids in allocation order], cost } (`ok` only checks the graph, not the points).
 */
export function planAllocation(state, id) {
  const n = NODE[id];
  if (!n) return { ok: false, reason: 'Unknown node', path: [], cost: 0 };
  if (!state?.role) return { ok: false, reason: 'Choose a role first', path: [], cost: 0 };
  const have = allocatedSet(state);
  if (have.has(id)) return { ok: false, reason: 'Already allocated', path: [], cost: 0 };
  const dist = new Map(); const prev = new Map();
  const heap = [];   // tiny graph: a sorted array is fine
  for (const a of have) { dist.set(a, 0); heap.push(a); }
  const key = (x) => dist.get(x);
  while (heap.length) {
    heap.sort((a, b) => key(a) - key(b));
    const cur = heap.shift();
    if (cur === id) break;
    for (const nb of ADJ[cur]) {
      if (have.has(nb)) continue;
      const nd = key(cur) + nodeCost(NODE[nb]);
      if (!dist.has(nb) || nd < dist.get(nb)) { dist.set(nb, nd); prev.set(nb, cur); if (!heap.includes(nb)) heap.push(nb); }
    }
  }
  if (!dist.has(id)) return { ok: false, reason: 'Not reachable', path: [], cost: 0 };
  const path = [];
  for (let c = id; c && !have.has(c); c = prev.get(c)) path.unshift(c);
  return { ok: true, reason: '', path, cost: path.reduce((a, x) => a + nodeCost(NODE[x]), 0) };
}

/** Can `id` be refunded without disconnecting the rest? { ok, reason } */
export function planRefund(state, id) {
  if (!state?.nodes?.includes(id)) return { ok: false, reason: NODE[id]?.type === 'start' && state?.role && id === START_ID(state.role) ? 'Your role post cannot be refunded' : 'Not allocated' };
  const rest = allocatedSet(state); rest.delete(id);
  const ok = reachableFrom(START_ID(state.role), rest);
  for (const x of rest) if (!ok.has(x)) return { ok: false, reason: 'Other nodes depend on this one' };
  return { ok: true, reason: '' };
}

/** What switching to `newRole` would do: nodes that lose their connection to the new post get refunded. */
export function planRoleSwitch(state, newRole) {
  if (!ROLES[newRole]) return { ok: false, reason: 'Unknown role', orphans: [], freed: [], points: 0, clout: 0 };
  const all = new Set(state?.nodes || []);
  const start = START_ID(newRole);
  const freed = all.has(start) ? [start] : [];              // the new post becomes free: its point comes back
  all.delete(start);
  const withStart = new Set([start, ...all]);
  const ok = reachableFrom(start, withStart);
  const orphans = [...all].filter((x) => !ok.has(x));
  const points = freed.reduce((a, x) => a + nodeCost(NODE[x]), 0) + orphans.reduce((a, x) => a + nodeCost(NODE[x]), 0);
  const clout = orphans.reduce((a, x) => a + refundCost(NODE[x]), 0);
  return { ok: true, reason: '', orphans, freed, points, clout };
}

// ---------------------------------------------------------------- search
/** Node ids whose name / stat text / type matches every word of `q`. */
export function searchNodes(q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const out = new Set();
  if (!words.length) return out;
  for (const n of NODES) {
    const hay = [n.name, n.type, n.role ? ROLES[n.role]?.name : '', n.tip, ...n.text, ...bonusLines(n.b).map((l) => l.text), n.rare ? 'rare bag pocket' : ''].join(' ').toLowerCase();
    if (words.every((w) => hay.includes(w))) out.add(n.id);
  }
  return out;
}
