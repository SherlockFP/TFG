// Creature stat table (host AI + UI). Mods can add with registerCreature().
// hp: null = unkillable. power: spawn budget cost. xp/coin: kill rewards at level 1.
import { localizeFields } from '../core/i18n.js';
import { normalizeDef } from './balance_rules.js';
export const CREATURES = {
  scuttler: { name: 'Spam Bot', hp: 30, dmg: 8, walk: 2.2, run: 5.4, power: 0.5, pack: [2, 4], xp: 18, coin: 3, drop: ['drop_scuttler', 0.25], zone: 'in', radius: 0.5, height: 0.6,
    lore: 'Swarms of cheap spam bots. Crunchy. Easy XP for new janitors.' },
  yoinker: { name: 'Data Hoarder', hp: 60, dmg: 15, walk: 2.6, run: 6.2, power: 1, xp: 40, coin: 8, zone: 'in', radius: 0.45, height: 1.0,
    lore: 'Hoards content in its nest. Harmless... until you touch its stuff. Yippee!' },
  crawler: { name: 'Web Crawler', hp: 160, dmg: 40, walk: 2.8, run: 11, power: 2, xp: 110, coin: 20, drop: ['drop_crawler', 0.45], zone: 'in', radius: 0.8, height: 1.2,
    lore: 'Indexes everything at terrifying speed, in straight lines. Terrible at corners. Sidestep it.' },
  lurker: { name: 'Lurker', hp: 220, dmg: 70, walk: 2.4, run: 9.5, power: 3, xp: 260, coin: 45, drop: ['drop_lurker', 0.6], zone: 'in', radius: 0.45, height: 2.2,
    lore: 'Reads everything, posts nothing. Stalks you from behind. Look at it and it backs off. Stare too long and it gets angry.' },
  mannequin: { name: 'NPC', hp: null, dmg: 70, walk: 12, run: 13, power: 1.5, xp: 0, coin: 0, zone: 'in', radius: 0.4, height: 2.0,
    lore: 'Only moves when nobody is looking. Keep eyes on it and back away. Stun it to escape.' },
  sludge: { name: 'AI Slop', hp: null, dmg: 35, walk: 1.1, run: 1.9, power: 1, xp: 0, coin: 0, zone: 'in', radius: 0.9, height: 1.0,
    lore: 'A slow, endless blob of generated content. Cannot be killed. It seems to enjoy music.' },
  jester: { name: 'Pop-up', hp: null, dmg: 999, walk: 1.3, run: 13.5, power: 3, xp: 0, coin: 0, zone: 'in', radius: 0.55, height: 1.9,
    lore: 'Follows you around. When the jingle starts, close the tab: get OUT of the building. Now.' },
  spider: { name: 'Web Spider', hp: 140, dmg: 30, walk: 2.6, run: 7.2, power: 2, xp: 90, coin: 15, drop: ['drop_spider', 0.6], zone: 'in', radius: 0.9, height: 1.0,
    lore: 'Spins webs across corridors and waits. Webs slow you down. Its silk sells well.' },
  leech: { name: 'Leecher', hp: 25, dmg: 10, walk: 1.5, run: 3, power: 1, xp: 40, coin: 6, zone: 'in', radius: 0.4, height: 0.4,
    lore: 'Clings to ceilings and drops onto heads. Takes, never seeds. Have a friend hit it off.' },
  screamer: { name: 'Screamer', hp: 90, dmg: 25, walk: 2.0, run: 6.0, power: 2, xp: 80, coin: 14, zone: 'in', radius: 0.4, height: 1.9,
    lore: 'A classic. Nearly invisible in the dark until your flashlight finds it. Its scream stuns.' },
  mimic: { name: 'Deepfake', hp: 120, dmg: 30, walk: 3.2, run: 7.0, power: 2, xp: 100, coin: 18, zone: 'any', radius: 0.35, height: 1.8,
    lore: 'Wears the face of a crewmate and sometimes their voice. If "they" are not answering, run.' },
  hound: { name: 'Troll', hp: 180, dmg: 45, walk: 3.0, run: 11, power: 2, xp: 130, coin: 22, drop: ['drop_hound', 0.5], zone: 'out', radius: 0.8, height: 1.2,
    lore: 'Blind. Hunts by sound: footsteps, horns, voices. Do not feed it. Crouch. Whisper.' },
  giant: { name: 'Influencer', hp: 600, dmg: 85, walk: 3.0, run: 6.3, power: 3, xp: 520, coin: 90, drop: ['drop_giant', 1], zone: 'out', radius: 1.2, height: 8,
    lore: 'Towering and hungry for content. If it sees you, you are in its next video. Break line of sight.' },
  sandkefal: { name: 'The Worm', hp: null, dmg: 999, walk: 8, run: 12, power: 3, xp: 0, coin: 0, zone: 'out', radius: 3, height: 3,
    lore: 'A colossal computer worm beneath the sand. When the ground rumbles, MOVE.' },
  turret: { name: 'Firewall Turret', hp: null, dmg: 12, power: 0, xp: 0, coin: 0, zone: 'in', hazard: true, radius: 0.5, height: 1.2,
    lore: 'Algorithm security. Disable with its terminal code.' },
  mine: { name: 'Clickbait Mine', hp: null, dmg: 110, power: 0, xp: 0, coin: 0, zone: 'in', hazard: true, radius: 0.3, height: 0.1,
    lore: 'Click. Do not step off. ...you stepped off.' },
  mimicdoor: { name: 'Fake Exit?', hp: 60, dmg: 999, power: 1, xp: 120, coin: 25, zone: 'in', hazard: true, radius: 0.8, height: 2.4,
    lore: 'Dark pattern. Not every EXIT sign tells the truth. Real exits don\'t breathe.' },
  web: { name: 'Web', hp: 10, dmg: 0, power: 0, xp: 2, coin: 0, zone: 'in', hazard: true, radius: 1.3, height: 2,
    lore: 'Sticky. Slows you down and alerts its owner. Hit it to tear it.' },

  // ---- round 3: Lethal Company inspired, re-themed to internet horror (behaviors in entities/creatures.js) ----
  moderator: { name: 'The Moderator', hp: 240, dmg: 45, walk: 1.9, run: 3.8, power: 2.5, xp: 240, coin: 45, zone: 'in', radius: 0.45, height: 2.3, maxAlive: 3,
    deathText: 'was permanently banned by the Moderator.',
    lore: 'Patrols the halls with a ban-hammer shotgun. When the eye on its hat opens it is REVIEWING: anything that moves gets reported... and shot. '
      + 'Freeze while the eye glows green. The red laser means it already decided. It has to reload after two shots. Drops its shotgun.' },
  support: { name: 'Customer Support', hp: 150, dmg: 50, walk: 2.3, run: 5.6, power: 2, xp: 170, coin: 30, zone: 'in', radius: 0.4, height: 1.9, maxAlive: 2,
    deathText: 'was stabbed by Customer Support. Your call was important to them.',
    lore: 'Polite. Attentive. Follows you around sweeping the floor with a smile on its face-screen. It only helps customers who are ALONE. '
      + 'Stay in groups. When it dies, every unresolved ticket inside it comes out at once.' },
  ticketswarm: { name: 'Ticket Swarm', hp: 45, dmg: 5, walk: 4.6, run: 6.2, power: 0, xp: 25, coin: 3, zone: 'in', radius: 0.8, height: 1.6, noSpawn: true,
    deathText: 'was buried in unresolved tickets.',
    lore: 'A buzzing cloud of angry support tickets. They burn out after half a minute. Run, or swat them.' },
  editor: { name: 'The Editor', hp: 260, dmg: 60, walk: 0, run: 0, power: 2, xp: 210, coin: 38, zone: 'in', radius: 0.55, height: 2.4, maxAlive: 2,
    deathText: 'was cut from the final edit.',
    lore: 'Only moves on the beat. Every drum hit it jumps closer. Between beats it is frozen, listening. '
      + 'If you are next to it on the beat: SNIP. Count the rhythm and keep your distance.' },
  tamagotchi: { name: 'Tamagotchi', hp: 320, dmg: 55, walk: 1.2, run: 8.2, power: 2, xp: 280, coin: 50, zone: 'in', radius: 0.35, height: 0.6, maxAlive: 2,
    grownHeight: 2.2, grownRadius: 0.55,   // after the morph (extra >= 1): hit box / scan label height
    hint: { state: 'cry', text: 'CROUCH BESIDE IT TO ROCK IT', r: 5 },   // floating prompt for nearby players
    deathText: 'forgot to feed their Tamagotchi.',
    lore: 'A crying virtual pet. It wants attention. Crouch next to it to rock it. Neglect it, or hit it, and it grows up very fast... '
      + 'The adult crouches before it lunges: sidestep.' },
  stalker: { name: 'Parasocial', hp: null, dmg: 70, walk: 2.6, run: 6.2, power: 2.5, xp: 0, coin: 0, zone: 'in', radius: 0.35, height: 1.75, maxAlive: 1,
    deathText: 'was loved to death by a Parasocial.',
    lore: 'Your biggest fan. Only YOU can see it. It watches, it giggles, it follows. When the static starts, it is coming: '
      + 'break line of sight, or leave the building. Your crew will think you are crazy.' },
  clickbait: { name: 'Clickbait', hp: 170, dmg: 12, walk: 2.4, run: 7.4, power: 2, xp: 190, coin: 34, zone: 'out', radius: 0.6, height: 1.1, maxAlive: 2,
    deathText: 'clicked the thumbnail.',
    lore: 'Hides in the brush with a face you just HAVE to look at. It picks off stragglers: a notification ding, a flash, then its tongue drags you away. '
      + 'Hit it hard to make it let go. Travel in pairs.' },
  replyguy: { name: 'Reply Guy', hp: 70, dmg: 16, walk: 2.6, run: 7.2, power: 2, xp: 70, coin: 12, zone: 'out', radius: 0.45, height: 1.7, maxAlive: 8,
    deathText: 'was ratioed by Reply Guys.',
    lore: 'Travel in flocks. Cowards alone, brave in a thread. They spread their wings and screech before they pile on a lone janitor. '
      + 'Stand your ground, swing at them, and they scatter.' },
};

