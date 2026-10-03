// Display only: registered moon/theme IDs and native generation stay unchanged.
import { addTranslations } from '../core/i18n.js';
import { admitOpenPlaces35, hasOpenPlaces35 } from './openplaces35.js';

const PLACES = {
  courtyard: Object.freeze({ kind: 'courtyard', name: 'Service Courtyard', layout: 'Covered service bays', hint: 'Search the service bays. The main entrance leads back toward the ship.' }),
  concourse: Object.freeze({ kind: 'concourse', name: 'Empty Concourse', layout: 'Open shopping hall', hint: 'Search the closed shopfronts. The main entrance leads back toward the ship.' }),
  reception: Object.freeze({ kind: 'reception', name: 'Reception Atrium', layout: 'Undelivered reception counters', hint: 'Search the undelivered counters. Use the lift to return to the surface.' }),
};
addTranslations({
  'Service Courtyard': 'Servis Avlusu', 'Empty Concourse': 'Boş Alışveriş Holü', 'Reception Atrium': 'Karşılama Atriyumu',
  'Covered service bays': 'Üstü kapalı servis bölmeleri', 'Open shopping hall': 'Açık alışveriş holü', 'Undelivered reception counters': 'Teslim edilmemiş içerik bankoları',
  'Search the service bays. The main entrance leads back toward the ship.': 'Servis bölmelerini ara. Ana giriş gemiye dönüş yoluna açılır.',
  'Search the closed shopfronts. The main entrance leads back toward the ship.': 'Kapalı dükkânları ara. Ana giriş gemiye dönüş yoluna açılır.',
  'Search the undelivered counters. Use the lift to return to the surface.': 'Teslim edilmemiş içerik bankolarını ara. Yüzeye dönmek için asansörü kullan.',
});
addTranslations({
  'Service Courtyard': 'Служебный двор', 'Empty Concourse': 'Пустая торговая галерея', 'Reception Atrium': 'Атриум приёмной',
  'Covered service bays': 'Крытые сервисные отсеки', 'Open shopping hall': 'Открытый торговый зал', 'Undelivered reception counters': 'Стойки недоставленного контента',
  'Search the service bays. The main entrance leads back toward the ship.': 'Обыщите сервисные отсеки. Главный вход ведёт к кораблю.',
  'Search the closed shopfronts. The main entrance leads back toward the ship.': 'Обыщите закрытые магазины. Главный вход ведёт к кораблю.',
  'Search the undelivered counters. Use the lift to return to the surface.': 'Обыщите стойки недоставленного контента. На поверхность возвращайтесь на лифте.',
}, 'ru');

/** Current built geometry wins; only a validated landing can describe a pending map. */
export function openPlacePresentation36(run, world, moon) {
  if (!run || !['landing', 'moon', 'takeoff'].includes(run.phase)) return null;
  if (world?.moonId === run.moon && world.seed === run.seed && world.facility) {
    const o = world.facility.layout?.open35;
    return o?.version === 35 && Array.isArray(o.publicRooms) && o.publicRooms.length ? PLACES[o.kind] || null : null;
  }
  if (run.phase !== 'landing') return null;
  const d = run.descent21;
  if (d?.token === `${run.moon}:${run.seed}:${run.day}` && d.depth > 0) {
    return d.routeVersion === 35 && d.depth >= 3 && d.currentChoice?.theme === 'backrooms' ? PLACES.reception : null;
  }
  const opts = moon?.layoutOpts;
  if (opts?.arena || opts?.labyrinth || opts?.wings) return null;
  return hasOpenPlaces35(run) && admitOpenPlaces35(run, moon) ? PLACES[run.openPlaces35.kind] : null;
}
