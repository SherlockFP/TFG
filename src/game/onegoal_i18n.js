// onegoal strings (docs/wave8/onegoal.md): English keys, TR + RU tables. Loaded for its side effect.
import { addTranslations } from '../core/i18n.js';

addTranslations({
  'Chatty Algorithm': 'Geveze Algoritma',
  'Off (recommended): at most one Algorithm line every 45 s, one card at a time, quiet during chases. On: the old non-stop commentary.':
    'Kapalı (önerilen): 45 saniyede en fazla bir Algoritma satırı, aynı anda tek kart, kovalamacada sessiz. Açık: eski durmadan konuşan hali.',
  'TAGGED: get out to the ship or kill the camera that tagged you': 'ETİKETLENDİN: dışarı, gemiye dön ya da seni etiketleyen kamerayı yok et',
  'TAGGED: get to the ship ({d} m) or kill the camera that tagged you': 'ETİKETLENDİN: gemiye dön ({d} m) ya da seni etiketleyen kamerayı yok et',
  'Assignment: {text}': 'Görev: {text}',
}, 'tr');
addTranslations({
  'Chatty Algorithm': 'Болтливый Алгоритм',
  'Off (recommended): at most one Algorithm line every 45 s, one card at a time, quiet during chases. On: the old non-stop commentary.':
    'Выкл. (рекомендуется): не больше одной реплики Алгоритма за 45 с, одна карточка за раз, тишина во время погони. Вкл.: старые непрерывные комментарии.',
  'TAGGED: get out to the ship or kill the camera that tagged you': 'ТЕБЯ ПОМЕТИЛИ: выбирайся на корабль или уничтожь камеру, которая тебя пометила',
  'TAGGED: get to the ship ({d} m) or kill the camera that tagged you': 'ТЕБЯ ПОМЕТИЛИ: вернись на корабль ({d} м) или уничтожь камеру, которая тебя пометила',
  'Assignment: {text}': 'Задание: {text}',
}, 'ru');
