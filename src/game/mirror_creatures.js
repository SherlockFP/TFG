// MIRROR DIMENSION creatures (host AI runs inside the generic CreatureManager.hostUpdate, exactly like creatures_wave1.js):
//   mr_ghost  Reflection Wraith: phases through walls, drifts at the nearest player, touch attack after a 0.5 s wind-up
//   mr_fiend  Flame Fiend: chases, leaves burning trails (HOOK.fire), bursts when it dies (mirror.js handles the burst)
//   mr_copy   Mirror Copy: a crew look-alike that chases and hits after a telegraphed 0.55 s wind-up
// The fodder is the horde module's Zombie Account (creatures_wave1.js spawnZombot, flagged data.mirror).
// Every dimension creature is flagged `def.mirror` (or `data.mirror`): mirror.js filters who it can target and who can see it.
import { registerCreature } from './creatures.js';
import { STATE_SOUNDS } from '../entities/creatures.js';
import { addTranslations } from '../core/i18n.js';
import { clamp } from '../core/util.js';

export const MIRROR_TYPES = ['mr_ghost', 'mr_fiend', 'mr_copy'];
export const isMirrorCreature = (c) => !!(c && (c.def?.mirror || c.data?.mirror));

/** wired by mirror.js: targets(c) -> alive players inside the dimension, fire(pos) -> burning patch on every peer */
export const HOOK = { targets: () => [], fire: () => {} };

addTranslations({
  'Reflection Wraith': 'Yansıma Hayaleti', 'Flame Fiend': 'Alev Canavarı', 'Mirror Copy': 'Ayna Kopyası',
  'was haunted by a reflection.': 'bir yansıma tarafından ürkütüldü.', 'burned in the mirror.': 'aynada yandı.', 'was replaced by their reflection.': 'yansıması tarafından değiştirildi.',
  'A wraith made of the other side of the glass. It walks through walls and drifts straight at you.': 'Camın öbür yüzünden yapılmış bir hayalet. Duvarlardan geçer, düz sana süzülür.',
  'Burns everything it touches and leaves a trail of fire. When it dies it bursts: back off.': 'Dokunduğu her şeyi yakar, ardında ateş izi bırakır. Ölünce patlar: uzaklaş.',
  'It wears a crewmate. It hits harder than it looks.': 'Bir ekip arkadaşının kılığında. Göründüğünden sert vurur.',
}, 'tr');
addTranslations({
  'Reflection Wraith': 'Призрак отражения', 'Flame Fiend': 'Огненный бес', 'Mirror Copy': 'Зеркальная копия',
  'was haunted by a reflection.': 'был замучен отражением.', 'burned in the mirror.': 'сгорел в зеркале.', 'was replaced by their reflection.': 'был заменён своим отражением.',
  'A wraith made of the other side of the glass. It walks through walls and drifts straight at you.': 'Призрак с другой стороны стекла. Проходит сквозь стены и плывёт прямо на вас.',
  'Burns everything it touches and leaves a trail of fire. When it dies it bursts: back off.': 'Жжёт всё, к чему прикасается, и оставляет огненный след. Умирая, взрывается: отойдите.',
  'It wears a crewmate. It hits harder than it looks.': 'Носит облик члена экипажа. Бьёт сильнее, чем кажется.',
}, 'ru');

function nearest(c, list) {
  let best = null, bd = 1e9;
  for (const p of list) { const d = (p.pos.x - c.pos.x) ** 2 + (p.pos.z - c.pos.z) ** 2; if (d < bd) { bd = d; best = p; } }
  return best ? { p: best, d: Math.sqrt(bd) } : null;
}

