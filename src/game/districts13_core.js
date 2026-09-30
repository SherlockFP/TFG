import { registerMoon, MOONS } from './moons.js';
import { ladderAdd, HOOKS } from './routeboard_core.js';
import { localizeFields } from '../core/i18n.js';
import { TEXT13 } from './districts13_text.js';
export const THEMES13 = ['echoregistry', 'embercache'];
export const DISTRICT_REWARD13 = { restored: 20, complete: 45 };
export function coolingTarget(seed, index, step) {
  const n = Math.imul((seed | 0) ^ (index + 1) * 3917 ^ (step + 1) * 7919, 1103515245) >>> 0;
  return 1 + (n % 3);
}
export function advanceStation(theme, values, index) {
  if (!Number.isInteger(index) || index < 0 || index >= 3 || !THEMES13.includes(theme)) return null;
  const next = values.slice(0, 3);
  if (theme === 'echoregistry') {
    if (index !== next.filter(Boolean).length || next[index]) return null;
    next[index] = 1;
  } else {
    if (next[index] >= 4) return null;
    next[index]++;
  }
  const max = theme === 'echoregistry' ? 1 : 4;
  return { values: next, completed: next.filter(v => v >= max).length, restored: values[index] < max && next[index] >= max };
}
for (const [id, theme, name, description, q, cost, biome] of [
  ['echo13', 'echoregistry', TEXT13[0][0], TEXT13[2][0], 1, 120, 'moor'],
  ['ember13', 'embercache', TEXT13[1][0], TEXT13[3][0], 2, 240, 'desert'],
]) {
  if (!MOONS[id]) localizeFields(registerMoon({
    id, name, short: name, desc: description, interior: theme, biome, tier: q + 1, cost,
    size: 0.95, scrapCount: [12, 17], scrapMul: q === 1 ? 1.1 : 1.3, power: q === 1 ? 4 : 5, outdoorPower: 2,
    weather: ['clear', 'clear', 'foggy'], creatures: { scuttler: 18, yoinker: 12, crawler: 9, lurker: 8, mannequin: 6, spider: 8, mimic: 3 }, outdoor: { hound: 5 },
  }), ['name', 'short', 'desc']);
  ladderAdd(q, [id]); HOOKS[id] = [description, TEXT13[q === 1 ? 2 : 3][1], TEXT13[q === 1 ? 2 : 3][2]];
}
