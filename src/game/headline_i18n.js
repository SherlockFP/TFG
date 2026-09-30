// headline / trim strings (docs/wave8/trim.md): English keys, TR + RU tables. Loaded for its side effect.
import { addTranslations } from '../core/i18n.js';

addTranslations({
  'VOYAGE WARP': 'SEFER SAPMASI', 'HEADLINE': 'MANŞET',
  'The route changed on the way down.': 'İnişte rota değişti.',
  'More of them, one level higher, extra loot.': 'Daha fazlası, bir seviye güçlü, fazladan ganimet.',
}, 'tr');
addTranslations({
  'VOYAGE WARP': 'СБОЙ МАРШРУТА', 'HEADLINE': 'ГЛАВНОЕ',
  'The route changed on the way down.': 'Маршрут изменился при посадке.',
  'More of them, one level higher, extra loot.': 'Их больше, они на уровень сильнее, добыча богаче.',
}, 'ru');