for (const [id, d] of Object.entries(CREATURES)) normalizeDef(id, d);   // balance_rules: no non-allowlisted one-shot numbers

// ---------------------------------------------------------------------------------------------
// Global spawn weights for the round-3 creatures, merged on top of every moon's own table (moon entries win).
// w: weight per moon tier 1..4 (tier 0 = HQ never spawns). interior: multipliers per facility theme.
// ---------------------------------------------------------------------------------------------
export const EXTRA_SPAWNS = {
  moderator: { zone: 'in', w: [3, 6, 9, 11], interior: { factory: 1.3, mansion: 1, mineshaft: 0.8 } },
  support: { zone: 'in', w: [2, 6, 8, 10], interior: { mansion: 2, factory: 0.7, mineshaft: 0.6 } },
  editor: { zone: 'in', w: [2, 5, 8, 10], interior: { mineshaft: 1.5, factory: 1, mansion: 0.9 } },
  tamagotchi: { zone: 'in', w: [4, 5, 6, 7] },
  stalker: { zone: 'in', w: [0, 3, 5, 7], interior: { mansion: 1.6 } },
  clickbait: { zone: 'out', w: [2, 4, 6, 7] },
  replyguy: { zone: 'out', w: [4, 6, 6, 7] },
};

/** Merged spawn table {id: weight} for a moon and zone ('in' | 'out'). Moon-defined weights take priority. */
export function spawnTable(moon, zone = 'in', run = null) {
  const base = (zone === 'out' ? moon?.outdoor : moon?.creatures) || {};
  const out = { ...base };
  if (!moon || moon.company || moon.noExtraSpawns) return out;
  const tier = Math.max(1, Math.min(4, Math.round(moon.tier || 1)));
  const late = run ? Math.min(1.5, 1 + (run.quotaIndex || 0) * 0.05) : 1;
  for (const [id, e] of Object.entries(EXTRA_SPAWNS)) {
    if (e.zone !== zone || !CREATURES[id] || id in base) continue;
    const w = (e.w[tier - 1] || 0) * (e.interior?.[moon.interior] ?? 1) * late;
    if (w > 0) out[id] = Math.round(w * 10) / 10;
  }
  return out;
}

