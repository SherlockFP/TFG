// Explicit destinations preserve existing generated moon IDs and saved layouts.
import { registerMoon } from './moons.js';
import { addTranslations } from '../core/i18n.js';

const descriptions = [
  ['Archived replies branch around a reading trunk. Carry a light: neglected side passages can collapse after a warning.', 'Arşivlenmiş yanıtlar okuma hattının çevresinde dallanır. Işık taşı: karanlıkta bırakılan yan geçitler uyarıdan sonra çökebilir.', 'Архивные ответы ветвятся вокруг читальной линии. Носите свет: забытые тёмные боковые проходы могут обрушиться после предупреждения.'],
  ['Twin processing lanes and a service bypass beneath a dead upload yard. Watch the ceiling and keep a return route.', 'Ölü bir yükleme sahasının altında iki işlem hattı ve servis geçidi. Tavana dikkat et ve dönüş yolunu koru.', 'Две линии обработки и сервисный обход под мёртвым загрузочным двором. Следите за потолком и сохраняйте путь назад.'],
];
for (const [i, lang] of [[1, 'tr'], [2, 'ru']]) addTranslations(Object.fromEntries(descriptions.map(r => [r[0], r[i]])), lang);

export const LAB20_MOONS = [
  registerMoon({ id: 'archive20', name: '17-Thread Archive', short: 'Thread Archive', tier: 1, cost: 0,
    biome: 'swamp', interior: 'threadarchive', interiorName: 'Thread Archive', size: 1.1,
    desc: descriptions[0][0], weather: ['clear', 'foggy', 'rainy'], scrapCount: [12, 16], scrapMul: 1.05,
    power: 4, outdoorPower: 2, creatures: { scuttler: 24, yoinker: 18, crawler: 12, spider: 10, leech: 8, lurker: 5, c20_pixel: .6 }, outdoor: { hound: 4 } }),
  registerMoon({ id: 'foundry20', name: '27-Buffer Foundry', short: 'Buffer Foundry', tier: 2, cost: 95,
    biome: 'desert', interior: 'bufferfoundry', interiorName: 'Buffer Foundry', size: 1.2,
    desc: descriptions[1][0], weather: ['clear', 'clear', 'foggy'], scrapCount: [14, 18], scrapMul: 1.15,
    power: 5, outdoorPower: 3, creatures: { scuttler: 18, yoinker: 14, crawler: 16, spider: 12, lurker: 10, mannequin: 6, c20_brute: .8 }, outdoor: { hound: 6, sandkefal: 3 } }),
];