function ghostAI(c, dt, M) {
  const n = nearest(c, HOOK.targets(c));
  if (!n) { c.setState('idle'); return; }
  const p = n.p, d = n.d;
  c.target = p.id;
  if (c.age < 0.8) return;
  const dx = p.pos.x - c.pos.x, dz = p.pos.z - c.pos.z, dy = p.pos.y + 0.1 - c.pos.y;
  c.yaw = Math.atan2(dx, dz);
  if (c.state === 'attack') {
    if (c.t >= 0.5) { if (d < 2.0 && Math.abs(dy) < 2.4) M.attack(c, p, c.dmg, c.type); c.cooldown = 1.3; c.setState('run'); }
    return;
  }
  const sp = M.speedMul(c, c.def.run);
  if (d > 1.2) { c.pos.x += (dx / d) * sp * dt; c.pos.z += (dz / d) * sp * dt; }
  c.pos.y += clamp(dy, -1.5, 1.5) * Math.min(1, dt * 2.2);      // floats through terrain and walls alike
  c.setState('run');
  if (d < 1.8 && c.cooldown <= 0) c.setState('attack');
}

function meleeAI({ reach, windup, cd, fire = false }) {
  return (c, dt, M) => {
    const n = nearest(c, HOOK.targets(c));
    if (!n) { c.setState('idle'); return; }
    const p = n.p, d = n.d;
    c.target = p.id;
    if (c.age < 0.6) return;
    if (c.state === 'attack') {
      if (c.t >= windup) { c.yaw = Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z); if (d < reach + 0.5 && Math.abs(p.pos.y - c.pos.y) < 2.4) M.attack(c, p, c.dmg, c.type); c.cooldown = cd; c.setState('run'); }
      return;
    }
    if (d < reach && c.cooldown <= 0) { c.yaw = Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z); c.setState('attack'); return; }
    c.setState('run');
    M.moveToward(c, p.pos, dt, c.def.run);
    if (fire) { c.data.fireT = (c.data.fireT || 0) - dt; if (c.data.fireT <= 0) { c.data.fireT = 0.7; HOOK.fire(c.pos); } }
  };
}

let registered = false;
export function registerMirrorCreatures() {
  if (registered) return;
  registered = true;
  registerCreature('mr_ghost', {
    name: 'Reflection Wraith', hp: 22, dmg: 9, walk: 1.8, run: 2.7, power: 0, xp: 9, coin: 1, zone: 'any', radius: 0.42, height: 1.7, noSpawn: true, mirror: true,
    deathText: 'was haunted by a reflection.', lore: 'A wraith made of the other side of the glass. It walks through walls and drifts straight at you.',
  }, ghostAI);
  registerCreature('mr_fiend', {
    name: 'Flame Fiend', hp: 42, dmg: 12, walk: 2.4, run: 4.0, power: 0, xp: 16, coin: 3, zone: 'out', radius: 0.5, height: 2.0, noSpawn: true, mirror: true,
    deathText: 'burned in the mirror.', lore: 'Burns everything it touches and leaves a trail of fire. When it dies it bursts: back off.',
  }, meleeAI({ reach: 1.5, windup: 0.45, cd: 1.2, fire: true }));
  registerCreature('mr_copy', {
    name: 'Mirror Copy', hp: 60, dmg: 14, walk: 2.6, run: 4.4, power: 0, xp: 26, coin: 5, zone: 'out', radius: 0.36, height: 1.85, noSpawn: true, mirror: true,
    deathText: 'was replaced by their reflection.', lore: 'It wears a crewmate. It hits harder than it looks.',
  }, meleeAI({ reach: 1.7, windup: 0.55, cd: 1.3 }));
  STATE_SOUNDS.mr_ghost = { attack: [['whisper_2', 'whisper_1'], 0.7, 1.1], dead: [['whisper_3', 'creature_death'], 0.6, 1.3] };
  STATE_SOUNDS.mr_fiend = { attack: [['hit_metal', 'scuttler_hiss'], 0.7, 0.7], dead: [['creature_death'], 0.7, 0.8] };
  STATE_SOUNDS.mr_copy = { attack: [['hit_flesh', 'lurker_snap'], 0.7, 0.9], dead: [['glass_break', 'creature_death'], 0.6, 1.2] };
}