/** Host spawn gate: per-type caps (def.maxAlive) and the one-jester rule. hostMap = CreatureManager.host */
export function canSpawnMore(type, hostMap) {
  const def = CREATURES[type];
  if (!def || def.noSpawn) return false;
  const cap = type === 'jester' ? 1 : def.maxAlive;
  if (!cap || !hostMap) return true;
  let n = 0;
  for (const c of hostMap.values()) if (c.type === type && !c.dead) n++;
  return n < cap;
}

// ---------------------------------------------------------------------------------------------
// Behaviour variants ("diversity horror"): rolled by the host at spawn, w = % chance, otherwise the base form.
// Stat multipliers: hp, speed (walk + run), dmg. scale / tint are visual. flags are read by the behaviours.
// ---------------------------------------------------------------------------------------------
export const VARIANTS = {
  scuttler: [
    { id: 'popup', name: 'Pop-up Ad Bot', w: 16, tint: '#ff7a1a', scale: 0.95, hp: 0.7, note: 'Blinks and explodes next to you. Back off when it beeps.' },
    { id: 'bulk', name: 'Bulk Mailer', w: 12, tint: '#5a6cff', scale: 1.35, hp: 2.2, speed: 0.8, dmg: 1.4, note: 'Fat, slow and hits hard.' },
  ],
  crawler: [{ id: 'deep', name: 'Deep Crawler', w: 20, tint: '#2848ff', scale: 1.12, hp: 1.3, speed: 1.12, note: 'Faster and tougher, turns better.' }],
  hound: [{ id: 'alpha', name: 'Alpha Troll', w: 18, tint: '#ff2a2a', scale: 1.2, hp: 1.5, dmg: 1.2, note: 'Its howl calls every Troll nearby to you.' }],
  spider: [{ id: 'hunter', name: 'Hunter Spider', w: 25, tint: '#28ff88', scale: 0.9, hp: 0.85, speed: 1.2, note: 'Spins no webs. Roams and hunts.' }],
  lurker: [{ id: 'obsessed', name: 'Obsessed Lurker', w: 20, tint: '#ff2ab8', speed: 0.9, note: 'Gets angry much faster when stared at.' }],
  yoinker: [{ id: 'feral', name: 'Feral Hoarder', w: 22, tint: '#ff4a20', scale: 1.1, hp: 1.3, dmg: 1.25, note: 'Guards a wider nest and snaps sooner.' }],
  screamer: [{ id: 'banshee', name: 'Banshee', w: 20, tint: '#9adfff', scale: 1.05, note: 'Much wider scream, longer cooldown.' }],
  sludge: [{ id: 'toxic', name: 'Toxic Slop', w: 25, tint: '#9dff20', speed: 1.3, dmg: 1.2, note: 'Faster, and it burns.' }],
  moderator: [{ id: 'senior', name: 'Senior Moderator', w: 15, tint: '#ffd000', scale: 1.08, hp: 1.4, note: 'Longer reviews, faster aim.' }],
  replyguy: [{ id: 'verified', name: 'Verified Reply Guy', w: 15, tint: '#3aa0ff', hp: 1.5, dmg: 1.2, note: 'Leads the flock. Never flees alone.' }],
  tamagotchi: [{ id: 'neglected', name: 'Neglected Tamagotchi', w: 15, tint: '#ff4060', note: 'Cries more often. Much less patient.' }],
};
export function variantOf(type, id) { return id ? (VARIANTS[type] || []).find((v) => v.id === id) || null : null; }

