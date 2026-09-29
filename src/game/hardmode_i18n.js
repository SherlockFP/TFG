// hardmode strings: English keys, TR + RU tables (docs/wave5/hardmode.md). Company-issued, dry, slightly smug.
import { addTranslations } from '../core/i18n.js';

const TR = {
  'Difficulty': 'Zorluk',
  'Casual': 'Rahat',
  'Standard': 'Standart',
  'Hard': 'Zor',
  'The old numbers. Relaxed: nothing here gets meaner.': 'Eski değerler. Rahat: hiçbir şey sertleşmez.',
  'From quota 3: loot worth 20% less, heavier hauls, the ship door warns before it locks, creatures close doors, food spoils.': 'Kota 3\'ten itibaren: ganimet %20 daha az değerli, yük daha ağır, gemi kapısı kilitlenmeden önce uyarır, yaratıklar kapı kapatır, yemek bozulur.',
  'Standard, one notch harder: loot -30%, 2 min lock warning, no campfire cooking, protection drives only from rare drops.': 'Standart, bir kademe zor: ganimet -%30, 2 dk kilit uyarısı, kamp ateşinde pişirme yok, koruma diskleri sadece nadir düşmelerden.',
  'SHIP DOOR LOCKS IN {n} s. Everyone back aboard.': 'GEMİ KAPISI {n} sn SONRA KİLİTLENİYOR. Herkes gemiye dönsün.',
  'DOOR LOCKS IN': 'KAPI KİLİTLENİYOR',
  'You were locked out. The crew found you at dawn, hurt.': 'Dışarıda kaldın. Ekip seni şafakta, yaralı buldu.',
  'Something closed a door nearby.': 'Yakınlarda bir şey kapıyı kapattı.',
  'The lights just went out. Something did that.': 'Işıklar söndü. Bunu bir şey yaptı.',
  'You are doing great. I raised the next quota to match. You are welcome.': 'Harika gidiyorsunuz. Bir sonraki kotayı buna uydurdum. Rica ederim.',
  'Some food in the ship has spoiled.': 'Gemideki bazı yiyecekler bozuldu.',
  '{name} dropped ▮{v} of loot where they fell. Go get it.': '{name} düştüğü yere ▮{v} değerinde ganimet bıraktı. Gidip al.',
  'The stove is busy.': 'Ocak meşgul.',
  'Only the ship stove cooks now.': 'Artık sadece geminin ocağı pişiriyor.',
  'Backup Drives can not be built on this difficulty. Find them.': 'Bu zorlukta yedek diskler üretilemez. Bul onları.',
  'From quota 3 the {@d} rules apply: less loot, heavier hauls, spoiling food.': 'Kota 3\'ten itibaren {@d} kuralları geçerli: daha az ganimet, ağır yük, bozulan yemek.',
};
const RU = {
  'Difficulty': 'Сложность',
  'Casual': 'Лёгкая',
  'Standard': 'Обычная',
  'Hard': 'Тяжёлая',
  'The old numbers. Relaxed: nothing here gets meaner.': 'Старые числа. Спокойно: ничего не становится злее.',
  'From quota 3: loot worth 20% less, heavier hauls, the ship door warns before it locks, creatures close doors, food spoils.': 'С квоты 3: добыча дешевле на 20%, груз тяжелее, дверь корабля предупреждает перед запиранием, существа закрывают двери, еда портится.',
  'Standard, one notch harder: loot -30%, 2 min lock warning, no campfire cooking, protection drives only from rare drops.': 'Обычная, но жёстче: добыча -30%, предупреждение о замке за 2 мин, без готовки на костре, защитные диски только из редких дропов.',
  'SHIP DOOR LOCKS IN {n} s. Everyone back aboard.': 'ДВЕРЬ КОРАБЛЯ ЗАКРОЕТСЯ ЧЕРЕЗ {n} с. Все на борт.',
  'DOOR LOCKS IN': 'ДВЕРЬ ЗАКРОЕТСЯ ЧЕРЕЗ',
  'You were locked out. The crew found you at dawn, hurt.': 'Вас не пустили на борт. Команда нашла вас на рассвете, раненым.',
  'Something closed a door nearby.': 'Что-то закрыло дверь неподалёку.',
  'The lights just went out. Something did that.': 'Свет погас. Это сделало что-то.',
  'You are doing great. I raised the next quota to match. You are welcome.': 'Вы отлично справляетесь. Я подняла следующую квоту под стать. Не стоит благодарности.',
  'Some food in the ship has spoiled.': 'Часть еды на корабле испортилась.',
  '{name} dropped ▮{v} of loot where they fell. Go get it.': '{name} уронил(а) добычу на ▮{v} там, где упал(а). Заберите её.',
  'The stove is busy.': 'Плита занята.',
  'Only the ship stove cooks now.': 'Теперь готовит только плита корабля.',
  'Backup Drives can not be built on this difficulty. Find them.': 'На этой сложности резервные диски не собрать. Ищите их.',
  'From quota 3 the {@d} rules apply: less loot, heavier hauls, spoiling food.': 'С квоты 3 действуют правила «{@d}»: меньше добычи, тяжёлый груз, портящаяся еда.',
};
addTranslations(TR, 'tr');
addTranslations(RU, 'ru');
export const I18N = { TR, RU };
