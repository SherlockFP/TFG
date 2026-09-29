// [finish] MAPS2 texts, wave 3 (pure data + translations): stateful furniture pools and the challenge room / event strings.
// EN keys -> Turkish (default table) and Russian ('ru'). Imported by maps2_challenge.js / maps2_events.js / maps2_furniture.js and the node test.
import { addTranslations } from '../core/i18n.js';

export const DRAWER_NOTES = [
  'Sticky note: "The password is on the other sticky note."', 'Timesheet: 41 years, 0 days off. Approved.', 'Memo: Moderation is now a 24/7 role. Sleep is optional.',
  'A cracked phone case. Message log: "u there?" x 900.', 'Ticket #4,000,001: "The elevator only goes to floors that are not there."', 'A key card labelled HALVORSEN. It is warm.',
];
export const PC_LOGS = [
  'LOGIN: guest / guest. 3 unread reports. All from you.', 'Inbox (99+): "URGENT: engagement is down 0.02%."', 'A half-written resignation. It stops mid-word: "I quit be".',
  'Browser history: "how to leave the building" x 40.', 'Chat: "Derek, are you still at the party?" - "Yes." - "Derek, it is Tuesday."', 'Recycle Bin (1): the_exit.exe',
];
export const RADIO_STATIC = [
  'Only static. Then, very quietly: "...stay off the feed..."', 'A pirate broadcast reads out quota numbers. They are all yours.', 'Somebody is counting backwards. You never hear zero.',
  'Static. A child asks for the time. It is 03:14.',
];
export const VOICEMAILS = [
  'Voicemail: "Hi, it is Accounts. We are still here. Where are you?"', 'Voicemail: "Your call is important to The Algorithm. Please stay on the line. Forever."',
  'Voicemail: "Do not go to floor 0. Floor 0 is not a floor."', 'Voicemail: a lullaby, hummed out of key.', 'Voicemail: "It is Halvorsen. Stop calling the intercom. That is not me."',
];
export const CH_NAMES = { physics: 'PHYSICS TEST', gamble: 'FATE ROULETTE', arena: 'MODERATION ARENA', puzzle: 'SYNC CHAMBER', treasure: 'TREASURE ROOM', party: 'a party room', laststand: 'a barricaded room', nursery: 'a nursery', shrine: 'a streamer shrine', flooded: 'a flooded room' };