// ---------------------------------------------------------------------------------------------
// Elite / level affixes: visible glow colour (tint + eyes + pulsing floor ring) and a name prefix.
// ---------------------------------------------------------------------------------------------
export const AFFIXES = {
  viral: { name: 'Viral', color: '#33e0ff', speed: 1.35, desc: 'Moves 35% faster.' },
  paywalled: { name: 'Paywalled', color: '#c8d2dc', armor: 0.45, killable: true, desc: 'Takes 45% less damage.' },
  monetized: { name: 'Monetized', color: '#ff3050', leech: 25, killable: true, desc: 'Heals when it hurts you.' },
  hottake: { name: 'Hot Take', color: '#ff8a1a', explode: true, killable: true, desc: 'Explodes shortly after death. Back off when it blinks.' },
  evergreen: { name: 'Evergreen', color: '#5dff6a', regen: 0.02, killable: true, desc: 'Regenerates health.' },
  shadowbanned: { name: 'Shadowbanned', color: '#9a5cff', shadow: true, desc: 'Nearly invisible from afar.' },
};
const NO_AFFIX = new Set(['stalker', 'ticketswarm', 'sandkefal', 'jester', 'mimic', 'mannequin']);
/** Host roll (rand = () => [0,1)). Elites always get one; high-level creatures sometimes. */
export function rollAffix(type, level, elite, rand = Math.random) {
  const def = CREATURES[type];
  if (!def || def.hazard || def.boss || NO_AFFIX.has(type)) return null;
  const chance = elite ? 1 : level >= 5 ? Math.min(0.3, 0.12 + (level - 5) * 0.02) : 0;
  if (!(rand() < chance)) return null;
  const ids = Object.keys(AFFIXES).filter((a) => def.hp != null || !AFFIXES[a].killable);
  return ids.length ? ids[Math.floor(rand() * ids.length)] : null;
}
/** Display name with variant + affix, e.g. "Viral Deep Crawler". */
export function creatureDisplayName(type, variant, affix) {
  const def = CREATURES[type];
  const base = variantOf(type, variant)?.name || def?.name || type;
  return affix && AFFIXES[affix] ? `${AFFIXES[affix].name} ${base}` : base;
}

