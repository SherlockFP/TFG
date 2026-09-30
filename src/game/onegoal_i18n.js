// onegoal strings (docs/wave8/onegoal.md): English keys, TR + RU tables. Loaded for its side effect.
import { addTranslations } from '../core/i18n.js';

addTranslations({
  'Chatty Algorithm': 'Geveze Algoritma',
  'Off (recommended): at most one Algorithm line every 45 s, one card at a time, quiet during chases. On: the old non-stop commentary.':
    'Kapalı (önerilen): 45 saniyede en fazla bir Algoritma satırı, aynı anda tek kart, kovalamacada sessiz. Açık: eski durmadan konuşan hali.',
  'TAGGED: get out to the ship or kill the camera that tagged you': 'ETİKETLENDİN: dışarı, gemiye dön ya da seni etiketleyen kamerayı yok et',
  'TAGGED: get to the ship ({d} m) or kill the camera that tagged you': 'ETİKETLENDİN: gemiye dön ({d} m) ya da seni etiketleyen kamerayı yok et',
  'TAGGED ▮{v} → ▮{n}: get out to the ship or kill the camera that tagged you': 'ETİKETLENDİN ▮{v} → ▮{n}: dışarı, gemiye dön ya da seni etiketleyen kamerayı yok et',
  'TAGGED ▮{v} → ▮{n}: get to the ship ({d} m) or kill the camera': 'ETİKETLENDİN ▮{v} → ▮{n}: gemiye dön ({d} m) ya da kamerayı yok et',
  'Assignment: {text}': 'Görev: {text}',
  '▮{left} still in here · deep room {m} m · leaves {time}': '▮{left} hâlâ içeride · derin oda {m} m · {time}\'de kalkıyor',
  '▮{left} still in here · leaves {time}': '▮{left} hâlâ içeride · {time}\'de kalkıyor',
  '▮{v} → ▮{n} if tagged': '▮{v} → ▮{n} etiketlenirsen',
  '▮{v} → ▮{n} (viewer tax)': '▮{v} → ▮{n} (izleyici vergisi)',
  'CLEAN SHIFT': 'TEMİZ VARDİYA',
  'Nobody was tagged all day: +▮{n} bonus': 'Gün boyu kimse etiketlenmedi: +▮{n} bonus',
  'Nobody was tagged all day.': 'Gün boyu kimse etiketlenmedi.',
}, 'tr');
addTranslations({
  'Chatty Algorithm': 'Болтливый Алгоритм',
  'Off (recommended): at most one Algorithm line every 45 s, one card at a time, quiet during chases. On: the old non-stop commentary.':
    'Выкл. (рекомендуется): не больше одной реплики Алгоритма за 45 с, одна карточка за раз, тишина во время погони. Вкл.: старые непрерывные комментарии.',
  'TAGGED: get out to the ship or kill the camera that tagged you': 'ТЕБЯ ПОМЕТИЛИ: выбирайся на корабль или уничтожь камеру, которая тебя пометила',
  'TAGGED: get to the ship ({d} m) or kill the camera that tagged you': 'ТЕБЯ ПОМЕТИЛИ: вернись на корабль ({d} м) или уничтожь камеру, которая тебя пометила',
  'TAGGED ▮{v} → ▮{n}: get out to the ship or kill the camera that tagged you': 'ПОМЕЧЕН ▮{v} → ▮{n}: выбирайся на корабль или уничтожь камеру, что тебя пометила',
  'TAGGED ▮{v} → ▮{n}: get to the ship ({d} m) or kill the camera': 'ПОМЕЧЕН ▮{v} → ▮{n}: вернись на корабль ({d} м) или уничтожь камеру',
  'Assignment: {text}': 'Задание: {text}',
  '▮{left} still in here · deep room {m} m · leaves {time}': '▮{left} ещё внутри · дальняя комната {m} м · отлёт в {time}',
  '▮{left} still in here · leaves {time}': '▮{left} ещё внутри · отлёт в {time}',
  '▮{v} → ▮{n} if tagged': '▮{v} → ▮{n} при пометке',
  '▮{v} → ▮{n} (viewer tax)': '▮{v} → ▮{n} (налог зрителей)',
  'CLEAN SHIFT': 'ЧИСТАЯ СМЕНА',
  'Nobody was tagged all day: +▮{n} bonus': 'Весь день никого не помечали: бонус +▮{n}',
  'Nobody was tagged all day.': 'Весь день никого не помечали.',
}, 'ru');
