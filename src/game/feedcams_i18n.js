// feedcams strings: [English key, Turkish, Russian]. docs/wave8/feedcams.md. Loaded for its side effect (addTranslations).
import { addTranslations } from '../core/i18n.js';

const ROWS = [
  ['That red light is a camera. The cone on the floor is what it sees. Stay out of it, or you go live.', 'O kırmızı ışık bir kamera. Yerdeki koni onun gördüğü alan. Girme, yoksa yayına çıkarsın.', 'Красный огонёк - это камера. Конус на полу - её поле зрения. Не заходите, иначе окажетесь в эфире.'],
  ['Camera lock. You have three seconds before the stream goes live. Break line of sight.', 'Kamera kilitlendi. Yayın açılmadan üç saniyen var. Görüş hattını kır.', 'Камера захватила вас. Три секунды до эфира. Разорвите линию видимости.'],
  ['You are ON AIR. Scrap you carry to the ship now pays a viewer tax. Cut the feed, smash a lens or spray it.', 'YAYINDASIN. Gemiye taşıdığın hurdadan izleyici vergisi kesilir. Yayını kes, merceği kır ya da boyayla kapat.', 'Вы В ЭФИРЕ. С хлама, что донесёте до корабля, снимут налог зрителей. Отключите трансляцию, разбейте или закрасьте линзу.'],
  ['Blind spot: right under a camera, behind walls, doors and crates. Hug the wall and slip past.', 'Kör nokta: kameranın hemen altı, duvarların, kapıların ve sandıkların arkası. Duvara yaslan ve sıyrıl.', 'Слепая зона: прямо под камерой, за стенами, дверями и ящиками. Прижмитесь к стене и проскользните.'],
  ['ON AIR - you are live', 'YAYINDASIN', 'ВЫ В ЭФИРЕ'],
  ['{name} went live', '{name} yayına çıktı', '{name} вышел в эфир'],
  ['Clean dodge. The stream lagged behind you.', 'Temiz kaçış. Yayın seni yakalayamadı.', 'Чистый уход. Трансляция не успела.'],
  ['The Algorithm took its cut: -▮{n} viewer tax', 'Algoritma payını aldı: -▮{n} izleyici vergisi', 'Алгоритм взял свою долю: -▮{n} налог зрителей'],
  ['Viewer tax on this haul: -▮{n} (scrap carried while ON AIR)', 'Bu ganimette izleyici vergisi: -▮{n} (yayındayken taşınan hurda)', 'Налог зрителей с этой добычи: -▮{n} (хлам, вынесенный в эфире)'],
  ['ON AIR', 'YAYINDA', 'В ЭФИРЕ'],
  ['VIEWER TAX', 'İZLEYİCİ VERGİSİ', 'НАЛОГ ЗРИТЕЛЕЙ'],
  ['{n} items carried out while ON AIR', '{n} eşya yayındayken çıkarıldı', '{n} предм. вынесено в эфире'],
  ['live {n} s', '{n} sn yayında', 'в эфире {n} с'],
  ['OFF THE FEED', 'YAYIN DIŞI', 'ВНЕ ЭФИРА'],
  ['Went live {n}x but kept the haul clean.', '{n} kez yayına çıktın ama ganimet temiz kaldı.', 'Выходили в эфир {n} раз, но добычу сохранили.'],
  ['Never went live. The Algorithm saw nothing.', 'Hiç yayına çıkmadın. Algoritma hiçbir şey görmedi.', 'Ни разу не были в эфире. Алгоритм ничего не увидел.'],
  ['The feed is cut. Every camera goes dark for a while.', 'Yayın kesildi. Bütün kameralar bir süre kapalı.', 'Трансляция отключена. Все камеры на время слепы.'],
  ["You're live. Chat is loving it. Try not to die on camera.", 'Yayındasın. Sohbet bayıldı. Kamera önünde ölmemeye çalış.', 'Вы в эфире. Чату нравится. Постарайтесь не умереть на камеру.'],
  ['Your numbers are through the roof. I am sending some fans.', 'Rakamların tavan yaptı. Birkaç hayran gönderiyorum.', 'Ваши цифры зашкаливают. Отправляю несколько фанатов.'],
];

const TR = {}, RU = {};
for (const [en, tr, ru] of ROWS) { TR[en] = tr; RU[en] = ru; }
addTranslations(TR, 'tr');
addTranslations(RU, 'ru');
export const FC_KEYS = ROWS.map((r) => r[0]);
