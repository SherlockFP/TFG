// Prints the wave 8 creature balance table (markdown) from the REAL tables:  node tools/sim/creature_table.mjs > table.md
// Every module that calls registerCreature() is loaded (register* functions / module-level registrations), then one row per creature.
globalThis.window = globalThis;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const B = '../../src/game/';
const { CREATURES, EXTRA_SPAWNS, registerCreature } = await import(B + 'creatures.js');
const { RULES, isInstakillOk } = await import(B + 'balance_rules.js');
const { MOONS } = await import(B + 'moons.js');
const { TUNING } = await import(B + 'chase_tuning.js');
for (const m of ['voyage', 'homeworld2_ghost', 'siege', 'bosses']) { try { await import(B + m + '.js'); } catch { /* optional */ } }
for (const [m, f] of [['horror_creatures', 'registerHorrorCreatures'], ['maps5_creatures', 'registerMaps5Creatures'], ['mirror_creatures', 'registerMirrorCreatures'],
  ['worlds2_creatures', 'registerWorlds2Creatures'], ['creatures_backrooms', 'registerBackroomsCreatures'], ['skeletons', 'registerSkeletonContent'], ['stealth', 'registerStealthContent']]) {
  try { (await import(B + m + '.js'))[f](); } catch { /* optional */ }
}
try { const { DEF } = await import(B + 'creeper.js'); if (!CREATURES.spambomb) registerCreature('spambomb', { ...DEF }); } catch { /* optional */ }
try { const { DEFS } = await import(B + 'creatures_wave1.js'); for (const [id, d] of Object.entries(DEFS)) if (!CREATURES[id]) registerCreature(id, { ...d }); } catch { /* optional */ }
try { const { BOSS_TABLE } = await import(B + 'cycle_core.js'); for (const b of Object.values(BOSS_TABLE)) if (!CREATURES[b.id]) registerCreature(b.id, { name: b.name, hp: b.hp, dmg: b.dmg, walk: 1.8, run: 3.4, boss: true, noSpawn: true }); } catch { /* optional */ }

// dmg the table had BEFORE wave 8 (only the ones this wave changed; registered defs report def.dmgWas)
const WAS = { lurker: 999, giant: 999, stalker: 999, mannequin: 90, editor: 80 };
// attack cooldown (s, read from the behaviours) and the tell the player gets. Everything not listed: cooldown 1.0-1.6 in its behaviour, wind-up = the 0.4 s gate.
const PROFILE = {
  scuttler: [1.0, 'chitter + gate 0.4'], yoinker: [0.9, 'snarl + gate 0.4'], crawler: [1.4, 'dash in a straight line, gate 0.4'], lurker: [8, 'growl; backs off when watched, gate 0.4'],
  mannequin: [0.6, 'freezes when seen, gate 0.4'], sludge: [0.5, 'slow blob (DoT ticks 50 %)'], jester: [3, 'jingle 10+ s, then chase'], spider: [1.3, 'web + skitter, gate 0.4'],
  leech: [1.0, 'drop (0.45 s fall); lets go after 6 s'], screamer: [8, 'scream = stun, gate 0.4'], mimic: [1.1, 'gate 0.4'], hound: [1.5, 'lunge state, gate 0.4'],
  giant: [3, 'grab 1.8 s (mash JUMP), eat 0.6 s'], sandkefal: [8, 'ground rumble 3.2 s'], turret: [0.5, 'red aim laser 0.8-1.4 s + lock 0.25'], mine: [0, 'click'],
  mimicdoor: [0, 'breathing exit sign'], moderator: [2.5, 'eye + red laser 0.8-1.4 s + lock 0.25'], support: [1.3, 'gate 0.4'], ticketswarm: [0.45, 'buzz (DoT)'],
  editor: [1.5, 'moves on the drum beat only'], tamagotchi: [1.5, 'crouch tell (adult)'], stalker: [0, 'static + giggle'], clickbait: [1.0, 'ding + flash, tongue 0.5 s, drag <= 3.2 s'],
  replyguy: [1.3, 'wing spread + screech, gate 0.4'], hr_ambusher: [0, 'knock + creak (stir) before the burst'], spambomb: [0, 'swell 1.5 s before it pops'],
  mr_ghost: [1.3, '0.5 s'], mr_fiend: [1.2, '0.45 s'], mr_copy: [1.3, '0.55 s'], br_smiler: [2.8, 'lunge 0.4 s'], br_hound: [1.8, 'lunge 0.35 s -> gate 0.4'],
};
const tiers = (id) => {
  const set = new Set();
  for (const m of Object.values(MOONS)) if ((m.creatures && id in m.creatures) || (m.outdoor && id in m.outdoor)) set.add(m.tier || 1);
  const e = EXTRA_SPAWNS[id]; if (e) e.w.forEach((w, i) => { if (w > 0) set.add(i + 1); });
  return set.size ? 'T' + Math.min(...set) : (CREATURES[id].boss ? 'boss' : CREATURES[id].hazard ? 'hazard' : 'event');
};
const speed = (d) => {
  const ask = Math.max(d.run || 0, d.walk || 0);
  if (!ask) return '-';
  if (d.boss || d.hazard || id0 === 'sandkefal') return `${d.walk || 0}/${d.run || 0}`;
  return ask > TUNING.sustained ? `${d.walk}/${d.run} -> burst ${TUNING.burstMax} ${TUNING.burstDur}s, then ${TUNING.sustained}` : `${d.walk}/${d.run}`;
};
let id0 = '';
const rows = [];
for (const [id, d] of Object.entries(CREATURES)) {
  id0 = id;
  const was = d.dmgWas ?? WAS[id] ?? d.dmg;
  const cd = PROFILE[id]?.[0]; const tell = PROFILE[id]?.[1] || (d.boss ? 'boss: own telegraphed specials (dmg <= 63 per hit)' : d.hazard ? 'hazard (no melee)' : 'gate 0.4');
  const ok = isInstakillOk(id, d);
  const one = (v) => (v >= 100 ? 'YES' : 'no');
  rows.push(`| ${id} | ${d.hp ?? 'immortal'} | ${was === d.dmg ? d.dmg : `${was} -> ${d.dmg}`} | ${cd == null ? '1.0-1.6' : cd || '-'} | ${speed(d)} | ${tiers(id)} | ${one(was)} -> ${d.boss ? 'boss' : ok ? 'q4+ only' : one(d.dmg)} | ${tell} |`);
}
console.log('| id | hp | dmg/hit (was -> now) | attack cd s | speed walk/run (m/s) | spawn | one-shot at 100 HP (was -> now) | telegraph |');
console.log('|---|---|---|---|---|---|---|---|');
console.log(rows.join('\n'));
console.log(`\n${rows.length} creatures. Rules: ${JSON.stringify({ cap: RULES.capTable, windup: RULES.windup, holdMax: RULES.holdMax })}`);