export function registerCreature(id, def, behavior) {
  CREATURES[id] = localizeFields({ name: id, hp: 100, dmg: 20, walk: 2, run: 5, power: 1, xp: 50, coin: 10, zone: 'in', radius: 0.5, height: 1.5, ...def, custom: true }, ['name', 'lore']);
  normalizeDef(id, CREATURES[id]);   // balance_rules: 999 -> 90 unless a telegraphed instakill hazard / boss
  if (behavior) CREATURES[id].behavior = behavior;
  return CREATURES[id];
}

export function creatureLevelStats(def, level, elite, mods = null) {
  const hpMul = (1 + 0.18 * (level - 1)) * (elite ? 2 : 1) * (mods?.hp || 1);
  const dmgMul = (1 + 0.1 * (level - 1)) * (elite ? 1.3 : 1) * (mods?.dmg || 1);
  return {
    maxHp: def.hp ? Math.round(def.hp * hpMul) : null,
    dmg: def.dmg >= 999 ? 999 : Math.round(def.dmg * dmgMul),
    xp: Math.round(def.xp * (1 + 0.15 * (level - 1)) * (elite ? 2.2 : 1)),
    coin: Math.round(def.coin * (1 + 0.1 * (level - 1)) * (elite ? 2 : 1)),
  };
}