const TR2 = {
  'Sticky note: "The password is on the other sticky note."': 'Yapışkan not: "Şifre diğer yapışkan notta."', 'Timesheet: 41 years, 0 days off. Approved.': 'Puantaj: 41 yıl, 0 gün izin. Onaylandı.',
  'Memo: Moderation is now a 24/7 role. Sleep is optional.': 'Not: Moderasyon artık 7/24 bir görev. Uyku isteğe bağlı.', 'A cracked phone case. Message log: "u there?" x 900.': 'Çatlak bir telefon kılıfı. Mesaj kaydı: "orda mısın?" x 900.',
  'Ticket #4,000,001: "The elevator only goes to floors that are not there."': 'Bilet #4.000.001: "Asansör sadece olmayan katlara gidiyor."', 'A key card labelled HALVORSEN. It is warm.': 'Üstünde HALVORSEN yazan bir kart. Sıcak.',
  'LOGIN: guest / guest. 3 unread reports. All from you.': 'GİRİŞ: misafir / misafir. 3 okunmamış rapor. Hepsi senden.', 'Inbox (99+): "URGENT: engagement is down 0.02%."': 'Gelen kutusu (99+): "ACİL: etkileşim %0,02 düştü."',
  'A half-written resignation. It stops mid-word: "I quit be".': 'Yarım kalmış bir istifa. Kelimenin ortasında bitiyor: "İstifa ede".', 'Browser history: "how to leave the building" x 40.': 'Tarayıcı geçmişi: "binadan nasıl çıkılır" x 40.',
  'Chat: "Derek, are you still at the party?" - "Yes." - "Derek, it is Tuesday."': 'Sohbet: "Derek, hâlâ partide misin?" - "Evet." - "Derek, bugün Salı."', 'Recycle Bin (1): the_exit.exe': 'Geri Dönüşüm Kutusu (1): the_exit.exe',
  'Only static. Then, very quietly: "...stay off the feed..."': 'Sadece parazit. Sonra çok kısık: "...akıştan uzak dur..."', 'A pirate broadcast reads out quota numbers. They are all yours.': 'Korsan bir yayın kota rakamlarını okuyor. Hepsi seninkiler.',
  'Somebody is counting backwards. You never hear zero.': 'Biri geriye sayıyor. Sıfırı hiç duymuyorsun.', 'Static. A child asks for the time. It is 03:14.': 'Parazit. Bir çocuk saati soruyor. 03:14.',
  'Voicemail: "Hi, it is Accounts. We are still here. Where are you?"': 'Sesli mesaj: "Selam, Muhasebe. Hâlâ buradayız. Sen neredesin?"', 'Voicemail: "Your call is important to The Algorithm. Please stay on the line. Forever."': 'Sesli mesaj: "Aramanız Algoritma için önemli. Lütfen hatta kalın. Sonsuza dek."',
  'Voicemail: "Do not go to floor 0. Floor 0 is not a floor."': 'Sesli mesaj: "0. kata gitme. 0. kat bir kat değil."', 'Voicemail: a lullaby, hummed out of key.': 'Sesli mesaj: akortsuz mırıldanan bir ninni.',
  'Voicemail: "It is Halvorsen. Stop calling the intercom. That is not me."': 'Sesli mesaj: "Ben Halvorsen. İnterkomu aramayı bırak. O ben değilim."',
  'Open the drawer [E]': 'Çekmeceyi aç [E]', 'Use the PC [E]': 'Bilgisayarı kullan [E]', 'Tune the radio [E]': 'Radyoyu ayarla [E]', 'Answer the phone [E]': 'Telefona bak [E]', 'Already searched.': 'Zaten arandı.',
  'Empty.': 'Boş.', 'Just junk.': 'Sadece çöp.', 'You find some scrap.': 'Biraz hurda buldun.', 'A dusty note': 'Tozlu bir not', 'The PC hums': 'Bilgisayar uğulduyor', 'Found a wallet file: +{n} credits.': 'Cüzdan dosyası bulundu: +{n} kredi.',
  'Radio': 'Radyo', 'A weak signal points {d} m {dir}: {what}.': 'Zayıf bir sinyal {d} m {dir} yönünü gösteriyor: {what}.', north: 'kuzey', south: 'güney', east: 'doğu', west: 'batı',
  'The phone screams a dial tone. Something heard that.': 'Telefon tiz bir çevir sesi veriyor. Bir şey duydu.', Voicemail: 'Sesli mesaj',
  'PHYSICS TEST': 'FİZİK TESTİ', 'FATE ROULETTE': 'KADER RULETİ', 'MODERATION ARENA': 'MODERASYON ARENASI', 'SYNC CHAMBER': 'SENKRON ODASI', 'TREASURE ROOM': 'HAZİNE ODASI',
  'a party room': 'bir parti odası', 'a barricaded room': 'barikatlı bir oda', 'a nursery': 'bir bebek odası', 'a streamer shrine': 'bir yayıncı tapınağı', 'a flooded room': 'su basmış bir oda',
  'WEIGHT > PLATE': 'AĞIRLIK > PLAKA', 'THE HOUSE WINS?': 'KASA KAZANIR MI?', 'TWO WAVES. NO REFUNDS': 'İKİ DALGA. İADE YOK', 'TWO LEVERS. ONE SECOND.': 'İKİ KOL. BİR SANİYE.', 'TAKE ONE. LEAVE FAST.': 'BİRİNİ AL. HIZLI ÇIK.',
  'Pull the fate lever [E]': 'Kader kolunu çek [E]', 'Fate lever: {c} credits': 'Kader kolu: {c} kredi', 'Not enough credits.': 'Yeterli kredi yok.', 'The lever is jammed for now.': 'Kol şimdilik sıkıştı.', 'Nothing left to gamble.': 'Kumar için bir şey kalmadı.',
  JACKPOT: 'JACKPOT', 'YOU WIN': 'KAZANDIN', LOOT: 'ÖDÜL', 'THE HOUSE WINS': 'KASA KAZANDI', CURSED: 'LANETLENDİN', BLAST: 'PATLAMA', 'Something crawled out of the machines.': 'Makinelerden bir şey süründü.',
  'Start the arena [E]': 'Arenayı başlat [E]', 'ARENA: WAVE {n}': 'ARENA: {n}. DALGA', 'ARENA CLEARED': 'ARENA TEMİZLENDİ', 'ARENA FAILED': 'ARENA BAŞARISIZ', 'The shutters slam shut.': 'Kepenkler kapandı.', 'The shutters rise.': 'Kepenkler yükseliyor.', 'Nobody is left standing.': 'Ayakta kimse kalmadı.',
  'PLATE ACTIVATED': 'PLAKA AKTİF', 'Heavy scrap waits at the yellow square.': 'Ağır hurdalar sarı karede bekliyor.', 'Put enough weight on the plate.': 'Plakaya yeterli ağırlık koy.',
  'Pull the sync lever [E]': 'Senkron kolunu çek [E]', 'CODE REVEALED': 'KOD GÖSTERİLDİ', 'Watch the lamps, then press the colours in order.': 'Lambalara bak, sonra renklere sırayla bas.', 'CODE ACCEPTED': 'KOD KABUL EDİLDİ', 'WRONG CODE': 'YANLIŞ KOD',
  'Press the button [E]': 'Düğmeye bas [E]', 'Reset [E]': 'Sıfırla [E]', 'Pull both levers within a second.': 'İki kolu bir saniye içinde çek.', 'The panel is dark. Sync the levers first.': 'Panel karanlık. Önce kolları senkronla.',
  'THE ROOM GROANS': 'ODA İNLİYOR', 'Take the idol and run.': 'Putu al ve kaç.', 'A passage behind you is sealed!': 'Arkandaki geçit kapandı!', COLLAPSE: 'ÇÖKME', 'A corridor collapsed somewhere in the facility.': 'Tesiste bir koridor çöktü.',
  MIGRATION: 'GÖÇ', 'The creatures are on the move.': 'Yaratıklar hareket halinde.', 'Something big is drawing them to the {where}.': 'Büyük bir şey onları {where} bölgesine çekiyor.',
};
const RU2 = {
  'Sticky note: "The password is on the other sticky note."': 'Стикер: «Пароль на другом стикере».', 'Timesheet: 41 years, 0 days off. Approved.': 'Табель: 41 год, 0 выходных. Одобрено.',
  'Memo: Moderation is now a 24/7 role. Sleep is optional.': 'Записка: модерация теперь 24/7. Сон по желанию.', 'A cracked phone case. Message log: "u there?" x 900.': 'Треснувший чехол. Журнал: «ты тут?» x 900.',
  'Ticket #4,000,001: "The elevator only goes to floors that are not there."': 'Тикет #4 000 001: «Лифт ездит только на несуществующие этажи».', 'A key card labelled HALVORSEN. It is warm.': 'Карта с надписью HALVORSEN. Тёплая.',
  'LOGIN: guest / guest. 3 unread reports. All from you.': 'ВХОД: guest / guest. 3 непрочитанные жалобы. Все от вас.', 'Inbox (99+): "URGENT: engagement is down 0.02%."': 'Входящие (99+): «СРОЧНО: вовлечённость упала на 0,02%».',
  'A half-written resignation. It stops mid-word: "I quit be".': 'Недописанное заявление об уходе. Обрывается: «Я увол».', 'Browser history: "how to leave the building" x 40.': 'История браузера: «как выйти из здания» x 40.',
  'Chat: "Derek, are you still at the party?" - "Yes." - "Derek, it is Tuesday."': 'Чат: «Дерек, ты ещё на вечеринке?» — «Да». — «Дерек, сегодня вторник».', 'Recycle Bin (1): the_exit.exe': 'Корзина (1): the_exit.exe',
  'Only static. Then, very quietly: "...stay off the feed..."': 'Только шум. Потом тихо: «…не заходи в ленту…»', 'A pirate broadcast reads out quota numbers. They are all yours.': 'Пиратская передача зачитывает цифры квоты. Все ваши.',
  'Somebody is counting backwards. You never hear zero.': 'Кто-то считает в обратном порядке. Ноль так и не звучит.', 'Static. A child asks for the time. It is 03:14.': 'Шум. Ребёнок спрашивает время. 03:14.',
  'Voicemail: "Hi, it is Accounts. We are still here. Where are you?"': 'Голосовое: «Привет, это бухгалтерия. Мы всё ещё здесь. А вы где?»', 'Voicemail: "Your call is important to The Algorithm. Please stay on the line. Forever."': 'Голосовое: «Ваш звонок важен для Алгоритма. Оставайтесь на линии. Навсегда».',
  'Voicemail: "Do not go to floor 0. Floor 0 is not a floor."': 'Голосовое: «Не ходи на этаж 0. Этаж 0 — не этаж».', 'Voicemail: a lullaby, hummed out of key.': 'Голосовое: колыбельная, напетая мимо нот.',
  'Voicemail: "It is Halvorsen. Stop calling the intercom. That is not me."': 'Голосовое: «Это Хальворсен. Не звоните на домофон. Это не я».',
  'Open the drawer [E]': 'Открыть ящик [E]', 'Use the PC [E]': 'Использовать ПК [E]', 'Tune the radio [E]': 'Настроить радио [E]', 'Answer the phone [E]': 'Взять трубку [E]', 'Already searched.': 'Уже обыскано.',
  'Empty.': 'Пусто.', 'Just junk.': 'Одна рухлядь.', 'You find some scrap.': 'Нашёл немного лома.', 'A dusty note': 'Пыльная записка', 'The PC hums': 'ПК гудит', 'Found a wallet file: +{n} credits.': 'Найден файл кошелька: +{n} кредитов.',
  Radio: 'Радио', 'A weak signal points {d} m {dir}: {what}.': 'Слабый сигнал указывает {d} м на {dir}: {what}.', north: 'север', south: 'юг', east: 'восток', west: 'запад',
  'The phone screams a dial tone. Something heard that.': 'Телефон орёт гудком. Что-то это услышало.', Voicemail: 'Голосовая почта',
  'PHYSICS TEST': 'ТЕСТ ФИЗИКИ', 'FATE ROULETTE': 'РУЛЕТКА СУДЬБЫ', 'MODERATION ARENA': 'АРЕНА МОДЕРАЦИИ', 'SYNC CHAMBER': 'КАМЕРА СИНХРОНА', 'TREASURE ROOM': 'СОКРОВИЩНИЦА',
  'a party room': 'комната вечеринки', 'a barricaded room': 'забаррикадированная комната', 'a nursery': 'детская', 'a streamer shrine': 'святилище стримера', 'a flooded room': 'затопленная комната',
  'WEIGHT > PLATE': 'ВЕС > ПЛИТА', 'THE HOUSE WINS?': 'ВЫИГРАЕТ КАЗИНО?', 'TWO WAVES. NO REFUNDS': 'ДВЕ ВОЛНЫ. БЕЗ ВОЗВРАТА', 'TWO LEVERS. ONE SECOND.': 'ДВА РЫЧАГА. ОДНА СЕКУНДА.', 'TAKE ONE. LEAVE FAST.': 'ВОЗЬМИ ОДНО. БЕГИ.',
  'Pull the fate lever [E]': 'Дёрнуть рычаг судьбы [E]', 'Fate lever: {c} credits': 'Рычаг судьбы: {c} кредитов', 'Not enough credits.': 'Не хватает кредитов.', 'The lever is jammed for now.': 'Рычаг пока заело.', 'Nothing left to gamble.': 'Играть больше нечем.',
  JACKPOT: 'ДЖЕКПОТ', 'YOU WIN': 'ВЫИГРЫШ', LOOT: 'ДОБЫЧА', 'THE HOUSE WINS': 'КАЗИНО ВЫИГРАЛО', CURSED: 'ПРОКЛЯТИЕ', BLAST: 'ВЗРЫВ', 'Something crawled out of the machines.': 'Из автоматов кто-то выполз.',
  'Start the arena [E]': 'Запустить арену [E]', 'ARENA: WAVE {n}': 'АРЕНА: ВОЛНА {n}', 'ARENA CLEARED': 'АРЕНА ПРОЙДЕНА', 'ARENA FAILED': 'АРЕНА ПРОВАЛЕНА', 'The shutters slam shut.': 'Ставни захлопнулись.', 'The shutters rise.': 'Ставни поднимаются.', 'Nobody is left standing.': 'Никто не устоял.',
  'PLATE ACTIVATED': 'ПЛИТА АКТИВИРОВАНА', 'Heavy scrap waits at the yellow square.': 'Тяжёлый лом ждёт у жёлтого квадрата.', 'Put enough weight on the plate.': 'Положите на плиту достаточно веса.',
  'Pull the sync lever [E]': 'Дёрнуть рычаг синхрона [E]', 'CODE REVEALED': 'КОД ПОКАЗАН', 'Watch the lamps, then press the colours in order.': 'Смотрите на лампы, затем нажимайте цвета по порядку.', 'CODE ACCEPTED': 'КОД ПРИНЯТ', 'WRONG CODE': 'НЕВЕРНЫЙ КОД',
  'Press the button [E]': 'Нажать кнопку [E]', 'Reset [E]': 'Сброс [E]', 'Pull both levers within a second.': 'Дёрните оба рычага за секунду.', 'The panel is dark. Sync the levers first.': 'Панель тёмная. Сначала синхронизируйте рычаги.',
  'THE ROOM GROANS': 'КОМНАТА СТОНЕТ', 'Take the idol and run.': 'Возьмите идола и бегите.', 'A passage behind you is sealed!': 'Проход за вами завалило!', COLLAPSE: 'ОБВАЛ', 'A corridor collapsed somewhere in the facility.': 'Где-то в комплексе обрушился коридор.',
  MIGRATION: 'МИГРАЦИЯ', 'The creatures are on the move.': 'Существа пришли в движение.', 'Something big is drawing them to the {where}.': 'Что-то большое тянет их к: {where}.',
};
addTranslations(TR2);
try { addTranslations(RU2, 'ru'); } catch { /* ru not supported: ignore */ }
